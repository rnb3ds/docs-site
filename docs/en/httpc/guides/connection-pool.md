---
sidebar_label: "Connection Pool & Proxy"
title: "Connection Pool & Proxy - CyberGo HTTPC | Pool Tuning"
description: "HTTPC connection pool and proxy configuration guide: MaxIdleConns pool parameter tuning with scenario recommendations, manual ProxyURL proxy and SOCKS5, EnableSystemProxy system-proxy detection, ProxyPool proxy rotation and passive circuit breaking, ProxyRotatePerRequest per-request rotation, ProxyRotateOnStatus status-code rotation, and DoH and HTTP/2 configuration practices."
sidebar_position: 8
---

# Connection Pool & Proxy

## Connection Pool Configuration

Connection pools are a key factor in HTTP client performance. HTTPC uses `ConnectionConfig` to manage connection pools.

```go
cfg := httpc.DefaultConfig()

// Connection pool parameters
cfg.Connection.MaxIdleConns = 100         // Global max idle connections
cfg.Connection.MaxConnsPerHost = 20       // Max connections per host
cfg.Timeouts.IdleConn = 120 * time.Second // Idle connection keep-alive
```

### Parameter Description

| Parameter | Default | Description |
|-----------|---------|-------------|
| `MaxIdleConns` | 50 | Global max idle connections |
| `MaxConnsPerHost` | 10 | Max connections per host (including active + idle) |
| `IdleConn` | 90s | Idle connection timeout; closed after expiry |
| `Dial` | 10s | Connection establishment timeout |
| `TLSHandshake` | 10s | TLS handshake timeout |
| `ResponseHeader` | 0 | Disabled (uses Request timeout) |

### Scenario Recommendations

| Scenario | MaxIdleConns | MaxConnsPerHost | IdleConn |
|----------|-------------|-----------------|----------|
| High-concurrency API | 100 | 20 | 120s |
| General service | 50 | 10 | 90s |
| Low-frequency requests | 10 | 2 | 30s |
| Internal microservices | 50 | 10 | 60s |

:::tip
`MaxConnsPerHost` includes both active and idle connections. New requests exceeding this limit queue until a connection is released.
:::

## Proxy

HTTPC supports four proxy modes, selected automatically by priority. All proxy settings are configured in `ConnectionConfig`.

### Manual Proxy

Specify a fixed proxy via `ProxyURL` (highest priority):

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyURL = "http://proxy.example.com:8080"

client, _ := httpc.New(cfg)
```

Proxy with authentication:

```go
cfg.Connection.ProxyURL = "http://user:password@proxy.example.com:8080"
```

:::tip
`Config.String()` automatically masks the username and password in proxy URLs.
:::

### SOCKS5 Proxy

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyURL = "socks5://proxy.example.com:1080"
```

### System Proxy Auto-Detection

Enable to auto-detect OS proxy settings without specifying `ProxyURL` manually:

```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableSystemProxy = true
```

| Platform | Source |
|----------|--------|
| Windows | Registry Internet Settings |
| macOS | System Preferences Network Proxy |
| Linux | Environment variables `HTTP_PROXY` / `HTTPS_PROXY` |

### Proxy Pool

When you need to distribute requests across multiple proxy IPs (scraping, load dispersion, IP rotation), the proxy pool provides automatic rotation, passive circuit breaking, and status-based switching — no external components required.

#### Basic Usage

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyPool = []string{
    "http://proxy1:8080",
    "http://proxy2:8080",
    "http://proxy3:8080",
}
cfg.Connection.ProxyPoolStrategy = httpc.ProxyStrategyRoundRobin // default

