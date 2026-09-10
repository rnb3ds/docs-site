---
sidebar_label: "セキュリティ概要"
title: "セキュリティ概要 - CyberGo HTTPC | セキュリティ機能総覧"
description: "HTTPC セキュリティ機能総覧：縦深防御マップ、デフォルト有効と手動有効化の比較表、SSRF プライベート IP ブロックと CIDR 免除、TLS バージョンと暗号スイート制御、証明書ピンニング、CRLF インジェクション防止、Cookie セキュリティ検証、解凍爆弾防護、URL 認証情報のマスクと警告機構。"
sidebar_position: 1
---

# セキュリティ概要

HTTPC は「デフォルトで安全」（Secure by Default）の原則に従います：すべての重要なセキュリティ機能がすぐに使用でき、追加設定なしで一般的な攻撃面に対処できます。ユーザー提供の URL を処理する場合、外部の信頼できないサービスを呼び出す場合、または高いセキュリティ要件のシナリオ（金融、医療、政府）で運用する場合、HTTPC の多層防御は信頼できるベースラインとなります。

## セキュリティ機能マトリクス

下表は各セキュリティ機能、対応する `Config` フィールド、デフォルト値、関連関数/オプションをまとめたもので、設定エントリをすばやく特定できます。

| 機能 | Config フィールド | デフォルト値 | 関連関数 / オプション |
|------|-------------|--------|------------------|
| TLS 最低バージョン | `SecurityConfig.MinTLSVersion` | TLS 1.2 | — |
| TLS 最高バージョン | `SecurityConfig.MaxTLSVersion` | TLS 1.3 | — |
| カスタム TLS 設定 | `SecurityConfig.TLSConfig` | `nil`（デフォルト使用） | — |
| 証明書検証スキップ | `SecurityConfig.InsecureSkipVerify` | `false` | テストのみ |
| 証明書ピンニング | `SecurityConfig.CertificatePinner` | `nil`（無効） | `NewSPKIHashPinner` など |
| SSRF 防護 | `SecurityConfig.AllowPrivateIPs` | `false`（有効） | `WithAllowPrivateIPs` |
| SSRF 精密免除 | `SecurityConfig.SSRFExemptCIDRs` | `nil` | — |
| URL 検証 | `SecurityConfig.ValidateURL` | `true` | — |
| リクエストヘッダー検証 | `SecurityConfig.ValidateHeaders` | `true` | — |
| Content-Length 厳格チェック | `SecurityConfig.StrictContentLength` | `true` | — |
| Cookie セキュリティ検証 | `SecurityConfig.CookieSecurity` | `nil`（検証しない） | `StrictCookieSecurityConfig`、`WithSecureCookie` |
| レスポンスボディサイズ制限 | `SecurityConfig.MaxResponseBodySize` | 10MB | — |
| リクエストボディサイズ制限 | `SecurityConfig.MaxRequestBodySize` | 0（無制限） | 明示的な設定が必要 |
| 解凍爆弾防護 | `SecurityConfig.MaxDecompressedBodySize` | 100MB | — |
| レスポンスヘッダーサイズ制限 | `ConnectionConfig.MaxResponseHeaderBytes` | 0（Go デフォルト 10MB） | — |
| リダイレクトホワイトリスト | `SecurityConfig.RedirectWhitelist` | `nil`（すべて許可） | — |
| リダイレクト回数制限 | `RequestDefaults.MaxRedirects` | 10 | `WithMaxRedirects` |
| リダイレクト追従 | `RequestDefaults.FollowRedirects` | `true` | `WithFollowRedirects` |

:::tip
ユーザー提供の URL を処理する場合、`httpc.SecureConfig()` をそのまま使用すれば最も厳格なセキュリティベースラインが得られます：リダイレクト無効、5MB レスポンス上限、より短いタイムアウト、URL/リクエストヘッダー検証の有効化。
:::

## 多層防御マップ

HTTPC のセキュリティ機能はリクエストライフサイクルの複数の層に分布しており、ある層がバイパスされても次の層がフォールバックします：

