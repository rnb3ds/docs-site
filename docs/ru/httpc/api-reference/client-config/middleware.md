---
sidebar_label: "Промежуточное ПО"
title: "Промежуточное ПО - CyberGo HTTPC | Семь встроенных middleware"
description: "Справочник API middleware HTTPC: Chain по луковой модели и семь встроенных middleware (Recovery, Logging, RequestID, Timeout, Header, Metrics, Audit)."
sidebar_position: 5
---

# Промежуточное ПО

:::tip Обзор архитектуры
Эта страница — **справочник по встроенному middleware**. Общая архитектура конвейера Handler, принципы луковой модели и написание собственного middleware рассматриваются в [Конвейер обработчиков / Handler и цепочка middleware](../handler/handler-chain).
:::

HTTPC использует архитектуру промежуточного ПО по модели лука, оборачивая логику обработки запросов через `MiddlewareFunc`.

```go
type MiddlewareFunc func(Handler) Handler
type Handler func(ctx context.Context, req RequestMutator) (ResponseMutator, error)
```

Промежуточное ПО настраивается в `MiddlewareConfig.Middlewares`, выполняется в порядке добавления. Каждый фабричный метод middleware принимает указатель на конфигурацию `*XxxConfig`; при передаче `nil` используется конфигурация по умолчанию:

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.RecoveryMiddleware(),
    httpc.LoggingMiddleware(&httpc.LoggingConfig{
        LogFunc: log.Printf,
    }),
    httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),
}
client, err := httpc.New(cfg)
```

## Chain

```go
func Chain(middlewares ...MiddlewareFunc) MiddlewareFunc
```

Объединяет несколько промежуточных ПО в одно. Выполняются в порядке передачи, после обработки последним вызывается финальный Handler.

```go
combined := httpc.Chain(
    httpc.RecoveryMiddleware(),
    httpc.LoggingMiddleware(&httpc.LoggingConfig{
        LogFunc: log.Printf,
    }),
)
```

## Встроенное промежуточное ПО

### RecoveryMiddleware

```go
func RecoveryMiddleware() MiddlewareFunc
```

Промежуточное ПО восстановления после panic. Перехватывает panic в цепочке обработки, преобразуя его в error с информацией о стеке вызовов.

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.RecoveryMiddleware(),
}
client, _ := httpc.New(cfg)
```

### LoggingMiddleware

```go
func LoggingMiddleware(config *LoggingConfig) MiddlewareFunc
```

Промежуточное ПО логирования запросов. Записывает метод, URL, код состояния и время выполнения. URL автоматически маскируется (удаляется информация об учётных данных). При передаче `nil` используется [`DefaultLoggingConfig()`](#defaultloggingconfig) (логирование отключено).

#### LoggingConfig

```go
type LoggingConfig struct {
    // LogFunc принимает форматированные лог-сообщения (аналог log.Printf).
    // При nil логирование отключается.
    LogFunc func(format string, args ...any)
}
```

| Поле | Значение по умолчанию | Описание |
|------|----------------------|----------|
| `LogFunc` | `nil` | Функция вывода логов, при nil логирование отключается |

#### DefaultLoggingConfig

```go
func DefaultLoggingConfig() *LoggingConfig
```

Возвращает конфигурацию по умолчанию с отключённым логированием. Установите поле `LogFunc` для включения логирования.

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.LoggingMiddleware(&httpc.LoggingConfig{
        LogFunc: log.Printf,
    }),
}
client, _ := httpc.New(cfg)
// Пример вывода: GET https://api.example.com/data -> 200 (125ms)
```

### RequestIDMiddleware

```go
func RequestIDMiddleware(config *RequestIDConfig) MiddlewareFunc
```

Добавляет уникальный ID каждому запросу. При передаче `nil` используется [`DefaultRequestIDConfig()`](#defaultrequestidconfig) (заголовок `"X-Request-ID"` + генератор `crypto/rand`). Если в запросе уже есть заголовок с тем же именем, исходное значение сохраняется и не перезаписывается.

:::tip
Генератор по умолчанию использует `crypto/rand`, генерируемые ID непредсказуемы, подходят для сценариев с повышенными требованиями к безопасности.
:::

#### RequestIDConfig

```go
type RequestIDConfig struct {
    // HeaderName — имя HTTP-заголовка для request ID.
    // По умолчанию: "X-Request-ID".
    HeaderName string

    // Generator генерирует строку request ID. При nil используется криптографически
    // безопасный генератор случайных чисел (crypto/rand, 16-байтовое hex-кодирование).
    Generator func() string
}
```

| Поле | Значение по умолчанию | Описание |
|------|----------------------|----------|
| `HeaderName` | `"X-Request-ID"` | Имя заголовка запроса |
| `Generator` | `nil` (crypto/rand) | Функция генерации ID, при nil используется криптостойкий генератор |

#### DefaultRequestIDConfig

```go
func DefaultRequestIDConfig() *RequestIDConfig
```

Возвращает конфигурацию по умолчанию: `HeaderName` равен `"X-Request-ID"`, `Generator` равен nil (во время выполнения откатывается к `crypto/rand`).

```go
// С конфигурацией по умолчанию
middleware := httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig())

