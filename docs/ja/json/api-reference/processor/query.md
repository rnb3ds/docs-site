---
sidebar_label: "クエリと取得"
title: "Processor パスクエリ - CyberGo JSON | API リファレンス"
description: "CyberGo JSON Processor パスクエリ：Get/GetString/GetInt 型取得、GetMultiple 一括取得、SafeGet の AccessResult 返却、GetTyped[T] ジェネリクス。JSONPath をサポートします。"
sidebar_position: 2
---

# パスクエリメソッド

Processor は多様な型安全なパスクエリメソッドを提供します。

::: tip パッケージレベル関数とのミラー関係
本ページのメソッドと[パッケージレベルクエリ関数](../functions/query)は、同じ動作への 2 つの入口です：パス構文、戻り型、エラーセマンティクスは完全に一致します。本ページは Processor 側の設定セマンティクスと再利用パターンに焦点を当て、完全な関数レベルのサンプルはパッケージレベルページを参照してください。
:::

## 基本クエリ

### Get

シグネチャ：`func (p *Processor) Get(jsonStr, path string, cfg ...Config) (result any, err error)`

指定パスから任意型の値を取得します。

```go
val, err := p.Get(data, "items[0]")
if err != nil {
    panic(err)
}
```

### GetString

シグネチャ：`func (p *Processor) GetString(jsonStr, path string, defaultValue ...string) string`

指定パスから文字列値を取得します。パスが存在しない、値が null、型変換に失敗した場合は空文字列または `defaultValue` を返します。

```go
// デフォルト値を指定しない
name := p.GetString(data, "user.name")

// デフォルト値を指定
email := p.GetString(data, "user.email", "unknown@example.com")
```

### GetInt

シグネチャ：`func (p *Processor) GetInt(jsonStr, path string, defaultValue ...int) int`

指定パスから整数値を取得します。パスが存在しない、値が null、型変換に失敗した場合は 0 または `defaultValue` を返します。

```go
count := p.GetInt(data, "count")
timeout := p.GetInt(data, "timeout", 30)
```

### GetFloat

シグネチャ：`func (p *Processor) GetFloat(jsonStr, path string, defaultValue ...float64) float64`

指定パスから浮動小数点数値を取得します。パスが存在しない、値が null、型変換に失敗した場合は 0 または `defaultValue` を返します。

```go
price := p.GetFloat(data, "price")
rate := p.GetFloat(data, "rate", 0.5)
```

### GetBool

シグネチャ：`func (p *Processor) GetBool(jsonStr, path string, defaultValue ...bool) bool`

指定パスからブール値を取得します。パスが存在しない、値が null、型変換に失敗した場合は false または `defaultValue` を返します。

```go
enabled := p.GetBool(data, "enabled")
debug := p.GetBool(data, "debug", false)
```

::: tip 型付き取得は cfg を受け取らない
`GetString`/`GetInt` などの typed getters の可変引数は `Config` ではなく**デフォルト値**です（Go は可変引数を 1 つしか許可しないため。公式設計の 3 つの例外の 1 つ）。`Config` で制御される型付き読み取りが必要な場合は、`New(cfg)` でプロセッサを構築してその `GetString`/`GetInt` などの型付きメソッドを呼び出すか、`SafeGet` + `AsInt()` などの変換メソッドに切り替えてください。
:::

### GetWithContext

シグネチャ：`func (p *Processor) GetWithContext(ctx context.Context, jsonStr, path string, cfg ...Config) (any, error)`

コンテキスト付きのパス取得です。タイムアウトとキャンセル操作をサポートし、`Get` のコンテキスト認識版です。

::: info 注意
Context は操作の前後にチェックされ、解析/ナビゲーションの途中ではチェックされません。大型 JSON ドキュメントでは、操作中にキャンセルへ応答しない場合があります。
:::

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

val, err := p.GetWithContext(ctx, data, "items[0].name")
if err != nil {
    panic(err)
}
fmt.Println(val)
```

## 安全なクエリ

### SafeGet

シグネチャ：`func (p *Processor) SafeGet(jsonStr, path string, cfg ...Config) AccessResult`

値を安全に取得し、AccessResult 構造を返します。型変換が必要なシナリオに適しています。

```go
result := p.SafeGet(data, "user.age")
if result.Ok() {
    age, err := result.AsInt()
    if err != nil {
        // 型変換に失敗
    }
    fmt.Println(age)
}

// 他の型としても取得可能
name, err := result.AsString()
price, err := result.AsFloat64()
enabled, err := result.AsBool()
```

**AccessResult メソッド**：

| メソッド | 説明 |
|------|------|
| `Ok() bool` | 値が存在するかチェック |
| `Unwrap() any` | 生の値を取得 |
| `UnwrapOr(defaultValue any) any` | 値またはデフォルト値を取得 |
| `AsString() (string, error)` | 安全に文字列へ変換 |
| `AsStringConverted() (string, error)` | フォーマットして文字列へ変換 |
| `AsInt() (int, error)` | 安全に整数へ変換 |
| `AsFloat64() (float64, error)` | 安全に浮動小数点数へ変換 |
| `AsBool() (bool, error)` | 安全にブール値へ変換 |

## コレクション取得

### GetArray

シグネチャ：`func (p *Processor) GetArray(jsonStr, path string, defaultValue ...[]any) []any`

指定パスから配列を取得します。パスが存在しない、値が null、型変換に失敗した場合は nil または `defaultValue` を返します。

```go
items := p.GetArray(data, "items")
tags := p.GetArray(data, "tags", []any{"default"})
```

### GetObject

シグネチャ：`func (p *Processor) GetObject(jsonStr, path string, defaultValue ...map[string]any) map[string]any`

指定パスからオブジェクトを取得します。パスが存在しない、値が null、型変換に失敗した場合は nil または `defaultValue` を返します。

```go
profile := p.GetObject(data, "user.profile")
config := p.GetObject(data, "config", map[string]any{"timeout": 30})
```

## ジェネリクス取得

::: tip パッケージレベル関数
`GetTyped[T]` はパッケージレベル関数で、Processor メソッドではありません。詳しくは[ジェネリクス操作](../generics#gettyped)を参照してください。
:::

```go
// パッケージレベル GetTyped を使用
user := json.GetTyped[User](data, "user")

