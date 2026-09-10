---
sidebar_label: "Продвинутые примеры"
title: "Продвинутые примеры - CyberGo HTTPC | Код для продакшена"
description: "Продвинутые примеры HTTPC: RetryPolicy, таймауты и повторы, колбэки, цепочка middleware, обёртка REST API, SessionManager, worker pool и подпись HMAC."
sidebar_position: 2
---

# Продвинутые примеры

## Пользовательская стратегия повторов

Повторять только при 502/503/504 с фиксированной задержкой:

:::warning Внутренние типы
Параметр `resp` метода RetryPolicy.ShouldRetry имеет тип ResponseReader — внутренний интерфейс (определён в пакете `internal/types`), который невозможно импортировать из внешних пакетов. Пользовательский `RetryPolicy` должен быть реализован в том же модуле, что и `httpc`. Большинство сценариев покрываются конфигурацией `RetryConfig`. Следующий пример демонстрирует шаблон реализации, фактический код должен компилироваться внутри модуля `httpc`.
:::

```go
// Внимание: ResponseReader — внутренний тип (пакет internal/types).
// Этот код можно скомпилировать только внутри модуля github.com/cybergodev/httpc.
// Большинство пользователей должны настраивать повторы через RetryConfig и WithMaxRetries.

type selectiveRetry struct {
    maxAttempts int
    baseDelay   time.Duration
}

// Определяет, следует ли повторить
func (p *selectiveRetry) ShouldRetry(resp ResponseReader, err error, attempt int) bool {
    if attempt >= p.maxAttempts {
        return false
    }
    if err != nil {
        return true // Повторять при сетевых ошибках
    }
    return resp.StatusCode() == 502 || resp.StatusCode() == 503 || resp.StatusCode() == 504
}

func (p *selectiveRetry) GetDelay(attempt int) time.Duration {
    return p.baseDelay * time.Duration(attempt+1)
}

func (p *selectiveRetry) MaxRetries() int {
    return p.maxAttempts
}

// Применение пользовательской стратегии
cfg := httpc.DefaultConfig()
cfg.Retry.CustomPolicy = &selectiveRetry{maxAttempts: 5, baseDelay: time.Second}
```

Альтернатива для внешних проектов — использование конфигурации `RetryConfig`:

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Retry.MaxRetries = 5
    cfg.Retry.Delay = 500 * time.Millisecond
    cfg.Retry.BackoffFactor = 1.5
    cfg.Retry.EnableJitter = true

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://api.example.com/unstable")
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println(result.StatusCode())
}
```

## Комбинация таймаутов и повторов

Три уровня управления временем, каждый за своё: context задаёт общий бюджет всей группы попыток, `WithTimeout` — одну попытку, `WithMaxRetries` — число попыток:

```go
package main

import (
    "context"
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // ctx 30s: общий бюджет, включающий все повторы и ожидания экспоненциального отката
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    result, err := client.Post("https://httpbin.org/post",
        httpc.WithJSON(map[string]string{"data": "important"}),
        httpc.WithContext(ctx),            // общий бюджет
        httpc.WithTimeout(10*time.Second), // лимит одной попытки
        httpc.WithMaxRetries(3),           // не более 3 повторов
    )
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println(result.StatusCode()) // Вывод: 200
    fmt.Println("Число попыток:", result.Meta.Attempts) // Вывод: Число попыток: 1 (увеличится после неудачных повторов)
    fmt.Println("Общее время:", result.Meta.Duration)
}
```

Когда повторы нужно отключить (например, для неидемпотентных операций создания), явно укажите `WithMaxRetries(0)`:

```go
result, err := client.Post("https://httpbin.org/post",
    httpc.WithJSON(map[string]string{"action": "create"}),
    httpc.WithMaxRetries(0), // без повторов: чтобы избежать повторного создания
)
```

## Полная цепочка промежуточного ПО

```go
package main

