---
title: "Функции удаления - CyberGo JSON | API справочник"
description: "Функции удаления CyberGo JSON: Delete удаляет узлы, DeleteClean с очисткой пустых родительских узлов, поддержка выражений пути и автоочистки."
sidebar_label: "Операции удаления"
sidebar_position: 4
---

# Функции удаления

Функции удаления JSON из пакета json служат для удаления узлов по указанному пути с возможной очисткой пустых родительских узлов, образовавшихся после удаления. Все функции удаления **неизменяемы** — они возвращают новую изменённую JSON-строку, а исходная остаётся нетронутой; при ошибке возвращается исходный ввод.

## Delete

Сигнатура: `func Delete(jsonStr, path string, cfg ...Config) (string, error)`

Удаляет значение по указанному пути, возвращает изменённую JSON-строку.

**Параметры**

| Имя | Тип | Обязателен | Описание |
|------|------|------|------|
| `jsonStr` | `string` | да | JSON-строка |
| `path` | `string` | да | Выражение пути (точка, индекс, подстановочный знак, срез, несколько полей) |
| `cfg` | `Config` | нет | Необязательная конфигурация (влияет на очистку и проверку) |

**Возвращаемое значение**

| Значение | Описание |
|--------|------|
| `result string` | Изменённая JSON-строка (успех); при ошибке — исходный `jsonStr` |
| `err error` | `nil` при успехе; при неудаче — `*JsonsError`, оборачивающий базовую sentinel-ошибку |

### Удаление свойства объекта

Удаляет одно вложенное свойство, возвращает новый объект без этого ключа.

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"user":{"name":"Alice","temp":"value","age":30}}`

	result, err := json.Delete(data, "user.temp")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// Вывод: {"user":{"age":30,"name":"Alice"}}
}
```

### Удаление элемента массива

Удаляет элемент массива (индексация с 0). Элемент **удаляется**, а не обнуляется — последующие элементы сдвигаются вперёд, индексы пересчитываются, пустоты не остаётся.

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"items":["a","b","c","d"]}`

	// Удаление элемента "b" с индексом 1, "c"/"d" сдвигаются вперёд
	result, err := json.Delete(data, "items[1]")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// Вывод: {"items":["a","c","d"]}
}
```

Поддерживаются отрицательные индексы (отсчёт с конца, `-1` — последний):

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"items":["a","b","c","d"]}`

	// -1 указывает на последний элемент "d"
	result, err := json.Delete(data, "items[-1]")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// Вывод: {"items":["a","b","c"]}
}
```

### Удаление по вложенному пути

Через точечную нотацию можно углубиться во вложенные структуры и удалить узел на любом уровне.

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"config":{"database":{"host":"localhost","port":5432,"password":"secret"}}}`

	result, err := json.Delete(data, "config.database.password")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// Вывод: {"config":{"database":{"host":"localhost","port":5432}}}
}
```

### Неизменяемая семантика

`Delete` возвращает новую строку — **исходный `jsonStr` не изменяется**. Можно безопасно использовать один ввод многократно:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"a":1,"b":2,"c":3}`

	r1, _ := json.Delete(data, "a")
	r2, _ := json.Delete(data, "b")

	fmt.Println(data) // Исходные данные не изменены: {"a":1,"b":2,"c":3}
	fmt.Println(r1)   // Вывод: {"b":2,"c":3}
	fmt.Println(r2)   // Вывод: {"a":1,"c":3}
}
```

## Удаление по расширенным путям

`Delete` использует тот же рекурсивный механизм навигации по путям, что и Get/Set, поддерживая подстановочные знаки, срезы, извлечение нескольких полей и прочие пакетные операции. **Пакетные пути (содержащие `*`, `{}`, `:`) устойчивы к отсутствующим целям — найденные удаляются, отсутствующие пропускаются без ошибок**.

### Удаление по подстановочному знаку

`items[*]` удаляет все элементы массива; `[*].field` удаляет указанное свойство из каждого элемента.

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"users":[{"name":"Alice","temp":"x"},{"name":"Bob","temp":"y"}]}`

	// Удаление свойства temp из каждого объекта пользователя
	result, err := json.Delete(data, "users[*].temp")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// Вывод: {"users":[{"name":"Alice"},{"name":"Bob"}]}
}
```

Если у некоторых элементов нет целевого свойства, ошибки не возникает (идемпотентная семантика, как у встроенной `delete()` в Go для отсутствующего ключа):

