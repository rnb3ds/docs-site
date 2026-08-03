---
sidebar_label: "배치 작업"
title: "Processor 배치 작업 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON Processor 배치 작업: ProcessBatch 다중 작업, BatchOperation 과 BatchResult 타입으로 배치 처리에 적합합니다."
sidebar_position: 7
---

# 배치 작업 메서드

Processor 는 배치 작업 능력을 제공하여, 한 번의 호출로 여러 JSON 작업 (get/set/delete/validate) 을 처리합니다. 패키지 레벨 [`ProcessBatch`](../functions/batch)에 비해 Processor 형태는 인스턴스 재사용, 또는 `Config` 로 각 배치의 동작 (출력 보기 좋게, 숫자 보존, 보안 제한 등) 을 커스터마이징하는 데 적합합니다.

## ProcessBatch

시그니처: `func (p *Processor) ProcessBatch(operations []BatchOperation, cfg ...Config) ([]BatchResult, error)`

여러 JSON 작업을 배치로 처리합니다. 반환 결과 순서는 입력 작업 순서와 일치하며, `ID` 필드로 연관됩니다.

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
// 출력：
// name: CyberGo
// age: {"user":{"age":30,"name":"CyberGo"}}
```

### 지원하는 작업 유형

| `Type` | 역할 | `Result` 내용 | 일반적 오류 |
|--------|------|---------------|----------|
| `get` | 경로의 값 읽기 | 경로의 값 (`any`) | `ErrPathNotFound`, `ErrInvalidJSON` |
| `set` | 경로의 값 설정 | **수정된 전체 JSON 문자열** | `ErrPathNotFound` (`CreatePaths` 미활성화 시), `ErrInvalidPath` |
| `delete` | 경로의 노드 삭제 | **삭제 후 전체 JSON 문자열** | `ErrPathNotFound`, `ErrInvalidPath` |
| `validate` | JSON 이 유효한지 검증 | `map[string]any{"valid": bool}` | 유효하지 않은 JSON 의 경우 `Result.valid=false` 이고 `Error` 가 비어있지 않음 |

::: warning 작업은 서로 체인으로 연결되지 않음
각 `BatchOperation` 은 각자의 `JSONStr` 입력에 **독립적으로** 작용하며, 작업 간에 체인으로 누적되지 **않습니다**. 같은 문서에 먼저 `set` 한 뒤 `delete` 하면 "먼저 수정한 뒤 삭제"한 누적 상태가 아니라 두 개의 독립적인 결과를 얻습니다. 단일 문서에 여러 단계 변환이 필요하면 코드에서 이전 단계의 출력을 다음 단계에 전달하거나, [`SetMultiple`](./modify#setmultiple) 등 단일 문서 다중 경로 메서드를 사용하세요.
:::

### 배치 크기 제한

작업 수는 `Config.MaxBatchSize` (기본값 `2000`) 의 제한을 받습니다. 이 상한은 "호출마다" 적용됩니다 — 전달된 `cfg` (있을 경우) 가 프로세서 자체 설정을 덮어씁니다. 초과 시 전체 배치가 즉시 실패하며 `(nil, ErrSizeLimit)` 을 반환합니다.

## 각 작업 유형 예제

### get — 배치 읽기

`get` 작업의 `Result` 는 경로의 원시 값입니다 (숫자는 기본적으로 `float64`).

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
// 출력：
// name: CyberGo
// age: 25
```

### set — 배치 수정

`set` 의 `Result` 는 **수정된 전체 JSON 문자열**입니다 (컴팩트 형식, 객체 키는 사전순 정렬). 기본 `CreatePaths=true` 이므로 새 경로를 설정하면 중간 노드가 자동으로 생성됩니다:

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
// 출력：
// age -> {"user":{"age":30,"name":"CyberGo"}}
// role -> {"user":{"age":25,"name":"CyberGo","role":"admin"}}
```

::: tip 설정이 배치에 작용하는 방식
전달된 `Config` 는 작업별로 투명하게 전달되지만, **모든 필드가 출력에 영향을 주는 것은 아닙니다**: `set`/`delete` 의 반환값은 항상 컴팩트 문자열입니다 (`Pretty` 의 영향을 받지 않음, 보기 좋게 하려면 결과에 별도로 [`Prettify`](./output#prettify) 적용); 실제로 `cfg` 가 적용되는 것은 `MaxBatchSize` (배치 상한), `CreatePaths` (`set` 의 새 경로 생성 허용 여부), `PreserveNumbers` (`get` 이 반환하는 숫자 타입에 영향: 기본 `float64`, 활성화 시 `json.Number`) 입니다.
:::

### delete — 배치 삭제

`delete` 의 `Result` 는 **삭제 후 전체 JSON 문자열**입니다.

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
// 출력：
// drop-temp -> {"debug":true,"user":{"age":25,"name":"CyberGo"}}
// drop-debug -> {"user":{"age":25,"name":"CyberGo","temp":"x"}}
```