| 層 | タイミング | カバレッジ | 実装場所 |
|------|------|----------|----------|
| 事前検証層 | リクエスト送信前 | URL 形式/スキーム/長さ検証、SSRF ホスト名クイックチェック（localhost、IP リテラル、伝統的記法）、リクエストヘッダーの CRLF/制御文字、リクエストボディサイズ | `internal/security/validator.go` |
| リダイレクト層 | 各ホップの 30x | リダイレクトドメインホワイトリスト → SSRF ターゲット検証 → クロスオリジンでの機密ヘッダー削除 → 循環リダイレクト検出 → 回数上限 | `internal/engine/transport.go` |
| 接続層 | 実際のダイヤル時 | DNS を 1 回だけ解決し、解決された各 IP を検証、プライベートアドレスをフィルタした後、検証済み IP に直接接続（DNS リバインディング TOCTOU を防止） | `internal/connection/pool.go` |
| TLS 層 | ハンドシェイク時 | バージョン範囲（デフォルト 1.2-1.3）、ECDHE+AEAD 暗号スイートホワイトリスト、楕円曲線プリファレンス、再ネゴシエーション禁止、証明書ピンニング | `internal/connection/pool.go` |
| レスポンス層 | レスポンス読み取り時 | レスポンスボディ/解凍の二重上限、Content-Length 厳格検証、ストリーミング読み取り制限 | `internal/engine/response.go` |
| 出力サニタイズ層 | ログ/エラー/監査の記録時 | URL 認証情報のマスク、機密クエリパラメータの `[REDACTED]` 置換、機密リクエストヘッダーのマスク | `internal/validation/sanitize.go` |
| ダウンロード層 | ファイル書き込み時 | 5 層のパス防護（UNC/制御文字/システムディレクトリ/トラバーサル/シンボリックリンク）と SHA-256 整合性検証 | `download.go` |

SSRF を例にとった 3 層の連携：事前検証層がまずホスト名ベースで `localhost` とプライベート IP リテラルをインターセプトし（DNS を解決しないためネットワークオーバーヘッドゼロ）、リダイレクト層が各ホップのターゲットに対して検証を繰り返し、接続層がダイヤル前に DNS を解決して実際の IP を検証します。攻撃者が DNS リバインディングを用いてもバイパスは困難です。詳細は [SSRF 防護](./ssrf) を参照してください。

## デフォルト動作：すぐに使えるもの vs 手動有効化が必要なもの

各項目はソースコードのデフォルト値（`types.go` の `DefaultConfig()`）に基づきます。

### デフォルト有効（設定不要）

| 機能 | デフォルト値 | 説明 |
|------|--------|------|
| SSRF 防護 | `AllowPrivateIPs = false` | プライベート/予約/ループバック/リンクローカル IP をブロック。IPv6 と混合記法によるバイパスを含む |
| URL 検証 | `ValidateURL = true` | http/https のみ許可、scheme と host の非空を要求 |
| リクエストヘッダー検証 | `ValidateHeaders = true` | CRLF インジェクションと制御文字を拒否、Connection/Transfer-Encoding トークンを検証 |
| TLS バージョン範囲 | TLS 1.2 – 1.3 | TLS 1.0/1.1 を拒否；フィールドが 0 の場合は自動的に 1.2/1.3 にフォールバック |
| TLS 暗号スイート | ECDHE+AEAD ホワイトリスト | 前方秘匿を強制する 6 つのスイート；`RenegotiateNever` で再ネゴシエーションを禁止 |
| リダイレクト SSRF 検証 | 各ホップで実行 | リダイレクト先も同様に SSRF 検証を通過 |
| クロスオリジンリダイレクトでのヘッダー削除 | 自動 | 異なるホストへのジャンプ時に Authorization/Cookie/Proxy-Authorization を削除 |
| 循環リダイレクト検出 | 自動 | A→B→A 形式のループを検出（連続同一 URL を除く） |
| リダイレクト上限 | 10 回 | 設定上限は 50、「無制限回数」モードは存在しない |
| レスポンスボディ上限 | 10MB | 超過時にエラーを返す |
| 解凍爆弾防護 | 100MB | 解凍後の実際のサイズを制限 |
| Content-Length 厳格検証 | `StrictContentLength = true` | レスポンスバイト数と Content-Length が不一致の場合にエラー（HEAD を除く） |
| ログ/エラーのマスキング | 自動 | URL 認証情報を `***:***` に、token/password などのパラメータを `[REDACTED]` に置換 |
| ダウンロードパス防護 | 自動 | 5 層チェック + 検証失敗時にダウンロード済みファイルを自動削除 |
| HTTP/2 | `EnableHTTP2 = true` | TLS 下で ALPN によりネゴシエーション |

