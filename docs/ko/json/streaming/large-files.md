---
sidebar_label: "대용량 파일 가이드"
title: "대용량 파일 처리 - CyberGo JSON | 가이드"
description: "CyberGo JSON 대용량 파일: ForeachFile, ForeachFileChunked, ForeachFileWithPath, ForeachFileNested 스트리밍 메서드에 NDJSONProcessor·StreamIterator 로 메모리 제어, 로그 분석·ETL 대응."
sidebar_position: 1
---

# 대용량 파일 처리

대형 JSON 파일 (예: 로그, 설정, 데이터 내보내기) 을 메모리에 직접 로드하면 메모리 부족이 발생할 수 있습니다. json 라이브러리는 다양한 효율적인 처리 방법을 제공합니다.

::: tip 팁
스트리밍/병렬 이터레이터 (StreamIterator, StreamObjectIterator, BatchIterator, ParallelIterator) 의 타입 레벨 API 레퍼런스는 [이터레이터](../api-reference/iterator) 를, 병렬 처리 실무는 [동시성과 병렬 처리](../advanced/concurrency) 를 참조하세요.
:::

:::warning 경고
`ForeachFile` 및 `ForeachFileChunked`는 반복 전에 전체 파일을 메모리에 로드합니다. '청크' 동작은 메모리 내 데이터의 반복 방식에만 영향을 미치며, 파일 읽기 방식에는 영향을 주지 않습니다. 메모리를 진정으로 제어해야 하는 초대용량 파일 처리의 경우 `NDJSONProcessor`를 JSONL 형식과 함께 사용하거나 `StreamIterator`를 사용하세요.
:::

## 대체 방안

| 방안 | 적용 시나리오 | 메모리 사용량 |
|------|----------|----------|
| **Processor.ForeachFile** | 구조화된 반복 처리 | 전체 파일 로드, 항목별 반복 |
| **Processor.ForeachFileChunked** | 배치 청크 반복 처리 | 전체 파일 로드, 청크별 반복 |
| **NDJSONProcessor** | JSONL 파일 행 단위 처리 | 메모리 제어 가능, 진정한 스트림 처리 |
| **StreamIterator** | 대형 배열 요소별 스트리밍 디코딩 | 배열 길이와 무관한 메모리 |

### ForeachFile 계열 네 가지 변형

`ForeachFile` 패밀리는 총 네 가지 변형이 있으며, 모두 선택적 `Config` 를 받습니다 (호출별 파싱 및 보안 검증 옵션용). 차이는 순회 대상과 그룹화 방식에 있습니다:

| 변형 | 순회 대상 | 전형적인 시나리오 |
|------|----------|----------|
| `ForeachFile` | 루트 배열 요소 / 루트 객체 키 - 값 | 최상위가 곧 데이터 집합인 로그, 내보내기 파일 |
| `ForeachFileWithPath` | 지정 경로 아래의 배열/객체 | 파일 안의 `users`, `orders` 같은 하위 집합 |
| `ForeachFileChunked` | 루트 배열 요소, `chunkSize` 단위 배치 | 데이터베이스 배치 쓰기, 일괄 발송 |
| `ForeachFileNested` | 모든 중첩 구조 재귀 순회 | 깊이를 알 수 없는 다층 설정, 구조 통계 |

네 가지 모두 콜백에서 `item.Break()` 를 반환해 조기 중지할 수 있습니다; `ForeachFileChunked` 는 루트 노드가 JSON 배열이어야 하며 (그렇지 않으면 `ErrTypeMismatch` 반환), `chunkSize <= 0` 이면 100 으로 처리됩니다.

## 통합 API: Processor

### 설정 옵션

대용량 파일 처리 설정은 `Config`에 통합되어 있습니다:

```go
type Config struct {
	// ... 기타 설정 ...

	// 대용량 파일 처리 설정
	ChunkSize       int64 // 청크 크기 (기본 1MB)
	MaxMemory       int64 // 최대 메모리 사용량 (기본 100MB)
	BufferSize      int   // 읽기 버퍼 크기 (기본 64KB)
	SamplingEnabled bool  // 샘플링 활성화 여부 (기본 true)
	SampleSize      int   // 샘플링 수량 (기본 1000)
}
```

### 기본 사용

