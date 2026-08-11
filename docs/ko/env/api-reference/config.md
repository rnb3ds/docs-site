---
sidebar_label: "Config"
title: "Config API - CyberGo env | 구성 상세"
description: "CyberGo env의 Config 구성 구조체 API 레퍼런스로, 파일 검색 경로, 크기와 수량 제한, 키-값 검증, JSON/YAML 파싱 옵션, 변수 확장, 감사 구성 및 Development/Production 프리셋 템플릿을 포함하며, 중첩 구조와 필드 승격 두 가지 접근 방식을 상세히 설명합니다."
sidebar_position: 4
---

# Config API

`Config` 구조체의 완전한 구성 옵션 레퍼런스입니다.

## 구조체 정의

Config는 중첩 구조체로 구성을 구성하며, Go의 필드 승격을 통해 하위 호환성을 유지합니다:

```go
type Config struct {
    FileConfig       // 파일 로드 동작
    ValidationConfig // 키와 값 검증
    LimitsConfig     // 크기와 수량 제한
    JSONConfig       // JSON 파싱 옵션
    YAMLConfig       // YAML 파싱 옵션
    ParsingConfig    // 일반 파싱 동작
    ComponentConfig  // 커스텀 컴포넌트와 고급 옵션
}
```

**두 가지 접근 방식:**

```go
// 이전 방식(필드 승격, 여전히 유효)
cfg.Filenames = []string{".env"}
cfg.MaxFileSize = 1024

// 새로운 방식(권장, 더 명확)
cfg.FileConfig.Filenames = []string{".env"}
cfg.LimitsConfig.MaxFileSize = 1024
```

### 중첩 구조체

```go
// FileConfig 파일 로드 동작 제어
type FileConfig struct {
    Filenames         []string // 로드할 파일 목록
    FailOnMissingFile bool     // 파일이 없을 때 오류 반환 여부
    OverwriteExisting bool     // 이미 존재하는 환경 변수 덮어쓰기 여부
    AutoApply         bool     // os.Environ에 자동 적용 여부
}

// ValidationConfig 키와 값 검증 제어
type ValidationConfig struct {
    RequiredKeys   []string       // 필수 키 이름 목록
    AllowedKeys    []string       // 허용된 키 이름 화이트리스트
    ForbiddenKeys  []string       // 추가 금지 키 목록
    KeyPattern     *regexp.Regexp // 키 이름 매칭 패턴
    ValidateValues bool           // 값의 안전성 검증 여부
    ValidateUTF8   bool           // 값이 유효한 UTF-8인지 검증 여부
}

// LimitsConfig 크기와 수량 제한 제어
type LimitsConfig struct {
    MaxFileSize       int64 // 단일 파일 최대 바이트 수
    MaxVariables      int   // 파일당 최대 변수 수
    MaxLineLength     int   // 줄당 최대 길이
    MaxKeyLength      int   // 키 이름 최대 길이
    MaxValueLength    int   // 값 최대 길이
    MaxExpansionDepth int   // 변수 확장 최대 깊이
}

// JSONConfig JSON 파싱 동작 제어
type JSONConfig struct {
    JSONNullAsEmpty    bool // null을 빈 문자열로 변환
    JSONNumberAsString bool // 숫자를 문자열로 변환
    JSONBoolAsString   bool // 불리언을 문자열로 변환
    JSONMaxDepth       int  // 최대 중첩 깊이
}

// YAMLConfig YAML 파싱 동작 제어
type YAMLConfig struct {
    YAMLNullAsEmpty    bool // null/~을 빈 문자열로 변환
    YAMLNumberAsString bool // 숫자를 문자열로 변환
    YAMLBoolAsString   bool // 불리언을 문자열로 변환
    YAMLMaxDepth       int  // 최대 중첩 깊이
}

// ParsingConfig 일반 파싱 동작 제어
type ParsingConfig struct {
    AllowExportPrefix bool // export KEY=value 구문 허용
    AllowYamlSyntax   bool // YAML 스타일 값 허용
    ExpandVariables   bool // ${VAR} 참조 확장 여부
}

// ComponentConfig 커스텀 컴포넌트와 고급 옵션
type ComponentConfig struct {
    CustomValidator Validator        // 커스텀 키/값 검증기
    CustomExpander  VariableExpander // 커스텀 변수 확장기
    CustomAuditor   AuditLogger      // 커스텀 감사 로거
    FileSystem      FileSystem       // 커스텀 파일 시스템(테스트용)
    AuditHandler    AuditHandler     // 커스텀 감사 핸들러
    AuditEnabled    bool             // 감사 로그 활성화
    Prefix          string           // 이 접두사가 있는 변수만 처리
}
```

