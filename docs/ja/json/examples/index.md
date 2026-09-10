---
sidebar_label: "基本サンプル"
title: "使用例 - CyberGo JSON | 実践コード例"
description: "CyberGo JSON 実践サンプル：パスクエリと変更、構造体 Marshal/Unmarshal、ジェネリクス API、Processor 再利用とキャッシュウォームアップ、反復走査と並列処理、JSONL ストリーミング処理、Hook、Schema 検証とエラー処理を実行可能な Go コードで紹介。"
sidebar_position: 1
---

# 使用例

このドキュメントでは、`github.com/cybergodev/json` ライブラリの実践的なコードサンプルを提供します。

## 基本操作

### パスクエリ

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{
        "user": {
            "id": 1001,
            "name": "Alice",
            "email": "alice@example.com",
            "active": true,
            "profile": {
                "age": 28,
                "city": "Beijing"
            }
        },
        "tags": ["go", "json", "dev"],
        "scores": [95, 88, 92]
    }`

	// シンプルなパス
	name := json.GetString(data, "user.name")
	fmt.Println("Name:", name)

	// ネストされたパス
	city := json.GetString(data, "user.profile.city")
	age := json.GetInt(data, "user.profile.age")
	fmt.Printf("City: %s, Age: %d\n", city, age)

	// 配列インデックス
	firstTag := json.GetString(data, "tags.0")
	firstScore := json.GetInt(data, "scores.0")
	fmt.Printf("First tag: %s, First score: %d\n", firstTag, firstScore)

	// 配列の取得
	tags := json.GetArray(data, "tags")
	fmt.Println("Tags:", tags)

	// オブジェクトの取得
	profile := json.GetObject(data, "user.profile")
	fmt.Println("Profile:", profile)

	// デフォルト値付きで取得
	country := json.GetString(data, "user.profile.country", "Unknown")
	phone := json.GetString(data, "user.phone", "N/A")
	fmt.Printf("Country: %s, Phone: %s\n", country, phone)
}
```

### 複数フィールドの一括取得

1 回の `GetMultiple` は JSON を 1 回パースするだけで複数パスの値を取得できます。`Get` を逐次呼び出す場合は毎回キャッシュキーの検索が走ります:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{
        "order": {"id": 5001, "status": "shipped"},
        "customer": {"name": "Alice"},
        "total": 129.9
    }`

	values, err := json.GetMultiple(data, []string{
		"order.id", "order.status", "customer.name", "total",
	})
	if err != nil {
		panic(err)
	}

	fmt.Println("注文番号:", values["order.id"])
	fmt.Println("ステータス:", values["order.status"])
	fmt.Println("顧客:", values["customer.name"])
	fmt.Println("合計:", values["total"])
}

// 出力:
// 注文番号: 5001
// ステータス: shipped
// 顧客: Alice
// 合計: 129.9
```

:::tip 注意
`GetMultiple` は**最初に**失敗したパスのエラーを返します（失敗したパスの値は結果 map で `nil`）。そのためこのサンプルではすべてのパスが存在していなければなりません。オプションフィールドを確認する場合は、デフォルト値付きの `GetString`/`GetInt` または [`SafeGet`](./examples-advanced) を使ってください。
:::

### JSON の変更

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"name": "old", "version": 1}`

	// 単一の値を変更
	updated, _ := json.Set(data, "name", "new")
	fmt.Println("After set:", updated)

	// 新しいフィールドを追加
	updated, _ = json.Set(updated, "active", true)
	fmt.Println("After add:", updated)

	// 複数のフィールドを個別に設定
	updated, _ = json.Set(updated, "version", 2)
	updated, _ = json.Set(updated, "author", "CyberGo")
	updated, _ = json.Set(updated, "tags", []string{"json", "go"})
	fmt.Println("After batch:", updated)

	// フィールドを削除
	updated, _ = json.Delete(updated, "author")
	fmt.Println("After delete:", updated)

	// ネストされた変更
	nested := `{"config": {"database": {"host": "localhost"}}}`
	nested, _ = json.Set(nested, "config.database.host", "192.168.1.1")
	nested, _ = json.Set(nested, "config.database.port", 3306)
	fmt.Println("Nested:", nested)
}
```

