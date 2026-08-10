---
sidebar_label: "기본 예제"
title: "기본 예제 - CyberGo JWT | HMAC 발급과 폐기"
description: "기본 예제: HMAC 대칭 키로 접근 토큰을 발급·검증, 갱신 토큰으로 새 토큰 로테이션, 내장 블랙리스트로 폐기해 로그아웃 세션 차단, 토큰 버킷 속도 제한으로 무차별 남용을 방지, 수신자 격리와 Extra 확장 필드 예제를 포함합니다."
sidebar_position: 10
---

# 기본 예제

## HMAC 서명

가장 일반적인 방식으로, 대칭 키를 사용하여 서명하고 검증합니다.

```go
package main

import (
    "fmt"
    "time"

    "github.com/cybergodev/jwt"
)

func main() {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    cfg.AccessTokenTTL = 15 * time.Minute
    cfg.RefreshTokenTTL = 7 * 24 * time.Hour

    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    // 발급
    claims := &jwt.Claims{
        UserID:      "user123",
        Username:    "alice",
        Role:        "admin",
        Permissions: []string{"read", "write", "delete"},
    }
    token, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }
    fmt.Println("Access Token:", token)

    // 검증
    parsed, valid, err := processor.Validate(token)
    if err != nil {
        panic(err)
    }
    fmt.Println("Valid:", valid)          // 출력: true
    fmt.Println("UserID:", parsed.UserID) // 출력: user123
}
```

## 액세스 토큰과 리프레시 토큰

```go
package main

import (
    "fmt"

    "github.com/cybergodev/jwt"
)

func main() {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    claims := &jwt.Claims{
        UserID:   "user123",
        Username: "alice",
    }

    // 액세스 토큰 생성 (단기)
    accessToken, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }

    // 리프레시 토큰 생성 (장기)
    refreshToken, err := processor.CreateRefresh(claims)
    if err != nil {
        panic(err)
    }

    fmt.Println("Access Token:", accessToken)
    fmt.Println("Refresh Token:", refreshToken)

    // 리프레시 토큰으로 새로운 액세스 토큰 획득
    newAccessToken, err := processor.Refresh(refreshToken)
    if err != nil {
        panic(err)
    }
    fmt.Println("New Access Token:", newAccessToken)
}
```

## 토큰 폐기 (블랙리스트)

```go
package main

import (
    "fmt"

    "github.com/cybergodev/jwt"
)

func main() {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    claims := &jwt.Claims{UserID: "user123", Username: "alice"}
    token, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }

    // 토큰 폐기
    err = processor.Revoke(token)
    if err != nil {
        panic(err)
    }
    fmt.Println("Token revoked")

    // 다시 검증하면 실패함
    _, _, err = processor.Validate(token)
    fmt.Println("Validate error:", err) // token revoked

    // 폐기 여부 확인
    revoked, err := processor.IsRevoked(token)
    if err != nil {
        panic(err)
    }
    fmt.Println("Is revoked:", revoked) // 출력: true
}
```

## 속도 제한 보호

```go
package main

import (
    "fmt"
    "time"

    "github.com/cybergodev/jwt"
)

func main() {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    cfg.EnableRateLimit = true
    cfg.RateLimitRate = 5              // 분당 최대 5 회
    cfg.RateLimitWindow = time.Minute

    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    claims := &jwt.Claims{UserID: "user123", Username: "alice"}

    // 정상 요청
    for i := 0; i < 5; i++ {
        _, err := processor.Create(claims)
        if err != nil {
            fmt.Printf("Request %d: %v\n", i+1, err)
        } else {
            fmt.Printf("Request %d: success\n", i+1)
        }
    }

    // 6 번째 요청은 속도 제한 적용
    _, err = processor.Create(claims)
    fmt.Println("Request 6:", err) // rate limit exceeded
}
```

## 수신자 격리

`ExpectedAudience`를 설정하면 `aud` 클레임에 이 값이 포함된 토큰만 검증을 통과합니다. 이는 마이크로서비스 아키텍처에서 서비스 간 토큰 격리를 구현합니다 — 한 서비스에서 발급한 토큰이 다른 서비스에서 수락되지 않도록 합니다.