import (
    "encoding/json"
    "log"
    "sync/atomic"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    // Счётчик запросов
    var requestCount int64

    // Сбор метрик
    metricsMiddleware := httpc.MetricsMiddleware(
        &httpc.MetricsConfig{OnMetrics: func(method, url string, statusCode int, duration time.Duration, err error) {
            atomic.AddInt64(&requestCount, 1)
            log.Printf("[METRICS] %s %s -> %d (%v)", method, url, statusCode, duration)
        }},
    )

    // Лог аудита (формат JSON)
    auditCfg := httpc.DefaultAuditConfig()
    auditCfg.Format = "json"
    auditCfg.IncludeHeaders = true
    auditCfg.MaskHeaders = []string{"Authorization", "Cookie"}
    auditCfg.SanitizeError = true
    auditCfg.OnAudit = func(event httpc.AuditEvent) {
        data, _ := json.Marshal(event)
        log.Printf("[AUDIT] %s", data)
    }
    auditMiddleware := httpc.AuditMiddleware(auditCfg)

    cfg := httpc.DefaultConfig()
    cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
        httpc.RecoveryMiddleware(),                              // восстановление после panic
        httpc.TimeoutMiddleware(&httpc.TimeoutMiddlewareConfig{Duration: 30 * time.Second}), // принудительный таймаут
        httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),                            // Request ID
        httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: func(format string, args ...any) {
            log.Printf("[HTTP] "+format, args...)
        }}),
        metricsMiddleware,
        auditMiddleware,
    }

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    _, err = client.Get("https://httpbin.org/get")
    if err != nil {
        log.Fatal(err)
    }

    log.Printf("Всего запросов: %d", atomic.LoadInt64(&requestCount))
}
```

## Колбэки запроса/ответа

Когда полная цепочка промежуточного ПО не нужна, двух колбэков уровня запроса — `WithOnRequest` / `WithOnResponse` — достаточно для лёгкого наблюдения и отладки: перед отправкой доступен изменяемый запрос, после завершения — читаемый ответ:

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

    onRequest := func(req httpc.RequestMutator) error {
        fmt.Printf("[Запрос] %s %s (заголовков: %d)\n",
            req.Method(), req.URL(), len(req.Headers()))
        return nil // возврат non-nil error прервёт запрос
    }

    onResponse := func(resp httpc.ResponseMutator) error {
        fmt.Printf("[Ответ] %d %s, время %v, попыток: %d\n",
            resp.StatusCode(), resp.Status(), resp.Duration(), resp.Attempts())
        return nil
    }

    result, err := client.Get("https://httpbin.org/get",
        httpc.WithOnRequest(onRequest),
        httpc.WithOnResponse(onResponse),
        httpc.WithQuery("test", "callbacks"),
    )
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("Код статуса:", result.StatusCode()) // Вывод: Код статуса: 200
}
```

Разделение труда с промежуточным ПО: колбэки — удобные зацепки для **одиночного запроса** (логирование, отладка, простые метрики); для конвейерной обработки всех запросов — компонуемой и способной прервать запрос — используйте [цепочку промежуточного ПО](../guides/middleware-chain).

## Обёртка клиента REST API

```go
package main

import (
    "context"
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

type APIClient struct {
    dc httpc.DomainClienter
}

type User struct {
    ID   int    `json:"id"`
    Name string `json:"name"`
}

func NewAPIClient(baseURL, token string) (*APIClient, error) {
    dc, err := httpc.NewDomainDefault(baseURL)
    if err != nil {
        return nil, err
    }
    if err := dc.SetHeader("Authorization", "Bearer "+token); err != nil {
        dc.Close()
        return nil, err
    }
    if err := dc.SetHeader("Accept", "application/json"); err != nil {
        dc.Close()
        return nil, err
    }

    return &APIClient{dc: dc}, nil
}

func (c *APIClient) GetUser(ctx context.Context, id int) (*User, error) {
    result, err := c.dc.Request(ctx, "GET", fmt.Sprintf("/users/%d", id))
    if err != nil {
        return nil, err
    }

    if !result.IsSuccess() {
        return nil, fmt.Errorf("API error: %d", result.StatusCode())
    }

    var user User
    if err := result.Unmarshal(&user); err != nil {
        return nil, err
    }
    return &user, nil
}

func (c *APIClient) CreateUser(ctx context.Context, name string) (*User, error) {
    result, err := c.dc.Request(ctx, "POST", "/users",
        httpc.WithJSON(map[string]string{"name": name}),
    )
    if err != nil {
        return nil, err
    }

    var user User
    if err := result.Unmarshal(&user); err != nil {
        return nil, err
    }
    return &user, nil
}

func (c *APIClient) Close() error {
    return c.dc.Close()
}

func main() {
    api, err := NewAPIClient("https://api.example.com", "my-token")
    if err != nil {
        log.Fatal(err)
    }
    defer api.Close()

    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    // Создание пользователя
    user, err := api.CreateUser(ctx, "Alice")
    if err != nil {
        log.Fatal(err)
    }
    fmt.Printf("Создан: %+v\n", user)

    // Получение пользователя
    user, err = api.GetUser(ctx, user.ID)
    if err != nil {
        log.Fatal(err)
    }
    fmt.Printf("Получен: %+v\n", user)
}
```

