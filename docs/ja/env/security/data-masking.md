---
sidebar_label: "データマスキング"
title: "データマスキング - CyberGo env | ログセーフティツール"
description: "CyberGo env 機密データマスキングツールの完全ガイド。IsSensitiveKey でパスワードやキーなどの機密キーを自動検出、MaskValue で機密性に基づき値をマスク、MaskKey でキー名をマスク、SanitizeForLog でログ文字列をクリーンアップ、ClearBytes で安全にゼロクリア。HTTP ミドルウェアと構造化ログの実戦例を付属。"
sidebar_position: 2
---

# 機密データマスキング

env は**Loader に依存しない実用ユーティリティ関数群**を提供し、ログ、エラーメッセージ、デバッグ出力での機密データ漏洩を防止します。これらの関数は Loader を作成せずに直接呼び出し可能で、設定を安全に記録する必要のあるあらゆるシーンに適しています。

## なぜマスキングが必要か

[SecureValue](/ja/env/api-reference/secure-value) でメモリ内の機密値を適切に保護していても、それらは 3 つの経路で漏洩する可能性があります：

- **アプリケーションログ** —— 設定、リクエストパラメータ、接続文字列を直接出力
- **エラーメッセージ** —— panic / error がキーをログ収集システムに持ち込む
- **デバッグ出力** —— `fmt.Println` でデバッグ時に手軽に環境変数を出力

```text
log.Printf("設定を読み込み DB_PASSWORD=%s", pwd)          ← ログ漏洩
panic("connect failed: password=hunter2")           ← エラー漏洩
fmt.Println(env.GetString("API_KEY"))               ← デバッグ漏洩
```

これらの出力がログ集約システム（ELK、Datadog……）に入ったり、チームメンバー、運用、さらには攻撃者に見られると、キーは盗難に等しい状態になります。env のマスキングツールは記録時に**自動的に機密内容を隠蔽**し、発生源で漏洩を食い止めます。

## 関数の詳細

### IsSensitiveKey

```go
func IsSensitiveKey(key string) bool
```

`key` が機密パターンを含むかを大文字小文字を区別せずにチェックします。検出は**部分文字列マッチ**を採用——キー名（大文字に変換後）にいずれかの組み込みパターンが含まれれば機密と判定します。

**組み込み検出パターン：**

| カテゴリ | パターン |
|------|------|
| 認証系 | `PASSWORD`、`SECRET`、`TOKEN`、`AUTH`、`CREDENTIAL`、`PASSPHRASE`、`SESSION`、`COOKIE` |
| キー系 | `API_KEY`、`APIKEY`、`ACCESS_KEY`、`SECRET_KEY`、`PRIVATE_KEY`、`PUBLIC_KEY` |
| 暗号系 | `PRIVATE`、`ENCRYPTION_KEY`、`ENCRYPT_KEY`、`DECRYPT_KEY`、`SIGNING_KEY`、`SIGN_KEY`、`VERIFY_KEY` |
| 金融 / PII | `SSN`、`SOCIAL_SECURITY`、`CREDIT_CARD`、`CARD_NUMBER`、`CVV`、`CVC`、`CCV`、`PAN` |
| 暗号通貨 | `MNEMONIC`、`SEED`、`RECOVERY`、`WALLET`、`PRIVATE_ADDRESS` |
| インフラ | `CONNECTION_STRING`、`CONN_STRING`、`DATABASE_URL`、`DB_PASSWORD` |
| クラウドサービス | `AWS_SECRET`、`AZURE_KEY`、`GCP_KEY`、`SERVICE_ACCOUNT` |

::: tip 部分文字列マッチの意味
`IsSensitiveKey("MY_API_KEY_TOKEN")` は `API_KEY` と `TOKEN` にマッチし、true を返します。これは `AUTHORIZATION` も `AUTH` を含むため機密と判定されることを意味します——これが期待される保守的な動作です。
:::

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

