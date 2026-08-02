---
sidebar_label: "ミドルウェア"
title: "ミドルウェア - CyberGo HTTPC | 7 つの内蔵ミドルウェア"
description: "HTTPC ミドルウェアシステム API リファレンス：Chain オニオンモデル組み合わせ、7 つの内蔵ミドルウェア（Recovery/Logging/Timeout/Metrics/Audit など）、各ミドルウェアの設定構造体と Default コンストラクタ、AuditEvent 監査イベント構造の説明。"
sidebar_position: 5
---

# ミドルウェア

:::tip アーキテクチャ概要
このページは**内蔵ミドルウェアのリファレンス**です。Handler パイプラインの全体アーキテクチャ、オニオンモデルの原理、カスタムミドルウェアの作成については [ハンドラパイプライン / Handler とミドルウェアチェーン](../handler/handler-chain) を参照してください。
:::

HTTPC はオニオンモデルのミドルウェアアーキテクチャを採用し、`MiddlewareFunc` を通じてリクエスト処理ロジックをラップします。

```go
type MiddlewareFunc func(Handler) Handler
type Handler func(ctx context.Context, req RequestMutator) (ResponseMutator, error)
```

ミドルウェアは `MiddlewareConfig.Middlewares` で設定し、順番に実行されます。各ミドルウェアファクトリは `*XxxConfig` 設定ポインタを受け取り、`nil` を渡すとデフォルト設定を使用します：

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.RecoveryMiddleware(),
    httpc.LoggingMiddleware(&httpc.LoggingConfig{
        LogFunc: log.Printf,
    }),
    httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),
}
client, err := httpc.New(cfg)
```

## Chain

```go
func Chain(middlewares ...MiddlewareFunc) MiddlewareFunc
```

複数のミドルウェアを単一のミドルウェアに組み合わせます。渡された順序で実行され、最後のミドルウェアの処理が終わると最終 Handler を呼び出します。

```go
combined := httpc.Chain(
    httpc.RecoveryMiddleware(),
    httpc.LoggingMiddleware(&httpc.LoggingConfig{
        LogFunc: log.Printf,
    }),
)
```

## 内蔵ミドルウェア

### RecoveryMiddleware

```go
func RecoveryMiddleware() MiddlewareFunc
```

panic リカバリミドルウェア。処理チェーン内の panic をキャッチし、スタック情報を含む error に変換して返します。

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.RecoveryMiddleware(),
}
client, _ := httpc.New(cfg)
```

### LoggingMiddleware

```go
func LoggingMiddleware(config *LoggingConfig) MiddlewareFunc
```

リクエストログミドルウェア。メソッド、URL、ステータスコード、所要時間を記録します。URL は自動的にマスクされます（認証情報を削除）。`nil` を渡すと [`DefaultLoggingConfig()`](#defaultloggingconfig)（ログ無効）を使用します。

#### LoggingConfig

```go
type LoggingConfig struct {
    // LogFunc はフォーマットされたログメッセージを受信します（log.Printf に類似）。
    // nil の場合はログを無効化します。
    LogFunc func(format string, args ...any)
}
```

| フィールド | デフォルト | 説明 |
|-----------|-----------|------|
| `LogFunc` | `nil` | ログ出力関数、nil の場合はログを無効化 |

#### DefaultLoggingConfig

```go
func DefaultLoggingConfig() *LoggingConfig
```

ログ無効のデフォルト設定を返します。`LogFunc` フィールドを設定してログを有効化します。

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.LoggingMiddleware(&httpc.LoggingConfig{
        LogFunc: log.Printf,
    }),
}
client, _ := httpc.New(cfg)
// 出力例：GET https://api.example.com/data -> 200 (125ms)
```

### RequestIDMiddleware

```go
func RequestIDMiddleware(config *RequestIDConfig) MiddlewareFunc
```

各リクエストにユニーク ID を追加します。`nil` を渡すと [`DefaultRequestIDConfig()`](#defaultrequestidconfig)（`"X-Request-ID"` ヘッダー + `crypto/rand` ジェネレーター）を使用します。リクエストに同名のヘッダーが既に存在する場合は、元の値が保持され上書きされません。

:::tip
デフォルトジェネレーターは `crypto/rand` を使用しており、生成される ID は予測不可能なため、セキュリティが重要なシナリオに適しています。
:::

#### RequestIDConfig

```go
type RequestIDConfig struct {
    // HeaderName はリクエスト ID の HTTP ヘッダー名です。
    // デフォルト："X-Request-ID"。
    HeaderName string

    // Generator はリクエスト ID 文字列を生成します。nil の場合は暗号セキュアな
    // ランダムジェネレーター（crypto/rand、16 バイトの16進数エンコード）を使用します。
    Generator func() string
}
```

| フィールド | デフォルト | 説明 |
|-----------|-----------|------|
| `HeaderName` | `"X-Request-ID"` | リクエストヘッダー名 |
| `Generator` | `nil`（crypto/rand） | ID 生成関数、nil の場合は暗号セキュアジェネレーターを使用 |

#### DefaultRequestIDConfig

```go
func DefaultRequestIDConfig() *RequestIDConfig
```

デフォルト設定を返します：`HeaderName` は `"X-Request-ID"`、`Generator` は nil（実行時に `crypto/rand` にフォールバック）。

```go
// デフォルト設定を使用
middleware := httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig())

