---
sidebar_label: "토큰 갱신 및 교체"
title: "토큰 갱신 및 교체 - CyberGo JWT | 액세스 및 리프레시 토큰 전략"
description: "토큰 갱신 및 교체 가이드: 액세스/리프레시 토큰 2계층 TTL 설계, CreateRefresh와 Refresh 흐름, 커스텀 Claims의 RefreshInto 사용법, 재사용 vs 일회성 교체 전략 비교 및 Refresh 비자동 취소 보안 의미."
sidebar_position: 25
check_code: false
---

# 토큰 갱신 및 교체

CyberGo JWT는 2계층 토큰 설계를 사용합니다: 단기 **액세스 토큰**은 API 인증에 사용하고, 장기 **리프레시 토큰**은 액세스 토큰 만료 후 새 토큰을 얻는 데 사용합니다. 이 설계는 보안과 사용자 경험의 균형을 맞춥니다.

## 2계층 토큰 모델

| 토큰 유형 | 발급 메서드 | 기본 TTL | 용도 |
|-----------|-------------|----------|------|
| 액세스 토큰 | [`Create`](../api-reference/processor#create) | 15 분 | API 인증, 빈번한 검증 |
| 리프레시 토큰 | [`CreateRefresh`](../api-reference/processor#createrefresh) | 7 일 | 새 액세스 토큰 교환, 낮은 사용 빈도 |

토큰 유형은 `token_type` 클레임(`access` / `refresh`)으로 표시됩니다. [`Refresh`](../api-reference/processor#refresh) 메서드는 access 유형의 토큰을 거부하여 액세스 토큰이 갱신에 사용되는 것을 방지합니다.

### TTL 설정

```go
cfg := jwt.DefaultConfig()
cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
cfg.AccessTokenTTL = 15 * time.Minute    // 액세스 토큰 유효기간
cfg.RefreshTokenTTL = 7 * 24 * time.Hour // 리프레시 토큰 유효기간 (AccessTokenTTL 보다 길어야 함)
```

:::tip 제약
`Config.Validate()`는 `RefreshTokenTTL > AccessTokenTTL`을 요구하며, 위반 시 `ErrInvalidConfig`를 반환합니다.
:::

## 기본 갱신 흐름

### 1. 토큰 쌍 발급

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

    claims := &jwt.Claims{UserID: "user123", Username: "alice"}

    // 액세스 토큰 (단기)
    accessToken, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }

    // 리프레시 토큰 (장기)
    refreshToken, err := processor.CreateRefresh(claims)
    if err != nil {
        panic(err)
    }

    fmt.Println("Access Token:", accessToken)
    fmt.Println("Refresh Token:", refreshToken)
}
```

### 2. 새 액세스 토큰 갱신

액세스 토큰이 만료되면 리프레시 토큰을 사용하여 새 토큰을 얻습니다:

```go
// refreshToken은 이전에 CreateRefresh로 발급된 토큰
newAccessToken, err := processor.Refresh(refreshToken)
if err != nil {
    switch {
    case errors.Is(err, jwt.ErrTokenExpired):
        // 리프레시 토큰 만료, 사용자 재인증 필요
    case errors.Is(err, jwt.ErrTokenRevoked):
        // 리프레시 토큰이 취소됨
    case errors.Is(err, jwt.ErrTokenTypeMismatch):
        // 리프레시 토큰 대신 액세스 토큰이 전달됨
    default:
        // 기타 오류
    }
    return
}
fmt.Println("New Access Token:", newAccessToken)
```

`Refresh`는 리프레시 토큰을 완전히 검증합니다: 서명, 만료, 발급자, 수신자, 블랙리스트 상태.

## 커스텀 Claims 갱신

커스텀 Claims 타입을 사용할 때, [`RefreshInto`](../api-reference/processor#refreshinto)를 사용하여 파싱 결과를 커스텀 구조체에 채웁니다:

```go
type MyClaims struct {
    UserID string `json:"user_id"`
    Role   string `json:"role"`
    jwt.RegisteredClaims
}

func (c *MyClaims) GetRegisteredClaims() *jwt.RegisteredClaims {
    return &c.RegisteredClaims
}

func (c *MyClaims) Validate() error {
    if c.UserID == "" {
        return errors.New("user_id is required")
    }
    return nil
}
```

```go
// 커스텀 Claims로 리프레시 토큰 발급
refreshToken, err := processor.CreateRefresh(&MyClaims{UserID: "123", Role: "admin"})

// 커스텀 구조체로 갱신
result := &MyClaims{}
newToken, err := processor.RefreshInto(refreshToken, result)
```

## 교체 전략

### 재사용 모드 (기본값)

기본적으로 `Refresh`는 원래 리프레시 토큰을 취소**하지 않습니다**. 원래 토큰은 만료되거나 명시적으로 취소될 때까지 유효하며, 여러 번 사용할 수 있습니다:

```go
// 첫 번째 갱신
token1, err := processor.Refresh(refreshToken)
if err != nil {
    panic(err)
}

// 동일한 refreshToken이 여전히 유효하며 다시 갱신 가능
token2, err := processor.Refresh(refreshToken)
if err != nil {
    panic(err)
}
```

**적용 시나리오**: 모바일 앱, 단일 기기 로그인. 사용자가 빈번하게 재인증할 필요가 없으며, 리프레시 토큰은 TTL 내에서 반복 사용할 수 있습니다.

### 일회성 교체

보안 요구사항이 높은 시나리오에서는 갱신 후 즉시 이전 리프레시 토큰을 취소하여 일회성 사용을 구현합니다:

```go
// 갱신 후 즉시 이전 토큰 취소
newAccessToken, err := processor.Refresh(refreshToken)
if err != nil {
    panic(err)
}

// 이전 리프레시 토큰을 취소하여 재사용 불가
if err := processor.Revoke(refreshToken); err != nil {
    panic(err)
}
```

**적용 시나리오**: 웹 애플리케이션, 고보안 시스템. 갱신 후 이전 토큰이 즉시 무효화되어 토큰 유출 위험을 줄입니다.

### 전략 비교

| 차원 | 재사용 모드 | 일회성 교체 |
|------|-------------|-------------|
| 보안성 | 낮음 (유출된 토큰 반복 사용 가능) | 높음 (유출된 토큰은 일회성만 가능) |
| 사용자 경험 | 양호 (빈번한 재인증 불필요) | 보통 (갱신 실패 시 재로그인 필요) |
| 구현 복잡도 | 추가 코드 불필요 | `Revoke` 호출 필요 |
| 블랙리스트 부하 | 낮음 | 높음 (각 갱신마다 기록 추가) |

:::warning 리프레시 토큰 유출 탐지
일회성 교체 모드에서 공격자가 취소된 리프레시 토큰을 사용하면 `Refresh`가 `ErrTokenRevoked`를 반환합니다. 애플리케이션 계층에서 이를 통해 토큰 유출을 탐지하고 강제 재인증을 수행할 수 있습니다.
:::

## 타입 안전성

CyberGo JWT는 `token_type` 클레임으로 토큰 유형을 구분합니다. `Refresh`와 `RefreshInto`는 액세스 토큰을 거부합니다:

```go
// 액세스 토큰으로 갱신 시도는 거부됨
_, err := processor.Refresh(accessToken)
// err는 ErrTokenTypeMismatch를 래핑: expected refresh token, got access token
```

이는 액세스 토큰이 새 토큰 획득에 사용되는 것을 방지하여 2계층 모델의 타입 격리를 보장합니다.

`token_type` 클레임이 없는 토큰(이전 버전에서 발급된 토큰)은 하위 호환성을 위해 허용됩니다.

## 보안 주의사항

- **Refresh는 자동 취소하지 않음**: 원래 리프레시 토큰은 `Refresh` 후에도 유효합니다. 일회성 교체를 위해서는 수동으로 `Revoke`를 호출해야 합니다.
- **Claims 심층 검증 안 함**: `Refresh`는 표준 JWT 필드(서명, 만료, 발급자, 수신자, 블랙리스트)와 기본 구조(UserID 또는 Username이 비어 있지 않음)를 검증하지만, 필드 길이 제한과 인젝션 패턴은 재검증하지 않으며 생성 시 검증되었음을 신뢰합니다.
- **서명 일관성**: 새 액세스 토큰은 리프레시 토큰과 동일한 서명 알고리즘과 키를 사용합니다. 알고리즘 간 교차 갱신은 지원되지 않습니다.

## 다음 단계

- [토큰 블랙리스트](./blacklist) — 취소 메커니즘과 커스텀 저장소 백엔드
- [오류 처리](./error-handling) — 전체 센티널 오류 분류 및 처리
- [설정 상세](./configuration) — TTL, 발급자, 수신자 및 클록 스큐 설정
- [Processor API](../api-reference/processor) — `Refresh`, `RefreshInto`, `CreateRefresh` 전체 서명
