---
sidebar_label: "JSONL"
title: "Processor JSONL メソッド - CyberGo JSON | API リファレンス"
description: "CyberGo JSON Processor JSONL メソッド：StreamJSONL で行単位処理、StreamJSONLParallel で並列処理、ForeachJSONL 反復、MapJSONL マッピング、ReduceJSONL リダクション、FilterJSONL フィルタ。"
sidebar_position: 8
---

# Processor JSONL メソッド

Processor は完全な JSONL（JSON Lines）ストリーミング処理能力を提供し、行単位処理、並列処理、バッチ処理、関数型操作をサポートします。

::: tip 完全なチュートリアル
JSONL/NDJSON の概念説明とストリーミング処理の実践が必要ですか？[JSONL プロセッサ](../../streaming/jsonl)の完全チュートリアルを参照してください。
:::

## ストリーミング読み込みメソッド

### StreamJSONL

シグネチャ：`func (p *Processor) StreamJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) error) error`

JSONL データをストリーミング処理し、行単位で読み込んでコールバック関数を呼び出します。コールバックが `nil` を返すと次の行の処理を続け、`item.Break()` を返すとクリーンに早期終了します（全体は `nil` を返す）。その他のエラーを返すと即座に停止し、そのエラーを返します。コールバック内の panic は捕捉されてエラーに変換され、プロセスは落ちません。

**パラメータ**

| 名前 | 型 | 説明 |
|------|------|------|
| `reader` | `io.Reader` | JSONL データソース |
| `fn` | `func(lineNum int, item *IterableValue) error` | 処理関数：`nil` で続行 / `item.Break()` で停止 / その他のエラーで中断 |

```go
processor, _ := json.New()
defer processor.Close()

file, _ := os.Open("logs.jsonl")
defer file.Close()

err := processor.StreamJSONL(file, func(lineNum int, item *json.IterableValue) error {
    level := item.GetString("level")
    msg := item.GetString("message")
    fmt.Printf("[%d] %s: %s\n", lineNum, level, msg)
    return nil
})
```

---

### StreamJSONLParallel

シグネチャ：`func (p *Processor) StreamJSONLParallel(reader io.Reader, workers int, fn func(lineNum int, item *IterableValue) error) error`

複数のワーカー goroutine で JSONL データを並列処理し、処理を高速化します。

**パラメータ**

| 名前 | 型 | 説明 |
|------|------|------|
| `reader` | `io.Reader` | JSONL データソース |
| `workers` | `int` | ワーカー goroutine 数（≤0 の場合はデフォルト 4） |
| `fn` | `func(lineNum int, item *IterableValue) error` | 処理関数 |

```go
processor, _ := json.New()
defer processor.Close()

file, _ := os.Open("large.jsonl")
defer file.Close()

var count int64
err := processor.StreamJSONLParallel(file, 8, func(lineNum int, item *json.IterableValue) error {
    atomic.AddInt64(&count, 1)
    // CPU 集約的な処理...
    return nil
})
fmt.Printf("%d 行を処理しました\n", count)
```

::: tip パフォーマンスのヒント
- CPU 集約的な操作（データ変換、計算）に適します
- I/O 集約的な操作にはシングルスレッドの `StreamJSONL` を推奨
- workers 数は CPU コア数に設定するのが推奨
:::

### StreamJSONLParallelWithContext

シグネチャ：`func (p *Processor) StreamJSONLParallelWithContext(ctx context.Context, reader io.Reader, workers int, fn func(lineNum int, item *IterableValue) error) error`

コンテキスト付きの JSONL 並列処理です。キャンセルとタイムアウト制御をサポートします。

**パラメータ**

| 名前 | 型 | 説明 |
|------|------|------|
| `ctx` | `context.Context` | コンテキスト。キャンセルまたはタイムアウトに使用 |
| `reader` | `io.Reader` | JSONL データソース |
| `workers` | `int` | ワーカー goroutine 数（≤0 の場合はデフォルト 4） |
| `fn` | `func(lineNum int, item *IterableValue) error` | 処理関数 |

```go
processor, _ := json.New()
defer processor.Close()

ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()

err := processor.StreamJSONLParallelWithContext(ctx, reader, 8, func(lineNum int, item *json.IterableValue) error {
    return nil
})
if err != nil {
    log.Fatal(err)
}
```

---

### StreamJSONLChunked

シグネチャ：`func (p *Processor) StreamJSONLChunked(reader io.Reader, chunkSize int, fn func(chunk []*IterableValue) error) error`

JSONL データをチャンク処理します。毎回 1 バッチの要素を処理します。

**パラメータ**

