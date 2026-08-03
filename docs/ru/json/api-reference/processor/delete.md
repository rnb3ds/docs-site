---
sidebar_label: "Операции удаления"
title: "Методы удаления Processor - CyberGo JSON | API справочник"
description: "Методы удаления CyberGo JSON Processor: Delete удаляет по пути, DeleteClean с автоочисткой null и пустых массивов, поддержка цепочечных вызовов."
sidebar_position: 4
---

# Методы удаления

Processor предоставляет методы удаления данных, удаляющие значения по указанному пути и возвращающие изменённую JSON-строку. Все методы **неизменяемы** — возвращают новую строку, исходный ввод не изменяется; при ошибке возвращается исходный ввод. Поведение совпадает с [функциями удаления уровня пакета](../functions/delete); отличие в том, что методы экземпляра работают с собственной конфигурацией, кэшем и хуками процессора.

## Delete

Сигнатура: `func (p *Processor) Delete(jsonStr, path string, cfg ...Config) (result string, err error)`

Удаляет значение по указанному пути, возвращает изменённую JSON-строку.

<!-- check-code: skip -->
```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

result, err := p.Delete(data, "user.temporary")
```

### Полный пример: свойство объекта, элемент массива и вложенный путь

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

	// Удаление свойства объекта
	r1, err := p.Delete(`{"user":{"name":"Alice","temp":"x"}}`, "user.temp")
	if err != nil {
		panic(err)
	}
	fmt.Println(r1)
	// Вывод: {"user":{"name":"Alice"}}

	// Удаление элемента массива (удаление и пересчёт индексов, без пустот)
	r2, err := p.Delete(`{"items":["a","b","c"]}`, "items[1]")
	if err != nil {
		panic(err)
	}
	fmt.Println(r2)
	// Вывод: {"items":["a","c"]}

	// Удаление по вложенному пути
	r3, err := p.Delete(`{"a":{"b":{"c":1,"d":2}}}`, "a.b.c")
	if err != nil {
		panic(err)
	}
	fmt.Println(r3)
	// Вывод: {"a":{"b":{"d":2}}}
}
```

### Расширенные пути: подстановочные знаки и срезы

`Delete` использует тот же механизм навигации по путям, что и Get/Set, поддерживая подстановочные знаки, срезы, извлечение нескольких полей. Пакетные пути (содержащие `*`, `{}`, `:`) пропускают отсутствующие цели без ошибок.

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

	data := `{"users":[{"name":"Alice","pwd":"x"},{"name":"Bob","pwd":"y"}],"tags":[1,2,3,4]}`

	// Подстановочный знак: удаление pwd у каждого пользователя
	r1, err := p.Delete(data, "users[*].pwd")
	if err != nil {
		panic(err)
	}
	fmt.Println(r1)
	// Вывод: {"tags":[1,2,3,4],"users":[{"name":"Alice"},{"name":"Bob"}]}

	// Срез: удаление tags[0:2] (левая граница включается, правая исключается)
	r2, err := p.Delete(data, "tags[0:2]")
	if err != nil {
		panic(err)
	}
	fmt.Println(r2)
	// Вывод: {"tags":[3,4],"users":[{"name":"Alice","pwd":"x"},{"name":"Bob","pwd":"y"}]}
}
```

### Обработка ошибок

Если цель точного пути не существует, возвращается ошибка, оборачивающая `ErrPathNotFound`, причём исходный ввод не изменяется. Используйте `errors.Is` для проверки:

```go
package main

import (
	"errors"
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, _ := json.New()
	defer p.Close()

	result, err := p.Delete(`{"a":1}`, "nonexistent.path")
	if err != nil {
		if errors.Is(err, json.ErrPathNotFound) {
			fmt.Println("Путь не найден, пропущено")
		}
	}
	fmt.Println(result) // Исходные данные не изменены: {"a":1}
	// Вывод:
	// Путь не найден, пропущено
	// {"a":1}
}
```

## DeleteClean

Сигнатура: `func (p *Processor) DeleteClean(jsonStr, path string, cfg ...Config) (string, error)`

Удаляет указанный путь и **рекурсивно очищает** значения `null`, а также пустые объекты/массивы, образовавшиеся после удаления. Эквивалентно `Delete` с принудительным включением `CleanupNulls: true` + `CompactArrays: true`.

