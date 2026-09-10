---
sidebar_label: "高度なサンプル"
title: "高度な使用例 - CyberGo HTTPC | 本番グレードのコード"
description: "HTTPC 高度な使用例集：カスタム RetryPolicy、リクエスト/レスポンスコールバック、完全ミドルウェアチェーン、RESTful クライアントラッパー、ドメインクライアントカスタム設定、Cookie/SessionManager セッション、worker pool 並列と HMAC 署名ミドルウェア。"
sidebar_position: 2
---

# 高度な使用例

## カスタムリトライポリシー

502/503/504 のみリトライし、固定遅延を使用します：

:::warning 内部タイプ
RetryPolicy.ShouldRetry の `resp` パラメータのタイプ ResponseReader は内部インターフェース（`internal/types` パッケージに定義）であり、外部パッケージからは直接参照できません。カスタム `RetryPolicy` は `httpc` と同じモジュール内のパッケージで実装する必要があります。ほとんどのシナリオでは `RetryConfig` 設定で要件を満たせます。以下の例は実装パターンを示していますが、実際のコードは `httpc` モジュール内部でコンパイルする必要があります。
:::

```go
// 注意：ResponseReader は内部タイプ（internal/types パッケージ）です。
// このコードは github.com/cybergodev/httpc モジュール内でのみコンパイル可能です。
// ほとんどのユーザーは RetryConfig と WithMaxRetries でリトライを設定してください。

type selectiveRetry struct {
    maxAttempts int
    baseDelay   time.Duration
}

// リトライするかどうかを判定
func (p *selectiveRetry) ShouldRetry(resp ResponseReader, err error, attempt int) bool {
    if attempt >= p.maxAttempts {
        return false
    }
    if err != nil {
        return true // ネットワークエラーはリトライ
    }
    return resp.StatusCode() == 502 || resp.StatusCode() == 503 || resp.StatusCode() == 504
}

func (p *selectiveRetry) GetDelay(attempt int) time.Duration {
    return p.baseDelay * time.Duration(attempt+1)
}

func (p *selectiveRetry) MaxRetries() int {
    return p.maxAttempts
}

// カスタムポリシーを適用
cfg := httpc.DefaultConfig()
cfg.Retry.CustomPolicy = &selectiveRetry{maxAttempts: 5, baseDelay: time.Second}
```

外部プロジェクトでの代替案 — `RetryConfig` 設定を使用：

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Retry.MaxRetries = 5
    cfg.Retry.Delay = 500 * time.Millisecond
    cfg.Retry.BackoffFactor = 1.5
    cfg.Retry.EnableJitter = true

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://api.example.com/unstable")
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println(result.StatusCode())
}
```

## タイムアウトとリトライの組み合わせ

3 層の時間制御がそれぞれ役割を担います：context は試行全体の総バジェットを、`WithTimeout` は 1 回の試行を、`WithMaxRetries` は試行回数を管理します：

```go
package main

import (
    "context"
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

    // ctx 30s：全リトライとバックオフ待ちを含む総バジェット
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    result, err := client.Post("https://httpbin.org/post",
        httpc.WithJSON(map[string]string{"data": "important"}),
        httpc.WithContext(ctx),           // 総バジェット
        httpc.WithTimeout(10*time.Second), // 1 回の試行の上限
        httpc.WithMaxRetries(3),           // 最大 3 回リトライ
    )
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println(result.StatusCode())            // 出力：200
    fmt.Println("試行回数:", result.Meta.Attempts) // 出力：試行回数: 1（失敗してリトライすると増加）
    fmt.Println("総所要時間:", result.Meta.Duration)
}
```

リトライを無効化したい場合（べき等でない作成操作など）は、`WithMaxRetries(0)` で明示的に宣言します：

```go
result, err := client.Post("https://httpbin.org/post",
    httpc.WithJSON(map[string]string{"action": "create"}),
    httpc.WithMaxRetries(0), // リトライしない：重複作成を回避
)
```

## 完全なミドルウェアチェーン

```go
package main

