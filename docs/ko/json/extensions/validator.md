---
sidebar_label: "Validator"
title: "Validator - CyberGo JSON | Schema 검증기"
description: "CyberGo JSON 검증기: Validator 인터페이스, Schema 검증 구조, ValidationError 오류와 SchemaConfig 설정으로 완전한 JSON 데이터 검증 능력을 제공합니다."
sidebar_position: 2
---

# Schema 검증

json 라이브러리는 JSON Schema 기반의 데이터 검증 능력을 제공합니다: 데이터가 충족해야 할 구조와 제약을 설명하는 `Schema` 를 정의한 뒤 `ValidateSchema` 로 JSON 을 검증합니다. 이것은 현재 버전에서 **기능이 완전한** 검증 시스템입니다.

## ValidateSchema 함수

`ValidateSchema` 는 JSON 문자열을 `Schema` 와 대조하여 모든 제약 위반 목록을 반환합니다:

```go
// 패키지 레벨 함수
func ValidateSchema(jsonStr string, schema *Schema, cfg ...Config) ([]ValidationError, error)

// Processor 메서드
func (p *Processor) ValidateSchema(jsonStr string, schema *Schema, cfg ...Config) ([]ValidationError, error)
```

반환값 의미:

| 반환값 | 의미 |
|--------|------|
| `([]ValidationError{}, nil)` | JSON 이 유효하고 **모든 제약을 충족** |
| `([]ValidationError{...}, nil)` | JSON 은 파싱 가능하지만 제약 위반 존재 (슬라이스가 비어있지 않음) |
| `(nil, error)` | 파싱 또는 사전 실패 (예: JSON 비정상, `schema` 가 nil, 한도 초과) |

::: tip 핵심 구분
제약 위반은 **반환 슬라이스**로 표현됩니다 (`error` 는 여전히 `nil`); 파싱 실패, `schema` 가 nil, 크기 제한 초과 등의 상황에서만 non-`nil` 인 `error` 를 반환합니다. 따라서 "검증 통과 여부"는 `err != nil` 이 아닌 `len(errs) == 0` 으로 확인해야 합니다.
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

	// 필수 필드 email 이 누락됨
	data := `{"name":"Alice","age":30}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// 출력：email: required property 'email' is missing
}
```

## Schema 제약 필드 총정리

`Schema` 가 지원하는 제약 필드 (카테고리별 그룹):

