---
sidebar_label: "Разбор и проверка"
title: "Разбор и проверка Processor - CyberGo JSON | API справочник"
description: "Методы разбора CyberGo JSON Processor: Valid проверка, Parse, ParseAny, PreParse с оптимизацией и GetFromParsed для быстрого запроса."
sidebar_position: 6
---

# Методы разбора и проверки

Processor предоставляет методы разбора и проверки корректности JSON. Чтение/запись файлов и потоковая загрузка см. в [Файловые операции](./file-io).

## Методы проверки

### Valid

Сигнатура: `func (p *Processor) Valid(jsonStr string, cfg ...Config) (bool, error)`

Проверяет, является ли JSON-строка корректной. При корректности возвращает `(true, nil)`; при некорректности — `(false, error)`, ошибка несёт конкретную причину.

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

    cases := []string{
        `{"name":"CyberGo","age":25}`,
        `{"name":}`,
    }
    for _, c := range cases {
        valid, err := p.Valid(c)
        fmt.Printf("valid=%-5v есть ошибка=%v\n", valid, err != nil)
    }
}
// Вывод:
// valid=true  есть ошибка=false
// valid=false есть ошибка=true
```

### ValidBytes

Сигнатура: `func (p *Processor) ValidBytes(data []byte) bool`

Проверяет, является ли срез байт корректным JSON, возвращает только логическое значение (совместимо по сигнатуре с `encoding/json.Valid`, подходит для быстрой проверки без подробностей ошибки).

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

    fmt.Println(p.ValidBytes([]byte(`{"ok":true}`))) // true
    fmt.Println(p.ValidBytes([]byte(`{not json}`)))   // false
}
// Вывод:
// true
// false
```

## Методы разбора

### Parse

Сигнатура: `func (p *Processor) Parse(jsonStr string, target any, cfg ...Config) error`

Разбирает JSON-строку в целевую переменную; `target` должен быть непустым указателем. Поддерживает разбор в `map[string]any`, структуру или `any`, с возможностью переключения режима сохранения чисел через `Config`.

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

type User struct {
    Name string `json:"name"`
    Age  int    `json:"age"`
}

func main() {
    p, err := json.New(json.DefaultConfig())
    if err != nil {
        panic(err)
    }
    defer p.Close()

    data := `{"name":"CyberGo","age":25}`

    // Разбор в map[string]any (числа по умолчанию float64)
    var obj map[string]any
    if err := p.Parse(data, &obj); err != nil {
        panic(err)
    }
    fmt.Printf("map: name=%v age=%T(%v)\n", obj["name"], obj["age"], obj["age"])

    // Разбор в структуру
    var u User
    if err := p.Parse(data, &u); err != nil {
        panic(err)
    }
    fmt.Printf("struct: %+v\n", u)
}
// Вывод:
// map: name=CyberGo age=float64(25)
// struct: {Name:CyberGo Age:25}
```

### ParseAny

Сигнатура: `func (p *Processor) ParseAny(jsonStr string, cfg ...Config) (any, error)`

Разбирает JSON-строку и напрямую возвращает корневое значение как `any`, без предварительного объявления целевого типа. Внутренне эквивалентно `Parse(jsonStr, &v)`.

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

    data, err := p.ParseAny(`{"name":"CyberGo","age":25}`)
    if err != nil {
        panic(err)
    }
    obj := data.(map[string]any)
    fmt.Printf("name=%v age=%v\n", obj["name"], obj["age"])
}
// Вывод:
// name=CyberGo age=25
```

### Режим PreserveNumbers

