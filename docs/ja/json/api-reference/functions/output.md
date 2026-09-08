---
sidebar_label: "エンコード出力"
title: "エンコード出力関数 - CyberGo JSON | API リファレンス"
description: "CyberGo JSON のエンコード関数：Marshal/Unmarshal シリアライズ、Compact/Indent/HTMLEscape フォーマット、Encode/EncodePretty/Prettify エンコード、EncodeFields フィルタとストリーム処理、標準ライブラリと 100% 互換です。"
sidebar_position: 5
---

# エンコード出力関数

json パッケージが提供するエンコード・デコード関数。シリアライズ、デシリアライズ、フォーマット、設定付きエンコードを含みます。

## シリアライズ関数

### Marshal

シグネチャ：`func Marshal(value any, cfg ...Config) ([]byte, error)`

Go 値を JSON バイトスライスにシリアライズします。`encoding/json.Marshal` と 100% 互換です：cfg なしで `json.Marshal(v)` を呼び出した場合、標準ライブラリと完全に一致します。

オプションの末尾 `Config` でエンコード動作（インデント、数値処理など）を制御でき、`Processor.Marshal` とのパッケージレベル/インスタンスレベルのミラーを形成します。

```go
// encoding/json 互換（cfg なし）
data, err := json.Marshal(map[string]any{"name": "test"})
if err != nil {
    panic(err)
}
fmt.Println(string(data)) // {"name":"test"}

// 設定付き（非破壊的なオプション引数）
data, err = json.Marshal(value, json.PrettyConfig())
```

