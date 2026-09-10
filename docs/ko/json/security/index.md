---
sidebar_label: "보안 개요"
title: "보안 개요 - CyberGo JSON | 보안 모범 사례"
description: "CyberGo JSON 보안 모범 사례: 입력 검증, MaxNestingDepthSecurity/MaxMemory 자원 제한으로 깊은 중첩·초대형 입력 방어, 경로 순회·JSON 인젝션 방어, 민감 데이터 필터링, SecurityConfig 프리셋으로 비신뢰 입력 제한을 한 번에 강화."
sidebar_position: 1
---

# 보안 개요

JSON 데이터 처리 시 보안 고려 사항과 모범 사례입니다.

## 일반적인 보안 위험

### 1. 리소스 고갈 공격

악의적으로 구성된 JSON 은 메모리 고갈이나 CPU 과부하를 유발할 수 있습니다: 과도하게 깊은 중첩 (스택 오버플로), 과도하게 큰 단일 값 (메모리), 아주 넓은 평면 객체/배열 (수백만 개의 키).

**최소 재현** (라이브러리 기본값만으로 깊은 중첩과 과도하게 큰 입력을 차단):

```go
package main

import (
	"fmt"
	"strings"

	"github.com/cybergodev/json"
)

func main() {
	// 5000 층 깊이 중첩, 기본 상한 200 (DefaultMaxNestingDepth) 초과
	deep := strings.Repeat(`{"a":`, 5000) + `1` + strings.Repeat(`}`, 5000)

	p, err := json.New(json.SecurityConfig()) // 중첩 상한이 30 으로 강화됨
	if err != nil {
		panic(err)
	}
	defer p.Close()

	_, err = p.Get(deep, "a")
	fmt.Println("깊은 중첩 차단됨:", err != nil)
	// 출력: 깊은 중첩 차단됨: true
}
```

**방어 조치:**

```go
cfg := json.DefaultConfig()
cfg.MaxNestingDepthSecurity = 50                  // 중첩 깊이 제한
cfg.MaxJSONSize = 10 * 1024 * 1024                // JSON 크기 제한 (10MB)
cfg.MaxObjectKeys = 5000                          // 객체당 키 수 제한 (기본 100000)
cfg.MaxArrayElements = 5000                       // 배열당 요소 수 제한 (기본 100000)
cfg.MaxSecurityValidationSize = 100 * 1024 * 1024 // 보안 검증 제한을 100MB 로 증가 (기본값 10MB)
```

