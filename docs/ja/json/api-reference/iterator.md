---
sidebar_label: "イテレータとストリーミングイテレータ"
title: "イテレータと IterableValue - CyberGo JSON | API リファレンス"
description: "CyberGo JSON イテレータ型：Iterator 順次走査、IterableValue データアクセス、StreamIterator/StreamObjectIterator ストリーミング、BatchIterator バッチ、ParallelIterator 並列の構築とメソッド。"
sidebar_position: 9
---

# イテレータ型

json パッケージは多様なイテレータ型を提供し、順次走査、ストリーミング処理、バッチ処理、並列処理のシナリオをカバーします。反復**関数**（`Foreach`/`ForeachFile` など）は[パッケージレベル反復関数](./functions/iterate)と [Processor 反復メソッド](./processor/iterate)を参照してください。

## IteratorControl 定数

`IteratorControl` は反復制御フラグを表し、`ForeachWithPathAndControl` と `ForeachWithPathAndIterator` で反復フローを制御するために使われます。

| 定数 | 説明 |
|------|------|
| `IteratorNormal` | 反復を正常に続行（デフォルト値。ゼロ値がこれ） |
| `IteratorContinue` | 反復を続行。`IteratorNormal` と等価（API 対称性のために保留されたエイリアス）——「現在の項目をスキップ」は暗黙的で、反復は常に続行されます |
| `IteratorBreak` | 反復を停止 |

**使用シーン**

| シーン | 推奨戻り値 | 説明 |
|------|------------|------|
| 要素を正常に処理 | `IteratorNormal` | 次の要素の処理を続行 |
| 無効データのフィルタ | `IteratorContinue` | 現在の要素をスキップし、反復は中断しない |
| ターゲット発見後に退出 | `IteratorBreak` | 必要なデータを見つけたら即座に停止 |
| エラー遭遇時の中断 | `IteratorBreak` | 深刻なエラーに遭遇したら反復を停止 |

---

## Iterator 型

`Iterator` は JSON 配列またはオブジェクトを走査するための低レベルイテレータで、`NewIterator` で作成します。

### NewIterator

シグネチャ：`func NewIterator(data any, cfg ...Config) *Iterator`

イテレータインスタンスを作成します。オプションの `cfg` 引数は API の一貫性のために保留されており、現在はイテレータの動作に影響しません。

```go
data := []any{"apple", "banana", "cherry"}
it := json.NewIterator(data)
for it.HasNext() {
    val, _ := it.Next()
    fmt.Println(val)
}
```

::: tip 反復順序は確定的
オブジェクトを走査する場合、キーは**ソート後**の順序で順次生成されます（Go ネイティブの map 走査順序はランダムですが、ここでは確定的な処理をしています）。配列はインデックス順です。`Next()` は配列の場合は要素自体を、オブジェクトの場合は現在のキーに対応する**値**を返します（キーは返しません）。
:::

### メソッド

| メソッド | シグネチャ | 説明 |
|------|------|------|
| `HasNext` | `func (it *Iterator) HasNext() bool` | 追加の要素があるかチェック |
| `Next` | `func (it *Iterator) Next() (any, bool)` | 次の要素を取得 |
| `Reset` | `func (it *Iterator) Reset()` | イテレータの状態とキャッシュをクリアし、再利用に備える |
| `ResetWith` | `func (it *Iterator) ResetWith(data any)` | 状態をクリアし、新しいデータで初期化 |

### Reset

イテレータの状態をクリアし、キャッシュされたキーを解放します。呼び出し後、`ResetWith` で再初期化できます。

```go
it := json.NewIterator(data1)
for it.HasNext() {
    it.Next()
}

it.Reset() // キャッシュをクリア
```

::: warning 並行安全性なし
`Reset`/`ResetWith` は、別の goroutine が進行中の `HasNext()`/`Next()` と並行して呼ぶことはできません。並行走査が必要な場合は、goroutine ごとに独立したイテレータを作成してください。
:::

### ResetWith

イテレータの状態をクリアし、新しいデータで初期化してイテレータを再利用します。並行制約は `Reset` と同じです。

```go
it := json.NewIterator(data1)
// ... data1 を走査 ...

it.ResetWith(data2) // イテレータを再利用して新しいデータを走査
for it.HasNext() {
    val, _ := it.Next()
    fmt.Println(val)
}
```

