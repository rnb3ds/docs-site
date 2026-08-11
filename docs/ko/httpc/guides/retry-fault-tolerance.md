---
sidebar_label: "재시도와 내결함성"
title: "재시도와 내결함성 - CyberGo HTTPC | 백오프와 자동 재시도"
description: "HTTPC 재시도와 내결함성 가이드: 기본 지수 백오프 재시도 전략과 RetryConfig 구성, 408/429/5xx 자동 재시도 조건, RetryPolicy 커스텀 인터페이스, Retry-After 응답 헤더 자동 파싱, 백오프 전략 선택과 요청별 WithMaxRetries 제어 모범 사례."
sidebar_position: 6
---

# 재시도와 내결함성

네트워크 요청은 본질적으로 신뢰할 수 없습니다 — 연결이 끊길 수 있고, 서버가 일시적으로 과부하될 수 있으며, DNS 해석이 타임아웃될 수 있습니다. HTTPC는 지능형 재시도 엔진을 내장하여 일시적 장애를 자동으로 처리하고, 비즈니스 로직에 집중할 수 있게 합니다.

## 기본 재시도

HTTPC의 기본 재시도 구성은 정교하게 조정되어 바로 사용할 수 있습니다:

```go
package main

import (
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Retry.MaxRetries = 3                   // 최대 3회 재시도
    cfg.Retry.Delay = 1 * time.Second          // 초기 지연 1s
    cfg.Retry.BackoffFactor = 2.0              // 지수 백오프 배수 2x
    cfg.Retry.EnableJitter = true              // 지터 활성화
    cfg.Retry.MaxRetryDelay = 30 * time.Second // 단일 지연 상한

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://api.example.com/data")
    if err != nil {
        log.Fatal(err)
    }
    log.Printf("성공: %d", result.StatusCode())
}
```

기본 재시도 지연 시퀀스(지터 제외): `1s → 2s → 4s`(매번 `BackoffFactor`를 곱함).

### 재시도 조건

기본적으로 다음 오류가 재시도를 트리거합니다:

| 조건 | 재시도 | 설명 |
|------|--------|------|
| 네트워크 오류(연결 거부, 재설정, EOF) | 예 | `ErrorTypeNetwork` + 재시도 가능한 syscall/메시지 패턴 |
| 타임아웃 오류(다이얼, TLS, 요청 타임아웃) | 예 | `ErrorTypeTimeout` |
| 재시도 가능 DNS 실패(임시/타임아웃) | 예 | `dnsErr.IsTemporary \|\| dnsErr.IsTimeout` |
| 응답 본문 읽기 네트워크 오류 | 예 | 읽기 작업의 `net.OpError` |
| 408 Request Timeout | 예 | `retryableStatusCodes` |
| 429 Too Many Requests | 예 | `Retry-After` 헤더와 함께 |
| 500 Internal Server Error | 예 | `retryableStatusCodes` |
| 502 Bad Gateway | 예 | `retryableStatusCodes` |
| 503 Service Unavailable | 예 | `retryableStatusCodes` |
| 504 Gateway Timeout | 예 | `retryableStatusCodes` |
| 기타 4xx 클라이언트 오류(400/401/403/404…) | 아니요 | 클라이언트 요청 오류, 재시도 무의미 |
| `context.Canceled` | 아니요 | 빠른 경로로 직접 반환 |
| `context.DeadlineExceeded` | 아니요 | 빠른 경로로 직접 반환 |
| TLS/인증서 오류 | 아니요 | 일시적 장애가 아님, 재시도 무의미 |
| 구성 검증 오류 | 아니요 | 로컬 버그, 코드 수정 필요 |

## 백오프 수학 상세

기본값(`Delay=1s`, `BackoffFactor=2.0`, `MaxRetryDelay=30s`, `EnableJitter=true`)을 예로 들어, 재시도별 지연 계산은 다음과 같습니다:

### 기본 지연 계산

```
attempt 0: 1s × 2.0^0 = 1s
attempt 1: 1s × 2.0^1 = 2s
attempt 2: 1s × 2.0^2 = 4s
attempt 3: 1s × 2.0^3 = 8s   (MaxRetries=3일 때 여기까지 도달하지 않음)
attempt 4: 1s × 2.0^4 = 16s
attempt 5: 1s × 2.0^5 = 32s → 상한 트리거, 30s로 잘림
```

