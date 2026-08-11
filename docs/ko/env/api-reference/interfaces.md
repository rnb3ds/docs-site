---
sidebar_label: "인터페이스"
title: "인터페이스 - CyberGo env | 핵심 인터페이스 계층"
description: "CyberGo env 핵심 인터페이스 정의 레퍼런스로, 의존성 주입을 지원하는 세분화된 설계를 채택하여 EnvLoader 결합 인터페이스와 EnvFileLoader, EnvGetter, EnvSetter, Validator, FullAuditLogger, EnvParser, FileSystem 등 하위 인터페이스를 포함합니다."
sidebar_position: 6
---

# 인터페이스 정의

env 라이브러리는 세분화된 인터페이스 설계를 사용하여 의존성 주입과 유연한 조합을 지원합니다.

## 핵심 인터페이스

### EnvLoader

완전한 로더 인터페이스로, 모든 하위 인터페이스를 결합합니다:

```go
type EnvLoader interface {
    EnvFileLoader
    EnvGetter
    EnvSetter
    EnvApplicator
    EnvCloser
}
```

---

### EnvFileLoader

파일 로드 인터페이스:

```go
type EnvFileLoader interface {
    LoadFiles(filenames ...string) error
}
```

**용도:** 파일 로드 기능만 필요한 시나리오.

```go
func loadConfig(loader env.EnvFileLoader) error {
    return loader.LoadFiles(".env")
}
```

---

### EnvGetter

읽기 접근 인터페이스:

```go
type EnvGetter interface {
    GetString(key string, defaultValue ...string) string
    Lookup(key string) (string, bool)
    Keys() []string
    All() map[string]string
}
```

**용도:** 읽기 전용 구성 접근(최소 인터페이스).

```go
func readConfig(getter env.EnvGetter) {
    host := getter.GetString("HOST", "localhost")
    value, exists := getter.Lookup("API_KEY")
    keys := getter.Keys()
}
```

:::warning 경고
`GetInt`, `GetBool`, `GetUint64`, `GetFloat64`, `GetDuration`, `GetSecure`, `Len`은 `EnvGetter` 인터페이스의 일부가 **아닙니다**.
이 메서드들은 `*Loader` 타입에 구현되어 있지만 최소 인터페이스에는 포함되지 않습니다.

완전한 읽기 기능이 필요하면 `*Loader` 타입을 직접 사용하세요:

```go
func readFullConfig(loader *env.Loader) {
    port := loader.GetInt("PORT", 8080)      // ✓ 사용 가능
    debug := loader.GetBool("DEBUG", false)  // ✓ 사용 가능
    count := loader.Len()                     // ✓ 사용 가능
}
```
:::

---

### EnvSetter

쓰기 접근 인터페이스:

```go
type EnvSetter interface {
    Set(key, value string) error
    Delete(key string) error
}
```

**용도:** 설정/삭제 기능만 필요한 시나리오.

```go
func updateConfig(setter env.EnvSetter) error {
    if err := setter.Set("KEY", "value"); err != nil {
        return err
    }
    return setter.Delete("TEMP_KEY")
}
```

---

### EnvApplicator

시스템 환경 적용 인터페이스:

```go
type EnvApplicator interface {
    Apply() error
}
```

**용도:** 로드된 변수를 `os.Environ`에 적용.

```go
func applyToSystem(applicator env.EnvApplicator) error {
    return applicator.Apply()
}
```

---

### EnvCloser

리소스 해제 인터페이스:

```go
type EnvCloser interface {
    Close() error
}
```

**용도:** 로더 리소스 해제.

---

## 검증 인터페이스

### Validator

결합 검증 인터페이스:

```go
type Validator interface {
    KeyValidator
    ValueValidator
    RequiredValidator
}
```

:::tip 팁
`Validator`는 `RequiredValidator`를 임베드하여 `ValidateRequired` 메서드를 제공합니다. `KeyValidator`만 구현한 커스텀 검증기는 `ValidateRequired` 호출 시 `ErrValidateRequiredUnsupported`를 반환합니다.
:::

