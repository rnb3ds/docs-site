---
sidebar_label: "本番チェックリスト"
title: "本番チェックリスト - CyberGo HTTPC | リリース前チェック"
description: "HTTPC 本番セキュリティチェックリスト：TLS と証明書ピンニング、SSRF 免除監査、5 層タイムアウト予算、コネクションプール上限、リトライストーム制御、サイズ制限、Cookie セキュリティ、ダウンロード、Body クローズと一時ファイル削除、ログマスキング。各項目にデフォルト値、推奨本番値、検証方法。"
sidebar_position: 4
---

# 本番チェックリスト

リリース前に項目ごとにチェックすることで、一般的なセキュリティ設定の欠陥を効果的に排除できます。本リストはカテゴリ別にグループ分けされ、各項目にデフォルト値、推奨本番値、検証方法を記載しています。CI でスクリプト（文末参照）による高危険度項目の自動チェックを推奨します。

## TLS / 暗号化

| チェック項目 | デフォルト値 | 推奨本番値 | 検証方法 |
|--------|--------|-----------|----------|
| `InsecureSkipVerify` | `false` | `false` | コード検索、文末コマンド参照 |
| `MinTLSVersion` | TLS 1.2 | TLS 1.2+（高セキュリティなら 1.3 を強制） | `grep MinTLSVersion` |
| `MaxTLSVersion` | TLS 1.3 | TLS 1.3 | `grep MaxTLSVersion` |
| `TestingConfig()` を使用していない | — | はい | コード検索、文末コマンド参照 |
| 証明書ピンニング（高セキュリティシナリオ） | 未有効 | 有効化を推奨 | `grep CertificatePinner` |

:::warning
`InsecureSkipVerify = true` はすべての TLS セキュリティ対策を無効化します。HTTPC は非テスト環境の `stderr` に警告を出力します。リリース前にログにこの警告がないことを必ず確認してください。
:::

バージョンのセマンティクスに関する補足：`MinTLSVersion`/`MaxTLSVersion` が 0 の場合は自動的に 1.2/1.3 にフォールバックします。`Min > Max` は `New()` の検証を通過できません。`TLSConfig` を設定するとバージョンフィールドは無視され、`Security.InsecureSkipVerify` も有効になりません（`TLSConfig` 内で制御する必要があります）——カスタム `TLSConfig` を監査する際はそのフィールド自体に基づいて確認してください。

## SSRF 防護

| チェック項目 | デフォルト値 | 推奨本番値 | 検証方法 |
|--------|--------|-----------|----------|
| `AllowPrivateIPs` | `false` | `false`（信頼できない URL を処理） | コード検索、文末コマンド参照 |
| `SSRFExemptCIDRs` | `nil` | 必要なネットワークセグメントのみ精密にリスト | ネットワークセグメントが絞り込めるか監査 |
| ユーザー URL 処理に `SecureConfig()` を使用 | — | はい | コードレビュー |
| `RedirectWhitelist` | `nil` | ユーザー URL 処理時に設定 | コードレビュー |

```go
cfg := httpc.DefaultConfig()
cfg.Security.AllowPrivateIPs = false
// 実際に必要なネットワークセグメントのみ免除し、可能な限り絞り込む
cfg.Security.SSRFExemptCIDRs = []string{"10.50.0.0/16"}
cfg.Security.RedirectWhitelist = []string{"api.example.com"}
```

## タイムアウト設定

タイムアウトは、Slowloris、リソース枯渇、カスケード障害に対する第一の防衛線です。

| チェック項目 | デフォルト値 | 推奨本番値 | 検証方法 |
|--------|--------|-----------|----------|
| `TimeoutConfig.Request` | 180s | ビジネスに応じて設定（例：30s） | 0 でないことを確認 |
| `TimeoutConfig.Dial` | 10s | 5-10s | `grep Timeouts.Dial` |
| `TimeoutConfig.TLSHandshake` | 10s | 5-10s | `grep Timeouts.TLSHandshake` |
| `TimeoutConfig.ResponseHeader` | 0 | 必要に応じて（下記参照） | そのスコープを理解 |
| `TimeoutConfig.IdleConn` | 90s | 60-120s | — |

