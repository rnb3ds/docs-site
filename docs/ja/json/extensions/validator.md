---
sidebar_label: "Validator バリデータ"
title: "Validator - CyberGo JSON | Schema バリデータ"
description: "CyberGo JSON バリデータ：Validator インターフェース、Schema 検証構造体、ValidationError エラーと SchemaConfig 設定で、完全な JSON データ検証能力を提供します。"
sidebar_position: 2
---

# Schema 検証

json ライブラリは JSON Schema に基づくデータ検証能力を提供します：データが満たすべき構造と制約を記述した `Schema` を定義し、`ValidateSchema` で JSON を検証します。これは現在のバージョンで**機能が完全な**検証システムです。

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
| `([]ValidationError{}, nil)` | JSON が有効かつ**全制約を満たす** |
| `([]ValidationError{...}, nil)` | JSON は解析可能だが制約違反が存在（スライスが非空） |
| `(nil, error)` | 解析または前提条件の失敗（JSON が不正、`schema` が nil、制限超過など） |

::: tip 重要な区別
制約違反は**戻り値のスライス**で表現され（`error` は `nil` のまま）、解析失敗、`schema` が nil、サイズ制限超過などの場合にのみ非 `nil` の `error` が返されます。したがって「検証を通過したか」の確認は `err != nil` ではなく `len(errs) == 0` で行うべきです。
:::

## 基礎例：オブジェクト構造と必須フィールド

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
	// 出力：email: required property 'email' is missing
}
```

## Schema 制約フィールド総覧

`Schema` が対応する制約フィールド（カテゴリ別）：

| カテゴリ | フィールド | 適用型 | 説明 |
|------|------|----------|------|
| 構造 | `Type` | すべて | 値は下表を参照 |
| 構造 | `Required` | object | 必須のプロパティ名リスト |
| 構造 | `Properties` | object | 各プロパティに対応する子 Schema |
| 構造 | `Items` | array | 要素に対応する子 Schema |
| 構造 | `AdditionalProperties` | object | `true` は追加プロパティを許可、`false` は拒否 |
| 文字列 | `MinLength` / `MaxLength` | string | 長さ範囲（rune 単位でカウント） |
| 文字列 | `Pattern` | string | 正規表現 |
| 文字列 | `Format` | string | セマンティックフォーマット（[Format 値表](#対応する-format-値)を参照） |
| 数値 | `Minimum` / `Maximum` | number | 値域 |
| 数値 | `ExclusiveMinimum` / `ExclusiveMaximum` | number | 境界値を除外 |
| 数値 | `MultipleOf` | number | その値の倍数でなければならない |
| 配列 | `MinItems` / `MaxItems` | array | 要素数範囲 |
| 配列 | `UniqueItems` | array | `true` は要素の一意性を要求 |
| 値 | `Enum` | すべて | 許可される列挙値リスト |
| 値 | `Const` | すべて | この固定値に等しくなければならない |

`Type` が対応する値：`object`、`array`、`string`、`number`、`boolean`、`null`。

::: warning 数値型には "number" を使用
JSON 解析後のすべての数値（整数を含む）は `float64` になるため、数値フィールドには `Type: "number"` を使用してください。`MultipleOf` などの数値制約も `Type` が `number` の場合にのみ有効になります。
:::

## オブジェクト制約：Required / Properties / AdditionalProperties

`AdditionalProperties` は `Properties` で宣言されていないプロパティの出現を許可するかを制御します。構造体リテラルで直接 `Schema` を構築する場合、このフィールドのデフォルトは `false`（追加プロパティを拒否）です：

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
		// AdditionalProperties は未設定、構造体リテラルのデフォルトは false → 追加プロパティを拒否
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
	// 出力：extra: additional property 'extra' is not allowed
}
```

::: tip 追加プロパティを許可
追加プロパティを通過させたい場合は、`AdditionalProperties` を `true` に設定するか、[`DefaultSchema()`](#schema-の作成方法) で構築します（デフォルトの `AdditionalProperties` は `true`）。
:::

## 文字列制約：MinLength / MaxLength / Pattern / Format

`MinLength`、`MaxLength`、`Minimum`、`Maximum`、`MinItems`、`MaxItems` などの制約は**`NewSchemaWithConfig` で作成した場合にのみ有効になります**（理由は[作成方法](#schema-の作成方法)を参照）。以下では `SchemaConfig` のポインタフィールドで長さを設定し、`Pattern` で小文字アルファベットに制限します：

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
	// 出力：
	// name: string length 2 is less than minimum 3
	// name: string 'AB' does not match pattern '^[a-z]+$'
}
```

`Pattern` は初回検証時に遅延コンパイルされてキャッシュされ、同じ `*Schema` を並列検証に安全に使用できます。正規表現自体が不正な場合、毎回の検証でそのコンパイルエラーが報告されます。

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

	// 148：上限 120 を超過、かつ 5 の倍数ではない
	data := `{"age":148}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// 出力：
	// age: number 148 exceeds maximum 120
	// age: number 148 is not a multiple of 5
}
```

`ExclusiveMinimum` / `ExclusiveMaximum` は `Minimum` / `Maximum` と併せて `SchemaConfig`（同じくポインタフィールド）で設定する必要があり、境界値自体を除外するために使います。

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

	// 4 つの要素（上限 3 を超過）、かつ "a" が重複
	data := `{"tags":["a","a","b","c"]}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// 出力：
	// tags: array length 4 exceeds maximum 3
	// tags[1]: duplicate item found: a
}
```

`Items` は各要素が満たすべき子 Schema を指定します（上例では文字列に制限）。`UniqueItems` は要素の文字列表現で重複判定を行います。

## 列挙と定数：Enum / Const

`Enum` は値がいずれかにヒットしなければならないことを制限し、`Const` は特定の固定値に等しくなければならないことを制限します。どちらも直接比較で有効になり、`NewSchemaWithConfig` は不要です：

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

	// role は列挙値内になく、status は定数に合致
	data := `{"role":"superuser","status":"active"}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// 出力：role: value 'superuser' is not in allowed enum values: [admin user guest]
}
```

## 対応する Format 値

`Format` フィールドが対応するセマンティックフォーマット（未知のフォーマットは黙示的にスキップされ、エラーにならず合格もしません）：

| Format | 検証ルール |
|--------|----------|
| `email` | ローカル部分、ドメイン、TLD 構造と長さを検証 |
| `date` | `YYYY-MM-DD` |
| `date-time` | RFC3339 |
| `time` | `HH:MM:SS` |
| `uri` | `://` を含む必要あり |
| `uuid` | UUID 正規表現にマッチ |
| `ipv4` | 4 セグメント、各 0–255 |
| `ipv6` | `net.ParseIP` で解析でき `:` を含む |

