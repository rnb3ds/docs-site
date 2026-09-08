---
sidebar_label: "인코딩 출력"
title: "인코딩 출력 함수 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON 출력 함수: Marshal/Unmarshal, Compact/Indent/HTMLEscape 포맷팅, Encode/EncodePretty/Prettify 설정 인코딩에 EncodeFields 필터링과 스트리밍, 표준 라이브러리 100% 호환."
sidebar_position: 5
---

# 인코딩 출력 함수

json 패키지가 제공하는 인코딩/디코딩 함수로, 직렬화, 역직렬화, 포맷팅, 설정 기반 인코딩을 포함합니다.

## 직렬화 함수

### Marshal

시그니처: `func Marshal(value any, cfg ...Config) ([]byte, error)`

Go 값을 JSON 바이트 슬라이스로 직렬화합니다. `encoding/json.Marshal` 과 100% 호환: cfg 없이 `json.Marshal(v)` 를 호출하면 표준 라이브러리와 완전히 동일합니다.

선택적인 마지막 `Config` 로 인코딩 동작 (들여쓰기, 숫자 처리 등) 을 제어할 수 있으며, `Processor.Marshal` 과 패키지 레벨/인스턴스 레벨 미러를 이룹니다.

```go
// encoding/json 호환 (cfg 없음)
data, err := json.Marshal(map[string]any{"name": "test"})
if err != nil {
	panic(err)
}
fmt.Println(string(data)) // {"name":"test"}

// 설정 포함 (비파괴적 선택 인자)
data, err = json.Marshal(value, json.PrettyConfig())
```

