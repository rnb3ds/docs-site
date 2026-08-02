---
sidebar_label: "Performance"
title: "Performance - CyberGo HTTPC | Presets & Concurrency"
description: "HTTPC performance optimization guide: comparing four presets (Default/Secure/Performance/Minimal) and scenario selection, fine-tuning connection-pool and timeout parameters based on presets, automatic Result lifecycle management to reduce GC pressure, and analysis and optimization advice for high-concurrency request patterns and anti-patterns."
sidebar_position: 9
---

# Performance Optimization

HTTPC is designed for high performance: connection-pool reuse, HTTP/2 multiplexing, object pooling, and single-allocation result objects. In most scenarios, using a preset configuration directly delivers excellent performance; when further tuning is needed, understanding the underlying mechanics lets you target the right lever.

## Preset Comparison

HTTPC provides 5 preset configurations, each systematically tuned for a different scenario. The tables below list the exact values of key fields by category, so you can compare and choose.

### Timeout Configuration

| Field | Default | Secure | Performance | Testing | Minimal |
|------|---------|--------|-------------|---------|---------|
| `Timeouts.Request` | 180s | 15s | 60s | 180s | 180s |
| `Timeouts.Dial` | 10s | 5s | 15s | 5s | 5s |
| `Timeouts.TLSHandshake` | 10s | 5s | 15s | 5s | 5s |
| `Timeouts.ResponseHeader` | 0 (disabled) | 10s | 0 (disabled) | 0 (disabled) | 0 (disabled) |
| `Timeouts.IdleConn` | 90s | 30s | 120s | 30s | 30s |

### Connection Configuration

| Field | Default | Secure | Performance | Testing | Minimal |
|------|---------|--------|-------------|---------|---------|
| `MaxIdleConns` | 50 | 20 | 100 | 10 | 10 |
| `MaxConnsPerHost` | 10 | 5 | 20 | 5 | 2 |
| `EnableHTTP2` | On | On | On | **Off** | On |
| `EnableCookies` | Off | Off | On | On | Off |
| `EnableDoH` | Off | Off | Off | Off | Off |

### Security Configuration

| Field | Default | Secure | Performance | Testing | Minimal |
|------|---------|--------|-------------|---------|---------|
| `MaxResponseBodySize` | 10MB | 5MB | 50MB | 10MB | 1MB |
| `MaxDecompressedBodySize` | 100MB | 100MB | 100MB | 100MB | 100MB |
| `ValidateURL` | On | On | On | **Off** | On |
| `ValidateHeaders` | On | On | On | **Off** | On |
| `StrictContentLength` | On | On | Off | On | On |
| `AllowPrivateIPs` | false | false | false | **true** | false |
| `InsecureSkipVerify` | false | false | false | **true** | false |

### Retry Configuration

| Field | Default | Secure | Performance | Testing | Minimal |
|------|---------|--------|-------------|---------|---------|
| `MaxRetries` | 3 | 1 | 3 | 1 | 0 |
| `Delay` | 1s | 2s | 500ms | 100ms | 0 |
| `BackoffFactor` | 2.0 | 2.0 | 1.5 | 2.0 | 1.0 |
| `MaxRetryDelay` | 30s | 30s | 30s | 30s | 30s |
| `EnableJitter` | On | On | On | Off | Off |

### Request Defaults

| Field | Default | Secure | Performance | Testing | Minimal |
|------|---------|--------|-------------|---------|---------|
| `FollowRedirects` | On | **Off** | On | On | **Off** |
| `MaxRedirects` | 10 | 10 | 10 | 10 | 10 |
| `UserAgent` | `httpc/1.0` | `httpc/1.0` | `httpc/1.0` | `httpc-test/1.0` | `httpc/1.0` |

:::warning Never use TestingConfig in production
`TestingConfig()` disables URL/header validation, TLS certificate verification, and SSRF protection — it is for local development and testing only. It emits a security warning when called outside a test environment. Use `SecureConfig()` or `DefaultConfig()` in production.
:::

## Scenario Selection

| Scenario | Recommended Preset | Adjustment Suggestion |
|------|----------|----------|
| General web services | Default | — |
| Handling user-provided URLs | Secure | — |
| Internal microservices, high concurrency | Performance | Increase `MaxIdleConns` per backend count |
| One-off scripts | Minimal | — |
| File download service | Performance | Increase `MaxResponseBodySize` |
| Financial/medical APIs | Secure + custom | Add audit middleware |
| Local dev / unit testing | Testing | Never deploy to production |

