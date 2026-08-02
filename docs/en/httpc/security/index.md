---
sidebar_label: "Security Overview"
title: "Security Overview - CyberGo HTTPC | Security Features Matrix"
description: "HTTPC security features overview: TLS 1.2+ version control, SSRF private-IP blocking and CIDR exemptions, CRLF injection prevention, cookie security validation, decompression-bomb defense, redirect whitelisting, response-body and request-body size limits, and the security-warning mechanism."
sidebar_position: 1
---

# Security Overview

HTTPC follows the "Secure by Default" principle: all critical security features work out of the box, defending against common attack surfaces with no extra configuration. When handling user-provided URLs, calling external untrusted services, or running in high-security environments (finance, healthcare, government), HTTPC's layered defense serves as a reliable baseline.

## Security Feature Matrix

The table below summarizes each security feature, the corresponding `Config` field, default value, and related functions/options, so you can locate configuration entry points quickly.

| Feature | Config field | Default | Related functions / options |
|------|-------------|--------|------------------|
| TLS minimum version | `Security.MinTLSVersion` | TLS 1.2 | — |
| TLS maximum version | `Security.MaxTLSVersion` | TLS 1.3 | — |
| Custom TLS config | `Security.TLSConfig` | `nil` (use defaults) | — |
| Skip certificate verification | `Security.InsecureSkipVerify` | `false` | Testing only |
| Certificate pinning | `Security.CertificatePinner` | `nil` (disabled) | `NewSPKIHashPinner`, etc. |
| SSRF protection | `Security.AllowPrivateIPs` | `false` (on) | `WithAllowPrivateIPs` |
| Precise SSRF exemption | `Security.SSRFExemptCIDRs` | `nil` | — |
| URL validation | `Security.ValidateURL` | `true` | — |
| Header validation | `Security.ValidateHeaders` | `true` | — |
| Content-Length strict check | `Security.StrictContentLength` | `true` | — |
| Cookie security validation | `Security.CookieSecurity` | `nil` (no validation) | `StrictCookieSecurityConfig`, `WithSecureCookie` |
| Response body size limit | `Security.MaxResponseBodySize` | 10MB | — |
| Request body size limit | `Security.MaxRequestBodySize` | 0 (unlimited) | Must be set explicitly |
| Decompression-bomb defense | `Security.MaxDecompressedBodySize` | 100MB | — |
| Response header size limit | `Connection.MaxResponseHeaderBytes` | 0 (Go default 10MB) | — |
| Redirect whitelist | `Security.RedirectWhitelist` | `nil` (allow all) | — |
| Redirect count limit | `Defaults.MaxRedirects` | 10 | `WithMaxRedirects` |
| Follow redirects | `Defaults.FollowRedirects` | `true` | `WithFollowRedirects` |

:::tip
When handling user-provided URLs, simply use `httpc.SecureConfig()` for the strictest security baseline: redirects disabled, 5MB response cap, shorter timeouts, and URL/header validation enabled.
:::

## TLS Security

HTTPC requires TLS 1.2+ by default, rejecting the proven-insecure TLS 1.0/1.1:

```go
cfg := httpc.DefaultConfig()
// TLS 1.2-1.3 by default; no manual setup needed
cfg.Security.MinTLSVersion = tls.VersionTLS12
cfg.Security.MaxTLSVersion = tls.VersionTLS13
```

To force TLS 1.3 only (higher security; requires support on both client and server), set `MinTLSVersion = tls.VersionTLS13`. Once `TLSConfig` is set, `MinTLSVersion`/`MaxTLSVersion` are ignored — `TLSConfig` takes precedence.

:::warning
`InsecureSkipVerify` is for testing only. Never set it to `true` in production, or TLS encryption becomes useless and a man-in-the-middle can eavesdrop and tamper freely. When set, HTTPC prints a security warning to `stderr` in non-test environments (see "Security Warning Mechanism" below).
:::

For more TLS details (cipher suites, certificate pinning, mTLS, custom CA), see [TLS and Certificate Pinning](./tls-certpin).

## SSRF Protection

SSRF (Server-Side Request Forgery) is an attack where the attacker tricks the server into making requests to the internal network, enabling theft of cloud-metadata credentials, internal port scanning, and access to unauthenticated internal admin interfaces. HTTPC enables SSRF protection by default, blocking connections to private/reserved IP ranges.

```go
cfg := httpc.DefaultConfig()
// AllowPrivateIPs = false (default) -> blocks 127.0.0.1, 10.x, 192.168.x, 169.254.x, etc.

// Precisely exempt specific CIDRs (e.g. VPN, VPC internal services)
cfg.Security.SSRFExemptCIDRs = []string{
    "10.0.0.0/8",    // VPC internal
    "100.64.0.0/10", // Tailscale VPN
}

// Strongest SSRF protection preset
client, _ := httpc.New(httpc.SecureConfig())
```

### Blocked IP Ranges

