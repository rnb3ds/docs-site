---
sidebar_label: "バッチ処理実践"
title: "バッチ処理実践 - CyberGo html | 並行抽出ガイド"
description: "CyberGo html バッチ処理実践：4 つのバッチ API、BatchResult 構造体、WorkerPoolSize による並行制御、コンテキストキャンセル、部分失敗処理、そして段階別のパフォーマンス推奨事項について詳しく解説します。"
sidebar_position: 2
---

# バッチ処理実践

大量の HTML ドキュメントを処理する際、バッチ API は自動的に並行実行され、ループで個別に呼び出すより数倍高速です。本ガイドでは 4 つのバッチ API、結果構造、並行チューニングを解説します。

## バッチ API の概要

ライブラリは 4 つのバッチ関数を提供します。バイト入力/ファイル入力 × コンテキストなし/コンテキストありの組み合わせです：

| API | 入力 | コンテキスト | 説明 |
|-----|------|--------|------|
| `ExtractBatch` | `[][]byte` | なし | バイトスライスをバッチ抽出 |
| `ExtractBatchFiles` | `[]string` | なし | ファイルパスをバッチ抽出 |
| `ExtractBatchWithContext` | `[][]byte` | あり | タイムアウト/キャンセルに対応 |
| `ExtractBatchFilesWithContext` | `[]string` | あり | タイムアウト/キャンセルに対応 |

すべての関数は `Processor` インスタンスまたはパッケージレベルで呼び出せます：

```go
// パッケージレベル（内部プールの Processor を使用）
br := html.ExtractBatch(pages)

// Processor インスタンス（キャッシュを再利用）
p, _ := html.New()
defer p.Close()
br := p.ExtractBatch(pages)
```

## BatchResult 構造体

バッチ操作は `*BatchResult` を返します。各項目の結果と集計カウントを含みます：

| フィールド | 型 | 説明 |
|------|------|------|
| `Results` | `[]*Result` | 各項目の抽出結果。失敗またはキャンセルされた項目は `nil` |
| `Errors` | `[]error` | 各項目のエラー。成功した項目は `nil`。インデックスは入力と 1 対 1 で対応 |
| `Success` | `int` | 正常に抽出された数 |
| `Failed` | `int` | 抽出に失敗した数 |
| `Cancelled` | `int` | コンテキストのキャンセルによりスキップされた数 |

:::tip インデックスの対応関係
`Results[i]`、`Errors[i]` は第 `i` 番目の入力項目と 1 対 1 で対応します。成功時は `Results[i]` が非 nil で `Errors[i]` が nil、失敗時はその逆になります。
:::

## 基本的なサンプル

3 つの HTML バイトスライスをバッチ抽出します：

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    pages := [][]byte{
        []byte(`<html><body><article><h1>ページ 1</h1><p>Go 言語チュートリアル。</p></article></body></html>`),
        []byte(`<html><body><article><h1>ページ 2</h1><p>並行プログラミングガイド。</p></article></body></html>`),
        []byte(`<html><body><article><h1>ページ 3</h1><p>パフォーマンス最適化のコツ。</p></article></body></html>`),
    }

    // バッチで並行抽出（パッケージ関数を使用）
    br := html.ExtractBatch(pages)

    fmt.Printf("成功：%d、失敗：%d、キャンセル：%d\n", br.Success, br.Failed, br.Cancelled)
    // 成功：3、失敗：0、キャンセル：0

    // 結果を走査（インデックスは入力に対応）
    for i, result := range br.Results {
        if result != nil {
            fmt.Printf("  [%d] タイトル：%s\n", i+1, result.Title)
        } else if br.Errors[i] != nil {
            fmt.Printf("  [%d] エラー：%v\n", i+1, br.Errors[i])
        }
    }
    // [1] タイトル：ページ 1
    // [2] タイトル：ページ 2
    // [3] タイトル：ページ 3
}
```

## ファイルからバッチ抽出

```go
files := []string{"page1.html", "page2.html", "page3.html"}

br := html.ExtractBatchFiles(files)

fmt.Printf("成功：%d、失敗：%d\n", br.Success, br.Failed)

for i, err := range br.Errors {
    if err != nil {
        fmt.Printf("ファイル %s が失敗：%v\n", files[i], err)
    }
}
```

## パッケージ関数 vs Processor インスタンス

2 つの呼び出し方式ではキャッシュの動作が異なります：

| 呼び出し方式 | キャッシュ | 適用シーン |
|----------|------|----------|
| `html.ExtractBatch(pages)` | 無効（プールの Processor は毎回キャッシュをクリア） | 一回限りのバッチタスク |
| `p.ExtractBatch(pages)` | 有効（Processor のキャッシュを再利用） | 高頻度バッチ、重複コンテンツ |

:::warning パッケージ関数はキャッシュしません
パッケージ関数は内部 `sync.Pool` で管理される Processor を使用し、その設定ではキャッシュが無効化（`MaxCacheEntries = 0`）されており、返却時にキャッシュがクリアされます。バッチ内に重複コンテンツがある場合は、Processor インスタンスを使用してキャッシュ加速を活用してください。詳しくは [Processor の再利用とキャッシュ](./processor-cache) を参照してください。
:::

```go
// 推奨：高頻度バッチシナリオでは Processor を再利用
p, _ := html.New()
defer p.Close()

