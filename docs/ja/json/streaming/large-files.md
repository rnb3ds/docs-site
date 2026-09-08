---
sidebar_label: "大規模ファイルガイド"
title: "大規模ファイル処理 - CyberGo JSON | ガイド"
description: "CyberGo JSON 大容量ファイル処理：ForeachFile、ForeachFileChunked、ForeachFileWithPath、ForeachFileNested のストリーミングメソッドと NDJSONProcessor、StreamIterator でメモリを制御し、ログ分析や ETL 対応。"
sidebar_position: 1
---

# 大規模ファイル処理

大きな JSON ファイル（ログ、設定、データエクスポートなど）をメモリに直接ロードすると、メモリ不足になる可能性があります。json ライブラリは複数の効率的な処理方法を提供しています。

::: tip ヒント
ストリーミング/並列イテレータ（StreamIterator、StreamObjectIterator、BatchIterator、ParallelIterator）の型レベル API リファレンスは [イテレータ](../api-reference/iterator) を、並列処理の実践は [並行・並列処理](../advanced/concurrency) を参照してください。
:::

::: warning
`ForeachFile` と `ForeachFileChunked` はイテレーション前にファイル全体をメモリにロードします。「チャンク」動作はメモリ内データのイテレーション方法にのみ影響し、ファイルの読み込み方法には影響しません。メモリを厳密に制御する必要がある超大規模ファイルの処理には、JSONL 形式と組み合わせて `NDJSONProcessor` を使用するか、`StreamIterator` を使用してください。
:::

## 選択肢

| 方法 | 適用シナリオ | メモリ使用量 |
|------|----------|----------|
| **Processor.ForeachFile** | 構造化イテレーションによるファイル処理 | ファイル全体をロードし、1 件ずつイテレーション |
| **Processor.ForeachFileChunked** | バッチチャンクイテレーション処理 | ファイル全体をロードし、チャンクでイテレーション |
| **NDJSONProcessor** | JSONL ファイルの行単位処理 | メモリ制御可能、真のストリーム処理 |
| **StreamIterator** | 大配列を要素ごとにストリーミングデコード | メモリ使用量は配列長に依存しない |

### ForeachFile シリーズの 4 つのバリアント

`ForeachFile` ファミリーには 4 つのバリアントがあり、いずれもオプションの `Config` を受け取ります（呼び出しごとのパースとセキュリティ検証オプション用）。違いは走査対象とグループ化の方法です:

| バリアント | 走査対象 | 典型的なシナリオ |
|------|----------|----------|
| `ForeachFile` | ルート配列の要素 / ルートオブジェクトのキーと値 | トップレベルがそのままデータコレクションであるログ、エクスポートファイル |
| `ForeachFileWithPath` | 指定パスの配列/オブジェクト | ファイル内の `users`、`orders` などのサブコレクション |
| `ForeachFileChunked` | ルート配列の要素を `chunkSize` ごとにバッチ | データベースへのバッチ書き込み、バッチ配信 |
| `ForeachFileNested` | すべてのネスト構造を再帰走査 | 深さ未知の多層設定、構造の統計 |

4 つすべてがコールバック内で `item.Break()` を返して早期停止できます。`ForeachFileChunked` はルートノードが JSON 配列であることを要求し（そうでない場合 `ErrTypeMismatch` を返す）、`chunkSize <= 0` の場合は 100 として扱われます。

## 統一 API：Processor

### 設定オプション

大規模ファイル処理の設定は `Config` に統合されています：

```go
type Config struct {
    // ... その他の設定 ...

    // 大規模ファイル処理設定
    ChunkSize       int64 // チャンクサイズ（デフォルト 1MB）
    MaxMemory       int64 // 最大メモリ使用量（デフォルト 100MB）
    BufferSize      int   // 読み取りバッファサイズ（デフォルト 64KB）
    SamplingEnabled bool  // サンプリングを有効にするか（デフォルト true）
    SampleSize      int   // サンプリング数（デフォルト 1000）
}
```

### 基本的な使用方法