### デフォルト無効（明示的な有効化が必要）

| 機能 | デフォルト値 | 有効化方法 |
|------|--------|----------|
| 証明書ピンニング | `CertificatePinner = nil` | `NewSPKIHashPinner` などで構築後に代入。[TLS と証明書ピンニング](./tls-certpin) を参照 |
| Cookie セキュリティ検証 | `CookieSecurity = nil`（検証しない） | `StrictCookieSecurityConfig()` |
| リダイレクトドメインホワイトリスト | `RedirectWhitelist = nil`（すべて許可） | ドメイン/ワイルドカードのリストを設定 |
| リクエストボディ上限 | `MaxRequestBodySize = 0`（無制限、フォールバックなし） | バイト数を明示的に設定 |
| transport レベルレスポンスヘッダータイムアウト | `ResponseHeader = 0`（無効） | Slowloris 対策の縦深防御が必要な場合に設定 |
| Cookie jar | `EnableCookies = false` | true に設定、または DomainClient を使用 |
| DoH | `EnableDoH = false` | true に設定 |

:::tip
「デフォルト無効」の項目は欠陥ではなく、ビジネス要件を予測できないオプションです：証明書ピンニングには対象サービスの実際のフィンガープリントが必要で、リクエストボディ上限はビジネスのメッセージサイズに依存します。信頼できない URL を処理する場合、`SecureConfig()` がそのうちの複数を一括して引き締めます（リダイレクト禁止、5MB レスポンス上限、より短いタイムアウト）。
:::

## TLS セキュリティ

HTTPC はデフォルトで TLS 1.2+ を要求し、安全でないことが証明されている TLS 1.0/1.1 を拒否します：

```go
cfg := httpc.DefaultConfig()
// デフォルトで TLS 1.2-1.3、手動設定不要
cfg.Security.MinTLSVersion = tls.VersionTLS12
cfg.Security.MaxTLSVersion = tls.VersionTLS13
```

TLS 1.3 のみを強制する場合（より高いセキュリティ要件、クライアントとサーバー両方がサポート）、`MinTLSVersion = tls.VersionTLS13` を設定するだけです。`TLSConfig` を設定すると、`MinTLSVersion`/`MaxTLSVersion` は無視され——`TLSConfig` が優先されます。

デフォルトの TLS 設定（`TLSConfig` 未設定時）には、さらに以下のハードニング項目が含まれます：

- **暗号スイートホワイトリスト**：前方秘匿を強制する 6 つの ECDHE + AEAD スイートのみ許可（ECDSA/RSA × AES-128-GCM/AES-256-GCM/ChaCha20-Poly1305）、CBC と静的 RSA 鍵交換を除外
- **楕円曲線プリファレンス**：X25519、P-256、P-384
- **再ネゴシエーション禁止**：`RenegotiateNever`、再ネゴシエーション系の攻撃を防止
- **セッション再利用**：クライアントセッションチケットの LRU キャッシュ（256 エントリ）、再接続時のハンドシェイクを高速化

これらのハードニング項目は、HTTPC が transport を構築する際に一律で注入されます（`internal/connection/pool.go` の `createTLSConfig`）。カスタム `TLSConfig` を設定した場合はあなたの設定が優先されます——証明書ピンニングは引き続き重ねて注入されますが、その他のスイート/曲線の設定は有効になりません。

:::warning
`InsecureSkipVerify` はテストのみに使用します。本番環境では絶対に `true` に設定しないでください。そうしないと TLS 暗号化が形骸化し、中間者が自由に盗聴・改ざんできます。設定すると HTTPC は非テスト環境の `stderr` にセキュリティ警告を出力します（下記「セキュリティ警告メカニズム」を参照）。
:::

