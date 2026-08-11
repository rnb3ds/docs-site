---
sidebar_label: "Повторные попытки и отказоустойчивость"
title: "Повторные попытки и отказоустойчивость - CyberGo HTTPC | Откат и автоповторы"
description: "Руководство по повторным попыткам и отказоустойчивости HTTPC: стратегия экспоненциального отката по умолчанию и конфигурация RetryConfig, условия автоповтора 408/429/5xx, пользовательский интерфейс RetryPolicy, автоматический разбор заголовка ответа Retry-After, выбор стратегии отката и лучшие практики управления WithMaxRetries по запросу."
sidebar_position: 6
---

# Повторные попытки и отказоустойчивость

Сетевые запросы по своей природе ненадёжны — соединения могут обрываться, серверы могут временно перегружаться, разрешение DNS может завершиться таймаутом. HTTPC имеет встроенный интеллектуальный механизм повторов, автоматически обрабатывающий транзитные сбои, позволяя сосредоточиться на бизнес-логике.

## Повторы по умолчанию

Конфигурация повторов HTTPC по умолчанию тщательно настроена и работает «из коробки»:

```go
package main

import (
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Retry.MaxRetries = 3                  // Максимум 3 повтора
    cfg.Retry.Delay = 1 * time.Second         // Начальная задержка 1s
    cfg.Retry.BackoffFactor = 2.0             // Множитель экспоненциального отката 2x
    cfg.Retry.EnableJitter = true             // Включить джиттер
    cfg.Retry.MaxRetryDelay = 30 * time.Second // Верхний предел одной задержки

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://api.example.com/data")
    if err != nil {
        log.Fatal(err)
    }
    log.Printf("Успех: %d", result.StatusCode())
}
```

Последовательность задержек по умолчанию (без джиттера): `1s → 2s → 4s` (каждая умножается на `BackoffFactor`).

### Условия повторов

По умолчанию следующие ошибки запускают повтор:

| Условие | Повтор | Описание |
|---------|--------|----------|
| Сетевая ошибка (отказ соединения, сброс, EOF) | Да | `ErrorTypeNetwork` + повторяемый syscall/шаблон сообщения |
| Ошибка таймаута (установка, TLS, запрос) | Да | `ErrorTypeTimeout` |
| Повторяемый сбой DNS (временный/таймаут) | Да | `dnsErr.IsTemporary \|\| dnsErr.IsTimeout` |
| Сетевая ошибка чтения тела ответа | Да | `net.OpError` операции чтения |
| 408 Request Timeout | Да | `retryableStatusCodes` |
| 429 Too Many Requests | Да | совместно с заголовком `Retry-After` |
| 500 Internal Server Error | Да | `retryableStatusCodes` |
| 502 Bad Gateway | Да | `retryableStatusCodes` |
| 503 Service Unavailable | Да | `retryableStatusCodes` |
| 504 Gateway Timeout | Да | `retryableStatusCodes` |
| Другие 4xx ошибки клиента (400/401/403/404…) | Нет | Ошибка в запросе клиента, повторы бесполезны |
| `context.Canceled` | Нет | Возврат по быстрому пути |
| `context.DeadlineExceeded` | Нет | Возврат по быстрому пути |
| Ошибки TLS/сертификата | Нет | Не транзитный сбой, повторы бесполезны |
| Ошибка валидации конфигурации | Нет | Локальный баг, нужно исправить код |

## Математика отката — подробно

На примере значений по умолчанию (`Delay=1s`, `BackoffFactor=2.0`, `MaxRetryDelay=30s`, `EnableJitter=true`) расчёт задержки для каждой попытки:

### Расчёт базовой задержки

```
attempt 0: 1s × 2.0^0 = 1s
attempt 1: 1s × 2.0^1 = 2s
attempt 2: 1s × 2.0^2 = 4s
attempt 3: 1s × 2.0^3 = 8s   (при MaxRetries=3 сюда не дойдёт)
attempt 4: 1s × 2.0^4 = 16s
attempt 5: 1s × 2.0^5 = 32s → достигает предела, обрезается до 30s
```

