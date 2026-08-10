---
sidebar_label: "Извлечение ссылок"
title: "Извлечение ссылок - CyberGo html | ресурсы и ссылки"
description: "API извлечения ссылок CyberGo html: ExtractAllLinks и GroupLinksByType — сбор ресурсов и группировка по типам с настраиваемой фильтрацией."
sidebar_position: 2
---

# Извлечение ссылок

Независимый API извлечения ссылок, позволяющий извлекать все ссылочные ресурсы из HTML и группировать их по типам.

:::tip Ключевое отличие от Extract
`ExtractAllLinks` **не применяет HTML-санирование** (`EnableSanitization` здесь не действует), поэтому ссылки на ресурсы в тегах `<script src>`, `<iframe>`, `<link>` и `<embed>` также извлекаются полностью. Это сделано, чтобы такие ссылки можно было перечислить — в пути `Extract` они обычно удаляются при санировании.
:::

:::info Сортировка и дедупликация результатов
`ExtractAllLinks` возвращает результаты, **отсортированные по URL по возрастанию** и дедуплицированные по URL. Поэтому повторные вызовы для одного и того же входа дают идентичный результат (начиная с v1.4.2), что упрощает сравнение, повторное использование кэша и воспроизводимую последующую обработку. Если один URL встречается в нескольких тегах, сохраняется только одна запись.
:::

## Функции пакета

```go
func ExtractAllLinks(htmlBytes []byte, cfg ...Config) ([]LinkResource, error)
func ExtractAllLinksFromFile(filePath string, cfg ...Config) ([]LinkResource, error)
func ExtractAllLinksWithContext(ctx context.Context, htmlBytes []byte, cfg ...Config) ([]LinkResource, error)
func ExtractAllLinksFromFileWithContext(ctx context.Context, filePath string, cfg ...Config) ([]LinkResource, error)
```

## Методы Processor

```go
func (p *Processor) ExtractAllLinks(htmlBytes []byte) ([]LinkResource, error)
func (p *Processor) ExtractAllLinksFromFile(filePath string) ([]LinkResource, error)
func (p *Processor) ExtractAllLinksWithContext(ctx context.Context, htmlBytes []byte) ([]LinkResource, error)
func (p *Processor) ExtractAllLinksFromFileWithContext(ctx context.Context, filePath string) ([]LinkResource, error)
```

## Инструмент группировки

### GroupLinksByType

Группировка ссылок по типу.

```go
func GroupLinksByType(links []LinkResource) map[string][]LinkResource
```

```go
links, _ := html.ExtractAllLinks(data)
groups := html.GroupLinksByType(links)

for typ, items := range groups {
    fmt.Printf("Тип %s: %d шт.\n", typ, len(items))
}
```

## LinkResource

```go
type LinkResource struct {
    URL   string // Адрес ссылки
    Title string // Заголовок ссылки
    Type  string // Тип ссылки (link, image, video, audio, media, css, js, icon)
}
```

## Подробное описание типов ссылок

Каждое значение `Type` соответствует определённым HTML-тегам-источникам:

| Значение Type | HTML-тег-источник | Управляющий переключатель |
|---------|---------------|----------|
| `link` | `<a href>` | `IncludeContentLinks` / `IncludeExternalLinks` |
| `image` | `<img src>` | `IncludeImages` |
| `video` | `<video src>`, `<source type="video/*">`, `<iframe>`/`<embed>`/`<object>` (видео-URL) | `IncludeVideos` |
| `audio` | `<audio src>`, `<source type="audio/*">` | `IncludeAudios` |
| `media` | `<source>`, когда невозможно определить video/audio | `IncludeVideos` / `IncludeAudios` |
| `css` | `<link rel="stylesheet">` | `IncludeCSS` |
| `js` | `<script src>` | `IncludeJS` |
| `icon` | `<link rel="icon">`, `<link rel="apple-touch-icon">` и др. | `IncludeIcons` |

:::info Особая обработка embed-ссылок
`src`/`data` у `<iframe>`, `<embed>`, `<object>` извлекаются только тогда, когда они определяются как **видео-URL** (включая встраивание YouTube, Vimeo, Dailymotion и др.), тип фиксируется как `video`. Не-видео URL не попадают в результат.
:::

