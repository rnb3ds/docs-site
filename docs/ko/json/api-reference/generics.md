---
sidebar_label: "제네릭"
title: "제네릭 작업 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON 제네릭 API: GetTyped[T] 가져오기, Result[T] 결과 타입, AccessResult 동적 접근으로 Go 1.18+ 제네릭 기반 컴파일 타임 타입 검사를 구현하고 기본 타입과 커스텀 구조체, 기본값 폴백, 단일 요소 배열 언팩을 지원합니다."
sidebar_position: 10
---

# 제네릭 작업

json 라이브러리는 Go 1.18+ 제네릭 기능을 사용해 컴파일 타임 타입 검사를 구현하는 제네릭 타입 안전 작업을 제공합니다.

## GetTyped

시그니처: `func GetTyped[T any](jsonStr, path string, defaultValue ...T) T`

JSON 에서 지정 타입의 값을 가져옵니다. 커스텀 타입을 지원합니다. `T` 를 반환하며 error 가 없습니다. 경로가 없거나 타입 변환이 실패하면 제로값 또는 `defaultValue` 로 지정한 기본값을 반환합니다.

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `jsonStr` | `string` | 예 | JSON 문자열 |
| `path` | `string` | 예 | JSON 경로 |
| `defaultValue` | `...T` | 아니오 | 선택적 기본값, 경로가 없거나 타입 변환이 실패할 때 반환 |

**반환값**

| 반환값 | 타입 | 설명 |
|--------|------|------|
| 유일한 반환값 | `T` | 가져온 값, 경로가 없거나 타입 변환이 실패하면 제로값 또는 기본값 |

**지원하는 타입**

- 기본 타입: `string`, `int`, `int64`, `float64`, `bool`
- 슬라이스 타입: `[]any`
- 맵 타입: `map[string]any`
- 커스텀 구조체

::: tip 단일 요소 배열 자동 언패킹
대상 타입이 슬라이스가 아닐 때 가져온 값이 **정확히 하나의 요소를 가진 배열**이면 자동으로 언패킹해 그 요소를 변환합니다 (분산 경로 접근 지원, 예: `choices.message.content` 시나리오). 대상이 슬라이스 타입이면 언패킹하지 않습니다.
:::

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"user": {"name": "Alice", "age": 30}}`

	// 문자열 가져오기
	name := json.GetTyped[string](data, "user.name")
	fmt.Println(name) // 출력: Alice

	// 정수 가져오기
	age := json.GetTyped[int](data, "user.age")
	fmt.Println(age) // 출력: 30

	// 배열 가져오기
	arrData := `{"items": [1, 2, 3]}`
	items := json.GetTyped[[]any](arrData, "items")
	fmt.Println(items) // 출력: [1 2 3]

	// 기본값 사용
	email := json.GetTyped[string](data, "user.email", "unknown@example.com")
	fmt.Println(email) // 출력: unknown@example.com
}
```

---

## AccessResult

`AccessResult` 는 동적 타입 접근 결과로, 동적 타입 처리를 위한 타입 변환 메서드를 제공합니다. `SafeGet()` 으로 얻습니다.

### 구조 정의

```go
type AccessResult struct {
	Value  any    // 결과 값
	Exists bool   // 경로 존재 여부
	Type   string // 런타임 타입 정보 (디버깅용)
}
```

### 메서드

#### Ok

시그니처: `func (r AccessResult) Ok() bool`

값이 존재하는지 판단합니다.

```go
result := json.SafeGet(data, "user.name")
if result.Ok() {
	// 값이 존재함
}
```

#### Unwrap

시그니처: `func (r AccessResult) Unwrap() any`

값을 가져오며, 없으면 nil 을 반환합니다.

```go
value := result.Unwrap()
```

#### UnwrapOr

시그니처: `func (r AccessResult) UnwrapOr(defaultValue any) any`

값 또는 기본값을 가져옵니다.

```go
value := result.UnwrapOr("default")
```

