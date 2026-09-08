---
sidebar_label: "인터페이스 정의"
title: "인터페이스 정의 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON 확장 인터페이스: CustomEncoder, TypeEncoder, Validator, Hook, PathParser 와 DangerousPattern, HookContext 와 기본 제공 훅으로 인코딩, 검증, 보안 방어 능력을 유연하게 확장합니다."
sidebar_position: 6
---

# 인터페이스 정의

json 패키지는 여러 확장 인터페이스를 제공하여 JSON 처리 동작을 커스터마이즈할 수 있습니다.

## 인코더 인터페이스

::: warning 연결되지 않은 확장 필드
`CustomEncoder` 와 `TypeEncoder` 인터페이스는 현재 버전에서 **선언만 되어 있고 인코딩 파이프라인에 아직 연결되지 않았습니다**. `Config.CustomEncoder` / `Config.CustomTypeEncoders` 로 설정해도 효과가 없으며, 미래 버전을 위한 예약입니다. 현재 사용 가능한 인코딩 커스터마이즈 방법은 `json.Marshaler` 또는 `encoding.TextMarshaler` 인터페이스 구현입니다 ([커스텀 인코더](../extensions/custom-encoder) 참조).
:::

### CustomEncoder

커스텀 JSON 인코더 인터페이스.

```go
type CustomEncoder interface {
	// Encode 는 Go 값을 JSON 문자열로 변환합니다
	Encode(value any) (string, error)
}
```

**사용 예제**

```go
import stdjson "encoding/json"

type UpperCaseEncoder struct{}

func (e *UpperCaseEncoder) Encode(value any) (string, error) {
    // 커스텀 인코딩 로직
    switch v := value.(type) {
    case string:
        return fmt.Sprintf(`"%s"`, strings.ToUpper(v)), nil
    default:
        // 표준 인코딩 사용 (무한 재귀 방지)
        data, err := stdjson.Marshal(v)
        if err != nil {
            return "", err
        }
        return string(data), nil
    }
}

// 설정에 사용
cfg := json.DefaultConfig()
cfg.CustomEncoder = &UpperCaseEncoder{}
processor, err := json.New(cfg)
if err != nil {
    panic(err)
}
```

### TypeEncoder

특정 타입용 인코더 인터페이스.

```go
type TypeEncoder interface {
	// Encode 는 특정 타입의 값을 JSON 문자열로 인코딩합니다
	Encode(v reflect.Value) (string, error)
}
```

**사용 예제**

```go
type TimeEncoder struct{}

func (e *TimeEncoder) Encode(v reflect.Value) (string, error) {
    if v.Type() == reflect.TypeOf(time.Time{}) {
        t := v.Interface().(time.Time)
        return fmt.Sprintf(`"%s"`, t.Format(time.RFC3339)), nil
    }
    return "", fmt.Errorf("지원하지 않는 타입: %v", v.Type())
}

// 타입 인코더 등록
cfg := json.DefaultConfig()
cfg.CustomTypeEncoders = map[reflect.Type]json.TypeEncoder{
    reflect.TypeOf(time.Time{}): &TimeEncoder{},
}
processor, err := json.New(cfg)
if err != nil {
    panic(err)
}
```

## 검증기 인터페이스

::: warning 연결되지 않은 확장 필드
`Validator` 인터페이스는 현재 버전에서 **선언만 되어 있고 작업 파이프라인에 아직 연결되지 않았습니다**. `Config.CustomValidators` 또는 `Config.AddValidator()` 로 설정해도 효과가 없으며, 미래 버전을 위한 예약입니다. 현재 사용 가능한 검증 방법은 `ValidateSchema` 입니다 ([Schema 검증](./schema) 참조).
:::

### Validator

JSON 검증기 인터페이스.

```go
type Validator interface {
	// Validate 는 JSON 문자열에 문제가 있는지 검사합니다
	// 유효하면 nil, 그렇지 않으면 문제를 설명하는 오류를 반환합니다
	Validate(jsonStr string) error
}
```

**사용 예제**