## 구성 필드

### 파일 처리

이 필드들은 파일 로드 동작을 제어합니다.

#### `Filenames` []string

로드할 파일 경로 목록. **기본값 `[".env"]`**.

```go
cfg.Filenames = []string{".env", ".env.local"}
```

---

#### `FailOnMissingFile` bool

파일이 없을 때 오류를 반환할지 여부. **기본값 `false`**(조용히 건너뜀).

```go
cfg.FailOnMissingFile = true  // 파일이 없을 때 오류
```

---

#### `OverwriteExisting` bool

이미 존재하는 환경 변수를 덮어쓸지 여부. **기본값 `false`**.

```go
cfg.OverwriteExisting = true  // 덮어쓰기 허용
```

---

#### `AutoApply` bool

로드 후 시스템 환경(`os.Environ`)에 자동으로 적용할지 여부. **기본값 `false`**.

```go
cfg.AutoApply = true  // 로드 후 자동 적용
```

:::tip 팁
패키지 수준 `Load()` 함수는 자동으로 `AutoApply = true`를 설정합니다. `New()`로 Loader를 생성할 때는 수동으로 설정해야 합니다.
:::

### 변수 확장

#### `ExpandVariables` bool

`${VAR}` 구문 변수 확장을 활성화합니다. **기본값 `true`**.

```go
cfg.ExpandVariables = true
```

지원되는 확장 구문:

| 구문 | 설명 |
|------|------|
| `${VAR}` | 변수 참조 |
| `${VAR:-default}` | 변수가 없을 때 기본값 사용(변수가 존재하면 비어 있어도 원래 값 사용) |
| `${VAR:=default}` | `${VAR:-default}`와 동일(변수가 없을 때 기본값 사용, 저장소에 기록하지 않음) |
| `${VAR:?error}` | 변수가 없거나 비어 있을 때 오류 반환 |

:::tip 빈 문자열 처리
`${VAR:-default}`와 `${VAR:=default}`는 변수가 **설정되지 않았을 때만** 기본값을 사용합니다. 변수가 명시적으로 빈 문자열(`VAR=`)로 설정된 경우, 빈 문자열 원래 값을 사용합니다. `${VAR:?error}`만 빈 문자열을 오류로 간주합니다. 자세한 내용은 [변수 확장](/ko/env/guides/variable-expansion)을 참조하세요.
:::

### 보안 제한

#### `MaxFileSize` int64

단일 파일 최대 바이트 수. **기본값 2MB**, 하드 상한 100MB.

```go
cfg.MaxFileSize = 10 * 1024 * 1024 // 10 MB
```

| 구성 | 기본값 | 하드 상한 |
|------|--------|----------|
| `MaxFileSize` | 2MB (2097152) | 100MB |

---

#### `MaxLineLength` int

줄당 최대 길이. **기본값 1024**, 하드 상한 64KB.

```go
cfg.MaxLineLength = 2048
```

| 구성 | 기본값 | 하드 상한 |
|------|--------|----------|
| `MaxLineLength` | 1024 | 65536 (64KB) |

---

#### `MaxKeyLength` int

키 이름 최대 길이. **기본값 64**, 하드 상한 1024.

```go
cfg.MaxKeyLength = 128
```

| 구성 | 기본값 | 하드 상한 |
|------|--------|----------|
| `MaxKeyLength` | 64 | 1024 |

---

#### `MaxValueLength` int

값 최대 길이. **기본값 4096**, 하드 상한 1MB.

```go
cfg.MaxValueLength = 8192
```

| 구성 | 기본값 | 하드 상한 |
|------|--------|----------|
| `MaxValueLength` | 4096 | 1048576 (1MB) |

---

#### `MaxVariables` int

파일당 최대 변수 수. **기본값 500**, 하드 상한 10000.

```go
cfg.MaxVariables = 1000
```

| 구성 | 기본값 | 하드 상한 |
|------|--------|----------|
| `MaxVariables` | 500 | 10000 |

---

#### `MaxExpansionDepth` int

변수 확장 최대 깊이. **기본값 5**, 하드 상한 20.

```go
cfg.MaxExpansionDepth = 10
```

| 구성 | 기본값 | 하드 상한 |
|------|--------|----------|
| `MaxExpansionDepth` | 5 | 20 |

### 키 검증

#### `KeyPattern` *regexp.Regexp

커스텀 키 이름 매칭 패턴. **기본값 `nil`**(빠른 바이트 수준 검증 사용).

