---
sidebar_label: "파싱 및 검증"
title: "파싱 및 검증 함수 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON 파싱 및 검증 함수: Parse/ParseAny 파싱, Valid/ValidWithConfig 유효성 검사와 ValidateSchema JSON Schema 검증으로 파싱 전 크기·중첩 깊이·위험 패턴 보안 검사를 수행해 전체 처리 흐름을 지원합니다."
sidebar_position: 6
---

# 파싱 및 검증 함수

json 패키지가 제공하는 파싱과 검증 함수로, JSON 을 대상 객체로 파싱, Processor 인스턴스를 통한 파싱, JSON 유효성 검증과 JSON Schema 검증을 지원합니다.

## 파싱 함수

### Parse

시그니처: `func Parse(jsonStr string, target any, cfg ...Config) error`

JSON 문자열을 `target` 포인터가 가리키는 객체로 파싱합니다. `target` 은 **nil 이 아닌 포인터**여야 합니다 (`nil` 이나 포인터가 아닌 값을 전달하면 매개변수 오류를 반환). `Get` 과 마찬가지로 `Parse` 는 파싱 전에 입력에 보안 검증 (크기, 중첩 깊이, 위험 패턴; `cfg` 와 프로세서 설정의 제약을 받음) 을 실행합니다.

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `jsonStr` | `string` | 예 | JSON 문자열 |
| `target` | `any` | 예 | 대상 객체 포인터 |
| `cfg` | `Config` | 아니오 | 선택적 설정 |

**기본 파싱**

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	var data map[string]any
	err := json.Parse(`{"name": "test"}`, &data)
	if err != nil {
		panic(err)
	}
	fmt.Println(data) // map[name:test]
}
```

**구조체로 파싱**

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

type Person struct {
	Name string `json:"name"`
	Age  int    `json:"age"`
}

func main() {
	var person Person
	err := json.Parse(`{"name": "CyberGo", "age": 30}`, &person)
	if err != nil {
		panic(err)
	}
	fmt.Printf("Name: %s, Age: %d\n", person.Name, person.Age)
}
```

**커스텀 설정 사용**

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	cfg := json.DefaultConfig()
	var data map[string]any
	err := json.Parse(`{"name": "test"}`, &data, cfg)
	if err != nil {
		panic(err)
	}
	fmt.Println(data)
}
```

### ParseAny

시그니처: `func ParseAny(jsonStr string, cfg ...Config) (any, error)`

JSON 문자열을 파싱하여 루트 값을 `any` 타입으로 반환하며, 대상 변수를 미리 선언할 필요가 없습니다.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	result, err := json.ParseAny(`{"name": "test"}`)
	if err != nil {
		panic(err)
	}
	fmt.Println(result) // map[name:test]
}
```

::: tip Parse vs ParseAny
- `Parse(jsonStr, &target)` — 대상 포인터로 파싱, 변수를 미리 선언해야 함
- `ParseAny(jsonStr)` — `any` 타입을 바로 반환, 미리 선언 불필요
:::

### Processor.Parse

시그니처: `func (p *Processor) Parse(jsonStr string, target any, cfg ...Config) error`

Processor 인스턴스를 통해 JSON 을 대상 포인터로 파싱합니다.

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

var data map[string]any
err = p.Parse(`{"name": "test"}`, &data)
if err != nil {
	panic(err)
}
```

### Processor.ParseAny

시그니처: `func (p *Processor) ParseAny(jsonStr string, cfg ...Config) (any, error)`

Processor 인스턴스를 통해 JSON 을 파싱해 `any` 타입으로 반환하며, 동작은 패키지 레벨 `ParseAny` 와 같습니다.

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

data, err := p.ParseAny(`{"name": "test"}`)
```

자세한 내용은 [Processor 파싱 메서드](../processor/parse#파싱-메서드) 를 참조하세요.

## 검증 함수

### Valid

시그니처: `func Valid(data []byte, cfg ...Config) bool`

JSON 바이트 슬라이스가 유효한지 검증합니다. `encoding/json.Valid` 과 100% 호환: cfg 없이 `json.Valid(data)` 를 호출하면 표준 라이브러리와 완전히 동일하며 일반 `bool` 을 반환합니다.

선택적인 마지막 `Config` 로 보안 제한 (크기, 중첩 깊이, 전체 보안 스캔 등) 을 적용할 수 있습니다. cfg 를 전달하면 `Valid` 는 `Processor.Valid` 에 위임하고 모든 오류를 `false` 로 접습니다.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := []byte(`{"name": "test"}`)
	// encoding/json 호환 (cfg 없음)
	if json.Valid(data) {
		fmt.Println("유효한 JSON")
	}

	// 설정 포함 (비파괴적 선택 인자)
	if json.Valid(data, json.SecurityConfig()) {
		fmt.Println("보안 검증 통과")
	}
}
```

::: tip Valid vs ValidWithConfig
- `Valid(data, cfg)` 는 단일 `bool` 을 반환 (`encoding/json` 호환), 모든 오류는 `false` 로 접힘
- `ValidWithConfig(jsonStr, cfg)` 는 `(bool, error)` 를 반환, 검증 실패 원인 확인에 편리

둘 다 `cfg` 를 받습니다; 이름 차이는 역사적 유물입니다.
:::

### ValidWithConfig

시그니처: `func ValidWithConfig(jsonStr string, cfg ...Config) (bool, error)`

설정을 사용해 JSON 문자열이 유효한지 검증하고 가능한 오류 정보를 반환합니다.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	cfg := json.DefaultConfig()
	valid, err := json.ValidWithConfig(`{"name": "test"}`, cfg)
	if err != nil {
		panic(err)
	}
	if valid {
		fmt.Println("유효한 JSON")
	}
}
```

### ValidateSchema

시그니처: `func ValidateSchema(jsonStr string, schema *Schema, cfg ...Config) ([]ValidationError, error)`

JSON Schema 로 JSON 데이터를 검증합니다. 모든 검증 오류의 목록을 반환합니다.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	schema := &json.Schema{
		Type:     "object",
		Required: []string{"name", "email"},
		Properties: map[string]*json.Schema{
			"name":  {Type: "string"},
			"email": {Type: "string", Format: "email"},
			"age":   {Type: "number"}, // 숫자는 모두 "number" 사용 (정수 포함)
		},
	}

	errors, err := json.ValidateSchema(`{"name":"Alice","email":"alice@example.com","age":25}`, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errors {
		fmt.Printf("경로 %s: %s\n", e.Path, e.Message)
	}
}
```

::: warning 두 가지 주의
- `Type` 값에 `"integer"` 는 없습니다 — JSON 파싱 후 모든 숫자는 `float64` 이므로 숫자는 항상 `"number"` 를 사용하세요.
- `MinLength`/`Minimum` 등 **길이/구간류 제약**은 `&json.Schema{...}` 리터럴에 직접 써서는 효과가 없으며, 반드시 [`NewSchemaWithConfig`](../schema#schema-생성-방식) 로 생성해야 합니다. 자세한 내용은 [Schema 검증](../schema) 을 참조하세요.
:::

::: tip 자세히
Schema 타입 정의와 검증기 사용법 전체는 [Schema 검증](../schema) 을 참조하세요.
:::

## 관련 문서

- [조회 및 가져오기 함수](./query) - Get, GetString 등 조회 작업
- [Processor 파싱 메서드](../processor/parse) - Processor 레벨 파싱과 검증 메서드 상세
