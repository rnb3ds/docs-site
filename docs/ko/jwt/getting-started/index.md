---
sidebar_label: "빠른 시작"
title: "빠른 시작 - CyberGo JWT | 5 분 입문 가이드"
description: "CyberGo JWT 빠른 시작 가이드: 라이브러리 설치와 Processor 생성, 접근·갱신 토큰 발급·검증·갱신·취소 핵심 사용법과 고급 기능 안내."
sidebar_position: 2
---

# 빠른 시작

## 설치

```bash
go get github.com/cybergodev/jwt
```

Go 1.25+ 필요.

## 기본 사용법

### 1. Processor 생성

```go
package main

import (
    "fmt"
    "time"

    "github.com/cybergodev/jwt"
)

func main() {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!" // HMAC 최소 32 바이트
    cfg.AccessTokenTTL = 15 * time.Minute
    cfg.RefreshTokenTTL = 7 * 24 * time.Hour

    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close() // 키 안전 삭제
}
```

### 2. 토큰 발급

```go
claims := &jwt.Claims{
    UserID:   "user123",
    Username: "alice",
    Role:     "admin",
    Permissions: []string{"read", "write"},
}

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
```

### 3. 토큰 검증

```go
parsed, valid, err := processor.Validate(accessToken)
if err != nil {
    // 오류 처리: 만료, 서명 무효 등
    panic(err)
}
if valid {
    fmt.Println("UserID:", parsed.UserID)
    fmt.Println("Role:", parsed.Role)
    fmt.Println("ExpiresAt:", parsed.ExpiresAt.Time)
}
```

### 4. 토큰 갱신

```go
newAccessToken, err := processor.Refresh(refreshToken)
if err != nil {
    panic(err)
}
fmt.Println("New Access Token:", newAccessToken)
```

### 5. 토큰 취소

```go
// 토큰을 블랙리스트에 추가
err := processor.Revoke(accessToken)
if err != nil {
    panic(err)
}

// 취소 여부 확인
revoked, err := processor.IsRevoked(accessToken)
if err != nil {
    panic(err)
}
fmt.Println("Revoked:", revoked) // true
```

## 추가 기능

위 단계는 토큰 생명주기의 핵심 작업을 다룹니다. CyberGo JWT는 다음 기능도 제공합니다 — 각 가이드를 클릭하여 상세 사용법을 확인하세요:

| 기능 | 설명 | 가이드 |
|------|------|--------|
| 서명 알고리즘 | HMAC, RSA, RSA-PSS, ECDSA — 4종 12개 알고리즘 | [서명 알고리즘](../guides/signing-algorithms) |
| 커스텀 Claims | `CustomClaims` 인터페이스로 비즈니스 필드 정의 | [커스텀 Claims](../guides/custom-claims) |
| 토큰 갱신 및 교체 | 2계층 토큰 TTL 설계, 재사용 vs 일회성 교체 전략 | [토큰 갱신 및 교체](../guides/token-refresh) |
| 토큰 블랙리스트 | 취소, 내장 메모리 저장소, Redis 커스텀 백엔드 | [토큰 블랙리스트](../guides/blacklist) |
| 속도 제한 | 토큰 버킷 알고리즘으로 발급 엔드포인트 남용 방지 | [속도 제한](../guides/rate-limiting) |
| 설정 상세 | 발급자/수신자 검증, 클록 스큐, 필수 만료, 입력 검증 | [설정 상세](../guides/configuration) |
| 오류 처리 | 19개 센티널 오류 분류와 `errors.Is` 매칭 | [오류 처리](../guides/error-handling) |
| 테스트와 클록 주입 | `FixedClock`으로 결정적이고 sleep 없는 시간 제어 | [테스트와 클록 주입](../guides/testing) |

## 다음 단계

- [서명 알고리즘](../guides/signing-algorithms) — 알고리즘 선택 및 키 설정
- [토큰 갱신 및 교체](../guides/token-refresh) — 2계층 토큰과 교체 전략
- [설정 상세](../guides/configuration) — 보안 설정 및 입력 검증
- [API 레퍼런스](../api-reference/) — 전체 API 참조 문서
- [기본 예제](../examples/basic) — 실행 가능한 완전한 예제
- [웹 서버 통합](../examples/web-server) — 인증 미들웨어와 RBAC 실전
