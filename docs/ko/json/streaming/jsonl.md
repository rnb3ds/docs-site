---
sidebar_label: "JSONL 프로세서"
title: "JSONL 프로세서 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON JSONL 프로세서: StreamJSONL, MapJSONL·FilterJSONL·ReduceJSONL 함수형 처리, JSONLWriter, StreamLinesInto[T], ParseJSONL, ToJSONL 로 NDJSON 읽기와 쓰기를 지원합니다."
sidebar_position: 3
---

# JSONL 프로세서

JSONL(JSON Lines) 또는 NDJSON(Newline Delimited JSON) 은 줄당 하나의 JSON 객체 형식입니다. 이 라이브러리는 `Processor` 메서드와 패키지 레벨 함수를 통해 완전한 JSONL 처리 기능을 제공합니다.

## 형식 사양

```json
{"id":1,"name":"Alice"}
{"id":2,"name":"Bob"}
{"id":3,"name":"Charlie"}
```

- 각 줄은 유효한 JSON 값입니다
- 줄은 `\n`으로 구분됩니다
- 마지막 줄은 줄바꿈이 있거나 없을 수 있습니다

---

## Processor JSONL 메서드

JSONL 처리 기능은 `Processor`의 메서드를 통해 제공됩니다. 스트리밍/함수형 메서드가 총 11 개이며, 선택 기준은 다음과 같습니다:

| 메서드 | 형태 | 적용 시나리오 |
|------|------|----------|
| `StreamJSONL` | 줄별 콜백 | 기본 스트리밍 처리, `IterableValue` 를 줄 단위로 소비 |
| `StreamJSONLParallel` | 병렬 콜백 | CPU 집약적 변환, 여러 worker 병렬 |
| `StreamJSONLParallelWithContext` | 병렬 콜백 + ctx | 타임아웃/취소가 필요한 병렬 처리 |
| `StreamJSONLChunked` | 배치 콜백 | 배치 적재 등 청크 단위 소비 시나리오 |
| `StreamJSONLFile` | 줄별 콜백 (파일) | `.jsonl` 파일 직접 읽기 (경로 보안 검사 포함) |
| `ForeachJSONL` | 줄별 콜백 | `StreamJSONL` 의 별칭 |
| `MapJSONL` | 변환 수집 | 각 줄을 새 값으로 매핑해 `[]any` 반환 |
| `FilterJSONL` | 조건 수집 | 조건을 만족하는 줄만 걸러내기 |
| `ReduceJSONL` | 집계 | 합계, 통계 등 폴드 연산 |
| `CollectJSONL` | 전체 수집 | 모든 줄을 한 번에 꺼내기 |
| `FirstJSONL` | 조건 + short-circuit | 첫 번째 일치를 찾으면 즉시 중지 (내부적으로 `Break` 와 동일) |

### StreamJSONL

시그니처: `func (p *Processor) StreamJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) error) error`

JSONL 데이터를 스트리밍 처리하며, 각 줄마다 `IterableValue`를 반환합니다.

**매개변수**

| 이름 | 타입 | 설명 |
|------|------|------|
| `reader` | `io.Reader` | 데이터 소스 |
| `fn` | `func(lineNum int, item *IterableValue) error` | 처리 콜백 |

**콜백 반환값**

| 반환값 | 설명 |
|--------|------|
| `nil` | 다음 줄로 계속 처리 |
| `item.Break()` | 반복 중지, 오류 반환 안 함 |
| 기타 `error` | 반복 중지하고 오류 반환 |

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

file, _ := os.Open("data.jsonl")
defer file.Close()

