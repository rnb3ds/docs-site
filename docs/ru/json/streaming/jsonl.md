---
sidebar_label: "Обработчик JSONL"
title: "JSONL обработчик - CyberGo JSON | Справочник API"
description: "Обработчик JSONL CyberGo JSON: StreamJSONL, JSONLWriter, StreamLinesInto[T], ParseJSONL и ToJSONL для чтения и записи JSON Lines в Go."
sidebar_position: 3
---

# Обработчик JSONL

JSONL (JSON Lines) или NDJSON (Newline Delimited JSON) — это формат, в котором каждая строка содержит один объект JSON. Библиотека предоставляет полный набор инструментов для работы с JSONL через методы `Processor` и функции уровня пакета.

## Спецификация формата

```json
{"id":1,"name":"Alice"}
{"id":2,"name":"Bob"}
{"id":3,"name":"Charlie"}
```

- Каждая строка является допустимым JSON-значением
- Строки разделены `\n`
- Последняя строка может содержать или не содержать символ новой строки

---

## Методы Processor для JSONL

Функциональность JSONL предоставляется через методы `Processor`. Всего 11 потоковых/функциональных методов; ориентир для выбора:

| Метод | Форма | Сценарий применения |
|------|------|------|
| `StreamJSONL` | построчный callback | базовая потоковая обработка, построчное потребление `IterableValue` |
| `StreamJSONLParallel` | параллельный callback | CPU-интенсивные преобразования, несколько worker'ов |
| `StreamJSONLParallelWithContext` | параллельный callback + ctx | параллельная обработка с таймаутом/отменой |
| `StreamJSONLChunked` | поблочный callback | потребление порциями, например пакетная загрузка в БД |
| `StreamJSONLFile` | построчный callback (файл) | чтение `.jsonl`-файла напрямую (с проверкой безопасности пути) |
| `ForeachJSONL` | построчный callback | псевдоним `StreamJSONL` |
| `MapJSONL` | отображение со сбором | каждая строка отображается в новое значение, возвращается `[]any` |
| `FilterJSONL` | предикат со сбором | фильтрация строк по условию |
| `ReduceJSONL` | агрегация | свёртка: суммы, подсчёты и т. п. |
| `CollectJSONL` | полный сбор | одновременное извлечение всех строк |
| `FirstJSONL` | предикат + короткое замыкание | остановка на первом совпадении (внутри эквивалент `Break`) |

### StreamJSONL

Сигнатура: `func (p *Processor) StreamJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) error) error`

Потоковая обработка данных JSONL, возвращает `IterableValue` для каждой строки.

**Параметры**

| Название | Тип | Описание |
|------|------|------|
| `reader` | `io.Reader` | Источник данных |
| `fn` | `func(lineNum int, item *IterableValue) error` | Обратный вызов обработки |

**Возвращаемые значения обратного вызова**

| Возвращаемое значение | Описание |
|--------|------|
| `nil` | Продолжить обработку следующей строки |
| `item.Break()` | Остановить итерацию без ошибки |
| другое `error` | Остановить итерацию и вернуть ошибку |

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

file, _ := os.Open("data.jsonl")
defer file.Close()

err = p.StreamJSONL(file, func(lineNum int, item *json.IterableValue) error {
	name := item.GetString("name")
	age := item.GetInt("age")
	fmt.Printf("Строка %d: name=%s, age=%d\n", lineNum, name, age)
	return nil // Продолжить обработку
	// return item.Break() // Остановить итерацию
})
```

### StreamJSONLParallel

Сигнатура: `func (p *Processor) StreamJSONLParallel(reader io.Reader, workers int, fn func(lineNum int, item *IterableValue) error) error`

Параллельная обработка данных JSONL с использованием пула воркеров.

**Параметры**

| Название | Тип | Описание |
|------|------|------|
| `reader` | `io.Reader` | Источник данных |
| `workers` | `int` | Количество рабочих горутин (при <=0 по умолчанию 4) |
| `fn` | `func(lineNum int, item *IterableValue) error` | Обратный вызов обработки |

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

err = p.StreamJSONLParallel(file, 8, func(lineNum int, item *json.IterableValue) error {
	// Интенсивная обработка на CPU
	return processItem(item)
})
```

