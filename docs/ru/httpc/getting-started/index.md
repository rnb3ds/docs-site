---
sidebar_label: "Быстрый старт"
title: "Быстрый старт - CyberGo HTTPC | Начало за 5 минут"
description: "Руководство быстрого старта HTTPC: установка go get, GET/POST-запросы, пресеты конфигурации, парсинг JSON, Bearer-токен и ошибки ClientError за пять минут."
sidebar_position: 1
---

# Быстрый старт

## Установка

```bash
# 1. Создание проекта и инициализация Go-модуля (существующий проект пропустите)
mkdir httpc-demo && cd httpc-demo
go mod init example.com/httpc-demo

# 2. Добавление зависимости
go get github.com/cybergodev/httpc
```

Импорт в коде:

```go
import "github.com/cybergodev/httpc"
```

HTTPC требует Go 1.25 и выше; кроме `golang.org/x/sys` нет других сторонних зависимостей — первый запрос можно отправить без какой-либо настройки.

## Базовый запрос

Клиент создавать не нужно — используйте функции пакета напрямую:

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
    fmt.Println(result.Body())       // содержимое ответа
}
```

Поддерживаемые HTTP-методы: `Get`, `Post`, `Put`, `Patch`, `Delete`, `Head`, `Options`.

### Что происходит

- Функции пакета внутри используют **лениво инициализируемый общий клиент по умолчанию** — создаётся при первом вызове, затем переиспользуется, безопасен для конкурентного доступа;
- возвращаемое `*Result` агрегирует код состояния, заголовки и тело ответа, а также метаданные запроса (длительность, число попыток, цепочку перенаправлений);
- `err != nil` означает только **ошибку сетевого уровня** (сбой соединения, таймаут, ошибка TLS и т.п.); коды 4xx/5xx нужно проверять самостоятельно методами вроде `result.IsSuccess()`;
- конфигурация по умолчанию уже включает TLS 1.2+, защиту от SSRF, лимит тела ответа 10MB и до 3 интеллектуальных повторов — дополнительная настройка не нужна.

## Создание клиента

Когда нужна пользовательская конфигурация, создайте экземпляр клиента:

```go
client, err := httpc.NewDefault()
if err != nil {
    log.Fatal(err)
}
defer client.Close()

result, err := client.Get("https://httpbin.org/get")
```

Клиент держит пул соединений и другие ресурсы — не забывайте вызывать `Close()` после работы. Долго живущие сервисы обычно создают клиента один раз на время жизни процесса и делят его глобально — `Client` безопасен для конкурентного доступа, создавать его на каждый запрос или goroutine не нужно.

### Пресеты конфигурации

| Конфигурация | Назначение | Особенности |
|------|------|------|
| `DefaultConfig()` | Универсальные сценарии | Безопасные значения по умолчанию, SSRF-защита включена |
| `SecureConfig()` | Сценарии с высокими требованиями к безопасности | Автоматические перенаправления отключены, строгие таймауты |
| `PerformanceConfig()` | Высокая пропускная способность | Большой пул соединений, длинные таймауты, Cookie включены |
| `TestingConfig()` | Тестовая среда | Проверки безопасности и HTTP/2 отключены, Cookie включены |
| `MinimalConfig()` | Лёгкие запросы | Без повторов, без перенаправлений |

```go
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 60 * time.Second

client, err := httpc.New(cfg)
```

Можно также задать значения по умолчанию, действующие для всех запросов (User-Agent, стандартные заголовки, политика перенаправлений):

```go
cfg := httpc.DefaultConfig()
cfg.Defaults.UserAgent = "myapp/2.0"
cfg.Defaults.Headers["Authorization"] = "Bearer " + token
cfg.Defaults.FollowRedirects = false

client, err := httpc.New(cfg)
```

## Обработка ответа

```go
result, err := client.Get("https://httpbin.org/json")
if err != nil {
    log.Fatal(err)
}

// Проверка статуса
result.StatusCode()     // 200
result.IsSuccess()      // true (2xx)
result.IsClientError()  // false (4xx)
result.IsServerError()  // false (5xx)

