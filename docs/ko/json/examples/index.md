---
sidebar_label: "기본 예제"
title: "사용 예제 - CyberGo JSON | 실전 코드 예제"
description: "CyberGo JSON 실전 예제: 경로 쿼리와 수정, 구조체 Marshal/Unmarshal, 제네릭 API, Processor 재사용과 캐시 워밍업, 반복 순회와 병렬 처리, JSONL 스트리밍, Hook, Schema 검증과 오류 처리를 실행 가능한 Go 코드로 제공합니다."
sidebar_position: 1
---

# 사용 예제

이 문서는 `github.com/cybergodev/json` 라이브러리의 실전 코드 예제를 제공합니다.

## 기본 작업

### 경로 쿼리

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

	// 간단한 경로
	name := json.GetString(data, "user.name")
	fmt.Println("Name:", name)

	// 중첩 경로
	city := json.GetString(data, "user.profile.city")
	age := json.GetInt(data, "user.profile.age")
	fmt.Printf("City: %s, Age: %d\n", city, age)

	// 배열 인덱스
	firstTag := json.GetString(data, "tags.0")
	firstScore := json.GetInt(data, "scores.0")
	fmt.Printf("First tag: %s, First score: %d\n", firstTag, firstScore)

	// 배열 가져오기
	tags := json.GetArray(data, "tags")
	fmt.Println("Tags:", tags)

	// 객체 가져오기
	profile := json.GetObject(data, "user.profile")
	fmt.Println("Profile:", profile)

	// 기본값으로 가져오기
	country := json.GetString(data, "user.profile.country", "Unknown")
	phone := json.GetString(data, "user.phone", "N/A")
	fmt.Printf("Country: %s, Phone: %s\n", country, phone)
}
```

### 여러 필드 일괄 가져오기

`GetMultiple` 한 번으로 JSON 을 한 번만 파싱해 여러 경로의 값을 가져올 수 있습니다; 개별 `Get` 는 매번 캐시 키 조회를 다시 거칩니다:

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

	fmt.Println("주문 번호:", values["order.id"])
	fmt.Println("상태:", values["order.status"])
	fmt.Println("고객:", values["customer.name"])
	fmt.Println("합계:", values["total"])
}

// 출력:
// 주문 번호: 5001
// 상태: shipped
// 고객: Alice
// 합계: 129.9
```

:::tip 주의
`GetMultiple` 은 **첫 번째** 실패한 경로의 오류를 반환합니다 (결과 map 에서 실패한 경로의 값은 `nil`), 따라서 예제의 모든 경로가 존재해야 합니다; 선택적 필드를 탐색할 때는 기본값을 갖는 `GetString`/`GetInt` 이나 [`SafeGet`](./examples-advanced) 을 사용하세요.
:::

### JSON 수정

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"name": "old", "version": 1}`

	// 단일 값 수정
	updated, _ := json.Set(data, "name", "new")
	fmt.Println("After set:", updated)

	// 새 필드 추가
	updated, _ = json.Set(updated, "active", true)
	fmt.Println("After add:", updated)

	// 여러 필드를 개별적으로 설정
	updated, _ = json.Set(updated, "version", 2)
	updated, _ = json.Set(updated, "author", "CyberGo")
	updated, _ = json.Set(updated, "tags", []string{"json", "go"})
	fmt.Println("After batch:", updated)

	// 필드 삭제
	updated, _ = json.Delete(updated, "author")
	fmt.Println("After delete:", updated)

	// 중첩 수정
	nested := `{"config": {"database": {"host": "localhost"}}}`
	nested, _ = json.Set(nested, "config.database.host", "192.168.1.1")
	nested, _ = json.Set(nested, "config.database.port", 3306)
	fmt.Println("Nested:", nested)
}
```

## 구조체 인코딩/디코딩

### 기본 인코딩/디코딩

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

	// 인코딩
	data, err := json.Marshal(user)
	if err != nil {
		panic(err)
	}
	fmt.Println("Encoded:", string(data))

	// 포맷팅 인코딩
	pretty, _ := json.MarshalIndent(user, "", "  ")
	fmt.Println("Pretty:\n", string(pretty))

	// 디코딩
	var decoded User
	err = json.Unmarshal(data, &decoded)
	if err != nil {
		panic(err)
	}
	fmt.Printf("Decoded: %+v\n", decoded)
}
```

### 중첩 구조체

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

	// JSON 문자열에서 중첩 값 직접 가져오기
	city := json.GetString(string(data), "profile.address.city")
	fmt.Println("City:", city)
}
```

## 제네릭 API

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

	// 제네릭 디코딩
	config := json.GetTyped[Config](data, ".")
	fmt.Printf("Config: %+v\n", config)

	// 기본값 포함
	defaultConfig := Config{Host: "127.0.0.1", Port: 3000}
	cfg := json.GetTyped[Config](data, ".", defaultConfig)
	fmt.Printf("Config: %+v\n", cfg)
}
```

## Processor 사용

### 기본 사용

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// 프로세서 생성
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data := `{"users": [{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}]}`

	// 프로세서로 작업
	users := p.GetArray(data, "users")
	fmt.Println("Users:", users)

	// 사전 파싱으로 여러 쿼리 가속
	parsed, _ := p.PreParse(data)
	for i := 0; i < 2; i++ {
		name, _ := p.GetFromParsed(parsed, fmt.Sprintf("users.%d.name", i))
		fmt.Printf("User %d: %v\n", i, name)
	}
}
```

