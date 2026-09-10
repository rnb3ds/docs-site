---
sidebar_label: "解析と検証"
title: "解析と検証関数 - CyberGo JSON | API リファレンス"
description: "CyberGo JSON の解析と検証関数：Parse/ParseAny 解析、Valid/ValidWithConfig 検証、ValidateSchema による JSON Schema 検証に加え、解析前にサイズ・ネスト深さ・危険パターンのセキュリティチェックを実行し、完全な処理チェーンをカバーします。"
sidebar_position: 6
---

# 解析と検証関数

json パッケージが提供する解析と検証の関数。JSON のターゲットオブジェクトへの解析、Processor インスタンス経由の解析、JSON 有効性検証、JSON Schema 検証をサポートします。

## 解析関数

### Parse

シグネチャ：`func Parse(jsonStr string, target any, cfg ...Config) error`

JSON 文字列を `target` ポインタが指すオブジェクトに解析します。`target` は**非 nil ポインタ**である必要があります（`nil` や非ポインタを渡すと引数エラーを返します）。`Get` と同様に、`Parse` は解析前に入力に対してセキュリティ検証（サイズ、ネスト深度、危険パターン。`cfg` とプロセッサ設定に従う）を実行します。

**パラメータ**

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `jsonStr` | `string` | はい | JSON 文字列 |
| `target` | `any` | はい | ターゲットオブジェクトへのポインタ |
| `cfg` | `Config` | いいえ | オプション設定 |

**基本的な解析**

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	var data map[string]any
	err := json.Parse(`{"name": "test"}`, &data)
	if err != nil {
		panic(err)
	}
	fmt.Println(data) // map[name:test]
}
```

**構造体への解析**

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

type Person struct {
	Name string `json:"name"`
	Age  int    `json:"age"`
}

func main() {
	var person Person
	err := json.Parse(`{"name": "CyberGo", "age": 30}`, &person)
	if err != nil {
		panic(err)
	}
	fmt.Printf("Name: %s, Age: %d\n", person.Name, person.Age)
}
```

**カスタム設定を使用**

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	cfg := json.DefaultConfig()
	var data map[string]any
	err := json.Parse(`{"name": "test"}`, &data, cfg)
	if err != nil {
		panic(err)
	}
	fmt.Println(data)
}
```

### ParseAny

シグネチャ：`func ParseAny(jsonStr string, cfg ...Config) (any, error)`

JSON 文字列を解析し、ルート値を `any` 型として返します。ターゲット変数を事前に宣言する必要はありません。

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	result, err := json.ParseAny(`{"name": "test"}`)
	if err != nil {
		panic(err)
	}
	fmt.Println(result) // map[name:test]
}
```

::: tip Parse vs ParseAny
- `Parse(jsonStr, &target)` — ターゲットポインタに解析。変数の事前宣言が必要
- `ParseAny(jsonStr)` — `any` 型を直接返す。事前宣言不要
:::

### Processor.Parse

シグネチャ：`func (p *Processor) Parse(jsonStr string, target any, cfg ...Config) error`

Processor インスタンス経由で JSON をターゲットポインタに解析します。

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

var data map[string]any
err = p.Parse(`{"name": "test"}`, &data)
if err != nil {
    panic(err)
}
```

### Processor.ParseAny

シグネチャ：`func (p *Processor) ParseAny(jsonStr string, cfg ...Config) (any, error)`

Processor インスタンス経由で JSON を解析して `any` 型を返します。動作はパッケージレベルの `ParseAny` と同じです。

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

data, err := p.ParseAny(`{"name": "test"}`)
```

詳しくは [Processor 解析メソッド](../processor/parse#解析メソッド)を参照してください。

## 検証関数

### Valid

シグネチャ：`func Valid(data []byte, cfg ...Config) bool`

JSON バイトスライスが有効か検証します。`encoding/json.Valid` と 100% 互換です：cfg なしで `json.Valid(data)` を呼び出した場合、標準ライブラリと完全に一致し、通常の `bool` を返します。

オプションの末尾 `Config` でセキュリティ制限（サイズ、ネスト深度、完全セキュリティスキャンなど）を適用できます。cfg を渡すと、`Valid` は `Processor.Valid` に委譲し、任意のエラーを `false` に畳み込みます。

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := []byte(`{"name": "test"}`)
	// encoding/json 互換（cfg なし）
	if json.Valid(data) {
		fmt.Println("有効な JSON")
	}

	// 設定付き（非破壊的なオプション引数）
	if json.Valid(data, json.SecurityConfig()) {
		fmt.Println("セキュリティ検証を通過")
	}
}
```

::: tip Valid vs ValidWithConfig
- `Valid(data, cfg)` は単一の `bool` を返す（`encoding/json` 互換）。任意のエラーは `false` に畳み込まれる
- `ValidWithConfig(jsonStr, cfg)` は `(bool, error)` を返し、検証失敗の原因を確認しやすい

両方とも `cfg` を受け取ります。名前の違いは歴史的な経緯によるものです。
:::

### ValidWithConfig

シグネチャ：`func ValidWithConfig(jsonStr string, cfg ...Config) (bool, error)`

設定を使用して JSON 文字列が有効か検証し、エラー情報も返します。

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	cfg := json.DefaultConfig()
	valid, err := json.ValidWithConfig(`{"name": "test"}`, cfg)
	if err != nil {
		panic(err)
	}
	if valid {
		fmt.Println("有効な JSON")
	}
}
```

### ValidateSchema

シグネチャ：`func ValidateSchema(jsonStr string, schema *Schema, cfg ...Config) ([]ValidationError, error)`

JSON Schema で JSON データを検証します。すべての検証エラーのリストを返します。

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
			"age":   {Type: "number"}, // 数値はすべて "number" を使用（整数を含む）
		},
	}

	errors, err := json.ValidateSchema(`{"name":"Alice","email":"alice@example.com","age":25}`, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errors {
		fmt.Printf("パス %s: %s\n", e.Path, e.Message)
	}
}
```

::: warning 2 点注意
- `Type` に `"integer"` はありません——JSON 解析後のすべての数値は `float64` のため、数値には常に `"number"` を使ってください。
- `MinLength`/`Minimum` などの**長さ/区間系の制約**は `&json.Schema{...}` リテラルに直接書いても有効になりません。[`NewSchemaWithConfig`](../schema#schema-の作成方法) で作成する必要があります。詳しくは [Schema 検証](../schema)を参照してください。
:::

::: tip 詳しくは
完全な Schema 型定義とバリデータの使い方は [Schema 検証](../schema)を参照してください。
:::

## 関連

- [クエリと取得関数](./query) - Get, GetString などのクエリ操作
- [Processor 解析メソッド](../processor/parse) - Processor レベルの解析と検証メソッド詳解
