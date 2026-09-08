---
title: "삭제 함수 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON 삭제 함수: Delete 경로 삭제, DeleteClean 빈 값·빈 배열과 빈 상위 노드 연쇄 정리, 와일드카드·슬라이스·다중 필드·JSON Pointer 경로 지원, 미스 경로는 조용히 건너뛰고 불변 방식으로 새 문자열을 반환해 체인 호출을 유지합니다."
sidebar_label: "삭제 작업"
sidebar_position: 4
---

# 삭제 함수

json 패키지가 제공하는 JSON 삭제 함수로, 지정된 경로의 노드를 제거하고 선택적으로 삭제로 생긴 빈 부모 노드를 정리합니다. 모든 삭제 함수는 **불변**입니다 — 수정된 새 JSON 문자열을 반환하고 원본 문자열은 그대로 유지되며, 오류 발생 시에는 원본 입력을 반환합니다.

## Delete

시그니처: `func Delete(jsonStr, path string, cfg ...Config) (string, error)`

지정된 경로의 값을 삭제하고 수정된 JSON 문자열을 반환합니다.

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `jsonStr` | `string` | 예 | JSON 문자열 |
| `path` | `string` | 예 | 경로 표현식 (점, 인덱스, 와일드카드, 슬라이스, 다중 필드) |
| `cfg` | `Config` | 아니오 | 선택적 설정 (정리와 검증 동작에 영향) |

**반환값**

| 반환값 | 설명 |
|--------|------|
| `result string` | 수정된 JSON 문자열 (성공); 오류 시 원본 `jsonStr` |
| `err error` | 성공이면 `nil`; 실패 시 내부 센티널 오류를 래핑한 `*JsonsError` |

### 객체 속성 삭제

단일 중첩 속성을 삭제하고 해당 키가 없는 새 객체를 반환합니다.

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"user":{"name":"Alice","temp":"value","age":30}}`

	result, err := json.Delete(data, "user.temp")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 출력: {"user":{"age":30,"name":"Alice"}}
}
```

### 배열 요소 삭제

배열의 요소를 삭제합니다 (인덱스는 0 부터). 요소는 비워지는 것이 아니라 **제거**되며, 이후 요소가 자동으로 앞으로 이동하고 인덱스가 재정렬되어 빈 공간을 남기지 않습니다.

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"items":["a","b","c","d"]}`

	// 인덱스 1 의 요소 "b" 삭제, "c"/"d" 자동으로 앞으로 이동
	result, err := json.Delete(data, "items[1]")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 출력: {"items":["a","c","d"]}
}
```

음수 인덱스도 지원합니다 (끝에서부터 세며 `-1` 이 마지막):

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"items":["a","b","c","d"]}`

	// -1 은 마지막 요소 "d" 를 가리킴
	result, err := json.Delete(data, "items[-1]")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 출력: {"items":["a","b","c"]}
}
```

### 중첩 경로 삭제

점 경로로 중첩 구조에 들어가 임의 깊이의 노드를 삭제합니다.

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"config":{"database":{"host":"localhost","port":5432,"password":"secret"}}}`

	result, err := json.Delete(data, "config.database.password")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 출력: {"config":{"database":{"host":"localhost","port":5432}}}
}
```

### 불변 의미

`Delete` 는 새 문자열을 반환하며 **원본 `jsonStr` 은 수정되지 않습니다**. 같은 입력을 여러 곳에서 안전하게 재사용할 수 있습니다:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"a":1,"b":2,"c":3}`

	r1, _ := json.Delete(data, "a")
	r2, _ := json.Delete(data, "b")

	fmt.Println(data) // 원본 데이터 불변: {"a":1,"b":2,"c":3}
	fmt.Println(r1)   // 출력: {"b":2,"c":3}
	fmt.Println(r2)   // 출력: {"a":1,"c":3}
}
```

## 고급 경로 삭제

`Delete` 는 Get/Set 과 동일한 재귀 경로 엔진을 재사용하여 와일드카드, 슬라이스 범위, 다중 필드 추출 등 배치 의미를 지원합니다. **배치 경로 (`*`, `{}`, `:` 포함) 는 누락된 대상에 관대합니다 — 적중하면 삭제하고, 없으면 조용히 건너뛰며 오류를 반환하지 않습니다**.