<!-- check-code: skip -->
```go
// High throughput scenario — use the preset directly
client, _ := httpc.New(httpc.PerformanceConfig())

// Fine-tune individual fields on top of the preset
cfg := httpc.PerformanceConfig()
cfg.Timeouts.Request = 120 * time.Second
cfg.Connection.MaxIdleConns = 200
client, _ := httpc.New(cfg)
```

## Connection Pool Tuning Internals

The connection pool is the core of HTTP client performance. HTTPC's pool is built on the Go standard library's `http.Transport`, but adds auto-computation logic and secure defaults on top.

### Idle Connection Auto-Computation

`MaxIdleConnsPerHost` (the per-host idle connection cap) does not need to be set manually — HTTPC derives it from `MaxConnsPerHost`:

```
idle conns = MaxConnsPerHost / 2, clamped to [2, 10]
```

Specific rules (`calculateIdleConnsPerHost`):

| MaxConnsPerHost | Auto idle conns | Notes |
|-----------------|---------------|------|
| 0 (unlimited) | 10 | Uses the upper-bound default |
| 1 | 2 | No lower than the floor |
| 2 | 2 | Exactly the floor |
| 5 | 2 | Half rounds down to floor |
| 10 | 5 | Default preset |
| 20 | 10 | Performance preset, hits the cap |
| 100 | 10 | Above the cap, uses 10 |

:::tip Why MaxConnsPerHost / 2
Idle connections are a "cache of connections" — established but currently unused. Setting it to half the max connections strikes a balance between "reuse existing connections" (cache hit) and "create new connections" (re-handshake on cache miss), avoiding idle connections consuming too many server-side resources.
:::

### TCP Keep-Alive

HTTPC's connection pool uses a fixed 30-second TCP keep-alive interval (`defaultKeepAlive = 30 * time.Second`). After a connection is established, the OS periodically sends keep-alive probes to detect dead connections. The `IdleConn` timeout controls how long idle connections live in the pool (90s for Default); the two work together.

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    // High-QPS microservice scenario: enlarge the pool
    cfg := httpc.PerformanceConfig()
    cfg.Connection.MaxIdleConns = 200   // Global idle connection cap
    cfg.Connection.MaxConnsPerHost = 50 // Max conns per host (idle auto-computed to 10)
    cfg.Timeouts.IdleConn = 300 * time.Second // Idle conns live longer, higher reuse rate

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // Hot-path requests reuse pooled connections directly
    for i := 0; i < 100; i++ {
        result, err := client.Get("https://api.example.com/data")
        if err != nil {
            log.Printf("request %d failed: %v", i, err)
            continue
        }
        fmt.Printf("request %d: %d\n", i, result.StatusCode())
    }
}
```

## HTTP/2 Performance Advantages

HTTP/2 is enabled by default (`EnableHTTP2 = true`), providing three major performance gains:

| Feature | HTTP/1.1 | HTTP/2 |
|------|----------|--------|
| Multiplexing | One connection per request | Multiple requests share one connection |
| Header compression | Plaintext, resent every time | HPACK-compressed headers |
| Connection reuse | Keep-alive, serial | Parallel streams |

:::tip HTTP/2 and the connection pool
HTTP/2 multiplexing lets a single TCP connection carry multiple simultaneous requests, drastically reducing connection-setup overhead. Under high concurrency to the same host, HTTP/2 throughput far exceeds HTTP/1.1. It only falls back to HTTP/1.1 when using `TestingConfig()` (which explicitly disables HTTP/2) or when the connection does not support ALPN negotiation.
:::

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    // HTTP/2 is enabled by default
    cfg := httpc.DefaultConfig()
    cfg.Connection.EnableHTTP2 = true // true by default; explicit for clarity

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // Concurrent requests to an HTTP/2-capable host (most CDNs/cloud services)
    // A single TCP connection is reused; no new connection per request
    start := time.Now()
    for i := 0; i < 10; i++ {
        result, err := client.Get("https://http2.golang.org/")
        if err != nil {
            log.Printf("request %d failed: %v", i, err)
            continue
        }
        // Proto() returns the protocol version, e.g. "HTTP/2.0"
        fmt.Printf("request %d: %s, status %d\n", i, result.Proto(), result.StatusCode())
    }
    fmt.Printf("10 requests took: %v\n", time.Since(start))
}
```