// Парсинг JSON
var data map[string]any
if err := result.Unmarshal(&data); err != nil {
    log.Fatal(err)
}
```

Парсинг в пользовательскую структуру:

```go
var repo struct {
    Name  string `json:"name"`
    Stars int    `json:"stargazers_count"`
}
if err := result.Unmarshal(&repo); err != nil {
    log.Fatal(err)
}
```

Просмотр метаданных запроса:

```go
result.Meta.Duration       // Общая длительность (включая ожидание между повторами)
result.Meta.Attempts       // Число попыток (первая + повторы)
result.Meta.RedirectChain  // Цепочка URL пройденных перенаправлений
result.Meta.ProxyURL       // Прокси этого запроса (пусто при прямом соединении или системном прокси)
```

:::tip Подсказка
`Unmarshal` возвращает `ErrResponseBodyEmpty` при пустом теле ответа и `ErrResponseBodyTooLarge` при превышении 50MB.
:::

## Отправка данных

```go
// JSON
result, err := client.Post("https://httpbin.org/post",
    httpc.WithJSON(map[string]any{"name": "test"}),
)
```

```go
// Форма
result, err := client.Post("https://httpbin.org/post",
    httpc.WithForm(map[string]string{"username": "admin"}),
)
```

```go
// С аутентификацией
result, err := client.Get("https://api.example.com/data",
    httpc.WithBearerToken("my-token"),
)
```

```go
// Параметры строки запроса
result, err := client.Get("https://httpbin.org/get",
    httpc.WithQuery("page", 1),
    httpc.WithQueryMap(map[string]any{"limit": 10, "sort": "desc"}),
)
```

```go
// Загрузка файла (multipart/form-data)
result, err := client.Post("https://httpbin.org/post",
    httpc.WithFile("file", "report.pdf", fileBytes),
)
```

## Обработка ошибок

HTTPC различает **ошибки сетевого уровня** и **HTTP-коды состояния**:

```go
result, err := client.Get("https://api.example.com/data")
if err != nil {
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        log.Printf("Код ошибки: %s", clientErr.Code())
    }
    log.Fatal(err)
}

// HTTP-коды состояния нужно проверять вручную
switch {
case result.IsSuccess():
    // 2xx — успех
case result.IsClientError():
    log.Printf("Ошибка клиента: %d", result.StatusCode())
case result.IsServerError():
    log.Printf("Ошибка сервера: %d", result.StatusCode())
}
```

:::tip Подсказка
Коды 4xx/5xx не возвращаются как `error` — проверяйте их методами вроде `result.IsSuccess()`. Подробнее см. [Обработка ошибок](../guides/error-handling).
:::

## Первая полная программа

Ниже полный пример, готовый к `go run`: запрос к GitHub API за информацией о репозитории, охватывающий создание клиента, установку заголовков, контроль таймаута, проверку статуса и парсинг JSON:

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

// Repo соответствует ответу репозитория GitHub API
type Repo struct {
    Name        string `json:"name"`
    Description string `json:"description"`
    Stars       int    `json:"stargazers_count"`
}

func main() {
    // 1. Создание клиента (конфигурация по умолчанию: TLS 1.2+, SSRF-защита, до 3 повторов)
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // 2. Отправка запроса: заголовки по умолчанию + таймаут уровня запроса
    result, err := client.Get("https://api.github.com/repos/golang/go",
        httpc.WithUserAgent("httpc-demo/1.0"),
        httpc.WithTimeout(15*time.Second),
    )
    if err != nil {
        log.Fatal(err) // Ошибка сетевого уровня (соединение/таймаут/TLS и т.п.)
    }

    // 3. Проверка HTTP-кода состояния (4xx/5xx — не error, проверять вручную)
    if !result.IsSuccess() {
        log.Fatalf("HTTP-ошибка: %d", result.StatusCode())
    }

    // 4. Парсинг JSON в структуру
    var repo Repo
    if err := result.Unmarshal(&repo); err != nil {
        log.Fatal(err)
    }

    fmt.Printf("%s: %s (%d звёзд)\n", repo.Name, repo.Description, repo.Stars)
    fmt.Printf("Длительность %v, попыток: %d\n", result.Meta.Duration, result.Meta.Attempts)
}
// Вывод (число звёзд и длительность меняются):
// go: The Go programming language (124000 звёзд)
// Длительность 350ms, попыток: 1
```