---

### RequiredValidator

필수 키 검증 인터페이스:

```go
type RequiredValidator interface {
    ValidateRequired(keys map[string]bool) error
}
```

모든 필수 키가 존재하는지 검증합니다.

---

### KeyValidator

키 검증 인터페이스:

```go
type KeyValidator interface {
    ValidateKey(key string) error
}
```

키 이름이 규칙에 맞는지 검증합니다(길이, 형식, 금지 키 등).

---

### ValueValidator

값 검증 인터페이스:

```go
type ValueValidator interface {
    ValidateValue(value string) error
}
```

값이 안전한지 검증합니다(널 바이트, 제어 문자 등 없음).

---

## 감사 인터페이스

### AuditLogger

최소 감사 로그 인터페이스(`internal.AuditLogger`의 별칭):

```go
type AuditLogger interface {
    LogError(action AuditAction, key, errMsg string) error
}
```

**용도:** 최소 인터페이스로, 커스텀 감사 로거 구현에 편리합니다. 완전한 감사 기능이 필요하면 `FullAuditLogger`를 사용하세요.

---

### FullAuditLogger

확장 감사 로그 인터페이스로, 완전한 감사 로그 기능을 제공합니다:

```go
type FullAuditLogger interface {
    AuditLogger
    Log(action AuditAction, key, reason string, success bool) error
    LogWithFile(action AuditAction, key, file, reason string, success bool) error
    LogWithDuration(action AuditAction, key, reason string, success bool, duration time.Duration) error
    Close() error
}
```

**용도:** 완전한 감사 로그 기능. `ComponentFactory.Auditor()`가 이 인터페이스를 반환합니다.

**메서드 설명:**

| 메서드 | 용도 |
|------|------|
| LogError | 오류 이벤트 기록(AuditLogger에서 상속) |
| `Log` | 일반 감사 이벤트 기록 |
| `LogWithFile` | 파일 정보가 포함된 이벤트 기록 |
| `LogWithDuration` | 소요 시간이 포함된 이벤트 기록 |
| `Close` | 감사 로그 닫기 |

---

### AuditHandler

감사 핸들러 인터페이스(Config.AuditHandler 구성용):

```go
type AuditHandler interface {
    Log(event AuditEvent) error
    Close() error
}
```

**용도:** 이 인터페이스를 구현하여 감사 이벤트 처리 방식을 커스텀할 수 있습니다. `AuditLogger` 인터페이스와 달리 `AuditHandler`는 `Log`와 `Close` 두 가지 메서드가 필요하며, 감사 이벤트 수신 처리 및 리소스 해제에 사용됩니다.

**내장 구현:**
- `JSONAuditHandler` - JSON 형식 로그 출력
- `LogAuditHandler` - 표준 log 패키지로 출력
- `ChannelAuditHandler` - 채널로 전송
- `CloseableChannelHandler` - 자체 버퍼 채널을 소유하는 닫기 가능 핸들러
- `NopAuditHandler` - 아무 작업도 수행하지 않는 핸들러

---

## 변수 확장 인터페이스

### VariableExpander

변수 확장 인터페이스:

```go
type VariableExpander interface {
    Expand(s string) (string, error)
}
```

**용도:** 커스텀 변수 확장 로직, `${VAR}`, `${VAR:-default}` 등의 구문 지원.

```go
expanded, err := expander.Expand("${BASE_URL}/api")
```

---

## 파싱 인터페이스

### EnvParser

파서 인터페이스:

```go
type EnvParser interface {
    Parse(r io.Reader, filename string) (map[string]string, error)
}
```

**매개변수:**
- `r` - 파일 콘텐츠 리더
- `filename` - 파일 이름(오류 정보에 사용)

**반환값:**
- `map[string]string` - 파싱된 키-값 쌍
- `error` - 파싱 오류

