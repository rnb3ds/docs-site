---
sidebar_label: "チュートリアル"
title: "実戦チュートリアル - CyberGo HTTPC | GitHub API クライアント構築"
description: "30 分の実践チュートリアル：GitHub API を題材に HTTP クライアントをゼロから構築。パッケージ関数、設定プリセット、WithQuery/WithJSON、NewDomain、ミドルウェア、ClientError 分類、ファイルダウンロード、並列リクエストを網羅します。"
sidebar_position: 1
---

# チュートリアル：GitHub API クライアントの構築

以下の例は GitHub API を題材に、HTTPC の各コア機能を紹介します。各例は独立しており、必要に応じて参照できます。

**学ぶこと：**

- クライアントの作成と設定プリセット
- パッケージ関数とデフォルトクライアントの関係
- クライアントインスタンスのライフサイクルとデフォルト設定
- GET/POST リクエストの送信と JSON レスポンスの処理
- クエリパラメータと主要なリクエストオプション
- ドメインクライアントで API ベース URL を管理
- ミドルウェアでログとメトリクスを追加
- エラー処理とリトライ
- Result レスポンスオブジェクトと自動管理

## 基本的なリクエスト

依存関係をインストールして `main.go` を作成します：

```bash
go get github.com/cybergodev/httpc
```

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    result, err := httpc.Get("https://api.github.com/repos/golang/go")
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println(result.StatusCode()) // 200
    fmt.Println(result.Body())       // JSON レスポンス
}
```

ポイント：
- パッケージ関数 `httpc.Get` はクライアントの作成が不要で、素早く確認するのに適しています
- Result はリクエストごとに新規作成され、GC が自動的に回収します。手動での解放は不要です

### パッケージ関数とデフォルトクライアント

パッケージ関数（`Get`/`Post`/`Request` など）はそれぞれ独立してリクエストを送るのではなく、**遅延初期化される 1 つのデフォルトクライアント**を共有します：初回呼び出し時にシングルトンが作成され、以降のパッケージレベル呼び出しはすべてそれを再利用します。デフォルトクライアントがクローズされると「自己修復」します——次のパッケージレベル呼び出しで自動的に再構築されます。

このデフォルトクライアントを引き継ぐこともできます：

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    // カスタム設定をデフォルトクライアントに設定（古いデフォルトクライアントは自動的にクローズされます）
    cfg := httpc.DefaultConfig()
    cfg.Timeouts.Request = 30 * time.Second
    cfg.Retry.MaxRetries = 2

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    if err := httpc.SetDefaultClient(client); err != nil {
        log.Fatal(err)
    }

    // 以降のパッケージ関数はすべてこのクライアントを使用
    result, err := httpc.Get("https://api.github.com/repos/golang/go")
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(result.StatusCode()) // 200

    // プログラム終了前にデフォルトクライアントを解放
    if err := httpc.CloseDefaultClient(); err != nil {
        log.Fatal(err)
    }
}
```

:::tip
長期稼働するサービスでは、下の「クライアントインスタンスの作成と設定」の明示的なクライアントでライフサイクルを管理することを推奨します。デフォルトクライアントはスクリプトや単発リクエストに適しています。
:::

## JSON レスポンスの解析

```go
type Repo struct {
    FullName    string `json:"full_name"`
    Description string `json:"description"`
    Stars       int    `json:"stargazers_count"`
    Language    string `json:"language"`
}

result, err := httpc.Get("https://api.github.com/repos/golang/go")
if err != nil {
    log.Fatal(err)
}

var repo Repo
if err := result.Unmarshal(&repo); err != nil {
    log.Fatal(err)
}

fmt.Printf("%s (⭐ %d)\n", repo.FullName, repo.Stars)
fmt.Printf("言語: %s\n", repo.Language)
fmt.Printf("説明: %s\n", repo.Description)
```

ポイント：
- `result.Unmarshal(&v)` で JSON レスポンスを構造体に直接解析
- API レスポンスに対応する Go 構造体を定義
- レスポンスボディが空の場合 `Unmarshal` は `ErrResponseBodyEmpty` を返し、50MB 超過で `ErrResponseBodyTooLarge` を返します

## クライアントインスタンスの作成と設定

パッケージ関数の背後には常に 1 つのデフォルトクライアントがあります。設定とライフサイクルを制御するには、`New` で明示的にインスタンスを作成します：

```go
package main

import (
    "errors"
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Timeouts.Request = 30 * time.Second
    cfg.Timeouts.Dial = 5 * time.Second
    cfg.Retry.MaxRetries = 2

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err) // 設定検証の失敗（不正なタイムアウト値など）はここで返る
    }
    defer client.Close()

    result, err := client.Get("https://api.github.com/repos/golang/go",
        httpc.WithUserAgent("my-github-app/1.0"),
    )
    if err != nil {
        if errors.Is(err, httpc.ErrClientClosed) {
            log.Fatal("クライアントはクローズ済み：", err)
        }
        log.Fatal(err)
    }
    fmt.Println(result.StatusCode()) // 200
}
```

