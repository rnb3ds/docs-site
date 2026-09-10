---
sidebar_label: "ミドルウェアチェーン"
title: "ミドルウェアチェーン - CyberGo HTTPC | オニオンモデルとチェーン組み合わせ"
description: "HTTPC ミドルウェアチェーンガイド：オニオンモデルと完全な実行順序、リクエスト/レスポンス双方向処理、Recovery/Logging など 7 つの内蔵ミドルウェア、Chain 組み合わせ、カスタム MiddlewareFunc とサーキットブレーカーショート例、観測可能なパイプラインを構築。"
sidebar_position: 9
---

# ミドルウェアチェーン

## オニオンモデル

HTTPC のミドルウェアはオニオンモデルを採用しています。リクエストは外から内へ、レスポンスは内から外へ流れます：

```text
リクエスト →  Recovery  →  Logging  →  RequestID  → Handler
                                                          ↓
レスポンス ←  Recovery  ←  Logging  ←  RequestID  ← Response
```

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.RecoveryMiddleware(),                                      // 最外層：panic リカバリ
    httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: log.Printf}), // 第 2 層：ログ記録
    httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),          // 最内層：リクエスト ID
}

client, err := httpc.New(cfg)
if err != nil {
    log.Fatal(err)
}
defer client.Close()
```

中核となる 2 つの型（いずれもエクスポート済みの別名）：

```go
// Handler は 1 つの HTTP リクエストを処理してレスポンスを返す——チェーンの終点はエンジン
type Handler func(ctx context.Context, req RequestMutator) (ResponseMutator, error)

// MiddlewareFunc は 1 つの Handler を新しい Handler にラップする
type MiddlewareFunc func(Handler) Handler
```

`RequestMutator` / `ResponseMutator` はリクエストとレスポンスのすべての読み書きメソッドを提供し、ミドルウェアの両段階で利用できます。

### 完全な実行順序

視野を広げると、1 回のリクエストが通過する完全なパイプラインは次のとおりです：

```text
client.Get(url, opts...)
   │
   ├─ 1. リクエストオプションを適用（WithHeader/WithJSON/WithQuery/...）
   │
   ├─ 2. ミドルウェアチェーン · リクエスト段階（外 → 内）
   │       Recovery → Logging → RequestID → ……
   │
   ├─ 3. 終端ハンドラー：ミドルウェアが変更したリクエストフィールドをエンジンへ渡す
   │
   ├─ 4. エンジン内部：セキュリティ検証 → リトリーループ（指数バックオフ）→ トランスポート層での送信
   │
   └─ 5. ミドルウェアチェーン · レスポンス段階（内 → 外）
           …… ← RequestID ← Logging ← Recovery