<!-- check-code: skip -->
```go
// data = `[{"a":1},{"b":2}]` — у второго элемента нет a, но результат корректен
result, err := json.Delete(data, "[*].a")
// err == nil, result: [{"b":2}]
```

### Удаление по срезу

`items[0:2]` удаляет непрерывный диапазон элементов (левая граница включается, правая исключается).

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"items":["a","b","c","d","e"]}`

	// Удаление элементов "a" и "b" с индексами 0 и 1 (без 2)
	result, err := json.Delete(data, "items[0:2]")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// Вывод: {"items":["c","d","e"]}
}
```

### Удаление с извлечением нескольких полей

`[*].{a,b}` удаляет сразу несколько указанных свойств из каждого элемента.

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `[{"name":"Alice","pwd":"x","token":"y"},{"name":"Bob","pwd":"z"}]`

	// Одновременное удаление полей pwd и token
	result, err := json.Delete(data, "[*].{pwd,token}")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// Вывод: [{"name":"Alice"},{"name":"Bob"}]
}
```

::: tip Точный путь vs пакетный путь
- **Точный путь** (только имена свойств/индексы, например `user.temp`, `items[1]`): при отсутствии цели возвращается ошибка `ErrPathNotFound`.
- **Пакетный путь** (содержит `*`, `{}`, `:`, например `items[*]`, `[*].{a,b}`, `items[0:2]`): при отсутствии цели пропускается без ошибки. Для строгой проверки используйте точный путь; для «удаления по возможности» — пакетный.
:::

## Обработка ошибок

Если цель точного пути не существует, `Delete` возвращает `*JsonsError`, оборачивающий `ErrPathNotFound`, причём возвращаемый результат остаётся исходным. Используйте `errors.Is` для определения конкретной ошибки:

```go
package main

import (
	"errors"
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"a":1}`

	result, err := json.Delete(data, "nonexistent.path")
	if err != nil {
		if errors.Is(err, json.ErrPathNotFound) {
			fmt.Println("Путь не найден, пропущено")
		} else {
			fmt.Println("Другая ошибка:", err)
		}
	}
	// result остаётся исходным JSON: {"a":1}
	fmt.Println(result)
	// Вывод:
	// Путь не найден, пропущено
	// {"a":1}
}
```

Распространённые sentinel-ошибки удаления:

| Ошибка | Сценарий возникновения |
|------|----------|
| `ErrPathNotFound` | Некоторый промежуточный сегмент или целевой ключ/индекс точного пути не существует |
| `ErrInvalidJSON` | `jsonStr` не является корректным JSON |
| `ErrInvalidPath` | Неверный синтаксис выражения пути (например, незакрытая квадратная скобка) |

## DeleteClean

Сигнатура: `func DeleteClean(jsonStr, path string, cfg ...Config) (string, error)`

Удаляет указанный путь и **рекурсивно очищает** значения `null`, а также пустые объекты/массивы, образовавшиеся после удаления. Эквивалентно `Delete(jsonStr, path, cfg)` с принудительным включением `CleanupNulls: true` + `CompactArrays: true`.

### Пример каскадной очистки

Если после удаления родительский объект становится пустым, `DeleteClean` удаляет и его, поднимаясь по уровням вверх:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	// temp — единственное свойство user
	data := `{"user":{"temp":"value"}}`

	// Обычное удаление: user становится пустым объектом {}, но сохраняется
	r1, _ := json.Delete(data, "user.temp")
	fmt.Println(r1) // Вывод: {"user":{}}

	// DeleteClean: после того как user опустел, ключ user удаляется
	r2, err := json.DeleteClean(data, "user.temp")
	if err != nil {
		panic(err)
	}
	fmt.Println(r2) // Вывод: {}
}
```

### Очистка временных полей в API-ответе

`DeleteClean` удобен для очистки API-ответов: удаляет целевое поле и заодно выметает другие значения `null` и остаточные пустые контейнеры, не показывая фронту «пустые оболочки».

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	apiResp := `{"data":{"id":1,"name":"Product","desc":null,"price":29.99,"note":null}}`

	// Один DeleteClean удаляет desc и выметает другие null (note) по всему дереву
	cleaned, err := json.DeleteClean(apiResp, "data.desc")
	if err != nil {
		panic(err)
	}
	fmt.Println(cleaned)
	// Вывод: {"data":{"id":1,"name":"Product","price":29.99}}
}
```

