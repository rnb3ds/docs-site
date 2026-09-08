---
sidebar_label: "수정"
title: "Processor 데이터 수정 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON Processor 수정 메서드: Set 설정, SetMultiple 배치, SetCreate 자동 경로 생성, SetMultipleCreate 배치 생성, 불변 방식의 새 문자열 반환과 SetFromParsed 사전 파싱 연속 수정, 모든 메서드 체인 호출 지원."
sidebar_position: 3
---

# 데이터 수정 메서드

Processor 는 데이터 수정 메서드를 제공하며, 모든 메서드는 **수정된 새 JSON 문자열을 반환**합니다 (불변 의미, 원본 문자열은 그대로). 체인 호출을 지원합니다. 삭제 관련 메서드는 [삭제 작업](./delete) 을 참조하세요. 메서드 동작은 [패키지 레벨 수정 함수](../functions/modify) 와 일치하며, 이 페이지는 Processor 쪽 설정 의미 (`CreatePaths` 우선순위, `ContinueOnError`) 와 체인 패턴에 집중합니다.

## 불변 의미

모든 수정 메서드는 **새 JSON 문자열**을 반환하며 원본 입력 문자열은 절대 수정되지 않습니다 (Go 문자열은 애초에 불변). 작업 실패 시 원본 문자열과 오류를 반환해 안전하게 폴백하기 쉽습니다:

```go
original := `{"user":{"name":"Alice"}}`

// Set 은 새 문자열 반환, original 불변
modified, err := p.Set(original, "user.name", "Bob")
// original 은 여전히 {"user":{"name":"Alice"}}
// modified 는 {"user":{"name":"Bob"}}

// 실패 시 원본 문자열 + 오류 반환
result, err := p.Set(original, "nonexistent.deep.path", "x")
// result == original (CreatePaths=false 이고 경로가 없을 때)
```

**전체 예제**

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

	original := `{"user":{"name":"Alice"}}`
	modified, err := p.Set(original, "user.name", "Bob")
	if err != nil {
		panic(err)
	}
	fmt.Println(original) // 출력: {"user":{"name":"Alice"}}
	fmt.Println(modified) // 출력: {"user":{"name":"Bob"}}
}
```

## Set

시그니처: `func (p *Processor) Set(jsonStr, path string, value any, cfg ...Config) (result string, err error)`

지정된 경로에 값을 설정하고 수정된 JSON 문자열을 반환합니다. 존재하지 않는 중간 경로의 자동 생성 여부는 `Config.CreatePaths` 에 달렸습니다 ([CreatePaths 와 SetCreate](#createpaths-와-setcreate) 참조).

```go
result, err := p.Set(data, "user.name", "NewName")
```

다양한 타입의 값 설정을 지원합니다:

```go
// 문자열
result, _ := p.Set(data, "user.name", "CyberGo")

// 숫자
result, _ = p.Set(data, "user.age", 25)

// 불리언
result, _ = p.Set(data, "user.active", true)

// 객체
result, _ = p.Set(data, "user.profile", map[string]any{
	"bio":      "Developer",
	"location": "China",
})

// 배열
result, _ = p.Set(data, "items", []any{"a", "b", "c"})
```

**전체 예제: 중첩 경로 수정**

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

	data := `{"user":{"name":"Alice","address":{"city":"Beijing"}}}`
	result, err := p.Set(data, "user.address.city", "Shanghai")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 출력: {"user":{"address":{"city":"Shanghai"},"name":"Alice"}}
}
```

## SetMultiple

시그니처: `func (p *Processor) SetMultiple(jsonStr string, updates map[string]any, cfg ...Config) (string, error)`

여러 경로의 값을 배치로 설정하고 수정된 JSON 문자열을 반환합니다. `Set` 을 여러 번 호출하는 것과 달리 `SetMultiple` 은 JSON 을 한 번만 파싱하고 한 번의 순회로 모든 갱신을 적용해 더 효율적입니다. 경로 생성 여부는 `Config.CreatePaths` 에 달렸습니다.

```go
result, err := p.SetMultiple(data, map[string]any{
	"user.name":   "CyberGo",
	"user.age":    25,
	"user.active": true,
})
```

