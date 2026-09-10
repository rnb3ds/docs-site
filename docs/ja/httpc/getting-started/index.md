---
sidebar_label: "クイックスタート"
title: "クイックスタート - CyberGo HTTPC | 5 分で使い始める"
description: "HTTPC クイックスタートガイド：go get でインストール、GET/POST リクエスト送信とレスポンス処理、5 種の設定プリセット選択、JSON 解析と型バインディング、Bearer Token 認証と ClientError エラー分類処理。5 分で安全な HTTP クライアントライブラリを使いこなせます。"
sidebar_position: 1
---

# クイックスタート

## インストール

```bash
# 1. プロジェクトを作成して Go モジュールを初期化（既存プロジェクトではこの手順を省略）
mkdir httpc-demo && cd httpc-demo
go mod init example.com/httpc-demo

# 2. 依存関係を追加
go get github.com/cybergodev/httpc
```

コードでインポートします：

```go
import "github.com/cybergodev/httpc"
```

HTTPC には Go 1.25 以上が必要です。`golang.org/x/sys` 以外にサードパーティ依存はなく、設定なしで最初のリクエストを送信できます。

## 基本的なリクエスト

クライアントを作成せず、パッケージ関数を直接使用します：

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
    fmt.Println(result.Body())       // レスポンス内容
}
```

対応 HTTP メソッド：`Get`、`Post`、`Put`、`Patch`、`Delete`、`Head`、`Options`。

### 裏で何が起きているか

- パッケージ関数は内部で**遅延初期化される共有デフォルトクライアント**を使用します——初回呼び出し時に作成され、以降は再用、並行安全；
- 戻り値 `*Result` はステータスコード、レスポンスヘッダー、レスポンスボディ、リクエストメタ情報（所要時間、試行回数、リダイレクトチェーン）を集約します；
- `err != nil` は**ネットワーク層のエラー**（接続失敗、タイムアウト、TLS エラーなど）のみを表します。4xx/5xx ステータスコードは `result.IsSuccess()` などのメソッドで自分で確認する必要があります；
- デフォルト設定には TLS 1.2+、SSRF 防護、レスポンスボディ 10MB 上限、最大 3 回のインテリジェントリトライが含まれ、追加設定は不要です。

## クライアントの作成

カスタム設定が必要な場合は、クライアントインスタンスを作成します：

```go
client, err := httpc.NewDefault()
if err != nil {
    log.Fatal(err)
}
defer client.Close()

result, err := client.Get("https://httpbin.org/get")
```

クライアントはコネクションプールなどのリソースを保持するため、使い終わったら `Close()` を呼んでください。長期稼働するサービスでは通常、プロセスのライフサイクル中に 1 回だけ作成してグローバルに共有します——`Client` は並行安全であり、リクエストごとや goroutine ごとに作成する必要はありません。

### 設定プリセット

| 設定 | 用途 | 特徴 |
|------|------|------|
| `DefaultConfig()` | 汎用シナリオ | 安全なデフォルト値、SSRF 防護有効 |
| `SecureConfig()` | セキュリティ重視シナリオ | 自動リダイレクト無効、厳格なタイムアウト |
| `PerformanceConfig()` | 高スループットシナリオ | 大規模コネクションプール、長いタイムアウト、Cookie 有効 |
| `TestingConfig()` | テスト環境 | セキュリティ検査と HTTP/2 無効化、Cookie 有効 |
| `MinimalConfig()` | 軽量リクエスト | リトライなし、リダイレクトなし |

```go
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 60 * time.Second

client, err := httpc.New(cfg)
```

すべてのリクエストに効くデフォルト値（User-Agent、デフォルトヘッダー、リダイレクトポリシー）を設定することもできます：

```go
cfg := httpc.DefaultConfig()
cfg.Defaults.UserAgent = "myapp/2.0"
cfg.Defaults.Headers["Authorization"] = "Bearer " + token
cfg.Defaults.FollowRedirects = false

client, err := httpc.New(cfg)
```

## レスポンス処理

```go
result, err := client.Get("https://httpbin.org/json")
if err != nil {
    log.Fatal(err)
}

// ステータス確認
result.StatusCode()     // 200
result.IsSuccess()      // true (2xx)
result.IsClientError()  // false (4xx)
result.IsServerError()  // false (5xx)