::: warning Marshal 출력은 항상 HTML 이스케이프
`encoding/json.Marshal` 과 마찬가지로 `Marshal` 의 출력은 **항상** HTML 이스케이프를 거칩니다 — `cfg.EscapeHTML = false` 를 전달해도 이 경로는 이를 켠 값으로 덮어씁니다. 호출자가 이스케이프 동작을 제어해야 한다면 [`EncodeWithConfig`](#encodewithconfig) 을 사용하세요.
:::

### Unmarshal

시그니처: `func Unmarshal(data []byte, value any, cfg ...Config) error`

JSON 바이트 슬라이스를 Go 값으로 역직렬화합니다. `encoding/json.Unmarshal` 과 100% 호환: cfg 없이 `json.Unmarshal(data, &v)` 를 호출하면 표준 라이브러리와 완전히 동일합니다.

선택적인 마지막 `Config` 로 보안 제한, 숫자 유지 등을 제어할 수 있으며, `Processor.Unmarshal` 과 미러를 이룹니다.

```go
var result struct {
	Name string `json:"name"`
}
// encoding/json 호환 (cfg 없음)
err := json.Unmarshal([]byte(`{"name":"test"}`), &result)

// 설정 포함
err = json.Unmarshal(data, &v, json.SecurityConfig())
```

::: tip cfg 없는 빠른 경로도 보안 검증 실행
cfg 없이 호출하면 `Unmarshal` 은 `encoding/json` 에 위임하기 전에도 프로세서 내장 보안 제한 (크기, 중첩 깊이, 위험 패턴) 으로 입력을 검증합니다 — 즉 표준 라이브러리의 drop-in 대체로 써도 보안 방어선을 우회하지 않습니다.
:::

### MarshalIndent

시그니처: `func MarshalIndent(v any, prefix, indent string, cfg ...Config) ([]byte, error)`

들여쓰기가 있는 직렬화입니다. `encoding/json.MarshalIndent` 와 100% 호환: cfg 없이 `json.MarshalIndent(v, prefix, indent)` 를 호출하면 표준 라이브러리와 완전히 동일합니다.

선택적인 마지막 `Config` 로 설정을 추가할 수 있으며; `prefix` 와 `indent` 매개변수는 `Config` 의 해당 필드를 덮어씁니다.

```go
// encoding/json 호환 (cfg 없음)
data, err := json.MarshalIndent(user, "", "  ")
if err != nil {
	panic(err)
}
fmt.Println(string(data))

// 설정 포함
data, err = json.MarshalIndent(v, "", "  ", json.SecurityConfig())
```

## 포맷팅 함수

### Compact

시그니처: `func Compact(dst *bytes.Buffer, src []byte, cfg ...Config) error`

JSON 을 압축해 불필요한 공백 문자를 제거하고 결과를 `dst` 에 기록합니다. `encoding/json.Compact` 와 호환됩니다 (buffer 형식).

```go
var buf bytes.Buffer
err := json.Compact(&buf, []byte(`{"name": "test"}`))
if err != nil {
	panic(err)
}
fmt.Println(buf.String()) // {"name":"test"}
```

### CompactString

시그니처: `func CompactString(jsonStr string, cfg ...Config) (string, error)`

문자열 입력/출력 형식으로 JSON 을 압축해 불필요한 공백을 제거합니다. `Processor.Compact` 의 패키지 레벨 미러이며, `Prettify` (`Processor.Prettify` 미러) 와 대칭입니다.

::: info 시그니처 비대칭: Compact 계열과 Processor 의 미러 관계
패키지 레벨 `Compact` 는 `encoding/json.Compact` 의 호환 시그니처 (buffer 입력) 를 유지하므로 Processor 메서드 버전과 **이름이 어긋납니다** — Processor 의 `Compact(jsonStr) (string, error)` 는 패키지 레벨에서 `CompactString` 이고, 그 buffer 형식은 `CompactBuffer` 입니다:

| 패키지 레벨 함수 | 시그니처 형식 | 미러링되는 Processor 메서드 |
|----------|----------|------------------------|
| `Compact(dst *bytes.Buffer, src []byte)` | buffer 입력 (encoding/json 호환) | `CompactBuffer(dst, src)` |
| `CompactString(jsonStr string) (string, error)` | 문자열 입력, 문자열 출력 | `Compact(jsonStr)` |
| `Prettify(jsonStr string) (string, error)` | 문자열 입력, 문자열 출력 | `Prettify(jsonStr)` |
:::

```go
compact, err := json.CompactString(`{
    "name": "Alice",
    "age": 30
}`)
// compact == `{"name":"Alice","age":30}`

// 설정 포함 (예: 원본 숫자 형식 유지)
cfg := json.DefaultConfig()
cfg.PreserveNumbers = true
compact, err = json.CompactString(jsonStr, cfg)
```

### Indent

시그니처: `func Indent(dst *bytes.Buffer, src []byte, prefix, indent string, cfg ...Config) error`

JSON 을 포맷팅하고 들여쓰기를 추가해 결과를 `dst` 에 기록합니다. `encoding/json.Indent` 와 호환됩니다.

```go
var buf bytes.Buffer
err := json.Indent(&buf, []byte(`{"name":"test"}`), "", "  ")
if err != nil {
	panic(err)
}
fmt.Println(buf.String())
// {
//   "name": "test"
// }
```

### HTMLEscape

시그니처: `func HTMLEscape(dst *bytes.Buffer, src []byte, cfg ...Config)`

JSON 내용을 HTML 이스케이프하여 `<`, `>`, `&` 등의 특수 문자 (및 U+2028, U+2029) 를 대응하는 Unicode 이스케이프 시퀀스로 바꾸고 결과를 `dst` 에 기록합니다. 반환값이 없습니다.

```go
var buf bytes.Buffer
json.HTMLEscape(&buf, []byte(`{"html":"<script>alert(1)</script>"}`))
fmt.Println(buf.String())
// {"html":"\u003cscript\u003ealert(1)\u003c/script\u003e"}
```

### Prettify

시그니처: `func Prettify(jsonStr string, cfg ...Config) (string, error)`

기본 pretty-print 들여쓰기로 JSON 문자열을 포맷팅하고 포맷팅된 문자열을 반환합니다.

```go
pretty, err := json.Prettify(`{"name":"Alice","age":30}`)
if err != nil {
	panic(err)
}
fmt.Println(pretty)
// {
//   "name": "Alice",
//   "age": 30
// }
```

## 설정 기반 인코딩 함수

### Encode

<Badge type="danger" text="폐기됨" />

시그니처: `func Encode(value any, cfg ...Config) (string, error)`

Go 값을 JSON 문자열로 인코딩하며, 선택적 설정 매개변수를 지원합니다. [`EncodeWithConfig`](#encodewithconfig) 를 사용하세요.

::: warning 폐기됨
`Encode` 는 기능상 [`EncodeWithConfig`](#encodewithconfig) 와 완전히 동일합니다 (둘 다 같은 구현에 위임). `EncodeWithConfig` 를 사용하거나, `[]byte` 출력이 괜찮다면 [`Marshal`](#marshal) 을 사용하세요. `Encode` 는 향후 메이저 버전에서 제거됩니다.
:::

```go
result, err := json.Encode(user)
if err != nil {
	panic(err)
}
fmt.Println(result)
```

**설정 포함**

```go
result, err := json.Encode(user, json.SecurityConfig())
```

### EncodePretty

시그니처: `func EncodePretty(value any, cfg ...Config) (string, error)`

Go 값을 포맷팅된 (들여쓰기 포함) JSON 문자열로 인코딩하며, 선택적 설정 매개변수를 지원합니다.

```go
result, err := json.EncodePretty(user)
if err != nil {
	panic(err)
}
fmt.Println(result)
```

**설정 포함**

```go
result, err := json.EncodePretty(user, json.PrettyConfig())
```

### EncodeWithConfig

시그니처: `func EncodeWithConfig(value any, cfg ...Config) (string, error)`

지정된 설정으로 Go 값을 JSON 문자열로 인코딩합니다. 인코딩 동작을 세밀하게 제어해야 하는 시나리오에 적합합니다.

```go
// pretty-print 설정 사용
result, err := json.EncodeWithConfig(data, json.PrettyConfig())
if err != nil {
	panic(err)
}
fmt.Println(result)
```

**보안 설정 사용**

```go
result, err := json.EncodeWithConfig(data, json.SecurityConfig())
```

## 배치 인코딩 함수

### EncodeBatch

시그니처: `func EncodeBatch(pairs map[string]any, cfg ...Config) (string, error)`

키-값 쌍을 JSON 객체 문자열로 배치 인코딩합니다. `EncodeWithConfig(map[string]any(pairs), cfg)` 와 동등하며, 키는 사전순으로 출력됩니다 (`encoding/json` 과 일치).

```go
result, err := json.EncodeBatch(map[string]any{
	"name":  "Alice",
	"age":   30,
	"email": "alice@example.com",
})
if err != nil {
	panic(err)
}
fmt.Println(result) // {"age":30,"email":"alice@example.com","name":"Alice"}
```

### EncodeFields

시그니처: `func EncodeFields(value any, fields []string, cfg ...Config) (string, error)`

지정된 필드만 인코딩해 필드 필터링 출력을 구현합니다. `fields` 에 **실제로 존재하지 않는** 키는 조용히 무시되며 (양쪽 교집합만 출력); `value` 인코딩 결과가 JSON 객체가 아니면 `ErrTypeMismatch` 를 반환합니다 (`value is not an object, cannot filter fields`).

```go
user := struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}{
	Name: "Alice", Email: "a@b.com", Password: "secret",
}

// 공개 필드만 출력
result, err := json.EncodeFields(user, []string{"name", "email"})
if err != nil {
	panic(err)
}
fmt.Println(result) // {"name":"Alice","email":"a@b.com"}
```

### EncodeStream

시그니처: `func EncodeStream(values any, cfg ...Config) (string, error)`

여러 값을 JSON 배열 스트림 (array stream) 으로 인코딩합니다. `values` 는 보통 슬라이스나 열거 가능한 집합이며, `[v1,v2,...]` 형태의 JSON 배열 문자열을 출력합니다. `EncodeWithConfig(values, cfg)` 와 동등합니다: `values` 가 슬라이스면 JSON 배열을 출력하고, 집합이 아닌 값을 전달하면 `EncodeWithConfig` 의미에 따라 해당 값 자체를 출력합니다.

```go
values := []map[string]any{
	{"id": 1, "name": "Alice"},
	{"id": 2, "name": "Bob"},
}

result, err := json.EncodeStream(values)
if err != nil {
	panic(err)
}
fmt.Println(result)
```

## Processor 포맷팅 메서드

`Processor` 타입은 추가 포맷팅 메서드를 제공합니다. `json.New()` 로 Processor 를 생성하세요 (`(*Processor, error)` 반환):

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()
```

### Processor.CompactBuffer

시그니처: `func (p *Processor) CompactBuffer(dst *bytes.Buffer, src []byte, cfg ...Config) error`

JSON 바이트를 압축해 `dst` 버퍼에 기록합니다. 패키지 레벨 `Compact` 함수가 이 메서드에 위임합니다.

```go
var buf bytes.Buffer
err := p.CompactBuffer(&buf, []byte(`{"name": "Alice"}`))
// buf.String() => {"name":"Alice"}
```

### Processor.Indent

시그니처: `func (p *Processor) Indent(dst *bytes.Buffer, src []byte, prefix, indent string, cfg ...Config) error`

들여쓰기 형식의 JSON 을 `dst` 버퍼에 기록합니다. `encoding/json.Indent` 와 호환됩니다.

```go
var buf bytes.Buffer
err := p.Indent(&buf, []byte(`{"name":"Alice"}`), "", "  ")
```

### Processor.HTMLEscape

시그니처: `func (p *Processor) HTMLEscape(dst *bytes.Buffer, src []byte, cfg ...Config)`

HTML 이스케이프된 JSON 을 `dst` 버퍼에 기록하며 반환값이 없습니다. `encoding/json.HTMLEscape` 와 호환됩니다.

```go
var buf bytes.Buffer
p.HTMLEscape(&buf, []byte(`{"html":"<script>"}`))
```

:::tip
Processor 메서드의 전체 문서는 [Processor](../processor/) 를 참조하세요.
:::

## 스트리밍 인코딩/디코딩

`NewEncoder(w)` / `NewDecoder(r)` 는 `encoding/json` 과 완전히 호환되며 (`SetIndent`, `SetEscapeHTML`, `UseNumber`, `Token` 등의 메서드 포함) `io.Writer`/`io.Reader` 로부터의 스트리밍 인코딩/디코딩을 지원합니다:

```go
// stdout 으로 스트리밍 인코딩
enc := json.NewEncoder(os.Stdout)
enc.SetIndent("", "  ")
_ = enc.Encode(user)

// 스트리밍 디코딩 (JSON 값을 하나씩 읽기)
dec := json.NewDecoder(resp.Body)
for dec.More() {
	var msg Message
	if err := dec.Decode(&msg); err != nil {
		break
	}
}
```

:::tip
`Encoder`/`Decoder` 의 전체 메서드 표는 [타입 정의](../types#encoder-json-인코더) 를 참조하세요.
:::

## 설정 프리셋

다음 보조 함수는 미리 설정된 `Config` 값을 반환하며, `...Config` 를 받는 모든 함수에 전달할 수 있습니다:

```go
// 기본 설정
cfg := json.DefaultConfig()

// pretty-print 설정
cfg = json.PrettyConfig()

// 보안 설정
cfg = json.SecurityConfig()
```

:::tip
Config 필드의 전체 문서는 [설정](../config) 을 참조하세요.
:::

## 관련 문서

- [조회 및 가져오기 함수](./query) - Get, GetString 등 조회 작업
- [수정 함수](./modify) - Set, Delete 등 수정 작업
- [파일 I/O](./file-io) - LoadFromFile, SaveToFile 등 파일 작업
- [설정](../config) - Config 타입과 옵션
- [인터페이스](../interfaces) - Processor, Encoder, Decoder 타입
