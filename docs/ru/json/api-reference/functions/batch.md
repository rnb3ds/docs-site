---
sidebar_label: "Пакетные операции"
title: "Функции пакетных операций - CyberGo JSON | API справочник"
description: "Функции пакетных операций CyberGo JSON: ProcessBatch обрабатывает несколько JSON-операций за один вызов, со структурами BatchOperation и BatchResult."
sidebar_position: 7
---

# Функции пакетных операций

Функции пакетных операций из пакета json поддерживают обработку нескольких JSON-операций (get/set/delete/validate) за один вызов — подходят для сценариев пакетной обработки данных.

## ProcessBatch

Сигнатура: `func ProcessBatch(operations []BatchOperation, cfg ...Config) ([]BatchResult, error)`

Пакетная обработка нескольких JSON-операций (функция уровня пакета, без создания Processor). Порядок возвращаемых результатов соответствует порядку входных операций и связывается через поле `ID`.

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
            fmt.Printf("Операция %s не удалась: %v\n", r.ID, r.Error)
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
| `get` | Чтение значения по пути | Значение по пути (`any`) | `ErrPathNotFound`, `ErrInvalidJSON` |
| `set` | Установка значения по пути | **Полная изменённая JSON-строка** | `ErrPathNotFound` (без `CreatePaths`), `ErrInvalidPath` |
| `delete` | Удаление узла по пути | **Полная JSON-строка после удаления** | `ErrPathNotFound`, `ErrInvalidPath` |
| `validate` | Проверка корректности JSON | `map[string]any{"valid": bool}` | При некорректном JSON `Result.valid=false` и `Error` не пустой |

::: warning Операции не образуют цепочку
Каждая `BatchOperation` **независимо** применяется к своему входу `JSONStr`, операции **не** накапливаются цепочкой. Например, сначала `set`, затем `delete` для одного документа дадут два независимых результата, а не комбинированное состояние «сначала изменить, потом удалить». Для многошаговых преобразований одного документа передавайте результат предыдущего шага в следующий в коде или используйте [`SetMultiple`](./modify#setmultiple) и другие методы с несколькими путями для одного документа.
:::

### Ограничение размера пакета

Количество операций ограничено `Config.MaxBatchSize` (по умолчанию `2000`). При превышении весь пакет немедленно завершается ошибкой `(nil, ErrSizeLimit)`:

```go
// Пользовательский верхний предел (для сверхбольших пакетов)
cfg := json.DefaultConfig()
cfg.MaxBatchSize = 5000
results, err := json.ProcessBatch(ops, cfg)
```

## Примеры по типам операций

### get — пакетное чтение

`Result` операции `get` — исходное значение по пути (числа по умолчанию `float64`, логическое `bool`, строка `string`).

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
            fmt.Printf("%s не удалась: %v\n", r.ID, r.Error)
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

`Result` операции `set` — **полная изменённая JSON-строка** (не само записанное значение). По умолчанию `CreatePaths=true`, поэтому установка нового пути автоматически создаёт промежуточные узлы.

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
            fmt.Printf("%s не удалась: %v\n", r.ID, r.Error)
            continue
        }
        fmt.Printf("%s -> %s\n", r.ID, r.Result)
    }
}
// Вывод:
// update-age -> {"user":{"age":30,"name":"CyberGo"}}
// add-role -> {"user":{"age":25,"name":"CyberGo","role":"admin"}}
```

::: tip Описание формата вывода
JSON-строки, возвращаемые `set`/`delete`, имеют **компактный формат** (без лишних пробелов), а ключи объектов отсортированы в лексикографическом порядке (как в `encoding/json`, что обеспечивает детерминированный вывод). Для красивого вывода примените [`Prettify`](./output#prettify) к результату.
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
            fmt.Printf("%s не удалась: %v\n", r.ID, r.Error)
            continue
        }
        fmt.Printf("%s -> %s\n", r.ID, r.Result)
    }
}
// Вывод:
// drop-temp -> {"debug":true,"user":{"age":25,"name":"CyberGo"}}
// drop-debug -> {"user":{"age":25,"name":"CyberGo","temp":"x"}}
```

