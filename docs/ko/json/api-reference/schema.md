---
sidebar_label: "Schema 검증"
title: "Schema 검증 - CyberGo JSON | JSON Schema 검증 가이드"
description: "CyberGo JSON Schema 검증: ValidateSchema 사용법, Schema 제약 필드, Format 형식 검사, ValidationError 오류 처리와 NewSchemaWithConfig 생성 방식으로 객체·문자열·숫자·배열을 검증합니다."
sidebar_position: 4.5
---

# Schema 검증

json 라이브러리는 JSON Schema 기반의 데이터 검증 기능을 제공합니다: 데이터가 만족해야 할 구조와 제약을 기술한 `Schema` 를 정의하고, `ValidateSchema` 로 JSON 을 검증합니다. 현재 버전에서 **기능이 완전한** 검증 시스템입니다.

## ValidateSchema 함수

`ValidateSchema` 는 JSON 문자열을 `Schema` 와 대조 검증하여 제약 위반 목록 전체를 반환합니다:

```go
// 패키지 레벨 함수
func ValidateSchema(jsonStr string, schema *Schema, cfg ...Config) ([]ValidationError, error)

// Processor 메서드
func (p *Processor) ValidateSchema(jsonStr string, schema *Schema, cfg ...Config) ([]ValidationError, error)
```

반환값 의미:

| 반환값 | 의미 |
|--------|------|
| `([]ValidationError{}, nil)` | JSON 이 유효하고 **모든 제약을 만족** |
| `([]ValidationError{...}, nil)` | JSON 은 파싱되지만 제약 위반이 있음 (슬라이스가 비어 있지 않음) |
| `(nil, error)` | 파싱 또는 사전 단계 실패 (JSON 이 잘못됨, `schema` 가 nil, 한도 초과 등) |

::: tip 핵심 구분
제약 위반은 **슬라이스 반환**으로 표현됩니다 (`error` 는 여전히 `nil`); 파싱 실패, `schema` 가 nil, 크기 제한 초과 등의 경우에만 nil 이 아닌 `error` 를 반환합니다. 따라서 '검증을 통과했는지'는 `err != nil` 이 아니라 `len(errs) == 0` 으로 판단해야 합니다.
:::

## 기본 예제: 객체 구조와 필수 필드

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
			"age":   {Type: "number"},
		},
	}

	// 필수 필드 email 이 없음
	data := `{"name":"Alice","age":30}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// 출력: email: required property 'email' is missing
}
```

## Schema 제약 필드 한눈 보기

`Schema` 가 지원하는 제약 필드 (분류별):

