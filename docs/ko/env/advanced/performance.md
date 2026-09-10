---
sidebar_label: "성능"
title: "성능 - CyberGo env | 고동시 읽기/쓰기 튜닝"
description: "CyberGo env 성능 최적화 가이드로, 분할 잠금 동시 안전, sync.Pool 객체 풀 재사용, mlock 메모리 잠금 오버헤드와 대용량 파일 스트리밍 파싱을 설명하며, 벤치마크와 MaxFileSize/MaxVariables 튜닝 제안을 제공합니다."
sidebar_position: 1
---

# 성능 최적화

env 라이브러리는 고성능 시나리오에 최적화되어 있습니다. 이 문서는 동시 안전, 객체 풀, 메모리 관리 등 성능 관련 기능을 소개합니다.

## 동시 안전

### 스레드 안전 보장

`Loader`의 모든 메서드는 스레드 안전합니다:

```go
loader, _ := env.New(env.DefaultConfig())
defer loader.Close()

var wg sync.WaitGroup

// 동시 읽기
for i := 0; i < 100; i++ {
    wg.Add(1)
    go func() {
        defer wg.Done()
        loader.GetString("KEY")
    }()
}

// 동시 쓰기
for i := 0; i < 100; i++ {
    wg.Add(1)
    go func(n int) {
        defer wg.Done()
        loader.Set(fmt.Sprintf("KEY_%d", n), "value")
    }(i)
}

wg.Wait()
```

### 패키지 수준 함수 스레드 안전

패키지 수준 함수는 글로벌 로더를 사용하며, 마찬가지로 스레드 안전합니다:

```go
var wg sync.WaitGroup

for i := 0; i < 100; i++ {
    wg.Add(1)
    go func() {
        defer wg.Done()
        env.GetString("KEY", "default")
    }()
}

wg.Wait()
```

### 내부 구현

라이브러리는 분할 저장(Sharded Storage)을 사용하여 잠금 경합을 줄입니다:

```text
┌─────────────────────────────────────────┐
│          Loader(8개 분할)                │
├─────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐    ┌────────┐ │
│  │ Shard 0 │ │ Shard 1 │... │ Shard 7│ │
│  │  Lock   │ │  Lock   │    │  Lock  │ │
│  │  Data   │ │  Data   │    │  Data  │ │
│  └─────────┘ └─────────┘    └────────┘ │
└─────────────────────────────────────────┘
```

- 키는 해시 값에 따라 서로 다른 분할에 할당
- 각 분할은 독립적인 잠금 보유
- 잠금 경합 감소, 동시 성능 향상

## 객체 풀

### 객체 풀을 사용하는 이유

빈번한 객체 생성 및 파괴는 GC 압력을 증가시킵니다:

```text
객체 풀 없음:
객체 생성 → 사용 → GC 회수 → 객체 생성 → 사용 → GC 회수 ...

객체 풀 있음:
객체 생성 → 사용 → 풀에 반환 → 가져오기 → 사용 → 풀에 반환 ...
```

### SecureValue 풀

`SecureValue` 객체는 풀로 관리됩니다:

```go
// SecureValue 가져오기(풀에서 재사용 가능)
secret := env.GetSecure("API_KEY")

// 사용(Reveal은 평문 반환, String/Masked는 마스크 반환)
value := secret.Reveal()

// 풀에 반환
secret.Close()  // 또는 secret.Release()
```

### 객체 풀 올바른 사용

**적시 해제:**

```go
func processData() {
    secret := env.GetSecure("SECRET")
    defer secret.Close()  // 해제 보장

    // secret 사용...
}
```

**참조를 보유하지 않기:**

```go
// 오류: 해제된 객체의 참조를 보유
var globalSecret *env.SecureValue

func init() {
    globalSecret = env.GetSecure("KEY")
    globalSecret.Close()  // 해제 후 객체가 재사용됨
}

func later() {
    // 위험: globalSecret은 다른 코드에서 이미 사용 중일 수 있음
    globalSecret.String()
}

// 올바름: 필요할 때마다 가져오기
func getSecret() string {
    secret := env.GetSecure("KEY")
    defer secret.Close()
    return secret.Reveal()
}
```

**닫힘 상태 확인:**

```go
secret := env.GetSecure("KEY")

// 사용 전 확인
if secret.IsClosed() {
    // 객체가 닫혀 사용할 수 없음
}

// 사용 후 닫기
secret.Close()

// 닫은 후 확인
if secret.IsClosed() {
    // 닫힘
}
```

## 메모리 안전

### 메모리 잠금

메모리 잠금을 활성화하여 민감 데이터가 디스크로 스왑되는 것을 방지합니다:

```go
// 플랫폼 지원 확인
if env.IsMemoryLockSupported() {
    env.SetMemoryLockEnabled(true)
}
```

**플랫폼 지원:**

| 플랫폼 | 지원 |
|------|------|
| Linux | ✅ |
| macOS | ✅ |
| Windows | ✅ |
| FreeBSD | ✅ |
| wasm | ❌ |

