---
sidebar_label: "SSRF 防护"
title: "SSRF 防护 - CyberGo HTTPC | 私有 IP 与元数据"
description: "HTTPC SSRF 防护详解：默认阻止 IPv4/IPv6 私有 IP 与云元数据端点、SSRFExemptCIDRs 精确豁免、AllowPrivateIPs 危险对比、DNS 重绑定防护、WithAllowPrivateIPs 请求级覆盖与 RedirectWhitelist 重定向白名单。"
sidebar_position: 2
---

# SSRF 防护

SSRF（Server-Side Request Forgery，服务端请求伪造）是攻击者诱导服务器向内网发起请求的攻击方式。危害包括：窃取云实例元数据凭据（IAM 角色 token）、扫描内网端口与服务、访问无鉴权的内部管理接口、绕过防火墙访问受保护资源。HTTPC 默认开启 SSRF 防护，阻止连接私有/保留 IP 段。

## 默认行为

```go
cfg := httpc.DefaultConfig()
// AllowPrivateIPs = false（默认）→ 阻止所有私有/保留 IP
```

`AllowPrivateIPs` 默认为 `false`，拨号器层面的 SSRF 验证完全开启。这与仅验证 URL 中的主机名不同——HTTPC 在实际建立 TCP 连接时验证解析后的 IP，可防御 DNS 重绑定（见下文）。

## 被阻止的 IP 范围

HTTPC 阻止所有不适合公网通信的 IP 地址，覆盖 IPv4、IPv6 及其绕过变体。

### IPv4 阻止范围

| 范围 | CIDR | 说明 |
|------|------|------|
| 回环 | `127.0.0.0/8` | localhost（含 127.x.x.x 全段） |
| A 类私有 | `10.0.0.0/8` | 内网（RFC 1918） |
| B 类私有 | `172.16.0.0/12` | 内网（RFC 1918） |
| C 类私有 | `192.168.0.0/16` | 内网（RFC 1918） |
| 链路本地 | `169.254.0.0/16` | 自动配置（含 AWS/Azure 元数据） |
| CGNAT | `100.64.0.0/10` | 运营商级 NAT（含阿里云元数据 `100.100.100.200`） |
| E 类保留 | `240.0.0.0/4` | 保留地址（`ip4[0] >= 240`） |
| "本网络" | `0.0.0.0/8` | 本网络标识（`ip4[0] == 0`） |
| IETF 协议分配 | `192.0.0.0/24` | 特殊用途 |
| TEST-NET-1 | `192.0.2.0/24` | 文档用途（RFC 5737） |
| TEST-NET-2 | `198.51.100.0/24` | 文档用途（RFC 5737） |
| TEST-NET-3 | `203.0.113.0/24` | 文档用途（RFC 5737） |
| 6to4 中继 | `192.88.99.0/24` | 已废弃任播 |

此外，IPv6 回环（`::1`）、唯一本地（`fc00::/7`）、链路本地（`fe80::/10`）等范围同样被阻止——HTTPC 的 IP 校验覆盖回环、私有、链路本地单播/多播、多播、未指定等全部保留类别。

### IPv6 阻止范围

| 范围 | CIDR | 说明 |
|------|------|------|
| 回环 | `::1/128` | localhost |
| 唯一本地 | `fc00::/7` | 内网（对应 IPv4 私有） |
| 链路本地 | `fe80::/10` | 自动配置 |
| 文档前缀 | `2001:db8::/32` | 文档用途（RFC 3849） |
| NAT64 | `64:ff9b::/96` | 会递归校验内嵌 IPv4 |

### 绕过防护

HTTPC 额外阻止以下常见 SSRF 绕过手法：

