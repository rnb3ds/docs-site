---
sidebar_label: "型定義"
title: "型定義 - CyberGo JSON | API リファレンス"
description: "CyberGo JSON コア型：Result[T] ジェネリクス、AccessResult アクセス、BatchOperation、BatchResult、Schema、Stats、IterableValue、さらに CompiledPath でパスを事前コンパイルでき、完全な型システムを構成します。"
sidebar_position: 5
---

# 型定義

json パッケージは、JSON 操作結果を扱うための多様な型安全な型を提供します。

## Result[T] - 統一結果型

`Result[T]` はジェネリクス操作結果型で、型安全なエラー処理と値アクセスを提供します。

### 構造定義

```go
type Result[T any] struct {
    Value  T     // 結果値
    Exists bool  // 値が見つかったか
    Error  error // エラー（あれば）
}
```

### フィールドの説明

| フィールド | 型 | 説明 |
|------|------|------|
| `Value` | `T` | 結果値。型はジェネリクスパラメータ `T` で決まる |
| `Exists` | `bool` | パスが存在するか（値が見つかったか） |
| `Error` | `error` | 操作エラー（エラーなしの場合は `nil`） |

### メソッド

| メソッド | シグネチャ | 説明 |
|------|------|------|
| `Ok()` | `func (r Result[T]) Ok() bool` | 結果が有効かチェック（エラーなし且つ見つかった） |
| `Unwrap()` | `func (r Result[T]) Unwrap() T` | 値を返す。失敗時はゼロ値 |
| `UnwrapOr()` | `func (r Result[T]) UnwrapOr(defaultValue T) T` | 値またはデフォルト値を返す |

### 使用例

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"user": {"name": "Alice", "age": 30}}`

	// GetTyped で型付き値を取得
	name := json.GetTyped[string](data, "user.name")
	fmt.Printf("名前: %s\n", name)

	// defaultValue 引数でデフォルト値を提供
	nickname := json.GetTyped[string](data, "user.nickname", "未設定")
	fmt.Printf("ニックネーム: %s\n", nickname)

	age := json.GetTyped[int](data, "user.age", 0)
	fmt.Printf("年齢：%d\n", age)
}
```

::: tip 命名規約
- **GetTyped[T]** - 指定型の値を取得し、`T` を返す。`defaultValue` 引数をサポート
- **Result[T]** - 内部結果型。きめ細かなエラー処理が必要なシナリオ向け
:::

---

## CompiledPath - プリコンパイルパス

`CompiledPath` はプリコンパイル済み JSON パスの型エイリアスです。同じパスへの頻繁なアクセスでパス文字列の重複解析を避け、パフォーマンスを向上させます。

### 型定義

```go
type CompiledPath = internal.CompiledPath
```

### 使用シーン

同じパスに対して大量の繰り返し操作が必要な場合（ループ内でのバッチクエリなど）、パスを事前にコンパイルすることで、呼び出しごとのパス文字列の重複解析を避けられます。

### コンパイル関数

#### Processor.CompilePath

シグネチャ：`func (p *Processor) CompilePath(path string) (*CompiledPath, error)`

Processor 経由で JSON パスをプリコンパイルし、以降の操作で再利用できる `*CompiledPath` インスタンスを返します。

```go
processor, err := json.New()
if err != nil {
    panic(err)
}
defer processor.Close()

compiled, err := processor.CompilePath("user.profile.name")
if err != nil {
    panic(err)
}
// 以降の操作で compiled を繰り返し使用可能
val, err := processor.GetCompiled(data, compiled)
```

::: tip パフォーマンスのヒント
高頻度の繰り返しパスアクセスでは、プリコンパイルによりパス解析のオーバーヘッドを大幅に削減できます。バッチ操作やループクエリなどのシナリオに適します。
:::

### メソッド

| メソッド | シグネチャ | 説明 |
|------|------|------|
| `Get` | `func (cp *CompiledPath) Get(data any) (any, error)` | 解析済み JSON データからコンパイルパスで値を取得 |
| `GetFromRaw` | `func (cp *CompiledPath) GetFromRaw(raw []byte) (any, error)` | 生の JSON バイトからコンパイルパスで値を取得（内部でまずデシリアライズしてからナビゲーション） |
| `Exists` | `func (cp *CompiledPath) Exists(data any) bool` | 解析済みデータ内にこのパスの値が存在するかチェック |
| `Len` | `func (cp *CompiledPath) Len() int` | パスのセグメント数を返す |
| `IsEmpty` | `func (cp *CompiledPath) IsEmpty() bool` | パスがセグメントを一切持たない場合に true |
| `Hash` | `func (cp *CompiledPath) Hash() uint64` | コンパイル時に事前計算されたパスハッシュ（FNV-1a）を返す。カスタムキャッシュキーに利用可能 |
| `Path` | `func (cp *CompiledPath) Path() string` | コンパイル時の元のパス文字列を返す |
| `String` | `func (cp *CompiledPath) String() string` | `Path` と等価の文字列表現 |
| `Segments` | `func (cp *CompiledPath) Segments() []PathSegment` | 解析後のパスセグメントを返す（下記 PathSegment の節を参照） |
| `Release` | `func (cp *CompiledPath) Release()` | オブジェクトプールに返却。呼び出し後はこのインスタンスを使用してはならない |

