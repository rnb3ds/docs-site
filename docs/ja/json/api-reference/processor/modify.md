---
sidebar_label: "変更操作"
title: "Processor データ変更 - CyberGo JSON | API リファレンス"
description: "CyberGo JSON Processor 変更メソッド：Set 設定、SetMultiple 一括、SetCreate 自動作成、SetMultipleCreate 一括作成、いずれもイミュータブルに新しい文字列を返し、SetFromParsed で事前解析後の連続変更が可能。全メソッドがチェーンに対応。"
sidebar_position: 3
---

# データ変更メソッド

Processor はデータ変更メソッドを提供します。すべてのメソッドは**変更後の新しい JSON 文字列を返します**（イミュータブルなセマンティクスで、元の文字列は変更されません）。メソッドチェーンに対応しています。削除系メソッドは[削除操作](./delete)を参照してください。メソッドの動作は[パッケージレベル変更関数](../functions/modify)と一致します。本ページは Processor 側の設定セマンティクス（`CreatePaths` の優先順位、`ContinueOnError`）とチェーンパターンに焦点を当てます。

## イミュータブルなセマンティクス

すべての変更メソッドは**新しい JSON 文字列**を返し、元の入力文字列は決して変更されません（Go の文字列はもともとイミュータブルです）。操作が失敗した場合は元の文字列とエラーを返すため、安全なデグレードが容易です：

```go
original := `{"user":{"name":"Alice"}}`

// Set は新しい文字列を返し、original は変わらない
modified, err := p.Set(original, "user.name", "Bob")
// original は {"user":{"name":"Alice"}} のまま
// modified は {"user":{"name":"Bob"}}

// 失敗時は元の文字列 + エラーを返す
result, err := p.Set(original, "nonexistent.deep.path", "x")
// result == original（CreatePaths=false でパスが存在しない場合）
```

**完全なサンプル**

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

	original := `{"user":{"name":"Alice"}}`
	modified, err := p.Set(original, "user.name", "Bob")
	if err != nil {
		panic(err)
	}
	fmt.Println(original) // 出力: {"user":{"name":"Alice"}}
	fmt.Println(modified) // 出力: {"user":{"name":"Bob"}}
}
```

## Set

シグネチャ：`func (p *Processor) Set(jsonStr, path string, value any, cfg ...Config) (result string, err error)`

指定パスに値を設定し、変更後の JSON 文字列を返します。存在しない中間パスを自動作成するかは `Config.CreatePaths` によります（[CreatePaths と SetCreate](#createpaths-と-setcreate)を参照）。

```go
result, err := p.Set(data, "user.name", "NewName")
```

複数の型の値を設定できます：

```go
// 文字列
result, _ := p.Set(data, "user.name", "CyberGo")

// 数値
result, _ = p.Set(data, "user.age", 25)

// ブール値
result, _ = p.Set(data, "user.active", true)

// オブジェクト
result, _ = p.Set(data, "user.profile", map[string]any{
    "bio":      "Developer",
    "location": "China",
})

// 配列
result, _ = p.Set(data, "items", []any{"a", "b", "c"})
```

**完全なサンプル：ネストパスの変更**

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

	data := `{"user":{"name":"Alice","address":{"city":"Beijing"}}}`
	result, err := p.Set(data, "user.address.city", "Shanghai")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 出力: {"user":{"address":{"city":"Shanghai"},"name":"Alice"}}
}
```

## SetMultiple

シグネチャ：`func (p *Processor) SetMultiple(jsonStr string, updates map[string]any, cfg ...Config) (string, error)`

複数パスの値を一括設定し、変更後の JSON 文字列を返します。`Set` を複数回呼び出すのに比べ、`SetMultiple` は JSON を 1 回だけ解析し、1 回の走査ですべての更新を適用するため、より効率的です。パスを作成するかは `Config.CreatePaths` によります。

```go
result, err := p.SetMultiple(data, map[string]any{
    "user.name":   "CyberGo",
    "user.age":    25,
    "user.active": true,
})
```