---

## IterableValue 型

IterableValue は反復中の現在の要素をカプセル化し、便利な値アクセスメソッドを提供します。`Foreach` 系関数のコールバックは `*IterableValue` を受け取ります。

### メソッド

| カテゴリー | メソッド |
|------|------|
| 基本取得 | `GetData` / `Get` / `GetString` / `GetInt` / `GetFloat64` / `GetBool` / `GetArray` / `GetObject` |
| デフォルト値付き取得 | `GetWithDefault` / `GetStringWithDefault` / `GetIntWithDefault` / `GetFloat64WithDefault` / `GetBoolWithDefault` |
| 状態チェック | `Exists` / `IsNull` / `IsNullData` / `IsEmpty` / `IsEmptyData` |
| フロー制御 | `Break` / `ForeachNested` / `Release` |

#### GetData

シグネチャ：`func (iv *IterableValue) GetData() any`

内部データを返します。

#### Get

シグネチャ：`func (iv *IterableValue) Get(path string) any`

パスで値を取得します（ドット表記と配列インデックスをサポート）。

```go
val := iv.Get("user.address.city")
val = iv.Get("users[0].name")
```

#### GetString

シグネチャ：`func (iv *IterableValue) GetString(key string) string`

文字列値を取得します。

```go
name := item.GetString("name")
```

#### GetInt

シグネチャ：`func (iv *IterableValue) GetInt(key string) int`

整数値を取得します。

```go
age := item.GetInt("age")
```

#### GetFloat64

シグネチャ：`func (iv *IterableValue) GetFloat64(key string) float64`

浮動小数点数値を取得します。

```go
price := item.GetFloat64("price")
```

#### GetBool

シグネチャ：`func (iv *IterableValue) GetBool(key string) bool`

ブール値を取得します。

```go
enabled := item.GetBool("enabled")
```

#### GetArray

シグネチャ：`func (iv *IterableValue) GetArray(key string) []any`

配列値を取得します。

```go
items := item.GetArray("items")
```

#### GetObject

シグネチャ：`func (iv *IterableValue) GetObject(key string) map[string]any`

オブジェクト値を取得します。

```go
profile := item.GetObject("profile")
```

#### GetWithDefault

シグネチャ：`func (iv *IterableValue) GetWithDefault(key string, defaultValue any) any`

値を取得します。キーが存在しない場合はデフォルト値を返します。

```go
// オプションフィールドを取得し、欠落時はデフォルト値を使用
timeout := item.GetWithDefault("timeout", 30)
mode := item.GetWithDefault("mode", "default")
```

#### GetStringWithDefault

シグネチャ：`func (iv *IterableValue) GetStringWithDefault(key string, defaultValue string) string`

文字列値を取得します。キーが存在しない場合はデフォルト値を返します。

```go
name := item.GetStringWithDefault("name", "不明")
```

#### GetIntWithDefault

シグネチャ：`func (iv *IterableValue) GetIntWithDefault(key string, defaultValue int) int`

整数値を取得します。キーが存在しない場合はデフォルト値を返します。

```go
age := item.GetIntWithDefault("age", 0)
port := item.GetIntWithDefault("port", 8080)
```

#### GetFloat64WithDefault

シグネチャ：`func (iv *IterableValue) GetFloat64WithDefault(key string, defaultValue float64) float64`

浮動小数点数値を取得します。キーが存在しない場合はデフォルト値を返します。

```go
price := item.GetFloat64WithDefault("price", 0.0)
rate := item.GetFloat64WithDefault("rate", 1.0)
```

#### GetBoolWithDefault

シグネチャ：`func (iv *IterableValue) GetBoolWithDefault(key string, defaultValue bool) bool`

ブール値を取得します。キーが存在しない場合はデフォルト値を返します。

```go
enabled := item.GetBoolWithDefault("enabled", false)
debug := item.GetBoolWithDefault("debug", true)
```

#### Exists

シグネチャ：`func (iv *IterableValue) Exists(key string) bool`

指定キーが存在するかチェックします。

```go
if item.Exists("email") {
    email := item.GetString("email")
    fmt.Printf("メール: %s\n", email)
}
```

#### ForeachNested

シグネチャ：`func (iv *IterableValue) ForeachNested(path string, fn func(key any, item *IterableValue))`

指定パス配下のネスト構造を再帰的に走査します。