| 名前 | 型 | 説明 |
|------|------|------|
| `reader` | `io.Reader` | JSONL データソース |
| `chunkSize` | `int` | 1 バッチの要素数 |
| `fn` | `func(chunk []*IterableValue) error` | バッチ処理関数 |

```go
processor, _ := json.New()
defer processor.Close()

file, _ := os.Open("data.jsonl")
defer file.Close()

err := processor.StreamJSONLChunked(file, 100, func(chunk []*json.IterableValue) error {
    // データベースへバッチ書き込み
    records := make([]Record, len(chunk))
    for i, item := range chunk {
        records[i] = Record{
            ID:    item.GetInt("id"),
            Name:  item.GetString("name"),
        }
    }
    return db.BatchInsert(records)
})
```

---

### StreamJSONLFile

シグネチャ：`func (p *Processor) StreamJSONLFile(filename string, fn func(lineNum int, item *IterableValue) error) error`

ファイルから直接 JSONL データをストリーミング処理します。

```go
processor, _ := json.New()
defer processor.Close()

err := processor.StreamJSONLFile("logs.jsonl", func(lineNum int, item *json.IterableValue) error {
    if item.GetString("level") == "error" {
        logErrors(item)
    }
    return nil
})
```

---

## 関数型操作メソッド

### ForeachJSONL

シグネチャ：`func (p *Processor) ForeachJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) error) error`

JSONL データを反復するエイリアスメソッドです。動作は `StreamJSONL` と同じです。

```go
err := processor.ForeachJSONL(file, func(lineNum int, item *json.IterableValue) error {
    fmt.Printf("%d 行目: %v\n", lineNum, item.GetData())
    return nil
})
```

---

### MapJSONL

シグネチャ：`func (p *Processor) MapJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) (any, error)) ([]any, error)`

JSONL データを新しい形式にマッピングし、変換後のスライスを返します。

```go
processor, _ := json.New()
defer processor.Close()

file, _ := os.Open("users.jsonl")
defer file.Close()

// すべてのユーザー名を抽出
names, err := processor.MapJSONL(file, func(lineNum int, item *json.IterableValue) (any, error) {
    return item.GetString("name"), nil
})
// names: []any{"Alice", "Bob", "Charlie"}
```

---

### ReduceJSONL

シグネチャ：`func (p *Processor) ReduceJSONL(reader io.Reader, initial any, fn func(acc any, item *IterableValue) any) (any, error)`

JSONL データを単一の値にリデュースします。

```go
processor, _ := json.New()
defer processor.Close()

file, _ := os.Open("sales.jsonl")
defer file.Close()

// 総売上額を計算
total, err := processor.ReduceJSONL(file, 0.0, func(acc any, item *json.IterableValue) any {
    price := item.GetFloat64("price")
    return acc.(float64) + price
})
fmt.Printf("総売上額：%.2f\n", total.(float64))
```

---

### FilterJSONL

シグネチャ：`func (p *Processor) FilterJSONL(reader io.Reader, predicate func(item *IterableValue) bool) ([]*IterableValue, error)`

JSONL データをフィルタリングし、条件を満たす要素を返します。

```go
processor, _ := json.New()
defer processor.Close()

file, _ := os.Open("logs.jsonl")
defer file.Close()

// エラーログを抽出
errors, err := processor.FilterJSONL(file, func(item *json.IterableValue) bool {
    return item.GetString("level") == "error"
})
fmt.Printf("%d 件のエラーログを発見\n", len(errors))
```

---

### CollectJSONL

シグネチャ：`func (p *Processor) CollectJSONL(reader io.Reader) ([]*IterableValue, error)`

すべての JSONL データをスライスに収集します。

```go
processor, _ := json.New()
defer processor.Close()

file, _ := os.Open("data.jsonl")
defer file.Close()

items, err := processor.CollectJSONL(file)
if err != nil {
    panic(err)
}
fmt.Printf("%d 件のレコードを収集\n", len(items))
```

::: warning メモリに関する注意
このメソッドはすべてのデータをメモリにロードするため、超大ファイルには適しません。大規模ファイルには `StreamJSONL` による行単位処理を推奨します。
:::

---

### FirstJSONL

シグネチャ：`func (p *Processor) FirstJSONL(reader io.Reader, predicate func(item *IterableValue) bool) (*IterableValue, bool, error)`

最初に条件を満たす要素を検索します。

**戻り値**

| 型 | 説明 |
|------|------|
| `*IterableValue` | 見つかった要素（存在する場合） |
| `bool` | 見つかったかどうか |
| `error` | エラー情報 |

