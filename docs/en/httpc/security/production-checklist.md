---
sidebar_label: "Production Checklist"
title: "Production Checklist - CyberGo HTTPC | Pre-Deploy Audit"
description: "HTTPC production security checklist: categorized checks across TLS, SSRF, timeouts, size limits, retries, cookies, file download, resource management, and monitoring, each with default values, recommended production values, and code verification methods."
sidebar_position: 4
---

# Production Checklist

Walking through these items before launch effectively eliminates common security-configuration gaps. This checklist is grouped by category, with each item annotated with its default value, recommended production value, and a verification method. Consider automating the high-risk items in CI via the script at the end.

## TLS / Encryption

| Check item | Default | Recommended production value | Verification method |
|--------|--------|-----------|----------|
| `InsecureSkipVerify` | `false` | `false` | Code search; see command at the end |
| `MinTLSVersion` | TLS 1.2 | TLS 1.2+ (1.3 for high security) | `grep MinTLSVersion` |
| `MaxTLSVersion` | TLS 1.3 | TLS 1.3 | `grep MaxTLSVersion` |
| Not using `TestingConfig()` | — | Yes | Code search; see command at the end |
| Certificate pinning (high-security scenarios) | Not enabled | Recommended | `grep CertificatePinner` |

:::warning
`InsecureSkipVerify = true` invalidates all TLS security measures. HTTPC prints a warning to `stderr` in non-test environments — confirm no such warning appears in the logs before launch.
:::

## SSRF Protection

| Check item | Default | Recommended production value | Verification method |
|--------|--------|-----------|----------|
| `AllowPrivateIPs` | `false` | `false` (when handling untrusted URLs) | Code search; see command at the end |
| `SSRFExemptCIDRs` | `nil` | List only necessary subnets, as narrowly as possible | Audit whether subnets can be narrowed |
| Using `SecureConfig()` for user URLs | — | Yes | Code review |
| `RedirectWhitelist` | `nil` | Configure when handling user URLs | Code review |

```go
cfg := httpc.DefaultConfig()
cfg.Security.AllowPrivateIPs = false
// Exempt only subnets you actually need, as narrowly as possible
cfg.Security.SSRFExemptCIDRs = []string{"10.50.0.0/16"}
cfg.Security.RedirectWhitelist = []string{"api.example.com"}
```

## Timeout Configuration

Timeouts are the first line of defense against Slowloris, resource exhaustion, and cascading failures.

| Check item | Default | Recommended production value | Verification method |
|--------|--------|-----------|----------|
| `Timeouts.Request` | 180s | Set per business need (e.g. 30s) | Confirm non-zero |
| `Timeouts.Dial` | 10s | 5-10s | `grep Timeouts.Dial` |
| `Timeouts.TLSHandshake` | 10s | 5-10s | `grep Timeouts.TLSHandshake` |
| `Timeouts.ResponseHeader` | 0 | As needed (see below) | Understand its scope |
| `Timeouts.IdleConn` | 90s | 60-120s | — |

:::warning
`Timeouts.ResponseHeader` is a transport-level hard cap that applies to **all requests** on the client and **cannot** be overridden per request with `WithTimeout`. Setting a positive value overrides a longer `WithTimeout`. Only set a positive value when you need transport-level defense against Slowloris; for long-response scenarios like AI APIs, set it to 0 and rely on the `Request` timeout.
:::

## Size Limits

| Check item | Default | Recommended production value | Verification method |
|--------|--------|-----------|----------|
| `MaxResponseBodySize` | 10MB | Per business need (e.g. 5MB) | Confirm non-zero |
| `MaxDecompressedBodySize` | 100MB | Per business need (e.g. 50MB) | Confirm non-zero |
| `MaxRequestBodySize` | 0 (unlimited) | **Explicitly set** an upload cap | `grep MaxRequestBodySize` |
| `MaxResponseHeaderBytes` | 0 (Go default 10MB) | Tighten to 1MB for high security | `grep MaxResponseHeaderBytes` |

```go
cfg := httpc.DefaultConfig()
cfg.Security.MaxResponseBodySize = 5 * 1024 * 1024     // 5MB response
cfg.Security.MaxDecompressedBodySize = 50 * 1024 * 1024 // 50MB decompressed
cfg.Security.MaxRequestBodySize = 2 * 1024 * 1024       // 2MB upload (default 0 = unlimited!)
cfg.Connection.MaxResponseHeaderBytes = 1 * 1024 * 1024  // 1MB response header
```

