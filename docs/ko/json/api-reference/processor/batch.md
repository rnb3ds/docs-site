---
sidebar_label: "배치 작업"
title: "Processor 배치 작업 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON Processor 배치 작업: ProcessBatch 한 번의 호출로 get/set/delete/validate 여러 종류 작업을 처리하고 BatchOperation 과 BatchResult 타입, Config 맞춤 배치로 재사용 인스턴스에 적합합니다."
sidebar_position: 7
---

# 배치 작업 메서드

Processor 는 배치 작업 능력을 제공하여 한 번의 호출로 여러 JSON 작업 (get/set/delete/validate) 을 처리합니다. 패키지 레벨 [`ProcessBatch`](../functions/batch) 와 비교하면 Processor 형태는 인스턴스 재사용이나 `Config` 로 배치별 동작 커스터마이즈 (미화 출력, 숫자 보존, 보안 제한 등) 에 적합합니다.

## ProcessBatch

시그니처: `func (p *Processor) ProcessBatch(operations []BatchOperation, cfg ...Config) ([]BatchResult, error)`

여러 JSON 작업을 배치로 처리합니다. 결과 순서는 입력 작업 순서와 같으며 `ID` 필드로 연결됩니다.

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

	data := `{"user":{"name":"CyberGo","age":25}}`
	results, err := p.ProcessBatch([]json.BatchOperation{
		{Type: "get", JSONStr: data, Path: "user.name", ID: "name"},
		{Type: "set", JSONStr: data, Path: "user.age", Value: 30, ID: "age"},
	})
	if err != nil {
		panic(err)
	}
	for _, r := range results {
		fmt.Printf("%s: %v\n", r.ID, r.Result)
	}
}

// 출력:
// name: CyberGo
// age: {"user":{"age":30,"name":"CyberGo"}}
```

### 지원하는 작업 타입

| `Type` | 역할 | `Result` 내용 | 전형적인 오류 |
|--------|------|---------------|----------|
| `get` | 경로의 값 읽기 | 경로의 값 (`any`) | `ErrPathNotFound`, `ErrInvalidJSON` |
| `set` | 경로에 값 설정 | **수정된 전체 JSON 문자열** | `ErrPathNotFound` (`CreatePaths` 꺼짐), `ErrInvalidPath` |
| `delete` | 경로의 노드 삭제 | **삭제된 전체 JSON 문자열** | `ErrPathNotFound`, `ErrInvalidPath` |
| `validate` | JSON 이 유효한지 검증 | `map[string]any{"valid": bool}` | JSON 이 무효면 `Result.valid=false` 이고 `Error` 가 비어 있지 않음 |

::: warning 작업은 서로 체인되지 않음
각 `BatchOperation` 은 각자의 `JSONStr` 입력에 **독립적으로** 적용되며, 작업 사이에 체인 누적이 **없습니다**. 같은 문서에 먼저 `set` 하고 `delete` 하면 '고친 뒤 지우기'가 아니라 두 개의 독립 결과를 얻습니다. 단일 문서에 여러 단계 변환이 필요하면 코드에서 이전 단계의 출력을 다음 단계에 넣거나, [`SetMultiple`](./modify#setmultiple) 같은 단일 문서 다중 경로 메서드를 사용하세요.
:::

### 배치 크기 제한

작업 수는 `Config.MaxBatchSize` 의 제약을 받습니다 (기본 `2000`). 이 상한은 '호출 단위'로 적용됩니다 — 전달한 `cfg` (있다면) 가 Processor 자체 설정을 덮어씁니다. 초과하면 배치 전체가 바로 실패하며 `(nil, ErrSizeLimit)` 을 반환합니다.

## 작업 타입별 예제

### get — 배치 읽기

`get` 작업의 `Result` 는 경로의 원시 값입니다 (숫자는 기본 `float64`).

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

	data := `{"user":{"name":"CyberGo","age":25}}`
	results, err := p.ProcessBatch([]json.BatchOperation{
		{Type: "get", JSONStr: data, Path: "user.name", ID: "name"},
		{Type: "get", JSONStr: data, Path: "user.age", ID: "age"},
	})
	if err != nil {
		panic(err)
	}
	for _, r := range results {
		fmt.Printf("%s: %v\n", r.ID, r.Result)
	}
}

// 출력:
// name: CyberGo
// age: 25
```

