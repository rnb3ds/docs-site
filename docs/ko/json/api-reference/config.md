---
sidebar_label: "Config"
title: "Config 설정 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON Config 설정: DefaultConfig, SecurityConfig 보안, PrettyConfig 포맷팅과 캐시, 크기 제한, 인코딩 옵션, JSONL 매개변수, Validate 자동 수정과 MergeMode 전략으로 JSON 동작을 커스터마이즈합니다."
sidebar_position: 4
---

# Config

Config 는 Processor 와 모든 JSON 작업의 동작을 커스터마이즈하는 데 사용됩니다.

## Config 구조체

```go
type Config struct {
	// ===== 캐시 설정 =====
	MaxCacheSize       int           `json:"max_cache_size"`       // 최대 캐시 항목 수
	CacheTTL           time.Duration `json:"cache_ttl"`            // 캐시 만료 시간
	EnableCache        bool          `json:"enable_cache"`         // 캐시 활성화 여부
	CacheResults       bool          `json:"cache_results"`        // 작업 결과 캐시 여부
	CacheSharedResults bool          `json:"cache_shared_results"` // 캐시 결과 공유 (방어적 깊은 복사 건너뜀, 호출자는 반환된 컨테이너를 수정하면 안 됨)

	// ===== 크기 제한 =====
	MaxJSONSize  int64 `json:"max_json_size"`  // 최대 JSON 크기 (바이트)
	MaxPathDepth int   `json:"max_path_depth"` // 최대 경로 깊이
	MaxBatchSize int   `json:"max_batch_size"` // 최대 배치 작업 수

	// ===== 보안 제한 =====
	MaxNestingDepthSecurity   int   `json:"max_nesting_depth"`            // 최대 중첩 깊이
	MaxSecurityValidationSize int64 `json:"max_security_validation_size"` // 보안 검증 최대 크기
	MaxObjectKeys             int   `json:"max_object_keys"`              // 객체 최대 키 수
	MaxArrayElements          int   `json:"max_array_elements"`           // 배열 최대 요소 수
	FullSecurityScan          bool  `json:"full_security_scan"`           // 전체 보안 스캔 활성화

	// ===== 동시성 =====
	MaxConcurrency    int `json:"max_concurrency"`    // 최대 동시성 수
	ParallelThreshold int `json:"parallel_threshold"` // 병렬 처리 임계값

	// ===== 처리 옵션 =====
	EnableValidation bool `json:"enable_validation"` // 검증 활성화
	StrictMode       bool `json:"strict_mode"`       // 엄격 모드
	CreatePaths      bool `json:"create_paths"`      // 경로 자동 생성
	CleanupNulls     bool `json:"cleanup_nulls"`     // null 값 정리
	CompactArrays    bool `json:"compact_arrays"`    // 배열 압축
	ContinueOnError  bool `json:"continue_on_error"` // 배치 작업 오류 시 계속

	// ===== 입력/출력 옵션 =====
	AllowComments    bool `json:"allow_comments"`     // 주석 허용
	PreserveNumbers  bool `json:"preserve_numbers"`   // 숫자 정밀도 유지
	ValidateInput    bool `json:"validate_input"`     // 입력 검증
	ValidateFilePath bool `json:"validate_file_path"` // 파일 경로 검증
	SkipValidation   bool `json:"skip_validation"`    // 검증 건너뜀 (신뢰할 수 있는 입력)

	// ===== 인코딩 옵션 =====
	Pretty          bool            `json:"pretty"`                   // 포맷팅 출력
	Indent          string          `json:"indent"`                   // 들여쓰기 문자열
	Prefix          string          `json:"prefix"`                   // 접두사
	EscapeHTML      bool            `json:"escape_html"`              // HTML 이스케이프
	SortKeys        bool            `json:"sort_keys"`                // 키 정렬
	ValidateUTF8    bool            `json:"validate_utf8"`            // UTF-8 검증
	MaxDepth        int             `json:"max_depth"`                // 최대 인코딩 깊이
	DisallowUnknown bool            `json:"disallow_unknown"`         // 알 수 없는 필드 금지
	FloatPrecision  int             `json:"float_precision"`          // 부동소수점 정밀도 (-1 은 자동)
	FloatTruncate   bool            `json:"float_truncate"`           // 부동소수점 절단
	DisableEscaping bool            `json:"disable_escaping"`         // 이스케이프 비활성화
	EscapeUnicode   bool            `json:"escape_unicode"`           // Unicode 이스케이프
	EscapeSlash     bool            `json:"escape_slash"`             // 슬래시 이스케이프
	EscapeNewlines  bool            `json:"escape_newlines"`          // 개행 문자 이스케이프
	EscapeTabs      bool            `json:"escape_tabs"`              // 탭 문자 이스케이프
	IncludeNulls    bool            `json:"include_nulls"`            // null 값 포함
	CustomEscapes   map[rune]string `json:"custom_escapes,omitempty"` // 사용자 정의 이스케이프 매핑

	// ===== 관측 가능성 =====
	EnableMetrics     bool `json:"enable_metrics"`      // 메트릭 수집 활성화
	EnableHealthCheck bool `json:"enable_health_check"` // 헬스 체크 활성화

	// ===== 대용량 파일 처리 =====
	ChunkSize       int64 `json:"chunk_size"`       // 청크 크기
	MaxMemory       int64 `json:"max_memory"`       // 최대 메모리 사용
	BufferSize      int   `json:"buffer_size"`      // 버퍼 크기
	SamplingEnabled bool  `json:"sampling_enabled"` // 샘플링 활성화
	SampleSize      int   `json:"sample_size"`      // 샘플 수

	// ===== JSONL 설정 =====
	JSONLBufferSize    int   `json:"jsonl_buffer_size"`     // JSONL 버퍼 크기
	JSONLMaxLineSize   int   `json:"jsonl_max_line_size"`   // JSONL 최대 줄 크기
	JSONLSkipEmpty     bool  `json:"jsonl_skip_empty"`      // 빈 줄 건너뜀
	JSONLSkipComments  bool  `json:"jsonl_skip_comments"`   // 주석 줄 건너뜀
	JSONLContinueOnErr bool  `json:"jsonl_continue_on_err"` // 오류 시 계속
	JSONLWorkers       int   `json:"jsonl_workers"`         // JSONL 병렬 워커 수
	JSONLChunkSize     int   `json:"jsonl_chunk_size"`      // JSONL 청크 크기
	JSONLMaxMemory     int64 `json:"jsonl_max_memory"`      // JSONL 최대 메모리

	// ===== 병합 옵션 =====
	MergeMode MergeMode `json:"merge_mode"` // 병합 전략

	// ===== 확장 지점 (JSON tag 없음, 직렬화에 참여하지 않음) =====
	CustomEncoder               CustomEncoder                // 커스텀 인코더
	CustomTypeEncoders          map[reflect.Type]TypeEncoder // 커스텀 타입 인코더
	CustomValidators            []Validator                  // 커스텀 검증기
	AdditionalDangerousPatterns []DangerousPattern           // 추가 위험 패턴
	DisableDefaultPatterns      bool                         // 기본 경고 수준 패턴 비활성화
	Hooks                       []Hook                       // 작업 훅
	CustomPathParser            PathParser                   // 커스텀 경로 파서
}
```

