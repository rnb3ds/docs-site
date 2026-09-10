---
sidebar_label: "Пакетные операции"
title: "Функции пакетных операций - CyberGo JSON | Справочник API"
description: "Функции пакетных операций CyberGo JSON: ProcessBatch выполняет несколько JSON-операций, структуры BatchOperation и BatchResult, get/set/delete/validate."
sidebar_position: 7
---

# Функции пакетных операций

Функции пакетных операций пакета json позволяют за один вызов обработать несколько JSON-операций (get/set/delete/validate) — подходят для сценариев пакетной обработки данных.

## ProcessBatch

Сигнатура: `func ProcessBatch(operations []BatchOperation, cfg ...Config) ([]BatchResult, error)`

Пакетная обработка нескольких JSON-операций (функция уровня пакета, Processor создавать не нужно). Порядок результатов строго соответствует порядку входных операций; связь устанавливается через поле `ID`.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	jsonStr := `{"user": {"name": "CyberGo", "age": 25}}`

	operations := []json.BatchOperation{
		{Type: "get", JSONStr: jsonStr, Path: "user.name", ID: "op1"},
		{Type: "set", JSONStr: jsonStr, Path: "user.age", Value: 30, ID: "op2"},
	}

	results, err := json.ProcessBatch(operations)
	if err != nil {
		panic(err)
	}
	for _, r := range results {
		if r.Error != nil {
			fmt.Printf("Операция %s завершилась ошибкой: %v\n", r.ID, r.Error)
		} else {
			fmt.Printf("Результат операции %s: %v\n", r.ID, r.Result)
		}
	}
}

// Вывод:
// Результат операции op1: CyberGo
// Результат операции op2: {"user":{"age":30,"name":"CyberGo"}}
```

### Поддерживаемые типы операций

| `Type` | Назначение | Содержимое `Result` | Типичные ошибки |
|--------|------|---------------|----------|
| `get` | Чтение значения по пути | Значение в пути (`any`) | `ErrPathNotFound`, `ErrInvalidJSON` |
| `set` | Установка значения по пути | **Полная JSON-строка после изменения** | `ErrPathNotFound` (без `CreatePaths`), `ErrInvalidPath` |
| `delete` | Удаление узла по пути | **Полная JSON-строка после удаления** | `ErrPathNotFound`, `ErrInvalidPath` |
| `validate` | Проверка корректности JSON | `map[string]any{"valid": bool}` | при некорректном JSON `Result.valid=false` и непустой `Error` |

Если `Type` не один из четырёх перечисленных (например, опечатка), у этой операции `Error` будет `unknown operation type: <type>` — **пакет не прерывается**, остальные операции выполняются как обычно.

::: warning Операции не образуют цепочку
Каждая `BatchOperation` **независимо** применяется к собственному входу `JSONStr`; операции **не** накладываются друг на друга по цепочке. Например, `set`, а затем `delete` над одним документом дадут два независимых результата, а не композицию «сначала изменить, потом удалить». Для многошаговых преобразований одного документа передавайте вывод предыдущего шага в следующий в своём коде или используйте методы вида [`SetMultiple`](./modify#setmultiple) для многопутевых изменений одного документа.
:::

### Лимит размера пакета

Количество операций ограничено `Config.MaxBatchSize` (по умолчанию `2000`; валидация конфигурации ограничивает диапазон 10–10000). При превышении весь пакет немедленно завершается сбоем с `(nil, ErrSizeLimit)`. Верхний предел действует по **cfg, переданному в данном вызове** (без передачи используется конфигурация по умолчанию):

```go
// Пользовательский предел (для очень больших пакетов)
cfg := json.DefaultConfig()
cfg.MaxBatchSize = 5000
results, err := json.ProcessBatch(ops, cfg)
```

## Примеры по типам операций

### get — пакетное чтение

`Result` операции `get` — исходное значение в пути (числа по умолчанию `float64`, логические — `bool`, строки — `string`).

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"user":{"name":"CyberGo","age":25},"active":true}`

	results, err := json.ProcessBatch([]json.BatchOperation{
		{Type: "get", JSONStr: data, Path: "user.name", ID: "name"},
		{Type: "get", JSONStr: data, Path: "user.age", ID: "age"},
		{Type: "get", JSONStr: data, Path: "active", ID: "active"},
	})
	if err != nil {
		panic(err)
	}

	for _, r := range results {
		if r.Error != nil {
			fmt.Printf("%s сбой: %v\n", r.ID, r.Error)
			continue
		}
		fmt.Printf("%s = %v\n", r.ID, r.Result)
	}
}

