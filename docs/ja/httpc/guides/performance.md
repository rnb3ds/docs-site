---
sidebar_label: "パフォーマンス"
title: "パフォーマンス最適化 - CyberGo HTTPC | プリセットと並列モデル"
description: "HTTPC パフォーマンス最適化ガイド：5 種プリセット比較とシナリオ選択、コネクションプールのアイドル接続自動算出ルール、並列モデルとセマフォ流量制御の完全例、タイムアウトバジェットの階層別提案、ゼロアロケーションのホットパス、オブジェクトプールと resultBundle メカニズム、アンチパターン分析。"
sidebar_position: 12
---

# パフォーマンス最適化

HTTPC は設計段階から高性能を目指しています：コネクションプールの再利用、HTTP/2 多重化、オブジェクトプーリング、単一割り当ての結果オブジェクト。ほとんどのシナリオでは、プリセット設定をそのまま使うだけで優れたパフォーマンスが得られます。さらにチューニングが必要な場合は、基盤のメカニズムを理解して的確に対処することが重要です。

## プリセット設定の比較

HTTPC は 5 種類のプリセット設定を提供し、それぞれが異なるシナリオ向けに体系的に調整されています。以下はカテゴリ別に主要フィールドの正確な値を示すもので、選定時の比較に役立ちます。

### タイムアウト設定

| フィールド | Default | Secure | Performance | Testing | Minimal |
|------|---------|--------|-------------|---------|---------|
| `Timeouts.Request` | 180s | 15s | 60s | 180s | 180s |
| `Timeouts.Dial` | 10s | 5s | 15s | 5s | 5s |
| `Timeouts.TLSHandshake` | 10s | 5s | 15s | 5s | 5s |
| `Timeouts.ResponseHeader` | 0（無効） | 10s | 0（無効） | 0（無効） | 0（無効） |
| `Timeouts.IdleConn` | 90s | 30s | 120s | 30s | 30s |

### 接続設定

| フィールド | Default | Secure | Performance | Testing | Minimal |
|------|---------|--------|-------------|---------|---------|
| `MaxIdleConns` | 50 | 20 | 100 | 10 | 10 |
| `MaxConnsPerHost` | 10 | 5 | 20 | 5 | 2 |
| `EnableHTTP2` | 有効 | 有効 | 有効 | **無効** | 有効 |
| `EnableCookies` | 無効 | 無効 | 有効 | 有効 | 無効 |
| `EnableDoH` | 無効 | 無効 | 無効 | 無効 | 無効 |

### セキュリティ設定

| フィールド | Default | Secure | Performance | Testing | Minimal |
|------|---------|--------|-------------|---------|---------|
| `MaxResponseBodySize` | 10MB | 5MB | 50MB | 10MB | 1MB |
| `MaxDecompressedBodySize` | 100MB | 100MB | 100MB | 100MB | 100MB |
| `ValidateURL` | 有効 | 有効 | 有効 | **無効** | 有効 |
| `ValidateHeaders` | 有効 | 有効 | 有効 | **無効** | 有効 |
| `StrictContentLength` | 有効 | 有効 | 無効 | 有効 | 有効 |
| `AllowPrivateIPs` | false | false | false | **true** | false |
| `InsecureSkipVerify` | false | false | false | **true** | false |

### リトライ設定

| フィールド | Default | Secure | Performance | Testing | Minimal |
|------|---------|--------|-------------|---------|---------|
| `MaxRetries` | 3 | 1 | 3 | 1 | 0 |
| `Delay` | 1s | 2s | 500ms | 100ms | 0 |
| `BackoffFactor` | 2.0 | 2.0 | 1.5 | 2.0 | 1.0 |
| `MaxRetryDelay` | 30s | 30s | 30s | 30s | 30s |
| `EnableJitter` | 有効 | 有効 | 有効 | 無効 | 無効 |

### リクエストデフォルト値

| フィールド | Default | Secure | Performance | Testing | Minimal |
|------|---------|--------|-------------|---------|---------|
| `FollowRedirects` | 有効 | **無効** | 有効 | 有効 | **無効** |
| `MaxRedirects` | 10 | 10 | 10 | 10 | 10 |
| `UserAgent` | `httpc/1.0` | `httpc/1.0` | `httpc/1.0` | `httpc-test/1.0` | `httpc/1.0` |

