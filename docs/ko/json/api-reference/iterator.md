---
sidebar_label: "이터레이터와 스트리밍"
title: "이터레이터와 IterableValue - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON 이터레이터 타입: Iterator 순차 순회, IterableValue 데이터 접근, StreamIterator/StreamObjectIterator 스트림, BatchIterator 배치와 ParallelIterator 병렬 이터레이터 생성 및 메서드."
sidebar_position: 9
---

# 이터레이터 타입

json 패키지는 순차 순회, 스트리밍 처리, 배치 처리, 병렬 처리 시나리오를 아우르는 다양한 이터레이터 타입을 제공합니다. 반복 **함수** (`Foreach`/`ForeachFile` 등) 는 [패키지 레벨 반복 함수](./functions/iterate) 와 [Processor 반복 메서드](./processor/iterate) 를 참조하세요.

## IteratorControl 상수

`IteratorControl` 는 반복 제어 플래그를 나타내며, `ForeachWithPathAndControl` 와 `ForeachWithPathAndIterator` 가 반복 흐름을 제어하는 데 사용합니다.

| 상수 | 설명 |
|------|------|
| `IteratorNormal` | 정상적으로 반복 계속 (기본값, 제로값이 이것) |
| `IteratorContinue` | 반복 계속. `IteratorNormal` 과 동등 (API 대칭을 위해 유지한 별칭) — '현재 항목 건너뛰기'는 암묵적이며 반복은 항상 계속됩니다 |
| `IteratorBreak` | 반복 중지 |

**사용 시나리오**

| 시나리오 | 추천 반환값 | 설명 |
|------|------------|------|
| 요소 정상 처리 | `IteratorNormal` | 다음 요소 계속 처리 |
| 무효 데이터 필터링 | `IteratorContinue` | 현재 요소 건너뛰기, 반복 중단 안 함 |
| 대상 찾은 뒤 종료 | `IteratorBreak` | 필요한 데이터를 찾으면 즉시 중지 |
| 오류로 중단 | `IteratorBreak` | 심각한 오류 시 반복 중지 |

---

## Iterator 타입

`Iterator` 는 JSON 배열이나 객체를 순회하는 저수준 이터레이터로, `NewIterator` 로 생성합니다.

### NewIterator

시그니처: `func NewIterator(data any, cfg ...Config) *Iterator`

이터레이터 인스턴스를 생성합니다. 선택적 `cfg` 매개변수는 API 일관성을 위해 유지되며 현재 이터레이터 동작에 영향을 주지 않습니다.

```go
data := []any{"apple", "banana", "cherry"}
it := json.NewIterator(data)
for it.HasNext() {
	val, _ := it.Next()
	fmt.Println(val)
}
```

::: tip 반복 순서는 결정적
객체를 순회할 때 키는 **정렬된** 순서로 산출됩니다 (Go 네이티브 map 순회 순서는 무작위이지만 여기서는 결정적으로 처리); 배열은 인덱스 순서입니다. `Next()` 는 배열에서 요소 자체를, 객체에서는 현재 키에 해당하는 **값**을 반환합니다 (키는 반환하지 않음).
:::

### 메서드

| 메서드 | 시그니처 | 설명 |
|------|------|------|
| `HasNext` | `func (it *Iterator) HasNext() bool` | 더 많은 요소가 있는지 검사 |
| `Next` | `func (it *Iterator) Next() (any, bool)` | 다음 요소 가져오기 |
| `Reset` | `func (it *Iterator) Reset()` | 이터레이터 상태와 캐시를 지우고 재사용 준비 |
| `ResetWith` | `func (it *Iterator) ResetWith(data any)` | 상태를 지우고 새 데이터로 초기화 |

### Reset

이터레이터 상태를 지우고 캐시된 키를 해제합니다. 호출 후 `ResetWith` 로 다시 초기화할 수 있습니다.

```go
it := json.NewIterator(data1)
for it.HasNext() {
	it.Next()
}

it.Reset() // 캐시 지우기
```

