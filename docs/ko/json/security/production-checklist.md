---
sidebar_label: "프로덕션 체크리스트"
title: "프로덕션 체크리스트 - CyberGo JSON | 보안 배포"
description: "CyberGo JSON 프로덕션 배포 보안 체크리스트: SecurityConfig 설정, MaxNestingDepthSecurity/MaxJSONSize 자원 제한, 입력 검증, 오류 처리, 모니터링 알림과 성능·보안 균형에 기본값·권장 값 비교표로 안정적 운영을 보장합니다."
sidebar_position: 3
---

# 프로덕션 체크리스트

프로덕션 환경에 배포하기 전에 다음 보안 항목을 확인하세요.

## 설정 확인

### 리소스 제한

- [ ] `MaxNestingDepthSecurity` 설정으로 깊은 중첩 공격 방지
- [ ] `MaxJSONSize` 설정으로 단일 값 크기 제한
- [ ] `MaxMemory` 설정으로 전체 메모리 사용량 제한

```go
cfg := json.DefaultConfig()
cfg.MaxNestingDepthSecurity = 50
cfg.MaxJSONSize = 10 * 1024 * 1024
cfg.MaxMemory = 100 * 1024 * 1024
```

기본값과 권장 프로덕션 값 비교 (기본값은 라이브러리 내 상수이므로 직접 참조해 매직 넘버를 피할 수 있습니다):

| 제한 항목 | Config 필드 | 라이브러리 내 상수 | 기본값 | 권장 프로덕션 값 (`SecurityConfig()` 프리셋) |
|--------|-------------|----------|--------|----------------------------------------|
| JSON 크기 상한 | `MaxJSONSize` | `DefaultMaxJSONSize` | 100MB | 10MB |
| 중첩 깊이 상한 | `MaxNestingDepthSecurity` | `DefaultMaxNestingDepth` | 200 | 30 |
| 경로 깊이 상한 | `MaxPathDepth` | `DefaultMaxPathDepth` | 50 | 30 |
| 객체 키 수 상한 | `MaxObjectKeys` | `DefaultMaxObjectKeys` | 100000 | 5000 |
| 배열 요소 수 상한 | `MaxArrayElements` | `DefaultMaxArrayElements` | 100000 | 5000 |
| 보안 검증 임계값 | `MaxSecurityValidationSize` | `DefaultMaxSecuritySize` | 10MB | 10MB |
| 동시성 상한 | `MaxConcurrency` | `DefaultMaxConcurrency` | 50 | 50 |

```go
// 상수를 참조하고 하드코딩하지 않기
cfg := json.DefaultConfig()
cfg.MaxJSONSize = int64(json.DefaultMaxJSONSize) / 10 // 기본 100MB 를 기준으로 강화
```

`json.SecurityConfig()` 는 위 표의 '권장 프로덕션 값'으로 모든 필드가 미리 설정되어 있고, 추가로 `FullSecurityScan` 과 `StrictMode` 도 켜져 있습니다 — 신뢰할 수 없는 입력을 다룰 때는 이 설정에서 출발해 세부 조정하세요.

## 입력 검증

### 필수 필드

- [ ] 모든 필수 필드가 존재하는지 확인
- [ ] 필드 타입이 올바른지 확인

```go
// 커스텀 검증기 예제
type RequiredFieldValidator struct{}

func (v *RequiredFieldValidator) Validate(jsonStr string) error {
    // 필수 필드 존재 여부 확인
    return nil
}

cfg := json.DefaultConfig()
cfg.CustomValidators = []json.Validator{&RequiredFieldValidator{}}
```

### 형식 검증

- [ ] 이메일 형식 검증
- [ ] URL 형식 검증
- [ ] 커스텀 형식 검증

