---
sidebar_label: "보안 모드"
title: "보안 모드 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON 보안 API: 보안 설정, AddDangerousPattern 커스텀 위험 패턴 등록, PatternLevel 3 단계 심각도와 내장 위험 패턴, 입력 검증으로 JSON 인젝션·프로토타입 오염·XSS 를 방어하며 적중 시 거부, 대소문자 무시 매칭."
sidebar_position: 2
---

# 보안 모드

보안 모드는 위험 패턴 감지 기능을 제공하여 JSON 인젝션 공격, 프로토타입 오염 및 기타 보안 위협을 방지합니다.

## DangerousPattern 구조체

DangerousPattern 은 보안 위험 패턴을 나타냅니다. 구조체 타입입니다.

```go
type DangerousPattern struct {
	Pattern string       // 입력에서 감지할 부분 문자열
	Name    string       // 패턴의 설명 이름
	Level   PatternLevel // 해당 패턴의 심각도 수준을 결정
}
```

### 필드 설명

| 필드 | 타입 | 설명 |
|------|------|------|
| `Pattern` | `string` | 입력에서 감지할 부분 문자열 |
| `Name` | `string` | 패턴의 설명 이름 |
| `Level` | `PatternLevel` | 해당 패턴의 심각도 수준을 결정 |

---

## PatternLevel 타입

PatternLevel 은 위험 패턴의 심각도 수준을 나타냅니다.

```go
type PatternLevel int
```

### 상수

```go
const (
	// PatternLevelCritical 은 항상 작업을 차단합니다
	// 즉각적인 보안 위험을 구성하는 패턴에 사용 (예: 프로토타입 오염)
	PatternLevelCritical PatternLevel = iota

	// PatternLevelWarning 은 엄격 모드에서 차단, 완화 모드에서 경고 기록
	// 악의적인 의도를 나타낼 수 있지만 정당한 용도가 있는 패턴에 사용
	PatternLevelWarning

	// PatternLevelInfo 는 기록만 하고 차단하지 않음
	// 감사/추적 목적으로 사용하며 작업을 중단하지 않음
	PatternLevelInfo
)
```

### String 메서드

```go
func (pl PatternLevel) String() string
```

PatternLevel 의 문자열 표현을 반환합니다 (`"critical"`, `"warning"`, `"info"`, 알 수 없는 값은 `"unknown"` 반환).

### PatternLevel 동작 매트릭스

| 수준 | 의미적 의도 (인터페이스 문서) | 현재 구현의 실제 동작 |
|------|----------------------|--------------------|
| `PatternLevelCritical` | 항상 작업 차단 | 적중 시 거부 (`ErrSecurityViolation`) |
| `PatternLevelWarning` | 엄격 모드에서 차단, 완화 모드에서 경고 기록 | **마찬가지로 적중 시 거부** — `StrictMode` 필드는 현재 패턴 차단 결정에 관여하지 않음 |
| `PatternLevelInfo` | 기록만 하고 차단하지 않음 | **마찬가지로 적중 시 거부** |

::: warning Warning/Info 패턴은 '차단된다'고 가정하고 계획하세요
현재 버전의 패턴 스캔 (내장 패턴, `Config.AdditionalDangerousPatterns`, 전역 등록 패턴 세 가지가 같은 스캔 경로를 사용) 은 단어 경계 컨텍스트 검사를 통과한 모든 적중에 대해 작업을 거부하며, `Level` 은 차단 결과를 바꾸지 않고 감사/로그에서 심각도를 구분하는 의미 표기로만 사용됩니다. 따라서 '기록만 하고 차단하지 않으려는' `PatternLevelInfo` 수준의 패턴을 등록하고 해당 패턴을 포함한 입력을 통과시키지 **마세요** — 지금은 차단됩니다. 모든 매칭은 대소문자를 구분하지 않습니다.
:::

---

## 내장 위험 패턴

### 기본 패턴

:::warning 내부 API
내장 패턴 목록은 내부 함수로 관리되며, 공개 API 로 내보내지 않습니다. Config 의 `AdditionalDangerousPatterns` 필드를 통해 커스텀 패턴을 관리할 수 있습니다.
:::

다음은 내장 위험 패턴 목록으로, 모두 Critical 수준입니다:

| 패턴 | 이름 | 카테고리 |
|------|------|------|
| `__proto__` | prototype pollution | 프로토타입 오염 |
| `constructor[` | constructor access | 생성자 접근 |
| `prototype.` | prototype manipulation | 프로토타입 조작 |
| `<script` | script tag injection | HTML 인젝션 |
| `<iframe` | iframe injection | HTML 인젝션 |
| `<object` | object injection | HTML 인젝션 |
| `<embed` | embed injection | HTML 인젝션 |
| `<svg` | svg injection | HTML 인젝션 |
| `javascript:` | javascript protocol | 프로토콜 인젝션 |
| `vbscript:` | vbscript protocol | 프로토콜 인젝션 |
| `eval(` | dynamic code execution | 코드 실행 |
| `setTimeout(` | timer manipulation | 코드 실행 |
| `setInterval(` | interval manipulation | 코드 실행 |
| `require(` | code injection | 코드 실행 |
| `new function(` | dynamic function creation | 코드 실행 |
| `document.cookie` | cookie access | DOM 접근 |
| `window.location` | redirect manipulation | DOM 접근 |
| `innerhtml` | DOM manipulation | DOM 접근 |
| `onerror`, `onload`, `onclick`, `onmouseover`, `onfocus` | event handler injection | 이벤트 핸들러 |
| `fromcharcode(` | character encoding bypass | 인코딩 우회 |
| `atob(` | base64 decoding | 인코딩 우회 |
| `expression(` | CSS expression injection | CSS 인젝션 |
| `__defineGetter__` | getter definition | 프로토타입 오염 |
| `__defineSetter__` | setter definition | 프로토타입 오염 |

### 핵심 패턴

:::warning 내부 API
GetCriticalPatterns 는 내부 함수로 전환되어 공개 API 로 내보내지지 않습니다. 핵심 패턴 (`__proto__`, `constructor[`, `prototype.`) 은 항상 강제 검사되며 비활성화할 수 없습니다.
:::

다음 핵심 패턴은 JSON 크기에 관계없이 항상 전체 스캔합니다:

| 패턴 | 설명 |
|------|------|
| `__proto__` | prototype pollution |
| `constructor[` | constructor access |
| `prototype.` | prototype manipulation |

---

## 패턴 등록 메서드

위험 패턴은 전역 등록 함수가 아닌 `Config` 구조체를 통해 설정합니다.

### Config.AddDangerousPattern

시그니처: `func (c *Config) AddDangerousPattern(pattern DangerousPattern)`

설정에 커스텀 위험 패턴을 추가합니다.

```go
cfg := json.DefaultConfig()
cfg.AddDangerousPattern(json.DangerousPattern{
	Pattern: "malicious_keyword",
	Name:    "커스텀 위험 패턴",
	Level:   json.PatternLevelCritical,
})

processor, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer processor.Close()
```

### Config.AdditionalDangerousPatterns

`Config.AdditionalDangerousPatterns` 필드를 직접 설정할 수도 있습니다:

```go
cfg := json.DefaultConfig()
cfg.AdditionalDangerousPatterns = []json.DangerousPattern{
	{Pattern: "eval(", Name: "eval-call", Level: json.PatternLevelCritical},
	{Pattern: "exec(", Name: "exec-call", Level: json.PatternLevelWarning},
}
```

---

## Config 설정 메서드

### AddDangerousPattern

설정에 보안 패턴을 추가합니다.

```go
func (c *Config) AddDangerousPattern(pattern DangerousPattern)
```

```go
cfg := json.DefaultConfig()
cfg.AddDangerousPattern(json.DangerousPattern{
	Pattern: "custom_dangerous_string",
	Name:    "커스텀 위험 문자열",
	Level:   json.PatternLevelWarning,
})
```

### 설정 필드

```go
type Config struct {
	// ... 다른 필드 ...

	// AdditionalDangerousPatterns 는 기본 패턴 외에 추가할 보안 패턴
	AdditionalDangerousPatterns []DangerousPattern

	// DisableDefaultPatterns 는 내장 기본 보안 패턴을 비활성화 (핵심 패턴 제외)
	// true 로 설정하면 AdditionalDangerousPatterns 만 사용
	// 참고: 핵심 패턴 (__proto__, constructor[, prototype.) 은 항상 강제 실행되며 비활성화할 수 없음
	DisableDefaultPatterns bool
}
```

---

## 전역 패턴 등록

`Config`를 통해 인스턴스 수준 패턴을 설정하는 것 외에도, 패키지 레벨 함수를 통해 전역 패턴 등록을 관리할 수 있습니다. 전역 등록의 패턴은 모든 Processor 인스턴스에 적용됩니다.

### RegisterDangerousPattern

시그니처: `func RegisterDangerousPattern(pattern DangerousPattern)`

전역 등록에 커스텀 위험 패턴을 추가합니다. 등록된 패턴은 모든 Processor 인스턴스에 적용됩니다.

```go
json.RegisterDangerousPattern(json.DangerousPattern{
	Pattern: "malicious_keyword",
	Name:    "커스텀 위험 패턴",
	Level:   json.PatternLevelCritical,
})
```

### UnregisterDangerousPattern

시그니처: `func UnregisterDangerousPattern(pattern string)`