::: tip Совет по производительности
Для CPU-интенсивных операций (таких как преобразование данных, вычисления) параллельная обработка может значительно повысить производительность. Для I/O-интенсивных операций рекомендуется однопоточная обработка.
:::

Возврат `item.Break()` из callback — это чистая остановка: сканирование и все worker'ы завершаются досрочно, метод возвращает `nil`; при возврате другой ошибки метод завершается с этой ошибкой. Паника в callback восстанавливается и превращается в ошибку, не роняя процесс.

### StreamJSONLParallelWithContext

Сигнатура: `func (p *Processor) StreamJSONLParallelWithContext(ctx context.Context, reader io.Reader, workers int, fn func(lineNum int, item *IterableValue) error) error`

Параллельная обработка данных JSONL с контекстом. Поддерживает таймаут и отмену операции.

**Параметры**

| Название | Тип | Описание |
|------|------|------|
| `ctx` | `context.Context` | Контекст для отмены и таймаута |
| `reader` | `io.Reader` | Источник данных |
| `workers` | `int` | Количество рабочих горутин (при <=0 по умолчанию 4) |
| `fn` | `func(lineNum int, item *IterableValue) error` | Обратный вызов обработки |

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()

err = p.StreamJSONLParallelWithContext(ctx, file, 8, func(lineNum int, item *json.IterableValue) error {
	// Параллельная обработка с поддержкой отмены
	return processItem(item)
})
```

### StreamJSONLChunked

Сигнатура: `func (p *Processor) StreamJSONLChunked(reader io.Reader, chunkSize int, fn func(chunk []*IterableValue) error) error`

Пакетная обработка данных JSONL, обработка указанного количества элементов за раз.

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

// По 1000 записей в пакете
err = p.StreamJSONLChunked(file, 1000, func(chunk []*json.IterableValue) error {
	// Массовая запись в базу данных
	for _, item := range chunk {
		processItem(item)
	}
	return nil
})
```

::: warning Возврат объектов в пул после callback
`StreamJSONLChunked` **после возврата callback каждой порции** возвращает `IterableValue` этой порции в пул объектов (внутренние данные обнуляются). Выполняйте запись в БД или извлечение нужных полей внутри callback и не удерживайте элементы `chunk` между вызовами. `StreamJSONL` (и построенные на нём методы сбора `CollectJSONL`/`FilterJSONL`/`FirstJSONL` и др.) ничего не возвращает в пул — возвращённые элементы можно безопасно сохранять.
:::

### StreamJSONLFile

Сигнатура: `func (p *Processor) StreamJSONLFile(filename string, fn func(lineNum int, item *IterableValue) error) error`

Прямая обработка файла JSONL.

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

err = p.StreamJSONLFile("data.jsonl", func(lineNum int, item *json.IterableValue) error {
	fmt.Printf("Строка %d: %v\n", lineNum, item.GetData())
	return nil
})
```

---

## Расширенные операции JSONL

### MapJSONL

Сигнатура: `func (p *Processor) MapJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) (any, error)) ([]any, error)`

Преобразует данные JSONL в новый формат.

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

result, err := p.MapJSONL(file, func(lineNum int, item *json.IterableValue) (any, error) {
	return map[string]any{
		"name": item.GetString("name"),
		"age":  item.GetInt("age"),
	}, nil
})
```

### ReduceJSONL

Сигнатура: `func (p *Processor) ReduceJSONL(reader io.Reader, initial any, fn func(acc any, item *IterableValue) any) (any, error)`

Агрегирует данные JSONL в единый результат.

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

// Подсчёт суммы возрастов
totalAge, err := p.ReduceJSONL(file, 0, func(acc any, item *json.IterableValue) any {
	return acc.(int) + item.GetInt("age")
})
```

### FilterJSONL

Сигнатура: `func (p *Processor) FilterJSONL(reader io.Reader, predicate func(item *IterableValue) bool) ([]*IterableValue, error)`

Фильтрует данные JSONL, возвращает элементы, удовлетворяющие условию.

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

// Фильтрация взрослых
adults, err := p.FilterJSONL(file, func(item *json.IterableValue) bool {
	return item.GetInt("age") >= 18
})
```

### CollectJSONL

Сигнатура: `func (p *Processor) CollectJSONL(reader io.Reader) ([]*IterableValue, error)`

