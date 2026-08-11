---
sidebar_label: "자주 묻는 질문"
title: "자주 묻는 질문 - CyberGo env | 환경 변수 FAQ"
description: "CyberGo env 자주 묻는 질문 답변으로, 글로벌 모드와 인스턴스 모드 선택, Load 단일 초기화 제한, JSON/YAML 중첩 키 접근, GetSlice 제네릭 함수 설계, 스레드 안전 동시 접근, SecureValue 수명 주기 관리, OverwriteExisting 덮어쓰기 전략과 테스트 격리 등 고빈도 질문을 다룹니다."
sidebar_position: 2
---

# 자주 묻는 질문

## 기본 사용

### Load()와 New() 중 어떤 것을 선택해야 하나요?

**`env.Load()`**(글로벌 모드)는 단순 애플리케이션에 적합합니다: 한 번 로드하고 패키지 수준 함수로 글로벌하게 사용합니다. 변수를 `os.Environ`에 자동으로 적용합니다.

**`env.New()`**(인스턴스 모드)는 테스트와 다중 구성 시나리오에 적합합니다: 격리된 인스턴스를 생성하며, 자동으로 적용하지 않고 명시적으로 `Close()`해야 합니다.

```go
// 단순 애플리케이션 → 글로벌 모드
env.Load(".env")
port := env.GetInt("PORT", 8080)

// 테스트 / 다중 구성 → 인스턴스 모드
loader, _ := env.New(env.TestingConfig())
defer loader.Close()
port := loader.GetInt("PORT", 8080)
```

:::tip 선택 가이드
잘 모르겠으면 먼저 `env.Load()`를 사용하세요. 테스트 격리 또는 다중 구성 요구 사항이 발생하면 `env.New()`로 전환하세요.
:::

### Load()는 왜 한 번만 호출할 수 있나요?

`Load()`는 글로벌 기본 로더를 설정합니다(싱글톤 모드). 반복 호출 시 `ErrAlreadyInitialized`를 반환합니다. 이것은 설계 결정입니다: 런타임에 이미 로드된 구성을 실수로 덮어쓰는 것을 방지합니다.

```go
// 첫 번째 호출 - 성공
env.Load(".env")

// 두 번째 호출 - 오류 반환
err := env.Load(".env.production")
// err == env.ErrAlreadyInitialized
```

**해결 방안:**

```go
// 방안 1: 한 번에 여러 파일 로드(권장)
env.Load(".env", ".env.production")

// 방안 2: 재초기화가 필요한 경우 먼저 재설정
env.ResetDefaultLoader()  // 주로 테스트에 사용
env.Load(".env.production")
```

### .env 파일이 없으면 어떻게 되나요?

기본 동작: **조용히 건너뜀**, 오류 보고하지 않음. 이는 "있으면 로드, 없으면 무시"의 유연한 배포를 지원하기 위함입니다.

```go
// DefaultConfig - 파일이 없으면 조용히 건너뜀
env.Load(".env", ".env.local")
// 두 파일 모두 존재하지 않아도 오류 없음
```

파일이 없을 때 오류를 원하면(프로덕션 환경 권장):

```go
cfg := env.ProductionConfig()
// FailOnMissingFile 기본값 true(ProductionConfig만)
loader, _ := env.New(cfg)
```

### JSON/YAML의 중첩 값에 어떻게 접근하나요?

JSON/YAML의 중첩 구조는 자동으로 **평탄화**되어 밑줄로 구분된 키 이름이 됩니다:

```json
{
  "database": {
    "host": "localhost",
    "port": 5432
  }
}
```

```
저장 형태: DATABASE_HOST=localhost, DATABASE_PORT=5432
```

세 가지 접근 방식이 동등합니다:

```go
host := env.GetString("DATABASE_HOST")  // 플랫 키 이름(권장)
host := env.GetString("database.host")  // 점 표기 경로
host := env.GetString("DATABASE.HOST")  // 대문자 점 표기 경로
```

