---
sidebar_label: "エラー処理"
title: "エラー処理 - CyberGo HTTPC | 分類とセンチネル"
description: "HTTPC エラー処理ガイド：ErrorType 12 種エラー分類、ClientError フィールドと IsRetryable 判定、errors.Is/As センチネルエラーマッチング、リトライ枯渇処理、context タイムアウトとキャンセル、ミドルウェア統一エラー処理とタイムアウト階層化のベストプラクティス。"
sidebar_position: 5
---

# エラー処理

HTTPC はすべてのエラーを `ClientError` として統一的にカプセル化し、タイプ分類、リトライ可否の判定、豊富なコンテキスト情報を提供します。Go 標準ライブラリの `errors.Is`/`errors.As` と組み合わせることで、センチネルエラーを正確にマッチングしたり、分類ごとに柔軟に処理したりできます。

## ErrorType 完全リファレンス

HTTPC はネットワーク層からアプリケーション層までのすべての失敗シナリオをカバーする 12 種類のエラータイプを定義しています：

| ErrorType | Code() | 意味 | 典型シナリオ | リトライ可 |
|-----------|--------|------|----------|--------|
| `ErrorTypeNetwork` | `NETWORK_ERROR` | ネットワーク層エラー | 接続拒否、接続リセット、パイプ破損 | 原因による |
| `ErrorTypeTimeout` | `TIMEOUT` | タイムアウト | ダイヤルタイムアウト、リクエストタイムアウト、context デッドライン | はい |
| `ErrorTypeContextCanceled` | `CONTEXT_CANCELED` | コンテキストキャンセル | `ctx.Cancel()` が呼び出された | いいえ |
| `ErrorTypeDNS` | `DNS_ERROR` | DNS 解決失敗 | ドメインが存在しない、DNS サーバー障害 | 一時的/タイムアウト時は可 |
| `ErrorTypeTLS` | `TLS_ERROR` | TLS ハンドシェイクエラー | プロトコルバージョン非対応、アルゴリズムネゴシエーション失敗 | いいえ |
| `ErrorTypeCertificate` | `CERTIFICATE_ERROR` | 証明書検証失敗 | 証明書期限切れ、署名無効、CA 非信頼 | いいえ |
| `ErrorTypeTransport` | `TRANSPORT_ERROR` | HTTP トランスポート層エラー | プロトコルエラー、トランスポート異常中断 | はい |
| `ErrorTypeResponseRead` | `RESPONSE_READ_ERROR` | レスポンスボディ読み取りエラー | 接続中断による EOF、読み取りタイムアウト | 原因による |
| `ErrorTypeRetryExhausted` | `RETRY_EXHAUSTED` | リトライ枯渇 | `MaxRetries` 上限に達しても失敗 | いいえ |
| `ErrorTypeValidation` | `VALIDATION_ERROR` | リクエスト検証失敗 | URL 形式が不正、HTTP ヘッダーに制御文字を含む | いいえ |
| `ErrorTypeHTTP` | `HTTP_ERROR` | HTTP ステータスコードエラー | 4xx/5xx レスポンス | ステータスコードによる |
| `ErrorTypeUnknown` | `UNKNOWN_ERROR` | 未分類エラー | その他のマッチしない例外 | いいえ |

:::tip リトライ可否判定の完全なルール
`IsRetryable()` の判定ロジックは表より細粒度です：`ErrorTypeDNS` は `net.DNSError` が一時的またはタイムアウトとマークされている場合のみリトライ可能；`ErrorTypeNetwork` は `syscall.Errno`（`ECONNREFUSED`/`ECONNRESET`/`EPIPE`/`ETIMEDOUT`/`ENETUNREACH`/`EHOSTUNREACH`）とエラーメッセージパターンの検査で判定；`ErrorTypeResponseRead` は読み取り操作（`read`/`readfrom`）のネットワークエラー時のみリトライ。詳細は下記「リトライ可否判定」を参照。
:::

## ClientError フィールド詳細

`ClientError` 構造体はリクエスト失敗の完全なコンテキストを保持します：

