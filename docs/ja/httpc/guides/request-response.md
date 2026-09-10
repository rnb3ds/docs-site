---
sidebar_label: "リクエストとレスポンス"
title: "リクエストとレスポンス - CyberGo HTTPC | リクエストオプションと応答処理"
description: "HTTPC のリクエストとレスポンス完全ガイド：パッケージ関数、WithJSON/WithForm/WithBody リクエストボディ、WithQuery クエリパラメータ、Cookie と認証、Result 解析、コンテキスト制御、ストリーミングアップロード、自動解凍とサイズ制限を解説します。"
sidebar_position: 3
---

# リクエストとレスポンス

## リクエストの送信

### パッケージ関数

クライアントを作成せず、直接リクエストを送信します：

```go
result, err := httpc.Get("https://api.example.com/data")
if err != nil {
    log.Fatal(err)
}

fmt.Println(result.StatusCode())
fmt.Println(result.Body())
```

対応 HTTP メソッド：`Get`、`Post`、`Put`、`Patch`、`Delete`、`Head`、`Options`。

パッケージ関数は遅延初期化される 1 つのデフォルトクライアントを共有します。`SetDefaultClient` で引き継ぎ、`CloseDefaultClient` で解放できます（詳細は[チュートリアル](./tutorial)を参照）。

### クライアントインスタンス

```go
client, err := httpc.NewDefault()
if err != nil {
    log.Fatal(err)
}
defer client.Close()

result, err := client.Get("https://api.example.com/data")
```

クライアントインスタンスは並行に安全に使用でき、常駐して再用すべきです。`Close()` 後のリクエストは `ErrClientClosed` を返します。

### 汎用リクエストメソッド

```go
ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()

result, err := httpc.Request(ctx, "GET", "https://api.example.com/data")
```

`Request` は任意のメソッド文字列を受け付けるため、汎用的なプロキシ/ゲートウェイ類のロジックの実装に適しています。クライアントメソッド `client.Request` も同じ使い方です。

## リクエストオプション

### リクエストヘッダー

```go
result, err := client.Get(url,
    httpc.WithHeader("Authorization", "Bearer token"),
    httpc.WithHeader("X-Custom", "value"),
    httpc.WithHeaderMap(map[string]string{
        "Accept":        "application/json",
        "X-Request-ID":  "123",
    }),
    httpc.WithUserAgent("my-app/1.0"),
)
```

すべてのヘッダーのキーと値には CRLF インジェクション検証が行われ、制御文字を含む、または過長なキーと値は `ErrInvalidHeader` を返します。リクエストヘッダーの最終的な適用順序は：リクエストボディの Content-Type → クライアントのデフォルトヘッダー（`Defaults.Headers`）→ オプション/ミドルウェアで設定したヘッダー（後者が同名項目を上書きします）。

### リクエストボディ

```go
// JSON
result, err := client.Post(url, httpc.WithJSON(map[string]any{
    "name": "test",
}))

// XML
result, err := client.Post(url, httpc.WithXML(data))

// フォーム
result, err := client.Post(url, httpc.WithForm(map[string]string{
    "username": "admin",
    "password": "secret",
}))

// バイナリ（デフォルト application/octet-stream）
result, err := client.Post(url, httpc.WithBinary(data))
// タイプ指定
result, err := client.Post(url, httpc.WithBinary(data, "image/png"))

// タイプ自動検出
result, err := client.Post(url, httpc.WithBody(data))
// string → text/plain; charset=utf-8, []byte → application/octet-stream,
// map[string]string → application/x-www-form-urlencoded,
// *FormData → multipart/form-data, io.Reader → passed through,
// その他 → application/json
// 明示的指定も可能：httpc.WithBody(data, httpc.BodyJSON)
```

#### BodyKind の明示的指定

`WithBody(data, kind)` は自動検出をスキップし、指定したタイプで強制的にエンコードします：

| BodyKind | Content-Type | 入力要件 |
|----------|--------------|----------|
| `BodyAuto`（デフォルト） | 入力タイプを自動検出 | 下表を参照 |
| `BodyJSON` | `application/json` | JSON シリアライズ可能な任意の値 |
| `BodyXML` | `application/xml` | XML シリアライズ可能な任意の値 |
| `BodyForm` | `application/x-www-form-urlencoded` | `map[string]string` または `url.Values` |
| `BodyBinary` | `application/octet-stream` | `[]byte` または `string`（空以外） |
| `BodyMultipart` | `multipart/form-data` | `*FormData` |

