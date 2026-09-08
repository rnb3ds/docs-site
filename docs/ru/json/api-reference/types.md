---
sidebar_label: "Типы"
title: "Определения типов - CyberGo JSON | Справочник API"
description: "Основные типы CyberGo JSON: обобщённый Result[T], AccessResult, BatchOperation, BatchResult, Schema, Stats, IterableValue и предкомпилированный CompiledPath."
sidebar_position: 5
---

# Определения типов

Пакет json предоставляет множество типобезопасных типов для обработки результатов JSON операций.

## Result[T] — Унифицированный тип результата

`Result[T]` — это обобщённый тип результата операции, обеспечивающий типобезопасную обработку ошибок и доступ к значениям.

### Определение структуры

```go
type Result[T any] struct {
	Value  T     // Значение результата
	Exists bool  // Было ли значение найдено
	Error  error // Ошибка (если есть)
}
```

### Описание полей

| Поле | Тип | Описание |
|------|------|------|
| `Value` | `T` | Значение результата; тип определяется параметром обобщения `T` |
| `Exists` | `bool` | Существует ли путь (найдено ли значение) |
| `Error` | `error` | Ошибка операции (`nil`, если ошибки нет) |

### Методы

| Метод | Сигнатура | Описание |
|------|------|------|
| `Ok()` | `func (r Result[T]) Ok() bool` | Проверяет, действителен ли результат (без ошибок и найден) |
| `Unwrap()` | `func (r Result[T]) Unwrap() T` | Возвращает значение, при ошибке возвращает нулевое значение |
| `UnwrapOr()` | `func (r Result[T]) UnwrapOr(defaultValue T) T` | Возвращает значение или значение по умолчанию |

### Пример использования

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"user": {"name": "Alice", "age": 30}}`

	// Получение типизированного значения с помощью GetTyped
	name := json.GetTyped[string](data, "user.name")
	fmt.Printf("Имя: %s\n", name)

	// Использование параметра defaultValue для предоставления значения по умолчанию
	nickname := json.GetTyped[string](data, "user.nickname", "Не задано")
	fmt.Printf("Псевдоним: %s\n", nickname)

	age := json.GetTyped[int](data, "user.age", 0)
	fmt.Printf("Возраст: %d\n", age)
}
```

::: tip Соглашения об именовании
- **GetTyped[T]** — получение значения указанного типа, возвращает `T`, поддерживает параметр `defaultValue`
- **Result[T]** — внутренний тип результата для сценариев, требующих детальной обработки ошибок
:::

---

## CompiledPath — Предварительно скомпилированный путь

`CompiledPath` — это псевдоним типа предварительно скомпилированного JSON пути, используемый для избежания повторного разбора строки пути при частом обращении к одному и тому же пути, повышая производительность.

### Определение типа

```go
type CompiledPath = internal.CompiledPath
```

### Сценарий использования

Когда требуется выполнить множество повторяющихся операций с одним и тем же путём (например, массовые запросы в цикле), можно предварительно скомпилировать путь, чтобы избежать повторного разбора строки пути при каждом вызове.

### Функция компиляции

#### Processor.CompilePath

Сигнатура: `func (p *Processor) CompilePath(path string) (*CompiledPath, error)`

Предварительная компиляция JSON пути через Processor, возвращает экземпляр `*CompiledPath`, который можно использовать в последующих операциях.

```go
processor, err := json.New()
if err != nil {
	panic(err)
}
defer processor.Close()

compiled, err := processor.CompilePath("user.profile.name")
if err != nil {
	panic(err)
}
// compiled можно использовать повторно в последующих операциях
val, err := processor.GetCompiled(data, compiled)
```

::: tip Совет по производительности
Для высокочастотного повторного доступа к путям предварительная компиляция может значительно сократить расходы на разбор путей. Подходит для массовых операций, циклических запросов и других сценариев.
:::

### Методы

| Метод | Сигнатура | Описание |
|------|------|------|
| `Get` | `func (cp *CompiledPath) Get(data any) (any, error)` | Извлекает значение по скомпилированному пути из уже разобранных JSON данных |
| `GetFromRaw` | `func (cp *CompiledPath) GetFromRaw(raw []byte) (any, error)` | Извлекает значение по скомпилированному пути из сырых JSON байтов (внутри сначала десериализация, затем навигация) |
| `Exists` | `func (cp *CompiledPath) Exists(data any) bool` | Проверяет, существует ли значение по этому пути в уже разобранных данных |
| `Len` | `func (cp *CompiledPath) Len() int` | Возвращает количество сегментов пути |
| `IsEmpty` | `func (cp *CompiledPath) IsEmpty() bool` | Возвращает true, если у пути нет ни одного сегмента |
| `Hash` | `func (cp *CompiledPath) Hash() uint64` | Возвращает предварительно вычисленный при компиляции хеш пути (FNV-1a); можно использовать для пользовательских ключей кэша |
| `Path` | `func (cp *CompiledPath) Path() string` | Возвращает исходную строку пути, переданную при компиляции |
| `String` | `func (cp *CompiledPath) String() string` | Строковое представление, эквивалентное `Path` |
| `Segments` | `func (cp *CompiledPath) Segments() []PathSegment` | Возвращает разобранные сегменты пути (подробнее в разделе PathSegment ниже) |
| `Release` | `func (cp *CompiledPath) Release()` | Возвращает экземпляр в пул объектов; после вызова пользоваться этим экземпляром нельзя |