```go
package main

import (
    "errors"
    "fmt"

    "github.com/cybergodev/jwt"
)

func main() {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    cfg.ExpectedAudience = "billing-api" // billing-api 용 토큰만 수락

    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    // 수신자가 일치하는 토큰
    validClaims := &jwt.Claims{
        UserID: "user1",
        RegisteredClaims: jwt.RegisteredClaims{
            Audience: jwt.StringOrSlice{"billing-api"},
        },
    }
    validToken, err := processor.Create(validClaims)
    if err != nil {
        panic(err)
    }

    _, valid, err := processor.Validate(validToken)
    if err != nil {
        panic(err)
    }
    fmt.Println("Matching audience valid:", valid) // 출력: true

    // 수신자가 불일치하는 토큰은 거부됨
    wrongClaims := &jwt.Claims{
        UserID: "user2",
        RegisteredClaims: jwt.RegisteredClaims{
            Audience: jwt.StringOrSlice{"admin-api"},
        },
    }
    wrongToken, err := processor.Create(wrongClaims)
    if err != nil {
        panic(err)
    }

    _, valid, err = processor.Validate(wrongToken)
    fmt.Println("Wrong audience valid:", valid) // 출력: false
    fmt.Println("Wrong audience error:", err)   // 출력: token invalid audience
    fmt.Println("Is audience error:",
        errors.Is(err, jwt.ErrTokenInvalidAudience)) // 출력: true
}
```

::: tip 마이크로서비스 시나리오
마이크로서비스 아키텍처에서 각 서비스에 다른 `ExpectedAudience`를 설정하여 (예: `billing-api`, `user-api`), 각 서비스가 자신을 대상으로 하는 토큰만 수락하도록 하여 토큰의 교차 서비스 남용을 방지합니다.
:::

## Extra 확장 필드

내장 `Claims.Extra`는 `map[string]any`로, 소수의 선택적 부가 정보를 저장하는 데 사용됩니다. Processor는 토큰 생성 시 Extra에 대해 심층 검증(길이, 인젝션 탐지)을 수행하므로 커스텀 Claims 필드보다 수고가 덜합니다.

```go
package main

import (
    "fmt"

    "github.com/cybergodev/jwt"
)

func main() {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    // Extra 로 부가 비즈니스 필드 저장 (string 과 []string 값만 지원)
    claims := &jwt.Claims{
        UserID:   "user123",
        Username: "alice",
        Role:     "engineer",
        Extra: map[string]any{
            "team_id": "team-backend",
            "level":   "senior",
            "tags":    []string{"onboarding", "mentor"},
        },
    }
    token, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }

    // 검증 후 Extra 필드 읽기
    parsed, valid, err := processor.Validate(token)
    if err != nil {
        panic(err)
    }
    fmt.Println("Valid:", valid)            // 출력: true
    fmt.Println("UserID:", parsed.UserID)   // 출력: user123

    // 타입 단언으로 Extra 값 읽기
    if teamID, ok := parsed.Extra["team_id"].(string); ok {
        fmt.Println("TeamID:", teamID) // 출력: team-backend
    }
    if level, ok := parsed.Extra["level"].(string); ok {
        fmt.Println("Level:", level) // 출력: senior
    }
    if tags, ok := parsed.Extra["tags"].([]string); ok {
        fmt.Println("Tags:", tags) // 출력: [onboarding mentor]
    }
}
```

::: warning Extra 의 제한
`Extra`는 최대 50개 키이며, 값은 `string`과 `[]string` 타입만 허용되고 중첩 map은 지원하지 않습니다. 더 복잡한 구조나 커스텀 검증이 필요한 경우 [커스텀 Claims 타입](../guides/custom-claims#extra-필드-vs-커스텀-타입)을 사용하세요.
:::

## 더 많은 예제

- [웹 서버 통합](./web-server) — 인증 미들웨어, RBAC, 리프레시, 로그아웃, 우아한 종료
- [고급 예제](./advanced) — RSA, ECDSA, 커스텀 Claims, Redis 블랙리스트, 클럭 인젝션
