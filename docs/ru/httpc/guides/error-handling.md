---
sidebar_label: "Обработка ошибок"
title: "Обработка ошибок - CyberGo HTTPC | Классификация и сопоставление сигналов"
description: "Руководство по обработке ошибок HTTPC: двенадцать классов ошибок ErrorType, поля ClientError и оценка IsRetryable, сопоставление сигнальных ошибок errors.Is/As, обработка исчерпания повторов, таймаут и отмена context, унифицированная обработка ошибок через middleware и лучшие практики многоуровневых таймаутов."
sidebar_position: 5
---

# Обработка ошибок

HTTPC оборачивает все ошибки в единый `ClientError`, предоставляя классификацию типов, оценку повторяемости и богатый контекст. В сочетании с `errors.Is`/`errors.As` стандартной библиотеки Go можно точно сопоставлять сигнальные ошибки или гибко обрабатывать их по категориям.

## Полный справочник по ErrorType

HTTPC определяет 12 типов ошибок, покрывающих все сценарии сбоев от сетевого уровня до уровня приложения:

| ErrorType | Code() | Значение | Типичный сценарий | Повторяемо |
|-----------|--------|----------|-------------------|------------|
| `ErrorTypeNetwork` | `NETWORK_ERROR` | Ошибка сетевого уровня | Отказ соединения, сброс соединения, обрыв канала | Зависит от причины |
| `ErrorTypeTimeout` | `TIMEOUT` | Таймаут | Таймаут установки соединения, таймаут запроса, дедлайн context | Да |
| `ErrorTypeContextCanceled` | `CONTEXT_CANCELED` | Отмена контекста | Вызван `ctx.Cancel()` | Нет |
| `ErrorTypeDNS` | `DNS_ERROR` | Сбой разрешения DNS | Домен не существует, сбой DNS-сервера | Временно/таймаут — повторяемо |
| `ErrorTypeTLS` | `TLS_ERROR` | Ошибка TLS-рукопожатия | Неподдерживаемая версия протокола, сбой согласования алгоритмов | Нет |
| `ErrorTypeCertificate` | `CERTIFICATE_ERROR` | Сбой проверки сертификата | Просроченный сертификат, недействительная подпись, недоверенный CA | Нет |
| `ErrorTypeTransport` | `TRANSPORT_ERROR` | Ошибка HTTP транспортного уровня | Ошибка протокола, аварийное прерывание передачи | Да |
| `ErrorTypeResponseRead` | `RESPONSE_READ_ERROR` | Ошибка чтения тела ответа | EOF из-за обрыва соединения, таймаут чтения | Зависит от причины |
| `ErrorTypeRetryExhausted` | `RETRY_EXHAUSTED` | Исчерпание повторов | Сбой после достижения лимита `MaxRetries` | Нет |
| `ErrorTypeValidation` | `VALIDATION_ERROR` | Сбой валидации запроса | Неверный формат URL, управляющие символы в HTTP-заголовке | Нет |
| `ErrorTypeHTTP` | `HTTP_ERROR` | Ошибка HTTP-кода состояния | Ответы 4xx/5xx | По коду состояния |
| `ErrorTypeUnknown` | `UNKNOWN_ERROR` | Неклассифицированная ошибка | Другие не сопоставленные исключения | Нет |

:::tip Полные правила определения повторяемости
Логика `IsRetryable()` более гранулярная, чем в таблице: `ErrorTypeDNS` повторяем только когда `net.DNSError` помечен как временный или таймаут; `ErrorTypeNetwork` определяет через проверку `syscall.Errno` (`ECONNREFUSED`/`ECONNRESET`/`EPIPE`/`ETIMEDOUT`/`ENETUNREACH`/`EHOSTUNREACH`) и шаблоны сообщений об ошибках; `ErrorTypeResponseRead` повторяем только при сетевых ошибках операций чтения (`read`/`readfrom`). Подробнее см. ниже «Определение повторяемости».
:::

## Подробный разбор полей ClientError

Структура `ClientError` несёт полный контекст сбоя запроса:

| Поле | Тип | Назначение |
|------|-----|-----------|
| `Type` | `ErrorType` | Классификация ошибки для ветвления `switch` |
| `Message` | `string` | Человекочитаемое описание ошибки |
| `Cause` | `error` | Исходная ошибка нижнего уровня, поддерживает цепочку `errors.Unwrap` |
| `URL` | `string` | URL запроса (с маскировкой, см. ниже) |
| `Method` | `string` | HTTP-метод (GET/POST/...) |
| `Attempts` | `int` | Число попыток (включая первую), при исчерпании повторов > 1 |
| `StatusCode` | `int` | HTTP-код состояния (имеет значение только для `ErrorTypeHTTP`) |
| `Host` | `string` | Целевое имя хоста (для автоматов выключения и др.) |

### Определение типа ошибки

```go
package main

import (
    "errors"
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

    result, err := client.Get("https://api.example.com/data")
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) {
            switch clientErr.Type {
            case httpc.ErrorTypeTimeout:
                log.Printf("Таймаут запроса (попыток: %d): %v", clientErr.Attempts, err)
            case httpc.ErrorTypeNetwork:
                log.Printf("Сетевая ошибка: %v", err)
            case httpc.ErrorTypeDNS:
                log.Printf("Сбой разрешения DNS: %v", err)
            case httpc.ErrorTypeTLS:
                log.Printf("Сбой TLS-рукопожатия: %v", err)
            case httpc.ErrorTypeCertificate:
                log.Printf("Сбой проверки сертификата: %v", err)
            case httpc.ErrorTypeRetryExhausted:
                log.Printf("Сбой после %d повторов: %v", clientErr.Attempts, err)
            case httpc.ErrorTypeValidation:
                log.Printf("Сбой валидации запроса: %v", err)
            case httpc.ErrorTypeContextCanceled:
                log.Printf("Запрос отменён: %v", err)
            default:
                log.Printf("Другая ошибка [%s]: %v", clientErr.Code(), err)
            }
        }
        return
    }
    fmt.Printf("Успех: %d\n", result.StatusCode())
}
```

### Определение повторяемости

`IsRetryable()` комплексно учитывает тип ошибки и причину нижнего уровня, возвращая, стоит ли повторять:

```go
package main

import (
    "errors"
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

    _, err = client.Get("https://api.example.com/data")
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) {
            if clientErr.IsRetryable() {
                fmt.Println("Повторяемая ошибка, верхняя логика может повторить позже")
            } else {
                fmt.Printf("Неповторяемая ошибка [%s], требуется ручное вмешательство\n", clientErr.Code())
            }
        }
    }
}
```

:::warning Различие между IsRetryable и автоматическим повтором
`IsRetryable()` определяет, «стоит ли повторять эту ошибку», и также используется внутренним механизмом повторов HTTPC. Если вы уже настроили автоматические повторы через `Retry.MaxRetries`, то к моменту выполнения вашего кода обработки ошибок, получение сетевой/таймаутной ошибки означает, что повторы уже исчерпаны. `IsRetryable()` в основном используется для решений на верхнем уровне (например, автоматы выключения, очереди задач).
:::

## Полный справочник сигнальных ошибок

HTTPC определяет следующие переменные сигнальных ошибок, которые можно точно сопоставить через `errors.Is`:

| Сигнальная переменная | Условие срабатывания | Рекомендуемая обработка |
|-----------------------|----------------------|-------------------------|
| `ErrClientClosed` | Использование клиента после `client.Close()` | Инициализировать новый Client или исправить управление жизненным циклом |
| `ErrNilConfig` | Указатель Config, переданный в `New()`, равен nil | Использовать `DefaultConfig()` для значений по умолчанию |
| `ErrInvalidHeader` | Сбой проверки HTTP-заголовка (управляющие символы или неверный формат) | Исправить значение Header и повторить |
| `ErrInvalidTimeout` | Отрицательное значение таймаута или превышение лимита 30 минут | Установить в допустимый диапазон `[0, 30min]` |
| `ErrInvalidRetry` | Неверная конфигурация повторов (MaxRetries вне 0-10, BackoffFactor вне 1.0-10.0) | Исправить параметры повторов |
| `ErrInvalidConnection` | Неверная конфигурация соединений (размер пула вне диапазона, неверный формат URL прокси) | Исправить параметры соединений |
| `ErrInvalidSecurity` | Неверная конфигурация безопасности (лимит размера тела ответа вне диапазона) | Исправить параметры безопасности |
| `ErrInvalidMiddleware` | Неверная конфигурация промежуточного ПО (число перенаправлений > 50, слишком длинный UserAgent или управляющие символы) | Исправить параметры промежуточного ПО |
| `ErrEmptyFilePath` | Не указан путь файла при загрузке | Установить `DownloadConfig.FilePath` |
| `ErrFileExists` | Файл уже существует и `Overwrite=false`, `ResumeDownload=false` | Установить перезапись или возобновление, либо сменить путь |
| `ErrResponseBodyEmpty` | Вызов методов парсинга (`Unmarshal()` и др.) при пустом теле ответа | Сначала проверить `RawBody`, затем парсить |
| `ErrResponseBodyTooLarge` | Тело ответа превышает лимит `MaxResponseBodySize` | Увеличить лимит или использовать пагинацию API |

