---
sidebar_label: "配置"
title: "配置 - CyberGo HTTPC | Config 与预设"
description: "HTTPC 配置系统 API 参考：Config 结构体及 Timeouts、Connection、Security、Retry、Middleware 子配置、DefaultConfig 等五种预设与 ValidateConfig 验证的完整字段说明。"
sidebar_position: 1
---

# 配置

## Config

```go
type Config struct {
    Timeouts   TimeoutConfig
    Connection ConnectionConfig
    Security   SecurityConfig
    Retry      RetryConfig
    Middleware MiddlewareConfig
    Defaults   RequestDefaults
}
```

主配置结构体，五个子配置与 `Defaults` 均为**值类型**。通过 `DefaultConfig()` 获取安全默认值，返回的 Config 可直接修改字段。

```go
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 60 * time.Second
cfg.Retry.MaxRetries = 5
client, err := httpc.New(cfg)
```

## TimeoutConfig

```go
type TimeoutConfig struct {
    Request        time.Duration // 总请求超时（含重试），默认 180s
    Dial           time.Duration // TCP 连接超时，默认 10s
    TLSHandshake   time.Duration // TLS 握手超时，默认 10s
    ResponseHeader time.Duration // 等待响应头超时，默认 0（禁用，依赖上下文超时）
    IdleConn       time.Duration // 空闲连接保持时间，默认 90s
}
```

| 字段 | 默认值 | 最大值 |
|------|--------|--------|
| Request | 180s | 30min |
| Dial | 10s | 30min |
| TLSHandshake | 10s | 30min |
| ResponseHeader | 0 | 30min |
| IdleConn | 90s | 30min |

设为 0 表示无超时（生产环境不推荐）。

:::tip ResponseHeader 设计
`ResponseHeader` 默认为 0（禁用），此时使用 `TimeoutConfig.Request` 或 `WithTimeout()` 作为唯一的超时机制，确保 `WithTimeout()` 对请求持续时间有完全控制。此设计适合 AI API 和长轮询等需要扩展响应时间的场景。仅在需要传输层硬性上限（如防御 Slowloris 攻击）时设为正值，但需注意这会覆盖 `WithTimeout`。
:::

## ProxyStrategy

```go
type ProxyStrategy = proxypool.Strategy

const (
    ProxyStrategyRoundRobin = proxypool.StrategyRoundRobin // 轮询（默认）
    ProxyStrategyRandom     = proxypool.StrategyRandom     // 随机
)
```

代理池选择策略。

| 常量 | 说明 |
|------|------|
| `ProxyStrategyRoundRobin` | 轮询（默认），每次选择推进到下一个代理，重试时自然落到不同 IP |
| `ProxyStrategyRandom` | 随机，从健康代理中均匀随机选择 |

## ConnectionConfig

```go
type ConnectionConfig struct {
    MaxIdleConns           int           // 全局最大空闲连接，默认 50
    MaxConnsPerHost        int           // 每主机最大连接数，默认 10
    ProxyURL               string        // 代理地址，如 "http://proxy:8080"
    EnableSystemProxy      bool          // 自动检测系统代理，默认 false
    ProxyPool              []string      // 代理服务器列表，用于轮换
    ProxyPoolStrategy      ProxyStrategy // 代理选择策略，默认 RoundRobin
    ProxyFailureThreshold  int           // 连续失败次数阈值，0 默认为 3
    ProxyCooldown            time.Duration // 断路冷却时间，0 默认为 30s
    ProxyRotatePerRequest    bool          // 每次独立请求强制换代理，默认 false
    ProxyRotateOnStatus      []int         // 触发代理轮换的 HTTP 状态码
    EnableHTTP2            bool          // 启用 HTTP/2，默认 true
    EnableCookies          bool          // 启用 Cookie 管理，默认 false
    EnableDoH              bool          // 启用 DNS-over-HTTPS，默认 false
    DoHCacheTTL            time.Duration // DoH 缓存 TTL，默认 5min
    MaxResponseHeaderBytes int64         // 响应头最大字节数，默认 0（使用 Go 标准库默认 10MB）
}
```

### 代理池

`ProxyPool` 指定一组代理服务器，请求按 `ProxyPoolStrategy` 在代理间分发。连接失败（dial/TLS）会触发被动熔断：累计 `ProxyFailureThreshold` 次失败后，该代理临时移出轮换，`ProxyCooldown` 后恢复（半开探测）。

优先级：低于 `ProxyURL`，高于 `EnableSystemProxy`。若同时设置 `ProxyURL` 和 `ProxyPool`，`ProxyURL` 生效（单代理模式）。