### Каскадная очистка: автоматическое удаление опустевшего родителя

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, _ := json.New()
	defer p.Close()

	// temp — единственное свойство user
	data := `{"user":{"temp":"value"}}`

	// Обычное удаление: user становится {}, но сохраняется
	r1, _ := p.Delete(data, "user.temp")
	fmt.Println(r1) // Вывод: {"user":{}}

	// DeleteClean: после того как user опустел, ключ user удаляется, каскад вверх
	r2, err := p.DeleteClean(data, "user.temp")
	if err != nil {
		panic(err)
	}
	fmt.Println(r2) // Вывод: {}
}
```

### Очистка API-ответа

Удаляет целевое поле и заодно выметает другие `null` и остаточные пустые контейнеры по всему дереву:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, _ := json.New()
	defer p.Close()

	apiResp := `{"data":{"id":1,"name":"Product","desc":null,"price":29.99}}`

	cleaned, err := p.DeleteClean(apiResp, "data.desc")
	if err != nil {
		panic(err)
	}
	fmt.Println(cleaned)
	// Вывод: {"data":{"id":1,"name":"Product","price":29.99}}
}
```

::: warning DeleteClean выметает null по всему дереву
Очистка в `DeleteClean` **глобальна**: она рекурсивно выполняет очистку всего JSON-дерева, поэтому удаляются **все** предварительно существовавшие `null` и пустые контейнеры, а не только те, что возникли в точке удаления. Если нужно удалить только указанное поле, сохранив остальные `null`, используйте обычный `Delete`.
:::

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

## Влияние Config на поведение удаления

Поведение очистки методов удаления определяется «**объединением аргумента вызова `cfg` и собственной конфигурации процессора**». Иными словами, если при создании процессора уже включён `CleanupNulls`, то последующие обычные вызовы `p.Delete(...)` также будут автоматически очищать:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	// Создание процессора с включённой по умолчанию очисткой
	cfg := json.DefaultConfig()
	cfg.CleanupNulls = true
	cfg.CompactArrays = true
	p, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data := `{"user":{"temp":"value"}}`

	// Обычный Delete также очищает, поскольку собственная конфигурация процессора включена
	result, err := p.Delete(data, "user.temp")
	if err != nil {
		panic(err)
	}
	fmt.Println(result) // Вывод: {}
}
```

Поля `Config`, влияющие на удаление:

| Поле | По умолчанию | Влияние на удаление |
|------|------|--------------|
| `CleanupNulls` | `false` | Рекурсивно удаляет `null` и пустые объекты/массивы из результата (каскад) |
| `CompactArrays` | `false` | Удаляет `null`/пустые элементы из массивов; при включении подразумевает `CleanupNulls` |
| `CreatePaths` | `true` | **Не влияет на удаление** (удаление никогда не создаёт пути) |

> Поэтому `DeleteClean(s, p)` даёт тот же результат, что и `Delete(s, p)` на процессоре с `CleanupNulls+CompactArrays` — выбирайте более семантично ясный вариант записи.

## Цепочечное удаление

Методы удаления возвращают новую строку, которую можно напрямую передать в следующий вызов, формируя цепочку модификаций:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, _ := json.New()
	defer p.Close()

	data := `{"user":{"name":"Alice","temp":"x","version":"1.0.0"}}`

	// Цепочка: сначала установка, затем удаление, каждый шаг на основе предыдущего
	r1, _ := p.Set(data, "user.name", "CyberGo")
	r2, _ := p.Delete(r1, "user.temp")
	final, _ := p.Delete(r2, "user.version")

	fmt.Println(final)
	// Вывод: {"user":{"name":"CyberGo"}}
}
```

## Распространённые подводные камни

::: warning Удаление элемента массива не оставляет пустот
При удалении элемента массива `Delete` **полностью удаляет** его, сдвигая последующие элементы вперёд, не оставляя плейсхолдеров `null` или пустот. Если требуется семантика «удалить, но сохранить индексы с пустыми позициями», используйте `Set`, чтобы задать значение `null` в данной позиции.
:::

::: warning DeleteClean может случайно удалить «случайно пустые» корректные данные
Каскадная очистка `DeleteClean` рассматривает все пустые объекты `{}` и пустые массивы `[]` как подлежащие удалению. Если в вашей бизнес-семантике «пустой массив» — значимое состояние (например, `"tags":[]` означает «нет тегов»), `DeleteClean` удалит их вместе с ключом. Для сохранения таких полей используйте обычный `Delete`.
:::

::: warning Пакетное удаление устойчиво к отсутствию
Пути с подстановочными знаками/срезами/несколькими полями **пропускают** отсутствующие цели без ошибок. Если требуется строгая семантика «цель обязана существовать», используйте точные пути (например, `items[1]` вместо `items[*]`).
:::

## См. также

- [Операции изменения](./modify) - цепочечные модификации Set/SetCreate
- [Функции удаления](../functions/delete) - функции удаления уровня пакета (с полным справочником по синтаксису путей)
- [Справочник по конфигурации](../config) - подробности о полях CleanupNulls / CompactArrays и др.