### 使用例

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	cp, err := p.CompilePath("user.name")
	if err != nil {
		panic(err)
	}
	defer cp.Release()

	// 生の JSON バイトから直接値を取得。先に Go 値へ解析する必要はない
	val, err := cp.GetFromRaw([]byte(`{"user": {"name": "CyberGo"}}`))
	if err != nil {
		panic(err)
	}
	fmt.Println(val) // 出力: CyberGo
}
```

::: tip GetFromRaw と PreParse の使い分け
`GetFromRaw` は呼び出しごとに入力バイトを完全にデシリアライズするため、単発クエリに適します。同じドキュメントに複数回クエリする場合は、`PreParse` で `ParsedJSON` を取得してから `Get` を呼ぶか、`GetFromParsed` を直接使ってください。重複解析を避けられます。
:::

---

## PathSegment - パスセグメント

`PathSegment` は解析後の単一パスセグメントを表します。[`PathParser`](./interfaces#pathparser) インターフェースの `ParsePath` メソッドの戻り要素であり、`CompiledPath` の `Segments` メソッドでも取得できます。

### 型定義

```go
type PathSegment = internal.PathSegment
```

::: warning 内部実装の型エイリアス
`CompiledPath` と同様に、`PathSegment` は `internal.PathSegment` の型エイリアスです：フィールド型の PathSegmentType、PathSegmentFlags、およびセグメント型定数（PropertySegment など）はルートパッケージからエクスポートされていません。セグメント型の判定には `TypeString`、`IsArrayAccess` などのアクセスメソッドを使い、`Type` フィールドと内部定数を直接比較しないでください。
:::

### フィールド説明

| フィールド | 型 | 説明 |
|------|------|------|
| `Type` | PathSegmentType | セグメント型の列挙（プロパティ/配列インデックス/スライス/ワイルドカードなど。判定は `TypeString` を使用） |
| `Key` | `string` | プロパティセグメントと抽出セグメントで使用されるキー名 |
| `Index` | `int` | 配列インデックスセグメントの添字。スライスセグメントの開始値（設定されているかは `HasStart`） |
| `End` | `int` | スライスセグメントの終了値（設定されているかは `HasEnd`） |
| `Step` | `int` | スライスセグメントのステップ（設定されているかは `HasStep`） |
| `Flags` | PathSegmentFlags | ビットフラグ。負インデックス、ワイルドカード、フラット抽出、開始/終了/ステップの設定有無を記録 |

### メソッド

| メソッド | シグネチャ | 説明 |
|------|------|------|
| `TypeString` | `func (ps PathSegment) TypeString() string` | セグメント型名：`property` / `array` / `slice` / `wildcard` / `recursive` / `filter` / `extract` / `append` |
| `String` | `func (ps PathSegment) String() string` | セグメントのパス表現（`name`、`[0]`、`[1:3]`、`[*]` など） |
| `IsArrayAccess` | `func (ps PathSegment) IsArrayAccess() bool` | 配列インデックスセグメント、スライスセグメント、ワイルドカードセグメントで true |
| `IsWildcardSegment` | `func (ps *PathSegment) IsWildcardSegment() bool` | ワイルドカードセグメント（`[*]`）で true |
| `IsFlatExtract` | `func (ps *PathSegment) IsFlatExtract() bool` | フラット抽出セグメントで true |
| `IsNegativeIndex` | `func (ps *PathSegment) IsNegativeIndex() bool` | 配列インデックスが負数（`[-1]` など）で true |
| `HasStart` | `func (ps *PathSegment) HasStart() bool` | スライスセグメントに開始値が設定されているか |
| `HasEnd` | `func (ps *PathSegment) HasEnd() bool` | スライスセグメントに終了値が設定されているか |
| `HasStep` | `func (ps *PathSegment) HasStep() bool` | スライスセグメントにステップが設定されているか |
| `GetStart` | `func (ps *PathSegment) GetStart() (int, bool)` | 開始値と設定有無を返す（未設定時は 0, false） |
| `GetEnd` | `func (ps *PathSegment) GetEnd() (int, bool)` | 終了値と設定有無を返す |
| `GetStep` | `func (ps *PathSegment) GetStep() (int, bool)` | ステップと設定有無を返す |
| `GetArrayIndex` | `func (ps PathSegment) GetArrayIndex(arrayLength int) (int, error)` | 配列添字を解決：負インデックスは正方向に変換（`-1` は末尾要素）。範囲外または配列インデックスセグメントでなければ error |

### 使用例

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	cp, err := p.CompilePath("users[0].name")
	if err != nil {
		panic(err)
	}
	defer cp.Release()

	// Segments は解析後のパスセグメントを返す
	for _, seg := range cp.Segments() {
		fmt.Printf("セグメント %s（%s）\n", seg.String(), seg.TypeString())
	}

	// 配列インデックスセグメント：GetArrayIndex で実際の添字を解決（負インデックスは正方向へ変換、範囲外は error）
	arrSeg := cp.Segments()[1]
	idx, err := arrSeg.GetArrayIndex(1)
	if err != nil {
		panic(err)
	}
	fmt.Println("配列添字：", idx)
	// 出力:
	// セグメント users（property）
	// セグメント [0]（array）
	// セグメント name（property）
	// 配列添字：0
}
```

---

## AccessResult - 属性アクセス結果

`AccessResult` は安全な属性アクセスの結果で、チェーン式型変換を提供します。

### 構造定義

```go
type AccessResult struct {
    Value  any    // 結果値
    Exists bool   // パスが存在するか
    Type   string // 実行時型情報（デバッグ用）
}
```

### フィールドの説明

| フィールド | 型 | 説明 |
|------|------|------|
| `Value` | `any` | 結果値 |
| `Exists` | `bool` | パスが存在するか |
| `Type` | `string` | 実行時型情報（デバッグ用） |

### 作成メソッド

#### Processor.SafeGet