// カスタムヘッダー名を使用
middleware := httpc.RequestIDMiddleware(&httpc.RequestIDConfig{
    HeaderName: "X-Correlation-ID",
})

// カスタムジェネレーターを使用
middleware := httpc.RequestIDMiddleware(&httpc.RequestIDConfig{
    Generator: func() string {
        return uuid.New().String()
    },
})
```

### TimeoutMiddleware

```go
func TimeoutMiddleware(config *TimeoutMiddlewareConfig) MiddlewareFunc
```

ミドルウェアレベルのタイムアウト制御。`nil` を渡すと [`DefaultTimeoutMiddlewareConfig()`](#defaulttimeoutmiddlewareconfig)（タイムアウト無効、ミドルウェアはパススルー）を使用します。正の値に設定すると、クライアントの内蔵タイムアウトより前に有効になり、タイムアウト時にコンテキストをキャンセルしてエラーを返します。

:::warning Download やストリーミングリクエストには使用しないでください
`TimeoutMiddleware` の `defer cancel()` は、ハンドラーが戻った（レスポンスヘッダーを受信した）直後に発火します。`Download` や `WithStreamBody` リクエストでは、レスポンスボディを読み取る前にコンテキストがキャンセルされ、「context canceled」エラーとして現れます。ストリーミング/ダウンロードのシナリオでは [`WithTimeout`](../core/options#withtimeout) を使用してください。
:::

#### TimeoutMiddlewareConfig

```go
type TimeoutMiddlewareConfig struct {
    // Duration はリクエストの許容最大時間です。ゼロまたは負の値はタイムアウトを無効化します
    //（ミドルウェアはリクエストをそのままパススルーします）。
    // デフォルト：0（無効）。
    Duration time.Duration
}
```

| フィールド | デフォルト | 説明 |
|-----------|-----------|------|
| `Duration` | `0` | タイムアウト時間、ゼロまたは負の値は無効化 |

型名に `Middleware` が含まれているのは、`types.go` のクライアントレベルの `TimeoutConfig` と区別するためです。

#### DefaultTimeoutMiddlewareConfig

```go
func DefaultTimeoutMiddlewareConfig() *TimeoutMiddlewareConfig
```

タイムアウト無効のデフォルト設定を返します。`Duration` を正の値に設定してタイムアウトを有効化します。

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.TimeoutMiddleware(&httpc.TimeoutMiddlewareConfig{
        Duration: 10 * time.Second,
    }),
}
client, _ := httpc.New(cfg)
```

### HeaderMiddleware

```go
func HeaderMiddleware(config *HeaderConfig) MiddlewareFunc
```