## ValidationError 型

各制約違反は `ValidationError` で、エラーが発生した JSON パスと説明を保持します：

```go
type ValidationError struct {
    Path    string `json:"path"`    // エラーパス（例："user.email"、"tags[1]"）
    Message string `json:"message"` // エラーメッセージ
}

func (ve *ValidationError) Error() string
```

`ValidateSchema` は `[]ValidationError` スライスを返すため、直接ループで `Path` / `Message` を読み取ります。`Error()` メソッドは単一のエラーを文字列にフォーマットするために使用します（ログ記録など）。

## Schema の作成方法

`Schema` の構築には 3 つの方法があり、**重要な違いは長さ/範囲制約の制約が有効かどうか**です：

```go
// 1) 直接リテラル：Type/Required/Properties/Items/Pattern/Format/Enum/Const/
//    UniqueItems/MultipleOf は即座に有効。ただし MinLength/MaxLength/Minimum/Maximum/
//    MinItems/MaxItems/ExclusiveMinimum/ExclusiveMaximum は無効（下記説明を参照）
schema := &json.Schema{Type: "string", Pattern: `^\d+$`}

// 2) NewSchemaWithConfig：SchemaConfig のポインタフィールドで制約を設定、長さ/範囲系はすべて有効
cfg := json.DefaultSchemaConfig()
cfg.Type = "string"
minLen := 1
cfg.MinLength = &minLen
schema := json.NewSchemaWithConfig(cfg)

// 3) DefaultSchema：デフォルト値付きの Schema を返す（AdditionalProperties は true）
schema := json.DefaultSchema()
```

::: warning 長さ/範囲制約には NewSchemaWithConfig が必須
`MinLength`、`MaxLength`、`Minimum`、`Maximum`、`MinItems`、`MaxItems`、`ExclusiveMinimum`、`ExclusiveMaximum` の一連の制約は、`Schema` 内部の外部から設定できないトラッキングフラグに依存します。`&json.Schema{...}` リテラルでこれらのフィールドに値を代入しても**有効になりません**。`NewSchemaWithConfig` で対応する**ポインタフィールド**（例：`cfg.MinLength = &v`）を渡して初めて有効になります。`Type`、`Required`、`Properties`、`Items`、`Pattern`、`Format`、`Enum`、`Const`、`UniqueItems`、`MultipleOf` はこの制限を受けず、リテラルでも `NewSchemaWithConfig` でも有効です。
:::

## Config の検証関連フィールド

| フィールド | 型 | 説明 |
|------|------|------|
| `EnableValidation` | `bool` | 入力検証を有効化（操作前のセキュリティ/構造検証に影響） |
| `ValidateInput` | `bool` | 入力 JSON を検証 |
| `SkipValidation` | `bool` | 非必須検証をスキップ（信頼できる入力向け） |

::: warning 未接続の拡張フィールド
`Config.CustomValidators`（`[]Validator`）と `Validator` インターフェースは現在のバージョンでは**宣言済みで設定のクローンとキャッシュキー計算に参加しますが、操作パイプラインにはまだ接続されていません**。`Config.CustomValidators`（または `Config.AddValidator`）でバリデータを登録しても**いかなる操作の実行にも影響しません**——操作がカスタムバリデータによって拒否されることはありません。`Validator` インターフェースは現在予約インターフェースです：

```go
// 現バージョン：宣言済みだが未接続、登録しても操作に影響なし（予約インターフェース）
type Validator interface {
    Validate(jsonStr string) error
}
```

操作前後にカスタム検証を行う必要がある場合は、すでに有効な [Hooks フック](./hooks)（例：`ValidationHook`）を使用してください。
:::

## 関連

- [インターフェース定義](../api-reference/interfaces) - `Validator` インターフェース（予約）と `Schema` 関連型
- [設定オプション](../api-reference/config) - 検証関連の設定フィールド
- [Hooks フック](./hooks) - 有効な操作前後インターセプトメカニズム（`ValidationHook` を含む）
