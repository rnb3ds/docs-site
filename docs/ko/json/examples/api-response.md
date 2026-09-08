---
sidebar_label: "API 응답 파싱"
title: "API 응답 파싱 - CyberGo JSON | 페이지네이션과 구조체 역직렬화"
description: "CyberGo JSON HTTP API 응답 파싱: ParseAny 임의 값, GetString/GetInt 상태·페이징 메타 추출, Get/GetArray 중첩 데이터 추출, 경로 슬라이스로 페이지 배열 처리, GetTyped 구조체 역직렬화와 ForeachWithPath 항목 순회."
sidebar_position: 4
---

# API 응답 파싱

이 문서는 CyberGo JSON으로 전형적인 HTTP API JSON 응답을 파싱하는 방법을 보여줍니다: 응답 상태와 페이지네이션 메타데이터 추출, 경로 슬라이스로 배열 처리, 구조체로 역직렬화.

## 페이지네이션 API 응답 파싱

페이지네이션 REST API 응답을 시뮬레이션하여 상태와 페이지네이션 메타데이터를 추출하고, `items[0:2]` 슬라이스로 부분 집합을 가져온 뒤, 요소별로 필드를 추출합니다.

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	// 페이지네이션 API 응답 시뮬레이션
	apiResponse := `{
        "status": "success",
        "data": {
            "page": 2,
            "per_page": 5,
            "total": 48,
            "items": [
                {"id": 6, "name": "프로젝트 6", "stars": 120},
                {"id": 7, "name": "프로젝트 7", "stars": 89},
                {"id": 8, "name": "프로젝트 8", "stars": 245},
                {"id": 9, "name": "프로젝트 9", "stars": 56},
                {"id": 10, "name": "프로젝트 10", "stars": 312}
            ]
        }
    }`

	// 1. 상태 및 페이지네이션 메타데이터 추출
	status := json.GetString(apiResponse, "status")
	page := json.GetInt(apiResponse, "data.page")
	total := json.GetInt(apiResponse, "data.total")
	fmt.Printf("상태: %s, %d 페이지, 총 %d건\n", status, page, total)

	// 2. 전체 데이터 배열 가져오기
	items := json.GetArray(apiResponse, "data.items")
	fmt.Printf("페이지 항목 수: %d\n", len(items))

	// 3. 경로 슬라이스로 부분 집합 가져오기 (처음 2개)
	firstTwo, err := json.Get(apiResponse, "data.items[0:2]")
	if err != nil {
		panic(err)
	}
	fmt.Printf("처음 두 개: %v\n", firstTwo)

	// 4. 배열을 순회하며 각 요소의 필드 추출 (ForeachWithPath 권장: 한 번 파싱, 요소별 접근)
	err = json.ForeachWithPath(apiResponse, "data.items", func(key any, item *json.IterableValue) {
		fmt.Printf("  - %s (%d stars)\n", item.GetString("name"), item.GetInt("stars"))
	})
	if err != nil {
		panic(err)
	}
}

// 출력:
// 상태: success, 2 페이지, 총 48건
// 페이지 항목 수: 5
// 처음 두 개: [map[id:6 name:프로젝트 6 stars:120] map[id:7 name:프로젝트 7 stars:89]]
//   - 프로젝트 6 (120 stars)
//   - 프로젝트 7 (89 stars)
//   - 프로젝트 8 (245 stars)
//   - 프로젝트 9 (56 stars)
//   - 프로젝트 10 (312 stars)
```

:::tip 팁
경로 슬라이스 문법 `[start:end]`는 배열 부분 집합을 반환합니다. `[start:end:step]`으로 간격 슬라이스, `[-1]`로 마지막 요소, `[*]` 와일드카드로 모든 요소를 순회할 수 있습니다. 전체 문법은 [경로 문법](../getting-started/path-syntax)을 참조하세요.

배열을 순회할 때는 경로를 조립하는 반복문 (`fmt.Sprintf("data.items.%d.name", i)` 로 하나씩 쿼리) 보다 **`ForeachWithPath` 를 우선**하세요: 전자는 한 번만 파싱하며 각 요소 안에서 필드 이름으로 바로 값을 가져올 수 있어 코드도 더 간결합니다; 후자는 매 경로가 독립적인 쿼리가 됩니다.
:::

## 여러 필드를 한 번에 가져오기

응답에서 추출할 필드가 많을 때 `GetMultiple` 은 한 번만 파싱해 모든 경로의 값을 가져옵니다 (결과 map 은 경로가 키). 개별 `Get` 를 반복하는 것보다 효율적입니다:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	apiResponse := `{
        "status": "success",
        "data": {
            "page": 2,
            "per_page": 5,
            "total": 48,
            "items": [
                {"id": 6, "name": "프로젝트 6", "stars": 120},
                {"id": 7, "name": "프로젝트 7", "stars": 89}
            ]
        }
    }`

	values, err := json.GetMultiple(apiResponse, []string{
		"status",
		"data.page",
		"data.per_page",
		"data.total",
		"data.items.0.name",
	})
	if err != nil {
		panic(err)
	}

	fmt.Printf("%s | %v/%v 페이지, 총 %v건, 첫 항목: %v\n",
		values["status"], values["data.page"], values["data.per_page"],
		values["data.total"], values["data.items.0.name"])
}

// 출력: success | 2/5 페이지, 총 48건, 첫 항목: 프로젝트 6
```