### Пример использования

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

	cp, err := p.CompilePath("user.name")
	if err != nil {
		panic(err)
	}
	defer cp.Release()

	// Прямое получение значения из сырых JSON байтов, без предварительного разбора в значение Go
	val, err := cp.GetFromRaw([]byte(`{"user": {"name": "CyberGo"}}`))
	if err != nil {
		panic(err)
	}
	fmt.Println(val) // Вывод: CyberGo
}
```

::: tip Выбор между GetFromRaw и PreParse
`GetFromRaw` при каждом вызове полностью десериализует входные байты — подходит для разовых запросов; при многократных запросах к одному документу используйте `PreParse` для получения `ParsedJSON` и затем `Get`, либо `GetFromParsed`, чтобы избежать повторного разбора.
:::

---

## PathSegment — Сегмент пути

`PathSegment` представляет отдельный сегмент разобранного пути; это элемент, возвращаемый методом `ParsePath` интерфейса [`PathParser`](./interfaces#pathparser), его также можно получить методом `Segments` у `CompiledPath`.

### Определение типа

```go
type PathSegment = internal.PathSegment
```

::: warning Псевдоним внутренней реализации
Как и `CompiledPath`, `PathSegment` — псевдоним типа `internal.PathSegment`: типы полей PathSegmentType, PathSegmentFlags и константы типов сегментов (PropertySegment и др.) не экспортируются из корневого пакета. Для определения типа сегмента используйте методы доступа `TypeString`, `IsArrayAccess` и т. п., а не прямое сравнение поля `Type` с внутренними константами.
:::

### Описание полей

| Поле | Тип | Описание |
|------|------|------|
| `Type` | PathSegmentType | Перечисление типа сегмента (свойство/индекс массива/срез/подстановочный знак и т. п.; для определения используйте `TypeString`) |
| `Key` | `string` | Имя ключа для сегментов-свойств и сегментов извлечения |
| `Index` | `int` | Индекс сегмента индекса массива; начальное значение сегмента среза (установлено ли — см. `HasStart`) |
| `End` | `int` | Конечное значение сегмента среза (установлено ли — см. `HasEnd`) |
| `Step` | `int` | Шаг сегмента среза (установлен ли — см. `HasStep`) |
| `Flags` | PathSegmentFlags | Битовые флаги: отрицательный индекс, подстановочный знак, плоское извлечение, а также установлены ли начало/конец/шаг |

### Методы

| Метод | Сигнатура | Описание |
|------|------|------|
| `TypeString` | `func (ps PathSegment) TypeString() string` | Имя типа сегмента: `property` / `array` / `slice` / `wildcard` / `recursive` / `filter` / `extract` / `append` |
| `String` | `func (ps PathSegment) String() string` | Путевое представление сегмента (например, `name`, `[0]`, `[1:3]`, `[*]`) |
| `IsArrayAccess` | `func (ps PathSegment) IsArrayAccess() bool` | Возвращает true для сегментов индекса массива, среза или подстановочного знака |
| `IsWildcardSegment` | `func (ps *PathSegment) IsWildcardSegment() bool` | Возвращает true для сегмента-подстановочного знака (`[*]`) |
| `IsFlatExtract` | `func (ps *PathSegment) IsFlatExtract() bool` | Возвращает true для сегмента плоского извлечения |
| `IsNegativeIndex` | `func (ps *PathSegment) IsNegativeIndex() bool` | Возвращает true при отрицательном индексе массива (например, `[-1]`) |
| `HasStart` | `func (ps *PathSegment) HasStart() bool` | Установлено ли начальное значение у сегмента среза |
| `HasEnd` | `func (ps *PathSegment) HasEnd() bool` | Установлено ли конечное значение у сегмента среза |
| `HasStep` | `func (ps *PathSegment) HasStep() bool` | Установлен ли шаг у сегмента среза |
| `GetStart` | `func (ps *PathSegment) GetStart() (int, bool)` | Возвращает начальное значение и признак установки (если не установлено — 0, false) |
| `GetEnd` | `func (ps *PathSegment) GetEnd() (int, bool)` | Возвращает конечное значение и признак установки |
| `GetStep` | `func (ps *PathSegment) GetStep() (int, bool)` | Возвращает шаг и признак установки |
| `GetArrayIndex` | `func (ps PathSegment) GetArrayIndex(arrayLength int) (int, error)` | Разбирает индекс массива: отрицательный индекс пересчитывается в прямой (`-1` — последний элемент); при выходе за границы или не-индексном сегменте возвращает error |

### Пример использования

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

	cp, err := p.CompilePath("users[0].name")
	if err != nil {
		panic(err)
	}
	defer cp.Release()

	// Segments возвращает разобранные сегменты пути
	for _, seg := range cp.Segments() {
		fmt.Printf("Сегмент %s (%s)\n", seg.String(), seg.TypeString())
	}

	// Сегмент индекса массива: GetArrayIndex разбирает фактический индекс (отрицательный пересчитывается в прямой, при выходе за границы — error)
	arrSeg := cp.Segments()[1]
	idx, err := arrSeg.GetArrayIndex(1)
	if err != nil {
		panic(err)
	}
	fmt.Println("Индекс массива:", idx)
	// Вывод:
	// Сегмент users (property)
	// Сегмент [0] (array)
	// Сегмент name (property)
	// Индекс массива: 0
}
```

---

## AccessResult — Результат доступа к свойству

`AccessResult` — это результат безопасного доступа к свойству, обеспечивающий цепочечное преобразование типов.

### Определение структуры

```go
type AccessResult struct {
	Value  any    // Значение результата
	Exists bool   // Существует ли путь
	Type   string // Информация о типе во время выполнения (для отладки)
}
```

### Описание полей

| Поле | Тип | Описание |
|------|------|------|
| `Value` | `any` | Значение результата |
| `Exists` | `bool` | Существует ли путь |
| `Type` | `string` | Информация о типе во время выполнения (для отладки) |

