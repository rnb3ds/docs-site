---
title: "リダイレクト - CyberGo HTTPC | 追跡制御とセキュリティホワイトリスト"
description: "HTTPC リダイレクトガイド：自動追跡と 10 回上限、WithFollowRedirects と WithMaxRedirects のリクエスト単位制御、RedirectChain チェーン追跡、資格情報の自動剥離、RedirectWhitelist によるオープンリダイレクト防御を解説。"
sidebar_label: "リダイレクト"
sidebar_position: 4
---

# リダイレクト

HTTPC はデフォルトで HTTP リダイレクトを自動的に追跡し（最大 10 回）、完全なリダイレクトチェーンを記録します。このページでは、追跡の制御、回数制限、チェーン追跡、ステータスコードのメソッド意味論、クロスドメイン資格情報の剥離、循環リダイレクト検出、ドメインホワイトリスト、および SSRF 防護との連携を扱います。

## デフォルト動作

設定を行わなくても、クライアントは最終レスポンスに到達するか回数上限に達するまでリダイレクトを追跡します：

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    result, err := httpc.Get("https://httpbin.org/redirect/2")
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println(result.StatusCode())        // 200（最終レスポンスのステータスコード）
    fmt.Println(result.Meta.RedirectCount)  // 2（実際に追跡したリダイレクト回数）
}
```

エンジンは 301/302/303/307/308 の 5 つのリダイレクトステータスコードを自動的に追跡し、メソッドの意味論は HTTP 仕様に従います：

| ステータスコード | メソッドの扱い |
|--------|----------|
| 301 / 302 / 303 | POST を GET に書き換える場合がある（仕様で許容） |
| 307 / 308 | 元のメソッドとリクエストボディを維持して再送 |

### ステータスコードの意味論（301/302/303/307/308）

5 つのステータスコードの「メソッド書き換え」と「リクエストボディ」に関する差異は次のとおりです：

| ステータスコード | 意味 | メソッドの扱い | リクエストボディ | 典型的用途 |
|--------|------|----------|--------|----------|
| 301 | 恒久的移動 | GET/HEAD は不変、POST などは GET に書き換え | 破棄 | ドメイン移行、URL 正規化 |
| 302 | 一時的移動（Found） | 301 と同じ（事実上の標準動作を踏襲） | 破棄 | 一時的ジャンプ、ログイン後の転送 |
| 303 | 他を参照（See Other） | 必ず GET に変更 | 破棄 | POST 後の結果ページへの遷移 |
| 307 | 一時リダイレクト | 元のメソッドを維持 | 保持して再送 | ボディ再送が必要な一時的ジャンプ |
| 308 | 恒久リダイレクト | 元のメソッドを維持 | 保持して再送 | ボディ再送が必要な恒久的ジャンプ |

:::warning リクエストボディ付きの 307/308 は自動追跡されない
307/308 は元のメソッドで**リクエストボディをリプレイ**することを要求します。基盤の net/http はリクエストボディがリプレイ可能（`GetBody` が設定済み）な場合のみ追跡しますが、HTTPC はリクエスト構築時にこの関数を設定していません——そのため、空でないリクエストボディを持つリクエストが 307/308 を受け取っても**自動追跡せず、3xx レスポンスがそのまま返ります**（エラーにはなりません）。この種のジャンプを追跡する必要がある場合は、`WithFollowRedirects(false)` で手動ループ処理を行うか、サーバー側で 302/303 に変更してください。
:::

:::tip 300/304 とその他 3xx は追跡対象外
`Location` ヘッダーを携帯していても、エンジンが追跡するのは 301/302/303/307/308 のみです。300（Multiple Choices）、304（Not Modified）およびその他の 3xx レスポンスはそのまま返り、呼び出し側で処理します。なお `Result.IsRedirect()` が判定するのは 300～399 の全区間であり、自動追跡の有無とは無関係です。
:::

:::tip 上限超過ですぐエラー
リダイレクト回数が `MaxRedirects` を超えるとリクエストはエラーで終了します（エラーメッセージ例：`stopped after 3 redirects`）。無限ループにはなりません。`MaxRedirects` の有効範囲は 0-50 で、範囲外の値は設定検証でエラーになります。
:::

## 追跡の制御

リダイレクト設定は 3 つのレベルに分散しており、作用範囲は大きい順に：

| レベル | 設定 | 作用範囲 |
|------|------|----------|
| クライアントレベル | `Config.Defaults.FollowRedirects` / `MaxRedirects` | クライアント全体のすべてのリクエスト |
| リクエストレベル | `WithFollowRedirects(bool)` / `WithMaxRedirects(n)` | 単一リクエスト、クライアント設定を上書き |
| プリセット | `SecureConfig()`、`MinimalConfig()`（いずれも `FollowRedirects=false`） | セキュリティ/ミニマルシナリオではデフォルトで追跡しない |

### クライアントレベル

`Config.Defaults`（`RequestDefaults`）がクライアント全体のリダイレクトポリシーを設定します：

```go
cfg := httpc.DefaultConfig()
cfg.Defaults.FollowRedirects = true  // デフォルト：追跡する
cfg.Defaults.MaxRedirects = 5        // デフォルト：10

