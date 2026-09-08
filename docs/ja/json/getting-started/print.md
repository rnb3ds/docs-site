---
sidebar_label: "フォーマット出力"
title: "フォーマット出力 - CyberGo JSON | JSON の印刷と整形ガイド"
description: "CyberGo JSON フォーマット出力ガイド：Prettify、EncodePretty、MarshalIndent、Compact/CompactString、Indent、HTMLEscape の選定比較とサンプル。カスタムインデント、既存テキストの圧縮、ストリーミング出力と Print 系の移行説明。"
sidebar_position: 2.5
---

# Print 系関数

::: info 移行リファレンス
本ページは Print 系関数（早期のバージョンで削除済み）の移行ガイドです。JSON を整形したい場合は、[`Prettify`](../api-reference/index#フォーマット) または標準ライブラリ互換の `MarshalIndent` を使用してください。
:::

::: warning API 変更の説明
Print、PrintPretty、PrintE、PrintPrettyE はライブラリから削除され、提供されなくなりました。以下の代替案を使用してください。
:::

## 代替案

### コンパクト JSON の印刷

`fmt.Println` + `EncodeWithConfig`（推奨）または `Marshal` を使用：

```go
data := map[string]any{"name": "Alice", "age": 30}

s, err := json.EncodeWithConfig(data)
if err != nil {
    log.Fatal(err)
}
fmt.Println(s)
// 出力: {"age":30,"name":"Alice"}

// または Marshal を使用（[]byte 出力）
b, err := json.Marshal(data)
if err != nil {
    log.Fatal(err)
}
fmt.Println(string(b))
```

::: warning Encode は非推奨
`json.Encode` は非推奨としてマークされています（`EncodeWithConfig` と機能等価）。将来のメジャーバージョンで削除されます。新規コードでは `EncodeWithConfig` または `Marshal` を使用してください。
:::

### 整形 JSON の印刷

`fmt.Println` + `EncodePretty` を使用：

```go
s, err := json.EncodePretty(data)
if err != nil {
    log.Fatal(err)
}
fmt.Println(s)
// 出力:
// {
//   "age": 30,
//   "name": "Alice"
// }
```

### JSON 文字列の印刷（既存 JSON の整形）

`Prettify` を使用：

```go
pretty, err := json.Prettify(`{"name":"Alice","age":30}`)
if err != nil {
    log.Fatal(err)
}
fmt.Println(pretty)
// 出力:
// {
//   "name": "Alice",
//   "age": 30
// }
```

### Processor で印刷

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

// エンコードして印刷（EncodeWithConfig を推奨。Encode は非推奨）
s, err := p.EncodeWithConfig(data)
if err != nil {
    log.Fatal(err)
}
fmt.Println(s)

// 整形印刷
pretty, err := p.EncodePretty(data)
if err != nil {
    log.Fatal(err)
}
fmt.Println(pretty)
```

## フォーマットツール対照

「入力が Go 値か JSON テキストか」でツールを選びます：

| 関数 | 入力 | 出力 | 典型的な用途 |
|------|------|------|----------|
| `Marshal(v, cfg...)` | Go 値 | `[]byte` コンパクト | 標準ライブラリシグネチャ、最も汎用 |
| `EncodeWithConfig(v, cfg...)` | Go 値 | `string` コンパクト | 推奨入口（設定付き可能） |
| `EncodePretty(v, cfg...)` | Go 値 | `string` インデント付き | そのままエンコードして整形 |
| `MarshalIndent(v, prefix, indent)` | Go 値 | `[]byte` インデント付き | 標準ライブラリシグネチャ、旧コード互換 |
| `Prettify(jsonStr, cfg...)` | JSON テキスト | `string` インデント付き | 既存 JSON テキストの整形 |
| `Compact(dst, src)` | JSON テキスト | `*bytes.Buffer` に書き込み | 既存テキストの圧縮 |
| `CompactString(jsonStr)` | JSON テキスト | `string` コンパクト | 既存テキストの圧縮（buffer 不要） |
| `Indent(dst, src, prefix, indent)` | JSON テキスト | `*bytes.Buffer` に書き込み | インデント再構成 |
| `HTMLEscape(dst, src)` | JSON テキスト | `*bytes.Buffer` に書き込み | `<` `>` `&` のエスケープ |
| `NewEncoder(w)` + `SetIndent` | Go 値 | `io.Writer` に書き込み | ストリーミング出力（ファイル/ネットワーク） |

::: tip 3 ステップの選定
1. 入力が **Go 値**：`[]byte` が必要なら `Marshal`、`string` なら `EncodeWithConfig`。インデントが必要な場合はそれぞれ `MarshalIndent`、`EncodePretty` に切り替え
2. 入力が既に **JSON テキスト**：整形は `Prettify`、圧縮は `CompactString`。標準ライブラリシグネチャとの完全一致が必要な場合は buffer 版の `Compact`/`Indent`
3. **ストリーム**への出力（ファイル/ネットワーク）：`NewEncoder` + `SetIndent` で 1 件ずつ書き出し、大きな文字列を一括組み立てしない
:::

## カスタムインデント

`EncodePretty` のデフォルトは 2 スペースインデントです。別のインデントが必要な場合は `Config.Pretty` + `Config.Indent` を使うか、標準ライブラリシグネチャの `MarshalIndent` を直接使います：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := map[string]any{"name": "Alice", "age": 30}

	// 方法 1：標準ライブラリシグネチャの MarshalIndent（prefix は通常空）
	b, err := json.MarshalIndent(data, "", "    ")
	if err != nil {
		panic(err)
	}
	fmt.Println(string(b))
	// 出力:
	// {
	//     "age": 30,
	//     "name": "Alice"
	// }

	// 方法 2：EncodePretty + 設定（タブインデント）
	cfg := json.DefaultConfig()
	cfg.Pretty = true
	cfg.Indent = "\t"
	s, err := json.EncodePretty(data, cfg)
	if err != nil {
		panic(err)
	}
	fmt.Println(s)
}
```

::: tip
`json.PrettyConfig()` は便利なプリセットです：デフォルト設定 + `Pretty: true` + 2 スペースインデントで、`EncodePretty` のデフォルト動作と等価です。
:::

## 既存の JSON テキストの処理

手元が既に JSON テキスト（ログ、API レスポンスなど）の場合、フォーマット関数で直接変換できます。構造体に一度変換する必要はありません：

```go
package main

import (
	"bytes"
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	pretty := "{\n  \"name\": \"Alice\",\n  \"age\": 30\n}"

	// 圧縮：不要な空白をすべて除去
	var compact bytes.Buffer
	if err := json.Compact(&compact, []byte(pretty)); err != nil {
		panic(err)
	}
	fmt.Println(compact.String())
	// 出力: {"name":"Alice","age":30}

	// buffer 不要版：CompactString は直接文字列を返す
	s, err := json.CompactString(pretty)
	if err != nil {
		panic(err)
	}
	fmt.Println(s)

	// 再構成：別のインデントスタイルに変更
	var reindented bytes.Buffer
	if err := json.Indent(&reindented, []byte(pretty), "", "\t"); err != nil {
		panic(err)
	}
	fmt.Println(reindented.String())
	// 出力:
	// {
	// 	"name": "Alice",
	// 	"age": 30
	// }
}
```

## HTML 安全エスケープ

`HTMLEscape` は標準ライブラリとシグネチャが一致します：JSON テキスト内の `<`、`>`、`&`、U+2028、U+2029 を `\u00XX` 形式にエスケープし、JSON に HTML が埋め込まれたときにブラウザが誤解析するのを防ぎます。これは**文字レベルのエスケープ**であり、再エンコードも空白変更も行いません：

```go
package main

import (
	"bytes"
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	src := []byte(`{"html":"<b>bold</b>","url":"a&b"}`)

	var buf bytes.Buffer
	json.HTMLEscape(&buf, src)
	out := buf.String()
	fmt.Println(out)
	// 出力の引用符内に裸の <、>、& はなくなり、
	// それぞれ \u00XX 形式のエスケープシーケンスに置き換えられ、残りの内容はそのまま保持される
}
```

::: tip いつ手動エスケープが必要？
`Marshal`/`EncodeWithConfig` はデフォルトで HTML エスケープが有効（`Config.EscapeHTML: true`）で、エンコード結果自体は安全です。`HTMLEscape` は主に**外部から取得した JSON テキスト**の処理に使います——例えばサードパーティ返却の JSON をそのまま HTML ページに埋め込むときは、先に通してから出力してください。
:::

## Writer へのストリーミング出力

ファイルやネットワークストリームに書く場合は、`NewEncoder`（標準ライブラリシグネチャ）で大きな文字列の組み立てを避けます：

```go
package main

import (
	"os"

	"github.com/cybergodev/json"
)

func main() {
	type Item struct {
		ID   int    `json:"id"`
		Name string `json:"name"`
	}

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")

	for _, item := range []Item{{1, "Alice"}, {2, "Bob"}} {
		if err := enc.Encode(item); err != nil {
			panic(err)
		}
	}
	// 出力:
	// {
	//   "id": 1,
	//   "name": "Alice"
	// }
	// {
	//   "id": 2,
	//   "name": "Bob"
	// }
}
```

`Encoder.Encode` は標準ライブラリと同様に、各レコードの後に自動で改行します——ログの逐次出力や JSONL ファイルへの書き込みに自然に適します。

## 完全なサンプル

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"log"
)

func main() {
	data := map[string]any{
		"users": []any{
			map[string]any{"id": 1, "name": "Alice"},
			map[string]any{"id": 2, "name": "Bob"},
		},
		"total": 2,
	}

	// コンパクト出力（Encode は非推奨、EncodeWithConfig を推奨）
	compact, err := json.EncodeWithConfig(data)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(compact)

	// 整形出力
	pretty, err := json.EncodePretty(data)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(pretty)
}
```

## 関連

- [エンコード出力関数](../api-reference/functions/output) - Encode、EncodePretty、Prettify
- [パッケージ関数](../api-reference/functions/) - パッケージレベル関数の総覧
