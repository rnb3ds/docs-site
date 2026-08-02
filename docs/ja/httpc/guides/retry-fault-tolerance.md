---
sidebar_label: "リトライとフォールトトレランス"
title: "リトライとフォールトトレランス - CyberGo HTTPC | バックオフと再試行"
description: "HTTPC リトライとフォールトトレランスガイド：デフォルト指数バックオフリトライ戦略と RetryConfig 設定、408/429/5xx 自動リトライ条件、RetryPolicy カスタムインターフェース、Retry-After レスポンスヘッダー自動解析、バックオフ戦略選択とリクエストごとの WithMaxRetries 制御のベストプラクティス。"
sidebar_position: 6
---

# リトライとフォールトトレランス

ネットワークリクエストは本質的に信頼性が低いものです——接続が中断される可能性、サーバーが一時的に過負荷になる可能性、DNS 解決がタイムアウトする可能性があります。HTTPC はスマートなリトライエンジンを内蔵し、一時的な障害を自動処理するため、ビジネスロジックに集中できます。

## デフォルトリトライ

HTTPC のデフォルトリトライ設定は慎重にチューニングされており、すぐに使えます：

```go
package main

import (
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Retry.MaxRetries = 3                  // 最大 3 回リトライ
    cfg.Retry.Delay = 1 * time.Second         // 初期遅延 1s
    cfg.Retry.BackoffFactor = 2.0             // 指数バックオフ倍数 2x
    cfg.Retry.EnableJitter = true             // ジッター有効化
    cfg.Retry.MaxRetryDelay = 30 * time.Second // 単一遅延上限

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://api.example.com/data")
    if err != nil {
        log.Fatal(err)
    }
    log.Printf("成功: %d", result.StatusCode())
}
```

デフォルトのリトライ遅延シーケンス（ジッター除く）：`1s → 2s → 4s`（毎回 `BackoffFactor` を乗算）。

### リトライ条件

デフォルトでは、以下のエラーがリトライをトリガーします：

| 条件 | リトライ | 説明 |
|------|------|------|
| ネットワークエラー（接続拒否、リセット、EOF） | はい | `ErrorTypeNetwork` + リトライ可能な syscall/メッセージパターン |
| タイムアウトエラー（ダイヤル、TLS、リクエストタイムアウト） | はい | `ErrorTypeTimeout` |
| リトライ可能な DNS 失敗（一時的/タイムアウト） | はい | `dnsErr.IsTemporary \|\| dnsErr.IsTimeout` |
| レスポンスボディ読み取りのネットワークエラー | はい | 読み取り操作の `net.OpError` |
| 408 Request Timeout | はい | `retryableStatusCodes` |
| 429 Too Many Requests | はい | `Retry-After` ヘッダーと組み合わせ |
| 500 Internal Server Error | はい | `retryableStatusCodes` |
| 502 Bad Gateway | はい | `retryableStatusCodes` |
| 503 Service Unavailable | はい | `retryableStatusCodes` |
| 504 Gateway Timeout | はい | `retryableStatusCodes` |
| その他の 4xx クライアントエラー（400/401/403/404…） | いいえ | クライアントのリクエストに誤り、リトライは無意味 |
| `context.Canceled` | いいえ | 高速パスで即時リターン |
| `context.DeadlineExceeded` | いいえ | 高速パスで即時リターン |
| TLS/証明書エラー | いいえ | 一時的でない障害、リトライは無意味 |
| 設定検証エラー | いいえ | ローカルバグ、コードの修正が必要 |

## バックオフの数学的詳細

デフォルト値（`Delay=1s`、`BackoffFactor=2.0`、`MaxRetryDelay=30s`、`EnableJitter=true`）を例に、各リトライの遅延計算を示します：

### 基本遅延計算

```
attempt 0: 1s × 2.0^0 = 1s
attempt 1: 1s × 2.0^1 = 2s
attempt 2: 1s × 2.0^2 = 4s
attempt 3: 1s × 2.0^3 = 8s   （MaxRetries=3 の場合はここに到達しない）
attempt 4: 1s × 2.0^4 = 16s
attempt 5: 1s × 2.0^5 = 32s → 上限トリガー、30s に切り詰め
```

