---
sidebar_label: "경로 표현식 문법"
title: "경로 표현식 문법 - CyberGo JSON | JSONPath 쿼리 가이드"
description: "CyberGo JSON 경로 표현식 문법 완전 가이드: 속성 접근, 배열·음수 인덱스, 슬라이스 보폭, 와일드카드 수집, 다중 필드·평면화 추출, 추가와 JSON Pointer (RFC 6901), 문법별 입출력 대비, 음수 인덱스 초과·추출 미적중 등 함정을 정리합니다."
sidebar_position: 2
---

# 경로 표현식 문법

json 라이브러리는 JSON 데이터의 임의 노드를 지정하고 조작하는 풍부한 경로 표현식 문법을 지원합니다.

## 기본 문법

### 속성 접근

점 `.` 으로 객체 속성에 접근합니다:

```go
data := `{"user": {"name": "Alice", "age": 30}}`

name := json.GetString(data, "user.name") // "Alice"
age := json.GetInt(data, "user.age")      // 30
```

### 중첩 경로

점을 연속으로 사용해 깊은 중첩 속성에 접근합니다:

```go
data := `{
    "company": {
        "department": {
            "team": {
                "lead": "Bob"
            }
        }
    }
}`

lead := json.GetString(data, "company.department.team.lead") // "Bob"
```

### 배열 인덱스

두 가지 문법으로 배열 요소에 접근합니다:

```go
data := `{"items": ["a", "b", "c", "d", "e"]}`

// 문법 1: 점 + 인덱스
first := json.GetString(data, "items.0") // "a"

// 문법 2: 대괄호 + 인덱스
first2 := json.GetString(data, "items[0]") // "a"
```

#### 음수 인덱스

음수 인덱스는 배열 끝에서부터 세며, `-1` 이 마지막 요소입니다:

```go
data := `{"items": ["a", "b", "c", "d", "e"]}`

val := json.GetString(data, "items[-1]") // "e"  (마지막)
val = json.GetString(data, "items[-2]")  // "d"  (뒤에서 두 번째)
val = json.GetString(data, "items[-5]")  // "a"  ([0] 과 동일)
```

| 인덱스 | 의미 | 동등한 양수 인덱스 |
|------|------|-----------|
| `[0]` | 첫 번째 요소 | — |
| `[1]` | 두 번째 요소 | — |
| `[-1]` | 마지막 요소 | `[len-1]` |
| `[-2]` | 뒤에서 두 번째 | `[len-2]` |
| `[-N]` | 뒤에서 N 번째 | `[len-N]` |

#### 다차원 배열

인덱스를 연속으로 사용해 중첩 배열에 접근합니다:

```go
data := `{"matrix": [[1, 2, 3], [4, 5, 6], [7, 8, 9]]}`

val := json.GetInt(data, "matrix[0][0]")  // 1
val = json.GetInt(data, "matrix[1][2]")   // 6
val = json.GetInt(data, "matrix[-1][-1]") // 9
```

#### 경계 동작

범위를 벗어난 인덱스는 panic 이나 오류를 내지 않습니다 — 타입 안전 조회 함수는 제로값을, `Get` 은 nil 결과를 반환합니다:

```go
data := `{"items": ["a", "b", "c"]}`

// 양수 인덱스 범위 초과 → 제로값 / nil, 오류 없음
json.GetString(data, "items[10]") // ""   (빈 문자열)
json.GetInt(data, "items[10]")    // 0
json.Get(data, "items[10]")       // nil, nil (주의: err 도 nil)

// 음수 인덱스 범위 초과 → 마찬가지로 제로값
json.GetString(data, "items[-10]") // ""   (빈 문자열)
json.GetInt(data, "items[-10]")    // 0
```

| 함수 | 범위 초과 시 반환값 |
|------|-----------|
| `Get` | `(nil, nil)` — 오류 없음 |
| `GetString` | `""` |
| `GetInt` | `0` |
| `GetFloat` | `0.0` |
| `GetBool` | `false` |
| `GetArray` | `nil` |

::: tip 인덱스 경계
- 양수 인덱스는 `[0, len)` 범위 안이어야 하고, 음수 인덱스도 변환 후 (`len + index`) 마찬가지입니다
- 범위 초과 접근은 제로값 / nil 을 반환하며 panic 이나 오류가 없습니다
- '객체 키 없음'일 때만 `ErrPathNotFound` 를 반환합니다 (예: `json.Get(data, "nosuchkey")`); 배열 요소 존재 여부는 err 만이 아니라 반환값도 함께 확인해야 합니다
:::

