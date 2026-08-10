---
sidebar_label: "バッチ処理"
title: "バッチ処理 - CyberGo html | 並行バッチ抽出 API"
description: "CyberGo html 並行バッチ抽出 API：ExtractBatch、ExtractBatchFiles 系列とコンテキスト対応版。WorkerPoolSize による並行処理をサポートし、1 バッチ最大 10000 件までの HTML ドキュメントを並列処理可能です。"
sidebar_position: 3
---

# バッチ処理

バッチ抽出は複数の HTML ドキュメントを並列処理でき、各バッチは最大 10000 件です。

## パッケージ関数

```go
func ExtractBatch(htmlContents [][]byte, cfg ...Config) *BatchResult
func ExtractBatchWithContext(ctx context.Context, htmlContents [][]byte, cfg ...Config) *BatchResult
func ExtractBatchFiles(filePaths []string, cfg ...Config) *BatchResult
func ExtractBatchFilesWithContext(ctx context.Context, filePaths []string, cfg ...Config) *BatchResult
```

## Processor メソッド

```go
func (p *Processor) ExtractBatch(htmlContents [][]byte) *BatchResult
func (p *Processor) ExtractBatchWithContext(ctx context.Context, htmlContents [][]byte) *BatchResult
func (p *Processor) ExtractBatchFiles(filePaths []string) *BatchResult
func (p *Processor) ExtractBatchFilesWithContext(ctx context.Context, filePaths []string) *BatchResult
```

## BatchResult

```go
type BatchResult struct {
    Results   []*Result  // 各入力項目の結果、入力順でインデックス付け; 失敗またはキャンセル時は nil
    Errors    []error    // 各入力項目のエラー、インデックスは Results と 1 対 1 で対応
    Success   int        // 成功数
    Failed    int        // 失敗数
    Cancelled int        // コンテキストのキャンセルにより未処理のまま残った項目数
}
```

## 並行処理の仕組み

バッチ抽出は**セマフォパターン**（バッファ付き channel `chan struct{}`）で並行度を制御し、一度にすべての goroutine を起動するわけではありません：

- **並行度**は `Config.WorkerPoolSize` で制御し、デフォルトは `4`（`DefaultWorkerPoolSize`）、範囲は `1–256`
- セマフォの容量は `WorkerPoolSize` に等しい：各 goroutine は起動前にスロットを 1 つ取得し（`sem <- struct{}{}`）、終了後に解放（`<-sem`）することで、**同時に実行される goroutine 数**を厳密に `WorkerPoolSize` に制限します
- 入力が数万件でも、同時に実行される抽出タスクは `WorkerPoolSize` 個だけなので、goroutine の爆発を防げます
- **各抽出項目は独立して実行**：エンコーディングの自動検出、項目ごとのエラー分離を行い、1 項目の失敗が他に影響することはありません
- **Processor は並行利用で安全**：複数の goroutine が同時に `Extract` を呼び出してもスレッドセーフであり、バッチメソッドは同一の Processor インスタンスを再利用します

:::tip WorkerPoolSize のチューニング
バッチ処理は入力がファイルの場合 I/O 集中型になることが多く、`WorkerPoolSize` を大きめ（`8–16` など）にするとスループットが向上します。純粋な CPU 解析が集中するシナリオでは `runtime.NumCPU()` を超えない方がよいでしょう。`256` を超えると設定検証段階で拒否されます。
:::

## BatchResult のフィールド説明

`Results` と `Errors` の 2 つのスライスは**長さがどちらも入力項目数に等しく**、**インデックスが 1 対 1 で対応**します：

| フィールド | 説明 |
|------|------|
| `Results[i]` | 第 `i` 入力の抽出結果；該当項目が失敗またはキャンセルされた場合は `nil` |
| `Errors[i]` | 第 `i` 入力のエラー；成功時は `nil`、失敗時は抽出エラー、キャンセル時は `ctx.Err()` |
| `Success` | 成功項目のカウント、`Results` 内の非 `nil` 要素数に等しい |
| `Failed` | 失敗項目のカウント（抽出過程でエラーを返したもの） |
| `Cancelled` | コンテキストキャンセルにより未処理のまま残った項目のカウント |