По умолчанию (`PreserveNumbers=false`) все JSON-числа разбираются как `float64`, что теряет точность больших целых и меняет форму записи дробных. При включении `PreserveNumbers=true` числа сохраняются как `json.Number` (внутренне — исходная строка), полностью сохраняя исходный формат и точность — подходит для сумм, больших целых, научной нотации и т. п. Следующий пример наглядно показывает разницу Go-типов чисел в двух режимах через `%T`:

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

    data := `{"id":42,"price":19.99}`

    // Режим по умолчанию: все числа разбираются как float64
    var def any
    if err := p.Parse(data, &def); err != nil {
        panic(err)
    }
    defM := def.(map[string]any)
    fmt.Printf("По умолчанию  : id тип=%T значение=%v\n", defM["id"], defM["id"])

    // Режим PreserveNumbers: числа сохраняются как json.Number
    cfg := json.DefaultConfig()
    cfg.PreserveNumbers = true
    var preserved any
    if err := p.Parse(data, &preserved, cfg); err != nil {
        panic(err)
    }
    preM := preserved.(map[string]any)
    fmt.Printf("Сохранение чисел: id тип=%T значение=%v\n", preM["id"], preM["id"])
}
// Вывод:
// По умолчанию  : id тип=float64 значение=42
// Сохранение чисел: id тип=json.Number значение=42
```

::: tip Когда включать
Рекомендуется включать `PreserveNumbers` при работе с финансовыми суммами, целыми числами за пределами точного представления `float64` (около ±2^53, т. е. 9007199254740992) или при необходимости записывать числа без изменений (избегая взаимных преобразований `19.99` и `19.990000`). Например, `9007199254740993` (2^53+1) в режиме по умолчанию будет округлено до `9007199254740992`, а в режиме `json.Number` сохранит исходное значение. Обратите внимание, что для `json.Number` требуется явное извлечение значения через `.Int64()` / `.Float64()` / `.String()`.
:::

## Оптимизация предразбора (PreParse)

При многократных запросах по путям к **одному и тому же JSON** последовательные вызовы [`Get`](./query) повторно разбирают весь документ. `PreParse` разбирает JSON один раз, после чего `GetFromParsed` выполняет только навигацию по уже разобранным данным, минуя повторный разбор.

### PreParse

Сигнатура: `func (p *Processor) PreParse(jsonStr string, cfg ...Config) (*ParsedJSON, error)`

Предварительно разбирает JSON и возвращает переиспользуемый `*ParsedJSON`. После использования следует вызвать `parsed.Release()` для освобождения ссылки на процессор.

### GetFromParsed

Сигнатура: `func (p *Processor) GetFromParsed(parsed *ParsedJSON, path string, cfg ...Config) (any, error)`

Получает значение по пути из предварительно разобранных данных, минуя разбор JSON — выполняется только навигация по пути.

### Полный сравнительный пример

Следующий пример сравнивает «многократный пакетный `Get` (повторный разбор каждый раз)» и «`PreParse` + `GetFromParsed` (разбор один раз)» — результаты одинаковы, но второй способ значительно быстрее при большом числе запросов или большом документе:

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

    data := `{"user":{"name":"CyberGo","age":25},"meta":{"version":2,"env":"prod"}}`

    // Способ 1: каждый пакетный Get повторно разбирает JSON
    name1, err := json.Get(data, "user.name")
    if err != nil {
        panic(err)
    }
    age1, err := json.Get(data, "user.age")
    if err != nil {
        panic(err)
    }
    ver1, err := json.Get(data, "meta.version")
    if err != nil {
        panic(err)
    }

    // Способ 2: PreParse разбирает один раз, GetFromParsed переиспользует результат (рекомендуется для многократных запросов)
    parsed, err := p.PreParse(data)
    if err != nil {
        panic(err)
    }
    defer parsed.Release()

    name2, err := p.GetFromParsed(parsed, "user.name")
    if err != nil {
        panic(err)
    }
    age2, err := p.GetFromParsed(parsed, "user.age")
    if err != nil {
        panic(err)
    }
    ver2, err := p.GetFromParsed(parsed, "meta.version")
    if err != nil {
        panic(err)
    }

    fmt.Println("Get     :", name1, age1, ver1)
    fmt.Println("PreParse:", name2, age2, ver2)
}
// Вывод:
// Get     : CyberGo 25 2
// PreParse: CyberGo 25 2
```

### SetFromParsed