```go
package main

import (
	"github.com/cybergodev/json"
	"log"
)

func main() {
	// Processor を作成（デフォルト設定を使用）
	processor, err := json.New()
	if err != nil {
		log.Fatal(err)
	}
	defer processor.Close()

	// 方法 1: 1 件ずつ処理（推奨）
	count := 0
	err = processor.ForeachFile("large-data.json", func(key any, item *json.IterableValue) error {
		count++

		// IterableValue の便利なメソッドでフィールドにアクセス
		id := item.GetInt("id")
		name := item.GetString("name")
		email := item.GetString("email")

		// パスでネストされたプロパティにアクセス
		city := item.GetString("profile.city")
		interests := item.GetArray("profile.interests")

		if count%10000 == 0 {
			log.Printf("処理済み %d 件、サンプル: id=%d name=%s email=%s city=%s 興味数=%d",
				count, id, name, email, city, len(interests))
		}
		return nil
	})

	if err != nil {
		log.Fatal(err)
	}
	log.Printf("処理完了、合計 %d 件", count)
}
```

### バッチ処理

```go
// 方法 2: バッチ処理（データベースへのバッチ書き込みに適しています）
err := processor.ForeachFileChunked("large-data.json", 1000, func(chunk []*json.IterableValue) error {
    log.Printf("バッチ処理: %d 件", len(chunk))

    // データベースへバッチ書き込み
    for _, item := range chunk {
        id := item.GetInt("id")
        name := item.GetString("name")
        // ... データを処理
    }
    return nil
})
```

### 中断制御付き

```go
// 方法 3: 中断制御付き（特定のデータを見つけたら停止）
// item.Break() を返すとイテレーションを停止、nil を返すとイテレーションを継続
err := processor.ForeachFile("large-data.json", func(key any, item *json.IterableValue) error {
    id := item.GetInt("id")

    if id == targetID {
        // ターゲットを発見、イテレーションを停止
        fmt.Printf("ターゲット発見: ID=%d, Name=%s\n", id, item.GetString("name"))
        return item.Break() // イテレーションを停止（中断シグナルを返す）
    }

    return nil // イテレーションを継続
})
```

### オブジェクトファイルの処理

```go
// 方法 4: JSON オブジェクトファイルの処理（キー・バリュー構造）
// ファイル形式: {"user1": {...}, "user2": {...}, ...}
err := processor.ForeachFile("config-map.json", func(key any, item *json.IterableValue) error {
    fmt.Printf("Key: %s, Name: %s\n", key, item.GetString("name"))
    return nil
})
```

### カスタム設定

```go
// カスタム大規模ファイル処理設定
cfg := json.DefaultConfig()
cfg.ChunkSize = 10 * 1024 * 1024   // 10MB チャンク
cfg.MaxMemory = 500 * 1024 * 1024  // 500MB メモリ制限
cfg.BufferSize = 128 * 1024        // 128KB バッファ

processor, err := json.New(cfg)
if err != nil {
    panic(err)
}
defer processor.Close()
```

## IterableValue の便利なメソッド

`ForeachFile*` シリーズのメソッドは `IterableValue` インターフェースを提供し、便利なデータアクセスをサポートします：

| メソッド | 説明 | 例 |
|------|------|------|
| `Get(path)` | 値の取得 | `item.Get("field")` |
| `GetString(path)` | 文字列の取得 | `item.GetString("name")` |
| `GetInt(path)` | 整数の取得 | `item.GetInt("id")` |
| `GetFloat64(path)` | 浮動小数点数の取得 | `item.GetFloat64("score")` |
| `GetBool(path)` | 真偽値の取得 | `item.GetBool("active")` |
| `GetArray(path)` | 配列の取得 | `item.GetArray("tags")` |
| `GetObject(path)` | オブジェクトの取得 | `item.GetObject("profile")` |
| `Exists(path)` | フィールドの存在確認 | `item.Exists("email")` |
| `IsNull(path)` | null かどうかの確認 | `item.IsNull("deleted_at")` |
| `IsEmpty(path)` | 空かどうかの確認 | `item.IsEmpty("notes")` |
| `Break()` | 中断シグナルの返却 | `return item.Break()` |

**パスナビゲーションをサポート**

