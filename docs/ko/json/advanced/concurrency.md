---
sidebar_label: "동시성과 병렬 처리"
title: "동시성 - CyberGo JSON | 실전 가이드"
description: "CyberGo JSON 동시성과 병렬 처리: Processor 스레드 안전성, ParallelIterator, StreamJSONLParallel, SetGlobalProcessor와 MaxConcurrency로 대형 데이터셋 병렬 처리."
sidebar_position: 4
---

# 동시성과 병렬 처리

CyberGo JSON의 모든 작업은 **동시성 안전**하며, 즉시 사용 가능한 병렬 API(`ParallelIterator`, 병렬 JSONL 스트리밍)를 제공합니다. 이 페이지는 스레드 안전성 시맨틱, 내장 병렬 API, 동시성 사용 패턴을 문서화합니다.

:::tip 팁 성능 페이지와의 역할 분담
[성능 최적화](./performance)의 '동시성 처리' 절은 배열 작업을 수동으로 병렬화하는 **일반 Go 패턴**(`sync.WaitGroup` + 세마포어 + Worker Pool)을 보여줍니다. 이 페이지는 **라이브러리 내장** 병렬 API를 문서화하며, 두 페이지는 상호 보완적입니다.
:::

## 스레드 안전성 보장

`Processor`는 스레드 안전한 처리 엔진입니다(소스 주석: `Processor is the main JSON processing engine with thread safety`):

- **단일 Processor 인스턴스를 여러 고루틴에서 공유 가능** — 모든 공개 메서드(`Get`/`Set`/`Delete`/`Marshal` 등)는 내부적으로 원자 연산과 동시성 거버넌스(`beginGovernedOp`/`endGovernedOp`)로 보호됩니다.
- **패키지 수준 함수**(`json.Get`, `json.GetString` 등)는 하나의 글로벌 Processor를 공유하며 기본적으로 동시성 안전합니다.
- **`PreParse`가 반환한 `*ParsedJSON`은 동시 읽기 가능** — 여러 고루틴이 동일한 `ParsedJSON`에 대해 동시에 `GetFromParsed`를 호출할 수 있습니다.

:::warning 경고 공유하면 안 될 때
`Processor`는 공유 가능하지만, **가변 Go 컨테이너를 고루틴 간에 공유하지 마세요**(예: `Get`이 반환한 `map[string]any`를 여러 고루틴에 전달해 수정). 반환된 컨테이너는 기본적으로 복사본이므로(`CacheSharedResults`가 켜져 있지 않은 한) 반환값을 수정해도 캐시에 영향을 주지 않습니다. 단, 하나의 컨테이너를 동시 수정하려면 호출자 측 잠금이 필요합니다.
:::

## ParallelIterator 병렬 반복기

`ParallelIterator`는 멀티코어 CPU에 걸쳐 배열 처리를 병렬화하며, 워커 풀, 에러 집계, panic 복구를 내장해 직접 만든 고루틴 풀보다 안전합니다.

### 기본 병렬 순회