| フィールド | タイプ | 用途 |
|------|------|------|
| `Type` | `ErrorType` | エラー分類、`switch` 分岐処理に使用 |
| `Message` | `string` | 人間が読めるエラー記述 |
| `Cause` | `error` | 基底の元エラー、`errors.Unwrap` チェーンをサポート |
| `URL` | `string` | リクエストの URL（マスク済み、下記参照） |
| `Method` | `string` | HTTP メソッド（GET/POST/...） |
| `Attempts` | `int` | 試行回数（初回含む）、リトライ枯渇時は > 1 |
| `StatusCode` | `int` | HTTP ステータスコード（`ErrorTypeHTTP` のみ値あり） |
| `Host` | `string` | ターゲットホスト名（サーキットブレーカーなどに使用） |

### エラータイプ判定

```go
package main

import (
    "errors"
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://api.example.com/data")
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) {
            switch clientErr.Type {
            case httpc.ErrorTypeTimeout:
                log.Printf("リクエストタイムアウト（%d 回試行済み）: %v", clientErr.Attempts, err)
            case httpc.ErrorTypeNetwork:
                log.Printf("ネットワークエラー: %v", err)
            case httpc.ErrorTypeDNS:
                log.Printf("DNS 解決失敗: %v", err)
            case httpc.ErrorTypeTLS:
                log.Printf("TLS ハンドシェイク失敗: %v", err)
            case httpc.ErrorTypeCertificate:
                log.Printf("証明書検証失敗: %v", err)
            case httpc.ErrorTypeRetryExhausted:
                log.Printf("%d 回リトライ後も失敗: %v", clientErr.Attempts, err)
            case httpc.ErrorTypeValidation:
                log.Printf("リクエスト検証失敗: %v", err)
            case httpc.ErrorTypeContextCanceled:
                log.Printf("リクエストがキャンセルされました: %v", err)
            default:
                log.Printf("その他のエラー [%s]: %v", clientErr.Code(), err)
            }
        }
        return
    }
    fmt.Printf("成功: %d\n", result.StatusCode())
}
```

### リトライ可否判定

`IsRetryable()` はエラータイプと基底原因を総合的に考慮し、リトライすべきかどうかを返します：

```go
package main

import (
    "errors"
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    _, err = client.Get("https://api.example.com/data")
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) {
            if clientErr.IsRetryable() {
                fmt.Println("リトライ可能なエラー、上位ロジックで後ほどリトライ可能")
            } else {
                fmt.Printf("リトライ不可のエラー [%s]、人手での介入が必要\n", clientErr.Code())
            }
        }
    }
}
```

:::warning IsRetryable と自動リトライの違い
`IsRetryable()` は「このエラーがリトライに値するか」を判定し、HTTPC 内部のリトライエンジンでも使用されます。`Retry.MaxRetries` で自動リトライを設定済みの場合、エラー処理コードに到達した時点でネットワーク/タイムアウト系エラーであれば、リトライはすでに枯渇しています。`IsRetryable()` は主に上位層（サーキットブレーカー、タスクキューなど）での意思決定に使用されます。
:::

## センチネルエラー完全リファレンス

HTTPC は以下のセンチネルエラー変数を定義しており、`errors.Is` で正確にマッチングできます：

| センチネル変数 | トリガー条件 | 推奨処理 |
|----------|----------|----------|
| `ErrClientClosed` | `client.Close()` 後に当該クライアントを使用 | 新規 Client を初期化、またはライフサイクル管理を修正 |
| `ErrNilConfig` | `New()` に渡した Config ポインタが nil | `DefaultConfig()` でデフォルト値を取得 |
| `ErrInvalidHeader` | HTTP ヘッダー検証失敗（制御文字を含む、または形式が不正） | Header 値を修正してからリトライ |
| `ErrInvalidTimeout` | タイムアウト値が負の数または 30 分の上限を超過 | 正当な範囲 `[0, 30min]` に調整 |
| `ErrInvalidRetry` | リトライ設定が不正（MaxRetries が 0-10 の範囲外、BackoffFactor が 1.0-10.0 の範囲外） | リトライパラメータを修正 |
| `ErrInvalidConnection` | 接続設定が不正（コネクションプールサイズが範囲外、プロキシ URL 形式エラー） | 接続パラメータを修正 |
| `ErrInvalidSecurity` | セキュリティ設定が不正（レスポンスボディサイズ制限が範囲外） | セキュリティパラメータを修正 |
| `ErrInvalidMiddleware` | ミドルウェア設定が不正（リダイレクト回数が 50 超過、UserAgent が長すぎるか制御文字を含む） | ミドルウェアパラメータを修正 |
| `ErrEmptyFilePath` | ダウンロード時にファイルパスが未指定 | `DownloadConfig.FilePath` を設定 |
| `ErrFileExists` | ターゲットファイルが既存で `Overwrite=false`、`ResumeDownload=false` | 上書きまたはレジュームを設定、またはパスを変更 |
| `ErrResponseBodyEmpty` | レスポンスボディが空の状態で `Unmarshal()` などの解析メソッドを呼び出し | `RawBody` を先にチェックしてから解析 |
| `ErrResponseBodyTooLarge` | レスポンスボディが `MaxResponseBodySize` 制限を超過 | 制限を増やすか、インターフェースを変更してページネーションで取得 |

