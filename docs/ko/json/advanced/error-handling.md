---
sidebar_label: "오류 처리"
title: "오류 처리 - CyberGo JSON | 모범 사례"
description: "CyberGo JSON 오류 처리: JsonsError 타입 판별, errors.Is/As 매칭, SafeError 안전 출력과 RedactedPath 마스킹 로그에 센티널 오류 분류, Op/Path 실패 지점 위치, 기본값 폴백과 재시도 전략으로 견고한 예외 처리 체계 구축."
sidebar_position: 2
---

# 오류 처리

JSON 작업의 오류를 올바르게 처리합니다.

## 오류 타입

### 표준 오류

```go
var (
	ErrPathNotFound      = errors.New("path not found")
	ErrInvalidPath       = errors.New("invalid path format")
	ErrTypeMismatch      = errors.New("type mismatch")
	ErrInvalidJSON       = errors.New("invalid JSON format")
	ErrDepthLimit        = errors.New("depth limit exceeded")
	ErrSizeLimit         = errors.New("size limit exceeded")
	ErrSecurityViolation = errors.New("security violation detected")
	ErrProcessorClosed   = errors.New("processor is closed")
	ErrConcurrencyLimit  = errors.New("concurrency limit exceeded")
	ErrUnsupportedPath   = errors.New("unsupported path operation")
	ErrOperationTimeout  = errors.New("operation timeout")          // Deprecated
	ErrResourceExhausted = errors.New("system resources exhausted") // Deprecated
)
```

### 센티널 오류 분류표

12 개의 export 된 센티널 오류를 **처리 방식**에 따라 네 범주로 나눕니다:

| 오류 | 의미 / 전형적 트리거 | 분류 | 처리 권장 |
|------|-----------------|------|----------|
| `ErrInvalidJSON` | 입력이 유효한 JSON 이 아님 (문법 오류, 잘못된 UTF-8) | 사용자 입력 | 친절한 안내 반환, 데이터 수정 요청 |
| `ErrPathNotFound` | 경로가 없음 (중첩 키 누락, 배열 첨자 범위 초과) | 사용자 입력 | 기본값으로 폴백하거나 비즈니스 의미에 맞게 처리 |
| `ErrTypeMismatch` | 경로의 값이 기대 타입과 다름 | 사용자 입력 | 필드 타입 오류 안내 |
| `ErrInvalidPath` | 경로 문법이 잘못됨 (예: `a..b`) | 사용자 입력 | 경로 형식 오류 안내 |
| `ErrUnsupportedPath` | 경로 작업을 지원하지 않음 | 사용자 입력 | 경로와 작업의 조합 점검 |
| `ErrSizeLimit` | 입력이 `Config.MaxJSONSize` 를 초과 | 보안 제한 | 거부하고 속도 제한 정책대로 처리 |
| `ErrDepthLimit` | 중첩 깊이가 `MaxNestingDepthSecurity` 를 초과 | 보안 제한 | 거부 (깊은 중첩은 악성 입력에서 흔함) |
| `ErrSecurityViolation` | 위험 패턴 감지 (프로토타입 오염 등) | 보안 제한 | 기록하고 거부, 상세를 되돌려 주지 않음 |
| `ErrConcurrencyLimit` | 진행 중 작업 수가 `MaxConcurrency` 도달 (소프트 상한, 대기하지 않고 즉시 거부) | 시스템 일시적 | **재시도 가능** — 잠시 후 재시도하거나 상한 상향 |
| `ErrProcessorClosed` | 프로세서를 Close 한 뒤 계속 호출 | 시스템 상태 | `Processor` 재생성 또는 수명 주기 점검 |
| `ErrOperationTimeout` | —— (호환 유지) | 폐기됨 | 현재 반환하는 작업 없음, 이것으로 분기하지 말 것 |
| `ErrResourceExhausted` | —— (호환 유지) | 폐기됨 | 현재 반환하는 작업 없음, 이것으로 분기하지 말 것 |

### 오류 검사

```go
val, err := json.Get(data, "user.name")
if err != nil {
	if errors.Is(err, json.ErrPathNotFound) {
		// 경로가 존재하지 않음
		return defaultName
	}
	if errors.Is(err, json.ErrTypeMismatch) {
		// 타입 불일치
		return "", fmt.Errorf("필드 타입 오류: %w", err)
	}
	return "", err
}
```