### Метод создания

#### Processor.SafeGet

Сигнатура: `func (p *Processor) SafeGet(jsonStr, path string, cfg ...Config) AccessResult`

Безопасное получение свойства, возвращает `AccessResult` для цепочечного преобразования типов.

Также можно использовать функцию уровня пакета `SafeGet`:

Сигнатура: `func SafeGet(jsonStr, path string, cfg ...Config) AccessResult`

```go
processor, err := json.New()
if err != nil {
	panic(err)
}
defer processor.Close()

result := processor.SafeGet(data, "user.age")

if !result.Exists {
	fmt.Println("Путь не существует")
	return
}

// Проверка типа
fmt.Println("Тип:", result.Type)
```

### Методы цепочечного преобразования типов

| Метод | Возвращаемый тип | Описание |
|------|----------|------|
| `Unwrap()` | `any` | Возвращает значение, nil если не существует |
| `UnwrapOr(defaultValue)` | `any` | Возвращает значение или значение по умолчанию |
| `AsString()` | `(string, error)` | Преобразует в строку (строгая проверка типа) |
| `AsStringConverted()` | `(string, error)` | Форматированное преобразование в строку |
| `AsInt()` | `(int, error)` | Преобразует в целое число (bool не преобразуется) |
| `AsFloat64()` | `(float64, error)` | Преобразует в float64 (bool не преобразуется) |
| `AsBool()` | `(bool, error)` | Преобразует в логическое значение |
| `Ok()` | `bool` | Проверяет, существует ли путь |

::: warning Примечание
Методы `AsInt64()`, `AsArray()`, `AsObject()` удалены. Используйте `GetTyped[T]` для получения этих типов.
:::

```go
result := processor.SafeGet(data, "user.profile")

// Цепочечные вызовы
name, _ := result.AsString()
email, _ := result.AsString()
age, _ := result.AsInt()
price, _ := result.AsFloat64()
active, _ := result.AsBool()

// Для типов массива или объекта используйте GetTyped
arr := json.GetTyped[[]any](data, "items")
obj := json.GetTyped[map[string]any](data, "user.profile")
```