#### AsString

시그니처: `func (r AccessResult) AsString() (string, error)`

안전하게 문자열로 변환합니다. 값 자체가 string 타입일 때만 성공합니다.

```go
result := json.SafeGet(data, "user.name")
name, err := result.AsString()
if err != nil {
	// 타입 불일치 또는 경로 없음
}
```

#### AsInt

시그니처: `func (r AccessResult) AsInt() (int, error)`

안전하게 정수로 변환합니다. 모든 정수 타입과 float (정수 값인 경우) 을 지원합니다. **주의: bool 은 int 로 변환되지 않습니다.**

#### AsFloat64

시그니처: `func (r AccessResult) AsFloat64() (float64, error)`

안전하게 부동소수점으로 변환합니다. 모든 숫자 타입을 지원합니다. **주의: bool 은 float64 로 변환되지 않습니다.**

#### AsBool

시그니처: `func (r AccessResult) AsBool() (bool, error)`

안전하게 불리언으로 변환합니다. bool 과 string 타입 ("true", "false", "1", "0" 등) 을 지원합니다.

### 체이닝 타입 변환 메서드

`AccessResult` 는 다음 타입 변환 메서드를 제공합니다:

| 메서드 | 반환 타입 | 설명 |
|------|----------|------|
| `AsString()` | `(string, error)` | 문자열로 변환 (엄격한 타입 검사) |
| `AsStringConverted()` | `(string, error)` | 포맷팅하여 문자열로 변환 |
| `AsInt()` | `(int, error)` | 정수로 변환 (bool 은 변환 안 함) |
| `AsFloat64()` | `(float64, error)` | float64 로 변환 (bool 은 변환 안 함) |
| `AsBool()` | `(bool, error)` | 불리언으로 변환 |

### AsString vs AsStringConverted

| 메서드 | 동작 | 사용 시나리오 |
|------|------|----------|
| `AsString()` | 엄격한 타입 검사, string 타입만 성공 | 원본 타입을 보장해야 할 때 |
| `AsStringConverted()` | 임의 타입을 문자열로 포맷팅 | 문자열 표현이 필요할 때 |

```go
// 시나리오: 숫자 또는 문자열일 수 있는 값 가져오기
result := json.SafeGet(data, "user.id")

// 엄격 모드 - 값이 string 일 때만 성공
id, err := result.AsString()

// 관대한 모드 - 숫자도 문자열로 변환
idStr, err := result.AsStringConverted()
```

---

## StreamLinesInto

시그니처: `func StreamLinesInto[T any](reader io.Reader, fn func(lineNum int, data T) error, cfg ...Config) ([]T, error)`

`io.Reader` 에서 JSON 을 줄 단위로 읽어 각 줄을 타입 `T` 로 파싱하고 콜백 함수를 호출합니다. JSONL 형식의 대용량 파일 처리에 적합합니다.

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `reader` | `io.Reader` | 예 | 데이터 소스 |
| `fn` | `func(lineNum int, data T) error` | 예 | 각 줄의 콜백 함수, 줄 번호와 파싱된 데이터를 받음 |
| `cfg` | `...Config` | 아니오 | 선택적 설정 |

**반환값**

| 반환값 | 타입 | 설명 |
|--------|------|------|
| 첫 번째 | `[]T` | 성공적으로 파싱된 모든 결과 |
| 두 번째 | `error` | 오류 정보 |

