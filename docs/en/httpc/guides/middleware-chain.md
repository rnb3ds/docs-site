---
sidebar_label: "Middleware Chain"
title: "Middleware Chain - CyberGo HTTPC | Onion-Model Chains"
description: "HTTPC middleware chain guide: onion-model execution principle and bidirectional request/response processing flow, configuration of seven built-in middleware (Recovery/Logging/RequestID etc.), manual Chain composition, writing custom MiddlewareFunc, and a circuit-breaker short-circuit example to help you build observable, resilient request-processing pipelines."
sidebar_position: 7
---

# Middleware Chain

## Onion Model

HTTPC middleware follows an onion model -- requests go from outer to inner, responses from inner to outer:

```text
Request ->  Recovery  ->  Logging  ->  RequestID  -> Handler
                                                              |
Response <-  Recovery  <-  Logging  <-  RequestID  <- Response
```

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.RecoveryMiddleware(),                                      // Outermost: panic recovery
    httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: log.Printf}), // Second layer: logging
    httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),          // Innermost: request ID
}

client, err := httpc.New(cfg)
if err != nil {
    log.Fatal(err)
}
defer client.Close()
```

## Built-in Middleware

### RecoveryMiddleware

Panic recovery to prevent process crashes:

```go
httpc.RecoveryMiddleware()
```

### LoggingMiddleware

Request/response logging with automatic URL masking:

```go
httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: func(format string, args ...any) {
    log.Printf("[HTTP] "+format, args...)
}})
// Output example: [HTTP] GET https://api.example.com/data -> 200 (150ms) (status code and duration are measured values, not fixed)
```

### RequestIDMiddleware

Adds a unique ID to each request, generated with `crypto/rand`:

```go
httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()) // Default 32-char hex

// Custom generator
httpc.RequestIDMiddleware(&httpc.RequestIDConfig{
    HeaderName: "X-Request-ID",
    Generator:  func() string {
        return uuid.New().String()
    },
})
```

### TimeoutMiddleware

Middleware-level timeout enforced before the client timeout:

```go
httpc.TimeoutMiddleware(&httpc.TimeoutMiddlewareConfig{Duration: 30 * time.Second})
```

:::warning Do not use for Download or streaming requests
`TimeoutMiddleware`'s `defer cancel()` fires immediately after the handler returns (i.e., once the response headers are received), so for `Download` or `WithStreamBody` requests it cancels the context before the response body is read, producing a "context canceled" error. For streaming/download scenarios, use the [`WithTimeout`](../api-reference/core/options#withtimeout) option instead.
:::

### HeaderMiddleware

Adds static headers to all requests:

```go
httpc.HeaderMiddleware(&httpc.HeaderConfig{Headers: map[string]string{
    "X-App-Version": "1.0.0",
    "X-Platform":    "server",
}})
```

### MetricsMiddleware

Collects request metrics:

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

Security auditing for financial, medical, and other compliance scenarios:

```go
auditCfg := httpc.DefaultAuditConfig()
auditCfg.OnAudit = func(event httpc.AuditEvent) {
    log.Printf("[AUDIT] %s %s -> %d (%v)",
        event.Method, event.URL, event.StatusCode, event.Duration)
}
httpc.AuditMiddleware(auditCfg)
```

### Configuring Audit Options

Use `DefaultAuditConfig()` to get the default configuration, then modify fields to control output format, header logging, and masking:

```go
auditCfg := httpc.DefaultAuditConfig()
auditCfg.Format = "json"
auditCfg.IncludeHeaders = true
auditCfg.MaskHeaders = []string{"Authorization", "Cookie"}
auditCfg.SanitizeError = true
auditCfg.OnAudit = func(event httpc.AuditEvent) {
    data, err := json.Marshal(event)
    if err != nil {
        log.Println("failed to serialize audit event:", err)
        return
    }
    log.Println(string(data))
}

httpc.AuditMiddleware(auditCfg)
```

Audit events support extracting SourceIP and UserID from context:

```go
ctx := context.WithValue(context.Background(), httpc.SourceIPKey, "192.168.1.1")
ctx = context.WithValue(ctx, httpc.UserIDKey, "user-123")
```

## Manual Chain Composition

Use the `Chain` function to compose middleware:

```go
middleware := httpc.Chain(
    httpc.RecoveryMiddleware(),
    httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: log.Printf}),
    httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),
)

cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{middleware}
```

## Custom Middleware

```go
func CORSMiddleware(origin string) httpc.MiddlewareFunc {
    return func(next httpc.Handler) httpc.Handler {
        return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
            // Request phase: modify request
            req.SetHeader("Origin", origin)

            // Call next handler
            resp, err := next(ctx, req)

            // Response phase: log or modify response
            if resp != nil {
                log.Printf("Response status: %d", resp.StatusCode())
            }

            return resp, err
        }
    }
}
```

### Short-Circuit Middleware

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

## Middleware Configuration

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

## Next Steps

- [Middleware API](../api-reference/client-config/middleware) - Complete middleware reference
- [Retry and Fault Tolerance](./retry-fault-tolerance) - Retry strategy guide
- [Security Overview](../security/) - Audit middleware security practices
