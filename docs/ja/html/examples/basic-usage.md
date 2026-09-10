---
sidebar_label: "基本サンプル"
title: "基本サンプル - CyberGo html | 典型シナリオ別コード逆引き"
description: "CyberGo html 基本サンプル：本文とプレーンテキスト抽出、ファイル読み込み、Markdown・JSON 変換、リンクグループ化、メディア情報、バッチ並行処理とタイムアウト制御の 6 シナリオごとに完全コンパイル可能な最小サンプルと詳解ページへのリンクを提供し、初心者がコピーしてすぐ始められます。"
sidebar_position: 1
---

# 基本サンプル

本ページは**シナリオ別にコードを引き出せる**逆引きインデックスです。各シナリオでは最小限の実行可能なスケルトンのみを示しますので、そのままコピーして使い始められます。原理の解説や詳細な設定は、各セクション末尾の「詳しくは」リンクから対応するガイドを参照してください。

| シナリオ | 主要な呼び出し | 詳解ページ |
|------|----------|--------|
| 本文とプレーンテキスト | `html.Extract` / `html.ExtractText` | [コンテンツ抽出実践](../guides/core-features/content-extraction) |
| ファイルから抽出 | `html.ExtractFromFile` | [コンテンツ抽出実践](../guides/core-features/content-extraction) |
| Markdown / JSON 出力 | `html.ExtractToMarkdown` / `html.ExtractToJSON` | [出力フォーマット実践](../guides/core-features/output-formats) |
| リンク抽出 | `html.ExtractAllLinks` + `html.GroupLinksByType` | [リンク抽出実践](../guides/core-features/link-extraction) |
| メディア情報 | `html.Extract`（`Videos` / `Audios`） | [メディア抽出実践](../guides/core-features/media-extraction) |
| バッチとタイムアウト・再利用 | `html.New` + `ExtractBatchWithContext` | [バッチ処理実践](../guides/performance/batch-processing) |

## 本文とプレーンテキスト

`Extract` は完全な `Result` を一度に返します。プレーンテキストだけでよい場合は近縁関数の `ExtractText` を使うと、`string` が直接返ります：

```go
package main

import (
	"fmt"
	"log"

	"github.com/cybergodev/html"
)

func main() {
	data := []byte(`<html><head><title>Go 言語チュートリアル</title></head><body><article><h1>Go 入門ガイド</h1><p>Go は静的型付けのコンパイル言語です。</p><a href="https://go.dev">Go 公式サイト</a></article></body></html>`)

	result, err := html.Extract(data) // バイトを渡すと完全な Result が返る
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(result.Title) // 出力：Go 言語チュートリアル
	fmt.Println(result.Text)
	// 出力：Go 入門ガイド\n\nGo は静的型付けのコンパイル言語です。\n\nGo 公式サイト

	text, err := html.ExtractText(data) // プレーンテキストのみ：string を直接返す
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(len(text) > 0) // 出力：true（空でない）
}
```

詳しくは：[コンテンツ抽出実践](../guides/core-features/content-extraction)

## ファイルから抽出

ディスク上のファイルの処理には `ExtractFromFile` を使います。パストラバーサル対策とファイルサイズ制限が組み込まれています：

```go
package main

import (
	"fmt"
	"log"

	"github.com/cybergodev/html"
)

func main() {
	result, err := html.ExtractFromFile("article.html")
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(result.Title) // 出力：article.html の <title> の内容
}
```

詳しくは：[コンテンツ抽出実践](../guides/core-features/content-extraction)

## Markdown / JSON 出力

コンテンツの移行には Markdown を、プログラム間の受け渡しには JSON を使います：