### MaxRetryDelay 上限の適用

遅延が 30s を超えると切り詰められます：`attempt 5` の 32s → 30s。

### ジッター（±10%）の適用

ジッター公式：`result = baseDelay ± 10%`、すなわち `result ∈ [baseDelay × 0.9, baseDelay × 1.1)`。

| リトライ回数 | 基本遅延 | ジッター適用範囲 |
|----------|----------|------------|
| 第 1 回リトライ（attempt 0） | 1s | 0.9s ~ 1.1s |
| 第 2 回リトライ（attempt 1） | 2s | 1.8s ~ 2.2s |
| 第 3 回リトライ（attempt 2） | 4s | 3.6s ~ 4.4s |
| 第 4 回リトライ（attempt 3） | 8s | 7.2s ~ 8.8s |
| 第 5 回リトライ（attempt 4） | 16s | 14.4s ~ 17.6s |
| 第 6 回リトライ（attempt 5） | 30s（切り詰め後） | 27s ~ 33s |

:::tip なぜ math.Pow ではなく反復乗算なのか
HTTPC は `math.Pow` ではなくループ乗算（`for i := 0; i < attempt; i++ { delay *= factor }`）を使用します。`math.Pow` は超越関数（指数+対数）を呼び出し、数回の浮動小数点乗算よりはるかに高いオーバーヘッドがあります。同時にループ内で `math.IsInf` をチェックしてオーバーフローを防ぎ、オーバーフロー時は `MaxRetryDelay` にフォールバックします。リトライのホットパスでは、この微細な最適化に意味があります。
:::

:::warning ジッターは上限適用の後に適用
ジッターは `MaxRetryDelay` 切り詰め**の後**に適用されます。したがって `attempt 5` の実際の範囲は 27s~33s で、30s の上限を超える可能性があります。これは設計上の選択——ジッターの目的はリトライタイミングを分散させることであり、上限をわずかに超えても無害ですが、大幅に乖離しないことは保証されます。
:::

## Retry-After ヘッダーの自動解析

サーバーが 429（Too Many Requests）または 503（Service Unavailable）を返す場合、通常 `Retry-After` レスポンスヘッダーを添えてクライアントにいつリトライすべきかを通知します。HTTPC はこのヘッダーを自動的に解析し、2 つの形式をサポートします：

### delta-seconds 形式

純粋な整数値で、「N 秒後にリトライ」を意味します：

```
HTTP/1.1 429 Too Many Requests
Retry-After: 120
```

### HTTP-date 形式

RFC 1123 日付で、「指定時刻にリトライ」を意味します：

```
HTTP/1.1 503 Service Unavailable
Retry-After: Fri, 31 Jul 2026 15:00:00 GMT
```

HTTPC は標準 RFC1123（`Fri, 31 Jul 2026 15:00:00 GMT`）と数字タイムゾーン付き RFC1123Z（`Fri, 31 Jul 2026 15:00:00 +0800`）の両方をサポートします。

### 60 秒の安全上限

サーバーがどれだけ長い時間を指定しても、HTTPC は `Retry-After` 遅延を最大 60 秒に切り詰めます：

```
Retry-After: 120     →  60s に切り詰め（120s 待機せず）
Retry-After: 3600    →  60s に切り詰め
Retry-After: Fri, 31 Jul 2026 15:00:00 GMT（今から 2 時間後）→  60s に切り詰め
```

:::warning なぜ切り詰めるのか
悪意のある、または設定ミスのサーバーが極めて大きい `Retry-After` 値（例：`Retry-After: 999999`）を返す可能性があり、クライアントが長時間ハングアップする恐れがあります。60 秒の上限は安全防御です：サーバーが 1 時間の待機を要求しても、HTTPC は最大 60 秒しか待たずにリトライします。サービス側に合理的なレート制限戦略（例：毎分 60 回）があれば、通常の `Retry-After` 値は 60s をはるかに下回り、影響を受けません。
:::

