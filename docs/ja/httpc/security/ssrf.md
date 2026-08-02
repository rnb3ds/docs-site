---
sidebar_label: "SSRF 防護"
title: "SSRF 防護 - CyberGo HTTPC | プライベート IP とメタデータ"
description: "HTTPC SSRF 防護詳細：デフォルトで IPv4/IPv6 プライベート IP とクラウドメタデータエンドポイントをブロック、SSRFExemptCIDRs による精密免除、AllowPrivateIPs の危険な比較、DNS リバインディング防護、WithAllowPrivateIPs リクエストレベル上書きと RedirectWhitelist リダイレクトホワイトリスト。"
sidebar_position: 2
---

# SSRF 防護

SSRF（Server-Side Request Forgery、サーバーサイドリクエストフォージェリ）は、攻撃者がサーバーを誘導して内部ネットワークにリクエストを送信させる攻撃手法です。被害には：クラウドインスタンスのメタデータ認証情報（IAM ロールトークン）の窃取、内部ネットワークのポートとサービスのスキャン、認証のない内部管理インターフェースへのアクセス、ファイアウォールをバイパスした保護リソースへのアクセスが含まれます。HTTPC はデフォルトで SSRF 防護が有効で、プライベート/予約 IP セグメントへの接続をブロックします。

## デフォルトの動作

```go
cfg := httpc.DefaultConfig()
// AllowPrivateIPs = false（デフォルト）→ すべてのプライベート/予約 IP をブロック
```

`AllowPrivateIPs` はデフォルトで `false` で、ダイヤラー層の SSRF 検証が完全に有効です。これは URL 内のホスト名の検証のみとは異なります——HTTPC は実際に TCP 接続を確立する際に解決後の IP を検証し、DNS リバインディングを防御できます（下記参照）。

## ブロックされる IP 範囲

HTTPC は公衆ネットワーク通信に不適切なすべての IP アドレスをブロックし、IPv4、IPv6 およびそのバイパス変種をカバーします。

### IPv4 ブロック範囲

| 範囲 | CIDR | 説明 |
|------|------|------|
| ループバック | `127.0.0.0/8` | localhost（127.x.x.x 全セグメントを含む） |
| クラス A プライベート | `10.0.0.0/8` | 内部ネットワーク（RFC 1918） |
| クラス B プライベート | `172.16.0.0/12` | 内部ネットワーク（RFC 1918） |
| クラス C プライベート | `192.168.0.0/16` | 内部ネットワーク（RFC 1918） |
| リンクローカル | `169.254.0.0/16` | 自動設定（AWS/Azure メタデータを含む） |
| CGNAT | `100.64.0.0/10` | キャリアグレード NAT（Alibaba Cloud メタデータ `100.100.100.200` を含む） |
| クラス E 予約 | `240.0.0.0/4` | 予約アドレス（`ip4[0] >= 240`） |
| "このネットワーク" | `0.0.0.0/8` | このネットワーク識別子（`ip4[0] == 0`） |
| IETF プロトコル割り当て | `192.0.0.0/24` | 特殊用途 |
| TEST-NET-1 | `192.0.2.0/24` | ドキュメント用途（RFC 5737） |
| TEST-NET-2 | `198.51.100.0/24` | ドキュメント用途（RFC 5737） |
| TEST-NET-3 | `203.0.113.0/24` | ドキュメント用途（RFC 5737） |
| 6to4 リレー | `192.88.99.0/24` | 廃止されたエニーキャスト |

さらに、`IsLoopback`、`IsPrivate`、`IsLinkLocalUnicast`、`IsLinkLocalMulticast`、`IsMulticast`、`IsUnspecified` がカバーする範囲もブロックされます。

### IPv6 ブロック範囲

| 範囲 | CIDR | 説明 |
|------|------|------|
| ループバック | `::1/128` | localhost |
| ユニークローカル | `fc00::/7` | 内部ネットワーク（IPv4 プライベートに対応） |
| リンクローカル | `fe80::/10` | 自動設定 |
| ドキュメントプレフィックス | `2001:db8::/32` | ドキュメント用途（RFC 3849） |
| NAT64 | `64:ff9b::/96` | 内包 IPv4 を再帰的に検証 |

### バイパス防護

HTTPC は以下の一般的な SSRF バイパス手法を追加でブロックします：

