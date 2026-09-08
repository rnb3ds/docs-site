---
sidebar_label: "배치 작업"
title: "배치 작업 함수 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON 배치 작업 함수: ProcessBatch 로 여러 JSON 작업을 한 번에 처리하며 BatchOperation 작업 정의와 BatchResult 결과 구조를 지원, get/set/delete/validate 네 종류 작업이 단일 실패로 중단되지 않습니다."
sidebar_position: 7
---

# 배치 작업 함수

json 패키지가 제공하는 배치 작업 함수로, 여러 JSON 작업 (get/set/delete/validate) 을 한 번에 처리할 수 있어 배치 데이터 처리 시나리오에 적합합니다.

## ProcessBatch

시그니처: `func ProcessBatch(operations []BatchOperation, cfg ...Config) ([]BatchResult, error)`

여러 JSON 작업을 배치로 처리합니다 (패키지 레벨 함수, Processor 생성 불필요). 결과 순서는 입력 작업 순서와 일대일 대응하며 `ID` 필드로 연결됩니다.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	jsonStr := `{"user": {"name": "CyberGo", "age": 25}}`

	operations := []json.BatchOperation{
		{Type: "get", JSONStr: jsonStr, Path: "user.name", ID: "op1"},
		{Type: "set", JSONStr: jsonStr, Path: "user.age", Value: 30, ID: "op2"},
	}

	results, err := json.ProcessBatch(operations)
	if err != nil {
		panic(err)
	}
	for _, r := range results {
		if r.Error != nil {
			fmt.Printf("작업 %s 실패: %v\n", r.ID, r.Error)
		} else {
			fmt.Printf("작업 %s 결과: %v\n", r.ID, r.Result)
		}
	}
}

// 출력:
// 작업 op1 결과: CyberGo
// 작업 op2 결과: {"user":{"age":30,"name":"CyberGo"}}
```

### 지원하는 작업 타입

| `Type` | 역할 | `Result` 내용 | 전형적인 오류 |
|--------|------|---------------|----------|
| `get` | 경로의 값 읽기 | 경로의 값 (`any`) | `ErrPathNotFound`, `ErrInvalidJSON` |
| `set` | 경로에 값 설정 | **수정된 전체 JSON 문자열** | `ErrPathNotFound` (`CreatePaths` 꺼짐), `ErrInvalidPath` |
| `delete` | 경로의 노드 삭제 | **삭제된 전체 JSON 문자열** | `ErrPathNotFound`, `ErrInvalidPath` |
| `validate` | JSON 이 유효한지 검증 | `map[string]any{"valid": bool}` | JSON 이 무효면 `Result.valid=false` 이고 `Error` 가 비어 있지 않음 |

`Type` 이 위 네 가지가 아니면 (예: 오타), 해당 작업의 `Error` 는 `unknown operation type: <type>` 이 됩니다 — **배치를 중단하지 않고** 나머지 작업은 평소대로 실행됩니다.

::: warning 작업은 서로 체인되지 않음
각 `BatchOperation` 은 각자의 `JSONStr` 입력에 **독립적으로** 적용되며, 작업 사이에 체인 누적이 **없습니다**. 예를 들어 같은 문서에 먼저 `set` 하고 `delete` 하면 '고친 뒤 지우기'가 아니라 두 개의 독립 결과를 얻습니다. 단일 문서에 여러 단계 변환이 필요하면 코드에서 이전 단계의 출력을 다음 단계에 넣거나, [`SetMultiple`](./modify#setmultiple) 같은 단일 문서 다중 경로 메서드를 사용하세요.
:::

### 배치 크기 제한

작업 수는 `Config.MaxBatchSize` 의 제약을 받습니다 (기본 `2000`, 설정 검증이 10–10000 으로 클램핑). 초과하면 배치 전체가 바로 실패하며 `(nil, ErrSizeLimit)` 을 반환합니다. 상한은 **이번 호출에 전달된 cfg** 를 기준으로 적용됩니다 (전달하지 않으면 기본 설정 사용):

```go
// 커스텀 상한 (초대형 배치 시나리오에 적용)
cfg := json.DefaultConfig()
cfg.MaxBatchSize = 5000
results, err := json.ProcessBatch(ops, cfg)
```

## 작업 타입별 예제

### get — 배치 읽기

`get` 작업의 `Result` 는 경로의 원시 값입니다 (숫자는 기본 `float64`, 불리언은 `bool`, 문자열은 `string`).

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"user":{"name":"CyberGo","age":25},"active":true}`

	results, err := json.ProcessBatch([]json.BatchOperation{
		{Type: "get", JSONStr: data, Path: "user.name", ID: "name"},
		{Type: "get", JSONStr: data, Path: "user.age", ID: "age"},
		{Type: "get", JSONStr: data, Path: "active", ID: "active"},
	})
	if err != nil {
		panic(err)
	}

	for _, r := range results {
		if r.Error != nil {
			fmt.Printf("%s 실패: %v\n", r.ID, r.Error)
			continue
		}
		fmt.Printf("%s = %v\n", r.ID, r.Result)
	}
}

