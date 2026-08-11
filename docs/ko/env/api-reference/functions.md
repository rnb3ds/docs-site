---
sidebar_label: "패키지 함수"
title: "패키지 함수 - CyberGo env | 전역 편의 함수"
description: "CyberGo env 패키지 수준 편의 함수 API 레퍼런스로, Load, GetString, GetInt, GetBool, GetDuration, GetSlice, GetSecure, Lookup, Keys, ParseInto 등 글로벌 기본 Loader 기반의 스레드 안전 인터페이스를 제공합니다."
sidebar_position: 2
---

# 패키지 함수

패키지 수준 편의 함수는 간결한 API를 제공하며, 대부분의 사용 시나리오에 적합합니다. 이 함수들은 글로벌 기본 로더를 사용하며, 모든 함수는 스레드 안전합니다.

:::info 정보
글로벌 기본 로더는 `Load()` 또는 `LoadWithConfig()`로 명시적으로 초기화해야 하며, 첫 호출 시 자동으로 생성되지 **않습니다**. 초기화되지 않은 경우 함수 동작은 다음과 같습니다:

- `Get*` 함수(`GetString`, `GetInt`, `GetBool` 등): 전달된 기본값(또는 제로 값) 반환
- `Lookup`: `("", false)` 반환
- `Keys`/`All`/`Len`/`GetSecure`: `nil`/`0` 반환
- `Set`/`Delete`/`Validate`/`ParseInto`: `ErrNotInitialized` 반환
:::

## 로드 함수

### Load

```go
func Load(filenames ...string) error
```

환경 변수 파일을 로드하고 시스템 환경에 적용합니다.

**매개변수:**
- `filenames` - 파일 경로 목록. 제공하지 않으면 기본적으로 `.env` 파일 로드(`DefaultConfig()`의 `Filenames` 설정 사용).

**반환값:**
- `error` - 로드 오류

**동작:**
- 새 Loader 인스턴스를 생성하여 기본 로더로 설정
- 시스템 환경(`os.Environ`)에 자동 적용
- 나중에 로드된 파일이 먼저 로드된 것을 덮어쓸 수 있음(`OverwriteExisting` 구성으로 제어, `Load()` 기본값 `false` = 덮어쓰지 않음)
- 기본 로더가 이미 초기화된 경우 `ErrAlreadyInitialized` 반환
- 다중 형식 지원(.env, JSON, YAML)

```go
// .env 파일 로드
if err := env.Load(".env"); err != nil {
    log.Fatal(err)
}

// 지정된 파일 로드(순서대로, 덮어쓰려면 OverwriteExisting 설정 필요)
if err := env.Load(".env", ".env.local", "config.json"); err != nil {
    log.Fatal(err)
}

// JSON/YAML 중첩 구조는 점 표기 접근 지원
// config.json: {"database": {"host": "localhost", "port": 5432}}
env.Load("config.json")
host := env.GetString("database.host") // "localhost"
port := env.GetInt("database.port")    // 5432
```

---

## 키 이름 해석

모든 Get 함수는 지능형 키 이름 해석을 지원하며, 유연한 접근 방식을 제공합니다.

### 해석 규칙

**1. 정확한 매칭(우선)**
```go
// .env: APP_NAME=myapp
name := env.GetString("APP_NAME")  // "myapp"
```

**2. 대문자 변환(단순 키)**
```go
// 점이 없는 키의 경우, 대문자 버전을 자동으로 시도
name := env.GetString("app_name")  // app_name -> APP_NAME 검색
```

**3. 점 표기 경로 해석(중첩 키)**
```go
// JSON: {"app": {"name": "myapp"}}
// 저장 형태: APP_NAME=myapp

// 다음 방식 모두 해당 값에 접근 가능
name := env.GetString("APP_NAME")   // 플랫 키 이름(권장)
name := env.GetString("app.name")   // 점 표기 경로(자동 변환)
name := env.GetString("APP.NAME")   // 대문자 점 표기 경로
```

### 경로 변환 표

