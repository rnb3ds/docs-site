---
sidebar_label: "TLS と証明書ピンニング"
title: "TLS と証明書ピンニング - CyberGo HTTPC | 暗号とピンニング"
description: "HTTPC TLS と証明書ピンニングガイド：TLS 1.2-1.3 バージョン制御、SPKI ハッシュ生成手順と鍵ローテーション、3 種類の Pinner コンストラクタ比較、カスタム CertificatePinner、mTLS 相互認証、カスタム CA 証明書と Let's Encrypt 短周期証明書のピンニング戦略。"
sidebar_position: 3
---

# TLS と証明書ピンニング

## TLS バージョン制御

HTTPC はデフォルトで TLS 1.2+ を要求し、安全でないことが証明されている TLS 1.0/1.1 を拒否します。より強力な前方秘匿性とよりシンプルなハンドシェイクのため TLS 1.3 を推奨します：

```go
cfg := httpc.DefaultConfig()
cfg.Security.MinTLSVersion = tls.VersionTLS12  // デフォルト
cfg.Security.MaxTLSVersion = tls.VersionTLS13  // デフォルト
```

### バージョンの説明

| バージョン | ステータス | HTTPC デフォルト |
|------|------|-----------|
| TLS 1.0 | 安全ではない、非推奨（POODLE/BEAST） | 拒否 |
| TLS 1.1 | 安全ではない、非推奨 | 拒否 |
| TLS 1.2 | 安全 | 最低要件 |
| TLS 1.3 | 最も安全、推奨（前方秘匿性を強制） | サポート |

:::tip
TLS 1.3 のみを強制する場合（より高いセキュリティ、よりシンプルなハンドシェイク）、`MinTLSVersion = tls.VersionTLS13` を設定します。一部の古いクライアント/プロキシは TLS 1.3 をサポートしない可能性があるため、有効化前にターゲットサービスの互換性を確認してください。
:::

:::warning
`Security.TLSConfig` を設定すると、`MinTLSVersion` と `MaxTLSVersion` は**無視され**、`TLSConfig` の設定が優先されます。カスタム `TLSConfig` でバージョンを制御する必要がある場合は、`TLSConfig.MinVersion` / `MaxVersion` を設定してください。
:::

## 暗号スイート

デフォルト設定では安全な暗号スイートのみを許可します（前方秘匿性を強制する ECDHE シリーズ、AEAD 暗号化）：

| 暗号スイート | 説明 |
|----------|------|
| `TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256` | 推奨 |
| `TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384` | 推奨 |
| `TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305` | 推奨 |
| `TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256` | 推奨 |
| `TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384` | 推奨 |
| `TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305` | 推奨 |

TLS 1.3 の暗号スイートはプロトコルが自動的にネゴシエーションし、`CipherSuites` フィールドでは制御されません。

## カスタム TLS 設定

細粒度の制御（カスタム CA、mTLS、暗号スイートの固定）が必要な場合、`Security.TLSConfig` を設定します：

```go
cfg := httpc.DefaultConfig()
cfg.Security.TLSConfig = &tls.Config{
    MinVersion: tls.VersionTLS13,  // TLS 1.3 を強制
    // その他のカスタム設定
}
```

### カスタム CA 証明書

内部 CA が署名したサービス（企業内部 PKI、自己署名証明書）に接続する場合、カスタムルート証明書を読み込みます：

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
		log.Fatal("CA 証明書を解析できません")
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
	log.Println("カスタム CA クライアントが準備完了")
}
```

### 相互 TLS (mTLS)

サーバーがクライアント証明書を要求する場合（mTLS）、`Certificates` フィールドを設定します：

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
	log.Println("mTLS クライアントが準備完了")
}
```

:::tip
mTLS はゼロトラストネットワーク、サービスメッシュ内部認証、金融 API でよく使用されます。サーバーはクライアント証明書で呼び出し元の身元を識別し、追加トークンが不要です。証明書のローテーション時には `client-cert.pem` / `client-key.pem` を同期的に更新する必要があります。
:::

## 証明書ピンニング

証明書ピンニング（Certificate Pinning）は標準の証明書チェーン検証**の上に**追加の検証層を重ねます：サーバー証明書チェーンに既知の固定公開鍵/証明書が存在することを要求します。信頼された CA が侵害されたり、脅迫されて偽造証明書が署名されても、攻撃者は中間者攻撃ができません——その証明書の公開鍵が固定値に一致しないためです。

### 仕組み

標準 TLS 検証：クライアントは信頼された CA が署名したすべての証明書を信頼します。証明書ピンニング：クライアントは証明書の公開鍵ハッシュが事前格納値に一致することを追加で要求します。

```
標準検証:  CA を信頼 → CA が署名したすべての証明書を信頼
証明書ピンニング:  CA を信頼 + 証明書の公開鍵が事前格納ハッシュに一致する必要
```

