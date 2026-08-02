---
title: "核心概念 - CyberGo HTTPC | 双层架构与配置体系"
description: "HTTPC 核心概念详解：双层 API 架构（包级函数与 Client 实例）、Config 结构体配置与 With* 请求选项的区别、请求生命周期与 Result 自动管理，帮助开发者快速建立对库的整体认知。"
sidebar_label: "核心概念"
sidebar_position: 2
---

# 核心概念

理解以下概念，即可快速建立对 HTTPC 的整体认知。

## 双层 API 架构

HTTPC 提供两种等效的请求方式，与标准库 `net/http` 中 `http.Get` 与 `http.Client` 的关系对应：

**包级函数** — 零配置，内部共享一个惰性初始化的默认客户端，适合脚本和一次性请求：

```go
result, err := httpc.Get("https://api.example.com/data")
```

**Client 实例** — 完全控制配置、连接池和生命周期，适合长期运行的服务：

```go
client, err := httpc.NewDefault()
defer func() { _ = client.Close() }()
result, err := client.Get("https://api.example.com/data")
```

两种方式接受相同的请求选项（`WithHeader`、`WithJSON`…），返回相同的 `*Result` 类型。包级函数是 Client 实例的薄封装。

:::tip 何时用哪个？
一次性请求或快速原型 → 包级函数。生产服务、需自定义配置或连接池管理 → Client 实例。
:::

## 配置体系：Config 与 With\* 选项

HTTPC 将配置分为两个独立层级，避免混淆：

| 层级 | 载体 | 作用域 | 典型字段 |
|------|------|--------|----------|
| **实例配置** | `Config` 结构体 | 整个客户端生命周期 | 超时、重试策略、连接池、TLS |
| **请求选项** | `WithXxx()` 函数 | 单次请求 | `WithHeader`、`WithJSON`、`WithTimeout` |

实例配置通过 `Config` 结构体传入 `New()`，从 `DefaultConfig()` 出发按需修改：

```go
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 60 * time.Second
cfg.Retry.MaxRetries = 5
client, err := httpc.New(cfg)
```

请求选项在每次调用时传入，补充或覆盖实例级默认值：

```go
result, err := client.Get(url,
    httpc.WithHeader("Authorization", "Bearer "+token),
    httpc.WithTimeout(30*time.Second),
)
```

也可使用预设配置（`SecureConfig()`、`PerformanceConfig()` 等）作为起点，详见 [配置 API](../api-reference/client-config/config)。

## 请求生命周期

每次请求经历以下流程：

```text
选项应用 → 中间件链（如有）→ 引擎执行 → 重试（如需要）→ Result 返回
    ↑                                    ↑
  With* 函数                    连接池 / TLS / 代理 / SSRF 检查
```

- **选项应用** — `With*` 函数设置请求头、请求体、超时等
- **中间件链** — 自定义日志、指标、审计等逻辑（通过 `Config.Middleware` 配置）
- **引擎执行** — 连接池复用、TLS 握手、HTTP/2 协商、SSRF 验证
- **重试** — 遇到可重试错误（超时、5xx、429 等）时自动指数退避重试
- **Result** — 包含响应数据、请求元信息和重试统计；GC 自动回收，无需手动释放

## 安全默认值

HTTPC 默认安全（secure by default），无需额外配置即具备：

- **TLS 1.2+** 强制加密
- **SSRF 防护** — 阻止连接私有/保留 IP 地址（`127.0.0.1`、`10.x`、`192.168.x` 等）
- **CRLF 注入防护** — 请求头和 URL 自动验证
- **响应体大小限制** — 默认 10MB，防止内存耗尽

如需连接内部服务（VPN、内网），可设置 `Security.AllowPrivateIPs = true` 或使用 `SSRFExemptCIDRs` 精确豁免。详见 [安全概述](../security/).

## 错误模型

HTTPC 区分**网络层错误**与 **HTTP 状态码**：

- **网络层错误**（连接失败、超时、TLS 错误等）→ 作为 `error` 返回，可用 `errors.As` 提取 `ClientError` 获取分类和可重试性
- **HTTP 状态码**（4xx、5xx）→ **不**作为 `error` 返回，需通过 `result.IsSuccess()` 等方法检查

```go
result, err := client.Get(url)
if err != nil {
    // 网络层错误 — 请求未成功完成
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        log.Printf("错误类型: %s, 可重试: %v", clientErr.Code(), clientErr.IsRetryable())
    }
    return err
}
// 请求成功完成 — 检查 HTTP 状态码
if !result.IsSuccess() {
    log.Printf("HTTP 错误: %d", result.StatusCode())
}
```

详见 [错误处理](../guides/error-handling).
