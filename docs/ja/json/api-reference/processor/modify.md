---
sidebar_label: "変更操作"
title: "Processor データ変更 - CyberGo JSON | API リファレンス"
description: "CyberGo JSON Processor 変更メソッド：Set 設定、SetMultiple 一括、SetCreate 自動パス作成、SetMultipleCreate 一括作成、全メソッドがメソッドチェーンをサポートします。"
sidebar_position: 3
---

# データ変更メソッド

Processor はデータ変更メソッドを提供します。すべてのメソッドは**変更後の新しい JSON 文字列を返します**（イミュータブルセマンティクス、元の文字列は不変）。メソッドチェーンに対応しています。削除関連メソッドは[削除操作](./delete)を参照してください。

## イミュータブルセマンティクス

すべての変更メソッドは**新しい JSON 文字列**を返し、元の入力文字列は決して変更されません（Go の文字列はそもそもイミュータブルです）。操作失敗時は元の文字列とエラーを返し、安全なフォールバックを可能にします：

```go
original := `{"user":{"name":"Alice"}}`

// Set は新しい文字列を返し、original は不変
modified, err := p.Set(original, "user.name", "Bob")
// original は依然として {"user":{"name":"Alice"}}
// modified は {"user":{"name":"Bob"}}

// 失敗時は元の文字列 + エラーを返す
result, err := p.Set(original, "nonexistent.deep.path", "x")
// result == original（CreatePaths=false かつパスが存在しない場合）
```

**完全な例**

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
    fmt.Println(original) // 出力：{"user":{"name":"Alice"}}
    fmt.Println(modified) // 出力：{"user":{"name":"Bob"}}
}
```

## Set

シグネチャ：`func (p *Processor) Set(jsonStr, path string, value any, cfg ...Config) (result string, err error)`

指定したパスの値を設定し、変更後の JSON 文字列を返します。存在しない中間パスを自動作成するかは `Config.CreatePaths` に依存します（[CreatePaths と SetCreate](#createpaths-と-setcreate) を参照）。

```go
result, err := p.Set(data, "user.name", "NewName")
```

複数の型の値の設定に対応します：

```go
// 文字列
result, _ := p.Set(data, "user.name", "CyberGo")

// 数値
result, _ = p.Set(data, "user.age", 25)

// ブーリアン
result, _ = p.Set(data, "user.active", true)

// オブジェクト
result, _ = p.Set(data, "user.profile", map[string]any{
    "bio":      "Developer",
    "location": "China",
})

// 配列
result, _ = p.Set(data, "items", []any{"a", "b", "c"})
```

**完全な例：ネストされたパスの変更**

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
    // 出力：{"user":{"address":{"city":"Shanghai"},"name":"Alice"}}
}
```

## SetMultiple

シグネチャ：`func (p *Processor) SetMultiple(jsonStr string, updates map[string]any, cfg ...Config) (string, error)`

複数のパスの値をバッチ設定し、変更後の JSON 文字列を返します。`Set` を複数回呼び出す比起きて、`SetMultiple` は JSON を一度だけ解析し、1 回の走査で全更新を適用するため効率的です。パスを作成するかは `Config.CreatePaths` に依存します。

```go
result, err := p.SetMultiple(data, map[string]any{
    "user.name":   "CyberGo",
    "user.age":    25,
    "user.active": true,
})
```

**完全な例：既存フィールドのバッチ更新**

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
    // 出力：{"user":{"age":26,"email":"b@x.com","name":"Bob"}}
}
```

## SetCreate

シグネチャ：`func (p *Processor) SetCreate(jsonStr, path string, value any, cfg ...Config) (string, error)`

値を設定し、**存在しない中間パスを自動作成**します。`Set` + `CreatePaths=true` の便利なラッパーで、プロセッサ自身の設定にかかわらず常にパスを作成します。詳細は[CreatePaths と SetCreate](#createpaths-と-setcreate)を参照。

**中間オブジェクトの作成**

```go
// user.profile が存在しない場合は自動的にオブジェクトとして作成
result, err := p.SetCreate(data, "user.profile.bio", "Developer")
// {"user":{"profile":{"bio":"Developer"}}}
```

**完全な例：中間オブジェクトと配列の自動作成**

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
    // 出力：{"user":{"name":"Alice","profile":{"bio":"Developer"}}}

    // 配列を作成：user.tags[0] が存在しない場合は配列を作成しインデックス 0 に格納
    result, err = p.SetCreate(data, "user.tags[0]", "admin")
    if err != nil {
        panic(err)
    }
    fmt.Println(result)
    // 出力：{"user":{"name":"Alice","tags":["admin"]}}
}
```

## SetMultipleCreate

シグネチャ：`func (p *Processor) SetMultipleCreate(jsonStr string, updates map[string]any, cfg ...Config) (string, error)`

複数の値をバッチ設定し、中間パスを自動作成します。`SetMultiple` + `CreatePaths=true` の便利なラッパーです。

```go
result, err := p.SetMultipleCreate(data, map[string]any{
    "user.profile.bio":      "Developer",
    "user.profile.location": "China",
})
```

**完全な例：空オブジェクトからネスト構造をバッチ作成**

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
    // 出力：{"user":{"name":"Alice","profile":{"bio":"Developer"}}}
}
```

## 配列要素の追加

パスに `[+]` 構文を使うと、配列末尾に要素を追加できます。配列長を事前に知る必要はありません。`[+]` は既存の配列パスに続ける必要があります（例：`items[+]`）。

```go
data := `{"items":["a","b"]}`

