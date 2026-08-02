---
sidebar_label: "Handler とミドルウェアチェーン"
title: "Handler とミドルウェアチェーン - CyberGo HTTPC | リクエスト処理パイプライン"
description: "HTTPC Handler パイプラインアーキテクチャ解説：二重階層設計で Layer 1 メソッド API が MiddlewareFunc オニオンチェーンを組み立てて Handler を実行する仕組み、Chain 結合器の原理、clientImpl.middlewareChain 実装メカニズムとカスタムミドルウェア作成例。"
sidebar_position: 1
---

# Handler とミドルウェアチェーン

## 二重階層アーキテクチャ

HTTPC のリクエスト処理は 2 つの階層の連携で成り立ちます：Layer 1 のメソッド API は**薄いラッパー**であり、実際にリクエストを処理するエンジンは Layer 2 の Handler パイプラインです。すべてのリクエストの実行は「Handler チェーンを組み立てて実行する」ことに帰着します。

```text
HTTPC 二重階層アーキテクチャ
├── Layer 1  メソッド API（薄いラッパー）
│     パッケージ関数 httpc.Get/Post/... + Client メソッド + リクエストオプション
│     → 内部的に client.Request → executeRequest で統一
│
└── Layer 2  Handler パイプライン（リクエスト処理エンジン）
      clientImpl.middlewareChain = Chain(middlewares...)(finalHandler)
      MiddlewareFunc(Handler) オニオンチェーン → 組み立て → 実行
```

クライアントにミドルウェアが設定されている場合、`executeRequest` はリクエストオプションを `RequestMutator` に適用してから `clientImpl.middlewareChain` に渡して実行します。ミドルウェアが未設定の場合はエンジンへ直接リクエストを送ります。このチェーンこそが `buildMiddlewareChain` が `New()` 時に一度組み立てて `clientImpl.middlewareChain` フィールドにキャッシュした Handler です。

## 実行フローの詳細

1 回のリクエストが Layer 1 から Layer 2 へ至る完全なパスは以下の通りです：

```text
httpc.Get(url, opts...)              ← Layer 1 パッケージ関数
  → withDefault(ctx, "GET", url, opts)
    → clientImpl.Request(ctx, "GET", url, opts...)   ← デフォルトクライアントのシングルトン
      → clientImpl.executeRequest(ctx, "GET", url, opts)
          │
          ├─ クローズ済み？ → ErrClientClosed
          │
          ├─ ミドルウェアなし？
          │     → c.engine.Request(ctx, method, url, opts...)   ← エンジンへ直接接続
          │
          └─ ミドルウェアあり？
                → engineReq = acquireMiddlewareRequest()         ← オブジェクトプールから取得
                → engineReq.SetMethod/SetURL/SetContext          ← 初期状態を書き込み
                → opts(engineReq) を個別に適用                    ← リクエストオプションが有効化
                → c.middlewareChain(ctx, engineReq)              ← オニオンチェーンに入る
                → Chain が階層ごとにラップ → finalHandler → c.engine.Request
                → defer releaseMiddlewareRequest(engineReq)      ← オブジェクトプールに返却
```

重要な詳細：

- **オブジェクトプール再利用**：ミドルウェアがある場合、`executeRequest` はエンジンの共有オブジェクトプールから `*engine.Request` を取得し（`acquireMiddlewareRequest()` 経由）、リクエストオプションを適用した後 `RequestMutator` としてミドルウェアチェーンに渡します。チェーン全体が**同期的に**実行完了した後、`defer` でリクエストオブジェクトをオブジェクトプールに返却します。
- **ミドルウェアなしの直接接続**：ミドルウェアが未設定の場合はプール化とチェーン組み立てをスキップし、リクエストオプションは直接エンジンに渡されます——オーバーヘッドゼロの高速パスです。
- **デフォルト panic セーフティネット**：`clientImpl.Request` 自体が `recover` を備え、実行パス中の予期しない panic を error に変換して返し、呼び出し元をクラッシュさせません。これは `RecoveryMiddleware` との二重保障を形成します。

## ミドルウェアチェーン組み立てプロセス

`buildMiddlewareChain` は `New()` 時にチェーン全体を**一度組み立てて** `clientImpl.middlewareChain` フィールドにキャッシュします。組み立てプロセスは 2 ステップです：

```text
buildMiddlewareChain(middlewares):

  ① finalHandler（端末ハンドラ）を構築
     finalHandler: func(ctx, req) → req からミドルウェアが変更した全フィールドを読み取り
                                    → 単一の option closure 経由でエンジンに転送
                                    → *engine.Response を返す

  ② Chain(middlewares...)(finalHandler)
     後ろから前に向かって階層ごとにラップ：final = mw[i](final)
     スライス [mwA, mwB, mwC] → mwA(mwB(mwC(finalHandler)))
```

