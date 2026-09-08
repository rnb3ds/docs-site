---
sidebar_label: "変更操作"
title: "変更関数 - CyberGo JSON | API リファレンス"
description: "CyberGo JSON の変更関数：Set/SetMultiple で設定、MergeJSON/MergeMany でマージ。パス自動生成とアトミック操作に対応し、和集合・積集合・差集合の 3 種の MergeMode 戦略、配列パスではインデックス置換と追加が可能、元入力を変更せず新しい文字列を返します。"
sidebar_position: 3
---

# 変更関数

json パッケージが提供する JSON 変更関数。パス設定、バッチ更新、マージ操作をサポートします。

## 設定関数

### Set

シグネチャ：`func Set(jsonStr, path string, value any, cfg ...Config) (string, error)`

指定パスに値を設定し、変更後の JSON 文字列を返します。

**パラメータ**

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `jsonStr` | `string` | はい | JSON 文字列 |
| `path` | `string` | はい | パス式 |
| `value` | `any` | はい | 設定する値 |
| `cfg` | `Config` | いいえ | オプション設定 |

**戻り値とエラー**

成功時は変更後の JSON 文字列と `nil` を返します。失敗時は**元の未変更の** `jsonStr` とエラーを返します（`Delete` と一致する契約。センチネル値は `errors.Is` で判定可能）：

| エラー | トリガーシナリオ |
|------|----------|
| `ErrInvalidJSON` | `jsonStr` が正当な JSON でない |
| `ErrInvalidPath` | パス式の構文が不正 |
| `ErrPathNotFound` | パスが存在せず `CreatePaths = false` |
| `ErrTypeMismatch` | ターゲット位置に型競合があり書き込めない |

**サンプル**

```go
result, err := json.Set(`{"user":{}}`, "user.name", "Alice")
if err != nil {
    panic(err)
}
fmt.Println(result) // {"user":{"name":"Alice"}}
```

**パスが存在しない場合は自動作成**

```go
// 中間パスを自動作成
result, err := json.Set(`{}`, "user.profile.name", "Bob")
// {"user":{"profile":{"name":"Bob"}}}
```

**異なる型の値の設定**

```go
data := `{}`

// 文字列の設定
json.Set(data, "user.name", "Alice")

// 数値の設定
json.Set(data, "user.age", 30)

// ブール値の設定
json.Set(data, "user.active", true)

// null の設定
json.Set(data, "user.deleted", nil)

// ネストされたオブジェクトの設定
json.Set(data, "user.address", map[string]any{
    "city": "Beijing",
    "zip":  "100000",
})

// 配列の設定
json.Set(data, "user.tags", []string{"admin", "developer"})
```

### SetMultiple

シグネチャ：`func SetMultiple(jsonStr string, updates map[string]any, cfg ...Config) (string, error)`

複数パスの値を一括設定します。

**パラメータ**

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `jsonStr` | `string` | はい | JSON 文字列 |
| `updates` | `map[string]any` | はい | パスから値へのマッピング |
| `cfg` | `Config` | いいえ | オプション設定 |

**サンプル**

```go
updates := map[string]any{
    "user.name": "Bob",
    "user.age":  25,
    "user.email": "bob@example.com",
}
result, err := json.SetMultiple(data, updates)
if err != nil {
    panic(err)
}
fmt.Println(result)
```

**パフォーマンス優位性**

複数の変更操作については、`SetMultiple` は `Set` を複数回呼び出すより高効率です：

```go
// 推奨：1 回の呼び出し
updates := map[string]any{"a": 1, "b": 2, "c": 3}
result, err := json.SetMultiple(data, updates)

// 非推奨：複数回の呼び出し
result, err = json.Set(data, "a", 1)
result, err = json.Set(result, "b", 2)
result, err = json.Set(result, "c", 3)
```

### SetCreate

シグネチャ：`func SetCreate(jsonStr, path string, value any, cfg ...Config) (string, error)`

値を設定し、存在しない中間パスを自動作成します。`Set` に `CreatePaths` の**強制有効**を組み合わせたものと等価です：追加で `cfg` を渡しても残りのフィールドは通常どおりマージされますが、`CreatePaths` は常に `true` に強制されます（「ここではパス作成を許可する」を明示的に自己文書化）。デフォルトの `Config.CreatePaths` 自体が `true` のため、cfg なしでは `SetCreate` と `Set` の動作は同じです。

```go
// 中間パスが存在しない場合は自動作成
result, err := json.SetCreate(`{}`, "user.profile.bio", "Developer")
// {"user":{"profile":{"bio":"Developer"}}}
```

### SetMultipleCreate

シグネチャ：`func SetMultipleCreate(jsonStr string, updates map[string]any, cfg ...Config) (string, error)`

