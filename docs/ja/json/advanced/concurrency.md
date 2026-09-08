---
sidebar_label: "並行・並列処理"
title: "並行・並列処理 - CyberGo JSON | 実践ガイド"
description: "CyberGo JSON の並行・並列処理：Processor のスレッド安全保証、ParallelIterator 並列イテレータ、StreamJSONLParallel、SetGlobalProcessor グローバル共有、MaxConcurrency 並行制限、大規模データの並行処理レシピも解説。"
sidebar_position: 4
---

# 並行・並列処理

CyberGo JSON のすべての操作は**並行安全**で、すぐに使える並列処理 API（`ParallelIterator`、並列 JSONL ストリーム）を提供します。本ページはスレッド安全セマンティクス、内蔵並列 API、並行使用パターンを文書化します。

:::tip パフォーマンス最適化ページとの分担
[パフォーマンス最適化](./performance)の「並行処理」の節で示しているのは**一般的な Go パターン**（`sync.WaitGroup` + セマフォ + Worker Pool）による手動の配列並行処理です。本ページが文書化するのは**ライブラリ内蔵**の並列 API で、両者は補完関係にあります。
:::

## スレッド安全の保証

`Processor` はスレッド安全なメイン処理エンジンです（ソースコメント：`Processor is the main JSON processing engine with thread safety`）：

- **単一の Processor インスタンスを複数 goroutine で共有できる**——すべての公開メソッド（`Get`/`Set`/`Delete`/`Marshal` など）は内部でアトミック操作と並行ガバナンス（`beginGovernedOp`/`endGovernedOp`）で保護されています。
- **パッケージレベル関数**（`json.Get`、`json.GetString` など）は単一のグローバル Processor を共有し、自然に並行安全です。
- **`PreParse` が返す `*ParsedJSON` は並行読み取り可能**——複数 goroutine が同じ `ParsedJSON` に対して同時に `GetFromParsed` を呼べます。

:::warning 共有してはならないケース
`Processor` は共有できますが、**ミュータブルな Go コンテナを goroutine 間で共有しないでください**（`Get` が返す `map[string]any` を複数 goroutine で書き換えるなど）。ライブラリが返すコンテナはデフォルトでコピーです（`CacheSharedResults` 有効時を除く）。戻り値を書き換えてもキャッシュには影響しませんが、複数 goroutine による同じコンテナの書き換えには呼び出し側が自前でロックが必要です。
:::

## ParallelIterator 並列イテレータ

`ParallelIterator` はマルチコア CPU で配列を並列処理します。worker プール、エラー集約、panic リカバリーを内蔵し、手書き goroutine プールより安全です。

### 基本的な並行走査

```go
package main

import (
	"fmt"
	"sync"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"items":[1,2,3,4,5,6,7,8]}`
	items := json.GetArray(data, "items")

	// worker 数はデフォルトで Config.MaxConcurrency（配列長でクリップされる）
	iter := json.NewParallelIterator(items)
	defer iter.Close()

	var mu sync.Mutex
	var sum int64
	err := iter.ForEach(func(_ int, val any) error {
		mu.Lock()
		sum += int64(val.(float64))
		mu.Unlock()
		return nil
	})
	if err != nil {
		panic(err)
	}
	fmt.Printf("合計 = %d\n", sum)
	// 出力: 合計 = 36
}
```

### 並列マップ Map

`Map` は各要素を並列変換し、結果は**元の順序を保持します**（各 worker が自分のインデックス位置に書き込むため、ロック不要）。

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"items":[1,2,3,4]}`
	items := json.GetArray(data, "items")

	iter := json.NewParallelIterator(items)
	defer iter.Close()

	// 並列マップ：各要素を *10。結果の順序は入力と一致
	doubled, err := iter.Map(func(_ int, val any) (any, error) {
		return int(val.(float64)) * 10, nil
	})
	if err != nil {
		panic(err)
	}
	fmt.Println(doubled)
	// 出力: [10 20 30 40]
}
```

### バッチ並列 ForEachBatch / ForEachBatchWithContext

要素ごとのコールバックオーバーヘッドが大きい場合（要素ごとにシステムコールやネットワークリクエストが発生するなど）、`ForEachBatch` は要素を固定サイズのバッチに切り分け、**各バッチを 1 つの goroutine で処理**します——バッチ内は直列、バッチ間は並列で、スケジューリングと同期のコストを償却します。

```go
package main

