---
sidebar_label: "连接池与 DNS"
title: "连接池与 DNS - CyberGo HTTPC | 连接池调优与 DNS 解析"
description: "HTTPC 连接池与 DNS 指南：MaxIdleConns 与 MaxConnsPerHost 调优、空闲连接与总连接上限、TIME_WAIT 治理、对象池复用、并发请求模式、DoH 加密解析降级回退与 HTTP/2 多路复用实践，附高并发场景推荐参数。"
sidebar_position: 10
---

# 连接池与 DNS

## 连接池配置

连接池是 HTTP 客户端性能的关键因素。HTTPC 使用 `ConnectionConfig` 管理连接池。

```go
cfg := httpc.DefaultConfig()

// 连接池参数
cfg.Connection.MaxIdleConns = 100         // 全局最大空闲连接
cfg.Connection.MaxConnsPerHost = 20       // 每主机最大连接数
cfg.Timeouts.IdleConn = 120 * time.Second // 空闲连接保持时间
```

### 参数说明

| 参数 | 默认 | 说明 |
|------|------|------|
| `MaxIdleConns` | 50 | 全局最大空闲连接数 |
| `MaxConnsPerHost` | 10 | 每主机最大连接数（含活跃 + 空闲） |
| `IdleConn` | 90s | 空闲连接超时，超时后关闭 |
| `Dial` | 10s | 建立连接超时 |
| `TLSHandshake` | 10s | TLS 握手超时 |
| `ResponseHeader` | 0 | 禁用（使用 Request 超时） |
| `MaxResponseHeaderBytes` | 0 | 响应头大小上限；0 = Go 标准库默认 10MB |

### 场景推荐

| 场景 | MaxIdleConns | MaxConnsPerHost | IdleConn |
|------|-------------|-----------------|----------|
| 高并发 API | 100 | 20 | 120s |
| 常规服务 | 50 | 10 | 90s |
| 低频请求 | 10 | 2 | 30s |
| 微服务内部 | 50 | 10 | 60s |

:::tip
`MaxConnsPerHost` 包含活跃连接和空闲连接。超过此限制的新请求会排队等待连接释放。
:::

### 派生参数与内部上限

部分连接参数没有独立配置项，由引擎从现有参数**推导**或使用固定值：

| 参数 | 值 | 来源 |
|------|-----|------|
| `MaxIdleConnsPerHost` | `clamp(MaxConnsPerHost/2, 2, 10)`；`MaxConnsPerHost=0` 时取 10 | 由 `MaxConnsPerHost` 派生，无独立字段 |
| 单客户端总连接上限 | 1000（活跃 + 空闲） | 固定值，超出返回连接池耗尽错误 |
| TCP KeepAlive 探测间隔 | 30s | 固定值 |
| `ExpectContinueTimeout` | 1s | 固定值（`Expect: 100-continue` 等待时长） |

:::warning 总连接上限的表现
达到 1000 总连接上限时，新建连接以错误结束，归类为 `ClientError`（`ErrorTypeNetwork`，Message 为 `connection pool exhausted`）。默认 `MaxIdleConns=50` / `MaxConnsPerHost=10` 下几乎不可能触发，把它当作极端并发下的最后防线即可。
:::

### 空闲连接管理

- **`IdleConn`（默认 90s）**：空闲连接在传输层超时后自动关闭。调大可提高连接复用率，调小可更快释放对端资源（高频短连接场景注意 TIME_WAIT 堆积）。
- **代理轮换时的主动清理**：启用 `ProxyRotatePerRequest` 或状态码轮换的重试路径会**自动关闭全部空闲连接**，强制下一次请求重新选择代理——否则 HTTP/2 经 CONNECT 隧道的连接复用会绕过代理选择，让轮换失效。代理配置与轮换策略详见[代理与代理池](./proxy)。
- **`client.Close()`**：关闭全部空闲连接、DoH 解析器与内部资源；此后继续请求返回 `ErrClientClosed`。
- **每主机统计的自动清理**：内部按主机维护连接计数，30 分钟无活动且无活跃连接的条目被周期性清理（至多每分钟一次，主机条目上限 10000），长期运行不会内存无限增长。

### 响应解压的特别处理

传输层**禁用了标准库自动解压**，由 HTTPC 在响应处理层手动处理 `gzip` / `deflate`：解压受 `Security.MaxDecompressedBodySize`（默认 100MB）约束，防御解压炸弹攻击。日常无需关心这一层——只需知道 `Result.RawBody()` 拿到的已是解压后的字节。

## DNS-over-HTTPS

