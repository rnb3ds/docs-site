---
sidebar_label: "조회 및 가져오기"
title: "조회 및 가져오기 함수 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON 조회 함수: Get/GetString/GetInt 타입 안전 조회, GetTyped[T] 제네릭, GetMultiple 배치와 SafeGet 안전 접근으로 JSONPath 와일드카드·슬라이스, 기본값 폴백과 GetWithContext 타임아웃 취소 지원."
sidebar_position: 2
---

# 조회 및 가져오기 함수

json 패키지가 제공하는 조회와 가져오기 함수로, 경로 표현식, 타입 안전 조회, 배치 작업을 지원합니다.

## 경로 쿼리 함수

### Get

시그니처: `func Get(jsonStr, path string, cfg ...Config) (any, error)`

경로로 임의 타입의 값을 가져옵니다.

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `jsonStr` | `string` | 예 | JSON 문자열 |
| `path` | `string` | 예 | 경로 표현식 |
| `cfg` | `Config` | 아니오 | 선택적 설정 |

**예제**

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	val, err := json.Get(`{"items":[{"name":"test"}]}`, "items[0].name")
	if err != nil {
		panic(err)
	}
	fmt.Println(val) // 출력: test
}
```

### GetWithContext

시그니처: `func GetWithContext(ctx context.Context, jsonStr, path string, cfg ...Config) (any, error)`

컨텍스트가 있는 경로 조회입니다. 타임아웃과 취소를 지원합니다. `Get` 의 컨텍스트 인식 버전입니다.

::: info 취소 의미: 경계 수준 검사
Context 는 **작업 시작 전**과 **종료 후**에 한 번씩만 검사하며, 파싱/탐색 도중에는 검사하지 않습니다:

- 시작 전에 이미 취소/타임아웃된 경우: 어떤 파싱도 실행하지 않고 `ctx.Err()` (`context.Canceled` / `context.DeadlineExceeded`) 을 바로 반환
- 작업 완료 후에야 타임아웃이 감지된 경우: 값이 성공적으로 꺼내졌더라도 버려지며 마찬가지로 `ctx.Err()` 반환
- 따라서 이 함수는 **호출 경계의 가드**로 적합합니다 — 이미 타임아웃된 요청에서 헛된 작업을 계속하는 것을 방지하지만, 파싱 자체는 도중에 중단될 수 없어 초대형 JSON 문서에서는 타임아웃이 단일 파싱의 소요 시간 상한을 제한하지 못합니다
:::

```go
package main

import (
	"context"
	"fmt"
	"github.com/cybergodev/json"
	"time"
)

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	val, err := json.GetWithContext(ctx, `{"user":{"name":"Alice"}}`, "user.name")
	if err != nil {
		panic(err)
	}
	fmt.Println(val) // 출력: Alice
}
```

## 타입 안전 조회 함수

타입 안전 조회 함수는 `defaultValue` 가변 인자로 제로값 폴백을 제공합니다. 경로가 존재하지 않거나, 값이 null 이거나, 타입 변환이 실패하면 `defaultValue` 를 반환합니다 (제공하지 않으면 해당 타입의 제로값).

### GetString

시그니처: `func GetString(jsonStr, path string, defaultValue ...string) string`

경로로 문자열 값을 가져옵니다.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	jsonStr := `{"user": {"name": "CyberGo"}}`

	name := json.GetString(jsonStr, "user.name")
	fmt.Println(name) // 출력: CyberGo

	// 존재하지 않는 경로는 제로값 (빈 문자열) 또는 커스텀 기본값 반환
	nickname := json.GetString(jsonStr, "user.nickname", "알 수 없음")
	fmt.Println(nickname) // 출력: 알 수 없음
}
```

### GetInt

시그니처: `func GetInt(jsonStr, path string, defaultValue ...int) int`

