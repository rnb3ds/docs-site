---
sidebar_label: "오류 처리"
title: "오류 처리 - CyberGo JWT | 센티널 오류 매칭"
description: "오류 처리 가이드: CyberGo JWT 19 에러가 구성, 토큰 검증, 속도 제한, 수명주기 단계에서 트리거되는 조건을 분류하고 errors.Is 매칭, ValidationError 필드 오류와 표준 응답 실무를 안내합니다."
sidebar_position: 50
---

# 오류 처리

CyberGo JWT 는 센티널 오류 (sentinel errors) 패턴을 사용하며, 모든 오류는 `errors.Is()`로 판별합니다.

## 기본 패턴

```go
claims, valid, err := processor.Validate(tokenString)
if err != nil {
    switch {
    case errors.Is(err, jwt.ErrTokenExpired):
        // 토큰 만료
    case errors.Is(err, jwt.ErrTokenRevoked):
        // 토큰이 폐기됨
    case errors.Is(err, jwt.ErrTokenInvalidIssuer):
        // 발급자 불일치
    case errors.Is(err, jwt.ErrTokenInvalidAudience):
        // 수신자 불일치
    case errors.Is(err, jwt.ErrInvalidToken):
        // 서명 무효 또는 형식 오류
    case errors.Is(err, jwt.ErrProcessorClosed):
        // Processor 가 종료됨
    default:
        // 기타 오류
    }
}
```

:::tip errors.Is() 사용
`err == jwt.ErrTokenExpired` 또는 문자열 매칭을 사용하지 마세요. `errors.Is()`는 래핑된 오류를 올바르게 처리합니다.
:::

## 오류 분류

### 설정 단계

`jwt.New()`는 다음 오류를 반환할 수 있습니다:

| 오류 | 원인 | 해결 방법 |
|------|------|----------|
| `ErrInvalidConfig` | 여러 설정 항목이 올바르지 않음 | Config 각 필드 확인 |
| `ErrInvalidSecretKey` | HMAC 키가 32 바이트 미만이거나 약한 키 | 더 강한 키 사용 |
| `ErrInvalidSigningMethod` | 지원하지 않는 서명 알고리즘 | 내장 12 개 알고리즘 중 하나 사용 |

### 토큰 작업

| 오류 | 메서드 | 처리 제안 |
|------|------|----------|
| `ErrEmptyToken` | 모든 토큰 작업 메서드 | 요청 헤더 확인 |
| `ErrInvalidToken` | Validate, Refresh, ValidateInto, RefreshInto, Revoke, IsRevoked | 서명 불일치, 접근 거부 |
| `ErrAlgorithmMismatch` | Validate, Refresh, ValidateInto, RefreshInto | 토큰 알고리즘이 설정과 불일치, 접근 거부 |
| `ErrExpirationRequired` | Validate, Refresh, ValidateInto, RefreshInto | `RequireExpiration` 활성화되었으나 토큰에 `exp` 클레임 없음 |
| `ErrTokenTypeMismatch` | Refresh, RefreshInto | 액세스 토큰 (`token_type=access`) 으로 갱신 시도, 접근 거부 |
| `ErrTokenExpired` | Validate, Refresh, ValidateInto, RefreshInto | 사용자에게 토큰 갱신 안내 |
| `ErrTokenNotValidYet` | Validate, Refresh, ValidateInto, RefreshInto | 시계 동기화 확인 |
| `ErrTokenInvalidIssuer` | Validate, Refresh, ValidateInto, RefreshInto, Revoke, IsRevoked | 발급자 불일치 |
| `ErrTokenInvalidAudience` | Validate, Refresh, ValidateInto, RefreshInto, Revoke, IsRevoked | 수신자 불일치 |
| `ErrTokenRevoked` | Validate, Refresh, ValidateInto, RefreshInto | 토큰이 폐기됨, 접근 거부 |
| `ErrInvalidClaims` | Create, CreateRefresh, Validate, Refresh, ValidateInto, RefreshInto | 비즈니스 검증 실패 |
| `ErrTokenMissingID` | Revoke, IsRevoked | 토큰에 jti 가 없음 |

### 속도 제한 및 블랙리스트

| 오류 | 메서드 | 처리 제안 |
|------|------|----------|
| `ErrRateLimitExceeded` | Create, CreateRefresh, Refresh, RefreshInto | 429 반환 |
| `ErrBlacklistNotConfigured` | Revoke | 블랙리스트 설정 |

### 라이프사이클

| 오류 | 메서드 | 처리 제안 |
|------|------|----------|
| `ErrProcessorClosed` | 모든 메서드 | Processor 재생성 |
| `ErrStoreClosed` | Revoke 등 | 저장소가 종료됨 |

## 오류 타입

### ValidationError

필드 수준 검증 실패 시 반환되며, 구체적인 필드와 오류 정보를 포함합니다:

```go
type ValidationError struct {
    Field   string  // 오류가 발생한 필드명
    Message string  // 오류 설명
    Err     error   // 내부 오류
}
```

## 오류 래핑 체인

