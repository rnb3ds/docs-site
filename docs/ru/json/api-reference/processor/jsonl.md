---
sidebar_label: "JSONL"
title: "Методы JSONL Processor - CyberGo JSON | Справочник API"
description: "Методы JSONL CyberGo JSON Processor: StreamJSONL, StreamJSONLParallel, ForeachJSONL, MapJSONL, ReduceJSONL и FilterJSONL для потоковой обработки данных."
sidebar_position: 8
---

# Методы JSONL Processor

Processor предоставляет полный набор возможностей потоковой обработки JSONL (JSON Lines): построчную и параллельную обработку, порционную обработку и функциональные операции.

::: tip Полное руководство
Нужны пояснение концепций JSONL/NDJSON и практика потоковой обработки? Обратитесь к полному руководству [Обработчики JSONL](../../streaming/jsonl).
:::

## Методы потокового чтения

### StreamJSONL

Сигнатура: `func (p *Processor) StreamJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) error) error`

Поточно обрабатывает данные JSONL: читает построчно и вызывает колбэк. Возврат `nil` — перейти к следующей строке; возврат `item.Break()` — чистое досрочное завершение (в целом возвращается `nil`); возврат другой ошибки — немедленная остановка с возвратом этой ошибки. Паника внутри колбэка перехватывается и превращается в возвращаемую ошибку, процесс не падает.

**Параметры**

| Имя | Тип | Описание |
|------|------|------|
| `reader` | `io.Reader` | Источник данных JSONL |
| `fn` | `func(lineNum int, item *IterableValue) error` | Функция обработки: `nil` — продолжить / `item.Break()` — остановить / другая ошибка — прервать |

```go
processor, _ := json.New()
defer processor.Close()

file, _ := os.Open("logs.jsonl")
defer file.Close()

err := processor.StreamJSONL(file, func(lineNum int, item *json.IterableValue) error {
	level := item.GetString("level")
	msg := item.GetString("message")
	fmt.Printf("[%d] %s: %s\n", lineNum, level, msg)
	return nil
})
```

---

### StreamJSONLParallel

Сигнатура: `func (p *Processor) StreamJSONLParallel(reader io.Reader, workers int, fn func(lineNum int, item *IterableValue) error) error`

Параллельная обработка данных JSONL с ускорением за счёт нескольких рабочих горутин.

**Параметры**

| Имя | Тип | Описание |
|------|------|------|
| `reader` | `io.Reader` | Источник данных JSONL |
| `workers` | `int` | Количество рабочих горутин (при ≤0 по умолчанию 4) |
| `fn` | `func(lineNum int, item *IterableValue) error` | Функция обработки |

```go
processor, _ := json.New()
defer processor.Close()

file, _ := os.Open("large.jsonl")
defer file.Close()

var count int64
err := processor.StreamJSONLParallel(file, 8, func(lineNum int, item *json.IterableValue) error {
	atomic.AddInt64(&count, 1)
	// CPU-интенсивная обработка...
	return nil
})
fmt.Printf("Обработано %d строк\n", count)
```

::: tip Рекомендации по производительности
- Подходит для CPU-интенсивных операций (преобразование данных, вычисления)
- Для I/O-интенсивных операций рекомендуется однопоточный `StreamJSONL`
- Количество workers рекомендуется равным числу ядер CPU
:::

### StreamJSONLParallelWithContext

Сигнатура: `func (p *Processor) StreamJSONLParallelWithContext(ctx context.Context, reader io.Reader, workers int, fn func(lineNum int, item *IterableValue) error) error`

Параллельная обработка JSONL с контекстом; поддерживаются отмена и контроль тайм-аута.

**Параметры**

| Имя | Тип | Описание |
|------|------|------|
| `ctx` | `context.Context` | Контекст для отмены или тайм-аута |
| `reader` | `io.Reader` | Источник данных JSONL |
| `workers` | `int` | Количество рабочих горутин (при ≤0 по умолчанию 4) |
| `fn` | `func(lineNum int, item *IterableValue) error` | Функция обработки |

```go
processor, _ := json.New()
defer processor.Close()

ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()

err := processor.StreamJSONLParallelWithContext(ctx, reader, 8, func(lineNum int, item *json.IterableValue) error {
	return nil
})
if err != nil {
	log.Fatal(err)
}
```

---

### StreamJSONLChunked

Сигнатура: `func (p *Processor) StreamJSONLChunked(reader io.Reader, chunkSize int, fn func(chunk []*IterableValue) error) error`

Порционная обработка данных JSONL: за один раз обрабатывается партия элементов.

**Параметры**

