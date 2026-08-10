---
sidebar_label: "出力形式"
title: "出力フォーマット - CyberGo html | Markdown と JSON 出力"
description: "CyberGo html 出力フォーマット API リファレンス：ExtractToMarkdown、ExtractToJSON のパッケージ関数と Processor メソッドで、HTML バイトやファイル入力を Markdown や JSON フォーマットに変換して出力します。"
sidebar_position: 1
---

# 出力フォーマット

HTML ライブラリは抽出結果を Markdown または JSON フォーマットで出力できます。

## Markdown 出力

HTML コンテンツを抽出して Markdown フォーマットに変換します。内部で `InlineImageFormat` と `InlineLinkFormat` をともに `markdown` に設定してから抽出し、最終的に `Result.Text` を返します。

:::warning キャッシュ動作の違い
`ExtractToMarkdown` は主 Processor のキャッシュにヒットせず、書き込みもしません。`buildFormatProcessor` で**一時 Processor** を構築します：

- 現在の設定を**値コピー**（`config` は `New()` 後に不変なため、コピーにロックは不要）してから 2 つのフォーマットフィールドを上書きします——フォーマット設定が共有設定に書き戻されることはありません
- **キャッシュを無効化**（`MaxCacheEntries = 0`）：主 Processor のキャッシュの読み書きを一切行わず、フォーマット固有の結果で主キャッシュが汚染されるのを防ぎます
- 主 Processor の Scorer（スコアラー）は再利用しますが、**独立した無効化された監査コレクタ**を使用し、主 Processor の `Close()` が進行中の抽出と競合しないようにします
- この仕組みはスレッドセーフです

抽出をキャッシュ経由にしたい場合は、代わりに通常の `Extract` を使い、`InlineImageFormat`/`InlineLinkFormat` を自分で設定してください。
:::

### パッケージ関数

```go
func ExtractToMarkdown(htmlBytes []byte, cfg ...Config) (string, error)
func ExtractToMarkdownFromFile(filePath string, cfg ...Config) (string, error)
func ExtractToMarkdownWithContext(ctx context.Context, htmlBytes []byte, cfg ...Config) (string, error)
func ExtractToMarkdownFromFileWithContext(ctx context.Context, filePath string, cfg ...Config) (string, error)
```

### Processor メソッド

```go
func (p *Processor) ExtractToMarkdown(htmlBytes []byte) (string, error)
func (p *Processor) ExtractToMarkdownFromFile(filePath string) (string, error)
func (p *Processor) ExtractToMarkdownWithContext(ctx context.Context, htmlBytes []byte) (string, error)
func (p *Processor) ExtractToMarkdownFromFileWithContext(ctx context.Context, filePath string) (string, error)
```

### 例

```go
package main

import (
	"fmt"
	"log"

	"github.com/cybergodev/html"
)

func main() {
	data := []byte(`<html><head><title>サンプル文書</title></head><body>
<p>本文の段落で、画像を 1 枚含みます。</p>
<p><img src="/img/photo.png" alt="サンプル画像"></p>
<p>詳しくは <a href="https://example.com">サンプルサイト</a> をご覧ください。</p>
</body></html>`)

	md, err := html.ExtractToMarkdown(data, html.MarkdownConfig())
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(md)
	// 出力：画像とリンクを含む Markdown テキスト、
	//       例えば ![サンプル画像](/img/photo.png) と [サンプルサイト](https://example.com)
}
```

### フォーマットオプション

`ExtractToMarkdown` は `markdown` フォーマットに固定です。他のインラインフォーマットが必要な場合は、通常の `Extract` を下記の `Config` フィールドと組み合わせて使います：

| フィールド | 値 | 効果 |
|------|--------|------|
| `InlineImageFormat` | `none`（デフォルト） | 画像をテキストにインラインしない |
| | `markdown` | `![alt](url)` を出力 |
| | `html` | `<img src="url" alt="alt">` を出力 |
| | `placeholder` | プレースホルダ `[IMAGE:N]` を出力 |
| `InlineLinkFormat` | `none`（デフォルト） | リンクをテキストにインラインしない |
| | `markdown` | `[text](url)` を出力 |
| | `html` | `<a href="url">text</a>` を出力 |

