---
sidebar_label: "ファイル操作"
title: "ファイル操作関数 - CyberGo JSON | API リファレンス"
description: "CyberGo JSON ファイル操作関数：LoadFromFile/SaveToFile 読み書き、LoadFromReader/SaveToWriter ストリーム I/O、MarshalToFile/UnmarshalFromFile シリアライズに対応します。"
sidebar_position: 9
---

# ファイル操作関数

json パッケージが提供するファイル操作関数は、ファイル読み書き、ストリーム I/O、型付きシリアライズに対応します。すべてのファイルパスは読み書き前にセキュリティ検証を受けます（[ファイルパス検証](#セキュリティ-ファイルパス検証) を参照）。

## ファイル読み書き

### LoadFromFile

シグネチャ：`func LoadFromFile(filePath string, cfg ...Config) (string, error)`

ファイルから JSON データを読み込み、**元の文字列**を返します（再エンコードせず、ファイル内のバイト順序と空白を保持）。ファイルサイズは `Config.MaxJSONSize` で制限されます。

**パラメータ**

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `filePath` | `string` | はい | ファイルパス（セキュリティ検証に通過する必要あり） |
| `cfg` | `Config` | いいえ | オプション設定（`MaxJSONSize` の厳格化など） |

```go
data, err := json.LoadFromFile("config.json")
if err != nil {
    panic(err)
}
fmt.Println(data) // 元の JSON 文字列
```

### SaveToFile

シグネチャ：`func SaveToFile(filePath string, data any, cfg ...Config) error`

データを JSON ファイルとして保存します。存在しない親ディレクトリを自動作成し、**アトミック書き込み**を採用します（一時ファイルに書き込んでから rename するため、クラッシュしても既存ファイルが切り詰められることはありません）。文字列 / `[]byte` 入力は二重エスケープを避けるため事前に解析されます。

**パラメータ**

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `filePath` | `string` | はい | ファイルパス（セキュリティ検証に通過する必要あり） |
| `data` | `any` | はい | 保存するデータ（Go 値または JSON 文字列） |
| `cfg` | `Config` | いいえ | オプション設定（`PrettyConfig()` で整形出力など） |

```go
// コンパクト保存（デフォルト）
err := json.SaveToFile("output.json", map[string]any{
    "name": "Alice",
    "age":  30,
})

// 整形保存
err = json.SaveToFile("output.json", data, json.PrettyConfig())
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
    // 一時ファイルを作成し、例が単独で実行できるようにする
    tmp, err := os.CreateTemp("", "cybergo-*.json")
    if err != nil {
        panic(err)
    }
    path := tmp.Name()
    tmp.Close()
    defer os.Remove(path)

    // 書き込み：map はキー名順にエンコード
    err = json.SaveToFile(path, map[string]any{"name": "Alice", "age": 30})
    if err != nil {
        panic(err)
    }

    // 読み戻し：ファイルの元の内容を返す
    data, err := json.LoadFromFile(path)
    if err != nil {
        panic(err)
    }
    fmt.Println(data)
    // 出力：{"age":30,"name":"Alice"}
}
```

## ストリーム I/O

### LoadFromReader

シグネチャ：`func LoadFromReader(reader io.Reader, cfg ...Config) (string, error)`

`io.Reader` から JSON データを読み込み、元の文字列を返します。読み取るバイト数は `Config.MaxJSONSize` で制限され（メモリ枯渇を防止）、ネットワーク接続、HTTP レスポンスボディ、パイプなどのストリームデータソースに適しています。

**パラメータ**

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `reader` | `io.Reader` | はい | データソース |
| `cfg` | `Config` | いいえ | オプション設定 |

```go
// HTTP レスポンスボディから読み取り
resp, _ := http.Get("https://api.example.com/data")
defer resp.Body.Close()
data, err := json.LoadFromReader(resp.Body)

// 文字列から読み取り
data, err = json.LoadFromReader(strings.NewReader(`{"name":"test"}`))
```

**完全な例：strings.Reader と os.File からの読み取り**

```go
package main

import (
    "fmt"
    "strings"

    "github.com/cybergodev/json"
)

func main() {
    // strings.Reader から読み取り（元の内容がそのまま返る）
    reader := strings.NewReader(`{"name":"Alice","age":30}`)
    data, err := json.LoadFromReader(reader)
    if err != nil {
        panic(err)
    }
    fmt.Println(data)
    // 出力：{"name":"Alice","age":30}
}
```

`os.File` から読み取る場合も使い方は同じです——`os.File` は `io.Reader` を実装しています：

```go
file, err := os.Open("data.json")
if err != nil {
    panic(err)
}
defer file.Close()

data, err := json.LoadFromReader(file)
```

### SaveToWriter

シグネチャ：`func SaveToWriter(writer io.Writer, data any, cfg ...Config) error`

データを JSON にエンコードして `io.Writer` に書き込みます。`SaveToFile` と同様に文字列 / `[]byte` 入力を事前解析して二重エスケープを防ぎますが、**ファイルパス検証は行いません**（ターゲットは呼び出し元が制御します）。

**パラメータ**

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `writer` | `io.Writer` | はい | 出力先 |
| `data` | `any` | はい | 書き込むデータ |
| `cfg` | `Config` | いいえ | オプション設定 |

```go
var buf bytes.Buffer
err := json.SaveToWriter(&buf, map[string]any{"name": "test"}, json.PrettyConfig())
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
    var buf bytes.Buffer
    err := json.SaveToWriter(&buf, map[string]any{"name": "Alice", "age": 30}, json.PrettyConfig())
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

`os.File` への書き込みも同様です——ファイルハンドルを渡すだけです。

## シリアライズ便利メソッド

### MarshalToFile

シグネチャ：`func MarshalToFile(filePath string, data any, cfg ...Config) error`

データを JSON にシリアライズしてファイルに書き込みます。`SaveToFile` との違い：`MarshalToFile` は直接 `Marshal` / `MarshalIndent` を呼び出し（文字列の事前解析をしない）、構造体や map などの Go 値の書き込みに適しています。`SaveToFile` は入力がすでに JSON 文字列 / `[]byte` の可能性があるシナリオに適しています。どちらも親ディレクトリを自動作成し、アトミック書き込みを行います。

**パラメータ**

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `filePath` | `string` | はい | ファイルパス |
| `data` | `any` | はい | シリアライズするデータ |
| `cfg` | `Config` | いいえ | オプション設定（`PrettyConfig()` でインデント出力を生成） |

```go
err := json.MarshalToFile("data.json", myStruct)
err = json.MarshalToFile("data.json", myStruct, json.PrettyConfig())
```

### UnmarshalFromFile

シグネチャ：`func UnmarshalFromFile(filePath string, v any, cfg ...Config) error`

ファイルから JSON を読み込み、ターゲット変数にデシリアライズします。「ファイル読み取り + `Unmarshal`」の便利な組み合わせで、読み取り処理は `MaxJSONSize` の制限を受けます。

**パラメータ**

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `filePath` | `string` | はい | ファイルパス |
| `v` | `any` | はい | ターゲットオブジェクトへのポインタ |
| `cfg` | `Config` | いいえ | オプション設定 |

```go
var config MyConfig
err := json.UnmarshalFromFile("config.json", &config)
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
    tmp, err := os.CreateTemp("", "cybergo-*.json")
    if err != nil {
        panic(err)
    }
    path := tmp.Name()
    tmp.Close()
    defer os.Remove(path)

    // 構造体をシリアライズしてファイルに書き込み
    err = json.MarshalToFile(path, User{Name: "Alice", Age: 30})
    if err != nil {
        panic(err)
    }

    // ファイルから読み込んでデシリアライズ
    var user User
    err = json.UnmarshalFromFile(path, &user)
    if err != nil {
        panic(err)
    }
    fmt.Printf("%s, %d\n", user.Name, user.Age)
    // 出力：Alice, 30
}
```

## セキュリティ：ファイルパス検証

すべてのファイル読み書き関数（`LoadFromFile` / `SaveToFile` / `MarshalToFile` / `UnmarshalFromFile`）は操作前にパスに対して多層のセキュリティ検証を実行します。これは `Config.ValidateFilePath`（デフォルト `true`）で制御されます。検証は以下の攻撃ベクトルをカバーします：

| 防護項目 | 説明 |
|--------|------|
| パストラバーサル | `..`、`..\` およびその URL エンコードバリアント（`%2e%2e`、多層エンコード）、Unicode 同字形文字（全角ドット / スラッシュ）を検出 |
| ヌルバイト注入 | パス中の `\x00` を拒否 |
| シンボリックリンクエスケープ | symlink の実際のパスを解決し、制限領域への指向を防止 |
| システムディレクトリ（Unix） | `/dev/`、`/proc/`、`/etc/passwd`、`/root/` などの機密パスへのアクセスを阻止 |
| Windows 予約名 | `CON`、`PRN`、`COM1-9`、`LPT1-9`、UNC パス、代替データストリーム（ADS）を拒否 |
| ファイルサイズ | 読み取り前に既存ファイルが `MaxJSONSize` を超えていないか確認、読み取り時は `io.LimitReader` で TOCTOU を防止 |

```go
// パストラバーサル攻撃は拒否され、security error を返す
_, err := json.LoadFromFile("../../etc/passwd")
// err は非 nil：path traversal pattern detected

