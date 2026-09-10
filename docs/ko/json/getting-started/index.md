---
sidebar_label: "빠른 시작"
title: "빠른 시작 - CyberGo JSON | 5 분 시작 가이드"
description: "CyberGo JSON 빠른 시작: 설치와 설정, 경로 쿼리 GetString/GetInt, Set/Delete 수정, Marshal/Unmarshal 인코딩/디코딩, 반복 순회와 오류 구분, 첫 한 시간에 자주 묻는 질문까지 5 분 안에 Go JSON 처리를 시작합니다."
sidebar_position: 1
---

# 빠른 시작

이 가이드는 `github.com/cybergodev/json` 라이브러리를 빠르게 시작하는 방법을 안내합니다.

## 설치

```bash
go get github.com/cybergodev/json
```

## 기본 사용법

### 패키지 레벨 함수

라이브러리는 프로세서를 생성하지 않고도 사용할 수 있는 편리한 패키지 레벨 함수 집합을 제공합니다:

#### 값 조회

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{
        "name": "CyberGo",
        "version": 1,
        "active": true,
        "price": 99.99,
        "tags": ["json", "go", "fast"],
        "meta": {"author": "dev"}
    }`

	// 범용 조회
	val, err := json.Get(data, "name")
	if err != nil {
		panic(err)
	}
	fmt.Println(val) // CyberGo

	// 타입 안전 조회
	name := json.GetString(data, "name")
	version := json.GetInt(data, "version")
	active := json.GetBool(data, "active")
	price := json.GetFloat(data, "price")
	tags := json.GetArray(data, "tags")
	meta := json.GetObject(data, "meta")

	fmt.Println(name, version, active, price)
	fmt.Println(tags) // [json go fast]
	fmt.Println(meta) // map[author:dev]

	// 기본값으로 조회
	desc := json.GetString(data, "description", "N/A")
	count := json.GetInt(data, "count", 0)
	fmt.Println(desc, count) // N/A 0
}
```

#### 중첩 경로

점으로 구분된 중첩 경로를 지원합니다:

```go
data := `{"user": {"profile": {"name": "Alice"}}}`

name := json.GetString(data, "user.profile.name")
fmt.Println(name) // Alice
```

#### 배열 인덱스

배열 인덱스 접근을 지원합니다:

```go
data := `{"items": ["a", "b", "c"]}`

// 두 가지 문법 모두 지원
item0 := json.GetString(data, "items.0") // "a"
item1 := json.GetString(data, "items.1") // "b"
last := json.GetString(data, "items.-1") // "c"

// 대괄호 문법
first := json.GetString(data, "items[0]")  // "a"
last2 := json.GetString(data, "items[-1]") // "c"

// 범위 조회 (배열 반환)
arr := json.GetArray(data, "items[0:2]") // ["a", "b"]
```

::: tip 더 많은 경로 문법
기본 속성과 배열 인덱스 외에 **배열 슬라이스** `[1:5]`, **와일드카드** `[*]`, **필드 추출** `{name,email}` 등의 고급 문법도 지원합니다. 자세한 내용은 [경로 표현식 문법](./path-syntax) 을 참고하세요.
:::

#### 값 설정

```go
data := `{"name": "old"}`

// 새 값 설정
updated, err := json.Set(data, "name", "new")
if err != nil {
	panic(err)
}
fmt.Println(updated) // {"name":"new"}

// 새 필드 추가
updated, err = json.Set(data, "version", 1)
if err != nil {
	panic(err)
}
fmt.Println(updated) // {"name":"old","version":1}

// 여러 필드를 하나씩 설정 (매번 새 JSON 반환, err 확인 필요)
updated, err = json.Set(data, "name", "updated")
updated, err = json.Set(updated, "version", 2)
updated, err = json.Set(updated, "active", true)
if err != nil {
	panic(err)
}
```

#### 값 삭제

```go
data := `{"name": "test", "temp": "remove"}`

// 필드 삭제
updated, err := json.Delete(data, "temp")
if err != nil {
	panic(err)
}
fmt.Println(updated) // {"name":"test"}
```

### 인코딩과 디코딩

표준 라이브러리와 완전히 호환됩니다:

```go
type User struct {
	Name string `json:"name"`
	Age  int    `json:"age"`
}

// 인코딩
user := User{Name: "Alice", Age: 30}
bytes, err := json.Marshal(user)
if err != nil {
	panic(err)
}
fmt.Println(string(bytes)) // {"name":"Alice","age":30}

// 포맷팅 인코딩
pretty, err := json.MarshalIndent(user, "", "  ")
if err != nil {
	panic(err)
}
fmt.Println(string(pretty))
// {
//   "name": "Alice",
//   "age": 30
// }

// 디코딩
var u User
if err := json.Unmarshal(bytes, &u); err != nil {
	panic(err)
}
fmt.Println(u.Name, u.Age) // Alice 30
```

