---
sidebar_label: "ジェネリクス操作"
title: "ジェネリクス操作 - CyberGo JSON | API リファレンス"
description: "CyberGo JSON のジェネリクス API：GetTyped[T] 型付き取得、Result[T] 結果型、AccessResult 動的アクセス。Go 1.18+ ジェネリクスでコンパイル時の型検査を実現し、基本型やカスタム構造体、デフォルト値フォールバック、単一要素配列の自動アンラップに対応します。"
sidebar_position: 10
---

# ジェネリクス操作

json ライブラリはジェネリクスによる型安全操作を提供し、Go 1.18+ のジェネリクス機能でコンパイル時型チェックを実現します。

## GetTyped

シグネチャ：`func GetTyped[T any](jsonStr, path string, defaultValue ...T) T`

JSON から指定型の値を取得します。カスタム型をサポートします。`T` を返し、error はありません。パスが存在しない、または型変換に失敗した場合はゼロ値、または `defaultValue` で指定されたデフォルト値を返します。

**パラメータ**

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `jsonStr` | `string` | はい | JSON 文字列 |
| `path` | `string` | はい | JSON パス |
| `defaultValue` | `...T` | いいえ | オプションのデフォルト値。パスが存在しない、または型変換に失敗したときに返される |

**戻り値**

| 戻り値 | 型 | 説明 |
|--------|------|------|
| 唯一の戻り値 | `T` | 取得された値。パスが存在しない、または型変換に失敗した場合はゼロ値またはデフォルト値 |

**サポートされる型**

- 基本型：`string`, `int`, `int64`, `float64`, `bool`
- スライス型：`[]any`
- マップ型：`map[string]any`
- カスタム構造体

::: tip 単一要素配列の自動アンラップ
ターゲット型が非スライスの場合、取得した値が**ちょうど 1 要素の配列**なら、その要素を自動でアンラップして変換します（`choices.message.content` のような分散パスアクセスに対応するため）。ターゲットがスライス型の場合はアンラップしません。
:::

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"user": {"name": "Alice", "age": 30}}`

	// 文字列の取得
	name := json.GetTyped[string](data, "user.name")
	fmt.Println(name) // 出力: Alice

	// 整数の取得
	age := json.GetTyped[int](data, "user.age")
	fmt.Println(age) // 出力: 30

	// 配列の取得
	arrData := `{"items": [1, 2, 3]}`
	items := json.GetTyped[[]any](arrData, "items")
	fmt.Println(items) // 出力: [1 2 3]

	// デフォルト値を使用
	email := json.GetTyped[string](data, "user.email", "unknown@example.com")
	fmt.Println(email) // 出力: unknown@example.com
}
```

---

## AccessResult

`AccessResult` は動的型アクセスの結果で、動的型処理のための型変換メソッドを提供します。`SafeGet()` で取得します。

### 構造定義

```go
type AccessResult struct {
    Value  any    // 結果値
    Exists bool   // パスが存在するか
    Type   string // 実行時型情報（デバッグ用）
}
```

### メソッド

#### Ok

シグネチャ：`func (r AccessResult) Ok() bool`

値が存在するか判定します。

```go
result := json.SafeGet(data, "user.name")
if result.Ok() {
    // 値が存在する
}
```

#### Unwrap

シグネチャ：`func (r AccessResult) Unwrap() any`

値を取得します。存在しない場合は nil を返します。

```go
value := result.Unwrap()
```

#### UnwrapOr

シグネチャ：`func (r AccessResult) UnwrapOr(defaultValue any) any`

値またはデフォルト値を取得します。

```go
value := result.UnwrapOr("default")
```

#### AsString

シグネチャ：`func (r AccessResult) AsString() (string, error)`

安全に文字列へ変換します。値自体が string 型のときのみ成功します。

```go
result := json.SafeGet(data, "user.name")
name, err := result.AsString()
if err != nil {
    // 型不一致またはパスが存在しない
}
```

#### AsInt

シグネチャ：`func (r AccessResult) AsInt() (int, error)`

安全に整数へ変換します。すべての整数型と float（整数値の場合）をサポートします。**注意：bool は int に変換されません。**

#### AsFloat64

シグネチャ：`func (r AccessResult) AsFloat64() (float64, error)`

安全に浮動小数点数へ変換します。すべての数値型をサポートします。**注意：bool は float64 に変換されません。**

#### AsBool

シグネチャ：`func (r AccessResult) AsBool() (bool, error)`

安全にブール値へ変換します。bool と string 型（"true", "false", "1", "0" など）をサポートします。

### チェーン式型変換メソッド

`AccessResult` は以下の型変換メソッドを提供します：

