---
sidebar_label: "타입 정의"
title: "타입 정의 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON 핵심 타입: Result[T] 제네릭, AccessResult 접근, BatchOperation, BatchResult, Schema, Stats, IterableValue 와 CompiledPath 사전 컴파일 경로로 전체 타입 시스템을 구성합니다."
sidebar_position: 5
---

# 타입 정의

json 패키지는 JSON 작업 결과를 다루기 위한 다양한 타입 안전 타입을 제공합니다.

## Result[T] - 통일된 결과 타입

`Result[T]` 는 제네릭 작업 결과 타입으로, 타입 안전한 오류 처리와 값 접근을 제공합니다.

### 구조 정의

```go
type Result[T any] struct {
	Value  T     // 결과 값
	Exists bool  // 값을 찾았는지 여부
	Error  error // 오류 (있는 경우)
}
```

### 필드 설명

| 필드 | 타입 | 설명 |
|------|------|------|
| `Value` | `T` | 결과 값, 타입은 제네릭 매개변수 `T` 가 결정 |
| `Exists` | `bool` | 경로 존재 여부 (값을 찾았는지) |
| `Error` | `error` | 작업 오류 (오류 없으면 `nil`) |

### 메서드

| 메서드 | 시그니처 | 설명 |
|------|------|------|
| `Ok()` | `func (r Result[T]) Ok() bool` | 결과가 유효한지 검사 (오류 없고 찾음) |
| `Unwrap()` | `func (r Result[T]) Unwrap() T` | 값 반환, 실패 시 제로값 반환 |
| `UnwrapOr()` | `func (r Result[T]) UnwrapOr(defaultValue T) T` | 값 또는 기본값 반환 |

### 사용 예제

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"user": {"name": "Alice", "age": 30}}`

	// GetTyped 로 타입화된 값 가져오기
	name := json.GetTyped[string](data, "user.name")
	fmt.Printf("이름: %s\n", name)

	// defaultValue 매개변수로 기본값 제공
	nickname := json.GetTyped[string](data, "user.nickname", "설정 안 됨")
	fmt.Printf("닉네임: %s\n", nickname)

	age := json.GetTyped[int](data, "user.age", 0)
	fmt.Printf("나이: %d\n", age)
}
```

::: tip 네이밍 규칙
- **GetTyped[T]** - 지정 타입의 값을 가져오고 `T` 를 반환하며, `defaultValue` 매개변수 지원
- **Result[T]** - 내부 결과 타입으로, 정밀한 오류 처리가 필요한 시나리오에 사용
:::

---

## CompiledPath - 사전 컴파일 경로

`CompiledPath` 는 사전 컴파일된 JSON 경로의 타입 별칭으로, 같은 경로를 빈번히 접근할 때 경로 문자열의 중복 파싱을 피해 성능을 높입니다.

### 타입 정의

```go
type CompiledPath = internal.CompiledPath
```

### 사용 시나리오

같은 경로에 대해 대량의 반복 작업이 필요할 때 (예: 루프 안에서의 배치 쿼리) 경로를 미리 컴파일하면 호출마다 경로 문자열을 다시 파싱하는 일을 피할 수 있습니다.

### 컴파일 함수

#### Processor.CompilePath

시그니처: `func (p *Processor) CompilePath(path string) (*CompiledPath, error)`

Processor 로 JSON 경로를 사전 컴파일하여 이후 작업에서 재사용할 수 있는 `*CompiledPath` 인스턴스를 반환합니다.

```go
processor, err := json.New()
if err != nil {
	panic(err)
}
defer processor.Close()

compiled, err := processor.CompilePath("user.profile.name")
if err != nil {
	panic(err)
}
// 이후 작업에서 compiled 를 반복 사용 가능
val, err := processor.GetCompiled(data, compiled)
```

::: tip 성능 힌트
고빈도 반복 경로 접근에는 사전 컴파일 경로가 경로 파싱 오버헤드를 크게 줄입니다. 배치 작업, 루프 쿼리 등의 시나리오에 적합합니다.
:::

### 메서드

| 메서드 | 시그니처 | 설명 |
|------|------|------|
| `Get` | `func (cp *CompiledPath) Get(data any) (any, error)` | 파싱된 JSON 데이터에서 컴파일 경로로 값을 가져옴 |
| `GetFromRaw` | `func (cp *CompiledPath) GetFromRaw(raw []byte) (any, error)` | 원시 JSON 바이트에서 컴파일 경로로 값을 가져옴 (내부적으로 역직렬화 후 탐색) |
| `Exists` | `func (cp *CompiledPath) Exists(data any) bool` | 파싱된 데이터에 해당 경로의 값이 있는지 검사 |
| `Len` | `func (cp *CompiledPath) Len() int` | 경로의 세그먼트 수 반환 |
| `IsEmpty` | `func (cp *CompiledPath) IsEmpty() bool` | 경로에 세그먼트가 없으면 true |
| `Hash` | `func (cp *CompiledPath) Hash() uint64` | 컴파일 시 미리 계산한 경로 해시 (FNV-1a) 반환, 커스텀 캐시 키에 사용 가능 |
| `Path` | `func (cp *CompiledPath) Path() string` | 컴파일할 때의 원본 경로 문자열 반환 |
| `String` | `func (cp *CompiledPath) String() string` | `Path` 와 동등한 문자열 표현 |
| `Segments` | `func (cp *CompiledPath) Segments() []PathSegment` | 파싱된 경로 세그먼트 반환 (아래 PathSegment 절 참조) |
| `Release` | `func (cp *CompiledPath) Release()` | 객체 풀로 반환; 호출 후 이 인스턴스를 다시 사용하면 안 됨 |

