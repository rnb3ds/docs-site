---
sidebar_label: "파싱 및 검증"
title: "Processor 파싱과 검증 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON Processor 파싱 메서드: Valid 실패 이유 반환 검증, ValidBytes 빠른 판정, Parse 파싱, ParseAny 임의 타입, PreParse 사전 파싱 최적화와 GetFromParsed 빠른 쿼리로 설정 기반 파싱을 지원합니다."
sidebar_position: 6
---

# 파싱과 검증 메서드

Processor 는 JSON 파싱과 유효성 검증 메서드를 제공합니다. 파일 읽기/쓰기와 스트리밍 로드는 [파일 I/O](./file-io) 를 참조하세요. 파싱/검증 동작은 [패키지 레벨 파싱 함수](../functions/parse) 와 미러로 일치합니다; 패키지 레벨 `Valid` 는 단일 `bool` 을 반환 (표준 라이브러리 호환) 하므로, 실패 원인이 필요하면 이 페이지의 `Valid` 나 패키지 레벨 `ValidWithConfig` 를 사용하세요.

## 검증 메서드

### Valid

시그니처: `func (p *Processor) Valid(jsonStr string, cfg ...Config) (bool, error)`

JSON 문자열이 유효한지 검증합니다. 유효하면 `(true, nil)`; 잘못되었으면 `(false, error)` 를 반환하며 오류에 구체적 원인이 담깁니다.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New(json.DefaultConfig())
	if err != nil {
		panic(err)
	}
	defer p.Close()

	cases := []string{
		`{"name":"CyberGo","age":25}`,
		`{"name":}`,
	}
	for _, c := range cases {
		valid, err := p.Valid(c)
		fmt.Printf("valid=%-5v 오류있음=%v\n", valid, err != nil)
	}
}

// 출력:
// valid=true  오류있음=false
// valid=false 오류있음=true
```

### ValidBytes

시그니처: `func (p *Processor) ValidBytes(data []byte) bool`

바이트 슬라이스가 유효한 JSON 인지 검증하며 불리언만 반환합니다 (`encoding/json.Valid` 시그니처와 호환, 오류 상세가 필요 없는 빠른 판정에 적합).

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New(json.DefaultConfig())
	if err != nil {
		panic(err)
	}
	defer p.Close()

	fmt.Println(p.ValidBytes([]byte(`{"ok":true}`))) // true
	fmt.Println(p.ValidBytes([]byte(`{not json}`)))  // false
}

// 출력:
// true
// false
```

## 파싱 메서드

### Parse

시그니처: `func (p *Processor) Parse(jsonStr string, target any, cfg ...Config) error`

JSON 문자열을 대상 변수로 파싱하며, `target` 은 비어 있지 않은 포인터여야 합니다. `map[string]any`, 구조체, `any` 로의 파싱을 지원하며 `Config` 로 숫자 보존 모드를 전환할 수 있습니다.

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
	p, err := json.New(json.DefaultConfig())
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data := `{"name":"CyberGo","age":25}`

	// map[string]any 로 파싱 (숫자는 기본적으로 float64)
	var obj map[string]any
	if err := p.Parse(data, &obj); err != nil {
		panic(err)
	}
	fmt.Printf("map: name=%v age=%T(%v)\n", obj["name"], obj["age"], obj["age"])

	// 구조체로 파싱
	var u User
	if err := p.Parse(data, &u); err != nil {
		panic(err)
	}
	fmt.Printf("struct: %+v\n", u)
}

// 출력:
// map: name=CyberGo age=float64(25)
// struct: {Name:CyberGo Age:25}
```

### ParseAny

시그니처: `func (p *Processor) ParseAny(jsonStr string, cfg ...Config) (any, error)`

JSON 문자열을 파싱해 루트 값을 `any` 로 바로 반환하며, 대상 타입을 미리 선언할 필요가 없습니다. 내부적으로 `Parse(jsonStr, &v)` 와 동등합니다.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New(json.DefaultConfig())
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data, err := p.ParseAny(`{"name":"CyberGo","age":25}`)
	if err != nil {
		panic(err)
	}
	obj := data.(map[string]any)
	fmt.Printf("name=%v age=%v\n", obj["name"], obj["age"])
}

// 출력:
// name=CyberGo age=25
```

### PreserveNumbers 모드