// С пользовательским именем заголовка
middleware := httpc.RequestIDMiddleware(&httpc.RequestIDConfig{
    HeaderName: "X-Correlation-ID",
})

// С пользовательским генератором
middleware := httpc.RequestIDMiddleware(&httpc.RequestIDConfig{
    Generator: func() string {
        return uuid.New().String()
    },
})
```

### TimeoutMiddleware

```go
func TimeoutMiddleware(config *TimeoutMiddlewareConfig) MiddlewareFunc
```

Управление таймаутом на уровне промежуточного ПО. При передаче `nil` используется [`DefaultTimeoutMiddlewareConfig()`](#defaulttimeoutmiddlewareconfig) (таймаут отключён, middleware работает как прозрачный канал). При положительном значении срабатывает до встроенного таймаута клиента, при истечении отменяет контекст и возвращает ошибку.

:::warning Не используйте для Download или потоковых запросов
`defer cancel()` в `TimeoutMiddleware` срабатывает сразу после возврата обработчика (т.е. после получения заголовков ответа), поэтому для запросов `Download` или `WithStreamBody` контекст отменяется до чтения тела ответа, что проявляется как ошибка «context canceled». Для потоковых сценариев и загрузок используйте опцию [`WithTimeout`](../core/options#withtimeout).
:::

#### TimeoutMiddlewareConfig

```go
type TimeoutMiddlewareConfig struct {
    // Duration — максимальное время, отведённое запросу. Нулевое или отрицательное значение
    // отключает таймаут (middleware пропускает запрос как есть).
    // По умолчанию: 0 (отключено).
    Duration time.Duration
}
```

| Поле | Значение по умолчанию | Описание |
|------|----------------------|----------|
| `Duration` | `0` | Время таймаута, нулевое или отрицательное значение отключает |

Имя типа содержит `Middleware`, чтобы отличить от клиентского `TimeoutConfig` в `types.go`.

#### DefaultTimeoutMiddlewareConfig

```go
func DefaultTimeoutMiddlewareConfig() *TimeoutMiddlewareConfig
```

Возвращает конфигурацию по умолчанию с отключённым таймаутом. Установите `Duration` в положительное значение для включения таймаута.

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.TimeoutMiddleware(&httpc.TimeoutMiddlewareConfig{
        Duration: 10 * time.Second,
    }),
}
client, _ := httpc.New(cfg)
```

### HeaderMiddleware

```go
func HeaderMiddleware(config *HeaderConfig) MiddlewareFunc
```

