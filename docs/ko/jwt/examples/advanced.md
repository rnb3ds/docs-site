---
sidebar_label: "고급 예제"
title: "고급 예제 - CyberGo JWT | 비대칭 서명과 커스텀 저장소"
description: "고급 예제: RSA, RSA-PSS, ECDSA 비대칭 서명, 키 분리 교차 서비스 검증, PEM 키 로드, CustomClaims 비즈니스 클레임, Redis 커스텀 블랙리스트 백엔드, FixedClock 클럭 인젝션, 미검증 토큰 파싱."
sidebar_position: 20
---

# 고급 예제

## RSA 비대칭 서명

RSA 개인 키로 서명하고 공개 키로 검증합니다. 마이크로서비스 아키텍처에 적합하며, 검증 측에서 개인 키를 보유할 필요가 없습니다.

```go
package main

import (
    "crypto/rand"
    "crypto/rsa"
    "fmt"
    "log"

    "github.com/cybergodev/jwt"
)

func main() {
    // RSA 키 쌍 생성 (실제 사용 시 파일에서 로드)
    privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
    if err != nil {
        log.Fatal(err)
    }

    cfg := jwt.DefaultConfig()
    cfg.SigningMethod = jwt.SigningMethodRS256
    cfg.SigningKey = privateKey
    cfg.VerificationKey = &privateKey.PublicKey // 선택, 설정하지 않으면 SigningKey 사용

    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    claims := &jwt.Claims{UserID: "user456", Username: "bob"}
    token, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }
    fmt.Println("RSA Token:", token)

    parsed, valid, err := processor.Validate(token)
    if err != nil {
        panic(err)
    }
    fmt.Println("Valid:", valid)
    fmt.Println("UserID:", parsed.UserID)
}
```

## RSA-PSS 서명

RSA-PSS (RS256/384/512의 현대적 대체)는 확률적 서명 방식(PSS) 패딩을 사용하여 PKCS#1 v1.5보다 보안성이 뛰어납니다. 키는 RSA와 완전히 동일하여 추가 생성이 불필요합니다.

```go
package main

import (
    "crypto/rand"
    "crypto/rsa"
    "fmt"
    "log"

    "github.com/cybergodev/jwt"
)

func main() {
    // RSA 키 쌍 생성 (RSA-PSS 는 RSA 와 동일한 키 타입 공유)
    privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
    if err != nil {
        log.Fatal(err)
    }

    cfg := jwt.DefaultConfig()
    cfg.SigningMethod = jwt.SigningMethodPS256
    cfg.SigningKey = privateKey
    cfg.VerificationKey = &privateKey.PublicKey

    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    claims := &jwt.Claims{UserID: "user_ps", Username: "diana"}
    token, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }
    fmt.Println("RSA-PSS Token:", token)

    parsed, valid, err := processor.Validate(token)
    if err != nil {
        panic(err)
    }
    fmt.Println("Valid:", valid) // 출력: Valid: true
    fmt.Println("UserID:", parsed.UserID)
}
```

:::tip RSA 대체 권장
신규 프로젝트에서는 RSA-PSS(PS256/384/512)를 우선 사용하는 것을 권장합니다. PSS 패딩은 PKCS#1 v1.5보다 강력한 증명 가능한 보안성을 가지며, 키는 RSA와 완전히 호환됩니다.
:::

## ECDSA 비대칭 서명

ECDSA 타원 곡선 서명을 사용하며, 키가 더 짧고 성능이 더 좋습니다.

```go
package main

import (
    "crypto/ecdsa"
    "crypto/elliptic"
    "crypto/rand"
    "fmt"
    "log"

    "github.com/cybergodev/jwt"
)

func main() {
    // ECDSA 키 쌍 생성
    privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
    if err != nil {
        log.Fatal(err)
    }

    cfg := jwt.DefaultConfig()
    cfg.SigningMethod = jwt.SigningMethodES256
    cfg.SigningKey = privateKey

    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    claims := &jwt.Claims{UserID: "user789", Username: "charlie"}
    token, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }
    fmt.Println("ECDSA Token:", token)
}
```

## 키 분리 모드

마이크로서비스 아키텍처에서의 교차 서비스 토큰 검증을 시뮬레이션합니다: 인증 서비스가 개인 키를 보유하고 토큰을 발급하며, API 서비스는 공개 키로 검증합니다.