| Имя | Тип | Описание |
|------|------|------|
| `reader` | `io.Reader` | Источник данных JSONL |
| `chunkSize` | `int` | Количество элементов в порции |
| `fn` | `func(chunk []*IterableValue) error` | Функция пакетной обработки |

```go
processor, _ := json.New()
defer processor.Close()

file, _ := os.Open("data.jsonl")
defer file.Close()

err := processor.StreamJSONLChunked(file, 100, func(chunk []*json.IterableValue) error {
	// Пакетная запись в базу данных
	records := make([]Record, len(chunk))
	for i, item := range chunk {
		records[i] = Record{
			ID:   item.GetInt("id"),
			Name: item.GetString("name"),
		}
	}
	return db.BatchInsert(records)
})
```

---

### StreamJSONLFile

Сигнатура: `func (p *Processor) StreamJSONLFile(filename string, fn func(lineNum int, item *IterableValue) error) error`

Поточно обрабатывает данные JSONL прямо из файла.

```go
processor, _ := json.New()
defer processor.Close()

err := processor.StreamJSONLFile("logs.jsonl", func(lineNum int, item *json.IterableValue) error {
	if item.GetString("level") == "error" {
		logErrors(item)
	}
	return nil
})
```

---

## Функциональные методы

### ForeachJSONL

Сигнатура: `func (p *Processor) ForeachJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) error) error`

Метод-псевдоним итерации данных JSONL; поведение совпадает с `StreamJSONL`.

```go
err := processor.ForeachJSONL(file, func(lineNum int, item *json.IterableValue) error {
	fmt.Printf("Строка %d: %v\n", lineNum, item.GetData())
	return nil
})
```

---

### MapJSONL

Сигнатура: `func (p *Processor) MapJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) (any, error)) ([]any, error)`

Отображает данные JSONL в новый формат, возвращая преобразованный срез.

```go
processor, _ := json.New()
defer processor.Close()

file, _ := os.Open("users.jsonl")
defer file.Close()

// Извлекаем все имена пользователей
names, err := processor.MapJSONL(file, func(lineNum int, item *json.IterableValue) (any, error) {
	return item.GetString("name"), nil
})
// names: []any{"Alice", "Bob", "Charlie"}
```

---

### ReduceJSONL

Сигнатура: `func (p *Processor) ReduceJSONL(reader io.Reader, initial any, fn func(acc any, item *IterableValue) any) (any, error)`

Свёртывает данные JSONL в одно значение.

```go
processor, _ := json.New()
defer processor.Close()

file, _ := os.Open("sales.jsonl")
defer file.Close()

// Подсчёт общей суммы продаж
total, err := processor.ReduceJSONL(file, 0.0, func(acc any, item *json.IterableValue) any {
	price := item.GetFloat64("price")
	return acc.(float64) + price
})
fmt.Printf("Общая сумма продаж: %.2f\n", total.(float64))
```

---

### FilterJSONL

Сигнатура: `func (p *Processor) FilterJSONL(reader io.Reader, predicate func(item *IterableValue) bool) ([]*IterableValue, error)`

Фильтрует данные JSONL, возвращая элементы, удовлетворяющие условию.

```go
processor, _ := json.New()
defer processor.Close()

file, _ := os.Open("logs.jsonl")
defer file.Close()

// Отбираем ошибочные записи лога
errors, err := processor.FilterJSONL(file, func(item *json.IterableValue) bool {
	return item.GetString("level") == "error"
})
fmt.Printf("Найдено %d ошибочных записей\n", len(errors))
```

---

### CollectJSONL

Сигнатура: `func (p *Processor) CollectJSONL(reader io.Reader) ([]*IterableValue, error)`

Собирает все данные JSONL в срез.

```go
processor, _ := json.New()
defer processor.Close()

file, _ := os.Open("data.jsonl")
defer file.Close()

items, err := processor.CollectJSONL(file)
if err != nil {
	panic(err)
}
fmt.Printf("Собрано %d записей\n", len(items))
```

::: warning Замечание о памяти
Метод загружает все данные в память и не подходит для очень больших файлов. Для больших файлов используйте построчный `StreamJSONL`.
:::

---

### FirstJSONL

Сигнатура: `func (p *Processor) FirstJSONL(reader io.Reader, predicate func(item *IterableValue) bool) (*IterableValue, bool, error)`

Ищет первый элемент, удовлетворяющий условию.

**Возвращаемые значения**

| Тип | Описание |
|------|------|
| `*IterableValue` | Найденный элемент (если существует) |
| `bool` | Найден ли элемент |
| `error` | Информация об ошибке |