```go
package main

import (
	"fmt"
	"log"

	"github.com/cybergodev/html"
)

func main() {
	data := []byte(`<article><h1>Go 入門ガイド</h1><p>Go はコンパイル言語です。</p><img src="gopher.png" alt="Gopher" /><a href="https://go.dev">Go 公式サイト</a></article>`)
	// Markdown へ変換：画像とリンクは自動的に ![]() と []() 構文になる
	md, err := html.ExtractToMarkdown(data)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(md)
	// 出力：Go 入門ガイド\n\nGo はコンパイル言語です。\n\n![Gopher](gopher.png)\n[Go 公式サイト](https://go.dev)
	jsonBytes, err := html.ExtractToJSON(data) // JSON へ変換：すべてのメタデータフィールドを保持
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println("JSON バイト数：", len(jsonBytes))
	// JSON のバイト数は内容により変動（text/title/images/links などのフィールドを含む）
}
```

詳しくは：[出力フォーマット実践](../guides/core-features/output-formats)

## リンク抽出

本文とは独立したリンク抽出 API で、タイプ別にグループ化もできます：

```go
package main

import (
	"fmt"
	"log"

	"github.com/cybergodev/html"
)

func main() {
	data := []byte(`<html><body><article><h1>リンクのサンプル</h1><p><a href="https://go.dev">Go 公式サイト</a></p></article></body></html>`)

	links, err := html.ExtractAllLinks(data) // a/img/video/css/js などのリソースを網羅
	if err != nil {
		log.Fatal(err)
	}
	for _, link := range links {
		fmt.Printf("[%s] %s - %s\n", link.Type, link.Title, link.URL)
	}
	// 出力：[link] Go 公式サイト - https://go.dev
	groups := html.GroupLinksByType(links) // タイプ別にグループ化
	fmt.Println("link グループ：", len(groups["link"]))
	// 出力：link グループ： 1
}
```

詳しくは：[リンク抽出実践](../guides/core-features/link-extraction)

## メディア情報

動画と音声の情報は `Extract` の結果に同時に返されるため、個別に呼び出す必要はありません：

```go
package main

import (
	"fmt"
	"log"

	"github.com/cybergodev/html"
)

func main() {
	data := []byte(`<html><body><article><h1>マルチメディアページ</h1>
<video poster="cover.jpg"><source src="https://example.com/video.mp4" type="video/mp4"></video>
<audio><source src="https://example.com/audio.mp3" type="audio/mpeg"></audio>
</article></body></html>`)
	result, err := html.Extract(data)
	if err != nil {
		log.Fatal(err)
	}
	for _, v := range result.Videos {
		fmt.Printf("動画：%s（%s）\n", v.URL, v.Type)
	}
	for _, a := range result.Audios {
		fmt.Printf("音声：%s（%s）\n", a.URL, a.Type)
	}
	// 出力：
	// 動画：https://example.com/video.mp4（video/mp4）
	// 音声：https://example.com/audio.mp3（audio/mpeg）
}
```

詳しくは：[メディア抽出実践](../guides/core-features/media-extraction)

## バッチ、タイムアウトと Processor の再利用

サーバー側の典型的なパターンです：グローバルに再利用できる `Processor` を作成し、並行バッチ抽出を行い、context で 1 バッチ分の時間を制御します：

```go
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/cybergodev/html"
)

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	p, err := html.New(html.DefaultConfig()) // 並行安全で、グローバルに再利用可能
	if err != nil {
		log.Fatal(err)
	}
	defer p.Close()
	pages := [][]byte{
		[]byte(`<html><body><article><h1>ページ 1</h1></article></body></html>`),
		[]byte(`<html><body><article><h1>ページ 2</h1></article></body></html>`),
	}
	batch := p.ExtractBatchWithContext(ctx, pages) // context の期限までに完了しなかった項目は Cancelled に計上
	fmt.Printf("成功：%d、失敗：%d\n", batch.Success, batch.Failed)
	// 出力：成功：2、失敗：0
}
```

詳しくは：[バッチ処理実践](../guides/performance/batch-processing) と [Processor の再利用とキャッシュ](../guides/performance/processor-cache)