```go
package main

import (
	"github.com/cybergodev/json"
	"log"
)

func main() {
	// Processor 생성 (기본 설정 사용)
	processor, err := json.New()
	if err != nil {
		log.Fatal(err)
	}
	defer processor.Close()

	// 방법 1: 항목별 처리 (권장)
	count := 0
	err = processor.ForeachFile("large-data.json", func(key any, item *json.IterableValue) error {
		count++

		// IterableValue 편의 메서드로 필드 접근
		id := item.GetInt("id")
		name := item.GetString("name")
		email := item.GetString("email")

		// 경로로 중첩 속성 접근 지원
		city := item.GetString("profile.city")
		interests := item.GetArray("profile.interests")

		if count%10000 == 0 {
			log.Printf("처리한 레코드 %d건, 예시: id=%d name=%s email=%s city=%s 관심사=%d",
				count, id, name, email, city, len(interests))
		}
		return nil
	})

	if err != nil {
		log.Fatal(err)
	}
	log.Printf("처리 완료, 총 %d건 레코드", count)
}
```

### 배치 처리

```go
// 방법 2: 배치 처리 (데이터베이스 배치 쓰기에 적합)
err := processor.ForeachFileChunked("large-data.json", 1000, func(chunk []*json.IterableValue) error {
	log.Printf("배치 처리: %d건 레코드", len(chunk))

	// 데이터베이스에 배치 쓰기
	for _, item := range chunk {
		id := item.GetInt("id")
		name := item.GetString("name")
		// ... 데이터 처리
	}
	return nil
})
```

### 중단 제어 포함

```go
// 방법 3: 중단 제어 포함 (특정 데이터를 찾은 후 중지)
// item.Break() 반환으로 반복 중지, nil 반환으로 반복 계속
err := processor.ForeachFile("large-data.json", func(key any, item *json.IterableValue) error {
	id := item.GetInt("id")

	if id == targetID {
		// 대상 찾음, 반복 중지
		fmt.Printf("대상 발견: ID=%d, Name=%s\n", id, item.GetString("name"))
		return item.Break() // 반복 중지 (중단 신호 반환)
	}

	return nil // 반복 계속
})
```

### 객체 파일 처리

```go
// 방법 4: JSON 객체 파일 처리 (키 - 값 쌍 구조)
// 파일 형식: {"user1": {...}, "user2": {...}, ...}
err := processor.ForeachFile("config-map.json", func(key any, item *json.IterableValue) error {
	fmt.Printf("Key: %s, Name: %s\n", key, item.GetString("name"))
	return nil
})
```

### 커스텀 설정

```go
// 대용량 파일 처리 설정 커스텀
cfg := json.DefaultConfig()
cfg.ChunkSize = 10 * 1024 * 1024  // 10MB 청크
cfg.MaxMemory = 500 * 1024 * 1024 // 500MB 메모리 제한
cfg.BufferSize = 128 * 1024       // 128KB 버퍼

processor, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer processor.Close()
```

## IterableValue 편의 메서드

`ForeachFile*` 시리즈 메서드는 `IterableValue` 인터페이스를 제공하여 편리한 데이터 접근을 지원합니다:

| 메서드 | 설명 | 예제 |
|------|------|------|
| `Get(path)` | 값 가져오기 | `item.Get("field")` |
| `GetString(path)` | 문자열 가져오기 | `item.GetString("name")` |
| `GetInt(path)` | 정수 가져오기 | `item.GetInt("id")` |
| `GetFloat64(path)` | 실수 가져오기 | `item.GetFloat64("score")` |
| `GetBool(path)` | 불리언 가져오기 | `item.GetBool("active")` |
| `GetArray(path)` | 배열 가져오기 | `item.GetArray("tags")` |
| `GetObject(path)` | 객체 가져오기 | `item.GetObject("profile")` |
| `Exists(path)` | 필드 존재 여부 확인 | `item.Exists("email")` |
| `IsNull(path)` | null 여부 확인 | `item.IsNull("deleted_at")` |
| `IsEmpty(path)` | 비어 있는지 확인 | `item.IsEmpty("notes")` |
| `Break()` | 중단 신호 반환 | `return item.Break()` |

**경로 탐색 지원**

