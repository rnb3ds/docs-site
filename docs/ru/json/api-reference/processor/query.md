---
sidebar_label: "Запросы и получение"
title: "Запросы по путям Processor - CyberGo JSON | Справочник API"
description: "Запросы по путям CyberGo JSON Processor: типизированные Get/GetString/GetInt, пакетный GetMultiple, SafeGet с AccessResult и обобщённый GetTyped[T], JSONPath."
sidebar_position: 2
---

# Методы запросов по путям

Processor предоставляет множество типобезопасных методов запросов по путям.

::: tip Зеркальная связь с функциями уровня пакета
Методы этой страницы и [пакетные функции запросов](../functions/query) — два входа к одному поведению: синтаксис путей, возвращаемые типы и семантика ошибек полностью совпадают. Здесь фокус на конфигурационной семантике и паттернах переиспользования со стороны Processor; полные примеры уровня функций см. на пакетной странице.
:::

## Базовые запросы

### Get

Сигнатура: `func (p *Processor) Get(jsonStr, path string, cfg ...Config) (result any, err error)`

Получает значение произвольного типа по указанному пути.

```go
val, err := p.Get(data, "items[0]")
if err != nil {
	panic(err)
}
```

### GetString

Сигнатура: `func (p *Processor) GetString(jsonStr, path string, defaultValue ...string) string`

Получает строковое значение по указанному пути. Если путь не существует, значение равно null или преобразование типа не удалось, возвращается пустая строка или `defaultValue`.

```go
// Без значения по умолчанию
name := p.GetString(data, "user.name")

// Со значением по умолчанию
email := p.GetString(data, "user.email", "unknown@example.com")
```

### GetInt

Сигнатура: `func (p *Processor) GetInt(jsonStr, path string, defaultValue ...int) int`

Получает целочисленное значение по указанному пути. Если путь не существует, значение равно null или преобразование типа не удалось, возвращается 0 или `defaultValue`.

```go
count := p.GetInt(data, "count")
timeout := p.GetInt(data, "timeout", 30)
```

### GetFloat

Сигнатура: `func (p *Processor) GetFloat(jsonStr, path string, defaultValue ...float64) float64`

Получает число с плавающей точкой по указанному пути. Если путь не существует, значение равно null или преобразование типа не удалось, возвращается 0 или `defaultValue`.

```go
price := p.GetFloat(data, "price")
rate := p.GetFloat(data, "rate", 0.5)
```

### GetBool

Сигнатура: `func (p *Processor) GetBool(jsonStr, path string, defaultValue ...bool) bool`

Получает логическое значение по указанному пути. Если путь не существует, значение равно null или преобразование типа не удалось, возвращается false или `defaultValue`.

```go
enabled := p.GetBool(data, "enabled")
debug := p.GetBool(data, "debug", false)
```

::: tip Типизированное получение не принимает cfg
Вариативный параметр typed getters `GetString`/`GetInt` и др. — это **значение по умолчанию**, а не `Config` (в Go допускается только один вариативный параметр — это одно из трёх намеренных исключений официального дизайна). Для типизированного чтения с управлением через `Config` создайте процессор через `New(cfg)` и вызывайте его типизированные методы `GetString`/`GetInt` и др. либо используйте `SafeGet` + методы преобразования `AsInt()` и др.
:::

### GetWithContext

Сигнатура: `func (p *Processor) GetWithContext(ctx context.Context, jsonStr, path string, cfg ...Config) (any, error)`

Получение по пути с контекстом. Поддерживает тайм-ауты и отмену; контекстно-зависимая версия `Get`.

::: info Примечание
Context проверяется до и после операции, но не в процессе разбора/навигации. Для больших JSON-документов отмена во время операции может не сработать.
:::

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

val, err := p.GetWithContext(ctx, data, "items[0].name")
if err != nil {
	panic(err)
}
fmt.Println(val)
```

## Безопасные запросы

### SafeGet

Сигнатура: `func (p *Processor) SafeGet(jsonStr, path string, cfg ...Config) AccessResult`

Безопасно получает значение, возвращая структуру AccessResult. Подходит для сценариев с преобразованием типов.

```go
result := p.SafeGet(data, "user.age")
if result.Ok() {
	age, err := result.AsInt()
	if err != nil {
		// Преобразование типа не удалось
	}
	fmt.Println(age)
}

// Можно получать и другие типы
name, err := result.AsString()
price, err := result.AsFloat64()
enabled, err := result.AsBool()
```

**Методы AccessResult**:

| Метод | Описание |
|------|------|
| `Ok() bool` | Проверить, существует ли значение |
| `Unwrap() any` | Получить исходное значение |
| `UnwrapOr(defaultValue any) any` | Получить значение или значение по умолчанию |
| `AsString() (string, error)` | Безопасно преобразовать в строку |
| `AsStringConverted() (string, error)` | Преобразовать в строку форматированием |
| `AsInt() (int, error)` | Безопасно преобразовать в целое |
| `AsFloat64() (float64, error)` | Безопасно преобразовать в число с плавающей точкой |
| `AsBool() (bool, error)` | Безопасно преобразовать в логическое значение |

## Получение коллекций

### GetArray

Сигнатура: `func (p *Processor) GetArray(jsonStr, path string, defaultValue ...[]any) []any`

Получает массив по указанному пути. Если путь не существует, значение равно null или преобразование типа не удалось, возвращается nil или `defaultValue`.

```go
items := p.GetArray(data, "items")
tags := p.GetArray(data, "tags", []any{"default"})
```

### GetObject

Сигнатура: `func (p *Processor) GetObject(jsonStr, path string, defaultValue ...map[string]any) map[string]any`

Получает объект по указанному пути. Если путь не существует, значение равно null или преобразование типа не удалось, возвращается nil или `defaultValue`.

```go
profile := p.GetObject(data, "user.profile")
config := p.GetObject(data, "config", map[string]any{"timeout": 30})
```

## Обобщённое получение

::: tip Функция уровня пакета
`GetTyped[T]` — функция уровня пакета, а не метод Processor. Подробнее см. [Обобщённые операции](../generics#gettyped).
:::

```go
// Использование пакетного GetTyped
user := json.GetTyped[User](data, "user")

