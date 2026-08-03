---
title: "標準ライブラリからの移行 - CyberGo JSON | encoding/json 互換ガイド"
description: "CyberGo JSON は encoding/json と 100% 互換です。import パスを置き換えるだけでコード変更なしで移行できます。関数対応表、動作の違い、追加機能のガイドを紹介します。"
sidebar_label: "標準ライブラリからの移行"
sidebar_position: 1.5
---

# 標準ライブラリからの移行

`cybergodev/json` は標準ライブラリ `encoding/json` と **100% 互換**です。import パスを置き換えるだけで、既存のコードは一切変更せずにコンパイルして実行できます。このページでは移行手順と、移行後に利用できる追加機能を紹介します。

## 3 ステップで移行

1. **インストール**:

   ```bash
   go get github.com/cybergodev/json
   ```

2. **import の置き換え**: `"encoding/json"` を `"github.com/cybergodev/json"` に置き換えます。

   ```go
   // 移行前
   import "encoding/json"

   // 移行後
   import "github.com/cybergodev/json"
   ```

3. **完了**: コンパイルが通り、既存のコードは一切変更不要です。

## 完全互換の API

以下の表は `encoding/json` と `cybergodev/json` の対応関係を示します:

| encoding/json | cybergodev/json | 説明 |
|---|---|---|
| `Marshal(v)` | `Marshal(v, cfg...)` | 互換シグネチャ、追加の省略可能な cfg パラメータ |
| `Unmarshal(data, &v)` | `Unmarshal(data, &v, cfg...)` | 同上 |
| `MarshalIndent(v, prefix, indent)` | 同名 | 完全互換 |
| `Compact(dst, src)` | 同名 | 完全互換 |
| `Indent(dst, src, prefix, indent)` | 同名 | 完全互換 |
| `HTMLEscape(dst, src)` | 同名 | 完全互換 |
| `Valid(data)` | `Valid(data, cfg...)` | 互換シグネチャ |
| `NewEncoder(w)` | `NewEncoder(w, cfg...)` | 互換シグネチャ |
| `NewDecoder(r)` | `NewDecoder(r, cfg...)` | 互換シグネチャ |
| `Number` | `Number` | 型互換 |
| `Delim` | `Delim` | 型互換 |
| `Token` | `Token` | 型互換 |

:::tip 省略可能な cfg パラメータ
すべての追加 `cfg ...Config` パラメータは**省略可能**（可変長引数）です。指定しない場合は標準ライブラリと全く同じ動作になります。セキュリティモードやキャッシュなどの拡張機能を有効にする場合にのみ指定します。
:::

## コード例: import を置き換えるだけ

以下の例は「import を置き換えるだけ」の効果を示します。エンコード、デコード、構造体タグ（struct tag）の使い方は `encoding/json` と全く同じです:

```go
package main

import (
    "fmt"

    "github.com/cybergodev/json"
)

func main() {
    type User struct {
        Name string   `json:"name"`
        Age  int      `json:"age"`
        Tags []string `json:"tags"`
    }

    // エンコード — encoding/json と全く同じ
    user := User{Name: "Alice", Age: 30, Tags: []string{"go", "json"}}
    b, err := json.Marshal(user)
    if err != nil {
        panic(err)
    }
    fmt.Println(string(b))
    // 出力: {"name":"Alice","age":30,"tags":["go","json"]}

    // デコード — encoding/json と全く同じ
    var u User
    if err := json.Unmarshal(b, &u); err != nil {
        panic(err)
    }
    fmt.Printf("%+v\n", u)
    // 出力: {Name:Alice Age:30 Tags:[go json]}
}
```

## 追加機能

移行後、標準ライブラリとの互換性を保ちながら、標準ライブラリでは提供されない以下の機能を必要に応じて利用できます:

| 機能 | 例 | 詳細 |
|---|---|---|
| パスクエリ | `json.GetString(data, "user.name")` | [パス式の構文](./path-syntax) |
| デフォルト値付き取得 | `json.GetInt(data, "timeout", 30)` | [クエリ関数](../api-reference/functions/query) |
| ジェネリック取得 | `json.GetTyped[User](data, "user")` | [ジェネリクス](../api-reference/generics) |
| パス変更 | `json.Set(data, "user.name", "Bob")` | [変更操作](../api-reference/functions/modify) |
| スキーマ検証 | `json.ValidateSchema(data, schema)` | [バリデーター](../extensions/validator) |
| ストリーミング JSONL | `json.StreamLinesInto[T](r, fn)` | [JSONL 処理](../streaming/jsonl) |
| 高パフォーマンスプロセッサ | `p, _ := json.New()` | [Processor ガイド](./processor-guide) |

## 動作の違い

**デフォルト設定**では、`cybergodev/json` の動作は `encoding/json` と全く同じです。すべての追加機能（セキュリティモード、パスクエリ、スキーマ検証など）は **opt-in** です。`Config` パラメータで明示的に有効化し、既存のコードには影響しません。

言い換えると、移行はコストゼロで、「標準ライブラリ + 追加機能」のスーパーセットを手に入れられます。

## 次のステップ

- [クイックスタート](./) — 5 分でコア機能を使い始める
- [パス式の構文](./path-syntax) — パスクエリの構文を学ぶ
- [チートシート](./cheatsheet) — クイック API リファレンス
