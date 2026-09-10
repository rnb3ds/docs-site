---
sidebar_label: "ファイル操作"
title: "ファイル操作関数 - CyberGo JSON | API リファレンス"
description: "CyberGo JSON ファイル操作関数：LoadFromFile/SaveToFile の読み書き、LoadFromReader/SaveToWriter のストリーミング I/O、MarshalToFile/UnmarshalFromFile のシリアライズを提供します。"
sidebar_position: 9
---

# ファイル操作関数

json パッケージが提供するファイル操作関数。ファイル読み書き、ストリーミング I/O、型付きシリアライズをサポートします。すべてのファイルパスは読み書き前にセキュリティ検証を通ります（[ファイルパス検証](#セキュリティ-ファイルパス検証)を参照）。

## ファイル読み書き

### LoadFromFile

シグネチャ：`func LoadFromFile(filePath string, cfg ...Config) (string, error)`

ファイルから JSON データをロードし、**生の文字列**を返します（再エンコードせず、ファイル中のバイト順序と空白を保持）。ファイルサイズは `Config.MaxJSONSize` の制限を受けます。

**パラメータ**

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `filePath` | `string` | はい | ファイルパス（セキュリティ検証を通過する必要あり） |
| `cfg` | `Config` | いいえ | オプション設定（`MaxJSONSize` を厳しくするなど） |

```go
data, err := json.LoadFromFile("config.json")
if err != nil {
    panic(err)
}
fmt.Println(data) // 生の JSON 文字列
```

### SaveToFile

シグネチャ：`func SaveToFile(filePath string, data any, cfg ...Config) error`

データを JSON ファイルとして保存します。存在しない親ディレクトリを自動作成し、**アトミック書き込み**を採用します（一時ファイルに書き込んでから rename するため、クラッシュしても既存ファイルが切断されません）。文字列 / `[]byte` 入力は二重エスケープを避けるため事前に解析されます。

**パラメータ**

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `filePath` | `string` | はい | ファイルパス（セキュリティ検証を通過する必要あり） |
| `data` | `any` | はい | 保存するデータ（Go 値または JSON 文字列） |
| `cfg` | `Config` | いいえ | オプション設定（`PrettyConfig()` による整形出力など） |

```go
// コンパクト保存（デフォルト）
err := json.SaveToFile("output.json", map[string]any{
    "name": "Alice",
    "age":  30,
})

// 整形保存
err = json.SaveToFile("output.json", data, json.PrettyConfig())
```

**完全なサンプル：SaveToFile + LoadFromFile のラウンドトリップ**

```go
package main

import (
	"fmt"
	"os"

	"github.com/cybergodev/json"
)

func main() {
	// 一時ファイルを作成し、サンプルが単独で動くようにする
	tmp, err := os.CreateTemp("", "cybergo-*.json")
	if err != nil {
		panic(err)
	}
	path := tmp.Name()
	tmp.Close()
	defer os.Remove(path)

	// 書き込み：map はキー名順にソートしてエンコード
	err = json.SaveToFile(path, map[string]any{"name": "Alice", "age": 30})
	if err != nil {
		panic(err)
	}

	// 読み戻し：ファイルの生の内容を返す
	data, err := json.LoadFromFile(path)
	if err != nil {
		panic(err)
	}
	fmt.Println(data)
	// 出力: {"age":30,"name":"Alice"}
}
```

## ストリーミング I/O

### LoadFromReader

シグネチャ：`func LoadFromReader(reader io.Reader, cfg ...Config) (string, error)`

`io.Reader` から JSON データをロードして生の文字列を返します。読み取りバイト数は `Config.MaxJSONSize` の制限を受け（メモリ枯渇を防止）、ネットワーク接続、HTTP レスポンスボディ、パイプなどのストリーミングデータソースに適しています。

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

**完全なサンプル：strings.Reader と os.File からの読み取り**

```go
package main

import (
	"fmt"
	"strings"

	"github.com/cybergodev/json"
)

func main() {
	// strings.Reader から読み取り（生の内容をそのまま返す）
	reader := strings.NewReader(`{"name":"Alice","age":30}`)
	data, err := json.LoadFromReader(reader)
	if err != nil {
		panic(err)
	}
	fmt.Println(data)
	// 出力: {"name":"Alice","age":30}
}
```

`os.File` からの読み取りも使い方は同じです——`os.File` は `io.Reader` を実装しています：

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

データを JSON にエンコードして `io.Writer` に書き込みます。`SaveToFile` と同様に文字列 / `[]byte` 入力の事前解析で二重エスケープを防ぎますが、**ファイルパス検証は行いません**（出力先は呼び出し側が制御します）。

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

**完全なサンプル：bytes.Buffer への書き込み**

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
	// 出力:
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

データを JSON にシリアライズしてファイルに書き込みます。**現バージョンでは `SaveToFile` と同じ「エンコード + アトミック書き込み」パイプラインを共用します**：同じく親ディレクトリの自動作成、アトミック書き込み（一時ファイル + rename）、文字列 / `[]byte` 入力の事前解析による二重エスケープ防止を行い、渡された `cfg` は**すべて有効**になります（インデント、エスケープ、数値処理など——過去のバージョンは `Pretty` フラグしか読まず、残りのエンコードオプションは黙って破棄されていました）。両者の動作は等価なので、セマンティクスで選んでください：Go 値の書き込みには `MarshalToFile`、「JSON ドキュメントの保存」を強調するなら `SaveToFile` です。

**パラメータ**

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `filePath` | `string` | はい | ファイルパス |
| `data` | `any` | はい | シリアライズするデータ |
| `cfg` | `Config` | いいえ | オプション設定（`PrettyConfig()` でインデント出力） |

```go
err := json.MarshalToFile("data.json", myStruct)
err = json.MarshalToFile("data.json", myStruct, json.PrettyConfig())
```

### UnmarshalFromFile

シグネチャ：`func UnmarshalFromFile(filePath string, v any, cfg ...Config) error`

ファイルから JSON を読み取ってターゲット変数にデシリアライズします。「ファイル読み取り + `Unmarshal`」の便利な組み合わせで、読み取りは `MaxJSONSize` の制限を受けます。

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

**完全なサンプル：MarshalToFile + UnmarshalFromFile 構造体ラウンドトリップ**

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

	// ファイルから読み取ってデシリアライズ
	var user User
	err = json.UnmarshalFromFile(path, &user)
	if err != nil {
		panic(err)
	}
	fmt.Printf("%s, %d\n", user.Name, user.Age)
	// 出力: Alice, 30
}
```

## セキュリティ：ファイルパス検証

すべてのファイル読み書き関数（`LoadFromFile` / `SaveToFile` / `MarshalToFile` / `UnmarshalFromFile`）は操作前にパスへ多層的なセキュリティ検証を実行します。これは `Config.ValidateFilePath`（デフォルト `true`）で制御されます。検証がカバーする攻撃ベクトル：

| 防護項目 | 説明 |
|--------|------|
| パストラバーサル | `..`、`..\` およびその URL エンコード変種（`%2e%2e`、多層エンコード）、Unicode 同形文字（全角ドット / スラッシュ）を検出 |
| ヌルバイト注入 | パス中の `\x00` を拒否 |
| シンボリックリンクエスケープ | symlink の実パスを解決し、制限領域への指向を防止 |
| システムディレクトリ（Unix） | `/dev/`、`/proc/`、`/etc/passwd`、`/root/` などの機密パスへのアクセスを阻止 |
| Windows 予約名 | `CON`、`PRN`、`COM1-9`、`LPT1-9`、UNC パス、代替データストリーム（ADS）を拒否 |
| ファイルサイズ | 読み取り前に既存ファイルが `MaxJSONSize` を超えていないかチェックし、読み取り時は `io.LimitReader` で TOCTOU を防止 |

```go
// パストラバーサル攻撃は拒否され、security error を返す
_, err := json.LoadFromFile("../../etc/passwd")
// err は非 nil: path traversal pattern detected