#### IsNullData

シグネチャ：`func (iv *IterableValue) IsNullData() bool`

値全体が null かチェックします。

```go
if item.IsNullData() {
    fmt.Println("値は null")
}
```

#### IsNull

シグネチャ：`func (iv *IterableValue) IsNull(key string) bool`

指定キーの値が null かチェックします。

```go
if item.IsNull("optional_field") {
    fmt.Println("オプションフィールドは null")
}
```

#### IsEmptyData

シグネチャ：`func (iv *IterableValue) IsEmptyData() bool`

値全体が空か（nil、空文字列、空配列、空オブジェクト）チェックします。

```go
if item.IsEmptyData() {
    fmt.Println("値は空")
}
```

#### IsEmpty

シグネチャ：`func (iv *IterableValue) IsEmpty(key string) bool`

指定キーの値が空かチェックします。

```go
if item.IsEmpty("tags") {
    fmt.Println("タグリストは空")
}
```

#### Break

シグネチャ：`func (iv *IterableValue) Break() error`

反復停止のシグナルを返します。反復コールバック内で呼び出すと走査を早期終了できます。

```go
// 注意：Break() はコールバックが error を返す反復関数（ForeachWithError、
// ForeachNestedWithError など）でのみ有効です。通常の Foreach コールバックは
// error を返さないため、その中で item.Break() を呼んでも反復は停止しません。
err := json.ForeachNestedWithError(data, func(key any, item *json.IterableValue) error {
    if item.GetString("status") == "stop" {
        // ターゲット発見後に反復を停止
        return item.Break()
    }
    // 処理を続行
    return nil
})
```

#### Release

シグネチャ：`func (iv *IterableValue) Release()`

IterableValue をオブジェクトプールに返却し、内部データ参照を解放します。

```go
json.Foreach(data, func(key any, item *json.IterableValue) {
    // データを処理...
    fmt.Println(item.GetData())
    // 処理完了後に解放し、GC 負荷を軽減
    item.Release()
})
```

::: tip 省略可能な Release
反復関数はコールバックの復帰後、各 `IterableValue` を**自動的に**オブジェクトプールに返却します。コールバック内での明示的な `Release()` 呼び出しは冗長ですが無害です（内部に重複返却防止の保護があります）。コールバック復帰後は内部データがクリアされるため、`*IterableValue` をコールバック外に保存して使い続けては**いけません**——保持する必要がある場合は `GetData()` で取り出したデータをコピーしてください。
:::

### IterableValue 完全サンプル

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"users": [
        {"name": "Alice", "age": 30, "email": null},
        {"name": "Bob", "tags": []}
    ]}`

	err := json.ForeachWithError(data, "users", func(key any, item *json.IterableValue) error {
		idx, _ := key.(int)

		// デフォルト値付き取得
		name := item.GetStringWithDefault("name", "不明")
		age := item.GetIntWithDefault("age", 0)

		// 存在 / null / 空値チェック
		hasEmail := item.Exists("email")
		emailNull := item.IsNull("email")
		tagsEmpty := item.IsEmpty("tags")

		fmt.Printf("[%d] name=%s age=%d emailあり=%v emailがnull=%v tagsが空=%v\n",
			idx, name, age, hasEmail, emailNull, tagsEmpty)

		// Alice を見つけたら早期終了
		if name == "Alice" {
			return item.Break()
		}
		return nil
	})
	if err != nil {
		panic(err)
	}
	// 出力:
	// [0] name=Alice age=30 emailあり=true emailがnull=true tagsが空=true
}
```

---

## StreamIterator 型

StreamIterator はメモリ効率の高いストリーミング反復を提供し、大型 JSON 配列に適します。要素単位で処理し、配列全体をメモリにロードする必要がありません。

### NewStreamIterator

シグネチャ：`func NewStreamIterator(reader io.Reader, cfg ...Config) *StreamIterator`

ストリーミングイテレータを作成します。`Config.BufferSize` でバッファサイズを設定します（デフォルト 32KB、`BufferSize <= 0` の場合は 32KB にフォールバック）。cfg を渡すと `MaxJSONSize` が**ストリーム全体の総バイト数**に適用され、超過するとエラーになります。

