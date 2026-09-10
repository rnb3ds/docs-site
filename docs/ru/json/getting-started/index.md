---
sidebar_label: "Быстрый старт"
title: "Быстрый старт - CyberGo JSON | Руководство на 5 минут"
description: "Быстрый старт CyberGo JSON: установка, запросы GetString/GetInt, изменения Set/Delete, Marshal/Unmarshal, итерация и обработка ошибок — Go JSON за 5 минут."
sidebar_position: 1
---

# Быстрый старт

Это руководство поможет быстро освоить библиотеку `github.com/cybergodev/json`.

## Установка

```bash
go get github.com/cybergodev/json
```

## Базовое использование

### Функции уровня пакета

Библиотека предоставляет набор удобных функций уровня пакета, которые можно использовать без создания процессора:

#### Получение значений

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{
        "name": "CyberGo",
        "version": 1,
        "active": true,
        "price": 99.99,
        "tags": ["json", "go", "fast"],
        "meta": {"author": "dev"}
    }`

	// Универсальное получение
	val, err := json.Get(data, "name")
	if err != nil {
		panic(err)
	}
	fmt.Println(val) // CyberGo

	// Типобезопасное получение
	name := json.GetString(data, "name")
	version := json.GetInt(data, "version")
	active := json.GetBool(data, "active")
	price := json.GetFloat(data, "price")
	tags := json.GetArray(data, "tags")
	meta := json.GetObject(data, "meta")

	fmt.Println(name, version, active, price)
	fmt.Println(tags) // [json go fast]
	fmt.Println(meta) // map[author:dev]

	// Получение со значением по умолчанию
	desc := json.GetString(data, "description", "N/A")
	count := json.GetInt(data, "count", 0)
	fmt.Println(desc, count) // N/A 0
}
```

#### Вложенные пути

Поддерживаются вложенные пути, разделённые точками:

```go
data := `{"user": {"profile": {"name": "Alice"}}}`

name := json.GetString(data, "user.profile.name")
fmt.Println(name) // Alice
```

#### Индексы массивов

Поддерживается доступ по индексам массива:

```go
data := `{"items": ["a", "b", "c"]}`

// Поддерживаются оба синтаксиса
item0 := json.GetString(data, "items.0") // "a"
item1 := json.GetString(data, "items.1") // "b"
last := json.GetString(data, "items.-1") // "c"

// Синтаксис с квадратными скобками
first := json.GetString(data, "items[0]")  // "a"
last2 := json.GetString(data, "items[-1]") // "c"

// Получение диапазона (возвращает массив)
arr := json.GetArray(data, "items[0:2]") // ["a", "b"]
```

::: tip Подробнее о синтаксисе путей
Помимо базовых свойств и индексов массивов, поддерживаются расширенные конструкции: **срезы массивов** `[1:5]`, **подстановочные знаки** `[*]`, **извлечение полей** `{name,email}` и др. Подробнее см. [Синтаксис path-выражений](./path-syntax).
:::

#### Установка значений

```go
data := `{"name": "old"}`

// Установка нового значения
updated, err := json.Set(data, "name", "new")
if err != nil {
	panic(err)
}
fmt.Println(updated) // {"name":"new"}

// Добавление нового поля
updated, err = json.Set(data, "version", 1)
if err != nil {
	panic(err)
}
fmt.Println(updated) // {"name":"old","version":1}

// Последовательная установка нескольких полей (каждый вызов возвращает новый JSON, нужно проверять err)
updated, err = json.Set(data, "name", "updated")
updated, err = json.Set(updated, "version", 2)
updated, err = json.Set(updated, "active", true)
if err != nil {
	panic(err)
}
```

#### Удаление значений

```go
data := `{"name": "test", "temp": "remove"}`

// Удаление поля
updated, err := json.Delete(data, "temp")
if err != nil {
	panic(err)
}
fmt.Println(updated) // {"name":"test"}
```

### Кодирование и декодирование

Полная совместимость со стандартной библиотекой:

```go
type User struct {
	Name string `json:"name"`
	Age  int    `json:"age"`
}

// Кодирование
user := User{Name: "Alice", Age: 30}
bytes, err := json.Marshal(user)
if err != nil {
	panic(err)
}
fmt.Println(string(bytes)) // {"name":"Alice","age":30}

// Кодирование с форматированием
pretty, err := json.MarshalIndent(user, "", "  ")
if err != nil {
	panic(err)
}
fmt.Println(string(pretty))
// {
//   "name": "Alice",
//   "age": 30
// }

// Декодирование
var u User
if err := json.Unmarshal(bytes, &u); err != nil {
	panic(err)
}
fmt.Println(u.Name, u.Age) // Alice 30
```

### Валидация

```go
valid := `{"key": "value"}`
invalid := `{key: value}`

fmt.Println(json.Valid([]byte(valid)))   // true
fmt.Println(json.Valid([]byte(invalid))) // false
```

### Форматирование

```go
compact := `{"name":"test","nested":{"key":"value"}}`

// Форматированный вывод
pretty, err := json.Prettify(compact)
if err != nil {
	panic(err)
}
fmt.Println(pretty)
// {
//   "name": "test",
//   "nested": {
//     "key": "value"
//   }
// }

// Сжатый вывод
jsonStr := `{
  "name": "test"
}`
var buf bytes.Buffer
err = json.Compact(&buf, []byte(jsonStr))
if err != nil {
	panic(err)
}
fmt.Println(buf.String()) // {"name":"test"}
```

## Использование Processor

Для частых операций рекомендуется использовать `Processor` — он даёт лучшую производительность и эффект кэширования:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// Создание процессора с конфигурацией по умолчанию
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close() // Не забудьте закрыть для освобождения ресурсов

	data := `{"name": "test", "value": 42}`

	// Операции через процессор
	name := p.GetString(data, "name")
	value := p.GetInt(data, "value")

	fmt.Println(name, value)
}
```

## Параметры конфигурации

```go
// Конфигурация по умолчанию
cfg := json.DefaultConfig()

// Конфигурация с усиленной защитой (для недоверенного ввода)
// cfg = json.SecurityConfig()

// Конфигурация форматированного вывода
// cfg = json.PrettyConfig()

// Пользовательская конфигурация
cfg = json.DefaultConfig()
cfg.MaxJSONSize = 50 * 1024 * 1024 // 50MB
cfg.EnableCache = true
cfg.CacheTTL = 5 * time.Minute

// Создание процессора с пользовательской конфигурацией
p, err := json.New(cfg)
if err != nil {
	panic(err)
}
```

## Итерация и обход

Обход элементов массива с безопасным доступом к их полям — без написания полного пути для каждого элемента:

```go
data := `{"users": [{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]}`

err := json.ForeachWithPath(data, "users", func(key any, item *json.IterableValue) {
	name := item.GetString("name")
	age := item.GetInt("age")
	fmt.Printf("User %v: %s (age %d)\n", key, name, age)
})
if err != nil {
	panic(err)
}
// User 0: Alice (age 30)
// User 1: Bob (age 25)
```

::: tip
Семейство `Foreach` насчитывает 12 функций: для **досрочного завершения** используйте `ForeachWithError` (колбэк возвращает `error`; возврат `item.Break()` прерывает обход); варианты для обхода глубокой вложенности, с передачей текущего пути, для итерации файлов и др. собраны в [Шпаргалке](./cheatsheet#семейство-функций-итерации).
:::

## Обработка ошибок

Типичные ошибки операций с путями — **сигнатурные ошибки** (sentinel errors); для точного различения используйте `errors.Is`:

```go
val, err := json.Get(data, "user.profile.email")
if err != nil {
	switch {
	case errors.Is(err, json.ErrPathNotFound):
		// Ключ не существует — частая бизнес-ситуация, можно подстраховать значением по умолчанию
	case errors.Is(err, json.ErrInvalidJSON):
		// Сам JSON имеет неверный формат
	default:
		// Остальные ошибки (превышение лимитов, конфликты типов и т.п.): JsonsError уже
		// содержит имя операции и путь — достаточно записать в лог, перечислять по видам не нужно
		fmt.Println(err)
	}
}
```

Если не хочется разбирать каждую ошибку отдельно, типизированные функции со значением по умолчанию (`GetString`/`GetInt` и др.) молча возвращают нулевое значение или значение по умолчанию — это подходит для некритичных чтений.

::: tip Где используется ErrTypeMismatch?
Обычный `Get` при конфликте типов (например, индекс массива для пути-строки) возвращает описательную ошибку с контекстом, а **не** сигнатурную ошибку `ErrTypeMismatch`. `ErrTypeMismatch` встречается в трёх местах: методы преобразования `AsString()`/`AsInt()` и др. результата `SafeGet`, навигация по предкомпилированным путям в `GetCompiled`, а также вызовы семейства `Foreach` для неитерируемых значений.
:::

## Частые вопросы первого часа

Типичные проблемы на этапе освоения, собранные в одном месте; детали синтаксиса путей см. в [Синтаксисе path-выражений](./path-syntax).

**В: Что именно возвращается, когда путь не найден?**

Зависит от способа вызова, причём поведение при «ключ не существует» и «индекс вне диапазона» различается:

| Вызов | Ключ объекта не существует | Индекс массива вне диапазона |
|------|--------------|--------------|
| `json.Get` | `(nil, ErrPathNotFound)` | `(nil, nil)`, **без ошибки** |
| `json.GetString` и др. типизированные функции | Нулевое значение или переданное значение по умолчанию | Нулевое значение или переданное значение по умолчанию |
| `json.SafeGet` | `Exists: false` | `Exists: true`, но значение nil |

При выходе индекса массива за границы `Get` не возвращает ошибку (результат nil), поэтому для проверки «существует ли элемент» недостаточно смотреть на err — нужно проверять и возвращаемое значение. Полные правила см. в [Синтаксических ловушках](./path-syntax#синтаксические-ловушки).

**В: Почему полученное число — это float64?**

`Get` возвращает `any`; JSON-числа при стандартном декодировании всегда становятся `float64`:

```go
data := `{"version": 1}`