```go
processor, _ := json.New()
defer processor.Close()

file, _ := os.Open("users.jsonl")
defer file.Close()

// 最初の管理者を検索
admin, found, err := processor.FirstJSONL(file, func(item *json.IterableValue) bool {
    return item.GetBool("is_admin")
})
if err != nil {
    panic(err)
}
if found {
    fmt.Printf("管理者: %s\n", admin.GetString("name"))
}
```

---

## NDJSONProcessor スタンドアロンプロセッサ

`NDJSONProcessor` は `Processor` から独立した NDJSON（改行区切り JSON）の行単位プロセッサです：コールバックは（`IterableValue` ではなく）`map[string]any` を直接受け取り、`Processor` インスタンスの作成が不要で、空行を**常に**スキップします。オブジェクト行をシンプルに消費するシナリオに適します。型付き値取得、並列処理、Map/Reduce/Filter の関数型組み合わせが必要な場合は、本ページ上部の `StreamJSONL` 系を使ってください。

### NewNDJSONProcessor

シグネチャ：`func NewNDJSONProcessor(cfg ...Config) *NDJSONProcessor`

`NewNDJSONProcessor` はオプションの cfg を受け取り、統一 Config パターンに従います。

**パラメータ**

| 名前 | 型 | 説明 |
|------|------|------|
| `cfg` | `...Config` | オプション設定。未渡しの場合は `DefaultConfig()` を使用。読み取りバッファは `JSONLBufferSize`（≤0 の場合は 64KB にフォールバック） |

その他の JSONL フィールド（`JSONLMaxLineSize`、`JSONLMaxMemory`、`JSONLSkipComments`、`JSONLContinueOnErr`、`MaxNestingDepthSecurity`）は処理時に有効になります。意味は[設定オプション](#設定オプション)を参照してください。

### ProcessFile

シグネチャ：`func (np *NDJSONProcessor) ProcessFile(filename string, fn func(lineNum int, obj map[string]any) error) error`

`ProcessFile` は NDJSON ファイルを行単位で処理します。ファイルパスはまずパストラバーサルなどのセキュリティ検証を受け（不正パスは `ErrSecurityViolation` を返す）、その後オープンしたファイルへの `ProcessReader` 呼び出しと等価です。ファイルオープン失敗などのエラーは `JsonsError` にラップされて返ります。

**パラメータ**

| 名前 | 型 | 説明 |
|------|------|------|
| `filename` | `string` | NDJSON ファイルパス（まずセキュリティ検証） |
| `fn` | `func(lineNum int, obj map[string]any) error` | 行ごとのコールバック。エラーを返すと即座に終了し、そのまま返す |

### ProcessReader

シグネチャ：`func (np *NDJSONProcessor) ProcessReader(reader io.Reader, fn func(lineNum int, obj map[string]any) error) error`

`ProcessReader` は `io.Reader` から NDJSON を行単位で処理します：各行を `map[string]any` に解析してからコールバックを呼び出し、コールバックの panic は捕捉されてエラーに変換されます。セキュリティ制限は `StreamJSONL` 系と同じです——単一行のサイズは `JSONLMaxLineSize` に従い（フォールバックチェーン `MaxJSONSize` → 100MB）、総処理量は `JSONLMaxMemory` に従い（`MaxMemory` にフォールバック）、各行の解析前には `MaxNestingDepthSecurity` でネスト深度をチェックします。`JSONLContinueOnErr=true` の場合、解析に失敗した行をスキップして処理を続けます。

**パラメータ**

| 名前 | 型 | 説明 |
|------|------|------|
| `reader` | `io.Reader` | NDJSON データソース |
| `fn` | `func(lineNum int, obj map[string]any) error` | 行ごとのコールバック。エラーを返すと即座に終了し、そのまま返す |

<!-- check-code: skip -->
```go
np := json.NewNDJSONProcessor()

err := np.ProcessReader(strings.NewReader(`{"id":1}`), func(lineNum int, obj map[string]any) error {
    fmt.Printf("%d 行目: id=%v\n", lineNum, obj["id"])
    return nil
})
```

**完全なサンプル**（空行は常にスキップされ、行番号は元の物理行番号を維持）：

```go
package main

import (
	"fmt"
	"strings"

	"github.com/cybergodev/json"
)

func main() {
	np := json.NewNDJSONProcessor()

	data := "{\"id\":1}\n\n{\"id\":2}\n"
	var count int

	err := np.ProcessReader(strings.NewReader(data), func(lineNum int, obj map[string]any) error {
		count++
		fmt.Printf("%d 行目: id=%v\n", lineNum, obj["id"])
		return nil
	})
	if err != nil {
		panic(err)
	}
	fmt.Printf("合計 %d 行を処理\n", count)
	// 出力:
	// 1 行目: id=1
	// 3 行目: id=2
	// 合計 2 行を処理
}
```

::: tip StreamJSONL との選定
コールバックで `map[string]any` を直接扱え、コードが最もシンプルな場合は `NDJSONProcessor`。`IterableValue` の型付き値取得（`GetInt`/`GetString`）、並列 worker、チャンク、関数型パイプラインが必要な場合は `StreamJSONL` 系。両者は同じ JSONL セキュリティ制限の下にあります。
:::

---

## 設定オプション

JSONL 処理の動作は `Config` の以下のフィールドで設定できます：

| フィールド | 型 | デフォルト値 | 説明 |
|------|------|--------|------|
| `JSONLBufferSize` | `int` | 65536 (64KB) | 読み取りバッファサイズ |
| `JSONLMaxLineSize` | `int` | 1048576 (1MB) | 1 行の最大バイト数 |
| `JSONLSkipEmpty` | `bool` | `true` | 空行をスキップ |
| `JSONLSkipComments` | `bool` | `false` | `#` または `//` コメントをスキップ |
| `JSONLContinueOnErr` | `bool` | `false` | 解析エラー時に継続（`StreamLinesInto` と `NDJSONProcessor` にのみ作用。本ページの `StreamJSONL` 系は解析エラーで常に中断） |
| `JSONLWorkers` | `int` | 4 | 並列処理ワーカー goroutine 数 |
| `JSONLChunkSize` | `int` | 1000 | チャンク処理の 1 バッチサイズ |
| `JSONLMaxMemory` | `int64` | 104857600 (100MB) | 最大メモリ使用量 |

::: tip Processor メソッドは per-call cfg を受け取らない
本ページの Processor メソッドの JSONL 動作は、**すべて `New(cfg)` 時に固定された設定に由来します**（メソッドシグネチャに `cfg ...Config` はありません）。呼び出しごとに設定を切り替える必要がある場合は、[パッケージレベル JSONL 関数](../functions/jsonl)の末尾 `cfg` を使ってください。また注意：`StreamJSONLParallel` の明示的な `workers` 引数、`StreamJSONLChunked` の明示的な `chunkSize` 引数は `JSONLWorkers` / `JSONLChunkSize` フィールドに**優先**します。さらに、各行は解析前に `MaxNestingDepthSecurity` によるネスト深度チェックを受け、深くネストしたペイロードによるスタック枯渇を防ぎます。
:::

```go
cfg := json.DefaultConfig()
cfg.JSONLSkipComments = true     // コメント行をスキップ
cfg.JSONLContinueOnErr = true    // 解析エラー時に継続
cfg.JSONLWorkers = 8             // 8 つの並列 worker

processor, _ := json.New(cfg)
defer processor.Close()
```

---

## 完全なサンプル

### ログ分析

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"os"
)