:::tip 주의
어느 한 경로라도 실패하면 (존재하지 않거나 유효하지 않음) `GetMultiple` 은 **첫 번째** 오류를 반환하고 해당 경로는 결과 map 에서 `nil` 이 됩니다. 따라서 '필드가 반드시 존재하는' 응답 추출에 적합합니다; 선택적 필드는 기본값을 갖는 `GetString(apiResponse, "path", "기본값")` 이나 아래의 `SafeGet` 을 사용하세요.
:::

## SafeGet 안전한 접근

`SafeGet` 은 error 를 반환하지 않고 `AccessResult` 를 반환합니다: `Ok()` 로 존재 여부를 확인하고, `AsInt`/`AsString` 등의 메서드로 필요할 때 변환하며, `UnwrapOr` 로 기본값을 제공합니다 — 필드 타입이 불안정하거나 선택적인 서드파티 응답에 적합하고, 전체 과정에서 panic 이 발생하지 않습니다:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	apiResponse := `{
        "status": 200,
        "message": "ok",
        "retry_after": "30",
        "trace_id": "abc-123"
    }`

	// status 는 숫자 (JSON 숫자는 float64 로 파싱됨), Type 필드가 런타임 타입을 보고
	status := json.SafeGet(apiResponse, "status")
	fmt.Println("status 타입:", status.Type)
	if code, err := status.AsInt(); err == nil {
		fmt.Println("상태 코드:", code)
	}

	// retry_after 는 문자열 형태의 초 단위 값
	retry := json.SafeGet(apiResponse, "retry_after")
	if secs, err := retry.AsString(); err == nil {
		fmt.Println("재시도 대기(초):", secs)
	}

	// 존재하지 않는 경로: Ok() 가 false, UnwrapOr 이 기본값 제공
	deprecated := json.SafeGet(apiResponse, "deprecated_field")
	fmt.Println("폐기된 필드 존재:", deprecated.Ok())
	fmt.Println("폐기된 필드 기본값:", deprecated.UnwrapOr("none"))
}

// 출력:
// status 타입: float64
// 상태 코드: 200
// 재시도 대기(초): 30
// 폐기된 필드 존재: false
// 폐기된 필드 기본값: none
```

엄격한 변환이 실패하면 `As*` 메서드는 조용히 0값을 돌려주는 대신 오류를 반환해 '필드 누락'과 '값이 0'을 혼동하지 않도록 합니다; 느슨한 변환이 필요할 때 (예: 임의 타입을 문자열 표현으로) 는 `AsStringConverted` 를 사용하세요.

## 구조체로 역직렬화

`GetTyped[T]`로 전체 응답이나 임의의 중첩 서브 객체를 강 타입 구조체로 역직렬화합니다. 구조를 알 수 없는 경우 `ParseAny`로 `any` 값을 가져옵니다.

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

// Repository는 API 응답의 저장소 구조를 나타냅니다
type Repository struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Stars int    `json:"stars"`
}

// APIResponse는 전체 API 응답을 나타냅니다
type APIResponse struct {
	Status string `json:"status"`
	Data   struct {
		Page  int          `json:"page"`
		Total int          `json:"total"`
		Items []Repository `json:"items"`
	} `json:"data"`
}

func main() {
	apiResponse := `{
        "status": "success",
        "data": {
            "page": 1,
            "total": 3,
            "items": [
                {"id": 1, "name": "cybergo-json", "stars": 500},
                {"id": 2, "name": "cybergo-jwt", "stars": 320},
                {"id": 3, "name": "cybergo-httpc", "stars": 280}
            ]
        }
    }`

	// 1. 전체 응답을 구조체로 역직렬화 (경로 "."은 루트 객체)
	resp := json.GetTyped[APIResponse](apiResponse, ".")
	fmt.Printf("상태: %s, 저장소 %d개\n", resp.Status, resp.Data.Total)
	for _, repo := range resp.Data.Items {
		fmt.Printf("  #%d %s (%d stars)\n", repo.ID, repo.Name, repo.Stars)
	}

	// 2. 단일 중첩 객체에 GetTyped 사용 (서브 객체를 구조체로 디코딩)
	firstRepo := json.GetTyped[Repository](apiResponse, "data.items.0")
	fmt.Printf("첫 번째 저장소: %+v\n", firstRepo)

	// 3. 응답 구조를 알 수 없을 때 ParseAny 사용 (임의 값)
	parsed, err := json.ParseAny(apiResponse)
	if err != nil {
		panic(err)
	}
	fmt.Printf("파싱 타입: %T\n", parsed)
}

// 출력:
// 상태: success, 저장소 3개
//   #1 cybergo-json (500 stars)
//   #2 cybergo-jwt (320 stars)
//   #3 cybergo-httpc (280 stars)
// 첫 번째 저장소: {ID:1 Name:cybergo-json Stars:500}
// 파싱 타입: map[string]interface {}
```

## 다음 단계

- [기본 예제](./index) — 경로 쿼리, 구조체 인코딩 기본
- [고급 예제](./examples-advanced) — SafeGet, 배치 작업 등
- [치트시트](../getting-started/cheatsheet) — 빠른 API 참조
- [경로 문법](../getting-started/path-syntax) — 슬라이스, 와일드카드, 필드 추출