import (
    "encoding/json"
    "log"
    "sync/atomic"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    // リクエストカウンター
    var requestCount int64

    // メトリクス収集
    metricsMiddleware := httpc.MetricsMiddleware(
        &httpc.MetricsConfig{OnMetrics: func(method, url string, statusCode int, duration time.Duration, err error) {
            atomic.AddInt64(&requestCount, 1)
            log.Printf("[METRICS] %s %s -> %d (%v)", method, url, statusCode, duration)
        }},
    )

    // 監査ログ（JSON 形式）
    auditCfg := httpc.DefaultAuditConfig()
    auditCfg.Format = "json"
    auditCfg.IncludeHeaders = true
    auditCfg.MaskHeaders = []string{"Authorization", "Cookie"}
    auditCfg.SanitizeError = true
    auditCfg.OnAudit = func(event httpc.AuditEvent) {
        data, _ := json.Marshal(event)
        log.Printf("[AUDIT] %s", data)
    }
    auditMiddleware := httpc.AuditMiddleware(auditCfg)

    cfg := httpc.DefaultConfig()
    cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
        httpc.RecoveryMiddleware(),                              // panic リカバリ
        httpc.TimeoutMiddleware(&httpc.TimeoutMiddlewareConfig{Duration: 30 * time.Second}), // 強制タイムアウト
        httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),                            // リクエスト ID
        httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: func(format string, args ...any) {
            log.Printf("[HTTP] "+format, args...)
        }}),
        metricsMiddleware,
        auditMiddleware,
    }

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    _, err = client.Get("https://httpbin.org/get")
    if err != nil {
        log.Fatal(err)
    }

    log.Printf("総リクエスト数：%d", atomic.LoadInt64(&requestCount))
}
```

## リクエスト/レスポンスコールバック

完全なミドルウェアが不要な場合、`WithOnRequest` / `WithOnResponse` の 2 つのリクエスト単位コールバックで、軽量な観測とデバッグの要件をカバーできます——送信前には変更可能なリクエストを、完了後には読み取り可能なレスポンスを取得できます：

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

    onRequest := func(req httpc.RequestMutator) error {
        fmt.Printf("[リクエスト] %s %s（%d 個のヘッダー付き）\n",
            req.Method(), req.URL(), len(req.Headers()))
        return nil // nil 以外の error を返すとリクエストは中止される
    }

    onResponse := func(resp httpc.ResponseMutator) error {
        fmt.Printf("[レスポンス] %d %s、所要時間 %v、試行 %d 回\n",
            resp.StatusCode(), resp.Status(), resp.Duration(), resp.Attempts())
        return nil
    }

    result, err := client.Get("https://httpbin.org/get",
        httpc.WithOnRequest(onRequest),
        httpc.WithOnResponse(onResponse),
        httpc.WithQuery("test", "callbacks"),
    )
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("ステータスコード:", result.StatusCode()) // 出力：ステータスコード: 200
}
```

ミドルウェアとの役割分担：コールバックは**単一リクエスト**向けの手軽なフックです（ログ、デバッグ、簡単なメトリクス）；全リクエスト横断で、コンポーザブルかつリクエストをショートサーキットできるパイプライン処理が必要な場合は、[ミドルウェアチェーン](../guides/middleware-chain)を使ってください。

## REST API クライアントラッパー

