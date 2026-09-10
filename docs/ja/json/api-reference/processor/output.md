---
sidebar_label: "エンコード出力"
title: "Processor エンコード出力 - CyberGo JSON | API リファレンス"
description: "CyberGo JSON Processor 出力メソッド：Encode、EncodePretty、EncodeWithConfig、EncodeBatch/EncodeFields バッチ、Compact/Indent/HTMLEscape フォーマットを提供します。"
sidebar_position: 5
---

# 出力メソッド

Processor は多様な JSON エンコード出力メソッドを提供します。

## 基本出力

### Encode

<Badge type="danger" text="非推奨" />

シグネチャ：`func (p *Processor) Encode(value any, config ...Config) (string, error)`

任意の値を JSON 文字列にエンコードします。

::: warning 非推奨
`Processor.Encode` は [`EncodeWithConfig`](#encodewithconfig) に直接委譲します。`EncodeWithConfig` に置き換えてください。`Encode` は将来のメジャーバージョンで削除されます。
:::

```go
result, err := p.Encode(map[string]any{"name": "CyberGo"})
if err != nil {
    panic(err)
}
fmt.Println(result)
```

### EncodePretty

シグネチャ：`func (p *Processor) EncodePretty(value any, config ...Config) (string, error)`

任意の値を整形済み JSON 文字列にエンコードします。

```go
result, err := p.EncodePretty(user)
if err != nil {
    panic(err)
}
```

## 高度なエンコード

### EncodeWithConfig

シグネチャ：`func (p *Processor) EncodeWithConfig(value any, cfg ...Config) (string, error)`

指定設定で値を JSON 文字列にエンコードします。

**パラメータ**

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `value` | `any` | はい | エンコードする値 |
| `cfg` | `Config` | いいえ | エンコード設定（オプション） |

```go
// PrettyConfig を使用
result, err := p.EncodeWithConfig(data, json.PrettyConfig())

// SecurityConfig を使用
result, err = p.EncodeWithConfig(data, json.SecurityConfig())

// カスタム設定を使用
cfg := json.DefaultConfig()
cfg.Pretty = true
cfg.SortKeys = true
cfg.EscapeHTML = true
result, err = p.EncodeWithConfig(data, cfg)
```

### EncodeBatch

シグネチャ：`func (p *Processor) EncodeBatch(pairs map[string]any, cfg ...Config) (string, error)`

キー・バリューをまとめて JSON オブジェクトにエンコードします。

```go
result, err := p.EncodeBatch(map[string]any{
    "name": "CyberGo",
    "version": "1.0.0",
})
```

### EncodeFields

シグネチャ：`func (p *Processor) EncodeFields(value any, fields []string, cfg ...Config) (string, error)`

指定フィールドのみをエンコードします。部分シリアライズによく使われます。

```go
type User struct {
    Name    string `json:"name"`
    Email   string `json:"email"`
    Private string `json:"private"`
}

user := User{Name: "CyberGo", Email: "test@example.com", Private: "secret"}
// name と email フィールドのみエンコード
result, err := p.EncodeFields(user, []string{"name", "email"})
```

### EncodeStream

シグネチャ：`func (p *Processor) EncodeStream(values any, cfg ...Config) (string, error)`

複数の値を JSON 配列ストリーム（array stream）にエンコードします。`values` は通常スライスか列挙可能なコレクションで、`[v1,v2,...]` 形式の JSON 配列文字列を出力します。

```go
values := []any{"item1", "item2", "item3"}
result, err := p.EncodeStream(values)
```

## エンコード/デコード

### Marshal

シグネチャ：`func (p *Processor) Marshal(value any, cfg ...Config) ([]byte, error)`

Go 値を JSON バイトスライスにエンコードします。`encoding/json.Marshal` と 100% 互換です。

::: tip 出力は常に HTML エスケープされる
`encoding/json.Marshal` と同様に、本メソッドの出力は**常に** HTML エスケープされます——渡された `cfg` で `EscapeHTML=false` を設定しても、このパスでは上書きされます。エスケープを呼び出し側で制御する場合は [`EncodeWithConfig`](#encodewithconfig) を使ってください。
:::

```go
data, err := p.Marshal(map[string]any{"name": "CyberGo"})
if err != nil {
    panic(err)
}
fmt.Println(string(data)) // {"name":"CyberGo"}
```

### MarshalIndent

シグネチャ：`func (p *Processor) MarshalIndent(value any, prefix, indent string, cfg ...Config) ([]byte, error)`

Go 値を整形済み JSON バイトスライスにエンコードします。`encoding/json.MarshalIndent` と 100% 互換です。

```go
data, err := p.MarshalIndent(user, "", "  ")
if err != nil {
    panic(err)
}
fmt.Println(string(data))
```

### Unmarshal

シグネチャ：`func (p *Processor) Unmarshal(data []byte, value any, cfg ...Config) error`

JSON バイトスライスをターゲット変数に解析します。`encoding/json.Unmarshal` と 100% 互換です。

```go
var user User
err := p.Unmarshal([]byte(`{"name":"Alice","age":30}`), &user)
if err != nil {
    panic(err)
}
```

## フォーマット

### Prettify

シグネチャ：`func (p *Processor) Prettify(jsonStr string, cfg ...Config) (string, error)`

JSON 文字列をインデント形式にフォーマットします。デフォルトは 2 スペースインデント。`cfg` の `Indent` / `Prefix` フィールドでカスタマイズできます。

```go
pretty, err := p.Prettify(`{"name":"Alice","age":30}`)
// 出力:
// {
//   "name": "Alice",
//   "age": 30
// }

// 4 スペースインデント
cfg := json.DefaultConfig()
cfg.Indent = "    "
pretty, err = p.Prettify(`{"name":"Alice","age":30}`, cfg)
```

### Print（削除済み）

::: warning API 変更の説明
Print、PrintE、PrintPretty、PrintPrettyE はライブラリから削除され、提供されなくなりました。以下の代替案を使用してください：

```go
// コンパクト出力
s, err := p.EncodeWithConfig(data)
if err != nil {
    log.Fatal(err)
}
fmt.Println(s)

// 整形出力
pretty, err := p.EncodePretty(data)
if err != nil {
    log.Fatal(err)
}
fmt.Println(pretty)
```
:::

### ValidateSchema

シグネチャ：`func (p *Processor) ValidateSchema(jsonStr string, schema *Schema, cfg ...Config) ([]ValidationError, error)`

JSON データが指定 Schema に適合するか検証します。**Schema 違反の詳細は返される `[]ValidationError` で報告されます**。`error` が非 nil になるのは解析や事前検証の失敗時（JSON が不正、`schema` が `nil` など）のみです——検証通過時は `(nil, nil)`、検証失敗だがフローは正常な場合は `(非空スライス, nil)` を返します。

```go
schema := &json.Schema{
    Type:     "object",
    Required: []string{"name", "email"},
    Properties: map[string]*json.Schema{
        "name":  {Type: "string", MinLength: 1},
        "email": {Type: "string", Format: "email"},
    },
}

errors, err := p.ValidateSchema(jsonStr, schema)
if err != nil {
    panic(err)
}
for _, ve := range errors {
    fmt.Printf("パス %s: %s\n", ve.Path, ve.Message)
}
```

## フォーマット操作

### Compact

シグネチャ：`func (p *Processor) Compact(jsonStr string, cfg ...Config) (string, error)`

JSON 文字列を圧縮し、すべての空白文字を除去します。

::: warning メソッドとパッケージレベル関数の命名差異
「文字列イン、文字列アウト」の圧縮は 2 つの入口で**名前が異なります**：パッケージレベルは `json.CompactString(s)`、メソッド版は `p.Compact(s)` です。パッケージレベルの `json.Compact(dst, src)` は `encoding/json.Compact` 互換の **Buffer 形式**で、対応するメソッドは [`CompactBuffer`](#compactbuffer) であり、本メソッドではありません。
:::

```go
compact, err := p.Compact(`{"name": "CyberGo"}`)
// 出力: {"name":"CyberGo"}
```

### CompactBuffer

シグネチャ：`func (p *Processor) CompactBuffer(dst *bytes.Buffer, src []byte, cfg ...Config) error`

JSON を圧縮して Buffer に書き込みます。`encoding/json.Compact` とシグネチャ互換で、[`Compact`](#compact) の Buffer 形式です（パッケージレベルの対応は `json.Compact`）。

```go
var buf bytes.Buffer
err := p.CompactBuffer(&buf, []byte(`{"name": "test"}`))
```

### Indent

シグネチャ：`func (p *Processor) Indent(dst *bytes.Buffer, src []byte, prefix, indent string, cfg ...Config) error`

JSON をフォーマットして Buffer に書き込みます。

```go
var buf bytes.Buffer
err := p.Indent(&buf, []byte(`{"name":"test"}`), "", "  ")
```

### HTMLEscape

シグネチャ：`func (p *Processor) HTMLEscape(dst *bytes.Buffer, src []byte, cfg ...Config)`

JSON を HTML エスケープして Buffer に書き込みます。

```go
var buf bytes.Buffer
p.HTMLEscape(&buf, []byte(`{"html":"<script>alert(1)</script>"}`))
```

## 関連

- [Config](../config) - 設定オプション
- [解析とロード](./parse) - Parse/Load メソッド
