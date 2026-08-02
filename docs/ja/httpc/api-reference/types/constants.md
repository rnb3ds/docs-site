---
sidebar_label: "定数とタイプ"
title: "定数とタイプ - CyberGo HTTPC | 定数と補助タイプ"
description: "HTTPC 定数と補助タイプ API リファレンス：BodyKind の 6 種リクエストボディ列挙と自動検出ルール、ProxyStrategy プロキシ戦略、FormData と FileData ファイルアップロードタイプ、AuditEvent 監査イベント構造体、AuditConfig 監査設定と SourceIPKey 等のコンテキストキー定義。"
sidebar_position: 2
---

# 定数とタイプ

本ページは HTTPC のすべての公開定数と補助タイプを集約します。リクエストボディタイプ列挙、プロキシ戦略、フォーム/ファイルアップロードタイプ、検証アルゴリズム、監査イベント、フォーマットツール関数、進捗コールバック、Cookie セキュリティ設定が含まれます。

## BodyKind

```go
type BodyKind int
```

リクエストボディタイプで、`WithBody` でリクエストボディの形式を指定するために使用します。

| 定数 | 値 | 意味 | 入力要件 | 対応 Content-Type |
|------|-----|------|----------|-------------------|
| `BodyAuto` | 0 | 自動検出 | 任意（タイプから推論） | 下記検出ルール表を参照 |
| `BodyJSON` | 1 | JSON エンコードを強制 | 任意のシリアライズ可能なタイプ | application/json |
| `BodyXML` | 2 | XML エンコードを強制 | 任意のシリアライズ可能なタイプ | application/xml |
| `BodyForm` | 3 | フォームエンコード | `map[string]string` または互換タイプ | application/x-www-form-urlencoded |
| `BodyBinary` | 4 | バイナリストリーム | `[]byte` または `string` | application/octet-stream |
| `BodyMultipart` | 5 | マルチパートフォーム | `*FormData` | multipart/form-data |

### BodyAuto 自動検出ルール

`BodyAuto`（デフォルト値）は入力データの Go タイプからリクエストボディの形式と Content-Type を自動的に推論します：

| 入力 Go タイプ | 推論形式 | Content-Type |
|-------------|----------|-------------|
| `string` | プレーンテキスト | text/plain; charset=utf-8 |
| `[]byte` | バイナリストリーム | application/octet-stream |
| `map[string]string` | フォーム | application/x-www-form-urlencoded |
| `*FormData` | マルチパートフォーム | multipart/form-data |
| `io.Reader` | そのまま透過 | 設定しない（呼び出し側が指定） |
| その他のタイプ | JSON シリアライズ | application/json |

:::tip BodyAuto vs 明示指定
ほとんどのシナリオでは `BodyAuto` で十分です。自動推論が期待に合わない場合（struct を JSON ではなく XML で送信したい場合など）、`BodyJSON`/`BodyXML`/`BodyForm` などを明示的に渡すことでエンコード形式を強制指定できます。
:::

```go
// 自動検出（デフォルト）
result, _ := client.Post(url, httpc.WithBody(data))

// JSON を強制（data が map[string]string でも JSON エンコード）
result, _ := client.Post(url, httpc.WithBody(data, httpc.BodyJSON))

// XML を強制
result, _ := client.Post(url, httpc.WithBody(data, httpc.BodyXML))
```

## ProxyStrategy

```go
type ProxyStrategy = proxypool.Strategy
```

プロキシプール選択戦略で、`ConnectionConfig.ProxyPoolStrategy` で使用します。内部パッケージのインポートを避けるための内部 `proxypool.Strategy` のタイプエイリアスです。