---

## 고급 문법

### 배열 슬라이스 `[start:end:step]`

배열에서 하위 배열을 추출하며, Python 스타일 슬라이스 문법 `[start:end:step]` 을 사용합니다. 세 매개변수 모두 생략할 수 있습니다:

| 매개변수 | 설명 | 생략 시 기본값 |
|------|------|-------------|
| `start` | 시작 인덱스 (포함) | `0` (양수 보폭) 또는 `len-1` (음수 보폭) |
| `end` | 끝 인덱스 (제외) | `len` (양수 보폭) 또는 `-1` (음수 보폭) |
| `step` | 보폭 | `1` |

#### 슬라이스 문법 빠른 참조표

| 문법 | 의미 | 예시 (`[0,1,2,3,4]`) | 결과 |
|------|------|----------------------|------|
| `[:]` | 전체 복사 | `[0,1,2,3,4][:]` | `[0,1,2,3,4]` |
| `[N:]` | N 부터 끝까지 | `[0,1,2,3,4][2:]` | `[2,3,4]` |
| `[:N]` | 시작부터 N 까지 | `[0,1,2,3,4][:3]` | `[0,1,2]` |
| `[N:M]` | N 부터 M-1 까지 | `[0,1,2,3,4][1:4]` | `[1,2,3]` |
| `[::S]` | S 간격으로 하나씩 | `[0,1,2,3,4][::2]` | `[0,2,4]` |
| `[N::S]` | N 부터, 보폭 S | `[0,1,2,3,4][1::2]` | `[1,3]` |
| `[:M:S]` | 시작부터 M 까지, 보폭 S | `[0,1,2,3,4][:4:2]` | `[0,2]` |
| `[N:M:S]` | 세 매개변수 전체 | `[0,1,2,3,4][0:5:2]` | `[0,2,4]` |
| `[::-1]` | 배열 뒤집기 | `[0,1,2,3,4][::-1]` | `[4,3,2,1,0]` |
| `[::-S]` | 역방향 보폭 | `[0,1,2,3,4][::-2]` | `[4,2,0]` |

#### 정방향 슬라이스

```go
data := `{"numbers": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]}`

// 기본 슬라이스
slice := json.GetArray(data, "numbers[2:5]") // [2, 3, 4]

// start 생략 (시작부터)
slice2 := json.GetArray(data, "numbers[:3]") // [0, 1, 2]

// end 생략 (끝까지)
slice3 := json.GetArray(data, "numbers[7:]") // [7, 8, 9]

// 보폭 2 (짝수 위치 요소)
slice4 := json.GetArray(data, "numbers[::2]") // [0, 2, 4, 6, 8]

// 전체 매개변수
slice5 := json.GetArray(data, "numbers[1:8:3]") // [1, 4, 7]

// 전체 복사
slice6 := json.GetArray(data, "numbers[:]") // [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
```

#### 음수 인덱스 슬라이스

슬라이스의 `start` 와 `end` 모두 음수 인덱스를 지원합니다:

```go
data := `{"numbers": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]}`

// 마지막 3 개 요소
json.GetArray(data, "numbers[-3:]") // [7, 8, 9]

// 마지막 2 개 요소 제거
json.GetArray(data, "numbers[:-2]") // [0, 1, 2, 3, 4, 5, 6, 7]

// 뒤에서 5 번째부터 뒤에서 2 번째까지
json.GetArray(data, "numbers[-5:-2]") // [5, 6, 7]

// 인덱스 2 부터 뒤에서 1 번째까지 (마지막은 제외)
json.GetArray(data, "numbers[2:-1]") // [2, 3, 4, 5, 6, 7, 8]
```

#### 역방향 슬라이스

음수 보폭으로 역방향 순회를 구현합니다:

```go
data := `{"letters": ["a", "b", "c", "d", "e"]}`

// 배열 뒤집기
json.GetArray(data, "letters[::-1]") // ["e", "d", "c", "b", "a"]

// 역방향 보폭 2
json.GetArray(data, "letters[::-2]") // ["e", "c", "a"]

// 인덱스 3 부터 1 까지 (역방향)
json.GetArray(data, "letters[3:1:-1]") // ["d", "c"]

// 끝에서 역방향으로 앞 3 개
json.GetArray(data, "letters[2::-1]") // ["c", "b", "a"]
```

