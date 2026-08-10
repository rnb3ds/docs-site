---
sidebar_label: "Базовые примеры"
title: "Базовые примеры - CyberGo html | исполняемый код"
description: "Базовые примеры CyberGo html: извлечение контента и файлов, текст, Markdown, группировка ссылок, переиспользование Processor и пакетная обработка."
sidebar_position: 1
---

# Базовые примеры

## Базовое извлечение

Извлечение заголовка, текста и медиа-информации из байтов HTML:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    data := []byte(`<html>
        <head><title>Руководство по Go</title></head>
        <body>
            <article>
                <h1>Введение в Go</h1>
                <p>Go — это язык программирования с открытым исходным кодом, разработанный Google.</p>
                <img src="gopher.png" alt="Талисман Gopher" />
                <a href="https://go.dev">Официальный сайт Go</a>
            </article>
        </body>
    </html>`)

    result, err := html.Extract(data)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println("Заголовок:", result.Title)
    fmt.Println("Текст:", result.Text)
    fmt.Println("Слов:", result.WordCount)
    fmt.Println("Время чтения:", result.ReadingTime)
    // Вывод:
    // Заголовок: Руководство по Go
    // Текст: Введение в Go
    //
    //       Go — это язык программирования с открытым исходным кодом, разработанный Google.
    //
    //       Официальный сайт Go
    // Слов: 8
    // Время чтения: 2.4с
}
```

## Извлечение из файла

```go
result, err := html.ExtractFromFile("article.html")
if err != nil {
    log.Fatal(err)
}
fmt.Println(result.Title)
```

## Извлечение только текста

```go
text, err := html.ExtractText(data)
if err != nil {
    log.Fatal(err)
}
fmt.Println(text)
```

## Вывод в Markdown

```go
md, err := html.ExtractToMarkdown(data)
if err != nil {
    log.Fatal(err)
}
fmt.Println(md)
```

## Извлечение ссылок

```go
links, err := html.ExtractAllLinks(data)
if err != nil {
    log.Fatal(err)
}

for _, link := range links {
    fmt.Printf("[%s] %s - %s\n", link.Type, link.Title, link.URL)
}

// Группировка по типам
groups := html.GroupLinksByType(links)
for typ, items := range groups {
    fmt.Printf("%s: %d шт.\n", typ, len(items))
}
```

## Использование Processor

```go
p, err := html.New(html.DefaultConfig())
if err != nil {
    log.Fatal(err)
}
defer p.Close()

// Повторное использование Processor для обработки нескольких страниц
for _, page := range pages {
    result, err := p.Extract(page)
    if err != nil {
        log.Printf("Ошибка обработки: %v", err)
        continue
    }
    fmt.Println(result.Title)
}

// Просмотр статистики
stats := p.GetStatistics()
fmt.Printf("Обработано: %d, Попаданий в кэш: %d\n",
    stats.TotalProcessed, stats.CacheHits)
```

## С тайм-аутом

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

result, err := html.ExtractWithContext(ctx, data)
if err != nil {
    log.Fatal(err)
}
```

## Пакетная обработка

```go
pages := [][]byte{page1, page2, page3}

p, _ := html.New(html.DefaultConfig())
defer p.Close()

batch := p.ExtractBatch(pages)
fmt.Printf("Успешно: %d, Неудачно: %d\n", batch.Success, batch.Failed)

for i, result := range batch.Results {
    if result != nil {
        fmt.Printf("Страница %d: %s\n", i, result.Title)
    }
}
```

## Вывод в JSON

```go
jsonBytes, err := html.ExtractToJSON(data)
if err != nil {
    log.Fatal(err)
}
fmt.Println(string(jsonBytes))
```

## Автоопределение кодировки

Библиотека автоматически распознаёт 15+ кодировок (GBK, Shift_JIS, Windows-1252 и др.), ручная обработка не требуется:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
    "golang.org/x/text/encoding/simplifiedchinese"
)

func main() {
    // Создание HTML на китайском в кодировке GBK
    utf8HTML := `<html><head><meta charset="gbk"><title>中文网页</title></head>
<body><article><h1>你好世界</h1><p>这是一段中文内容。</p></article></body></html>`
    gbkBytes, err := simplifiedchinese.GBK.NewEncoder().Bytes([]byte(utf8HTML))
    if err != nil {
        log.Fatal(err)
    }

    // Автоопределение кодировки и извлечение
    result, err := html.Extract(gbkBytes)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println("Заголовок:", result.Title)
    // Заголовок: 中文网页
    fmt.Println("Текст:", result.Text)
    // Текст: 你好世界
    //       这是一段中文内容。
}
```

## Извлечение медиа

Извлечение информации о видео- и аудиоресурсах:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    data := []byte(`<html><body><article>
        <h1>Мультимедийная страница</h1>
        <p>Пример извлечения видео и аудио.</p>
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

    // Информация о видео
    fmt.Printf("Видео: %d\n", len(result.Videos))
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

    // Информация об аудио
    fmt.Printf("Аудио: %d\n", len(result.Audios))
    for i, a := range result.Audios {
        fmt.Printf("  [%d] %s (Type: %s)\n", i+1, a.URL, a.Type)
    }
}
```

## Доступ к полям изображений и ссылок

Полный доступ к структурированным полям `Result`:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    data := []byte(`<html><body><article>
        <h1>Пример доступа к полям</h1>
        <p>Абзац текста. <a href="https://go.dev" title="Сайт Go">Go</a></p>
        <img src="logo.png" alt="Logo" width="200" height="100">
        <a href="/about" rel="nofollow">О нас</a>
    </article></body></html>`)

    result, err := html.Extract(data)
    if err != nil {
        log.Fatal(err)
    }

    // Поля изображений
    for _, img := range result.Images {
        fmt.Printf("Изображение: url=%s, alt=%s, %sx%s, decorative=%v, pos=%d\n",
            img.URL, img.Alt, img.Width, img.Height, img.IsDecorative, img.Position)
    }

    // Поля ссылок
    for _, link := range result.Links {
        fmt.Printf("Ссылка: url=%s, text=%s, external=%v, nofollow=%v, pos=%d\n",
            link.URL, link.Text, link.IsExternal, link.IsNoFollow, link.Position)
    }

    // Статистика
    fmt.Printf("Слов: %d, время чтения: %v, время обработки: %v\n",
        result.WordCount, result.ReadingTime, result.ProcessingTime)
}
```

## Мониторинг статистики

Мониторинг статистики обработки с использованием экземпляра Processor:

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
        []byte(`<html><body><article><h1>Страница 1</h1><p>Содержимое A.</p></article></body></html>`),
        []byte(`<html><body><article><h1>Страница 2</h1><p>Содержимое B.</p></article></body></html>`),
        []byte(`<html><body><article><h1>Страница 1</h1><p>Содержимое A.</p></article></body></html>`), // повтор — попадание в кэш
    }

    for _, page := range pages {
        p.Extract(page)
    }

    stats := p.GetStatistics()
    fmt.Printf("Всего обработано: %d\n", stats.TotalProcessed)
    fmt.Printf("Попаданий в кэш: %d\n", stats.CacheHits)
    fmt.Printf("Промахов кэша: %d\n", stats.CacheMisses)
    fmt.Printf("Ошибок: %d\n", stats.ErrorCount)
    fmt.Printf("Среднее время: %v\n", stats.AverageProcessTime)

    hitRate := float64(0)
    if stats.TotalProcessed > 0 {
        hitRate = float64(stats.CacheHits) / float64(stats.TotalProcessed) * 100
    }
    fmt.Printf("Доля попаданий: %.1f%%\n", hitRate)
}
```