**동작 세부** (모두 JSONL 관련 Config 필드로 제어, [Config](./config#config-구조체) 참조):

- 빈 줄은 기본적으로 건너뜁니다 (`JSONLSkipEmpty: true`); `JSONLSkipComments: true` 면 `#`/`//` 로 시작하는 줄을 건너뜁니다
- 어떤 줄의 파싱이 실패하면: 기본적으로 `line N: <원인>` 오류를 반환하고 결과는 nil; `JSONLContinueOnErr: true` 면 해당 줄을 건너뛰고 계속합니다
- 콜백이 오류를 반환하면: 즉시 중지하고 해당 오류를 반환합니다 (결과는 nil); 콜백 panic 은 잡아서 오류로 변환하며 프로세스를 뚫고 나가지 않습니다
- 읽기 버퍼와 한 줄 상한은 `JSONLBufferSize` (64KB) 와 `JSONLMaxLineSize` (1MB) 로 제어됩니다
- cfg 가 없으면 전역 기본 프로세서를 사용합니다 (`SetGlobalProcessor` 의 영향을 받음); cfg 를 전달하면 해당 설정으로 프로세서를 선택합니다

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"strings"
)

func main() {
	jsonl := `{"name":"Alice","age":30}
{"name":"Bob","age":25}
{"name":"Charlie","age":35}`

	type Person struct {
		Name string `json:"name"`
		Age  int    `json:"age"`
	}

	reader := strings.NewReader(jsonl)
	results, err := json.StreamLinesInto[Person](reader, func(lineNum int, data Person) error {
		fmt.Printf("줄 %d: %s, %d 세\n", lineNum, data.Name, data.Age)
		return nil
	})
	if err != nil {
		panic(err)
	}
	fmt.Printf("총 %d 개 레코드 처리\n", len(results))
}
```

---

## 사용 예제

### 설정 파싱

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

type DatabaseConfig struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Database string `json:"database"`
	SSL      bool   `json:"ssl"`
}

func main() {
	config := `{
        "database": {
            "host": "localhost",
            "port": 5432,
            "database": "myapp",
            "ssl": true
        }
    }`

	// 설정을 구조체로 파싱
	dbConfig := json.GetTyped[DatabaseConfig](config, "database")

	fmt.Printf("Host: %s:%d\n", dbConfig.Host, dbConfig.Port)
}
```

### 다중 타입 처리

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{
        "name": "Alice",
        "age": 30,
        "active": true,
        "score": 95.5,
        "tags": ["admin", "user"]
    }`

	// 서로 다른 타입의 제네릭 조회
	name := json.GetTyped[string](data, "name")
	age := json.GetTyped[int](data, "age")
	active := json.GetTyped[bool](data, "active")
	score := json.GetTyped[float64](data, "score")
	tags := json.GetTyped[[]any](data, "tags")

	fmt.Printf("Name: %s\n", name)
	fmt.Printf("Age: %d\n", age)
	fmt.Printf("Active: %v\n", active)
	fmt.Printf("Score: %.1f\n", score)
	fmt.Printf("Tags: %v\n", tags)
}
```

### 오류 처리

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	config := `{"timeout": 30}`

	timeout := json.GetTyped[int](config, "timeout")
	fmt.Printf("Timeout: %d\n", timeout) // 출력: 30

	// 경로가 없으면 제로값 반환
	retries := json.GetTyped[int](config, "retries")
	fmt.Printf("Retries: %d\n", retries) // 출력: 0 (제로값)

	// 경로가 없으면 기본값 사용
	retries = json.GetTyped[int](config, "retries", 3)
	fmt.Printf("Retries: %d\n", retries) // 출력: 3 (기본값)
}
```

---

## 성능 설명

`GetTyped[T]` 의 변환은 두 단계입니다: **기본 타입** (string/int/float64/bool 과 그 슬라이스/맵) 은 내부 빠른 경로로 직접 변환하고; **커스텀 구조체 등 복잡 타입**은 '다시 Marshal → Unmarshal' 하는 일반 경로로 폴백하므로 타입 전용 getter (`GetString`, `GetInt` 등) 보다 약간 느립니다.

| 메서드 | 성능 | 추천 시나리오 |
|------|------|----------|
| `GetString`, `GetInt` 등 | 가장 빠름 (기본 타입 전용) | 성능 민감, 타입을 이미 아는 경우 |
| `GetTyped[T]` (기본 타입) | 빠름 (빠른 변환 경로) | 제네릭 코드에서 기본 타입 읽기 |
| `GetTyped[T]` (구조체) | 중간 (re-marshal 변환 경유) | 설정 파싱, 일회성 읽기 |
| `SafeGet` + `AccessResult` | 중간 | 동적 타입 처리 |

::: tip
핫 경로에서 같은 구조체를 반복 읽을 때는 경로마다 `GetTyped[Struct]` 를 부르기보다 `Parse`/`Unmarshal` 로 한 번 구조체에 넣거나 `GetTyped` 를 한 번 호출해 결과를 재사용하는 것이 더 빠릅니다.
:::

---

## Result[T] 타입

`Result[T]` 는 타입 안전한 제네릭 작업 결과로, 명확한 타입과 오류 처리가 모두 필요한 시나리오에 사용됩니다.

### 구조 정의

```go
type Result[T any] struct {
	Value  T     // 결과 값
	Exists bool  // 경로를 찾았는지 여부
	Error  error // 오류 정보
}
```

### 메서드

| 메서드 | 반환 타입 | 설명 |
|------|----------|------|
| `Ok()` | `bool` | 결과 유효 검사 (오류 없고 찾음) |
| `Unwrap()` | `T` | 값 반환, 실패 시 제로값 반환 |
| `UnwrapOr(default T)` | `T` | 값 반환에 실패하면 기본값 반환 |

### 사용 예제

`Result[T]` 에는 '라이브러리 함수가 직접 반환하는' 입구가 없습니다 — 직접 **수동 생성**하는 것으로, 자신의 조회 함수를 감싸 '값 + 존재 여부 + 오류'를 하나의 명확한 반환값으로 호출자에게 전달할 때 자주 씁니다:

```go
package main