## 構造体のエンコード・デコード

### 基本的なエンコード・デコード

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

type User struct {
	ID       int            `json:"id"`
	Name     string         `json:"name"`
	Email    string         `json:"email"`
	Active   bool           `json:"active"`
	Tags     []string       `json:"tags"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

func main() {
	user := User{
		ID:     1001,
		Name:   "Alice",
		Email:  "alice@example.com",
		Active: true,
		Tags:   []string{"go", "json"},
		Metadata: map[string]any{
			"role":  "admin",
			"level": 5,
		},
	}

	// エンコード
	data, err := json.Marshal(user)
	if err != nil {
		panic(err)
	}
	fmt.Println("Encoded:", string(data))

	// 整形エンコード
	pretty, _ := json.MarshalIndent(user, "", "  ")
	fmt.Println("Pretty:\n", string(pretty))

	// デコード
	var decoded User
	err = json.Unmarshal(data, &decoded)
	if err != nil {
		panic(err)
	}
	fmt.Printf("Decoded: %+v\n", decoded)
}
```

### ネストされた構造体

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

type Address struct {
	City    string `json:"city"`
	Country string `json:"country"`
}

type Profile struct {
	Age     int     `json:"age"`
	Address Address `json:"address"`
}

type UserWithProfile struct {
	ID      int     `json:"id"`
	Name    string  `json:"name"`
	Profile Profile `json:"profile"`
}

func main() {
	user := UserWithProfile{
		ID:   1,
		Name: "Bob",
		Profile: Profile{
			Age: 30,
			Address: Address{
				City:    "Shanghai",
				Country: "China",
			},
		},
	}

	data, _ := json.MarshalIndent(user, "", "  ")
	fmt.Println(string(data))

	// JSON 文字列から直接ネストされた値を取得
	city := json.GetString(string(data), "profile.address.city")
	fmt.Println("City:", city)
}
```

## ジェネリック API

### GetTyped

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

type Config struct {
	Host string `json:"host"`
	Port int    `json:"port"`
	TLS  struct {
		Enabled  bool   `json:"enabled"`
		CertPath string `json:"cert_path"`
	} `json:"tls"`
}

func main() {
	data := `{
        "host": "localhost",
        "port": 8080,
        "tls": {
            "enabled": true,
            "cert_path": "/etc/certs/server.crt"
        }
    }`

	// ジェネリックデコード
	config := json.GetTyped[Config](data, ".")
	fmt.Printf("Config: %+v\n", config)

	// デフォルト値付き
	defaultConfig := Config{Host: "127.0.0.1", Port: 3000}
	cfg := json.GetTyped[Config](data, ".", defaultConfig)
	fmt.Printf("Config: %+v\n", cfg)
}
```

## Processor の使用

### 基本的な使用方法

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// プロセッサを作成
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data := `{"users": [{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}]}`

	// プロセッサで操作
	users := p.GetArray(data, "users")
	fmt.Println("Users:", users)

	// 事前パースで複数回のクエリを高速化
	parsed, _ := p.PreParse(data)
	for i := 0; i < 2; i++ {
		name, _ := p.GetFromParsed(parsed, fmt.Sprintf("users.%d.name", i))
		fmt.Printf("User %d: %v\n", i, name)
	}
}
```

### カスタム設定

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"time"
)

func main() {
	// カスタム設定
	cfg := json.DefaultConfig()
	cfg.EnableCache = true
	cfg.CacheTTL = 10 * time.Minute
	cfg.MaxJSONSize = 50 * 1024 * 1024 // 50MB
	cfg.CreatePaths = true

	p, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// セキュリティ設定で信頼できない入力を処理
	secureCfg := json.SecurityConfig()
	secureP, err := json.New(secureCfg)
	if err != nil {
		panic(err)
	}
	defer secureP.Close()

	untrusted := `{"input": "<script>alert('xss')</script>"}`
	result := secureP.GetString(untrusted, "input")
	fmt.Println("Sanitized:", result)
}
```

