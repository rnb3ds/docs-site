---
sidebar_label: "SecureValue"
title: "SecureValue API - CyberGo env | セキュア値ストレージ"
description: "CyberGo env の SecureValue セキュア値 API リファレンス。NewSecureValue 作成、mlock メモリロック、Reveal 平文読み取り、Masked マスク、Release ゼロクリア破棄、IsSensitiveKey 検出を含み、パスワード、トークン、キーを安全に保存。"
sidebar_position: 5
---

# SecureValue API

`SecureValue` 型は機密データを安全に保存するために使用され、メモリロック、自動ゼロクリア、マスク機能を提供します。

## スレッドセーフ

`SecureValue` のすべてのメソッドはスレッドセーフで、複数の goroutine で並行使用可能です：

- **読み取りメソッド**（`String()`、`Bytes()`、`Length()`、`Masked()`）は読み取りロックを使用し、並行読み取りをサポート
- **クローズメソッド**（`Close()`、`Release()`）は書き込みロックを使用し、安全なゼロクリアを保証
- **状態チェック**（`IsClosed()`、`IsMemoryLocked()`）はアトミック操作を使用

```go
secret := env.GetSecure("API_KEY")
if secret != nil {
    defer secret.Release()

    // 並行読み取りは安全
    go func() { fmt.Println(secret.Masked()) }()
    go func() { fmt.Println(secret.Length()) }()
}
```

::: warning 注意
`Close()` と `Release()` は 1 回のみ呼び出すべきです。重複呼び出しは安全ですが無効です。
:::

## 作成

### NewSecureValue

```go
func NewSecureValue(value string) *SecureValue
```

セキュア値ラッパーを作成します。

**パラメータ：**
- `value` - 保護する文字列値

**戻り値：**
- `*SecureValue` - セキュア値オブジェクト

**動作：**
- オブジェクトプールを使用してアロケーションを削減
- GC ファイナライザーを設定して自動ゼロクリア
- メモリロックが有効な場合、メモリのロックを試行（失敗時はサイレントに無視）

```go
secret := env.NewSecureValue("my-secret-password")
defer secret.Release()  // または Close()
```

---

### NewSecureValueStrict

```go
func NewSecureValueStrict(value string) (*SecureValue, error)
```

セキュア値を作成し、メモリロック失敗時にエラーを返します。

**パラメータ：**
- `value` - 保護する文字列値

**戻り値：**
- `*SecureValue` - セキュア値オブジェクト
- `error` - メモリロックエラー（厳格モードのみ）

```go
env.SetMemoryLockEnabled(true)
env.SetMemoryLockStrict(true)

secret, err := env.NewSecureValueStrict("my-secret")
if err != nil {
    // メモリロック失敗
    log.Printf("Warning: %v", err)
}
if secret != nil {
    defer secret.Release()
}
```

---

### GetSecure (Loader メソッド)

```go
func (l *Loader) GetSecure(key string) *SecureValue
```

ローダーからセキュア値を取得します。

**パラメータ：**
- `key` - キー名

**戻り値：**
- `*SecureValue` - セキュア値の**防御的コピー**、呼び出し側が解放を担当；キーが存在しないまたはローダーがクローズされた場合は nil

```go
secret := loader.GetSecure("API_KEY")
if secret != nil {
    defer secret.Release()
    // secret を使用
}
```

::: tip 防御的コピー
`GetSecure` は元の値のコピーを返し、親 Loader から独立しています。呼び出し側が `Release()` または `Close()` の呼び出しを担当します。
:::

---

## メソッド

### String

```go
func (sv *SecureValue) String() string
```

マスク表現を返します。ログやフォーマットに安全に使用できます。`fmt.Stringer` インターフェースを実装し、`fmt.Printf`、`log.Println`、エラーラッピング経由でのキーの意図しない漏洩を防止します。

