---
sidebar_label: "반복"
title: "Processor 반복 메서드 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON Processor 반복 메서드: Foreach, ForeachWithPath, ForeachNested 반복과 IterableValue 데이터 접근, IteratorControl 제어 흐름에 ForeachReturn 수정형 반복과 배치 반복 실무를 지원합니다."
sidebar_position: 10
---

# 반복 메서드

Processor 는 JSON 배열과 객체를 반복하는 다양한 메서드를 제공합니다.

::: tip 패키지 레벨 반복 함수와의 미러 관계
이 페이지의 8 개 `Foreach*` 메서드는 [패키지 레벨 반복 함수](../functions/iterate) 와 하나하나 같은 소스에서 나왔으며, 콜백 시그니처와 반복 의미가 완전히 같습니다. 전체 예제는 패키지 레벨 페이지를 참조하세요. Processor 쪽의 차이:

- **cfg 의미**: 선택적 마지막 `cfg` 가 이번 호출의 보안 검증 (크기, 깊이, 위험 패턴) 등을 제어; 생략하면 프로세서 자체 설정을 따릅니다.
- **캐시 보호**: 반복 루트를 먼저 `Get` 한 뒤 **깊은 복사**로 작업 사본을 만듭니다 — 콜백이 `item.GetData()` 가 반환한 컨테이너를 수정해도 프로세서의 파싱 캐시와 원본 입력이 오염되지 않습니다.
- **수명 주기**: 프로세서가 닫힌 뒤 모든 반복 메서드는 `ErrProcessorClosed` 를 반환합니다.
:::

## Foreach

시그니처: `func (p *Processor) Foreach(jsonStr string, fn func(key any, item *IterableValue), cfg ...Config)`

JSON 배열 또는 객체를 반복합니다.

```go
p.Foreach(data, func(key any, item *json.IterableValue) {
	fmt.Printf("Key: %v, Value: %v\n", key, item.GetData())
})
```

**배열 반복 시**: key 는 인덱스 (int)
**객체 반복 시**: key 는 키 이름 (string)

## ForeachWithPath

시그니처: `func (p *Processor) ForeachWithPath(jsonStr, path string, fn func(key any, item *IterableValue), cfg ...Config) error`

경로별로 반복하며 오류를 반환합니다.

```go
err := p.ForeachWithPath(data, "items", func(key any, item *json.IterableValue) {
	fmt.Printf("[%v] %v\n", key, item.GetData())
})
```

적합한 경우:
- 중첩 배열 반복
- 지정 경로의 객체 반복

## ForeachNested

시그니처: `func (p *Processor) ForeachNested(jsonStr string, fn func(key any, item *IterableValue), cfg ...Config)`

모든 중첩 수준을 재귀적으로 반복합니다.

```go
p.ForeachNested(data, func(key any, item *json.IterableValue) {
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

시그니처: `func (p *Processor) ForeachReturn(jsonStr string, fn func(key any, item *IterableValue), cfg ...Config) (string, error)`

JSON 데이터를 반복하고 다시 직렬화한 JSON 문자열을 반환합니다. 콜백은 반복 컨테이너를 **수정할 수 있습니다**: `item.GetData()` 가 작업 사본 (깊은 복사) 의 참조를 반환하므로 map / slice 의 추가/삭제/수정이 최종 직렬화 결과에 반영됩니다; 스칼라는 제자리 교체할 수 없습니다. 수정은 원본 입력과 프로세서 캐시에 영향을 주지 않습니다.

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

	data := `[{"id":1,"internal":"x"},{"id":2,"internal":"y"}]`
	result, err := p.ForeachReturn(data, func(key any, item *json.IterableValue) {
		if obj, ok := item.GetData().(map[string]any); ok {
			delete(obj, "internal") // 작업 사본 수정, 반환 결과에 반영
		}
	})
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 출력: [{"id":1},{"id":2}]
}
```

반복 후 체인 작업을 이어가야 하는 시나리오에 적합합니다.

## ForeachWithError