**용도:** 커스텀 파일 형식 파서.

---

## 저장 인터페이스

### EnvStorage

환경 변수 저장 인터페이스:

```go
type EnvStorage interface {
    Get(key string) (string, bool)
    Set(key, value string)
    Delete(key string)
    Keys() []string
    Len() int
    ToMap() map[string]string
    Clear()
}
```

**용도:** 커스텀 저장 백엔드.

**메서드 설명:**

| 메서드 | 용도 |
|------|------|
| `Get` | 값 가져오기, 값과 존재 여부 반환 |
| `Set` | 키-값 쌍 설정 |
| `Delete` | 키 삭제 |
| `Keys` | 모든 키 이름 반환 |
| `Len` | 키-값 쌍 수 반환 |
| `ToMap` | 모든 키-값 쌍의 복사본 반환 |
| `Clear` | 모든 데이터 비우기 |

---

## 직렬화 인터페이스

### Marshaler

커스텀 직렬화 인터페이스:

```go
type Marshaler interface {
    MarshalEnv() ([]byte, error)
}
```

**용도:** 커스텀 타입의 직렬화.

```go
type LogLevel string

func (l LogLevel) MarshalEnv() ([]byte, error) {
    return []byte(string(l)), nil
}

// 사용
level := LogLevel("debug")
env.Marshal(level)  // MarshalEnv 호출
```

---

### Unmarshaler

커스텀 역직렬화 인터페이스:

```go
type Unmarshaler interface {
    UnmarshalEnv(data map[string]string) error
}
```

**용도:** 커스텀 타입의 역직렬화.

```go
type Config struct {
    Host string
    Port int
}

func (c *Config) UnmarshalEnv(data map[string]string) error {
    c.Host = data["HOST"]
    port, _ := strconv.Atoi(data["PORT"])
    c.Port = port
    return nil
}

// 사용
var cfg Config
env.UnmarshalInto(data, &cfg)  // UnmarshalEnv 호출
```

---

## 파일 시스템 인터페이스

### FileSystem

파일 시스템 추상 인터페이스:

```go
type FileSystem interface {
    Open(name string) (File, error)
    OpenFile(name string, flag int, perm os.FileMode) (File, error)
    Stat(name string) (os.FileInfo, error)
    MkdirAll(path string, perm os.FileMode) error
    Remove(name string) error
    Rename(oldpath, newpath string) error
    Getenv(key string) string
    Setenv(key, value string) error
    Unsetenv(key string) error
    LookupEnv(key string) (string, bool)
}
```

**용도:** 테스트 시 파일 시스템 모의.

```go
type MockFileSystem struct {
    files map[string]string
    env   map[string]string
}

// MockFile은 env.File 인터페이스 구현(테스트용)
type MockFile struct {
    reader *strings.Reader
}

func (f *MockFile) Read(p []byte) (n int, err error)   { return f.reader.Read(p) }
func (f *MockFile) Write(p []byte) (n int, err error)  { return 0, errors.ErrUnsupported }
func (f *MockFile) Close() error                       { return nil }
func (f *MockFile) Stat() (os.FileInfo, error)         { return nil, errors.ErrUnsupported }
func (f *MockFile) Sync() error                        { return nil }

func (m *MockFileSystem) Open(name string) (env.File, error) {
    content, ok := m.files[name]
    if !ok {
        return nil, os.ErrNotExist
    }
    return &MockFile{reader: strings.NewReader(content)}, nil
}

func (m *MockFileSystem) OpenFile(name string, flag int, perm os.FileMode) (env.File, error) {
    return m.Open(name)
}

func (m *MockFileSystem) Stat(name string) (os.FileInfo, error) {
    if _, ok := m.files[name]; !ok {
        return nil, os.ErrNotExist
    }
    return nil, nil
}

func (m *MockFileSystem) MkdirAll(path string, perm os.FileMode) error { return nil }
func (m *MockFileSystem) Remove(name string) error                     { delete(m.files, name); return nil }
func (m *MockFileSystem) Rename(oldpath, newpath string) error {
    m.files[newpath] = m.files[oldpath]
    delete(m.files, oldpath)
    return nil
}

func (m *MockFileSystem) Getenv(key string) string            { return m.env[key] }
func (m *MockFileSystem) Setenv(key, value string) error      { m.env[key] = value; return nil }
func (m *MockFileSystem) Unsetenv(key string) error           { delete(m.env, key); return nil }
func (m *MockFileSystem) LookupEnv(key string) (string, bool) { val, ok := m.env[key]; return val, ok }

// 사용
cfg := env.TestingConfig()
cfg.FileSystem = &MockFileSystem{
    files: map[string]string{".env": "KEY=value"},
    env:   make(map[string]string),
}
```