### 커스텀 설정

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"time"
)

func main() {
	// 커스텀 설정
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

	// 보안 설정으로 신뢰할 수 없는 입력 처리
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

### 캐시 웜업

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

	// 대형 JSON 데이터 (예제는 간략화, 실제로는 수천 줄일 수 있음)
	largeJSON := `{
        "users": [{"id": 1}, {"id": 2}],
        "products": [{"sku": "A-1"}],
        "orders": [{"no": 1001}]
    }`

	// 자주 사용하는 경로 웜업
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

## 반복 순회

### 배열 순회

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

	// 배열 순회
	p.ForeachWithPath(data, "users", func(key any, item *json.IterableValue) {
		id := item.GetInt("id")
		name := item.GetString("name")
		score := item.GetFloat64("score")
		fmt.Printf("User %d: %s (score: %.1f)\n", id, name, score)
	})
}
```

### 제어 흐름이 있는 반복

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
		// 5 보다 큰 값을 만나면 중지
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

### 필드 존재 여부 확인

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

### 배열 병렬 처리

`ParallelIterator` 는 worker 풀을 내장해 대형 배열에 Map/Filter/ForEach 를 병렬 실행하므로, goroutine 과 세마포어를 직접 작성할 필요가 없습니다:

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

	// 병렬 필터: 80 이상인 점수만 유지 (결과는 입력 순서 유지)
	passed := iter.Filter(func(_ int, v any) bool {
		return v.(float64) >= 80
	})
	fmt.Println("우수한 점수:", passed)

	// 병렬 매핑: 각 점수를 등급으로 환산 (결과는 입력과 동일한 위치)
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
	fmt.Println("등급:", grades)
}

// 출력:
// 우수한 점수: [85 94 99 88]
// 등급: [C B A C C A C B]
```

worker 수는 `Config.MaxConcurrency` 를 따릅니다 (기본 50, 배열 길이를 초과하면 자동으로 잘림); 콜백에서의 panic 은 복구되어 오류로 변환되어 반환되므로 프로세스가 죽지 않습니다. 배치 처리와 취소 사용법은 [동시성과 병렬 처리](../advanced/concurrency)를 참조하세요.

## JSONL 처리

### JSONL 파일 읽기

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

### 제네릭 JSONL 처리

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

### JSONL 쓰기

`JSONLWriter` 는 임의의 Go 값을 한 줄씩 JSONL (NDJSON) 로 씁니다. `Write` 는 단일 값을 인코딩해 줄바꿈을 추가하고, `WriteRaw` 는 이미 인코딩된 행을 그대로 씁니다 (재인코딩 오버헤드 생략), `Stats` 는 행 수와 바이트 수를 반환합니다:

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

	// Write: 단일 값을 한 줄 JSON 으로 인코딩 (줄바꿈 자동 추가)
	if err := writer.Write(map[string]any{"id": 1, "name": "Alice"}); err != nil {
		panic(err)
	}
	if err := writer.Write(map[string]any{"id": 2, "name": "Bob"}); err != nil {
		panic(err)
	}

	// WriteRaw: 이미 인코딩된 행을 씀 (끝에 줄바꿈이 없으면 자동 추가)
	if err := writer.WriteRaw([]byte(`{"id":3,"name":"Charlie"}`)); err != nil {
		panic(err)
	}

	// 파일에 쓸 때는 bytes.Buffer 를 os.Create 의 *os.File 로 바꾸면 됩니다
	stats := writer.Stats()
	fmt.Printf("%d줄을 썼고, 총 %d바이트\n", stats.LinesProcessed, stats.BytesWritten)
	fmt.Print(buf.String())
}

// 출력:
// 3줄을 썼고, 총 72바이트
// {"id":1,"name":"Alice"}
// {"id":2,"name":"Bob"}
// {"id":3,"name":"Charlie"}
```

배치 데이터는 `WriteAll([]any{...})` 로 한 번에 쓸 수 있습니다; 첫 번째 오류는 캐시되어 이후 호출이 같은 오류를 바로 반환하며, `writer.Err()` 로 언제든 조회할 수 있습니다.

## 스트림 처리

### 대용량 JSON 스트림 처리

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// 프로세서 생성
	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	// ForeachFile 로 대용량 파일 스트림 처리
	count := 0
	err = processor.ForeachFile("large-array.json", func(key any, item *json.IterableValue) error {
		count++
		if count%1000 == 0 {
			fmt.Printf("Processed %d items...\n", count)
		}
		return nil // item.Break() 반환으로 중단 가능
	})

	if err != nil {
		panic(err)
	}
	fmt.Printf("Total items: %d\n", count)
}
```

