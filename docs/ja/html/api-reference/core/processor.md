---
sidebar_label: "Processor"
title: "Processor - CyberGo html | 使い方・パラメータ・サンプル"
description: "CyberGo html Processor API リファレンス：New による生成、Extract メソッド群と GetStatistics、ClearCache、Close などのライフサイクル管理で、キャッシュと内部リソースを再利用し高頻度呼び出しに適しています。"
sidebar_position: 2
---

# Processor

`Processor` は HTML ライブラリのコア処理エンジンです。パッケージ関数と比較して、Processor は内部リソース（キャッシュ、エンコーディング検出器）を再利用し、高頻度の呼び出しに適しています。

## 作成

### New

Processor インスタンスを作成します。オプションで設定を渡せます。

```go
func New(cfg ...Config) (*Processor, error)
```

**パラメータ**：最大 1 つの `Config`。未指定時は `DefaultConfig()` が使用されます。

```go
p, err := html.New(html.DefaultConfig())
if err != nil {
    log.Fatal(err)
}
defer p.Close()
```

**内部の初期化**：

`New` は単なる代入ではなく、以下のステップを実行して返された Processor が即座に使えるようにします：

1. **設定の検証**：`Config.Validate()` を呼び出し、無効な設定なら `*ConfigError` を返します（`errors.Is(err, ErrInvalidConfig)` が真）。検証範囲には数値の境界（`MaxInputSize`、`MaxCacheEntries`、`WorkerPoolSize`、`MaxDepth` が負や上限超過でないか）とフォーマット文字列（`InlineImageFormat`/`InlineLinkFormat`/`TableFormat` の値が合法か）を含みます。
2. **Scorer の設定**：カスタム `Scorer` が設定されていれば `scorerAdapter` で内部インターフェースに適合させ、そうでなければ `SharedDefaultScorer`（読み取り専用、並行安全）を使います。
3. **フォーマット文字列の事前計算**：`InlineImageFormat`/`InlineLinkFormat` を正規化（小文字化+空白削除、空文字列は `"none"` にマッピング）して `imageFormat`/`linkFormat` フィールドにキャッシュし、ホットパスでの `strings.ToLower` の繰り返しを避けます。
4. **キャッシュクリーンアップの起動**：`CacheTTL>0` **かつ** `CacheCleanup>0` の場合にのみバックグラウンドクリーンアップ goroutine を起動し、どちらかが 0 なら起動しません。

## 並行安全性

:::tip 並行利用
`Processor` は複数の goroutine 間で安全に共有でき、追加のロックは不要です。並行性の保証は以下から：

- **設定の不変性**：`config` は `New()` 後に不変です（`*Config` ポインタは再代入も変更もされません）。そのため `ExtractToMarkdown` などのフォーマットメソッドは、ロックなしで安全に値コピーを行い一時 Processor を生成できます——フォーマットの上書きが共有設定に書き戻されることはありません。
- **統計カウンタ**：`TotalProcessed`/`CacheHits`/`CacheMisses`/`ErrorCount`/`totalProcessTime` はすべて `atomic` 操作を使います。
- **キャッシュ**：内部 `Cache` が独自のロックを持ち、読み書きともに安全です。
- **Scorer**：組み込みの `DefaultScorer` は読み取り専用です。**カスタム `Scorer` は自前で並行安全を保証する必要があります**（内部でロックを持つなど）。1 つの Processor が並行 `Extract` を行うと、複数の goroutine からその `Score`/`ShouldRemove` が呼ばれるためです。
:::

## コンテンツ抽出

### エラー戻り値

`Extract` メソッド群は処理の各段階で明確なセンチネルエラーを返し、`errors.Is` で正確に判定できます：

