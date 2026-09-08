---
sidebar_label: "Запросы и получение"
title: "Функции запросов и получения - CyberGo JSON | Справочник API"
description: "Функции запросов CyberGo JSON: типобезопасные Get/GetString/GetInt, GetTyped[T], пакетный GetMultiple, SafeGet и GetWithContext с тайм-аутом, пути JSONPath."
sidebar_position: 2
---

# Функции запросов и получения

Функции запросов и получения пакета json с поддержкой path-выражений, типобезопасного получения и пакетных операций.

## Функции запросов по путям

### Get

Сигнатура: `func Get(jsonStr, path string, cfg ...Config) (any, error)`

Получает значение произвольного типа по пути.

**Параметры**

| Имя | Тип | Обязателен | Описание |
|------|------|------|------|
| `jsonStr` | `string` | да | JSON-строка |
| `path` | `string` | да | Path-выражение |
| `cfg` | `Config` | нет | Необязательная конфигурация |

**Пример**

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	val, err := json.Get(`{"items":[{"name":"test"}]}`, "items[0].name")
	if err != nil {
		panic(err)
	}
	fmt.Println(val) // Вывод: test
}
```

### GetWithContext

Сигнатура: `func GetWithContext(ctx context.Context, jsonStr, path string, cfg ...Config) (any, error)`

Получение по пути с контекстом. Поддерживает тайм-ауты и отмену. Контекстно-зависимая версия `Get`.

::: info Семантика отмены: проверка на границах
Context проверяется лишь **перед началом операции** и **после её завершения**, но не в процессе разбора/навигации:

- Если отмена/тайм-аут произошли до начала: сразу возвращается `ctx.Err()` (`context.Canceled` / `context.DeadlineExceeded`), разбор не выполняется вовсе
- Если тайм-аут обнаружен только после завершения операции: также возвращается `ctx.Err()` — даже успешно полученное значение будет отброшено
- Поэтому функция подходит как **страж на границе вызова** — чтобы не делать бесполезную работу по уже просроченному запросу; однако сам разбор нельзя прервать посередине: для очень больших JSON-документов тайм-аут не ограничивает верхний предел длительности одного разбора
:::

```go
package main

import (
	"context"
	"fmt"
	"github.com/cybergodev/json"
	"time"
)

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	val, err := json.GetWithContext(ctx, `{"user":{"name":"Alice"}}`, "user.name")
	if err != nil {
		panic(err)
	}
	fmt.Println(val) // Вывод: Alice
}
```

## Функции типобезопасного получения

Функции типобезопасного получения предоставляют откат к значению по умолчанию через вариативный параметр `defaultValue`. Если путь не существует, значение равно null или преобразование типа не удалось, возвращается `defaultValue` (если не задан — нулевое значение соответствующего типа).

### GetString

Сигнатура: `func GetString(jsonStr, path string, defaultValue ...string) string`

Получает строковое значение по пути.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	jsonStr := `{"user": {"name": "CyberGo"}}`

	name := json.GetString(jsonStr, "user.name")
	fmt.Println(name) // Вывод: CyberGo

	// Несуществующий путь возвращает нулевое значение (пустую строку) или заданное значение по умолчанию
	nickname := json.GetString(jsonStr, "user.nickname", "неизвестно")
	fmt.Println(nickname) // Вывод: неизвестно
}
```

### GetInt

Сигнатура: `func GetInt(jsonStr, path string, defaultValue ...int) int`

Получает целочисленное значение по пути.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	jsonStr := `{"pagination": {"count": 42}, "timeout": 30}`

	count := json.GetInt(jsonStr, "pagination.count")
	fmt.Println(count) // Вывод: 42

	timeout := json.GetInt(jsonStr, "timeout")
	fmt.Println(timeout) // Вывод: 30

	// Несуществующий путь возвращает заданное значение по умолчанию
	page := json.GetInt(jsonStr, "pagination.page", 1)
	fmt.Println(page) // Вывод: 1
}
```

### GetFloat

Сигнатура: `func GetFloat(jsonStr, path string, defaultValue ...float64) float64`

Получает число с плавающей точкой по пути.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	jsonStr := `{"item": {"price": 19.99}, "rate": 0.85}`

	price := json.GetFloat(jsonStr, "item.price")
	fmt.Println(price) // Вывод: 19.99

	rate := json.GetFloat(jsonStr, "rate")
	fmt.Println(rate) // Вывод: 0.85

	// Несуществующий путь возвращает заданное значение по умолчанию
	discount := json.GetFloat(jsonStr, "item.discount", 0.0)
	fmt.Println(discount) // Вывод: 0
}
```

### GetBool

Сигнатура: `func GetBool(jsonStr, path string, defaultValue ...bool) bool`

