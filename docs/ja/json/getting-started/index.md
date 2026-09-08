---
sidebar_label: "クイックスタート"
title: "クイックスタート - CyberGo JSON | 5 分で始めるガイド"
description: "CyberGo JSON クイックスタートガイド：インストール、パスクエリ GetString/GetInt、Set/Delete による変更、Marshal/Unmarshal でのエンコード・デコード、イテレーションとエラー判別を解説し、導入直後のよくある質問にも回答、5 分で Go JSON 処理を始められます。"
sidebar_position: 1
---

# クイックスタート

このガイドでは、`github.com/cybergodev/json` ライブラリをすぐに使い始めるための手順を説明します。

## インストール

```bash
go get github.com/cybergodev/json
```

## 基本操作

### パッケージレベル関数

ライブラリは、プロセッサを作成せずに使える便利なパッケージレベル関数群を提供しています：

#### 値の取得

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{
        "name": "CyberGo",
        "version": 1,
        "active": true,
        "price": 99.99,
        "tags": ["json", "go", "fast"],
        "meta": {"author": "dev"}
    }`

	// 汎用取得
	val, err := json.Get(data, "name")
	if err != nil {
		panic(err)
	}
	fmt.Println(val) // CyberGo

	// 型安全な取得
	name := json.GetString(data, "name")
	version := json.GetInt(data, "version")
	active := json.GetBool(data, "active")
	price := json.GetFloat(data, "price")
	tags := json.GetArray(data, "tags")
	meta := json.GetObject(data, "meta")

	fmt.Println(name, version, active, price)
	fmt.Println(tags) // [json go fast]
	fmt.Println(meta) // map[author:dev]

	// デフォルト値付き取得
	desc := json.GetString(data, "description", "N/A")
	count := json.GetInt(data, "count", 0)
	fmt.Println(desc, count) // N/A 0
}
```

#### ネストされたパス

ドット区切りのネストパスに対応しています：

```go
data := `{"user": {"profile": {"name": "Alice"}}}`

name := json.GetString(data, "user.profile.name")
fmt.Println(name) // Alice
```

#### 配列インデックス

配列インデックスによるアクセスに対応しています：

```go
data := `{"items": ["a", "b", "c"]}`

// どちらの構文もサポート
item0 := json.GetString(data, "items.0")   // "a"
item1 := json.GetString(data, "items.1")   // "b"
last := json.GetString(data, "items.-1")   // "c"

// ブラケット構文
first := json.GetString(data, "items[0]")  // "a"
last2 := json.GetString(data, "items[-1]") // "c"

// 範囲取得（配列を返す）
arr := json.GetArray(data, "items[0:2]")   // ["a", "b"]
```

::: tip さらに詳しいパス構文
基本的なプロパティと配列インデックスに加え、**配列スライス** `[1:5]`、**ワイルドカード** `[*]`、**フィールド抽出** `{name,email}` などの高度な構文もサポートしています。詳しくは[パス式の構文](./path-syntax)を参照してください。
:::

#### 値の設定

```go
data := `{"name": "old"}`

// 新しい値を設定
updated, err := json.Set(data, "name", "new")
if err != nil {
    panic(err)
}
fmt.Println(updated) // {"name":"new"}

// 新しいフィールドを追加
updated, err = json.Set(data, "version", 1)
if err != nil {
    panic(err)
}
fmt.Println(updated) // {"name":"old","version":1}

// 複数フィールドを1つずつ設定（毎回新しい JSON を返すため、err をチェック）
updated, err = json.Set(data, "name", "updated")
updated, err = json.Set(updated, "version", 2)
updated, err = json.Set(updated, "active", true)
if err != nil {
    panic(err)
}
```

#### 値の削除

```go
data := `{"name": "test", "temp": "remove"}`

// フィールドを削除
updated, err := json.Delete(data, "temp")
if err != nil {
    panic(err)
}
fmt.Println(updated) // {"name":"test"}
```

### エンコードとデコード

標準ライブラリと完全互換です：

