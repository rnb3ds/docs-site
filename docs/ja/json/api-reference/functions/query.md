---
sidebar_label: "クエリと取得"
title: "クエリと取得関数 - CyberGo JSON | API リファレンス"
description: "CyberGo JSON クエリと取得：Get/GetString/GetInt 型安全取得、GetTyped[T] ジェネリクス、GetMultiple 一括取得と SafeGet 安全アクセス、JSONPath ワイルドカード・スライス、デフォルト値フォールバック、GetWithContext のタイムアウト中止。"
sidebar_position: 2
---

# クエリと取得関数

json パッケージが提供するクエリと取得の関数。パス式、型安全な取得、バッチ操作をサポートします。

## パスクエリ関数

### Get

シグネチャ：`func Get(jsonStr, path string, cfg ...Config) (any, error)`

パスで任意型の値を取得します。

**パラメータ**

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `jsonStr` | `string` | はい | JSON 文字列 |
| `path` | `string` | はい | パス式 |
| `cfg` | `Config` | いいえ | オプション設定 |

**サンプル**

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	val, err := json.Get(`{"items":[{"name":"test"}]}`, "items[0].name")
	if err != nil {
		panic(err)
	}
	fmt.Println(val) // 出力: test
}
```

### GetWithContext

シグネチャ：`func GetWithContext(ctx context.Context, jsonStr, path string, cfg ...Config) (any, error)`

コンテキスト付きのパス取得。タイムアウトとキャンセル操作をサポートします。`Get` のコンテキスト認識版です。

::: info キャンセルセマンティクス：境界レベルのチェック
Context は**操作開始前**と**終了後**に 1 回ずつチェックされるだけで、解析/ナビゲーションの途中ではチェックされません：

- 開始前にキャンセル/タイムアウト済み：いかなる解析も実行せず、直接 `ctx.Err()`（`context.Canceled` / `context.DeadlineExceeded`）を返す
- 操作完了後にタイムアウトを検出：値の取り出しに成功していても破棄され、同様に `ctx.Err()` を返す
- そのため本関数は**呼び出し境界のガード**に適しています——タイムアウト済みのリクエストで無駄な処理を続けるのを防げます。ただし解析自体を途中で断ち切ることはできず、超大 JSON ドキュメントに対してタイムアウトは 1 回の解析の所要時間の上限を制限しません
:::

```go
package main

import (
	"context"
	"fmt"
	"github.com/cybergodev/json"
	"time"
)

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	val, err := json.GetWithContext(ctx, `{"user":{"name":"Alice"}}`, "user.name")
	if err != nil {
		panic(err)
	}
	fmt.Println(val) // 出力: Alice
}
```

## 型安全取得関数

型安全取得関数は `defaultValue` 可変引数でゼロ値フォールバックを提供します。パスが存在しない、値が null、型変換に失敗した場合に `defaultValue` を返します（未指定の場合は対応する型のゼロ値）。

### GetString

シグネチャ：`func GetString(jsonStr, path string, defaultValue ...string) string`

パスで文字列値を取得します。

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	jsonStr := `{"user": {"name": "CyberGo"}}`

	name := json.GetString(jsonStr, "user.name")
	fmt.Println(name) // 出力: CyberGo

	// 存在しないパスはゼロ値（空文字列）またはカスタムデフォルト値を返す
	nickname := json.GetString(jsonStr, "user.nickname", "不明")
	fmt.Println(nickname) // 出力: 不明
}
```

### GetInt

シグネチャ：`func GetInt(jsonStr, path string, defaultValue ...int) int`

