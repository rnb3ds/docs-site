---
sidebar_label: "パッケージ関数"
title: "パッケージ関数 - CyberGo html | 使い方・パラメータ・サンプル"
description: "CyberGo html パッケージ関数リファレンス：Extract、ExtractText、ExtractToMarkdown、ExtractToJSON などの API 一覧。内部で sync.Pool により Processor を再利用し、単発呼び出しに適した使い方やパラメータ、設定解釈を解説します。"
sidebar_position: 1
---

# パッケージ関数

パッケージレベル関数は一回限りの呼び出しに適しており、内部で `sync.Pool` を使って Processor を再利用するため、ライフサイクルの手動管理が不要です。注：プールされた Processor はキャッシュと監査保持を無効化します。キャッシュ/統計/監査が必要な場合は [html.New](./processor) で専用 Processor を生成してください。

## 内部の仕組み

:::info プール設計
パッケージ関数の裏側では `sync.Pool` が 1 つ維持され、呼び出しごとに `Processor` インスタンスを再利用して再割り当てを避けます。主要な実装の詳細：

- **プール設定はキャッシュ無効**：プール用設定（`poolCfg`）は `DefaultConfig()` をベースにしつつ、キャッシュ関連の 3 フィールドを明示的にゼロにします——`MaxCacheEntries=0`、`CacheTTL=0`、`CacheCleanup=0`。そのため**パッケージ関数はキャッシュを利用できず**、毎回完全な処理が行われます。この設計の理由は、プールされた Processor は返却時に毎回キャッシュをクリアするため、キャッシュを有効にしてもハッシュと map への書き込みコストを無駄に費やすだけでヒットすることはないからです。
- **返却時に状態をリセット**：呼び出し終了時に Processor を返却する前に、順に `ResetStatistics`、`audit.Wait()`、`ClearAuditLog`、`ClearCache` を実行し、呼び出しをまたぐ統計/監査/キャッシュ状態の漏れを防ぎます。
- **クローズ済み Processor は返却しない**：Processor が使用中にクローズされた場合（誤用）、返却ロジックはそれを破棄しプールに戻しません（`sync.Pool` は `Put` の欠落を許容し、次回 `Get` 時に `pool.New` で再構築されます）。
- **panic の安全策**：`pool.New` が panic を起こすのはライブラリの不変条件が破られた場合のみです（`poolCfg` は `DefaultConfig()` から派生するため、構築時点で合法です）。この panic は `getPooledProcessorSafe` で捕捉されて `ErrInternalPanic` にラップされて返され、公開 API に漏れることはありません。
:::

## 設定パラメータの解釈

すべてのパッケージ関数の `cfg ...Config` は任意の可変長引数で、内部の `resolveConfig` で解釈されます：

| 渡された引数 | 動作 | プール経由か |
|----------|------|:----------:|
| なし | `DefaultConfig()` を使用 | はい（`pooled=true`） |
| 1 つ | その `Config` を使用 | **いいえ**（`pooled=false`） |
| 2 つ以上 | `ErrMultipleConfigs` を返す | — |

:::warning 重要な違い
カスタム `Config` を渡した場合**`sync.Pool` を経由しません**——プールには `DefaultConfig()` ベースの Processor しか格納されず、設定の異なるインスタンスを安全に再利用できないためです。この場合は毎回 `New` で一時 Processor を作成し、使い終わったら `Close` します。高頻度呼び出しでカスタム設定を再利用したい場合は、直接 [Processor](./processor) を作成してください。
:::

## コンテンツ抽出

### Extract

HTML バイトからコンテンツを抽出し、完全な `Result` を返します。

```go
func Extract(htmlBytes []byte, cfg ...Config) (*Result, error)
```

**パラメータ**：

| パラメータ | 型 | 説明 |
|------|------|------|
| `htmlBytes` | `[]byte` | HTML コンテンツ |
| `cfg` | `...Config` | オプションの設定、最大 1 つ |

**例**：

```go
result, err := html.Extract(data)
if err != nil {
    log.Fatal(err)
}
fmt.Println(result.Title, result.Text)
```

完全な実行可能サンプル（フィールドアクセスとエラー処理のデモ）：

```go
package main

import (
	"fmt"
	"log"

	"github.com/cybergodev/html"
)

func main() {
	data := []byte(`<html><head><title>サンプルページ</title></head>
<body><h1>ようこそ</h1><p>本文内容<a href="https://example.com">リンク</a>。</p></body></html>`)

	// Config を渡さず、プール経路を使う
	result, err := html.Extract(data)
	if err != nil {
		log.Fatalf("抽出失敗: %v", err)
	}

	fmt.Println("タイトル:", result.Title)
	fmt.Println("単語数:", result.WordCount)
	fmt.Println("リンク数:", len(result.Links))
	// 出力：
	// タイトル: サンプルページ
	// 単語数: 4
	// リンク数: 1
}
```