기본 (`PreserveNumbers=false`) 으로 모든 JSON 숫자는 `float64` 로 파싱되어 큰 정수의 정밀도를 잃고 소수 표기가 바뀔 수 있습니다. `PreserveNumbers=true` 를 켜면 숫자가 라이브러리의 `Number` 타입으로 보존됩니다 (`%T` 로 출력하면 `json.Number` — 라이브러리 패키지명이 표준 라이브러리와 같음; 기저는 원본 문자열이며 API 는 표준 라이브러리 `json.Number` 와 완전히 동일) 하여 원문 형식과 정밀도를 온전히 유지하며, 금액, 큰 정수, 과학적 표기법 등의 시나리오에 적합합니다. 아래 예제는 `%T` 로 두 모드에서 숫자의 Go 타입 차이를 보여줍니다:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New(json.DefaultConfig())
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data := `{"id":42,"price":19.99}`

	// 기본 모드: 모든 숫자는 float64 로 파싱
	var def any
	if err := p.Parse(data, &def); err != nil {
		panic(err)
	}
	defM := def.(map[string]any)
	fmt.Printf("기본      : id 타입=%T 값=%v\n", defM["id"], defM["id"])

	// PreserveNumbers 모드: 숫자는 json.Number 로 보존
	cfg := json.DefaultConfig()
	cfg.PreserveNumbers = true
	var preserved any
	if err := p.Parse(data, &preserved, cfg); err != nil {
		panic(err)
	}
	preM := preserved.(map[string]any)
	fmt.Printf("숫자 보존: id 타입=%T 값=%v\n", preM["id"], preM["id"])
}

// 출력:
// 기본      : id 타입=float64 값=42
// 숫자 보존: id 타입=json.Number 값=42
```

::: tip 켜야 할 때
금융 금액, `float64` 의 정확한 표현 범위 (약 ±2^53, 즉 9007199254740992) 를 넘는 정수, 또는 숫자를 원문 그대로 다시 기록해야 할 때 (`19.99` 와 `19.990000` 이 서로 바뀌는 것을 방지) `PreserveNumbers` 켜기를 권장합니다. 예를 들어 `9007199254740993` (2^53+1) 은 기본 모드에서 `9007199254740992` 로 반올림되지만 `json.Number` 모드에서는 원값이 유지됩니다. 단, `json.Number` 는 `.Int64()` / `.Float64()` / `.String()` 으로 명시적으로 값을 꺼내야 합니다.
:::

## 사전 파싱 최적화 (PreParse)

**같은 JSON** 에 대해 여러 번 경로 쿼리가 필요할 때 [`Get`](./query) 을 매번 호출하면 문서 전체를 반복 파싱합니다. `PreParse` 는 한 번만 파싱하고, 이후 `GetFromParsed` 가 이미 파싱된 데이터 구조에서 바로 탐색해 중복 파싱 오버헤드를 없앱니다.

### PreParse

시그니처: `func (p *Processor) PreParse(jsonStr string, cfg ...Config) (*ParsedJSON, error)`

JSON 을 사전 파싱하여 재사용 가능한 `*ParsedJSON` 을 반환합니다. 다 쓴 뒤에는 `parsed.Release()` 를 호출해 프로세서에 대한 참조를 해제해야 합니다.

### GetFromParsed

시그니처: `func (p *Processor) GetFromParsed(parsed *ParsedJSON, path string, cfg ...Config) (any, error)`

사전 파싱 데이터에서 경로로 값을 가져오며, JSON 파싱을 건너뛰고 바로 경로 탐색을 합니다.

### 전체 비교 예제

아래 예제는 '패키지 레벨 `Get` 여러 번 (매번 재파싱)' 과 '`PreParse` + `GetFromParsed` (한 번만 파싱)' 을 비교합니다. 결과는 같지만 후자는 쿼리 수가 많고 문서가 클수록 눈에 띄게 빠릅니다:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New(json.DefaultConfig())
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data := `{"user":{"name":"CyberGo","age":25},"meta":{"version":2,"env":"prod"}}`

	// 방법 1: 패키지 레벨 Get 은 매번 JSON 을 다시 파싱
	name1, err := json.Get(data, "user.name")
	if err != nil {
		panic(err)
	}
	age1, err := json.Get(data, "user.age")
	if err != nil {
		panic(err)
	}
	ver1, err := json.Get(data, "meta.version")
	if err != nil {
		panic(err)
	}

	// 방법 2: PreParse 로 한 번 파싱, GetFromParsed 가 파싱 결과 재사용 (다중 쿼리에 권장)
	parsed, err := p.PreParse(data)
	if err != nil {
		panic(err)
	}
	defer parsed.Release()

	name2, err := p.GetFromParsed(parsed, "user.name")
	if err != nil {
		panic(err)
	}
	age2, err := p.GetFromParsed(parsed, "user.age")
	if err != nil {
		panic(err)
	}
	ver2, err := p.GetFromParsed(parsed, "meta.version")
	if err != nil {
		panic(err)
	}

	fmt.Println("Get     :", name1, age1, ver1)
	fmt.Println("PreParse:", name2, age2, ver2)
}

// 출력:
// Get     : CyberGo 25 2
// PreParse: CyberGo 25 2
```

