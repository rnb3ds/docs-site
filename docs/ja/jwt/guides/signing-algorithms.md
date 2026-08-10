---
sidebar_label: "署名アルゴリズム"
title: "署名アルゴリズム - CyberGo JWT | アルゴリズム比較と選定"
description: "署名アルゴリズムガイド：HMAC・RSA・RSA-PSS・ECDSA 4 種 12 アルゴリズムの鍵種・生成方式・署名検証性能・署名長・構成結合度を比較し、選定の決定と鍵管理の安全実務を示す。"
sidebar_position: 10
---

# 署名アルゴリズム

CyberGo JWT は 4 種類計 12 の署名アルゴリズムをサポートし、モノリスからマイクロサービスアーキテクチャまであらゆるシーンに対応します。

## アルゴリズム一覧

| 型 | アルゴリズム | 鍵の型 | 適用シーン |
|----|-----------|--------|-----------|
| HMAC | HS256 / HS384 / HS512 | 対称鍵 | モノリスアプリ、シンプルなサービス |
| RSA | RS256 / RS384 / RS512 | 公開鍵/秘密鍵 | マイクロサービス、マルチサービス検証 |
| RSA-PSS | PS256 / PS384 / PS512 | 公開鍵/秘密鍵 | マイクロサービス（RSA の代替として推奨） |
| ECDSA | ES256 / ES384 / ES512 | 公開鍵/秘密鍵 | 高パフォーマンスマイクロサービス |

## HMAC（対称鍵）

HMAC は同じ鍵で署名と検証を行う、最もシンプルな方式です。

### 鍵の要件

HMAC 鍵は `validateSigningKey` の 2 項目のチェックを通過する必要があります：

- **長さチェック**：`len(SecretKey) < 32` の場合 `ErrInvalidSecretKey` を返します。エラーメッセージには実際のバイト長が含まれ、例えば `"minimum 32 bytes required, got 16"` となります
- **エントロピーチェック**：`internal.IsWeakKey` で低エントロピー鍵を検出し、以下のパターンは拒否されます：
  - 全て同じ文字（例：`"aaaaaaaa..."`）
  - 短いパターンの反復（例：`"abcabcabc..."`）
  - 連続増分/減分シーケンス（例：`"abcdefgh..."`）
  - 一般的な弱いパスワードとそのバリエーション（例：`"password"`、`"qwerty"`）

:::warning 弱鍵は拒否されます
「繰り返し文字」「連続シーケンス」「辞書の単語」などの推測しやすい鍵を使用しないでください。長さが 32 バイトに達していても、低エントロピー鍵は `jwt.New` の初期化段階で拒否され `ErrInvalidSecretKey` を返します。
:::

本番環境では暗号論的に安全な乱数ソースで鍵を生成してください：

```go
package main

import (
    "crypto/rand"
    "encoding/base64"
    "fmt"
    "log"

    "github.com/cybergodev/jwt"
)

func main() {
    // crypto/rand で 32 バイトのランダム鍵を生成
    raw := make([]byte, 32)
    if _, err := rand.Read(raw); err != nil {
        log.Fatal(err)
    }
    // base64 エンコードで保管・受け渡し
    secret := base64.StdEncoding.EncodeToString(raw)

    cfg := jwt.DefaultConfig()
    cfg.SecretKey = secret
    processor, err := jwt.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer processor.Close()

    fmt.Println("HMAC 鍵の準備完了、長さ（バイト）：", len(secret)) // 出力: HMAC 鍵の準備完了、長さ（バイト）： 44
}
```

### 使用方法

```go
cfg := jwt.DefaultConfig()
cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
cfg.SigningMethod = jwt.SigningMethodHS256 // デフォルト値、省略可
```

### アルゴリズムの選択

| 定数 | アルゴリズム | 説明 |
|------|------------|------|
| `SigningMethodHS256` | HMAC-SHA256 | 推奨、パフォーマンスとセキュリティのバランス |
| `SigningMethodHS384` | HMAC-SHA384 | より高いセキュリティ |
| `SigningMethodHS512` | HMAC-SHA512 | 最高セキュリティ |