## Конфигурация

Поведение извлечения ссылок настраивается через поля фильтрации ссылок в `Config`:

```go
cfg := html.DefaultConfig()
cfg.IncludeImages = true
cfg.IncludeCSS = true
cfg.IncludeJS = true
cfg.IncludeExternalLinks = true
cfg.ResolveRelativeURLs = true
cfg.BaseURL = "https://example.com"
```

### Разрешение относительных URL

Когда `ResolveRelativeURLs=true` (по умолчанию), все типы относительных URL разрешаются в абсолютные на основе `BaseURL` единообразно:

- Логика разрешения централизована в `resolveURLIfEnabled` и **одинаково** обрабатывает контентные ссылки, изображения, медиа, source, script, embed и link-теги
- Явное задание `BaseURL` **пропускает автоопределение** и напрямую использует значение, предоставленное вызывающей стороной
- Если `BaseURL` пуст, а `ResolveRelativeURLs=true`, BaseURL автоматически выводится из документа (см. подсказку ниже)

### Внутренние и внешние ссылки

Контентные ссылки (`<a href>`) управляются двумя группами переключателей — отдельно для внутренних и внешних ссылок:

| Переключатель | Область управления | Способ определения |
|------|----------|----------|
| `IncludeContentLinks` | Внутренние ссылки | URL является относительным путём или расположен в том же домене, что и `BaseURL` |
| `IncludeExternalLinks` | Внешние ссылки | URL является абсолютным путём и расположен в другом домене, отличном от `BaseURL` (`IsDifferentDomain`) |

По умолчанию оба значения `true` (извлекаются все контентные ссылки). Остальные типы ресурсов (изображения, CSS, JS и т. д.) не подчиняются разделению внутренние/внешние и управляются только соответствующими переключателями `Include*`.

### Обработка preload / prefetch

`<link rel="preload" as="...">` и `rel="prefetch"` маршрутизируются в разные типы в зависимости от атрибута `as`:

| Значение `as` | Тип | Управляющий переключатель |
|-------------|----------|----------|
| `style` | `css` | `IncludeCSS` |
| `script` | `js` | `IncludeJS` |
| `image` | `image` | `IncludeImages` |
| `video` | `video` | `IncludeVideos` |
| `audio` | `audio` | `IncludeAudios` |

`dns-prefetch` и `preconnect` проходят через ту же маршрутизацию, но обычно не содержат атрибут `as`, поэтому не попадают в результат.

:::tip Автоопределение BaseURL
Если `ResolveRelativeURLs=true` и `BaseURL` **пуст**, библиотека автоматически выводит BaseURL из самого HTML-документа, перебирая следующие источники **в порядке приоритета** и возвращая первое совпадение:

1. тег `<base href>`;
2. `content` из `<meta property="og:url">` или `<meta property="canonical">`;
3. `<link rel="canonical" href>`;
4. первый абсолютный URL, встречающийся в документе (base извлекается из его `href`/`src`).

Явное задание `BaseURL` **пропускает автоопределение** и использует значение, предоставленное вызывающей стороной.
:::

## Пример

```go
package main

import (
	"fmt"
	"log"

	"github.com/cybergodev/html"
)

func main() {
	data := []byte(`<html><head>
<link rel="stylesheet" href="/css/main.css">
<link rel="icon" href="/favicon.ico">
<script src="/js/app.js"></script>
</head><body>
<a href="/about">О нас</a>
<img src="/img/logo.png" alt="Logo">
<video src="/media/intro.mp4"></video>
</body></html>`)

	cfg := html.DefaultConfig()
	cfg.BaseURL = "https://example.com"
	links, err := html.ExtractAllLinks(data, cfg)
	if err != nil {
		log.Fatal(err)
	}

	// Группировка по типам и построчный вывод
	groups := html.GroupLinksByType(links)
	for typ, items := range groups {
		fmt.Printf("%s (%d шт.):\n", typ, len(items))
		for _, l := range items {
			fmt.Printf("  - %s [%s]\n", l.URL, l.Title)
		}
	}
}
```
