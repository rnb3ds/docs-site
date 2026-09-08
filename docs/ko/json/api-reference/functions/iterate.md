---
sidebar_label: "반복 메서드"
title: "패키지 레벨 반복 함수 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON 패키지 레벨 반복 함수: Foreach, ForeachWithPath, ForeachNested 재귀, ForeachWithError 오류 처리와 IterableValue 데이터 접근, ForeachFile 파일 반복 포함."
sidebar_position: 10
---

# 패키지 레벨 반복 함수

Processor 인스턴스 생성 없이 직접 호출하는 반복 함수입니다. [Processor 반복 메서드](../processor/iterate) 와 일대일로 대응합니다 (이중 레이어 설계).

::: tip 반복 순서는 결정적
객체 반복은 키 이름 **사전순**으로, 배열은 자연 순서로 진행됩니다 — Go map 의 네이티브 반복 순서는 무작위이지만 라이브러리 내부에서 정렬하므로, 같은 입력에 대한 콜백 순서가 재현 가능하고 출력을 테스트할 수 있습니다.
:::

## Foreach

시그니처: `func Foreach(jsonStr string, fn func(key any, item *IterableValue), cfg ...Config)`

JSON 배열 또는 객체를 반복합니다.

```go
json.Foreach(data, func(key any, item *json.IterableValue) {
	fmt.Printf("Key: %v, Value: %v\n", key, item.GetData())
})
```

**배열 반복 시**: key 는 인덱스 (int)
**객체 반복 시**: key 는 키 이름 (string)

## ForeachWithPath

시그니처: `func ForeachWithPath(jsonStr, path string, fn func(key any, item *IterableValue), cfg ...Config) error`

경로별로 반복하며 오류를 반환합니다.

```go
err := json.ForeachWithPath(data, "items", func(key any, item *json.IterableValue) {
	fmt.Printf("[%v] %v\n", key, item.GetData())
})
```

적합한 경우:
- 중첩 배열 반복
- 지정 경로의 객체 반복

## ForeachNested

시그니처: `func ForeachNested(jsonStr string, fn func(key any, item *IterableValue), cfg ...Config)`

모든 중첩 수준을 재귀적으로 반복합니다. 재귀 깊이 상한은 200 입니다 (깊은 중첩 구조로 인한 스택 오버플로 방지, 초과하는 하위 트리는 더 들어가지 않음).

```go
json.ForeachNested(data, func(key any, item *json.IterableValue) {
	fmt.Printf("키: %v, 값: %v\n", key, item.GetData())
})
```

예제 데이터:

```json
{
  "user": {
    "name": "test",
    "profile": {
      "age": 25,
      "tags": ["a", "b"]
    }
  }
}
```

출력:

```text
키: user, 값: map[string]any{...}
키: name, 값: test
키: profile, 값: map[string]any{...}
키: age, 값: 25
키: tags, 값: []any{...}
...
```

## ForeachReturn

시그니처: `func ForeachReturn(jsonStr string, fn func(key any, item *IterableValue), cfg ...Config) (string, error)`

JSON 데이터를 반복하며 콜백으로 각 요소에 접근하고, 다시 직렬화한 JSON 문자열을 반환합니다. 콜백은 `GetData()` 를 통해 map/slice 를 수정할 수 있으며 수정은 반환값에 반영됩니다. 두 가지 주의점: **컨테이너 내부**만 수정 가능합니다 (map 키 추가/삭제, slice 요소 변경) — `IterableValue` 로 스칼라 요소를 제자리 교체할 수는 없습니다; 반복은 파싱 결과의 **깊은 복사**에서 실행되므로 프로세서 캐시를 오염시키지 않습니다.

```go
result, err := json.ForeachReturn(data, func(key any, item *json.IterableValue) {
	// item.GetData() 로 요소 접근/수정 가능
})
```

반복 후 체인 작업을 이어가야 하는 시나리오에 적합합니다.

## ForeachWithError

