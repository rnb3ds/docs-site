---
sidebar_label: "Форматы вывода"
title: "Форматы вывода - CyberGo html | Markdown и JSON"
description: "API форматов вывода CyberGo html: ExtractToMarkdown и ExtractToJSON — функции пакета и методы Processor для преобразования в Markdown/JSON."
sidebar_position: 1
---

# Форматы вывода

Библиотека HTML поддерживает вывод результатов извлечения в форматах Markdown или JSON.

## Вывод в Markdown

Извлечение HTML-контента и конвертация в формат Markdown. Внутренне устанавливает `InlineImageFormat` и `InlineLinkFormat` в значение `markdown` перед извлечением и возвращает итоговый `Result.Text`.

:::warning Особенности поведения кэша
`ExtractToMarkdown` не попадает в кэш и не записывает в кэш основного Processor. Он создаёт **временный Processor** через `buildFormatProcessor`:

- Делает **копию по значению** текущей конфигурации (`config` неизменяем после `New()`, поэтому копирование не требует блокировки), затем переопределяет два форматирующих поля — настройки формата не записываются обратно в общую конфигурацию
- **Отключает кэш** (`MaxCacheEntries = 0`): не читает и не пишет кэш основного Processor, чтобы избежать загрязнения основного кэша формат-специфичными результатами
- **Повторно использует Scorer** (оценщик) основного Processor, но с **независимым, отключённым сборщиком аудита**, чтобы `Close()` основного Processor не конкурировал с идущим извлечением
- Этот механизм потокобезопасен

Если нужно, чтобы извлечение проходило через кэш, используйте обычный `Extract` и настройте `InlineImageFormat`/`InlineLinkFormat` самостоятельно.
:::

### Функции пакета

```go
func ExtractToMarkdown(htmlBytes []byte, cfg ...Config) (string, error)
func ExtractToMarkdownFromFile(filePath string, cfg ...Config) (string, error)
func ExtractToMarkdownWithContext(ctx context.Context, htmlBytes []byte, cfg ...Config) (string, error)
func ExtractToMarkdownFromFileWithContext(ctx context.Context, filePath string, cfg ...Config) (string, error)
```

### Методы Processor

```go
func (p *Processor) ExtractToMarkdown(htmlBytes []byte) (string, error)
func (p *Processor) ExtractToMarkdownFromFile(filePath string) (string, error)
func (p *Processor) ExtractToMarkdownWithContext(ctx context.Context, htmlBytes []byte) (string, error)
func (p *Processor) ExtractToMarkdownFromFileWithContext(ctx context.Context, filePath string) (string, error)
```

### Пример

```go
package main

import (
	"fmt"
	"log"

	"github.com/cybergodev/html"
)

func main() {
	data := []byte(`<html><head><title>Пример документа</title></head><body>
<p>Абзац основного текста с изображением.</p>
<p><img src="/img/photo.png" alt="Пример картинки"></p>
<p>Посетите <a href="https://example.com">пример сайта</a>, чтобы узнать больше.</p>
</body></html>`)

	md, err := html.ExtractToMarkdown(data, html.MarkdownConfig())
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(md)
	// Вывод: Markdown-текст с изображением и ссылкой,
	//         например ![Пример картинки](/img/photo.png) и [пример сайта](https://example.com)
}
```

### Параметры форматирования

`ExtractToMarkdown` использует фиксированный формат `markdown`. Если нужны другие inline-форматы, используйте обычный `Extract` со следующими полями `Config`:

| Поле | Возможные значения | Эффект |
|------|--------|------|
| `InlineImageFormat` | `none` (по умолчанию) | Изображения не встраиваются в текст |
| | `markdown` | Вывод `![alt](url)` |
| | `html` | Вывод `<img src="url" alt="alt">` |
| | `placeholder` | Вывод плейсхолдера `[IMAGE:N]` |
| `InlineLinkFormat` | `none` (по умолчанию) | Ссылки не встраиваются в текст |
| | `markdown` | Вывод `[text](url)` |
| | `html` | Вывод `<a href="url">text</a>` |

### Механизм форматирования Markdown