:::warning
`TimeoutConfig.ResponseHeader` は transport レベルのハード上限で、当該 client の**すべてのリクエスト**に適用され、`WithTimeout` でリクエストごとに上書き**できません**。正の値に設定すると、より長い `WithTimeout` を上書きします。Slowloris に対する transport レベルの独立防御が必要な場合にのみ正の値を設定してください。AI API などの長いレスポンスシナリオでは 0 に設定し、`Request` タイムアウト制御に依存してください。
:::

### タイムアウト予算の計算方法

`Timeouts.Request`（デフォルト 180s）と `WithTimeout` は、すべてのリトライ試行とバックオフ待機をカバーする総予算です：リトライエンジンはリクエスト全体に対して単一のデッドラインを設定し、試行ごとに計測をやり直すのではありません——`WithTimeout(30s)` + 3 回のリトライでも最大 30s であって、4 倍にはなりません。設定値と `WithTimeout` にはどちらも 30 分のハード上限があり、超過すると設定エラーになります。

単一の試行はより狭いタイムアウトで制約されます：`Dial`（デフォルト 10s）が TCP 確立を、`TLSHandshake`（デフォルト 10s）がハンドシェイクを制限します。下流 API の P99 から逆算して設定することを推奨します：

```go
// 予算式：Request ≥ Dial + TLSHandshake + 予想転送時間 × (1 + MaxRetries) + バックオフ合計
cfg.Timeouts.Request = 30 * time.Second // 総予算
cfg.Timeouts.Dial = 5 * time.Second     // 単発のダイヤル
cfg.Timeouts.TLSHandshake = 5 * time.Second
```

## コネクションプール上限

| チェック項目 | デフォルト値 | 推奨本番値 | 検証方法 |
|--------|--------|-----------|----------|
| `MaxIdleConns`（グローバルアイドル接続） | 50 | 並行度から推定 | 0 でないことを確認 |
| `MaxConnsPerHost`（ホストあたり総接続数） | 10 | 高並行では必要に応じて引き上げ | 0 = 無制限であることに注意 |
| `MaxIdleConnsPerHost`（ホストあたりアイドル） | 自動導出 | — | `MaxConnsPerHost/2` から導出、2-10 にクランプ |
| 接続プール総量上限 | 1000 | — | 接続層に内蔵、超過時はプール枯渇エラーを返す |

設定検証のハード上限：`MaxIdleConns` と `MaxConnsPerHost` はどちらも 0-1000 です（`ValidateConfig` が強制）。誤解しやすい 2 つのセマンティクス：

- `MaxConnsPerHost = 0` は**無制限**を意味します（net/http のセマンティクス）。「接続禁止」ではありません；デフォルト設定は 10 です
- 接続プールの総量上限（1000）は公開 `Config` では変更できません；上限に達すると新しいダイヤルは待機行列に入らず直接失敗します

```go
cfg := httpc.DefaultConfig()
cfg.Connection.MaxIdleConns = 50    // グローバルアイドル接続
cfg.Connection.MaxConnsPerHost = 10 // ホストあたりの接続上限（idle + active）
```

`SecureConfig()` はより保守的な 20/5 を使用し、`PerformanceConfig()` は 100/20 に緩めます。

## サイズ制限

| チェック項目 | デフォルト値 | 推奨本番値 | 検証方法 |
|--------|--------|-----------|----------|
| `MaxResponseBodySize` | 10MB | ビジネスに応じて（例：5MB） | 0 でないことを確認 |
| `MaxDecompressedBodySize` | 100MB | ビジネスに応じて（例：50MB） | 0 でないことを確認 |
| `MaxRequestBodySize` | 0（無制限） | アップロード上限を**明示的に設定** | `grep MaxRequestBodySize` |
| `MaxResponseHeaderBytes` | 0（Go デフォルト 10MB） | 高セキュリティなら 1MB に引き締め | `grep MaxResponseHeaderBytes` |

