---
sidebar_label: "설정 상세"
title: "설정 상세 - CyberGo JWT | 설정 필드와 보안 강화"
description: "설정 상세 가이드: 발급자/수신자 검증, 클럭 스큐 허용, 필수 만료, TTL 설계를 포함한 Config 전체 필드와 내장 입력 검증의 길이 제한, 인젝션 패턴 탐지, ValidationError 오류 처리를 안내합니다."
sidebar_position: 15
check_code: false
---

# 설정 상세

[`Config`](../api-reference/config)는 CyberGo JWT의 통합 설정 진입점입니다. 이 페이지는 서명 알고리즘 이외의 보안 및 동작 설정 필드에 중점을 둡니다; 서명 키와 알고리즘 선택은 [서명 알고리즘](./signing-algorithms)을 참조하세요.

## 설정 개요

[`DefaultConfig()`](../api-reference/functions#defaultconfig)는 합리적인 기본값을 제공하며, 비밀 키만 설정하면 됩니다:

| 필드 | 기본값 | 설명 |
|------|--------|------|
| `AccessTokenTTL` | 15 분 | 액세스 토큰 유효기간 |
| `RefreshTokenTTL` | 7 일 | 리프레시 토큰 유효기간 |
| `Issuer` | `"jwt-service"` | `iss` 클레임에 기록 및 검증 |
| `SigningMethod` | `HS256` | 서명 알고리즘 |
| `ClockSkew` | 0 | 클럭 스큐 허용 |
| `RequireExpiration` | `false` | `exp` 클레임 필수 여부 |
| `ExpectedAudience` | `""` (검증 안 함) | 예상 수신자 |

### normalizeConfig 자동 채우기 규칙

[`New()`](../api-reference/functions#new)는 검증 전에 `normalizeConfig`를 호출하여 제로 값 필드를 기본값으로 채웁니다. 각 규칙은 다음 표에 정리되어 있습니다:

| 제로 값 조건 | 채워지는 기본값 | 트리거 조건 |
|----------|-------------|----------|
| `AccessTokenTTL == 0` | 15 분 | 항상 |
| `RefreshTokenTTL == 0` | 7 일 | 항상 |
| `Issuer == ""` | `"jwt-service"` | 항상 |
| `SigningMethod == ""` | `HS256` | 항상 |
| `RateLimitRate == 0` | 100 | `EnableRateLimit == true`인 경우만 |
| `RateLimitWindow == 0` | 1 분 | `EnableRateLimit == true`인 경우만 |
| `Blacklist.MaxSize == 0` | 100000 | 내장 저장소인 경우만 (`Store == nil`) |
| `Blacklist.CleanupInterval == 0` | 5 분 | 내장 저장소인 경우만 |
| `Blacklist.EnableAutoCleanup` | `true` 강제 | 내장 저장소인 경우만 |

::: tip 속도 제한 기본값이 트리거되는 시기
`RateLimitRate`와 `RateLimitWindow`의 기본값은 **`EnableRateLimit`가 `true`인 경우에만** 채워집니다. `EnableRateLimit`가 `false`(기본값)이면 속도 제한이 활성화되지 않으며, 이 두 필드는 무시됩니다. 자세한 내용은 [속도 제한](./rate-limiting)을 참조하세요.
:::

::: warning 커스텀 BlacklistStore 는 채우기 건너뜀
`Blacklist.Store`가 `nil`이 아닌 경우(커스텀 저장소 백엔드 사용), `MaxSize`, `CleanupInterval`, `EnableAutoCleanup` 세 필드 모두 무시됩니다 — 저장소 관리는 백엔드가 자체적으로 담당합니다. 내장 저장소의 `EnableAutoCleanup`은 무한 메모리 증가를 방지하기 위해 `true`로 강제됩니다.
:::

## 발급자 및 수신자 검증

### Issuer (발급자)

`Issuer`를 설정하면 토큰 생성 시 `iss` 클레임에 기록하고, 검증 시 일관성을 확인합니다:

```go
cfg := jwt.DefaultConfig()
cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
cfg.Issuer = "my-app-v1" // 토큰에 iss: "my-app-v1" 포함
```

검증 시 토큰의 `iss`가 설정값과 일치하지 않으면 `ErrTokenInvalidIssuer`를 반환합니다.

### ExpectedAudience (예상 수신자)

`ExpectedAudience`를 설정하면 검증 시 토큰의 `aud` 클레임에 이 값이 포함되어 있는지 확인합니다:

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
    cfg.ExpectedAudience = "billing-api"

    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    // 수신자가 일치하는 토큰
    claims := &jwt.Claims{
        UserID: "user1",
        RegisteredClaims: jwt.RegisteredClaims{
            Audience: jwt.StringOrSlice{"billing-api"},
        },
    }
    token, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }

    _, valid, _ := processor.Validate(token)
    fmt.Println("Valid:", valid)
    // 출력: Valid: true

    // 수신자가 불일치하는 토큰은 거부됨
    wrongClaims := &jwt.Claims{
        UserID: "user2",
        RegisteredClaims: jwt.RegisteredClaims{
            Audience: jwt.StringOrSlice{"admin-api"},
        },
    }
    wrongToken, _ := processor.Create(wrongClaims)
    _, valid, _ = processor.Validate(wrongToken)
    fmt.Println("Wrong audience valid:", valid)
    // 출력: Wrong audience valid: false
}
```

::: tip 멀티 서비스 시나리오
마이크로서비스 아키텍처에서 각 서비스에 다른 `ExpectedAudience`를 설정하여, 한 서비스에서 발급된 토큰이 다른 서비스에서 수락되지 않도록 서비스 간 토큰 격리를 구현합니다.
:::

## 클럭 스큐 (ClockSkew)

`ClockSkew`는 `exp`(만료)와 `nbf`(시작 전) 검증에 관용 창구를 제공하여, 발급자와 검증자 간의 클록 드리프트를 허용합니다. 편차는 두 시간 클레임에 대칭적으로 작용합니다:

- **`exp` 방향**: 토큰이 `exp + ClockSkew` 이후에야 만료된 것으로 간주 — 만료 검증 완화
- **`nbf` 방향**: 토큰이 `nbf - ClockSkew` 이전부터 유효한 것으로 간주 — 시작 전 검증 완화

```go
cfg := jwt.DefaultConfig()
cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
cfg.ClockSkew = 30 * time.Second // 30초 클록 편차 허용
```

::: warning 권장사항
분산 시스템에서 서버 간 클록 편차는 수 초일 수 있습니다. `ClockSkew = 30s ~ 60s` 설정을 권장합니다. 제로 값(기본값)은 관용 없이 엄격한 검증을 의미합니다.
:::

### ClockSkew 가 토큰 유효성에 미치는 영향

아래 표는 `ClockSkew = 30s`일 때, `exp = 12:00:00`, `nbf = 12:00:00`인 토큰이 각 검증 시점에서의 유효성을 보여줍니다:

| 검증 시간 | exp 와의 관계 | nbf 와의 관계 | 결과 |
|----------|--------------|--------------|------|
| `11:59:20` | 만료 전 | `nbf - 40s` (편차 초과) | 무효: `ErrTokenNotValidYet` |
| `11:59:40` | 만료 전 | `nbf - 20s` (편차 창 내) | 유효 |
| `12:00:00` | 만료 전 | `nbf` 시각 | 유효 |
| `12:00:10` | `exp + 10s` (편차 창 내) | 이미 유효 | 유효 |
| `12:00:40` | `exp + 40s` (편차 초과) | 이미 유효 | 무효: `ErrTokenExpired` |

::: tip 편차는 완화만, 강화하지 않음
`ClockSkew`는 토큰의 수용 창을 넓힐 뿐, 엄격한 검증에서의 창을 좁히지 않습니다. 제로 값은 RFC 7519의 엄격한 의미와 동등합니다: 토큰은 정확히 `nbf`에 유효해지고 정확히 `exp`에 만료됩니다.
:::

`ClockSkew`는 음수일 수 없으며, `Config.Validate()`는 `ErrInvalidConfig`를 반환합니다.

## 필수 만료 (RequireExpiration)

기본적으로(`RequireExpiration = false`) `exp` 클레임이 없는 토큰은 만료되지 않습니다. 이는 RFC 7519에서 합법적이지만, 보안에 민감한 시나리오에서는 위험할 수 있습니다.

`RequireExpiration = true`를 설정하면 검증 시 `exp` 클레임이 없는 토큰을 거부합니다:

```go
cfg := jwt.DefaultConfig()
cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
cfg.RequireExpiration = true // exp가 없는 토큰 거부
```

::: tip 보안 강화
이 라이브러리에서 발급한 토큰은 항상 `exp`를 포함(TTL에서 파생)하므로, `RequireExpiration`은 주로 다른 발급자의 토큰이나 `exp`가 없는 이전 토큰에 영향을 미칩니다. 프로덕션 환경에서 활성화를 권장합니다.
:::

## 토큰 TTL 설계

액세스 토큰과 리프레시 토큰의 TTL은 비즈니스 시나리오에 따라 보안과 경험의 균형을 맞춰야 합니다:

| 시나리오 | AccessTokenTTL | RefreshTokenTTL | 설명 |
|----------|----------------|-----------------|------|
| 고보안 (금융, 의료) | 5 분 | 1 시간 | 짧은 TTL로 노출 창 제한 |
| 웹 애플리케이션 | 15 분 | 7 일 | 기본값, 보안과 경험의 균형 |
| 모바일 앱 | 30 분 | 30 일 | 긴 TTL로 재로그인 감소 |
| 내부 서비스 | 1 시간 | 24 시간 | 내부망 신뢰도 높음 |

::: warning 제약
`Config.Validate()`는 `AccessTokenTTL < RefreshTokenTTL`을 요구하며, 둘 다 양수여야 합니다.
:::

## 설정 검증 매트릭스

`Config.Validate()`는 `New()`에서 `normalizeConfig` 이후에 실행되며, 세 가지 오류를 반환합니다: `ErrInvalidConfig`, `ErrInvalidSecretKey`, `ErrInvalidSigningMethod`.

### 서명 키 검증 (알고리즘별)

| 알고리즘 패밀리 | `SigningKey` 요구사항 | `VerificationKey` (선택) |
|--------|-------------------|--------------------------|
| HMAC (HS256/384/512) | `SecretKey` 문자열 ≥ 32 바이트 + 약한 키가 아님 | 해당 없음 (HMAC 대칭) |
| RSA (RS/PS 256/384/512) | `*rsa.PrivateKey` ≥ 2048 비트 | `*rsa.PublicKey` ≥ 2048 비트 |
| ECDSA (ES256/384/512) | `*ecdsa.PrivateKey`, 곡선이 알고리즘과 매칭 | `*ecdsa.PublicKey` |

::: tip VerificationKey 의 역할
`VerificationKey`를 설정하면 토큰 검증 시 개인 키가 아닌 공개 키를 사용합니다 — 검증만 하고 서명하지 않는 서비스(예: 리소스 서버)에 적합합니다. 생략 시 `SigningKey`의 개인 키로 검증합니다. 자세한 내용은 [서명 알고리즘](./signing-algorithms)을 참조하세요.
:::

### Config.Validate() 전체 검사 항목

| 검사 항목 | 조건 | 반환 오류 |
|--------|------|----------|
| 설정 포인터 | `nil` | `ErrInvalidConfig` |
| HMAC 키 길이 | `SecretKey < 32` 바이트 | `ErrInvalidSecretKey` |
| HMAC 키 강도 | 약한 키 (저엔트로피/저복잡도) | `ErrInvalidSecretKey` |
| RSA 서명 키 타입 | `*rsa.PrivateKey`가 아님 | `ErrInvalidSecretKey` |
| RSA 서명 키 강도 | `< 2048` 비트 | `ErrInvalidSecretKey` |
| RSA 검증 키 타입 | `*rsa.PublicKey`가 아님 (설정 시) | `ErrInvalidSecretKey` |
| RSA 검증 키 강도 | `< 2048` 비트 (설정 시) | `ErrInvalidSecretKey` |
| ECDSA 서명 키 타입 | `*ecdsa.PrivateKey`가 아님 | `ErrInvalidSecretKey` |
| ECDSA 곡선 매칭 | 곡선이 알고리즘과 불일치 (예: ES256은 P-256 필요) | `ErrInvalidSecretKey` |
| ECDSA 검증 키 타입 | `*ecdsa.PublicKey`가 아님 (설정 시) | `ErrInvalidSecretKey` |
| 서명 알고리즘 | 12가지 내장 알고리즘에 없음 | `ErrInvalidSigningMethod` |
| AccessTokenTTL | `<= 0` | `ErrInvalidConfig` |
| RefreshTokenTTL | `<= 0` | `ErrInvalidConfig` |
| TTL 관계 | `AccessTokenTTL >= RefreshTokenTTL` | `ErrInvalidConfig` |
| ClockSkew | `< 0` | `ErrInvalidConfig` |
| Blacklist MaxSize | `<= 0` (내장 저장소만) | `ErrInvalidConfig` |
| Blacklist CleanupInterval | `<= 0` (내장 저장소만) | `ErrInvalidConfig` |

::: tip 검증 순서
`Validate()`는 먼저 서명 키를 검증하고(`ErrInvalidSecretKey` 또는 `ErrInvalidSigningMethod` 반환), 그 다음 TTL, ClockSkew, Blacklist 설정을 검증합니다(`ErrInvalidConfig` 반환). 키가 유효하지 않으면 이후 검사는 실행되지 않습니다 — 첫 번째 오류를 수정한 후 다시 테스트하세요.
:::

## 입력 검증과 보안 강화

CyberGo JWT는 [`Claims`](../api-reference/claims) 필드에 다층 입력 검증을 적용하여 인젝션 공격과 비정상 데이터를 방지합니다.

### 필드 제약

| 검증 항목 | 제한 | 트리거되는 오류 |
|----------|------|-----------------|
| 문자열 필드 길이 | ≤ 256 문자 | `ValidationError` |
| 배열 크기 (permissions, scopes, audience) | ≤ 100 항목 | `ValidationError` |
| Extra 필드 수 | ≤ 50 개 | `ValidationError` |
| Extra 값 타입 | `string`, `[]string` | `ValidationError` (중첩 map 거부) |

검증되는 문자열 필드에는 `UserID`, `Username`, `Role`, `SessionID`, `ClientID`와 `RegisteredClaims`의 `Issuer`, `Subject`, `ID`, `TokenType`이 포함됩니다.

### 인젝션 패턴 탐지

라이브러리는 46가지 위험 패턴 탐지를 내장하며, XSS, SQL 인젝션, 경로 탐색 등의 공격 벡터를 다룹니다:

- **XSS**: `<script>`, `javascript:`, `onerror=`, `<iframe>` 등 HTML/JS 인젝션 태그
- **SQL 인젝션**: `drop table`, `union select` 등
- **경로 탐색**: `../`, `/etc/passwd`, `file://`
- **제어 문자**: Tab(9), 줄바꿈(10), 캐리지 리턴(13)을 제외한 ASCII < 32 문자