#### 경계 동작

슬라이스는 범위를 벗어난 인덱스를 자동으로 잘라내 (clamp) 오류를 반환하지 않습니다:

```go
data := `{"items": [0, 1, 2]}`

// 범위 초과 start/end 는 유효 범위로 자동 절단
json.GetArray(data, "items[0:100]") // [0, 1, 2]  (end 가 len=3 으로 절단)
json.GetArray(data, "items[10:20]") // []         (start >= end, 빈 결과)

// start >= end 면 빈 배열 반환
json.GetArray(data, "items[2:2]") // []
json.GetArray(data, "items[3:1]") // []
```

::: warning 슬라이스 vs 인덱스의 경계 처리 차이
- **인덱스 범위 초과** (예: `items[10]`) 는 해당 타입의 제로값을 반환하며 오류 없음
- **슬라이스 범위 초과** (예: `items[10:20]`) 는 자동 절단되어 빈 배열을 반환하며 오류 없음
:::

### 필드 추출 `{field1,field2}`

객체에서 특정 필드만 추출합니다:

```go
data := `{
    "user": {
        "id": 1001,
        "name": "Alice",
        "email": "alice@example.com",
        "password": "secret",
        "age": 25
    }
}`

// id 와 name 만 추출
extracted, err := json.Get(data, "user{id,name}")
if err != nil {
	panic(err)
}
// 결과: {"id": 1001, "name": "Alice"}
```

### 평면화 추출 `{flat:field}`

배열 객체의 필드에서 값을 추출할 때 필드 자체도 배열이면 일반 추출은 중첩 배열을 만듭니다. `{flat:}` 접두사를 쓰면 모든 중첩 배열을 재귀적으로 펼쳐 하나의 평평한 결과 배열을 얻습니다.

#### 일반 추출 vs 평면화 추출

```go
data := `{
    "groups": [
        {"tags": ["go", "json"]},
        {"tags": ["python", "yaml"]}
    ]
}`

// 일반 추출 → 중첩 배열
json.GetArray(data, "groups{tags}")
// [["go", "json"], ["python", "yaml"]]

// 평면화 추출 → 1 차원 배열로 펼침
json.GetArray(data, "groups{flat:tags}")
// ["go", "json", "python", "yaml"]
```

#### 체인 평면화 추출

여러 층의 중첩 배열은 `{flat:}` 를 연속으로 사용해 한 층씩 펼칠 수 있습니다:

```go
data := `{
    "departments": [
        {
            "teams": [
                {"members": [{"name": "Alice"}, {"name": "Bob"}]}
            ]
        },
        {
            "teams": [
                {"members": [{"name": "Carol"}]}
            ]
        }
    ]
}`

// 3 층 평면화: departments → teams → members → name
json.GetArray(data, "departments{flat:teams}{flat:members}{name}")
// ["Alice", "Bob", "Carol"]
```

#### 평면화 추출 후 다른 작업 연결

평면화 추출 결과에는 슬라이스, 인덱스 등을 계속 사용할 수 있습니다:

```go
data := `{
    "orders": [
        {"items": ["book", "pen"]},
        {"items": ["laptop", "mouse", "keyboard"]},
        {"items": ["cup"]}
    ]
}`

// 평면화 후 슬라이스
json.GetArray(data, "orders{flat:items}[0:3]")
// ["book", "pen", "laptop"]
```

::: info 제한
- `{flat:field1,field2}` 처럼 다중 필드 추출에는 `flat` 플래그가 적용되지 않습니다. 다중 필드 추출이 만드는 것은 배열이 아니라 객체이기 때문입니다
- 평면화는 첫 층뿐 아니라 모든 층의 중첩 배열을 재귀적으로 펼칩니다
:::

### 추가 작업 `[+]`

배열 끝에 요소를 추가합니다:

```go
data := `{"items": [1, 2, 3]}`

updated, err := json.Set(data, "items[+]", 4)
if err != nil {
	panic(err)
}
// 결과: {"items": [1, 2, 3, 4]}

updated, err = json.Set(updated, "items[+]", 5)
if err != nil {
	panic(err)
}
// 결과: {"items": [1, 2, 3, 4, 5]}

// 슬라이스 값을 추가하면 중첩 배열이 되지 않고 여러 요소로 펼쳐짐
updated, err = json.Set(updated, "items[+]", []any{6, 7})
if err != nil {
	panic(err)
}
// 결과: {"items": [1, 2, 3, 4, 5, 6, 7]}
```

::: warning [+] 의 선행 경로는 이미 존재하는 배열이어야 함
`items[+]` 는 추가만 하고 배열을 만들지 않습니다. 대상 경로가 없거나 배열이 아니면 오류가 납니다 ("cannot append to non-array type"); 먼저 `SetCreate(data, "items", []any{})` 로 배열을 만들고 추가하세요.
:::

### 와일드카드 `[*]`

와일드카드는 배열 (또는 객체) 의 **모든 요소**와 일치하며, 쿼리와 수정 두 시나리오에서 모두 유용합니다:

```go
data := `{"items": [1, 2, 3]}`

updated, err := json.Set(data, "items[*]", 0)
if err != nil {
	panic(err)
}
// 결과: {"items": [0, 0, 0]}
```

#### 쿼리 시나리오: 필드 수집

와일드카드 뒤에 속성 경로를 붙이면 각 요소에서 해당 필드의 값을 **하나의 배열로 수집**합니다:

```go
users := `{"users": [{"name": "John"}, {"name": "Jane"}]}`

// [*].field → 모든 요소의 필드 값 수집
names, err := json.Get(users, "users[*].name")
if err != nil {
	panic(err)
}
fmt.Println(names) // [John Jane]

// 단독으로 마지막 세그먼트일 때 [*] 는 배열 자체와 동등
arr, _ := json.GetArray(data, "items[*]") // [1, 2, 3]
```

#### 점 약식 표기 `*`

`*` 는 `[*]` 를 대체할 수 있으며 두 표기는 동등합니다:

```go
symbols := `[
    {"symbol": "AAPL", "price": 180},
    {"symbol": "GOOG", "price": 140}
]`

// 시작이 곧 와일드카드: 루트 배열에 적용
a, _ := json.GetArray(symbols, "[*].symbol") // [AAPL GOOG]
b, _ := json.GetArray(symbols, "*.symbol")   // [AAPL GOOG], 위와 동등
```

::: tip Foreach 와의 역할 분담
`[*].field` 는 '필드 하나만 수집'할 때 적합합니다; 요소마다 여러 필드에 접근해야 할 때는 [`ForeachWithPath`](./processor-guide) 가 더 직접적입니다.
:::

---

## 경로 검증

### Processor 로 경로 검증

`Processor.CompilePath` 로 경로 형식이 올바른지 검증합니다:

```go
p, err := json.New()
if err != nil {
	panic(err)
}

// 경로 컴파일 (형식 자동 검증)
cp, err := p.CompilePath("user.profile.name")
if err != nil {
	fmt.Println("Invalid path:", err)
}

cp, err = p.CompilePath("items[0:10:2]")
if err != nil {
	fmt.Println("Invalid path:", err)
}
```

---

## 특수 경로

### 루트 경로

빈 문자열 `""` 또는 `"."` 이 루트를 나타냅니다:

```go
data := `{"name": "test"}`

// 전체 객체 가져오기
root, err := json.Get(data, "") // {"name": "test"}
if err != nil {
	panic(err)
}
root, err = json.Get(data, ".") // 위와 동일
```

### JSON Pointer (RFC 6901)

`/` 로 시작하는 경로는 JSON Pointer 문법 (슬래시 구분) 으로 해석되며, 점 문법과는 독립된 두 체계라 섞어 쓸 수 없습니다:

```go
data := `{"user": {"name": "Alice"}, "items": ["a", "b"]}`

name := json.GetString(data, "/user/name") // "Alice"
item := json.GetString(data, "/items/0")   // "a"
```