| 입력 키 이름 | 저장 키 이름 |
|----------|----------|
| `"database.host"` | `"DATABASE_HOST"` |
| `"db.port"` | `"DB_PORT"` |
| `"servers.0.host"` | `"SERVERS_0_HOST"` |
| `"app.config.name"` | `"APP_CONFIG_NAME"` |

### 인덱스 접근

배열 요소는 인덱스로 접근하거나 쉼표로 구분된 값으로 폴백할 수 있습니다:

```go
// JSON: {"servers": [{"host": "a.com"}, {"host": "b.com"}]}
// 저장 형태: SERVERS_0_HOST=a.com, SERVERS_1_HOST=b.com

host0 := env.GetString("servers.0.host")  // "a.com"
host1 := env.GetString("servers.1.host")  // "b.com"

// 키가 없지만 쉼표로 구분된 기본 값이 있는 경우
// HOSTS=localhost,example.com
host0 := env.GetString("hosts.0")  // "localhost" (쉼표로 구분된 값에서 파싱)
```

---

## 값 가져오기 함수

### GetString

```go
func GetString(key string, defaultValue ...string) string
```

문자열 값을 가져옵니다. 점 표기 경로 해석을 지원합니다.

**매개변수:**
- `key` - 키 이름(정확한 매칭, 대문자 변환, 점 표기 경로 지원)
- `defaultValue` - 선택적 기본값

**반환값:**
- `string` - 값 또는 기본값(찾지 못하고 기본값이 없을 때 빈 문자열 반환)

```go
// 기본 사용법
host := env.GetString("HOST", "localhost")

// 점 표기 경로 접근(JSON/YAML 중첩 구조)
dbHost := env.GetString("database.host", "localhost")
appName := env.GetString("app.name")

// 기본값이 없을 때 빈 문자열 반환
value := env.GetString("NON_EXISTENT")  // ""
```

---

### GetInt

```go
func GetInt(key string, defaultValue ...int64) int64
```

정수 값을 가져옵니다. 문자열을 정수로 자동 변환합니다. 점 표기 경로 해석을 지원합니다.

**매개변수:**
- `key` - 키 이름(점 표기 경로 지원)
- `defaultValue` - 선택적 기본값, 타입은 `int64`

**반환값:**
- `int64` - 값 또는 기본값(찾지 못하고 기본값이 없을 때 0 반환)

```go
port := env.GetInt("PORT", 8080)
maxConn := env.GetInt("database.max_connections", 10)

// 기본값이 없을 때 0 반환
value := env.GetInt("NON_EXISTENT")  // 0
```

---

### GetBool

```go
func GetBool(key string, defaultValue ...bool) bool
```

불리언 값을 가져옵니다. 점 표기 경로 해석을 지원합니다.

- **참 값(대소문자 구분 안 함):** `true`, `1`, `yes`, `on`, `enabled`
- **거짓 값(대소문자 구분 안 함):** `false`, `0`, `no`, `off`, `disabled`

**매개변수:**
- `key` - 키 이름(점 표기 경로 지원)
- `defaultValue` - 선택적 기본값

**반환값:**
- `bool` - 값 또는 기본값(찾지 못하고 기본값이 없을 때 false 반환)

```go
debug := env.GetBool("DEBUG", false)
cacheEnabled := env.GetBool("cache.enabled", true)

// 기본값이 없을 때 false 반환
value := env.GetBool("NON_EXISTENT")  // false
```

---

### GetUint64

```go
func GetUint64(key string, defaultValue ...uint64) uint64
```

부호 없는 정수 값을 가져옵니다. 점 표기 경로 해석을 지원합니다.

**매개변수:**
- `key` - 키 이름(점 표기 경로 지원)
- `defaultValue` - 선택적 기본값, 타입은 `uint64`

**반환값:**
- `uint64` - 값 또는 기본값(찾지 못하고 기본값이 없을 때 0 반환)

```go
port := env.GetUint64("PORT", 8080)
maxSize := env.GetUint64("MAX_SIZE", 1024)

// 기본값이 없을 때 0 반환
value := env.GetUint64("NON_EXISTENT")  // 0
```

---

### GetFloat64

```go
func GetFloat64(key string, defaultValue ...float64) float64
```

