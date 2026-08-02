---
sidebar_label: "パフォーマンス"
title: "パフォーマンス最適化 - CyberGo HTTPC | プリセットと並列"
description: "HTTPC パフォーマンス最適化ガイド：Default/Secure/Performance/Minimal の 4 種プリセット比較とシナリオ別選択、プリセットをベースにしたコネクションプールとタイムアウトの微調整、Result ライフサイクル自動管理による GC 負荷軽減、高並列リクエストパターンとパフォーマンスアンチパターンの分析と最適化の推奨事項。"
sidebar_position: 9
---

# パフォーマンス最適化

HTTPC は設計段階から高性能を目指しています：コネクションプール再利用、HTTP/2 多重化、オブジェクトプール、単一割り当ての結果オブジェクト。ほとんどのシナリオでは、プリセット設定をそのまま使うだけで優れたパフォーマンスが得られます。さらにチューニングが必要な場合は、基盤のメカニズムを理解して的確に対処することが重要です。

## プリセット設定の比較

HTTPC は 5 種類のプリセット設定を提供し、それぞれが異なるシナリオ向けに体系的に調整されています。以下はカテゴリ別に主なフィールドの正確な値を示し、選択時の比較に便利です。

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

:::warning TestingConfig は本番使用禁止
`TestingConfig()` は URL/ヘッダー検証、TLS 証明書検証、SSRF 防護を無効化し、ローカル開発とテストのみに使用します。非テスト環境で呼び出すとセキュリティ警告が出力されます。本番環境では `SecureConfig()` または `DefaultConfig()` を使用してください。
:::

## シナリオ別選択

| シナリオ | 推奨プリセット | 調整の提案 |
|---------|-------------|-----------|
| 汎用 Web サービス | Default | — |
| ユーザー提供の URL を処理 | Secure | — |
| 内部マイクロサービス高並列 | Performance | バックエンド数に応じて `MaxIdleConns` を増加 |
| 一度きりのスクリプト | Minimal | — |
| ファイルダウンロードサービス | Performance | `MaxResponseBodySize` を増加 |
| 金融/医療 API | Secure + カスタム | 監査ミドルウェアを追加 |
| ローカル開発/ユニットテスト | Testing | 本番にデプロイしないこと |

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

## コネクションプールチューニングの仕組み

コネクションプールは HTTP クライアントのパフォーマンスの中核です。HTTPC のコネクションプールは Go 標準ライブラリの `http.Transport` に基づいていますが、自動計算ロジックとセキュアなデフォルト値をその上に追加しています。

### アイドル接続の自動計算

`MaxIdleConnsPerHost`（ホストごとのアイドル接続上限）は手動で設定する必要はありません——HTTPC が `MaxConnsPerHost` から自動的に導出します：

```
アイドル接続数 = MaxConnsPerHost / 2、区間 [2, 10] に制限
```

具体的なルール（`calculateIdleConnsPerHost`）：

| MaxConnsPerHost | 自動アイドル接続数 | 説明 |
|-----------------|---------------|------|
| 0（無制限） | 10 | 上限のデフォルト値を使用 |
| 1 | 2 | 下限を下回らない |
| 2 | 2 | 下限にちょうど等しい |
| 5 | 2 | 半分が下限になる |
| 10 | 5 | Default プリセット |
| 20 | 10 | Performance プリセット、上限を採用 |
| 100 | 10 | 上限を超えるので 10 |

:::tip なぜ MaxConnsPerHost / 2 なのか
アイドル接続とは「接続のキャッシュ」——確立済みだが一時的に未使用の接続です。最大接続数の半分に設定することで、「既存接続の再利用」（キャッシュヒット）と「新規接続の確立」（キャッシュミス時に再ハンドシェイクが必要）のバランスを取り、アイドル接続が多すぎてサーバー側リソースを占有するのを防ぎます。
:::

### TCP Keep-Alive

HTTPC のコネクションプールは固定で 30 秒の TCP keep-alive 間隔（`defaultKeepAlive = 30 * time.Second`）を使用します。この値は接続確立後に OS が周期的に keep-alive プローブパケットを送信し、デッド接続を検出します。`IdleConn` タイムアウトはアイドル接続がプール内で生存する時間（Default では 90s）を制御し、両者が連携して動作します。

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
    cfg.Connection.MaxConnsPerHost = 50 // ホストごとの最大接続（アイドルは自動計算で 10）
    cfg.Timeouts.IdleConn = 300 * time.Second // アイドル接続の生存時間を延ばし、再利用率を向上

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

## HTTP/2 のパフォーマンス優位性

HTTP/2 はデフォルトで有効（`EnableHTTP2 = true`）であり、3 つの主要なパフォーマンス向上をもたらします：

| 特性 | HTTP/1.1 | HTTP/2 |
|------|----------|--------|
| 多重化 | 各リクエストが接続を独占 | 複数リクエストが単一接続を共有 |
| ヘッダー圧縮 | 平文で重複送信 | HPACK がヘッダーを圧縮 |
| 接続再利用 | Keep-alive は直列 | 並列ストリーム（stream） |

