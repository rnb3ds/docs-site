---
sidebar_label: "Операции изменения"
title: "Функции изменения - CyberGo JSON | Справочник API"
description: "Функции изменения CyberGo JSON: Set/SetMultiple, слияние MergeJSON/MergeMany, автосоздание путей, три стратегии MergeMode, замена и добавление в массивах."
sidebar_position: 3
---

# Функции изменения

Функции изменения JSON пакета json с поддержкой установки по путям, пакетных обновлений и операций слияния.

## Функции установки

### Set

Сигнатура: `func Set(jsonStr, path string, value any, cfg ...Config) (string, error)`

Устанавливает значение по указанному пути и возвращает изменённую JSON-строку.

**Параметры**

| Имя | Тип | Обязателен | Описание |
|------|------|------|------|
| `jsonStr` | `string` | да | JSON-строка |
| `path` | `string` | да | Path-выражение |
| `value` | `any` | да | Устанавливаемое значение |
| `cfg` | `Config` | нет | Необязательная конфигурация |

**Возвращаемые значения и ошибки**

При успехе возвращает изменённую JSON-строку и `nil`; при сбое — **исходный немодифицированный** `jsonStr` и ошибку (контракт, согласованный с `Delete`; сигнатурные значения определяются через `errors.Is`):

| Ошибка | Сценарий срабатывания |
|------|----------|
| `ErrInvalidJSON` | `jsonStr` не является корректным JSON |
| `ErrInvalidPath` | Недействительный синтаксис path-выражения |
| `ErrPathNotFound` | Путь не существует и `CreatePaths = false` |
| `ErrTypeMismatch` | В целевой позиции конфликт типов, запись невозможна |

**Пример**

```go
result, err := json.Set(`{"user":{}}`, "user.name", "Alice")
if err != nil {
	panic(err)
}
fmt.Println(result) // {"user":{"name":"Alice"}}
```

**Автоматическое создание при несуществующем пути**

```go
// Промежуточные пути создаются автоматически
result, err := json.Set(`{}`, "user.profile.name", "Bob")
// {"user":{"profile":{"name":"Bob"}}}
```

**Установка значений разных типов**

```go
data := `{}`

// Установка строки
json.Set(data, "user.name", "Alice")

// Установка числа
json.Set(data, "user.age", 30)

// Установка логического значения
json.Set(data, "user.active", true)

// Установка null
json.Set(data, "user.deleted", nil)

// Установка вложенного объекта
json.Set(data, "user.address", map[string]any{
	"city": "Beijing",
	"zip":  "100000",
})

// Установка массива
json.Set(data, "user.tags", []string{"admin", "developer"})
```

### SetMultiple

Сигнатура: `func SetMultiple(jsonStr string, updates map[string]any, cfg ...Config) (string, error)`

Пакетная установка значений нескольких путей.

**Параметры**

| Имя | Тип | Обязателен | Описание |
|------|------|------|------|
| `jsonStr` | `string` | да | JSON-строка |
| `updates` | `map[string]any` | да | Соответствие путей значениям |
| `cfg` | `Config` | нет | Необязательная конфигурация |

**Пример**

```go
updates := map[string]any{
	"user.name":  "Bob",
	"user.age":   25,
	"user.email": "bob@example.com",
}
result, err := json.SetMultiple(data, updates)
if err != nil {
	panic(err)
}
fmt.Println(result)
```

**Преимущество по производительности**

Для нескольких операций изменения `SetMultiple` эффективнее многократных вызовов `Set`:

```go
// Рекомендуется: один вызов
updates := map[string]any{"a": 1, "b": 2, "c": 3}
result, err := json.SetMultiple(data, updates)

// Не рекомендуется: многократные вызовы
result, err = json.Set(data, "a", 1)
result, err = json.Set(result, "b", 2)
result, err = json.Set(result, "c", 3)
```

### SetCreate

Сигнатура: `func SetCreate(jsonStr, path string, value any, cfg ...Config) (string, error)`

Устанавливает значение и автоматически создаёт несуществующие промежуточные пути. Эквивалентно `Set` с **принудительно включённым** `CreatePaths`: даже при передаче дополнительного `cfg` остальные поля объединяются как обычно, но `CreatePaths` всегда принудительно `true` (явная самодокументация «здесь разрешено создание путей»). Сам `Config.CreatePaths` по умолчанию равен `true`, поэтому без cfg `SetCreate` ведёт себя как `Set`.

```go
// Несуществующие промежуточные пути создаются автоматически
result, err := json.SetCreate(`{}`, "user.profile.bio", "Developer")
// {"user":{"profile":{"bio":"Developer"}}}
```

### SetMultipleCreate

Сигнатура: `func SetMultipleCreate(jsonStr string, updates map[string]any, cfg ...Config) (string, error)`

