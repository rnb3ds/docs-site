---
sidebar_label: "JSONL データパイプライン"
title: "JSONL データパイプライン - CyberGo JSON | ストリーミングと一括変換"
description: "CyberGo JSON で JSONL データパイプラインを構築: StreamLinesInto でストリーミング読込と変換、ToJSONL/ToJSONLString で一括変換、NDJSONProcessor と ForeachFile で大容量ファイル処理。"
sidebar_position: 5
---

# JSONL データパイプライン

このドキュメントでは、CyberGo JSON で JSONL（改行区切り JSON）データパイプラインを構築する方法を示します: ストリーミング読込、フィールド変換、一括フォーマット変換、大容量ファイル処理。

## JSONL のストリーミング読込と変換

ジェネリック `StreamLinesInto[T]` で JSONL ストリームを 1 行ずつ読み込み構造体へ逆シリアル化し、コールバックでフィールドを変換した後、`ToJSONLString` で JSONL 形式に書き戻します。

```go
package main

import (
    "fmt"
    "strings"

    "github.com/cybergodev/json"
)

// LogEntry は単一の JSON ログ行を表します
type LogEntry struct {
    Timestamp string `json:"timestamp"`
    Level     string `json:"level"`
    Message   string `json:"message"`
}

// EnrichedLog は変換後のログです（フィールド名変更と新しいカテゴリ追加）
type EnrichedLog struct {
    Timestamp string `json:"ts"`
    Level     string `json:"level"`
    Message   string `json:"msg"`
    Category  string `json:"category"`
}

func main() {
    // JSONL ログストリームをシミュレート（実際はファイルやネットワークから取得可能）
    jsonlStream := `{"timestamp":"2024-01-01T10:00:00Z","level":"INFO","message":"サービス開始"}
{"timestamp":"2024-01-01T10:00:05Z","level":"ERROR","message":"データベース接続失敗"}
{"timestamp":"2024-01-01T10:00:10Z","level":"WARN","message":"応答時間がしきい値超過"}
{"timestamp":"2024-01-01T10:00:15Z","level":"INFO","message":"再接続成功"}`

    reader := strings.NewReader(jsonlStream)

    // 1. 各ログ行をストリーミング読込して変換
    var enriched []any
    entries, err := json.StreamLinesInto[LogEntry](reader, func(lineNum int, entry LogEntry) error {
        // レベル別に分類
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

    // 2. JSONL 形式へ一括変換
    output, err := json.ToJSONLString(enriched)
    if err != nil {
        panic(err)
    }
    fmt.Printf("%d行のログを処理しました\n", len(entries))
    fmt.Print(output)
}
// 出力:
// 4行のログを処理しました
// {"ts":"2024-01-01T10:00:00Z","level":"INFO","msg":"サービス開始","category":"normal"}
// {"ts":"2024-01-01T10:00:05Z","level":"ERROR","msg":"データベース接続失敗","category":"critical"}
// {"ts":"2024-01-01T10:00:10Z","level":"WARN","msg":"応答時間がしきい値超過","category":"warning"}
// {"ts":"2024-01-01T10:00:15Z","level":"INFO","msg":"再接続成功","category":"normal"}
```

## JSONL ファイルの処理

`NDJSONProcessor` は JSONL ファイルを 1 行ずつ処理し、コールバックは `map[string]any` を受け取ります（フィールドが固定でない場合に便利）。集計結果は `ToJSONL` で一括変換して JSONL バイトにします。

```go
package main

import (
    "fmt"
    "os"
    "path/filepath"

    "github.com/cybergodev/json"
)

func main() {
    // 例が単独実行できるよう一時 JSONL ファイルを作成
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

    // 1. NDJSONProcessor で行ごとに処理（各行は map[string]any にパース）
    processor := json.NewNDJSONProcessor()
    loginCount := 0
    err = processor.ProcessFile(jsonlPath, func(lineNum int, obj map[string]any) error {
        event, _ := obj["event"].(string)
        user, _ := obj["user"].(string)
        fmt.Printf("%d 行目: %s by %s\n", lineNum, event, user)
        if event == "login" {
            loginCount++
        }
        return nil
    })
    if err != nil {
        panic(err)
    }

    // 2. 集計結果を JSONL へ変換（一括フォーマット変換）
    summary := []any{
        map[string]any{"metric": "logins", "count": loginCount},
        map[string]any{"metric": "total_events", "count": 4},
    }
    jsonlBytes, err := json.ToJSONL(summary)
    if err != nil {
        panic(err)
    }
    fmt.Printf("ログインイベント数: %d\n", loginCount)
    fmt.Printf("集計結果:\n%s", string(jsonlBytes))
}
// 出力:
// 1 行目: login by alice
// 2 行目: logout by alice
// 3 行目: login by bob
// 4 行目: purchase by bob
// ログインイベント数: 2
// 集計結果:
// {"metric":"logins","count":2}
// {"metric":"total_events","count":4}
```

## 大容量 JSON 配列ファイルのストリーミング

**単一の大容量 JSON 配列ファイル**（JSONL ではない）の場合、`ForeachFile` でファイル全体をメモリに一度に読み込まずに要素ごとに走査します。

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

    // 大容量 JSON 配列ファイルを作成（大規模データセットをシミュレート）
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

    // ForeachFile で配列の各要素をストリーミング走査
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
        return nil // item.Break() を返すと早期中断
    })
    if err != nil {
        panic(err)
    }
    fmt.Printf("USD 合計: %d\n", totalUSD)
}
// 出力: USD 合計: 320
```

:::tip ヒント
- **JSONL ファイル**（1 行に独立した JSON オブジェクト 1 つ）: `StreamLinesInto[T]`、`NDJSONProcessor`、`StreamJSONLFile` を使います。
- **大容量 JSON 配列ファイル**（単一 JSON 配列に多数の要素）: `ForeachFile` でメモリに全読み込みせずストリーミングします。
:::

## 次のステップ

- [JSONL ストリーミング](../streaming/jsonl) — 完全な JSONL 処理ガイド
- [大容量ファイル処理](../streaming/large-files) — 大容量ファイルのストリーミング詳細
- [基本サンプル](./index) — 基本的な JSONL 読み書き
- [チートシート](../getting-started/cheatsheet) — クイック API リファレンス
