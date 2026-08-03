---
sidebar_label: "삭제 작업"
title: "Processor 삭제 메서드 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON Processor 삭제 메서드: Delete 는 경로별 삭제, DeleteClean 은 삭제 후 빈 값과 빈 배열을 자동 정리하며, 체인 호출 능력을 유지합니다."
sidebar_position: 4
---

# 삭제 메서드

Processor 는 데이터 삭제 메서드를 제공하여 지정된 경로의 값을 삭제하고 수정된 JSON 문자열을 반환합니다. 모든 메서드는 **불변**입니다 — 새 문자열을 반환하며 원본 입력은 그대로 유지되고; 오류 발생 시 원본 입력을 반환합니다. [패키지 레벨 삭제 함수](../functions/delete)와 동작이 일치하며, 차이점은 인스턴스 메서드가 프로세서 자체의 설정, 캐시, 훅과 협력한다는 것입니다.

## Delete

시그니처: `func (p *Processor) Delete(jsonStr, path string, cfg ...Config) (result string, err error)`

지정된 경로의 값을 삭제하고 수정된 JSON 문자열을 반환합니다.

<!-- check-code: skip -->
```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

result, err := p.Delete(data, "user.temporary")
```

### 전체 예제: 객체 속성, 배열 요소, 중첩 경로

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

	// 객체 속성 삭제
	r1, err := p.Delete(`{"user":{"name":"Alice","temp":"x"}}`, "user.temp")
	if err != nil {
		panic(err)
	}
	fmt.Println(r1)
	// 출력：{"user":{"name":"Alice"}}

	// 배열 요소 삭제 (제거 후 재정렬, 빈 공간 없음)
	r2, err := p.Delete(`{"items":["a","b","c"]}`, "items[1]")
	if err != nil {
		panic(err)
	}
	fmt.Println(r2)
	// 출력：{"items":["a","c"]}

	// 중첩 경로 삭제
	r3, err := p.Delete(`{"a":{"b":{"c":1,"d":2}}}`, "a.b.c")
	if err != nil {
		panic(err)
	}
	fmt.Println(r3)
	// 출력：{"a":{"b":{"d":2}}}
}
```

### 고급 경로: 와일드카드와 슬라이스

`Delete` 는 Get/Set 과 동일한 경로 엔진을 재사용하여 와일드카드, 슬라이스 범위, 다중 필드 추출을 지원합니다. 배치 경로 (`*`, `{}`, `:` 포함) 는 누락된 대상을 조용히 건너뛰며 오류를 보고하지 않습니다.

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

	data := `{"users":[{"name":"Alice","pwd":"x"},{"name":"Bob","pwd":"y"}],"tags":[1,2,3,4]}`

	// 와일드카드: 각 사용자의 pwd 삭제
	r1, err := p.Delete(data, "users[*].pwd")
	if err != nil {
		panic(err)
	}
	fmt.Println(r1)
	// 출력：{"tags":[1,2,3,4],"users":[{"name":"Alice"},{"name":"Bob"}]}

	// 슬라이스 범위: tags[0:2] 삭제 (왼쪽 닫힘, 오른쪽 열림)
	r2, err := p.Delete(data, "tags[0:2]")
	if err != nil {
		panic(err)
	}
	fmt.Println(r2)
	// 출력：{"tags":[3,4],"users":[{"name":"Alice","pwd":"x"},{"name":"Bob","pwd":"y"}]}
}
```

### 오류 처리

정확한 경로의 대상이 존재하지 않으면 `ErrPathNotFound` 을 래핑한 오류를 반환하며 원본 입력은 변경되지 않습니다. `errors.Is` 로 판정합니다:

```go
package main

import (
	"errors"
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, _ := json.New()
	defer p.Close()

	result, err := p.Delete(`{"a":1}`, "nonexistent.path")
	if err != nil {
		if errors.Is(err, json.ErrPathNotFound) {
			fmt.Println("경로가 존재하지 않아 건너뛰었습니다")
		}
	}
	fmt.Println(result) // 원본 데이터 불변：{"a":1}
	// 출력：
	// 경로가 존재하지 않아 건너뛰었습니다
	// {"a":1}
}
```

## DeleteClean

시그니처: `func (p *Processor) DeleteClean(jsonStr, path string, cfg ...Config) (string, error)`

지정된 경로를 삭제하고 삭제로 인해 발생한 `null` 값과 빈 객체/빈 배열을 **재귀적으로 정리**합니다. `Delete` 에 `CleanupNulls: true` + `CompactArrays: true` 를 강제 적용한 것과 동일합니다.

### 연쇄 정리: 부모 객체가 비면 자동 제거

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, _ := json.New()
	defer p.Close()

	// temp 가 user 의 유일한 속성
	data := `{"user":{"temp":"value"}}`

	// 일반 삭제：user 가 {} 가 되지만 유지됨
	r1, _ := p.Delete(data, "user.temp")
	fmt.Println(r1) // 출력：{"user":{}}

	// DeleteClean：user 가 비면 user 키까지 함께 정리, 위로 올라가며 처리
	r2, err := p.DeleteClean(data, "user.temp")
	if err != nil {
		panic(err)
	}
	fmt.Println(r2) // 출력：{}
}
```

### API 응답 정리

대상 필드를 삭제함과 동시에 트리 전체의 다른 `null` 과 남아있는 빈 컨테이너를 함께 쓸어냅니다:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, _ := json.New()
	defer p.Close()

	apiResp := `{"data":{"id":1,"name":"Product","desc":null,"price":29.99}}`

	cleaned, err := p.DeleteClean(apiResp, "data.desc")
	if err != nil {
		panic(err)
	}
	fmt.Println(cleaned)
	// 출력：{"data":{"id":1,"name":"Product","price":29.99}}
}
```