client, err := httpc.New(cfg)
```

### リクエストレベル

`WithFollowRedirects` / `WithMaxRedirects` は単一リクエストでクライアント設定を上書きします：

```go
// このリクエストだけ追跡を無効化し、3xx レスポンスを直接受け取る
result, err := httpc.Get("https://httpbin.org/redirect/1",
    httpc.WithFollowRedirects(false),
)
if result.IsRedirect() {
    fmt.Println(result.Response.Headers.Get("Location")) // リダイレクト先アドレス
}

// このリクエストだけ 3 回に制限
result, err = httpc.Get(url, httpc.WithMaxRedirects(3))
```

:::warning MaxRedirects(0) は無効化ではない
`0` は「未設定」のセンチネル値です——エンジンはデフォルト値の 10 にフォールバックし、リダイレクトを無効化しません。無効化するには `WithFollowRedirects(false)` または `Config.Defaults.FollowRedirects = false` を使用してください。
:::

:::tip SecureConfig はデフォルトでリダイレクト無効
`SecureConfig()` プリセットは `FollowRedirects` を `false` に設定し、リダイレクト経由でリクエストを内部アドレスへ誘導する攻撃（リダイレクト型 SSRF）を防ぎます。セキュリティの詳細は [SSRF 防護](../security/ssrf) を参照してください。
:::

## リダイレクトチェーンの追跡

`Result.Meta` はリクエストごとのリダイレクト情報を記録します：

| フィールド | 説明 |
|------|------|
| `Meta.RedirectCount` | 実際に追跡したリダイレクト回数 |
| `Meta.RedirectChain` | リダイレクト過程で経由した URL シーケンス |

2 つのフィールドの正確な意味：

- `RedirectChain` に記録されるのは各ホップの**送信元 URL** です：最初の項目は初期リクエスト URL、以降は各中間 URL が順に並びます。**最終ターゲット URL はチェーンに含まれません**。最終アドレスが必要な場合は `result.Request.URL`（追跡完了後の最終リクエスト URL）を読んでください。
- `RedirectCount` は常に `len(RedirectChain)` と等しくなります。

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    result, err := httpc.Get("https://httpbin.org/redirect/3")
    if err != nil {
        log.Fatal(err)
    }

    fmt.Printf("%d 回のリダイレクトを追跡\n", result.Meta.RedirectCount)
    for i, u := range result.Meta.RedirectChain {
        fmt.Printf("  %d. %s\n", i+1, u)
    }
    fmt.Println("最終アドレス：", result.Request.URL)
    // 出力：
    //   1. https://httpbin.org/redirect/3
    //   2. https://httpbin.org/redirect/2
    //   3. https://httpbin.org/redirect/1
    // 最終アドレス： https://httpbin.org/get
}
```

## クロスドメイン資格情報の自動剥離

リダイレクトを追跡する際、エンジンは各ホップでターゲットのホスト名を検査します：**初期リクエスト**のホスト名と一致しない（クロスドメインジャンプ）場合、機密リクエストヘッダーを自動的に削除し、資格情報がリダイレクト先へ漏れるのを防ぎます：

