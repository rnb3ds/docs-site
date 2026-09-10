---
sidebar_label: "Практическое руководство"
title: "Практическое руководство - CyberGo HTTPC | GitHub API с нуля"
description: "Клиент GitHub API на HTTPC: пакетные функции и клиент по умолчанию, пресеты конфигурации, доменный клиент NewDomain, промежуточное ПО, ошибки ClientError."
sidebar_position: 1
---

# Практическое руководство: создание клиента GitHub API

Следующие примеры используют GitHub API для демонстрации основных возможностей HTTPC. Каждый пример независим и может рассматриваться отдельно.

**Вы научитесь:**

- Созданию клиента и пресетов конфигурации
- Взаимосвязи функций пакета и клиента по умолчанию
- Жизненному циклу экземпляра клиента и его настройкам по умолчанию
- Отправке GET/POST-запросов и обработке JSON-ответов
- Параметрам запроса и распространённым опциям
- Использованию доменного клиента для управления базовым URL API
- Добавлению промежуточного ПО для логирования и метрик
- Обработке ошибок и повторных попыток
- Объекту ответа Result и автоматическому управлению

## Базовый запрос

Установите зависимость и создайте `main.go`:

```bash
go get github.com/cybergodev/httpc
```

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    result, err := httpc.Get("https://api.github.com/repos/golang/go")
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println(result.StatusCode()) // 200
    fmt.Println(result.Body())       // JSON-ответ
}
```

Ключевые моменты:
- Функция пакета `httpc.Get` не требует создания клиента — подходит для быстрой проверки
- Result создаётся заново для каждого запроса и утилизируется GC автоматически, ручное освобождение не требуется

### Функции пакета и клиент по умолчанию

Функции пакета (`Get`/`Post`/`Request` и др.) отправляют запросы не изолированно друг от друга — они разделяют **лениво инициализируемый клиент по умолчанию**: при первом вызове создаётся единственный экземпляр, и все последующие вызовы пакета его переиспользуют. Если клиент по умолчанию был закрыт, он «самовосстанавливается» — следующий вызов пакета автоматически пересоздаёт его.

Управление этим клиентом по умолчанию можно перехватить:

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    // Настраиваем конфигурацию и назначаем её клиентом по умолчанию
    // (прежний клиент по умолчанию закрывается автоматически)
    cfg := httpc.DefaultConfig()
    cfg.Timeouts.Request = 30 * time.Second
    cfg.Retry.MaxRetries = 2

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    if err := httpc.SetDefaultClient(client); err != nil {
        log.Fatal(err)
    }

    // Все последующие функции пакета используют этот клиент
    result, err := httpc.Get("https://api.github.com/repos/golang/go")
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(result.StatusCode()) // 200

    // Освобождаем клиент по умолчанию перед выходом
    if err := httpc.CloseDefaultClient(); err != nil {
        log.Fatal(err)
    }
}
```

:::tip
Для долгоживущих сервисов рекомендуется управлять жизненным циклом через явный клиент — см. ниже «Создание и настройка экземпляра клиента»; клиент по умолчанию лучше подходит для скриптов и разовых запросов.
:::

## Парсинг JSON-ответов

```go
type Repo struct {
    FullName    string `json:"full_name"`
    Description string `json:"description"`
    Stars       int    `json:"stargazers_count"`
    Language    string `json:"language"`
}

result, err := httpc.Get("https://api.github.com/repos/golang/go")
if err != nil {
    log.Fatal(err)
}

var repo Repo
if err := result.Unmarshal(&repo); err != nil {
    log.Fatal(err)
}

fmt.Printf("%s (⭐ %d)\n", repo.FullName, repo.Stars)
fmt.Printf("Язык: %s\n", repo.Language)
fmt.Printf("Описание: %s\n", repo.Description)
```

Ключевые моменты:
- `result.Unmarshal(&v)` напрямую разбирает JSON-ответ в структуру
- Определите Go-структуру, соответствующую ответу API
- При пустом теле ответа `Unmarshal` возвращает `ErrResponseBodyEmpty`, при превышении 50MB — `ErrResponseBodyTooLarge`

## Создание и настройка экземпляра клиента

За функциями пакета всегда стоит один клиент по умолчанию; чтобы управлять конфигурацией и жизненным циклом, создайте экземпляр явно через `New`:

```go
package main

import (
    "errors"
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Timeouts.Request = 30 * time.Second
    cfg.Timeouts.Dial = 5 * time.Second
    cfg.Retry.MaxRetries = 2

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err) // здесь возвращается ошибка валидации конфигурации (например, недопустимый таймаут)
    }
    defer client.Close()

    result, err := client.Get("https://api.github.com/repos/golang/go",
        httpc.WithUserAgent("my-github-app/1.0"),
    )
    if err != nil {
        if errors.Is(err, httpc.ErrClientClosed) {
            log.Fatal("Клиент закрыт:", err)
        }
        log.Fatal(err)
    }
    fmt.Println(result.StatusCode()) // 200
}
```

