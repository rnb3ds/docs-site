---
sidebar_label: "상수 및 오류"
title: "상수와 오류 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON 상수와 오류: DefaultMaxJSONSize, DefaultMaxNestingDepth 제한, ErrPathNotFound 오류 변수와 MergeMode 병합 모드에 JsonsError 구조체, 발생 시나리오와 기본값 비교표로 Go 설정을 지원합니다."
sidebar_position: 7
---

# 상수와 오류

## 오류 변수

### 주요 오류

```go
var (
	// 기본 오류
	ErrInvalidJSON     = errors.New("invalid JSON format")
	ErrPathNotFound    = errors.New("path not found")
	ErrTypeMismatch    = errors.New("type mismatch")
	ErrInvalidPath     = errors.New("invalid path format")
	ErrProcessorClosed = errors.New("processor is closed")

	// 제한 오류
	ErrSizeLimit        = errors.New("size limit exceeded")
	ErrDepthLimit       = errors.New("depth limit exceeded")
	ErrConcurrencyLimit = errors.New("concurrency limit exceeded") // 제어 대상 작업 (Get/Set/Delete 등) 이 MaxConcurrency 에 도달하면 반환

	// 보안 및 검증 오류
	ErrSecurityViolation = errors.New("security violation detected")
	ErrUnsupportedPath   = errors.New("unsupported path operation")

	// 리소스 및 성능 오류 (모두 Deprecated: 현재 어떤 작업도 반환하지 않으며 미래 사용을 위해 유지)
	ErrOperationTimeout  = errors.New("operation timeout")
	ErrResourceExhausted = errors.New("system resources exhausted")
)
```

### 트리거 시나리오 빠른 참조

각 센티널 오류의 전형적인 트리거 시나리오로, 오류 분기별 복구 로직을 작성하기 쉽습니다:

| 오류 | 전형적인 트리거 시나리오 | 권장 처리 |
|------|--------------|----------|
| `ErrInvalidJSON` | 입력이 유효한 JSON 이 아님 (잔여 문자, 미닫힘 등) | 입력 거부, 출처 확인 |
| `ErrPathNotFound` | `Get` 의 경로가 데이터에 없음 | 비즈니스에서 흔함, 기본값으로 대체 |
| `ErrTypeMismatch` | 경로는 존재하지만 타입이 맞지 않음 (예: 문자열 경로에 `[0]` 사용) | 데이터 구조 가정 점검 |
| `ErrInvalidPath` | 경로 문법 오류 (`CompilePath` / 경로 파싱 실패) | 경로 표현식 수정 |
| `ErrProcessorClosed` | `Close()` 이후 (또는 닫히는 중) 메서드 계속 호출 | 수명 주기 점검, `IsClosed` 로 사전 판단 |
| `ErrSizeLimit` | 입력이 `MaxJSONSize` / `MaxSecurityValidationSize` 초과 | 제한을 키우거나 초대형 입력 거부 |
| `ErrDepthLimit` | 중첩이 `MaxNestingDepthSecurity` 초과 | 깊은 중첩 입력 거부 (공격일 수 있음) |
| `ErrConcurrencyLimit` | 제어 대상 작업의 동시성이 `MaxConcurrency` 초과 | 동시성을 낮추거나 제한 키우기 |
| `ErrSecurityViolation` | 위험 패턴 적중, `MaxObjectKeys`/`MaxArrayElements` 초과 | 감사 로그 기록 후 거부 |
| `ErrUnsupportedPath` | 현재 데이터 형태에서 지원하지 않는 경로 세그먼트 (예: 비배열에 슬라이스 사용) | 데이터 구조 가정 점검 |
| `ErrOperationTimeout` | 예약됨, 현재 반환하는 작업 없음 (deprecated) | 오류 분기에서 처리 불필요 |
| `ErrResourceExhausted` | 예약됨, 현재 반환하는 작업 없음 (deprecated) | 오류 분기에서 처리 불필요 |

::: tip 두 개의 Deprecated 센티널
`ErrOperationTimeout` 과 `ErrResourceExhausted` 는 현재 **어떤 작업도 반환하지 않으며** 미래 버전을 위해서만 유지됩니다 — 오류 분기에서 처리할 필요가 없습니다.
:::

### 오류 검사

`errors.Is` 로 오류 타입을 검사합니다:

```go
val, err := json.Get(data, "user.name")
if err != nil {
	if errors.Is(err, json.ErrPathNotFound) {
		// 경로가 존재하지 않음
		fmt.Println("경로를 찾을 수 없음")
	} else if errors.Is(err, json.ErrTypeMismatch) {
		// 타입 불일치
		fmt.Println("타입 불일치")
	} else if errors.Is(err, json.ErrInvalidJSON) {
		// JSON 형식 오류
		fmt.Println("유효하지 않은 JSON")
	}
}
```

## JsonsError 타입

### 구조 정의