パスで整数値を取得します。

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	jsonStr := `{"pagination": {"count": 42}, "timeout": 30}`

	count := json.GetInt(jsonStr, "pagination.count")
	fmt.Println(count) // 出力: 42

	timeout := json.GetInt(jsonStr, "timeout")
	fmt.Println(timeout) // 出力: 30

	// 存在しないパスはカスタムデフォルト値を返す
	page := json.GetInt(jsonStr, "pagination.page", 1)
	fmt.Println(page) // 出力: 1
}
```

### GetFloat

シグネチャ：`func GetFloat(jsonStr, path string, defaultValue ...float64) float64`

パスで浮動小数点数値を取得します。

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	jsonStr := `{"item": {"price": 19.99}, "rate": 0.85}`

	price := json.GetFloat(jsonStr, "item.price")
	fmt.Println(price) // 出力: 19.99

	rate := json.GetFloat(jsonStr, "rate")
	fmt.Println(rate) // 出力: 0.85

	// 存在しないパスはカスタムデフォルト値を返す
	discount := json.GetFloat(jsonStr, "item.discount", 0.0)
	fmt.Println(discount) // 出力: 0
}
```

### GetBool

シグネチャ：`func GetBool(jsonStr, path string, defaultValue ...bool) bool`

パスでブール値を取得します。

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	jsonStr := `{"feature": {"enabled": true}, "debug": false}`

	enabled := json.GetBool(jsonStr, "feature.enabled")
	fmt.Println(enabled) // 出力: true

	debug := json.GetBool(jsonStr, "debug")
	fmt.Println(debug) // 出力: false

	// 存在しないパスはカスタムデフォルト値を返す
	verbose := json.GetBool(jsonStr, "feature.verbose", false)
	fmt.Println(verbose) // 出力: false
}
```

### GetArray

シグネチャ：`func GetArray(jsonStr, path string, defaultValue ...[]any) []any`

パスで配列を取得します。

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	jsonStr := `{"items": ["apple", "banana", "cherry"]}`

	items := json.GetArray(jsonStr, "items")
	for i, item := range items {
		fmt.Printf("[%d] %v\n", i, item)
	}

	// 存在しないパスはカスタムデフォルト値を返す
	empty := json.GetArray(jsonStr, "tags", []any{"default"})
	fmt.Println(empty) // 出力: [default]
}
```

### GetObject

シグネチャ：`func GetObject(jsonStr, path string, defaultValue ...map[string]any) map[string]any`

パスでオブジェクトを取得します。

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	jsonStr := `{"user": {"profile": {"name": "CyberGo", "level": 5}}}`

	profile := json.GetObject(jsonStr, "user.profile")
	fmt.Println(profile) // map[level:5 name:CyberGo]

	// 存在しないパスはカスタムデフォルト値を返す
	settings := json.GetObject(jsonStr, "user.settings", map[string]any{"theme": "dark"})
	fmt.Println(settings) // 出力: map[theme:dark]
}
```

## ジェネリクス取得関数

### GetTyped[T]

シグネチャ：`func GetTyped[T any](jsonStr, path string, defaultValue ...T) T`

ジェネリクス取得関数。カスタム型をサポートします。パスが存在しない、値が null、型変換に失敗した場合に `defaultValue` を返します（未指定の場合は `T` のゼロ値）。

**命名規約について**：`GetTyped[T]` は `GetAs[T]` と同義のセマンティクスで、JSON 値を取得して指定型 `T` に変換することを意味します。

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

type User struct {
	Name string `json:"name"`
	Age  int    `json:"age"`
}

func main() {
	jsonStr := `{"user": {"name": "CyberGo", "age": 30}}`

	// 型付き構造体の取得
	user := json.GetTyped[User](jsonStr, "user")
	fmt.Printf("Name: %s, Age: %d\n", user.Name, user.Age)

	// 組み込み型のサンプル
	name := json.GetTyped[string](jsonStr, "user.name")
	fmt.Println(name) // 出力: CyberGo

	age := json.GetTyped[int](jsonStr, "user.age")
	fmt.Println(age) // 出力: 30

	// 存在しないパスはカスタムデフォルト値を返す
	email := json.GetTyped[string](jsonStr, "user.email", "unknown@example.com")
	fmt.Println(email) // 出力: unknown@example.com
}
```