:::danger
`MaxRequestBodySize` defaults to 0 (unlimited) and has **no automatic fallback**. If you proxy forwarded requests or handle user uploads without setting it, an attacker can send oversized requests to drain bandwidth and memory. Always set it explicitly.
:::

## Retry Strategy

| Check item | Default | Recommended production value | Verification method |
|--------|--------|-----------|----------|
| `MaxRetries` | 3 | No more than 5 | Code review |
| Retrying non-idempotent requests | — | Be cautious with POST/PUT/PATCH | Code review for idempotency |
| `EnableJitter` | `true` | `true` (prevents thundering herd) | `grep EnableJitter` |
| `MaxRetryDelay` | 30s | 30s | — |

:::warning
Retrying non-idempotent requests (POST creating a resource, PUT partial update) may cause duplicate creation or duplicate charges. If the operation is not idempotent, set `WithMaxRetries(0)` for such requests, or implement an idempotency key on the server side.
:::

## Cookie Security

| Check item | Default | Recommended production value | Verification method |
|--------|--------|-----------|----------|
| `CookieSecurity` | `nil` (no validation) | `StrictCookieSecurityConfig()` | `grep CookieSecurity` |
| `WithSecureCookie` ordering | — | After all `WithCookie` calls | Code review |

```go
cfg := httpc.DefaultConfig()
cfg.Security.CookieSecurity = httpc.StrictCookieSecurityConfig()
// Requires Secure + HttpOnly + SameSite=Strict
```

## File Download Security

| Check item | Default | Recommended production value | Verification method |
|--------|--------|-----------|----------|
| Untrusted download path | — | Use only trusted paths; never concatenate user input | Code review |
| `Checksum` verification | Not set | Set SHA-256 for critical files | `grep Checksum` |
| `Overwrite` / `ResumeDownload` | `false` | As needed | Code review |

HTTPC's `Download` already includes five layers of path defense (UNC blocking, control-character filtering, system-path protection, path-traversal detection, symlink defense), but you should still avoid using user input directly as `FilePath`.

## Resource Management

| Check item | Default | Recommended production value | Verification method |
|--------|--------|-----------|----------|
| Explicit `client.Close()` | — | `defer client.Close()` | Code review |
| Closing the default client | — | `CloseDefaultClient()` on long-running service exit | Code review |
| `WithContext` for cancellation | — | Yes | Code review |

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
	cfg := httpc.DefaultConfig()
	client, err := httpc.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	// Ensure the connection pool is released
	defer func() {
		if cerr := client.Close(); cerr != nil {
			log.Printf("failed to close client: %v", cerr)
		}
	}()

	// Use context to control per-request timeout and cancellation
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	result, err := client.Get("https://api.example.com", httpc.WithContext(ctx))
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("status code: %d\n", result.StatusCode())
}
```

:::tip
When using package-level functions (`httpc.Get`, etc.), the default client does not close connections automatically on program exit. Long-running services should call `httpc.CloseDefaultClient()` during graceful shutdown to release the connection pool. For production services, prefer creating an explicit client via `httpc.New(cfg)` to control configuration and lifecycle.
:::

## Monitoring and Auditing

### Audit Middleware (High-Security Scenarios)

`AuditMiddleware` generates structured audit events suited to compliance-heavy scenarios. The URL in the event is sanitized (credentials removed), and sensitive request headers are masked by default.

```go
auditCfg := httpc.DefaultAuditConfig()
auditCfg.OnAudit = func(event httpc.AuditEvent) {
    // event.SourceIP / event.UserID are injected from context
    data, _ := json.Marshal(event)
    log.Println(string(data))
}
auditCfg.Format = "json"
auditCfg.IncludeHeaders = true
auditCfg.MaskHeaders = []string{"Authorization", "Cookie", "Set-Cookie", "X-API-Key"}
auditMiddleware := httpc.AuditMiddleware(auditCfg)
```

`SourceIP` and `UserID` are injected via the context keys `httpc.SourceIPKey` and `httpc.UserIDKey`, making it easy to correlate requests with callers. `AuditEvent` includes timestamp, method, URL, status code, duration, retry count, error, redirect chain, and request/response headers.

### Logging and Metrics Middleware

| Check item | Recommended production value | Verification method |
|--------|-----------|----------|
| `RecoveryMiddleware()` | Enable (prevents panic crashes) | `grep RecoveryMiddleware` |
| `LoggingMiddleware()` | Enable (request logs) | `grep LoggingMiddleware` |
| `MetricsMiddleware()` | Enable (collect metrics) | `grep MetricsMiddleware` |
| `RequestIDMiddleware()` | Enable (request tracing) | `grep RequestIDMiddleware` |

## Certificate Pinning

For high-security scenarios (finance, healthcare), enabling certificate pinning is recommended to defend against MITM attacks after a CA compromise:

```go
pinner, err := httpc.NewSPKIHashPinner(
    "YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2fuihg=", // current key
    "C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=", // backup (rotation)
)
if err != nil {
    log.Fatal(err)
}
cfg := httpc.DefaultConfig()
cfg.Security.CertificatePinner = pinner
```

For pinning configuration and maintenance details, see [TLS and Certificate Pinning](./tls-certpin).

## Code Examples

### Production-Grade Client Creation

```go
package main