`ProxyRotateOnStatus` 指定触发换代理重试的 HTTP 状态码（如 `[]int{403}` 用于 CF/WAF 基于 IP 的封锁）。与连接失败不同，状态码轮换**不会**熔断代理——封锁往往是目标特定的（一个代理在某站点被封，在另一站点可能正常）。需 `Retry.MaxRetries > 0` 才生效。

`ProxyRotatePerRequest` 确保每个独立请求（如每次 `Get`/`Post` 调用）使用不同的代理。不启用时，HTTP 连接复用会导致对同一主机的连续请求复用前一次请求的代理隧道，绕过代理池选择。启用后，每次请求开始时关闭空闲连接，强制 Transport 重新评估代理池——这增加了少量开销（无连接复用），但保证按请求轮换。需设置 `ProxyPool` 才生效；对 `ProxyURL` 或无代理池配置无效。

:::tip ProxyRotatePerRequest vs ProxyRotateOnStatus
两者都用于代理轮换，但触发机制不同：`ProxyRotateOnStatus` 在**收到特定状态码**时触发重试轮换（被动，需配合重试），`ProxyRotatePerRequest` 在**每次请求开始**时主动切换代理（无需重试）。对同一主机的爬虫/数据采集场景，`ProxyRotatePerRequest` 可确保每次请求的源 IP 不同。
:::

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyPool = []string{
    "http://proxy1:8080",
    "http://proxy2:8080",
    "http://proxy3:8080",
}
cfg.Connection.ProxyPoolStrategy = httpc.ProxyStrategyRoundRobin
cfg.Connection.ProxyFailureThreshold = 3
cfg.Connection.ProxyCooldown = 30 * time.Second
cfg.Connection.ProxyRotateOnStatus = []int{403}
```

### DNS-over-HTTPS

启用 DoH 减少 DNS 解析延迟和防止 DNS 劫持：

```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableDoH = true
cfg.Connection.DoHCacheTTL = 5 * time.Minute
```

默认 DoH 提供商（按优先级）：Cloudflare → Google → AliDNS。详见 [连接池](../../guides/connection-pool)。

## SecurityConfig

```go
type SecurityConfig struct {
    TLSConfig               *tls.Config           // 自定义 TLS 配置
    MinTLSVersion           uint16                // 最低 TLS 版本，默认 TLS 1.2
    MaxTLSVersion           uint16                // 最高 TLS 版本，默认 TLS 1.3
    InsecureSkipVerify      bool                  // 跳过证书验证（仅测试用）
    MaxResponseBodySize     int64                 // 响应体大小限制，默认 10MB
    MaxRequestBodySize      int64                 // 请求体大小限制，默认 0（不限制请求体大小；与 MaxResponseBodySize 不同，无自动回退）
    MaxDecompressedBodySize int64                 // 解压后大小限制，默认 100MB
    AllowPrivateIPs         bool                  // 允许私有 IP，默认 false
    SSRFExemptCIDRs         []string              // SSRF 豁免 CIDR
    ValidateURL             bool                  // URL 验证，默认 true
    ValidateHeaders         bool                  // 请求头验证，默认 true
    StrictContentLength     bool                  // 严格 Content-Length，默认 true
    CookieSecurity          *CookieSecurityConfig // Cookie 安全验证
    CertificatePinner       CertificatePinner     // 证书固定（SPKI 哈希/公钥），默认 nil（禁用）
    RedirectWhitelist       []string              // 重定向白名单域名
}
```

### 证书固定（CertificatePinner）

`CertificatePinner` 启用证书固定：TLS 握手在服务端未提供已固定密钥/证书时将被拒绝，即便受信任 CA 被攻破也可防御中间人攻击。默认 `nil`（禁用）。通过以下构造函数创建：

| 构造函数 | 说明 |
|----------|------|
| `NewSPKIHashPinner(hashes ...string) (CertificatePinner, error)` | 由一个或多个 base64 编码的 SPKI SHA-256 哈希创建（最常用，支持密钥轮换） |
| `NewPublicKeyPinner(publicKeys ...[]byte) (CertificatePinner, error)` | 由 DER 编码的 PKIX 公钥创建（内部计算 SHA-256） |
| `NewCertificatePinnerChain(pinners ...CertificatePinner) CertificatePinner` | 组合多个 pinner，任一通过即接受 |

```go
pinner, err := httpc.NewSPKIHashPinner(
    "YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2fuihg=", // 当前密钥
    "C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=", // 备用密钥（轮换）
)
if err != nil {
    log.Fatal(err)
}

