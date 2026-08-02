---
sidebar_label: "安全概述"
title: "安全概述 - CyberGo HTTPC | 安全特性总览"
description: "HTTPC 安全特性概述：TLS 1.2+ 版本控制、SSRF 私有 IP 阻止与 CIDR 豁免、CRLF 注入防护、Cookie 安全验证、解压炸弹防护、重定向白名单、响应体与请求体大小限制及安全警告机制。"
sidebar_position: 1
---

# 安全概述

HTTPC 遵循「默认安全」（Secure by Default）原则：所有关键安全特性开箱即用，无需额外配置即可抵御常见攻击面。处理用户提供的 URL、调用外部不可信服务、或运行在高安全要求场景（金融、医疗、政务）时，HTTPC 的多层防御可作为可靠基线。

## 安全特性矩阵

下表汇总每个安全特性、对应的 `Config` 字段、默认值及相关函数/选项，便于快速定位配置入口。

| 特性 | Config 字段 | 默认值 | 相关函数 / 选项 |
|------|-------------|--------|------------------|
| TLS 最低版本 | `SecurityConfig.MinTLSVersion` | TLS 1.2 | — |
| TLS 最高版本 | `SecurityConfig.MaxTLSVersion` | TLS 1.3 | — |
| 自定义 TLS 配置 | `SecurityConfig.TLSConfig` | `nil`（用默认） | — |
| 跳过证书验证 | `SecurityConfig.InsecureSkipVerify` | `false` | 仅测试用 |
| 证书固定 | `SecurityConfig.CertificatePinner` | `nil`（禁用） | `NewSPKIHashPinner` 等 |
| SSRF 防护 | `SecurityConfig.AllowPrivateIPs` | `false`（开启） | `WithAllowPrivateIPs` |
| SSRF 精确豁免 | `SecurityConfig.SSRFExemptCIDRs` | `nil` | — |
| URL 验证 | `SecurityConfig.ValidateURL` | `true` | — |
| 请求头验证 | `SecurityConfig.ValidateHeaders` | `true` | — |
| Content-Length 严格检查 | `SecurityConfig.StrictContentLength` | `true` | — |
| Cookie 安全验证 | `SecurityConfig.CookieSecurity` | `nil`（不验证） | `StrictCookieSecurityConfig`、`WithSecureCookie` |
| 响应体大小限制 | `SecurityConfig.MaxResponseBodySize` | 10MB | — |
| 请求体大小限制 | `SecurityConfig.MaxRequestBodySize` | 0（不限制） | 需显式设置 |
| 解压炸弹防护 | `SecurityConfig.MaxDecompressedBodySize` | 100MB | — |
| 响应头大小限制 | `ConnectionConfig.MaxResponseHeaderBytes` | 0（Go 默认 10MB） | — |
| 重定向白名单 | `SecurityConfig.RedirectWhitelist` | `nil`（全部允许） | — |
| 重定向次数限制 | `RequestDefaults.MaxRedirects` | 10 | `WithMaxRedirects` |
| 是否跟随重定向 | `RequestDefaults.FollowRedirects` | `true` | `WithFollowRedirects` |

:::tip
处理用户提供的 URL 时，直接使用 `httpc.SecureConfig()` 即可获得最严格的安全基线：关闭重定向、5MB 响应上限、更短超时、开启 URL/请求头验证。
:::

## TLS 安全

HTTPC 默认要求 TLS 1.2+，拒绝已被证明不安全的 TLS 1.0/1.1：

```go
cfg := httpc.DefaultConfig()
// 默认即 TLS 1.2-1.3，无需手动设置
cfg.Security.MinTLSVersion = tls.VersionTLS12
cfg.Security.MaxTLSVersion = tls.VersionTLS13
```

若需强制 TLS 1.3（更高安全要求、客户端与服务端均支持），设置 `MinTLSVersion = tls.VersionTLS13` 即可。设置 `TLSConfig` 后，`MinTLSVersion`/`MaxTLSVersion` 将被忽略——以 `TLSConfig` 为准。