import (
	"log"
	"time"

	"github.com/cybergodev/httpc"
)

func main() {
	cfg := httpc.DefaultConfig()

	// Timeouts
	cfg.Timeouts.Request = 30 * time.Second
	cfg.Timeouts.Dial = 10 * time.Second
	cfg.Timeouts.TLSHandshake = 10 * time.Second
	cfg.Timeouts.ResponseHeader = 0 // Rely on Request timeout; no transport-level hard cap
	cfg.Timeouts.IdleConn = 90 * time.Second

	// Connection pool
	cfg.Connection.MaxIdleConns = 50
	cfg.Connection.MaxConnsPerHost = 10

	// Security
	cfg.Security.AllowPrivateIPs = false
	cfg.Security.MaxResponseBodySize = 5 * 1024 * 1024      // 5MB
	cfg.Security.MaxDecompressedBodySize = 50 * 1024 * 1024 // 50MB
	cfg.Security.MaxRequestBodySize = 2 * 1024 * 1024       // 2MB upload

	// Retries
	cfg.Retry.MaxRetries = 3
	cfg.Retry.Delay = 1 * time.Second
	cfg.Retry.EnableJitter = true

	// Request defaults
	cfg.Defaults.UserAgent = "my-service/1.0"
	cfg.Defaults.FollowRedirects = true
	cfg.Defaults.MaxRedirects = 5

	// Middleware
	cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
		httpc.RecoveryMiddleware(),
		httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: log.Printf}),
		httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),
	}

	client, err := httpc.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer func() { _ = client.Close() }()
	log.Println("production client ready")
}
```

### Secure Client (Handling User URLs)

```go
func createSecureClient() (httpc.Client, error) {
	cfg := httpc.SecureConfig()
	cfg.Security.CookieSecurity = httpc.StrictCookieSecurityConfig()
	cfg.Security.RedirectWhitelist = []string{"api.example.com"}
	// SecureConfig already sets FollowRedirects = false, AllowPrivateIPs = false, 5MB response cap
	return httpc.New(cfg)
}
```

## Check Commands

Run the following commands in CI or before commit to scan for high-risk configurations:

```bash
# Check for misuse of TestingConfig (excluding test files)
grep -r "TestingConfig" --include="*.go" | grep -v "_test.go"

# Check InsecureSkipVerify = true
grep -rn "InsecureSkipVerify.*true\|InsecureSkipVerify:\s*true" --include="*.go" | grep -v "_test.go"

# Check AllowPrivateIPs = true (dangerous in production)
grep -rn "AllowPrivateIPs.*true\|AllowPrivateIPs:\s*true" --include="*.go" | grep -v "_test.go"

# Check whether MaxRequestBodySize is set (default 0 = unlimited)
grep -rn "MaxRequestBodySize" --include="*.go" | grep -v "_test.go"
```

:::tip
Consider wrapping these commands as a CI step that fails the build when high-risk configurations (`TestingConfig`, `InsecureSkipVerify: true`, `AllowPrivateIPs: true` appearing in non-test code) are detected.
:::

## Next Steps

- [Security Overview](./) - Security features overview
- [SSRF Protection](./ssrf) - SSRF defense in depth
- [TLS and Certificate Pinning](./tls-certpin) - Certificate pinning in production
- [Configuration API](../api-reference/client-config/config) - Complete configuration reference
