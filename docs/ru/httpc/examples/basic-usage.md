---
sidebar_label: "Базовые примеры"
title: "Базовое использование - CyberGo HTTPC | Запускаемые примеры"
description: "Примеры базового использования HTTPC: HTTP-методы, XML- и бинарные тела, аутентификация, тройка Result, DefaultConfig, прокси, middleware и скачивание файлов."
sidebar_position: 1
---

# Базовое использование

## GET-запросы

### Базовый GET

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    result, err := httpc.Get("https://httpbin.org/get")
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println(result.StatusCode()) // 200
    fmt.Println(result.Body())
}
```

### С параметрами запроса

```go
result, err := httpc.Get("https://httpbin.org/get",
    httpc.WithQuery("name", "test"),
    httpc.WithQuery("page", 1),
    httpc.WithQueryMap(map[string]any{
        "limit": 10,
        "sort":  "desc",
    }),
)
```

### С аутентификацией

```go
result, err := httpc.Get("https://api.example.com/me",
    httpc.WithBearerToken("my-token"),
)
```

Помимо Bearer-токена есть ещё три распространённых способа аутентификации и работы с заголовками:

```go
// Basic-аутентификация
result, err := httpc.Get("https://api.example.com/me",
    httpc.WithBasicAuth("username", "password"),
)

// API Key (в виде пользовательского заголовка)
result, err := httpc.Get("https://api.example.com/me",
    httpc.WithHeader("X-API-Key", "your-api-key"),
)

// Массовая установка заголовков + пользовательский User-Agent
result, err = httpc.Get("https://api.example.com/me",
    httpc.WithHeaderMap(map[string]string{
        "X-API-Version": "v1",
        "X-Client-ID":   "client-123",
    }),
    httpc.WithUserAgent("MyApp/1.0"),
)
```

## POST-запросы

### Тело запроса JSON

```go
data := map[string]any{
    "name":  "John",
    "email": "john@example.com",
}

result, err := httpc.Post("https://httpbin.org/post",
    httpc.WithJSON(data),
)
if err != nil {
    log.Fatal(err)
}

// Парсинг JSON-ответа
var response map[string]any
if err := result.Unmarshal(&response); err != nil {
    log.Fatal(err)
}
fmt.Println(response)
```

### Отправка формы

```go
result, err := httpc.Post("https://httpbin.org/post",
    httpc.WithForm(map[string]string{
        "username": "admin",
        "password": "secret",
    }),
)
```

### Загрузка файла

```go
fileContent, _ := os.ReadFile("document.pdf")

result, err := httpc.Post("https://httpbin.org/post",
    httpc.WithFile("file", "document.pdf", fileContent),
)
```

### Многополевая форма

```go
form := &httpc.FormData{
    Fields: map[string]string{
        "title": "My Document",
        "type":  "pdf",
    },
    Files: map[string]*httpc.FileData{
        "file": {
            Filename: "report.pdf",
            Content:  fileContent,
        },
    },
}

result, err := httpc.Post("https://api.example.com/upload",
    httpc.WithFormData(form),
)
```

### Тело запроса XML

```go
type Person struct {
    XMLName xml.Name `xml:"person"`
    Name    string   `xml:"name"`
    Age     int      `xml:"age"`
}

result, err := httpc.Post("https://httpbin.org/post",
    httpc.WithXML(Person{Name: "Jane", Age: 28}),
)
if err != nil {
    log.Fatal(err)
}
fmt.Println(result.StatusCode()) // 200
```

### Простой текст и бинарные данные

Строковое тело запроса автоматически отправляется с типом `text/plain`; для бинарных данных рекомендуется явно указывать MIME-тип:

```go
// Простой текст: Content-Type автоматически становится text/plain
result, err := httpc.Post("https://httpbin.org/post",
    httpc.WithBody("Hello, this is plain text!"),
)