### 사용 예제

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

	cp, err := p.CompilePath("user.name")
	if err != nil {
		panic(err)
	}
	defer cp.Release()

	// 원시 JSON 바이트에서 바로 값 가져오기, Go 값으로 먼저 파싱할 필요 없음
	val, err := cp.GetFromRaw([]byte(`{"user": {"name": "CyberGo"}}`))
	if err != nil {
		panic(err)
	}
	fmt.Println(val) // 출력: CyberGo
}
```

::: tip GetFromRaw 와 PreParse 의 선택 기준
`GetFromRaw` 는 호출할 때마다 입력 바이트를 완전히 역직렬화하므로 일회성 쿼리에 적합합니다; 같은 문서를 여러 번 쿼리할 때는 `PreParse` 로 `ParsedJSON` 을 얻어 `Get` 을 호출하거나 `GetFromParsed` 를 직접 사용해 중복 파싱을 피하세요.
:::

---

## PathSegment - 경로 세그먼트

`PathSegment` 는 파싱된 개별 경로 세그먼트를 나타내며, [`PathParser`](./interfaces#pathparser) 인터페이스의 `ParsePath` 메서드가 반환하는 요소이기도 하고 `CompiledPath` 의 `Segments` 메서드로도 얻을 수 있습니다.

### 타입 정의

```go
type PathSegment = internal.PathSegment
```

::: warning 내부 구현 별칭
`CompiledPath` 와 마찬가지로 `PathSegment` 는 `internal.PathSegment` 의 타입 별칭입니다: 필드 타입 PathSegmentType, PathSegmentFlags 와 세그먼트 타입 상수 (PropertySegment 등) 는 루트 패키지에서 익스포트되지 않았습니다. 세그먼트 타입 판단은 `TypeString`, `IsArrayAccess` 등의 접근 메서드를 사용하고, `Type` 필드를 내부 상수와 직접 비교하지 마세요.
:::

### 필드 설명

| 필드 | 타입 | 설명 |
|------|------|------|
| `Type` | PathSegmentType | 세그먼트 타입 열거 (속성/배열 인덱스/슬라이스/와일드카드 등; 판단은 `TypeString` 사용) |
| `Key` | `string` | 속성 세그먼트와 추출 세그먼트가 사용하는 키 이름 |
| `Index` | `int` | 배열 인덱스 세그먼트의 첨자; 슬라이스 세그먼트의 시작값 (설정 여부는 `HasStart`) |
| `End` | `int` | 슬라이스 세그먼트의 끝값 (설정 여부는 `HasEnd`) |
| `Step` | `int` | 슬라이스 세그먼트의 보폭 (설정 여부는 `HasStep`) |
| `Flags` | PathSegmentFlags | 비트 플래그로, 음수 인덱스, 와일드카드, 평면 추출 및 시작/끝/보폭 설정 여부를 기록 |

### 메서드

| 메서드 | 시그니처 | 설명 |
|------|------|------|
| `TypeString` | `func (ps PathSegment) TypeString() string` | 세그먼트 타입 이름: `property` / `array` / `slice` / `wildcard` / `recursive` / `filter` / `extract` / `append` |
| `String` | `func (ps PathSegment) String() string` | 세그먼트의 경로 표현 (예: `name`, `[0]`, `[1:3]`, `[*]`) |
| `IsArrayAccess` | `func (ps PathSegment) IsArrayAccess() bool` | 배열 인덱스, 슬라이스 또는 와일드카드 세그먼트면 true |
| `IsWildcardSegment` | `func (ps *PathSegment) IsWildcardSegment() bool` | 와일드카드 세그먼트 (`[*]`) 면 true |
| `IsFlatExtract` | `func (ps *PathSegment) IsFlatExtract() bool` | 평면 추출 세그먼트면 true |
| `IsNegativeIndex` | `func (ps *PathSegment) IsNegativeIndex() bool` | 배열 인덱스가 음수 (예: `[-1]`) 면 true |
| `HasStart` | `func (ps *PathSegment) HasStart() bool` | 슬라이스 세그먼트에 시작값이 설정되었는지 |
| `HasEnd` | `func (ps *PathSegment) HasEnd() bool` | 슬라이스 세그먼트에 끝값이 설정되었는지 |
| `HasStep` | `func (ps *PathSegment) HasStep() bool` | 슬라이스 세그먼트에 보폭이 설정되었는지 |
| `GetStart` | `func (ps *PathSegment) GetStart() (int, bool)` | 시작값과 설정 여부 반환 (미설정이면 0, false) |
| `GetEnd` | `func (ps *PathSegment) GetEnd() (int, bool)` | 끝값과 설정 여부 반환 |
| `GetStep` | `func (ps *PathSegment) GetStep() (int, bool)` | 보폭과 설정 여부 반환 |
| `GetArrayIndex` | `func (ps PathSegment) GetArrayIndex(arrayLength int) (int, error)` | 배열 첨자 해석: 음수 인덱스는 양수로 환산 (`-1` 이 마지막 요소), 범위 초과나 배열 인덱스 세그먼트가 아니면 error 반환 |

### 사용 예제

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

	cp, err := p.CompilePath("users[0].name")
	if err != nil {
		panic(err)
	}
	defer cp.Release()

	// Segments 는 파싱된 경로 세그먼트 반환
	for _, seg := range cp.Segments() {
		fmt.Printf("세그먼트 %s (%s)\n", seg.String(), seg.TypeString())
	}

	// 배열 인덱스 세그먼트: GetArrayIndex 로 실제 첨자 해석 (음수 인덱스는 양수로 환산, 범위 초과 시 error)
	arrSeg := cp.Segments()[1]
	idx, err := arrSeg.GetArrayIndex(1)
	if err != nil {
		panic(err)
	}
	fmt.Println("배열 첨자:", idx)
	// 출력:
	// 세그먼트 users (property)
	// 세그먼트 [0] (array)
	// 세그먼트 name (property)
	// 배열 첨자: 0
}
```

---

## AccessResult - 속성 접근 결과

`AccessResult` 는 안전한 속성 접근 결과로, 체이닝 타입 변환을 제공합니다.

### 구조 정의

```go
type AccessResult struct {
	Value  any    // 결과 값
	Exists bool   // 경로 존재 여부
	Type   string // 런타임 타입 정보 (디버깅용)
}
```