::: warning 동시성 안전하지 않음
`Reset`/`ResetWith` 는 다른 goroutine 이 진행 중인 `HasNext()`/`Next()` 와 동시에 호출할 수 없습니다; 동시 순회가 필요하면 goroutine 마다 독립 이터레이터를 만드세요.
:::

### ResetWith

이터레이터 상태를 지우고 새 데이터로 초기화하여 재사용합니다. 동시성 제약은 `Reset` 과 같습니다.

```go
it := json.NewIterator(data1)
// ... data1 순회 ...

it.ResetWith(data2) // 이터레이터를 재사용해 새 데이터 순회
for it.HasNext() {
	val, _ := it.Next()
	fmt.Println(val)
}
```

---

## IterableValue 타입

IterableValue 는 반복 과정의 현재 요소를 감싸며 편리한 값 접근 메서드를 제공합니다. `Foreach` 계열 함수의 콜백이 바로 `*IterableValue` 를 받습니다.

### 메서드

| 분류 | 메서드 |
|------|------|
| 기본 값 조회 | `GetData` / `Get` / `GetString` / `GetInt` / `GetFloat64` / `GetBool` / `GetArray` / `GetObject` |
| 기본값 조회 | `GetWithDefault` / `GetStringWithDefault` / `GetIntWithDefault` / `GetFloat64WithDefault` / `GetBoolWithDefault` |
| 상태 검사 | `Exists` / `IsNull` / `IsNullData` / `IsEmpty` / `IsEmptyData` |
| 흐름 제어 | `Break` / `ForeachNested` / `Release` |

#### GetData

시그니처: `func (iv *IterableValue) GetData() any`

기저 데이터를 반환합니다.

#### Get

시그니처: `func (iv *IterableValue) Get(path string) any`

경로로 값을 가져옵니다 (점 표기법과 배열 인덱스 지원).

```go
val := iv.Get("user.address.city")
val = iv.Get("users[0].name")
```

#### GetString

시그니처: `func (iv *IterableValue) GetString(key string) string`

문자열 값을 가져옵니다.

```go
name := item.GetString("name")
```

#### GetInt

시그니처: `func (iv *IterableValue) GetInt(key string) int`

정수 값을 가져옵니다.

```go
age := item.GetInt("age")
```

#### GetFloat64

시그니처: `func (iv *IterableValue) GetFloat64(key string) float64`

부동소수점 값을 가져옵니다.

```go
price := item.GetFloat64("price")
```

#### GetBool

시그니처: `func (iv *IterableValue) GetBool(key string) bool`

불리언 값을 가져옵니다.

```go
enabled := item.GetBool("enabled")
```

#### GetArray

시그니처: `func (iv *IterableValue) GetArray(key string) []any`

배열 값을 가져옵니다.

```go
items := item.GetArray("items")
```

#### GetObject

시그니처: `func (iv *IterableValue) GetObject(key string) map[string]any`

객체 값을 가져옵니다.

```go
profile := item.GetObject("profile")
```

#### GetWithDefault

시그니처: `func (iv *IterableValue) GetWithDefault(key string, defaultValue any) any`

값을 가져오며, 키가 없으면 기본값을 반환합니다.

```go
// 선택 필드 가져오기, 없으면 기본값 사용
timeout := item.GetWithDefault("timeout", 30)
mode := item.GetWithDefault("mode", "default")
```

#### GetStringWithDefault

시그니처: `func (iv *IterableValue) GetStringWithDefault(key string, defaultValue string) string`

문자열 값을 가져오며, 키가 없으면 기본값을 반환합니다.

```go
name := item.GetStringWithDefault("name", "알 수 없음")
```

#### GetIntWithDefault

시그니처: `func (iv *IterableValue) GetIntWithDefault(key string, defaultValue int) int`

정수 값을 가져오며, 키가 없으면 기본값을 반환합니다.

```go
age := item.GetIntWithDefault("age", 0)
port := item.GetIntWithDefault("port", 8080)
```