```go
// 커스텀 형식 검증기
type EmailValidator struct{}

func (v *EmailValidator) Validate(jsonStr string) error {
    var data map[string]any
    if err := json.Unmarshal([]byte(jsonStr), &data); err != nil {
        return nil
    }
    email, _ := data["email"].(string)
    matched, _ := regexp.MatchString(`^\w+@\w+\.\w+$`, email)
    if !matched {
        return errors.New("invalid email format")
    }
    return nil
}

cfg := json.DefaultConfig()
cfg.CustomValidators = append(cfg.CustomValidators, &EmailValidator{})
```

### 범위 검증

- [ ] 숫자 범위 검증
- [ ] 문자열 길이 검증
- [ ] 배열 길이 검증

```go
// Schema 를 사용한 범위 검증
schema := &json.Schema{
	Type: "object",
	Properties: map[string]*json.Schema{
		"age":  {Type: "number", Minimum: 0, Maximum: 100},
		"name": {Type: "string", MinLength: 1, MaxLength: 255},
	},
}
```

## 민감 데이터 처리

### 민감 필드 필터링

- [ ] 비밀번호 필터링
- [ ] 토큰 필터링
- [ ] 기타 민감 데이터 필터링

```go
// Hook 으로 민감 필드 필터링
type SensitiveFilterHook struct {
    fields map[string]bool
}

func (h *SensitiveFilterHook) Before(ctx json.HookContext) error {
    return nil
}

func (h *SensitiveFilterHook) After(ctx json.HookContext, result any, err error) (any, error) {
    if m, ok := result.(map[string]any); ok {
        for field := range h.fields {
            delete(m, field)
        }
    }
    return result, err
}

cfg := json.DefaultConfig()
cfg.AddHook(&SensitiveFilterHook{fields: map[string]bool{
    "password": true,
    "token":    true,
    "api_key":  true,
    "secret":   true,
}})
```

전체 실행 코드 (`Get` 가 반환되기 전에 민감 필드를 자동 제거):

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

// SensitiveFilterHook 는 get 결과가 호출자에게 반환되기 전에 민감 필드를 삭제합니다.
type SensitiveFilterHook struct {
	fields map[string]bool
}

func (h *SensitiveFilterHook) Before(ctx json.HookContext) error {
	return nil
}

func (h *SensitiveFilterHook) After(ctx json.HookContext, result any, err error) (any, error) {
	if err != nil {
		return result, err
	}
	if obj, ok := result.(map[string]any); ok {
		for field := range h.fields {
			delete(obj, field)
		}
	}
	return result, err
}

func main() {
	cfg := json.DefaultConfig()
	cfg.AddHook(&SensitiveFilterHook{fields: map[string]bool{
		"password": true,
		"token":    true,
		"api_key":  true,
		"secret":   true,
	}})

	p, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer p.Close()

	user, err := p.Get(`{"name": "Alice", "role": "admin", "password": "hunter2", "token": "t-123"}`, ".")
	if err != nil {
		panic(err)
	}

	out, err := p.Marshal(user)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(out))
	// 출력: {"name":"Alice","role":"admin"}
}
```

### 로그 마스킹

- [ ] 로그에 민감 데이터를 기록하지 않음
- [ ] 오류 메시지에 민감 정보를 포함하지 않음

## 오류 처리

### 안전한 오류 응답

- [ ] 내부 오류 세부 정보 노출 금지
- [ ] 일반적인 오류 메시지 사용
- [ ] 상세 오류를 로그에 기록

```go
if err != nil {
	slog.Error("상세 오류", "error", err)           // 상세 원인은 로그에만 기록
	return errors.New("작업 실패, 잠시 후 다시 시도해 주세요") // 외부에는 일반 메시지만 반환
}
```

## 모니터링 및 감사

### 성능 모니터링

- [ ] 파싱 시간 모니터링
- [ ] 메모리 사용량 모니터링
- [ ] 알림 임계값 설정

```go
// Hook 으로 성능 모니터링
type MetricsHook struct{}

func (h *MetricsHook) Before(ctx json.HookContext) error {
    return nil
}