```go
package main

import (
    "crypto/rand"
    "crypto/rsa"
    "fmt"
    "log"

    "github.com/cybergodev/jwt"
)

func main() {
    // RSA 키 쌍 생성
    privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
    if err != nil {
        log.Fatal(err)
    }
    publicKey := &privateKey.PublicKey

    // --- 인증 서비스: 개인 키 보유, 토큰 발급 ---
    authCfg := jwt.DefaultConfig()
    authCfg.SigningMethod = jwt.SigningMethodRS256
    authCfg.SigningKey = privateKey
    authCfg.Issuer = "auth-service"

    authProcessor, err := jwt.New(authCfg)
    if err != nil {
        panic(err)
    }
    defer authProcessor.Close()

    claims := &jwt.Claims{UserID: "user_dist", Username: "charlie"}
    token, err := authProcessor.Create(claims)
    if err != nil {
        panic(err)
    }
    fmt.Println("인증 서비스가 토큰 발급 (개인 키)")

    // --- API 서비스: 공개 키로 토큰 검증 ---
    apiCfg := jwt.DefaultConfig()
    apiCfg.SigningMethod = jwt.SigningMethodRS256
    apiCfg.SigningKey = privateKey     // 현재 API 는 SigningKey 가 비어있지 않음을 요구
    apiCfg.VerificationKey = publicKey // 검증 시 실제 이 공개 키 사용
    apiCfg.Issuer = "auth-service"     // 발급자와 반드시 일치해야 함

    apiProcessor, err := jwt.New(apiCfg)
    if err != nil {
        panic(err)
    }
    defer apiProcessor.Close()

    parsed, valid, err := apiProcessor.Validate(token)
    if err != nil {
        panic(err)
    }
    fmt.Println("API 서비스 검증 통과 (공개 키):", valid) // 출력: API 서비스 검증 통과 (공개 키): true
    fmt.Println("UserID:", parsed.UserID)
}
```

:::warning SigningKey 필수
현재 API는 `SigningKey`가 비어있지 않음을 요구(검증 단계에서 강제 검사)하므로, API 서비스 설정에도 개인 키를 기입해야 합니다. 하지만 검증 흐름은 `VerificationKey`가 설정된 경우 공개 키만 사용합니다. 검증 전용 Processor는 `Create` / `CreateRefresh`를 호출해서는 안 됩니다.
:::

## PEM 파일에서 키 로드

프로덕션 환경에서는 보통 비대칭 키를 PEM 파일로 저장합니다. 아래 예제는 `pem.Decode` + `x509.ParsePKCS8PrivateKey`로 개인 키를, `x509.ParsePKIXPublicKey`로 공개 키를 로드하는 방법을 보여줍니다.

<!-- check-code: skip -->
```go
package main

import (
    "crypto/rsa"
    "crypto/x509"
    "encoding/pem"
    "fmt"
    "os"

    "github.com/cybergodev/jwt"
)

func main() {
    // --- RSA 개인 키 로드 ---
    keyData, err := os.ReadFile("private_key.pem")
    if err != nil {
        fmt.Println("개인 키 읽기 실패:", err)
        return
    }

    block, _ := pem.Decode(keyData)
    if block == nil {
        fmt.Println("개인 키 PEM 디코딩 실패")
        return
    }

    parsedKey, err := x509.ParsePKCS8PrivateKey(block.Bytes)
    if err != nil {
        fmt.Println("개인 키 파싱 실패:", err)
        return
    }
    privateKey, ok := parsedKey.(*rsa.PrivateKey)
    if !ok {
        fmt.Println("키 타입이 RSA 가 아님")
        return
    }

    // --- RSA 공개 키 로드 ---
    pubData, err := os.ReadFile("public_key.pem")
    if err != nil {
        fmt.Println("공개 키 읽기 실패:", err)
        return
    }

    pubBlock, _ := pem.Decode(pubData)
    if pubBlock == nil {
        fmt.Println("공개 키 PEM 디코딩 실패")
        return
    }

    parsedPub, err := x509.ParsePKIXPublicKey(pubBlock.Bytes)
    if err != nil {
        fmt.Println("공개 키 파싱 실패:", err)
        return
    }
    publicKey, ok := parsedPub.(*rsa.PublicKey)
    if !ok {
        fmt.Println("공개 키 타입이 RSA 가 아님")
        return
    }

    // --- Processor 설정 ---
    cfg := jwt.DefaultConfig()
    cfg.SigningMethod = jwt.SigningMethodRS256
    cfg.SigningKey = privateKey
    cfg.VerificationKey = publicKey

    processor, err := jwt.New(cfg)
    if err != nil {
        fmt.Println("초기화 실패:", err)
        return
    }
    defer processor.Close()
    fmt.Println("키가 PEM 파일에서 로드됨") // 출력: 키가 PEM 파일에서 로드됨
}
```

