---
sidebar_label: "JSONL"
title: "Processor JSONL 메서드 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON Processor JSONL 메서드: StreamJSONL 행 단위 스트리밍, StreamJSONLParallel 병렬, ForeachJSONL 반복, MapJSONL 매핑, ReduceJSONL 리듀스와 FilterJSONL 필터로 스트리밍 처리에 적합합니다."
sidebar_position: 8
---

# Processor JSONL 메서드

Processor 는 줄별 처리, 병렬 처리, 배치 처리, 함수형 작업을 지원하는 완전한 JSONL (JSON Lines) 스트리밍 처리 능력을 제공합니다.

::: tip 전체 튜토리얼
JSONL/NDJSON 개념 설명과 스트리밍 처리 실전이 궁금하신가요? [JSONL 프로세서](../../streaming/jsonl) 전체 튜토리얼을 참조하세요.
:::

## 스트리밍 읽기 메서드

### StreamJSONL

시그니처: `func (p *Processor) StreamJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) error) error`

JSONL 데이터를 스트리밍 처리하며 줄 단위로 읽고 콜백 함수를 호출합니다. 콜백이 `nil` 을 반환하면 다음 줄을 계속 처리하고, `item.Break()` 를 반환하면 깔끔하게 조기 종료합니다 (전체 반환은 `nil`), 다른 오류를 반환하면 즉시 중지하고 그 오류를 반환합니다. 콜백 내의 panic 은 잡혀 오류로 변환되어 반환되며 프로세스를 뚫고 나가지 않습니다.

**매개변수**

| 이름 | 타입 | 설명 |
|------|------|------|
| `reader` | `io.Reader` | JSONL 데이터 소스 |
| `fn` | `func(lineNum int, item *IterableValue) error` | 처리 함수: `nil` 계속 / `item.Break()` 중지 / 다른 오류는 중단 |

```go
processor, _ := json.New()
defer processor.Close()

file, _ := os.Open("logs.jsonl")
defer file.Close()

err := processor.StreamJSONL(file, func(lineNum int, item *json.IterableValue) error {
	level := item.GetString("level")
	msg := item.GetString("message")
	fmt.Printf("[%d] %s: %s\n", lineNum, level, msg)
	return nil
})
```

---

### StreamJSONLParallel

시그니처: `func (p *Processor) StreamJSONLParallel(reader io.Reader, workers int, fn func(lineNum int, item *IterableValue) error) error`

JSONL 데이터를 병렬 처리하며, 여러 워커 goroutine 으로 처리를 가속합니다.

**매개변수**

| 이름 | 타입 | 설명 |
|------|------|------|
| `reader` | `io.Reader` | JSONL 데이터 소스 |
| `workers` | `int` | 워커 goroutine 수 (≤0 이면 기본 4) |
| `fn` | `func(lineNum int, item *IterableValue) error` | 처리 함수 |

```go
processor, _ := json.New()
defer processor.Close()

file, _ := os.Open("large.jsonl")
defer file.Close()

var count int64
err := processor.StreamJSONLParallel(file, 8, func(lineNum int, item *json.IterableValue) error {
	atomic.AddInt64(&count, 1)
	// CPU 집약적 처리...
	return nil
})
fmt.Printf("%d 줄 처리\n", count)
```

::: tip 성능 권장
- CPU 집약적 작업 (데이터 변환, 계산) 에 적합
- I/O 집약적 작업은 단일 스레드 `StreamJSONL` 권장
- workers 수는 CPU 코어 수로 설정하는 것을 권장
:::

### StreamJSONLParallelWithContext

시그니처: `func (p *Processor) StreamJSONLParallelWithContext(ctx context.Context, reader io.Reader, workers int, fn func(lineNum int, item *IterableValue) error) error`

컨텍스트가 있는 JSONL 병렬 처리로, 취소와 타임아웃 제어를 지원합니다.

**매개변수**