Собирает все элементы JSONL в срез.

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

items, err := p.CollectJSONL(file)
for _, item := range items {
	fmt.Println(item.GetString("name"))
}
```

### FirstJSONL

Сигнатура: `func (p *Processor) FirstJSONL(reader io.Reader, predicate func(item *IterableValue) bool) (*IterableValue, bool, error)`

Возвращает первый элемент, удовлетворяющий условию.

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

user, found, err := p.FirstJSONL(file, func(item *json.IterableValue) bool {
	return item.GetString("name") == "Alice"
})
if found {
	fmt.Println("Найден:", user.GetString("name"))
}
```

### ForeachJSONL

Сигнатура: `func (p *Processor) ForeachJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) error) error`

Итерация по данным JSONL (псевдоним для StreamJSONL).

---

## Конфигурация JSONL

Конфигурация JSONL интегрирована в структуру `Config`:

```go
cfg := json.DefaultConfig()
cfg.JSONLBufferSize = 128 * 1024       // Размер буфера (по умолчанию 64КБ)
cfg.JSONLMaxLineSize = 2 * 1024 * 1024 // Максимальный размер строки (по умолчанию 1МБ)
cfg.JSONLSkipEmpty = true              // Пропускать пустые строки (по умолчанию true)
cfg.JSONLSkipComments = true           // Пропускать строки с комментариями (по умолчанию false)
cfg.JSONLContinueOnErr = true          // Продолжать при ошибке парсинга (по умолчанию false)
cfg.JSONLWorkers = 8                   // Количество параллельных обработчиков (по умолчанию 4)
cfg.JSONLChunkSize = 500               // Размер чанка (по умолчанию 1000)
cfg.JSONLMaxMemory = 200 * 1024 * 1024 // Максимальная память (по умолчанию 100МБ)

p, err := json.New(cfg)
if err != nil {
	panic(err)
}
```

Область действия и приоритет полей:

- **`JSONLMaxLineSize`**: верхний предел размера одной строки в байтах. Серия `StreamJSONL`, `NDJSONProcessor` и `StreamLinesInto` используют его для ограничения scanner; при превышении возвращается ошибка вида `bufio.ErrTooLong`. Цепочка запасных значений: `JSONLMaxLineSize` → `MaxJSONSize` → 100 МБ (`NDJSONProcessor`).
- **`JSONLMaxMemory`**: верхний предел общего числа байтов при потоковой обработке (при превышении — ошибка и остановка); цепочка: `JSONLMaxMemory` → `MaxMemory`.
- **`MaxNestingDepthSecurity`**: все потоковые JSONL-точки входа проверяют глубину вложенности каждой строки **до** её разбора, предотвращая переполнение стека из-за глубокой вложенности.
- **`JSONLContinueOnErr`**: действует только в `NDJSONProcessor` (`ProcessFile`/`ProcessReader`) и `StreamLinesInto` — испорченные строки пропускаются и обработка продолжается; серия `StreamJSONL` при ошибке разбора завершается немедленно.
- **`JSONLWorkers`/`JSONLChunkSize`**: участвуют в валидации конфигурации (значения зажимаются в диапазоны 1–64 / 100–10000), но параметр `workers` у `StreamJSONLParallel` и `chunkSize` у `StreamJSONLChunked` при явной передаче имеют приоритет.
- `Config.Validate` зажимает выходящие за границы значения обратно в допустимый диапазон; детали корректировки можно посмотреть через `ValidateWithWarnings`.

---

## JSONLWriter

Модуль записи JSONL используется для записи данных в формате JSON Lines.

### NewJSONLWriter

Сигнатура: `func NewJSONLWriter(writer io.Writer, cfg ...Config) *JSONLWriter`

Создаёт модуль записи JSONL. Поддерживает необязательный параметр конфигурации.

```go
file, _ := os.Create("output.jsonl")
defer file.Close()

// С конфигурацией по умолчанию
writer := json.NewJSONLWriter(file)

// С пользовательской конфигурацией
cfg := json.DefaultConfig()
cfg.EscapeHTML = true
writer = json.NewJSONLWriter(file, cfg)
```

### Write

Сигнатура: `func (w *JSONLWriter) Write(data any) error`