### MaxRetryDelay 상한 적용

지연이 30s 초과 시 잘림: `attempt 5`의 32s → 30s.

### Jitter 지터 적용(±10%)

지터 공식: `result = baseDelay ± 10%`, 즉 `result ∈ [baseDelay × 0.9, baseDelay × 1.1)`.

| 재시도 횟수 | 기본 지연 | 지터 포함 범위 |
|-------------|-----------|----------------|
| 제1회 재시도(attempt 0) | 1s | 0.9s ~ 1.1s |
| 제2회 재시도(attempt 1) | 2s | 1.8s ~ 2.2s |
| 제3회 재시도(attempt 2) | 4s | 3.6s ~ 4.4s |
| 제4회 재시도(attempt 3) | 8s | 7.2s ~ 8.8s |
| 제5회 재시도(attempt 4) | 16s | 14.4s ~ 17.6s |
| 제6회 재시도(attempt 5) | 30s(잘린 후) | 27s ~ 33s |

:::tip math.Pow 대신 반복 곱셈을 사용하는 이유
HTTPC는 `math.Pow` 대신 루프 곱셈(`for i := 0; i < attempt; i++ { delay *= factor }`)을 사용합니다. `math.Pow`는 초월 함수(지수+로그)를 호출하여 몇 번의 부동소수점 곱셈보다 오버헤드가 훨씬 큽니다. 동시에 루프 내에서 `math.IsInf`를 검사하여 오버플로우를 방지하고, 오버플로우 시 `MaxRetryDelay`로 직접 폴백합니다. 재시도 핫 경로에서 이런 미세 최적화는 의미가 있습니다.
:::

:::warning Jitter는 상한 적용 후에 적용
지터는 `MaxRetryDelay` 잘림 **이후**에 적용됩니다. 따라서 `attempt 5`의 실제 범위는 27s~33s이며, 30s 상한을 초과할 수 있습니다. 이는 설계 선택입니다 — 지터의 목적은 재시도 시점을 분산시키는 것이며 상한을 약간 초과하는 것은 무해하지만, 크게 벗어나지는 않도록 보장합니다.
:::

## Retry-After 헤더 자동 파싱

서버가 429(Too Many Requests) 또는 503(Service Unavailable)을 반환할 때, 보통 언제 재시도할지 알리는 `Retry-After` 응답 헤더를 함께 보냅니다. HTTPC는 이 헤더를 자동으로 파싱하며, 두 가지 형식을 지원합니다:

### delta-seconds 형식

순수 정수값, "N초 후 재시도"를 의미:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 120
```

### HTTP-date 형식

RFC 1123 날짜, "지정된 시간에 재시도"를 의미:

```
HTTP/1.1 503 Service Unavailable
Retry-After: Fri, 31 Jul 2026 15:00:00 GMT
```

HTTPC는 표준 RFC1123(`Fri, 31 Jul 2026 15:00:00 GMT`)과 숫자 시간대가 있는 RFC1123Z(`Fri, 31 Jul 2026 15:00:00 +0800`)을 모두 지원합니다.

### 60초 안전 상한

서버가 얼마나 긴 시간을 지정하든, HTTPC는 `Retry-After` 지연을 최대 60초로 잘냅니다:

```
Retry-After: 120     →  60s로 잘림(120s 대기하지 않음)
Retry-After: 3600    →  60s로 잘림
Retry-After: Fri, 31 Jul 2026 15:00:00 GMT(현재부터 2시간 후)→ 60s로 잘림
```

:::warning 잘라내는 이유
악의적이거나 구성 오류가 있는 서버가 매우 큰 `Retry-After` 값을 반환할 수 있습니다(예: `Retry-After: 999999`), 이는 클라이언트가 장시간 중단되게 합니다. 60초 상한은 안전 방어입니다: 서버가 1시간 대기를 요구하더라도 HTTPC는 최대 60초만 대기하고 재시도합니다. 서비스 측에 합리적인 속도 제한 정책(예: 분당 60회)이 있다면 정상적인 `Retry-After` 값은 보통 60s보다 훨씬 작아 영향을 받지 않습니다.
:::

### 우선순위

`Retry-After` 헤더의 우선순위는 지수 백오프 지연보다 **높습니다**. 서버가 유효한 `Retry-After` 값을 반환한 경우, 지수 백오프 계산을 건너뛰고 해당 값(잘린 후)을 직접 사용합니다.

```go
package main