| Range | CIDR | Description |
|------|------|------|
| IPv4 loopback | `127.0.0.0/8` | localhost |
| Class A private | `10.0.0.0/8` | Internal network |
| Class B private | `172.16.0.0/12` | Internal network |
| Class C private | `192.168.0.0/16` | Internal network |
| Link-local | `169.254.0.0/16` | Auto-configuration (incl. AWS/Azure metadata) |
| CGNAT | `100.64.0.0/10` | Carrier-grade NAT (incl. Alibaba Cloud metadata) |
| Class E reserved | `240.0.0.0/4` | Reserved addresses |
| "This network" | `0.0.0.0/8` | This-network identifier |
| TEST-NET | `192.0.2.0/24`, etc. | Documentation use |
| IPv6 loopback | `::1/128` | localhost |
| IPv6 unique local | `fc00::/7` | Internal network |
| IPv6 link-local | `fe80::/10` | Auto-configuration |

> The table above lists the main ranges. For the full list (including IPv4-mapped IPv6, NAT64 `64:ff9b::/96`, the IPv6 documentation prefix `2001:db8::/32`, etc.) see the source `isPrivateOrReservedIP`. HTTPC also blocks legacy IP literals in decimal/hex/octal form (such as `2130706433`, `0x7f000001`) to prevent bypass. See [SSRF Protection](./ssrf).

## Header Validation

`ValidateHeaders` (on by default) automatically prevents CRLF injection and header smuggling — it rejects header values containing carriage returns, line feeds, null bytes, and other control characters:

```go
// The following headers are rejected
httpc.WithHeader("X-Custom", "value\r\nInjected: header") // CRLF injection
httpc.WithHeader("X-Bad", "value\x00null")                // Control characters
```

Validation uses an O(1) lookup table with negligible overhead; `PerformanceConfig()` keeps this validation on.

## Cookie Security

HTTPC provides three layers of cookie security control: config-level (global), session-level (`SessionManager`), and request-level (`WithSecureCookie`).

### CookieSecurityConfig

`CookieSecurityConfig` defines the security attributes a cookie must satisfy, defending against CSRF, XSS, and session hijacking:

| Field | Description | Default | Strict |
|------|------|---------|--------|
| `RequireSecure` | HTTPS transport only | `false` | `true` |
| `RequireHttpOnly` | Forbid JS access | `false` | `true` |
| `RequireSameSite` | SameSite attribute | `""` (any) | `"Strict"` |
| `AllowSameSiteNone` | Allow SameSite=None | `true` | `false` |
| `RequireSecureForSameSiteNone` | None must carry Secure | `true` | `true` |

### Config-Level Validation (Global)

```go
cfg := httpc.DefaultConfig()
// Strict mode: require Secure + HttpOnly + SameSite=Strict
cfg.Security.CookieSecurity = httpc.StrictCookieSecurityConfig()

// Or customize
cfg.Security.CookieSecurity = &httpc.CookieSecurityConfig{
    RequireSecure:   true,
    RequireHttpOnly: true,
    RequireSameSite: "Lax",
}
```

### Session-Level Validation

```go
sm, _ := httpc.NewSessionManagerDefault()
// Affects all subsequent SetCookie calls regardless of insertion order
sm.SetCookieSecurity(httpc.StrictCookieSecurityConfig())
```

### Request-Level Validation

```go
security := &httpc.CookieSecurityConfig{
    RequireSecure:   true,
    RequireHttpOnly: true,
}
// Note: WithSecureCookie must come after WithCookie; it only validates cookies present at apply time
result, err := client.Get("https://api.example.com",
    httpc.WithCookie(sessionCookie),
    httpc.WithSecureCookie(security),
)
```

:::warning
`WithSecureCookie` is a request-level "after-the-fact" check: it validates only the cookies that exist when it is applied. Always place it after all `WithCookie` options. For order-independent global validation, use config-level `CookieSecurity` or session-level `SetCookieSecurity`.
:::

## Decompression-Bomb Defense

An attacker can use a highly compressed gzip/deflate response to exhaust memory (e.g. 10MB of compressed data decompressing into gigabytes). `MaxDecompressedBodySize` (default 100MB) caps the actual decompressed size, stopping decompression bombs at the source.

```go
cfg := httpc.DefaultConfig()
cfg.Security.MaxDecompressedBodySize = 50 * 1024 * 1024 // 50MB decompressed cap
```

### Priority Relationship

| Configuration | Effective limit |
|----------|----------|
| Only `MaxResponseBodySize` set | It applies (stricter) |
| Only `MaxDecompressedBodySize` set | Limits decompressed size |
| Both set | The smaller (stricter) one wins |

:::tip
`MaxResponseBodySize` limits pre-decompression transfer bytes, while `MaxDecompressedBodySize` limits post-decompression actual bytes. Together they provide dual-layer protection.
:::

## Request Body Size Limit

`MaxRequestBodySize` caps upload request-body size, preventing a client from being coerced into sending oversized requests that drain bandwidth or memory.

```go
cfg := httpc.DefaultConfig()
cfg.Security.MaxRequestBodySize = 5 * 1024 * 1024 // 5MB upload cap
```

