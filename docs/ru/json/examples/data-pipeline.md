---
sidebar_label: "Конвейер JSONL-данных"
title: "Конвейер JSONL-данных - CyberGo JSON | Потоковая обработка"
description: "Конвейер JSONL в CyberGo JSON: StreamLinesInto потоковое чтение, ToJSONL/ToJSONLString преобразование, NDJSONProcessor и ForeachFile для больших файлов."
sidebar_position: 5
---

# Конвейер JSONL-данных

В этом руководстве показано, как построить конвейер JSONL-данных (JSON с разделением строками) в CyberGo JSON: потоковое чтение, преобразование полей, пакетное преобразование формата и обработка больших файлов.

## Потоковое чтение и преобразование JSONL

Используйте обобщённый `StreamLinesInto[T]` для построчного чтения JSONL-потока и десериализации в структуру, преобразуйте поля в функции обратного вызова, затем записывайте обратно в формат JSONL через `ToJSONLString`.

```go
package main

import (
    "fmt"
    "strings"

    "github.com/cybergodev/json"
)

// LogEntry представляет одну строку JSON-журнала
type LogEntry struct {
    Timestamp string `json:"timestamp"`
    Level     string `json:"level"`
    Message   string `json:"message"`
}

// EnrichedLog — преобразованная запись (переименованные поля и новая категория)
type EnrichedLog struct {
    Timestamp string `json:"ts"`
    Level     string `json:"level"`
    Message   string `json:"msg"`
    Category  string `json:"category"`
}

func main() {
    // Имитация JSONL-потока журналов (на практике может поступать из файла или сети)
    jsonlStream := `{"timestamp":"2024-01-01T10:00:00Z","level":"INFO","message":"служба запущена"}
{"timestamp":"2024-01-01T10:00:05Z","level":"ERROR","message":"сбой подключения к БД"}
{"timestamp":"2024-01-01T10:00:10Z","level":"WARN","message":"время ответа превысило порог"}
{"timestamp":"2024-01-01T10:00:15Z","level":"INFO","message":"переподключение выполнено"}`

    reader := strings.NewReader(jsonlStream)

    // 1. Потоковое чтение и преобразование каждой строки журнала
    var enriched []any
    entries, err := json.StreamLinesInto[LogEntry](reader, func(lineNum int, entry LogEntry) error {
        // Категоризация по уровню
        category := "normal"
        if entry.Level == "ERROR" {
            category = "critical"
        } else if entry.Level == "WARN" {
            category = "warning"
        }

        enriched = append(enriched, EnrichedLog{
            Timestamp: entry.Timestamp,
            Level:     entry.Level,
            Message:   entry.Message,
            Category:  category,
        })
        return nil
    })
    if err != nil {
        panic(err)
    }

    // 2. Пакетное преобразование обратно в формат JSONL
    output, err := json.ToJSONLString(enriched)
    if err != nil {
        panic(err)
    }
    fmt.Printf("обработано строк журнала: %d\n", len(entries))
    fmt.Print(output)
}
// Вывод:
// обработано строк журнала: 4
// {"ts":"2024-01-01T10:00:00Z","level":"INFO","msg":"служба запущена","category":"normal"}
// {"ts":"2024-01-01T10:00:05Z","level":"ERROR","msg":"сбой подключения к БД","category":"critical"}
// {"ts":"2024-01-01T10:00:10Z","level":"WARN","msg":"время ответа превысило порог","category":"warning"}
// {"ts":"2024-01-01T10:00:15Z","level":"INFO","msg":"переподключение выполнено","category":"normal"}
```

## Обработка JSONL-файлов

`NDJSONProcessor` обрабатывает JSONL-файл построчно; функция обратного вызова получает `map[string]any` (удобно при нестационарных полях). Результаты агрегируются через `ToJSONL` для пакетного преобразования в JSONL-байты.

