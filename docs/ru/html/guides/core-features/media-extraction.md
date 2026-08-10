---
sidebar_label: "Извлечение медиа на практике"
title: "Извлечение медиа - CyberGo html | видео и аудио на практике"
description: "Извлечение медиа CyberGo html на практике: видео из трёх источников, аудио из двух, поля VideoInfo и AudioInfo, различие файлов и embed по Type."
sidebar_position: 2
---

# Извлечение медиа на практике

Помимо текста, изображений и ссылок, библиотека может извлекать из HTML видео- и аудиоресурсы. Это руководство подробно описывает механизм извлечения и значения полей.

## Обзор извлечения

При вызове `Extract` извлечение видео и аудио выполняется после разбора DOM, но до форматирования контента. Результаты помещаются в `Result.Videos` и `Result.Audios` соответственно.

```text
Разбор DOM → извлечение видео (3 источника) → извлечение аудио (2 источника) → форматирование → Result
```

## Извлечение видео (три источника)

Извлечение видео выполняется в следующем порядке, каждый URL дедуплицируется и не попадает в результат дважды:

| Порядок | Источник | Объект сканирования | Описание |
|---------|----------|---------------------|----------|
| ① | Сканирование исходного HTML | атрибуты `src`/`data` у `iframe`/`embed`/`object` | выполняется **до** безопасного санирования, чтобы очищаемые встраиваемые теги не потерялись |
| ② | Обход DOM | элементы `video`/`iframe`/`embed`/`object` | обход разобранного DOM-дерева, чтение атрибутов элементов и дочерних `<source>` |
| ③ | Регулярные выражения (резерв) | URL видеофайлов | сканирование «голых» ссылок на видео в тексте HTML |

:::tip Зачем сканировать исходный HTML
Встраиваемые теги `iframe`, `embed`, `object` могут быть удалены на этапе безопасного санирования. Библиотека извлекает медиа-URL этих тегов из исходной строки HTML до санирования, чтобы встраиваемые видео не потерялись при очистке.
:::

### Расширения видео для резервного поиска через регулярные выражения

```
.mp4  .webm  .ogg  .mov  .avi  .wmv  .flv  .mkv  .m4v  .3gp
```

Регулярное выражение совпадает только с полными URL, начинающимися с `http://` или `https://`, что исключает ложные совпадения с фрагментами имён файлов.

## Извлечение аудио (два источника)

| Порядок | Источник | Объект сканирования | Описание |
|---------|----------|---------------------|----------|
| ① | Обход DOM | элемент `audio` и его дочерние `<source>` | чтение атрибута `src` или `src`/`type` дочернего `<source>` |
| ② | Регулярные выражения (резерв) | URL аудиофайлов | сканирование «голых» ссылок на аудио в тексте HTML |

### Расширения аудио для резервного поиска через регулярные выражения

```
.mp3  .wav  .ogg  .m4a  .aac  .flac  .wma  .opus  .oga
```

:::warning Расширение .ogg присутствует и в списке видео, и в списке аудио
OGG — это контейнерный формат, который может содержать видео (Theora) или аудио (Vorbis/Opus). URL с расширением `.ogg` определяется **одновременно как видео и как аудио** и может оказаться одновременно в `Result.Videos` и `Result.Audios`. Вариант только для аудио `.oga` присутствует только в списке аудио.
:::

## Подробное описание полей

### VideoInfo

| Поле | Тип | Описание |
|------|------|----------|
| `URL` | `string` | URL источника видео |
| `Type` | `string` | Определённый тип: MIME-тип (например `video/mp4`) или `embed` (страница, встраиваемая через iframe) |
| `Poster` | `string` | атрибут `poster` у `<video>` (URL обложки) |
| `Width` | `string` | атрибут ширины (исходная строка, не преобразуется в число) |
| `Height` | `string` | атрибут высоты (исходная строка, не преобразуется в число) |
| `Duration` | `string` | атрибут длительности (исходная строка, не преобразуется в число) |

### AudioInfo

| Поле | Тип | Описание |
|------|------|----------|
| `URL` | `string` | URL источника аудио |
| `Type` | `string` | Определённый тип: MIME-тип (например `audio/mpeg`) |
| `Duration` | `string` | атрибут длительности (исходная строка, не преобразуется в число) |

### Правила значений поля Type

Поле `Type` различает два источника видео:

| Значение Type | Значение | Сценарий возникновения |
|---------------|----------|------------------------|
| `embed` | страница с видео по ссылке iframe | встраиваемые плееры YouTube, Vimeo, Youku, Bilibili и т. п. |
| MIME-тип (например `video/mp4`) | контейнер видеофайла | «голый» URL, совпавший с резервным регулярным выражением, или значение атрибута `<source type="...">` |
| Пустая строка | тип не определён | источник указан напрямую через `<video src="...">` (без дочерних элементов `<source>`) |