**戻り値：**
- `string` - マスク表現（例：`[SECURE:32 bytes]`）、nil の場合は `[NIL]`

```go
secret := env.GetSecure("PASSWORD")
if secret != nil {
    log.Printf("Password: %s", secret)  // 安全、マスク表現を出力
    // log.Printf("Password: %s", secret.Masked()) と同等
}
```

::: warning 注意
`String()` が返すのは**マスク表現**で、平文値ではありません。平文値を取得するには `Reveal()` を使用してください。
:::

---

### Reveal

```go
func (sv *SecureValue) Reveal() string
```

平文値を返します。呼び出し側は返された文字列の安全な取り扱いに責任を持ちます —— ログ記録、シリアライズ、永続化位置への保存を避けてください。暗号化操作、API 呼び出しなどの実際の値を必要とする安全な処理にのみ使用してください。

**戻り値：**
- `string` - 平文値、クローズ済みまたは nil の場合は空文字列

```go
secret := env.GetSecure("API_KEY")
if secret != nil {
    defer secret.Release()
    plaintext := secret.Reveal()  // 平文値を取得
    // plaintext を API 呼び出しなどの安全な操作に使用
    _ = plaintext
}
```

::: danger 危険
`Reveal()` は**平文字列**を返します。Go の文字列は不変で、手動ゼロクリアができません。必要な時のみ使用し、戻り値をログに記録したり保存したりしないでください。
:::

---

### Bytes

```go
func (sv *SecureValue) Bytes() []byte
```

値のバイトスライスコピーを返します。呼び出し側は `ClearBytes` でゼロクリアする責任を持ちます。

**戻り値：**
- `[]byte` - 値のバイトコピー、クローズ済みの場合は nil

```go
secret := env.GetSecure("API_KEY")
if secret != nil {
    data := secret.Bytes()
    defer env.ClearBytes(data)  // 使用後にゼロクリア
    // data を使用
}
```

---

### Length

```go
func (sv *SecureValue) Length() int
```

値の長さを返します。内容を露出しません。

**戻り値：**
- `int` - 値の長さ、クローズ済みの場合は 0

```go
secret := env.GetSecure("API_KEY")
if secret != nil {
    fmt.Printf("API Key length: %d\n", secret.Length())
}
```

---

### Masked

```go
func (sv *SecureValue) Masked() string
```

マスクされた値を返します。ログ出力に使用します。

**戻り値：**
- `string` - マスク表現

**出力フォーマット：**
- クローズ済み：`[CLOSED]`
- 空値：`[SECURE:0 bytes]`
- 正常：`[SECURE:N bytes]` または `[SECURE:N bytes locked]` または `[SECURE:N bytes lock-failed]` または `[SECURE:N bytes unlocked]`

```go
secret := env.GetSecure("API_KEY")
if secret != nil {
    log.Printf("API Key: %s", secret.Masked())
    // 出力：API Key: [SECURE:32 bytes]
    // 注：メモリロックが有効（SetMemoryLockEnabled(true)）でロック成功時のみ、
    // マスクに " locked" サフィックスが追加されます（他に " lock-failed" / " unlocked"）
}
```

---

### MarshalJSON

```go
func (sv *SecureValue) MarshalJSON() ([]byte, error)
```

`json.Marshaler` インターフェースを実装します。マスク表現を返し、`json.Marshal` などのリフレクションベースのシリアライザー経由でのキーの意図しない漏洩を防止します。平文は JSON 出力に決して現れません。

**戻り値：**
- `[]byte` - JSON セーフなマスク文字列（例：`"[SECURE:32 bytes]"`）、nil の場合は `"null"`
- `error` - 常に nil を返す

```go
type Response struct {
    APIKey *env.SecureValue `json:"api_key"`
}

resp := Response{APIKey: env.NewSecureValue("sk-1234567890")}
data, _ := json.Marshal(resp)
// {"api_key":"[SECURE:16 bytes]"}
// 平文は出力に現れない
```