시그니처: `func ForeachWithError(jsonStr, path string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

경로별로 반복하며 콜백이 오류 반환을 지원합니다.

```go
err := json.ForeachWithError(data, "items", func(key any, item *json.IterableValue) error {
	if item.GetInt("id") == 0 {
		return fmt.Errorf("invalid item at index %v", key)
	}
	return nil // 반복 계속
})
```

## ForeachNestedWithError

시그니처: `func ForeachNestedWithError(jsonStr string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

모든 중첩 수준을 재귀적으로 반복하며 콜백이 오류 반환을 지원합니다.

```go
err := json.ForeachNestedWithError(data, func(key any, item *json.IterableValue) error {
	fmt.Printf("키: %v, 값: %v\n", key, item.GetData())
	return nil
})
```

## ForeachWithPathAndIterator

시그니처: `func ForeachWithPathAndIterator(jsonStr, path string, fn func(key any, item *IterableValue, currentPath string) IteratorControl, cfg ...Config) error`

경로별로 반복하며 현재 경로 정보를 제공합니다. `IteratorControl` 로 반복 흐름을 제어합니다.

```go
err := json.ForeachWithPathAndIterator(data, "items", func(key any, item *json.IterableValue, currentPath string) json.IteratorControl {
	fmt.Printf("경로: %s, 키: %v\n", currentPath, key)
	if item.GetInt("id") == targetID {
		return json.IteratorBreak // 반복 중지
	}
	return json.IteratorNormal // 반복 계속
})
```

## ForeachWithPathAndControl

시그니처: `func ForeachWithPathAndControl(jsonStr, path string, fn func(key any, value any) IteratorControl, cfg ...Config) error`

경로별로 원시 값을 반복하며 `IteratorControl` 로 흐름을 제어합니다.

```go
err := json.ForeachWithPathAndControl(data, "items", func(key any, value any) json.IteratorControl {
	fmt.Printf("키: %v, 값: %v\n", key, value)
	return json.IteratorNormal
})
```

## IterableValue

반복 콜백의 `IterableValue` 는 편리한 값 접근 기능을 제공하며, 전체 메서드 정의는 [이터레이터 타입](../iterator#iterablevalue-타입) 을 참조하세요.

| 메서드 | 설명 |
|------|------|
| `GetData() any` | 현재 값 가져오기 |
| `Get(path string) any` | 경로로 값 가져오기 |
| `GetString(key string) string` | 문자열 값 가져오기 |
| `GetInt(key string) int` | 정수 값 가져오기 |
| `GetFloat64(key string) float64` | 부동소수점 값 가져오기 |
| `GetBool(key string) bool` | 불리언 값 가져오기 |
| `GetArray(key string) []any` | 배열 값 가져오기 |
| `GetObject(key string) map[string]any` | 객체 값 가져오기 |
| `Exists(key string) bool` | 필드 존재 여부 판단 |
| `IsNull(key string) bool` / `IsNullData() bool` | null 여부 판단 |
| `IsEmpty(key string) bool` / `IsEmptyData() bool` | 비어 있는지 판단 |
| `Break() error` | 반복을 중단하는 오류 신호 반환 |
| `Release()` | 리소스를 객체 풀로 반환 |

## 메서드 비교

| 메서드 | 경로 매개변수 | 재귀 | 반환값 | 오류 콜백 |
|------|:--------:|:----:|--------|:--------:|
| `Foreach` | 없음 | 아니오 | 없음 | 아니오 |
| `ForeachWithPath` | 있음 | 아니오 | error | 아니오 |
| `ForeachNested` | 없음 | 예 | 없음 | 아니오 |
| `ForeachReturn` | 없음 | 아니오 | (string, error) | 아니오 |
| `ForeachWithError` | 있음 | 아니오 | error | 예 |
| `ForeachNestedWithError` | 없음 | 예 | error | 예 |
| `ForeachWithPathAndIterator` | 있음 | 아니오 | error | IteratorControl |
| `ForeachWithPathAndControl` | 있음 | 아니오 | error | IteratorControl |

::: warning void 변형은 오류를 보고하지 않음
`Foreach` / `ForeachNested` 는 반환값이 없습니다: 프로세서 사용 불가 등의 설정 오류는 조용히 무시되고, 콜백 panic 은 잡아서 로그로 남긴 뒤 반복을 멈춥니다 (프로세스를 뚫고 나가지 않음). error 변형 (`*WithError` 계열) 은 콜백 panic 을 오류로 변환해 반환합니다. 오류 정보가 필요하면 항상 `error` 반환값이 있는 변형을 사용하세요.
:::

---

## 파일 반복 함수

패키지 레벨은 파일에서 직접 반복하는 함수를 제공하며, 대형 JSON 파일 처리에 적합합니다. [Processor 파일 반복 메서드](../processor/iterate#파일-반복-메서드) 와 대응합니다.

### ForeachFile

시그니처: `func ForeachFile(filePath string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

파일에서 JSON 을 로드해 반복합니다.

**매개변수**

| 이름 | 타입 | 설명 |
|------|------|------|
| `filePath` | `string` | JSON 파일 경로 |
| `fn` | `func(key any, item *IterableValue) error` | 반복 콜백 |

```go
err := json.ForeachFile("data.json", func(key any, item *json.IterableValue) error {
	fmt.Printf("[%v] %v\n", key, item.GetData())
	return nil // 반복 계속
})
```

---

### ForeachFileWithPath

시그니처: `func ForeachFileWithPath(filePath, path string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

파일에서 JSON 을 로드해 경로별로 반복합니다.

```go
// users 배열만 반복
err := json.ForeachFileWithPath("data.json", ".users", func(key any, item *json.IterableValue) error {
	name := item.GetString("name")
	fmt.Printf("사용자: %s\n", name)
	return nil
})
```

---

### ForeachFileChunked

시그니처: `func ForeachFileChunked(filePath string, chunkSize int, fn func(chunk []*IterableValue) error, cfg ...Config) error`

파일의 JSON 배열을 청크 단위로 반복하며, 대규모 데이터셋 배치 처리에 적합합니다.

**매개변수**

| 이름 | 타입 | 설명 |
|------|------|------|
| `filePath` | `string` | JSON 파일 경로 |
| `chunkSize` | `int` | 배치 처리 수 (≤0 이면 기본 100) |
| `fn` | `func(chunk []*IterableValue) error` | 배치 처리 콜백 |

```go
// 한 번에 100 개 레코드 처리
err := json.ForeachFileChunked("large_data.json", 100, func(chunk []*json.IterableValue) error {
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

::: tip 사용 시나리오
- 데이터베이스 배치 삽입
- 분할 API 호출
- 메모리가 제한된 대용량 파일 처리
:::

---

### ForeachFileNested

시그니처: `func ForeachFileNested(filePath string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

파일에서 JSON 을 로드해 모든 중첩 구조를 재귀적으로 반복합니다.

```go
err := json.ForeachFileNested("config.json", func(key any, item *json.IterableValue) error {
	// 모든 수준의 모든 키-값 쌍 순회
	fmt.Printf("경로: %v, 타입: %T\n", key, item.GetData())
	return nil
})
```

**예제 데이터**:

```json
{
  "database": {
    "host": "localhost",
    "port": 5432,
    "pool": {
      "min": 5,
      "max": 20
    }
  }
}
```

**출력**:

```text
경로: database, 타입: map[string]any
경로: host, 타입: string
경로: port, 타입: float64
경로: pool, 타입: map[string]any
경로: min, 타입: float64
경로: max, 타입: float64
```

---

## 파일 반복 메서드 비교

| 메서드 | 경로 매개변수 | 재귀 | 청크 | 적합한 시나리오 |
|------|:--------:|:----:|:----:|----------|
| `ForeachFile` | 없음 | 아니오 | 아니오 | 간단한 파일 순회 |
| `ForeachFileWithPath` | 있음 | 아니오 | 아니오 | 특정 지점 순회 |
| `ForeachFileChunked` | 없음 | 아니오 | **예** | 배치 처리, 메모리 제한 |
| `ForeachFileNested` | 없음 | **예** | 아니오 | 모든 노드 깊이 순회 |

---

## 반복 제어

### IteratorControl 상수

`ForeachWithPathAndControl` 와 `ForeachWithPathAndIterator` 는 `IteratorControl` 를 반환해 반복 흐름을 제어합니다 (상수 정의는 [이터레이터 타입](../iterator#iteratorcontrol-상수) 참조):

| 상수 | 설명 |
|------|------|
| `IteratorNormal` | 정상적으로 반복 계속 |
| `IteratorContinue` | `IteratorNormal` 의 no-op 별칭 (API 대칭을 위해 유지) — '현재 항목 건너뛰기'는 암묵적입니다: 부작용이 없으며 반복은 평소대로 계속 |
| `IteratorBreak` | 반복 중지 |

### 반복 중단

오류 콜백에서 `item.Break()` 를 반환하면 반복을 중단할 수 있습니다:

```go
err := json.ForeachFile("data.json", func(key any, item *json.IterableValue) error {
	if item.GetInt("id") == targetID {
		// 대상을 찾았으므로 반복 중지
		return item.Break()
	}
	return nil // 반복 계속
})
```

### 오류 처리

다른 오류를 반환하면 반복이 중단되고 해당 오류가 반환됩니다:

```go
err := json.ForeachFile("data.json", func(key any, item *json.IterableValue) error {
	if item.GetString("status") == "error" {
		return fmt.Errorf("오류 레코드 발견: %v", key)
	}
	return nil
})
if err != nil {
	log.Printf("반복 중단: %v", err)
}
```

---

## 관련 문서

- [Processor 반복 메서드](../processor/iterate) - 대응하는 프로세서 메서드
- [이터레이터 타입](../iterator) - Iterator/IterableValue/Stream/Batch/Parallel 타입 정의
- [경로 쿼리](./query) - Get 계열 메서드
- [배치 작업](./batch) - ProcessBatch 배치 처리
- [파일 I/O](./file-io) - LoadFromFile/SaveToFile
- [대용량 파일 처리 가이드](../../streaming/large-files) - 스트리밍 처리 시나리오 실습