ポイント：
- `New(cfg)` はまず設定を検証し、その後**ディープコピー**を作成します——作成後に元の `cfg` 変数を変更してもクライアントの動作には影響しません
- `Close()` はコネクションプールとトランスポート層のリソースを解放します。クローズ後のリクエストは `ErrClientClosed` を返します
- クライアントは並行に安全に使用できます（下の「並列リクエスト」を参照）。**常駐して再利用**すべきであり、リクエストごとに新規作成してはいけません
- `NewDefault()` は `New(DefaultConfig())` と等価です

### 設定プリセット

毎回ゼロから設定を書く必要はなく、HTTPC は出発点として 5 つのプリセットを提供します：

| プリセット | 位置づけ | DefaultConfig との主な差異 |
|------|------|------|
| `DefaultConfig()` | 汎用デフォルト | リクエストタイムアウト 180s、リトライ 3 回、レスポンス上限 10MB、リダイレクト追跡 |
| `SecureConfig()` | セキュリティ優先 | タイムアウト引き締め（リクエスト 15s、ダイヤル/TLS 5s）、レスポンス上限 5MB、リダイレクト追跡無効、リトライ 1 回 |
| `PerformanceConfig()` | 高スループット | コネクションプール拡大（アイドル 100/ホストごと 20）、レスポンス上限 50MB、リトライ遅延 500ms、Cookie 有効 |
| `TestingConfig()` | テスト専用 | TLS 検証スキップ、プライベート IP 許可、URL/ヘッダー検証オフ（本番では使用禁止。テスト環境以外で呼び出すと警告が出力されます） |
| `MinimalConfig()` | 単発リクエスト | リトライなし、リダイレクト追跡なし、レスポンス上限 1MB、小さなコネクションプール |

ユーザー提供の URL やセキュリティ感受性の高いシナリオでは `SecureConfig()` を、高並列のクロールやプロキシシナリオでは `PerformanceConfig()` を選択してください。

### デフォルト設定一覧

`DefaultConfig()` の主要なデフォルト値（完全なフィールドは[設定 API](../api-reference/client-config/config) を参照）：

| 設定項目 | デフォルト値 | 説明 |
|--------|--------|------|
| `Timeouts.Request` | 180s | リクエスト全体のタイムアウト（全リトライ試行をカバー） |
| `Timeouts.Dial` / `Timeouts.TLSHandshake` | 10s / 10s | TCP 接続 / TLS ハンドシェイクのタイムアウト |
| `Timeouts.IdleConn` | 90s | アイドル接続のキープアライブ時間 |
| `Connection.MaxIdleConns` / `MaxConnsPerHost` | 50 / 10 | アイドル接続プール / ホストごとの接続上限 |
| `Retry.MaxRetries` / `Delay` / `BackoffFactor` | 3 / 1s / 2.0 | リトライ回数、初期遅延、バックオフ倍率（デフォルトでジッター付き、単回遅延上限 30s） |
| `Security.MaxResponseBodySize` | 10MB | レスポンスボディのサイズ上限 |
| `Security.MaxDecompressedBodySize` | 100MB | 解凍後レスポンスボディの上限 |
| `Defaults.UserAgent` | `httpc/1.0` | デフォルト User-Agent |
| `Defaults.FollowRedirects` / `MaxRedirects` | true / 10 | リダイレクト追跡ポリシー |

## クエリパラメータとリクエストオプション

リクエストオプションは `With*` 関数で表され、自由に組み合わせて URL の後に順番に付与できます：

```go
client, _ := httpc.NewDefault()
defer client.Close()

// クエリパラメータ：個別に設定、または Map で一括設定
result, err := client.Get("https://api.github.com/search/repositories",
    httpc.WithQuery("q", "language:go"),
    httpc.WithQuery("sort", "stars"),
    httpc.WithQueryMap(map[string]any{
        "order": "desc",
        "page":  1,
    }),
)

// 単一リクエストでクライアントのデフォルトを上書き：タイムアウトとリトライ
result, err = client.Get("https://api.github.com/repos/golang/go",
    httpc.WithTimeout(10*time.Second),
    httpc.WithMaxRetries(1),
)
```

ポイント：
- `WithQuery` の値は `string`、数値、ブール値などの主要な型をサポートします。値が `nil` の場合、そのパラメータは URL に**含まれません**
- `WithTimeout` は 0～30 分の範囲で、負の値は `ErrInvalidTimeout` を返します。このタイムアウトは `Timeouts.Request` を上書きします
- `WithMaxRetries` は 0～10 の範囲で、`Retry.MaxRetries` を上書きします
- すべてのオプションは[リクエストオプション API](../api-reference/core/options) を、リクエスト/レスポンスの詳細は[リクエストとレスポンス](./request-response)を参照してください