| 手法 | 例 | 防護 |
|------|------|------|
| IPv4-mapped IPv6 | `::ffff:127.0.0.1` | IPv4 に正規化後に検証 |
| 10 進数整数 | `2130706433`（= 127.0.0.1） | 伝統的 IP リテラルとして識別してブロック |
| 16 進数 | `0x7f000001`、`0x7f.0.0.1` | `0x` プレフィックスを識別してブロック |
| 8 進数 | `0177.0.0.1` | 先頭ゼロを識別してブロック |
| NAT64 内包 | `64:ff9b::7f00:1` | 内包 IPv4 を再帰的に検証 |

:::tip
これらのバイパス防護は cgo ビルドで特に重要です：`getaddrinfo` は伝統的 IP リテラルを受け入れてプライベート IP にマップする可能性があります。HTTPC は DNS 解決前にこれらの形式をインターセプトします。
:::

## クラウドメタデータエンドポイント防護

各クラウドプラットフォームのインスタンスメタデータサービス（IMDS）は SSRF 攻撃の高価値ターゲットです——一度アクセスされれば一時的な認証情報を窃取できます。HTTPC はデフォルトでこれらのアドレスをブロックします：

| プラットフォーム | メタデータアドレス | ブロックメカニズム |
|------|-----------|----------|
| AWS EC2 | `169.254.169.254` | リンクローカル `169.254.0.0/16` ブロック |
| Azure | `169.254.169.254` | 同上（リンクローカルブロック） |
| GCP | `metadata.google.internal` | DNS 解決後 IP 検証 |
| Alibaba Cloud | `100.100.100.200` | CGNAT `100.64.0.0/10` ブロック |

:::warning
AWS メタデータ IMDSv2 はトークンを要求しますが、SSRF はまずトークンを取得してからデータにアクセスする可能性があります。HTTPC の IP レベルブロックは IMDSv2 より低層で、接続を直接インターセプトします。両者の併用を推奨：HTTPC ブロック + IMDSv2 有効化による縦深防御。
:::

:::warning
Alibaba Cloud メタデータ（`100.100.100.200`）は CGNAT 範囲（`100.64.0.0/10`）にあり、HTTPC は**デフォルトでこの範囲をブロック**します。Tailscale/WireGuard などの VPN や内部ルーティングで `100.64.0.0/10` へのアクセスが本当に必要な場合、`SSRFExemptCIDRs: []string{"100.64.0.0/10"}` で明示的に免除する必要があります——免除するとこの範囲内の Alibaba Cloud メタデータにも到達可能になるため、リスクを評価してください。
:::

## DNS リバインディング防護

DNS リバインディング（DNS Rebinding）は SSRF 検証をバイパスする古典的な手法です。攻撃者はドメインの DNS サーバーを制御し、初回の解決で公衆 IP を返し（検証を通過）、実際の接続時に `127.0.0.1` を返します（検証をバイパス）。

HTTPC は「解決 - 検証 - 直接接続」モードでこの攻撃を防御します：

1. **解決**：ドメインを IP リストに解決
2. **検証**：各 IP がプライベート/予約アドレスでないか個別に検証
3. **フィルタ**：ブロックされた IP を削除し、許可された IP のみ保持（`FilterAllowedIPs`）
4. **直接接続**：検証済みの IP に直接ダイヤルし、ドメインを再解決しない

```go
// 攻撃シナリオ：
// 1. 攻撃者が evil.com の DNS を制御
// 2. 検証段階の解決で公衆 IP を返す（検証を通過）
// 3. 標準 net/http はドメインを再解決（この時 127.0.0.1 を返し、検証をバイパス）
//
// HTTPC の防御：検証済みの IP を使用して直接ダイヤル、ドメインを再解決しない
```

:::tip
「Split-Horizon DNS」（同一ドメインが公衆 IP と内部 IP に解決される）環境では、HTTPC の `FilterAllowedIPs` が自動的にプライベート IP をフィルタリングし、公衆 IP のみで接続を確立します。ドメイン全体を拒否するのではありません。
:::

## SSRFExemptCIDRs 精密免除

マイクロサービス環境では VPC、Kubernetes Service、VPN 内のサービスへのアクセスが必要な場合があります。`SSRFExemptCIDRs` は特定の CIDR 範囲を精密に免除し、他のプライベート IP のブロックを維持できます——これが推奨される内部サービスアクセス方式です。

```go
cfg := httpc.DefaultConfig()
cfg.Security.SSRFExemptCIDRs = []string{
    "10.0.0.0/8",       // VPC 内部
    "100.64.0.0/10",    // Tailscale VPN
    "172.20.0.0/16",    // Kubernetes Service CIDR
}
client, _ := httpc.New(cfg)
```

### 典型的な免除ユースケース