경로로 정수 값을 가져옵니다.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	jsonStr := `{"pagination": {"count": 42}, "timeout": 30}`

	count := json.GetInt(jsonStr, "pagination.count")
	fmt.Println(count) // 출력: 42

	timeout := json.GetInt(jsonStr, "timeout")
	fmt.Println(timeout) // 출력: 30

	// 존재하지 않는 경로는 커스텀 기본값 반환
	page := json.GetInt(jsonStr, "pagination.page", 1)
	fmt.Println(page) // 출력: 1
}
```

### GetFloat

시그니처: `func GetFloat(jsonStr, path string, defaultValue ...float64) float64`

경로로 부동소수점 값을 가져옵니다.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	jsonStr := `{"item": {"price": 19.99}, "rate": 0.85}`

	price := json.GetFloat(jsonStr, "item.price")
	fmt.Println(price) // 출력: 19.99

	rate := json.GetFloat(jsonStr, "rate")
	fmt.Println(rate) // 출력: 0.85

	// 존재하지 않는 경로는 커스텀 기본값 반환
	discount := json.GetFloat(jsonStr, "item.discount", 0.0)
	fmt.Println(discount) // 출력: 0
}
```

### GetBool

시그니처: `func GetBool(jsonStr, path string, defaultValue ...bool) bool`

경로로 불리언 값을 가져옵니다.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	jsonStr := `{"feature": {"enabled": true}, "debug": false}`

	enabled := json.GetBool(jsonStr, "feature.enabled")
	fmt.Println(enabled) // 출력: true

	debug := json.GetBool(jsonStr, "debug")
	fmt.Println(debug) // 출력: false

	// 존재하지 않는 경로는 커스텀 기본값 반환
	verbose := json.GetBool(jsonStr, "feature.verbose", false)
	fmt.Println(verbose) // 출력: false
}
```

### GetArray

시그니처: `func GetArray(jsonStr, path string, defaultValue ...[]any) []any`

경로로 배열을 가져옵니다.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	jsonStr := `{"items": ["apple", "banana", "cherry"]}`

	items := json.GetArray(jsonStr, "items")
	for i, item := range items {
		fmt.Printf("[%d] %v\n", i, item)
	}

	// 존재하지 않는 경로는 커스텀 기본값 반환
	empty := json.GetArray(jsonStr, "tags", []any{"default"})
	fmt.Println(empty) // 출력: [default]
}
```

### GetObject

시그니처: `func GetObject(jsonStr, path string, defaultValue ...map[string]any) map[string]any`

경로로 객체를 가져옵니다.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	jsonStr := `{"user": {"profile": {"name": "CyberGo", "level": 5}}}`

	profile := json.GetObject(jsonStr, "user.profile")
	fmt.Println(profile) // map[level:5 name:CyberGo]

	// 존재하지 않는 경로는 커스텀 기본값 반환
	settings := json.GetObject(jsonStr, "user.settings", map[string]any{"theme": "dark"})
	fmt.Println(settings) // 출력: map[theme:dark]
}
```

## 제네릭 조회 함수

### GetTyped[T]

시그니처: `func GetTyped[T any](jsonStr, path string, defaultValue ...T) T`

제네릭 조회 함수로, 커스텀 타입을 지원합니다. 경로가 존재하지 않거나, 값이 null 이 거나, 타입 변환이 실패하면 `defaultValue` 를 반환합니다 (제공하지 않으면 `T` 의 제로값).

**네이밍 규칙 안내**: `GetTyped[T]` 는 `GetAs[T]` 와 의미가 동등하며, JSON 값을 가져와 지정 타입 `T` 로 변환함을 나타냅니다.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

type User struct {
	Name string `json:"name"`
	Age  int    `json:"age"`
}

func main() {
	jsonStr := `{"user": {"name": "CyberGo", "age": 30}}`

	// 타입화된 구조체 가져오기
	user := json.GetTyped[User](jsonStr, "user")
	fmt.Printf("Name: %s, Age: %d\n", user.Name, user.Age)

	// 내장 타입 예제
	name := json.GetTyped[string](jsonStr, "user.name")
	fmt.Println(name) // 출력: CyberGo

	age := json.GetTyped[int](jsonStr, "user.age")
	fmt.Println(age) // 출력: 30

	// 존재하지 않는 경로는 커스텀 기본값 반환
	email := json.GetTyped[string](jsonStr, "user.email", "unknown@example.com")
	fmt.Println(email) // 출력: unknown@example.com
}
```

## 안전 조회 함수

