---
sidebar_label: "チートシート"
title: "チートシート - CyberGo HTTPC | よく使うコード集"
description: "HTTPC チートシート：クライアント作成と 5 種の設定プリセット、Get/Post など 7 種のリクエストメソッド、28 個の WithXxx リクエストオプション、Result レスポンス処理、ミドルウェアチェーン組み合わせ、エラー分類、ファイルダウンロードとドメインクライアント操作の再利用可能コードスニペット集。"
sidebar_position: 3
---

# チートシート

## クライアントの作成

```go
// デフォルト設定
client, _ := httpc.NewDefault()
defer client.Close()

// カスタム設定
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 60 * time.Second
cfg.Retry.MaxRetries = 5
client, _ = httpc.New(cfg)
```

```go
// プリセットで一発設定
client, _ := httpc.New(httpc.SecureConfig())     // セキュリティ優先：厳格なタイムアウト、リダイレクト禁止、5MB 上限
client, _ = httpc.New(httpc.PerformanceConfig()) // 高スループット：大規模コネクションプール、Cookie 有効
client, _ = httpc.New(httpc.TestingConfig())     // テスト専用：証明書検証と SSRF をスキップ（本番に上げないこと）
client, _ = httpc.New(httpc.MinimalConfig())     // 軽量：リトライなし、リダイレクトなし

// リクエストレベルのデフォルト値（User-Agent / デフォルトヘッダー / リダイレクトポリシー）
cfg := httpc.DefaultConfig()
cfg.Defaults.UserAgent = "myapp/2.0"
cfg.Defaults.Headers["Authorization"] = "Bearer " + token
cfg.Defaults.FollowRedirects = false
cfg.Defaults.MaxRedirects = 5
client, _ = httpc.New(cfg)

// パッケージレベルのデフォルトクライアントを管理
_ = httpc.SetDefaultClient(client) // デフォルトクライアントを置き換え（古いものは自動クローズ）
_ = httpc.CloseDefaultClient()     // クローズしてリセット（次回のパッケージ関数呼び出しで自動再構築）
```

## HTTP メソッド

```go
// パッケージ関数（デフォルトクライアントを使用）
result, _ := httpc.Get(url)
result, _ := httpc.Post(url)
result, _ := httpc.Put(url)
result, _ := httpc.Patch(url)
result, _ := httpc.Delete(url)
result, _ := httpc.Head(url)
result, _ := httpc.Options(url)

// インスタンスメソッド
result, _ := client.Get(url)

// コンテキスト付き
result, _ := httpc.Request(ctx, "GET", url)
result, _ := client.Request(ctx, "POST", url)
```

## リクエストオプション

### リクエストヘッダー

```go
httpc.WithHeader("Authorization", "Bearer token")
httpc.WithHeaderMap(map[string]string{"Key": "Value"})
httpc.WithUserAgent("my-app/1.0")
```

### リクエストボディ

```go
httpc.WithJSON(data)                    // application/json
httpc.WithXML(data)                     // application/xml
httpc.WithForm(map[string]string{...})  // x-www-form-urlencoded
httpc.WithFormData(formData)            // multipart/form-data
httpc.WithFile("file", "doc.pdf", data) // ファイルアップロード
httpc.WithBinary([]byte{...})           // application/octet-stream
httpc.WithBinary([]byte{...}, "image/png") // タイプ指定
httpc.WithBody(data)                    // タイプ自動検出
httpc.WithBody(data, httpc.BodyJSON)    // 明示的指定：BodyJSON/BodyXML/BodyForm/BodyBinary/BodyMultipart
```

`WithBody` の自動検出ルール（`BodyAuto`、デフォルト）：`string` → text/plain、`[]byte` → octet-stream、`map[string]string` → form、`*FormData` → multipart、`io.Reader` → そのままパススルー（Content-Type は設定しない）、その他の型 → JSON。

### クエリパラメータ

```go
httpc.WithQuery("page", 1)
httpc.WithQueryMap(map[string]any{"page": 1, "limit": 10})
// 注意：value が nil の場合、そのパラメータは URL に現れません
```