Ключевые моменты:
- `New(cfg)` сначала валидирует конфигурацию, затем делает её **глубокую копию** — изменение исходной переменной `cfg` после создания не влияет на поведение клиента
- `Close()` освобождает пул соединений и ресурсы транспортного уровня; запросы после закрытия возвращают `ErrClientClosed`
- Клиент безопасен для параллельного использования (см. ниже «Параллельные запросы») и должен **жить долго и переиспользоваться**, а не создаваться заново на каждый запрос
- `NewDefault()` эквивалентен `New(DefaultConfig())`

### Пресеты конфигурации

Писать конфигурацию с нуля каждый раз не нужно — HTTPC предлагает пять пресетов как отправную точку:

| Пресет | Назначение | Ключевые отличия от DefaultConfig |
|------|------|------|
| `DefaultConfig()` | Универсальные значения по умолчанию | Таймаут запроса 180s, 3 повтора, лимит ответа 10MB, следование перенаправлениям |
| `SecureConfig()` | Приоритет безопасности | Ужесточённые таймауты (запрос 15s, dial/TLS 5s), лимит ответа 5MB, следование перенаправлениям отключено, 1 повтор |
| `PerformanceConfig()` | Высокая пропускная способность | Увеличенный пул соединений (idle 100 / на хост 20), лимит ответа 50MB, задержка повторов 500ms, Cookie включены |
| `TestingConfig()` | Только тесты | Пропуск TLS-проверки, разрешение приватных IP, отключение валидации URL/заголовков (запрещено в продакшене; вызов вне тестовой среды печатает предупреждение) |
| `MinimalConfig()` | Разовые запросы | Без повторов, без следования перенаправлениям, лимит ответа 1MB, небольшой пул соединений |

Для URL, предоставленных пользователями, и в сценариях, чувствительных к безопасности, выбирайте `SecureConfig()`; для высокопараллельного сбора данных или работы с прокси — `PerformanceConfig()`.

### Обзор настроек по умолчанию

Ключевые значения по умолчанию `DefaultConfig()` (полный список полей — в [справочнике конфигурации](../api-reference/client-config/config)):

| Параметр | По умолчанию | Описание |
|--------|--------|------|
| `Timeouts.Request` | 180s | Общий таймаут запроса (покрывает все повторные попытки) |
| `Timeouts.Dial` / `Timeouts.TLSHandshake` | 10s / 10s | Таймаут TCP-соединения / TLS-рукопожатия |
| `Timeouts.IdleConn` | 90s | Время жизни неактивных соединений |
| `Connection.MaxIdleConns` / `MaxConnsPerHost` | 50 / 10 | Пул неактивных соединений / лимит соединений на хост |
| `Retry.MaxRetries` / `Delay` / `BackoffFactor` | 3 / 1s / 2.0 | Число повторов, начальная задержка, коэффициент роста (по умолчанию с джиттером, верхняя граница одной задержки 30s) |
| `Security.MaxResponseBodySize` | 10MB | Лимит размера тела ответа |
| `Security.MaxDecompressedBodySize` | 100MB | Лимит распакованного тела ответа |
| `Defaults.UserAgent` | `httpc/1.0` | User-Agent по умолчанию |
| `Defaults.FollowRedirects` / `MaxRedirects` | true / 10 | Политика следования перенаправлениям |

## Параметры запроса и опции

Опции запроса — это функции вида `With*`, которые можно свободно комбинировать; они применяются по порядку после URL:

```go
client, _ := httpc.NewDefault()
defer client.Close()

// Параметры запроса: по одному или массово через Map
result, err := client.Get("https://api.github.com/search/repositories",
    httpc.WithQuery("q", "language:go"),
    httpc.WithQuery("sort", "stars"),
    httpc.WithQueryMap(map[string]any{
        "order": "desc",
        "page":  1,
    }),
)

// Переопределение значений клиента по умолчанию для одного запроса: таймаут и повторы
result, err = client.Get("https://api.github.com/repos/golang/go",
    httpc.WithTimeout(10*time.Second),
    httpc.WithMaxRetries(1),
)
```

Ключевые моменты:
- Значения `WithQuery` поддерживают `string`, числа, `bool` и другие распространённые типы; при значении `nil` параметр **не** попадает в URL
- `WithTimeout` принимает значения 0–30 минут, отрицательные значения возвращают `ErrInvalidTimeout`; этот таймаут переопределяет `Timeouts.Request`
- `WithMaxRetries` принимает значения 0–10 и переопределяет `Retry.MaxRetries`
- Полный список опций — в [Параметрах запроса API](../api-reference/core/options); детали запросов и ответов — в [Запросах и ответах](./request-response)