### 優先度

`Retry-After` ヘッダーの優先度は指数バックオフ遅延より**高い**です。サーバーが有効な `Retry-After` 値を返した場合、その値（切り詰め後）を直接使用し、指数バックオフ計算をスキップします。

```go
package main

import (
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Retry.MaxRetries = 3
    // 指数バックオフ遅延：1s → 2s → 4s
    // ただしサーバーが Retry-After: 5 を返した場合、第 1 回リトライ遅延は 5s になる
    // （60s の安全上限を超えない）

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    start := time.Now()
    _, err = client.Get("https://api.example.com/rate-limited")
    elapsed := time.Since(start)

    if err != nil {
        log.Printf("リトライ枯渇、総所要時間 %v: %v", elapsed, err)
    } else {
        log.Printf("成功、総所要時間 %v", elapsed)
    }
}
```

:::tip Retry-After はすべてのリトライ可能ステータスコードに有効
`Retry-After` は 429/503 に限定されず、すべてのリトライ可能ステータスコード（408/429/500/502/503/504）のレスポンスに有効です。レスポンスヘッダーに `Retry-After` が含まれていれば、解析されて使用されます。
:::

## バックオフ戦略

### 指数バックオフ（デフォルト）

最も一般的な戦略で、遅延が倍数で増加し、高速だが過度に激しくありません：

<!-- check-code: skip -->
```go
cfg.Retry.BackoffFactor = 2.0
// 遅延シーケンス：1s → 2s → 4s → 8s → 16s → 30s（上限）
```

### 穏やかな指数バックオフ

`PerformanceConfig()` は 1.5 倍のファクターを使用し、増加がより緩やかで、高スループットシナリオに適しています：

<!-- check-code: skip -->
```go
cfg.Retry.BackoffFactor = 1.5
cfg.Retry.Delay = 500 * time.Millisecond
// 遅延シーケンス：0.5s → 0.75s → 1.125s → 1.6875s → ...
```

### 固定遅延

毎回のリトライ間隔が同じで、明確なリトライ間隔が求められるシナリオに適しています：

<!-- check-code: skip -->
```go
cfg.Retry.BackoffFactor = 1.0
// 遅延シーケンス：1s → 1s → 1s → 1s ...
```

### ランダムジッター

ジッターを有効化して基本遅延に ±10% のランダムオフセットを追加し、「Thundering Herd」——複数のクライアントが同時に失敗後に同時にリトライし、二次的な過負荷を引き起こす——を防止します：

<!-- check-code: skip -->
```go
cfg.Retry.EnableJitter = true
// 5 つのクライアントのリトライタイミングが分散：
// クライアント A: 0.93s 後にリトライ
// クライアント B: 1.07s 後にリトライ
// クライアント C: 1.01s 後にリトライ
// クライアント D: 0.96s 後にリトライ
// クライアント E: 1.08s 後にリトライ
```

:::tip 常にジッターを有効化
テストシナリオ（決定的な遅延が必要）を除き、本番環境では常に `EnableJitter = true` を有効にすべきです。これは分散システムのベストプラクティスで、リトライストームのリスクを大幅に低減します。
:::

## カスタム RetryPolicy

`RetryPolicy` インターフェースを実装することで、リトライ動作を完全に制御できます。インターフェースは 3 つのメソッドを定義します：

<!-- check-code: skip -->
```go
type RetryPolicy interface {
    // リトライすべきかを判定。resp はレスポンス（nil はリクエストエラー）、err はエラー
    ShouldRetry(resp ResponseReader, err error, attempt int) bool

    // 次回リトライ前の遅延を返す
    GetDelay(attempt int) time.Duration

    // 最大リトライ回数を返す
    MaxRetries() int
}
```

