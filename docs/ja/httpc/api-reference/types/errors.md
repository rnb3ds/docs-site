---
sidebar_label: "エラータイプ"
title: "エラータイプ - CyberGo HTTPC | ClientError 詳細"
description: "HTTPC エラータイプ API リファレンス：ClientError 構造体の 8 フィールドと Code、IsRetryable、Unwrap 等のメソッド、ErrorTypeNetwork 等 12 種のエラー分類列挙、ErrNilConfig 等のセンチネルエラー変数と errors.Is/As マッチング例。"
sidebar_position: 3
---

# エラータイプ

HTTPC は 2 層のエラーモデルを採用しています：下層は標準 `error` インターフェース、上層は分類された `ClientError` 構造体です。すべてのリクエスト失敗（ネットワーク層）は `classifyError` によってコンテキストを保持する `ClientError` にマッピングされ、エラータイプ、リトライ可否の判定、構造化フィールドを提供します。HTTP 層エラー（4xx/5xx）は error を返さず、`Result.StatusCode()` でチェックします。

## ClientError

```go
type ClientError = engine.ClientError
```

分類された HTTP クライアントエラーで、`errors.As` で抽出します。内部 `engine.ClientError` のタイプエイリアスです。

### 構造体フィールド

```go
type ClientError struct {
    Type       ErrorType  // エラー分類
    Message    string     // エラーの説明
    Cause      error      // 基底エラー
    URL        string     // リクエスト URL（マスク済み）
    Method     string     // HTTP メソッド
    Attempts   int        // 試行済み回数
    StatusCode int        // HTTP ステータスコード（該当する場合）
    Host       string     // ホスト名（サーキットブレーカー用）
}
```

| フィールド | タイプ | 説明 | 典型値 |
|------|------|------|--------|
| `Type` | `ErrorType` | エラー分類、switch 判定に使用 | `ErrorTypeNetwork`、`ErrorTypeTimeout` |
| `Message` | `string` | エラーの説明情報 | `"network operation failed"` |
| `Cause` | `error` | 基底エラー、`Unwrap()` で取得可能 | `*net.OpError`、`*net.DNSError` |
| `URL` | `string` | リクエスト URL（認証情報はマスク済み） | `"https://example.com/path"` |
| `Method` | `string` | HTTP メソッド | `"GET"`、`"POST"` |
| `Attempts` | `int` | 試行済み回数（初回リクエスト含む） | `1`（初回失敗）、`4`（3 回リトライ後） |
| `StatusCode` | `int` | HTTP ステータスコード（HTTP エラー以外では 0） | `0`（ネットワークエラー）、`503`（サーバーエラー） |
| `Host` | `string` | リクエストホスト名（サーキットブレーカー用） | `"example.com"` |

### メソッド

| メソッド | 戻り値 | 説明 |
|------|--------|------|
| `Error()` | `string` | `"METHOD url: message: cause (attempt N)"` 形式にフォーマット |
| `Code()` | `string` | 短いエラーコードを返す（例：`"NETWORK_ERROR"`、`"TIMEOUT"`） |
| `IsRetryable()` | `bool` | このエラーがリトライに値するかを判定 |
| `Unwrap()` | `error` | `Cause` を返し、`errors.Is`/`errors.As` でエラーチェーンを走査可能 |
| `WithType(t ErrorType)` | `*ClientError` | エラータイプを設定した**コピー**を返す（オリジナルは変更しない） |

### Error() フォーマット

`Error()` メソッドはエラーを読み取り可能な文字列にフォーマットします：

- URL と Method の両方がある：`"GET https://example.com: network operation failed: dial tcp ... (attempt 1)"`
- Message のみ：Message を直接出力
- Cause がある：`": " + Cause.Error()` を追加
- Attempts がある（>0）：`" (attempt N)"` を追加

URL は出力前に自動的に `SanitizeURL` でマスク（認証情報削除）されます。エンジン分類パスで生成されたエラーは既にマスク済み（`urlSanitized=true`）で、冗長な url.Parse 呼び出しをスキップして割り当てを回避します。

### Code() エラーコード

`Code()` はエラータイプを識別する短い文字列を返し、ログの分類と監視アラートに便利です：