```go
city := item.GetString("profile.address.city") // 중첩 객체
firstTag := item.GetString("tags[0]")          // 배열 인덱스
lastTag := item.GetString("tags[-1]")          // 음수 인덱스 (마지막)
nested := item.GetString("data.items[0].name") // 복잡한 경로
```

::: warning 콜백 반환 후 IterableValue 참조를 들고 있지 마세요
`ForeachFile*` (및 메모리 상태의 `Foreach*`) 계열은 할당 오버헤드를 줄이기 위해 객체 풀을 사용합니다: **콜백이 반환된 후** `IterableValue` 는 풀에 반납되고 내부 데이터가 비워집니다. 필요한 값 (예: `GetString` 의 결과) 은 콜백 안에서 추출하고, `item` 자체나 `item.GetData()` 의 참조를 콜백 밖에 저장하지 마세요.
:::

## 스트림 처리 설정

`Config`를 통해 스트림 처리 매개변수를 설정합니다. 스트림 읽기와 직접 관련된 필드와 실제 동작:

| 필드 | 기본값 (`DefaultConfig`) | 동작 |
|------|--------------------------|------|
| `MaxJSONSize` | 100MB (`DefaultMaxJSONSize`) | 파일/Reader 읽기의 총 바이트 상한. `LoadFromFile`/`UnmarshalFromFile`/`LoadFromReader` 는 **읽는 동안** `io.LimitReader` 로 강제합니다 (잘림 감지를 위해 상한 +1 바이트, TOCTOU 경쟁 회피), `ForeachFile*` 계열은 `LoadFromFile` 을 거쳐 자동 상속; 스트리밍 이터레이터 생성자에 전달된 `cfg.MaxJSONSize > 0` 이면 전체 스트림에 상한 적용 |
| `BufferSize` | 64KB | `StreamIterator`/`StreamObjectIterator` 의 읽기 버퍼; `cfg` 를 전달했는데 `BufferSize <= 0` 이면 32KB 로 폴백 |
| `ChunkSize` | 1MB | 대용량 파일 청크 크기 (검증 범위 64KB–100MB) |
| `MaxMemory` | 100MB | 총 메모리 상한 (검증 범위 10MB–1GB); JSONL 스트리밍의 메모리 상한 폴백 체인은 `JSONLMaxMemory` → `MaxMemory` |
| `MaxNestingDepthSecurity` | 200 (`DefaultMaxNestingDepth`) | JSONL 각 행의 중첩 깊이 상한, 파싱 전 행별 검사 |
| `ValidateFilePath` | `true` | 필드는 선언되어 있지만 현재 **스위치로 동작하지 않음**: 파일 경로 보안 검사 (경로 순회, 심볼릭 링크, 플랫폼 제한) 는 읽기/쓰기 시 무조건 실행 |

`Config.Validate`/`ValidateWithWarnings` 는 범위를 벗어난 값을 조용히 합법 구간으로 되돌립니다 (예: `BufferSize` 는 4KB–1MB 로 클램프), `ValidateWithWarnings` 로 구체적인 조정 항목을 확인할 수 있습니다.

```go
cfg := json.DefaultConfig()

// 대용량 파일 처리 설정
cfg.ChunkSize = 10 * 1024 * 1024  // 10MB 청크
cfg.MaxMemory = 500 * 1024 * 1024 // 500MB 메모리 제한
cfg.BufferSize = 128 * 1024       // 128KB 버퍼

processor, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer processor.Close()
```

### StreamLinesInto 제네릭 함수 사용

```go
type User struct {
	Name string `json:"name"`
}

file, _ := os.Open("users.jsonl")
defer file.Close()

_, err := json.StreamLinesInto[User](file, func(lineNum int, user User) error {
	fmt.Printf("처리: %s\n", user.Name)
	return nil
})
```

### 병렬 처리

병렬 처리가 가능한 작업의 경우 멀티 goroutine 을 사용할 수 있습니다:

```go
package main

import (
	"github.com/cybergodev/json"
	"sync"
)

func main() {
	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	// worker pool 사용
	workers := 4
	items := make(chan any, 100)
	var wg sync.WaitGroup

	// workers 시작
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for item := range items {
				// item 처리 (비즈니스 로직으로 교체)
				_ = item
			}
		}(i)
	}

	// 스트림 읽기 및 분배
	processor.ForeachFile("large-data.json", func(key any, item *json.IterableValue) error {
		items <- item.GetData()
		return nil
	})

	close(items)
	wg.Wait()
}
```