## Memory Optimization Mechanisms

HTTPC applies multiple layers of memory optimization; the core idea is to reduce heap allocations and reuse objects.

### resultBundle Single Allocation

Every request returns a `*Result` carrying three nested structs: `RequestInfo` (request info), `ResponseInfo` (response info), and `RequestMeta` (metadata such as duration). The traditional approach allocates separately for Result and each nested struct — four heap allocations. HTTPC packs them into a single `resultBundle`, so one heap allocation covers everything:

```
Traditional: 4 separate allocations (Result + RequestInfo + ResponseInfo + RequestMeta)
HTTPC: 1 allocation (resultBundle); Result's three pointers reference the same memory block
```

The caller receives a `*Result` whose `Request`, `Response`, and `Meta` fields (pointers) reference the corresponding structs inside the bundle — fully transparent. Because the caller may hold `*Result` long-term, an object pool is not appropriate here (pooling would cause data races); instead it is reclaimed by GC.

### Engine Object Pool

HTTPC's engine layer makes extensive use of `sync.Pool` to reuse short-lived objects, reducing GC pressure:

| Pooled object | Purpose | Notes |
|----------|------|------|
| `engine.Response` | Response object | Returned to pool after request, reused next time |
| `engine.Request` | Request object | Same as above |
| `strings.Builder` | String building | URL building, error formatting, Config serialization |
| `http.Header` | HTTP header map | Request/response header processing |
| `bytes.Buffer` | JSON/multipart encoding | Pre-allocated by initial capacity |
| `time.Timer` | Retry timer | Avoids frequent timer creation |
| gzip/flate reader | Decompression | Reuses decompressors |

:::tip Division of labor: object pool vs resultBundle
Engine-internal objects (Response/Request/Builder) have short lifetimes and complete their borrow-return cycle within a single request, so they are good fits for pooling. The `*Result` returned to the caller has an unpredictable lifetime, so it uses single allocation + GC reclamation. The two complement each other, each playing to its strength.
:::

### You Don't Need to Worry About This

The optimizations above are fully transparent to the caller. You just use the API normally; connection reuse, object pooling, and single allocation all happen automatically:

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

    // Result is created fresh per request, reclaimed by GC — no manual release
    result, err := client.Get("https://api.example.com/data")
    if err != nil {
        log.Fatal(err)
    }

    // On hot paths prefer RawBody() over Body()
    // RawBody() returns the raw byte slice; Body() returns a pre-stored string; String() is debug formatting (highest overhead)
    data := result.RawBody()
    fmt.Printf("response size: %d bytes\n", len(data))
    fmt.Printf("request duration: %v\n", result.Meta.Duration)
}
```

## Workload Tuning Examples

### AI API Long Polling

AI inference APIs can take minutes to respond, so you need to relax timeout limits:

<!-- check-code: skip -->
```go
// An AI API may need 5–15 minutes to respond — don't get cut off by the default 180s timeout
result, err := httpc.Post("https://api.ai.example.com/v1/completions",
    httpc.WithJSON(payload),
    httpc.WithTimeout(900*time.Second), // 15 minutes
)
```

:::warning Why Default's ResponseHeader is 0
`Timeouts.ResponseHeader = 0` means the transport layer does not enforce a response-header timeout; the context-level timeout (`Timeouts.Request` or `WithTimeout`) controls everything. This ensures `WithTimeout()` has full control over long-running responses. For transport-layer defense against slowloris attacks, use `SecureConfig()` (which sets it to 10s).
:::

### Microservice High QPS

High-frequency calls between internal microservices need a large connection pool:

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.PerformanceConfig()
    // Tune the pool to the number of backend instances
    cfg.Connection.MaxIdleConns = 300   // Total idle connections
    cfg.Connection.MaxConnsPerHost = 30 // Per backend instance
    // Microservice responses are usually fast — shorten timeouts for fast failure
    cfg.Timeouts.Request = 10 * time.Second
    cfg.Retry.Delay = 200 * time.Millisecond
    cfg.Retry.BackoffFactor = 2.0
    cfg.Retry.MaxRetries = 2

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    start := time.Now()
    // High-frequency requests reuse the pool — no TCP/TLS re-establishment
    for i := 0; i < 50; i++ {
        result, err := client.Get("http://user-service:8080/api/users")
        if err != nil {
            log.Printf("request %d failed: %v", i, err)
            continue
        }
        _ = result
    }
    fmt.Printf("50 requests took: %v\n", time.Since(start))
}
```

