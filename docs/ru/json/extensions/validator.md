---
sidebar_label: "Валидатор Validator"
title: "Validator - CyberGo JSON | Валидатор схем"
description: "Валидатор CyberGo JSON: интерфейс Validator, структура проверки Schema, ошибка ValidationError и конфигурация SchemaConfig, полная проверка JSON-данных."
sidebar_position: 2
---

# Проверка по схеме

Библиотека json предоставляет возможности проверки данных на основе JSON Schema: определяется `Schema`, описывающая структуру и ограничения, которым должны удовлетворять данные, затем `ValidateSchema` проверяет фрагмент JSON. Это **полнофункциональная** система проверки в текущей версии.

## Функция ValidateSchema

`ValidateSchema` сверяет JSON-строку со `Schema` и возвращает список всех нарушенных ограничений:

```go
// Функция уровня пакета
func ValidateSchema(jsonStr string, schema *Schema, cfg ...Config) ([]ValidationError, error)

// Метод Processor
func (p *Processor) ValidateSchema(jsonStr string, schema *Schema, cfg ...Config) ([]ValidationError, error)
```

Семантика возвращаемых значений:

| Возвращаемое значение | Значение |
|--------|------|
| `([]ValidationError{}, nil)` | JSON корректен и **удовлетворяет всем ограничениям** |
| `([]ValidationError{...}, nil)` | JSON разбираем, но есть нарушения ограничений (срез не пуст) |
| `(nil, error)` | Сбой разбора или предшествующая ошибка (например, некорректный JSON, `schema` равна nil, превышение лимита) |

::: tip Ключевое различие
Нарушения ограничений выражаются через **возвращаемый срез** (`error` при этом `nil`); только при сбое разбора, `schema` равной nil, превышении лимита размера и т. п. возвращается не `nil` `error`. Поэтому для проверки «пройдена ли валидация» следует смотреть `len(errs) == 0`, а не `err != nil`.
:::

## Базовый пример: структура объекта и обязательные поля

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
			"age":   {Type: "number"},
		},
	}

	// Отсутствует обязательное поле email
	data := `{"name":"Alice","age":30}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// Вывод: email: required property 'email' is missing
}
```

## Обзор полей ограничений Schema

Поля ограничений, поддерживаемые `Schema` (сгруппированы по категориям):

