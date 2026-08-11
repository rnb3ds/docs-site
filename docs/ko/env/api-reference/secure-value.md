---
sidebar_label: "SecureValue"
title: "SecureValue API - CyberGo env | 보안 값 저장"
description: "CyberGo env의 SecureValue 보안 값 API 레퍼런스로, NewSecureValue 생성, mlock 메모리 잠금, Reveal 평문 읽기, Masked 마스크, Release 제로화 파괴, IsSensitiveKey 감지를 포함하여 비밀번호, 토큰 및 키를 안전하게 저장합니다."
sidebar_position: 5
---

# SecureValue API

`SecureValue` 타입은 민감 데이터를 안전하게 저장하는 데 사용되며, 메모리 잠금, 자동 제로화 및 마스크 기능을 제공합니다.

## 스레드 안전

`SecureValue`의 모든 메서드는 스레드 안전하며, 여러 goroutine에서 동시에 사용할 수 있습니다:

- **읽기 메서드**(`String()`, `Bytes()`, `Length()`, `Masked()`)는 읽기 잠금을 사용하여 동시 읽기 지원
- **닫기 메서드**(`Close()`, `Release()`)는 쓰기 잠금을 사용하여 안전한 제로화 보장
- **상태 검사**(`IsClosed()`, `IsMemoryLocked()`)는 원자적 연산 사용

```go
secret := env.GetSecure("API_KEY")
if secret != nil {
    defer secret.Release()

    // 동시 읽기 안전
    go func() { fmt.Println(secret.Masked()) }()
    go func() { fmt.Println(secret.Length()) }()
}
```

:::warning 경고
`Close()`와 `Release()`는 한 번만 호출해야 합니다. 반복 호출은 안전하지만 효과가 없습니다.
:::

## 생성

### NewSecureValue

```go
func NewSecureValue(value string) *SecureValue
```

보안 값 래퍼를 생성합니다.

**매개변수:**
- `value` - 보호할 문자열 값

**반환값:**
- `*SecureValue` - 보안 값 객체

**동작:**
- 객체 풀을 사용하여 할당 감소
- GC 파이널라이저 설정으로 자동 제로화
- 메모리 잠금이 활성화된 경우 메모리 잠금 시도(실패 시 조용히 무시)

```go
secret := env.NewSecureValue("my-secret-password")
defer secret.Release()  // 또는 Close()
```

---

### NewSecureValueStrict

```go
func NewSecureValueStrict(value string) (*SecureValue, error)
```

보안 값을 생성하며, 메모리 잠금 실패 시 오류를 반환합니다.

**매개변수:**
- `value` - 보호할 문자열 값

**반환값:**
- `*SecureValue` - 보안 값 객체
- `error` - 메모리 잠금 오류(엄격 모드에서만)

```go
env.SetMemoryLockEnabled(true)
env.SetMemoryLockStrict(true)

secret, err := env.NewSecureValueStrict("my-secret")
if err != nil {
    // 메모리 잠금 실패
    log.Printf("Warning: %v", err)
}
if secret != nil {
    defer secret.Release()
}
```

---

### GetSecure (Loader 메서드)

```go
func (l *Loader) GetSecure(key string) *SecureValue
```

로더에서 보안 값을 가져옵니다.

**매개변수:**
- `key` - 키 이름

**반환값:**
- `*SecureValue` - 보안 값의 **방어적 복사본**, 호출자가 해제 책임; 키가 없거나 로더가 닫혔을 때 nil 반환

```go
secret := loader.GetSecure("API_KEY")
if secret != nil {
    defer secret.Release()
    // secret 사용
}
```

:::tip 방어적 복사본
`GetSecure`는 원래 값의 복사본을 반환하며, 부모 Loader와 독립적입니다. 호출자가 `Release()` 또는 `Close()`를 호출하여 해제할 책임이 있습니다.
:::

---

## 메서드

### String

```go
func (sv *SecureValue) String() string
```

마스크 표현을 반환하며, 로그 및 포맷팅에 안전하게 사용할 수 있습니다. `fmt.Stringer` 인터페이스를 구현하여 `fmt.Printf`, `log.Println` 또는 오류 래핑을 통해 키가 우발적으로 유출되는 것을 방지합니다.