| シナリオ | CIDR | 説明 |
|------|------|------|
| VPC 内部サービス | `10.0.0.0/8` | AWS/GCP/Azure デフォルト VPC |
| Tailscale VPN | `100.64.0.0/10` | Tailscale ネットワークセグメント（RFC 6598） |
| Kubernetes | `172.20.0.0/16` など | Pod/Service CIDR |
| WireGuard | `10.13.0.0/16` など | カスタム VPN ネットワークセグメント |

無効な CIDR は `httpc.New()` がエラーを返します（例：`SSRFExemptCIDRs: invalid CIDR "10.0.0/8"`）。設定は起動時に失敗し、実行時に暗黙的に通過されることはありません。

:::warning
免除 CIDR はできる限り精密に指定してください。大きすぎる範囲（例：`0.0.0.0/0`）は SSRF 防護を完全に無効化するのと同等です。`10.0.0.0/8` であっても、実際に使用するサブネットに絞り込めるか評価すべきです。
:::

## AllowPrivateIPs vs SSRFExemptCIDRs の比較

両者とも内部サービスへのアクセスを許可できますが、セキュリティのセマンティクスは全く異なります：

| 次元 | `AllowPrivateIPs = true` | `SSRFExemptCIDRs` |
|------|--------------------------|--------------------|
| 防護状態 | SSRF 検証を**完全にバイパス** | 指定 CIDR のみ免除、残りはブロック維持 |
| カバレッジ | すべてのプライベート/予約/ループバック/リンクローカル IP | リストされた CIDR のみ |
| localhost | 許可 | デフォルトでブロック維持（`127.0.0.0/8` を明示的に免除しない限り） |
| クラウドメタデータ | **到達可能**（危険） | デフォルトでブロック維持 |
| リスクレベル | 高——攻撃面は SSRF 無効化に等しい | 低——精密な許可 |
| 推奨度 | テスト/純内部クライアントのみ | 本番推奨 |

:::danger
`AllowPrivateIPs = true` はダイヤラー層の SSRF 検証を完全にバイパスします（「プライベート IP を許可」だけではなく）、localhost チェック、リンクローカルチェック、すべての予約アドレスチェックを含みます。本番環境で信頼できない URL を処理する際には絶対に使用しないでください。内部サービスへのアクセスが必要な場合は `SSRFExemptCIDRs` を優先してください。
:::

## リクエスト単位でのプライベート IP 免除

クライアント全体がセキュアなデフォルト（`AllowPrivateIPs = false`）を使用し、個別のリクエストのみが内部ネットワークにアクセスする必要がある場合（例：`localhost` のヘルスチェックエンドポイント）、`WithAllowPrivateIPs` リクエストオプションでリクエスト単位の許可が可能で、グローバルなセキュリティポリシーを緩める必要はありません：

```go
package main

import (
	"fmt"
	"log"

	"github.com/cybergodev/httpc"
)

func main() {
	// デフォルトクライアントはプライベート IP をブロック；この呼び出しはリクエスト単位で許可
	result, err := httpc.Get("http://localhost:8080/health",
		httpc.WithAllowPrivateIPs(true),
	)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("ヘルスチェックステータス: %d\n", result.StatusCode())
}
```

:::warning
`WithAllowPrivateIPs(true)` は**信頼でき、かつユーザー入力に由来しない** URL に対してのみ有効にしてください。SSRF 防護の目的は、攻撃者があなたのプロセスを誘導して内部ネットワークのエンドポイントにアクセスするのを防ぐことです。リクエスト単位で無効化すると、その呼び出しにおいてこのリスクが再び生じます。クライアント全体が内部サービスにアクセスする必要がある場合は、`Config` で `Security.AllowPrivateIPs = true` を設定してください。
:::

逆の使い方も有効：クライアントが `AllowPrivateIPs = true`（純内部クライアントなど）に設定されているが、個別のリクエストで SSRF 検証を強制的に有効にする必要がある場合、`WithAllowPrivateIPs(false)` を使用できます。

## リダイレクトにおける SSRF チェック

リダイレクトは SSRF 攻撃の重要な媒介です：公開サービスが 302 で `http://169.254.169.254/`（クラウドメタデータ）や内部アドレスにジャンプする可能性があります。HTTPC はリダイレクト先にも SSRF IP 検証を実行します。

| クライアント設定 | プライベート IP へのリダイレクトの挙動 |
|-----------|----------------------|
| `AllowPrivateIPs = false`（デフォルト） | ブロック——リダイレクト先の IP 検証が失敗 |
| `AllowPrivateIPs = true` | 許可——SSRF をバイパス（リダイレクト含む） |
| `WithAllowPrivateIPs(true)` リクエスト単位 | そのリクエストのプライベート IP へのリダイレクトを許可 |
| `SSRFExemptCIDRs` にヒット | 免除 CIDR へのリダイレクトを許可 |

