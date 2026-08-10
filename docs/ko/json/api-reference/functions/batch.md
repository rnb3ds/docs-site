---
sidebar_label: "배치 작업"
title: "배치 작업 함수 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON 배치 작업 함수: ProcessBatch 로 여러 JSON 작업을 한 번에 처리하고 BatchOperation 구조체와 BatchResult 결과 구조체를 함께 제공합니다."
sidebar_position: 7
---

# 배치 작업 함수

json 패키지가 제공하는 배치 작업 함수로, 여러 JSON 작업 (get/set/delete/validate) 을 한 번에 처리하며 배치 데이터 처리 시나리오에 적합합니다.

## ProcessBatch

시그니처: `func ProcessBatch(operations []BatchOperation, cfg ...Config) ([]BatchResult, error)`

여러 JSON 작업을 배치로 처리합니다 (패키지 레벨 함수, Processor 생성 불필요). 반환 결과 순서는 입력 작업 순서와 일일이 대응하며, `ID` 필드로 연관됩니다.

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
// 출력：
// 작업 op1 결과: CyberGo
// 작업 op2 결과: {"user":{"age":30,"name":"CyberGo"}}
```

### 지원하는 작업 유형

| `Type` | 역할 | `Result` 내용 | 일반적 오류 |
|--------|------|---------------|----------|
| `get` | 경로의 값 읽기 | 경로의 값 (`any`) | `ErrPathNotFound`, `ErrInvalidJSON` |
| `set` | 경로의 값 설정 | **수정된 전체 JSON 문자열** | `ErrPathNotFound` (`CreatePaths` 미활성화 시), `ErrInvalidPath` |
| `delete` | 경로의 노드 삭제 | **삭제 후 전체 JSON 문자열** | `ErrPathNotFound`, `ErrInvalidPath` |
| `validate` | JSON 이 유효한지 검증 | `map[string]any{"valid": bool}` | 유효하지 않은 JSON 의 경우 `Result.valid=false` 이고 `Error` 가 비어있지 않음 |

::: warning 작업은 서로 체인으로 연결되지 않음
각 `BatchOperation` 은 각자의 `JSONStr` 입력에 **독립적으로** 작용하며, 작업 간에 체인으로 누적되지 **않습니다**. 예를 들어 같은 문서에 먼저 `set` 한 뒤 `delete` 하면 두 개의 독립적인 결과를 얻을 뿐, "먼저 수정한 뒤 삭제"한 누적 상태가 아닙니다. 단일 문서에 여러 단계 변환이 필요하면 코드에서 이전 단계의 출력을 다음 단계에 전달하거나, [`SetMultiple`](./modify#setmultiple) 등 단일 문서 다중 경로 메서드를 사용하세요.
:::

### 배치 크기 제한

작업 수는 `Config.MaxBatchSize` (기본값 `2000`) 의 제한을 받습니다. 초과 시 전체 배치가 즉시 실패하며 `(nil, ErrSizeLimit)` 을 반환합니다:

```go
// 상한 커스터마이즈 (대규모 배치 시나리오에 적용)
cfg := json.DefaultConfig()
cfg.MaxBatchSize = 5000
results, err := json.ProcessBatch(ops, cfg)
```

## 각 작업 유형 예제

### get — 배치 읽기

`get` 작업의 `Result` 는 경로의 원시 값입니다 (숫자는 기본적으로 `float64`, 불리언은 `bool`, 문자열은 `string`).

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
// 출력：
// name = CyberGo
// age = 25
// active = true
```

### set — 배치 수정

`set` 작업의 `Result` 는 **수정된 전체 JSON 문자열**입니다 (쓰기 값 자체가 아님에 주의). 기본 설정 `CreatePaths=true` 이므로 새 경로를 설정하면 중간 노드가 자동으로 생성됩니다.

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
// 출력：
// update-age -> {"user":{"age":30,"name":"CyberGo"}}
// add-role -> {"user":{"age":25,"name":"CyberGo","role":"admin"}}
```

::: tip 출력 형식 설명
`set`/`delete` 가 반환하는 JSON 문자열은 **컴팩트 형식** (불필요한 공백 없음) 이며, 객체 키는 사전순으로 정렬됩니다 (`encoding/json` 동작과 일치, 출력의 결정성 보장). 출력을 보기 좋게 하려면 결과에 별도로 [`Prettify`](./output#prettify) 를 적용하세요.
:::

### delete — 배치 삭제

`delete` 작업의 `Result` 는 **삭제 후 전체 JSON 문자열**입니다.

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
// 출력：
// drop-temp -> {"debug":true,"user":{"age":25,"name":"CyberGo"}}
// drop-debug -> {"user":{"age":25,"name":"CyberGo","temp":"x"}}
```

### validate — 배치 검증

