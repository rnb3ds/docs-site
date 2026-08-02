---
title: "Core Concepts - CyberGo HTTPC | Two-Layer Architecture & Config"
description: "An in-depth look at HTTPC core concepts: the two-layer API architecture (package-level functions and Client instances), the distinction between the Config struct and With* request options, the request lifecycle, and automatic Result management to help developers quickly build a holistic understanding of the library."
sidebar_label: "Core Concepts"
sidebar_position: 2
---

# Core Concepts

Understanding the following concepts will give you a quick, holistic grasp of HTTPC.

## Two-Layer API Architecture

HTTPC provides two equivalent ways to make requests, mirroring the relationship between `http.Get` and `http.Client` in the standard library `net/http`:

**Package-level functions** — zero configuration; internally share a lazily-initialized default client. Suitable for scripts and one-off requests:

```go
result, err := httpc.Get("https://api.example.com/data")
```

**Client instances** — full control over configuration, connection pools, and lifecycle. Suitable for long-running services:

```go
client, err := httpc.NewDefault()
defer func() { _ = client.Close() }()
result, err := client.Get("https://api.example.com/data")
```

Both approaches accept the same request options (`WithHeader`, `WithJSON`...) and return the same `*Result` type. Package-level functions are thin wrappers around Client instances.

:::tip
When to use which? One-off requests or quick prototypes -> package-level functions. Production services, custom configuration, or connection-pool management -> Client instances.
:::

## Configuration System: Config vs With\* Options

HTTPC splits configuration into two independent layers to avoid confusion:

| Layer | Carrier | Scope | Typical fields |
|-------|---------|-------|----------------|
| **Instance configuration** | `Config` struct | Entire client lifetime | Timeouts, retry strategy, connection pool, TLS |
| **Request options** | `WithXxx()` functions | Single request | `WithHeader`, `WithJSON`, `WithTimeout` |

Instance configuration is passed to `New()` via the `Config` struct, starting from `DefaultConfig()` and modified as needed:

```go
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 60 * time.Second
cfg.Retry.MaxRetries = 5
client, err := httpc.New(cfg)
```

Request options are passed on each call to supplement or override instance-level defaults:

```go
result, err := client.Get(url,
    httpc.WithHeader("Authorization", "Bearer "+token),
    httpc.WithTimeout(30*time.Second),
)
```

You can also start from preset configurations (`SecureConfig()`, `PerformanceConfig()`, etc.). See [Config API](../api-reference/client-config/config).

## Request Lifecycle

Every request goes through the following flow:

```text
Options applied -> Middleware chain (if any) -> Engine execution -> Retry (if needed) -> Result returned
    ^                                       ^
  With* functions                  Connection pool / TLS / proxy / SSRF checks
```

- **Options applied** — `With*` functions set request headers, body, timeouts, etc.
- **Middleware chain** — Custom logic for logging, metrics, audit, etc. (configured via `Config.Middleware`)
- **Engine execution** — Connection-pool reuse, TLS handshake, HTTP/2 negotiation, SSRF validation
- **Retry** — Automatic exponential-backoff retry on retryable errors (timeouts, 5xx, 429, etc.)
- **Result** — Contains response data, request metadata, and retry statistics; reclaimed automatically by GC, no manual release required

## Secure Defaults

HTTPC is secure by default and requires no extra configuration to gain:

- **TLS 1.2+** enforced encryption
- **SSRF protection** — blocks connections to private/reserved IP addresses (`127.0.0.1`, `10.x`, `192.168.x`, etc.)
- **CRLF injection protection** — automatic validation of request headers and URLs
- **Response body size limit** — 10MB by default, preventing memory exhaustion

To connect to internal services (VPN, intranet), set `Security.AllowPrivateIPs = true` or use `SSRFExemptCIDRs` for precise exemptions. See [Security Overview](../security/).

## Error Model

HTTPC distinguishes between **network-layer errors** and **HTTP status codes**:

- **Network-layer errors** (connection failures, timeouts, TLS errors, etc.) -> returned as `error`; use `errors.As` to extract a `ClientError` for classification and retryability
- **HTTP status codes** (4xx, 5xx) -> **not** returned as `error`; check them via methods like `result.IsSuccess()`

```go
result, err := client.Get(url)
if err != nil {
    // Network-layer error — request did not complete successfully
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        log.Printf("Error type: %s, retryable: %v", clientErr.Code(), clientErr.IsRetryable())
    }
    return err
}
// Request completed successfully — check the HTTP status code
if !result.IsSuccess() {
    log.Printf("HTTP error: %d", result.StatusCode())
}
```

See [Error Handling](./error-handling).