// 출력:
// name = CyberGo
// age = 25
// active = true
```

### set — 배치 수정

`set` 작업의 `Result` 는 **수정된 전체 JSON 문자열** 입니다 (기록한 값 자체가 아님에 주의). 기본 설정은 `CreatePaths=true` 이므로 새 경로를 설정하면 중간 노드가 자동 생성됩니다.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"user":{"name":"CyberGo","age":25}}`

	results, err := json.ProcessBatch([]json.BatchOperation{
		{Type: "set", JSONStr: data, Path: "user.age", Value: 30, ID: "update-age"},
		{Type: "set", JSONStr: data, Path: "user.role", Value: "admin", ID: "add-role"},
	})
	if err != nil {
		panic(err)
	}

	for _, r := range results {
		if r.Error != nil {
			fmt.Printf("%s 실패: %v\n", r.ID, r.Error)
			continue
		}
		fmt.Printf("%s -> %s\n", r.ID, r.Result)
	}
}

// 출력:
// update-age -> {"user":{"age":30,"name":"CyberGo"}}
// add-role -> {"user":{"age":25,"name":"CyberGo","role":"admin"}}
```

::: tip 출력 형식 안내
`set`/`delete` 가 반환하는 JSON 문자열은 **컴팩트 형식** (불필요한 공백 없음) 이며 객체 키는 사전순으로 정렬됩니다 (`encoding/json` 동작과 일치, 출력 결정성 보장). 미화 출력이 필요하면 결과에 별도로 [`Prettify`](./output#prettify) 를 사용하세요.
:::

### delete — 배치 삭제

`delete` 작업의 `Result` 는 **삭제된 전체 JSON 문자열** 입니다.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"user":{"name":"CyberGo","age":25,"temp":"x"},"debug":true}`

	results, err := json.ProcessBatch([]json.BatchOperation{
		{Type: "delete", JSONStr: data, Path: "user.temp", ID: "drop-temp"},
		{Type: "delete", JSONStr: data, Path: "debug", ID: "drop-debug"},
	})
	if err != nil {
		panic(err)
	}

	for _, r := range results {
		if r.Error != nil {
			fmt.Printf("%s 실패: %v\n", r.ID, r.Error)
			continue
		}
		fmt.Printf("%s -> %s\n", r.ID, r.Result)
	}
}