::: tip セキュリティ設計
`MarshalJSON` は `SecureValue` が構造体に埋め込まれ JSON シリアライズされても平文を漏洩しないことを保証します。出力は `String()` / `Masked()` と一致します。
:::

---

### MarshalText

```go
func (sv *SecureValue) MarshalText() ([]byte, error)
```

`encoding.TextMarshaler` インターフェースを実装します。`String()` と一致するマスク表現を返し、`encoding/xml`、`text/template`、構造化ログなどのテキストベースのエンコーダー経由でのキーの意図しない漏洩を防止します。

**戻り値：**
- `[]byte` - マスク文字列（例：`"[SECURE:32 bytes]"`）、nil の場合は `"[NIL]"`
- `error` - 常に nil を返す

```go
type Config struct {
    Token *env.SecureValue `xml:"token"`
}

cfg := Config{Token: env.NewSecureValue("Bearer xyz")}
data, _ := xml.Marshal(cfg)
// <Config><token>[SECURE:10 bytes]</token></Config>
```

---

### Close

```go
func (sv *SecureValue) Close() error
```

メモリを安全にゼロクリアしオブジェクトをクローズします。

**戻り値：**
- `error` - 常に nil を返す

**動作：**
- 内部データを安全にゼロクリア
- クローズ済みとマーク
- オブジェクトプールに**返却しない**

```go
secret := env.GetSecure("TOKEN")
if secret != nil {
    defer secret.Close()
    // Close 後メモリはゼロクリアされる
}
```

---

### Release

```go
func (sv *SecureValue) Release()
```

メモリをゼロクリアしオブジェクトプールに返却します。

**動作：**
- 内部データを安全にゼロクリア
- GC ファイナライザーをクリア
- オブジェクトプールに返却し再利用可能に

```go
secret := env.GetSecure("KEY")
if secret != nil {
    defer secret.Release()
    // Release 後メモリはゼロクリアされ、オブジェクトはプールに返却
}
```

::: tip Close vs Release
- `Close()` - ゼロクリアのみ、プールに返却しない
- `Release()` - ゼロクリア + プール返却（高頻度シーンに推奨）
:::

---

### IsClosed

```go
func (sv *SecureValue) IsClosed() bool
```

オブジェクトがクローズ済みかチェックします。

**戻り値：**
- `bool` - クローズ済みか

```go
if secret.IsClosed() {
    // オブジェクトはクローズ済み、使用不可
}
```

---

### IsMemoryLocked

```go
func (sv *SecureValue) IsMemoryLocked() bool
```

メモリがロックされているか（ディスクへのスワップを防止）チェックします。

**戻り値：**
- `bool` - ロック済みか

```go
if secret.IsMemoryLocked() {
    fmt.Println("Memory is locked, protected from swapping")
}
```

---

### MemoryLockError

```go
func (sv *SecureValue) MemoryLockError() error
```

メモリロック試行のエラー（ある場合）を返します。

**戻り値：**
- `error` - ロックエラー、成功または未試行の場合は nil

```go
if err := secret.MemoryLockError(); err != nil {
    log.Printf("Memory lock failed: %v", err)
}
```

---

## メモリロック設定

### SetMemoryLockEnabled

```go
func SetMemoryLockEnabled(enabled bool)
```

メモリロックをグローバルに有効化/無効化します。新しく作成されるすべての SecureValue に影響します。

**パラメータ：**
- `enabled` - 有効化するか

```go
package main

import "github.com/cybergodev/env"

func main() {
    // アプリ起動時に有効化
    env.SetMemoryLockEnabled(true)

    // 以降のすべての SecureValue がロックを試行
}
```

---

### IsMemoryLockEnabled

```go
func IsMemoryLockEnabled() bool
```

メモリロックが有効かチェックします。

**戻り値：**
- `bool` - 有効か

```go
if env.IsMemoryLockEnabled() {
    // メモリロックが有効
}
```