### Пример использования

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	data := `{"user": {"name": "Alice", "age": 30, "active": true}}`

	// Безопасное получение и преобразование
	result := processor.SafeGet(data, "user.age")

	// Непосредственное использование методов AccessResult
	age, err := result.AsInt()
	if err != nil {
		panic(err)
	}
	fmt.Printf("Возраст: %d\n", age)

	// Получение несуществующего пути
	missing := processor.SafeGet(data, "user.nickname")
	if !missing.Exists {
		fmt.Println("Псевдоним не существует")
	}
}
```

---

## Schema — Тип JSON Schema

`Schema` используется для определения правил структурной валидации JSON данных, поддерживает подмножество JSON Schema Draft 7.

### Определение структуры

```go
type Schema struct {
	Type                 string             `json:"type,omitempty"`
	Properties           map[string]*Schema `json:"properties,omitempty"`
	Items                *Schema            `json:"items,omitempty"`
	Required             []string           `json:"required,omitempty"`
	MinLength            int                `json:"minLength,omitempty"`
	MaxLength            int                `json:"maxLength,omitempty"`
	Minimum              float64            `json:"minimum,omitempty"`
	Maximum              float64            `json:"maximum,omitempty"`
	Pattern              string             `json:"pattern,omitempty"`
	Format               string             `json:"format,omitempty"`
	AdditionalProperties bool               `json:"additionalProperties,omitempty"`
	MinItems             int                `json:"minItems,omitempty"`
	MaxItems             int                `json:"maxItems,omitempty"`
	UniqueItems          bool               `json:"uniqueItems,omitempty"`
	Enum                 []any              `json:"enum,omitempty"`
	Const                any                `json:"const,omitempty"`
	MultipleOf           float64            `json:"multipleOf,omitempty"`
	ExclusiveMinimum     bool               `json:"exclusiveMinimum,omitempty"`
	ExclusiveMaximum     bool               `json:"exclusiveMaximum,omitempty"`
	Title                string             `json:"title,omitempty"`
	Description          string             `json:"description,omitempty"`
	Default              any                `json:"default,omitempty"`
	Examples             []any              `json:"examples,omitempty"`
}
```

### Создание Schema

#### Прямое конструирование

```go
schema := &json.Schema{
	Type:     "object",
	Required: []string{"name", "email"},
	Properties: map[string]*json.Schema{
		"name":  {Type: "string"},
		"email": {Type: "string", Format: "email"},
		"age":   {Type: "number"},
	},
}
```

::: warning Два жёстких ограничения
- `Type` поддерживает только шесть значений: `object`/`array`/`string`/`number`/`boolean`/`null` — `integer` из JSON Schema **не поддерживается** (целые числа всё равно разбираются в `float64`, пишите `"number"`).
- Присвоение `MinLength`/`MaxLength`/`Minimum`/`Maximum`/`MinItems`/`MaxItems`/`ExclusiveMinimum`/`ExclusiveMaximum` через структурный литерал **не действует**; эти ограничения включаются только через указательные поля `NewSchemaWithConfig`. Подробнее см. [Валидация Schema](./schema#способ-создания-schema).
:::

#### Использование NewSchemaWithConfig

```go
cfg := json.DefaultSchemaConfig()
cfg.Type = "object"
cfg.Required = []string{"name", "email"}
schema := json.NewSchemaWithConfig(cfg)
```

#### Использование DefaultSchema

Сигнатура: `func DefaultSchema() *Schema`

Возвращает пустой экземпляр Schema с конфигурацией по умолчанию.

```go
schema := json.DefaultSchema()
schema.Type = "object"
schema.Required = []string{"id"}
```

### Структура SchemaConfig

```go
type SchemaConfig struct {
	Type                 string
	Properties           map[string]*Schema
	Items                *Schema
	Required             []string
	MinLength            *int
	MaxLength            *int
	Minimum              *float64
	Maximum              *float64
	Pattern              string
	Format               string
	AdditionalProperties *bool
	MinItems             *int
	MaxItems             *int
	UniqueItems          bool
	Enum                 []any
	Const                any
	MultipleOf           *float64
	ExclusiveMinimum     *bool
	ExclusiveMaximum     *bool
	Title                string
	Description          string
	Default              any
	Examples             []any
}
```

| Категория полей | Поля | Тип | Описание |
|----------|------|------|------|
| Прямые поля | `Type`/`Pattern`/`Format`/`UniqueItems`/`Enum`/`Const`/`Title`/`Description`/`Default`/`Examples` | Типы-значения | Работают сразу при прямом присвоении |
| Структурные поля | `Properties`/`Items`/`Required` | Типы-значения | Подсхемы, обязательные свойства |
| Указательные поля | `MinLength`/`MaxLength`/`Minimum`/`Maximum`/`MinItems`/`MaxItems`/`MultipleOf`/`ExclusiveMinimum`/`ExclusiveMaximum` | `*int`/`*float64`/`*bool` | **Соответствующее ограничение включается только при не nil** (указатель нужен, чтобы отличить «не задано» от «нулевого значения») |
| Указательные поля | `AdditionalProperties` | `*bool` | Действует при не nil; при nil по умолчанию `true` |

#### DefaultSchemaConfig

Сигнатура: `func DefaultSchemaConfig() SchemaConfig`

Возвращает SchemaConfig со значениями по умолчанию (`AdditionalProperties` указывает на `true`, остальные поля — нулевые значения).

```go
cfg := json.DefaultSchemaConfig()
cfg.Type = "object"
cfg.Required = []string{"name", "email"}
schema := json.NewSchemaWithConfig(cfg)
```

### Пример использования

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// Ограничения длины/диапазона включаются через указательные поля NewSchemaWithConfig
	minLen, maxLen := 1, 100
	minAge, maxAge := 0.0, 150.0

	nameCfg := json.DefaultSchemaConfig()
	nameCfg.Type = "string"
	nameCfg.MinLength = &minLen
	nameCfg.MaxLength = &maxLen

	ageCfg := json.DefaultSchemaConfig()
	ageCfg.Type = "number" // для чисел всегда "number" ("integer" не поддерживается)
	ageCfg.Minimum = &minAge
	ageCfg.Maximum = &maxAge

	schema := &json.Schema{
		Type:     "object",
		Required: []string{"name", "email"},
		Properties: map[string]*json.Schema{
			"name":  json.NewSchemaWithConfig(nameCfg),
			"email": {Type: "string", Format: "email"},
			"age":   json.NewSchemaWithConfig(ageCfg),
		},
	}

	// Валидация JSON
	data := `{"name": "Alice", "email": "alice@example.com", "age": 30}`
	errors, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}

	if len(errors) > 0 {
		for _, e := range errors {
			fmt.Printf("Ошибка валидации [%s]: %s\n", e.Path, e.Message)
		}
	} else {
		fmt.Println("Валидация пройдена")
	}
	// Вывод: Валидация пройдена
}
```

---

## ValidationError

Тип ошибки валидации Schema.

### Определение структуры

```go
type ValidationError struct {
	Path    string `json:"path"`    // Путь, где произошла ошибка
	Message string `json:"message"` // Сообщение об ошибке
}
```

### Описание полей

| Поле | Тип | Описание |
|------|------|------|
| `Path` | `string` | JSON-путь, где произошла ошибка валидации |
| `Message` | `string` | Описание сообщения о провале валидации |

### Метод

#### Error

Сигнатура: `func (ve *ValidationError) Error() string`

Реализует интерфейс error.

```go
for _, e := range errors {
	fmt.Println(e.Error())
}
```

---

## BatchOperation

Определение пакетной операции, единица входа `ProcessBatch`.

### Определение структуры

```go
type BatchOperation struct {
	Type    string `json:"type"`     // Тип операции: "get", "set", "delete", "validate"
	JSONStr string `json:"json_str"` // Строка JSON данных
	Path    string `json:"path"`     // Целевой путь
	Value   any    `json:"value"`    // Значение для операции Set
	ID      string `json:"id"`       // Идентификатор операции
}
```

### Описание полей

| Поле | Тип | Описание |
|------|------|------|
| `Type` | `string` | Тип операции; поддерживаются только `"get"`, `"set"`, `"delete"`, `"validate"`; для других значений в соответствующем `BatchResult.Error` возвращается `unknown operation type` |
| `JSONStr` | `string` | Целевая JSON-строка, на которую действует операция (каждая операция несёт свою) |
| `Path` | `string` | Целевой путь |
| `Value` | `any` | Используется только операцией `"set"` — записываемое значение |
| `ID` | `string` | Идентификатор операции, без изменений копируется в `BatchResult.ID` для сверки результатов |

::: tip Лимит пакета
При превышении числом операций `Config.MaxBatchSize` (по умолчанию 2000) `ProcessBatch` целиком возвращает ошибку `ErrSizeLimit`; `BatchResult.Result` операции `"validate"` — это `map[string]any{"valid": bool}`.
:::

---

## BatchResult

Результат пакетной операции.

### Определение структуры