### validate — 배치 검증

`validate` 의 `Result` 는 항상 `map[string]any{"valid": bool}` 이며; 유효하지 않은 JSON 의 경우 `valid` 가 `false` 이고 `Error` 가 파싱 오류를 전달합니다.

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
// 출력：
// ok: valid=true
// broken: valid=false
// broken 오류: invalid JSON: ...
```

### 혼합 작업

동일한 배치에서 서로 다른 유형의 작업을 혼합할 수 있으며, 결과는 순서대로 반환됩니다:

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
// 출력：
// 검증 결과: true
// name: CyberGo
// mark: {"processed":true,"user":{"name":"CyberGo"}}
```

## 오류 처리와 내결함성

### 단일 작업 실패가 배치를 중단하지 않음

`ProcessBatch` 는 **항상 모든 작업을 처리**합니다: 어느 작업이 실패해도 해당 결과의 `Error` 필드에만 기록되고 후속 작업이 중단되지 않으며, 어떤 설정 활성화도 필요 없습니다. 따라서 배치 결과는 "일부 성공, 일부 실패"일 수 있으므로 반드시 `r.Error` 를 항목별로 확인해야 합니다:

```go
results, err := p.ProcessBatch(operations)
if err != nil {
    // err 은 프로세서 종료, 설정 비정상, MaxBatchSize 초과 시에만 발생
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
`Config.ContinueOnError` 필드는 [`SetMultiple`](./modify#setmultiple) 의 중도 내결함성 (어느 경로 쓰기 실패 시 나머지 경로 작성을 계속할지) 을 제어하며, `ProcessBatch` 에는 **작용하지 않습니다**. `ProcessBatch` 의 작업별 격리는 내장 동작이며, 이 스위치로 끌 수도 없습니다.
:::

## 실전 시나리오: 배치 데이터 마이그레이션

여러 레코드에 마이그레이션 마크를 일괄 추가할 때, 한 번의 `ProcessBatch` 호출로 모든 변환을 완료합니다. Processor 형태는 장기 실행 서비스에서 동일 인스턴스로 대량 배치를 처리하는 데 특히 적합합니다:

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
// 출력：
// record-0 -> {"age":30,"id":1,"migrated":true,"name":"Alice"}
// record-1 -> {"age":25,"id":2,"migrated":true,"name":"Bob"}
// record-2 -> {"age":28,"id":3,"migrated":true,"name":"CyberGo"}
```

## 캐시 웜업 WarmupCache

시그니처: `func (p *Processor) WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)`

동일한 JSON 의 핫 경로를 미리 평가하여 캐시에 채워 넣고, 이후 첫 [`Get`](./query) 이 즉시 캐시에 적중하도록 합니다. Processor 의 캐시 활성화가 필요합니다 (기본 활성화), 그렇지 않으면 `ErrCacheDisabled` 를 반환합니다.

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
    fmt.Printf("웜업：%d/%d 성공（%.0f%%）\n", result.Successful, result.TotalPaths, result.SuccessRate)
}
// 출력：
// 웜업：3/3 성공（100%）
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

### BatchOperation 구조체

```go
type BatchOperation struct {
    Type    string `json:"type"`     // 작업 유형: "get", "set", "delete", "validate"
    JSONStr string `json:"json_str"` // JSON 문자열
    Path    string `json:"path"`     // 대상 경로
    Value   any    `json:"value"`    // Set 작업의 값
    ID      string `json:"id"`       // 작업 식별자
}
```

### BatchResult 구조체

```go
type BatchResult struct {
    ID     string `json:"id"`     // 해당 작업의 ID
    Result any    `json:"result"` // 작업 결과 (의미는 Type 에 따라 변함, 위 표 참조)
    Error  error  `json:"error"`  // 단일 작업의 오류 (다른 작업에 영향 없음)
}
```

## 주의 사항

1. 각 작업은 독립적으로 실행되며, 하나의 실패가 다른 작업에 영향을 주지 않습니다 (내장 동작, 설정 불필요)
2. 결과 순서는 작업 순서와 일치하며, `ID` 로 작업과 결과를 매칭합니다
3. `MaxBatchSize` (기본값 2000) 는 호출마다 `cfg` 로 적용되며, 초과 시 전체 배치가 실패합니다

## 관련 문서

- [경로 쿼리](./query) - Get 시리즈 메서드
- [데이터 수정](./modify) - Set/Delete/SetMultiple 메서드
- [패키지 레벨 배치 작업](../functions/batch) - Processor 불필요한 패키지 레벨 ProcessBatch