**完全なサンプル：既存フィールドの一括更新**

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

	data := `{"user":{"name":"Alice","age":25,"email":"a@x.com"}}`
	result, err := p.SetMultiple(data, map[string]any{
		"user.name":  "Bob",
		"user.age":   26,
		"user.email": "b@x.com",
	})
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 出力: {"user":{"age":26,"email":"b@x.com","name":"Bob"}}
}
```

::: tip ContinueOnError と決定的な順序
- デフォルト（`ContinueOnError=false`）では、最初に失敗したパスの時点で元の文字列とエラーを返します。有効にすると失敗パスをスキップして残りのパスへの書き込みを続け、すべてが失敗した場合にのみエラーを返します。このフィールドは `SetMultiple` にのみ作用し、[`ProcessBatch`](./batch) の組み込みの操作ごとの隔離とは無関係です。
- 更新は**パスの辞書順**に順次適用され、重複パス（`a` と `a.b` など）の結果は確定的です：`a` が先に確定し、`a.b` は常に新規作成されたコンテナに書き込まれ、map 反復のランダム順序の影響を受けません。
:::

## SetCreate

シグネチャ：`func (p *Processor) SetCreate(jsonStr, path string, value any, cfg ...Config) (string, error)`

値を設定し、**存在しない中間パスを自動作成**します。`Set` + `CreatePaths=true` の便利なラッパーで、プロセッサ自身の設定にかかわらずパスを作成します。詳しくは[CreatePaths と SetCreate](#createpaths-と-setcreate)を参照してください。

**中間オブジェクトの作成**

```go
// user.profile が存在しない場合はオブジェクトとして自動作成
result, err := p.SetCreate(data, "user.profile.bio", "Developer")
// {"user":{"profile":{"bio":"Developer"}}}
```

**完全なサンプル：中間オブジェクトと配列の自動作成**

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

	data := `{"user":{"name":"Alice"}}`

	// ネストされたオブジェクトを作成：user.profile.bio
	result, err := p.SetCreate(data, "user.profile.bio", "Developer")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 出力: {"user":{"name":"Alice","profile":{"bio":"Developer"}}}

	// 配列を作成：user.tags[0] が存在しない場合は配列を作成してインデックス 0 に格納
	result, err = p.SetCreate(data, "user.tags[0]", "admin")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 出力: {"user":{"name":"Alice","tags":["admin"]}}
}
```

## SetMultipleCreate

シグネチャ：`func (p *Processor) SetMultipleCreate(jsonStr string, updates map[string]any, cfg ...Config) (string, error)`

複数の値を一括設定し、中間パスを自動作成します。`SetMultiple` + `CreatePaths=true` の便利なラッパーです。

```go
result, err := p.SetMultipleCreate(data, map[string]any{
    "user.profile.bio":      "Developer",
    "user.profile.location": "China",
})
```

**完全なサンプル：空オブジェクトからネスト構造を一括作成**

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

	data := `{}`
	result, err := p.SetMultipleCreate(data, map[string]any{
		"user.name":        "Alice",
		"user.profile.bio": "Developer",
	})
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 出力: {"user":{"name":"Alice","profile":{"bio":"Developer"}}}
}
```

## 配列要素の追加

パスに `[+]` 構文を使うと、配列の末尾に要素を追加できます。配列長を事前に知る必要はありません。`[+]` は既存の配列パスの後に続ける必要があります（例：`items[+]`）。

```go
data := `{"items":["a","b"]}`

// 単一要素の追加
result, err := p.Set(data, "items[+]", "c")
// {"items":["a","b","c"]}

// 複数要素の追加（スライスを渡すと展開される）
result, err = p.Set(data, "items[+]", []any{"c", "d"})
// {"items":["a","b","c","d"]}
```

**完全なサンプル**

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

	data := `{"items":["a","b"]}`
	result, err := p.Set(data, "items[+]", "c")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 出力: {"items":["a","b","c"]}
}
```

## CreatePaths と SetCreate

パス自動作成の動作には 2 つの制御入口があります。違いを理解すると、「プロセッサ設定による制御」と「呼び出しによる強制」の選択がしやすくなります：

| 方式 | 動作 | 適したシナリオ |
|------|------|----------|
| `Config.CreatePaths`（デフォルト `true`） | プロセッサレベルのスイッチ。`Set` / `SetMultiple` に影響 | **専用**プロセッサを構築し、パス作成を一括してオン/オフする |
| `SetCreate` / `SetMultipleCreate` | `CreatePaths=true` を強制し、プロセッサ設定を**上書き** | たまにパス作成が必要で、プロセッサ設定を変えたくない |

**設定の優先順位**（高 → 低）：

1. **`SetCreate` / `SetMultipleCreate`** —— 常に `CreatePaths=true` を強制。
2. **per-call `cfg`** —— 明示的に渡された cfg はプロセッサ設定を完全に上書きします（オフにすることを含む）。
3. **プロセッサの `Config.CreatePaths`** —— `cfg` 省略時に有効。

