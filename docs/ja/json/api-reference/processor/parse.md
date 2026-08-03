---
sidebar_label: "解析と検証"
title: "Processor 解析と検証 - CyberGo JSON | API リファレンス"
description: "CyberGo JSON Processor 解析メソッド：Valid 検証、Parse 解析、ParseAny 任意型、PreParse 事前解析最適化と GetFromParsed 高速クエリで、設定ベースの解析をサポートします。"
sidebar_position: 6
---

# 解析と検証メソッド

Processor は JSON 解析と有効性検証メソッドを提供します。ファイル読み書きとストリーム読み込みは[ファイル操作](./file-io)を参照してください。

## 検証メソッド

### Valid

シグネチャ：`func (p *Processor) Valid(jsonStr string, cfg ...Config) (bool, error)`

JSON 文字列が有効か検証します。有効な場合は `(true, nil)` を返します。無効な場合は `(false, error)` を返し、エラーに具体的な原因が含まれます。

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New(json.DefaultConfig())
    if err != nil {
        panic(err)
    }
    defer p.Close()

    cases := []string{
        `{"name":"CyberGo","age":25}`,
        `{"name":}`,
    }
    for _, c := range cases {
        valid, err := p.Valid(c)
        fmt.Printf("valid=%-5v エラーあり=%v\n", valid, err != nil)
    }
}
// 出力：
// valid=true  エラーあり=false
// valid=false エラーあり=true
```

### ValidBytes

シグネチャ：`func (p *Processor) ValidBytes(data []byte) bool`

バイトスライスが有効な JSON か検証し、ブーリアン値のみを返します（`encoding/json.Valid` とシグネチャ互換、エラー詳細が不要な高速判定に適しています）。

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New(json.DefaultConfig())
    if err != nil {
        panic(err)
    }
    defer p.Close()

    fmt.Println(p.ValidBytes([]byte(`{"ok":true}`))) // true
    fmt.Println(p.ValidBytes([]byte(`{not json}`)))   // false
}
// 出力：
// true
// false
```

## 解析メソッド

### Parse

シグネチャ：`func (p *Processor) Parse(jsonStr string, target any, cfg ...Config) error`

JSON 文字列をターゲット変数に解析します。`target` は非 nil ポインタでなければなりません。`map[string]any`、構造体、`any` への解析に対応し、`Config` で数値保持モードを切り替えられます。

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

type User struct {
    Name string `json:"name"`
    Age  int    `json:"age"`
}

func main() {
    p, err := json.New(json.DefaultConfig())
    if err != nil {
        panic(err)
    }
    defer p.Close()

    data := `{"name":"CyberGo","age":25}`

    // map[string]any に解析（数値はデフォルトで float64）
    var obj map[string]any
    if err := p.Parse(data, &obj); err != nil {
        panic(err)
    }
    fmt.Printf("map: name=%v age=%T(%v)\n", obj["name"], obj["age"], obj["age"])

    // 構造体に解析
    var u User
    if err := p.Parse(data, &u); err != nil {
        panic(err)
    }
    fmt.Printf("struct: %+v\n", u)
}
// 出力：
// map: name=CyberGo age=float64(25)
// struct: {Name:CyberGo Age:25}
```

### ParseAny

シグネチャ：`func (p *Processor) ParseAny(jsonStr string, cfg ...Config) (any, error)`

JSON 文字列を解析し、ルート値を `any` として直接返します。ターゲット型を事前に宣言する必要はありません。内部的には `Parse(jsonStr, &v)` と等価です。

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New(json.DefaultConfig())
    if err != nil {
        panic(err)
    }
    defer p.Close()

    data, err := p.ParseAny(`{"name":"CyberGo","age":25}`)
    if err != nil {
        panic(err)
    }
    obj := data.(map[string]any)
    fmt.Printf("name=%v age=%v\n", obj["name"], obj["age"])
}
// 出力：
// name=CyberGo age=25
```

### PreserveNumbers モード