| 手法 | 示例 | 防护 |
|------|------|------|
| IPv4-mapped IPv6 | `::ffff:127.0.0.1` | 归一化为 IPv4 后校验 |
| 十进制整数 | `2130706433`（= 127.0.0.1） | 识别为传统 IP 字面量并阻止 |
| 十六进制 | `0x7f000001`、`0x7f.0.0.1` | 识别 `0x` 前缀并阻止 |
| 八进制 | `0177.0.0.1` | 识别前导零并阻止 |
| NAT64 内嵌 | `64:ff9b::7f00:1` | 递归校验内嵌 IPv4 |

:::tip
这些绕过防护在 cgo 构建下尤为重要：`getaddrinfo` 可能接受传统 IP 字面量并映射到私有 IP。HTTPC 在 DNS 解析前即拦截这些形式。
:::

## 云元数据端点防护

各云平台的实例元数据服务（IMDS）是 SSRF 攻击的高价值目标——一旦访问即可窃取临时凭据。HTTPC 默认阻止这些地址：

| 平台 | 元数据地址 | 阻止机制 |
|------|-----------|----------|
| AWS EC2 | `169.254.169.254` | 链路本地 `169.254.0.0/16` 阻止 |
| Azure | `169.254.169.254` | 同上（链路本地阻止） |
| GCP | `metadata.google.internal` | DNS 解析后 IP 验证 |
| 阿里云 | `100.100.100.200` | CGNAT `100.64.0.0/10` 阻止 |

:::warning
AWS 元数据 IMDSv2 虽要求 token，但 SSRF 仍可能先获取 token 再访问数据。HTTPC 的 IP 级阻止比 IMDSv2 更底层，直接拦截连接。建议两者并用：HTTPC 阻止 + 启用 IMDSv2 纵深防御。
:::

:::warning
阿里云元数据（`100.100.100.200`）位于 CGNAT 范围（`100.64.0.0/10`），HTTPC **默认阻止该范围**。若因 Tailscale/WireGuard 等 VPN 或内部路由确需访问 `100.64.0.0/10`，须显式通过 `SSRFExemptCIDRs: []string{"100.64.0.0/10"}` 豁免——豁免后该范围内的阿里云元数据也将可达，请评估风险。
:::

## DNS 重绑定防护

DNS 重绑定（DNS Rebinding）是绕过 SSRF 校验的经典手法。攻击者控制域名的 DNS 服务器，让首次解析返回公网 IP（通过校验），实际连接时返回 `127.0.0.1`（绕过校验）。

HTTPC 采用「解析 - 验证 - 直连」模式防御此类攻击：

1. **解析**：将域名解析为 IP 列表
2. **验证**：逐一校验每个 IP 是否为私有/保留地址
3. **过滤**：移除被阻止的 IP，仅保留允许的 IP
4. **直连**：直接拨号到已验证的 IP，不再重新解析域名

```go
// 攻击场景：
// 1. 攻击者控制 evil.com 的 DNS
// 2. 校验阶段解析返回公网 IP（通过验证）
// 3. 标准 net/http 会再次解析域名（此时返回 127.0.0.1，绕过验证）
//
// HTTPC 防御：拨号时直接使用已验证的 IP，不重新解析域名
```

:::tip
「Split-Horizon DNS」（同一域名解析到公网与内网 IP）环境下，HTTPC 会自动过滤掉私有 IP，仅用公网 IP 建立连接，而非直接拒绝整个域名。
:::

## SSRFExemptCIDRs 精确豁免

微服务环境中常需访问 VPC、Kubernetes Service 或 VPN 内的服务。`SSRFExemptCIDRs` 允许精确豁免特定 CIDR 范围，保留对其他私有 IP 的阻止——这是推荐的内部服务访问方式。

```go
cfg := httpc.DefaultConfig()
cfg.Security.SSRFExemptCIDRs = []string{
    "10.0.0.0/8",       // VPC 内部
    "100.64.0.0/10",    // Tailscale VPN
    "172.20.0.0/16",    // Kubernetes Service CIDR
}
client, _ := httpc.New(cfg)
```