Сигнатура: `func (p *Processor) SetFromParsed(parsed *ParsedJSON, path string, value any, cfg ...Config) (*ParsedJSON, error)`

Устанавливает значение в предварительно разобранных данных, возвращая **новый** `*ParsedJSON` (внутреннее глубокое копирование, исходные данные не изменяются), на новом результате можно продолжить запросы `GetFromParsed`.

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

    parsed, err := p.PreParse(`{"user":{"name":"CyberGo","age":25}}`)
    if err != nil {
        panic(err)
    }
    defer parsed.Release()

    // SetFromParsed возвращает новый ParsedJSON, исходные данные не изменяются
    modified, err := p.SetFromParsed(parsed, "user.name", "Bob")
    if err != nil {
        panic(err)
    }
    defer modified.Release()

    oldName, _ := p.GetFromParsed(parsed, "user.name")
    newName, _ := p.GetFromParsed(modified, "user.name")
    ageAfter, _ := p.GetFromParsed(modified, "user.age")
    fmt.Println("Исходные name :", oldName)
    fmt.Println("Изменённые name:", newName)
    fmt.Println("Изменённые age :", ageAfter)
}
// Вывод:
// Исходные name : CyberGo
// Изменённые name: Bob
// Изменённые age : 25
```

### Тип ParsedJSON

`ParsedJSON` инкапсулирует разобранные данные и информацию о кэше; поля не экспортируются, доступны только два метода:

| Метод | Описание |
|------|------|
| `Data() any` | Возвращает нижележащие разобранные данные (обычно `map[string]any` или `[]any`) |
| `Release()` | Освобождает ссылку на процессор; после вызова `Data()` возвращает `nil`, следует использовать с `defer` |

## Руководство по выбору метода

| Сценарий | Рекомендуемый метод | Ввод | Вывод |
|------|----------|------|------|
| Только проверка корректности (без подробностей ошибки) | `ValidBytes` | `[]byte` | `bool` |
| Проверка корректности с причиной сбоя | `Valid` | `string` | `(bool, error)` |
| Разбор в структуру/конкретный тип | `Parse` | `string` | Запись в указатель `target` |
| Разбор в `any` (без предварительного объявления типа) | `ParseAny` | `string` | `any` |
| Совместимость с `encoding/json` (ввод `[]byte`) | [`Unmarshal`](./output#unmarshal) | `[]byte` | Запись в указатель `target` |
| Многократные запросы по путям к одному JSON | `PreParse` + `GetFromParsed` | `string` | `*ParsedJSON` / `any` |
| Изменение разобранных данных с последующим запросом | `PreParse` + `SetFromParsed` + `GetFromParsed` | `string` | `*ParsedJSON` |
| Сохранение исходной точности чисел | Любой из методов разбора + `Config{PreserveNumbers: true}` | — | Числа как `json.Number` |

::: tip Parse vs ParseAny vs Unmarshal
- **`Unmarshal(data, &v)`**: полностью совместим со стандартной библиотекой `encoding/json`, ввод — `[]byte`, подходит для прямой замены стандартной библиотеки или обработки сетевых/файловых потоков байт.
- **`Parse(jsonStr, &v)`**: ввод — `string`, семантика та же, что у `Unmarshal`, но нативно поддерживает `Config` (ограничения безопасности, `PreserveNumbers` и т. д.) — лучший выбор для повседневного разбора.
- **`ParseAny(jsonStr)`**: не требует предварительного объявления целевого типа, напрямую возвращает `any` — подходит для сценариев с неизвестной структурой или одноразовым извлечением значения.

Базовые возможности разбора у всех трёх эквивалентны; различия только в типе ввода и необходимости подготовки целевой переменной.
:::

## См. также

- [Файловые операции](./file-io) - файловые методы LoadFromFile/SaveToFile и др.
- [Методы вывода](./output) - методы кодирования Encode/EncodePretty/Unmarshal
- [Запросы по пути](./query) - методы серии Get
- [Функции разбора уровня пакета](../functions/parse) - Parse/ParseAny/Valid без Processor