### 필드 설명

| 필드 | 타입 | 설명 |
|------|------|------|
| `Value` | `any` | 결과 값 |
| `Exists` | `bool` | 경로 존재 여부 |
| `Type` | `string` | 런타임 타입 정보 (디버깅용) |

### 생성 메서드

#### Processor.SafeGet

시그니처: `func (p *Processor) SafeGet(jsonStr, path string, cfg ...Config) AccessResult`

속성을 안전하게 가져와 체이닝 타입 변환에 사용할 `AccessResult` 를 반환합니다.

패키지 레벨 함수 `SafeGet` 도 사용할 수 있습니다:

시그니처: `func SafeGet(jsonStr, path string, cfg ...Config) AccessResult`

```go
processor, err := json.New()
if err != nil {
	panic(err)
}
defer processor.Close()

result := processor.SafeGet(data, "user.age")

if !result.Exists {
	fmt.Println("경로가 존재하지 않음")
	return
}

// 타입 확인
fmt.Println("타입:", result.Type)
```

### 체이닝 타입 변환 메서드

| 메서드 | 반환 타입 | 설명 |
|------|----------|------|
| `Unwrap()` | `any` | 값 반환, 없으면 nil |
| `UnwrapOr(defaultValue)` | `any` | 값 또는 기본값 반환 |
| `AsString()` | `(string, error)` | 문자열로 변환 (엄격한 타입 검사) |
| `AsStringConverted()` | `(string, error)` | 포맷팅하여 문자열로 변환 |
| `AsInt()` | `(int, error)` | 정수로 변환 (bool 은 변환 안 함) |
| `AsFloat64()` | `(float64, error)` | float64 로 변환 (bool 은 변환 안 함) |
| `AsBool()` | `(bool, error)` | 불리언으로 변환 |
| `Ok()` | `bool` | 경로 존재 여부 검사 |

::: warning 주의
`AsInt64()`, `AsArray()`, `AsObject()` 메서드는 제거되었습니다. 이 타입들이 필요하면 `GetTyped[T]` 를 사용하세요.
:::

```go
result := processor.SafeGet(data, "user.profile")

// 체인 호출
name, _ := result.AsString()
email, _ := result.AsString()
age, _ := result.AsInt()
price, _ := result.AsFloat64()
active, _ := result.AsBool()

// 배열이나 객체 타입이 필요하면 GetTyped 사용
arr := json.GetTyped[[]any](data, "items")
obj := json.GetTyped[map[string]any](data, "user.profile")
```

