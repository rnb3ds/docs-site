---
sidebar_label: "基础用法"
title: "基础用法 - CyberGo html | 可运行示例集"
description: "CyberGo html 基础用法可运行示例集：涵盖从字节与文件提取内容、纯文本输出、Markdown 与 JSON 格式转换、链接按类型分组、媒体资源提取与 Processor 实例复用等典型场景，每段代码均可直接编译运行并附详细预期输出。"
sidebar_position: 1
---

# 基础用法

## 基本提取

从 HTML 字节中提取标题、正文和媒体信息：

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    data := []byte(`<html>
        <head><title>Go 语言教程</title></head>
        <body>
            <article>
                <h1>Go 入门指南</h1>
                <p>Go 是一门由 Google 开发的开源编程语言。</p>
                <img src="gopher.png" alt="Gopher 吉祥物" />
                <a href="https://go.dev">Go 官网</a>
            </article>
        </body>
    </html>`)

    result, err := html.Extract(data)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println("标题：", result.Title)
    fmt.Println("正文：", result.Text)
    fmt.Println("字数：", result.WordCount)
    fmt.Println("阅读时间：", result.ReadingTime)
    // 输出：
    // 标题：Go 语言教程
    // 正文：Go 入门指南
    //
    //       Go 是一门由 Google 开发的开源编程语言。
    //
    //       Go 官网
    // 字数：8
    // 阅读时间：2.4s
}
```

## 从文件提取

```go
result, err := html.ExtractFromFile("article.html")
if err != nil {
    log.Fatal(err)
}
fmt.Println(result.Title)
```

## 仅提取文本

```go
text, err := html.ExtractText(data)
if err != nil {
    log.Fatal(err)
}
fmt.Println(text)
```

## Markdown 输出

```go
md, err := html.ExtractToMarkdown(data)
if err != nil {
    log.Fatal(err)
}
fmt.Println(md)
```

## 提取链接

```go
links, err := html.ExtractAllLinks(data)
if err != nil {
    log.Fatal(err)
}

for _, link := range links {
    fmt.Printf("[%s] %s - %s\n", link.Type, link.Title, link.URL)
}

// 按类型分组
groups := html.GroupLinksByType(links)
for typ, items := range groups {
    fmt.Printf("%s: %d 个\n", typ, len(items))
}
```

## 使用 Processor

```go
p, err := html.New(html.DefaultConfig())
if err != nil {
    log.Fatal(err)
}
defer p.Close()

// 复用 Processor 处理多个页面
for _, page := range pages {
    result, err := p.Extract(page)
    if err != nil {
        log.Printf("处理失败: %v", err)
        continue
    }
    fmt.Println(result.Title)
}

// 查看统计
stats := p.GetStatistics()
fmt.Printf("已处理：%d, 缓存命中：%d\n",
    stats.TotalProcessed, stats.CacheHits)
```

## 带超时控制

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

result, err := html.ExtractWithContext(ctx, data)
if err != nil {
    log.Fatal(err)
}
```

## 批量处理

```go
pages := [][]byte{page1, page2, page3}

p, _ := html.New(html.DefaultConfig())
defer p.Close()

batch := p.ExtractBatch(pages)
fmt.Printf("成功：%d, 失败：%d\n", batch.Success, batch.Failed)

for i, result := range batch.Results {
    if result != nil {
        fmt.Printf("页面 %d: %s\n", i, result.Title)
    }
}
```

## JSON 输出

```go
jsonBytes, err := html.ExtractToJSON(data)
if err != nil {
    log.Fatal(err)
}
fmt.Println(string(jsonBytes))
```

## 编码自动检测

库自动识别 15+ 种编码（GBK、Shift_JIS、Windows-1252 等），无需手动处理：

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
    "golang.org/x/text/encoding/simplifiedchinese"
)

func main() {
    // 构造 GBK 编码的中文 HTML
    utf8HTML := `<html><head><meta charset="gbk"><title>中文网页</title></head>
<body><article><h1>你好世界</h1><p>这是一段中文内容。</p></article></body></html>`
    gbkBytes, err := simplifiedchinese.GBK.NewEncoder().Bytes([]byte(utf8HTML))
    if err != nil {
        log.Fatal(err)
    }

    // 自动检测编码并提取
    result, err := html.Extract(gbkBytes)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println("标题：", result.Title)
    // 标题：中文网页
    fmt.Println("正文：", result.Text)
    // 正文：你好世界
    //       这是一段中文内容。
}
```

## 媒体提取

提取视频和音频资源信息：

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    data := []byte(`<html><body><article>
        <h1>多媒体页面</h1>
        <p>视频和音频提取示例。</p>
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

    // 视频信息
    fmt.Printf("视频数量：%d\n", len(result.Videos))
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

    // 音频信息
    fmt.Printf("音频数量：%d\n", len(result.Audios))
    for i, a := range result.Audios {
        fmt.Printf("  [%d] %s (Type: %s)\n", i+1, a.URL, a.Type)
    }
}
```

## 图片与链接字段访问

完整访问 `Result` 中的结构化字段：

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    data := []byte(`<html><body><article>
        <h1>字段访问示例</h1>
        <p>正文段落。<a href="https://go.dev" title="Go 官网">Go</a></p>
        <img src="logo.png" alt="Logo" width="200" height="100">
        <a href="/about" rel="nofollow">关于</a>
    </article></body></html>`)

    result, err := html.Extract(data)
    if err != nil {
        log.Fatal(err)
    }

    // 图片字段
    for _, img := range result.Images {
        fmt.Printf("图片: url=%s, alt=%s, %sx%s, decorative=%v, pos=%d\n",
            img.URL, img.Alt, img.Width, img.Height, img.IsDecorative, img.Position)
    }

    // 链接字段
    for _, link := range result.Links {
        fmt.Printf("链接: url=%s, text=%s, external=%v, nofollow=%v, pos=%d\n",
            link.URL, link.Text, link.IsExternal, link.IsNoFollow, link.Position)
    }

    // 统计信息
    fmt.Printf("字数：%d，阅读时间：%v，处理耗时：%v\n",
        result.WordCount, result.ReadingTime, result.ProcessingTime)
}
```

## 统计监控

使用 Processor 实例监控处理统计：

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
        []byte(`<html><body><article><h1>页面一</h1><p>内容 A。</p></article></body></html>`),
        []byte(`<html><body><article><h1>页面二</h1><p>内容 B。</p></article></body></html>`),
        []byte(`<html><body><article><h1>页面一</h1><p>内容 A。</p></article></body></html>`), // 重复，命中缓存
    }

    for _, page := range pages {
        p.Extract(page)
    }

    stats := p.GetStatistics()
    fmt.Printf("总处理：%d\n", stats.TotalProcessed)
    fmt.Printf("缓存命中：%d\n", stats.CacheHits)
    fmt.Printf("缓存未命中：%d\n", stats.CacheMisses)
    fmt.Printf("错误数：%d\n", stats.ErrorCount)
    fmt.Printf("平均耗时：%v\n", stats.AverageProcessTime)

    hitRate := float64(0)
    if stats.TotalProcessed > 0 {
        hitRate = float64(stats.CacheHits) / float64(stats.TotalProcessed) * 100
    }
    fmt.Printf("命中率：%.1f%%\n", hitRate)
}
```
