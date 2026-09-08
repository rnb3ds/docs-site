---
sidebar_label: "Обобщённые функции"
title: "Обобщённые операции - CyberGo JSON | Справочник API"
description: "Обобщённый API CyberGo JSON: GetTyped[T], тип Result[T], AccessResult динамический доступ, значения по умолчанию, распаковка массивов, обобщения Go 1.18+."
sidebar_position: 10
---

# Обобщённые операции

Библиотека json предоставляет типобезопасные обобщённые операции с использованием обобщений Go 1.18+ для проверки типов во время компиляции.

## GetTyped

Сигнатура: `func GetTyped[T any](jsonStr, path string, defaultValue ...T) T`

Получает значение указанного типа из JSON. Поддерживает пользовательские типы. Возвращает `T` без ошибки. Если путь не существует или преобразование типа не удалось, возвращает нулевое значение или значение по умолчанию, заданное через `defaultValue`.

**Параметры**

| Имя | Тип | Обязательный | Описание |
|-----|-----|:------------:|----------|
| `jsonStr` | `string` | Да | Строка JSON |
| `path` | `string` | Да | Путь JSON |
| `defaultValue` | `...T` | Нет | Необязательное значение по умолчанию, возвращается если путь не существует или преобразование типа не удалось |

**Возвращаемое значение**

| Возвращаемое значение | Тип | Описание |
|----------------------|-----|----------|
| Единственное значение | `T` | Полученное значение; если путь не существует или преобразование типа не удалось — нулевое значение или значение по умолчанию |

**Поддерживаемые типы**

- Базовые типы: `string`, `int`, `int64`, `float64`, `bool`
- Типы срезов: `[]any`
- Типы отображений: `map[string]any`
- Пользовательские структуры

::: tip Автоматическая распаковка массива из одного элемента
Если целевой тип не является срезом, а полученное значение — это массив **ровно с одним элементом**, элемент автоматически распаковывается и затем преобразуется (это нужно для распределённого доступа по путям, например сценарий `choices.message.content`). Если целевой тип — срез, распаковка не выполняется.
:::

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"user": {"name": "Alice", "age": 30}}`

	// Получить строку
	name := json.GetTyped[string](data, "user.name")
	fmt.Println(name) // Вывод: Alice

	// Получить целое число
	age := json.GetTyped[int](data, "user.age")
	fmt.Println(age) // Вывод: 30

	// Получить массив
	arrData := `{"items": [1, 2, 3]}`
	items := json.GetTyped[[]any](arrData, "items")
	fmt.Println(items) // Вывод: [1 2 3]

	// Использовать значение по умолчанию
	email := json.GetTyped[string](data, "user.email", "unknown@example.com")
	fmt.Println(email) // Вывод: unknown@example.com
}
```

---

## AccessResult

`AccessResult` — результат динамического типизированного доступа, предоставляющий методы преобразования типов для динамической обработки. Получается через `SafeGet()`.

### Определение структуры

```go
type AccessResult struct {
	Value  any    // Значение результата
	Exists bool   // Существует ли путь
	Type   string // Информация о типе во время выполнения (для отладки)
}
```

### Методы

#### Ok

Сигнатура: `func (r AccessResult) Ok() bool`

Проверяет, существует ли значение.

```go
result := json.SafeGet(data, "user.name")
if result.Ok() {
	// Значение существует
}
```

#### Unwrap

Сигнатура: `func (r AccessResult) Unwrap() any`

Получает значение, возвращает nil если не существует.

```go
value := result.Unwrap()
```

#### UnwrapOr

Сигнатура: `func (r AccessResult) UnwrapOr(defaultValue any) any`

Получает значение или значение по умолчанию.

```go
value := result.UnwrapOr("default")
```

#### AsString

Сигнатура: `func (r AccessResult) AsString() (string, error)`

Безопасно преобразует в строку. Успешно только если значение имеет тип string.

```go
result := json.SafeGet(data, "user.name")
name, err := result.AsString()
if err != nil {
	// Несовпадение типа или путь не существует
}
```

#### AsInt

Сигнатура: `func (r AccessResult) AsInt() (int, error)`

Безопасно преобразует в целое число. Поддерживает все целочисленные типы и float (если это целое значение). **Примечание: bool не преобразуется в int.**

#### AsFloat64

Сигнатура: `func (r AccessResult) AsFloat64() (float64, error)`

Безопасно преобразует в число с плавающей точкой. Поддерживает все числовые типы. **Примечание: bool не преобразуется в float64.**

#### AsBool

Сигнатура: `func (r AccessResult) AsBool() (bool, error)`

Безопасно преобразует в логическое значение. Поддерживает типы bool и string ("true", "false", "1", "0" и т.д.).

### Цепочечные методы преобразования типов

`AccessResult` предоставляет следующие методы преобразования типов:

| Метод | Возвращаемый тип | Описание |
|-------|-----------------|----------|
| `AsString()` | `(string, error)` | Преобразование в строку (строгая проверка типа) |
| `AsStringConverted()` | `(string, error)` | Форматирование в строку |
| `AsInt()` | `(int, error)` | Преобразование в целое число (bool не преобразуется) |
| `AsFloat64()` | `(float64, error)` | Преобразование в float64 (bool не преобразуется) |
| `AsBool()` | `(bool, error)` | Преобразование в логическое значение |

### AsString vs AsStringConverted

| Метод | Поведение | Сценарий использования |
|-------|-----------|----------------------|
| `AsString()` | Строгая проверка типа, успешно только для типа string | Нужно убедиться в оригинальном типе |
| `AsStringConverted()` | Форматирование любого типа в строку | Нужно строковое представление |

```go
// Сценарий: получение значения, которое может быть числом или строкой
result := json.SafeGet(data, "user.id")

// Строгий режим — успешно только когда значение является string
id, err := result.AsString()

// Свободный режим — числа также будут преобразованы в строку
idStr, err := result.AsStringConverted()
```

---

## StreamLinesInto

Сигнатура: `func StreamLinesInto[T any](reader io.Reader, fn func(lineNum int, data T) error, cfg ...Config) ([]T, error)`

Построчно читает JSON из `io.Reader`, парсит каждую строку в тип `T` и вызывает функцию обратного вызова. Подходит для обработки больших файлов в формате JSONL.

**Параметры**

| Имя | Тип | Обязательный | Описание |
|-----|-----|:------------:|----------|
| `reader` | `io.Reader` | Да | Источник данных |
| `fn` | `func(lineNum int, data T) error` | Да | Функция обратного вызова для каждой строки, получает номер строки и распарсенные данные |
| `cfg` | `...Config` | Нет | Необязательная конфигурация |

**Возвращаемое значение**

| Возвращаемое значение | Тип | Описание |
|----------------------|-----|----------|
| Первое | `[]T` | Все успешно распарсенные результаты |
| Второе | `error` | Информация об ошибке |

**Детали поведения** (все управляются JSONL-полями Config, см. [Config](./config#структура-config)):

- Пустые строки по умолчанию пропускаются (`JSONLSkipEmpty: true`); при `JSONLSkipComments: true` пропускаются строки, начинающиеся с `#`/`//`
- Ошибка парсинга строки: по умолчанию возвращается ошибка `line N: <причина>`, а результат равен nil; при `JSONLContinueOnErr: true` строка пропускается и обработка продолжается
- Ошибка из обратного вызова: немедленная остановка и возврат этой ошибки (результат nil); паника в обратном вызове перехватывается и превращается в ошибку, процесс не падает
- Буфер чтения и максимальный размер строки управляются `JSONLBufferSize` (64KB) и `JSONLMaxLineSize` (1MB)
- Без cfg используется глобальный обработчик по умолчанию (на него влияет `SetGlobalProcessor`); при передаче cfg обработчик выбирается по этой конфигурации

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"strings"
)

func main() {
	jsonl := `{"name":"Alice","age":30}
{"name":"Bob","age":25}
{"name":"Charlie","age":35}`

	type Person struct {
		Name string `json:"name"`
		Age  int    `json:"age"`
	}

	reader := strings.NewReader(jsonl)
	results, err := json.StreamLinesInto[Person](reader, func(lineNum int, data Person) error {
		fmt.Printf("Строка %d: %s, %d лет\n", lineNum, data.Name, data.Age)
		return nil
	})
	if err != nil {
		panic(err)
	}
	fmt.Printf("Всего обработано %d записей\n", len(results))
}
```

---

## Примеры использования

### Парсинг конфигурации

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

type DatabaseConfig struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Database string `json:"database"`
	SSL      bool   `json:"ssl"`
}

func main() {
	config := `{
        "database": {
            "host": "localhost",
            "port": 5432,
            "database": "myapp",
            "ssl": true
        }
    }`

	// Парсинг конфигурации в структуру
	dbConfig := json.GetTyped[DatabaseConfig](config, "database")

	fmt.Printf("Host: %s:%d\n", dbConfig.Host, dbConfig.Port)
}
```

### Многотиповая обработка

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{
        "name": "Alice",
        "age": 30,
        "active": true,
        "score": 95.5,
        "tags": ["admin", "user"]
    }`

	// Обобщённое получение разных типов
	name := json.GetTyped[string](data, "name")
	age := json.GetTyped[int](data, "age")
	active := json.GetTyped[bool](data, "active")
	score := json.GetTyped[float64](data, "score")
	tags := json.GetTyped[[]any](data, "tags")

	fmt.Printf("Name: %s\n", name)
	fmt.Printf("Age: %d\n", age)
	fmt.Printf("Active: %v\n", active)
	fmt.Printf("Score: %.1f\n", score)
	fmt.Printf("Tags: %v\n", tags)
}
```

### Обработка ошибок

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	config := `{"timeout": 30}`

	timeout := json.GetTyped[int](config, "timeout")
	fmt.Printf("Timeout: %d\n", timeout) // Вывод: 30

	// Путь не существует, возвращается нулевое значение
	retries := json.GetTyped[int](config, "retries")
	fmt.Printf("Retries: %d\n", retries) // Вывод: 0 (нулевое значение)

	// Путь не существует, используется значение по умолчанию
	retries = json.GetTyped[int](config, "retries", 3)
	fmt.Printf("Retries: %d\n", retries) // Вывод: 3 (значение по умолчанию)
}
```

---

## Замечания по производительности

Преобразование в `GetTyped[T]` выполняется на двух уровнях: **базовые типы** (string/int/float64/bool, их срезы и отображения) идут по внутреннему быстрому пути и преобразуются напрямую; **сложные типы**, такие как пользовательские структуры, откатываются к универсальному пути «повторный Marshal → Unmarshal», поэтому работают несколько медленнее типоспецифичных геттеров (`GetString`, `GetInt` и др.).

| Метод | Производительность | Рекомендуемый сценарий |
|-------|--------------------|----------------------|
| `GetString`, `GetInt` и др. | Наивысшая (только базовые типы) | Чувствительность к производительности, тип известен |
| `GetTyped[T]` (базовые типы) | Быстрая (путь быстрого преобразования) | Чтение базовых типов в обобщённом коде |
| `GetTyped[T]` (структуры) | Средняя (преобразование через повторный marshal) | Разбор конфигурации, однократное чтение |
| `SafeGet` + `AccessResult` | Средняя | Динамическая обработка типов |

::: tip
На горячих путях при повторном чтении одной и той же структуры быстрее один раз выполнить `Parse`/`Unmarshal` в структуру либо один раз вызвать `GetTyped` и переиспользовать результат, а не вызывать `GetTyped[Struct]` отдельно для каждого пути.
:::

---

## Тип Result[T]

`Result[T]` — типобезопасный результат обобщённой операции для сценариев, где требуется определённый тип и обработка ошибок.

### Определение структуры

```go
type Result[T any] struct {
	Value  T     // Значение результата
	Exists bool  // Найден ли путь
	Error  error // Информация об ошибке
}
```

### Методы

| Метод | Возвращаемый тип | Описание |
|-------|-----------------|----------|
| `Ok()` | `bool` | Проверка валидности результата (нет ошибок и найден) |
| `Unwrap()` | `T` | Возвращает значение, при ошибке — нулевое значение |
| `UnwrapOr(default T)` | `T` | Возвращает значение, при ошибке — значение по умолчанию |

### Пример использования

У `Result[T]` нет входа «функция библиотеки возвращает напрямую» — он предназначен для **ручного конструирования** и часто используется, чтобы обернуть собственную функцию запроса и передать вызывающей стороне «значение + флаг существования + ошибку» как единый явный результат:

```go
package main