:::warning TestingConfig の本番使用は禁止
`TestingConfig()` は URL/Header 検証、TLS 証明書検証、SSRF 防護を無効化しており、ローカル開発とテスト専用です。テスト以外の環境で呼び出すとセキュリティ警告が出力されます。本番環境では `SecureConfig()` または `DefaultConfig()` を使用してください。
:::

## シナリオ別選択

| シナリオ | 推奨プリセット | 調整の提案 |
|------|----------|----------|
| 汎用 Web サービス | Default | — |
| ユーザー提供の URL を扱う | Secure | — |
| 内部マイクロサービスの高並列 | Performance | バックエンド数に合わせて `MaxIdleConns` を増やす |
| 一回限りのスクリプト | Minimal | — |
| ファイルダウンロードサービス | Performance | `MaxResponseBodySize` を増やす |
| 金融/医療 API | Secure + カスタム | 監査ミドルウェアを追加 |
| ローカル開発/ユニットテスト | Testing | 本番にデプロイしない |

<!-- check-code: skip -->
```go
// 高スループットシナリオではプリセットをそのまま使用
client, _ := httpc.New(httpc.PerformanceConfig())

// プリセットをベースに個別フィールドを微調整
cfg := httpc.PerformanceConfig()
cfg.Timeouts.Request = 120 * time.Second
cfg.Connection.MaxIdleConns = 200
client, _ := httpc.New(cfg)
```

## 並列モデル：1 つの Client ですべての goroutine に対応

HTTPC の `Client` と `DomainClient` はいずれも**並行セーフ**です——任意のメソッドを複数の goroutine から同時に呼び出せます。ライブラリ内部には専用の並行セーフ統合テスト（`internal/concurrency`）があり、高並列シナリオで公開 API をカバーしています。そのため、正しい並列パターンはごくシンプルです：

```
グローバル/サービスレベルで 1 つの Client を作成
        │
        ├── goroutine 1 ──┐
        ├── goroutine 2 ──┼── 同じコネクションプールとオブジェクトプールを共有
        └── goroutine N ──┘
```

並列容量とコネクションプールの関係：

| シナリオ | 挙動 |
|------|------|
| 並列数 ≤ `MaxConnsPerHost`（HTTP/1.1） | 各リクエストが 1 本の接続を専有し、互いに待たない |
| 並列数 > `MaxConnsPerHost`（HTTP/1.1） | 余ったリクエストはトランスポート層でアイドル接続を**待ってキューに入る**（エラーにはならないがレイテンシが上昇） |
| HTTP/2 有効（デフォルト） | 同一ホストのリクエストが単一接続の多重化を共有。`MaxConnsPerHost` がボトルネックになることはまれ |

:::tip 並列上限の 2 つの調整方法
- **クライアント側を制御**：`Connection.MaxConnsPerHost` をピーク並列数以上に引き上げる（HTTP/1.1 シナリオ）。
- **呼び出し側を制御**：バッファ付き channel をセマフォとして並列を制限する（下の完全な例）。呼び出し先のサービスを能動的に保護します。
両者は併用が基本です：セマフォで呼び出し先の処理能力に合わせて流量を絞り、コネクションプールはセマフォの上限に合わせて接続を用意します。
:::

```go
package main

import (
	"fmt"
	"log"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"time"

	"github.com/cybergodev/httpc"
)

func main() {
	// ローカルモックサーバー：各リクエストに固定 50ms 要する
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(50 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	cfg := httpc.DefaultConfig()
	cfg.Security.AllowPrivateIPs = true // 127.0.0.1 のローカルテストサーバーへの接続を許可
	client, err := httpc.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer client.Close()

	const (
		total       = 20
		maxInFlight = 5 // セマフォ：同時にインフライトのリクエストは最大 5 つ
	)

	sem := make(chan struct{}, maxInFlight)
	var wg sync.WaitGroup
	var okCount int64
	start := time.Now()

	for i := 0; i < total; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}                // セマフォを取得
			defer func() { <-sem }()         // セマフォを解放

			result, err := client.Get(server.URL)
			if err != nil {
				return
			}
			if result.IsSuccess() {
				atomic.AddInt64(&okCount, 1)
			}
		}()
	}
	wg.Wait()

	fmt.Printf("%d/%d 成功、所要時間 %v（直列なら約 %v）\n",
		okCount, total, time.Since(start), total*50*time.Millisecond)
	// 出力例：20/20 成功、所要時間約 250ms（直列なら約 1s）——5 路並列で約 5 倍のスループット
}
```

