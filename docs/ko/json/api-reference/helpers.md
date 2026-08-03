---
sidebar_label: "유틸리티 함수"
title: "유틸리티 함수 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON 유틸리티 함수: CompareJSON 비교, ClearCache/GetStats 캐시 관리, 전역 프로세서, 보안 헬퍼로 일상적인 Go JSON 작업을 단순화합니다."
sidebar_position: 8
---

# 유틸리티 함수

json 패키지는 JSON 비교, 캐시 관리 및 유틸리티 처리를 위한 풍부한 유틸리티 함수를 제공합니다.

## JSON 비교 함수

### CompareJSON

시그니처: `func CompareJSON(json1, json2 string, cfg ...Config) (bool, error)`

두 JSON 문자열이 같은지 비교합니다. 숫자 정밀도 차이와 키 순서 차이를 처리합니다.

cfg 가 없으면 기존 동작과 동일합니다 (보안 검증을 수행하지 않고, 양쪽 모두 `encoding/json`으로 마샬링). cfg 를 전달하면 두 입력에 보안 검증 (크기/깊이/위험 모드 제한) 을 적용하고, 설정의 인코딩으로 대칭 비교를 수행합니다.

```go
// 키 순서가 다르지만 내용이 같음
equal, _ := json.CompareJSON(`{"a":1,"b":2}`, `{"b":2,"a":1}`)
fmt.Println(equal) // true

// 숫자 정밀도가 다르지만 값이 같음
equal, _ = json.CompareJSON(`{"num":1}`, `{"num":1.0}`)
fmt.Println(equal) // true

// 내용이 다름
equal, _ = json.CompareJSON(`{"a":1}`, `{"a":2}`)
fmt.Println(equal) // false

// 설정과 함께 (보안 검증과 인코딩 제어 적용)
equal, err = json.CompareJSON(a, b, json.SecurityConfig())
```

