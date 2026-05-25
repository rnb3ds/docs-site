---
title: "パッケージ関数 - HTTPC"
description: "HTTPC パッケージレベル関数とクライアントメソッド API リファレンス：Get/Post など 7 種類の HTTP メソッド、New クライアント作成、4 つのダウンロード関数、SetSecurityWarnOutput セキュリティ警告と NewDomain ドメインクライアント作成。"
---

# パッケージ関数

## パッケージレベル HTTP メソッド

クライアントを作成せず、直接リクエストを送信します。内部的に遅延初期化されたデフォルトクライアントを使用します。

### Get

```go
func Get(url string, options ...RequestOption) (*Result, error)
```

GET リクエストを送信します。

```go
result, err := httpc.Get("https://api.example.com/data",
    httpc.WithBearerToken(token),
    httpc.WithQuery("page", 1),
)
```

### Post

```go
func Post(url string, options ...RequestOption) (*Result, error)
```

POST リクエストを送信します。

```go
result, err := httpc.Post("https://api.example.com/users",
    httpc.WithJSON(map[string]any{"name": "test"}),
)
```

### Put / Patch / Delete / Head / Options

```go
func Put(url string, options ...RequestOption) (*Result, error)
func Patch(url string, options ...RequestOption) (*Result, error)
func Delete(url string, options ...RequestOption) (*Result, error)
func Head(url string, options ...RequestOption) (*Result, error)
func Options(url string, options ...RequestOption) (*Result, error)
```

### Request

```go
func Request(ctx context.Context, method, url string, options ...RequestOption) (*Result, error)
```

コンテキスト付きの汎用リクエストメソッド。タイムアウトとキャンセル制御に対応します。

```go
ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()

result, err := httpc.Request(ctx, "GET", "https://api.example.com/data")
```

## クライアントメソッド

Client インターフェースはパッケージレベル関数と同じ HTTP メソッドに加え、コンテキスト付きの `Request` メソッドを提供します。

### New

```go
func New(config ...*Config) (Client, error)
```

新しい HTTP クライアントを作成します。設定を渡さない、または `nil` を渡すと `DefaultConfig()` を使用します。

```go
client, err := httpc.New()
client, err := httpc.New(nil)
client, err := httpc.New(httpc.SecureConfig())

cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 60 * time.Second
client, err := httpc.New(cfg)
```

### クライアント HTTP メソッド

```go
result, err := client.Get(url, options...)
result, err := client.Post(url, options...)
result, err := client.Put(url, options...)
result, err := client.Patch(url, options...)
result, err := client.Delete(url, options...)
result, err := client.Head(url, options...)
result, err := client.Options(url, options...)
result, err := client.Request(ctx, "GET", url, options...)
```

### Close

Client インターフェースのメソッド。クライアントが保持するリソース（コネクションプール、Transport）を解放します。呼び出し後は使用できません。

```go
// Client インターフェースメソッド
Close() error
```

```go
client, _ := httpc.New()
defer client.Close()
```

## デフォルトクライアント管理

### SetDefaultClient

```go
func SetDefaultClient(client Client) error
```

カスタムクライアントをデフォルトクライアントとして設定します。パッケージレベル関数で使用されます。古いデフォルトクライアントは自動的にクローズされます。

:::warning
`httpc.New()` で作成されたクライアントのみ受け付けます。クローズ済みのクライアントは設定できません。
:::

```go
client, _ := httpc.New(httpc.PerformanceConfig())
httpc.SetDefaultClient(client)

// 以降のパッケージレベル関数は PerformanceConfig を使用
result, _ := httpc.Get(url)
```

### CloseDefaultClient

```go
func CloseDefaultClient() error
```

デフォルトクライアントをクローズしてリセットします。次回パッケージレベル関数を呼び出す際に新しいクライアントが作成されます。

## ダウンロード関数

パッケージレベルのダウンロード関数はデフォルトクライアントを使用します。Client インターフェースも同名のメソッドを提供します。

### DownloadFile

```go
func DownloadFile(url string, filePath string, options ...RequestOption) (*DownloadResult, error)
```

デフォルトクライアントを使用してファイルを指定パスにダウンロードします。

```go
// パッケージ関数
result, err := httpc.DownloadFile("https://example.com/file.zip", "/tmp/file.zip")

// Client インターフェースメソッド
result, err := client.DownloadFile("https://example.com/file.zip", "/tmp/file.zip")
```

### DownloadWithOptions

```go
func DownloadWithOptions(url string, downloadOpts *DownloadConfig, options ...RequestOption) (*DownloadResult, error)
```

設定付きのファイルダウンロード。レジュームと進捗コールバックに対応します。

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/file.zip"
cfg.Overwrite = true
cfg.ResumeDownload = true
cfg.ProgressCallback = func(downloaded, total int64, speed float64) {
    fmt.Printf("\r%.1f%%", float64(downloaded)/float64(total)*100)
}

// パッケージ関数
result, err := httpc.DownloadWithOptions(url, cfg)
// Client インターフェースメソッド
result, err = client.DownloadWithOptions(url, cfg)
```

### DownloadFileWithContext

```go
func DownloadFileWithContext(ctx context.Context, url string, filePath string, options ...RequestOption) (*DownloadResult, error)
```

コンテキスト制御付きのファイルダウンロード。タイムアウトとキャンセルに対応します。

```go
// パッケージ関数
result, err := httpc.DownloadFileWithContext(ctx, url, "/tmp/file.zip")
// Client インターフェースメソッド
result, err = client.DownloadFileWithContext(ctx, url, "/tmp/file.zip")
```

### DownloadWithOptionsWithContext

```go
func DownloadWithOptionsWithContext(ctx context.Context, url string, downloadOpts *DownloadConfig, options ...RequestOption) (*DownloadResult, error)
```

設定とコンテキスト制御付きのファイルダウンロード。

```go
// パッケージ関数
result, err := httpc.DownloadWithOptionsWithContext(ctx, url, downloadOpts)
// Client インターフェースメソッド
result, err = client.DownloadWithOptionsWithContext(ctx, url, downloadOpts)
```

## ヘルパー関数

### SetSecurityWarnOutput

```go
func SetSecurityWarnOutput(w io.Writer)
```

セキュリティ警告の出力先をリダイレクトします（`TestingConfig`、`InsecureSkipVerify` の警告など）。`io.Discard` を渡すと全警告を抑制できます。

```go
// 全セキュリティ警告を抑制
httpc.SetSecurityWarnOutput(io.Discard)

// カスタムログにリダイレクト
httpc.SetSecurityWarnOutput(log.Writer())
```

:::warning
この関数は主にテスト用です。本番環境では警告を抑制するのではなく、`SecureConfig()` または `DefaultConfig()` を使用してください。
:::

## ドメインクライアント

### NewDomain

```go
func NewDomain(baseURL string, config ...*Config) (DomainClienter, error)
```

ドメインスコープクライアントを作成します。Cookie とヘッダーを自動管理します。

```go
dc, err := httpc.NewDomain("https://api.example.com")
defer dc.Close()

dc.SetHeader("Authorization", "Bearer "+token)
result, err := dc.Get("/users")
```

## 関連項目

- [Result](./result) - レスポンス結果タイプとメソッド
- [リクエストオプション](./options) - リクエスト設定オプション
- [ドメインクライアント](./domain-client) - ドメインスコープクライアント
- [ファイルダウンロード](./download) - ダウンロード関数とタイプ
