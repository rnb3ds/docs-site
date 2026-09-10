---
sidebar_label: "JSONL"
title: "JSONL 처리 함수 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON JSONL 함수: ParseJSONL/ToJSONL/ToJSONLString 변환, StreamJSONL/ForeachJSONL 스트리밍, StreamLinesInto[T] 제네릭 스트림과 NewJSONLWriter 쓰기."
sidebar_position: 8
---

# JSONL 처리 함수

json 패키지가 제공하는 JSONL (JSON Lines) 처리 함수로, 개행으로 구분된 JSON 데이터의 파싱, 스트리밍 읽기, 변환, 쓰기를 지원합니다.

::: tip 전체 튜토리얼
JSONL/NDJSON 의 개념, 스트리밍 처리 패턴, 실전 용법이 궁금하신가요? [JSONL 프로세서](../../streaming/jsonl) 전체 튜토리얼을 참조하세요.
:::

## JSONL 처리 함수

JSONL (JSON Lines) 은 개행으로 구분된 JSON 형식으로, 한 줄에 하나의 독립된 JSON 객체가 있습니다.

### ParseJSONL

시그니처: `func ParseJSONL(data []byte, cfg ...Config) ([]any, error)`

JSONL (개행 구분 JSON) 데이터를 파싱합니다.

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `data` | `[]byte` | 예 | JSONL 바이트 데이터 |
| `cfg` | `Config` | 아니오 | 선택적 설정 |

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	jsonl := `{"name":"Alice"}
{"name":"Bob"}
{"name":"Charlie"}`
	results, err := json.ParseJSONL([]byte(jsonl))
	if err != nil {
		panic(err)
	}
	for i, r := range results {
		fmt.Printf("[%d] %v\n", i, r)
	}
}
```

### StreamLinesInto

시그니처: `func StreamLinesInto[T any](reader io.Reader, fn func(lineNum int, data T) error, cfg ...Config) ([]T, error)`

io.Reader 에서 JSONL 데이터를 스트리밍으로 읽어 콜백 함수로 각 줄을 처리합니다. 권장되는 제네릭 JSONL 처리 방식입니다.

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `reader` | `io.Reader` | 예 | 데이터 소스 |
| `fn` | `func(lineNum int, data T) error` | 예 | 처리 콜백 (줄 번호와 데이터를 받음) |
| `cfg` | `Config` | 아니오 | 선택적 설정 |

**반환값**

| 타입 | 설명 |
|------|------|
| `[]T` | 처리된 모든 결과의 슬라이스 |
| `error` | 오류 정보 |

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"strings"
)

type User struct {
	Name string `json:"name"`
}

func main() {
	src := `{"name":"Alice"}
{"name":"Bob"}`

	// 기본 사용법
	results, err := json.StreamLinesInto[User](strings.NewReader(src), func(lineNum int, user User) error {
		fmt.Printf("줄 %d: 사용자 %s\n", lineNum, user.Name)
		return nil // error 반환으로 처리 중단 가능
	})
	if err != nil {
		panic(err)
	}
	fmt.Printf("총 %d 개 레코드 처리\n", len(results))
}
```

### ToJSONL

시그니처: `func ToJSONL(data []any, cfg ...Config) ([]byte, error)`

데이터 슬라이스를 JSONL 형식으로 변환합니다.

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `data` | `[]any` | 예 | 데이터 슬라이스 |
| `cfg` | `Config` | 아니오 | 선택적 설정 |

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	items := []any{
		map[string]any{"name": "Alice"},
		map[string]any{"name": "Bob"},
	}
	jsonl, err := json.ToJSONL(items)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(jsonl))
	// {"name":"Alice"}
	// {"name":"Bob"}
}
```

### ToJSONLString

시그니처: `func ToJSONLString(data []any, cfg ...Config) (string, error)`

데이터 슬라이스를 JSONL 문자열로 변환합니다.

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `data` | `[]any` | 예 | 데이터 슬라이스 |
| `cfg` | `Config` | 아니오 | 선택적 설정 |

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	items := []any{
		map[string]any{"name": "Alice"},
		map[string]any{"name": "Bob"},
	}
	jsonlStr, err := json.ToJSONLString(items)
	if err != nil {
		panic(err)
	}
	fmt.Println(jsonlStr)
}
```

## JSONL 스트리밍 처리 함수 (패키지 레벨)