// 単一要素の追加
result, err := p.Set(data, "items[+]", "c")
// {"items":["a","b","c"]}

// 複数要素の追加（スライスを渡すと展開される）
result, err = p.Set(data, "items[+]", []any{"c", "d"})
// {"items":["a","b","c","d"]}
```

**完全な例**

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
    // 出力：{"items":["a","b","c"]}
}
```

## CreatePaths と SetCreate

パス自動作成動作には 2 つの制御エントリがあり、違いを理解すると「プロセッサ設定による」と「呼び出しごとの強制」の選択に役立ちます：

| 方式 | 動作 | 適用シナリオ |
|------|------|----------|
| `Config.CreatePaths`（デフォルト `true`） | プロセッサレベルのスイッチ、`Set` / `SetMultiple` に影響 | **専用**プロセッサを構築し、パス作成を統一的に有効化/無効化 |
| `SetCreate` / `SetMultipleCreate` | `CreatePaths=true` を強制し、プロセッサ設定を**上書き** | たまにパス作成が必要で、プロセッサ設定を変更したくない場合 |

**設定の優先度**（高から低）：

1. **`SetCreate` / `SetMultipleCreate`** —— 常に `CreatePaths=true` を強制。
2. **per-call `cfg`** —— 明示的に渡した `cfg` がプロセッサ設定を完全に上書き（無効化を含む）。
3. **プロセッサ `Config.CreatePaths`** —— `cfg` 省略時に有効。

```go
// パス作成を無効化したプロセッサを構築
cfg := json.DefaultConfig()
cfg.CreatePaths = false
p, _ := json.New(cfg)

// Set はプロセッサ設定に従う：パスが存在しない場合はエラー
_, err := p.Set(`{"user":{}}`, "user.profile.bio", "x") // err は非 nil

// SetCreate は強制作成：プロセッサ設定にかかわらず
result, _ := p.SetCreate(`{"user":{}}`, "user.profile.bio", "x")
// {"user":{"profile":{"bio":"x"}}}

// per-call cfg がプロセッサ設定を上書き（ここでは再度有効化）
result, _ = p.Set(`{"user":{}}`, "user.profile.bio", "x", json.DefaultConfig())
// {"user":{"profile":{"bio":"x"}}}
```

## チェーン変更

変更メソッドは新しい文字列を返すため、前ステップの結果を次ステップの入力としてチェーン操作を実現できます：

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

cfg からオプションを解析し（**cfg 省略時は DefaultConfig を使用し、プロセッサ自身の設定ではありません**——プロセッサがカスタム MergeMode で作成された場合、そのモードを適用するには明示的に cfg を渡す必要があります）、`Config.MergeMode` に従って 2 つのオブジェクトをディープマージし、本プロセッサで結果を再エンコードします。

パッケージレベル関数と同様に、`Processor.MergeJSON` はセキュリティ検証を行いません——デコード、ディープマージ、再エンコードのみを行う構造的ツールです。セキュリティ検証が必要な場合は `CompareJSON` を使ってください（常にセキュリティ検証を実行、cfg 渡し時は cfg に従い、そうでなければプロセッサ自身の設定に従う）。

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

// ユニオンマージ（デフォルト）
result, err := p.MergeJSON(base, override)

// インターセクションマージ
cfg := json.DefaultConfig()
cfg.MergeMode = json.MergeIntersection
result, err = p.MergeJSON(base, override, cfg)
```

### Processor.MergeMany

シグネチャ：`func (p *Processor) MergeMany(jsons []string, cfg ...Config) (string, error)`

`MergeJSON` でスライスを左から右へ折りたたみます。マージ戦略は `Config.MergeMode`（デフォルト `MergeUnion`）で決まります。JSON 文字列が 2 つ未満の場合はエラーを返し、いずれかのマージステップが失敗した場合は失敗したインデックスを含むエラーを返します。

```go
result, err := p.MergeMany([]string{config1, config2, config3})
```

### Processor.CompareJSON

シグネチャ：`func (p *Processor) CompareJSON(json1, json2 string, cfg ...Config) (bool, error)`

2 つの JSON 文字列が等しいか比較します（数値正規化、キー順序無関係）。

::: warning パッケージレベル CompareJSON との違い
パッケージレベル `CompareJSON` は cfg なしの場合はセキュリティ検証を行わず、両側に `encoding/json` でマーシャルします。Processor メソッドは**常に**セキュリティ検証を実行し（cfg 渡し時は cfg に従い、そうでなければプロセッサ自身の設定に従う）、ライブラリのエンコーダで両側を対称的にマーシャルするため、設定されたエンコード（`EscapeHTML` など）が対称的に適用されます。
:::

```go
equal, err := p.CompareJSON(a, b)
equal, err = p.CompareJSON(a, b, json.SecurityConfig())
```

## 関連

- [パスクエリ](./query) - Get シリーズメソッド
- [削除操作](./delete) - Delete/DeleteClean メソッド
- [バッチ操作](./batch) - ProcessBatch バッチ処理
- [変更関数](../functions/modify) - パッケージレベルの Set/SetMultiple/MergeJSON 関数