#### GetFloat64WithDefault

시그니처: `func (iv *IterableValue) GetFloat64WithDefault(key string, defaultValue float64) float64`

부동소수점 값을 가져오며, 키가 없으면 기본값을 반환합니다.

```go
price := item.GetFloat64WithDefault("price", 0.0)
rate := item.GetFloat64WithDefault("rate", 1.0)
```

#### GetBoolWithDefault

시그니처: `func (iv *IterableValue) GetBoolWithDefault(key string, defaultValue bool) bool`

불리언 값을 가져오며, 키가 없으면 기본값을 반환합니다.

```go
enabled := item.GetBoolWithDefault("enabled", false)
debug := item.GetBoolWithDefault("debug", true)
```

#### Exists

시그니처: `func (iv *IterableValue) Exists(key string) bool`

지정한 키가 존재하는지 검사합니다.

```go
if item.Exists("email") {
	email := item.GetString("email")
	fmt.Printf("이메일: %s\n", email)
}
```

#### ForeachNested

시그니처: `func (iv *IterableValue) ForeachNested(path string, fn func(key any, item *IterableValue))`

지정한 경로 아래의 중첩 구조를 재귀적으로 순회합니다.

#### IsNullData

시그니처: `func (iv *IterableValue) IsNullData() bool`

전체 값이 null 인지 검사합니다.

```go
if item.IsNullData() {
	fmt.Println("값이 null")
}
```

#### IsNull

시그니처: `func (iv *IterableValue) IsNull(key string) bool`

지정한 키의 값이 null 인지 검사합니다.

```go
if item.IsNull("optional_field") {
	fmt.Println("선택 필드가 null")
}
```

#### IsEmptyData

시그니처: `func (iv *IterableValue) IsEmptyData() bool`

전체 값이 비어 있는지 검사합니다 (nil, 빈 문자열, 빈 배열 또는 빈 객체).

```go
if item.IsEmptyData() {
	fmt.Println("값이 비어 있음")
}
```

#### IsEmpty

시그니처: `func (iv *IterableValue) IsEmpty(key string) bool`

지정한 키의 값이 비어 있는지 검사합니다.

```go
if item.IsEmpty("tags") {
	fmt.Println("태그 목록이 비어 있음")
}
```

#### Break

시그니처: `func (iv *IterableValue) Break() error`

반복을 멈추는 신호를 반환합니다. 반복 콜백에서 호출하면 순회를 조기 종료할 수 있습니다.

```go
// 주의: Break() 는 콜백이 error 를 반환하는 반복 함수에서만 효과가 있습니다
// (예: ForeachWithError, ForeachNestedWithError 등). 일반 Foreach 콜백은
// error 를 반환하지 않으므로 그 안에서 item.Break() 를 호출해도 반복이 멈추지 않습니다.
err := json.ForeachNestedWithError(data, func(key any, item *json.IterableValue) error {
	if item.GetString("status") == "stop" {
		// 대상을 찾은 뒤 반복 중지
		return item.Break()
	}
	// 계속 처리
	return nil
})
```

#### Release

시그니처: `func (iv *IterableValue) Release()`

IterableValue 를 객체 풀에 돌려보내 내부 데이터 참조를 해제합니다.

```go
json.Foreach(data, func(key any, item *json.IterableValue) {
	// 데이터 처리...
	fmt.Println(item.GetData())
	// 처리가 끝나면 해제해 GC 부담 경감
	item.Release()
})
```

::: tip 생략 가능한 Release
반복 함수는 콜백이 반환된 후 각 `IterableValue` 를 **자동으로** 객체 풀에 돌려보냅니다. 콜백 안에서 명시적으로 `Release()` 를 호출하는 것은 중복이지만 무해합니다 (내부에 이중 반환 방지 보호가 있음). 콜백 반환 후 내부 데이터는 즉시 비워지므로 `*IterableValue` 를 콜백 밖에 저장해 계속 사용하면 **안 됩니다** — 보존이 필요하면 `GetData()` 로 꺼낸 데이터를 복사하세요.
:::