부동소수점 값을 가져옵니다. 점 표기 경로 해석을 지원합니다.

**매개변수:**
- `key` - 키 이름(점 표기 경로 지원)
- `defaultValue` - 선택적 기본값, 타입은 `float64`

**반환값:**
- `float64` - 값 또는 기본값(찾지 못하고 기본값이 없을 때 0 반환)

```go
rate := env.GetFloat64("RATE", 0.5)
threshold := env.GetFloat64("THRESHOLD")

// 기본값이 없을 때 0 반환
value := env.GetFloat64("NON_EXISTENT")  // 0
```

---

### GetDuration

```go
func GetDuration(key string, defaultValue ...time.Duration) time.Duration
```

시간 간격 값을 가져옵니다. 점 표기 경로 해석을 지원합니다.

**지원 형식:**
- `300ms` - 밀리초
- `1.5s` - 초
- `2m30s` - 분 + 초
- `1h30m` - 시간 + 분

**매개변수:**
- `key` - 키 이름(점 표기 경로 지원)
- `defaultValue` - 선택적 기본값

**반환값:**
- `time.Duration` - 값 또는 기본값(찾지 못하고 기본값이 없을 때 0 반환)

```go
timeout := env.GetDuration("TIMEOUT", 30*time.Second)
interval := env.GetDuration("INTERVAL", 5*time.Minute)

// 기본값이 없을 때 0 반환
value := env.GetDuration("NON_EXISTENT")  // 0
```

---

### GetSecure

```go
func GetSecure(key string) *SecureValue
```

보안 값을 가져옵니다(민감 데이터용).

**매개변수:**
- `key` - 키 이름

**반환값:**
- `*SecureValue` - 보안 값 래퍼, 키가 없거나 로더를 사용할 수 없으면 nil 반환

```go
secret := env.GetSecure("API_KEY")
if secret != nil {
    defer secret.Release()

    value := secret.Reveal()   // 평문 값(필요한 경우에만 호출)
    masked := secret.Masked()  // 로그용: [SECURE:32 bytes]
}
```

:::warning 경고
사용 후 반드시 `Release()` 또는 `Close()`를 호출하여 리소스를 해제해야 합니다. `defer`를 사용한 해제 보장을 권장합니다.
:::

:::tip 상세
[SecureValue API](/ko/env/api-reference/secure-value)에서 완전한 API 문서를 확인하세요.
:::

---

### GetSlice[T]

```go
func GetSlice[T sliceElement](key string, defaultValue ...[]T) []T
```

제네릭 함수로, 슬라이스 값을 가져옵니다.

**지원 타입:** `string`, `int`, `int64`, `uint`, `uint64`, `bool`, `float64`, `time.Duration`

**참고:** 이것은 제네릭 함수이며 Loader의 메서드가 아닙니다. 지정된 Loader 인스턴스에서 슬라이스를 가져오려면 `GetSliceFrom[T]`를 사용하세요.

**해석 순서:**
1. 인덱스 키 `KEY_0`, `KEY_1`, `KEY_2`...를 먼저 찾습니다
2. 인덱스 키가 없으면 `KEY`의 값을 쉼표로 구분하여 해석합니다
3. 점 표기 경로 해석을 지원합니다

**매개변수:**
- `key` - 키 이름
- `defaultValue` - 선택적 기본값

**반환값:**
- `[]T` - 슬라이스 값

```go
// 인덱스 키 형식(권장)
// HOSTS_0=localhost
// HOSTS_1=example.com
hosts := env.GetSlice[string]("HOSTS")  // ["localhost", "example.com"]

// 쉼표 구분 형식
// PORTS=80,443,8080
ports := env.GetSlice[int64]("PORTS", []int64{80})  // [80, 443, 8080]

// 부동소수점 슬라이스
rates := env.GetSlice[float64]("RATES", []float64{0.1, 0.2})

// 불리언 슬라이스
flags := env.GetSlice[bool]("FLAGS")

// Duration 슬라이스
timeouts := env.GetSlice[time.Duration]("TIMEOUTS")

// 부호 없는 정수 슬라이스
ports := env.GetSlice[uint]("PORTS")
port64s := env.GetSlice[uint64]("PORTS")

// int 타입
portInts := env.GetSlice[int]("PORTS")

// 기본값이 없을 때 nil 반환
value := env.GetSlice[string]("NON_EXISTENT")  // nil
```