### 사용 예제

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	data := `{"user": {"name": "Alice", "age": 30, "active": true}}`

	// 안전하게 가져와 변환
	result := processor.SafeGet(data, "user.age")

	// AccessResult 메서드로 바로 사용
	age, err := result.AsInt()
	if err != nil {
		panic(err)
	}
	fmt.Printf("나이: %d\n", age)

	// 존재하지 않는 경로 가져오기
	missing := processor.SafeGet(data, "user.nickname")
	if !missing.Exists {
		fmt.Println("닉네임이 존재하지 않음")
	}
}
```

---

## Schema - JSON Schema 타입

`Schema` 는 JSON 데이터의 구조 검증 규칙을 정의하는 데 사용하며, JSON Schema Draft 7 의 하위 집합을 지원합니다.

### 구조 정의

```go
type Schema struct {
	Type                 string             `json:"type,omitempty"`
	Properties           map[string]*Schema `json:"properties,omitempty"`
	Items                *Schema            `json:"items,omitempty"`
	Required             []string           `json:"required,omitempty"`
	MinLength            int                `json:"minLength,omitempty"`
	MaxLength            int                `json:"maxLength,omitempty"`
	Minimum              float64            `json:"minimum,omitempty"`
	Maximum              float64            `json:"maximum,omitempty"`
	Pattern              string             `json:"pattern,omitempty"`
	Format               string             `json:"format,omitempty"`
	AdditionalProperties bool               `json:"additionalProperties,omitempty"`
	MinItems             int                `json:"minItems,omitempty"`
	MaxItems             int                `json:"maxItems,omitempty"`
	UniqueItems          bool               `json:"uniqueItems,omitempty"`
	Enum                 []any              `json:"enum,omitempty"`
	Const                any                `json:"const,omitempty"`
	MultipleOf           float64            `json:"multipleOf,omitempty"`
	ExclusiveMinimum     bool               `json:"exclusiveMinimum,omitempty"`
	ExclusiveMaximum     bool               `json:"exclusiveMaximum,omitempty"`
	Title                string             `json:"title,omitempty"`
	Description          string             `json:"description,omitempty"`
	Default              any                `json:"default,omitempty"`
	Examples             []any              `json:"examples,omitempty"`
}
```

### Schema 생성

#### 직접 구성

```go
schema := &json.Schema{
	Type:     "object",
	Required: []string{"name", "email"},
	Properties: map[string]*json.Schema{
		"name":  {Type: "string"},
		"email": {Type: "string", Format: "email"},
		"age":   {Type: "number"},
	},
}
```

::: warning 두 가지 엄격한 제한
- `Type` 은 `object`/`array`/`string`/`number`/`boolean`/`null` 여섯 가지만 지원합니다 — JSON Schema 의 `integer` 는 **지원되지 않습니다** (정수도 `float64` 로 파싱되므로 `"number"` 를 쓰세요).
- `MinLength`/`MaxLength`/`Minimum`/`Maximum`/`MinItems`/`MaxItems`/`ExclusiveMinimum`/`ExclusiveMaximum` 은 구조체 리터럴로 값을 넣어도 **적용되지 않으며**, 반드시 `NewSchemaWithConfig` 의 포인터 필드로 활성화해야 합니다. 자세한 내용은 [Schema 검증](./schema#schema-생성-방식) 을 참조하세요.
:::

#### NewSchemaWithConfig 사용

```go
cfg := json.DefaultSchemaConfig()
cfg.Type = "object"
cfg.Required = []string{"name", "email"}
schema := json.NewSchemaWithConfig(cfg)
```

#### DefaultSchema 사용

시그니처: `func DefaultSchema() *Schema`

기본 설정을 포함한 빈 Schema 인스턴스를 반환합니다.

```go
schema := json.DefaultSchema()
schema.Type = "object"
schema.Required = []string{"id"}
```

### SchemaConfig 구조

```go
type SchemaConfig struct {
	Type                 string
	Properties           map[string]*Schema
	Items                *Schema
	Required             []string
	MinLength            *int
	MaxLength            *int
	Minimum              *float64
	Maximum              *float64
	Pattern              string
	Format               string
	AdditionalProperties *bool
	MinItems             *int
	MaxItems             *int
	UniqueItems          bool
	Enum                 []any
	Const                any
	MultipleOf           *float64
	ExclusiveMinimum     *bool
	ExclusiveMaximum     *bool
	Title                string
	Description          string
	Default              any
	Examples             []any
}
```

| 필드 분류 | 필드 | 타입 | 설명 |
|----------|------|------|------|
| 직접 필드 | `Type`/`Pattern`/`Format`/`UniqueItems`/`Enum`/`Const`/`Title`/`Description`/`Default`/`Examples` | 값 타입 | 바로 할당하면 적용 |
| 구조 필드 | `Properties`/`Items`/`Required` | 값 타입 | 하위 Schema, 필수 속성 |
| 포인터 필드 | `MinLength`/`MaxLength`/`Minimum`/`Maximum`/`MinItems`/`MaxItems`/`MultipleOf`/`ExclusiveMinimum`/`ExclusiveMaximum` | `*int`/`*float64`/`*bool` | **nil 이 아닐 때만 해당 제약 활성화** (포인터를 쓰는 이유는 '미설정'과 '제로값'을 구분하기 위함) |
| 포인터 필드 | `AdditionalProperties` | `*bool` | nil 이 아니면 적용; nil 이면 기본 `true` |

#### DefaultSchemaConfig

시그니처: `func DefaultSchemaConfig() SchemaConfig`

기본값을 갖춘 SchemaConfig 를 반환합니다 (`AdditionalProperties` 가 true 를 가리키고 나머지는 제로값).

```go
cfg := json.DefaultSchemaConfig()
cfg.Type = "object"
cfg.Required = []string{"name", "email"}
schema := json.NewSchemaWithConfig(cfg)
```

### 사용 예제

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// 길이/구간 제약은 NewSchemaWithConfig 의 포인터 필드로 활성화
	minLen, maxLen := 1, 100
	minAge, maxAge := 0.0, 150.0

	nameCfg := json.DefaultSchemaConfig()
	nameCfg.Type = "string"
	nameCfg.MinLength = &minLen
	nameCfg.MaxLength = &maxLen

	ageCfg := json.DefaultSchemaConfig()
	ageCfg.Type = "number" // 숫자는 모두 "number" 사용 ("integer" 미지원)
	ageCfg.Minimum = &minAge
	ageCfg.Maximum = &maxAge

	schema := &json.Schema{
		Type:     "object",
		Required: []string{"name", "email"},
		Properties: map[string]*json.Schema{
			"name":  json.NewSchemaWithConfig(nameCfg),
			"email": {Type: "string", Format: "email"},
			"age":   json.NewSchemaWithConfig(ageCfg),
		},
	}

	// JSON 검증
	data := `{"name": "Alice", "email": "alice@example.com", "age": 30}`
	errors, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}

	if len(errors) > 0 {
		for _, e := range errors {
			fmt.Printf("검증 오류 [%s]: %s\n", e.Path, e.Message)
		}
	} else {
		fmt.Println("검증 통과")
	}
	// 출력: 검증 통과
}
```

---

## ValidationError

Schema 검증 오류 타입입니다.

### 구조 정의

```go
type ValidationError struct {
	Path    string `json:"path"`    // 오류가 발생한 경로
	Message string `json:"message"` // 오류 메시지
}
```

### 필드 설명

| 필드 | 타입 | 설명 |
|------|------|------|
| `Path` | `string` | 검증 오류가 발생한 JSON 경로 |
| `Message` | `string` | 검증 실패를 설명하는 메시지 |

### 메서드

#### Error

시그니처: `func (ve *ValidationError) Error() string`

error 인터페이스를 구현합니다.

```go
for _, e := range errors {
	fmt.Println(e.Error())
}
```

---

## BatchOperation

배치 작업 정의로, `ProcessBatch` 의 입력 단위입니다.

### 구조 정의

```go
type BatchOperation struct {
	Type    string `json:"type"`     // 작업 타입: "get", "set", "delete", "validate"
	JSONStr string `json:"json_str"` // JSON 데이터 문자열
	Path    string `json:"path"`     // 대상 경로
	Value   any    `json:"value"`    // set 작업의 값
	ID      string `json:"id"`       // 작업 식별자
}
```

### 필드 설명

| 필드 | 타입 | 설명 |
|------|------|------|
| `Type` | `string` | 작업 타입, `"get"`, `"set"`, `"delete"`, `"validate"` 만 지원; 다른 값은 대응 `BatchResult.Error` 에 `unknown operation type` 보고 |
| `JSONStr` | `string` | 이 작업이 적용되는 대상 JSON 문자열 (각 작업이 독립적으로 보유) |
| `Path` | `string` | 대상 경로 |
| `Value` | `any` | `"set"` 작업만 사용, 기록할 값 |
| `ID` | `string` | 작업 식별자, `BatchResult.ID` 에 그대로 채워져 결과 대조에 사용 |

::: tip 배치 상한
`ProcessBatch` 의 작업 수가 `Config.MaxBatchSize` (기본 2000) 를 초과하면 전체가 `ErrSizeLimit` 오류를 반환합니다; `"validate"` 작업의 `BatchResult.Result` 는 `map[string]any{"valid": bool}` 입니다.
:::

---

## BatchResult

배치 작업 결과입니다.

### 구조 정의

