---
sidebar_label: "Basic Usage"
title: "Basic Usage - CyberGo html | Runnable Examples"
description: "CyberGo html basic usage examples: content and file extraction, plain text, Markdown output, link grouping, Processor reuse, and concurrent batch code."
sidebar_position: 1
---

# Basic Usage

## Basic Extraction

Extract title, text, and media information from HTML bytes:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    data := []byte(`<html>
        <head><title>Go Tutorial</title></head>
        <body>
            <article>
                <h1>Getting Started with Go</h1>
                <p>Go is an open-source programming language developed by Google.</p>
                <img src="gopher.png" alt="Gopher mascot" />
                <a href="https://go.dev">Go Official Site</a>
            </article>
        </body>
    </html>`)

    result, err := html.Extract(data)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println("Title:", result.Title)
    fmt.Println("Text:", result.Text)
    fmt.Println("Words:", result.WordCount)
    fmt.Println("Reading Time:", result.ReadingTime)
    // Output:
    // Title: Go Tutorial
    // Text: Getting Started with Go
    //
    //       Go is an open-source programming language developed by Google.
    //
    //       Go Official Site
    // Words: 16
    // Reading Time: 4.8s
}
```

## Extract from File

```go
result, err := html.ExtractFromFile("article.html")
if err != nil {
    log.Fatal(err)
}
fmt.Println(result.Title)
```

## Text-Only Extraction

```go
text, err := html.ExtractText(data)
if err != nil {
    log.Fatal(err)
}
fmt.Println(text)
```

## Markdown Output

```go
md, err := html.ExtractToMarkdown(data)
if err != nil {
    log.Fatal(err)
}
fmt.Println(md)
```

## Link Extraction

```go
links, err := html.ExtractAllLinks(data)
if err != nil {
    log.Fatal(err)
}

for _, link := range links {
    fmt.Printf("[%s] %s - %s\n", link.Type, link.Title, link.URL)
}

// Group by type
groups := html.GroupLinksByType(links)
for typ, items := range groups {
    fmt.Printf("%s: %d items\n", typ, len(items))
}
```

## Using Processor

```go
p, err := html.New(html.DefaultConfig())
if err != nil {
    log.Fatal(err)
}
defer p.Close()

// Reuse Processor for multiple pages
for _, page := range pages {
    result, err := p.Extract(page)
    if err != nil {
        log.Printf("Processing failed: %v", err)
        continue
    }
    fmt.Println(result.Title)
}

// View statistics
stats := p.GetStatistics()
fmt.Printf("Processed: %d, Cache hits: %d\n",
    stats.TotalProcessed, stats.CacheHits)
```

## With Timeout Control

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

result, err := html.ExtractWithContext(ctx, data)
if err != nil {
    log.Fatal(err)
}
```

## Batch Processing

```go
pages := [][]byte{page1, page2, page3}

p, _ := html.New(html.DefaultConfig())
defer p.Close()

batch := p.ExtractBatch(pages)
fmt.Printf("Success: %d, Failed: %d\n", batch.Success, batch.Failed)

for i, result := range batch.Results {
    if result != nil {
        fmt.Printf("Page %d: %s\n", i, result.Title)
    }
}
```

## JSON Output

```go
jsonBytes, err := html.ExtractToJSON(data)
if err != nil {
    log.Fatal(err)
}
fmt.Println(string(jsonBytes))
```

## Encoding Auto-Detection

The library automatically detects 15+ encodings (GBK, Shift_JIS, Windows-1252, etc.) with no manual handling needed:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
    "golang.org/x/text/encoding/simplifiedchinese"
)

func main() {
    // Build GBK-encoded Chinese HTML
    utf8HTML := `<html><head><meta charset="gbk"><title>中文网页</title></head>
<body><article><h1>你好世界</h1><p>这是一段中文内容。</p></article></body></html>`
    gbkBytes, err := simplifiedchinese.GBK.NewEncoder().Bytes([]byte(utf8HTML))
    if err != nil {
        log.Fatal(err)
    }

    // Auto-detect encoding and extract
    result, err := html.Extract(gbkBytes)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println("Title:", result.Title)
    // Title: 中文网页
    fmt.Println("Text:", result.Text)
    // Text: 你好世界
    //       这是一段中文内容。
}
```

## Media Extraction

Extract video and audio resource information:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    data := []byte(`<html><body><article>
        <h1>Multimedia Page</h1>
        <p>Video and audio extraction example.</p>
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

    // Videos
    fmt.Printf("Videos: %d\n", len(result.Videos))
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

    // Audios
    fmt.Printf("Audios: %d\n", len(result.Audios))
    for i, a := range result.Audios {
        fmt.Printf("  [%d] %s (Type: %s)\n", i+1, a.URL, a.Type)
    }
}
```

## Image & Link Field Access

Fully access the structured fields in `Result`:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    data := []byte(`<html><body><article>
        <h1>Field Access Example</h1>
        <p>Body paragraph. <a href="https://go.dev" title="Go Official Site">Go</a></p>
        <img src="logo.png" alt="Logo" width="200" height="100">
        <a href="/about" rel="nofollow">About</a>
    </article></body></html>`)

    result, err := html.Extract(data)
    if err != nil {
        log.Fatal(err)
    }

    // Image fields
    for _, img := range result.Images {
        fmt.Printf("Image: url=%s, alt=%s, %sx%s, decorative=%v, pos=%d\n",
            img.URL, img.Alt, img.Width, img.Height, img.IsDecorative, img.Position)
    }

    // Link fields
    for _, link := range result.Links {
        fmt.Printf("Link: url=%s, text=%s, external=%v, nofollow=%v, pos=%d\n",
            link.URL, link.Text, link.IsExternal, link.IsNoFollow, link.Position)
    }

    // Statistics
    fmt.Printf("Words: %d, Reading time: %v, Processing time: %v\n",
        result.WordCount, result.ReadingTime, result.ProcessingTime)
}
```

## Statistics Monitoring

Use a Processor instance to monitor processing statistics:

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
        []byte(`<html><body><article><h1>Page One</h1><p>Content A.</p></article></body></html>`),
        []byte(`<html><body><article><h1>Page Two</h1><p>Content B.</p></article></body></html>`),
        []byte(`<html><body><article><h1>Page One</h1><p>Content A.</p></article></body></html>`), // Duplicate, hits cache
    }

    for _, page := range pages {
        p.Extract(page)
    }

    stats := p.GetStatistics()
    fmt.Printf("Total processed: %d\n", stats.TotalProcessed)
    fmt.Printf("Cache hits: %d\n", stats.CacheHits)
    fmt.Printf("Cache misses: %d\n", stats.CacheMisses)
    fmt.Printf("Errors: %d\n", stats.ErrorCount)
    fmt.Printf("Average time: %v\n", stats.AverageProcessTime)

    hitRate := float64(0)
    if stats.TotalProcessed > 0 {
        hitRate = float64(stats.CacheHits) / float64(stats.TotalProcessed) * 100
    }
    fmt.Printf("Hit rate: %.1f%%\n", hitRate)
}
```
