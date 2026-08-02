---
sidebar_label: "Цепочки промежуточного ПО"
title: "Цепочка middleware - CyberGo HTTPC | Луковая модель и композиция"
description: "Руководство по цепочке middleware HTTPC: принцип выполнения луковой модели и двунаправленный поток обработки запроса/ответа, конфигурация семи встроенных middleware (Recovery/Logging/RequestID и др.), ручная композиция Chain, написание пользовательского MiddlewareFunc и пример короткого замыкания автомата защиты — поможет создать наблюдаемый и отказоустойчивый конвейер обработки запросов."
sidebar_position: 7
---

# Цепочки промежуточного ПО

## Луковая модель

Промежуточное ПО HTTPC использует луковую модель: запрос проходит снаружи внутрь, ответ — изнутри наружу:

```text
Запрос →  Recovery  →  Logging  →  RequestID  → Handler
                                                          ↓
Ответ  ←  Recovery  ←  Logging  ←  RequestID  ← Response
```

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.RecoveryMiddleware(),                                      // Внешний слой: восстановление после panic
    httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: log.Printf}), // Второй слой: логирование
    httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),          // Внутренний слой: Request ID
}

client, err := httpc.New(cfg)
if err != nil {
    log.Fatal(err)
}
defer client.Close()
```

## Встроенное промежуточное ПО

### RecoveryMiddleware

Восстановление после panic, предотвращает падение процесса:

```go
httpc.RecoveryMiddleware()
```

### LoggingMiddleware

Логирование запросов/ответов, URL автоматически маскируется:

```go
httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: func(format string, args ...any) {
    log.Printf("[HTTP] "+format, args...)
}})
// Пример вывода: [HTTP] GET https://api.example.com/data -> 200 (150ms) (код состояния и длительность — фактические измерения, не фиксированные значения)
```

### RequestIDMiddleware

Добавляет уникальный ID каждому запросу, генерируется с использованием `crypto/rand`:

```go
httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()) // 32-символьный hex по умолчанию

// Пользовательский генератор
httpc.RequestIDMiddleware(&httpc.RequestIDConfig{
    HeaderName: "X-Request-ID",
    Generator:  func() string {
        return uuid.New().String()
    },
})
```

### TimeoutMiddleware

Таймаут на уровне промежуточного ПО, принудительно срабатывает до таймаута клиента:

```go
httpc.TimeoutMiddleware(&httpc.TimeoutMiddlewareConfig{Duration: 30 * time.Second})
```

:::warning Не используйте для Download или потоковых запросов
`defer cancel()` в `TimeoutMiddleware` срабатывает сразу после возврата обработчика (т.е. после получения заголовков ответа), поэтому для запросов `Download` или `WithStreamBody` контекст отменяется до чтения тела ответа, что проявляется как ошибка «context canceled». Для потоковых сценариев и загрузок используйте опцию [`WithTimeout`](../api-reference/core/options#withtimeout).
:::

### HeaderMiddleware

Добавляет статические заголовки ко всем запросам:

```go
httpc.HeaderMiddleware(&httpc.HeaderConfig{Headers: map[string]string{
    "X-App-Version": "1.0.0",
    "X-Platform":    "server",
}})
```

### MetricsMiddleware

Сбор метрик запросов:

```go
httpc.MetricsMiddleware(&httpc.MetricsConfig{OnMetrics: func(method, url string, statusCode int, duration time.Duration, err error) {
    metrics.IncrCounter("http.requests", 1)
    metrics.RecordTimer("http.latency", duration)
    if err != nil {
        metrics.IncrCounter("http.errors", 1)
    }
}})
```

### AuditMiddleware

Безопасность аудит для финансовых, медицинских и других сценариев с требованиями соответствия:

```go
auditCfg := httpc.DefaultAuditConfig()
auditCfg.OnAudit = func(event httpc.AuditEvent) {
    log.Printf("[AUDIT] %s %s -> %d (%v)",
        event.Method, event.URL, event.StatusCode, event.Duration)
}
httpc.AuditMiddleware(auditCfg)
```

### Настройка параметров аудита

Получите конфигурацию по умолчанию через `DefaultAuditConfig()` и измените поля, чтобы управлять форматом вывода, записью заголовков и маскировкой:

```go
auditCfg := httpc.DefaultAuditConfig()
auditCfg.Format = "json"
auditCfg.IncludeHeaders = true
auditCfg.MaskHeaders = []string{"Authorization", "Cookie"}
auditCfg.SanitizeError = true
auditCfg.OnAudit = func(event httpc.AuditEvent) {
    data, err := json.Marshal(event)
    if err != nil {
        log.Println("Ошибка сериализации события аудита:", err)
        return
    }
    log.Println(string(data))
}

httpc.AuditMiddleware(auditCfg)
```

События аудита поддерживают извлечение SourceIP и UserID из контекста:

```go
ctx := context.WithValue(context.Background(), httpc.SourceIPKey, "192.168.1.1")
ctx = context.WithValue(ctx, httpc.UserIDKey, "user-123")
```

## Ручная цепочечная композиция

Используйте функцию `Chain` для объединения промежуточного ПО:

```go
middleware := httpc.Chain(
    httpc.RecoveryMiddleware(),
    httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: log.Printf}),
    httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),
)

cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{middleware}
```

## Пользовательское промежуточное ПО

```go
func CORSMiddleware(origin string) httpc.MiddlewareFunc {
    return func(next httpc.Handler) httpc.Handler {
        return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
            // Фаза запроса: модификация запроса
            req.SetHeader("Origin", origin)

            // Вызов следующего обработчика
            resp, err := next(ctx, req)

            // Фаза ответа: запись или модификация ответа
            if resp != nil {
                log.Printf("Статус ответа: %d", resp.StatusCode())
            }

            return resp, err
        }
    }
}
```

### Промежуточное ПО с размыкателем цепи

```go
func CircuitBreakerMiddleware(threshold int) httpc.MiddlewareFunc {
    var failures int
    var mu sync.Mutex

    return func(next httpc.Handler) httpc.Handler {
        return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
            mu.Lock()
            if failures >= threshold {
                mu.Unlock()
                return nil, fmt.Errorf("circuit breaker open")
            }
            mu.Unlock()

            resp, err := next(ctx, req)
            if err != nil {
                mu.Lock()
                failures++
                mu.Unlock()
            }
            return resp, err
        }
    }
}
```

## Конфигурация промежуточного ПО

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.RecoveryMiddleware(),
    httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: log.Printf}),
}
cfg.Defaults.UserAgent = "my-app/1.0"
cfg.Defaults.Headers = map[string]string{"X-App": "my-app"}
cfg.Defaults.FollowRedirects = true
cfg.Defaults.MaxRedirects = 10

client, err := httpc.New(cfg)
if err != nil {
    log.Fatal(err)
}
defer client.Close()
```

## Что дальше

- [Промежуточное ПО API](../api-reference/client-config/middleware) - полный справочник промежуточного ПО
- [Повторные попытки и отказоустойчивость](./retry-fault-tolerance) - руководство по стратегии повторов
- [Обзор безопасности](../security/) - практики безопасности промежуточного ПО аудита