大量の独立した URL を一括取得する場合のもう一つの定番パターンが **ワーカープール（worker pool）** です：固定数の worker goroutine が jobs channel からタスクを消費するため、並列度が自然に worker 数に抑えられ、セマフォは不要です。完全な実装は[高度な使用例](../examples/advanced-usage)を参照してください。

## コネクションプールチューニングの原理

コネクションプールは HTTP クライアントのパフォーマンスの中核です。HTTPC のコネクションプールは Go 標準ライブラリの `http.Transport` をベースに、その上に自動計算ロジックと安全なデフォルト値を加えています。

### アイドル接続の自動算出

`MaxIdleConnsPerHost`（ホストあたりのアイドル接続上限）は手動設定不要です——HTTPC が `MaxConnsPerHost` から自動的に導出します：

```
アイドル接続数 = MaxConnsPerHost / 2、[2, 10] の区間にクランプ
```

具体的なルール（`calculateIdleConnsPerHost`）：

| MaxConnsPerHost | 自動アイドル接続数 | 説明 |
|-----------------|---------------|------|
| 0（無制限） | 10 | 上限のデフォルト値を使用 |
| 1 | 1 | まず下限の 2 を取り、その後「最大接続数を超えない」制約で 1 に引き戻される |
| 2 | 2 | 下限にちょうど一致 |
| 5 | 2 | 半分が下限に切り上げ |
| 10 | 5 | Default プリセット |
| 20 | 10 | Performance プリセット、上限を取る |
| 100 | 10 | 上限超過は 10 |

:::tip なぜ MaxConnsPerHost / 2 なのか
アイドル接続は「接続のキャッシュ」です——確立済みだが一時的に未使用の接続。最大接続数の半分に設定することで、「既存接続の再利用」（キャッシュヒット）と「新規接続の確立」（キャッシュミス時に再ハンドシェイクが必要）のバランスを取り、アイドル接続の過多によるサーバー側リソースの占有を防ぎます。
:::

### TCP Keep-Alive

HTTPC のコネクションプールは 30 秒の TCP keep-alive 間隔を固定で使用します（`defaultKeepAlive = 30 * time.Second`）。この値に基づき、接続確立後に OS が周期的に keep-alive プローブパケットを送信し、死んだ接続を検出します。`IdleConn` タイムアウトはアイドル接続のプール内生存時間を制御し（Default では 90s）、両者が協調して動作します。

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    // マイクロサービスの高 QPS シナリオ：コネクションプールを拡大
    cfg := httpc.PerformanceConfig()
    cfg.Connection.MaxIdleConns = 200   // グローバルアイドル接続上限
    cfg.Connection.MaxConnsPerHost = 50 // ホストあたりの最大接続（アイドルは自動算出で 10）
    cfg.Timeouts.IdleConn = 300 * time.Second // アイドル接続をより長く存続させ、再利用率を向上

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // ホットパスのリクエストはコネクションプール内の接続を直接再利用
    for i := 0; i < 100; i++ {
        result, err := client.Get("https://api.example.com/data")
        if err != nil {
            log.Printf("リクエスト %d 失敗: %v", i, err)
            continue
        }
        fmt.Printf("リクエスト %d: %d\n", i, result.StatusCode())
    }
}
```

## HTTP/2 のパフォーマンス上の利点

HTTP/2 はデフォルトで有効です（`EnableHTTP2 = true`）。3 つの大きな性能向上をもたらします：

| 特徴 | HTTP/1.1 | HTTP/2 |
|------|----------|--------|
| 多重化 | 各リクエストが接続を専有 | 複数リクエストが単一接続を共有 |
| ヘッダー圧縮 | 平文で重複送信 | HPACK によるヘッダー圧縮 |
| 接続再利用 | Keep-alive による直列 | 並行ストリーム（stream） |

:::tip HTTP/2 とコネクションプールの関係
HTTP/2 の多重化により、単一の TCP 接続で複数のリクエストを同時に運べるため、接続確立のオーバーヘッドが大幅に減ります。同一ホストへの高並列シナリオでは、HTTP/2 のスループットは HTTP/1.1 を大きく上回ります。`TestingConfig()`（明示的に HTTP/2 を無効化）を使用するか、接続が ALPN ネゴシエーションをサポートしない場合にのみ HTTP/1.1 へフォールバックします。
:::

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    // デフォルト設定で HTTP/2 は有効
    cfg := httpc.DefaultConfig()
    cfg.Connection.EnableHTTP2 = true // デフォルトで true。明示するとより明確

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // HTTP/2 対応サイト（大半の CDN/クラウドサービスなど）へ並列リクエストを発行
    // 単一の TCP 接続を再利用でき、リクエストごとに新規接続は不要
    start := time.Now()
    for i := 0; i < 10; i++ {
        result, err := client.Get("https://http2.golang.org/")
        if err != nil {
            log.Printf("リクエスト %d 失敗: %v", i, err)
            continue
        }
        // Proto() はプロトコルバージョンを返す（例："HTTP/2.0"）
        fmt.Printf("リクエスト %d: %s, ステータスコード %d\n", i, result.Proto(), result.StatusCode())
    }
    fmt.Printf("10 リクエストの所要時間: %v\n", time.Since(start))
}
```