| 定数 | 説明 | リトライ時の挙動 |
|------|------|----------|
| `ProxyStrategyRoundRobin` | ラウンドロビン（デフォルト）。順番にプロキシを循環選択し、毎回の選択で次のプロキシに進む | リトライ時に自然と異なる IP に振られ、追加設定不要 |
| `ProxyStrategyRandom` | ランダム。健全なプロキシから一様にランダム選択 | リトライ時にランダム選択、統計的に IP が変わりやすい |

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyPool = []string{
    "http://proxy1:8080",
    "http://proxy2:8080",
}
cfg.Connection.ProxyPoolStrategy = httpc.ProxyStrategyRoundRobin
client, _ := httpc.New(cfg)
```

:::tip ステータスコードによるローテーション
`ProxyRotateOnStatus`（例：`[]int{403}`）と組み合わせることで、特定のステータスコード受信時にリトライ + プロキシローテーションをトリガーでき、CF/WAF などの IP 次元のブロックをバイパスするのに適しています。詳細は [設定リファレンス](../client-config/config) を参照してください。
:::

## FormData / FileData

### FormData

```go
type FormData struct {
    Fields map[string]string    // 通常のフォームフィールド
    Files  map[string]*FileData // ファイルフィールド
}
```

`BodyMultipart` モードのマルチパートフォームデータに使用します。`Fields` はキー値ペアを格納し、`Files` はファイルを格納します。内部 `types.FormData` のタイプエイリアスです。

### FileData

```go
type FileData struct {
    Filename    string // ファイル名
    Content     []byte // ファイル内容
    ContentType string // MIME タイプ（例："image/png"、"application/pdf"）
}
```

内部 `types.FileData` のタイプエイリアスです。

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
		log.Fatalf("クライアントの作成に失敗: %v", err)
	}
	defer func() { _ = client.Close() }()

	form := &httpc.FormData{
		Fields: map[string]string{
			"username": "alice",
			"title":    "profile photo",
		},
		Files: map[string]*httpc.FileData{
			"avatar": {
				Filename:    "photo.png",
				Content:     []byte("\x89PNG..."), // 実際は os.ReadFile で読み取り
				ContentType: "image/png",
			},
		},
	}

	result, err := client.Post("https://httpbin.org/post", httpc.WithFormData(form))
	if err != nil {
		log.Fatalf("アップロードに失敗: %v", err)
	}

	fmt.Println("アップロード完了、ステータスコード:", result.StatusCode())
}
```

## ChecksumAlgorithm

```go
type ChecksumAlgorithm string

const ChecksumSHA256 ChecksumAlgorithm = "sha256"
```

ダウンロード検証アルゴリズム。現在は `"sha256"` のみサポートします。`DownloadConfig.ChecksumAlgorithm` で使用し、`DefaultDownloadConfig()` ではデフォルトで `ChecksumSHA256` に設定されます。未サポートのアルゴリズムを渡すとダウンロード開始前に `"unsupported checksum algorithm"` エラーを返します。

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/archive.zip"
cfg.Checksum = "e3b0c44298fc1c149afbf4c8996fb924..." // 期待される SHA-256 16 進値
cfg.ChecksumAlgorithm = httpc.ChecksumSHA256
```

## AuditEvent

```go
type AuditEvent struct {
    Timestamp     time.Time           `json:"timestamp"`
    Method        string              `json:"method"`
    URL           string              `json:"url"`           // マスク済み（認証情報は削除）
    StatusCode    int                 `json:"statusCode"`
    Duration      time.Duration       `json:"duration"`
    Attempts      int                 `json:"attempts"`
    Error         error               `json:"error,omitempty"`
    SourceIP      string              `json:"sourceIP,omitempty"`
    UserID        string              `json:"userID,omitempty"`
    RedirectChain []string            `json:"redirectChain,omitempty"`
    ReqHeaders    map[string][]string `json:"reqHeaders,omitempty"`
    RespHeaders   map[string][]string `json:"respHeaders,omitempty"`
}
```

セキュリティ監査イベントで、`AuditMiddleware` が各リクエスト/レスポンスサイクル完了後に生成します。金融、医療、政府などの高コンプライアンスシナリオ向けに設計され、完全なリクエスト/レスポンスコンテキストをキャプチャします。

| フィールド | タイプ | 説明 |
|------|------|------|
| `Timestamp` | `time.Time` | リクエスト開始時刻 |
| `Method` | `string` | HTTP メソッド |
| `URL` | `string` | リクエスト URL（マスク済み、認証情報削除） |
| `StatusCode` | `int` | レスポンスステータスコード（レスポンスなしの場合は 0） |
| `Duration` | `time.Duration` | リクエスト総所要時間 |
| `Attempts` | `int` | 試行回数（リトライ含む） |
| `Error` | `error` | エラーオブジェクト（SanitizeError でマスク可能） |
| `SourceIP` | `string` | ソース IP（context から抽出） |
| `UserID` | `string` | ユーザー ID（context から抽出） |
| `RedirectChain` | `[]string` | リダイレクトチェーン |
| `ReqHeaders` | `map[string][]string` | リクエストヘッダー（IncludeHeaders=true が必要） |
| `RespHeaders` | `map[string][]string` | レスポンスヘッダー（IncludeHeaders=true が必要） |

### MarshalJSON カスタムシリアライズ

`AuditEvent` はカスタム JSON シリアライズを実装し、JSON フレンドリーな 2 つの派生フィールドを提供します：

| JSON フィールド | 由来 | 説明 |
|-----------|------|------|
| `durationMs` | `Duration.Milliseconds()` | ミリ秒整数、ログ集計ツールでの解析に便利 |
| `error` | `Error.Error()` | エラー文字列（error インターフェースのデフォルトシリアライズの代替） |

これにより JSON 出力には元の `duration`（ナノ秒）と読みやすい `durationMs`（ミリ秒）の両方が含まれ、`error` フィールドは空オブジェクトではなく文字列として出力されます。

### AuditConfig

```go
type AuditConfig struct {
    OnAudit        func(event AuditEvent) // 監査コールバック、nil の場合はミドルウェアは何もしない
    Format         string                 // "text" または "json"
    IncludeHeaders bool                   // リクエスト/レスポンスヘッダーを含む
    MaskHeaders    []string               // マスクが必要なヘッダー名（例："Authorization"、"Cookie"）
    SanitizeError  bool                   // エラー情報をマスク（"[sanitized]" に置換）
}
```

`DefaultAuditConfig()` がデフォルト値を提供します：`Format="text"`、`IncludeHeaders=false`、`MaskHeaders=機密ヘッダーリスト`（Authorization/Cookie など）、`SanitizeError=true`。

## コンテキストキー

| 定数 | 値 | 説明 |
|------|-----|------|
| `SourceIPKey` | `"source_ip"` | 監査イベントのソース IP アドレス |
| `UserIDKey` | `"user_id"` | 監査イベントのユーザー識別子 |

これら 2 つのキーの型は `auditContextKey`（非エクスポートの文字列型）で、`context.WithValue` で監査情報を渡すために使用します。`AuditMiddleware` は `ctx.Value(httpc.SourceIPKey)` と `ctx.Value(httpc.UserIDKey)` でこれらの値を抽出し、`AuditEvent` に埋めます。

```go
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/cybergodev/httpc"
)