import (
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Retry.MaxRetries = 3
    // 지수 백오프 지연: 1s → 2s → 4s
    // 하지만 서버가 Retry-After: 5를 반환하면 제1회 재시도 지연은 5s로 변경
    // (60s 안전 상한 초과하지 않음)

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    start := time.Now()
    _, err = client.Get("https://api.example.com/rate-limited")
    elapsed := time.Since(start)

    if err != nil {
        log.Printf("재시도 소진, 총 소요 %v: %v", elapsed, err)
    } else {
        log.Printf("성공, 총 소요 %v", elapsed)
    }
}
```

:::tip Retry-After는 모든 재시도 가능 상태 코드에 적용
`Retry-After`는 429/503에만 국한되지 않고, 모든 재시도 가능 상태 코드(408/429/500/502/503/504)의 응답에 적용됩니다. 응답 헤더에 `Retry-After`가 포함되어 있으면 파싱되어 사용됩니다.
:::

## 백오프 전략

### 지수 백오프(기본값)

가장 널리 사용되는 전략, 지연이 배수로 증가하며 빠르지만 지나치게 공격적이지 않음:

<!-- check-code: skip -->
```go
cfg.Retry.BackoffFactor = 2.0
// 지연 시퀀스: 1s → 2s → 4s → 8s → 16s → 30s(상한)
```

### 완화 지수 백오프

`PerformanceConfig()`는 1.5배 인수를 사용하여 증가가 더 완만하며, 고처리량 시나리오에 적합:

<!-- check-code: skip -->
```go
cfg.Retry.BackoffFactor = 1.5
cfg.Retry.Delay = 500 * time.Millisecond
// 지연 시퀀스: 0.5s → 0.75s → 1.125s → 1.6875s → ...
```

### 고정 지연

매 재시도 간격이 동일하며, 명확한 재시도 간격 요구사항이 있는 시나리오에 적합:

<!-- check-code: skip -->
```go
cfg.Retry.BackoffFactor = 1.0
// 지연 시퀀스: 1s → 1s → 1s → 1s ...
```

### 랜덤 지터

지터를 활성화하면 기본 지연에 ±10% 랜덤 오프셋을 추가하여 "썬더링 허드(Thundering Herd)" 현상을 방지합니다 — 여러 클라이언트가 동시에 실패한 후 동시에 재시도하여 2차 과부하를 유발하는 것:

<!-- check-code: skip -->
```go
cfg.Retry.EnableJitter = true
// 5개 클라이언트의 재시도 시점이 분산됨:
// 클라이언트 A: 0.93s 후 재시도
// 클라이언트 B: 1.07s 후 재시도
// 클라이언트 C: 1.01s 후 재시도
// 클라이언트 D: 0.96s 후 재시도
// 클라이언트 E: 1.08s 후 재시도
```

:::tip 항상 Jitter 활성화
테스트 시나리오(결정론적 지연이 필요한 경우)를 제외하고, 프로덕션 환경에서는 항상 `EnableJitter = true`를 활성화해야 합니다. 이는 분산 시스템의 모범 사례이며 재시도 폭풍 위험을 크게 낮춥니다.
:::

## 커스텀 RetryPolicy

`RetryPolicy` 인터페이스를 구현하면 재시도 동작을 완전히 제어할 수 있습니다. 인터페이스는 세 가지 메서드를 정의합니다:

<!-- check-code: skip -->
```go
type RetryPolicy interface {
    // 재시도 여부 판단. resp는 응답(nil은 요청 오류), err는 오류
    ShouldRetry(resp ResponseReader, err error, attempt int) bool

    // 다음 재시도 전 지연 반환
    GetDelay(attempt int) time.Duration

    // 최대 재시도 횟수 반환
    MaxRetries() int
}
```

:::warning 내부 타입 제한
`RetryPolicy.ShouldRetry`의 `resp` 매개변수 타입 `ResponseReader`는 내부 인터페이스(`internal/types` 패키지에 정의)이므로 외부 패키지에서 직접 참조할 수 없습니다. 따라서 커스텀 `RetryPolicy`는 `github.com/cybergodev/httpc` 모듈 내부에서만 구현할 수 있습니다. 대부분의 시나리오에서는 `RetryConfig` 필드와 `ProxyRotateOnStatus` 구성으로 충분하며, 커스텀 전략이 필요하지 않습니다.
:::

다음 예시는 GET 요청만 재시도하는 커스텀 전략을 보여줍니다(모듈 내부에서만 컴파일 가능):

<!-- check-code: skip -->
```go
// 주의: ResponseReader는 내부 타입(internal/types 패키지)입니다.
// 이 코드는 github.com/cybergodev/httpc 모듈 내부에서만 컴파일됩니다.
// 대부분의 사용자는 RetryConfig와 WithMaxRetries로 재시도를 구성해야 합니다.