## Доменный клиент (пользовательская конфигурация)

Помимо `NewDomainDefault(baseURL)`, `NewDomain(baseURL, cfg)` принимает полную структуру `Config` — пресеты, таймауты, повторы и прокси настраиваются целиком. Доменный клиент автоматически управляет заголовками сессии и Cookie, а в отдельном запросе можно временно переопределить заголовки сессии:

```go
package main

import (
    "fmt"
    "log"
    "net/http"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    // Построчная настройка поверх конфигурации по умолчанию
    cfg := httpc.DefaultConfig()
    cfg.Timeouts.Request = 15 * time.Second
    cfg.Retry.MaxRetries = 2
    cfg.Defaults.UserAgent = "domain-client-demo/1.0"

    dc, err := httpc.NewDomain("https://httpbin.org", cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer dc.Close()

    fmt.Println("Base URL:", dc.URL())  // Вывод: Base URL: https://httpbin.org
    fmt.Println("Domain:", dc.Domain()) // Вывод: Domain: httpbin.org

    // Заголовки сессии: автоматически добавляются к каждому запросу в рамках домена
    if err := dc.SetHeaders(map[string]string{
        "X-API-Version": "v1",
        "X-Client-ID":   "client-123",
    }); err != nil {
        log.Fatal(err)
    }

    // Переопределение заголовка сессии в одном запросе без влияния на постоянную сессию
    resp, err := dc.Get("/get",
        httpc.WithHeader("X-API-Version", "v2"), // действует только для этого запроса
    )
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("Статус запроса:", resp.StatusCode())       // Вывод: Статус запроса: 200
    fmt.Println("Заголовков сессии:", len(dc.GetHeaders())) // Вывод: Заголовков сессии: 2

    // Ручная вставка Cookie сессии; Cookie из ответа также автоматически попадают в сессию
    if err := dc.SetCookies([]*http.Cookie{
        {Name: "session", Value: "abc123"},
    }); err != nil {
        log.Fatal(err)
    }

    resp2, err := dc.Get("/cookies") // Cookie сессии автоматически отправляются с запросом
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("Второй запрос:", resp2.StatusCode()) // Вывод: Второй запрос: 200

    // Session() возвращает базовый SessionManager (его автономное использование показано в следующем разделе)
    session := dc.Session()
    session.UpdateFromResult(resp2) // объединяет Cookie этого ответа с сессией
    fmt.Println("Cookie сессии:", len(session.GetCookies()))
}
```

:::warning Относительные пути и побочные эффекты параметров
В параметре `path` достаточно указать относительный путь (например, `/get`) — он автоматически объединится с baseURL; полный URL (со схемой) используется напрямую. Кроме того, доменный клиент **выполняет параметры запроса дважды** (один раз для захвата состояния сессии, один — для фактического запроса), поэтому избегайте передавать параметры с побочными эффектами: счётчики, nonce и т. п.
:::

## Продвинутое использование Cookie

### Пять способов отправки Cookie