恒等式：`Success + Failed + Cancelled == 入力項目数`。

## コンテキストのキャンセル動作

`ExtractBatchWithContext` / `ExtractBatchFilesWithContext` は 3 つのチェックポイントで協調的にコンテキストキャンセルに応答します：

| チェックポイント | 動作 |
|--------|------|
| タスク派生前 | `ctx` が既にキャンセルされている場合、該当項目は即座に `Cancelled` とマークされ、`Errors[i] = ctx.Err()` となり、goroutine を起動しません |
| セマフォ取得後（goroutine 起動前） | セマフォ待機中にキャンセルされた場合も同様に `Cancelled` とマークします |
| goroutine 内の処理前 | 抽出を実行する直前に再度チェックし、キャンセルされていれば `Cancelled` とマークして即座に戻ります |

キャンセル後のセマンティクス：

- **完了済みの結果はそのまま保持**——キャンセルは未開始のタスクにのみ影響します
- **未開始のタスク**は `Cancelled` にカウントされ、その `Errors[i]` には `ctx.Err()`（通常は `context.Canceled` または `context.DeadlineExceeded`）が格納されます
- `WithContext` サフィックスのない版は内部で `context.Background()` を使用するため、キャンセルされることはありません

## 入力検証

バッチメソッドはタスク派生前に事前検証を行い、失敗時には `BatchResult`（`error` ではなく）に値を詰めて返します：

| 状況 | 戻り値 |
|------|------|
| バッチが `10000` 項目を超える | 各項目の `Errors[i]` に同一のエラーを詰め、`Failed = N`、panic は発生しない |
| Processor が `nil` または既に `Close` 済み | 各項目の `Errors[i]` に `ErrProcessorClosed` を詰め、`Failed = N` |
| 入力スライスが空（0 件） | 空の `BatchResult`（`Results`/`Errors` は空スライス） |
| パッケージ関数に無効な `Config` を渡した | 各項目に設定エラーを詰める |

## 例

### 基本的なバッチ抽出

```go
package main

import (
	"fmt"

	"github.com/cybergodev/html"
)

func main() {
	pages := [][]byte{
		[]byte("<html><head><title>ホーム</title></head><body><p>ホームへようこそ。</p></body></html>"),
		[]byte("<html><head><title>私たちについて</title></head><body><p>チーム紹介。</p></body></html>"),
		[]byte("<html><head><title>製品一覧</title></head><body><p>全 3 製品。</p></body></html>"),
	}

	batch := html.ExtractBatch(pages)
	fmt.Printf("成功：%d、失敗：%d、キャンセル：%d\n", batch.Success, batch.Failed, batch.Cancelled)
	// 出力：成功：3、失敗：0、キャンセル：0

	// Results のインデックスは入力スライスと 1 対 1 で対応
	for i, result := range batch.Results {
		if result != nil {
			fmt.Printf("  [%d] タイトル：%s、単語数：%d\n", i, result.Title, result.WordCount)
		}
	}
}
```

### コンテキストキャンセル付きバッチ抽出

```go
package main

import (
	"context"
	"fmt"

	"github.com/cybergodev/html"
)

func main() {
	pages := make([][]byte, 20)
	for i := range pages {
		pages[i] = []byte("<html><head><title>ページ</title></head><body><p>本文内容。</p></body></html>")
	}

	// コンテキストを即座にキャンセルし、早期終了をシミュレート
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	batch := html.ExtractBatchWithContext(ctx, pages)
	fmt.Printf("成功：%d、失敗：%d、キャンセル：%d\n", batch.Success, batch.Failed, batch.Cancelled)
	// 出力：成功：0、失敗：0、キャンセル：20

	// キャンセルされた項目：Results[i] は nil、Errors[i] は ctx.Err()
	fmt.Printf("先頭項目のエラー：%v\n", batch.Errors[0])
	// 出力：先頭項目のエラー：context canceled
}
```

:::warning バッチ制限
1 回のバッチは最大 10000 件です。超過するとすべての項目が失敗した `*BatchResult` を返します（各 `Errors` 項目は `html: batch size N exceeds maximum 10000`）。panic は発生しません。
:::