```go
type BatchResult struct {
	ID     string `json:"id"`     // 작업 식별자 (BatchOperation.ID 에 대응)
	Result any    `json:"result"` // 작업 결과
	Error  error  `json:"error"`  // 오류 (있는 경우)
}
```

### 필드 설명

| 필드 | 타입 | 설명 |
|------|------|------|
| `ID` | `string` | `BatchOperation.ID` 에 대응, 입력 순서와 일대일 대응 |
| `Result` | `any` | 작업 결과; `"get"` 은 가져온 값, `"set"`/`"delete"` 는 수정된 JSON 문자열, `"validate"` 는 `map[string]any{"valid": bool}` |
| `Error` | `error` | 해당 단일 작업의 오류; **항목별로 반환**되며 한 건 실패로 배치 전체가 중단되지 않음 (계속 여부는 구현 내부에서 항목별 실행) |

---

## WarmupResult

캐시 예열 결과로, `WarmupCache` 가 반환합니다.

### 구조 정의

```go
type WarmupResult struct {
	TotalPaths  int      `json:"total_paths"`            // 총 경로 수
	Successful  int      `json:"successful"`             // 성공적으로 예열한 수
	Failed      int      `json:"failed"`                 // 실패 수
	SuccessRate float64  `json:"success_rate"`           // 성공률
	FailedPaths []string `json:"failed_paths,omitempty"` // 실패 경로 목록
}
```

### 필드 설명

| 필드 | 타입 | 설명 |
|------|------|------|
| `TotalPaths` | `int` | 예열에 제출한 경로 총수 |
| `Successful` | `int` | 성공적으로 캐시에 기록한 경로 수 |
| `Failed` | `int` | 예열에 실패한 경로 수 |
| `SuccessRate` | `float64` | 성공률, **퍼센트 0–100** (0–1 이 아님) |
| `FailedPaths` | `[]string` | 실패 경로 목록 (모두 성공이면 nil) |

::: warning 전체 실패 시 error 반환
`WarmupCache` 는 **모든 경로가 실패**하면 `WarmupResult` 외에 nil 이 아닌 error 도 반환합니다 (마지막 오류 포함); 캐시가 비활성화 (`EnableCache: false`) 되면 바로 오류를 반환합니다.
:::

---

## ParsedJSON

사전 파싱된 JSON 문서로, 여러 쿼리 작업에 재사용할 수 있습니다.

### 구조 정의

`ParsedJSON` 의 내부 필드는 익스포트되지 않으며, 메서드로 접근합니다.

```go
type ParsedJSON struct {
	// 내부 필드 (익스포트되지 않음)
	// Data() 메서드로 파싱된 데이터를 가져옵니다
}
```

### 메서드

| 메서드 | 시그니처 | 설명 |
|------|------|------|
| `Data` | `func (p *ParsedJSON) Data() any` | 기저의 파싱된 데이터 반환; `Release` 이후에는 nil |
| `Release` | `func (p *ParsedJSON) Release()` | 내부 데이터를 nil 로 만들어, `ParsedJSON` 자체가 참조되더라도 파싱 트리가 가비지 컬렉션되게 함 |

```go
processor, err := json.New()
if err != nil {
	panic(err)
}
defer processor.Close()

// JSON 사전 파싱
parsed, err := processor.PreParse(`{"user": {"name": "Alice", "age": 30}}`)
if err != nil {
	panic(err)
}

// 사전 파싱 결과를 여러 번 쿼리
name, _ := processor.GetFromParsed(parsed, "user.name")
age, _ := processor.GetFromParsed(parsed, "user.age")
```

### 사용 시나리오

| 시나리오 | 설명 |
|------|------|
| 고빈도 쿼리 | 같은 JSON 을 여러 번 쿼리할 때 중복 파싱 방지 |
| 배치 경로 조회 | `GetMultiple` 로 여러 경로를 배치 조회 |
| 성능 최적화 | 사전 파싱 후 쿼리 성능이 크게 향상 |

::: tip 성능 힌트
같은 JSON 문자열을 여러 번 쿼리해야 하는 시나리오에서는 `PreParse` 로 사전 파싱하면 중복 파싱 오버헤드를 피해 성능이 크게 향상됩니다.
:::

---

## Stats

프로세서 통계 정보로, 패키지 레벨 `GetStats()` 또는 `Processor.GetStats()` 로 가져옵니다.

### 구조 정의

```go
type Stats struct {
	CacheSize        int64         `json:"cache_size"`        // 현재 캐시 크기
	CacheMemory      int64         `json:"cache_memory"`      // 캐시 메모리 사용량 (바이트)
	MaxCacheSize     int           `json:"max_cache_size"`    // 최대 캐시 크기
	HitCount         int64         `json:"hit_count"`         // 캐시 적중 수
	MissCount        int64         `json:"miss_count"`        // 캐시 미적중 수
	HitRatio         float64       `json:"hit_ratio"`         // 캐시 적중률
	CacheTTL         time.Duration `json:"cache_ttl"`         // 캐시 만료 시간
	CacheEnabled     bool          `json:"cache_enabled"`     // 캐시 활성화 여부
	IsClosed         bool          `json:"is_closed"`         // 프로세서 닫힘 여부
	MemoryEfficiency float64       `json:"memory_efficiency"` // 메모리 효율성
	OperationCount   int64         `json:"operation_count"`   // 총 작업 수
	ErrorCount       int64         `json:"error_count"`       // 총 오류 수
}
```

### 필드 설명

| 필드 | 타입 | 설명 |
|------|------|------|
| `CacheSize` | `int64` | 현재 캐시 항목 수 |
| `CacheMemory` | `int64` | 캐시 메모리 사용량 추정치 (바이트) |
| `MaxCacheSize` | `int` | 설정된 캐시 항목 상한 (`Config.MaxCacheSize`) |
| `HitCount` | `int64` | 캐시 적중 횟수 |
| `MissCount` | `int64` | 캐시 미적중 횟수 |
| `HitRatio` | `float64` | 적중률 (0–1) |
| `CacheTTL` | `time.Duration` | 현재 캐시 항목 TTL |
| `CacheEnabled` | `bool` | 캐시 활성화 여부 |
| `IsClosed` | `bool` | 프로세서 `Close` 여부 |
| `MemoryEfficiency` | `float64` | 메모리 효율성 지표 (0–1) |
| `OperationCount` | `int64` | 프로세서 누적 작업 수 |
| `ErrorCount` | `int64` | 프로세서 누적 오류 수 |