json 패키지가 제공하는 JSONL 스트리밍 처리 패키지 레벨 편의 함수로, 시그니처는 대응 Processor 메서드와 같고 끝에 선택적 `cfg ...Config` 인자를 추가로 받습니다; 내부적으로 `cfg` 별로 캐시된 전역 Processor 를 사용하므로 인스턴스를 직접 만들 필요가 없어 일회성 처리 시나리오에 적합합니다. 여러 번 처리하거나 같은 설정을 공유할 때는 [`json.New(cfg)`](../processor/#new) 로 독립 Processor 를 만드는 것을 권장합니다.

전체 용법과 예제는 [JSONL 스트리밍 처리 가이드](../../streaming/jsonl#패키지-레벨-함수) 와 [Processor JSONL 메서드](../processor/jsonl) 를 참조하세요.

**선택 기준**

| 시나리오 | 추천 |
|------|------|
| 줄별 처리 (순서 민감) | `StreamJSONL` / `ForeachJSONL` |
| CPU 집약적인 줄 처리 (순서 무관) | `StreamJSONLParallel` |
| 중간 취소/타임아웃 필요 | `StreamJSONLParallelWithContext` |
| 배치 저장 등 청크 소비 | `StreamJSONLChunked` |
| 구체적 구조체 `T` 로 디코딩 | `StreamLinesInto[T]` |
| 변환 / 집계 / 필터 / 첫 번째 찾기 | `MapJSONL` / `ReduceJSONL` / `FilterJSONL` / `FirstJSONL` |
| 전체 수집 | `CollectJSONL` (전체가 메모리에 상주, 대용량 파일은 주의) |

**동작 요점**

- **잘못된 줄 처리**: `StreamJSONL` 계열은 파싱할 수 없는 줄을 만나면 **즉시 중단**하고 `line N: ...` 형식의 오류를 반환합니다; `StreamLinesInto` 만 `Config.JSONLContinueOnErr` 을 따릅니다 (`true` 면 잘못된 줄을 건너뛰고 계속).
- **깊이 가드**: 각 줄 파싱 전에 중첩 깊이 검사를 실행 (`MaxNestingDepthSecurity`, 기본 200) 하여 깊은 중첩 줄로 인한 스택 오버플로를 방지합니다.
- **병렬 의미**: `StreamJSONLParallel` 은 `workers <= 0` 이면 4 로 취급합니다; 콜백은 여러 goroutine 에서 동시 실행되므로 직접 동시성 안전을 보장해야 합니다. 콜백이 `item.Break()` 를 반환하는 것은 **정상적인** 조기 종료입니다 (`nil` 반환); 다른 오류를 반환하면 나머지 작업을 취소하고 함수 반환값이 됩니다.
- **메모리 가드**: `JSONLMaxMemory` (설정하지 않으면 `MaxMemory` 로 폴백) 이 처리된 총 바이트 수를 제한하며, 초과하면 중단합니다.

### StreamJSONL

시그니처: `func StreamJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) error, cfg ...Config) error`

JSONL 을 줄 단위로 스트리밍 처리하며, 각 줄을 `IterableValue` 로 파싱한 뒤 콜백을 호출합니다.

### StreamJSONLParallel

시그니처: `func StreamJSONLParallel(reader io.Reader, workers int, fn func(lineNum int, item *IterableValue) error, cfg ...Config) error`

`workers` 개의 병렬 goroutine 으로 JSONL 을 처리합니다 (CPU 집약형 시나리오).

### StreamJSONLParallelWithContext

시그니처: `func StreamJSONLParallelWithContext(ctx context.Context, reader io.Reader, workers int, fn func(lineNum int, item *IterableValue) error, cfg ...Config) error`

컨텍스트 취소/타임아웃을 지원하는 병렬 JSONL 처리입니다.

### StreamJSONLChunked

시그니처: `func StreamJSONLChunked(reader io.Reader, chunkSize int, fn func(chunk []*IterableValue) error, cfg ...Config) error`

`chunkSize` 씩 나누어 처리하며, 각 배치는 `[]*IterableValue` 로 콜백에 전달됩니다.

### ForeachJSONL

시그니처: `func ForeachJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) error, cfg ...Config) error`

JSONL 을 순회합니다 (`StreamJSONL` 과 동일한 동작의 별칭).

### MapJSONL

시그니처: `func MapJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) (any, error), cfg ...Config) ([]any, error)`

각 줄을 새 값으로 매핑하고 결과 슬라이스를 반환합니다.

### ReduceJSONL

시그니처: `func ReduceJSONL(reader io.Reader, initial any, fn func(acc any, item *IterableValue) any, cfg ...Config) (any, error)`

JSONL 을 단일 값으로 리듀스하며, `initial` 은 누산기 초깃값입니다.

### FilterJSONL

시그니처: `func FilterJSONL(reader io.Reader, predicate func(item *IterableValue) bool, cfg ...Config) ([]*IterableValue, error)`

조건자로 필터링하여 일치 항목의 슬라이스를 반환합니다.

### StreamJSONLFile

시그니처: `func StreamJSONLFile(filename string, fn func(lineNum int, item *IterableValue) error, cfg ...Config) error`

JSONL 파일 전체를 직접 스트리밍 처리합니다.

### CollectJSONL

시그니처: `func CollectJSONL(reader io.Reader, cfg ...Config) ([]*IterableValue, error)`

JSONL 의 모든 줄을 읽어 슬라이스로 수집합니다 (주의: 전체가 메모리에 로드되므로 대용량 파일은 `StreamJSONL` 권장).

### FirstJSONL

시그니처: `func FirstJSONL(reader io.Reader, predicate func(item *IterableValue) bool, cfg ...Config) (*IterableValue, bool, error)`

조건자를 만족하는 첫 번째 요소를 반환합니다; 두 번째 반환값은 찾았는지 여부입니다.

## JSONL 설정

::: warning
JSONLConfig 독립 구조체와 `DefaultJSONLConfig()` 함수는 제거되었습니다. JSONL 설정은 `Config` 의 `JSONL*` 필드로 통합되었습니다.
:::

### Config 로 JSONL 설정

```go
cfg := json.DefaultConfig()

// JSONL 설정
cfg.JSONLBufferSize = 64 * 1024        // 읽기 버퍼 크기 (기본: 64KB)
cfg.JSONLMaxLineSize = 1024 * 1024     // 한 줄 최대 크기 (기본: 1MB)
cfg.JSONLSkipEmpty = true              // 빈 줄 건너뜀 (기본: true)
cfg.JSONLSkipComments = false          // 주석 줄 건너뜀 (기본: false)
cfg.JSONLContinueOnErr = false         // 오류 시 계속 (기본: false)
cfg.JSONLWorkers = 4                   // 병렬 워커 수 (기본: 4)
cfg.JSONLChunkSize = 1000              // 배치당 처리 줄 수 (기본: 1000)
cfg.JSONLMaxMemory = 100 * 1024 * 1024 // 최대 메모리 (기본: 100MB)

processor, err := json.New(cfg)
```

자세한 내용은 [Config 설정](../config#config-구조체) 을 참조하세요.

## JSONL 작성기

### NewJSONLWriter

시그니처: `func NewJSONLWriter(writer io.Writer, cfg ...Config) *JSONLWriter`

JSONL 작성기를 생성합니다.

```go
package main

import (
	"github.com/cybergodev/json"
	"os"
)

func main() {
	file, err := os.Create("output.jsonl")
	if err != nil {
		panic(err)
	}
	defer file.Close()
	jw := json.NewJSONLWriter(file)
	jw.Write(map[string]any{"id": 1, "name": "Alice"})
	jw.Write(map[string]any{"id": 2, "name": "Bob"})
}
```

### JSONLWriter 메서드

| 메서드 | 시그니처 | 설명 |
|------|------|------|
| `Write` | `func (w *JSONLWriter) Write(data any) error` | 단일 값을 한 줄 JSON 으로 인코딩해 기록 |
| `WriteAll` | `func (w *JSONLWriter) WriteAll(data []any) error` | 여러 값을 순서대로 기록, 첫 오류에서 즉시 중지 |
| `WriteRaw` | `func (w *JSONLWriter) WriteRaw(line []byte) error` | 이미 인코딩된 원시 JSON 줄 기록 |
| `Err` | `func (w *JSONLWriter) Err() error` | 캐시된 첫 번째 쓰기 오류 반환 |
| `Stats` | `func (w *JSONLWriter) Stats() JSONLStats` | 쓰기 통계 반환 |

#### Write

시그니처: `func (w *JSONLWriter) Write(data any) error`

단일 JSON 값을 한 줄로 인코딩해 내부 writer 에 기록하며, 줄 끝에 자동으로 `\n` 을 추가합니다.

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `data` | `any` | 예 | 인코딩해 기록할 값 |

**반환값**

| 타입 | 설명 |
|------|------|
| `error` | 인코딩 또는 쓰기 오류; 오류 발생 후 작성기에 캐시됩니다 (아래 '동작 세부' 참조) |

#### WriteAll

시그니처: `func (w *JSONLWriter) WriteAll(data []any) error`

여러 값을 순서대로 여러 줄로 인코딩해 기록하며, 첫 오류를 만나면 즉시 중지하고 반환합니다.

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `data` | `[]any` | 예 | 기록할 값의 슬라이스 |

**반환값**

| 타입 | 설명 |
|------|------|
| `error` | `Write` 가 반환한 첫 번째 오류 (모두 성공하면 `nil`) |

```go
jw := json.NewJSONLWriter(file)

items := []any{
	map[string]any{"id": 1, "name": "Alice"},
	map[string]any{"id": 2, "name": "Bob"},
}
if err := jw.WriteAll(items); err != nil {
	log.Fatal(err)
}

if err := jw.Err(); err != nil {
	log.Fatal(err)
}
```

#### WriteRaw

시그니처: `func (w *JSONLWriter) WriteRaw(line []byte) error`

**이미 인코딩된** 원시 JSON 줄을 기록해 이중 인코딩 오버헤드를 피합니다; 줄 끝에 `\n` 이 없으면 자동으로 하나 추가합니다.

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `line` | `[]byte` | 예 | 이미 인코딩된 JSON 줄 (개행 문자 불필요) |

**반환값**

| 타입 | 설명 |
|------|------|
| `error` | 쓰기 오류; 오류 발생 후 작성기에 캐시됩니다 |

#### Err

시그니처: `func (w *JSONLWriter) Err() error`

캐시된 첫 번째 쓰기/인코딩 오류를 반환합니다 (오류 없으면 `nil`), 배치 기록 후 일괄 확인에 적합합니다.

**반환값**

| 타입 | 설명 |
|------|------|
| `error` | 첫 번째 캐시된 오류; 한 번도 오류가 없었으면 `nil` |

#### Stats

시그니처: `func (w *JSONLWriter) Stats() JSONLStats`

쓰기 통계 (성공적으로 기록한 줄 수와 바이트 수) 를 반환합니다.

**반환값**

| 타입 | 설명 |
|------|------|
| `JSONLStats` | 쓰기 통계, 필드는 아래 [JSONLStats](#jsonlstats) 참조 |

### JSONLStats

`Stats()` 가 반환하는 쓰기 통계 타입입니다.

```go
type JSONLStats struct {
	LinesProcessed int64 // 성공적으로 기록한 줄 수
	BytesWritten   int64 // 기록한 총 바이트 수 (줄 끝 개행 문자 포함)
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `LinesProcessed` | `int64` | 성공적으로 기록한 줄 수 (실패한 줄은 제외) |
| `BytesWritten` | `int64` | 내부 writer 에 기록한 총 바이트 수 (자동 추가된 개행 문자 포함) |

**동작 세부**

- `Write`: 값을 한 줄 JSON 으로 인코딩한 뒤 `\n` 을 추가합니다; `<`/`>`/`&` 이스케이프 여부는 `Config.EscapeHTML` (기본 `true`) 이 결정합니다
- `WriteRaw`: **이미 인코딩된** 원시 줄을 기록해 이중 인코딩 오버헤드를 피합니다; 줄 끝에 `\n` 이 없으면 자동으로 하나 추가합니다
- **오류 점착성**: 어떤 쓰기나 인코딩에서든 한 번 오류가 발생하면 오류가 작성기에 캐시되고, 이후 `Write`/`WriteRaw` 는 내부 writer 에 쓰지 않고 그 오류를 바로 반환합니다 — 반쯤 쓴 상태에서 계속 추가하는 것을 방지합니다
- `Err()` 은 캐시된 오류를 읽습니다 (오류 없으면 `nil`); `Stats()` 는 `JSONLStats` 를 반환하며 필드는 위 표와 같습니다

### 사용 예제

```go
package main

import (
	"fmt"
	"os"

	"github.com/cybergodev/json"
)

func main() {
	jw := json.NewJSONLWriter(os.Stdout)

	// 3 개 레코드 기록, 한 줄에 하나씩
	for i := 1; i <= 3; i++ {
		if err := jw.Write(map[string]int{"id": i}); err != nil {
			panic(err)
		}
	}

	stats := jw.Stats()
	if err := jw.Err(); err != nil {
		panic(err)
	}
	fmt.Printf("%d 줄, 총 %d 바이트 기록\n", stats.LinesProcessed, stats.BytesWritten)
	// {"id":1}
	// {"id":2}
	// {"id":3}
	// 3 줄, 총 27 바이트 기록
}
```

## 관련 문서

- [파일 작업 함수](./file-io) - LoadFromFile, SaveToFile 등 파일 작업
- [Processor JSONL 메서드](../processor/jsonl) - Processor 레벨 JSONL 메서드 상세
- [JSONL 프로세서](../../streaming/jsonl#jsonlwriter) - JSONL/NDJSON 개념과 스트리밍 실전 튜토리얼
- [스트리밍 처리](../../streaming/large-files) - 스트리밍 프로세서 상세