:::warning
`InsecureSkipVerify` 仅用于测试。生产环境永远不要设为 `true`，否则 TLS 加密形同虚设，中间人可任意窃听篡改。设置后 HTTPC 会在非测试环境的 `stderr` 打印安全警告（见下文「安全警告机制」）。
:::

更多 TLS 细节（密码套件、证书固定、mTLS、自定义 CA）见 [TLS 与证书固定](./tls-certpin)。

## SSRF 防护

SSRF（Server-Side Request Forgery，服务端请求伪造）是攻击者诱导服务器向内网发起请求的攻击方式，可窃取云元数据凭据、扫描内网端口、访问内部管理接口。HTTPC 默认开启 SSRF 防护，阻止连接私有/保留 IP 段。

```go
cfg := httpc.DefaultConfig()
// AllowPrivateIPs = false（默认）→ 阻止 127.0.0.1, 10.x, 192.168.x, 169.254.x 等

// 精确豁免特定 CIDR（如 VPN、VPC 内部服务）
cfg.Security.SSRFExemptCIDRs = []string{
    "10.0.0.0/8",    // VPC 内部
    "100.64.0.0/10", // Tailscale VPN
}

// 最强 SSRF 防护预设
client, _ := httpc.New(httpc.SecureConfig())
```

### 被阻止的 IP 范围

| 范围 | CIDR | 说明 |
|------|------|------|
| IPv4 回环 | `127.0.0.0/8` | localhost |
| A 类私有 | `10.0.0.0/8` | 内网 |
| B 类私有 | `172.16.0.0/12` | 内网 |
| C 类私有 | `192.168.0.0/16` | 内网 |
| 链路本地 | `169.254.0.0/16` | 自动配置（含 AWS/Azure 元数据） |
| CGNAT | `100.64.0.0/10` | 运营商级 NAT（含阿里云元数据） |
| E 类保留 | `240.0.0.0/4` | 保留地址 |
| "本网络" | `0.0.0.0/8` | 本网络标识 |
| TEST-NET | `192.0.2.0/24` 等 | 文档用途 |
| IPv6 回环 | `::1/128` | localhost |
| IPv6 唯一本地 | `fc00::/7` | 内网 |
| IPv6 链路本地 | `fe80::/10` | 自动配置 |

> 上表为主要范围，完整列表（含 IPv4-mapped IPv6、NAT64 `64:ff9b::/96`、IPv6 文档前缀 `2001:db8::/32` 等）见源码 `isPrivateOrReservedIP`。HTTPC 还阻止十进制/十六进制/八进制等传统 IP 字面量（如 `2130706433`、`0x7f000001`），防止绕过。详见 [SSRF 防护](./ssrf)。

## 请求头验证

`ValidateHeaders`（默认开启）自动防止 CRLF 注入和请求头走私——拒绝包含回车换行、空字节等控制字符的请求头值：

```go
// 以下请求头会被拒绝
httpc.WithHeader("X-Custom", "value\r\nInjected: header") // CRLF 注入
httpc.WithHeader("X-Bad", "value\x00null")                // 控制字符
```

验证使用 O(1) 查表，性能开销极低，`PerformanceConfig()` 也保留此验证。

## Cookie 安全

HTTPC 提供三层 Cookie 安全控制：配置级（全局）、会话级（`SessionManager`）、请求级（`WithSecureCookie`）。

### CookieSecurityConfig

`CookieSecurityConfig` 定义 Cookie 必须满足的安全属性，防护 CSRF、XSS、会话劫持：

| 字段 | 说明 | Default | Strict |
|------|------|---------|--------|
| RequireSecure | 仅 HTTPS 传输 | `false` | `true` |
| RequireHttpOnly | 禁止 JS 访问 | `false` | `true` |
| RequireSameSite | SameSite 属性 | `""`（不限） | `"Strict"` |
| AllowSameSiteNone | 允许 SameSite=None | `true` | `false` |
| RequireSecureForSameSiteNone | None 必须带 Secure | `true` | `true` |