```go
type BatchResult struct {
	ID     string `json:"id"`     // Идентификатор операции (соответствует BatchOperation.ID)
	Result any    `json:"result"` // Результат операции
	Error  error  `json:"error"`  // Ошибка (если есть)
}
```

### Описание полей

| Поле | Тип | Описание |
|------|------|------|
| `ID` | `string` | Соответствует `BatchOperation.ID`, один к одному с порядком входных данных |
| `Result` | `any` | Результат операции; `"get"` — полученное значение, `"set"`/`"delete"` — изменённая JSON-строка, `"validate"` — `map[string]any{"valid": bool}` |
| `Error` | `error` | Ошибка этой отдельной операции; **возвращается по каждому элементу**, сбой одной не прерывает весь пакет (продолжение определяется внутренней поэлементной реализацией) |

---

## WarmupResult

Результат прогрева кэша, возвращается `WarmupCache`.

### Определение структуры

```go
type WarmupResult struct {
	TotalPaths  int      `json:"total_paths"`            // Общее количество путей
	Successful  int      `json:"successful"`             // Количество успешно прогретых
	Failed      int      `json:"failed"`                 // Количество неудачных
	SuccessRate float64  `json:"success_rate"`           // Процент успешных
	FailedPaths []string `json:"failed_paths,omitempty"` // Список неудавшихся путей
}
```

### Описание полей

| Поле | Тип | Описание |
|------|------|------|
| `TotalPaths` | `int` | Общее число путей, отправленных на прогрев |
| `Successful` | `int` | Число путей, успешно записанных в кэш |
| `Failed` | `int` | Число путей, прогрев которых не удался |
| `SuccessRate` | `float64` | Доля успеха, **проценты 0–100** (не 0–1) |
| `FailedPaths` | `[]string` | Список неудавшихся путей (nil, если всё успешно) |

::: warning При полном провале возвращается error
`WarmupCache` при **провале всех путей** помимо `WarmupResult` возвращает не nil error (с последней ошибкой); при отключённом кэше (`EnableCache: false`) сразу возвращается ошибка.
:::

---

## ParsedJSON

Предварительно разобранный JSON документ, может повторно использоваться для многократных операций запроса.

### Определение структуры

Внутренние поля `ParsedJSON` не экспортируются, доступ через методы.

```go
type ParsedJSON struct {
	// Внутренние поля (не экспортируются)
	// Используйте метод Data() для получения разобранных данных
}
```

### Методы

| Метод | Сигнатура | Описание |
|------|------|------|
| `Data` | `func (p *ParsedJSON) Data() any` | Возвращает базовые разобранные данные; после `Release` возвращает nil |
| `Release` | `func (p *ParsedJSON) Release()` | Обнуляет внутренние данные — даже если на `ParsedJSON` ещё есть ссылки, дерево разбора может быть собрано сборщиком мусора |

```go
processor, err := json.New()
if err != nil {
	panic(err)
}
defer processor.Close()

// Предварительный разбор JSON
parsed, err := processor.PreParse(`{"user": {"name": "Alice", "age": 30}}`)
if err != nil {
	panic(err)
}

// Многократные запросы к предварительно разобранному результату
name, _ := processor.GetFromParsed(parsed, "user.name")
age, _ := processor.GetFromParsed(parsed, "user.age")
```

### Сценарии использования

| Сценарий | Описание |
|------|------|
| Высокочастотные запросы | Избегание повторного разбора при многократных запросах к одному JSON |
| Пакетное получение путей | Использование `GetMultiple` для пакетного получения нескольких путей |
| Оптимизация производительности | Значительный рост производительности запросов после предварительного разбора |

::: tip Подсказка по производительности
Для сценариев, требующих многократных запросов к одной строке JSON, использование `PreParse` для предварительного разбора может значительно повысить производительность, избегая накладных расходов на повторный разбор.
:::

---

## Stats

Статистика процессора; получается через функцию уровня пакета `GetStats()` или `Processor.GetStats()`.

### Определение структуры

```go
type Stats struct {
	CacheSize        int64         `json:"cache_size"`        // Текущий размер кэша
	CacheMemory      int64         `json:"cache_memory"`      // Использование памяти кэшем (байты)
	MaxCacheSize     int           `json:"max_cache_size"`    // Максимальный размер кэша
	HitCount         int64         `json:"hit_count"`         // Количество попаданий в кэш
	MissCount        int64         `json:"miss_count"`        // Количество промахов кэша
	HitRatio         float64       `json:"hit_ratio"`         // Коэффициент попадания в кэш
	CacheTTL         time.Duration `json:"cache_ttl"`         // Время жизни кэша
	CacheEnabled     bool          `json:"cache_enabled"`     // Включён ли кэш
	IsClosed         bool          `json:"is_closed"`         // Закрыт ли процессор
	MemoryEfficiency float64       `json:"memory_efficiency"` // Эффективность памяти
	OperationCount   int64         `json:"operation_count"`   // Общее количество операций
	ErrorCount       int64         `json:"error_count"`       // Общее количество ошибок
}
```

### Описание полей

| Поле | Тип | Описание |
|------|------|------|
| `CacheSize` | `int64` | Текущее число записей в кэше |
| `CacheMemory` | `int64` | Оценка памяти, занимаемой кэшем (в байтах) |
| `MaxCacheSize` | `int` | Настроенный лимит записей кэша (`Config.MaxCacheSize`) |
| `HitCount` | `int64` | Количество попаданий в кэш |
| `MissCount` | `int64` | Количество промахов кэша |
| `HitRatio` | `float64` | Доля попаданий (0–1) |
| `CacheTTL` | `time.Duration` | TTL текущих записей кэша |
| `CacheEnabled` | `bool` | Включён ли кэш |
| `IsClosed` | `bool` | Был ли процессор `Close`-нут |
| `MemoryEfficiency` | `float64` | Показатель эффективности памяти (0–1) |
| `OperationCount` | `int64` | Накопленное число операций процессора |
| `ErrorCount` | `int64` | Накопленное число ошибок процессора |