| 카테고리 | 필드 | 적용 타입 | 설명 |
|------|------|----------|------|
| 구조 | `Type` | 모두 | 값은 아래 표 참조 |
| 구조 | `Required` | object | 반드시 나타나야 하는 속성명 목록 |
| 구조 | `Properties` | object | 각 속성에 대응하는 하위 Schema |
| 구조 | `Items` | array | 요소에 대응하는 하위 Schema |
| 구조 | `AdditionalProperties` | object | `true` 면 추가 속성 허용, `false` 면 거부 |
| 문자열 | `MinLength` / `MaxLength` | string | 길이 구간 (rune 기준 카운트) |
| 문자열 | `Pattern` | string | 정규 표현식 |
| 문자열 | `Format` | string | 의미론적 형식 ([Format 값 표](#지원하는-format-값) 참조) |
| 숫자 | `Minimum` / `Maximum` | number | 값 구간 |
| 숫자 | `ExclusiveMinimum` / `ExclusiveMaximum` | number | 경계값 제외 |
| 숫자 | `MultipleOf` | number | 해당 값의 배수여야 함 |
| 배열 | `MinItems` / `MaxItems` | array | 요소 수 구간 |
| 배열 | `UniqueItems` | array | `true` 면 요소가 고유해야 함 |
| 값 | `Enum` | 모두 | 허용된 열거값 목록 |
| 값 | `Const` | 모두 | 해당 고정값과 같아야 함 |

`Type` 이 지원하는 값: `object`, `array`, `string`, `number`, `boolean`, `null`.

::: warning 숫자 타입은 "number" 사용
JSON 파싱 후 모든 숫자 (정수 포함) 는 `float64` 이므로, 숫자 필드는 `Type: "number"` 를 사용해야 합니다. `MultipleOf` 등 숫자 제약도 `Type` 이 `number` 일 때만 적용됩니다.
:::

## 객체 제약: Required / Properties / AdditionalProperties

`AdditionalProperties` 는 `Properties` 에 선언되지 않은 속성의 출현 허용 여부를 제어합니다. 구조체 리터럴로 `Schema` 를 직접 생성할 때 이 필드의 기본값은 `false` (추가 속성 거부) 입니다:

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
		// AdditionalProperties 미설정, 구조체 리터럴 기본값 false → 추가 속성 거부
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
	// 출력：extra: additional property 'extra' is not allowed
}
```

::: tip 추가 속성 허용
추가 속성을 통과시키려면 `AdditionalProperties` 를 `true` 로 설정하거나, [`DefaultSchema()`](#schema-의-생성-방식)로 생성하세요 (기본 `AdditionalProperties` 가 `true`).
:::

## 문자열 제약: MinLength / MaxLength / Pattern / Format

`MinLength`, `MaxLength`, `Minimum`, `Maximum`, `MinItems`, `MaxItems` 등의 제약은 **`NewSchemaWithConfig` 로 생성할 때만 적용됩니다** (이유는 [생성 방식](#schema-의-생성-방식) 참조). 아래는 `SchemaConfig` 의 포인터 필드로 길이를 설정하고, `Pattern` 으로 소문자로 제한합니다:

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

	// "AB": 길이 부족이고 대문자 포함
	data := `{"name":"AB"}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// 출력：
	// name: string length 2 is less than minimum 3
	// name: string 'AB' does not match pattern '^[a-z]+$'
}
```

`Pattern` 은 첫 검증 시 지연 컴파일되어 캐싱되며, 동일한 `*Schema` 를 동시 검증에 안전하게 사용할 수 있습니다. 정규식 자체가 유효하지 않으면 매 검증마다 해당 컴파일 오류를 보고합니다.

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

	// 148: 상한 120 초과, 5 의 배수도 아님
	data := `{"age":148}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// 출력：
	// age: number 148 exceeds maximum 120
	// age: number 148 is not a multiple of 5
}
```

`ExclusiveMinimum` / `ExclusiveMaximum` 은 `Minimum` / `Maximum` 과 함께 `SchemaConfig` (마찬가지로 포인터 필드) 로 설정하여 경계값 자체를 제외하는 데 사용합니다.

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

	// 요소 4 개 (상한 3 초과), "a" 중복
	data := `{"tags":["a","a","b","c"]}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// 출력：
	// tags: array length 4 exceeds maximum 3
	// tags[1]: duplicate item found: a
}
```

`Items` 는 각 요소가 충족해야 할 하위 Schema 를 지정합니다 (위 예제는 문자열로 제한); `UniqueItems` 는 요소의 문자열 표현으로 중복을 판정합니다.

## 열거와 상수: Enum / Const

`Enum` 은 값이 그중 하나와 일치해야 함을 제한합니다; `Const` 는 특정 고정값과 같아야 함을 제한합니다. 둘 다 직접 비교로 적용되며, `NewSchemaWithConfig` 가 필요 없습니다:

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

	// role 이 열거값에 없음; status 는 상수와 일치
	data := `{"role":"superuser","status":"active"}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// 출력：role: value 'superuser' is not in allowed enum values: [admin user guest]
}
```

## 지원하는 Format 값

`Format` 필드가 지원하는 의미론적 형식 (알 수 없는 형식은 조용히 건너뛰며, 오류도 보고하지 않고 통과도시키지 않습니다):

| Format | 검증 규칙 |
|--------|----------|
| `email` | 로컬 파트, 도메인, TLD 구조와 길이 검증 |
| `date` | `YYYY-MM-DD` |
| `date-time` | RFC3339 |
| `time` | `HH:MM:SS` |
| `uri` | 반드시 `://` 포함 |
| `uuid` | UUID 정규식 매칭 |
| `ipv4` | 4 세그먼트, 각 세그먼트 0–255 |
| `ipv6` | `net.ParseIP` 로 파싱 통과하고 `:` 포함 |

## ValidationError 타입

각 제약 위반은 `ValidationError` 이며, 오류가 발생한 JSON 경로와 설명을 전달합니다:

```go
type ValidationError struct {
    Path    string `json:"path"`    // 오류 경로 (예: "user.email", "tags[1]")
    Message string `json:"message"` // 오류 메시지
}

func (ve *ValidationError) Error() string
```

`ValidateSchema` 가 반환하는 것은 `[]ValidationError` 슬라이스이므로, 순회하며 `Path` / `Message` 를 직접 읽으면 됩니다; `Error()` 메서드는 단일 오류를 문자열로 포맷팅하는 데 사용됩니다 (예: 로깅용).

## Schema 의 생성 방식

`Schema` 를 생성하는 세 가지 방식이 있으며, **핵심 차이는 길이/구간류 제약의 적용 여부**입니다:

```go
// 1) 직접 리터럴: Type/Required/Properties/Items/Pattern/Format/Enum/Const/
//    UniqueItems/MultipleOf 즉시 적용; 단 MinLength/MaxLength/Minimum/Maximum/
//    MinItems/MaxItems/ExclusiveMinimum/ExclusiveMaximum 는 적용되지 않음 (아래 설명 참조)
schema := &json.Schema{Type: "string", Pattern: `^\d+$`}

// 2) NewSchemaWithConfig: SchemaConfig 의 포인터 필드로 제약 설정, 길이/구간류 모두 적용
cfg := json.DefaultSchemaConfig()
cfg.Type = "string"
minLen := 1
cfg.MinLength = &minLen
schema := json.NewSchemaWithConfig(cfg)

// 3) DefaultSchema: 기본값이 있는 Schema 반환 (AdditionalProperties 가 true)
schema := json.DefaultSchema()
```

::: warning 길이/구간 제약은 반드시 NewSchemaWithConfig 사용
`MinLength`, `MaxLength`, `Minimum`, `Maximum`, `MinItems`, `MaxItems`, `ExclusiveMinimum`, `ExclusiveMaximum` 이 제약 그룹은 `Schema` 내부에서 외부 설정이 불가능한 추적 플래그에 의존합니다. `&json.Schema{...}` 리터럴에서 직접 이 필드에 값을 할당해도 **적용되지 않습니다**; 반드시 `NewSchemaWithConfig` 로 대응하는 **포인터 필드** (예: `cfg.MinLength = &v`) 를 전달해야 활성화됩니다. `Type`, `Required`, `Properties`, `Items`, `Pattern`, `Format`, `Enum`, `Const`, `UniqueItems`, `MultipleOf` 는 이 제한을 받지 않으며, 리터럴과 `NewSchemaWithConfig` 모두 적용됩니다.
:::

## Config 의 검증 관련 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `EnableValidation` | `bool` | 입력 검증 활성화 (작업 전 보안/구조 검증에 영향) |
| `ValidateInput` | `bool` | 입력 JSON 검증 |
| `SkipValidation` | `bool` | 비필수 검증 건너뜀 (신뢰할 수 있는 입력에만 사용) |

::: warning 미연결 확장 필드
`Config.CustomValidators` (`[]Validator`) 와 `Validator` 인터페이스는 현재 버전에서 **선언되어 설정 클로닝과 캐시 키 계산에 참여하지만, 작업 파이프라인에 아직 연결되지 않았습니다**. `Config.CustomValidators` (또는 `Config.AddValidator`) 로 검증기를 등록해도 **어떤 작업의 실행에도 영향을 주지 않습니다** — 작업이 커스텀 검증기로 거부되지 않습니다. `Validator` 인터페이스는 현재 예약 인터페이스입니다:

```go
// 현재 버전: 선언되었으나 연결되지 않았으며, 등록해도 작업에 영향 없음 (예약 인터페이스)
type Validator interface {
    Validate(jsonStr string) error
}
```

작업 전후에 커스텀 검증이 필요하면 이미 적용되는 [Hooks 훅 시스템](./hooks) (예: `ValidationHook`)을 사용하세요.
:::

## 관련 문서

- [인터페이스 정의](../api-reference/interfaces) - `Validator` 인터페이스 (예약) 와 `Schema` 관련 타입
- [설정 옵션](../api-reference/config) - 검증 관련 설정 필드
- [Hooks 훅 시스템](./hooks) - 이미 적용되는 작업 전후 가로채기 메커니즘 (`ValidationHook` 포함)
