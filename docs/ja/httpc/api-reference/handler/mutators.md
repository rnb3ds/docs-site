---
sidebar_label: "リクエストとレスポンスミューテータ"
title: "リクエストとレスポンスミューテータ - CyberGo HTTPC | Mutator インターフェース"
description: "HTTPC ミドルウェア読み書き契約の詳細：RequestMutator と ResponseMutator は httpc がミドルウェアに公開する 2 つの合成インターフェースで、それぞれリクエストとレスポンスの全読み取りメソッドと書き込みメソッドを提供し、ミューテータ経由でリクエストヘッダーを書き換え、レスポンスステータスコードを読み取るコンパイル可能な例を付属。"
sidebar_position: 2
---

# リクエストとレスポンスミューテータ

ミドルウェアは基礎となるリクエスト/レスポンスオブジェクトを直接操作せず、**ミューテータ（Mutator）**インターフェースを通じて読み書きします。ミドルウェアは常に完全な読み書きミューテータ（`RequestMutator` / `ResponseMutator`）を受け取ります。以下の「読み取りメソッド」「書き込みメソッド」のグループ分けは読みやすさのためであり、個別にエクスポートされたインターフェースではありません。

```text
RequestMutator  =  読み取りメソッド  +  書き込みメソッド
ResponseMutator =  読み取りメソッド  +  書き込みメソッド
        ↑                                    ↑
  ミドルウェアが RequestMutator で       ミドルウェアが ResponseMutator で
  リクエストを書き換える                 レスポンスを読み取り/書き換える
```

`Handler` シグネチャ `func(ctx, RequestMutator) (ResponseMutator, error)` がまさにこの 2 つのミューテータをミドルウェアの入口と出口として公開しています。

## リクエストミューテータ

### 読み取りメソッド

以下のメソッドはリクエストデータを読み取ります。ミドルウェアがリクエストプロパティを**検査**だけする場合に呼び出します。

| メソッド | 戻り値の型 | 説明 |
|------|----------|------|
| `Method()` | `string` | HTTP メソッド |
| `URL()` | `string` | リクエスト URL |
| `Headers()` | `map[string]string` | 全リクエストヘッダー（キー→単一値） |
| `QueryParams()` | `map[string]any` | クエリパラメータ |
| `Body()` | `any` | リクエストボディ |
| `Timeout()` | `time.Duration` | リクエストタイムアウト |
| `MaxRetries()` | `int` | 最大リトライ回数 |
| `Context()` | `context.Context` | リクエストコンテキスト |
| `Cookies()` | `[]http.Cookie` | リクエスト Cookie |
| `FollowRedirects()` | `*bool` | リダイレクトを追うかどうか（nil はデフォルト値を使用） |
| `MaxRedirects()` | `*int` | 最大リダイレクト回数（nil はデフォルト値を使用） |
| `StreamBody()` | `bool` | リクエストボディをストリーミングするかどうか |

### 書き込みメソッド

以下のメソッドはリクエストデータを変更します。ミドルウェアがリクエストプロパティを**変更**だけする場合に呼び出します。

| メソッド | 説明 |
|------|------|
| `SetMethod(string)` | HTTP メソッドの設定 |
| `SetURL(string)` | URL の設定 |
| `SetHeaders(map[string]string)` | 全リクエストヘッダーの設定（全体置換） |
| `SetHeader(key, value string)` | 単一リクエストヘッダーの設定（追加/変更） |
| `SetQueryParams(map[string]any)` | クエリパラメータの設定 |
| `SetBody(any)` | リクエストボディの設定 |
| `SetTimeout(time.Duration)` | タイムアウトの設定 |
| `SetMaxRetries(int)` | 最大リトライ回数の設定 |
| `SetContext(context.Context)` | コンテキストの設定 |
| `SetCookies([]http.Cookie)` | Cookie の設定 |
| `SetFollowRedirects(*bool)` | リダイレクトを追うかどうかの設定 |
| `SetMaxRedirects(*int)` | 最大リダイレクト回数の設定 |
| `SetStreamBody(bool)` | ストリーミングするかどうかの設定 |

### RequestMutator