for batch := range batchQueue {
    br := p.ExtractBatch(batch) // キャッシュが有効、重複コンテンツは直接ヒット
    processResult(br)
}
```

## 並行制御

`WorkerPoolSize` はバッチ処理の並行ワーカー数を制御します（デフォルト 4、最大 256）：

```go
cfg := html.DefaultConfig()

// CPU コア数に基づいて並行度を設定（上限 256）
if n := runtime.NumCPU(); n > 256 {
    n = 256
}
cfg.WorkerPoolSize = n

p, _ := html.New(cfg)
defer p.Close()

br := p.ExtractBatch(pages)
```

| 設定 | デフォルト値 | 上限 | 説明 |
|------|--------|------|------|
| `WorkerPoolSize` | 4 | 256 | 並行ワーカー数。正の整数でなければなりません |

:::tip WorkerPoolSize のチューニング
CPU 集中型タスクは CPU コア数に設定します。I/O 集中型（ファイル読み込みなど）は適宜大きくできます。256 を超えると設定の検証で拒否されます。
:::

## バッチ上限

1 回のバッチは最大 10000 項目をサポートします。超過した場合、**すべての項目**にエラーが返されます（部分的な処理ではありません）：

```go
huge := make([][]byte, 10001) // 上限を超過

br := html.ExtractBatch(huge)

fmt.Printf("失敗：%d\n", br.Failed)
// 失敗：10001

fmt.Printf("最初の項目のエラー：%v\n", br.Errors[0])
// 最初の項目のエラー：html: batch size 10001 exceeds maximum 10000
```

:::warning 上限超過時の動作
`maxBatchSize = 10000` はハードリミットです。超過時はいずれの項目も処理されず、すべての入力に対して統一のエラーが返されます。さらに処理が必要な場合は、分割して呼び出してください。
:::

## コンテキストのキャンセル

`ExtractBatchWithContext` はコンテキストがキャンセルされた際、適切に終了します：

```go
ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
defer cancel()

br := p.ExtractBatchWithContext(ctx, pages)

fmt.Printf("成功：%d、失敗：%d、キャンセル：%d\n",
    br.Success, br.Failed, br.Cancelled)
```

| 項目のステータス | 処理方法 |
|----------|----------|
| 完了済み | 結果は `Results` に保持されます |
| 処理中 | 完了後に正常に記録されます |
| 未開始 | スキップされ、`Cancelled` にカウント、`Errors[i]` は `ctx.Err()` に設定 |

:::tip 部分結果が利用可能
コンテキストのキャンセル後も、完了した項目の結果は `br.Results` に（非 nil で）保持されます。キャンセルを理由に全出力を破棄することなく、完了済みの結果を安全に使用できます。
:::

## 部分失敗の処理

バッチは**部分成功**します — 1 項目の失敗が他の項目に影響することはありません：

```go
pages := [][]byte{
    validHTML,   // 正常
    []byte(""),  // 空の入力、エラーをトリガー
    validHTML2,  // 正常
}

br := p.ExtractBatch(pages)

// 第 2 項目が失敗、第 1、3 項目は成功
fmt.Printf("成功：%d、失敗：%d\n", br.Success, br.Failed)
// 成功：2、失敗：1

// 項目ごとに処理し、失敗した項目をスキップ
for i, result := range br.Results {
    if result == nil {
        fmt.Printf("[%d] 失敗：%v\n", i, br.Errors[i])
        continue
    }
    fmt.Printf("[%d] タイトル：%s\n", i, result.Title)
}
```

## パフォーマンスの推奨事項

| ドキュメント数 | 推奨戦略 | 説明 |
|----------|----------|------|
| 1–10 | 個別に `Extract` | バッチのスケジューリングオーバーヘッドが並行のメリットを上回る可能性 |
| 10–1000 | `ExtractBatch` + パッケージ関数 | 自動並行、Processor の管理が不要 |
| 1000+ | `p.ExtractBatch` + Processor インスタンス | キャッシュを再利用、分割処理でメモリピークを回避 |
| 10000+ | 分割バッチ（各バッチ ≤10000）+ Processor インスタンス | 1 バッチの上限を超えるため、分割して処理 |

```go
// 大規模バッチ処理のサンプル
p, _ := html.New()
defer p.Close()

const batchSize = 5000
for i := 0; i < len(allPages); i += batchSize {
    end := i + batchSize
    if end > len(allPages) {
        end = len(allPages)
    }

    br := p.ExtractBatch(allPages[i:end])
    // このバッチの結果を処理...
}
```

## 次のステップ

- [Processor の再利用とキャッシュ](./processor-cache) - パッケージ関数とインスタンスのキャッシュの違い
- [パフォーマンス最適化](./performance) - スループットの向上とタイムアウト設定
- [エラー処理](../error-handling) - センチネルエラーとバッチエラー処理
- [API リファレンス：バッチ処理](../../api-reference/modules/batch) - 完全な API シグネチャ