// 출력:
// drop-temp -> {"debug":true,"user":{"age":25,"name":"CyberGo"}}
// drop-debug -> {"user":{"age":25,"name":"CyberGo","temp":"x"}}
```

### validate — 배치 검증

`validate` 작업의 `Result` 는 항상 `map[string]any{"valid": bool}` 입니다; JSON 이 잘못되면 `valid` 가 `false` 이고 `Error` 에 파싱 오류가 담깁니다.

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	results, err := json.ProcessBatch([]json.BatchOperation{
		{Type: "validate", JSONStr: `{"name":"CyberGo"}`, ID: "ok"},
		{Type: "validate", JSONStr: `{"name":}`, ID: "broken"},
	})
	if err != nil {
		panic(err)
	}

	for _, r := range results {
		if m, ok := r.Result.(map[string]any); ok {
			fmt.Printf("%s: valid=%v\n", r.ID, m["valid"])
		}
		if r.Error != nil {
			fmt.Printf("%s 오류: %v\n", r.ID, r.Error)
		}
	}
}

// 출력:
// ok: valid=true
// broken: valid=false
// broken 오류: invalid JSON: ...
```

## 오류 처리와 내결함성

### 단일 작업 실패는 배치를 중단하지 않음

`ProcessBatch` 은 **항상 모든 작업을 처리합니다**: 어떤 작업이 실패해도 해당 결과의 `Error` 필드에만 기록되고 이후 작업을 중단하지 않으며, 이를 켜는 설정도 필요 없습니다. 따라서 배치 결과는 '부분 성공, 부분 실패'일 수 있으므로 반드시 `r.Error` 를 하나씩 검사하세요:

```go
results, err := json.ProcessBatch(operations)
if err != nil {
	// err 은 프로세서 종료, 잘못된 설정, MaxBatchSize 초과 시에만 발생
	panic(err)
}
var failed int
for _, r := range results {
	if r.Error != nil {
		failed++
		log.Printf("작업 %s 실패: %v", r.ID, r.Error)
		continue
	}
	// r.Result 처리 ...
}
```

::: tip ContinueOnError 와의 차이
`Config.ContinueOnError` 필드는 [`SetMultiple`](./modify#setmultiple) 의 중간 내결함 (어떤 경로 쓰기가 실패했을 때 나머지 경로를 계속 쓸지) 을 제어하며, `ProcessBatch` 에는 **작용하지 않습니다**. `ProcessBatch` 의 작업별 격리는 내장 동작으로, 이 스위치로 끌 수 없습니다.
:::

## 실전 시나리오: 배치 데이터 마이그레이션

한 묶음의 레코드에 마이그레이션 표시를 일괄 추가합니다. `ProcessBatch` 호출 한 번으로 전체 변환을 마치고 각 레코드의 출력을 수집합니다:

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// 데이터 소스에서 읽어온 여러 레코드를 모사
	records := []string{
		`{"id":1,"name":"Alice","age":30}`,
		`{"id":2,"name":"Bob","age":25}`,
		`{"id":3,"name":"CyberGo","age":28}`,
	}

	// 각 레코드에 set 작업을 생성해 마이그레이션 표시 일괄 부여
	ops := make([]json.BatchOperation, len(records))
	for i, r := range records {
		ops[i] = json.BatchOperation{
			Type:    "set",
			JSONStr: r,
			Path:    "migrated",
			Value:   true,
			ID:      fmt.Sprintf("record-%d", i),
		}
	}

	results, err := json.ProcessBatch(ops)
	if err != nil {
		panic(err)
	}

	for _, r := range results {
		if r.Error != nil {
			fmt.Printf("%s 실패: %v\n", r.ID, r.Error)
			continue
		}
		fmt.Printf("%s -> %s\n", r.ID, r.Result)
	}
}