import (
	"errors"
	"fmt"

	"github.com/cybergodev/json"
)

// Result[T] 로 명확한 오류를 갖춘 설정 읽기 함수 감싸기
func readConfig(data, path string) json.Result[string] {
	val, err := json.Get(data, path)
	if err != nil {
		return json.Result[string]{Error: err}
	}
	s, ok := val.(string)
	if !ok {
		return json.Result[string]{Error: fmt.Errorf("%s: %w", path, json.ErrTypeMismatch)}
	}
	return json.Result[string]{Value: s, Exists: true}
}

func main() {
	data := `{"env": "production"}`

	r := readConfig(data, "env")
	if r.Ok() {
		fmt.Println("환경:", r.Unwrap()) // 출력: 환경: production
	}

	missing := readConfig(data, "region")
	fmt.Println(missing.Exists, errors.Is(missing.Error, nil)) // 출력: false true
	fmt.Println(missing.UnwrapOr("cn-north-1"))                // 출력: cn-north-1
}
```

---

## Result[T] 와 AccessResult 비교

| 특성 | Result[T] | AccessResult |
|------|-----------|---------------------|
| 타입 안전 | 제네릭 T | any 타입 |
| 존재 판단 | `Exists bool` | `Exists bool` |
| 오류 처리 | 내장 Error 필드 | 타입 변환 메서드가 error 반환 |
| 체인 호출 | 지원 안 함 | 체이닝 타입 변환 지원 |
| 획득 방식 | 수동 생성 (라이브러리 함수 입구 없음) | `SafeGet()` |
| 적합한 시나리오 | 자신의 조회 함수 감싸기 | 동적 타입 처리 |

### 선택 권장

- **타입을 알고 있고 오류 세부사항에 관심 없음**: `GetTyped[T]` (제로값/기본값 폴백)
- **동적 타입**: `AccessResult` 와 `SafeGet()` 사용
- **체인 변환 필요**: `AccessResult` 사용
- **통일된 반환 형태 감싸기**: 자신의 함수 반환 타입으로 `Result[T]` 사용

---

## 관련 문서

- [패키지 함수](./functions/) - 타입 전용 getter 함수
- [타입 정의](./types) - AccessResult 상세 정의
- [설정](./config) - Config 설정 옵션
