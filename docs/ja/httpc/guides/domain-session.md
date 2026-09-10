---
sidebar_label: "ドメインクライアントとセッション"
title: "ドメインクライアントとセッション - CyberGo HTTPC | セッションとドメイン管理"
description: "HTTPC ドメインクライアントとセッションガイド：NewDomain によるスコープ付きクライアント作成、URL 結合ルールとパストラバーサル防護、SetHeader セッションヘッダー、Cookie 自動キャプチャとオプション自動永続化、CookieSecurity 検証、REST クライアント実装例。"
sidebar_position: 5
---

# ドメインクライアントとセッション

ドメインクライアント（DomainClient）は同一ドメインに対するセッション管理クライアントで、Cookie とリクエストヘッダーを自動的に維持します。

3 つのコンポーネントがそれぞれ役割を担います：

| コンポーネント | 職責 | 適したシナリオ |
|------|------|----------|
| `Client` | 汎用 HTTP クライアント：設定、コネクションプール、リトライ、ミドルウェア | リクエストが複数ドメインに分散、リクエスト間の状態が不要 |
| `DomainClient` | ドメインスコープのクライアント：URL 自動結合 + 内蔵セッション | 特定の API ドメインに固定、ヘッダー/Cookie のクロスリクエスト維持が必要 |
| `SessionManager` | スレッドセーフなセッション状態ストア（ヘッダー + Cookie）、単独でも使用可能 | セッション状態を自前管理、任意の Client と組み合わせ |

## ドメインクライアントの作成

```go
dc, err := httpc.NewDomainDefault("https://api.example.com")
if err != nil {
    log.Fatal(err)
}
defer dc.Close()

// Cookie は自動的に有効
dc.SetHeader("Authorization", "Bearer "+token)

// 相対パスでリクエストを送信
result, err := dc.Get("/users")
```

:::tip
`NewDomain` は自動的に Cookie 管理を有効にします（`EnableCookies = true`）。手動設定は不要です。
:::

作成時に 3 つのことが自動的に行われます：

1. **baseURL 検証**：scheme と host を含む必要があります（例：`https://api.example.com`）。そうでない場合はエラーを返します
2. **Cookie の強制有効化**：渡された設定の `Connection.EnableCookies` は無視され、ドメインクライアントは常に Cookie 管理を携帯します
3. **セッション作成**：内部で `SessionManager` を 1 つ作成し（デフォルトは `DefaultSessionConfig`）、ヘッダーと Cookie はすべてここに保存されます

`NewDomain` は完全な Config も受け付け、タイムアウトやリトライなどをカスタマイズできます（この場合 `dc.Get` などのメソッドは通常のクライアントと同じ動作になります）：

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
    cfg.Timeouts.Request = 15 * time.Second
    cfg.Retry.MaxRetries = 2
    cfg.Defaults.UserAgent = "my-app/1.0"

    dc, err := httpc.NewDomain("https://api.github.com", cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer dc.Close()

    if err := dc.SetHeader("Accept", "application/vnd.github+json"); err != nil {
        log.Fatal(err)
    }

    result, err := dc.Get("/repos/golang/go")
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(result.StatusCode()) // 200
}
```

## URL 結合ルール

`Get`/`Post` などのメソッドの第 1 引数は base URL からの相対パスで、結合ルールは次のとおりです：

| 渡す path | 結果 | ルール |
|-----------|------|------|
| `/users` | `{base}/users` | 相対パスを base パスに結合 |
| `/users/` | `{base}/users/` | 末尾スラッシュは保持 |
| `https://other.com/data` | そのまま使用 | `http://`/`https://` で始まる完全 URL は結合をスキップ |
| `/users?page=2` | `{base}/users?page=2` | クエリ文字列は保持；base 側にクエリパラメータがある場合は両者をマージ |
| `""` | `{base}` | 空パスは base 自身を返す |

:::warning パストラバーサル防護
base URL がパスプレフィックスを持つ場合（例：`https://example.com/api/v1`）、結合結果は必ずそのプレフィックス内に収まる必要があります。`..` などで脱出しようとするパスは `path escapes base URL scope` エラーを返し、リクエストは送信されません。
:::

