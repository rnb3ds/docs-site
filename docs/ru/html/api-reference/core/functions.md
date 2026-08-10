---
sidebar_label: "Функции пакета"
title: "Функции пакета - CyberGo html | синтаксис и примеры"
description: "Функции уровня пакета CyberGo html: Extract, ExtractText, ExtractToMarkdown. Используют sync.Pool для переиспользования Processor — для разовых вызовов."
sidebar_position: 1
---

# Функции пакета

Функции уровня пакета подходят для однократных вызовов, внутри используют `sync.Pool` для повторного использования Processor, не требуют ручного управления жизненным циклом. Примечание: пулируемый Processor отключает кэш и сохранение аудита; для кэша/статистики/аудита создайте отдельный Processor через [html.New](./processor).

## Внутренний механизм

:::info Пулинг-дизайн
Под функциями пакета находится `sync.Pool`, повторно использующий экземпляры `Processor` между вызовами и избегающий повторных аллокаций. Ключевые детали реализации:

- **Конфигурация пула отключает кэш**: конфигурация пула (`poolCfg`) базируется на `DefaultConfig()`, но явно обнуляет три кэш-поля — `MaxCacheEntries=0`, `CacheTTL=0`, `CacheCleanup=0`. Поэтому **функции пакета не могут использовать кэш**, каждый раз выполняется полная обработка. Так сделано потому, что пулируемый Processor при каждом возврате очищает кэш, и включение кэша лишь добавляло бы лишние расходы на хеширование и запись в map без единого попадания.
- **Сброс состояния при возврате**: перед возвратом Processor в пул после каждого вызова последовательно выполняются `ResetStatistics`, `audit.Wait()`, `ClearAuditLog`, `ClearCache` — это предотвращает утечку статистики, аудита и кэш-состояния между вызовами.
- **Закрытый Processor не возвращается в пул**: если Processor был закрыт во время использования (что является ошибкой применения), логика возврата просто отбрасывает его, не помещая обратно в пул (`sync.Pool` допускает отсутствие `Put`; при следующем `Get` `pool.New` пересоздаст экземпляр).
- **Защита от panic**: `pool.New` вызывает panic только при нарушении инвариантов библиотеки (`poolCfg` наследуется от `DefaultConfig()` и по построению корректен); этот panic перехватывается в `getPooledProcessorSafe`, упаковывается в `ErrInternalPanic` и возвращается, не выходя за пределы открытого API.
:::

## Разбор параметров конфигурации

Во всех функциях пакета `cfg ...Config` — необязательный вариативный параметр, обрабатываемый внутренней функцией `resolveConfig`:

| Переданный аргумент | Поведение | Через пул? |
|----------|------|:----------:|
| Не передан | Используется `DefaultConfig()` | Да (`pooled=true`) |
| Передан 1 | Используется переданный `Config` | **Нет** (`pooled=false`) |
| Передано ≥2 | Возвращается `ErrMultipleConfigs` | — |

:::warning Ключевое отличие
При передаче пользовательского `Config` **путь через `sync.Pool` не используется** — пул хранит только Processor на основе `DefaultConfig()` и не может безопасно повторно использовать экземпляры с другой конфигурацией. В этом случае каждый вызов создаёт временный Processor через `New`, который закрывается (`Close`) после использования. Для повторного использования пользовательской конфигурации в высокочастотных вызовах создавайте [Processor](./processor) напрямую.
:::

## Извлечение контента

### Extract

Извлекает контент из HTML-байтов и возвращает полный `Result`.

```go
func Extract(htmlBytes []byte, cfg ...Config) (*Result, error)
```

**Параметры**:

| Параметр | Тип | Описание |
|------|------|------|
| `htmlBytes` | `[]byte` | HTML-контент |
| `cfg` | `...Config` | Необязательная конфигурация, максимум одна |

**Пример**:

```go
result, err := html.Extract(data)
if err != nil {
    log.Fatal(err)
}
fmt.Println(result.Title, result.Text)
```

Полный исполняемый пример (демонстрирует доступ к полям и обработку ошибок):

```go
package main

import (
	"fmt"
	"log"

	"github.com/cybergodev/html"
)

func main() {
	data := []byte(`<html><head><title>Пример страницы</title></head>
<body><h1>Добро пожаловать</h1><p>Основной текст<a href="https://example.com">ссылка</a>.</p></body></html>`)

	// Config не передаётся — путь через пул
	result, err := html.Extract(data)
	if err != nil {
		log.Fatalf("Ошибка извлечения: %v", err)
	}

	fmt.Println("Заголовок:", result.Title)
	fmt.Println("Слов:", result.WordCount)
	fmt.Println("Ссылок:", len(result.Links))
	// Вывод:
	// Заголовок: Пример страницы
	// Слов: 4
	// Ссылок: 1
}
```

