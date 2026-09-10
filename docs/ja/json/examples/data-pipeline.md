---
sidebar_label: "JSONL データパイプライン"
title: "JSONL データパイプライン - CyberGo JSON | ストリーミングと一括変換"
description: "CyberGo JSON で JSONL データパイプラインを構築：StreamLinesInto でストリーミング読込と変換、ToJSONL/ToJSONLString で一括変換、NDJSONProcessor と ForeachFile で大容量ファイル処理、フィールドのエンリッチと一括変換が可能。"
sidebar_position: 5
---

# JSONL データパイプライン

このドキュメントでは、CyberGo JSON を使って JSONL（改行区切り JSON）データパイプラインを構築する方法を示します: ストリーミング読込、フィールド変換、一括フォーマット変換、および大容量ファイル処理。

## JSONL のストリーミング読込と変換

ジェネリック `StreamLinesInto[T]` で JSONL ストリームを 1 行ずつ読み込み構造体へ逆シリアル化し、コールバックでフィールドを変換した後、`ToJSONLString` で JSONL 形式に一括で書き戻します。

```go
package main

import (
	"fmt"
	"strings"

	"github.com/cybergodev/json"
)

// LogEntry は 1 行の JSON ログを表します
type LogEntry struct {
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"`
	Message   string `json:"message"`
}

// EnrichedLog は変換後のログです（フィールド名を変更しカテゴリを追加）
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
		// レベルに応じて分類
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
	fmt.Printf("%d 行のログを処理しました\n", len(entries))
	fmt.Print(output)
}

// 出力:
// 4 行のログを処理しました
// {"ts":"2024-01-01T10:00:00Z","level":"INFO","msg":"サービス開始","category":"normal"}
// {"ts":"2024-01-01T10:00:05Z","level":"ERROR","msg":"データベース接続失敗","category":"critical"}
// {"ts":"2024-01-01T10:00:10Z","level":"WARN","msg":"応答時間がしきい値超過","category":"warning"}
// {"ts":"2024-01-01T10:00:15Z","level":"INFO","msg":"再接続成功","category":"normal"}
```

## JSONL ファイルの処理

`NDJSONProcessor` は JSONL ファイルを 1 行ずつ処理し、コールバックは `map[string]any` を受け取ります（フィールドが固定でないシナリオに適しています）。集計結果は `ToJSONL` で一括して JSONL バイトへ変換します。

```go
package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/cybergodev/json"
)

func main() {
	// サンプルが単独実行できるよう一時 JSONL ファイルを作成
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

	// 1. NDJSONProcessor で 1 行ずつ処理（各行は map[string]any にパース）
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

## 並列パイプライン: StreamJSONLParallel + JSONLWriter による書き出し

行数が多く、1 行あたりの処理が重い（変換、検証、エンリッチ）場合、`StreamJSONLParallel` は複数の worker でストリームを並行に消費します。結果は元の行順に収集した後、`JSONLWriter.WriteRaw` で再エンコードなしに JSONL へ書き戻します:

```go
package main

import (
	"bytes"
	"fmt"
	"slices"
	"strings"
	"sync"

	"github.com/cybergodev/json"
)

func main() {
	// イベントログストリームをシミュレート（実際は大容量ファイルから。strings.NewReader を os.Open の *os.File に置き換え）
	jsonlStream := `{"event":"login","user":"alice","ts":"10:00"}
{"event":"page_view","user":"alice","ts":"10:01"}
{"event":"login","user":"bob","ts":"10:02"}
{"event":"purchase","user":"bob","ts":"10:03"}
{"event":"login","user":"carol","ts":"10:04"}`

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// 1. 並行フィルタと変換: login イベントのみ残し、{user, at} 構造に書き換え。
	//    コールバックは複数の worker で並行実行される: 共有 map への書き込みにはロックが必要。lineNum をキーに格納し、完了後に元の順序を復元
	var mu sync.Mutex
	logins := make(map[int][]byte)

	err = p.StreamJSONLParallel(strings.NewReader(jsonlStream), 4, func(lineNum int, item *json.IterableValue) error {
		if item.GetString("event") != "login" {
			return nil // 対象外イベントはスキップ。item.Break() を返すとストリーム全体をきれいに停止できる
		}
		encoded, err := json.Marshal(map[string]any{
			"user": item.GetString("user"),
			"at":   item.GetString("ts"),
		})
		if err != nil {
			return err // エラーを返すとディスパッチを停止し、そのまま上位へ報告される
		}
		mu.Lock()
		logins[lineNum] = encoded
		mu.Unlock()
		return nil
	})
	if err != nil {
		panic(err)
	}

	// 2. 元の行順で結果を書き出し（WriteRaw はエンコード済み行を直接書き込み、改行のみ補完）
	lineNums := make([]int, 0, len(logins))
	for n := range logins {
		lineNums = append(lineNums, n)
	}
	slices.Sort(lineNums)

	var out bytes.Buffer
	writer := json.NewJSONLWriter(&out)
	for _, n := range lineNums {
		if err := writer.WriteRaw(logins[n]); err != nil {
			panic(err)
		}
	}

	fmt.Printf("ログインイベント %d 件を抽出（%d 行書き出し）\n", len(logins), writer.Stats().LinesProcessed)
	fmt.Print(out.String())
}

// 出力:
// ログインイベント 3 件を抽出（3 行書き出し）
// {"at":"10:00","user":"alice"}
// {"at":"10:02","user":"bob"}
// {"at":"10:04","user":"carol"}
```

:::tip 並列パイプラインのポイント
- **順序**: 並行コールバックの実行順序は保証されませんが、`lineNum` は常に元の行番号に対応します——行番号で収集し、ソートしてから書き出せば順序を維持できます。
- **worker 数**: 第 2 引数で明示的に指定します（サンプルでは 4）。タイムアウト/キャンセルが必要な場合は `StreamJSONLParallelWithContext(ctx, reader, workers, fn)` を使ってください。
- **スループット**: 直列の `StreamJSONL` と比べた利益は 1 行あたりの処理コストに依存します——純粋な抽出系の軽いコールバックでは向上は限定的で、エンリッチ/検証系の重いコールバックでは大幅に向上します。
:::

## 大容量 JSON 配列ファイルのストリーミング走査

**単一ファイルの大容量 JSON 配列**（JSONL ではない）には `ForeachFile` で要素ごとにストリーミング走査し、ファイル全体をメモリへ一度に読み込む必要はありません。

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
		return nil // item.Break() を返すと早期中断できる
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
- **大容量 JSON 配列ファイル**（単一の JSON 配列に多数の要素）: `ForeachFile` でストリーミング走査し、メモリへの全量読込を避けます。
:::

## 次のステップ

- [JSONL ストリーミング処理](../streaming/jsonl) — 完全な JSONL 処理ガイド
- [大容量ファイル処理](../streaming/large-files) — 大容量ファイルのストリーミング処理の詳細
- [基本サンプル](./index) — 基本的な JSONL 読み書きの用法
- [チートシート](../getting-started/cheatsheet) — API クイックリファレンス
