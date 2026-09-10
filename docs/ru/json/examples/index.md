---
sidebar_label: "Базовые примеры"
title: "Примеры - CyberGo JSON | Практика"
description: "Примеры CyberGo JSON: запросы и изменения по путям, Marshal/Unmarshal структур, Processor, итерация и параллелизм, JSONL-потоки, Hook и Schema с Go-кодом."
sidebar_position: 1
---

# Примеры использования

Этот документ предоставляет практические примеры кода для библиотеки `github.com/cybergodev/json`.

## Базовые операции

### Запросы по пути

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
            "email": "alice@example.com",
            "active": true,
            "profile": {
                "age": 28,
                "city": "Beijing"
            }
        },
        "tags": ["go", "json", "dev"],
        "scores": [95, 88, 92]
    }`

	// Простой путь
	name := json.GetString(data, "user.name")
	fmt.Println("Имя:", name)

	// Вложенный путь
	city := json.GetString(data, "user.profile.city")
	age := json.GetInt(data, "user.profile.age")
	fmt.Printf("Город: %s, Возраст: %d\n", city, age)

	// Индекс массива
	firstTag := json.GetString(data, "tags.0")
	firstScore := json.GetInt(data, "scores.0")
	fmt.Printf("Первый тег: %s, Первый балл: %d\n", firstTag, firstScore)

	// Получение массива
	tags := json.GetArray(data, "tags")
	fmt.Println("Теги:", tags)

	// Получение объекта
	profile := json.GetObject(data, "user.profile")
	fmt.Println("Профиль:", profile)

	// Получение со значением по умолчанию
	country := json.GetString(data, "user.profile.country", "Не указан")
	phone := json.GetString(data, "user.phone", "Н/Д")
	fmt.Printf("Страна: %s, Телефон: %s\n", country, phone)
}
```

### Массовое получение нескольких полей

Один вызов `GetMultiple` разбирает JSON один раз и возвращает значения нескольких путей; отдельные вызовы `Get` каждый раз заново выполняют поиск по ключу кэша:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{
        "order": {"id": 5001, "status": "shipped"},
        "customer": {"name": "Alice"},
        "total": 129.9
    }`

	values, err := json.GetMultiple(data, []string{
		"order.id", "order.status", "customer.name", "total",
	})
	if err != nil {
		panic(err)
	}

	fmt.Println("Номер заказа:", values["order.id"])
	fmt.Println("Статус:", values["order.status"])
	fmt.Println("Клиент:", values["customer.name"])
	fmt.Println("Итого:", values["total"])
}

// Вывод:
// Номер заказа: 5001
// Статус: shipped
// Клиент: Alice
// Итого: 129.9
```

::: tip Примечание
`GetMultiple` возвращает ошибку **первого** неудавшегося пути (в результирующем map такой путь содержит `nil`), поэтому в примере все пути обязаны существовать; для проверки необязательных полей используйте `GetString`/`GetInt` со значением по умолчанию или [`SafeGet`](./examples-advanced).
:::

### Изменение JSON

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"name": "old", "version": 1}`

	// Изменение одного значения
	updated, _ := json.Set(data, "name", "new")
	fmt.Println("После установки:", updated)

	// Добавление нового поля
	updated, _ = json.Set(updated, "active", true)
	fmt.Println("После добавления:", updated)

	// Последовательная установка нескольких полей
	updated, _ = json.Set(updated, "version", 2)
	updated, _ = json.Set(updated, "author", "CyberGo")
	updated, _ = json.Set(updated, "tags", []string{"json", "go"})
	fmt.Println("После массового обновления:", updated)

	// Удаление поля
	updated, _ = json.Delete(updated, "author")
	fmt.Println("После удаления:", updated)

	// Вложенное изменение
	nested := `{"config": {"database": {"host": "localhost"}}}`
	nested, _ = json.Set(nested, "config.database.host", "192.168.1.1")
	nested, _ = json.Set(nested, "config.database.port", 3306)
	fmt.Println("Вложенное:", nested)
}
```