### set — 배치 수정

`set` 의 `Result` 는 **수정된 전체 JSON 문자열** 입니다 (컴팩트 형식, 객체 키는 사전순). 기본 `CreatePaths=true` 이므로 새 경로 설정 시 중간 노드가 자동 생성됩니다:

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

	data := `{"user":{"name":"CyberGo","age":25}}`
	results, err := p.ProcessBatch([]json.BatchOperation{
		{Type: "set", JSONStr: data, Path: "user.age", Value: 30, ID: "age"},
		{Type: "set", JSONStr: data, Path: "user.role", Value: "admin", ID: "role"},
	})
	if err != nil {
		panic(err)
	}
	for _, r := range results {
		fmt.Printf("%s -> %s\n", r.ID, r.Result)
	}
}

// 출력:
// age -> {"user":{"age":30,"name":"CyberGo"}}
// role -> {"user":{"age":25,"name":"CyberGo","role":"admin"}}
```

::: tip 설정이 배치에 작용하는 방식
전달한 `Config` 는 작업마다 투과되지만, **모든 필드가 출력에 영향을 주지는 않습니다**: `set`/`delete` 의 반환값은 항상 컴팩트 문자열입니다 (`Pretty` 의 영향을 받지 않음; 미화가 필요하면 결과에 별도로 [`Prettify`](./output#prettify) 사용); 실제로 `cfg` 대로 적용되는 것은 `MaxBatchSize` (배치 상한), `CreatePaths` (`set` 이 새 경로를 만들 수 있는지), `PreserveNumbers` (`get` 이 반환하는 숫자 타입: 기본 `float64`, 켜면 `json.Number`) 입니다.
:::

### delete — 배치 삭제

`delete` 의 `Result` 는 **삭제된 전체 JSON 문자열** 입니다.

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

	data := `{"user":{"name":"CyberGo","age":25,"temp":"x"},"debug":true}`
	results, err := p.ProcessBatch([]json.BatchOperation{
		{Type: "delete", JSONStr: data, Path: "user.temp", ID: "drop-temp"},
		{Type: "delete", JSONStr: data, Path: "debug", ID: "drop-debug"},
	})
	if err != nil {
		panic(err)
	}
	for _, r := range results {
		fmt.Printf("%s -> %s\n", r.ID, r.Result)
	}
}

// 출력:
// drop-temp -> {"debug":true,"user":{"age":25,"name":"CyberGo"}}
// drop-debug -> {"user":{"age":25,"name":"CyberGo","temp":"x"}}
```

### validate — 배치 검증