`BodyAuto` の検出ルール：

| 入力タイプ | Content-Type |
|----------|--------------|
| `string` | `text/plain; charset=utf-8` |
| `[]byte` | `application/octet-stream` |
| `map[string]string` | `application/x-www-form-urlencoded` |
| `*FormData` | `multipart/form-data`（boundary を含む） |
| `io.Reader` | 設定しない（そのまま透過） |
| その他（struct/map など） | `application/json` |

#### フォームと multipart アップロード

```go
// url.Values フォーム（tag=go&tag=http のような同名フィールドを携帯可能）
values := url.Values{"tag": {"go", "http"}, "page": {"2"}}
result, err := client.Post(url, httpc.WithBody(values, httpc.BodyForm))

// multipart/form-data：フィールド + ファイル
form := &httpc.FormData{
    Fields: map[string]string{
        "description": "avatar upload",
    },
    Files: map[string]*httpc.FileData{
        "avatar": {Filename: "avatar.png", Content: pngBytes},
    },
}
result, err = client.Post(url, httpc.WithFormData(form))

// 単一ファイルのショートカット（フィールド名、ファイル名、内容；ファイル名はパス正規化検証を受けます）
result, err = client.Post(url, httpc.WithFile("avatar", "avatar.png", pngBytes))
```

フォームフィールドは個別に制御文字と長さの検証を受けます（値の中のタブ文字は許可）。`WithForm` は `WithBody(data, BodyForm)` と等価で、両者は「先に検証してからエンコード」という同一のパスを共有します。

#### ストリーミングリクエストボディ（io.Reader）

```go
// io.Reader はそのまま透過され、Content-Type は設定されない（必要な場合は自分で WithHeader を設定）
result, err := client.Post(url,
    httpc.WithBody(io.LimitReader(file, 10<<20)), // 最大 10MB に制限
    httpc.WithHeader("Content-Type", "application/octet-stream"),
)
```

:::warning io.Reader はサイズ検証をバイパス
`io.Reader` 型のリクエストボディは**リクエストボディのサイズ検証を受けません**。信頼できないソースを読み込む際は、必ず `io.LimitReader` でラップし、メモリが張り詰められるのを防いでください。
:::

### クエリパラメータ

```go
result, err := client.Get(url,
    httpc.WithQuery("page", 1),
    httpc.WithQuery("limit", 10),
)

// または Map を使用
result, err := client.Get(url,
    httpc.WithQueryMap(map[string]any{
        "page":  1,
        "limit": 10,
    }),
)
```

ポイント：
- 値は `string`、`bool`、`int`/`int64`、`uint` 系、`float32`/`float64`、および `fmt.Stringer` を実装する型をサポートします
- 値が `nil` の場合、そのパラメータは URL に**含まれません**（リテラル `<nil>` としてレンダリングされることはありません）
- キーが空、過長、または不正な文字を含む場合はエラーを返します。URL に既にあるクエリ文字列とオプションパラメータはマージされます

### 認証

```go
// Bearer Token
result, err := client.Get(url, httpc.WithBearerToken("my-token"))

// Basic Auth
result, err := client.Get(url, httpc.WithBasicAuth("user", "pass"))
```

両方のオプションがフォーマット検証を行います：`WithBearerToken` はトークンが空または不正な文字を含む場合にエラー；`WithBasicAuth` はユーザー名が空でないことを要求し、ユーザー名/パスワードが過長または不正な文字を含む場合にエラーになります。

### Cookie

```go
result, err := client.Get(url,
    httpc.WithCookie(http.Cookie{Name: "session", Value: "abc"}),
    httpc.WithCookieMap(map[string]string{"session": "abc", "lang": "ja"}),
    httpc.WithCookieString("session=abc; lang=ja"),
)
```

一括設定には `WithCookies` でスライスを一度に渡す方が、複数回の `WithCookie` より効率的です（単一の事前割り当て、単一パスの検証）：

```go
result, err := client.Get(url, httpc.WithCookies([]http.Cookie{
    {Name: "session", Value: "abc"},
    {Name: "lang", Value: "ja"},
}))
```

Cookie にセキュリティ属性の検証が必要な場合、`WithSecureCookie` は**すべての Cookie オプションの後に置く必要があります**——適用時に既に存在する Cookie のみを検証するためです：