ピンニングは標準検証の上に重ねられ、`InsecureSkipVerify` を設定する必要はありません。HTTPC は証明書チェーンの**任意の階層**の証明書を検証するため、中間証明書をピンニングすれば、リーフ証明書の更新後も引き続き有効です。

### SPKI ハッシュ生成手順

SPKI（SubjectPublicKeyInfo）ハッシュは最も一般的なピンニング形式（HPKP 標準）です。生成手順：

**ステップ 1**：サーバー証明書を取得（ブラウザからエクスポート、または openssl で取得）

```bash
# サーバーから証明書チェーンを取得
openssl s_client -connect example.com:443 -showcerts < /dev/null 2>/dev/null \
  | openssl x509 -outform pem > cert.pem
```

**ステップ 2**：証明書から公開鍵を抽出 → DER エンコード → SHA-256 → base64

```bash
openssl x509 -in cert.pem -pubkey -noout | \
  openssl pkey -pubin -outform der | \
  openssl dgst -sha256 -binary | \
  openssl enc -base64
# 出力：YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2fuihg=
```

3 ステップの分解：

| ステップ | コマンド片 | 作用 |
|------|---------|------|
| 公開鍵の抽出 | `openssl x509 -pubkey -noout` | X.509 証明書から PEM 形式の公開鍵を抽出 |
| DER エンコード | `openssl pkey -pubin -outform der` | PEM 公開鍵を DER（PKIX）形式に変換 |
| ハッシュエンコード | `openssl dgst -sha256 -binary \| openssl enc -base64` | SHA-256 後に base64 エンコード |

:::tip
リーフ証明書ではなく**中間証明書**の SPKI をピンニングすることを推奨します。中間証明書は有効期間が長く（通常 5-10 年）、リーフ証明書の更新（Let's Encrypt の 90 日など）時も中間証明書は変わらず、固定値を頻繁に更新する必要がありません。
:::

### SPKI ハッシュピンニング（推奨）

`NewSPKIHashPinner` は 1 つ以上の base64 エンコードされた SHA-256 SPKI ハッシュを受け取ります。複数のハッシュを提供することで鍵のローテーションをサポートします——いずれかが一致すれば通過します：

```go
package main

import (
	"crypto/tls"
	"log"

	"github.com/cybergodev/httpc"
)

func main() {
	pinner, err := httpc.NewSPKIHashPinner(
		"YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2fuihg=", // 現在の中間証明書
		"C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=", // バックアップ（鍵のローテーション）
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
	log.Println("証明書ピンニングクライアントが準備完了")
}
```

`NewSPKIHashPinner` はハッシュが空または正規の base64 でない場合にエラーを返し、起動時に設定の問題を露呈させます。検証ロジック：サーバー証明書チェーンの各階層の証明書を走査し、その SPKI の SHA-256 を計算し、いずれかの固定ハッシュに一致すれば通過します。

:::tip
`CertificatePinner` は標準の TLS チェーン検証**の上に**ピンニング検証を重ねるものであり、`InsecureSkipVerify` を設定する必要はありません。検証は証明書チェーンの任意の階層の証明書に有効なため、中間証明書を固定すればリーフ証明書の更新後も引き続き有効です。
:::

### 3 種類の Pinner コンストラクタ比較

HTTPC は 3 種類の Pinner コンストラクタを提供し、適用シナリオが異なります：

| コンストラクタ | 入力 | 適用シナリオ | 推奨度 |
|--------|------|---------|--------|
| `NewSPKIHashPinner` | base64 SHA-256 SPKI ハッシュ | 最も一般的（HPKP 形式） | 推奨 |
| `NewPublicKeyPinner` | DER エンコード PKIX 公開鍵 | 生の公開鍵バイトを保持済み | 便利 |
| `NewCertificatePinnerChain` | 複数の Pinner | 複数戦略の組み合わせ/混合ローテーション鍵 | 高度 |

```go
// 1. SPKI ハッシュ（推奨、最も一般的）
spkiPinner, err := httpc.NewSPKIHashPinner(
    "YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2fuihg=",
)

// 2. DER 公開鍵（生の公開鍵バイトを保持済み、内部で SHA-256 を計算）
pubPinner, err := httpc.NewPublicKeyPinner(pubKeyDER1, pubKeyDER2)

// 3. 複数の pinner を組み合わせ、いずれかが通過すれば受け入れ（混合戦略や異なるコンストラクタのローテーション鍵向け）
chainPinner := httpc.NewCertificatePinnerChain(spkiPinner, pubPinner)
cfg.Security.CertificatePinner = chainPinner
```

`NewCertificatePinnerChain` は引数なしの場合「すべて拒否」の Pinner（セキュアなデフォルト）を返し、設定漏れが「すべて許可」として暗黙的に通過されるのを防ぎます。