## ドメインクライアントの作成

GitHub API のすべてのエンドポイントは `https://api.github.com` 配下にあるため、ドメインクライアントを使うと URL の重複記述を避けられます：

```go
client, err := httpc.NewDomainDefault("https://api.github.com")
if err != nil {
    log.Fatal(err)
}
defer client.Close()

if err := client.SetHeader("Authorization", "Bearer "+os.Getenv("GITHUB_TOKEN")); err != nil {
    log.Fatal(err)
}

// パスは baseURL からの相対パス
result, err := client.Get("/repos/golang/go",
    httpc.WithHeader("Accept", "application/vnd.github+json"),
)
if err != nil {
    log.Fatal(err)
}
```

ポイント：
- `NewDomain` はスコープ付きクライアントを作成し、パスは baseURL からの相対パス
- `SetHeader` は永続的なリクエストヘッダーを設定し、毎回のリクエストに自動的に付与
- `WithHeader` はリクエストオプションとして渡し、現在のリクエストのみに適用
- ドメインクライアントは Cookie を自動管理

## データの送信（Issue の作成）

```go
type CreateIssueRequest struct {
    Title string `json:"title"`
    Body  string `json:"body"`
}

newIssue := CreateIssueRequest{
    Title: "Bug report",
    Body:  "Found a bug in the API response",
}

result, err := client.Post("/repos/owner/repo/issues",
    httpc.WithJSON(newIssue),
)
if err != nil {
    log.Fatal(err)
}

if !result.IsSuccess() {
    log.Fatalf("作成に失敗: %d %s", result.StatusCode(), result.Body())
}

var created struct {
    Number int    `json:"number"`
    URL    string `json:"html_url"`
}
result.Unmarshal(&created)
fmt.Printf("Issue #%d を作成しました: %s\n", created.Number, created.URL)
```

ポイント：
- `WithJSON(data)` が自動的にシリアライズし、Content-Type を設定
- `result.IsSuccess()` で 2xx ステータスコードを確認

## ミドルウェアの追加

クライアントにログとリクエスト ID を追加します：

```go
// ミドルウェアの設定
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: func(format string, args ...any) {
        log.Printf("[HTTP] "+format, args...)
    }}),
    httpc.RecoveryMiddleware(),
    httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),
}

// 設定を NewDomain に渡して、ミドルウェア付きのドメインクライアントを作成
client, err := httpc.NewDomain("https://api.github.com", cfg)
if err != nil {
    log.Fatal(err)
}
defer client.Close()

if err := client.SetHeader("Authorization", "Bearer "+os.Getenv("GITHUB_TOKEN")); err != nil {
    log.Fatal(err)
}

result, err := client.Get("/repos/golang/go",
    httpc.WithHeader("Accept", "application/vnd.github+json"),
)
if err != nil {
    log.Fatal(err)
}

var repo Repo
result.Unmarshal(&repo)
fmt.Printf("%s: ⭐ %d\n", repo.FullName, repo.Stars)
```

ポイント：
- ミドルウェアは `MiddlewareConfig.Middlewares` で設定
- `LoggingMiddleware` はリクエストログを記録
- `RecoveryMiddleware` は panic によるクラッシュを防止
- `RequestIDMiddleware` は各リクエストにユニーク ID を生成

## エラー処理とリトライ

```go
result, err := client.Get("/repos/golang/go")
if err != nil {
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        switch clientErr.Type {
        case httpc.ErrorTypeTimeout:
            log.Println("リクエストタイムアウト、後でリトライしてください")
        case httpc.ErrorTypeNetwork:
            log.Println("ネットワークエラー")
        case httpc.ErrorTypeTLS:
            log.Println("TLS エラー")
        default:
            log.Printf("HTTP エラー: %s", clientErr.Error())
        }

        if clientErr.IsRetryable() {
            log.Println("このエラーは自動リトライ可能です")
        }
    }
    return
}

// HTTP ステータスコードの処理
switch {
case result.IsSuccess():
    // 2xx 成功
case result.StatusCode() == 401:
    log.Println("Token が期限切れまたは無効")
case result.IsClientError():
    log.Printf("クライアントエラー：%d", result.StatusCode())
case result.IsServerError():
    log.Printf("サーバーエラー：%d (合計 %d 回試行、初回含む)",
        result.StatusCode(), result.Meta.Attempts)
}
```

リトライポリシーの設定：