`RequestMutator` は httpc が公開する読み書き兼用のリクエストミューテータで、上の「読み取りメソッド」と「書き込みメソッド」両表の全メソッドを含みます。内部の読み取り/書き込み分割インターフェースは `internal/types` パッケージにあり、個別にはエクスポートされず、外部からは一様に `RequestMutator` として参照されます。ミドルウェアがリクエスト送信前にこれを通じてリクエストプロパティを検査・書き換えます。

## ミドルウェア内での RequestMutator の典型的操作

| 操作シナリオ | メソッドの組み合わせ | 説明 |
|----------|----------|------|
| リクエストヘッダーの変更 | `SetHeader(key, val)` / `Headers()` + `SetHeader` | 認証ヘッダー、トレース ID、API バージョンの注入 |
| クエリパラメータの変更 | `QueryParams()` → 追加/削除 → `SetQueryParams` | 共通クエリパラメータの追加 |
| リクエストボディの変更 | `Body()` → 変換 → `SetBody` | リクエストボディの圧縮、署名の注入 |
| タイムアウトの設定 | `SetTimeout(d)` | リクエストパスごとに動的にタイムアウトを調整 |
| コンテキストの設定 | `SetContext(ctx)` | ミドルウェアレベルのタイムアウト（`TimeoutMiddleware` の仕組み） |

```go
// 典型例：既存のリクエストヘッダーを読み取り、カスタムヘッダーを追加して書き戻す
headers := req.Headers()
headers["X-Trace-ID"] = generateTraceID()
req.SetHeaders(headers)

// 等価な書き方（より簡潔）
req.SetHeader("X-Trace-ID", generateTraceID())
```

## レスポンスミューテータ

### 読み取りメソッド

以下のメソッドはレスポンスデータを読み取ります。

| メソッド | 戻り値の型 | 説明 |
|------|----------|------|
| `StatusCode()` | `int` | ステータスコード |
| `Status()` | `string` | ステータステキスト（例：`"200 OK"`） |
| `Proto()` | `string` | プロトコルバージョン（例：`"HTTP/1.1"`） |
| `Headers()` | `http.Header` | レスポンスヘッダー |
| `Body()` | `string` | レスポンスボディ（文字列） |
| `RawBody()` | `[]byte` | レスポンスボディ（バイト） |
| `ContentLength()` | `int64` | コンテンツ長 |
| `Duration()` | `time.Duration` | リクエスト所要時間 |
| `Attempts()` | `int` | 試行回数（リトライ含む） |
| `Cookies()` | `[]*http.Cookie` | レスポンス Cookie |
| `RedirectChain()` | `[]string` | リダイレクトチェーン（各ホップの URL） |
| `RedirectCount()` | `int` | リダイレクト回数 |
| `RequestHeaders()` | `http.Header` | 実際に送信されたリクエストヘッダー |
| `RequestURL()` | `string` | 実際のリクエスト URL（リダイレクト後の最終 URL を含む） |
| `RequestMethod()` | `string` | リクエストメソッド |

### 書き込みメソッド

以下のメソッドはレスポンスデータを変更します。

| メソッド | 説明 |
|------|------|
| `SetStatusCode(int)` | ステータスコードの設定 |
| `SetStatus(string)` | ステータステキストの設定 |
| `SetProto(string)` | プロトコルバージョンの設定 |
| `SetHeaders(http.Header)` | レスポンスヘッダーの設定（全体置換） |
| `SetBody(string)` | レスポンスボディの設定 |
| `SetRawBody([]byte)` | レスポンスボディ（バイト）の設定 |
| `SetContentLength(int64)` | コンテンツ長の設定 |
| `SetDuration(time.Duration)` | 所要時間の設定 |
| `SetAttempts(int)` | 試行回数の設定 |
| `SetCookies([]*http.Cookie)` | Cookie の設定 |
| `SetRedirectChain([]string)` | リダイレクトチェーンの設定 |
| `SetRedirectCount(int)` | リダイレクト回数の設定 |
| `SetRequestHeaders(http.Header)` | リクエストヘッダーの設定 |
| `SetRequestURL(string)` | リクエスト URL の設定 |
| `SetRequestMethod(string)` | リクエストメソッドの設定 |
| `SetHeader(key string, values ...string)` | 単一レスポンスヘッダーの設定（追加/変更） |

### ResponseMutator