// Вывод:
// name = CyberGo
// age = 25
// active = true
```

### set — пакетное изменение

`Result` операции `set` — **полная JSON-строка после изменения** (обратите внимание: не записываемое значение само по себе). В конфигурации по умолчанию `CreatePaths=true`, поэтому установка нового пути автоматически создаёт промежуточные узлы.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"user":{"name":"CyberGo","age":25}}`

	results, err := json.ProcessBatch([]json.BatchOperation{
		{Type: "set", JSONStr: data, Path: "user.age", Value: 30, ID: "update-age"},
		{Type: "set", JSONStr: data, Path: "user.role", Value: "admin", ID: "add-role"},
	})
	if err != nil {
		panic(err)
	}

	for _, r := range results {
		if r.Error != nil {
			fmt.Printf("%s сбой: %v\n", r.ID, r.Error)
			continue
		}
		fmt.Printf("%s -> %s\n", r.ID, r.Result)
	}
}

// Вывод:
// update-age -> {"user":{"age":30,"name":"CyberGo"}}
// add-role -> {"user":{"age":25,"name":"CyberGo","role":"admin"}}
```

::: tip Примечание к формату вывода
JSON-строки, возвращаемые `set`/`delete`, имеют **компактный формат** (без лишних пробелов), а ключи объектов упорядочены лексикографически (как в `encoding/json`, что обеспечивает детерминированный вывод). Если нужен красивый вывод, дополнительно примените к результату [`Prettify`](./output#prettify).
:::

### delete — пакетное удаление

`Result` операции `delete` — **полная JSON-строка после удаления**.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"user":{"name":"CyberGo","age":25,"temp":"x"},"debug":true}`

	results, err := json.ProcessBatch([]json.BatchOperation{
		{Type: "delete", JSONStr: data, Path: "user.temp", ID: "drop-temp"},
		{Type: "delete", JSONStr: data, Path: "debug", ID: "drop-debug"},
	})
	if err != nil {
		panic(err)
	}

	for _, r := range results {
		if r.Error != nil {
			fmt.Printf("%s сбой: %v\n", r.ID, r.Error)
			continue
		}
		fmt.Printf("%s -> %s\n", r.ID, r.Result)
	}
}

// Вывод:
// drop-temp -> {"debug":true,"user":{"age":25,"name":"CyberGo"}}
// drop-debug -> {"user":{"age":25,"name":"CyberGo","temp":"x"}}
```

### validate — пакетная валидация

`Result` операции `validate` всегда `map[string]any{"valid": bool}`; при некорректном JSON `valid` равен `false`, а `Error` содержит ошибку разбора.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	results, err := json.ProcessBatch([]json.BatchOperation{
		{Type: "validate", JSONStr: `{"name":"CyberGo"}`, ID: "ok"},
		{Type: "validate", JSONStr: `{"name":}`, ID: "broken"},
	})
	if err != nil {
		panic(err)
	}

	for _, r := range results {
		if m, ok := r.Result.(map[string]any); ok {
			fmt.Printf("%s: valid=%v\n", r.ID, m["valid"])
		}
		if r.Error != nil {
			fmt.Printf("%s ошибка: %v\n", r.ID, r.Error)
		}
	}
}

// Вывод:
// ok: valid=true
// broken: valid=false
// broken ошибка: invalid JSON: ...
```

## Обработка ошибок и отказоустойчивость

### Сбой одной операции не прерывает пакет

`ProcessBatch` **всегда обрабатывает все операции**: сбой одной операции лишь записывается в её поле `Error`, не прерывая последующие операции и не требуя какой-либо конфигурации. Поэтому результат пакета может быть «частично успешным» — обязательно проверяйте `r.Error` каждой записи:

```go
results, err := json.ProcessBatch(operations)
if err != nil {
	// err возникает только при закрытом процессоре, недействительной конфигурации или превышении MaxBatchSize
	panic(err)
}
var failed int
for _, r := range results {
	if r.Error != nil {
		failed++
		log.Printf("Операция %s завершилась ошибкой: %v", r.ID, r.Error)
		continue
	}
	// Обработка r.Result ...
}
```

::: tip Отличие от ContinueOnError
Поле `Config.ContinueOnError` управляет промежуточной отказоустойчивостью [`SetMultiple`](./modify#setmultiple) (продолжать ли запись остальных путей при сбое одного) и **не** действует на `ProcessBatch`. Изоляция операций в `ProcessBatch` — встроенное поведение, его нельзя отключить этим переключателем.
:::

## Практический сценарий: пакетная миграция данных

Проставим партии записей единый признак миграции: один вызов `ProcessBatch` выполняет все преобразования и собирает вывод каждой записи:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// Несколько записей, как будто прочитанных из источника данных
	records := []string{
		`{"id":1,"name":"Alice","age":30}`,
		`{"id":2,"name":"Bob","age":25}`,
		`{"id":3,"name":"CyberGo","age":28}`,
	}

	// Для каждой записи создаётся операция set с признаком миграции
	ops := make([]json.BatchOperation, len(records))
	for i, r := range records {
		ops[i] = json.BatchOperation{
			Type:    "set",
			JSONStr: r,
			Path:    "migrated",
			Value:   true,
			ID:      fmt.Sprintf("record-%d", i),
		}
	}

	results, err := json.ProcessBatch(ops)
	if err != nil {
		panic(err)
	}

	for _, r := range results {
		if r.Error != nil {
			fmt.Printf("%s сбой: %v\n", r.ID, r.Error)
			continue
		}
		fmt.Printf("%s -> %s\n", r.ID, r.Result)
	}
}