:::tip 키 형식
- 개인 키 PEM 헤더는 `-----BEGIN PRIVATE KEY-----` (PKCS#8) 또는 `-----BEGIN RSA PRIVATE KEY-----` (PKCS#1). PKCS#8은 `x509.ParsePKCS8PrivateKey`, PKCS#1은 `x509.ParsePKCS1PrivateKey`를 사용.
- 공개 키 PEM 헤더는 `-----BEGIN PUBLIC KEY-----`, `x509.ParsePKIXPublicKey`로 파싱.
- `ParsePKCS8PrivateKey` / `ParsePKIXPublicKey`는 `any`를 반환하므로 `*rsa.PrivateKey` / `*rsa.PublicKey`로 타입 단언 필요 (ECDSA도 마찬가지, `*ecdsa.PrivateKey` / `*ecdsa.PublicKey`로 단언).
:::

## 커스텀 Claims

자체 Claims 구조체를 정의하여 비즈니스 필드를 추가합니다.

```go
package main

import (
    "errors"
    "fmt"

    "github.com/cybergodev/jwt"
)

// 커스텀 Claims 구조체
type MyClaims struct {
    UserID string `json:"user_id"`
    Email  string `json:"email"`
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
    if c.Email == "" {
        return errors.New("email is required")
    }
    return nil
}

func main() {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    claims := &MyClaims{
        UserID: "user123",
        Email:  "alice@example.com",
        Role:   "admin",
    }

    // 토큰 생성
    token, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }
    fmt.Println("Token:", token)

    // 커스텀 Claims 로 검증
    myClaims := &MyClaims{}
    result, valid, err := processor.ValidateInto(token, myClaims)
    if err != nil {
        panic(err)
    }
    if valid {
        parsed := result.(*MyClaims)
        fmt.Println("UserID:", parsed.UserID) // 출력: user123
        fmt.Println("Email:", parsed.Email)   // 출력: alice@example.com
    }

    // 커스텀 Claims 로 갱신
    refreshToken, err := processor.CreateRefresh(claims)
    if err != nil {
        panic(err)
    }
    newToken, err := processor.RefreshInto(refreshToken, &MyClaims{})
    if err != nil {
        panic(err)
    }
    fmt.Println("New Token:", newToken)
}
```

## 커스텀 블랙리스트 백엔드 (Redis)

```go
package main

import (
    "context"
    "fmt"
    "time"

    "github.com/cybergodev/jwt"
)

// RedisBlacklistStore 는 BlacklistStore 인터페이스를 구현
// 참고: 실제 사용 시 Redis 클라이언트를 가져와야 함 (예: github.com/redis/go-redis)
type RedisBlacklistStore struct {
    // client *redis.Client
}

func (s *RedisBlacklistStore) Add(tokenID string, expiresAt time.Time) error {
    ttl := time.Until(expiresAt)
    if ttl <= 0 {
        return nil
    }
    // return s.client.Set(context.Background(), "blacklist:"+tokenID, "1", ttl).Err()
    fmt.Printf("Redis ADD: %s, TTL: %v\n", tokenID, ttl)
    return nil
}

func (s *RedisBlacklistStore) Contains(tokenID string) (bool, error) {
    // return s.client.Exists(context.Background(), "blacklist:"+tokenID).Result()
    return false, nil
}

func (s *RedisBlacklistStore) Close() error {
    // return s.client.Close()
    return nil
}

func main() {
    _ = context.Background() // context import 유지 (실제 사용 시 Redis 호출 주석 해제)

    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    cfg.Blacklist.Store = &RedisBlacklistStore{}

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

    err = processor.Revoke(token)
    if err != nil {
        panic(err)
    }
    fmt.Println("Token revoked via Redis backend")
}
```

## 클럭 인젝션 (테스트 시나리오)

`FixedClock`을 사용하여 테스트에서 시간을 제어합니다.

```go
package main

import (
    "fmt"
    "time"

    "github.com/cybergodev/jwt"
)

func main() {
    fixedTime := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    cfg.Clock = jwt.FixedClock{T: fixedTime}

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

    parsed, _, err := processor.Validate(token)
    if err != nil {
        panic(err)
    }
    fmt.Println("IssuedAt:", parsed.IssuedAt.Time)   // 출력: 2026-01-01 00:00:00 +0000 UTC
    fmt.Println("ExpiresAt:", parsed.ExpiresAt.Time) // 출력: 2026-01-01 00:15:00 +0000 UTC
}
```

## 미검증 토큰 파싱

Claims 정보를 추출하지만 서명을 검증하지 않으며, 디버깅이나 로깅에 사용합니다.

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

    // 서명 검증 없이 파싱
    parsed := &jwt.Claims{}
    err = processor.ParseUnverified(token, parsed)
    if err != nil {
        panic(err)
    }
    fmt.Println("UserID (unverified):", parsed.UserID)
}
```

## 더 많은 예제

- [웹 서버 통합](./web-server) — 인증 미들웨어, RBAC, 리프레시, 로그아웃, 우아한 종료
- [기본 예제](./basic) — HMAC, 토큰 쌍, 폐기, 속도 제한