Получает логическое значение по пути.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	jsonStr := `{"feature": {"enabled": true}, "debug": false}`

	enabled := json.GetBool(jsonStr, "feature.enabled")
	fmt.Println(enabled) // Вывод: true

	debug := json.GetBool(jsonStr, "debug")
	fmt.Println(debug) // Вывод: false

	// Несуществующий путь возвращает заданное значение по умолчанию
	verbose := json.GetBool(jsonStr, "feature.verbose", false)
	fmt.Println(verbose) // Вывод: false
}
```

### GetArray

Сигнатура: `func GetArray(jsonStr, path string, defaultValue ...[]any) []any`

Получает массив по пути.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	jsonStr := `{"items": ["apple", "banana", "cherry"]}`

	items := json.GetArray(jsonStr, "items")
	for i, item := range items {
		fmt.Printf("[%d] %v\n", i, item)
	}

	// Несуществующий путь возвращает заданное значение по умолчанию
	empty := json.GetArray(jsonStr, "tags", []any{"default"})
	fmt.Println(empty) // Вывод: [default]
}
```

### GetObject

Сигнатура: `func GetObject(jsonStr, path string, defaultValue ...map[string]any) map[string]any`

Получает объект по пути.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	jsonStr := `{"user": {"profile": {"name": "CyberGo", "level": 5}}}`

	profile := json.GetObject(jsonStr, "user.profile")
	fmt.Println(profile) // map[level:5 name:CyberGo]

	// Несуществующий путь возвращает заданное значение по умолчанию
	settings := json.GetObject(jsonStr, "user.settings", map[string]any{"theme": "dark"})
	fmt.Println(settings) // Вывод: map[theme:dark]
}
```

## Обобщённые функции получения

### GetTyped[T]

Сигнатура: `func GetTyped[T any](jsonStr, path string, defaultValue ...T) T`

Обобщённая функция получения с поддержкой пользовательских типов. Если путь не существует, значение равно null или преобразование типа не удалось, возвращается `defaultValue` (если не задан — нулевое значение `T`).

**Примечание к именованию**: `GetTyped[T]` семантически эквивалентен `GetAs[T]` — получить JSON-значение и преобразовать его к указанному типу `T`.

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
	jsonStr := `{"user": {"name": "CyberGo", "age": 30}}`

	// Получение типизированной структуры
	user := json.GetTyped[User](jsonStr, "user")
	fmt.Printf("Name: %s, Age: %d\n", user.Name, user.Age)

	// Примеры со встроенными типами
	name := json.GetTyped[string](jsonStr, "user.name")
	fmt.Println(name) // Вывод: CyberGo

	age := json.GetTyped[int](jsonStr, "user.age")
	fmt.Println(age) // Вывод: 30

	// Несуществующий путь возвращает заданное значение по умолчанию
	email := json.GetTyped[string](jsonStr, "user.email", "unknown@example.com")
	fmt.Println(email) // Вывод: unknown@example.com
}
```

## Функции безопасного получения

### SafeGet (функция уровня пакета)

Сигнатура: `func SafeGet(jsonStr, path string, cfg ...Config) AccessResult`

Выполняет типобезопасную операцию получения, возвращая `AccessResult` с методами преобразования типов (`AsString`, `AsInt`, `AsFloat64`, `AsBool`).

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	jsonStr := `{"user": {"name": "CyberGo", "age": 30}}`

	result := json.SafeGet(jsonStr, "user.age")
	if result.Exists {
		age, _ := result.AsInt()
		fmt.Println(age) // Вывод: 30
	}

	nameResult := json.SafeGet(jsonStr, "user.name")
	name, _ := nameResult.AsString()
	fmt.Println(name) // Вывод: CyberGo
}
```

### SafeGet (метод Processor)

Сигнатура: `func (p *Processor) SafeGet(jsonStr, path string, cfg ...Config) AccessResult`

Выполняет типобезопасную операцию получения через экземпляр Processor.

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

jsonStr := `{"user": {"name": "CyberGo", "age": 30}}`

result := p.SafeGet(jsonStr, "user.age")
if result.Exists {
	age, _ := result.AsInt()
	fmt.Println(age) // Вывод: 30
}
```

::: tip Выбор: серия GetTyped или SafeGet
- **Поддержка Config**: типизированные функции `GetString`/`GetInt`/`GetTyped[T]` и др. **не могут принимать Config** — вариативный параметр уже занят `defaultValue` (в Go у функции допускается только один вариативный параметр); они всегда используют процессор по умолчанию. Когда нужно настроить лимиты безопасности, проверки или кэш на уровне вызова, используйте `SafeGet(jsonStr, path, cfg)` либо создайте выделенный Processor через `json.New(cfg)` и вызывайте его методы `GetString` и др.
- **Строгость преобразования**: типизированные функции используют мягкое преобразование (строка `"42"` превращается в `int`, булево `true` — в `1`); `AsInt`/`AsFloat64` у `SafeGet` отклоняют булев ввод, а `AsString` требует, чтобы исходное значение уже было string (для явной стрингификации используйте `AsStringConverted`).
- **Семантика ошибок**: типизированные функции **молча откатываются** к значению по умолчанию/нулевому значению; `SafeGet` сохраняет оба вида информации — «существует ли» (`Exists`/`Ok()`) и «не удалось преобразовать» (методы `AsInt`/`AsString` и др. возвращают error), что удобно для раздельной обработки.
:::

## Расширенные методы Processor