TLS の詳細（暗号スイート、証明書ピンニング、mTLS、カスタム CA）は [TLS と証明書ピンニング](./tls-certpin) を参照してください。

## SSRF 防護

SSRF（Server-Side Request Forgery、サーバーサイドリクエストフォージェリ）は、攻撃者がサーバーを誘導して内部ネットワークにリクエストを送信させる攻撃手法で、クラウドメタデータ認証情報の窃取、内部ネットワークポートのスキャン、内部管理インターフェースへのアクセスが可能になります。HTTPC はデフォルトで SSRF 防護が有効で、プライベート/予約 IP セグメントへの接続をブロックします。

```go
cfg := httpc.DefaultConfig()
// AllowPrivateIPs = false（デフォルト）→ 127.0.0.1, 10.x, 192.168.x, 169.254.x などをブロック

// 特定の CIDR を精密に免除（VPN、VPC 内部サービスなど）
cfg.Security.SSRFExemptCIDRs = []string{
    "10.0.0.0/8",    // VPC 内部
    "100.64.0.0/10", // Tailscale VPN
}

// 最強の SSRF 防護プリセット
client, _ := httpc.New(httpc.SecureConfig())
```

### ブロックされる IP 範囲

| 範囲 | CIDR | 説明 |
|------|------|------|
| IPv4 ループバック | `127.0.0.0/8` | localhost |
| クラス A プライベート | `10.0.0.0/8` | 内部ネットワーク |
| クラス B プライベート | `172.16.0.0/12` | 内部ネットワーク |
| クラス C プライベート | `192.168.0.0/16` | 内部ネットワーク |
| リンクローカル | `169.254.0.0/16` | 自動設定（AWS/Azure メタデータを含む） |
| CGNAT | `100.64.0.0/10` | キャリアグレード NAT（Alibaba Cloud メタデータを含む） |
| クラス E 予約 | `240.0.0.0/4` | 予約アドレス |
| "このネットワーク" | `0.0.0.0/8` | このネットワーク識別子 |
| TEST-NET | `192.0.2.0/24` など | ドキュメント用途 |
| IPv6 ループバック | `::1/128` | localhost |
| IPv6 ユニークローカル | `fc00::/7` | 内部ネットワーク |
| IPv6 リンクローカル | `fe80::/10` | 自動設定 |

> 上表は主要な範囲です。完全なリスト（IPv4-mapped IPv6、NAT64 `64:ff9b::/96`、IPv6 ドキュメントプレフィックス `2001:db8::/32` などを含む）はソースコード `isPrivateOrReservedIP` を参照してください。HTTPC はさらに 10 進数/16 進数/8 進数などの伝統的 IP リテラル（`2130706433`、`0x7f000001` など）もブロックし、バイパスを防止します。詳細は [SSRF 防護](./ssrf) を参照してください。

## リクエストヘッダー検証

`ValidateHeaders`（デフォルト有効）は CRLF インジェクションとリクエストヘッダースマグリングを自動的に防止します——キャリッジリターン・ラインフィード、ヌルバイトなどの制御文字を含むリクエストヘッダー値を拒否します：

```go
// 以下のヘッダーは拒否されます
httpc.WithHeader("X-Custom", "value\r\nInjected: header") // CRLF インジェクション
httpc.WithHeader("X-Bad", "value\x00null")                // 制御文字
```

検証は O(1) ルックアップテーブルを使用し、パフォーマンスオーバーヘッドは極めて低く、`PerformanceConfig()` もこの検証を保持しています。

CRLF と制御文字に加え、マルチトークンリクエストヘッダー（RFC 9110 構文）には**トークンホワイトリスト検証**も行われます：`Connection` は `keep-alive`/`close`/`upgrade` のみ、`Transfer-Encoding` は `chunked`/`compress`/`deflate`/`gzip`/`identity` のみ許可し、リクエストスマグリング（request smuggling）を防止します。

## サニタイズとログマスキング

HTTPC は**出力側**にも防護があります：ログ、エラーメッセージ、監査イベントに入るすべての URL は `SanitizeURL` でクレンジングされ（`internal/validation/sanitize.go`）、認証情報と機密パラメータの二次漏洩を防止します：