// GETOnlyRetryPolicy는 GET 요청만 재시도하며, 네트워크 오류와 502/503/504 시에만 재시도
type GETOnlyRetryPolicy struct {
    maxAttempts int
}

func (p *GETOnlyRetryPolicy) ShouldRetry(resp ResponseReader, err error, attempt int) bool {
    if attempt >= p.maxAttempts {
        return false
    }
    // GET 요청만 재시도(err/resp로 간접 판단 — 비멱등 작업은 재시도하지 않음)
    if err != nil {
        return true // 네트워크 오류 재시도
    }
    if resp == nil {
        return false
    }
    code := resp.StatusCode()
    return code == 502 || code == 503 || code == 504
}

func (p *GETOnlyRetryPolicy) GetDelay(attempt int) time.Duration {
    return time.Second * time.Duration(attempt+1) // 선형 증가: 1s, 2s, 3s...
}

func (p *GETOnlyRetryPolicy) MaxRetries() int {
    return p.maxAttempts
}

// 커스텀 전략 적용
// cfg := httpc.DefaultConfig()
// cfg.Retry.CustomPolicy = &GETOnlyRetryPolicy{maxAttempts: 5}
```

## 요청별 제어

클라이언트 수준 구성 외에도 `WithMaxRetries`로 단일 요청에서 재시도 횟수를 덮어쓸 수 있습니다:

```go
package main

import (
    "context"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // 단일 요청 5회 재시도(클라이언트 기본값 3회 덮어쓰기)
    _, err = client.Get("https://api.example.com/data", httpc.WithMaxRetries(5))
    if err != nil {
        log.Printf("요청 실패: %v", err)
    }

    // 재시도 비활성화(예: 비멱등 POST 작업)
    _, err = client.Post("https://api.example.com/create",
        httpc.WithJSON(map[string]string{"name": "test"}),
        httpc.WithMaxRetries(0),
    )

    // 컨텍스트 타임아웃과 함께 사용
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()
    _, err = client.Request(ctx, "GET", "https://api.example.com/data",
        httpc.WithMaxRetries(3),
    )
}
```

## 프록시 풀과 재시도 상호작용

`ProxyRotateOnStatus` 또는 `ProxyRotatePerRequest`를 구성하면 HTTPC가 자동으로 `MaxRetries`를 높여 프록시 풀의 각 프록시가 최소 한 번 시도되도록 보장합니다. 이는 `calculateMaxRetries`로 구현됩니다:

```
유효 MaxRetries = max(구성된 MaxRetries, len(ProxyPool) - 1)
(상한은 maxRetryAttempts = 10)
```

**예시**: 5개 프록시, 구성 `MaxRetries = 3`:

```
ProxyPool = [proxy1, proxy2, proxy3, proxy4, proxy5]
ProxyRotateOnStatus = [403]   // 또는 ProxyRotatePerRequest = true
구성 MaxRetries = 3