```go
package main

import (
    "context"
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

type APIClient struct {
    dc httpc.DomainClienter
}

type User struct {
    ID   int    `json:"id"`
    Name string `json:"name"`
}

func NewAPIClient(baseURL, token string) (*APIClient, error) {
    dc, err := httpc.NewDomainDefault(baseURL)
    if err != nil {
        return nil, err
    }
    if err := dc.SetHeader("Authorization", "Bearer "+token); err != nil {
        dc.Close()
        return nil, err
    }
    if err := dc.SetHeader("Accept", "application/json"); err != nil {
        dc.Close()
        return nil, err
    }

    return &APIClient{dc: dc}, nil
}

func (c *APIClient) GetUser(ctx context.Context, id int) (*User, error) {
    result, err := c.dc.Request(ctx, "GET", fmt.Sprintf("/users/%d", id))
    if err != nil {
        return nil, err
    }

    if !result.IsSuccess() {
        return nil, fmt.Errorf("API error: %d", result.StatusCode())
    }

    var user User
    if err := result.Unmarshal(&user); err != nil {
        return nil, err
    }
    return &user, nil
}

func (c *APIClient) CreateUser(ctx context.Context, name string) (*User, error) {
    result, err := c.dc.Request(ctx, "POST", "/users",
        httpc.WithJSON(map[string]string{"name": name}),
    )
    if err != nil {
        return nil, err
    }

    var user User
    if err := result.Unmarshal(&user); err != nil {
        return nil, err
    }
    return &user, nil
}

func (c *APIClient) Close() error {
    return c.dc.Close()
}

func main() {
    api, err := NewAPIClient("https://api.example.com", "my-token")
    if err != nil {
        log.Fatal(err)
    }
    defer api.Close()

    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    // ユーザーの作成
    user, err := api.CreateUser(ctx, "Alice")
    if err != nil {
        log.Fatal(err)
    }
    fmt.Printf("作成：%+v\n", user)

    // ユーザーの取得
    user, err = api.GetUser(ctx, user.ID)
    if err != nil {
        log.Fatal(err)
    }
    fmt.Printf("取得：%+v\n", user)
}
```

## ドメインクライアント（カスタム設定）

`NewDomainDefault(baseURL)` のほかに、`NewDomain(baseURL, cfg)` は完全な `Config` を受け付けます——プリセット、タイムアウト、リトライ、プロキシをすべてカスタマイズできます。ドメインクライアントはセッションヘッダーと Cookie を自動管理し、単発リクエストでセッションヘッダーを一時的に上書きすることもできます：

```go
package main

import (
    "fmt"
    "log"
    "net/http"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    // デフォルト設定をベースにフィールド単位でカスタマイズ
    cfg := httpc.DefaultConfig()
    cfg.Timeouts.Request = 15 * time.Second
    cfg.Retry.MaxRetries = 2
    cfg.Defaults.UserAgent = "domain-client-demo/1.0"

    dc, err := httpc.NewDomain("https://httpbin.org", cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer dc.Close()

    fmt.Println("Base URL:", dc.URL())  // 出力：Base URL: https://httpbin.org
    fmt.Println("Domain:", dc.Domain()) // 出力：Domain: httpbin.org

    // セッションヘッダー：このドメインのすべてのリクエストに自動付与
    if err := dc.SetHeaders(map[string]string{
        "X-API-Version": "v1",
        "X-Client-ID":   "client-123",
    }); err != nil {
        log.Fatal(err)
    }

    // 単発リクエストでセッションヘッダーを上書き、永続セッションには影響しない
    resp, err := dc.Get("/get",
        httpc.WithHeader("X-API-Version", "v2"), // このリクエストのみ有効
    )
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("リクエストステータス:", resp.StatusCode())      // 出力：リクエストステータス: 200
    fmt.Println("セッションヘッダー数:", len(dc.GetHeaders())) // 出力：セッションヘッダー数: 2

    // セッション Cookie を手動注入；レスポンスの Cookie もセッションへ自動マージ
    if err := dc.SetCookies([]*http.Cookie{
        {Name: "session", Value: "abc123"},
    }); err != nil {
        log.Fatal(err)
    }

    resp2, err := dc.Get("/cookies") // セッション Cookie が自動的に送信される
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("2 回目のリクエスト:", resp2.StatusCode()) // 出力：2 回目のリクエスト: 200

    // Session() で基盤の SessionManager を取得（次節でその単独使用法をデモ）
    session := dc.Session()
    session.UpdateFromResult(resp2) // このレスポンスの Cookie をセッションへマージ
    fmt.Println("セッション Cookie 数:", len(session.GetCookies()))
}
```

:::warning 相対パスとオプションの副作用
`path` パラメータに相対パス（`/get` など）を書くだけで baseURL が自動的に結合されます；完全な URL（スキーム付き）はそのまま使用されます。また、ドメインクライアントはリクエストオプションを**2 回実行**します（セッション状態のキャプチャ 1 回、実際のリクエスト 1 回）——カウンターや nonce などの副作用を含むオプションは渡さないでください。
:::

## Cookie の高度な使い方

### Cookie を送信する 5 つの方法