シグネチャ：`func (p *Processor) SafeGet(jsonStr, path string, cfg ...Config) AccessResult`

属性を安全に取得し、チェーン式型変換のための `AccessResult` を返します。

パッケージレベル関数 `SafeGet` も使用できます：

シグネチャ：`func SafeGet(jsonStr, path string, cfg ...Config) AccessResult`

```go
processor, err := json.New()
if err != nil {
    panic(err)
}
defer processor.Close()

result := processor.SafeGet(data, "user.age")

if !result.Exists {
    fmt.Println("パスが存在しません")
    return
}

// 型を確認
fmt.Println("型：", result.Type)
```

### チェーン式型変換メソッド

| メソッド | 戻り型 | 説明 |
|------|----------|------|
| `Unwrap()` | `any` | 値を返す。存在しない場合は nil |
| `UnwrapOr(defaultValue)` | `any` | 値またはデフォルト値を返す |
| `AsString()` | `(string, error)` | 文字列へ変換（厳格な型チェック） |
| `AsStringConverted()` | `(string, error)` | フォーマットして文字列へ変換 |
| `AsInt()` | `(int, error)` | 整数へ変換（bool は変換しない） |
| `AsFloat64()` | `(float64, error)` | float64 へ変換（bool は変換しない） |
| `AsBool()` | `(bool, error)` | ブール値へ変換 |
| `Ok()` | `bool` | パスが存在するかチェック |

::: warning 注意
`AsInt64()`, `AsArray()`, `AsObject()` メソッドは削除されました。これらの型を取得するには `GetTyped[T]` を使用してください。
:::

```go
result := processor.SafeGet(data, "user.profile")

// チェーン呼び出し
name, _ := result.AsString()
email, _ := result.AsString()
age, _ := result.AsInt()
price, _ := result.AsFloat64()
active, _ := result.AsBool()

// 配列やオブジェクト型が必要な場合は GetTyped を使用
arr := json.GetTyped[[]any](data, "items")
obj := json.GetTyped[map[string]any](data, "user.profile")
```

### 使用例

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	data := `{"user": {"name": "Alice", "age": 30, "active": true}}`

	// 安全に取得して変換
	result := processor.SafeGet(data, "user.age")

	// AccessResult メソッドを直接使用
	age, err := result.AsInt()
	if err != nil {
		panic(err)
	}
	fmt.Printf("年齢：%d\n", age)

	// 存在しないパスを取得
	missing := processor.SafeGet(data, "user.nickname")
	if !missing.Exists {
		fmt.Println("ニックネームは存在しません")
	}
}
```

---

## Schema - JSON Schema 型

`Schema` は JSON データの構造検証ルールの定義に使用され、JSON Schema Draft 7 のサブセットをサポートします。

### 構造定義

```go
type Schema struct {
    Type                 string            `json:"type,omitempty"`
    Properties           map[string]*Schema `json:"properties,omitempty"`
    Items                *Schema           `json:"items,omitempty"`
    Required             []string          `json:"required,omitempty"`
    MinLength            int               `json:"minLength,omitempty"`
    MaxLength            int               `json:"maxLength,omitempty"`
    Minimum              float64           `json:"minimum,omitempty"`
    Maximum              float64           `json:"maximum,omitempty"`
    Pattern              string            `json:"pattern,omitempty"`
    Format               string            `json:"format,omitempty"`
    AdditionalProperties bool              `json:"additionalProperties,omitempty"`
    MinItems             int               `json:"minItems,omitempty"`
    MaxItems             int               `json:"maxItems,omitempty"`
    UniqueItems          bool              `json:"uniqueItems,omitempty"`
    Enum                 []any             `json:"enum,omitempty"`
    Const                any               `json:"const,omitempty"`
    MultipleOf           float64           `json:"multipleOf,omitempty"`
    ExclusiveMinimum     bool              `json:"exclusiveMinimum,omitempty"`
    ExclusiveMaximum     bool              `json:"exclusiveMaximum,omitempty"`
    Title                string            `json:"title,omitempty"`
    Description          string            `json:"description,omitempty"`
    Default              any               `json:"default,omitempty"`
    Examples             []any             `json:"examples,omitempty"`
}
```

### Schema の作成

#### 直接構築

```go
schema := &json.Schema{
    Type:     "object",
    Required: []string{"name", "email"},
    Properties: map[string]*json.Schema{
        "name":  {Type: "string"},
        "email": {Type: "string", Format: "email"},
        "age":   {Type: "number"},
    },
}
```

::: warning 2 つの厳格な制限
- `Type` がサポートするのは `object`/`array`/`string`/`number`/`boolean`/`null` の 6 値のみです——JSON Schema の `integer` は**サポートされません**（整数も `float64` に解析されるため、`"number"` と書いてください）。
- `MinLength`/`MaxLength`/`Minimum`/`Maximum`/`MinItems`/`MaxItems`/`ExclusiveMinimum`/`ExclusiveMaximum` は構造体リテラルでの代入では**有効になりません**。`NewSchemaWithConfig` のポインタフィールドで有効化する必要があります。詳しくは [Schema 検証](./schema#schema-の作成方法)を参照してください。
:::

#### NewSchemaWithConfig を使用

```go
cfg := json.DefaultSchemaConfig()
cfg.Type = "object"
cfg.Required = []string{"name", "email"}
schema := json.NewSchemaWithConfig(cfg)
```

#### DefaultSchema を使用

シグネチャ：`func DefaultSchema() *Schema`

デフォルト設定を含む空の Schema インスタンスを返します。

```go
schema := json.DefaultSchema()
schema.Type = "object"
schema.Required = []string{"id"}
```

### SchemaConfig 構造

```go
type SchemaConfig struct {
    Type                 string
    Properties           map[string]*Schema
    Items                *Schema
    Required             []string
    MinLength            *int
    MaxLength            *int
    Minimum              *float64
    Maximum              *float64
    Pattern              string
    Format               string
    AdditionalProperties *bool
    MinItems             *int
    MaxItems             *int
    UniqueItems          bool
    Enum                 []any
    Const                any
    MultipleOf           *float64
    ExclusiveMinimum     *bool
    ExclusiveMaximum     *bool
    Title                string
    Description          string
    Default              any
    Examples             []any
}
```

| フィールドカテゴリー | フィールド | 型 | 説明 |
|----------|------|------|------|
| 直接フィールド | `Type`/`Pattern`/`Format`/`UniqueItems`/`Enum`/`Const`/`Title`/`Description`/`Default`/`Examples` | 値型 | 直接代入すれば有効 |
| 構造フィールド | `Properties`/`Items`/`Required` | 値型 | 子 Schema、必須プロパティ |
| ポインタフィールド | `MinLength`/`MaxLength`/`Minimum`/`Maximum`/`MinItems`/`MaxItems`/`MultipleOf`/`ExclusiveMinimum`/`ExclusiveMaximum` | `*int`/`*float64`/`*bool` | **非 nil のときのみ対応する制約が有効**（ポインタを渡すのは「未設定」と「ゼロ値」を区別するため） |
| ポインタフィールド | `AdditionalProperties` | `*bool` | 非 nil で有効。nil の場合のデフォルトは `true` |

#### DefaultSchemaConfig

シグネチャ：`func DefaultSchemaConfig() SchemaConfig`

デフォルト値付きの SchemaConfig を返します（`AdditionalProperties` が `true` を指し、残りはゼロ値）。

```go
cfg := json.DefaultSchemaConfig()
cfg.Type = "object"
cfg.Required = []string{"name", "email"}
schema := json.NewSchemaWithConfig(cfg)
```

### 使用例

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// 長さ/範囲制約は NewSchemaWithConfig のポインタフィールドで有効化
	minLen, maxLen := 1, 100
	minAge, maxAge := 0.0, 150.0

	nameCfg := json.DefaultSchemaConfig()
	nameCfg.Type = "string"
	nameCfg.MinLength = &minLen
	nameCfg.MaxLength = &maxLen

	ageCfg := json.DefaultSchemaConfig()
	ageCfg.Type = "number" // 数値は常に "number"（"integer" は非対応）
	ageCfg.Minimum = &minAge
	ageCfg.Maximum = &maxAge

	schema := &json.Schema{
		Type:     "object",
		Required: []string{"name", "email"},
		Properties: map[string]*json.Schema{
			"name":  json.NewSchemaWithConfig(nameCfg),
			"email": {Type: "string", Format: "email"},
			"age":   json.NewSchemaWithConfig(ageCfg),
		},
	}

	// JSON を検証
	data := `{"name": "Alice", "email": "alice@example.com", "age": 30}`
	errors, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}

	if len(errors) > 0 {
		for _, e := range errors {
			fmt.Printf("検証エラー [%s]: %s\n", e.Path, e.Message)
		}
	} else {
		fmt.Println("検証を通過")
	}
	// 出力: 検証を通過
}
```