데이터가 이미 메모리에 있다면 (`[]any`), 라이브러리 내장 [ParallelIterator](../api-reference/iterator#paralleliterator-타입) 병렬 이터레이터를 직접 사용해 worker pool 을 직접 작성하지 않아도 됩니다.

## 스트리밍 이터레이터와 병렬 이터레이터

`ForeachFile*` 는 전체 파일을 먼저 로드해야 합니다; 파일이 너무 커서 메모리에 통째로 올리기 어려울 때는 이 절의 이터레이터를 사용해야 합니다: `StreamIterator`/`StreamObjectIterator` 는 `io.Reader` 에서 읽으면서 바로 디코딩하므로 메모리 사용량이 데이터 규모와 무관합니다. 타입 레벨 전체 API 는 [이터레이터](../api-reference/iterator)를 참조하세요.

### StreamIterator: 대형 배열 요소별 스트리밍 디코딩

```go
package main

import (
	"fmt"
	"io"
	"strings"

	"github.com/cybergodev/json"
)

func main() {
	// 데모용 소량 데이터; 실제 시나리오에서는 os.Open("large-array.json") 으로 교체
	var src io.Reader = strings.NewReader(`[
        {"id": 1, "name": "Alice"},
        {"id": 2, "name": "Bob"},
        {"id": 3, "name": "Carol"}
    ]`)

	iter := json.NewStreamIterator(src)
	count := 0
	for iter.Next() {
		if obj, ok := iter.Value().(map[string]any); ok {
			fmt.Printf("index=%d id=%.0f name=%s\n", iter.Index(), obj["id"], obj["name"])
		}
		count++
	}
	if err := iter.Err(); err != nil {
		fmt.Println("반복 오류:", err)
		return
	}
	fmt.Println("총 반복 요소:", count)
	// 출력:
	// index=0 id=1 name=Alice
	// index=1 id=2 name=Bob
	// index=2 id=3 name=Carol
	// 총 반복 요소: 3
}
```

핵심 포인트:

- 최상위는 JSON 배열이어야 합니다; 최상위 스칼라는 단일 요소로 한 번 산출되고, 최상위 객체는 거부됩니다 (`iter.Err()` 가 오류 반환).
- 전달한 `cfg.MaxJSONSize > 0` 이면 **전체 스트림**의 총 바이트에 상한을 둡니다 (기본 폴백 100MB), 초과 시 반복 중 오류 발생.
- 요소를 하나씩 디코딩하므로 어느 순간에도 메모리에는 현재 요소만 존재합니다.

### StreamObjectIterator: 대형 객체 키 - 값별 스트리밍 디코딩

```go
package main

import (
	"fmt"
	"strings"

	"github.com/cybergodev/json"
)

func main() {
	src := strings.NewReader(`{
        "users":  {"count": 3},
        "orders": {"count": 128},
        "events": {"count": 9001}
    }`)

	iter := json.NewStreamObjectIterator(src)
	for iter.Next() {
		if obj, ok := iter.Value().(map[string]any); ok {
			fmt.Printf("%s: count=%.0f\n", iter.Key(), obj["count"])
		}
	}
	if err := iter.Err(); err != nil {
		fmt.Println("반복 오류:", err)
		return
	}
	// 출력 (map 의 무작위 순서가 아닌 문서 순서):
	// users: count=3
	// orders: count=128
	// events: count=9001
}
```

최상위가 아주 큰 단일 객체인 시나리오 (예: 설정 테이블, 파티션 인덱스) 에 적합하며, 키 - 값 쌍을 하나씩 처리합니다.

### BatchIterator: 메모리 배열 배치 소비

`BatchIterator` 는 이미 로드된 `[]any` 에 작용해 배치 단위로 슬라이스를 반환합니다. 중간 규모 배열을 고정 배치로 하위 시스템에 보내기에 적합합니다 (배치 적재, 페이지 계산):

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := []any{
		map[string]any{"id": 1},
		map[string]any{"id": 2},
		map[string]any{"id": 3},
		map[string]any{"id": 4},
		map[string]any{"id": 5},
	}

	// 배치 크기는 Config.MaxBatchSize; 기본 설정에서는 2000
	cfg := json.DefaultConfig()
	cfg.MaxBatchSize = 2

	iter := json.NewBatchIterator(data, cfg)
	fmt.Println("총 배치 수:", iter.TotalBatches())
	for iter.HasNext() {
		batch := iter.NextBatch()
		fmt.Printf("배치 [%d:%d), 요소 수=%d\n", iter.CurrentIndex()-len(batch), iter.CurrentIndex(), len(batch))
	}
	// 출력:
	// 총 배치 수: 3
	// 배치 [0:2), 요소 수=2
	// 배치 [2:4), 요소 수=2
	// 배치 [4:5), 요소 수=1
}
```

초대량 배치 적재에는 [`ForeachFileChunked`](#배치-처리) (파일 소스) 나 [`StreamJSONLChunked`](./jsonl#streamjsonlchunked) (JSONL 소스) 를 사용하세요; 둘 모두 청크 콜백이 반환된 후 `IterableValue` 를 반납하므로 콜백 안에서 적재를 마쳐야 합니다.

### ParallelIterator: CPU 집약적 병렬 처리

`ParallelIterator` 는 작업 풀로 메모리 배열을 병렬 처리합니다. worker 수는 `Config.MaxConcurrency` (기본 설정 50) 를 따르고 데이터 길이에 맞춰 자동 축소됩니다. `Map` 의 결과는 첨자 위치에 쓰여 입력 순서를 유지합니다:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	nums := []any{1, 2, 3, 4}

	iter := json.NewParallelIterator(nums)
	defer iter.Close()

	squares, err := iter.Map(func(idx int, val any) (any, error) {
		n, ok := val.(int)
		if !ok {
			return nil, fmt.Errorf("요소 %d 는 정수가 아닙니다", idx)
		}
		return n * n, nil
	})
	if err != nil {
		fmt.Println("처리 오류:", err)
		return
	}
	fmt.Println("제곱 결과:", squares)
	// 출력: 제곱 결과: [1 4 9 16]
}
```

