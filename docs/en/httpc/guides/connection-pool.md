---
sidebar_label: "Connection Pool & DNS"
title: "Connection Pool & DNS - CyberGo HTTPC | Pool Tuning & DoH"
description: "HTTPC connection pool and DNS guide: MaxIdleConns and MaxConnsPerHost tuning, connection caps, TIME_WAIT mitigation, DoH fallback, and HTTP/2 multiplexing."
sidebar_position: 10
---

# Connection Pool & DNS

## Connection Pool Configuration

The connection pool is a key factor in HTTP client performance. HTTPC manages it through `ConnectionConfig`.

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
| `MaxConnsPerHost` | 10 | Max connections per host (active + idle) |
| `IdleConn` | 90s | Idle connection timeout; closed after expiry |
| `Dial` | 10s | Connection establishment timeout |
| `TLSHandshake` | 10s | TLS handshake timeout |
| `ResponseHeader` | 0 | Disabled (uses the Request timeout) |
| `MaxResponseHeaderBytes` | 0 | Response header size cap; 0 = Go standard-library default of 10MB |

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

### Derived Parameters and Internal Caps

Some connection parameters have no dedicated configuration field — the engine **derives** them from existing parameters or uses fixed values:

| Parameter | Value | Source |
|-----------|-------|--------|
| `MaxIdleConnsPerHost` | `clamp(MaxConnsPerHost/2, 2, 10)`; 10 when `MaxConnsPerHost=0` | Derived from `MaxConnsPerHost`, no separate field |
| Total connection cap per client | 1000 (active + idle) | Fixed value; exceeding it returns a pool-exhausted error |
| TCP keepalive probe interval | 30s | Fixed value |
| `ExpectContinueTimeout` | 1s | Fixed value (wait for `Expect: 100-continue`) |

:::warning What hitting the total cap looks like
When the 1000-connection cap is reached, new connections fail with an error classified as `ClientError` (`ErrorTypeNetwork`, message `connection pool exhausted`). With the default `MaxIdleConns=50` / `MaxConnsPerHost=10` it is nearly impossible to trigger — treat it as the last line of defense under extreme concurrency.
:::

### Idle Connection Management

- **`IdleConn` (default 90s)**: idle connections are closed automatically when the transport-level timeout expires. Raise it for higher connection reuse; lower it to release peer-side resources sooner (watch for TIME_WAIT buildup in high-frequency short-connection workloads).
- **Active cleanup during proxy rotation**: enabling `ProxyRotatePerRequest` or the retry path of status-code rotation **automatically closes all idle connections**, forcing the next request to re-select a proxy — otherwise HTTP/2 connection reuse through CONNECT tunnels would bypass proxy selection and defeat the rotation. For proxy configuration and rotation strategies, see [Proxy & Proxy Pool](./proxy).
- **`client.Close()`**: closes all idle connections, the DoH resolver, and internal resources; requests afterwards return `ErrClientClosed`.
- **Automatic cleanup of per-host stats**: internally, connection counts are tracked per host, and entries with no activity for 30 minutes and no active connections are periodically pruned (at most once per minute, host-entry cap of 10000), so long-running processes never grow memory without bound.

### Response Decompression Handling

The transport layer **disables the standard library's transparent decompression**; HTTPC handles `gzip` / `deflate` manually at the response-processing layer: decompression is bounded by `Security.MaxDecompressedBodySize` (default 100MB), defending against decompression-bomb attacks. Day to day you do not need to think about this layer — just know that `Result.RawBody()` already returns decompressed bytes.

## DNS-over-HTTPS

With DoH enabled, DNS resolution goes over an encrypted HTTPS channel, preventing ISP hijacking and DNS poisoning, with built-in multi-provider failover:

```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableDoH = true
cfg.Connection.DoHCacheTTL = 5 * time.Minute // passing 0 also falls back to 5 minutes
```

Default DoH providers (in priority order):

| Provider | Address | Description |
|----------|---------|-------------|
| Cloudflare | `1.1.1.1/dns-query` | Fastest, privacy-first |
| Google | `dns.google/resolve` | Global coverage |
| AliDNS | `dns.alidns.com/resolve` | Optimized for the China region |

