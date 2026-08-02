---
sidebar_label: "TLS 与证书固定"
title: "TLS 与证书固定 - CyberGo HTTPC | 加密与证书固定"
description: "HTTPC TLS 与证书固定指南：TLS 1.2-1.3 版本控制、SPKI 哈希生成步骤与密钥轮换、三种 Pinner 构造器对比、自定义 CertificatePinner、mTLS 双向认证、自定义 CA 证书与 Let's Encrypt 短周期证书固定策略。"
sidebar_position: 3
---

# TLS 与证书固定

## TLS 版本控制

HTTPC 默认要求 TLS 1.2+，拒绝已被证明不安全的 TLS 1.0/1.1。推荐 TLS 1.3 以获得更强的前向保密与更简的握手：

```go
cfg := httpc.DefaultConfig()
cfg.Security.MinTLSVersion = tls.VersionTLS12  // 默认
cfg.Security.MaxTLSVersion = tls.VersionTLS13  // 默认
```

### 版本说明

| 版本 | 状态 | HTTPC 默认 |
|------|------|-----------|
| TLS 1.0 | 不安全，已弃用（POODLE/BEAST） | 拒绝 |
| TLS 1.1 | 不安全，已弃用 | 拒绝 |
| TLS 1.2 | 安全 | 最低要求 |
| TLS 1.3 | 最安全，推荐（强制前向保密） | 支持 |

:::tip
若需强制仅 TLS 1.3（更高安全、更简握手），设 `MinTLSVersion = tls.VersionTLS13` 即可。注意部分旧客户端/代理可能不支持 TLS 1.3，启用前确认目标服务兼容。
:::

:::warning
设置 `SecurityConfig.TLSConfig` 后，`MinTLSVersion` 与 `MaxTLSVersion` **将被忽略**，以 `TLSConfig` 中的设置为准。如需在自定义 `TLSConfig` 中控制版本，设置 TLSConfig 的 MinVersion / MaxVersion 字段。
:::

## 密码套件

默认配置仅允许安全的密码套件（强制前向保密的 ECDHE 系列、AEAD 加密）：

| 密码套件 | 说明 |
|----------|------|
| `TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256` | 推荐 |
| `TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384` | 推荐 |
| `TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305` | 推荐 |
| `TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256` | 推荐 |
| `TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384` | 推荐 |
| `TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305` | 推荐 |

TLS 1.3 的密码套件由协议自动协商，不受 CipherSuites 字段控制。

## 自定义 TLS 配置

需要细粒度控制（自定义 CA、mTLS、固定密码套件）时，设置 `SecurityConfig.TLSConfig`：

```go
cfg := httpc.DefaultConfig()
cfg.Security.TLSConfig = &tls.Config{
    MinVersion: tls.VersionTLS13,  // 强制 TLS 1.3
    // 其他自定义配置
}
```

### 自定义 CA 证书

连接内部 CA 签发的服务（企业内部 PKI、自签名证书）时，加载自定义根证书：

```go
package main

import (
	"crypto/tls"
	"crypto/x509"
	"log"
	"os"

	"github.com/cybergodev/httpc"
)

func main() {
	caCert, err := os.ReadFile("custom-ca.pem")
	if err != nil {
		log.Fatal(err)
	}
	caCertPool := x509.NewCertPool()
	if !caCertPool.AppendCertsFromPEM(caCert) {
		log.Fatal("无法解析 CA 证书")
	}

	cfg := httpc.DefaultConfig()
	cfg.Security.TLSConfig = &tls.Config{
		RootCAs:    caCertPool,
		MinVersion: tls.VersionTLS12,
	}

	client, err := httpc.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer func() { _ = client.Close() }()
	log.Println("自定义 CA 客户端已就绪")
}
```

### 双向 TLS (mTLS)

服务端要求客户端证书（mTLS）时，配置 Certificates 字段：

```go
package main

import (
	"crypto/tls"
	"log"

	"github.com/cybergodev/httpc"
)

func main() {
	cert, err := tls.LoadX509KeyPair("client-cert.pem", "client-key.pem")
	if err != nil {
		log.Fatal(err)
	}

	cfg := httpc.DefaultConfig()
	cfg.Security.TLSConfig = &tls.Config{
		Certificates: []tls.Certificate{cert},
		MinVersion:   tls.VersionTLS12,
	}

	client, err := httpc.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer func() { _ = client.Close() }()
	log.Println("mTLS 客户端已就绪")
}
```

