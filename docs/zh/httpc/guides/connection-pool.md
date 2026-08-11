---
sidebar_label: "连接池与代理"
title: "连接池与代理 - CyberGo HTTPC | 连接池调优与代理配置"
description: "HTTPC 连接池与代理配置指南：MaxIdleConns 连接池参数调优与场景推荐、ProxyURL 手动代理与 SOCKS5、EnableSystemProxy 系统代理检测、ProxyPool 代理池轮换与被动熔断、ProxyRotatePerRequest 每请求轮换、ProxyRotateOnStatus 状态码轮换、DoH 与 HTTP/2 配置实践。"
sidebar_position: 8
---

# 连接池与代理

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

## 代理

HTTPC 提供四种代理模式，按优先级自动生效。所有代理配置均在 `ConnectionConfig` 中设置。

### 手动代理

通过 `ProxyURL` 指定固定代理（最高优先级）：

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyURL = "http://proxy.example.com:8080"

client, _ := httpc.New(cfg)
```

带认证的代理：

```go
cfg.Connection.ProxyURL = "http://user:password@proxy.example.com:8080"
```

:::tip
`Config.String()` 方法会自动脱敏代理 URL 中的用户名和密码。
:::

### SOCKS5 代理

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyURL = "socks5://proxy.example.com:1080"
```

### 系统代理自动检测

启用后自动检测操作系统代理设置，无需手动指定 `ProxyURL`：

```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableSystemProxy = true
```

| 平台 | 检测来源 |
|------|----------|
| Windows | 注册表 Internet Settings |
| macOS | 系统偏好设置网络代理 |
| Linux | 环境变量 `HTTP_PROXY` / `HTTPS_PROXY` |

### 代理池

当需要跨多个代理 IP 分发请求（爬虫采集、负载分散、IP 轮换），代理池提供自动轮换、被动熔断与按状态码换代理——无需外部组件。

#### 基本用法

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyPool = []string{
    "http://proxy1:8080",
    "http://proxy2:8080",
    "http://proxy3:8080",
}
cfg.Connection.ProxyPoolStrategy = httpc.ProxyStrategyRoundRobin // 默认

client, err := httpc.New(cfg)
```

每个请求自动从池中选择一个代理。支持 `http`、`https`、`socks5`、`socks5h` 协议。

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `ProxyPool` | `[]string` | `nil` | 代理 URL 列表 |
| `ProxyPoolStrategy` | `ProxyStrategy` | `ProxyStrategyRoundRobin` | 选择策略 |
| `ProxyFailureThreshold` | `int` | `3`（0 回退） | 连续连接失败熔断阈值 |
| `ProxyCooldown` | `time.Duration` | `30s`（0 回退） | 熔断代理冷却时间 |
| `ProxyRotatePerRequest` | `bool` | `false` | 每次独立请求强制换代理（关闭空闲连接复用） |
| `ProxyRotateOnStatus` | `[]int` | `nil` | 触发换代理重试的状态码 |

#### 选择策略

| 策略 | 常量 | 说明 |
|------|------|------|
| 轮询 | `ProxyStrategyRoundRobin` | 按顺序循环选择，重试自动落到下一个代理 |
| 随机 | `ProxyStrategyRandom` | 从健康代理中均匀随机选取 |

轮询（默认）在重试时自动选择不同代理 IP——每次重试推进游标，自然落到下一个代理，无需额外配置。

#### 被动熔断

代理池内置被动健康检查。只有**连接层失败**（dial/TLS）才会触发熔断，HTTP 状态码不会：

```text
代理连接失败
    ↓
失败计数 +1
    ↓
连续失败 ≥ ProxyFailureThreshold → 熔断（移出轮换）
    ↓
等待 ProxyCooldown → 半开探测（恢复轮换）
    ↓
成功 → 重置计数，关闭熔断
首次失败 → 重新熔断
```

```go
cfg.Connection.ProxyFailureThreshold = 5           // 更宽容，容忍偶发抖动
cfg.Connection.ProxyCooldown = 60 * time.Second    // 冷却更久
```

当所有代理都被熔断时，返回冷却时间最短（最接近恢复）的代理作为兜底，而非直接失败。

#### 状态码轮换

用于 Cloudflare/WAF 等 IP 封锁场景——返回特定状态码时自动换代理重试：

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyPool = []string{
    "http://proxy1:8080",
    "http://proxy2:8080",
    "http://proxy3:8080",
}
cfg.Connection.ProxyRotateOnStatus = []int{403}  // 收到 403 时换代理重试
cfg.Retry.MaxRetries = 3                          // 必须启用重试

client, err := httpc.New(cfg)
```