| エラー | トリガ条件 | 備考 |
|------|----------|------|
| `ErrProcessorClosed` | `p` が `nil` または既に `Close` 済み | すべてのメソッドに共通 |
| `ErrInputTooLarge` | 入力バイト数が `MaxInputSize` を超過 | `*InputError` にラップ、実際のサイズ/上限を含む |
| エンコーディング検出エラー | エンコーディング検出または UTF-8 変換の失敗 | 元のエラーがラップされる |
| `ErrInvalidHTML` | バイトが HTML として解析できない | 底層の解析エラーも合わせてラップ |
| `ErrMaxDepthExceeded` | 要素のネスト深度が `MaxDepth` を超過 | 反復式の検証でスタックオーバーフローを防止 |
| `ErrProcessingTimeout` | 処理時間が `ProcessingTimeout` を超過 | `ProcessingTimeout=0` は時間無制限を意味 |
| `ErrInternalPanic` | 内部の予期しない panic がリカバリされた | 最後の砦の保護で、通常使用では出現しないはず |

`context` 付きの版はさらに `context.Canceled`（ユーザーキャンセル）や `context.DeadlineExceeded`（コンテキストのタイムアウト、`ErrProcessingTimeout` に正規化済み）を返すことがあります。

### Extract

```go
func (p *Processor) Extract(htmlBytes []byte) (*Result, error)
```

HTML バイトからコンテンツを抽出し、エンコーディングを自動検出します。

### ExtractFromFile

```go
func (p *Processor) ExtractFromFile(filePath string) (*Result, error)
```

ファイルからコンテンツを抽出します。

### ExtractText

```go
func (p *Processor) ExtractText(htmlBytes []byte) (string, error)
```

プレーンテキストのみを返します。

### ExtractTextFromFile

```go
func (p *Processor) ExtractTextFromFile(filePath string) (string, error)
```

ファイルからプレーンテキストを抽出します。

## コンテキスト付きバージョン

すべての抽出メソッドには `ExtractWithContext` 付きのバージョンがあります：

```go
func (p *Processor) ExtractWithContext(ctx context.Context, htmlBytes []byte) (*Result, error)
func (p *Processor) ExtractFromFileWithContext(ctx context.Context, filePath string) (*Result, error)
func (p *Processor) ExtractTextWithContext(ctx context.Context, htmlBytes []byte) (string, error)
func (p *Processor) ExtractTextFromFileWithContext(ctx context.Context, filePath string) (string, error)
```

## 出力フォーマット

```go
func (p *Processor) ExtractToMarkdown(htmlBytes []byte) (string, error)
func (p *Processor) ExtractToMarkdownFromFile(filePath string) (string, error)
func (p *Processor) ExtractToJSON(htmlBytes []byte) ([]byte, error)
func (p *Processor) ExtractToJSONFromFile(filePath string) ([]byte, error)
```

コンテキスト付きバージョン：

```go
func (p *Processor) ExtractToMarkdownWithContext(ctx context.Context, htmlBytes []byte) (string, error)
func (p *Processor) ExtractToMarkdownFromFileWithContext(ctx context.Context, filePath string) (string, error)
func (p *Processor) ExtractToJSONWithContext(ctx context.Context, htmlBytes []byte) ([]byte, error)
func (p *Processor) ExtractToJSONFromFileWithContext(ctx context.Context, filePath string) ([]byte, error)
```

:::warning キャッシュ動作の違い
両者はキャッシュの扱いがまったく異なります：

- **`ExtractToMarkdown`** は一時 Processor を構築し（不変の `config` をコピーするが、`MaxCacheEntries` はゼロ、監査は無効化）、**主キャッシュの読み書きをしない**ため、主 Processor のキャッシュを汚染もヒットもしません。Markdown フォーマットの結果もキャッシュされません。
- **`ExtractToJSON`** は直接 `p.Extract` を呼び出し、**通常のキャッシュ経路**を通ります——主キャッシュにヒット/書き込みし、統計カウンタも更新されます。

Markdown 出力もキャッシュを利用したい場合は、`MarkdownConfig()` で専用 Processor を作って `Extract` を呼ぶか、出力を自分でキャッシュしてください。
:::

## リンク抽出

```go
func (p *Processor) ExtractAllLinks(htmlBytes []byte) ([]LinkResource, error)
func (p *Processor) ExtractAllLinksFromFile(filePath string) ([]LinkResource, error)
func (p *Processor) ExtractAllLinksWithContext(ctx context.Context, htmlBytes []byte) ([]LinkResource, error)
func (p *Processor) ExtractAllLinksFromFileWithContext(ctx context.Context, filePath string) ([]LinkResource, error)
```