**エラー戻り値**：`Extract` は [Processor.Extract](./processor#エラー戻り値) と同じエラーを返すほか、以下を返す場合があります：

| エラー | 条件 |
|------|------|
| `ErrMultipleConfigs` | `Config` を 2 つ以上渡した |
| `ErrInvalidConfig`（`*ConfigError` にラップ） | 渡した `Config` の検証失敗（`MaxInputSize<=0` など） |

### ExtractFromFile

HTML ファイルからコンテンツを抽出します。

```go
func ExtractFromFile(filePath string, cfg ...Config) (*Result, error)
```

**エラー戻り値**：`Extract` のエラーに加え、ファイルアクセスで `*FileError` が返る可能性があり、`ErrFileNotFound`、`ErrInvalidFilePath`、またはパス横断の拒否（[セキュリティ保護](../modules/security) の `AllowedBaseDir` 参照）をラップします。

## テキスト抽出

### ExtractText

プレーンテキストコンテンツのみを抽出します。

```go
func ExtractText(htmlBytes []byte, cfg ...Config) (string, error)
```

### ExtractTextFromFile

ファイルからプレーンテキストを抽出します。

```go
func ExtractTextFromFile(filePath string, cfg ...Config) (string, error)
```

## コンテキスト付きバージョン

すべての関数は `context.Context` を受け取るバージョンをサポートしており、キャンセルとタイムアウト制御に使用します：

| 関数 | シグネチャ |
|------|------|
| `ExtractWithContext` | `(ctx context.Context, htmlBytes []byte, cfg ...Config) (*Result, error)` |
| `ExtractFromFileWithContext` | `(ctx context.Context, filePath string, cfg ...Config) (*Result, error)` |
| `ExtractTextWithContext` | `(ctx context.Context, htmlBytes []byte, cfg ...Config) (string, error)` |
| `ExtractTextFromFileWithContext` | `(ctx context.Context, filePath string, cfg ...Config) (string, error)` |

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

result, err := html.ExtractWithContext(ctx, data)
```

## 出力フォーマット

| 関数 | シグネチャ | 説明 |
|------|------|------|
| `ExtractToMarkdown` | `(htmlBytes []byte, cfg ...Config) (string, error)` | HTML → Markdown |
| `ExtractToMarkdownFromFile` | `(filePath string, cfg ...Config) (string, error)` | ファイル → Markdown |
| `ExtractToMarkdownWithContext` | `(ctx context.Context, htmlBytes []byte, cfg ...Config) (string, error)` | コンテキスト付き |
| `ExtractToMarkdownFromFileWithContext` | `(ctx context.Context, filePath string, cfg ...Config) (string, error)` | ファイル + コンテキスト |
| `ExtractToJSON` | `(htmlBytes []byte, cfg ...Config) ([]byte, error)` | HTML → JSON |
| `ExtractToJSONFromFile` | `(filePath string, cfg ...Config) ([]byte, error)` | ファイル → JSON |
| `ExtractToJSONWithContext` | `(ctx context.Context, htmlBytes []byte, cfg ...Config) ([]byte, error)` | コンテキスト付き |
| `ExtractToJSONFromFileWithContext` | `(ctx context.Context, filePath string, cfg ...Config) ([]byte, error)` | ファイル + コンテキスト |

詳細な使い方と例は [出力フォーマット](../modules/output) を参照してください。

## リンク抽出

| 関数 | シグネチャ | 説明 |
|------|------|------|
| `ExtractAllLinks` | `(htmlBytes []byte, cfg ...Config) ([]LinkResource, error)` | すべてのリンクを抽出 |
| `ExtractAllLinksFromFile` | `(filePath string, cfg ...Config) ([]LinkResource, error)` | ファイルからリンクを抽出 |
| `ExtractAllLinksWithContext` | `(ctx context.Context, htmlBytes []byte, cfg ...Config) ([]LinkResource, error)` | コンテキスト付き |
| `ExtractAllLinksFromFileWithContext` | `(ctx context.Context, filePath string, cfg ...Config) ([]LinkResource, error)` | ファイル + コンテキスト |

詳細な使い方と例は [リンク抽出](../modules/links) を参照してください。

## バッチ処理

| 関数 | シグネチャ | 説明 |
|------|------|------|
| `ExtractBatch` | `(htmlContents [][]byte, cfg ...Config) *BatchResult` | バッチ抽出 |
| `ExtractBatchWithContext` | `(ctx context.Context, htmlContents [][]byte, cfg ...Config) *BatchResult` | コンテキスト付き |
| `ExtractBatchFiles` | `(filePaths []string, cfg ...Config) *BatchResult` | バッチファイル抽出 |
| `ExtractBatchFilesWithContext` | `(ctx context.Context, filePaths []string, cfg ...Config) *BatchResult` | ファイル + コンテキスト |

詳細な使い方と例は [バッチ処理](../modules/batch) を参照してください。

## パッケージ関数 vs Processor

どちらも裏側では `Processor` を呼び出しますが、リソース再利用と状態保持で明確な違いがあります：

| 次元 | パッケージ関数 | [Processor](./processor) |
|------|--------|--------------------------|
| キャッシュ | **なし**（プール設定 `MaxCacheEntries=0`） | あり（ヒット時はディープコピーを返す） |
| 統計 | 毎回リセット（返却時 `ResetStatistics`） | 累積、いつでも `GetStatistics` 可能 |
| 監査ログ | 毎回クリア（返却時 `ClearAuditLog`） | 累積、`GetAuditLog` で照会可能 |
| カスタム `Config` | 毎回一時 Processor を生成+破棄 | 同一インスタンスを再利用 |
| ライフサイクル | 自動管理（プール/一時インスタンス） | 手動で `defer Close()` が必要 |
| 適用シーン | 一回限りの呼び出し、スクリプト、低頻度リクエスト | 高頻度呼び出し、長稼働サービス、キャッシュ必要 |

:::tip 選択の指針
単発の抽出や偶発的な呼び出しにはパッケージ関数が最も手軽です。ループ、HTTP handler、バッチ処理で繰り返し抽出するなら、長ライフサイクルの `Processor` を作って再利用すると、キャッシュにより大幅にコストを下げられます。
:::