### Markdown のフォーマット仕組み

インライン画像とリンクは**プレースホルダ置換**で実装され、2 段階で行われます：

1. **テキスト抽出段階**：各 `<img>` はテキストストリームにプレースホルダ `[IMAGE:N]` を挿入し、各 `<a>` は対になった `[LINK:N]...[/LINK]` を挿入します（`N` は位置の序数で、`Images`/`Links` スライスの `Position` と 1 対 1 で対応）
2. **フォーマット段階**：`InlineImageFormat`/`InlineLinkFormat` に従い、プレースホルダを目的のフォーマット（markdown/html）に置換するか、そのまま削除（none）します

元テキスト中のリテラルの `[`/`]` がプレースホルダと誤認されないよう、抽出段階でエスケープ（`\[`、`\]`、`\\`）し、フォーマット段階で元に戻します。

## JSON 出力

抽出結果を JSON バイトにシリアライズします。Markdown とは異なり、このメソッドは主 Processor の通常 `Extract` を経由し（キャッシュ有効時はヒット/書き込み）、その後 `json.Marshal` でシリアライズします。

### パッケージ関数

```go
func ExtractToJSON(htmlBytes []byte, cfg ...Config) ([]byte, error)
func ExtractToJSONFromFile(filePath string, cfg ...Config) ([]byte, error)
func ExtractToJSONWithContext(ctx context.Context, htmlBytes []byte, cfg ...Config) ([]byte, error)
func ExtractToJSONFromFileWithContext(ctx context.Context, filePath string, cfg ...Config) ([]byte, error)
```

### Processor メソッド

```go
func (p *Processor) ExtractToJSON(htmlBytes []byte) ([]byte, error)
func (p *Processor) ExtractToJSONFromFile(filePath string) ([]byte, error)
func (p *Processor) ExtractToJSONWithContext(ctx context.Context, htmlBytes []byte) ([]byte, error)
func (p *Processor) ExtractToJSONFromFileWithContext(ctx context.Context, filePath string) ([]byte, error)
```

### 例

```go
package main

import (
	"fmt"
	"log"

	"github.com/cybergodev/html"
)

func main() {
	data := []byte(`<html><head><title>サンプル文書</title></head><body>
<p>これは本文です。</p>
<p><img src="/img/photo.png" alt="サンプル画像"></p>
<a href="https://example.com">サンプルサイト</a>
</body></html>`)

	jsonBytes, err := html.ExtractToJSON(data)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(string(jsonBytes))
	// 出力：text/title/images/links などのフィールドを含む JSON 文字列
}
```

### JSON 出力構造

JSON シリアライズは `Result.MarshalJSON()` のカスタム実装で、内部構造 `jsonResult` に対応します：

| JSON フィールド | 型 | 由来 |
|-----------|------|------|
| `text` | string | `Result.Text`（抽出された本文） |
| `title` | string | `Result.Title`（文書タイトル） |
| `images` | array | `Result.Images`（`omitempty`、空時は省略） |
| `links` | array | `Result.Links`（`omitempty`） |
| `videos` | array | `Result.Videos`（`omitempty`） |
| `audios` | array | `Result.Audios`（`omitempty`） |
| `processing_time_ms` | int | `Result.ProcessingTime` を**ミリ秒数**に変換 |
| `word_count` | int | `Result.WordCount` |
| `reading_time_ms` | int | `Result.ReadingTime` を**ミリ秒数**に変換 |

`ProcessingTime` と `ReadingTime` は `Result` 構造体上で `json:"-"` タグを持ち（標準シリアライズではスキップされます）、カスタム `MarshalJSON` ではじめてミリ秒数として出力に含まれます。JSON フォーマットは外部消費用で、`UnmarshalJSON` は**未実装**のため、そのままでは `Result` にデシリアライズできません。

:::tip Result.MarshalJSON
`Result` は `json.Marshaler` インターフェースを実装しています。`ProcessingTime` と `ReadingTime` フィールドには `json:"-"` タグがあり（標準シリアライズではスキップされます）、カスタム `MarshalJSON()` によりミリ秒数として出力に含まれます。
:::
