---
sidebar_label: "セキュリティ保護"
title: "セキュリティ保護 - CyberGo html | 多層セキュリティ API リファレンス"
description: "CyberGo html セキュリティ API：コンテンツサニタイズ、入力制限、DOM 深度、パストラバーサル防御と AllowedBaseDir サンドボックス、HighSecurityConfig プリセット、セキュリティエラー型を提供します。"
sidebar_position: 5
---

# セキュリティ保護

HTML ライブラリは多層セキュリティ保護メカニズムを内蔵しています。すべての設定は [Config](../core/config) のセキュリティフィールドに集約されています。このページはセキュリティ関連 API を扱います。セキュリティの概念紹介は [セキュリティ概要](../../guides/security/) を参照してください。

## セキュリティ設定フィールド

| フィールド | 型 | デフォルト | セキュリティの役割 |
|-----------|-----|-----------|-------------------|
| `EnableSanitization` | `bool` | `true` | コンテンツサニタイズ：危険タグ、イベント属性、悪意のあるプロトコルを削除 |
| `MaxInputSize` | `int` | `52428800` (50MB) | 入力サイズ制限、メモリ枯渇を防止 |
| `MaxDepth` | `int` | `500` | DOM ネスト深度制限、再帰爆弾を防止 |
| `ProcessingTimeout` | `time.Duration` | `30s` | ドキュメントごとの処理タイムアウト、無限処理を防止 |
| `AllowedBaseDir` | `string` | `""` | ファイル操作ディレクトリサンドボックス、パストラバーサルを防止 |
| `Audit` | `AuditConfig` | `DefaultAuditConfig()` | セキュリティ監査設定（詳細は [監査システム](./audit)） |

:::warning 警告
`EnableSanitization` はデフォルトで有効です。**完全に信頼できる入力に対してのみ**無効化してください。無効化すると HTML がそのまま解析され、XSS リスクが生じる可能性があります。
:::

## コンテンツサニタイズ

有効時（デフォルト）、以下のクリーンアップが自動実行されます:

| 保護レイヤー | 動作 |
|-------------|------|
| 危険タグ | `<script>`、`<style>`、`<iframe>`、`<object>`、`<embed>` などを削除 |
| イベント属性 | すべての `on*` 属性を削除（`onclick`、`onerror` など） |
| 危険プロトコル | `javascript:`、`vbscript:` をブロック |
| Data URL | `data:image/*`、`data:font/*`、`data:application/pdf` のみ許可 |

ブロックされたコンテンツは監査システムを通じて記録されます（監査の有効化が必要）。

## パスセキュリティ

### AllowedBaseDir サンドボックス

ファイル操作（`ExtractFromFile` など）を指定ディレクトリとそのサブディレクトリに制限します:

```go
cfg := html.DefaultConfig()
cfg.AllowedBaseDir = "/var/www/html"

p, err := html.New(cfg)
if err != nil {
    log.Fatal(err)
}
defer p.Close()

// ✅ 許可: ディレクトリ内のファイル
result, err := p.ExtractFromFile("/var/www/html/page.html")

// ❌ 拒否: ディレクトリ外のファイル
_, err = p.ExtractFromFile("/etc/passwd")
```

設定後、ファイルパスは `AllowedBaseDir` 内部にある必要があります。クロスプラットフォームサポート:

- **Unix**: シンボリックリンクを解決、リンク経由の脱出を防止
- **Windows**: junction とシンボリックリンクを解決

空（デフォルト）は制限なし — 信頼できる入力シナリオに適しています。

### パストラバーサル検出

パストラバーサルの試み（例: `../../../etc/passwd`）を自動的に検出してブロックし、`*FileError` でラップされたエラーを返します:

```go
_, err := html.ExtractFromFile("../../../etc/passwd")
// err に "path traversal detected" 情報が含まれます
```

### FileError.SafePath

ファイルエラーはパス情報を自動的にマスキングし、ファイルシステム構造の漏洩を防止します:

```go
type FileError struct {
    Op      string
    Path    string
    FileErr error
}

func (e *FileError) Error() string        // 切り詰められたパスを出力（ファイル名のみ）
func (e *FileError) SafePath() string     // ファイル名のみ返す
func (e *FileError) MarshalJSON() ([]byte, error) // JSON シリアライズ時に自動マスキング
```

```go
_, err := html.ExtractFromFile("/var/www/secret/config.html")
if err != nil {
    var fileErr *html.FileError
    if errors.As(err, &fileErr) {
        fmt.Println(fileErr.SafePath()) // 出力: config.html（パスなし）
    }
}
```

:::tip
`FileError.Error()` と `SafePath()` はどちらも切り詰められた安全なパス（ファイル名のみ）を返し、パス漏洩を防止します。内部デバッグ時は `Path` フィールドに直接アクセスしてください。
:::

## セキュリティプリセット

### HighSecurityConfig

高セキュリティ環境向けのプリセット設定。すべての制限を強化し、包括的な監査を有効化します:

```go
func HighSecurityConfig() Config
```

`DefaultConfig()` と比較したセキュリティフィールドの上書き:

| フィールド | デフォルト | 高セキュリティ |
|-----------|-----------|---------------|
| `MaxInputSize` | `52428800` (50MB) | `10485760` (10MB) |
| `MaxDepth` | `500` | `100` |
| `ProcessingTimeout` | `30s` | `10s` |
| `WorkerPoolSize` | `4` | `2` |
| `Audit` | `DefaultAuditConfig()` | `HighSecurityAuditConfig()` |

```go
cfg := html.HighSecurityConfig()
p, err := html.New(cfg)
if err != nil {
    log.Fatal(err)
}
defer p.Close()
```

## セキュリティ関連エラー

| エラー | トリガー条件 |
|--------|-------------|
| `ErrInputTooLarge` | 入力が `MaxInputSize` を超過 |
| `ErrMaxDepthExceeded` | DOM 深度が `MaxDepth` を超過 |
| `ErrProcessingTimeout` | 処理が `ProcessingTimeout` を超過 |
| `ErrInvalidFilePath` | ファイルパス検証失敗（パストラバーサル含む） |
| `ErrInternalPanic` | 内部パニックがリカバリされた |

:::info
完全なエラー型定義（`InputError`、`ConfigError`、`FileError`）と `errors.Is`/`errors.As` の使い方は [定数とエラー](../types/constants) を参照してください。
:::

## パニックリカバリ

すべての抽出操作にパニックリカバリメカニズムが内蔵されています。処理中に予期しないパニックが発生しても、サービスをクラッシュさせず `ErrInternalPanic` を返します:

```go
result, err := html.Extract(maliciousData)
if err != nil {
    if errors.Is(err, html.ErrInternalPanic) {
        // 入力が内部バグをトリガーした可能性
        log.Printf("panic recovered: %v", err)
    }
}
```

## 関連ドキュメント

- [セキュリティ概要](../../guides/security/) — セキュリティの概念紹介とベストプラクティス
- [監査システム](./audit) — 監査パイプライン、イベントタイプ、Sink
- [設定](../core/config) — 完全な Config フィールドリファレンス
- [定数とエラー](../types/constants) — センチネルエラーとエラー型
- [本番チェックリスト](../../guides/security/production-checklist) — リリース前セキュリティチェック
