---
sidebar_label: "高度なサンプル"
title: "高度な機能のサンプル - CyberGo JSON | 応用用法"
description: "CyberGo JSON 高度なサンプル：EncodeBatch 一括エンコード、EncodeFields でフィールド選択による機密情報フィルタ、PreParse 事前パース、SafeGet 安全取得と WarmupCache ウォームアップ、フックと高度な設定を含む実行可能サンプルでパフォーマンスを向上。"
sidebar_position: 2
---

# 高度な機能のサンプル

このドキュメントでは、バッチエンコード、事前パース、フック、高度な設定など、高度な機能の完全なサンプルを提供します。

## バッチエンコード

### EncodeBatch

複数のキーと値のペアをすばやく JSON オブジェクトにエンコードします:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// 分散したデータから JSON を構築
	pairs := map[string]any{
		"id":      1001,
		"name":    "Alice",
		"email":   "alice@example.com",
		"active":  true,
		"tags":    []string{"admin", "user"},
		"balance": 1250.50,
	}

	// EncodeBatch を使用して JSON オブジェクトへバッチエンコード
	result, err := json.EncodeBatch(pairs)
	if err != nil {
		panic(err)
	}
	fmt.Println(result)

	// EncodeBatch と PrettyConfig を組み合わせて整形出力
	pretty, err := json.EncodeBatch(pairs, json.PrettyConfig())
	if err != nil {
		panic(err)
	}
	fmt.Println(pretty)
}
```

## フィールド選択エンコード

### EncodeFields

構造体の指定フィールドのみをエンコードします。API レスポンスの機密情報フィルタリングに適しています:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

type User struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Salt     string `json:"salt"`
}

func main() {
	user := User{
		ID:       1,
		Name:     "Alice",
		Email:    "alice@example.com",
		Password: "secret123",
		Salt:     "randomsalt",
	}

	// 公開フィールドのみエンコード（機密情報を除外）
	publicFields := []string{"id", "name", "email"}
	result, err := json.EncodeFields(user, publicFields)
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// {"id":1,"name":"Alice","email":"alice@example.com"}
}
```

## 事前パース最適化

### PreParse

JSON を事前にパースし、重複パースを回避して複数回クエリのパフォーマンスを向上させます:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// 大規模な JSON データ
	largeJSON := `{
        "users": [
            {"id": 1, "name": "Alice", "email": "alice@example.com"},
            {"id": 2, "name": "Bob", "email": "bob@example.com"},
            {"id": 3, "name": "Charlie", "email": "charlie@example.com"}
        ],
        "metadata": {
            "total": 3,
            "page": 1,
            "perPage": 10
        }
    }`

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// 事前パース（1 回だけパース）。使い終わったら Release でパースツリーへの参照を解放
	parsed, err := p.PreParse(largeJSON)
	if err != nil {
		panic(err)
	}
	defer parsed.Release()

	// 複数回のクエリで事前パース結果を再利用
	total, _ := p.GetFromParsed(parsed, "metadata.total")
	page, _ := p.GetFromParsed(parsed, "metadata.page")

	// ユーザーを走査
	for i := 0; i < 3; i++ {
		path := fmt.Sprintf("users.%d.name", i)
		name, _ := p.GetFromParsed(parsed, path)
		fmt.Printf("User %d: %v\n", i, name)
	}

	fmt.Printf("Total: %v, Page: %v\n", total, page)
}
```

## 高頻度パスの事前コンパイル

### CompilePath + GetCompiled

`PreParse` が最適化するのは「同一の JSON に複数パスをクエリする」ケースです。逆に、**同一パス**を大量の異なる JSON にクエリする場合（リクエストごとに `user.name` を取得するなど）は、`CompilePath` でパス解析結果を事前コンパイルして再利用し、毎回のパス解析コストを省きます:

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

	// 継続的に到着する異なる JSON ドキュメントをシミュレート
	docs := []string{
		`{"user":{"name":"Alice","age":28}}`,
		`{"user":{"name":"Bob","age":34}}`,
		`{"user":{"name":"Carol","age":25}}`,
	}

	// 1 回だけ事前コンパイル。パス解析結果はグローバルのコンパイルキャッシュに入り、使い終わったら Release で返却
	cp, err := p.CompilePath("user.name")
	if err != nil {
		panic(err)
	}
	defer cp.Release()

	for _, doc := range docs {
		name, err := p.GetCompiled(doc, cp)
		if err != nil {
			panic(err)
		}
		fmt.Println("name =", name)
	}
}

// 出力:
// name = Alice
// name = Bob
// name = Carol
```

:::tip PreParse との役割分担
`GetCompiled` は呼び出しごとに入力の安全検証と JSON パースを実行します。省かれるのは**パス解析**の工程だけです。両者はホットスポットの方向で使い分けます: 同一ドキュメントへの繰り返しクエリ → `PreParse`。同一パスの繰り返し使用 → `CompilePath`。現在 `Set`/`Delete` には Compiled 系のバリアントがなく、事前コンパイルパスはクエリ専用です。
:::