```go
// シナリオ：public-api.com にリクエスト、サーバーが 302 で http://169.254.169.254/ にリダイレクト
// HTTPC はリダイレクト先の IP を検証し、クラウドメタデータサービスへのアクセスをブロック
```

### リダイレクトドメインホワイトリスト

`RedirectWhitelist` は IP 検証の上にドメインレベルの制御を追加し、オープンリダイレクトの脆弱性を防止します：

```go
cfg := httpc.DefaultConfig()
cfg.Security.RedirectWhitelist = []string{
    "api.example.com",
    "auth.example.com",
    "*.cdn.example.com", // ワイルドカード：厳密なサブドメインにマッチ
}
// ホワイトリスト外のドメインへのリダイレクトはブロックされる
```

ワイルドカード `*.example.com` は `api.example.com`、`static.cdn.example.com` などの厳密なサブドメインにマッチしますが、ベアドメイン `example.com` には**マッチしません**（別途記載が必要）。`IsAllowed` はホワイトリストが `nil` の場合 `true`（すべて許可）を返します。

## 設定例

### セキュア設定（ユーザー URL を処理）

ユーザー提供の URL を処理する場合、`SecureConfig()` を使用して最も厳格な SSRF 防護を獲得します：

```go
cfg := httpc.SecureConfig()
// AllowPrivateIPs = false（厳格 SSRF）
// FollowRedirects = false（リダイレクト SSRF をブロック）
// MaxResponseBodySize = 5MB
client, _ := httpc.New(cfg)
```

### 内部サービス設定（VPC にアクセス）

VPC/Kubernetes 内部サービスにアクセスする場合、`SSRFExemptCIDRs` で精密に許可します：

```go
cfg := httpc.DefaultConfig()
cfg.Security.SSRFExemptCIDRs = []string{
    "10.0.0.0/8",     // VPC
    "172.20.0.0/16",  // Kubernetes Service
}
client, _ := httpc.New(cfg)
```

### ハイブリッド設定（公衆ネット + 内部ネット）

同一クライアントが公衆ネット API と内部サービスの両方にアクセスする必要があり、内部サービスのネットワークセグメントが既知の場合：

```go
cfg := httpc.DefaultConfig()
cfg.Security.SSRFExemptCIDRs = []string{
    "10.50.0.0/16",   // 内部サービス専用サブネット（精密）
}
cfg.Security.RedirectWhitelist = []string{
    "api.public.com",
    "*.internal.corp", // 内部信頼ドメインへのジャンプのみ許可
}
client, _ := httpc.New(cfg)
```

## SSRF 防護の完全な無効化

テスト環境でのみ使用してください。2 つの方法があります：

```go
// 方法 1：TestingConfig（TLS 検証など複数のセキュリティ機能も同時に無効化）
client, _ := httpc.New(httpc.TestingConfig())

// 方法 2：手動設定
cfg := httpc.DefaultConfig()
cfg.Security.AllowPrivateIPs = true
client, _ := httpc.New(cfg)
```

`TestingConfig()` は非テスト環境で `stderr` にセキュリティ警告を出力します（[セキュリティ概要](./) を参照）。

:::danger
本番環境では絶対に `AllowPrivateIPs = true` に設定しないでください。これは SSRF 防護を完全に放棄することに等しく、攻撃者はこれを利用してクラウドメタデータ、内部サービス、管理インターフェースにアクセスできます。
:::

## ベストプラクティス

1. `SecureConfig()` を信頼できない URL を処理するセキュリティベースラインとして使用
2. `SSRFExemptCIDRs` で必要な CIDR 範囲のみを精密に免除し、`AllowPrivateIPs` を回避
3. `RedirectWhitelist` を設定してリダイレクト先ドメインを制限
4. ユーザー URL を処理する際はリダイレクトを無効化（`FollowRedirects = false`）
5. `SSRFExemptCIDRs` 設定を定期的に監査し、使用されなくなったネットワークセグメントを削除
6. `AuditMiddleware` ですべてのリクエストを記録し、事後の SSRF 攻撃試行の追跡に備える

## 次のステップ

- [TLS と証明書ピンニング](./tls-certpin) - TLS セキュリティ設定と証明書ピンニング
- [セキュリティ概要](./) - セキュリティ機能一覧
- [本番チェックリスト](./production-checklist) - リリース前の SSRF チェック項目