```go
// 1. Одиночный Cookie (полная структура http.Cookie, может содержать атрибуты)
result, err := client.Get("https://httpbin.org/cookies",
    httpc.WithCookie(http.Cookie{
        Name:     "auth_token",
        Value:    "xyz789",
        Path:     "/api",
        Expires:  time.Now().Add(24 * time.Hour),
        Secure:   true,
        HttpOnly: true,
    }),
)

// 2. Массовая отправка (рекомендуется, одна сериализация)
result, err = client.Get("https://httpbin.org/cookies",
    httpc.WithCookies([]http.Cookie{
        {Name: "session_id", Value: "abc123"},
        {Name: "user_pref", Value: "dark_mode"},
        {Name: "lang", Value: "en"},
    }),
)

// 3. Строка Cookie (можно скопировать прямо из DevTools браузера)
result, err = client.Get("https://httpbin.org/cookies",
    httpc.WithCookieString("cookie1=value1; cookie2=value2"),
)

// 4. Cookie map
result, err = client.Get("https://httpbin.org/cookies",
    httpc.WithCookieMap(map[string]string{
        "theme": "dark",
        "lang":  "en",
    }),
)

// 5. Комбинирование нескольких способов
result, err = client.Get("https://httpbin.org/cookies",
    httpc.WithCookieString("session=abc123"),
    httpc.WithCookie(http.Cookie{Name: "manual", Value: "cookie"}),
)
```

### Чтение Cookie ответа и автоматическое управление

```go
result, _ := client.Get("https://httpbin.org/response-headers?Set-Cookie=session=abc123")

fmt.Println(len(result.Response.Cookies))       // Пример вывода: 1 (число Cookie в ответе)
if c := result.GetCookie("session"); c != nil { // точный поиск по имени
    fmt.Println(c.Value) // Вывод: abc123
}
fmt.Println(result.HasCookie("nonexistent")) // Вывод: false

// Автоматическое управление между запросами: при включённом Cookie Jar Cookie из ответа
// автоматически сохраняются и отправляются в последующих запросах
cfg := httpc.DefaultConfig()
cfg.Connection.EnableCookies = true
jarClient, _ := httpc.New(cfg)
defer jarClient.Close()

_, _ = jarClient.Get("https://httpbin.org/cookies/set?session=xyz789") // Cookie сохраняются в Jar
resp, _ := jarClient.Get("https://httpbin.org/cookies")                 // и отправляются автоматически
fmt.Println(resp.StatusCode()) // Вывод: 200
```

Cookie уровня сессии и проверки безопасности (`WithSecureCookie` + `StrictCookieSecurityConfig`) подробно рассматриваются в руководстве [Доменный клиент и сессии](../guides/domain-session).

## Автономная сессия SessionManager

Сессия (постоянные заголовки + Cookie) не привязана к доменному клиенту: её можно создать независимо и подключить к любому запросу. Подходит для сценариев «несколько удостоверений одного сервиса» или «ручная сборка параметров запроса»:

```go
package main

import (
    "fmt"
    "log"
    "net/http"

    "github.com/cybergodev/httpc"
)

func main() {
    session, err := httpc.NewSessionManagerDefault()
    if err != nil {
        log.Fatal(err)
    }

    // Постоянные заголовки: применяются ко всем запросам, идущим через эту сессию
    if err := session.SetHeader("Authorization", "Bearer my-token"); err != nil {
        log.Fatal(err)
    }
    if err := session.SetHeaders(map[string]string{
        "X-API-Version": "v2",
        "X-Client-ID":   "session-demo",
    }); err != nil {
        log.Fatal(err)
    }

    // Постоянные Cookie
    if err := session.SetCookies([]*http.Cookie{
        {Name: "session_id", Value: "abc123"},
        {Name: "preferences", Value: "theme_dark"},
    }); err != nil {
        log.Fatal(err)
    }

    fmt.Println("Заголовков сессии:", len(session.GetHeaders()))   // Вывод: Заголовков сессии: 3
    fmt.Println("Cookie сессии:", len(session.GetCookies())) // Вывод: Cookie сессии: 2

    if c := session.GetCookie("session_id"); c != nil {
        fmt.Printf("Найден Cookie: %s = %s\n", c.Name, c.Value) // Вывод: Найден Cookie: session_id = abc123
    }

    // Выборочное удаление и полная очистка
    session.DeleteHeader("X-API-Version")
    session.DeleteCookie("preferences")
    fmt.Println("После удаления заголовки/Cookie:", len(session.GetHeaders()), "/", len(session.GetCookies()))
    // Вывод: После удаления заголовки/Cookie: 2 / 1

    session.ClearHeaders()
    session.ClearCookies()
    fmt.Println("После очистки заголовки/Cookie:", len(session.GetHeaders()), "/", len(session.GetCookies()))
    // Вывод: После очистки заголовки/Cookie: 0 / 0
}
```

