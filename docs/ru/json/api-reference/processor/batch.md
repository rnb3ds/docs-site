---
sidebar_label: "Пакетные операции"
title: "Пакетные операции Processor - CyberGo JSON | API справочник"
description: "Пакетные операции CyberGo JSON Processor: ProcessBatch для нескольких операций, типы BatchOperation и BatchResult, подходят для пакетной обработки."
sidebar_position: 7
---

# Методы пакетных операций

Processor предоставляет возможность пакетной обработки — за один вызов обрабатывается несколько JSON-операций (get/set/delete/validate). По сравнению с функцией уровня пакета [`ProcessBatch`](../functions/batch), форма Processor подходит для повторного использования экземпляра или настройки поведения каждого пакета через `Config` (красивый вывод, сохранение чисел, ограничения безопасности и т. д.).

## ProcessBatch

Сигнатура: `func (p *Processor) ProcessBatch(operations []BatchOperation, cfg ...Config) ([]BatchResult, error)`

Пакетная обработка нескольких JSON-операций. Порядок возвращаемых результатов соответствует порядку входных операций и связывается через поле `ID`.

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
| `get` | Чтение значения по пути | Значение по пути (`any`) | `ErrPathNotFound`, `ErrInvalidJSON` |
| `set` | Установка значения по пути | **Полная изменённая JSON-строка** | `ErrPathNotFound` (без `CreatePaths`), `ErrInvalidPath` |
| `delete` | Удаление узла по пути | **Полная JSON-строка после удаления** | `ErrPathNotFound`, `ErrInvalidPath` |
| `validate` | Проверка корректности JSON | `map[string]any{"valid": bool}` | При некорректном JSON `Result.valid=false` и `Error` не пустой |

::: warning Операции не образуют цепочку
Каждая `BatchOperation` **независимо** применяется к своему входу `JSONStr`, операции **не** накапливаются цепочкой. Сначала `set`, затем `delete` для одного документа дадут два независимых результата, а не комбинированное состояние «сначала изменить, потом удалить». Для многошаговых преобразований одного документа передавайте результат предыдущего шага в следующий в коде или используйте [`SetMultiple`](./modify#setmultiple) и другие методы с несколькими путями для одного документа.
:::

### Ограничение размера пакета

Количество операций ограничено `Config.MaxBatchSize` (по умолчанию `2000`). Этот предел действует «на каждый вызов» — переданный `cfg` (при наличии) переопределяет собственную конфигурацию Processor. При превышении весь пакет немедленно завершается ошибкой `(nil, ErrSizeLimit)`.

## Примеры по типам операций

### get — пакетное чтение

`Result` операции `get` — исходное значение по пути (числа по умолчанию `float64`).

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

`Result` операции `set` — **полная изменённая JSON-строка** (компактный формат, ключи объектов отсортированы лексикографически). По умолчанию `CreatePaths=true`, установка нового пути автоматически создаёт промежуточные узлы:

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
Переданный `Config` прозрачно передаётся в каждую операцию, но **не все поля влияют на вывод**: возвращаемые значения `set`/`delete` всегда являются компактными строками (не зависят от `Pretty`; для красивого вывода примените к результату [`Prettify`](./output#prettify)); реально по `cfg` действуют `MaxBatchSize` (верхний предел пакета), `CreatePaths` (разрешать ли `set` создавать новые пути) и `PreserveNumbers` (влияет на тип чисел, возвращаемых `get`: по умолчанию `float64`, при включении — `json.Number`).
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

### validate — пакетная проверка

`Result` операции `validate` всегда `map[string]any{"valid": bool}`; при некорректном JSON `valid` равно `false`, а `Error` несёт ошибку разбора.

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

В одном пакете можно смешивать операции разных типов, результаты возвращаются по порядку:

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
                fmt.Printf("Результат проверки: %v\n", m["valid"])
            }
        } else {
            fmt.Printf("%s: %v\n", r.ID, r.Result)
        }
    }
}
// Вывод:
// Результат проверки: true
// name: CyberGo
// mark: {"processed":true,"user":{"name":"CyberGo"}}
```

## Обработка ошибок и отказоустойчивость

### Сбой одной операции не прерывает пакет

`ProcessBatch` **всегда обрабатывает все операции**: сбой одной операции лишь записывается в поле `Error` её результата, не прерывая последующие операции и не требуя никакой настройки. Поэтому результаты пакета могут быть «частично успешными, частично неудачными» — обязательно проверяйте `r.Error` для каждой записи:

```go
results, err := p.ProcessBatch(operations)
if err != nil {
    // err возникает только при закрытии процессора, неверной конфигурации или превышении MaxBatchSize
    return err
}
for _, r := range results {
    if r.Error != nil {
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

Добавим миграционную отметку партии записей — один вызов `ProcessBatch` выполнит все преобразования. Форма Processor особенно удобна для повторного использования одного экземпляра в долгоживущих сервисах:

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

Сигнатура: `func (p *Processor) WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)`

Предварительно вычисляет и помещает в кэш горячие пути для одного JSON, чтобы последующий первый [`Get`](./query) сразу попал в кэш. Требует включённого кэша Processor (по умолчанию включён), иначе возвращает `ErrCacheDisabled`.

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
| `SuccessRate` | `float64` | Доля успеха (проценты) |
| `FailedPaths` | `[]string` | Список неудачных путей (nil при отсутствии неудач) |

Если все пути завершились неудачей, `WarmupCache` возвращает `WarmupResult` вместе с последней ошибкой.

## Определения типов

### Структура BatchOperation

```go
type BatchOperation struct {
    Type    string `json:"type"`     // Тип операции: "get", "set", "delete", "validate"
    JSONStr string `json:"json_str"` // JSON-строка
    Path    string `json:"path"`     // Целевой путь
    Value   any    `json:"value"`    // Значение операции set
    ID      string `json:"id"`       // Идентификатор операции
}
```

### Структура BatchResult

```go
type BatchResult struct {
    ID     string `json:"id"`     // Соответствующий идентификатор операции
    Result any    `json:"result"` // Результат операции (смысл зависит от Type, см. таблицу выше)
    Error  error  `json:"error"`  // Ошибка одной операции (не влияет на другие)
}
```

## Замечания

1. Каждая операция выполняется независимо — сбой одной не влияет на другие (встроенное поведение, не требует настройки)
2. Порядок результатов соответствует порядку операций, связь операций и результатов — через `ID`
3. `MaxBatchSize` (по умолчанию 2000) действует по `cfg` каждого вызова; при превышении весь пакет завершается ошибкой

## См. также

- [Запросы по пути](./query) - методы серии Get
- [Изменение данных](./modify) - методы Set/Delete/SetMultiple
- [Пакетные операции уровня пакета](../functions/batch) - ProcessBatch уровня пакета без Processor