**Возвращаемые ошибки**: `Extract` возвращает те же ошибки, что и [Processor.Extract](./processor#ошибки-возврата), а также может дополнительно вернуть:

| Ошибка | Условие |
|------|------|
| `ErrMultipleConfigs` | Передано 2 и более `Config` |
| `ErrInvalidConfig` (обёрнутый в `*ConfigError`) | Переданный `Config` не прошёл проверку (например, `MaxInputSize<=0`) |

### ExtractFromFile

Извлекает контент из HTML-файла.

```go
func ExtractFromFile(filePath string, cfg ...Config) (*Result, error)
```

**Возвращаемые ошибки**: помимо ошибок `Extract`, при доступе к файлу может возвращаться `*FileError`, обёрнутое в `ErrFileNotFound`, `ErrInvalidFilePath` или отказ из-за обхода пути (см. `AllowedBaseDir` в [Защита безопасности](../modules/security)).

## Извлечение текста

### ExtractText

Извлекает только чистый текст.

```go
func ExtractText(htmlBytes []byte, cfg ...Config) (string, error)
```

### ExtractTextFromFile

Извлекает чистый текст из файла.

```go
func ExtractTextFromFile(filePath string, cfg ...Config) (string, error)
```

## Версии с контекстом

Все функции имеют версии с `context.Context` для управления отменой и тайм-аутом:

| Функция | Сигнатура |
|------|------|
| `ExtractWithContext` | `(ctx context.Context, htmlBytes []byte, cfg ...Config) (*Result, error)` |
| `ExtractFromFileWithContext` | `(ctx context.Context, filePath string, cfg ...Config) (*Result, error)` |
| `ExtractTextWithContext` | `(ctx context.Context, htmlBytes []byte, cfg ...Config) (string, error)` |
| `ExtractTextFromFileWithContext` | `(ctx context.Context, filePath string, cfg ...Config) (string, error)` |

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

result, err := html.ExtractWithContext(ctx, data)
```

## Форматы вывода

| Функция | Сигнатура | Описание |
|------|------|------|
| `ExtractToMarkdown` | `(htmlBytes []byte, cfg ...Config) (string, error)` | HTML → Markdown |
| `ExtractToMarkdownFromFile` | `(filePath string, cfg ...Config) (string, error)` | Файл → Markdown |
| `ExtractToMarkdownWithContext` | `(ctx context.Context, htmlBytes []byte, cfg ...Config) (string, error)` | С контекстом |
| `ExtractToMarkdownFromFileWithContext` | `(ctx context.Context, filePath string, cfg ...Config) (string, error)` | Файл + контекст |
| `ExtractToJSON` | `(htmlBytes []byte, cfg ...Config) ([]byte, error)` | HTML → JSON |
| `ExtractToJSONFromFile` | `(filePath string, cfg ...Config) ([]byte, error)` | Файл → JSON |
| `ExtractToJSONWithContext` | `(ctx context.Context, htmlBytes []byte, cfg ...Config) ([]byte, error)` | С контекстом |
| `ExtractToJSONFromFileWithContext` | `(ctx context.Context, filePath string, cfg ...Config) ([]byte, error)` | Файл + контекст |

Подробное использование и примеры см. в [Форматы вывода](../modules/output).

## Извлечение ссылок

| Функция | Сигнатура | Описание |
|------|------|------|
| `ExtractAllLinks` | `(htmlBytes []byte, cfg ...Config) ([]LinkResource, error)` | Извлечение всех ссылок |
| `ExtractAllLinksFromFile` | `(filePath string, cfg ...Config) ([]LinkResource, error)` | Извлечение ссылок из файла |
| `ExtractAllLinksWithContext` | `(ctx context.Context, htmlBytes []byte, cfg ...Config) ([]LinkResource, error)` | С контекстом |
| `ExtractAllLinksFromFileWithContext` | `(ctx context.Context, filePath string, cfg ...Config) ([]LinkResource, error)` | Файл + контекст |

Подробное использование и примеры см. в [Извлечение ссылок](../modules/links).

## Пакетная обработка

| Функция | Сигнатура | Описание |
|------|------|------|
| `ExtractBatch` | `(htmlContents [][]byte, cfg ...Config) *BatchResult` | Пакетное извлечение |
| `ExtractBatchWithContext` | `(ctx context.Context, htmlContents [][]byte, cfg ...Config) *BatchResult` | С контекстом |
| `ExtractBatchFiles` | `(filePaths []string, cfg ...Config) *BatchResult` | Пакетное извлечение из файлов |
| `ExtractBatchFilesWithContext` | `(ctx context.Context, filePaths []string, cfg ...Config) *BatchResult` | Файлы + контекст |

Подробное использование и примеры см. в [Пакетная обработка](../modules/batch).

## Функции пакета против Processor

Оба подхода внутри вызывают `Processor`, но существенно различаются по повторному использованию ресурсов и сохранению состояния:

| Аспект | Функции пакета | [Processor](./processor) |
|------|--------|--------------------------|
| Кэш | **Нет** (конфигурация пула `MaxCacheEntries=0`) | Есть (при попадании возвращается глубокая копия) |
| Статистика | Сбрасывается каждый раз (`ResetStatistics` при возврате) | Накапливается, доступна через `GetStatistics` |
| Журнал аудита | Очищается каждый раз (`ClearAuditLog` при возврате) | Накапливается, доступен через `GetAuditLog` |
| Пользовательский `Config` | Каждый раз создаётся и уничтожается временный Processor | Повторно используется один экземпляр |
| Жизненный цикл | Автоматическое управление (пул / временный экземпляр) | Требуется ручной `defer Close()` |
| Сценарий применения | Однократные вызовы, скрипты, низкочастотные запросы | Высокочастотные вызовы, долго живущие сервисы, требуется кэш |

:::tip Рекомендация по выбору
Для однократного извлечения или редких вызовов удобнее всего функции пакета; если нужно многократно извлекать данные в цикле, HTTP handler или пакетной обработке, создайте долго живущий `Processor` и используйте его повторно — кэш может значительно снизить накладные расходы.
:::