### Применение лимита MaxRetryDelay

Задержки свыше 30s обрезаются: 32s для `attempt 5` → 30s.

### Применение джиттера (±10%)

Формула джиттера: `result = baseDelay ± 10%`, т.е. `result ∈ [baseDelay × 0.9, baseDelay × 1.1)`.

| Номер повтора | Базовая задержка | Диапазон с джиттером |
|---------------|-------------------|----------------------|
| 1-й повтор (attempt 0) | 1s | 0.9s ~ 1.1s |
| 2-й повтор (attempt 1) | 2s | 1.8s ~ 2.2s |
| 3-й повтор (attempt 2) | 4s | 3.6s ~ 4.4s |
| 4-й повтор (attempt 3) | 8s | 7.2s ~ 8.8s |
| 5-й повтор (attempt 4) | 16s | 14.4s ~ 17.6s |
| 6-й повтор (attempt 5) | 30s (после обрезки) | 27s ~ 33s |

:::tip Почему итеративное умножение вместо math.Pow
HTTPC использует циклическое умножение (`for i := 0; i < attempt; i++ { delay *= factor }`) вместо `math.Pow`. `math.Pow` вызывает трансцендентные функции (экспонента + логарифм), накладные расходы значительно выше нескольких умножений с плавающей точкой. Одновременно в цикле проверяется `math.IsInf` для предотвращения переполнения — при переполнении откат к `MaxRetryDelay`. На горячем пути повторов такая микрооптимизация оправдана.
:::

:::warning Джиттер применяется после лимита
Джиттер применяется **после** обрезки `MaxRetryDelay`. Поэтому фактический диапазон `attempt 5` — 27s~33s, что может превышать верхний предел 30s. Это осознанный выбор — цель джиттера разбросать тайминги повторов, лёгкое превышение предела безвредно, но гарантируется отсутствие значительных отклонений.
:::

## Автоматический разбор заголовка Retry-After

Когда сервер возвращает 429 (Too Many Requests) или 503 (Service Unavailable), обычно прилагается заголовок ответа `Retry-After`, указывающий клиенту, когда повторить. HTTPC автоматически разбирает этот заголовок, поддерживая два формата:

### Формат delta-seconds

Чистое целочисленное значение, означающее «повторить через N секунд»:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 120
```

### Формат HTTP-date

Дата RFC 1123, означающая «повторить в указанное время»:

```
HTTP/1.1 503 Service Unavailable
Retry-After: Fri, 31 Jul 2026 15:00:00 GMT
```

HTTPC поддерживает как стандартный RFC1123 (`Fri, 31 Jul 2026 15:00:00 GMT`), так и RFC1123Z с числовым часовым поясом (`Fri, 31 Jul 2026 15:00:00 +0800`).

### Безопасный предел 60 секунд

Какое бы значение ни указал сервер, HTTPC обрезает задержку `Retry-After` максимум до 60 секунд:

```
Retry-After: 120     →  обрезано до 60s (вместо ожидания 120s)
Retry-After: 3600    →  обрезано до 60s
Retry-After: Fri, 31 Jul 2026 15:00:00 GMT (через 2 часа) → обрезано до 60s
```

:::warning Зачем обрезать
Вредоносный или неправильно настроенный сервер может вернуть очень большое значение `Retry-After` (например, `Retry-After: 999999`), заставив клиента долго зависнуть. Предел 60 секунд — защитная мера: даже если сервер просит подождать 1 час, HTTPC повторит максимум через 60 секунд. Если у вашего сервиса разумная стратегия rate-limiting (например, 60 запросов в минуту), нормальные значения `Retry-After` обычно значительно меньше 60s и не затрагиваются.
:::

### Приоритет

Заголовок `Retry-After` имеет приоритет **выше** задержки экспоненциального отката. Когда сервер возвращает корректное значение `Retry-After`, оно используется напрямую (после обрезки), пропуская расчёт экспоненциального отката.

```go
package main