### SafeGet (패키지 레벨 함수)

시그니처: `func SafeGet(jsonStr, path string, cfg ...Config) AccessResult`

타입 안전한 조회 작업을 수행하고 `AccessResult` 를 반환하며, 타입 변환 메서드 (`AsString`, `AsInt`, `AsFloat64`, `AsBool`) 를 제공합니다.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	jsonStr := `{"user": {"name": "CyberGo", "age": 30}}`

	result := json.SafeGet(jsonStr, "user.age")
	if result.Exists {
		age, _ := result.AsInt()
		fmt.Println(age) // 출력: 30
	}

	nameResult := json.SafeGet(jsonStr, "user.name")
	name, _ := nameResult.AsString()
	fmt.Println(name) // 출력: CyberGo
}
```

### SafeGet (Processor 메서드)

시그니처: `func (p *Processor) SafeGet(jsonStr, path string, cfg ...Config) AccessResult`

Processor 인스턴스를 통해 타입 안전한 조회 작업을 수행합니다.

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

jsonStr := `{"user": {"name": "CyberGo", "age": 30}}`

result := p.SafeGet(jsonStr, "user.age")
if result.Exists {
	age, _ := result.AsInt()
	fmt.Println(age) // 출력: 30
}
```

::: tip 선택 기준: GetTyped 계열 vs SafeGet
- **Config 지원**: `GetString`/`GetInt`/`GetTyped[T]` 등 타입화된 함수는 **Config 를 받을 수 없습니다** — 가변 인자가 `defaultValue` 에 이미 사용되었고 (Go 는 함수마다 가변 인자를 하나만 허용) 이들은 기본 프로세서를 고정적으로 사용합니다. 호출별로 보안 제한, 검증, 캐시를 조정하려면 `SafeGet(jsonStr, path, cfg)` 를 사용하거나, `json.New(cfg)` 로 전용 Processor 를 만든 뒤 그것의 `GetString` 등의 메서드를 호출하세요.
- **변환 관대함**: 타입화된 함수는 관대한 변환을 사용합니다 (문자열 `"42"` 를 `int` 로, 불리언 `true` 를 `1` 로 변환); `SafeGet` 의 `AsInt`/`AsFloat64` 는 불리언 입력을 거부하고, `AsString` 은 원래 값이 string 이어야 합니다 (명시적 문자열화가 필요하면 `AsStringConverted` 사용).
- **오류 의미**: 타입화된 함수는 기본값/제로값으로 **조용히 폴백**합니다; `SafeGet` 은 '존재 여부' (`Exists`/`Ok()`) 와 '변환 실패' (`AsInt`/`AsString` 등 변환 메서드가 error 반환) 정보를 모두 유지해 구분 처리에 유리합니다.
:::

## Processor 확장 메서드

다음 메서드는 패키지 레벨 함수와 Processor 메서드로 동시에 제공됩니다.

### GetMultiple (패키지 레벨 함수)

시그니처: `func GetMultiple(jsonStr string, paths []string, cfg ...Config) (map[string]any, error)`

여러 경로의 값을 배치로 가져옵니다 (패키지 레벨 함수, Processor 생성 불필요).

**반환값 의미**

- JSON 전체를 **한 번만** 파싱한 뒤 각 경로를 평가합니다 (`Get` 을 여러 번 호출하는 것보다 효율적)
- 반환된 map 은 **경로 문자열 자체**를 키로 사용하며 (예: `"user.name"`), 입력 `paths` 와 일대일 대응합니다
- **부분 실패**: 어떤 경로의 값 가져오기가 실패하면 해당 키는 map 에서 `nil` 이 되고, 동시에 함수는 처음 만난 오류를 반환합니다 (`map` 과 `err` 이 동시에 nil 이 아님) — 성공한 경로의 결과는 여전히 사용할 수 있습니다
- 어떤 경로든 **문법이 잘못되면** 전체가 실패합니다 (`nil, err` 반환); `paths` 가 빈 슬라이스면 빈 map 과 `nil` 을 반환합니다

