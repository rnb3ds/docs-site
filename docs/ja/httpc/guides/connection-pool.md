---
sidebar_label: "コネクションプールと DNS"
title: "コネクションプールと DNS - CyberGo HTTPC | プールチューニングと DNS 解決"
description: "HTTPC コネクションプールと DNS ガイド：MaxIdleConns/MaxConnsPerHost チューニング、アイドル接続と総接続上限、TIME_WAIT 対策、オブジェクトプール再利用、並列リクエストパターン、DoH フォールバックと HTTP/2 多重化実践、高並列シナリオの推奨パラメータ。"
sidebar_position: 10
---

# コネクションプールと DNS

## コネクションプール設定

コネクションプールは HTTP クライアントのパフォーマンスを左右する重要な要素です。HTTPC は `ConnectionConfig` でコネクションプールを管理します。

```go
cfg := httpc.DefaultConfig()

// コネクションプールパラメータ
cfg.Connection.MaxIdleConns = 100         // グローバル最大アイドル接続数
cfg.Connection.MaxConnsPerHost = 20       // ホストあたりの最大接続数
cfg.Timeouts.IdleConn = 120 * time.Second // アイドル接続の維持時間
```

### パラメータの説明

| パラメータ | デフォルト | 説明 |
|------|------|------|
| `MaxIdleConns` | 50 | グローバル最大アイドル接続数 |
| `MaxConnsPerHost` | 10 | ホストあたりの最大接続数（アクティブ + アイドルを含む） |
| `IdleConn` | 90s | アイドル接続タイムアウト。超過するとクローズ |
| `Dial` | 10s | 接続確立のタイムアウト |
| `TLSHandshake` | 10s | TLS ハンドシェイクタイムアウト |
| `ResponseHeader` | 0 | 無効（Request タイムアウトを使用） |
| `MaxResponseHeaderBytes` | 0 | レスポンスヘッダーのサイズ上限。0 = Go 標準ライブラリのデフォルト 10MB |

### シナリオ別推奨

| シナリオ | MaxIdleConns | MaxConnsPerHost | IdleConn |
|------|-------------|-----------------|----------|
| 高並列 API | 100 | 20 | 120s |
| 通常サービス | 50 | 10 | 90s |
| 低頻度リクエスト | 10 | 2 | 30s |
| マイクロサービス内部 | 50 | 10 | 60s |

:::tip
`MaxConnsPerHost` はアクティブ接続とアイドル接続の両方を含みます。この制限を超える新しいリクエストは、接続の解放を待ってキューに入ります。
:::

### 派生パラメータと内部上限

一部の接続パラメータには独立した設定項目がなく、エンジンが既存のパラメータから**導出**するか、固定値を使用します：

| パラメータ | 値 | 出所 |
|------|-----|------|
| `MaxIdleConnsPerHost` | `clamp(MaxConnsPerHost/2, 2, 10)`。`MaxConnsPerHost=0` の場合は 10 | `MaxConnsPerHost` から導出、独立フィールドなし |
| 1 クライアントあたりの総接続上限 | 1000（アクティブ + アイドル） | 固定値。超過するとコネクションプール枯渇エラーを返す |
| TCP KeepAlive プローブ間隔 | 30s | 固定値 |
| `ExpectContinueTimeout` | 1s | 固定値（`Expect: 100-continue` の待機時間） |

:::warning 総接続上限の挙動
総接続上限の 1000 に達すると、新規接続はエラーで終了し、`ClientError`（`ErrorTypeNetwork`、Message は `connection pool exhausted`）に分類されます。デフォルトの `MaxIdleConns=50` / `MaxConnsPerHost=10` ではほぼ発生しません。極端な並列時の最終防線と考えてください。
:::

### アイドル接続の管理

- **`IdleConn`（デフォルト 90s）**：アイドル接続はトランスポート層のタイムアウト後に自動的にクローズされます。大きくすれば接続の再利用率が上がり、小さくすれば対向側のリソースをより速く解放できます（高頻度の短命接続シナリオでは TIME_WAIT の蓄積に注意）。
- **プロキシローテーション時のアクティブクリーンアップ**：`ProxyRotatePerRequest` やステータスコードローテーションのリトライパスを有効にすると、**すべてのアイドル接続が自動的にクローズ**され、次のリクエストでプロキシが再選択されます——そうしないと、HTTP/2 の CONNECT トンネル経由の接続再利用がプロキシ選択をバイパスし、ローテーションを無効化してしまうためです。プロキシ設定とローテーション戦略の詳細は [プロキシとプロキシプール](./proxy) を参照してください。
- **`client.Close()`**：すべてのアイドル接続、DoH リゾルバー、内部リソースをクローズします。以降のリクエストは `ErrClientClosed` を返します。
- **ホストごとの統計の自動クリーンアップ**：内部ではホストごとに接続カウントを維持し、30 分間アクティビティがなくアクティブ接続もないエントリが周期的にクリーンアップされます（最大で毎分 1 回、ホストエントリの上限は 10000）。長期実行でメモリが無限に増えることはありません。

### レスポンス解凍の特別な扱い

トランスポート層では**標準ライブラリの自動解凍を無効化**しており、HTTPC がレスポンス処理層で `gzip` / `deflate` を手動で処理します。解凍は `Security.MaxDecompressedBodySize`（デフォルト 100MB）の制約を受け、解凍爆弾攻撃を防ぎます。日常的にこの層を意識する必要はありません——`Result.RawBody()` が返すのはすでに解凍済みのバイトであることだけ知っておけば十分です。

## DNS-over-HTTPS

DoH を有効にすると、DNS 解決は暗号化された HTTPS 経路で行われ、キャリアによるハイジャックや DNS ポイズニングを防止できます。さらに、複数プロバイダーによる耐障害性を内蔵しています：