:::tip 상세
[SecureValue API - 메모리 잠금 구성](/ko/env/api-reference/secure-value#메모리-잠금-구성)에서 완전한 구성 설명을 확인하세요.
:::

### 엄격 모드

엄격 모드에서는 메모리 잠금 실패가 오류를 발생시킵니다:

```go
env.SetMemoryLockStrict(true)

secret, err := env.NewSecureValueStrict("sensitive_data")
if err != nil {
    // 메모리 잠금 실패
}
```

### 안전한 제로화

`SecureValue`는 닫을 때 자동으로 메모리를 제로화합니다:

```go
secret := env.GetSecure("PASSWORD")
// 내부 저장: ['p', 'a', 's', 's', ...]

secret.Close()
// 내부 저장: [0, 0, 0, 0, ...]
```

바이트 슬라이스 수동 제로화:

```go
sensitiveBytes := []byte("secret")
env.ClearBytes(sensitiveBytes)
// sensitiveBytes는 이제 모두 0
```

## 성능 패턴

### 초기화 후 읽기 전용

가장 효율적인 패턴: 시작 시 구성 로드, 런타임에는 읽기 전용:

```go
var config *Config

func init() {
    env.Load(".env")

    config = &Config{}
    env.ParseInto(config)
}

// 모든 goroutine에서 안전하게 읽기
func getValue() string {
    return config.Key
}
```

### 동적 구성 새로고침

구성을 동적으로 업데이트해야 할 때의 패턴:

```go
type ConfigManager struct {
    loader *env.Loader
    mu     sync.RWMutex
}

func (m *ConfigManager) Refresh() error {
    m.mu.Lock()
    defer m.mu.Unlock()

    return m.loader.LoadFiles(".env")
}

func (m *ConfigManager) Get(key string) string {
    m.mu.RLock()
    defer m.mu.RUnlock()

    return m.loader.GetString(key)
}
```

### 잠금 보유 시간 단축

```go
// 비권장: 잠금 내에서 시간이 많이 걸리는 작업 수행
func (l *Loader) ProcessValue(key string) {
    value := l.GetString(key)
    // 시간이 많이 걸리는 작업...
    processValue(value)
}

// 권장: 빠른 읽기, 잠금 외부에서 처리
func ProcessValue(key string) {
    value := loader.GetString(key)  // 빠르게 가져오기
    go processValue(value)          // 비동기 처리
}
```

### 배치 작업

```go
// 필요한 모든 값을 한 번에 가져오기
func LoadAllConfig(loader *env.Loader) *Config {
    return &Config{
        Host:    loader.GetString("HOST"),
        Port:    loader.GetInt("PORT"),
        Debug:   loader.GetBool("DEBUG"),
        Timeout: loader.GetDuration("TIMEOUT"),
    }
}
```

### 빈번한 호출 피하기

```go
// 비권장: 매 요청마다 읽기
func Handler(w http.ResponseWriter, r *http.Request) {
    apiKey := env.GetString("API_KEY")  // 매 요청마다 잠금
    // ...
}

// 권장: 시작 시 캐싱
var apiKey string

func init() {
    env.Load(".env")
    apiKey = env.GetString("API_KEY")
}

func Handler(w http.ResponseWriter, r *http.Request) {
    // 캐시된 값 직접 사용
    // ...
}
```

## 성능 영향

### 객체 풀 이점

| 작업 | 풀 없음 | 풀 있음 |
|------|------|------|
| 할당 횟수 | N | ~상수 |
| GC 압력 | 높음 | 낮음 |
| 지연 | 불안정 | 안정 |

### 메모리 잠금 오버헤드

메모리 잠금(Linux의 `mlock` / Windows의 `VirtualLock`)은 `SecureValue` 생성 시 한 번만 추가 syscall 오버헤드를 발생시키며, 읽기 작업(`Reveal` / `String` / `Masked`)에는 차이가 없습니다. `SecureValue`를 작고 일시적으로 유지하는 것을 권장합니다 - 사용 후 즉시 `Close()` / `Release()`하여 객체 풀에 반환하고, 대규모 잠긴 메모리를 장기간 보유하지 마세요.

## 벤치마크

### 읽기 성능

```go
func BenchmarkConcurrentRead(b *testing.B) {
    loader, _ := env.New(env.DefaultConfig())
    loader.Set("KEY", "value")

    b.RunParallel(func(pb *testing.PB) {
        for pb.Next() {
            loader.GetString("KEY")
        }
    })
}
```

### 쓰기 성능

```go
func BenchmarkConcurrentWrite(b *testing.B) {
    loader, _ := env.New(env.DefaultConfig())

    var i int64
    b.RunParallel(func(pb *testing.PB) {
        for pb.Next() {
            n := atomic.AddInt64(&i, 1)
            loader.Set(fmt.Sprintf("KEY_%d", n), "value")
        }
    })
}
```

### 혼합 읽기/쓰기

```go
func BenchmarkMixedReadWrite(b *testing.B) {
    loader, _ := env.New(env.DefaultConfig())
    loader.Set("KEY", "value")

    b.RunParallel(func(pb *testing.PB) {
        i := 0
        for pb.Next() {
            if i%10 == 0 {
                loader.Set("KEY", "new_value")
            } else {
                loader.GetString("KEY")
            }
            i++
        }
    })
}
```

## 주의사항

### 잠금 내부에서 차단 피하기

```go
// 위험: 교착 상태 가능성
func (l *Loader) BadMethod() {
    // 잠금 내부에서 차단 가능한 작업 호출
    l.Set("KEY", computeValue())  // computeValue가 느릴 수 있음
}

// 안전: 먼저 계산, 나중에 설정
func GoodMethod() {
    value := computeValue()  // 잠금 외부에서 계산
    loader.Set("KEY", value)  // 빠르게 설정
}
```

### Close 후 동시 접근

```go
loader, _ := env.New(cfg)

// goroutine 시작
go func() {
    time.Sleep(1 * time.Second)
    loader.GetString("KEY")  // 빈 문자열 반환(GetString은 error를 반환하지 않음)
}()

loader.Close()  // 메인 goroutine에서 닫기
```

### 글로벌 로더 재설정

```go
// 동시성 안전하지 않음: 런타임에 호출하지 마세요
env.ResetDefaultLoader()

// 안전: 테스트 또는 시작 시에만 호출
func init() {
    env.ResetDefaultLoader()
    env.Load(".env")
}
```

## 동시성 내부 구현 심층 분석

이 절은 평가와 튜닝에 도움이 되도록 라이브러리의 동시성 최적화를 소스 수준에서 설명합니다.

### 분산 저장소 (secureMap)

모든 변수는 8개 샤드에 `SecureValue` 형태로 저장되며, 키는 FNV-1a 해시로 샤드에 배치되고 각 샤드는 자체 `sync.RWMutex`를 가집니다 — 서로 다른 샤드의 읽기/쓰기는 완전히 병렬로 진행되어 락 경합을 분산시킵니다.

### 버킷팅된 일괄 쓰기

`secureMap.SetAll`/`secureMap.SetAllIfAbsent`(파일 로드 경로)는 배치 전체를 단일 평탄 할당에 버킷팅한 뒤 **각 샤드를 한 번만 잠그고** 일괄 쓰기를 완료합니다; 기존 키는 제자리에서 갱신되어(`SecureValue` 객체 재사용) 풀 왕복과 추가 할당을 피합니다.

### 읽기 경로의 락 최적화

- **락 프리 단일 키 읽기**: `Lookup`/`GetSecure`는 원자적 닫힘 플래그로 loader 수준 읽기 락을 우회 — 고동시성에서 RWMutex 자체의 읽기 카운트가 병목
- **무할당 `secureMap.Has`**: closed 플래그만 원자적으로 읽으며 값 문자열을 복사하지 않음
- **`Get`의 2차 락 생략**: 샤드 읽기 락이 이미 `SecureValue` 데이터 안정성을 보장하므로 객체 수준 락을 생략(해당 락은 프로파일에서 원자 연산 핫스팟 23.6%였음)
- **`Set` 빠른 경로**: `OverwriteExisting=true`이고 `AutoApply` 꺼져 있으면 읽기 락만 필요 — 동시 `Set` 호출이 loader 뮤텍스에서 직렬화되지 않음

### 객체 풀과 파이널라이저

`SecureValue`는 `sync.Pool`로 재사용됩니다; GC 파이널라이저는 **최초 생성 시 한 번** 설치되며(생성 비용의 약 60%) 풀 순환은 이 비용을 반복하지 않습니다. 기존 키를 덮어쓸 때 제자리 재설정으로 할당을 더 줄입니다.

### 근사 스냅샷 의미론

`Len`은 원자 카운터로 O(1)에 반환; `Keys`/`ToMap`은 카운터로 용량을 추정한 뒤 샤드를 훑습니다. 동시 쓰기가 있는 경우 결과는 **약간 오래된 근사값**일 수 있습니다(훑는 동안의 수정은 가시성 보장 없음) — 정확한 스냅샷이 필요하면 외부에서 동기화하세요.

### 감사의 성능 인식

감사가 켜지면 로드 경로에 `time.Now`와 이벤트 구성 오버헤드가 추가됩니다(꺼져 있으면 완전히 회피). 고처리량 시나리오에서는 Production 프리셋에서만 감사를 켜거나 `ChannelAuditHandler`로 비동기 소비하세요.

## 관련 문서

- [SecureValue API](/ko/env/api-reference/secure-value) - 보안 값 처리와 메모리 잠금
- [Loader API](/ko/env/api-reference/loader) - 로더 메서드
- [테스트](/ko/env/guides/testing) - 벤치마크 예제
