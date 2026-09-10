---
sidebar_label: "조회 및 가져오기"
title: "Processor 경로 쿼리 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON Processor 경로 쿼리: Get/GetString/GetInt 타입별 가져오기, GetMultiple 배치, SafeGet 의 AccessResult 반환과 GetTyped[T] 제네릭으로 JSONPath 를 지원합니다."
sidebar_position: 2
---

# 경로 쿼리 메서드

Processor 는 다양한 타입 안전 경로 쿼리 메서드를 제공합니다.

::: tip 패키지 레벨 함수와의 미러 관계
이 페이지의 메서드와 [패키지 레벨 쿼리 함수](../functions/query) 는 같은 동작의 두 가지 입구입니다: 경로 문법, 반환 타입, 오류 의미가 완전히 같습니다. 이 페이지는 Processor 쪽의 설정 의미와 재사용 패턴에 집중하며, 함수 수준의 전체 예제는 패키지 레벨 페이지를 참조하세요.
:::

## 기본 쿼리

### Get

시그니처: `func (p *Processor) Get(jsonStr, path string, cfg ...Config) (result any, err error)`

지정된 경로에서 임의 타입의 값을 가져옵니다.

```go
val, err := p.Get(data, "items[0]")
if err != nil {
	panic(err)
}
```

### GetString

시그니처: `func (p *Processor) GetString(jsonStr, path string, defaultValue ...string) string`

지정된 경로에서 문자열 값을 가져옵니다. 경로가 없거나, 값이 null 이 거나, 타입 변환이 실패하면 빈 문자열 또는 `defaultValue` 를 반환합니다.

```go
// 기본값 미제공
name := p.GetString(data, "user.name")

// 기본값 제공
email := p.GetString(data, "user.email", "unknown@example.com")
```

### GetInt

시그니처: `func (p *Processor) GetInt(jsonStr, path string, defaultValue ...int) int`

지정된 경로에서 정수 값을 가져옵니다. 경로가 없거나, 값이 null 이 거나, 타입 변환이 실패하면 0 또는 `defaultValue` 를 반환합니다.

```go
count := p.GetInt(data, "count")
timeout := p.GetInt(data, "timeout", 30)
```

### GetFloat

시그니처: `func (p *Processor) GetFloat(jsonStr, path string, defaultValue ...float64) float64`

지정된 경로에서 부동소수점 값을 가져옵니다. 경로가 없거나, 값이 null 이 거나, 타입 변환이 실패하면 0 또는 `defaultValue` 를 반환합니다.

```go
price := p.GetFloat(data, "price")
rate := p.GetFloat(data, "rate", 0.5)
```

### GetBool

시그니처: `func (p *Processor) GetBool(jsonStr, path string, defaultValue ...bool) bool`

지정된 경로에서 불리언 값을 가져옵니다. 경로가 없거나, 값이 null 이 거나, 타입 변환이 실패하면 false 또는 `defaultValue` 를 반환합니다.

```go
enabled := p.GetBool(data, "enabled")
debug := p.GetBool(data, "debug", false)
```

::: tip 타입화된 조회는 cfg 를 받지 않음
`GetString`/`GetInt` 등 typed getter 의 가변 인자는 `Config` 가 아니라 **기본값**입니다 (Go 는 가변 인자를 하나만 허용하며, 이는 공식 설계의 세 가지 예외 중 하나입니다). `Config` 로 제어되는 타입화된 읽기가 필요하면 `New(cfg)` 로 프로세서를 만든 뒤 그것의 `GetString`/`GetInt` 등 타입화 메서드를 호출하거나, `SafeGet` + `AsInt()` 등 변환 메서드를 사용하세요.
:::

### GetWithContext

시그니처: `func (p *Processor) GetWithContext(ctx context.Context, jsonStr, path string, cfg ...Config) (any, error)`

컨텍스트가 있는 경로 조회입니다. 타임아웃과 취소를 지원하며 `Get` 의 컨텍스트 인식 버전입니다.

