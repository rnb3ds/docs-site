---
sidebar_label: "コネクションプールとプロキシ"
title: "コネクションプールとプロキシ - CyberGo HTTPC | プールチューニングとプロキシ設定"
description: "HTTPC コネクションプールとプロキシ設定ガイド：MaxIdleConns プールチューニングとシナリオ推奨、ProxyURL 手動プロキシと SOCKS5、EnableSystemProxy 自動検出、ProxyPool プロキシプール回転とパッシブサーキットブレーキング、ProxyRotateOnStatus、DoH と HTTP/2 設定。"
sidebar_position: 8
---

# コネクションプールとプロキシ

## コネクションプール設定

コネクションプールは HTTP クライアントのパフォーマンスの重要な要素です。HTTPC は `ConnectionConfig` でコネクションプールを管理します。

```go
cfg := httpc.DefaultConfig()

// コネクションプールパラメータ
cfg.Connection.MaxIdleConns = 100         // グローバル最大アイドル接続数
cfg.Connection.MaxConnsPerHost = 20       // ホストあたりの最大接続数
cfg.Timeouts.IdleConn = 120 * time.Second // アイドル接続維持時間
```

### パラメータの説明

| パラメータ | デフォルト | 説明 |
|-----------|-----------|------|
| `MaxIdleConns` | 50 | グローバル最大アイドル接続数 |
| `MaxConnsPerHost` | 10 | ホストあたりの最大接続数（アクティブ + アイドル含む） |
| `IdleConn` | 90s | アイドル接続タイムアウト。超過するとクローズ |
| `Dial` | 10s | 接続確立タイムアウト |
| `TLSHandshake` | 10s | TLS ハンドシェイクライムアウト |
| `ResponseHeader` | 0 | 無効（Request タイムアウトを使用） |

### シナリオ別推奨

| シナリオ | MaxIdleConns | MaxConnsPerHost | IdleConn |
|---------|-------------|-----------------|----------|
| 高並列 API | 100 | 20 | 120s |
| 通常サービス | 50 | 10 | 90s |
| 低頻度リクエスト | 10 | 2 | 30s |
| マイクロサービス内部 | 50 | 10 | 60s |

:::tip
`MaxConnsPerHost` はアクティブ接続とアイドル接続の両方を含みます。この制限を超える新しいリクエストは接続の解放を待ってキューに入ります。
:::

## プロキシ

HTTPC は 4 つのプロキシモードをサポートし、優先度に従って自動的に選択されます。すべてのプロキシ設定は `ConnectionConfig` で構成します。

### 手動プロキシ

`ProxyURL` で固定プロキシを指定します（最高優先度）:

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyURL = "http://proxy.example.com:8080"

client, _ := httpc.New(cfg)
```

認証付きプロキシ:

```go
cfg.Connection.ProxyURL = "http://user:password@proxy.example.com:8080"
```

:::tip
`Config.String()` メソッドはプロキシ URL のユーザー名とパスワードを自動的にマスクします。
:::

### SOCKS5 プロキシ

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyURL = "socks5://proxy.example.com:1080"
```

### システムプロキシの自動検出

OS のプロキシ設定を自動的に検出します:

```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableSystemProxy = true
```

| プラットフォーム | 検出ソース |
|----------------|-----------|
| Windows | レジストリ Internet Settings |
| macOS | システム環境設定ネットワークプロキシ |
| Linux | 環境変数 `HTTP_PROXY` / `HTTPS_PROXY` |

### プロキシプール

複数のプロキシ IP にリクエストを分散する必要がある場合（スクレイピング、負荷分散、IP ローテーション）、プロキシプールは自動回転、パッシブサーキットブレーキング、ステータスコードベースの切り替えを提供します — 外部コンポーネント不要。

#### 基本的な使い方

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyPool = []string{
    "http://proxy1:8080",
    "http://proxy2:8080",
    "http://proxy3:8080",
}
cfg.Connection.ProxyPoolStrategy = httpc.ProxyStrategyRoundRobin // デフォルト