### IterableValue 전체 예제

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"users": [
        {"name": "Alice", "age": 30, "email": null},
        {"name": "Bob", "tags": []}
    ]}`

	err := json.ForeachWithError(data, "users", func(key any, item *json.IterableValue) error {
		idx, _ := key.(int)

		// 기본값으로 가져오기
		name := item.GetStringWithDefault("name", "알 수 없음")
		age := item.GetIntWithDefault("age", 0)

		// 존재 / null / 빈값 검사
		hasEmail := item.Exists("email")
		emailNull := item.IsNull("email")
		tagsEmpty := item.IsEmpty("tags")

		fmt.Printf("[%d] name=%s age=%d 이메일존재=%v 이메일null=%v 태그빈=%v\n",
			idx, name, age, hasEmail, emailNull, tagsEmpty)

		// Alice 를 찾으면 조기 종료
		if name == "Alice" {
			return item.Break()
		}
		return nil
	})
	if err != nil {
		panic(err)
	}
	// 출력:
	// [0] name=Alice age=30 이메일존재=true 이메일null=true 태그빈=true
}
```

---

## StreamIterator 타입

StreamIterator 는 메모리 효율적인 스트리밍 반복을 제공하며, 대형 JSON 배열에 적합합니다. 요소별로 처리하여 전체 배열을 메모리에 로드할 필요가 없습니다.

### NewStreamIterator

시그니처: `func NewStreamIterator(reader io.Reader, cfg ...Config) *StreamIterator`

스트리밍 이터레이터를 생성합니다. `Config.BufferSize` 로 버퍼 크기를 설정합니다 (기본 32KB, `BufferSize <= 0` 이면 32KB 로 폴백); cfg 를 전달하면 `MaxJSONSize` 이 **스트림 전체의 총 바이트 수**에 적용되어 초과 시 오류가 납니다.

```go
file, _ := os.Open("large-array.json")
defer file.Close()

// 설정 없이
it := json.NewStreamIterator(file)
for it.Next() {
	val := it.Value()
	fmt.Printf("인덱스 %d: %v\n", it.Index(), val)
}
if err := it.Err(); err != nil {
	panic(err)
}

// 설정 포함
cfg := json.DefaultConfig()
cfg.BufferSize = 64 * 1024 // 64KB 버퍼
it2 := json.NewStreamIterator(file, cfg)
```

::: tip 최상위 입력 형태
`StreamIterator` 는 JSON **배열**을 대상으로 합니다. 최상위가 단일 스칼라 (예: `"hello"`, `42`) 이면 그것을 유일한 요소로 한 번 산출하고; 최상위가 객체나 다른 구분자로 시작하면 `Next()` 가 false 를 반환하고 `Err()` 이 'expects a JSON array' 오류를 보고합니다.
:::

### 메서드

| 메서드 | 시그니처 | 설명 |
|------|------|------|
| `Next` | `func (si *StreamIterator) Next() bool` | 다음 요소로 전진 |
| `Value` | `func (si *StreamIterator) Value() any` | 현재 요소 반환 |
| `Index` | `func (si *StreamIterator) Index() int` | 현재 인덱스 반환 (0 부터) |
| `Err` | `func (si *StreamIterator) Err() error` | 반복 중 오류 반환 |

---

## StreamObjectIterator 타입

StreamObjectIterator 는 메모리 효율적인 스트리밍 반복을 제공하며, 대형 JSON 객체에 적합합니다.

### NewStreamObjectIterator

시그니처: `func NewStreamObjectIterator(reader io.Reader, cfg ...Config) *StreamObjectIterator`

스트리밍 객체 이터레이터를 생성합니다. `Config.BufferSize` (기본 32KB) 와 `MaxJSONSize` (스트림 총 바이트 상한) 의 의미는 `NewStreamIterator` 와 같습니다.

