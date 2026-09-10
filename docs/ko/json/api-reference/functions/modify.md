---
sidebar_label: "수정"
title: "수정 함수 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON 수정 함수: Set/SetMultiple 설정과 MergeJSON/MergeMany 병합, 경로 자동 생성, 원자적 작업과 합집합·교집합·차집합 MergeMode 전략, 배열 인덱스 교체·추가 지원에 수정은 원본을 건드리지 않는 새 문자열을 반환합니다."
sidebar_position: 3
---

# 수정 함수

json 패키지가 제공하는 JSON 수정 함수로, 경로 설정, 배치 갱신, 병합 작업을 지원합니다.

## 설정 함수

### Set

시그니처: `func Set(jsonStr, path string, value any, cfg ...Config) (string, error)`

지정된 경로에 값을 설정하고 수정된 JSON 문자열을 반환합니다.

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `jsonStr` | `string` | 예 | JSON 문자열 |
| `path` | `string` | 예 | 경로 표현식 |
| `value` | `any` | 예 | 설정할 값 |
| `cfg` | `Config` | 아니오 | 선택적 설정 |

**반환값과 오류**

성공 시 수정된 JSON 문자열과 `nil` 을 반환합니다; 실패 시 **수정되지 않은 원본** `jsonStr` 과 오류를 반환합니다 (`Delete` 와 동일한 계약이며, 센티널 값은 `errors.Is` 로 판별):

| 오류 | 트리거 시나리오 |
|------|----------|
| `ErrInvalidJSON` | `jsonStr` 이 유효한 JSON 이 아님 |
| `ErrInvalidPath` | 경로 표현식 문법이 잘못됨 |
| `ErrPathNotFound` | 경로가 존재하지 않고 `CreatePaths = false` |
| `ErrTypeMismatch` | 대상 위치에 타입 충돌이 있어 기록할 수 없음 |

**예제**

```go
result, err := json.Set(`{"user":{}}`, "user.name", "Alice")
if err != nil {
	panic(err)
}
fmt.Println(result) // {"user":{"name":"Alice"}}
```

**경로가 없을 때 자동 생성**

```go
// 중간 경로 자동 생성
result, err := json.Set(`{}`, "user.profile.name", "Bob")
// {"user":{"profile":{"name":"Bob"}}}
```

**다양한 타입의 값 설정**

```go
data := `{}`

// 문자열 설정
json.Set(data, "user.name", "Alice")

// 숫자 설정
json.Set(data, "user.age", 30)

// 불리언 설정
json.Set(data, "user.active", true)

// null 설정
json.Set(data, "user.deleted", nil)

// 중첩 객체 설정
json.Set(data, "user.address", map[string]any{
	"city": "Beijing",
	"zip":  "100000",
})

// 배열 설정
json.Set(data, "user.tags", []string{"admin", "developer"})
```

### SetMultiple

시그니처: `func SetMultiple(jsonStr string, updates map[string]any, cfg ...Config) (string, error)`

여러 경로의 값을 배치로 설정합니다.

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `jsonStr` | `string` | 예 | JSON 문자열 |
| `updates` | `map[string]any` | 예 | 경로-값 매핑 |
| `cfg` | `Config` | 아니오 | 선택적 설정 |

**예제**

```go
updates := map[string]any{
	"user.name":  "Bob",
	"user.age":   25,
	"user.email": "bob@example.com",
}
result, err := json.SetMultiple(data, updates)
if err != nil {
	panic(err)
}
fmt.Println(result)
```

**성능 이점**

여러 수정 작업에는 `SetMultiple` 이 `Set` 을 여러 번 호출하는 것보다 효율적입니다:

```go
// 권장: 한 번의 호출
updates := map[string]any{"a": 1, "b": 2, "c": 3}
result, err := json.SetMultiple(data, updates)

// 비권장: 여러 번 호출
result, err = json.Set(data, "a", 1)
result, err = json.Set(result, "b", 2)
result, err = json.Set(result, "c", 3)
```