// Бинарные данные: Content-Type — необязательный параметр
pngHeader := []byte{0x89, 0x50, 0x4E, 0x47}
result, err = httpc.Post("https://httpbin.org/post",
    httpc.WithBinary(pngHeader, "image/png"),
)
```

### Принудительное указание типа тела запроса (BodyKind)

`WithBody` по умолчанию выводит кодировку из типа входных данных, второй параметр позволяет задать её принудительно:

```go
// map принудительно кодируется как JSON (вместо ветки общего форматирования)
result, err := httpc.Post("https://httpbin.org/post",
    httpc.WithBody(map[string]string{"key": "value"}, httpc.BodyJSON),
)
```

## Другие HTTP-методы

PUT, DELETE, HEAD, PATCH, OPTIONS и универсальный метод `Request` — все доступны. Ниже полный пример, охватывающий все методы:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // PUT: полная замена ресурса
    put, err := client.Put("https://httpbin.org/put",
        httpc.WithJSON(map[string]string{"name": "Jane", "status": "active"}),
        httpc.WithBearerToken("your-token"),
    )
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("PUT:", put.StatusCode()) // Вывод: PUT: 200

    // DELETE: удаление ресурса
    del, err := client.Delete("https://httpbin.org/delete",
        httpc.WithHeader("X-Request-ID", "delete-123"),
    )
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("DELETE:", del.StatusCode()) // Вывод: DELETE: 200

    // HEAD: только заголовки ответа (без тела), подходит для проверки существования и размера ресурса
    head, err := client.Head("https://httpbin.org/get")
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("HEAD:", head.StatusCode())                                 // Вывод: HEAD: 200
    fmt.Println("Content-Type:", head.Response.Headers.Get("Content-Type")) // Вывод: Content-Type: application/json

    // PATCH: частичное обновление (отправляются только изменённые поля)
    patch, err := client.Patch("https://httpbin.org/patch",
        httpc.WithJSON(map[string]string{"status": "inactive"}),
    )
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("PATCH:", patch.StatusCode()) // Вывод: PATCH: 200

    // OPTIONS: проверка допустимых на сервере методов (то же, что CORS-preflight)
    opt, err := client.Options("https://httpbin.org/post")
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("OPTIONS:", opt.StatusCode()) // Вывод: OPTIONS: 200
}
```

Краткая справка по методам:

| Метод | Тело запроса | Идемпотентный | Типичное применение |
|------|:---:|:---:|----------|
| GET | Нет | Да | Получение ресурса |
| HEAD | Нет | Да | Только заголовки ответа (проверка существования, размера, метаданных кэша) |
| POST | Да | Нет | Создание ресурса, отправка данных |
| PUT | Да | Да | Полная замена ресурса |
| PATCH | Да | Нет | Частичное обновление |
| DELETE | Нет | Да | Удаление ресурса |
| OPTIONS | Нет | Да | Проверка допустимых методов |

### Универсальный метод Request

Если HTTP-метод становится известен только во время выполнения (из конфигурации, конструктора запросов или прокси-пересылки), используйте `Request(ctx, method, url, options...)`:

```go
ctx := context.Background()

for _, m := range []struct{ method, url string }{
    {"GET", "https://httpbin.org/get"},
    {"POST", "https://httpbin.org/post"},
    {"PUT", "https://httpbin.org/put"},
} {
    resp, err := client.Request(ctx, m.method, m.url,
        httpc.WithJSON(map[string]string{"key": "value"}),
    )
    if err != nil {
        log.Printf("%s error: %v", m.method, err)
        continue
    }
    fmt.Printf("%s %s -> %d\n", m.method, m.url, resp.StatusCode())
}
```

## Обработка ответа

Каждый запрос возвращает `*Result` — тройку «запрос/ответ/метаданные»; три вложенные структуры выделяются одной аллокацией и делят общую память:

| Группа | Основные поля | Описание |
|------|----------|------|
| `result.Request` | `URL` / `Method` / `Headers` / `Cookies` | Данные фактически отправленного запроса |
| `result.Response` | `StatusCode` / `Status` / `Proto` / `Headers` / `Body` / `RawBody` / `ContentLength` / `Cookies` | Данные ответа |
| `result.Meta` | `Duration` / `Attempts` / `RedirectCount` / `RedirectChain` / `ProxyURL` | Метаданные выполнения (число попыток, цепочка перенаправлений и т. д.) |

### Проверка статуса

```go
result, err := client.Get("https://httpbin.org/get")
if err != nil {
    log.Fatal(err) // ошибка сетевого уровня (DNS, таймаут, сбой соединения и т. д.)
}

switch {
case result.IsSuccess():     // 2xx
    fmt.Println("Успех")
case result.IsRedirect():    // 3xx (если перенаправление не отслеживалось)
    fmt.Println("Перенаправление на:", result.Response.Headers.Get("Location"))
case result.IsClientError(): // 4xx
    fmt.Println("Ошибка клиента, проверьте параметры запроса и аутентификацию")
    if result.StatusCode() == http.StatusTooManyRequests {
        fmt.Println("Сработал rate limit, повторите позже:", result.Response.Headers.Get("Retry-After"))
    }
case result.IsServerError(): // 5xx
    fmt.Println("Ошибка сервера, повтор может помочь")
}
```