### キャッシュのウォームアップ

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// 大規模な JSON データ（サンプルは簡略化、実際には数千行になり得ます）
	largeJSON := `{
        "users": [{"id": 1}, {"id": 2}],
        "products": [{"sku": "A-1"}],
        "orders": [{"no": 1001}]
    }`

	// よく使うパスをウォームアップ
	commonPaths := []string{
		"users",
		"users.0.id",
		"products",
		"orders",
	}

	result, err := p.WarmupCache(largeJSON, commonPaths)
	if err != nil {
		panic(err)
	}

	fmt.Printf("Warmup complete: %d/%d paths cached\n",
		result.Successful, result.TotalPaths)
	if len(result.FailedPaths) > 0 {
		fmt.Println("Failed paths:", result.FailedPaths)
	}
}
```

## イテレーション

### 配列の反復処理

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{
        "users": [
            {"id": 1, "name": "Alice", "score": 95},
            {"id": 2, "name": "Bob", "score": 88},
            {"id": 3, "name": "Charlie", "score": 92}
        ]
    }`

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// 配列を走査
	p.ForeachWithPath(data, "users", func(key any, item *json.IterableValue) {
		id := item.GetInt("id")
		name := item.GetString("name")
		score := item.GetFloat64("score")
		fmt.Printf("User %d: %s (score: %.1f)\n", id, name, score)
	})
}
```

### 制御フロー付きイテレーション

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"numbers": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}`

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	sum := 0
	p.ForeachWithPathAndControl(data, "numbers", func(key any, value any) json.IteratorControl {
		// 5 より大きい値に遭遇したら停止
		if num, ok := value.(float64); ok {
			if num > 5 {
				return json.IteratorBreak
			}
			sum += int(num)
		}
		return json.IteratorNormal
	})
	fmt.Println("Sum of numbers <= 5:", sum) // 1+2+3+4+5 = 15
}
```

### フィールドの存在確認

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{
        "users": [
            {"name": "Alice", "email": "alice@example.com"},
            {"name": "Bob"},
            {"name": "Charlie", "email": "charlie@example.com", "phone": "123-456"}
        ]
    }`

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	p.ForeachWithPath(data, "users", func(key any, item *json.IterableValue) {
		name := item.GetString("name")
		email := item.GetString("email")
		phone := item.GetString("phone")

		fmt.Printf("User: %s\n", name)
		if item.Exists("email") {
			fmt.Printf("  Email: %s\n", email)
		}
		if item.Exists("phone") {
			fmt.Printf("  Phone: %s\n", phone)
		}
		if item.IsNull("nickname") {
			fmt.Println("  No nickname")
		}
	})
}
```

### 配列の並列処理

`ParallelIterator` は worker プールを内蔵しており、大きな配列に対して Map/Filter/ForEach を並列実行します。goroutine やセマフォを手書きする必要はありません:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"scores":[62,85,94,38,71,99,55,88]}`
	scores := json.GetArray(data, "scores")

	iter := json.NewParallelIterator(scores)
	defer iter.Close()

	// 並列フィルタ: >= 80 のスコアのみ残す（結果は入力順を維持）
	passed := iter.Filter(func(_ int, v any) bool {
		return v.(float64) >= 80
	})
	fmt.Println("優秀スコア:", passed)

	// 並列マップ: 各スコアを成績に変換（結果は入力と同位置）
	grades, err := iter.Map(func(_ int, v any) (any, error) {
		score := v.(float64)
		switch {
		case score >= 90:
			return "A", nil
		case score >= 80:
			return "B", nil
		default:
			return "C", nil
		}
	})
	if err != nil {
		panic(err)
	}
	fmt.Println("成績:", grades)
}