CyberGo JWT의 오류는 센티널 오류(`errors.Is`로 매칭 가능)와 래핑 오류(`errors.As`로 구조화 정보 추출 필요)로 나뉩니다. 래핑 체인을 이해하면 실패 원인을 정확히 파악할 수 있습니다.

### ValidationError 와 errors.As

필드 수준 검증 실패(길이 초과, 인젝션 탐지 등)는 구체적인 필드명과 오류 정보를 포함한 `*ValidationError`를 반환합니다. 몇 겹으로 래핑되더라도 `errors.As`가 관통합니다:

```go
token, err := processor.Create(claims)
if err != nil {
    var ve *jwt.ValidationError
    if errors.As(err, &ve) {
        fmt.Printf("필드: %s, 이유: %s\n", ve.Field, ve.Message)
        // 필드: user_id, 이유: suspicious pattern detected
        return
    }
    // 필드 수준 오류가 아님, errors.Is 분기로 이동
}
```

### ErrInvalidClaims 가 Claims.Validate()를 래핑

`Claims.Validate()`(또는 커스텀 Claims의 `Validate()`)가 반환하는 것은 **설명적 오류**(예: `errors.New("user_id is required")`)이며, 센티널 오류가 아닙니다. Processor는 이를 `ErrInvalidClaims`로 래핑합니다:

```
invalid claims: user_id is required
└── ErrInvalidClaims (센티널, 외층)
    └── user_id is required (설명적, 내층)
```

따라서 매칭 방식은 이중층입니다:

```go
if errors.Is(err, jwt.ErrInvalidClaims) {
    // Claims 검증 실패라는 카테고리
    fmt.Println("상세:", err) // invalid claims: user_id is required
}
```

### ParseUnverified 의 파싱 오류

