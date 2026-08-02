---
sidebar_label: "ドメインクライアント"
title: "ドメインクライアント - CyberGo HTTPC | NewDomain とセッション"
description: "HTTPC ドメインクライアント API リファレンス：NewDomain 作成関数、7 種 HTTP メソッドと Request 汎用メソッド、URL 自動結合ルール、DomainClienter インターフェースの SetHeader/SetCookie セッション管理と Close ライフサイクル。"
sidebar_position: 2
---

# ドメインクライアント

ドメインクライアント（`DomainClient`）は特定ドメインに対するリクエスト管理を提供し、Cookie とリクエストヘッダーを自動的に維持します。これは通常の `Client` が複数リクエスト間で認証ヘッダーや追跡 Cookie を手動で渡す必要があるという痛点を解決します——セッション状態が各リクエストに自動的に注入され、レスポンス Cookie が自動的にキャプチャされます。

```text
DomainClient アーキテクチャ
├── client         基盤 Client（コネクションプール、ミドルウェアチェーンを再利用）
├── baseURL        ドメインスコープ（例：https://api.example.com/v1）
├── parsedURL      解析結果のキャッシュ（毎リクエストの url.Parse 重複を回避）
├── domain         ホスト名（ポートを含まない）
└── SessionManager セッション状態
      ├── headers  map[string]string  セッションレベルのリクエストヘッダー
      └── cookies  map[string]*Cookie セッションレベルの Cookie
```

## DomainClienter インターフェース

```go
type DomainClienter interface {
    Client

    URL() string
    Domain() string

    SetHeader(key, value string) error
    SetHeaders(headers map[string]string) error
    DeleteHeader(key string)
    ClearHeaders()
    GetHeaders() map[string]string

    SetCookie(cookie *http.Cookie) error
    SetCookies(cookies []*http.Cookie) error
    DeleteCookie(name string)
    ClearCookies()
    GetCookies() []*http.Cookie
    GetCookie(name string) *http.Cookie

    Session() *SessionManager
}
```

`DomainClienter` は `Client` インターフェース（`Get`/`Post`/`Put`/`Patch`/`Delete`/`Head`/`Options`/`Request`/`Download`/`Close` を含む）とセッション管理メソッドを同時に実装します。テストと実装の差し替えに便利なインターフェース型の使用を推奨します。

### 完全なメソッド表

#### HTTP リクエストメソッド（Client から継承）

| メソッド | シグネチャ | 説明 |
|------|------|------|
| `Get` | `(path string, opts ...RequestOption) (*Result, error)` | GET リクエスト |
| `Post` | `(path string, opts ...RequestOption) (*Result, error)` | POST リクエスト |
| `Put` | `(path string, opts ...RequestOption) (*Result, error)` | PUT リクエスト |
| `Patch` | `(path string, opts ...RequestOption) (*Result, error)` | PATCH リクエスト |
| `Delete` | `(path string, opts ...RequestOption) (*Result, error)` | DELETE リクエスト |
| `Head` | `(path string, opts ...RequestOption) (*Result, error)` | HEAD リクエスト |
| `Options` | `(path string, opts ...RequestOption) (*Result, error)` | OPTIONS リクエスト |
| `Request` | `(ctx, method, path string, opts ...RequestOption) (*Result, error)` | コンテキスト付き汎用リクエスト |
| `Download` | `(ctx, path string, cfg *DownloadConfig, opts ...RequestOption) (*DownloadResult, error)` | ファイルダウンロード |
| `Close` | `() error` | クライアントをクローズしてリソースを解放 |

#### URL アクセスメソッド

| メソッド | 戻り値の型 | 説明 |
|------|----------|------|
| `URL()` | `string` | ベース URL（構築時に渡された `baseURL`） |
| `Domain()` | `string` | ドメイン（ホスト名、ポートを含まない） |
| `Session()` | `*SessionManager` | 内部セッションマネージャー |

#### セッションヘッダー管理

| メソッド | 説明 |
|------|------|
| `SetHeader(key, value string) error` | 単一セッションヘッダーの設定（CRLF セーフティを検証） |
| `SetHeaders(headers map[string]string) error` | セッションヘッダーの一括設定 |
| `DeleteHeader(key string)` | 単一セッションヘッダーの削除 |
| `ClearHeaders()` | 全セッションヘッダーのクリア |
| `GetHeaders() map[string]string` | セッションヘッダーのコピーを取得 |

#### セッション Cookie 管理

| メソッド | 説明 |
|------|------|
| `SetCookie(cookie *http.Cookie) error` | 単一セッション Cookie の設定 |
| `SetCookies(cookies []*http.Cookie) error` | セッション Cookie の一括設定 |
| `DeleteCookie(name string)` | 名前で Cookie を削除 |
| `ClearCookies()` | 全 Cookie のクリア |
| `GetCookies() []*http.Cookie` | 全 Cookie のコピーを取得 |
| `GetCookie(name string) *http.Cookie` | 名前で Cookie のコピーを取得 |