各リクエストに静的ヘッダーを追加します。`nil` を渡すと [`DefaultHeaderConfig()`](#defaultheaderconfig)（ヘッダーなし、ミドルウェアはパススルー）を使用します。作成時にヘッダーのセキュリティ検証（CRLF インジェクション対策）を行います。リクエストに同名のヘッダーが既に存在する場合は競合により上書きされます。

#### HeaderConfig

```go
type HeaderConfig struct {
    // Headers は各リクエストに追加する静的ヘッダーを含みます。同じキーの既存ヘッダーは上書きされます。
    // ヘッダーはミドルウェア作成時にセキュリティ検証（CRLF インジェクション対策）を受けます。
    // デフォルト：空（追加されるヘッダーなし、ミドルウェアはパススルー）。
    Headers map[string]string
}
```

| フィールド | デフォルト | 説明 |
|-----------|-----------|------|
| `Headers` | `nil`（空） | 静的ヘッダーのキーと値、作成時にセキュリティ検証 |

#### DefaultHeaderConfig

```go
func DefaultHeaderConfig() *HeaderConfig
```

ヘッダーなしのデフォルト設定を返します。

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.HeaderMiddleware(&httpc.HeaderConfig{
        Headers: map[string]string{
            "X-API-Version": "v2",
            "X-Client":      "myapp/1.0",
        },
    }),
}
client, _ := httpc.New(cfg)
```

### MetricsMiddleware

```go
func MetricsMiddleware(config *MetricsConfig) MiddlewareFunc
```

メトリクス収集ミドルウェア。各リクエスト完了後にコールバックを呼び出し、メソッド、URL、ステータスコード、所要時間、エラー情報を渡します。`nil` を渡すと [`DefaultMetricsConfig()`](#defaultmetricsconfig)（メトリクス無効）を使用します。

#### MetricsConfig

```go
type MetricsConfig struct {
    // OnMetrics は各リクエスト完了後に呼び出され、リクエストメトリクスが渡されます。
    // nil の場合はメトリクス収集を無効化します。
    OnMetrics func(method, url string, statusCode int, duration time.Duration, err error)
}
```

| フィールド | デフォルト | 説明 |
|-----------|-----------|------|
| `OnMetrics` | `nil` | メトリクスコールバック、nil の場合は無効化 |

#### DefaultMetricsConfig

```go
func DefaultMetricsConfig() *MetricsConfig
```

メトリクス無効のデフォルト設定を返します。`OnMetrics` フィールドを設定してメトリクス収集を有効化します。

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.MetricsMiddleware(&httpc.MetricsConfig{
        OnMetrics: func(method, url string, status int, d time.Duration, err error) {
            metrics.Record(method, status, d, err)
        },
    }),
}
client, _ := httpc.New(cfg)
```

### AuditMiddleware

```go
func AuditMiddleware(config *AuditConfig) MiddlewareFunc
```