:::tip Ошибки конфигурации vs ошибки времени выполнения
Серия `ErrInvalid*` (`ErrInvalidHeader`/`ErrInvalidTimeout`/`ErrInvalidRetry`/`ErrInvalidConnection`/`ErrInvalidSecurity`/`ErrInvalidMiddleware`) — это ошибки валидации конфигурации, возвращаемые при вызове `New()`, и не должны встречаться на горячем пути запросов. Ошибки времени выполнения обрабатываются через классификацию `ClientError`.
:::

```go
package main

import (
    "errors"
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

    result, err := client.Get("https://api.example.com/data")

    switch {
    case errors.Is(err, httpc.ErrClientClosed):
        fmt.Println("Клиент закрыт, нужно пересоздать")
    case errors.Is(err, httpc.ErrResponseBodyTooLarge):
        fmt.Println("Тело ответа слишком велико, рассмотрите увеличение MaxResponseBodySize")
    case errors.Is(err, httpc.ErrResponseBodyEmpty):
        fmt.Println("Тело ответа пусто, проверьте RawBody перед вызовом методов парсинга")
    case errors.Is(err, httpc.ErrInvalidHeader):
        fmt.Println("Неверный заголовок запроса, исправьте и повторите")
    }

    if result != nil {
        fmt.Printf("Код состояния: %d\n", result.StatusCode())
    }
}
```

## Автоматическая маскировка URL