:::tip 設定系エラー vs 実行時エラー
`ErrInvalid*` シリーズ（`ErrInvalidHeader`/`ErrInvalidTimeout`/`ErrInvalidRetry`/`ErrInvalidConnection`/`ErrInvalidSecurity`/`ErrInvalidMiddleware`）は設定検証エラーで、`New()` 呼び出し時に返却され、リクエストのホットパスには現れません。実行時エラーは `ClientError` で分類処理されます。
:::

```go
package main

import (
    "errors"
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://api.example.com/data")

    switch {
    case errors.Is(err, httpc.ErrClientClosed):
        fmt.Println("クライアントがクローズ済み、再作成が必要")
    case errors.Is(err, httpc.ErrResponseBodyTooLarge):
        fmt.Println("レスポンスボディが大きすぎます、MaxResponseBodySize の増大を検討")
    case errors.Is(err, httpc.ErrResponseBodyEmpty):
        fmt.Println("レスポンスボディが空、解析メソッド呼び出し前に RawBody をチェック")
    case errors.Is(err, httpc.ErrInvalidHeader):
        fmt.Println("リクエストヘッダーが無効、修正後にリトライ")
    }

    if result != nil {
        fmt.Printf("ステータスコード: %d\n", result.StatusCode())
    }
}
```

## URL の自動マスク

`ClientError.Error()` は URL 内の機密情報を自動的に削除します。ユーザー名とパスワードを含む URL（例：`https://user:pass@host/path`）は `https://***:***@host/path` にマスクされ、ログやエラーメッセージに認証情報が漏洩しません：

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // URL に認証情報を含む
    result, err := client.Get("https://admin:s3cret@api.example.com/data")
    if err != nil {
        // エラーメッセージ内の認証情報は自動的にマスク：
        // "GET https://***:***@api.example.com/data: network error occurred"
        fmt.Println(err)
    }
    if result != nil {
        fmt.Println(result.StatusCode())
    }
}
```

:::tip マスクの適用範囲
マスクは `user:pass@host` 形式の認証情報を削除するだけでなく、機密クエリパラメータ（`token`、`key`、`secret` など）も処理します。認証情報や機密パラメータを含まない URL は高速パスを通過して解析をスキップし、不要な `url.Parse` のオーバーヘッドを回避します。
:::

## panic リカバリのセーフティネット

HTTPC は `Request()` と `Download()` メソッドに panic セーフティネットを内蔵しています。エンジン、トランスポート層、TLS ライブラリ、ミドルウェアからの予期しない panic はすべて捕捉され、呼び出し元プロセスをクラッシュさせる代わりに `ClientError` に変換されます：

<!-- check-code: skip -->
```go
// client.go 内部実装（概念説明）
func (c *clientImpl) Request(ctx context.Context, method, url string, ...) (*Result, error) {
    defer func() {
        if r := recover(); r != nil {
            result = nil
            err = panicToError(r) // ClientError に変換
        }
    }()
    // ... 通常のリクエストロジック
}
```

:::warning セーフティネットはミドルウェアリカバリの代わりにならない
内蔵セーフティネットは最後の防衛線で、panic をクラッシュではなくエラーに変換します。しかしミドルウェア内で panic が発生する可能性がある場合、`RecoveryMiddleware()` の追加使用を推奨します——これはミドルウェアチェーン内でより早く panic を捕捉し、より完全なログコンテキストを提供できます：

<!-- check-code: skip -->
```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.RecoveryMiddleware(),       // ミドルウェア層の panic リカバリ
    httpc.LoggingMiddleware(nil),     // ログ
    httpc.MetricsMiddleware(nil),     // メトリクス
}
```
:::

## 自動リトライとエラーの関係

HTTPC のリトライエンジンはリトライ可能なエラーを内部で自動処理します。どのエラーが自動リトライされるかを理解することで、アプリケーション層での重複リトライを避けられます：

### 自動リトライされるエラー

| 条件 | リトライ | 説明 |
|------|----------|------|
| ネットワークエラー（接続拒否、リセット、EOF） | はい | `isRetryableNetworkMessage` がマッチ |
| ダイヤル/リクエストタイムアウト | はい | `ErrorTypeTimeout` |
| 一時的/タイムアウト系 DNS 失敗 | はい | `dnsErr.IsTemporary \|\| dnsErr.IsTimeout` |
| レスポンスボディ読み取りのネットワークエラー | はい | 読み取り操作の `net.OpError` |
| リトライ可能な HTTP ステータスコード | はい | 408/429/500/502/503/504 |
| `ProxyRotateOnStatus` 指定のステータスコード | はい | 例：403 でプロキシローテーション |

### リトライされないエラー

| 条件 | リトライ | 説明 |
|------|----------|------|
| `context.Canceled` | いいえ | 高速パスで即時リターン |
| `context.DeadlineExceeded` | いいえ | 高速パスで即時リターン |
| TLS ハンドシェイク失敗 | いいえ | `ErrorTypeTLS` はリトライ不可 |
| 証明書検証失敗 | いいえ | `ErrorTypeCertificate` はリトライ不可 |
| 設定検証エラー | いいえ | `ErrorTypeValidation` はリトライ不可 |
| その他の 4xx クライアントエラー | いいえ | 例：400/401/403/404 |

:::tip context キャンセルは高速パス
`isRetryableError` は判定前に `context.Canceled` と `context.DeadlineExceeded` を先にチェックします——マッチすれば即座に false を返し、完全なエラー分類をスキップします。これにより context が既にキャンセルされた状態での無駄なリトライ判定を回避します。
:::

```go
package main