```go
result, err := client.Get(url,
    httpc.WithCookie(http.Cookie{Name: "session", Value: "abc"}),
    httpc.WithSecureCookie(httpc.StrictCookieSecurityConfig()), // Secure/HttpOnly/SameSite=Strict を要求
)
```

### リクエスト制御

```go
// タイムアウト
result, err := client.Get(url, httpc.WithTimeout(10*time.Second))

// リトライ
result, err := client.Get(url, httpc.WithMaxRetries(5))

// リダイレクト
result, err := client.Get(url,
    httpc.WithFollowRedirects(false),    // リダイレクトを禁止
)

// コンテキスト（このリクエストだけ ctx を差し替えるのに等しい）
result, err := client.Get(url, httpc.WithContext(ctx))
```

:::tip WithMaxRedirects(0) は無効化ではない
`WithMaxRedirects(0)` はリダイレクトを無効に**しません**——エンジンは `0` を「未設定」とみなし、デフォルト値の 10 にフォールバックします。リダイレクトの追跡を完全に無効にするには、`WithFollowRedirects(false)` を使用してください。リダイレクトの完全な制御、チェーン追跡、ドメインホワイトリストについては [リダイレクト](./redirects) を参照してください。
:::

### コールバック

```go
result, err := client.Get(url,
    httpc.WithOnRequest(func(req httpc.RequestMutator) error {
        log.Printf("リクエスト送信: %s %s", req.Method(), req.URL())
        return nil
    }),
    httpc.WithOnResponse(func(resp httpc.ResponseMutator) error {
        log.Printf("レスポンス受信：%d", resp.StatusCode())
        return nil
    }),
)
```

コールバックがエラーを返すとリクエストは中止されます（`OnResponse` がエラーを返すとリクエスト全体が失敗します）。複数のコールバックは追加順にチェーン実行されます。

:::tip コールバックは「試行」単位、ミドルウェアは「リクエスト」単位で実行
`WithOnRequest`/`WithOnResponse` はエンジン内部でトリガーされ、**各試行（リトライを含む）ごとに実行されます**；一方ミドルウェアチェーンはリトライ周期全体を包み込み、1 つの論理リクエストにつき 1 回だけ実行されます。試行ごとの粒度が必要ならコールバックを、リクエスト全体の粒度が必要なら[ミドルウェア](./middleware-chain)を使用してください。
:::

## レスポンス処理

```go
result, err := client.Get("https://api.example.com/users/1")
if err != nil {
    log.Fatal(err)
}

// ステータス確認
result.StatusCode()     // 200
result.IsSuccess()      // true (2xx)
result.IsRedirect()     // false (3xx)
result.IsClientError()  // false (4xx)
result.IsServerError()  // false (5xx)

// レスポンスの読み取り
result.Body()           // 文字列
result.RawBody()        // []byte
result.Proto()          // "HTTP/1.1"

// JSON 解析
var user User
if err := result.Unmarshal(&user); err != nil {
    log.Fatal(err)
}

// Cookie
cookie := result.GetCookie("session")
if cookie != nil {
    fmt.Println(cookie.Value)
}

// リクエストメタデータ
fmt.Println(result.Meta.Duration)       // リクエスト所要時間
fmt.Println(result.Meta.Attempts)       // 試行回数
fmt.Println(result.Meta.RedirectCount)  // リダイレクト回数
```

### Result の機能一覧

`Result` は 3 つの部分で構成されます：`Request`（実際に送信されたリクエスト情報）、`Response`（レスポンスデータ）、`Meta`（実行メタデータ）。nil 安全なアクセサメソッドを優先して使用してください：