// デフォルト値付き
user = json.GetTyped[User](data, "user", User{Name: "unknown"})
```

## バッチクエリ

### GetMultiple

シグネチャ：`func (p *Processor) GetMultiple(jsonStr string, paths []string, cfg ...Config) (map[string]any, error)`

複数パスの値を一度に取得し、パスから値へのマッピングを返します。

```go
results, err := p.GetMultiple(data, []string{"user.name", "user.age", "user.email"})
if err != nil {
    panic(err)
}
fmt.Println(results["user.name"]) // Alice
fmt.Println(results["user.age"])  // 30
```

## パスのコンパイル

### CompilePath

シグネチャ：`func (p *Processor) CompilePath(path string) (*CompiledPath, error)`

パス式をプリコンパイルし、以降の高速な繰り返し操作に使用します。

```go
cp, err := p.CompilePath("users[0].name")
if err != nil {
    panic(err)
}
defer cp.Release()

// コンパイル済みパスで複数回クエリ
value, err := p.GetCompiled(data1, cp)
value, err = p.GetCompiled(data2, cp)
```

### GetCompiled

シグネチャ：`func (p *Processor) GetCompiled(jsonStr string, cp *CompiledPath) (any, error)`

プリコンパイル済みパスで値を取得します。複数の JSON データに同じパスを繰り返しクエリする場合に適しています。

::: warning Get との 2 点の違い
- **per-call `cfg` を受け取らない**：入力検証（サイズ、深度、危険パターン）は常にプロセッサ自身の設定で実行されます。
- **結果キャッシュを参照しない**：省かれるのはパス解析のオーバーヘッドで、JSON 自体は毎回解析されます。解析も再利用したい場合は [`PreParse`](#preparse) と組み合わせてください。
:::

**完全なサンプル：ドキュメント群に同じパスを繰り返しクエリ**

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

	cp, err := p.CompilePath("user.name")
	if err != nil {
		panic(err)
	}
	defer cp.Release()

	docs := []string{
		`{"user":{"name":"Alice"}}`,
		`{"user":{"name":"Bob"}}`,
	}
	for _, doc := range docs {
		name, err := p.GetCompiled(doc, cp)
		if err != nil {
			panic(err)
		}
		fmt.Println(name)
	}
}

// 出力:
// Alice
// Bob
```

## 事前解析クエリ

### PreParse

シグネチャ：`func (p *Processor) PreParse(jsonStr string, cfg ...Config) (*ParsedJSON, error)`

JSON ドキュメントを事前解析し、再利用可能な `*ParsedJSON` を返します。同じ JSON への複数回クエリでは解析は 1 回だけ行われ、以降のクエリは直接ナビゲーションします。

```go
parsed, err := p.PreParse(largeJSON)
if err != nil {
    panic(err)
}
defer parsed.Release() // 使い終わったら解析ツリーの参照を解放

// 複数回のクエリで解析結果を再利用
name, _ := p.GetFromParsed(parsed, "user.name")
email, _ := p.GetFromParsed(parsed, "user.email")
tags, _ := p.GetFromParsed(parsed, "tags")
```

### GetFromParsed

シグネチャ：`func (p *Processor) GetFromParsed(parsed *ParsedJSON, path string, cfg ...Config) (any, error)`

事前解析結果に対してパスで値を取り、JSON 解析ステップをスキップします。

コンテナ型の結果（`map[string]any` / `[]any`）はデフォルトで防御的ディープコピー後に返され、基本型は直接返されます。プロセッサで `Config.CacheSharedResults` が有効（呼び出し側が返された値を変更しないと約束する）な場合はコピーをスキップします。`GetFromParsed` 自体は**結果キャッシュに書き込みません**——事前解析で再利用されるのは解析ツリーそのものであり、クエリ結果ではありません。

**ParsedJSON メソッド**

| メソッド | 説明 |
|------|------|
| `Data() any` | 内部の解析結果を取得（`map[string]any` / `[]any`） |
| `Release()` | 内部データ参照を空にし、解析ツリーを GC 対象にする（呼び出し後 `Data()` は `nil` を返す。`defer` と組み合わせて使用） |

::: tip CompilePath との分担
`PreParse` は「同一 JSON の重複解析」を、`CompilePath` は「同一パスの重複解析」を省きます。`SetFromParsed`（[解析と検証](./parse#setfromparsed)を参照）は事前解析結果へのチェーン変更をサポートします。両者の選定基準は [Processor ガイド](../../getting-started/processor-guide)を参照してください。
:::

## 関連

- [データ変更](./modify) - Set/Delete メソッド
- [バッチ操作](./batch) - ProcessBatch バッチ処理
- [ジェネリクス操作](../generics) - GetTyped[T] ジェネリクス取得