```go
type JsonsError struct {
	Op      string `json:"op"`      // 작업 이름
	Path    string `json:"path"`    // 오류가 발생한 경로
	Message string `json:"message"` // 사람이 읽을 수 있는 오류 메시지
	Err     error  `json:"err"`     // 내부 오류
}
```

**필드 설명**

| 필드 | 타입 | 설명 |
|------|------|------|
| `Op` | `string` | 실패한 작업 이름 |
| `Path` | `string` | 오류가 발생한 JSON 경로 |
| `Message` | `string` | 사람이 읽을 수 있는 오류 메시지 |
| `Err` | `error` | 내부 오류 (`nil` 일 수 있음), `Unwrap` 을 거쳐 `errors.Is` / `errors.As` 체인 추적 지원 |

### 메서드

```go
func (e *JsonsError) Error() string // "JSON <op> failed at path '<path>': <msg> (caused by: ...)"
func (e *JsonsError) Unwrap() error // 내부 오류 반환 (errors.As/Is 체인 지원)
func (e *JsonsError) Is(target error) bool
```

`Is` 의 매칭 규칙:

- 대상이 `*JsonsError` 이면 `Op`, `Path`, `Err` 세 필드를 하나씩 비교합니다 (`Message` 는 파생 정보이므로 비교에서 **의도적으로 제외**)
- 대상이 다른 오류 (예: 센티널 오류) 이면 내부 `Err` 에 대한 `errors.Is` 로 전환됩니다 — 따라서 래핑된 `JsonsError` 에 대해서도 `errors.Is(err, json.ErrPathNotFound)` 이 성립합니다

### 사용 예제

```go
val, err := json.Get(data, "complex.path[0]")
if err != nil {
	var jsonErr *json.JsonsError
	if errors.As(err, &jsonErr) {
		fmt.Printf("작업: %s\n", jsonErr.Op)
		fmt.Printf("경로: %s\n", jsonErr.Path)
		fmt.Printf("메시지: %s\n", jsonErr.Message)
		if jsonErr.Err != nil {
			fmt.Printf("원인: %v\n", jsonErr.Err)
		}
	}
}
```

## 오류 보조 함수