위험 패턴이 탐지되면 `ValidationError`를 반환하며, `Field`는 필드명, `Message`는 `"suspicious pattern detected"`입니다.

### 검증 오류 처리

```go
token, err := processor.Create(claims)
if err != nil {
    var ve *jwt.ValidationError
    if errors.As(err, &ve) {
        fmt.Printf("필드: %s, 이유: %s\n", ve.Field, ve.Message)
        // 필드: user_id, 이유: suspicious pattern detected
    }
}
```

`ValidationError`는 `Unwrap()`을 구현하여 `errors.Is`와 `errors.As`로 기저 오류를 추적할 수 있습니다. `Create`와 `Validate` 경로에서 검증 오류는 `ErrInvalidClaims`로 래핑됩니다.

::: tip 커스텀 Claims 검증
`CustomClaims` 인터페이스를 구현하는 타입의 커스텀 필드는 심층 검증되지 않습니다 — 구현자가 `Validate()` 메서드에서 직접 처리해야 합니다. 표준 JWT 필드(`iss`, `sub`, `jti` 등)의 길이 및 인젝션 검증은 항상 실행됩니다. [커스텀 Claims](./custom-claims)를 참조하세요.
:::

## 다음 단계

- [서명 알고리즘](./signing-algorithms) — 알고리즘 선택 및 키 설정
- [커스텀 Claims](./custom-claims) — CustomClaims 인터페이스 구현
- [토큰 갱신 및 교체](./token-refresh) — 2계층 토큰 TTL과 교체 전략
- [Config API](../api-reference/config) — Config 전체 필드 참조