## NewDomain

```go
func NewDomain(baseURL string, cfg Config) (DomainClienter, error)
```

ドメインスコープクライアントを作成します。Cookie は自動的に有効になります。`Config` 値を渡すか、`NewDomainDefault(baseURL)` をゼロ引数のショートカットとして使用してください。

```go
// デフォルト設定を使用（NewDomainDefault でも同じ）
dc, err := httpc.NewDomain("https://api.example.com", httpc.DefaultConfig())
if err != nil {
    log.Fatal(err)
}
defer dc.Close()

// カスタム設定を使用
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 60 * time.Second
dc, err := httpc.NewDomain("https://api.example.com", cfg)
if err != nil {
    log.Fatal(err)
}
defer dc.Close()
```

**パラメータの説明：**

| パラメータ | タイプ | 説明 |
|------|------|------|
| `baseURL` | `string` | ベース URL（scheme と host を含む必要があります） |
| `cfg` | `Config` | 設定値（`DefaultConfig()` やプリセット関数で取得することを推奨） |

**戻り値：** `DomainClienter` インターフェース（具象タイプ `*DomainClient` ではありません）。

**エラー条件：**

| 条件 | エラーメッセージ |
|------|----------|
| `baseURL` に scheme または host がない | `base URL must include scheme and host` |
| 設定検証失敗 | `invalid configuration: ...` |

:::tip Cookie は自動的に有効化
`NewDomain` は内部で `cfg.Connection.EnableCookies = true` を強制設定します。渡した `cfg` で Cookie が有効かどうかにかかわらず関係ありません。これはドメインクライアントの中核的価値がクロスリクエストでの Cookie セッション維持だからです。
:::

## NewDomainDefault

```go
func NewDomainDefault(baseURL string) (DomainClienter, error)
```

便利なコンストラクタで、`NewDomain(baseURL, DefaultConfig())` と同等です。

```go
dc, err := httpc.NewDomainDefault("https://api.example.com")
if err != nil {
    log.Fatal(err)
}
defer dc.Close()
```

## HTTP メソッド

すべてのメソッドは相対パスまたは絶対 URL を受け付けます：

```go
// 相対パス：baseURL に自動結合
result, err := dc.Get("/users")
result, err := dc.Post("/users", httpc.WithJSON(data))
result, err := dc.Put("/users/1", httpc.WithJSON(data))
result, err := dc.Patch("/users/1", httpc.WithJSON(data))
result, err := dc.Delete("/users/1")
result, err := dc.Head("/users/1")
result, err := dc.Options("/users")

// 絶対 URL：そのまま使用
result, err := dc.Get("https://other-api.com/data")
```

### Request

```go
result, err := dc.Request(ctx, "GET", "/users", options...)
```

コンテキスト付きの汎用リクエストメソッドで、タイムアウトとキャンセル制御に対応します。`DomainClient` はこのメソッドを実装することで `Client` インターフェースを満たします。

## URL 結合ルールの詳細

`buildURL` メソッドがリクエストパスと `baseURL` の結合を担当します。ルールは以下の通りです：

```text
buildURL(pathStr):

  ① pathStr が空 → baseURL を返す
  ② pathStr が http:// または https:// で始まる → 絶対 URL、そのまま返す
  ③ それ以外 → 相対パス結合：
       a. キャッシュした parsedURL をクローン（オリジナルの変更を回避）
       b. pathStr を解析して path / query / fragment を分離
       c. result.Path = path.Join(basePath, parsedPath)
       d. 末尾スラッシュの保持：元のパスが / で終わる場合、結合結果も / で終わる
       e. パストラバーサル防護：結果は base パスのスコープ内にある必要
       f. クエリパラメータのマージ：base のクエリパラメータ + path のクエリパラメータ
       g. fragment の透過
```

### 結合例

| 入力パス | 結合結果（baseURL = `https://api.example.com/v1`） |
|----------|------|
| `""` | `https://api.example.com/v1` |
| `/users` | `https://api.example.com/v1/users` |
| `users` | `https://api.example.com/v1/users` |
| `/users/` | `https://api.example.com/v1/users/`（末尾スラッシュ保持） |
| `/users?page=1` | `https://api.example.com/v1/users?page=1` |
| `search?q=go` | `https://api.example.com/v1/search?q=go` |
| `https://other.com/api` | `https://other.com/api`（絶対 URL はそのまま使用） |

### クエリパラメータのマージ

`baseURL` 自身がクエリパラメータを持つ場合、リクエストパスのクエリパラメータはその後に**追加**されます：