전역 등록에서 지정된 패턴을 제거합니다.

```go
json.UnregisterDangerousPattern("malicious_keyword")
```

### ListDangerousPatterns

시그니처: `func ListDangerousPatterns() []DangerousPattern`

전역 등록의 모든 커스텀 패턴을 반환합니다.

```go
patterns := json.ListDangerousPatterns()
for _, p := range patterns {
	fmt.Printf("패턴: %s, 이름: %s, 수준: %s\n", p.Pattern, p.Name, p.Level)
}
```

### 전역 등록 vs Config 추가

| 관점 | 전역 등록 (`RegisterDangerousPattern`) | Config 추가 (`AddDangerousPattern` / `AdditionalDangerousPatterns`) |
|------|----------------------------------------|---------------------------------------------------------------------|
| 적용 범위 | 프로세스 내 **모든** Processor, 이미 생성된 인스턴스 포함 (스캔 시 실시간으로 레지스트리 읽음) | 해당 Config 로 생성된 Processor 만 (생성 시 보안 검증기에 고정) |
| 제거 방법 | `UnregisterDangerousPattern(pattern)` 즉시 적용 | 실행 중 제거 불가, 새 Config 로 Processor 재생성 필요 |
| 조회 방법 | `ListDangerousPatterns()` | `cfg.AdditionalDangerousPatterns` 필드 읽기 |
| `DisableDefaultPatterns` 와의 관계 | 영향 없음 (명시적으로 추가한 패턴은 항상 스캔) | 영향 없음 (왼쪽과 동일) |
| 전형적인 용도 | 애플리케이션 수준 보안 정책, 컴플라이언스 블랙리스트, `main` 시작 시 등록 | 단일 인스턴스의 비즈니스 커스텀 (예: 특정 테넌트의 Processor 만 특정 키워드 차단) |

전체 비교 예제:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	// 전역 등록: 모든 Processor 에 적용 (이미 생성된 인스턴스 포함)
	json.RegisterDangerousPattern(json.DangerousPattern{
		Pattern: "internal_only",
		Name:    "내부 식별자",
		Level:   json.PatternLevelCritical,
	})
	defer json.UnregisterDangerousPattern("internal_only")

	// Config 추가: 해당 Config 를 사용하는 Processor 에만 영향
	cfg := json.DefaultConfig()
	cfg.AddDangerousPattern(json.DangerousPattern{
		Pattern: "project_secret",
		Name:    "프로젝트 기밀",
		Level:   json.PatternLevelCritical,
	})

	withCfg, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer withCfg.Close()

	withoutCfg, err := json.New(json.DefaultConfig())
	if err != nil {
		panic(err)
	}
	defer withoutCfg.Close()

	_, err1 := withCfg.Get(`{"v": "project_secret"}`, "v")
	_, err2 := withoutCfg.Get(`{"v": "project_secret"}`, "v")
	_, err3 := withoutCfg.Get(`{"v": "internal_only"}`, "v")

	fmt.Println("로컬 패턴이 설정 기반 프로세서 차단:", err1 != nil)
	fmt.Println("로컬 패턴이 일반 프로세서 차단:", err2 != nil)
	fmt.Println("전역 패턴이 일반 프로세서 차단:", err3 != nil)
	// 출력:
	// 로컬 패턴이 설정 기반 프로세서 차단: true
	// 로컬 패턴이 일반 프로세서 차단: false
	// 전역 패턴이 일반 프로세서 차단: true
}
```

---

## 전체 예제

### 커스텀 보안 정책

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// 방법 1: 설정 필드를 통해
	cfg := json.DefaultConfig()
	cfg.AdditionalDangerousPatterns = []json.DangerousPattern{
		{Pattern: "company_secret", Name: "회사 민감 정보", Level: json.PatternLevelCritical},
	}

	// 방법 2: 설정 메서드를 통해
	cfg.AddDangerousPattern(json.DangerousPattern{
		Pattern: "internal_api",
		Name:    "내부 API 참조",
		Level:   json.PatternLevelWarning,
	})

	p, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// 위험 패턴 감지 테스트 (패턴은 전체 단어로 매칭: 양쪽에 문자/숫자/밑줄이 바로 인접하면 안 됨)
	_, err = p.Get(`{"data": "company_secret"}`, "data")
	fmt.Println("위험 패턴 감지됨:", err != nil)
	// 출력: 위험 패턴 감지됨: true

	// 등록된 패턴 확인
	fmt.Printf("커스텀 패턴 수: %d\n", len(cfg.AdditionalDangerousPatterns))
}
```