import (
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Retry.MaxRetries = 3
    // Задержка экспоненциального отката: 1s → 2s → 4s
    // Но если сервер вернёт Retry-After: 5, то 1-й повтор через 5s
    // (не превышает безопасный предел 60s)

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    start := time.Now()
    _, err = client.Get("https://api.example.com/rate-limited")
    elapsed := time.Since(start)

    if err != nil {
        log.Printf("Повторы исчерпаны, всего заняло %v: %v", elapsed, err)
    } else {
        log.Printf("Успех, всего заняло %v", elapsed)
    }
}
```

:::tip Retry-After действует для всех повторяемых кодов состояния
`Retry-After` не ограничивается 429/503, а действует для ответов со всеми повторяемыми кодами состояния (408/429/500/502/503/504). Пока заголовок ответа содержит `Retry-After`, он будет разобран и использован.
:::

## Стратегии отката

### Экспоненциальный откат (по умолчанию)

Наиболее распространённая стратегия — задержка растёт по множителю, быстро, но не слишком агрессивно:

<!-- check-code: skip -->
```go
cfg.Retry.BackoffFactor = 2.0
// Последовательность задержек: 1s → 2s → 4s → 8s → 16s → 30s (лимит)
```

### Мягкий экспоненциальный откат

`PerformanceConfig()` использует множитель 1.5 — более плавный рост, подходит для сценариев высокой пропускной способности:

<!-- check-code: skip -->
```go
cfg.Retry.BackoffFactor = 1.5
cfg.Retry.Delay = 500 * time.Millisecond
// Последовательность задержек: 0.5s → 0.75s → 1.125s → 1.6875s → ...
```

### Фиксированная задержка

Одинаковый интервал между повторами — подходит для сценариев с явно заданным интервалом:

<!-- check-code: skip -->
```go
cfg.Retry.BackoffFactor = 1.0
// Последовательность задержек: 1s → 1s → 1s → 1s ...
```

### Случайный джиттер

Включение джиттера добавляет ±10% случайное смещение к базовой задержке, предотвращая «эффект стада» — одновременный отказ нескольких клиентов с последующими одновременными повторами, вызывающими вторичную перегрузку:

<!-- check-code: skip -->
```go
cfg.Retry.EnableJitter = true
// Тайминги повторов 5 клиентов разбрасываются:
// Клиент A: повтор через 0.93s
// Клиент B: повтор через 1.07s
// Клиент C: повтор через 1.01s
// Клиент D: повтор через 0.96s
// Клиент E: повтор через 1.08s
```

:::tip Всегда включайте джиттер
За исключением тестовых сценариев (где нужна детерминированная задержка), в продакшене всегда следует включать `EnableJitter = true`. Это лучшая практика распределённых систем, значительно снижающая риск «бурь повторов».
:::

## Пользовательский RetryPolicy

Реализация интерфейса `RetryPolicy` даёт полный контроль над поведением повторов. Интерфейс определяет три метода:

<!-- check-code: skip -->
```go
type RetryPolicy interface {
    // Определяет, следует ли повторять. resp — ответ (nil означает ошибку запроса), err — ошибка
    ShouldRetry(resp ResponseReader, err error, attempt int) bool

    // Возвращает задержку перед следующим повтором
    GetDelay(attempt int) time.Duration

    // Возвращает максимальное число повторов
    MaxRetries() int
}
```

:::warning Ограничение внутреннего типа
Тип параметра `resp` метода `RetryPolicy.ShouldRetry` — `ResponseReader`, внутренний интерфейс (определён в пакете `internal/types`), на который нельзя ссылаться из внешних пакетов. Поэтому пользовательский `RetryPolicy` можно реализовать только внутри модуля `github.com/cybergodev/httpc`. В большинстве сценариев достаточно полей `RetryConfig` и конфигурации `ProxyRotateOnStatus` — пользовательская стратегия не требуется.
:::

Следующий пример демонстрирует пользовательскую стратегию повтора только для GET-запросов (компилируется только внутри модуля):

<!-- check-code: skip -->
```go
// Внимание: ResponseReader — внутренний тип (пакет internal/types).
// Этот код компилируется только внутри модуля github.com/cybergodev/httpc.
// Большинство пользователей должны настраивать повторы через RetryConfig и WithMaxRetries.