## 安全な取得

### SafeGet

構造化された結果を返し、メソッドチェーンと型変換をサポートします:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{
        "user": {
            "id": 1001,
            "name": "Alice",
            "age": 28,
            "active": true,
            "balance": 1250.50
        }
    }`

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// 単一フィールドを安全に取得
	nameResult := p.SafeGet(data, "user.name")
	if nameResult.Ok() {
		name, _ := nameResult.AsString()
		fmt.Println("Name:", name)
	}

	// 安全に取得して型変換
	ageResult := p.SafeGet(data, "user.age")
	if ageResult.Ok() {
		age, _ := ageResult.AsInt()
		fmt.Println("Age:", age)
	}

	// 真偽値を安全に取得
	activeResult := p.SafeGet(data, "user.active")
	if activeResult.Ok() {
		active, _ := activeResult.AsBool()
		fmt.Println("Active:", active)
	}

	// 存在しないパスでも panic しない
	emailResult := p.SafeGet(data, "user.email")
	fmt.Println("Email exists:", emailResult.Ok()) // false

	// デフォルト値を使用
	email := emailResult.UnwrapOr("N/A")
	fmt.Println("Email:", email)
}
```

## キャッシュウォームアップ

### WarmupCache

よく使うパスのキャッシュをウォームアップし、後続クエリのパフォーマンスを向上させます:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// 大規模な JSON データ（シミュレート）
	largeJSON := `{
        "products": [
            {"id": 1, "name": "Product A", "price": 100},
            {"id": 2, "name": "Product B", "price": 200},
            {"id": 3, "name": "Product C", "price": 300}
        ],
        "categories": ["electronics", "books", "clothing"],
        "settings": {"currency": "USD", "taxRate": 0.1}
    }`

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// よく使うパスを定義
	commonPaths := []string{
		"products",
		"products.0.id",
		"products.0.name",
		"products.1.id",
		"products.1.name",
		"categories",
		"settings.currency",
	}

	// キャッシュをウォームアップ
	result, err := p.WarmupCache(largeJSON, commonPaths)
	if err != nil {
		panic(err)
	}

	fmt.Printf("ウォームアップ完了: %d/%d 成功\n", result.Successful, result.TotalPaths)
	if len(result.FailedPaths) > 0 {
		fmt.Println("失敗パス: ", result.FailedPaths)
	}

	// 以降のクエリはキャッシュを使用
	for i := 0; i < 3; i++ {
		path := fmt.Sprintf("products.%d.name", i)
		name := p.GetString(largeJSON, path)
		fmt.Printf("Product %d: %s\n", i, name)
	}
}
```

## バッチ操作

### ProcessBatch

複数の操作をバッチ実行して効率を向上させます:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"users": [{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}]}`

	// バッチ操作を定義（ID は結果内で各操作を識別するために使用）
	operations := []json.BatchOperation{
		{ID: "get-name", Type: "get", Path: "users.0.name", JSONStr: data},
		{ID: "get-users", Type: "get", Path: "users", JSONStr: data},
		{ID: "set-name", Type: "set", Path: "users.0.name", Value: "Updated", JSONStr: data},
		{ID: "del-id", Type: "delete", Path: "users.0.id", JSONStr: data},
	}

	// バッチ操作を実行
	results, err := json.ProcessBatch(operations)
	if err != nil {
		panic(err)
	}

	// 結果を確認
	for _, r := range results {
		fmt.Printf("ID: %s\n", r.ID)
		if r.Error != nil {
			fmt.Printf("  エラー: %v\n", r.Error)
		} else if r.Result != nil {
			fmt.Printf("  値: %v\n", r.Result)
		}
	}
}
```

## キーと値のメモリ最適化

ライブラリは内部で文字列メモリプール（string interning）を使用し、重複するキーと値のメモリ使用量を自動的に最適化します。手動での管理は不要です。

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// ライブラリは内部で重複するキーと値にメモリプールを自動適用
	// 大量のデータを処理する際、重複する文字列のキーと値は自動的にメモリを再利用
	records := make([]map[string]any, 10000)
	for i := range records {
		records[i] = map[string]any{
			"status": "active",
			"type":   "user",
			"role":   "member",
		}
	}

	// バッチエンコード時にライブラリ内部で自動的にメモリを最適化
	result, _ := json.Marshal(map[string]any{
		"status": "active",
		"type":   "user",
	})

	fmt.Println("Sample:", string(result))
}
```

## 次のステップ

- [パス式の構文](../getting-started/path-syntax) — 完全なパス構文リファレンス
- [大容量ファイル処理](../streaming/large-files) — ストリーミング処理ガイド
- [API ドキュメント](../api-reference/) — 完全な API リファレンス