| リクエストヘッダー | ターゲットホスト = 初期リクエストホスト | ターゲットホスト ≠ 初期リクエストホスト |
|--------|------------------------|------------------------|
| `Authorization` | 保持 | 削除 |
| `Proxy-Authorization` | 保持 | 削除 |
| `Cookie` | 保持 | 削除 |
| その他のカスタムヘッダー | 保持 | 保持 |

判定の詳細：

- 比較基準は**初期リクエスト**のホスト名（最初のホップの `via[0]`）であり、前のホップではありません。`api.example.com → www.example.com` はクロスドメインです（ホスト名の厳密比較、サブドメインが異なっても別扱い）；`A → B → A` のように初期ホストへ戻る場合は剥離されません。
- 剥離は cookie jar とは独立しています：`EnableCookies` が有効でなくても、手動で設定した `Cookie` リクエストヘッダーはクロスドメインジャンプ時に同様に削除されます。

`WithBasicAuth` / `WithBearerToken` と併用する場合の追加対応は不要です——トークンは元のホストにのみ送られ、ジャンプに伴って第三者ドメインへ渡されることはありません。

## 循環リダイレクト検出

回数上限に加えて、エンジンは**循環リダイレクト**（ジャンプ先が既にチェーン内に出現している）も検出します。該当するとリクエストは直ちにエラーで終了し、回数を使い切るまで待つ必要がありません：

```text
A → B → A     循環：エラー circular redirect detected: A
A → A → A     同一 URL の連続：循環とは見なされない（サーバーは毎回異なるレスポンスを返す可能性がある）
```

循環検出と `MaxRedirects` の回数上限は互いに補完します：回数上限はあらゆるループを最終的に防ぎ止め、循環検出は「明らかに循環している」チェーンを早期に見抜いて無駄なリクエストを減らします。

## リダイレクトエラーの分類

追跡が拒否された場合（超過、循環、ホワイトリスト、SSRF ブロック）、リクエストは `ClientError` で終了し、Type は一律 `ErrorTypeValidation` です：

| 基盤のエラーメッセージ | Message フィールド | トリガー条件 |
|--------------|--------------|----------|
| `stopped after N redirects` | `redirect limit exceeded` | ジャンプ回数が `MaxRedirects`（またはデフォルト 10）に到達 |
| `circular redirect detected: <URL>` | `circular redirect detected` | ターゲット URL が既にジャンプチェーン内に存在 |
| `redirect blocked by whitelist: ...` | `redirect blocked by policy` | ターゲットドメインが `RedirectWhitelist` に含まれない |
| `redirect blocked: ...` | `redirect blocked by policy` | ターゲットホストが SSRF 防護にブロックされた |

```go
package main

import (
    "errors"
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Defaults.MaxRedirects = 2 // 2 回のみ追跡を許可

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // /redirect/5 は 5 回の追跡が必要なため、必ず上限を超える
    _, err = client.Get("https://httpbin.org/redirect/5")
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) && clientErr.Type == httpc.ErrorTypeValidation {
            fmt.Println("リダイレクトが拒否されました：", clientErr.Message)
            // 出力：リダイレクトが拒否されました： redirect limit exceeded
        }
    }
}
```

リダイレクトターゲットの SSRF 検証にはさらに 2 つの硬性ルールがあります：**http/https プロトコルのみ許可**（`ftp://` やカスタムプロトコルの `Location` は拒否）と、**ターゲットホストは空であってはならない**ことです。検証段階では DNS 解決は行われません——完全な IP 検証と DNS rebinding 防護は接続確立時にダイヤラーが実行します（詳細は [SSRF 防護](../security/ssrf) を参照）。

## ドメインホワイトリスト

`Security.RedirectWhitelist` はリダイレクト先を信頼済みドメインに制限し、オープンリダイレクト攻撃を防ぎます：

```go
cfg := httpc.DefaultConfig()
cfg.Security.RedirectWhitelist = []string{
    "api.example.com",
    "*.cdn.example.com", // ワイルドカード：厳密なサブドメインのみマッチ、ベアドメインは対象外
}

client, err := httpc.New(cfg)
```

マッチングルールの詳細：

