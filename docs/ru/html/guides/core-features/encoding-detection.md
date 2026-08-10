---
sidebar_label: "Определение кодировки на практике"
title: "Определение кодировки - CyberGo html | автоопределение"
description: "Определение кодировки CyberGo html на практике: приоритет из 4 уровней, 15+ кодировок, Config.Encoding, статистический алгоритм, примеры GBK и Shift_JIS."
sidebar_position: 5
---

# Определение кодировки на практике

HTML-документы могут использовать различные кодировки символов (GBK, Shift_JIS, Windows-1252 и др.). Библиотека имеет встроенное автоматическое определение кодировки: она распознаёт кодировку по байтам HTML и конвертирует в UTF-8, поддерживая более 15 кодировок, без необходимости ручной обработки.

## Приоритет определения

Библиотека определяет входную кодировку в следующем порядке, перебирая варианты по очереди; срабатывает первый совпавший:

| Приоритет | Источник | Описание |
|-----------|----------|----------|
| ① наивысший | Ручное указание `Config.Encoding` | если не пусто — используется напрямую, весь автоанализ пропускается |
| ② | Объявление в meta-теге HTML | `<meta charset>` или `http-equiv="content-type"`, сканируются первые 1024 байта |
| ③ | Интеллектуальный статистический алгоритм | выборка до 10 КБ, принимается при доверии ≥ 80 |
| ④ резерв | UTF-8 | откат к UTF-8, если ничего не подошло |

```text
Config.Encoding не пусто? ── да ──→ используется напрямую
        │
        нет
        │
В meta объявлена кодировка? ── да ──→ использовать объявленное значение
        │
        нет
        │
Доверие статистики ≥ 80? ── да ──→ принять статистический результат
        │
        нет
        │
        └──→ UTF-8
```

:::tip Обнаружение BOM
Помимо четырёх описанных уровней, библиотека также проверяет BOM (метку порядка байтов): UTF-8 BOM (`EF BB BF`), UTF-16 LE BOM (`FF FE`), UTF-16 BE BOM (`FE FF`). При наличии BOM кодировка определяется напрямую.
:::

## Поддерживаемые кодировки

| Категория | Кодировки | Примечание |
|-----------|-----------|------------|
| Unicode | UTF-8, UTF-16LE, UTF-16BE | откат по умолчанию — UTF-8 |
| Западная Европа | Windows-1252, ISO-8859-1, ISO-8859-15 | ISO-8859-15 содержит символ евро |
| Центральная Европа | Windows-1250 | — |
| Кириллица | Windows-1251 | русский и др. |
| Упрощённый китайский | GBK | псевдоним `gb2312` автоматически нормализуется в `gbk` |
| Традиционный китайский | Big5 | — |
| Японский | Shift_JIS, EUC-JP | — |
| Корейский | EUC-KR | — |

### Нормализация псевдонимов кодировок

Имена кодировок и псевдонимы **не чувствительны к регистру** и автоматически нормализуются к каноническим именам:

| Входной псевдоним | Результат нормализации |
|-------------------|------------------------|
| `gb2312`, `GB2312` | `gbk` |
| `sjis`, `x-sjis`, `shift-jis` | `shift_jis` |
| `latin1`, `latin-1` | `iso-8859-1` |
| `utf8`, `utf_8` | `utf-8` |
| `8859-1`, `iso88591` | `iso-8859-1` |
| `cp1252`, `windows1252` | `windows-1252` |

## Пример автоопределения

HTML на китайском в кодировке GBK распознаётся автоматически через объявление в meta-теге:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
    "golang.org/x/text/encoding/simplifiedchinese"
)

func main() {
    // HTML на китайском в кодировке GBK (meta-тег объявляет charset=gbk)
    gbkHTML := `<html><head><meta charset="gbk">` +
        `<title>中文网页</title></head>` +
        `<body><article><h1>你好世界</h1>` +
        `<p>这是一段中文内容。</p></article></body></html>`

    // Кодируем UTF-8-строку в байты GBK (имитация реальной GBK-страницы)
    gbkBytes, err := simplifiedchinese.GBK.NewEncoder().Bytes([]byte(gbkHTML))
    if err != nil {
        log.Fatal(err)
    }

    // Автоопределение кодировки и извлечение (распознаёт GBK по meta charset, конвертирует в UTF-8 и извлекает)
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

## Ручное указание кодировки

Когда meta-тег отсутствует, содержит ошибочное объявление или результат автоопределения ненадёжен, кодировку можно принудительно задать через `Config.Encoding`:

```go
cfg := html.DefaultConfig()
cfg.Encoding = "gbk"

result, err := html.Extract(gbkBytes, cfg)
```

| Сценарий применения | Описание |
|---------------------|----------|
| Известна кодировка источника | кодировка получена из HTTP-заголовка `Content-Type`, прямое указание исключает ошибки определения |
| Отсутствует meta-тег | старые страницы без объявления `<meta charset>` |
| Ошибка автоопределения | недостаточное доверие статистического алгоритма, некорректный результат |

:::tip Приоритет Config.Encoding наивысший
После установки `Config.Encoding` библиотека полностью пропускает автоопределение и декодирует напрямую указанной кодировкой. Подходит для детерминированных сценариев, исключая неопределённость статистического анализа.
:::

### Автоопределение Shift_JIS на практике

Японские страницы часто используют кодировку Shift_JIS. Даже без объявления в meta статистический алгоритм способен её распознать:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
    "golang.org/x/text/encoding/japanese"
)

