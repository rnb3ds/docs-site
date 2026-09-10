---
sidebar_label: "동시성과 병렬 처리"
title: "동시성과 병렬 처리 - CyberGo JSON | 실전 가이드"
description: "CyberGo JSON 동시성·병렬 처리: Processor 스레드 안전, ParallelIterator 병렬 이터레이터, StreamJSONLParallel 병렬 JSONL, SetGlobalProcessor 공유와 MaxConcurrency 제한으로 대형 데이터셋 병렬 레시피."
sidebar_position: 4
---

# 동시성과 병렬 처리

CyberGo JSON 의 모든 작업은 **동시성 안전**하며, 바로 쓸 수 있는 병렬 처리 API (`ParallelIterator`, 병렬 JSONL 스트림) 를 제공합니다. 이 페이지는 스레드 안전 의미, 내장 병렬 API, 동시성 사용 패턴을 문서화합니다.

:::tip 성능 최적화 페이지와의 역할 분담
[성능 최적화](./performance) 의 '동시성 처리' 절은 **범용 Go 패턴** (`sync.WaitGroup` + 세마포어 + Worker Pool) 으로 배열을 수동 병렬 처리하는 것을 보여줍니다; 이 페이지는 **라이브러리 내장** 병렬 API 를 문서화하며, 둘은 상호 보완적입니다.
:::

## 스레드 안전 보장

`Processor` 는 스레드 안전한 메인 처리 엔진입니다 (소스 주석: `Processor is the main JSON processing engine with thread safety`):

- **단일 Processor 인스턴스를 여러 goroutine 이 공유할 수 있습니다** — 모든 공개 메서드 (`Get`/`Set`/`Delete`/`Marshal` 등) 는 내부에서 원자 연산과 동시성 통제 (`beginGovernedOp`/`endGovernedOp`) 로 보호됩니다.
- **패키지 레벨 함수** (`json.Get`, `json.GetString` 등) 는 하나의 전역 Processor 를 공유해 본질적으로 동시성 안전합니다.
- **`PreParse` 가 반환한 `*ParsedJSON` 은 동시 읽기가 가능합니다** — 여러 goroutine 이 같은 `ParsedJSON` 에 동시에 `GetFromParsed` 를 호출할 수 있습니다.

:::warning 공유하면 안 되는 경우
`Processor` 는 공유할 수 있지만, **가변 Go 컨테이너는 goroutine 간에 공유하지 마세요** (예: `Get` 이 반환한 `map[string]any` 를 여러 goroutine 이 수정). 라이브러리가 반환하는 컨테이너는 기본적으로 사본입니다 (`CacheSharedResults` 를 켜지 않는 한). 반환값을 수정해도 캐시에는 영향이 없지만, 여러 goroutine 이 같은 컨테이너를 수정하려면 호출자가 직접 잠금을 해야 합니다.
:::

## ParallelIterator 병렬 이터레이터

`ParallelIterator` 는 멀티코어 CPU 로 배열을 병렬 처리하며, 워커 풀, 오류 집계, panic 복구를 내장해 직접 짠 goroutine 풀보다 안전합니다.

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

	// 워커 수는 기본적으로 Config.MaxConcurrency (배열 길이에 맞춰 잘림)
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
	fmt.Printf("총합 = %d\n", sum)
	// 출력: 총합 = 36
}
```

### 병렬 매핑 Map

`Map` 은 각 요소를 병렬 변환하며 결과는 **원본 순서를 유지**합니다 (각 워커가 자기 인덱스 위치에 기록하므로 잠금 불필요).

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

	// 병렬 매핑: 각 요소 *10, 결과 순서는 입력과 동일
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

### 배치별 병렬 ForEachBatch / ForEachBatchWithContext

요소별 콜백 오버헤드가 클 때 (예: 요소마다 시스템 호출이나 네트워크 요청) `ForEachBatch` 는 요소를 고정 크기 배치로 잘라 **배치마다 하나의 goroutine 이 처리**합니다 — 배치 내 직렬, 배치 간 병렬로 스케줄링과 동기화 비용을 분산합니다.

```go
package main

import (
	"context"
	"fmt"
	"time"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"records":[10,20,30,40,50,60,70,80,90,100]}`
	records := json.GetArray(data, "records")

	iter := json.NewParallelIterator(records)
	defer iter.Close()

	// 레코드 10 개를 배치당 3 개로 분할 → 4 배치 (마지막 배치 1 개); batchIdx 로 독립 첨자에 기록해 잠금 불필요
	subtotals := make([]int, 4)
	err := iter.ForEachBatch(3, func(batchIdx int, batch []any) error {
		sum := 0
		for _, v := range batch {
			sum += int(v.(float64))
		}
		subtotals[batchIdx] = sum
		return nil
	})
	if err != nil {
		panic(err)
	}

	// 모든 배치가 끝난 뒤 순서대로 소비 (실행 순서는 보장되지 않지만 결과는 첨자에 제자리)
	for i, s := range subtotals {
		fmt.Printf("배치 %d 소계 = %d\n", i, s)
	}

	// 타임아웃 제어 버전: ctx 만료 후 미배분 배치는 실행되지 않고, 실행 중 배치는 취소를 확인하고 종료
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	err = iter.ForEachBatchWithContext(ctx, 100, func(batchIdx int, batch []any) error {
		return nil // 단일 배치 처리 모사
	})
	fmt.Println("타임아웃 배치 처리 완료, 오류:", err)
}

// 출력:
// 배치 0 소계 = 60
// 배치 1 소계 = 150
// 배치 2 소계 = 240
// 배치 3 소계 = 100
// 타임아웃 배치 처리 완료, 오류: <nil>
```