// 出力:
// 優秀スコア: [85 94 99 88]
// 成績: [C B A C C A C B]
```

worker 数は `Config.MaxConcurrency`（デフォルト 50、配列長を超える場合は自動的に切り詰め）から取られます。コールバック内の panic は回復されてエラーとして返されるため、プロセスが落ちることはありません。バッチ処理とキャンセルの使い方は[並行・並列処理](../advanced/concurrency)を参照してください。

## JSONL 処理

### JSONL ファイルの読み込み

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	err = p.StreamJSONLFile("data.jsonl", func(lineNum int, item *json.IterableValue) error {
		fmt.Printf("Line %d: %v\n", lineNum, item.GetData())
		return nil
	})

	if err != nil {
		fmt.Println("Error:", err)
	}
}
```

### ジェネリック JSONL 処理

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"strings"
)

type LogEntry struct {
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"`
	Message   string `json:"message"`
}

func main() {
	jsonlData := `{"timestamp":"2024-01-01T10:00:00Z","level":"INFO","message":"Started"}
{"timestamp":"2024-01-01T10:00:01Z","level":"DEBUG","message":"Processing"}
{"timestamp":"2024-01-01T10:00:02Z","level":"ERROR","message":"Failed"}`

	reader := strings.NewReader(jsonlData)

	entries, err := json.StreamLinesInto[LogEntry](reader, func(lineNum int, entry LogEntry) error {
		fmt.Printf("[%s] %s: %s\n", entry.Level, entry.Timestamp, entry.Message)
		return nil
	})

	if err != nil {
		panic(err)
	}
	fmt.Printf("Processed %d entries\n", len(entries))
}
```

### JSONL の書き込み

`JSONLWriter` は任意の Go 値を 1 行ずつ JSONL（NDJSON）として書き出します。`Write` は単一の値をエンコードして改行を追加し、`WriteRaw` はエンコード済みの行を直接書き込み（再エンコードのコストをスキップし）、`Stats` は行数とバイト数を返します:

```go
package main

import (
	"bytes"
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	var buf bytes.Buffer
	writer := json.NewJSONLWriter(&buf)

	// Write: 単一の値を 1 行の JSON にエンコード（改行を自動追加）
	if err := writer.Write(map[string]any{"id": 1, "name": "Alice"}); err != nil {
		panic(err)
	}
	if err := writer.Write(map[string]any{"id": 2, "name": "Bob"}); err != nil {
		panic(err)
	}

	// WriteRaw: エンコード済みの行を書き込み（末尾に改行がない場合は自動補完）
	if err := writer.WriteRaw([]byte(`{"id":3,"name":"Charlie"}`)); err != nil {
		panic(err)
	}

	// ファイルへ書き込む場合は bytes.Buffer を os.Create の *os.File に置き換えるだけ
	stats := writer.Stats()
	fmt.Printf("%d 行書き込み、計 %d バイト\n", stats.LinesProcessed, stats.BytesWritten)
	fmt.Print(buf.String())
}

// 出力:
// 3 行書き込み、計 72 バイト
// {"id":1,"name":"Alice"}
// {"id":2,"name":"Bob"}
// {"id":3,"name":"Charlie"}
```

大量のデータは `WriteAll([]any{...})` で一括書き込みできます。最初のエラーはキャッシュされ、以降の呼び出しは同じエラーを直接返します。`writer.Err()` でいつでも確認できます。

## ストリーム処理

### 大規模 JSON のストリーム処理

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// プロセッサを作成
	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	// ForeachFile で大容量ファイルをストリーミング処理
	count := 0
	err = processor.ForeachFile("large-array.json", func(key any, item *json.IterableValue) error {
		count++
		if count%1000 == 0 {
			fmt.Printf("Processed %d items...\n", count)
		}
		return nil // item.Break() を返すと中断可能
	})

	if err != nil {
		panic(err)
	}
	fmt.Printf("Total items: %d\n", count)
}
```

