---
sidebar_label: "よくある質問"
title: "よくある質問 - CyberGo HTTPC | 質問と回答"
description: "HTTPC よくある質問集：パッケージ関数とクライアントインスタンスの選択基準、5 種の設定プリセット比較と適用シナリオ、HTTP/SOCKS5 プロキシと DoH 設定、Cookie セッション管理とリトライ設定、errors.Is/As エラーマッチングパターンと 5 階層タイムアウト体系チューニング戦略の詳細な回答と提案。"
sidebar_position: 1
---

# よくある質問

## パッケージ関数と Client インスタンス、どちらを使うべき？

**答：** パッケージ関数（`httpc.Get`/`httpc.Post` など）は内部でグローバルに共有されるデフォルトクライアント（`defaultClient`）を使用し、初回呼び出し時に遅延ロードされ、クローズ後に自動的に自己修復・再構築されます。一度きりのリクエスト、スクリプト、CLI ツールなどカスタム設定が不要なシナリオに適しています。

```go
// パッケージ関数：シンプルで高速、デフォルトクライアントのコネクションプールを共有
result, err := httpc.Get("https://api.example.com/data")
```

以下のいずれかのシナリオでは、明示的な Client インスタンスを作成すべきです：

- カスタム設定（タイムアウト、プロキシ、リトライ、TLS など）
- 独立したコネクションプールのライフサイクル管理
- ミドルウェアチェーンの使用（ログ/監査/メトリクス/リクエスト ID）
- 異なる設定の複数クライアントの並存

```go
// 明示的 Client：設定とライフサイクルを完全に制御
client, err := httpc.New(httpc.PerformanceConfig())
if err != nil {
    log.Fatal(err)
}
defer func() { _ = client.Close() }()

result, err := client.Get("https://api.example.com/data")
```

パッケージ関数にカスタム設定を使用させたい場合、`SetDefaultClient` でグローバルクライアントを置き換えます（古いものは自動的にクローズされます）：

```go
customClient, _ := httpc.New(httpc.SecureConfig())
if err := httpc.SetDefaultClient(customClient); err != nil {
    log.Fatal(err)
}
// 以降のすべてのパッケージ関数は customClient を使用
```

:::tip 本番環境の推奨
長時間実行するサービスでは明示的な Client を優先し、グローバル状態による暗黙的な結合を回避してください。パッケージ関数は短いライフサイクルのプログラムや迅速なプロトタイプにのみ適しています。
:::

## 5 種の設定プリセット、どう選ぶ？

**答：** HTTPC はセキュリティとパフォーマンスのトレードオフで並べた 5 種のプリセット設定を提供します：

| プリセット | タイムアウト | リトライ | リダイレクト | SSRF | レスポンス上限 | TLS 検証 | 適用シナリオ |
|------|------|------|--------|------|----------|----------|----------|
| `SecureConfig()` | 厳格（15s） | 1 回 | 禁止 | 有効 | 5MB | 有効 | ユーザー提供の URL を処理、金融/医療 |
| `DefaultConfig()` | 中程度（180s） | 3 回 | 許可 | 有効 | 10MB | 有効 | 汎用シナリオ |
| `PerformanceConfig()` | やや長い（60s） | 3 回 | 許可 | 有効 | 50MB | 有効 | 内部マイクロサービス、高並列 API |
| `MinimalConfig()` | 中程度 | 0 回 | 禁止 | 有効 | 1MB | 有効 | 一度きりのスクリプト、シンプルな呼び出し |
| `TestingConfig()` | 短い（5s Dial） | 1 回 | 許可 | **無効** | デフォルト | **スキップ** | ユニットテスト、ローカル開発 |

デシジョンツリー：

```
ユーザー提供の URL を処理するか？
├── はい → SecureConfig()
└── いいえ → 高スループットが必要か？
         ├── はい → PerformanceConfig()
         └── いいえ → 一度きりのリクエストか？
                  ├── はい → MinimalConfig()
                  └── いいえ → DefaultConfig()
テスト環境 → TestingConfig()
```

:::warning TestingConfig のセキュリティリスク
`TestingConfig()` は TLS 検証と SSRF 防護を無効化し、非テスト環境で使用すると警告が出力されます。**本番環境での使用は厳禁**、`*_test.go` ファイルまたはローカル開発のみに限定してください。
:::

