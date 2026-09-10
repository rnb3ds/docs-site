---
sidebar_label: "基本サンプル"
title: "基本的な使い方 - CyberGo HTTPC | 実行可能なサンプル"
description: "HTTPC 基本使用例集：GET/POST/PUT/DELETE/HEAD/PATCH 全メソッドの例、XML とバイナリリクエストボディ、クエリパラメータと認証、ステータス判定と Result トリプル、DefaultConfig カスタム設定、プロキシ、ミドルウェア、進捗コールバック付きダウンロードの完全コード。"
sidebar_position: 1
---

# 基本的な使い方

## GET リクエスト

### 基本 GET

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    result, err := httpc.Get("https://httpbin.org/get")
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println(result.StatusCode()) // 200
    fmt.Println(result.Body())
}
```

### クエリパラメータ付き

```go
result, err := httpc.Get("https://httpbin.org/get",
    httpc.WithQuery("name", "test"),
    httpc.WithQuery("page", 1),
    httpc.WithQueryMap(map[string]any{
        "limit": 10,
        "sort":  "desc",
    }),
)
```

### 認証付き

```go
result, err := httpc.Get("https://api.example.com/me",
    httpc.WithBearerToken("my-token"),
)
```

Bearer トークンのほかに、よく使われる認証/リクエストヘッダーの方式が 3 つあります：

```go
// Basic 認証
result, err := httpc.Get("https://api.example.com/me",
    httpc.WithBasicAuth("username", "password"),
)

// API キー（カスタムリクエストヘッダー形式）
result, err := httpc.Get("https://api.example.com/me",
    httpc.WithHeader("X-API-Key", "your-api-key"),
)

// ヘッダーの一括設定 + カスタム User-Agent
result, err = httpc.Get("https://api.example.com/me",
    httpc.WithHeaderMap(map[string]string{
        "X-API-Version": "v1",
        "X-Client-ID":   "client-123",
    }),
    httpc.WithUserAgent("MyApp/1.0"),
)
```

## POST リクエスト

### JSON ボディ

```go
data := map[string]any{
    "name":  "John",
    "email": "john@example.com",
}

result, err := httpc.Post("https://httpbin.org/post",
    httpc.WithJSON(data),
)
if err != nil {
    log.Fatal(err)
}

// JSON レスポンスの解析
var response map[string]any
if err := result.Unmarshal(&response); err != nil {
    log.Fatal(err)
}
fmt.Println(response)
```

### フォーム送信

```go
result, err := httpc.Post("https://httpbin.org/post",
    httpc.WithForm(map[string]string{
        "username": "admin",
        "password": "secret",
    }),
)
```

### ファイルアップロード

```go
fileContent, _ := os.ReadFile("document.pdf")

result, err := httpc.Post("https://httpbin.org/post",
    httpc.WithFile("file", "document.pdf", fileContent),
)
```

### マルチフィールドフォーム

```go
form := &httpc.FormData{
    Fields: map[string]string{
        "title": "My Document",
        "type":  "pdf",
    },
    Files: map[string]*httpc.FileData{
        "file": {
            Filename: "report.pdf",
            Content:  fileContent,
        },
    },
}

result, err := httpc.Post("https://api.example.com/upload",
    httpc.WithFormData(form),
)
```

### XML ボディ

```go
type Person struct {
    XMLName xml.Name `xml:"person"`
    Name    string   `xml:"name"`
    Age     int      `xml:"age"`
}

result, err := httpc.Post("https://httpbin.org/post",
    httpc.WithXML(Person{Name: "Jane", Age: 28}),
)
if err != nil {
    log.Fatal(err)
}
fmt.Println(result.StatusCode()) // 200
```

### プレーンテキストとバイナリ

文字列のリクエストボディは自動的に `text/plain` として送信されます；バイナリデータには MIME タイプの明示指定を推奨します：

```go
// プレーンテキスト：Content-Type は自動的に text/plain
result, err := httpc.Post("https://httpbin.org/post",
    httpc.WithBody("Hello, this is plain text!"),
)