:::tip 推奨
ほとんどのシーンでは `HS256` で十分です。秘密鍵は暗号論的に安全な乱数で生成し、長さは最低 32 バイトにすることを推奨します。
:::

## RSA（非対称鍵）

RSA は秘密鍵で署名、公開鍵で検証します。検証側が秘密鍵を保持する必要がないシーンに適しています。

### 使用方法

```go
cfg := jwt.DefaultConfig()
cfg.SigningMethod = jwt.SigningMethodRS256
cfg.SigningKey = rsaPrivateKey        // *rsa.PrivateKey
cfg.VerificationKey = rsaPublicKey    // *rsa.PublicKey（省略可）
```

:::tip 検証鍵
`VerificationKey` は省略可能です。未設定の場合、ライブラリは `SigningKey` を使用して検証を行います（内部で秘密鍵から公開鍵を抽出します）。
:::

### 鍵の生成

```go
// 2048 ビット RSA 鍵ペアの生成（ライブラリは最低 2048 ビットを強制、そうでない場合は ErrInvalidSecretKey を返す）
privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
if err != nil {
    log.Fatal(err)
}
publicKey := &privateKey.PublicKey
```

### アルゴリズムの選択

| 定数 | アルゴリズム | 説明 |
|------|------------|------|
| `SigningMethodRS256` | RSA-SHA256 | 推奨 |
| `SigningMethodRS384` | RSA-SHA384 | より高いセキュリティ |
| `SigningMethodRS512` | RSA-SHA512 | 最高セキュリティ |

:::tip RSA-PSS との鍵共有
RS256/RS384/RS512 と PS256/PS384/PS512 は同じ鍵型（`*rsa.PrivateKey` / `*rsa.PublicKey`）と同じ検証ロジックを使用するため、鍵を流用できます。RSA から RSA-PSS への移行で鍵を再生成する必要はありません。
:::

## RSA-PSS（非対称鍵、RSA の代替として推奨）

RSA-PSS は RSA の改良された署名方式で、確率的署名方式（PSS）パディングを使用し、PKCS#1 v1.5 より安全性が高いです。鍵は RSA と同じです。

### 使用方法

```go
cfg := jwt.DefaultConfig()
cfg.SigningMethod = jwt.SigningMethodPS256
cfg.SigningKey = rsaPrivateKey        // *rsa.PrivateKey（RSA と鍵を共有）
cfg.VerificationKey = rsaPublicKey    // *rsa.PublicKey（省略可）
```

:::tip 推奨される代替
RSA-PSS は RSA PKCS#1 v1.5 より安全です。新規プロジェクトでは RSA-PSS アルゴリズムを優先して使用することを推奨します。鍵は RSA と完全に同じため、追加の生成は不要です。
:::

### アルゴリズムの選択

| 定数 | アルゴリズム | 説明 |
|------|------------|------|
| `SigningMethodPS256` | RSA-PSS-SHA256 | 推奨 |
| `SigningMethodPS384` | RSA-PSS-SHA384 | より高いセキュリティ |
| `SigningMethodPS512` | RSA-PSS-SHA512 | 最高セキュリティ |

## ECDSA（楕円曲線）

ECDSA も非対称アルゴリズムですが、鍵が短く、パフォーマンスに優れています。

### 使用方法

```go
cfg := jwt.DefaultConfig()
cfg.SigningMethod = jwt.SigningMethodES256
cfg.SigningKey = ecdsaPrivateKey      // *ecdsa.PrivateKey
cfg.VerificationKey = ecdsaPublicKey  // *ecdsa.PublicKey（省略可）
```

### 鍵の生成

```go
// P-256 曲線鍵ペアの生成
privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
if err != nil {
    log.Fatal(err)
}
publicKey := &privateKey.PublicKey
```

### アルゴリズムの選択