## Создание доменного клиента

Все эндпоинты GitHub API находятся под `https://api.github.com`; используйте доменный клиент, чтобы не повторять URL:

```go
client, err := httpc.NewDomainDefault("https://api.github.com")
if err != nil {
    log.Fatal(err)
}
defer client.Close()

if err := client.SetHeader("Authorization", "Bearer "+os.Getenv("GITHUB_TOKEN")); err != nil {
    log.Fatal(err)
}

// Путь запроса относителен к baseURL
result, err := client.Get("/repos/golang/go",
    httpc.WithHeader("Accept", "application/vnd.github+json"),
)
if err != nil {
    log.Fatal(err)
}
```

Ключевые моменты:
- `NewDomain` создаёт клиент с областью действия на домен, пути разрешаются относительно baseURL
- `SetHeader` устанавливает постоянный заголовок, автоматически добавляемый к каждому запросу
- `WithHeader` как опция запроса действует только на текущий запрос
- Доменный клиент автоматически управляет Cookie

## Отправка данных (создание Issue)

```go
type CreateIssueRequest struct {
    Title string `json:"title"`
    Body  string `json:"body"`
}

newIssue := CreateIssueRequest{
    Title: "Bug report",
    Body:  "Found a bug in the API response",
}

result, err := client.Post("/repos/owner/repo/issues",
    httpc.WithJSON(newIssue),
)
if err != nil {
    log.Fatal(err)
}

if !result.IsSuccess() {
    log.Fatalf("Ошибка создания: %d %s", result.StatusCode(), result.Body())
}

var created struct {
    Number int    `json:"number"`
    URL    string `json:"html_url"`
}
result.Unmarshal(&created)
fmt.Printf("Issue #%d создан: %s\n", created.Number, created.URL)
```

Ключевые моменты:
- `WithJSON(data)` автоматически сериализует данные и устанавливает Content-Type
- `result.IsSuccess()` проверяет код состояния 2xx

## Добавление промежуточного ПО

Добавьте клиенту логирование и Request ID:

```go
// Настройка промежуточного ПО
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: func(format string, args ...any) {
        log.Printf("[HTTP] "+format, args...)
    }}),
    httpc.RecoveryMiddleware(),
    httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),
}

// Передаём конфигурацию в NewDomain — создаём доменный клиент с промежуточным ПО
client, err := httpc.NewDomain("https://api.github.com", cfg)
if err != nil {
    log.Fatal(err)
}
defer client.Close()

if err := client.SetHeader("Authorization", "Bearer "+os.Getenv("GITHUB_TOKEN")); err != nil {
    log.Fatal(err)
}

result, err := client.Get("/repos/golang/go",
    httpc.WithHeader("Accept", "application/vnd.github+json"),
)
if err != nil {
    log.Fatal(err)
}

var repo Repo
result.Unmarshal(&repo)
fmt.Printf("%s: ⭐ %d\n", repo.FullName, repo.Stars)
```

Ключевые моменты:
- Промежуточное ПО настраивается в `MiddlewareConfig.Middlewares`
- `LoggingMiddleware` записывает логи запросов
- `RecoveryMiddleware` защищает от падения процесса при panic
- `RequestIDMiddleware` генерирует уникальный ID для каждого запроса

## Обработка ошибок и повторные попытки

```go
result, err := client.Get("/repos/golang/go")
if err != nil {
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        switch clientErr.Type {
        case httpc.ErrorTypeTimeout:
            log.Println("Таймаут запроса, попробуйте позже")
        case httpc.ErrorTypeNetwork:
            log.Println("Сетевая ошибка")
        case httpc.ErrorTypeTLS:
            log.Println("Ошибка TLS")
        default:
            log.Printf("HTTP-ошибка: %s", clientErr.Error())
        }

        if clientErr.IsRetryable() {
            log.Println("Эта ошибка может быть повторена автоматически")
        }
    }
    return
}

// Обработка HTTP-кодов состояния
switch {
case result.IsSuccess():
    // 2xx успешно
case result.StatusCode() == 401:
    log.Println("Token истёк или недействителен")
case result.IsClientError():
    log.Printf("Ошибка клиента: %d", result.StatusCode())
case result.IsServerError():
    log.Printf("Ошибка сервера: %d (всего попыток: %d, включая первую)",
        result.StatusCode(), result.Meta.Attempts)
}
```

Настройка стратегии повторных попыток:

```go
cfg := httpc.DefaultConfig()
cfg.Retry.MaxRetries = 5
cfg.Retry.Delay = 2 * time.Second
cfg.Retry.BackoffFactor = 2.0
cfg.Retry.EnableJitter = true
```

Ключевые моменты:
- HTTPC раздельно обрабатывает сетевые ошибки и HTTP-коды состояния
- `ClientError` даёт классификацию ошибок и признак повторяемости
- По умолчанию автоматически повторяются 408, 429, 500, 502, 503, 504
- `Timeouts.Request` — это **общий бюджет на все повторы**, а не таймаут одной попытки

## Загрузка файлов (скачивание релиза)

```go
dlCfg := httpc.DefaultDownloadConfig()
dlCfg.FilePath = "go1.22.0.linux-amd64.tar.gz"
dlCfg.Overwrite = true
dlCfg.ProgressCallback = func(downloaded, total int64, speed float64) {
    pct := float64(downloaded) / float64(total) * 100
    fmt.Printf("\rПрогресс загрузки: %.1f%% (%.2f MB/s)", pct, float64(speed)/1024/1024)
}

result, err := client.Download(
    context.Background(),
    "https://go.dev/dl/go1.22.0.linux-amd64.tar.gz",
    dlCfg,
)
if err != nil {
    log.Fatal(err)
}

fmt.Printf("\nЗагрузка завершена: %s (%d bytes)\n",
    result.FilePath,
    result.BytesWritten,
)
```

## Параллельные запросы

Одновременное получение информации о нескольких репозиториях:

```go
func fetchRepos(ctx context.Context, repos []string) error {
    client, err := httpc.New(httpc.PerformanceConfig())
    if err != nil {
        return err
    }
    defer client.Close()

    results := make([]*httpc.Result, len(repos))
    errs := make([]error, len(repos))

    var wg sync.WaitGroup
    for i, name := range repos {
        wg.Add(1)
        go func(idx int, repo string) {
            defer wg.Done()
            r, err := client.Request(ctx, "GET", fmt.Sprintf("https://api.github.com/repos/%s", repo))
            results[idx] = r
            errs[idx] = err
        }(i, name)
    }
    wg.Wait()

    for i, err := range errs {
        if err != nil {
            return err
        }

        var repo Repo
        results[i].Unmarshal(&repo)
        fmt.Printf("%s: ⭐ %d\n", repo.FullName, repo.Stars)
    }
    return nil
}
```

:::tip
`PerformanceConfig()` даёт конфигурацию с большим пулом соединений, подходящую для высокопараллельных сценариев. Result создаётся заново на каждый запрос и утилизируется GC автоматически.
:::

## Полный пример

Полный код, объединяющий примеры выше:

```go
package main

import (
    "errors"
    "fmt"
    "log"
    "os"
    "time"

    "github.com/cybergodev/httpc"
)

type Repo struct {
    FullName    string `json:"full_name"`
    Description string `json:"description"`
    Stars       int    `json:"stargazers_count"`
    Language    string `json:"language"`
}

func main() {
    token := os.Getenv("GITHUB_TOKEN")

    cfg := httpc.DefaultConfig()
    cfg.Retry.MaxRetries = 3
    cfg.Retry.Delay = 1 * time.Second
    cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
        httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: func(format string, args ...any) {
            log.Printf("[HTTP] "+format, args...)
        }}),
        httpc.RecoveryMiddleware(),
    }

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // Получение информации о репозитории
    result, err := client.Get("https://api.github.com/repos/golang/go",
        httpc.WithHeader("Authorization", "Bearer "+token),
    )
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) && clientErr.IsRetryable() {
            log.Fatal("Запрос не удался (после повторных попыток):", err)
        }
        log.Fatal(err)
    }

    if result.IsSuccess() {
        var repo Repo
        result.Unmarshal(&repo)
        fmt.Printf("✅ %s\n", repo.FullName)
        fmt.Printf("   ⭐ %d | Язык: %s\n", repo.Stars, repo.Language)
        fmt.Printf("   %s\n", repo.Description)
        fmt.Printf("   Время: %s (всего попыток: %d, включая первую)\n",
            result.Meta.Duration, result.Meta.Attempts)
    }
}
```

## Что дальше

- [Запросы и ответы](./request-response) — полный справочник опций запроса
- [Цепочки промежуточного ПО](./middleware-chain) — разработка собственного промежуточного ПО
- [Повторные попытки и отказоустойчивость](./retry-fault-tolerance) — продвинутые стратегии повторов
- [Доменный клиент и сессии](./domain-session) — управление состоянием сессии
- [Оптимизация производительности](./performance) — настройка для продакшена
- [Справочник конфигурации](../api-reference/client-config/config) — все поля конфигурации и пресеты
- [Контрольный список для продакшена](../security/production-checklist) — лучшие практики безопасности