### オブジェクトのストリーム処理

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	// JSON オブジェクトファイルの処理（キー・バリュー構造）
	// ファイル形式: {"user1": {...}, "user2": {...}, ...}
	err = processor.ForeachFile("config-map.json", func(key any, item *json.IterableValue) error {
		name := item.GetString("name")
		fmt.Printf("Key: %s, Name: %s\n", key, name)
		return nil
	})

	if err != nil {
		panic(err)
	}
}
```

## フックシステム

### ログフック

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"log/slog"
	"os"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))

	cfg := json.DefaultConfig()
	cfg.AddHook(json.LoggingHook(logger))

	p, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data := `{"name": "test"}`
	name := p.GetString(data, "name")
	fmt.Println("Name:", name)
}
```

### タイミングフック

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"time"
)

type TimingRecorder struct {
	records map[string]time.Duration
}

func (r *TimingRecorder) Record(op string, duration time.Duration) {
	r.records[op] = duration
}

func main() {
	recorder := &TimingRecorder{records: make(map[string]time.Duration)}

	cfg := json.DefaultConfig()
	cfg.AddHook(json.TimingHook(recorder))

	p, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// いくつかの操作を実行
	data := `{"users": [{"id": 1}, {"id": 2}]}`
	for i := 0; i < 100; i++ {
		p.Get(data, "users")
	}

	fmt.Println("Timing records:", recorder.records)
}
```

### カスタムバリデーションフック

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	cfg := json.DefaultConfig()
	cfg.AddHook(json.ValidationHook(func(jsonStr, path string) error {
		// カスタムバリデーションロジック
		if len(jsonStr) > 10000 {
			return fmt.Errorf("JSON too large")
		}
		return nil
	}))

	p, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data := `{"name": "test"}`
	val, err := p.Get(data, "name")
	if err != nil {
		fmt.Println("Validation error:", err)
	} else {
		fmt.Println("Value:", val)
	}
}
```

## スキーマバリデーション

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// スキーマを定義
	schema := &json.Schema{
		Type:     "object",
		Required: []string{"name", "email"},
		Properties: map[string]*json.Schema{
			"name": {
				Type:      "string",
				MinLength: 1,
				MaxLength: 100,
			},
			"email": {
				Type:   "string",
				Format: "email",
			},
			"age": {
				Type:    "number",
				Minimum: 0,
				Maximum: 150,
			},
			"tags": {
				Type:     "array",
				MinItems: 1,
				Items: &json.Schema{
					Type: "string",
				},
			},
		},
	}

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	validJSON := `{"name": "Alice", "email": "alice@example.com", "age": 25}`
	invalidJSON := `{"name": "", "email": "invalid"}`

	errors, _ := p.ValidateSchema(validJSON, schema)
	if len(errors) == 0 {
		fmt.Println("Valid JSON")
	} else {
		for _, e := range errors {
			fmt.Printf("Error at %s: %s\n", e.Path, e.Message)
		}
	}

	errors, _ = p.ValidateSchema(invalidJSON, schema)
	for _, e := range errors {
		fmt.Printf("Error at %s: %s\n", e.Path, e.Message)
	}
}
```

## エラー処理

### エラータイプの判定

```go
package main

import (
	"errors"
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"name": "test"}`
	_, err := json.Get(data, "nonexistent.path")

	if err != nil {
		// エラータイプを確認
		if errors.Is(err, json.ErrPathNotFound) {
			fmt.Println("Path not found")
		} else if errors.Is(err, json.ErrInvalidJSON) {
			fmt.Println("Invalid JSON")
		} else if errors.Is(err, json.ErrTypeMismatch) {
			fmt.Println("Type mismatch")
		}

		// 詳細なエラー情報を取得
		var jsonErr *json.JsonsError
		if errors.As(err, &jsonErr) {
			fmt.Printf("Op: %s, Path: %s\n", jsonErr.Op, jsonErr.Path)
		}
	}
}
```

### 信頼できない入力の安全な処理

