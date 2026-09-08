---
sidebar_label: "Продвинутые примеры"
title: "Продвинутые примеры - CyberGo JSON | Расширенные приёмы"
description: "Продвинутые примеры CyberGo JSON: EncodeBatch, фильтрация полей EncodeFields, PreParse, SafeGet, WarmupCache и хуки — производительная обработка JSON."
sidebar_position: 2
---

# Примеры расширенных функций

В этом документе представлены полные примеры расширенных функций: массовое кодирование, предварительный разбор, перехватчики, расширенная конфигурация и другие.

## Массовое кодирование

### EncodeBatch

Быстрое кодирование нескольких пар ключ-значение в JSON объект:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// Создание JSON из разрозненных данных
	pairs := map[string]any{
		"id":      1001,
		"name":    "Alice",
		"email":   "alice@example.com",
		"active":  true,
		"tags":    []string{"admin", "user"},
		"balance": 1250.50,
	}

	// Массовое кодирование в JSON объект с помощью EncodeBatch
	result, err := json.EncodeBatch(pairs)
	if err != nil {
		panic(err)
	}
	fmt.Println(result)

	// Форматированный вывод с PrettyConfig
	pretty, err := json.EncodeBatch(pairs, json.PrettyConfig())
	if err != nil {
		panic(err)
	}
	fmt.Println(pretty)
}
```

## Выборочная кодировка полей

### EncodeFields

Кодировка только указанных полей структуры, подходит для фильтрации конфиденциальной информации в ответах API:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

type User struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Salt     string `json:"salt"`
}

func main() {
	user := User{
		ID:       1,
		Name:     "Alice",
		Email:    "alice@example.com",
		Password: "secret123",
		Salt:     "randomsalt",
	}

	// Кодировка только открытых полей (исключая конфиденциальную информацию)
	publicFields := []string{"id", "name", "email"}
	result, err := json.EncodeFields(user, publicFields)
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// {"id":1,"name":"Alice","email":"alice@example.com"}
}
```

## Оптимизация предварительного разбора

### PreParse

Предварительный разбор JSON для избежания повторного парсинга и повышения производительности многократных запросов:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// Большие JSON данные
	largeJSON := `{
        "users": [
            {"id": 1, "name": "Alice", "email": "alice@example.com"},
            {"id": 2, "name": "Bob", "email": "bob@example.com"},
            {"id": 3, "name": "Charlie", "email": "charlie@example.com"}
        ],
        "metadata": {
            "total": 3,
            "page": 1,
            "perPage": 10
        }
    }`

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// Предварительный разбор (только один раз); Release освобождает ссылку на дерево разбора после использования
	parsed, err := p.PreParse(largeJSON)
	if err != nil {
		panic(err)
	}
	defer parsed.Release()

	// Многократные запросы с повторным использованием результата предварительного разбора
	total, _ := p.GetFromParsed(parsed, "metadata.total")
	page, _ := p.GetFromParsed(parsed, "metadata.page")

	// Обход пользователей
	for i := 0; i < 3; i++ {
		path := fmt.Sprintf("users.%d.name", i)
		name, _ := p.GetFromParsed(parsed, path)
		fmt.Printf("User %d: %v\n", i, name)
	}

	fmt.Printf("Total: %v, Page: %v\n", total, page)
}
```

## Предкомпиляция часто используемых путей

### CompilePath + GetCompiled

`PreParse` оптимизирует случай «несколько путей по одному и тому же JSON»; наоборот, когда **один и тот же путь** запрашивается по множеству разных JSON (например, каждый запрос извлекает `user.name`), используйте `CompilePath`, чтобы предкомпилировать и переиспользовать результат разбора пути и не платить за разбор пути при каждом вызове:

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

	// Имитация непрерывно поступающих разных JSON-документов
	docs := []string{
		`{"user":{"name":"Alice","age":28}}`,
		`{"user":{"name":"Bob","age":34}}`,
		`{"user":{"name":"Carol","age":25}}`,
	}

	// Предкомпиляция один раз; результат разбора пути попадает в глобальный кэш компиляции, Release возвращает его после использования
	cp, err := p.CompilePath("user.name")
	if err != nil {
		panic(err)
	}
	defer cp.Release()

	for _, doc := range docs {
		name, err := p.GetCompiled(doc, cp)
		if err != nil {
			panic(err)
		}
		fmt.Println("name =", name)
	}
}

// Вывод:
// name = Alice
// name = Bob
// name = Carol
```

::: tip Разделение труда с PreParse
`GetCompiled` при каждом вызове всё равно выполняет проверку безопасности входных данных и разбор JSON — **экономится только разбор пути**. Выбирайте по направлению узкого места: повторные запросы к одному документу → `PreParse`; повторное использование одного пути → `CompilePath`. Сейчас у `Set`/`Delete` нет Compiled-вариантов, предкомпилированные пути используются только для запросов.
:::