// 출력:
// record-0 -> {"age":30,"id":1,"migrated":true,"name":"Alice"}
// record-1 -> {"age":25,"id":2,"migrated":true,"name":"Bob"}
// record-2 -> {"age":28,"id":3,"migrated":true,"name":"CyberGo"}
```

## 캐시 예열 (WarmupCache)

시그니처: `func WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)`

같은 JSON 의 핫 경로를 미리 평가해 캐시에 채워 넣어, 이후 첫 `Get` 이 바로 캐시에 적중하도록 합니다. 프로세서에 캐시가 켜져 있어야 합니다 (기본 켜짐), 아니면 `JsonsError` 를 반환합니다 (`Op` 는 `warmup_cache`, 오류 메시지는 "cache is disabled, cannot warmup cache").

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"user":{"name":"CyberGo","age":25},"meta":{"version":2}}`

	result, err := json.WarmupCache(data, []string{"user.name", "user.age", "meta.version"})
	if err != nil {
		panic(err)
	}
	fmt.Printf("예열: %d/%d 성공 (%.0f%%)\n", result.Successful, result.TotalPaths, result.SuccessRate)

	// 예열 후 첫 Get 은 캐시에 적중
	name, err := json.Get(data, "user.name")
	if err != nil {
		panic(err)
	}
	fmt.Println("name:", name)
}

// 출력:
// 예열: 3/3 성공 (100%)
// name: CyberGo
```

`WarmupResult` 구조:

| 필드 | 타입 | 설명 |
|------|------|------|
| `TotalPaths` | `int` | 예열 대상 경로 총수 |
| `Successful` | `int` | 성공 수 |
| `Failed` | `int` | 실패 수 |
| `SuccessRate` | `float64` | 성공률 (퍼센트) |
| `FailedPaths` | `[]string` | 실패한 경로 목록 (실패 없으면 nil) |

모든 경로가 실패하면 `WarmupCache` 는 `WarmupResult` 를 반환함과 동시에 마지막 오류를 함께 반환합니다.

## 타입 정의

### BatchOperation

배치 작업 설명 구조체.

```go
type BatchOperation struct {
	Type    string `json:"type"`     // 작업 타입: "get", "set", "delete", "validate"
	JSONStr string `json:"json_str"` // 대상 JSON 문자열
	Path    string `json:"path"`     // 경로 표현식
	Value   any    `json:"value"`    // 작업 값 (set 작업에서 사용)
	ID      string `json:"id"`       // 작업 식별자
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `Type` | `string` | 작업 타입: `get` / `set` / `delete` / `validate` |
| `JSONStr` | `string` | 이 작업의 입력 JSON (각 작업은 서로 독립적이며 체인 누적 안 됨) |
| `Path` | `string` | 경로 표현식 (`validate` 는 사용하지 않음) |
| `Value` | `any` | `set` 이 기록할 값 (나머지 타입은 사용하지 않음) |
| `ID` | `string` | 호출자 정의 식별자, 대응 결과의 `BatchResult.ID` 로 그대로 복사됨 |

### BatchResult

배치 작업 결과 구조체.

```go
type BatchResult struct {
	ID     string `json:"id"`     // 작업 식별자
	Result any    `json:"result"` // 작업 결과 (의미는 Type 에 따라 다름, 위 표 참조)
	Error  error  `json:"error"`  // 오류 정보 (단일 작업 수준)
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `ID` | `string` | 대응 작업의 `ID`; 결과 슬라이스는 입력 작업과 첨자 순서로 일대일 대응 |
| `Result` | `any` | 작업 결과, 의미는 `Type` 에 따라 다름 (위 표 참조) |
| `Error` | `error` | 해당 작업의 오류, `nil` 이면 성공; **반드시 하나씩 검사** |

::: tip Processor 배치 메서드
Processor 인스턴스는 동등한 배치 메서드 `p.ProcessBatch(operations)` 를 제공하며 시그니처는 패키지 레벨 함수와 같습니다. Processor 재사용이나 `Config` 별 커스터마이즈 (예: `Pretty` 출력, `PreserveNumbers`) 가 필요한 시나리오에 적합합니다. 자세한 내용은 [Processor 배치 작업](../processor/batch) 을 참조하세요.
:::

## 관련 문서

- [수정 함수](./modify) - Set, SetMultiple, MergeJSON 등 수정 작업
- [Processor 배치 작업](../processor/batch) - Processor 레벨 배치 작업 메서드 상세
- [보조 도구](../helpers) - WarmupCache, ClearCache, GetStats 등 도구 함수
