---
sidebar_label: "基本サンプル"
title: "基本サンプル - CyberGo html | 実行可能サンプル集"
description: "CyberGo html 基本サンプル集：バイトからのコンテンツ抽出、ファイル抽出、テキストのみ抽出、Markdown 出力、リンクグループ化、Processor 再利用、並行バッチ処理など、すぐ実行できる Go コード例を提供しています。"
sidebar_position: 1
---

# 基本サンプル

## 基本的な抽出

HTML バイトからタイトル、本文、メディア情報を抽出します：

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    data := []byte(`<html>
        <head><title>Go 言語チュートリアル</title></head>
        <body>
            <article>
                <h1>Go 入門ガイド</h1>
                <p>Go は Google が開発したオープンソースプログラミング言語です。</p>
                <img src="gopher.png" alt="Gopher マスコット" />
                <a href="https://go.dev">Go 公式サイト</a>
            </article>
        </body>
    </html>`)

    result, err := html.Extract(data)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println("タイトル：", result.Title)
    fmt.Println("本文：", result.Text)
    fmt.Println("単語数：", result.WordCount)
    fmt.Println("読了時間：", result.ReadingTime)
    // 出力：
    // タイトル：Go 言語チュートリアル
    // 本文：Go 入門ガイド
    //
    //       Go は Google が開発したオープンソースプログラミング言語です。
    //
    //       Go 公式サイト
    // 単語数：8
    // 読了時間：2.4s
}
```

## ファイルから抽出

```go
result, err := html.ExtractFromFile("article.html")
if err != nil {
    log.Fatal(err)
}
fmt.Println(result.Title)
```

## テキストのみ抽出

```go
text, err := html.ExtractText(data)
if err != nil {
    log.Fatal(err)
}
fmt.Println(text)
```

## Markdown 出力

```go
md, err := html.ExtractToMarkdown(data)
if err != nil {
    log.Fatal(err)
}
fmt.Println(md)
```

## リンクの抽出

```go
links, err := html.ExtractAllLinks(data)
if err != nil {
    log.Fatal(err)
}

for _, link := range links {
    fmt.Printf("[%s] %s - %s\n", link.Type, link.Title, link.URL)
}

// タイプ別にグループ化
groups := html.GroupLinksByType(links)
for typ, items := range groups {
    fmt.Printf("%s: %d 件\n", typ, len(items))
}
```

## Processor の使用

```go
p, err := html.New(html.DefaultConfig())
if err != nil {
    log.Fatal(err)
}
defer p.Close()

// Processor を再利用して複数ページを処理
for _, page := range pages {
    result, err := p.Extract(page)
    if err != nil {
        log.Printf("処理に失敗: %v", err)
        continue
    }
    fmt.Println(result.Title)
}

// 統計を確認
stats := p.GetStatistics()
fmt.Printf("処理済み：%d, キャッシュヒット：%d\n",
    stats.TotalProcessed, stats.CacheHits)
```

## タイムアウト制御付き

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

result, err := html.ExtractWithContext(ctx, data)
if err != nil {
    log.Fatal(err)
}
```

## バッチ処理

```go
pages := [][]byte{page1, page2, page3}

p, _ := html.New(html.DefaultConfig())
defer p.Close()

batch := p.ExtractBatch(pages)
fmt.Printf("成功：%d, 失敗：%d\n", batch.Success, batch.Failed)

for i, result := range batch.Results {
    if result != nil {
        fmt.Printf("ページ %d: %s\n", i, result.Title)
    }
}
```

## JSON 出力

```go
jsonBytes, err := html.ExtractToJSON(data)
if err != nil {
    log.Fatal(err)
}
fmt.Println(string(jsonBytes))
```

## エンコーディング自動検出

ライブラリは 15+ 種のエンコーディング（GBK、Shift_JIS、Windows-1252 など）を自動認識するため、手動処理は不要です：

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
    "golang.org/x/text/encoding/simplifiedchinese"
)