## HTTP/SOCKS5 プロキシを設定するには？

**答：** HTTPC は 3 種類のプロキシ方式を提供し、優先度順に：`ProxyURL` > `ProxyPool` > `EnableSystemProxy`。

| 方式 | フィールド | 適用シナリオ | 特徴 |
|------|------|----------|------|
| 単一プロキシ | `ProxyURL` | 固定プロキシサーバー | 最高優先度、直接指定 |
| プロキシプール | `ProxyPool` | 複数プロキシのローテーション、高可用性 | ローテーション戦略と受動的サーキットブレーカーをサポート |
| システムプロキシ | `EnableSystemProxy` | 環境変数の読み取り | 最低優先度、システム設定に追従 |

```go
// 方式 1：単一プロキシ（http/https/socks5 プロトコルをサポート）
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyURL = "socks5://user:pass@proxy:1080"
client, _ := httpc.New(cfg)

// 方式 2：システムプロキシ（HTTP_PROXY/HTTPS_PROXY 環境変数を読み取り）
cfg.Connection.EnableSystemProxy = true

// 方式 3：プロキシプール（複数プロキシのローテーション + 受動的サーキットブレーカー）
cfg.Connection.ProxyPool = []string{
    "http://proxy1:8080",
    "http://proxy2:8080",
    "socks5://proxy3:1080",
}
cfg.Connection.ProxyPoolStrategy = httpc.ProxyStrategyRoundRobin
```

## プロキシプールのローテーション原理は？

**答：** プロキシプールは 3 つのメカニズムで IP ローテーションを実現します：

**1. 戦略ローテーション**（毎回の選択時）：`ProxyStrategyRoundRobin` は順番に循環選択し、毎回の選択で次のプロキシに進むため、リトライ時に**自然と異なる IP に振られ**、追加設定が不要です。`ProxyStrategyRandom` は健全なプロキシからランダムに選択します。

**2. リクエストごとのローテーション**（リクエスト開始時）：`ProxyRotatePerRequest = true` を設定すると、毎回の独立リクエスト開始時にすべてのアイドル接続をクローズし、Transport にプロキシプールを再評価させます。有効でない場合、HTTP 接続の再利用により同一ホストへの連続リクエストが前回のリクエストのプロキシトンネルを再利用し、戦略ローテーションをバイパスしてしまいます。代償は接続再利用なし（毎回のリクエストで新規接続）ですが、リクエストごとのローテーションを保証します。同一ホストのスクレイピング/データ収集に適しています——毎回のリクエストの送信元 IP が異なります。

**3. ステータスコードによるローテーション**（レスポンス時）：`ProxyRotateOnStatus`（例：`[]int{403}`）を設定すると、レスポンスがこれらのステータスコードを返し `Retry.MaxRetries > 0` の場合にリトライがトリガーされ、リトライ時に戦略ローテーションが IP の切り替えを保証します。CF/WAF などの IP 次元のブロックのバイパスに適しています。