---

## ValidationError

Schema 検証エラー型。

### 構造定義

```go
type ValidationError struct {
    Path    string `json:"path"`    // エラーが発生したパス
    Message string `json:"message"` // エラーメッセージ
}
```

### フィールドの説明

| フィールド | 型 | 説明 |
|------|------|------|
| `Path` | `string` | 検証エラーが発生した JSON パス |
| `Message` | `string` | 検証失敗の説明メッセージ |

### メソッド

#### Error

シグネチャ：`func (ve *ValidationError) Error() string`

error インターフェースを実装します。

```go
for _, e := range errors {
    fmt.Println(e.Error())
}
```

---

## BatchOperation

バッチ操作定義。`ProcessBatch` の入力単位です。

### 構造定義

```go
type BatchOperation struct {
    Type    string `json:"type"`     // 操作型："get", "set", "delete", "validate"
    JSONStr string `json:"json_str"` // JSON データ文字列
    Path    string `json:"path"`     // ターゲットパス
    Value   any    `json:"value"`    // Set 操作の値
    ID      string `json:"id"`       // 操作識別子
}
```

### フィールド説明

| フィールド | 型 | 説明 |
|------|------|------|
| `Type` | `string` | 操作型。`"get"`、`"set"`、`"delete"`、`"validate"` のみサポート。その他の値は対応する `BatchResult.Error` に `unknown operation type` が報告される |
| `JSONStr` | `string` | この操作が対象とする JSON 文字列（各操作が独立して保持） |
| `Path` | `string` | ターゲットパス |
| `Value` | `any` | `"set"` 操作のみが使用する書き込み値 |
| `ID` | `string` | 操作識別子。`BatchResult.ID` にそのまま書き戻され、結果の照合に使われる |

::: tip バッチ上限
`ProcessBatch` の操作数が `Config.MaxBatchSize`（デフォルト 2000）を超えると、全体が `ErrSizeLimit` エラーを返します。`"validate"` 操作の `BatchResult.Result` は `map[string]any{"valid": bool}` です。
:::

---

## BatchResult

バッチ操作結果。

### 構造定義

```go
type BatchResult struct {
    ID     string `json:"id"`     // 操作識別子（BatchOperation.ID に対応）
    Result any    `json:"result"` // 操作結果
    Error  error  `json:"error"`  // エラー（あれば）
}
```