```go
city := item.GetString("profile.address.city")      // ネストされたオブジェクト
firstTag := item.GetString("tags[0]")               // 配列インデックス
lastTag := item.GetString("tags[-1]")               // 負のインデックス（最後の要素）
nested := item.GetString("data.items[0].name")      // 複雑なパス
```

::: warning コールバック返却後に IterableValue の参照を保持しない
`ForeachFile*`（およびメモリ上の `Foreach*`）シリーズは、アロケーションコストを下げるためオブジェクトプールを使用します: **コールバック返却後**、`IterableValue` はプールに返却され、内部データは空にされます。必要な値（`GetString` の結果など）はコールバック内で取り出し、`item` 自体や `item.GetData()` の参照をコールバック外に保存しないでください。
:::

## ストリーム処理設定

`Config` でストリーム処理パラメータを設定します。ストリーム読み込みに直接関わるフィールドとその実際の動作:

| フィールド | デフォルト値（`DefaultConfig`） | 動作 |
|------|--------------------------|------|
| `MaxJSONSize` | 100MB（`DefaultMaxJSONSize`） | ファイル/Reader 読み取りの総バイト上限。`LoadFromFile`/`UnmarshalFromFile`/`LoadFromReader` は**読み取り中**に `io.LimitReader` で強制します（読み取り上限 +1 バイトで打ち切りを検出し、TOCTOU 競合を回避）。`ForeachFile*` シリーズは `LoadFromFile` 経由で自動的に継承。ストリーミングイテレータのコンストラクタに渡した `cfg.MaxJSONSize > 0` の場合はストリーム全体に上限を適用 |
| `BufferSize` | 64KB | `StreamIterator`/`StreamObjectIterator` の読み取りバッファ。`cfg` を渡してもその `BufferSize <= 0` の場合は 32KB にフォールバック |
| `ChunkSize` | 1MB | 大規模ファイルのチャンクサイズ（検証範囲 64KB–100MB） |
| `MaxMemory` | 100MB | 総メモリ上限（検証範囲 10MB–1GB）。JSONL ストリーミングのメモリ上限フォールバックチェーンは `JSONLMaxMemory` → `MaxMemory` |
| `MaxNestingDepthSecurity` | 200（`DefaultMaxNestingDepth`） | JSONL 1 行あたりのネスト深度上限。パース前に各行をチェック |
| `ValidateFilePath` | `true` | フィールドは宣言されていますが、現時点で**スイッチとしては機能しません**: ファイルパスのセキュリティ検証（パストラバーサル、シンボリックリンク、プラットフォーム制限）は読み取り/書き込み時に無条件で実行されます |

`Config.Validate`/`ValidateWithWarnings` は範囲外の値をサイレントに正規の区間へクランプします（例: `BufferSize` は 4KB–1MB へ）。具体的な調整項目は `ValidateWithWarnings` で確認できます。

```go
cfg := json.DefaultConfig()

// 大規模ファイル処理設定
cfg.ChunkSize = 10 * 1024 * 1024   // 10MB チャンク
cfg.MaxMemory = 500 * 1024 * 1024  // 500MB メモリ制限
cfg.BufferSize = 128 * 1024        // 128KB バッファ

processor, err := json.New(cfg)
if err != nil {
    panic(err)
}
defer processor.Close()
```

### StreamLinesInto ジェネリック関数の使用

```go
type User struct {
    Name string `json:"name"`
}

file, _ := os.Open("users.jsonl")
defer file.Close()

_, err := json.StreamLinesInto[User](file, func(lineNum int, user User) error {
    fmt.Printf("処理: %s\n", user.Name)
    return nil
})
```

### 並列処理

並列処理が可能なタスクには、複数の goroutine を使用できます：

```go
package main

import (
	"github.com/cybergodev/json"
	"sync"
)

func main() {
	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	// worker プールを使用
	workers := 4
	items := make(chan any, 100)
	var wg sync.WaitGroup

	// worker を起動
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for item := range items {
				// item を処理（実際のビジネスロジックに置き換え）
				_ = item
			}
		}(i)
	}

	// ストリーム読み込みして配信
	processor.ForeachFile("large-data.json", func(key any, item *json.IterableValue) error {
		items <- item.GetData()
		return nil
	})

	close(items)
	wg.Wait()
}
```