:::tip HTTP/2 とコネクションプールの関係
HTTP/2 の多重化により、単一の TCP 接続で複数のリクエストを同時に処理でき、接続確立のオーバーヘッドを大幅に削減できます。同じホストに対する高並列シナリオでは、HTTP/2 のスループットは HTTP/1.1 を大きく上回ります。`TestingConfig()`（HTTP/2 を明示的に無効化）を使用するか、接続が ALPN ネゴシエーションをサポートしない場合にのみ HTTP/1.1 にフォールバックします。
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
    cfg.Connection.EnableHTTP2 = true // デフォルトで true、明示的に宣言するとより明確

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // HTTP/2 をサポートするサイト（ほとんどの CDN/クラウドサービスなど）に並列リクエストを送信
    // 単一の TCP 接続を再利用でき、各リクエストで新規接続を確立する必要がない
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

HTTPC はメモリ管理において多層の最適化を行っており、中核となる考え方はヒープ割り当ての削減とオブジェクトの再利用です。

### resultBundle の単一割り当て

各リクエストが返す `*Result` は 3 つのネストされた構造体を保持します：`RequestInfo`（リクエスト情報）、`ResponseInfo`（レスポンス情報）、`RequestMeta`（所要時間などのメタデータ）。従来の方法では Result と 3 つのネスト構造体それぞれに割り当てが必要で、4 回のヒープ割り当てが発生します。HTTPC はこれらを 1 つの `resultBundle` にパッケージ化し、1 回のヒープ割り当てで全体を済ませます：

```
従来方式：4 回の独立割り当て（Result + RequestInfo + ResponseInfo + RequestMeta）
HTTPC：1 回の割り当て（resultBundle）、Result の 3 つのポインタが同一メモリブロックを指す
```

呼び出し元が受け取るのは `*Result` で、その `Request`、`Response`、`Meta` フィールド（ポインタ）は bundle 内の対応する構造体を指しており、完全に透過です。呼び出し元が `*Result` を長期にわたり保持する可能性があるため、ここではオブジェクトプールは適しません（プール化はデータ競合を引き起こすため）、GC による自動回収に任せます。

### エンジンのオブジェクトプール

HTTPC のエンジン層は `sync.Pool` を広く使用して短いライフサイクルのオブジェクトを再利用し、GC 負荷を軽減します：

| プール対象オブジェクト | 用途 | 説明 |
|----------|------|------|
| `engine.Response` | レスポンスオブジェクト | リクエスト完了後にプールへ返却、次回リクエストで再利用 |
| `engine.Request` | リクエストオブジェクト | 同上 |
| `strings.Builder` | 文字列構築 | URL 構築、エラー整形、Config シリアライズ |
| `http.Header` | HTTP ヘッダー map | リクエスト/レスポンスヘッダー処理 |
| `bytes.Buffer` | JSON/multipart エンコード | 初期容量で事前割り当て |
| `time.Timer` | リトライタイマー | 頻繁なタイマー生成を回避 |
| gzip/flate reader | 解凍 | 解凍器を再利用 |

:::tip オブジェクトプールと resultBundle の役割分担
エンジン内部オブジェクト（Response/Request/Builder）はライフサイクルが短く、リクエスト内部で borrow-return サイクルが完結するため、プール化に適しています。呼び出し元に返される `*Result` はライフサイクルが不確定なため、単一割り当て + GC 回収に適しています。両者は互补し、それぞれの長所を活かしています。
:::

### 意識する必要はありません

上記の最適化は呼び出し元にとって完全に透過です。通常通り API を使用するだけで、接続再利用、オブジェクトプール、単一割り当てはすべて内部で自動的に行われます：

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

    // Result はリクエストごとに新規作成、GC が自動回収、手動解放不要
    result, err := client.Get("https://api.example.com/data")
    if err != nil {
        log.Fatal(err)
    }

    // ホットパスでは Body() ではなく RawBody() を優先使用
    // RawBody() は生のバイトスライスを返す；Body() は事前格納された文字列を返す；String() はデバッグ用整形（オーバーヘッド最大）
    data := result.RawBody()
    fmt.Printf("レスポンスサイズ: %d バイト\n", len(data))
    fmt.Printf("リクエスト所要時間: %v\n", result.Meta.Duration)
}
```

## ワークロードチューニングの例

### AI API のロングポーリング

AI 推論 API の応答時間は数分に達する可能性があり、タイムアウト制限を緩める必要があります：

<!-- check-code: skip -->
```go
// AI API は 5-15 分の応答が必要な場合があり、デフォルトの 180s タイムアウトで打ち切られないようにする
result, err := httpc.Post("https://api.ai.example.com/v1/completions",
    httpc.WithJSON(payload),
    httpc.WithTimeout(900*time.Second), // 15 分
)
```

:::warning Default の ResponseHeader が 0 である理由
`Timeouts.ResponseHeader = 0` はトランスポート層でレスポンスヘッダータイムアウトを強制しないことを意味し、context レベルのタイムアウト（`Timeouts.Request` または `WithTimeout`）で一元管理します。これにより `WithTimeout()` が長いレスポンスのリクエストに対して完全な制御権を持ちます。slowloris 攻撃に対するトランスポート層防御が必要な場合は `SecureConfig()`（10s に設定）を使用してください。
:::

### マイクロサービスの高 QPS

内部マイクロサービス間の高頻度呼び出しには大規模なコネクションプールが必要です：

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
    // コネクションプールをバックエンドインスタンス数に応じてチューニング
    cfg.Connection.MaxIdleConns = 300   // 総アイドル接続
    cfg.Connection.MaxConnsPerHost = 30 // バックエンドインスタンスごと
    // マイクロサービスの応答は通常高速、タイムアウトを短くして高速に失敗させる
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
    // 高頻度リクエストがコネクションプールを再利用、TCP/TLS の再確立不要
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

大容量ファイルのダウンロードでは `WithStreamBody(true)` を使用してレスポンス全体がメモリに読み込まれるのを回避し、`Download()` メソッドと組み合わせてレジュームをサポートします：

```go
package main

