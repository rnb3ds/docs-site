---
sidebar_label: "파싱 및 검증"
title: "Processor 파싱과 검증 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON Processor 파싱 메서드: Valid 검증, Parse 파싱, ParseAny 임의 타입, PreParse 사전 파싱 최적화와 GetFromParsed 빠른 쿼리, 설정 기반 파싱을 지원합니다."
sidebar_position: 6
---

# 파싱과 검증 메서드

Processor 는 JSON 파싱과 유효성 검증 메서드를 제공합니다. 파일 읽기/쓰기 및 스트리밍 로드는 [파일 I/O](./file-io)를 참고하세요.

## 검증 메서드

### Valid

시그니처: `func (p *Processor) Valid(jsonStr string, cfg ...Config) (bool, error)`

JSON 문자열이 유효한지 검증합니다. 유효하면 `(true, nil)` 을 반환하고; 유효하지 않으면 `(false, error)` 를 반환하며 오류가 구체적인 원인을 전달합니다.

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
        fmt.Printf("valid=%-5v 오류 있음=%v\n", valid, err != nil)
    }
}
// 출력：
// valid=true  오류 있음=false
// valid=false 오류 있음=true
```

### ValidBytes

시그니처: `func (p *Processor) ValidBytes(data []byte) bool`

바이트 슬라이스가 유효한 JSON 인지 검증하고 불리언만 반환합니다 (`encoding/json.Valid` 와 시그니처 호환, 오류 상세가 불필요한 빠른 판정에 적합).

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
    fmt.Println(p.ValidBytes([]byte(`{not json}`)))   // false
}
// 출력：
// true
// false
```

## 파싱 메서드

### Parse

시그니처: `func (p *Processor) Parse(jsonStr string, target any, cfg ...Config) error`

JSON 문자열을 대상 변수로 파싱하며, `target` 은 비어있지 않은 포인터여야 합니다. `map[string]any`, 구조체 또는 `any` 로의 파싱을 지원하며, `Config` 로 숫자 보존 모드를 전환할 수 있습니다.

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
// 출력：
// map: name=CyberGo age=float64(25)
// struct: {Name:CyberGo Age:25}
```

### ParseAny

시그니처: `func (p *Processor) ParseAny(jsonStr string, cfg ...Config) (any, error)`

JSON 문자열을 파싱하여 루트 값을 `any` 로 직접 반환하며, 대상 타입을 미리 선언할 필요가 없습니다. 내부적으로 `Parse(jsonStr, &v)` 와 동일합니다.

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
// 출력：
// name=CyberGo age=25
```

### PreserveNumbers 모드

기본 (`PreserveNumbers=false`) 으로 모든 JSON 숫자가 `float64` 로 파싱되어, 큰 정수 정밀도를 잃고 소수 표기 형식이 바뀔 수 있습니다. `PreserveNumbers=true` 를 켜면 숫자가 `json.Number` (내부적으로 원본 문자열) 로 보존되어 원본 형식과 정밀도를 완전히 유지합니다. 금액, 큰 정수, 과학적 표기법 등의 시나리오에 적합합니다. 아래 예제는 `%T` 로 두 모드에서 숫자의 Go 타입 차이를 직관적으로 보여줍니다:

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

    // 기본 모드: 모든 숫자가 float64 로 파싱
    var def any
    if err := p.Parse(data, &def); err != nil {
        panic(err)
    }
    defM := def.(map[string]any)
    fmt.Printf("기본   : id 타입=%T 값=%v\n", defM["id"], defM["id"])

    // PreserveNumbers 모드: 숫자가 json.Number 로 보존
    cfg := json.DefaultConfig()
    cfg.PreserveNumbers = true
    var preserved any
    if err := p.Parse(data, &preserved, cfg); err != nil {
        panic(err)
    }
    preM := preserved.(map[string]any)
    fmt.Printf("숫자 보존: id 타입=%T 값=%v\n", preM["id"], preM["id"])
}
// 출력：
// 기본   : id 타입=float64 값=42
// 숫자 보존: id 타입=json.Number 값=42
```

::: tip 언제 활성화해야 할까
금융 금액, `float64` 의 정확한 표현 범위 (약 ±2^53, 즉 9007199254740992) 를 초과하는 정수, 또는 숫자를 있는 그대로 다시 써야 할 때 (`19.99` 와 `19.990000` 이 서로 변환되지 않도록) `PreserveNumbers` 활성화를 권장합니다. 예를 들어 `9007199254740993` (2^53+1) 은 기본 모드에서 `9007199254740992` 로 반올림되지만, `json.Number` 모드에서는 원본 값을 유지합니다. `json.Number` 는 `.Int64()` / `.Float64()` / `.String()` 으로 명시적으로 값을 꺼내야 함에 주의하세요.
:::

## 사전 파싱 최적화 (PreParse)

**동일한 JSON** 에 대해 여러 경로 쿼리가 필요할 때, 매번 [`Get`](./query) 을 호출하면 전체 문서를 반복 파싱하게 됩니다. `PreParse` 는 한 번만 파싱하고, 이후 `GetFromParsed` 가 이미 파싱된 데이터 구조에서 직접 탐색하여 반복 파싱 오버헤드를 제거합니다.

### PreParse

시그니처: `func (p *Processor) PreParse(jsonStr string, cfg ...Config) (*ParsedJSON, error)`

JSON 을 사전 파싱하여 재사용 가능한 `*ParsedJSON` 을 반환합니다. 사용 후 `parsed.Release()` 로 프로세서에 대한 참조를 해제해야 합니다.

### GetFromParsed

시그니처: `func (p *Processor) GetFromParsed(parsed *ParsedJSON, path string, cfg ...Config) (any, error)`

사전 파싱된 데이터에서 경로로 값을 가져오며, JSON 파싱을 건너뛰고 직접 경로 탐색을 수행합니다.

### 전체 비교 예제

아래 예제는 "여러 번 패키지 레벨 `Get` (매번 재파싱)" 과 "`PreParse` + `GetFromParsed` (한 번만 파싱)" 두 방식을 비교합니다. 두 결과는 동일하지만, 후자는 쿼리 횟수가 많거나 문서가 클 때 눈에 띄게 더 빠릅니다:

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

    // 방식 1: 매번 패키지 레벨 Get 은 JSON 을 재파싱
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

    // 방식 2: PreParse 로 한 번 파싱, GetFromParsed 가 파싱 결과 재사용 (다중 쿼리에 추천)
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
// 출력：
// Get     : CyberGo 25 2
// PreParse: CyberGo 25 2
```