データがすでにメモリ上にある（`[]any`）場合は、ライブラリ組み込みの [ParallelIterator](../api-reference/iterator#paralleliterator-型) 並列イテレータを直接使うこともでき、worker プールの手書きが不要になります。

## ストリーミングイテレータと並列イテレータ

`ForeachFile*` はファイル全体の事前ロードが必要です。ファイルが大きすぎてメモリへの全載が適さない場合は、この節のイテレータに切り替えてください: `StreamIterator`/`StreamObjectIterator` は `io.Reader` 上で直接読みながらデコードし、メモリ使用量はデータ規模に依存しません。型レベルの完全な API は[イテレータ](../api-reference/iterator)を参照してください。

### StreamIterator: 大配列を要素ごとにストリーミングデコード

```go
package main

import (
	"fmt"
	"io"
	"strings"

	"github.com/cybergodev/json"
)

func main() {
	// デモ用の小さいデータ。実際のシナリオでは os.Open("large-array.json") に置き換え
	var src io.Reader = strings.NewReader(`[
		{"id": 1, "name": "Alice"},
		{"id": 2, "name": "Bob"},
		{"id": 3, "name": "Carol"}
	]`)

	iter := json.NewStreamIterator(src)
	count := 0
	for iter.Next() {
		if obj, ok := iter.Value().(map[string]any); ok {
			fmt.Printf("index=%d id=%.0f name=%s\n", iter.Index(), obj["id"], obj["name"])
		}
		count++
	}
	if err := iter.Err(); err != nil {
		fmt.Println("イテレーションエラー:", err)
		return
	}
	fmt.Println("イテレーションした要素数:", count)
	// 出力:
	// index=0 id=1 name=Alice
	// index=1 id=2 name=Bob
	// index=2 id=3 name=Carol
	// イテレーションした要素数: 3
}
```

要点:

- ルートは JSON 配列でなければなりません。トップレベルのスカラーは単一要素として 1 回だけ産出され、トップレベルのオブジェクトは拒否されます（`iter.Err()` がエラーを返す）。
- 渡した `cfg.MaxJSONSize > 0` の場合、**ストリーム全体**の総バイト数に上限を設定します（デフォルトのフォールバックは 100MB）。超過するとイテレーション中にエラーになります。
- 要素を 1 つずつデコードするため、どの時点でもメモリ上にあるのは現在の要素だけです。

### StreamObjectIterator: 大オブジェクトをキー・バリューでストリーミングデコード

```go
package main

import (
	"fmt"
	"strings"

	"github.com/cybergodev/json"
)

func main() {
	src := strings.NewReader(`{
		"users":  {"count": 3},
		"orders": {"count": 128},
		"events": {"count": 9001}
	}`)

	iter := json.NewStreamObjectIterator(src)
	for iter.Next() {
		if obj, ok := iter.Value().(map[string]any); ok {
			fmt.Printf("%s: count=%.0f\n", iter.Key(), obj["count"])
		}
	}
	if err := iter.Err(); err != nil {
		fmt.Println("イテレーションエラー:", err)
		return
	}
	// 出力（map のランダム順ではなく、ドキュメント順）:
	// users: count=3
	// orders: count=128
	// events: count=9001
}
```

トップレベルが 1 つの超大オブジェクトであるシナリオ（設定テーブル、パーティションインデックスなど）に適し、キー・バリューを 1 つずつ処理します。

### BatchIterator: メモリ上の配列のバッチ消費

`BatchIterator` はロード済みの `[]any` を対象に、スライス単位でバッチを返します。中規模の配列を固定バッチで下流に流す（バッチ取り込み、ページング計算）のに適しています:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := []any{
		map[string]any{"id": 1},
		map[string]any{"id": 2},
		map[string]any{"id": 3},
		map[string]any{"id": 4},
		map[string]any{"id": 5},
	}

	// バッチサイズは Config.MaxBatchSize から取得。デフォルト設定では 2000
	cfg := json.DefaultConfig()
	cfg.MaxBatchSize = 2

	iter := json.NewBatchIterator(data, cfg)
	fmt.Println("総バッチ数:", iter.TotalBatches())
	for iter.HasNext() {
		batch := iter.NextBatch()
		fmt.Printf("バッチ [%d:%d)、要素数=%d\n", iter.CurrentIndex()-len(batch), iter.CurrentIndex(), len(batch))
	}
	// 出力:
	// 総バッチ数: 3
	// バッチ [0:2)、要素数=2
	// バッチ [2:4)、要素数=2
	// バッチ [4:5)、要素数=1
}
```

超大規模のバッチ取り込みには [`ForeachFileChunked`](#バッチ処理)（ファイルソース）または [`StreamJSONLChunked`](./jsonl#streamjsonlchunked)（JSONL ソース）を使ってください。両者のチャンクコールバック返却後も同様に `IterableValue` がプールに返却されるため、コールバック内で取り込みを完了する必要があります。

### ParallelIterator: CPU 集約型の並列処理

`ParallelIterator` はワーカープールでメモリ上の配列を並列処理します。ワーカー数は `Config.MaxConcurrency`（デフォルト設定 50）から取得し、データ長に応じて自動的に縮小されます。`Map` の結果は添字で書き込まれ、入力順序を維持します:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	nums := []any{1, 2, 3, 4}

	iter := json.NewParallelIterator(nums)
	defer iter.Close()

	squares, err := iter.Map(func(idx int, val any) (any, error) {
		n, ok := val.(int)
		if !ok {
			return nil, fmt.Errorf("要素 %d は整数ではありません", idx)
		}
		return n * n, nil
	})
	if err != nil {
		fmt.Println("処理エラー:", err)
		return
	}
	fmt.Println("二乗の結果:", squares)
	// 出力: 二乗の結果: [1 4 9 16]
}
```