client, err := httpc.New(cfg)
```

各リクエストはプールからプロキシを自動的に選択します。`http`、`https`、`socks5`、`socks5h` プロトコルをサポートします。

| フィールド | 型 | デフォルト | 説明 |
|-----------|-----|---------|------|
| `ProxyPool` | `[]string` | `nil` | プロキシ URL のリスト |
| `ProxyPoolStrategy` | `ProxyStrategy` | `RoundRobin` | 選択戦略 |
| `ProxyFailureThreshold` | `int` | `3`（0 でフォールバック） | 連続失敗サーキットブレーク閾値 |
| `ProxyCooldown` | `time.Duration` | `30s`（0 でフォールバック） | サーキットブレークプロキシのクールダウン |
| `ProxyRotateOnStatus` | `[]int` | `nil` | プロキシ回転をトリガーするステータスコード |

#### 選択戦略

| 戦略 | 定数 | 説明 |
|------|------|------|
| ラウンドロビン | `ProxyStrategyRoundRobin` | 順番に循環選択、リトライ時に自動的に次のプロキシに移動 |
| ランダム | `ProxyStrategyRandom` | 正常なプロキシから均一にランダム選択 |

ラウンドロビン（デフォルト）はリトライ時に自動的に異なるプロキシ IP を選択します — 各リトライがカーソルを進め、自然に次のプロキシに移動します。

#### パッシブサーキットブレーキング

プロキシプールはパッシブヘルスチェックを内蔵しています。**接続レベルの失敗**（dial/TLS）のみがサーキットブレークをトリガーし、HTTP ステータスコードはトリガーしません:

```text
プロキシ接続失敗
    ↓
失敗カウント +1
    ↓
連続失敗 ≥ ProxyFailureThreshold → サーキットオープン（回転から除外）
    ↓
ProxyCooldown 待機 → ハーフオープンプローブ（回転に復元）
    ↓
成功 → カウントリセット、サーキットクローズ
初回失敗 → サーキット再オープン
```

```go
cfg.Connection.ProxyFailureThreshold = 5           // より寛容に、一時的な問題を許容
cfg.Connection.ProxyCooldown = 60 * time.Second    // より長いクールダウン
```

すべてのプロキシがサーキットブレークされた場合、クールダウンが最も短い（復元に最も近い）プロキシがフォールバックとして返され、即座に失敗することはありません。

#### ステータスコード回転

Cloudflare/WAF などの IP ブロックシナリオで — 特定のステータスコード返却時に自動的に異なるプロキシでリトライします:

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyPool = []string{
    "http://proxy1:8080",
    "http://proxy2:8080",
    "http://proxy3:8080",
}
cfg.Connection.ProxyRotateOnStatus = []int{403}  // 403 受信時にプロキシ回転
cfg.Retry.MaxRetries = 3                          // リトライ有効化必須

client, err := httpc.New(cfg)
```

:::warning ステータスコード回転 ≠ サーキットブレーキング
`ProxyRotateOnStatus` でトリガーされた回転はプロキシをサーキットブレーク**しません** — IP ブロックはターゲット固有であることが多いです（サイト A でブロックされたプロキシがサイト B では正常に動作する場合があります）。サーキットブレーキングは接続レベルの失敗のみでトリガーされます。`Retry.MaxRetries > 0` が必要です。

`ProxyRotateOnStatus` が設定され、プールに複数のプロキシがある場合、リトライ予算が自動的に `len(ProxyPool) - 1` に引き上げられます（`MaxRetries` 上限 10 で制限）、すべてのプロキシが試行される機会を保証します。
:::

### プロキシ優先度

複数のプロキシモードを同時に構成した場合、優先度に従って適用されます:

| 優先度 | 設定 | 動作 |
|--------|------|------|
| 1（最高） | `ProxyURL` | 常に指定されたプロキシを使用（単一プロキシモード） |
| 2 | `ProxyPool` | プロキシプールで回転 |
| 3 | `EnableSystemProxy` | システムプロキシを自動検出 |
| 4（最低） | なし | 直接接続 |

:::tip
`ProxyURL` と `ProxyPool` を両方設定した場合、`ProxyURL` が有効になります。プロキシプールを使用するには、`ProxyURL` を空にしてください。
:::