```go
type SizeValidator struct {
    MaxSize int64
}

func (v *SizeValidator) Validate(jsonStr string) error {
    // 입력 데이터 크기 검사
    if int64(len(jsonStr)) > v.MaxSize {
        return fmt.Errorf("JSON 이 최대 크기 초과: %d", v.MaxSize)
    }
    return nil
}

// 검증기 설정
cfg := json.DefaultConfig()
cfg.CustomValidators = []json.Validator{&SizeValidator{MaxSize: 1024 * 1024}} // 1MB
processor, err := json.New(cfg)
if err != nil {
    panic(err)
}
```

## 훅 인터페이스

### Hook

작업 가로채기 인터페이스로, 전처리/후처리를 지원합니다.

```go
type Hook interface {
	// Before 는 작업 전에 호출됩니다
	// 오류를 반환하면 작업을 중단합니다
	Before(ctx HookContext) error

	// After 는 작업 완료 후 호출됩니다
	// 결과를 수정하거나 오류를 검사할 수 있습니다
	After(ctx HookContext, result any, err error) (any, error)
}
```

**실행 순서**: 여러 훅은 등록 순서대로 `Before` 를 실행합니다 (하나라도 오류를 반환하면 중단되어 이후 훅과 작업 자체를 실행하지 않음); `After` 는 **등록의 역순**으로 실행됩니다 (미들웨어 양파 모델과 유사). 훅 내부의 panic 은 잡힙니다: `Before` 의 panic 은 오류로 변환되어 작업이 중단되고, `After` 의 panic 은 로그로 남긴 뒤 해당 훅을 건너뛰며, 어느 쪽도 프로세서를 뚫고 나가지 않습니다.

### HookContext

훅 컨텍스트로, 작업 정보를 제공합니다.

```go
type HookContext struct {
	Operation string    // 작업 타입: "get", "set", "delete", "marshal", "unmarshal"
	JSONStr   string    // 입력 JSON 문자열 (marshal 시 비어 있을 수 있음). 보안 경고: 민감 데이터 포함 가능
	Path      string    // 대상 경로 (marshal/unmarshal 시 비어 있을 수 있음)
	Value     any       // set 작업의 값
	Config    *Config   // 활성 설정
	StartTime time.Time // 작업 시작 시간
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `Operation` | `string` | 작업 타입: `"get"`, `"set"`, `"delete"`, `"marshal"`, `"unmarshal"` |
| `JSONStr` | `string` | 입력 JSON 문자열 (marshal 시 비어 있을 수 있음); **민감 데이터 포함 가능** |
| `Path` | `string` | 대상 경로 (marshal/unmarshal 시 비어 있을 수 있음) |
| `Value` | `any` | set 작업이 기록할 값 |
| `Config` | `*Config` | 현재 작업에 사용되는 활성 설정 |
| `StartTime` | `time.Time` | 작업 시작 시간 (`After` 호출 전에 설정됨) |

::: warning JSONStr 에 민감 데이터 포함
`JSONStr` 에는 비밀번호, 토큰, API 키, PII (개인 식별 정보) 등 민감 데이터가 포함될 수 있습니다 — 이 필드를 로그에 기록하지 **마세요**; 로그 기록은 `Operation` 과 `Path` 만 사용하고, 내용 확인이 꼭 필요하면 특정 경로만 대상으로 읽으세요.
:::

**사용 예제**

```go
type LoggingHook struct {
    logger *slog.Logger
}

func (h *LoggingHook) Before(ctx json.HookContext) error {
    h.logger.Info("작업 시작",
        "operation", ctx.Operation,
        "path", ctx.Path,
    )
    return nil
}

func (h *LoggingHook) After(ctx json.HookContext, result any, err error) (any, error) {
    h.logger.Info("작업 완료",
        "operation", ctx.Operation,
        "path", ctx.Path,
        "duration", time.Since(ctx.StartTime),
        "error", err,
    )
    return result, err
}