スライスの順序と実行順序の対応関係：スライスで**前にある**ミドルウェアがチェーンの**最も外側**（最初に進入、最後に退出）に位置します。**後ろにある**ミドルウェアは `finalHandler` のすぐ隣（最内層）にあります。`Chain` 結合器はスライスの末尾から逆方向に走査し（`for i := len-1; i >= 0; i--`）、各ミドルウェアを前の層の外側に順番にラップします。

## Handler

```go
type Handler func(ctx context.Context, req RequestMutator) (ResponseMutator, error)
```

リクエスト処理のコア関数シグネチャです。コンテキストとリクエストミューテータを受け取り、レスポンスミューテータまたはエラーを返します。チェーンの末端 Handler（`finalHandler`）はミドルウェアが書き換えたリクエストフィールドを下位エンジンに転送し、実際にネットワークリクエストを送信する役割を担います。

## MiddlewareFunc

```go
type MiddlewareFunc func(Handler) Handler
```

ミドルウェア関数のシグネチャで、「次の Handler」を受け取りラップした Handler を返します。ミドルウェアは `next` 呼び出しの前後にロジック（リクエストの書き換え、レスポンスの記録、panic の回復など）を挿入し、オニオンモデルを形成します：最初のミドルウェアが最も外側で、最初に進入し最後に退出します。

## オニオンモデルの実行順序

```text
リクエスト進入方向 →

  ┌─ Middleware A（外側、最初に実行）─────────────────────┐
  │  ┌─ Middleware B（中間層）──────────────────────────┐  │
  │  │  ┌─ Middleware C（内側、最後に実行）─────────┐  │  │
  │  │  │                                         │  │  │
  │  │  │  finalHandler → engine.Request → ネットワーク │  │  │
  │  │  │                                         │  │  │
  │  │  └──────────────── レスポンス ←────────────────┘  │  │
  │  └──────────────────── レスポンス ←──────────────────┘  │
  └──────────────────────── レスポンス ←────────────────────┘

  ← レスポンス戻り方向

  リクエストフェーズ：A → B → C → finalHandler（外→内）
  レスポンスフェーズ：finalHandler → C → B → A（内→外）
```

ミドルウェアは `MiddlewareConfig.Middlewares` スライスに順序付きで設定され、スライスで**前にある**ミドルウェアがチェーンの**外側の階層**に位置します。

## Chain

```go
func Chain(middlewares ...MiddlewareFunc) MiddlewareFunc
```

複数のミドルウェアを単一のミドルウェアに結合します。返される結合器は最終 Handler を受け取り、ミドルウェアを渡された順序で外側から内側へネストします：スライスの最初のミドルウェアが最も外側（最初に実行）、最後のミドルウェアが最終 Handler のすぐ隣に接します。HTTPC は内部的にこれを使い `MiddlewareConfig.Middlewares` をチェーンに組み立てます。

```go
// 3 つの形式は等価です：Chain で組み立てて一度に注入するか、
// 手動で階層ごとにネストするかで結果は同じです
combined := httpc.Chain(mwA, mwB, mwC)
chain := combined(finalHandler)

// 手動ネストと同等
chain := mwA(mwB(mwC(finalHandler)))
```

:::tip Chain の用途
`Chain` は主に HTTPC が内部の `buildMiddlewareChain` で使用しますが、カスタムミドルウェア内部で複数のサブミドルウェアを単一のミドルウェアにパッケージ化し、ミドルウェアの再利用と組み合わせを実現するのにも使用できます。
:::

## finalHandler 端末ハンドラ

`finalHandler` はミドルウェアチェーンの**端末 Handler**です——すべてのミドルウェアが実行完了した後、ミドルウェアが変更したリクエストフィールドを下位エンジンに転送し、実際にネットワークリクエストを送信します。これは二重階層アーキテクチャで Layer 2 とエンジンの間の橋渡しをします。

finalHandler の動作は 3 ステップです：