### SetFromParsed

시그니처: `func (p *Processor) SetFromParsed(parsed *ParsedJSON, path string, value any, cfg ...Config) (*ParsedJSON, error)`

사전 파싱된 데이터에 값을 설정하고 **새로운** `*ParsedJSON` 을 반환합니다 (내부적으로 깊은 복사, 원본 데이터는 불변). 새 결과에서 계속 `GetFromParsed` 로 쿼리할 수 있습니다.

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

    // SetFromParsed 는 새로운 ParsedJSON 을 반환, 원본 데이터는 불변
    modified, err := p.SetFromParsed(parsed, "user.name", "Bob")
    if err != nil {
        panic(err)
    }
    defer modified.Release()

    oldName, _ := p.GetFromParsed(parsed, "user.name")
    newName, _ := p.GetFromParsed(modified, "user.name")
    ageAfter, _ := p.GetFromParsed(modified, "user.age")
    fmt.Println("원본 데이터 name :", oldName)
    fmt.Println("수정 후 name :", newName)
    fmt.Println("수정 후 age :", ageAfter)
}
// 출력：
// 원본 데이터 name : CyberGo
// 수정 후 name : Bob
// 수정 후 age : 25
```

### ParsedJSON 타입

`ParsedJSON` 은 파싱된 데이터와 캐시 정보를 캡슐화하며, 필드는 내보내지 않고 두 개의 메서드만 노출합니다:

| 메서드 | 설명 |
|------|------|
| `Data() any` | 하위 파싱된 데이터 반환 (보통 `map[string]any` 또는 `[]any`) |
| `Release()` | 프로세서에 대한 참조 해제; 호출 후 `Data()` 는 `nil` 을 반환, `defer` 와 함께 사용해야 함 |

## 메서드 선택 가이드

| 시나리오 | 추천 메서드 | 입력 | 출력 |
|------|----------|------|------|
| 유효 여부만 판정 (오류 상세 불필요) | `ValidBytes` | `[]byte` | `bool` |
| 유효 여부 판정 및 실패 원인 획득 | `Valid` | `string` | `(bool, error)` |
| 구조체/구체적 타입으로 파싱 | `Parse` | `string` | `target` 포인터에 기록 |
| `any` 로 파싱 (타입 미리 선언 불필요) | `ParseAny` | `string` | `any` |
| `encoding/json` 호환 (`[]byte` 입력) | [`Unmarshal`](./output#unmarshal) | `[]byte` | `target` 포인터에 기록 |
| 동일 JSON 의 다중 경로 쿼리 | `PreParse` + `GetFromParsed` | `string` | `*ParsedJSON` / `any` |
| 파싱된 데이터 수정 후 계속 쿼리 | `PreParse` + `SetFromParsed` + `GetFromParsed` | `string` | `*ParsedJSON` |
| 숫자 원본 정밀도 보존 | 위 파싱 메서드 중 하나 + `Config{PreserveNumbers: true}` | — | 숫자가 `json.Number` |

::: tip Parse vs ParseAny vs Unmarshal
- **`Unmarshal(data, &v)`**: 표준 라이브러리 `encoding/json` 와 완전히 호환되며, 입력은 `[]byte`, 표준 라이브러리를 직접 교체하거나 네트워크/파일 바이트 스트림을 처리하는 데 적합.
- **`Parse(jsonStr, &v)`**: 입력은 `string`, 의미는 `Unmarshal` 과 동일하지만 `Config` (보안 제한, `PreserveNumbers` 등) 를 네이티브로 지원하여 일상적인 파싱의 첫 선택.
- **`ParseAny(jsonStr)`**: 대상 타입을 미리 선언할 필요 없이 `any` 를 직접 반환하며, 구조를 알 수 없거나 일회성 값 추출에 적합.

세 가지의 하위 파싱 능력은 동등하며, 차이는 입력 타입과 대상 변수를 미리 준비해야 하는지에만 있습니다.
:::

## 관련 문서

- [파일 I/O](./file-io) - LoadFromFile/SaveToFile 등 파일 메서드
- [출력 메서드](./output) - Encode/EncodePretty/Unmarshal 인코딩 메서드
- [경로 쿼리](./query) - Get 시리즈 메서드
- [패키지 레벨 파싱 함수](../functions/parse) - Processor 불필요한 Parse/ParseAny/Valid
