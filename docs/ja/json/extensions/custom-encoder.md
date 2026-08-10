---
sidebar_label: "カスタムエンコーダ"
title: "CustomEncoder - CyberGo JSON | カスタムエンコーダ"
description: "CyberGo JSON カスタムエンコーダ：CustomEncoder インターフェースと TypeEncoder 型エンコーダの定義と実装で、Go 型に JSON シリアライズロジックを登録します。"
sidebar_position: 3
---

# カスタムエンコード

json ライブラリは標準ライブラリ `encoding/json` とエンコード互換性を保つため、カスタム型の JSON 形態は主に標準ライブラリのインターフェースを実装することで行います。本ページでは**現在のバージョンで実際に有効な**エンコード拡張ポイントを紹介します：

- [`json.Marshaler`](#json-marshaler-インターフェース) —— 型が自身の JSON エンコードをカスタマイズ
- [`encoding.TextMarshaler`](#encoding-textmarshaler-インターフェース) —— 型が自身のテキストエンコードをカスタマイズ（JSON 文字列として出力）
- [`time.Time`](#time-time-の組み込み処理) —— ライブラリ組み込みの RFC3339Nano 時刻フォーマット
- [`Config.CustomEscapes`](#カスタム文字エスケープ-customescapes) —— カスタム文字エスケープマッピング

::: tip インターフェース優先
「ある型をどうエンコードするか」という要件には、优先的に `MarshalJSON` または `MarshalText` を実装してください。これらの実装は本ライブラリ、標準ライブラリ `encoding/json`、および互換性のある任意のライブラリで共用でき、移植性が最も高いです。
:::

## json.Marshaler インターフェース

`MarshalJSON() ([]byte, error)` を実装した型は、自身の JSON 表現を完全に決定できます。ライブラリはエンコード時にこのメソッドを優先的に呼び出します（値レシーバとポインタレシーバの両方に対応）。標準ライブラリ `encoding/json` の動作と一致します。

インターフェースシグネチャ（`encoding/json.Marshaler` と互換）：

```go
type Marshaler interface {
    MarshalJSON() ([]byte, error)
}
```

以下では `Hex` 型を定義し、`uint64` を `0x` プレフィックス付きの 16 進数文字列にエンコードします：

```go
package main

import (
	"fmt"
	"strconv"

	"github.com/cybergodev/json"
)

// Hex は uint64 を十六進数表現でラップする型。
type Hex uint64

// MarshalJSON は json.Marshaler を実装し、数値を "0x.." 文字列にエンコードする。
func (h Hex) MarshalJSON() ([]byte, error) {
	return []byte(`"0x` + strconv.FormatUint(uint64(h), 16) + `"`), nil
}

func main() {
	type Device struct {
		ID    Hex    `json:"id"`
		Label string `json:"label"`
	}
	d := Device{ID: Hex(255), Label: "sensor-1"}

	out, err := json.Marshal(d)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(out))
	// 出力：{"id":"0xff","label":"sensor-1"}
}
```

::: warning 無限再帰の回避
`MarshalJSON` 内部で「通常のエンコード」の補助が必要な場合は、標準ライブラリ `stdjson.Marshal` を使うか、**異なる具象型**に対して本ライブラリを呼び出してください。同じ型に対して再度 `Marshal` を呼び出すと `MarshalJSON` に再入し、無限再帰を引き起こします。
:::

## encoding.TextMarshaler インターフェース

`MarshalJSON` を実装していないが `MarshalText() ([]byte, error)` を実装している型は、テキスト内容を値とする JSON 文字列としてエンコードされます（引用符とエスケープは自動で付加）。テキストだけで形態を完全に表現できる型に適しています。

インターフェースシグネチャ（`encoding.TextMarshaler` と互換）：

```go
type TextMarshaler interface {
    MarshalText() ([]byte, error)
}
```

以下では `Slug` 型を定義し、エンコード時に自動的に小文字ハイフン形式に正規化します：

```go
package main

import (
	"fmt"
	"strings"

	"github.com/cybergodev/json"
)

// Slug は URL フレンドリーな短いテキストを表す。
type Slug string

// MarshalText は encoding.TextMarshaler を実装し、正規化したテキストを出力する。
func (s Slug) MarshalText() ([]byte, error) {
	return []byte(strings.ToLower(strings.ReplaceAll(string(s), " ", "-"))), nil
}

func main() {
	type Article struct {
		Title string `json:"title"`
		Slug  Slug   `json:"slug"`
	}
	a := Article{Title: "Hello World", Slug: Slug("Hello World")}

	out, err := json.Marshal(a)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(out))
	// 出力：{"title":"Hello World","slug":"hello-world"}
}
```

::: tip 2 つのインターフェースの優先度
同じ型が両方のインターフェースを実装している場合、`MarshalJSON` が `MarshalText` より優先されます。型を JSON 文字列にエンコードしたい場合、`MarshalText` の実装は通常より簡潔です（引用符やエスケープを自前で処理する必要がない）。
:::

## time.Time の組み込み処理

ライブラリは `time.Time` を組み込みで処理し、統一的に RFC3339Nano フォーマット（サブ秒精度を保持、標準ライブラリ `encoding/json` と一致）で出力します。設定は不要です：

```go
package main

import (
	"fmt"
	"time"

	"github.com/cybergodev/json"
)

func main() {
	type Event struct {
		Name string    `json:"name"`
		At   time.Time `json:"at"`
	}
	t := time.Date(2026, 1, 15, 10, 30, 0, 0, time.UTC)
	e := Event{Name: "deploy", At: t}

	out, err := json.Marshal(e)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(out))
	// 出力：{"name":"deploy","at":"2026-01-15T10:30:00Z"}
}
```

異なる時刻フォーマットが必要な場合、その型に `MarshalJSON` を実装（[上記](#json-marshaler-インターフェース)を参照）すると組み込み動作を上書きできます——カスタム型の `MarshalJSON` は常に `time.Time` のデフォルト処理より優先されます。

## カスタム文字エスケープ CustomEscapes

`Config.CustomEscapes` は `map[rune]string` で、特定の文字のエスケープ方式を**グローバルに上書き**するために使用します。文字列をエンコードする際、ライブラリはまずこのマップを検索します：ヒットすれば対応する文字列をそのまま出力に書き込み（JSON の合法性は各自で保証）、非ヒットの場合はデフォルトのエスケープが適用されます。

以下では著作権記号 `©` を ASCII テキストに書き換えます（ヒットすればそのまま書き込み、それ以外の文字はデフォルト処理）：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	cfg := json.DefaultConfig()
	// © はデフォルトでそのまま出力されるが、ここでは ASCII テキストに書き換え
	cfg.CustomEscapes = map[rune]string{
		'©': "(c)",
	}

	out, err := json.EncodeWithConfig(map[string]string{"note": "Copyright © 2026"}, cfg)
	if err != nil {
		panic(err)
	}
	fmt.Println(out)
	// 出力：{"note":"Copyright (c) 2026"}
}
```

::: warning カスタムエスケープ文字列は JSON 合法である必要あり
`CustomEscapes` の値は**そのまま出力**に書き込まれ、二重処理されません。そのため Go ソースコード自身の文字列エスケープに注意してください：出力にリテラルのバックスラッシュエスケープシーケンスを持たせたい場合、Go ソースコードではダブルバックスラッシュ `\\` と書く必要があります（シングルバックスラッシュで書くと Go がエスケープとして処理し、シーケンスではなくその文字自体が得られます）。
:::

::: tip カスタムエスケープパスがいつトリガーされるか
`CustomEscapes`（非 nil）を設定するとカスタムエンコードパスが有効になります。このパスは同時に `EscapeHTML`、`EscapeUnicode`、`EscapeSlash`、`EscapeNewlines`、`EscapeTabs`、`SortKeys`、`FloatPrecision`、`IncludeNulls` などのフィールドも読み取ります（詳細は[設定オプション](../api-reference/config)を参照）。
:::

## 拡張ポイントの選び方

| 要件 | 使用方法 |
|------|----------|
| ある型が自身の JSON 形態をカスタマイズ | `MarshalJSON()` を実装 |
| ある型を JSON 文字列としてエンコード（テキスト表現） | `MarshalText()` を実装 |
| 特定の文字のエスケープルールをグローバルに変更 | `Config.CustomEscapes` |
| インデント、HTML エスケープ、Unicode エスケープ、キーソート、浮動小数点精度などを制御 | `Config` の `Pretty`/`EscapeHTML`/`EscapeUnicode`/`SortKeys`/`FloatPrecision` などのフィールド（[設定オプション](../api-reference/config)を参照） |
| `time.Time` のデフォルト時刻フォーマットを上書き | カスタム時刻型に `MarshalJSON()` を実装 |

## Config で有効なエンコード関連フィールド

| フィールド | 型 | 説明 |
|------|------|------|
| `CustomEscapes` | `map[rune]string` | カスタム文字エスケープマッピング（ヒット時にそのまま出力） |
| `EscapeHTML` | `bool` | `<` `>` `&` をエスケープするか（デフォルト `true`） |
| `EscapeUnicode` | `bool` | `>0x7F` の文字を `\uXXXX` にエスケープするか |
| `EscapeSlash` | `bool` | `/` をエスケープするか |
| `EscapeNewlines` / `EscapeTabs` | `bool` | 改行/タブをエスケープするか |
| `SortKeys` | `bool` | オブジェクトキーをソートするか（オブジェクトキーはデフォルトでソート済み） |
| `FloatPrecision` | `int` | 浮動小数点精度（`-1` でデフォルト） |
| `IncludeNulls` | `bool` | null 値フィールドを含めるか |

## 未接続の拡張フィールド（予約）

::: warning 未接続の拡張フィールド
`Config.CustomEncoder`（`CustomEncoder` インターフェース）と `Config.CustomTypeEncoders`（`TypeEncoder` インターフェース）は現在のバージョンでは**宣言済みで設定のクローンとキャッシュキー計算に参加しますが、エンコードパイプラインにはまだ接続されていません**。これらのフィールドを設定しても**エンコード出力は変わりません**。これらは将来のバージョンのために予約された拡張ポイントです。それまでは、上記の `MarshalJSON`/`MarshalText`/`CustomEscapes` など、すでに有効なメカニズムを使用してください。

```go
// 現バージョン：以下 2 つのフィールドは宣言済みだが未接続、設定しても効果なし（予約インターフェース）
type CustomEncoder interface {
    Encode(value any) (string, error)
}

type TypeEncoder interface {
    Encode(v reflect.Value) (string, error)
}
```
:::

## 関連

- [インターフェース定義](../api-reference/interfaces) - `Marshaler` / `TextMarshaler` / `CustomEncoder` / `TypeEncoder` インターフェース
- [設定オプション](../api-reference/config) - エンコード関連の設定フィールド
- [Hooks フック](./hooks) - 操作前後のインターセプト（利用可能な検証フックを含む）