### フィールド説明

| フィールド | 型 | 説明 |
|------|------|------|
| `ID` | `string` | `BatchOperation.ID` に対応し、入力順序と 1 対 1 対応 |
| `Result` | `any` | 操作結果。`"get"` は取得した値、`"set"`/`"delete"` は変更後の JSON 文字列、`"validate"` は `map[string]any{"valid": bool}` |
| `Error` | `error` | この単一操作のエラー。**項目ごとに返される**。1 件の失敗でバッチ全体は中断されない（継続するかは実装内部が項目ごとに実行するため） |

---

## WarmupResult

キャッシュウォームアップ結果。`WarmupCache` が返します。

### 構造定義

```go
type WarmupResult struct {
    TotalPaths  int      `json:"total_paths"`            // 総パス数
    Successful  int      `json:"successful"`             // ウォームアップ成功数
    Failed      int      `json:"failed"`                 // 失敗数
    SuccessRate float64  `json:"success_rate"`           // 成功率
    FailedPaths []string `json:"failed_paths,omitempty"` // 失敗パスのリスト
}
```

### フィールド説明

| フィールド | 型 | 説明 |
|------|------|------|
| `TotalPaths` | `int` | ウォームアップ対象のパス総数 |
| `Successful` | `int` | キャッシュ書き込みに成功したパス数 |
| `Failed` | `int` | ウォームアップに失敗したパス数 |
| `SuccessRate` | `float64` | 成功率。**パーセント 0–100**（0–1 ではない） |
| `FailedPaths` | `[]string` | 失敗パスのリスト（すべて成功した場合は nil） |

::: warning 全失敗時は error を返す
`WarmupCache` は**すべてのパスが失敗した**場合、`WarmupResult` に加えて非 nil の error（最後のエラーを含む）を返します。キャッシュが無効（`EnableCache: false`）の場合は直接エラーを返します。
:::

---

## ParsedJSON

事前解析された JSON ドキュメント。複数回のクエリ操作に再利用できます。

### 構造定義

`ParsedJSON` の内部フィールドはエクスポートされず、メソッド経由でアクセスします。

```go
type ParsedJSON struct {
    // 内部フィールド（非エクスポート）
    // Data() メソッドで解析済みデータを取得
}
```

### メソッド

| メソッド | シグネチャ | 説明 |
|------|------|------|
| `Data` | `func (p *ParsedJSON) Data() any` | 内部の解析済みデータを返す。`Release` 後は nil |
| `Release` | `func (p *ParsedJSON) Release()` | 内部データを nil にし、`ParsedJSON` 自体が参照されていても解析ツリーがガベージコレクション可能になる |

```go
processor, err := json.New()
if err != nil {
    panic(err)
}
defer processor.Close()

// JSON を事前解析
parsed, err := processor.PreParse(`{"user": {"name": "Alice", "age": 30}}`)
if err != nil {
    panic(err)
}

// 事前解析結果に複数回クエリ
name, _ := processor.GetFromParsed(parsed, "user.name")
age, _ := processor.GetFromParsed(parsed, "user.age")
```

### 使用シーン

| シーン | 説明 |
|------|------|
| 高頻度クエリ | 同一 JSON への複数回クエリで重複解析を回避 |
| バッチパス取得 | `GetMultiple` で複数パスを一括取得 |
| パフォーマンス最適化 | 事前解析によりクエリ性能が大幅に向上 |

::: tip パフォーマンスのヒント
同じ JSON 文字列に複数回クエリする必要があるシナリオでは、`PreParse` による事前解析で重複解析のオーバーヘッドを避け、パフォーマンスを大幅に向上させられます。
:::

---

## Stats

プロセッサ統計情報。パッケージレベルの `GetStats()` または `Processor.GetStats()` で取得します。

### 構造定義

```go
type Stats struct {
    CacheSize        int64         `json:"cache_size"`        // 現在のキャッシュサイズ
    CacheMemory      int64         `json:"cache_memory"`      // キャッシュメモリ使用量（バイト）
    MaxCacheSize     int           `json:"max_cache_size"`    // 最大キャッシュサイズ
    HitCount         int64         `json:"hit_count"`         // キャッシュヒット数
    MissCount        int64         `json:"miss_count"`        // キャッシュミス数
    HitRatio         float64       `json:"hit_ratio"`         // キャッシュヒット率
    CacheTTL         time.Duration `json:"cache_ttl"`         // キャッシュ有効期限
    CacheEnabled     bool          `json:"cache_enabled"`     // キャッシュが有効か
    IsClosed         bool          `json:"is_closed"`         // プロセッサが閉じられているか
    MemoryEfficiency float64       `json:"memory_efficiency"` // メモリ効率
    OperationCount   int64         `json:"operation_count"`   // 操作総数
    ErrorCount       int64         `json:"error_count"`       // エラー総数
}
```

### フィールド説明

| フィールド | 型 | 説明 |
|------|------|------|
| `CacheSize` | `int64` | 現在のキャッシュエントリ数 |
| `CacheMemory` | `int64` | キャッシュのメモリ使用量の推定（バイト） |
| `MaxCacheSize` | `int` | 設定されたキャッシュエントリ上限（`Config.MaxCacheSize`） |
| `HitCount` | `int64` | キャッシュヒット回数 |
| `MissCount` | `int64` | キャッシュミス回数 |
| `HitRatio` | `float64` | ヒット率（0–1） |
| `CacheTTL` | `time.Duration` | 現在のキャッシュエントリ TTL |
| `CacheEnabled` | `bool` | キャッシュが有効か |
| `IsClosed` | `bool` | プロセッサが `Close` 済みか |
| `MemoryEfficiency` | `float64` | メモリ効率指標（0–1） |
| `OperationCount` | `int64` | プロセッサの累積操作回数 |
| `ErrorCount` | `int64` | プロセッサの累積エラー数 |