| メソッド | 戻り型 | 説明 |
|------|----------|------|
| `AsString()` | `(string, error)` | 文字列へ変換（厳格な型チェック） |
| `AsStringConverted()` | `(string, error)` | 任意の型をフォーマットして文字列へ変換 |
| `AsInt()` | `(int, error)` | 整数へ変換（bool は変換しない） |
| `AsFloat64()` | `(float64, error)` | float64 へ変換（bool は変換しない） |
| `AsBool()` | `(bool, error)` | ブール値へ変換 |

### AsString vs AsStringConverted

| メソッド | 動作 | 使用シナリオ |
|------|------|----------|
| `AsString()` | 厳格な型チェック。string 型のみ成功 | 元の型を保証したい場合 |
| `AsStringConverted()` | 任意の型を文字列にフォーマット | 文字列表現が必要な場合 |

```go
// シナリオ：数値または文字列の可能性がある値を取得
result := json.SafeGet(data, "user.id")

// 厳格モード - 値が string のときのみ成功
id, err := result.AsString()

// 緩いモード - 数値も文字列に変換
idStr, err := result.AsStringConverted()
```

---

## StreamLinesInto

シグネチャ：`func StreamLinesInto[T any](reader io.Reader, fn func(lineNum int, data T) error, cfg ...Config) ([]T, error)`

`io.Reader` から JSON を行単位で読み込み、各行を型 `T` に解析してコールバック関数を呼び出します。JSONL 形式の大規模ファイルの処理に適しています。

**パラメータ**

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `reader` | `io.Reader` | はい | データソース |
| `fn` | `func(lineNum int, data T) error` | はい | 行ごとのコールバック関数。行番号と解析済みデータを受け取る |
| `cfg` | `...Config` | いいえ | オプション設定 |

**戻り値**

| 戻り値 | 型 | 説明 |
|--------|------|------|
| 1 番目 | `[]T` | 正常に解析されたすべての結果 |
| 2 番目 | `error` | エラー情報 |

**動作の詳細**（いずれも JSONL 関連 Config フィールドで制御されます。[Config](./config#config-構造体)を参照）：

- 空行はデフォルトでスキップ（`JSONLSkipEmpty: true`）。`JSONLSkipComments: true` の場合は `#`/`//` 始まりの行をスキップ
- ある行の解析失敗：デフォルトでは `line N: <原因>` エラーを返し、結果は nil。`JSONLContinueOnErr: true` の場合はその行をスキップして継続
- コールバックがエラーを返す：即座に停止しそのエラーを返す（結果は nil）。コールバックの panic は捕捉されてエラーに変換され、プロセスは落ちません
- 読み取りバッファと 1 行の上限は `JSONLBufferSize`（64KB）と `JSONLMaxLineSize`（1MB）で制御
- cfg なしの場合はグローバルデフォルトプロセッサを使用（`SetGlobalProcessor` の影響を受ける）。cfg を渡すとその設定でプロセッサが選択されます

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"strings"
)

func main() {
	jsonl := `{"name":"Alice","age":30}
{"name":"Bob","age":25}
{"name":"Charlie","age":35}`

	type Person struct {
		Name string `json:"name"`
		Age  int    `json:"age"`
	}

	reader := strings.NewReader(jsonl)
	results, err := json.StreamLinesInto[Person](reader, func(lineNum int, data Person) error {
		fmt.Printf("%d 行目: %s、%d 歳\n", lineNum, data.Name, data.Age)
		return nil
	})
	if err != nil {
		panic(err)
	}
	fmt.Printf("合計 %d 件のレコードを処理\n", len(results))
}
```

---

## 使用例

### 設定解析

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

type DatabaseConfig struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Database string `json:"database"`
	SSL      bool   `json:"ssl"`
}

func main() {
	config := `{
        "database": {
            "host": "localhost",
            "port": 5432,
            "database": "myapp",
            "ssl": true
        }
    }`

	// 設定を構造体に解析
	dbConfig := json.GetTyped[DatabaseConfig](config, "database")

	fmt.Printf("Host: %s:%d\n", dbConfig.Host, dbConfig.Port)
}
```

### 多型処理

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{
        "name": "Alice",
        "age": 30,
        "active": true,
        "score": 95.5,
        "tags": ["admin", "user"]
    }`

	// 異なる型のジェネリクス取得
	name := json.GetTyped[string](data, "name")
	age := json.GetTyped[int](data, "age")
	active := json.GetTyped[bool](data, "active")
	score := json.GetTyped[float64](data, "score")
	tags := json.GetTyped[[]any](data, "tags")

	fmt.Printf("Name: %s\n", name)
	fmt.Printf("Age: %d\n", age)
	fmt.Printf("Active: %v\n", active)
	fmt.Printf("Score: %.1f\n", score)
	fmt.Printf("Tags: %v\n", tags)
}
```