### SetCreate

시그니처: `func SetCreate(jsonStr, path string, value any, cfg ...Config) (string, error)`

값을 설정하며 존재하지 않는 중간 경로를 자동 생성합니다. `Set` 에 `CreatePaths` 를 **강제로 켠** 것과 동등합니다: 추가로 `cfg` 를 전달해도 나머지 필드는 평소처럼 병합되지만 `CreatePaths` 는 항상 `true` 로 강제됩니다 ('여기서는 경로 생성 허용'을 명시적으로 자기 문서화). 기본 `Config.CreatePaths` 자체가 `true` 이므로 cfg 가 없을 때 `SetCreate` 와 `Set` 의 동작은 같습니다.

```go
// 중간 경로가 없을 때 자동 생성
result, err := json.SetCreate(`{}`, "user.profile.bio", "Developer")
// {"user":{"profile":{"bio":"Developer"}}}
```

### SetMultipleCreate

시그니처: `func SetMultipleCreate(jsonStr string, updates map[string]any, cfg ...Config) (string, error)`

여러 값을 배치로 설정하고 중간 경로를 자동 생성합니다. `SetMultiple` 과의 관계도 위와 같습니다: `cfg` 의 나머지 필드는 평소대로 적용되고 `CreatePaths` 는 `true` 로 강제됩니다.

```go
result, err := json.SetMultipleCreate(`{}`, map[string]any{
	"user.profile.bio":      "Developer",
	"user.profile.location": "China",
})
```

## 배열 경로의 수정

`Set` 계열은 배열 경로에 전용 동작이 있으며, 경로 문법은 [경로 표현식 문법](../../getting-started/path-syntax) 을 참조하세요:

```go
data := `{"items": ["a", "b", "c"]}`

// 인덱스 교체 (음수 인덱스 포함)
r1, _ := json.Set(data, "items[0]", "x")  // {"items":["x","b","c"]}
r2, _ := json.Set(data, "items[-1]", "z") // {"items":["a","b","z"]}

// 요소 추가
r3, _ := json.Set(data, "items[+]", "d") // {"items":["a","b","c","d"]}

// 와일드카드: 모든 요소를 같은 값으로 교체
r4, _ := json.Set(data, "items[*]", "-") // {"items":["-","-","-"]}

// 중첩: 배열 요소의 필드 (경로가 없으면 자동 생성)
users := `{"users": [{"name": "Alice"}]}`
r5, _ := json.Set(users, "users[0].age", 30)
// {"users":[{"age":30,"name":"Alice"}]}

r6, _ := json.SetCreate(`{}`, "users[0].profile.bio", "Developer")
// {"users":[{"profile":{"bio":"Developer"}}]}
```

::: warning 슬라이스 세그먼트의 제한
`items[1:3]` 같은 **슬라이스 세그먼트**는 조회 (하위 배열 반환) 에는 문제가 없지만, `Set`/`Delete` 의 **마지막 세그먼트**로 쓰이면 현재 버전에서는 오류를 반환합니다 ("distributed set ops on slices not yet supported") — 즉 '범위 내 모든 요소를 다시 쓰는' 분산 수정은 지원하지 않습니다. 이런 효과가 필요하면 `ForeachReturn` 이나 와일드카드 경로를 사용하세요.
:::

## 병합 함수

### MergeJSON

시그니처: `func MergeJSON(json1, json2 string, cfg ...Config) (string, error)`

깊은 병합 전략으로 두 JSON 객체를 병합합니다. 중첩 객체는 `Config.MergeMode` 로 지정한 모드에 따라 키를 재귀적으로 병합합니다. 원시 값과 배열은 patch 의 값이 우선합니다.

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `json1` | `string` | 예 | 기준 JSON 문자열 |
| `json2` | `string` | 예 | 덮어쓰기 JSON 문자열 |
| `cfg` | `...Config` | 아니오 | 선택적 설정 (`MergeMode` 로 병합 모드 설정) |