**반환값:**
- `string` - 마스크 표현(예: `[SECURE:32 bytes]`), nil이면 `[NIL]` 반환

```go
secret := env.GetSecure("PASSWORD")
if secret != nil {
    log.Printf("Password: %s", secret)  // 안전, 마스크 표현 출력
    // log.Printf("Password: %s", secret.Masked())와 동일
}
```

:::warning 경고
`String()`은 **마스크 표현**을 반환하며, 평문 값이 아닙니다. 평문 값이 필요하면 `Reveal()`을 사용하세요.
:::

---

### Reveal

```go
func (sv *SecureValue) Reveal() string
```

평문 값을 반환합니다. 호출자는 반환된 문자열을 안전하게 처리할 책임이 있습니다 - 로깅, 직렬화 또는 영구 저장 위치에 저장하는 것을 피하세요. 암호화 작업, API 호출 또는 유사한 보안 처리에 실제 값이 필요한 경우에만 사용하세요.

**반환값:**
- `string` - 평문 값, 닫혔거나 nil이면 빈 문자열 반환

```go
secret := env.GetSecure("API_KEY")
if secret != nil {
    defer secret.Release()
    plaintext := secret.Reveal()  // 평문 값 가져오기
    // plaintext로 API 호출 등 안전한 작업 수행
    _ = plaintext
}
```

:::danger 위험
`Reveal()`은 **평문 문자열**을 반환합니다. Go 문자열은 불변이므로 수동으로 제로화할 수 없습니다. 필요한 경우에만 사용하고, 반환 값을 로그에 기록하거나 저장하는 것을 피하세요.
:::

---

### Bytes

```go
func (sv *SecureValue) Bytes() []byte
```

값의 바이트 슬라이스 복사본을 반환합니다. 호출자는 `ClearBytes`로 제로화할 책임이 있습니다.

**반환값:**
- `[]byte` - 값의 바이트 복사본, 닫혔으면 nil 반환

```go
secret := env.GetSecure("API_KEY")
if secret != nil {
    data := secret.Bytes()
    defer env.ClearBytes(data)  // 사용 후 제로화
    // data 사용
}
```

---

### Length

```go
func (sv *SecureValue) Length() int
```

값의 길이를 반환하며, 콘텐츠를 노출하지 않습니다.

**반환값:**
- `int` - 값 길이, 닫혔으면 0 반환

```go
secret := env.GetSecure("API_KEY")
if secret != nil {
    fmt.Printf("API Key length: %d\n", secret.Length())
}
```

---

### Masked

```go
func (sv *SecureValue) Masked() string
```

마스크된 값을 반환하며, 로그 출력에 사용됩니다.

**반환값:**
- `string` - 마스크 표현

**출력 형식:**
- 닫힘: `[CLOSED]`
- 빈 값: `[SECURE:0 bytes]`
- 정상: `[SECURE:N bytes]` 또는 `[SECURE:N bytes locked]` 또는 `[SECURE:N bytes lock-failed]` 또는 `[SECURE:N bytes unlocked]`

```go
secret := env.GetSecure("API_KEY")
if secret != nil {
    log.Printf("API Key: %s", secret.Masked())
    // 출력: API Key: [SECURE:32 bytes]
    // 참고: 메모리 잠금 활성화(SetMemoryLockEnabled(true)) 및 잠금 성공 시에만,
    // 마스크에 " locked" 접미사 추가(또는 " lock-failed" / " unlocked")
}
```

---

### MarshalJSON

```go
func (sv *SecureValue) MarshalJSON() ([]byte, error)
```

`json.Marshaler` 인터페이스를 구현합니다. 마스크 표현을 반환하여 `json.Marshal` 등 리플렉션 기반 직렬화기를 통한 키 우발적 유출을 방지합니다. 평문은 JSON 출력에 절대 나타나지 않습니다.

**반환값:**
- `[]byte` - JSON 안전 마스크 문자열(예: `"[SECURE:32 bytes]"`), nil이면 `"null"` 반환
- `error` - 항상 nil 반환