import (
	"context"
	"fmt"
	"time"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"records":[10,20,30,40,50,60,70,80,90,100]}`
	records := json.GetArray(data, "records")

	iter := json.NewParallelIterator(records)
	defer iter.Close()

	// 10 件のレコードを 1 バッチ 3 件に分割 → 4 バッチ（末尾バッチは 1 件）。batchIdx で独立した添字に書き込むためロック不要
	subtotals := make([]int, 4)
	err := iter.ForEachBatch(3, func(batchIdx int, batch []any) error {
		sum := 0
		for _, v := range batch {
			sum += int(v.(float64))
		}
		subtotals[batchIdx] = sum
		return nil
	})
	if err != nil {
		panic(err)
	}

	// 全バッチ完了後に順次消費（実行順序は保証されないが、結果は添字通りに配置される）
	for i, s := range subtotals {
		fmt.Printf("バッチ %d 小計 = %d\n", i, s)
	}

	// タイムアウト制御版：ctx の期限後、未ディスパッチのバッチは実行されず、実行中のバッチはキャンセルを検出して終了
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	err = iter.ForEachBatchWithContext(ctx, 100, func(batchIdx int, batch []any) error {
		return nil // 単一バッチ処理をシミュレート
	})
	fmt.Println("タイムアウト付きバッチ処理完了、エラー:", err)
}

// 出力:
// バッチ 0 小計 = 60
// バッチ 1 小計 = 150
// バッチ 2 小計 = 240
// バッチ 3 小計 = 100
// タイムアウト付きバッチ処理完了、エラー: <nil>
```

`batchSize <= 0` の場合は 100 として扱います。コールバックのエラーは `ForEach` と同じです：最初のエラーが勝ち、新しいバッチのディスパッチを停止します。バッチの**ディスパッチ**順序は入力と一致します（`batchIdx` は増加）が、**実行**順序は保証されません——順序保持出力の方法が上の例です：添字に配置し、完了後に順次消費します。

### ParallelIterator API 一覧

| API | シグネチャ | 説明 |
|-----|------|------|
| `NewParallelIterator` | `func NewParallelIterator(data []any, cfg ...Config) *ParallelIterator` | イテレータを作成。worker 数は `cfg.MaxConcurrency`（デフォルト 50、配列長を超える場合はクリップ。`<= 0` は 4 にフォールバック） |
| `ForEach` | `func (it *ParallelIterator) ForEach(fn func(int, any) error) error` | 並行走査、最初のエラーを返す |
| `ForEachWithContext` | `func (it *ParallelIterator) ForEachWithContext(ctx context.Context, fn func(int, any) error) error` | context キャンセル対応 |
| `ForEachBatch` | `func (it *ParallelIterator) ForEachBatch(batchSize int, fn func(int, []any) error) error` | バッチ並列処理。バッチ内直列、バッチ間並列 |
| `ForEachBatchWithContext` | `func (it *ParallelIterator) ForEachBatchWithContext(ctx context.Context, batchSize int, fn func(int, []any) error) error` | バッチ並列 + context キャンセル |
| `Map` | `func (it *ParallelIterator) Map(transform func(int, any) (any, error)) ([]any, error)` | 並列変換、順序保持で返す |
| `Filter` | `func (it *ParallelIterator) Filter(predicate func(int, any) bool) []any` | 並列フィルタ、順序保持で返す（エラー戻り値なし） |
| `Close` | `func (it *ParallelIterator) Close()` | リソース解放（実行中 goroutine に停止をシグナル、複数回呼んでも安全） |

