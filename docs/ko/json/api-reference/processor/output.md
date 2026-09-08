---
sidebar_label: "인코딩 출력"
title: "Processor 인코딩 출력 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON Processor 출력 메서드: Encode, EncodePretty, EncodeWithConfig, EncodeBatch/EncodeFields 배치와 Compact/Indent/HTMLEscape 포맷팅을 지원합니다."
sidebar_position: 5
---

# 출력 메서드

Processor 는 다양한 JSON 인코딩 출력 메서드를 제공합니다.

## 기본 출력

### Encode

<Badge type="danger" text="폐기됨" />

시그니처: `func (p *Processor) Encode(value any, config ...Config) (string, error)`

임의의 값을 JSON 문자열로 인코딩합니다. [`EncodeWithConfig`](#encodewithconfig) 를 사용하세요.

::: warning 폐기됨
`Processor.Encode` 는 [`EncodeWithConfig`](#encodewithconfig) 에 직접 위임합니다. `EncodeWithConfig` 를 사용하세요. `Encode` 는 향후 메이저 버전에서 제거됩니다.
:::

```go
result, err := p.Encode(map[string]any{"name": "CyberGo"})
if err != nil {
	panic(err)
}
fmt.Println(result)
```

### EncodePretty

시그니처: `func (p *Processor) EncodePretty(value any, config ...Config) (string, error)`

임의의 값을 포맷팅된 JSON 문자열로 인코딩합니다.

```go
result, err := p.EncodePretty(user)
if err != nil {
	panic(err)
}
```

## 고급 인코딩

### EncodeWithConfig

시그니처: `func (p *Processor) EncodeWithConfig(value any, cfg ...Config) (string, error)`

지정된 설정으로 값을 JSON 문자열로 인코딩합니다.

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `value` | `any` | 예 | 인코딩할 값 |
| `cfg` | `Config` | 아니오 | 인코딩 설정 (선택) |

```go
// PrettyConfig 사용
result, err := p.EncodeWithConfig(data, json.PrettyConfig())

// SecurityConfig 사용
result, err = p.EncodeWithConfig(data, json.SecurityConfig())

// 커스텀 설정 사용
cfg := json.DefaultConfig()
cfg.Pretty = true
cfg.SortKeys = true
cfg.EscapeHTML = true
result, err = p.EncodeWithConfig(data, cfg)
```

### EncodeBatch

시그니처: `func (p *Processor) EncodeBatch(pairs map[string]any, cfg ...Config) (string, error)`

키-값 쌍을 JSON 객체로 배치 인코딩합니다.

```go
result, err := p.EncodeBatch(map[string]any{
	"name":    "CyberGo",
	"version": "1.0.0",
})
```

### EncodeFields

시그니처: `func (p *Processor) EncodeFields(value any, fields []string, cfg ...Config) (string, error)`

지정한 필드만 인코딩하며, 부분 직렬화에 자주 쓰입니다.

```go
type User struct {
	Name    string `json:"name"`
	Email   string `json:"email"`
	Private string `json:"private"`
}

user := User{Name: "CyberGo", Email: "test@example.com", Private: "secret"}
// name 과 email 필드만 인코딩
result, err := p.EncodeFields(user, []string{"name", "email"})
```

### EncodeStream

시그니처: `func (p *Processor) EncodeStream(values any, cfg ...Config) (string, error)`

여러 값을 JSON 배열 스트림 (array stream) 으로 인코딩합니다. `values` 는 보통 슬라이스나 열거 가능한 집합이며, `[v1,v2,...]` 형태의 JSON 배열 문자열을 출력합니다.

```go
values := []any{"item1", "item2", "item3"}
result, err := p.EncodeStream(values)
```

## 인코딩/디코딩

### Marshal

시그니처: `func (p *Processor) Marshal(value any, cfg ...Config) ([]byte, error)`

Go 값을 JSON 바이트 슬라이스로 인코딩합니다. `encoding/json.Marshal` 과 100% 호환됩니다.

::: tip 출력은 항상 HTML 이스케이프
`encoding/json.Marshal` 과 마찬가지로 이 메서드의 출력은 **항상** HTML 이스케이프됩니다 — 전달한 `cfg` 가 `EscapeHTML=false` 라도 이 경로에서 덮어씌워집니다. 호출자가 이스케이프를 제어해야 할 때는 [`EncodeWithConfig`](#encodewithconfig) 를 사용하세요.
:::

```go
data, err := p.Marshal(map[string]any{"name": "CyberGo"})
if err != nil {
	panic(err)
}
fmt.Println(string(data)) // {"name":"CyberGo"}
```

### MarshalIndent

시그니처: `func (p *Processor) MarshalIndent(value any, prefix, indent string, cfg ...Config) ([]byte, error)`

Go 값을 포맷팅된 JSON 바이트 슬라이스로 인코딩합니다. `encoding/json.MarshalIndent` 와 100% 호환됩니다.

```go
data, err := p.MarshalIndent(user, "", "  ")
if err != nil {
	panic(err)
}
fmt.Println(string(data))
```

### Unmarshal

시그니처: `func (p *Processor) Unmarshal(data []byte, value any, cfg ...Config) error`

JSON 바이트 슬라이스를 대상 변수로 파싱합니다. `encoding/json.Unmarshal` 과 100% 호환됩니다.

```go
var user User
err := p.Unmarshal([]byte(`{"name":"Alice","age":30}`), &user)
if err != nil {
	panic(err)
}
```

## 포맷팅

### Prettify

시그니처: `func (p *Processor) Prettify(jsonStr string, cfg ...Config) (string, error)`

JSON 문자열을 들여쓰기 형식으로 포맷팅합니다. 기본은 공백 2 칸 들여쓰기; `cfg` 의 `Indent` / `Prefix` 필드로 커스터마이즈할 수 있습니다.

```go
pretty, err := p.Prettify(`{"name":"Alice","age":30}`)
// 출력:
// {
//   "name": "Alice",
//   "age": 30
// }

// 공백 4 칸 들여쓰기
cfg := json.DefaultConfig()
cfg.Indent = "    "
pretty, err = p.Prettify(`{"name":"Alice","age":30}`, cfg)
```

### Print (제거됨)

::: warning API 변경 안내
Print, PrintE, PrintPretty, PrintPrettyE 는 라이브러리에서 제거되어 더 이상 제공되지 않습니다. 다음 대안을 사용하세요:

```go
// 컴팩트 출력
s, err := p.EncodeWithConfig(data)
if err != nil {
	log.Fatal(err)
}
fmt.Println(s)

// 포맷팅 출력
pretty, err := p.EncodePretty(data)
if err != nil {
	log.Fatal(err)
}
fmt.Println(pretty)
```
:::

### ValidateSchema

시그니처: `func (p *Processor) ValidateSchema(jsonStr string, schema *Schema, cfg ...Config) ([]ValidationError, error)`

JSON 데이터가 지정한 Schema 를 만족하는지 검증합니다. **Schema 위반 상세는 반환되는 `[]ValidationError` 로 보고**됩니다; `error` 는 파싱이나 사전 검증이 실패할 때만 (JSON 이 잘못됨, `schema` 가 `nil` 등) nil 이 아닙니다 — 검증 통과 시 `(nil, nil)`, 검증 실패지만 흐름이 정상일 때 `(비어 있지 않은 슬라이스, nil)` 을 반환합니다.

```go
schema := &json.Schema{
	Type:     "object",
	Required: []string{"name", "email"},
	Properties: map[string]*json.Schema{
		"name":  {Type: "string", MinLength: 1},
		"email": {Type: "string", Format: "email"},
	},
}

errors, err := p.ValidateSchema(jsonStr, schema)
if err != nil {
	panic(err)
}
for _, ve := range errors {
	fmt.Printf("경로 %s: %s\n", ve.Path, ve.Message)
}
```

## 포맷팅 작업

### Compact

시그니처: `func (p *Processor) Compact(jsonStr string, cfg ...Config) (string, error)`

JSON 문자열을 압축하여 모든 공백 문자를 제거합니다.

::: warning 메서드와 패키지 레벨 함수의 이름 차이
'문자열 입력, 문자열 출력' 압축은 두 입구에서 **이름이 다릅니다**: 패키지 레벨은 `json.CompactString(s)`, 메서드 버전은 `p.Compact(s)` 입니다. 패키지 레벨 `json.Compact(dst, src)` 는 `encoding/json.Compact` 호환 **Buffer 형식**이며, 대응하는 메서드는 [`CompactBuffer`](#compactbuffer) 이지 이 메서드가 아닙니다.
:::

```go
compact, err := p.Compact(`{"name": "CyberGo"}`)
// 출력: {"name":"CyberGo"}
```

### CompactBuffer

시그니처: `func (p *Processor) CompactBuffer(dst *bytes.Buffer, src []byte, cfg ...Config) error`

JSON 을 압축하여 Buffer 에 기록합니다. `encoding/json.Compact` 시그니처와 호환되며 [`Compact`](#compact) 의 Buffer 형식입니다 (패키지 레벨 대응은 `json.Compact`).

```go
var buf bytes.Buffer
err := p.CompactBuffer(&buf, []byte(`{"name": "test"}`))
```

### Indent

시그니처: `func (p *Processor) Indent(dst *bytes.Buffer, src []byte, prefix, indent string, cfg ...Config) error`

JSON 을 포맷팅하여 Buffer 에 기록합니다.

```go
var buf bytes.Buffer
err := p.Indent(&buf, []byte(`{"name":"test"}`), "", "  ")
```

### HTMLEscape

시그니처: `func (p *Processor) HTMLEscape(dst *bytes.Buffer, src []byte, cfg ...Config)`

JSON 을 HTML 이스케이프하여 Buffer 에 기록합니다.

```go
var buf bytes.Buffer
p.HTMLEscape(&buf, []byte(`{"html":"<script>alert(1)</script>"}`))
```

## 관련 문서

- [Config](../config) - 설정 옵션
- [파싱과 로드](./parse) - Parse/Load 메서드