さらに、プロキシプールは**受動的サーキットブレーカーと自動回復**も内蔵しています：連続する接続失敗（dial/TLS）が `ProxyFailureThreshold`（デフォルト 3）に達すると、そのプロキシは一時的にローテーションプールから外され、`ProxyCooldown`（デフォルト 30s）経過後にハーフオープンプローブ方式で回復します。注意：HTTP ステータスコードはサーキットブレーカーを**トリガーしません**——ブロックはターゲットサイト固有であることが多いためです（あるサイトでブロックされたプロキシが別のサイトでは正常な場合がある）。

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyPool = []string{
    "http://proxy1:8080",
    "http://proxy2:8080",
    "http://proxy3:8080",
}
cfg.Connection.ProxyPoolStrategy = httpc.ProxyStrategyRoundRobin
cfg.Connection.ProxyFailureThreshold = 3   // 連続 3 回の接続失敗でサーキットブレーカー
cfg.Connection.ProxyCooldown = 30 * time.Second // 30s 後にハーフオープンプローブで回復
cfg.Connection.ProxyRotateOnStatus = []int{403} // 403 受信時に IP を切り替えてリトライ
cfg.Retry.MaxRetries = 3 // ProxyRotateOnStatus はリトライと組み合わせが必要
```

## DoH はどう設定する？

**答：** DNS-over-HTTPS（DoH）は DNS 解決遅延を削減し、DNS ハイジャックとキャッシュポイズニングを防止できます。有効化方法：

```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableDoH = true
cfg.Connection.DoHCacheTTL = 5 * time.Minute // DNS レスポンスのキャッシュ期間（デフォルト 5 分）
```

デフォルトで Cloudflare、Google、AliDNS の 3 プロバイダーを使用します（優先度順にフェイルバック）。すべての DoH プロバイダーが利用不可の場合、システム DNS に自動的にフォールバックし、可用性を保証します。

:::tip いつ DoH を使用するか
DoH は DNS 解決のセキュリティに高い要件があるシナリオ（ISP の DNS ハイジャックの防止など）に適しています。通常の API 呼び出しでは有効化の必要はありません——システム DNS で通常は十分であり、DoH は少量の解決遅延を追加します（初回クエリで HTTPS 往返が必要）。
:::

詳しくは [コネクションプールと DNS](../guides/connection-pool#dns-over-https) を参照してください。

## Cookie セッションはどう管理する？

**答：** HTTPC は 2 階層の Cookie 管理を提供します：

**1. 自動管理（DomainClient）**：`NewDomain` が作成する DomainClient は自動的に Cookie を有効化し（`EnableCookies=true`）、SessionManager を埋め込みます。毎リクエスト後に `UpdateFromResult` でレスポンスの `Set-Cookie` を自動的にキャプチャし、次回リクエスト前に `prepareOptions` で自動的に注入します。ログインセッションの維持などのシナリオに適しています。

**2. 手動管理（SessionManager）**：より精密な制御が必要な場合、`dc.Session()` が返す `*SessionManager` を直接操作します——Cookie の設定/削除/照会、実行時のセキュリティポリシーの切り替え、レスポンスからの一括抽出。

```go
// 自動管理：ログイン後にセッションが自動的に維持
dc, _ := httpc.NewDomain("https://api.example.com", httpc.DefaultConfig())
defer func() { _ = dc.Close() }()

// ログイン（レスポンスの Set-Cookie を自動的にキャプチャ）
_, _ = dc.Request(ctx, "POST", "/login", httpc.WithJSON(loginData))