`batchSize <= 0` 이면 100 으로 처리합니다. 콜백 오류의 의미는 `ForEach` 와 같습니다: 첫 오류가 이기고 새 배치 배분이 중단됩니다; 배치의 **배분** 순서는 입력과 같지만 (`batchIdx` 증가) **실행** 순서는 보장되지 않습니다 — 순서 보존 출력은 위 예제처럼 첨자에 제자리 기록 후 완료되면 순서대로 소비하면 됩니다.

### ParallelIterator API 한눈 보기

| API | 시그니처 | 설명 |
|-----|------|------|
| `NewParallelIterator` | `func NewParallelIterator(data []any, cfg ...Config) *ParallelIterator` | 이터레이터 생성; 워커 수는 `cfg.MaxConcurrency` (기본 50, 배열 길이 초과 시 잘림; `<= 0` 이면 4 로 폴백) |
| `ForEach` | `func (it *ParallelIterator) ForEach(fn func(int, any) error) error` | 병렬 순회, 첫 오류 반환 |
| `ForEachWithContext` | `func (it *ParallelIterator) ForEachWithContext(ctx context.Context, fn func(int, any) error) error` | context 취소 지원 |
| `ForEachBatch` | `func (it *ParallelIterator) ForEachBatch(batchSize int, fn func(int, []any) error) error` | 배치별 병렬 처리, 배치 내 직렬·배치 간 병렬 |
| `ForEachBatchWithContext` | `func (it *ParallelIterator) ForEachBatchWithContext(ctx context.Context, batchSize int, fn func(int, []any) error) error` | 배치별 병렬 + context 취소 |
| `Map` | `func (it *ParallelIterator) Map(transform func(int, any) (any, error)) ([]any, error)` | 병렬 변환, 순서 보존 반환 |
| `Filter` | `func (it *ParallelIterator) Filter(predicate func(int, any) bool) []any` | 병렬 필터, 순서 보존 반환 (오류 반환값 없음) |
| `Close` | `func (it *ParallelIterator) Close()` | 리소스 해제 (실행 중 goroutine 에 중지 신호, 여러 번 호출해도 안전) |