| 定数 | アルゴリズム | 曲線 | 説明 |
|------|------------|------|------|
| `SigningMethodES256` | ECDSA-SHA256 | P-256 | 推奨 |
| `SigningMethodES384` | ECDSA-SHA384 | P-384 | より高いセキュリティ |
| `SigningMethodES512` | ECDSA-SHA512 | P-521 | 最高セキュリティ |

### 曲線のマッチング

アルゴリズムと曲線は厳密に対応している必要があり、初期化時に強制チェックされます（ソースは `validateECDSACurve`）：

| アルゴリズム | 使用すべき曲線 | 生成方法 |
|------------|---------------|---------|
| ES256 | P-256 | `elliptic.P256()` |
| ES384 | P-384 | `elliptic.P384()` |
| ES512 | P-521 | `elliptic.P521()` |

:::warning ES512 は P-512 ではなく P-521 を使用
`ES512` に対応する曲線は **P-521** です（512 ではなく 521 であることに注意）。これはよくある間違いです——数字の 512 から曲線も P-512 だと誤解しやすいですが、Go 標準ライブラリには `P512` は存在せず、最上位の曲線は `elliptic.P521()` です。曲線が不一致の場合は `ErrInvalidSecretKey` を返します。
:::

## 鍵分離モード

マイクロサービスアーキテクチャでは、通常**署名能力**（トークン発行）と**検証能力**（トークン検証）を分離し、最小権限の原則に従う必要があります：

| サービス役割 | 保持する鍵 | 責務 |
|------------|----------|------|
| **認証サービス** | 秘密鍵（`SigningKey`） | ログイン成功後にアクセストークンを発行 |
| **API サービス** | 公開鍵（`VerificationKey`） | トークン署名を検証、発行には不参加 |

認証サービスは秘密鍵を保持して発行を担当し、API サービスは公開鍵でトークンを検証します。API サービスの設定に `SigningKey` が書き込まれていても（現在の API はこのフィールドが非空であることを要求）、`VerificationKey` が設定されていれば検証時にはその公開鍵が使用されます。

:::tip VerificationKey が優先
`VerificationKey` を設定すると、検証フローは `SigningKey` から抽出した公開鍵ではなく、この公開鍵を使用します。これにより API サービスは検証鍵を明示的に制御でき、検証鍵と署名鍵を分離して配布するシーンに適しています。
:::

認証サービス（トークン発行）：

```go
authCfg := jwt.DefaultConfig()
authCfg.SigningMethod = jwt.SigningMethodRS256
authCfg.SigningKey = rsaPrivateKey           // *rsa.PrivateKey、署名用
authCfg.VerificationKey = &rsaPrivateKey.PublicKey
```

API サービス（検証のみ）：

```go
apiCfg := jwt.DefaultConfig()
apiCfg.SigningMethod = jwt.SigningMethodRS256
apiCfg.SigningKey = rsaPrivateKey            // 現在の API は SigningKey が非空であることを要求
apiCfg.VerificationKey = rsaPublicKey        // *rsa.PublicKey、検証時に実際に使用
```