```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableDoH = true
cfg.Connection.DoHCacheTTL = 5 * time.Minute // 0 を渡しても 5 分にフォールバック
```

デフォルトの DoH プロバイダー（優先度順）：

| プロバイダー | アドレス | 説明 |
|--------|------|------|
| Cloudflare | `1.1.1.1/dns-query` | 最速、プライバシー優先 |
| Google | `dns.google/resolve` | グローバルカバレッジ |
| AliDNS | `dns.alidns.com/resolve` | 中国地域向けに最適化 |

### 仕組み

- **A + AAAA の並行クエリ**：毎回の解決で IPv4 と IPv6 のレコードを同時にクエリし、結果をマージします。
- **デュアルフォーマット解析**：レスポンスの `Content-Type` に応じて JSON（Google/AliDNS 方式）か RFC 1035 wire フォーマット（Cloudflare 方式）を自動選択します。欠落または未識別の場合は先に JSON、次に wire を試み、設定に異常があるサーバーとも互換性を保ちます。
- **並行マージ**：同一ホストの並行キャッシュミスは 1 回のネットワーク往復にマージされ（singleflight）、キャッシュスタンプでプロバイダーを圧倒しません。
- **独立した内部クライアント**：DoH リクエストは独立した HTTP クライアント（5s タイムアウト、HTTP/2 有効）で行われ、業務のコネクションプールもリクエストタイムアウトのバジェットも消費しません。

### フォールバックチェーン

```text
Cloudflare (1.1.1.1) → Google (dns.google) → AliDNS → システム DNS リゾルバー
```

いずれか 1 つのプロバイダーが成功すればその結果を返します。すべて失敗した場合は自動的にシステム DNS リゾルバーへフォールバックし、両層のエラーをエラーメッセージに統合します。単一プロバイダーの障害でリクエストが失敗することはありません。

### キャッシュ

| 項目 | 値 |
|----|-----|
| TTL | `DoHCacheTTL`（デフォルト 5 分） |
| 容量上限 | 1000 件。満杯時はまず期限切れエントリを、次に期限切れが最も近いエントリを退避 |
| レスポンスサイズ上限 | 64KB（悪意のある DNS レスポンスによるメモリ圧迫を防止） |

### SSRF 防護との連携

DoH で解決された IP は、まず SSRF フィルタを通過し（プライベート/予約アドレスの除去、`SSRFExemptCIDRs` の尊重）、その後**検証済みの IP に直接ダイヤル**します——検証とダイヤルの間に 2 回目の DNS 解決は存在しないため、DNS rebinding 攻撃を根元から防げます。プロキシアドレスは DoH 解決の対象外です（プロキシは開発者が明示的に設定するため、プロキシホストへ直接ダイヤルします。[プロキシとプロキシプール](./proxy) を参照）。詳細は [SSRF 防護](../security/ssrf) を参照してください。

## HTTP/2

デフォルトで HTTP/2 が有効です（TLS が必要）：

```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableHTTP2 = false // HTTP/2 を無効化
```

HTTP/2 の特徴：

- 多重化：単一接続で複数の並列リクエストを処理
- ヘッダー圧縮：重複ヘッダーの転送を削減
- サーバープッシュ

無効化すると、トランスポート層は HTTP/2 ネゴシエーションを一切試行しなくなります（カスタム TLS 設定シナリオでの強制試行を含む）。平文 HTTP/2（h2c）はサポートされません。HTTP/2 の多重化により「同一ホストへの並列リクエストが 1 本の接続を共有する」点に注意——これがプロキシローテーションのシナリオでアイドル接続をクローズする必要がある理由です（[プロキシとプロキシプール](./proxy) のリクエストごとのローテーションを参照）。

## オブジェクトプールの再利用

HTTPC は内部で、エンジンのレスポンスオブジェクトと文字列ビルダーを sync.Pool で再利用し、GC 負荷を削減します。Result はリクエストごとに新規作成され、GC が自動的に回収します。

```go
result, err := client.Get(url)
if err != nil {
    return err
}
// Result はリクエストごとに新規作成、GC が自動回収、手動解放は不要
```

高並列シナリオでは、内部オブジェクトプールの再利用により GC 負荷を大幅に削減できます。

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
|------|------|----------|
| 大量の TIME_WAIT | アイドル接続タイムアウトが短すぎる | `IdleConn` タイムアウトを増やす |
| 接続が拒否される | ホストあたりの接続数が不足 | `MaxConnsPerHost` を増やす |
| リクエストがキューで待機 | コネクションプールが小さすぎる | `MaxIdleConns` を増やす |
| ホストあたりのアイドル接続数を制御したい | 独立した設定フィールドがない | `MaxConnsPerHost` から導出（÷2、2–10 の間にクランプ） |
| DoH 有効後に解決が失敗する | すべての DoH プロバイダーが到達不能/タイムアウト | システム DNS へのフォールバックを内蔵済み。出口ネットワークを確認するかデフォルトのままにする |
| プロキシが効かない・頻繁にサーキットブレーク | プロキシ設定と接続再利用の相互作用 | [プロキシとプロキシプール](./proxy) のよくある問題を参照 |

パフォーマンスアンチパターンと最適化提案の全貌は [パフォーマンス最適化](./performance) を参照してください。

## 次のステップ

- [パフォーマンス最適化](./performance) - パフォーマンスチューニングガイド
- [プロキシとプロキシプール](./proxy) - 単一プロキシ、システムプロキシ、プロキシプールのローテーションとサーキットブレーカー
- [設定 API](../api-reference/client-config/config) - 接続設定フィールドのリファレンス
- [セキュリティ概要](../security/) - SSRF と TLS セキュリティ