// 以降のリクエストは自動的にセッション Cookie を付与
result, _ := dc.Request(ctx, "GET", "/profile")
```

通常の Client の場合、`cfg.Connection.EnableCookies = true` を設定することで cookie jar の自動管理を有効化できますが、SessionManager への自動抽出は行われません。

詳細は [セッション管理](../api-reference/client-config/session) を参照してください。

## リトライはどう設定する？

**答：** HTTPC はデフォルトで 3 回リトライし、**リトライ可能な一時的エラー**のみをリトライします：

**デフォルトのリトライ条件**（設定不要で有効）：
- ネットワーク層エラー：接続拒否、接続リセット、ネットワーク到達不可など
- トランスポート層タイムアウト：`net.OpError` タイムアウト（コンテキストデッドライン**ではない**）
- 特定の HTTP ステータスコード：408（リクエストタイムアウト）、429（レート制限）、500、502、503、504

**Retry-After ヘッダー解析**：429/503 などのリトライ可能レスポンスを受信し `Retry-After` ヘッダーが付いている場合、HTTPC は自前のバックオフ計算ではなくサーバーが指示した遅延で自動的に待機し、サーバー側の負荷悪化を回避します。この待機は**60s が上限**です——悪意あるサーバーが巨大な Retry-After 値でクライアントを止まらせることはできません。

**カスタムリトライ**：`RetryPolicy` インターフェース（`ShouldRetry` + `GetDelay` の 2 メソッド）を実装して内蔵ロジックを置き換え、`cfg.Retry.CustomPolicy` に代入します。詳細は [リトライとフォールトトレランスガイド](../guides/retry-fault-tolerance) を参照してください。

```go
cfg := httpc.DefaultConfig()
cfg.Retry.MaxRetries = 5              // 最大 5 回リトライ（上限 10）
cfg.Retry.Delay = 2 * time.Second     // 初期遅延
cfg.Retry.BackoffFactor = 2.0         // 指数バックオフファクター
cfg.Retry.MaxRetryDelay = 60 * time.Second // 単一最大遅延
cfg.Retry.EnableJitter = true         // ジッター（Thundering Herd を防止）
```

:::warning context キャンセルはリトライしない
`context.Canceled` と `context.DeadlineExceeded` でトリガーされた失敗は**永遠にリトライされません**——これはユーザーの明示的なキャンセル/タイムアウトの意図であり、リトライはその意図に違反します。
:::

詳細は [リトライとフォールトトレランス](../guides/retry-fault-tolerance) を参照してください。

## タイムアウトはどう選ぶ？

**答：** HTTPC は 5 階層のタイムアウト体系を提供し、作用範囲の広いものから狭いものへ：

| タイムアウト層 | フィールド | デフォルト値 | スコープ | リクエストレベルで上書き可 |
|--------|------|--------|--------|:----------:|
| リクエスト総タイムアウト | `TimeoutConfig.Request` | 180s | リトライを含む全過程 | `WithTimeout()` |
| ダイヤルタイムアウト | `TimeoutConfig.Dial` | 10s | TCP 接続確立 | いいえ |
| TLS ハンドシェイクタイムアウト | `TimeoutConfig.TLSHandshake` | 10s | TLS ハンドシェイク（HTTPS のみ） | いいえ |
| アイドル接続タイムアウト | `TimeoutConfig.IdleConn` | 90s | 接続のアイドル保持時間 | いいえ |
| レスポンスヘッダータイムアウト | `TimeoutConfig.ResponseHeader` | 0（無効） | レスポンスヘッダー到着待ち | **不可** |

**ResponseHeader の特殊な挙動**：デフォルトは 0（無効）で、この場合 `TimeoutConfig.Request` または `WithTimeout()` のコンテキストタイムアウトが完全に制御します。正の値に設定するとトランスポートレベルのハード上限（slowloris 防御）が有効になりますが、この値は `WithTimeout` を**上書き**し（ResponseHeader がより短い場合）、**同じ client を共有するすべてのリクエスト**に適用され、リクエストごとの上書きはできません。

```go
// 推奨：コンテキストタイムアウト（精密制御、リクエストごとに設定可能）
ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
defer cancel()
result, _ := client.Request(ctx, "GET", url)

// リクエストオプションで上書き（内部的にコンテキストタイムアウトに変換）
result, _ := client.Get(url, httpc.WithTimeout(30*time.Second))
```

:::warning TimeoutMiddleware は Download には不適切
`TimeoutMiddleware` は handler が返った直後にコンテキストをキャンセル（`defer cancel()`）しますが、Download の handler はレスポンスヘッダーを受信した時点で返ります——この時点で body はまだ消費されておらず、cancel は body の最初のバイトで"context canceled"をトリガーします。**TimeoutMiddleware で Download をラップしないでください**、代わりに `WithTimeout` を使用してください（そのデッドラインはエンジンの全体コンテキストに作用し、body 読み取りをカバーできます）。
:::

## 4xx/5xx はなぜ error を返さない？

**答：** これは HTTPC の設計理念です：HTTP ステータスコードは**アプリケーション層のセマンティクス**であり、トランスポート層のエラーではありません。404 を返すレスポンスはネットワーク層では完全に成功しています——TCP 接続が確立され、TLS ハンドシェイクが完了し、HTTP リクエストが送達し、レスポンスが正しく返されました。これを error と見なすとネットワーク層エラーと混同され、エラー処理の複雑さが増します。

そのため HTTPC は**ネットワーク層の失敗**時のみ error を返し（接続拒否、タイムアウト、DNS 失敗など）、HTTP ステータスコードは `Result` でチェックします：

```go
result, err := client.Get(url)
if err != nil {
    // ネットワーク層エラー（接続失敗、タイムアウトなど）
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        log.Printf("ネットワークエラー: %s", clientErr.Code())
    }
    return err
}