```text
finalHandler(ctx, req):

  ① コンテキストの解決：req.Context() を優先、nil の場合はリンク ctx にフォールバック

  ② *engine.Request への型アサーション、エンジン固有フックの抽出：
       - OnRequest コールバック（リクエスト送信前のコールバック）
       - OnResponse コールバック（レスポンス受信後のコールバック）
       - AllowPrivateIPs（リクエストごとの SSRF 上書き）
     これら 3 つのフックは RequestMutator インターフェース上にない（シグネチャが内部型を参照、
     公開すると循環インポートになるため）、型アサーション経由で読み取る

  ③ c.engine.Request(ctx, method, url, optionClosure) の呼び出し
     optionClosure は req の全可変フィールドを新エンジンリクエストに一度に転送：
       headers / queryParams / body / timeout / maxRetries /
       cookies / followRedirects / maxRedirects / allowPrivateIPs /
       streamBody / onRequest / onResponse
```

:::warning 型アサーションの境界
コールバック（`OnRequest`/`OnResponse`）とリクエストごとの SSRF 上書き（`AllowPrivateIPs`）は `RequestMutator` インターフェースではなく、具象型 `*engine.Request` 上に存在します。`finalHandler` は型アサーション経由でこれらのフックを読み取ります。カスタムミドルウェアが `req` を非 `*engine.Request` 型に**置換**した場合、型アサーションが失敗し、これらのフックは**暗黙的にスキップ**されます。すべての内蔵ミドルウェアはその場でリクエストを変更する（置換しない）ため、アサーションは常に成功します。
:::

## 内蔵ミドルウェア

HTTPC は 7 つのすぐ使えるミドルウェアファクトリを内蔵し、`MiddlewareConfig.Middlewares` 経由でクライアントに注入します。各ファクトリは `*XxxConfig` ポインタを受け取り、`nil` を渡すとデフォルト設定を使用します。

| ミドルウェア | ファクトリシグネチャ | 作用 |
|--------|----------|------|
| Recovery | `RecoveryMiddleware()` | チェーン内の panic を捕捉し、スタック付きの error に変換 |
| Logging | `LoggingMiddleware(config *LoggingConfig)` | メソッド/マスク済み URL/ステータスコード/所要時間を記録 |
| RequestID | `RequestIDMiddleware(config *RequestIDConfig)` | `X-Request-ID` ヘッダーを注入（crypto/rand） |
| Timeout | `TimeoutMiddleware(config *TimeoutMiddlewareConfig)` | ミドルウェアレベルのタイムアウト制御 |
| Header | `HeaderMiddleware(config *HeaderConfig)` | 各リクエストに静的リクエストヘッダーを追加 |
| Metrics | `MetricsMiddleware(config *MetricsConfig)` | リクエスト完了後にメトリクスデータをコールバック |
| Audit | `AuditMiddleware(config *AuditConfig)` | セキュリティ監査イベント（金融/医療/政府） |

各ミドルウェアの設定構造体、デフォルトコンストラクタ、詳細な使い方は [内蔵ミドルウェア](../client-config/middleware) を参照してください。

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.RecoveryMiddleware(),                          // 最外層：panic のフォールバック
    httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),
    httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: log.Printf}),
    httpc.TimeoutMiddleware(&httpc.TimeoutMiddlewareConfig{Duration: 30 * time.Second}),
}
```

## カスタムミドルウェアの例

### 例 1：リクエストヘッダー注入ミドルウェア

各リクエストに API キーヘッダーを注入します。`next(ctx, req)` **の前**のリクエスト前処理パターンのデモです。

```go
package main

import (
	"context"
	"fmt"

	"github.com/cybergodev/httpc"
)

// apiKeyMiddleware は各リクエストに X-API-Key 認証ヘッダーを注入します
func apiKeyMiddleware(key string) httpc.MiddlewareFunc {
	return func(next httpc.Handler) httpc.Handler {
		return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
			// RequestMutator.SetHeader 経由で認証ヘッダーを注入（next の前 = リクエスト前処理）
			req.SetHeader("X-API-Key", key)
			// next を呼び出してチェーンを継続；変更後のリクエストはチェーン沿いに finalHandler に渡る
			return next(ctx, req)
		}
	}
}

func main() {
	cfg := httpc.DefaultConfig()
	cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
		apiKeyMiddleware("my-secret-api-key"),
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
	fmt.Println(result.StatusCode())
	// 出力: 200
}
```

### 例 2：レスポンスヘッダー注入ミドルウェア

レスポンスに処理所要時間を追加します。`next(ctx, req)` **の後**のレスポンス後処理パターンのデモです——`ResponseMutator` 経由でレスポンスを読み取り・変更します。

```go
package main

import (
	"context"
	"fmt"
	"time"

	"github.com/cybergodev/httpc"
)