// JSON 解析
var data map[string]any
if err := result.Unmarshal(&data); err != nil {
    log.Fatal(err)
}
```

カスタム構造体に解析します：

```go
var repo struct {
    Name  string `json:"name"`
    Stars int    `json:"stargazers_count"`
}
if err := result.Unmarshal(&repo); err != nil {
    log.Fatal(err)
}
```

リクエストメタ情報の確認：

```go
result.Meta.Duration       // 合計所要時間（リトライ待ちを含む）
result.Meta.Attempts       // 試行回数（初回 + リトライ）
result.Meta.RedirectChain  // 経由したリダイレクト URL チェーン
result.Meta.ProxyURL       // 今回使用したプロキシ（直接接続・システムプロキシでは空）
```

:::tip ヒント
`Unmarshal` はレスポンスボディが空の場合 `ErrResponseBodyEmpty` を、50MB 超過の場合 `ErrResponseBodyTooLarge` を返します。
:::

## データの送信

```go
// JSON
result, err := client.Post("https://httpbin.org/post",
    httpc.WithJSON(map[string]any{"name": "test"}),
)
```

```go
// フォーム
result, err := client.Post("https://httpbin.org/post",
    httpc.WithForm(map[string]string{"username": "admin"}),
)
```

```go
// 認証付き
result, err := client.Get("https://api.example.com/data",
    httpc.WithBearerToken("my-token"),
)
```

```go
// クエリパラメータ
result, err := client.Get("https://httpbin.org/get",
    httpc.WithQuery("page", 1),
    httpc.WithQueryMap(map[string]any{"limit": 10, "sort": "desc"}),
)
```

```go
// ファイルアップロード（multipart/form-data）
result, err := client.Post("https://httpbin.org/post",
    httpc.WithFile("file", "report.pdf", fileBytes),
)
```

## エラー処理

HTTPC は**ネットワーク層エラー**と **HTTP ステータスコード**を区別します：

```go
result, err := client.Get("https://api.example.com/data")
if err != nil {
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        log.Printf("エラーコード: %s", clientErr.Code())
    }
    log.Fatal(err)
}

// HTTP ステータスコードは手動で確認
switch {
case result.IsSuccess():
    // 2xx 成功
case result.IsClientError():
    log.Printf("クライアントエラー：%d", result.StatusCode())
case result.IsServerError():
    log.Printf("サーバーエラー：%d", result.StatusCode())
}
```

:::tip ヒント
4xx/5xx は `error` として返されません。`result.IsSuccess()` などのメソッドで確認してください。詳しくは [エラー処理](../guides/error-handling) をご覧ください。
:::

## 最初の完全なプログラム

以下はそのまま `go run` できる完全な例です。GitHub API を呼び出してリポジトリ情報を取得し、クライアント作成、リクエストヘッダー設定、タイムアウト制御、ステータス確認、JSON 解析を一通りカバーします：

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

// Repo は GitHub API のリポジトリレスポンスに対応
type Repo struct {
    Name        string `json:"name"`
    Description string `json:"description"`
    Stars       int    `json:"stargazers_count"`
}

func main() {
    // 1. クライアントを作成（デフォルト設定：TLS 1.2+、SSRF 防護、最大 3 回リトライ）
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // 2. リクエスト送信：デフォルトヘッダー + リクエストレベルのタイムアウト
    result, err := client.Get("https://api.github.com/repos/golang/go",
        httpc.WithUserAgent("httpc-demo/1.0"),
        httpc.WithTimeout(15*time.Second),
    )
    if err != nil {
        log.Fatal(err) // ネットワーク層エラー（接続/タイムアウト/TLS など）
    }

    // 3. HTTP ステータスコードを確認（4xx/5xx は error ではないため手動確認）
    if !result.IsSuccess() {
        log.Fatalf("HTTP エラー：%d", result.StatusCode())
    }

    // 4. JSON を構造体に解析
    var repo Repo
    if err := result.Unmarshal(&repo); err != nil {
        log.Fatal(err)
    }

    fmt.Printf("%s：%s（%d スター）\n", repo.Name, repo.Description, repo.Stars)
    fmt.Printf("所要時間 %v、試行 %d 回\n", result.Meta.Duration, result.Meta.Attempts)
}
// 出力（スター数と所要時間は実際の値により変動）：
// go：The Go programming language（124000 スター）
// 所要時間 350ms、試行 1 回
```