- **完全一致**：`api.example.com` は自身のみにマッチします。
- **ワイルドカード**：`*.cdn.example.com` は**厳密なサブドメイン**（`img.cdn.example.com` など）にマッチし、ベアドメイン `cdn.example.com` にはマッチしません。両方を許可するには両方を列挙する必要があります。
- 比較対象は `Location` ターゲットの**ホスト名**（ポートとプロトコルを含まない）で、比較前に正規化されます：前後の空白を無視し、大文字小文字を区別しません。

設定後、ホワイトリスト外ドメインへのリダイレクトは拒否され、リダイレクト先は SSRF IP 検証も同時に受けます。ユーザー提供の URL を扱う場合は、`SecureConfig` またはホワイトリストと併用することを推奨します。

## 手動でのリダイレクト処理

ホップごとの検査、条件付き追跡、カスタムロギングが必要な場合は、自動追跡を無効化してループ処理します。2 点注意してください：`Location` は**相対アドレス**の可能性があるため、現在の URL に基づいて絶対アドレスへ解決する必要があります；また手動ループはホワイトリスト検査を経ませんが、各ホップの接続確立時に接続層の SSRF IP 検証は通常どおり有効です。

```go
package main

import (
    "fmt"
    "log"
    "net/url"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Defaults.FollowRedirects = false

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    currentURL := "https://httpbin.org/redirect/3"
    base, err := url.Parse(currentURL)
    if err != nil {
        log.Fatal(err)
    }

    for i := 0; i < 5; i++ {
        result, err := client.Get(currentURL)
        if err != nil {
            log.Fatal(err)
        }
        if !result.IsRedirect() {
            fmt.Println("最終アドレスに到達：", currentURL)
            break
        }

        location := result.Response.Headers.Get("Location")
        if location == "" {
            fmt.Println("リダイレクトレスポンスに Location ヘッダーがなく、追跡を停止")
            break
        }

        // 相対アドレスを現在の URL に基づいて絶対アドレスへ解決
        next, err := base.Parse(location)
        if err != nil {
            log.Fatal(err)
        }
        fmt.Printf("ホップ %d：%s\n", i+1, next.String())

        currentURL = next.String()
        base = next
    }
}
```

:::tip 手動ループにおけるセキュリティ責任
自動追跡時のホワイトリストとリダイレクトターゲットの事前検査は、手動ループには作用しません。信頼できないソースの `Location` を扱う場合は、ループ内で自分でターゲットドメインを検証する（またはホワイトリストのロジックを再利用する）ことを推奨します。接続層の SSRF 検証は引き続き最終防衛線として機能しますが、ドメインレベルの制御は自前で行う必要があります。
:::

## よくある質問

| 現象 | 原因 | 解決策 |
|------|------|----------|
| POST が 307/308 を受けても追跡されない | リクエストボディがリプレイ不可（`GetBody` 未設定）で、仕様により自動追跡されない | 手動ループで処理、またはサーバー側で 302/303 に変更 |
| `WithMaxRedirects(0)` が追跡を無効化しない | `0` は「未設定」のセンチネル値で、デフォルト 10 にフォールバック | `WithFollowRedirects(false)` を使用 |
| `Location` 付きの 300/399 がジャンプしない | エンジンが追跡するのは 301/302/303/307/308 のみ | `IsRedirect()` + `Location` で自分で処理 |
| ジャンプ後にクエリパラメータが「失われる」 | ターゲットのクエリ文字列は完全に `Location` で決まり、クライアントは元リクエストのパラメータをマージしない | サーバー側で `Location` に必要なパラメータを含める |
| 最終的にどのドメインに着地したか知りたい | `RedirectChain` には最終 URL が含まれない | `result.Request.URL` を読む |
| クロスドメインジャンプ後にリクエストが 401 | `Authorization`/`Cookie` がクロスドメインで剥離された（セキュリティ設計） | 新しいドメインで再認証、またはサーバー側で同ドメインジャンプに変更 |

## 次のステップ

- [リクエストとレスポンス](./request-response) - リクエストオプションとレスポンス処理
- [SSRF 防護](../security/ssrf) - リダイレクトにおける SSRF 検証の詳細
- [エラー処理](./error-handling) - ErrorType 分類とエラーマッチング
- [設定 API](../api-reference/client-config/config) - RequestDefaults とセキュリティフィールドのリファレンス
