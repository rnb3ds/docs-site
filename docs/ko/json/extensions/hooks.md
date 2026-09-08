---
sidebar_label: "Hook 시스템"
title: "Hook 훅 시스템 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON Hook 시스템: Hook 인터페이스, LoggingHook, TimingHook, ValidationHook, ErrorHook 과 커스텀 훅으로 Before/After 와 HookContext 를 통해 JSON 작업 전후에 커스텀 로직을 삽입합니다."
sidebar_position: 1
---

# Hook 훅 시스템

Hook 은 JSON 작업 전후에 커스텀 로직을 삽입하여 로그 기록, 성능 모니터링, 검증 등의 기능을 구현할 수 있습니다.

::: tip 인터페이스 시그니처 참조
Hook 인터페이스의 전체 타입 시그니처 (`Hook`, `HookContext`, `HookFunc`) 는 [인터페이스 정의](../api-reference/interfaces#훅-인터페이스)를 참조하세요. 이 페이지는 사용 가이드와 모범 사례에 중점을 둡니다.
:::

## Hook 인터페이스

```go
type Hook interface {
	Before(ctx HookContext) error
	After(ctx HookContext, result any, err error) (any, error)
}
```

### 메서드 설명

| 메서드 | 설명 |
|------|------|
| `Before(ctx HookContext) error` | 작업 전에 호출, 오류를 반환하면 작업 중단 |
| `After(ctx HookContext, result any, err error) (any, error)` | 작업 후에 호출, 결과 수정 또는 오류 반환 가능 |

---

## HookContext 구조체

HookContext 는 작업의 컨텍스트 정보를 제공합니다.

```go
type HookContext struct {
	Operation string    // 작업 타입: "get", "set", "delete", "marshal", "unmarshal"
	JSONStr   string    // 입력 JSON 문자열 (marshal시 비어있을 수 있음). 보안 경고: 민감한 데이터가 포함될 수 있음
	Path      string    // 대상 경로 (marshal/unmarshal 시 비어있을 수 있음)
	Value     any       // set 작업의 값
	Config    *Config   // 활성 설정
	StartTime time.Time // 작업 시작 시간
}
```

### 필드 설명

| 필드 | 타입 | 설명 |
|------|------|------|
| `Operation` | `string` | 작업 타입, 값: `get`, `set`, `delete`, `marshal`, `unmarshal` |
| `JSONStr` | `string` | 입력 JSON 문자열 (**보안 경고: 민감한 데이터가 포함될 수 있음**) |
| `Path` | `string` | 대상 경로 표현식 |
| `Value` | `any` | set 작업의 값 |
| `Config` | `*Config` | 현재 사용 중인 설정 |
| `StartTime` | `time.Time` | 작업 시작 시간 (`After` 트리거 직전에 설정되며, 소요 시간 계산에 사용 가능) |

::: warning 현재 트리거 지점
훅은 현재 **`Get` / `Set` / `Delete`** 에서 트리거됩니다 (패키지 레벨 래퍼 `json.Get`/`json.Set`/`json.Delete` 포함, 내부적으로 같은 Processor 경로를 사용). `Encode`/`Marshal`/`Unmarshal` 경로는 **아직 훅을 트리거하지 않습니다** — `Operation` 의 `marshal`/`unmarshal` 값은 예약되어 있으므로 의존하지 마세요.
:::

::: tip JSONStr 을 기록하지 마세요
`JSONStr` 에는 비밀번호, 토큰, PII 가 포함될 수 있습니다. 로그에는 `Operation` 과 `Path` 만 사용하세요; 내용을 검사해야 한다면 특정 경로로 파싱한 뒤 판단하세요.
:::

---

## HookFunc 어댑터

HookFunc 은 구조체 어댑터로, 함수를 Hook 으로 사용할 수 있게 합니다. Before 또는 After 중 하나만 필요한 시나리오에 적합합니다.

```go
type HookFunc struct {
	BeforeFn func(ctx HookContext) error
	AfterFn  func(ctx HookContext, result any, err error) (any, error)
}
```

### 예제

```go
// After 만 필요한 경우
p.AddHook(&json.HookFunc{
	AfterFn: func(ctx json.HookContext, result any, err error) (any, error) {
		log.Printf("%s completed in %v", ctx.Operation, time.Since(ctx.StartTime))
		return result, err
	},
})

// Before 만 필요한 경우
p.AddHook(&json.HookFunc{
	BeforeFn: func(ctx json.HookContext) error {
		log.Printf("starting %s on path %s", ctx.Operation, ctx.Path)
		return nil
	},
})
```

### Hook 과 HookFunc 중 무엇을 선택할까

| 관점 | 커스텀 타입으로 `Hook` 구현 | `HookFunc` 어댑터 |
|------|----------------------|-------------------|
| 상태 보유 | 구조체 필드 (logger, 카운터, 버퍼) | 클로저 캡처 |
| 한쪽만 가로채면 충분 | 두 메서드를 모두 구현해야 함 (다른 쪽은 원값 반환) | `BeforeFn` 또는 `AfterFn` 중 하나만 채우면 됨 |
| 재사용과 테스트 | 독립 타입이라 단위 테스트와 여러 인스턴스화에 유리 | 그 자리에서 정의, 일회성 로직에 적합 |
| 적합한 용도 | 복잡하거나 상태 있는 훅 (감사, 메트릭 집계) | 가벼운 훅 (계측, 단순 검증) |

`HookFunc` 에서 설정하지 않은 함수는 무작동입니다: `BeforeFn` 이 없으면 Before 단계가 바로 통과되고, `AfterFn` 이 없으면 결과와 오류가 그대로 반환됩니다.

---

## 편리한 Hook 팩토리 함수

### LoggingHook

로그 기록 Hook 을 생성합니다. 매개변수는 `Info(msg string, args ...any)` 만 구현하면 됩니다 — `*slog.Logger` 가 자연스럽게 충족하며, 자체 로깅 파사드도 전달할 수 있습니다.

```go
func LoggingHook(logger interface{ Info(msg string, args ...any) }) Hook
```

```go
p.AddHook(json.LoggingHook(slog.Default()))
```

전체 예제 (최소 인터페이스로 커스텀 logger 를 만들어, 한 번의 작업이 Before + After 로그를 두 번 트리거하는지 확인):

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

// CountingLogger 는 Info 메서드만 구현하면 LoggingHook 의 logger 가 됩니다
type CountingLogger struct{ calls int }

func (l *CountingLogger) Info(msg string, args ...any) {
	l.calls++
}

func main() {
	logger := &CountingLogger{}

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()
	p.AddHook(json.LoggingHook(logger))

	_, err = p.Get(`{"name": "Alice"}`, "name")
	if err != nil {
		panic(err)
	}

	fmt.Println("로그 호출 횟수:", logger.calls)
	// 출력: 로그 호출 횟수: 2  (Before 와 After 각 한 번)
}
```

### TimingHook

작업 소요 시간을 기록하는 Hook 을 생성합니다. 매개변수는 `Record(op string, duration time.Duration)` 만 구현하면 되어, 자체 메트릭 시스템에 연결하기 좋습니다.

```go
func TimingHook(recorder interface {
	Record(op string, duration time.Duration)
}) Hook
```

```go
p.AddHook(json.TimingHook(myMetricsRecorder))
```

전체 예제 (작업 타입별로 호출 횟수 집계):

```go
package main

import (
	"fmt"
	"sync"
	"time"

	"github.com/cybergodev/json"
)

// MetricsRecorder 는 Record 인터페이스를 구현해 작업 타입별로 카운트
type MetricsRecorder struct {
	mu    sync.Mutex
	count map[string]int
}

func (m *MetricsRecorder) Record(op string, duration time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.count[op]++
}

func main() {
	recorder := &MetricsRecorder{count: make(map[string]int)}

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()
	p.AddHook(json.TimingHook(recorder))

	if _, err := p.Get(`{"a": 1}`, "a"); err != nil {
		panic(err)
	}
	if _, err := p.Set(`{"a": 1}`, "b", 2); err != nil {
		panic(err)
	}

	fmt.Println("get 타이밍 기록:", recorder.count["get"])
	fmt.Println("set 타이밍 기록:", recorder.count["set"])
	// 출력:
	// get 타이밍 기록: 1
	// set 타이밍 기록: 1
}
```

### ValidationHook

작업 전에 입력을 검증하는 Hook 을 생성합니다. 검증 함수는 `(jsonStr, path)` 를 받으며, 오류를 반환하면 **작업이 중단**됩니다 (작업 본체가 실행되지 않음).

```go
func ValidationHook(validator func(jsonStr, path string) error) Hook
```

```go
p.AddHook(json.ValidationHook(func(jsonStr, path string) error {
	if len(jsonStr) > 1_000_000 {
		return errors.New("JSON too large")
	}
	return nil
}))
```

전체 예제 (민감한 경로 접근 차단):

```go
package main

import (
	"errors"
	"fmt"
	"strings"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	p.AddHook(json.ValidationHook(func(jsonStr, path string) error {
		if strings.HasPrefix(path, "secret.") {
			return errors.New("민감한 경로 접근 금지: " + path)
		}
		return nil
	}))

	_, err = p.Get(`{"name": "Alice", "secret": {"token": "t"}}`, "name")
	fmt.Println("일반 경로 거부됨:", err != nil)

	_, err = p.Get(`{"name": "Alice", "secret": {"token": "t"}}`, "secret.token")
	fmt.Println("민감 경로 거부됨:", err != nil)
	// 출력:
	// 일반 경로 거부됨: false
	// 민감 경로 거부됨: true
}
```

### ErrorHook

`ErrorHook` 은 `HookFunc` 의 After 단계를 기반으로 구현되어 오류를 가로채 처리합니다: 작업이 **실제로 실패** (`err != nil`) 했을 때만 handler 를 호출하고, 성공 시에는 그대로 통과합니다. handler 가 반환한 오류는 원래 오류를 **대체**해 위로 전파됩니다 (보고 후 그대로 반환하거나, 외부에 안전한 오류로 변환하는 용도); `nil` 을 반환하면 이번 오류를 삼켜버리므로 (호출자는 성공으로 간주) 명확히 필요한 경우에만 사용하세요.

```go
func ErrorHook(handler func(ctx HookContext, err error) error) Hook
```

```go
p.AddHook(json.ErrorHook(func(ctx json.HookContext, err error) error {
	sentry.CaptureException(err)
	return err // 원래 오류 또는 변환된 오류 반환
}))
```

전체 예제 (오류에 작업 컨텍스트 부착):

```go
package main

import (
	"fmt"
	"strings"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	p.AddHook(json.ErrorHook(func(ctx json.HookContext, err error) error {
		return fmt.Errorf("[audit] op=%s path=%s: %w", ctx.Operation, ctx.Path, err)
	}))

	_, err = p.Get(`{"name": "Alice"}`, "missing")
	fmt.Println("오류 발생:", err != nil)
	fmt.Println("컨텍스트 부착됨:", strings.HasPrefix(err.Error(), "[audit] op=get path=missing"))
	// 출력:
	// 오류 발생: true
	// 컨텍스트 부착됨: true
}
```

---

## 커스텀 Hook 구현

### 전체 예제

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"log/slog"
	"time"
)

// 로그 Hook
type LoggingHook struct {
	logger *slog.Logger
}

func (h *LoggingHook) Before(ctx json.HookContext) error {
	h.logger.Info("operation starting", "op", ctx.Operation, "path", ctx.Path)
	return nil
}

func (h *LoggingHook) After(ctx json.HookContext, result any, err error) (any, error) {
	h.logger.Info("operation completed",
		"op", ctx.Operation,
		"path", ctx.Path,
		"duration", time.Since(ctx.StartTime),
		"error", err)
	return result, err
}

func main() {
	cfg := json.DefaultConfig()
	p, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// 커스텀 Hook 추가
	p.AddHook(&LoggingHook{logger: slog.Default()})

	// 프로세서 사용...
	val, err := p.Get(`{"name": "test"}`, "name")
	if err != nil {
		panic(err)
	}
	fmt.Println(val)
}
```

### HookFunc 로 간소화

```go
// 완료 시간만 기록하면 되는 경우
p.AddHook(&json.HookFunc{
	AfterFn: func(ctx json.HookContext, result any, err error) (any, error) {
		fmt.Printf("%s took %v\n", ctx.Operation, time.Since(ctx.StartTime))
		return result, err
	},
})
```

---

## 훅 설정

### Config 로 추가

```go
cfg := json.DefaultConfig()
cfg.Hooks = []json.Hook{
	json.LoggingHook(slog.Default()),
	json.TimingHook(myRecorder),
}
p, err := json.New(cfg)
if err != nil {
	panic(err)
}
```

### Processor 로 추가

```go
p, err := json.New()
if err != nil {
	panic(err)
}
p.AddHook(json.LoggingHook(slog.Default()))
p.AddHook(json.TimingHook(myRecorder))
```

### 두 경로의 차이

| 관점 | `Config.Hooks` / `cfg.AddHook` | `Processor.AddHook` |
|------|--------------------------------|---------------------|
| 적용 시점 | `json.New(cfg)` **생성 시** 한 번에 장착 (방어적 복사 수행) | 실행 중 언제든 추가 |
| 생성 후 `Config` 변경 | 이미 생성된 Processor 에 영향 없음 | —— |
| 동시성 안전 | 생성 전 싱글스레드로 설정하면 충분 | 동시 호출은 뮤텍스로 보호 |
| 수명 | Processor 와 함께 | `Close()` 시 훅 참조가 비워져 해제 |

정적 장착 (시작 시점에 모든 훅을 알고 있음) 은 `Config` 를, 실행 중 필요에 따라 켜고 끄는 경우 (예: 그레이스케일 스위치) 는 `Processor.AddHook` 을 사용하세요.

---

## 실행 순서

### Before 훅

- **추가 순서대로** 실행
- 어떤 Hook 이든 오류를 반환하면 작업 중단

### After 훅

- **추가 역순으로** 실행
- 각 Hook 은 모두 실행됨 (앞서 오류가 반환되어도)

```go
// 추가 순서: A, B, C
p.AddHook(hookA)
p.AddHook(hookB)
p.AddHook(hookC)

// 실행 순서:
// Before: A.Before → B.Before → C.Before
// After:  C.After → B.After → A.After
```

### 결과 재작성과 예외 안전성

- `Get` 의 `After` 는 임의 타입의 새 결과를 반환할 수 있습니다; `Set`/`Delete` 의 결과는 JSON **문자열**이며, `After` 가 문자열이 아닌 값을 반환하면 수정되지 않은 것으로 간주되어 (원래 문자열 유지) 오류는 정상적으로 전파됩니다.
- 훅의 **panic 은 작업을 무너뜨리지 않습니다**: `Before` 단계의 panic 은 `hook panicked: ...` 오류로 변환되어 이번 작업을 중단하고; `After` 단계의 panic 은 구조화된 로그 (slog) 에 기록된 뒤 건너뛰어 작업 결과에 영향을 주지 않습니다.
- 훅을 등록하지 않은 Processor 는 락 없는 빠른 경로를 사용하므로, 훅 메커니즘이 추가 오버헤드를 만들지 않습니다.

---

## 모범 사례

### 1. 로그 기록

```go
p.AddHook(json.LoggingHook(slog.Default()))
```

### 2. 성능 모니터링

```go
type MetricsRecorder struct{}

func (m *MetricsRecorder) Record(op string, duration time.Duration) {
    metrics.Histogram("json_operation_duration", duration, "op", op)
}

p.AddHook(json.TimingHook(&MetricsRecorder{}))
```

### 3. 입력 검증

```go
p.AddHook(json.ValidationHook(func(jsonStr, path string) error {
	if len(jsonStr) > 10*1024*1024 { // 10MB
		return errors.New("JSON payload too large")
	}
	return nil
}))
```

### 4. 오류 추적

```go
p.AddHook(json.ErrorHook(func(ctx json.HookContext, err error) error {
	if err != nil {
		sentry.WithTags(map[string]string{
			"operation": ctx.Operation,
			"path":      ctx.Path,
		}).CaptureException(err)
	}
	return err
}))
```

### 5. 감사 로그 (전체 실전)

쓰기 작업 (`set`/`delete`) 만 대상으로 작업 타입, 경로, 결과를 기록하고 `JSONStr` 내용 자체는 기록하지 않습니다:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

// AuditHook 는 쓰기 작업의 감사 항목을 기록 (데모용 메모리 슬라이스, 프로덕션에서는 slog/데이터베이스로 교체)
type AuditHook struct {
	entries []string
}

func (h *AuditHook) Before(ctx json.HookContext) error {
	return nil // 감사는 관찰만 하고 차단하지 않음
}

func (h *AuditHook) After(ctx json.HookContext, result any, err error) (any, error) {
	switch ctx.Operation {
	case "set", "delete":
		h.entries = append(h.entries,
			fmt.Sprintf("op=%s path=%s ok=%v", ctx.Operation, ctx.Path, err == nil))
	}
	return result, err
}

func main() {
	audit := &AuditHook{}

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()
	p.AddHook(audit)

	data := `{"env": "prod", "password": "hunter2", "token": "t-1"}`

	data, err = p.Set(data, "password", nil)
	if err != nil {
		panic(err)
	}
	data, err = p.Delete(data, "token")
	if err != nil {
		panic(err)
	}

	for _, e := range audit.entries {
		fmt.Println(e)
	}
	// 출력:
	// op=set path=password ok=true
	// op=delete path=token ok=true
}
```

프로덕션 적용 제안: `entries` 를 `*slog.Logger` 로 바꾸거나 (`slog.Info("data modification", "op", ..., "path", ..., "success", ...)`) 감사 저장소에 비동기로 기록하세요; 소요 시간 정보가 필요하면 [`TimingHook`](#timinghook) 을 함께 사용하세요.

---

## 관련 문서

- [인터페이스 정의](../api-reference/interfaces) - 확장 인터페이스
- [Schema 검증](../api-reference/schema) - Schema 검증
- [Config](../api-reference/config) - 설정 옵션
