---
sidebar_label: "Парсинг и валидация"
title: "Парсинг и валидация Processor - CyberGo JSON | API"
description: "Методы парсинга CyberGo JSON Processor: Valid, ValidBytes, Parse, ParseAny, предразбор PreParse, быстрый запрос GetFromParsed и настройка через Config."
sidebar_position: 6
---

# Методы парсинга и валидации

Processor предоставляет методы разбора JSON и проверки корректности. Чтение/запись файлов и потоковая загрузка описаны в [Файловых операциях](./file-io). Поведение парсинга/валидации зеркально [пакетным функциям парсинга](../functions/parse); пакетный `Valid` возвращает одиночный `bool` (совместимость со стандартной библиотекой) — если нужна причина сбоя, используйте `Valid` с этой страницы или пакетный `ValidWithConfig`.

## Методы валидации

### Valid

Сигнатура: `func (p *Processor) Valid(jsonStr string, cfg ...Config) (bool, error)`

Проверяет, является ли JSON-строка корректной. Для корректной строки возвращает `(true, nil)`; для некорректной — `(false, error)`, ошибка содержит конкретную причину.

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

Проверяет, является ли срез байтов корректным JSON, и возвращает только логическое значение (сигнатура совместима с `encoding/json.Valid` — удобна для быстрой проверки без деталей ошибки).

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
	fmt.Println(p.ValidBytes([]byte(`{not json}`)))  // false
}

// Вывод:
// true
// false
```

## Методы парсинга

### Parse

Сигнатура: `func (p *Processor) Parse(jsonStr string, target any, cfg ...Config) error`

Парсит JSON-строку в целевую переменную; `target` должен быть не-nil указателем. Поддерживается парсинг в `map[string]any`, структуру или `any`; режим сохранения чисел переключается через `Config`.

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

	// Парсинг в map[string]any (числа по умолчанию float64)
	var obj map[string]any
	if err := p.Parse(data, &obj); err != nil {
		panic(err)
	}
	fmt.Printf("map: name=%v age=%T(%v)\n", obj["name"], obj["age"], obj["age"])

	// Парсинг в структуру
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

Парсит JSON-строку и возвращает корневое значение сразу как `any` — целевой тип объявлять заранее не нужно. Внутри эквивалентно `Parse(jsonStr, &v)`.

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

По умолчанию (`PreserveNumbers=false`) все JSON-числа разбираются в `float64`, что теряет точность больших целых и меняет форму записи дробей. При `PreserveNumbers=true` числа сохраняются во внутреннем типе `Number` (`%T` печатает `json.Number` — имя пакета библиотеки совпадает со стандартной библиотекой; внизу это исходная строка, а API полностью совпадает со стандартным `json.Number`) с полным сохранением исходного формата и точности — подходит для сумм денег, больших целых, научной записи и т.п. Пример ниже наглядно показывает через `%T` разницу Go-типов чисел в двух режимах:

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

	// Режим по умолчанию: все числа разбираются в float64
	var def any
	if err := p.Parse(data, &def); err != nil {
		panic(err)
	}
	defM := def.(map[string]any)
	fmt.Printf("По умолчанию : id тип=%T значение=%v\n", defM["id"], defM["id"])

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
// По умолчанию : id тип=float64 значение=42
// Сохранение чисел: id тип=json.Number значение=42
```

::: tip Когда включать
Включайте `PreserveNumbers` при работе с финансовыми суммами, целыми за пределами точного представления `float64` (примерно ±2^53, то есть 9007199254740992) или когда нужна запись чисел «как есть» (чтобы `19.99` не превращалось в `19.990000` и наоборот). Например, `9007199254740993` (2^53+1) в режиме по умолчанию округляется до `9007199254740992`, а в режиме `json.Number` сохраняет исходное значение. Обратите внимание: значения `json.Number` извлекаются явно через `.Int64()` / `.Float64()` / `.String()`.
:::

## Оптимизация предразбора (PreParse)

Когда по **одному и тому же JSON** выполняется много запросов по путям, повторные вызовы [`Get`](./query) каждый раз заново парсят весь документ. `PreParse` разбирает его один раз, после чего `GetFromParsed` навигирует прямо по разобранной структуре, устраняя повторные затраты на разбор.