```go
jsonStr := `{"user": {"name": "CyberGo", "age": 30, "email": "test@example.com"}}`

paths := []string{"user.name", "user.age", "user.email"}
values, err := json.GetMultiple(jsonStr, paths)
if err != nil {
	panic(err)
}
fmt.Println(values["user.name"]) // 출력: CyberGo
```

**부분 실패 예제** (실패 경로는 nil 이지만 성공 경로는 여전히 사용 가능):

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"user": {"name": "CyberGo", "age": 30}}`

	values, err := json.GetMultiple(data, []string{"user.name", "user.missing"})
	fmt.Println(values["user.name"])    // 출력: CyberGo (성공 경로는 영향 없음)
	fmt.Println(values["user.missing"]) // 출력: <nil> (실패 경로는 nil)
	fmt.Println(err != nil)             // 출력: true (부분 실패 시 err 은 nil 이 아님)
}
```

### Processor.GetMultiple

시그니처: `func (p *Processor) GetMultiple(jsonStr string, paths []string, cfg ...Config) (map[string]any, error)`

여러 경로의 값을 배치로 가져옵니다.

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

jsonStr := `{"user": {"name": "CyberGo", "age": 30, "email": "test@example.com"}}`

paths := []string{"user.name", "user.age", "user.email"}
values, err := p.GetMultiple(jsonStr, paths)
if err != nil {
	panic(err)
}
fmt.Println(values["user.name"]) // 출력: CyberGo
```

## 오류 처리

`Get`/`GetWithContext` 의 실패는 센티널 오류로 구분하며 `errors.Is` 로 판별합니다; 타입화된 함수 (`GetString` 등) 는 오류를 반환하지 않고 조용히 제로값/기본값으로 떨어집니다:

```go
package main

import (
	"errors"
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"user": {"name": "Alice"}}`

	if _, err := json.Get(data, "user.age"); errors.Is(err, json.ErrPathNotFound) {
		fmt.Println("경로가 존재하지 않아 기본값 로직으로 이동")
	}
	if _, err := json.Get(`{"name": "x"}`, "name[0]"); errors.Is(err, json.ErrTypeMismatch) {
		fmt.Println("타입 불일치: 문자열은 인덱스를 지원하지 않음")
	}
	if _, err := json.Get(`{"name": }`, "name"); errors.Is(err, json.ErrInvalidJSON) {
		fmt.Println("입력이 유효한 JSON 이 아님")
	}
}
```

::: tip 성능 진입점
같은 경로를 반복 조회할 때는 [`CompilePath`/`GetCompiled`](../processor/query#compilepath) 를, 같은 JSON 의 여러 경로 조회는 [`PreParse`/`GetFromParsed`](../processor/query#preparse) 를 사용하세요. 모두 Processor 조회 레퍼런스에 있습니다.
:::

## 관련 타입

### AccessResult

`SafeGet` 이 사용하는 `AccessResult` 구조체 필드:

| 필드 | 타입 | 설명 |
|------|------|------|
| `Value` | `any` | 가져온 값 |
| `Exists` | `bool` | 경로 존재 여부 |
| `Type` | `string` | 감지된 값 타입 |

**메서드**: `Ok()` · `Unwrap()` · `UnwrapOr()` · `AsString()` · `AsStringConverted()` · `AsInt()` · `AsFloat64()` · `AsBool()`

자세한 내용은 [AccessResult 타입](../types#accessresult-속성-접근-결과) 을 참조하세요.

### Result[T]

`Result[T]` 제네릭 구조체 필드:

| 필드 | 타입 | 설명 |
|------|------|------|
| `Value` | `T` | 가져온 값 |
| `Exists` | `bool` | 값을 찾았는지 여부 |
| `Error` | `error` | 오류 정보 |

## 관련 문서

- [파싱과 검증 함수](./parse) - Parse, Valid, ValidateSchema 등 파싱과 검증 작업
- [배치 작업 함수](./batch) - ProcessBatch 배치 처리
- [수정 함수](./modify) - Set, Delete 등 수정 작업
- [인코딩 출력](./output) - Marshal, Unmarshal 등 직렬화 작업
- [유틸리티 함수](../helpers) - CompareJSON, MergeJSON 등 도구 함수
- [설정 옵션](../config) - Config 설정 상세