// Со значением по умолчанию
user = json.GetTyped[User](data, "user", User{Name: "unknown"})
```

## Пакетные запросы

### GetMultiple

Сигнатура: `func (p *Processor) GetMultiple(jsonStr string, paths []string, cfg ...Config) (map[string]any, error)`

За один вызов получает значения нескольких путей, возвращая соответствие путей значениям.

```go
results, err := p.GetMultiple(data, []string{"user.name", "user.age", "user.email"})
if err != nil {
	panic(err)
}
fmt.Println(results["user.name"]) // Alice
fmt.Println(results["user.age"])  // 30
```

## Компиляция путей

### CompilePath

Сигнатура: `func (p *Processor) CompilePath(path string) (*CompiledPath, error)`

Предкомпилирует path-выражение для последующих быстрых повторных операций.

```go
cp, err := p.CompilePath("users[0].name")
if err != nil {
	panic(err)
}
defer cp.Release()

// Многократные запросы по скомпилированному пути
value, err := p.GetCompiled(data1, cp)
value, err = p.GetCompiled(data2, cp)
```

### GetCompiled

Сигнатура: `func (p *Processor) GetCompiled(jsonStr string, cp *CompiledPath) (any, error)`

Получает значение по предкомпилированному пути. Подходит для повторных запросов одного пути по нескольким JSON-данным.

::: warning Два отличия от Get
- **Не принимает per-call `cfg`**: проверка ввода (размер, глубина, опасные паттерны) всегда выполняется по собственной конфигурации процессора.
- **Не ищет в кэше результатов**: экономится только разбор пути — сам JSON парсится каждый раз; чтобы переиспользовать и разбор, используйте вместе с [`PreParse`](#preparse).
:::

**Полный пример: повторные запросы одного пути по партии документов**

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

	docs := []string{
		`{"user":{"name":"Alice"}}`,
		`{"user":{"name":"Bob"}}`,
	}
	for _, doc := range docs {
		name, err := p.GetCompiled(doc, cp)
		if err != nil {
			panic(err)
		}
		fmt.Println(name)
	}
}

// Вывод:
// Alice
// Bob
```

## Запросы по предразобранному JSON

### PreParse

Сигнатура: `func (p *Processor) PreParse(jsonStr string, cfg ...Config) (*ParsedJSON, error)`

Заранее разбирает JSON-документ и возвращает переиспользуемый `*ParsedJSON`. При многократных запросах к одному JSON разбор выполняется один раз, последующие запросы сразу навигируют.

```go
parsed, err := p.PreParse(largeJSON)
if err != nil {
	panic(err)
}
defer parsed.Release() // Освобождение ссылки на дерево разбора после использования

// Многократные запросы переиспользуют результат разбора
name, _ := p.GetFromParsed(parsed, "user.name")
email, _ := p.GetFromParsed(parsed, "user.email")
tags, _ := p.GetFromParsed(parsed, "tags")
```

### GetFromParsed

Сигнатура: `func (p *Processor) GetFromParsed(parsed *ParsedJSON, path string, cfg ...Config) (any, error)`

Получает значение по пути из предразобранного результата, пропуская этап разбора JSON.

Контейнерные результаты (`map[string]any` / `[]any`) по умолчанию возвращаются после защитного глубокого копирования, примитивные типы возвращаются напрямую; если у процессора включён `Config.CacheSharedResults` (вызывающая сторона обещает не изменять возвращаемое значение), копирование пропускается. Сам `GetFromParsed` **не пишет в кэш результатов** — предразбор переиспользует само дерево разбора, а не результаты запросов.

**Методы ParsedJSON**

| Метод | Описание |
|------|------|
| `Data() any` | Получить нижележащий результат разбора (`map[string]any` / `[]any`) |
| `Release()` | Обнуляет внутреннюю ссылку на данные, позволяя GC собрать дерево разбора (после вызова `Data()` возвращает `nil`; использовать с `defer`) |

::: tip Разделение труда с CompilePath
`PreParse` устраняет «повторный разбор одного JSON», `CompilePath` — «повторный разбор одного пути»; `SetFromParsed` (см. [Парсинг и валидация](./parse#setfromparsed)) поддерживает цепочечные изменения предразобранного результата. Критерии выбора описаны в [Введении в Processor](../../getting-started/processor-guide).
:::

## См. также

- [Изменение данных](./modify) - методы Set/Delete
- [Пакетные операции](./batch) - пакетная обработка ProcessBatch
- [Обобщённые операции](../generics) - обобщённое получение GetTyped[T]