## Типичные сценарии первого шага

### Вызов JSON API (аутентификация + параметры запроса)

```go
result, err := client.Get("https://api.example.com/v1/issues",
    httpc.WithBearerToken(token),                                   // Bearer-аутентификация
    httpc.WithQueryMap(map[string]any{"state": "open", "page": 2}), // Параметры строки запроса
    httpc.WithHeader("Accept", "application/json"),
)
```

### Запрос с таймаутом и повторами

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
    cfg.Timeouts.Request = 30 * time.Second // Общий бюджет таймаута (включая все повторы)
    cfg.Retry.MaxRetries = 3                // Максимум 3 повторов (0 — отключить)
    cfg.Retry.Delay = time.Second           // Начальный откат 1s
    cfg.Retry.BackoffFactor = 2.0           // Откат ×2 каждый раз (1s → 2s → 4s)
    cfg.Retry.EnableJitter = true           // Джиттер во избежание эффекта thundering herd

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // Эндпоинт httpbin /status/503 всегда возвращает 503 (повторяемый статус)
    result, err := client.Get("https://httpbin.org/status/503")
    if err != nil {
        log.Fatal(err) // Ошибка сетевого уровня
    }

    // 503 — повторяемый статус: после исчерпания повторов возвращается последний ответ (не error)
    fmt.Println("Код состояния:", result.StatusCode())   // 503
    fmt.Println("Попыток:", result.Meta.Attempts)        // 4 (первая + 3 повтора)
}
// Вывод:
// Код состояния: 503
// Попыток: 4
```

### Обращение к локальным или внутренним сервисам

Конфигурация по умолчанию блокирует подключения к приватным/зарезервированным адресам вроде `127.0.0.1`, `10.x`, `192.168.x` (SSRF-защита). Для локальной отладки есть три способа открыть доступ:

```go
// Способ 1: исключение на уровне запроса (рекомендуется, минимальный радиус воздействия)
result, err := httpc.Get("http://localhost:8080/health",
    httpc.WithAllowPrivateIPs(true),
)

// Способ 2: точное исключение внутреннего CIDR (например, Tailscale, VPC)
cfg := httpc.DefaultConfig()
cfg.Security.SSRFExemptCIDRs = []string{"10.0.0.0/8"}
client, _ := httpc.New(cfg)

// Способ 3: тестовый пресет (только локальная разработка/тесты, не для продакшена)
client, _ = httpc.New(httpc.TestingConfig())
```

Подробнее см. [Защита от SSRF](../security/ssrf).

## Дальнейшие шаги

**Путь освоения**

- **[Основные концепции](./concepts)** — двухслойная архитектура, система конфигурации и жизненный цикл запроса
- **[Запросы и ответы](../guides/request-response)** — полный набор опций запроса и обработка ответа
- **[Миграция с net/http](../guides/migration)** — поэтапное отображение опыта стандартной библиотеки

**Углубление по темам**

- **[Повторные попытки и отказоустойчивость](../guides/retry-fault-tolerance)** — стратегия отката, пользовательские повторы и взаимодействие с пулом прокси
- **[Цепочки промежуточного ПО](../guides/middleware-chain)** — логирование, метрики, аудит и пользовательское middleware
- **[Пул соединений и DNS](../guides/connection-pool)** — настройка пула соединений и DoH
- **[Прокси и пул прокси](../guides/proxy)** — одиночный прокси, системный прокси, ротация пула и размыкатель
- **[Загрузка и скачивание файлов](../guides/file-transfer)** — скачивание, докачка и загрузка файлов
- **[Доменный клиент и сессии](../guides/domain-session)** — DomainClient и управление Cookie-сессиями
- **[Перенаправления](../guides/redirects)** — политика следования и белый список доменов
- **[Оптимизация производительности](../guides/performance)** — чеклист тюнинга и конфигурация под сценарии
- **[Руководство по тестированию](../guides/testing)** — TestingConfig и подходы к mock

**Дополнительные ресурсы**

- **[Практическое руководство](../guides/tutorial)** — клиент GitHub API за 30 минут
- **[Шпаргалка](./cheatsheet)** — быстрая справка по частым операциям
- **[Безопасность](../security/)** — лучшие практики безопасности и чеклист для продакшена