// HTTP ステータスコードのチェック
switch {
case result.IsSuccess():      // 2xx
    handleSuccess(result)
case result.IsClientError():  // 4xx
    log.Printf("クライアントエラー: %d", result.StatusCode())
case result.IsServerError():  // 5xx
    log.Printf("サーバーエラー: %d", result.StatusCode())
}
```

## 大容量ファイルダウンロードはどう処理する？

**答：** `Download` メソッドでストリーミングダウンロードを行い、進捗コールバック、レジューム、SHA-256 検証、パスセキュリティチェックをサポートします：

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
	client, err := httpc.NewDefault()
	if err != nil {
		log.Fatalf("クライアントの作成に失敗: %v", err)
	}
	defer func() { _ = client.Close() }()

	cfg := httpc.DefaultDownloadConfig()
	cfg.FilePath = "/tmp/large-file.zip"
	cfg.Overwrite = true
	cfg.ResumeDownload = true // レジューム：中断後の再ダウンロードはブレークポイントから継続
	cfg.Checksum = "e3b0c44298fc1c149afbf4c8996fb924..." // 期待される SHA-256
	cfg.ChecksumAlgorithm = httpc.ChecksumSHA256
	cfg.ProgressCallback = func(downloaded, total int64, speed float64) {
		if total > 0 {
			fmt.Printf("\r%.1f%% (%s / %s, %s)",
				float64(downloaded)/float64(total)*100,
				httpc.FormatBytes(downloaded),
				httpc.FormatBytes(total),
				httpc.FormatSpeed(speed))
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	result, err := client.Download(ctx, "https://example.com/large-file.zip", cfg)
	if err != nil {
		log.Fatalf("ダウンロードに失敗: %v", err)
	}
	fmt.Printf("\nダウンロード完了: %s (%d バイト)\n", result.FilePath, result.BytesWritten)
}
```

:::tip パスセキュリティ
Download は FilePath を検証し、ディレクトリパス（ファイルオープンエラーを返す）と未サポートの検証アルゴリズム（ターゲットファイルに触れる前に拒否）を拒否します。レジュームはサーバーの Range リクエストサポートに依存します——サーバーが 206 ではなく 200 を返した場合、HTTPC は正しく処理します（切り詰めではなく先頭から開始）。
:::

## 証明書ピンニングはどうする？

**答：** 証明書ピンニング（Certificate Pinning）は TLS ハンドシェイク段階でサーバーの公開鍵が事前設定フィンガープリントに一致するかを検証し、信頼された CA が侵害されても中間者攻撃を防御できます。

**SPKI ハッシュ生成手順**（OpenSSL を使用）：

```bash
openssl x509 -in cert.pem -pubkey -noout | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary | openssl enc -base64
```

**複数ハッシュのローテーション**：複数のハッシュを渡すことで鍵のローテーションをサポートします——サーバー鍵が**いずれかの**事前設定ハッシュに一致すれば通過します。サーバー側が鍵をローテーションする際にクライアントが切断されないよう、常にバックアップハッシュを設定することを推奨します。

```go
pinner, err := httpc.NewSPKIHashPinner(
    "YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2fuihg=", // 現在の鍵
    "C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=", // バックアップ鍵（ローテーション用）
)
if err != nil {
    log.Fatal(err)
}

cfg := httpc.DefaultConfig()
cfg.Security.CertificatePinner = pinner
client, _ := httpc.New(cfg)
```

Pinner インスタンスは複数の Client で安全に共有できます（内部で並行セーフ、かつディープコピーされません）。

## context キャンセル後、リクエストはリトライされる？

**答：** **されません**。`context.Canceled` と `context.DeadlineExceeded` はリトライ不可です——これらはユーザーの明示的なキャンセルまたはタイムアウトの意図を表し、リトライはその意図に違反します。

HTTPC の `IsRetryable()` メソッドはすべての判定の前に**context エラーを優先チェック**します：Cause チェーンに `context.Canceled` または `context.DeadlineExceeded` が含まれていれば、即座に false を返します。エラーが `ErrorTypeNetwork`（通常はリトライ可）に分類されていても、context エラーチェックによって正しくリトライ不可と識別されます。

```go
ctx, cancel := context.WithCancel(context.Background())
go func() {
    time.Sleep(100 * time.Millisecond)
    cancel() // 能動的キャンセル
}()

_, err := client.Request(ctx, "GET", "https://example.com/slow")
if err != nil {
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        fmt.Println(clientErr.Type == httpc.ErrorTypeContextCanceled) // true
        fmt.Println(clientErr.IsRetryable())                          // false
    }
}
```

## MaxRedirects(0) はなぜリダイレクトを禁止しない？