```go
type Response struct {
    APIKey *env.SecureValue `json:"api_key"`
}

resp := Response{APIKey: env.NewSecureValue("sk-1234567890")}
data, _ := json.Marshal(resp)
// {"api_key":"[SECURE:16 bytes]"}
// 평문은 출력에 나타나지 않음
```

:::tip 보안 설계
`MarshalJSON`은 `SecureValue`를 구조체에 임베드하고 JSON 직렬화를 수행하더라도 평문이 유출되지 않도록 보장합니다. 출력은 `String()` / `Masked()`와 일치합니다.
:::

---

### MarshalText

```go
func (sv *SecureValue) MarshalText() ([]byte, error)
```

`encoding.TextMarshaler` 인터페이스를 구현합니다. `String()`과 일치하는 마스크 표현을 반환하여 `encoding/xml`, `text/template`, 구조화된 로그 등 텍스트 기반 인코더를 통한 키 우발적 유출을 방지합니다.

**반환값:**
- `[]byte` - 마스크 문자열(예: `"[SECURE:32 bytes]"`), nil이면 `"[NIL]"` 반환
- `error` - 항상 nil 반환

```go
type Config struct {
    Token *env.SecureValue `xml:"token"`
}

cfg := Config{Token: env.NewSecureValue("Bearer xyz")}
data, _ := xml.Marshal(cfg)
// <Config><token>[SECURE:10 bytes]</token></Config>
```

---

### Close

```go
func (sv *SecureValue) Close() error
```

메모리를 안전하게 제로화하고 객체를 닫습니다.

**반환값:**
- `error` - 항상 nil 반환

**동작:**
- 내부 데이터 안전 제로화
- 닫힘으로 표시
- 객체 풀에 반환하지 **않음**

```go
secret := env.GetSecure("TOKEN")
if secret != nil {
    defer secret.Close()
    // Close 후 메모리가 제로화됨
}
```

---

### Release

```go
func (sv *SecureValue) Release()
```

메모리를 제로화하고 객체 풀에 반환합니다.

**동작:**
- 내부 데이터 안전 제로화
- GC 파이널라이저 제거
- 객체 풀에 반환하여 재사용

```go
secret := env.GetSecure("KEY")
if secret != nil {
    defer secret.Release()
    // Release 후 메모리가 제로화되고 객체가 풀에 반환됨
}
```

:::tip Close vs Release
- `Close()` - 제로화만 수행, 풀에 반환하지 않음
- `Release()` - 제로화 및 풀에 반환(고빈도 시나리오에 권장)
:::

---

### IsClosed

```go
func (sv *SecureValue) IsClosed() bool
```

객체가 닫혔는지 확인합니다.

**반환값:**
- `bool` - 닫혔는지 여부

```go
if secret.IsClosed() {
    // 객체가 닫혀 사용할 수 없음
}
```

---

### IsMemoryLocked

```go
func (sv *SecureValue) IsMemoryLocked() bool
```

메모리가 잠겨 있는지(디스크로 스왑 방지) 확인합니다.

**반환값:**
- `bool` - 잠겨 있는지 여부

```go
if secret.IsMemoryLocked() {
    fmt.Println("Memory is locked, protected from swapping")
}
```

---

### MemoryLockError

```go
func (sv *SecureValue) MemoryLockError() error
```

메모리 잠금 시도 오류(있는 경우)를 반환합니다.

**반환값:**
- `error` - 잠금 오류, 성공 또는 시도하지 않은 경우 nil 반환

```go
if err := secret.MemoryLockError(); err != nil {
    log.Printf("Memory lock failed: %v", err)
}
```

---

## 메모리 잠금 구성

### SetMemoryLockEnabled

```go
func SetMemoryLockEnabled(enabled bool)
```

전역적으로 메모리 잠금을 활성화/비활성화합니다. 새로 생성되는 모든 SecureValue에 영향을 미칩니다.

**매개변수:**
- `enabled` - 활성화 여부

```go
package main

import "github.com/cybergodev/env"

func main() {
    // 애플리케이션 시작 시 활성화
    env.SetMemoryLockEnabled(true)

    // 이후 모든 SecureValue가 잠금 시도
}
```

---

### IsMemoryLockEnabled

```go
func IsMemoryLockEnabled() bool
```