## 安全取得関数

### SafeGet（パッケージレベル関数）

シグネチャ：`func SafeGet(jsonStr, path string, cfg ...Config) AccessResult`

型安全な取得操作を実行し、型変換メソッド（`AsString`, `AsInt`, `AsFloat64`, `AsBool`）を提供する `AccessResult` を返します。

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	jsonStr := `{"user": {"name": "CyberGo", "age": 30}}`

	result := json.SafeGet(jsonStr, "user.age")
	if result.Exists {
		age, _ := result.AsInt()
		fmt.Println(age) // 出力: 30
	}

	nameResult := json.SafeGet(jsonStr, "user.name")
	name, _ := nameResult.AsString()
	fmt.Println(name) // 出力: CyberGo
}
```

### SafeGet（Processor メソッド）

シグネチャ：`func (p *Processor) SafeGet(jsonStr, path string, cfg ...Config) AccessResult`

Processor インスタンス経由で型安全な取得操作を実行します。

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

jsonStr := `{"user": {"name": "CyberGo", "age": 30}}`

result := p.SafeGet(jsonStr, "user.age")
if result.Exists {
    age, _ := result.AsInt()
    fmt.Println(age) // 出力: 30
}
```

::: tip 選定：GetTyped 系か SafeGet か
- **Config サポート**：`GetString`/`GetInt`/`GetTyped[T]` などの型付き関数は**Config を受け取れません**——可変引数は `defaultValue` に占有されているためです（Go は 1 関数に可変引数を 1 つしか許可しない）。これらは常にデフォルトプロセッサを使用します。呼び出しごとにセキュリティ制限、検証、キャッシュをカスタマイズする必要がある場合は、`SafeGet(jsonStr, path, cfg)` に切り替えるか、`json.New(cfg)` で専用 Processor を作成してその `GetString` などのメソッドを呼び出してください。
- **変換の緩さ**：型付き関数は緩い変換を行います（文字列 `"42"` を `int` に変換可、ブール `true` を `1` に変換可）。`SafeGet` の `AsInt`/`AsFloat64` はブール入力を拒否し、`AsString` は元の値が string であることを要求します（明示的な文字列化が必要な場合は `AsStringConverted` を使用）。
- **エラーセマンティクス**：型付き関数はデフォルト値/ゼロ値に**黙ってフォールバック**します。`SafeGet` は「存在するか」（`Exists`/`Ok()`）と「変換失敗」（`AsInt`/`AsString` などの変換メソッドが error を返す）の 2 種類の情報を保持し、区別して処理しやすくなっています。
:::

## Processor 拡張メソッド

以下のメソッドはパッケージレベル関数と Processor メソッドの両方として提供されます。

### GetMultiple（パッケージレベル関数）

シグネチャ：`func GetMultiple(jsonStr string, paths []string, cfg ...Config) (map[string]any, error)`

複数パスの値を一括取得します（パッケージレベル関数、Processor 作成不要）。

**戻り値のセマンティクス**

- JSON 全体を**一度だけ**解析し、各パスを評価します（`Get` を複数回呼ぶより高効率）
- 返される map は**パス文字列そのもの**をキーにします（例：`"user.name"`）。入力 `paths` と 1 対 1 対応します
- **部分失敗**：あるパスの取得に失敗した場合、そのキーは map で `nil` になり、同時に関数は最初に遭遇したエラーを返します（`map` と `err` が同時に非 nil）——成功したパスの結果は引き続き使用可能です
- いずれかのパスの**構文が不正**な場合は全体として失敗（`nil, err` を返す）。`paths` が空スライスの場合は空 map と `nil` を返します