::: tip 매칭은 '전체 단어' 기준입니다
패턴이 적중하면 단어 경계 컨텍스트 검사를 수행합니다: 패턴 양쪽에 문자, 숫자, 밑줄이 바로 인접하면 일반 식별자의 일부로 간주해 차단하지 않습니다. 예를 들어 패턴 `company_secret` 은 `"company_secret"` 에서는 트리거되지만 `"company_secret_info"` 에서는 트리거되지 않습니다 (뒤에 오는 `_` 는 단어 내 문자); `(`, `[`, `:`, `.` 등 구분자로 끝나는 패턴 (예: `eval(`) 은 접미사의 영향을 받지 않습니다. 이것이 라이브러리 내장 패턴 (`eval(`, `__proto__` 등) 의 매칭 방식입니다.
:::

### 기본 패턴 비활성화

```go
cfg := json.DefaultConfig()

// 내장 기본 패턴 비활성화 (핵심 패턴 제외), 커스텀 패턴만 사용
// 참고: 핵심 패턴 (__proto__, constructor[, prototype.) 은 항상 강제 실행됨
cfg.DisableDefaultPatterns = true

// 커스텀 패턴 추가
cfg.AddDangerousPattern(json.DangerousPattern{
	Pattern: "xss_payload",
	Name:    "XSS 공격 페이로드",
	Level:   json.PatternLevelCritical,
})

p, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer p.Close()
```

### 수준별 패턴 처리

```go
// 다양한 수준의 패턴 등록
cfg := json.DefaultConfig()
cfg.AddDangerousPattern(json.DangerousPattern{
	Pattern: "suspicious_but_allowed",
	Name:    "의심스럽지만 허용됨",
	Level:   json.PatternLevelInfo, // 의미 표기; 현재 구현에서는 적중 시 마찬가지로 차단됨 (PatternLevel 동작 매트릭스 참조)
})

// 등록된 커스텀 패턴 확인
for _, p := range cfg.AdditionalDangerousPatterns {
	fmt.Printf("패턴: %s, 이름: %s, 수준: %s\n", p.Pattern, p.Name, p.Level)
}
```

---

## 스캔 스위치

세 개의 Config 필드가 '어떻게 스캔할지'를 제어합니다:

| 필드 | 기본 | 역할 |
|------|------|------|
| `FullSecurityScan` | `false` | `true` 이면 모든 입력에 대해 크기 구분 없이 전체 스캔; `false` 이면 작은 입력 (< 4KB) 은 전체, 큰 입력은 계층적 최적화 스캔 사용 (아래 섹션 참조, 마찬가지로 100% 커버리지 보장). 전체 모드는 >100KB 입력에 약 10–30% 추가 오버헤드 |
| `DisableDefaultPatterns` | `false` | `true` 이면 내장 비핵심 패턴 (HTML 태그, 이벤트 핸들러 등) 을 건너뛰고 3 개 핵심 패턴 + 커스텀 패턴만 유지 |
| `AdditionalDangerousPatterns` | `nil` | 내장 패턴 외에 커스텀 패턴을 추가 (위 참조) |

```go
cfg := json.SecurityConfig() // FullSecurityScan 이 켜져 있고 각종 제한이 강화됨
// 수동 설정과 동일:
// cfg := json.DefaultConfig()
// cfg.FullSecurityScan = true
```

활성화 권장: **신뢰할 수 없는 입력** (공개 API, 사용자 제출, 외부 webhook), 민감 데이터 관련 (인증, 금융, 개인정보) 또는 컴플라이언스 전체 감사 요구가 있을 때 `FullSecurityScan` 을 켜세요; 신뢰할 수 있는 내부 서비스의 큰 메시지는 기본 계층 스캔을 유지해 처리량을 확보할 수 있습니다.

---

## 보안 스캔 전략

### 작은 JSON (< 4KB)

항상 전체 보안 스캔을 수행하며, 모든 위험 패턴을 하나씩 검사합니다.

### 더 큰 JSON (≥ 4KB)

다계층 최적화 스캔을 사용하여 **100% 커버리지를 보장**합니다 (샘플링 사각지대 없음):

- 핵심 패턴 (`__proto__`, `constructor[`, `prototype.`) 은 항상 전체 스캔
- 먼저 지시자 문자를 검사: 위험 문자가 전혀 없으면 빠르게 건너뜀
- 의심스러운 문자 밀도 감지: 밀도가 너무 높으면 전체 스캔으로 회귀하여, 공격자가 악의적 내용을 밀집 지역에 숨기는 것을 방지
- 나머지 패턴은 32KB **슬라이딩 윈도우** 스캔 사용 (윈도우는 겹침), 경계를 가로지르는 패턴 누락 방지

---

## 관련 문서

- [Config](../api-reference/config) - 설정 옵션
- [Schema 검증](../api-reference/schema) - Schema 검증
- [Hook 훅 시스템](../extensions/hooks) - 작업 인터셉트