```go
file, _ := os.Open("large-object.json")
defer file.Close()

it := json.NewStreamObjectIterator(file)
for it.Next() {
	fmt.Printf("키: %s, 값: %v\n", it.Key(), it.Value())
}
if err := it.Err(); err != nil {
	panic(err)
}
```

::: tip 최상위 객체만 받음
첫 token 이 `{` 이 아니면 `Next()` 가 바로 false 를 반환하며 끝납니다 (오류 없음); 키가 문자열이 아니어도 조용히 끝납니다. 읽을 때는 스트림의 **등장 순서**대로 키-값 쌍을 산출합니다 (정렬하지 않음).
:::

### 메서드

| 메서드 | 시그니처 | 설명 |
|------|------|------|
| `Next` | `func (soi *StreamObjectIterator) Next() bool` | 다음 키-값 쌍으로 전진 |
| `Key` | `func (soi *StreamObjectIterator) Key() string` | 현재 키 반환 |
| `Value` | `func (soi *StreamObjectIterator) Value() any` | 현재 값 반환 |
| `Err` | `func (soi *StreamObjectIterator) Err() error` | 반복 중 오류 반환 |

---

## BatchIterator 타입

BatchIterator 는 대형 배열의 효율적인 배치 처리에 사용되며, 요소별 처리 오버헤드를 줄입니다. `NewBatchIterator` 로 생성합니다.

### NewBatchIterator

시그니처: `func NewBatchIterator(data []any, cfg ...Config) *BatchIterator`

배치 이터레이터를 생성합니다. `Config.MaxBatchSize` 로 배치 크기를 설정합니다 (cfg 미전달 또는 `MaxBatchSize <= 0` 이면 배치당 기본 100 개 요소).

::: tip 배치 분할 방식
`NextBatch` 가 반환하는 것은 기저 배열 슬라이스의 **뷰** (`data[current:end]`) 로 데이터를 복사하지 않습니다; 마지막 배치는 batchSize 보다 작을 수 있으며, 뷰의 요소를 수정하면 원본 배열에 영향을 줍니다.
:::

```go
data := make([]any, 10000)
// 데이터 채우기...

cfg := json.DefaultConfig()
cfg.MaxBatchSize = 100 // 배치당 100 개 요소
it := json.NewBatchIterator(data, cfg)
for it.HasNext() {
	batch := it.NextBatch()
	// 배치 처리
	processBatch(batch)
	fmt.Printf("처리한 요소 %d 개, 남은 %d 개\n", len(batch), it.Remaining())
}
```

### 메서드

| 메서드 | 시그니처 | 설명 |
|------|------|------|
| `NextBatch` | `func (it *BatchIterator) NextBatch() []any` | 다음 배치 요소 반환; 남은 배치가 없으면 nil |
| `HasNext` | `func (it *BatchIterator) HasNext() bool` | 더 많은 배치가 있는지 검사 |
| `Reset` | `func (it *BatchIterator) Reset()` | 이터레이터를 시작 위치로 재설정 |
| `TotalBatches` | `func (it *BatchIterator) TotalBatches() int` | 총 배치 수 반환 (`ceil(len/batchSize)` 올림; batchSize 가 양수가 아니면 0) |
| `CurrentIndex` | `func (it *BatchIterator) CurrentIndex() int` | 현재까지 소비한 배열 위치 반환 |
| `Remaining` | `func (it *BatchIterator) Remaining() int` | 남은 요소 수 반환 (모두 소비하면 0) |

---

## ParallelIterator 타입

ParallelIterator 는 배열의 병렬 처리에 사용되며, 멀티코어 CPU 로 처리를 가속합니다.

### NewParallelIterator

시그니처: `func NewParallelIterator(data []any, cfg ...Config) *ParallelIterator`

병렬 이터레이터를 생성합니다. `Config.MaxConcurrency` 로 워커 수를 설정합니다 (cfg 미전달 또는 `MaxConcurrency <= 0` 이면 기본 4; 실제 goroutine 수는 `len(data)` 를 넘지 않으며, 빈 데이터면 1).