## Кодирование и декодирование структур

### Базовое кодирование и декодирование

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

type User struct {
	ID       int            `json:"id"`
	Name     string         `json:"name"`
	Email    string         `json:"email"`
	Active   bool           `json:"active"`
	Tags     []string       `json:"tags"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

func main() {
	user := User{
		ID:     1001,
		Name:   "Alice",
		Email:  "alice@example.com",
		Active: true,
		Tags:   []string{"go", "json"},
		Metadata: map[string]any{
			"role":  "admin",
			"level": 5,
		},
	}

	// Кодирование
	data, err := json.Marshal(user)
	if err != nil {
		panic(err)
	}
	fmt.Println("Закодировано:", string(data))

	// Форматированное кодирование
	pretty, _ := json.MarshalIndent(user, "", "  ")
	fmt.Println("Форматировано:\n", string(pretty))

	// Декодирование
	var decoded User
	err = json.Unmarshal(data, &decoded)
	if err != nil {
		panic(err)
	}
	fmt.Printf("Декодировано: %+v\n", decoded)
}
```

### Вложенные структуры

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

type Address struct {
	City    string `json:"city"`
	Country string `json:"country"`
}

type Profile struct {
	Age     int     `json:"age"`
	Address Address `json:"address"`
}

type UserWithProfile struct {
	ID      int     `json:"id"`
	Name    string  `json:"name"`
	Profile Profile `json:"profile"`
}

func main() {
	user := UserWithProfile{
		ID:   1,
		Name: "Bob",
		Profile: Profile{
			Age: 30,
			Address: Address{
				City:    "Shanghai",
				Country: "China",
			},
		},
	}

	data, _ := json.MarshalIndent(user, "", "  ")
	fmt.Println(string(data))

	// Получение вложенного значения напрямую из JSON-строки
	city := json.GetString(string(data), "profile.address.city")
	fmt.Println("Город:", city)
}
```

## Обобщённый API

### GetTyped

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

type Config struct {
	Host string `json:"host"`
	Port int    `json:"port"`
	TLS  struct {
		Enabled  bool   `json:"enabled"`
		CertPath string `json:"cert_path"`
	} `json:"tls"`
}

func main() {
	data := `{
        "host": "localhost",
        "port": 8080,
        "tls": {
            "enabled": true,
            "cert_path": "/etc/certs/server.crt"
        }
    }`

	// Обобщённое декодирование
	config := json.GetTyped[Config](data, ".")
	fmt.Printf("Конфигурация: %+v\n", config)

	// Со значением по умолчанию
	defaultConfig := Config{Host: "127.0.0.1", Port: 3000}
	cfg := json.GetTyped[Config](data, ".", defaultConfig)
	fmt.Printf("Конфигурация: %+v\n", cfg)
}
```

## Использование Processor

### Базовое использование

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// Создание процессора
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data := `{"users": [{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}]}`

	// Операции через процессор
	users := p.GetArray(data, "users")
	fmt.Println("Пользователи:", users)

	// Предварительный разбор для ускорения многократных запросов
	parsed, _ := p.PreParse(data)
	for i := 0; i < 2; i++ {
		name, _ := p.GetFromParsed(parsed, fmt.Sprintf("users.%d.name", i))
		fmt.Printf("Пользователь %d: %v\n", i, name)
	}
}
```

### Пользовательская конфигурация

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"time"
)

func main() {
	// Пользовательская конфигурация
	cfg := json.DefaultConfig()
	cfg.EnableCache = true
	cfg.CacheTTL = 10 * time.Minute
	cfg.MaxJSONSize = 50 * 1024 * 1024 // 50 МБ
	cfg.CreatePaths = true

	p, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// Использование безопасной конфигурации для обработки недоверенных данных
	secureCfg := json.SecurityConfig()
	secureP, err := json.New(secureCfg)
	if err != nil {
		panic(err)
	}
	defer secureP.Close()

	untrusted := `{"input": "<script>alert('xss')</script>"}`
	result := secureP.GetString(untrusted, "input")
	fmt.Println("Очищено:", result)
}
```