デフォルト（`PreserveNumbers=false`）ではすべての JSON 数値が `float64` に解析され、大きな整数の精度が失われ、小数の表記形式も変わります。`PreserveNumbers=true` を有効化すると、数値は `json.Number`（内部は元の文字列）として保持され、原文のフォーマットと精度が完全に保たれます。金額、大きな整数、科学記数法などのシナリオに適しています。以下の例では `%T` で 2 つのモードにおける数値の Go 型の違いを直感的に示します：

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New(json.DefaultConfig())
    if err != nil {
        panic(err)
    }
    defer p.Close()

    data := `{"id":42,"price":19.99}`

    // デフォルトモード：すべての数値は float64 に解析
    var def any
    if err := p.Parse(data, &def); err != nil {
        panic(err)
    }
    defM := def.(map[string]any)
    fmt.Printf("デフォルト   : id 型=%T 値=%v\n", defM["id"], defM["id"])

    // PreserveNumbers モード：数値は json.Number として保持
    cfg := json.DefaultConfig()
    cfg.PreserveNumbers = true
    var preserved any
    if err := p.Parse(data, &preserved, cfg); err != nil {
        panic(err)
    }
    preM := preserved.(map[string]any)
    fmt.Printf("数値保持    : id 型=%T 値=%v\n", preM["id"], preM["id"])
}
// 出力：
// デフォルト   : id 型=float64 値=42
// 数値保持    : id 型=json.Number 値=42
```

::: tip いつ有効化すべきか
金融金額、`float64` の正確な表現範囲（約 ±2^53、つまり 9007199254740992）を超える整数、または数値をそのまま書き戻す必要がある場合（`19.99` と `19.990000` の相互変換を避けるなど）は `PreserveNumbers` の有効化を推奨します。例えば `9007199254740993`（2^53+1）はデフォルトモードでは `9007199254740992` に丸められますが、`json.Number` モードでは元の値が保持されます。ただし `json.Number` は `.Int64()` / `.Float64()` / `.String()` で明示的に値を取り出す必要があります。
:::

## 事前解析最適化（PreParse）

**同じ JSON** に対して複数回のパスクエリを行う場合、毎回 [`Get`](./query) を呼び出すとドキュメント全体の再解析が繰り返されます。`PreParse` は一度だけ解析し、以降の `GetFromParsed` は解析済みのデータ構造上で直接ナビゲーションを行い、再解析のオーバーヘッドを省きます。

### PreParse

シグネチャ：`func (p *Processor) PreParse(jsonStr string, cfg ...Config) (*ParsedJSON, error)`

JSON を事前解析し、再利用可能な `*ParsedJSON` を返します。使い終わったら `parsed.Release()` を呼んでプロセッサへの参照を解放してください。

### GetFromParsed

シグネチャ：`func (p *Processor) GetFromParsed(parsed *ParsedJSON, path string, cfg ...Config) (any, error)`

事前解析データからパスで値を取得します。JSON 解析をスキップし、直接パスナビゲーションを行います。

### 完全な比較例

以下の例では「複数回のパッケージレベル `Get`（毎回再解析）」と「`PreParse` + `GetFromParsed`（一度だけ解析）」の 2 つの方式を比較します。両者の結果は同じですが、後者はクエリ回数が多い/ドキュメントが大きい場合に顕著に高速です：

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New(json.DefaultConfig())
    if err != nil {
        panic(err)
    }
    defer p.Close()

    data := `{"user":{"name":"CyberGo","age":25},"meta":{"version":2,"env":"prod"}}`

    // 方式 1：毎回のパッケージレベル Get で JSON を再解析
    name1, err := json.Get(data, "user.name")
    if err != nil {
        panic(err)
    }
    age1, err := json.Get(data, "user.age")
    if err != nil {
        panic(err)
    }
    ver1, err := json.Get(data, "meta.version")
    if err != nil {
        panic(err)
    }

    // 方式 2：PreParse で一度解析し、GetFromParsed で解析結果を再利用（複数回クエリに推奨）
    parsed, err := p.PreParse(data)
    if err != nil {
        panic(err)
    }
    defer parsed.Release()

    name2, err := p.GetFromParsed(parsed, "user.name")
    if err != nil {
        panic(err)
    }
    age2, err := p.GetFromParsed(parsed, "user.age")
    if err != nil {
        panic(err)
    }
    ver2, err := p.GetFromParsed(parsed, "meta.version")
    if err != nil {
        panic(err)
    }

    fmt.Println("Get     :", name1, age1, ver1)
    fmt.Println("PreParse:", name2, age2, ver2)
}
// 出力：
// Get     : CyberGo 25 2
// PreParse: CyberGo 25 2
```