---

### GetSliceFrom[T]

```go
func GetSliceFrom[T sliceElement](loader *Loader, key string, defaultValue ...[]T) []T
```

지정된 Loader 인스턴스에서 슬라이스 값을 가져옵니다. 이것은 독립적인 제네릭 함수입니다(Loader 메서드가 아님).

**매개변수:**
- `loader` - Loader 인스턴스 포인터(nil인 경우 기본값 반환)
- `key` - 키 이름
- `defaultValue` - 선택적 기본값

**반환값:**
- `[]T` - 슬라이스 값

**지원 타입:** `string`, `int`, `int64`, `uint`, `uint64`, `bool`, `float64`, `time.Duration`

```go
loader, _ := env.New(cfg)
defer loader.Close()

// loader 인스턴스에서 슬라이스 가져오기
hosts := env.GetSliceFrom[string](loader, "HOSTS")
ports := env.GetSliceFrom[int64](loader, "PORTS", []int64{80})

// int, uint, uint64 타입도 지원
portsInt := env.GetSliceFrom[int](loader, "PORTS")
portsUint := env.GetSliceFrom[uint](loader, "PORTS")
portsUint64 := env.GetSliceFrom[uint64](loader, "PORTS")
```

:::tip 차이
- `GetSlice[T]` - 기본 로더를 사용하는 패키지 수준 함수
- `GetSliceFrom[T]` - 지정된 Loader 인스턴스를 사용하는 제네릭 함수(Go는 제네릭 메서드를 지원하지 않음)
:::

---

## 조회 함수

### Lookup

```go
func Lookup(key string) (string, bool)
```

키 존재 여부를 확인하고 값을 가져옵니다. 점 표기 경로 해석을 지원합니다.

**매개변수:**
- `key` - 키 이름(점 표기 경로 지원)

**반환값:**
- `string` - 값(앞뒤 공백 제거됨)
- `bool` - 존재 여부

```go
value, exists := env.Lookup("API_KEY")
if !exists {
    // 키가 존재하지 않음
}

// 점 표기 경로
if value, exists := env.Lookup("database.host"); exists {
    fmt.Println(value)
}
```

---

### Keys

```go
func Keys() []string
```

모든 키 이름을 가져옵니다.

**반환값:**
- `[]string` - 키 이름 목록, 로더를 사용할 수 없으면 nil 반환

```go
keys := env.Keys()
for _, key := range keys {
    fmt.Println(key)
}
```

---

### All

```go
func All() map[string]string
```

모든 키-값 쌍을 가져옵니다.

**반환값:**
- `map[string]string` - 키-값 매핑, 로더를 사용할 수 없으면 nil 반환

```go
all := env.All()
for key, value := range all {
    fmt.Printf("%s=%s\n", key, value)
}
```

---

### Len

```go
func Len() int
```

변수 수를 가져옵니다.

**반환값:**
- `int` - 변수 수, 로더를 사용할 수 없으면 0 반환

```go
count := env.Len()
fmt.Printf("%d개 환경 변수 로드됨\n", count)
```

---

## 설정 및 삭제

### Set

```go
func Set(key, value string) error
```

환경 변수를 설정합니다.

**매개변수:**
- `key` - 키 이름
- `value` - 값

**반환값:**
- `error` - 설정 오류

**오류 타입:**
- `*ValidationError` - 키 이름 형식이 유효하지 않음(Field="key")
- `*SecurityError` - 키가 금지됨(`errors.Is(err, env.ErrSecurityViolation)`로 매칭 가능)
- `ErrInvalidValue` - 값이 유효하지 않음(`ValidateValues`가 true일 때 값에 널 바이트, 제어 문자 등 안전하지 않은 콘텐츠 포함)
- `ErrClosed` - 로더가 닫힘

```go
if err := env.Set("CUSTOM_KEY", "value"); err != nil {
    // *SecurityError(금지 키) 또는 *ValidationError(키 형식)일 수 있음
}
```