### Прогрев кэша

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

	// Большие JSON-данные (пример упрощён; на практике это могут быть тысячи строк)
	largeJSON := `{
        "users": [{"id": 1}, {"id": 2}],
        "products": [{"sku": "A-1"}],
        "orders": [{"no": 1001}]
    }`

	// Прогрев часто используемых путей
	commonPaths := []string{
		"users",
		"users.0.id",
		"products",
		"orders",
	}

	result, err := p.WarmupCache(largeJSON, commonPaths)
	if err != nil {
		panic(err)
	}

	fmt.Printf("Прогрев завершён: %d/%d путей закэшировано\n",
		result.Successful, result.TotalPaths)
	if len(result.FailedPaths) > 0 {
		fmt.Println("Неудачные пути:", result.FailedPaths)
	}
}
```

## Итерация и обход

### Обход массива

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{
        "users": [
            {"id": 1, "name": "Alice", "score": 95},
            {"id": 2, "name": "Bob", "score": 88},
            {"id": 3, "name": "Charlie", "score": 92}
        ]
    }`

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// Обход массива
	p.ForeachWithPath(data, "users", func(key any, item *json.IterableValue) {
		id := item.GetInt("id")
		name := item.GetString("name")
		score := item.GetFloat64("score")
		fmt.Printf("Пользователь %d: %s (балл: %.1f)\n", id, name, score)
	})
}
```

### Итерация с управлением потоком

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"numbers": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}`

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	sum := 0
	p.ForeachWithPathAndControl(data, "numbers", func(key any, value any) json.IteratorControl {
		// Остановиться при значении больше 5
		if num, ok := value.(float64); ok {
			if num > 5 {
				return json.IteratorBreak
			}
			sum += int(num)
		}
		return json.IteratorNormal
	})
	fmt.Println("Сумма чисел <= 5:", sum) // 1+2+3+4+5 = 15
}
```

### Проверка существования полей

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{
        "users": [
            {"name": "Alice", "email": "alice@example.com"},
            {"name": "Bob"},
            {"name": "Charlie", "email": "charlie@example.com", "phone": "123-456"}
        ]
    }`

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	p.ForeachWithPath(data, "users", func(key any, item *json.IterableValue) {
		name := item.GetString("name")
		email := item.GetString("email")
		phone := item.GetString("phone")

		fmt.Printf("Пользователь: %s\n", name)
		if item.Exists("email") {
			fmt.Printf("  Email: %s\n", email)
		}
		if item.Exists("phone") {
			fmt.Printf("  Телефон: %s\n", phone)
		}
		if item.IsNull("nickname") {
			fmt.Println("  Нет псевдонима")
		}
	})
}
```

### Параллельная обработка массивов

`ParallelIterator` имеет встроенный пул worker'ов и параллельно выполняет Map/Filter/ForEach по большому массиву — вручную писать goroutine и семафоры не нужно:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"scores":[62,85,94,38,71,99,55,88]}`
	scores := json.GetArray(data, "scores")

	iter := json.NewParallelIterator(scores)
	defer iter.Close()

	// Параллельная фильтрация: оставляем только баллы >= 80 (результат сохраняет порядок ввода)
	passed := iter.Filter(func(_ int, v any) bool {
		return v.(float64) >= 80
	})
	fmt.Println("Отличные баллы:", passed)

	// Параллельное отображение: каждый балл переводится в оценку (результат соответствует позициям ввода)
	grades, err := iter.Map(func(_ int, v any) (any, error) {
		score := v.(float64)
		switch {
		case score >= 90:
			return "A", nil
		case score >= 80:
			return "B", nil
		default:
			return "C", nil
		}
	})
	if err != nil {
		panic(err)
	}
	fmt.Println("Оценки:", grades)
}