### validate — пакетная проверка

`Result` операции `validate` всегда `map[string]any{"valid": bool}`; при некорректном JSON `valid` равно `false`, а `Error` несёт ошибку разбора.

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

`ProcessBatch` **всегда обрабатывает все операции**: сбой одной операции лишь записывается в поле `Error` её результата, не прерывая последующие операции и не требуя никакой настройки. Поэтому результаты пакета могут быть «частично успешными, частично неудачными» — обязательно проверяйте `r.Error` для каждой записи:

```go
results, err := json.ProcessBatch(operations)
if err != nil {
    // err возникает только при закрытии процессора, неверной конфигурации или превышении MaxBatchSize
    panic(err)
}
var failed int
for _, r := range results {
    if r.Error != nil {
        failed++
        log.Printf("Операция %s не удалась: %v", r.ID, r.Error)
        continue
    }
    // Обработка r.Result ...
}
```

::: tip Отличие от ContinueOnError
Поле `Config.ContinueOnError` управляет отказоустойчивостью [`SetMultiple`](./modify#setmultiple) (продолжать ли запись остальных путей при сбое одного), **но не действует** на `ProcessBatch`. Изоляция по операциям в `ProcessBatch` — встроенное поведение, которое нельзя отключить этим переключателем.
:::

## Практический сценарий: пакетная миграция данных

Добавим миграционную отметку партии записей — один вызов `ProcessBatch` выполнит все преобразования и соберёт выход каждой записи:

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    // Имитация нескольких записей, прочитанных из источника данных
    records := []string{
        `{"id":1,"name":"Alice","age":30}`,
        `{"id":2,"name":"Bob","age":25}`,
        `{"id":3,"name":"CyberGo","age":28}`,
    }

    // Для каждой записи создаётся операция set, единообразно помечающая миграцию
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
            fmt.Printf("%s не удалась: %v\n", r.ID, r.Error)
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

Предварительно вычисляет и помещает в кэш горячие пути для одного JSON, чтобы последующий первый `Get` сразу попал в кэш. Требует включённого кэша процессора (по умолчанию включён), иначе возвращает `ErrCacheDisabled`.

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

    // После прогрева первый Get попадает в кэш
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
| `SuccessRate` | `float64` | Доля успеха (проценты) |
| `FailedPaths` | `[]string` | Список неудачных путей (nil при отсутствии неудач) |

Если все пути завершились неудачей, `WarmupCache` возвращает `WarmupResult` вместе с последней ошибкой.

## Определения типов

### BatchOperation

Структура описания пакетной операции.

```go
type BatchOperation struct {
    Type    string `json:"type"`     // Тип операции: "get", "set", "delete", "validate"
    JSONStr string `json:"json_str"` // Целевая JSON-строка
    Path    string `json:"path"`     // Выражение пути
    Value   any    `json:"value"`    // Значение операции (для set)
    ID      string `json:"id"`       // Идентификатор операции
}
```

### BatchResult

Структура результата пакетной операции.

```go
type BatchResult struct {
    ID     string `json:"id"`     // Идентификатор операции
    Result any    `json:"result"` // Результат операции (смысл зависит от Type, см. таблицу выше)
    Error  error  `json:"error"`  // Ошибка (на уровне одной операции)
}
```

::: tip Пакетные методы Processor
Экземпляр Processor предоставляет эквивалентный метод `p.ProcessBatch(operations)` с той же сигнатурой, что и функция уровня пакета — подходит для повторного использования Processor или настройки по `Config` (например, вывод `Pretty`, `PreserveNumbers`). Подробнее см. [Пакетные операции Processor](../processor/batch).
:::

## См. также

- [Функции изменения](./modify) - операции изменения: Set, SetMultiple, MergeJSON и др.
- [Пакетные операции Processor](../processor/batch) - подробное описание пакетных операций уровня Processor
- [Сервисные функции](../helpers) - утилиты WarmupCache, ClearCache, GetStats и др.