:::warning 状态码轮换 ≠ 熔断
`ProxyRotateOnStatus` 触发的轮换**不会**熔断代理——IP 封锁往往目标特定（一个代理在 A 站被封，在 B 站可能正常）。熔断仅由连接层失败触发。需 `Retry.MaxRetries > 0` 才生效。

当 `ProxyRotateOnStatus` 设置且代理池有多个代理时，重试预算自动提升至 `len(ProxyPool) - 1`（受 `MaxRetries` 上限 10 约束），确保每个代理都有机会被尝试。
:::

#### 每请求轮换

`ProxyRotatePerRequest` 解决的是**连接复用**导致代理隧道固化的问题：HTTP 连接池会复用已建立的 TCP 连接，包括其代理隧道。这意味着对同一主机的连续请求会复用前一次请求的代理，即使 `ProxyPoolStrategy` 已轮换选择器游标。

启用后，每次请求开始时关闭所有空闲连接，强制 Transport 重新评估代理池——代价是无连接复用（每次请求新建连接+代理隧道），但保证按请求轮换：

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyPool = []string{
    "http://proxy1:8080",
    "http://proxy2:8080",
    "http://proxy3:8080",
}
cfg.Connection.ProxyRotatePerRequest = true  // 每次请求换代理

client, err := httpc.New(cfg)
```

:::tip 适用场景
适用于对同一主机的爬虫/数据采集——每次请求的源 IP 不同，降低被目标站点 IP 封锁的风险。对于不同主机的请求，连接复用不会绑定同一代理，通常无需启用。
:::

与 `ProxyRotateOnStatus` 一样，`ProxyRotatePerRequest` 也会在代理池有多个代理时自动提升重试预算至 `len(ProxyPool) - 1`，确保每个代理至少被尝试一次。

### 代理优先级

同时配置多种代理方式时，按优先级生效：

| 优先级 | 配置 | 行为 |
|--------|------|------|
| 1（最高） | `ProxyURL` | 始终使用指定代理（单代理模式） |
| 2 | `ProxyPool` | 在代理池中轮换 |
| 3 | `EnableSystemProxy` | 自动检测系统代理 |
| 4（最低） | 无 | 直连 |

:::tip
若同时设置 `ProxyURL` 和 `ProxyPool`，`ProxyURL` 生效。要用代理池，请清空 `ProxyURL`。
:::

### 内置安全

代理相关功能自动处理以下安全细节，无需手动配置：

- **SSRF 豁免**：代理主机地址自动加入 SSRF 豁免列表，不会被私有 IP 检查阻断
- **去重**：代理池中相同 `host:port` 的条目自动合并，避免轮换偏斜和重复计数
- **URL 验证**：所有代理 URL 经安全校验（CRLF 注入防护、协议白名单）

完整的字段说明见 [配置 API — 代理池](../api-reference/client-config/config#代理池)。

## DNS-over-HTTPS

启用 DoH 减少 DNS 解析延迟和防止 DNS 劫持：

```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableDoH = true
cfg.Connection.DoHCacheTTL = 5 * time.Minute
```

默认 DoH 提供商（按优先级排列）：

| 提供商 | 地址 | 说明 |
|--------|------|------|
| Cloudflare | `1.1.1.1/dns-query` | 最快，隐私优先 |
| Google | `dns.google/resolve` | 全球覆盖 |
| AliDNS | `dns.alidns.com/resolve` | 中国区域优化 |

:::tip
DoH 启用后，DNS 解析结果会缓存 `DoHCacheTTL` 时间。如果所有 DoH 提供商不可用，会回退到系统 DNS。
:::

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
| 代理不生效 | `ProxyURL` 与 `ProxyPool` 同时设置 | 清空 `ProxyURL`，仅用 `ProxyPool` |
| 代理频繁熔断 | `ProxyFailureThreshold` 太低 | 增大阈值或 `ProxyCooldown` |

完整的性能反模式和优化建议见 [性能优化](./performance)。

## 下一步

- [性能优化](./performance) - 性能调优指南
- [配置 API](../api-reference/client-config/config) - 连接配置与代理字段参考
- [安全概述](../security/) - SSRF 和 TLS 安全