### 配置级验证（全局）

```go
cfg := httpc.DefaultConfig()
// 严格模式：要求 Secure + HttpOnly + SameSite=Strict
cfg.Security.CookieSecurity = httpc.StrictCookieSecurityConfig()

// 或自定义
cfg.Security.CookieSecurity = &httpc.CookieSecurityConfig{
    RequireSecure:   true,
    RequireHttpOnly: true,
    RequireSameSite: "Lax",
}
```

### 会话级验证

```go
sm, _ := httpc.NewSessionManagerDefault()
// 影响后续所有 SetCookie 调用，与添加顺序无关
sm.SetCookieSecurity(httpc.StrictCookieSecurityConfig())
```

### 请求级验证

```go
security := &httpc.CookieSecurityConfig{
    RequireSecure:   true,
    RequireHttpOnly: true,
}
// 注意：WithSecureCookie 必须放在 WithCookie 之后，仅验证此时已添加的 Cookie
result, err := client.Get("https://api.example.com",
    httpc.WithCookie(sessionCookie),
    httpc.WithSecureCookie(security),
)
```

:::warning
`WithSecureCookie` 是请求级「事后校验」：它只验证在它应用时已存在的 Cookie。务必将其放在所有 `WithCookie` 选项之后。需要忽略添加顺序的全局校验，请用配置级 `CookieSecurity` 或会话级 `SetCookieSecurity`。
:::

## 解压炸弹防护

攻击者可用高压缩比的 gzip/deflate 响应耗尽内存（如 10MB 压缩数据解压后达数 GB）。`MaxDecompressedBodySize`（默认 100MB）限制解压后的实际大小，从源头阻止解压炸弹。

```go
cfg := httpc.DefaultConfig()
cfg.Security.MaxDecompressedBodySize = 50 * 1024 * 1024 // 50MB 解压上限
```

### 优先级关系

| 配置情况 | 生效限制 |
|----------|----------|
| 仅设 `MaxResponseBodySize` | 以它为准（更严格） |
| 仅设 `MaxDecompressedBodySize` | 限制解压后大小 |
| 两者都设 | 取较小者（更严格者）生效 |

:::tip
`MaxResponseBodySize` 限制的是解压前的传输字节，`MaxDecompressedBodySize` 限制的是解压后的实际字节。两者协同提供双层防护。
:::

## 请求体大小限制

`MaxRequestBodySize` 限制上传请求体大小，防止客户端被诱导发送超大请求耗尽带宽或内存。

```go
cfg := httpc.DefaultConfig()
cfg.Security.MaxRequestBodySize = 5 * 1024 * 1024 // 5MB 上传上限
```

:::warning
与 `MaxResponseBodySize`（默认 10MB）不同，`MaxRequestBodySize` 默认为 **0（不限制）**，且**无自动回退值**。处理用户上传或代理转发请求时，务必显式设置上限。
:::

## 重定向安全

重定向是 SSRF 与开放重定向的常见载体。HTTPC 提供多层控制：

```go
// 安全敏感场景：完全禁用重定向
cfg := httpc.SecureConfig() // FollowRedirects = false

// 或限制重定向目标域名（支持通配符 *.example.com）
cfg := httpc.DefaultConfig()
cfg.Security.RedirectWhitelist = []string{
    "api.example.com",
    "auth.example.com",
    "*.cdn.example.com",
}
```

`RedirectWhitelist` 支持精确匹配与通配符：`*.example.com` 匹配 `api.example.com` 等严格子域，但不匹配裸域 `example.com`（两者需分别列出）。非白名单域名的重定向会被阻止。重定向目标同时经过 SSRF IP 验证。

## 响应头大小限制

`MaxResponseHeaderBytes` 限制服务端响应头大小，防止恶意服务器发送超大响应头耗尽内存：