### SetFromParsed

시그니처: `func (p *Processor) SetFromParsed(parsed *ParsedJSON, path string, value any, cfg ...Config) (*ParsedJSON, error)`

사전 파싱 데이터에 값을 설정하고 **새로운** `*ParsedJSON` 을 반환합니다 (내부적으로 깊은 복사, 원본 데이터는 불변) — 새 결과에서 `GetFromParsed` 쿼리를 이어갈 수 있습니다.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New(json.DefaultConfig())
	if err != nil {
		panic(err)
	}
	defer p.Close()

	parsed, err := p.PreParse(`{"user":{"name":"CyberGo","age":25}}`)
	if err != nil {
		panic(err)
	}
	defer parsed.Release()

	// SetFromParsed 는 새 ParsedJSON 반환, 원본 데이터는 불변
	modified, err := p.SetFromParsed(parsed, "user.name", "Bob")
	if err != nil {
		panic(err)
	}
	defer modified.Release()

	oldName, _ := p.GetFromParsed(parsed, "user.name")
	newName, _ := p.GetFromParsed(modified, "user.name")
	ageAfter, _ := p.GetFromParsed(modified, "user.age")
	fmt.Println("원본 name :", oldName)
	fmt.Println("수정 후 name :", newName)
	fmt.Println("수정 후 age :", ageAfter)
}

// 출력:
// 원본 name : CyberGo
// 수정 후 name : Bob
// 수정 후 age : 25
```

### ParsedJSON 타입

`ParsedJSON` 은 파싱된 데이터와 캐시 정보를 감싸며, 필드는 익스포트되지 않고 두 메서드만 노출합니다:

| 메서드 | 설명 |
|------|------|
| `Data() any` | 기저의 파싱된 데이터 반환 (보통 `map[string]any` 또는 `[]any`) |
| `Release()` | 프로세서에 대한 참조 해제; 호출 후 `Data()` 는 `nil` 을 반환하므로 `defer` 와 함께 사용 |

## 메서드 선택 가이드

| 시나리오 | 추천 메서드 | 입력 | 출력 |
|------|----------|------|------|
| 유효 여부만 판정 (오류 상세 불필요) | `ValidBytes` | `[]byte` | `bool` |
| 유효 여부와 실패 원인 모두 | `Valid` | `string` | `(bool, error)` |
| 구조체/구체적 타입으로 파싱 | `Parse` | `string` | `target` 포인터에 기록 |
| `any` 로 파싱 (타입 미리 선언 불필요) | `ParseAny` | `string` | `any` |
| `encoding/json` 호환 (`[]byte` 입력) | [`Unmarshal`](./output#unmarshal) | `[]byte` | `target` 포인터에 기록 |
| 같은 JSON 을 여러 경로로 쿼리 | `PreParse` + `GetFromParsed` | `string` | `*ParsedJSON` / `any` |
| 파싱된 데이터를 수정하고 쿼리 계속 | `PreParse` + `SetFromParsed` + `GetFromParsed` | `string` | `*ParsedJSON` |
| 숫자 원본 정밀도 유지 | 위 파싱 메서드 중 하나 + `Config{PreserveNumbers: true}` | — | 숫자가 `json.Number` |

::: tip Parse vs ParseAny vs Unmarshal
- **`Unmarshal(data, &v)`**: 표준 라이브러리 `encoding/json` 과 완전히 호환되며 입력이 `[]byte` — 표준 라이브러리를 직접 대체하거나 네트워크/파일 바이트 스트림을 다룰 때 적합.
- **`Parse(jsonStr, &v)`**: 입력이 `string` 이고 의미는 `Unmarshal` 과 같지만 `Config` (보안 제한, `PreserveNumbers` 등) 를 네이티브로 지원해 일상적인 파싱의 첫 선택.
- **`ParseAny(jsonStr)`**: 대상 타입을 미리 선언할 필요 없이 `any` 를 바로 반환 — 구조를 모르거나 일회성으로 값을 꺼낼 때 적합.

셋의 기저 파싱 능력은 동등하며, 차이는 입력 타입과 대상 변수 준비 여부뿐입니다.
:::

## 관련 문서

- [파일 I/O](./file-io) - LoadFromFile/SaveToFile 등 파일 메서드
- [출력 메서드](./output) - Encode/EncodePretty/Unmarshal 인코딩 메서드
- [경로 쿼리](./query) - Get 계열 메서드
- [패키지 레벨 파싱 함수](../functions/parse) - Processor 없이 쓰는 Parse/ParseAny/Valid