func main() {
    // 認証とキー系
    fmt.Println(env.IsSensitiveKey("DB_PASSWORD"))  // true
    fmt.Println(env.IsSensitiveKey("API_KEY"))      // true
    fmt.Println(env.IsSensitiveKey("ACCESS_TOKEN")) // true

    // 大文字小文字を区別しない
    fmt.Println(env.IsSensitiveKey("api_key")) // true
    fmt.Println(env.IsSensitiveKey("ApiKey"))  // true

    // 非機密キー
    fmt.Println(env.IsSensitiveKey("PORT"))    // false
    fmt.Println(env.IsSensitiveKey("DB_HOST")) // false
}
```

### MaskValue

```go
func MaskValue(key, value string) string
```

`key` の機密性に基づいて `value` をマスクします。設定のキーと値のペアを記録するのに適しています：

| 条件 | 戻り値 |
|------|--------|
| `IsSensitiveKey(key)` が true | `[MASKED:N chars]`（N = `len(value)`） |
| 非機密かつ `len(value) ≤ 20` | 元の値 |
| 非機密かつ `len(value) > 20` | `value[:17] + "..."` |

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

func main() {
    // 機密値 → マスク（長さ情報を保持し調査しやすく）
    fmt.Println(env.MaskValue("DB_PASSWORD", "p@ssw0rd123"))
    // 出力：[MASKED:11 chars]

    // 非機密の短い値 → そのまま返す
    fmt.Println(env.MaskValue("PORT", "8080"))
    // 出力：8080

    // 非機密の長い値（>20 文字）→ 切り詰め
    fmt.Println(env.MaskValue("DESCRIPTION", "this-is-a-very-long-description-value"))
    // 出力：this-is-a-very-lo...
}
```

::: tip 長さを保持する意図
`[MASKED:N chars]` は値の内容ではなく長さを公開します。これは「パスワードが切り詰められていないか」「キーが完全か」を調査する際に有用で、同時に平文を漏洩しません。
:::

### MaskKey

```go
func MaskKey(key string) string
```

キー名自体をマスクし、キーの存在を示す必要があるがキーの意味を露出したくないシーンで使用します（内部的に `DefaultMaskKey` を呼び出し）：

| 条件 | 戻り値 |
|------|--------|
| `len(key) ≤ 3` | `***` |
| `len(key) > 3` | `key[:2] + "***"` |

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

func main() {
    fmt.Println(env.MaskKey("DB_PASSWORD")) // DB***
    fmt.Println(env.MaskKey("API_KEY"))     // AP***
    fmt.Println(env.MaskKey("TOKEN"))       // TO***
    fmt.Println(env.MaskKey("AB"))          // ***
    fmt.Println(env.MaskKey("XYZ"))         // ***（長さ ≤ 3）
}
```

::: warning MaskValue との組み合わせ
`MaskKey` はキー名の最初の 2 文字のみを取得するため、`DB_HOST` と `DB_PASSWORD` は両方とも `DB***` になります。ログで両者を区別する必要がある場合は `MaskValue` と併用して出力するか、キー名が問題にならない場合にのみ単独で使用してください。
:::

### MaskSensitiveInString

```go
func MaskSensitiveInString(s string) string
```

長い文字列を切り詰め、ログに過剰な内容を出力しないようにします（間接的に情報を漏洩したりログを膨張させる可能性があります）：

| 条件 | 戻り値 |
|------|--------|
| `len(s) > 50` | `s[:47] + "..."` |
| それ以外 | 元の値 |

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

func main() {
    long := "012345678901234567890123456789012345678901234567890123456789"
    fmt.Println(env.MaskSensitiveInString(long))
    // 出力：012345678901234567890123456789012345678901234567...

    short := "hello world"
    fmt.Println(env.MaskSensitiveInString(short))
    // 出力：hello world
}
```

### SanitizeForLog

```go
func SanitizeForLog(s string) string
```

文字列内の `key=value` パターンをスキャンし、機密キーに対応する `key=value` を**全体** `[MASKED]` に置き換え、同時に制御文字を削除します（`\n` と `\t` は保持）。接続文字列、エラーメッセージなどのインラインキーと値の処理に適しています。

**検出する代入パターン：** `password=`、`secret=`、`token=`、`auth=`、`credential=`、`passphrase=`、`session=`、`cookie=`、`api_key=`、`apikey=`、`access_key=`、`secret_key=`、`private_key=`、`public_key=`、`encrypt_key=`、`decrypt_key=`、`signing_key=`、`ssn=`、`credit_card=`、`card_number=`、`cvv=`、`cvc=`、`mnemonic=`、`seed=`、`recovery=`、`wallet=`、`connection_string=`、`database_url=`、`db_password=`

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