```go
package main

import (
	"fmt"
	"sync"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"items":[1,2,3,4,5,6,7,8]}`
	items := json.GetArray(data, "items")

	// 워커 수 기본값은 Config.MaxConcurrency(배열 길이로 제한)
	iter := json.NewParallelIterator(items)
	defer iter.Close()

	var mu sync.Mutex
	var sum int64
	err := iter.ForEach(func(_ int, val any) error {
		mu.Lock()
		sum += int64(val.(float64))
		mu.Unlock()
		return nil
	})
	if err != nil {
		panic(err)
	}
	fmt.Printf("합계 = %d\n", sum)
	// 출력: 합계 = 36
}
```

### 병렬 Map

`Map`은 각 요소를 병렬로 변환하며, 결과는 **입력 순서를 유지**합니다(각 워커가 자신의 인덱스에 쓰므로 잠금 불필요).

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"items":[1,2,3,4]}`
	items := json.GetArray(data, "items")

	iter := json.NewParallelIterator(items)
	defer iter.Close()

	// 병렬 맵: 각 요소 * 10, 결과 순서는 입력과 동일
	doubled, err := iter.Map(func(_ int, val any) (any, error) {
		return int(val.(float64)) * 10, nil
	})
	if err != nil {
		panic(err)
	}
	fmt.Println(doubled)
	// 출력: [10 20 30 40]
}
```

### ParallelIterator API 개요

| API | 시그니처 | 설명 |
|-----|------|------|
| `NewParallelIterator` | `func NewParallelIterator(data []any, cfg ...Config) *ParallelIterator` | 반복기 생성. 워커 수는 `cfg.MaxConcurrency`에서 가져옴 |
| `ForEach` | `func (it *ParallelIterator) ForEach(fn func(int, any) error) error` | 병렬 순회, 첫 번째 에러 반환 |
| `ForEachWithContext` | `func (it *ParallelIterator) ForEachWithContext(ctx context.Context, fn func(int, any) error) error` | context 취소 지원 |
| `ForEachBatch` | `func (it *ParallelIterator) ForEachBatch(batchSize int, fn func(int, []any) error) error` | 배치 단위 병렬 처리 |
| `Map` | `func (it *ParallelIterator) Map(transform func(int, any) (any, error)) ([]any, error)` | 병렬 변환, 순서 유지 |
| `Filter` | `func (it *ParallelIterator) Filter(predicate func(int, any) bool) []any` | 병렬 필터 |
| `Close` | `func (it *ParallelIterator) Close()` | 리소스 해제(사용 후 호출) |

전체 시그니처와 사용법은 [반복기 타입](../api-reference/iterator#paralleliterator-타입)에서 확인하세요.

:::tip 팁 에러와 panic 처리
`ForEach`는 첫 번째 에러를 반환하고 새 작업 디스패치를 중지합니다. 워커 내 panic은 복구(`recover`)되어 에러로 변환되므로 콜백 panic이 프로세스를 중단시키지 않습니다. 취소가 필요하면 `ForEachWithContext`를 사용해 `ctx.Done()` 시 우아하게 종료합니다.
:::

## 병렬 JSONL 스트림 처리

대형 JSONL(NDJSON) 파일을 처리할 때 `StreamJSONLParallel`이 여러 워커로 각 행을 병렬 처리합니다.

```go
package main

import (
	"fmt"
	"strings"
	"sync"

	"github.com/cybergodev/json"
)

func main() {
	// JSONL 데이터 시뮬레이션(한 줄에 하나의 JSON 객체)
	jsonlData := `{"id":1,"score":95}
{"id":2,"score":82}
{"id":3,"score":78}
{"id":4,"score":90}`

	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	var mu sync.Mutex
	var total int64
	var count int64

	// 4개 워커가 각 행을 병렬 처리
	err = processor.StreamJSONLParallel(strings.NewReader(jsonlData), 4, func(lineNum int, item *json.IterableValue) error {
		score := int64(item.GetInt("score"))
		mu.Lock()
		total += score
		count++
		mu.Unlock()
		return nil
	})
	if err != nil {
		panic(err)
	}
	fmt.Printf("%d건 처리, 총점 %d\n", count, total)
	// 출력: 4건 처리, 총점 345
}
```

| API | 설명 |
|-----|------|
| `StreamJSONLParallel(reader, workers, fn)` | 멀티 워커 병렬 JSONL 처리 |
| `StreamJSONLParallelWithContext(ctx, reader, workers, fn)` | 동일, context 취소/타임아웃 지원 |
| `StreamJSONLChunked(reader, chunkSize, fn)` | 청크 기반 처리, 메모리 효율적 |

전체 시그니처와 설정(`JSONLWorkers`/`JSONLChunkSize` 등)은 [JSONL 처리](../api-reference/processor/jsonl)와 [JSONL 스트리밍](../streaming/jsonl)에서 확인하세요.

:::tip 팁 행 순서
병렬 모드에서도 콜백의 `lineNum`은 원래 행 번호를 반영하지만, **실행 순서는 보장되지 않습니다**. 순서가 유지되는 출력이 필요하면 미리 할당한 슬라이스의 `lineNum` 위치에 쓰세요.
:::

## 동시성을 위한 글로벌 프로세서

`SetGlobalProcessor`는 모든 패키지 수준 함수가 하나의 커스텀 Processor를 공유하게 합니다. 통합 설정(캐시 매개변수, 훅, 보안 제한)이 필요한 멀티 고루틴 서비스에 적합합니다.

```go
package main

import (
	"fmt"
	"sync"

	"github.com/cybergodev/json"
)

