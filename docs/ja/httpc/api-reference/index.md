---
sidebar_label: "概要"
title: "API リファレンス - CyberGo HTTPC | API 総索引"
description: "HTTPC API 総索引：コア関数、リクエストオプション、Result、Config 設定、ミドルウェア、ミューテータ、タイプ、エラー、定数の 9 グループ別 API マップ。28 個の WithXxx オプション、5 つのプリセット、7 つの内蔵ミドルウェア、12 個のエラー変数を網羅します。"
sidebar_position: 1
---

# API リファレンス

HTTPC は 28 個のリクエストオプション関数、5 つの設定プリセット、7 つの内蔵ミドルウェア、完全なダウンロードサポートを提供します。

## コアアーキテクチャ

HTTPC は二重階層設計を採用しています。Layer 1 のメソッド API は薄いラッパーであり、実際にリクエストを処理するエンジンは Layer 2 の Handler パイプラインです。

```text
HTTPC 二重階層アーキテクチャ
├── Layer 1  メソッド API（薄いラッパー）
│     パッケージ関数 httpc.Get/Post/... + Client メソッド + リクエストオプション → Result
│
└── Layer 2  Handler パイプライン（リクエスト処理エンジン）
      MiddlewareFunc(Handler) オニオンチェーン
      → clientImpl.middlewareChain を組み立て
      → 実行（各リクエスト = Handler チェーンの組み立てと実行）
```

## モジュールナビゲーション

### コア

| モジュール | 説明 |
|-----------|------|
| [パッケージ関数とクライアントメソッド](./core/functions) | Get/Post/Put/Patch/Delete などのパッケージレベル関数、クライアントメソッド、ヘルパー関数 |
| [設定](./client-config/config) | Config 構造体、5 種類のプリセット設定、検証関数、Cookie セキュリティ |
| [インターフェース](./types/interfaces) | Client、Doer、DomainClienter、RetryPolicy などのコアインターフェース |
| [Result](./core/result) | Result、RequestInfo、ResponseInfo、RequestMeta タイプと全メソッド |
| [ハンドラパイプライン](./handler/handler-chain) | Handler パイプライン、MiddlewareFunc オニオンチェーン、Chain 結合器とミューテータ契約 |
| [ミューテータ](./handler/mutators) | RequestMutator/ResponseMutator の読み書きメソッドと型アサーション |

### リクエストとレスポンス

| モジュール | 説明 |
|-----------|------|
| [リクエストオプション](./core/options) | 28 個の WithXxx リクエストオプション関数（ヘッダー、ボディ、認証、Cookie、コールバックなど） |
| [内蔵ミドルウェア](./client-config/middleware) | Chain 組み合わせ、7 つの内蔵ミドルウェアファクトリ、監査イベントタイプ |
| [エラータイプ](./types/errors) | ClientError、12 種類の ErrorType 列挙と 12 個のエラー変数 |

### 高度な機能

| モジュール | 説明 |
|-----------|------|
| [ドメインクライアント](./client-config/domain-client) | DomainClient 作成、HTTP メソッド、ダウンロードメソッド、URL 結合ルール |
| [セッション管理](./client-config/session) | SessionManager の Cookie/ヘッダー管理とセキュリティ検証 |
| [ファイルダウンロード](./client-config/download) | ダウンロード関数、DownloadConfig、レジューム、セキュリティ保護 |
| [定数とタイプ](./types/constants) | BodyKind 列挙、FormData/FileData と監査コンテキストキー |

## API マップ

シンボルタイプ別にグループ化された完全な索引で、`github.com/cybergodev/httpc` パッケージのエクスポート面と一対一に対応します。クリックすると対応する詳細ページにジャンプします。

### クライアントとパッケージ関数