Добавляет статические заголовки каждому запросу. При передаче `nil` используется [`DefaultHeaderConfig()`](#defaultheaderconfig) (без заголовков, middleware работает как прозрачный канал). Безопасность заголовков проверяется при создании (защита от CRLF-инъекций); при конфликте с уже существующими заголовками с тем же именем они будут перезаписаны.

#### HeaderConfig

```go
type HeaderConfig struct {
    // Headers содержит статические заголовки, добавляемые к каждому запросу.
    // Существующие заголовки с тем же ключом будут перезаписаны.
    // Заголовки проходят проверку безопасности при создании middleware (защита от CRLF-инъекций).
    // По умолчанию: пусто (заголовки не добавляются, middleware работает как прозрачный канал).
    Headers map[string]string
}
```

| Поле | Значение по умолчанию | Описание |
|------|----------------------|----------|
| `Headers` | `nil` (пусто) | Статические пары ключ-значение заголовков, безопасность проверяется при создании |

#### DefaultHeaderConfig

```go
func DefaultHeaderConfig() *HeaderConfig
```

Возвращает конфигурацию по умолчанию без заголовков.

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.HeaderMiddleware(&httpc.HeaderConfig{
        Headers: map[string]string{
            "X-API-Version": "v2",
            "X-Client":      "myapp/1.0",
        },
    }),
}
client, _ := httpc.New(cfg)
```

### MetricsMiddleware

```go
func MetricsMiddleware(config *MetricsConfig) MiddlewareFunc
```

Промежуточное ПО сбора метрик. Вызывает обратный вызов после каждого запроса, передавая метод, URL, код состояния, время выполнения и информацию об ошибке. При передаче `nil` используется [`DefaultMetricsConfig()`](#defaultmetricsconfig) (сбор метрик отключён).

#### MetricsConfig

```go
type MetricsConfig struct {
    // OnMetrics вызывается после завершения каждого запроса, передавая метрики запроса.
    // При nil сбор метрик отключается.
    OnMetrics func(method, url string, statusCode int, duration time.Duration, err error)
}
```

| Поле | Значение по умолчанию | Описание |
|------|----------------------|----------|
| `OnMetrics` | `nil` | Обратный вызов метрик, при nil отключается |

#### DefaultMetricsConfig

```go
func DefaultMetricsConfig() *MetricsConfig
```

Возвращает конфигурацию по умолчанию с отключённым сбором метрик. Установите поле `OnMetrics` для включения сбора метрик.

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.MetricsMiddleware(&httpc.MetricsConfig{
        OnMetrics: func(method, url string, status int, d time.Duration, err error) {
            metrics.Record(method, status, d, err)
        },
    }),
}
client, _ := httpc.New(cfg)
```

### AuditMiddleware

```go
func AuditMiddleware(config *AuditConfig) MiddlewareFunc
```

