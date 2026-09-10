---
title: "net/http からの移行 - CyberGo HTTPC | 移行ガイド"
description: "net/http から CyberGo HTTPC へのスムーズな移行ガイド：http.Get、http.Client、Transport、CookieJar から httpc への対応をまとめた完全な API 対照表、エラーモデルの違い、5 段階タイムアウト体系と移行の落とし穴チェックリストを解説します。"
sidebar_label: "net/httpからの移行"
sidebar_position: 2
---

# net/http からの移行

`net/http` に既に慣れていますか？このガイドは、標準ライブラリで身につけた経験を HTTPC に一つずつマッピングします：どの書き方が機械的に置き換え可能か、どのセマンティクスが変化したか、どのデフォルト動作を見直す必要があるか。すべての動作記述はソースコードに基づきます。

## 互換性の概要：net/http の上に構築

HTTPC は `net/http` の代替品ではなく、そのトランスポート層の上に構築された拡張レイヤーです。基盤エンジンは引き続き `http.Client` と `http.Transport` です——接続再利用、HTTP/2 ネゴシエーション、TLS セッション、プロキシトンネルはすべて標準ライブラリが実行し、HTTPC はその外側にセキュリティ検証、リトライエンジン、ミドルウェアチェーン、`Result` 変換を重ねます（[「HTTPC と net/http はどういう関係？」](../faq/#httpc-と-net-http-はどういう関係) を参照）。

**移行しても変わらない部分：**

- **トランスポート層の動作** — コネクションプールの再利用、HTTP/2 ネゴシエーション、TLS セッション回復は標準ライブラリと同一で、パフォーマンス特性が移行によって劣化することはありません；
- **型の直接再利用** — `http.Cookie`、`tls.Config`、`context.Context`、`io.Reader`、`http.Header` をそのまま使用でき、アダプター層は不要です；
- **メンタルモデル** — パッケージ関数は `http.Get` に、Client インスタンスは `http.Client` に対応し、context の渡し方も同じです（[コア概念](../getting-started/concepts)の 2 層 API アーキテクチャを参照）。

**移行後に追加で得られる部分：**

- TLS 1.2+ の強制、SSRF 防護、CRLF インジェクション検証、レスポンスボディサイズの防線（デフォルトで安全）；
- 指数バックオフのインテリジェントリトライ（`Retry-After` を尊重、タイムアウト予算はリトライ間で共有）；
- オニオンモデルのミドルウェアチェーン（ログ/メトリクス/監査/リクエスト ID）；
- ワンストップの `Result` ラッパー——レスポンスボディのライフサイクルを自動管理し、`Close()` は不要です。

同じリクエストの移行前後の比較：

```go
package main

import (
    "fmt"
    "io"
    "net/http"
)

func main() {
    resp, err := http.Get("https://httpbin.org/get")
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close() // 手動クローズが必須。さもないと接続リーク

    body, err := io.ReadAll(resp.Body)
    if err != nil {
        panic(err)
    }

    fmt.Println(resp.StatusCode) // 200
    fmt.Println(len(body))       // レスポンスのバイト数
}
```

```go
package main

import (
    "fmt"

    "github.com/cybergodev/httpc"
)

func main() {
    result, err := httpc.Get("https://httpbin.org/get")
    if err != nil {
        panic(err) // ネットワーク層のエラーのみ
    }

    fmt.Println(result.StatusCode())  // 200
    fmt.Println(len(result.RawBody())) // レスポンスのバイト数（メモリ読み込み済み、クローズ不要）
}
```

移行後のコードは短くなり、さらに TLS ポリシー、SSRF 防護、最大 3 回のインテリジェントリトライがデフォルトで付いてきます。

## API 対照表

### クライアントとリクエスト

| net/http の書き方 | HTTPC での対応 | 差異のポイント |
|---------------|------------|----------|
| `http.Get(url)` | `httpc.Get(url)` | どちらもパッケージ関数 + 共有デフォルトインスタンス（遅延初期化） |
| `http.Post(url, ct, body)` | `httpc.Post(url, httpc.WithJSON(data))` | リクエストボディは `With*` オプションで宣言し、Content-Type は自動設定 |
| `http.PostForm(url, values)` | `httpc.Post(url, httpc.WithForm(m))` | `WithForm` は `map[string]string` を受け付けます；`url.Values` は `WithBody(values, httpc.BodyForm)` |
| `http.Head(url)` | `httpc.Head(url)` | 一対一対応；`Put/Patch/Delete/Options` も同様 |
| `client := &http.Client{...}` | `httpc.New(cfg)` / `httpc.NewDefault()` | `Client` インターフェースを返します；コネクションプールを保持するため `Close()` での解放が必要 |
| `http.DefaultClient` | パッケージ関数内部のデフォルトクライアント | 遅延シングルトン；`SetDefaultClient` で差し替え、`CloseDefaultClient` 解放後は自動再構築 |
| `http.NewRequest` + `client.Do(req)` | `client.Get(url, opts...)` などの動詞メソッド | `*http.Request` を構築する必要なし；メソッドと URL を直接渡します |
| `http.NewRequestWithContext` + `Do` | `client.Request(ctx, method, url, opts...)` | 汎用形式、任意のメソッド文字列 |
| `req.Header.Set(k, v)` | `httpc.WithHeader(k, v)` / `WithHeaderMap(m)` | ヘッダーのキーと値は CRLF インジェクション検証を通り、不正な値は `ErrInvalidHeader` を返します |
| `req.Header.Set("User-Agent", ua)` | `httpc.WithUserAgent(ua)` | インスタンスレベルのデフォルトは `cfg.Defaults.UserAgent` |
| `req.SetBasicAuth(u, p)` | `httpc.WithBasicAuth(u, p)` | フォーマット検証付き |
| `req.AddCookie(&http.Cookie{...})` | `httpc.WithCookie(http.Cookie{...})` | 値型を受け付けます；一括は `WithCookies`/`WithCookieMap`/`WithCookieString` |
| `req.URL.Query()` でクエリ文字列を組み立て | `httpc.WithQuery(k, v)` / `WithQueryMap(m)` | 値は一般的なスカラーと `fmt.Stringer` をサポートし、自動エンコードして URL にマージ |
| `jar, _ := cookiejar.New(nil)` を `client.Jar` に設定 | `cfg.Connection.EnableCookies = true` | または `DomainClient` が Cookie と共通ヘッダーを自動管理（[ドメインクライアントとセッション](./domain-session)を参照） |
| `client.CheckRedirect = func(...)` | `cfg.Defaults.FollowRedirects` / `MaxRedirects` | リクエストレベルは `WithFollowRedirects(false)`；リダイレクトドメインホワイトリストは `Security.RedirectWhitelist`（[リダイレクト](./redirects)を参照） |
| プロキシ：`Transport.Proxy` | `cfg.Connection.ProxyURL` / `ProxyPool` / `EnableSystemProxy` | 3 つの方式が優先度順に適用されます。詳しくは [プロキシとプロキシプール](./proxy) を参照 |

### レスポンス処理

| net/http の書き方 | HTTPC での対応 | 差異のポイント |
|---------------|------------|----------|
| `resp.StatusCode` | `result.StatusCode()` | nil 安全なアクセサー；状態判断は `IsSuccess()` / `IsClientError()` / `IsServerError()` / `IsRedirect()` |
| `resp.Status` / `resp.Proto` | `result.Response.Status` / `result.Proto()` | プロトコルバージョンは `HTTP/1.1` など |
| `resp.Header.Get(k)` | `result.Response.Headers.Get(k)` | 引き続き標準の `http.Header`、大文字小文字を区別しません |
| `io.ReadAll(resp.Body)` | `result.Body()` / `result.RawBody()` | レスポンスボディは既にメモリに読み込まれ複製され、解凍も自動完了 |
| `defer resp.Body.Close()` | 対応なし | クローズの入口を**探さないでください**——接続はコネクションプールが管理し、`Result` は GC に委ねます |
| `json.NewDecoder(resp.Body).Decode(&v)` | `result.Unmarshal(&v)` | 空ボディはセンチネルエラー `ErrResponseBodyEmpty` を返します（`io.EOF` ではありません、後述） |
| `resp.Cookies()` | `result.ResponseCookies()` / `result.GetCookie(name)` | 実際に送信された Cookie を確認する `GetRequestCookie` もあります |
| `resp.ContentLength` | `result.Response.ContentLength` | — |
| `resp.Request`（リダイレクト後の最終リクエスト） | `result.Request` | `URL` / `Method` / `Headers` / `Cookies` を含みます |
| `io.Copy(f, resp.Body)` でファイルに保存 | `result.SaveToFile(path)` | 大きなファイルは `Download` を使用（ストリーミング、レジューム、[ファイルアップロードとダウンロード](./file-transfer)を参照） |
| （対応なし） | `result.Meta` | HTTPC の追加：`Duration` / `Attempts` / `RedirectChain` / `ProxyURL` |
| `resp.Trailer` | 対応なし | `Result` は trailer を公開しないため、trailer に依存するユースケースは現時点で未サポート |

## エラーモデルの違い

これは移行時に**最も落とし穴にはまりやすい**部分です。まず一致点から：両ライブラリとも 4xx/5xx を `error` として扱いません——`err` はリクエストが正常に完了できなかったことのみを示します。本当の違いは `err` の形態、レスポンスボディのライフサイクル、リトライ動作にあります：

| 観点 | net/http | HTTPC |
|------|----------|-------|
| エラーの形態 | `*url.Error` でラップされた生の転送エラー | `*ClientError` 分類エラー（12 分類の `ErrorType` 列挙） |
| 分類手段 | 型アサーション（`net.Error`、`net.DNSError`、`x509.UnknownAuthorityError`…）または文字列マッチング | `errors.As` で抽出して `Code()` / `IsRetryable()` / `Attempts` を読み取り；センチネルエラーは `errors.Is` |
| `err != nil` 時のレスポンス | `resp` が nil 以外の可能性あり（`CheckRedirect` がエラーを返すとき最後のレスポンスを伴う） | `result` は常に nil、レスポンスの nil チェック不要 |
| レスポンスボディ読み取りエラー | `io.ReadAll` / `Decode` の時点で発生（`io.EOF`、`unexpected EOF`） | リクエスト段階で読み取り完了、読み取り失敗は `ClientError`（`ErrorTypeResponseRead`）として `err` と共に返却 |
| 空レスポンスボディ + JSON デコード | `Decode` が `io.EOF` を返す | `Unmarshal` が `ErrResponseBodyEmpty` を返す |
| リトライ | なし——エラーはそのまま呼び出し側に | タイムアウト/転送エラーと 408/429/500/502/503/504 を自動リトライ；ネットワークエラーの枯渇時は `error` を返し、リトライ可能ステータスコードの枯渇時は**最後のレスポンス**を返す |
| エラーメッセージ内の URL | そのまま出力（認証情報を含む可能性） | 自動マスク（認証情報 `***:***`、機密パラメータ `[REDACTED]`） |

移行前の典型的なエラー処理：

```go
package main

import (
    "encoding/json"
    "errors"
    "fmt"
    "io"
    "net/http"
)

func main() {
    resp, err := http.Get("https://api.example.com/users/42")
    if err != nil {
        // *url.Error：接続失敗、タイムアウト、TLS エラーはすべてここから出てくる。
        // さらに分類するには型アサーションか文字列マッチングが必要
        panic(err)
    }
    defer resp.Body.Close()

    // 4xx/5xx は error ではない：正常パスで処理されるため、ステータスコードの手動チェックが必要
    if resp.StatusCode != http.StatusOK {
        fmt.Println("HTTP エラー：", resp.StatusCode)
        return
    }

    var user map[string]any
    // 空レスポンスボディ時 Decode は io.EOF を返す——見落とされがちな分岐
    if err := json.NewDecoder(resp.Body).Decode(&user); err != nil && !errors.Is(err, io.EOF) {
        panic(err)
    }
    fmt.Println(user["name"])
}
// 出力（サーバーのレスポンスによる）：
// HTTP エラー： 404
```

移行後：

```go
package main

import (
    "errors"
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    result, err := httpc.Get("https://api.example.com/users/42")
    if err != nil {
        // ネットワーク層エラー：ClientError（12 分類）として分類済み、ショートコードとリトライ可否付き
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) {
            log.Printf("エラータイプ: %s, リトライ可: %v, 試行回数: %d",
                clientErr.Code(), clientErr.IsRetryable(), clientErr.Attempts)
        }
        panic(err)
    }

    // 4xx/5xx は error ではない：Result の状態判断メソッドでチェック
    if !result.IsSuccess() {
        fmt.Println("HTTP エラー：", result.StatusCode())
        return
    }

    var user map[string]any
    // 空レスポンスボディはセンチネルエラー ErrResponseBodyEmpty、errors.Is で正確に判定
    if err := result.Unmarshal(&user); err != nil {
        if errors.Is(err, httpc.ErrResponseBodyEmpty) {
            fmt.Println("(空レスポンスボディ)")
            return
        }
        panic(err)
    }
    fmt.Println(user["name"])
}
// 出力（サーバーのレスポンスによる）：
// HTTP エラー： 404
```

よくあるエラー分類シナリオの対照（`clientErr` は `errors.As` で抽出した `*httpc.ClientError`）：

| 判定したい状況 | net/http の書き方 | HTTPC の書き方 |
|--------------|---------------|------------|
| タイムアウト | `var ne net.Error` + `ne.Timeout()` | `clientErr.Type == httpc.ErrorTypeTimeout` |
| DNS 失敗 | `var de *net.DNSError` + `errors.As` | `httpc.ErrorTypeDNS` |
| 証明書検証失敗 | `var ce x509.UnknownAuthorityError` + `errors.As` | `httpc.ErrorTypeCertificate` |
| TLS プロトコルエラー | 文字列マッチング `"tls:"` | `httpc.ErrorTypeTLS` |
| 接続拒否/リセット | `var oe *net.OpError` + `errors.As` | `httpc.ErrorTypeNetwork` |
| コンテキストのキャンセル/デッドライン | `errors.Is(err, context.Canceled)` | `httpc.ErrorTypeContextCanceled`（常にリトライしない） |

エラー分類、リトライ可否、センチネルエラーの完全な説明は[エラー処理](./error-handling)と[エラータイプ](../api-reference/types/errors)を参照してください。

## リクエストボディ・ヘッダー・コンテキストの移行

`net/http` の「リクエストを構築 → 項目ごとに設定 → Do」という 3 段階は、HTTPC では「動詞メソッド + 宣言型オプション」に収束します。

<!-- check-code: skip -->
```go
// net/http：手動シリアライズ、手動ヘッダー設定、手動クエリ組み立て
payload, _ := json.Marshal(map[string]any{"name": "test"})
req, err := http.NewRequest("POST", "https://api.example.com/orders", bytes.NewReader(payload))
if err != nil {
    log.Fatal(err)
}
req.Header.Set("Content-Type", "application/json")
req.Header.Set("Authorization", "Bearer "+token)

q := req.URL.Query()
q.Set("page", "2")
req.URL.RawQuery = q.Encode()

resp, err := client.Do(req)
```

<!-- check-code: skip -->
```go
// HTTPC：オプション即リクエスト、Content-Type 自動設定、クエリパラメータ自動エンコード
result, err := client.Post("https://api.example.com/orders",
    httpc.WithJSON(map[string]any{"name": "test"}),
    httpc.WithBearerToken(token),
    httpc.WithQuery("page", 2),
)
```

標準ライブラリの操作からリクエストオプションへのマッピング：

| 標準ライブラリの操作 | HTTPC オプション |
|------------|------------|
| `json.Marshal` + `bytes.NewReader` + Content-Type | `WithJSON(data)`（`WithBody(data, BodyJSON)` と等価） |
| `xml.Marshal` | `WithXML(data)` |
| `url.Values` フォームエンコード | `WithForm(m)` / `WithBody(values, httpc.BodyForm)` |
| `multipart.Writer` で境界を手書き | `WithFile(field, name, content)` / `WithFormData(form)` |
| `bytes.NewReader(raw)` 生ボディ | `WithBody(raw)`（タイプ自動検出）/ `WithBinary(data, ct...)` |
| `req.Header.Set(k, v)` | `WithHeader(k, v)` / `WithHeaderMap(m)` |
| `req.SetBasicAuth` / Bearer 手動組み立て | `WithBasicAuth(u, p)` / `WithBearerToken(t)` |
| `req.AddCookie` | `WithCookie(c)` / `WithCookies(cs)` / `WithCookieMap(m)` / `WithCookieString(s)` |
| `io.Reader` ストリーミングリクエストボディ | `WithBody(reader)`（そのまま透過；**サイズ検証をバイパスする**ため `io.LimitReader` でラップ） |

コンテキストの使い方は標準ライブラリと同じです——`context.Context` は引き続きタイムアウトとキャンセルの媒体であり、渡す場所が異なるだけです：

<!-- check-code: skip -->
```go
// net/http：ctx をリクエストオブジェクトに詰める
req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
resp, err := client.Do(req)
```

<!-- check-code: skip -->
```go
// HTTPC：ctx を最初の引数として直接渡す
result, err := client.Request(ctx, "GET", url)

// 便宜メソッド（Get/Post など）は ctx を受け付けないため、WithContext で差し込む：
result, err = client.Get(url, httpc.WithContext(ctx))
```

完全なオプションリストは[リクエストとレスポンス](./request-response)と[リクエストオプション API](../api-reference/core/options)を参照してください。

## タイムアウト体系の対照

`http.Client.Timeout` は全過程をカバーする単一のタイムアウトです；HTTPC はこれを 5 段階の独立設定に分解し、リクエストレベルの上書きを提供します：

| net/http | HTTPC フィールド | デフォルト | スコープ |
|----------|-----------|--------|--------|
| `http.Client.Timeout` | `Timeouts.Request` | 180s | リクエスト総タイムアウト。**すべてのリトライとバックオフ待機を含む** |
| `Transport.DialContext`（`net.Dialer{Timeout}`） | `Timeouts.Dial` | 10s | TCP 接続確立 |
| `Transport.TLSHandshakeTimeout` | `Timeouts.TLSHandshake` | 10s | TLS ハンドシェイク（HTTPS のみ） |
| `Transport.ResponseHeaderTimeout` | `Timeouts.ResponseHeader` | 0（無効） | レスポンスヘッダー待機；正の値を設定するとトランスポートレベルのハード上限に |
| `Transport.IdleConnTimeout` | `Timeouts.IdleConn` | 90s | アイドル接続の維持時間 |
| （リクエストレベルの上書きなし） | `WithTimeout(d)` | — | リクエストレベルで総予算を上書き；上限 30 分 |

<!-- check-code: skip -->
```go
// net/http：単一タイムアウトが全過程をカバー（リトライなし）
client := &http.Client{Timeout: 30 * time.Second}
```

<!-- check-code: skip -->
```go
// HTTPC：インスタンスレベルの総予算 + リクエストレベルの上書き
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 30 * time.Second // すべてのリトライを含む総予算
client, _ := httpc.New(cfg)

result, err := client.Get(url, httpc.WithTimeout(30*time.Second)) // このリクエストで上書き
```

3 つのセマンティクス差異に注意が必要です：

- **総予算はリトライ間で共有** — `Timeouts.Request` / `WithTimeout` はすべてのリトライ試行とバックオフ待機をカバーし、試行ごとに計測をやり直すわけではありません；
- **`ResponseHeader` は特殊** — デフォルトは 0（無効）で、総予算が完全に制御します；正の値を設定すると同一 client を共有する**すべてのリクエスト**に作用し、より短い場合は `WithTimeout` を上書きします（slowloris 対策の多層防御、`SecureConfig()` で設定済み）；
- **長時間レスポンスのシナリオ** — AI API など長い待機が必要なインターフェースは `WithTimeout` で十分な予算を与えるだけでよく、デフォルトで「レスポンスヘッダータイムアウトが遅いレスポンスを切断する」問題は存在しません。

詳しくは[リクエストとレスポンス](./request-response)のタイムアウト部分と[FAQ「タイムアウトはどう選ぶ？」](../faq/#タイムアウトはどう選ぶ)を参照してください。

## Transport カスタマイズの移行

標準ライブラリでよく使う `http.Transport` チューニングフィールドは、HTTPC ではすべて `Config` の対応するサブ構造体にマッピングされます：

| `http.Transport` / `http.Client` フィールド | HTTPC 設定 | デフォルト |
|----------------------------------------|-----------|--------|
| `MaxIdleConns` | `Connection.MaxIdleConns` | 50 |
| `MaxConnsPerHost` / `MaxIdleConnsPerHost` | `Connection.MaxConnsPerHost` | 10 |
| `Proxy: http.ProxyFromEnvironment` | `Connection.EnableSystemProxy` | false |
| カスタム `Proxy` 関数 | `Connection.ProxyURL`（単一プロキシ）/ `ProxyPool`（プールローテーション） | 空 |
| `TLSClientConfig` | `Security.TLSConfig` | nil |
| `ForceAttemptHTTP2` | `Connection.EnableHTTP2` | true |
| `ResponseHeaderTimeout` | `Timeouts.ResponseHeader` | 0（無効） |
| `MaxResponseHeaderBytes` | `Connection.MaxResponseHeaderBytes` | 0（標準ライブラリのデフォルト 10MB） |
| `CheckRedirect` | `Defaults.FollowRedirects` / `MaxRedirects` + `Security.RedirectWhitelist` | true / 10 |
| カスタム `DialContext`（ダイヤラー） | 直接の入口なし | SSRF 検証はダイヤル層にラップ |

既存の `tls.Config` の知識（mTLS、カスタム CA、暗号スイート）はそのまま移行できます：

```go
package main

import (
    "crypto/tls"
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    // 既存の tls.Config（カスタム CA、暗号スイート、mTLS クライアント証明書）をそのまま移行
    tlsCfg := &tls.Config{
        MinVersion: tls.VersionTLS12,
        MaxVersion: tls.VersionTLS13,
    }

    cfg := httpc.DefaultConfig()
    cfg.Security.TLSConfig = tlsCfg
    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://httpbin.org/get")
    if err != nil {
        log.Fatal(err) // ネットワーク層エラー
    }
    fmt.Println(result.StatusCode()) // 200
}
```

:::warning 注意
`Security.TLSConfig` を一度設定すると、`MinTLSVersion` / `MaxTLSVersion` フィールドは無視されます——TLS バージョンポリシーは渡した `tls.Config` が基準になります（必ず `MinVersion` を自分で設定し、TLS 1.2 未満にしないでください）。
:::

2 つの境界を知っておく必要があります：

- **カスタム Transport の注入入口はない** — HTTPC は `*http.Transport` を自ら作成・管理します（SSRF 検証はダイヤル関数にラップ、リダイレクトポリシーは `CheckRedirect` 経由で注入）され、`Config` は Transport 全体を公開しません。極端なダイヤル動作のカスタマイズが必要なシナリオでは、まず `Config.Connection` / `Config.Security` が既にカバーしているか確認してください。
- **実装全体を差し替えたい場合は `Doer`** — テストモックや差し替え実装は、単一メソッドインターフェース `Doer`（`Request(ctx, method, url, opts...)`）を実装するだけでよく、完全な `Client` インターフェースに対応する必要はありません。[テストガイド](./testing)を参照してください。

## 移行の落とし穴チェックリスト

`net/http` からの移行で以下の動作差異が最も問題になりやすいです：

**1. `resp.Body` は手動クローズ不要（そして不可）**

`Result` が保持するのは既に読み取り複製されたバイト列で、HTTPC が内部で読み取り、ドレイン、クローズまで完了し、基盤の接続はコネクションプールが管理します。移行時には**すべての `defer resp.Body.Close()` を削除**し、クローズの入口を探さないでください。詳細は [FAQ「レスポンス Body は手動クローズが必要？」](../faq/#レスポンス-body-は手動クローズが必要) を参照してください。

**2. デフォルトでリトライ有効——非冪等 POST が重複送信される可能性**

`net/http` は決してリトライしません；HTTPC はデフォルトでタイムアウト/転送エラーと 408/429/500/502/503/504 を最大 3 回自動リトライし、**リクエストメソッドを区別しません**。注文、決済系のインターフェースでは必ず対応が必要です：

<!-- check-code: skip -->
```go
// 危険：デフォルトで最大 3 回リトライ、POST もリトライに参加
result, err := client.Post("https://api.example.com/orders", httpc.WithJSON(order))

// 安全（一）：非冪等インターフェースはリクエストレベルでリトライを無効化
result, err = client.Post("https://api.example.com/orders",
    httpc.WithJSON(order),
    httpc.WithMaxRetries(0),
)

// 安全（二）：サーバー側の冪等キーで重複排除（推奨）
result, err = client.Post("https://api.example.com/orders",
    httpc.WithJSON(order),
    httpc.WithHeader("Idempotency-Key", orderID),
)
```

緩和策の詳細は [FAQ「リトライで POST が重複送信される？」](../faq/#リトライ-で-post-が重複送信される) を参照してください。

**3. SSRF 防護はデフォルトで有効——内部ネットワークと localhost がブロックされる**

`net/http` から移行すると、`127.0.0.1`、`10.x`、`192.168.x` などのプライベート/予約アドレスへのアクセスが即座にエラーになります（`net/http` にこの制限はありません）。ローカル結合テストでは影響範囲が小さいものから選んでください：

<!-- check-code: skip -->
```go
// リクエストレベルの免除（推奨、影響範囲最小）
result, err := httpc.Get("http://localhost:8080/health",
    httpc.WithAllowPrivateIPs(true),
)

// クライアントレベルで CIDR を正確に免除（VPC / Tailscale など）
cfg := httpc.DefaultConfig()
cfg.Security.SSRFExemptCIDRs = []string{"10.0.0.0/8"}
```

完全なポリシーは [SSRF 防護](../security/ssrf)を参照してください。

**4. デフォルトクライアントは遅延シングルトン、長期サービスには明示的インスタンスを**

パッケージ関数は内部管理のデフォルトクライアントを共有します（クローズ後は自動再構築）。本番サービスでは明示的インスタンスを作成して設定とライフサイクルを制御してください。`Close()` 後のリクエストは `ErrClientClosed` を返します：

<!-- check-code: skip -->
```go
// 長期サービス：明示的インスタンス、プロセス内で共有、使い終わったら Close
client, err := httpc.NewDefault()
if err != nil {
    log.Fatal(err)
}
defer client.Close()

// パッケージ関数に自分の設定を使わせたい場合：デフォルトクライアントを差し替え（旧インスタンスは自動クローズ）
custom, err := httpc.New(httpc.SecureConfig())
if err != nil {
    log.Fatal(err)
}
if err := httpc.SetDefaultClient(custom); err != nil {
    log.Fatal(err)
}
```

**5. センチネルエラーには `errors.Is` / `errors.As` を使い、文字列マッチングをしない**

`ErrClientClosed`、`ErrResponseBodyEmpty`、`ErrResponseBodyTooLarge`、`ErrInvalidHeader` などのセンチネルエラーは `errors.Is` で判定します；分類エラーは `errors.As` で `*ClientError` を抽出します。エラーチェーンは根本原因（`Cause`）まで到達できます。

**6. レスポンスボディにデフォルト上限あり**

通常リクエストのデフォルトレスポンスボディ上限は 10MB、解凍後上限は 100MB（メモリ枯渇と解凍爆弾を防御）で、超過するとエラーになります。`http.Get` + `io.Copy` で大きなファイルをダウンロードする旧コードは `Download`（ストリーミング書き込み、レジューム、プログレスコールバック）に変更してください。上限は `Security.MaxResponseBodySize` / `MaxDecompressedBodySize` で調整できます。

**7. リダイレクト動作は予測可能だがデフォルト値に注意**

デフォルトでリダイレクトを追従します（上限 10 回）。`WithMaxRedirects(0)` / `MaxRedirects = 0` は「未設定」のセンチネル値であって無効化ではない点に注意——追従を禁止するには `WithFollowRedirects(false)` または `Defaults.FollowRedirects = false` を使います。詳しくは[リダイレクト](./redirects)を参照してください。

## ステップバイステップ移行チェックリスト

順番に実行すれば、各ステップを独立して検証できます：

1. **依存関係のインストール** — `go get github.com/cybergodev/httpc` し、`"net/http"` のクライアント呼び出し箇所を `"github.com/cybergodev/httpc"` に置き換えます（`http.Cookie` などの型は引き続き標準ライブラリからインポート）。
2. **リクエスト呼び出しの機械的置換** — `http.Get` → `httpc.Get`、`client.Do(req)` → `client.Get/Post/...`；`http.Client` リテラル → `httpc.New(cfg)`。
3. **リソース管理コードの削除** — `defer resp.Body.Close()`、`io.ReadAll` を削除；`result.Body()` / `result.RawBody()` / `result.Unmarshal(&v)` に置き換え。
4. **エラー処理の改造** — `err` 分岐に必要に応じて `errors.As` で `ClientError` を抽出；ステータスコードチェックは `result.IsSuccess()` 系に変更；`io.EOF` 空ボディ分岐は `errors.Is(err, httpc.ErrResponseBodyEmpty)` に変更。
5. **タイムアウトのマッピング** — `http.Client.Timeout` → `cfg.Timeouts.Request`；リクエストレベルの差分は `WithTimeout`；旧 Transport レベルのタイムアウトは[タイムアウト体系の対照](#タイムアウト体系の対照)に従って配置。
6. **Transport チューニングの移行** — プールサイズ、プロキシ、TLS、HTTP/2 を上の表に従って `Config.Connection` / `Config.Security` に配置；`tls.Config` は `Security.TLSConfig` へ移行。
7. **セキュリティデフォルト値への対応** — 内部ネットワーク/localhost 呼び出しに SSRF 免除を追加；レスポンスボディ上限がインターフェースのレスポンス量を満たすか確認。
8. **リトライ影響の見直し** — 非冪等 POST に冪等キーまたは `WithMaxRetries(0)` を追加；リトライ予算とビジネスのタイムアウトが整合するか確認。
9. **ライフサイクルの仕上げ** — 長期サービスは明示的インスタンス + `defer client.Close()`；リクエストパス上でクライアントを重複作成していないか確認。
10. **回帰検証** — 既存の結合テストを実行；エラーパス（ネットワーク断/タイムアウト/4xx/5xx）と大容量レスポンスのシナリオを重点的にカバー。

## 次のステップ

- **[チュートリアル](./tutorial)** - 30 分で完全な GitHub API クライアントを構築、移行後の典型的な書き方をカバー
- **[リクエストとレスポンス](./request-response)** - 完全なリクエストオプションと `Result` レスポンス処理
- **[コア概念](../getting-started/concepts)** - 2 層 API アーキテクチャ、設定体系とリクエストライフサイクル
- **[よくある質問](../faq/)** - リトライ、タイムアウト、プロキシ、Cookie など高頻度質問のソースコードレベルの回答