:::tip
mTLS 常用于零信任网络、服务网格内部认证、金融 API。服务端通过客户端证书识别调用方身份，无需额外 token。证书轮换时需同步更新 `client-cert.pem` / `client-key.pem`。
:::

## 证书固定

证书固定（Certificate Pinning）在标准证书链验证**之上**叠加一层校验：要求服务端证书链中存在已知的固定公钥/证书。即使可信 CA 被攻破或被胁迫签发伪造证书，攻击者仍无法中间人——因为其证书的公钥不匹配固定值。

### 工作原理

标准 TLS 验证：客户端信任任何由可信 CA 签发的证书。证书固定：客户端额外要求证书的公钥哈希匹配预存值。

```
标准验证:  信任 CA → 信任 CA 签发的任何证书
证书固定:  信任 CA + 证书公钥必须匹配预存哈希
```

固定叠加在标准验证之上，无需设置 `InsecureSkipVerify`。HTTPC 校验证书链中**任意一层**证书，因此固定中间证书时，叶子证书续期后仍可继续生效。

### SPKI 哈希生成步骤

SPKI（SubjectPublicKeyInfo）哈希是最常用的固定格式（HPKP 标准）。生成步骤：

**步骤 1**：获取服务端证书（从浏览器导出，或用 openssl 获取）

```bash
# 从服务端获取证书链
openssl s_client -connect example.com:443 -showcerts < /dev/null 2>/dev/null \
  | openssl x509 -outform pem > cert.pem
```

**步骤 2**：从证书提取公钥 → DER 编码 → SHA-256 → base64

```bash
openssl x509 -in cert.pem -pubkey -noout | \
  openssl pkey -pubin -outform der | \
  openssl dgst -sha256 -binary | \
  openssl enc -base64
# 输出：YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2fuihg=
```

三步分解：

| 步骤 | 命令片段 | 作用 |
|------|---------|------|
| 提取公钥 | `openssl x509 -pubkey -noout` | 从 X.509 证书提取 PEM 格式公钥 |
| DER 编码 | `openssl pkey -pubin -outform der` | PEM 公钥转为 DER（PKIX）格式 |
| 哈希编码 | `openssl dgst -sha256 -binary \| openssl enc -base64` | SHA-256 后 base64 编码 |

:::tip
推荐固定**中间证书**的 SPKI，而非叶子证书。中间证书有效期长（通常 5-10 年），叶子证书续期（如 Let's Encrypt 90 天）时中间证书不变，固定值无需频繁更新。
:::

### SPKI 哈希固定（推荐）

`NewSPKIHashPinner` 接受一个或多个 base64 编码的 SHA-256 SPKI 哈希。提供多个哈希可支持密钥轮换——任一匹配即通过：

```go
package main

import (
	"crypto/tls"
	"log"

	"github.com/cybergodev/httpc"
)

func main() {
	pinner, err := httpc.NewSPKIHashPinner(
		"YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2fuihg=", // 当前中间证书
		"C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=", // 备用（密钥轮换）
	)
	if err != nil {
		log.Fatal(err)
	}

	cfg := httpc.DefaultConfig()
	cfg.Security.MinTLSVersion = tls.VersionTLS12
	cfg.Security.CertificatePinner = pinner
	client, err := httpc.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer func() { _ = client.Close() }()
	log.Println("证书固定客户端已就绪")
}
```

`NewSPKIHashPinner` 在哈希为空或非合法 base64 时返回错误，启动期即暴露配置问题。校验逻辑：遍历服务端证书链每层证书，计算其 SPKI 的 SHA-256，与任一固定哈希匹配即通过。

:::tip
`CertificatePinner` 在标准 TLS 链验证**之上**叠加固定校验，无需设置 `InsecureSkipVerify`。校验对证书链中任意一层证书生效，因此固定中间证书可在叶子证书续期后继续生效。
:::

### 三种 Pinner 构造器对比

HTTPC 提供三种 Pinner 构造器，适用场景不同：

| 构造器 | 输入 | 适用场景 | 推荐度 |
|--------|------|---------|--------|
| `NewSPKIHashPinner` | base64 SHA-256 SPKI 哈希 | 最常见（HPKP 格式） | 推荐 |
| `NewPublicKeyPinner` | DER 编码 PKIX 公钥 | 已持有原始公钥字节 | 便利 |
| `NewCertificatePinnerChain` | 多个 Pinner | 组合多策略/混合轮换密钥 | 高级 |