→ 자동으로 4로 조정(= 5 - 1), 5개 프록시 각각 시도 보장
→ 제1회 요청은 proxy1 사용, 실패 시 403 반환
→ 제2회 요청은 proxy2 사용(순환), 실패 시 403 반환
→ 제3회 요청은 proxy3 사용, 실패 시 403 반환
→ 제4회 요청은 proxy4 사용, 실패 시 403 반환
→ 제5회 요청은 proxy5 사용, 실패 시 403 반환
→ 재시도 소진(총 5회 시도 = 1 초기 + 4 재시도)
```

:::tip 왜 len(ProxyPool) - 1인가
최초 요청은 제1번 프록시를 사용하며 재시도로 계산되지 않습니다. 모든 N개 프록시를 시도하려면 N - 1회 재시도가 필요합니다. `calculateMaxRetries`는 `MaxRetries`를 `len(ProxyPool) - 1`로 높여(원래 구성이 더 작은 경우), 의도(모든 프록시 순환)가 충족되도록 보장합니다. 사용자 구성의 `MaxRetries`가 이미 충분히 크면 변경되지 않습니다.
:::

```go
package main

import (
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Connection.ProxyPool = []string{
        "http://proxy1:8080",
        "http://proxy2:8080",
        "http://proxy3:8080",
        "http://proxy4:8080",
        "http://proxy5:8080",
    }
    cfg.Connection.ProxyPoolStrategy = httpc.ProxyStrategyRoundRobin
    cfg.Connection.ProxyRotateOnStatus = []int{403} // 403 시 프록시 순환 트리거
    cfg.Retry.MaxRetries = 3 // 자동으로 4로 증가(= 5-1)

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // 403 수신 시마다 자동으로 프록시 교체 재시도, 최대 5개 프록시 시도
    result, err := client.Get("https://protected-site.example.com/data")
    if err != nil {
        log.Printf("모든 프록시 실패: %v", err)
        return
    }
    log.Printf("성공(특정 프록시 통과): %d", result.StatusCode())
}
```

## 재시도 예산 고려사항

재시도는 요청의 총 소요 시간을 연장합니다. 타임아웃 설계 시 반드시 재시도 지연 예산을 확보해야 합니다.

### 총 최악 시간 공식

```
총 최악 시간 = (MaxRetries + 1) × 요청 타임아웃 + Σ(각 재시도 지연 상한)
```

기본 구성을 예로 들면(`MaxRetries=3`, `Request=180s`, `Delay=1s`, `Backoff=2.0`, `Jitter`):

```
요청 타임아웃 부분: 4 × 180s = 720s(초기 + 3회 재시도, 매번 최대 180s 대기)
재시도 지연 부분: 1.1 + 2.2 + 4.4 ≈ 7.7s(3회 지연의 지터 상한 합)
총 최악 시간: ≈ 727.7s(약 12분)
```

### 총 소요 시간 단축 방법

| 조정 | 효과 |
|------|------|
| `MaxRetries` 감소 | 재시도 횟수 직접 감소, 총 소요 시간 선형 감소 |
| `Timeouts.Request` 감소 | 매 시도마다 더 빠르게 실패 |
| `Retry.Delay` 감소 | 재시도 간격 단축 |
| `BackoffFactor` 감소 | 지연 증가 속도 감소, 초기 재시도 더 빠름 |
| `context.WithTimeout` 덮어쓰기 | 단일 요청의 총 상한 정밀 제어 |

:::warning 재시도와 타임아웃의 충돌
`context.WithTimeout`으로 설정한 마감 시간은 하드입니다 — 재시도 횟수가 남아 있어도 context 만료 후 즉시 종료됩니다. 이는 실제 재시도 횟수가 `MaxRetries`보다 적을 수 있음을 의미합니다. 애플리케이션이 "N회 재시도 보장"이 필요하다면 context 타임아웃을 충분히 길게 설정하세요:

<!-- check-code: skip -->
```go
// 충분한 시간 확보: 3회 재시도 + 지연 + 매 요청 시간
ctx, cancel := context.WithTimeout(context.Background(),
    3*requestTimeout + 10*time.Second)