### 認証

```go
httpc.WithBearerToken(token)
httpc.WithBasicAuth("user", "pass")
```

### Cookie

```go
httpc.WithCookie(http.Cookie{Name: "session", Value: "abc"})
httpc.WithCookies([]http.Cookie{{Name: "a", Value: "1"}, {Name: "b", Value: "2"}})
httpc.WithCookieMap(map[string]string{"session": "abc"})
httpc.WithCookieString("session=abc; token=xyz")
httpc.WithSecureCookie(httpc.StrictCookieSecurityConfig()) // すべての WithCookie* の後に置く必要があります
```

### 制御

```go
httpc.WithContext(ctx)
httpc.WithTimeout(30 * time.Second)
httpc.WithMaxRetries(3)          // 0 でリトライ無効、上限 10
httpc.WithFollowRedirects(false) // リダイレクト追従を禁止
httpc.WithMaxRedirects(5)        // 注意：0 は未設定と同義（デフォルト 10 にフォールバック）。追従の無効化には上行を使用
httpc.WithStreamBody(true)       // Download にのみ有効（通常リクエストのレスポンスボディは引き続き Result に完全に読み込まれる）
httpc.WithAllowPrivateIPs(true)  // リクエスト単位で SSRF を免除（内部ネットワーク/localhost へのアクセス）
```

### コールバック

```go
httpc.WithOnRequest(func(req httpc.RequestMutator) error {
    log.Printf("送信 %s %s", req.Method(), req.URL())
    return nil
})
httpc.WithOnResponse(func(resp httpc.ResponseMutator) error {
    log.Printf("レスポンス受信：%d", resp.StatusCode())
    return nil
})
```

## レスポンス処理

```go
result.StatusCode()                    // int
result.Body()                          // string
result.RawBody()                       // []byte
result.Proto()                         // "HTTP/1.1"
result.IsSuccess()                     // 2xx
result.IsRedirect()                    // 3xx
result.IsClientError()                 // 4xx
result.IsServerError()                 // 5xx
result.Unmarshal(&data)                // JSON 解析
result.GetCookie("name")               // レスポンス Cookie を取得
result.HasCookie("name")               // レスポンス Cookie を確認
result.ResponseCookies()               // 全レスポンス Cookie
result.RequestCookies()                // 全リクエスト Cookie
result.GetRequestCookie("name")        // リクエスト Cookie を取得
result.HasRequestCookie("name")        // リクエスト Cookie を確認
result.SaveToFile("/path/to/file")     // ファイルに保存
result.String()                        // 人間可読表現（機密ヘッダーはマスク済み）
```

```go
// メタ情報（result.Meta）
result.Meta.Duration       // 合計所要時間（リトライ待ちを含む）
result.Meta.Attempts       // 試行回数（初回を含む）
result.Meta.RedirectChain  // 経由したリダイレクト URL チェーン
result.Meta.RedirectCount  // リダイレクト回数
result.Meta.ProxyURL       // 最終リクエストが使用したプロキシ（直接接続・システムプロキシでは空）

// 構造体フィールド（上記の nil 安全なメソッドを優先）
result.Request.URL            // リクエスト URL
result.Request.Method         // リクエストメソッド
result.Request.Headers        // リクエストヘッダー
result.Response.Status        // "200 OK"
result.Response.Headers       // レスポンスヘッダー（http.Header）
result.Response.ContentLength // Content-Length
```

## 設定