### 검증

```go
valid := `{"key": "value"}`
invalid := `{key: value}`

fmt.Println(json.Valid([]byte(valid)))   // true
fmt.Println(json.Valid([]byte(invalid))) // false
```

### 포맷팅

```go
compact := `{"name":"test","nested":{"key":"value"}}`

// 포맷팅 출력
pretty, err := json.Prettify(compact)
if err != nil {
	panic(err)
}
fmt.Println(pretty)
// {
//   "name": "test",
//   "nested": {
//     "key": "value"
//   }
// }

// 압축 출력
jsonStr := `{
  "name": "test"
}`
var buf bytes.Buffer
err = json.Compact(&buf, []byte(jsonStr))
if err != nil {
	panic(err)
}
fmt.Println(buf.String()) // {"name":"test"}
```

## Processor 사용

빈번한 작업에는 더 나은 성능과 캐시 효과를 위해 `Processor` 사용을 권장합니다:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// 기본 설정으로 프로세서 생성
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close() // 리소스 해제를 위해 반드시 닫기

	data := `{"name": "test", "value": 42}`

	// 프로세서로 조작
	name := p.GetString(data, "name")
	value := p.GetInt(data, "value")

	fmt.Println(name, value)
}
```

## 설정 옵션

```go
// 기본 설정
cfg := json.DefaultConfig()

// 보안 강화 설정 (신뢰할 수 없는 입력 처리)
// cfg = json.SecurityConfig()

// 포맷팅 출력 설정
// cfg = json.PrettyConfig()

// 커스텀 설정
cfg = json.DefaultConfig()
cfg.MaxJSONSize = 50 * 1024 * 1024 // 50MB
cfg.EnableCache = true
cfg.CacheTTL = 5 * time.Minute

// 커스텀 설정으로 프로세서 생성
p, err := json.New(cfg)
if err != nil {
	panic(err)
}
```

## 반복 순회

배열 요소를 순회하며 각 필드에 안전하게 접근합니다. 요소마다 전체 경로를 쓸 필요가 없습니다:

```go
data := `{"users": [{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]}`

err := json.ForeachWithPath(data, "users", func(key any, item *json.IterableValue) {
	name := item.GetString("name")
	age := item.GetInt("age")
	fmt.Printf("User %v: %s (age %d)\n", key, name, age)
})
if err != nil {
	panic(err)
}
// User 0: Alice (age 30)
// User 1: Bob (age 25)
```

::: tip
`Foreach` 계열은 총 12 개 함수입니다: **조기 종료**가 필요하면 `ForeachWithError` 를 사용하세요 (콜백이 `error` 를 반환하며, `item.Break()` 를 반환하면 중단됩니다); 깊은 중첩 순회, 현재 경로 함께 전달, 파일 반복 등 변형은 [치트시트](./cheatsheet#반복-함수군) 에서 빠르게 확인하세요.
:::

## 오류 처리

경로 작업의 흔한 오류는 **센티널 오류**이며, `errors.Is` 로 정확하게 구분합니다:

```go
val, err := json.Get(data, "user.profile.email")
if err != nil {
	switch {
	case errors.Is(err, json.ErrPathNotFound):
		// 키 없음 — 비즈니스상 흔하며 기본값으로 대체 가능
	case errors.Is(err, json.ErrInvalidJSON):
		// JSON 자체의 형식 오류
	default:
		// 그 외 오류 (한도 초과, 타입 충돌 등): JsonsError 가 작업 이름과 경로를
		// 이미 담고 있으므로 로그만 기록하면 되고 항목별로 나열할 필요 없음
		fmt.Println(err)
	}
}
```

하나씩 판별하고 싶지 않을 때는 기본값을 갖는 타입화된 함수 (`GetString`/`GetInt` 등) 가 제로값 또는 기본값을 조용히 반환하므로, 중요하지 않은 읽기에 적합합니다.

::: tip ErrTypeMismatch 는 어디에 쓰이나요?
일반 `Get` 이 타입 충돌을 만나면 (예: 문자열 경로에 배열 인덱스 사용) 컨텍스트를 담은 설명적 오류를 반환하며, `ErrTypeMismatch` 센티널이 **아닙니다**. `ErrTypeMismatch` 는 주로 세 곳에서 나타납니다: `SafeGet` 결과의 `AsString()`/`AsInt()` 등 변환 메서드, `GetCompiled` 의 사전 컴파일 경로 탐색, 그리고 반복 불가능한 값에 대한 `Foreach` 계열 호출.
:::

## 첫 한 시간에 자주 만나는 문제

입문 초기에 가장 부딪히기 쉬운 문제를 모아 답합니다; 경로 문법의 세부 사항은 [경로 표현식 문법](./path-syntax) 을 참고하세요.

**Q: 경로를 찾을 수 없을 때 실제로 무엇이 반환되나요?**

호출 방식에 따라 다르며, '키 없음'과 '인덱스 범위 초과'는 동작이 다릅니다:

| 호출 | 객체 키 없음 | 배열 인덱스 범위 초과 |
|------|--------------|--------------|
| `json.Get` | `(nil, ErrPathNotFound)` | `(nil, nil)`, **오류 없음** |
| `json.GetString` 등 타입화된 함수 | 제로값 또는 전달한 기본값 | 제로값 또는 전달한 기본값 |
| `json.SafeGet` | `Exists: false` | `Exists: true` 지만 값은 nil |

배열 인덱스가 범위를 벗어나도 `Get` 은 오류를 보고하지 않으므로 (결과는 nil) '요소가 존재하는지' 판단하려면 err 만이 아니라 반환값도 확인해야 합니다. 전체 규칙은 [문법 함정](./path-syntax#문법-함정) 을 참고하세요.

**Q: 꺼낸 숫자가 왜 float64 인가요?**

`Get` 은 `any` 를 반환하며, JSON 숫자는 표준 디코딩을 거치면 무조건 `float64` 입니다:

```go
data := `{"version": 1}`