**전체 예제: 기존 필드 배치 갱신**

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

	data := `{"user":{"name":"Alice","age":25,"email":"a@x.com"}}`
	result, err := p.SetMultiple(data, map[string]any{
		"user.name":  "Bob",
		"user.age":   26,
		"user.email": "b@x.com",
	})
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 출력: {"user":{"age":26,"email":"b@x.com","name":"Bob"}}
}
```

::: tip ContinueOnError 와 결정적 순서
- 기본값 (`ContinueOnError=false`) 은 첫 실패 경로에서 바로 원본 문자열과 오류를 반환합니다; 켜면 실패 경로를 건너뛰고 나머지 경로를 계속 기록하며, 모두 실패할 때만 오류를 반환합니다. 이 필드는 `SetMultiple` 에만 작용하며 [`ProcessBatch`](./batch) 의 내장 작업별 격리와는 무관합니다.
- 갱신은 **경로 사전순**으로 적용되어 겹치는 경로 (예: `a` 와 `a.b`) 의 결과가 결정적입니다: `a` 가 먼저 확정되고 `a.b` 는 항상 새로 생성된 컨테이너에 기록되며, map 반복의 무작위 순서 영향을 받지 않습니다.
:::

## SetCreate

시그니처: `func (p *Processor) SetCreate(jsonStr, path string, value any, cfg ...Config) (string, error)`

값을 설정하고 **존재하지 않는 중간 경로를 자동 생성**합니다. `Set` + `CreatePaths=true` 의 편의 래퍼로, 프로세서 자체 설정과 무관하게 항상 경로를 생성합니다. 자세한 내용은 [CreatePaths 와 SetCreate](#createpaths-와-setcreate) 를 참조하세요.

**중간 객체 생성**

```go
// user.profile 이 없으면 객체로 자동 생성
result, err := p.SetCreate(data, "user.profile.bio", "Developer")
// {"user":{"profile":{"bio":"Developer"}}}
```

**전체 예제: 중간 객체와 배열 자동 생성**

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

	data := `{"user":{"name":"Alice"}}`

	// 중첩 객체 생성: user.profile.bio
	result, err := p.SetCreate(data, "user.profile.bio", "Developer")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 출력: {"user":{"name":"Alice","profile":{"bio":"Developer"}}}

	// 배열 생성: user.tags[0] 이 없으면 배열을 만들고 인덱스 0 에 채움
	result, err = p.SetCreate(data, "user.tags[0]", "admin")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 출력: {"user":{"name":"Alice","tags":["admin"]}}
}
```

## SetMultipleCreate

시그니처: `func (p *Processor) SetMultipleCreate(jsonStr string, updates map[string]any, cfg ...Config) (string, error)`

여러 값을 배치로 설정하고 중간 경로를 자동 생성합니다. `SetMultiple` + `CreatePaths=true` 의 편의 래퍼입니다.

```go
result, err := p.SetMultipleCreate(data, map[string]any{
	"user.profile.bio":      "Developer",
	"user.profile.location": "China",
})
```

**전체 예제: 빈 객체에서 중첩 구조 배치 생성**

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

	data := `{}`
	result, err := p.SetMultipleCreate(data, map[string]any{
		"user.name":        "Alice",
		"user.profile.bio": "Developer",
	})
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 출력: {"user":{"name":"Alice","profile":{"bio":"Developer"}}}
}
```

## 배열 요소 추가

경로에 `[+]` 문법을 쓰면 배열 끝에 요소를 추가할 수 있으며 배열 길이를 미리 알 필요가 없습니다. `[+]` 는 반드시 이미 존재하는 배열 경로 뒤에 붙여야 합니다 (예: `items[+]`).

```go
data := `{"items":["a","b"]}`

// 단일 요소 추가
result, err := p.Set(data, "items[+]", "c")
// {"items":["a","b","c"]}

// 여러 요소 추가 (슬라이스를 전달하면 펼쳐짐)
result, err = p.Set(data, "items[+]", []any{"c", "d"})
// {"items":["a","b","c","d"]}
```

**전체 예제**

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

	data := `{"items":["a","b"]}`
	result, err := p.Set(data, "items[+]", "c")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 출력: {"items":["a","b","c"]}
}
```

## CreatePaths 와 SetCreate

경로 자동 생성 동작에는 두 가지 제어 입구가 있으며, 차이를 이해하면 '프로세서 설정 기준'과 '호출 단위 강제' 사이에서 선택하기 쉽습니다:

| 방식 | 동작 | 적합한 시나리오 |
|------|------|----------|
| `Config.CreatePaths` (기본 `true`) | 프로세서 수준 스위치, `Set` / `SetMultiple` 에 영향 | **전용** 프로세서를 만들어 경로 생성을 통일적으로 켜거나 끌 때 |
| `SetCreate` / `SetMultipleCreate` | `CreatePaths=true` 를 강제, 프로세서 설정 **덮어씀** | 가끔 경로 생성이 필요하고 프로세서 설정을 바꾸고 싶지 않을 때 |

**설정 우선순위** (높은 순):

1. **`SetCreate` / `SetMultipleCreate`** — 항상 `CreatePaths=true` 를 강제합니다.
2. **per-call `cfg`** — 명시적으로 전달한 `cfg` 는 프로세서 설정을 완전히 덮어씁니다 (끄는 것도 포함).
3. **프로세서 `Config.CreatePaths`** — `cfg` 를 생략할 때 적용됩니다.