### 典型豁免用例

| 场景 | CIDR | 说明 |
|------|------|------|
| VPC 内部服务 | `10.0.0.0/8` | AWS/GCP/Azure 默认 VPC |
| Tailscale VPN | `100.64.0.0/10` | Tailscale 网段（RFC 6598） |
| Kubernetes | `172.20.0.0/16` 等 | Pod/Service CIDR |
| WireGuard | `10.13.0.0/16` 等 | 自定义 VPN 网段 |

无效 CIDR 会导致 `httpc.New()` 返回错误（如 `SSRFExemptCIDRs: invalid CIDR "10.0.0/8"`），配置在启动期即失败，而非运行时静默放过。

:::warning
豁免 CIDR 应尽量精确。避免使用过大的范围（如 `0.0.0.0/0`），否则等于完全禁用 SSRF 防护。即便是 `10.0.0.0/8` 也应评估是否可收窄到实际使用的子网。
:::

## AllowPrivateIPs vs SSRFExemptCIDRs 对比

两者都能放行内部服务，但安全语义截然不同：

| 维度 | `AllowPrivateIPs = true` | `SSRFExemptCIDRs` |
|------|--------------------------|--------------------|
| 防护状态 | **完全绕过** SSRF 验证 | 仅豁免指定 CIDR，其余仍阻止 |
| 覆盖范围 | 所有私有/保留/回环/链路本地 IP | 仅列出的 CIDR |
| localhost | 允许 | 默认仍阻止（除非显式豁免 `127.0.0.0/8`） |
| 云元数据 | **可达**（危险） | 默认仍阻止 |
| 风险等级 | 高——攻击面等于禁用 SSRF | 低——精确放行 |
| 推荐度 | 仅测试/全内网客户端 | 生产推荐 |

:::danger
`AllowPrivateIPs = true` 完全绕过拨号器层面的 SSRF 验证（不仅仅是「允许私有 IP」），包括 localhost 检查、链路本地检查、所有保留地址检查。生产环境处理任何不可信 URL 时绝不可用。如需访问内部服务，优先使用 `SSRFExemptCIDRs`。
:::

## 按请求豁免私有 IP

若客户端整体使用安全默认（`AllowPrivateIPs = false`），仅个别请求需访问内网（如 `localhost` 健康检查端点），可用 `WithAllowPrivateIPs` 请求选项按请求放行，不必全局放松安全策略：

```go
package main

import (
	"fmt"
	"log"

	"github.com/cybergodev/httpc"
)

func main() {
	// 默认客户端阻止私有 IP；此调用按请求放行
	result, err := httpc.Get("http://localhost:8080/health",
		httpc.WithAllowPrivateIPs(true),
	)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("健康检查状态: %d\n", result.StatusCode())
}
```

:::warning
仅对**可信且非来自用户输入**的 URL 启用 `WithAllowPrivateIPs(true)`。SSRF 防护的目的是防止攻击者诱导你的进程访问内网端点；按请求禁用会为该次调用重新引入此风险。若整个客户端都需要访问内部服务，请在 `Config` 上设置 `Security.AllowPrivateIPs = true`。
:::

反向用法同样有效：客户端配置了 `AllowPrivateIPs = true`（如纯内网客户端），但单个请求需强制开启 SSRF 校验，可用 `WithAllowPrivateIPs(false)`。

## 重定向中的 SSRF 检查

重定向是 SSRF 攻击的重要载体：公开服务可能 302 跳转到 `http://169.254.169.254/`（云元数据）或内网地址。HTTPC 对重定向目标同样执行 SSRF IP 验证。

| 客户端配置 | 重定向到私有 IP 的行为 |
|-----------|----------------------|
| `AllowPrivateIPs = false`（默认） | 阻止——重定向目标 IP 验证失败 |
| `AllowPrivateIPs = true` | 允许——绕过 SSRF（含重定向） |
| `WithAllowPrivateIPs(true)` 按请求 | 允许该请求的重定向到私有 IP |
| `SSRFExemptCIDRs` 命中 | 允许重定向到豁免 CIDR |

