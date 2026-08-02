---
sidebar_label: "関数とメソッド"
title: "パッケージ関数とクライアントメソッド - CyberGo HTTPC | HTTP メソッド API"
description: "HTTPC パッケージ関数 API リファレンス：Get/Post など 7 種の HTTP メソッド、New クライアント作成、Download 統合ダウンロードエントリ、FormatBytes/FormatSpeed ユーティリティ、NewDomain ドメインクライアント作成をリクエストオプションと組み合わせて柔軟な設定を実現。"
sidebar_position: 1
---

# パッケージ関数とクライアントメソッド

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
func New(cfg Config) (Client, error)
```

新しい HTTP クライアントを作成します。`Config` 値を渡します（`DefaultConfig()` やプリセット関数で取得してから必要に応じて変更することを推奨）。設定が無効な場合はエラーを返します（例：無効な `SecurityConfig.SSRFExemptCIDRs`）。

```go
// デフォルト設定を使用（NewDefault() でも同じ）
client, err := httpc.New(httpc.DefaultConfig())

// プリセット設定を使用
client, err := httpc.New(httpc.SecureConfig())

// カスタム設定を使用
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 60 * time.Second
client, err := httpc.New(cfg)
```

### NewDefault

```go
func NewDefault() (Client, error)
```

便利なコンストラクタ。`New(DefaultConfig())` と同等です。設定なしのシナリオで推奨されるエントリポイントです。

```go
client, err := httpc.NewDefault()
defer func() { _ = client.Close() }()
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
client, _ := httpc.NewDefault()
defer client.Close()
```

## デフォルトクライアント管理

### SetDefaultClient

```go
func SetDefaultClient(client Client) error
```

カスタムクライアントをデフォルトクライアントとして設定します。パッケージレベル関数で使用されます。古いデフォルトクライアントは自動的にクローズされます。

:::warning 警告
`httpc.New()` または `httpc.NewDefault()` で作成されたクライアントのみ受け付けます。クローズ済みのクライアントは設定できません。
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

パッケージレベルのダウンロード関数はデフォルトクライアントを使用します。Client インターフェースと DomainClient も同名のメソッドを提供し、3 つのシグネチャは同一です。

### Download

```go
func Download(ctx context.Context, url string, cfg *DownloadConfig, options ...RequestOption) (*DownloadResult, error)
```

`Download` はパッケージレベル関数、`Client` インターフェース、`DomainClient` を貫く**唯一の正規ダウンロードエントリ**であり、これまでの `{config}` × `{context}` のバリアント群を単一のシグネチャに置き換えます。

`cfg` を nil にすることはできず、`cfg.FilePath` の設定が必須です（未設定の場合は `ErrEmptyFilePath` を返します）。キャンセルやタイムアウト制御が不要な場合は `context.Background()` を渡します。リクエストオプションはリクエストヘッダー、認証、クエリパラメータなどの設定に使用します。

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/file.zip"
cfg.Overwrite = true
cfg.ResumeDownload = true
cfg.ProgressCallback = func(downloaded, total int64, speed float64) {
    fmt.Printf("\r%.1f%%", float64(downloaded)/float64(total)*100)
}

// パッケージレベル関数（デフォルトクライアントを使用）
result, err := httpc.Download(context.Background(), url, cfg)

// Client インターフェースメソッド
result, err = client.Download(ctx, url, cfg)

// DomainClient メソッド（path は baseURL に対して相対、レスポンス Cookie を自動キャプチャ）
result, err = dc.Download(ctx, "/files/report.pdf", cfg)
```

:::tip ヒント
古いダウンロード関数（DownloadFile、DownloadWithOptions、DownloadFileWithContext、DownloadWithOptionsWithContext）は v1.5.2 で削除されました。統一的に `Download(ctx, url, cfg, options...)` を使用し、パス、上書き、レジューム、チェックサムは `DownloadConfig` で設定してください。
:::

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

:::warning 警告
この関数は主にテスト用です。本番環境では警告を抑制するのではなく、`SecureConfig()` または `DefaultConfig()` を使用してください。
:::

## フォーマットツール

### FormatBytes

```go
func FormatBytes(bytes int64) string
```

バイト数を人間が読める文字列にフォーマットします（例：`"1.50 KB"`、`"500 B"`）。ダウンロード結果の表示やログ出力でよく使用します。

```go
result, _ := httpc.Download(context.Background(), url, cfg)
fmt.Printf("ダウンロード済み %s\n", httpc.FormatBytes(result.BytesWritten))
// ダウンロード済み 12.34 MB
```

| 入力 | 出力 |
|------|------|
| `500` | `500 B` |
| `1536` | `1.50 KB` |
| `1048576` | `1.00 MB` |
| `1073741824` | `1.00 GB` |

### FormatSpeed

```go
func FormatSpeed(bytesPerSecond float64) string
```

バイト/秒の速度を人間が読める文字列にフォーマットします（例：`"1.50 MB/s"`）。`DownloadResult.AverageSpeed` や `DownloadProgressCallback` の `speed` 引数と組み合わせてよく使用します。

```go
result, _ := httpc.Download(context.Background(), url, cfg)
fmt.Printf("平均速度 %s\n", httpc.FormatSpeed(result.AverageSpeed))
// 平均速度 5.67 MB/s

// 進捗コールバック内で使用
cfg.ProgressCallback = func(downloaded, total int64, speed float64) {
    fmt.Printf("\r%s / %s (%s)",
        httpc.FormatBytes(downloaded),
        httpc.FormatBytes(total),
        httpc.FormatSpeed(speed),
    )
}
```

| 入力（バイト/秒） | 出力 |
|------------------|------|
| `500` | `500 B/s` |
| `1536` | `1.50 KB/s` |
| `1048576` | `1.00 MB/s` |

:::tip ヒント
両者ともバイナリ単位（1024 倍）を採用し、単位の並びは `B → KB → MB → GB → TB → PB → EB` です。
:::

## ドメインクライアント

### NewDomain

```go
func NewDomain(baseURL string, cfg Config) (DomainClienter, error)
```

ドメインスコープクライアントを作成します。Cookie とヘッダーを自動管理します。`Config` 値を渡します（Cookie は自動的に有効になります）。

```go
dc, err := httpc.NewDomain("https://api.example.com", httpc.DefaultConfig())
defer dc.Close()

dc.SetHeader("Authorization", "Bearer "+token)
result, err := dc.Get("/users")
```

### NewDomainDefault

```go
func NewDomainDefault(baseURL string) (DomainClienter, error)
```

便利なコンストラクタ。`NewDomain(baseURL, DefaultConfig())` と同等です。

```go
dc, err := httpc.NewDomainDefault("https://api.example.com")
defer dc.Close()
```

## 関連項目

- [Result](./result) - レスポンス結果タイプとメソッド
- [リクエストオプション](./options) - リクエスト設定オプション
- [ドメインクライアント](../client-config/domain-client) - ドメインスコープクライアント
- [ファイルダウンロード](../client-config/download) - ダウンロード関数とタイプ