```go
file, _ := os.Open("large-array.json")
defer file.Close()

// 設定なし
it := json.NewStreamIterator(file)
for it.Next() {
    val := it.Value()
    fmt.Printf("インデックス %d: %v\n", it.Index(), val)
}
if err := it.Err(); err != nil {
    panic(err)
}

// 設定付き
cfg := json.DefaultConfig()
cfg.BufferSize = 64 * 1024 // 64KB バッファ
it2 := json.NewStreamIterator(file, cfg)
```

::: tip トップレベル入力の形態
`StreamIterator` は JSON **配列**向けです。トップレベルが単一のスカラー（`"hello"`、`42` など）の場合、それを唯一の要素として 1 回だけ返します。トップレベルがオブジェクトやその他の区切り文字で始まる場合、`Next()` は false を返し、`Err()` が「expects a JSON array」エラーを報告します。
:::

### メソッド

| メソッド | シグネチャ | 説明 |
|------|------|------|
| `Next` | `func (si *StreamIterator) Next() bool` | 次の要素へ進む |
| `Value` | `func (si *StreamIterator) Value() any` | 現在の要素を返す |
| `Index` | `func (si *StreamIterator) Index() int` | 現在のインデックスを返す（0 起点） |
| `Err` | `func (si *StreamIterator) Err() error` | 反復中のエラーを返す |

---

## StreamObjectIterator 型

StreamObjectIterator はメモリ効率の高いストリーミング反復を提供し、大型 JSON オブジェクトに適します。

### NewStreamObjectIterator

シグネチャ：`func NewStreamObjectIterator(reader io.Reader, cfg ...Config) *StreamObjectIterator`

ストリーミングオブジェクトイテレータを作成します。`Config.BufferSize`（デフォルト 32KB）と `MaxJSONSize`（ストリーム総バイト数上限）のセマンティクスは `NewStreamIterator` と同じです。

```go
file, _ := os.Open("large-object.json")
defer file.Close()

it := json.NewStreamObjectIterator(file)
for it.Next() {
    fmt.Printf("キー: %s, 値: %v\n", it.Key(), it.Value())
}
if err := it.Err(); err != nil {
    panic(err)
}
```

::: tip トップレベルオブジェクトのみ受け付ける
最初の token が `{` でない場合、`Next()` は直接 false を返して終了します（エラーにはなりません）。キーが文字列でない場合も黙って終了します。読み取りはストリーム内の**出現順**でキー・バリューを返します（ソートしません）。
:::

### メソッド

| メソッド | シグネチャ | 説明 |
|------|------|------|
| `Next` | `func (soi *StreamObjectIterator) Next() bool` | 次のキー・バリューへ進む |
| `Key` | `func (soi *StreamObjectIterator) Key() string` | 現在のキーを返す |
| `Value` | `func (soi *StreamObjectIterator) Value() any` | 現在の値を返す |
| `Err` | `func (soi *StreamObjectIterator) Err() error` | 反復中のエラーを返す |

---

## BatchIterator 型

BatchIterator は大型配列の効率的なバッチ処理に使用され、単一要素処理のオーバーヘッドを削減します。`NewBatchIterator` で作成します。

### NewBatchIterator

シグネチャ：`func NewBatchIterator(data []any, cfg ...Config) *BatchIterator`

バッチイテレータを作成します。`Config.MaxBatchSize` でバッチサイズを設定します（cfg 未渡しまたは `MaxBatchSize <= 0` の場合はデフォルトで 1 バッチ 100 要素）。

::: tip バッチ分割方式
`NextBatch` が返すのは内部配列スライスの**ビュー**（`data[current:end]`）で、データはコピーされません。最終バッチは batchSize に満たない場合があり、ビュー要素の変更は元の配列に影響します。
:::

```go
data := make([]any, 10000)
// データを詰める...

cfg := json.DefaultConfig()
cfg.MaxBatchSize = 100 // 1 バッチ 100 要素
it := json.NewBatchIterator(data, cfg)
for it.HasNext() {
    batch := it.NextBatch()
    // バッチ処理
    processBatch(batch)
    fmt.Printf("%d 個の要素を処理、残り %d\n", len(batch), it.Remaining())
}
```

### メソッド