**答：** `MaxRedirects = 0` は「未設定」のセンチネル値であり、「リダイレクト禁止」ではありません。`DefaultConfig()` では `MaxRedirects` はデフォルトで 10 です。本当にリダイレクトを禁止するには、`WithFollowRedirects(false)` または `Config.Defaults.FollowRedirects = false` を使用します：

```go
// 方式 1：設定レベルで禁止
cfg := httpc.DefaultConfig()
cfg.Defaults.FollowRedirects = false
client, _ := httpc.New(cfg)

// 方式 2：リクエストレベルで禁止
result, _ := client.Get(url, httpc.WithFollowRedirects(false))
```

`SecureConfig()` プリセットはデフォルトでリダイレクトを禁止（`FollowRedirects = false`）し、リダイレクトベースの SSRF 攻撃を防止します。

リダイレクトの完全な動作（追従制御、チェーン追跡、ドメインホワイトリスト）は [リダイレクトガイド](../guides/redirects) を参照してください。

## io.Reader リクエストボディはなぜサイズを検証しない？

**答：** `io.Reader` はストリーミングインターフェースで、データ長を事前に知ることができません——`Len()` メソッドは存在せず、読み取り＝消費です。そのため HTTPC は `io.Reader` タイプのリクエストボディに対して**サイズ検証を行わず**、呼び出し側がデータ量を制御する責任を持ちます。

アップロードサイズを制限する必要がある場合、標準ライブラリの `io.LimitReader` でラップします：

```go
// 最大 1MB のアップロードに制限
limitedReader := io.LimitReader(unlimitedReader, 1024*1024)
result, err := client.Post(url, httpc.WithBody(limitedReader))
```

または `SecurityConfig.MaxRequestBodySize` でグローバルアップロード上限を設定します（デフォルトは 0 = 無制限）：

```go
cfg := httpc.DefaultConfig()
cfg.Security.MaxRequestBodySize = 10 * 1024 * 1024 // グローバルで 10MB に制限
```

## セキュリティ警告はどう抑制する？

**答：** `TestingConfig()` などの安全でない設定が非テスト環境で使用されると `log.Printf` で警告が出力されます。抑制が必要な場合（CI 環境の特定のシナリオなど）、警告出力を `io.Discard` にリダイレクトします：

```go
// すべてのセキュリティ警告出力を抑制
httpc.SetSecurityWarnOutput(io.Discard)

cfg := httpc.TestingConfig() // 警告を出力しなくなる
```

:::warning 管理された環境のみで使用
セキュリティ警告の抑制は出力をサイレントにするだけで、無効化されたセキュリティ機能は**回復しません**。必ず管理された環境（CI、コンテナ化テスト）でのみ使用し、本番環境では `SecureConfig()` または `DefaultConfig()` を使用してください。
:::

## 内部サービスにアクセスするには？

**答：** デフォルトの SSRF 防護がプライベート IP 接続をブロックします（127.0.0.1、10.x、192.168.x、169.254.x など）。内部サービスにアクセスするには 2 つの方法があります：

```go
// 方式 1：精密免除（推奨）——指定した CIDR 範囲のみを許可
cfg := httpc.DefaultConfig()
cfg.Security.SSRFExemptCIDRs = []string{
    "10.0.0.0/8",     // VPC 内部ネットワーク
    "100.64.0.0/10",  // Tailscale/VPN
}

// 方式 2：完全無効化（危険）——すべての接続レベル SSRF ダイヤル検証を閉じる
cfg.Security.AllowPrivateIPs = true
```

:::warning AllowPrivateIPs のリスク
`AllowPrivateIPs = true` はプライベート IP を許可するだけでなく、**接続レベルの SSRF ダイヤル検証を完全にバイパス**します（localhost/loopback/link-local チェックを含む）。信頼できる内部サービスに接続する場合にのみ使用し、ユーザー入力の URL を処理する際には**厳禁**——`SSRFExemptCIDRs` で精密に免除してください。
:::

## リクエストログはどう記録する？

