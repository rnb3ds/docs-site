---
sidebar_label: "JSONL"
title: "Функции обработки JSONL - CyberGo JSON | Справочник API"
description: "Функции JSONL CyberGo JSON: ParseJSONL/ToJSONL/ToJSONLString, потоковые StreamJSONL/ForeachJSONL, StreamLinesInto[T] и NewJSONLWriter."
sidebar_position: 8
---

# Функции обработки JSONL

Функции обработки JSONL (JSON Lines) пакета json: парсинг, потоковое чтение, преобразование и запись JSON-данных с разделением строками.

::: tip Полное руководство
Хотите разобраться в концепциях JSONL/NDJSON, режимах потоковой обработки и практическом применении? Обратитесь к полному руководству [Обработчики JSONL](../../streaming/jsonl).
:::

## Функции обработки JSONL

JSONL (JSON Lines) — формат JSON с разделением строками: по одному независимому JSON-объекту в каждой строке.

### ParseJSONL

Сигнатура: `func ParseJSONL(data []byte, cfg ...Config) ([]any, error)`

Парсит данные JSONL (JSON с разделением строками).

**Параметры**

| Имя | Тип | Обязателен | Описание |
|------|------|------|------|
| `data` | `[]byte` | да | Байты JSONL |
| `cfg` | `Config` | нет | Необязательная конфигурация |

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	jsonl := `{"name":"Alice"}
{"name":"Bob"}
{"name":"Charlie"}`
	results, err := json.ParseJSONL([]byte(jsonl))
	if err != nil {
		panic(err)
	}
	for i, r := range results {
		fmt.Printf("[%d] %v\n", i, r)
	}
}
```

### StreamLinesInto

Сигнатура: `func StreamLinesInto[T any](reader io.Reader, fn func(lineNum int, data T) error, cfg ...Config) ([]T, error)`

Поточно читает данные JSONL из io.Reader и обрабатывает каждую строку через колбэк. Рекомендуемый обобщённый способ работы с JSONL.

**Параметры**

| Имя | Тип | Обязателен | Описание |
|------|------|------|------|
| `reader` | `io.Reader` | да | Источник данных |
| `fn` | `func(lineNum int, data T) error` | да | Колбэк обработки (получает номер строки и данные) |
| `cfg` | `Config` | нет | Необязательная конфигурация |

**Возвращаемые значения**

| Тип | Описание |
|------|------|
| `[]T` | Срез всех обработанных результатов |
| `error` | Информация об ошибке |

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"strings"
)

type User struct {
	Name string `json:"name"`
}

func main() {
	src := `{"name":"Alice"}
{"name":"Bob"}`

	// Базовое использование
	results, err := json.StreamLinesInto[User](strings.NewReader(src), func(lineNum int, user User) error {
		fmt.Printf("Строка %d: пользователь %s\n", lineNum, user.Name)
		return nil // Возврат error может прервать обработку
	})
	if err != nil {
		panic(err)
	}
	fmt.Printf("Всего обработано %d записей\n", len(results))
}
```

### ToJSONL

Сигнатура: `func ToJSONL(data []any, cfg ...Config) ([]byte, error)`

Преобразует срез данных в формат JSONL.

**Параметры**

| Имя | Тип | Обязателен | Описание |
|------|------|------|------|
| `data` | `[]any` | да | Срез данных |
| `cfg` | `Config` | нет | Необязательная конфигурация |

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	items := []any{
		map[string]any{"name": "Alice"},
		map[string]any{"name": "Bob"},
	}
	jsonl, err := json.ToJSONL(items)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(jsonl))
	// {"name":"Alice"}
	// {"name":"Bob"}
}
```

### ToJSONLString

Сигнатура: `func ToJSONLString(data []any, cfg ...Config) (string, error)`

Преобразует срез данных в строку JSONL.

**Параметры**

| Имя | Тип | Обязателен | Описание |
|------|------|------|------|
| `data` | `[]any` | да | Срез данных |
| `cfg` | `Config` | нет | Необязательная конфигурация |

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	items := []any{
		map[string]any{"name": "Alice"},
		map[string]any{"name": "Bob"},
	}
	jsonlStr, err := json.ToJSONLString(items)
	if err != nil {
		panic(err)
	}
	fmt.Println(jsonlStr)
}
```

## Функции потоковой обработки JSONL (уровня пакета)

