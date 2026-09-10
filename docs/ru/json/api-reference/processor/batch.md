---
sidebar_label: "Пакетные операции"
title: "Пакетные операции Processor - CyberGo JSON | Справочник API"
description: "Пакетные операции CyberGo JSON Processor: ProcessBatch для get/set/delete/validate, типы BatchOperation и BatchResult, настройка батчей через Config."
sidebar_position: 7
---

# Методы пакетных операций

Processor поддерживает пакетные операции: один вызов обрабатывает несколько JSON-операций (get/set/delete/validate). По сравнению с пакетной [`ProcessBatch`](../functions/batch) вариант Processor удобен для переиспользования экземпляра или настройки поведения каждой партии через `Config` (красивый вывод, сохранение чисел, лимиты безопасности и др.).

## ProcessBatch

Сигнатура: `func (p *Processor) ProcessBatch(operations []BatchOperation, cfg ...Config) ([]BatchResult, error)`

Пакетно обрабатывает несколько JSON-операций. Порядок результатов совпадает с порядком входных операций; связь устанавливается через поле `ID`.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New(json.DefaultConfig())
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data := `{"user":{"name":"CyberGo","age":25}}`
	results, err := p.ProcessBatch([]json.BatchOperation{
		{Type: "get", JSONStr: data, Path: "user.name", ID: "name"},
		{Type: "set", JSONStr: data, Path: "user.age", Value: 30, ID: "age"},
	})
	if err != nil {
		panic(err)
	}
	for _, r := range results {
		fmt.Printf("%s: %v\n", r.ID, r.Result)
	}
}

// Вывод:
// name: CyberGo
// age: {"user":{"age":30,"name":"CyberGo"}}
```

### Поддерживаемые типы операций

| `Type` | Назначение | Содержимое `Result` | Типичные ошибки |
|--------|------|---------------|----------|
| `get` | Чтение значения по пути | Значение в пути (`any`) | `ErrPathNotFound`, `ErrInvalidJSON` |
| `set` | Установка значения по пути | **Полная JSON-строка после изменения** | `ErrPathNotFound` (без `CreatePaths`), `ErrInvalidPath` |
| `delete` | Удаление узла по пути | **Полная JSON-строка после удаления** | `ErrPathNotFound`, `ErrInvalidPath` |
| `validate` | Проверка корректности JSON | `map[string]any{"valid": bool}` | при некорректном JSON `Result.valid=false` и непустой `Error` |

::: warning Операции не образуют цепочку
Каждая `BatchOperation` **независимо** применяется к собственному входу `JSONStr`; операции **не** накладываются друг на друга по цепочке. `set`, а затем `delete` над одним документом дадут два независимых результата, а не композицию «сначала изменить, потом удалить». Для многошаговых преобразований одного документа передавайте вывод предыдущего шага в следующий в своём коде или используйте методы вида [`SetMultiple`](./modify#setmultiple) для многопутевых изменений одного документа.
:::

### Лимит размера пакета

Количество операций ограничено `Config.MaxBatchSize` (по умолчанию `2000`). Предел действует «на каждый вызов» — переданный `cfg` (при наличии) переопределяет собственную конфигурацию Processor. При превышении весь пакет немедленно завершается сбоем с `(nil, ErrSizeLimit)`.

## Примеры по типам операций

### get — пакетное чтение

`Result` операции `get` — исходное значение в пути (числа по умолчанию `float64`).

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New(json.DefaultConfig())
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data := `{"user":{"name":"CyberGo","age":25}}`
	results, err := p.ProcessBatch([]json.BatchOperation{
		{Type: "get", JSONStr: data, Path: "user.name", ID: "name"},
		{Type: "get", JSONStr: data, Path: "user.age", ID: "age"},
	})
	if err != nil {
		panic(err)
	}
	for _, r := range results {
		fmt.Printf("%s: %v\n", r.ID, r.Result)
	}
}

// Вывод:
// name: CyberGo
// age: 25
```

### set — пакетное изменение

`Result` у `set` — **полная JSON-строка после изменения** (компактный формат, ключи объекта в лексикографическом порядке). По умолчанию `CreatePaths=true`: установка нового пути автоматически создаёт промежуточные узлы:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New(json.DefaultConfig())
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data := `{"user":{"name":"CyberGo","age":25}}`
	results, err := p.ProcessBatch([]json.BatchOperation{
		{Type: "set", JSONStr: data, Path: "user.age", Value: 30, ID: "age"},
		{Type: "set", JSONStr: data, Path: "user.role", Value: "admin", ID: "role"},
	})
	if err != nil {
		panic(err)
	}
	for _, r := range results {
		fmt.Printf("%s -> %s\n", r.ID, r.Result)
	}
}

// Вывод:
// age -> {"user":{"age":30,"name":"CyberGo"}}
// role -> {"user":{"age":25,"name":"CyberGo","role":"admin"}}
```

::: tip Как конфигурация действует на пакет
Переданный `Config` прозрачно передаётся каждой операции, но **влияет на вывод не всеми полями**: возвращаемые значения `set`/`delete` всегда компактные строки (`Pretty` не действует; для красивого вывода примените к результату [`Prettify`](./output#prettify)); реально по `cfg` работают `MaxBatchSize` (предел пакета), `CreatePaths` (разрешать ли `set` создавать пути) и `PreserveNumbers` (влияет на тип чисел в `get`: по умолчанию `float64`, при включении — `json.Number`).
:::

### delete — пакетное удаление

`Result` у `delete` — **полная JSON-строка после удаления**.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New(json.DefaultConfig())
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data := `{"user":{"name":"CyberGo","age":25,"temp":"x"},"debug":true}`
	results, err := p.ProcessBatch([]json.BatchOperation{
		{Type: "delete", JSONStr: data, Path: "user.temp", ID: "drop-temp"},
		{Type: "delete", JSONStr: data, Path: "debug", ID: "drop-debug"},
	})
	if err != nil {
		panic(err)
	}
	for _, r := range results {
		fmt.Printf("%s -> %s\n", r.ID, r.Result)
	}
}

// Вывод:
// drop-temp -> {"debug":true,"user":{"age":25,"name":"CyberGo"}}
// drop-debug -> {"user":{"age":25,"name":"CyberGo","temp":"x"}}
```

