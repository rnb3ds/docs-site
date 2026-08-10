---
sidebar_label: "JSONL Data Pipeline"
title: "JSONL Data Pipeline - CyberGo JSON | Streaming & Conversion"
description: "Build JSONL pipelines with CyberGo JSON: StreamLinesInto for streaming transforms, ToJSONL/ToJSONLString for batch conversion and ForeachFile for large files."
sidebar_position: 5
---

# JSONL Data Pipeline

This guide demonstrates how to build JSONL (newline-delimited JSON) data pipelines with CyberGo JSON: streaming reads, field transformation, batch format conversion, and large-file processing.

## Stream-Read and Transform JSONL

Use the generic `StreamLinesInto[T]` to read a JSONL stream line by line and deserialize into a struct, transform fields in the callback, then write back to JSONL format with `ToJSONLString`.

```go
package main

import (
    "fmt"
    "strings"

    "github.com/cybergodev/json"
)

// LogEntry represents a single JSON log line
type LogEntry struct {
    Timestamp string `json:"timestamp"`
    Level     string `json:"level"`
    Message   string `json:"message"`
}

// EnrichedLog is the transformed log (renamed fields plus a new category)
type EnrichedLog struct {
    Timestamp string `json:"ts"`
    Level     string `json:"level"`
    Message   string `json:"msg"`
    Category  string `json:"category"`
}

func main() {
    // Simulate a JSONL log stream (could come from a file or network in practice)
    jsonlStream := `{"timestamp":"2024-01-01T10:00:00Z","level":"INFO","message":"service started"}
{"timestamp":"2024-01-01T10:00:05Z","level":"ERROR","message":"database connection failed"}
{"timestamp":"2024-01-01T10:00:10Z","level":"WARN","message":"response time exceeded threshold"}
{"timestamp":"2024-01-01T10:00:15Z","level":"INFO","message":"reconnected"}`

    reader := strings.NewReader(jsonlStream)

    // 1. Stream-read and transform each log line
    var enriched []any
    entries, err := json.StreamLinesInto[LogEntry](reader, func(lineNum int, entry LogEntry) error {
        // Categorize by level
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

    // 2. Batch-convert back to JSONL format
    output, err := json.ToJSONLString(enriched)
    if err != nil {
        panic(err)
    }
    fmt.Printf("processed %d log lines\n", len(entries))
    fmt.Print(output)
}
// Output:
// processed 4 log lines
// {"ts":"2024-01-01T10:00:00Z","level":"INFO","msg":"service started","category":"normal"}
// {"ts":"2024-01-01T10:00:05Z","level":"ERROR","msg":"database connection failed","category":"critical"}
// {"ts":"2024-01-01T10:00:10Z","level":"WARN","msg":"response time exceeded threshold","category":"warning"}
// {"ts":"2024-01-01T10:00:15Z","level":"INFO","msg":"reconnected","category":"normal"}
```

## Processing JSONL Files

`NDJSONProcessor` processes a JSONL file line by line; the callback receives a `map[string]any` (handy when fields are not fixed). Aggregate results with `ToJSONL` to batch-convert to JSONL bytes.

```go
package main

import (
    "fmt"
    "os"
    "path/filepath"

    "github.com/cybergodev/json"
)

func main() {
    // Create a temp JSONL file so the example runs standalone
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

    // 1. Process line by line with NDJSONProcessor (each line parsed into map[string]any)
    processor := json.NewNDJSONProcessor()
    loginCount := 0
    err = processor.ProcessFile(jsonlPath, func(lineNum int, obj map[string]any) error {
        event, _ := obj["event"].(string)
        user, _ := obj["user"].(string)
        fmt.Printf("Line %d: %s by %s\n", lineNum, event, user)
        if event == "login" {
            loginCount++
        }
        return nil
    })
    if err != nil {
        panic(err)
    }

    // 2. Convert aggregated results to JSONL (batch format conversion)
    summary := []any{
        map[string]any{"metric": "logins", "count": loginCount},
        map[string]any{"metric": "total_events", "count": 4},
    }
    jsonlBytes, err := json.ToJSONL(summary)
    if err != nil {
        panic(err)
    }
    fmt.Printf("Login events: %d\n", loginCount)
    fmt.Printf("Aggregated:\n%s", string(jsonlBytes))
}
// Output:
// Line 1: login by alice
// Line 2: logout by alice
// Line 3: login by bob
// Line 4: purchase by bob
// Login events: 2
// Aggregated:
// {"metric":"logins","count":2}
// {"metric":"total_events","count":4}
```

## Streaming Large JSON Array Files

For a **single large JSON array file** (not JSONL), use `ForeachFile` to iterate element by element without loading the entire file into memory at once.

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

    // Create a large JSON array file (simulating a big dataset)
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

    // Stream over each element of the array with ForeachFile
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
        return nil // return item.Break() to stop early
    })
    if err != nil {
        panic(err)
    }
    fmt.Printf("Total USD: %d\n", totalUSD)
}
// Output: Total USD: 320
```

:::tip
- **JSONL files** (one independent JSON object per line): use `StreamLinesInto[T]`, `NDJSONProcessor`, or `StreamJSONLFile`.
- **Large JSON array files** (a single JSON array with many elements): use `ForeachFile` to stream without loading everything into memory.
:::

## Next Steps

- [JSONL Streaming](../streaming/jsonl) — full JSONL processing guide
- [Large File Processing](../streaming/large-files) — streaming large files in depth
- [Basic Examples](./index) — basic JSONL read/write usage
- [Cheat Sheet](../getting-started/cheatsheet) — quick API reference