::: warning Marshal の出力は常に HTML エスケープされる
`encoding/json.Marshal` と同様に、`Marshal` の出力は**常に** HTML エスケープされます——`cfg.EscapeHTML = false` を渡しても、このパスではオンに上書きされます。エスケープ動作を呼び出し側で制御する必要がある場合は、[`EncodeWithConfig`](#encodewithconfig) を使ってください。
:::

### Unmarshal

シグネチャ：`func Unmarshal(data []byte, value any, cfg ...Config) error`

JSON バイトスライスを Go 値にデシリアライズします。`encoding/json.Unmarshal` と 100% 互換です：cfg なしで `json.Unmarshal(data, &v)` を呼び出した場合、標準ライブラリと完全に一致します。

オプションの末尾 `Config` でセキュリティ制限、数値保持などを制御でき、`Processor.Unmarshal` とのミラーを形成します。

```go
var result struct {
    Name string `json:"name"`
}
// encoding/json 互換（cfg なし）
err := json.Unmarshal([]byte(`{"name":"test"}`), &result)

// 設定付き
err = json.Unmarshal(data, &v, json.SecurityConfig())
```

::: tip cfg なしのファストパスもセキュリティ検証を実行
cfg なしで呼び出した場合、`Unmarshal` は `encoding/json` に委譲する前に、プロセッサ内蔵のセキュリティ制限（サイズ、ネスト深度、危険パターン）で入力を検証します——つまり標準ライブラリの drop-in 置き換えとして使っても、セキュリティ防線はバイパスされません。
:::

### MarshalIndent

シグネチャ：`func MarshalIndent(v any, prefix, indent string, cfg ...Config) ([]byte, error)`

インデント付きのシリアライズ。`encoding/json.MarshalIndent` と 100% 互換です：cfg なしで `json.MarshalIndent(v, prefix, indent)` を呼び出した場合、標準ライブラリと完全に一致します。

オプションの末尾 `Config` で追加設定が可能です。`prefix` と `indent` 引数は `Config` の対応フィールドを上書きします。

```go
// encoding/json 互換（cfg なし）
data, err := json.MarshalIndent(user, "", "  ")
if err != nil {
    panic(err)
}
fmt.Println(string(data))

// 設定付き
data, err = json.MarshalIndent(v, "", "  ", json.SecurityConfig())
```

## フォーマット関数

### Compact

シグネチャ：`func Compact(dst *bytes.Buffer, src []byte, cfg ...Config) error`

JSON を圧縮し、不要な空白文字を除去して結果を `dst` に書き込みます。`encoding/json.Compact`（buffer 形式）と互換です。

```go
var buf bytes.Buffer
err := json.Compact(&buf, []byte(`{"name": "test"}`))
if err != nil {
    panic(err)
}
fmt.Println(buf.String()) // {"name":"test"}
```

### CompactString

シグネチャ：`func CompactString(jsonStr string, cfg ...Config) (string, error)`

文字列入力/文字列出力の形式で JSON を圧縮し、不要な空白文字を除去します。`Processor.Compact` のパッケージレベルミラーで、`Prettify`（`Processor.Prettify` のミラー）と対称です。

::: info シグネチャの非対称：Compact ファミリーと Processor のミラー関係
パッケージレベル `Compact` は `encoding/json.Compact` の互換シグネチャ（buffer 引数）を保持しているため、Processor メソッド版と**名前がずれています**——Processor の `Compact(jsonStr) (string, error)` はパッケージレベルでは `CompactString`、その buffer 形式は `CompactBuffer` と呼ばれます：

| パッケージレベル関数 | シグネチャ形式 | ミラー先の Processor メソッド |
|----------|----------|------------------------|
| `Compact(dst *bytes.Buffer, src []byte)` | buffer 引数（encoding/json 互換） | `CompactBuffer(dst, src)` |
| `CompactString(jsonStr string) (string, error)` | 文字列イン、文字列アウト | `Compact(jsonStr)` |
| `Prettify(jsonStr string) (string, error)` | 文字列イン、文字列アウト | `Prettify(jsonStr)` |
:::

```go
compact, err := json.CompactString(`{
    "name": "Alice",
    "age": 30
}`)
// compact == `{"name":"Alice","age":30}`

// 設定付き（例：元の数値フォーマットを保持）
cfg := json.DefaultConfig()
cfg.PreserveNumbers = true
compact, err = json.CompactString(jsonStr, cfg)
```

### Indent

シグネチャ：`func Indent(dst *bytes.Buffer, src []byte, prefix, indent string, cfg ...Config) error`

JSON をフォーマットしてインデントを追加し、結果を `dst` に書き込みます。`encoding/json.Indent` と互換です。

```go
var buf bytes.Buffer
err := json.Indent(&buf, []byte(`{"name":"test"}`), "", "  ")
if err != nil {
    panic(err)
}
fmt.Println(buf.String())
// {
//   "name": "test"
// }
```

### HTMLEscape

シグネチャ：`func HTMLEscape(dst *bytes.Buffer, src []byte, cfg ...Config)`

JSON 内容を HTML エスケープし、`<`、`>`、`&` などの特殊文字（および U+2028、U+2029）を対応する Unicode エスケープシーケンスに置き換えて、結果を `dst` に書き込みます。戻り値はありません。

```go
var buf bytes.Buffer
json.HTMLEscape(&buf, []byte(`{"html":"<script>alert(1)</script>"}`))
fmt.Println(buf.String())
// {"html":"\u003cscript\u003ealert(1)\u003c/script\u003e"}
```

### Prettify

シグネチャ：`func Prettify(jsonStr string, cfg ...Config) (string, error)`

デフォルトの整形印刷インデントで JSON 文字列をフォーマットし、整形後の文字列を返します。

```go
pretty, err := json.Prettify(`{"name":"Alice","age":30}`)
if err != nil {
    panic(err)
}
fmt.Println(pretty)
// {
//   "name": "Alice",
//   "age": 30
// }
```

## 設定付きエンコード関数

### Encode

<Badge type="danger" text="非推奨" />

シグネチャ：`func Encode(value any, cfg ...Config) (string, error)`

Go 値を JSON 文字列にエンコードします。オプションの設定引数をサポートします。

::: warning 非推奨
`Encode` は機能的に [`EncodeWithConfig`](#encodewithconfig) と完全に同一です（両者は同じ実装に委譲）。`EncodeWithConfig` への置き換え、または `[]byte` 出力が許容される場合は [`Marshal`](#marshal) の使用を推奨します。`Encode` は将来のメジャーバージョンで削除されます。
:::

```go
result, err := json.Encode(user)
if err != nil {
    panic(err)
}
fmt.Println(result)
```

**設定付き**

```go
result, err := json.Encode(user, json.SecurityConfig())
```

### EncodePretty

シグネチャ：`func EncodePretty(value any, cfg ...Config) (string, error)`

Go 値を整形済み（インデント付き）JSON 文字列にエンコードします。オプションの設定引数をサポートします。

```go
result, err := json.EncodePretty(user)
if err != nil {
    panic(err)
}
fmt.Println(result)
```

**設定付き**

```go
result, err := json.EncodePretty(user, json.PrettyConfig())
```

### EncodeWithConfig

シグネチャ：`func EncodeWithConfig(value any, cfg ...Config) (string, error)`

指定設定で Go 値を JSON 文字列にエンコードします。エンコード動作をきめ細かく制御する必要があるシナリオに適しています。

```go
// 整形印刷設定を使用
result, err := json.EncodeWithConfig(data, json.PrettyConfig())
if err != nil {
    panic(err)
}
fmt.Println(result)
```

**セキュリティ設定を使用**

```go
result, err := json.EncodeWithConfig(data, json.SecurityConfig())
```

## バッチエンコード関数

### EncodeBatch

シグネチャ：`func EncodeBatch(pairs map[string]any, cfg ...Config) (string, error)`

キー・バリューをまとめて JSON オブジェクト文字列にエンコードします。`EncodeWithConfig(map[string]any(pairs), cfg)` と等価で、キーは辞書順で出力されます（`encoding/json` と一致）。

```go
result, err := json.EncodeBatch(map[string]any{
    "name":  "Alice",
    "age":   30,
    "email": "alice@example.com",
})
if err != nil {
    panic(err)
}
fmt.Println(result) // {"age":30,"email":"alice@example.com","name":"Alice"}
```

### EncodeFields

シグネチャ：`func EncodeFields(value any, fields []string, cfg ...Config) (string, error)`

指定フィールドのみをエンコードし、フィールドフィルタリング出力を実現します。`fields` に**実際に存在しない**キーは黙って無視され（両者の積集合のみ出力）、`value` のエンコード結果が JSON オブジェクトでない場合は `ErrTypeMismatch` を返します（`value is not an object, cannot filter fields`）。

```go
user := struct {
    Name     string `json:"name"`
    Email    string `json:"email"`
    Password string `json:"password"`
}{
    Name: "Alice", Email: "a@b.com", Password: "secret",
}

// 公開フィールドのみ出力
result, err := json.EncodeFields(user, []string{"name", "email"})
if err != nil {
    panic(err)
}
fmt.Println(result) // {"name":"Alice","email":"a@b.com"}
```

### EncodeStream

シグネチャ：`func EncodeStream(values any, cfg ...Config) (string, error)`

複数の値を JSON 配列ストリーム（array stream）にエンコードします。`values` は通常スライスか列挙可能なコレクションで、`[v1,v2,...]` 形式の JSON 配列文字列を出力します。`EncodeWithConfig(values, cfg)` と等価です：`values` がスライスの場合は JSON 配列を出力し、非コレクション値が渡された場合は `EncodeWithConfig` のセマンティクスでその値自体を出力します。

```go
values := []map[string]any{
    {"id": 1, "name": "Alice"},
    {"id": 2, "name": "Bob"},
}

result, err := json.EncodeStream(values)
if err != nil {
    panic(err)
}
fmt.Println(result)
```

## Processor フォーマットメソッド

`Processor` 型は追加のフォーマットメソッドを提供します。`json.New()` で Processor を作成します（`(*Processor, error)` を返す）：

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()
```

### Processor.CompactBuffer

シグネチャ：`func (p *Processor) CompactBuffer(dst *bytes.Buffer, src []byte, cfg ...Config) error`

JSON バイトを圧縮して `dst` バッファに書き込みます。パッケージレベルの `Compact` 関数はこのメソッドに委譲します。

```go
var buf bytes.Buffer
err := p.CompactBuffer(&buf, []byte(`{"name": "Alice"}`))
// buf.String() => {"name":"Alice"}
```

### Processor.Indent

シグネチャ：`func (p *Processor) Indent(dst *bytes.Buffer, src []byte, prefix, indent string, cfg ...Config) error`

インデント付き JSON を `dst` バッファに書き込みます。`encoding/json.Indent` と互換です。

```go
var buf bytes.Buffer
err := p.Indent(&buf, []byte(`{"name":"Alice"}`), "", "  ")
```

### Processor.HTMLEscape

シグネチャ：`func (p *Processor) HTMLEscape(dst *bytes.Buffer, src []byte, cfg ...Config)`

HTML エスケープ済み JSON を `dst` バッファに書き込みます。戻り値はありません。`encoding/json.HTMLEscape` と互換です。

```go
var buf bytes.Buffer
p.HTMLEscape(&buf, []byte(`{"html":"<script>"}`))
```

:::tip
完全な Processor メソッドドキュメントは [Processor](../processor/) を参照してください。
:::

## ストリーミングエンコード・デコード

`NewEncoder(w)` / `NewDecoder(r)` は `encoding/json` と完全互換です（`SetIndent`、`SetEscapeHTML`、`UseNumber`、`Token` などのメソッドを含む）。`io.Writer`/`io.Reader` からのストリーミングエンコード・デコードをサポートします：

```go
// stdout へストリーミングエンコード
enc := json.NewEncoder(os.Stdout)
enc.SetIndent("", "  ")
_ = enc.Encode(user)

// ストリーミングデコード（JSON 値を 1 つずつ読み取り）
dec := json.NewDecoder(resp.Body)
for dec.More() {
    var msg Message
    if err := dec.Decode(&msg); err != nil {
        break
    }
}
```

:::tip
`Encoder`/`Decoder` の完全なメソッド表は[型定義](../types#encoder-json-エンコーダ)を参照してください。
:::

## 設定プリセット

以下の補助関数は事前設定された `Config` 値を返します。`...Config` を受け取る任意の関数に渡せます：

```go
// デフォルト設定
cfg := json.DefaultConfig()

// 整形印刷設定
cfg = json.PrettyConfig()

// セキュリティ設定
cfg = json.SecurityConfig()
```

:::tip
完全な Config フィールドドキュメントは[設定](../config)を参照してください。
:::

## 関連

- [クエリと取得関数](./query) - Get, GetString などのクエリ操作
- [変更関数](./modify) - Set, Delete などの変更操作
- [ファイル操作](./file-io) - LoadFromFile, SaveToFile などのファイル操作
- [設定](../config) - Config 型とオプション
- [インターフェース](../interfaces) - Processor, Encoder, Decoder 型