`ClientError.Error()` автоматически удаляет конфиденциальную информацию из URL. URL с именем пользователя и паролем (например, `https://user:pass@host/path`) маскируется в `https://***:***@host/path`, гарантируя, что учётные данные не утекают в логи и сообщения об ошибках:

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

    // URL содержит учётные данные
    result, err := client.Get("https://admin:s3cret@api.example.com/data")
    if err != nil {
        // Учётные данные в сообщении об ошибке автоматически маскируются:
        // "GET https://***:***@api.example.com/data: network error occurred"
        fmt.Println(err)
    }
    if result != nil {
        fmt.Println(result.StatusCode())
    }
}
```

:::tip Охват маскировки
Маскировка удаляет не только учётные данные формата `user:pass@host`, но и обрабатывает конфиденциальные параметры запроса (например, `token`, `key`, `secret` и т.д.). Для URL без учётных данных или конфиденциальных параметров используется быстрый путь, пропускающий парсинг во избежание лишних накладных расходов `url.Parse`.
:::

## Сеть безопасности восстановления panic

HTTPC имеет встроенную сеть восстановления panic в методах `Request()` и `Download()`. Любой непредвиденный panic (из движка, транспортного уровня, библиотеки TLS или промежуточного ПО) перехватывается и преобразуется в `ClientError`, а не обрушивает процесс вызывающего:

<!-- check-code: skip -->
```go
// Внутренняя реализация client.go (концептуально)
func (c *clientImpl) Request(ctx context.Context, method, url string, ...) (*Result, error) {
    defer func() {
        if r := recover(); r != nil {
            result = nil
            err = panicToError(r) // Преобразование в ClientError
        }
    }()
    // ... нормальная логика запроса
}
```

:::warning Сеть безопасности не заменяет восстановление в промежуточном ПО
Встроенная сеть безопасности — последняя линия обороны, преобразующая panic в ошибку вместо обрушения. Но если panic может возникнуть в промежуточном ПО, рекомендуется дополнительно использовать `RecoveryMiddleware()` — она перехватывает panic раньше в цепочке промежуточного ПО, предоставляя более полный логический контекст:

<!-- check-code: skip -->
```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.RecoveryMiddleware(),       // Восстановление panic на уровне промежуточного ПО
    httpc.LoggingMiddleware(nil),     // Логирование
    httpc.MetricsMiddleware(nil),     // Метрики
}
```
:::

## Связь автоматических повторов и ошибок

Механизм повторов HTTPC автоматически обрабатывает повторяемые ошибки внутри. Понимание того, какие ошибки повторяются автоматически, поможет избежать дублирования повторов на уровне приложения:

### Ошибки с автоматическим повтором

| Условие | Повтор | Описание |
|---------|--------|----------|
| Сетевая ошибка (отказ соединения, сброс, EOF) | Да | Соответствие `isRetryableNetworkMessage` |
| Таймаут установки/запроса | Да | `ErrorTypeTimeout` |
| Временный/таймаутный сбой DNS | Да | `dnsErr.IsTemporary \|\| dnsErr.IsTimeout` |
| Сетевая ошибка чтения тела ответа | Да | `net.OpError` операции чтения |
| Повторяемый HTTP-код состояния | Да | 408/429/500/502/503/504 |
| Код состояния, указанный в `ProxyRotateOnStatus` | Да | Например, 403 запускает ротацию прокси |

### Ошибки без повтора

| Условие | Повтор | Описание |
|---------|--------|----------|
| `context.Canceled` | Нет | Возврат по быстрому пути |
| `context.DeadlineExceeded` | Нет | Возврат по быстрому пути |
| Сбой TLS-рукопожатия | Нет | `ErrorTypeTLS` неповторяем |
| Сбой проверки сертификата | Нет | `ErrorTypeCertificate` неповторяем |
| Ошибка валидации конфигурации | Нет | `ErrorTypeValidation` неповторяем |
| Другие 4xx ошибки клиента | Нет | Например, 400/401/403/404 |

:::tip Отмена context — быстрый путь
`isRetryableError` перед оценкой сначала проверяет `context.Canceled` и `context.DeadlineExceeded` — при совпадении сразу возвращает false, пропуская полную классификацию ошибки. Это избегает траты ресурсов на оценку повторяемости при уже отменённом context.
:::

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

    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()

    result, err := client.Request(ctx, "GET", "https://api.example.com/slow")
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) {
            if clientErr.Type == httpc.ErrorTypeContextCanceled {
                // Таймаут или ручная отмена context — не повторяется автоматически
                fmt.Println("Запрос отменён (таймаут или ручная отмена), не повторяется")
            } else if clientErr.Type == httpc.ErrorTypeTimeout {
                fmt.Println("Таймаут запроса, автоповторы исчерпаны")
            }
        }
        return
    }
    fmt.Println(result.StatusCode())
}
```

## Лучшие практики обработки ошибок

### 1. Разделяйте ошибки клиента и сервера

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

    result, err := client.Get("https://api.example.com/data")
    if err != nil {
        // Ошибка сетевого уровня — проблемы соединения, TLS, DNS и др.
        log.Printf("Ошибка сетевого уровня: %v", err)
        return
    }

    // Ошибка HTTP-уровня — ответ получен, но код не 2xx
    if result.IsClientError() {
        // 4xx: ошибка в запросе клиента (неверные параметры, недостаточно прав и др.)
        log.Printf("Ошибка клиента: %d", result.StatusCode())
    } else if result.IsServerError() {
        // 5xx: сбой сервера (повторы исчерпаны, апстрим недоступен)
        log.Printf("Ошибка сервера: %d", result.StatusCode())
    } else {
        fmt.Printf("Успех: %d\n", result.StatusCode())
    }
}
```

### 2. Шаблон автомат выключения (circuit breaker)

При постоянных сбоях сервиса автомат выключения временно прекращает запросы, предотвращая каскадные сбои и трату ресурсов:

<!-- check-code: skip -->
```go
type CircuitBreaker struct {
    mu           sync.Mutex
    failures     int
    threshold    int           // Порог последовательных сбоев
    cooldown     time.Duration // Время охлаждения выключателя
    trippedAt    time.Time
}

func (cb *CircuitBreaker) Allow() bool {
    cb.mu.Lock()
    defer cb.mu.Unlock()
    if cb.failures >= cb.threshold {
        if time.Since(cb.trippedAt) < cb.cooldown {
            return false // Выключатель разомкнут — отказ в запросе
        }
        cb.failures = 0 // Период охлаждения прошёл — сброс
    }
    return true
}