## メモリ最適化メカニズム

HTTPC はメモリ管理で多層の最適化を行っており、中核の考え方はヒープ割り当ての削減とオブジェクトの再利用です。

### resultBundle の単一割り当て

毎回のリクエストが返す `*Result` は 3 つのネスト構造体を持ちます：`RequestInfo`（リクエスト情報）、`ResponseInfo`（レスポンス情報）、`RequestMeta`（所要時間などのメタデータ）。伝統的な作りでは Result と 3 つのネスト構造体をそれぞれ割り当てる必要があり——4 回のヒープ割り当てです。HTTPC はこれらを 1 つの `resultBundle` にパックし、1 回のヒープ割り当てで全部を賄います：

```
伝統方式：4 回の独立割り当て（Result + RequestInfo + ResponseInfo + RequestMeta）
HTTPC：1 回の割り当て（resultBundle）。Result の 3 つのポインタは同一メモリを指す
```

呼び出し側が受け取るのは `*Result` で、その `Request`、`Response`、`Meta` フィールド（ポインタ）は bundle 内の対応する構造体を指しており、完全に透過です。呼び出し側が `*Result` を長期保持する可能性があるため、ここはオブジェクトプールに向きません（プーリングはデータ競合を招く）し、GC が自動的に回収します。

### エンジンのオブジェクトプール

HTTPC のエンジン層では `sync.Pool` を広く使い、短命オブジェクトを再利用して GC 負荷を削減します：

| プール対象 | 用途 | 説明 |
|----------|------|------|
| `engine.Response` | レスポンスオブジェクト | リクエスト完了後にプールへ返却し、次のリクエストで再利用 |
| `engine.Request` | リクエストオブジェクト | 同上 |
| `strings.Builder` | 文字列構築 | URL 構築、エラーフォーマット、Config シリアライズ |
| `http.Header` | HTTP ヘッダー map | リクエスト/レスポンスヘッダー処理 |
| `bytes.Buffer` | JSON/multipart エンコード | 初期容量で事前割り当て |
| `time.Timer` | リトライタイマー | タイマーの頻繁な生成を回避 |
| gzip/flate reader | 解凍 | 解凍器を再利用 |

:::tip オブジェクトプールと resultBundle の分担
エンジン内部のオブジェクト（Response/Request/Builder）はライフサイクルが短く、リクエスト内部で borrow-return の循環が完結するため、プーリングに向きます。呼び出し側へ返す `*Result` はライフサイクルが不確定なため、単一割り当て + GC 回収に向きます。両者は補完し合い、それぞれの長所を活かします。
:::

### 低アロケーションのホットパス

オブジェクトプールに加え、リクエストのホットパスには**的を絞った割り当て排除**の最適化が多数あります：