---

## SecurityLimits

`SecurityLimits` собирает связанные с безопасностью поля ограничений из Config и представляет собой их снимок только для чтения (поля отображаются один к одному).

### Определение структуры

```go
type SecurityLimits struct {
	MaxNestingDepth           int   `json:"max_nesting_depth"`
	MaxSecurityValidationSize int64 `json:"max_security_validation_size"`
	MaxObjectKeys             int   `json:"max_object_keys"`
	MaxArrayElements          int   `json:"max_array_elements"`
	MaxJSONSize               int64 `json:"max_json_size"`
	MaxPathDepth              int   `json:"max_path_depth"`
}
```

### Отображение на поля Config

| Поле SecurityLimits | Поле Config — источник |
|--------------------|------------------|
| `MaxNestingDepth` | `MaxNestingDepthSecurity` |
| `MaxSecurityValidationSize` | `MaxSecurityValidationSize` |
| `MaxObjectKeys` | `MaxObjectKeys` |
| `MaxArrayElements` | `MaxArrayElements` |
| `MaxJSONSize` | `MaxJSONSize` |
| `MaxPathDepth` | `MaxPathDepth` |

Этот тип используется библиотекой внутри для сводки ограничений безопасности (нулевое значение означает nil Config); смысл полей и диапазоны значений см. в [Config](./config#структура-config).

---

## HealthStatus

Информация о состоянии здоровья; получается через функцию уровня пакета `GetHealthStatus()` или `Processor.GetHealthStatus()`.

### Определение структуры

```go
type HealthStatus struct {
	Timestamp time.Time              `json:"timestamp"` // Временная метка проверки
	Healthy   bool                   `json:"healthy"`   // Здоров ли
	Checks    map[string]CheckResult `json:"checks"`    // Результаты отдельных проверок
}
```

### Описание полей

| Поле | Тип | Описание |
|------|------|------|
| `Timestamp` | `time.Time` | Временная метка этой проверки здоровья |
| `Healthy` | `bool` | Общее заключение о здоровье (true, если все проверки пройдены) |
| `Checks` | `map[string]CheckResult` | Результаты отдельных проверок, ключи — названия проверок |

### Структура CheckResult

Результат отдельной проверки здоровья.

```go
type CheckResult struct {
	Healthy bool   `json:"healthy"` // Здорова ли эта проверка
	Message string `json:"message"` // Сообщение проверки
}
```

| Поле | Тип | Описание |
|------|------|------|
| `Healthy` | `bool` | Пройдена ли эта проверка |
| `Message` | `string` | Описание сообщения об успехе/провале |

---

## IterableValue

Обёртка итерируемого значения.

### Обзор методов

**Базовый доступ**

| Метод | Описание |
|------|------|
| `Get(path)` | Получить значение по пути |
| `GetString(path)` | Получить строку |
| `GetInt(path)` | Получить целое число |
| `GetFloat64(path)` | Получить число с плавающей точкой |
| `GetBool(path)` | Получить логическое значение |
| `GetArray(path)` | Получить массив |
| `GetObject(path)` | Получить объект |

**Получение со значением по умолчанию**

| Метод | Описание |
|------|------|
| `GetWithDefault(path, defaultValue)` | Получить значение, вернуть значение по умолчанию если не существует |
| `GetStringWithDefault(path, defaultValue)` | Получить строку, вернуть значение по умолчанию если не существует |
| `GetIntWithDefault(path, defaultValue)` | Получить целое число, вернуть значение по умолчанию если не существует |
| `GetFloat64WithDefault(path, defaultValue)` | Получить число с плавающей точкой, вернуть значение по умолчанию если не существует |
| `GetBoolWithDefault(path, defaultValue)` | Получить логическое значение, вернуть значение по умолчанию если не существует |

**Проверка и обход**

| Метод | Описание |
|------|------|
| `Exists(path)` | Проверить, существует ли поле |
| `IsNull(path)` | Проверить, равно ли null по указанному пути |
| `IsNullData()` | Проверить, равно ли null базовое значение |
| `IsEmpty(path)` | Проверить, пусто ли по указанному пути |
| `IsEmptyData()` | Проверить, пусто ли базовое значение |
| `GetData()` | Получить исходные базовые данные |
| `Break()` | Вернуть сигнал прерывания, остановить итерацию |
| `ForeachNested(path, fn)` | Обойти вложенные структуры |
| `Release()` | Освободить ресурсы |

Подробнее в документации [Итераторы](./iterator).

---

## Типы ошибок кодирования

Пакет json экспортирует следующие типы ошибок в процессе кодирования/декодирования для детальной обработки ошибок.

### SyntaxError — Синтаксическая ошибка

Ошибка разбора JSON синтаксиса, указывающая на то, что входные данные не являются допустимым форматом JSON.

#### Определение структуры

```go
type SyntaxError struct {
	Offset int64 // Позиция ошибки (смещение в байтах)
	// Содержит другие неэкспортируемые поля
}
```

#### Метод

| Метод | Сигнатура | Описание |
|------|------|------|
| `Error` | `func (e *SyntaxError) Error() string` | Возвращает описание ошибки с указанием смещения |

```go
data := `{invalid json}`
_, err := json.ParseAny(data)
if syntaxErr, ok := err.(*json.SyntaxError); ok {
	fmt.Printf("Синтаксическая ошибка, смещение: %d\n", syntaxErr.Offset)
}
```

---

### UnmarshalTypeError — Ошибка типа при десериализации

Возвращается, когда значение JSON не может быть преобразовано в целевой тип Go.

#### Определение структуры

```go
type UnmarshalTypeError struct {
	Value  string       // Описание значения JSON (например, "string", "number")
	Type   reflect.Type // Целевой тип Go
	Offset int64        // Позиция ошибки (смещение в байтах)
	Struct string       // Имя структуры, содержащей поле (если есть)
	Field  string       // Имя поля (если есть)
	Err    error        // Внутренняя ошибка (если есть)
}
```

#### Методы

| Метод | Сигнатура | Описание |
|------|------|------|
| `Error` | `func (e *UnmarshalTypeError) Error() string` | Возвращает описание ошибки несоответствия типов |
| `Unwrap` | `func (e *UnmarshalTypeError) Unwrap() error` | Возвращает внутреннюю ошибку |

```go
type User struct {
	Age int `json:"age"`
}
var user User
err := json.Unmarshal([]byte(`{"age": "not_a_number"}`), &user)
if typeErr, ok := err.(*json.UnmarshalTypeError); ok {
	fmt.Printf("Ошибка типа: значение JSON %s не может быть преобразовано в %v\n", typeErr.Value, typeErr.Type)
}
```

---

### UnsupportedTypeError — Ошибка неподдерживаемого типа

Возвращается при попытке кодирования типа, не поддерживаемого в Go.

#### Определение структуры

```go
type UnsupportedTypeError struct {
	Type reflect.Type // Неподдерживаемый тип Go
}
```

#### Метод

| Метод | Сигнатура | Описание |
|------|------|------|
| `Error` | `func (e *UnsupportedTypeError) Error() string` | Возвращает описание неподдерживаемого типа |

```go
type Chan chan int
data := Chan(make(chan int))
_, err := json.Marshal(data)
if unsupportedErr, ok := err.(*json.UnsupportedTypeError); ok {
	fmt.Printf("Неподдерживаемый тип: %v\n", unsupportedErr.Type)
}
```

---

### UnsupportedValueError — Ошибка неподдерживаемого значения

Возвращается при попытке кодирования неподдерживаемого значения (например, NaN, Infinity).

#### Определение структуры

```go
type UnsupportedValueError struct {
	Value reflect.Value // Неподдерживаемое значение
	Str   string        // Описание ошибки
}
```

#### Метод

| Метод | Сигнатура | Описание |
|------|------|------|
| `Error` | `func (e *UnsupportedValueError) Error() string` | Возвращает описание неподдерживаемого значения |

```go
val := math.NaN()
_, err := json.Marshal(val)
if valErr, ok := err.(*json.UnsupportedValueError); ok {
	fmt.Printf("Неподдерживаемое значение: %s\n", valErr.Str)
}
```

---

### InvalidUnmarshalError — Ошибка недопустимой цели десериализации

Возвращается, когда целевой аргумент `Unmarshal` не является указателем или равен nil.

#### Определение структуры

```go
type InvalidUnmarshalError struct {
	Type reflect.Type // Тип целевого аргумента
}
```

#### Метод

| Метод | Сигнатура | Описание |
|------|------|------|
| `Error` | `func (e *InvalidUnmarshalError) Error() string` | Возвращает описание ошибки недопустимой цели |

```go
var target string                                // Следует передать указатель
err := json.Unmarshal([]byte(`"hello"`), target) // Ошибка: указатель не передан
if invalidErr, ok := err.(*json.InvalidUnmarshalError); ok {
	fmt.Printf("Недопустимая цель десериализации: %v\n", invalidErr.Type)
}
```

---

### MarshalerError — Ошибка кодировщика

Оборачивает ошибку, когда метод `MarshalJSON` или `MarshalText` типа возвращает ошибку.

#### Определение структуры

```go
type MarshalerError struct {
	Type reflect.Type // Тип, реализующий MarshalJSON или MarshalText
	Err  error        // Ошибка, возвращённая MarshalJSON или MarshalText
	// Содержит другие неэкспортируемые поля
}
```

#### Методы

| Метод | Сигнатура | Описание |
|------|------|------|
| `Error` | `func (e *MarshalerError) Error() string` | Возвращает описание ошибки кодировщика |
| `Unwrap` | `func (e *MarshalerError) Unwrap() error` | Возвращает внутреннюю ошибку |

```go
type BadMarshaler struct{}

func (BadMarshaler) MarshalJSON() ([]byte, error) {
    return nil, errors.New("marshal failed")
}

_, err := json.Marshal(BadMarshaler{})
if marshalErr, ok := err.(*json.MarshalerError); ok {
    fmt.Printf("Ошибка кодировщика (тип: %v): %v\n", marshalErr.Type, marshalErr.Err)
}
```

---

## Encoder — JSON кодировщик

`Encoder` записывает JSON значения в выходной поток. 100% совместим с `encoding/json.Encoder`.

### Создание

Сигнатура: `func NewEncoder(w io.Writer, cfg ...Config) *Encoder`

Создаёт кодировщик, записывающий в `w`. Поддерживает необязательный параметр `Config` для настройки поведения кодирования.

```go
file, _ := os.Create("output.json")
defer file.Close()

encoder := json.NewEncoder(file)
err := encoder.Encode(map[string]any{"name": "Alice"})
```

### Методы

| Метод | Сигнатура | Описание |
|------|------|------|
| `Encode` | `func (enc *Encoder) Encode(v any) error` | Кодирует значение Go в JSON и записывает в поток |
| `SetEscapeHTML` | `func (enc *Encoder) SetEscapeHTML(on bool)` | Устанавливает, следует ли экранировать специальные HTML символы |
| `SetIndent` | `func (enc *Encoder) SetIndent(prefix, indent string)` | Устанавливает формат отступа |

### Пример использования

```go
package main

import (
	"bytes"
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	var buf bytes.Buffer
	encoder := json.NewEncoder(&buf)
	encoder.SetIndent("", "  ")
	encoder.SetEscapeHTML(true)

	err := encoder.Encode(map[string]any{
		"name":  "Alice",
		"email": "alice@example.com",
	})
	if err != nil {
		panic(err)
	}
	fmt.Println(buf.String())
}
```

---

## Decoder — JSON декодер

`Decoder` читает и декодирует JSON значения из входного потока. 100% совместим с `encoding/json.Decoder`.

### Создание

Сигнатура: `func NewDecoder(r io.Reader, cfg ...Config) *Decoder`

Создаёт декодер, читающий из `r`. Поддерживает необязательный параметр `Config`.

```go
file, _ := os.Open("data.json")
defer file.Close()

decoder := json.NewDecoder(file)
for decoder.More() {
	var obj map[string]any
	if err := decoder.Decode(&obj); err != nil {
		break
	}
	fmt.Println(obj)
}
```

### Методы

| Метод | Сигнатура | Описание |
|------|------|------|
| `Decode` | `func (dec *Decoder) Decode(v any) error` | Читает следующее JSON значение из потока и декодирует |
| `UseNumber` | `func (dec *Decoder) UseNumber()` | Декодер будет разбирать числа как `Number` вместо `float64` |
| `DisallowUnknownFields` | `func (dec *Decoder) DisallowUnknownFields()` | Возвращает ошибку при обнаружении неизвестных полей при декодировании |
| `Buffered` | `func (dec *Decoder) Buffered() io.Reader` | Возвращает Reader с оставшимися данными в буфере декодера |
| `InputOffset` | `func (dec *Decoder) InputOffset() int64` | Возвращает смещение текущей позиции ввода |
| `More` | `func (dec *Decoder) More() bool` | Проверяет, есть ли ещё JSON значения в потоке |
| `Token` | `func (dec *Decoder) Token() (Token, error)` | Читает следующий JSON token |

### Пример использования

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"strings"
)