```go
cfg := httpc.DefaultConfig()

// タイムアウト
cfg.Timeouts.Request = 30 * time.Second        // 全体予算（リトライを含む）、デフォルト 180s
cfg.Timeouts.Dial = 10 * time.Second           // TCP 接続、デフォルト 10s
cfg.Timeouts.TLSHandshake = 10 * time.Second   // TLS ハンドシェイク、デフォルト 10s
cfg.Timeouts.ResponseHeader = 30 * time.Second // デフォルト 0（無効）。設定するとトランスポート層のハード上限となり、WithTimeout では上書き不可
cfg.Timeouts.IdleConn = 90 * time.Second       // アイドル接続、デフォルト 90s

// 接続
cfg.Connection.MaxIdleConns = 50        // グローバルアイドル接続の上限（デフォルト 50、上限 1000）
cfg.Connection.MaxConnsPerHost = 10     // ホストあたりの接続上限（デフォルト 10、上限 1000）
cfg.Connection.ProxyURL = "http://proxy:8080"
cfg.Connection.EnableHTTP2 = true
cfg.Connection.EnableCookies = true

// プロキシプール（ローテーション + 受動的サーキットブレーカー）
cfg.Connection.ProxyPool = []string{"http://p1:8080", "http://p2:8080"}
cfg.Connection.ProxyPoolStrategy = httpc.ProxyStrategyRoundRobin // または ProxyStrategyRandom
cfg.Connection.ProxyFailureThreshold = 3   // 連続 3 回の失敗で一時的に除外（デフォルト 3）
cfg.Connection.ProxyCooldown = 30 * time.Second // 除外後のハーフオープン探活クールダウン（デフォルト 30s）
cfg.Connection.ProxyRotatePerRequest = true     // リクエストごとに IP を切り替え（コネクション再利用を犠牲）
cfg.Connection.ProxyRotateOnStatus = []int{403} // ステータスコード命中でプロキシを切り替えてリトライ（MaxRetries > 0 が必要）

// DNS-over-HTTPS
cfg.Connection.EnableDoH = true
cfg.Connection.DoHCacheTTL = 5 * time.Minute // デフォルト 5 分

// セキュリティ
cfg.Security.MinTLSVersion = tls.VersionTLS12
cfg.Security.MaxTLSVersion = tls.VersionTLS13
cfg.Security.MaxResponseBodySize = 10 * 1024 * 1024   // デフォルト 10MB
cfg.Security.MaxDecompressedBodySize = 100 * 1024 * 1024 // デフォルト 100MB（解凍爆弾を防止）
cfg.Security.MaxRequestBodySize = 50 * 1024 * 1024    // デフォルト 0（アップロード無制限）
cfg.Security.AllowPrivateIPs = false
cfg.Security.SSRFExemptCIDRs = []string{"10.0.0.0/8"}
cfg.Security.RedirectWhitelist = []string{"api.example.com"} // リダイレクト宛先のホワイトリスト

// 証明書ピンニング（信頼された CA が侵害されても MITM を防止）
pinner, _ := httpc.NewSPKIHashPinner("base64-spki-sha256-hash", "backup-hash") // 複数ハッシュでローテーションに対応
cfg.Security.CertificatePinner = pinner

// リトライ
cfg.Retry.MaxRetries = 3              // デフォルト 3。0 で無効、上限 10
cfg.Retry.Delay = 1 * time.Second     // 初期遅延、デフォルト 1s
cfg.Retry.BackoffFactor = 2.0         // バックオフ倍率、デフォルト 2.0（範囲 1.0–10.0）
cfg.Retry.MaxRetryDelay = 30 * time.Second // 単回待機の上限、デフォルト 30s
cfg.Retry.EnableJitter = true         // ジッター、デフォルトで有効
cfg.Retry.CustomPolicy = myPolicy     // カスタム戦略（ShouldRetry/GetDelay/MaxRetries を実装）
```