### カスタム CertificatePinner

高度なシナリオでカスタムピンニング戦略（完全な証明書而非公開鍵の固定、構成センターからの動的な固定値取得など）が必要な場合、`CertificatePinner` インターフェースを直接実装できます：

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

// fullCertPinner は公開鍵 SPKI ではなく完全な証明書の SHA-256 を固定します。
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

// Pin は CertificatePinner インターフェースを実装し、固定値の記述を返します（ログ/デバッグ用）。
func (p *fullCertPinner) Pin() string {
	return "full-cert-pinner"
}

// VerifyPeerCertificate は CertificatePinner インターフェースを実装します。
// nil を返せば受け入れ、非 nil ならハンドシェイクを拒否します。
func (p *fullCertPinner) VerifyPeerCertificate(rawCerts [][]byte, verifiedChains [][]*x509.Certificate) error {
	if len(verifiedChains) == 0 || len(verifiedChains[0]) == 0 {
		return errors.New("certificate pinning failed: empty chain")
	}
	for _, cert := range verifiedChains[0] {
		sum := sha256.Sum256(cert.Raw)
		hash := base64.StdEncoding.EncodeToString(sum[:])
		if p.pinnedHashes[hash] {
			return nil // マッチ、受け入れ
		}
	}
	return errors.New("certificate pinning failed: no matching certificate")
}