Промежуточное ПО безопасности для аудита, подходит для финансовых, медицинских, государственных и других сценариях с требованиями соответствия. Записывает метаданные запроса/ответа (метод, URL, код состояния, длительность, повторные попытки и т. д.), URL автоматически маскируется. Обратный вызов предоставляется через `config.OnAudit`; при nil middleware не выполняет никаких действий. При передаче `nil` используется [`DefaultAuditConfig()`](#defaultauditconfig).

`SourceIP` и `UserID` извлекаются из контекста запроса через [`SourceIPKey`](#ключи-контекста-аудита) и [`UserIDKey`](#ключи-контекста-аудита).

#### AuditConfig

```go
type AuditConfig struct {
    // OnAudit получает AuditEvent после завершения каждого цикла запрос/ответ.
    // При nil middleware не выполняет никаких действий.
    OnAudit func(event AuditEvent)

    // Format задаёт формат вывода: "text" (по умолчанию) или "json"
    Format string

    // IncludeHeaders — включать ли заголовки запроса/ответа в журнал аудита
    IncludeHeaders bool

    // MaskHeaders — список имён заголовков для маскировки (например, "Authorization", "Cookie")
    MaskHeaders []string

    // SanitizeError удаляет конфиденциальную информацию из сообщений об ошибках
    SanitizeError bool
}
```

| Поле | Значение по умолчанию | Описание |
|------|----------------------|----------|
| `OnAudit` | `nil` | Обратный вызов аудита, при nil middleware не выполняет никаких действий |
| `Format` | `"text"` | Формат вывода |
| `IncludeHeaders` | `false` | Записывать ли заголовки |
| `MaskHeaders` | `["Authorization", "Cookie", ...]` | Стандартный список конфиденциальных заголовков |
| `SanitizeError` | `true` | Информация об ошибках заменяется на `[sanitized]` |

#### DefaultAuditConfig

```go
func DefaultAuditConfig() *AuditConfig
```

Возвращает конфигурацию аудита по умолчанию: `Format` равен `"text"`, `IncludeHeaders` равен `false`, `MaskHeaders` — стандартный список конфиденциальных заголовков, `SanitizeError` равен `true`. Установите поле `OnAudit` для включения обратного вызова аудита.

```go
auditCfg := httpc.DefaultAuditConfig()
auditCfg.OnAudit = func(event httpc.AuditEvent) {
    log.Printf("[AUDIT] %s %s -> %d (%v) user=%s ip=%s",
        event.Method, event.URL, event.StatusCode,
        event.Duration, event.UserID, event.SourceIP)
}
auditCfg.Format = "json"
auditCfg.IncludeHeaders = true

cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.AuditMiddleware(auditCfg),
}
client, _ := httpc.New(cfg)
```

## Типы аудита

### AuditEvent

```go
type AuditEvent struct {
    Timestamp     time.Time           `json:"timestamp"`
    Method        string              `json:"method"`
    URL           string              `json:"url"`              // Маскировано (учётные данные удалены)
    StatusCode    int                 `json:"statusCode"`
    Duration      time.Duration       `json:"duration"`
    Attempts      int                 `json:"attempts"`
    Error         error               `json:"error,omitempty"`
    SourceIP      string              `json:"sourceIP,omitempty"`
    UserID        string              `json:"userID,omitempty"`
    RedirectChain []string            `json:"redirectChain,omitempty"`
    ReqHeaders    map[string][]string `json:"reqHeaders,omitempty"`
    RespHeaders   map[string][]string `json:"respHeaders,omitempty"`
}
```

Событие безопасности аудита.

#### MarshalJSON

```go
func (e AuditEvent) MarshalJSON() ([]byte, error)
```

Пользовательская сериализация JSON, обрабатывает два специальных поля:

| Поле | Правило преобразования |
|------|------------------------|
| `Duration` | Добавляется `durationMs` (целое число миллисекунд), сохраняется исходное поле `duration` (наносекунды) |
| `Error` | Преобразуется в `error` (строка сообщения об ошибке), при nil опускается |

```go
event := httpc.AuditEvent{
    Method:    "GET",
    URL:       "https://api.example.com/data",
    Duration:  150 * time.Millisecond,
    StatusCode: 200,
}
data, _ := json.Marshal(event)
// {"timestamp":"...","method":"GET","url":"...","statusCode":200,"duration":150000000,"attempts":0,"durationMs":150}
```

### Ключи контекста аудита

Передача информации аудита через контекст запроса:

```go
// Установка исходного IP
ctx = context.WithValue(ctx, httpc.SourceIPKey, "192.168.1.1")

// Установка идентификатора пользователя
ctx = context.WithValue(ctx, httpc.UserIDKey, "user-123")

result, err := client.Request(ctx, "GET", url)
```

| Константа | Тип | Описание |
|-----------|-----|----------|
| `SourceIPKey` | `auditContextKey` | Ключ контекста исходного IP |
| `UserIDKey` | `auditContextKey` | Ключ контекста идентификатора пользователя |

## См. также

- [Интерфейсы](../types/interfaces) - определения типов MiddlewareFunc, Handler
- [Цепочки промежуточного ПО](../../guides/middleware-chain) - руководство по использованию промежуточного ПО
- [Константы и типы](../types/constants) - типы AuditEvent, AuditConfig