import (
	"errors"
	"fmt"

	"github.com/cybergodev/json"
)

// Функция чтения конфигурации с явной ошибкой, обёрнутая в Result[T]
func readConfig(data, path string) json.Result[string] {
	val, err := json.Get(data, path)
	if err != nil {
		return json.Result[string]{Error: err}
	}
	s, ok := val.(string)
	if !ok {
		return json.Result[string]{Error: fmt.Errorf("%s: %w", path, json.ErrTypeMismatch)}
	}
	return json.Result[string]{Value: s, Exists: true}
}

func main() {
	data := `{"env": "production"}`

	r := readConfig(data, "env")
	if r.Ok() {
		fmt.Println("Среда:", r.Unwrap()) // Вывод: Среда: production
	}

	missing := readConfig(data, "region")
	fmt.Println(missing.Exists, errors.Is(missing.Error, nil)) // Вывод: false true
	fmt.Println(missing.UnwrapOr("cn-north-1"))                // Вывод: cn-north-1
}
```

---

## Сравнение Result[T] и AccessResult

| Свойство | Result[T] | AccessResult |
|----------|-----------|---------------------|
| Типобезопасность | Обобщённый тип T | Тип any |
| Проверка существования | `Exists bool` | `Exists bool` |
| Обработка ошибок | Встроенное поле Error | Методы преобразования возвращают error |
| Цепочечные вызовы | Не поддерживаются | Поддерживаются цепочечные преобразования типов |
| Способ получения | Ручное конструирование (нет входа через функции библиотеки) | `SafeGet()` |
| Сценарий использования | Обёртка собственной функции запроса | Динамическая обработка типов |

### Рекомендации по выбору

- **Известный тип, детали ошибок не важны**: `GetTyped[T]` (подстраховка нулевым значением / значением по умолчанию)
- **Динамический тип**: используйте `AccessResult` и `SafeGet()`
- **Нужны цепочечные преобразования**: используйте `AccessResult`
- **Единая форма возврата для обёртки**: используйте `Result[T]` как возвращаемый тип собственной функции

---

## Связанные разделы

- [Функции пакета](./functions/) — функции-геттеры для конкретных типов
- [Определения типов](./types) — подробное определение AccessResult
- [Конфигурация](./config) — параметры конфигурации Config
