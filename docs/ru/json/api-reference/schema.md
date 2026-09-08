---
sidebar_label: "Валидация Schema"
title: "Валидация Schema - CyberGo JSON | Гайд по JSON Schema"
description: "Валидация Schema в CyberGo JSON: ValidateSchema, поля ограничений Schema, значения Format, ValidationError и NewSchemaWithConfig для объектов, строк и массивов."
sidebar_position: 4.5
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

| Категория | Поле | Тип | Применимый тип | Описание |
|------|------|------|----------|------|
| Структура | `Type` | `string` | Все | Значения см. в таблице ниже |
| Структура | `Required` | `[]string` | object | Список обязательных имён свойств |
| Структура | `Properties` | `map[string]*Schema` | object | Подсхема для каждого свойства |
| Структура | `Items` | `*Schema` | array | Подсхема для элементов |
| Структура | `AdditionalProperties` | `bool` | object | `true` — разрешить дополнительные свойства, `false` — отклонить |
| Строки | `MinLength` / `MaxLength` | `int` | string | Диапазон длины (подсчёт по rune) |
| Строки | `Pattern` | `string` | string | Регулярное выражение |
| Строки | `Format` | `string` | string | Семантический формат (см. [таблицу значений Format](#поддерживаемые-значения-format)) |
| Числа | `Minimum` / `Maximum` | `float64` | number | Диапазон значений |
| Числа | `ExclusiveMinimum` / `ExclusiveMaximum` | `bool` | number | Исключение граничных значений |
| Числа | `MultipleOf` | `float64` | number | Должно быть кратным этому значению |
| Массивы | `MinItems` / `MaxItems` | `int` | array | Диапазон количества элементов |
| Массивы | `UniqueItems` | `bool` | array | `true` требует уникальности элементов |
| Значения | `Enum` | `[]any` | Все | Список допустимых перечислимых значений |
| Значения | `Const` | `any` | Все | Должно быть равно этому фиксированному значению |
| Метаданные | `Title` / `Description` | `string` | — | Документирующие метаданные, в проверке не участвуют |
| Метаданные | `Default` | `any` | — | Документирующие метаданные, в проверке не участвуют |
| Метаданные | `Examples` | `[]any` | — | Документирующие метаданные, в проверке не участвуют |

Поддерживаемые значения `Type`: `object`, `array`, `string`, `number`, `boolean`, `null`.

::: warning Для числовых типов используйте "number"
После разбора JSON все числа (включая целые) являются `float64`, поэтому для числовых полей следует использовать `Type: "number"`. Значение `integer` из JSON Schema Draft 7 **не поддерживается** — указание `"integer"` приведёт к ошибке `expected type integer` для всех значений. Числовые ограничения вроде `Minimum`/`Maximum`/`MultipleOf` также действуют только при `Type` равном `number`.
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

`ExclusiveMinimum` / `ExclusiveMaximum` задаются совместно с `Minimum` / `Maximum` через `SchemaConfig` (также указательные поля) для исключения самих граничных значений. `MultipleOf` использует сравнение с плавающей точкой и допуском (epsilon 1e-9), поэтому сценарии точности IEEE 754 вроде `0.1 + 0.2` не дают ложных срабатываний.

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

`Items` указывает подсхему, которой должен удовлетворять каждый элемент (в примере выше — строка); `UniqueItems` определяет дубликаты по комбинации «**динамический тип + значение**» — `[1, "1"]` считаются двумя разными элементами, ошибку дают только действительно повторяющиеся значения.

::: tip Защита от глубокой рекурсии
`Schema` — рекурсивный тип; при проверке действует верхний предел глубины рекурсии (`DefaultMaxNestingDepth` = 200). Самоссылающиеся схемы (например, `s.Items = s`) не приводят к переполнению стека — при превышении предела выдаётся ошибка `schema nesting exceeds maximum depth`.
:::

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

Семантические форматы, поддерживаемые полем `Format` (неизвестные форматы молча пропускаются: без ошибки и без самой проверки):

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
// UniqueItems/MultipleOf действуют сразу; но MinLength/MaxLength/Minimum/Maximum/
// MinItems/MaxItems/ExclusiveMinimum/ExclusiveMaximum не действуют (см. описание ниже)
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

### DefaultSchema

Сигнатура: `func DefaultSchema() *Schema`

`DefaultSchema` возвращает Schema со значениями по умолчанию: `Properties` инициализирована пустой map, `Required` — пустым срезом, `AdditionalProperties` равна `true` (дополнительные свойства разрешены); подходит как отправная точка для постепенного заполнения.

### DefaultSchemaConfig

Сигнатура: `func DefaultSchemaConfig() SchemaConfig`

`DefaultSchemaConfig` возвращает вход по умолчанию для `NewSchemaWithConfig`: только `AdditionalProperties` предустановлена указателем на `true`, остальные поля — нулевые значения; задав в ней `Type` и указательные поля, можно сразу создавать Schema.

Результаты обоих согласуются: `DefaultSchema()` эквивалентна `NewSchemaWithConfig(DefaultSchemaConfig())` — по умолчанию обе разрешают дополнительные свойства.

### Поля SchemaConfig

Набор полей `SchemaConfig` один к одному соответствует `Schema`; при этом числовые/булевы ограничения являются **указательными типами** — `nil` означает, что ограничение не задано, и только передача не-`nil` указателя заставляет `NewSchemaWithConfig` включить соответствующее ограничение (именно поэтому ограничения длины/диапазона должны задаваться через `NewSchemaWithConfig`, см. [предупреждение выше](#способ-создания-schema)).

| Поле                   | Тип                 | Описание                                                                    |
| ---------------------- | ------------------- | ---------------------------------------------------------------------------- |
| `Type`                 | `string`            | JSON-тип (то же, что `Schema.Type`)                                          |
| `Properties`           | `map[string]*Schema` | Подсхема для каждого свойства (при nil инициализируется пустой map)          |
| `Items`                | `*Schema`           | Подсхема для элементов массива                                               |
| `Required`             | `[]string`          | Список обязательных имён свойств (при nil инициализируется пустым срезом)    |
| `MinLength`            | `*int`              | Минимальная длина (nil = не задано)                                          |
| `MaxLength`            | `*int`              | Максимальная длина (nil = не задано)                                         |
| `Minimum`              | `*float64`          | Минимальное значение (nil = не задано)                                       |
| `Maximum`              | `*float64`          | Максимальное значение (nil = не задано)                                      |
| `Pattern`              | `string`            | Регулярное выражение                                                         |
| `Format`               | `string`            | Семантический формат                                                         |
| `AdditionalProperties` | `*bool`             | Разрешены ли дополнительные свойства (nil трактуется как `true`; в `DefaultSchemaConfig` предустановлен указатель на `true`) |
| `MinItems`             | `*int`              | Минимальное количество элементов (nil = не задано)                           |
| `MaxItems`             | `*int`              | Максимальное количество элементов (nil = не задано)                          |
| `UniqueItems`          | `bool`              | Требовать уникальности элементов                                             |
| `Enum`                 | `[]any`             | Список допустимых перечислимых значений                                      |
| `Const`                | `any`               | Фиксированное значение, которому должно равняться значение                   |
| `MultipleOf`           | `*float64`          | Ограничение кратности (nil = не задано)                                      |
| `ExclusiveMinimum`     | `*bool`             | Исключить нижнюю границу (nil = не задано)                                   |
| `ExclusiveMaximum`     | `*bool`             | Исключить верхнюю границу (nil = не задано)                                  |
| `Title`                | `string`            | Заголовок (метаданные)                                                       |
| `Description`          | `string`            | Описание (метаданные)                                                        |
| `Default`              | `any`               | Значение по умолчанию (метаданные)                                           |
| `Examples`             | `[]any`             | Примеры значений (метаданные)                                                |

Рекомендуется всегда создавать настроенную Schema через `NewSchemaWithConfig` (`func NewSchemaWithConfig(cfg SchemaConfig) *Schema`) — это единственный надёжный способ включить указательные ограничения; кроме того, он автоматически инициализирует `Properties` / `Required` и обрабатывает значение `AdditionalProperties` по умолчанию.

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

Для пользовательской проверки до и после операций используйте действующие [перехватчики Hooks](../extensions/hooks) (например, `ValidationHook`).
:::

## См. также

- [Определения интерфейсов](./interfaces) — интерфейс `Validator` (зарезервированный) и типы, связанные со `Schema`
- [Определения типов](./types) — базовые типы (Config / Schema / Stats / AccessResult)
- [Парсинг и валидация](./functions/parse) — функции Parse / Valid / ValidateSchema
- [Параметры конфигурации](./config) — поля конфигурации, связанные с проверкой
- [Перехватчики Hooks](../extensions/hooks) — действующий механизм перехвата до и после операций (включая `ValidationHook`)