**병합 모드** (`Config.MergeMode` 로 설정, 기본값 `MergeUnion`):

| 모드 | 객체 동작 | 배열 동작 |
|------|----------|----------|
| `MergeUnion` | 모든 키를 병합하고 충돌 시 patch 값 사용 | 모든 요소를 병합하고 중복 제거 |
| `MergeIntersection` | 공통 키만 유지, 값은 patch 것 사용 | 공통 요소만 유지 |
| `MergeDifference` | base 에만 있는 키만 유지 | base 에만 있는 요소만 유지 |

```go
base := `{"a": 1, "b": 2, "nested": {"x": 10, "y": 20}}`
override := `{"b": 3, "c": 4, "nested": {"y": 30, "z": 40}}`

// 합집합 병합 (기본값)
result, _ := json.MergeJSON(base, override)
// 결과: {"a":1,"b":3,"c":4,"nested":{"x":10,"y":30,"z":40}}

// 교집합 병합 - 공통 키만 유지
cfg := json.DefaultConfig()
cfg.MergeMode = json.MergeIntersection
result, _ = json.MergeJSON(base, override, cfg)
// 결과: {"b":3,"nested":{"y":30}}

// 차집합 병합 - base 에만 있는 키만 유지
cfg = json.DefaultConfig()
cfg.MergeMode = json.MergeDifference
result, _ = json.MergeJSON(base, override, cfg)
// 결과: {"a":1,"nested":{"x":10}}
```

**배열 필드의 3 모드 비교** (배열은 인덱스 덮어쓰기가 아니라 요소 단위로 **중복 제거 병합**됩니다):

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	base := `{"tags":[1,2,3],"roles":["dev"]}`
	override := `{"tags":[3,4]}`

	// 합집합: base 요소가 앞에 오고 override 의 새 요소를 추가해 중복 제거
	union, _ := json.MergeJSON(base, override)
	fmt.Println(union)
	// 출력: {"roles":["dev"],"tags":[1,2,3,4]}

	// 교집합: 양쪽에 모두 있는 요소만 유지 (base 순서 유지)
	cfg := json.DefaultConfig()
	cfg.MergeMode = json.MergeIntersection
	inter, _ := json.MergeJSON(base, override, cfg)
	fmt.Println(inter)
	// 출력: {"tags":[3]}

	// 차집합: base 에만 있는 요소만 유지 (roles 키 전체가 base 에만 있으므로 유지됨)
	cfg.MergeMode = json.MergeDifference
	diff, _ := json.MergeJSON(base, override, cfg)
	fmt.Println(diff)
	// 출력: {"roles":["dev"],"tags":[1,2]}
}
```

::: warning 최상위 입력은 반드시 JSON 객체
`MergeJSON` 은 두 최상위 입력이 모두 JSON 객체 (`{...}`) 여야 합니다; 한쪽이라도 배열이나 스칼라면 오류를 반환합니다 (`first JSON is not an object` / `second JSON is not an object`). 위 표의 '배열 동작'은 **객체 필드 안의 배열**에 적용됩니다 — 같은 이름의 필드가 양쪽 모두 배열이면 요소 단위로 중복 제거/교집합/차집합을 취합니다 (차집합 모드에서는 결과가 빈 배열이어도 해당 키를 유지). 같은 이름 필드의 타입이 서로 다르면 (한쪽 배열, 한쪽 스칼라 등): union/intersection 은 override 값을 취하고 difference 는 해당 키를 버립니다.
:::

### MergeMany

시그니처: `func MergeMany(jsons []string, cfg ...Config) (string, error)`

여러 JSON 객체를 병합합니다. 최소 2 개의 JSON 문자열이 필요합니다. `Config.MergeMode` 로 병합 모드 설정을 지원합니다.

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `jsons` | `[]string` | 예 | 병합할 JSON 문자열 슬라이스 (최소 2 개) |
| `cfg` | `...Config` | 아니오 | 선택적 설정 (`MergeMode` 로 병합 모드 설정) |

```go
config1 := `{"api": "v1", "timeout": 30, "retries": 1}`
config2 := `{"timeout": 60, "retries": 3}`
config3 := `{"retries": 5, "debug": true}`