### Large File Download (Streaming)

When downloading large files, use `WithStreamBody(true)` to avoid loading the entire response into memory; combine with the `Download()` method for resumable transfers:

```go
package main

import (
    "context"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.PerformanceConfig()
    cfg.Security.MaxResponseBodySize = 500 * 1024 * 1024 // 500MB cap

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    dcfg := httpc.DefaultDownloadConfig()
    dcfg.FilePath = "/tmp/large-file.zip"
    dcfg.ResumeDownload = true // Resumable download

    result, err := client.Download(
        context.Background(),
        "https://example.com/large-file.zip",
        dcfg,
    )
    if err != nil {
        log.Fatal(err)
    }
    log.Printf("download complete: %d bytes", result.BytesWritten)
}
```

### Crawler and Proxy Pool

Crawler scenarios rotate IPs via a proxy pool. HTTPC automatically raises the retry count to ensure each proxy is tried at least once (see [Retry and Fault Tolerance](./retry-fault-tolerance#proxy-pool-and-retry-interaction)):

<!-- check-code: skip -->
```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyPool = []string{
    "http://proxy1:8080",
    "http://proxy2:8080",
    "http://proxy3:8080",
    "http://proxy4:8080",
    "http://proxy5:8080",
}
cfg.Connection.ProxyRotateOnStatus = []int{403} // 403 triggers proxy rotation
cfg.Connection.ProxyPoolStrategy = httpc.ProxyStrategyRoundRobin
// MaxRetries is automatically raised to 4 (proxy count - 1), ensuring all 5 proxies are tried
```

## Performance Anti-Patterns

| Anti-Pattern | Cause | Correct Approach |
|--------|------|----------|
| Creating a Client per request | Connections can't be reused; TCP/TLS handshake every time | Reuse a single Client instance globally |
| Overly large `MaxResponseBodySize` | Needlessly raises the memory ceiling | Set it to the actual response size |
| Using `result.String()` on hot paths | Extra string-building overhead | Use `result.Body()` or `result.RawBody()` |
| Connection pool too small | High concurrency exhausts connections; requests queue | Tune `MaxConnsPerHost` to concurrency |
| Disabling HTTP/2 | Degrades to serial HTTP/1.1 requests | Keep it on by default |
| Ignoring `Close()` | Connection leak | `defer client.Close()` |
| Globally shared but not reused | Repeatedly creating/destroying the Client | Create once, hold long-term |

:::warning The Client must be reused
The foundation of HTTP performance is connection reuse. Creating a Client per request means going through the TCP three-way handshake + TLS handshake every time — latency jumps from sub-millisecond to tens of milliseconds. In microservice scenarios, inject the Client as a singleton into the service struct so it lives as long as the service.
:::

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

// Anti-pattern demo: creating a Client per request
func main() {
    start := time.Now()

    for i := 0; i < 5; i++ {
        // WRONG: new Client every iteration — connections can't be reused
        client, err := httpc.NewDefault()
        if err != nil {
            log.Fatal(err)
        }
        result, err := client.Get("https://httpbin.org/get")
        client.Close() // Closed every time; pool drained
        if err != nil {
            log.Printf("request %d failed: %v", i, err)
            continue
        }
        _ = result
    }
    // 5 requests take far longer than the reuse approach
    fmt.Printf("anti-pattern took: %v\n", time.Since(start))

    // CORRECT: reuse the Client
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    start = time.Now()
    for i := 0; i < 5; i++ {
        result, err := client.Get("https://httpbin.org/get")
        if err != nil {
            log.Printf("request %d failed: %v", i, err)
            continue
        }
        _ = result
    }
    fmt.Printf("reuse pattern took: %v\n", time.Since(start))
}
```

## Next Steps

- [Connection Pool & Proxy](./connection-pool) — Connection pool parameters, proxy pool configuration and rotation strategies
- [Error Handling](./error-handling) — Layered timeout strategy and error classification
- [Retry and Fault Tolerance](./retry-fault-tolerance) — Backoff algorithm details and retry budgets
- [Security Overview](../security/) — Balancing security and performance