### validate — пакетная валидация

`Result` у `validate` всегда `map[string]any{"valid": bool}`; при некорректном JSON `valid` равен `false`, а `Error` содержит ошибку разбора.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New(json.DefaultConfig())
	if err != nil {
		panic(err)
	}
	defer p.Close()

	results, err := p.ProcessBatch([]json.BatchOperation{
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

### Смешанные операции

В одной партии можно смешивать операции разных типов; результаты возвращаются по порядку:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New(json.DefaultConfig())
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data := `{"user":{"name":"CyberGo"},"processed":false}`
	results, err := p.ProcessBatch([]json.BatchOperation{
		{Type: "validate", JSONStr: data, ID: "check"},
		{Type: "get", JSONStr: data, Path: "user.name", ID: "name"},
		{Type: "set", JSONStr: data, Path: "processed", Value: true, ID: "mark"},
	})
	if err != nil {
		panic(err)
	}

	for _, r := range results {
		if r.ID == "check" {
			if m, ok := r.Result.(map[string]any); ok {
				fmt.Printf("Результат валидации: %v\n", m["valid"])
			}
		} else {
			fmt.Printf("%s: %v\n", r.ID, r.Result)
		}
	}
}

// Вывод:
// Результат валидации: true
// name: CyberGo
// mark: {"processed":true,"user":{"name":"CyberGo"}}
```

## Обработка ошибок и отказоустойчивость

### Сбой одной операции не прерывает пакет

`ProcessBatch` **всегда обрабатывает все операции**: сбой одной операции лишь записывается в её поле `Error`, не прерывая последующие операции и не требуя какой-либо конфигурации. Поэтому результат пакета может быть «частично успешным» — обязательно проверяйте `r.Error` каждой записи:

```go
results, err := p.ProcessBatch(operations)
if err != nil {
	// err возникает только при закрытом процессоре, недействительной конфигурации или превышении MaxBatchSize
	return err
}
for _, r := range results {
	if r.Error != nil {
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

Проставим партии записей единый признак миграции: один вызов `ProcessBatch` выполняет все преобразования. Вариант Processor особенно удобен в долгоживущих сервисах, где один экземпляр обрабатывает множество партий:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New(json.DefaultConfig())
	if err != nil {
		panic(err)
	}
	defer p.Close()

	records := []string{
		`{"id":1,"name":"Alice","age":30}`,
		`{"id":2,"name":"Bob","age":25}`,
		`{"id":3,"name":"CyberGo","age":28}`,
	}

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

	results, err := p.ProcessBatch(ops)
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

Сигнатура: `func (p *Processor) WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)`

Заранее вычисляет горячие пути одного JSON и заполняет кэш, чтобы первый после этого [`Get`](./query) сразу попал в кэш. Требует включённого кэша у Processor (по умолчанию включён), иначе возвращает `JsonsError` (`Op` равен `warmup_cache`, сообщение — "cache is disabled, cannot warmup cache").

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New(json.DefaultConfig())
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data := `{"user":{"name":"CyberGo","age":25},"meta":{"version":2}}`
	result, err := p.WarmupCache(data, []string{"user.name", "user.age", "meta.version"})
	if err != nil {
		panic(err)
	}
	fmt.Printf("Прогрев: %d/%d успешно (%.0f%%)\n", result.Successful, result.TotalPaths, result.SuccessRate)
}

// Вывод:
// Прогрев: 3/3 успешно (100%)
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

### Структура BatchOperation

```go
type BatchOperation struct {
	Type    string `json:"type"`     // Тип операции: "get", "set", "delete", "validate"
	JSONStr string `json:"json_str"` // JSON-строка
	Path    string `json:"path"`     // Целевой путь
	Value   any    `json:"value"`    // Значение для операции Set
	ID      string `json:"id"`       // Идентификатор операции
}
```

### Структура BatchResult

```go
type BatchResult struct {
	ID     string `json:"id"`     // ID соответствующей операции
	Result any    `json:"result"` // Результат операции (смысл зависит от Type, см. таблицу выше)
	Error  error  `json:"error"`  // Ошибка отдельной операции (не влияет на другие)
}
```

## Важные замечания

1. Каждая операция выполняется независимо: сбой одной не влияет на другие (встроенное поведение, конфигурация не требуется)
2. Порядок результатов совпадает с порядком операций; операция и результат сопоставляются по `ID`
3. `MaxBatchSize` (по умолчанию 2000) действует по `cfg` каждого вызова; при превышении вся партия завершается сбоем

## См. также

- [Запросы по путям](./query) - серия методов Get
- [Изменение данных](./modify) - методы Set/Delete/SetMultiple
- [Пакетные операции уровня пакета](../functions/batch) - пакетный ProcessBatch без Processor