func main() {
	// context で監査情報を渡す
	ctx := context.WithValue(context.Background(), httpc.SourceIPKey, "192.168.1.100")
	ctx = context.WithValue(ctx, httpc.UserIDKey, "user-789")

	// 監査ミドルウェアを設定
	auditCfg := httpc.DefaultAuditConfig()
	auditCfg.Format = "json"
	auditCfg.IncludeHeaders = true
	auditCfg.OnAudit = func(event httpc.AuditEvent) {
		fmt.Printf("[AUDIT] %s %s -> %d (%v) src=%s user=%s\n",
			event.Method, event.URL, event.StatusCode,
			event.Duration, event.SourceIP, event.UserID)
	}

	cfg := httpc.DefaultConfig()
	cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
		httpc.AuditMiddleware(auditCfg),
	}
	client, err := httpc.New(cfg)
	if err != nil {
		log.Fatalf("クライアントの作成に失敗: %v", err)
	}
	defer func() { _ = client.Close() }()

	// context 内の SourceIP/UserID はミドルウェアによって監査イベントに抽出される
	result, err := client.Request(ctx, "GET", "https://httpbin.org/get")
	if err != nil {
		log.Fatalf("リクエストに失敗: %v", err)
	}
	fmt.Println("ステータスコード:", result.StatusCode())
}
```

## FormatBytes / FormatSpeed

### FormatBytes

```go
func FormatBytes(bytes int64) string
```

バイト数を人間が読める文字列にフォーマットします。バイナリ単位（1024 進法）を採用し、1024 未満の場合は整数、それ以外は小数点以下 2 桁を表示します。

| 入力 | 出力 |
|------|------|
| `512` | `"512 B"` |
| `1536` | `"1.50 KB"` |
| `1572864` | `"1.50 MB"` |
| `1073741824` | `"1.00 GB"` |

単位チェーン：B → KB → MB → GB → TB → PB → EB。

### FormatSpeed

```go
func FormatSpeed(bytesPerSecond float64) string
```

バイト速度を人間が読める文字列にフォーマットします。単位は FormatBytes と同じですが `/s` サフィックスを付けます。

| 入力 | 出力 |
|------|------|
| `512.0` | `"512 B/s"` |
| `1572864.0` | `"1.50 MB/s"` |

ダウンロード進捗コールバックでの速度表示によく使用されます。

```go
speed := httpc.FormatSpeed(1572864.0) // "1.50 MB/s"
size := httpc.FormatBytes(1572864)    // "1.50 MB"
```

## DownloadProgressCallback

```go
type DownloadProgressCallback func(downloaded, total int64, speed float64)
```

ダウンロード進捗コールバック関数のシグネチャで、`DownloadConfig.ProgressCallback` で使用します。

| パラメータ | タイプ | 説明 |
|------|------|------|
| `downloaded` | `int64` | ダウンロード済みバイト数（レジューム時は既にレジューム済みの部分を含む） |
| `total` | `int64` | 総バイト数（サーバーが Content-Length を返さない場合は -1） |
| `speed` | `float64` | 現在のダウンロード速度（バイト/秒）、`FormatSpeed` に直接渡せる |

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/large.zip"
cfg.ProgressCallback = func(downloaded, total int64, speed float64) {
	if total > 0 {
		pct := float64(downloaded) / float64(total) * 100
		fmt.Printf("\r%.1f%%  %s / %s  %s",
			pct,
			httpc.FormatBytes(downloaded),
			httpc.FormatBytes(total),
			httpc.FormatSpeed(speed),
		)
	}
}
```