---

### Delete

```go
func Delete(key string) error
```

환경 변수를 삭제합니다.

**매개변수:**
- `key` - 키 이름

**반환값:**
- `error` - 삭제 오류

```go
if err := env.Delete("TEMP_KEY"); err != nil {
    panic(err)
}
```

---

## 검증 및 매핑

### Validate

```go
func Validate() error
```

필수 키가 존재하는지 검증합니다. Config에 RequiredKeys를 설정해야 합니다.

**반환값:**
- `error` - 검증 오류

```go
// RequiredKeys를 먼저 구성해야 함(커스텀 로더를 통해)
cfg := env.ProductionConfig()
cfg.RequiredKeys = []string{"DB_HOST", "API_KEY"}

loader, _ := env.New(cfg)
loader.LoadFiles(".env")

if err := loader.Validate(); err != nil {
    // 필수 키 누락
}
```

---

### ParseInto

```go
func ParseInto(v any) error
```

환경 변수를 구조체에 매핑합니다.

**매개변수:**
- `v` - 구조체 포인터

**반환값:**
- `error` - 매핑 오류

```go
type Config struct {
    Host string `env:"HOST" envDefault:"localhost"`
    Port int64  `env:"PORT" envDefault:"8080"`
}

var cfg Config
if err := env.ParseInto(&cfg); err != nil {
    panic(err)
}
```

**구조체 태그:**
| 태그 | 설명 |
|------|------|
| `env:"KEY"` | 지정된 키에 매핑 |
| `env:"-"` | 이 필드 무시 |
| `envDefault:"value"` | 기본값 |

슬라이스 필드는 기본적으로 쉼표 `,`로 구분됩니다(구분자 앞뒤 공백은 자동 제거되며, 커스텀 구분자 태그는 없습니다).

:::tip 상세
[구조체 매핑](/ko/env/guides/struct-mapping)에서 완전한 가이드를 확인하세요.
:::

---

## 유틸리티 함수

### ResetDefaultLoader

```go
func ResetDefaultLoader() error
```

글로벌 기본 로더를 재설정합니다. 주로 테스트 시나리오에 사용됩니다.

**반환값:**
- `error` - 이전 로더 닫기 오류(존재하는 경우); 이전에 로더가 없거나 닫기가 성공하면 nil 반환

**동작:**
- `defaultMu.Lock()`으로 잠금 후 `defaultLoader.Swap(nil)`을 사용하여 기본 로더를 원자적으로 nil로 교환한 후 즉시 잠금 해제
- 잠금 **외부**에서 이전 로더 닫기(잠금을 보유한 상태에서 시간이 많이 걸리는 정리 작업을 실행하여 `Close()`가 기본 로더가 필요한 코드를 트리거할 때 교착 상태가 발생하는 것을 방지)
- 재설정 후 `Load()` 또는 `LoadWithConfig()`로 새 기본 로더 생성 가능

```go
func TestMain(m *testing.M) {
    if err := env.ResetDefaultLoader(); err != nil {
        log.Printf("warning: failed to reset loader: %v", err)
    }
    os.Exit(m.Run())
}

func TestSomething(t *testing.T) {
    if err := env.ResetDefaultLoader(); err != nil {
        t.Logf("warning: %v", err)
    }
    defer env.ResetDefaultLoader()
    // ... 테스트 코드
}
```

:::warning 경고
이 함수는 동시성 안전하지만, 예기치 않은 동작을 피하기 위해 테스트 또는 시작 시에만 호출하세요.
:::

---

### LoadWithConfig

```go
func LoadWithConfig(cfg Config) error
```

커스텀 구성으로 기본 로더를 초기화합니다.

**매개변수:**
- `cfg` - 커스텀 구성

**반환값:**
- `error` - 초기화 오류

**동작:**
- 패키지 수준 기본 로더 설정(`GetString`, `GetInt` 등의 함수가 사용)
- cfg의 설정과 관계없이 `AutoApply = true` **강제 적용**
- 기본 로더가 이미 초기화된 경우 `ErrAlreadyInitialized` 반환