::: info 주의
Context 는 작업 전후에 검사하며 파싱/탐색 도중에는 검사하지 않습니다. 대형 JSON 문서에서는 작업 중 취소에 응답하지 않을 수 있습니다.
:::

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

val, err := p.GetWithContext(ctx, data, "items[0].name")
if err != nil {
	panic(err)
}
fmt.Println(val)
```

## 안전 쿼리

### SafeGet

시그니처: `func (p *Processor) SafeGet(jsonStr, path string, cfg ...Config) AccessResult`

값을 안전하게 가져와 AccessResult 구조체를 반환합니다. 타입 변환이 필요한 시나리오에 적합합니다.

```go
result := p.SafeGet(data, "user.age")
if result.Ok() {
	age, err := result.AsInt()
	if err != nil {
		// 타입 변환 실패
	}
	fmt.Println(age)
}

// 다른 타입도 가져올 수 있음
name, err := result.AsString()
price, err := result.AsFloat64()
enabled, err := result.AsBool()
```

**AccessResult 메서드**:

| 메서드 | 설명 |
|------|------|
| `Ok() bool` | 값 존재 여부 검사 |
| `Unwrap() any` | 원시 값 가져오기 |
| `UnwrapOr(defaultValue any) any` | 값 또는 기본값 가져오기 |
| `AsString() (string, error)` | 안전하게 문자열로 변환 |
| `AsStringConverted() (string, error)` | 포맷팅하여 문자열로 변환 |
| `AsInt() (int, error)` | 안전하게 정수로 변환 |
| `AsFloat64() (float64, error)` | 안전하게 부동소수점으로 변환 |
| `AsBool() (bool, error)` | 안전하게 불리언으로 변환 |

## 컬렉션 조회

### GetArray

시그니처: `func (p *Processor) GetArray(jsonStr, path string, defaultValue ...[]any) []any`

지정된 경로에서 배열을 가져옵니다. 경로가 없거나, 값이 null 이 거나, 타입 변환이 실패하면 nil 또는 `defaultValue` 를 반환합니다.

```go
items := p.GetArray(data, "items")
tags := p.GetArray(data, "tags", []any{"default"})
```

### GetObject

시그니처: `func (p *Processor) GetObject(jsonStr, path string, defaultValue ...map[string]any) map[string]any`

지정된 경로에서 객체를 가져옵니다. 경로가 없거나, 값이 null 이 거나, 타입 변환이 실패하면 nil 또는 `defaultValue` 를 반환합니다.

```go
profile := p.GetObject(data, "user.profile")
config := p.GetObject(data, "config", map[string]any{"timeout": 30})
```

## 제네릭 조회

::: tip 패키지 레벨 함수
`GetTyped[T]` 는 패키지 레벨 함수이지 Processor 메서드가 아닙니다. 자세한 내용은 [제네릭 작업](../generics#gettyped) 을 참조하세요.
:::

```go
// 패키지 레벨 GetTyped 사용
user := json.GetTyped[User](data, "user")

// 기본값 포함
user = json.GetTyped[User](data, "user", User{Name: "unknown"})
```

## 배치 쿼리

### GetMultiple

시그니처: `func (p *Processor) GetMultiple(jsonStr string, paths []string, cfg ...Config) (map[string]any, error)`

여러 경로의 값을 한 번에 가져와 경로-값 매핑을 반환합니다.

```go
results, err := p.GetMultiple(data, []string{"user.name", "user.age", "user.email"})
if err != nil {
	panic(err)
}
fmt.Println(results["user.name"]) // Alice
fmt.Println(results["user.age"])  // 30
```

## 경로 컴파일

### CompilePath

시그니처: `func (p *Processor) CompilePath(path string) (*CompiledPath, error)`

경로 표현식을 사전 컴파일하여 이후 빠른 반복 작업에 사용합니다.

```go
cp, err := p.CompilePath("users[0].name")
if err != nil {
	panic(err)
}
defer cp.Release()