// Вывод:
// Отличные баллы: [85 94 99 88]
// Оценки: [C B A C C A C B]
```

Число worker'ов берётся из `Config.MaxConcurrency` (по умолчанию 50, автоматически урезается до длины массива); panic в обратном вызове перехватывается и превращается в возвращённую ошибку, не роняя процесс. О пакетной обработке и отмене см. [Конкурентность и параллелизм](../advanced/concurrency).

## Обработка JSONL

### Чтение JSONL-файлов

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

	err = p.StreamJSONLFile("data.jsonl", func(lineNum int, item *json.IterableValue) error {
		fmt.Printf("Строка %d: %v\n", lineNum, item.GetData())
		return nil
	})

	if err != nil {
		fmt.Println("Ошибка:", err)
	}
}
```

### Обобщённая JSONL-обработка

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"strings"
)

type LogEntry struct {
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"`
	Message   string `json:"message"`
}

func main() {
	jsonlData := `{"timestamp":"2024-01-01T10:00:00Z","level":"INFO","message":"Started"}
{"timestamp":"2024-01-01T10:00:01Z","level":"DEBUG","message":"Processing"}
{"timestamp":"2024-01-01T10:00:02Z","level":"ERROR","message":"Failed"}`

	reader := strings.NewReader(jsonlData)

	entries, err := json.StreamLinesInto[LogEntry](reader, func(lineNum int, entry LogEntry) error {
		fmt.Printf("[%s] %s: %s\n", entry.Level, entry.Timestamp, entry.Message)
		return nil
	})

	if err != nil {
		panic(err)
	}
	fmt.Printf("Обработано %d записей\n", len(entries))
}
```

### Запись JSONL

`JSONLWriter` построчно записывает произвольные Go-значения в JSONL (NDJSON). `Write` кодирует одно значение и добавляет перевод строки, `WriteRaw` пишет уже закодированную строку (без затрат на повторное кодирование), `Stats` возвращает число строк и байт:

```go
package main

import (
	"bytes"
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	var buf bytes.Buffer
	writer := json.NewJSONLWriter(&buf)

	// Write: кодирование одного значения в строку JSON (перевод строки добавляется автоматически)
	if err := writer.Write(map[string]any{"id": 1, "name": "Alice"}); err != nil {
		panic(err)
	}
	if err := writer.Write(map[string]any{"id": 2, "name": "Bob"}); err != nil {
		panic(err)
	}

	// WriteRaw: запись уже закодированной строки (перевод строки добавляется, если его нет в конце)
	if err := writer.WriteRaw([]byte(`{"id":3,"name":"Charlie"}`)); err != nil {
		panic(err)
	}

	// Для записи в файл замените bytes.Buffer на *os.File из os.Create
	stats := writer.Stats()
	fmt.Printf("Записано строк: %d, всего байт: %d\n", stats.LinesProcessed, stats.BytesWritten)
	fmt.Print(buf.String())
}

// Вывод:
// Записано строк: 3, всего байт: 72
// {"id":1,"name":"Alice"}
// {"id":2,"name":"Bob"}
// {"id":3,"name":"Charlie"}
```

Объёмные данные можно записать одним вызовом `WriteAll([]any{...})`; первая ошибка кэшируется, и последующие вызовы сразу возвращают ту же ошибку — её можно в любой момент запросить через `writer.Err()`.

## Потоковая обработка

### Потоковая обработка больших JSON

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// Создание процессора
	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	// Потоковая обработка большого файла с помощью ForeachFile
	count := 0
	err = processor.ForeachFile("large-array.json", func(key any, item *json.IterableValue) error {
		count++
		if count%1000 == 0 {
			fmt.Printf("Обработано %d элементов...\n", count)
		}
		return nil // Верните item.Break() для прерывания
	})

	if err != nil {
		panic(err)
	}
	fmt.Printf("Всего элементов: %d\n", count)
}
```

