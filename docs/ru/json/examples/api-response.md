---
sidebar_label: "Разбор API-ответов"
title: "Разбор API-ответов - CyberGo JSON | Пагинация и структуры"
description: "Разбор HTTP API-ответов в CyberGo JSON: ParseAny для произвольных значений, Get/GetArray для вложенных данных, срезы пути и GetTyped десериализация."
sidebar_position: 4
---

# Разбор API-ответов

В этом руководстве показано, как разбирать типичные JSON-ответы HTTP API с помощью CyberGo JSON: извлечение статуса и метаданных пагинации, срезы массивов через выражения пути и десериализация в структуры.

## Разбор постраничного API-ответа

Имитируется постраничный REST API-ответ: извлекаются статус и метаданные пагинации, срез `items[0:2]` получает подмножество, затем перебираются поля каждого элемента.

```go
package main

import (
    "fmt"

    "github.com/cybergodev/json"
)

func main() {
    // Имитация постраничного API-ответа
    apiResponse := `{
        "status": "success",
        "data": {
            "page": 2,
            "per_page": 5,
            "total": 48,
            "items": [
                {"id": 6, "name": "Проект 6", "stars": 120},
                {"id": 7, "name": "Проект 7", "stars": 89},
                {"id": 8, "name": "Проект 8", "stars": 245},
                {"id": 9, "name": "Проект 9", "stars": 56},
                {"id": 10, "name": "Проект 10", "stars": 312}
            ]
        }
    }`

    // 1. Извлекаем статус и метаданные пагинации
    status := json.GetString(apiResponse, "status")
    page := json.GetInt(apiResponse, "data.page")
    total := json.GetInt(apiResponse, "data.total")
    fmt.Printf("Статус: %s, страница %d, всего %d\n", status, page, total)

    // 2. Получаем весь массив данных
    items := json.GetArray(apiResponse, "data.items")
    fmt.Printf("Элементов на странице: %d\n", len(items))

    // 3. Получаем подмножество через срез пути (первые 2 элемента)
    firstTwo, err := json.Get(apiResponse, "data.items[0:2]")
    if err != nil {
        panic(err)
    }
    fmt.Printf("Первые два: %v\n", firstTwo)

    // 4. Перебираем массив, извлекая поля каждого элемента
    for i := 0; i < len(items); i++ {
        name := json.GetString(apiResponse, fmt.Sprintf("data.items.%d.name", i))
        stars := json.GetInt(apiResponse, fmt.Sprintf("data.items.%d.stars", i))
        fmt.Printf("  - %s (%d stars)\n", name, stars)
    }
}
// Вывод:
// Статус: success, страница 2, всего 48
// Элементов на странице: 5
// Первые два: [map[id:6 name:Проект 6 stars:120] map[id:7 name:Проект 7 stars:89]]
//   - Проект 6 (120 stars)
//   - Проект 7 (89 stars)
//   - Проект 8 (245 stars)
//   - Проект 9 (56 stars)
//   - Проект 10 (312 stars)
```

:::tip Подсказка
Синтаксис среза пути `[start:end]` возвращает подмножество массива. Также можно использовать `[start:end:step]` для среза с шагом, `[-1]` для последнего элемента и `[*]` как подстановку по всем элементам. Полный синтаксис см. в [Синтаксисе пути](../getting-started/path-syntax).
:::

## Десериализация в структуры

Используйте `GetTyped[T]` для десериализации всего ответа или любого вложенного подобъекта в строго типизированную структуру; используйте `ParseAny` для получения значения `any` (удобно при неизвестной структуре).

```go
package main

import (
    "fmt"

    "github.com/cybergodev/json"
)

// Repository представляет структуру репозитория в API-ответе
type Repository struct {
    ID    int    `json:"id"`
    Name  string `json:"name"`
    Stars int    `json:"stars"`
}

// APIResponse представляет весь API-ответ
type APIResponse struct {
    Status string `json:"status"`
    Data   struct {
        Page  int          `json:"page"`
        Total int          `json:"total"`
        Items []Repository `json:"items"`
    } `json:"data"`
}

func main() {
    apiResponse := `{
        "status": "success",
        "data": {
            "page": 1,
            "total": 3,
            "items": [
                {"id": 1, "name": "cybergo-json", "stars": 500},
                {"id": 2, "name": "cybergo-jwt", "stars": 320},
                {"id": 3, "name": "cybergo-httpc", "stars": 280}
            ]
        }
    }`

    // 1. Десериализуем весь ответ в структуру (путь "." означает корневой объект)
    resp := json.GetTyped[APIResponse](apiResponse, ".")
    fmt.Printf("Статус: %s, репозиториев: %d\n", resp.Status, resp.Data.Total)
    for _, repo := range resp.Data.Items {
        fmt.Printf("  #%d %s (%d stars)\n", repo.ID, repo.Name, repo.Stars)
    }

    // 2. GetTyped для одного вложенного объекта (декодирование подобъекта в структуру)
    firstRepo := json.GetTyped[Repository](apiResponse, "data.items.0")
    fmt.Printf("Первый репозиторий: %+v\n", firstRepo)

    // 3. ParseAny для произвольного значения (когда структура ответа неизвестна)
    parsed, err := json.ParseAny(apiResponse)
    if err != nil {
        panic(err)
    }
    fmt.Printf("Тип результата: %T\n", parsed)
}
// Вывод:
// Статус: success, репозиториев: 3
//   #1 cybergo-json (500 stars)
//   #2 cybergo-jwt (320 stars)
//   #3 cybergo-httpc (280 stars)
// Первый репозиторий: {ID:1 Name:cybergo-json Stars:500}
// Тип результата: map[string]interface {}
```

## Следующие шаги

- [Базовые примеры](./index) — запросы по пути, основы кодирования структур
- [Продвинутые примеры](./examples-advanced) — SafeGet, пакетные операции и др.
- [Шпаргалка](../getting-started/cheatsheet) — быстрый справочник по API
- [Синтаксис пути](../getting-started/path-syntax) — срезы, подстановки, извлечение полей
