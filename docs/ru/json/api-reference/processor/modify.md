---
sidebar_label: "Изменение данных"
title: "Изменение данных Processor - CyberGo JSON | API справочник"
description: "Методы изменения CyberGo JSON Processor: Set установка, SetMultiple, SetCreate автосоздание путей и SetMultipleCreate, поддержка цепочечных вызовов."
sidebar_position: 3
---

# Методы изменения данных

Processor предоставляет методы изменения данных, все методы **возвращают новую изменённую JSON-строку** (неизменяемая семантика, исходная строка не изменяется) с поддержкой цепочечных вызовов. Методы удаления см. в [Операции удаления](./delete).

## Неизменяемая семантика

Все методы изменения возвращают **новую JSON-строку**, исходная входная строка никогда не изменяется (строки в Go и так неизменяемы). При сбое операции возвращаются исходная строка и ошибка, обеспечивая безопасную деградацию:

```go
original := `{"user":{"name":"Alice"}}`

// Set возвращает новую строку, original не изменяется
modified, err := p.Set(original, "user.name", "Bob")
// original остаётся {"user":{"name":"Alice"}}
// modified становится {"user":{"name":"Bob"}}

// При сбое возвращается исходная строка + ошибка
result, err := p.Set(original, "nonexistent.deep.path", "x")
// result == original (при CreatePaths=false и несуществующем пути)
```

**Полный пример**

```go
package main

import (
    "fmt"

    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New()
    if err != nil {
        panic(err)
    }
    defer p.Close()

    original := `{"user":{"name":"Alice"}}`
    modified, err := p.Set(original, "user.name", "Bob")
    if err != nil {
        panic(err)
    }
    fmt.Println(original) // Вывод: {"user":{"name":"Alice"}}
    fmt.Println(modified) // Вывод: {"user":{"name":"Bob"}}
}
```

## Set

Сигнатура: `func (p *Processor) Set(jsonStr, path string, value any, cfg ...Config) (result string, err error)`