func main() {
    // GBK エンコーディングの中国語 HTML を構築
    utf8HTML := `<html><head><meta charset="gbk"><title>中文网页</title></head>
<body><article><h1>你好世界</h1><p>这是一段中文内容。</p></article></body></html>`
    gbkBytes, err := simplifiedchinese.GBK.NewEncoder().Bytes([]byte(utf8HTML))
    if err != nil {
        log.Fatal(err)
    }

    // エンコーディングを自動検出して抽出
    result, err := html.Extract(gbkBytes)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println("タイトル：", result.Title)
    // タイトル：中文网页
    fmt.Println("本文：", result.Text)
    // 本文：你好世界
    //       这是一段中文内容。
}
```

## メディア抽出

動画と音声のリソース情報を抽出します：

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    data := []byte(`<html><body><article>
        <h1>マルチメディアページ</h1>
        <p>動画と音声の抽出例。</p>
        <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" width="560" height="315"></iframe>
        <video poster="cover.jpg" width="640">
            <source src="https://example.com/video.mp4" type="video/mp4">
        </video>
        <audio>
            <source src="https://example.com/audio.mp3" type="audio/mpeg">
        </audio>
    </article></body></html>`)

    result, err := html.Extract(data)
    if err != nil {
        log.Fatal(err)
    }

    // 動画情報
    fmt.Printf("動画数：%d\n", len(result.Videos))
    for i, v := range result.Videos {
        fmt.Printf("  [%d] %s (Type: %s", i+1, v.URL, v.Type)
        if v.Poster != "" {
            fmt.Printf(", Poster: %s", v.Poster)
        }
        if v.Width != "" {
            fmt.Printf(", W: %s", v.Width)
        }
        fmt.Println(")")
    }

    // 音声情報
    fmt.Printf("音声数：%d\n", len(result.Audios))
    for i, a := range result.Audios {
        fmt.Printf("  [%d] %s (Type: %s)\n", i+1, a.URL, a.Type)
    }
}
```

## 画像とリンクフィールドへのアクセス

`Result` の構造化フィールドに完全にアクセスします：

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    data := []byte(`<html><body><article>
        <h1>フィールドアクセス例</h1>
        <p>本文段落。<a href="https://go.dev" title="Go 公式サイト">Go</a></p>
        <img src="logo.png" alt="Logo" width="200" height="100">
        <a href="/about" rel="nofollow">概要</a>
    </article></body></html>`)

    result, err := html.Extract(data)
    if err != nil {
        log.Fatal(err)
    }

    // 画像フィールド
    for _, img := range result.Images {
        fmt.Printf("画像: url=%s, alt=%s, %sx%s, decorative=%v, pos=%d\n",
            img.URL, img.Alt, img.Width, img.Height, img.IsDecorative, img.Position)
    }

    // リンクフィールド
    for _, link := range result.Links {
        fmt.Printf("リンク: url=%s, text=%s, external=%v, nofollow=%v, pos=%d\n",
            link.URL, link.Text, link.IsExternal, link.IsNoFollow, link.Position)
    }

    // 統計情報
    fmt.Printf("単語数：%d、読了時間：%v、処理時間：%v\n",
        result.WordCount, result.ReadingTime, result.ProcessingTime)
}
```

## 統計監視

Processor インスタンスで処理統計を監視します：

```go
package main

import (
    "fmt"

    "github.com/cybergodev/html"
)

func main() {
    p, _ := html.New(html.DefaultConfig())
    defer p.Close()

    pages := [][]byte{
        []byte(`<html><body><article><h1>ページ 1</h1><p>内容 A。</p></article></body></html>`),
        []byte(`<html><body><article><h1>ページ 2</h1><p>内容 B。</p></article></body></html>`),
        []byte(`<html><body><article><h1>ページ 1</h1><p>内容 A。</p></article></body></html>`), // 重複、キャッシュヒット
    }

    for _, page := range pages {
        p.Extract(page)
    }

    stats := p.GetStatistics()
    fmt.Printf("総処理：%d\n", stats.TotalProcessed)
    fmt.Printf("キャッシュヒット：%d\n", stats.CacheHits)
    fmt.Printf("キャッシュミス：%d\n", stats.CacheMisses)
    fmt.Printf("エラー数：%d\n", stats.ErrorCount)
    fmt.Printf("平均処理時間：%v\n", stats.AverageProcessTime)

    hitRate := float64(0)
    if stats.TotalProcessed > 0 {
        hitRate = float64(stats.CacheHits) / float64(stats.TotalProcessed) * 100
    }
    fmt.Printf("ヒット率：%.1f%%\n", hitRate)
}
```