### Потоковая обработка объектов

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	// Обработка файла с JSON-объектами (структура ключ-значение)
	// Формат файла: {"user1": {...}, "user2": {...}, ...}
	err = processor.ForeachFile("config-map.json", func(key any, item *json.IterableValue) error {
		name := item.GetString("name")
		fmt.Printf("Ключ: %s, Имя: %s\n", key, name)
		return nil
	})

	if err != nil {
		panic(err)
	}
}
```

## Система перехватчиков (Hooks)

### Перехватчик логирования

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"log/slog"
	"os"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))

	cfg := json.DefaultConfig()
	cfg.AddHook(json.LoggingHook(logger))

	p, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data := `{"name": "test"}`
	name := p.GetString(data, "name")
	fmt.Println("Имя:", name)
}
```

### Перехватчик замера времени

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"time"
)

type TimingRecorder struct {
	records map[string]time.Duration
}

func (r *TimingRecorder) Record(op string, duration time.Duration) {
	r.records[op] = duration
}

func main() {
	recorder := &TimingRecorder{records: make(map[string]time.Duration)}

	cfg := json.DefaultConfig()
	cfg.AddHook(json.TimingHook(recorder))

	p, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// Выполнение нескольких операций
	data := `{"users": [{"id": 1}, {"id": 2}]}`
	for i := 0; i < 100; i++ {
		p.Get(data, "users")
	}

	fmt.Println("Записи времени:", recorder.records)
}
```

### Пользовательский перехватчик валидации

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	cfg := json.DefaultConfig()
	cfg.AddHook(json.ValidationHook(func(jsonStr, path string) error {
		// Пользовательская логика валидации
		if len(jsonStr) > 10000 {
			return fmt.Errorf("JSON слишком большой")
		}
		return nil
	}))

	p, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data := `{"name": "test"}`
	val, err := p.Get(data, "name")
	if err != nil {
		fmt.Println("Ошибка валидации:", err)
	} else {
		fmt.Println("Значение:", val)
	}
}
```

## Валидация по схеме

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// Определение схемы
	schema := &json.Schema{
		Type:     "object",
		Required: []string{"name", "email"},
		Properties: map[string]*json.Schema{
			"name": {
				Type:      "string",
				MinLength: 1,
				MaxLength: 100,
			},
			"email": {
				Type:   "string",
				Format: "email",
			},
			"age": {
				Type:    "number",
				Minimum: 0,
				Maximum: 150,
			},
			"tags": {
				Type:     "array",
				MinItems: 1,
				Items: &json.Schema{
					Type: "string",
				},
			},
		},
	}

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	validJSON := `{"name": "Alice", "email": "alice@example.com", "age": 25}`
	invalidJSON := `{"name": "", "email": "invalid"}`

	errors, _ := p.ValidateSchema(validJSON, schema)
	if len(errors) == 0 {
		fmt.Println("Корректный JSON")
	} else {
		for _, e := range errors {
			fmt.Printf("Ошибка в %s: %s\n", e.Path, e.Message)
		}
	}

	errors, _ = p.ValidateSchema(invalidJSON, schema)
	for _, e := range errors {
		fmt.Printf("Ошибка в %s: %s\n", e.Path, e.Message)
	}
}
```

## Обработка ошибок

### Определение типа ошибки

```go
package main

import (
	"errors"
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"name": "test"}`
	_, err := json.Get(data, "nonexistent.path")

	if err != nil {
		// Проверка типа ошибки
		if errors.Is(err, json.ErrPathNotFound) {
			fmt.Println("Путь не найден")
		} else if errors.Is(err, json.ErrInvalidJSON) {
			fmt.Println("Некорректный JSON")
		} else if errors.Is(err, json.ErrTypeMismatch) {
			fmt.Println("Несоответствие типов")
		}

		// Получение подробной информации об ошибке
		var jsonErr *json.JsonsError
		if errors.As(err, &jsonErr) {
			fmt.Printf("Операция: %s, Путь: %s\n", jsonErr.Op, jsonErr.Path)
		}
	}
}
```

### Безопасная обработка недоверенных данных