// 훅 추가
cfg := json.DefaultConfig()
cfg.Hooks = []json.Hook{&LoggingHook{logger: slog.Default()}}
```

### HookFunc

구조체 어댑터로, 함수를 훅으로 사용할 수 있게 합니다. 두 함수 필드 모두 선택입니다: 설정하지 않은 쪽은 '통과'로 처리됩니다 (`Before` 는 nil 반환, `After` 는 결과와 오류를 그대로 반환).

```go
type HookFunc struct {
	BeforeFn func(ctx HookContext) error
	AfterFn  func(ctx HookContext, result any, err error) (any, error)
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `BeforeFn` | `func(ctx HookContext) error` | 작업 전 콜백; 오류를 반환하면 작업을 중단합니다. 미설정 시 `Before` 는 nil 을 통과해 반환 |
| `AfterFn` | `func(ctx HookContext, result any, err error) (any, error)` | 작업 후 콜백; 결과나 오류를 변환할 수 있습니다. 미설정 시 `After` 는 결과와 오류를 그대로 반환 |

**사용 예제**

```go
// After 만 필요할 때
p.AddHook(&json.HookFunc{
	AfterFn: func(ctx json.HookContext, result any, err error) (any, error) {
		log.Printf("%s completed in %v", ctx.Operation, time.Since(ctx.StartTime))
		return result, err
	},
})

// Before 만 필요할 때
p.AddHook(&json.HookFunc{
	BeforeFn: func(ctx json.HookContext) error {
		log.Printf("starting %s on path %s", ctx.Operation, ctx.Path)
		return nil
	},
})
```

### 미리 정의된 훅

#### LoggingHook

시그니처: `func LoggingHook(logger interface{ Info(msg string, args ...any) }) Hook`

로그 기록 훅을 생성합니다.

```go
p.AddHook(json.LoggingHook(slog.Default()))
```

#### TimingHook

시그니처: `func TimingHook(recorder interface{ Record(op string, duration time.Duration) }) Hook`

타이밍 기록 훅을 생성합니다.

```go
type MetricsRecorder struct{}

func (r *MetricsRecorder) Record(op string, duration time.Duration) {
    metrics.RecordDuration(op, duration)
}

p.AddHook(json.TimingHook(&MetricsRecorder{}))
```

#### ValidationHook

시그니처: `func ValidationHook(validator func(jsonStr, path string) error) Hook`

입력 검증 훅을 생성합니다.

```go
p.AddHook(json.ValidationHook(func(jsonStr, path string) error {
	if len(jsonStr) > 1_000_000 {
		return errors.New("JSON 이 너무 큼")
	}
	return nil
}))
```

#### ErrorHook

시그니처: `func ErrorHook(handler func(ctx HookContext, err error) error) Hook`

오류 가로채기 훅을 생성합니다.

```go
p.AddHook(json.ErrorHook(func(ctx json.HookContext, err error) error {
	sentry.CaptureException(err)
	return err // 원본 또는 변환된 오류 반환
}))
```

## 보안 패턴 인터페이스

### PatternLevel

위험 패턴의 심각도 수준입니다.

```go
type PatternLevel int

const (
	// PatternLevelCritical - 항상 작업 차단
	PatternLevelCritical PatternLevel = iota

	// PatternLevelWarning - 엄격 모드에서 차단, 관대한 모드에서 경고 기록
	PatternLevelWarning

	// PatternLevelInfo - 기록만 하고 절대 차단하지 않음
	PatternLevelInfo
)
```

**String 메서드**: `func (pl PatternLevel) String() string` 은 `"critical"` / `"warning"` / `"info"` 를 반환합니다 (알 수 없는 값은 `"unknown"`), 로그 출력에 편리합니다.

### DangerousPattern

위험 패턴 구조체로, 커스텀 보안 규칙을 정의하는 데 사용합니다.

```go
type DangerousPattern struct {
	// Pattern 은 입력에서 감지할 부분 문자열입니다
	Pattern string

	// Name 은 패턴의 설명적 이름입니다
	Name string

	// Level 은 이 패턴을 어떻게 처리할지 결정하는 심각도 수준입니다
	Level PatternLevel
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `Pattern` | `string` | 입력에서 감지할 부분 문자열 |
| `Name` | `string` | 이 보안 위험의 설명적 이름 |
| `Level` | `PatternLevel` | 심각도 수준, 적중 후 처리 방식 (차단/경고/기록만) 결정 |

**사용 예제**

```go
// 구조체 리터럴로 커스텀 위험 패턴 생성
customPattern := json.DangerousPattern{
	Pattern: "eval(",
	Name:    "JavaScript eval 호출",
	Level:   json.PatternLevelCritical,
}

// 설정으로 추가
cfg := json.DefaultConfig()
cfg.AddDangerousPattern(customPattern)
cfg.AddDangerousPattern(json.DangerousPattern{
	Pattern: "internal_api",
	Name:    "내부 API 참조",
	Level:   json.PatternLevelWarning,
})
```

## 경로 파싱 인터페이스

### PathParser

경로 파서 인터페이스.

```go
type PathParser interface {
	// ParsePath 는 경로 문자열을 경로 세그먼트로 파싱합니다
	ParsePath(path string) ([]PathSegment, error)
}
```

**사용 예제**

```go
type CustomPathParser struct{}

func (p *CustomPathParser) ParsePath(path string) ([]json.PathSegment, error) {
	// 커스텀 경로 파싱 로직
	return nil, nil // 커스텀 파싱 구현
}
```

::: warning 예약 상태
`CustomPathParser` 는 현재 버전에서 **경로 파싱 파이프라인에 아직 연결되지 않았습니다**: `Config.CustomPathParser` 로 설정해도 경로 파싱은 여전히 내장 파서를 사용합니다 (이 필드는 현재 프로세서 캐시 키의 '설정 여부' 판정에만 참여하며, 설정하면 해당 설정은 프로세서 캐시를 사용하지 않습니다). `CustomEncoder`, `CustomValidators` 와 마찬가지로 미래 버전을 위한 예약 인터페이스입니다.
:::

## 기본 타입

### Number

JSON 숫자 타입으로, 숫자 정밀도를 유지하는 데 사용합니다. 큰 숫자를 다루거나 정확한 소수가 필요할 때 사용하세요.

```go
type Number string
```

::: tip 호환성 안내
라이브러리의 `Number` 타입은 `encoding/json.Number` 와 100% 호환되며 바로 대체해 사용할 수 있습니다.
:::

**메서드**:

```go
func (n Number) String() string            // 숫자의 리터럴 텍스트 반환
func (n Number) Float64() (float64, error) // float64 로 변환
func (n Number) Int64() (int64, error)     // int64 로 변환
```

**사용 예제**:

```go
// Number 타입 가져오기 (Decoder.UseNumber 로 전체 정밀도 유지)
decoder := json.NewDecoder(strings.NewReader(data))
decoder.UseNumber()

var obj map[string]any
if err := decoder.Decode(&obj); err != nil {
	panic(err)
}

// 타입 단언으로 Number 획득
if num, ok := obj["large_number"].(json.Number); ok {
	// Number 는 원본 정밀도를 유지
	fmt.Println(num.String()) // "9007199254740993" (전체 정밀도)

	// 다른 타입으로 변환
	f, _ := num.Float64()
	i, _ := num.Int64()
}
```

## 표준 라이브러리 호환 인터페이스

`json` 패키지는 `encoding/json` 과 호환되는 다음 표준 인터페이스를 익스포트하여 커스텀 타입의 인코딩/디코딩 동작을 정의할 수 있게 합니다: 인코딩 측은 `Marshaler` 와 `TextMarshaler` (실전은 [커스텀 인코더](../extensions/custom-encoder) 참조), 디코딩 측은 `Unmarshaler` 와 `TextUnmarshaler` 입니다.

### Marshaler

```go
type Marshaler interface {
	MarshalJSON() ([]byte, error)
}
```

`MarshalJSON` 을 구현한 타입은 인코딩 시 자신의 JSON 표현을 완전히 직접 담당합니다. 반환값은 반드시 유효한 JSON 이어야 합니다.

### Unmarshaler

```go
type Unmarshaler interface {
	UnmarshalJSON(data []byte) error
}
```

`UnmarshalJSON` 을 구현한 타입은 디코딩 시 자신의 파싱을 직접 담당합니다: 디코더가 대응하는 JSON 값을 그대로 전달하면 타입이 스스로 대상을 채우고, 메서드가 반환한 오류는 그대로 위로 전파됩니다. 보통 **포인터 리시버**로 구현합니다 (디코딩은 리시버 자신을 수정해야 하므로).

### TextMarshaler

```go
type TextMarshaler interface {
	MarshalText() ([]byte, error)
}
```

`MarshalText` 를 구현한 타입은 텍스트 내용을 값으로 하는 JSON 문자열로 인코딩됩니다 (따옴표와 이스케이프 자동 추가).

### TextUnmarshaler

```go
type TextUnmarshaler interface {
	UnmarshalText(text []byte) error
}
```

`UnmarshalText` 를 구현한 타입은 JSON 문자열의 **내용** (따옴표와 이스케이프를 제거한 텍스트) 으로부터 스스로 파싱하며, 텍스트만으로 완전히 표현 가능한 타입 (커스텀 시간, ID 등) 에 적합합니다. 같은 타입이 `Unmarshaler` 도 함께 구현하면 `UnmarshalJSON` 이 우선합니다.

**사용 예제**

```go
type Person struct {
	Name string
}

// Marshaler 인터페이스 구현
func (p Person) MarshalJSON() ([]byte, error) {
	return []byte(`{"name":"` + p.Name + `"}`), nil
}

// Unmarshaler 인터페이스 구현
func (p *Person) UnmarshalJSON(data []byte) error {
	var v struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(data, &v); err != nil {
		return err
	}
	p.Name = v.Name
	return nil
}
```

`Encoder`, `Decoder`, `Token`, `Delim`, `Number` 등 인코딩/디코딩 타입은 [타입 정의](./types#encoder-json-인코더) 를 참조하세요.

## 타입 정의

### Result[T]

타입 안전한 작업 결과로, 제네릭을 지원하는 결과 처리를 제공합니다.

```go
type Result[T any] struct {
	Value  T     // 결과 값
	Exists bool  // 경로 존재 여부
	Error  error // 오류 정보 (있는 경우)
}
```

**메서드**:

| 메서드 | 시그니처 | 설명 |
|------|------|------|
| `Ok` | `func (r Result[T]) Ok() bool` | 결과가 유효한지 (오류 없고 존재) |
| `Unwrap` | `func (r Result[T]) Unwrap() T` | 값 가져오기, 무효 시 제로값 반환 |
| `UnwrapOr` | `func (r Result[T]) UnwrapOr(defaultValue T) T` | 값 또는 기본값 가져오기 |

**사용 예제**:

```go
// 제네릭으로 값 가져오기
name := json.GetTyped[string](data, "user.name")
fmt.Println(name)

// 기본값으로 가져오기
name = json.GetTyped[string](data, "user.name", "unknown")
```

---

### AccessResult

동적 타입 접근 결과로, Processor.SafeGet 이 반환합니다.

```go
type AccessResult struct {
	Value  any    // 결과 값
	Exists bool   // 경로 존재 여부
	Type   string // 런타임 타입 정보
}

// 메서드
func (r AccessResult) Ok() bool                           // 존재 여부
func (r AccessResult) Unwrap() any                        // 값 가져오기
func (r AccessResult) UnwrapOr(defaultValue any) any      // 값 또는 기본값 가져오기
func (r AccessResult) AsString() (string, error)          // 엄격 변환
func (r AccessResult) AsStringConverted() (string, error) // 포맷팅 변환
func (r AccessResult) AsInt() (int, error)                // 엄격 변환
func (r AccessResult) AsFloat64() (float64, error)        // 엄격 변환
func (r AccessResult) AsBool() (bool, error)              // 엄격 변환
```

**타입 변환 메서드 설명**:

| 메서드 | 변환 동작 | 설명 |
|------|----------|------|
| `AsString()` | 엄격 | string 타입만 받아들이며, 문자열이 아니면 오류 반환 |
| `AsStringConverted()` | 포맷팅 | fmt.Sprintf 로 임의의 값을 문자열 표현으로 변환 |
| `AsInt()` | 엄격 | bool → int 변환을 하지 않으며, 정수와 파싱 가능한 숫자만 받음 |
| `AsFloat64()` | 엄격 | bool → float 변환을 하지 않으며, 부동소수점과 파싱 가능한 숫자만 받음 |
| `AsBool()` | 엄격 | bool 과 파싱 가능한 문자열만 받음 (`strconv.ParseBool` 규칙: `1/t/true/True/TRUE`, `0/f/false/False/FALSE`) |

```go
result := p.SafeGet(data, "user.age")

// 엄격 변환 - 값이 정수가 아니면 오류 반환
age, err := result.AsInt()

// 포맷팅 변환 - 임의의 값을 문자열로
str, err := result.AsStringConverted() // 예: 30 -> "30"
```

## Schema 타입

### Schema

JSON Schema 를 구조체로 정의하며, 타입 안전한 Schema 정의를 지원합니다.

```go
type Schema struct {
	Type                 string             `json:"type,omitempty"`
	Properties           map[string]*Schema `json:"properties,omitempty"`
	Items                *Schema            `json:"items,omitempty"`
	Required             []string           `json:"required,omitempty"`
	MinLength            int                `json:"minLength,omitempty"`
	MaxLength            int                `json:"maxLength,omitempty"`
	Minimum              float64            `json:"minimum,omitempty"`
	Maximum              float64            `json:"maximum,omitempty"`
	Pattern              string             `json:"pattern,omitempty"`
	Format               string             `json:"format,omitempty"`
	AdditionalProperties bool               `json:"additionalProperties,omitempty"`
	MinItems             int                `json:"minItems,omitempty"`
	MaxItems             int                `json:"maxItems,omitempty"`
	UniqueItems          bool               `json:"uniqueItems,omitempty"`
	Enum                 []any              `json:"enum,omitempty"`
	Const                any                `json:"const,omitempty"`
	MultipleOf           float64            `json:"multipleOf,omitempty"`
	ExclusiveMinimum     bool               `json:"exclusiveMinimum,omitempty"`
	ExclusiveMaximum     bool               `json:"exclusiveMaximum,omitempty"`
	Title                string             `json:"title,omitempty"`
	Description          string             `json:"description,omitempty"`
	Default              any                `json:"default,omitempty"`
	Examples             []any              `json:"examples,omitempty"`
}
```

**사용 예제**:

```go
schema := &json.Schema{
	Type:     "object",
	Required: []string{"name"},
	Properties: map[string]*json.Schema{
		"name": {Type: "string"},
		"age":  {Type: "number"},
	},
}
```

### SchemaConfig

Schema 검증 설정입니다. `NewSchemaWithConfig` 로 Schema 인스턴스를 생성하는 데 사용합니다.

```go
type SchemaConfig struct {
	Type                 string
	Properties           map[string]*Schema
	Items                *Schema
	Required             []string
	MinLength            *int
	MaxLength            *int
	Minimum              *float64
	Maximum              *float64
	Pattern              string
	Format               string
	AdditionalProperties *bool
	MinItems             *int
	MaxItems             *int
	UniqueItems          bool
	Enum                 []any
	Const                any
	MultipleOf           *float64
	ExclusiveMinimum     *bool
	ExclusiveMaximum     *bool
	Title                string
	Description          string
	Default              any
	Examples             []any
}
```

**사용 예제**:

```go
cfg := json.DefaultSchemaConfig()
cfg.Type = "object"
cfg.Required = []string{"name", "email"}
additionalProperties := false
cfg.AdditionalProperties = &additionalProperties
schema := json.NewSchemaWithConfig(cfg)
```

### ValidationError

Schema 검증 오류입니다.

```go
type ValidationError struct {
	Path    string `json:"path"`    // 오류 경로
	Message string `json:"message"` // 오류 메시지
}

func (ve *ValidationError) Error() string
```

## 관련 문서

- [Hook 시스템](../extensions/hooks) - 훅 상세 사용 가이드
- [Schema 검증](./schema) - Schema 검증 상세 가이드
- [CustomEncoder](../extensions/custom-encoder) - 커스텀 인코더 가이드