| ErrorType | Code() 戻り値 |
|-----------|---------------|
| `ErrorTypeNetwork` | `"NETWORK_ERROR"` |
| `ErrorTypeTimeout` | `"TIMEOUT"` |
| `ErrorTypeContextCanceled` | `"CONTEXT_CANCELED"` |
| `ErrorTypeResponseRead` | `"RESPONSE_READ_ERROR"` |
| `ErrorTypeTransport` | `"TRANSPORT_ERROR"` |
| `ErrorTypeRetryExhausted` | `"RETRY_EXHAUSTED"` |
| `ErrorTypeTLS` | `"TLS_ERROR"` |
| `ErrorTypeCertificate` | `"CERTIFICATE_ERROR"` |
| `ErrorTypeDNS` | `"DNS_ERROR"` |
| `ErrorTypeValidation` | `"VALIDATION_ERROR"` |
| `ErrorTypeHTTP` | `"HTTP_ERROR"` |
| `ErrorTypeUnknown`（およびその他） | `"UNKNOWN_ERROR"` |

```go
var clientErr *httpc.ClientError
if errors.As(err, &clientErr) {
    log.Printf("エラーコード: %s, URL: %s, 試行回数: %d, リトライ可: %v",
        clientErr.Code(), clientErr.URL, clientErr.Attempts, clientErr.IsRetryable())
}
```

## IsRetryable 判定ロジック

`IsRetryable()` は HTTPC リトライメカニズムの中核となる意思決定メソッドです。判定フロー：

1. **コンテキストエラーを優先チェック**：Cause が `context.Canceled` または `context.DeadlineExceeded` の場合、即座に false を返す（永遠にリトライしない）
2. **ErrorType でディスパッチ**：

| ErrorType | リトライ可 | 判定ロジック |
|-----------|:----------:|----------|
| `ErrorTypeNetwork` | 条件による | Cause をチェック：ラップされた ClientError → 再帰判定；`*net.OpError` → タイムアウトまたはリトライ可能な syscall（ECONNREFUSED/ECONNRESET/EPIPE/ETIMEDOUT/ENETUNREACH/EHOSTUNREACH）；`net.Error` → デフォルトでリトライ可；メッセージマッチ（"connection reset"/"eof"/"broken pipe" など） |
| `ErrorTypeTimeout` | はい | すべてのトランスポート層タイムアウトはリトライ可 |
| `ErrorTypeTransport` | はい | HTTP トランスポート層エラー |
| `ErrorTypeResponseRead` | 条件による | 読み取り操作（`Op == "read"` または `"readfrom"`）のみリトライ可；書き込み操作はリトライしない |
| `ErrorTypeDNS` | 条件による | Cause が `*net.DNSError` の場合、`IsTemporary` または `IsTimeout` が true の場合のみリトライ |
| `ErrorTypeHTTP` | 条件による | StatusCode が `retryableStatusCodes`（408/429/500/502/503/504）にヒットすればリトライ可 |
| `ErrorTypeContextCanceled` | いいえ | ユーザーの能動的キャンセル |
| `ErrorTypeValidation` | いいえ | リクエスト自体が不正、リトライは無意味 |
| `ErrorTypeTLS` | いいえ | TLS プロトコルエラー、通常は自己修復しない |
| `ErrorTypeCertificate` | いいえ | 証明書検証失敗、リトライは無意味 |
| `ErrorTypeRetryExhausted` | いいえ | リトライ回数が枯渇済み |
| `ErrorTypeUnknown` | いいえ | 不明なエラー、保守的にリトライしない |

### retryableStatusCodes

```go
var retryableStatusCodes = map[int]bool{
    408: true, // Request Timeout
    429: true, // Too Many Requests
    500: true, // Internal Server Error
    502: true, // Bad Gateway
    503: true, // Service Unavailable
    504: true, // Gateway Timeout
}
```

これは HTTP ステータスコードがリトライをトリガーする唯一の真実のソースで、リトライロジックと `IsRetryable()` の両方で使用されます。

:::tip タイムアウトタイプの微妙な違い
`ErrorTypeTimeout` はリトライ可能ですが、**コンテキストデッドラインでトリガーされたタイムアウトはリトライできません**——`context.DeadlineExceeded` は第 1 ステップでインターセプトされる（false を返す）ためです。トランスポート層タイムアウト（`net.OpError.Timeout()` など）のみが第 2 ステップに到達してリトライ可能と判定されます。これによりユーザーが設定した `WithTimeout` がリトライで突破されるのを防ぎます。
:::

## ErrorType

```go
type ErrorType = engine.ErrorType
```

エラー分類列挙（`int` 型）。