::: warning CacheSharedResults 계약
`CacheSharedResults` 가 `true` 이면 캐시 적중된 `Get`/`GetFromParsed` 는 **캐시 값을 직접 반환**하고 방어적 깊은 복사를 건너뜁니다 (더 빠르고 할당이 적음). 이때 **호출자는 반환된** `map[string]any`/`[]any` **를 수정하면 안 되며**, 어기면 공유 캐시가 훼손되어 이후 읽기에 영향을 줍니다; 원시 값 (`bool`, `float64`, `string`, `json.Number`, `nil`) 은 불변이므로 항상 안전합니다. 기본값 `false` 는 안전한 '읽을 때 복사' 동작을 유지하며, 호출자가 결과를 읽기 전용으로 취급할 때만 활성화하세요 (예: 같은 대형 하위 트리를 반복해서 읽는 읽기 전용 워크로드).
:::

::: warning 확장 필드 연결 상태
`CustomEncoder`, `CustomTypeEncoders`, `CustomValidators`, `CustomPathParser` 네 인터페이스 필드는 현재 버전에서 선언만 되어 있고 인코딩/작업 파이프라인에 **아직 연결되지 않았으므로** 설정해도 효과가 없으며, 미래 버전을 위한 예약 인터페이스입니다 (`CustomPathParser` 는 프로세서 캐시 키의 '설정 여부' 판정에 참여하지만, 경로 파싱 자체는 여전히 내장 파서를 사용). 현재 사용 가능한 대안:

- 인코딩 동작 미세 조정 → `CustomEscapes` (**이미 적용됨**, 아래 인코딩 옵션 참조) 또는 `json.Marshaler`/`encoding.TextMarshaler` 구현 ([커스텀 인코더](../extensions/custom-encoder) 참조)
- 작업 가로채기 → `Hooks` + `AddHook` (**이미 적용됨**, [Hook 시스템](../extensions/hooks) 참조)
- 입력 검증 → `ValidateSchema` ([Schema 검증](./schema) 참조)
:::

## Config 필드 총람