cfg := httpc.DefaultConfig()
cfg.Security.CertificatePinner = pinner
client, err := httpc.New(cfg)
```

:::warning 维护成本
证书固定要求在服务端更换证书（如 Let's Encrypt 续期）时同步更新固定值。建议固定多个哈希（当前 + 备用）并建立更新机制，避免因密钥轮换导致连接中断。
:::

:::warning SSRF 防护
`AllowPrivateIPs` 默认为 `false`，阻止连接到私有/保留 IP（127.0.0.1、10.x、192.168.x 等）。仅在连接内部服务时设为 `true`。
:::

### SSRF 豁免示例

```go
cfg := httpc.DefaultConfig()
cfg.Security.SSRFExemptCIDRs = []string{
    "10.0.0.0/8",       // VPC 内部
    "100.64.0.0/10",    // Tailscale
}
```

## RetryConfig

```go
type RetryConfig struct {
    MaxRetries    int           // 最大重试次数，默认 3
    Delay         time.Duration // 初始重试延迟，默认 1s
    BackoffFactor float64       // 退避倍数，默认 2.0
    EnableJitter  bool          // 启用抖动，默认 true
    MaxRetryDelay time.Duration // 最大重试延迟上限，默认 30s
    CustomPolicy  RetryPolicy   // 自定义重试策略
}
```

| 字段 | 默认值 | 范围 |
|------|--------|------|
| MaxRetries | 3 | 0-10 |
| Delay | 1s | 0-30min |
| BackoffFactor | 2.0 | 1.0-10.0 |
| MaxRetryDelay | 30s | 0-30min |

重试延迟公式：`min(Delay * BackoffFactor^attempt + jitter, MaxRetryDelay)`

## MiddlewareConfig

```go
type MiddlewareConfig struct {
    Middlewares []MiddlewareFunc // 中间件列表，默认 nil
}
```

仅包含中间件链。请求默认值（User-Agent、默认请求头、重定向策略）已移至 [`RequestDefaults`](#requestdefaults)。

## RequestDefaults

```go
type RequestDefaults struct {
    UserAgent       string            // User-Agent，默认 "httpc/1.0"
    Headers         map[string]string // 默认请求头，默认空
    FollowRedirects bool              // 跟随重定向，默认 true
    MaxRedirects    int               // 最大重定向次数，默认 10
}
```

每请求默认值的规范位置：User-Agent、默认请求头、重定向策略。通过 `DefaultConfig()` 获取合理默认值后按需修改。

```go
cfg := httpc.DefaultConfig()
cfg.Defaults.UserAgent = "myapp/2.0"
cfg.Defaults.Headers = map[string]string{"Accept": "application/json"}
cfg.Defaults.MaxRedirects = 5
```

## 配置预设

### DefaultConfig

```go
func DefaultConfig() Config
```

安全默认配置。SSRF 防护默认开启。

### SecureConfig

```go
func SecureConfig() Config
```

安全优先配置。更短的超时、禁用自动重定向、严格的 SSRF 防护。

| 配置项 | 值 |
|--------|-----|
| Request 超时 | 15s |
| Dial 超时 | 5s |
| TLSHandshake 超时 | 5s |
| ResponseHeader 超时 | 10s（Slowloris 防御） |
| IdleConn 超时 | 30s |
| MaxIdleConns | 20 |
| MaxConnsPerHost | 5 |
| MaxResponseBodySize | 5MB |
| MaxRetries | 1 |
| Delay | 2s |
| EnableJitter | true |
| FollowRedirects | false |

### PerformanceConfig

```go
func PerformanceConfig() Config
```

高吞吐配置。更大连接池、更长超时，保持安全验证。

:::tip
PerformanceConfig 保持 `ValidateURL` 和 `ValidateHeaders` 开启以确保安全性。在可信环境中如需最大性能，可手动关闭：`cfg.Security.ValidateURL = false`，但需注意安全风险（注入攻击、SSRF）。
:::

| 配置项 | 值 |
|--------|-----|
| Request 超时 | 60s |
| Dial 超时 | 15s |
| TLSHandshake 超时 | 15s |
| ResponseHeader 超时 | 0（禁用，使用 Request 超时） |
| IdleConn 超时 | 120s |
| MaxIdleConns | 100 |
| MaxConnsPerHost | 20 |
| EnableCookies | true |
| MaxResponseBodySize | 50MB |
| StrictContentLength | false |
| ValidateURL | true |
| ValidateHeaders | true |
| Delay | 500ms |
| BackoffFactor | 1.5 |
| EnableJitter | true |

### TestingConfig

```go
func TestingConfig() Config
```

测试环境配置。禁用安全检查、短超时。

| 配置项 | 值 |
|--------|-----|
| Dial 超时 | 5s |
| TLSHandshake 超时 | 5s |
| ResponseHeader 超时 | 0（禁用，使用 Request 超时） |
| IdleConn 超时 | 30s |
| MaxIdleConns | 10 |
| MaxConnsPerHost | 5 |
| EnableHTTP2 | false |
| EnableCookies | true |
| InsecureSkipVerify | true |
| AllowPrivateIPs | true |
| ValidateURL | false |
| ValidateHeaders | false |
| MaxRetries | 1 |
| Delay | 100ms |
| EnableJitter | false |
| UserAgent | httpc-test/1.0 |

:::danger
此配置禁用 TLS 验证和 SSRF 防护，**仅用于测试**。在非测试环境使用会打印安全警告（详见 [安全警告输出](#setsecuritywarnoutput)）。
:::

### MinimalConfig

```go
func MinimalConfig() Config
```

轻量级配置。禁用重试和重定向，最小连接池。

| 配置项 | 值 |
|--------|-----|
| Dial 超时 | 5s |
| TLSHandshake 超时 | 5s |
| ResponseHeader 超时 | 0（禁用，使用 Request 超时） |
| IdleConn 超时 | 30s |
| MaxIdleConns | 10 |
| MaxConnsPerHost | 2 |
| MaxResponseBodySize | 1MB |
| MaxRetries | 0 |
| Delay | 0 |
| BackoffFactor | 1.0 |
| EnableJitter | false |
| FollowRedirects | false |

## 安全警告输出

### SetSecurityWarnOutput

```go
func SetSecurityWarnOutput(w io.Writer)
```

重定向安全警告的输出目标。当使用 `TestingConfig()` 或将 `SecurityConfig.InsecureSkipVerify`（`Config.Security`）设为 `true` 时，httpc 会向该 writer 打印 `[SECURITY WARNING]` 级别的告警（每种警告每进程最多打印一次）。默认输出到 `os.Stderr`；传入 `io.Discard` 可完全抑制警告，便于测试或已知安全的内部场景静默运行。

```go
// 测试中抑制安全警告
httpc.SetSecurityWarnOutput(io.Discard)
cfg := httpc.TestingConfig()
```

:::tip 影响范围
此设置是进程级全局状态，影响所有后续创建的客户端。`TestingConfig` 与 `InsecureSkipVerify` 两种告警各自独立计数（互不影响触发），但共享同一输出 writer。
:::

## 验证

### ValidateConfig

```go
func ValidateConfig(cfg *Config) error
```

验证配置有效性。`New()` 内部会自动调用，也可显式调用。

```go
cfg := httpc.DefaultConfig()
cfg.Retry.MaxRetries = 100 // 超出范围