// 正常なパスは影響を受けない
data, err := json.LoadFromFile("config/app.json")
```

::: warning 注意
ファイルパス検証はファイル系操作に常に有効です（`LoadFromReader` / `SaveToWriter` はパスを扱わないため検証対象外）。ユーザーが提供するファイル名を扱う際、これらの検証は多層防御の一環ですが、アプリケーション層でもホワイトリストによる制約を行うべきです。
:::

## ファイル反復関数

json パッケージは `ForeachFile` 系関数を提供し、手動の読み取り + 解析なしでファイルから直接 JSON 配列 / オブジェクトを反復します：

| 関数 | 用途 |
|------|------|
| `ForeachFile(path, fn, cfg...)` | ファイルのルートレベル配列 / オブジェクトを反復 |
| `ForeachFileWithPath(path, pathExpr, fn, cfg...)` | ファイル内の指定パス配下のコレクションを反復 |
| `ForeachFileChunked(path, chunkSize, fn, cfg...)` | 大型配列をバッチ（chunk）単位で反復 |
| `ForeachFileNested(path, fn, cfg...)` | すべてのネスト構造を再帰的に反復 |

```go
err := json.ForeachFile("users.json", func(key any, item *json.IterableValue) error {
    fmt.Println(item.GetString("name"))
    return nil
})
```

これらの関数は `LoadFromFile` + `Foreach` の便利な組み合わせで、大規模コレクションの処理に適しています。ストリーミング処理とメモリ最適化の詳細は[ストリーミング処理](../../streaming/large-files)を参照してください。

## メソッド選択

| シナリオ | 推奨関数 |
|------|----------|
| ファイルを読んで生の文字列を得る | `LoadFromFile` |
| ファイルを読んで構造体にデシリアライズ | `UnmarshalFromFile` |
| Reader / HTTP Body から読み取り | `LoadFromReader` |
| Go 値をファイルに保存（コンパクト） | `SaveToFile` / `MarshalToFile` |
| 保存して整形 | `SaveToFile(path, data, json.PrettyConfig())` |
| Writer / Buffer に書き込み | `SaveToWriter` |
| ファイル内のコレクションを反復 | `ForeachFile` 系 |

## 関連

- [JSONL 処理関数](./jsonl) - ParseJSONL, StreamLinesInto などの改行区切り JSON 処理
- [エンコード出力関数](./output) - Marshal, Unmarshal などのシリアライズ操作
- [ストリーミング処理](../../streaming/large-files) - ストリーミングプロセッサと大規模ファイル反復の詳解
- [Processor ファイル操作](../processor/file-io) - 対応する Processor インスタンスメソッド