## セッションヘッダー管理

```go
// セッションヘッダーの設定（以降のすべてのリクエストに自動付与）
dc.SetHeader("Authorization", "Bearer "+token)
dc.SetHeader("Accept", "application/json")

// 一括設定
dc.SetHeaders(map[string]string{
    "Authorization": "Bearer " + token,
    "Accept":        "application/json",
    "X-Version":     "2.0",
})

// 削除とクリア
dc.DeleteHeader("X-Version")
dc.ClearHeaders()

// 取得
headers := dc.GetHeaders()
```

すべてのキーと値には `WithHeader` と同じ CRLF インジェクション検証が行われ、不正なキーと値はエラーを返します。`GetHeaders()` が返すのは**コピー**であり、それを変更してもセッションには影響しません。

単一リクエストではオプションでセッションヘッダーを上書きできます（オプションはセッションヘッダーの後に適用されます）：

```go
dc.SetHeader("X-API-Version", "v1")

// このリクエストは v2 を送信
result, _ := dc.Get("/data", httpc.WithHeader("X-API-Version", "v2"))
```

注意：次のセクションで述べるとおり、`v2` はセッションに書き戻され、以降のリクエストも `v2` を送信します。

## Cookie 管理

```go
// Cookie の設定
dc.SetCookie(&http.Cookie{Name: "session", Value: "abc123"})

// 一括設定
dc.SetCookies([]*http.Cookie{
    {Name: "session", Value: "abc123"},
    {Name: "lang", Value: "ja"},
})

// レスポンス Cookie の自動キャプチャ
result, _ := dc.Get("/login")
// サーバーが返す Set-Cookie は自動的にセッションへ保存

// 取得
cookie := dc.GetCookie("session")
cookies := dc.GetCookies()

// 削除とクリア
dc.DeleteCookie("session")
dc.ClearCookies()
```

:::tip
リクエストのたびに、サーバーが返す Cookie が自動的にセッションに更新されるため、手動で処理する必要はありません。
:::

Cookie の自動維持は 3 つの経路をカバーします：

- **レスポンスの書き戻し**：各リクエスト終了後、レスポンスの `Set-Cookie` は自動的にセッションへ書き込まれます（ダウンロード用の `Download` メソッドも同様にレスポンス Cookie をキャプチャします）
- **検証**：書き込み前に `WithCookie` と同じ合法性検証を行います。Cookie セキュリティポリシー（下の「Cookie セキュリティ検証」を参照）が設定されている場合、不適合な Cookie は**サイレントにスキップ**され、他の Cookie には影響しません
- **コピーのセマンティクス**：`GetCookie`/`GetCookies` は Cookie のコピーを返すため、返り値を変更してもセッション内部の状態は汚染されません

### リクエストオプションの自動永続化

**リクエストオプション**経由で渡された Cookie とリクエストヘッダーもセッションにキャプチャされ、以降のリクエストに継続的に効きます：

```go
// 初回リクエスト：オプションで渡した Cookie とリクエストヘッダーは……
_, err := dc.Get("/login",
    httpc.WithCookie(http.Cookie{Name: "session", Value: "abc"}),
    httpc.WithHeader("X-Client", "mobile"),
)
if err != nil {
    log.Fatal(err)
}

// ……セッションに書き込まれています：
fmt.Println(dc.GetCookie("session").Value) // 出力：abc
fmt.Println(dc.GetHeaders()["X-Client"])   // 出力：mobile

// 以降のリクエストはオプションなしでも自動的に携帯；再びオプションで同名項目を渡すとセッションの値を上書き
_, err = dc.Get("/profile")
```

:::warning 一時的なヘッダーをオプションで渡さないでください
オプション内のヘッダー/Cookie はセッションに永続化され、**以降のすべてのリクエスト**に効きます。取得のたびに値が変わる使い捨てヘッダー（増分する trace ID、ランダムな nonce など）は、使い終わったら `DeleteHeader`/`DeleteCookie` で必ず削除するか、そのリクエストだけ基盤の `Client` で送信してください。
:::

## リクエスト方法