func main() {
    fmt.Println(env.SanitizeForLog("user=admin password=s3cret"))
    // 出力：user=admin [MASKED]

    fmt.Println(env.SanitizeForLog("token=abc123 host=localhost"))
    // 出力：[MASKED] host=localhost

    // 複数の機密値をすべてマスク
    fmt.Println(env.SanitizeForLog("user=pguser password=hunter2 api_key=sk_123"))
    // 出力：user=pguser [MASKED] [MASKED]
}
```

::: tip 置換の粒度
`SanitizeForLog` は `password=s3cret` を全体で単一の `[MASKED]` に置き換えます（キー名も一緒に）。`password=[MASKED]` とは保持しません。これにより、ログに「ここにパスワードがある」という情報すら露出しません。
:::

### ClearBytes

```go
func ClearBytes(b []byte)
```

バイトスライスをすべてゼロにします。`Reveal()` で取得し `[]byte` 形式で処理した機密データを手動でクリーンアップし、平文がメモリに残るのを回避するために使用します。

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

func main() {
    // []byte 形式で処理した機密データをシミュレート
    secret := []byte("secret123")
    fmt.Printf("ゼロクリア前: %s\n", secret)
    // 出力：ゼロクリア前：secret123

    env.ClearBytes(secret)
    fmt.Printf("ゼロクリア後: %q\n", secret)
    // 出力：ゼロクリア後："\x00\x00\x00\x00\x00\x00\x00\x00\x00"
}
```

::: warning ClearBytes の限界
`ClearBytes` は渡されたスライスのみをゼロクリアします。同じ機密データが複数回コピーされた場合（string と []byte 間の変換は新しいコピーを生成するなど）、これらのコピーは一緒にゼロクリアできません。機密データは可能な限りコピーを減らし、[SecureValue](/ja/env/api-reference/secure-value) の `Release()` / `Close()` と併用してください。
:::

## 実戦例

以下はアプリ起動時に安全に設定を出力し、インラインクレデンシャルを含むエラーメッセージを処理するデモです——`MaskValue`、`SanitizeForLog`、`IsSensitiveKey`、`MaskKey` の協調使用をカバーします：

```go
package main

import (
    "errors"
    "fmt"

    "github.com/cybergodev/env"
)

func main() {
    // 環境変数から読み込んだ設定をシミュレート
    config := []struct{ key, value string }{
        {"PORT", "8080"},
        {"DB_HOST", "localhost"},
        {"DB_PASSWORD", "super-secret-pwd"},
        {"API_KEY", "sk_live_1234567890abcdef"},
    }

    fmt.Println("=== 起動設定（マスク済み）===")
    for _, c := range config {
        fmt.Printf("%-15s = %s\n", c.key, env.MaskValue(c.key, c.value))
    }

    fmt.Println("\n=== エラーログ（自動マスク）===")
    err := errors.New("failed to connect: user=admin password=hunter2 host=db.local")
    fmt.Println(env.SanitizeForLog(err.Error()))

    fmt.Println("\n=== 機密キーリスト（キー名マスク）===")
    for _, c := range config {
        if env.IsSensitiveKey(c.key) {
            fmt.Printf("機密設定: %s\n", env.MaskKey(c.key))
        }
    }
}
```

出力：

```text
=== 起動設定（マスク済み）===
PORT            = 8080
DB_HOST         = localhost
DB_PASSWORD     = [MASKED:16 chars]
API_KEY         = [MASKED:24 chars]

=== エラーログ（自動マスク）===
failed to connect: user=admin [MASKED] host=db.local

=== 機密キーリスト（キー名マスク）===
機密設定: DB***
機密設定: AP***
```

## SecureValue との関係

env のセキュリティ体系は相互補完する 2 つの防御線で構成されます：

| 防御線 | 保護対象 | ツール |
|------|----------|------|
| **メモリ保護** | 実行時にメモリに駐留する値 | `GetSecure` / `Reveal` / `Masked` / `Release` |
| **出力マスキング** | ログ、エラー、デバッグ出力に書き込まれる値 | `IsSensitiveKey` / `MaskValue` / `SanitizeForLog` など |

```go
// 1. メモリ保護：SecureValue で読み取り
secret := env.GetSecure("API_KEY")
defer secret.Release()
key := secret.Reveal()

// 2. 出力マスキング：記録時に隠蔽
log.Printf("使用 %s で接続", secret.Masked())
// または任意の出所の値を手動でマスク（SecureValue に限定しない）
log.Printf("設定 %s", env.MaskValue("API_KEY", key))
```

::: tip 分担の明確化
- SecureValue の `Masked()` 出力は `[SECURE:32 bytes locked]` の形で、それが管理する値に特化。
- マスキングユーティリティ関数（`MaskValue` など）は**任意の出所**の値に使用可能——SecureValue に限定されず、Loader にも依存しません。
:::

## 関連ドキュメント

- [セキュリティ概要](/ja/env/security/) - セキュリティアーキテクチャの総覧
- [SecureValue API](/ja/env/api-reference/secure-value) - メモリ内の値の保護（`Masked` / `Reveal` を含む）
- [メモリロック](/ja/env/security/memory-locking) - 機密データのディスクスワップ防止
- [本番チェックリスト](/ja/env/security/production-checklist) - 本番稼働前のセキュリティチェック