```go
cfg := httpc.DefaultConfig()
cfg.Connection.MaxResponseHeaderBytes = 1 * 1024 * 1024 // 1MB 响应头上限
```

默认 0 表示使用 Go 标准库默认值（10MB）。高安全场景建议收紧至 1MB。

## 安全警告机制

HTTPC 对高危配置在非测试环境输出 `stderr` 警告，提醒开发者及时修正。两类配置会触发警告：

| 配置 | 警告触发条件 | 警告内容 |
|------|-------------|----------|
| `InsecureSkipVerify = true` | 在 `httpc.New()` 中检测到，非测试环境 | TLS 证书验证已禁用 |
| `TestingConfig()` | 调用时即检测，非测试环境 | 已禁用 TLS 验证、SSRF 防护、URL/请求头验证 |

警告通过 `sync.Once` 保证每个进程最多各触发一次，避免日志刷屏。测试环境判定依据：可执行文件后缀为 `.test` / `.test.exe`，或设置了 `GO_TEST` / `GOTEST=1` 环境变量。

### 重定向或抑制警告

```go
// 重定向到自定义 writer（如结构化日志）
httpc.SetSecurityWarnOutput(os.Stdout)

// 完全抑制（不推荐——警告是安全护栏，不应静默）
httpc.SetSecurityWarnOutput(io.Discard)
```

:::warning
`SetSecurityWarnOutput(io.Discard)` 会静默吞掉安全警告。仅在已充分审计配置（如确认 `TestingConfig` 仅用于测试二进制）时使用，切勿在生产部署中用它掩盖警告。
:::

## 文件下载安全

`Download` 的文件路径经 `prepareFilePath` 五层防护，防止路径穿越与文件覆盖攻击：

1. **UNC 路径阻止**：拒绝 `\\server\share` 等网络路径
2. **控制字符过滤**：拒绝含控制字符（`< 0x20`、`0x7F`、`0x00`）的路径
3. **系统路径保护**：拒绝写入 `/etc`、`/bin`、`C:\Windows` 等系统目录（含父目录符号链接解析）
4. **路径穿越检测**：`filepath.Clean` 后阻止 `../` 逃逸工作目录
5. **符号链接防护**：拒绝目标为符号链接的路径，递归检查父目录防 TOCTOU 攻击

下载完成后还可通过 `Checksum` 字段校验文件完整性（SHA-256），校验失败自动删除已下载文件。

## 审计中间件

`AuditMiddleware` 为每个请求/响应周期生成结构化审计事件，适用于合规要求严格的场景（金融、医疗、政务）。URL 已自动脱敏（凭据移除），敏感请求头（Authorization、Cookie 等）默认掩码。

```go
auditMiddleware := httpc.AuditMiddleware(&httpc.AuditConfig{
    OnAudit: func(event httpc.AuditEvent) {
        // event.URL 已脱敏；SourceIP/UserID 从 context 提取
        log.Printf("[AUDIT] %s %s -> %d (%v)",
            event.Method, event.URL, event.StatusCode, event.Duration)
    },
    Format:         "json",   // text 或 json
    IncludeHeaders: true,     // 记录请求/响应头（敏感头掩码）
    MaskHeaders:    []string{"Authorization", "Cookie", "Set-Cookie"},
    SanitizeError:  true,     // 清理错误中的敏感信息
})

cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{auditMiddleware}
```

`SourceIP` 与 `UserID` 通过 context 键注入：`httpc.SourceIPKey`、`httpc.UserIDKey`。完整审计字段、配置项与生产实践见 [生产检查清单](./production-checklist)。

## 下一步

- [SSRF 防护](./ssrf) - SSRF 防护详解、CIDR 豁免与云元数据保护
- [TLS 与证书固定](./tls-certpin) - TLS 配置、证书固定与 mTLS
- [生产检查清单](./production-checklist) - 上线前分类核查项与验证方法