func main() {
	input := `{"name":"Alice","age":30}{"name":"Bob","age":25}`
	decoder := json.NewDecoder(strings.NewReader(input))

	for decoder.More() {
		var person map[string]any
		if err := decoder.Decode(&person); err != nil {
			break
		}
		fmt.Printf("Имя: %s, Возраст: %v\n", person["name"], person["age"])
	}
}
```

### Пример потокового декодирования

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"strings"
)

func main() {
	// Декодирование нескольких значений из JSON потока
	input := `[1,2,3][4,5,6]`
	decoder := json.NewDecoder(strings.NewReader(input))

	for decoder.More() {
		var arr []any
		if err := decoder.Decode(&arr); err != nil {
			panic(err)
		}
		fmt.Println(arr)
	}
}
```

### Пример чтения Token

```go
decoder := json.NewDecoder(strings.NewReader(`{"name":"Alice"}`))
for {
	token, err := decoder.Token()
	if err != nil {
		break
	}
	switch v := token.(type) {
	case json.Delim:
		fmt.Printf("Разделитель: %s\n", string(v))
	case string:
		fmt.Printf("Строка: %s\n", v)
	case float64:
		fmt.Printf("Число: %v\n", v)
	case bool:
		fmt.Printf("Логическое: %v\n", v)
	case nil:
		fmt.Println("null")
	}
}
```