```go
processor, _ := json.New()
defer processor.Close()

file, _ := os.Open("users.jsonl")
defer file.Close()

// Поиск первого администратора
admin, found, err := processor.FirstJSONL(file, func(item *json.IterableValue) bool {
	return item.GetBool("is_admin")
})
if err != nil {
	panic(err)
}
if found {
	fmt.Printf("Администратор: %s\n", admin.GetString("name"))
}
```

---

## Автономный обработчик NDJSONProcessor

`NDJSONProcessor` — не зависящий от `Processor` построчный обработчик NDJSON (JSON с разделением строками): колбэк напрямую получает `map[string]any` (а не `IterableValue`), создавать экземпляр `Processor` не нужно, пустые строки пропускаются **всегда**. Подходит для простого потребления строк-объектов; когда нужны типизированное получение, параллельная обработка или функциональные комбинации Map/Reduce/Filter, используйте серию `StreamJSONL` выше.

### NewNDJSONProcessor

Сигнатура: `func NewNDJSONProcessor(cfg ...Config) *NDJSONProcessor`

`NewNDJSONProcessor` принимает необязательный cfg, следуя единой модели Config.

**Параметры**

| Имя | Тип | Описание |
|------|------|------|
| `cfg` | `...Config` | Необязательная конфигурация; без передачи используется `DefaultConfig()`; буфер чтения берётся из `JSONLBufferSize` (при ≤0 откат к 64KB) |

Остальные поля JSONL (`JSONLMaxLineSize`, `JSONLMaxMemory`, `JSONLSkipComments`, `JSONLContinueOnErr`, `MaxNestingDepthSecurity`) действуют при обработке; их значения см. в [Параметрах конфигурации](#параметры-конфигурации).

### ProcessFile

Сигнатура: `func (np *NDJSONProcessor) ProcessFile(filename string, fn func(lineNum int, obj map[string]any) error) error`

`ProcessFile` построчно обрабатывает NDJSON-файл. Путь файла сначала проходит проверку безопасности на обход пути и др. (недопустимый путь возвращает `ErrSecurityViolation`), затем выполняется то же, что `ProcessReader` для открытого файла; ошибки вроде неудачного открытия файла оборачиваются в `JsonsError`.

**Параметры**

| Имя | Тип | Описание |
|------|------|------|
| `filename` | `string` | Путь к NDJSON-файлу (сначала проверка безопасности) |
| `fn` | `func(lineNum int, obj map[string]any) error` | Колбэк каждой строки; возврат ошибки немедленно завершает обработку и возвращается как есть |

### ProcessReader

Сигнатура: `func (np *NDJSONProcessor) ProcessReader(reader io.Reader, fn func(lineNum int, obj map[string]any) error) error`

`ProcessReader` построчно обрабатывает NDJSON из `io.Reader`: каждая строка парсится в `map[string]any`, затем вызывается колбэк; паника колбэка перехватывается и превращается в возвращаемую ошибку. Лимиты безопасности те же, что у серии `StreamJSONL` — размер строки ограничен `JSONLMaxLineSize` (цепочка отката `MaxJSONSize` → 100MB), общий объём обработки — `JSONLMaxMemory` (откат к `MaxMemory`), перед разбором каждой строки проверяется глубина вложенности по `MaxNestingDepthSecurity`; при `JSONLContinueOnErr=true` строки с ошибкой разбора пропускаются с продолжением обработки.

**Параметры**

| Имя | Тип | Описание |
|------|------|------|
| `reader` | `io.Reader` | Источник данных NDJSON |
| `fn` | `func(lineNum int, obj map[string]any) error` | Колбэк каждой строки; возврат ошибки немедленно завершает обработку и возвращается как есть |

<!-- check-code: skip -->
```go
np := json.NewNDJSONProcessor()

err := np.ProcessReader(strings.NewReader(`{"id":1}`), func(lineNum int, obj map[string]any) error {
	fmt.Printf("Строка %d: id=%v\n", lineNum, obj["id"])
	return nil
})
```

**Полный пример** (пустые строки всегда пропускаются, номера строк сохраняют исходные физические):

```go
package main

import (
	"fmt"
	"strings"

	"github.com/cybergodev/json"
)

func main() {
	np := json.NewNDJSONProcessor()

	data := "{\"id\":1}\n\n{\"id\":2}\n"
	var count int

	err := np.ProcessReader(strings.NewReader(data), func(lineNum int, obj map[string]any) error {
		count++
		fmt.Printf("Строка %d: id=%v\n", lineNum, obj["id"])
		return nil
	})
	if err != nil {
		panic(err)
	}
	fmt.Printf("Всего обработано %d строк\n", count)
	// Вывод:
	// Строка 1: id=1
	// Строка 3: id=2
	// Всего обработано 2 строк
}
```

::: tip Выбор между этим и StreamJSONL
Используйте `NDJSONProcessor`, когда колбэк работает прямо с `map[string]any` и нужен простейший код; используйте серию `StreamJSONL`, когда нужны типизированное получение через `IterableValue` (`GetInt`/`GetString`), параллельные worker'ы, порции или функциональные конвейеры. Оба подчиняются одному набору лимитов безопасности JSONL.
:::

---

## Параметры конфигурации

Поведение обработки JSONL настраивается следующими полями `Config`:

| Поле | Тип | По умолчанию | Описание |
|------|------|--------|------|
| `JSONLBufferSize` | `int` | 65536 (64KB) | Размер буфера чтения |
| `JSONLMaxLineSize` | `int` | 1048576 (1MB) | Максимальный размер строки в байтах |
| `JSONLSkipEmpty` | `bool` | `true` | Пропускать пустые строки |
| `JSONLSkipComments` | `bool` | `false` | Пропускать комментарии `#` или `//` |
| `JSONLContinueOnErr` | `bool` | `false` | Продолжать при ошибке разбора (действует только на `StreamLinesInto` и `NDJSONProcessor`; серия `StreamJSONL` на этой странице при ошибке разбора всегда прерывается) |
| `JSONLWorkers` | `int` | 4 | Количество рабочих горутин параллельной обработки |
| `JSONLChunkSize` | `int` | 1000 | Размер порции при порционной обработке |
| `JSONLMaxMemory` | `int64` | 104857600 (100MB) | Максимальное использование памяти |

::: tip Методы Processor не принимают per-call cfg
Поведение JSONL у методов этой страницы **целиком определяется конфигурацией, зафиксированной при `New(cfg)`** (в сигнатурах методов нет `cfg ...Config`); для переключения конфигурации на уровне вызова используйте хвостовой `cfg` [пакетных функций JSONL](../functions/jsonl). Также учтите: явный параметр `workers` у `StreamJSONLParallel` и явный `chunkSize` у `StreamJSONLChunked` **приоритетнее** полей `JSONLWorkers` / `JSONLChunkSize`. Кроме того, перед разбором каждая строка проходит проверку глубины вложенности по `MaxNestingDepthSecurity` — защита от переполнения стека глубоко вложенными полезными нагрузками.
:::

```go
cfg := json.DefaultConfig()
cfg.JSONLSkipComments = true  // Пропускать строки с комментариями
cfg.JSONLContinueOnErr = true // Продолжать при ошибке разбора
cfg.JSONLWorkers = 8          // 8 параллельных worker'ов

processor, _ := json.New(cfg)
defer processor.Close()
```

---

## Полные примеры

### Анализ логов

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"os"
)