`Config` 는 익스포트된 필드 66 개를 가지며, 용도별로 다음과 같이 묶습니다. 기본값은 [`DefaultConfig()`](#defaultconfig) 기준이며, 필드의 유효 범위와 자동 수정 규칙은 [클램핑 범위 빠른 참조](#validatewithwarnings) 를 참조하세요.

### 캐시

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `MaxCacheSize` | `int` | 128 | 최대 캐시 항목 수 (0 은 캐시 비활성화) |
| `CacheTTL` | `time.Duration` | 5 분 | 캐시 항목 수명 |
| `EnableCache` | `bool` | true | 캐시 활성화 여부 |
| `CacheResults` | `bool` | true | 작업 결과 캐시 여부 (작업별 캐시) |
| `CacheSharedResults` | `bool` | false | 캐시 적중 시 공유 값을 직접 반환해 방어적 깊은 복사 건너뜀; 호출자는 반환된 컨테이너를 수정하면 안 됨 (계약은 위 경고 참조) |

### 크기 제한

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `MaxJSONSize` | `int64` | 100MB | 최대 JSON 입력 크기 (바이트) |
| `MaxPathDepth` | `int` | 50 | 최대 경로 깊이 |
| `MaxBatchSize` | `int` | 2000 | 한 번의 배치 작업 수 상한 (초과 시 거부, 메모리 고갈 방지) |

### 보안 제한

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `MaxNestingDepthSecurity` | `int` | 200 | 최대 중첩 깊이 |
| `MaxSecurityValidationSize` | `int64` | 10MB | 보안 검증 최대 크기 (초과 시 `FullSecurityScan` 이 true 인 경우가 아니면 샘플링 전략으로 스캔) |
| `MaxObjectKeys` | `int` | 100000 | 단일 객체 최대 키 수 |
| `MaxArrayElements` | `int` | 100000 | 단일 배열 최대 요소 수 |
| `FullSecurityScan` | `bool` | false | true 면 모든 입력에 전체 (샘플링 아님) 보안 스캔; false 면 대형 입력 (>4KB) 은 롤링 윈도우+샘플링 스캔을 사용하고 핵심 패턴 (`__proto__` 등) 은 여전히 전체 스캔 |

### 동시성

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `MaxConcurrency` | `int` | 50 | 최대 동시성 수 |
| `ParallelThreshold` | `int` | 10 | 병렬 처리 임계값 (이 요소 수 미만이면 순차 처리로 전환) |

### 처리 옵션

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `EnableValidation` | `bool` | true | 입력 검증 활성화 |
| `StrictMode` | `bool` | false | 엄격 모드 (더 보수적인 파싱과 차단) |
| `CreatePaths` | `bool` | true | Set 시 누락된 중간 경로 자동 생성 |
| `CleanupNulls` | `bool` | false | null 값 정리 |
| `CompactArrays` | `bool` | false | 배열 압축 |
| `ContinueOnError` | `bool` | false | 배치 작업에서 한 항목이 실패해도 계속 진행 |

### 입력/출력 옵션

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `AllowComments` | `bool` | false | 주석 허용 (예약 필드, 현재 동작을 바꾸지 않음) |
| `PreserveNumbers` | `bool` | false | 디코딩 시 숫자 리터럴 유지 (`1.10` 이 `1.1` 로 바뀌지 않음), 인코딩 시 그대로 다시 기록 |
| `ValidateInput` | `bool` | true | 입력 JSON 검증 |
| `ValidateFilePath` | `bool` | true | 파일 경로 검증 |
| `SkipValidation` | `bool` | false | 불필요한 검증 건너뜀 (신뢰할 수 있는 입력 전용) |

### 인코딩 옵션

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `Pretty` | `bool` | false | 포맷팅 출력 |
| `Indent` | `string` | "  " (공백 2 칸) | 들여쓰기 문자열 |
| `Prefix` | `string` | "" (빈 문자열) | 줄마다 붙는 접두사 |
| `EscapeHTML` | `bool` | true | HTML 문자 이스케이프 (`<` `>` `&`) |
| `SortKeys` | `bool` | false | 객체 키 정렬 출력 |
| `ValidateUTF8` | `bool` | true | UTF-8 검증 (예약 필드, 현재 동작을 바꾸지 않음) |
| `MaxDepth` | `int` | 100 | 인코딩 최대 깊이 (0 은 무제한) |
| `DisallowUnknown` | `bool` | false | 디코딩 시 알 수 없는 필드 금지 (`Decoder.DisallowUnknownFields()` 와 동등) |
| `FloatPrecision` | `int` | -1 | 부동소수점 정밀도 (-1 자동; 0–15 명시적 정밀도) |
| `FloatTruncate` | `bool` | false | 정밀도 적용 시 반올림 대신 직접 절단 |
| `DisableEscaping` | `bool` | false | 이스케이프 로직 비활성화 (완전히 제어되는 출력에만 사용) |
| `EscapeUnicode` | `bool` | false | 비 ASCII 문자를 `\uXXXX` 로 이스케이프 |
| `EscapeSlash` | `bool` | false | `/` 를 `\/` 로 이스케이프 |
| `EscapeNewlines` | `bool` | true | 개행 문자 이스케이프 |
| `EscapeTabs` | `bool` | true | 탭 문자 이스케이프 |
| `IncludeNulls` | `bool` | true | 인코딩 시 값이 null 인 필드 포함 |
| `CustomEscapes` | `map[rune]string` | nil | 사용자 정의 문자 이스케이프 매핑 |

### 관측 가능성

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `EnableMetrics` | `bool` | false | 메트릭 수집 활성화 (`GetStats` / `GetHealthStatus` 에 데이터가 생김) |
| `EnableHealthCheck` | `bool` | false | 헬스 체크 활성화 (예약 필드, 현재 동작을 바꾸지 않음) |

### 대용량 파일 처리 (샘플링과 스트리밍)

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `ChunkSize` | `int64` | 1MB | 대용량 파일 청크 크기 |
| `MaxMemory` | `int64` | 100MB | 대용량 파일 처리 최대 메모리 |
| `BufferSize` | `int` | 64KB | 대용량 파일 읽기 버퍼 크기 |
| `SamplingEnabled` | `bool` | true | 샘플링 활성화 (예약 필드, 현재 동작을 바꾸지 않음) |
| `SampleSize` | `int` | 1000 | 샘플 수 |

### JSONL 설정

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `JSONLBufferSize` | `int` | 64KB | JSONL 읽기 버퍼 크기 |
| `JSONLMaxLineSize` | `int` | 1MB | JSONL 한 줄 최대 크기 |
| `JSONLSkipEmpty` | `bool` | true | 빈 줄 건너뜀 |
| `JSONLSkipComments` | `bool` | false | `#` / `//` 주석 줄 건너뜀 |
| `JSONLContinueOnErr` | `bool` | false | 파싱 오류 시 이후 줄 계속 처리 |
| `JSONLWorkers` | `int` | 4 | JSONL 병렬 worker 수 |
| `JSONLChunkSize` | `int` | 1000 | 배치 처리 청크 크기 (줄 수) |
| `JSONLMaxMemory` | `int64` | 100MB | JSONL 처리 최대 메모리 |

### 병합 옵션

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `MergeMode` | `MergeMode` | MergeUnion | `MergeJSON` / `MergeMany` 의 병합 전략 ([병합 모드](#병합-모드) 참조) |

### 확장 지점

다음 필드는 JSON tag 가 없고 직렬화에 참여하지 않습니다; 연결 상태는 위 경고를 참조하세요.

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `CustomEncoder` | `CustomEncoder` | nil | 커스텀 인코더, 기본 인코더를 교체 (예약) |
| `CustomTypeEncoders` | `map[reflect.Type]TypeEncoder` | nil | Go 타입별로 등록하는 인코더 (예약) |
| `CustomValidators` | `[]Validator` | nil | 작업 전에 실행되는 커스텀 검증기 (예약) |
| `AdditionalDangerousPatterns` | `[]DangerousPattern` | nil | 내장 패턴 외에 추가로 등록하는 위험 패턴 |
| `DisableDefaultPatterns` | `bool` | false | 내장 경고 수준 패턴 비활성화 (핵심 패턴은 항상 강제 적용되어 비활성화 불가) |
| `Hooks` | `[]Hook` | nil | 작업 전후 훅 (이미 적용됨) |
| `CustomPathParser` | `PathParser` | nil | 커스텀 경로 파서 (예약) |

## 인코딩 옵션 상세

인코딩 옵션 (`Pretty`/`Indent`/`EscapeHTML`/`SortKeys`/`FloatPrecision` 등) 은 `Marshal`/`Encode` 계열의 출력 형태를 제어합니다. 기본값은 표준 라이브러리와 정렬됩니다 (예: `EscapeHTML: true`, `IncludeNulls: true`); '기본이 아닌' 인코딩 옵션 중 하나라도 설정하면 라이브러리 내부에서 요구 사항을 충족하기 위해 자동으로 커스텀 인코더 경로로 전환되므로 수동 개입이 필요 없습니다.

### 키 정렬 (SortKeys)

```go
cfg := json.DefaultConfig()
cfg.SortKeys = true
s, _ := json.EncodeWithConfig(map[string]any{"b": 2, "a": 1}, cfg)
// 출력: {"a":1,"b":2} — 출력 키 순서가 안정적이어서 비교와 테스트에 편리
```

### 부동소수점 정밀도 (FloatPrecision / FloatTruncate)

```go
cfg := json.DefaultConfig()
cfg.FloatPrecision = 2 // -1 (기본값) = 자동 정밀도
s, _ := json.EncodeWithConfig(3.14159265, cfg)
// 출력: 3.14
```

`FloatTruncate` 는 `FloatPrecision` 이 적용될 때의 반올림 방식을 제어합니다: 기본값 (`false`) 은 표준 반올림이며, `true` 로 두면 **직접 절단**으로 바뀝니다 — `3.999` 는 정밀도 2 에서 `3.99` 를 출력합니다 (반올림이면 `4.00`). `FloatPrecision >= 0` 일 때만 인코딩에 참여합니다.

### 사용자 정의 문자 이스케이프 (CustomEscapes)

```go
cfg := json.DefaultConfig()
cfg.CustomEscapes = map[rune]string{
	'<': "&lt;",
}
s, _ := json.EncodeWithConfig("<a>", cfg)
// 출력: "&lt;a>"
```

### 자주 쓰는 스위치 빠른 참조

| 옵션 | 기본값 | 반전/true 설정 시 효과 |
|------|------|-------------------|
| `EscapeHTML` | `true` | `false` 면 `<` `>` `&` 를 이스케이프하지 않음 |
| `EscapeUnicode` | `false` | `true` 면 비 ASCII 문자를 `\uXXXX` 로 이스케이프 |
| `EscapeSlash` | `false` | `true` 면 `/` 를 `\/` 로 이스케이프 |
| `EscapeNewlines` / `EscapeTabs` | `true` | `false` 면 제어 문자가 그대로 출력됨 (JSONL 친화적 텍스트 생성 시 주의) |
| `DisableEscaping` | `false` | `true` 면 이스케이프 로직을 건너뜀 (완전히 제어되는 출력에만 사용) |
| `IncludeNulls` | `true` | `false` 면 값이 `null` 인 필드를 인코딩에서 생략 |
| `PreserveNumbers` | `false` | `true` 면 디코딩 시 숫자 리터럴을 유지 (`1.10` 이 `1.1` 로 바뀌지 않음), 인코딩 시 그대로 다시 기록 |

## 입력과 관측 가능성 스위치

다음 필드는 디코딩 엄격함과 런타임 관측을 제어합니다 (기본값은 [`DefaultConfig`](#defaultconfig) 참조):

| 필드 | 기본값 | 적용 범위 | 설명 |
|------|------|----------|------|
| `DisallowUnknown` | `false` | `NewDecoder(r, cfg)` | `true` 면 반환된 Decoder 에 `DisallowUnknownFields()` 를 호출한 것과 동등하며, 디코딩 중 알 수 없는 필드를 만나면 오류 |
| `ValidateUTF8` | `true` | 예약 | 현재 동작을 바꾸지 않음 (아래 설명 참조) |
| `AllowComments` | `false` | 예약 | 현재 동작을 바꾸지 않음 (아래 설명 참조) |
| `EnableMetrics` | `false` | `New(cfg)` 생성 시 | `true` 면 메트릭 수집기를 생성하여 `GetStats` 의 작업/오류 카운트와 `GetHealthStatus` 의 항목별 검사에 데이터가 생김 |
| `EnableHealthCheck` | `false` | 예약 | 현재 동작을 바꾸지 않음 (아래 설명 참조) |
| `SamplingEnabled` | `true` | 예약 | 현재 동작을 바꾸지 않음 (아래 설명 참조) |

::: warning 예약 필드 안내
`AllowComments`, `ValidateUTF8`, `EnableHealthCheck`, `SamplingEnabled` 네 필드는 선언되어 있고 설정 비교와 해시에 참여하지만 (따라서 서로 다른 cfg 에 대응하는 프로세서 캐시가 구분됩니다) 현재 버전에서는 **해당 파이프라인에서 읽히지 않아** 설정해도 동작이 바뀌지 않습니다:

- `AllowComments`: 파싱이 `//` 또는 `#` 주석을 받아들이게 하지 않습니다; JSONL 파일의 주석 줄은 `JSONLSkipComments` 로 별도 제어됩니다.
- `ValidateUTF8`: 입력 측에서 유효하지 않은 UTF-8 을 거부하는 것은 보안 검증의 무조건적 동작이며, 출력 측은 표준 라이브러리 의미 체계에 따라 처리되므로 이 스위치의 영향을 받지 않습니다.
- `EnableHealthCheck`: 헬스 체크는 `GetHealthStatus` 로 필요할 때 바로 조회하며, 데이터 유무는 `EnableMetrics` 에 달려 있습니다 ([수명 주기와 통계](./processor/lifecycle#상태-확인) 참조).
- `SamplingEnabled`: 대형 입력의 보안 스캔 샘플링 여부는 `FullSecurityScan` 과 `MaxSecurityValidationSize` 가 결정합니다.
:::

## 설정 프리셋

### DefaultConfig

시그니처: `func DefaultConfig() Config`

기본 설정을 반환하며, 대부분의 시나리오에 적합합니다.

```go
cfg := json.DefaultConfig()
processor, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer processor.Close()
```

**기본값**

| 필드 | 값 | 설명 |
|------|-----|------|
| MaxJSONSize | 100MB | JSON 크기 제한 |
| MaxNestingDepthSecurity | 200 | 중첩 깊이 |
| MaxPathDepth | 50 | 경로 깊이 |
| MaxSecurityValidationSize | 10MB | 보안 검증 크기 상한 |
| MaxObjectKeys | 100000 | 객체 최대 키 수 |
| MaxArrayElements | 100000 | 배열 최대 요소 수 |
| MaxConcurrency | 50 | 동시성 수 |
| ParallelThreshold | 10 | 이 요소 수 미만이면 순차 처리로 전환 |
| MaxBatchSize | 2000 | 배치 작업 수 |
| CacheTTL | 5 분 | 캐시 만료 |
| MaxCacheSize | 128 | 최대 캐시 항목 수 |
| EnableCache | true | 캐시 활성화 |
| CacheResults | true | 작업 결과 캐시 |
| CacheSharedResults | false | 캐시 결과 공유 (고성능 읽기 전용 시나리오) |
| EnableValidation | true | 검증 활성화 |
| StrictMode | false | 비엄격 모드 |
| FullSecurityScan | false | 샘플링 보안 스캔 (전체 아님) |
| ValidateInput | true | 입력 검증 |
| ValidateFilePath | true | 파일 경로 검증 |
| CreatePaths | true | 경로 자동 생성 |
| Pretty | false | 포맷팅 출력 안 함 |
| EscapeHTML | true | HTML 이스케이프 |
| ValidateUTF8 | true | UTF-8 검증 |
| IncludeNulls | true | null 포함 |
| EscapeNewlines | true | 개행 문자 이스케이프 |
| EscapeTabs | true | 탭 문자 이스케이프 |
| FloatPrecision | -1 | 자동 정밀도 |
| MaxDepth | 100 | 인코딩 깊이 |
| Indent | "  " | 기본 들여쓰기 |
| ChunkSize | 1MB | 청크 크기 |
| MaxMemory | 100MB | 최대 메모리 |
| BufferSize | 64KB | 버퍼 크기 |
| SamplingEnabled | true | 샘플링 활성화 |
| SampleSize | 1000 | 샘플 수 |
| JSONLBufferSize | 64KB | JSONL 버퍼 크기 |
| JSONLMaxLineSize | 1MB | JSONL 최대 줄 크기 |
| JSONLSkipEmpty | true | 빈 줄 건너뜀 |
| JSONLSkipComments | false | 주석 건너뛰지 않음 |
| JSONLContinueOnErr | false | 오류 시 중지 |
| JSONLWorkers | 4 | 병렬 워커 수 |
| JSONLChunkSize | 1000 | JSONL 청크 크기 |
| JSONLMaxMemory | 100MB | JSONL 최대 메모리 |
| MergeMode | MergeUnion | 합집합 병합 |

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

**보안 설정 특징**

| 필드 | 값 | 설명 |
|------|-----|------|
| MaxNestingDepthSecurity | 30 | 보수적 중첩 깊이 |
| MaxSecurityValidationSize | 10MB | 보안 검증 크기 |
| MaxObjectKeys | 5000 | 보수적 키 수 제한 |
| MaxArrayElements | 5000 | 보수적 요소 제한 |
| MaxJSONSize | 10MB | 보수적 크기 제한 |
| MaxPathDepth | 30 | 보수적 경로 깊이 |
| FullSecurityScan | true | 전체 보안 스캔 |
| StrictMode | true | 엄격 모드 |
| EnableValidation | true | 검증 활성화 |
| EnableCache | true | 캐시 활성화 |
| MaxCacheSize | 256 | 캐시 크기 |
| CacheTTL | 3 분 | 짧은 TTL |

### PrettyConfig

시그니처: `func PrettyConfig() Config`

포맷팅 출력 설정을 반환합니다.

```go
result, err := json.EncodeWithConfig(data, json.PrettyConfig())
```

## 설정 메서드

### Clone

시그니처: `func (c *Config) Clone() *Config`

설정을 깊은 복사합니다 (`Config.Clone` 은 새 `*Config` 를 반환하며, 사본을 수정해도 원본 설정에 영향을 주지 않습니다). 값 필드는 하나씩 복사됩니다; 참조 필드 중 `CustomEscapes`, `CustomTypeEncoders` 두 map 과 `CustomValidators`, `AdditionalDangerousPatterns`, `Hooks` 세 슬라이스는 깊은 복사되어 독립적으로 수정할 수 있습니다; 인터페이스 필드 (`CustomEncoder`, `CustomPathParser`) 는 얕은 복사입니다 (보통 무상태 또는 싱글턴 구현). nil Config 에 호출하면 nil 을 반환합니다.

```go
cfg := json.DefaultConfig()
cfgCopy := cfg.Clone()
cfgCopy.EnableValidation = true // 원본 설정에 영향 없음
```

### Validate

시그니처: `func (c *Config) Validate() error`

설정을 검증하고 유효하지 않은 값을 자동 수정합니다. 이 메서드는 Config 를 **제자리에서 수정**하며, 잘못된 필드를 유효 범위로 교정합니다: 너무 작으면 (≤0) 최솟값, 너무 크면 (상한 초과) 최댓값을 사용합니다. nil Config 에 호출하면 오류를 반환합니다. 교정 후에는 항상 nil 을 반환합니다 — 무엇이 교정되었는지 확인하려면 `ValidateWithWarnings` 를 사용하세요.

```go
cfg := json.DefaultConfig()
cfg.MaxJSONSize = -1 // 유효하지 않은 값
if err := cfg.Validate(); err != nil {
	panic(err)
}
// MaxJSONSize 는 제자리에서 최솟값으로 교정됨
```

### ValidateWithWarnings

시그니처: `func (c *Config) ValidateWithWarnings() []ConfigWarning`

설정을 검증하고 수정 경고 목록을 반환합니다.

```go
cfg := json.DefaultConfig()
cfg.MaxJSONSize = -1
warnings := cfg.ValidateWithWarnings()
for _, w := range warnings {
	fmt.Printf("%s: %s\n", w.Field, w.Reason)
}
```

**클램핑 범위 빠른 참조** (`Validate`/`ValidateWithWarnings` 의 자동 수정 규칙, ≤0 은 무효로 간주해 하한 적용, 상한 초과 시 상한 적용):

| 필드 | 유효 범위 (하한–상한) | 비고 |
|------|----------------------|------|
| `MaxJSONSize` | 1MB – 100MB | int64 |
| `MaxPathDepth` | 10 – 200 | |
| `MaxNestingDepthSecurity` | 10 – 200 | |
| `MaxConcurrency` | 1 – 200 | |
| `ParallelThreshold` | 1 – 50 | |
| `MaxObjectKeys` | 100 – 100000 | |
| `MaxArrayElements` | 100 – 100000 | |
| `MaxSecurityValidationSize` | 1MB – 100MB | int64 |
| `MaxBatchSize` | 10 – 10000 | |
| `MaxCacheSize` | 0 – 2000 (음수만 무효로 간주) | 음수면 0 으로 두고 **동시에 EnableCache 도 끔** (0 은 캐시 비활성화를 의미하며 합법) |
| `CacheTTL` | ≤0 은 무효, `DefaultCacheTTL` (5 분) 로 재설정 | |
| `MaxDepth` | [0, 1000], 범위를 벗어나면 100 으로 재설정 | 0 은 깊이 무제한, 음수는 무효 |
| `FloatPrecision` | [-1, 15], 범위를 벗어나면 -1 로 재설정 | -1 은 자동 정밀도 센티널 값 |
| `ChunkSize` | 64KB – 100MB | |
| `MaxMemory` | 10MB – 1GB | |
| `BufferSize` | 4KB – 1MB | |
| `SampleSize` | 100 – 10000 | |
| `JSONLBufferSize` | 4KB – 1MB | |
| `JSONLMaxLineSize` | 1KB – 100MB | |
| `JSONLWorkers` | 1 – 64 | |
| `JSONLChunkSize` | 100 – 10000 | |
| `JSONLMaxMemory` | 10MB – 1GB | int64 |

### ConfigWarning 타입

`ConfigWarning` 은 설정 검증 중 자동 수정된 정보를 나타냅니다.

```go
type ConfigWarning struct {
	Field    string // 수정된 필드명
	OldValue any    // 원래 값 (유효하지 않은 값은 nil 일 수 있음)
	NewValue any    // 수정된 값
	Reason   string // 수정 사유
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `Field` | `string` | 수정된 필드명 (예: `MaxJSONSize`) |
| `OldValue` | `any` | 수정 전 값 (유효하지 않은 값은 nil 일 수 있음) |
| `NewValue` | `any` | 수정된 값 |
| `Reason` | `string` | 수정 사유 (예: 하한 미달, 상한 초과) |

### SecurityLimits 타입

`SecurityLimits` 는 Config 의 보안 관련 제한 필드를 모아둔 것입니다.

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

| 필드 | 타입 | 설명 |
|------|------|------|
| `MaxNestingDepth` | `int` | 최대 중첩 깊이 (`Config.MaxNestingDepthSecurity` 에 대응) |
| `MaxSecurityValidationSize` | `int64` | 보안 검증 최대 크기 (`Config.MaxSecurityValidationSize` 에 대응) |
| `MaxObjectKeys` | `int` | 객체 최대 키 수 (`Config.MaxObjectKeys` 에 대응) |
| `MaxArrayElements` | `int` | 배열 최대 요소 수 (`Config.MaxArrayElements` 에 대응) |
| `MaxJSONSize` | `int64` | 최대 JSON 크기 (`Config.MaxJSONSize` 에 대응) |
| `MaxPathDepth` | `int` | 최대 경로 깊이 (`Config.MaxPathDepth` 에 대응) |

### AddHook

시그니처: `func (c *Config) AddHook(hook Hook)`

작업 훅을 추가합니다.

```go
cfg := json.DefaultConfig()
cfg.AddHook(json.LoggingHook(slog.Default()))
```

### AddValidator

시그니처: `func (c *Config) AddValidator(validator Validator)`

커스텀 검증기를 추가합니다.

```go
cfg := json.DefaultConfig()
cfg.AddValidator(&MyValidator{})
```

### AddDangerousPattern

시그니처: `func (c *Config) AddDangerousPattern(pattern DangerousPattern)`

추가 보안 패턴을 등록합니다.

```go
cfg := json.DefaultConfig()
cfg.AddDangerousPattern(json.DangerousPattern{
	Pattern: "eval(",
	Name:    "eval-call",
	Level:   json.PatternLevelCritical,
})
```

## 사용 예제

### 기본 사용

```go
cfg := json.DefaultConfig()
processor, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer processor.Close()
```

### 보안 설정

```go
// 신뢰할 수 없는 입력 처리
cfg := json.SecurityConfig()
processor, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer processor.Close()
```

### 포맷팅 출력

```go
// JSON 포맷팅
result, err := json.EncodeWithConfig(data, json.PrettyConfig())
```

### 커스텀 설정

```go
cfg := json.DefaultConfig()

// 보안 설정
cfg.MaxJSONSize = 10 * 1024 * 1024 // 10MB
cfg.MaxNestingDepthSecurity = 50
cfg.EnableValidation = true

// 훅
cfg.Hooks = []json.Hook{json.LoggingHook(slog.Default())}

// 검증기
cfg.CustomValidators = []json.Validator{&MyValidator{}}

processor, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer processor.Close()
```

### 복제와 수정

```go
// 기본 설정 기반으로 변형 생성
base := json.DefaultConfig()

// 변형 1: 개발 설정
devCfg := base.Clone()
devCfg.EnableMetrics = true

// 변형 2: 프로덕션 설정
prodCfg := base.Clone()
prodCfg.EnableValidation = true
```

## 설정 상수

```go
const (
	// 크기 제한
	DefaultMaxJSONSize       = 100 * 1024 * 1024 // 100MB
	DefaultMaxNestingDepth   = 200
	DefaultMaxPathDepth      = 50
	DefaultMaxDepth          = 100 // 인코딩/디코딩 기본 중첩 깊이 (Config.MaxDepth)
	DefaultMaxConcurrency    = 50
	DefaultMaxBatchSize      = 2000
	DefaultMaxSecuritySize   = 10 * 1024 * 1024 // 10MB
	DefaultMaxObjectKeys     = 100000
	DefaultMaxArrayElements  = 100000
	DefaultParallelThreshold = 10

	// 캐시
	DefaultCacheTTL = 5 * time.Minute
)
```

::: info 내부 상수
경로 검증 길이 제한 (`maxPathLength`) 등의 상수는 내부 구현으로 전환되어 더 이상 공개 API 로 익스포트되지 않습니다. 관련 기본값은 `Config` 구조체의 필드 기본값으로 반영됩니다.
:::

---

## 병합 모드

`MergeMode` 는 `MergeJSON` 과 `MergeMany` 함수의 병합 전략을 제어합니다.

`MergeMode` 는 `fmt.Stringer` 를 구현합니다: `func (m MergeMode) String() string` 은 `"union"` / `"intersection"` / `"difference"` 를 반환합니다 (알 수 없는 값은 `"unknown(N)"`), 로그와 디버깅 출력에 편리합니다.

| 상수 | 값 | `String()` 반환 |
|------|----|-----------------|
| `MergeUnion` | 0 | `"union"` |
| `MergeIntersection` | 1 | `"intersection"` |
| `MergeDifference` | 2 | `"difference"` |

### MergeUnion (기본값)

모든 키/요소를 병합하며, 충돌 시 덮어쓰는 값을 사용합니다.

```go
cfg := json.DefaultConfig()
cfg.MergeMode = json.MergeUnion
result, err := json.MergeJSON(
	`{"a": 1, "b": 2}`,
	`{"b": 3, "c": 4}`,
	cfg,
)
// 결과: {"a": 1, "b": 3, "c": 4}
```

### MergeIntersection

두 객체에 모두 존재하는 키만 유지합니다.

```go
cfg := json.DefaultConfig()
cfg.MergeMode = json.MergeIntersection
result, err := json.MergeJSON(
	`{"a": 1, "b": 2}`,
	`{"b": 3, "c": 4}`,
	cfg,
)
// 결과: {"b": 3}
```

### MergeDifference

기준 객체에는 있지만 덮어쓰는 객체에는 없는 키만 유지합니다.

```go
cfg := json.DefaultConfig()
cfg.MergeMode = json.MergeDifference
result, err := json.MergeJSON(
	`{"a": 1, "b": 2}`,
	`{"b": 3, "c": 4}`,
	cfg,
)
// 결과: {"a": 1}
```

---

## 보안 권장 사항

| 설정 항목 | 권장값 | 설명 |
|--------|--------|------|
| MaxJSONSize | 10-100MB | 서버 메모리에 맞게 조정 |
| MaxNestingDepthSecurity | 30-50 | 깊은 중첩 공격 방지 |
| MaxPathDepth | 30-50 | 경로 복잡도 제한 |
| EnableValidation | true | 항상 활성화 |
| FullSecurityScan | true (신뢰할 수 없는 입력) | 전체 보안 스캔 |

## 관련 문서

- [Processor](./processor/) - 프로세서 메서드
- [상수 및 오류](./constants) - 설정 상수
- [보안 개요](../security/) - 보안 모범 사례
- [인터페이스 정의](./interfaces) - 확장 인터페이스