Записывает одно JSON-значение как строку (результат кодирования + `\n`). HTML-экранирование следует заданному при конструировании `Config.EscapeHTML` (по умолчанию `true`).

```go
err := writer.Write(map[string]any{
	"id":   1,
	"name": "Alice",
})
// Записано: {"id":1,"name":"Alice"}\n
```

::: tip Ошибки кэшируются
Как только `Write`/`WriteRaw` завершается ошибкой, она кэшируется в writer, и **все последующие вызовы записи сразу возвращают ту же ошибку**. После пакетной записи достаточно один раз проверить [`Err`](#err), проверять каждый вызов не нужно.
:::

### WriteAll

Сигнатура: `func (w *JSONLWriter) WriteAll(data []any) error`

Записывает несколько JSON-значений, каждое как отдельную строку.

```go
items := []any{
	map[string]any{"id": 1, "name": "Alice"},
	map[string]any{"id": 2, "name": "Bob"},
	map[string]any{"id": 3, "name": "Charlie"},
}

err := writer.WriteAll(items)
```

### WriteRaw

Сигнатура: `func (w *JSONLWriter) WriteRaw(line []byte) error`

Записывает уже закодированную исходную JSON-строку, пропуская повторное кодирование. Если в конце строки **нет** перевода строки, он добавляется автоматически; если есть — строка записывается как есть.

```go
err := writer.WriteRaw([]byte(`{"id":1,"name":"raw"}`))
// Записано: {"id":1,"name":"raw"}\n
```

### Err

Сигнатура: `func (w *JSONLWriter) Err() error`

Возвращает ошибку, возникшую в процессе записи.

```go
if err := writer.Err(); err != nil {
	fmt.Printf("Ошибка записи: %v\n", err)
}
```

### Stats

Сигнатура: `func (w *JSONLWriter) Stats() JSONLStats`

Получает статистику записи.

```go
stats := writer.Stats()
fmt.Printf("Записано %d строк, %d байт\n", stats.LinesProcessed, stats.BytesWritten)
```

**Структура JSONLStats**:

```go
type JSONLStats struct {
	LinesProcessed int64 // Количество обработанных строк
	BytesWritten   int64 // Количество записанных байт
}
```

| Поле | Значение |
|------|------|
| `LinesProcessed` | число строк, успешно записанных через `Write`/`WriteAll`/`WriteRaw` |
| `BytesWritten` | суммарное число записанных байт, **включая перевод строки в конце каждой строки** |

Например, после `Write` строки `{"id":1}` (9 байт) `Stats()` вернёт `LinesProcessed=1` и `BytesWritten=10`.

---

## NDJSONProcessor

Специализированный обработчик NDJSON-файлов для типа `map[string]any`. Отличия от `StreamJSONL`: callback напрямую получает `map[string]any` (без косвенного доступа через `IterableValue`), а пустые строки пропускаются **всегда**; не зависит от `Processor` — создавать экземпляр не нужно. Подходит для простого построчного потребления объектов; если нужны типизированный доступ, параллельность или функциональная композиция — используйте серию `StreamJSONL`.

Обе точки входа имеют встроенную защиту:

- **Проверка глубины вложенности каждой строки**: перед разбором каждая строка проверяется по `MaxNestingDepthSecurity` (по умолчанию 200) — защита от переполнения стека глубокой вложенностью;
- **Предел размера одной строки**: `JSONLMaxLineSize` (запасные значения `MaxJSONSize` → 100 МБ);
- **Предел общего объёма**: `JSONLMaxMemory` (запасное `MaxMemory`); при превышении обработка прекращается;
- **Устойчивость к ошибкам**: при `JSONLContinueOnErr=true` строки с ошибкой разбора пропускаются и обработка продолжается;
- **Проверка пути**: `ProcessFile` выполняет для пути файла проверки безопасности (path traversal и др.);
- **Восстановление после паники в callback**: паника callback превращается в ошибку и не роняет процесс.

### NewNDJSONProcessor

Сигнатура: `func NewNDJSONProcessor(cfg ...Config) *NDJSONProcessor`

Создаёт обработчик NDJSON. Поддерживает необязательный параметр конфигурации.

```go
// С конфигурацией по умолчанию
np := json.NewNDJSONProcessor()

// С пользовательской конфигурацией
cfg := json.DefaultConfig()
cfg.JSONLBufferSize = 128 * 1024
np = json.NewNDJSONProcessor(cfg)
```

### ProcessFile

Сигнатура: `func (np *NDJSONProcessor) ProcessFile(filename string, fn func(lineNum int, obj map[string]any) error) error`

Обрабатывает файл NDJSON.

```go
err := np.ProcessFile("data.ndjson", func(lineNum int, obj map[string]any) error {
	fmt.Printf("[%d] ID: %v\n", lineNum, obj["id"])
	return nil
})
```

### ProcessReader

Сигнатура: `func (np *NDJSONProcessor) ProcessReader(reader io.Reader, fn func(lineNum int, obj map[string]any) error) error`

Обрабатывает NDJSON из Reader.

```go
err := np.ProcessReader(file, func(lineNum int, obj map[string]any) error {
	return nil
})
```

---

## Функции уровня пакета

Все функции обработки JSONL предоставляют версии уровня пакета с сигнатурами, идентичными соответствующим [методам Processor](../api-reference/processor/jsonl). Внутри они используют глобальный Processor по умолчанию, поэтому вручную создавать экземпляр не требуется.

::: tip Подсказка
Функции уровня пакета подходят для однократной обработки. Если требуется вызывать их многократно в цикле или совместно использовать конфигурацию, рекомендуется создать выделенный `Processor` ([`json.New()`](../api-reference/processor/)) для повторного использования кэша.
:::

### StreamJSONL

Сигнатура: `func StreamJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) error, cfg ...Config) error`

Потоковая построчная обработка JSONL: каждая строка разбирается в `IterableValue`, после чего вызывается callback.

### StreamJSONLParallel

Сигнатура: `func StreamJSONLParallel(reader io.Reader, workers int, fn func(lineNum int, item *IterableValue) error, cfg ...Config) error`

Обработка JSONL с использованием `workers` параллельных горутин.

### StreamJSONLParallelWithContext

Сигнатура: `func StreamJSONLParallelWithContext(ctx context.Context, reader io.Reader, workers int, fn func(lineNum int, item *IterableValue) error, cfg ...Config) error`

Параллельная обработка JSONL с поддержкой отмены контекста.

### StreamJSONLChunked

Сигнатура: `func StreamJSONLChunked(reader io.Reader, chunkSize int, fn func(chunk []*IterableValue) error, cfg ...Config) error`

Пакетная обработка JSONL порциями по `chunkSize`; каждая порция передаётся в callback как `[]*IterableValue`.

### ForeachJSONL

Сигнатура: `func ForeachJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) error, cfg ...Config) error`

Перебор JSONL с вызовом callback для каждой строки.

### MapJSONL

Сигнатура: `func MapJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) (any, error), cfg ...Config) ([]any, error)`

Преобразование каждой строки в новое значение и возврат среза результатов.

### ReduceJSONL

Сигнатура: `func ReduceJSONL(reader io.Reader, initial any, fn func(acc any, item *IterableValue) any, cfg ...Config) (any, error)`

Свёртка JSONL; `initial` — начальное значение аккумулятора.

### FilterJSONL

Сигнатура: `func FilterJSONL(reader io.Reader, predicate func(item *IterableValue) bool, cfg ...Config) ([]*IterableValue, error)`

Фильтрация JSONL по предикату; возвращает совпадающие элементы.

### StreamJSONLFile

Сигнатура: `func StreamJSONLFile(filename string, fn func(lineNum int, item *IterableValue) error, cfg ...Config) error`

Потоковая обработка всего файла JSONL.

```go
err := json.StreamJSONLFile("data.jsonl", func(lineNum int, item *json.IterableValue) error {
	fmt.Printf("Строка %d: %v\n", lineNum, item.GetData())
	return nil
})
```

### CollectJSONL

Сигнатура: `func CollectJSONL(reader io.Reader, cfg ...Config) ([]*IterableValue, error)`

Чтение всех строк JSONL и сборка их в срез.

### FirstJSONL

Сигнатура: `func FirstJSONL(reader io.Reader, predicate func(item *IterableValue) bool, cfg ...Config) (*IterableValue, bool, error)`

Возвращает первый элемент, удовлетворяющий предикату; второе возвращаемое значение указывает, было ли найдено совпадение.

### StreamLinesInto[T]

Сигнатура: `func StreamLinesInto[T any](reader io.Reader, fn func(lineNum int, data T) error, cfg ...Config) ([]T, error)`

Потоковое чтение JSONL с построчной обработкой.

```go
type User struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

// С конфигурацией по умолчанию
entries, err := json.StreamLinesInto[User](file, func(lineNum int, user User) error {
	fmt.Printf("Обработка: %s\n", user.Name)
	return nil
})

// С пользовательской конфигурацией
cfg := json.DefaultConfig()
cfg.JSONLSkipComments = true
entries, err = json.StreamLinesInto[User](file, func(lineNum int, user User) error {
	return nil
}, cfg)
```

Семантика возвращаемых значений:

- возвращаемый `[]T` **накапливает только успешно разобранные строки** — строки, обработанные `fn`, добавляются в результирующий срез;
- при ошибке разбора строки без включённого `JSONLContinueOnErr` обработка немедленно прекращается: возвращается `nil` и ошибка с номером строки (`line N: ...`);
- при `JSONLContinueOnErr=true` испорченные строки пропускаются (не попадают в результат, `fn` для них не вызывается) и обработка продолжается;
- при возврате ошибки из `fn` обработка немедленно прекращается и ошибка возвращается как есть;
- при превышении `JSONLMaxLineSize` одной строкой обработка завершается с `bufio.ErrTooLong`.

### ParseJSONL

Сигнатура: `func ParseJSONL(data []byte, cfg ...Config) ([]any, error)`

Разбирает срез байтов JSONL.

```go
jsonl := `{"name":"Alice"}
{"name":"Bob"}`
results, err := json.ParseJSONL([]byte(jsonl))
```

### ToJSONL

Сигнатура: `func ToJSONL(data []any, cfg ...Config) ([]byte, error)`

Преобразует в срез байтов JSONL.

```go
items := []any{
	map[string]any{"id": 1},
	map[string]any{"id": 2},
}
jsonl, err := json.ToJSONL(items)
```

### ToJSONLString

Сигнатура: `func ToJSONLString(data []any, cfg ...Config) (string, error)`

Преобразует в строку JSONL.

```go
jsonlStr, err := json.ToJSONLString(items)
```

---

## Полные примеры

### Чтение большого файла JSONL

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"os"
)