func (h *MetricsHook) After(ctx json.HookContext, result any, err error) (any, error) {
    slog.Info("operation", "op", ctx.Operation, "duration", time.Since(ctx.StartTime))
    return result, err
}

cfg := json.DefaultConfig()
cfg.AddHook(&MetricsHook{})
```

타이밍 계측에는 팩토리 훅이 더 편합니다: `cfg.AddHook(json.TimingHook(myRecorder))` (`myRecorder` 는 `Record(op string, duration time.Duration)` 구현).

### 감사 로그

- [ ] 핵심 작업 기록
- [ ] 비정상 입력 기록
- [ ] 정기 로그 검토

전체 실행 코드 (쓰기 작업 감사 + 작업 타이밍, 모두 팩토리 훅과 `HookFunc` 사용, 원본 `JSONStr` 은 기록하지 않음):

```go
package main

import (
	"fmt"
	"sync"
	"time"

	"github.com/cybergodev/json"
)

// opMetrics 는 TimingHook 이 요구하는 Record 인터페이스를 구현
type opMetrics struct {
	mu    sync.Mutex
	count map[string]int
}

func (m *opMetrics) Record(op string, duration time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.count[op]++
}

func main() {
	metrics := &opMetrics{count: make(map[string]int)}
	var auditLog []string

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// 감사: 쓰기 작업의 작업 타입/경로/결과만 기록, JSONStr 내용은 기록하지 않음
	p.AddHook(&json.HookFunc{
		AfterFn: func(ctx json.HookContext, result any, err error) (any, error) {
			if ctx.Operation == "set" || ctx.Operation == "delete" {
				auditLog = append(auditLog,
					fmt.Sprintf("op=%s path=%s ok=%v", ctx.Operation, ctx.Path, err == nil))
			}
			return result, err
		},
	})
	// 성능: 작업 타입별 카운트 (프로덕션에서는 히스토그램/시계열 라이브러리로 교체)
	p.AddHook(json.TimingHook(metrics))

	data := `{"env": "prod", "password": "hunter2"}`

	if data, err = p.Set(data, "password", nil); err != nil {
		panic(err)
	}
	if data, err = p.Delete(data, "password"); err != nil {
		panic(err)
	}
	if _, err = p.Get(data, "env"); err != nil {
		panic(err)
	}

	for _, e := range auditLog {
		fmt.Println(e)
	}
	fmt.Println("get 타이밍 기록:", metrics.count["get"])
	// 출력:
	// op=set path=password ok=true
	// op=delete path=password ok=true
	// get 타이밍 기록: 1
}
```

## 테스트 커버리지

### 보안 테스트

- [ ] 깊은 중첩 테스트
- [ ] 대용량 파일 처리 테스트
- [ ] 잘못된 입력 테스트
- [ ] 경계 조건 테스트

### 성능 테스트

- [ ] 동시성 처리 테스트
- [ ] 대용량 데이터 테스트
- [ ] 메모리 누수 테스트

## 빠른 확인 명령

```bash
# 민감 필드 확인
grep -r "password\|token\|secret" --include="*.go"

# 하드코딩된 설정 확인
grep -r "MaxNestingDepthSecurity\|MaxMemory" --include="*.go"

# 보안 테스트 실행
go test -run Security ./...
```

## 체크리스트 템플릿

```go
// 프로덕션 설정 템플릿
func ProductionConfig() json.Config {
	cfg := json.SecurityConfig()

	// 리소스 제한 (SecurityConfig 에 보안 기본값이 미리 설정됨)
	cfg.MaxMemory = 100 * 1024 * 1024

	// 커스텀 검증기
	cfg.CustomValidators = []json.Validator{&RequiredFieldValidator{}}

	// 감사 Hook
	cfg.Hooks = []json.Hook{&AuditHook{logger: prodLogger}}

	return cfg
}
```

## 관련 문서

- [보안 개요](./)
- [Config 설정](../api-reference/config)