err = p.StreamJSONL(file, func(lineNum int, item *json.IterableValue) error {
	name := item.GetString("name")
	age := item.GetInt("age")
	fmt.Printf("%d번째 줄: name=%s, age=%d\n", lineNum, name, age)
	return nil // 계속 처리
	// return item.Break() // 반복 중지
})
```

### StreamJSONLParallel

시그니처: `func (p *Processor) StreamJSONLParallel(reader io.Reader, workers int, fn func(lineNum int, item *IterableValue) error) error`

JSONL 데이터를 병렬 처리합니다. 작업 풀 패턴을 사용합니다.

**매개변수**

| 이름 | 타입 | 설명 |
|------|------|------|
| `reader` | `io.Reader` | 데이터 소스 |
| `workers` | `int` | 작업 goroutine 수 (0 이하는 기본값 4) |
| `fn` | `func(lineNum int, item *IterableValue) error` | 처리 콜백 |

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

err = p.StreamJSONLParallel(file, 8, func(lineNum int, item *json.IterableValue) error {
	// CPU 집약적 처리
	return processItem(item)
})
```

:::tip 성능 팁
CPU 집약적 작업 (데이터 변환, 계산 등) 에는 병렬 처리를 사용하면 성능이 크게 향상됩니다. I/O 집약적 작업에는 단일 스레드 처리를 권장합니다.
:::

콜백이 `item.Break()` 를 반환하면 깔끔한 중지입니다: 스캔과 각 worker 가 조기 종료되고 메서드는 `nil` 을 반환합니다; 다른 오류를 반환하면 메서드가 해당 오류로 끝납니다. 콜백의 panic 은 오류로 복구되어 프로세스를 무너뜨리지 않습니다.

### StreamJSONLParallelWithContext

시그니처: `func (p *Processor) StreamJSONLParallelWithContext(ctx context.Context, reader io.Reader, workers int, fn func(lineNum int, item *IterableValue) error) error`

컨텍스트가 있는 JSONL 병렬 처리입니다. 시간 초과 및 취소 작업을 지원합니다.

**매개변수**

| 이름 | 타입 | 설명 |
|------|------|------|
| `ctx` | `context.Context` | 컨텍스트, 취소 및 시간 초과에 사용 |
| `reader` | `io.Reader` | 데이터 소스 |
| `workers` | `int` | 작업 goroutine 수 (0 이하는 기본값 4) |
| `fn` | `func(lineNum int, item *IterableValue) error` | 처리 콜백 |

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()

err = p.StreamJSONLParallelWithContext(ctx, file, 8, func(lineNum int, item *json.IterableValue) error {
	// 취소가 지원되는 병렬 처리
	return processItem(item)
})
```

### StreamJSONLChunked

시그니처: `func (p *Processor) StreamJSONLChunked(reader io.Reader, chunkSize int, fn func(chunk []*IterableValue) error) error`

JSONL 데이터를 배치로 처리합니다. 지정된 수의 요소를 한 번에 처리합니다.

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

// 배치당 1000 건
err = p.StreamJSONLChunked(file, 1000, func(chunk []*json.IterableValue) error {
	// 데이터베이스에 배치 쓰기
	for _, item := range chunk {
		processItem(item)
	}
	return nil
})
```

::: warning 콜백 반환 후 객체 풀 반납
`StreamJSONLChunked` 는 **각 배치의 콜백이 반환된 후** 해당 배치의 `IterableValue` 를 객체 풀에 반납합니다 (내부 데이터 비움). 콜백 안에서 적재를 마치거나 필요한 필드를 추출하세요, `chunk` 의 요소를 콜백 너머로 들고 있지 마세요. `StreamJSONL` (및 이를 기반으로 한 `CollectJSONL`/`FilterJSONL`/`FirstJSONL` 등 수집 메서드) 은 반납하지 않으므로 반환된 요소를 안전하게 보관할 수 있습니다.
:::

### StreamJSONLFile

시그니처: `func (p *Processor) StreamJSONLFile(filename string, fn func(lineNum int, item *IterableValue) error) error`

JSONL 파일을 직접 처리합니다.

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

