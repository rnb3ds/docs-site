---
sidebar_label: "Базовые примеры"
title: "Базовые примеры - CyberGo html | типовые сценарии с кодом"
description: "Шесть сценариев CyberGo html: извлечение контента и текста, файлы, Markdown и JSON, ссылки, медиа, пакеты с тайм-аутом — готовый код для копирования."
sidebar_position: 1
---

# Базовые примеры

Эта страница — шпаргалка **«код по сценариям»**: для каждого сценария приведён только минимальный рабочий каркас, который можно скопировать и сразу запустить; теорию и расширенную конфигурацию изучайте по ссылкам «Подробнее» в конце разделов.

| Сценарий | Ключевые вызовы | Подробнее |
|------|----------|------|
| Контент и чистый текст | `html.Extract` / `html.ExtractText` | [Извлечение контента на практике](../guides/core-features/content-extraction) |
| Извлечение из файла | `html.ExtractFromFile` | [Извлечение контента на практике](../guides/core-features/content-extraction) |
| Вывод в Markdown / JSON | `html.ExtractToMarkdown` / `html.ExtractToJSON` | [Форматы вывода на практике](../guides/core-features/output-formats) |
| Извлечение ссылок | `html.ExtractAllLinks` + `html.GroupLinksByType` | [Извлечение ссылок на практике](../guides/core-features/link-extraction) |
| Информация о медиа | `html.Extract` (`Videos` / `Audios`) | [Извлечение медиа на практике](../guides/core-features/media-extraction) |
| Пакетная обработка и тайм-ауты | `html.New` + `ExtractBatchWithContext` | [Пакетная обработка на практике](../guides/performance/batch-processing) |

## Контент и чистый текст

`Extract` за один вызов возвращает полный `Result`; если нужен только чистый текст, используйте близкую функцию `ExtractText`, которая напрямую возвращает `string`:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    data := []byte(`<html><head><title>Руководство по Go</title></head><body><article><h1>Введение в Go</h1><p>Go — статически типизированный компилируемый язык.</p><a href="https://go.dev">Официальный сайт Go</a></article></body></html>`)

    result, err := html.Extract(data) // принимает байты, возвращает полный Result
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(result.Title) // Вывод: Руководство по Go
    fmt.Println(result.Text)
    // Вывод: Введение в Go\n\nGo — статически типизированный компилируемый язык.\n\nОфициальный сайт Go

    text, err := html.ExtractText(data) // только чистый текст: напрямую возвращает string
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(len(text) > 0) // Вывод: true (непустой)
}
```

Подробнее: [Извлечение контента на практике](../guides/core-features/content-extraction)

## Извлечение из файла

Для файлов на диске используйте `ExtractFromFile` со встроенной защитой от обхода пути и лимитом размера файла:

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
    fmt.Println(result.Title) // Вывод: содержимое <title> из article.html
}
```

Подробнее: [Извлечение контента на практике](../guides/core-features/content-extraction)

## Вывод в Markdown / JSON

Для миграции контента — Markdown, для передачи между программами — JSON:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    data := []byte(`<article><h1>Введение в Go</h1><p>Go — компилируемый язык.</p><img src="gopher.png" alt="Gopher" /><a href="https://go.dev">Официальный сайт Go</a></article>`)
    // В Markdown: изображения и ссылки автоматически превращаются в синтаксис ![]() и []()
    md, err := html.ExtractToMarkdown(data)
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(md)
    // Вывод: Введение в Go\n\nGo — компилируемый язык.\n\n![Gopher](gopher.png)\n[Официальный сайт Go](https://go.dev)
    jsonBytes, err := html.ExtractToJSON(data) // в JSON: сохраняются все поля метаданных
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("Байт JSON:", len(jsonBytes))
    // Число байт JSON зависит от содержимого (включает поля text/title/images/links и др.)
}
```

Подробнее: [Форматы вывода на практике](../guides/core-features/output-formats)

## Извлечение ссылок

API извлечения ссылок, независимый от основного контента, с группировкой по типам:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    data := []byte(`<html><body><article><h1>Пример ссылок</h1><p><a href="https://go.dev">Официальный сайт Go</a></p></article></body></html>`)

    links, err := html.ExtractAllLinks(data) // охватывает ресурсы a/img/video/css/js и др.
    if err != nil {
        log.Fatal(err)
    }
    for _, link := range links {
        fmt.Printf("[%s] %s - %s\n", link.Type, link.Title, link.URL)
    }
    // Вывод: [link] Официальный сайт Go - https://go.dev
    groups := html.GroupLinksByType(links) // группировка по типам
    fmt.Println("Группа link:", len(groups["link"]))
    // Вывод: Группа link: 1
}
```

Подробнее: [Извлечение ссылок на практике](../guides/core-features/link-extraction)

## Информация о медиа

Информация о видео и аудио возвращается вместе с `Extract`, отдельный вызов не нужен:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    data := []byte(`<html><body><article><h1>Мультимедийная страница</h1>
<video poster="cover.jpg"><source src="https://example.com/video.mp4" type="video/mp4"></video>
<audio><source src="https://example.com/audio.mp3" type="audio/mpeg"></audio>
</article></body></html>`)
    result, err := html.Extract(data)
    if err != nil {
        log.Fatal(err)
    }
    for _, v := range result.Videos {
        fmt.Printf("Видео: %s (%s)\n", v.URL, v.Type)
    }
    for _, a := range result.Audios {
        fmt.Printf("Аудио: %s (%s)\n", a.URL, a.Type)
    }
    // Вывод:
    // Видео: https://example.com/video.mp4 (video/mp4)
    // Аудио: https://example.com/audio.mp3 (audio/mpeg)
}
```

Подробнее: [Извлечение медиа на практике](../guides/core-features/media-extraction)

## Пакетная обработка, тайм-ауты и переиспользование Processor

Типичный серверный паттерн: создать глобально переиспользуемый `Processor`, выполнять параллельное пакетное извлечение и управлять временем обработки партии через context:

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

    p, err := html.New(html.DefaultConfig()) // безопасен для конкурентного доступа, можно переиспользовать глобально
    if err != nil {
        log.Fatal(err)
    }
    defer p.Close()
    pages := [][]byte{
        []byte(`<html><body><article><h1>Страница 1</h1></article></body></html>`),
        []byte(`<html><body><article><h1>Страница 2</h1></article></body></html>`),
    }
    batch := p.ExtractBatchWithContext(ctx, pages) // незавершённые элементы при истечении context попадают в Cancelled
    fmt.Printf("Успешно: %d, Неудачно: %d\n", batch.Success, batch.Failed)
    // Вывод: Успешно: 2, Неудачно: 0
}
```

Подробнее: [Пакетная обработка на практике](../guides/performance/batch-processing) и [Повторное использование Processor и кэш](../guides/performance/processor-cache)