セキュリティ監査ミドルウェア。金融、医療、行政などのコンプライアンスシナリオに適しています。リクエスト/レスポンスのメタ情報（メソッド、URL、ステータスコード、所要時間、リトライ回数など）を記録し、URL は自動的にマスクされます。コールバックは `config.OnAudit` で提供されます。nil の場合はミドルウェアは何もしません。`nil` を渡すと [`DefaultAuditConfig()`](#defaultauditconfig) を使用します。

`SourceIP` と `UserID` はリクエストコンテキストから [`SourceIPKey`](#監査コンテキストキー) と [`UserIDKey`](#監査コンテキストキー) を通じて抽出されます。

#### AuditConfig

```go
type AuditConfig struct {
    // OnAudit は各リクエスト/レスポンスサイクル完了後に AuditEvent を受信します。
    // nil の場合、ミドルウェアは何もしません。
    OnAudit func(event AuditEvent)

    // Format は出力形式を指定します："text"（デフォルト）または "json"
    Format string

    // IncludeHeaders は監査ログにリクエスト/レスポンスヘッダーを含めます
    IncludeHeaders bool

    // MaskHeaders はマスクが必要なヘッダー名のリストです（例："Authorization"、"Cookie"）
    MaskHeaders []string

    // SanitizeError はエラーメッセージから機密情報を削除します
    SanitizeError bool
}
```

| フィールド | デフォルト | 説明 |
|-----------|-----------|------|
| `OnAudit` | `nil` | 監査コールバック、nil の場合はミドルウェアは何もしない |
| `Format` | `"text"` | 出力形式 |
| `IncludeHeaders` | `false` | ヘッダーを記録するかどうか |
| `MaskHeaders` | `["Authorization", "Cookie", ...]` | 標準的な機密ヘッダーリスト |
| `SanitizeError` | `true` | エラー情報を `[sanitized]` に置換 |

#### DefaultAuditConfig

```go
func DefaultAuditConfig() *AuditConfig
```

デフォルトの監査設定を返します：`Format` は `"text"`、`IncludeHeaders` は `false`、`MaskHeaders` は標準的な機密ヘッダーリスト、`SanitizeError` は `true`。`OnAudit` フィールドを設定して監査コールバックを有効化します。

```go
auditCfg := httpc.DefaultAuditConfig()
auditCfg.OnAudit = func(event httpc.AuditEvent) {
    log.Printf("[AUDIT] %s %s -> %d (%v) user=%s ip=%s",
        event.Method, event.URL, event.StatusCode,
        event.Duration, event.UserID, event.SourceIP)
}
auditCfg.Format = "json"
auditCfg.IncludeHeaders = true

cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.AuditMiddleware(auditCfg),
}
client, _ := httpc.New(cfg)
```

## 監査タイプ

### AuditEvent

```go
type AuditEvent struct {
    Timestamp     time.Time           `json:"timestamp"`
    Method        string              `json:"method"`
    URL           string              `json:"url"`              // マスク済み（認証情報を削除）
    StatusCode    int                 `json:"statusCode"`
    Duration      time.Duration       `json:"duration"`
    Attempts      int                 `json:"attempts"`
    Error         error               `json:"error,omitempty"`
    SourceIP      string              `json:"sourceIP,omitempty"`
    UserID        string              `json:"userID,omitempty"`
    RedirectChain []string            `json:"redirectChain,omitempty"`
    ReqHeaders    map[string][]string `json:"reqHeaders,omitempty"`
    RespHeaders   map[string][]string `json:"respHeaders,omitempty"`
}
```

セキュリティ監査イベント。

#### MarshalJSON

```go
func (e AuditEvent) MarshalJSON() ([]byte, error)
```

カスタム JSON シリアライズ。2 つの特別なフィールドを処理します：

| フィールド | 変換ルール |
|-----------|-----------|
| `Duration` | `durationMs`（ミリ秒整数）を追加、元の `duration` フィールド（ナノ秒）を保持 |
| `Error` | `error`（エラーメッセージ文字列）に変換、nil の場合は省略 |

```go
event := httpc.AuditEvent{
    Method:    "GET",
    URL:       "https://api.example.com/data",
    Duration:  150 * time.Millisecond,
    StatusCode: 200,
}
data, _ := json.Marshal(event)
// {"timestamp":"...","method":"GET","url":"...","statusCode":200,"duration":150000000,"attempts":0,"durationMs":150}
```

### 監査コンテキストキー

リクエストコンテキストで監査情報を渡します：

```go
// ソース IP を設定
ctx = context.WithValue(ctx, httpc.SourceIPKey, "192.168.1.1")

// ユーザー ID を設定
ctx = context.WithValue(ctx, httpc.UserIDKey, "user-123")

result, err := client.Request(ctx, "GET", url)
```

| 定数 | タイプ | 説明 |
|------|--------|------|
| `SourceIPKey` | `auditContextKey` | ソース IP コンテキストキー |
| `UserIDKey` | `auditContextKey` | ユーザー識別コンテキストキー |

## 関連項目

- [インターフェース定義](../types/interfaces) - MiddlewareFunc、Handler タイプ定義
- [ミドルウェアチェーン](../../guides/middleware-chain) - ミドルウェア使用ガイド
- [定数とタイプ](../types/constants) - AuditEvent、AuditConfig タイプ