**答：** `LoggingMiddleware` を使用してリクエストログを追加します。URL は自動的にマスクされ認証情報の漏洩を防止します：

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.LoggingMiddleware(&httpc.LoggingConfig{
        LogFunc: func(format string, args ...any) {
            log.Printf("[HTTP] "+format, args...)
        },
    }),
}
client, _ := httpc.New(cfg)
```

コンプライアンスレベルの監査（リクエスト/レスポンスヘッダー、リダイレクトチェーン、ソース IP、ユーザー ID の記録）が必要な場合は、より完全な機能を持つ `AuditMiddleware` を使用してください。詳細は [内蔵ミドルウェアリファレンス](../api-reference/client-config/middleware) を参照してください。

## HTTPC と net/http はどういう関係？

**答：** HTTPC は `net/http` の代替ではなく、その上に構築されています。基盤エンジンは引き続き `http.Client` と `http.Transport` です——HTTPC は独自のコネクションプールマネージャーで `*http.Transport` を作成・設定し（接続再利用、TLS、HTTP/2、プロキシ選択は標準ライブラリが実行）、リダイレクトポリシーは `CheckRedirect` コールバックで注入、SSRF 検証はダイヤル関数 `DialContext` にラップされます。

その上で HTTPC は標準ライブラリにない部分を補います：リクエストレベルのオプションチェーン、結果オブジェクトのプーリング（低アロケーション）、リトライエンジン、ミドルウェアチェーン、多層セキュリティ検証、監査・ログミドルウェア。

:::tip エコシステムとの互換性
標準ライブラリエコシステムと完全に互換：`http.Cookie`、`tls.Config`、`context.Context`、`io.Reader` などの型をそのまま使用でき、アダプター層は不要です。既存の `tls.Config` の知識（mTLS、カスタム CA、暗号スイート）は `Security.TLSConfig` にそのまま移行できます。
:::

## WithTimeout のタイムアウトにリトライ時間は含まれる？

**答：** 含まれます。`WithTimeout`（および `Timeouts.Request`）は**すべてのリトライ試行とバックオフ待機をカバーする総予算**です：リトライエンジンはリクエスト全体に対して単一のデッドラインを設定し、試行ごとに計測をやり直すことはありません。

```go
// 総予算 30s：初回試行 + 最大 3 回のリトライ + バックオフ待機、合計 30s を超えない
result, err := client.Get(url, httpc.WithTimeout(30*time.Second))
```

2 点注意：バックオフ待機も同じく予算を消費するため、予算が厳しすぎるとリトライを完了できない場合があります。`WithTimeout` の上限は 30 分で、超過すると `ErrInvalidTimeout` を返します。

## リトライで POST が重複送信される？

**答：** あり得ます。HTTPC は 408/429/500/502/503/504 とネットワーク層の一時的エラーを自動リトライし、**リクエストメソッドを区別しません**——POST も GET と同様にリトライされます。初回リクエストがサーバーに到達し正常に処理された（しかしレスポンスが喪失またはタイムアウトした）場合、リトライは重複作成・重複決済を引き起こします。

緩和策（優先度順）：

```go
// 1. サーバー側の冪等キー（推奨）：ビジネス側で Idempotency-Key による重複排除
client.Post(url,
    httpc.WithJSON(order),
    httpc.WithHeader("Idempotency-Key", orderID),
)

// 2. 非冪等インターフェースのリトライをリクエストレベルで無効化
client.Post(url, httpc.WithJSON(payment), httpc.WithMaxRetries(0))
```

補足 2 点：`io.Reader` リクエストボディはリトライ再送に対応するため完全にバッファリングされます（上限 100MB、超過でエラー）。そのためリトライで送信される body は初回と同一です。`context.Canceled`/`DeadlineExceeded` は決してリトライされないため、能動的なキャンセルが重複送信を引き起こすことはありません。詳細は [リトライとフォールトトレランス](../guides/retry-fault-tolerance) を参照してください。

## レスポンス Body は手動クローズが必要？

**答：** 不要です（そもそもクローズの入口もありません）。通常リクエスト（`Get`/`Post`/`Request` など）が返す `Result` が保持しているのは**既に読み取り複製されたバイト列**です——HTTPC が内部で読み取り、ドレイン（最大 10MB、接続再利用のため）、クローズまで完了し、基盤の接続はコネクションプールが管理します。

```go
result, err := client.Get(url)
if err != nil {
    log.Fatal(err)
}
fmt.Println(len(result.RawBody())) // バイトは既にメモリ内にあり、未クローズのハンドルはない
```

大容量ファイルを通常リクエストでメモリに読み込まないでください——`Download` を使用します（ストリーミングでのディスク書き込み、プログレスコールバック、レジューム）。`WithStreamBody` は `Download` パスでのみ有効です：通常リクエストメソッド経由で使用した場合、レスポンスはやはり `Result` に完全に読み込まれ、ストリームはクローズされます。詳細は [ファイル転送ガイド](../guides/file-transfer) を参照してください。

## プロキシを設定したのに有効にならないのはなぜ？

**答：** 以下の順序で切り分けます（いずれもソースコードで検証可能な動作です）：

**1. 優先度の衝突。** `ProxyURL` > `ProxyPool` > `EnableSystemProxy` で、同時に設定した場合は最高優先度のもののみ有効です——`ProxyURL` を設定するとプロキシプールは使用されません。

**2. 接続再利用がプロキシ選択をバイパス。** 同一ホストへの連続リクエストは確立済み接続（HTTP プロキシの CONNECT トンネルを含む）を再利用し、プロキシ選択関数を再度トリガーしません。**リクエストごとに出口 IP を切り替えたい**場合は設定します：

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyPool = []string{"http://proxy1:8080", "http://proxy2:8080"}
cfg.Connection.ProxyRotatePerRequest = true // リクエストごとにアイドル接続をクローズし、プロキシの再選択を強制
```