위 오류 타입 외에 라이브러리는 두 개의 오류 처리 보조 함수를 제공합니다 (전체 설명은 [보조 도구](./helpers#safeerror) 참조):

| 함수 | 시그니처 | 설명 |
|------|------|------|
| `SafeError` | `func SafeError(err error) string` | 클라이언트에게 안전한 오류 메시지를 반환하며 경로명 등 내부 세부 사항을 생략 (CWE-209) |
| `RedactedPath` | `func RedactedPath(path string) string` | 마스킹된 경로를 반환 (비어 있지 않은 경로는 `"***"` 로 처리), 로그와 오류 응답에 사용 |

## 설정 프리셋

### 기본값 상수

```go
const (
	// 크기 제한
	DefaultMaxJSONSize     = 100 * 1024 * 1024 // 100MB
	DefaultMaxNestingDepth = 200
	DefaultMaxPathDepth    = 50
	DefaultMaxDepth        = 100 // 인코딩/디코딩 기본 중첩 깊이 (Config.MaxDepth)
	DefaultMaxConcurrency  = 50

	// 보안 제한
	DefaultMaxSecuritySize   = 10 * 1024 * 1024 // 10MB
	DefaultMaxObjectKeys     = 100000
	DefaultMaxArrayElements  = 100000
	DefaultMaxBatchSize      = 2000
	DefaultParallelThreshold = 10

	// 캐시
	DefaultCacheTTL = 5 * time.Minute
)
```

### 상수와 Config 필드 대조

| 상수 | 기본값 | 대응 Config 필드 | 설명 |
|------|--------|------------------|------|
| `DefaultMaxJSONSize` | 100MB | `MaxJSONSize` | 단일 JSON 입력의 크기 상한 |
| `DefaultMaxNestingDepth` | 200 | `MaxNestingDepthSecurity` | JSON 중첩 깊이 상한 |
| `DefaultMaxPathDepth` | 50 | `MaxPathDepth` | 경로 세그먼트 수 상한 (예: `a.b.c.d...` 의 층수) |
| `DefaultMaxDepth` | 100 | `MaxDepth` | 인코딩/디코딩 (Marshal/Unmarshal) 기본 중첩 깊이 |
| `DefaultMaxConcurrency` | 50 | `MaxConcurrency` | 동시 작업 수 상한 |
| `DefaultMaxSecuritySize` | 10MB | `MaxSecurityValidationSize` | 이 크기를 초과하는 문서는 샘플링 기반 보안 검사로 전환 |
| `DefaultMaxObjectKeys` | 100000 | `MaxObjectKeys` | 객체 키 수 상한 |
| `DefaultMaxArrayElements` | 100000 | `MaxArrayElements` | 배열 요소 수 상한 |
| `DefaultMaxBatchSize` | 2000 | `MaxBatchSize` | 한 번의 `ProcessBatch` 작업 수 상한, 초과 시 `ErrSizeLimit` 반환 |
| `DefaultParallelThreshold` | 10 | `ParallelThreshold` | 병렬 처리 임계값: 작업 수가 이 값 미만이면 순차 처리 사용 |
| `DefaultCacheTTL` | 5 분 | `CacheTTL` | 캐시 항목 수명 |

## 설정 프리셋 함수

### DefaultConfig

시그니처: `func DefaultConfig() Config`

기본 설정을 반환합니다.

```go
cfg := json.DefaultConfig()
processor, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer processor.Close()
```

### SecurityConfig

시그니처: `func SecurityConfig() Config`

보안 설정을 반환하며, 신뢰할 수 없는 입력 처리에 적합합니다.

```go
// 추천 용도:
// - 공개 API 및 웹 서비스
// - 사용자가 제출한 데이터
// - 외부 Webhook
// - 인증 엔드포인트
// - 금융 데이터 처리
cfg := json.SecurityConfig()
processor, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer processor.Close()
```

**보안 설정 특징**:

- 전체 보안 스캔
- 엄격 모드
- 보수적인 제한값
- 캐시 활성화

### PrettyConfig

시그니처: `func PrettyConfig() Config`

포맷팅 출력 설정을 반환합니다.

```go
result, err := json.EncodeWithConfig(data, json.PrettyConfig())
```

## 병합 모드 상수

```go
// MergeMode 는 병합 모드 타입입니다 (internal 패키지에서 익스포트)
type MergeMode = internal.MergeMode

const (
	// MergeUnion - 합집합 병합 (기본값)
	// 객체: 모든 키를 병합하고 충돌 값은 덮어쓰는 값 사용
	// 배열: 모든 요소를 병합하고 중복 제거
	MergeUnion = internal.MergeUnion

	// MergeIntersection - 교집합 병합
	// 객체: 공통 키만 유지
	// 배열: 공통 요소만 유지
	MergeIntersection = internal.MergeIntersection

	// MergeDifference - 차집합 병합
	// 객체: 기준에만 있고 덮어쓰는 쪽에는 없는 키만 유지
	// 배열: 기준에만 있고 덮어쓰는 쪽에는 없는 요소만 유지
	MergeDifference = internal.MergeDifference
)
```

## 경로 세그먼트 타입

`PathSegment` 는 `internal` 패키지에서 익스포트한 경로 세그먼트 타입으로, 파싱된 경로의 구성 요소를 나타냅니다.

```go
type PathSegment = internal.PathSegment
```

::: warning 내부 구현 별칭
`PathSegment` 는 `internal.PathSegment` 의 타입 별칭입니다. 구체적인 필드, 필드 타입 (예: PathSegmentType, PathSegmentFlags) 과 메서드는 모두 `internal` 패키지에 속하며 **공개 API 로 익스포트되지 않았고** 버전에 따라 바뀔 수 있으므로 비즈니스 코드에서 내부 구조에 직접 의존하지 마세요.

- 커스텀 경로 문법을 구현할 때는 [`PathParser`](./interfaces#pathparser) 인터페이스의 `ParsePath` 메서드가 `[]PathSegment` 를 반환합니다.
- 사전 컴파일 경로는 [`Processor.CompilePath`](./processor/query#compilepath) 를 사용하세요. `*CompiledPath` 를 반환합니다.
:::

## 보안 패턴 수준

```go
type PatternLevel int

const (
	// PatternLevelCritical - 심각한 위험, 항상 작업 차단
	PatternLevelCritical PatternLevel = iota

	// PatternLevelWarning - 경고 수준, 엄격 모드에서 차단
	PatternLevelWarning

	// PatternLevelInfo - 정보 수준, 로그 기록만
	PatternLevelInfo
)
```

### DangerousPattern 구조

```go
type DangerousPattern struct {
	Pattern string       // 감지할 부분 문자열
	Name    string       // 사람이 읽을 수 있는 보안 위험 설명
	Level   PatternLevel // 처리 수준
}
```

## 오류 처리 모범 사례

### errors.Is 로 타입 검사

```go
result, err := json.Get(data, path)
if errors.Is(err, json.ErrPathNotFound) {
	return defaultValue
}
if errors.Is(err, json.ErrTypeMismatch) {
	return defaultValue
}
```

### errors.As 로 상세 정보 획득

```go
var jsonErr *json.JsonsError
if errors.As(err, &jsonErr) {
	log.Printf("작업 %s 가 경로 %s 에서 실패: %s",
		jsonErr.Op, jsonErr.Path, jsonErr.Message)
}
```

### 오류 래핑

```go
val := json.GetString(data, path)
if val == "" {
	return fmt.Errorf("설정 %s 조회가 빈 값을 반환", path)
}
```

## 관련 문서

- [오류 처리](../advanced/error-handling) - 고급 오류 처리 가이드
- [Config](./config) - 설정 옵션
- [보안 개요](../security/) - 보안 모범 사례