val, _ := json.Get(data, "version") // val 은 float64(1) 이지 int 가 아님
i := json.GetInt(data, "version")   // int 가 필요하면 타입화된 함수 사용
```

`float64` 정밀도를 벗어나는 큰 정수 (예: 스노플레이크 ID) 는 반올림됩니다 — 이때는 `Config.PreserveNumbers` 로 원본 숫자 텍스트를 유지하거나, `Decoder.UseNumber()` 로 `json.Number` 를 가져오세요.

**Q: `Set` 호출 후 원본 JSON 이 왜 변경되지 않나요?**

`Set`/`Delete` 는 순수 함수 스타일입니다: 수정된 **새 문자열**을 반환하며 원본은 그대로입니다. 반환값을 버리는 것이 가장 흔한 초보자 버그입니다:

```go
data := `{"name": "old"}`

// ✗ 결과가 버려져 data 는 변경되지 않음
_, _ = json.Set(data, "name", "new")

// ✓ 반환값 받기
updated, err := json.Set(data, "name", "new")
if err != nil {
	panic(err)
}
```

여러 곳을 연속으로 수정할 때는 `SetMultiple` 로 한 번에 처리하면 체인 `Set` 보다 명확합니다.

**Q: `Set` 에 범위를 벗어난 인덱스를 쓰면 어떻게 되나요?**

조회 측의 '제로값, 오류 없음'과 다릅니다 — 기본 설정 (`CreatePaths: true`) 에서 `Set` 은 배열을 `null` 으로 채워 대상 인덱스까지 확장합니다:

```go
updated, err := json.Set(`{"items":[1,2,3]}`, "items[5]", "x")
// {"items":[1,2,3,null,null,"x"]}
```

끝에만 추가하려면 `items[+]` 를 사용하고, 범위를 벗어난 인덱스에 의존하지 마세요.

**Q: 왜 모든 곳에서 `defer p.Close()` 를 사용하나요?**

`Processor` 내부에는 캐시와 백그라운드 정리 goroutine 이 있으며, `Close` 가 진행 중인 작업을 배수하고 이 리소스를 해제합니다; 빈번히 생성만 하고 닫지 않으면 계속 누적됩니다. 패키지 레벨 함수는 전역 프로세서가 수명 주기를 관리하므로 수동으로 `Close` 할 필요가 없고 해서도 안 됩니다. 자세한 내용은 [Processor 가이드](./processor-guide#수명-주기-관리) 를 참고하세요.

## 다음 단계

- [경로 표현식 문법](./path-syntax) — 전체 경로 쿼리 문법 배우기
- [Processor 가이드](./processor-guide) — 프로세서 사용 시기, 사전 파싱 최적화
- [출력 포맷팅](./print) — JSON 미화와 압축
- [표준 라이브러리에서 마이그레이션](./migration) — encoding/json 무비용 대체
- [치트시트](./cheatsheet) — API 빠른 참조
- [대용량 파일 처리](../streaming/large-files) — 대형 JSON 파일 처리
- [API 문서](../api-reference/) — 전체 API 레퍼런스 보기
- [사용 예제](../examples/) — 더 많은 실전 예제 둘러보기