:::tip err и код статуса — два уровня ошибок
Сбой сетевого уровня (DNS, таймаут, TLS) проявляется как `err != nil`; HTTP 4xx/5xx **не считаются** `err` — ответ возвращается нормально, а статус вы проверяете сами методами вроде `IsSuccess()`. Раздельная обработка этих двух уровней — самый распространённый правильный подход.
:::

### Выбор между Body / RawBody / String

| Метод | Возвращает | Применение |
|------|------|------|
| `result.Body()` | `string` (предварительно сохранён) | Прямое чтение текста; нулевые дополнительные накладные расходы |
| `result.RawBody()` | `[]byte` (сырые данные) | Передача в API, которым нужен срез байтов (хеширование, повторное декодирование) |
| `result.String()` | форматированная сводка | Отладочный вывод (статус, заголовки, сводка тела); самые высокие накладные расходы, не используйте в горячем пути |

```go
result, _ := client.Get("https://httpbin.org/get")

fmt.Println(len(result.Body()))        // Пример вывода: 268 (длина тела)
fmt.Println(len(result.RawBody()))     // Пример вывода: 268 (байтовое представление тех же данных)
fmt.Println(result.Meta.Attempts)      // Вывод: 1 (увеличится после повторов)
fmt.Println(result.Meta.RedirectCount) // Вывод: 0 (больше 0, если были перенаправления)
```

## Создание клиента

### Пользовательская конфигурация

```go
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 60 * time.Second
cfg.Retry.MaxRetries = 5
cfg.Retry.Delay = 2 * time.Second
cfg.Retry.BackoffFactor = 2.0
cfg.Retry.EnableJitter = true

client, err := httpc.New(cfg)
if err != nil {
    log.Fatal(err)
}
defer client.Close()
```

### Настройка прокси

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyURL = "http://proxy:8080"

client, _ := httpc.New(cfg)
```

## Промежуточное ПО

### Логирование + восстановление

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.RecoveryMiddleware(),
    httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: log.Printf}),
}
cfg.Defaults.UserAgent = "my-app/1.0"

client, _ := httpc.New(cfg)
```

### Request ID + метрики

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),
    httpc.MetricsMiddleware(&httpc.MetricsConfig{OnMetrics: func(method, url string, statusCode int, duration time.Duration, err error) {
        metrics.Record(method, statusCode, duration)
    }}),
}

client, _ := httpc.New(cfg)
```

## Скачивание файлов

```go
client, _ := httpc.NewDefault()
defer client.Close()

cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/file.zip"
cfg.Overwrite = true
cfg.ProgressCallback = func(downloaded, total int64, speed float64) {
    pct := float64(downloaded) / float64(total) * 100
    fmt.Printf("\rСкачивание: %.1f%% (%.2f MB/s)", pct, float64(speed)/1024/1024)
}

result, err := client.Download(context.Background(), "https://example.com/file.zip", cfg)
if err != nil {
    log.Fatal(err)
}

fmt.Printf("\nСкачивание завершено: %d bytes, время %v, средняя скорость %.2f MB/s\n",
    result.BytesWritten,
    result.Duration,
    float64(result.AverageSpeed)/1024/1024,
)
```

## Доменный клиент

```go
dc, err := httpc.NewDomainDefault("https://api.example.com")
if err != nil {
    log.Fatal(err)
}
defer dc.Close()

// Установка данных сессии
dc.SetHeader("Authorization", "Bearer "+token)
dc.SetHeader("Accept", "application/json")

// Запросы автоматически несут заголовки сессии и Cookie
users, _ := dc.Get("/users")
user, _ := dc.Get("/users/1")

fmt.Println(users.StatusCode()) // 200
```

## Что дальше

- [Продвинутые примеры](./advanced-usage) - пользовательские повторы, цепочки промежуточного ПО, параллельное скачивание
- [Запросы и ответы](../guides/request-response) - подробный разбор параметров запроса
- [Доменный клиент и сессии](../guides/domain-session) - управление сессиями