| 最適化点 | メカニズム |
|--------|------|
| ヘッダーのディープコピーの一括割り当て | `CloneHeader` はまずすべての値の数を数え、共有の基盤配列を 1 回で割り当て——「ヘッダーごとに 1 回の割り当て（N 回）」を 1 回に削減 |
| クエリパラメータエスケープのゼロ割り当て | エスケープ不要な文字列は**そのまま返却**（ゼロ割り当て）。必要な場合のみプール済みバッファへバイト単位で書き出し |
| 数値クエリパラメータの直接書き込み | `int`/`float64`/`bool` などの数値は `strconv.Append*` でビルダーに直接書き込まれ、中間文字列を生成しない |
| リクエストヘッダーの所有権移動 | 通常リクエストとダウンロードパスでは、エンジン Response 上の header map を `Result` へ**所有権ごと移動**し、複製しない |
| リダイレクトチェーンのインライン配列 | 最初の 8 回のリダイレクトはプール済みオブジェクトのインライン固定長配列に記録し、8 回を超えて初めてオーバーフロースライスを割り当て——大半のリクエストはリダイレクトチェーンのための追加割り当てなし |
| リトライスリープタイマーの再利用 | リトライバックオフ用の `time.Timer` をプーリングして再利用し、高頻度リトライで Timer の生成を繰り返さない |
| プール容量の防護 | しきい値を超えるオブジェクトはプールに**返却しない**（header map > 64 エントリ、query builder 容量 > 4096 など）。巨大オブジェクトがプールに長居してメモリを膨らませるのを防止 |

### 内部メトリクスとヘルス

エンジン内部は**純粋なアトミック操作**（ロックなし）でリクエストごとのメトリクスを収集します：総リクエスト数、成功/失敗数、および移動平均の公式 `新平均 = (旧平均×9 + 今回のレイテンシ) / 10` で維持される平滑化レイテンシ。エラー率 10% 未満を健康とみなします。これらのメトリクスはエンジン自身の健康判断に使われるもので、**公開 API としては露出しません**——アプリケーション層のリクエストメトリクスには `MetricsMiddleware` を使ってください（[ミドルウェア](../api-reference/client-config/middleware)を参照）。メソッド/URL/ステータスコード/所要時間でコールバックされ、Prometheus などの監視システムに直接接続できます。

### 意識する必要はない部分

以上の最適化は呼び出し側に完全に透過です。普段どおり API を使うだけで、接続再利用、オブジェクトプーリング、単一割り当てはすべて内部で自動的に行われます：

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // Result はリクエストごとに新規作成、GC が自動回収、手動解放は不要
    result, err := client.Get("https://api.example.com/data")
    if err != nil {
        log.Fatal(err)
    }

    // ホットパスでは Body() ではなく RawBody() を優先
    // RawBody() は生のバイトスライスを返す。Body() は保持された文字列を返す。String() はデバッグ用フォーマット（最も高コスト）
    data := result.RawBody()
    fmt.Printf("レスポンスサイズ: %d バイト\n", len(data))
    fmt.Printf("リクエスト所要時間: %v\n", result.Meta.Duration)
}
```

## ワークロード別チューニング例

### タイムアウトバジェット

4 つのトランスポート層タイムアウト（`Dial`、`TLSHandshake`、`ResponseHeader`、暗黙のボディ転送）は、いずれも `Timeouts.Request` という**総バジェット**の制約を受けます。プリセットを調整する際は「各項の合計 ≤ 総バジェット」の階層関係を保ち、「ダイヤルタイムアウトが総タイムアウトより長い」ような無効な設定を避けてください：

```
Timeouts.Request（総バジェット、デフォルト 180s）
 ├── Timeouts.Dial          ダイヤル（デフォルト 10s）
 ├── Timeouts.TLSHandshake  TLS ハンドシェイク（デフォルト 10s）
 ├── Timeouts.ResponseHeader レスポンスヘッダー待ち（Default/Performance は 0=トランスポート層制限なし）
 └── レスポンスボディ転送    残り時間をすべて使用可能