| 분류 | 필드 | 타입 | 적용 타입 | 설명 |
|------|------|------|----------|------|
| 구조 | `Type` | `string` | 모두 | 값은 아래 표 참조 |
| 구조 | `Required` | `[]string` | object | 반드시 있어야 하는 속성명 목록 |
| 구조 | `Properties` | `map[string]*Schema` | object | 각 속성에 대응하는 하위 Schema |
| 구조 | `Items` | `*Schema` | array | 요소에 대응하는 하위 Schema |
| 구조 | `AdditionalProperties` | `bool` | object | `true` 면 추가 속성 허용, `false` 면 거부 |
| 문자열 | `MinLength` / `MaxLength` | `int` | string | 길이 구간 (rune 개수 기준) |
| 문자열 | `Pattern` | `string` | string | 정규 표현식 |
| 문자열 | `Format` | `string` | string | 의미적 형식 ([Format 값 표](#지원하는-format-값) 참조) |
| 숫자 | `Minimum` / `Maximum` | `float64` | number | 값의 구간 |
| 숫자 | `ExclusiveMinimum` / `ExclusiveMaximum` | `bool` | number | 경계값 제외 |
| 숫자 | `MultipleOf` | `float64` | number | 해당 값의 배수여야 함 |
| 배열 | `MinItems` / `MaxItems` | `int` | array | 요소 수 구간 |
| 배열 | `UniqueItems` | `bool` | array | `true` 면 요소가 유일해야 함 |
| 값 | `Enum` | `[]any` | 모두 | 허용되는 열거값 목록 |
| 값 | `Const` | `any` | 모두 | 이 고정값과 같아야 함 |
| 메타 | `Title` / `Description` | `string` | — | 문서용 메타데이터, 검증에 참여하지 않음 |
| 메타 | `Default` | `any` | — | 문서용 메타데이터, 검증에 참여하지 않음 |
| 메타 | `Examples` | `[]any` | — | 문서용 메타데이터, 검증에 참여하지 않음 |

`Type` 이 지원하는 값: `object`, `array`, `string`, `number`, `boolean`, `null`.

::: warning 숫자 타입은 "number" 사용
JSON 파싱 후 모든 숫자 (정수 포함) 는 `float64` 이므로 숫자 필드는 `Type: "number"` 를 사용해야 합니다. JSON Schema Draft 7 의 `integer` 값은 **지원되지 않습니다** — `"integer"` 로 쓰면 모든 값이 `expected type integer` 오류를 냅니다. `Minimum`/`Maximum`/`MultipleOf` 등 숫자 제약도 `Type` 이 `number` 일 때만 적용됩니다.
:::

## 객체 제약: Required / Properties / AdditionalProperties

`AdditionalProperties` 는 `Properties` 에 선언되지 않은 속성의 등장을 허용할지 제어합니다. 구조체 리터럴로 `Schema` 를 직접 구성하면 이 필드의 기본값은 `false` 입니다 (추가 속성 거부):

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	schema := &json.Schema{
		Type:     "object",
		Required: []string{"name"},
		Properties: map[string]*json.Schema{
			"name":  {Type: "string"},
			"email": {Type: "string"},
		},
		// AdditionalProperties 미설정, 구조체 리터럴은 기본 false → 추가 속성 거부
	}

	// "extra" 는 Properties 에 선언되지 않음
	data := `{"name":"Alice","extra":"x"}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// 출력: extra: additional property 'extra' is not allowed
}
```

::: tip 추가 속성 허용
추가 속성을 허용하려면 `AdditionalProperties` 를 `true` 로 설정하거나 [`DefaultSchema()`](#schema-생성-방식) 로 구성하세요 (기본 `AdditionalProperties` 가 true).
:::

## 문자열 제약: MinLength / MaxLength / Pattern / Format

`MinLength`, `MaxLength`, `Minimum`, `Maximum`, `MinItems`, `MaxItems` 등 제약은 **`NewSchemaWithConfig` 로 생성할 때만 적용**됩니다 (이유는 [생성 방식](#schema-생성-방식) 참조). 아래 예제는 `SchemaConfig` 의 포인터 필드로 길이를 설정하고 `Pattern` 으로 소문자로 제한합니다:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	nameCfg := json.DefaultSchemaConfig()
	nameCfg.Type = "string"
	minLen, maxLen := 3, 10
	nameCfg.MinLength = &minLen
	nameCfg.MaxLength = &maxLen
	nameCfg.Pattern = `^[a-z]+$`
	nameSchema := json.NewSchemaWithConfig(nameCfg)

	schema := &json.Schema{
		Type:     "object",
		Required: []string{"name"},
		Properties: map[string]*json.Schema{
			"name": nameSchema,
		},
	}

	// "AB": 길이 부족 + 대문자 포함
	data := `{"name":"AB"}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// 출력:
	// name: string length 2 is less than minimum 3
	// name: string 'AB' does not match pattern '^[a-z]+$'
}
```

`Pattern` 은 첫 검증 시 지연 컴파일되어 캐시되므로 같은 `*Schema` 를 동시 검증에 안전하게 사용할 수 있습니다. 정규식 자체가 잘못되었다면 매 검증마다 그 컴파일 오류를 보고합니다.

## 숫자 제약: Minimum / Maximum / MultipleOf

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	ageCfg := json.DefaultSchemaConfig()
	ageCfg.Type = "number"
	minVal, maxVal := 0.0, 120.0
	ageCfg.Minimum = &minVal
	ageCfg.Maximum = &maxVal
	mult := 5.0
	ageCfg.MultipleOf = &mult
	ageSchema := json.NewSchemaWithConfig(ageCfg)

	schema := &json.Schema{
		Type: "object",
		Properties: map[string]*json.Schema{
			"age": ageSchema,
		},
	}

	// 148: 상한 120 초과 + 5 의 배수 아님
	data := `{"age":148}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// 출력:
	// age: number 148 exceeds maximum 120
	// age: number 148 is not a multiple of 5
}
```

`ExclusiveMinimum` / `ExclusiveMaximum` 는 `Minimum` / `Maximum` 과 함께 `SchemaConfig` (역시 포인터 필드) 로 설정해야 하며, 경계값 자체를 제외하는 데 사용합니다. `MultipleOf` 는 부동소수점 허용 오차 비교 (epsilon 1e-9) 를 사용해 `0.1 + 0.2` 같은 IEEE 754 정밀도 시나리오에서 오탐이 없습니다.

## 배열 제약: Items / MinItems / MaxItems / UniqueItems

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	tagsCfg := json.DefaultSchemaConfig()
	tagsCfg.Type = "array"
	minItems, maxItems := 1, 3
	tagsCfg.MinItems = &minItems
	tagsCfg.MaxItems = &maxItems
	tagsCfg.UniqueItems = true
	tagsCfg.Items = &json.Schema{Type: "string"}
	tagsSchema := json.NewSchemaWithConfig(tagsCfg)

	schema := &json.Schema{
		Type: "object",
		Properties: map[string]*json.Schema{
			"tags": tagsSchema,
		},
	}

	// 요소 4 개 (상한 3 초과) + "a" 중복
	data := `{"tags":["a","a","b","c"]}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// 출력:
	// tags: array length 4 exceeds maximum 3
	// tags[1]: duplicate item found: a
}
```

`Items` 는 각 요소가 만족해야 할 하위 Schema 를 지정합니다 (위 예제는 문자열로 제한); `UniqueItems` 는 '**동적 타입 + 값**'을 결합해 중복을 판정합니다 — `[1, "1"]` 은 서로 다른 두 요소로 취급되며, 진짜로 중복된 값만 오류가 납니다.

::: tip 재귀 깊이 보호
`Schema` 는 재귀 타입이라 검증 시 재귀 깊이에 상한 보호가 있습니다 (`DefaultMaxNestingDepth` = 200). 자기 참조 Schema (예: `s.Items = s`) 로도 스택 오버플로가 나지 않으며, 상한을 넘으면 `schema nesting exceeds maximum depth` 오류가 하나 산출됩니다.
:::

## 열거와 상수: Enum / Const

`Enum` 은 값이 그중 하나에 적중해야 함을, `Const` 는 특정 고정값과 같아야 함을 제한합니다. 둘 다 직접 비교로 적용되며 `NewSchemaWithConfig` 가 필요 없습니다:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	schema := &json.Schema{
		Type: "object",
		Properties: map[string]*json.Schema{
			"role":   {Enum: []any{"admin", "user", "guest"}},
			"status": {Const: "active"},
		},
	}

	// role 이 열거에 없음; status 는 상수와 일치
	data := `{"role":"superuser","status":"active"}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// 출력: role: value 'superuser' is not in allowed enum values: [admin user guest]
}
```

## 지원하는 Format 값

`Format` 필드가 지원하는 의미적 형식 (알 수 없는 형식은 조용히 건너뜁니다: 오류 없음, 해당 검증도 하지 않음):

| Format | 검증 규칙 |
|--------|----------|
| `email` | 로컬 파트, 도메인, TLD 구조와 길이 검증 |
| `date` | `YYYY-MM-DD` |
| `date-time` | RFC3339 |
| `time` | `HH:MM:SS` |
| `uri` | `://` 를 포함해야 함 |
| `uuid` | UUID 정규식 매칭 |
| `ipv4` | 4 개 구간, 각 0–255 |
| `ipv6` | `net.ParseIP` 로 파싱되고 `:` 포함 |

## ValidationError 타입

각 제약 위반은 하나의 `ValidationError` 이며, 위반된 JSON 경로와 설명을 담습니다:

```go
type ValidationError struct {
	Path    string `json:"path"`    // 오류 경로 (예: "user.email", "tags[1]")
	Message string `json:"message"` // 오류 메시지
}

func (ve *ValidationError) Error() string
```

`ValidateSchema` 가 `[]ValidationError` 슬라이스를 반환하므로 바로 순회하며 `Path` / `Message` 를 읽으면 됩니다; `Error()` 메서드는 단일 오류를 문자열로 포맷팅할 때 사용합니다 (로그 기록 등).

## Schema 생성 방식

`Schema` 를 구성하는 방법은 세 가지이며, **핵심 차이는 길이/구간류 제약의 적용 여부**입니다:

```go
// 1) 직접 리터럴: Type/Required/Properties/Items/Pattern/Format/Enum/Const/
// UniqueItems/MultipleOf 는 즉시 적용; MinLength/MaxLength/Minimum/Maximum/
// MinItems/MaxItems/ExclusiveMinimum/ExclusiveMaximum 은 적용 안 됨 (아래 설명 참조)
schema := &json.Schema{Type: "string", Pattern: `^\d+$`}

// 2) NewSchemaWithConfig: SchemaConfig 의 포인터 필드로 제약을 설정하면 길이/구간류가 모두 적용됨
cfg := json.DefaultSchemaConfig()
cfg.Type = "string"
minLen := 1
cfg.MinLength = &minLen
schema := json.NewSchemaWithConfig(cfg)

// 3) DefaultSchema: 기본값을 갖춘 Schema 반환 (AdditionalProperties 가 true)
schema := json.DefaultSchema()
```

::: warning 길이/구간 제약은 반드시 NewSchemaWithConfig 사용
`MinLength`, `MaxLength`, `Minimum`, `Maximum`, `MinItems`, `MaxItems`, `ExclusiveMinimum`, `ExclusiveMaximum` 제약군은 외부에서 설정할 수 없는 `Schema` 내부의 추적 플래그에 의존합니다. `&json.Schema{...}` 리터럴에서 이 필드에 값을 넣어도 **적용되지 않습니다**; 반드시 `NewSchemaWithConfig` 에 대응하는 **포인터 필드** (예: `cfg.MinLength = &v`) 를 전달해야 활성화됩니다. `Type`, `Required`, `Properties`, `Items`, `Pattern`, `Format`, `Enum`, `Const`, `UniqueItems`, `MultipleOf` 는 이 제한이 없어 리터럴과 `NewSchemaWithConfig` 모두 적용됩니다.
:::

### DefaultSchema

시그니처: `func DefaultSchema() *Schema`

`DefaultSchema` 는 기본값을 갖춘 Schema 를 반환합니다: `Properties` 는 빈 map, `Required` 는 빈 슬라이스로 초기화되고 `AdditionalProperties` 는 `true` (추가 속성 허용) 로, 점진적으로 채워 나가는 출발점에 적합합니다.

### DefaultSchemaConfig

시그니처: `func DefaultSchemaConfig() SchemaConfig`

`DefaultSchemaConfig` 는 `NewSchemaWithConfig` 의 기본 입력을 반환합니다: `AdditionalProperties` 만 true 를 가리키는 포인터로 미리 설정되고 나머지 필드는 제로값입니다; 여기에 `Type` 과 각 포인터 필드를 설정하면 Schema 를 만들 수 있습니다.

둘의 결과는 일치합니다: `DefaultSchema()` 는 `NewSchemaWithConfig(DefaultSchemaConfig())` 와 동등합니다 — 기본적으로 모두 추가 속성을 허용합니다.

### SchemaConfig 필드

`SchemaConfig` 의 필드 집합은 `Schema` 와 일대일로 대응합니다; 그중 숫자/불리언류 제약은 **포인터 타입**입니다 — `nil` 은 해당 제약이 설정되지 않았음을 뜻하고, nil 이 아닌 포인터를 전달해야만 `NewSchemaWithConfig` 가 대응 제약을 활성화합니다 (길이/구간류 제약이 반드시 `NewSchemaWithConfig` 를 거쳐야 하는 이유이기도 합니다, [위 경고](#schema-생성-방식) 참조).

| 필드 | 타입 | 설명 |
|------|------|------|
| `Type` | `string` | JSON 타입 (`Schema.Type` 와 동일) |
| `Properties` | `map[string]*Schema` | 각 속성에 대응하는 하위 Schema (nil 이면 빈 map 으로 초기화) |
| `Items` | `*Schema` | 배열 요소에 대응하는 하위 Schema |
| `Required` | `[]string` | 반드시 있어야 하는 속성명 목록 (nil 이면 빈 슬라이스로 초기화) |
| `MinLength` | `*int` | 최소 길이 (nil = 미설정) |
| `MaxLength` | `*int` | 최대 길이 (nil = 미설정) |
| `Minimum` | `*float64` | 최솟값 (nil = 미설정) |
| `Maximum` | `*float64` | 최댓값 (nil = 미설정) |
| `Pattern` | `string` | 정규 표현식 |
| `Format` | `string` | 의미적 형식 |
| `AdditionalProperties` | `*bool` | 추가 속성 허용 여부 (nil 이면 `true` 로 처리; `DefaultSchemaConfig` 는 true 를 가리키는 포인터로 미리 설정됨) |
| `MinItems` | `*int` | 최소 요소 수 (nil = 미설정) |
| `MaxItems` | `*int` | 최대 요소 수 (nil = 미설정) |
| `UniqueItems` | `bool` | 요소가 유일해야 함 |
| `Enum` | `[]any` | 허용되는 열거값 목록 |
| `Const` | `any` | 반드시 같아야 하는 고정값 |
| `MultipleOf` | `*float64` | 배수 제약 (nil = 미설정) |
| `ExclusiveMinimum` | `*bool` | 하한 경계 제외 (nil = 미설정) |
| `ExclusiveMaximum` | `*bool` | 상한 경계 제외 (nil = 미설정) |
| `Title` | `string` | 제목 (메타 정보) |
| `Description` | `string` | 설명 (메타 정보) |
| `Default` | `any` | 기본값 (메타 정보) |
| `Examples` | `[]any` | 예시값 (메타 정보) |

설정이 완료된 Schema 는 항상 `NewSchemaWithConfig` (`func NewSchemaWithConfig(cfg SchemaConfig) *Schema`) 로 생성할 것을 권장합니다 — 포인터 제약을 활성화하는 유일하게 안정적인 경로이며, `Properties` / `Required` 를 자동으로 초기화하고 `AdditionalProperties` 기본값도 처리합니다.

## Config 의 검증 관련 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `EnableValidation` | `bool` | 입력 검증 활성화 (작업 전 보안/구조 검증에 영향) |
| `ValidateInput` | `bool` | 입력 JSON 검증 |
| `SkipValidation` | `bool` | 불필요한 검증 건너뜀 (신뢰할 수 있는 입력 전용) |

::: warning 연결되지 않은 확장 필드
`Config.CustomValidators` (`[]Validator`) 와 `Validator` 인터페이스는 현재 버전에서 **선언되어 설정 복제와 캐시 키 계산에는 참여하지만 작업 파이프라인에는 아직 연결되지 않았습니다**. `Config.CustomValidators` (또는 `Config.AddValidator`) 로 검증기를 등록해도 **어떤 작업 실행에도 영향을 주지 않습니다** — 작업이 커스텀 검증기에 거부되는 일은 없습니다. `Validator` 인터페이스는 현재 예약 인터페이스입니다:

```go
// 현재 버전: 선언만 되고 연결되지 않음, 등록해도 작업에 영향 없음 (예약 인터페이스)
type Validator interface {
	Validate(jsonStr string) error
}
```

작업 전후에 커스텀 검증이 필요하면 이미 적용되는 [Hooks 훅](../extensions/hooks) (예: `ValidationHook`) 을 사용하세요.
:::

## 관련 문서

- [인터페이스 정의](./interfaces) - `Validator` 인터페이스 (예약) 와 `Schema` 관련 타입
- [타입 정의](./types) - 핵심 타입 (Config / Schema / Stats / AccessResult)
- [파싱 및 검증](./functions/parse) - Parse / Valid / ValidateSchema 함수
- [설정 옵션](./config) - 검증 관련 설정 필드
- [Hooks 훅](../extensions/hooks) - 이미 적용되는 작업 전후 가로채기 메커니즘 (`ValidationHook` 포함)
