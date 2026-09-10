---
sidebar_label: "定数とエラー"
title: "定数とエラー - CyberGo JSON | API リファレンス"
description: "CyberGo JSON の定数とエラー：DefaultMaxJSONSize、DefaultMaxNestingDepth の制限、ErrPathNotFound などのエラー変数と MergeMode マージモード、JsonsError 構造体や発生シナリオ、定数の既定値一覧を網羅し Go 設定を支えます。"
sidebar_position: 7
---

# 定数とエラー

## エラー変数

### 主要なエラー

```go
var (
    // 基本エラー
    ErrInvalidJSON     = errors.New("invalid JSON format")
    ErrPathNotFound    = errors.New("path not found")
    ErrTypeMismatch    = errors.New("type mismatch")
    ErrInvalidPath     = errors.New("invalid path format")
    ErrProcessorClosed = errors.New("processor is closed")

    // 制限エラー
    ErrSizeLimit        = errors.New("size limit exceeded")
    ErrDepthLimit       = errors.New("depth limit exceeded")
    ErrConcurrencyLimit = errors.New("concurrency limit exceeded") // 管理された操作（Get/Set/Delete など）が MaxConcurrency に達したときに返される

    // セキュリティと検証エラー
    ErrSecurityViolation = errors.New("security violation detected")
    ErrUnsupportedPath   = errors.New("unsupported path operation")

    // リソースとパフォーマンスエラー（いずれも Deprecated：現時点でどの操作からも返されず、将来の使用のために保留）
    ErrOperationTimeout  = errors.New("operation timeout")
    ErrResourceExhausted = errors.New("system resources exhausted")
)
```

### トリガーシナリオ早見表

各センチネルエラーの典型的なトリガーシナリオ。エラーブランチごとにリカバリーロジックを書きやすくします：

| エラー | 典型的なトリガーシナリオ | 推奨される対処 |
|------|--------------|----------|
| `ErrInvalidJSON` | 入力が正当な JSON でない（余分な文字、未クローズなど） | 入力を拒否し、出所を確認 |
| `ErrPathNotFound` | `Get` のパスがデータ中に存在しない | ビジネス上よくある。デフォルト値でフォールバック |
| `ErrTypeMismatch` | パスは存在するが型が合わない（文字列パスへの `[0]` など） | データ構造の想定を確認 |
| `ErrInvalidPath` | パス構文エラー（`CompilePath` / パス解析の失敗） | パス式を修正 |
| `ErrProcessorClosed` | `Close()` 後（またはクローズ中）にメソッドを呼び続けた | ライフサイクルを確認、`IsClosed` で事前判定 |
| `ErrSizeLimit` | 入力が `MaxJSONSize` / `MaxSecurityValidationSize` を超過 | 制限を引き上げるか超大入力を拒否 |
| `ErrDepthLimit` | ネストが `MaxNestingDepthSecurity` を超過 | 深いネスト入力を拒否（攻撃の可能性） |
| `ErrConcurrencyLimit` | 管理された操作の並行数が `MaxConcurrency` を超過 | 並行度を下げるか制限を引き上げ |
| `ErrSecurityViolation` | 危険パターンにヒット、`MaxObjectKeys`/`MaxArrayElements` 超過 | 監査ログを記録して拒否 |
| `ErrUnsupportedPath` | 現在のデータ形態がそのパスセグメントをサポートしない（非配列へのスライスなど） | データ構造の想定を確認 |
| `ErrOperationTimeout` | 予約済み。現時点で返す操作なし（Deprecated） | エラーブランチでの処理は不要 |
| `ErrResourceExhausted` | 予約済み。現時点で返す操作なし（Deprecated） | エラーブランチでの処理は不要 |

::: tip 2 つの Deprecated センチネル
`ErrOperationTimeout` と `ErrResourceExhausted` は現時点で**それらを返す操作はなく**、将来のバージョンのために保留されているだけです——エラーブランチで処理する必要はありません。
:::

### エラーチェック

`errors.Is` でエラー型をチェックします：

```go
val, err := json.Get(data, "user.name")
if err != nil {
    if errors.Is(err, json.ErrPathNotFound) {
        // パスが存在しない
        fmt.Println("パスが見つかりません")
    } else if errors.Is(err, json.ErrTypeMismatch) {
        // 型が一致しない
        fmt.Println("型が一致しません")
    } else if errors.Is(err, json.ErrInvalidJSON) {
        // JSON フォーマットエラー
        fmt.Println("無効な JSON")
    }
}
```

## JsonsError 型

### 構造定義