```go
jsonStr := `{"user": {"name": "CyberGo", "age": 30, "email": "test@example.com"}}`

paths := []string{"user.name", "user.age", "user.email"}
values, err := json.GetMultiple(jsonStr, paths)
if err != nil {
    panic(err)
}
fmt.Println(values["user.name"]) // 出力: CyberGo
```

**部分失敗のサンプル**（失敗パスは nil、ただし成功パスは引き続き使用可能）：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"user": {"name": "CyberGo", "age": 30}}`

	values, err := json.GetMultiple(data, []string{"user.name", "user.missing"})
	fmt.Println(values["user.name"])    // 出力: CyberGo（成功パスは影響を受けない）
	fmt.Println(values["user.missing"]) // 出力: <nil>（失敗パスは nil）
	fmt.Println(err != nil)             // 出力: true（部分失敗時は err が非 nil）
}
```

### Processor.GetMultiple

シグネチャ：`func (p *Processor) GetMultiple(jsonStr string, paths []string, cfg ...Config) (map[string]any, error)`

複数パスの値を一括取得します。

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

jsonStr := `{"user": {"name": "CyberGo", "age": 30, "email": "test@example.com"}}`

paths := []string{"user.name", "user.age", "user.email"}
values, err := p.GetMultiple(jsonStr, paths)
if err != nil {
    panic(err)
}
fmt.Println(values["user.name"]) // 出力: CyberGo
```

## エラー処理

`Get`/`GetWithContext` の失敗はセンチネルエラーで区別し、`errors.Is` で判別します。型付き関数（`GetString` など）はエラーを返さず、黙ってゼロ値/デフォルト値に落ちます：

```go
package main

import (
	"errors"
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"user": {"name": "Alice"}}`

	if _, err := json.Get(data, "user.age"); errors.Is(err, json.ErrPathNotFound) {
		fmt.Println("パスが存在しないため、デフォルト値ロジックに進む")
	}
	if _, err := json.Get(`{"name": "x"}`, "name[0]"); errors.Is(err, json.ErrTypeMismatch) {
		fmt.Println("型不一致：文字列はインデックスをサポートしない")
	}
	if _, err := json.Get(`{"name": }`, "name"); errors.Is(err, json.ErrInvalidJSON) {
		fmt.Println("入力が正当な JSON ではない")
	}
}
```

::: tip パフォーマンスの入口
同じパスを繰り返しクエリする場合は [`CompilePath`/`GetCompiled`](../processor/query#compilepath) を、同一 JSON の複数パスクエリには [`PreParse`/`GetFromParsed`](../processor/query#preparse) を使用します。いずれも Processor クエリリファレンスを参照してください。
:::

## 関連型

### AccessResult

`SafeGet` が使用する `AccessResult` 構造体のフィールド：

| フィールド | 型 | 説明 |
|------|------|------|
| `Value` | `any` | 取得された値 |
| `Exists` | `bool` | パスが存在するか |
| `Type` | `string` | 検出された値の型 |

**メソッド**：`Ok()` · `Unwrap()` · `UnwrapOr()` · `AsString()` · `AsStringConverted()` · `AsInt()` · `AsFloat64()` · `AsBool()`

詳しくは [AccessResult 型](../types#accessresult-属性アクセス結果)を参照してください。

### Result[T]

`Result[T]` ジェネリクス構造体のフィールド：

| フィールド | 型 | 説明 |
|------|------|------|
| `Value` | `T` | 取得された値 |
| `Exists` | `bool` | 値が見つかったか |
| `Error` | `error` | エラー情報 |

## 関連

- [解析と検証関数](./parse) - Parse, Valid, ValidateSchema などの解析と検証操作
- [バッチ操作関数](./batch) - ProcessBatch バッチ処理
- [変更関数](./modify) - Set, Delete などの変更操作
- [エンコード出力](./output) - Marshal, Unmarshal などのシリアライズ操作
- [補助関数](../helpers) - CompareJSON, MergeJSON などのユーティリティ関数
- [設定オプション](../config) - Config 設定詳解