::: tip Processor 동등 메서드
`Processor.CompareJSON`은 항상 보안 검증을 수행합니다 (cfg 또는 프로세서 자체 설정에 따라), 패키지 레벨 함수의 cfg 없는 경로와 동작이 다릅니다. 자세한 내용은 [Processor 데이터 수정](./processor/modify#processor-comparejson)을 참조하세요.
:::

---

## JSON 병합 함수

### MergeJSON

시그니처: `func MergeJSON(json1, json2 string, cfg ...Config) (string, error)`

두 JSON 객체를 병합합니다. Config 로 병합 모드를 설정할 수 있습니다. 자세한 내용은 [수정 함수](./functions/modify#mergejson)를 참조하세요.

---

### MergeMany

시그니처: `func MergeMany(jsons []string, cfg ...Config) (string, error)`

여러 JSON 객체를 병합합니다. 자세한 내용은 [수정 함수](./functions/modify#mergemany)를 참조하세요.

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
fmt.Printf("캐시 적중률: %.2f%%\n", stats.HitRatio * 100)
fmt.Printf("캐시 크기: %d\n", stats.CacheSize)
```

---

### GetHealthStatus (패키지 레벨 함수)

시그니처: `func GetHealthStatus() HealthStatus`

전역 프로세서의 상태를 가져옵니다.

```go
status := json.GetHealthStatus()
if status.Healthy {
    fmt.Println("프로세서가 정상입니다")
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
fmt.Printf("캐시 적중률: %.2f%%\n", stats.HitRatio * 100)
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
    fmt.Println("프로세서가 정상입니다")
}
```

### WarmupCache

시그니처: `func WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)`

캐시를 미리 웜업하여 후속 작업 성능을 향상시킵니다.

```go
data := `{"user": {"name": "Alice", "email": "alice@example.com"}, "items": [{"id": 1}]}`
paths := []string{"user.name", "user.email", "items[*].id"}
result, err := json.WarmupCache(data, paths)
if err != nil {
    panic(err)
}
fmt.Printf("%d개 경로 웜업 성공\n", result.Successful)
```

---

## 전역 프로세서 관리

패키지 레벨 함수는 내부적으로 전역 프로세서를 사용합니다. 다음 함수로 커스터마이즈하거나 종료할 수 있습니다:

| 함수 | 시그니처 | 설명 |
|------|------|------|
| `SetGlobalProcessor` | `func SetGlobalProcessor(p *Processor)` | 커스텀 전역 프로세서 설정 |
| `ShutdownGlobalProcessor` | `func ShutdownGlobalProcessor()` | 전역 프로세서 종료 및 리소스 해제 |

::: tip 자세한 사용법
전역 프로세서의 전체 사용 예제와 수명 주기 관리는 [Processor 개요](./processor/#전역-프로세서-관리) 및 [Processor 가이드](../getting-started/processor-guide#전역-프로세서)를 참조하세요.
:::

---

## 출력 함수

:::warning API 변경 안내
Print, PrintPretty, PrintE, PrintPrettyE 는 라이브러리에서 제거되어 더 이상 제공되지 않습니다. 대신 [EncodeWithConfig](./functions/output#encodewithconfig), [EncodePretty](./functions/output#encodepretty) 또는 [Prettify](./functions/output#prettify)와 함께 `fmt.Println`을 사용하세요 (`Encode`는 더 이상 사용되지 않음). 자세한 내용은 [출력 함수](./print)를 참조하세요.
:::

---

## Buffer 호환 함수

`Compact`, `Indent`, `HTMLEscape` 는 `encoding/json` 표준 라이브러리와 완전히 호환되며, `cfg` 매개변수를 통해 추가 설정을 지원합니다. 전체 시그니처, 예제 및 Processor 동등 메서드는 [인코딩 출력 함수](./functions/output#compact)를 참조하세요.

---

## 보안 패턴 함수

### Config.AddDangerousPattern

Config 의 `AddDangerousPattern` 메서드 또는 `AdditionalDangerousPatterns` 필드를 통해 커스텀 위험 패턴을 등록합니다.

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
| `PatternLevelWarning` | 엄격 모드에서 차단, 완화 모드에서 경고 기록 |
| `PatternLevelInfo` | 기록만 하고 차단하지 않음 |

---

## 오류 처리 함수

### SafeError

시그니처: `func SafeError(err error) string`

내부 상세 정보가 포함되지 않은 클라이언트 안전 오류 메시지를 반환합니다. API 응답에 적합합니다.

```go
val, err := json.Get(data, "user.name")
if err != nil {
    // 안전한 오류 메시지 반환 (경로, 내부 상태 등 민감한 정보 미포함)
    fmt.Println(json.SafeError(err))
}
```

---

### RedactedPath

시그니처: `func RedactedPath(path string) string`

편집된 경로를 반환합니다. 안전한 로그 기록에 사용합니다. 경로의 민감한 부분을 숨깁니다.

```go
path := "users[0].ssn"
fmt.Println(json.RedactedPath(path)) // 출력: *** (비어 있지 않은 경로는 통일되게 *** 반환, 빈 경로는 빈 문자열 반환)
```

---

## AccessResult 타입 변환 메서드

`AccessResult`은 `Processor.SafeGet()` 및 패키지 레벨 `SafeGet()`의 반환 타입으로, 타입 안전한 변환 메서드를 제공합니다.

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

임의의 값을 문자열로 변환합니다 (fmt.Sprintf 사용).

```go
result := json.SafeGet(data, "user.age")
ageStr, err := result.AsStringConverted()
// "30" (문자열 형식)
```

---

### AccessResult.AsInt

시그니처: `func (r AccessResult) AsInt() (int, error)`

안전하게 정수로 변환합니다. bool 에서 int 로의 변환은 지원하지 않습니다.

```go
result := json.SafeGet(data, "user.age")
age, err := result.AsInt()
```

---

### AccessResult.AsFloat64

시그니처: `func (r AccessResult) AsFloat64() (float64, error)`

안전하게 float64 로 변환합니다. bool 에서 float64 로의 변환은 지원하지 않습니다.

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

- [조회 및 가져오기 함수](./functions/query) - Get, GetString 등 쿼리 작업
- [수정 함수](./functions/modify) - Set, Delete 등 수정 작업
- [타입 정의](./types) - AccessResult 등 타입
- [설정 옵션](./config) - Config 설정 상세