```go
// 1. 単一 Cookie（完全な http.Cookie 構造体、属性を付けられる）
result, err := client.Get("https://httpbin.org/cookies",
    httpc.WithCookie(http.Cookie{
        Name:     "auth_token",
        Value:    "xyz789",
        Path:     "/api",
        Expires:  time.Now().Add(24 * time.Hour),
        Secure:   true,
        HttpOnly: true,
    }),
)

// 2. 一括（推奨、1 回だけシリアライズ）
result, err = client.Get("https://httpbin.org/cookies",
    httpc.WithCookies([]http.Cookie{
        {Name: "session_id", Value: "abc123"},
        {Name: "user_pref", Value: "dark_mode"},
        {Name: "lang", Value: "en"},
    }),
)

// 3. Cookie 文字列（ブラウザの DevTools から直接コピー）
result, err = client.Get("https://httpbin.org/cookies",
    httpc.WithCookieString("cookie1=value1; cookie2=value2"),
)

// 4. Cookie マップ
result, err = client.Get("https://httpbin.org/cookies",
    httpc.WithCookieMap(map[string]string{
        "theme": "dark",
        "lang":  "en",
    }),
)

// 5. 複数方式の組み合わせ
result, err = client.Get("https://httpbin.org/cookies",
    httpc.WithCookieString("session=abc123"),
    httpc.WithCookie(http.Cookie{Name: "manual", Value: "cookie"}),
)
```

### レスポンス Cookie の読み取りと自動管理

```go
result, _ := client.Get("https://httpbin.org/response-headers?Set-Cookie=session=abc123")

fmt.Println(len(result.Response.Cookies))       // 出力例：1（レスポンスが持つ Cookie の数）
if c := result.GetCookie("session"); c != nil { // 名前で正確に検索
    fmt.Println(c.Value) // 出力：abc123
}
fmt.Println(result.HasCookie("nonexistent")) // 出力：false

// クロスリクエストの自動管理：Cookie Jar を有効にすると、レスポンス Cookie は自動保存され、以降のリクエストで自動送信される
cfg := httpc.DefaultConfig()
cfg.Connection.EnableCookies = true
jarClient, _ := httpc.New(cfg)
defer jarClient.Close()

_, _ = jarClient.Get("https://httpbin.org/cookies/set?session=xyz789") // Cookie を Jar へ保存
resp, _ := jarClient.Get("https://httpbin.org/cookies")                 // 自動送信
fmt.Println(resp.StatusCode()) // 出力：200
```

セッションレベルの Cookie とセキュリティ検証（`WithSecureCookie` + `StrictCookieSecurityConfig`）の詳細は[ドメインクライアントとセッション](../guides/domain-session)を参照してください。

## SessionManager スタンドアロンセッション

セッション（永続ヘッダー + Cookie）はドメインクライアントに束縛されず、独立して作成し、任意のリクエストに個別に注入できます。「同一サービスで複数のアイデンティティ」や「リクエストオプションの手動オーケストレーション」に適したシナリオです：

```go
package main

import (
    "fmt"
    "log"
    "net/http"

    "github.com/cybergodev/httpc"
)

func main() {
    session, err := httpc.NewSessionManagerDefault()
    if err != nil {
        log.Fatal(err)
    }

    // 永続ヘッダー：このセッションを使うすべてのリクエストに適用
    if err := session.SetHeader("Authorization", "Bearer my-token"); err != nil {
        log.Fatal(err)
    }
    if err := session.SetHeaders(map[string]string{
        "X-API-Version": "v2",
        "X-Client-ID":   "session-demo",
    }); err != nil {
        log.Fatal(err)
    }

    // 永続 Cookie
    if err := session.SetCookies([]*http.Cookie{
        {Name: "session_id", Value: "abc123"},
        {Name: "preferences", Value: "theme_dark"},
    }); err != nil {
        log.Fatal(err)
    }

    fmt.Println("セッションヘッダー:", len(session.GetHeaders()))   // 出力：セッションヘッダー: 3
    fmt.Println("セッション Cookie:", len(session.GetCookies())) // 出力：セッション Cookie: 2

    if c := session.GetCookie("session_id"); c != nil {
        fmt.Printf("Cookie を発見: %s = %s\n", c.Name, c.Value) // 出力：Cookie を発見: session_id = abc123
    }

    // 選択的削除と全体クリア
    session.DeleteHeader("X-API-Version")
    session.DeleteCookie("preferences")
    fmt.Println("削除後のヘッダー/Cookie:", len(session.GetHeaders()), "/", len(session.GetCookies()))
    // 出力：削除後のヘッダー/Cookie: 2 / 1

    session.ClearHeaders()
    session.ClearCookies()
    fmt.Println("クリア後のヘッダー/Cookie:", len(session.GetHeaders()), "/", len(session.GetCookies()))
    // 出力：クリア後のヘッダー/Cookie: 0 / 0
}
```