```

重要な結論：

- **リクエストオプションはミドルウェアより先に実行される**：ミドルウェアが読むのは「オプションがすでに反映された」リクエストであり、オプションが設定した任意のフィールド（ヘッダー、クエリパラメータ、タイムアウト、リダイレクト戦略など）を上書きすることもできます
- **オプションが 2 回実行されることはない**：終端ハンドラーは、ミドルウェアが変更したリクエストフィールドをまったく新しいエンジンリクエストへコピーして送信するのであり、オプションを再度実行するのではありません
- `Defaults.Headers` / `Defaults.UserAgent` などのクライアントデフォルト値は、エンジンが最終リクエストを構築する際に「未設定の場合のみ埋める」方式で適用されるため、ミドルウェアが設定した同名ヘッダーが優先されます

### ミドルウェアとリトライの関係

ミドルウェアチェーンがラップするのは**リトライ周期全体**です。1 回の論理リクエストが何回リトライしてもミドルウェアは 1 回しか実行されず、目にするのは最終試行のレスポンスです——総試行回数は `Meta.Attempts` が反映します。

「試行ごと」の粒度のフックが必要な場合は [`WithOnRequest`/`WithOnResponse` コールバック](./request-response#コールバック)を使います：これらはエンジン内部で、毎回の試行（リトライを含む）で発火します。

### エラー伝播とショート

- いずれかのミドルウェアがエラーを返すと、チェーンは即座に中断します：より内側のミドルウェアは実行されず、エラーはそのまま呼び出し元へ伝わります
- ミドルウェアが **`next()` を呼ばずに**レスポンス（またはエラー）を直接返すのが「ショート」です——外側のミドルウェアのレスポンス段階は引き続き実行され（Recovery の defer など）、内側とエンジンはまったく実行されません。キャッシュヒットやサーキットブレークオープンなどのシナリオはこの方式で実装します
- `(resp, err)` を同時に返した場合、クライアントがフォールバックとしてレスポンスを解放し、オブジェクトプールのリークを防ぎます。しかし `next()` で得たレスポンスを破棄して `(nil, err)` を返すとリークになります——レスポンスを飲み込まないでください（下のカスタムミドルウェアの警告を参照）
- panic には 2 つの防線があります：`RecoveryMiddleware` がチェーン内の panic をリカバリし、`Request` メソッド自体にもデフォルトの recover 層があり、漏れた panic をエラーに変換してプロセスをクラッシュさせません

## 内蔵ミドルウェア

### RecoveryMiddleware

panic をリカバリし、プロセスのクラッシュを防止します：

```go
httpc.RecoveryMiddleware()
```

panic 値はスタックを含むエラーに変換されて返ります。通常はチェーンの**最外層**に置き、以降のすべての層を保護します。

### LoggingMiddleware

リクエスト/レスポンスのログ。URL は自動的にマスクされます：

```go
httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: func(format string, args ...any) {
    log.Printf("[HTTP] "+format, args...)
}})
// 出力例：[HTTP] GET https://api.example.com/data -> 200 (150ms)（ステータスコードと所要時間は実際の計測値、固定ではない）
```

`nil` 設定や `LogFunc` が nil の場合、ログは無効になります（ミドルウェアはパススルーに）。URL 内の認証情報（`user:pass@host`）は記録前に除去されます。

### RequestIDMiddleware

各リクエストに一意の ID を付与します。`crypto/rand` で生成：

```go
httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()) // デフォルトは 32 文字の hex