```go
cfg := httpc.DefaultConfig()
cfg.Security.MaxResponseBodySize = 5 * 1024 * 1024     // 5MB レスポンス
cfg.Security.MaxDecompressedBodySize = 50 * 1024 * 1024 // 50MB 解凍
cfg.Security.MaxRequestBodySize = 2 * 1024 * 1024       // 2MB アップロード（デフォルトは 0 で無制限！）
cfg.Connection.MaxResponseHeaderBytes = 1 * 1024 * 1024  // 1MB レスポンスヘッダー
```

:::danger
`MaxRequestBodySize` のデフォルトは 0（無制限）で、**自動フォールバックもありません**。プロキシ転送やユーザーアップロードの処理時に設定しないと、攻撃者が超大リクエストを送信して帯域幅とメモリを枯渇させる可能性があります。必ず明示的に設定してください。
:::

## リトライ戦略

| チェック項目 | デフォルト値 | 推奨本番値 | 検証方法 |
|--------|--------|-----------|----------|
| `MaxRetries` | 3 | 5 を超えない | コードレビュー |
| 非冪等リクエストのリトライ | — | POST/PUT/PATCH は慎重に | 冪等性のコードレビュー |
| `EnableJitter` | `true` | `true`（Thundering Herd を防止） | `grep EnableJitter` |
| `MaxRetryDelay` | 30s | 30s | — |

:::warning
非冪等リクエスト（POST でのリソース作成、PUT での部分更新）のリトライは、重複作成や重複引き落としを引き起こす可能性があります。ビジネスが非冪等な場合、該当リクエストに `WithMaxRetries(0)` を設定するか、サーバー側で冪等キーを実装してください。
:::

### リトライストーム制御

リトライ可能な組み込みステータスコードは 408/429/500/502/503/504 に固定されています（`internal/engine/errors.go`）。ネットワーク層の一時的エラー（接続拒否/リセット/到達不能、context 以外のトランスポートタイムアウト）も同様にリトライされます。ストーム防止メカニズムはデフォルトで整っています。リリース前に、各項目が弱められていないことを確認してください：

| メカニズム | デフォルト値 | 作用 |
|------|--------|------|
| 指数バックオフ | `Delay=1s`、`BackoffFactor=2.0` | リトライ間隔を広げ、障害のあるサービスに追い打ちをかけない |
| ジッター | `EnableJitter=true` | 同時リトライの同期リズムを分散させ、Thundering Herd を防止 |
| 単発遅延の上限 | `MaxRetryDelay=30s` | バックオフが無限に増大しない |
| Retry-After 遵従 | 自動解析 | サーバーの指示どおりに待機、ただし**上限 60s**——悪意のあるサーバーが超大の Retry-After でクライアントを止めるのを防止 |
| 総予算 | `WithTimeout` が全試行をカバー | リトライはリクエスト総タイムアウトを突破できない |

```go
cfg := httpc.DefaultConfig()
cfg.Retry.MaxRetries = 3                   // 上限 10（ValidateConfig が強制）
cfg.Retry.MaxRetryDelay = 30 * time.Second
cfg.Retry.EnableJitter = true              // デフォルトで有効、監査のため明示的に記述
// 非冪等インターフェースはリクエストレベルでリトライを無効化：
// client.Post(url, httpc.WithJSON(body), httpc.WithMaxRetries(0))
```

:::tip
`ProxyRotateOnStatus`（ステータスコードに応じてプロキシを交代してリトライ）を設定すると、`MaxRetries` は自動的に `len(ProxyPool)-1` まで引き上げられます（上限 10）。各プロキシが少なくとも 1 回試行されることを保証するためです。
:::