val, _ := json.Get(data, "version") // val — это float64(1), а не int
i := json.GetInt(data, "version")   // когда нужен int, используйте типизированную функцию
```

Большие целые числа, выходящие за точность `float64` (например, snowflake-идентификаторы), будут округлены — в этом случае используйте `Config.PreserveNumbers` для сохранения исходного текста числа или `Decoder.UseNumber()` для получения `json.Number`.

**В: Почему после вызова `Set` исходный JSON не изменился?**

`Set`/`Delete` выполнены в стиле чистых функций: они возвращают **новую строку** с изменениями, исходная строка остаётся нетронутой. Отбрасывание возвращаемого значения — самая частая ошибка новичков:

```go
data := `{"name": "old"}`

// ✗ Результат отброшен, data не изменился
_, _ = json.Set(data, "name", "new")

// ✓ Принимаем возвращаемое значение
updated, err := json.Set(data, "name", "new")
if err != nil {
	panic(err)
}
```

При последовательном изменении нескольких мест используйте `SetMultiple` — один вызов вместо цепочки `Set`, это яснее.

**В: Что произойдёт при вызове `Set` с индексом вне диапазона?**

В отличие от стороны запросов («нулевое значение, без ошибки») — при конфигурации по умолчанию (`CreatePaths: true`) `Set` заполнит массив значениями `null`, расширяя его до целевого индекса:

```go
updated, err := json.Set(`{"items":[1,2,3]}`, "items[5]", "x")
// {"items":[1,2,3,null,null,"x"]}
```

Если нужно просто дописать в конец, используйте `items[+]`, а не рассчитывайте на выход за границы.

**В: Почему везде нужен `defer p.Close()`?**

Внутри `Processor` есть кэш и фоновая горутина очистки; `Close` дренирует выполняемые операции и освобождает эти ресурсы. Частое создание без закрытия приведёт к постоянному накоплению. Функции уровня пакета используют глобальный процессор с управляемым жизненным циклом — вручную вызывать `Close` не нужно и не следует. Подробнее см. [Введение в Processor](./processor-guide#управление-жизненным-циклом).

## Следующие шаги

- [Синтаксис path-выражений](./path-syntax) — изучите полный синтаксис запросов по путям
- [Введение в Processor](./processor-guide) — когда использовать процессор, оптимизация предразбора
- [Форматированный вывод](./print) — красивое форматирование и сжатие JSON
- [Миграция со стандартной библиотеки](./migration) — замена encoding/json без затрат
- [Шпаргалка](./cheatsheet) — быстрый справочник по API
- [Обработка больших файлов](../streaming/large-files) — работа с большими JSON-файлами
- [Документация API](../api-reference/) — полный справочник API
- [Примеры использования](../examples/) — больше практических примеров