| メソッド | シグネチャ | 説明 |
|------|------|------|
| `NextBatch` | `func (it *BatchIterator) NextBatch() []any` | 次のバッチの要素を返す。残りバッチがなければ nil |
| `HasNext` | `func (it *BatchIterator) HasNext() bool` | 追加のバッチがあるかチェック |
| `Reset` | `func (it *BatchIterator) Reset()` | イテレータを開始位置にリセット |
| `TotalBatches` | `func (it *BatchIterator) TotalBatches() int` | 総バッチ数を返す（`ceil(len/batchSize)` 切り上げ。batchSize が正でない場合は 0） |
| `CurrentIndex` | `func (it *BatchIterator) CurrentIndex() int` | 現在消費済みの配列位置を返す |
| `Remaining` | `func (it *BatchIterator) Remaining() int` | 残り要素数を返す（消費完了で 0） |

---

## ParallelIterator 型

ParallelIterator は配列の並列処理に使用され、マルチコア CPU で処理を高速化します。

### NewParallelIterator

シグネチャ：`func NewParallelIterator(data []any, cfg ...Config) *ParallelIterator`

並列イテレータを作成します。`Config.MaxConcurrency` でワーカー goroutine 数を設定します（cfg 未渡しまたは `MaxConcurrency <= 0` の場合はデフォルト 4。実際の goroutine 数は `len(data)` を超えず、空データの場合は 1）。

```go
data := make([]any, 10000)
// データを詰める...

cfg := json.DefaultConfig()
cfg.MaxConcurrency = 8 // 8 個のワーカー goroutine
it := json.NewParallelIterator(data, cfg)
err := it.ForEach(func(idx int, val any) error {
    // 各要素を並列処理
    return processItem(idx, val)
})
if err != nil {
    panic(err)
}
```

### ForEach

シグネチャ：`func (it *ParallelIterator) ForEach(fn func(int, any) error) error`

各要素を並列処理し、最初に遭遇したエラーを返します。

```go
err := it.ForEach(func(idx int, val any) error {
    // この関数は複数の goroutine で並列実行される
    return nil
})
```

::: tip エラーと終了のセマンティクス
いずれかのコールバックがエラーを返すと、残りのワーカー goroutine はできるだけ早くディスパッチを停止し、**最初の**エラーを返します。`Close` 後の呼び出しは直接 nil を返します（コールバックは実行されません）。コールバックの panic は捕捉されてエラーに変換され、プロセスは落ちません。
:::

### ForEachWithContext

シグネチャ：`func (it *ParallelIterator) ForEachWithContext(ctx context.Context, fn func(int, any) error) error`

コンテキスト付きの並列処理です。キャンセル操作をサポートし、コンテキストがキャンセルされると `ctx.Err()` を返します。

```go
ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()

err := it.ForEachWithContext(ctx, func(idx int, val any) error {
    select {
    case <-ctx.Done():
        return ctx.Err()
    default:
        return processItem(idx, val)
    }
})
```

### ForEachBatch

シグネチャ：`func (it *ParallelIterator) ForEachBatch(batchSize int, fn func(int, []any) error) error`

並列バッチ処理です。各バッチは単一の goroutine で処理されます。`batchSize <= 0` の場合は 100 として扱います。コールバックは**バッチ番号**（何番目のバッチか）とそのバッチの要素を受け取ります。

```go
err := it.ForEachBatch(100, func(batchIdx int, batch []any) error {
    // 各バッチは 1 つの goroutine で処理される
    return processBatch(batchIdx, batch)
})
```

### ForEachBatchWithContext

シグネチャ：`func (it *ParallelIterator) ForEachBatchWithContext(ctx context.Context, batchSize int, fn func(int, []any) error) error`

コンテキスト付きの並列バッチ処理です。キャンセル時は `ctx.Err()` を、Close 後は nil を返します。

### Map

シグネチャ：`func (it *ParallelIterator) Map(transform func(int, any) (any, error)) ([]any, error)`

各要素を並列変換し、新しいスライスを返します。各ワーカー goroutine は要素インデックスに対応する位置に書き込むため、**結果の順序は入力と一致します**。いずれかの変換でエラーが発生すると `(nil, err)` を返します。

```go
results, err := it.Map(func(idx int, val any) (any, error) {
    if num, ok := val.(float64); ok {
        return num * 2, nil
    }
    return nil, fmt.Errorf("unexpected type at index %d", idx)
})
```

### Filter

シグネチャ：`func (it *ParallelIterator) Filter(predicate func(int, any) bool) []any`