// GETOnlyRetryPolicy повторяет только GET-запросы и только при сетевых ошибках и 502/503/504
type GETOnlyRetryPolicy struct {
    maxAttempts int
}

func (p *GETOnlyRetryPolicy) ShouldRetry(resp ResponseReader, err error, attempt int) bool {
    if attempt >= p.maxAttempts {
        return false
    }
    // Повтор только для GET-запросов (косвенная оценка через err/resp — неидемпотерные операции не повторяются)
    if err != nil {
        return true // Сетевая ошибка — повтор
    }
    if resp == nil {
        return false
    }
    code := resp.StatusCode()
    return code == 502 || code == 503 || code == 504
}

func (p *GETOnlyRetryPolicy) GetDelay(attempt int) time.Duration {
    return time.Second * time.Duration(attempt+1) // Линейный рост: 1s, 2s, 3s...
}

func (p *GETOnlyRetryPolicy) MaxRetries() int {
    return p.maxAttempts
}

// Применение пользовательской стратегии
// cfg := httpc.DefaultConfig()
// cfg.Retry.CustomPolicy = &GETOnlyRetryPolicy{maxAttempts: 5}
```

## Управление на уровне запроса

Помимо конфигурации уровня клиента, можно переопределить число повторов для отдельного запроса через `WithMaxRetries`:

```go
package main

import (
    "context"
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

    // 5 повторов для одного запроса (переопределяет умолчание клиента — 3)
    _, err = client.Get("https://api.example.com/data", httpc.WithMaxRetries(5))
    if err != nil {
        log.Printf("Запрос не удался: %v", err)
    }

    // Отключить повторы (например, для неидемпотентного POST)
    _, err = client.Post("https://api.example.com/create",
        httpc.WithJSON(map[string]string{"name": "test"}),
        httpc.WithMaxRetries(0),
    )

    // Совместно с таймаутом context
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()
    _, err = client.Request(ctx, "GET", "https://api.example.com/data",
        httpc.WithMaxRetries(3),
    )
}
```

## Пул прокси и взаимодействие с повторами

При настройке `ProxyRotateOnStatus` или `ProxyRotatePerRequest` HTTPC автоматически повышает `MaxRetries`, гарантируя, что каждый прокси в пуле будет опробован хотя бы раз. Это реализовано через `calculateMaxRetries`:

```
эффективный MaxRetries = max(сконфигурированный MaxRetries, len(ProxyPool) - 1)
(лимит — maxRetryAttempts = 10)
```

**Пример**: 5 прокси, сконфигурировано `MaxRetries = 3`:

```
ProxyPool = [proxy1, proxy2, proxy3, proxy4, proxy5]
ProxyRotateOnStatus = [403]   // или ProxyRotatePerRequest = true
Сконфигурировано MaxRetries = 3