func main() {
	// 커스텀 글로벌 프로세서(모든 패키지 수준 함수가 공유, 동시성 안전)
	cfg := json.DefaultConfig()
	processor, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	json.SetGlobalProcessor(processor) // 이전 글로벌 Processor는 자동으로 닫힘
	defer json.ShutdownGlobalProcessor() // 앱 종료 시 깔끔하게 종료

	data := `{"user":{"name":"Alice","age":30}}`

	// 여러 고루틴이 패키지 수준 함수를 동시에 사용(동일 글로벌 Processor 공유)
	var wg sync.WaitGroup
	results := make([]string, 3)
	for i := 0; i < 3; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			switch idx {
			case 0:
				results[idx] = json.GetString(data, "user.name")
			case 1:
				results[idx] = fmt.Sprintf("%d", json.GetInt(data, "user.age"))
			case 2:
				results[idx] = json.GetString(data, "user.name")
			}
		}(i)
	}
	wg.Wait()
	fmt.Println(results)
	// 출력: [Alice 30 Alice]
}
```

:::warning 경고 소유권 이전
`SetGlobalProcessor` 이후 해당 Processor의 수명 주기는 글로벌이 관리합니다. 수동으로 `Close()`하면 **안 됩니다**. 그렇지 않으면 글로벌 종료 로직과 충돌합니다. 종료 시 `ShutdownGlobalProcessor()`를 호출해 깔끔하게 종료하고 리소스를 해제하세요.
:::

## MaxConcurrency 동시성 제한

`Config.MaxConcurrency`(기본값 50)는 Processor당 **소프트 동시성 상한**입니다. 원자 카운팅 세마포어가 진행 중인 작업 수를 제한합니다. 상한에 도달하면 새 작업이 `ErrConcurrencyLimit`(재시도 가능)을 반환합니다.

```go
cfg := json.DefaultConfig()
cfg.MaxConcurrency = 100 // Processor당 동시성 상한 상향
```

- `ErrConcurrencyLimit`은 **재시도 가능한** 일시적 에러입니다([오류 처리](./error-handling#시스템-오류) 참고).
- 병렬 스트리밍(`StreamJSONLParallel`)의 워커 수는 명시적 인자에서 가져오며 `MaxConcurrency`에 직접 묶이지 않지만, 동일한 거버넌스 슬롯을 공유합니다.
- `ParallelIterator` 워커 수는 `cfg.MaxConcurrency`(기본값 50)에서 가져오며 배열 길이로 제한됩니다.

## 모범 사례와 주의점

### 1. Processor를 재사용, 요청마다 새로 만들지 말 것

`Processor`는 캐시, 재귀 프로세서 등의 상태를 들고 있습니다. **동일 인스턴스를 재사용**해야 캐시가 적중합니다. 요청마다 `json.New()`를 호출하면 캐시 이점을 잃고 할당이 늘어납니다.

### 2. 인스턴스 공유는 안전, 반환 컨테이너 공유는 주의

`Processor`는 고루틴 간 공유가 안전합니다. 단, `Get`이 반환한 `map`/`slice`를 고루틴 간 수정하려면 호출자 측 잠금이 필요합니다(또는 `CacheSharedResults`에서 읽기 전용으로 취급).

### 3. Close로 리소스 해제

장기 실행 서비스에서 명시적으로 `defer processor.Close()`와 `defer iter.Close()`를 호출해 캐시 고루틴과 메모리 누수를 피하세요. `SetGlobalProcessor`로 설정한 인스턴스는 대신 `ShutdownGlobalProcessor`를 사용합니다.

### 4. CPU 집약적일 때만 병렬화 가치 있음

병렬 처리에는 스케줄링과 동기화 오버헤드가 있습니다. 작은 배열(< `ParallelThreshold`, 기본값 10)은 직렬이 더 빠릅니다. JSONL 행이 많고 행별 처리가 무거울 때 병렬화 이득이 뚜렷합니다.

### 5. 병렬 모드에서 순서 주의

`StreamJSONLParallel`은 처리 순서를 보장하지 않습니다. 순서가 유지되는 결과가 필요하면 `lineNum` 위치에 쓴 후 순서대로 소비하세요.

## 참조

- [성능 최적화](./performance) — Processor 재사용, 일반 Go 동시성 패턴, 벤치마크
- [반복기 타입](../api-reference/iterator) — 전체 `ParallelIterator` API
- [JSONL 처리](../api-reference/processor/jsonl) — 병렬 JSONL API 상세
- [캐시와 사전 파싱](./caching) — 캐시 메커니즘과 PreParse
- [오류 처리](./error-handling) — `ErrConcurrencyLimit`와 에러 분류
