---
sidebar_label: "ファイル操作"
title: "Processor ファイル操作メソッド - CyberGo JSON | API リファレンス"
description: "CyberGo JSON Processor ファイルメソッド：LoadFromFile/LoadFromReader ロード、SaveToFile/MarshalToFile 保存、UnmarshalFromFile 読込、SaveToWriter ストリーム書込に対応します。"
sidebar_position: 9
---

# ファイル操作メソッド

Processor は JSON ファイルの読み書きとストリーム読み込みメソッドを提供し、ファイル、`io.Reader`、`io.Writer` の 3 種類のデータソースをカバーします。ファイル系メソッドは操作前にセキュリティパス検証を行います（[関数リファレンス](../functions/file-io#セキュリティ-ファイルパス検証) を参照）。

## ファイル読み込み

### LoadFromFile

シグネチャ：`func (p *Processor) LoadFromFile(filePath string, cfg ...Config) (string, error)`

ファイルから JSON データを読み込み、**元の文字列**を返します（ファイルのバイト順序と空白を保持し、再エンコードしません）。読み取るバイト数は `MaxJSONSize` で制限されます。

```go
data, err := p.LoadFromFile("config.json")
if err != nil {
    panic(err)
}
fmt.Println(data) // 元の JSON 文字列
```

### LoadFromFileAsData（プライベート化済み）

::: warning API 変更説明
LoadFromFileAsData は内部メソッド（`loadFromFileAsData`）に転換され、公開 API としてエクスポートされなくなりました。`LoadFromFile` + `Parse` の組み合わせで代用してください：

```go
jsonStr, err := p.LoadFromFile("data.json")
if err != nil {
    panic(err)
}
var data any
err = p.Parse(jsonStr, &data)
// data の型は map[string]any または []any
if obj, ok := data.(map[string]any); ok {
    fmt.Println(obj["name"])
}
```

:::

## Reader 読み込み

### LoadFromReader

シグネチャ：`func (p *Processor) LoadFromReader(reader io.Reader, cfg ...Config) (string, error)`

`io.Reader` から JSON データを読み込み、元の文字列を返します。読み取りは `MaxJSONSize` で制限され、`os.File`、HTTP Body、パイプなどのストリームソースに適しています。

```go
file, _ := os.Open("data.json")
defer file.Close()

data, err := p.LoadFromReader(file)
if err != nil {
    panic(err)
}
```

### LoadFromReaderAsData（プライベート化済み）

::: warning API 変更説明
LoadFromReaderAsData は内部メソッド（`loadFromReaderAsData`）に転換され、公開 API としてエクスポートされなくなりました。`LoadFromReader` + `Parse` の組み合わせで代用してください：

```go
file, _ := os.Open("data.json")
defer file.Close()

jsonStr, err := p.LoadFromReader(file)
if err != nil {
    panic(err)
}
var data any
err = p.Parse(jsonStr, &data)
```

:::

## ファイル書き込み

### SaveToFile

シグネチャ：`func (p *Processor) SaveToFile(filePath string, data any, cfg ...Config) error`

データを JSON ファイルとして保存します。親ディレクトリを自動作成し、**アトミック書き込み**（一時ファイル + rename）を採用します。文字列 / `[]byte` 入力は二重エスケープを避けるため事前解析されます。

```go
err := p.SaveToFile("data.json", map[string]any{"name": "CyberGo"})

// PrettyConfig で整形出力を保存
err = p.SaveToFile("data.json", data, json.PrettyConfig())
```

**完全な例：SaveToFile + LoadFromFile ラウンドトリップ**

```go
package main

import (
    "fmt"
    "os"

    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New()
    if err != nil {
        panic(err)
    }
    defer p.Close()

    tmp, err := os.CreateTemp("", "cybergo-*.json")
    if err != nil {
        panic(err)
    }
    path := tmp.Name()
    tmp.Close()
    defer os.Remove(path)

    err = p.SaveToFile(path, map[string]any{"name": "Alice", "age": 30})
    if err != nil {
        panic(err)
    }

    data, err := p.LoadFromFile(path)
    if err != nil {
        panic(err)
    }
    fmt.Println(data)
    // 出力：{"age":30,"name":"Alice"}
}
```

### MarshalToFile

シグネチャ：`func (p *Processor) MarshalToFile(path string, data any, cfg ...Config) error`

データを JSON にエンコードしてファイルに書き込みます。親ディレクトリを自動作成し、アトミック書き込みを行います。`SaveToFile` との違い：`MarshalToFile` は直接 `Marshal` / `MarshalIndent` を呼び出し（文字列の事前解析をしない）、構造体や map などの Go 値の書き込みに適しています。

```go
err := p.MarshalToFile("output.json", data)

// 整形保存
err = p.MarshalToFile("output.json", data, json.PrettyConfig())
```

**完全な例：MarshalToFile + UnmarshalFromFile 構造体ラウンドトリップ**

```go
package main

import (
    "fmt"
    "os"

    "github.com/cybergodev/json"
)

type User struct {
    Name string `json:"name"`
    Age  int    `json:"age"`
}

func main() {
    p, err := json.New()
    if err != nil {
        panic(err)
    }
    defer p.Close()

    tmp, err := os.CreateTemp("", "cybergo-*.json")
    if err != nil {
        panic(err)
    }
    path := tmp.Name()
    tmp.Close()
    defer os.Remove(path)

    err = p.MarshalToFile(path, User{Name: "Alice", Age: 30})
    if err != nil {
        panic(err)
    }

    var user User
    err = p.UnmarshalFromFile(path, &user)
    if err != nil {
        panic(err)
    }
    fmt.Printf("%s, %d\n", user.Name, user.Age)
    // 出力：Alice, 30
}
```

### UnmarshalFromFile

シグネチャ：`func (p *Processor) UnmarshalFromFile(path string, v any, cfg ...Config) error`

ファイルから JSON を読み込み、ターゲット変数にデコードします。読み取りは `MaxJSONSize` で制限されます。

```go
var config Config
err := p.UnmarshalFromFile("config.json", &config)
if err != nil {
    panic(err)
}
```

### SaveToWriter

シグネチャ：`func (p *Processor) SaveToWriter(writer io.Writer, data any, cfg ...Config) error`

データを JSON にエンコードして `io.Writer` に書き込みます。ファイルパスを扱わないため、パス検証は行いません。

```go
var buf bytes.Buffer
err := p.SaveToWriter(&buf, data, json.PrettyConfig())
```

**完全な例：bytes.Buffer への書き込み**

```go
package main

import (
    "bytes"
    "fmt"

    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New()
    if err != nil {
        panic(err)
    }
    defer p.Close()

    var buf bytes.Buffer
    err = p.SaveToWriter(&buf, map[string]any{"name": "Alice", "age": 30}, json.PrettyConfig())
    if err != nil {
        panic(err)
    }
    fmt.Print(buf.String())
    // 出力：
    // {
    //   "age": 30,
    //   "name": "Alice"
    // }
}
```

## ファイル反復

Processor は `ForeachFile` シリーズメソッドを提供し、ファイルから直接 JSON コレクションを反復できます。`LoadFromFile` + `Foreach` の便利な組み合わせです：

| メソッド | 用途 |
|------|------|
| `ForeachFile(path, fn, cfg...)` | ファイルのルートレベル配列 / オブジェクトを反復 |
| `ForeachFileWithPath(path, pathExpr, fn, cfg...)` | ファイル内の指定パスの下のコレクションを反復 |
| `ForeachFileChunked(path, chunkSize, fn, cfg...)` | 大配列をバッチ単位で反復 |
| `ForeachFileNested(path, fn, cfg...)` | すべてのネスト構造を再帰的に反復 |

```go
err := p.ForeachFile("users.json", func(key any, item *json.IterableValue) error {
    fmt.Println(item.GetString("name"))
    return nil
})
```

コールバックは `item.Break()` で早期終了に対応します。ストリーム処理と大ファイル最適化の詳細は[ストリーム処理](../../streaming/large-files)を参照。

## メソッド選択

| シナリオ | 推奨メソッド |
|------|----------|
| 元の文字列が必要 | `LoadFromFile` / `LoadFromReader` |
| 解析済みデータが必要 | `LoadFromFile` + `Parse` / `LoadFromReader` + `Parse` |
| Go 値をファイルに保存 | `SaveToFile` / `MarshalToFile` |
| ファイルから読み込んで構造体にデコード | `UnmarshalFromFile` |
| Writer に書き込み | `SaveToWriter` |
| ファイル内のコレクションを反復 | `ForeachFile` シリーズ |

## 関連

- [解析検証](./parse) - Parse/Valid 解析メソッド
- [ファイル関数](../functions/file-io) - パッケージレベルのファイル読み書き関数（パスセキュリティ検証の詳細を含む）
- [ストリーム処理](../../streaming/large-files) - ストリームプロセッサと大ファイル反復の詳細