**Load와의 차이점:**
- `Load()` - 파일 이름 목록만 받아 기본 구성 사용
- `LoadWithConfig()` - 완전한 Config를 받아 모든 구성 옵션 지원

```go
cfg := env.DefaultConfig()
cfg.Filenames = []string{".env.production"}
cfg.OverwriteExisting = true
if err := env.LoadWithConfig(cfg); err != nil {
    log.Fatal(err)
}
// 이제 패키지 수준 함수 사용 가능
port := env.GetInt("PORT", 8080)
```

:::warning 경고
이 함수는 `cfg.AutoApply`를 `true`로 강제 설정하여 변수가 시스템 환경에 적용되도록 보장합니다. 적용 시점을 제어하려면 `New()`로 독립 인스턴스를 생성하세요.
:::

---

## 직렬화 함수

### Marshal

```go
func Marshal(data any, format ...FileFormat) (string, error)
```

데이터를 지정된 형식의 문자열로 직렬화합니다. `map[string]string` 또는 구조체를 입력으로 지원합니다.

**인터페이스 통합:** 입력 타입이 `Marshaler` 인터페이스를 구현한 경우, `MarshalEnv()` 메서드를 우선 호출하여 직렬화합니다.

**매개변수:**
- `data` - 직렬화할 데이터(map 또는 구조체)
- `format` - 선택적 형식, 기본값 `FormatEnv`

**반환값:**
- `string` - 직렬화된 문자열(키 정렬됨)
- `error` - 직렬화 오류

**지원 형식:**
- `FormatEnv` (기본값) - .env 형식
- `FormatJSON` - JSON 형식
- `FormatYAML` - YAML 형식

```go
// map을 .env 형식으로
mapData := map[string]string{"HOST": "localhost", "PORT": "8080"}
envStr, _ := env.Marshal(mapData)
// HOST=localhost
// PORT=8080

// map을 JSON 형식으로(숫자 문자열은 그대로 숫자로 출력, 키는 알파벳순 정렬)
jsonStr, _ := env.Marshal(mapData, env.FormatJSON)
// {
//   "HOST": "localhost",
//   "PORT": 8080
// }

// 구조체를 .env 형식으로
type Config struct {
    Host string `env:"HOST"`
    Port string `env:"PORT"`
}
envStr, _ := env.Marshal(Config{Host: "localhost", Port: "8080"})
```

---

### UnmarshalMap

```go
func UnmarshalMap(data string, format ...FileFormat) (map[string]string, error)
```

형식화된 문자열을 map으로 파싱합니다. 자동 형식 감지를 지원합니다.

**매개변수:**
- `data` - 형식화된 문자열
- `format` - 선택적 형식, 기본값 `FormatEnv`; `FormatAuto` 사용 시 자동 감지

**반환값:**
- `map[string]string` - 파싱된 키-값 쌍
- `error` - 파싱 오류

```go
// .env 형식
m, _ := env.UnmarshalMap("HOST=localhost\nPORT=8080")

// JSON 형식(중첩 구조는 평탄화됨)
m, _ := env.UnmarshalMap(`{"database": {"host": "localhost"}}`, env.FormatJSON)
// m["DATABASE_HOST"] = "localhost"

// 자동 형식 감지
m, _ := env.UnmarshalMap(jsonString, env.FormatAuto)
```

---

### UnmarshalStruct

```go
func UnmarshalStruct(data string, v any, format ...FileFormat) error
```

형식화된 문자열을 파싱하여 구조체에 채웁니다.

**매개변수:**
- `data` - 형식화된 문자열
- `v` - 구조체 포인터
- `format` - 선택적 형식, 기본값 `FormatEnv`

**반환값:**
- `error` - 파싱 오류

```go
type Config struct {
    Host string `env:"SERVER_HOST"`
    Port int    `env:"SERVER_PORT"`
}

var cfg Config
err := env.UnmarshalStruct("SERVER_HOST=localhost\nSERVER_PORT=8080", &cfg)
// cfg.Host = "localhost", cfg.Port = 8080

// JSON에서 파싱
err = env.UnmarshalStruct(`{"server": {"host": "localhost"}}`, &cfg, env.FormatJSON)
```