```go
// 相対パス
result, _ := dc.Get("/users")
result, _ := dc.Post("/users", httpc.WithJSON(data))
result, _ := dc.Put("/users/1", httpc.WithJSON(data))
result, _ := dc.Patch("/users/1", httpc.WithJSON(data))
result, _ := dc.Delete("/users/1")
result, _ := dc.Head("/users/1")
result, _ := dc.Options("/users")

// コンテキスト付き
result, _ := dc.Request(ctx, "GET", "/users")

// 絶対 URL（base URL の結合をスキップ）
result, _ := dc.Get("https://other-api.com/data")
```

:::warning リクエストオプションは 2 回適用されます
ドメインクライアントは内部でリクエストオプションを**2 回適用**します（セッション状態のキャプチャ用と実際のリクエスト用の 1 回ずつ）。副作用のあるオプション（カウンター、nonce 生成など）は避けてください。このようなオプションが必要な場合は、基盤の `Client` を使用してください。
:::

`Download` メソッドは `Client.Download` とシグネチャが同一で、パスは同様に base URL からの相対で解決され、完了後にレスポンス Cookie をセッションへキャプチャします：

```go
dlCfg := httpc.DefaultDownloadConfig()
dlCfg.FilePath = "data.json"
dlCfg.Overwrite = true

result, err := dc.Download(ctx, "/export/data", dlCfg)
if err != nil {
    log.Fatal(err)
}
fmt.Println(result.FilePath, result.BytesWritten)
```

## セッションアクセス

```go
// 基本情報の取得
dc.URL()     // "https://api.example.com"
dc.Domain()  // "api.example.com"（host からポートを除いたもの）

// 内部 SessionManager へのアクセス
session := dc.Session()
if err := session.SetHeader("X-Trace-ID", traceID); err != nil {
    log.Fatal(err)
}
```

`DomainClient` は `SessionManager` を埋め込んですべてのセッションメソッドを公開しているため、`dc.SetHeader(...)` と `dc.Session().SetHeader(...)` は完全に等価です。

### SessionManager の単独使用

`SessionManager` は `DomainClient` から切り離して単独で作成し、スレッドセーフなヘッダー/Cookie の読み書きストアとして使えます：

```go
session, err := httpc.NewSessionManagerDefault()
if err != nil {
    log.Fatal(err)
}

// 状態の書き込み
if err := session.SetHeader("Authorization", "Bearer my-token"); err != nil {
    log.Fatal(err)
}
if err := session.SetCookies([]*http.Cookie{{Name: "session_id", Value: "abc123"}}); err != nil {
    log.Fatal(err)
}

// レスポンスから Cookie を書き戻し
result, err := client.Get("https://api.example.com/data")
if err != nil {
    log.Fatal(err)
}
session.UpdateFromResult(result)     // Result からレスポンス Cookie をキャプチャ
session.UpdateFromCookies(cookies)   // []*http.Cookie から一括更新
```

通常の `Client` と組み合わせる場合は、`GetHeaders()`/`GetCookies()` を自分で読み取り、`WithHeaderMap`/`WithCookie` オプションに変換してリクエストに付与する必要があります（`DomainClient` が内部でまさにこうして各リクエストにセッション状態を注入しています）。

## 並行セマンティクス

- **SessionManager は並行セーフ**：すべての読み書きメソッドは `sync.RWMutex` で保護されており、複数 goroutine から同時に `SetHeader`/`GetCookies` を呼んでも追加のロックは不要です
- **セッションスナップショットは最終的整合**：各リクエストの「セッションスナップショット読み取り → リクエスト送信 → レスポンス Cookie 書き戻し」という一連の処理はアトミックではありません——並行リクエストはやや古いスナップショットを読む可能性があります（例：別のリクエストが受け取ったばかりのログイン Cookie がまだあなたからは見えていない）。これは設計上のトレードオフです；単一リクエストが取得するスナップショットは常に一貫しています
- **DomainClient は並行使用可能**：メソッド自体に追加のロックはなく、複数 goroutine で共有できます

:::tip
ログインや Token のリフレッシュなど、セッション状態を大きく変える操作は、業務リクエストとの並行実行を避けるか、完了後に新しい状態へ依存するリクエストを発行することを推奨します。
:::