| 定数 | 値 | 意味 | 典型的トリガーシナリオ | リトライ可 |
|------|-----|------|-------------|:------:|
| `ErrorTypeUnknown` | 0 | 不明/未分類 | いかなる既知のパターンにもマッチしない | いいえ |
| `ErrorTypeNetwork` | 1 | ネットワーク層エラー | 接続拒否、接続リセット、ネットワーク到達不可 | 条件による |
| `ErrorTypeTimeout` | 2 | タイムアウト | `net.OpError` タイムアウト、コンテキストデッドライン¹ | 条件による² |
| `ErrorTypeContextCanceled` | 3 | コンテキストキャンセル | `context.Cancel` がトリガー | いいえ |
| `ErrorTypeResponseRead` | 4 | レスポンスボディ読み取りエラー | レスポンスボディ読み取り時の EOF/接続中断 | 条件による |
| `ErrorTypeTransport` | 5 | トランスポート層エラー | HTTP プロトコルエラー、トランスポート失敗 | はい |
| `ErrorTypeRetryExhausted` | 6 | リトライ枯渇 | MaxRetries に達しても成功せず | いいえ |
| `ErrorTypeTLS` | 7 | TLS エラー | TLS ハンドシェイク失敗、プロトコル不一致 | いいえ |
| `ErrorTypeCertificate` | 8 | 証明書検証エラー | x509 証明書の期限切れ/非信頼 | いいえ |
| `ErrorTypeDNS` | 9 | DNS 解決エラー | ドメインが存在しない、DNS タイムアウト | 条件による |
| `ErrorTypeValidation` | 10 | リクエスト検証エラー | URL 形式エラー、リダイレクト超過、CRLF インジェクション | いいえ |
| `ErrorTypeHTTP` | 11 | HTTP 層エラー | 4xx/5xx レスポンス（リトライシナリオでのみ発生） | 条件による |