if err := httpc.ValidateConfig(&cfg); err != nil {
    log.Fatal(err) // invalid retry configuration: Retry.MaxRetries must be 0-10, got 100
}
```

### Config.String

```go
func (c *Config) String() string
```

返回安全的字符串表示。ProxyURL 凭据会被脱敏，TLSConfig 显示为 `<configured>` 或 `<default>`，Headers 不会被输出。

```go
cfg := httpc.DefaultConfig()
fmt.Println(cfg.String())
// Config{Timeouts:{Request: 3m0s, ...}, Security:{TLSConfig: <default>, ...}}
```

## Cookie 安全

### CookieSecurityConfig

```go
type CookieSecurityConfig struct {
    RequireSecure                bool
    RequireHttpOnly              bool
    RequireSameSite              string
    AllowSameSiteNone            bool
    RequireSecureForSameSiteNone bool
}
```

Cookie 安全属性验证配置。

| 字段 | 类型 | 说明 |
|------|------|------|
| RequireSecure | `bool` | 要求 Cookie 设置 Secure 属性 |
| RequireHttpOnly | `bool` | 要求 Cookie 设置 HttpOnly 属性 |
| RequireSameSite | `string` | 要求的 SameSite 值，如 `"Strict"`、`"Lax"`；空字符串表示不检查 |
| AllowSameSiteNone | `bool` | 是否允许 SameSite=None |
| RequireSecureForSameSiteNone | `bool` | SameSite=None 时要求 Secure 属性（默认 `true`） |

### DefaultCookieSecurityConfig

```go
func DefaultCookieSecurityConfig() *CookieSecurityConfig
```

默认 Cookie 安全配置。不要求 Secure/HttpOnly/SameSite 属性，但强制 SameSite=None 的 Cookie 必须设置 Secure。

### StrictCookieSecurityConfig

```go
func StrictCookieSecurityConfig() *CookieSecurityConfig
```

严格 Cookie 安全配置。要求 Secure、HttpOnly 和 SameSite=Strict。

```go
cfg := httpc.DefaultConfig()
cfg.Security.CookieSecurity = httpc.StrictCookieSecurityConfig()
```
