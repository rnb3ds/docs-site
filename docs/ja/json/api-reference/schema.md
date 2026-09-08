---
sidebar_label: "Schema 検証"
title: "Schema 検証 - CyberGo JSON | JSON Schema 検証ガイド"
description: "CyberGo JSON Schema 検証：ValidateSchema の使い方、Schema 制約フィールド、Format 形式検証、ValidationError エラー処理、NewSchemaWithConfig 作成方法。オブジェクト、文字列、数値、配列の制約をカバーします。"
sidebar_position: 4.5
---

# Schema 検証

json ライブラリは JSON Schema ベースのデータ検証能力を提供します：`Schema` でデータが満たすべき構造と制約を記述し、`ValidateSchema` で JSON を検証します。これは現バージョンで**機能が完全な**検証システムです。

## ValidateSchema 関数

`ValidateSchema` は JSON 文字列を `Schema` と照合して検証し、すべての制約違反のリストを返します：

```go
// パッケージレベル関数
func ValidateSchema(jsonStr string, schema *Schema, cfg ...Config) ([]ValidationError, error)

// Processor メソッド
func (p *Processor) ValidateSchema(jsonStr string, schema *Schema, cfg ...Config) ([]ValidationError, error)
```

戻り値のセマンティクス：

| 戻り値 | 意味 |
|--------|------|
| `([]ValidationError{}, nil)` | JSON が正当で**すべての制約を満たす** |
| `([]ValidationError{...}, nil)` | JSON は解析可能だが、制約違反が存在（スライス非空） |
| `(nil, error)` | 解析または事前処理の失敗（JSON が不正、`schema` が nil、制限超過など） |

::: tip 重要な区別
制約違反は**返されるスライス**で表現されます（`error` は `nil` のまま）。非 `nil` の `error` が返るのは、解析失敗、`schema` が nil、サイズ制限超過などの場合のみです。そのため「検証を通過したか」の判定は `err != nil` ではなく `len(errs) == 0` で行ってください。
:::

## 基本サンプル：オブジェクト構造と必須フィールド

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	schema := &json.Schema{
		Type:     "object",
		Required: []string{"name", "email"},
		Properties: map[string]*json.Schema{
			"name":  {Type: "string"},
			"email": {Type: "string", Format: "email"},
			"age":   {Type: "number"},
		},
	}

	// 必須フィールド email が欠落
	data := `{"name":"Alice","age":30}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// 出力: email: required property 'email' is missing
}
```

## Schema 制約フィールド総覧

`Schema` がサポートする制約フィールド（カテゴリー別）：