## CookieSecurityConfig

```go
type CookieSecurityConfig = validation.CookieSecurityConfig
```

Cookie セキュリティ属性の検証設定です。内部 `validation.CookieSecurityConfig` のタイプエイリアスで、SessionManager と `WithSecureCookie` リクエストオプションで使用します。

```go
type CookieSecurityConfig struct {
    RequireSecure                bool    // Secure 属性を要求（HTTPS 送信のみ）
    RequireHttpOnly              bool    // HttpOnly 属性を要求（XSS 窃取を防止）
    RequireSameSite              string  // SameSite 値を要求："Strict"/"Lax"/"None"/""
    AllowSameSiteNone            bool    // SameSite=None を許可するか
    RequireSecureForSameSiteNone bool    // SameSite=None 時に Secure を強制
}
```

| フィールド | タイプ | 説明 |
|------|------|------|
| `RequireSecure` | `bool` | Secure 属性を要求、HTTPS 送信のみ。本番環境では true を推奨 |
| `RequireHttpOnly` | `bool` | HttpOnly 属性を要求、JS アクセスを禁止し XSS を防止。セッション Cookie では true を推奨 |
| `RequireSameSite` | `string` | SameSite 値を要求。`"Strict"`（ファーストパーティのみ）、`"Lax"`（ファーストパーティ + トップナビゲーション）、`"None"`（すべてのコンテキスト、Secure 必須）、`""`（要求なし） |
| `AllowSameSiteNone` | `bool` | SameSite=None を許可するか。false かつ RequireSameSite が空の場合、SameSite=None の Cookie を拒否 |
| `RequireSecureForSameSiteNone` | `bool` | SameSite=None 時に Secure を強制（RFC 6265bis 準拠）。デフォルト true |

利用可能なファクトリ関数：

| ファクトリ関数 | ポリシー | 適用シナリオ |
|----------|------|----------|
| `DefaultCookieSecurityConfig()` | 緩やか：非 HTTPS 許可、JS アクセス許可、SameSite=None 許可 | 開発環境、互換性優先 |
| `StrictCookieSecurityConfig()` | 厳格：Secure + HttpOnly + SameSite=Strict を要求 | 本番環境、高セキュリティシナリオ（金融/医療/政府） |

```go
// 厳格ポリシー：Secure + HttpOnly + SameSite=Strict を要求
strict := httpc.StrictCookieSecurityConfig()

// カスタムポリシー：HttpOnly を要求し、SameSite=Lax を許可
custom := &httpc.CookieSecurityConfig{
    RequireHttpOnly: true,
    RequireSameSite: "Lax",
    AllowSameSiteNone: false,
}

// SessionManager に適用
sm.SetCookieSecurity(strict)

// または単一リクエストの Cookie 検証に適用
result, err := client.Get(url, httpc.WithSecureCookie(strict))
```

:::warning WithSecureCookie の順序依存性
`WithSecureCookie` は**適用時に既存の** Cookie のみを検証します。必ずすべての `WithCookie`/`WithCookieMap` の後に配置してください。順序に依存しないセッションレベルの検証が必要な場合は、`SessionManager.SetCookieSecurity` を使用してください。
:::

## 関連項目

- [エラータイプ](./errors) - ClientError、ErrorType とエラー変数の完全なリファレンス
- [リクエストオプション](../core/options) - WithBody での BodyKind の使用
- [ミドルウェア](../client-config/middleware) - AuditMiddleware と監査設定
- [セッション管理](../client-config/session) - SessionManager と CookieSecurityConfig のセッションレベル使用
