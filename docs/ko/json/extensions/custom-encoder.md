---
sidebar_label: "커스텀 인코더"
title: "CustomEncoder - CyberGo JSON | 커스텀 인코더"
description: "CyberGo JSON 커스텀 인코더: CustomEncoder 인터페이스와 TypeEncoder 타입 인코더의 정의와 구현으로 Go 타입에 JSON 직렬화 로직을 등록합니다."
sidebar_position: 3
---

# 커스텀 인코딩

json 라이브러리는 표준 라이브러리 `encoding/json` 와 인코딩 호환성을 유지하므로, 커스텀 타입의 JSON 형태는 주로 표준 라이브러리 인터페이스를 구현하여 이루어집니다. 이 페이지는 **현재 버전에서 실제로 적용되는** 인코딩 확장점을 소개합니다:

- [`json.Marshaler`](#json-marshaler-인터페이스) —— 타입이 자신의 JSON 인코딩을 커스터마이징
- [`encoding.TextMarshaler`](#encoding-textmarshaler-인터페이스) —— 타입이 자신의 텍스트 인코딩을 커스터마이징 (JSON 문자열로 출력)
- [`time.Time`](#time-time-의-내장-처리) —— 라이브러리 내장 RFC3339Nano 시간 형식
- [`Config.CustomEscapes`](#커스텀-문자-이스케이프-customescapes) —— 커스텀 문자 이스케이프 매핑

::: tip 인터페이스 우선
"어떤 타입을 어떻게 인코딩할지"에 대한 요구에는 먼저 `MarshalJSON` 이나 `MarshalText` 를 구현하세요; 이런 구현은 본 라이브러리, 표준 라이브러리 `encoding/json` 및 모든 호환 라이브러리에서 공통으로 사용할 수 있어 이식성이 가장 높습니다.
:::

## json.Marshaler 인터페이스

`MarshalJSON() ([]byte, error)` 를 구현하는 타입은 자신의 JSON 표현을 완전히 결정할 수 있습니다. 라이브러리는 인코딩 시 이 메서드를 우선 호출합니다 (값 리시버와 포인터 리시버 모두 지원), 표준 라이브러리 `encoding/json` 동작과 일치합니다.

인터페이스 시그니처 (`encoding/json.Marshaler` 와 호환):

```go
type Marshaler interface {
    MarshalJSON() ([]byte, error)
}
```

아래는 `Hex` 타입을 정의하여 `uint64` 를 `0x` 접두어가 있는 16진수 문자열로 인코딩합니다:

```go
package main

import (
	"fmt"
	"strconv"

	"github.com/cybergodev/json"
)

// Hex 는 uint64 를 16진수 표현으로 래핑하는 타입입니다.
type Hex uint64

// MarshalJSON 은 json.Marshaler 를 구현하여 숫자를 "0x.." 문자열로 인코딩합니다.
func (h Hex) MarshalJSON() ([]byte, error) {
	return []byte(`"0x` + strconv.FormatUint(uint64(h), 16) + `"`), nil
}

func main() {
	type Device struct {
		ID    Hex    `json:"id"`
		Label string `json:"label"`
	}
	d := Device{ID: Hex(255), Label: "sensor-1"}

	out, err := json.Marshal(d)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(out))
	// 출력：{"id":"0xff","label":"sensor-1"}
}
```

::: warning 무한 재귀 주의
`MarshalJSON` 내부에서 "일반적인 인코딩" 보조가 필요하면 표준 라이브러리 `stdjson.Marshal` 을 사용하거나 **다른 구체적 타입**에 대해 본 라이브러리를 호출하세요. 본 타입에 다시 `Marshal` 을 호출하면 `MarshalJSON` 에 재진입하여 무한 재귀가 됩니다.
:::

## encoding.TextMarshaler 인터페이스

`MarshalJSON` 을 구현하지 않았지만 `MarshalText() ([]byte, error)` 를 구현한 타입은 텍스트 내용을 값으로 하는 JSON 문자열로 인코딩됩니다 (따옴표와 이스케이프 자동 추가). 텍스트만으로 형태를 완전히 표현할 수 있는 타입에 적합합니다.

인터페이스 시그니처 (`encoding.TextMarshaler` 와 호환):

```go
type TextMarshaler interface {
    MarshalText() ([]byte, error)
}
```

아래는 `Slug` 타입을 정의하여 인코딩 시 소문자 하이픈 형식으로 자동 정규화합니다:

```go
package main

import (
	"fmt"
	"strings"

	"github.com/cybergodev/json"
)

// Slug 는 URL 친화적인 짧은 텍스트를 나타냅니다.
type Slug string

// MarshalText 는 encoding.TextMarshaler 를 구현하여 정규화된 텍스트를 출력합니다.
func (s Slug) MarshalText() ([]byte, error) {
	return []byte(strings.ToLower(strings.ReplaceAll(string(s), " ", "-"))), nil
}

func main() {
	type Article struct {
		Title string `json:"title"`
		Slug  Slug   `json:"slug"`
	}
	a := Article{Title: "Hello World", Slug: Slug("Hello World")}

	out, err := json.Marshal(a)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(out))
	// 출력：{"title":"Hello World","slug":"hello-world"}
}
```

::: tip 두 인터페이스의 우선순위
동일한 타입이 두 인터페이스를 모두 구현한 경우 `MarshalJSON` 이 `MarshalText` 보다 우선합니다. 타입을 JSON 문자열로 인코딩하려면 `MarshalText` 를 구현하는 것이 보통 더 간결합니다 (따옴표와 이스케이프를 직접 처리할 필요 없음).
:::

## time.Time 의 내장 처리

라이브러리는 `time.Time` 에 대해 내장 처리를 수행하여 통일된 RFC3339Nano 형식으로 출력합니다 (초미초 정밀도 보존, 표준 라이브러리 `encoding/json` 과 일치). 어떤 설정도 필요 없습니다:

```go
package main

import (
	"fmt"
	"time"

	"github.com/cybergodev/json"
)

func main() {
	type Event struct {
		Name string    `json:"name"`
		At   time.Time `json:"at"`
	}
	t := time.Date(2026, 1, 15, 10, 30, 0, 0, time.UTC)
	e := Event{Name: "deploy", At: t}

	out, err := json.Marshal(e)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(out))
	// 출력：{"name":"deploy","at":"2026-01-15T10:30:00Z"}
}
```

다른 시간 형식이 필요하면 해당 타입에 대해 `MarshalJSON` 을 구현 ([위](#json-marshaler-인터페이스) 참조) 하여 내장 동작을 덮어쓸 수 있습니다 — 커스텀 타입의 `MarshalJSON` 이 항상 `time.Time` 의 기본 처리보다 우선합니다.

## 커스텀 문자 이스케이프 CustomEscapes

`Config.CustomEscapes` 는 `map[rune]string` 으로, 특정 문자의 이스케이프 방식을 **전역적으로 덮어씁니다**. 문자열을 인코딩할 때 라이브러리는 먼저 이 매핑을 조회합니다: 적중하면 해당 문자열을 출력에 그대로 쓰고 (JSON 유효성은 직접 보장해야 함), 적중하지 않으면 기본 이스케이프를 따릅니다.

아래는 저작권 기호 `©` 를 ASCII 텍스트로 재작성합니다 (적중 시 그대로 쓰고, 나머지 문자는 기본 처리):

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	cfg := json.DefaultConfig()
	// © 는 기본적으로 그대로 출력; 여기서 ASCII 텍스트로 재작성
	cfg.CustomEscapes = map[rune]string{
		'©': "(c)",
	}

	out, err := json.EncodeWithConfig(map[string]string{"note": "Copyright © 2026"}, cfg)
	if err != nil {
		panic(err)
	}
	fmt.Println(out)
	// 출력：{"note":"Copyright (c) 2026"}
}
```

::: warning 커스텀 이스케이프 문자열은 JSON 유효해야 함
`CustomEscapes` 의 값은 출력에 **그대로 쓰이며** 재처리되지 않으므로, Go 소스 코드 자체의 문자열 이스케이프에 주의해야 합니다: 출력에 리터럴 백슬래시 이스케이프 시퀀스를 원하면 Go 소스 코드에 백슬래시 두 개 `\\` 를 써야 합니다 (단일 백슬래시는 Go 가 이스케이프로 처리하여 이스케이프 시퀀스가 아닌 해당 문자 자체를 얻게 됨).
:::

::: tip 커스텀 이스케이프 경로가 트리거되는 조건
`CustomEscapes` (non-nil) 를 설정하면 커스텀 인코딩 경로가 활성화됩니다. 이 경로는 동시에 `EscapeHTML`, `EscapeUnicode`, `EscapeSlash`, `EscapeNewlines`, `EscapeTabs`, `SortKeys`, `FloatPrecision`, `IncludeNulls` 등의 필드도 읽습니다 (상세는 [설정 옵션](../api-reference/config) 참조).
:::

## 확장점 선택 방법

| 요구 | 사용 방식 |
|------|----------|
| 어떤 타입이 자신의 JSON 형태를 커스터마이징 | `MarshalJSON()` 구현 |
| 어떤 타입을 JSON 문자열로 인코딩 (텍스트 표현) | `MarshalText()` 구현 |
| 전역적으로 특정 문자의 이스케이프 규칙 변경 | `Config.CustomEscapes` |
| 들여쓰기, HTML 이스케이프, Unicode 이스케이프, 키 정렬, 부동소수점 정밀도 등 제어 | `Config` 의 `Pretty`/`EscapeHTML`/`EscapeUnicode`/`SortKeys`/`FloatPrecision` 등 필드 ([설정 옵션](../api-reference/config) 참조) |
| `time.Time` 의 기본 시간 형식 덮어쓰기 | 커스텀 시간 타입에 `MarshalJSON()` 구현 |

## Config 에서 적용되는 인코딩 관련 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `CustomEscapes` | `map[rune]string` | 커스텀 문자 이스케이프 매핑 (적중 시 그대로 출력) |
| `EscapeHTML` | `bool` | `<` `>` `&` 이스케이프 여부 (기본값 `true`) |
| `EscapeUnicode` | `bool` | `>0x7F` 인 문자를 `\uXXXX` 로 이스케이프할지 |
| `EscapeSlash` | `bool` | `/` 이스케이프 여부 |
| `EscapeNewlines` / `EscapeTabs` | `bool` | 줄바꿈/탭 이스케이프 여부 |
| `SortKeys` | `bool` | 객체 키 정렬 여부 (객체 키는 기본적으로 정렬됨) |
| `FloatPrecision` | `int` | 부동소수점 정밀도 (`-1` 이 기본값) |
| `IncludeNulls` | `bool` | 빈 값 필드 포함 여부 |

## 연결되지 않은 확장 필드 (예약)

::: warning 미연결 확장 필드
`Config.CustomEncoder` (`CustomEncoder` 인터페이스) 와 `Config.CustomTypeEncoders` (`TypeEncoder` 인터페이스) 는 현재 버전에서 **선언되어 설정 클로닝과 캐시 키 계산에 참여하지만, 인코딩 파이프라인에 아직 연결되지 않았습니다**. 이 두 필드를 설정해도 **인코딩 출력은 변하지 않습니다**. 이들은 향후 버전을 위한 예약 확장점입니다; 그 전까지는 위의 `MarshalJSON`/`MarshalText`/`CustomEscapes` 등 이미 적용되는 메커니즘을 사용하세요.

```go
// 현재 버전: 아래 두 필드는 선언되었으나 연결되지 않았으며, 설정해도 효과 없음 (예약 인터페이스)
type CustomEncoder interface {
    Encode(value any) (string, error)
}

type TypeEncoder interface {
    Encode(v reflect.Value) (string, error)
}
```
:::

## 관련 문서

- [인터페이스 정의](../api-reference/interfaces) - `Marshaler` / `TextMarshaler` / `CustomEncoder` / `TypeEncoder` 인터페이스
- [설정 옵션](../api-reference/config) - 인코딩 관련 설정 필드
- [Hooks 훅 시스템](./hooks) - 작업 전후 가로채기 (사용 가능한 검증 훅 포함)