```go
// クレンジング前：https://user:pass@example.com/api?token=abc123&file=1
// クレンジング後：https://***:***@example.com/api?token=[REDACTED]&file=1
```

| クレンジングルール | 説明 |
|----------|------|
| URL 認証情報のマスク | `user:pass@host` → `***:***@host` |
| 機密クエリパラメータのマスキング | `token`、`access_token`、`api_key`、`password`、`signature` など 20 以上のパラメータ名（大文字小文字を区別しない）→ `[REDACTED]` |
| fragment の削除 | OAuth 暗黙的付与のフラグメントがログに入るのを防止 |

このクレンジングは自動的に適用されます：エラー分類時の URL（`ClientError` に元の認証情報が現れない）、`LoggingMiddleware` のリクエストログ、`AuditMiddleware` の監査イベント、`Config.String()` のプロキシ認証情報マスク。

:::tip
この層のクレンジングが防ぐのは「二次漏洩」です——攻撃が他の層でブロックされた後でも、ログとエラー集約システム（ELK、Sentry）が認証情報の集散地になり得ます。HTTPC はデフォルトで発生源でマスキングするため、追加設定は不要です。
:::

## Cookie セキュリティ

HTTPC は 3 層の Cookie セキュリティ制御を提供します：設定レベル（グローバル）、セッションレベル（`SessionManager`）、リクエストレベル（`WithSecureCookie`）。

### CookieSecurityConfig

`CookieSecurityConfig` は Cookie が満たすべきセキュリティ属性を定義し、CSRF、XSS、セッションハイジャックを防護します：

| フィールド | 説明 | Default | Strict |
|------|------|---------|--------|
| `RequireSecure` | HTTPS 送信のみ | `false` | `true` |
| `RequireHttpOnly` | JS アクセス禁止 | `false` | `true` |
| `RequireSameSite` | SameSite 属性 | `""`（制限なし） | `"Strict"` |
| `AllowSameSiteNone` | SameSite=None 許可 | `true` | `false` |
| `RequireSecureForSameSiteNone` | None は Secure 必須 | `true` | `true` |

### 設定レベル検証（グローバル）

```go
cfg := httpc.DefaultConfig()
// 厳格モード：Secure + HttpOnly + SameSite=Strict を要求
cfg.Security.CookieSecurity = httpc.StrictCookieSecurityConfig()

// またはカスタム
cfg.Security.CookieSecurity = &httpc.CookieSecurityConfig{
    RequireSecure:   true,
    RequireHttpOnly: true,
    RequireSameSite: "Lax",
}
```

### セッションレベル検証

```go
sm, _ := httpc.NewSessionManagerDefault()
// 以降のすべての SetCookie 呼び出しに影響、追加順序に依存しない
sm.SetCookieSecurity(httpc.StrictCookieSecurityConfig())
```

### リクエストレベル検証

```go
security := &httpc.CookieSecurityConfig{
    RequireSecure:   true,
    RequireHttpOnly: true,
}
// 注意：WithSecureCookie は WithCookie の後に配置する必要があり、その時点で追加済みの Cookie のみ検証する
result, err := client.Get("https://api.example.com",
    httpc.WithCookie(sessionCookie),
    httpc.WithSecureCookie(security),
)
```

:::warning
`WithSecureCookie` はリクエストレベルの「事後検証」です：その適用時に既存の Cookie のみを検証します。必ずすべての `WithCookie` オプションの後に配置してください。追加順序に依存しないグローバル検証が必要な場合は、設定レベルの `CookieSecurity` またはセッションレベルの `SetCookieSecurity` を使用してください。
:::

## 解凍爆弾防護

攻撃者は高圧縮率の gzip/deflate レスポンスでメモリを枯渇させる可能性があります（例：10MB の圧縮データが解凍後に数 GB になる）。`MaxDecompressedBodySize`（デフォルト 100MB）は解凍後の実際のサイズを制限し、根本から解凍爆弾をブロックします。

```go
cfg := httpc.DefaultConfig()
cfg.Security.MaxDecompressedBodySize = 50 * 1024 * 1024 // 50MB 解凍上限
```