// responseTimeMiddleware はレスポンスヘッダーに処理所要時間を追加します
func responseTimeMiddleware() httpc.MiddlewareFunc {
	return func(next httpc.Handler) httpc.Handler {
		return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
			start := time.Now()
			// 先に next を呼び出してリクエストを継続
			resp, err := next(ctx, req)
			if err != nil {
				return nil, err
			}
			// next の後 = レスポンス後処理：ResponseMutator.SetHeader 経由で所要時間を追加
			resp.SetHeader("X-Response-Time-Ms",
				fmt.Sprintf("%d", time.Since(start).Milliseconds()))
			return resp, nil
		}
	}
}

func main() {
	cfg := httpc.DefaultConfig()
	cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
		responseTimeMiddleware(),
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
	fmt.Println(result.Response.Headers.Get("X-Response-Time-Ms"))
	// 出力例: 156
}
```

### レスポンスキャッシュミドルウェア（概念）

レスポンスキャッシュは `ResponseMutator` の典型的な高度なユースケースです：GET リクエストでキャッシュヒット時にショートサーキットで返し、`next` を呼び出しません。しかし完全なキャッシュレスポンスを構築するには `ResponseMutator` の全メソッド（31 個の読み書きメソッド）を実装するカスタム型が必要で、コード量が多くなります。コアのパターンは以下の通りです：

<!-- check-code: skip -->
```go
func cacheMiddleware(cache Cache) httpc.MiddlewareFunc {
	return func(next httpc.Handler) httpc.Handler {
		return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
			// GET リクエストのみキャッシュ
			if req.Method() == "GET" {
				if cached, ok := cache.Get(req.URL()); ok {
					return cached, nil // キャッシュヒット：ショートサーキット、next を呼び出さない
				}
			}
			// ヒットしない：リクエストを実行
			resp, err := next(ctx, req)
			if err != nil {
				return nil, err
			}
			// レスポンスをキャッシュ（カスタム ResponseMutator の実装が必要）
			cache.Set(req.URL(), resp)
			return resp, nil
		}
	}
}
```

## ミドルウェア実行契約

カスタムミドルウェアを作成する際は以下の契約を遵守する必要があります。そうしないとリソースリークやリクエストの喪失を招きます：

| 契約 | 説明 |
|------|------|
| **`next()` を必ず呼び出す** | `next` を呼び出さないとリクエストは永遠に送信されません（キャッシュヒットなどのショートサーキットミドルウェアを除く）。`next` が返すレスポンスが後続チェーンとエンジンの最終結果です。 |
| **レスポンスは返却または解放必須** | `next` が返す `resp` はそのまま返却される（または以降の `next` を通じて戻される）必要があります。そうしないとエンジンのオブジェクトプールのレスポンスがリークします。`(nil, error)` を返して未解放のレスポンスを保持するとプールリークが発生します。 |
| **panic は RecoveryMiddleware が捕捉** | ミドルウェア内の panic は `RecoveryMiddleware`（設定されている場合）または `clientImpl.Request` のデフォルトセーフティネットが捕捉し error に変換され、呼び出し元に伝播しません。 |
| **同期的実行** | ミドルウェアチェーンは**同期的に実行**されます——`next` が返る時点で内側のチェーン全体が完了しています。非同期ミドルウェアはサポートされません；非同期を導入するとオブジェクトプール再利用パターンでデータ競合が発生します。 |
| **リクエストオブジェクトを置換しない** | カスタムミドルウェアは `req` を**その場で変更**すべきです（`SetHeader`/`SetBody` など経由）。`req` を新オブジェクトで置換しないでください。置換すると `finalHandler` の型アサーションが失敗し、コールバックと SSRF 上書きが暗黙的にスキップされます。 |

:::warning オブジェクトプールリークのリスク
`executeRequest` はエンジンのオブジェクトプールから `*engine.Request` を取得してミドルウェアチェーンに渡し、チェーンが返った後 `defer` で返却します。ミドルウェアが `next` から受け取ったレスポンスを返した上で、別途参照を保持した場合（例：グローバルキャッシュに格納）、そのレスポンスはオブジェクトプールに返却された後に再利用され、クロスリクエストのデータリークを引き起こします。キャッシュミドルウェアはレスポンスデータをディープコピーする必要があります。
:::

## 関連項目

- [内蔵ミドルウェア](../client-config/middleware) — Recovery/Logging/Timeout など 7 つのすぐ使えるミドルウェアファクトリ
- [リクエストとレスポンスミューテータ](./mutators) — `RequestMutator`/`ResponseMutator` の完全なメソッド契約
- [インターフェース定義](../types/interfaces) — `Handler`/`MiddlewareFunc` の型エイリアス定義
