---
sidebar_label: "Продвинутые примеры"
title: "Продвинутые примеры - CyberGo html | сценарии"
description: "Продвинутые примеры CyberGo html: пользовательский Scorer, многокомпонентный конвейер аудита, пакетная обработка, пул Processor и мониторинг."
sidebar_position: 2
---

# Продвинутые примеры

## Пользовательский Scorer

Настройка логики распознавания контента под структуру конкретного сайта. Полную реализацию см. в [Тестирование и пользовательские расширения](../guides/integration/testing-custom), ниже показано базовое использование:

```go
package main

import (
    "fmt"
    "log"
    "strings"

    "github.com/cybergodev/html"
)

// Реализация пользовательского Scorer (полный пример см. в guides/testing-custom)
type myScorer struct{}

func (s myScorer) Score(node html.ContentNode) int {
    if node == nil {
        return 0
    }
    class := node.AttrValue("class")
    if strings.Contains(class, "article") || strings.Contains(class, "post") {
        return 100
    }
    if strings.Contains(class, "sidebar") || strings.Contains(class, "comment") {
        return -50
    }
    return 0
}

func (s myScorer) ShouldRemove(node html.ContentNode) bool {
    switch node.Data() {
    case "nav", "footer", "header":
        return true
    }
    return false
}

func main() {
    cfg := html.DefaultConfig()
    cfg.Scorer = myScorer{}

    p, err := html.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer p.Close()

    data := []byte(`<html><body>
        <nav><a href="/">Главная</a></nav>
        <article class="post-content">
            <h1>Глубокое понимание параллелизма в Go</h1>
            <p>goroutine — это легковесный поток Go.</p>
        </article>
        <aside class="sidebar">Рекомендуемое чтение</aside>
    </body></html>`)

    result, err := p.Extract(data)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println("Текст:", result.Text)
    // Текст: Глубокое понимание параллелизма в Go
    //
    // goroutine — это легковесный поток Go.
}
```

## Конвейер аудита с несколькими Sink

Построение многоуровневого конвейера аудита: события critical записываются в отдельный файл, все события одновременно выводятся в журнал.

```go
package main

import (
    "fmt"
    "log"
    "os"

    "github.com/cybergodev/html"
)

func main() {
    // Создание целей вывода
    allFile, _ := os.Create("audit-all.jsonl")
    criticalFile, _ := os.Create("audit-critical.jsonl")
    defer allFile.Close()
    defer criticalFile.Close()

    // Построение многоуровневого конвейера
    allSink := html.NewWriterAuditSink(allFile)
    criticalSink := html.NewFilteredSink(
        html.NewWriterAuditSink(criticalFile),
        func(e html.AuditEntry) bool {
            return e.Level == html.AuditLevelCritical
        },
    )
    loggerSink := html.NewLoggerAuditSink()

    pipeline := html.NewMultiSink(allSink, criticalSink, loggerSink)

    // Конфигурация
    cfg := html.HighSecurityConfig()
    cfg.Audit = html.HighSecurityAuditConfig()
    cfg.Audit.Sink = pipeline

    p, err := html.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer p.Close()

    // Обработка контента
    data := []byte(`<html><body>
        <script>alert('xss')</script>
        <article><p>Безопасный контент</p></article>
    </body></html>`)

    result, err := p.Extract(data)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println("Текст:", result.Text)
    // Журнал аудита автоматически записывается в файлы и stderr
}
```

## Пакетная обработка файлов

Пакетная обработка HTML-файлов в каталоге, сбор результатов и ошибок:

```go
package main

import (
    "fmt"
    "os"
    "path/filepath"

    "github.com/cybergodev/html"
)

func main() {
    // Сбор путей к файлам
    var files []string
    filepath.Walk("./pages", func(path string, info os.FileInfo, err error) error {
        if err != nil {
            return nil
        }
        if filepath.Ext(path) == ".html" || filepath.Ext(path) == ".htm" {
            files = append(files, path)
        }
        return nil
    })

    fmt.Printf("Обнаружено файлов: %d\n", len(files))

    // Пакетная обработка
    p, _ := html.New(html.TextOnlyConfig())
    defer p.Close()

    // Лимит одной партии — 10 000; при превышении падает вся партия, вызывающая сторона должна разбивать сама
    batch := p.ExtractBatchFiles(files)

    fmt.Printf("Успешно: %d, Неудачно: %d, Отменено: %d\n",
        batch.Success, batch.Failed, batch.Cancelled)

    // Обработка результатов
    for i, result := range batch.Results {
        if result != nil {
            fmt.Printf("[%d] %s (слов: %d)\n", i, result.Title, result.WordCount)
        }
    }

    // Проверка ошибок
    for i, err := range batch.Errors {
        if err != nil {
            fmt.Printf("[%d] Ошибка: %v\n", i, err)
        }
    }
}
```

## Повторное использование Processor с тайм-аутом

Паттерн Singleton Processor в сценарии веб-сервиса:

```go
package main

import (
    "context"
    "encoding/json"
    "fmt"
    "log"
    "net/http"
    "time"

    "github.com/cybergodev/html"
)

var processor *html.Processor

func init() {
    cfg := html.DefaultConfig()
    cfg.MaxCacheEntries = 5000
    cfg.CacheTTL = 30 * time.Minute
    cfg.ProcessingTimeout = 10 * time.Second

    var err error
    processor, err = html.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
}

func extractHandler(w http.ResponseWriter, r *http.Request) {
    ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
    defer cancel()

    data := []byte(r.FormValue("html"))
    if len(data) == 0 {
        http.Error(w, "html field required", http.StatusBadRequest)
        return
    }

    result, err := processor.ExtractWithContext(ctx, data)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(result)
}

func statsHandler(w http.ResponseWriter, r *http.Request) {
    stats := processor.GetStatistics()
    fmt.Fprintf(w, "Обработано: %d\nПопаданий в кэш: %d\nОшибок: %d\n",
        stats.TotalProcessed, stats.CacheHits, stats.ErrorCount)
}

func main() {
    defer processor.Close()

    http.HandleFunc("/extract", extractHandler)
    http.HandleFunc("/stats", statsHandler)
    log.Fatal(http.ListenAndServe(":8080", nil))
}
```

## Извлечение и генерация Markdown-файлов

Извлечение контента из HTML-страниц и сохранение в виде Markdown-файлов:

```go
package main

import (
    "fmt"
    "log"
    "os"
    "strings"

    "github.com/cybergodev/html"
)

func main() {
    p, err := html.New(html.MarkdownConfig())
    if err != nil {
        log.Fatal(err)
    }
    defer p.Close()

    urls := []string{
        "downloaded/page1.html",
        "downloaded/page2.html",
        "downloaded/page3.html",
    }

    for _, path := range urls {
        md, err := p.ExtractToMarkdownFromFile(path)
        if err != nil {
            log.Printf("Ошибка обработки %s: %v", path, err)
            continue
        }

        // Генерация имени выходного файла
        outPath := strings.Replace(path, ".html", ".md", 1)
        if err := os.WriteFile(outPath, []byte(md), 0644); err != nil {
            log.Printf("Ошибка записи %s: %v", outPath, err)
            continue
        }
        fmt.Printf("%s -> %s\n", path, outPath)
    }
}
```

## Отмена контекста и корректное завершение

Использование context для управления тайм-аутом извлечения в HTTP-сервисе с поддержкой отмены на уровне запроса:

```go
package main

import (
    "context"
    "errors"
    "fmt"
    "log"
    "net/http"
    "os"
    "os/signal"
    "syscall"
    "time"

    "github.com/cybergodev/html"
)

var processor *html.Processor

func init() {
    cfg := html.DefaultConfig()
    cfg.ProcessingTimeout = 10 * time.Second
    cfg.MaxCacheEntries = 5000
    var err error
    processor, err = html.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
}

func extractHandler(w http.ResponseWriter, r *http.Request) {
    // Тайм-аут на уровне запроса (5 с), суммируется с ProcessingTimeout (10 с) — срабатывает тот, что раньше
    ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
    defer cancel()

    body := make([]byte, 0)
    buf := make([]byte, 4096)
    for {
        n, err := r.Body.Read(buf)
        body = append(body, buf[:n]...)
        if err != nil {
            break
        }
        if len(body) > 10*1024*1024 {
            http.Error(w, "Тело запроса слишком велико", http.StatusRequestEntityTooLarge)
            return
        }
    }

    result, err := processor.ExtractWithContext(ctx, body)
    if err != nil {
        switch {
        case errors.Is(err, html.ErrProcessingTimeout):
            http.Error(w, "Тайм-аут обработки", http.StatusGatewayTimeout)
        case errors.Is(err, html.ErrInputTooLarge):
            http.Error(w, "Ввод слишком большой", http.StatusRequestEntityTooLarge)
        default:
            http.Error(w, err.Error(), http.StatusInternalServerError)
        }
        return
    }

    w.Header().Set("Content-Type", "application/json")
    fmt.Fprintf(w, `{"title":"%s","word_count":%d}`, result.Title, result.WordCount)
}

func main() {
    defer processor.Close()

    server := &http.Server{Addr: ":8080"}
    http.HandleFunc("/extract", extractHandler)

    // Корректное завершение: при получении сигнала закрывает Processor и HTTP-сервис
    go func() {
        sigChan := make(chan os.Signal, 1)
        signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
        <-sigChan
        log.Println("Завершение работы...")
        processor.Close()
        server.Shutdown(context.Background())
    }()

    log.Println("Сервис запущен на :8080")
    log.Fatal(server.ListenAndServe())
}
```

## Безопасная обработка файлов

Использование песочницы `AllowedBaseDir` для обработки пользовательских путей к файлам:

```go
package main

import (
    "errors"
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    cfg := html.HighSecurityConfig()
    // Ограничение чтения файлов этим каталогом и его подкаталогами
    // Реальный путь разрешается через дескриптор файла ОС — защита от обхода через symlink/junction
    cfg.AllowedBaseDir = "/var/www/uploads"

    p, err := html.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer p.Close()

    // Имитация пользовательских путей к файлам
    userFiles := []string{
        "/var/www/uploads/article1.html",  // ✅ Разрешено
        "/var/www/uploads/sub/page.html",  // ✅ Разрешено (подкаталог)
        "../../../etc/passwd",             // ❌ Обход пути
        "/etc/shadow",                     // ❌ Вне каталога
    }

    for _, file := range userFiles {
        _, err := p.ExtractFromFile(file)
        if err != nil {
            var fileErr *html.FileError
            if errors.As(err, &fileErr) {
                // SafePath возвращает только имя файла, не раскрывая полный путь
                fmt.Printf("❌ Отклонено %s: %s\n", fileErr.SafePath(), fileErr.FileErr)
            } else {
                fmt.Printf("❌ Ошибка: %v\n", err)
            }
            continue
        }
        fmt.Printf("✅ Успешно обработано: %s\n", file)
    }
}
```

## Резервное определение кодировки

Откат к кодировке, указанной вручную, при сбое автоопределения:

```go
package main

import (
    "fmt"
    "log"
    "strings"

    "github.com/cybergodev/html"
)

// extractWithFallback сначала определяет автоматически, при неудаче повторяет с указанной кодировкой
func extractWithFallback(data []byte, fallback string) (*html.Result, error) {
    result, err := html.Extract(data)
    if err == nil {
        return result, nil
    }
    if strings.Contains(err.Error(), "encoding detection failed") {
        cfg := html.DefaultConfig()
        cfg.Encoding = fallback
        return html.Extract(data, cfg)
    }
    return nil, err
}

func main() {
    // Имитация HTML в кодировке GBK с неизвестным происхождением (без meta charset)
    data := []byte{0xbb, 0xb9, 0xca, 0xc7, 0xd3, 0xd0, 0xd2, 0xbb, 0xb8, 0xf6}

    result, err := extractWithFallback(data, "gbk")
    if err != nil {
        log.Fatal(err)
    }

    fmt.Printf("Заголовок: %s\nДлина текста: %d\n", result.Title, len(result.Text))
}
```
