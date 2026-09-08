---
sidebar_label: "Разбор API-ответов"
title: "Разбор API-ответов - CyberGo JSON | Пагинация и структуры"
description: "Разбор API-ответов в CyberGo JSON: ParseAny, GetString/GetInt, пагинация, Get/GetArray вложенных данных, GetTyped в структуры и ForeachWithPath."
sidebar_position: 4
---

# Разбор API-ответов

В этом руководстве показано, как разбирать типичные JSON-ответы HTTP API с помощью CyberGo JSON: извлечение статуса и метаданных пагинации, обработка массивов срезами пути и десериализация в структуры.

## Разбор постраничного API-ответа

Имитируется постраничный REST API-ответ: извлекаются статус и метаданные пагинации, срез `items[0:2]` получает подмножество, затем извлекаются поля каждого элемента.

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

	// 4. Перебираем массив, извлекая поля каждого элемента (рекомендуется ForeachWithPath: один разбор, доступ к каждому элементу)
	err = json.ForeachWithPath(apiResponse, "data.items", func(key any, item *json.IterableValue) {
		fmt.Printf("  - %s (%d stars)\n", item.GetString("name"), item.GetInt("stars"))
	})
	if err != nil {
		panic(err)
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

::: tip Подсказка
Синтаксис среза пути `[start:end]` возвращает подмножество массива; также можно использовать `[start:end:step]` для среза с шагом, `[-1]` для последнего элемента и `[*]` как подстановочный знак по всем элементам. Полный синтаксис см. в [Синтаксисе выражений пути](../getting-started/path-syntax).

При переборе массива **предпочитайте `ForeachWithPath`** циклу с построением путей (`fmt.Sprintf("data.items.%d.name", i)` с отдельным запросом на каждый элемент): первый разбирает JSON один раз, а внутри каждого элемента значения получаются напрямую по имени поля, к тому же код выходит короче; во втором каждая строка пути — отдельный независимый запрос.
:::

## Однократное получение нескольких полей

Когда в ответе нужно извлечь много полей, `GetMultiple` разбирает JSON один раз и возвращает значения всех путей (результат — map с путями в качестве ключей) — это экономичнее, чем вызывать `Get` по отдельности:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	apiResponse := `{
        "status": "success",
        "data": {
            "page": 2,
            "per_page": 5,
            "total": 48,
            "items": [
                {"id": 6, "name": "Проект 6", "stars": 120},
                {"id": 7, "name": "Проект 7", "stars": 89}
            ]
        }
    }`

	values, err := json.GetMultiple(apiResponse, []string{
		"status",
		"data.page",
		"data.per_page",
		"data.total",
		"data.items.0.name",
	})
	if err != nil {
		panic(err)
	}

	fmt.Printf("%s | страница %v/%v, всего %v, первый элемент: %v\n",
		values["status"], values["data.page"], values["data.per_page"],
		values["data.total"], values["data.items.0.name"])
}

// Вывод: success | страница 2/5, всего 48, первый элемент: Проект 6
```

::: tip Примечание
При неудаче любого из путей (не существует или некорректен) `GetMultiple` возвращает **первую** ошибку, а соответствующий путь в результирующем map содержит `nil`. Поэтому он подходит для извлечения из ответов, где поля «обязательно присутствуют»; для необязательных полей используйте `GetString(apiResponse, "path", "значение_по_умолчанию")` со значением по умолчанию или описанный ниже `SafeGet`.
:::

## SafeGet: безопасный доступ

`SafeGet` не возвращает error, а возвращает `AccessResult`: `Ok()` проверяет существование пути, методы `AsInt`/`AsString` и др. выполняют преобразование по мере необходимости, `UnwrapOr` предоставляет значение по умолчанию — подходит для сторонних ответов с нестабильными типами полей или необязательными полями и никогда не паникует:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	apiResponse := `{
        "status": 200,
        "message": "ok",
        "retry_after": "30",
        "trace_id": "abc-123"
    }`

	// status — число (числа JSON разбираются как float64), поле Type сообщает тип времени выполнения
	status := json.SafeGet(apiResponse, "status")
	fmt.Println("Тип status:", status.Type)
	if code, err := status.AsInt(); err == nil {
		fmt.Println("Код статуса:", code)
	}

	// retry_after — секунды в виде строки
	retry := json.SafeGet(apiResponse, "retry_after")
	if secs, err := retry.AsString(); err == nil {
		fmt.Println("Ожидание перед повтором (сек):", secs)
	}

	// Несуществующий путь: Ok() == false, UnwrapOr даёт значение по умолчанию
	deprecated := json.SafeGet(apiResponse, "deprecated_field")
	fmt.Println("Устаревшее поле существует:", deprecated.Ok())
	fmt.Println("Значение по умолчанию для устаревшего поля:", deprecated.UnwrapOr("none"))
}

// Вывод:
// Тип status: float64
// Код статуса: 200
// Ожидание перед повтором (сек): 30
// Устаревшее поле существует: false
// Значение по умолчанию для устаревшего поля: none
```

При неудаче строгого преобразования методы `As*` возвращают ошибку, а не молча нулевое значение — это не даёт смешивать «поле отсутствует» и «значение равно 0»; если нужно мягкое преобразование (например, строковое представление значения произвольного типа), используйте `AsStringConverted`.

## Десериализация в структуры

Используйте `GetTyped[T]` для десериализации всего ответа или любого вложенного подобъекта в строго типизированную структуру; используйте `ParseAny` для получения значения `any` (удобно, когда структура ответа неизвестна).

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

- [Базовые примеры](./index) — запросы по пути, основы кодирования и декодирования структур
- [Продвинутые примеры](./examples-advanced) — SafeGet, пакетные операции и др.
- [Шпаргалка](../getting-started/cheatsheet) — быстрый справочник по API
- [Синтаксис выражений пути](../getting-started/path-syntax) — срезы, подстановочные знаки, извлечение полей