`validate` 의 `Result` 는 항상 `map[string]any{"valid": bool}` 입니다; JSON 이 잘못되면 `valid` 가 `false` 이고 `Error` 에 파싱 오류가 담깁니다.

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

	results, err := p.ProcessBatch([]json.BatchOperation{
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

### 혼합 작업

같은 배치에 서로 다른 타입의 작업을 섞을 수 있으며, 결과는 순서대로 반환됩니다:

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

	data := `{"user":{"name":"CyberGo"},"processed":false}`
	results, err := p.ProcessBatch([]json.BatchOperation{
		{Type: "validate", JSONStr: data, ID: "check"},
		{Type: "get", JSONStr: data, Path: "user.name", ID: "name"},
		{Type: "set", JSONStr: data, Path: "processed", Value: true, ID: "mark"},
	})
	if err != nil {
		panic(err)
	}

	for _, r := range results {
		if r.ID == "check" {
			if m, ok := r.Result.(map[string]any); ok {
				fmt.Printf("검증 결과: %v\n", m["valid"])
			}
		} else {
			fmt.Printf("%s: %v\n", r.ID, r.Result)
		}
	}
}

// 출력:
// 검증 결과: true
// name: CyberGo
// mark: {"processed":true,"user":{"name":"CyberGo"}}
```

## 오류 처리와 내결함성

### 단일 작업 실패는 배치를 중단하지 않음

`ProcessBatch` 은 **항상 모든 작업을 처리합니다**: 어떤 작업이 실패해도 해당 결과의 `Error` 필드에만 기록되고 이후 작업을 중단하지 않으며, 이를 켜는 설정도 필요 없습니다. 따라서 배치 결과는 '부분 성공, 부분 실패'일 수 있으므로 반드시 `r.Error` 를 하나씩 검사하세요:

```go
results, err := p.ProcessBatch(operations)
if err != nil {
	// err 은 프로세서 종료, 잘못된 설정, MaxBatchSize 초과 시에만 발생
	return err
}
for _, r := range results {
	if r.Error != nil {
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

한 묶음의 레코드에 마이그레이션 표시를 일괄 추가합니다. `ProcessBatch` 호출 한 번으로 전체 변환을 마칩니다. Processor 형태는 장수명 서비스에서 같은 인스턴스로 대량의 배치를 처리하는 재사용에 특히 적합합니다:

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

	records := []string{
		`{"id":1,"name":"Alice","age":30}`,
		`{"id":2,"name":"Bob","age":25}`,
		`{"id":3,"name":"CyberGo","age":28}`,
	}

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

	results, err := p.ProcessBatch(ops)
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

시그니처: `func (p *Processor) WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)`

같은 JSON 의 핫 경로를 미리 평가해 캐시에 채워 넣어, 이후 첫 [`Get`](./query) 이 바로 캐시에 적중하도록 합니다. Processor 에 캐시가 켜져 있어야 합니다 (기본 켜짐), 아니면 `JsonsError` 를 반환합니다 (`Op` 는 `warmup_cache`, 오류 메시지는 "cache is disabled, cannot warmup cache").

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

	data := `{"user":{"name":"CyberGo","age":25},"meta":{"version":2}}`
	result, err := p.WarmupCache(data, []string{"user.name", "user.age", "meta.version"})
	if err != nil {
		panic(err)
	}
	fmt.Printf("예열: %d/%d 성공 (%.0f%%)\n", result.Successful, result.TotalPaths, result.SuccessRate)
}

// 출력:
// 예열: 3/3 성공 (100%)
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

### BatchOperation 구조

```go
type BatchOperation struct {
	Type    string `json:"type"`     // 작업 타입: "get", "set", "delete", "validate"
	JSONStr string `json:"json_str"` // JSON 문자열
	Path    string `json:"path"`     // 대상 경로
	Value   any    `json:"value"`    // set 작업의 값
	ID      string `json:"id"`       // 작업 식별자
}
```

### BatchResult 구조

```go
type BatchResult struct {
	ID     string `json:"id"`     // 대응하는 작업 ID
	Result any    `json:"result"` // 작업 결과 (의미는 Type 에 따라 다름, 위 표 참조)
	Error  error  `json:"error"`  // 단일 작업의 오류 (다른 작업에 영향 없음)
}
```

## 주의 사항

1. 각 작업은 독립 실행되며 하나의 실패가 다른 작업에 영향을 주지 않습니다 (내장 동작, 설정 불필요)
2. 결과 순서는 작업 순서와 같으며, `ID` 로 작업과 결과를 연결합니다
3. `MaxBatchSize` (기본 2000) 는 호출별 `cfg` 기준으로 적용되며, 초과하면 배치 전체가 실패합니다

## 관련 문서

- [경로 쿼리](./query) - Get 계열 메서드
- [데이터 수정](./modify) - Set/Delete/SetMultiple 메서드
- [패키지 레벨 배치 작업](../functions/batch) - Processor 없이 쓰는 패키지 레벨 ProcessBatch
