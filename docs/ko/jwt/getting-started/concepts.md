---
title: "핵심 개념 - CyberGo JWT | 아키텍처 및 토큰 모델"
description: "CyberGo JWT 핵심 개념: Processor 중심 타입과 토큰 수명 주기, 이중 계층 토큰 모델, Claims 및 RegisteredClaims 구조, CustomClaims 인터페이스, Config 개요 및 확장 인터페이스."
sidebar_label: "핵심 개념"
sidebar_position: 1
---

# 핵심 개념

이 페이지는 CyberGo JWT의 핵심 추상화와 설계 모델을 설명하여 전체적인 이해를 돕습니다. 바로 코딩을 시작하려면 [빠른 시작](./index)으로 이동하세요.

## Processor — 중심 타입

[Processor](../api-reference/processor)는 라이브러리의 중심 타입으로, [`jwt.New(cfg)`](../api-reference/functions#new)를 통해 생성됩니다. 토큰 발급, 검증, 갱신, 취소의 전체 로직을 캡슐화하며, 모든 메서드는 **고루틴 안전**하여 여러 고루틴에서 하나의 인스턴스를 공유할 수 있습니다.

사용이 끝나면 [`Close()`](../api-reference/processor#close)를 호출하여 비밀 키를 안전하게 삭제하고 리소스를 해제합니다:

```go
<!-- check-code: skip -->
cfg := jwt.DefaultConfig()
cfg.SecretKey = "your-32-byte-secret-key-here-minimum"

processor, err := jwt.New(cfg)
if err != nil {
    log.Fatal(err)
}
defer processor.Close()
```

Processor는 [`TokenManager`](../api-reference/interfaces#tokenmanager) 인터페이스를 구현하여 의존성 주입과 테스트 대체를 지원합니다.

## 토큰 수명 주기

토큰은 발급부터 무효화까지 다음 단계를 거칩니다:

```text
발급    Create(claims)           → 액세스 토큰 (단기)
        CreateRefresh(claims)     → 리프레시 토큰 (장기)

검증    Validate(token)          → Claims (서명, 만료, 발급자, 블랙리스트 확인)

갱신    Refresh(refreshToken)    → 새 액세스 토큰

취소    Revoke(token)            → 블랙리스트에 추가
조회    IsRevoked(token)         → bool
```

각 단계는 `ErrTokenExpired`, `ErrTokenRevoked` 같은 **센티넬 에러**를 반환하며, `errors.Is()`로 정확히 매칭할 수 있습니다. 자세한 내용은 [오류 처리](../guides/error-handling)를 참조하세요.

## 이중 계층 토큰 모델

CyberGo JWT는 액세스 토큰 + 리프레시 토큰의 이중 설계를 사용합니다:

| | 액세스 토큰 | 리프레시 토큰 |
|---|---------|---------|
| **용도** | API 인증 | 새 액세스 토큰 획득 |
| **기본 TTL** | 15분 | 7일 |
| **발급 메서드** | `Create` | `CreateRefresh` |
| **갱신 메서드** | — | `Refresh` |

**왜 두 계층인가?** 액세스 토큰은 수명이 짧아 유출되더라도 위험 기간이 짧습니다. 리프레시 토큰은 수명이 길지만 새 액세스 토큰을 얻는 데만 사용되며 API 인증에 직접 사용되지 않습니다. 이 설계는 보안과 사용자 경험의 균형을 맞춥니다 — 사용자가 자주 로그인할 필요가 없으며, 액세스 토큰 만료 후 자동으로 갱신할 수 있습니다.

::: tip 로테이션 의미론
`Refresh`는 리프레시 토큰을 **자동으로 취소하지 않습니다**. 원본 리프레시 토큰은 만료되거나 명시적으로 `Revoke`되기 전까지 유효합니다. 일회용 의미론(리프레시 토큰 로테이션)이 필요한 경우, `Refresh` 성공 후 이전 리프레시 토큰을 수동으로 `Revoke`하세요. 자세한 내용은 [토큰 갱신 및 로테이션](../guides/token-refresh)을 참조하세요.
:::

## Claims 구조

Claims는 토큰 내의 사용자 신원 데이터를 운반합니다. CyberGo JWT는 두 계층 구조를 제공합니다:

**RegisteredClaims** (RFC 7519 표준 클레임, 자동 채우기 및 검증):

| 필드 | claim | 설명 |
|------|-------|------|
| Issuer | `iss` | 발급자 식별자 |
| Subject | `sub` | 주체 식별자 (속도 제한 키로도 사용) |
| Audience | `aud` | 대상 수신자 |
| ExpiresAt | `exp` | 만료 시간 |
| NotBefore | `nbf` | 활성 시간 |
| IssuedAt | `iat` | 발급 시간 |
| ID | `jti` | 고유 식별자 (블랙리스트 키) |
| TokenType | `token_type` | `access` 또는 `refresh` |

**Claims** (내장 비즈니스 클레임, RegisteredClaims 포함):

```go
<!-- check-code: skip -->
type Claims struct {
    UserID      string         // 사용자 ID
    Username    string         // 사용자 이름
    Role        string         // 역할
    Permissions []string       // 권한 목록
    Scopes      []string       // OAuth 스코프
    SessionID   string         // 세션 ID
    ClientID    string         // 클라이언트 ID
    Extra       map[string]any // 추가 필드
    RegisteredClaims           // 표준 클레임 (포함)
}
```

모든 필드는 입력 검증을 거칩니다: 문자열 길이 제한 256, 배열 제한 100, 주입 패턴 감지(XSS/SQLi 서명).

## CustomClaims 인터페이스

내장 Claims로 비즈니스 요구를 충족할 수 없을 때, [`CustomClaims`](../api-reference/interfaces#customclaims) 인터페이스를 구현하여 자체 클레임 구조를 정의합니다:

```go
<!-- check-code: skip -->
type AppClaims struct {
    UserID string   `json:"user_id"`
    TeamID string   `json:"team_id"`
    Roles  []string `json:"roles,omitempty"`
    jwt.RegisteredClaims
}

func (c *AppClaims) GetRegisteredClaims() *jwt.RegisteredClaims {
    return &c.RegisteredClaims
}

func (c *AppClaims) Validate() error {
    if c.UserID == "" {
        return errors.New("user_id is required")
    }
    return nil
}
```

커스텀 타입은 `ValidateInto`로 검증, `RefreshInto`로 갱신합니다 — Processor가 토큰을 파싱하여 구조체를 채웁니다. 자세한 내용은 [커스텀 Claims](../guides/custom-claims)를 참조하세요.

## Config 개요

[`Config`](../api-reference/config)는 Processor의 통합 설정 진입점입니다. `DefaultConfig()`로 합리적인 기본값을 얻은 후, 서명 키만 설정하면 됩니다:

| 그룹 | 필드 | 설명 |
|------|------|------|
| **서명** | `SecretKey` / `SigningKey` / `VerificationKey` / `SigningMethod` | HMAC은 SecretKey, RSA/ECDSA는 SigningKey 사용 |
| **토큰** | `AccessTokenTTL` / `RefreshTokenTTL` | 액세스 및 리프레시 토큰 수명 |
| **검증** | `Issuer` / `ExpectedAudience` / `RequireExpiration` / `ClockSkew` | 발급자, 수신자, 필수 만료, 클럭 허용 오차 |
| **보안** | `Blacklist` / `EnableRateLimit` | 취소 저장소 및 속도 제한 |
| **확장** | `Clock` | 클럭 주입 (테스트용) |

알고리즘 선택은 [서명 알고리즘](../guides/signing-algorithms)을, 전체 필드 문서는 [설정](../guides/configuration)을 참조하세요.

## 확장 인터페이스

CyberGo JWT는 인터페이스를 통해 확장성을 제공합니다:

| 인터페이스 | 용도 |
|-----------|------|
| [`TokenManager`](../api-reference/interfaces#tokenmanager) | Processor가 구현하는 핵심 인터페이스. 의존성 주입과 결합 분리를 위해 더 작은 하위 집합 인터페이스를 정의할 수 있습니다 |
| [`BlacklistStore`](../api-reference/interfaces#blackliststore) | 커스텀 블랙리스트 백엔드(예: Redis). `Add` / `Contains` / `Close`를 구현하여 외부 저장소 연결 |
| [`RateLimitProvider`](../api-reference/interfaces#ratelimitprovider) | 커스텀 속도 제한기. `Allow` / `Reset` / `Close`를 구현하여 내장 토큰 버킷 교체 |
| [`ClockProvider`](../api-reference/interfaces#clockprovider) | 클럭 주입. `FixedClock`은 고정 시간을 반환하여 테스트에서 만료 및 갱신 로직을 결정론적으로 제어 |

## 다음 단계

- [빠른 시작](./index) — 첫 번째 토큰 발급하기
- [서명 알고리즘](../guides/signing-algorithms) — HMAC, RSA, ECDSA 선택 가이드
- [설정](../guides/configuration) — 전체 필드 참조 및 보안 강화
- [웹 서버 통합](../examples/web-server) — 인증 미들웨어와 RBAC 실전