`ResponseMutator` は httpc が公開する読み書き兼用のレスポンスミューテータで、上の「読み取りメソッド」と「書き込みメソッド」両表の全メソッドを含みます。内部の読み取り/書き込み分割インターフェースは `internal/types` パッケージにあり、個別にはエクスポートされず、外部からは一様に `ResponseMutator` として参照されます。ミドルウェアがリクエスト完了後にこれを通じてレスポンスを読み取りまたは書き換え、レスポンスキャッシュ、コンテンツ変換（JSON の整形など）、エンコード/デコード、レスポンスフィルタリングによく使用されます。

## ミドルウェア内での ResponseMutator の典型的操作

| 操作シナリオ | メソッドの組み合わせ | 説明 |
|----------|----------|------|
| ステータスコードの読み取り | `StatusCode()` | 条件ログ、エラー分類 |
| レスポンスヘッダーの読み取り | `Headers()` | `X-Request-ID`、`Content-Type` の抽出 |
| メトリクスの計算 | `Duration()` + `Attempts()` | 所要時間、リトライ回数の報告 |
| リダイレクトの追跡 | `RedirectChain()` + `RedirectCount()` | リダイレクトパスの監査 |
| レスポンスヘッダーの変更 | `SetHeader(key, vals...)` | トレースヘッダー、セキュリティヘッダーの追加 |

## 型アサーション：エンジン固有メソッドへのアクセス

ミドルウェアが受け取る `RequestMutator` は実行時には実際に `*engine.Request` 型（エンジンの具象リクエスト構造体）です。`finalHandler` は型アサーション経由でインターフェース上にない 3 つのエンジン固有フックを読み取ります。カスタムミドルウェアがこれらのフックにアクセスする必要がある場合も、同様に型アサーションが必要です。

:::warning インターフェースの境界
`OnRequest`/`OnResponse` コールバックと `AllowPrivateIPs` は `RequestMutator` インターフェース上にありません——これらのシグネチャは内部パッケージ `engine` の型（`*engine.Request`/`*engine.Response`）を参照しており、公開インターフェースに公開すると循環インポートになるためです。そのため `*engine.Request` 型アサーション経由でのみアクセスできます。
:::

これらのエンジン固有メソッドには以下が含まれます：

| メソッド（`*engine.Request` のみ） | 説明 |
|-------------------------------------|------|
| `OnRequest() func(*engine.Request) error` | リクエスト送信前のコールバック |
| `OnResponse() func(*engine.Response) error` | レスポンス受信後のコールバック |
| `AllowPrivateIPs() *bool` | リクエストごとの SSRF 上書き |
| `SetOnRequest(func)` / `SetOnResponse(func)` | コールバックの設定 |
| `SetAllowPrivateIPs(*bool)` | SSRF 上書きの設定 |

ほとんどのミドルウェアは型アサーションを**必要としません**——`RequestMutator`/`ResponseMutator` インターフェースがすべての一般的な読み書き操作をカバーしています。コールバックや SSRF 上書きが必要な場合のみ具象型へのアサーションが必要です。

## SanitizedURL キャッシュ

複数のミドルウェアがマスク済み URL（認証情報を削除した URL）を記録する必要がある場合があります。重複計算を避けるため、HTTPC はリクエストオブジェクト上にマスク結果をキャッシュし、同一リクエストの複数ミドルウェアで共有します。

```text
getOrComputeSanitizedURL(req):
  ① req は sanitizedURLer インターフェース（SanitizedURL/SetSanitizedURL）を実装しているか？
     - *engine.Request はこのインターフェースを実装
  ② キャッシュ済み？ → キャッシュ値を直接返す
  ③ 未キャッシュ？ → SanitizeURL(req.URL()) を計算、キャッシュして返す
```

内蔵の `LoggingMiddleware`、`MetricsMiddleware`、`AuditMiddleware` はすべて `getOrComputeSanitizedURL` を使用してマスク結果を共有し、URL のマスク処理がチェーン全体で**1 回のみ計算**されるようにします。カスタムミドルウェアが URL を記録する際も、`req.URL()` を直接呼び出すのではなく（認証情報を含む可能性）、このメカニズムを使用すべきです。