また、踏みやすい落とし穴が 2 つあります：`io.Reader` リクエストボディはリトライ再送に対応するため完全にバッファリングされ、100MB を超えると直接エラーになります（`retry not supported for streaming bodies`）。`context.Canceled`/`context.DeadlineExceeded` は決してリトライされず、能動的なキャンセルが重複リクエストを引き起こすことはありません。

## Cookie セキュリティ

| チェック項目 | デフォルト値 | 推奨本番値 | 検証方法 |
|--------|--------|-----------|----------|
| `CookieSecurity` | `nil`（検証しない） | `StrictCookieSecurityConfig()` | `grep CookieSecurity` |
| `WithSecureCookie` の順序 | — | すべての `WithCookie` の後に配置 | コードレビュー |

```go
cfg := httpc.DefaultConfig()
cfg.Security.CookieSecurity = httpc.StrictCookieSecurityConfig()
// Secure + HttpOnly + SameSite=Strict を要求
```

## ファイルダウンロードセキュリティ

| チェック項目 | デフォルト値 | 推奨本番値 | 検証方法 |
|--------|--------|-----------|----------|
| ダウンロードパスが信頼できない | — | 信頼できるパスのみ使用、ユーザー入力を結合しない | コードレビュー |
| `Checksum` 検証 | 未設定 | 重要ファイルに SHA-256 を設定 | `grep Checksum` |
| `Overwrite` / `ResumeDownload` | `false` | 必要に応じて | コードレビュー |

HTTPC の `Download` は 5 層のパス防護（UNC ブロック、制御文字フィルタ、システムパス保護、パストラバーサル検出、シンボリックリンク防護）を内蔵していますが、それでもユーザー入力を直接 `FilePath` にするのは避けてください。

## リソース管理