## 타입과 제네릭

### GetSlice는 왜 메서드가 아닌 제네릭 함수인가요?

Go는 메서드의 타입 매개변수를 지원하지 않습니다. `GetSlice[T]`는 메서드가 아닌 함수여야 합니다:

```go
// ❌ 메서드 방식 - 컴파일 오류(Go는 지원하지 않음)
// loader.GetSlice[int]("PORTS")

// ✅ 함수 방식 - 가능
env.GetSliceFrom[int](loader, "PORTS")

// ✅ 패키지 수준 함수
env.GetSlice[int]("PORTS")
```

### GetSlice는 슬라이스 값을 어떻게 파싱하나요?

우선순위별로 검색합니다:

1. **인덱스 키**(권장): `KEY_0`, `KEY_1`, `KEY_2`...
2. **쉼표 구분**: `KEY=val1,val2,val3`

```bash
# 방식 1: 인덱스 키
HOSTS_0=localhost
HOSTS_1=example.com

# 방식 2: 쉼표 구분
HOSTS=localhost,example.com
```

```go
hosts := env.GetSlice[string]("HOSTS") // ["localhost", "example.com"]
```

### 어떤 불리언 값 형식을 지원하나요?

`GetBool`은 대소문자를 구분하지 않으며, 다음 값을 지원합니다:

| 참 값 | 거짓 값 |
|------|------|
| `true`, `1`, `yes`, `on`, `enabled` | `false`, `0`, `no`, `off`, `disabled` |

## 동시성과 스레드 안전

### 여러 goroutine에서 동시에 Get을 호출할 수 있나요?

**가능합니다.** Loader의 모든 메서드는 스레드 안전합니다. 라이브러리는 분할 잠금(sharded locks)을 사용하여 고동시 시나리오에서의 읽기/쓰기 성능을 최적화합니다.

```go
// 안전한 동시 접근
var wg sync.WaitGroup
for i := 0; i < 100; i++ {
    wg.Add(1)
    go func() {
        defer wg.Done()
        _ = env.GetString("KEY") // 스레드 안전
    }()
}
wg.Wait()
```

### Loader.Close() 후 Get을 호출하면 어떻게 되나요?

제로 값을 반환하며, panic하지 않습니다. Loader는 닫힌 후 읽기 전용 저하 모드로 진입합니다:

```go
loader, _ := env.New()
defer loader.Close()

val := loader.GetString("KEY") // 정상 반환

// Close() 이후
val = loader.GetString("KEY")  // "" 반환(제로 값)
err := loader.Set("KEY", "v")  // ErrClosed 반환
```

## SecureValue

### Release와 Close의 차이는 무엇인가요?

| 메서드 | 메모리 제로화 | 메모리 잠금 해제 | 객체 풀 반환 |
|------|:--------:|:--------:|:----------:|
| `Release()` | ✅ | ✅ | ✅ |
| `Close()` | ✅ | ✅ | ❌ |

**`Release()` 사용을 권장합니다**. 객체를 풀에 반환하여 GC 압력을 줄입니다. `Close()`는 풀링이 필요 없는 시나리오에 적합합니다.

### SecureValue는 GC 회수 시 자동으로 제로화되나요?

**됩니다.** SecureValue는 파이널라이저를 설정하여 가비지 컬렉션 시 자동으로 메모리를 제로화합니다. 하지만 적시 정리를 보장하기 위해 명시적으로 `Release()` 또는 `Close()`를 호출하는 것을 권장하며, GC의 불확실한 시점에 의존하지 마세요.

```go
// ✅ 권장: 명시적 해제
sv := env.GetSecure("API_KEY")
defer sv.Release()

// ⚠️ GC에 의존 - 권장하지 않지만 안전함
sv := env.GetSecure("API_KEY")
// 결국 GC로 제로화되지만 시점은 불확실함
```

### 안전하게 로그를 남기려면 어떻게 하나요?