`ForEach`/`ForEachWithContext` は、いずれかのコールバックがエラーを返すと新しいタスクのディスパッチを停止しそのエラーを返します。コールバックの panic は回復されてエラーになり、プロセスを落とすことはありません。`Close` はすべてのワーカーに終了を通知し、並行に安全に呼び出せます。キャンセル/タイムアウトのあるシナリオでは `ForEachWithContext`/`ForEachBatchWithContext` バリアントを使用します。

## パフォーマンス最適化のヒント

### メモリ制御

```go
// 利用可能なメモリに基づいて設定
cfg := json.DefaultConfig()
cfg.MaxMemory = 500 * 1024 * 1024 // 500MB
cfg.ChunkSize = 10 * 1024 * 1024  // 10MB

processor, err := json.New(cfg)
if err != nil {
    panic(err)
}
defer processor.Close()
```

### ベストプラクティス

1. **ファイルサイズの事前確認**: 処理前にファイルサイズを確認し、適切な戦略を選択
2. **メモリ制限の設定**: OOM を防ぐために `MaxMemory` を使用
3. **バッチコミット**: 一定数蓄積してからデータベースに一括書き込み
4. **エラー処理**: `JSONLContinueOnErr` を実装するか、失敗したエントリを記録
5. **進捗の監視**: 定期的に処理の進捗を出力

## 選択ガイド

| ファイルサイズ | 推奨方法 | 例 |
|---------|---------|------|
| < 10MB | 直接ロード | `json.ParseAny` + `Get` |
| 10-100MB | Processor.ForeachFile | 1 件ずつ処理 |
| 100MB-1GB | Processor.ForeachFileChunked | チャンクイテレーション処理 |
| > 1GB | NDJSONProcessor / JSONL 形式 | 真のストリーム処理、メモリ制御可能 |


## API リファレンス

このセクションでは、大規模ファイル処理 API の関数シグネチャとパラメータ表を要約し、すぐに参照できるようにします。

### Processor メソッド

**ForeachFile**