```go
package main

import (
	"errors"
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// セキュリティ設定を使用
	cfg := json.SecurityConfig()
	// SecurityConfig はデフォルトで 10MB に制限済み。ここではさらに 1MB に制限
	cfg.MaxJSONSize = 1024 * 1024 // 1MB 制限
	p, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// 信頼できない入力をシミュレート
	// 注意: 実際の攻撃はより大きなペイロード（100MB+ など）を試みる可能性があります
	// セキュリティ設定は MaxJSONSize を超える入力をブロックします
	untrustedInputs := []string{
		`{"data": "normal"}`,
		`{"huge": "` + string(make([]byte, 2*1024*1024)) + `"}`,                                      // 2MB 入力（1MB 制限を超過）
		`{"nested": {{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}`, // 深すぎるネスト
	}

	for i, input := range untrustedInputs {
		_, err := p.Get(input, "data")
		if err != nil {
			if errors.Is(err, json.ErrSecurityViolation) {
				fmt.Printf("Input %d blocked: security violation\n", i)
			} else {
				fmt.Printf("Input %d error: %v\n", i, err)
			}
		} else {
			fmt.Printf("Input %d processed successfully\n", i)
		}
	}
}
```

## ヘルパー関数

### JSON の比較

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	json1 := `{"a": 1, "b": 2}`
	json2 := `{"b": 2, "a": 1}` // キーの順序が異なる

	equal, err := json.CompareJSON(json1, json2)
	if err != nil {
		panic(err)
	}
	fmt.Println("Equal:", equal) // true（意味的に等価）
}
```

### 設定が意味的に一致するかの比較

`CompareJSON` はパースして正規化した上で比較します: キーの順序の違いや、`3` と `3.0` のような数値表記の差異はすべて等価とみなされます。「設定が本当に変わったか」を判定する際にこれを使えば、フォーマットの差分を誤った変更として報告することを防げます:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	deployed := `{"port": 8080, "debug": false, "retries": 3}`
	// 同じ設定を再シリアライズしたもの: キー順が入れ替わり、数値が浮動小数点形式に書き換わる
	modified := `{
        "debug": false,
        "retries": 3.0,
        "port": 8080
    }`

	equal, err := json.CompareJSON(deployed, modified)
	if err != nil {
		panic(err)
	}
	fmt.Println("設定が意味的に一致:", equal)
	// 出力: 設定が意味的に一致: true

	// 信頼できないソースの設定を扱う場合はセキュリティ設定を追加（サイズ/深さの制限、セキュリティスキャンの実行）
	equal, err = json.CompareJSON(deployed, modified, json.SecurityConfig())
	if err != nil {
		panic(err)
	}
	fmt.Println("セキュリティモードでの比較:", equal)
	// 出力: セキュリティモードでの比較: true
}
```

### JSON のマージ

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	json1 := `{"a": 1, "b": {"x": 10}}`
	json2 := `{"b": {"y": 20}, "c": 3}`

	// マージ
	merged, _ := json.MergeJSON(json1, json2)
	fmt.Println("Merged:", merged)
	// {"a":1,"b":{"x":10,"y":20},"c":3}

	// 複数をマージ
	result, _ := json.MergeMany([]string{
		`{"a":1}`,
		`{"b":2}`,
		`{"d": 4}`,
	})
	fmt.Println("Merged many:", result)
}
```

### ディープコピー（エンコードしてからデコード）

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := map[string]any{
		"name": "Alice",
		"tags": []string{"go", "json"},
		"meta": map[string]any{
			"level": 5,
		},
	}

	copied, err := json.Marshal(data)
	if err != nil {
		panic(err)
	}

	// ディープコピー: エンコード後に再デコード
	var deepCopy map[string]any
	json.Unmarshal(copied, &deepCopy)

	// コピーを変更しても元のデータには影響しない
	deepCopy["name"] = "Bob"
	fmt.Println("Original:", data["name"]) // Alice
	fmt.Println("Copy:", deepCopy["name"]) // Bob
}
```

## その他の例

- [高度な機能のサンプル](./examples-advanced) — バッチエンコード、事前パース、フックシステムなどの高度な機能