::: warning DeleteClean выметает null по всему дереву
Очистка в `DeleteClean` **глобальна**: она рекурсивно выполняет `CleanupNullValues` для всего JSON-дерева, поэтому удаляются **все** предварительно существовавшие значения `null` и пустые контейнеры, а не только те, что возникли в точке удаления. Если нужно удалить только указанное поле, сохранив остальные `null`, используйте обычный `Delete`.
:::

## Связь DeleteClean с Config

`DeleteClean` по существу — это `Delete` плюс синтаксический сахар для двух настроек. Можно явно передать те же настройки в обычный `Delete` с полностью идентичным результатом:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"user":{"temp":"value"}}`

	// Способ 1: DeleteClean
	r1, _ := json.DeleteClean(data, "user.temp")

	// Способ 2: Delete + явная конфигурация (полностью эквивалентно)
	cfg := json.DefaultConfig()
	cfg.CleanupNulls = true
	cfg.CompactArrays = true
	r2, _ := json.Delete(data, "user.temp", cfg)

	fmt.Println(r1) // Вывод: {}
	fmt.Println(r2) // Вывод: {}
}
```

Поля `Config`, влияющие на удаление:

| Поле | По умолчанию | Влияние на удаление |
|------|------|--------------|
| `CleanupNulls` | `false` | Рекурсивно удаляет значения `null` и пустые объекты/массивы из результата (каскадная очистка) |
| `CompactArrays` | `false` | Удаляет `null`/пустые элементы из массивов; при включении подразумевает `CleanupNulls` |
| `CreatePaths` | `true` | **Не влияет на удаление** (удаление никогда не создаёт пути, указано лишь для сравнения) |

## Сравнение Delete и DeleteClean

| Свойство | Delete | DeleteClean |
|------|--------|-------------|
| Удаление целевого узла | да | да |
| Перестановка элементов массива после удаления (без пустот) | да | да |
| Ошибка при отсутствии точного пути | да (`ErrPathNotFound`) | да (`ErrPathNotFound`) |
| Очистка `null`, возникших при удалении | нет | да |
| Очистка пустых объектов/массивов (каскад) | нет | да (по уровням вверх) |
| Удаление предварительно существовавших `null` по всему дереву | нет | да (глобальная очистка) |
| Эквивалентная конфигурация | по умолчанию | `CleanupNulls+CompactArrays` |
| Относительные затраты | ниже | несколько выше (дополнительный обход дерева для очистки) |

## Распространённые подводные камни

::: warning Удаление элемента массива не оставляет пустот
При удалении элемента массива `Delete` **полностью удаляет** его, сдвигая последующие элементы вперёд, не оставляя плейсхолдеров `null` или пустот. Если ожидается, что после удаления индексы сохранятся (остаются пустые позиции), семантика удаления CyberGo этого не поддерживает — вместо этого используйте `Set`, чтобы задать значение `null` в данной позиции.
:::

::: warning DeleteClean может случайно удалить «случайно пустые» корректные данные
Каскадная очистка `DeleteClean` рассматривает все пустые объекты `{}` и пустые массивы `[]` как подлежащие удалению. Если в вашей бизнес-семантике «пустой массив» или «пустой объект» — значимое состояние (например, `"tags":[]` означает «нет тегов», а не «поле отсутствует»), `DeleteClean` удалит их вместе с ключом. Для сохранения таких полей используйте обычный `Delete`.
:::

::: warning Пакетное удаление устойчиво к отсутствию
Пути с подстановочными знаками/срезами/несколькими полями **пропускают** отсутствующие цели без ошибок. Если требуется строгая семантика «цель обязана существовать», используйте точные пути (например, `items[1]` вместо `items[*]`).
:::

## Пакетное удаление нескольких полей

Для удаления нескольких несвязанных полей за один раз достаточно вызывать обычный `Delete` в цикле (каждый раз на основе предыдущего результата):

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"user":{"id":1,"name":"Alice","password":"secret","ssn":"123-45-6789"}}`

	sensitive := []string{"user.password", "user.ssn"}
	result := data
	for _, field := range sensitive {
		var err error
		result, err = json.Delete(result, field)
		if err != nil {
			fmt.Printf("Ошибка удаления %s: %v\n", field, err)
		}
	}
	fmt.Println(result)
	// Вывод: {"user":{"id":1,"name":"Alice"}}
}
```

## См. также

- [Операции изменения](./modify) - функции изменения: Set, merge и др.
- [Функции запроса](./query) - операции запроса: Get, GetString и др.
- [Методы удаления Processor](../processor/delete) - версия методов экземпляра с поддержкой цепочечных вызовов
- [Справочник по конфигурации](../config) - подробности о полях CleanupNulls / CompactArrays и др.