:::tip URL マスク
ログ/メトリクスミドルウェアで URL を記録する際、`req.URL()` を直接使用しないでください——URL に `user:pass@host` 形式の認証情報が含まれていると、ログに漏洩します。内蔵ミドルウェアは `getOrComputeSanitizedURL` 経由で認証情報部分を自動的に削除します。
:::

## 例：ミューテータでリクエスト・レスポンスを読み書き

認証ミドルウェア：`RequestMutator` の `SetHeader` メソッドで認証ヘッダーを注入し、`ResponseMutator` の `StatusCode` メソッドでレスポンスステータスコードを読み取ります。

```go
package main

import (
	"context"
	"fmt"

	"github.com/cybergodev/httpc"
)

// authMiddleware は RequestMutator で認証ヘッダーを注入し、
// ResponseMutator でステータスコードを読み取ります
func authMiddleware(token string) httpc.MiddlewareFunc {
	return func(next httpc.Handler) httpc.Handler {
		return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
			// 書き込み：RequestMutator でリクエストヘッダーを設定
			req.SetHeader("Authorization", "Bearer "+token)
			// 読み取り：RequestMutator でリクエストメソッドを検査
			fmt.Printf("%s リクエストを送信\n", req.Method())

			resp, err := next(ctx, req)
			if err != nil {
				return nil, err
			}
			// 読み取り：ResponseMutator でステータスコードを取得
			fmt.Printf("ステータスコード %d を受信\n", resp.StatusCode())
			return resp, nil
		}
	}
}

func main() {
	cfg := httpc.DefaultConfig()
	cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
		authMiddleware("my-secret-token"),
	}
	client, err := httpc.New(cfg)
	if err != nil {
		panic(err)
	}
	defer client.Close()

	result, err := client.Get("https://httpbin.org/get")
	if err != nil {
		panic(err)
	}
	fmt.Println(result.IsSuccess())
	// 出力例：
	// GET リクエストを送信
	// ステータスコード 200 を受信
	// true
}
```

## 実践例：リクエスト/レスポンスログミドルウェア

完全なログミドルウェアで、`RequestMutator` と `ResponseMutator` の読み書き能力を同時に示します——ミューテータ経由でリクエストメソッド/URL とレスポンスのステータスコード/所要時間/リトライ情報を読み取り、統一フォーマットで出力します。

```go
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/cybergodev/httpc"
)

// loggingMiddleware はミューテータ経由でリクエストとレスポンスの完全な情報を読み取り、フォーマットして出力します
func loggingMiddleware() httpc.MiddlewareFunc {
	return func(next httpc.Handler) httpc.Handler {
		return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
			start := time.Now()

			// リクエストフェーズ：リクエスト情報を読み取り
			log.Printf("[REQ] %s %s", req.Method(), req.URL())

			resp, err := next(ctx, req)
			duration := time.Since(start)

			if err != nil {
				// エラーレスポンス：ステータスコードを読み取れない
				log.Printf("[ERR] %s %s -> %v (%v)",
					req.Method(), req.URL(), err, duration)
				return nil, err
			}

			// レスポンスフェーズ：ステータスコード、所要時間、リトライ回数、リダイレクトチェーンを読み取り
			log.Printf("[RESP] %s %s -> %d (%v, attempts=%d, redirects=%d)",
				req.Method(),
				req.URL(),
				resp.StatusCode(),
				duration,
				resp.Attempts(),
				resp.RedirectCount(),
			)
			return resp, nil
		}
	}
}

func main() {
	cfg := httpc.DefaultConfig()
	cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
		loggingMiddleware(),
	}
	client, err := httpc.New(cfg)
	if err != nil {
		panic(err)
	}
	defer client.Close()

	result, err := client.Get("https://httpbin.org/get")
	if err != nil {
		panic(err)
	}
	fmt.Println("ステータスコード:", result.StatusCode())
	// 出力例：
	// [REQ] GET https://httpbin.org/get
	// [RESP] GET https://httpbin.org/get -> 200 (123.456ms, attempts=1, redirects=0)
	// ステータスコード: 200
}
```

## 関連項目

- [Handler とミドルウェアチェーン](./handler-chain) — 二重階層アーキテクチャとオニオンモデルの概要
- [内蔵ミドルウェア](../client-config/middleware) — HeaderMiddleware などはミューテータ経由で動作する完成例です
- [インターフェース定義](../types/interfaces) — ミューテータの型エイリアス定義