### How It Works

- **Parallel A + AAAA queries**: every resolution queries IPv4 and IPv6 records simultaneously and merges the results.
- **Dual-format parsing**: picks JSON (Google/AliDNS style) or RFC 1035 wire format (Cloudflare style) automatically based on the response `Content-Type`; when missing or unrecognized, it tries JSON first, then wire, staying compatible with misconfigured servers.
- **Concurrent merging**: concurrent cache misses for the same host collapse into a single network round trip (singleflight), preventing cache stampedes from hammering providers.
- **Dedicated internal client**: DoH requests go through a dedicated HTTP client (5s timeout, HTTP/2 enabled) that does not consume the business connection pool or the request timeout budget.

### Fallback Chain

```text
Cloudflare (1.1.1.1) → Google (dns.google) → AliDNS → system DNS resolver
```

The first successful provider wins; if all fail, it automatically falls back to the system DNS resolver and merges both layers of errors into the message. A single provider outage never fails a request.

### Caching

| Item | Value |
|------|-------|
| TTL | `DoHCacheTTL` (default 5 minutes) |
| Capacity cap | 1000 entries; when full, expired entries are evicted first, then the ones closest to expiry |
| Response size cap | 64KB (protects against malicious DNS responses blowing up memory) |

### Interaction with SSRF Protection

IPs resolved by DoH are first run through the SSRF filter (dropping private/reserved addresses, honoring `SSRFExemptCIDRs`), then **dialed directly to the validated IP** — there is no second DNS resolution between validation and dialing, which defeats DNS rebinding attacks at the root. Proxy addresses do not go through DoH resolution (proxies are configured explicitly by the developer and dialed directly; see [Proxy & Proxy Pool](./proxy)). For the full picture, see [SSRF Protection](../security/ssrf).

## HTTP/2

HTTP/2 is enabled by default (requires TLS):

```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableHTTP2 = false // disable HTTP/2
```

HTTP/2 features:
- Multiplexing: a single connection handles multiple concurrent requests
- Header compression: reduces repeated header transmission
- Server push

When disabled, the transport no longer attempts HTTP/2 negotiation at all (including the forced attempt for custom TLS configurations); plaintext HTTP/2 (h2c) is not supported. Note that HTTP/2 multiplexing means "concurrent requests to the same host share one connection" — exactly why proxy-rotation scenarios need idle connections closed (see per-request rotation in [Proxy & Proxy Pool](./proxy)).

## Object Pool Reuse

Internally, HTTPC reuses engine response objects and string builders via sync.Pool to reduce GC pressure; Result itself is created fresh per request and reclaimed by GC.

```go
result, err := client.Get(url)
if err != nil {
    return err
}
// Result is created fresh per request, reclaimed by GC, no manual release needed
```

In high-concurrency scenarios, internal object-pool reuse significantly reduces GC pressure.

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
| Many TIME_WAIT | Idle connection timeout too short | Increase the `IdleConn` timeout |
| Connection refused | Insufficient connections per host | Increase `MaxConnsPerHost` |
| Requests queuing | Connection pool too small | Increase `MaxIdleConns` |
| Want to control idle connections per host | No dedicated configuration field | Derived from `MaxConnsPerHost` (÷2, clamped to 2–10) |
| Resolution fails after enabling DoH | All DoH providers unreachable/timing out | Built-in fallback to system DNS; check the egress network or keep defaults |
| Proxy not working or frequently circuit-broken | Interaction between proxy configuration and connection reuse | See the [Proxy & Proxy Pool](./proxy) common issues |

For complete performance anti-patterns and optimization advice, see [Performance Optimization](./performance).

## Next Steps

- [Performance Optimization](./performance) - Performance tuning guide
- [Proxy & Proxy Pool](./proxy) - Single proxy, system proxy, and pool rotation with circuit breaking
- [Configuration API](../api-reference/client-config/config) - Connection configuration field reference
- [Security Overview](../security/) - SSRF and TLS security