```text
baseURL  = https://api.example.com/v1?lang=zh
path     = /users?page=1
結合結果 = https://api.example.com/v1/users?lang=zh&page=1
```

### パストラバーサル防護

`buildURL` は結合後のパスが base パスのスコープ内にあるかをチェックし、パストラバーサル攻撃を防止します：

```text
baseURL = https://api.example.com/v1
path    = ../admin/delete       ← path.Join 後のクリーンアップで /admin/delete になる

チェック：/admin/delete は /v1 のスコープ内か？
結果：いいえ → エラー "path escapes base URL scope" を返す
```

:::warning 絶対 URL の識別
`http://` と `https://` で始まるパスのみが絶対 URL として識別されます。他のプロトコル（`ftp://` など）は絶対パスとして識別されず、相対パスとして結合されるため、通常はリクエストの失敗を招きます。base パスが空または `/` の場合はスコープチェックを行いません。
:::

## セッションの自動管理

ドメインクライアントのセッション管理は 3 つの段階に分かれます：

```text
リクエストライフサイクルにおけるセッション管理：

  ① prepareOptions()（送信前）
     SessionManager からセッションヘッダーと Cookie を読み取り
     → RequestOption に変換してリクエストに注入

  ② captureFromOptions()（送信前）
     ユーザーが渡した RequestOption から Cookie とヘッダーを抽出
     → SessionManager に格納（あれば更新、なければスキップ）

  ③ UpdateFromResult()（送信後）
     レスポンスから Set-Cookie を抽出
     → SessionManager に格納
```

```go
dc, _ := httpc.NewDomainDefault("https://api.example.com")

// セッションヘッダー：以降の各リクエストに注入
dc.SetHeader("Authorization", "Bearer token-abc")
dc.SetHeader("Accept-Language", "zh-CN")

// ログイン後のレスポンスの Set-Cookie を自動キャプチャ
dc.Post("/login", httpc.WithJSON(loginData))
// 以降のリクエストは自動的にログイン Cookie を付与

// 手動で Cookie を設定することも可能
dc.SetCookie(&http.Cookie{Name: "session", Value: "xyz"})

// セッション状態の照会
dc.GetCookie("session")  // → *http.Cookie のコピー
dc.GetHeaders()          // → map[string]string のコピー
```

:::tip スレッドセーフ
`SessionManager` は内部で `sync.RWMutex` で保護されており、`SetHeader`/`SetCookie`/`GetCookie` などのメソッドは並行呼び出しに安全です。`prepareOptions` は読み取り後書き込みの非アトミックなシーケンスです——セッション状態は最終的整合性を前提とし、並行リクエストが `prepareOptions` 時にインターリーブする可能性がありますが、各リクエストは `prepareOptions` 時点で一貫したスナップショットをキャプチャします。
:::

## オプションの二重実行に関する注意

`prepareSessionOptions` はリクエスト送信前にユーザーが渡した `RequestOption` を**2 回適用**します：1 回は `captureFromOptions` でセッション状態のキャプチャ用、1 回は `client.Request` で実際のリクエスト用です。

```text
prepareSessionOptions(options):
  ① managedOptions = prepareOptions()        ← セッション状態を読み取り
  ② allOptions = managedOptions + options    ← マージ
  ③ captureFromOptions(options)              ← 一時リクエストに 1 回適用（セッションをキャプチャ）
  ④ return allOptions → client.Request()     ← 実際のリクエストに 2 回目を適用
```

::: warning 副作用のあるオプションを回避
以下のオプションは `DomainClient` で 2 回実行され、予期しない動作を引き起こします：

| 問題のあるオプション | 原因 |
|------------|------|
| カウンターのインクリメント | 毎リクエストで 2 回インクリメント |
| nonce のランダム生成 | キャプチャ段階とリクエスト段階で異なる値を生成 |
| `WithOnRequest` / `WithOnResponse` | コールバックは明示的にクリアされ、重複トリガーされない（安全） |

副作用のあるオプションが必要な場合は、基盤の `Client` を直接使用するか、オプションの外部で状態を管理してください。
:::

## Download メソッド

```go
func (dc *DomainClient) Download(ctx context.Context, path string, cfg *DownloadConfig, options ...RequestOption) (*DownloadResult, error)
```

ファイルを `cfg.FilePath` にダウンロードします。`path` は `baseURL` に対して相対的に結合されます。パッケージレベルの `Download` や `Client.Download` とシグネチャが同一で——`Download` はこれら 3 つを貫く唯一の正規ダウンロードエントリです。`cfg` を nil にすることはできず、`cfg.FilePath` の設定が必須です（未設定の場合は `ErrEmptyFilePath` を返します）。

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/report.pdf"
cfg.Overwrite = true