```go
type User struct {
    Name string `json:"name"`
    Age  int    `json:"age"`
}

// エンコード
user := User{Name: "Alice", Age: 30}
bytes, err := json.Marshal(user)
if err != nil {
    panic(err)
}
fmt.Println(string(bytes)) // {"name":"Alice","age":30}

// 整形エンコード
pretty, err := json.MarshalIndent(user, "", "  ")
if err != nil {
    panic(err)
}
fmt.Println(string(pretty))
// {
//   "name": "Alice",
//   "age": 30
// }

// デコード
var u User
if err := json.Unmarshal(bytes, &u); err != nil {
    panic(err)
}
fmt.Println(u.Name, u.Age) // Alice 30
```

### 検証

```go
valid := `{"key": "value"}`
invalid := `{key: value}`

fmt.Println(json.Valid([]byte(valid)))   // true
fmt.Println(json.Valid([]byte(invalid))) // false
```

### フォーマット

```go
compact := `{"name":"test","nested":{"key":"value"}}`

// 整形出力
pretty, err := json.Prettify(compact)
if err != nil {
    panic(err)
}
fmt.Println(pretty)
// {
//   "name": "test",
//   "nested": {
//     "key": "value"
//   }
// }

// 圧縮出力
jsonStr := `{
  "name": "test"
}`
var buf bytes.Buffer
err = json.Compact(&buf, []byte(jsonStr))
if err != nil {
    panic(err)
}
fmt.Println(buf.String()) // {"name":"test"}
```

## Processor の使用

頻繁な操作には、より優れたパフォーマンスとキャッシュ効果を得られる `Processor` の使用を推奨します：

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// デフォルト設定でプロセッサを作成
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close() // リソース解放のため必ずクローズ

	data := `{"name": "test", "value": 42}`

	// プロセッサで操作
	name := p.GetString(data, "name")
	value := p.GetInt(data, "value")

	fmt.Println(name, value)
}
```

## 設定オプション

```go
// デフォルト設定
cfg := json.DefaultConfig()

// セキュリティ強化設定（信頼できない入力を扱う）
// cfg = json.SecurityConfig()

// 整形出力設定
// cfg = json.PrettyConfig()

// カスタム設定
cfg = json.DefaultConfig()
cfg.MaxJSONSize = 50 * 1024 * 1024 // 50MB
cfg.EnableCache = true
cfg.CacheTTL = 5 * time.Minute

// カスタム設定でプロセッサを作成
p, err := json.New(cfg)
if err != nil {
    panic(err)
}
```

## イテレーション

配列要素を走査して各フィールドに安全にアクセスできます。要素ごとに完全なパスを書く必要はありません：

```go
data := `{"users": [{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]}`

err := json.ForeachWithPath(data, "users", func(key any, item *json.IterableValue) {
    name := item.GetString("name")
    age := item.GetInt("age")
    fmt.Printf("User %v: %s (age %d)\n", key, name, age)
})
if err != nil {
	panic(err)
}
// User 0: Alice (age 30)
// User 1: Bob (age 25)
```

::: tip
`Foreach` 系は全 12 関数あります。**早期終了**が必要な場合は `ForeachWithError` を使います（コールバックが `error` を返し、`item.Break()` を返すと中断）。深いネストの走査、現在パスの保持、ファイルイテレーションなどのバリエーションは[チートシート](./cheatsheet#イテレーション関数ファミリー)をご覧ください。
:::

## エラー処理

パス操作の典型的なエラーは**センチネルエラー**で、`errors.Is` で正確に判別します：

```go
val, err := json.Get(data, "user.profile.email")
if err != nil {
    switch {
    case errors.Is(err, json.ErrPathNotFound):
        // キーが存在しない — ビジネス上よくあるケース。デフォルト値でフォールバック可能
    case errors.Is(err, json.ErrInvalidJSON):
        // JSON 自体のフォーマットが不正
    default:
        // その他のエラー（制限超過、型競合など）：JsonsError は操作名とパスを保持しているため、
        // ログに記録するだけでよく、種類ごとに列挙する必要はない
        fmt.Println(err)
    }
}
```

個別に判定したくない場合は、デフォルト値付きの型付き関数（`GetString`/`GetInt` など）がゼロ値またはデフォルト値を黙って返すため、クリティカルでない読み取りに適しています。

::: tip ErrTypeMismatch はどこで使われる？
通常の `Get` が型競合（文字列パスへの配列インデックスなど）に遭遇した場合、コンテキスト付きの説明的なエラーを返しますが、`ErrTypeMismatch` センチネル**ではありません**。`ErrTypeMismatch` が主に現れるのは 3 か所です：`SafeGet` 結果の `AsString()`/`AsInt()` などの変換メソッド、`GetCompiled` のプリコンパイルパスナビゲーション、およびイテレート不可能な値への `Foreach` 系の呼び出しです。
:::

## 導入直後のよくある質問

使い始めの初期によくぶつかる問題をまとめて回答します。パス構文の詳細は[パス式の構文](./path-syntax)を参照してください。

**Q：パスが見つからない場合、実際に何が返される？**

呼び出し方によって異なり、「キーが存在しない」場合と「インデックスが範囲外」の場合で挙動が異なります：

| 呼び出し | オブジェクトキーが存在しない | 配列インデックスが範囲外 |
|------|--------------|--------------|
| `json.Get` | `(nil, ErrPathNotFound)` | `(nil, nil)`、**エラーにならない** |
| `json.GetString` などの型付き関数 | ゼロ値または渡されたデフォルト値 | ゼロ値または渡されたデフォルト値 |
| `json.SafeGet` | `Exists: false` | `Exists: true` だが値は nil |

配列インデックスが範囲外でも `Get` はエラーにならない（結果は nil）ため、「要素が存在するか」の判定は err だけでなく戻り値も見る必要があります。完全なルールは[構文の落とし穴](./path-syntax#構文の落とし穴)を参照してください。

**Q：取得した数字がなぜ float64？**

`Get` は `any` を返し、JSON 数値は標準デコードでは必ず `float64` になります：

```go
data := `{"version": 1}`