---

## SecurityLimits

`SecurityLimits` は Config のセキュリティ関連制限フィールドをまとめたものです。これらのフィールドの読み取り専用スナップショットビューです（フィールドは 1 対 1 対応）。

### 構造定義

```go
type SecurityLimits struct {
    MaxNestingDepth           int   `json:"max_nesting_depth"`
    MaxSecurityValidationSize int64 `json:"max_security_validation_size"`
    MaxObjectKeys             int   `json:"max_object_keys"`
    MaxArrayElements          int   `json:"max_array_elements"`
    MaxJSONSize               int64 `json:"max_json_size"`
    MaxPathDepth              int   `json:"max_path_depth"`
}
```

### Config フィールドとのマッピング

| SecurityLimits フィールド | 元となる Config フィールド |
|--------------------|------------------|
| `MaxNestingDepth` | `MaxNestingDepthSecurity` |
| `MaxSecurityValidationSize` | `MaxSecurityValidationSize` |
| `MaxObjectKeys` | `MaxObjectKeys` |
| `MaxArrayElements` | `MaxArrayElements` |
| `MaxJSONSize` | `MaxJSONSize` |
| `MaxPathDepth` | `MaxPathDepth` |

この型はライブラリ内部がセキュリティ制限をまとめる際に使用されます（ゼロ値は nil Config を意味します）。フィールドの意味と値の範囲は [Config](./config#config-構造体)を参照してください。

---

## HealthStatus

ヘルス状態情報。パッケージレベルの `GetHealthStatus()` または `Processor.GetHealthStatus()` で取得します。

### 構造定義

```go
type HealthStatus struct {
    Timestamp time.Time              `json:"timestamp"` // チェックのタイムスタンプ
    Healthy   bool                   `json:"healthy"`   // 健康かどうか
    Checks    map[string]CheckResult `json:"checks"`    // 各チェック項目の結果
}
```

### フィールド説明

| フィールド | 型 | 説明 |
|------|------|------|
| `Timestamp` | `time.Time` | 今回のヘルスチェックのタイムスタンプ |
| `Healthy` | `bool` | 全体の健康結論（すべてのチェック項目を通過すれば true） |
| `Checks` | `map[string]CheckResult` | 各チェック項目の結果。キーはチェック項目名 |

### CheckResult 構造

単一のヘルスチェック結果。

```go
type CheckResult struct {
    Healthy bool   `json:"healthy"` // このチェック項目が健康か
    Message string `json:"message"` // チェックメッセージ
}
```

| フィールド | 型 | 説明 |
|------|------|------|
| `Healthy` | `bool` | このチェック項目を通過したか |
| `Message` | `string` | 通過/失敗の説明メッセージ |

---

## IterableValue

反復値のカプセル化。

### メソッド概要

**基本アクセス**

| メソッド | 説明 |
|------|------|
| `Get(path)` | パスで値を取得 |
| `GetString(path)` | 文字列を取得 |
| `GetInt(path)` | 整数を取得 |
| `GetFloat64(path)` | 浮動小数点数を取得 |
| `GetBool(path)` | ブール値を取得 |
| `GetArray(path)` | 配列を取得 |
| `GetObject(path)` | オブジェクトを取得 |

**デフォルト値付き取得**

| メソッド | 説明 |
|------|------|
| `GetWithDefault(path, defaultValue)` | 値を取得。存在しない場合はデフォルト値 |
| `GetStringWithDefault(path, defaultValue)` | 文字列を取得。存在しない場合はデフォルト値 |
| `GetIntWithDefault(path, defaultValue)` | 整数を取得。存在しない場合はデフォルト値 |
| `GetFloat64WithDefault(path, defaultValue)` | 浮動小数点数を取得。存在しない場合はデフォルト値 |
| `GetBoolWithDefault(path, defaultValue)` | ブール値を取得。存在しない場合はデフォルト値 |

**チェックと走査**

| メソッド | 説明 |
|------|------|
| `Exists(path)` | フィールドが存在するかチェック |
| `IsNull(path)` | 指定パスが null かチェック |
| `IsNullData()` | 内部の値が null かチェック |
| `IsEmpty(path)` | 指定パスが空かチェック |
| `IsEmptyData()` | 内部の値が空かチェック |
| `GetData()` | 内部の生データを取得 |
| `Break()` | 中断シグナルを返し、反復を停止 |
| `ForeachNested(path, fn)` | ネスト構造を走査 |
| `Release()` | リソースを解放 |

詳しくは[イテレータ](./iterator)ドキュメントを参照してください。

---

## エンコードエラー型

json パッケージは、エンコード/デコード過程の以下のエラー型をエクスポートします。きめ細かなエラー処理に使用します。

### SyntaxError - 構文エラー

JSON 構文解析エラー。入力データが正当な JSON フォーマットでないことを示します。

#### 構造定義

```go
type SyntaxError struct {
    Offset int64 // エラーが発生した位置（バイトオフセット）
    // その他の非エクスポートフィールドを含む
}
```

#### メソッド

| メソッド | シグネチャ | 説明 |
|------|------|------|
| `Error` | `func (e *SyntaxError) Error() string` | オフセット位置を含むエラー説明を返す |

```go
data := `{invalid json}`
_, err := json.ParseAny(data)
if syntaxErr, ok := err.(*json.SyntaxError); ok {
    fmt.Printf("構文エラー、オフセット：%d\n", syntaxErr.Offset)
}
```

---

### UnmarshalTypeError - デシリアライズ型エラー

JSON 値をターゲットの Go 型に変換できないときに返されるエラーです。

#### 構造定義

```go
type UnmarshalTypeError struct {
    Value  string       // JSON 値の説明（"string", "number" など）
    Type   reflect.Type // ターゲットの Go 型
    Offset int64        // エラーが発生した位置（バイトオフセット）
    Struct string       // このフィールドを含む構造体名（あれば）
    Field  string       // フィールド名（あれば）
    Err    error        // 内部エラー（あれば）
}
```

#### メソッド

| メソッド | シグネチャ | 説明 |
|------|------|------|
| `Error` | `func (e *UnmarshalTypeError) Error() string` | 型不一致のエラー説明を返す |
| `Unwrap` | `func (e *UnmarshalTypeError) Unwrap() error` | 内部エラーを返す |

```go
type User struct {
    Age int `json:"age"`
}
var user User
err := json.Unmarshal([]byte(`{"age": "not_a_number"}`), &user)
if typeErr, ok := err.(*json.UnmarshalTypeError); ok {
    fmt.Printf("型エラー: JSON 値 %s を %v に変換できません\n", typeErr.Value, typeErr.Type)
}
```

---

### UnsupportedTypeError - サポートされない型エラー

Go でサポートされない型をエンコードしようとしたときに返されるエラーです。

#### 構造定義

```go
type UnsupportedTypeError struct {
    Type reflect.Type // サポートされない Go 型
}
```

#### メソッド

| メソッド | シグネチャ | 説明 |
|------|------|------|
| `Error` | `func (e *UnsupportedTypeError) Error() string` | サポートされない型の説明を返す |

```go
type Chan chan int
data := Chan(make(chan int))
_, err := json.Marshal(data)
if unsupportedErr, ok := err.(*json.UnsupportedTypeError); ok {
    fmt.Printf("サポートされない型: %v\n", unsupportedErr.Type)
}
```

---

### UnsupportedValueError - サポートされない値エラー

サポートされない値（NaN、Infinity など）をエンコードしようとしたときに返されるエラーです。

#### 構造定義

```go
type UnsupportedValueError struct {
    Value reflect.Value // サポートされない値
    Str   string        // エラー説明
}
```

#### メソッド

| メソッド | シグネチャ | 説明 |
|------|------|------|
| `Error` | `func (e *UnsupportedValueError) Error() string` | サポートされない値の説明を返す |

```go
val := math.NaN()
_, err := json.Marshal(val)
if valErr, ok := err.(*json.UnsupportedValueError); ok {
    fmt.Printf("サポートされない値: %s\n", valErr.Str)
}
```

---

### InvalidUnmarshalError - 無効なデシリアライズターゲットエラー

`Unmarshal` のターゲット引数がポインタでない、または nil のときに返されるエラーです。

#### 構造定義

```go
type InvalidUnmarshalError struct {
    Type reflect.Type // ターゲット引数の型
}
```

#### メソッド

| メソッド | シグネチャ | 説明 |
|------|------|------|
| `Error` | `func (e *InvalidUnmarshalError) Error() string` | 無効なターゲットのエラー説明を返す |

```go
var target string // ポインタを渡すべき
err := json.Unmarshal([]byte(`"hello"`), target) // エラー：ポインタ未渡し
if invalidErr, ok := err.(*json.InvalidUnmarshalError); ok {
    fmt.Printf("無効なデシリアライズターゲット: %v\n", invalidErr.Type)
}
```

---

### MarshalerError - エンコーダエラー

型の `MarshalJSON` または `MarshalText` メソッドがエラーを返したときにラップされるエラーです。

#### 構造定義

```go
type MarshalerError struct {
    Type reflect.Type // MarshalJSON または MarshalText を実装した型
    Err  error        // MarshalJSON または MarshalText が返したエラー
    // その他の非エクスポートフィールドを含む
}
```

#### メソッド

| メソッド | シグネチャ | 説明 |
|------|------|------|
| `Error` | `func (e *MarshalerError) Error() string` | エンコーダエラーの説明を返す |
| `Unwrap` | `func (e *MarshalerError) Unwrap() error` | 内部エラーを返す |

```go
type BadMarshaler struct{}

func (BadMarshaler) MarshalJSON() ([]byte, error) {
    return nil, errors.New("marshal failed")
}

_, err := json.Marshal(BadMarshaler{})
if marshalErr, ok := err.(*json.MarshalerError); ok {
    fmt.Printf("エンコーダエラー (型: %v): %v\n", marshalErr.Type, marshalErr.Err)
}
```

---

## Encoder - JSON エンコーダ

`Encoder` は JSON 値を出力ストリームに書き込みます。`encoding/json.Encoder` と 100% 互換です。

### 作成

シグネチャ：`func NewEncoder(w io.Writer, cfg ...Config) *Encoder`

`w` に書き込むエンコーダを作成します。オプションの `Config` 引数でエンコード動作をカスタマイズできます。

```go
file, _ := os.Create("output.json")
defer file.Close()

encoder := json.NewEncoder(file)
err := encoder.Encode(map[string]any{"name": "Alice"})
```

### メソッド

| メソッド | シグネチャ | 説明 |
|------|------|------|
| `Encode` | `func (enc *Encoder) Encode(v any) error` | Go 値を JSON にエンコードしてストリームに書き込む |
| `SetEscapeHTML` | `func (enc *Encoder) SetEscapeHTML(on bool)` | HTML 特殊文字をエスケープするか設定 |
| `SetIndent` | `func (enc *Encoder) SetIndent(prefix, indent string)` | インデント形式を設定 |

### 使用例

```go
package main

import (
	"bytes"
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	var buf bytes.Buffer
	encoder := json.NewEncoder(&buf)
	encoder.SetIndent("", "  ")
	encoder.SetEscapeHTML(true)

	err := encoder.Encode(map[string]any{
		"name":  "Alice",
		"email": "alice@example.com",
	})
	if err != nil {
		panic(err)
	}
	fmt.Println(buf.String())
}
```

---

## Decoder - JSON デコーダ

`Decoder` は入力ストリームから JSON 値を読み取ってデコードします。`encoding/json.Decoder` と 100% 互換です。

### 作成

シグネチャ：`func NewDecoder(r io.Reader, cfg ...Config) *Decoder`

`r` から読み取るデコーダを作成します。オプションの `Config` 引数をサポートします。

```go
file, _ := os.Open("data.json")
defer file.Close()

decoder := json.NewDecoder(file)
for decoder.More() {
    var obj map[string]any
    if err := decoder.Decode(&obj); err != nil {
        break
    }
    fmt.Println(obj)
}
```

### メソッド

| メソッド | シグネチャ | 説明 |
|------|------|------|
| `Decode` | `func (dec *Decoder) Decode(v any) error` | ストリームから次の JSON 値を読み取ってデコード |
| `UseNumber` | `func (dec *Decoder) UseNumber()` | デコーダが数値を `float64` ではなく `Number` として解析するようにする |
| `DisallowUnknownFields` | `func (dec *Decoder) DisallowUnknownFields()` | デコード時に未知フィールドがあるとエラーを返す |
| `Buffered` | `func (dec *Decoder) Buffered() io.Reader` | デコーダバッファ内の残りデータの Reader を返す |
| `InputOffset` | `func (dec *Decoder) InputOffset() int64` | 現在の入力位置のオフセットを返す |
| `More` | `func (dec *Decoder) More() bool` | ストリームにさらに JSON 値があるかチェック |
| `Token` | `func (dec *Decoder) Token() (Token, error)` | 次の JSON token を読み取る |

### 使用例

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"strings"
)

