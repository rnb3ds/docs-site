---
title: "표준 라이브러리에서 마이그레이션 - CyberGo JSON | encoding/json 호환 가이드"
description: "CyberGo JSON은 encoding/json과 100% 호환됩니다. import 경로만 교체하면 코드 수정 없이 마이그레이션할 수 있습니다. 함수 매핑 표, 동작 차이, 추가 기능 가이드를 확인하세요."
sidebar_label: "표준 라이브러리에서 마이그레이션"
sidebar_position: 1.5
---

# 표준 라이브러리에서 마이그레이션

`cybergodev/json`은 표준 라이브러리 `encoding/json`과 **100% 호환**됩니다. import 경로만 교체하면 기존 코드를 수정할 필요 없이 컴파일하고 실행할 수 있습니다. 이 페이지는 마이그레이션 과정과 마이그레이션 후 사용할 수 있는 추가 기능을 안내합니다.

## 3단계 마이그레이션

1. **설치**:

   ```bash
   go get github.com/cybergodev/json
   ```

2. **import 교체**: `"encoding/json"`을 `"github.com/cybergodev/json"`으로 교체합니다.

   ```go
   // 마이그레이션 전
   import "encoding/json"

   // 마이그레이션 후
   import "github.com/cybergodev/json"
   ```

3. **완료**: 컴파일이 통과되며 기존 코드를 수정할 필요가 없습니다.

## 완전히 호환되는 API

다음 표는 `encoding/json`과 `cybergodev/json`의 대응 관계를 보여줍니다:

| encoding/json | cybergodev/json | 설명 |
|---|---|---|
| `Marshal(v)` | `Marshal(v, cfg...)` | 호환 서명, 추가 선택적 cfg 매개변수 |
| `Unmarshal(data, &v)` | `Unmarshal(data, &v, cfg...)` | 동일 |
| `MarshalIndent(v, prefix, indent)` | 동일한 이름 | 완전 호환 |
| `Compact(dst, src)` | 동일한 이름 | 완전 호환 |
| `Indent(dst, src, prefix, indent)` | 동일한 이름 | 완전 호환 |
| `HTMLEscape(dst, src)` | 동일한 이름 | 완전 호환 |
| `Valid(data)` | `Valid(data, cfg...)` | 호환 서명 |
| `NewEncoder(w)` | `NewEncoder(w, cfg...)` | 호환 서명 |
| `NewDecoder(r)` | `NewDecoder(r, cfg...)` | 호환 서명 |
| `Number` | `Number` | 타입 호환 |
| `Delim` | `Delim` | 타입 호환 |
| `Token` | `Token` | 타입 호환 |

:::tip 선택적 cfg 매개변수
모든 추가 `cfg ...Config` 매개변수는 **선택적**(가변 인자)입니다. 전달하지 않으면 표준 라이브러리와 완전히 동일하게 동작하며, 보안 모드나 캐시 등 향상된 기능을 활성화할 때만 전달하면 됩니다.
:::

## 코드 예제: import만 교체

아래 예제는 "import만 교체"한 효과를 보여줍니다. 인코딩, 디코딩, 구조체 태그(struct tag) 사용법이 `encoding/json`과 완전히 동일합니다:

```go
package main

import (
    "fmt"

    "github.com/cybergodev/json"
)

func main() {
    type User struct {
        Name string   `json:"name"`
        Age  int      `json:"age"`
        Tags []string `json:"tags"`
    }

    // 인코딩 — encoding/json과 완전히 동일
    user := User{Name: "Alice", Age: 30, Tags: []string{"go", "json"}}
    b, err := json.Marshal(user)
    if err != nil {
        panic(err)
    }
    fmt.Println(string(b))
    // 출력: {"name":"Alice","age":30,"tags":["go","json"]}

    // 디코딩 — encoding/json과 완전히 동일
    var u User
    if err := json.Unmarshal(b, &u); err != nil {
        panic(err)
    }
    fmt.Printf("%+v\n", u)
    // 출력: {Name:Alice Age:30 Tags:[go json]}
}
```

## 추가 기능

마이그레이션 후 표준 라이브러리 호환성을 유지하면서, 표준 라이브러리에서 제공하지 않는 다음 기능을 필요에 따라 사용할 수 있습니다:

| 기능 | 예제 | 자세히 보기 |
|---|---|---|
| 경로 쿼리 | `json.GetString(data, "user.name")` | [경로 표현식 문법](./path-syntax) |
| 기본값으로 가져오기 | `json.GetInt(data, "timeout", 30)` | [쿼리 함수](../api-reference/functions/query) |
| 제네릭 가져오기 | `json.GetTyped[User](data, "user")` | [제네릭](../api-reference/generics) |
| 경로 수정 | `json.Set(data, "user.name", "Bob")` | [수정 작업](../api-reference/functions/modify) |
| 스키마 검증 | `json.ValidateSchema(data, schema)` | [검증기](../extensions/validator) |
| 스트리밍 JSONL | `json.StreamLinesInto[T](r, fn)` | [JSONL 처리](../streaming/jsonl) |
| 고성능 프로세서 | `p, _ := json.New()` | [Processor 가이드](./processor-guide) |

## 동작 차이

**기본 설정**에서 `cybergodev/json`은 `encoding/json`과 완전히 동일하게 동작합니다. 모든 추가 기능(보안 모드, 경로 쿼리, 스키마 검증 등)은 **opt-in**입니다. `Config` 매개변수를 통해 명시적으로 활성화하며, 기존 코드에 영향을 주지 않습니다.

다시 말해, 마이그레이션은 비용이 들지 않으며 "표준 라이브러리 + 추가 기능"의 상위 집합을 얻게 됩니다.

## 다음 단계

- [빠른 시작](./) — 5분 안에 핵심 기능 시작하기
- [경로 표현식 문법](./path-syntax) — 경로 쿼리 문법 배우기
- [치트시트](./cheatsheet) — 빠른 API 참조