import (
    "context"
    "errors"
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()

    result, err := client.Request(ctx, "GET", "https://api.example.com/slow")
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) {
            if clientErr.Type == httpc.ErrorTypeContextCanceled {
                // context タイムアウトまたは手動キャンセル、自動リトライされない
                fmt.Println("リクエストがキャンセルされました（タイムアウトまたは手動キャンセル）、リトライなし")
            } else if clientErr.Type == httpc.ErrorTypeTimeout {
                fmt.Println("リクエストタイムアウト、自動リトライ済みも失敗")
            }
        }
        return
    }
    fmt.Println(result.StatusCode())
}
```

## エラー処理のベストプラクティス

### 1. クライアントエラーとサーバーエラーの区別

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://api.example.com/data")
    if err != nil {
        // ネットワーク層エラー——接続、TLS、DNS などの問題
        log.Printf("ネットワーク層エラー: %v", err)
        return
    }

    // HTTP 層エラー——レスポンスは受信したがステータスコードが 2xx でない
    if result.IsClientError() {
        // 4xx：クライアントのリクエストに誤り（パラメータエラー、権限不足など）
        log.Printf("クライアントエラー: %d", result.StatusCode())
    } else if result.IsServerError() {
        // 5xx：サーバー障害（リトライ枯渇、上流が利用不可）
        log.Printf("サーバーエラー: %d", result.StatusCode())
    } else {
        fmt.Printf("成功: %d\n", result.StatusCode())
    }
}
```

### 2. サーキットブレーカーパターン

あるサービスが継続的に失敗する場合、サーキットブレーカーが一時的にリクエストを停止し、カスケード障害とリソースの浪費を回避します：

<!-- check-code: skip -->
```go
type CircuitBreaker struct {
    mu           sync.Mutex
    failures     int
    threshold    int           // 連続失敗の閾値
    cooldown     time.Duration // 熔断冷却時間
    trippedAt    time.Time
}

func (cb *CircuitBreaker) Allow() bool {
    cb.mu.Lock()
    defer cb.mu.Unlock()
    if cb.failures >= cb.threshold {
        if time.Since(cb.trippedAt) < cb.cooldown {
            return false // 熔断中、リクエスト拒否
        }
        cb.failures = 0 // 冷却期間経過、リセット
    }
    return true
}

func (cb *CircuitBreaker) Record(err error) {
    cb.mu.Lock()
    defer cb.mu.Unlock()
    if err != nil {
        cb.failures++
        if cb.failures >= cb.threshold {
            cb.trippedAt = time.Now()
        }
    } else {
        cb.failures = 0 // 成功時はリセット
    }
}

// 使用時に IsRetryable で判定を組み合わせる
func requestWithBreaker(client httpc.Client, cb *CircuitBreaker, url string) error {
    if !cb.Allow() {
        return fmt.Errorf("circuit breaker open")
    }
    result, err := client.Get(url)
    cb.Record(err)
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) && !clientErr.IsRetryable() {
            cb.Record(nil) // リトライ不可エラーはサーバー障害とみなさない
        }
        return err
    }
    _ = result
    return nil
}
```