## 並列ダウンロード

```go
package main

import (
    "context"
    "fmt"
    "log"
    "sync"
    "sync/atomic"

    "github.com/cybergodev/httpc"
)

func main() {
    urls := map[string]string{
        "file1.zip": "https://example.com/files/file1.zip",
        "file2.zip": "https://example.com/files/file2.zip",
        "file3.zip": "https://example.com/files/file3.zip",
    }

    client, _ := httpc.NewDefault()
    defer client.Close()

    var successCount int64
    var totalBytes int64
    var wg sync.WaitGroup

    for filename, url := range urls {
        wg.Add(1)
        go func(name, u string) {
            defer wg.Done()

            cfg := httpc.DefaultDownloadConfig()
            cfg.FilePath = "/tmp/" + name
            cfg.Overwrite = true
            cfg.ProgressCallback = func(downloaded, total int64, speed float64) {
                fmt.Printf("\r%s: %.1f%% (%s/s)", name,
                    float64(downloaded)/float64(total)*100,
                    float64(speed)/1024/1024)
            }

            result, err := client.Download(context.Background(), u, cfg)
            if err != nil {
                log.Printf("%s ダウンロード失敗: %v", name, err)
                return
            }

            atomic.AddInt64(&successCount, 1)
            atomic.AddInt64(&totalBytes, result.BytesWritten)
            fmt.Printf("\n%s 完了: %d\n", name, result.BytesWritten)
        }(filename, url)
    }

    wg.Wait()
    fmt.Printf("\nダウンロード完了：%d/%d, 合計 %d\n",
        successCount, len(urls), totalBytes)
}
```

## 並列リクエスト：worker pool とセマフォ

大量の URL を一括リクエストする場合、worker pool は並列度を worker 数に固定します；セマフォパターンはタスクの動的な伸縮を許しつつ、同時インフライト数の上限だけを制限します。どちらも同じ `Client` を共有します（HTTPC の Client は並行安全で、コネクションプールが goroutine 間で再利用されます）：

```go
package main

import (
    "fmt"
    "log"
    "net/http"
    "net/http/httptest"
    "sync"
    "sync/atomic"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    // ローカルのモックサーバー：各リクエスト 20ms
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        time.Sleep(20 * time.Millisecond)
        w.WriteHeader(http.StatusOK)
    }))
    defer server.Close()

    cfg := httpc.DefaultConfig()
    cfg.Security.AllowPrivateIPs = true // 127.0.0.1 のローカルサーバーを許可
    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    const (
        numWorkers = 5
        numJobs    = 20
    )

    jobs := make(chan string, numJobs)
    results := make(chan int, numJobs)

    // 固定数の worker がジョブを消費：並列度は常に numWorkers
    var wg sync.WaitGroup
    for w := 0; w < numWorkers; w++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for url := range jobs {
                resp, err := client.Get(url)
                if err != nil {
                    log.Printf("リクエスト失敗: %v", err)
                    results <- 0
                    continue
                }
                results <- resp.StatusCode()
            }
        }()
    }

    start := time.Now()
    for i := 0; i < numJobs; i++ {
        jobs <- fmt.Sprintf("%s/api/item/%d", server.URL, i)
    }
    close(jobs)
    wg.Wait()
    close(results)

    var okCount int64
    for status := range results {
        if status >= 200 && status < 300 {
            okCount++
        }
    }
    fmt.Printf("worker pool：%d/%d 成功、所要時間 %v（直列なら約 %v）\n",
        okCount, numJobs, time.Since(start), numJobs*20*time.Millisecond)
    // 出力例：worker pool：20/20 成功、所要時間約 90ms（直列なら約 400ms）

    // セマフォパターン：goroutine 数は多くてもよいが、インフライトリクエストは最大 maxInFlight 個
    const maxInFlight = 3
    sem := make(chan struct{}, maxInFlight)
    var wg2 sync.WaitGroup
    var okCount2 int64
    start = time.Now()

    for i := 0; i < numJobs; i++ {
        wg2.Add(1)
        go func(id int) {
            defer wg2.Done()
            sem <- struct{}{}
            defer func() { <-sem }()

            resp, err := client.Get(fmt.Sprintf("%s/api/request/%d", server.URL, id))
            if err != nil {
                return
            }
            if resp.IsSuccess() {
                atomic.AddInt64(&okCount2, 1)
            }
        }(i)
    }
    wg2.Wait()
    fmt.Printf("セマフォ：%d/%d 成功、所要時間 %v\n", okCount2, numJobs, time.Since(start))
    // 出力例：セマフォ：20/20 成功、所要時間約 140ms
}
```