```

| ワークロード | Request | Dial/TLS | 説明 |
|----------|---------|----------|------|
| 内部ネットワークのマイクロサービス | 5–10s | 1–2s | 高速フェイル。エラーは上流のリトライ/サーキットブレーカーに委ねる |
| インターネット上の API | 30s | 5s | クロスネットワーク遅延と偶発的な遅いレスポンスの両立 |
| AI/長時間タスク | 300s+ | 10s | 長いレスポンスボディが残りバジェットを使い切る |
| 大容量ファイルダウンロード | 0（context で制御） | 15s | 総時間は `Download` の ctx で、単一リクエストは `WithTimeout` で管理 |

:::warning ResponseHeader と WithTimeout の相互作用
`Default`/`Performance` プリセットは `ResponseHeader` を 0 に設定し（トランスポート層で強制しない）、`WithTimeout()` が長いレスポンスを完全に制御できるようにしています。`Secure` プリセットは 10s に設定し、slowloris 系攻撃に対抗します。手動で `ResponseHeader` を狭めた場合、`WithTimeout` より先に遅いレスポンスを切断する可能性があることに注意してください。
:::

### AI API の長時間リクエスト

AI 推論 API はレスポンスに数分かかることがあり、タイムアウト制限を緩める必要があります：

<!-- check-code: skip -->
```go
// AI API は 5〜15 分の応答時間になり得る。デフォルトの 180s タイムアウトで打ち切らない
result, err := httpc.Post("https://api.ai.example.com/v1/completions",
    httpc.WithJSON(payload),
    httpc.WithTimeout(900*time.Second), // 15 分
)
```

:::warning Default の ResponseHeader が 0 の理由
`TimeoutConfig.ResponseHeader = 0` はトランスポート層でレスポンスヘッダータイムアウトを強制しないことを意味し、context レベルのタイムアウト（`TimeoutConfig.Request` または `WithTimeout`）で一元制御されます。これにより `WithTimeout()` が長いレスポンスのリクエストを完全に制御できます。slowloris 攻撃に対抗するトランスポート層の防御が必要な場合は、`SecureConfig()`（10s に設定）を使ってください。
:::

### マイクロサービスの高 QPS

内部マイクロサービス間の高頻度呼び出しには大きなコネクションプールが必要です：

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.PerformanceConfig()
    // コネクションプールはバックエンドインスタンス数に合わせてチューニング
    cfg.Connection.MaxIdleConns = 300   // 総アイドル接続
    cfg.Connection.MaxConnsPerHost = 30 // 各バックエンドインスタンスあたり
    // マイクロサービスのレスポンスは通常速いため、タイムアウトを短縮して高速フェイル
    cfg.Timeouts.Request = 10 * time.Second
    cfg.Retry.Delay = 200 * time.Millisecond
    cfg.Retry.BackoffFactor = 2.0
    cfg.Retry.MaxRetries = 2

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    start := time.Now()
    // 高頻度リクエストはコネクションプールを再利用し、TCP/TLS の再構築は不要
    for i := 0; i < 50; i++ {
        result, err := client.Get("http://user-service:8080/api/users")
        if err != nil {
            log.Printf("リクエスト %d 失敗: %v", i, err)
            continue
        }
        _ = result
    }
    fmt.Printf("50 リクエストの所要時間: %v\n", time.Since(start))
}
```

### 大容量ファイルダウンロード（ストリーミング）

大容量ファイルのダウンロードには `Download()` を使ってください：内部で自動的にストリーミングモードが有効になり、レスポンスボディはネットワークからディスクへ直送されます。メモリ使用量はファイルサイズに依存せず、レジュームとチェックサムにも対応します：

```go
package main

import (
    "context"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.PerformanceConfig()
    cfg.Security.MaxResponseBodySize = 500 * 1024 * 1024 // 上限 500MB

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    dcfg := httpc.DefaultDownloadConfig()
    dcfg.FilePath = "/tmp/large-file.zip"
    dcfg.ResumeDownload = true // レジューム

    result, err := client.Download(
        context.Background(),
        "https://example.com/large-file.zip",
        dcfg,
    )
    if err != nil {
        log.Fatal(err)
    }
    log.Printf("ダウンロード完了: %d バイト", result.BytesWritten)
}
```

:::warning 通常のリクエストメソッドに WithStreamBody を使わない
`WithStreamBody(true)` は `Download` のようにエンジンレスポンスを直接消費するパスでのみ有効です。`Get`/`Post`/`Request` などの通常メソッドに設定すると、レスポンスボディは結局 `Result` へ完全に読み込まれた後で基盤のストリームがクローズされます——返された `Result` のリクエストボディは空で、呼び出し側はストリームを取得できません。大きなレスポンスボディを消費する正しい入口は `Download` です（詳細は[ファイルアップロードとダウンロード](./file-transfer)）。
:::

### クローラーとプロキシプール