func main() {
	processor, _ := json.New()
	defer processor.Close()

	file, _ := os.Open("app.log.jsonl")
	defer file.Close()

	var errorCount, warningCount int

	err := processor.StreamJSONL(file, func(lineNum int, item *json.IterableValue) error {
		level := item.GetString("level")
		switch level {
		case "error":
			errorCount++
			fmt.Printf("[ERROR] %s\n", item.GetString("message"))
		case "warning":
			warningCount++
		}
		return nil
	})

	if err != nil {
		panic(err)
	}

	fmt.Printf("統計：%d 件のエラー、%d 件の警告\n", errorCount, warningCount)
}
```

### 並列データ処理

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"os"
	"sync/atomic"
)

func main() {
	cfg := json.DefaultConfig()
	cfg.JSONLWorkers = 16 // 16 つの並列 worker

	processor, _ := json.New(cfg)
	defer processor.Close()

	file, _ := os.Open("large_data.jsonl")
	defer file.Close()

	var processed int64

	err := processor.StreamJSONLParallel(file, 16, func(lineNum int, item *json.IterableValue) error {
		// CPU 集約的な処理（実際のビジネスロジックに置き換えてください）
		_ = item
		atomic.AddInt64(&processed, 1)
		return nil
	})

	if err != nil {
		panic(err)
	}

	fmt.Printf("%d 件のレコードを並列処理しました\n", processed)
}
```

---

## 関連

- [JSONL プロセッサ](../../streaming/jsonl) - パッケージレベル JSONL 関数
- [大規模ファイル処理](../../streaming/large-files) - 大規模ファイル処理ガイド
- [イテレータ](../iterator) - IterableValue 型詳解
