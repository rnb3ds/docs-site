---
sidebar_label: "테스트와 클럭 인젝션"
title: "테스트와 클럭 인젝션 - CyberGo JWT | 고정 클럭 반복 테스트"
description: "테스트와 클럭 인젝션 가이드: ClockProvider 로 FixedClock 고정 클럭을 주입해 단위 테스트에서 시간 흐름을 정밀 제어, 만료·갱신·커스텀 Claims 파싱·폐기 로직을 반복 가능하게 검증합니다."
sidebar_position: 60
---

# 테스트와 클럭 인젝션

`ClockProvider` 인터페이스를 통해 커스텀 클럭을 주입하여 테스트에서 시간을 정밀하게 제어할 수 있습니다.

## ClockProvider 인터페이스

```go
type ClockProvider interface {
    Now() time.Time
}
```

라이브러리는 두 가지 구현을 제공합니다:

| 타입 | 설명 |
|------|------|
| `SystemClock` | 기본값, 시스템 시간 사용 |
| `FixedClock` | 고정 시간, 테스트용 |

## FixedClock

`FixedClock`은 항상 생성 시 지정된 시간을 반환합니다:

```go
fixedTime := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

cfg := jwt.DefaultConfig()
cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
cfg.Clock = jwt.FixedClock{T: fixedTime}
```

## 토큰 만료 테스트

```go
func TestTokenExpiry(t *testing.T) {
    // 고정 시간 설정
    now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    cfg.AccessTokenTTL = 15 * time.Minute
    cfg.Clock = jwt.FixedClock{T: now}

    processor, err := jwt.New(cfg)
    require.NoError(t, err)
    defer processor.Close()

    // now 시점에 토큰 발급
    claims := &jwt.Claims{UserID: "user123"}
    token, err := processor.Create(claims)
    require.NoError(t, err)

    // 현재 시점에서 검증 → 성공
    _, valid, err := processor.Validate(token)
    require.NoError(t, err)
    assert.True(t, valid)

    // 만료 후로 시간 경과 시뮬레이션 → 새로운 Processor 사용
    expiredCfg := cfg
    expiredCfg.Clock = jwt.FixedClock{T: now.Add(16 * time.Minute)}
    expiredProcessor, err := jwt.New(expiredCfg)
    require.NoError(t, err)
    defer expiredProcessor.Close()

    _, _, err = expiredProcessor.Validate(token)
    assert.True(t, errors.Is(err, jwt.ErrTokenExpired))
}
```

## 클럭 스큐 테스트 (ClockSkew)