func main() {
	input := `{"name":"Alice","age":30}{"name":"Bob","age":25}`
	decoder := json.NewDecoder(strings.NewReader(input))

	for decoder.More() {
		var person map[string]any
		if err := decoder.Decode(&person); err != nil {
			break
		}
		fmt.Printf("名前: %s, 年齢: %v\n", person["name"], person["age"])
	}
}
```

### ストリーミングデコードのサンプル

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"strings"
)

func main() {
	// JSON ストリーム内の複数の値をデコード
	input := `[1,2,3][4,5,6]`
	decoder := json.NewDecoder(strings.NewReader(input))

	for decoder.More() {
		var arr []any
		if err := decoder.Decode(&arr); err != nil {
			panic(err)
		}
		fmt.Println(arr)
	}
}
```

### Token 読み取りのサンプル

```go
decoder := json.NewDecoder(strings.NewReader(`{"name":"Alice"}`))
for {
    token, err := decoder.Token()
    if err != nil {
        break
    }
    switch v := token.(type) {
    case json.Delim:
        fmt.Printf("区切り文字: %s\n", string(v))
    case string:
        fmt.Printf("文字列: %s\n", v)
    case float64:
        fmt.Printf("数値: %v\n", v)
    case bool:
        fmt.Printf("ブール: %v\n", v)
    case nil:
        fmt.Println("null")
    }
}
```