type LogEntry struct {
	Time    string `json:"time"`
	Level   string `json:"level"`
	Message string `json:"message"`
}

func main() {
	file, err := os.Open("logs.jsonl")
	if err != nil {
		panic(err)
	}
	defer file.Close()

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	count := 0
	err = p.StreamJSONL(file, func(lineNum int, item *json.IterableValue) error {
		count++
		if item.GetString("level") == "error" {
			fmt.Printf("Ошибка: %s\n", item.GetString("message"))
		}
		return nil
	})

	if err != nil {
		fmt.Printf("Ошибка: %v\n", err)
	}

	fmt.Printf("Всего обработано %d строк\n", count)
}
```

### Запись файла JSONL

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"os"
)

func main() {
	file, err := os.Create("output.jsonl")
	if err != nil {
		panic(err)
	}
	defer file.Close()

	writer := json.NewJSONLWriter(file)

	for i := 0; i < 10; i++ {
		if err := writer.Write(map[string]any{
			"id":    i,
			"value": fmt.Sprintf("item-%d", i),
		}); err != nil {
			panic(err)
		}
	}

	stats := writer.Stats()
	fmt.Printf("Записано байт: %d\n", stats.BytesWritten)
}
```

### Параллельная обработка больших файлов

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"os"
	"sync/atomic"
)

func main() {
	file, err := os.Open("large.jsonl")
	if err != nil {
		panic(err)
	}
	defer file.Close()

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	var count int64
	err = p.StreamJSONLParallel(file, 8, func(lineNum int, item *json.IterableValue) error {
		atomic.AddInt64(&count, 1)
		return nil
	})

	if err != nil {
		panic(err)
	}

	fmt.Printf("Параллельно обработано %d строк\n", count)
}
```

---

## См. также

- [Обработка больших файлов](./large-files) — руководство и справочник API по большим файлам
- [Итераторы](../api-reference/iterator) — API итеративного обхода