// 正常なパスは影響を受けない
data, err := json.LoadFromFile("config/app.json")
```

::: warning 注意
ファイルパス検証はファイル操作に対して常に有効です（`LoadFromReader` / `SaveToWriter` はパスを扱わないため検証対象外）。ユーザー提供のファイル名を扱う場合、これらの検証は多層防御の一環ですが、それでもアプリケーション層でホワイトリスト制約を行うべきです。
:::

## ファイル反復関数

json パッケージは `ForeachFile` シリーズ関数を提供し、手動での読み取り + 解析なしにファイルから直接 JSON 配列 / オブジェクトを反復できます：

| 関数 | 用途 |
|------|------|
| `ForeachFile(path, fn, cfg...)` | ファイルのルートレベル配列 / オブジェクトを反復 |
| `ForeachFileWithPath(path, pathExpr, fn, cfg...)` | ファイル内の指定パスの下のコレクションを反復 |
| `ForeachFileChunked(path, chunkSize, fn, cfg...)` | 大配列をバッチ（chunk）単位で反復 |
| `ForeachFileNested(path, fn, cfg...)` | すべてのネスト構造を再帰的に反復 |

```go
err := json.ForeachFile("users.json", func(key any, item *json.IterableValue) error {
    fmt.Println(item.GetString("name"))
    return nil
})
```

これらの関数は `LoadFromFile` + `Foreach` の便利な組み合わせで、大規模コレクションの処理に適しています。ストリーム処理とメモリ最適化の詳細は[ストリーム処理](../../streaming/large-files)を参照。

## メソッド選択

| シナリオ | 推奨関数 |
|------|----------|
| ファイルを読んで元の文字列を得る | `LoadFromFile` |
| ファイルを読んで構造体にデシリアライズ | `UnmarshalFromFile` |
| Reader / HTTP Body から読み取り | `LoadFromReader` |
| Go 値をファイルに保存（コンパクト） | `SaveToFile` / `MarshalToFile` |
| 整形して保存 | `SaveToFile(path, data, json.PrettyConfig())` |
| Writer / Buffer に書き込み | `SaveToWriter` |
| ファイル内のコレクションを反復 | `ForeachFile` シリーズ |

## 関連

- [JSONL 処理関数](./jsonl) - ParseJSONL、StreamLinesInto などの改行区切り JSON 処理
- [エンコード出力関数](./output) - Marshal、Unmarshal などのシリアライズ操作
- [ストリーム処理](../../streaming/large-files) - ストリームプロセッサと大ファイル反復の詳細
- [Processor ファイル操作](../processor/file-io) - 対応する Processor インスタンスメソッド