---

## SecurityLimits

`SecurityLimits` 는 Config 의 보안 관련 제한 필드를 모아둔 것으로, 이 필드들의 읽기 전용 스냅숏 뷰입니다 (필드가 일대일로 대응).

### 구조 정의

```go
type SecurityLimits struct {
	MaxNestingDepth           int   `json:"max_nesting_depth"`
	MaxSecurityValidationSize int64 `json:"max_security_validation_size"`
	MaxObjectKeys             int   `json:"max_object_keys"`
	MaxArrayElements          int   `json:"max_array_elements"`
	MaxJSONSize               int64 `json:"max_json_size"`
	MaxPathDepth              int   `json:"max_path_depth"`
}
```

### Config 필드와의 매핑

| SecurityLimits 필드 | 출처 Config 필드 |
|--------------------|------------------|
| `MaxNestingDepth` | `MaxNestingDepthSecurity` |
| `MaxSecurityValidationSize` | `MaxSecurityValidationSize` |
| `MaxObjectKeys` | `MaxObjectKeys` |
| `MaxArrayElements` | `MaxArrayElements` |
| `MaxJSONSize` | `MaxJSONSize` |
| `MaxPathDepth` | `MaxPathDepth` |

이 타입은 라이브러리 내부에서 보안 제한을 취합할 때 사용합니다 (제로값은 nil Config 를 의미); 필드의 의미와 범위는 [Config](./config#config-구조체) 를 참조하세요.

---

## HealthStatus

상태 정보로, 패키지 레벨 `GetHealthStatus()` 또는 `Processor.GetHealthStatus()` 로 가져옵니다.

### 구조 정의

```go
type HealthStatus struct {
	Timestamp time.Time              `json:"timestamp"` // 검사 시간 스탬프
	Healthy   bool                   `json:"healthy"`   // 정상 여부
	Checks    map[string]CheckResult `json:"checks"`    // 각 검사 항목 결과
}
```

### 필드 설명

| 필드 | 타입 | 설명 |
|------|------|------|
| `Timestamp` | `time.Time` | 이번 상태 검사의 시간 스탬프 |
| `Healthy` | `bool` | 전체 상태 결론 (모든 검사 항목 통과 시 true) |
| `Checks` | `map[string]CheckResult` | 각 검사 항목 결과, 키는 검사 항목 이름 |

### CheckResult 구조

단일 상태 검사 결과입니다.

```go
type CheckResult struct {
	Healthy bool   `json:"healthy"` // 해당 검사 항목이 정상인지
	Message string `json:"message"` // 검사 메시지
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `Healthy` | `bool` | 해당 검사 항목 통과 여부 |
| `Message` | `string` | 통과/실패를 설명하는 메시지 |

---

## IterableValue

반복 값 래퍼입니다.

### 메서드 개요

**기본 접근**

| 메서드 | 설명 |
|------|------|
| `Get(path)` | 경로로 값 가져오기 |
| `GetString(path)` | 문자열 가져오기 |
| `GetInt(path)` | 정수 가져오기 |
| `GetFloat64(path)` | 부동소수점 가져오기 |
| `GetBool(path)` | 불리언 가져오기 |
| `GetArray(path)` | 배열 가져오기 |
| `GetObject(path)` | 객체 가져오기 |

**기본값으로 가져오기**

| 메서드 | 설명 |
|------|------|
| `GetWithDefault(path, defaultValue)` | 값 가져오기, 없으면 기본값 반환 |
| `GetStringWithDefault(path, defaultValue)` | 문자열 가져오기, 없으면 기본값 반환 |
| `GetIntWithDefault(path, defaultValue)` | 정수 가져오기, 없으면 기본값 반환 |
| `GetFloat64WithDefault(path, defaultValue)` | 부동소수점 가져오기, 없으면 기본값 반환 |
| `GetBoolWithDefault(path, defaultValue)` | 불리언 가져오기, 없으면 기본값 반환 |

**검사와 순회**

| 메서드 | 설명 |
|------|------|
| `Exists(path)` | 필드 존재 여부 검사 |
| `IsNull(path)` | 지정 경로가 null 인지 검사 |
| `IsNullData()` | 기저 값이 null 인지 검사 |
| `IsEmpty(path)` | 지정 경로가 비어 있는지 검사 |
| `IsEmptyData()` | 기저 값이 비어 있는지 검사 |
| `GetData()` | 기저 원시 데이터 가져오기 |
| `Break()` | 중단 신호 반환, 반복 중지 |
| `ForeachNested(path, fn)` | 중첩 구조 순회 |
| `Release()` | 리소스 해제 |

자세한 내용은 [이터레이터](./iterator) 문서를 참조하세요.

---

## 인코딩 오류 타입

json 패키지는 인코딩/디코딩 과정의 다음 오류 타입을 익스포트하여 정밀한 오류 처리에 사용합니다.

### SyntaxError - 문법 오류

JSON 문법 파싱 오류로, 입력 데이터가 유효한 JSON 형식이 아님을 나타냅니다.

#### 구조 정의

```go
type SyntaxError struct {
	Offset int64 // 오류 발생 위치 (바이트 오프셋)
	// 그 외 익스포트되지 않은 필드 포함
}
```

#### 메서드

| 메서드 | 시그니처 | 설명 |
|------|------|------|
| `Error` | `func (e *SyntaxError) Error() string` | 오프셋 위치를 포함한 오류 설명 반환 |

```go
data := `{invalid json}`
_, err := json.ParseAny(data)
if syntaxErr, ok := err.(*json.SyntaxError); ok {
	fmt.Printf("문법 오류, 오프셋: %d\n", syntaxErr.Offset)
}
```

---

### UnmarshalTypeError - 역직렬화 타입 오류

JSON 값을 대상 Go 타입으로 변환할 수 없을 때 이 오류가 반환됩니다.

#### 구조 정의

```go
type UnmarshalTypeError struct {
	Value  string       // JSON 값의 설명 (예: "string", "number")
	Type   reflect.Type // 대상 Go 타입
	Offset int64        // 오류 발생 위치 (바이트 오프셋)
	Struct string       // 해당 필드를 포함하는 구조체 이름 (있는 경우)
	Field  string       // 필드명 (있는 경우)
	Err    error        // 내부 오류 (있는 경우)
}
```

#### 메서드

| 메서드 | 시그니처 | 설명 |
|------|------|------|
| `Error` | `func (e *UnmarshalTypeError) Error() string` | 타입 불일치 오류 설명 반환 |
| `Unwrap` | `func (e *UnmarshalTypeError) Unwrap() error` | 내부 오류 반환 |

```go
type User struct {
	Age int `json:"age"`
}
var user User
err := json.Unmarshal([]byte(`{"age": "not_a_number"}`), &user)
if typeErr, ok := err.(*json.UnmarshalTypeError); ok {
	fmt.Printf("타입 오류: JSON 값 %s 를 %v 로 변환할 수 없음\n", typeErr.Value, typeErr.Type)
}
```

---

### UnsupportedTypeError - 지원하지 않는 타입 오류

Go 에서 지원하지 않는 타입을 인코딩하려 할 때 이 오류가 반환됩니다.

#### 구조 정의

```go
type UnsupportedTypeError struct {
	Type reflect.Type // 지원하지 않는 Go 타입
}
```

#### 메서드

| 메서드 | 시그니처 | 설명 |
|------|------|------|
| `Error` | `func (e *UnsupportedTypeError) Error() string` | 지원하지 않는 타입 설명 반환 |

```go
type Chan chan int
data := Chan(make(chan int))
_, err := json.Marshal(data)
if unsupportedErr, ok := err.(*json.UnsupportedTypeError); ok {
	fmt.Printf("지원하지 않는 타입: %v\n", unsupportedErr.Type)
}
```

---

### UnsupportedValueError - 지원하지 않는 값 오류

지원하지 않는 값 (예: NaN, Infinity) 을 인코딩하려 할 때 이 오류가 반환됩니다.

#### 구조 정의

```go
type UnsupportedValueError struct {
	Value reflect.Value // 지원하지 않는 값
	Str   string        // 오류 설명
}
```

#### 메서드

| 메서드 | 시그니처 | 설명 |
|------|------|------|
| `Error` | `func (e *UnsupportedValueError) Error() string` | 지원하지 않는 값 설명 반환 |

```go
val := math.NaN()
_, err := json.Marshal(val)
if valErr, ok := err.(*json.UnsupportedValueError); ok {
	fmt.Printf("지원하지 않는 값: %s\n", valErr.Str)
}
```

---

### InvalidUnmarshalError - 유효하지 않은 역직렬화 대상 오류

`Unmarshal` 의 대상 매개변수가 포인터가 아니거나 nil 일 때 이 오류가 반환됩니다.

#### 구조 정의

```go
type InvalidUnmarshalError struct {
	Type reflect.Type // 대상 매개변수의 타입
}
```

#### 메서드

| 메서드 | 시그니처 | 설명 |
|------|------|------|
| `Error` | `func (e *InvalidUnmarshalError) Error() string` | 유효하지 않은 대상 오류 설명 반환 |

```go
var target string                                // 포인터를 전달해야 함
err := json.Unmarshal([]byte(`"hello"`), target) // 오류: 포인터 미전달
if invalidErr, ok := err.(*json.InvalidUnmarshalError); ok {
	fmt.Printf("유효하지 않은 역직렬화 대상: %v\n", invalidErr.Type)
}
```

---

### MarshalerError - 인코더 오류

타입의 `MarshalJSON` 또는 `MarshalText` 메서드가 오류를 반환하면 이 오류로 래핑됩니다.

#### 구조 정의

```go
type MarshalerError struct {
	Type reflect.Type // MarshalJSON 또는 MarshalText 를 구현한 타입
	Err  error        // MarshalJSON 또는 MarshalText 가 반환한 오류
	// 그 외 익스포트되지 않은 필드 포함
}
```

#### 메서드

| 메서드 | 시그니처 | 설명 |
|------|------|------|
| `Error` | `func (e *MarshalerError) Error() string` | 인코더 오류 설명 반환 |
| `Unwrap` | `func (e *MarshalerError) Unwrap() error` | 내부 오류 반환 |

```go
type BadMarshaler struct{}

func (BadMarshaler) MarshalJSON() ([]byte, error) {
	return nil, errors.New("marshal failed")
}

_, err := json.Marshal(BadMarshaler{})
if marshalErr, ok := err.(*json.MarshalerError); ok {
    fmt.Printf("인코더 오류 (타입: %v): %v\n", marshalErr.Type, marshalErr.Err)
}
```

---

## Encoder (JSON 인코더)

`Encoder` 는 JSON 값을 출력 스트림에 기록합니다. `encoding/json.Encoder` 와 100% 호환됩니다.

### 생성

시그니처: `func NewEncoder(w io.Writer, cfg ...Config) *Encoder`

`w` 에 기록하는 인코더를 생성합니다. 선택적 `Config` 매개변수로 인코딩 동작을 커스터마이즈할 수 있습니다.

```go
file, _ := os.Create("output.json")
defer file.Close()

encoder := json.NewEncoder(file)
err := encoder.Encode(map[string]any{"name": "Alice"})
```

### 메서드

| 메서드 | 시그니처 | 설명 |
|------|------|------|
| `Encode` | `func (enc *Encoder) Encode(v any) error` | Go 값을 JSON 으로 인코딩해 스트림에 기록 |
| `SetEscapeHTML` | `func (enc *Encoder) SetEscapeHTML(on bool)` | HTML 특수 문자 이스케이프 여부 설정 |
| `SetIndent` | `func (enc *Encoder) SetIndent(prefix, indent string)` | 들여쓰기 형식 설정 |

### 사용 예제

```go
package main

import (
	"bytes"
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	var buf bytes.Buffer
	encoder := json.NewEncoder(&buf)
	encoder.SetIndent("", "  ")
	encoder.SetEscapeHTML(true)

	err := encoder.Encode(map[string]any{
		"name":  "Alice",
		"email": "alice@example.com",
	})
	if err != nil {
		panic(err)
	}
	fmt.Println(buf.String())
}
```

---

## Decoder (JSON 디코더)

`Decoder` 는 입력 스트림에서 JSON 값을 읽어 디코딩합니다. `encoding/json.Decoder` 와 100% 호환됩니다.

### 생성

시그니처: `func NewDecoder(r io.Reader, cfg ...Config) *Decoder`

`r` 에서 읽는 디코더를 생성합니다. 선택적 `Config` 매개변수를 지원합니다.

```go
file, _ := os.Open("data.json")
defer file.Close()

decoder := json.NewDecoder(file)
for decoder.More() {
	var obj map[string]any
	if err := decoder.Decode(&obj); err != nil {
		break
	}
	fmt.Println(obj)
}
```

### 메서드

| 메서드 | 시그니처 | 설명 |
|------|------|------|
| `Decode` | `func (dec *Decoder) Decode(v any) error` | 스트림에서 다음 JSON 값을 읽어 디코딩 |
| `UseNumber` | `func (dec *Decoder) UseNumber()` | 디코더가 숫자를 `float64` 대신 `Number` 로 파싱하게 함 |
| `DisallowUnknownFields` | `func (dec *Decoder) DisallowUnknownFields()` | 디코딩 중 알 수 없는 필드를 만나면 오류 반환 |
| `Buffered` | `func (dec *Decoder) Buffered() io.Reader` | 디코더 버퍼에 남은 데이터의 Reader 반환 |
| `InputOffset` | `func (dec *Decoder) InputOffset() int64` | 현재 입력 위치의 오프셋 반환 |
| `More` | `func (dec *Decoder) More() bool` | 스트림에 더 많은 JSON 값이 있는지 검사 |
| `Token` | `func (dec *Decoder) Token() (Token, error)` | 다음 JSON token 읽기 |

### 사용 예제

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"strings"
)

func main() {
	input := `{"name":"Alice","age":30}{"name":"Bob","age":25}`
	decoder := json.NewDecoder(strings.NewReader(input))

	for decoder.More() {
		var person map[string]any
		if err := decoder.Decode(&person); err != nil {
			break
		}
		fmt.Printf("이름: %s, 나이: %v\n", person["name"], person["age"])
	}
}
```

### 스트리밍 디코딩 예제

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"strings"
)