// Вывод:
// record-0 -> {"age":30,"id":1,"migrated":true,"name":"Alice"}
// record-1 -> {"age":25,"id":2,"migrated":true,"name":"Bob"}
// record-2 -> {"age":28,"id":3,"migrated":true,"name":"CyberGo"}
```

## Прогрев кэша WarmupCache

Сигнатура: `func WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)`

Заранее вычисляет горячие пути одного JSON и заполняет кэш, чтобы первый после этого `Get` сразу попал в кэш. Требует включённого кэша у процессора (по умолчанию включён), иначе возвращает `JsonsError` (`Op` равен `warmup_cache`, сообщение — "cache is disabled, cannot warmup cache").

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"user":{"name":"CyberGo","age":25},"meta":{"version":2}}`

	result, err := json.WarmupCache(data, []string{"user.name", "user.age", "meta.version"})
	if err != nil {
		panic(err)
	}
	fmt.Printf("Прогрев: %d/%d успешно (%.0f%%)\n", result.Successful, result.TotalPaths, result.SuccessRate)

	// Первый Get после прогрева попадает в кэш
	name, err := json.Get(data, "user.name")
	if err != nil {
		panic(err)
	}
	fmt.Println("name:", name)
}

// Вывод:
// Прогрев: 3/3 успешно (100%)
// name: CyberGo
```

Структура `WarmupResult`:

| Поле | Тип | Описание |
|------|------|------|
| `TotalPaths` | `int` | Общее количество путей для прогрева |
| `Successful` | `int` | Количество успешных |
| `Failed` | `int` | Количество неудачных |
| `SuccessRate` | `float64` | Доля успешных (в процентах) |
| `FailedPaths` | `[]string` | Список неудавшихся путей (nil, если неудач нет) |

Когда все пути завершились сбоем, `WarmupCache` возвращает `WarmupResult` вместе с последней ошибкой.

## Определения типов

### BatchOperation

Структура описания пакетной операции.

```go
type BatchOperation struct {
	Type    string `json:"type"`     // Тип операции: "get", "set", "delete", "validate"
	JSONStr string `json:"json_str"` // Целевая JSON-строка
	Path    string `json:"path"`     // Path-выражение
	Value   any    `json:"value"`    // Значение операции (используется операцией set)
	ID      string `json:"id"`       // Идентификатор операции
}
```

| Поле | Тип | Описание |
|------|------|------|
| `Type` | `string` | Тип операции: `get` / `set` / `delete` / `validate` |
| `JSONStr` | `string` | Входной JSON данной операции (операции независимы, цепочек нет) |
| `Path` | `string` | Path-выражение (`validate` не использует) |
| `Value` | `any` | Записываемое значение для `set` (остальные типы не используют) |
| `ID` | `string` | Пользовательский идентификатор, дословно копируется в `BatchResult.ID` соответствующего результата |

### BatchResult

Структура результата пакетной операции.

```go
type BatchResult struct {
	ID     string `json:"id"`     // Идентификатор операции
	Result any    `json:"result"` // Результат операции (смысл зависит от Type, см. таблицу выше)
	Error  error  `json:"error"`  // Ошибка (уровня отдельной операции)
}
```

| Поле | Тип | Описание |
|------|------|------|
| `ID` | `string` | `ID` соответствующей операции; срез результатов соответствует входным операциям по индексам |
| `Result` | `any` | Результат операции; смысл зависит от `Type` (см. таблицу выше) |
| `Error` | `error` | Ошибка данной операции, `nil` означает успех; **обязательно проверяйте каждую запись** |

::: tip Пакетные методы Processor
Экземпляр Processor предоставляет эквивалентный метод `p.ProcessBatch(operations)` с сигнатурой, как у функции уровня пакета, — удобен для переиспользования Processor или настройки через `Config` (например, вывод `Pretty`, `PreserveNumbers`). Подробнее см. [Пакетные операции Processor](../processor/batch).
:::

## См. также

- [Функции изменения](./modify) - операции изменения Set, SetMultiple, MergeJSON и др.
- [Пакетные операции Processor](../processor/batch) - подробный разбор методов пакетных операций уровня Processor
- [Вспомогательные инструменты](../helpers) - утилиты WarmupCache, ClearCache, GetStats и др.