func main() {
	// 完全なリーフ証明書の SHA-256 を固定（証明書更新後はこの値を更新する必要あり）
	pinner := newFullCertPinner(
		"wert6uY/PCq3yAAbZA/wtqfzfQsTwmxnfv6I3vRz1XQ=", // 証明書 Raw の SHA-256
	)

	cfg := httpc.DefaultConfig()
	cfg.Security.TLSConfig = &tls.Config{MinVersion: tls.VersionTLS12}
	cfg.Security.CertificatePinner = pinner
	client, err := httpc.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer func() { _ = client.Close() }()
	log.Println("カスタム証明書ピンニングクライアントが準備完了")
}
```

:::warning
カスタム `CertificatePinner` を実装する際は、必ず標準の証明書チェーン検証（`verifiedChains`）が通過した上にピンニング検証を重ねてください。これで標準検証を置き換えないでください——常に `InsecureSkipVerify = false` を維持してください。
:::

## 複数ハッシュと鍵ローテーション

`NewSPKIHashPinner` と `NewPublicKeyPinner` はどちらも複数の値を受け取り、いずれかが一致すれば通過します。これが鍵ローテーションの鍵です：新旧の公開鍵を同時に固定し、ローテーション期間中は新旧両方の証明書が通過でき、ダウンタイムなしの切り替えが可能です。

ローテーションフロー：

1. サーバー側で新鍵ペアを生成し、新証明書を署名
2. クライアント側で固定値を更新、**新旧両方のハッシュを保持**：
   ```go
   pinner, _ := httpc.NewSPKIHashPinner(
       "OLD_HASH...", // 旧鍵（ローテーション期間中は保持）
       "NEW_HASH...", // 新鍵（まもなく有効化）
   )
   ```
3. クライアントをデプロイし、新旧両方の証明書が通過することを確認
4. サーバー側で新証明書に切り替え
5. しばらく観察し問題がなければ、固定値から旧ハッシュを削除

:::danger
証明書ピンニングの失効（固定値の不一致）は接続の完全な失敗を招き、自動回復できません。必ず：
- **常に少なくとも 1 つのバックアップ固定値を保持**し、主鍵の意外な破損に備える
- ローテーションは「先に新規追加、後に旧削除」のダブルウィンドウ戦略を採用
- 監視を構築し、ピンニング失敗時にすばやくクライアント設定をロールバック
:::

## 証明書ピンニングと Let's Encrypt

Let's Encrypt の証明書は有効期間が 90 日のみで、頻繁に更新されます。リーフ証明書を直接固定すると 90 日ごとに固定値を更新する必要があり、メンテナンスコストが高くなります。推奨戦略：

| 固定対象 | 有効期間 | 更新の影響 | 推奨度 |
|---------|--------|---------|--------|
| リーフ証明書 | 90 日 | 毎回の更新で固定値の更新が必要 | 低 |
| Let's Encrypt 中間証明書 | 約 5 年 | 中間証明書のローテーション（数年に一度）時のみ更新が必要 | 推奨 |
| 自ドメインの公開鍵（セルフホストの場合） | 自分で制御 | 自発的な鍵ローテーション時のみ更新 | 状況による |

Let's Encrypt の中間証明書（R3、R10、R11 など）は有効期間が数年で、中間証明書の SPKI を固定すればセキュリティと低メンテナンスコストを両立できます。Let's Encrypt は中間証明書をローテーションする際に事前に公表するため、余裕を持って固定値を更新できます。

```go
// Let's Encrypt の中間証明書を固定（推奨）
pinner, err := httpc.NewSPKIHashPinner(
    "YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2fuihg=", // 現在の中間証明書
    "C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=", // バックアップ/次回ローテーションの中間証明書
)
```

:::tip
Let's Encrypt の中間証明書の公開鍵はローテーション時も通常変更されません（新証明書の署名のみ、公開鍵は再利用）。完全な中間証明書より公開鍵 SPKI を固定する方が安定します——公開鍵が変わらなければ SPKI ハッシュも変わらないためです。
:::

## 証明書ピンニングのセキュリティ考慮

| リスク | 結果 | 緩和策 |
|------|------|---------|
| 固定値の期限切れ/不一致 | 接続の完全な失敗 | 複数ハッシュ + バックアップ鍵 + 監視 |
| バックアップ鍵の紛失 | ローテーション不可、ロックアウト | オフラインで複数の鍵ペアをバックアップ |
| 固定値のハードコード | 更新にリリースが必要 | 構成センターからの動的読み込み（カスタム Pinner） |
| 単一階層のみ固定 | 単一障害点 | 複数階層の固定（リーフ + 中間） |

:::warning
証明書ピンニングは「諸刃の剣」です：MITM/CA 侵害に対する防御を大幅に強化しますが、ピンニング失効はハード障害を引き起こします。採用前に以下を確認してください：
1. 信頼できる固定値の更新と配布メカニズムがある
2. ピンニング失敗率を監視し、アラートを設定する
3. 緊急時の「ピンニング無効化」スイッチを保持する（セキュリティは低下するが）
:::

### ピンニング戦略の比較

| 戦略 | セキュリティ | メンテナンスコスト | 推奨シナリオ |
|------|--------|----------|---------|
| ルート証明書の固定 | 低 | 低 | 改ざん防止のみ、CA の範囲が広すぎる |
| 中間証明書の固定 | 中 | 中 | **推奨**、セキュリティとメンテナンスのバランス |
| リーフ証明書の固定 | 高 | 高 | 高セキュリティ、証明書が制御可能なシナリオ |
| 複数階層の固定 | 高 | 中 | ベスト、多層の冗長性 |

## InsecureSkipVerify

`InsecureSkipVerify` はすべての TLS 証明書チェーン検証をスキップし、テストのみに使用します：

```go
// テストのみ！
cfg := httpc.TestingConfig()
// InsecureSkipVerify = true → TLS 証明書検証をスキップ
```

HTTPC は `httpc.New()` で `InsecureSkipVerify = true` を検出し、非テスト環境の場合、`stderr` に警告を出力します（各プロセス 1 回）。テスト環境の判定：実行可能ファイルのサフィックスが `.test`、または `GO_TEST` / `GOTEST=1` 環境変数が設定されていること。

:::danger
`InsecureSkipVerify = true` はすべての TLS セキュリティ対策を無効化し（証明書ピンニングも無効）、テスト環境でのみ使用してください。本番環境では絶対に `true` に設定しないでください。カスタム検証ロジック（完全な証明書の固定など）が必要な場合は、`InsecureSkipVerify` を使用するのではなく `CertificatePinner` インターフェースを実装してください。
:::

## HTTP/2

HTTP/2 はデフォルトで有効で、TLS 使用時（ALPN 経由の h2）のみ利用可能です：

```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableHTTP2 = false // HTTP/2 を無効化（HTTP/1.1 のみ）
```

:::tip
証明書ピンニングやカスタム `TLSConfig` を有効化しても、HTTP/2 の ALPN ネゴシエーションは正常に動作します。HTTP/2 を無効化する必要がある場合（デバッグや古いプロキシとの互換性など）、`EnableHTTP2 = false` を設定してください。
:::

## ベストプラクティス

1. デフォルトの TLS 設定（TLS 1.2+）を使用、手動設定不要
2. 証明書ピンニング時は**中間証明書**の SPKI を固定し、バックアップ固定値を準備
3. 複数ハッシュで鍵ローテーションをサポートし、「先に新規追加、後に旧削除」戦略を採用
4. 固定値を定期的に更新し、サーバー側の証明書更新と同期
5. `SecureConfig()` をセキュリティベースラインとして使用
6. 本番環境で絶対に `InsecureSkipVerify` を設定しない
7. 高セキュリティシナリオでは複数階層の証明書（リーフ + 中間）を固定し、冗長性を増やす

## 次のステップ

- [SSRF 防護](./ssrf) - SSRF セキュリティ設定
- [セキュリティ概要](./) - セキュリティ機能一覧
- [設定 API](../api-reference/client-config/config) - SecurityConfig リファレンス