func (cb *CircuitBreaker) Record(err error) {
    cb.mu.Lock()
    defer cb.mu.Unlock()
    if err != nil {
        cb.failures++
        if cb.failures >= cb.threshold {
            cb.trippedAt = time.Now()
        }
    } else {
        cb.failures = 0 // Успех — сброс
    }
}

// Использование совместно с IsRetryable
func requestWithBreaker(client httpc.Client, cb *CircuitBreaker, url string) error {
    if !cb.Allow() {
        return fmt.Errorf("circuit breaker open")
    }
    result, err := client.Get(url)
    cb.Record(err)
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) && !clientErr.IsRetryable() {
            cb.Record(nil) // Неповторяемая ошибка не считается сбоем сервиса
        }
        return err
    }
    _ = result
    return nil
}
```

### 3. Деградация fallback

При недоступности основного сервиса — откат к кешу или значению по умолчанию:

<!-- check-code: skip -->
```go
package main

import (
    "errors"
    "log"

    "github.com/cybergodev/httpc"
)

func fetchWithFallback(client httpc.Client, url string, fallback []byte) []byte {
    result, err := client.Get(url)
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) {
            switch clientErr.Type {
            case httpc.ErrorTypeTimeout, httpc.ErrorTypeRetryExhausted:
                log.Printf("Основной сервис недоступен, используются деградированные данные: %v", err)
                return fallback
            case httpc.ErrorTypeValidation:
                // Ошибка валидации — локальный баг, не деградировать
                log.Fatalf("Ошибка конфигурации запроса: %v", err)
            }
        }
        log.Printf("Неизвестная ошибка, используются деградированные данные: %v", err)
        return fallback
    }
    return result.RawBody()
}
```

### 4. Единая обработка через промежуточное ПО

```go
package main

import (
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
        httpc.RecoveryMiddleware(),
        httpc.LoggingMiddleware(&httpc.LoggingConfig{
            LogFunc: func(format string, args ...any) {
                log.Printf("[HTTP] "+format, args...)
            },
        }),
        httpc.MetricsMiddleware(&httpc.MetricsConfig{
            OnMetrics: func(method, url string, statusCode int, duration time.Duration, err error) {
                if err != nil {
                    log.Printf("[METRICS] %s %s сбой: %v (заняло %v)", method, url, err, duration)
                } else {
                    log.Printf("[METRICS] %s %s -> %d (заняло %v)", method, url, statusCode, duration)
                }
            },
        }),
    }

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://api.example.com/data")
    if err != nil {
        log.Fatal(err)
    }
    log.Printf("Код состояния: %d", result.StatusCode())
}
```

### 5. Разделение таймаутов

HTTPC предоставляет многоуровневый контроль таймаутов, от грубого к точному:

<!-- check-code: skip -->
```go
// Уровень 1: таймаут клиента по умолчанию (глобальный верхний предел для всех запросов)
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 30 * time.Second

// Уровень 2: принудительный таймаут промежуточного ПО (переопределяет умолчание)
timeoutMW := httpc.TimeoutMiddleware(&httpc.TimeoutMiddlewareConfig{
    Duration: 30 * time.Second,
})

// Уровень 3: переопределение для отдельного запроса (WithTimeout переопределяет промежуточное ПО и умолчание)
result, err := client.Get(url, httpc.WithTimeout(10*time.Second))

// Уровень 4: таймаут context (наиболее точный, рекомендуется для критических путей)
ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
defer cancel()
result, err := client.Request(ctx, "GET", url)
```

:::warning Взаимодействие таймаута ResponseHeader и WithTimeout
При `Timeouts.ResponseHeader = 0` (по умолчанию) транспортный уровень не принуждает таймаут заголовка ответа, и `WithTimeout` имеет полный контроль. Но если установлено положительное значение (например, 10s в `SecureConfig()`), оно принудительно применяется на транспортном уровне для всех запросов, и `WithTimeout` не может его продлить — это защита от атак slowloris. Для сценариев с длинными ответами (например, AI API) держите `ResponseHeader = 0`.
:::

## Что дальше

- [Повторы и отказоустойчивость](./retry-fault-tolerance) — детальный разбор алгоритма отката и пользовательские стратегии повторов
- [Типы ошибок API](../api-reference/types/errors) — полный справочник типов и сигнальных переменных ошибок
- [Цепочки промежуточного ПО](./middleware-chain) — единая обработка ошибок через промежуточное ПО
- [Config API](../api-reference/client-config/config) — справочник по таймаутам и конфигурации безопасности