→ Автоматически скорректировано до 4 (= 5 - 1), каждый из 5 прокси опробован
→ 1-й запрос через proxy1, сбой — 403
→ 2-й запрос через proxy2 (ротация), сбой — 403
→ 3-й запрос через proxy3, сбой — 403
→ 4-й запрос через proxy4, сбой — 403
→ 5-й запрос через proxy5, сбой — 403
→ Повторы исчерпаны (всего 5 попыток = 1 начальная + 4 повтора)
```

:::tip Почему именно len(ProxyPool) - 1
Первый запрос использует 1-й прокси и не считается повтором. Чтобы опробовать все N прокси, нужно N - 1 повторов. `calculateMaxRetries` повышает `MaxRetries` до `len(ProxyPool) - 1` (если исходная конфигурация меньше), гарантируя выполнение намерения (ротация всех прокси). Если сконфигурированный пользователем `MaxRetries` уже достаточно велик, он остаётся без изменений.
:::

```go
package main

import (
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Connection.ProxyPool = []string{
        "http://proxy1:8080",
        "http://proxy2:8080",
        "http://proxy3:8080",
        "http://proxy4:8080",
        "http://proxy5:8080",
    }
    cfg.Connection.ProxyPoolStrategy = httpc.ProxyStrategyRoundRobin
    cfg.Connection.ProxyRotateOnStatus = []int{403} // 403 запускает ротацию прокси
    cfg.Retry.MaxRetries = 3 // Автоматически повышается до 4 (= 5-1)

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // При каждом 403 автоматически меняется прокси, максимум опробовано 5 прокси
    result, err := client.Get("https://protected-site.example.com/data")
    if err != nil {
        log.Printf("Все прокси не сработали: %v", err)
        return
    }
    log.Printf("Успех (один из прокси сработал): %d", result.StatusCode())
}
```

## Бюджет повторов

Повторы увеличивают общее время запроса. При проектировании таймаутов необходимо резервировать бюджет задержек повторов.

### Формула общего худшего времени

```
Общее худшее время = (MaxRetries + 1) × Таймаут запроса + Σ(лимиты задержек каждого повтора)
```

На примере конфигурации по умолчанию (`MaxRetries=3`, `Request=180s`, `Delay=1s`, `Backoff=2.0`, `Jitter`):

```
Часть таймаута запроса: 4 × 180s = 720s (начальный + 3 повтора, каждый максимум 180s)
Часть задержек повтора: 1.1 + 2.2 + 4.4 ≈ 7.7s (сумма верхних границ джиттера для 3 задержек)
Общее худшее время: ≈ 727.7s (около 12 минут)
```

### Способы сокращения общего времени

| Корректировка | Эффект |
|---------------|--------|
| Уменьшить `MaxRetries` | Напрямую сокращает число повторов, общее время падает линейно |
| Уменьшить `Timeouts.Request` | Каждая попытка быстрее завершается неудачей |
| Уменьшить `Retry.Delay` | Сокращает интервал между повторами |
| Уменьшить `BackoffFactor` | Замедляет рост задержки, ранние повторы быстрее |
| Переопределить через `context.WithTimeout` | Точный контроль общего лимита одного запроса |

:::warning Конфликт повторов и таймаутов
Дедлайн, заданный `context.WithTimeout`, жёсткий — даже если повторы не исчерпаны, при истечении context запрос немедленно прекращается. Это означает, что фактическое число повторов может быть меньше `MaxRetries`. Если вашему приложению нужно «гарантированно повторить N раз», убедитесь, что таймаут context достаточно длинный:

<!-- check-code: skip -->
```go
// Резервируем достаточно времени: 3 повтора + задержки + время каждого запроса
ctx, cancel := context.WithTimeout(context.Background(),
    3*requestTimeout + 10*time.Second)