Пакет json предоставляет удобные функции уровня пакета для потоковой обработки JSONL; их сигнатуры совпадают с соответствующими методами Processor и дополнительно принимают необязательный хвостовой параметр `cfg ...Config`. Внутри используется глобальный Processor, кэшируемый по `cfg`, поэтому вручную создавать экземпляр не нужно — удобно для разовой обработки. При многократной обработке или общем наборе настроек рекомендуется создать отдельный Processor через [`json.New(cfg)`](../processor/#new).

Полное описание и примеры см. в [Руководстве по потоковой обработке JSONL](../../streaming/jsonl#функции-уровня-пакета) и [Методах JSONL Processor](../processor/jsonl).

**Выбор варианта**

| Сценарий | Рекомендация |
|------|------|
| Построчная обработка (важен порядок) | `StreamJSONL` / `ForeachJSONL` |
| CPU-интенсивная обработка строк (порядок не важен) | `StreamJSONLParallel` |
| Нужно отменить/тайм-аут посреди процесса | `StreamJSONLParallelWithContext` |
| Порционное потребление (пакетная запись в БД и т.п.) | `StreamJSONLChunked` |
| Декодирование в конкретную структуру `T` | `StreamLinesInto[T]` |
| Преобразование / агрегация / фильтрация / поиск первого | `MapJSONL` / `ReduceJSONL` / `FilterJSONL` / `FirstJSONL` |
| Полный сбор | `CollectJSONL` (всё удерживается в памяти, осторожно с большими файлами) |

**Ключевые особенности поведения**

- **Обработка битых строк**: семейство `StreamJSONL` при встрече неразбираемой строки **немедленно прерывается**, возвращая ошибку вида `line N: ...`; только `StreamLinesInto` учитывает `Config.JSONLContinueOnErr` (при `true` битые строки пропускаются с продолжением).
- **Ограничитель глубины**: перед разбором каждой строки проверяется глубина вложенности (`MaxNestingDepthSecurity`, по умолчанию 200) — защита от переполнения стека глубоко вложенными строками.
- **Семантика параллельности**: у `StreamJSONLParallel` при `workers <= 0` используется 4; колбэки выполняются конкурентно в нескольких goroutine — конкурентную безопасность обеспечивает вызывающая сторона. Возврат `item.Break()` — **нормальное** досрочное завершение (возвращается `nil`); возврат другой ошибки отменяет остальные задачи и становится возвращаемым значением функции.
- **Ограничитель памяти**: `JSONLMaxMemory` (если не задан, откат к `MaxMemory`) ограничивает суммарный объём обработанных байтов; при превышении обработка прерывается.

### StreamJSONL

Сигнатура: `func StreamJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) error, cfg ...Config) error`

Поточная построчная обработка JSONL: каждая строка парсится в `IterableValue`, затем вызывается колбэк.

### StreamJSONLParallel

Сигнатура: `func StreamJSONLParallel(reader io.Reader, workers int, fn func(lineNum int, item *IterableValue) error, cfg ...Config) error`

Обрабатывает JSONL `workers` параллельными goroutine (для CPU-интенсивных сценариев).

### StreamJSONLParallelWithContext

Сигнатура: `func StreamJSONLParallelWithContext(ctx context.Context, reader io.Reader, workers int, fn func(lineNum int, item *IterableValue) error, cfg ...Config) error`

Параллельная обработка JSONL с поддержкой отмены/тайм-аута через контекст.

### StreamJSONLChunked

Сигнатура: `func StreamJSONLChunked(reader io.Reader, chunkSize int, fn func(chunk []*IterableValue) error, cfg ...Config) error`

Обрабатывает порциями по `chunkSize`; каждая порция передаётся колбэку как `[]*IterableValue`.

### ForeachJSONL

Сигнатура: `func ForeachJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) error, cfg ...Config) error`

Обходит JSONL (псевдоним с поведением, как у `StreamJSONL`).

### MapJSONL

Сигнатура: `func MapJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) (any, error), cfg ...Config) ([]any, error)`

Отображает каждую строку в новое значение, возвращает срез результатов.

### ReduceJSONL

Сигнатура: `func ReduceJSONL(reader io.Reader, initial any, fn func(acc any, item *IterableValue) any, cfg ...Config) (any, error)`

Свёртывает JSONL в одно значение; `initial` — начальное значение аккумулятора.

### FilterJSONL

Сигнатура: `func FilterJSONL(reader io.Reader, predicate func(item *IterableValue) bool, cfg ...Config) ([]*IterableValue, error)`

Фильтрует по предикату, возвращает срез совпадений.

### StreamJSONLFile

Сигнатура: `func StreamJSONLFile(filename string, fn func(lineNum int, item *IterableValue) error, cfg ...Config) error`

Поточно обрабатывает весь JSONL-файл напрямую.

### CollectJSONL

Сигнатура: `func CollectJSONL(reader io.Reader, cfg ...Config) ([]*IterableValue, error)`

Читает все строки JSONL и собирает их в срез (внимание: полная загрузка в память; для больших файлов предпочитайте `StreamJSONL`).

### FirstJSONL

Сигнатура: `func FirstJSONL(reader io.Reader, predicate func(item *IterableValue) bool, cfg ...Config) (*IterableValue, bool, error)`

Возвращает первый элемент, удовлетворяющий предикату; второе возвращаемое значение указывает, найден ли элемент.

## Конфигурация JSONL

::: warning
Отдельная структура JSONLConfig и функция `DefaultJSONLConfig()` удалены. Конфигурация JSONL полностью интегрирована в поля `JSONL*` структуры `Config`.
:::

### Настройка JSONL через Config

```go
cfg := json.DefaultConfig()

// Конфигурация JSONL
cfg.JSONLBufferSize = 64 * 1024        // Размер буфера чтения (по умолчанию: 64KB)
cfg.JSONLMaxLineSize = 1024 * 1024     // Максимальный размер одной строки (по умолчанию: 1MB)
cfg.JSONLSkipEmpty = true              // Пропускать пустые строки (по умолчанию: true)
cfg.JSONLSkipComments = false          // Пропускать строки с комментариями (по умолчанию: false)
cfg.JSONLContinueOnErr = false         // Продолжать при ошибке (по умолчанию: false)
cfg.JSONLWorkers = 4                   // Количество параллельных горутин (по умолчанию: 4)
cfg.JSONLChunkSize = 1000              // Строк на порцию (по умолчанию: 1000)
cfg.JSONLMaxMemory = 100 * 1024 * 1024 // Максимальная память (по умолчанию: 100MB)

processor, err := json.New(cfg)
```

Подробнее см. [Структура Config](../config#структура-config)

## Writer для JSONL

### NewJSONLWriter

Сигнатура: `func NewJSONLWriter(writer io.Writer, cfg ...Config) *JSONLWriter`

Создаёт writer для JSONL.

```go
package main

import (
	"github.com/cybergodev/json"
	"os"
)

func main() {
	file, err := os.Create("output.jsonl")
	if err != nil {
		panic(err)
	}
	defer file.Close()
	jw := json.NewJSONLWriter(file)
	jw.Write(map[string]any{"id": 1, "name": "Alice"})
	jw.Write(map[string]any{"id": 2, "name": "Bob"})
}
```

### Методы JSONLWriter

| Метод | Сигнатура | Описание |
|------|------|------|
| `Write` | `func (w *JSONLWriter) Write(data any) error` | Кодирует одиночное значение в одну строку JSON и записывает |
| `WriteAll` | `func (w *JSONLWriter) WriteAll(data []any) error` | Последовательно записывает несколько значений, останавливается на первой ошибке |
| `WriteRaw` | `func (w *JSONLWriter) WriteRaw(line []byte) error` | Записывает уже закодированную исходную JSON-строку |
| `Err` | `func (w *JSONLWriter) Err() error` | Возвращает первую кэшированную ошибку записи |
| `Stats` | `func (w *JSONLWriter) Stats() JSONLStats` | Возвращает статистику записи |

#### Write

Сигнатура: `func (w *JSONLWriter) Write(data any) error`

Кодирует одиночное JSON-значение в одну строку и записывает в нижележащий writer; в конец строки автоматически добавляется `\n`.

**Параметры**

| Имя | Тип | Обязателен | Описание |
|------|------|------|------|
| `data` | `any` | да | Значение для кодирования и записи |

**Возвращаемые значения**

| Тип | Описание |
|------|------|
| `error` | Ошибка кодирования или записи; после ошибки кэшируется в writer'е (см. «Детали поведения» ниже) |

#### WriteAll

Сигнатура: `func (w *JSONLWriter) WriteAll(data []any) error`

Последовательно кодирует несколько значений в несколько строк; при первой ошибке немедленно останавливается и возвращает её.

**Параметры**

| Имя | Тип | Обязателен | Описание |
|------|------|------|------|
| `data` | `[]any` | да | Срез записываемых значений |

**Возвращаемые значения**

| Тип | Описание |
|------|------|
| `error` | Первая ошибка, возвращённая `Write` (`nil`, если всё успешно) |

```go
jw := json.NewJSONLWriter(file)

items := []any{
	map[string]any{"id": 1, "name": "Alice"},
	map[string]any{"id": 2, "name": "Bob"},
}
if err := jw.WriteAll(items); err != nil {
	log.Fatal(err)
}

if err := jw.Err(); err != nil {
	log.Fatal(err)
}
```

#### WriteRaw

Сигнатура: `func (w *JSONLWriter) WriteRaw(line []byte) error`

Записывает **уже закодированную** исходную JSON-строку, избегая накладных расходов повторного кодирования; если в конце нет `\n`, он добавляется автоматически.

**Параметры**

| Имя | Тип | Обязателен | Описание |
|------|------|------|------|
| `line` | `[]byte` | да | Уже закодированная JSON-строка (перевод строки не обязателен) |

**Возвращаемые значения**

| Тип | Описание |
|------|------|
| `error` | Ошибка записи; после ошибки кэшируется в writer'е |

#### Err

Сигнатура: `func (w *JSONLWriter) Err() error`

Возвращает первую кэшированную ошибку записи/кодирования (`nil`, если ошибок не было); подходит для единой проверки после пакетной записи.

**Возвращаемые значения**

| Тип | Описание |
|------|------|
| `error` | Первая кэшированная ошибка; `nil`, если ошибок никогда не было |

#### Stats

Сигнатура: `func (w *JSONLWriter) Stats() JSONLStats`

Возвращает статистику записи (число успешно записанных строк и байтов).

**Возвращаемые значения**

| Тип | Описание |
|------|------|
| `JSONLStats` | Статистика записи; поля см. в [JSONLStats](#jsonlstats) ниже |

### JSONLStats

Тип статистики записи, возвращаемый `Stats()`.

```go
type JSONLStats struct {
	LinesProcessed int64 // Число успешно записанных строк
	BytesWritten   int64 // Всего записано байтов (включая переводы строк в конце)
}
```

| Поле | Тип | Описание |
|------|------|------|
| `LinesProcessed` | `int64` | Число успешно записанных строк (неудачные строки не считаются) |
| `BytesWritten` | `int64` | Всего байтов, записанных в нижележащий writer (включая автоматически добавленные переводы строк) |

**Детали поведения**

- `Write`: кодирует значение в одну строку JSON и добавляет `\n`; экранировать ли `<`/`>`/`&`, решает `Config.EscapeHTML` (по умолчанию `true`)
- `WriteRaw`: записывает **уже закодированную** исходную строку, избегая накладных расходов повторного кодирования; если в конце нет `\n`, он добавляется автоматически
- **Липкость ошибки**: после первой неудачной записи или ошибки кодирования ошибка кэшируется в writer'е; последующие `Write`/`WriteRaw` больше не пишут в нижележащий writer и сразу возвращают эту ошибку — чтобы не дописывать в наполовину записанное состояние
- `Err()` возвращает кэшированную ошибку (`nil`, если ошибок нет); `Stats()` возвращает `JSONLStats`, поля см. в таблице выше

### Пример использования

```go
package main

import (
	"fmt"
	"os"

	"github.com/cybergodev/json"
)

func main() {
	jw := json.NewJSONLWriter(os.Stdout)

	// Запись 3 записей, по одной в строке
	for i := 1; i <= 3; i++ {
		if err := jw.Write(map[string]int{"id": i}); err != nil {
			panic(err)
		}
	}

	stats := jw.Stats()
	if err := jw.Err(); err != nil {
		panic(err)
	}
	fmt.Printf("Записано %d строк, всего %d байтов\n", stats.LinesProcessed, stats.BytesWritten)
	// {"id":1}
	// {"id":2}
	// {"id":3}
	// Записано 3 строк, всего 27 байтов
}
```

## См. также

- [Функции файловых операций](./file-io) - файловые операции LoadFromFile, SaveToFile и др.
- [Методы JSONL Processor](../processor/jsonl) - подробный разбор методов JSONL уровня Processor
- [Обработчики JSONL](../../streaming/jsonl#jsonlwriter) - концепции JSONL/NDJSON и практическое руководство по потоковой обработке
- [Потоковая обработка](../../streaming/large-files) - подробный разбор потоковых обработчиков