## 最初によくあるシナリオ

### JSON API の呼び出し（認証 + クエリパラメータ）

```go
result, err := client.Get("https://api.example.com/v1/issues",
    httpc.WithBearerToken(token),                                   // Bearer 認証
    httpc.WithQueryMap(map[string]any{"state": "open", "page": 2}), // クエリパラメータ
    httpc.WithHeader("Accept", "application/json"),
)
```

### タイムアウトとリトライ付きリクエスト

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
    cfg.Timeouts.Request = 30 * time.Second // 全体タイムアウト予算（全リトライを含む）
    cfg.Retry.MaxRetries = 3                // 最大 3 回リトライ（0 で無効）
    cfg.Retry.Delay = time.Second           // 初期バックオフ 1s
    cfg.Retry.BackoffFactor = 2.0           // バックオフごとに ×2（1s → 2s → 4s）
    cfg.Retry.EnableJitter = true           // ジッター、Thundering Herd を防止

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // httpbin の /status/503 は常に 503 を返す（リトライ可能なステータスコード）
    result, err := client.Get("https://httpbin.org/status/503")
    if err != nil {
        log.Fatal(err) // ネットワーク層エラー
    }

    // 503 はリトライ可能なステータスコード：リトライを使い果たすと最後のレスポンスを返す（error ではなく）
    fmt.Println("ステータスコード：", result.StatusCode())   // 503
    fmt.Println("試行回数：", result.Meta.Attempts) // 4（初回 + 3 回のリトライ）
}
// 出力：
// ステータスコード： 503
// 試行回数： 4
```

### ローカル/内部ネットワークサービスへのアクセス

デフォルト設定では `127.0.0.1`、`10.x`、`192.168.x` などのプライベート/予約アドレスへの接続をブロックします（SSRF 防護）。ローカル結合テストには 3 つの開き方があります：

```go
// 方法 1：リクエスト単位で免除（推奨、影響範囲が最小）
result, err := httpc.Get("http://localhost:8080/health",
    httpc.WithAllowPrivateIPs(true),
)

// 方法 2：内部ネットワーク CIDR を精密に免除（Tailscale、VPC など）
cfg := httpc.DefaultConfig()
cfg.Security.SSRFExemptCIDRs = []string{"10.0.0.0/8"}
client, _ := httpc.New(cfg)

// 方法 3：テストプリセット（ローカル開発/テスト限定、本番では使用厳禁）
client, _ = httpc.New(httpc.TestingConfig())
```

詳しくは [SSRF 防護](../security/ssrf) をご覧ください。

## 次のステップ

**入門パス**

- **[コア概念](./concepts)** - 2 層アーキテクチャ、設定体系、リクエストライフサイクル
- **[リクエストとレスポンス](../guides/request-response)** - 完全なリクエストオプションとレスポンス処理
- **[net/httpからの移行](../guides/migration)** - 標準ライブラリの経験を項目ごとにマッピング

**トピック別の深掘り**

- **[リトライとフォールトトレランス](../guides/retry-fault-tolerance)** - バックオフ戦略、カスタムリトライ、プロキシプールとの相互作用
- **[ミドルウェアチェーン](../guides/middleware-chain)** - ログ、メトリクス、監査、カスタムミドルウェア
- **[コネクションプールと DNS](../guides/connection-pool)** - コネクションプールのチューニングと DoH
- **[プロキシとプロキシプール](../guides/proxy)** - 単一プロキシ、システムプロキシ、プロキシプールのローテーションとサーキットブレーカー
- **[ファイルアップロードとダウンロード](../guides/file-transfer)** - ダウンロード、レジューム、ファイルアップロード
- **[ドメインクライアントとセッション](../guides/domain-session)** - DomainClient と Cookie セッション管理
- **[リダイレクト](../guides/redirects)** - 追従ポリシーとドメインホワイトリスト
- **[パフォーマンス](../guides/performance)** - チューニングリストとシナリオ別設定
- **[テスト](../guides/testing)** - TestingConfig とモック手法

**その他のリソース**

- **[チュートリアル](../guides/tutorial)** - 30 分で GitHub API クライアントを構築
- **[チートシート](./cheatsheet)** - よく使う操作のクイックリファレンス
- **[セキュリティ](../security/)** - セキュリティベストプラクティスと本番チェックリスト