**3. システムプロキシの検出タイミング。** `EnableSystemProxy` はクライアント**構築時**にプロキシアドレスを一度だけ検出します（SSRF 免除に使用）。環境変数がその後に localhost プロキシ（`127.0.0.1:7890` など）を指すようになった場合、そのプロキシは SSRF 防護にブロックされる可能性があります——動的なローカルプロキシには明示的な `ProxyURL` を使用してください（http/https/socks5/socks5h をサポート）。

**4. プロキシプールのサーキットブレーカー。** `ProxyFailureThreshold`（デフォルト 3）に達する連続接続失敗のプロキシはローテーションから外れ、`ProxyCooldown`（デフォルト 30s）経過後にハーフオープンプローブで回復します。すべてがサーキットブレークした場合は最も早く回復するプロキシの選択に退化し、直接失敗することはありません。プロキシが継続的に利用不可の場合、サーキットブレーカーしきい値と冷却時間の設定を確認してください。

詳細は [プロキシとプロキシプール](../guides/proxy) を参照してください。

## 127.0.0.0/8 を免除したのに localhost にアクセスできないのはなぜ？

**答：** 事前検証層の localhost ホスト名チェックは CIDR 免除より**先に**実行されます：URL ホスト名が `localhost`、`127.x.x.x`、`::1` などの形式の場合は直接拒否され、免除マッチングに入りません。`SSRFExemptCIDRs` で許可できるのはループバック以外のプライベートセグメント（`10.0.0.0/8` など）のみです。

どうしてもループバックアドレスへのアクセスが必要な場合（ローカルのヘルスチェックなど）：

```go
// リクエストレベルで許可（推奨）：このリクエストのみ SSRF 検証をスキップし、クライアント全体のポリシーは不変
result, err := httpc.Get("http://localhost:8080/health",
    httpc.WithAllowPrivateIPs(true),
)
```

詳細は [SSRF 防護の既知の境界](../security/ssrf) を参照してください。

## エラーメッセージ内の URL はなぜマスクされる？

**答：** HTTPC はエラーメッセージ、ログ、監査イベントに入る URL に対して自動的にマスク処理を行います：認証情報は `***:***` に、`token`/`password`/`api_key` などの機密クエリパラメータは `[REDACTED]` に置換され、fragment は全体が削除されます。

```go
// https://user:pass@example.com/api?token=secret のリクエストが失敗した場合
// エラーメッセージに現れるのは https://***:***@example.com/api?token=[REDACTED]
```

これは「二次漏洩」の防止です：リクエスト失敗そのものは無害でも、生の URL がログ集約システム（ELK、Sentry）に入ると認証情報が新たな漏洩面になります。この動作は組み込みで無効化できず、無効化すべきでもありません。

## その他のリソース

- [クイックスタート](../getting-started/) - 5 分で始める
- [チュートリアル](../guides/tutorial) - ステップバイステップの完全な例
- [設定 API](../api-reference/client-config/config) - 完全な設定リファレンス
- [エラータイプ](../api-reference/types/errors) - ClientError とエラー分類の詳細
- [エラー処理](../guides/error-handling) - エラー処理ガイド