---

### SetMemoryLockStrict

```go
func SetMemoryLockStrict(strict bool)
```

厳格モードを設定します。有効化すると、`NewSecureValueStrict` はロック失敗時にエラーを返します。

**パラメータ：**
- `strict` - 厳格モードを有効化するか

```go
env.SetMemoryLockEnabled(true)
env.SetMemoryLockStrict(true)

secret, err := env.NewSecureValueStrict("sensitive-data")
if err != nil {
    // ロック失敗
}
```

---

### IsMemoryLockStrict

```go
func IsMemoryLockStrict() bool
```

厳格モードかチェックします。

**戻り値：**
- `bool` - 有効か

```go
strict := env.IsMemoryLockStrict()
```

---

### IsMemoryLockSupported

```go
func IsMemoryLockSupported() bool
```

現在のプラットフォームがメモリロックをサポートするかチェックします。

**戻り値：**
- `bool` - サポートするか

| プラットフォーム | サポート |
|------|------|
| Linux | ✅ |
| macOS | ✅ |
| Windows | ✅ |
| FreeBSD | ✅ |
| wasm | ❌ |

::: warning 注意
`true` はプラットフォームがサポートすることを示すだけで、プロセスに十分な権限があることを示すわけではありません。Linux は `CAP_IPC_LOCK` または root 権限が必要です。
:::

```go
if env.IsMemoryLockSupported() {
    env.SetMemoryLockEnabled(true)
}
```

---

## セキュリティユーティリティ関数

### ClearBytes

```go
func ClearBytes(b []byte)
```

バイトスライスを安全にゼロクリアします。使用後ただちに機密データをゼロクリアします。

**パラメータ：**
- `b` - ゼロクリアするバイトスライス

```go
sensitive := []byte("secret-data")
// 使用...
env.ClearBytes(sensitive)
// sensitive はすべて 0 になる
```

---

### IsSensitiveKey

```go
func IsSensitiveKey(key string) bool
```

キー名が機密パターンにマッチするかチェックします。

**パラメータ：**
- `key` - キー名

**戻り値：**
- `bool` - 機密か

```go
if env.IsSensitiveKey("DB_PASSWORD") {
    // 機密キー、安全な方法で処理
    secret := env.GetSecure("DB_PASSWORD")
    if secret != nil {
        defer secret.Release()
    }
}
```

**機密パターン：** password, secret, token, key, api_key, credential など

---

### MaskValue

```go
func MaskValue(key, value string) string
```

キーの機密性に基づいてマスク値を返します。

**パラメータ：**
- `key` - キー名
- `value` - 元の値

**戻り値：**
- `string` - マスク後の値

```go
// 機密キー - [MASKED:N chars] 形式を返す
masked := env.MaskValue("API_KEY", "secret123")
// 戻り値：[MASKED:9 chars]

// 非機密キー - 元の値を返す（20 文字超の場合は切り詰め）
masked := env.MaskValue("APP_NAME", "myapp")
// 戻り値：myapp
```

---

### MaskKey

```go
func MaskKey(key string) string
```

ログ用にキー名をマスクします。

**パラメータ：**
- `key` - キー名

**戻り値：**
- `string` - マスク後のキー名

```go
masked := env.MaskKey("DB_PASSWORD")
// 戻り値：DB***
```

---

### SanitizeForLog

```go
func SanitizeForLog(s string) string
```

文字列内の機密キーと値のペア情報をクリーンアップします。`key=value` 形式の機密値を自動検出してマスクします。

**パラメータ：**
- `s` - 元の文字列

**戻り値：**
- `string` - クリーンアップ後の文字列

```go
// 機密キーと値のペアを自動マスク
msg := "Connected with password=secret123 api_key=abc123"
clean := env.SanitizeForLog(msg)
// 戻り値："Connected with password=[MASKED] api_key=[MASKED]"
```

---

