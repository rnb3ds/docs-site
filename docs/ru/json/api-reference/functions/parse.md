---
sidebar_label: "Парсинг и валидация"
title: "Функции парсинга и валидации - CyberGo JSON | Справочник API"
description: "Функции парсинга и валидации CyberGo JSON: Parse/ParseAny, Valid/ValidWithConfig, ValidateSchema для JSON Schema, проверки безопасности до разбора."
sidebar_position: 6
---

# Функции парсинга и валидации

Функции парсинга и валидации пакета json: парсинг JSON в целевые объекты, парсинг через экземпляр Processor, а также проверка корректности JSON и валидация JSON Schema.

## Функции парсинга

### Parse

Сигнатура: `func Parse(jsonStr string, target any, cfg ...Config) error`

Парсит JSON-строку в объект, на который указывает `target`. `target` должен быть **не-nil указателем** (передача `nil` или не-указателя возвращает ошибку аргумента). Как и `Get`, `Parse` перед разбором проверяет ввод на безопасность (размер, глубина вложенности, опасные паттерны — с учётом `cfg` и конфигурации процессора).

**Параметры**

| Имя | Тип | Обязателен | Описание |
|------|------|------|------|
| `jsonStr` | `string` | да | JSON-строка |
| `target` | `any` | да | Указатель на целевой объект |
| `cfg` | `Config` | нет | Необязательная конфигурация |

**Базовый парсинг**

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	var data map[string]any
	err := json.Parse(`{"name": "test"}`, &data)
	if err != nil {
		panic(err)
	}
	fmt.Println(data) // map[name:test]
}
```

**Парсинг в структуру**

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

type Person struct {
	Name string `json:"name"`
	Age  int    `json:"age"`
}

func main() {
	var person Person
	err := json.Parse(`{"name": "CyberGo", "age": 30}`, &person)
	if err != nil {
		panic(err)
	}
	fmt.Printf("Name: %s, Age: %d\n", person.Name, person.Age)
}
```

**С пользовательской конфигурацией**

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	cfg := json.DefaultConfig()
	var data map[string]any
	err := json.Parse(`{"name": "test"}`, &data, cfg)
	if err != nil {
		panic(err)
	}
	fmt.Println(data)
}
```

### ParseAny

Сигнатура: `func ParseAny(jsonStr string, cfg ...Config) (any, error)`

Парсит JSON-строку и возвращает корневое значение типа `any` — целевую переменную объявлять заранее не нужно.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	result, err := json.ParseAny(`{"name": "test"}`)
	if err != nil {
		panic(err)
	}
	fmt.Println(result) // map[name:test]
}
```

::: tip Parse или ParseAny
- `Parse(jsonStr, &target)` — парсинг в целевой указатель, переменную нужно объявить заранее
- `ParseAny(jsonStr)` — сразу возвращает `any`, предварительное объявление не требуется
:::

### Processor.Parse

Сигнатура: `func (p *Processor) Parse(jsonStr string, target any, cfg ...Config) error`

Парсит JSON в целевой указатель через экземпляр Processor.

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

var data map[string]any
err = p.Parse(`{"name": "test"}`, &data)
if err != nil {
	panic(err)
}
```

### Processor.ParseAny

Сигнатура: `func (p *Processor) ParseAny(jsonStr string, cfg ...Config) (any, error)`

Парсит JSON через экземпляр Processor и возвращает `any`; поведение совпадает с пакетной `ParseAny`.

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

data, err := p.ParseAny(`{"name": "test"}`)
```

Подробнее см. [Методы парсинга Processor](../processor/parse#методы-парсинга).

## Функции валидации

### Valid

Сигнатура: `func Valid(data []byte, cfg ...Config) bool`

Проверяет, является ли срез JSON-байтов корректным. 100% совместим с `encoding/json.Valid`: вызов `json.Valid(data)` без cfg полностью идентичен стандартной библиотеке и возвращает обычный `bool`.

Необязательный хвостовой `Config` применяет лимиты безопасности (размер, глубина вложенности, полное сканирование безопасности и др.). При передаче cfg `Valid` делегирует `Processor.Valid`, сворачивая любую ошибку в `false`.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := []byte(`{"name": "test"}`)
	// Совместимость с encoding/json (без cfg)
	if json.Valid(data) {
		fmt.Println("Корректный JSON")
	}

	// С конфигурацией (необязательный параметр, не нарушает совместимость)
	if json.Valid(data, json.SecurityConfig()) {
		fmt.Println("Прошёл проверку безопасности")
	}
}
```

::: tip Valid или ValidWithConfig
- `Valid(data, cfg)` возвращает одиночный `bool` (совместимость с `encoding/json`), любая ошибка сворачивается в `false`
- `ValidWithConfig(jsonStr, cfg)` возвращает `(bool, error)` — удобно проверять причину неудачной валидации

Обе принимают `cfg`; разница в именах — историческое наследие.
:::

### ValidWithConfig

Сигнатура: `func ValidWithConfig(jsonStr string, cfg ...Config) (bool, error)`

Проверяет JSON-строку на корректность с использованием конфигурации и возвращает возможную ошибку.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	cfg := json.DefaultConfig()
	valid, err := json.ValidWithConfig(`{"name": "test"}`, cfg)
	if err != nil {
		panic(err)
	}
	if valid {
		fmt.Println("Корректный JSON")
	}
}
```

### ValidateSchema

Сигнатура: `func ValidateSchema(jsonStr string, schema *Schema, cfg ...Config) ([]ValidationError, error)`

Валидирует JSON-данные по JSON Schema. Возвращает список всех ошибок валидации.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	schema := &json.Schema{
		Type:     "object",
		Required: []string{"name", "email"},
		Properties: map[string]*json.Schema{
			"name":  {Type: "string"},
			"email": {Type: "string", Format: "email"},
			"age":   {Type: "number"}, // Для чисел всегда "number" (включая целые)
		},
	}

	errors, err := json.ValidateSchema(`{"name":"Alice","email":"alice@example.com","age":25}`, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errors {
		fmt.Printf("Путь %s: %s\n", e.Path, e.Message)
	}
}
```

::: warning Два важных замечания
- Значение `Type` не включает `"integer"` — после разбора JSON все числа являются `float64`, поэтому для чисел всегда используйте `"number"`.
- **Ограничения длины/диапазона** вида `MinLength`/`Minimum`, записанные прямо в литерале `&json.Schema{...}`, не действуют — схему необходимо создавать через [`NewSchemaWithConfig`](../schema#способ-создания-schema). Подробнее см. [Валидация Schema](../schema).
:::

::: tip Подробнее
Полные определения типа Schema и порядок работы с валидатором см. в [Валидации Schema](../schema).
:::

## См. также

- [Функции запросов и получения](./query) - операции запросов Get, GetString и др.
- [Методы парсинга Processor](../processor/parse) - подробный разбор методов парсинга и валидации уровня Processor