複数の値を一括設定し、中間パスを自動作成します。`SetMultiple` との関係は上記と同じです：`cfg` の残りのフィールドは通常どおり有効で、`CreatePaths` は `true` に強制されます。

```go
result, err := json.SetMultipleCreate(`{}`, map[string]any{
    "user.profile.bio":      "Developer",
    "user.profile.location": "China",
})
```

## 配列パスの変更

`Set` 系は配列パスに対して専用の動作をします。パス構文の詳細は[パス式の構文](../../getting-started/path-syntax)を参照してください：

```go
data := `{"items": ["a", "b", "c"]}`

// インデックス置換（負インデックスを含む）
r1, _ := json.Set(data, "items[0]", "x")    // {"items":["x","b","c"]}
r2, _ := json.Set(data, "items[-1]", "z")   // {"items":["a","b","z"]}

// 要素の追加
r3, _ := json.Set(data, "items[+]", "d")    // {"items":["a","b","c","d"]}

// ワイルドカード：全要素を同じ値に置換
r4, _ := json.Set(data, "items[*]", "-")    // {"items":["-","-","-"]}

// ネスト：配列要素のフィールド（パスが存在しない場合は自動作成）
users := `{"users": [{"name": "Alice"}]}`
r5, _ := json.Set(users, "users[0].age", 30)
// {"users":[{"age":30,"name":"Alice"}]}

r6, _ := json.SetCreate(`{}`, "users[0].profile.bio", "Developer")
// {"users":[{"profile":{"bio":"Developer"}}]}
```

::: warning スライスセグメントの制限
`items[1:3]` のような**スライスセグメント**はクエリ（サブ配列を返す）には問題なく使えますが、`Set`/`Delete` の**最後のセグメント**として使う場合、現バージョンではエラーを返します（"distributed set ops on slices not yet supported"）——つまり「範囲内のすべての要素を書き換える」分散変更はサポートされません。このような効果が必要な場合は、`ForeachReturn` かワイルドカードパスを使ってください。
:::

## マージ関数

### MergeJSON

シグネチャ：`func MergeJSON(json1, json2 string, cfg ...Config) (string, error)`

ディープマージ戦略で 2 つの JSON オブジェクトをマージします。ネストされたオブジェクトについては、`Config.MergeMode` で指定されたモードに従ってキーを再帰的にマージします。プリミティブ値と配列については、patch 側の値が優先されます。

**パラメータ**

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `json1` | `string` | はい | ベース JSON 文字列 |
| `json2` | `string` | はい | 上書き JSON 文字列 |
| `cfg` | `...Config` | いいえ | オプション設定（`MergeMode` でマージモードを設定） |

**マージモード**（`Config.MergeMode` で設定、デフォルトは `MergeUnion`）：

| モード | オブジェクトの動作 | 配列の動作 |
|------|----------|----------|
| `MergeUnion` | すべてのキーをマージ。競合時は patch の値を使用 | すべての要素をマージして重複排除 |
| `MergeIntersection` | 共通のキーのみ保持。値は patch 由来 | 共通の要素のみ保持 |
| `MergeDifference` | base 独自のキーのみ保持 | base 独自の要素のみ保持 |

```go
base := `{"a": 1, "b": 2, "nested": {"x": 10, "y": 20}}`
override := `{"b": 3, "c": 4, "nested": {"y": 30, "z": 40}}`

// ユニオンマージ（デフォルト）
result, _ := json.MergeJSON(base, override)
// 結果: {"a":1,"b":3,"c":4,"nested":{"x":10,"y":30,"z":40}}

// 積集合マージ - 共通キーのみ保持
cfg := json.DefaultConfig()
cfg.MergeMode = json.MergeIntersection
result, _ = json.MergeJSON(base, override, cfg)
// 結果: {"b":3,"nested":{"y":30}}

// 差集合マージ - base 独自のキーのみ保持
cfg = json.DefaultConfig()
cfg.MergeMode = json.MergeDifference
result, _ = json.MergeJSON(base, override, cfg)
// 結果: {"a":1,"nested":{"x":10}}
```