Следующие методы предоставляются одновременно как функции уровня пакета и как методы Processor.

### GetMultiple (функция уровня пакета)

Сигнатура: `func GetMultiple(jsonStr string, paths []string, cfg ...Config) (map[string]any, error)`

Пакетное получение значений нескольких путей (функция уровня пакета, Processor создавать не нужно).

**Семантика возвращаемых значений**

- Весь JSON парсится **один раз**, затем вычисляется каждый путь (эффективнее многократных вызовов `Get`)
- Возвращаемый map использует в качестве ключей **сами строки путей** (например, `"user.name"`) в точном соответствии с входным `paths`
- **Частичный сбой**: если получение по какому-то пути не удалось, этот ключ в map равен `nil`, а функция возвращает **первую** встреченную ошибку (`map` и `err` одновременно не nil) — результаты успешных путей всё равно применимы
- Если **синтаксис** любого пути недействителен, вся операция завершается сбоем (возвращается `nil, err`); при пустом срезе `paths` возвращается пустой map и `nil`

```go
jsonStr := `{"user": {"name": "CyberGo", "age": 30, "email": "test@example.com"}}`

paths := []string{"user.name", "user.age", "user.email"}
values, err := json.GetMultiple(jsonStr, paths)
if err != nil {
	panic(err)
}
fmt.Println(values["user.name"]) // Вывод: CyberGo
```

**Пример частичного сбоя** (сбойный путь равен nil, но успешные пути по-прежнему доступны):

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"user": {"name": "CyberGo", "age": 30}}`

	values, err := json.GetMultiple(data, []string{"user.name", "user.missing"})
	fmt.Println(values["user.name"])    // Вывод: CyberGo (успешные пути не затронуты)
	fmt.Println(values["user.missing"]) // Вывод: <nil> (сбойный путь равен nil)
	fmt.Println(err != nil)             // Вывод: true (при частичном сбое err не nil)
}
```

### Processor.GetMultiple

Сигнатура: `func (p *Processor) GetMultiple(jsonStr string, paths []string, cfg ...Config) (map[string]any, error)`

Пакетное получение значений нескольких путей.

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

jsonStr := `{"user": {"name": "CyberGo", "age": 30, "email": "test@example.com"}}`

paths := []string{"user.name", "user.age", "user.email"}
values, err := p.GetMultiple(jsonStr, paths)
if err != nil {
	panic(err)
}
fmt.Println(values["user.name"]) // Вывод: CyberGo
```

## Обработка ошибок

Сбои `Get`/`GetWithContext` различаются сигнатурными ошибками через `errors.Is`; типизированные функции (`GetString` и др.) не возвращают ошибку и молча откатываются к нулевому значению/значению по умолчанию:

```go
package main

import (
	"errors"
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"user": {"name": "Alice"}}`

	if _, err := json.Get(data, "user.age"); errors.Is(err, json.ErrPathNotFound) {
		fmt.Println("Путь не существует, идём по логике значения по умолчанию")
	}
	if _, err := json.Get(`{"name": "x"}`, "name[0]"); errors.Is(err, json.ErrTypeMismatch) {
		fmt.Println("Несоответствие типов: строка не поддерживает индексацию")
	}
	if _, err := json.Get(`{"name": }`, "name"); errors.Is(err, json.ErrInvalidJSON) {
		fmt.Println("Ввод не является корректным JSON")
	}
}
```

::: tip Точки входа для производительности
При повторяющихся запросах по одному пути используйте [`CompilePath`/`GetCompiled`](../processor/query#compilepath); при запросах по нескольким путям одного JSON — [`PreParse`/`GetFromParsed`](../processor/query#preparse); оба описаны в справочнике запросов Processor.
:::

## Связанные типы

### AccessResult

Поля структуры `AccessResult`, используемой `SafeGet`:

| Поле | Тип | Описание |
|------|------|------|
| `Value` | `any` | Полученное значение |
| `Exists` | `bool` | Существует ли путь |
| `Type` | `string` | Определённый тип значения |

**Методы**: `Ok()` · `Unwrap()` · `UnwrapOr()` · `AsString()` · `AsStringConverted()` · `AsInt()` · `AsFloat64()` · `AsBool()`

Подробнее см. [Тип AccessResult](../types#accessresult-результат-доступа-к-свойству).

### Result[T]

Поля обобщённой структуры `Result[T]`:

| Поле | Тип | Описание |
|------|------|------|
| `Value` | `T` | Полученное значение |
| `Exists` | `bool` | Найдено ли значение |
| `Error` | `error` | Информация об ошибке |

## См. также

- [Функции парсинга и валидации](./parse) - операции парсинга и валидации Parse, Valid, ValidateSchema и др.
- [Функции пакетных операций](./batch) - пакетная обработка ProcessBatch
- [Функции изменения](./modify) - операции изменения Set, Delete и др.
- [Кодирование и вывод](./output) - операции сериализации Marshal, Unmarshal и др.
- [Вспомогательные функции](../helpers) - утилиты CompareJSON, MergeJSON и др.
- [Параметры конфигурации](../config) - подробный разбор конфигурации Config