| チェック項目 | デフォルト値 | 推奨本番値 | 検証方法 |
|--------|--------|-----------|----------|
| 明示的な `client.Close()` | — | `defer client.Close()` | コードレビュー |
| デフォルトクライアントのクローズ | — | 長時間サービスの終了時に `CloseDefaultClient()` | コードレビュー |
| `WithContext` でキャンセルを渡す | — | はい | コードレビュー |
| レスポンス Body の解放 | 自動 | 通常リクエストでは手動クローズ不要（クローズする手段もない） | ストリームを自分で保持していないことを確認 |
| Download の残骸クリーンアップ | 自動 | 中断/検証失敗時に不完全ファイルを自動削除 | `Download` をバイパスして自分で書き込んでいないことを確認 |

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
	cfg := httpc.DefaultConfig()
	client, err := httpc.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	// コネクションプールの解放を確保
	defer func() {
		if cerr := client.Close(); cerr != nil {
			log.Printf("クライアントのクローズ失敗: %v", cerr)
		}
	}()

	// context で単一リクエストのタイムアウトとキャンセルを制御
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	result, err := client.Get("https://api.example.com", httpc.WithContext(ctx))
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("ステータスコード: %d\n", result.StatusCode())
}
```

:::tip
パッケージレベル関数（`httpc.Get` など）を使用する場合、デフォルトクライアントはプログラム終了時に自動的に接続をクローズしません。長時間実行するサービスはグレースフルシャットダウン時に `httpc.CloseDefaultClient()` を呼び出してコネクションプールを解放してください。本番サービスでは明示的な `httpc.New(cfg)` でクライアントを作成し、設定とライフサイクルを管理することを推奨します。
:::

### レスポンス Body と一時ファイル

- **通常のリクエスト**：`Result` が保持するのは読み取り済みでコピーされたバイトです——HTTPC が内部で読み取り、ドレイン（最大 `min(10MB, MaxResponseBodySize)`、接続再利用のため）、クローズまで完了するため、手動でクローズすべき（する入口のある）Body は存在しません
- **大きなファイル**：通常リクエストではなく `Download` を使用します——ストリーミングでのディスク書き込み、進捗コールバックとレジュームダウンロードをサポート。転送中断、検証失敗、ディスク書き込みエラーによる不完全ファイルは自動削除され、中途半端なファイルが残ることはありません
- **`client.Close()`**：アイドル接続、DoH リゾルバー、接続プールをクローズします。冪等で繰り返し呼び出し可能です。クローズ後のクライアントでリクエストを送ると `ErrClientClosed` を返します

## 監視と監査

### 監査ミドルウェア（高セキュリティシナリオ）

`AuditMiddleware` は構造化された監査イベントを生成し、コンプライアンス要件が厳格なシナリオに適しています。イベントの URL はマスク済み（認証情報削除）で、機密リクエストヘッダーはデフォルトでマスキングされます。

```go
auditCfg := httpc.DefaultAuditConfig()
auditCfg.OnAudit = func(event httpc.AuditEvent) {
    // event.SourceIP / event.UserID は context から注入
    data, _ := json.Marshal(event)
    log.Println(string(data))
}
auditCfg.Format = "json"
auditCfg.IncludeHeaders = true
auditCfg.MaskHeaders = []string{"Authorization", "Cookie", "Set-Cookie", "X-API-Key"}
auditMiddleware := httpc.AuditMiddleware(auditCfg)
```

`SourceIP` と `UserID` は context キー `httpc.SourceIPKey`、`httpc.UserIDKey` で注入され、リクエストと呼び出し元の関連付けに便利です。`AuditEvent` にはタイムスタンプ、メソッド、URL、ステータスコード、所要時間、リトライ回数、エラー、リダイレクトチェーン、リクエスト/レスポンスヘッダーなどのフィールドが含まれます。

### ログとメトリクスミドルウェア

| チェック項目 | 推奨本番値 | 検証方法 |
|--------|-----------|----------|
| `RecoveryMiddleware()` | 有効化（panic クラッシュを防止） | `grep RecoveryMiddleware` |
| `LoggingMiddleware()` | 有効化（リクエストログ） | `grep LoggingMiddleware` |
| `MetricsMiddleware()` | 有効化（メトリクス収集） | `grep MetricsMiddleware` |
| `RequestIDMiddleware()` | 有効化（リクエストトレース） | `grep RequestIDMiddleware` |

### 機密情報のログマスキング

HTTPC はデフォルトで出力を複数チャネルでマスキングします。リリース前にバイパスされていないことを確認してください：

| 出力チャネル | マスキング動作 |
|----------|----------|
| エラーメッセージ | URL 認証情報 → `***:***`；`token`/`password`/`api_key` など 20 以上の機密パラメータ → `[REDACTED]`；fragment 削除 |
| `LoggingMiddleware` | リクエストログの URL も同様（`SanitizeURL`、無効化不可） |
| `AuditMiddleware` | 監査イベントの URL をマスキング；`MaskHeaders` にリストされたリクエストヘッダーをマスク |
| `Config.String()` | プロキシ URL の認証情報をマスク；リクエストヘッダーは出力しない |

チェックポイント：カスタムログミドルウェアが元のリクエスト URL を直接出力すると、内蔵マスキングをバイパスします——マスキング済み URL を出力するか、`LoggingMiddleware` をそのまま再利用すべきです。`MaskHeaders` はビジネス独自の機密ヘッダー（`X-API-Key`、`X-Auth-Token` など）をカバーすべきです。

## 証明書ピンニング

高セキュリティシナリオ（金融、医療）では証明書ピンニングの有効化を推奨します。CA が侵害された後の中間者攻撃を防御します：

```go
pinner, err := httpc.NewSPKIHashPinner(
    "YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2fuihg=", // 現在の鍵
    "C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=", // バックアップ（ローテーション）
)
if err != nil {
    log.Fatal(err)
}
cfg := httpc.DefaultConfig()
cfg.Security.CertificatePinner = pinner
```

ピンニングの設定とメンテナンスの詳細は [TLS と証明書ピンニング](./tls-certpin) を参照してください。

## コード例

### 本番レベルのクライアント作成

```go
package main