func main() {
	processor, _ := json.New()
	defer processor.Close()

	file, _ := os.Open("app.log.jsonl")
	defer file.Close()

	var errorCount, warningCount int

	err := processor.StreamJSONL(file, func(lineNum int, item *json.IterableValue) error {
		level := item.GetString("level")
		switch level {
		case "error":
			errorCount++
			fmt.Printf("[ERROR] %s\n", item.GetString("message"))
		case "warning":
			warningCount++
		}
		return nil
	})

	if err != nil {
		panic(err)
	}

	fmt.Printf("Итог: %d ошибок, %d предупреждений\n", errorCount, warningCount)
}
```

### Параллельная обработка данных

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"os"
	"sync/atomic"
)

func main() {
	cfg := json.DefaultConfig()
	cfg.JSONLWorkers = 16 // 16 параллельных worker'ов

	processor, _ := json.New(cfg)
	defer processor.Close()

	file, _ := os.Open("large_data.jsonl")
	defer file.Close()

	var processed int64

	err := processor.StreamJSONLParallel(file, 16, func(lineNum int, item *json.IterableValue) error {
		// CPU-интенсивная обработка (замените своей бизнес-логикой)
		_ = item
		atomic.AddInt64(&processed, 1)
		return nil
	})

	if err != nil {
		panic(err)
	}

	fmt.Printf("Параллельно обработано %d записей\n", processed)
}
```

---

## См. также

- [Обработчики JSONL](../../streaming/jsonl) - пакетные функции JSONL
- [Обработка больших файлов](../../streaming/large-files) - руководство по обработке больших файлов
- [Итераторы](../iterator) - подробный разбор типа IterableValue