## Параллельное скачивание

```go
package main

import (
    "context"
    "fmt"
    "log"
    "sync"
    "sync/atomic"

    "github.com/cybergodev/httpc"
)

func main() {
    urls := map[string]string{
        "file1.zip": "https://example.com/files/file1.zip",
        "file2.zip": "https://example.com/files/file2.zip",
        "file3.zip": "https://example.com/files/file3.zip",
    }

    client, _ := httpc.NewDefault()
    defer client.Close()

    var successCount int64
    var totalBytes int64
    var wg sync.WaitGroup

    for filename, url := range urls {
        wg.Add(1)
        go func(name, u string) {
            defer wg.Done()

            cfg := httpc.DefaultDownloadConfig()
            cfg.FilePath = "/tmp/" + name
            cfg.Overwrite = true
            cfg.ProgressCallback = func(downloaded, total int64, speed float64) {
                fmt.Printf("\r%s: %.1f%% (%s/s)", name,
                    float64(downloaded)/float64(total)*100,
                    float64(speed)/1024/1024)
            }

            result, err := client.Download(context.Background(), u, cfg)
            if err != nil {
                log.Printf("%s: ошибка скачивания: %v", name, err)
                return
            }

            atomic.AddInt64(&successCount, 1)
            atomic.AddInt64(&totalBytes, result.BytesWritten)
            fmt.Printf("\n%s завершён: %d\n", name, result.BytesWritten)
        }(filename, url)
    }

    wg.Wait()
    fmt.Printf("\nСкачивание завершено: %d/%d, всего %d\n",
        successCount, len(urls), totalBytes)
}
```

## Параллельные запросы: worker pool и семафор

При массовом запросе большого числа URL worker pool фиксирует степень параллелизма на числе воркеров; семафорная схема позволяет задачам динамически масштабироваться, ограничивая при этом максимум одновременно выполняемых. Обе схемы используют один общий `Client` (Client в HTTPC безопасен для конкурентного доступа, пул соединений переиспользуется между goroutine):

```go
package main

import (
    "fmt"
    "log"
    "net/http"
    "net/http/httptest"
    "sync"
    "sync/atomic"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    // Локальный имитационный сервер: каждый запрос занимает 20ms
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        time.Sleep(20 * time.Millisecond)
        w.WriteHeader(http.StatusOK)
    }))
    defer server.Close()

    cfg := httpc.DefaultConfig()
    cfg.Security.AllowPrivateIPs = true // разрешаем локальный сервер 127.0.0.1
    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    const (
        numWorkers = 5
        numJobs    = 20
    )

    jobs := make(chan string, numJobs)
    results := make(chan int, numJobs)

    // Фиксированное число воркеров потребляет задачи: параллелизм всегда равен numWorkers
    var wg sync.WaitGroup
    for w := 0; w < numWorkers; w++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for url := range jobs {
                resp, err := client.Get(url)
                if err != nil {
                    log.Printf("Ошибка запроса: %v", err)
                    results <- 0
                    continue
                }
                results <- resp.StatusCode()
            }
        }()
    }

    start := time.Now()
    for i := 0; i < numJobs; i++ {
        jobs <- fmt.Sprintf("%s/api/item/%d", server.URL, i)
    }
    close(jobs)
    wg.Wait()
    close(results)

    var okCount int64
    for status := range results {
        if status >= 200 && status < 300 {
            okCount++
        }
    }
    fmt.Printf("worker pool: %d/%d успешно, время %v (последовательно потребовалось бы ~%v)\n",
        okCount, numJobs, time.Since(start), numJobs*20*time.Millisecond)
    // Пример вывода: worker pool: 20/20 успешно, время ~90ms (последовательно ~400ms)

    // Семафорная схема: goroutine может быть много, но одновременно выполняемых запросов не больше maxInFlight
    const maxInFlight = 3
    sem := make(chan struct{}, maxInFlight)
    var wg2 sync.WaitGroup
    var okCount2 int64
    start = time.Now()

    for i := 0; i < numJobs; i++ {
        wg2.Add(1)
        go func(id int) {
            defer wg2.Done()
            sem <- struct{}{}
            defer func() { <-sem }()

            resp, err := client.Get(fmt.Sprintf("%s/api/request/%d", server.URL, id))
            if err != nil {
                return
            }
            if resp.IsSuccess() {
                atomic.AddInt64(&okCount2, 1)
            }
        }(i)
    }
    wg2.Wait()
    fmt.Printf("Семафор: %d/%d успешно, время %v\n", okCount2, numJobs, time.Since(start))
    // Пример вывода: Семафор: 20/20 успешно, время ~140ms
}
```