err = p.StreamJSONLFile("data.jsonl", func(lineNum int, item *json.IterableValue) error {
	fmt.Printf("%d번째 줄: %v\n", lineNum, item.GetData())
	return nil
})
```

---

## 고급 JSONL 작업

### MapJSONL

시그니처: `func (p *Processor) MapJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) (any, error)) ([]any, error)`

JSONL 데이터를 새로운 형식으로 매핑합니다.

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

result, err := p.MapJSONL(file, func(lineNum int, item *json.IterableValue) (any, error) {
	return map[string]any{
		"name": item.GetString("name"),
		"age":  item.GetInt("age"),
	}, nil
})
```

### ReduceJSONL

시그니처: `func (p *Processor) ReduceJSONL(reader io.Reader, initial any, fn func(acc any, item *IterableValue) any) (any, error)`

JSONL 데이터를 단일 결과로 집계합니다.

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

// 나이 총합 계산
totalAge, err := p.ReduceJSONL(file, 0, func(acc any, item *json.IterableValue) any {
	return acc.(int) + item.GetInt("age")
})
```

### FilterJSONL

시그니처: `func (p *Processor) FilterJSONL(reader io.Reader, predicate func(item *IterableValue) bool) ([]*IterableValue, error)`

JSONL 데이터를 필터링하여 조건을 만족하는 요소를 반환합니다.

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

// 성인 필터링
adults, err := p.FilterJSONL(file, func(item *json.IterableValue) bool {
	return item.GetInt("age") >= 18
})
```

### CollectJSONL

시그니처: `func (p *Processor) CollectJSONL(reader io.Reader) ([]*IterableValue, error)`

모든 JSONL 요소를 슬라이스에 수집합니다.

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

items, err := p.CollectJSONL(file)
for _, item := range items {
	fmt.Println(item.GetString("name"))
}
```

### FirstJSONL

시그니처: `func (p *Processor) FirstJSONL(reader io.Reader, predicate func(item *IterableValue) bool) (*IterableValue, bool, error)`

조건을 만족하는 첫 번째 요소를 반환합니다.

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

user, found, err := p.FirstJSONL(file, func(item *json.IterableValue) bool {
	return item.GetString("name") == "Alice"
})
if found {
	fmt.Println("찾음:", user.GetString("name"))
}
```

### ForeachJSONL

시그니처: `func (p *Processor) ForeachJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) error) error`

JSONL 데이터를 반복합니다 (StreamJSONL 의 별칭).

---

## JSONL 설정

JSONL 설정은 `Config` 구조체에 통합되어 있습니다:

```go
cfg := json.DefaultConfig()
cfg.JSONLBufferSize = 128 * 1024       // 버퍼 크기 (기본값 64KB)
cfg.JSONLMaxLineSize = 2 * 1024 * 1024 // 최대 줄 크기 (기본값 1MB)
cfg.JSONLSkipEmpty = true              // 빈 줄 건너뛰기 (기본값 true)
cfg.JSONLSkipComments = true           // 주석 줄 건너뛰기 (기본값 false)
cfg.JSONLContinueOnErr = true          // 파싱 오류 시 계속 (기본값 false)
cfg.JSONLWorkers = 8                   // 병렬 작업 수 (기본값 4)
cfg.JSONLChunkSize = 500               // 청크 크기 (기본값 1000)
cfg.JSONLMaxMemory = 200 * 1024 * 1024 // 최대 메모리 (기본값 100MB)

p, err := json.New(cfg)
if err != nil {
	panic(err)
}
```

필드 적용 범위와 우선순위:

- **`JSONLMaxLineSize`**: 한 줄의 바이트 상한. `StreamJSONL` 계열, `NDJSONProcessor`, `StreamLinesInto` 모두 이 값으로 scanner 를 제한합니다; 초과 시 `bufio.ErrTooLong` 류의 오류를 반환합니다. 폴백 체인: `JSONLMaxLineSize` → `MaxJSONSize` → 100MB (`NDJSONProcessor`).
- **`JSONLMaxMemory`**: 스트리밍 처리의 총 바이트 상한 (초과 시 오류로 종료); 폴백 체인: `JSONLMaxMemory` → `MaxMemory`.
- **`MaxNestingDepthSecurity`**: 모든 JSONL 스트리밍 진입점은 각 행을 파싱하기 **전에** 중첩 깊이를 행별로 검사해, 깊은 중첩에 의한 스택 오버플로를 방지합니다.
- **`JSONLContinueOnErr`**: `NDJSONProcessor` (`ProcessFile`/`ProcessReader`) 과 `StreamLinesInto` 에서만 적용됩니다 — 잘못된 행을 건너뛰고 계속 처리; `StreamJSONL` 계열은 파싱 오류를 만나면 즉시 종료됩니다.
- **`JSONLWorkers`/`JSONLChunkSize`**: 설정 검증에 참여합니다 (클램프 범위 1–64 / 100–10000), 단 `StreamJSONLParallel` 의 `workers` 매개변수와 `StreamJSONLChunked` 의 `chunkSize` 매개변수는 명시적으로 전달한 값이 우선입니다.
- `Config.Validate` 는 범위를 벗어난 값을 합법 구간으로 되돌리며, `ValidateWithWarnings` 로 조정 내역을 확인할 수 있습니다.

---

## JSONLWriter

JSONLWriter 는 데이터를 JSON Lines 형식으로 쓰는 데 사용됩니다.

### NewJSONLWriter

시그니처: `func NewJSONLWriter(writer io.Writer, cfg ...Config) *JSONLWriter`

JSONL 쓰기를 생성합니다. 선택적 설정 매개변수를 지원합니다.

```go
file, _ := os.Create("output.jsonl")
defer file.Close()

// 기본 설정 사용
writer := json.NewJSONLWriter(file)

// 커스텀 설정 사용
cfg := json.DefaultConfig()
cfg.EscapeHTML = true
writer = json.NewJSONLWriter(file, cfg)
```

### Write

시그니처: `func (w *JSONLWriter) Write(data any) error`

단일 JSON 값을 한 줄로 씁니다 (인코딩 결과 + `\n`). HTML 이스케이프는 생성 시점의 `Config.EscapeHTML` 을 따릅니다 (기본 `true`).

```go
err := writer.Write(map[string]any{
	"id":   1,
	"name": "Alice",
})
// 쓰인 내용: {"id":1,"name":"Alice"}\n
```