| Категория | Поле | Применимый тип | Описание |
|------|------|----------|------|
| Структура | `Type` | Все | Значения см. в таблице ниже |
| Структура | `Required` | object | Список обязательных имён свойств |
| Структура | `Properties` | object | Подсхема для каждого свойства |
| Структура | `Items` | array | Подсхема для элементов |
| Структура | `AdditionalProperties` | object | `true` — разрешить дополнительные свойства, `false` — отклонить |
| Строки | `MinLength` / `MaxLength` | string | Диапазон длины (подсчёт по rune) |
| Строки | `Pattern` | string | Регулярное выражение |
| Строки | `Format` | string | Семантический формат (см. [таблицу значений Format](#поддерживаемые-значения-format)) |
| Числа | `Minimum` / `Maximum` | number | Диапазон значений |
| Числа | `ExclusiveMinimum` / `ExclusiveMaximum` | number | Исключение граничных значений |
| Числа | `MultipleOf` | number | Должно быть кратным этому значению |
| Массивы | `MinItems` / `MaxItems` | array | Диапазон количества элементов |
| Массивы | `UniqueItems` | array | `true` требует уникальности элементов |
| Значения | `Enum` | Все | Список допустимых перечислимых значений |
| Значения | `Const` | Все | Должно быть равно этому фиксированному значению |

Поддерживаемые значения `Type`: `object`, `array`, `string`, `number`, `boolean`, `null`.

::: warning Для числовых типов используйте "number"
После разбора JSON все числа (включая целые) являются `float64`, поэтому для числовых полей следует использовать `Type: "number"`. Числовые ограничения вроде `MultipleOf` также действуют только при `Type` равном `number`.
:::

## Ограничения объекта: Required / Properties / AdditionalProperties

`AdditionalProperties` управляет тем, разрешено ли появление свойств, не объявленных в `Properties`. При прямом конструировании `Schema` через структурный литерал это поле по умолчанию равно `false` (отклонять дополнительные свойства):

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	schema := &json.Schema{
		Type:     "object",
		Required: []string{"name"},
		Properties: map[string]*json.Schema{
			"name":  {Type: "string"},
			"email": {Type: "string"},
		},
		// AdditionalProperties не задан, по умолчанию для структурного литерала false → отклонять дополнительные свойства
	}

	// "extra" не объявлен в Properties
	data := `{"name":"Alice","extra":"x"}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// Вывод: extra: additional property 'extra' is not allowed
}
```

::: tip Разрешение дополнительных свойств
Чтобы разрешить дополнительные свойства, установите `AdditionalProperties` в `true` или используйте [`DefaultSchema()`](#способ-создания-schema) для конструирования (её `AdditionalProperties` по умолчанию `true`).
:::

## Строковые ограничения: MinLength / MaxLength / Pattern / Format

Ограничения `MinLength`, `MaxLength`, `Minimum`, `Maximum`, `MinItems`, `MaxItems` и т. д. **действуют только при создании через `NewSchemaWithConfig`** (причина см. в разделе [Способ создания](#способ-создания-schema)). Ниже с помощью указательных полей `SchemaConfig` задаются длины, а через `Pattern` ограничение — только строчные буквы:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	nameCfg := json.DefaultSchemaConfig()
	nameCfg.Type = "string"
	minLen, maxLen := 3, 10
	nameCfg.MinLength = &minLen
	nameCfg.MaxLength = &maxLen
	nameCfg.Pattern = `^[a-z]+$`
	nameSchema := json.NewSchemaWithConfig(nameCfg)

	schema := &json.Schema{
		Type:     "object",
		Required: []string{"name"},
		Properties: map[string]*json.Schema{
			"name": nameSchema,
		},
	}

	// "AB": недостаточная длина и содержит заглавные буквы
	data := `{"name":"AB"}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// Вывод:
	// name: string length 2 is less than minimum 3
	// name: string 'AB' does not match pattern '^[a-z]+$'
}
```

`Pattern` лениво компилируется при первой проверке и кэшируется; один и тот же `*Schema` можно безопасно использовать для параллельных проверок. Если само регулярное выражение некорректно, ошибка компиляции будет сообщаться при каждой проверке.

## Числовые ограничения: Minimum / Maximum / MultipleOf

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	ageCfg := json.DefaultSchemaConfig()
	ageCfg.Type = "number"
	minVal, maxVal := 0.0, 120.0
	ageCfg.Minimum = &minVal
	ageCfg.Maximum = &maxVal
	mult := 5.0
	ageCfg.MultipleOf = &mult
	ageSchema := json.NewSchemaWithConfig(ageCfg)

	schema := &json.Schema{
		Type: "object",
		Properties: map[string]*json.Schema{
			"age": ageSchema,
		},
	}

	// 148: превышает верхний предел 120 и не кратно 5
	data := `{"age":148}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// Вывод:
	// age: number 148 exceeds maximum 120
	// age: number 148 is not a multiple of 5
}
```

`ExclusiveMinimum` / `ExclusiveMaximum` задаются совместно с `Minimum` / `Maximum` через `SchemaConfig` (также указательные поля) для исключения самих граничных значений.

## Ограничения массива: Items / MinItems / MaxItems / UniqueItems

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	tagsCfg := json.DefaultSchemaConfig()
	tagsCfg.Type = "array"
	minItems, maxItems := 1, 3
	tagsCfg.MinItems = &minItems
	tagsCfg.MaxItems = &maxItems
	tagsCfg.UniqueItems = true
	tagsCfg.Items = &json.Schema{Type: "string"}
	tagsSchema := json.NewSchemaWithConfig(tagsCfg)

	schema := &json.Schema{
		Type: "object",
		Properties: map[string]*json.Schema{
			"tags": tagsSchema,
		},
	}

	// 4 элемента (превышение верхнего предела 3) и "a" повторяется
	data := `{"tags":["a","a","b","c"]}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// Вывод:
	// tags: array length 4 exceeds maximum 3
	// tags[1]: duplicate item found: a
}
```

`Items` указывает подсхему, которой должен удовлетворять каждый элемент (в примере выше — строка); `UniqueItems` определяет дубликаты по строковому представлению элементов.

## Перечисление и константа: Enum / Const

`Enum` ограничивает значение одним из списка; `Const` требует равенства фиксированному значению. Оба действуют через прямое сравнение, не требуют `NewSchemaWithConfig`:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	schema := &json.Schema{
		Type: "object",
		Properties: map[string]*json.Schema{
			"role":   {Enum: []any{"admin", "user", "guest"}},
			"status": {Const: "active"},
		},
	}

	// role не входит в перечисление; status соответствует константе
	data := `{"role":"superuser","status":"active"}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// Вывод: role: value 'superuser' is not in allowed enum values: [admin user guest]
}
```

## Поддерживаемые значения Format

Семантические форматы, поддерживаемые полем `Format` (неизвестные форматы молча пропускаются — без ошибки и без подтверждения):

| Format | Правило проверки |
|--------|----------|
| `email` | Проверка локальной части, домена, структуры и длины TLD |
| `date` | `YYYY-MM-DD` |
| `date-time` | RFC3339 |
| `time` | `HH:MM:SS` |
| `uri` | Должен содержать `://` |
| `uuid` | Соответствие регулярному выражению UUID |
| `ipv4` | 4 сегмента, каждый 0–255 |
| `ipv6` | Проходит `net.ParseIP` и содержит `:` |

## Тип ValidationError

Каждое нарушение ограничения — это `ValidationError`, содержащий путь в JSON и описание ошибки:

```go
type ValidationError struct {
    Path    string `json:"path"`    // Путь ошибки (например, "user.email", "tags[1]")
    Message string `json:"message"` // Сообщение об ошибке
}

func (ve *ValidationError) Error() string
```

Поскольку `ValidateSchema` возвращает срез `[]ValidationError`, можно напрямую обходить его, читая `Path` / `Message`; метод `Error()` используется для форматирования одной ошибки в строку (например, для логирования).

## Способ создания Schema

Конструирование `Schema` возможно тремя способами; **ключевое отличие — действуют ли ограничения длины/диапазона**:

```go
// 1) Прямой литерал: Type/Required/Properties/Items/Pattern/Format/Enum/Const/
//    UniqueItems/MultipleOf действуют сразу; но MinLength/MaxLength/Minimum/Maximum/
//    MinItems/MaxItems/ExclusiveMinimum/ExclusiveMaximum не действуют (см. описание ниже)
schema := &json.Schema{Type: "string", Pattern: `^\d+$`}

// 2) NewSchemaWithConfig: ограничения задаются через указательные поля SchemaConfig, все ограничения длины/диапазона действуют
cfg := json.DefaultSchemaConfig()
cfg.Type = "string"
minLen := 1
cfg.MinLength = &minLen
schema := json.NewSchemaWithConfig(cfg)

// 3) DefaultSchema: возвращает Schema со значениями по умолчанию (AdditionalProperties равно true)
schema := json.DefaultSchema()
```

::: warning Ограничения длины/диапазона требуют NewSchemaWithConfig
Группа ограничений `MinLength`, `MaxLength`, `Minimum`, `Maximum`, `MinItems`, `MaxItems`, `ExclusiveMinimum`, `ExclusiveMaximum` полагается на внутренний флаг отслеживания `Schema`, не задаваемый извне. Прямое присвоение этих полей в литерале `&json.Schema{...}` **не действует**; их необходимо включать через `NewSchemaWithConfig` с передачей соответствующих **указательных полей** (например, `cfg.MinLength = &v`). `Type`, `Required`, `Properties`, `Items`, `Pattern`, `Format`, `Enum`, `Const`, `UniqueItems`, `MultipleOf` не подпадают под это ограничение и действуют как в литерале, так и через `NewSchemaWithConfig`.
:::

## Поля Config, связанные с проверкой

| Поле | Тип | Описание |
|------|------|------|
| `EnableValidation` | `bool` | Включает проверку ввода (влияет на проверку безопасности/структуры перед операцией) |
| `ValidateInput` | `bool` | Проверяет входной JSON |
| `SkipValidation` | `bool` | Пропускает несущественные проверки (только для доверенного ввода) |

::: warning Не подключённые поля расширения
`Config.CustomValidators` (`[]Validator`) и интерфейс `Validator` в текущей версии **объявлены и участвуют в клонировании конфигурации и вычислении ключа кэша, но ещё не подключены к конвейеру операций**. Регистрация валидаторов через `Config.CustomValidators` (или `Config.AddValidator`) **не влияет на выполнение любой операции** — операция не будет отклонена пользовательским валидатором. Интерфейс `Validator` в настоящее время является зарезервированным:

```go
// Текущая версия: объявлен, но не подключён — регистрация не влияет на операции (зарезервированный интерфейс)
type Validator interface {
    Validate(jsonStr string) error
}
```

Для пользовательской проверки до и после операций используйте действующие [перехватчики Hooks](./hooks) (например, `ValidationHook`).
:::

## См. также

- [Определения интерфейсов](../api-reference/interfaces) - интерфейс `Validator` (зарезервированный) и типы, связанные со `Schema`
- [Параметры конфигурации](../api-reference/config) - поля конфигурации, связанные с проверкой
- [Перехватчики Hooks](./hooks) - действующий механизм перехвата до и после операций (включая `ValidationHook`)