---

## Token — JSON Token

`Token` — это значение JSON token, содержащее один из следующих типов:

- `Delim`, представляющий четыре JSON разделителя `[ ] { }`
- `bool`, представляющий JSON логическое значение
- `float64`, представляющий JSON число
- `Number`, представляющий JSON число когда включён `UseNumber`
- `string`, представляющий JSON строку
- `nil`, представляющий JSON null

```go
type Token any
```

Получается через `Decoder.Token()`.

---

## Number — JSON число

`Number` представляет строку JSON числа, используется Decoder при включённом режиме `UseNumber`.

```go
type Number string
```

### Методы

| Метод | Сигнатура | Описание |
|------|------|------|
| `String` | `func (n Number) String() string` | Возвращает строковое представление числа |
| `Float64` | `func (n Number) Float64() (float64, error)` | Преобразует в float64 |
| `Int64` | `func (n Number) Int64() (int64, error)` | Преобразует в int64 |

```go
decoder := json.NewDecoder(strings.NewReader(`{"price": 19.99}`))
decoder.UseNumber()
var obj map[string]any
decoder.Decode(&obj)

if num, ok := obj["price"].(json.Number); ok {
	f, _ := num.Float64()
	fmt.Println(f) // 19.99
}
```

---

## Delim — JSON разделитель

`Delim` — это тип JSON разделителя, соответствующий четырём символам `[`, `]`, `{`, `}`.

```go
type Delim rune
```

### Метод

#### String

Сигнатура: `func (d Delim) String() string`

Возвращает строковое представление разделителя.

```go
token, _ := decoder.Token()
if delim, ok := token.(json.Delim); ok {
	fmt.Println(delim.String()) // "[" или "{" и т.д.
}
```

---

## См. также

- [Функции пакета](./functions/) — справочник функций уровня пакета
- [Config](./config) — параметры конфигурации
- [Processor](./processor/) — методы процессора
- [Определения интерфейсов](./interfaces) — расширяемые интерфейсы