```go
package main

import (
    "fmt"
    "os"
    "path/filepath"

    "github.com/cybergodev/json"
)

func main() {
    // Создаём временный JSONL-файл, чтобы пример работал автономно
    tmpDir, err := os.MkdirTemp("", "cybergo-pipeline-*")
    if err != nil {
        panic(err)
    }
    defer os.RemoveAll(tmpDir)

    jsonlPath := filepath.Join(tmpDir, "events.jsonl")
    jsonData := `{"event":"login","user":"alice","ts":"2024-01-01T10:00:00Z"}
{"event":"logout","user":"alice","ts":"2024-01-01T11:00:00Z"}
{"event":"login","user":"bob","ts":"2024-01-01T12:00:00Z"}
{"event":"purchase","user":"bob","ts":"2024-01-01T12:30:00Z"}`
    if err := os.WriteFile(jsonlPath, []byte(jsonData), 0644); err != nil {
        panic(err)
    }

    // 1. Построчная обработка через NDJSONProcessor (каждая строка парсится в map[string]any)
    processor := json.NewNDJSONProcessor()
    loginCount := 0
    err = processor.ProcessFile(jsonlPath, func(lineNum int, obj map[string]any) error {
        event, _ := obj["event"].(string)
        user, _ := obj["user"].(string)
        fmt.Printf("Строка %d: %s от %s\n", lineNum, event, user)
        if event == "login" {
            loginCount++
        }
        return nil
    })
    if err != nil {
        panic(err)
    }

    // 2. Преобразование агрегированных результатов в JSONL (пакетное преобразование формата)
    summary := []any{
        map[string]any{"metric": "logins", "count": loginCount},
        map[string]any{"metric": "total_events", "count": 4},
    }
    jsonlBytes, err := json.ToJSONL(summary)
    if err != nil {
        panic(err)
    }
    fmt.Printf("Событий входа: %d\n", loginCount)
    fmt.Printf("Агрегированный результат:\n%s", string(jsonlBytes))
}
// Вывод:
// Строка 1: login от alice
// Строка 2: logout от alice
// Строка 3: login от bob
// Строка 4: purchase от bob
// Событий входа: 2
// Агрегированный результат:
// {"metric":"logins","count":2}
// {"metric":"total_events","count":4}
```

## Потоковая обработка больших файлов JSON-массивов

Для **одного большого файла JSON-массива** (не JSONL) используйте `ForeachFile` для пообъектного обхода без загрузки всего файла в память за раз.

```go
package main

import (
    "fmt"
    "os"
    "path/filepath"

    "github.com/cybergodev/json"
)

func main() {
    tmpDir, err := os.MkdirTemp("", "cybergo-big-*")
    if err != nil {
        panic(err)
    }
    defer os.RemoveAll(tmpDir)

    // Создаём большой файл JSON-массива (имитация крупного набора данных)
    arrayPath := filepath.Join(tmpDir, "records.json")
    records := []any{
        map[string]any{"id": 1, "amount": 100, "currency": "USD"},
        map[string]any{"id": 2, "amount": 250, "currency": "EUR"},
        map[string]any{"id": 3, "amount": 80, "currency": "USD"},
        map[string]any{"id": 4, "amount": 500, "currency": "GBP"},
        map[string]any{"id": 5, "amount": 120, "currency": "USD"},
    }
    if err := json.SaveToFile(arrayPath, records); err != nil {
        panic(err)
    }

    // Потоковый обход каждого элемента массива через ForeachFile
    p, err := json.New()
    if err != nil {
        panic(err)
    }
    defer p.Close()

    totalUSD := 0
    err = p.ForeachFile(arrayPath, func(key any, item *json.IterableValue) error {
        currency := item.GetString("currency")
        amount := item.GetInt("amount")
        if currency == "USD" {
            totalUSD += amount
        }
        return nil // вернуть item.Break() для досрочной остановки
    })
    if err != nil {
        panic(err)
    }
    fmt.Printf("Сумма USD: %d\n", totalUSD)
}
// Вывод: Сумма USD: 320
```

:::tip Подсказка
- **JSONL-файлы** (по одному независимому JSON-объекту на строку): используйте `StreamLinesInto[T]`, `NDJSONProcessor` или `StreamJSONLFile`.
- **Большие файлы JSON-массивов** (один JSON-массив со множеством элементов): используйте `ForeachFile` для потоковой обработки без полной загрузки в память.
:::

## Следующие шаги

- [JSONL-потоковая обработка](../streaming/jsonl) — полное руководство по обработке JSONL
- [Обработка больших файлов](../streaming/large-files) — подробно о потоковой обработке больших файлов
- [Базовые примеры](./index) — базовые чтение/запись JSONL
- [Шпаргалка](../getting-started/cheatsheet) — быстрый справочник по API