- 키 이름에 `/` 또는 `~` 가 있으면 `~1`, `~0` 으로 이스케이프합니다 (`a~1b` 는 키 `a/b` 를 의미)
- 배열 첨자는 **음수가 아닌** 정수여야 합니다: Pointer 모드는 음수 인덱스를 지원하지 않아 `/items/-1` 은 대상을 찾지 못하고; `/items/-` 는 끝에 아직 없는 위치를 가리켜 마찬가지로 찾지 못합니다
- `Set` 은 JSON Pointer 로 배열을 확장할 수 없습니다 (범위 초과 시 바로 오류); 범위를 넘어 쓰려면 점 경로를 사용하세요
- 단독 `/` 는 루트를 나타내며 `""`, `.` 와 동등합니다

### 경로 이스케이프

키 이름에 특수 문자가 있으면 백슬래시로 이스케이프합니다. 이스케이프 가능한 문자는 6 개입니다:

| 이스케이프 표기 | 매칭되는 키 이름 문자 |
|----------|----------------|
| `\\.` | 리터럴 점 `.` |
| `\\\\` | 리터럴 백슬래시 `\` |
| `\\[` / `\\]` | 리터럴 대괄호 `[` `]` |
| `\\{` / `\\}` | 리터럴 중괄호 `{` `}` |

```go
data := `{
    "user.name": "Alice",
    "a[b]": "bracket",
    "config\\local": "backslash"
}`

// 점을 포함한 키 이름
name := json.GetString(data, "user\\.name") // "Alice"

// 대괄호를 포함한 키 이름
bracket := json.GetString(data, "a\\[b\\]") // "bracket"

// 백슬래시를 포함한 키 이름
bs := json.GetString(data, "config\\\\local") // "backslash"
```

::: warning Go 문자열과 경로 이스케이프는 두 층
위 예제를 Go 소스에 쓰면 **이중 백슬래시** (`"user\\.name"`) 입니다 — Go 문자열 리터럴이 한 층을 먼저 소비하고, 경로 파서가 `user\.name` 을 받아 한 층 더 소비합니다. 경로가 런타임 변수 (리터럴 아님) 에서 오면 한 층만 이스케이프하면 됩니다: `"user\\.name"` 리터럴 == 런타임의 `user\.name`.
:::

---

## 경로 세그먼트 타입

라이브러리 내부는 경로를 타입이 다른 세그먼트로 파싱합니다 (아래는 내부 구현 세부 사항이며 공개 API 로 익스포트되지 않음):

| 타입 | 문법 예시 | 설명 |
|------|----------|------|
| 속성 접근 | `user.name` | 객체 속성 접근 |
| 배열 인덱스 | `items[0]` | 배열 요소 접근 |
| 배열 슬라이스 | `items[1:5]` | 슬라이스 범위 접근 |
| 와일드카드 | `items[*]` | 모든 요소 매칭 |
| 필드 추출 | `{name,email}` | 여러 필드 추출 |
| 평면화 추출 | `{flat:tags}` | 추출 후 중첩 배열 재귀 펼침 |
| 추가 작업 | `items[+]` | 배열에 요소 추가 |
| JSON Pointer | `/user/name` | `/` 로 시작하는 RFC 6901 문법 |

---

## 문법 함정

아래 동작은 모두 라이브러리의 실제 구현에서 나온 것이며, 미리 알아두면 디버깅 시간을 크게 아낄 수 있습니다.

### 추출 미적중은 오류를 내지 않음

필드 추출의 '미적중'은 조용합니다 — `Get` 이 `(nil, nil)` 을 반환하며 값도 오류도 없습니다:

```go
data := `{"user": {"id": 1}}`

json.Get(data, "user{nonexistent}") // (nil, nil) — 오류 없음
json.Get(data, "user{a,b}")         // (nil, nil) — 모든 필드가 없을 때
```

따라서 추출 적중 여부는 `err != nil` 이 아니라 반환값 자체로 판단해야 합니다. 다중 필드 추출은 필드가 하나라도 있으면 적중한 필드만 담은 객체를 반환합니다.

### 단일 필드와 다중 필드 추출의 반환 형태가 다름

| 경로 | 작용 대상 | 반환 |
|------|----------|------|
| `user{name}` | 객체 | 필드 값 자체 (bare 값, 객체 아님) |
| `user{id,name}` | 객체 | 적중한 필드만 담은 새 객체 |
| `users{name}` | 배열 | 각 요소의 필드 값으로 구성된 배열 |
| `users{id,name}` | 배열 | 각 요소의 추출 결과 객체로 구성된 배열 |

```go
data := `{"user": {"id": 1, "name": "Alice", "email": "a@ex.com"}}`