:::tip 並列度とコネクションプールの連携
worker 数/セマフォ上限を長期にわたって `Connection.MaxConnsPerHost` を大きく上回らないようにしてください（HTTP/1.1 の場合）。超えるとリクエストがトランスポート層で並び、総スループットはそれ以上向上しません；HTTP/2（デフォルトで有効）では同一ホストの接続が共有されて多重化されるため、影響はより小さくなります。詳細は[パフォーマンス](../guides/performance)を参照してください。
:::

## 構造化エラー処理

`ClientError` は分類（`Code()`/`Type`）、リトライ可否（`IsRetryable()`）、リクエストコンテキスト（URL/Method/Attempts/StatusCode）を保持します。`errors.As` で抽出すれば、分類ごとに異なる処理ブランチへ進められます：

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

    // 1 ナノ秒のタイムアウト：デモ用に確実にタイムアウトエラーを発生させる
    _, err = client.Get("https://httpbin.org/get",
        httpc.WithTimeout(1*time.Nanosecond),
    )
    if err == nil {
        log.Fatal("expected timeout error")
    }

    // errors.Is：センチネルエラーの判定（context エラーは Unwrap 経由で透過）
    switch {
    case errors.Is(err, context.DeadlineExceeded):
        fmt.Println("リクエストタイムアウト、タイムアウトの緩和かネットワーク確認を検討")
    case errors.Is(err, context.Canceled):
        fmt.Println("リクエストがキャンセルされた")
    }

    // errors.As：構造化エラーの抽出
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        fmt.Println("Code:", clientErr.Code())         // 出力：Code: TIMEOUT
        fmt.Println("Method:", clientErr.Method)        // 出力：Method: GET
        fmt.Println("Attempts:", clientErr.Attempts)    // 出力：Attempts: 1
        fmt.Println("Retryable:", clientErr.IsRetryable()) // 出力：Retryable: false

        switch clientErr.Code() {
        case "TIMEOUT":
            fmt.Println("→ 分岐：タイムアウト、バジェットを緩めてからリトライ可能")
        case "NETWORK_ERROR", "DNS_ERROR":
            fmt.Println("→ 分岐：ネットワーク/DNS 障害、接続性を確認")
        case "TLS_ERROR", "CERTIFICATE":
            fmt.Println("→ 分岐：証明書の問題、CA とシステム時刻を検証")
        case "RETRY_EXHAUSTED":
            fmt.Println("→ 分岐：リトライ枯渇、フォールバックロジックへ移行")
        }
    }
}
```

HTTP ステータスコードエラー（4xx/5xx レスポンスは `HTTP_ERROR` に分類）も同様に `clientErr.StatusCode` を持ちます；`Cause` フィールドは基盤のエラーを保持し、`errors.Unwrap` でさらに掘り下げられます。エラー分類の全表は[エラー処理](../guides/error-handling)と[エラータイプ](../api-reference/types/errors)を参照してください。

## レスポンスのディスク書き込み：SaveToFile と Download

小さなレスポンスボディがすでにメモリにあるなら `SaveToFile` の 1 行でディスクに書き込めます；大きなファイルは `Download` でストリーミング書き込みを行い、進捗/レジューム/チェックサム検証に対応します：

```go
package main