## Безопасное получение

### SafeGet

Возвращает структурированный результат с поддержкой цепочки вызовов и преобразования типов:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{
        "user": {
            "id": 1001,
            "name": "Alice",
            "age": 28,
            "active": true,
            "balance": 1250.50
        }
    }`

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// Безопасное получение одного поля
	nameResult := p.SafeGet(data, "user.name")
	if nameResult.Ok() {
		name, _ := nameResult.AsString()
		fmt.Println("Name:", name)
	}

	// Безопасное получение с преобразованием типа
	ageResult := p.SafeGet(data, "user.age")
	if ageResult.Ok() {
		age, _ := ageResult.AsInt()
		fmt.Println("Age:", age)
	}

	// Безопасное получение логического значения
	activeResult := p.SafeGet(data, "user.active")
	if activeResult.Ok() {
		active, _ := activeResult.AsBool()
		fmt.Println("Active:", active)
	}

	// Несуществующий путь не вызывает panic
	emailResult := p.SafeGet(data, "user.email")
	fmt.Println("Email exists:", emailResult.Ok()) // false

	// Использование значения по умолчанию
	email := emailResult.UnwrapOr("N/A")
	fmt.Println("Email:", email)
}
```

## Прогрев кэша

### WarmupCache

Прогрев кэша часто используемых путей для повышения производительности последующих запросов:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// Большие JSON данные (имитация)
	largeJSON := `{
        "products": [
            {"id": 1, "name": "Product A", "price": 100},
            {"id": 2, "name": "Product B", "price": 200},
            {"id": 3, "name": "Product C", "price": 300}
        ],
        "categories": ["electronics", "books", "clothing"],
        "settings": {"currency": "USD", "taxRate": 0.1}
    }`

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// Определение часто используемых путей
	commonPaths := []string{
		"products",
		"products.0.id",
		"products.0.name",
		"products.1.id",
		"products.1.name",
		"categories",
		"settings.currency",
	}

	// Прогрев кэша
	result, err := p.WarmupCache(largeJSON, commonPaths)
	if err != nil {
		panic(err)
	}

	fmt.Printf("Прогрев завершён: %d/%d успешно\n", result.Successful, result.TotalPaths)
	if len(result.FailedPaths) > 0 {
		fmt.Println("Неудавшиеся пути:", result.FailedPaths)
	}

	// Последующие запросы будут использовать кэш
	for i := 0; i < 3; i++ {
		path := fmt.Sprintf("products.%d.name", i)
		name := p.GetString(largeJSON, path)
		fmt.Printf("Product %d: %s\n", i, name)
	}
}
```

## Пакетные операции

### ProcessBatch

Пакетное выполнение нескольких операций для повышения эффективности:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"users": [{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}]}`

	// Определение пакетных операций (ID идентифицирует каждую операцию в результатах)
	operations := []json.BatchOperation{
		{ID: "get-name", Type: "get", Path: "users.0.name", JSONStr: data},
		{ID: "get-users", Type: "get", Path: "users", JSONStr: data},
		{ID: "set-name", Type: "set", Path: "users.0.name", Value: "Updated", JSONStr: data},
		{ID: "del-id", Type: "delete", Path: "users.0.id", JSONStr: data},
	}

	// Выполнение пакетных операций
	results, err := json.ProcessBatch(operations)
	if err != nil {
		panic(err)
	}

	// Просмотр результатов
	for _, r := range results {
		fmt.Printf("ID: %s\n", r.ID)
		if r.Error != nil {
			fmt.Printf("  Ошибка: %v\n", r.Error)
		} else if r.Result != nil {
			fmt.Printf("  Значение: %v\n", r.Result)
		}
	}
}
```

## Оптимизация памяти ключей и значений

Библиотека внутренне использует пул строковой памяти (string interning) для автоматической оптимизации памяти повторяющихся ключей и значений. Ручное управление не требуется.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// Библиотека автоматически использует пул памяти для повторяющихся ключей
	// При обработке больших данных повторяющиеся строковые ключи автоматически используют общую память
	records := make([]map[string]any, 10000)
	for i := range records {
		records[i] = map[string]any{
			"status": "active",
			"type":   "user",
			"role":   "member",
		}
	}

	// При массовом кодировании библиотека автоматически оптимизирует память
	result, _ := json.Marshal(map[string]any{
		"status": "active",
		"type":   "user",
	})

	fmt.Println("Sample:", string(result))
}
```

## Следующие шаги

- [Синтаксис выражений пути](../getting-started/path-syntax) — полный справочник синтаксиса путей
- [Обработка больших файлов](../streaming/large-files) — руководство по потоковой обработке
- [API документация](../api-reference/) — полный справочник API