启用 DoH 后，DNS 解析走加密的 HTTPS 通道，防止运营商劫持与 DNS 投毒，并内置多提供商容灾：

```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableDoH = true
cfg.Connection.DoHCacheTTL = 5 * time.Minute // 传 0 也回退 5 分钟
```

默认 DoH 提供商（按优先级排列）：

| 提供商 | 地址 | 说明 |
|--------|------|------|
| Cloudflare | `1.1.1.1/dns-query` | 最快，隐私优先 |
| Google | `dns.google/resolve` | 全球覆盖 |
| AliDNS | `dns.alidns.com/resolve` | 中国区域优化 |

### 工作机制

- **A + AAAA 并发查询**：每次解析同时查询 IPv4 与 IPv6 记录并合并结果。
- **双格式解析**：按响应 `Content-Type` 自动选择 JSON（Google/AliDNS 风格）或 RFC 1035 wire 格式（Cloudflare 风格）；缺失或未识别时先试 JSON 再试 wire，兼容配置异常的服务器。
- **并发合并**：同一主机的并发缓存未命中会合并为一次网络往返（singleflight），防止缓存击穿打爆提供商。
- **独立内部客户端**：DoH 请求走独立的 HTTP 客户端（5s 超时、启用 HTTP/2），不占用业务连接池与请求超时预算。

### 降级链

```text
Cloudflare (1.1.1.1) → Google (dns.google) → AliDNS → 系统 DNS 解析器
```

任一提供商成功即返回；全部失败时自动回退系统 DNS 解析器，并把两层错误合并进错误信息。单个提供商故障不会导致请求失败。

### 缓存

| 项 | 值 |
|----|-----|
| TTL | `DoHCacheTTL`（默认 5 分钟） |
| 容量上限 | 1000 条；满时先淘汰过期条目，再淘汰最临近过期的条目 |
| 响应大小上限 | 64KB（防恶意 DNS 响应撑爆内存） |

### 与 SSRF 防护的联动

DoH 解析出的 IP 会先经 SSRF 过滤（剔除私有/保留地址，尊重 `SSRFExemptCIDRs`），然后**直接拨号到已验证的 IP**——校验与拨号之间不存在第二次 DNS 解析，从根上防住 DNS rebinding 攻击。代理地址不经过 DoH 解析（代理由开发者显式配置，直接拨代理主机，见[代理与代理池](./proxy)）。详见 [SSRF 防护](../security/ssrf)。

## HTTP/2

默认启用 HTTP/2（需要 TLS）：

```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableHTTP2 = false // 禁用 HTTP/2
```

HTTP/2 特性：
- 多路复用：单连接处理多个并发请求
- 头部压缩：减少重复头传输
- 服务端推送

禁用时传输层完全不再尝试 HTTP/2 协商（含自定义 TLS 配置场景的强制尝试），明文 HTTP/2（h2c）不受支持。注意 HTTP/2 多路复用会让「同一主机的并发请求共享一条连接」——这正是代理轮换场景需要关闭空闲连接的原因（见[代理与代理池](./proxy)的每请求轮换）。

## 对象池复用

HTTPC 内部对引擎响应对象与字符串构建器复用 sync.Pool，减少 GC 压力；Result 则每次请求新建、由 GC 自动回收。

```go
result, err := client.Get(url)
if err != nil {
    return err
}
// Result 每次请求新建，GC 自动回收，无需手动释放
```

高并发场景中，内部对象池复用可显著减少 GC 压力。

## 并发请求模式

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

## 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 大量 TIME_WAIT | 空闲连接超时太短 | 增大 `IdleConn` 超时 |
| 连接被拒 | 每主机连接数不够 | 增大 `MaxConnsPerHost` |
| 请求排队等待 | 连接池太小 | 增大 `MaxIdleConns` |
| 想控制每主机空闲连接数 | 无独立配置字段 | 由 `MaxConnsPerHost` 派生（÷2，夹在 2–10 之间） |
| 启用 DoH 后解析失败 | 所有 DoH 提供商不可达/超时 | 已内置回退系统 DNS；检查出口网络或保持默认 |
| 代理不生效或频繁熔断 | 代理配置与连接复用的交互 | 见[代理与代理池](./proxy)常见问题 |

完整的性能反模式和优化建议见 [性能优化](./performance)。

## 下一步

- [性能优化](./performance) - 性能调优指南
- [代理与代理池](./proxy) - 单代理、系统代理与代理池轮换熔断
- [配置 API](../api-reference/client-config/config) - 连接配置字段参考
- [安全概述](../security/) - SSRF 和 TLS 安全