| 이름 | 타입 | 설명 |
|------|------|------|
| `ctx` | `context.Context` | 컨텍스트, 취소 또는 타임아웃에 사용 |
| `reader` | `io.Reader` | JSONL 데이터 소스 |
| `workers` | `int` | 워커 goroutine 수 (≤0 이면 기본 4) |
| `fn` | `func(lineNum int, item *IterableValue) error` | 처리 함수 |

```go
processor, _ := json.New()
defer processor.Close()

ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()

err := processor.StreamJSONLParallelWithContext(ctx, reader, 8, func(lineNum int, item *json.IterableValue) error {
	return nil
})
if err != nil {
	log.Fatal(err)
}
```

---

### StreamJSONLChunked

시그니처: `func (p *Processor) StreamJSONLChunked(reader io.Reader, chunkSize int, fn func(chunk []*IterableValue) error) error`

JSONL 데이터를 청크 단위로 처리하며, 한 번에 요소 묶음을 처리합니다.

**매개변수**

| 이름 | 타입 | 설명 |
|------|------|------|
| `reader` | `io.Reader` | JSONL 데이터 소스 |
| `chunkSize` | `int` | 배치당 요소 수 |
| `fn` | `func(chunk []*IterableValue) error` | 배치 처리 함수 |

```go
processor, _ := json.New()
defer processor.Close()

file, _ := os.Open("data.jsonl")
defer file.Close()

err := processor.StreamJSONLChunked(file, 100, func(chunk []*json.IterableValue) error {
	// 데이터베이스 배치 삽입
	records := make([]Record, len(chunk))
	for i, item := range chunk {
		records[i] = Record{
			ID:   item.GetInt("id"),
			Name: item.GetString("name"),
		}
	}
	return db.BatchInsert(records)
})
```

---

### StreamJSONLFile

시그니처: `func (p *Processor) StreamJSONLFile(filename string, fn func(lineNum int, item *IterableValue) error) error`

파일에서 JSONL 데이터를 직접 스트리밍 처리합니다.

```go
processor, _ := json.New()
defer processor.Close()

err := processor.StreamJSONLFile("logs.jsonl", func(lineNum int, item *json.IterableValue) error {
	if item.GetString("level") == "error" {
		logErrors(item)
	}
	return nil
})
```

---

## 함수형 작업 메서드

### ForeachJSONL

시그니처: `func (p *Processor) ForeachJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) error) error`

JSONL 데이터를 순회하는 별칭 메서드로, 동작은 `StreamJSONL` 과 같습니다.

```go
err := processor.ForeachJSONL(file, func(lineNum int, item *json.IterableValue) error {
	fmt.Printf("줄 %d: %v\n", lineNum, item.GetData())
	return nil
})
```

---

### MapJSONL

시그니처: `func (p *Processor) MapJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) (any, error)) ([]any, error)`

JSONL 데이터를 새 형식으로 매핑하고 변환된 슬라이스를 반환합니다.

```go
processor, _ := json.New()
defer processor.Close()

file, _ := os.Open("users.jsonl")
defer file.Close()

// 모든 사용자 이름 추출
names, err := processor.MapJSONL(file, func(lineNum int, item *json.IterableValue) (any, error) {
	return item.GetString("name"), nil
})
// names: []any{"Alice", "Bob", "Charlie"}
```

---

### ReduceJSONL

시그니처: `func (p *Processor) ReduceJSONL(reader io.Reader, initial any, fn func(acc any, item *IterableValue) any) (any, error)`

JSONL 데이터를 단일 값으로 리듀스합니다.

```go
processor, _ := json.New()
defer processor.Close()

file, _ := os.Open("sales.jsonl")
defer file.Close()

// 총 매출 계산
total, err := processor.ReduceJSONL(file, 0.0, func(acc any, item *json.IterableValue) any {
	price := item.GetFloat64("price")
	return acc.(float64) + price
})
fmt.Printf("총 매출: %.2f\n", total.(float64))
```