전체 시그니처와 용법은 [이터레이터 타입](../api-reference/iterator#paralleliterator-타입) 을 참조하세요.

:::tip 오류와 panic 처리
`ForEach` 는 **첫 번째** 오류를 반환하고 새 작업 배분을 멈춥니다; 워커 내 panic 은 복구 (`recover`) 되어 오류로 변환되어 반환되며 프로세스가 죽지 않습니다. 취소가 필요하면 `ForEachWithContext` 를 사용해 `ctx.Done()` 시 우아하게 빠져나가세요.
:::

## 병렬 JSONL 스트림 처리

대형 JSONL (NDJSON) 파일을 처리할 때 `StreamJSONLParallel` 이 여러 워커로 각 줄을 병렬 처리합니다.

```go
package main

import (
	"fmt"
	"strings"
	"sync"

	"github.com/cybergodev/json"
)

func main() {
	// JSONL 데이터 모사 (한 줄에 하나의 JSON 객체)
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

	// 워커 4 개가 각 줄을 병렬 처리
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
	fmt.Printf("%d 건 처리, 총점 %d\n", count, total)
	// 출력: 4 건 처리, 총점 345
}
```

| API | 설명 |
|-----|------|
| `StreamJSONLParallel(reader, workers, fn)` | 여러 워커로 JSONL 병렬 처리 |
| `StreamJSONLParallelWithContext(ctx, reader, workers, fn)` | 위와 동일, context 취소와 타임아웃 지원 |
| `StreamJSONLChunked(reader, chunkSize, fn)` | 청크 단위 처리, 메모리 친화적 |

전체 시그니처와 설정 (`JSONLWorkers`/`JSONLChunkSize` 등) 은 [JSONL 처리](../api-reference/processor/jsonl) 와 [JSONL 스트리밍](../streaming/jsonl) 을 참조하세요.

:::tip 줄 순서
병렬 모드에서도 콜백의 `lineNum` 은 원본 줄 번호를 반영하지만 **실행 순서는 보장되지 않습니다**. 순서 보존 출력이 필요하면 콜백에서 `lineNum` 에 맞춰 미리 할당한 슬라이스의 해당 첨자에 기록하세요.
:::

## 전역 프로세서의 동시성 사용

`SetGlobalProcessor` 는 모든 패키지 레벨 함수가 같은 커스텀 Processor 를 공유하게 하여, 통일된 설정 (캐시 파라미터, 훅, 보안 제한) 이 필요한 멀티 goroutine 서비스에 적합합니다.

```go
package main

import (
	"fmt"
	"sync"

	"github.com/cybergodev/json"
)

func main() {
	// 커스텀 전역 프로세서 (모든 패키지 레벨 함수가 공유, 동시성 안전)
	cfg := json.DefaultConfig()
	processor, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	json.SetGlobalProcessor(processor)   // 이전 전역 Processor 는 자동으로 닫힘
	defer json.ShutdownGlobalProcessor() // 애플리케이션 종료 시 깔끔하게 종료

	data := `{"user":{"name":"Alice","age":30}}`

	// 여러 goroutine 이 패키지 레벨 함수를 동시에 사용 (같은 전역 Processor 공유)
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

:::warning 소유권 이전
`SetGlobalProcessor` 이후 해당 Processor 의 수명 주기는 전역 관리에 맡깁니다 — 더 이상 수동으로 `Close()` 하지 **마세요**. 어기면 전역 종료 로직과 충돌합니다. 종료 시 `ShutdownGlobalProcessor()` 를 호출하면 깔끔하게 닫히고 리소스가 해제됩니다.
:::

## 동시성 제한 MaxConcurrency

`Config.MaxConcurrency` (기본 50) 는 단일 Processor 의 **소프트 동시성 상한**입니다: 원자 카운터 세마포어로 진행 중인 작업 수를 제한합니다. 상한에 도달하면 새 작업은 `ErrConcurrencyLimit` 을 반환합니다 (재시도 가능).

```go
cfg := json.DefaultConfig()
cfg.MaxConcurrency = 100 // 단일 Processor 동시성 상한 상향
```

- `ErrConcurrencyLimit` 은 **재시도 가능한** 일시적 오류입니다 ([오류 처리](./error-handling#시스템-오류) 참조).
- 병렬 스트림 처리 (`StreamJSONLParallel`) 의 워커 수는 매개변수로 명시하며 `MaxConcurrency` 와 직접 묶이지 않지만, 같은 통제 슬롯을 공유합니다.
- `ParallelIterator` 의 워커 수는 `cfg.MaxConcurrency` (기본 50) 에서 가져오되 배열 길이에 맞춰 잘립니다.

## 모범 사례와 함정

### 1. Processor 를 재사용하고 요청마다 새로 만들지 않기

`Processor` 는 내부에 캐시, 재귀 프로세서 등 상태를 유지하므로 **같은 인스턴스를 재사용**해야 캐시가 적중합니다. 요청마다 `json.New()` 하면 캐시 이점을 잃고 할당만 늘어납니다.

### 2. 인스턴스 공유는 안전, 반환값 컨테이너 공유는 신중하게

`Processor` 는 goroutine 간 공유 가능합니다; 하지만 `Get` 이 반환한 `map`/`slice` 를 여러 goroutine 이 수정하며 공유하려면 호출자가 직접 잠금해야 합니다 (또는 `CacheSharedResults` 를 켜고 읽기 전용으로 취급).

### 3. Close 로 리소스 해제

장기 실행 서비스에서는 `defer processor.Close()` 와 `defer iter.Close()` 를 명시해 캐시 goroutine 과 메모리 누수를 피하세요. `SetGlobalProcessor` 로 설정한 인스턴스는 `ShutdownGlobalProcessor` 를 대신 사용합니다.

### 4. CPU 집약일 때만 병렬이 이득

병렬에는 스케줄링과 동기화 비용이 있습니다. 작은 배열 (`ParallelThreshold` 기본 10 미만) 은 직렬이 더 빠릅니다; JSONL 줄 수가 많고 한 줄 처리가 무거울 때 병렬 이득이 뚜렷합니다.

### 5. 병렬 모드에서는 줄 순서 주의

`StreamJSONLParallel` 은 처리 순서를 보장하지 않습니다. 순서 보존이 필요하면 `lineNum` 에 맞춰 해당 첨자에 기록하고 처리가 끝난 뒤 순서대로 소비하세요.

## 관련 문서

- [성능 최적화](./performance) — 프로세서 재사용, 범용 Go 동시성 패턴, 벤치마크
- [이터레이터 타입](../api-reference/iterator) — `ParallelIterator` 전체 API
- [JSONL 처리](../api-reference/processor/jsonl) — 병렬 JSONL API 상세
- [캐시와 사전 파싱](./caching) — 캐시 메커니즘과 PreParse 사전 파싱
- [오류 처리](./error-handling) — `ErrConcurrencyLimit` 등 오류 분류
