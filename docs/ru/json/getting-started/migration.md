---
title: "Миграция с encoding/json - CyberGo JSON | совместимость"
description: "CyberGo JSON на 100% совместим с encoding/json: замените путь импорта без изменения кода. Таблица соответствия API, различия в поведении и возможности."
sidebar_label: "Миграция со стандартной библиотеки"
sidebar_position: 1.5
---

# Миграция со стандартной библиотеки

`cybergodev/json` **на 100% совместим** со стандартной библиотекой `encoding/json` — достаточно заменить путь импорта, и ваш существующий код компилируется и выполняется без каких-либо изменений. Эта страница проведёт вас через процесс миграции и расскажет о дополнительных возможностях, которые вы получите.

## Миграция в три шага

1. **Установка**:

   ```bash
   go get github.com/cybergodev/json
   ```

2. **Замена импорта**: замените `"encoding/json"` на `"github.com/cybergodev/json"`.

   ```go
   // До миграции
   import "encoding/json"

   // После миграции
   import "github.com/cybergodev/json"
   ```

3. **Готово**: код компилируется, и весь существующий код работает без изменений.

## Полностью совместимый API

В таблице ниже приведено соответствие между `encoding/json` и `cybergodev/json`:

| encoding/json | cybergodev/json | Описание |
|---|---|---|
| `Marshal(v)` | `Marshal(v, cfg...)` | Совместимая сигнатура, дополнительный необязательный параметр cfg |
| `Unmarshal(data, &v)` | `Unmarshal(data, &v, cfg...)` | То же самое |
| `MarshalIndent(v, prefix, indent)` | То же имя | Полная совместимость |
| `Compact(dst, src)` | То же имя | Полная совместимость |
| `Indent(dst, src, prefix, indent)` | То же имя | Полная совместимость |
| `HTMLEscape(dst, src)` | То же имя | Полная совместимость |
| `Valid(data)` | `Valid(data, cfg...)` | Совместимая сигнатура |
| `NewEncoder(w)` | `NewEncoder(w, cfg...)` | Совместимая сигнатура |
| `NewDecoder(r)` | `NewDecoder(r, cfg...)` | Совместимая сигнатура |
| `Number` | `Number` | Совместимость типов |
| `Delim` | `Delim` | Совместимость типов |
| `Token` | `Token` | Совместимость типов |

::: tip Необязательный параметр cfg
Все дополнительные параметры `cfg ...Config` **необязательны** (variadic). Если их не передавать, поведение идентично стандартной библиотеке; они передаются только при необходимости включения расширенных возможностей, таких как режим безопасности или кэширование.
:::

## Пример кода: меняем только импорт

Приведённый ниже пример демонстрирует эффект «замены только импорта» — кодирование, декодирование и теги структур (struct tag) работают точно так же, как с `encoding/json`:

```go
package main

import (
    "fmt"

    "github.com/cybergodev/json"
)

func main() {
    type User struct {
        Name string   `json:"name"`
        Age  int      `json:"age"`
        Tags []string `json:"tags"`
    }

    // Кодирование — точно так же, как с encoding/json
    user := User{Name: "Alice", Age: 30, Tags: []string{"go", "json"}}
    b, err := json.Marshal(user)
    if err != nil {
        panic(err)
    }
    fmt.Println(string(b))
    // Вывод: {"name":"Alice","age":30,"tags":["go","json"]}

    // Декодирование — точно так же, как с encoding/json
    var u User
    if err := json.Unmarshal(b, &u); err != nil {
        panic(err)
    }
    fmt.Printf("%+v\n", u)
    // Вывод: {Name:Alice Age:30 Tags:[go json]}
}
```

## Дополнительные возможности

После миграции, сохраняя совместимость со стандартной библиотекой, вы можете по мере необходимости использовать следующие возможности, недоступные в стандартной библиотеке:

| Возможность | Пример | Подробнее |
|---|---|---|
| Запросы по пути | `json.GetString(data, "user.name")` | [Синтаксис выражений пути](./path-syntax) |
| Получение со значением по умолчанию | `json.GetInt(data, "timeout", 30)` | [Функции запросов](../api-reference/functions/query) |
| Обобщённое получение | `json.GetTyped[User](data, "user")` | [Обобщённые функции](../api-reference/generics) |
| Изменение по пути | `json.Set(data, "user.name", "Bob")` | [Операции изменения](../api-reference/functions/modify) |
| Валидация по схеме | `json.ValidateSchema(data, schema)` | [Валидатор](../extensions/validator) |
| Потоковый JSONL | `json.StreamLinesInto[T](r, fn)` | [Обработка JSONL](../streaming/jsonl) |
| Высокопроизводительный процессор | `p, _ := json.New()` | [Руководство по Processor](./processor-guide) |

## Различия в поведении

В **конфигурации по умолчанию** `cybergodev/json` ведёт себя идентично `encoding/json`. Все дополнительные возможности (режим безопасности, запросы по пути, валидация по схеме и т. д.) являются **opt-in** — они включаются явно через параметр `Config` и не влияют на существующий код.

Иными словами: миграция ничего не стоит, а вы получаете надмножество «стандартная библиотека + дополнительные возможности».

## Что дальше

- [Быстрый старт](./) — начните работу с основными возможностями за 5 минут
- [Синтаксис выражений пути](./path-syntax) — изучите синтаксис запросов по пути
- [Шпаргалка](./cheatsheet) — быстрый справочник по API