// カスタムジェネレーター
httpc.RequestIDMiddleware(&httpc.RequestIDConfig{
    HeaderName: "X-Request-ID",
    Generator:  func() string {
        return uuid.New().String()
    },
})
```

リクエストがすでに同名ヘッダーを持つ場合（上流ゲートウェイが注入した場合など）、ミドルウェアは既存の値を**上書きしません**。これにより全経路のトレース透過が可能になります。

### TimeoutMiddleware

ミドルウェア層のタイムアウト。クライアントのタイムアウトより先に強制されます：

```go
httpc.TimeoutMiddleware(&httpc.TimeoutMiddlewareConfig{Duration: 30 * time.Second})
```

タイムアウトはリクエスト自身の context から派生し（設定済みのデッドライン/キャンセルシグナルは保持）、期限が切れると context がキャンセルされ、タイムアウトエラーが返ります。`Duration` が 0 以下の場合は無効です（パススルー）。

:::warning Download やストリーミングリクエストには使わない
`TimeoutMiddleware` の `defer cancel()` はハンドラーの返却（＝レスポンスヘッダー受信）直後に発火します。`Download` や `WithStreamBody` リクエストでは、レスポンスボディを読み込む前に context が早期キャンセルされ、「context canceled」エラーとして現れます。ストリーミング/ダウンロードのシナリオでは代わりに [`WithTimeout`](../api-reference/core/options#withtimeout) オプションを使ってください。
:::

### HeaderMiddleware

すべてのリクエストに静的ヘッダーを追加します：

```go
httpc.HeaderMiddleware(&httpc.HeaderConfig{Headers: map[string]string{
    "X-App-Version": "1.0.0",
    "X-Platform":    "server",
}})
```

ヘッダー map は**ミドルウェア作成時に** CRLF 検証と防御的コピーが行われます——後から渡した map を変更してもミドルウェアには影響しません。検証に失敗した場合、そのミドルウェアはすべてのリクエストでエラーを返します。既存の同名ヘッダーは上書きされます。

### MetricsMiddleware

リクエストメトリクスを収集します：

```go
httpc.MetricsMiddleware(&httpc.MetricsConfig{OnMetrics: func(method, url string, statusCode int, duration time.Duration, err error) {
    metrics.IncrCounter("http.requests", 1)
    metrics.RecordTimer("http.latency", duration)
    if err != nil {
        metrics.IncrCounter("http.errors", 1)
    }
}})
```

コールバックに渡される URL とエラーメッセージはいずれもマスク済みです（URL の認証情報除去、エラーメッセージ内の生 URL をマスク版に置換）。機密データがメトリクスシステムに入ることはありません。リクエスト失敗時の `statusCode` は 0 です。

### AuditMiddleware

セキュリティ監査。金融、医療などのコンプライアンスシナリオ向け：

```go
auditCfg := httpc.DefaultAuditConfig()
auditCfg.OnAudit = func(event httpc.AuditEvent) {
    log.Printf("[AUDIT] %s %s -> %d (%v)",
        event.Method, event.URL, event.StatusCode, event.Duration)
}
httpc.AuditMiddleware(auditCfg)
```

`OnAudit` が nil の場合、ミドルウェアは no-op です（そのままパススルー）。

### 監査オプションの設定

`DefaultAuditConfig()` でデフォルト設定を取得してからフィールドを変更すると、出力フォーマット、ヘッダー記録、マスクを制御できます：

```go
auditCfg := httpc.DefaultAuditConfig()
auditCfg.Format = "json"
auditCfg.IncludeHeaders = true
auditCfg.MaskHeaders = []string{"Authorization", "Cookie"}
auditCfg.SanitizeError = true
auditCfg.OnAudit = func(event httpc.AuditEvent) {
    data, err := json.Marshal(event)
    if err != nil {
        log.Println("監査イベントのシリアライズに失敗：", err)
        return
    }
    log.Println(string(data))
}

httpc.AuditMiddleware(auditCfg)
```

`AuditEvent` はタイムスタンプ、メソッド、マスク済み URL、ステータスコード、所要時間、試行回数、リダイレクトチェーンなどのフィールドを持ちます。`SanitizeError = true` の場合、エラーは一律 `[sanitized]` に置き換えられ、エラーの詳細から機密情報が漏れるのを防ぎます。JSON シリアライズ時、`Duration` には `durationMs` フィールド（ミリ秒数）が追加出力されます。

監査イベントはコンテキストから SourceIP と UserID を抽出できます：

```go
ctx := context.WithValue(context.Background(), httpc.SourceIPKey, "192.168.1.1")
ctx = context.WithValue(ctx, httpc.UserIDKey, "user-123")
```

## 手動チェーン組み合わせ

`Chain` 関数でミドルウェアを組み合わせます：

```go
middleware := httpc.Chain(
    httpc.RecoveryMiddleware(),
    httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: log.Printf}),
    httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),
)

cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{middleware}
```

`Chain` は最後のミドルウェアから前へ向かって順にラップするため、**スライスの順序 = 外から内への実行順序**です：最初の要素が最外層（リクエストを最初に見て、レスポンスを最後に見る）になります。`Chain` は複数のミドルウェアを 1 つの `MiddlewareFunc` に収束させるため、ライブラリとして再利用したり、必要に応じて異なる組み合わせを組み立てたりするのに適しています。

## カスタムミドルウェア

```go
func CORSMiddleware(origin string) httpc.MiddlewareFunc {
    return func(next httpc.Handler) httpc.Handler {
        return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
            // リクエスト段階：リクエストを変更
            req.SetHeader("Origin", origin)

            // 次のハンドラーを呼び出す
            resp, err := next(ctx, req)

            // レスポンス段階：レスポンスを記録または変更
            if resp != nil {
                log.Printf("レスポンスステータス：%d", resp.StatusCode())
            }

            return resp, err
        }
    }
}
```

完全に実行可能なサンプル——所要時間とステータスを記録するタイミングミドルウェア：

```go
package main