Устанавливает значение по указанному пути, возвращает изменённую JSON-строку. Автоматическое создание несуществующих промежуточных путей зависит от `Config.CreatePaths` (см. [CreatePaths и SetCreate](#createpaths-и-setcreate)).

```go
result, err := p.Set(data, "user.name", "NewName")
```

Поддерживается установка значений разных типов:

```go
// Строка
result, _ := p.Set(data, "user.name", "CyberGo")

// Число
result, _ = p.Set(data, "user.age", 25)

// Логическое значение
result, _ = p.Set(data, "user.active", true)

// Объект
result, _ = p.Set(data, "user.profile", map[string]any{
    "bio":      "Developer",
    "location": "China",
})

// Массив
result, _ = p.Set(data, "items", []any{"a", "b", "c"})
```

**Полный пример: изменение вложенного пути**

```go
package main

import (
    "fmt"

    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New()
    if err != nil {
        panic(err)
    }
    defer p.Close()

    data := `{"user":{"name":"Alice","address":{"city":"Beijing"}}}`
    result, err := p.Set(data, "user.address.city", "Shanghai")
    if err != nil {
        panic(err)
    }
    fmt.Println(result)
    // Вывод: {"user":{"address":{"city":"Shanghai"},"name":"Alice"}}
}
```

## SetMultiple

Сигнатура: `func (p *Processor) SetMultiple(jsonStr string, updates map[string]any, cfg ...Config) (string, error)`

Пакетная установка значений по нескольким путям, возвращает изменённую JSON-строку. По сравнению с многократными вызовами `Set`, `SetMultiple` разбирает JSON один раз и применяет все обновления за один обход — эффективнее. Создание путей зависит от `Config.CreatePaths`.

```go
result, err := p.SetMultiple(data, map[string]any{
    "user.name":   "CyberGo",
    "user.age":    25,
    "user.active": true,
})
```

**Полный пример: пакетное обновление существующих полей**

```go
package main

import (
    "fmt"

    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New()
    if err != nil {
        panic(err)
    }
    defer p.Close()

    data := `{"user":{"name":"Alice","age":25,"email":"a@x.com"}}`
    result, err := p.SetMultiple(data, map[string]any{
        "user.name":  "Bob",
        "user.age":   26,
        "user.email": "b@x.com",
    })
    if err != nil {
        panic(err)
    }
    fmt.Println(result)
    // Вывод: {"user":{"age":26,"email":"b@x.com","name":"Bob"}}
}
```

## SetCreate

Сигнатура: `func (p *Processor) SetCreate(jsonStr, path string, value any, cfg ...Config) (string, error)`

Устанавливает значение и **автоматически создаёт несуществующие промежуточные пути**. Это удобная обёртка `Set` + `CreatePaths=true`, создающая пути независимо от собственной конфигурации процессора. Подробнее см. [CreatePaths и SetCreate](#createpaths-и-setcreate).

**Создание промежуточного объекта**

```go
// user.profile автоматически создаётся как объект, если не существует
result, err := p.SetCreate(data, "user.profile.bio", "Developer")
// {"user":{"profile":{"bio":"Developer"}}}
```

**Полный пример: автоматическое создание промежуточных объектов и массивов**

```go
package main

import (
    "fmt"

    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New()
    if err != nil {
        panic(err)
    }
    defer p.Close()

    data := `{"user":{"name":"Alice"}}`

    // Создание вложенного объекта: user.profile.bio
    result, err := p.SetCreate(data, "user.profile.bio", "Developer")
    if err != nil {
        panic(err)
    }
    fmt.Println(result)
    // Вывод: {"user":{"name":"Alice","profile":{"bio":"Developer"}}}

    // Создание массива: user.tags[0] — если не существует, создаётся массив с заполнением индекса 0
    result, err = p.SetCreate(data, "user.tags[0]", "admin")
    if err != nil {
        panic(err)
    }
    fmt.Println(result)
    // Вывод: {"user":{"name":"Alice","tags":["admin"]}}
}
```

## SetMultipleCreate

Сигнатура: `func (p *Processor) SetMultipleCreate(jsonStr string, updates map[string]any, cfg ...Config) (string, error)`

Пакетная установка нескольких значений с автоматическим созданием промежуточных путей. Удобная обёртка `SetMultiple` + `CreatePaths=true`.

```go
result, err := p.SetMultipleCreate(data, map[string]any{
    "user.profile.bio":      "Developer",
    "user.profile.location": "China",
})
```

**Полный пример: пакетное создание вложенной структуры из пустого объекта**

```go
package main

import (
    "fmt"

    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New()
    if err != nil {
        panic(err)
    }
    defer p.Close()

    data := `{}`
    result, err := p.SetMultipleCreate(data, map[string]any{
        "user.name":        "Alice",
        "user.profile.bio": "Developer",
    })
    if err != nil {
        panic(err)
    }
    fmt.Println(result)
    // Вывод: {"user":{"name":"Alice","profile":{"bio":"Developer"}}}
}
```

## Добавление элементов массива

Использование синтаксиса `[+]` в пути позволяет добавить элемент в конец массива без предварительного знания его длины. `[+]` должен следовать за путём к существующему массиву (например, `items[+]`).

```go
data := `{"items":["a","b"]}`

// Добавление одного элемента
result, err := p.Set(data, "items[+]", "c")
// {"items":["a","b","c"]}

// Добавление нескольких элементов (переданный срез разворачивается)
result, err = p.Set(data, "items[+]", []any{"c", "d"})
// {"items":["a","b","c","d"]}
```

**Полный пример**

```go
package main

import (
    "fmt"

    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New()
    if err != nil {
        panic(err)
    }
    defer p.Close()

    data := `{"items":["a","b"]}`
    result, err := p.Set(data, "items[+]", "c")
    if err != nil {
        panic(err)
    }
    fmt.Println(result)
    // Вывод: {"items":["a","b","c"]}
}
```

## CreatePaths и SetCreate

Автоматическое создание путей управляется из двух точек; понимание различий поможет выбрать между «конфигурацией процессора» и «принудительным вызовом»:

| Способ | Поведение | Сценарий применения |
|------|------|----------|
| `Config.CreatePaths` (по умолчанию `true`) | Переключатель уровня процессора, влияет на `Set` / `SetMultiple` | Создание **специализированного** процессора с единым включением/отключением создания путей |
| `SetCreate` / `SetMultipleCreate` | Принудительно `CreatePaths=true`, **переопределяет** конфигурацию процессора | Периодическая необходимость создания путей без изменения конфигурации процессора |

**Приоритет конфигурации** (от высокого к низкому):

1. **`SetCreate` / `SetMultipleCreate`** — всегда принудительно `CreatePaths=true`.
2. **per-call `cfg`** — явно переданный `cfg` полностью переопределяет настройки процессора (включая их отключение).
3. **`Config.CreatePaths` процессора** — действует при отсутствии `cfg`.

```go
// Создание процессора с отключённым созданием путей
cfg := json.DefaultConfig()
cfg.CreatePaths = false
p, _ := json.New(cfg)

// Set следует конфигурации процессора: при отсутствии пути возвращается ошибка
_, err := p.Set(`{"user":{}}`, "user.profile.bio", "x") // err не nil

// SetCreate принудительно создаёт: независимо от конфигурации процессора
result, _ := p.SetCreate(`{"user":{}}`, "user.profile.bio", "x")
// {"user":{"profile":{"bio":"x"}}}

// per-call cfg переопределяет настройки процессора (здесь повторно включает)
result, _ = p.Set(`{"user":{}}`, "user.profile.bio", "x", json.DefaultConfig())
// {"user":{"profile":{"bio":"x"}}}
```

## Цепочечное изменение

Методы изменения возвращают новую строку; результат предыдущего шага можно использовать как ввод для следующего, формируя цепочку:

```go
processor, _ := json.New()

result1, _ := processor.Set(data, "user.name", "CyberGo")
result2, _ := processor.Set(result1, "user.version", "1.0.0")
finalResult, _ := processor.Delete(result2, "user.temporary")
```

## Методы слияния Processor

Processor предоставляет методы экземпляра, соответствующие функциям уровня пакета [MergeJSON](../functions/modify#mergejson), [MergeMany](../functions/modify#mergemany), [CompareJSON](../helpers#comparejson).

### Processor.MergeJSON

Сигнатура: `func (p *Processor) MergeJSON(json1, json2 string, cfg ...Config) (string, error)`

Разбирает параметры из cfg (**при отсутствии cfg используется DefaultConfig, а не собственная конфигурация процессора** — если процессор создан с пользовательским MergeMode, нужно явно передать cfg для применения этого режима), выполняет глубокое слияние двух объектов согласно `Config.MergeMode`, затем перекодирует результат этим процессором.

Как и функция уровня пакета, `Processor.MergeJSON` не выполняет проверку безопасности — это структурный инструмент, выполняющий только декодирование, глубокое слияние и кодирование. Для проверки безопасности используйте `CompareJSON` (всегда выполняет проверку безопасности; при передаче cfg — по cfg, иначе — по собственной конфигурации процессора).

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

// Объединяющее слияние (по умолчанию)
result, err := p.MergeJSON(base, override)

// Пересекающее слияние
cfg := json.DefaultConfig()
cfg.MergeMode = json.MergeIntersection
result, err = p.MergeJSON(base, override, cfg)
```

### Processor.MergeMany

Сигнатура: `func (p *Processor) MergeMany(jsons []string, cfg ...Config) (string, error)`

Свёртывает срез слева направо через `MergeJSON`; стратегия слияния определяется `Config.MergeMode` (по умолчанию `MergeUnion`). При менее чем 2 JSON-строках возвращается ошибка; при сбое любого шага слияния возвращается ошибка с индексом сбойного шага.

```go
result, err := p.MergeMany([]string{config1, config2, config3})
```

### Processor.CompareJSON

Сигнатура: `func (p *Processor) CompareJSON(json1, json2 string, cfg ...Config) (bool, error)`

Сравнивает две JSON-строки на равенство (нормализация чисел, независимость от порядка ключей).

::: warning Отличие от CompareJSON уровня пакета
Функция уровня пакета `CompareJSON` без cfg не выполняет проверку безопасности и маршалирует обе стороны через `encoding/json`; метод Processor **всегда** выполняет проверку безопасности (при передаче cfg — по cfg, иначе — по собственной конфигурации процессора) и использует библиотечный кодировщик для симметричного маршалинга обеих сторон, обеспечивая симметричное применение настроек кодирования (например, `EscapeHTML`).
:::

```go
equal, err := p.CompareJSON(a, b)
equal, err = p.CompareJSON(a, b, json.SecurityConfig())
```

## См. также

- [Запросы по пути](./query) - методы серии Get
- [Операции удаления](./delete) - методы Delete/DeleteClean
- [Пакетные операции](./batch) - пакетная обработка ProcessBatch
- [Функции изменения](../functions/modify) - функции Set/SetMultiple/MergeJSON уровня пакета