## バッチ処理

```go
func (p *Processor) ExtractBatch(htmlContents [][]byte) *BatchResult
func (p *Processor) ExtractBatchWithContext(ctx context.Context, htmlContents [][]byte) *BatchResult
func (p *Processor) ExtractBatchFiles(filePaths []string) *BatchResult
func (p *Processor) ExtractBatchFilesWithContext(ctx context.Context, filePaths []string) *BatchResult
```

## 統計とキャッシュ

### キャッシュ動作の詳細

`MaxCacheEntries > 0` の場合、`Extract` はキャッシュを有効化します：

- **ヒット経路**：キャッシュ項目を検出した後、`CacheHits` と `TotalProcessed` をそれぞれ +1 し、返すのは `cloneResult`——`Images`/`Links`/`Videos`/`Audios` などのスライスに `copy` を行うディープコピーです。呼び出し側が戻り値を変更してもキャッシュ内のエントリには**影響せず**、並行ヒット時の読み取りでのデータ競合も回避できます。
- **ミス経路**：処理完了後に結果をキャッシュへ書き込み、それから `cloneResult`（同じくディープコピー）を返します。そのためキャッシュエントリと戻り値はエイリアスしません。
- **キャッシュ無効化**：`MaxCacheEntries = 0` の場合、`Extract` はキャッシュキーの生成と `Get/Set` をスキップ（ショートサーキット）し、キャッシュのオーバーヘッドは一切ありません。

### GetStatistics

現在の処理統計情報を返します。

```go
func (p *Processor) GetStatistics() Statistics
```

`Statistics` の各フィールドの意味：

| フィールド | 説明 |
|------|------|
| `TotalProcessed` | エラーなく完了した抽出回数、**キャッシュヒットを含む** |
| `CacheHits` | キャッシュで直接ヒットした回数 |
| `CacheMisses` | ミスして完全な処理が必要だった回数 |
| `ErrorCount` | エラーを返した抽出回数 |
| `AverageProcessTime` | 1 回あたりの抽出の平均実時間（`TotalProcessed` が 0 の場合は 0） |

```go
stats := p.GetStatistics()
fmt.Printf("処理済み：%d, キャッシュヒット：%d\n",
    stats.TotalProcessed, stats.CacheHits)
```

### ClearCache

キャッシュをクリアし、累積統計は保持します。

```go
func (p *Processor) ClearCache()
```

### ResetStatistics

すべての統計カウンターをリセットします。

```go
func (p *Processor) ResetStatistics()
```

## 監査

### GetAuditLog

監査ログエントリを取得します。

```go
func (p *Processor) GetAuditLog() []AuditEntry
```

### ClearAuditLog

監査ログをクリアします。

```go
func (p *Processor) ClearAuditLog()
```

## ライフサイクル

### Close

Processor が保持しているリソースを解放します。使用後に必ず呼び出してください。

```go
func (p *Processor) Close() error
```

```go
p, _ := html.New(cfg)
defer p.Close()
// ... p を使って抽出処理
```

:::tip ライフサイクルのベストプラクティス
- **シングルトン再利用**：長稼働サービス（HTTP handler、worker）では Processor を 1 つ作成して並行リクエスト間で共有し、キャッシュと組み合わせて恩恵を最大化します。Processor 自体が並行安全なので、リクエストごとに新設する必要はありません。
- **`defer Close()`**：作成直後に `defer p.Close()` を置き、異常パスでもバックグラウンドのクリーンアップ goroutine と監査リソースを解放できるようにします。`Close` はキャッシュクリーンアップ goroutine を停止し、キャッシュをクリアし、監査 sink を閉じます。
- **クローズ後に使わない**：`Close` 後にどのメソッドを呼び出しても `ErrProcessorClosed` を返します。`Close` は `CompareAndSwap` で冪等性を保証し、重複呼び出しは安全ですが無意味です。
:::
