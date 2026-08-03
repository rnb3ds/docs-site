---
sidebar_label: "JSONL 数据管道"
title: "JSONL 数据管道 - CyberGo JSON | 流式处理与批量转换"
description: "CyberGo JSON 构建 JSONL 数据管道：StreamLinesInto 流式读取并转换、ToJSONL/ToJSONLString 批量格式转换、NDJSONProcessor 与 ForeachFile 处理大文件。"
sidebar_position: 5
---

# JSONL 数据管道

本文演示如何用 CyberGo JSON 构建 JSONL（换行分隔 JSON）数据管道：流式读取、转换字段、批量格式转换，以及处理大文件。

## 流式读取并转换 JSONL

用泛型 `StreamLinesInto[T]` 逐行读取 JSONL 流并反序列化为结构体，在回调中转换字段，最后用 `ToJSONLString` 批量写回 JSONL 格式。

```go
package main

import (
    "fmt"
    "strings"

    "github.com/cybergodev/json"
)

// LogEntry 表示一行 JSON 日志
type LogEntry struct {
    Timestamp string `json:"timestamp"`
    Level     string `json:"level"`
    Message   string `json:"message"`
}

// EnrichedLog 是转换后的日志（重命名字段并新增分类）
type EnrichedLog struct {
    Timestamp string `json:"ts"`
    Level     string `json:"level"`
    Message   string `json:"msg"`
    Category  string `json:"category"`
}

func main() {
    // 模拟 JSONL 日志流（实际可来自文件或网络）
    jsonlStream := `{"timestamp":"2024-01-01T10:00:00Z","level":"INFO","message":"服务启动"}
{"timestamp":"2024-01-01T10:00:05Z","level":"ERROR","message":"数据库连接失败"}
{"timestamp":"2024-01-01T10:00:10Z","level":"WARN","message":"响应时间超过阈值"}
{"timestamp":"2024-01-01T10:00:15Z","level":"INFO","message":"重连成功"}`

    reader := strings.NewReader(jsonlStream)

    // 1. 流式读取并转换每行日志
    var enriched []any
    entries, err := json.StreamLinesInto[LogEntry](reader, func(lineNum int, entry LogEntry) error {
        // 根据级别分类
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

    // 2. 批量转换回 JSONL 格式
    output, err := json.ToJSONLString(enriched)
    if err != nil {
        panic(err)
    }
    fmt.Printf("处理了 %d 行日志\n", len(entries))
    fmt.Print(output)
}
// 输出：
// 处理了 4 行日志
// {"ts":"2024-01-01T10:00:00Z","level":"INFO","msg":"服务启动","category":"normal"}
// {"ts":"2024-01-01T10:00:05Z","level":"ERROR","msg":"数据库连接失败","category":"critical"}
// {"ts":"2024-01-01T10:00:10Z","level":"WARN","msg":"响应时间超过阈值","category":"warning"}
// {"ts":"2024-01-01T10:00:15Z","level":"INFO","msg":"重连成功","category":"normal"}
```

## 处理 JSONL 文件

`NDJSONProcessor` 逐行处理 JSONL 文件，回调返回 `map[string]any`（适合字段不固定的场景）。聚合结果用 `ToJSONL` 批量转为 JSONL 字节。

```go
package main

import (
    "fmt"
    "os"
    "path/filepath"

    "github.com/cybergodev/json"
)

func main() {
    // 创建临时 JSONL 文件确保示例可独立运行
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

    // 1. 用 NDJSONProcessor 逐行处理（每行解析为 map[string]any）
    processor := json.NewNDJSONProcessor()
    loginCount := 0
    err = processor.ProcessFile(jsonlPath, func(lineNum int, obj map[string]any) error {
        event, _ := obj["event"].(string)
        user, _ := obj["user"].(string)
        fmt.Printf("第 %d 行: %s by %s\n", lineNum, event, user)
        if event == "login" {
            loginCount++
        }
        return nil
    })
    if err != nil {
        panic(err)
    }

    // 2. 聚合结果转为 JSONL（批量格式转换）
    summary := []any{
        map[string]any{"metric": "logins", "count": loginCount},
        map[string]any{"metric": "total_events", "count": 4},
    }
    jsonlBytes, err := json.ToJSONL(summary)
    if err != nil {
        panic(err)
    }
    fmt.Printf("登录事件数: %d\n", loginCount)
    fmt.Printf("聚合结果:\n%s", string(jsonlBytes))
}
// 输出：
// 第 1 行: login by alice
// 第 2 行: logout by alice
// 第 3 行: login by bob
// 第 4 行: purchase by bob
// 登录事件数: 2
// 聚合结果:
// {"metric":"logins","count":2}
// {"metric":"total_events","count":4}
```

## 流式遍历大型 JSON 数组文件

对于**单文件大 JSON 数组**（非 JSONL），用 `ForeachFile` 逐元素流式遍历，无需一次性载入整个文件到内存。

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

    // 创建大型 JSON 数组文件（模拟大数据集）
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

    // 用 ForeachFile 流式遍历数组的每个元素
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
        return nil // 返回 item.Break() 可提前中断
    })
    if err != nil {
        panic(err)
    }
    fmt.Printf("USD 总额: %d\n", totalUSD)
}
// 输出：USD 总额: 320
```

:::tip 提示
- **JSONL 文件**（每行一个独立 JSON 对象）：用 `StreamLinesInto[T]`、`NDJSONProcessor` 或 `StreamJSONLFile`。
- **大 JSON 数组文件**（单个 JSON 数组含大量元素）：用 `ForeachFile` 流式遍历，避免全量载入内存。
:::

## 下一步

- [JSONL 流式处理](../streaming/jsonl) — 完整 JSONL 处理指南
- [大文件处理](../streaming/large-files) — 流式处理大文件详解
- [基础示例](./index) — 基础 JSONL 读写用法
- [速查表](../getting-started/cheatsheet) — API 快速参考
