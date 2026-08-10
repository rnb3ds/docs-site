---
sidebar_label: "Конфигурация на практике"
title: "Конфигурация на практике - CyberGo html | выбор полей Config"
description: "Конфигурация CyberGo html на практике: четыре предустановки, шесть групп полей, типовые комбинации и проверка через Validate для новичков."
sidebar_position: 6
---

# Конфигурация на практике

Структура `Config` содержит более 30 полей, но для повседневной работы достаточно понимать несколько ключевых групп настроек. Это руководство поможет быстро выбрать подходящую конфигурацию для вашего сценария. Полное описание всех полей см. в [Справочнике API — Конфигурация](../../api-reference/core/config).

## Четыре предустановленные конфигурации

Библиотека предоставляет четыре предустановки, охватывающие большинство сценариев:

| Предустановка | Сценарий применения | Ключевые отличия |
|------|----------|----------|
| `DefaultConfig()` | Универсальное извлечение | Все функции включены, безопасные значения по умолчанию |
| `HighSecurityConfig()` | Недоверенный ввод | Ограниченные лимиты, включён аудит, снижена максимальная глубина |
| `TextOnlyConfig()` | Только чистый текст | Отключено сохранение всех медиа, максимальная производительность |
| `MarkdownConfig()` | Вывод в Markdown | Инлайн-изображения/ссылки преобразуются в формат Markdown |

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    data := []byte(`<html><body><h1>Заголовок</h1><p>Основной текст</p></body></html>`)

    // Большинство сценариев: использовать конфигурацию по умолчанию
    p1, _ := html.New()
    defer p1.Close()
    r1, _ := p1.Extract(data)
    fmt.Println(r1.Title)

    // Нужен только чистый текст (например, для индексации поисковыми системами)
    p2, _ := html.New(html.TextOnlyConfig())
    defer p2.Close()

    // Вывод в Markdown (например, для миграции CMS)
    p3, _ := html.New(html.MarkdownConfig())
    defer p3.Close()
    md, _ := p3.ExtractToMarkdown(data)
    fmt.Println(md)
}
```

:::tip Подсказка Начните с предустановки
Если не уверены, начните с `DefaultConfig()` и при необходимости скорректируйте отдельные поля. Предустановки можно комбинировать — возьмите одну, а затем переопределите нужные поля:
:::

<!-- check-code: skip -->
```go
cfg := html.HighSecurityConfig()
cfg.PreserveImages = false // Дополнительно отключить изображения поверх высокой безопасности
processor, _ := html.New(cfg)
```

## Обзор шести групп полей

### Управление ресурсами

Управление использованием памяти и производительностью. При повседневной разработке обычно не требуется настройка.

| Поле | Значение по умолчанию | Описание |
|------|--------|------|
| `MaxInputSize` | 50 МБ | Максимальный размер ввода, предотвращает исчерпание памяти |
| `MaxCacheEntries` | 2000 | Максимальное количество записей в кэше; 0 отключает кэш |
| `CacheTTL` | 1 час | Время жизни записей кэша |
| `CacheCleanup` | 5 минут | Интервал фоновой очистки устаревшего кэша |
| `WorkerPoolSize` | 4 | Уровень параллелизма для пакетной обработки (1–256) |
| `ProcessingTimeout` | 30 секунд | Тайм-аут обработки одного документа; 0 — без ограничения |

:::warning Предупреждение Кэш действует только для экземпляра Processor
Функции уровня пакета (например, `html.Extract`) используют Processor из пула и очищают кэш после каждого вызова. Для использования кэша создайте отдельный Processor через `html.New()`. Подробнее см. в [Повторное использование Processor и кэш](../performance/processor-cache).
:::

### Безопасность

Конфигурация безопасности — ключевой аспект для производственных сред. Полное описание возможностей безопасности см. в [Обзоре безопасности](../security/).

| Поле | Значение по умолчанию | Описание |
|------|--------|------|
| `EnableSanitization` | `true` | Санитизация HTML (удаление опасных тегов/атрибутов) |
| `MaxDepth` | 500 | Максимальная глубина вложенности DOM, предотвращает переполнение стека |
| `AllowedBaseDir` | `""` | Каталог-песочница для файловых операций; пусто = без ограничений |
| `Audit` | отключено | Конфигурация журнала аудита безопасности |

:::warning Предупреждение AllowedBaseDir
При обработке пользовательских путей к файлам обязательно устанавливайте `AllowedBaseDir`. Он определяет реальный путь через дескрипторы файлов ОС (защита от обхода через символические ссылки и Windows junction).
:::

### Извлечение контента

Управление тем, какое содержимое извлекается из HTML.

| Поле | Значение по умолчанию | Описание |
|------|--------|------|
| `ExtractArticle` | `true` | Интеллектуальное распознавание статей (автоматическое определение основного контента) |
| `PreserveImages` | `true` | Сохранять информацию об изображениях |
| `PreserveLinks` | `true` | Сохранять информацию о ссылках |
| `PreserveVideos` | `true` | Извлекать видео |
| `PreserveAudios` | `true` | Извлекать аудио |

Отключение неиспользуемых типов медиа может повысить производительность:

<!-- check-code: skip -->
```go
cfg := html.DefaultConfig()
cfg.PreserveVideos = false
cfg.PreserveAudios = false
// Извлекать только текст, изображения и ссылки
```

### Форматы вывода

Управление тем, как изображения и ссылки отображаются в текстовом выводе. Подробнее см. в [Форматах вывода на практике](./output-formats).

| Поле | Значение по умолчанию | Допустимые значения |
|------|--------|--------|
| `InlineImageFormat` | `"none"` | `"none"`, `"markdown"`, `"html"`, `"placeholder"` |
| `InlineLinkFormat` | `"none"` | `"none"`, `"markdown"`, `"html"` |
| `TableFormat` | `"markdown"` | `"markdown"`, `"html"` |
| `Encoding` | `""` (авто) | `"utf-8"`, `"gbk"`, `"shift_jis"`, `"windows-1252"` и др. |

Если `Encoding` оставить пустым, кодировка определяется автоматически. Указание вручную пропускает этап определения и повышает производительность, но используйте это только при уверенности в кодировке. Подробнее см. в [Определении кодировки на практике](./encoding-detection).

### Извлечение ссылок

Следующие поля действуют только в `ExtractAllLinks` и управляют тем, какие типы ссылок на ресурсы извлекаются. Подробнее см. в [Извлечении ссылок на практике](./link-extraction).

| Поле | Значение по умолчанию | Описание |
|------|--------|------|
| `ResolveRelativeURLs` | `true` | Преобразовывать относительные URL в абсолютные |
| `BaseURL` | `""` | База для разрешения; пусто — автоопределение из HTML |
| `IncludeImages` | `true` | Включать ссылки `<img>` |
| `IncludeVideos` | `true` | Включать ссылки `<video>`/`<iframe>` |
| `IncludeAudios` | `true` | Включать ссылки `<audio>` |
| `IncludeCSS` | `true` | Включать `<link rel="stylesheet">` |
| `IncludeJS` | `true` | Включать `<script src>` |
| `IncludeContentLinks` | `true` | Включать внутренние ссылки `<a href>` |
| `IncludeExternalLinks` | `true` | Включать внешние ссылки |
| `IncludeIcons` | `true` | Включать favicon/значки |

:::tip Подсказка Извлечение ссылок против извлечения контента
Поля `Include*` влияют только на `ExtractAllLinks`. Сохранение ссылок при извлечении контента (`Extract`) управляется полем `PreserveLinks`.
:::

### Расширения

| Поле | Описание |
|------|------|
| `Scorer` | Пользовательский оценщик контента; nil — используется DefaultScorer |

Пользовательский Scorer позволяет оптимизировать распознавание статей для конкретных сайтов. Подробнее см. в [Тестировании и пользовательских расширениях](../integration/testing-custom).

## Типовые комбинации конфигурации

### Веб-сканер

Высокочастотный массовый сбор данных: увеличьте параллелизм и сократите тайм-аут:

```go
package main