Платформы, поддерживающие определение `embed`:

| Платформа | Шаблон URL |
|-----------|------------|
| YouTube | `youtube.com/embed/`, `youtube-nocookie.com/embed/` |
| Vimeo | `player.vimeo.com/video/` |
| Dailymotion | `dailymotion.com/embed/` |
| Youku | `player.youku.com/` |
| Tencent Video | `v.qq.com/` |
| Bilibili | `bilibili.com/` |

## Полный пример

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    // HTML с тремя медиа-сценариями:
    // 1. iframe-встраивание YouTube (Type = "embed")
    // 2. Нативное видео с дочерним <source> (Type из атрибута type)
    // 3. Аудио с дочерним <source> (Type из атрибута type)
    data := []byte(`<html><body><article>
        <h1>Мультимедийная страница</h1>
        <p>В этой статье рассказывается о видео- и аудиотехнологиях.</p>
        <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" width="560" height="315"></iframe>
        <video poster="poster.jpg" width="640" height="360">
            <source src="https://example.com/trailer.mp4" type="video/mp4">
        </video>
        <audio>
            <source src="https://example.com/episode.mp3" type="audio/mpeg">
        </audio>
    </article></body></html>`)

    result, err := html.Extract(data)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Printf("Видео: %d\n", len(result.Videos))
    // Видео: 2

    for i, v := range result.Videos {
        fmt.Printf("  Видео %d: %s\n", i+1, v.URL)
        fmt.Printf("    Type: %s", v.Type)
        if v.Poster != "" {
            fmt.Printf(", обложка: %s", v.Poster)
        }
        if v.Width != "" || v.Height != "" {
            fmt.Printf(", размер: %sx%s", v.Width, v.Height)
        }
        fmt.Println()
    }
    // Видео 1: https://www.youtube.com/embed/dQw4w9WgXcQ
    //   Type: embed, размер: 560x315
    // Видео 2: https://example.com/trailer.mp4
    //   Type: video/mp4, обложка: poster.jpg, размер: 640x360

    fmt.Printf("\nАудио: %d\n", len(result.Audios))
    // Аудио: 1

    for i, a := range result.Audios {
        fmt.Printf("  Аудио %d: %s (Type: %s)\n", i+1, a.URL, a.Type)
    }
    // Аудио 1: https://example.com/episode.mp3 (Type: audio/mpeg)
}
```

## Управление конфигурацией

### Параметры Preserve*

Параметры `PreserveVideos` и `PreserveAudios` управляют тем, включается ли медиа в результат `Extract`:

| Поле конфигурации | По умолчанию | Действие |
|-------------------|--------------|----------|
| `PreserveVideos` | `true` | при `false` `Result.Videos` — пустой срез |
| `PreserveAudios` | `true` | при `false` `Result.Audios` — пустой срез |

```go
cfg := html.DefaultConfig()

// Отключить извлечение видео и аудио (оставить только текст, изображения, ссылки)
cfg.PreserveVideos = false
cfg.PreserveAudios = false

result, err := html.Extract(data, cfg)
// result.Videos → []
// result.Audios → []
```

### Различие между Preserve* и Include*

Эти две группы параметров работают независимо и управляют разными API:

| Группа параметров | Управляемый API | Описание |
|-------------------|-----------------|----------|
| `PreserveVideos`/`PreserveAudios` | `Extract` | управляет заполнением `Result.Videos`/`Result.Audios` |
| `IncludeVideos`/`IncludeAudios` | `ExtractAllLinks` | управляет включением видео-/аудио-URL в перечисление ссылок |

:::warning Они независимы
Отключение `PreserveVideos` не влияет на `IncludeVideos` в `ExtractAllLinks`, и наоборот. Настраивайте тот параметр, который соответствует используемому API.
:::

### Предустановка производительности TextOnlyConfig

Когда нужен только текст, `TextOnlyConfig()` уже отключает все параметры `Preserve*`, ручная настройка не требуется:

```go
cfg := html.TextOnlyConfig()
// PreserveImages = false
// PreserveLinks = false
// PreserveVideos = false
// PreserveAudios = false

result, err := html.Extract(data, cfg)
// Пропуск всех медиа, наилучшая производительность
```

## Следующие шаги

- [Извлечение контента на практике](./content-extraction) - процесс извлечения и распознавание статей
- [Форматы вывода на практике](./output-formats) - сравнение простого текста, Markdown и JSON
- [Справочник API: типы данных](../../api-reference/types/type-defs) - полные определения VideoInfo/AudioInfo