// 컴파일된 경로로 여러 번 쿼리
value, err := p.GetCompiled(data1, cp)
value, err = p.GetCompiled(data2, cp)
```

### GetCompiled

시그니처: `func (p *Processor) GetCompiled(jsonStr string, cp *CompiledPath) (any, error)`

사전 컴파일 경로로 값을 가져옵니다. 여러 JSON 데이터에 같은 경로를 반복 쿼리할 때 적합합니다.

::: warning Get 과의 두 가지 차이
- **per-call `cfg` 를 받지 않음**: 입력 검증 (크기, 깊이, 위험 패턴) 은 항상 프로세서 자체 설정으로 실행됩니다.
- **결과 캐시를 조회하지 않음**: 절약되는 것은 경로 파싱 오버헤드이며, JSON 자체는 매번 파싱됩니다; 파싱까지 재사용하려면 [`PreParse`](#preparse) 와 함께 사용하세요.
:::

**전체 예제: 문서 묶음에 같은 경로를 반복 쿼리**

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

	docs := []string{
		`{"user":{"name":"Alice"}}`,
		`{"user":{"name":"Bob"}}`,
	}
	for _, doc := range docs {
		name, err := p.GetCompiled(doc, cp)
		if err != nil {
			panic(err)
		}
		fmt.Println(name)
	}
}

// 출력:
// Alice
// Bob
```

## 사전 파싱 쿼리

### PreParse

시그니처: `func (p *Processor) PreParse(jsonStr string, cfg ...Config) (*ParsedJSON, error)`

JSON 문서를 사전 파싱하여 재사용 가능한 `*ParsedJSON` 을 반환합니다. 같은 JSON 을 여러 번 쿼리할 때 한 번만 파싱하고 이후 쿼리는 바로 탐색합니다.

```go
parsed, err := p.PreParse(largeJSON)
if err != nil {
	panic(err)
}
defer parsed.Release() // 다 쓴 뒤 파싱 트리 참조 해제

// 여러 쿼리가 파싱 결과 재사용
name, _ := p.GetFromParsed(parsed, "user.name")
email, _ := p.GetFromParsed(parsed, "user.email")
tags, _ := p.GetFromParsed(parsed, "tags")
```

### GetFromParsed

시그니처: `func (p *Processor) GetFromParsed(parsed *ParsedJSON, path string, cfg ...Config) (any, error)`

사전 파싱 결과에서 경로로 값을 가져와 JSON 파싱 단계를 건너뜁니다.

컨테이너류 결과 (`map[string]any` / `[]any`) 는 기본적으로 방어적 깊은 복사 후 반환하고 기본 타입은 직접 반환합니다; 프로세서가 `Config.CacheSharedResults` 를 켜면 (호출자가 반환값을 수정하지 않겠다는 약속) 복사를 건너뜁니다. `GetFromParsed` 자체는 **결과 캐시에 기록하지 않습니다** — 사전 파싱이 재사용하는 것은 파싱 트리 자체이지 쿼리 결과가 아닙니다.

**ParsedJSON 메서드**

| 메서드 | 설명 |
|------|------|
| `Data() any` | 기저 파싱 결과 가져오기 (`map[string]any` / `[]any`) |
| `Release()` | 내부 데이터 참조를 비워 파싱 트리가 GC 되게 함 (호출 후 `Data()` 는 `nil`, `defer` 와 함께 사용 권장) |

::: tip CompilePath 와의 역할 분담
`PreParse` 는 '같은 JSON 의 반복 파싱'을, `CompilePath` 는 '같은 경로의 반복 파싱'을 절약합니다; `SetFromParsed` ([파싱 및 검증](./parse#setfromparsed) 참조) 는 사전 파싱 결과에서 체인 수정을 지원합니다. 선택 기준은 [Processor 가이드](../../getting-started/processor-guide) 를 참조하세요.
:::

## 관련 문서

- [데이터 수정](./modify) - Set/Delete 메서드
- [배치 작업](./batch) - ProcessBatch 배치 처리
- [제네릭 작업](../generics) - GetTyped[T] 제네릭 조회