import (
    "log"
    "time"

    "github.com/cybergodev/html"
)

func main() {
    cfg := html.DefaultConfig()
    cfg.WorkerPoolSize = 8                          // Повысить параллелизм пакетной обработки
    cfg.ProcessingTimeout = 10 * time.Second        // Сократить тайм-аут
    cfg.PreserveVideos = false                      // Сканеру не нужны видео
    cfg.PreserveAudios = false

    processor, err := html.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer processor.Close()

    // Пакетное извлечение
    pages := [][]byte{[]byte("<html><body>Страница1</body></html>")}
    batch := processor.ExtractBatch(pages)
    log.Printf("Успешно %d, с ошибками %d", batch.Success, batch.Failed)
}
```

### API-бэкенд

Обработка HTML, отправленного пользователями: используйте конфигурацию высокой безопасности и ограничьте файловый каталог:

```go
package main

import (
    "log"

    "github.com/cybergodev/html"
)

func main() {
    cfg := html.HighSecurityConfig()
    cfg.AllowedBaseDir = "/var/www/uploads" // Ограничить файловый каталог

    processor, err := html.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer processor.Close()

    // Обработка HTML-файлов, загруженных пользователями
    result, err := processor.ExtractFromFile("/var/www/uploads/user.html")
    if err != nil {
        log.Fatal(err)
    }
    log.Println(result.Title)
}
```

### Инструмент миграции контента

Преобразование HTML старого сайта в Markdown с сохранением ссылок и разрешением относительных URL:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    cfg := html.MarkdownConfig()
    cfg.ResolveRelativeURLs = true
    cfg.BaseURL = "https://old-site.example.com"

    processor, err := html.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer processor.Close()

    data := []byte(`<html><body><article><h1>Старая статья</h1><a href="/post/123">ссылка</a></article></body></html>`)
    md, err := processor.ExtractToMarkdown(data)
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(md)
}
```

## Validate

Все конфигурации автоматически проверяются при передаче в `html.New()`. Можно также вызвать `Validate()` вручную для предварительной проверки:

<!-- check-code: skip -->
```go
cfg := html.DefaultConfig()
cfg.MaxInputSize = -1 // Намеренно задать ошибочное значение
if err := cfg.Validate(); err != nil {
    log.Fatal(err) // html: invalid config: MaxInputSize=-1, must be positive
}
```

Правила валидации включают проверку диапазонов полей и строк форматов. При недопустимой конфигурации возвращается `*ConfigError`, который можно определить через `errors.Is(err, html.ErrInvalidConfig)`. Полные ограничения полей см. в [Справочнике API — Конфигурация](../../api-reference/core/config).