### 内蔵セキュリティ

プロキシ関連機能は以下のセキュリティ詳細を自動的に処理します — 手動構成不要:

- **SSRF免除**: プロキシホストアドレスが自動的に SSRF 免除リストに追加され、プライベート IP チェックでブロックされません
- **重複排除**: 同一 `host:port` のエントリが自動的にマージされ、回転バイアスと重複カウントを防ぎます
- **URL 検証**: すべてのプロキシ URL がセキュリティ検証されます（CRLF インジェクション防止、プロトコルホワイトリスト）

完全なフィールド説明は [設定 API — プロキシプール](../api-reference/client-config/config#プロキシプール) を参照してください。

## DNS-over-HTTPS

DoH を有効にして DNS 解決遅延を削減し、DNS ハイジャックを防止:

```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableDoH = true
cfg.Connection.DoHCacheTTL = 5 * time.Minute
```

デフォルトの DoH プロバイダー（優先度順）:

| プロバイダー | アドレス | 説明 |
|-------------|---------|------|
| Cloudflare | `1.1.1.1/dns-query` | 最速、プライバシー重視 |
| Google | `dns.google/resolve` | グローバルカバレッジ |
| AliDNS | `dns.alidns.com/resolve` | 中国地域最適化 |

:::tip
DoH を有効にすると、DNS 解決結果が `DoHCacheTTL` の間キャッシュされます。すべての DoH プロバイダーが利用できない場合、システム DNS にフォールバックします。
:::

## HTTP/2

デフォルトで HTTP/2 が有効です（TLS が必要）:

```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableHTTP2 = false // HTTP/2 を無効化
```

HTTP/2 の特徴：
- 多重化：単一接続で複数の並列リクエストを処理
- ヘッダー圧縮：繰り返しヘッダーの転送を削減
- サーバープッシュ

## オブジェクトプール再利用

HTTPC は内部でエンジンのレスポンスオブジェクトと文字列ビルダーを sync.Pool で再利用し、GC 負荷を軽減します。Result 自体はリクエストごとに新規作成され、GC が自動的に回収します。

```go
result, err := client.Get(url)
if err != nil {
    return err
}
// Result はリクエストごとに新規作成、GC が自動回収、手動解放不要
```

高並列シナリオでは、内部オブジェクトプールの再利用により GC 負荷を大幅に軽減できます。

## 並列リクエストパターン

```go
func fetchAll(ctx context.Context, urls []string) ([]*httpc.Result, error) {
    results := make([]*httpc.Result, len(urls))
    errs := make([]error, len(urls))

    var wg sync.WaitGroup
    for i, url := range urls {
        wg.Add(1)
        go func(idx int, u string) {
            defer wg.Done()
            result, err := client.Request(ctx, "GET", u)
            results[idx] = result
            errs[idx] = err
        }(i, url)
    }
    wg.Wait()

    for _, err := range errs {
        if err != nil {
            return nil, err
        }
    }
    return results, nil
}
```

## よくある問題

| 問題 | 原因 | 解決策 |
|------|------|--------|
| 大量の TIME_WAIT | アイドル接続タイムアウトが短すぎる | `IdleConn` タイムアウトを増加 |
| 接続拒否 | ホストあたりの接続数が不足 | `MaxConnsPerHost` を増加 |
| リクエストがキューで待機 | コネクションプールが小さすぎる | `MaxIdleConns` を増加 |
| プロキシが動作しない | `ProxyURL` と `ProxyPool` を同時設定 | `ProxyURL` を空にし、`ProxyPool` のみ使用 |
| プロキシが頻繁にサーキットブレーク | `ProxyFailureThreshold` が低すぎる | 閾値または `ProxyCooldown` を増加 |

完全なパフォーマンスアンチパターンと最適化の提案は [パフォーマンス最適化](./performance) をご覧ください。

## 次のステップ

- [パフォーマンス最適化](./performance) - パフォーマンスチューニングガイド
- [設定 API](../api-reference/client-config/config) - 接続・プロキシフィールドリファレンス
- [セキュリティ概要](../security/) - SSRF と TLS セキュリティ