シグネチャ：`func (p *Processor) ForeachFile(filePath string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

大規模ファイル内の JSON 配列要素を 1 件ずつ処理します。完全な使い方は[基本的な使用方法](#基本的な使用方法)と[中断制御付き](#中断制御付き)を参照してください。

**パラメータ**

| 名前 | 型 | 説明 |
|------|------|------|
| `filePath` | `string` | JSON ファイルパス |
| `fn` | `func(key any, item *IterableValue) error` | 処理コールバック |

**コールバック戻り値**

| 戻り値 | 説明 |
|--------|------|
| `nil` | 次の要素の処理を継続 |
| `item.Break()` | イテレーションを停止、エラーは返さない |
| その他の `error` | イテレーションを停止し、エラーを返す |

**ForeachFileChunked**

シグネチャ：`func (p *Processor) ForeachFileChunked(filePath string, chunkSize int, fn func(chunk []*IterableValue) error, cfg ...Config) (err error)`

大規模ファイルをバッチ処理し、毎回指定した数の要素を処理します。使い方は[バッチ処理](#バッチ処理)を参照してください。

**パラメータ**

| 名前 | 型 | 説明 |
|------|------|------|
| `filePath` | `string` | JSON ファイルパス |
| `chunkSize` | `int` | 1 バッチあたりの要素数 |
| `fn` | `func(chunk []*IterableValue) error` | バッチ処理コールバック |

**ForeachFileWithPath**

シグネチャ：`func (p *Processor) ForeachFileWithPath(filePath, path string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

ファイル内の指定したパスの JSON 配列またはオブジェクトを処理します。

**パラメータ**

| 名前 | 型 | 説明 |
|------|------|------|
| `filePath` | `string` | JSON ファイルパス |
| `path` | `string` | JSON パス式 |
| `fn` | `func(key any, item *IterableValue) error` | 処理コールバック |

```go
// ファイル内の users 配列の各要素を処理
err := p.ForeachFileWithPath("data.json", "users", func(key any, item *json.IterableValue) error {
    fmt.Printf("Name: %s\n", item.GetString("name"))
    return nil
})
```

**ForeachFileNested**

シグネチャ：`func (p *Processor) ForeachFileNested(filePath string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

ファイル内のすべてのネストされた JSON 構造を再帰的に走査します。

```go
// すべてのネストされた要素を再帰的に走査
err := p.ForeachFileNested("data.json", func(key any, item *json.IterableValue) error {
    fmt.Printf("Key: %v, Type: %T\n", key, item.GetData())
    return nil
})
```

## パッケージレベル関数

Processor メソッドとは別に、以下の関数は Processor インスタンスを作成せずに直接呼び出せます。これらは内部でグローバルプロセッサを使用します。

### ForeachFile（パッケージレベル関数）

シグネチャ：`func ForeachFile(filePath string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

ファイルから JSON をロードしてイテレーションします。

```go
err := json.ForeachFile("data.json", func(key any, item *json.IterableValue) error {
    fmt.Printf("[%v] %v\n", key, item.GetData())
    return nil
})
```

### ForeachFileWithPath（パッケージレベル関数）

シグネチャ：`func ForeachFileWithPath(filePath, path string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

ファイルから JSON をロードし、指定パスでイテレーションします。

```go
err := json.ForeachFileWithPath("data.json", "users", func(key any, item *json.IterableValue) error {
    name := item.GetString("name")
    fmt.Printf("ユーザー: %s\n", name)
    return nil
})
```

### ForeachFileChunked（パッケージレベル関数）

シグネチャ：`func ForeachFileChunked(filePath string, chunkSize int, fn func(chunk []*IterableValue) error, cfg ...Config) error`

ファイル内の JSON 配列をチャンク単位でイテレーションします。

```go
err := json.ForeachFileChunked("large_data.json", 100, func(chunk []*json.IterableValue) error {
    for _, item := range chunk {
        processItem(item)
    }
    return nil
})
```

### ForeachFileNested（パッケージレベル関数）

シグネチャ：`func ForeachFileNested(filePath string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

ファイルから JSON をロードし、すべてのネストされた構造を再帰的にイテレーションします。

```go
err := json.ForeachFileNested("config.json", func(key any, item *json.IterableValue) error {
    fmt.Printf("パス: %v, 型: %T\n", key, item.GetData())
    return nil
})
```

## 関連

- [NDJSON プロセッサ](./jsonl) — JSONL/NDJSON ストリーミング処理
- [JSONLWriter](./jsonl#jsonlwriter) — JSONL ライター

## 次のステップ

- [API ドキュメント](../api-reference/) — 完全な API リファレンス