---

### UnmarshalInto

```go
func UnmarshalInto(data map[string]string, v any) error
```

map을 구조체에 채웁니다. `env` 및 `envDefault` 태그를 지원합니다.

**인터페이스 통합:** 대상 타입이 `Unmarshaler` 인터페이스를 구현한 경우, `UnmarshalEnv(data)` 메서드를 우선 호출합니다.

**매개변수:**
- `data` - 키-값 쌍 매핑
- `v` - 구조체 포인터

**반환값:**
- `error` - 채우기 오류

```go
type Config struct {
    Host string `env:"HOST" envDefault:"localhost"`
    Port int    `env:"PORT" envDefault:"8080"`
}

data := map[string]string{"HOST": "example.com"}
var cfg Config
err := env.UnmarshalInto(data, &cfg)
// cfg.Host = "example.com", cfg.Port = 8080 (기본값 사용)
```

---

### MarshalStruct

```go
func MarshalStruct(v any) (map[string]string, error)
```

구조체를 map으로 변환합니다. `env` 태그로 키 이름 지정을 지원합니다.

**인터페이스 통합:** 입력 타입이 `Marshaler` 인터페이스를 구현한 경우, `MarshalEnv()` 메서드를 우선 호출합니다.

**매개변수:**
- `v` - 구조체 또는 구조체 포인터

**반환값:**
- `map[string]string` - 키-값 쌍 매핑
- `error` - 변환 오류

```go
type Config struct {
    Host string `env:"SERVER_HOST"`
    Port int    `env:"SERVER_PORT"`
}

cfg := Config{Host: "localhost", Port: 8080}
m, _ := env.MarshalStruct(cfg)
// m["SERVER_HOST"] = "localhost"
// m["SERVER_PORT"] = "8080"
```

---

### IsMarshalError

```go
func IsMarshalError(err error) bool
```

오류가 직렬화/역직렬화 오류인지 확인합니다.

**매개변수:**
- `err` - 확인할 오류

**반환값:**
- `bool` - MarshalError 타입인지 여부

```go
_, err := env.MarshalStruct(invalidData)
if env.IsMarshalError(err) {
    // 직렬화 오류 처리
}
```

---

## 완전한 예제

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/env"
)

type AppConfig struct {
    Host     string        `env:"APP_HOST" envDefault:"0.0.0.0"`
    Port     int64         `env:"APP_PORT" envDefault:"8080"`
    Debug    bool          `env:"DEBUG" envDefault:"false"`
    Timeout  time.Duration `env:"TIMEOUT" envDefault:"30s"`
    Hosts    []string      `env:"HOSTS"`
}

func main() {
    // 구성 파일 로드
    if err := env.Load(".env"); err != nil {
        log.Printf("Warning: %v", err)
    }

    // 개별 값 읽기
    host := env.GetString("APP_HOST", "localhost")
    port := env.GetInt("APP_PORT", 8080)
    debug := env.GetBool("DEBUG", false)
    timeout := env.GetDuration("TIMEOUT", 30*time.Second)

    fmt.Printf("Server: %s:%d\n", host, port)
    fmt.Printf("Debug: %v, Timeout: %v\n", debug, timeout)

    // 민감 데이터
    secret := env.GetSecure("API_KEY")
    if secret != nil {
        defer secret.Release()
        fmt.Printf("API Key length: %d\n", secret.Length())
    }

    // 구조체 매핑
    var cfg AppConfig
    if err := env.ParseInto(&cfg); err != nil {
        log.Fatal(err)
    }
    fmt.Printf("Config: %+v\n", cfg)

    // 모든 변수
    fmt.Printf("Loaded %d variables\n", env.Len())
}
```

## 관련 문서

- [Loader API](/ko/env/api-reference/loader) - Loader 인스턴스 메서드
- [Config API](/ko/env/api-reference/config) - 구성 옵션
- [SecureValue API](/ko/env/api-reference/secure-value) - 보안 값 처리
- [구조체 매핑](/ko/env/guides/struct-mapping) - 구조체 매핑 가이드