クローラーのシナリオではプロキシプールで IP をローテーションします。HTTPC はリトライ回数を自動的に引き上げ、各プロキシが少なくとも 1 回試行されるようにします（詳細は [リトライとフォールトトレランス](./retry-fault-tolerance#プロキシプールとリトライの連携)）：

<!-- check-code: skip -->
```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyPool = []string{
    "http://proxy1:8080",
    "http://proxy2:8080",
    "http://proxy3:8080",
    "http://proxy4:8080",
    "http://proxy5:8080",
}
cfg.Connection.ProxyRotateOnStatus = []int{403} // 403 でプロキシ切り替えをトリガー
cfg.Connection.ProxyPoolStrategy = httpc.ProxyStrategyRoundRobin
// MaxRetries は自動的に 4（プロキシ数-1）へ引き上げられ、5 つのプロキシがすべて 1 回ずつ試行される
```

## パフォーマンスアンチパターン

| アンチパターン | 原因 | 正しいやり方 |
|--------|------|----------|
| リクエストごとに Client を新規作成 | 接続を再利用できず、毎回 TCP/TLS ハンドシェイクをやり直す | 単一の Client インスタンスをグローバルで再利用 |
| 過大な `MaxResponseBodySize` | 不要にメモリ上限を緩める | 実際のレスポンスサイズに合わせて設定 |
| ホットパスで `result.String()` を使用 | 余分な文字列構築のオーバーヘッド | `result.Body()` または `result.RawBody()` を使用 |
| コネクションプールが小さすぎる | 高並列で接続が足りず、キューで待機 | `MaxConnsPerHost` を並列数に合わせる |
| 通常リクエストで `WithStreamBody` を使用 | 返される Result のリクエストボディが空で、ストリームも取得できない | 大きなレスポンスボディは `Download` へ |
| HTTP/2 を無効化 | HTTP/1.1 の直列リクエストに劣化 | デフォルトの有効のままに |
| `Close()` を無視 | 接続リーク | `defer client.Close()` |
| グローバル共有なのに再利用を忘れる | Client の生成/破棄を繰り返す | 一度作成し、長期保持 |
| goroutine の数で押し切る | 呼び出し先を圧迫し、429/サーキットブレークを誘発 | セマフォかワーカープールでインフライト数を制御 |

:::warning Client は必ず再利用
HTTP パフォーマンスの土台は接続再利用です。リクエストごとに Client を新規作成すると、毎回 TCP 3 ウェイハンドシェイク + TLS ハンドシェイクをやり直し、レイテンシがサブミリ秒から数十ミリ秒へ急増します。マイクロサービスのシナリオでは、Client をシングルトンとしてサービス構造体に注入し、サービスのライフサイクルとともに存続させてください。
:::

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

// アンチパターンのデモ：リクエストごとに Client を新規作成
func main() {
    start := time.Now()

    for i := 0; i < 5; i++ {
        // ❌ 毎ループで Client を新規作成——接続を再利用できない
        client, err := httpc.NewDefault()
        if err != nil {
            log.Fatal(err)
        }
        result, err := client.Get("https://httpbin.org/get")
        client.Close() // 毎回クローズし、コネクションプールを空に
        if err != nil {
            log.Printf("リクエスト %d 失敗: %v", i, err)
            continue
        }
        _ = result
    }
    // 5 リクエストの所要時間は Client を再利用するケースより大幅に長くなる
    fmt.Printf("アンチパターンの所要時間: %v\n", time.Since(start))

    // ✅ 正しいやり方：Client を再利用
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    start = time.Now()
    for i := 0; i < 5; i++ {
        result, err := client.Get("https://httpbin.org/get")
        if err != nil {
            log.Printf("リクエスト %d 失敗: %v", i, err)
            continue
        }
        _ = result
    }
    fmt.Printf("再利用パターンの所要時間: %v\n", time.Since(start))
}
```

## 次のステップ

- [コネクションプールと DNS](./connection-pool) — コネクションプールパラメータの詳細と DoH 解決
- [プロキシとプロキシプール](./proxy) — プロキシプールの設定とローテーション戦略
- [エラー処理](./error-handling) — タイムアウトの階層戦略とエラー分類
- [リトライとフォールトトレランス](./retry-fault-tolerance) — バックオフアルゴリズムの詳細とリトライバジェット
- [セキュリティ概要](../security/) — セキュリティとパフォーマンスのバランス