---

## Token - JSON Token

`Token` は JSON token 値で、以下の型のいずれかを保持します：

- `Delim`：4 つの JSON 区切り文字 `[ ] { }` を表す
- `bool`：JSON ブール値を表す
- `float64`：JSON 数値を表す
- `Number`：`UseNumber` 有効時の JSON 数値を表す
- `string`：JSON 文字列を表す
- `nil`：JSON null を表す

```go
type Token any
```

`Decoder.Token()` で取得します。

---

## Number - JSON 数値

`Number` は JSON 数値文字列を表し、`UseNumber` モード有効時に Decoder が使用します。

```go
type Number string
```

### メソッド

| メソッド | シグネチャ | 説明 |
|------|------|------|
| `String` | `func (n Number) String() string` | 数値の文字列表現を返す |
| `Float64` | `func (n Number) Float64() (float64, error)` | float64 に変換 |
| `Int64` | `func (n Number) Int64() (int64, error)` | int64 に変換 |

```go
decoder := json.NewDecoder(strings.NewReader(`{"price": 19.99}`))
decoder.UseNumber()
var obj map[string]any
decoder.Decode(&obj)

if num, ok := obj["price"].(json.Number); ok {
    f, _ := num.Float64()
    fmt.Println(f) // 19.99
}
```

---

## Delim - JSON 区切り文字

`Delim` は JSON 区切り文字型で、`[`、`]`、`{`、`}` の 4 文字に対応します。

```go
type Delim rune
```

### メソッド

#### String

シグネチャ：`func (d Delim) String() string`

区切り文字の文字列表現を返します。

```go
token, _ := decoder.Token()
if delim, ok := token.(json.Delim); ok {
    fmt.Println(delim.String()) // "[" や "{" など
}
```

---

## 関連

- [パッケージ関数](./functions/) - パッケージレベル関数リファレンス
- [Config](./config) - 設定オプション
- [Processor](./processor/) - プロセッサメソッド
- [インターフェース定義](./interfaces) - 拡張インターフェース