## Cookie セキュリティ検証

Cookie セキュリティポリシーを設定し、セキュリティ基準に準拠する Cookie のみを受け付けることができます：

```go
dc, _ := httpc.NewDomainDefault("https://api.example.com")

// 厳格な Cookie セキュリティを設定
session := dc.Session()
session.SetCookieSecurity(httpc.StrictCookieSecurityConfig())
// 要求：Secure=true, HttpOnly=true, SameSite=Strict

// セキュリティ要件を満たさない Cookie は SetCookie でエラーを返す
if err := dc.SetCookie(&http.Cookie{
    Name:  "insecure",
    Value: "test",
    // Secure, HttpOnly が不足 → 拒否される
}); err != nil {
    log.Println("Cookie が拒否されました：", err)
}
```

2 つの検証入口の動作差異：

| 入口 | 不適合時の動作 |
|------|----------------|
| `SetCookie` / `SetCookies`（明示的な書き込み） | エラーを返し、Cookie はセッションに入らない |
| レスポンス書き戻し / オプションキャプチャ（自動的な書き込み） | その Cookie を**サイレントにスキップ**し、残りは通常どおり処理 |

ポリシーは `SetCookieSecurity` 以降のすべての書き込みに効きます。`SessionManager` を単独で作成する場合は `SessionConfig.CookieSecurity` で事前設定できます（`NewDomain` は内部でデフォルトのセッション設定を使用するため、作成後に `SetCookieSecurity` を呼ぶ必要があります）。緩い出発点には `DefaultCookieSecurityConfig()`（デフォルトではどの属性も強制しない）を使い、必要に応じてフィールドを引き締めてください。

## ライフサイクルと再利用

```go
// 推奨：プロセス内で 1 つの DomainClient を常駐させ、コネクションプールとセッションをリクエスト間で再利用
dc, err := httpc.NewDomainDefault("https://api.example.com")
if err != nil {
    log.Fatal(err)
}
defer dc.Close()

// セッション失効（Token 期限切れなど）時はセッションをリセットして再ログイン
dc.ClearCookies()
dc.DeleteHeader("Authorization")
// ……ログインフローを再実行し、SetCookie/SetHeader で状態を復元……
```

- `Close()` は基盤の Client（コネクションプール、トランスポート層）をクローズしますが、セッションヘッダー/Cookie は**クリアしません**（それらは SessionManager に存在します）。クローズ後のリクエストは `ErrClientClosed` を返します
- リクエストごとに `DomainClient` を新規作成しないでください——接続の再利用とセッションの蓄積を失い、接続を使い果たす可能性もあります
- クライアント全体でセキュリティポリシーを変えるなどの要件には、新しいインスタンスを作成し、古いインスタンスは `Close` 後に破棄します

## 完全な例：REST API クライアント

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
    // ドメインクライアントの作成
    dc, err := httpc.NewDomainDefault("https://api.example.com")
    if err != nil {
        log.Fatal(err)
    }
    defer dc.Close()

    // ログインして Token を取得
    loginResult, err := dc.Post("/auth/login", httpc.WithJSON(map[string]string{
        "username": "admin",
        "password": "secret",
    }))
    if err != nil {
        log.Fatal(err)
    }

    // レスポンスから Token を解析
    var loginResp struct {
        Token string `json:"token"`
    }
    if err := loginResult.Unmarshal(&loginResp); err != nil {
        log.Fatal(err)
    }

    // セッションヘッダーの設定
    if err := dc.SetHeader("Authorization", "Bearer "+loginResp.Token); err != nil {
        log.Fatal(err)
    }

    // 以降のリクエストには自動的に Token と Cookie が付与される
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    users, err := dc.Request(ctx, "GET", "/users")
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println(users.StatusCode()) // 200
}
```

## 次のステップ

- [ドメインクライアント API](../api-reference/client-config/domain-client) - 完全な API リファレンス
- [セッション管理 API](../api-reference/client-config/session) - SessionManager リファレンス
- [リクエストとレスポンス](./request-response) - 基本リクエストガイド