**配列フィールドの 3 モード比較**（配列は添字上書きではなく要素単位で**重複排除マージ**されます）：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	base := `{"tags":[1,2,3],"roles":["dev"]}`
	override := `{"tags":[3,4]}`

	// ユニオン：base の要素が先頭で、override の新要素を追加して重複排除
	union, _ := json.MergeJSON(base, override)
	fmt.Println(union)
	// 出力: {"roles":["dev"],"tags":[1,2,3,4]}

	// 積集合：両辺に現れる要素のみ保持（base の順序を維持）
	cfg := json.DefaultConfig()
	cfg.MergeMode = json.MergeIntersection
	inter, _ := json.MergeJSON(base, override, cfg)
	fmt.Println(inter)
	// 出力: {"tags":[3]}

	// 差集合：base 独自の要素のみ保持（roles キーは base にしかないためそのまま保持）
	cfg.MergeMode = json.MergeDifference
	diff, _ := json.MergeJSON(base, override, cfg)
	fmt.Println(diff)
	// 出力: {"roles":["dev"],"tags":[1,2]}
}
```

::: warning トップレベル入力は JSON オブジェクトである必要あり
`MergeJSON` は 2 つのトップレベル入力がどちらも JSON オブジェクト（`{...}`）であることを要求します。どちらかが配列やスカラーの場合はエラーを返します（`first JSON is not an object` / `second JSON is not an object`）。上の表の「配列の動作」は**オブジェクトフィールド内の配列**に対するものです——両辺の同名フィールドがどちらも配列の場合、要素の重複排除/積集合/差集合を取ります（差集合モードでは結果が空配列でもキーは保持されます）。両辺の同名フィールドの型が一致しない場合（片方が配列、片方がスカラーなど）は：union/intersection は override の値を採用し、difference はそのキーを破棄します。
:::

### MergeMany

シグネチャ：`func MergeMany(jsons []string, cfg ...Config) (string, error)`

複数の JSON オブジェクトをマージします。少なくとも 2 つの JSON 文字列が必要です。`Config.MergeMode` でのマージモード設定に対応しています。

**パラメータ**

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `jsons` | `[]string` | はい | マージする JSON 文字列のスライス（2 つ以上） |
| `cfg` | `...Config` | いいえ | オプション設定（`MergeMode` でマージモードを設定） |

```go
config1 := `{"api": "v1", "timeout": 30, "retries": 1}`
config2 := `{"timeout": 60, "retries": 3}`
config3 := `{"retries": 5, "debug": true}`

// デフォルトのユニオンマージ
result, err := json.MergeMany([]string{config1, config2, config3})
// 結果: {"api":"v1","timeout":60,"retries":5,"debug":true}
```

**マージ順序とエラー**：左から右へ畳み込みます——`MergeMany([a, b, c])` は `MergeJSON(MergeJSON(a, b), c)` と等価で、右側（添字が大きい）の値が競合時に勝ちます。入力が 2 個未満の場合は即座にエラー。いずれかのステップでマージが失敗すると、失敗した添字をラップしたエラーを返します（`merge failed at index i: ...`）。部分的な結果は生成されません。

## Processor メソッド

Processor は対応する変更・マージメソッドを提供します。シグネチャはパッケージレベル関数と同一です：

```go
p, err := json.New()

result, err := p.Set(jsonStr, "user.name", "Alice")
result, err = p.Delete(jsonStr, "user.temp")
result, err = p.SetCreate(jsonStr, "user.email", "test@example.com")
```

**事前解析バリアント SetFromParsed**：`PreParse` と組み合わせて、同じ解析済みデータに対して連続変更を行い、重複解析をスキップします：

```go
parsed, err := p.PreParse(jsonStr) // 1 回だけ解析
if err != nil {
    panic(err)
}
defer parsed.Release()

// 1 回目の変更：新しい ParsedJSON を返し、チェーン変更を続けられる
parsed2, err := p.SetFromParsed(parsed, "user.name", "Alice")
if err != nil {
    panic(err)
}
parsed3, err := p.SetFromParsed(parsed2, "user.age", 30)
if err != nil {
    panic(err)
}

// 最終的な JSON テキストを取得
final := parsed3.Data() // any（map[string]any / []any）
```

::: tip
`SetFromParsed` は**新しい** `*ParsedJSON` を返します（中間結果は相互に影響しません）。「同じ大型 JSON に連続して複数箇所変更する」シナリオに適しています。`GetFromParsed` と対になっています。[Processor 解析メソッド](../processor/parse#setfromparsed)を参照してください。
:::

`MergeJSON`、`MergeMany` にも対応する Processor メソッドがあり、シグネチャはパッケージレベル関数と同一です。設定済み Processor の再利用に便利です：

```go
result, err := p.MergeJSON(base, override)

merged, err := p.MergeMany([]string{config1, config2, config3})

// CompareJSON にも Processor メソッドがあります（注意：Processor.CompareJSON は
// 常にセキュリティ検証を実行します。cfg なしのパッケージレベル関数とは異なります）
equal, err := p.CompareJSON(a, b)
```

詳しくは [Processor データ変更](../processor/modify#processor-マージメソッド)を参照してください。

## 関連

- [クエリと取得関数](./query) - Get, GetString などのクエリ操作
- [バッチ操作関数](./batch) - ProcessBatch バッチ処理
- [エンコード出力関数](./output) - Marshal, Unmarshal などのシリアライズ操作
- [補助関数](../helpers) - CompareJSON などのユーティリティ関数