### 優先関係

| 設定状況 | 有効な制限 |
|----------|----------|
| `MaxResponseBodySize` のみ設定 | それが基準（より厳格） |
| `MaxDecompressedBodySize` のみ設定 | 解凍後のサイズを制限 |
| 両方設定 | より小さい方（より厳格な方）が有効 |

:::tip
`MaxResponseBodySize` は解凍前の転送バイトを制限し、`MaxDecompressedBodySize` は解凍後の実際のバイトを制限します。両者が連携して二層の防護を提供します。
:::

## リクエストボディサイズ制限

`MaxRequestBodySize` はアップロードリクエストボディのサイズを制限し、クライアントが誘導されて超大リクエストを送信し、帯域幅やメモリを枯渇させるのを防止します。

```go
cfg := httpc.DefaultConfig()
cfg.Security.MaxRequestBodySize = 5 * 1024 * 1024 // 5MB アップロード上限
```

:::warning
`MaxResponseBodySize`（デフォルト 10MB）とは異なり、`MaxRequestBodySize` はデフォルトで **0（無制限）** であり、**自動フォールバック値もありません**。ユーザーアップロードの処理やプロキシ転送リクエストでは、必ず上限を明示的に設定してください。
:::

## リダイレクトセキュリティ

リダイレクトは SSRF とオープンリダイレクトの一般的な媒介です。HTTPC は多層の制御を提供します：

```go
// セキュリティ重視シナリオ：リダイレクトを完全に無効化
cfg := httpc.SecureConfig() // FollowRedirects = false

// またはリダイレクト先ドメインを制限（ワイルドカード *.example.com をサポート）
cfg := httpc.DefaultConfig()
cfg.Security.RedirectWhitelist = []string{
    "api.example.com",
    "auth.example.com",
    "*.cdn.example.com",
}
```

`RedirectWhitelist` は完全一致とワイルドカードをサポートします：`*.example.com` は `api.example.com` などの厳密なサブドメインにマッチしますが、ベアドメイン `example.com` にはマッチしません（両者は別々に記載が必要）。ホワイトリスト外のドメインへのリダイレクトはブロックされます。リダイレクト先は同時に SSRF IP 検証も受けます。

ホワイトリストに加え、各ホップのリダイレクトは以下の順でチェックされます（いずれかが失敗するとそのホップを拒否、実装は `internal/engine/transport.go` の `checkRedirect`）：

1. **スキームチェック**：http/https のみ許可し、`file://` などの他のスキームを拒否
2. **SSRF ターゲット検証**：リダイレクト先のホスト名を SSRF ルールで検証し、`http://169.254.169.254/` のようなターゲットは直接拒否
3. **クロスオリジンでの機密ヘッダー削除**：ターゲットホストが開始ホストと異なる場合、`Authorization`、`Cookie`、`Proxy-Authorization` を自動削除——リダイレクトが許可されても、認証情報がサードパーティドメインに持ち込まれることはありません
4. **循環リダイレクト検出**：A→B→A 形式のループを検出してエラー（連続同一 URL の A→A はループとみなさない。サーバーが毎回異なるレスポンスを返す可能性があるため）
5. **回数上限**：デフォルト 10 回、設定のハード上限は 50（`MaxRedirects`）、「無制限回数」モードは存在しない

リダイレクトの追従制御、チェーン追跡と手動処理は [リダイレクトガイド](../guides/redirects) を参照してください。

## レスポンスヘッダーサイズ制限

`MaxResponseHeaderBytes` はサーバーのレスポンスヘッダーサイズを制限し、悪意のあるサーバーが超大レスポンスヘッダーを送信してメモリを枯渇させるのを防止します：

```go
cfg := httpc.DefaultConfig()
cfg.Connection.MaxResponseHeaderBytes = 1 * 1024 * 1024 // 1MB レスポンスヘッダー上限
```

デフォルトの 0 は Go 標準ライブラリのデフォルト値（10MB）を使用することを意味します。高セキュリティシナリオでは 1MB に引き締めることを推奨します。

## セキュリティ警告メカニズム

HTTPC は高危険度設定に対し非テスト環境で `stderr` に警告を出力し、開発者に適時修正を促します。2 種類の設定が警告をトリガーします：