Inline-изображения и ссылки реализуются через **замену плейсхолдеров** в два этапа:

1. **Этап извлечения текста**: каждый `<img>` вставляет в текстовый поток плейсхолдер `[IMAGE:N]`, а каждый `<a>` — пару `[LINK:N]...[/LINK]` (`N` — порядковый номер позиции, соответствующий `Position` в срезах `Images`/`Links`)
2. **Этап форматирования**: в зависимости от `InlineImageFormat`/`InlineLinkFormat` плейсхолдеры заменяются на целевой формат (markdown/html) или удаляются (none)

Чтобы буквальные `[`/`]` в исходном тексте не были ошибочно приняты за плейсхолдеры, на этапе извлечения они экранируются (`\[`, `\]`, `\\`), а на этапе форматирования восстанавливаются.

## Вывод в JSON

Сериализация результата извлечения в байты JSON. В отличие от Markdown, этот метод проходит через обычный `Extract` основного Processor (при включённом кэше — попадание/запись), а затем сериализуется через `json.Marshal`.

### Функции пакета

```go
func ExtractToJSON(htmlBytes []byte, cfg ...Config) ([]byte, error)
func ExtractToJSONFromFile(filePath string, cfg ...Config) ([]byte, error)
func ExtractToJSONWithContext(ctx context.Context, htmlBytes []byte, cfg ...Config) ([]byte, error)
func ExtractToJSONFromFileWithContext(ctx context.Context, filePath string, cfg ...Config) ([]byte, error)
```

### Методы Processor

```go
func (p *Processor) ExtractToJSON(htmlBytes []byte) ([]byte, error)
func (p *Processor) ExtractToJSONFromFile(filePath string) ([]byte, error)
func (p *Processor) ExtractToJSONWithContext(ctx context.Context, htmlBytes []byte) ([]byte, error)
func (p *Processor) ExtractToJSONFromFileWithContext(ctx context.Context, filePath string) ([]byte, error)
```

### Пример

```go
package main

import (
	"fmt"
	"log"

	"github.com/cybergodev/html"
)

func main() {
	data := []byte(`<html><head><title>Пример документа</title></head><body>
<p>Это абзац основного текста.</p>
<p><img src="/img/photo.png" alt="Пример картинки"></p>
<a href="https://example.com">пример сайта</a>
</body></html>`)

	jsonBytes, err := html.ExtractToJSON(data)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(string(jsonBytes))
	// Вывод: JSON-строка с полями text/title/images/links и т. д.
}
```

### Структура JSON-вывода

JSON-сериализация реализуется пользовательским методом `Result.MarshalJSON()`, соответствующим внутренней структуре `jsonResult`:

| JSON-поле | Тип | Источник |
|-----------|------|------|
| `text` | string | `Result.Text` (извлечённый текст) |
| `title` | string | `Result.Title` (заголовок документа) |
| `images` | array | `Result.Images` (`omitempty`, опускается при пустом) |
| `links` | array | `Result.Links` (`omitempty`) |
| `videos` | array | `Result.Videos` (`omitempty`) |
| `audios` | array | `Result.Audios` (`omitempty`) |
| `processing_time_ms` | int | `Result.ProcessingTime`, преобразованное в **миллисекунды** |
| `word_count` | int | `Result.WordCount` |
| `reading_time_ms` | int | `Result.ReadingTime`, преобразованное в **миллисекунды** |

Обратите внимание, что `ProcessingTime` и `ReadingTime` в структуре `Result` имеют тег `json:"-"` (стандартная сериализация их пропускает), а пользовательский `MarshalJSON` включает их в вывод в виде миллисекунд. Формат JSON предназначен для внешнего использования, **`UnmarshalJSON` не реализован**, поэтому десериализовать результат обратно в `Result` напрямую нельзя.

:::tip Result.MarshalJSON
`Result` реализует интерфейс `json.Marshaler`. Поля `ProcessingTime` и `ReadingTime` имеют тег `json:"-"` (стандартная сериализация их пропускает), но пользовательский метод `MarshalJSON()` включает их в вывод в виде миллисекунд.
:::