import (
	"log"
	"time"

	"github.com/cybergodev/httpc"
)

func main() {
	cfg := httpc.DefaultConfig()

	// タイムアウト
	cfg.Timeouts.Request = 30 * time.Second
	cfg.Timeouts.Dial = 10 * time.Second
	cfg.Timeouts.TLSHandshake = 10 * time.Second
	cfg.Timeouts.ResponseHeader = 0 // Request タイムアウトに依存、transport レベルのハード上限は設定しない
	cfg.Timeouts.IdleConn = 90 * time.Second

	// コネクションプール
	cfg.Connection.MaxIdleConns = 50
	cfg.Connection.MaxConnsPerHost = 10

	// セキュリティ
	cfg.Security.AllowPrivateIPs = false
	cfg.Security.MaxResponseBodySize = 5 * 1024 * 1024      // 5MB
	cfg.Security.MaxDecompressedBodySize = 50 * 1024 * 1024 // 50MB
	cfg.Security.MaxRequestBodySize = 2 * 1024 * 1024       // 2MB アップロード

	// リトライ
	cfg.Retry.MaxRetries = 3
	cfg.Retry.Delay = 1 * time.Second
	cfg.Retry.EnableJitter = true

	// リクエストデフォルト値
	cfg.Defaults.UserAgent = "my-service/1.0"
	cfg.Defaults.FollowRedirects = true
	cfg.Defaults.MaxRedirects = 5

	// ミドルウェア
	cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
		httpc.RecoveryMiddleware(),
		httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: log.Printf}),
		httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),
	}

	client, err := httpc.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer func() { _ = client.Close() }()
	log.Println("本番クライアントが準備完了")
}
```

### セキュアクライアント（ユーザー URL を処理）

```go
func createSecureClient() (httpc.Client, error) {
	cfg := httpc.SecureConfig()
	cfg.Security.CookieSecurity = httpc.StrictCookieSecurityConfig()
	cfg.Security.RedirectWhitelist = []string{"api.example.com"}
	// SecureConfig は FollowRedirects = false、AllowPrivateIPs = false、5MB レスポンス上限を設定済み
	return httpc.New(cfg)
}
```

## チェックコマンド

CI またはコミット前に以下のコマンドを実行して高危険度設定をスキャンします：

```bash
# TestingConfig の誤用を確認（テストファイルを除外）
grep -r "TestingConfig" --include="*.go" | grep -v "_test.go"

# InsecureSkipVerify = true を確認
grep -rn "InsecureSkipVerify.*true\|InsecureSkipVerify:\s*true" --include="*.go" | grep -v "_test.go"

# AllowPrivateIPs = true を確認（本番では危険）
grep -rn "AllowPrivateIPs.*true\|AllowPrivateIPs:\s*true" --include="*.go" | grep -v "_test.go"

# MaxRequestBodySize が設定されているか確認（デフォルト 0 は無制限）
grep -rn "MaxRequestBodySize" --include="*.go" | grep -v "_test.go"
```

:::tip
上記コマンドを CI ステップとしてカプセル化し、高危険度設定（`TestingConfig`、`InsecureSkipVerify: true`、`AllowPrivateIPs: true` が非テストコードに出現）がヒットしたらビルドをブロックすることを推奨します。
:::

## 次のステップ

- [セキュリティ概要](./) - セキュリティ機能総覧
- [SSRF 防護](./ssrf) - SSRF 防護の詳細
- [TLS と証明書ピンニング](./tls-certpin) - 証明書ピンニングの本番プラクティス
- [設定 API](../api-reference/client-config/config) - 完全な設定リファレンス