### PreParse

Сигнатура: `func (p *Processor) PreParse(jsonStr string, cfg ...Config) (*ParsedJSON, error)`

Заранее разбирает JSON и возвращает переиспользуемый `*ParsedJSON`. По окончании работы следует вызвать `parsed.Release()`, освобождая ссылку на процессор.

### GetFromParsed

Сигнатура: `func (p *Processor) GetFromParsed(parsed *ParsedJSON, path string, cfg ...Config) (any, error)`

Получает значение по пути из предразобранных данных, пропуская разбор JSON и выполняя только навигацию по пути.

### Полный сравнительный пример

Пример сравнивает «многократный пакетный `Get` (разбор каждый раз)» и «`PreParse` + `GetFromParsed` (разбор однократно)»: результаты совпадают, но второй способ заметно быстрее при большом числе запросов или больших документах:

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

	// Способ 1: каждый пакетный Get заново парсит JSON
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

Устанавливает значение на предразобранных данных и возвращает **новый** `*ParsedJSON` (внутри — глубокая копия, исходные данные не изменяются); по новому результату можно продолжать запросы `GetFromParsed`.

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
	fmt.Println("Изменённые name :", newName)
	fmt.Println("Изменённые age :", ageAfter)
}

// Вывод:
// Исходные name : CyberGo
// Изменённые name : Bob
// Изменённые age : 25
```

### Тип ParsedJSON

`ParsedJSON` инкапсулирует разобранные данные и сведения кэша; поля не экспортируются, доступны только два метода:

| Метод | Описание |
|------|------|
| `Data() any` | Возвращает нижележащие разобранные данные (обычно `map[string]any` или `[]any`) |
| `Release()` | Освобождает ссылку на процессор; после вызова `Data()` возвращает `nil`, использовать с `defer` |

## Руководство по выбору метода

| Сценарий | Рекомендуемый метод | Вход | Выход |
|------|----------|------|------|
| Только проверить корректность (без деталей ошибки) | `ValidBytes` | `[]byte` | `bool` |
| Проверить корректность и получить причину сбоя | `Valid` | `string` | `(bool, error)` |
| Парсинг в структуру/конкретный тип | `Parse` | `string` | запись через указатель `target` |
| Парсинг в `any` (без объявления типа) | `ParseAny` | `string` | `any` |
| Совместимость с encoding/json (вход `[]byte`) | [`Unmarshal`](./output#unmarshal) | `[]byte` | запись через указатель `target` |
| Многократные запросы по путям к одному JSON | `PreParse` + `GetFromParsed` | `string` | `*ParsedJSON` / `any` |
| Изменить разобранные данные и продолжить запросы | `PreParse` + `SetFromParsed` + `GetFromParsed` | `string` | `*ParsedJSON` |
| Сохранить исходную точность чисел | любой из методов парсинга выше + `Config{PreserveNumbers: true}` | — | числа как `json.Number` |

::: tip Parse, ParseAny или Unmarshal
- **`Unmarshal(data, &v)`**: полная совместимость со стандартной `encoding/json`, вход — `[]byte`; подходит для прямой замены стандартной библиотеки или обработки байтовых потоков из сети/файлов.
- **`Parse(jsonStr, &v)`**: вход — `string`, семантика как у `Unmarshal`, но с нативной поддержкой `Config` (лимиты безопасности, `PreserveNumbers` и др.) — первый выбор для повседневного парсинга.
- **`ParseAny(jsonStr)`**: целевой тип объявлять не нужно, сразу возвращается `any` — для неизвестной структуры или разового чтения значения.

Низлежащая способность разбора у трёх методов эквивалентна; различия лишь во входном типе и необходимости заранее готовить целевую переменную.
:::

## См. также

- [Файловые операции](./file-io) - файловые методы LoadFromFile/SaveToFile и др.
- [Методы вывода](./output) - методы кодирования Encode/EncodePretty/Unmarshal
- [Запросы по путям](./query) - серия методов Get
- [Пакетные функции парсинга](../functions/parse) - Parse/ParseAny/Valid без Processor