json.Get(data, "user{name}")    // "Alice" (bare 값)
json.Get(data, "user{id,name}") // {"id":1,"name":"Alice"}
```

### 속성 체인이 스칼라를 '뚫고 지나가면' nil 반환, 오류 없음

경로 중간에 문자열, 숫자 등 스칼라를 만나면 이어서 속성을 가져올 때 `(nil, nil)` 이 반환됩니다; **키가 없을 때만** `ErrPathNotFound` 를 반환합니다 — 두 종류의 '못 찾음'은 오류 형태가 다릅니다:

```go
data := `{"name": "Alice"}`

json.Get(data, "name.foo")   // (nil, nil) — name 이 문자열이라 속성을 이어갈 수 없음
json.Get(data, "nosuch.foo") // (nil, ErrPathNotFound) — 키 nosuch 가 없음
```

하지만 스칼라에 **배열 인덱스**를 쓰는 것 (예: 문자열에 `name[0]`) 은 확정 오류이며 "cannot access array index..." 설명 오류를 반환합니다.

### 추출은 '필드 자체가 없는' 요소를 건너뛰되 null 값은 유지

배열의 단일 필드 추출에서 해당 필드가 없는 요소는 결과 항목을 만들지 않습니다; 필드가 존재하고 값이 null 인 요소는 null 항목을 만듭니다:

```go
data := `{"users": [{"name": "A"}, {"age": 20}, {"name": null}]}`

json.GetArray(data, "users{name}")
// ["A", null] — name 필드가 없는 요소는 건너뛰고, 값이 null 인 것은 유지
```

### 인덱스, 슬라이스, 수정의 범위 초과 의미는 제각각

| 작업 | 범위 초과 동작 |
|------|----------|
| 인덱스 쿼리 `items[10]` | 제로값 / `(nil, nil)` 반환, 오류 없음 |
| 슬라이스 쿼리 `items[10:20]` | 유효 범위로 자동 절단, 빈 배열 `[]` 반환 |
| 수정 `Set(data, "items[5]", v)` (len=3) | 기본 설정에서 배열을 `null` 으로 채워 첨자 5 까지 확장 |

### JSON Pointer 와 점 문법은 섞어 쓸 수 없음

경로가 `/` 로 시작하는 순간 전체가 Pointer 모드로 들어갑니다 — `"/user.name"` 은 `user.name` 을 **하나의 키 이름**으로 찾습니다. 반대로 이것이 점/대괄호를 포함한 키 이름에 접근하는 가장 손쉬운 방법입니다 (백슬래시 이스케이프 불필요):

```go
data := `{"a.b": 1, "c[0]": 2}`

json.GetInt(data, "/a.b")  // 1 — Pointer 모드에서 점은 키 이름의 일부
json.GetInt(data, "/c[0]") // 2
```

---

## 전체 예제

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{
        "store": {
            "books": [
                {"title": "Go 101", "price": 25, "category": "programming"},
                {"title": "JSON Guide", "price": 35, "category": "programming"},
                {"title": "Clean Code", "price": 45, "category": "programming"}
            ],
            "prices": [10, 20, 30, 40, 50]
        }
    }`

	// 1. 기본 접근
	title := json.GetString(data, "store.books.0.title")
	fmt.Println("First book:", title)

	// 2. 배열 슬라이스
	books := json.GetArray(data, "store.books[0:2]")
	fmt.Printf("First 2 books: %d items\n", len(books))

	// 3. 보폭을 가진 슬라이스
	prices := json.GetArray(data, "store.prices[::2]")
	fmt.Println("\nEvery other price:", prices)

	// 4. 필드 추출
	extracted, err := json.Get(data, "store.books[0]{title,price}")
	if err != nil {
		panic(err)
	}
	fmt.Println("\nExtracted fields:", extracted)

	// 5. 요소 추가
	updated, err := json.Set(data, "store.books[+]", map[string]any{
		"title":    "New Book",
		"price":    55,
		"category": "programming",
	})
	if err != nil {
		panic(err)
	}
	fmt.Println("\nAfter append:", json.Valid([]byte(updated)))
}
```

## 다음 단계

- [API 문서](../api-reference/) — 전체 API 레퍼런스 보기
- [사용 예제](../examples/) — 더 많은 실전 예제