```go
// 경로 생성을 끈 프로세서 생성
cfg := json.DefaultConfig()
cfg.CreatePaths = false
p, _ := json.New(cfg)

// Set 은 프로세서 설정을 따름: 경로가 없으면 오류
_, err := p.Set(`{"user":{}}`, "user.profile.bio", "x") // err 이 nil 이 아님

// SetCreate 는 강제 생성: 프로세서 설정과 무관
result, _ := p.SetCreate(`{"user":{}}`, "user.profile.bio", "x")
// {"user":{"profile":{"bio":"x"}}}

// per-call cfg 가 프로세서 설정을 덮어씀 (여기서는 다시 켬)
result, _ = p.Set(`{"user":{}}`, "user.profile.bio", "x", json.DefaultConfig())
// {"user":{"profile":{"bio":"x"}}}
```

## 체인 수정

수정 메서드는 새 문자열을 반환하므로 이전 단계의 결과를 다음 입력으로 삼아 체인 작업을 만들 수 있습니다:

```go
processor, _ := json.New()

result1, _ := processor.Set(data, "user.name", "CyberGo")
result2, _ := processor.Set(result1, "user.version", "1.0.0")
finalResult, _ := processor.Delete(result2, "user.temporary")
```

## Processor 병합 메서드

Processor 는 패키지 레벨 [MergeJSON](../functions/modify#mergejson), [MergeMany](../functions/modify#mergemany), [CompareJSON](../helpers#comparejson) 에 대응하는 인스턴스 메서드를 제공합니다.

### Processor.MergeJSON

시그니처: `func (p *Processor) MergeJSON(json1, json2 string, cfg ...Config) (string, error)`

cfg 에서 옵션을 해석하고 (**cfg 를 생략하면 프로세서 자체 설정이 아니라 DefaultConfig 를 사용** — 커스텀 MergeMode 로 프로세서를 만들었다면 해당 모드를 적용하려면 cfg 를 명시적으로 전달해야 함), `Config.MergeMode` 로 두 객체를 깊이 병합한 뒤 이 프로세서로 결과를 다시 인코딩합니다.

패키지 레벨 함수와 마찬가지로 `Processor.MergeJSON` 은 보안 검증을 실행하지 않습니다 — 디코딩, 깊은 병합, 재인코딩만 하는 구조적 도구입니다. 보안 검증이 필요하면 `CompareJSON` 을 사용하세요 (항상 보안 검증 실행; cfg 를 전달하면 cfg 기준, 아니면 프로세서 자체 설정 기준).

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

// 합집합 병합 (기본값)
result, err := p.MergeJSON(base, override)

// 교집합 병합
cfg := json.DefaultConfig()
cfg.MergeMode = json.MergeIntersection
result, err = p.MergeJSON(base, override, cfg)
```

### Processor.MergeMany

시그니처: `func (p *Processor) MergeMany(jsons []string, cfg ...Config) (string, error)`

슬라이스를 `MergeJSON` 으로 왼쪽에서 오른쪽으로 접으며, 병합 전략은 `Config.MergeMode` 가 결정합니다 (기본 `MergeUnion`). JSON 문자열이 2 개 미만이면 오류를 반환하고; 어떤 병합 단계가 실패하면 실패 인덱스를 담은 오류를 반환합니다.

```go
result, err := p.MergeMany([]string{config1, config2, config3})
```

### Processor.CompareJSON

시그니처: `func (p *Processor) CompareJSON(json1, json2 string, cfg ...Config) (bool, error)`

두 JSON 문자열이 같은지 비교합니다 (숫자 정규화, 키 순서 무관).

::: warning 패키지 레벨 CompareJSON 과의 차이
패키지 레벨 `CompareJSON` 은 cfg 가 없을 때 보안 검증을 하지 않고 양쪽을 `encoding/json` 으로 인코딩합니다; Processor 메서드는 **항상** 보안 검증을 실행하고 (cfg 를 전달하면 cfg 기준, 아니면 프로세서 자체 설정 기준) 라이브러리 인코더로 양쪽을 대칭 인코딩하여 설정된 인코딩 (예: `EscapeHTML`) 이 대칭 적용됩니다.
:::

```go
equal, err := p.CompareJSON(a, b)
equal, err = p.CompareJSON(a, b, json.SecurityConfig())
```

## 관련 문서

- [경로 쿼리](./query) - Get 계열 메서드
- [삭제 작업](./delete) - Delete/DeleteClean 메서드
- [배치 작업](./batch) - ProcessBatch 배치 처리
- [수정 함수](../functions/modify) - 패키지 레벨 Set/SetMultiple/MergeJSON 함수