### 와일드카드 삭제

`items[*]` 는 배열의 모든 요소를 삭제하고; `[*].field` 는 각 요소의 지정 속성을 삭제합니다.

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"users":[{"name":"Alice","temp":"x"},{"name":"Bob","temp":"y"}]}`

	// 각 사용자 객체의 temp 속성 삭제
	result, err := json.Delete(data, "users[*].temp")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 출력: {"users":[{"name":"Alice"},{"name":"Bob"}]}
}
```

일부 요소에 대상 속성이 없어도 오류가 발생하지 않습니다 (멱등 의미로, 없는 키에 대한 Go 네이티브 `delete()` 동작과 일치):

<!-- check-code: skip -->
```go
// data = `[{"a":1},{"b":2}]` — 두 번째 요소에는 a 가 없지만 정상 반환
result, err := json.Delete(data, "[*].a")
// err == nil, result: [{"b":2}]
```

### 슬라이스 범위 삭제

`items[0:2]` 는 연속 구간의 요소를 삭제합니다 (왼쪽 닫힘, 오른쪽 열림).

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"items":["a","b","c","d","e"]}`

	// 인덱스 0, 1 (2 제외) 의 "a", "b" 삭제
	result, err := json.Delete(data, "items[0:2]")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 출력: {"items":["c","d","e"]}
}
```

### 다중 필드 추출 삭제

`[*].{a,b}` 는 각 요소의 여러 지정 속성을 한 번에 삭제합니다.

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `[{"name":"Alice","pwd":"x","token":"y"},{"name":"Bob","pwd":"z"}]`

	// pwd 와 token 두 필드를 동시에 삭제
	result, err := json.Delete(data, "[*].{pwd,token}")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 출력: [{"name":"Alice"},{"name":"Bob"}]
}
```

### JSON Pointer 경로 삭제

경로가 `/` 로 시작하면 `Delete` 는 **RFC 6901 JSON Pointer** 의미로 해석합니다 (점 문법을 사용하지 않음): 세그먼트는 `/` 로 구분되며 `~0`/`~1` 은 각각 `~` 과 `/` 를 이스케이프합니다. 이는 **키 이름 자체에 점 등의 특수 문자가 포함된** 키를 삭제하는 출구를 제공합니다 (점 문법으로는 이런 키 이름을 표현할 수 없음):

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	// 키 이름 "a.b" 자체에 점이 있어 점 경로 "a.b" 는 두 단계로 해석되어 적중하지 못함
	data := `{"a.b": 1, "user": {"name": "Alice"}}`

	r1, err := json.Delete(data, "/a.b")
	if err != nil {
		panic(err)
	}
	fmt.Println(r1) // 출력: {"user":{"name":"Alice"}}

	// /user/name 은 점 경로 user.name 과 동등
	r2, err := json.Delete(data, "/user/name")
	if err != nil {
		panic(err)
	}
	fmt.Println(r2) // 출력: {"a.b":1}
}
```

::: warning 루트 노드는 삭제할 수 없음
JSON Pointer `/` 는 문서 루트를 가리키며 루트 삭제는 의미가 없습니다 — 오류를 반환합니다 (`cannot delete root`). 포인터 경로의 누락 세그먼트도 점 정확 경로와 마찬가지로 `ErrPathNotFound` 를 반환합니다.
:::

::: tip 정확 경로 vs 배치 경로
- **정확 경로** (속성명/인덱스만 포함, 예: `user.temp`, `items[1]`): 대상이 없으면 `ErrPathNotFound` 오류를 반환합니다.
- **배치 경로** (`*`, `{}`, `:` 포함, 예: `items[*]`, `[*].{a,b}`, `items[0:2]`): 대상이 없으면 조용히 건너뛰며 오류를 내지 않습니다. 엄격한 검증이 필요하면 정확 경로를, '최선을 다해 삭제'가 필요하면 배치 경로를 사용하세요.
:::

## 오류 처리

정확 경로의 대상이 없으면 `Delete` 는 `ErrPathNotFound` 을 래핑한 `*JsonsError` 를 반환하며 반환된 원본 입력은 변경되지 않습니다. `errors.Is` 로 구체적인 오류 타입을 판별합니다:

```go
package main

import (
	"errors"
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"a":1}`

	result, err := json.Delete(data, "nonexistent.path")
	if err != nil {
		if errors.Is(err, json.ErrPathNotFound) {
			fmt.Println("경로가 존재하지 않아 건너뜀")
		} else {
			fmt.Println("기타 오류:", err)
		}
	}
	// result 는 여전히 원본 JSON: {"a":1}
	fmt.Println(result)
	// 출력:
	// 경로가 존재하지 않아 건너뜀
	// {"a":1}
}
```

삭제에서 자주 보는 오류 센티널 값:

| 오류 | 트리거 시나리오 |
|------|----------|
| `ErrPathNotFound` | 정확 경로의 어떤 중간 세그먼트 또는 대상 키/인덱스가 존재하지 않음 |
| `ErrInvalidJSON` | `jsonStr` 이 유효한 JSON 이 아님 |
| `ErrInvalidPath` | 경로 표현식 문법이 잘못됨 (예: 닫히지 않은 대괄호) |

## DeleteClean

시그니처: `func DeleteClean(jsonStr, path string, cfg ...Config) (string, error)`

지정된 경로를 삭제하고 삭제로 생긴 `null` 값과 빈 객체/빈 배열을 **재귀적으로 정리**합니다. `Delete(jsonStr, path, cfg)` 에 `CleanupNulls: true` + `CompactArrays: true` 를 강제 적용한 것과 동등합니다.

### 연쇄 정리 예제

삭제 후 부모 객체가 비면 `DeleteClean` 은 빈 부모 객체까지 함께 제거하며 위로 올라가 연쇄 처리합니다:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	// temp 가 user 의 유일한 속성
	data := `{"user":{"temp":"value"}}`

	// 일반 삭제: user 가 빈 객체 {} 가 되지만 유지됨
	r1, _ := json.Delete(data, "user.temp")
	fmt.Println(r1) // 출력: {"user":{}}

	// DeleteClean: user 가 비면 user 키까지 함께 정리
	r2, err := json.DeleteClean(data, "user.temp")
	if err != nil {
		panic(err)
	}
	fmt.Println(r2) // 출력: {}
}
```

### API 응답의 임시 필드 정리