---

### FilterJSONL

시그니처: `func (p *Processor) FilterJSONL(reader io.Reader, predicate func(item *IterableValue) bool) ([]*IterableValue, error)`

JSONL 데이터를 필터링하여 조건을 만족하는 요소를 반환합니다.

```go
processor, _ := json.New()
defer processor.Close()

file, _ := os.Open("logs.jsonl")
defer file.Close()

// 오류 로그 선별
errors, err := processor.FilterJSONL(file, func(item *json.IterableValue) bool {
	return item.GetString("level") == "error"
})
fmt.Printf("오류 로그 %d 건 발견\n", len(errors))
```

---

### CollectJSONL

시그니처: `func (p *Processor) CollectJSONL(reader io.Reader) ([]*IterableValue, error)`

모든 JSONL 데이터를 슬라이스로 수집합니다.

```go
processor, _ := json.New()
defer processor.Close()

file, _ := os.Open("data.jsonl")
defer file.Close()

items, err := processor.CollectJSONL(file)
if err != nil {
	panic(err)
}
fmt.Printf("%d 개 레코드 수집\n", len(items))
```

::: warning 메모리 주의
이 메서드는 모든 데이터를 메모리에 로드하므로 초대형 파일에는 적합하지 않습니다. 대용량 파일은 `StreamJSONL` 로 줄별 처리하세요.
:::

---

### FirstJSONL

시그니처: `func (p *Processor) FirstJSONL(reader io.Reader, predicate func(item *IterableValue) bool) (*IterableValue, bool, error)`

조건을 만족하는 첫 번째 요소를 찾습니다.

**반환값**

| 타입 | 설명 |
|------|------|
| `*IterableValue` | 찾은 요소 (존재하는 경우) |
| `bool` | 찾았는지 여부 |
| `error` | 오류 정보 |

```go
processor, _ := json.New()
defer processor.Close()

file, _ := os.Open("users.jsonl")
defer file.Close()

// 첫 번째 관리자 찾기
admin, found, err := processor.FirstJSONL(file, func(item *json.IterableValue) bool {
	return item.GetBool("is_admin")
})
if err != nil {
	panic(err)
}
if found {
	fmt.Printf("관리자: %s\n", admin.GetString("name"))
}
```

---

## NDJSONProcessor 독립 프로세서

`NDJSONProcessor` 는 `Processor` 와 별개인 NDJSON (개행 구분 JSON) 줄별 프로세서입니다: 콜백이 (`IterableValue` 가 아니라) `map[string]any` 를 직접 받고, `Processor` 인스턴스 생성이 필요 없으며, 빈 줄을 **항상** 건너뜁니다. 객체 줄을 간단히 소비하는 시나리오에 적합합니다; 타입화된 값 조회, 병렬 처리, Map/Reduce/Filter 함수형 조합이 필요하면 이 페이지 위쪽의 `StreamJSONL` 계열을 사용하세요.

### NewNDJSONProcessor

시그니처: `func NewNDJSONProcessor(cfg ...Config) *NDJSONProcessor`

`NewNDJSONProcessor` 는 선택적 cfg 를 받으며, 통일된 Config 패턴을 따릅니다.

**매개변수**

| 이름 | 타입 | 설명 |
|------|------|------|
| `cfg` | `...Config` | 선택적 설정, 미전달 시 `DefaultConfig()` 사용; 읽기 버퍼는 `JSONLBufferSize` (≤0 이면 64KB 로 폴백) |