## JsonsError

### 구조

`JsonsError` 는 라이브러리의 대표 오류 타입으로, 작업 컨텍스트 정보를 담습니다:

```go
type JsonsError struct {
	Op      string `json:"op"`      // 작업 타입: "get", "set", "delete", "marshal" 등
	Path    string `json:"path"`    // JSON 경로 (있는 경우)
	Message string `json:"message"` // 사람이 읽을 수 있는 오류 메시지
	Err     error  `json:"err"`     // 내부 오류
}

func (e *JsonsError) Error() string
func (e *JsonsError) Unwrap() error
func (e *JsonsError) Is(target error) bool
```

### 사용

```go
val, err := json.Get(data, "user.name")
if err != nil {
	// errors.Is 로 오류 타입 검사
	if errors.Is(err, json.ErrPathNotFound) {
		// 경로가 존재하지 않음
	}
	if errors.Is(err, json.ErrTypeMismatch) {
		// 타입 불일치
	}

	// errors.As 로 상세 컨텍스트 획득
	var jsonErr *json.JsonsError
	if errors.As(err, &jsonErr) {
		fmt.Printf("작업: %s\n", jsonErr.Op)
		fmt.Printf("경로: %s\n", jsonErr.Path)
		fmt.Printf("메시지: %s\n", jsonErr.Message)
	}
}
```

### Op / Path 로 실패 지점 찾기

`Op` (실패한 작업) 와 `Path` (실패한 경로) 조합만으로 오류 문자열을 파싱하지 않고도 문제를 정확히 찾을 수 있습니다:

```go
package main

import (
	"errors"
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"user":{"name":"Alice"},"perms":["read"]}`

	// 두 가지 전형적 실패: 경로 없음 / JSON 잘못됨
	for _, tc := range []struct {
		jsonStr, path string
	}{
		{data, "user.email"},  // 경로가 없음
		{`{"broken"`, "user"}, // JSON 이 잘못됨
	} {
		_, err := json.Get(tc.jsonStr, tc.path)
		var jsonErr *json.JsonsError
		if errors.As(err, &jsonErr) {
			fmt.Printf("op=%s path=%q 원인=%v\n", jsonErr.Op, jsonErr.Path, json.SafeError(err))
		}
	}
}

// 출력:
// op=get path="user.email" 원인=path not found
// op=parse path="" 원인=invalid JSON format
```

:::tip 위치 파악법
`Op` 는 '어떤 작업이 실패했는지' (`get`/`set`/`delete`/`get_multiple`/`warmup_cache`; 파싱 실패는 모두 `parse` 로 기록), `Path` 는 '어느 경로에서 실패했는지'를 알려줍니다. 로그에 `Error()` 문자열 전체 대신 이 두 필드를 출력하면 문제 위치도 잡고 경로의 민감한 키 이름이 로그에 남는 것도 피할 수 있습니다 — 경로를 출력해야 한다면 [`RedactedPath`](#redactedpath-로그-마스킹) 로 마스킹하세요.
:::

## 오류 처리 패턴

### 기본값 제공

```go
// 타입 안전 조회 함수는 기본값을 내장 지원
name := json.GetString(data, "user.name", "익명")
age := json.GetInt(data, "user.age", 0)
active := json.GetBool(data, "user.active", false)
```

### 여러 오류 수집

```go
type MultiError struct {
    Errors []error
}

func (e *MultiError) Add(err error) {
    e.Errors = append(e.Errors, err)
}

func (e *MultiError) HasError() bool {
    return len(e.Errors) > 0
}

func (e *MultiError) Error() string {
    msgs := make([]string, len(e.Errors))
    for i, err := range e.Errors {
        msgs[i] = err.Error()
    }
    return strings.Join(msgs, "; ")
}

// 사용
var multiErr MultiError
for _, path := range requiredPaths {
    if _, err := json.Get(data, path); err != nil {
        multiErr.Add(fmt.Errorf("%s: %w", path, err))
    }
}
if multiErr.HasError() {
    return multiErr.Error()
}
```

### 오류 래핑

```go
val, err := json.Get(data, "config.api_key")
if err != nil {
	return fmt.Errorf("API 키 읽기 실패: %w", err)
}
```

## 커스텀 오류

### 비즈니스 오류

```go
type ValidationError struct {
	Field   string
	Message string
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("검증 실패 %s: %s", e.Field, e.Message)
}