// バイナリ：Content-Type はオプション引数
pngHeader := []byte{0x89, 0x50, 0x4E, 0x47}
result, err = httpc.Post("https://httpbin.org/post",
    httpc.WithBinary(pngHeader, "image/png"),
)
```

### ボディタイプの強制指定（BodyKind）

`WithBody` はデフォルトで入力型からエンコーディングを推論しますが、第 2 引数で強制指定できます：

```go
// map は JSON エンコードへ強制される（汎用フォーマット分岐は通らない）
result, err := httpc.Post("https://httpbin.org/post",
    httpc.WithBody(map[string]string{"key": "value"}, httpc.BodyJSON),
)
```

## その他の HTTP メソッド

PUT、DELETE、HEAD、PATCH、OPTIONS、そして汎用 `Request` まで、すべて利用できます。以下は全メソッドを網羅する完全な例です：

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

    // PUT：リソース全体を置換
    put, err := client.Put("https://httpbin.org/put",
        httpc.WithJSON(map[string]string{"name": "Jane", "status": "active"}),
        httpc.WithBearerToken("your-token"),
    )
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("PUT:", put.StatusCode()) // 出力：PUT: 200

    // DELETE：リソースの削除
    del, err := client.Delete("https://httpbin.org/delete",
        httpc.WithHeader("X-Request-ID", "delete-123"),
    )
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("DELETE:", del.StatusCode()) // 出力：DELETE: 200

    // HEAD：レスポンスヘッダーのみ取得（ボディなし）、リソースの存在とサイズ確認に適する
    head, err := client.Head("https://httpbin.org/get")
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("HEAD:", head.StatusCode())                                 // 出力：HEAD: 200
    fmt.Println("Content-Type:", head.Response.Headers.Get("Content-Type")) // 出力：Content-Type: application/json

    // PATCH：部分更新（変化したフィールドのみ送信）
    patch, err := client.Patch("https://httpbin.org/patch",
        httpc.WithJSON(map[string]string{"status": "inactive"}),
    )
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("PATCH:", patch.StatusCode()) // 出力：PATCH: 200

    // OPTIONS：サーバー側の許可メソッドを検出（CORS プリフライトと同じ）
    opt, err := client.Options("https://httpbin.org/post")
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("OPTIONS:", opt.StatusCode()) // 出力：OPTIONS: 200
}
```

メソッド早見表：

| メソッド | リクエストボディ | べき等 | 典型的な用途 |
|------|:---:|:---:|----------|
| GET | なし | あり | リソースの取得 |
| HEAD | なし | あり | レスポンスヘッダーのみ取得（存在/サイズ/キャッシュメタ情報の確認） |
| POST | あり | なし | リソースの作成、データの送信 |
| PUT | あり | あり | リソース全体の置換 |
| PATCH | あり | なし | 部分更新 |
| DELETE | なし | あり | リソースの削除 |
| OPTIONS | なし | あり | 許可メソッドの検出 |

### 汎用 Request メソッド

HTTP メソッドが実行時にしか決まらない場合（設定、リクエストビルダー、プロキシ転送などからの指定）は、`Request(ctx, method, url, options...)` を使います：

```go
ctx := context.Background()

for _, m := range []struct{ method, url string }{
    {"GET", "https://httpbin.org/get"},
    {"POST", "https://httpbin.org/post"},
    {"PUT", "https://httpbin.org/put"},
} {
    resp, err := client.Request(ctx, m.method, m.url,
        httpc.WithJSON(map[string]string{"key": "value"}),
    )
    if err != nil {
        log.Printf("%s error: %v", m.method, err)
        continue
    }
    fmt.Printf("%s %s -> %d\n", m.method, m.url, resp.StatusCode())
}
```

## レスポンス処理

各リクエストが返す `*Result` は「リクエスト/レスポンス/メタデータ」のトリプルです。ネストした 3 つの構造が一度のアロケーションで確保され、同じメモリを共有します：

| グループ | 主なフィールド | 説明 |
|------|----------|------|
| `result.Request` | `URL` / `Method` / `Headers` / `Cookies` | 実際に送信されたリクエスト情報 |
| `result.Response` | `StatusCode` / `Status` / `Proto` / `Headers` / `Body` / `RawBody` / `ContentLength` / `Cookies` | レスポンスデータ |
| `result.Meta` | `Duration` / `Attempts` / `RedirectCount` / `RedirectChain` / `ProxyURL` | 実行メタデータ（リトライ回数、リダイレクトチェーンなど） |

### ステータス判定