::: tip 오류는 캐시됩니다
`Write`/`WriteRaw` 는 한 번 오류가 나면 오류를 writer 에 캐시하고, **이후 모든 쓰기 호출이 같은 오류를 바로 반환합니다**. 배치 쓰기가 끝난 뒤 [`Err`](#err) 로 한 번에 확인하면 되므로 매번 판단할 필요가 없습니다.
:::

### WriteAll

시그니처: `func (w *JSONLWriter) WriteAll(data []any) error`

여러 JSON 값을 각각 한 줄로 씁니다.

```go
items := []any{
	map[string]any{"id": 1, "name": "Alice"},
	map[string]any{"id": 2, "name": "Bob"},
	map[string]any{"id": 3, "name": "Charlie"},
}

err := writer.WriteAll(items)
```

### WriteRaw

시그니처: `func (w *JSONLWriter) WriteRaw(line []byte) error`

이미 인코딩된 원시 JSON 행을 쓰며, 재인코딩을 건너뜁니다. 행 끝에 줄바꿈이 **없으면** 하나를 자동으로 추가하고; 이미 있으면 그대로 씁니다.

```go
err := writer.WriteRaw([]byte(`{"id":1,"name":"raw"}`))
// 쓰인 내용: {"id":1,"name":"raw"}\n
```

### Err

시그니처: `func (w *JSONLWriter) Err() error`

쓰기 과정에서 발생한 오류를 반환합니다.

```go
if err := writer.Err(); err != nil {
	fmt.Printf("쓰기 오류: %v\n", err)
}
```

### Stats

시그니처: `func (w *JSONLWriter) Stats() JSONLStats`

쓰기 통계 정보를 가져옵니다.

```go
stats := writer.Stats()
fmt.Printf("%d줄, %d바이트 쓰기 완료\n", stats.LinesProcessed, stats.BytesWritten)
```

**JSONLStats 구조체**:

```go
type JSONLStats struct {
	LinesProcessed int64 // 처리된 줄 수
	BytesWritten   int64 // 쓰여진 바이트 수
}
```

| 필드 | 의미 |
|------|------|
| `LinesProcessed` | `Write`/`WriteAll`/`WriteRaw` 로 성공적으로 쓰인 행 수 |
| `BytesWritten` | 쓰인 총 바이트 수, **각 행 끝의 줄바꿈 포함** |

예를 들어 `Write` 로 `{"id":1}` (9 바이트) 한 줄을 쓰면 `Stats()` 는 `LinesProcessed=1`, `BytesWritten=10` 입니다.

---

## NDJSONProcessor

`map[string]any` 타입 전용 NDJSON 파일 프로세서입니다. `StreamJSONL` 과의 차이: 콜백이 `map[string]any` 를 직접 받고 (`IterableValue` 를 통한 간접 접근 불필요), 빈 줄을 **항상** 건너뜁니다; `Processor` 와 독립적이며 인스턴스를 만들 필요가 없습니다. 객체 행을 단순히 줄 단위로 소비하는 시나리오에 적합합니다; 타입화된 접근, 병렬, 함수형 조합이 필요하면 `StreamJSONL` 계열을 사용하세요.

두 진입점 모두 방어 기능이 내장되어 있습니다:

- **행별 중첩 깊이 검사**: 파싱 전 `MaxNestingDepthSecurity` (기본 200) 로 검사해 깊은 중첩에 의한 스택 오버플로 방지;
- **한 줄 크기 상한**: `JSONLMaxLineSize` (폴백 `MaxJSONSize` → 100MB);
- **총량 상한**: `JSONLMaxMemory` (폴백 `MaxMemory`) 초과 시 즉시 종료;
- **내결함성**: `JSONLContinueOnErr=true` 이면 파싱에 실패한 행을 건너뛰고 계속 처리;
- **경로 검증**: `ProcessFile` 은 파일 경로에 경로 순회 등 보안 검사를 수행;
- **콜백 panic 복구**: 콜백의 panic 은 오류로 변환되어 반환되며 프로세스를 무너뜨리지 않습니다.

### NewNDJSONProcessor

시그니처: `func NewNDJSONProcessor(cfg ...Config) *NDJSONProcessor`

NDJSON 프로세서를 생성합니다. 선택적 설정 매개변수를 지원합니다.

```go
// 기본 설정 사용
np := json.NewNDJSONProcessor()

// 커스텀 설정 사용
cfg := json.DefaultConfig()
cfg.JSONLBufferSize = 128 * 1024
np = json.NewNDJSONProcessor(cfg)
```

### ProcessFile

시그니처: `func (np *NDJSONProcessor) ProcessFile(filename string, fn func(lineNum int, obj map[string]any) error) error`

NDJSON 파일을 처리합니다.

```go
err := np.ProcessFile("data.ndjson", func(lineNum int, obj map[string]any) error {
	fmt.Printf("[%d] ID: %v\n", lineNum, obj["id"])
	return nil
})
```

### ProcessReader

시그니처: `func (np *NDJSONProcessor) ProcessReader(reader io.Reader, fn func(lineNum int, obj map[string]any) error) error`

Reader 에서 NDJSON 을 처리합니다.

```go
err := np.ProcessReader(file, func(lineNum int, obj map[string]any) error {
	return nil
})
```

---

## 패키지 레벨 함수

모든 JSONL 처리 함수는 해당 [Processor 메서드](../api-reference/processor/jsonl)와 동일한 시그니처의 패키지 레벨 편의 버전을 제공합니다. 내부적으로 기본 글로벌 Processor 를 사용하므로 인스턴스를 수동으로 생성할 필요가 없습니다.

::: tip 팁
패키지 레벨 함수는 일회성 처리에 적합합니다. 루프 내에서 여러 번 호출하거나 설정을 공유해야 하는 경우, 캐시를 재사용하기 위해 전용 `Processor`([`json.New()`](../api-reference/processor/)) 를 생성하는 것을 권장합니다.
:::

### StreamJSONL

시그니처: `func StreamJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) error, cfg ...Config) error`

JSONL 을 행 단위로 스트리밍 처리하며, 각 행을 `IterableValue`로 파싱한 후 콜백을 호출합니다.

### StreamJSONLParallel

시그니처: `func StreamJSONLParallel(reader io.Reader, workers int, fn func(lineNum int, item *IterableValue) error, cfg ...Config) error`

`workers` 개의 병렬 goroutine 으로 JSONL 을 처리합니다.

### StreamJSONLParallelWithContext

시그니처: `func StreamJSONLParallelWithContext(ctx context.Context, reader io.Reader, workers int, fn func(lineNum int, item *IterableValue) error, cfg ...Config) error`

컨텍스트 취소를 지원하는 병렬 JSONL 처리입니다.

### StreamJSONLChunked

시그니처: `func StreamJSONLChunked(reader io.Reader, chunkSize int, fn func(chunk []*IterableValue) error, cfg ...Config) error`

`chunkSize` 단위로 JSONL 을 배치 처리하며, 각 배치를 `[]*IterableValue`로 콜백에 전달합니다.

### ForeachJSONL

시그니처: `func ForeachJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) error, cfg ...Config) error`

JSONL 을 순회하며 각 행마다 콜백을 호출합니다.

### MapJSONL

시그니처: `func MapJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) (any, error), cfg ...Config) ([]any, error)`

각 행을 새 값으로 매핑하고 결과 슬라이스를 반환합니다.

### ReduceJSONL

시그니처: `func ReduceJSONL(reader io.Reader, initial any, fn func(acc any, item *IterableValue) any, cfg ...Config) (any, error)`

JSONL 을 리듀스합니다. `initial`은 누산기의 초기값입니다.

### FilterJSONL

시그니처: `func FilterJSONL(reader io.Reader, predicate func(item *IterableValue) bool, cfg ...Config) ([]*IterableValue, error)`

조건부로 JSONL 을 필터링하여 일치하는 항목을 반환합니다.

### StreamJSONLFile

시그니처: `func StreamJSONLFile(filename string, fn func(lineNum int, item *IterableValue) error, cfg ...Config) error`

전체 JSONL 파일을 스트리밍으로 처리합니다.

```go
err := json.StreamJSONLFile("data.jsonl", func(lineNum int, item *json.IterableValue) error {
	fmt.Printf("%d번째 줄: %v\n", lineNum, item.GetData())
	return nil
})
```

### CollectJSONL

시그니처: `func CollectJSONL(reader io.Reader, cfg ...Config) ([]*IterableValue, error)`

모든 JSONL 행을 읽어 슬라이스로 수집합니다.

### FirstJSONL

시그니처: `func FirstJSONL(reader io.Reader, predicate func(item *IterableValue) bool, cfg ...Config) (*IterableValue, bool, error)`

조건을 만족하는 첫 번째 요소를 반환합니다. 두 번째 반환값은 일치 항목을 찾았는지 여부를 나타냅니다.

### StreamLinesInto[T]

시그니처: `func StreamLinesInto[T any](reader io.Reader, fn func(lineNum int, data T) error, cfg ...Config) ([]T, error)`

JSONL 을 스트리밍으로 읽고 줄 단위로 처리합니다.

```go
type User struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

// 기본 설정 사용
entries, err := json.StreamLinesInto[User](file, func(lineNum int, user User) error {
	fmt.Printf("처리 중: %s\n", user.Name)
	return nil
})

// 커스텀 설정 사용
cfg := json.DefaultConfig()
cfg.JSONLSkipComments = true
entries, err = json.StreamLinesInto[User](file, func(lineNum int, user User) error {
	return nil
}, cfg)
```

반환값 의미:

- 반환되는 `[]T` 는 **성공적으로 파싱된 행만 누적**합니다 — `fn` 이 처리한 행이 결과 슬라이스에 추가됩니다;
- 행 파싱이 실패하고 `JSONLContinueOnErr` 이 꺼져 있으면 즉시 종료되며, `nil` 결과와 행 번호가 붙은 오류 (`line N: ...`) 를 반환합니다;
- `JSONLContinueOnErr=true` 이면 잘못된 행을 건너뛰고 (결과에 넣지 않고 `fn` 도 호출하지 않음) 이후 행을 계속 처리합니다;
- `fn` 이 오류를 반환하면 즉시 종료되고 해당 오류가 그대로 반환됩니다;
- 한 줄이 `JSONLMaxLineSize` 를 초과하면 `bufio.ErrTooLong` 으로 끝납니다.

### ParseJSONL

시그니처: `func ParseJSONL(data []byte, cfg ...Config) ([]any, error)`

JSONL 바이트 슬라이스를 파싱합니다.

```go
jsonl := `{"name":"Alice"}
{"name":"Bob"}`
results, err := json.ParseJSONL([]byte(jsonl))
```

### ToJSONL

시그니처: `func ToJSONL(data []any, cfg ...Config) ([]byte, error)`

JSONL 바이트 슬라이스로 변환합니다.

```go
items := []any{
	map[string]any{"id": 1},
	map[string]any{"id": 2},
}
jsonl, err := json.ToJSONL(items)
```

### ToJSONLString

시그니처: `func ToJSONLString(data []any, cfg ...Config) (string, error)`

JSONL 문자열로 변환합니다.

```go
jsonlStr, err := json.ToJSONLString(items)
```

---

## 전체 예제

### 대용량 JSONL 파일 읽기

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"os"
)

