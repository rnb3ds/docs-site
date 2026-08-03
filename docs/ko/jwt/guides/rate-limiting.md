---
sidebar_label: "속도 제한"
title: "속도 제한 - CyberGo JWT | 토큰 버킷 속도 제한"
description: "속도 제한 가이드: 토큰 버킷으로 발급 인터페이스의 윈도우당 최대 요청 수를 설정하고, Subject·UserID·RateLimitKeyer 우선순위 조회, 내장과 커스텀 분산 속도 제한 구현을 지원합니다."
sidebar_position: 40
---

# 속도 제한

속도 제한은 토큰 발급 인터페이스의 악용 (예: 무차별 대입 공격) 을 방지하는 데 사용됩니다.

## 작동 방식

토큰 버킷 알고리즘을 사용하여 지정된 시간 윈도우 내에서 각 키당 최대 요청 수를 제한합니다.

```text
Create(claims) → 속도 제한 키 추출 → RateLimitProvider 확인 → 허용/거부
```

### 토큰 버킷 알고리즘 상세

내장 [`RateLimiter`](../api-reference/types#ratelimiter)는 토큰 버킷(token bucket) 알고리즘을 사용하며, 단순한 고정 윈도우 카운터가 아닙니다. 각 속도 제한 키는 독립적인 버킷에 대응하며, 버킷 내에는 남은 토큰 수 `tokens`와 마지막 보충 시간 `lastRefill`이 기록됩니다.

**비례 보충 토큰**: 매 요청 시, 마지막 보충 이후 경과한 시간에 비례하여 보충할 토큰 수를 계산합니다:

```text
tokensToAdd = (maxRate × elapsed) / window
```

여기서 `elapsed`는 마지막 보충 이후의 나노초 수, `window`는 속도 제한 윈도우입니다. 보충 후 토큰 수는 `maxRate`(상한)를 초과하지 않아, 설정된 속도를 넘지 않도록 보장합니다.

**잔여 시간 보존**: 토큰 보충 후 `lastRefill`은 현재 시간으로 재설정되지 않고, 보충된 토큰에 해당하는 「소비된」 시간만큼만 전진합니다:

```text
consumedNano = (tokensToAdd × window) / maxRate
lastRefill += consumedNano
```

이 메커니즘은 토큰 보충의 불균일을 방지합니다 — 매번 `lastRefill`을 `now`로 재설정하면 계산되지 않은 잔여 시간이 버려져 실제 보충 속도가 높아집니다.

:::tip 토큰 버킷 vs 고정 윈도우
고정 윈도우 카운터는 윈도우 경계에서 갑자기 `maxRate`개의 요청을 통과시킵니다 (예: 59초에 100회, 1초에 다시 100회를 허용하여 순간적으로 200회). 토큰 버킷은 비례적으로 토큰을 지속 보충하여 트래픽 곡선이 더 매끄럽고, API 속도 제한 시나리오에 더 적합합니다.
:::

## 설정

```go
cfg := jwt.DefaultConfig()
cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
cfg.EnableRateLimit = true
cfg.RateLimitRate = 100              // 윈도우당 최대 요청 수
cfg.RateLimitWindow = time.Minute    // 시간 윈도우
```

| 필드 | 기본값 | 설명 |
|------|--------|------|
| `EnableRateLimit` | `false` | 속도 제한 활성화 여부 |
| `RateLimitRate` | `100` | 윈도우당 최대 요청 수 |
| `RateLimitWindow` | `1m` | 시간 윈도우 |

:::tip 참고
속도 제한은 모든 토큰 발급 메서드에 적용됩니다: `Create()`, `CreateRefresh()`, `Refresh()`, `RefreshInto()`. `Validate()`와 `ValidateInto()`에는 영향을 주지 않습니다.
:::

## 속도 제한 키

속도 제한은 키 기반으로 격리되며, 키의 조회 우선순위는 다음과 같습니다:

1. `RegisteredClaims.Subject` — 비어있지 않은 경우
2. `*Claims.UserID` — 내장 Claims 에만 해당
3. `RateLimitKey()` — `RateLimitKeyer` 인터페이스를 구현한 경우
4. 빈 문자열 — 속도 제한 검사 건너뜀

### 커스텀 속도 제한 키

```go
type MyClaims struct {
    UserID string `json:"user_id"`
    Email  string `json:"email"`
    jwt.RegisteredClaims
}

// RateLimitKeyer 인터페이스 구현
func (c *MyClaims) RateLimitKey() string {
    return c.Email
}
```

## 배치 확인 AllowN

[`Allow`](../api-reference/types#ratelimiter)는 단일 요청을 확인하지만, 구체 타입 [`*RateLimiter`](../api-reference/types#ratelimiter)의 확장 메서드 `AllowN`은 `n`회 요청이 가능한지 한 번에 판단합니다:

```go
func (rl *RateLimiter) AllowN(key string, n int) bool
```

`AllowN`의 동작은 다음과 같습니다:

| 조건 | 반환값 |
|------|--------|
| `n < 0` | `false` |
| `n == 0` | `true` |
| `n > maxRate` | `false` (단일 배치로 윈도우 상한을 초과할 수 없음) |
| `key == ""` | `false` |
| 버킷 내 토큰 ≥ `n` | `true` (`n`개 토큰 소비) |
| 버킷 내 토큰 < `n` | `false` |

적용 시나리오: 한 번의 조작으로 여러 할당량을 소비해야 할 때 (예: 배치 발급, 가중 과금) 여러 번의 `Allow` 대신 한 번의 `AllowN`을 사용하면, 락 경합을 줄이면서 원자성을 보장할 수 있습니다.

```go
package main

import (
    "fmt"
    "time"

    "github.com/cybergodev/jwt"
)

func main() {
    limiter := jwt.NewRateLimiter(100, time.Minute)
    defer limiter.Close()

    // 10개 할당량을 한 번에 신청 (예: 토큰 10개 배치 발급)
    if limiter.AllowN("user:123", 10) {
        fmt.Println("배치 작업 허용") // 출력: 배치 작업 허용
    }

    // 90개 토큰 남음, 95개 신청 시 거부
    fmt.Println(limiter.AllowN("user:123", 95)) // 출력: false
}
```

## 내장 RateLimiter

`NewRateLimiter`를 사용하여 독립적인 속도 제한기를 생성:

```go
limiter := jwt.NewRateLimiter(100, time.Minute)

if limiter.Allow("user:123") {
    // 허용
} else {
    // 거부
}

limiter.Reset("user:123") // 카운터 초기화
defer limiter.Close()
```

### 용량과 축출

내장 `RateLimiter`는 최대 10000개의 서로 다른 속도 제한 키(`maxBuckets = 10000`)를 추적하여, 악의적으로 대량의 키를 생성해 메모리를 고갈시키는 것을 방지합니다. 버킷 수가 상한에 도달하면 다음 전략으로 축출합니다:

1. **만료 축출**: 먼저 `lastRefill`이 현재로부터 2배 윈도우 시간을 초과한 버킷을 정리합니다 (만료된 것으로 간주, 더 이상 활성 아님).
2. **배치 축출 가장 오래된 10%**: 여전히 가득 찬 경우, 모든 버킷을 스캔하여 `lastRefill`이 가장 오래된 약 10% (최소 1개)를 축출하여 새 키를 위한 공간을 확보합니다.

:::tip 배치 축출을 사용하는 이유
매번 버킷 1개만 축출하려면 매 삽입마다 전체 스캔(O(n))이 필요하지만, 약 10%를 한 번에 축출하면 이후 약 1000번의 삽입에서 스캔이 불필요합니다. 이로 인해 가득 찬 상태에서의 단일 축출 분할 상환 비용이 O(n)에서 약 O(n/1000)로 감소하여, 락 보유 시간이 크게 줄어듭니다.
:::

## 커스텀 속도 제한기

[`RateLimitProvider`](../api-reference/interfaces#ratelimitprovider) 인터페이스를 구현:

```go
type RateLimitProvider interface {
    Allow(key string) bool
    Reset(key string)
    Close()
}
```

:::tip AllowN 에 대하여
인터페이스 자체는 단일 판단 `Allow`만 정의합니다. 배치 판단 메서드 `AllowN(key string, n int) bool`는 구체 타입 [`*RateLimiter`](../api-reference/types#ratelimiter)의 확장 메서드로, 이 인터페이스에 속하지 않습니다.
:::

예를 들어 Redis 를 연동하여 분산 속도 제한을 구현:

```go
cfg.RateLimiter = &RedisRateLimiter{client: rdb}
```

### Redis 분산 속도 제한기 예제

내장 `RateLimiter`는 프로세스 내부에 있으며, 다중 인스턴스 배포 시 각 인스턴스의 카운트가 독립적이어서 공유할 수 없습니다. 다음은 Redis 기반의 분산 속도 제한기로, 고정 윈도우 + INCR 원자 카운트 방식을 사용하여 다중 인스턴스 시나리오에 적합합니다:

<!-- check-code: skip -->
```go
package main

import (
    "context"
    "fmt"
    "time"

    "github.com/cybergodev/jwt"
    "github.com/redis/go-redis/v9"
)

// RedisRateLimiter Redis 기반 분산 속도 제한기 (고정 윈도우 + INCR 원자 카운트).
type RedisRateLimiter struct {
    client *redis.Client
    rate   int
    window time.Duration
}

func NewRedisRateLimiter(client *redis.Client, rate int, window time.Duration) *RedisRateLimiter {
    return &RedisRateLimiter{client: client, rate: rate, window: window}
}

// Allow 는 Redis INCR 원자 증분 카운트를 사용하며, 첫 증분 시 만료 시간을 윈도우로 설정.
func (r *RedisRateLimiter) Allow(key string) bool {
    ctx := context.Background()
    fullKey := "ratelimit:" + key

    count, err := r.client.Incr(ctx, fullKey).Result()
    if err != nil {
        return false // Redis 장애 시 거부, 백엔드 보호
    }
    if count == 1 {
        // 첫 요청, 윈도우 만료 설정
        r.client.Expire(ctx, fullKey, r.window)
    }
    return count <= int64(r.rate)
}

// Reset 은 지정된 키의 카운트를 초기화.
func (r *RedisRateLimiter) Reset(key string) {
    r.client.Del(context.Background(), "ratelimit:"+key)
}

// Close 리소스 해제 (Redis 연결은 호출자가 관리, 여기서는 빈 구현).
func (r *RedisRateLimiter) Close() {}

func main() {
    rdb := redis.NewClient(&redis.Options{Addr: "localhost:6379"})

    limiter := NewRedisRateLimiter(rdb, 100, time.Minute)
    if limiter.Allow("user:123") {
        fmt.Println("허용") // 출력: 허용
    }

    // JWT 설정에 주입, 내장 프로세스 내 속도 제한기 교체
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    cfg.EnableRateLimit = true
    cfg.RateLimiter = limiter

    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()
    fmt.Println("프로세서 생성 성공") // 출력: 프로세서 생성 성공
}
```

:::warning 주의
이 예제는 고정 윈도우 알고리즘(Redis INCR + EXPIRE)을 사용하여, 내장 `RateLimiter`의 토큰 버킷 알고리즘과 동작이 약간 다릅니다: 고정 윈도우는 경계에서 버스트가 발생할 수 있지만, 분산 시나리오에 충분히 실용적입니다. 엄격한 토큰 버킷 의미가 필요한 경우, Lua 스크립트로 토큰 버킷 보충 로직을 구현할 수 있습니다.
:::

## 속도 제한 초과

요청이 속도 제한 임계값을 초과하면, 토큰 발급 메서드 (`Create()`, `CreateRefresh()`, `Refresh()`, `RefreshInto()`) 가 `ErrRateLimitExceeded`를 반환합니다:

```go
token, err := processor.Create(claims)
if errors.Is(err, jwt.ErrRateLimitExceeded) {
    // 속도 제한 처리: 429 Too Many Requests 반환
}
```

## 다음 단계

- [API 레퍼런스 → RateLimitProvider](../api-reference/interfaces#ratelimitprovider) — 인터페이스 정의
- [API 레퍼런스 → RateLimiter](../api-reference/types#ratelimiter) — 내장 구현
- [기본 예제](../examples/basic) — 속도 제한 예제