```
:::

## context 취소와 재시도

HTTPC의 재시도 엔진은 context 취소에 빠른 경로 처리를 합니다. 요청 실패 원인이 `context.Canceled` 또는 `context.DeadlineExceeded`인 경우, `isRetryableError`는 즉시 false를 반환하며 완전한 오류 분류 로직을 건너뜁니다:

<!-- check-code: skip -->
```go
// 내부 구현(retry.go)
func (r *retryEngine) isRetryableError(err error) bool {
    // 빠른 경로: context 오류는 재시도 불가 — 완전한 분류 오버헤드 방지
    if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
        return false
    }
    clientErr := classifyError(err, "", "", 0)
    // ...완전한 분류 로직
}
```

이는 다음을 의미합니다:

- **사용자 수동 취소**(`cancel()`): 즉시 중지, 재시도하지 않음
- **context 타임아웃**: 즉시 중지, 재시도하지 않음
- **진행 중인 요청 취소**: 취소로 인해 추가 재시도가 트리거되지 않음

```go
package main

import (
    "context"
    "errors"
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // 시나리오 1: 수동 취소 — 재시도하지 않음
    ctx1, cancel1 := context.WithCancel(context.Background())
    go func() {
        time.Sleep(100 * time.Millisecond)
        cancel1() // 100ms 후 수동 취소
    }()

    _, err = client.Request(ctx1, "GET", "https://api.example.com/slow")
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) && clientErr.Type == httpc.ErrorTypeContextCanceled {
            fmt.Println("요청이 수동으로 취소됨, 재시도 트리거되지 않음")
        }
    }

    // 시나리오 2: context 타임아웃 — 재시도하지 않음
    ctx2, cancel2 := context.WithTimeout(context.Background(), 50*time.Millisecond)
    defer cancel2()

    _, err = client.Request(ctx2, "GET", "https://api.example.com/slow")
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) && clientErr.Type == httpc.ErrorTypeTimeout {
            fmt.Println("요청이 context 타임아웃으로 종료됨, 재시도 트리거되지 않음")
        }
    }
}
```

## 오류 처리와 재시도

재시도 소진 후 오류는 `ClientError`로 반환되며, `Type`은 `ErrorTypeRetryExhausted`(또는 마지막 시도의 원본 오류 유형), `Attempts` 필드는 총 시도 횟수를 기록합니다:

```go
package main

import (
    "errors"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    _, err = client.Get("https://api.example.com/flaky")
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) {
            log.Printf("실패 유형: %s, 시도 횟수: %d",
                clientErr.Code(), clientErr.Attempts)
            if clientErr.Attempts > 1 {
                log.Println("(자동 재시도했으나 여전히 실패)")
            }
        }
    }
}
```

## 모범 사례

| 시나리오 | 권장 구성 |
|----------|----------|
| API 호출 | `MaxRetries=3, Delay=1s, Backoff=2.0`(기본값) |
| 마이크로서비스 통신 | `MaxRetries=2, Delay=500ms, Backoff=2.0`(빠른 실패) |
| 파일 다운로드 | `MaxRetries=5, Delay=2s, Backoff=2.0`(네트워크 변동 허용) |
| 멱등 작업(GET/PUT/DELETE) | 안심하고 재시도 가능 |
| 비멱등 작업(POST) | `WithMaxRetries(0)` 또는 커스텀 `RetryPolicy`로 축소 |
| 속도 제한 API | `Retry-After` 자동 파싱에 의존(이미 내장됨) |
| 프록시 풀 시나리오 | `ProxyRotateOnStatus`와 함께 사용, 재시도 횟수 자동 증가 |

:::warning 비멱등 POST 요청의 재시도
기본적으로 비멱등 POST 요청은 재시도 가능 상태 코드(예: 500/502/503/504)나 네트워크 오류 수신 시에도 재시도됩니다. 서버가 멱등성을 보장하지 않으면 중복 제출로 인해 부작용이 발생할 수 있습니다(예: 리소스 중복 생성). 정밀 제어 방안:
1. POST 요청에 `WithMaxRetries(0)` 사용하여 재시도 완전 비활성화
2. 또는 커스텀 `RetryPolicy`로 네트워크 오류(HTTP 상태 코드 아님) 시에만 재시도
:::

## 다음 단계

- [오류 처리](./error-handling) — 오류 분류 상세와 센티널 오류 매칭
- [구성 API](../api-reference/client-config/config) — 재시도 구성 필드 참조
- [연결 풀과 프록시](./connection-pool) — 프록시 풀 구성과 순환 전략
- [인터페이스 정의](../api-reference/types/interfaces) — RetryPolicy 인터페이스 참조
