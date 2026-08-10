---
sidebar_label: "定数とエラー"
title: "定数とエラー - CyberGo html | 既定値とエラー型"
description: "CyberGo html 定数とエラー型リファレンス：既定値定数、センチネルエラー、InputError・ConfigError・FileError の構造化エラーで errors.Is/As 判定をサポートし、監査イベントタイプやデフォルト値の一覧も提供します。"
sidebar_position: 3
---

# 定数とエラー

## デフォルト設定定数

| 定数 | 型 | 値 | 説明 |
|------|------|----|------|
| `DefaultMaxInputSize` | `int` | `52428800` | 最大入力サイズ (50MB) |
| `DefaultMaxCacheEntries` | `int` | `2000` | キャッシュ最大エントリ |
| `DefaultWorkerPoolSize` | `int` | `4` | ワーカープールサイズ |
| `DefaultCacheTTL` | `time.Duration` | `1h` | キャッシュ有効期限 |
| `DefaultCacheCleanup` | `time.Duration` | `5m` | キャッシュクリーンアップ間隔 |
| `DefaultMaxDepth` | `int` | `500` | 最大 DOM 深度 |
| `DefaultProcessingTimeout` | `time.Duration` | `30s` | 処理タイムアウト時間 |

## 監査定数

### 監査イベントタイプ

| 定数 | 値 | 説明 |
|------|------|------|
| `AuditEventBlockedTag` | `"blocked_tag"` | ブロックされたタグ |
| `AuditEventBlockedAttr` | `"blocked_attr"` | ブロックされた属性 |
| `AuditEventBlockedURL` | `"blocked_url"` | ブロックされた URL |
| `AuditEventInputViolation` | `"input_violation"` | 入力違反 |
| `AuditEventDepthViolation` | `"depth_violation"` | 深度違反 |
| `AuditEventTimeout` | `"timeout"` | 処理タイムアウト |
| `AuditEventEncodingIssue` | `"encoding_issue"` | エンコーディングの問題 |
| `AuditEventPathTraversal` | `"path_traversal"` | パストラバーサルの試行 |

### 監査レベル

| 定数 | 型 | 値 | 説明 |
|------|------|------|------|
| `AuditLevelInfo` | `AuditLevel` | `"info"` | 情報レベル |
| `AuditLevelWarning` | `AuditLevel` | `"warning"` | 警告レベル |
| `AuditLevelCritical` | `AuditLevel` | `"critical"` | 重大レベル |

:::info
監査システムの詳細な使い方と Sink タイプは [監査システム](../modules/audit) を参照してください。
:::

## センチネルエラー

| エラー | メッセージ | 説明 |
|------|------|------|
| `ErrInputTooLarge` | `html: input size exceeds maximum` | 入力がサイズ制限を超過 |
| `ErrInvalidHTML` | `html: invalid HTML` | 無効な HTML コンテンツ |
| `ErrProcessorClosed` | `html: processor closed` | プロセッサがクローズ済み |
| `ErrMaxDepthExceeded` | `html: max depth exceeded` | 最大深度を超過 |
| `ErrInvalidConfig` | `html: invalid config` | 無効な設定 |
| `ErrProcessingTimeout` | `html: processing timeout exceeded` | 処理タイムアウト |
| `ErrFileNotFound` | `html: file not found` | ファイルが見つからない |
| `ErrInvalidFilePath` | `html: invalid file path` | 無効なファイルパス |
| `ErrInternalPanic` | `html: internal panic recovered` | 内部パニックからリカバリ |
| `ErrMultipleConfigs` | `html: at most one Config may be provided` | Config は最大 1 つまで |

## エラータイプ

### InputError

入力関連エラー。サイズ情報を含みます。

```go
type InputError struct {
    Op       string // 操作名
    Size     int    // 実際のサイズ
    MaxSize  int    // 最大制限
    InputErr error  // 元のエラー
}

func (e *InputError) Error() string
func (e *InputError) Unwrap() error // → InputErr（非 nil の場合）または ErrInputTooLarge
```

### ConfigError

設定検証エラー。フィールド情報を含みます。

```go
type ConfigError struct {
    Field   string // フィールド名
    Value   any    // 無効な値
    Message string // エラーの説明
}

func (e *ConfigError) Error() string
func (e *ConfigError) Unwrap() error // → ErrInvalidConfig
```