result, err := dc.Download(ctx, "/files/report.pdf", cfg)
```

ダウンロードのレスポンス Cookie はセッションに自動的にキャプチャされます（`UpdateFromCookies` 経由）。`Request` と同様に、リクエストオプションは 2 回適用されます。

## Client インターフェースとの関係

`DomainClient` はコンパイル時のアサーションで 2 つのインターフェースを**同時に実装**します：

```go
var _ Client = (*DomainClient)(nil)           // Client インターフェースを実装
var _ DomainClienter = (*DomainClient)(nil)   // DomainClienter インターフェースを実装
```

```text
インターフェース階層：
  Doer                                    ← 最小インターフェース（Request のみ）
    └── Client                             ← + HTTP メソッド + Download + Close
          └── DomainClienter               ← + URL/Domain/Session + セッションヘッダー/Cookie 管理
                └── *DomainClient          ← 具象実装
```

`DomainClienter` は `Client` を埋め込んでいるため、`Client` パラメータを受け取る関数は `DomainClienter` も受け取れます。これにより `DomainClient` は `Client` が必要な場所でシームレスに使用でき、同時に追加のセッション管理能力を提供します。

## 完全な REST API クライアントラッパーの例

以下の例は `DomainClient` で GitHub API クライアントをラップし、認証ヘッダーとページネーションクエリパラメータを自動管理する方法を示します。

```go
package main

import (
	"fmt"
	"time"

	"github.com/cybergodev/httpc"
)

// GitHubClient は GitHub REST API をラップします
type GitHubClient struct {
	dc httpc.DomainClienter
}

// NewGitHubClient は GitHub API クライアントを作成します
func NewGitHubClient(token string) (*GitHubClient, error) {
	cfg := httpc.DefaultConfig()
	cfg.Timeouts.Request = 30 * time.Second

	dc, err := httpc.NewDomain("https://api.github.com", cfg)
	if err != nil {
		return nil, err
	}

	// セッションレベルのリクエストヘッダーを設定
	if err := dc.SetHeader("Authorization", "Bearer "+token); err != nil {
		return nil, fmt.Errorf("set auth header: %w", err)
	}
	if err := dc.SetHeader("Accept", "application/vnd.github+json"); err != nil {
		return nil, fmt.Errorf("set accept header: %w", err)
	}
	if err := dc.SetHeader("X-GitHub-Api-Version", "2022-11-28"); err != nil {
		return nil, fmt.Errorf("set api version: %w", err)
	}

	return &GitHubClient{dc: dc}, nil
}

// Close はリソースを解放します
func (g *GitHubClient) Close() error { return g.dc.Close() }

// GetUser はユーザー情報を取得します（相対パスは自動的に baseURL に結合）
func (g *GitHubClient) GetUser(username string) (*httpc.Result, error) {
	return g.dc.Get(fmt.Sprintf("/users/%s", username))
}

// ListUserRepos はユーザーのリポジトリを一覧表示します（ページネーションパラメータ付き）
func (g *GitHubClient) ListUserRepos(username string, page, perPage int) (*httpc.Result, error) {
	return g.dc.Get(fmt.Sprintf("/users/%s/repos?page=%d&per_page=%d", username, page, perPage))
}

func main() {
	client, err := NewGitHubClient("ghp_your_token_here")
	if err != nil {
		panic(err)
	}
	defer client.Close()

	// 各リクエストは自動的に Authorization、Accept、X-GitHub-Api-Version ヘッダーを付与
	result, err := client.GetUser("torvalds")
	if err != nil {
		panic(err)
	}
	fmt.Printf("ステータスコード: %d\n", result.StatusCode())

	// Unmarshal 経由で JSON レスポンスを解析
	var user struct {
		Login string `json:"login"`
	}
	if err := result.Unmarshal(&user); err != nil {
		panic(err)
	}
	fmt.Printf("ユーザー名: %s\n", user.Login)

	repos, err := client.ListUserRepos("torvalds", 1, 5)
	if err != nil {
		panic(err)
	}
	fmt.Printf("リポジトリリストのステータスコード: %d\n", repos.StatusCode())
	// 出力例：
	// ステータスコード: 200
	// ユーザー名: torvalds
	// リポジトリリストのステータスコード: 200
}
```

:::tip インターフェースの戻り値
`NewDomain` と `NewDomainDefault` は `*DomainClient` 具象型ではなく `DomainClienter` インターフェースを返すため、テストでモックに差し替えやすくなります。具象型にアクセスする必要がある場合は型アサーションを使用してください。
:::

## 関連項目

- [セッション管理](./session) — SessionManager の詳細リファレンス
- [ドメインクライアントとセッション](../../guides/domain-session) — 使用ガイド
- [インターフェース定義](../types/interfaces) — Client、Doer、DomainClienter インターフェース定義
- [ファイルダウンロード](./download) — DownloadConfig と DownloadResult の詳細