메모리 잠금이 활성화되어 있는지 확인합니다.

**반환값:**
- `bool` - 활성화 여부

```go
if env.IsMemoryLockEnabled() {
    // 메모리 잠금 활성화됨
}
```

---

### SetMemoryLockStrict

```go
func SetMemoryLockStrict(strict bool)
```

엄격 모드를 설정합니다. 활성화하면 `NewSecureValueStrict`가 잠금 실패 시 오류를 반환합니다.

**매개변수:**
- `strict` - 엄격 모드 활성화 여부

```go
env.SetMemoryLockEnabled(true)
env.SetMemoryLockStrict(true)

secret, err := env.NewSecureValueStrict("sensitive-data")
if err != nil {
    // 잠금 실패
}
```

---

### IsMemoryLockStrict

```go
func IsMemoryLockStrict() bool
```

엄격 모드인지 확인합니다.

**반환값:**
- `bool` - 활성화 여부

```go
strict := env.IsMemoryLockStrict()
```

---

### IsMemoryLockSupported

```go
func IsMemoryLockSupported() bool
```

현재 플랫폼이 메모리 잠금을 지원하는지 확인합니다.

**반환값:**
- `bool` - 지원 여부

| 플랫폼 | 지원 |
|------|------|
| Linux | ✅ |
| macOS | ✅ |
| Windows | ✅ |
| FreeBSD | ✅ |
| wasm | ❌ |

:::warning 경고
`true`를 반환하는 것은 플랫폼 지원을 의미할 뿐, 프로세스에 충분한 권한이 있음을 의미하지 않습니다. Linux는 `CAP_IPC_LOCK` 또는 root 권한이 필요합니다.
:::

```go
if env.IsMemoryLockSupported() {
    env.SetMemoryLockEnabled(true)
}
```

---

## 보안 도구 함수

### ClearBytes

```go
func ClearBytes(b []byte)
```

바이트 슬라이스를 안전하게 제로화합니다. 사용 후 즉시 민감 데이터를 제로화합니다.

**매개변수:**
- `b` - 제로화할 바이트 슬라이스

```go
sensitive := []byte("secret-data")
// 사용...
env.ClearBytes(sensitive)
// sensitive은 이제 모두 0
```

---

### IsSensitiveKey

```go
func IsSensitiveKey(key string) bool
```

키 이름이 민감 패턴에 매칭되는지 확인합니다.

**매개변수:**
- `key` - 키 이름

**반환값:**
- `bool` - 민감 여부

```go
if env.IsSensitiveKey("DB_PASSWORD") {
    // 민감 키, 안전한 방식으로 처리
    secret := env.GetSecure("DB_PASSWORD")
    if secret != nil {
        defer secret.Release()
    }
}
```

**민감 패턴:** password, secret, token, key, api_key, credential 등

---

### MaskValue

```go
func MaskValue(key, value string) string
```

키의 민감도에 따라 마스크된 값을 반환합니다.

**매개변수:**
- `key` - 키 이름
- `value` - 원래 값

**반환값:**
- `string` - 마스크된 값

```go
// 민감 키 - [MASKED:N chars] 형식 반환
masked := env.MaskValue("API_KEY", "secret123")
// 반환: [MASKED:9 chars]

// 비민감 키 - 원래 값 반환(20자 초과 시 잘림)
masked := env.MaskValue("APP_NAME", "myapp")
// 반환: myapp
```

---

### MaskKey

```go
func MaskKey(key string) string
```

로그용으로 키 이름을 마스크합니다.

**매개변수:**
- `key` - 키 이름

**반환값:**
- `string` - 마스크된 키 이름

```go
masked := env.MaskKey("DB_PASSWORD")
// 반환: DB***
```

---

### SanitizeForLog

```go
func SanitizeForLog(s string) string
```

문자열에서 민감 키-값 쌍 정보를 정리합니다. `key=value` 형식의 민감 값을 자동으로 감지하고 마스크합니다.

**매개변수:**
- `s` - 원래 문자열

**반환값:**
- `string` - 정리된 문자열

```go
// 민감 키-값 쌍 자동 마스크
msg := "Connected with password=secret123 api_key=abc123"
clean := env.SanitizeForLog(msg)
// 반환: "Connected with password=[MASKED] api_key=[MASKED]"
```