func main() {
	// JSON 스트림의 여러 값 디코딩
	input := `[1,2,3][4,5,6]`
	decoder := json.NewDecoder(strings.NewReader(input))

	for decoder.More() {
		var arr []any
		if err := decoder.Decode(&arr); err != nil {
			panic(err)
		}
		fmt.Println(arr)
	}
}
```

### Token 읽기 예제

```go
decoder := json.NewDecoder(strings.NewReader(`{"name":"Alice"}`))
for {
	token, err := decoder.Token()
	if err != nil {
		break
	}
	switch v := token.(type) {
	case json.Delim:
		fmt.Printf("구분자: %s\n", string(v))
	case string:
		fmt.Printf("문자열: %s\n", v)
	case float64:
		fmt.Printf("숫자: %v\n", v)
	case bool:
		fmt.Printf("불리언: %v\n", v)
	case nil:
		fmt.Println("null")
	}
}
```

---

## Token - JSON Token

`Token` 은 JSON token 값으로, 다음 타입 중 하나를 담습니다:

- `Delim`, 네 개의 JSON 구분자 `[ ] { }`
- `bool`, JSON 불리언
- `float64`, JSON 숫자
- `Number`, `UseNumber` 활성화 시의 JSON 숫자
- `string`, JSON 문자열
- `nil`, JSON null

```go
type Token any
```

`Decoder.Token()` 으로 가져옵니다.

---

## Number - JSON 숫자

`Number` 는 JSON 숫자 문자열을 나타내며, `UseNumber` 모드 활성화 시 Decoder 가 사용합니다.

```go
type Number string
```

### 메서드

| 메서드 | 시그니처 | 설명 |
|------|------|------|
| `String` | `func (n Number) String() string` | 숫자의 문자열 표현 반환 |
| `Float64` | `func (n Number) Float64() (float64, error)` | float64 로 변환 |
| `Int64` | `func (n Number) Int64() (int64, error)` | int64 로 변환 |

```go
decoder := json.NewDecoder(strings.NewReader(`{"price": 19.99}`))
decoder.UseNumber()
var obj map[string]any
decoder.Decode(&obj)

if num, ok := obj["price"].(json.Number); ok {
	f, _ := num.Float64()
	fmt.Println(f) // 19.99
}
```

---

## Delim - JSON 구분자

`Delim` 은 JSON 구분자 타입으로, `[`, `]`, `{`, `}` 네 문자에 대응합니다.

```go
type Delim rune
```

### 메서드

#### String

시그니처: `func (d Delim) String() string`

구분자의 문자열 표현을 반환합니다.

```go
token, _ := decoder.Token()
if delim, ok := token.(json.Delim); ok {
	fmt.Println(delim.String()) // "[" 또는 "{" 등
}
```

---

## 관련 문서

- [패키지 함수](./functions/) - 패키지 레벨 함수 레퍼런스
- [Config](./config) - 설정 옵션
- [Processor](./processor/) - 프로세서 메서드
- [인터페이스 정의](./interfaces) - 확장 인터페이스