type LogEntry struct {
	Time    string `json:"time"`
	Level   string `json:"level"`
	Message string `json:"message"`
}

func main() {
	file, err := os.Open("logs.jsonl")
	if err != nil {
		panic(err)
	}
	defer file.Close()

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	count := 0
	err = p.StreamJSONL(file, func(lineNum int, item *json.IterableValue) error {
		count++
		if item.GetString("level") == "error" {
			fmt.Printf("오류: %s\n", item.GetString("message"))
		}
		return nil
	})

	if err != nil {
		fmt.Printf("오류: %v\n", err)
	}

	fmt.Printf("총 %d줄 처리 완료\n", count)
}
```

### JSONL 파일 쓰기

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"os"
)

func main() {
	file, err := os.Create("output.jsonl")
	if err != nil {
		panic(err)
	}
	defer file.Close()

	writer := json.NewJSONLWriter(file)

	for i := 0; i < 10; i++ {
		if err := writer.Write(map[string]any{
			"id":    i,
			"value": fmt.Sprintf("item-%d", i),
		}); err != nil {
			panic(err)
		}
	}

	stats := writer.Stats()
	fmt.Printf("%d바이트 쓰기 완료\n", stats.BytesWritten)
}
```

### 대용량 파일 병렬 처리

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"os"
	"sync/atomic"
)

func main() {
	file, err := os.Open("large.jsonl")
	if err != nil {
		panic(err)
	}
	defer file.Close()

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	var count int64
	err = p.StreamJSONLParallel(file, 8, func(lineNum int, item *json.IterableValue) error {
		atomic.AddInt64(&count, 1)
		return nil
	})

	if err != nil {
		panic(err)
	}

	fmt.Printf("병렬 처리 %d줄 완료\n", count)
}
```

---

## 관련 문서

- [대용량 파일 처리](./large-files) - 대용량 파일 가이드와 API 레퍼런스
- [반복자](../api-reference/iterator) - 반복 순회 API