## ミドルウェア

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: log.Printf}),
    httpc.RecoveryMiddleware(),
    httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),
    httpc.TimeoutMiddleware(&httpc.TimeoutMiddlewareConfig{Duration: 30 * time.Second}),
    httpc.MetricsMiddleware(&httpc.MetricsConfig{
        OnMetrics: func(method, url string, statusCode int, duration time.Duration, err error) {
            metrics.Record(method, statusCode, duration)
        },
    }),
    httpc.AuditMiddleware(&httpc.AuditConfig{
        OnAudit: func(event httpc.AuditEvent) {
            log.Printf("[AUDIT] %s %s -> %d", event.Method, event.URL, event.StatusCode)
        },
    }),
    httpc.HeaderMiddleware(&httpc.HeaderConfig{ // 静的ヘッダー（作成時に CRLF 検証）
        Headers: map[string]string{"X-Service": "api"},
    }),
}
```

```go
// カスタムミドルウェア：リクエスト段階は next の前（登録順）、レスポンス段階は next の後（逆順）
func traceMiddleware(next httpc.Handler) httpc.Handler {
    return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
        req.SetHeader("X-Trace", "on") // リクエスト段階
        resp, err := next(ctx, req)    // 内層に引き渡す
        if resp != nil {
            log.Printf("-> %d", resp.StatusCode()) // レスポンス段階
        }
        return resp, err
    }
}
// 登録：cfg.Middleware.Middlewares = append(cfg.Middleware.Middlewares, traceMiddleware)
// 組み合わせ：httpc.Chain(mw1, mw2)(finalHandler)
```

:::warning 注意
`TimeoutMiddleware` は `Download` や `WithStreamBody(true)` のリクエストには使わないでください（レスポンスヘッダー受信で即座にコンテキストをキャンセルし、レスポンスボディ読み取りで "context canceled" が発生します）。このようなシナリオでは代わりに `WithTimeout` を使用してください。
:::

## エラー処理

```go
result, err := client.Get(url)
if err != nil {
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        switch clientErr.Type {
        case httpc.ErrorTypeTimeout:
            // タイムアウト
        case httpc.ErrorTypeNetwork:
            // ネットワークエラー
        case httpc.ErrorTypeTLS:
            // TLS エラー
        case httpc.ErrorTypeDNS:
            // DNS 解決エラー
        case httpc.ErrorTypeContextCanceled:
            // コンテキストキャンセル
        case httpc.ErrorTypeRetryExhausted:
            // リトライ枯渇
        case httpc.ErrorTypeValidation:
            // リクエスト検証エラー
        case httpc.ErrorTypeHTTP:
            // HTTP 層エラー
        // その他：ErrorTypeUnknown, ErrorTypeResponseRead,
        //       ErrorTypeTransport, ErrorTypeCertificate
        }
        if clientErr.IsRetryable() {
            // リトライ可能
        }
    }
}
```

```go
// エラーショートコード（ClientError.Code()）
switch clientErr.Code() {
case "TIMEOUT":           // タイムアウト
case "NETWORK_ERROR":     // ネットワークエラー
case "TLS_ERROR":         // TLS ハンドシェイク/プロトコルエラー
case "CERTIFICATE_ERROR": // 証明書検証エラー
case "DNS_ERROR":         // DNS 解決エラー
case "CONTEXT_CANCELED":  // コンテキストキャンセル
case "RETRY_EXHAUSTED":   // リトライ枯渇
case "VALIDATION_ERROR":  // リクエスト検証エラー（CRLF/不正ヘッダーなど）
case "HTTP_ERROR":        // HTTP 層エラー
case "TRANSPORT_ERROR", "RESPONSE_READ_ERROR", "UNKNOWN_ERROR":
}

// センチネルエラー（errors.Is）
errors.Is(err, httpc.ErrClientClosed)         // クローズ済みクライアントの使用
errors.Is(err, httpc.ErrResponseBodyEmpty)    // Unmarshal の空レスポンスボディ
errors.Is(err, httpc.ErrResponseBodyTooLarge) // 解析ボディが 50MB 超過
errors.Is(err, httpc.ErrFileExists)           // ダウンロード対象が既に存在し Overwrite/Resume が無効
errors.Is(err, httpc.ErrEmptyFilePath)        // DownloadConfig.FilePath が未設定

// リトライ可否のクイック判定
// 常にリトライ可能：タイムアウト、トランスポートエラー
// 原因次第：ネットワークエラー、DNS（一時的/タイムアウト）、HTTP 408/429/500/502/503/504
// 常にリトライ不可：コンテキストキャンセル、検証エラー、TLS、証明書エラー
```

## ファイルダウンロード

```go
// 基本ダウンロード（ctx は context.Context、例えば context.Background()）
dlCfg := httpc.DefaultDownloadConfig()
dlCfg.FilePath = "/path/to/file"
dlResult, err := client.Download(ctx, url, dlCfg)