// 사용
func validateUser(data string) error {
	name := json.GetString(data, "name")
	if name == "" {
		return &ValidationError{Field: "name", Message: "필수"}
	}
	if len(name) < 2 {
		return &ValidationError{Field: "name", Message: "길이는 최소 2 자"}
	}
	return nil
}
```

## 로그 기록

### 구조화된 로그

```go
val, err := json.Get(data, path)
if err != nil {
	log.Error("JSON 작업 실패",
		"path", path,
		"error", err,
		"error_type", fmt.Sprintf("%T", err),
	)
	return err
}
```

### 감사 로그

```go
func auditLog(op string, path string, err error) {
	if err != nil {
		log.Warn("작업 실패",
			"operation", op,
			"path", path,
			"error", err,
		)
	} else {
		log.Info("작업 성공",
			"operation", op,
			"path", path,
		)
	}
}
```

## 복구 전략

### SafeError 안전 출력

`SafeError` 는 클라이언트에게 안전한 오류 메시지를 반환하며 내부 컨텍스트 (작업, 경로, 구조 세부) 를 제거합니다. HTTP/API 응답에 적합합니다 (CWE-209):

```go
// 시그니처: func SafeError(err error) string

val, err := json.Get(untrustedInput, "data")
if err != nil {
	// 전체 Error() 에는 "JSON get failed at path '...': ..." 가 포함되어 있어 그대로 밖으로 보내면 안 됨
	// SafeError 는 내부 센티널 오류 메시지만 반환 (예: "path not found")
	safeMsg := json.SafeError(err)
	_ = safeMsg // http.Error(w, safeMsg, http.StatusBadRequest)
	_ = val
	return
}
```

### RedactedPath 로그 마스킹

경로 자체에 민감한 키 이름 (`user.password`, `token` 등) 이 있을 수 있습니다. 로그를 남기기 전에 `RedactedPath` 로 마스킹하세요 — 비어 있지 않은 경로는 모두 `***` 로 바뀌어 어떤 단편도 새어 나가지 않습니다:

```go
// 시그니처: func RedactedPath(path string) string

var jsonErr *json.JsonsError
if errors.As(err, &jsonErr) {
	// 로그에는 마스킹된 경로만 기록해 민감한 키 이름이 로그 시스템에 들어가지 않게 함
	log.Warn("JSON 작업 실패",
		"op", jsonErr.Op,
		"path", json.RedactedPath(jsonErr.Path), // ***
	)
}
```

### 재시도

```go
func withRetry(fn func() error, maxRetries int) error {
    var err error
    for i := 0; i < maxRetries; i++ {
        if err = fn(); err == nil {
            return nil
        }
        time.Sleep(time.Second * time.Duration(i+1))
    }
    return err
}