要素を並列フィルタリングし、条件を満たす要素のスライスを返します。**入力順序を維持**します（完了順ではありません）。predicate はエラーを返さず、コールバックの panic は中断ではなくログに記録されます。

```go
even := it.Filter(func(idx int, val any) bool {
    if num, ok := val.(float64); ok {
        return int(num)%2 == 0
    }
    return false
})
```

### Close

シグネチャ：`func (it *ParallelIterator) Close()`

ParallelIterator のリソースを解放します：実行中の goroutine に停止を通知し、終了を待ちます。CAS ベースで実装されており、**安全な重複呼び出し・マルチ goroutine での並行呼び出しが可能**です。

```go
it := json.NewParallelIterator(data, cfg)
defer it.Close()
```

---

## 完全なサンプル

### 大規模ファイルのストリーミング処理

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"os"
)

func main() {
	file, err := os.Open("large-array.json")
	if err != nil {
		panic(err)
	}
	defer file.Close()

	it := json.NewStreamIterator(file)
	count := 0

	for it.Next() {
		val := it.Value()
		// 要素単位の処理、メモリに優しい
		count++
		if count%1000 == 0 {
			fmt.Printf("%d 個の要素を処理済み、現在の値: %v\n", count, val)
		}
	}

	if err := it.Err(); err != nil {
		panic(err)
	}

	fmt.Printf("合計 %d 個の要素を処理\n", count)
}
```

### 並列処理

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"sync/atomic"
)

func main() {
	// JSON 配列を解析
	data := `[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]`
	var arr []any
	json.Unmarshal([]byte(data), &arr)

	// 並列イテレータを作成（4 個のワーカー goroutine）
	cfg := json.DefaultConfig()
	cfg.MaxConcurrency = 4
	it := json.NewParallelIterator(arr, cfg)

	var sum int64

	err := it.ForEach(func(idx int, val any) error {
		if num, ok := val.(float64); ok {
			atomic.AddInt64(&sum, int64(num))
		}
		return nil
	})

	if err != nil {
		panic(err)
	}

	fmt.Printf("合計：%d\n", sum) // 出力: 合計: 55
}
```

### バッチ処理

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// 大規模データセットを作成
	data := make([]any, 1000)
	for i := range data {
		data[i] = map[string]any{"id": i, "value": i * 10}
	}

	// 1 バッチ 100 要素
	cfg := json.DefaultConfig()
	cfg.MaxBatchSize = 100
	it := json.NewBatchIterator(data, cfg)
	batchNum := 0

	for it.HasNext() {
		batch := it.NextBatch()
		batchNum++

		// バッチ処理（データベースへのバッチ書き込みなど）
		fmt.Printf("バッチ %d: %d 個の要素を処理\n", batchNum, len(batch))
	}

	fmt.Printf("総バッチ数：%d\n", it.TotalBatches())
}
```

### Iterator の再利用

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// 初回の走査
	it := json.NewIterator([]any{"a", "b", "c"})
	for it.HasNext() {
		val, _ := it.Next()
		fmt.Println(val)
	}

	// 同じイテレータを再利用して新しいデータを走査し、再割り当てを回避
	it.ResetWith([]any{1, 2, 3, 4})
	for it.HasNext() {
		val, _ := it.Next()
		fmt.Println(val)
	}
}
```

---

## パフォーマンスのヒント

1. **Iterator の再利用** - `Reset`/`ResetWith` で再割り当てを回避。複数回の走査シナリオに適します
2. **大規模データセットにはストリーミングイテレータ** - `StreamIterator`/`StreamObjectIterator` は要素単位処理でメモリに優しい
3. **バッチ処理でオーバーヘッドを削減** - `BatchIterator` はバッチ単位処理で単一要素のオーバーヘッドを下げます
4. **CPU 集約的なタスクは並列処理** - `ParallelIterator` がマルチコアで高速化します
5. **IterableValue の解放** - `Foreach` コールバックで処理完了後に `Release()` を呼び、GC 負荷を軽減

---

## 関連

- [パッケージレベル反復関数](./functions/iterate) - Foreach/ForeachFile などの反復関数
- [Processor 反復メソッド](./processor/iterate) - 対応するプロセッサの反復メソッド
- [大規模ファイル処理](../streaming/large-files) - 大規模ファイル処理ガイドと API リファレンス
- [NDJSON プロセッサ](../streaming/jsonl) - JSONL 処理