import (
    "context"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // レスポンスボディはすでにメモリにある：そのままディスクへ保存（パスは Download と同じ安全検証を通る）
    result, err := client.Get("https://httpbin.org/get")
    if err != nil {
        log.Fatal(err)
    }
    if err := result.SaveToFile("response.json"); err != nil {
        log.Fatal(err)
    }

    // 大きなファイル：Download でストリーミング書き込み + SHA-256 検証（不一致ならファイルを自動削除）
    cfg := httpc.DefaultDownloadConfig()
    cfg.FilePath = "large-file.bin"
    cfg.Overwrite = true
    cfg.Checksum = "リリースマニフェストなど信頼できる経路から取得した SHA-256 hex"

    if _, err := client.Download(
        context.Background(), // キャンセル/タイムアウトが不要な場合は Background を渡す、nil を渡さない
        "https://example.com/large-file.bin",
        cfg,
    ); err != nil {
        log.Fatal(err)
    }
    log.Println("保存完了")
}
```

## デフォルトクライアント管理

パッケージレベル関数（`httpc.Get` など）の背後には、遅延初期化される共有デフォルトクライアントが 1 つあります。`SetDefaultClient` でカスタム設定のインスタンスに置き換えると（古いインスタンスは自動クローズ）、グローバルな呼び出しがすべて新しい設定で実行されます：

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    // デフォルト設定から出発し、必要なフィールドのみ変更
    cfg := httpc.DefaultConfig()
    cfg.Timeouts.Request = 5 * time.Second
    cfg.Retry.MaxRetries = 0

    customClient, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }

    // デフォルトクライアントへ設定：以降のパッケージレベル関数はすべて新設定を使用（旧デフォルトクライアントは自動クローズ）
    if err := httpc.SetDefaultClient(customClient); err != nil {
        log.Fatal(err)
    }

    result, err := httpc.Get("https://httpbin.org/get") // 5s タイムアウト、0 リトライを使用
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(result.StatusCode()) // 出力：200

    // 後片付け：デフォルトクライアントをクローズしてコネクションプールを解放
    if err := httpc.CloseDefaultClient(); err != nil {
        log.Fatal(err)
    }
}
```

適したシナリオ：アプリケーション起動時にグローバル動作を統一してカスタマイズする、環境（開発/本番）ごとに設定を切り替える。なお `SetDefaultClient` は `httpc.New` で作成したクライアントのみを受け付け、クローズ済みインスタンスは渡せない点に注意してください。

## カスタムミドルウェア：リクエスト署名

```go
package main

import (
    "context"
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func SigningMiddleware(secret string) httpc.MiddlewareFunc {
    return func(next httpc.Handler) httpc.Handler {
        return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
            timestamp := time.Now().Unix()
            message := fmt.Sprintf("%s%s%d", req.Method(), req.URL(), timestamp)

            mac := hmac.New(sha256.New, []byte(secret))
            mac.Write([]byte(message))
            signature := hex.EncodeToString(mac.Sum(nil))

            req.SetHeader("X-Timestamp", fmt.Sprintf("%d", timestamp))
            req.SetHeader("X-Signature", signature)

            return next(ctx, req)
        }
    }
}

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
        httpc.RecoveryMiddleware(),
        SigningMiddleware("my-secret-key"),
    }

    client, _ := httpc.New(cfg)
    defer client.Close()

    result, err := client.Get("https://api.example.com/protected")
    if err != nil {
        log.Fatal(err)
    }
    log.Println(result.StatusCode())
}
```

## 次のステップ

- [ミドルウェアチェーン](../guides/middleware-chain) - ミドルウェアアーキテクチャの詳細解説
- [リトライとフォールトトレランス](../guides/retry-fault-tolerance) - カスタムリトライポリシー
- [ドメインクライアントとセッション](../guides/domain-session) - セッションと Cookie の掘り下げ
- [ファイルアップロードとダウンロード](../guides/file-transfer) - ダウンロードのセマンティクスとチェックサム
- [パフォーマンス](../guides/performance) - 並列モデルとパフォーマンスチューニング
- [テストガイド](../guides/testing) - httptest と Doer モック