:::tip Согласование параллелизма с пулом соединений
Число воркеров и предел семафора не должны длительно и значительно превышать `Connection.MaxConnsPerHost` (для HTTP/1.1), иначе запросы будут вставать в очередь на транспортном уровне и общая пропускная способность перестанет расти; при HTTP/2 (включён по умолчанию) соединения одного хоста мультиплексируются, влияние меньше. Подробнее — в руководстве [Оптимизация производительности](../guides/performance).
:::

## Структурированная обработка ошибок

`ClientError` несёт классификацию (`Code()`/`Type`), повторяемость (`IsRetryable()`) и контекст запроса (URL/Method/Attempts/StatusCode); извлечённый через `errors.As`, он позволяет разветвлять обработку по категориям:

```go
package main

import (
    "context"
    "errors"
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // Таймаут в 1 наносекунду: надёжно вызывает ошибку таймаута для демонстрации
    _, err = client.Get("https://httpbin.org/get",
        httpc.WithTimeout(1*time.Nanosecond),
    )
    if err == nil {
        log.Fatal("expected timeout error")
    }

    // errors.Is: сопоставление сигнальных ошибок (ошибки context пробрасываются через Unwrap)
    switch {
    case errors.Is(err, context.DeadlineExceeded):
        fmt.Println("Таймаут запроса: увеличьте лимит или проверьте сеть")
    case errors.Is(err, context.Canceled):
        fmt.Println("Запрос отменён")
    }

    // errors.As: извлечение структурированной ошибки
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        fmt.Println("Code:", clientErr.Code())            // Вывод: Code: TIMEOUT
        fmt.Println("Method:", clientErr.Method)          // Вывод: Method: GET
        fmt.Println("Attempts:", clientErr.Attempts)      // Вывод: Attempts: 1
        fmt.Println("Retryable:", clientErr.IsRetryable()) // Вывод: Retryable: false

        switch clientErr.Code() {
        case "TIMEOUT":
            fmt.Println("→ Ветка: таймаут, можно повторить с большим бюджетом")
        case "NETWORK_ERROR", "DNS_ERROR":
            fmt.Println("→ Ветка: сбой сети/DNS, проверьте связность")
        case "TLS_ERROR", "CERTIFICATE":
            fmt.Println("→ Ветка: проблема с сертификатом, проверьте CA и системное время")
        case "RETRY_EXHAUSTED":
            fmt.Println("→ Ветка: повторы исчерпаны, переходим к деградации")
        }
    }
}
```

Ошибки кодов статуса HTTP (ответы 4xx/5xx классифицируются как `HTTP_ERROR`) также несут `clientErr.StatusCode`; поле `Cause` сохраняет исходную ошибку для дальнейшего погружения через `errors.Unwrap`. Полная таблица классификации ошибок — в руководствах [Обработка ошибок](../guides/error-handling) и [Типы ошибок](../api-reference/types/errors).

## Сохранение ответа на диск: SaveToFile и Download

Если тело ответа уже в памяти, `SaveToFile` записывает его на диск одной строкой; для больших файлов `Download` выполняет потоковую запись на диск с поддержкой прогресса, докачки и проверки:

```go
package main

import (
    "context"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // Тело ответа уже в памяти: запись напрямую (путь проходит те же проверки безопасности, что и в Download)
    result, err := client.Get("https://httpbin.org/get")
    if err != nil {
        log.Fatal(err)
    }
    if err := result.SaveToFile("response.json"); err != nil {
        log.Fatal(err)
    }

    // Большой файл: потоковая запись Download + проверка SHA-256 (при несовпадении файл удаляется автоматически)
    cfg := httpc.DefaultDownloadConfig()
    cfg.FilePath = "large-file.bin"
    cfg.Overwrite = true
    cfg.Checksum = "SHA-256 hex из доверенного источника, например манифеста релиза"

    if _, err := client.Download(
        context.Background(), // передавайте Background, если отмена/таймаут не нужны; nil не передавайте
        "https://example.com/large-file.bin",
        cfg,
    ); err != nil {
        log.Fatal(err)
    }
    log.Println("Запись на диск завершена")
}
```

## Управление клиентом по умолчанию

За функциями уровня пакета (`httpc.Get` и др.) стоит лениво инициализируемый общий клиент по умолчанию; `SetDefaultClient` позволяет заменить его экземпляром с пользовательской конфигурацией (старый экземпляр закрывается автоматически), чтобы все глобальные вызовы шли с новой конфигурацией:

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    // Отталкивайтесь от конфигурации по умолчанию, меняя только нужные поля
    cfg := httpc.DefaultConfig()
    cfg.Timeouts.Request = 5 * time.Second
    cfg.Retry.MaxRetries = 0

    customClient, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }

    // Назначаем клиентом по умолчанию: после этого все функции пакета
    // используют новую конфигурацию (старый клиент по умолчанию закрывается автоматически)
    if err := httpc.SetDefaultClient(customClient); err != nil {
        log.Fatal(err)
    }

    result, err := httpc.Get("https://httpbin.org/get") // используется таймаут 5s и 0 повторов
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(result.StatusCode()) // Вывод: 200

    // Завершение: закрываем клиент по умолчанию и освобождаем пул соединений
    if err := httpc.CloseDefaultClient(); err != nil {
        log.Fatal(err)
    }
}
```

Сценарии применения: единая настройка глобального поведения при старте приложения, переключение конфигурации по окружению (разработка/продакшен). Учтите, что `SetDefaultClient` принимает только клиенты, созданные через `httpc.New`, и не допускает уже закрытые экземпляры.

## Пользовательское промежуточное ПО: подпись запросов

```go
package main

import (
    "context"
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func SigningMiddleware(secret string) httpc.MiddlewareFunc {
    return func(next httpc.Handler) httpc.Handler {
        return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
            timestamp := time.Now().Unix()
            message := fmt.Sprintf("%s%s%d", req.Method(), req.URL(), timestamp)

            mac := hmac.New(sha256.New, []byte(secret))
            mac.Write([]byte(message))
            signature := hex.EncodeToString(mac.Sum(nil))

            req.SetHeader("X-Timestamp", fmt.Sprintf("%d", timestamp))
            req.SetHeader("X-Signature", signature)

            return next(ctx, req)
        }
    }
}

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
        httpc.RecoveryMiddleware(),
        SigningMiddleware("my-secret-key"),
    }

    client, _ := httpc.New(cfg)
    defer client.Close()

    result, err := client.Get("https://api.example.com/protected")
    if err != nil {
        log.Fatal(err)
    }
    log.Println(result.StatusCode())
}
```

## Что дальше

- [Цепочки промежуточного ПО](../guides/middleware-chain) - подробный разбор архитектуры промежуточного ПО
- [Повторные попытки и отказоустойчивость](../guides/retry-fault-tolerance) - пользовательские стратегии повторов
- [Доменный клиент и сессии](../guides/domain-session) - глубокое погружение в сессии и Cookie
- [Загрузка и скачивание файлов](../guides/file-transfer) - семантика скачивания и контрольные суммы
- [Оптимизация производительности](../guides/performance) - модель конкурентности и настройка производительности
- [Руководство по тестированию](../guides/testing) - httptest и имитация Doer