나머지 JSONL 필드 (`JSONLMaxLineSize`, `JSONLMaxMemory`, `JSONLSkipComments`, `JSONLContinueOnErr`, `MaxNestingDepthSecurity`) 도 처리에 적용되며, 의미는 [설정 옵션](#설정-옵션) 을 참조하세요.

### ProcessFile

시그니처: `func (np *NDJSONProcessor) ProcessFile(filename string, fn func(lineNum int, obj map[string]any) error) error`

`ProcessFile` 은 NDJSON 파일을 줄별로 처리합니다. 파일 경로는 먼저 경로 순회 등 보안 검증을 거치고 (잘못된 경로는 `ErrSecurityViolation` 반환), 이후 열린 파일에 `ProcessReader` 를 호출하는 것과 동등합니다; 파일 열기 실패 등의 오류는 `JsonsError` 로 래핑되어 반환됩니다.

**매개변수**

| 이름 | 타입 | 설명 |
|------|------|------|
| `filename` | `string` | NDJSON 파일 경로 (먼저 보안 검증) |
| `fn` | `func(lineNum int, obj map[string]any) error` | 줄별 콜백, 오류 반환 시 즉시 종료되고 그대로 반환 |

### ProcessReader

시그니처: `func (np *NDJSONProcessor) ProcessReader(reader io.Reader, fn func(lineNum int, obj map[string]any) error) error`

`ProcessReader` 는 `io.Reader` 에서 NDJSON 을 줄별로 처리합니다: 각 줄을 `map[string]any` 로 파싱한 뒤 콜백을 호출하며, 콜백 panic 은 잡혀 오류로 변환되어 반환됩니다. 보안 제한은 `StreamJSONL` 계열과 같습니다 — 한 줄 크기는 `JSONLMaxLineSize` (폴백 체인 `MaxJSONSize` → 100MB), 총 처리량은 `JSONLMaxMemory` (폴백 `MaxMemory`), 줄 파싱 전 `MaxNestingDepthSecurity` 로 중첩 깊이 검사; `JSONLContinueOnErr=true` 면 파싱에 실패한 줄을 건너뛰고 계속합니다.

**매개변수**

| 이름 | 타입 | 설명 |
|------|------|------|
| `reader` | `io.Reader` | NDJSON 데이터 소스 |
| `fn` | `func(lineNum int, obj map[string]any) error` | 줄별 콜백, 오류 반환 시 즉시 종료되고 그대로 반환 |

<!-- check-code: skip -->
```go
np := json.NewNDJSONProcessor()

err := np.ProcessReader(strings.NewReader(`{"id":1}`), func(lineNum int, obj map[string]any) error {
	fmt.Printf("줄 %d: id=%v\n", lineNum, obj["id"])
	return nil
})
```

**전체 예제** (빈 줄은 항상 건너뛰며, 줄 번호는 원본 물리 줄 번호를 유지):

```go
package main

import (
	"fmt"
	"strings"

	"github.com/cybergodev/json"
)

func main() {
	np := json.NewNDJSONProcessor()

	data := "{\"id\":1}\n\n{\"id\":2}\n"
	var count int

	err := np.ProcessReader(strings.NewReader(data), func(lineNum int, obj map[string]any) error {
		count++
		fmt.Printf("줄 %d: id=%v\n", lineNum, obj["id"])
		return nil
	})
	if err != nil {
		panic(err)
	}
	fmt.Printf("총 %d 줄 처리\n", count)
	// 출력:
	// 줄 1: id=1
	// 줄 3: id=2
	// 총 2 줄 처리
}
```

::: tip StreamJSONL 과의 선택
콜백이 `map[string]any` 를 직접 받아 코드가 가장 단순할 때는 `NDJSONProcessor`; `IterableValue` 타입화 조회 (`GetInt`/`GetString`), 병렬 워커, 청크 또는 함수형 파이프라인이 필요하면 `StreamJSONL` 계열을 사용하세요. 둘은 같은 JSONL 보안 제한의 지배를 받습니다.
:::

---

## 설정 옵션

JSONL 처리 동작은 `Config` 의 다음 필드로 설정할 수 있습니다:

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `JSONLBufferSize` | `int` | 65536 (64KB) | 읽기 버퍼 크기 |
| `JSONLMaxLineSize` | `int` | 1048576 (1MB) | 한 줄 최대 바이트 수 |
| `JSONLSkipEmpty` | `bool` | `true` | 빈 줄 건너뜀 |
| `JSONLSkipComments` | `bool` | `false` | `#` 또는 `//` 주석 건너뜀 |
| `JSONLContinueOnErr` | `bool` | `false` | 파싱 오류 시 계속 (`StreamLinesInto` 와 `NDJSONProcessor` 에만 작용; 이 페이지의 `StreamJSONL` 계열은 파싱 오류를 만나면 항상 중단) |
| `JSONLWorkers` | `int` | 4 | 병렬 처리 워커 goroutine 수 |
| `JSONLChunkSize` | `int` | 1000 | 청크 처리 배치 크기 |
| `JSONLMaxMemory` | `int64` | 104857600 (100MB) | 최대 메모리 사용 |

::: tip Processor 메서드는 per-call cfg 를 받지 않음
이 페이지의 Processor 메서드 JSONL 동작은 **모두 `New(cfg)` 시점에 굳어진 설정에서 나옵니다** (메서드 시그니처에 `cfg ...Config` 가 없음); 호출별로 설정을 바꾸려면 [패키지 레벨 JSONL 함수](../functions/jsonl) 의 마지막 `cfg` 를 사용하세요. 또한 `StreamJSONLParallel` 의 명시적 `workers` 매개변수와 `StreamJSONLChunked` 의 명시적 `chunkSize` 매개변수는 `JSONLWorkers` / `JSONLChunkSize` 필드보다 **우선**합니다. 그리고 각 줄은 파싱 전에 `MaxNestingDepthSecurity` 로 중첩 깊이 검사를 거쳐 깊은 중첩 페이로드가 스택을 치는 것을 방지합니다.
:::

```go
cfg := json.DefaultConfig()
cfg.JSONLSkipComments = true  // 주석 줄 건너뜀
cfg.JSONLContinueOnErr = true // 파싱 오류 시 계속
cfg.JSONLWorkers = 8          // 병렬 워커 8 개

processor, _ := json.New(cfg)
defer processor.Close()
```

---

## 전체 예제

### 로그 분석

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"os"
)