### 3. フォールバック

主サービスが利用不可時にキャッシュやデフォルト値にフォールバックします：

<!-- check-code: skip -->
```go
package main

import (
    "errors"
    "log"

    "github.com/cybergodev/httpc"
)

func fetchWithFallback(client httpc.Client, url string, fallback []byte) []byte {
    result, err := client.Get(url)
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) {
            switch clientErr.Type {
            case httpc.ErrorTypeTimeout, httpc.ErrorTypeRetryExhausted:
                log.Printf("主サービスが利用不可、フォールバックデータを使用: %v", err)
                return fallback
            case httpc.ErrorTypeValidation:
                // 検証エラーはローカルバグ、フォールバックすべきでない
                log.Fatalf("リクエスト設定エラー: %v", err)
            }
        }
        log.Printf("不明なエラー、フォールバックデータを使用: %v", err)
        return fallback
    }
    return result.RawBody()
}
```

### 4. ミドルウェアによる統一処理

```go
package main

import (
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
        httpc.RecoveryMiddleware(),
        httpc.LoggingMiddleware(&httpc.LoggingConfig{
            LogFunc: func(format string, args ...any) {
                log.Printf("[HTTP] "+format, args...)
            },
        }),
        httpc.MetricsMiddleware(&httpc.MetricsConfig{
            OnMetrics: func(method, url string, statusCode int, duration time.Duration, err error) {
                if err != nil {
                    log.Printf("[METRICS] %s %s 失敗: %v (所要 %v)", method, url, err, duration)
                } else {
                    log.Printf("[METRICS] %s %s -> %d (所要 %v)", method, url, statusCode, duration)
                }
            },
        }),
    }

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://api.example.com/data")
    if err != nil {
        log.Fatal(err)
    }
    log.Printf("ステータスコード: %d", result.StatusCode())
}
```

### 5. タイムアウトの階層化

HTTPC は粗いものから細かいものまで複数レベルのタイムアウト制御を提供します：

<!-- check-code: skip -->
```go
// 第 1 層：クライアントデフォルトタイムアウト（全リクエストのグローバル上限）
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 30 * time.Second

// 第 2 層：ミドルウェア強制タイムアウト（デフォルトを上書き）
timeoutMW := httpc.TimeoutMiddleware(&httpc.TimeoutMiddlewareConfig{
    Duration: 30 * time.Second,
})

// 第 3 層：単一リクエスト上書き（WithTimeout はミドルウェアとデフォルトを上書き）
result, err := client.Get(url, httpc.WithTimeout(10*time.Second))

// 第 4 層：context タイムアウト（最も精密、クリティカルパスに推奨）
ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
defer cancel()
result, err := client.Request(ctx, "GET", url)
```

:::warning ResponseHeader タイムアウトと WithTimeout の相互作用
`Timeouts.ResponseHeader = 0`（デフォルト）の場合、トランスポート層はレスポンスヘッダータイムアウトを強制せず、`WithTimeout` が完全な制御権を持ちます。しかし正の値（`SecureConfig()` の 10s など）に設定すると、トランスポート層ですべてのリクエストに強制適用され、`WithTimeout` で延長できません——これは slowloris 攻撃防御のための設計です。AI API などの長いレスポンスシナリオでは `ResponseHeader = 0` を維持してください。
:::

## 次のステップ

- [リトライとフォールトトレランス](./retry-fault-tolerance) — バックオフアルゴリズムの詳細とカスタムリトライ戦略
- [エラータイプ API](../api-reference/types/errors) — エラータイプとセンチネル変数の完全リファレンス
- [ミドルウェアチェーン](./middleware-chain) — ミドルウェアによる統一エラー処理
- [設定 API](../api-reference/client-config/config) — タイムアウトとセキュリティ設定のリファレンス