client, err := httpc.New(cfg)
```

Each request automatically selects a proxy from the pool. Supports `http`, `https`, `socks5`, `socks5h` protocols.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `ProxyPool` | `[]string` | `nil` | List of proxy URLs |
| `ProxyPoolStrategy` | `ProxyStrategy` | `RoundRobin` | Selection strategy |
| `ProxyFailureThreshold` | `int` | `3` (0 falls back) | Consecutive failure threshold for circuit breaking |
| `ProxyCooldown` | `time.Duration` | `30s` (0 falls back) | Cooldown for circuit-broken proxies |
| `ProxyRotatePerRequest` | `bool` | `false` | Force a different proxy for each independent request (disables idle connection reuse) |
| `ProxyRotateOnStatus` | `[]int` | `nil` | Status codes that trigger proxy rotation |

#### Selection Strategy

| Strategy | Constant | Description |
|----------|----------|-------------|
| Round-robin | `ProxyStrategyRoundRobin` | Cycles through proxies in order; retries land on the next proxy |
| Random | `ProxyStrategyRandom` | Picks a healthy proxy uniformly at random |

Round-robin (default) automatically selects a different proxy IP on retry — each retry advances the cursor, naturally landing on the next proxy without extra configuration.

#### Passive Circuit Breaking

The proxy pool has built-in passive health checking. Only **connection-level failures** (dial/TLS) trigger circuit breaking; HTTP status codes do not:

```text
Proxy connection failure
    ↓
Failure count +1
    ↓
Consecutive failures ≥ ProxyFailureThreshold → Circuit open (removed from rotation)
    ↓
Wait ProxyCooldown → Half-open probe (restored to rotation)
    ↓
Success → Reset count, close circuit
First failure → Re-open circuit
```

```go
cfg.Connection.ProxyFailureThreshold = 5           // More tolerant of transient issues
cfg.Connection.ProxyCooldown = 60 * time.Second    // Longer cooldown
```

When all proxies are circuit-broken, the proxy with the shortest cooldown (closest to recovery) is returned as a fallback, rather than failing outright.

#### Status-Based Rotation

For Cloudflare/WAF IP-blocking scenarios — automatically retries with a different proxy when specific status codes are returned:

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyPool = []string{
    "http://proxy1:8080",
    "http://proxy2:8080",
    "http://proxy3:8080",
}
cfg.Connection.ProxyRotateOnStatus = []int{403}  // Rotate proxy on 403
cfg.Retry.MaxRetries = 3                          // Retry must be enabled

client, err := httpc.New(cfg)
```

:::warning Status Rotation ≠ Circuit Breaking
`ProxyRotateOnStatus`-triggered rotation does **not** circuit-break proxies — IP blocks are often target-specific (a proxy blocked on site A may work fine on site B). Circuit breaking is only triggered by connection-level failures. Requires `Retry.MaxRetries > 0`.

When `ProxyRotateOnStatus` is set and the pool has multiple proxies, the retry budget is automatically raised to `len(ProxyPool) - 1` (capped at `MaxRetries` limit of 10), ensuring every proxy gets a chance.
:::

#### Per-Request Rotation

`ProxyRotatePerRequest` solves the problem of **connection reuse** causing proxy-tunnel pinning: HTTP connection pools reuse established TCP connections, including their proxy tunnels. This means consecutive requests to the same host reuse the previous request's proxy, even when `ProxyPoolStrategy` has already rotated the selector cursor.

When enabled, all idle connections are closed at the start of each request, forcing the Transport to re-evaluate the proxy pool — the trade-off is no connection reuse (each request establishes a new connection + proxy tunnel), but it guarantees per-request rotation:

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyPool = []string{
    "http://proxy1:8080",
    "http://proxy2:8080",
    "http://proxy3:8080",
}
cfg.Connection.ProxyRotatePerRequest = true  // Rotate proxy on each request