> ¹ コンテキストデッドライン（`WithTimeout`、`TimeoutConfig.Request`）でトリガーされたタイムアウトはリトライ**されません**；トランスポート層タイムアウト（`net.OpError` タイムアウトなど）のみがリトライされます。
> ² 詳細は上記 [IsRetryable 判定ロジック](#isretryable-判定ロジック) を参照してください。

### タイプ判定

```go
result, err := client.Get(url)
if err != nil {
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        switch clientErr.Type {
        case httpc.ErrorTypeTimeout:
            log.Println("リクエストタイムアウト")
        case httpc.ErrorTypeNetwork:
            log.Println("ネットワークエラー:", clientErr.Message)
        case httpc.ErrorTypeTLS:
            log.Println("TLS エラー")
        case httpc.ErrorTypeCertificate:
            log.Println("証明書検証失敗")
        case httpc.ErrorTypeDNS:
            log.Println("DNS 解決失敗")
        case httpc.ErrorTypeRetryExhausted:
            log.Println("リトライ枯渇、合計", clientErr.Attempts, "回試行")
        case httpc.ErrorTypeContextCanceled:
            log.Println("リクエストがキャンセルされました")
        case httpc.ErrorTypeValidation:
            log.Println("リクエスト検証失敗")
        }
    }
}
```

## URL マスクメカニズム

`ClientError.Error()` はフォーマット時に自動的に `validation.SanitizeURL` を呼び出し、URL 内の認証情報（`user:pass@host` → `***:***@host`）を削除し、機密情報のログやエラーメッセージへの漏洩を防止します。

```go
// 元の URL: https://admin:secret@api.example.com/data
// Error() 出力: GET https://***:***@api.example.com/data: ...
```

エンジン分類パス（`classifyErrorWithSanitizedURL`）は初回分類時にマスクを完了し `urlSanitized=true` を設定します。以降の `Error()` 呼び出しは冗長な url.Parse をスキップし、毎回のログ出力で割り当てが発生するのを回避します。

:::tip コールバック内のエラーマスク
`MetricsMiddleware` や `LoggingMiddleware` などのミドルウェアのコールバックでは、HTTPC は非 ClientError タイプのエラーメッセージを追加でチェックし、元の URL をマスク版に置き換えて、コールバックが認証情報を漏洩しないようにします。
:::

## エラー分類フロー

`classifyError` は基底の `error` を `*ClientError` にマッピングする中核関数で、以下の順序で階層的に判定します：

1. **context エラー**：`context.Canceled` → `ErrorTypeContextCanceled`；`context.DeadlineExceeded` → `ErrorTypeTimeout`
2. **コネクションプール枯渇**：`connection.ErrPoolExhausted` → `ErrorTypeNetwork`
3. **`*url.Error` のアンラップ**：HTTP/2 無効ヘッダー、URL 解析失敗 → `ErrorTypeValidation`；それ以外は内側のエラーをアンラップして判定継続
4. **`*net.DNSError`**：`ErrorTypeDNS`、タイムアウトと失敗を区別
5. **`*net.OpError`**：`ErrorTypeNetwork`、タイムアウトと操作失敗を区別
6. **`net.Error`**：タイムアウト → `ErrorTypeTimeout`；その他 → `ErrorTypeNetwork`
7. **メッセージパターンマッチ**（フォールバック）：エラーメッセージのキーワードで TLS/certificate/timeout/connection refused などの 20+ パターンをマッチ
8. **フォールバック**：`url.Error` の内側がいかなるパターンにもマッチしない場合 → `ErrorTypeNetwork`；それ以外 → `ErrorTypeUnknown`

## エラー変数

### 設定エラー

| 変数 | エラーメッセージ | トリガー条件 |
|------|----------|----------|
| `ErrNilConfig` | `"config cannot be nil"` | nil Config を `New`/`ValidateConfig` に渡した |
| `ErrInvalidTimeout` | `"invalid timeout"` | タイムアウト値が負または 30 分の上限を超過 |
| `ErrInvalidRetry` | `"invalid retry configuration"` | MaxRetries が 0–10 の範囲外、BackoffFactor が 1.0–10.0 の範囲外 |
| `ErrInvalidConnection` | `"invalid connection configuration"` | MaxIdleConns/MaxConnsPerHost が範囲外、ProxyURL 形式エラー |
| `ErrInvalidSecurity` | `"invalid security configuration"` | MaxResponseBodySize が 0–1GB の範囲外 |
| `ErrInvalidMiddleware` | `"invalid middleware configuration"` | MaxRedirects が 0–50 の範囲外、UserAgent が長すぎるか制御文字を含む |
| `ErrInvalidHeader` | `"invalid header"` | リクエストヘッダーのキー値に制御文字を含むかサイズ制限を超過 |

### リクエストとレスポンスのエラー

| 変数 | エラーメッセージ | トリガー条件 |
|------|----------|----------|
| `ErrEmptyFilePath` | `"file path cannot be empty"` | DownloadConfig.FilePath が空 |
| `ErrFileExists` | `"file already exists"` | ファイルが既存で Overwrite=false かつ ResumeDownload=false |
| `ErrResponseBodyEmpty` | `"response body is empty"` | 空のレスポンスボディに対して Unmarshal などの解析メソッドを呼び出した |
| `ErrResponseBodyTooLarge` | `"response body too large"` | レスポンスボディが MaxResponseBodySize を超過 |

### クライアントエラー

| 変数 | エラーメッセージ | トリガー条件 |
|------|----------|----------|
| `ErrClientClosed` | `"client is closed"` | Close() 後にクライアントを使用した |

## 実用的なマッチングパターン

### errors.As で ClientError を抽出

```go
result, err := client.Get(url)
if err != nil {
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        // 構造化フィールドにアクセス
        fmt.Printf("エラーコード: %s\n", clientErr.Code())
        fmt.Printf("エラータイプ: %d\n", clientErr.Type)
        fmt.Printf("リクエスト: %s %s\n", clientErr.Method, clientErr.URL)
        fmt.Printf("試行回数: %d\n", clientErr.Attempts)
        if clientErr.StatusCode != 0 {
            fmt.Printf("ステータスコード: %d\n", clientErr.StatusCode)
        }
    }
}
```

### errors.Is でセンチネルエラーをマッチ

```go
if errors.Is(err, httpc.ErrClientClosed) {
    // クライアントがクローズ済み、再作成が必要
}
if errors.Is(err, httpc.ErrResponseBodyEmpty) {
    // レスポンスボディが空、解析をスキップ
}
if errors.Is(err, httpc.ErrFileExists) {
    // ファイルが既存、ユーザーに通知するか Overwrite=true を設定
}
```

### errors.Unwrap でエラーチェーンを走査

```go
var clientErr *httpc.ClientError
if errors.As(err, &clientErr) {
    // Cause は基底エラー（例：*net.OpError）
    cause := clientErr.Unwrap()
    if cause != nil {
        var opErr *net.OpError
        if errors.As(cause, &opErr) {
            fmt.Println("操作:", opErr.Op)
            fmt.Println("ネットワーク:", opErr.Net)
            fmt.Println("アドレス:", opErr.Addr)
        }
    }
}
```

:::tip 3 種類のマッチング方式の選択
- `errors.As`：ClientError の構造化フィールド（Type/Code/URL/Attempts など）にアクセスする必要がある場合
- `errors.Is`：センチネルエラー（ErrClientClosed などの設定/ファイルエラー）をマッチする場合
- `errors.Unwrap`：最下層の net/error に到達してシステムレベルの診断情報を取得する必要がある場合
:::

## 関連項目

- [エラー処理](../../guides/error-handling) - 完全なエラー処理ガイド
- [定数とタイプ](./constants) - BodyKind などの定数リファレンス
- [リトライとフォールトトレランス](../../guides/retry-fault-tolerance) - リトライポリシーガイド