| 分類 | メソッド / フィールド | 説明 |
|------|-------------|------|
| ステータス | `StatusCode()` / `Proto()` / `Response.Status` | ステータスコード、プロトコルバージョン（`HTTP/1.1` など）、ステータステキスト |
| 判定 | `IsSuccess()` / `IsRedirect()` / `IsClientError()` / `IsServerError()` | 2xx / 3xx / 4xx / 5xx |
| 内容 | `Body()` / `RawBody()` / `Response.ContentLength` | 文字列ボディ / 生バイト / Content-Length |
| JSON | `Unmarshal(&v)` | 空ボディは `ErrResponseBodyEmpty`、50MB 超過は `ErrResponseBodyTooLarge` を返す |
| レスポンス Cookie | `GetCookie(name)` / `HasCookie(name)` / `ResponseCookies()` | 名前で取得 / 存在確認 / すべてのレスポンス Cookie |
| リクエスト Cookie | `GetRequestCookie(name)` / `HasRequestCookie(name)` / `RequestCookies()` | 実際にリクエストとともに送信された Cookie（リダイレクト後の最終値を含む） |
| メタデータ | `Meta.Duration` / `Attempts` / `RedirectChain` / `RedirectCount` / `ProxyURL` | 所要時間、試行回数（初回を含む）、リダイレクトチェーン、今回使用したプロキシ |
| ファイル | `SaveToFile(path)` | レスポンスボディをファイルへ書き込み（パストラバーサル / symlink のセキュリティ検証を含む） |
| デバッグ | `String()` | マスク済みサマリ。機密ヘッダーはマスク、本文は 200 文字で切り詰め |

すべてのアクセサは nil 安全です：`Result` または内部ポインタが nil の場合、`StatusCode()` は 0 を、`Body()` は空文字列を、判定メソッドは false を返し、panic しません。

### レスポンスヘッダーとメタデータ

```go
// レスポンスヘッダーは標準の http.Header で、大文字小文字を区別しない
contentType := result.Response.Headers.Get("Content-Type")
date := result.Response.Headers.Get("Date")

// リクエスト側：実際に送信されたヘッダーと Cookie（リダイレクト後は最終リクエスト）
ua := result.Request.Headers.Get("User-Agent")
finalURL := result.Request.URL

// プロキシプールシナリオ：今回のリクエストで実際に使用されたプロキシ
if result.Meta.ProxyURL != "" {
    log.Printf("プロキシ経由：%s", result.Meta.ProxyURL)
}

// リダイレクトチェーン：経由した URL の順列
for i, u := range result.Meta.RedirectChain {
    log.Printf("リダイレクト %d: %s", i+1, u)
}
```

### ファイルへの保存

小さなレスポンスボディはそのまま保存できます（大きなファイルはメモリへの全ロードを避けるため[ファイルダウンロード API](./file-transfer) を使用してください）：

```go
if err := result.SaveToFile("user.json"); err != nil {
    log.Fatal(err) // 空のレスポンスボディ、またはパスがセキュリティ検証を通過しなかった場合（パストラバーサル、symlink など）
}
```

### デバッグ出力

`String()` は単行のサマリを生成し、ログへの出力に適しています：機密ヘッダー（`Authorization`、`Cookie`、`Set-Cookie`、`X-Api-Key` など）は `***` と表示され、レスポンス本文は 200 文字に切り詰められます：

```go
fmt.Println(result.String())
// 出力例：Result{Status: 200 200 OK, ContentLength: 5102, Duration: 150ms,
// Attempts: 1, Headers: 14 [Content-Length, Content-Type, ...], Body: {"id":...}
```

## コンテキスト制御

```go
// タイムアウト制御
ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()
result, err := httpc.Request(ctx, "GET", url)

// キャンセル制御
ctx, cancel := context.WithCancel(context.Background())
go func() {
    time.Sleep(5 * time.Second)
    cancel() // 5 秒後にキャンセル
}()
result, err := httpc.Request(ctx, "GET", url)
```

`WithTimeout` と context タイムアウトの関係：`WithTimeout` は**全リトライの総予算**であり、エンジンはそれをリトライループ全体の外側に適用します；context のキャンセルはトランスポート層で即時に効きます。

## ストリーミングリクエスト