func main() {
	processor, _ := json.New()
	defer processor.Close()

	file, _ := os.Open("app.log.jsonl")
	defer file.Close()

	var errorCount, warningCount int

	err := processor.StreamJSONL(file, func(lineNum int, item *json.IterableValue) error {
		level := item.GetString("level")
		switch level {
		case "error":
			errorCount++
			fmt.Printf("[ERROR] %s\n", item.GetString("message"))
		case "warning":
			warningCount++
		}
		return nil
	})

	if err != nil {
		panic(err)
	}

	fmt.Printf("통계: 오류 %d 건, 경고 %d 건\n", errorCount, warningCount)
}
```

### 병렬 데이터 처리

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"os"
	"sync/atomic"
)

func main() {
	cfg := json.DefaultConfig()
	cfg.JSONLWorkers = 16 // 병렬 워커 16 개

	processor, _ := json.New(cfg)
	defer processor.Close()

	file, _ := os.Open("large_data.jsonl")
	defer file.Close()

	var processed int64

	err := processor.StreamJSONLParallel(file, 16, func(lineNum int, item *json.IterableValue) error {
		// CPU 집약적 처리 (비즈니스 로직으로 교체)
		_ = item
		atomic.AddInt64(&processed, 1)
		return nil
	})

	if err != nil {
		panic(err)
	}

	fmt.Printf("병렬로 %d 개 레코드 처리\n", processed)
}
```

---

## 관련 문서

- [JSONL 프로세서](../../streaming/jsonl) - 패키지 레벨 JSONL 함수
- [대용량 파일 처리](../../streaming/large-files) - 대용량 파일 처리 가이드
- [이터레이터](../iterator) - IterableValue 타입 상세