::: warning DeleteClean 은 트리 전체의 null 을 쓸어냅니다
`DeleteClean` 의 정리는 **전역적**입니다: 전체 JSON 트리에 대해 재귀적으로 정리를 실행하므로, 삭제 지점에서 발생한 것뿐만 아니라 문서에 **미리 존재하던 모든** `null` 과 빈 컨테이너를 제거합니다. 지정된 필드만 제거하고 나머지 `null` 을 유지하려면 일반 `Delete` 를 사용하세요.
:::

## Delete 와 DeleteClean 비교

| 특성 | Delete | DeleteClean |
|------|--------|-------------|
| 대상 노드 삭제 | 예 | 예 |
| 배열 요소 제거 후 재정렬 (빈 공간 없음) | 예 | 예 |
| 정확한 경로 누락 시 오류 | 예 (`ErrPathNotFound`) | 예 (`ErrPathNotFound`) |
| 삭제로 발생한 `null` 정리 | 아니오 | 예 |
| 빈 객체/빈 배열 정리 (연쇄) | 아니오 | 예 (위로 올라가며) |
| 트리 전체의 미리 존재하던 `null` 쓸어냄 | 아니오 | 예 (전역 정리) |
| 동등한 설정 | 기본값 | `CleanupNulls+CompactArrays` |
| 상대적 오버헤드 | 낮음 | 약간 높음 (추가 전체 트리 정리 순회) |

## Config 가 삭제 동작에 미치는 영향

삭제 메서드의 정리 동작은 "**호출 매개변수 `cfg` 와 프로세서 자체 설정의 합집합**"으로 결정됩니다. 즉, 프로세서 생성 시 `CleanupNulls` 를 켜두면 이후 일반 `p.Delete(...)` 도 자동으로 정리합니다:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	// 정리가 기본 켜진 프로세서 생성
	cfg := json.DefaultConfig()
	cfg.CleanupNulls = true
	cfg.CompactArrays = true
	p, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data := `{"user":{"temp":"value"}}`

	// 프로세서 자체 설정이 켜져 있어 일반 Delete 도 정리 수행
	result, err := p.Delete(data, "user.temp")
	if err != nil {
		panic(err)
	}
	fmt.Println(result) // 출력：{}
}
```

삭제 동작에 영향을 주는 `Config` 필드:

| 필드 | 기본값 | 삭제에 미치는 영향 |
|------|------|--------------|
| `CleanupNulls` | `false` | 결과의 `null` 과 빈 객체/빈 배열을 재귀적으로 제거 (연쇄) |
| `CompactArrays` | `false` | 배열의 `null`/빈 요소 제거; 활성화 시 `CleanupNulls` 를 암시 |
| `CreatePaths` | `true` | **삭제에 영향 없음** (삭제는 경로를 생성하지 않음) |

> 따라서 `DeleteClean(s, p)` 와 `CleanupNulls+CompactArrays` 프로세서에서 `Delete(s, p)` 를 호출하는 것은 동일한 효과입니다 — 의미가 더 명확한 쪽을 선택하면 됩니다.

## 체인 삭제

삭제 메서드는 새 문자열을 반환하므로 다음 호출에 직접 전달하여 체인 수정 흐름을 구성할 수 있습니다:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, _ := json.New()
	defer p.Close()

	data := `{"user":{"name":"Alice","temp":"x","version":"1.0.0"}}`

	// 체인: 먼저 설정, 그 다음 삭제, 각 단계는 이전 결과를 기반
	r1, _ := p.Set(data, "user.name", "CyberGo")
	r2, _ := p.Delete(r1, "user.temp")
	final, _ := p.Delete(r2, "user.version")

	fmt.Println(final)
	// 출력：{"user":{"name":"CyberGo"}}
}
```

## 일반적인 함정

::: warning 배열 삭제는 빈 공간을 남기지 않음
`Delete` 가 배열 요소를 삭제할 때 요소는 **전체적으로 제거**되고 이후 요소가 자동으로 앞으로 이동하며, `null` 자리 표시자나 빈 공간을 남기지 않습니다. "삭제 후 인덱스 유지, 빈 자리 남김" 의미가 필요하다면 `Set` 으로 해당 위치를 `null` 로 설정하세요.
:::

::: warning DeleteClean 이 "마침 비어 있는" 유효한 데이터를 잘못 삭제할 수 있음
`DeleteClean` 의 연쇄 정리는 모든 빈 객체 `{}`, 빈 배열 `[]` 을 정리 대상으로 취급합니다. 비즈니스에서 "빈 배열"이 의미 있는 상태라면 (예: `"tags":[]` 가 "태그 없음"을 나타냄), `DeleteClean` 은 해당 키까지 함께 제거합니다. 이러한 필드를 유지해야 한다면 일반 `Delete` 를 사용하세요.
:::

::: warning 배치 삭제는 내결함성을 가짐
와일드카드/슬라이스/다중 필드 경로는 누락된 대상을 **조용히 건너뛰며** 오류를 반환하지 않습니다. "대상이 반드시 존재해야 함"이라는 강한 검증 의미가 필요하다면 정확한 경로를 사용하세요 (예: `items[*]` 대신 `items[1]`).
:::

## 관련 문서

- [수정 작업](./modify) - Set/SetCreate 체인 수정
- [삭제 함수](../functions/delete) - 패키지 레벨 Delete/DeleteClean 함수 (전체 경로 문법 레퍼런스 포함)
- [설정 레퍼런스](../config) - CleanupNulls / CompactArrays 등 필드 상세