```go
data := make([]any, 10000)
// 데이터 채우기...

cfg := json.DefaultConfig()
cfg.MaxConcurrency = 8 // 8 개 워커
it := json.NewParallelIterator(data, cfg)
err := it.ForEach(func(idx int, val any) error {
	// 각 요소를 병렬 처리
	return processItem(idx, val)
})
if err != nil {
	panic(err)
}
```

### ForEach

시그니처: `func (it *ParallelIterator) ForEach(fn func(int, any) error) error`

각 요소를 병렬로 처리하고 처음 만난 오류를 반환합니다.

```go
err := it.ForEach(func(idx int, val any) error {
	// 이 함수는 여러 goroutine 에서 병렬 실행됨
	return nil
})
```

::: tip 오류와 종료 의미
어떤 콜백이든 오류를 반환하면 나머지 워커는 가능한 한 빨리 배분을 멈추고 **첫 번째** 오류를 반환합니다; `Close` 이후의 호출은 콜백을 실행하지 않고 바로 nil 을 반환합니다; 콜백 panic 은 잡혀 오류로 변환되어 반환되며 프로세스를 뚫고 나가지 않습니다.
:::

### ForEachWithContext

시그니처: `func (it *ParallelIterator) ForEachWithContext(ctx context.Context, fn func(int, any) error) error`

컨텍스트가 있는 병렬 처리로 취소를 지원합니다. 컨텍스트가 취소되면 `ctx.Err()` 를 반환합니다.

```go
ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()

err := it.ForEachWithContext(ctx, func(idx int, val any) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
		return processItem(idx, val)
	}
})
```

### ForEachBatch

시그니처: `func (it *ParallelIterator) ForEachBatch(batchSize int, fn func(int, []any) error) error`

병렬 배치 처리입니다. 각 배치는 단일 goroutine 이 처리합니다; `batchSize <= 0` 이면 100 으로 처리; 콜백은 **배치 번호** (몇 번째 배치인지) 와 해당 배치의 요소를 받습니다.

```go
err := it.ForEachBatch(100, func(batchIdx int, batch []any) error {
	// 각 배치는 하나의 goroutine 에서 처리
	return processBatch(batchIdx, batch)
})
```

### ForEachBatchWithContext

시그니처: `func (it *ParallelIterator) ForEachBatchWithContext(ctx context.Context, batchSize int, fn func(int, []any) error) error`

컨텍스트가 있는 병렬 배치 처리입니다. 취소 시 `ctx.Err()` 를, Close 후 nil 을 반환합니다.

### Map

시그니처: `func (it *ParallelIterator) Map(transform func(int, any) (any, error)) ([]any, error)`

각 요소를 병렬 변환하여 새 슬라이스를 반환합니다. 각 워커가 요소 인덱스에 해당하는 위치에 기록하므로 **결과 순서는 입력과 일치**합니다; 어떤 변환이 실패하면 `(nil, err)` 를 반환합니다.

```go
results, err := it.Map(func(idx int, val any) (any, error) {
	if num, ok := val.(float64); ok {
		return num * 2, nil
	}
	return nil, fmt.Errorf("unexpected type at index %d", idx)
})
```

### Filter

시그니처: `func (it *ParallelIterator) Filter(predicate func(int, any) bool) []any`

요소를 병렬 필터링하여 조건을 만족하는 요소의 슬라이스를 반환합니다. **입력 순서를 유지**합니다 (완료 순서가 아님); predicate 는 오류를 반환하지 않으며, 콜백 panic 은 중단 대신 로그로 기록됩니다.

```go
even := it.Filter(func(idx int, val any) bool {
	if num, ok := val.(float64); ok {
		return int(num)%2 == 0
	}
	return false
})
```

### Close

시그니처: `func (it *ParallelIterator) Close()`