`ForEach`/`ForEachWithContext` 는 어느 한 콜백이라도 오류를 반환하면 새 작업 배포를 중지하고 해당 오류를 반환합니다; 콜백의 panic 은 프로세스를 무너뜨리는 대신 오류로 복구됩니다; `Close` 는 모든 worker 에게 종료를 알리며 안전하게 동시 호출할 수 있습니다. 취소/타임아웃 시나리오에는 `ForEachWithContext`/`ForEachBatchWithContext` 변형을 사용하세요.

## 성능 최적화 제안

### 메모리 제어

```go
// 가용 메모리에 따라 설정
cfg := json.DefaultConfig()
cfg.MaxMemory = 500 * 1024 * 1024 // 500MB
cfg.ChunkSize = 10 * 1024 * 1024  // 10MB

processor, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer processor.Close()
```

### 모범 사례
1. **파일 크기 예측**: 처리 전 파일 크기를 확인하여 적절한 전략 선택
2. **메모리 제한 설정**: `MaxMemory`를 사용하여 OOM 방지
3. **배치 커밋**: 일정 수량 누적 후 데이터베이스에 배치 쓰기
4. **오류 처리**: `JSONLContinueOnErr` 구현 또는 실패 항목 기록
5. **진행 상황 모니터링**: 정기적으로 처리 진행 상황 출력

## 선택 가이드

| 파일 크기 | 추천 방안 | 예제 |
|---------|---------|------|
| < 10MB | 직접 로드 | `json.ParseAny` + `Get` |
| 10-100MB | Processor.ForeachFile | 항목별 처리 |
| 100MB-1GB | Processor.ForeachFileChunked | 청크 반복 처리 |
| > 1GB | NDJSONProcessor / JSONL 형식 | 진정한 스트림 처리, 메모리 제어 가능 |

## API 레퍼런스

이 섹션은 대용량 파일 처리 API 의 함수 시그니처와 매개변수 표를 요약하여 빠르게 조회할 수 있도록 합니다.

### Processor 메서드

**ForeachFile**

