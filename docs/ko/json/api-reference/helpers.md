---
sidebar_label: "유틸리티 함수"
title: "유틸리티 함수 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON 보조 함수: CompareJSON 키 순서·숫자 정밀도 무시 비교, ClearCache/GetStats 캐시 관리, GetHealthStatus 모니터링과 전역 프로세서 관리, SafeError/RedactedPath 보안 보조로 Go JSON 작업을 간소화."
sidebar_position: 8
---

# 유틸리티 함수

json 패키지는 JSON 비교, 캐시 관리, 도구 처리를 위한 풍부한 보조 함수를 제공합니다.

## JSON 비교 함수

### CompareJSON

시그니처: `func CompareJSON(json1, json2 string, cfg ...Config) (bool, error)`

두 JSON 문자열이 같은지 비교합니다. 숫자 정밀도 차이와 키 순서 차이를 처리합니다.

cfg 가 없으면 과거와 동일한 동작입니다 (보안 검증 없음, 양쪽 모두 `encoding/json` 으로 인코딩). cfg 를 전달하면 두 입력에 보안 검증 (크기/깊이/위험 패턴 제한) 을 적용하고 설정의 인코딩으로 대칭 비교합니다.

```go
// 키 순서는 다르지만 내용은 같음
equal, _ := json.CompareJSON(`{"a":1,"b":2}`, `{"b":2,"a":1}`)
fmt.Println(equal) // true

// 숫자 정밀도는 다르지만 값은 같음
equal, _ = json.CompareJSON(`{"num":1}`, `{"num":1.0}`)
fmt.Println(equal) // true

// 내용이 다름
equal, _ = json.CompareJSON(`{"a":1}`, `{"a":2}`)
fmt.Println(equal) // false

// 설정 포함 (보안 검증과 인코딩 제어 적용)
equal, err = json.CompareJSON(a, b, json.SecurityConfig())
```