ParallelIterator 리소스를 해제합니다: 실행 중인 goroutine 에 중지를 알리고 종료를 기다립니다. CAS 기반으로 **안전하게 반복 호출할 수 있고 멀티 goroutine 동시 호출도 가능**합니다.

```go
it := json.NewParallelIterator(data, cfg)
defer it.Close()
```

---

## 전체 예제

### 대용량 파일 스트리밍 처리

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"os"
)

func main() {
	file, err := os.Open("large-array.json")
	if err != nil {
		panic(err)
	}
	defer file.Close()

	it := json.NewStreamIterator(file)
	count := 0

	for it.Next() {
		val := it.Value()
		// 요소별 처리, 메모리 친화적
		count++
		if count%1000 == 0 {
			fmt.Printf("처리한 요소 %d 개, 현재 값: %v\n", count, val)
		}
	}

	if err := it.Err(); err != nil {
		panic(err)
	}

	fmt.Printf("총 %d 개 요소 처리\n", count)
}
```

### 병렬 처리

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"sync/atomic"
)

func main() {
	// JSON 배열 파싱
	data := `[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]`
	var arr []any
	json.Unmarshal([]byte(data), &arr)

	// 병렬 이터레이터 생성 (워커 4 개)
	cfg := json.DefaultConfig()
	cfg.MaxConcurrency = 4
	it := json.NewParallelIterator(arr, cfg)

	var sum int64

	err := it.ForEach(func(idx int, val any) error {
		if num, ok := val.(float64); ok {
			atomic.AddInt64(&sum, int64(num))
		}
		return nil
	})

	if err != nil {
		panic(err)
	}

	fmt.Printf("총합: %d\n", sum) // 출력: 총합: 55
}
```

### 배치 처리

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// 대규모 데이터셋 생성
	data := make([]any, 1000)
	for i := range data {
		data[i] = map[string]any{"id": i, "value": i * 10}
	}

	// 배치당 100 개 요소
	cfg := json.DefaultConfig()
	cfg.MaxBatchSize = 100
	it := json.NewBatchIterator(data, cfg)
	batchNum := 0

	for it.HasNext() {
		batch := it.NextBatch()
		batchNum++

		// 배치 처리 (예: 데이터베이스 배치 쓰기)
		fmt.Printf("배치 %d: 요소 %d 개 처리\n", batchNum, len(batch))
	}

	fmt.Printf("총 배치: %d\n", it.TotalBatches())
}
```

### Iterator 재사용

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// 첫 번째 순회
	it := json.NewIterator([]any{"a", "b", "c"})
	for it.HasNext() {
		val, _ := it.Next()
		fmt.Println(val)
	}

	// 같은 이터레이터를 재사용해 새 데이터 순회, 재할당 회피
	it.ResetWith([]any{1, 2, 3, 4})
	for it.HasNext() {
		val, _ := it.Next()
		fmt.Println(val)
	}
}
```

---

## 성능 권장 사항

1. **Iterator 재사용** - `Reset`/`ResetWith` 로 재할당을 피하세요. 여러 번 순회하는 시나리오에 적합
2. **대규모 데이터셋은 스트리밍 이터레이터** - `StreamIterator`/`StreamObjectIterator` 는 요소별 처리로 메모리 친화적
3. **배치 처리로 오버헤드 절감** - `BatchIterator` 로 배치 단위 처리, 요소별 오버헤드 감소
4. **CPU 집약 작업은 병렬 처리** - `ParallelIterator` 가 멀티코어로 가속
5. **IterableValue 해제** - `Foreach` 콜백에서 처리를 마친 뒤 `Release()` 를 호출해 GC 부담 경감

---

## 관련 문서

- [패키지 레벨 반복 함수](./functions/iterate) - Foreach/ForeachFile 등 반복 함수
- [Processor 반복 메서드](./processor/iterate) - 대응하는 프로세서 반복 메서드
- [대용량 파일 처리](../streaming/large-files) - 대용량 파일 처리 가이드와 API 레퍼런스
- [NDJSON 프로세서](../streaming/jsonl) - JSONL 처리