import (
    "context"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.PerformanceConfig()
    cfg.Security.MaxResponseBodySize = 500 * 1024 * 1024 // 500MB 上限

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

### クローラーとプロキシプール

クローラーシナリオではプロキシプールで IP をローテーションし、HTTPC は各プロキシが少なくとも 1 回試行されるようリトライ回数を自動的に引き上げます（詳細は [リトライとフォールトトレランス](./retry-fault-tolerance#プロキシプールとリトライの連携) を参照）：

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
cfg.Connection.ProxyRotateOnStatus = []int{403} // 403 でプロキシ切替
cfg.Connection.ProxyPoolStrategy = httpc.ProxyStrategyRoundRobin
// MaxRetries は自動的に 4 に引き上げられ（プロキシ数-1）、5 つのプロキシすべてが試行される
```

## パフォーマンスアンチパターン

| アンチパターン | 原因 | 正しいアプローチ |
|--------|------|----------|
| リクエストごとに Client を新規作成 | 接続を再利用できず、毎回 TCP/TLS ハンドシェイクが必要 | グローバルで単一の Client インスタンスを再利用 |
| `MaxResponseBodySize` が大きすぎる | 無駄にメモリ上限を緩める | 実際のレスポンスサイズに応じて設定 |
| ホットパスで `result.String()` を使用 | 追加の文字列構築オーバーヘッド | `result.Body()` または `result.RawBody()` を使用 |
| コネクションプールが小さすぎる | 高並列時に接続が不足し、キューで待機 | `MaxConnsPerHost` を並列数に応じて調整 |
| HTTP/2 を無効化 | HTTP/1.1 の直列リクエストに退化 | デフォルトで有効のまま維持 |
| `Close()` を無視 | 接続リーク | `defer client.Close()` |
| グローバル共有後に再利用を忘れる | Client を繰り返し作成/破棄 | 一度作成、長期保持 |

:::warning Client は必ず再用
HTTP パフォーマンスの基盤は接続の再利用です。リクエストごとに Client を新規作成すると、毎回 TCP 3 ウェイハンドシェイク + TLS ハンドシェイクが必要になり、レイテンシがサブミリ秒から数十ミリ秒に跳ね上がります。マイクロサービスシナリオでは、Client をシングルトンとしてサービス構造体に注入し、サービスのライフサイクルに合わせて存続させます。
:::

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

// アンチパターンデモ：リクエストごとに Client を新規作成
func main() {
    start := time.Now()

    for i := 0; i < 5; i++ {
        // ❌ 毎回ループで Client を新規作成——接続を再利用できない
        client, err := httpc.NewDefault()
        if err != nil {
            log.Fatal(err)
        }
        result, err := client.Get("https://httpbin.org/get")
        client.Close() // 毎回クローズ、コネクションプールがクリアされる
        if err != nil {
            log.Printf("リクエスト %d 失敗: %v", i, err)
            continue
        }
        _ = result
    }
    // 5 リクエストの所要時間は Client 再用の方式よりはるかに高い
    fmt.Printf("アンチパターンの所要時間: %v\n", time.Since(start))

    // ✅ 正しいアプローチ：Client を再用
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
    fmt.Printf("再用パターンの所要時間: %v\n", time.Since(start))
}
```

## 次のステップ

- [コネクションプールとプロキシ](./connection-pool) — コネクションプールパラメータの詳細、プロキシプール設定とローテーション戦略
- [エラー処理](./error-handling) — タイムアウト階層化戦略とエラー分類
- [リトライとフォールトトレランス](./retry-fault-tolerance) — バックオフアルゴリズムの詳細とリトライバジェット
- [セキュリティ概要](../security/) — セキュリティとパフォーマンスのバランス