[ストリーミングレスポンス](#ストリーミングレスポンス)と対称に、アップロード側もストリーミングできます：`WithBody` は任意の `io.Reader` を直接受け付け、データを生成しながら送信するため、リクエストボディ全体を先にメモリへ読み込む必要がありません。このセクションではそのセマンティクスと落とし穴を掘り下げます；大きなファイルアップロードの完全なシナリオ（チャンク、チェックサム）は[ファイルアップロードとダウンロード](./file-transfer#ストリーミングアップロード-大容量ファイル)を参照してください。

### io.Reader リクエストボディ

`WithBody(reader)` は自動検出の `io.Reader` ブランチを通ります：Reader はトランスポート層にそのまま透過され、**Content-Type は設定されません**（必要な場合は自分で `WithHeader` を設定）。エンジンは先読みもラップもせず、読み込みペースは完全に HTTP トランスポートが主導します。

::: warning Reader リクエストボディはサイズ検証されないことに注意
`io.Reader` は読み込み即消費のためデータ長を事前に知る術がなく、HTTPC はこれに対して**一切のサイズ検証を行いません**——`Security.MaxRequestBodySize` はメモリ型リクエストボディ（`string`、`[]byte`、`url.Values`、`*FormData`）にのみ作用し、`io.Reader` は無条件で通します。信頼できないソースを読み込む際は必ず `io.LimitReader` でラップしてください。これが唯一のガードレールです。原理の詳細は [FAQ：io.Reader リクエストボディはなぜサイズを検証しない](../faq/#io-reader-リクエストボディはなぜサイズを検証しない) を参照してください。
:::

### リトライとストリーミングのトレードオフ

リトライにはリクエストボディのリプレイが必要ですが、`io.Reader` は一度読むと空になります。エンジンの実際の処理方法：

| リトライ設定 | リクエストボディの動作 |
|----------|------------|
| 有効（デフォルト `Retry.MaxRetries = 3`） | **初回試行の前に** Reader を完全にメモリへ読み込んで `[]byte` に変換し、リトライごとに Reader を再構築してリプレイ；上限は 100MB、超過するとエラーを返します（`retry not supported for streaming bodies exceeding 104857600 bytes`） |
| `WithMaxRetries(0)` | Reader はトランスポート層へ直通、**ゼロバッファの真のストリーミング**；代償としてこのリクエストはリトライされません |

2 つの派生的な差異：

- **Content-Length**：バッファパスは `[]byte` 変換後に長さが既知となるためリクエストは Content-Length を携えます；直通パスは長さ不明のため、HTTP/1.1 では自動的に chunked 転送エンコーディングを使用します。
- **メモリ使用量**：デフォルトのリトライ設定では、初回試行で成功したとしてもリクエストボディは既に完全にメモリへ載っています——このときの「ストリーミング」は手動での `[]byte` 組み立てを省くだけで、ゼロコピーではありません。真の生成しながら送信には、`WithMaxRetries(0)` が必須です。

### WithStreamBody はリクエストボディと無関係

`WithStreamBody(true)` という名前はリクエストボディのストリーミングスイッチと誤解されやすいですが、実際には**レスポンス側**の機構です：レスポンスボディのメモリバッファリングをスキップし、ファイルダウンロード API が内部で使用します。リクエストボディの処理方式にも、上記のリトライバッファ動作にも影響しません——リクエストボディがストリーミングかどうかは「`io.Reader` を渡すか」と「リトライを有効にするか」のみで決まります。詳細は下記の[ストリーミングレスポンス](#ストリーミングレスポンス)を参照してください。

### io.Pipe ゼロコピーアップロード

`io.Pipe` は「データの生成」と「データの送信」を同じパイプに接続します：プロデューサー goroutine が生成しながら書き込み、HTTP トランスポート層が並行して消費し、全リンクに中間バッファがありません。典型的なシナリオ——圧縮ストリームをそのままアップロードし、`.gz` 中間ファイルをディスクに落とさない：

```go
package main

import (
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"time"

	"github.com/cybergodev/httpc"
)

func main() {
	file, err := os.Open("data.json")
	if err != nil {
		log.Fatal(err)
	}
	defer file.Close()

	pr, pw := io.Pipe()
	gw := gzip.NewWriter(pw)

	// プロデューサー：ファイルを読みながら圧縮してパイプへ書き込む
	go func() {
		_, copyErr := io.Copy(gw, file)
		if closeErr := gw.Close(); closeErr != nil && copyErr == nil {
			copyErr = closeErr
		}
		pw.CloseWithError(copyErr) // copyErr が nil の場合は Close と等価
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	// コンシューマー：HTTP トランスポート層がパイプから直接読み取る
	result, err := httpc.Request(ctx, "POST", "https://api.example.com/upload",
		httpc.WithBody(pr),
		httpc.WithMaxRetries(0), // 真のストリーミング：リトライを無効化し、エンジンがリクエストボディ全体をバッファしないようにする
		httpc.WithHeader("Content-Type", "application/gzip"),
	)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println(result.StatusCode(), result.Meta.Attempts)
	// 出力：200 1
}
```

要点：

- プロデューサーのいかなるエラーも `pw.CloseWithError` 経由でコンシューマーに伝える必要があります。そうしないと対端には EOF しか見えず、壊れたデータが完全なアップロードとして扱われます
- `io.Pipe` はリプレイできないため、`WithMaxRetries(0)` との組み合わせが自然です；リトライが必須ならバッファ方式に切り替える必要があります（先にディスクへ落としてからアップロードするなど）
- サーバーは `Content-Type: application/gzip` に従ってチャンクごとに圧縮データを受信するため、受信側はストリーミング解凍すればよく、両端とも完全なバッファリングは不要です

## ストリーミングレスポンス

`WithStreamBody(true)` は内部機構であり、ファイルダウンロード時に完全なレスポンスボディがメモリにキャッシュされるのを防ぎます。有効にすると、レスポンスボディは `Result` に読み込まれません（`Body()` と `RawBody()` は空の値を返します）。

:::warning
`WithStreamBody(true)` はファイルダウンロード API が内部的に使用します。レスポンス内容をストリーミングで取得する必要がある場合は、[ファイルダウンロード API](./file-transfer) を使用してください。
:::

大きなファイルをダウンロードする場合は、ダウンロード API を使用してください：

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/path/to/file"
result, err := client.Download(context.Background(), url, cfg)
```

## レスポンスの解凍

HTTPC は gzip、deflate コンテンツエンコーディングの解凍を自動的に処理します。トランスポート層では Go 標準ライブラリの透過的解凍をオフにし、エンジンが手動で処理します：リクエストには自動的に `Accept-Encoding: gzip, deflate` が携帯されます（`WithHeader("Accept-Encoding", ...)` で上書き可能）。

対応エンコーディング：

| Content-Encoding | 処理方法 |
|------------------|----------|
| `gzip` / `deflate` | 自動解凍（オブジェクトプールで解凍器を再利用） |
| `br`（brotli）/ `compress`（LZW） | 非対応、エラーを返す |
| `identity` / 未知のエンコーディング | そのまま透過 |

セキュリティ設定で解凍後のサイズを制限し、解凍爆弾攻撃を防止できます：

```go
cfg := httpc.DefaultConfig()
cfg.Security.MaxResponseBodySize = 10 * 1024 * 1024      // レスポンスボディ上限：ストリーミングダウンロード時に強制。非ストリーミング時は解凍後上限のフォールバック
cfg.Security.MaxDecompressedBodySize = 100 * 1024 * 1024  // 解凍後最大 100MB
```

| 設定項目 | デフォルト値 | 説明 |
|--------|--------|------|
| `MaxResponseBodySize` | 10MB | ストリーミングダウンロード時のレスポンスボディ上限。非ストリーミング時は解凍後上限のフォールバック |
| `MaxDecompressedBodySize` | 100MB | 解凍後レスポンスボディのサイズ上限（未設定時は `MaxResponseBodySize` にフォールバック） |

圧縮されたレスポンスボディのバイト数には、別途 100MB のハードキャップ（`maxCompressedSize`、設定不可）があり、解凍爆弾への防御として機能し、`MaxResponseBodySize` とは独立しています。

制限を超えると `"exceeds limit"` を含むエラーが返され、`ClientError` タイプでチェック処理できます。`ErrResponseBodyTooLarge` は `Result.Unmarshal()` で 50MB の JSON 解析サイズ制限を超えるレスポンスボディを解析する際に返されます（`MaxResponseBodySize` とは独立）。

## フォーマットユーティリティ

ダウンロード進捗やログのサイズ表示には、パッケージレベルのフォーマット関数（1024 進法）が利用できます：

```go
fmt.Println(httpc.FormatBytes(1536))        // 出力：1.50 KB
fmt.Println(httpc.FormatBytes(1048576))     // 出力：1.00 MB
fmt.Println(httpc.FormatSpeed(1048576))     // 出力：1.00 MB/s
```

## 次のステップ

- [リダイレクト](./redirects) - 追跡制御、チェーン追跡、ドメインホワイトリスト
- [ファイルアップロードとダウンロード](./file-transfer) - 大容量ファイルのストリーミングアップロード、ダウンロードとチェックサム
- [ドメインクライアントとセッション](./domain-session) - セッション管理
- [リクエストオプション API](../api-reference/core/options) - 完全なオプションリファレンス
- [Result API](../api-reference/core/result) - レスポンス処理リファレンス
