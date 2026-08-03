---
sidebar_label: "並行性と並列処理"
title: "並行性 - CyberGo JSON | 実戦ガイド"
description: "CyberGo JSON 並行性と並列処理：Processor スレッド安全性、ParallelIterator、StreamJSONLParallel、SetGlobalProcessor と MaxConcurrency で大規模データセットを並列処理。"
sidebar_position: 4
---

# 並行性と並列処理

CyberGo JSON のすべての操作は**並行性安全**で、すぐに使える並列 API（`ParallelIterator`、並列 JSONL ストリーミング）を提供します。このページはスレッド安全性セマンティクス、内蔵並列 API、並行性使用パターンを文書化します。

:::tip ヒント パフォーマンスページとの役割分担
[パフォーマンス最適化](./performance)の「並行処理」節は配列処理を手動で並列化する**汎用 Go パターン**（`sync.WaitGroup` + セマフォ + Worker Pool）を示します。このページは**ライブラリ内蔵**並列 API を文書化し、両ページは相補的です。
:::

## スレッド安全性保証

`Processor` はスレッドセーフな処理エンジンです（ソースコメント: `Processor is the main JSON processing engine with thread safety`）:

- **単一の Processor インスタンスを複数ゴルーチンで共有可能** — すべての公開メソッド（`Get`/`Set`/`Delete`/`Marshal` など）は内部的にアトミック操作と並行性ガバナンス（`beginGovernedOp`/`endGovernedOp`）で保護されます。
- **パッケージレベル関数**（`json.Get`, `json.GetString` など）は1つのグローバル Processor を共有し、デフォルトで並行性安全です。
- **`PreParse` が返す `*ParsedJSON` は並行読み取り可能** — 複数ゴルーチンが同じ `ParsedJSON` に対して同時に `GetFromParsed` を呼べます。

:::warning 警告 共有すべきでないとき
`Processor` は共有可能ですが、**可変な Go コンテナをゴルーチン間で共有しないでください**（例: `Get` が返した `map[string]any` を複数ゴルーチンに渡して変更）。返されたコンテナはデフォルトでコピーなので（`CacheSharedResults` がオンでない限り）、戻り値を変更してもキャッシュに影響しません。ただし1つのコンテナの並行変更には呼び出し元側のロックが必要です。
:::

## ParallelIterator 並列イテレータ

`ParallelIterator` は複数コアにまたがり配列処理を並列化し、ワーカープール、エラー集約、panic リカバリを内蔵しているため手作りのゴルーチンプールより安全です。

### 基本的な並列反復

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

	// ワーカー数の既定は Config.MaxConcurrency（配列長でクランプ）
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

### 並列 Map

`Map` は各要素を並列に変換し、結果は**入力順序を保持**します（各ワーカーが自身のインデックスに書き込むためロック不要）。

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

	// 並列マップ: 各要素 * 10、結果順序は入力と同じ
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

### ParallelIterator API 概要

| API | シグネチャ | 説明 |
|-----|------|------|
| `NewParallelIterator` | `func NewParallelIterator(data []any, cfg ...Config) *ParallelIterator` | イテレータを生成。ワーカー数は `cfg.MaxConcurrency` から取得 |
| `ForEach` | `func (it *ParallelIterator) ForEach(fn func(int, any) error) error` | 並列反復、最初のエラーを返す |
| `ForEachWithContext` | `func (it *ParallelIterator) ForEachWithContext(ctx context.Context, fn func(int, any) error) error` | context キャンセル対応 |
| `ForEachBatch` | `func (it *ParallelIterator) ForEachBatch(batchSize int, fn func(int, []any) error) error` | バッチ単位の並列処理 |
| `Map` | `func (it *ParallelIterator) Map(transform func(int, any) (any, error)) ([]any, error)` | 並列変換、順序保持 |
| `Filter` | `func (it *ParallelIterator) Filter(predicate func(int, any) bool) []any` | 並列フィルタ |
| `Close` | `func (it *ParallelIterator) Close()` | リソース解放（使い終わったら呼ぶ） |