```go
// 场景：请求 public-api.com，服务端 302 跳转到 http://169.254.169.254/
// HTTPC 验证重定向目标的 IP，阻止对云元数据服务的访问
```

### 重定向域名白名单

`RedirectWhitelist` 在 IP 验证之上叠加域名级控制，防止开放重定向漏洞：

```go
cfg := httpc.DefaultConfig()
cfg.Security.RedirectWhitelist = []string{
    "api.example.com",
    "auth.example.com",
    "*.cdn.example.com", // 通配符：匹配严格子域
}
// 非白名单域名的重定向被阻止
```

通配符 `*.example.com` 匹配 `api.example.com`、`static.cdn.example.com` 等严格子域，但**不匹配**裸域 `example.com`（需单独列出）。白名单为 `nil` 时全部允许（默认行为）。

## 配置示例

### 安全配置（处理用户 URL）

处理用户提供的 URL 时，使用 `SecureConfig()` 获得最严格的 SSRF 防护：

```go
cfg := httpc.SecureConfig()
// AllowPrivateIPs = false（严格 SSRF）
// FollowRedirects = false（阻止重定向 SSRF）
// MaxResponseBodySize = 5MB
client, _ := httpc.New(cfg)
```

### 内部服务配置（访问 VPC）

访问 VPC/Kubernetes 内部服务，用 `SSRFExemptCIDRs` 精确放行：

```go
cfg := httpc.DefaultConfig()
cfg.Security.SSRFExemptCIDRs = []string{
    "10.0.0.0/8",     // VPC
    "172.20.0.0/16",  // Kubernetes Service
}
client, _ := httpc.New(cfg)
```

### 混合配置（公网 + 内网）

同一客户端需访问公网 API 与内部服务，且内部服务网段已知：

```go
cfg := httpc.DefaultConfig()
cfg.Security.SSRFExemptCIDRs = []string{
    "10.50.0.0/16",   // 内部服务专用子网（精确）
}
cfg.Security.RedirectWhitelist = []string{
    "api.public.com",
    "*.internal.corp", // 仅允许跳转到内部可信域
}
client, _ := httpc.New(cfg)
```

## 完全禁用 SSRF 防护

仅在测试环境使用。两种方式：

```go
// 方式一：TestingConfig（同时禁用 TLS 验证等多项安全特性）
client, _ := httpc.New(httpc.TestingConfig())

// 方式二：手动配置
cfg := httpc.DefaultConfig()
cfg.Security.AllowPrivateIPs = true
client, _ := httpc.New(cfg)
```

`TestingConfig()` 在非测试环境会向 `stderr` 打印安全警告（见 [安全概述](./)）。

:::danger
生产环境永远不要设置 `AllowPrivateIPs = true`。这等于完全放弃 SSRF 防护，攻击者可借此访问云元数据、内网服务、管理接口。
:::

## 最佳实践

1. 使用 `SecureConfig()` 作为处理不可信 URL 的安全基线
2. 仅用 `SSRFExemptCIDRs` 精确豁免必要的 CIDR 范围，避免 `AllowPrivateIPs`
3. 配置 `RedirectWhitelist` 限制重定向目标域名
4. 处理用户 URL 时禁用重定向（`FollowRedirects = false`）
5. 定期审计 `SSRFExemptCIDRs` 配置，移除不再使用的网段
6. 使用 `AuditMiddleware` 记录所有请求，便于事后追溯 SSRF 攻击尝试

## 下一步

- [TLS 与证书固定](./tls-certpin) - TLS 安全配置与证书固定
- [安全概述](./) - 安全特性总览
- [生产检查清单](./production-checklist) - 上线前 SSRF 核查项