---

### MaskSensitiveInString

```go
func MaskSensitiveInString(s string) string
```

문자열에서 잠재적 민감 콘텐츠를 마스크합니다. 50자를 초과하는 문자열은 잘립니다.

**매개변수:**
- `s` - 원래 문자열

**반환값:**
- `string` - 마스크된 문자열

```go
// 긴 문자열은 잘림(앞 47자 보존 후 "..." 추가)
long := "This is a very long string that exceeds 50 characters"
clean := env.MaskSensitiveInString(long)
// 반환: "This is a very long string that exceeds 50 char..."
```

:::tip 사용 시나리오
민감 데이터가 포함될 수 있는 긴 문자열 잘내기에 사용됩니다. 민감 키-값 쌍을 자동으로 마스크하려면 `SanitizeForLog`를 사용하세요.
:::

---

## 완전한 예제

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/env"
)

func main() {
    // 메모리 잠금 확인 및 활성화
    if env.IsMemoryLockSupported() {
        env.SetMemoryLockEnabled(true)
        fmt.Println("Memory locking enabled")
    }

    // 환경 변수 로드
    if err := env.Load(".env"); err != nil {
        log.Printf("Warning: %v", err)
    }

    // 민감 값을 안전하게 가져오기
    apiKey := env.GetSecure("API_KEY")
    if apiKey == nil {
        log.Fatal("API_KEY not found")
    }
    defer apiKey.Release()

    // 안전하게 사용
    fmt.Printf("API Key length: %d\n", apiKey.Length())
    fmt.Printf("API Key (masked): %s\n", apiKey.Masked())

    // 메모리 잠금 상태 확인
    if apiKey.IsMemoryLocked() {
        fmt.Println("Memory is locked")
    }

    // 잠금 오류 확인
    if err := apiKey.MemoryLockError(); err != nil {
        fmt.Printf("Memory lock warning: %v\n", err)
    }

    // 다른 함수로 전달
    connectAPI(apiKey.Reveal())

    // 보안 도구 함수 사용
    logMessage := "Processing with API_KEY=secret"
    safeMessage := env.SanitizeForLog(logMessage)
    fmt.Println(safeMessage)  // Processing with API_KEY=[MASKED]
}

func connectAPI(key string) {
    // 키로 연결...
    fmt.Printf("Connecting with key of length %d\n", len(key))
}
```

---

## 내부 구현

### 객체 풀

`SecureValue`는 `sync.Pool`을 사용하여 메모리 할당을 줄입니다:

```go
var secureValuePool = sync.Pool{
    New: func() interface{} {
        return &SecureValue{}
    },
}
```

### GC 파이널라이저

생성 시 GC 파이널라이저를 설정하여 가비지 컬렉션 시 자동 제로화를 보장합니다:

```go
runtime.SetFinalizer(sv, (*SecureValue).finalize)
```

### 안전한 제로화

`unsafe.Pointer`를 사용하여 컴파일러 최적화를 방지합니다(`sv.mu` 잠금을 보유한 상태에서 호출되어야 함):

```go
func (sv *SecureValue) clearDataLocked() {
    if len(sv.data) == 0 {
        return
    }
    // 메모리 잠금 해제(잠겨 있는 경우)
    if sv.locked {
        internal.UnlockMemory(sv.data)
        sv.locked = false
    }
    dataPtr := unsafe.Pointer(&sv.data[0])
    for i := range sv.data {
        *(*byte)(unsafe.Pointer(uintptr(dataPtr) + uintptr(i))) = 0
    }
    runtime.KeepAlive(sv.data)
    sv.data = nil
    sv.lockErr = nil
}
```

---

## 관련 문서

- [상수와 오류](/ko/env/api-reference/constants) - 금지 키, 민감 키 패턴, 오류 타입
- [보안 개요](/ko/env/security/) - 보안 아키텍처와 핵심 기능
- [프로덕션 체크리스트](/ko/env/security/production-checklist) - 프로덕션 적용 전 보안 점검
- [Loader API](/ko/env/api-reference/loader) - GetSecure 메서드