完全なシグネチャと使い方は[イテレータ型](../api-reference/iterator#paralleliterator-型)を参照してください。

:::tip エラーと panic の処理
`ForEach` は**最初の**エラーを返すと新しいタスクのディスパッチを停止します。worker 内の panic は回復（`recover`）されてエラーに変換され、プロセスは落ちません。キャンセルが必要な場合は `ForEachWithContext` を使い、`ctx.Done()` でグレースフルに終了します。
:::

## 並列 JSONL ストリーム処理

大型 JSONL（NDJSON）ファイルの処理では、`StreamJSONLParallel` が複数 worker で各行を並列処理します。

```go
package main

import (
	"fmt"
	"strings"
	"sync"

	"github.com/cybergodev/json"
)

func main() {
	// JSONL データをシミュレート（1 行 1 JSON オブジェクト）
	jsonlData := `{"id":1,"score":95}
{"id":2,"score":82}
{"id":3,"score":78}
{"id":4,"score":90}`

	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	var mu sync.Mutex
	var total int64
	var count int64

	// 4 worker で各行を並列処理
	err = processor.StreamJSONLParallel(strings.NewReader(jsonlData), 4, func(lineNum int, item *json.IterableValue) error {
		score := int64(item.GetInt("score"))
		mu.Lock()
		total += score
		count++
		mu.Unlock()
		return nil
	})
	if err != nil {
		panic(err)
	}
	fmt.Printf("%d 件を処理、合計 %d\n", count, total)
	// 出力: 4 件を処理、合計 345
}
```

| API | 説明 |
|-----|------|
| `StreamJSONLParallel(reader, workers, fn)` | 複数 worker で JSONL を並列処理 |
| `StreamJSONLParallelWithContext(ctx, reader, workers, fn)` | 同上。context のキャンセルとタイムアウト対応 |
| `StreamJSONLChunked(reader, chunkSize, fn)` | チャンク処理、メモリに優しい |

完全なシグネチャと設定（`JSONLWorkers`/`JSONLChunkSize` など）は [JSONL 処理](../api-reference/processor/jsonl)と [JSONL ストリーミング](../streaming/jsonl)を参照してください。

:::tip 行順序
並列モードでもコールバックの `lineNum` は元の行番号を反映しますが、**実行順序は保証されません**。順序保持出力が必要な場合は、コールバック内で `lineNum` に基づき事前確保したスライスの対応位置に書き込んでください。
:::

## グローバルプロセッサの並行使用

`SetGlobalProcessor` により、すべてのパッケージレベル関数が同じカスタム Processor を共有します。統一設定（キャッシュパラメータ、フック、セキュリティ制限）が必要なマルチ goroutine サービスに適します。

```go
package main

import (
	"fmt"
	"sync"

	"github.com/cybergodev/json"
)

func main() {
	// カスタムグローバルプロセッサ（すべてのパッケージレベル関数が共有、並行安全）
	cfg := json.DefaultConfig()
	processor, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	json.SetGlobalProcessor(processor)   // 古いグローバル Processor は自動クローズされる
	defer json.ShutdownGlobalProcessor() // アプリケーション終了時にクリーンにクローズ

	data := `{"user":{"name":"Alice","age":30}}`

	// 複数 goroutine がパッケージレベル関数を並行使用（同一グローバル Processor を共有）
	var wg sync.WaitGroup
	results := make([]string, 3)
	for i := 0; i < 3; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			switch idx {
			case 0:
				results[idx] = json.GetString(data, "user.name")
			case 1:
				results[idx] = fmt.Sprintf("%d", json.GetInt(data, "user.age"))
			case 2:
				results[idx] = json.GetString(data, "user.name")
			}
		}(i)
	}
	wg.Wait()
	fmt.Println(results)
	// 出力: [Alice 30 Alice]
}
```

:::warning 所有権の移転
`SetGlobalProcessor` 後、その Processor のライフサイクルはグローバル管理に委ねられます——手動で `Close()` しては**いけません**。グローバルのクローズロジックと衝突します。終了時に `ShutdownGlobalProcessor()` を呼べばクリーンにクローズされ、リソースも解放されます。
:::

## 並行制限 MaxConcurrency

`Config.MaxConcurrency`（デフォルト 50）は単一 Processor の**ソフト並行上限**です：アトミックカウントのセマフォで進行中の操作数を制限します。上限に達すると、新しい操作は `ErrConcurrencyLimit` を返します（リトライ可能）。

```go
cfg := json.DefaultConfig()
cfg.MaxConcurrency = 100 // 単一 Processor の並行上限を引き上げ
```

- `ErrConcurrencyLimit` は**リトライ可能**な一時的エラーです（[エラー処理](./error-handling#システムエラー)を参照）。
- 並列ストリーム処理（`StreamJSONLParallel`）の worker 数は引数で明示指定され、`MaxConcurrency` に直接束縛されませんが、同じガバナンススロットを共有します。
- `ParallelIterator` の worker 数は `cfg.MaxConcurrency`（デフォルト 50）から取られますが、配列長でクリップされます。

## ベストプラクティスと落とし穴

### 1. Processor を再利用し、リクエストごとに新規作成しない

`Processor` は内部にキャッシュや再帰プロセッサなどの状態を保持します。**同じインスタンスを再利用**してこそキャッシュがヒットします。リクエストごとに `json.New()` するとキャッシュの恩恵を失い、割り当ても増えます。

### 2. インスタンス共有は安全、戻り値コンテナの共有は慎重に

`Processor` は goroutine 間で共有可能です。ただし `Get` が返す `map`/`slice` を複数 goroutine 間で共有して書き換える場合は、呼び出し側が自前でロックする必要があります（または `CacheSharedResults` 有効化後に読み取り専用として扱う）。

### 3. Close でリソースを解放

長時間実行サービスでは明示的に `defer processor.Close()` と `defer iter.Close()` を行い、キャッシュ goroutine とメモリのリークを避けてください。`SetGlobalProcessor` で設定したインスタンスは `ShutdownGlobalProcessor` を使います。

### 4. CPU 集約型だけが並列化に値する

並列化にはスケジューリングと同期のオーバーヘッドがあります。小さい配列（`ParallelThreshold` デフォルト 10 未満）は直列の方が速く、JSONL の行数が多く 1 行の処理が重い場合に並列化の恩恵が顕著です。

### 5. 並列モードでは行順序に注意

`StreamJSONLParallel` は処理順序を保証しません。順序保持が必要な場合は `lineNum` に基づいて対応位置に書き込み、処理完了後に順次消費してください。

## 関連

- [パフォーマンス最適化](./performance) — プロセッサ再利用、一般的な Go 並行パターン、ベンチマーク
- [イテレータ型](../api-reference/iterator) — `ParallelIterator` の完全な API
- [JSONL 処理](../api-reference/processor/jsonl) — 並列 JSONL API 詳細
- [キャッシュと事前解析](./caching) — キャッシュ機構と PreParse 事前解析
- [エラー処理](./error-handling) — `ErrConcurrencyLimit` などのエラー分類