:::warning 内部型の制限
`RetryPolicy.ShouldRetry` の `resp` パラメータの型 `ResponseReader` は内部インターフェース（`internal/types` パッケージに定義）であり、外部パッケージからは直接参照できません。そのためカスタム `RetryPolicy` は `github.com/cybergodev/httpc` モジュール内部でのみ実装できます。ほとんどのシナリオでは `RetryConfig` フィールドと `ProxyRotateOnStatus` 設定で要件を満たせ、カスタム戦略は不要です。
:::

以下の例は GET リクエストのみをリトライするカスタム戦略を示します（モジュール内部でのみコンパイル可能）：

<!-- check-code: skip -->
```go
// 注意：ResponseReader は内部型（internal/types パッケージ）です。
// このコードは github.com/cybergodev/httpc モジュール内でのみコンパイル可能です。
// ほとんどのユーザーは RetryConfig と WithMaxRetries でリトライを設定してください。

// GETOnlyRetryPolicy は GET リクエストのみをリトライし、ネットワークエラーと 502/503/504 のみでリトライ
type GETOnlyRetryPolicy struct {
    maxAttempts int
}

func (p *GETOnlyRetryPolicy) ShouldRetry(resp ResponseReader, err error, attempt int) bool {
    if attempt >= p.maxAttempts {
        return false
    }
    // GET リクエストのみリトライ（err/resp で間接判定——非冪等操作はリトライしない）
    if err != nil {
        return true // ネットワークエラーはリトライ
    }
    if resp == nil {
        return false
    }
    code := resp.StatusCode()
    return code == 502 || code == 503 || code == 504
}

func (p *GETOnlyRetryPolicy) GetDelay(attempt int) time.Duration {
    return time.Second * time.Duration(attempt+1) // 線形増加：1s, 2s, 3s...
}

func (p *GETOnlyRetryPolicy) MaxRetries() int {
    return p.maxAttempts
}

// カスタム戦略を適用
// cfg := httpc.DefaultConfig()
// cfg.Retry.CustomPolicy = &GETOnlyRetryPolicy{maxAttempts: 5}
```

## リクエストごとの制御

クライアントレベルの設定に加え、`WithMaxRetries` で個別のリクエストでリトライ回数を上書きできます：

```go
package main

import (
    "context"
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

    // 個別リクエストで 5 回リトライ（クライアントデフォルトの 3 回を上書き）
    _, err = client.Get("https://api.example.com/data", httpc.WithMaxRetries(5))
    if err != nil {
        log.Printf("リクエスト失敗: %v", err)
    }

    // リトライ無効化（非冪等な POST 操作など）
    _, err = client.Post("https://api.example.com/create",
        httpc.WithJSON(map[string]string{"name": "test"}),
        httpc.WithMaxRetries(0),
    )

    // コンテキストタイムアウトと組み合わせ
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()
    _, err = client.Request(ctx, "GET", "https://api.example.com/data",
        httpc.WithMaxRetries(3),
    )
}
```

## プロキシプールとリトライの連携

`ProxyRotateOnStatus` を設定すると、HTTPC は `MaxRetries` を自動的に引き上げ、プロキシプール内の各プロキシが少なくとも 1 回試行されるようにします。これは `calculateMaxRetries` で実装されています：

```
有効な MaxRetries = max(設定された MaxRetries, len(ProxyPool) - 1)
（上限は maxRetryAttempts = 10）
```

**例**：5 つのプロキシ、設定 `MaxRetries = 3`：

```
ProxyPool = [proxy1, proxy2, proxy3, proxy4, proxy5]
ProxyRotateOnStatus = [403]
設定 MaxRetries = 3

→ 自動的に 4 に調整（= 5 - 1）、5 つのプロキシすべてを 1 回ずつ試行
→ 第 1 回リクエストは proxy1、失敗で 403 返却
→ 第 2 回リクエストは proxy2（ローテーション）、失敗で 403 返却
→ 第 3 回リクエストは proxy3、失敗で 403 返却
→ 第 4 回リクエストは proxy4、失敗で 403 返却
→ 第 5 回リクエストは proxy5、失敗で 403 返却
→ リトライ枯渇（合計 5 回試行 = 1 初回 + 4 リトライ）
```