### 객체 스트림 처리

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

	// JSON 객체 파일 처리 (키 - 값 쌍 구조)
	// 파일 형식: {"user1": {...}, "user2": {...}, ...}
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

## 훅 시스템

### 로깅 훅

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

### 타이밍 훅

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

	// 일부 작업 실행
	data := `{"users": [{"id": 1}, {"id": 2}]}`
	for i := 0; i < 100; i++ {
		p.Get(data, "users")
	}

	fmt.Println("Timing records:", recorder.records)
}
```

### 커스텀 검증 훅

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	cfg := json.DefaultConfig()
	cfg.AddHook(json.ValidationHook(func(jsonStr, path string) error {
		// 커스텀 검증 로직
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

## Schema 검증

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// Schema 정의
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

## 오류 처리

### 오류 타입 판단

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
		// 오류 타입 확인
		if errors.Is(err, json.ErrPathNotFound) {
			fmt.Println("Path not found")
		} else if errors.Is(err, json.ErrInvalidJSON) {
			fmt.Println("Invalid JSON")
		} else if errors.Is(err, json.ErrTypeMismatch) {
			fmt.Println("Type mismatch")
		}

		// 상세 오류 정보 가져오기
		var jsonErr *json.JsonsError
		if errors.As(err, &jsonErr) {
			fmt.Printf("Op: %s, Path: %s\n", jsonErr.Op, jsonErr.Path)
		}
	}
}
```

### 신뢰할 수 없는 입력 안전하게 처리

```go
package main

import (
	"errors"
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// 보안 설정 사용
	cfg := json.SecurityConfig()
	// SecurityConfig 는 기본적으로 10MB 로 제한됨, 여기서 1MB 로 추가 제한
	cfg.MaxJSONSize = 1024 * 1024 // 1MB 제한
	p, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// 신뢰할 수 없는 입력 시뮬레이션
	// 참고: 실제 공격은 더 큰 payload(예: 100MB+) 를 시도할 수 있습니다
	// 보안 설정은 MaxJSONSize 를 초과하는 입력을 차단합니다
	untrustedInputs := []string{
		`{"data": "normal"}`,
		`{"huge": "` + string(make([]byte, 2*1024*1024)) + `"}`,                                      // 2MB 입력 (1MB 제한 초과)
		`{"nested": {{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}`, // 너무 깊은 중첩
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

## 유틸리티 함수

### JSON 비교

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	json1 := `{"a": 1, "b": 2}`
	json2 := `{"b": 2, "a": 1}` // 키 순서가 다름

	equal, err := json.CompareJSON(json1, json2)
	if err != nil {
		panic(err)
	}
	fmt.Println("Equal:", equal) // true (의미적 동등)
}
```

### 설정이 의미상 동일한지 비교

`CompareJSON` 은 파싱해 정규화한 뒤 비교합니다: 키 순서가 다르거나 `3` 과 `3.0` 같은 수치 표기 차이는 모두 같은 값으로 취급됩니다. '설정이 실제로 바뀌었는지' 판단할 때 사용해, 포맷팅 차이를 변경으로 오탐하지 않도록 하세요:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	deployed := `{"port": 8080, "debug": false, "retries": 3}`
	// 같은 설정을 다시 직렬화한 결과: 키 순서가 섞이고 수치가 부동소수점 형태로 바뀜
	modified := `{
        "debug": false,
        "retries": 3.0,
        "port": 8080
    }`

	equal, err := json.CompareJSON(deployed, modified)
	if err != nil {
		panic(err)
	}
	fmt.Println("설정이 의미상 동일:", equal)
	// 출력: 설정이 의미상 동일: true

	// 신뢰할 수 없는 출처의 설정을 다룰 때는 보안 설정 추가 (크기/깊이 제한, 보안 스캔 수행)
	equal, err = json.CompareJSON(deployed, modified, json.SecurityConfig())
	if err != nil {
		panic(err)
	}
	fmt.Println("보안 모드에서 비교:", equal)
	// 출력: 보안 모드에서 비교: true
}
```

### JSON 병합

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	json1 := `{"a": 1, "b": {"x": 10}}`
	json2 := `{"b": {"y": 20}, "c": 3}`

	// 병합
	merged, _ := json.MergeJSON(json1, json2)
	fmt.Println("Merged:", merged)
	// {"a":1,"b":{"x":10,"y":20},"c":3}

	// 다중 병합
	result, _ := json.MergeMany([]string{
		`{"a":1}`,
		`{"b":2}`,
		`{"d": 4}`,
	})
	fmt.Println("Merged many:", result)
}
```

### 깊은 복사 (인코딩 후 디코딩)

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

	// 깊은 복사: 인코딩 후 다시 디코딩
	var deepCopy map[string]any
	json.Unmarshal(copied, &deepCopy)

	// 복사본 수정은 원본에 영향 없음
	deepCopy["name"] = "Bob"
	fmt.Println("Original:", data["name"]) // Alice
	fmt.Println("Copy:", deepCopy["name"]) // Bob
}
```

## 더 많은 예제

- [고급 기능 예제](./examples-advanced) — 배치 인코딩, 사전 파싱, 훅 시스템 등 고급 기능