val, _ := json.Get(data, "version") // val は float64(1) で、int ではない
i := json.GetInt(data, "version")   // int が必要な場合は型付き関数を使う
```

`float64` の精度を超える大きな整数（スノーフレーク ID など）は丸められます——この場合は `Config.PreserveNumbers` で元の数値テキストを保持するか、`Decoder.UseNumber()` で `json.Number` を取得してください。

**Q：`Set` を呼んだのに、元の JSON が変わらないのはなぜ？**

`Set`/`Delete` は純関数スタイルです：変更後の**新しい文字列**を返し、元の文字列は変更しません。戻り値を捨てるのが新人の最も一般的なバグです：

```go
data := `{"name": "old"}`

// ✗ 結果が破棄され、data は変わらない
_, _ = json.Set(data, "name", "new")

// ✓ 戻り値を受け取る
updated, err := json.Set(data, "name", "new")
if err != nil {
    panic(err)
}
```

連続して複数箇所を変更する場合は `SetMultiple` で一度に完了させる方が、チェーンされた `Set` より明快です。

**Q：`Set` で範囲外インデックスを使うと何が起きる？**

クエリ側の「ゼロ値、エラーなし」とは異なり——デフォルト設定（`CreatePaths: true`）では、`Set` は配列を `null` でパディングして対象インデックスまで拡張します：

```go
updated, err := json.Set(`{"items":[1,2,3]}`, "items[5]", "x")
// {"items":[1,2,3,null,null,"x"]}
```

末尾への追加だけが目的なら `items[+]` を使い、範囲外インデックスに頼らないでください。

**Q：なぜどこでも `defer p.Close()` しないといけない？**

`Processor` は内部にキャッシュとバックグラウンドクリーンアップ goroutine を保持しており、`Close` が進行中の操作の排出とこれらのリソースの解放を担います。高頻度で作成してもクローズしないとリソースが蓄積し続けます。パッケージレベル関数はグローバルプロセッサがライフサイクルを管理するため、手動で `Close` する必要はなく、すべきでもありません。詳しくは [Processor ガイド](./processor-guide#ライフサイクル管理)を参照してください。

## 次のステップ

- [パス式の構文](./path-syntax) — 完全なパスクエリ構文を学ぶ
- [Processor ガイド](./processor-guide) — いつプロセッサを使うか、事前解析最適化
- [フォーマット出力](./print) — JSON の整形と圧縮
- [標準ライブラリからの移行](./migration) — encoding/json のゼロコスト置き換え
- [チートシート](./cheatsheet) — API クイックリファレンス
- [大規模ファイル処理](../streaming/large-files) — 大型 JSON ファイルを扱う
- [API ドキュメント](../api-reference/) — 完全な API リファレンスを見る
- [使用例](../examples/) — より多くの実践的なサンプルを見る