func main() {
    // HTML на японском в кодировке Shift_JIS (без объявления meta charset)
    sjisHTML := `<html><head><title>日本語ページ</title></head>` +
        `<body><article><h1>こんにちは</h1>` +
        `<p>東京の天気は晴れです。</p></article></body></html>`

    // Кодируем в байты Shift_JIS
    sjisBytes, err := japanese.ShiftJIS.NewEncoder().Bytes([]byte(sjisHTML))
    if err != nil {
        log.Fatal(err)
    }

    // Статистический алгоритм автоматически распознаёт Shift_JIS (анализирует распределение японских символов по выборке байтов)
    result, err := html.Extract(sjisBytes)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println("Заголовок:", result.Title)
    // Заголовок: 日本語ページ

    fmt.Println("Текст:", result.Text)
    // Текст: こんにちは
    //       東京の天気は晴れです。
}
```

### Ручное указание Windows-1252

Западноевропейскую кодировку (с символами вроде `é`, `€`) можно указать вручную:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
    "golang.org/x/text/encoding/charmap"
)

func main() {
    // Текст в западноевропейской кодировке Windows-1252
    winHTML := `<html><head><title>Café Menu</title></head>` +
        `<body><article><h1>Café</h1>` +
        `<p>Price: 100 €. Résumé available.</p></article></body></html>`

    winBytes, err := charmap.Windows1252.NewEncoder().Bytes([]byte(winHTML))
    if err != nil {
        log.Fatal(err)
    }

    // Явно указываем кодировку Windows-1252
    cfg := html.DefaultConfig()
    cfg.Encoding = "windows-1252"

    result, err := html.Extract(winBytes, cfg)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println("Заголовок:", result.Title)
    // Заголовок: Café Menu

    fmt.Println("Текст:", result.Text)
    // Текст: Café
    //       Price: 100 €. Résumé available.
}
```

## Ошибка определения кодировки

При сбое определения или преобразования кодировки (например, повреждённые данные, неподдерживаемая кодировка) возвращается оборачивающая ошибка (wrapping error):

```go
result, err := html.Extract(data)
if err != nil {
    if strings.Contains(err.Error(), "encoding detection failed") {
        // Сбой определения кодировки — откат к ручному указанию
        cfg := html.DefaultConfig()
        cfg.Encoding = "windows-1252"
        result, err = html.Extract(data, cfg)
        if err != nil {
            log.Fatal(err)
        }
    } else {
        log.Fatal(err)
    }
}
```

:::warning Формат сообщения об ошибке
Сообщение об ошибке при сбое определения кодировки всегда содержит префикс `"encoding detection failed"` — его можно искать через `strings.Contains`. При сбое рекомендуется откат к ручному указанию кодировки.
:::

## Записи аудита

При включённом аудите проблемы определения кодировки записываются как `AuditEventEncodingIssue` (уровень info):

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    cfg := html.DefaultConfig()
    cfg.Audit = html.DefaultAuditConfig()
    cfg.Audit.Enabled = true
    // LogEncodingIssues по умолчанию true (включено в DefaultAuditConfig)

    p, err := html.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer p.Close()

    // Обработка HTML (при проблемах с кодировкой автоматически пишется в журнал аудита)
    p.Extract([]byte(`<html><body><p>content</p></body></html>`))

    // Запрос событий кодировки из журнала аудита
    for _, entry := range p.GetAuditLog() {
        if entry.EventType == html.AuditEventEncodingIssue {
            fmt.Printf("[Проблема кодировки] %s\n", entry.Message)
        }
    }

    fmt.Println("Проверка событий кодировки завершена")
    // Проверка событий кодировки завершена
}
```

:::tip Условие срабатывания
`AuditEventEncodingIssue` записывается только при сбое определения или преобразования кодировки (например, неподдерживаемая кодировка и данные не являются корректным UTF-8). Корректные документы не порождают это событие. Проблемы с кодировкой относятся к уровню `info` (низший), что означает возможное неидеальное декодирование данных, не влияющее на безопасность. Чтобы отфильтровать их, используйте `LevelFilteredSink`, установив минимальный уровень `warning`.
:::

## Следующие шаги

- [Извлечение контента на практике](./content-extraction) - процесс извлечения и распознавание статей
- [Обработка ошибок](../error-handling) - сигнатурные ошибки и структурированная обработка ошибок
- [Справочник API: конфигурация](../../api-reference/core/config) - поле Encoding и все параметры конфигурации