### MaskSensitiveInString

```go
func MaskSensitiveInString(s string) string
```

文字列内の潜在的に機密な内容をマスクします。50 文字を超える文字列を切り詰めます。

**パラメータ：**
- `s` - 元の文字列

**戻り値：**
- `string` - マスク後の文字列

```go
// 長い文字列は切り詰められる（最初の 47 文字を保持し "..." を追加）
long := "This is a very long string that exceeds 50 characters"
clean := env.MaskSensitiveInString(long)
// 戻り値："This is a very long string that exceeds 50 char..."
```

::: tip 使用シーン
機密データを含む可能性のある長い文字列の切り詰めに使用します。機密キーと値のペアを自動マスクするには `SanitizeForLog` を使用してください。
:::

---

## 完全な例

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/env"
)

func main() {
    // メモリロックをチェックして有効化
    if env.IsMemoryLockSupported() {
        env.SetMemoryLockEnabled(true)
        fmt.Println("Memory locking enabled")
    }

    // 環境変数を読み込み
    if err := env.Load(".env"); err != nil {
        log.Printf("Warning: %v", err)
    }

    // 機密値を安全に取得
    apiKey := env.GetSecure("API_KEY")
    if apiKey == nil {
        log.Fatal("API_KEY not found")
    }
    defer apiKey.Release()

    // 安全に使用
    fmt.Printf("API Key length: %d\n", apiKey.Length())
    fmt.Printf("API Key (masked): %s\n", apiKey.Masked())

    // メモリロック状態をチェック
    if apiKey.IsMemoryLocked() {
        fmt.Println("Memory is locked")
    }

    // ロックエラーをチェック
    if err := apiKey.MemoryLockError(); err != nil {
        fmt.Printf("Memory lock warning: %v\n", err)
    }

    // 他の関数に渡す
    connectAPI(apiKey.Reveal())

    // セキュリティユーティリティ関数を使用
    logMessage := "Processing with API_KEY=secret"
    safeMessage := env.SanitizeForLog(logMessage)
    fmt.Println(safeMessage)  // Processing with API_KEY=[MASKED]
}

func connectAPI(key string) {
    // キーを使用して接続...
    fmt.Printf("Connecting with key of length %d\n", len(key))
}
```

---

## 内部実装

### オブジェクトプール

`SecureValue` は `sync.Pool` を使用してメモリアロケーションを削減します：

```go
var secureValuePool = sync.Pool{
    New: func() interface{} {
        return &SecureValue{}
    },
}
```

### GC ファイナライザー

作成時に GC ファイナライザーを設定し、ガベージコレクション時に自動ゼロクリアを保証：

```go
runtime.SetFinalizer(sv, (*SecureValue).finalize)
```

### 安全なゼロクリア

`unsafe.Pointer` を使用してコンパイラ最適化を防止（`sv.mu` ロック保持中に呼び出す必要あり）：

```go
func (sv *SecureValue) clearDataLocked() {
    if len(sv.data) == 0 {
        return
    }
    // メモリのアンロック（ロック済みの場合）
    if sv.locked {
        internal.UnlockMemory(sv.data)
        sv.locked = false
    }
    dataPtr := unsafe.Pointer(&sv.data[0])
    for i := range sv.data {
        *(*byte)(unsafe.Pointer(uintptr(dataPtr) + uintptr(i))) = 0
    }
    runtime.KeepAlive(sv.data)
    sv.data = nil
    sv.lockErr = nil
}
```

---

## 関連ドキュメント

- [定数とエラー](/ja/env/api-reference/constants) - 禁止キー、機密キーパターン、エラー型
- [セキュリティ概要](/ja/env/security/) - セキュリティアーキテクチャとコア機能
- [本番チェックリスト](/ja/env/security/production-checklist) - 本番稼働前のセキュリティチェック
- [Loader API](/ja/env/api-reference/loader) - GetSecure メソッド