```go
type JsonsError struct {
    Op      string `json:"op"`      // 操作名
    Path    string `json:"path"`    // エラーが発生したパス
    Message string `json:"message"` // 人間が読めるエラーメッセージ
    Err     error  `json:"err"`     // 基底エラー
}
```

**フィールドの説明**

| フィールド | 型 | 説明 |
|------|------|------|
| `Op` | `string` | 失敗した操作の名前 |
| `Path` | `string` | エラーが発生した JSON パス |
| `Message` | `string` | 人間が読めるエラーメッセージ |
| `Err` | `error` | 基底エラー（`nil` の場合あり）。`Unwrap` 経由で `errors.Is` / `errors.As` のチェーン遡りをサポート |

### メソッド

```go
func (e *JsonsError) Error() string   // "JSON <op> failed at path '<path>': <msg> (caused by: ...)"
func (e *JsonsError) Unwrap() error   // 基底エラーを返す（errors.As/Is チェーンをサポート）
func (e *JsonsError) Is(target error) bool
```

`Is` のマッチングルール：

- ターゲットが `*JsonsError` の場合、`Op`、`Path`、`Err` の 3 フィールドを個別に比較（`Message` は派生情報のため、比較から**意図的に除外**）
- ターゲットが他のエラー（センチネルエラーなど）の場合、基底の `Err` への `errors.Is` に退化——そのため `errors.Is(err, json.ErrPathNotFound)` はラップされた `JsonsError` に対しても成立します

### 使用例

```go
val, err := json.Get(data, "complex.path[0]")
if err != nil {
    var jsonErr *json.JsonsError
    if errors.As(err, &jsonErr) {
        fmt.Printf("操作: %s\n", jsonErr.Op)
        fmt.Printf("パス: %s\n", jsonErr.Path)
        fmt.Printf("メッセージ: %s\n", jsonErr.Message)
        if jsonErr.Err != nil {
            fmt.Printf("原因: %v\n", jsonErr.Err)
        }
    }
}
```

## エラー補助関数