시그니처: `func (p *Processor) ForeachFile(filePath string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

대용량 파일의 JSON 배열 요소를 하나씩 반복합니다. [기본 사용](#기본-사용)과 [중단 제어](#중단-제어-포함)를 참조하세요.

**매개변수**

| 이름 | 타입 | 설명 |
|------|------|------|
| `filePath` | `string` | JSON 파일 경로 |
| `fn` | `func(key any, item *IterableValue) error` | 처리 콜백 |

**콜백 반환값**

| 반환값 | 설명 |
|--------|------|
| `nil` | 다음 항목으로 계속 처리 |
| `item.Break()` | 반복 중지, 오류 반환 안 함 |
| 기타 `error` | 반복 중지하고 오류 반환 |

**ForeachFileChunked**

시그니처: `func (p *Processor) ForeachFileChunked(filePath string, chunkSize int, fn func(chunk []*IterableValue) error, cfg ...Config) (err error)`

대용량 파일을 배치로 처리합니다. [배치 처리](#배치-처리)를 참조하세요.

**매개변수**

| 이름 | 타입 | 설명 |
|------|------|------|
| `filePath` | `string` | JSON 파일 경로 |
| `chunkSize` | `int` | 배치당 요소 수 |
| `fn` | `func(chunk []*IterableValue) error` | 배치 처리 콜백 |

**ForeachFileWithPath**

시그니처: `func (p *Processor) ForeachFileWithPath(filePath, path string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

파일에서 지정된 경로의 JSON 배열 또는 객체를 처리합니다.

**매개변수**

| 이름 | 타입 | 설명 |
|------|------|------|
| `filePath` | `string` | JSON 파일 경로 |
| `path` | `string` | JSON 경로 표현식 |
| `fn` | `func(key any, item *IterableValue) error` | 처리 콜백 |

```go
// 파일에서 users 배열의 각 요소 처리
err := p.ForeachFileWithPath("data.json", "users", func(key any, item *json.IterableValue) error {
	fmt.Printf("Name: %s\n", item.GetString("name"))
	return nil
})
```

**ForeachFileNested**

시그니처: `func (p *Processor) ForeachFileNested(filePath string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

파일의 모든 중첩 JSON 구조를 재귀적으로 순회합니다.

```go
// 모든 중첩 요소 재귀 순회
err := p.ForeachFileNested("data.json", func(key any, item *json.IterableValue) error {
	fmt.Printf("Key: %v, Type: %T\n", key, item.GetData())
	return nil
})
```

## 패키지 레벨 함수

Processor 메서드 외에도, 다음 함수는 Processor 인스턴스를 생성하지 않고 직접 호출할 수 있습니다. 내부적으로 전역 프로세서를 사용합니다.

### ForeachFile (패키지 레벨 함수)

시그니처: `func ForeachFile(filePath string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

파일에서 JSON 을 로드하고 반복합니다.

```go
err := json.ForeachFile("data.json", func(key any, item *json.IterableValue) error {
	fmt.Printf("[%v] %v\n", key, item.GetData())
	return nil
})
```

### ForeachFileWithPath (패키지 레벨 함수)

시그니처: `func ForeachFileWithPath(filePath, path string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

파일에서 JSON 을 로드하고 경로로 반복합니다.

```go
err := json.ForeachFileWithPath("data.json", "users", func(key any, item *json.IterableValue) error {
	name := item.GetString("name")
	fmt.Printf("사용자: %s\n", name)
	return nil
})
```

### ForeachFileChunked (패키지 레벨 함수)

시그니처: `func ForeachFileChunked(filePath string, chunkSize int, fn func(chunk []*IterableValue) error, cfg ...Config) error`

파일의 JSON 배열을 청크 단위로 반복합니다.

```go
err := json.ForeachFileChunked("large_data.json", 100, func(chunk []*json.IterableValue) error {
	for _, item := range chunk {
		processItem(item)
	}
	return nil
})
```

### ForeachFileNested (패키지 레벨 함수)

시그니처: `func ForeachFileNested(filePath string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

파일에서 JSON 을 로드하고 모든 중첩 구조를 재귀적으로 반복합니다.

```go
err := json.ForeachFileNested("config.json", func(key any, item *json.IterableValue) error {
	fmt.Printf("경로: %v, 타입: %T\n", key, item.GetData())
	return nil
})
```

## 관련 문서

- [NDJSON 프로세서](./jsonl) — JSONL/NDJSON 스트리밍 처리
- [JSONLWriter](./jsonl#jsonlwriter) — JSONL 쓰기

## 다음 단계

- [API 문서](../api-reference/) — 전체 API 레퍼런스
