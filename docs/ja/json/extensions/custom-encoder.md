---
sidebar_label: "カスタムエンコーダ"
title: "CustomEncoder - CyberGo JSON | カスタムエンコーダ"
description: "CyberGo JSON カスタムエンコーダ：CustomEncoder インターフェースと TypeEncoder 型エンコーダ、json.Marshaler / TextMarshaler 実装、CustomEscapes エスケープマッピングで、Go 型に JSON シリアライズロジックを登録します。"
sidebar_position: 2
---

# カスタムエンコード

json ライブラリは標準ライブラリ `encoding/json` とエンコード互換を維持しているため、カスタム型の JSON 形態は主に標準ライブラリインターフェースの実装で行います。本ページは**現バージョンで実際に有効**なエンコード拡張点を紹介します：

- [`json.Marshaler`](#json-marshaler-インターフェース) —— 型自身の JSON エンコードをカスタマイズ
- [`encoding.TextMarshaler`](#encoding-textmarshaler-インターフェース) —— 型自身のテキストエンコードをカスタマイズ（JSON 文字列として出力）
- [`time.Time`](#time-time-の組み込み処理) —— ライブラリ内蔵の RFC3339Nano 時刻フォーマット
- [`Config.CustomEscapes`](#カスタム文字エスケープ-customescapes) —— カスタム文字エスケープマップ

::: tip インターフェース優先
「ある型をどうエンコードするか」という要件には、まず `MarshalJSON` か `MarshalText` の実装を検討してください。この種の実装は本ライブラリ、標準ライブラリ `encoding/json`、および互換ライブラリのすべてで共用でき、移植性が最も高いです。
:::

## json.Marshaler インターフェース

`MarshalJSON() ([]byte, error)` を実装した型は、自身の JSON 表現を完全に決定できます。ライブラリはエンコード時にこのメソッドを優先的に呼び出します（値レシーバとポインタレシーバの両方に対応）。標準ライブラリ `encoding/json` の動作と一致します。

インターフェースシグネチャ（`encoding/json.Marshaler` 互換）：

```go
type Marshaler interface {
    MarshalJSON() ([]byte, error)
}
```

次は Hex 型を定義し、`uint64` を `0x` プレフィックス付きの 16 進文字列にエンコードします：

```go
package main

import (
	"fmt"
	"strconv"

	"github.com/cybergodev/json"
)

// Hex は uint64 を 16 進表現でラップする型。
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
	// 出力: {"id":"0xff","label":"sensor-1"}
}
```

::: warning 無限再帰を避ける
`MarshalJSON` の内部で「通常エンコード」の助けが必要な場合は、標準ライブラリの `stdjson.Marshal` を使うか、**異なる具象型**に対して本ライブラリを呼び出してください。この型自体に再び `Marshal` を呼ぶと `MarshalJSON` に再突入し、無限再帰になります。
:::

::: tip エラーと特殊型
`MarshalJSON`/`MarshalText` が返すエラーは `MarshalerError` にラップされて（`errors.As`/`Unwrap` 能力を保持）上位に伝播します。戻り値は正当な JSON である必要があります。標準ライブラリと一致する特殊処理が他に 2 つあります：`[]byte` は base64 文字列にエンコードされます（`[N]byte` 配列はされません）。`MarshalText` を実装した型は map キーのエンコード形式にも使用されます。
:::

## encoding.TextMarshaler インターフェース

`MarshalJSON` を実装せず、`MarshalText() ([]byte, error)` を実装した型は、テキスト内容を値とする JSON 文字列としてエンコードされます（引用符とエスケープは自動付加）。テキストだけで完全に表現できる型に適します。

インターフェースシグネチャ（`encoding.TextMarshaler` 互換）：

```go
type TextMarshaler interface {
    MarshalText() ([]byte, error)
}
```

次は Slug 型を定義し、エンコード時に自動で小文字ハイフン形式へ正規化します：

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
	// 出力: {"title":"Hello World","slug":"hello-world"}
}
```

::: tip 2 つのインターフェースの優先順位
同じ型が両方のインターフェースを実装している場合、`MarshalJSON` が `MarshalText` より優先されます。型を JSON 文字列としてエンコードしたい場合は、`MarshalText` の実装の方が通常は簡潔です（引用符とエスケープの自前処理が不要）。
:::

## time.Time の組み込み処理

`time.Time` は設定なしで正しくエンコードできます：自身が `MarshalJSON` を実装しており（値レシーバ、RFC3339Nano 出力でサブ秒精度を保持）、ライブラリは前述の [`json.Marshaler`](#json-marshaler-インターフェース)機構でそのまま採用します。動作は標準ライブラリ `encoding/json` と一致します。

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
	// 出力: {"name":"deploy","at":"2026-01-15T10:30:00Z"}
}
```

別の時刻フォーマットが必要な場合は、その型に `MarshalJSON` を実装（[前述](#json-marshaler-インターフェース)）すれば組み込み動作を上書きできます——カスタム型の `MarshalJSON` は常に `time.Time` のデフォルト処理より優先されます。

## カスタム文字エスケープ CustomEscapes

`Config.CustomEscapes` は `map[rune]string` で、特定の文字のエスケープ方式を**グローバルに上書き**します。文字列のエンコード時、ライブラリはまずこのマップを検索します：ヒットすれば対応する文字列をそのまま出力に書き込み（JSON の正当性は自己責任）、未ヒットの場合のみデフォルトのエスケープに進みます。

次は著作権記号 `©` を ASCII テキストに書き換えます（ヒット時はそのまま書き込み、他の文字はデフォルト処理）：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	cfg := json.DefaultConfig()
	// © はデフォルトでそのまま出力されるが、ここでは ASCII テキストに書き換える
	cfg.CustomEscapes = map[rune]string{
		'©': "(c)",
	}

	out, err := json.EncodeWithConfig(map[string]string{"note": "Copyright © 2026"}, cfg)
	if err != nil {
		panic(err)
	}
	fmt.Println(out)
	// 出力: {"note":"Copyright (c) 2026"}
}
```

::: warning カスタムエスケープ文字列は JSON 正当である必要あり
`CustomEscapes` の値は**そのまま出力に書き込まれ**、二次処理は行われません。そのため Go ソースコード自体の文字列エスケープに注意してください：出力にリテラルのバックスラッシュエスケープシーケンスを含めたい場合、Go ソースでは二重バックスラッシュ `\\` と書く必要があります（単一バックスラッシュは Go のエスケープとして処理され、シーケンスではなくその文字自体が得られます）。
:::

::: tip カスタムエスケープパスが発動する条件
`CustomEscapes` を設定（非 nil）するとカスタムエンコードパスが有効になります。このパスは `EscapeHTML`、`EscapeUnicode`、`EscapeSlash`、`EscapeNewlines`、`EscapeTabs`、`SortKeys`、`FloatPrecision`、`IncludeNulls` などのフィールドも同時に読み取ります（詳しくは[設定オプション](../api-reference/config)）。
:::

## 拡張点の選び方

| 要件 | 使用方法 |
|------|----------|
| ある型の JSON 形態をカスタマイズ | `MarshalJSON()` を実装 |
| ある型を JSON 文字列としてエンコード（テキスト表現） | `MarshalText()` を実装 |
| 特定文字のエスケープ規則をグローバルに変更 | `Config.CustomEscapes` |
| インデント、HTML エスケープ、Unicode エスケープ、キーソート、浮動小数点精度などを制御 | `Config` の `Pretty`/`EscapeHTML`/`EscapeUnicode`/`SortKeys`/`FloatPrecision` などのフィールド（[設定オプション](../api-reference/config)を参照） |
| `time.Time` のデフォルト時刻フォーマットを上書き | カスタム時刻型に `MarshalJSON()` を実装 |

## Config で有効なエンコード関連フィールド

| フィールド | 型 | 説明 |
|------|------|------|
| `CustomEscapes` | `map[rune]string` | カスタム文字エスケープマップ（ヒット時はそのまま出力） |
| `EscapeHTML` | `bool` | `<` `>` `&` をエスケープするか（デフォルト `true`） |
| `EscapeUnicode` | `bool` | `>0x7F` の文字を `\uXXXX` にエスケープするか |
| `EscapeSlash` | `bool` | `/` をエスケープするか |
| `EscapeNewlines` / `EscapeTabs` | `bool` | 改行/タブ文字をエスケープするか |
| `SortKeys` | `bool` | オブジェクトキーをソートするか（オブジェクトキーはデフォルトでソート済み） |
| `FloatPrecision` | `int` | 浮動小数点精度（`-1` がデフォルト） |
| `IncludeNulls` | `bool` | 空値フィールドを含めるか |

## 接続されていない拡張フィールド（予約）

::: warning 接続されていない拡張フィールド
`Config.CustomEncoder`（`CustomEncoder` インターフェース）と `Config.CustomTypeEncoders`（`TypeEncoder` インターフェース）は、現バージョンでは**宣言済みで設定のクローンとキャッシュキー計算には参加しますが、エンコードパイプラインにはまだ接続されていません**。この 2 フィールドを設定しても**エンコード出力は変わりません**。将来のバージョンのために予約された拡張点です。それまでの間は、前述の `MarshalJSON`/`MarshalText`/`CustomEscapes` など有効な機構を使用してください。

```go
// 現バージョン：以下の 2 フィールドは宣言済みだが未接続。設定しても効果はない（予約インターフェース）
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