client, err := httpc.New(cfg)
```

:::tip
Suited for scraping/data collection targeting the same host — each request has a different source IP, reducing the risk of being IP-blocked by the target site. For requests to different hosts, connection reuse does not pin the same proxy, so it is typically unnecessary to enable.
:::

Like `ProxyRotateOnStatus`, `ProxyRotatePerRequest` also automatically raises the retry budget to `len(ProxyPool) - 1` when the pool has multiple proxies, ensuring each proxy is tried at least once.

### Proxy Priority

When multiple proxy modes are configured simultaneously, they take effect by priority:

| Priority | Setting | Behavior |
|----------|---------|----------|
| 1 (highest) | `ProxyURL` | Always use the specified proxy (single-proxy mode) |
| 2 | `ProxyPool` | Rotate across the proxy pool |
| 3 | `EnableSystemProxy` | Auto-detect system proxy |
| 4 (lowest) | None | Direct connection |

:::tip
If both `ProxyURL` and `ProxyPool` are set, `ProxyURL` takes effect. To use the proxy pool, clear `ProxyURL`.
:::

### Built-in Security

Proxy-related features automatically handle the following security details — no manual configuration needed:

- **SSRF exemption**: Proxy host addresses are automatically added to the SSRF exemption list, never blocked by private-IP checks
- **Deduplication**: Entries with the same `host:port` are automatically merged, preventing rotation skew and duplicate counting
- **URL validation**: All proxy URLs are security-validated (CRLF injection protection, protocol whitelist)

For complete field descriptions, see [Configuration API — Proxy Pool](../api-reference/client-config/config#proxy-pool).

## DNS-over-HTTPS

Enable DoH to reduce DNS resolution latency and prevent DNS hijacking:

```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableDoH = true
cfg.Connection.DoHCacheTTL = 5 * time.Minute
```

Default DoH providers (in priority order):

| Provider | Address | Description |
|----------|---------|-------------|
| Cloudflare | `1.1.1.1/dns-query` | Fastest, privacy-first |
| Google | `dns.google/resolve` | Global coverage |
| AliDNS | `dns.alidns.com/resolve` | Optimized for China region |

:::tip
When DoH is enabled, DNS resolution results are cached for `DoHCacheTTL` duration. If all DoH providers are unavailable, it falls back to system DNS.
:::

## HTTP/2

HTTP/2 is enabled by default (requires TLS):

```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableHTTP2 = false // Disable HTTP/2
```

HTTP/2 features:
- Multiplexing: Single connection handles multiple concurrent requests
- Header compression: Reduces repeated header transmission
- Server push

## Object Pool Reuse

Internally, HTTPC reuses engine response objects and string builders via sync.Pool to reduce GC pressure; Result itself is created fresh per request and reclaimed by GC.

```go
result, err := client.Get(url)
if err != nil {
    return err
}
// Result is created fresh per request, reclaimed by GC, no manual release needed
```

In high-concurrency scenarios, internal object pool reuse significantly reduces GC pressure.

## Concurrent Request Pattern

```go
func fetchAll(ctx context.Context, urls []string) ([]*httpc.Result, error) {
    results := make([]*httpc.Result, len(urls))
    errs := make([]error, len(urls))

    var wg sync.WaitGroup
    for i, url := range urls {
        wg.Add(1)
        go func(idx int, u string) {
            defer wg.Done()
            result, err := client.Request(ctx, "GET", u)
            results[idx] = result
            errs[idx] = err
        }(i, url)
    }
    wg.Wait()

    for _, err := range errs {
        if err != nil {
            return nil, err
        }
    }
    return results, nil
}
```

## Common Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| Many TIME_WAIT | Idle connection timeout too short | Increase `IdleConn` timeout |
| Connection refused | Insufficient connections per host | Increase `MaxConnsPerHost` |
| Requests queuing | Connection pool too small | Increase `MaxIdleConns` |
| Proxy not working | Both `ProxyURL` and `ProxyPool` set | Clear `ProxyURL`, use only `ProxyPool` |
| Proxies frequently circuit-broken | `ProxyFailureThreshold` too low | Increase threshold or `ProxyCooldown` |

For complete performance anti-patterns and optimization recommendations, see [Performance Optimization](./performance).

## Next Steps

- [Performance Optimization](./performance) - Performance tuning guide
- [Configuration API](../api-reference/client-config/config) - Connection and proxy field reference
- [Security Overview](../security/) - SSRF and TLS security