::: tip Processor 등가 메서드
`Processor.CompareJSON` 은 항상 보안 검증을 실행 (cfg 또는 프로세서 자체 설정 기준) 하며, 패키지 레벨 함수의 cfg 없는 경로와 동작이 다릅니다. 자세한 내용은 [Processor 데이터 수정](./processor/modify#processor-comparejson) 을 참조하세요.
:::

---

## JSON 병합 함수

### MergeJSON

시그니처: `func MergeJSON(json1, json2 string, cfg ...Config) (string, error)`

두 JSON 객체를 병합하며, Config 로 병합 모드를 설정할 수 있습니다. 자세한 내용은 [수정 함수](./functions/modify#mergejson) 를 참조하세요.

**의미 세부**:

- **두 입력 모두 JSON 객체여야 합니다** (최상위가 객체가 아니면 `first/second JSON is not an object` 오류)
- 중첩 객체는 `Config.MergeMode` 로 재귀적으로 깊은 병합; 원시 값과 배열은 `json2` 의 값을 그대로 사용
- 숫자는 정밀도를 보존해 디코딩한 뒤 `float64` 로 정규화하고 다시 인코딩 (`1` 과 `1.0` 은 동등)
- **보안 검증을 하지 않음** — 순수 구조 도구로 디코딩, 병합, 재인코딩만 합니다 (cfg 를 전달할 때의 `CompareJSON` 과 다름)

---

### MergeMany

시그니처: `func MergeMany(jsons []string, cfg ...Config) (string, error)`

여러 JSON 객체를 병합합니다. 자세한 내용은 [수정 함수](./functions/modify#mergemany) 를 참조하세요.

**의미 세부**: **최소 2 개**의 JSON 문자열이 필요합니다 (미만이면 오류); 왼쪽에서 오른쪽으로 접습니다 (`MergeJSON` 을 순서대로 호출하는 것과 동등), 어떤 단계가 실패하면 `merge failed at index N: <원인>` 오류를 반환합니다.

---

## 캐시와 통계

### ClearCache (패키지 레벨 함수)

시그니처: `func ClearCache()`

전역 프로세서의 내부 캐시를 지웁니다.

```go
json.ClearCache()
```

---

### GetStats (패키지 레벨 함수)

시그니처: `func GetStats() Stats`

전역 프로세서의 통계 정보를 가져옵니다.

```go
stats := json.GetStats()
fmt.Printf("캐시 적중률: %.2f%%\n", stats.HitRatio*100)
fmt.Printf("캐시 크기: %d\n", stats.CacheSize)
```

---

### GetHealthStatus (패키지 레벨 함수)

시그니처: `func GetHealthStatus() HealthStatus`

전역 프로세서의 상태를 가져옵니다.

```go
status := json.GetHealthStatus()
if status.Healthy {
	fmt.Println("프로세서 정상")
}
```

---

### Processor.ClearCache

시그니처: `func (p *Processor) ClearCache()`

프로세서의 내부 캐시를 지웁니다.

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

p.ClearCache()
```

### Processor.GetStats

시그니처: `func (p *Processor) GetStats() Stats`

프로세서의 통계 정보를 가져옵니다.

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

stats := p.GetStats()
fmt.Printf("캐시 적중률: %.2f%%\n", stats.HitRatio*100)
fmt.Printf("캐시 크기: %d\n", stats.CacheSize)
```

### Processor.GetHealthStatus

시그니처: `func (p *Processor) GetHealthStatus() HealthStatus`

프로세서의 상태를 가져옵니다.

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

status := p.GetHealthStatus()
if status.Healthy {
	fmt.Println("프로세서 정상")
}
```

### WarmupCache

시그니처: `func WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)`

캐시를 예열해 이후 작업 성능을 높입니다.

```go
data := `{"user": {"name": "Alice", "email": "alice@example.com"}, "items": [{"id": 1}]}`
paths := []string{"user.name", "user.email", "items[*].id"}
result, err := json.WarmupCache(data, paths)
if err != nil {
	panic(err)
}
fmt.Printf("%d 개 경로 예열 성공\n", result.Successful)
```

**WarmupResult 구조**

| 필드 | 타입 | 설명 |
|------|------|------|
| `TotalPaths` | `int` | 예열에 제출한 경로 총수 |
| `Successful` | `int` | 성공적으로 캐시된 경로 수 |
| `Failed` | `int` | 실패한 경로 수 |
| `SuccessRate` | `float64` | 성공률, **퍼센트 0–100** (0–1 이 아님; 빈 경로 목록은 100) |
| `FailedPaths` | `[]string` | 실패 경로 목록 (모두 성공이면 nil) |

::: warning 예열의 오류 경계
`WarmupCache` 는 **모든 경로가 실패**할 때 `(result, error)` 를 반환합니다 (error 는 마지막 실패 원인을 담음); 캐시가 비활성화 (`EnableCache: false`) 되면 바로 오류를 반환합니다. 부분 실패는 `WarmupResult` 필드에만 반영되며 error 는 nil 입니다.
:::

---

## 전역 프로세서 관리

패키지 레벨 함수는 내부적으로 전역 프로세서를 사용합니다. 다음 함수로 커스터마이즈하거나 종료할 수 있습니다:

| 함수 | 시그니처 | 설명 |
|------|------|------|
| `SetGlobalProcessor` | `func SetGlobalProcessor(processor *Processor)` | 커스텀 전역 프로세서 설정 |
| `ShutdownGlobalProcessor` | `func ShutdownGlobalProcessor()` | 전역 프로세서를 닫고 리소스 해제 |

**동작 세부**:

- `SetGlobalProcessor(nil)` 은 아무것도 하지 않습니다; 교체에 성공하면 **이전 프로세서가 동기적으로 Close** 됩니다 (Close 내부에서 최대 약 5 초 대기), 그 사이 진행 중인 작업은 영향을 받지 않습니다
- `ShutdownGlobalProcessor` 는 스레드 안전합니다: 기본 프로세서, 백업 프로세서와 **설정 캐시의 모든 프로세서**를 닫고, 경로 타입 캐시 등 전역 캐시를 정리합니다. 이후 패키지 레벨 함수의 첫 호출이 **새 기본 프로세서를 자동 생성**하므로 장수명 서비스의 마무리 정리에 적합합니다

::: tip 상세 사용법
전역 프로세서의 전체 사용 예제와 수명 주기 관리는 [Processor 개요](./processor/#전역-프로세서-관리) 와 [Processor 가이드](../getting-started/processor-guide#전역-프로세서) 를 참조하세요.
:::

---

## 출력 함수

::: warning API 변경 안내
Print, PrintPretty, PrintE, PrintPrettyE 는 라이브러리에서 제거되어 더 이상 제공되지 않습니다. [EncodeWithConfig](./functions/output#encodewithconfig), [EncodePretty](./functions/output#encodepretty) 또는 [Prettify](./functions/output#prettify) 를 `fmt.Println` 과 함께 사용하세요 (`Encode` 는 폐기 예정). 자세한 내용은 [출력 포맷팅](../getting-started/print) 을 참조하세요.
:::

---

## Buffer 호환 함수

`Compact`, `Indent`, `HTMLEscape` 는 `encoding/json` 표준 라이브러리와 완전히 호환되며, `cfg` 매개변수로 추가 설정을 지원합니다. 전체 예제와 Processor 등가 메서드는 [인코딩 출력 함수](./functions/output#compact) 를 참조하세요.

| 함수 | 시그니처 | 설명 |
|------|------|------|
| `Compact` | `func Compact(dst *bytes.Buffer, src []byte, cfg ...Config) error` | 무의미한 공백을 제거하고 **dst 에 기록** (`encoding/json.Compact` 호환, `Processor.CompactBuffer` 미러) |
| `CompactString` | `func CompactString(jsonStr string, cfg ...Config) (string, error)` | 문자열 입력, 문자열 출력 (`Processor.Compact` 미러), `Compact` 와는 **두 개의 다른 함수** |
| `Indent` | `func Indent(dst *bytes.Buffer, src []byte, prefix, indent string, cfg ...Config) error` | 들여쓰기 포맷팅 후 dst 에 기록 (`encoding/json.Indent` 호환) |
| `HTMLEscape` | `func HTMLEscape(dst *bytes.Buffer, src []byte, cfg ...Config)` | `<` `>` `&` 및 U+2028/U+2029 를 이스케이프해 dst 에 기록, 반환값 없음 |

---

## 보안 패턴 함수

### Config.AddDangerousPattern

Config 의 `AddDangerousPattern` 메서드 또는 `AdditionalDangerousPatterns` 필드로 커스텀 위험 패턴을 등록합니다.

```go
cfg := json.DefaultConfig()
cfg.AddDangerousPattern(json.DangerousPattern{
	Pattern: "malicious_keyword",
	Name:    "커스텀 악성 키워드",
	Level:   json.PatternLevelCritical,
})
p, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer p.Close()
```

Config 생성 후 `AdditionalDangerousPatterns` 필드를 설정할 수도 있습니다:

```go
cfg := json.DefaultConfig()
cfg.AdditionalDangerousPatterns = []json.DangerousPattern{
	{Pattern: "malicious_keyword", Name: "커스텀 악성 키워드", Level: json.PatternLevelCritical},
}
p, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer p.Close()
```

**DangerousPattern 구조체**

| 필드 | 타입 | 설명 |
|------|------|------|
| `Pattern` | `string` | 감지할 부분 문자열 |
| `Name` | `string` | 사람이 읽을 수 있는 위험 설명 |
| `Level` | `PatternLevel` | 심각도 수준 |

**PatternLevel 수준**

| 수준 | 설명 |
|------|------|
| `PatternLevelCritical` | 항상 작업 차단 |
| `PatternLevelWarning` | 엄격 모드에서 차단, 관대한 모드에서 경고 기록 |
| `PatternLevelInfo` | 기록만 하고 절대 차단하지 않음 |

---

## 보안 패턴 등록 (전역 함수)

Config 레벨의 `AdditionalDangerousPatterns` 외에 라이브러리는 **전역 레지스트리**도 유지하며, 프로세스 수준의 통일된 보안 정책에 적합합니다: 프로세스 시작 시 한 번 등록하면 프로세스 내 **모든 Processor** 에 적용됩니다 — 검증 시 전역 레지스트리를 실시간으로 읽으므로 이미 생성된 Processor 를 다시 만들 필요가 없습니다; 각 Processor 의 설정과 무관하게 동작합니다 (`DisableDefaultPatterns` 를 설정해도 여전히 적용), 등록과 제거는 모두 스레드 안전한 작업입니다.

`DangerousPattern` 구조체와 `PatternLevel` 수준 정의는 위쪽의 [보안 패턴 함수](#보안-패턴-함수) 절을 참조하세요.

### RegisterDangerousPattern

```go
func RegisterDangerousPattern(pattern DangerousPattern)
```

프로세스 수준 **전역 레지스트리**에 위험 패턴을 등록합니다. 등록된 패턴은 내장 패턴과 함께 보안 검증에 참여합니다 (부분 문자열로 감지, 대소문자 구분 없음). 같은 패턴 문자열을 다시 등록하면 이전 항목을 덮어씁니다.

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `pattern` | `DangerousPattern` | 예 | 등록할 패턴 (`Pattern` 은 감지할 부분 문자열, `Name` 은 사람이 읽을 수 있는 설명, `Level` 은 심각도 수준) |

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// 프로세스 시작 시 한 번 등록하면 프로세스 내 모든 Processor 에 적용
	json.RegisterDangerousPattern(json.DangerousPattern{
		Pattern: "internal_admin_token",
		Name:    "내부 관리 토큰",
		Level:   json.PatternLevelCritical,
	})

	// 전역으로 등록한 패턴은 이후 생성하는 Processor 에도 적용
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// ListDangerousPatterns 는 커스텀 등록 패턴만 반환 (내장 패턴 제외)
	for _, dp := range json.ListDangerousPatterns() {
		fmt.Printf("%s (level=%d)\n", dp.Pattern, dp.Level)
	}
	// 출력: internal_admin_token (level=0)
}
```

### UnregisterDangerousPattern

```go
func UnregisterDangerousPattern(pattern string)
```

패턴 문자열로 전역 레지스트리에서 커스텀 패턴을 제거합니다. 등록되지 않은 패턴의 제거는 무해한 no-op 입니다; 내장 패턴에는 효과가 없습니다 (이 절 끝의 경고 참조).

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `pattern` | `string` | 예 | 제거할 패턴 문자열 (즉 `DangerousPattern.Pattern` 필드의 값) |

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	json.RegisterDangerousPattern(json.DangerousPattern{
		Pattern: "internal_admin_token",
		Name:    "내부 관리 토큰",
		Level:   json.PatternLevelCritical,
	})

	// 패턴 문자열로 제거; 등록되지 않은 패턴의 제거는 무해한 no-op
	json.UnregisterDangerousPattern("internal_admin_token")

	// 전역 레지스트리에는 커스텀 패턴만 저장되므로 제거 후 다시 비어 있음
	fmt.Println(len(json.ListDangerousPatterns())) // 출력: 0
}
```

### ListDangerousPatterns

```go
func ListDangerousPatterns() []DangerousPattern
```

전역 레지스트리의 모든 패턴, 즉 `RegisterDangerousPattern` 으로 등록한 **커스텀 패턴**을 반환합니다 — 내장 패턴은 라이브러리가 자체적으로 관리하므로 여기에 나열되지 않고 제거할 수도 없습니다. 레지스트리가 비어 있으면 빈 (nil 이 아닌) 슬라이스를 반환합니다.

**반환값**

| 타입 | 설명 |
|------|------|
| `[]DangerousPattern` | 등록된 모든 커스텀 패턴 (레지스트리가 비어 있으면 빈 슬라이스) |

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	json.RegisterDangerousPattern(json.DangerousPattern{
		Pattern: "internal_admin_token",
		Name:    "내부 관리 토큰",
		Level:   json.PatternLevelCritical,
	})

	patterns := json.ListDangerousPatterns()
	fmt.Println(len(patterns))     // 출력: 1
	fmt.Println(patterns[0].Name)  // 출력: 내부 관리 토큰
	fmt.Println(patterns[0].Level) // 출력: 0 (즉 PatternLevelCritical)
}
```

::: warning 내장 핵심 패턴은 비활성화할 수 없음
`__proto__`, `constructor[`, `prototype.` 등 핵심 패턴은 **항상 강제 적용**되며, `UnregisterDangerousPattern` 과 `DisableDefaultPatterns` 모두 효과가 없습니다.
:::

보안 모드의 전체 설계 (내장 위험 패턴 목록, `SecurityConfig` 프리셋과 `PatternLevel` 차단 전략) 는 [보안 모드](../security/security-mode) 를 참조하세요.

---

## 오류 처리 함수

### SafeError

시그니처: `func SafeError(err error) string`

클라이언트에게 안전한 오류 메시지를 반환하며 내부 상세 정보를 포함하지 않습니다. API 응답에 적합합니다.

```go
val, err := json.Get(data, "user.name")
if err != nil {
	// 안전한 오류 메시지 반환 (경로, 내부 상태 등 민감 정보 제외)
	fmt.Println(json.SafeError(err))
}
```

---

### RedactedPath

시그니처: `func RedactedPath(path string) string`

마스킹된 경로를 반환하며, 안전한 로그 기록에 사용합니다. 경로의 민감한 부분을 숨깁니다.

```go
path := "users[0].ssn"
fmt.Println(json.RedactedPath(path)) // 출력: *** (비어 있지 않은 경로는 모두 *** 반환, 빈 경로는 빈 문자열 반환)
```

---

## AccessResult 타입 변환 메서드

`AccessResult` 는 `Processor.SafeGet()` 와 패키지 레벨 `SafeGet()` 의 반환 타입으로, 타입 안전한 변환 메서드를 제공합니다.

### AccessResult.AsString

시그니처: `func (r AccessResult) AsString() (string, error)`

안전하게 문자열 타입으로 변환합니다. 값 자체가 문자열일 때만 성공합니다.

```go
result := json.SafeGet(data, "user.name")
name, err := result.AsString()
if err != nil {
	return
}
fmt.Println(name)
```

---

### AccessResult.AsStringConverted

시그니처: `func (r AccessResult) AsStringConverted() (string, error)`

임의의 값을 문자열로 변환합니다 (fmt.Sprintf 로 포맷팅).

```go
result := json.SafeGet(data, "user.age")
ageStr, err := result.AsStringConverted()
// "30" (문자열 형식)
```

---

### AccessResult.AsInt

시그니처: `func (r AccessResult) AsInt() (int, error)`

안전하게 정수로 변환합니다. bool → int 변환은 지원하지 않습니다.

```go
result := json.SafeGet(data, "user.age")
age, err := result.AsInt()
```

---

### AccessResult.AsFloat64

시그니처: `func (r AccessResult) AsFloat64() (float64, error)`

안전하게 float64 로 변환합니다. bool → float64 변환은 지원하지 않습니다.

```go
result := json.SafeGet(data, "item.price")
price, err := result.AsFloat64()
```

---

### AccessResult.AsBool

시그니처: `func (r AccessResult) AsBool() (bool, error)`

안전하게 불리언으로 변환합니다. bool 과 string 타입만 지원합니다.

```go
result := json.SafeGet(data, "feature.enabled")
enabled, err := result.AsBool()
```

---

## 관련 문서

- [조회 및 가져오기 함수](./functions/query) - Get, GetString 등 조회 작업
- [수정 함수](./functions/modify) - Set, Delete 등 수정 작업
- [타입 정의](./types) - AccessResult 등 타입
- [설정 옵션](./config) - Config 설정 상세