### エラー処理

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	config := `{"timeout": 30}`

	timeout := json.GetTyped[int](config, "timeout")
	fmt.Printf("Timeout: %d\n", timeout) // 出力: 30

	// パスが存在しない場合、ゼロ値を返す
	retries := json.GetTyped[int](config, "retries")
	fmt.Printf("Retries: %d\n", retries) // 出力: 0（ゼロ値）

	// パスが存在しない場合、デフォルト値を使用
	retries = json.GetTyped[int](config, "retries", 3)
	fmt.Printf("Retries: %d\n", retries) // 出力: 3（デフォルト値）
}
```

---

## パフォーマンスに関する注記

`GetTyped[T]` の変換は 2 段階です：**基本型**（string/int/float64/bool とそのスライス・マップ）は内部のファストパスで直接変換し、**カスタム構造体などの複合型**は「再 Marshal → Unmarshal」の汎用パスにフォールバックするため、型固有の getter（`GetString`、`GetInt` など）よりやや遅くなります。

| メソッド | パフォーマンス | 推奨シナリオ |
|------|------|----------|
| `GetString`, `GetInt` など | 最速（基本型専用） | 性能センシティブ、型が既知 |
| `GetTyped[T]`（基本型） | 速い（高速変換パス） | ジェネリクスコードでの基本型読み取り |
| `GetTyped[T]`（構造体） | 中程度（re-marshal 経由の変換） | 設定解析、一発の読み取り |
| `SafeGet` + `AccessResult` | 中程度 | 動的型処理 |

::: tip
ホットパスで同じ構造体を繰り返し読み取る場合は、パスごとに `GetTyped[Struct]` を呼ぶのではなく、`Parse`/`Unmarshal` で 1 回構造体に解析するか、`GetTyped` を 1 回呼んだ結果を再利用する方が高速です。
:::

---

## Result[T] 型

`Result[T]` は型安全なジェネリクス操作結果で、明示的な型とエラー処理の両方が必要なシナリオに使われます。

### 構造定義

```go
type Result[T any] struct {
    Value  T     // 結果値
    Exists bool  // パスが見つかったか
    Error  error // エラー情報
}
```

### メソッド

| メソッド | 戻り型 | 説明 |
|------|----------|------|
| `Ok()` | `bool` | 結果が有効かチェック（エラーなし且つ見つかった） |
| `Unwrap()` | `T` | 値を返す。失敗時はゼロ値 |
| `UnwrapOr(default T)` | `T` | 値を返す。失敗時はデフォルト値 |

### 使用例

`Result[T]` には「ライブラリ関数が直接返す」入口がありません——自分で**手動構築**するもので、独自のクエリ関数をカプセル化し、「値 + 存在するか + エラー」を明確な戻り値として呼び出し側に渡すのに使われます：

```go
package main

import (
	"errors"
	"fmt"

	"github.com/cybergodev/json"
)

// Result[T] で明確なエラー付きの設定読み取り関数をカプセル化
func readConfig(data, path string) json.Result[string] {
	val, err := json.Get(data, path)
	if err != nil {
		return json.Result[string]{Error: err}
	}
	s, ok := val.(string)
	if !ok {
		return json.Result[string]{Error: fmt.Errorf("%s: %w", path, json.ErrTypeMismatch)}
	}
	return json.Result[string]{Value: s, Exists: true}
}

func main() {
	data := `{"env": "production"}`

	r := readConfig(data, "env")
	if r.Ok() {
		fmt.Println("環境:", r.Unwrap()) // 出力: 環境: production
	}

	missing := readConfig(data, "region")
	fmt.Println(missing.Exists, errors.Is(missing.Error, nil)) // 出力: false true
	fmt.Println(missing.UnwrapOr("cn-north-1"))                // 出力: cn-north-1
}
```

---

## Result[T] と AccessResult の比較

| 特性 | Result[T] | AccessResult |
|------|-----------|---------------------|
| 型安全 | ジェネリクス T | any 型 |
| 存在判定 | `Exists bool` | `Exists bool` |
| エラー処理 | 内蔵 Error フィールド | 型変換メソッドが error を返す |
| メソッドチェーン | 非対応 | チェーン式型変換に対応 |
| 取得方法 | 手動構築（ライブラリ関数の入口なし） | `SafeGet()` |
| 適したシナリオ | 独自のクエリ関数のカプセル化 | 動的型処理 |

### 選定の推奨

- **型が既知でエラー詳細を気にしない**：`GetTyped[T]`（ゼロ値/デフォルト値でフォールバック）
- **動的型**：`AccessResult` と `SafeGet()` を使用
- **チェーン変換が必要**：`AccessResult` を使用
- **統一された戻り形態をカプセル化**：自分の関数の戻り型として `Result[T]` を使用

---

## 関連

- [パッケージ関数](./functions/) - 型固有の getter 関数
- [型定義](./types) - AccessResult の詳細な定義
- [設定](./config) - Config 設定オプション