또는 프리셋 [`json.SecurityConfig()`](./production-checklist#체크리스트-템플릿) 을 직접 사용하세요 — 신뢰할 수 없는 입력에 맞춰 모든 제한이 이미 강화되어 있습니다.

### 2. 경로 순회 공격

악의적인 경로가 의도하지 않은 데이터에 접근할 수 있습니다. 두 종류의 경로 모두 내장 방어가 있습니다: **파일 경로** (`LoadFromFile`/`SaveToFile` 등) 는 읽기/쓰기 시 **무조건** 경로 순회, 심볼릭 링크, 플랫폼 제한, 시스템 디렉터리 검사를 수행합니다; **JSON 경로** (`Get`/`Set` 등) 는 `..`, URL 인코딩 우회, 폭 없는 문자 등의 인젝션 패턴을 거부합니다.

**최소 재현** (두 종류의 경로 모두 기본값으로 차단):

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// 파일 경로: NFC 정규화 + 재귀 URL 디코딩을 먼저 수행한 뒤 순회 패턴 검사
	_, err = p.LoadFromFile("../../../etc/passwd")
	fmt.Println("파일 경로 순회 차단됨:", err != nil)

	// JSON 경로: "..", URL 인코딩, 폭 없는 문자 인젝션 거부
	_, err = p.Get(`{"data": 1}`, "../../etc/passwd")
	fmt.Println("JSON 경로 순회 차단됨:", err != nil)
	// 출력:
	// 파일 경로 순회 차단됨: true
	// JSON 경로 순회 차단됨: true
}
```

**방어 조치:**

```go
// 사용자 입력 경로 검증
func safePath(path string) bool {
	// 특수 문자 금지
	if strings.ContainsAny(path, `<>:"|\`) {
		return false
	}
	return true
}
```

애플리케이션 계층에서도 경로 화이트리스트를 유지하는 것을 권장합니다; 라이브러리 내장 검증은 인코딩 혼동 등의 우회 수단 차단을 담당합니다.

### 3. JSON 인젝션

악의적인 데이터가 JSON 구조를 파괴하거나, `<script>`, `__proto__` 같은 페이로드를 하위 시스템에 실어 나를 수 있습니다. 라이브러리는 기본적으로 모든 입력에 대해 위험 패턴 스캔을 수행합니다 (대소문자 무시 + 단어 경계 컨텍스트 검사), 적중 시 거부합니다.

**최소 재현** (기본값으로 차단, 설정 불필요):

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	payloads := []string{
		`{"name": "Alice", "bio": "<script>alert(1)</script>"}`, // XSS
		`{"__proto__": {"isAdmin": true}}`,                      // 프로토타입 오염
	}
	for i, in := range payloads {
		_, err := p.Get(in, ".")
		fmt.Printf("페이로드 %d 차단됨: %v\n", i+1, err != nil)
	}
	// 출력:
	// 페이로드 1 차단됨: true
	// 페이로드 2 차단됨: true
}
```

전체 내장 패턴 목록은 [보안 모드](./security-mode#내장-위험-패턴)를 참조하세요.

**방어 조치:**

```go
// 항상 라이브러리 함수로 직렬화, 문자열 결합 금지
data := map[string]any{
	"user": userInput, // 라이브러리가 자동으로 이스케이프
}
bytes, _ := json.Marshal(data)
```

### 4. 민감 데이터 유출

로그나 오류 정보가 민감 데이터를 노출할 수 있습니다. 라이브러리는 두 계층의 방어선을 내장합니다: **결과에 민감 패턴 (`password`, `token`, `api_key`, `ssn`, `aws_secret` 등) 이 포함되면 작업 캐시에 기록하지 않아**, 민감 데이터가 캐시에 오래 남지 않게 합니다; `HookContext.JSONStr` 의 문서 주석에도 원본 입력을 기록하지 말라고 명시적으로 경고합니다.

**방어 조치** (Hook 으로 반환 전에 민감 필드 삭제):

```go
// 커스텀 Hook 으로 민감 필드 필터링
type FilterFieldsHook struct {
    fields map[string]bool
}

func (h *FilterFieldsHook) Before(ctx json.HookContext) error {
    return nil
}

func (h *FilterFieldsHook) After(ctx json.HookContext, result any, err error) (any, error) {
    if m, ok := result.(map[string]any); ok {
        for field := range h.fields {
            delete(m, field)
        }
    }
    return result, err
}

cfg := json.DefaultConfig()
cfg.AddHook(&FilterFieldsHook{fields: map[string]bool{
    "password": true,
    "token":    true,
    "secret":   true,
}})
```

실행 가능한 전체 코드는 [프로덕션 체크리스트·민감 데이터 처리](./production-checklist#민감-데이터-처리)를 참조하세요.

## 보안 설정 권장 사항

### 보안 관련 Config 필드 총정리

이 제한들은 라이브러리 내부에서 익스포트 타입 `SecurityLimits` 로 묶여 있습니다 (공개 접근자는 없으며, 필드 구조 설명용):

```go
type SecurityLimits struct {
	MaxNestingDepth           int   `json:"max_nesting_depth"`
	MaxSecurityValidationSize int64 `json:"max_security_validation_size"`
	MaxObjectKeys             int   `json:"max_object_keys"`
	MaxArrayElements          int   `json:"max_array_elements"`
	MaxJSONSize               int64 `json:"max_json_size"`
	MaxPathDepth              int   `json:"max_path_depth"`
}
```

각 필드의 두 가지 일반 설정에서의 값:

| Config 필드 | `DefaultConfig()` 기본 | `SecurityConfig()` 프리셋 | 트리거되는 오류 |
|------------|------------------------|--------------------------|------------|
| `MaxJSONSize` | 100MB (`DefaultMaxJSONSize`) | 10MB | `ErrSizeLimit` |
| `MaxNestingDepthSecurity` | 200 (`DefaultMaxNestingDepth`) | 30 | `ErrDepthLimit` |
| `MaxPathDepth` | 50 (`DefaultMaxPathDepth`) | 30 | `ErrInvalidPath` |
| `MaxObjectKeys` | 100000 (`DefaultMaxObjectKeys`) | 5000 | `ErrSizeLimit` |
| `MaxArrayElements` | 100000 (`DefaultMaxArrayElements`) | 5000 | `ErrSizeLimit` |
| `MaxSecurityValidationSize` | 10MB (`DefaultMaxSecuritySize`) | 10MB | —— (임계값형) |
| `FullSecurityScan` | `false` (계층적 최적화 스캔) | `true` (전체 스캔) | —— |

`Config.Validate` 는 범위를 벗어난 값을 합법 구간으로 되돌립니다 (예: `MaxNestingDepthSecurity` 는 10–200, `MaxObjectKeys` 는 100–100000 으로 클램프), `ValidateWithWarnings` 로 조정 내역을 확인할 수 있습니다.

### 위험 패턴 관리

라이브러리는 기본 위험 패턴 감지가 내장되어 있으며, 커스텀 패턴의 등록, 해제 및 조회도 지원합니다.

커스텀 패턴은 `DangerousPattern` 구조체로 통일되게 표현합니다:

```go
type DangerousPattern struct {
	Pattern string       // 입력에서 검출할 부분 문자열
	Name    string       // 패턴의 설명형 이름
	Level   PatternLevel // 심각도 수준
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `Pattern` | `string` | 입력에서 검출할 부분 문자열 (대소문자 무시 매칭) |
| `Name` | `string` | 사람이 읽을 수 있는 위험 설명 (로그와 감사에 사용) |
| `Level` | `PatternLevel` | 심각도 수준, 값은 아래 수준표 참조 (현재는 의미 표기용) |

#### RegisterDangerousPattern

시그니처: `func RegisterDangerousPattern(pattern DangerousPattern)`

전역 위험 패턴을 등록합니다. 전역 레지스트리의 패턴은 **모든 Processor 인스턴스**에 적용됩니다 (이미 생성된 인스턴스 포함 — 스캔 시 실시간으로 레지스트리를 읽음), 기본 패턴에 더해 검사가 중첩됩니다.

```go
json.RegisterDangerousPattern(json.DangerousPattern{
	Pattern: "eval(",
	Name:    "eval-call",
	Level:   json.PatternLevelCritical,
})
```

#### UnregisterDangerousPattern

시그니처: `func UnregisterDangerousPattern(pattern string)`

패턴 문자열로 전역 위험 패턴을 해제합니다. 매개변수 `pattern`은 해제할 위험 패턴의 부분 문자열입니다 (`DangerousPattern.Pattern` 필드에 해당).

```go
json.UnregisterDangerousPattern("eval(")
```

#### ListDangerousPatterns

시그니처: `func ListDangerousPatterns() []DangerousPattern`

**전역에 등록된 커스텀 패턴**을 나열합니다 (내장 기본 패턴 제외 — 내장 패턴은 항상 적용되며 등록이 필요 없음).

```go
patterns := json.ListDangerousPatterns()
for _, p := range patterns {
	fmt.Printf("패턴: %s, 이름: %s, 수준: %s\n", p.Pattern, p.Name, p.Level)
}
```

#### 위험 패턴 수준

| 상수 | 타입 | 값 | 설명 |
|------|------|-----|------|
| `PatternLevelCritical` | `PatternLevel` | `0` | 심각 수준, 의미상 항상 차단 |
| `PatternLevelWarning` | `PatternLevel` | `1` | 경고 수준, 의미상 엄격 모드에서 차단 |
| `PatternLevelInfo` | `PatternLevel` | `2` | 정보 수준, 의미상 기록만 |

::: warning 수준의 실제 차단 동작
현재 구현의 패턴 스캔은 (단어 경계 컨텍스트 검사를 통과한) **모든 적중**에 대해 작업을 거부하며, `Level` 필드는 아직 차단 동작을 바꾸지 않고 의미 표기로만 사용됩니다 (감사와 로그에서 심각도를 구분하는 용도). 자세한 내용은 [보안 모드·PatternLevel 동작 매트릭스](./security-mode#patternlevel-동작-매트릭스)를 참조하세요.
:::

::: tip
`PatternLevel`의 `String()` 메서드는 해당 문자열 표현 (`"critical"`, `"warning"`, `"info"`) 을 반환하여 로그 출력에 편리합니다.
:::

#### 기본 패턴 비활성화

`Config.DisableDefaultPatterns`로 내장된 기본 패턴을 비활성화할 수 있습니다:

```go
cfg := json.DefaultConfig()
cfg.DisableDefaultPatterns = true // 내장 기본 패턴 비활성화
```

:::warning 주의
`DisableDefaultPatterns=true`이면, 항상 강제 스캔하는 3 개의 핵심 패턴 (`__proto__`, `constructor[`, `prototype.`) 을 제외하고 나머지 내장 패턴이 모두 비활성화됩니다. 참고: 내장 패턴은 모두 Critical 수준입니다.
:::

### 프로덕션 환경 설정

```go
func ProductionConfig() json.Config {
	cfg := json.SecurityConfig()
	cfg.AddHook(&AuditHook{logger: prodLogger})
	return cfg
}
```

### 개발 환경 설정

```go
func DevelopmentConfig() json.Config {
	cfg := json.DefaultConfig()
	cfg.MaxNestingDepthSecurity = 100
	cfg.AddHook(json.LoggingHook(devLogger))
	return cfg
}
```

## 입력 검증

### 커스텀 검증기

`Validator` 인터페이스 (`Validate(jsonStr string) error`) 를 구현하여 입력 검증을 수행합니다:

```go
// 커스텀 검증기 구현
type EmailValidator struct{}

func (v *EmailValidator) Validate(jsonStr string) error {
    // JSON 문자열 내용 검증
    var data map[string]any
    if err := json.Unmarshal([]byte(jsonStr), &data); err != nil {
        return err
    }
    email, ok := data["email"].(string)
    if !ok {
        return nil
    }
    if !strings.Contains(email, "@") {
        return errors.New("invalid email format")
    }
    return nil
}

// 커스텀 검증기 사용
cfg := json.DefaultConfig()
cfg.CustomValidators = []json.Validator{&EmailValidator{}}
```

### Schema 검증

Schema 는 구조체 타입으로, JSON 구조를 검증하는 데 사용할 수 있습니다:

```go
schema := &json.Schema{
	Type:     "object",
	Required: []string{"id", "name", "email"},
	Properties: map[string]*json.Schema{
		"id":    {Type: "string", Pattern: `^[a-zA-Z0-9]+$`},
		"name":  {Type: "string", MinLength: 1},
		"email": {Type: "string", Format: "email"},
		"age":   {Type: "number", Minimum: 0, Maximum: 150},
	},
}
```

## 오류 처리

### 안전한 오류 메시지

```go
val, err := json.Get(data, path)
if err != nil {
	// 내부 오류 세부 정보를 노출하지 않음
	return errors.New("데이터 형식이 올바르지 않습니다")
}
```

## 감사 로그

### 핵심 작업 기록

`Hook` 인터페이스 (`Before`는 `error` 반환, `After`는 `(HookContext, any, error)`를 받아 `(any, error)` 반환) 를 사용하여 감사 로그를 기록합니다:

```go
type AuditHook struct {
	logger *slog.Logger
}

func (h *AuditHook) Before(ctx json.HookContext) error {
	h.logger.Info("JSON 작업 시작", "op", ctx.Operation, "path", ctx.Path)
	return nil
}

func (h *AuditHook) After(ctx json.HookContext, result any, err error) (any, error) {
	h.logger.Info("JSON 작업 완료", "op", ctx.Operation)
	return result, err
}
```

## 관련 문서

- [프로덕션 체크리스트](./production-checklist)
- [Config 설정](../api-reference/config)
- [Schema 검증](../api-reference/schema)