:::tip 성능 최적화
`nil` 값은 빠른 바이트 수준 검증을 활성화합니다(약 10배 성능 향상). 기본 검증 규칙: 문자로 시작, 문자, 숫자, 밑줄만 포함.
:::

```go
import "regexp"

// 커스텀 패턴
cfg.KeyPattern = regexp.MustCompile(`^[A-Z][A-Z0-9_]*$`)
```

---

#### `AllowedKeys` []string

허용된 키 이름 화이트리스트. 비어 있으면 (금지 키를 제외한) 모든 키를 허용합니다.

```go
cfg.AllowedKeys = []string{"APP_NAME", "APP_VERSION", "PORT"}
```

---

#### `ForbiddenKeys` []string

추가 금지 키 목록(내장 금지 키에 누적됨).

```go
cfg.ForbiddenKeys = []string{"CUSTOM_DANGEROUS_VAR"}
```

:::tip 내장 금지 키
라이브러리는 `PATH`, `LD_PRELOAD`, `LD_LIBRARY_PATH`, `DYLD_INSERT_LIBRARIES` 등의 시스템 핵심 변수를 기본적으로 금지합니다. 자세한 내용은 [상수와 오류](/ko/env/api-reference/constants#defaultforbiddenkeys)를 참조하세요.
:::

---

#### `RequiredKeys` []string

필수 키 이름 목록. `Validate()` 호출 시 검사합니다.

```go
cfg.RequiredKeys = []string{"DB_HOST", "API_KEY"}
```

---

#### `ValidateValues` bool

값의 안전성을 검증합니다(제어 문자, 널 바이트 등). **기본값 `true`**.

:::warning 경고
항상 활성화된 상태로 유지하는 것을 권장하며, (제어 문자가 포함된 값을 저장해야 하는 등) 특별한 시나리오에서만 비활성화하세요.
:::

```go
cfg.ValidateValues = true  // 기본적으로 활성화됨
```

---

#### `ValidateUTF8` bool

값이 유효한 UTF-8 인코딩인지 검증합니다. **기본값 `false`**.

```go
cfg.ValidateUTF8 = true  // UTF-8 검증 활성화
```

### 파싱 옵션

#### `AllowExportPrefix` bool

`export KEY=value` 구문을 허용합니다. **기본값 `true`**.

```go
cfg.AllowExportPrefix = false  // export 접두사 금지
```

---

#### `AllowYamlSyntax` bool

YAML 스타일 구문(`KEY: value`)을 허용합니다. **기본값 `false`**.

```go
cfg.AllowYamlSyntax = true
```

### JSON 옵션

#### `JSONNullAsEmpty` bool

JSON `null` 값을 빈 문자열로 변환합니다. **기본값 `true`**.

```go
cfg.JSONNullAsEmpty = true
```

---

#### `JSONNumberAsString` bool

JSON 숫자를 문자열로 변환합니다. **기본값 `true`**.

```go
cfg.JSONNumberAsString = true
```

---

#### `JSONBoolAsString` bool

JSON 불리언을 문자열로 변환합니다. **기본값 `true`**.

```go
cfg.JSONBoolAsString = true
```

---

#### `JSONMaxDepth` int

JSON 최대 중첩 깊이. **기본값 10**.

```go
cfg.JSONMaxDepth = 20
```

### YAML 옵션

#### `YAMLNullAsEmpty` bool

YAML `null`/`~` 값을 빈 문자열로 변환합니다. **기본값 `true`**.

```go
cfg.YAMLNullAsEmpty = true
```

---

#### `YAMLNumberAsString` bool

YAML 숫자를 문자열로 변환합니다. **기본값 `true`**.

```go
cfg.YAMLNumberAsString = true
```

---

#### `YAMLBoolAsString` bool

YAML 불리언을 문자열로 변환합니다. **기본값 `true`**.

```go
cfg.YAMLBoolAsString = true
```

---

#### `YAMLMaxDepth` int

YAML 최대 중첩 깊이. **기본값 10**.

```go
cfg.YAMLMaxDepth = 15
```

### 감사

#### `AuditEnabled` bool

감사 로그를 활성화합니다. **기본값 `false`**.

```go
cfg.AuditEnabled = true
```

---

#### `AuditHandler` AuditHandler

커스텀 감사 핸들러.

```go
cfg.AuditHandler = env.NewJSONAuditHandler(os.Stdout)
```

:::tip 상세
[감사 로깅](/ko/env/guides/audit-logging)에서 완전한 감사 구성 설명을 확인하세요.
:::

### 고급 옵션

#### `Prefix` string

이 접두사가 있는 변수만 처리합니다. **기본값 `""`**(모든 변수 처리).

```go
cfg.Prefix = "MYAPP_"  // MYAPP_로 시작하는 변수만 로드
```

---

#### `FileSystem` FileSystem

커스텀 파일 시스템 인터페이스(테스트용).

```go
cfg.FileSystem = &MockFileSystem{}
```

---

#### `CustomValidator` Validator

커스텀 키/값 검증기. 내장 검증기를 덮어씁니다.

```go
cfg.CustomValidator = &MyValidator{}
```

---

#### `CustomExpander` VariableExpander

커스텀 변수 확장기. 내장 확장기를 덮어씁니다.

```go
cfg.CustomExpander = &MyExpander{}
```

---

#### `CustomAuditor` AuditLogger

커스텀 감사 로거. 내장 감사기를 덮어씁니다.

```go
cfg.CustomAuditor = &MyAuditLogger{}
```

---

## 팩토리 함수

### DefaultConfig

```go
func DefaultConfig() Config
```

안전한 기본 구성을 반환합니다.

**기본값:**

| 필드 | 값 |
|------|-----|
| `Filenames` | `[".env"]` |
| `FailOnMissingFile` | `false` |
| `OverwriteExisting` | `false` |
| `AutoApply` | `false` |
| `ExpandVariables` | `true` |
| `MaxFileSize` | 2MB |
| `MaxLineLength` | 1024 |
| `MaxKeyLength` | 64 |
| `MaxValueLength` | 4096 |
| `MaxVariables` | 500 |
| `MaxExpansionDepth` | 5 |
| `ValidateValues` | `true` |
| `KeyPattern` | `nil` (빠른 검증) |
| `AllowExportPrefix` | `true` |
| `AllowYamlSyntax` | `false` |
| `JSONNullAsEmpty` | `true` |
| `JSONNumberAsString` | `true` |
| `JSONBoolAsString` | `true` |
| `JSONMaxDepth` | 10 |
| `YAMLNullAsEmpty` | `true` |
| `YAMLNumberAsString` | `true` |
| `YAMLBoolAsString` | `true` |
| `YAMLMaxDepth` | 10 |
| `ValidateUTF8` | `false` |
| `AuditEnabled` | `false` |
| `Prefix` | `""` |

---

### DevelopmentConfig

```go
func DevelopmentConfig() Config
```

개발 환경 구성을 반환합니다(느슨한 제한).

**기본 구성과의 차이점:**
- `OverwriteExisting`: `true`
- `AllowYamlSyntax`: `true`
- `MaxFileSize`: 10MB

:::tip 보안 보장
`ValidateValues`는 모든 프리셋 구성에서 항상 `true`로 유지되어(기본값과 동일), 환경에 관계없이 보안성을 보장합니다.
:::

```go
cfg := env.DevelopmentConfig()
cfg.Filenames = []string{".env.development"}
loader, _ := env.New(cfg)
```

---

### TestingConfig

```go
func TestingConfig() Config
```

테스트 환경 구성을 반환합니다.

**기본 구성과의 차이점:**
- `OverwriteExisting`: `true`
- `MaxFileSize`: 64KB
- `MaxVariables`: 50

```go
func TestSomething(t *testing.T) {
    cfg := env.TestingConfig()
    cfg.Filenames = []string{".env.test"}
    loader, _ := env.New(cfg)
    defer loader.Close()
}
```

---

### ProductionConfig

```go
func ProductionConfig() Config
```

프로덕션 환경 구성을 반환합니다(엄격한 검증 + 감사).

**기본 구성과의 차이점:**
- `FailOnMissingFile`: `true`
- `AuditEnabled`: `true`
- `MaxFileSize`: 64KB
- `MaxVariables`: 50

```go
cfg := env.ProductionConfig()
cfg.RequiredKeys = []string{"DB_HOST", "API_KEY"}
cfg.AuditHandler = env.NewJSONAuditHandler(os.Stdout)
loader, _ := env.New(cfg)
```

---

### 프리셋 상세 비교

| 기능 | Default | Development | Testing | Production |
|------|---------|-------------|---------|------------|
| 이미 존재하는 변수 덮어쓰기 | ✗ | ✓ | ✓ | ✗ |
| 파일이 없을 때 오류 | ✗ | ✗ | ✗ | ✓ |
| 감사 로그 | ✗ | ✗ | ✗ | ✓ |
| YAML 구문 | ✗ | ✓ | ✗ | ✗ |
| 파일 크기 제한 | 2MB | 10MB | 64KB | 64KB |
| 최대 변수 수 | 500 | 500 | 50 | 50 |
| 금지 키 검사 | ✓ | ✓ | ✓ | ✓ |
| 값 검증 | ✓ | ✓ | ✓ | ✓ |

:::tip 팁
- **개발 환경**: `DevelopmentConfig()` 사용, 빠른 반복을 위해 느슨한 제한
- **테스트 환경**: `TestingConfig()` 사용, 테스트 격리를 위해 덮어쓰기 허용
- **프로덕션 환경**: `ProductionConfig()` 사용, 감사 및 엄격한 검증 활성화
:::

---

## 메서드

### Validate

```go
func (c *Config) Validate() error
```

구성의 유효성을 검증합니다. 모든 제한 값이 유효한 범위 내에 있는지 확인합니다.

```go
cfg := env.DefaultConfig()
cfg.MaxFileSize = 1000

if err := cfg.Validate(); err != nil {
    // 구성이 유효하지 않음
}
```

**검증 규칙:**
- 모든 제한 값은 양수여야 합니다
- 모든 제한 값은 하드 상한을 초과할 수 없습니다
- `KeyPattern`이 nil이 아닌 경우, 유효한 키 이름(예: `TEST_KEY`)을 매칭할 수 있어야 하고, 빈 문자열이나 숫자로 시작하는 키 이름을 매칭할 수 없어야 합니다
- `JSONMaxDepth`와 `YAMLMaxDepth`는 1-100 사이여야 합니다

---

### IsZero

```go
func (c *Config) IsZero() bool
```

Config가 초기화되지 않은 제로 값인지 확인합니다. `DefaultConfig()`를 사용해야 할지 판단하는 데 사용됩니다.

**반환값:**
- `bool` - 제로 값 구성인지 여부

**검사 범위:**
- 수치 제한(MaxFileSize, MaxVariables 등)
- 불리언 필드(ValidateValues, AutoApply 등)
- 포인터/인터페이스 필드(KeyPattern, FileSystem 등)
- 슬라이스 필드(Filenames, RequiredKeys 등)

:::warning 경고
부분적으로 초기화된 Config는 제로 값으로 감지되지 않을 수 있습니다. 항상 `DefaultConfig()`에서 시작하여 커스텀 구성을 하는 것을 권장합니다:

```go
// 권장
cfg := env.DefaultConfig()
cfg.Filenames = []string{".env.production"}

// 비권장(일부 필드가 제로 값)
var cfg env.Config
cfg.Filenames = []string{".env.production"}
```
:::

---

## 사용 예제

### 기본 구성

```go
cfg := env.DefaultConfig()
cfg.Filenames = []string{".env", ".env.local"}
cfg.OverwriteExisting = true

loader, err := env.New(cfg)
if err != nil {
    log.Fatal(err)
}
defer loader.Close()
```

### 프로덕션 환경 구성

```go
cfg := env.ProductionConfig()
cfg.RequiredKeys = []string{"DB_HOST", "DB_PORT", "API_KEY"}
cfg.AuditHandler = env.NewJSONAuditHandler(os.Stdout)

loader, err := env.New(cfg)
if err != nil {
    log.Fatal(err)
}
defer loader.Close()

if err := loader.LoadFiles(".env"); err != nil {
    log.Fatal(err)
}

if err := loader.Validate(); err != nil {
    log.Fatal("필수 구성 누락:", err)
}
```

### 접두사 필터 사용

```go
cfg := env.DefaultConfig()
cfg.Prefix = "MYAPP_"  // MYAPP_KEY1, MYAPP_KEY2 등만 로드
cfg.Filenames = []string{".env"}

loader, _ := env.New(cfg)
// loader에는 MYAPP_로 시작하는 변수만 있음
```

### 커스텀 검증

```go
import "regexp"

cfg := env.DefaultConfig()
// 대문자로 시작하는 것만 허용
cfg.KeyPattern = regexp.MustCompile(`^[A-Z][A-Z0-9_]*$`)
// 커스텀 금지 키 추가
cfg.ForbiddenKeys = []string{"DEBUG", "TRACE"}

loader, _ := env.New(cfg)
```

---

## 관련 문서

- [Loader API](/ko/env/api-reference/loader) - 로더 메서드
- [상수와 오류](/ko/env/api-reference/constants) - 제한 상수와 오류 타입
- [감사 로깅](/ko/env/guides/audit-logging) - 감사 구성 가이드