---

### File

파일 인터페이스:

```go
type File interface {
    io.Reader
    io.Writer
    io.Closer
    Stat() (os.FileInfo, error)
    Sync() error
}
```

**메서드 설명:**

| 메서드 | 용도 |
|------|------|
| Read | 데이터 읽기 |
| Write | 데이터 쓰기 |
| Close | 파일 닫기 |
| Stat | 파일 정보 가져오기 |
| Sync | 디스크 동기화 |

---

### DefaultFileSystem

기본 파일 시스템 구현:

```go
var DefaultFileSystem FileSystem = OSFileSystem{}
```

실제 운영 체제 파일 시스템과 환경 변수 사용:

```go
cfg := env.DefaultConfig()
cfg.FileSystem = env.DefaultFileSystem  // 기본값
```

---

## 감사 핸들러

### JSONAuditHandler

JSON 형식 감사 로그 출력:

```go
func NewJSONAuditHandler(w io.Writer) *JSONAuditHandler
```

**매개변수:**
- `w` - 출력 대상(예: `os.Stdout`, 파일)

```go
handler := env.NewJSONAuditHandler(os.Stdout)
```

**출력 예시:**
```json
{"timestamp":"2024-01-15T10:30:00Z","action":"load","key":"API_KEY","success":true}
```

---

### LogAuditHandler

표준 log 패키지로 출력:

```go
func NewLogAuditHandler(logger *log.Logger) *LogAuditHandler
```

**매개변수:**
- `logger` - 표준 log.Logger 인스턴스

```go
import "log"

logger := log.New(os.Stderr, "[AUDIT] ", log.LstdFlags)
handler := env.NewLogAuditHandler(logger)
```

**출력 예시:**
```text
[AUDIT] 2024/01/15 10:30:00 load .env success
```

---

### ChannelAuditHandler

채널로 전송:

```go
func NewChannelAuditHandler(ch chan<- AuditEvent) *ChannelAuditHandler
```

**매개변수:**
- `ch` - 감사 이벤트 채널