:::tip なぜ len(ProxyPool) - 1 なのか
初回リクエストは第 1 のプロキシを使用し、リトライにはカウントされません。N 個のプロキシすべてを試行するには N - 1 回のリトライが必要です。`calculateMaxRetries` は `MaxRetries` を `len(ProxyPool) - 1` に引き上げ（元の設定がより小さい場合）、意図（すべてのプロキシをローテーション）が満たされることを保証します。ユーザーが設定した `MaxRetries` がすでに十分に大きい場合は、そのまま維持されます。
:::

```go
package main

import (
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Connection.ProxyPool = []string{
        "http://proxy1:8080",
        "http://proxy2:8080",
        "http://proxy3:8080",
        "http://proxy4:8080",
        "http://proxy5:8080",
    }
    cfg.Connection.ProxyPoolStrategy = httpc.ProxyStrategyRoundRobin
    cfg.Connection.ProxyRotateOnStatus = []int{403} // 403 でプロキシローテーション
    cfg.Retry.MaxRetries = 3 // 自動的に 4 に引き上げ（= 5-1）

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // 403 受信ごとに自動的にプロキシを切り替えてリトライ、最大 5 つのプロキシを試行
    result, err := client.Get("https://protected-site.example.com/data")
    if err != nil {
        log.Printf("すべてのプロキシが失敗: %v", err)
        return
    }
    log.Printf("成功（いずれかのプロキシが通過）: %d", result.StatusCode())
}
```

## リトライバジェットの考慮

リトライはリクエストの総所要時間を延ばします。タイムアウトを設計する際、リトライの遅延バジェットを確保する必要があります。

### 総最悪時間の公式

```
総最悪時間 = (MaxRetries + 1) × リクエストタイムアウト + Σ(各リトライ遅延上限)
```

デフォルト設定（`MaxRetries=3`、`Request=180s`、`Delay=1s`、`Backoff=2.0`、`Jitter`）を例に：

```
リクエストタイムアウト部分：4 × 180s = 720s（初回 + 3 回リトライ、毎回最大 180s 待機）
リトライ遅延部分：1.1 + 2.2 + 4.4 ≈ 7.7s（3 回遅延のジッター上限の合計）
総最悪時間：≈ 727.7s（約 12 分）
```

### 総所要時間を短縮する方法

| 調整 | 効果 |
|------|------|
| `MaxRetries` を減らす | リトライ回数を直接削減、総所要時間は線形に減少 |
| `Timeouts.Request` を減らす | 毎回の試行がより早く失敗 |
| `Retry.Delay` を減らす | リトライ間隔を短縮 |
| `BackoffFactor` を減らす | 遅延増加がより遅く、早期リトライがより高速 |
| `context.WithTimeout` で上書き | 単一リクエストの総上限を精密に制御 |

:::warning リトライとタイムアウトの衝突
`context.WithTimeout` で設定したデッドラインはハードリミットです——リトライ回数がまだ残っていても、context の期限が来れば即座に終了します。つまり実際のリトライ回数は `MaxRetries` より少なくなる可能性があります。アプリケーションで「N 回のリトライを確実に実行」する必要がある場合、context タイムアウトを十分に長く設定してください：

<!-- check-code: skip -->
```go
// 十分な時間を確保：3 回リトライ + 遅延 + 各リクエスト時間
ctx, cancel := context.WithTimeout(context.Background(),
    3*requestTimeout + 10*time.Second)
```
:::

## context キャンセルとリトライ

HTTPC のリトライエンジンは context キャンセルを高速パスで処理します。リクエスト失敗の原因が `context.Canceled` または `context.DeadlineExceeded` の場合、`isRetryableError` は即座に false を返し、完全なエラー分類ロジックをスキップします：