// 기본 합집합 병합
result, err := json.MergeMany([]string{config1, config2, config3})
// 결과: {"api":"v1","timeout":60,"retries":5,"debug":true}
```

**병합 순서와 오류**: 왼쪽에서 오른쪽으로 접습니다 — `MergeMany([a, b, c])` 는 `MergeJSON(MergeJSON(a, b), c)` 와 동등하며, 오른쪽 (인덱스가 큰 쪽) 값이 충돌에서 이깁니다. 입력이 2 개 미만이면 바로 오류를 반환합니다; 어떤 단계의 병합이 실패하면 실패 인덱스를 래핑한 오류를 반환하며 (`merge failed at index i: ...`) 부분 결과를 만들지 않습니다.

## Processor 메서드

Processor 는 대응하는 수정과 병합 메서드를 제공하며, 시그니처는 패키지 레벨 함수와 동일합니다:

```go
p, err := json.New()

result, err := p.Set(jsonStr, "user.name", "Alice")
result, err = p.Delete(jsonStr, "user.temp")
result, err = p.SetCreate(jsonStr, "user.email", "test@example.com")
```

**사전 파싱 변형 SetFromParsed**: `PreParse` 와 함께 이미 파싱된 같은 데이터에서 연속 수정을 하며 중복 파싱을 건너뜁니다:

```go
parsed, err := p.PreParse(jsonStr) // 한 번만 파싱
if err != nil {
	panic(err)
}
defer parsed.Release()

// 첫 번째 수정: 새 ParsedJSON 을 반환하며 체인 수정 계속 가능
parsed2, err := p.SetFromParsed(parsed, "user.name", "Alice")
if err != nil {
	panic(err)
}
parsed3, err := p.SetFromParsed(parsed2, "user.age", 30)
if err != nil {
	panic(err)
}

// 최종 JSON 텍스트 가져오기
final := parsed3.Data() // any (map[string]any / []any)
```

::: tip
`SetFromParsed` 은 **새로운** `*ParsedJSON` 을 반환합니다 (중간 결과가 서로 영향을 주지 않음) — '같은 대형 JSON 에서 여러 곳을 연속 수정'하는 시나리오에 적합합니다. `GetFromParsed` 와 짝을 이루며, [Processor 파싱 메서드](../processor/parse#setfromparsed) 를 참조하세요.
:::

`MergeJSON`, `MergeMany` 에도 대응하는 Processor 메서드가 있으며 시그니처는 패키지 레벨 함수와 동일해 이미 설정된 Processor 를 재사용하기 좋습니다:

```go
result, err := p.MergeJSON(base, override)

merged, err := p.MergeMany([]string{config1, config2, config3})

// CompareJSON 에도 Processor 메서드가 있음 (주의: Processor.CompareJSON 은 항상
// 보안 검증을 실행하며, 패키지 레벨 함수의 cfg 없는 경로와 다름)
equal, err := p.CompareJSON(a, b)
```

자세한 내용은 [Processor 데이터 수정](../processor/modify#processor-병합-메서드) 을 참조하세요.

## 관련 문서

- [조회 및 가져오기 함수](./query) - Get, GetString 등 조회 작업
- [배치 작업 함수](./batch) - ProcessBatch 배치 처리
- [인코딩 출력 함수](./output) - Marshal, Unmarshal 등 직렬화 작업
- [유틸리티 함수](../helpers) - CompareJSON 등 도구 함수