### FileError

ファイル操作エラー。パスを自動的に切り詰めて漏洩を防止します。

```go
type FileError struct {
    Op      string // 操作名
    Path    string // ファイルパス
    FileErr error  // 元のエラー
}

func (e *FileError) Error() string        // 安全な出力（パスを切り詰め）
func (e *FileError) SafePath() string     // ファイル名のみ返す
func (e *FileError) Unwrap() error        // → ErrFileNotFound | 元のエラー | ErrInvalidFilePath
func (e *FileError) MarshalJSON() ([]byte, error) // JSON シリアライズ時にもパスを切り詰める (API レスポンスでの漏洩を防止)
```

:::tip 安全なパス
`FileError.Error()` と `SafePath()` はどちらも切り詰められた安全なパス（ファイル名のみ）を返し、パスの漏洩を防止します。デバッグ時に完全なパスが必要な場合は `Path` フィールドに直接アクセスできます。
:::

## 内部制限定数

以下の定数はライブラリの実行時ハード上限を定義します。これらは**非エクスポート**（小文字始まり）で直接参照できませんが、実行時の動作に影響します——これらの値を理解すると、ライブラリの境界条件とエラーシナリオの把握に役立ちます。

### 設定上限

| 定数 | 値 | 説明 |
|------|----|------|
| `maxConfigInputSize` | `52428800` (50MB) | `MaxInputSize` の設定上限；より大きな値を設定しても `Validate()` で拒否されます |
| `maxConfigWorkerSize` | `256` | `WorkerPoolSize` の設定上限 |
| `maxConfigDepth` | `500` | `MaxDepth` の設定上限 |
| `maxConfigCacheEntries` | `100000` | `MaxCacheEntries` の設定上限（≈100MB、エントリ 1KB で試算） |

### 処理制限

| 定数 | 値 | 説明 |
|------|----|------|
| `maxBatchSize` | `10000` | 1 回のバッチ最大項目数；超過するとバッチ全体がエラーを返します（panic ではない） |
| `maxTimeoutGoroutines` | `1000` | グローバルな並行タイムアウト goroutine の上限；超過すると新規リクエストは直接 `ErrProcessingTimeout` を返します |
| `maxHTMLForRegex` | `1000000` (1MB) | メディア URL 正規表現スキャン対象の HTML サイズ上限；この値を超えると正規表現のフォールバックをスキップします（ReDoS 防御） |
| `maxRegexMatches` | `1000` | 1 回の正規表現スキャンの最大マッチ数；メディア密集体での過剰割り当てを防止します |

### キャッシュキー生成

| 定数 | 値 | 説明 |
|------|----|------|
| `maxCacheKeySize` | `65536` (64KB) | 完全ハッシュ対象のコンテンツサイズ閾値；この値を超えると 5 点サンプリングに切り替えます |
| `cacheKeySample` | `4096` | 大規模ドキュメントのサンプリング総バイト予算（5 点 × ~820 バイト/点） |

:::tip なぜこれらを知る必要があるのか
これらの定数はいくつかの「なぜ」を説明します：なぜ 1MB を超える HTML では素の動画リンクが抽出されないのか（ReDoS 防護）、なぜバッチが 10000 項目を超えると全体が失敗するのか（OOM 防護）、なぜ 64KB がキャッシュキー戦略の境界線なのか（ハッシュコスト vs 衝突リスク）。
:::

## エラー処理パターン

```go
result, err := html.Extract(data)
if err != nil {
    var inputErr *html.InputError
    var configErr *html.ConfigError
    var fileErr *html.FileError

    switch {
    case errors.Is(err, html.ErrInputTooLarge):
        // 入力が大きすぎる
    case errors.Is(err, html.ErrInvalidHTML):
        // 無効な HTML
    case errors.Is(err, html.ErrFileNotFound):
        // ファイルが存在しない
    case errors.As(err, &inputErr):
        fmt.Printf("サイズ %d が制限 %d を超過\n", inputErr.Size, inputErr.MaxSize)
    case errors.As(err, &configErr):
        fmt.Printf("設定フィールド %s が無効: %s\n", configErr.Field, configErr.Message)
    case errors.As(err, &fileErr):
        fmt.Printf("ファイル: %s\n", fileErr.SafePath())
    }
}
```