[`ParseUnverified`](../api-reference/processor#parseunverified)는 토큰 형식 오류(base64 디코딩 실패, JSON 파싱 실패 등) 시 반환하는 파싱 오류는 **래핑 오류**이며, 센티널 오류가 아닙니다:

```go
err := processor.ParseUnverified(malformedToken, &claims)
if err != nil {
    // ❌ errors.Is 로 구체적 원인 매칭 불가
    // ✅ "파싱 실패"라는 사실만 판단 가능
    fmt.Println("파싱 실패:", err) // failed to parse token: ...
}
```

`ParseUnverified`의 유일한 두 센티널 오류는 `ErrProcessorClosed`(Processor 종료됨)와 `ErrEmptyToken`(빈 문자열 전달)이며, 나머지 형식 오류는 `errors.Is`로 정확히 매칭할 수 없습니다.

::: tip errors.Is vs errors.As 사용 시기
- **`errors.Is`**: 센티널 오류(`ErrTokenExpired`, `ErrInvalidClaims` 등) 매칭, "어떤 카테고리의 실패인지" 판단에 사용.
- **`errors.As`**: 구조화 오류(`*ValidationError`) 추출, "구체적으로 어느 필드에서 무슨 문제가 발생했는지" 파악에 사용.
- 둘은 조합 가능: 먼저 `errors.Is`로 카테고리를 파악한 후 `errors.As`로 세부 정보 추출.
:::

## HTTP 상태 코드 매핑

RESTful API에서 JWT 오류를 적절한 HTTP 상태 코드로 매핑하는 것은 모범 사례입니다 — 클라이언트는 이를 통해 "자격 증명 문제"(401), "요청 형식 문제"(400), "서버 문제"(500)를 구분할 수 있습니다.

### 매핑 표

| JWT 오류 | HTTP 상태 코드 | 클라이언트 동작 |
|----------|-------------|------------|
| `ErrEmptyToken` | 401 Unauthorized | 인증 토큰 제공 |
| `ErrInvalidToken` | 401 Unauthorized | 재로그인 |
| `ErrAlgorithmMismatch` | 401 Unauthorized | 토큰 출처가 신뢰할 수 없음, 재로그인 |
| `ErrTokenExpired` | 401 Unauthorized | 리프레시 토큰으로 새 토큰 획득 |
| `ErrTokenRevoked` | 401 Unauthorized | 토큰이 폐기됨, 재로그인 |
| `ErrTokenInvalidIssuer` | 401 Unauthorized | 토큰 발급자 불일치 |
| `ErrTokenInvalidAudience` | 401 Unauthorized | 토큰 수신자 불일치 |
| `ErrTokenNotValidYet` | 401 Unauthorized | 클라이언트 클록 동기화 확인 |
| `ErrTokenTypeMismatch` | 401 Unauthorized | 올바른 리프레시 토큰 사용 |
| `ErrExpirationRequired` | 401 Unauthorized | 토큰에 만료 클레임 없음 |
| `ErrInvalidClaims` | 400 Bad Request | Claims 내용 수정 (생성 시나리오) |
| `ErrRateLimitExceeded` | 429 Too Many Requests | 요청 빈도 낮추고 잠시 후 재시도 |
| `ErrProcessorClosed` | 500 Internal Server Error | 서버에서 Processor 재시작 필요 |

::: tip RESTful 모범 사례
- **401 Unauthorized**: 모든 토큰 유효성 문제(만료, 폐기, 서명 오류, 발급자/수신자 불일치). 클라이언트는 재인증 또는 토큰 갱신을 안내받아야 합니다.
- **400 Bad Request**: 토큰 생성 시 Claims 검증 실패 — 이는 인증 실패가 아닌 호출자의 프로그래밍 오류입니다.
- **429 Too Many Requests**: 속도 제한 트리거 시 이 코드를 반환하고 `Retry-After` 헤더로 대기 시간을 알립니다.
- **500 Internal Server Error**: `ErrProcessorClosed`는 서버 상태 이상이며, 클라이언트에 노출해서는 안 됩니다.
:::

## 웹 서비스에서의 오류 처리

아래 프로세서는 `Validate`가 반환할 수 있는 모든 일반 오류를 다루며, [HTTP 상태 코드 매핑](#http-상태-코드-매핑)에 따라 적절한 응답을 반환합니다:

<!-- check-code: skip -->
```go
package main

import (
    "encoding/json"
    "errors"
    "net/http"

    "github.com/cybergodev/jwt"
)

// authError 는 JWT 오류를 HTTP 상태 코드와 메시지로 매핑
func authError(w http.ResponseWriter, err error) {
    w.Header().Set("Content-Type", "application/json")

    switch {
    // 토큰 만료 — 클라이언트에게 갱신 안내
    case errors.Is(err, jwt.ErrTokenExpired):
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "token_expired",
            "message": "토큰이 만료되었습니다, 갱신하세요",
        })

    // 토큰이 폐기됨
    case errors.Is(err, jwt.ErrTokenRevoked):
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "token_revoked",
            "message": "토큰이 폐기되었습니다",
        })

    // 발급자 불일치
    case errors.Is(err, jwt.ErrTokenInvalidIssuer):
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "invalid_issuer",
            "message": "발급자가 불일치합니다",
        })

    // 수신자 불일치
    case errors.Is(err, jwt.ErrTokenInvalidAudience):
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "invalid_audience",
            "message": "수신자가 불일치합니다",
        })

    // 아직 유효하지 않음 — 클록 비동기
    case errors.Is(err, jwt.ErrTokenNotValidYet):
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "token_not_valid_yet",
            "message": "토큰이 아직 유효하지 않습니다",
        })

    // 알고리즘 불일치
    case errors.Is(err, jwt.ErrAlgorithmMismatch):
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "algorithm_mismatch",
            "message": "서명 알고리즘이 불일치합니다",
        })

    // 토큰 무효 (서명 오류, 형식 오류, 빈 토큰)
    case errors.Is(err, jwt.ErrInvalidToken),
        errors.Is(err, jwt.ErrEmptyToken),
        errors.Is(err, jwt.ErrExpirationRequired):
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "invalid_token",
            "message": "토큰이 무효합니다",
        })

    // Claims 검증 실패 — 필드 수준 세부 정보 추출 시도
    case errors.Is(err, jwt.ErrInvalidClaims):
        var ve *jwt.ValidationError
        if errors.As(err, &ve) {
            w.WriteHeader(http.StatusBadRequest)
            json.NewEncoder(w).Encode(map[string]string{
                "error":   "validation_failed",
                "field":   ve.Field,
                "message": ve.Message,
            })
        } else {
            w.WriteHeader(http.StatusBadRequest)
            json.NewEncoder(w).Encode(map[string]string{
                "error":   "validation_failed",
                "message": "클레임 검증 실패",
            })
        }

    // 속도 제한
    case errors.Is(err, jwt.ErrRateLimitExceeded):
        w.Header().Set("Retry-After", "60")
        w.WriteHeader(http.StatusTooManyRequests)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "rate_limited",
            "message": "요청이 너무 빈번합니다, 잠시 후 재시도하세요",
        })

    // 시스템 오류 — Processor 종료됨
    case errors.Is(err, jwt.ErrProcessorClosed):
        w.WriteHeader(http.StatusInternalServerError)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "internal_error",
            "message": "서비스를 일시적으로 사용할 수 없습니다",
        })

    // 폴백
    default:
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "auth_failed",
            "message": "인증 실패",
        })
    }
}

func handleProtected(w http.ResponseWriter, r *http.Request) {
    tokenString := extractToken(r)
    claims, valid, err := processor.Validate(tokenString)
    if err != nil {
        authError(w, err)
        return
    }
    if !valid {
        authError(w, jwt.ErrInvalidToken)
        return
    }
    // 인증 통과, 요청 처리
    _ = claims
}
```

::: tip authError 재사용
`authError`는 특정 라우트와 무관한 오류 매핑 함수로, 인증이 필요한 모든 프로세서에서 재사용할 수 있습니다. [갱신 엔드포인트](../examples/web-server#_5-갱신-엔드포인트-refresh)에서 `ErrTokenTypeMismatch`를 처리할 때도 호출할 수 있습니다.
:::

## 다음 단계

- [API 레퍼런스 → 오류](../api-reference/errors) — 전체 오류 목록
- [API 레퍼런스 → 타입](../api-reference/types#validationerror) — 오류 타입 정의