<!-- check-code: skip -->
```go
// 内部実装（retry.go）
func (r *retryEngine) isRetryableError(err error) bool {
    // 高速パス：context エラーはリトライ不可——完全分類のオーバーヘッドを回避
    if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
        return false
    }
    clientErr := classifyError(err, "", "", 0)
    // ...完全分類ロジック
}
```

これは以下を意味します：

- **ユーザーの手動キャンセル**（`cancel()`）：即座に停止、リトライなし
- **context タイムアウト**：即座に停止、リトライなし
- **進行中のリクエストがキャンセル**：キャンセルによって追加のリトライは発生しない

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

    // シナリオ 1：手動キャンセル——リトライなし
    ctx1, cancel1 := context.WithCancel(context.Background())
    go func() {
        time.Sleep(100 * time.Millisecond)
        cancel1() // 100ms 後に手動キャンセル
    }()

    _, err = client.Request(ctx1, "GET", "https://api.example.com/slow")
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) && clientErr.Type == httpc.ErrorTypeContextCanceled {
            fmt.Println("リクエストが手動キャンセルされ、リトライはトリガーされず")
        }
    }

    // シナリオ 2：context タイムアウト——リトライなし
    ctx2, cancel2 := context.WithTimeout(context.Background(), 50*time.Millisecond)
    defer cancel2()

    _, err = client.Request(ctx2, "GET", "https://api.example.com/slow")
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) && clientErr.Type == httpc.ErrorTypeTimeout {
            fmt.Println("リクエストが context タイムアウトで終了、リトライはトリガーされず")
        }
    }
}
```

## エラー処理とリトライ

リトライ枯渇後、エラーは `ClientError` で返されます。`Type` は `ErrorTypeRetryExhausted`（または最後の試行の元のエラータイプ）、`Attempts` フィールドは総試行回数を記録します：

```go
package main

import (
    "errors"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    _, err = client.Get("https://api.example.com/flaky")
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) {
            log.Printf("失敗タイプ: %s, 試行回数: %d",
                clientErr.Code(), clientErr.Attempts)
            if clientErr.Attempts > 1 {
                log.Println("（自動リトライ済みも失敗）")
            }
        }
    }
}
```

## ベストプラクティス

| シナリオ | 推奨設定 |
|------|----------|
| API 呼び出し | `MaxRetries=3, Delay=1s, Backoff=2.0`（デフォルト） |
| マイクロサービス通信 | `MaxRetries=2, Delay=500ms, Backoff=2.0`（高速失敗） |
| ファイルダウンロード | `MaxRetries=5, Delay=2s, Backoff=2.0`（ネットワーク変動を許容） |
| 冪等操作（GET/PUT/DELETE） | 安心してリトライ可能 |
| 非冪等操作（POST） | `WithMaxRetries(0)` またはカスタム `RetryPolicy` で範囲を絞る |
| レート制限 API | `Retry-After` 自動解析に依存（内蔵済み） |
| プロキシプールシナリオ | `ProxyRotateOnStatus` と組み合わせ、リトライ回数は自動的に引き上げ |

:::warning 非冪等 POST リクエストのリトライ
デフォルトでは、非冪等な POST リクエストもリトライ可能ステータスコード（500/502/503/504 など）またはネットワークエラー受信時にリトライされます。サービス側が冪等性を保証できない場合、重複送信が副作用（リソースの重複作成など）を引き起こす可能性があります。正確な制御方法：
1. POST リクエストに `WithMaxRetries(0)` を使用してリトライを完全に無効化
2. またはカスタム `RetryPolicy` でネットワークエラー時のみ（HTTP ステータスコード以外）リトライ
:::

## 次のステップ

- [エラー処理](./error-handling) — エラー分類の詳細とセンチネルエラーマッチング
- [設定 API](../api-reference/client-config/config) — リトライ設定フィールドのリファレンス
- [コネクションプールとプロキシ](./connection-pool) — プロキシプール設定とローテーション戦略
- [インターフェース定義](../api-reference/types/interfaces) — RetryPolicy インターフェースのリファレンス