`validate` 작업의 `Result` 는 항상 `map[string]any{"valid": bool}` 이며; JSON 이 유효하지 않을 때 `valid` 는 `false` 이고 `Error` 가 파싱 오류를 전달합니다.

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
// 출력：
// ok: valid=true
// broken: valid=false
// broken 오류: invalid JSON: ...
```

## 오류 처리와 내결함성

### 단일 작업 실패가 배치를 중단하지 않음

`ProcessBatch` 는 **항상 모든 작업을 처리**합니다: 어느 작업이 실패해도 해당 결과의 `Error` 필드에만 기록되고 후속 작업이 중단되지 않으며, 어떤 설정 활성화도 필요 없습니다. 따라서 배치 결과는 "일부 성공, 일부 실패"일 수 있으므로 반드시 `r.Error` 를 항목별로 확인해야 합니다:

```go
results, err := json.ProcessBatch(operations)
if err != nil {
    // err 은 프로세서 종료, 설정 비정상, MaxBatchSize 초과 시에만 발생
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
`Config.ContinueOnError` 필드는 [`SetMultiple`](./modify#setmultiple) 의 중도 내결함성 (어느 경로 쓰기 실패 시 나머지 경로 작성을 계속할지) 을 제어하며, `ProcessBatch` 에는 **작용하지 않습니다**. `ProcessBatch` 의 작업별 격리는 내장 동작이며, 이 스위치로 끌 수도 없습니다.
:::

## 실전 시나리오: 배치 데이터 마이그레이션

여러 레코드에 마이그레이션 마크를 일괄 추가할 때, 한 번의 `ProcessBatch` 호출로 모든 변환을 완료하고 각 레코드의 출력을 수집합니다:

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    // 데이터 소스에서 읽어온 여러 레코드를 시뮬레이션
    records := []string{
        `{"id":1,"name":"Alice","age":30}`,
        `{"id":2,"name":"Bob","age":25}`,
        `{"id":3,"name":"CyberGo","age":28}`,
    }

    // 각 레코드에 대해 set 작업을 생성, 통일된 마이그레이션 마크 부여
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
// 출력：
// record-0 -> {"age":30,"id":1,"migrated":true,"name":"Alice"}
// record-1 -> {"age":25,"id":2,"migrated":true,"name":"Bob"}
// record-2 -> {"age":28,"id":3,"migrated":true,"name":"CyberGo"}
```

## 캐시 웜업 WarmupCache

시그니처: `func WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)`

동일한 JSON 의 핫 경로를 미리 평가하여 캐시에 채워 넣고, 이후 첫 `Get` 이 즉시 캐시에 적중하도록 합니다. 프로세서의 캐시 활성화가 필요합니다 (기본 활성화), 그렇지 않으면 `ErrCacheDisabled` 를 반환합니다.

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
    fmt.Printf("웜업：%d/%d 성공（%.0f%%）\n", result.Successful, result.TotalPaths, result.SuccessRate)

    // 웜업 후 첫 Get 이 캐시 적중
    name, err := json.Get(data, "user.name")
    if err != nil {
        panic(err)
    }
    fmt.Println("name:", name)
}
// 출력：
// 웜업：3/3 성공（100%）
// name: CyberGo
```

`WarmupResult` 구조:

| 필드 | 타입 | 설명 |
|------|------|------|
| `TotalPaths` | `int` | 웜업 대상 경로 총수 |
| `Successful` | `int` | 성공 건수 |
| `Failed` | `int` | 실패 건수 |
| `SuccessRate` | `float64` | 성공률 (백분율) |
| `FailedPaths` | `[]string` | 실패한 경로 목록 (실패 없을 시 nil) |

모든 경로가 실패할 때, `WarmupCache` 는 `WarmupResult` 를 반환함과 동시에 마지막 오류를 함께 전달합니다.

## 타입 정의

### BatchOperation

배치 작업 설명 구조체입니다.

```go
type BatchOperation struct {
    Type    string `json:"type"`     // 작업 유형: "get", "set", "delete", "validate"
    JSONStr string `json:"json_str"` // 대상 JSON 문자열
    Path    string `json:"path"`     // 경로 표현식
    Value   any    `json:"value"`    // 작업 값 (set 작업에서 사용)
    ID      string `json:"id"`       // 작업 식별자
}
```

### BatchResult

배치 작업 결과 구조체입니다.

```go
type BatchResult struct {
    ID     string `json:"id"`     // 작업 식별자
    Result any    `json:"result"` // 작업 결과 (의미는 Type 에 따라 변함, 위 표 참조)
    Error  error  `json:"error"`  // 오류 정보 (단일 작업 수준)
}
```

::: tip Processor 배치 메서드
Processor 인스턴스는 동등한 배치 메서드 `p.ProcessBatch(operations)` 를 제공하며, 시그니처는 패키지 레벨 함수와 동일합니다. Processor 를 재사용하거나 `Config` 로 (예: `Pretty` 출력, `PreserveNumbers`) 커스터마이징이 필요한 시나리오에 적합합니다. 자세한 내용은 [Processor 배치 작업](../processor/batch)을 참조하세요.
:::

## 관련 문서

- [수정 함수](./modify) - Set, SetMultiple, MergeJSON 등 수정 작업
- [Processor 배치 작업](../processor/batch) - Processor 수준 배치 작업 메서드 상세
- [유틸리티 함수](../helpers) - WarmupCache, ClearCache, GetStats 등 도구 함수