| カテゴリー | フィールド | 型 | 適用型 | 説明 |
|------|------|------|----------|------|
| 構造 | `Type` | `string` | すべて | 取り得る値は下表 |
| 構造 | `Required` | `[]string` | object | 必須のプロパティ名リスト |
| 構造 | `Properties` | `map[string]*Schema` | object | 各プロパティに対応する子 Schema |
| 構造 | `Items` | `*Schema` | array | 要素に対応する子 Schema |
| 構造 | `AdditionalProperties` | `bool` | object | `true` は追加プロパティを許可、`false` は拒否 |
| 文字列 | `MinLength` / `MaxLength` | `int` | string | 長さの範囲（rune 単位でカウント） |
| 文字列 | `Pattern` | `string` | string | 正規表現 |
| 文字列 | `Format` | `string` | string | 意味的フォーマット（[Format 値表](#サポートされる-format-値)を参照） |
| 数値 | `Minimum` / `Maximum` | `float64` | number | 値の範囲 |
| 数値 | `ExclusiveMinimum` / `ExclusiveMaximum` | `bool` | number | 境界値を除外 |
| 数値 | `MultipleOf` | `float64` | number | その値の倍数である必要あり |
| 配列 | `MinItems` / `MaxItems` | `int` | array | 要素数の範囲 |
| 配列 | `UniqueItems` | `bool` | array | `true` は要素の一意性を要求 |
| 値 | `Enum` | `[]any` | すべて | 許可される列挙値リスト |
| 値 | `Const` | `any` | すべて | この固定値と等しい必要あり |
| メタ情報 | `Title` / `Description` | `string` | — | ドキュメント用メタデータ。検証には参加しない |
| メタ情報 | `Default` | `any` | — | ドキュメント用メタデータ。検証には参加しない |
| メタ情報 | `Examples` | `[]any` | — | ドキュメント用メタデータ。検証には参加しない |

`Type` の取り得る値：`object`、`array`、`string`、`number`、`boolean`、`null`。

::: warning 数値型には "number" を使う
JSON 解析後のすべての数値（整数を含む）は `float64` のため、数値フィールドには `Type: "number"` を使ってください。JSON Schema Draft 7 の `integer` は**サポートされません**——`"integer"` と書くとすべての値が `expected type integer` エラーになります。`Minimum`/`Maximum`/`MultipleOf` などの数値制約も `Type` が `number` のときのみ有効です。
:::

## オブジェクト制約：Required / Properties / AdditionalProperties

`AdditionalProperties` は、`Properties` で宣言されていないプロパティの出現を許可するかを制御します。構造体リテラルで直接 `Schema` を構築する場合、このフィールドのデフォルトは `false` です（追加プロパティを拒否）：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	schema := &json.Schema{
		Type:     "object",
		Required: []string{"name"},
		Properties: map[string]*json.Schema{
			"name":  {Type: "string"},
			"email": {Type: "string"},
		},
		// AdditionalProperties 未設定。構造体リテラルのデフォルトは false → 追加プロパティを拒否
	}

	// "extra" は Properties で宣言されていない
	data := `{"name":"Alice","extra":"x"}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// 出力: extra: additional property 'extra' is not allowed
}
```

::: tip 追加プロパティを許可するには
追加プロパティを通すには、`AdditionalProperties` を `true` に設定するか、[`DefaultSchema()`](#schema-の作成方法) で構築してください（そのデフォルトの `AdditionalProperties` は `true` です）。
:::

## 文字列制約：MinLength / MaxLength / Pattern / Format

`MinLength`、`MaxLength`、`Minimum`、`Maximum`、`MinItems`、`MaxItems` などの制約は、**`NewSchemaWithConfig` で作成したときのみ有効です**（理由は[作成方法](#schema-の作成方法)を参照）。以下では `SchemaConfig` のポインタフィールドで長さを設定し、`Pattern` で小文字に限定します：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	nameCfg := json.DefaultSchemaConfig()
	nameCfg.Type = "string"
	minLen, maxLen := 3, 10
	nameCfg.MinLength = &minLen
	nameCfg.MaxLength = &maxLen
	nameCfg.Pattern = `^[a-z]+$`
	nameSchema := json.NewSchemaWithConfig(nameCfg)

	schema := &json.Schema{
		Type:     "object",
		Required: []string{"name"},
		Properties: map[string]*json.Schema{
			"name": nameSchema,
		},
	}

	// "AB"：長さ不足かつ大文字を含む
	data := `{"name":"AB"}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// 出力:
	// name: string length 2 is less than minimum 3
	// name: string 'AB' does not match pattern '^[a-z]+$'
}
```

`Pattern` は最初の検証時に遅延コンパイルされてキャッシュされ、同じ `*Schema` を並行検証に安全に使用できます。正規表現自体が不正な場合、毎回の検証でそのコンパイルエラーが報告されます。

## 数値制約：Minimum / Maximum / MultipleOf

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	ageCfg := json.DefaultSchemaConfig()
	ageCfg.Type = "number"
	minVal, maxVal := 0.0, 120.0
	ageCfg.Minimum = &minVal
	ageCfg.Maximum = &maxVal
	mult := 5.0
	ageCfg.MultipleOf = &mult
	ageSchema := json.NewSchemaWithConfig(ageCfg)

	schema := &json.Schema{
		Type: "object",
		Properties: map[string]*json.Schema{
			"age": ageSchema,
		},
	}

	// 148：上限 120 を超え、5 の倍数でもない
	data := `{"age":148}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// 出力:
	// age: number 148 exceeds maximum 120
	// age: number 148 is not a multiple of 5
}
```

`ExclusiveMinimum` / `ExclusiveMaximum` は `Minimum` / `Maximum` と合わせて `SchemaConfig`（いずれもポインタフィールド）で設定する必要があり、境界値そのものを除外します。`MultipleOf` は浮動小数点許容誤差比較（epsilon 1e-9）を採用しており、`0.1 + 0.2` のような IEEE 754 精度のシナリオで誤報しません。

## 配列制約：Items / MinItems / MaxItems / UniqueItems

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	tagsCfg := json.DefaultSchemaConfig()
	tagsCfg.Type = "array"
	minItems, maxItems := 1, 3
	tagsCfg.MinItems = &minItems
	tagsCfg.MaxItems = &maxItems
	tagsCfg.UniqueItems = true
	tagsCfg.Items = &json.Schema{Type: "string"}
	tagsSchema := json.NewSchemaWithConfig(tagsCfg)

	schema := &json.Schema{
		Type: "object",
		Properties: map[string]*json.Schema{
			"tags": tagsSchema,
		},
	}

	// 4 要素（上限 3 を超過）、かつ "a" が重複
	data := `{"tags":["a","a","b","c"]}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// 出力:
	// tags: array length 4 exceeds maximum 3
	// tags[1]: duplicate item found: a
}
```

`Items` は各要素が満たすべき子 Schema を指定します（上例では文字列に限定）。`UniqueItems` は「**動的型 + 値**」の組み合わせで重複判定を行います——`[1, "1"]` は 2 つの異なる要素とみなされ、真に重複した値のみがエラーになります。

::: tip 再帰深度の保護
`Schema` は再帰的な型で、検証時には再帰深度の上限保護（`DefaultMaxNestingDepth` = 200）が効きます。自己参照 Schema（`s.Items = s` など）でもスタックオーバーフローは起こらず、上限を超えると `schema nesting exceeds maximum depth` エラーが 1 件報告されます。
:::

## 列挙と定数：Enum / Const

`Enum` は値が列挙のいずれかに一致することを、`Const` は特定の固定値と等しいことを要求します。どちらも直接比較で機能し、`NewSchemaWithConfig` は不要です：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	schema := &json.Schema{
		Type: "object",
		Properties: map[string]*json.Schema{
			"role":   {Enum: []any{"admin", "user", "guest"}},
			"status": {Const: "active"},
		},
	}

	// role は列挙外。status は定数に一致
	data := `{"role":"superuser","status":"active"}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// 出力: role: value 'superuser' is not in allowed enum values: [admin user guest]
}
```

## サポートされる Format 値

`Format` フィールドがサポートする意味的フォーマット（未知のフォーマットは黙ってスキップされます：エラーにならず、その項目の検証も行われません）：

| Format | 検証ルール |
|--------|----------|
| `email` | ローカル部分、ドメイン、TLD の構造と長さを検証 |
| `date` | `YYYY-MM-DD` |
| `date-time` | RFC3339 |
| `time` | `HH:MM:SS` |
| `uri` | `://` を含む必要あり |
| `uuid` | UUID 正規表現マッチ |
| `ipv4` | 4 セグメント、各 0–255 |
| `ipv6` | `net.ParseIP` で解析可能かつ `:` を含む |

## ValidationError 型

各制約違反は 1 つの `ValidationError` で、エラーが発生した JSON パスと説明を保持します：

```go
type ValidationError struct {
    Path    string `json:"path"`    // エラーパス（例："user.email"、"tags[1]"）
    Message string `json:"message"` // エラーメッセージ
}

func (ve *ValidationError) Error() string
```

`ValidateSchema` は `[]ValidationError` スライスを返すため、そのままループで `Path` / `Message` を読み取れます。`Error()` メソッドは単一のエラーを文字列にフォーマットします（ログ記録などに使用）。

## Schema の作成方法

`Schema` の構築には 3 つの方法があり、**重要な違いは長さ/範囲系の制約が有効になるかどうか**です：

```go
// 1) 直接リテラル：Type/Required/Properties/Items/Pattern/Format/Enum/Const/
//    UniqueItems/MultipleOf は即座に有効。ただし MinLength/MaxLength/Minimum/Maximum/
//    MinItems/MaxItems/ExclusiveMinimum/ExclusiveMaximum は無効（下記説明を参照）
schema := &json.Schema{Type: "string", Pattern: `^\d+$`}

// 2) NewSchemaWithConfig：SchemaConfig のポインタフィールドで制約を設定。長さ/範囲系はすべて有効
cfg := json.DefaultSchemaConfig()
cfg.Type = "string"
minLen := 1
cfg.MinLength = &minLen
schema := json.NewSchemaWithConfig(cfg)

// 3) DefaultSchema：デフォルト値付きの Schema を返す（AdditionalProperties は true）
schema := json.DefaultSchema()
```

::: warning 長さ/範囲制約には NewSchemaWithConfig が必須
`MinLength`、`MaxLength`、`Minimum`、`Maximum`、`MinItems`、`MaxItems`、`ExclusiveMinimum`、`ExclusiveMaximum` の一連の制約は、`Schema` 内部の外部から設定できない追跡フラグに依存します。`&json.Schema{...}` リテラルでこれらのフィールドに直接値を代入しても**有効になりません**。`NewSchemaWithConfig` で対応する**ポインタフィールド**（`cfg.MinLength = &v` など）を渡して初めて有効になります。`Type`、`Required`、`Properties`、`Items`、`Pattern`、`Format`、`Enum`、`Const`、`UniqueItems`、`MultipleOf` はこの制限を受けず、リテラルでも `NewSchemaWithConfig` でも有効です。
:::

### DefaultSchema

シグネチャ：`func DefaultSchema() *Schema`

`DefaultSchema` はデフォルト値付きの Schema を返します：`Properties` は空 map、`Required` は空スライス、`AdditionalProperties` は `true`（追加プロパティを通す）に初期化されており、段階的に埋めていく出発点に適します。

### DefaultSchemaConfig

シグネチャ：`func DefaultSchemaConfig() SchemaConfig`

`DefaultSchemaConfig` は `NewSchemaWithConfig` のデフォルト引数を返します：`AdditionalProperties` のみが `true` を指すポインタとして事前設定され、残りのフィールドはゼロ値です。これに `Type` と各ポインタフィールドを設定して Schema を作成できます。

両者の成果物は一致します：`DefaultSchema()` は `NewSchemaWithConfig(DefaultSchemaConfig())` と等価です——デフォルトではどちらも追加プロパティを通します。

### SchemaConfig フィールド

`SchemaConfig` のフィールドセットは `Schema` と 1 対 1 で対応します。うち数値/ブール系の制約は**ポインタ型**です——`nil` はその制約が未設定であることを表し、非 `nil` ポインタを渡して初めて `NewSchemaWithConfig` が対応する制約を有効にします（これこそが、長さ/範囲系の制約に `NewSchemaWithConfig` が必要な理由です。[上の警告](#schema-の作成方法)を参照）。

| フィールド | 型 | 説明 |
|------|------|------|
| `Type` | `string` | JSON 型（`Schema.Type` と同じ） |
| `Properties` | `map[string]*Schema` | 各プロパティに対応する子 Schema（nil の場合は空 map に初期化） |
| `Items` | `*Schema` | 配列要素に対応する子 Schema |
| `Required` | `[]string` | 必須のプロパティ名リスト（nil の場合は空スライスに初期化） |
| `MinLength` | `*int` | 最小長（nil = 未設定） |
| `MaxLength` | `*int` | 最大長（nil = 未設定） |
| `Minimum` | `*float64` | 最小値（nil = 未設定） |
| `Maximum` | `*float64` | 最大値（nil = 未設定） |
| `Pattern` | `string` | 正規表現 |
| `Format` | `string` | 意味的フォーマット |
| `AdditionalProperties` | `*bool` | 追加プロパティを許可するか（nil は `true` として扱われる。`DefaultSchemaConfig` は `true` を指すポインタに事前設定） |
| `MinItems` | `*int` | 最少要素数（nil = 未設定） |
| `MaxItems` | `*int` | 最大要素数（nil = 未設定） |
| `UniqueItems` | `bool` | 要素の一意性を要求 |
| `Enum` | `[]any` | 許可される列挙値リスト |
| `Const` | `any` | 等しい必要がある固定値 |
| `MultipleOf` | `*float64` | 倍数制約（nil = 未設定） |
| `ExclusiveMinimum` | `*bool` | 下限の境界を除外（nil = 未設定） |
| `ExclusiveMaximum` | `*bool` | 上限の境界を除外（nil = 未設定） |
| `Title` | `string` | タイトル（メタ情報） |
| `Description` | `string` | 説明（メタ情報） |
| `Default` | `any` | デフォルト値（メタ情報） |
| `Examples` | `[]any` | サンプル値（メタ情報） |

設定済みの Schema は常に `NewSchemaWithConfig`（`func NewSchemaWithConfig(cfg SchemaConfig) *Schema`）で作成することを推奨します——ポインタ制約を確実に有効化する唯一の方法であり、`Properties` / `Required` の初期化と `AdditionalProperties` のデフォルト値処理も自動的に行われます。

## Config の検証関連フィールド

| フィールド | 型 | 説明 |
|------|------|------|
| `EnableValidation` | `bool` | 入力検証を有効化（操作前のセキュリティ/構造検証に影響） |
| `ValidateInput` | `bool` | 入力 JSON を検証 |
| `SkipValidation` | `bool` | 非必須の検証をスキップ（信頼された入力専用） |

::: warning 接続されていない拡張フィールド
`Config.CustomValidators`（`[]Validator`）と `Validator` インターフェースは、現バージョンでは**宣言済みで設定のクローンとキャッシュキー計算には参加しますが、操作パイプラインにはまだ接続されていません**。`Config.CustomValidators`（または `Config.AddValidator`）でバリデータを登録しても**どの操作の実行にも影響しません**——操作がカスタムバリデータに拒否されることはありません。`Validator` インターフェースは現在予約インターフェースです：

```go
// 現バージョン：宣言済みだが未接続。登録しても操作に影響しない（予約インターフェース）
type Validator interface {
    Validate(jsonStr string) error
}
```

操作の前後にカスタム検証を行う必要がある場合は、有効な [Hooks フック](../extensions/hooks)（例：`ValidationHook`）を使用してください。
:::

## 関連

- [インターフェース定義](./interfaces) - `Validator` インターフェース（予約）と `Schema` 関連型
- [型定義](./types) - コア型（Config / Schema / Stats / AccessResult）
- [解析と検証](./functions/parse) - Parse / Valid / ValidateSchema 関数
- [設定オプション](./config) - 検証関連の設定フィールド
- [Hooks フック](../extensions/hooks) - 有効な操作前後のインターセプト機構（`ValidationHook` を含む）