// オプション付き（上書き、レジューム、進捗）
dlCfg := httpc.DefaultDownloadConfig()
dlCfg.FilePath = "/path/to/file"
dlCfg.Overwrite = true
dlCfg.ResumeDownload = true
dlCfg.ProgressCallback = func(downloaded, total int64, speed float64) {
    fmt.Printf("\r%.1f%% (%.2f MB/s)", float64(downloaded)/float64(total)*100, float64(speed)/1024/1024)
}
dlResult, err := client.Download(ctx, url, dlCfg)

// チェックサム検証（ダウンロード完了後に検証、不一致なら失敗しファイルを削除）
dlCfg.Checksum = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
dlCfg.ChecksumAlgorithm = httpc.ChecksumSHA256 // 現在は sha256 のみ対応

// パッケージレベルのダウンロード（デフォルトクライアントを使用）
dlResult, err := httpc.Download(ctx, url, dlCfg)

// dlResult の型は *DownloadResult（*Result ではない）
// フィールド：FilePath, BytesWritten, Duration, AverageSpeed, StatusCode, ContentLength, Resumed, ResponseCookies, ActualChecksum
```

## ドメインクライアント

```go
dc, _ := httpc.NewDomainDefault("https://api.example.com")
defer dc.Close()

dc.SetHeader("Authorization", "Bearer "+token)
result, _ := dc.Get("/users")
```

```go
// セッションヘッダー / Cookie 管理
dc.SetHeaders(map[string]string{"Authorization": "Bearer " + token, "Accept": "application/json"})
dc.DeleteHeader("Authorization")
dc.ClearHeaders()
dc.SetCookie(&http.Cookie{Name: "session", Value: "abc"}) // レスポンスの Set-Cookie も自動的にセッションへ書き込まれる
dc.GetCookie("session")
dc.ClearCookies()
dc.URL()     // "https://api.example.com"
dc.Domain()  // "api.example.com"
dc.Session() // *SessionManager（スレッドセーフ）

// URL 結合：相対パスはベース基準。完全な URL はそのまま使用。ベースパスを逸脱するとエラー
result, _ = dc.Get("/repos/golang/go")       // https://api.example.com/repos/golang/go
result, _ = dc.Get("https://other.host/api") // パススルー

// セッションマネージャーは単独でも使用可能
sm, _ := httpc.NewSessionManagerDefault()
sm.SetHeader("X-App", "demo")
sm.UpdateFromResult(result) // レスポンスから Set-Cookie を抽出
```

:::warning オプションは 2 回実行される
`DomainClient` のリクエストオプションは内部で 2 回適用されます（セッションキャプチャ + 実リクエスト）。副作用のあるオプション（カウンター、一回限りの nonce）は入れないでください。
:::

## シナリオ別設定例

```go
// リクエストレベルのタイムアウト（インスタンス設定を上書き）
result, err := client.Get(url, httpc.WithTimeout(30*time.Second))

// 長時間応答の API（AI/LLM API）：全体タイムアウトはデフォルト 180s、緩和可能
result, err := httpc.Post(url,
    httpc.WithJSON(payload),
    httpc.WithTimeout(900*time.Second),
)

// 今回のリトライを無効化 / リトライ上限を引き上げ
httpc.WithMaxRetries(0)
httpc.WithMaxRetries(5)

// リダイレクト禁止 / 回数制限
httpc.WithFollowRedirects(false)
httpc.WithMaxRedirects(3)

// 内部ネットワークサービスへのアクセス（リクエスト単位で SSRF を免除）
result, err := httpc.Get("http://10.0.0.5:8080/health",
    httpc.WithAllowPrivateIPs(true),
)

// キャンセルとデッドライン制御
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()
result, err := httpc.Request(ctx, "GET", url)

// JSON アップロード + 認証 + タイムアウトを一発で
result, err := httpc.Post("https://api.example.com/orders",
    httpc.WithJSON(order),
    httpc.WithBearerToken(token),
    httpc.WithTimeout(15*time.Second),
)
```