:::warning 注意
検証のみの `Processor` は `Create` / `CreateRefresh` を呼び出すべきではありません（署名には秘密鍵が必要）。完全なクロスサービス例は[高度なサンプル](../examples/advanced#鍵分離モード)を参照してください。
:::

## 選び方

```text
モノリスアプリ ────────→ HMAC
マイクロサービス（同一信頼ドメイン） → HMAC
マイクロサービス（クロスサービス検証）→ RSA、RSA-PSS または ECDSA
セキュリティ優先 ──────→ RSA-PSS（RSA の代替）
高性能要件 ───────────→ ECDSA
鍵長に敏感 ───────────→ ECDSA
```

| 考慮要素 | HMAC | RSA | RSA-PSS | ECDSA |
|---------|------|-----|---------|-------|
| 署名速度 | 速い | やや遅い | やや遅い | 速い |
| 検証速度 | 速い | 速い | 速い | 速い |
| 鍵長 | 32+ バイト | 2048+ ビット | 2048+ ビット | 256+ ビット |
| 署名長 | 固定 | 長い（~256 バイト） | 長い（~256 バイト） | 短い（~64 バイト） |
| アーキテクチャ結合 | 密結合 | 疎結合 | 疎結合 | 疎結合 |
| セキュリティ | 高い | 高い | より高い | 高い |

## 鍵管理のベストプラクティス

### 環境変数の注入

環境変数で鍵を渡し、ソースコードへのハードコードを避けます：

```go
package main

import (
    "fmt"
    "os"

    "github.com/cybergodev/jwt"
)

func main() {
    secret := os.Getenv("JWT_SECRET_KEY")
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = secret
    processor, err := jwt.New(cfg)
    if err != nil {
        fmt.Println("鍵が無効：", err)
        return
    }
    defer processor.Close()
    fmt.Println("Processor の準備完了") // 出力: Processor の準備完了
}
```

### PEM ファイルから RSA 鍵をロード

本番環境では通常、非対称鍵を PEM ファイルで保管し、起動時に `crypto/x509` でパースしてロードします：

```go
package main

import (
    "crypto/x509"
    "encoding/pem"
    "fmt"
    "os"

    "github.com/cybergodev/jwt"
)

func main() {
    // 秘密鍵 PEM ファイルの読み込み
    keyData, err := os.ReadFile("private_key.pem")
    if err != nil {
        fmt.Println("秘密鍵の読み込み失敗：", err)
        return
    }

    block, _ := pem.Decode(keyData)
    if block == nil {
        fmt.Println("PEM デコード失敗")
        return
    }

    privateKey, err := x509.ParsePKCS8PrivateKey(block.Bytes)
    if err != nil {
        fmt.Println("秘密鍵のパース失敗：", err)
        return
    }

    cfg := jwt.DefaultConfig()
    cfg.SigningMethod = jwt.SigningMethodRS256
    cfg.SigningKey = privateKey
    processor, err := jwt.New(cfg)
    if err != nil {
        fmt.Println("初期化失敗：", err)
        return
    }
    defer processor.Close()
    fmt.Println("RSA 鍵を PEM からロード完了") // 出力: RSA 鍵を PEM からロード完了
}
```

:::tip 公開鍵を PEM からロード
公開鍵 PEM ファイルは `x509.ParsePKIXPublicKey` でパースします。戻り値は `any` で、`*rsa.PublicKey` または `*ecdsa.PublicKey` に型アサーションする必要があります。完全な例は[高度なサンプル](../examples/advanced#pem-ファイルから鍵をロード)を参照してください。
:::

### 鍵のローテーション

:::tip ローテーションの推奨事項
- 署名鍵を定期的にローテーション（3〜6 ヶ月毎を推奨）
- 新旧鍵の並行期間中、検証側は両方の公開鍵を同時に受け入れる
- `kid`（Key ID）ヘッダーで現在の鍵バージョンを識別し、段階的切り替えを容易にする
- ローテーション完了後に旧鍵を失効し、ブラックリストの同期更新が必要か確認する
:::

## セキュリティ上の注意

:::danger 禁止事項
- コードに秘密鍵をハードコードしない
- 弱鍵（純粋な数字、繰り返し文字など）を使用しない
- `none` アルゴリズムを使用しない（本ライブラリは自動的に拒否します）
- HMAC 秘密鍵を 32 バイト未満にしない
:::

:::tip ベストプラクティス
- 環境変数または鍵管理サービスで秘密鍵を保管
- 署名鍵を定期的にローテーション
- 本番環境では RSA または ECDSA の使用を推奨
- RSA 鍵は 2048 ビット以上を推奨
:::

## 次のステップ

- [カスタム Claims](./custom-claims) — ビジネスフィールドの定義
- [API リファレンス → パッケージ関数](../api-reference/functions) — 完全な API シグネチャ
- [基本サンプル](../examples/basic) — HMAC の完全な例