시그니처: `func (p *Processor) ForeachWithError(jsonStr, path string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

경로별로 반복하며 콜백이 오류 반환을 지원합니다.

```go
err := p.ForeachWithError(data, "items", func(key any, item *json.IterableValue) error {
	if item.GetInt("id") == 0 {
		return fmt.Errorf("invalid item at index %v", key)
	}
	return nil // 반복 계속
})
```

## ForeachNestedWithError

시그니처: `func (p *Processor) ForeachNestedWithError(jsonStr string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

모든 중첩 수준을 재귀적으로 반복하며 콜백이 오류 반환을 지원합니다.

```go
err := p.ForeachNestedWithError(data, func(key any, item *json.IterableValue) error {
	fmt.Printf("키: %v, 값: %v\n", key, item.GetData())
	return nil
})
```

## ForeachWithPathAndIterator

시그니처: `func (p *Processor) ForeachWithPathAndIterator(jsonStr, path string, fn func(key any, item *IterableValue, currentPath string) IteratorControl, cfg ...Config) error`

경로별로 반복하며 현재 경로 정보를 제공합니다. `IteratorControl` 로 반복 흐름을 제어합니다.

```go
err := p.ForeachWithPathAndIterator(data, "items", func(key any, item *json.IterableValue, currentPath string) json.IteratorControl {
	fmt.Printf("경로: %s, 키: %v\n", currentPath, key)
	if item.GetInt("id") == targetID {
		return json.IteratorBreak // 반복 중지
	}
	return json.IteratorNormal // 반복 계속
})
```

## ForeachWithPathAndControl

시그니처: `func (p *Processor) ForeachWithPathAndControl(jsonStr, path string, fn func(key any, value any) IteratorControl, cfg ...Config) error`

경로별로 원시 값을 반복하며 `IteratorControl` 로 흐름을 제어합니다.

```go
err := p.ForeachWithPathAndControl(data, "items", func(key any, value any) json.IteratorControl {
	fmt.Printf("키: %v, 값: %v\n", key, value)
	return json.IteratorNormal
})
```

## IterableValue

반복 콜백의 `IterableValue` 는 타입 안전한 값 접근을 제공합니다: `Get` / `GetString` / `GetInt` / `GetFloat64` / `GetBool` / `GetArray` / `GetObject` 와 기본값 변형 (`GetWithDefault`, `GetStringWithDefault`, `GetIntWithDefault` 등), 상태 판단 (`Exists` / `IsNull` / `IsNullData` / `IsEmpty` / `IsEmptyData`), 중첩 반복 `ForeachNested`, 그리고 `Break()` 중단 신호. 전체 메서드 목록과 개별 설명은 [IterableValue 타입 상세](../iterator) 를 참조하세요. 이 페이지의 콜백 사용법과 완전히 일치합니다.

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

---

## 파일 반복 메서드

Processor 는 파일에서 직접 반복하는 메서드를 제공하며, `LoadFromFile` + `Foreach` 계열의 편의 조합입니다: 경로 보안 검증, `MaxJSONSize` 읽기 제한, per-call `cfg` 투과가 모두 파일 로드 동작과 일치합니다.

| 메서드 | 시그니처 요점 | 의미 |
|------|----------|------|
| `ForeachFile` | `(filePath, fn, cfg...)` | 파일 루트 수준의 배열 / 객체 반복 |
| `ForeachFileWithPath` | `(filePath, path, fn, cfg...)` | 파일 내 지정 경로의 컬렉션 반복 |
| `ForeachFileChunked` | `(filePath, chunkSize, fn, cfg...)` | 루트 수준 **배열** 을 배치 단위로 반복 (`chunkSize` ≤0 이면 기본 100); 루트가 배열이 아니면 `ErrTypeMismatch` |
| `ForeachFileNested` | `(filePath, fn, cfg...)` | 모든 중첩 구조를 재귀적으로 반복 |

콜백은 모두 `func(key any, item *json.IterableValue) error` 입니다: `nil` 반환은 계속, `item.Break()` 는 깔끔한 중지, 다른 오류는 중단하고 반환합니다. 메서드별 전체 예제는 [패키지 레벨 반복 페이지](../functions/iterate#파일-반복-함수) 를 참조하세요 (마지막 `cfg` 하나만 더 있을 뿐 동작이 같습니다). 메서드 선택 표는 [파일 I/O](./file-io#메서드-선택) 를 참조하세요.

```go
err := p.ForeachFile("data.json", func(key any, item *json.IterableValue) error {
	fmt.Printf("[%v] %v\n", key, item.GetData())
	return nil // 반복 계속
})
```

## 파일 반복 메서드 비교

| 메서드 | 경로 매개변수 | 재귀 | 청크 | 적합한 시나리오 |
|------|:--------:|:----:|:----:|----------|
| `ForeachFile` | 없음 | 아니오 | 아니오 | 간단한 파일 순회 |
| `ForeachFileWithPath` | 있음 | 아니오 | 아니오 | 특정 지점 순회 |
| `ForeachFileChunked` | 없음 | 아니오 | **예** | 배치 처리, 메모리 제한 |
| `ForeachFileNested` | 없음 | **예** | 아니오 | 모든 노드 깊이 순회 |

---

## 반복 제어

콜백이 `item.Break()` 를 반환하면 반복을 깔끔하게 중단할 수 있습니다 (전체 반환은 `nil`); 다른 오류를 반환하면 즉시 중단되고 그 오류가 그대로 반환됩니다. 경로 정보를 제공하는 두 변형 (`ForeachWithPathAndIterator` / `ForeachWithPathAndControl`) 은 `IteratorControl` 상수 (`json.IteratorNormal` / `json.IteratorBreak`) 로 흐름을 제어합니다 — 일상적인 시나리오에서는 `item.Break()` 를 우선 사용하세요. 예제와 상수 설명은 [패키지 레벨 반복 페이지](../functions/iterate#반복-제어) 를 참조하세요.

```go
err := p.ForeachFile("data.json", func(key any, item *json.IterableValue) error {
	if item.GetInt("id") == targetID {
		return item.Break() // 대상을 찾았으므로 깔끔하게 중지
	}
	return nil // 반복 계속
})
```

---

## 관련 문서

- [경로 쿼리](./query) - Get 계열 메서드
- [배치 작업](./batch) - ProcessBatch 배치 처리
- [파일 I/O](../functions/file-io) - LoadFromFile/SaveToFile