| 設定 | 警告トリガー条件 | 警告内容 |
|------|-------------|----------|
| `InsecureSkipVerify = true` | `httpc.New()` で検出、非テスト環境 | TLS 証明書検証が無効化されています |
| `TestingConfig()` | 呼び出し時に検出、非テスト環境 | TLS 検証、SSRF 防護、URL/リクエストヘッダー検証が無効化されています |

警告は `sync.Once` により各プロセスでそれぞれ最大 1 回のみトリガーされ、ログのスパムを防ぎます。テスト環境の判定基準：実行可能ファイルのサフィックスが `.test` / `.test.exe`、または `GO_TEST` / `GOTEST=1` 環境変数が設定されていること。

### 警告のリダイレクトまたは抑制

```go
// カスタム writer にリダイレクト（構造化ログなど）
httpc.SetSecurityWarnOutput(os.Stdout)

// 完全に抑制（非推奨——警告はセキュリティのガードレールであり、黙らせるべきでない）
httpc.SetSecurityWarnOutput(io.Discard)
```

:::warning
`SetSecurityWarnOutput(io.Discard)` はセキュリティ警告を静かに飲み込みます。設定を十分に監査済み（`TestingConfig` がテストバイナリのみに使用されることを確認など）の場合にのみ使用し、本番デプロイで警告を隠すために使用しないでください。
:::

## ファイルダウンロードセキュリティ

`Download` のファイルパスは `prepareFilePath` による 5 層の防護を経て、パストラバーサルとファイル上書き攻撃を防止します：

1. **UNC パスブロック**：`\\server\share` などのネットワークパスを拒否
2. **制御文字フィルタ**：制御文字（`< 0x20`、`0x7F`、`0x00`）を含むパスを拒否
3. **システムパス保護**：`/etc`、`/bin`、`C:\Windows` などのシステムディレクトリへの書き込みを拒否（親ディレクトリのシンボリックリンク解決を含む）
4. **パストラバーサル検出**：`filepath.Clean` 後に `../` で作業ディレクトリを脱出するのをブロック
5. **シンボリックリンク防護**：ターゲットがシンボリックリンクのパスを拒否、親ディレクトリを再帰的にチェックして TOCTOU 攻撃を防止

ダウンロード完了後に `Checksum` フィールドでファイルの整合性（SHA-256）を検証でき、検証失敗時はダウンロード済みファイルが自動削除されます。

## 監査ミドルウェア

`AuditMiddleware` は各リクエスト/レスポンスサイクルに対して構造化された監査イベントを生成し、コンプライアンス要件が厳格なシナリオ（金融、医療、政府）に適しています。URL は自動的にマスク（認証情報削除）され、機密リクエストヘッダー（Authorization、Cookie など）はデフォルトでマスキングされます。

```go
auditMiddleware := httpc.AuditMiddleware(&httpc.AuditConfig{
    OnAudit: func(event httpc.AuditEvent) {
        // event.URL はマスク済み；SourceIP/UserID は context から抽出
        log.Printf("[AUDIT] %s %s -> %d (%v)",
            event.Method, event.URL, event.StatusCode, event.Duration)
    },
    Format:         "json",   // text または json
    IncludeHeaders: true,     // リクエスト/レスポンスヘッダーを記録（機密ヘッダーはマスキング）
    MaskHeaders:    []string{"Authorization", "Cookie", "Set-Cookie"},
    SanitizeError:  true,     // エラー内の機密情報をクレンジング
})
```

`SourceIP` と `UserID` は context キーで注入されます：`httpc.SourceIPKey`、`httpc.UserIDKey`。完全な監査フィールド、設定項目と本番プラクティスは [本番チェックリスト](./production-checklist) を参照してください。

## 次のステップ

- [SSRF 防護](./ssrf) - SSRF 防護の詳細、CIDR 免除とクラウドメタデータ保護
- [TLS と証明書ピンニング](./tls-certpin) - TLS 設定、証明書ピンニングと mTLS
- [本番チェックリスト](./production-checklist) - リリース前のカテゴリ別チェック項目と検証方法