[`ClockSkew`](./configuration#클럭-스큐-clockskew)는 만료(`exp`)와 시작 전(`nbf`) 검증에 관용 창구를 제공합니다. 편차를 설정하면 토큰이 엄격한 만료 시간 이후 짧은 시간 동안 여전히 수락되는지 검증할 수 있습니다:

```go
func TestClockSkew(t *testing.T) {
    now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

    // 토큰 발급: exp = now + 1h
    issueCfg := jwt.DefaultConfig()
    issueCfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    issueCfg.AccessTokenTTL = time.Hour
    issueCfg.Clock = jwt.FixedClock{T: now}

    issueProc, err := jwt.New(issueCfg)
    require.NoError(t, err)
    defer issueProc.Close()

    token, err := issueProc.Create(&jwt.Claims{UserID: "user123"})
    require.NoError(t, err)

    const skew = 30 * time.Second

    // exp + 10s 는 30s 편차 창 내 → 유효
    withinCfg := jwt.DefaultConfig()
    withinCfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    withinCfg.ClockSkew = skew
    withinCfg.Clock = jwt.FixedClock{T: now.Add(time.Hour + 10*time.Second)}
    withinProc, err := jwt.New(withinCfg)
    require.NoError(t, err)
    defer withinProc.Close()

    _, valid, err := withinProc.Validate(token)
    require.NoError(t, err)
    assert.True(t, valid)

    // exp + 40s 는 30s 편차 창 초과 → 만료
    beyondCfg := jwt.DefaultConfig()
    beyondCfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    beyondCfg.ClockSkew = skew
    beyondCfg.Clock = jwt.FixedClock{T: now.Add(time.Hour + 40*time.Second)}
    beyondProc, err := jwt.New(beyondCfg)
    require.NoError(t, err)
    defer beyondProc.Close()

    _, _, err = beyondProc.Validate(token)
    assert.True(t, errors.Is(err, jwt.ErrTokenExpired))
}
```

::: tip FixedClock 과 속도 제한
속도 제한을 활성화하면 내장 [`RateLimiter`](../api-reference/types#ratelimiter)의 클럭이 `Config.Clock`에서 전파됩니다 — 즉, `FixedClock`을 사용하면 속도 제한기도 동일한 고정 시간을 사용하여 실제 시간 경과로 토큰이 보충되지 않습니다. 이로 인해 속도 제한 테스트가 완전히 예측 가능해집니다. 자세한 내용은 [속도 제한 테스트](#속도-제한-테스트)를 참조하세요.
:::

## 갱신 흐름 테스트

```go
func TestRefreshFlow(t *testing.T) {
    now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    cfg.Clock = jwt.FixedClock{T: now}

    processor, err := jwt.New(cfg)
    require.NoError(t, err)
    defer processor.Close()

    claims := &jwt.Claims{UserID: "user123"}
    refreshToken, err := processor.CreateRefresh(claims)
    require.NoError(t, err)

    // 리프레시 토큰으로 새로운 액세스 토큰 획득
    newToken, err := processor.Refresh(refreshToken)
    require.NoError(t, err)
    assert.NotEmpty(t, newToken)
}
```

## 커스텀 Claims 테스트

```go
func TestCustomClaims(t *testing.T) {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"

    processor, err := jwt.New(cfg)
    require.NoError(t, err)
    defer processor.Close()

    claims := &MyClaims{
        UserID: "user123",
        Email:  "test@example.com",
    }

    token, err := processor.Create(claims)
    require.NoError(t, err)

    result := &MyClaims{}
    parsed, valid, err := processor.ValidateInto(token, result)
    require.NoError(t, err)
    assert.True(t, valid)

    myResult := parsed.(*MyClaims)
    assert.Equal(t, "user123", myResult.UserID)
    assert.Equal(t, "test@example.com", myResult.Email)
}
```

## 입력 검증 테스트

[`Claims`](../api-reference/claims) 필드는 `Create` 시 다층 검증을 받습니다. 테스트에서 초장 문자열, 인젝션 패턴, 제어 문자가 [`ValidationError`](../api-reference/types#validationerror)를 트리거하는지 검증하고, `errors.As`로 필드 수준 정보를 추출할 수 있습니다:

```go
func TestInputValidation(t *testing.T) {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"

    processor, err := jwt.New(cfg)
    require.NoError(t, err)
    defer processor.Close()

    var ve *jwt.ValidationError

    // 초장 문자열이 길이 제한 트리거 (상한 256 문자)
    _, err = processor.Create(&jwt.Claims{
        UserID: strings.Repeat("a", 300),
    })
    require.ErrorAs(t, err, &ve)
    assert.Equal(t, "UserID", ve.Field)
    assert.Contains(t, ve.Message, "maximum length")

    // XSS 인젝션 패턴 탐지
    _, err = processor.Create(&jwt.Claims{
        UserID: "<script>alert(1)</script>",
    })
    require.ErrorAs(t, err, &ve)
    assert.Equal(t, "UserID", ve.Field)
    assert.Equal(t, "suspicious pattern detected", ve.Message)

    // 제어 문자 필터링 (null 바이트 거부)
    _, err = processor.Create(&jwt.Claims{
        UserID: "user\x00inject",
    })
    require.ErrorAs(t, err, &ve)
    assert.Equal(t, "UserID", ve.Field)
    assert.Equal(t, "invalid control character", ve.Message)
}
```

::: warning ValidationError 래핑 계층
`Create` 경로에서 `ValidationError`는 `ErrInvalidClaims`로 래핑됩니다. `errors.As(err, &ve)`를 사용하면 래핑을 관통하여 `ValidationError`를 추출하고 `Field`와 `Message`를 읽어 단언할 수 있습니다. 검증 규칙의 전체 설명은 [설정 상세 → 입력 검증과 보안 강화](./configuration#입력-검증과-보안-강화)를 참조하세요.
:::

## 오류 처리 테스트

```go
func TestRevokeToken(t *testing.T) {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"

    processor, err := jwt.New(cfg)
    require.NoError(t, err)
    defer processor.Close()

    claims := &jwt.Claims{UserID: "user123"}
    token, err := processor.Create(claims)
    require.NoError(t, err)

    // 토큰 폐기
    err = processor.Revoke(token)
    require.NoError(t, err)

    // 검증이 실패해야 함
    _, _, err = processor.Validate(token)
    assert.True(t, errors.Is(err, jwt.ErrTokenRevoked))
}
```

## 속도 제한 테스트

속도 제한을 활성화하면 할당량을 초과한 `Create`가 [`ErrRateLimitExceeded`](../api-reference/errors#센티널-오류)를 반환합니다. `FixedClock`과 함께 사용하면 토큰 버킷이 보충되지 않도록 정밀하게 제어하여 테스트를 완전히 예측 가능하게 만들 수 있습니다:

```go
func TestRateLimit(t *testing.T) {
    now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    cfg.EnableRateLimit = true
    cfg.RateLimitRate = 3               // 윈도우당 3회
    cfg.RateLimitWindow = time.Minute
    cfg.Clock = jwt.FixedClock{T: now}  // 고정 시간 → 토큰 버킷 보충 안 됨

    processor, err := jwt.New(cfg)
    require.NoError(t, err)
    defer processor.Close()

    // 동일한 UserID 가 속도 제한 할당량 공유 (Subject 가 비어있을 때 UserID 로 폴백)
    claims := &jwt.Claims{UserID: "user123"}

    // 처음 3회 생성 성공
    for i := 0; i < 3; i++ {
        _, err := processor.Create(claims)
        require.NoError(t, err, "%d번째 생성은 성공해야 함", i+1)
    }

    // 4번째는 할당량 초과
    _, err = processor.Create(claims)
    assert.True(t, errors.Is(err, jwt.ErrRateLimitExceeded))
}
```

::: tip 속도 제한 키
속도 제한은 `Subject` 클레임을 기준으로 키를 계산; `Subject`가 비어있을 때 `UserID`로 폴백합니다. 테스트에서 동일한 `UserID`를 사용하면 모든 요청이 할당량을 공유하도록 보장할 수 있습니다. 자세한 내용은 [속도 제한](./rate-limiting)을 참조하세요.
:::

## 동시성 안전 테스트

`Processor`의 모든 메서드는 goroutine 안전입니다. `sync.WaitGroup`을 사용하여 `Create`/`Validate`를 동시에 실행하고, panic이나 data race가 없는지 검증합니다:

```go
func TestConcurrentSafety(t *testing.T) {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"

    processor, err := jwt.New(cfg)
    require.NoError(t, err)
    defer processor.Close()

    const goroutines = 50
    const opsPerGoroutine = 20

    var wg sync.WaitGroup
    var success atomic.Int64
    wg.Add(goroutines)

    for i := 0; i < goroutines; i++ {
        go func(id int) {
            defer wg.Done()
            for j := 0; j < opsPerGoroutine; j++ {
                claims := &jwt.Claims{
                    UserID: fmt.Sprintf("user-%d-%d", id, j),
                }
                token, err := processor.Create(claims)
                if err != nil {
                    continue
                }
                if _, valid, err := processor.Validate(token); err == nil && valid {
                    success.Add(1)
                }
            }
        }(i)
    }
    wg.Wait()

    assert.Equal(t, int64(goroutines*opsPerGoroutine), success.Load(),
        "동시 생성과 검증은 모두 성공해야 함")
}
```

::: warning 레이스 탐지
`go test -race ./...`를 실행하여 Go의 레이스 탐지기를 활성화하면, 동시성 테스트에서 숨겨진 data race를 포착할 수 있습니다. 이는 `Processor`의 동시성 안전성을 검증하는 표준 방법이며, 프로덕션 코드의 테스트 스위트는 항상 `-race` 하에서 통과해야 합니다.
:::

## 모범 사례

### 테이블 기반 테스트 권장 사항

| 테스트 시나리오 | 권장 방법 | 핵심 단언 |
|----------|----------|----------|
| 토큰 만료 | `FixedClock`으로 발급 시간 고정, 새 Processor로 만료 시뮬레이션 | `errors.Is(err, ErrTokenExpired)` |
| 클럭 스큐 | `ClockSkew` 설정, 윈도우 경계 검증 | exp + skew 내 유효 / 외 만료 |
| 갱신 흐름 | 리프레시 토큰 생성 후 즉시 `Refresh` | 반환된 토큰이 비어있지 않음 |
| 커스텀 Claims | `ValidateInto`로 대상 타입에 역직렬화 | 필드값 일치 |
| 입력 검증 | 초장 문자열 / 인젝션 패턴 / 제어 문자 | `errors.As`로 `ValidationError` 추출 |
| 속도 제한 | 작은 윈도우 + 낮은 속도 + 고정 클럭 | 초과 시 `ErrRateLimitExceeded` 반환 |
| 동시성 안전 | `goroutine` + `WaitGroup`으로 동시 조작 | panic 없음, data race 없음 |
| 토큰 폐기 | `Revoke` 후 `Validate` | `errors.Is(err, ErrTokenRevoked)` |

:::tip 핵심 원칙
- `FixedClock`을 사용하여 테스트의 **재현성**을 보장 — 시스템 시간에 의존하지 않음
- 각 테스트 케이스마다 **독립적인 Processor**를 생성하여 상태 누수 방지
- `t.Cleanup()` 또는 `defer`를 사용하여 `Close()`가 호출되도록 보장
- 오류 검증 시 문자열 매칭 대신 `errors.Is()` / `errors.As()` 사용
- 동시성 테스트는 항상 `go test -race`와 함께 실행
:::

## 다음 단계

- [API 레퍼런스 → ClockProvider](../api-reference/interfaces#clockprovider) — 클럭 인터페이스
- [API 레퍼런스 → FixedClock](../api-reference/types#fixedclock) — 고정 클럭
- [고급 예제](../examples/advanced) — 클럭 인젝션 예제