```go
// パス作成をオフにしたプロセッサを構築
cfg := json.DefaultConfig()
cfg.CreatePaths = false
p, _ := json.New(cfg)

// Set はプロセッサ設定に従う：パスが存在しない場合はエラー
_, err := p.Set(`{"user":{}}`, "user.profile.bio", "x") // err は非 nil

// SetCreate は強制作成：プロセッサ設定にかかわらず
result, _ := p.SetCreate(`{"user":{}}`, "user.profile.bio", "x")
// {"user":{"profile":{"bio":"x"}}}

// per-call cfg がプロセッサ設定を上書き（ここでは再度オン）
result, _ = p.Set(`{"user":{}}`, "user.profile.bio", "x", json.DefaultConfig())
// {"user":{"profile":{"bio":"x"}}}
```

## チェーン変更

変更メソッドは新しい文字列を返すため、前ステップの結果を次ステップの入力としてチェーン操作ができます：

```go
processor, _ := json.New()

result1, _ := processor.Set(data, "user.name", "CyberGo")
result2, _ := processor.Set(result1, "user.version", "1.0.0")
finalResult, _ := processor.Delete(result2, "user.temporary")
```

## Processor マージメソッド

Processor はパッケージレベルの [MergeJSON](../functions/modify#mergejson)、[MergeMany](../functions/modify#mergemany)、[CompareJSON](../helpers#comparejson) に対応するインスタンスメソッドを提供します。

### Processor.MergeJSON

シグネチャ：`func (p *Processor) MergeJSON(json1, json2 string, cfg ...Config) (string, error)`

cfg からオプションを解析し（**cfg 省略時はプロセッサ自身の設定ではなく DefaultConfig を使用**——カスタム MergeMode でプロセッサを作成した場合、そのモードを適用するには cfg を明示的に渡す必要があります）、`Config.MergeMode` に従って 2 つのオブジェクトをディープマージし、その結果を本プロセッサで再エンコードします。

パッケージレベル関数と同様に、`Processor.MergeJSON` はセキュリティ検証を実行しません——デコード、ディープマージ、再エンコードのみを行う構造的操作ツールです。セキュリティ検証が必要な場合は `CompareJSON` を使用してください（常にセキュリティ検証を実行。cfg が渡されれば cfg に、それ以外はプロセッサ自身の設定に従います）。

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

// ユニオンマージ（デフォルト）
result, err := p.MergeJSON(base, override)

// 積集合マージ
cfg := json.DefaultConfig()
cfg.MergeMode = json.MergeIntersection
result, err = p.MergeJSON(base, override, cfg)
```

### Processor.MergeMany

シグネチャ：`func (p *Processor) MergeMany(jsons []string, cfg ...Config) (string, error)`

`MergeJSON` でスライスを左から右へ畳み込みます。マージ戦略は `Config.MergeMode` で決まります（デフォルト `MergeUnion`）。JSON 文字列が 2 個未満の場合はエラーを返し、いずれかのマージステップが失敗した場合は失敗インデックスを含むエラーを返します。

```go
result, err := p.MergeMany([]string{config1, config2, config3})
```

### Processor.CompareJSON

シグネチャ：`func (p *Processor) CompareJSON(json1, json2 string, cfg ...Config) (bool, error)`

2 つの JSON 文字列が等しいか比較します（数値正規化、キー順序無関係）。

::: warning パッケージレベル CompareJSON との違い
パッケージレベルの `CompareJSON` は cfg なしの場合、セキュリティ検証を実行せず、両側を `encoding/json` でマーシャルします。Processor メソッドは**常に**セキュリティ検証を実行し（cfg が渡されれば cfg に、それ以外はプロセッサ自身の設定に従う）、ライブラリのエンコーダで両側を対称にマーシャルするため、設定されたエンコード（`EscapeHTML` など）が対称に適用されます。
:::

```go
equal, err := p.CompareJSON(a, b)
equal, err = p.CompareJSON(a, b, json.SecurityConfig())
```

## 関連

- [パスクエリ](./query) - Get 系メソッド
- [削除操作](./delete) - Delete/DeleteClean メソッド
- [バッチ操作](./batch) - ProcessBatch バッチ処理
- [変更関数](../functions/modify) - パッケージレベル Set/SetMultiple/MergeJSON 関数