### SetFromParsed

シグネチャ：`func (p *Processor) SetFromParsed(parsed *ParsedJSON, path string, value any, cfg ...Config) (*ParsedJSON, error)`

事前解析データに値を設定し、**新しい** `*ParsedJSON` を返します（内部でディープコピー、元のデータは不変）。新しい結果に対して引き続き `GetFromParsed` でクエリできます。

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New(json.DefaultConfig())
    if err != nil {
        panic(err)
    }
    defer p.Close()

    parsed, err := p.PreParse(`{"user":{"name":"CyberGo","age":25}}`)
    if err != nil {
        panic(err)
    }
    defer parsed.Release()

    // SetFromParsed は新しい ParsedJSON を返し、元のデータは不変
    modified, err := p.SetFromParsed(parsed, "user.name", "Bob")
    if err != nil {
        panic(err)
    }
    defer modified.Release()

    oldName, _ := p.GetFromParsed(parsed, "user.name")
    newName, _ := p.GetFromParsed(modified, "user.name")
    ageAfter, _ := p.GetFromParsed(modified, "user.age")
    fmt.Println("元のデータ name :", oldName)
    fmt.Println("変更後 name    :", newName)
    fmt.Println("変更後 age     :", ageAfter)
}
// 出力：
// 元のデータ name : CyberGo
// 変更後 name    : Bob
// 変更後 age     : 25
```

### ParsedJSON 型

`ParsedJSON` は解析済みデータとキャッシュ情報をカプセル化し、フィールドはエクスポートされず、2 つのメソッドのみを公開します：

| メソッド | 説明 |
|------|------|
| `Data() any` | 内部の解析済みデータを返す（通常は `map[string]any` または `[]any`） |
| `Release()` | プロセッサへの参照を解放。呼び出し後 `Data()` は `nil` を返す。`defer` と併用すべき |

## メソッド選択ガイド

| シナリオ | 推奨メソッド | 入力 | 出力 |
|------|----------|------|------|
| 有効性の判定のみ（エラー詳細不要） | `ValidBytes` | `[]byte` | `bool` |
| 有効性判定と失敗理由の取得 | `Valid` | `string` | `(bool, error)` |
| 構造体/具象型への解析 | `Parse` | `string` | `target` ポインタに書き込み |
| `any` への解析（型の事前宣言不要） | `ParseAny` | `string` | `any` |
| `encoding/json` 互換（`[]byte` 入力） | [`Unmarshal`](./output#unmarshal) | `[]byte` | `target` ポインタに書き込み |
| 同じ JSON の複数回パスクエリ | `PreParse` + `GetFromParsed` | `string` | `*ParsedJSON` / `any` |
| 解析済みデータの変更後にクエリ継続 | `PreParse` + `SetFromParsed` + `GetFromParsed` | `string` | `*ParsedJSON` |
| 数値の元の精度を保持 | 上記いずれかの解析メソッド + `Config{PreserveNumbers: true}` | — | 数値は `json.Number` |

::: tip Parse vs ParseAny vs Unmarshal
- **`Unmarshal(data, &v)`**：標準ライブラリ `encoding/json` と完全互換。入力は `[]byte` で、標準ライブラリの直接置き換えやネットワーク/ファイルのバイトストリーム処理に適しています。
- **`Parse(jsonStr, &v)`**：入力は `string` で、セマンティクスは `Unmarshal` と同じですが、`Config`（セキュリティ制限、`PreserveNumbers` など）をネイティブにサポートし、日常的な解析の首选です。
- **`ParseAny(jsonStr)`**：ターゲット型の事前宣言が不要で、直接 `any` を返します。構造が未知、または一回限りの値取得に適しています。

3 つの底レベルの解析能力は等価で、違いは入力型とターゲット変数の事前準備が必要かどうかのみです。
:::

## 関連

- [ファイル操作](./file-io) - LoadFromFile/SaveToFile などのファイルメソッド
- [出力メソッド](./output) - Encode/EncodePretty/Unmarshal エンコードメソッド
- [パスクエリ](./query) - Get シリーズメソッド
- [パッケージレベル解析関数](../functions/parse) - Processor 不要の Parse/ParseAny/Valid