`Masked()` 또는 마스킹 도구 함수를 사용하고, `Reveal()`의 값을 직접 출력하지 마세요:

```go
sv := env.GetSecure("API_KEY")
defer sv.Release()

// ✅ 안전 - 마스크 출력
log.Printf("API Key: %s", sv.Masked())    // [SECURE:32 bytes locked]
log.Printf("API Key: %s", sv)              // 동일(String()은 Masked() 반환)

// ✅ 안전 - 마스크 도구
masked := env.MaskValue("API_KEY", "sk-xxx") // sk-******************************
clean := env.SanitizeForLog(logMessage)       // 자동 감지 및 마스킹

// ❌ 위험 - 평문 유출
plaintext := sv.Reveal()
log.Printf("API Key: %s", plaintext) // 이렇게 하지 마세요
```

## 구성과 검증

### 특정 접두사의 변수만 로드하려면 어떻게 하나요?

`Prefix` 필드로 필터링합니다:

```go
cfg := env.DefaultConfig()
cfg.Prefix = "MYAPP_"  // MYAPP_로 시작하는 변수만 로드
loader, _ := env.New(cfg)
loader.LoadFiles(".env")
```

```bash
# .env 파일 내용
MYAPP_HOST=localhost    # ✅ 로드
MYAPP_PORT=8080         # ✅ 로드
OTHER_KEY=value         # ❌ 무시(MYAPP_ 접두사 없음)
```

### 구성 덮어쓰기를 방지하려면 어떻게 하나요?

`OverwriteExisting`이 이미 존재하는 변수를 덮어쓸지 여부를 제어합니다:

```go
// 기본값: 덮어쓰지 않음(안전)
cfg := env.DefaultConfig()
cfg.OverwriteExisting = false

// 개발 환경: 덮어쓰기 허용
cfg := env.DevelopmentConfig()
// OverwriteExisting = true
```

### RequiredKeys 검증은 언제 실행되나요?

명시적으로 `Validate()`를 호출할 때만 검사하며, 로드 시 자동으로 트리거되지 않습니다:

```go
cfg := env.ProductionConfig()
cfg.RequiredKeys = []string{"DB_HOST", "API_KEY"}
loader, _ := env.New(cfg)
loader.LoadFiles(".env")

// 명시적 검증
if err := loader.Validate(); err != nil {
    if errors.Is(err, env.ErrMissingRequired) {
        log.Fatal("필수 환경 변수 누락")
    }
}
```

## 테스트

### 테스트에서 환경을 어떻게 격리하나요?

`TestingConfig()` + 독립 Loader 인스턴스를 사용합니다:

```go
func TestConfig(t *testing.T) {
    cfg := env.TestingConfig()
    cfg.OverwriteExisting = true

    loader, err := env.New(cfg)
    if err != nil {
        t.Fatal(err)
    }
    defer loader.Close()

    // 각 테스트가 독립적이며 서로 영향을 주지 않음
    loader.Set("KEY", "test-value")
    val := loader.GetString("KEY")
    // 테스트...
}
```

### 글로벌 모드 테스트는 어떻게 재설정하나요?

`ResetDefaultLoader()`를 사용합니다:

```go
func TestGlobalMode(t *testing.T) {
    // 이전 테스트의 상태 정리
    env.ResetDefaultLoader()
    defer env.ResetDefaultLoader()

    env.Load(".env.test")
    // 테스트...
}
```

:::tip 완전한 테스트 가이드
자세한 내용은 [테스트](/ko/env/guides/testing) 가이드를 참조하세요.
:::

## 관련 문서

- [빠른 시작](/ko/env/getting-started/) - 5분 입문
- [치트시트](/ko/env/getting-started/cheatsheet) - 고빈도 코드 조각
- [오류 처리](/ko/env/guides/error-handling) - 센티널 오류와 복구 전략
- [파일 형식](/ko/env/reference/file-format) - .env/JSON/YAML 구문