// 사용
err := withRetry(func() error {
    return processData(data)
}, 3)
```

### 강하

```go
func getConfig(data string) Config {
	cfg := json.DefaultConfig()

	// 타입 안전 조회 함수 사용, 기본값 내장
	cfg.StrictMode = json.GetBool(data, "config.strict", true)

	return cfg
}
```

## 오류 분류

### 사용자 입력 오류

사용자가 제공한 JSON 데이터나 경로에서 비롯됩니다:

```go
val, err := json.Get(data, "user.name")
if err != nil {
	switch {
	case errors.Is(err, json.ErrInvalidJSON):
		// JSON 형식 오류
		return fmt.Errorf("데이터 형식 오류: %w", err)
	case errors.Is(err, json.ErrPathNotFound):
		// 경로가 존재하지 않음
		return fmt.Errorf("필드가 존재하지 않음: %w", err)
	case errors.Is(err, json.ErrTypeMismatch):
		// 타입 불일치
		return fmt.Errorf("타입 오류: %w", err)
	case errors.Is(err, json.ErrInvalidPath):
		// 경로 문법 오류
		return fmt.Errorf("경로 문법 오류: %w", err)
	case errors.Is(err, json.ErrUnsupportedPath):
		// 지원하지 않는 경로 작업
		return fmt.Errorf("지원하지 않는 작업: %w", err)
	}
}
```

### 보안 관련 오류

잠재적 보안 위협이 감지된 경우입니다:

```go
val, err := json.Get(untrustedInput, "data")
if err != nil {
	if errors.Is(err, json.ErrSecurityViolation) {
		// 보안 위반, 기록하고 거부
		log.Warn("보안 위반", "error", err)
		return errors.New("입력이 유효하지 않음")
	}
	if errors.Is(err, json.ErrSizeLimit) {
		return fmt.Errorf("데이터가 크기 제한 초과: %w", err)
	}
	if errors.Is(err, json.ErrDepthLimit) {
		return fmt.Errorf("중첩 깊이 제한 초과: %w", err)
	}
	return err
}
```

### 시스템 오류

시스템 수준의 일시적 오류입니다:

```go
val, err := json.Get(data, "user.name")
if err != nil {
	if errors.Is(err, json.ErrOperationTimeout) {
		// 작업 타임아웃, 재시도 가능 <Badge type="danger" text="폐기됨" />
		return fmt.Errorf("일시적 오류, 재시도하세요: %w", err)
	}
	if errors.Is(err, json.ErrConcurrencyLimit) {
		// 동시성 제한 (MaxConcurrency 도달 시 반환, 재시도 가능)
		return fmt.Errorf("시스템이 바쁩니다, 잠시 후: %w", err)
	}
	if errors.Is(err, json.ErrResourceExhausted) {
		// 리소스 고갈 <Badge type="danger" text="폐기됨" />
		return fmt.Errorf("시스템 리소스 부족: %w", err)
	}
	if errors.Is(err, json.ErrProcessorClosed) {
		// 프로세서가 닫힘
		return fmt.Errorf("프로세서를 사용할 수 없음: %w", err)
	}
	return err
}
```

## 오류 처리 모범 사례

### 1. 오류 타입 구분

```go
func processJSON(data string) error {
	val, err := json.Get(data, "user.name")
	if err != nil {
		// errors.Is 로 오류 타입 구분
		switch {
		case errors.Is(err, json.ErrInvalidJSON),
			errors.Is(err, json.ErrPathNotFound),
			errors.Is(err, json.ErrTypeMismatch),
			errors.Is(err, json.ErrInvalidPath):
			// 사용자 입력 오류, 친절한 안내 반환
			return fmt.Errorf("데이터 형식 오류: %w", err)
		case errors.Is(err, json.ErrSecurityViolation):
			// 보안 오류, 기록하고 거부
			log.Warn("보안 위반", "error", err)
			return errors.New("입력이 유효하지 않음")
		case errors.Is(err, json.ErrConcurrencyLimit):
			// 동시성 상한, 잠시 후 재시도 가능
			return fmt.Errorf("시스템이 바쁩니다, 잠시 후 재시도하세요: %w", err)
		case errors.Is(err, json.ErrOperationTimeout): // Deprecated (현재 반환되지 않음, 호환 유지)
			return fmt.Errorf("일시적 오류, 재시도하세요: %w", err)
		default:
			// 시스템 오류
			log.Error("시스템 오류", "error", err)
			return errors.New("내부 오류")
		}
	}
	return nil
}
```

### 2. errors.As 로 컨텍스트 획득

```go
func handleWithDetail(data string, path string) error {
	val, err := json.Get(data, path)
	if err != nil {
		var jsonErr *json.JsonsError
		if errors.As(err, &jsonErr) {
			return fmt.Errorf("작업 %s 실패 (경로: %s): %w",
				jsonErr.Op, jsonErr.Path, jsonErr.Err)
		}
		return fmt.Errorf("작업 실패: %w", err)
	}
	return nil
}
```

### 3. 오류 체인 추적

```go
func deepProcess(data string) error {
	if err := processLevel1(data); err != nil {
		return fmt.Errorf("심층 처리 실패: %w", err)
	}
	return nil
}

func processLevel1(data string) error {
	if err := processLevel2(data); err != nil {
		return fmt.Errorf("1 단계 처리 실패 (경로 data.field): %w", err)
	}
	return nil
}

func processLevel2(data string) error {
	_, err := json.Get(data, "data.field")
	return err
}

// 오류 체인 예시 (JsonsError 가 Op/Path 를 담고, fmt.Errorf 의 %w 가 내부 원인을 층층이 보존):
// 심층 처리 실패: 1 단계 처리 실패 (경로 data.field): JSON get failed at path 'data.field': ... (caused by: path not found)
```

## 관련 문서

- [상수 및 오류](../api-reference/constants)
- [보안 개요](../security/)
- [성능 최적화](./performance)