上記のエラー型に加え、ライブラリは 2 つのエラー処理補助関数を提供します（完全な説明は[補助ツール](./helpers#safeerror)を参照）：

| 関数 | シグネチャ | 説明 |
|------|------|------|
| `SafeError` | `func SafeError(err error) string` | クライアントに対して安全なエラーメッセージを返す。パス名などの内部詳細を省略（CWE-209） |
| `RedactedPath` | `func RedactedPath(path string) string` | マスク済みパスを返す（空でないパスは `"***"` にマスク）。ログとエラーレスポンスに使用 |

## 設定プリセット

### デフォルト値定数

```go
const (
    // サイズ制限
    DefaultMaxJSONSize     = 100 * 1024 * 1024  // 100MB
    DefaultMaxNestingDepth = 200
    DefaultMaxPathDepth    = 50
    DefaultMaxDepth        = 100                 // エンコード・デコードのデフォルトネスト深度（Config.MaxDepth）
    DefaultMaxConcurrency  = 50

    // セキュリティ制限
    DefaultMaxSecuritySize   = 10 * 1024 * 1024  // 10MB
    DefaultMaxObjectKeys     = 100000
    DefaultMaxArrayElements  = 100000
    DefaultMaxBatchSize      = 2000
    DefaultParallelThreshold = 10

    // キャッシュ
    DefaultCacheTTL = 5 * time.Minute
)
```

### 定数と Config フィールドの対照

| 定数 | デフォルト値 | 対応する Config フィールド | 説明 |
|------|--------|------------------|------|
| `DefaultMaxJSONSize` | 100MB | `MaxJSONSize` | 単一 JSON 入力のサイズ上限 |
| `DefaultMaxNestingDepth` | 200 | `MaxNestingDepthSecurity` | JSON ネスト深度上限 |
| `DefaultMaxPathDepth` | 50 | `MaxPathDepth` | パスセグメント数上限（`a.b.c.d...` の階層数など） |
| `DefaultMaxDepth` | 100 | `MaxDepth` | エンコード・デコード（Marshal/Unmarshal）のデフォルトネスト深度 |
| `DefaultMaxConcurrency` | 50 | `MaxConcurrency` | 並行操作数上限 |
| `DefaultMaxSecuritySize` | 10MB | `MaxSecurityValidationSize` | このサイズを超えるドキュメントはサンプリング式セキュリティチェックに切替 |
| `DefaultMaxObjectKeys` | 100000 | `MaxObjectKeys` | オブジェクトキー数上限 |
| `DefaultMaxArrayElements` | 100000 | `MaxArrayElements` | 配列要素数上限 |
| `DefaultMaxBatchSize` | 2000 | `MaxBatchSize` | 単一 `ProcessBatch` の操作数上限。超過すると `ErrSizeLimit` を返す |
| `DefaultParallelThreshold` | 10 | `ParallelThreshold` | 並列処理しきい値：操作数がこの値未満の場合は逐次処理を使用 |
| `DefaultCacheTTL` | 5 分 | `CacheTTL` | キャッシュエントリの生存時間 |

## 設定プリセット関数

### DefaultConfig

シグネチャ：`func DefaultConfig() Config`

デフォルト設定を返します。

```go
cfg := json.DefaultConfig()
processor, err := json.New(cfg)
if err != nil {
    panic(err)
}
defer processor.Close()
```

### SecurityConfig

シグネチャ：`func SecurityConfig() Config`

セキュリティ設定を返します。信頼できない入力の処理に適しています。

```go
// 以下に推奨：
// - パブリック API と Web サービス
// - ユーザーが送信したデータ
// - 外部 Webhook
// - 認証エンドポイント
// - 金融データ処理
cfg := json.SecurityConfig()
processor, err := json.New(cfg)
if err != nil {
    panic(err)
}
defer processor.Close()
```

**セキュリティ設定の特徴**：

- 完全セキュリティスキャン
- 厳格モード
- 控えめな制限値
- キャッシュを有効化

### PrettyConfig

シグネチャ：`func PrettyConfig() Config`

整形出力設定を返します。

```go
result, err := json.EncodeWithConfig(data, json.PrettyConfig())
```

## マージモード定数

```go
// MergeMode はマージモード型（internal パッケージからエクスポート）
type MergeMode = internal.MergeMode

const (
    // MergeUnion - ユニオンマージ（デフォルト）
    // オブジェクト：すべてのキーをマージ、競合値は上書き値を採用
    // 配列：すべての要素をマージして重複排除
    MergeUnion = internal.MergeUnion

    // MergeIntersection - 積集合マージ
    // オブジェクト：共通キーのみ保持
    // 配列：共通要素のみ保持
    MergeIntersection = internal.MergeIntersection

    // MergeDifference - 差集合マージ
    // オブジェクト：ベースに存在し上書き側に存在しないキーのみ保持
    // 配列：ベースに存在し上書き側に存在しない要素のみ保持
    MergeDifference = internal.MergeDifference
)
```

## パスセグメント型

`PathSegment` は `internal` パッケージからエクスポートされたパスセグメント型で、解析後のパス構成要素を表します。

```go
type PathSegment = internal.PathSegment
```

::: warning 内部実装の型エイリアス
`PathSegment` は `internal.PathSegment` の型エイリアスです。その具体的なフィールド、フィールド型（PathSegmentType、PathSegmentFlags など）、メソッドは `internal` パッケージに属し、**公開 API としてエクスポートされていません**。バージョンとともに変化する可能性があるため、業務コードで内部構造に直接依存しないでください。

- カスタムパス構文を実装する際は、[`PathParser`](./interfaces#pathparser) インターフェースの `ParsePath` メソッドで `[]PathSegment` を返します。
- パスのプリコンパイルには [`Processor.CompilePath`](./processor/query#compilepath) を使用し、`*CompiledPath` を受け取ります。
:::

## セキュリティモードレベル

```go
type PatternLevel int

const (
    // PatternLevelCritical - 重大リスク。常に操作を阻止
    PatternLevelCritical PatternLevel = iota

    // PatternLevelWarning - 警告レベル。厳格モードでは阻止
    PatternLevelWarning

    // PatternLevelInfo - 情報レベル。ログ記録のみ
    PatternLevelInfo
)
```

### DangerousPattern 構造体

```go
type DangerousPattern struct {
    Pattern string       // 検出する部分文字列
    Name    string       // 人間が読めるセキュリティリスクの説明
    Level   PatternLevel // 処理レベル
}
```

## エラー処理ベストプラクティス

### errors.Is で型をチェック

```go
result, err := json.Get(data, path)
if errors.Is(err, json.ErrPathNotFound) {
    return defaultValue
}
if errors.Is(err, json.ErrTypeMismatch) {
    return defaultValue
}
```

### errors.As で詳細を取得

```go
var jsonErr *json.JsonsError
if errors.As(err, &jsonErr) {
    log.Printf("操作 %s がパス %s で失敗: %s",
        jsonErr.Op, jsonErr.Path, jsonErr.Message)
}
```

### エラーラップ

```go
val := json.GetString(data, path)
if val == "" {
    return fmt.Errorf("設定 %s の取得で空の値が返されました", path)
}
```

## 関連

- [エラー処理](../advanced/error-handling) - 高度なエラー処理ガイド
- [Config](./config) - 設定オプション
- [セキュリティ概要](../security/) - セキュリティベストプラクティス