Пакетная установка нескольких значений с автоматическим созданием промежуточных путей. Отношение к `SetMultiple` то же, что описано выше: остальные поля `cfg` действуют как обычно, `CreatePaths` принудительно `true`.

```go
result, err := json.SetMultipleCreate(`{}`, map[string]any{
	"user.profile.bio":      "Developer",
	"user.profile.location": "China",
})
```

## Изменение путей массивов

Серия `Set` имеет особое поведение для путей массивов; синтаксис путей подробно описан в [Синтаксисе path-выражений](../../getting-started/path-syntax):

```go
data := `{"items": ["a", "b", "c"]}`

// Замена по индексу (включая отрицательные)
r1, _ := json.Set(data, "items[0]", "x")  // {"items":["x","b","c"]}
r2, _ := json.Set(data, "items[-1]", "z") // {"items":["a","b","z"]}

// Добавление элемента
r3, _ := json.Set(data, "items[+]", "d") // {"items":["a","b","c","d"]}

// Подстановочный знак: все элементы заменяются одним значением
r4, _ := json.Set(data, "items[*]", "-") // {"items":["-","-","-"]}

// Вложенность: поле элемента массива (несуществующий путь создаётся автоматически)
users := `{"users": [{"name": "Alice"}]}`
r5, _ := json.Set(users, "users[0].age", 30)
// {"users":[{"age":30,"name":"Alice"}]}

r6, _ := json.SetCreate(`{}`, "users[0].profile.bio", "Developer")
// {"users":[{"profile":{"bio":"Developer"}}]}
```

::: warning Ограничение сегмента-среза
**Сегменты-срезы** вида `items[1:3]` без проблем работают в запросах (возвращают подмассив), но как **последний сегмент** в `Set`/`Delete` в текущей версии возвращают ошибку ("distributed set ops on slices not yet supported") — то есть распределённая модификация «перезаписать каждый элемент диапазона» не поддерживается. Когда нужен такой эффект, используйте `ForeachReturn` или путь с подстановочным знаком.
:::

## Функции слияния

### MergeJSON

Сигнатура: `func MergeJSON(json1, json2 string, cfg ...Config) (string, error)`

Сливает два JSON-объекта со стратегией глубокого слияния. Для вложенных объектов ключи сливаются рекурсивно в режиме, заданном `Config.MergeMode`. Для примитивных значений и массивов приоритет имеет значение из patch.

**Параметры**

| Имя | Тип | Обязателен | Описание |
|------|------|------|------|
| `json1` | `string` | да | Базовая JSON-строка |
| `json2` | `string` | да | Перекрывающая JSON-строка |
| `cfg` | `...Config` | нет | Необязательная конфигурация (режим слияния задаётся через `MergeMode`) |

**Режимы слияния** (задаются через `Config.MergeMode`, по умолчанию `MergeUnion`):

| Режим | Поведение для объектов | Поведение для массивов |
|------|----------|----------|
| `MergeUnion` | Объединяются все ключи; при конфликте берётся значение из patch | Объединяются все элементы с удалением дубликатов |
| `MergeIntersection` | Сохраняются только общие ключи, значения — из patch | Сохраняются только общие элементы |
| `MergeDifference` | Сохраняются только ключи, уникальные для base | Сохраняются только элементы, уникальные для base |

```go
base := `{"a": 1, "b": 2, "nested": {"x": 10, "y": 20}}`
override := `{"b": 3, "c": 4, "nested": {"y": 30, "z": 40}}`

// Слияние-объединение (по умолчанию)
result, _ := json.MergeJSON(base, override)
// Результат: {"a":1,"b":3,"c":4,"nested":{"x":10,"y":30,"z":40}}

// Слияние-пересечение — сохраняются только общие ключи
cfg := json.DefaultConfig()
cfg.MergeMode = json.MergeIntersection
result, _ = json.MergeJSON(base, override, cfg)
// Результат: {"b":3,"nested":{"y":30}}

// Слияние-разность — сохраняются только ключи, уникальные для base
cfg = json.DefaultConfig()
cfg.MergeMode = json.MergeDifference
result, _ = json.MergeJSON(base, override, cfg)
// Результат: {"a":1,"nested":{"x":10}}
```