:::warning 채널 소유권
`ChannelAuditHandler`는 채널을 소유하지 **않으며**, `Close()`는 기저 채널을 닫지 **않습니다**. 호출자가 수신자에게 종료를 알리기 위해 채널을 직접 닫아야 합니다. 또한 채널 버퍼가 가득 차면 `Log()`가 차단됩니다 - 버퍼가 있는 채널 사용을 권장합니다. 채널 수명 주기를 자동 관리하려면 [NewCloseableChannelHandler](/ko/env/api-reference/factory#newcloseablechannelhandler)를 사용하세요.
:::

```go
ch := make(chan env.AuditEvent, 100)
handler := env.NewChannelAuditHandler(ch)

// 비동기 처리
go func() {
    for event := range ch {
        processAuditEvent(event)
    }
}()
```

---

### NopAuditHandler

아무 작업도 수행하지 않는 핸들러(모든 이벤트 폐기):

```go
func NewNopAuditHandler() *NopAuditHandler
```

```go
handler := env.NewNopAuditHandler()
```

---

## 감사 타입

### AuditAction

작업 타입 상수:

```go
type AuditAction = internal.Action

const (
    ActionLoad       AuditAction = "load"        // 파일 로드
    ActionParse      AuditAction = "parse"       // 파싱 작업
    ActionGet        AuditAction = "get"         // 변수 읽기
    ActionSet        AuditAction = "set"         // 변수 설정
    ActionDelete     AuditAction = "delete"      // 변수 삭제
    ActionValidate   AuditAction = "validate"    // 검증 작업
    ActionExpand     AuditAction = "expand"      // 변수 확장
    ActionSecurity   AuditAction = "security"    // 보안 이벤트
    ActionError      AuditAction = "error"       // 오류 이벤트
    ActionFileAccess AuditAction = "file_access" // 파일 접근
)
```

---

### AuditEvent

감사 이벤트 구조:

```go
type AuditEvent = internal.Event
```

**필드:**

| 필드 | 타입 | 설명 |
|------|------|------|
| Timestamp | `time.Time` | 타임스탬프 |
| Action | `AuditAction` | 작업 타입 |
| Key | `string` | 키 이름(마스크됨) |
| File | `string` | 파일 이름 |
| Reason | `string` | 원인/설명 |
| Success | `bool` | 성공 여부 |
| Masked | `bool` | 마스크 여부 |
| Details | `string` | 상세 정보 |
| Duration | `int64` | 소요 시간(나노초) |

---

## ComponentFactory

컴포넌트 팩토리로, 공유 컴포넌트 관리:

```go
type ComponentFactory struct {
    // 전용 필드 포함
}
```

### 메서드

```go
func (f *ComponentFactory) Validator() Validator
func (f *ComponentFactory) Auditor() FullAuditLogger
func (f *ComponentFactory) Expander() VariableExpander
func (f *ComponentFactory) Close() error
func (f *ComponentFactory) IsClosed() bool
```

**용도:** 내부 사용, Loader 생성 시 자동 관리. 자세한 내용은 [ComponentFactory API](/ko/env/api-reference/factory)를 참조하세요.

---

## 완전한 예제

### 커스텀 감사 핸들러 구현

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

// 커스텀 감사 핸들러
type CustomAuditHandler struct {
    events []env.AuditEvent
}

func (h *CustomAuditHandler) Log(event env.AuditEvent) error {
    h.events = append(h.events, event)
    return nil
}

func (h *CustomAuditHandler) Close() error {
    return nil
}

func main() {
    cfg := env.ProductionConfig()
    cfg.AuditEnabled = true
    handler := &CustomAuditHandler{}
    cfg.AuditHandler = handler

    loader, _ := env.New(cfg)
    defer loader.Close()
    // loader 사용...

    // 감사 이벤트 보기
    for _, event := range handler.events {
        fmt.Printf("%s: %s - %s\n", event.Action, event.Key, event.Reason)
    }
}
```

### 세분화된 인터페이스 사용

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

// 읽기 기능만 필요
func printConfig(getter env.EnvGetter) {
    for _, key := range getter.Keys() {
        value, _ := getter.Lookup(key)
        fmt.Printf("%s = %s\n", key, value)
    }
}

// 쓰기 기능만 필요
func setDefaults(setter env.EnvSetter) error {
    return setter.Set("DEFAULT_KEY", "default_value")
}

// 로드 기능만 필요
func loadConfig(loader env.EnvFileLoader) error {
    return loader.LoadFiles(".env")
}

func main() {
    cfg := env.DefaultConfig()
    loader, _ := env.New(cfg)
    defer loader.Close()

    // 세분화된 인터페이스 사용
    loadConfig(loader)
    setDefaults(loader)
    printConfig(loader)
}
```

## 관련 문서

- [Loader API](/ko/env/api-reference/loader) - Loader 인스턴스 메서드
- [ComponentFactory API](/ko/env/api-reference/factory) - 컴포넌트 팩토리
- [커스텀 파서](/ko/env/guides/custom-parser) - 커스텀 파서 가이드