| シンボル | 説明 |
|------|------|
| [`New`](./core/functions#new) / [`NewDefault`](./core/functions#newdefault) | クライアントの作成（カスタム / デフォルト設定） |
| [`Get`](./core/functions#get) / `Post` / `Put` / `Patch` / `Delete` / `Head` / `Options` / [`Request`](./core/functions#request) | パッケージレベル HTTP メソッド（内部デフォルトクライアントを共有） |
| [`Download`](./core/functions#download) | 統一されたファイルダウンロード入口（パッケージ関数 / Client / DomainClient の 3 箇所で同名同シグネチャ） |
| [`SetDefaultClient`](./core/functions#setdefaultclient) / [`CloseDefaultClient`](./core/functions#closedefaultclient) | デフォルトクライアントの置き換えとクローズ |
| [`NewDomain`](./core/functions#newdomain) / [`NewDomainDefault`](./core/functions#newdomaindefault) | ドメインスコープのクライアント |
| [`SetSecurityWarnOutput`](./core/functions#setsecuritywarnoutput) | セキュリティ警告出力のリダイレクト |
| [`FormatBytes`](./core/functions#formatbytes) / [`FormatSpeed`](./core/functions#formatspeed) | バイト数 / 速度のフォーマット |

### リクエストオプション（28 個）

| グループ | オプション |
|------|------|
| リクエストヘッダー（3） | `WithHeader`、`WithHeaderMap`、`WithUserAgent` |
| 認証（2） | `WithBasicAuth`、`WithBearerToken` |
| リクエストボディ（7） | `WithJSON`、`WithXML`、`WithForm`、`WithFormData`、`WithFile`、`WithBinary`、`WithBody` |
| クエリパラメータ（2） | `WithQuery`、`WithQueryMap` |
| Cookie（5） | `WithCookie`、`WithCookies`、`WithCookieMap`、`WithCookieString`、`WithSecureCookie` |
| リクエスト制御（7） | `WithContext`、`WithTimeout`、`WithMaxRetries`、`WithFollowRedirects`、`WithMaxRedirects`、`WithAllowPrivateIPs`、`WithStreamBody` |
| コールバック（2） | `WithOnRequest`、`WithOnResponse` |

すべてのオプションのシグネチャ、検証ルール、上書きする Config デフォルト値は [リクエストオプション](./core/options) を参照してください。

### Result ファミリー

| 分類 | シンボル |
|------|------|
| タイプ | `Result`（17 個の nil 安全メソッド） |
| ステータスとプロトコル | `StatusCode`、`Proto`、`IsSuccess`、`IsRedirect`、`IsClientError`、`IsServerError` |
| リクエストボディアクセス | `Body`、`RawBody` |
| 解析と保存 | `Unmarshal`、`SaveToFile`、`String` |
| Cookie | `ResponseCookies`、`GetCookie`、`HasCookie`、`RequestCookies`、`GetRequestCookie`、`HasRequestCookie` |
| サブタイプ | `RequestInfo`、`ResponseInfo`、`RequestMeta`（`ProxyURL` プロキシフィールドを含む） |

詳細は [Result](./core/result) を参照してください。

### 設定

| 分類 | シンボル |
|------|------|
| メインタイプ | `Config`（`Timeouts` / `Connection` / `Security` / `Retry` / `Middleware` / `Defaults` の 6 グループ） |
| サブ設定タイプ | `TimeoutConfig`、`ConnectionConfig`、`SecurityConfig`、`RetryConfig`、`MiddlewareConfig`、`RequestDefaults` |
| プリセット（5 つ） | `DefaultConfig`、`SecureConfig`、`PerformanceConfig`、`TestingConfig`、`MinimalConfig` |
| 検証と出力 | `ValidateConfig`、`Config.String` |
| Cookie セキュリティ | `CookieSecurityConfig`、`DefaultCookieSecurityConfig`、`StrictCookieSecurityConfig` |
| ダウンロード設定 | `DownloadConfig`、`DefaultDownloadConfig`、`DownloadResult`、`DownloadProgressCallback`、`ChecksumAlgorithm` |
| セッション設定 | `SessionConfig`、`DefaultSessionConfig`、`NewSessionManager`、`NewSessionManagerDefault` |

詳細は [設定](./client-config/config)、[ファイルダウンロード](./client-config/download)、[セッション管理](./client-config/session) を参照してください。

### Handler、ミドルウェアとミューテータ

| 分類 | シンボル |
|------|------|
| パイプラインタイプ | `Handler`、`MiddlewareFunc`、`Chain` |
| ミドルウェアファクトリ（7 つ） | `LoggingMiddleware`、`RecoveryMiddleware`、`RequestIDMiddleware`、`TimeoutMiddleware`、`HeaderMiddleware`、`MetricsMiddleware`、`AuditMiddleware` |
| ミドルウェア設定 | `LoggingConfig`、`RequestIDConfig`、`TimeoutMiddlewareConfig`、`HeaderConfig`、`MetricsConfig`、`AuditConfig`（各 `Default*Config()` コンストラクタ付き） |
| ミューテータ | `RequestMutator`、`ResponseMutator`（ミドルウェアがリクエスト/レスポンスを読み書きする契約） |

詳細は [ハンドラパイプライン](./handler/handler-chain)、[内蔵ミドルウェア](./client-config/middleware)、[ミューテータ](./handler/mutators) を参照してください。

### インターフェースとタイプ

| 分類 | シンボル |
|------|------|
| コアインターフェース | `Client`、`Doer`、`DomainClienter`、`RetryPolicy` |
| 型エイリアス | `RequestOption`、`ClientError`、`ErrorType`、`CertificatePinner`、`ProxyStrategy` |
| 証明書ピンニング | `NewSPKIHashPinner`、`NewPublicKeyPinner`、`NewCertificatePinnerChain` |
| セッションとドメイン | `SessionManager`、`DomainClient`（`DomainClienter` インターフェースでの使用を推奨） |
| データ型 | `FormData`、`FileData`、`AuditEvent` |

詳細は [インターフェース](./types/interfaces)、[ドメインクライアント](./client-config/domain-client)、[セッション管理](./client-config/session)、[定数とタイプ](./types/constants) を参照してください。

### エラーと定数

| 分類 | シンボル |
|------|------|
| エラータイプ | `ClientError`、`ErrorType`（12 種類のエラーカテゴリ列挙） |
| センチネルエラー（12 個） | `ErrClientClosed`、`ErrNilConfig`、`ErrInvalidHeader`、`ErrInvalidTimeout`、`ErrInvalidRetry`、`ErrInvalidConnection`、`ErrInvalidSecurity`、`ErrInvalidMiddleware`、`ErrEmptyFilePath`、`ErrFileExists`、`ErrResponseBodyEmpty`、`ErrResponseBodyTooLarge` |
| BodyKind（6 定数） | `BodyAuto`、`BodyJSON`、`BodyXML`、`BodyForm`、`BodyBinary`、`BodyMultipart` |
| その他の定数 | `ProxyStrategyRoundRobin` / `ProxyStrategyRandom`、`ChecksumSHA256`、監査コンテキストキー |

詳細は [エラータイプ](./types/errors)、[定数とタイプ](./types/constants) を参照してください。

## クイックリファレンス

### クライアントの作成

```go
client, err := httpc.NewDefault()              // デフォルト設定
client, err := httpc.New(httpc.SecureConfig()) // セキュアプリセット
client, err := httpc.New(customConfig)         // カスタム設定
```

### リクエストの送信

```go
// パッケージ関数
result, err := httpc.Get(url, options...)

// クライアントメソッド
result, err := client.Get(url, options...)

// コンテキスト付き
result, err := client.Request(ctx, "GET", url, options...)
```

### レスポンスの処理

```go
result.StatusCode()           // ステータスコード
result.Body()                 // レスポンスボディ（文字列）
result.RawBody()              // レスポンスボディ（バイト）
result.Unmarshal(&data)       // JSON 解析
result.IsSuccess()            // 2xx かどうか
result.Meta.Duration          // リクエスト所要時間
result.Meta.Attempts          // リトライ回数
```

## バージョン互換性

- **Go バージョン**：Go 1.25 以上が必要です（`go.mod` は `go 1.25.0` を宣言）。
- **インポートパス**：`github.com/cybergodev/httpc`（パッケージ名 `httpc`、エイリアス不要）。
- **直接依存**：`golang.org/x/sys` のみ（各プラットフォームのシステムプロキシ検出に使用、Linux/macOS/Windows をカバー）。他のサードパーティ依存はありません。
- **API ステータス**：現在、すべてのエクスポートシンボルに `Deprecated` マークはなく、活発にメンテナンスされています。