**Сравнение трёх режимов на поле-массиве** (массивы сливаются с **удалением дубликатов по элементам**, а не с перезаписью по индексам):

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	base := `{"tags":[1,2,3],"roles":["dev"]}`
	override := `{"tags":[3,4]}`

	// Объединение: элементы base идут первыми, добавляются новые элементы override без дубликатов
	union, _ := json.MergeJSON(base, override)
	fmt.Println(union)
	// Вывод: {"roles":["dev"],"tags":[1,2,3,4]}

	// Пересечение: сохраняются только элементы, встречающиеся с обеих сторон (порядок base сохраняется)
	cfg := json.DefaultConfig()
	cfg.MergeMode = json.MergeIntersection
	inter, _ := json.MergeJSON(base, override, cfg)
	fmt.Println(inter)
	// Вывод: {"tags":[3]}

	// Разность: сохраняются только элементы, уникальные для base (ключ roles целиком есть только в base, поэтому сохраняется)
	cfg.MergeMode = json.MergeDifference
	diff, _ := json.MergeJSON(base, override, cfg)
	fmt.Println(diff)
	// Вывод: {"roles":["dev"],"tags":[1,2]}
}
```

::: warning Верхнеуровневые аргументы должны быть JSON-объектами
`MergeJSON` требует, чтобы оба верхнеуровневых аргумента были JSON-объектами (`{...}`); если любая из сторон — массив или скаляр, возвращается ошибка (`first JSON is not an object` / `second JSON is not an object`). «Поведение для массивов» из таблицы выше применимо к **массивам внутри полей объекта** — когда одноимённые поля с обеих сторон являются массивами, выполняется удаление дубликатов/пересечение/разность по элементам (в режиме разности ключ сохраняется, даже если результат — пустой массив). Если типы одноимённых полей с двух сторон различаются (например, с одной стороны массив, с другой скаляр): union/intersection берут значение override, difference просто отбрасывает этот ключ.
:::

### MergeMany

Сигнатура: `func MergeMany(jsons []string, cfg ...Config) (string, error)`

Сливает несколько JSON-объектов. Требуется не менее 2 JSON-строк. Поддерживается режим слияния через `Config.MergeMode`.

**Параметры**

| Имя | Тип | Обязателен | Описание |
|------|------|------|------|
| `jsons` | `[]string` | да | Срез JSON-строк для слияния (не менее 2) |
| `cfg` | `...Config` | нет | Необязательная конфигурация (режим слияния задаётся через `MergeMode`) |

```go
config1 := `{"api": "v1", "timeout": 30, "retries": 1}`
config2 := `{"timeout": 60, "retries": 3}`
config3 := `{"retries": 5, "debug": true}`

// Слияние-объединение по умолчанию
result, err := json.MergeMany([]string{config1, config2, config3})
// Результат: {"api":"v1","timeout":60,"retries":5,"debug":true}
```

**Порядок слияния и ошибки**: свёртка слева направо — `MergeMany([a, b, c])` эквивалентно `MergeJSON(MergeJSON(a, b), c)`; при конфликте побеждает значение правее (с большим индексом). Меньше 2 входных значений — немедленная ошибка; при сбое любого шага возвращается ошибка, оборачивающая индекс сбойного элемента (`merge failed at index i: ...`), частичный результат не возвращается.

## Методы Processor

Processor предоставляет соответствующие методы изменения и слияния с теми же сигнатурами, что и функции уровня пакета:

```go
p, err := json.New()

result, err := p.Set(jsonStr, "user.name", "Alice")
result, err = p.Delete(jsonStr, "user.temp")
result, err = p.SetCreate(jsonStr, "user.email", "test@example.com")
```

**Вариант с предразбором SetFromParsed**: в сочетании с `PreParse` позволяет последовательно изменять одни и те же разобранные данные, пропуская повторный разбор:

```go
parsed, err := p.PreParse(jsonStr) // Один разбор
if err != nil {
	panic(err)
}
defer parsed.Release()

// Первое изменение: возвращает новый ParsedJSON, по цепочке можно продолжать
parsed2, err := p.SetFromParsed(parsed, "user.name", "Alice")
if err != nil {
	panic(err)
}
parsed3, err := p.SetFromParsed(parsed2, "user.age", 30)
if err != nil {
	panic(err)
}

// Получение финального JSON-текста
final := parsed3.Data() // any (map[string]any / []any)
```

::: tip
`SetFromParsed` возвращает **новый** `*ParsedJSON` (промежуточные результаты не влияют друг на друга) — подходит для сценария «несколько последовательных изменений одного большого JSON». Образует пару с `GetFromParsed`, см. [Методы парсинга Processor](../processor/parse#setfromparsed).
:::

У `MergeJSON` и `MergeMany` тоже есть соответствующие методы Processor с сигнатурами, как у функций уровня пакета, — удобно переиспользовать уже настроенный Processor:

```go
result, err := p.MergeJSON(base, override)

merged, err := p.MergeMany([]string{config1, config2, config3})

// У CompareJSON тоже есть метод Processor (обратите внимание: Processor.CompareJSON
// всегда выполняет проверку безопасности — в отличие от пути без cfg у функции уровня пакета)
equal, err := p.CompareJSON(a, b)
```

Подробнее см. [Изменение данных Processor](../processor/modify#методы-слияния-processor).

## См. также

- [Функции запросов и получения](./query) - операции запросов Get, GetString и др.
- [Функции пакетных операций](./batch) - пакетная обработка ProcessBatch
- [Функции кодирования и вывода](./output) - операции сериализации Marshal, Unmarshal и др.
- [Вспомогательные функции](../helpers) - утилиты CompareJSON и др.