`DeleteClean` 은 API 응답 정리에 적합합니다: 대상 필드를 삭제함과 동시에 다른 `null` 값과 남아있는 빈 컨테이너를 함께 쓸어내 '빈 껍질' 객체가 프런트엔드에 노출되는 것을 막습니다.

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	apiResp := `{"data":{"id":1,"name":"Product","desc":null,"price":29.99,"note":null}}`

	// 한 번의 DeleteClean 으로 desc 삭제 + 트리 전체의 다른 null (note) 까지 쓸어냄
	cleaned, err := json.DeleteClean(apiResp, "data.desc")
	if err != nil {
		panic(err)
	}
	fmt.Println(cleaned)
	// 출력: {"data":{"id":1,"name":"Product","price":29.99}}
}
```

::: warning DeleteClean 은 트리 전체의 null 을 쓸어냅니다
`DeleteClean` 의 정리는 **전역적**입니다: 전체 JSON 트리에 대해 null 값과 빈 컨테이너를 재귀적으로 정리하므로, 삭제 지점에서 생긴 것뿐만 아니라 문서에 **미리 존재하던 모든** `null` 값과 빈 컨테이너를 제거합니다. 지정된 필드만 제거하고 나머지 `null` 을 유지하려면 일반 `Delete` 를 사용하세요.
:::

## DeleteClean 과 Config 의 관계

`DeleteClean` 은 본질적으로 `Delete` + 두 설정 항목의 syntax sugar 입니다. 일반 `Delete` 에 같은 설정을 명시적으로 전달해도 완전히 동일한 효과입니다:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"user":{"temp":"value"}}`

	// 방법 1: DeleteClean
	r1, _ := json.DeleteClean(data, "user.temp")

	// 방법 2: Delete + 명시적 설정 (완전히 동등)
	cfg := json.DefaultConfig()
	cfg.CleanupNulls = true
	cfg.CompactArrays = true
	r2, _ := json.Delete(data, "user.temp", cfg)

	fmt.Println(r1) // 출력: {}
	fmt.Println(r2) // 출력: {}
}
```

삭제 동작에 영향을 주는 `Config` 필드:

| 필드 | 기본값 | 삭제에 미치는 영향 |
|------|------|--------------|
| `CleanupNulls` | `false` | 결과의 `null` 값과 빈 객체/빈 배열을 재귀적으로 제거 (연쇄 정리) |
| `CompactArrays` | `false` | 배열의 `null`/빈 요소 제거; 활성화 시 `CleanupNulls` 를 암시 |
| `CreatePaths` | `true` | **삭제에 영향 없음** (삭제는 경로를 만들지 않으며 여기는 대비용 설명) |

## Delete 와 DeleteClean 비교

| 특성 | Delete | DeleteClean |
|------|--------|-------------|
| 대상 노드 삭제 | 예 | 예 |
| 배열 요소 제거 후 재정렬 (빈 공간 없음) | 예 | 예 |
| 정확 경로 누락 시 오류 | 예 (`ErrPathNotFound`) | 예 (`ErrPathNotFound`) |
| 삭제로 생긴 `null` 정리 | 아니오 | 예 |
| 빈 객체/빈 배열 정리 (연쇄) | 아니오 | 예 (위로 올라가며) |
| 트리 전체의 미리 있던 `null` 쓸어냄 | 아니오 | 예 (전역 정리) |
| 동등한 설정 | 기본값 | `CleanupNulls+CompactArrays` |
| 상대적 오버헤드 | 낮음 | 약간 높음 (추가 전체 트리 정리 순회) |

## 흔한 함정

::: warning 배열 삭제는 빈 공간을 남기지 않음
`Delete` 가 배열 요소를 삭제하면 요소는 **전체적으로 제거**되고 이후 요소가 자동으로 앞으로 이동하며, `null` 자리 표시자나 빈 공간을 남기지 않습니다. 삭제 후 인덱스 유지 (빈 자리 남김) 를 기대한다면 CyberGo 의 삭제 의미는 이를 만족하지 않습니다 — `Set` 으로 해당 위치를 `null` 로 설정하세요.
:::

::: warning DeleteClean 이 '마침 비어 있는' 유효한 데이터를 잘못 삭제할 수 있음
`DeleteClean` 의 연쇄 정리는 모든 빈 객체 `{}`, 빈 배열 `[]` 을 정리 대상으로 취급합니다. 비즈니스 의미상 '빈 배열'/'빈 객체'가 유의미한 상태라면 (예: `"tags":[]` 가 '필드 없음'이 아니라 '태그 없음'을 나타냄) `DeleteClean` 은 해당 키까지 함께 제거합니다. 이런 필드를 유지해야 한다면 일반 `Delete` 를 사용하세요.
:::

::: warning 배치 삭제는 내결함성을 가짐
와일드카드/슬라이스/다중 필드 경로는 누락된 대상을 **조용히 건너뛰며** 오류를 반환하지 않습니다. '대상이 반드시 존재해야 함'이라는 강한 검증 의미가 필요하면 정확 경로를 사용하세요 (예: `items[*]` 대신 `items[1]`).
:::

## 여러 필드 배치 삭제

서로 관련 없는 여러 필드를 한 번에 삭제하려면 일반 `Delete` 를 반복 호출하면 됩니다 (매번 이전 결과를 기반으로):

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"user":{"id":1,"name":"Alice","password":"secret","ssn":"123-45-6789"}}`

	sensitive := []string{"user.password", "user.ssn"}
	result := data
	for _, field := range sensitive {
		var err error
		result, err = json.Delete(result, field)
		if err != nil {
			fmt.Printf("%s 삭제 실패: %v\n", field, err)
		}
	}
	fmt.Println(result)
	// 출력: {"user":{"id":1,"name":"Alice"}}
}
```

## 관련 문서

- [수정 작업](./modify) - 설정, 병합 등 수정 함수
- [조회 및 가져오기 함수](./query) - Get, GetString 등 조회 작업
- [Processor 삭제 메서드](../processor/delete) - 인스턴스 메서드 버전, 체인 호출 지원
- [설정 레퍼런스](../config) - CleanupNulls / CompactArrays 등 필드 상세