```
:::

## Отмена context и повторы

Механизм повторов HTTPC имеет быстрый путь для отмены context. Когда причина сбоя запроса — `context.Canceled` или `context.DeadlineExceeded`, `isRetryableError` немедленно возвращает false, пропуская полную логику классификации ошибок:

<!-- check-code: skip -->
```go
// Внутренняя реализация (retry.go)
func (r *retryEngine) isRetryableError(err error) bool {
    // Быстрый путь: ошибки context не повторяются — избегает накладных расходов полной классификации
    if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
        return false
    }
    clientErr := classifyError(err, "", "", 0)
    // ...полная логика классификации
}
```

Это означает:

- **Ручная отмена пользователя** (`cancel()`): немедленная остановка, без повторов
- **Таймаут context**: немедленная остановка, без повторов
- **Отмена выполняемого запроса**: не вызывает дополнительных повторов из-за отмены

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

    // Сценарий 1: ручная отмена — без повторов
    ctx1, cancel1 := context.WithCancel(context.Background())
    go func() {
        time.Sleep(100 * time.Millisecond)
        cancel1() // Ручная отмена через 100ms
    }()

    _, err = client.Request(ctx1, "GET", "https://api.example.com/slow")
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) && clientErr.Type == httpc.ErrorTypeContextCanceled {
            fmt.Println("Запрос отменён вручную, повторы не выполнялись")
        }
    }

    // Сценарий 2: таймаут context — без повторов
    ctx2, cancel2 := context.WithTimeout(context.Background(), 50*time.Millisecond)
    defer cancel2()

    _, err = client.Request(ctx2, "GET", "https://api.example.com/slow")
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) && clientErr.Type == httpc.ErrorTypeTimeout {
            fmt.Println("Запрос прекращён из-за таймаута context, повторы не выполнялись")
        }
    }
}
```

## Обработка ошибок и повторы

После исчерпания повторов ошибка возвращается через `ClientError`, `Type` равен `ErrorTypeRetryExhausted` (или типу исходной ошибки последней попытки), поле `Attempts` фиксирует общее число попыток:

```go
package main

import (
    "errors"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    _, err = client.Get("https://api.example.com/flaky")
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) {
            log.Printf("Тип сбоя: %s, число попыток: %d",
                clientErr.Code(), clientErr.Attempts)
            if clientErr.Attempts > 1 {
                log.Println("(автоматические повторы выполнены, но всё ещё сбой)")
            }
        }
    }
}
```

## Лучшие практики

| Сценарий | Рекомендуемая конфигурация |
|----------|----------------------------|
| API-вызовы | `MaxRetries=3, Delay=1s, Backoff=2.0` (по умолчанию) |
| Связь между микросервисами | `MaxRetries=2, Delay=500ms, Backoff=2.0` (быстрый отказ) |
| Загрузка файлов | `MaxRetries=5, Delay=2s, Backoff=2.0` (толерантность к колебаниям сети) |
| Идемпотентные операции (GET/PUT/DELETE) | Можно безопасно повторять |
| Неидемпотентные операции (POST) | `WithMaxRetries(0)` или сузить через пользовательский `RetryPolicy` |
| API с rate-limiting | Полагаться на автоматический разбор `Retry-After` (встроено) |
| Сценарии с пулом прокси | Совместно с `ProxyRotateOnStatus`, число повторов повышается автоматически |

:::warning Повтор неидемпотентных POST-запросов
По умолчанию неидемпотентные POST-запросы также повторяются при получении повторяемых кодов состояния (например, 500/502/503/504) или сетевых ошибок. Если сервер не гарантирует идемпотентность, повторная отправка может привести к побочным эффектам (например, дублирование создания ресурсов). Способы точного контроля:
1. Используйте `WithMaxRetries(0)` для POST-запросов, полностью отключая повторы
2. Или реализуйте пользовательский `RetryPolicy` для повторов только при сетевых ошибках (не HTTP-кодов состояния)
:::

## Что дальше

- [Обработка ошибок](./error-handling) — детальный разбор классификации ошибок и сопоставления сигнальных ошибок
- [Config API](../api-reference/client-config/config) — справочник полей конфигурации повторов
- [Пул соединений и прокси](./connection-pool) — настройка пула прокси и стратегии ротации
- [Определения интерфейсов](../api-reference/types/interfaces) — справочник интерфейса RetryPolicy