完全なシグネチャと使用法は[イテレータ型](../api-reference/iterator#paralleliterator-型)で確認してください。

:::tip ヒント エラーと panic の扱い
`ForEach` は最初のエラーを返し新しいタスクのディスパッチを停止します。ワーカー内の panic はリカバリ（`recover`）されてエラーに変換されるため、コールバックの panic がプロセスをクラッシュさせることはありません。キャンセルが必要な場合は `ForEachWithContext` を使い、`ctx.Done()` で graceful に終了します。
:::

## 並列 JSONL ストリーム処理

大きな JSONL（NDJSON）ファイルを処理する際、`StreamJSONLParallel` が複数ワーカーで各行を並列処理します。

```go
package main

import (
	"fmt"
	"strings"
	"sync"

	"github.com/cybergodev/json"
)

func main() {
	// JSONL データのシミュレーション（1行に1つの JSON オブジェクト）
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

	// 4ワーカーで各行を並列処理
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
	fmt.Printf("%d件処理、合計スコア %d\n", count, total)
	// 出力: 4件処理、合計スコア 345
}
```

| API | 説明 |
|-----|------|
| `StreamJSONLParallel(reader, workers, fn)` | マルチワーカー並列 JSONL 処理 |
| `StreamJSONLParallelWithContext(ctx, reader, workers, fn)` | 同上、context キャンセル/タイムアウト対応 |
| `StreamJSONLChunked(reader, chunkSize, fn)` | チャンクベース処理、メモリ効率的 |

完全なシグネチャと設定（`JSONLWorkers`/`JSONLChunkSize` など）は[JSONL 処理](../api-reference/processor/jsonl)と[JSONL ストリーミング](../streaming/jsonl)で確認してください。

:::tip ヒント 行の順序
並列モードでもコールバックの `lineNum` は元の行番号を反映しますが、**実行順序は保証されません**。順序保持出力が必要な場合は、事前確保したスライスの `lineNum` 位置に書き込んでください。
:::

## 並行性のためのグローバルプロセッサ

`SetGlobalProcessor` はすべてのパッケージレベル関数に1つのカスタム Processor を共有させます。統一設定（キャッシュパラメータ、フック、セキュリティ制限）が必要なマルチゴルーチンサービスに適しています。

```go
package main

import (
	"fmt"
	"sync"

	"github.com/cybergodev/json"
)

func main() {
	// カスタムグローバルプロセッサ（すべてのパッケージレベル関数が共有、並行性安全）
	cfg := json.DefaultConfig()
	processor, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	json.SetGlobalProcessor(processor) // 以前のグローバル Processor は自動的に閉じられる
	defer json.ShutdownGlobalProcessor() // アプリ終了時にクリーンに終了

	data := `{"user":{"name":"Alice","age":30}}`

	// 複数ゴルーチンがパッケージレベル関数を並行使用（同じグローバル Processor を共有）
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

:::warning 警告 所有権の移転
`SetGlobalProcessor` 後、その Processor のライフサイクルはグローバルが管理します。手動で `Close()` しては**いけません**。さもなくばグローバルのシャットダウンロジックと競合します。終了時に `ShutdownGlobalProcessor()` を呼んでクリーンに終了しリソースを解放してください。
:::

## MaxConcurrency 同時実行制限

`Config.MaxConcurrency`（既定 50）は Processor ごとの**ソフト同時実行上限**です。アトミックカウンティングセマフォが進行中の操作数を制限します。上限に達すると新しい操作は `ErrConcurrencyLimit`（再試行可能）を返します。

```go
cfg := json.DefaultConfig()
cfg.MaxConcurrency = 100 // Processor ごとの同時実行上限を引き上げ
```

- `ErrConcurrencyLimit` は**再試行可能な**一時的エラーです（[エラー処理](./error-handling#システムエラー)を参照）。
- 並列ストリーミング（`StreamJSONLParallel`）のワーカー数は明示的な引数から取得し、`MaxConcurrency` に直接束縛されませんが、同じガバナンススロットを共有します。
- `ParallelIterator` のワーカー数は `cfg.MaxConcurrency`（既定 50）から取得し、配列長でクランプされます。

## ベストプラクティスと落とし穴

### 1. Processor を再利用、リクエストごとに新規作成しない

`Processor` はキャッシュ、再帰プロセッサなどの状態を保持しています。**同じインスタンスを再利用**してこそキャッシュがヒットします。リクエストごとに `json.New()` を呼ぶとキャッシュの恩恵を失い割り当てが増えます。

### 2. インスタンス共有は安全、戻り値コンテナの共有は注意

`Processor` はゴルーチン間で共有可能です。ただし `Get` が返した `map`/`slice` をゴルーチン間で変更する場合は呼び出し元側のロックが必要です（または `CacheSharedResults` で読み取り専用として扱う）。

### 3. Close でリソース解放

長期実行サービスでは明示的に `defer processor.Close()` と `defer iter.Close()` を呼び、キャッシュゴルーチンとメモリリークを避けてください。`SetGlobalProcessor` で設定したインスタンスは代わりに `ShutdownGlobalProcessor` を使います。

### 4. CPU 集約的なときだけ並列化の価値あり

並列処理にはスケジューリングと同期のオーバーヘッドがあります。小さな配列（< `ParallelThreshold`、既定 10）は直列の方が高速です。JSONL の行数が多く行ごとの処理が重いときに並列化の恩恵が明確です。

### 5. 並列モードで順序に注意

`StreamJSONLParallel` は処理順序を保証しません。順序保持結果が必要な場合は `lineNum` 位置に書き込み、順番に消費してください。

## 関連

- [パフォーマンス最適化](./performance) — Processor 再利用、汎用 Go 並行性パターン、ベンチマーク
- [イテレータ型](../api-reference/iterator) — 完全な `ParallelIterator` API
- [JSONL 処理](../api-reference/processor/jsonl) — 並列 JSONL API 詳細
- [キャッシュと事前パース](./caching) — キャッシュメカニズムと PreParse
- [エラー処理](./error-handling) — `ErrConcurrencyLimit` とエラー分類