:::warning
Unlike `MaxResponseBodySize` (default 10MB), `MaxRequestBodySize` defaults to **0 (unlimited)** and has **no automatic fallback**. When handling user uploads or proxying forwarded requests, always set an explicit cap.
:::

## Redirect Security

Redirects are a common vector for SSRF and open-redirect attacks. HTTPC provides multi-layered control:

```go
// Security-sensitive scenario: disable redirects entirely
cfg := httpc.SecureConfig() // FollowRedirects = false

// Or restrict redirect destination domains (supports wildcards *.example.com)
cfg := httpc.DefaultConfig()
cfg.Security.RedirectWhitelist = []string{
    "api.example.com",
    "auth.example.com",
    "*.cdn.example.com",
}
```

`RedirectWhitelist` supports exact matching and wildcards: `*.example.com` matches strict subdomains like `api.example.com` but not the bare domain `example.com` (list both separately if needed). Redirects to non-whitelisted domains are blocked. Redirect targets also pass SSRF IP validation.

## Response Header Size Limit

`MaxResponseHeaderBytes` caps the server response header size, preventing a malicious server from exhausting memory with oversized headers:

```go
cfg := httpc.DefaultConfig()
cfg.Connection.MaxResponseHeaderBytes = 1 * 1024 * 1024 // 1MB response header cap
```

The default 0 means the Go standard library default (10MB) is used. For high-security scenarios, consider tightening to 1MB.

## Security Warning Mechanism

HTTPC emits `stderr` warnings for high-risk configurations in non-test environments, prompting developers to fix them. Two configuration categories trigger warnings:

| Configuration | Warning trigger condition | Warning content |
|------|-------------|----------|
| `InsecureSkipVerify = true` | Detected in `httpc.New()`, non-test environment | TLS certificate verification disabled |
| `TestingConfig()` | Detected at call time, non-test environment | TLS verification, SSRF protection, URL/header validation disabled |

Warnings use `sync.Once` so each fires at most once per process, avoiding log spam. A test environment is identified by an executable suffix of `.test` / `.test.exe`, or the `GO_TEST` / `GOTEST=1` environment variable being set.

### Redirecting or Suppressing Warnings

```go
// Redirect to a custom writer (e.g. structured logging)
httpc.SetSecurityWarnOutput(os.Stdout)

// Suppress entirely (not recommended — warnings are safety guardrails and should not be silenced)
httpc.SetSecurityWarnOutput(io.Discard)
```

:::warning
`SetSecurityWarnOutput(io.Discard)` silently swallows security warnings. Use it only after fully auditing the configuration (e.g. confirming `TestingConfig` is used only by test binaries); never use it to mask warnings in a production deployment.
:::

## File Download Security

The `Download` file path passes through five layers of defense in `prepareFilePath`, guarding against path traversal and file-overwrite attacks:

1. **UNC path blocking**: rejects network paths like `\\server\share`
2. **Control-character filtering**: rejects paths containing control characters (`< 0x20`, `0x7F`, `0x00`)
3. **System-path protection**: refuses to write to `/etc`, `/bin`, `C:\Windows`, etc. (including parent-directory symlink resolution)
4. **Path-traversal detection**: after `filepath.Clean`, blocks `../` escaping the working directory
5. **Symlink defense**: rejects paths that are symlinks; recursively checks parent directories to prevent TOCTOU attacks

After download completes, you can verify file integrity via the `Checksum` field (SHA-256); on verification failure the downloaded file is automatically deleted.

## Audit Middleware

`AuditMiddleware` generates a structured audit event for each request/response cycle, suited to compliance-heavy scenarios (finance, healthcare, government). The URL is auto-sanitized (credentials removed), and sensitive request headers (Authorization, Cookie, etc.) are masked by default.

```go
auditMiddleware := httpc.AuditMiddleware(&httpc.AuditConfig{
    OnAudit: func(event httpc.AuditEvent) {
        // event.URL is sanitized; SourceIP/UserID are extracted from context
        log.Printf("[AUDIT] %s %s -> %d (%v)",
            event.Method, event.URL, event.StatusCode, event.Duration)
    },
    Format:         "json",   // text or json
    IncludeHeaders: true,     // Record request/response headers (sensitive ones masked)
    MaskHeaders:    []string{"Authorization", "Cookie", "Set-Cookie"},
    SanitizeError:  true,     // Scrub sensitive info from errors
})

cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{auditMiddleware}
```

`SourceIP` and `UserID` are injected via context keys: `httpc.SourceIPKey`, `httpc.UserIDKey`. For the full audit fields, configuration options, and production practices, see [Production Checklist](./production-checklist).

## Next Steps

- [SSRF Protection](./ssrf) - SSRF defense in depth, CIDR exemptions, and cloud-metadata protection
- [TLS and Certificate Pinning](./tls-certpin) - TLS configuration, certificate pinning, and mTLS
- [Production Checklist](./production-checklist) - Categorized pre-launch checks and verification methods