```go
// 1. SPKI 哈希（推荐，最常用）
spkiPinner, err := httpc.NewSPKIHashPinner(
    "YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2fuihg=",
)

// 2. DER 公钥（已有原始公钥字节，内部计算 SHA-256）
pubPinner, err := httpc.NewPublicKeyPinner(pubKeyDER1, pubKeyDER2)

// 3. 组合多个 pinner，任一通过即接受（混合策略或不同构造器的轮换密钥）
chainPinner := httpc.NewCertificatePinnerChain(spkiPinner, pubPinner)
cfg.Security.CertificatePinner = chainPinner
```

`NewCertificatePinnerChain` 无参数时返回「拒绝所有」的 Pinner（安全默认），确保配置遗漏不会被静默放过为「允许所有」。

### 自定义 CertificatePinner

高级场景需自定义固定策略（如固定完整证书而非公钥、动态从配置中心拉取固定值），可直接实现 `CertificatePinner` 接口：

```go
package main

import (
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"errors"
	"log"

	"github.com/cybergodev/httpc"
)

// fullCertPinner 固定完整证书的 SHA-256（而非公钥 SPKI）。
type fullCertPinner struct {
	pinnedHashes map[string]bool
}

func newFullCertPinner(hashes ...string) *fullCertPinner {
	m := make(map[string]bool, len(hashes))
	for _, h := range hashes {
		m[h] = true
	}
	return &fullCertPinner{pinnedHashes: m}
}

// Pin 实现 CertificatePinner 接口，返回固定值的描述（用于日志/调试）。
func (p *fullCertPinner) Pin() string {
	return "full-cert-pinner"
}

// VerifyPeerCertificate 实现 CertificatePinner 接口。
// 返回 nil 表示接受，非 nil 拒绝握手。
func (p *fullCertPinner) VerifyPeerCertificate(rawCerts [][]byte, verifiedChains [][]*x509.Certificate) error {
	if len(verifiedChains) == 0 || len(verifiedChains[0]) == 0 {
		return errors.New("certificate pinning failed: empty chain")
	}
	for _, cert := range verifiedChains[0] {
		sum := sha256.Sum256(cert.Raw)
		hash := base64.StdEncoding.EncodeToString(sum[:])
		if p.pinnedHashes[hash] {
			return nil // 匹配，接受
		}
	}
	return errors.New("certificate pinning failed: no matching certificate")
}

func main() {
	// 固定完整叶子证书的 SHA-256（证书续期后须更新此值）
	pinner := newFullCertPinner(
		"wert6uY/PCq3yAAbZA/wtqfzfQsTwmxnfv6I3vRz1XQ=", // 证书 Raw 的 SHA-256
	)

	cfg := httpc.DefaultConfig()
	cfg.Security.TLSConfig = &tls.Config{MinVersion: tls.VersionTLS12}
	cfg.Security.CertificatePinner = pinner
	client, err := httpc.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer func() { _ = client.Close() }()
	log.Println("自定义证书固定客户端已就绪")
}
```

:::warning
实现自定义 `CertificatePinner` 时，务必在标准证书链验证（`verifiedChains`）通过的基础上叠加固定校验。切勿用它替代标准验证——始终保留 `InsecureSkipVerify = false`。
:::

## 多哈希与密钥轮换

`NewSPKIHashPinner` 与 `NewPublicKeyPinner` 均接受多个值，任一匹配即通过。这是密钥轮换的关键：同时固定新旧公钥，轮换期间新旧证书均可通过，无需停机切换。

轮换流程：

1. 服务端生成新密钥对，签发新证书
2. 客户端更新固定值，**同时保留新旧哈希**：
   ```go
   pinner, _ := httpc.NewSPKIHashPinner(
       "OLD_HASH...", // 旧密钥（轮换期间保留）
       "NEW_HASH...", // 新密钥（即将启用）
   )
   ```
3. 部署客户端，确认新旧证书均可通过
4. 服务端切换到新证书
5. 观察一段时间无故障后，从固定值移除旧哈希

:::danger
证书固定失效（固定值不匹配）会导致连接完全失败，且无法自动恢复。务必：
- **始终保留至少一个备份固定值**，防主密钥意外损坏
- 轮换采用「先加新、后删旧」的双窗口策略
- 建立监控，固定失败时快速回滚客户端配置
:::

## 证书固定与 Let's Encrypt

Let's Encrypt 证书有效期仅 90 天，频繁续期。直接固定叶子证书会导致每 90 天更新固定值，维护成本高。推荐策略：