```go
cfg := httpc.DefaultConfig()
cfg.Retry.MaxRetries = 5
cfg.Retry.Delay = 2 * time.Second
cfg.Retry.BackoffFactor = 2.0
cfg.Retry.EnableJitter = true
```

ポイント：
- HTTPC はネットワークエラーと HTTP ステータスコードを分離して処理
- `ClientError` はエラー分類とリトライ可否の判定を提供
- デフォルトで 408, 429, 500, 502, 503, 504 を自動リトライ
- `Timeouts.Request` は**全リトライの総予算**であり、単一試行のタイムアウトではありません

## ファイルダウンロード（リリースパッケージのダウンロード）

```go
dlCfg := httpc.DefaultDownloadConfig()
dlCfg.FilePath = "go1.22.0.linux-amd64.tar.gz"
dlCfg.Overwrite = true
dlCfg.ProgressCallback = func(downloaded, total int64, speed float64) {
    pct := float64(downloaded) / float64(total) * 100
    fmt.Printf("\rダウンロード進捗：%.1f%% (%.2f MB/s)", pct, float64(speed)/1024/1024)
}

result, err := client.Download(
    context.Background(),
    "https://go.dev/dl/go1.22.0.linux-amd64.tar.gz",
    dlCfg,
)
if err != nil {
    log.Fatal(err)
}

fmt.Printf("\nダウンロード完了: %s (%d bytes)\n",
    result.FilePath,
    result.BytesWritten,
)
```

## 並列リクエスト

複数のリポジトリ情報を同時に取得します：

```go
func fetchRepos(ctx context.Context, repos []string) error {
    client, err := httpc.New(httpc.PerformanceConfig())
    if err != nil {
        return err
    }
    defer client.Close()

    results := make([]*httpc.Result, len(repos))
    errs := make([]error, len(repos))

    var wg sync.WaitGroup
    for i, name := range repos {
        wg.Add(1)
        go func(idx int, repo string) {
            defer wg.Done()
            r, err := client.Request(ctx, "GET", fmt.Sprintf("https://api.github.com/repos/%s", repo))
            results[idx] = r
            errs[idx] = err
        }(i, name)
    }
    wg.Wait()

    for i, err := range errs {
        if err != nil {
            return err
        }

        var repo Repo
        results[i].Unmarshal(&repo)
        fmt.Printf("%s: ⭐ %d\n", repo.FullName, repo.Stars)
    }
    return nil
}
```

:::tip
`PerformanceConfig()` は大規模コネクションプール設定を提供し、高並列シナリオに適しています。Result はリクエストごとに新規作成され、GC が自動的に回収されます。
:::

## 完全な例

上記の例を統合した完全なコード：

```go
package main

import (
    "errors"
    "fmt"
    "log"
    "os"
    "time"

    "github.com/cybergodev/httpc"
)

type Repo struct {
    FullName    string `json:"full_name"`
    Description string `json:"description"`
    Stars       int    `json:"stargazers_count"`
    Language    string `json:"language"`
}

func main() {
    token := os.Getenv("GITHUB_TOKEN")

    cfg := httpc.DefaultConfig()
    cfg.Retry.MaxRetries = 3
    cfg.Retry.Delay = 1 * time.Second
    cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
        httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: func(format string, args ...any) {
            log.Printf("[HTTP] "+format, args...)
        }}),
        httpc.RecoveryMiddleware(),
    }

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // リポジトリ情報の取得
    result, err := client.Get("https://api.github.com/repos/golang/go",
        httpc.WithHeader("Authorization", "Bearer "+token),
    )
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) && clientErr.IsRetryable() {
            log.Fatal("リクエスト失敗（リトライ済み）:", err)
        }
        log.Fatal(err)
    }

    if result.IsSuccess() {
        var repo Repo
        result.Unmarshal(&repo)
        fmt.Printf("✅ %s\n", repo.FullName)
        fmt.Printf("   ⭐ %d | 言語: %s\n", repo.Stars, repo.Language)
        fmt.Printf("   %s\n", repo.Description)
        fmt.Printf("   所要時間: %s (合計 %d 回試行、初回含む)\n",
            result.Meta.Duration, result.Meta.Attempts)
    }
}
```

## 次のステップ

- [リクエストとレスポンス](./request-response) — 完全なリクエストオプションリファレンス
- [ミドルウェアチェーン](./middleware-chain) — カスタムミドルウェア開発
- [リトライとフォールトトレランス](./retry-fault-tolerance) — 高度なリトライポリシー
- [ドメインクライアントとセッション](./domain-session) — セッション状態管理
- [パフォーマンス最適化](./performance) — 本番環境のチューニング
- [設定 API](../api-reference/client-config/config) — すべての設定フィールドとプリセット
- [本番チェックリスト](../security/production-checklist) — セキュリティベストプラクティス