```go
package main

import (
	"errors"
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// Использование безопасной конфигурации
	cfg := json.SecurityConfig()
	// SecurityConfig по умолчанию ограничивает 10 МБ, здесь дополнительно ограничено до 1 МБ
	cfg.MaxJSONSize = 1024 * 1024 // Лимит 1 МБ
	p, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// Имитация недоверенных входных данных
	// Примечание: реальная атака может попытаться использовать больший payload (например, 100 МБ+)
	// Безопасная конфигурация блокирует входные данные, превышающие MaxJSONSize
	untrustedInputs := []string{
		`{"data": "normal"}`,
		`{"huge": "` + string(make([]byte, 2*1024*1024)) + `"}`,                                      // Ввод 2 МБ (превышает лимит 1 МБ)
		`{"nested": {{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}`, // Слишком глубокая вложенность
	}

	for i, input := range untrustedInputs {
		_, err := p.Get(input, "data")
		if err != nil {
			if errors.Is(err, json.ErrSecurityViolation) {
				fmt.Printf("Ввод %d заблокирован: нарушение безопасности\n", i)
			} else {
				fmt.Printf("Ошибка ввода %d: %v\n", i, err)
			}
		} else {
			fmt.Printf("Ввод %d успешно обработан\n", i)
		}
	}
}
```

## Вспомогательные функции

### Сравнение JSON

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	json1 := `{"a": 1, "b": 2}`
	json2 := `{"b": 2, "a": 1}` // Разный порядок ключей

	equal, err := json.CompareJSON(json1, json2)
	if err != nil {
		panic(err)
	}
	fmt.Println("Равны:", equal) // true (семантическое равенство)
}
```

### Сравнение конфигураций на семантическую идентичность

`CompareJSON` разбирает и нормализует данные перед сравнением: разный порядок ключей и различия в записи чисел вроде `3` и `3.0` считаются равными. Используйте его, чтобы понять, «изменилась ли конфигурация на самом деле», и не принимать отличия форматирования за изменения:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	deployed := `{"port": 8080, "debug": false, "retries": 3}`
	// Та же конфигурация после повторной сериализации: порядок ключей перемешан,
	// числа переписаны в дробном виде
	modified := `{
        "debug": false,
        "retries": 3.0,
        "port": 8080
    }`

	equal, err := json.CompareJSON(deployed, modified)
	if err != nil {
		panic(err)
	}
	fmt.Println("Конфигурации семантически идентичны:", equal)
	// Вывод: Конфигурации семантически идентичны: true

	// Для конфигураций из недоверенных источников добавьте безопасную конфигурацию
	// (ограничение размера/глубины, проверка безопасности)
	equal, err = json.CompareJSON(deployed, modified, json.SecurityConfig())
	if err != nil {
		panic(err)
	}
	fmt.Println("Сравнение в безопасном режиме:", equal)
	// Вывод: Сравнение в безопасном режиме: true
}
```

### Слияние JSON

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	json1 := `{"a": 1, "b": {"x": 10}}`
	json2 := `{"b": {"y": 20}, "c": 3}`

	// Слияние
	merged, _ := json.MergeJSON(json1, json2)
	fmt.Println("Слияние:", merged)
	// {"a":1,"b":{"x":10,"y":20},"c":3}

	// Слияние нескольких
	result, _ := json.MergeMany([]string{
		`{"a":1}`,
		`{"b":2}`,
		`{"d": 4}`,
	})
	fmt.Println("Слияние нескольких:", result)
}
```

### Глубокое копирование (кодирование и декодирование)

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := map[string]any{
		"name": "Alice",
		"tags": []string{"go", "json"},
		"meta": map[string]any{
			"level": 5,
		},
	}

	copied, err := json.Marshal(data)
	if err != nil {
		panic(err)
	}

	// Глубокая копия: кодирование и повторное декодирование
	var deepCopy map[string]any
	json.Unmarshal(copied, &deepCopy)

	// Изменение копии не затрагивает оригинал
	deepCopy["name"] = "Bob"
	fmt.Println("Оригинал:", data["name"])  // Alice
	fmt.Println("Копия:", deepCopy["name"]) // Bob
}
```

## Больше примеров

- [Примеры расширенных функций](./examples-advanced) — массовое кодирование, предварительный разбор, система перехватчиков и другие расширенные возможности