```go
result, err := client.Get("https://httpbin.org/get")
if err != nil {
    log.Fatal(err) // ネットワーク層のエラー（DNS、タイムアウト、接続失敗など）
}

switch {
case result.IsSuccess():     // 2xx
    fmt.Println("成功")
case result.IsRedirect():    // 3xx（リダイレクト未追従の場合）
    fmt.Println("リダイレクト先:", result.Response.Headers.Get("Location"))
case result.IsClientError(): // 4xx
    fmt.Println("クライアントエラー、リクエストパラメータ/認証を確認")
    if result.StatusCode() == http.StatusTooManyRequests {
        fmt.Println("レートリミット中、後で再試行:", result.Response.Headers.Get("Retry-After"))
    }
case result.IsServerError(): // 5xx
    fmt.Println("サーバーエラー、リトライが有効な可能性あり")
}
```

:::tip err とステータスコードは別層のエラー
ネットワーク層の失敗（DNS、タイムアウト、TLS）は `err != nil` として現れます；HTTP 4xx/5xx は `err` に**含まれません**——レスポンスは正常に返るため、`IsSuccess()` などのメソッドで自分で判定します。2 層を分けて処理するのが最も一般的な正しい使い方です。
:::

### Body / RawBody / String の使い分け

| メソッド | 戻り値 | 適した用途 |
|------|------|------|
| `result.Body()` | `string`（事前保持） | テキストをそのまま読む；追加オーバーヘッドなし |
| `result.RawBody()` | `[]byte`（生データ） | バイトスライスを必要とする API へ渡す（ハッシュ、再デコード） |
| `result.String()` | フォーマット済みサマリー | デバッグ出力（ステータス、ヘッダー、ボディ概要を含む）；オーバーヘッド最大、ホットパスには置かない |

```go
result, _ := client.Get("https://httpbin.org/get")

fmt.Println(len(result.Body()))     // 出力例：268（ボディの長さ）
fmt.Println(len(result.RawBody()))  // 出力例：268（同じデータのバイトビュー）
fmt.Println(result.Meta.Attempts)   // 出力：1（リトライすると増加）
fmt.Println(result.Meta.RedirectCount) // 出力：0（リダイレクトを追従した場合は 0 より大きい）
```

## クライアントの作成

### カスタム設定

```go
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 60 * time.Second
cfg.Retry.MaxRetries = 5
cfg.Retry.Delay = 2 * time.Second
cfg.Retry.BackoffFactor = 2.0
cfg.Retry.EnableJitter = true

client, err := httpc.New(cfg)
if err != nil {
    log.Fatal(err)
}
defer client.Close()
```

### プロキシ設定

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyURL = "http://proxy:8080"

client, _ := httpc.New(cfg)
```

## ミドルウェア

### ログ + リカバリ

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.RecoveryMiddleware(),
    httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: log.Printf}),
}
cfg.Defaults.UserAgent = "my-app/1.0"

client, _ := httpc.New(cfg)
```

### リクエスト ID + メトリクス

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),
    httpc.MetricsMiddleware(&httpc.MetricsConfig{OnMetrics: func(method, url string, statusCode int, duration time.Duration, err error) {
        metrics.Record(method, statusCode, duration)
    }}),
}

client, _ := httpc.New(cfg)
```

## ファイルダウンロード

```go
client, _ := httpc.NewDefault()
defer client.Close()

cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/file.zip"
cfg.Overwrite = true
cfg.ProgressCallback = func(downloaded, total int64, speed float64) {
    pct := float64(downloaded) / float64(total) * 100
    fmt.Printf("\rダウンロード中：%.1f%% (%.2f MB/s)", pct, float64(speed)/1024/1024)
}

result, err := client.Download(context.Background(), "https://example.com/file.zip", cfg)
if err != nil {
    log.Fatal(err)
}

fmt.Printf("\nダウンロード完了: %d bytes, 所要時間 %v, 平均速度 %.2f MB/s\n",
    result.BytesWritten,
    result.Duration,
    float64(result.AverageSpeed)/1024/1024,
)
```

## ドメインクライアント

```go
dc, err := httpc.NewDomainDefault("https://api.example.com")
if err != nil {
    log.Fatal(err)
}
defer dc.Close()

// セッション情報の設定
dc.SetHeader("Authorization", "Bearer "+token)
dc.SetHeader("Accept", "application/json")

// リクエストには自動的にセッションヘッダーと Cookie が付与される
users, _ := dc.Get("/users")
user, _ := dc.Get("/users/1")

fmt.Println(users.StatusCode()) // 200
```

## 次のステップ

- [高度な使用例](./advanced-usage) - カスタムリトライ、ミドルウェアチェーン、並列ダウンロード
- [リクエストとレスポンス](../guides/request-response) - リクエストオプションの詳細
- [ドメインクライアントとセッション](../guides/domain-session) - セッション管理