import (
    "context"
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

// timingMiddleware は各リクエストのメソッド、URL、ステータスコード、所要時間を記録する
func timingMiddleware() httpc.MiddlewareFunc {
    return func(next httpc.Handler) httpc.Handler {
        return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
            start := time.Now()

            // リクエスト段階：リクエストの読み取り/変更が可能
            req.SetHeader("X-Client-Trace", "demo")

            // 次の層を呼び出す（最終的にエンジンへ到達）
            resp, err := next(ctx, req)

            // レスポンス段階：レスポンスの読み取り/変更が可能
            status := 0
            if resp != nil {
                status = resp.StatusCode()
            }
            log.Printf("%s %s -> %d (%v)", req.Method(), req.URL(), status, time.Since(start))

            return resp, err
        }
    }
}

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
        httpc.RecoveryMiddleware(),
        timingMiddleware(),
    }

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://httpbin.org/get")
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(result.StatusCode()) // 200
}
```

:::warning next() のレスポンスを飲み込まない
`next()` を呼んで非 nil のレスポンスを得たら、そのまま返すか、より内層を呼んだうえで内層のレスポンスを返すかしてください。レスポンスを破棄して `(nil, err)` を返すとエンジンのオブジェクトプールがリークします。`(resp, err)` を同時に返した場合はクライアントがフォールバックでレスポンスを解放しますが、基本的にはそのまま渡すのが望ましいです。
:::

:::warning ミドルウェアの状態と並行性
同じミドルウェアインスタンスはクライアント作成時に 1 回だけ組み込まれ、**すべての並列リクエストで共有されます**。クロージャに保持した可変状態（カウンター、サーキットブレークしきい値など）は、下のサーキットブレーカーの例のように必ずミューテックスで保護してください。ステートレスなミドルウェアには追加の処理は不要です。
:::

### ショートミドルウェア

```go
func CircuitBreakerMiddleware(threshold int) httpc.MiddlewareFunc {
    var failures int
    var mu sync.Mutex

    return func(next httpc.Handler) httpc.Handler {
        return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
            mu.Lock()
            if failures >= threshold {
                mu.Unlock()
                return nil, fmt.Errorf("circuit breaker open")
            }
            mu.Unlock()

            resp, err := next(ctx, req)
            if err != nil {
                mu.Lock()
                failures++
                mu.Unlock()
            }
            return resp, err
        }
    }
}
```

ショートして `(nil, err)` を返す場合は **`next()` を呼んでいない**ため、解放すべきレスポンスを保持しておらず、リークの問題はありません。自作のレスポンスを返してショートすることもできます（キャッシュヒットのシナリオなど）——`ResponseMutator` インターフェースを実装して返せばよく、エンジンのレスポンスは正常に置き換えられます。

## ミドルウェア設定

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.RecoveryMiddleware(),
    httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: log.Printf}),
}
cfg.Defaults.UserAgent = "my-app/1.0"
cfg.Defaults.Headers = map[string]string{"X-App": "my-app"}
cfg.Defaults.FollowRedirects = true
cfg.Defaults.MaxRedirects = 10

client, err := httpc.New(cfg)
if err != nil {
    log.Fatal(err)
}
defer client.Close()
```

2 種類の「デフォルト値」を混同しないでください：`Middleware.Middlewares` はリクエストをインターセプトするパイプラインであり、`Defaults.*` はエンジンがリクエストを構築する際に埋める静的デフォルト値です（リクエストで未設定の場合のみ有効で、オプションとミドルウェアより優先度は低い）。

## 次のステップ

- [内蔵ミドルウェア API](../api-reference/client-config/middleware) - 完全なミドルウェアリファレンス
- [リトライとフォールトトレランス](./retry-fault-tolerance) - リトライ戦略ガイド
- [セキュリティ概要](../security/) - 監査ミドルウェアのセキュリティ実践