| 固定对象 | 有效期 | 续期影响 | 推荐度 |
|---------|--------|---------|--------|
| 叶子证书 | 90 天 | 每次续期须更新固定值 | 低 |
| Let's Encrypt 中间证书 | 约 5 年 | 中间证书轮换（数年一次）才需更新 | 推荐 |
| 你的域名公钥（若自托管） | 由你控制 | 仅你主动轮换密钥时更新 | 视情况 |

Let's Encrypt 的中间证书（如 R3、R10、R11）有效期数年，固定中间证书 SPKI 可兼顾安全与低维护成本。Let's Encrypt 轮换中间证书时会提前公布，可从容更新固定值。

```go
// 固定 Let's Encrypt 中间证书（推荐）
pinner, err := httpc.NewSPKIHashPinner(
    "YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2fuihg=", // 当前中间证书
    "C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=", // 备用/下一轮中间证书
)
```

:::tip
Let's Encrypt 的中间证书公钥在轮换时通常保持不变（仅签发新证书，公钥复用）。固定公钥 SPKI 比固定完整中间证书更稳定——公钥不变时 SPKI 哈希不变。
:::

## 证书固定的安全考量

| 风险 | 后果 | 缓解措施 |
|------|------|---------|
| 固定值过期/不匹配 | 连接完全失败 | 多哈希 + 备份密钥 + 监控 |
| 备份密钥丢失 | 无法轮换，锁定 | 离线备份多个密钥对 |
| 固定值硬编码 | 更新需发版 | 配置中心动态加载（自定义 Pinner） |
| 仅固定一层 | 单点失效 | 固定多层（叶子 + 中间） |

:::warning
证书固定是「双刃剑」：大幅提升对 MITM/CA 攻破的防御，但固定失效会导致硬故障。采用前确保：
1. 有可靠的固定值更新与分发机制
2. 监控固定失败率，设告警
3. 保留应急「关闭固定」开关（虽降低安全性）
:::

### 固定策略对比

| 策略 | 安全性 | 维护成本 | 推荐场景 |
|------|--------|----------|---------|
| 固定根证书 | 低 | 低 | 仅防篡改，CA 范围太广 |
| 固定中间证书 | 中 | 中 | **推荐**，兼顾安全与维护 |
| 固定叶子证书 | 高 | 高 | 高安全、证书可控场景 |
| 固定多个层级 | 高 | 中 | 最佳，多层冗余 |

## InsecureSkipVerify

`InsecureSkipVerify` 跳过全部 TLS 证书链验证，仅用于测试：

```go
// 仅用于测试！
cfg := httpc.TestingConfig()
// InsecureSkipVerify = true → 跳过 TLS 证书验证
```

HTTPC 在 `httpc.New()` 中检测到 `InsecureSkipVerify = true` 且非测试环境时，向 `stderr` 打印警告（每进程一次）。测试环境判定：可执行文件以 `.test` 结尾，或设置了 `GO_TEST` / `GOTEST=1`。

:::danger
`InsecureSkipVerify = true` 会使所有 TLS 安全措施失效（证书固定也无效），仅在测试环境使用。生产环境永远不要设为 `true`。若需自定义验证逻辑（如固定完整证书），应实现 `CertificatePinner` 接口，而非跳过验证。
:::

## HTTP/2

HTTP/2 默认启用，仅在使用 TLS（h2 via ALPN）时可用：

```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableHTTP2 = false // 禁用 HTTP/2（仅 HTTP/1.1）
```

:::tip
启用证书固定或自定义 `TLSConfig` 时，HTTP/2 的 ALPN 协商仍正常工作。如需禁用 HTTP/2（如调试或兼容旧代理），设 `EnableHTTP2 = false`。
:::

## 最佳实践

1. 使用默认 TLS 配置（TLS 1.2+），无需手动设置
2. 证书固定时固定**中间证书** SPKI，并准备备用固定值
3. 多哈希支持密钥轮换，采用「先加新、后删旧」策略
4. 定期更新固定值，与服务端证书续期同步
5. 使用 `SecureConfig()` 作为安全基线
6. 永远不要在生产环境设置 `InsecureSkipVerify`
7. 高安全场景固定多层证书（叶子 + 中间），增加冗余

## 下一步

- [SSRF 防护](./ssrf) - SSRF 安全配置
- [安全概述](./) - 安全特性总览
- [配置 API](../api-reference/client-config/config) - SecurityConfig 参考
