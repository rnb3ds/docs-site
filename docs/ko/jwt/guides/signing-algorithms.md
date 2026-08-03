---
sidebar_label: "서명 알고리즘"
title: "서명 알고리즘 - CyberGo JWT | 알고리즘 비교와 선택"
description: "서명 알고리즘 가이드: HMAC, RSA, RSA-PSS, ECDSA 4 종 12 알고리즘의 키 타입, 생성, 서명·검증 성능, 서명 길이, 아키텍처 결합도를 비교하며 선택과 키 관리 보안 실무를 안내합니다."
sidebar_position: 10
---

# 서명 알고리즘

CyberGo JWT 는 4 종류 총 12 개의 서명 알고리즘을 지원하며, 단일 애플리케이션부터 마이크로서비스 아키텍처까지 다양한 시나리오를 다룹니다.

## 알고리즘 개요

| 타입 | 알고리즘 | 키 타입 | 적용 시나리오 |
|------|------|----------|----------|
| HMAC | HS256 / HS384 / HS512 | 대칭 키 | 단일 애플리케이션, 단순 서비스 |
| RSA | RS256 / RS384 / RS512 | 공개 키/개인 키 | 마이크로서비스, 다중 서비스 검증 |
| RSA-PSS | PS256 / PS384 / PS512 | 공개 키/개인 키 | 마이크로서비스 (RSA 대체 권장) |
| ECDSA | ES256 / ES384 / ES512 | 공개 키/개인 키 | 고성능 마이크로서비스 |

## HMAC (대칭 키)

HMAC 은 동일한 키로 서명하고 검증하는 가장 간단한 방식입니다.

### 키 요구사항

HMAC 키는 `validateSigningKey`의 두 가지 검사를 통과해야 합니다:

- **길이 검사**: `len(SecretKey) < 32`인 경우 `ErrInvalidSecretKey` 반환, 오류 메시지에는 실제 바이트 길이가 포함됩니다 (예: `"minimum 32 bytes required, got 16"`)
- **엔트로피 검사**: `internal.IsWeakKey`로 저엔트로피 키를 감지하며, 다음 패턴이 거부됩니다:
  - 모두 동일한 문자 (예: `"aaaaaaaa..."`)
  - 반복되는 짧은 패턴 (예: `"abcabcabc..."`)
  - 연속 증가/감소 시퀀스 (예: `"abcdefgh..."`)
  - 일반적인 약한 비밀번호 및 그 변형 (예: `"password"`, `"qwerty"`)

:::warning 약한 키는 거부됩니다
"반복 문자", "연속 시퀀스", "사전 단어" 등 추측하기 쉬운 키를 사용하지 마세요. 길이가 32바이트에 도달하더라도 저엔트로피 키는 `jwt.New` 초기화 단계에서 거부되어 `ErrInvalidSecretKey`를 반환합니다.
:::

프로덕션 환경에서는 암호학적으로 안전한 난수 소스로 키를 생성해야 합니다:

```go
package main

import (
    "crypto/rand"
    "encoding/base64"
    "fmt"
    "log"

    "github.com/cybergodev/jwt"
)

func main() {
    // crypto/rand 로 32 바이트 난수 키 생성
    raw := make([]byte, 32)
    if _, err := rand.Read(raw); err != nil {
        log.Fatal(err)
    }
    // base64 인코딩으로 저장, 전달
    secret := base64.StdEncoding.EncodeToString(raw)

    cfg := jwt.DefaultConfig()
    cfg.SecretKey = secret
    processor, err := jwt.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer processor.Close()

    fmt.Println("HMAC 키 준비 완료, 길이(바이트):", len(secret)) // 출력: HMAC 키 준비 완료, 길이(바이트): 44
}
```

### 사용법

```go
cfg := jwt.DefaultConfig()
cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
cfg.SigningMethod = jwt.SigningMethodHS256 // 기본값, 생략 가능
```

### 알고리즘 선택

| 상수 | 알고리즘 | 설명 |
|------|------|------|
| `SigningMethodHS256` | HMAC-SHA256 | 권장, 성능과 보안의 균형 |
| `SigningMethodHS384` | HMAC-SHA384 | 더 높은 보안성 |
| `SigningMethodHS512` | HMAC-SHA512 | 최고 보안성 |

:::tip 권장
대부분의 시나리오에서는 `HS256`을 사용하면 충분합니다. 키는 암호학적으로 안전한 난수로 생성하고 길이는 최소 32 바이트 이상으로 하는 것을 권장합니다.
:::

## RSA (비대칭 키)

RSA 는 개인 키로 서명하고 공개 키로 검증합니다. 검증 측에서 개인 키를 보유할 필요가 없는 시나리오에 적합합니다.

### 사용법

```go
cfg := jwt.DefaultConfig()
cfg.SigningMethod = jwt.SigningMethodRS256
cfg.SigningKey = rsaPrivateKey        // *rsa.PrivateKey
cfg.VerificationKey = rsaPublicKey    // *rsa.PublicKey (선택)
```

:::tip 검증 키
`VerificationKey`는 선택 사항입니다. 설정하지 않으면 라이브러리가 `SigningKey`를 사용하여 검증합니다 (내부적으로 개인 키에서 공개 키를 추출).
:::

### 키 생성

```go
// 2048 비트 RSA 키 쌍 생성 (라이브러리는 최소 2048 비트를 강제 요구, 미만이면 ErrInvalidSecretKey 반환)
privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
if err != nil {
    log.Fatal(err)
}
publicKey := &privateKey.PublicKey
```

### 알고리즘 선택

| 상수 | 알고리즘 | 설명 |
|------|------|------|
| `SigningMethodRS256` | RSA-SHA256 | 권장 |
| `SigningMethodRS384` | RSA-SHA384 | 더 높은 보안성 |
| `SigningMethodRS512` | RSA-SHA512 | 최고 보안성 |

:::tip RSA-PSS 와 키 공유
RS256/RS384/RS512와 PS256/PS384/PS512는 동일한 키 타입(`*rsa.PrivateKey` / `*rsa.PublicKey`)과 동일한 검증 로직을 사용하므로 키를 교환하여 재사용할 수 있습니다. RSA에서 RSA-PSS로 마이그레이션할 때 키를 재생성할 필요가 없습니다.
:::

## RSA-PSS (비대칭 키, RSA 대체 권장)

RSA-PSS 는 RSA 의 개선된 서명 방식으로, 확률적 서명 방식 (PSS) 패딩을 사용하여 PKCS#1 v1.5 보다 보안성이 뛰어납니다. 키는 RSA 와 동일합니다.

### 사용법

```go
cfg := jwt.DefaultConfig()
cfg.SigningMethod = jwt.SigningMethodPS256
cfg.SigningKey = rsaPrivateKey        // *rsa.PrivateKey (RSA 와 키 공유)
cfg.VerificationKey = rsaPublicKey    // *rsa.PublicKey (선택)
```

:::tip 대체 권장
RSA-PSS 는 RSA PKCS#1 v1.5 보다 안전하므로 신규 프로젝트에서는 RSA-PSS 알고리즘을 우선 사용하는 것이 좋습니다. 키는 RSA 와 완전히 동일하므로 추가로 생성할 필요가 없습니다.
:::

### 알고리즘 선택

| 상수 | 알고리즘 | 설명 |
|------|------|------|
| `SigningMethodPS256` | RSA-PSS-SHA256 | 권장 |
| `SigningMethodPS384` | RSA-PSS-SHA384 | 더 높은 보안성 |
| `SigningMethodPS512` | RSA-PSS-SHA512 | 최고 보안성 |

## ECDSA (타원 곡선)

ECDSA 역시 비대칭 알고리즘이지만, 키가 더 짧고 성능이 더 좋습니다.

### 사용법

```go
cfg := jwt.DefaultConfig()
cfg.SigningMethod = jwt.SigningMethodES256
cfg.SigningKey = ecdsaPrivateKey      // *ecdsa.PrivateKey
cfg.VerificationKey = ecdsaPublicKey  // *ecdsa.PublicKey (선택)
```

### 키 생성

```go
// P-256 곡선 키 쌍 생성
privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
if err != nil {
    log.Fatal(err)
}
publicKey := &privateKey.PublicKey
```

### 알고리즘 선택

| 상수 | 알고리즘 | 곡선 | 설명 |
|------|------|------|------|
| `SigningMethodES256` | ECDSA-SHA256 | P-256 | 권장 |
| `SigningMethodES384` | ECDSA-SHA384 | P-384 | 더 높은 보안성 |
| `SigningMethodES512` | ECDSA-SHA512 | P-521 | 최고 보안성 |

### 곡선 매칭

알고리즘과 곡선은 엄격하게 대응해야 하며, 초기화 시 강제 검증합니다 (소스 코드는 `validateECDSACurve` 참조):

| 알고리즘 | 반드시 사용해야 하는 곡선 | 생성 방법 |
|------|----------------|----------|
| ES256 | P-256 | `elliptic.P256()` |
| ES384 | P-384 | `elliptic.P384()` |
| ES512 | P-521 | `elliptic.P521()` |

:::warning ES512 는 P-521 을 사용, P-512 가 아님
`ES512`에 대응하는 곡선은 **P-521**입니다 (512가 아닌 521에 주의). 이는 흔한 실수입니다 — 숫자 512 때문에 곡선도 P-512일 것으로 오해하기 쉽지만, Go 표준 라이브러리에는 `P512`가 존재하지 않으며 최상위 곡선이 `elliptic.P521()`입니다. 곡선이 불일치하면 `ErrInvalidSecretKey`를 반환합니다.
:::

## 키 분리 모드

마이크로서비스 아키텍처에서는 보통 **서명 능력**(토큰 발급)과 **검증 능력**(토큰 검증)을 분리하여 최소 권한 원칙을 따릅니다:

| 서비스 역할 | 보유 키 | 책임 |
|----------|----------|------|
| **인증 서비스** | 개인 키 (`SigningKey`) | 로그인 성공 후 액세스 토큰 발급 |
| **API 서비스** | 공개 키 (`VerificationKey`) | 토큰 서명 검증, 발급에 참여하지 않음 |

인증 서비스가 개인 키를 보유하고 발급을 담당하며, API 서비스는 공개 키로 토큰을 검증합니다. API 서비스의 설정에 `SigningKey`가 기록되어 있더라도 (현재 API는 이 필드가 비어있지 않음을 요구), `VerificationKey`만 설정되어 있으면 검증 시 해당 공개 키를 사용합니다.

:::tip VerificationKey 우선
`VerificationKey`를 설정하면 검증 흐름은 `SigningKey`에서 추출한 공개 키가 아닌 해당 공개 키를 사용합니다. 이를 통해 API 서비스가 검증 키를 명시적으로 제어할 수 있어, 검증 키와 서명 키를 분리하여 배포하는 시나리오에 적합합니다.
:::

인증 서비스 (토큰 발급):

```go
authCfg := jwt.DefaultConfig()
authCfg.SigningMethod = jwt.SigningMethodRS256
authCfg.SigningKey = rsaPrivateKey           // *rsa.PrivateKey, 서명에 사용
authCfg.VerificationKey = &rsaPrivateKey.PublicKey
```

API 서비스 (검증 전용):

```go
apiCfg := jwt.DefaultConfig()
apiCfg.SigningMethod = jwt.SigningMethodRS256
apiCfg.SigningKey = rsaPrivateKey            // 현재 API 는 SigningKey 가 비어있지 않음을 요구
apiCfg.VerificationKey = rsaPublicKey        // *rsa.PublicKey, 검증 시 실제 사용
```

:::warning 주의
검증 전용 `Processor`는 `Create` / `CreateRefresh`를 호출해서는 안 됩니다 (서명에는 개인 키 필요). 전체 교차 서비스 예제는 [고급 예제](../examples/advanced#키-분리-모드)를 참조하세요.
:::

## 선택 방법

```text
단일 애플리케이션 ──────────→ HMAC
마이크로서비스 (동일 신뢰 도메인) ──→ HMAC
마이크로서비스 (교차 서비스 검증)→ RSA, RSA-PSS 또는 ECDSA
보안 우선 ────────────────→ RSA-PSS (RSA 대체)
고성능 요구 ──────────────→ ECDSA
키 길이 민감 ─────────────→ ECDSA
```

| 고려 요소 | HMAC | RSA | RSA-PSS | ECDSA |
|----------|------|-----|---------|-------|
| 서명 속도 | 빠름 | 느림 | 느림 | 빠름 |
| 검증 속도 | 빠름 | 빠름 | 빠름 | 빠름 |
| 키 길이 | 32+ 바이트 | 2048+ 비트 | 2048+ 비트 | 256+ 비트 |
| 서명 길이 | 고정 | 김 (~256 바이트) | 김 (~256 바이트) | 짧음 (~64 바이트) |
| 아키텍처 결합 | 강결합 | 느슨한 결합 | 느슨한 결합 | 느슨한 결합 |
| 보안성 | 높음 | 높음 | 더 높음 | 높음 |

## 키 관리 모범 사례

### 환경 변수 주입

환경 변수로 키를 전달하여 소스 코드에 하드코딩하지 않습니다:

```go
package main

import (
    "fmt"
    "os"

    "github.com/cybergodev/jwt"
)

func main() {
    secret := os.Getenv("JWT_SECRET_KEY")
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = secret
    processor, err := jwt.New(cfg)
    if err != nil {
        fmt.Println("키가 유효하지 않음:", err)
        return
    }
    defer processor.Close()
    fmt.Println("Processor 준비 완료") // 출력: Processor 준비 완료
}
```

### PEM 파일에서 RSA 키 로드

프로덕션 환경에서는 보통 비대칭 키를 PEM 파일로 저장하고, 시작 시 `crypto/x509`로 파싱하여 로드합니다:

```go
package main

import (
    "crypto/x509"
    "encoding/pem"
    "fmt"
    "os"

    "github.com/cybergodev/jwt"
)

func main() {
    // 개인 키 PEM 파일 읽기
    keyData, err := os.ReadFile("private_key.pem")
    if err != nil {
        fmt.Println("개인 키 읽기 실패:", err)
        return
    }

    block, _ := pem.Decode(keyData)
    if block == nil {
        fmt.Println("PEM 디코딩 실패")
        return
    }

    privateKey, err := x509.ParsePKCS8PrivateKey(block.Bytes)
    if err != nil {
        fmt.Println("개인 키 파싱 실패:", err)
        return
    }

    cfg := jwt.DefaultConfig()
    cfg.SigningMethod = jwt.SigningMethodRS256
    cfg.SigningKey = privateKey
    processor, err := jwt.New(cfg)
    if err != nil {
        fmt.Println("초기화 실패:", err)
        return
    }
    defer processor.Close()
    fmt.Println("RSA 키가 PEM에서 로드됨") // 출력: RSA 키가 PEM에서 로드됨
}
```

:::tip PEM 에서 공개 키 로드
공개 키 PEM 파일은 `x509.ParsePKIXPublicKey`로 파싱하며, 반환값은 `any`이므로 `*rsa.PublicKey` 또는 `*ecdsa.PublicKey`로 타입 단언해야 합니다. 전체 예제는 [고급 예제](../examples/advanced#pem-파일에서-키-로드)를 참조하세요.
:::

### 키 교체

:::tip 교체 권장 사항
- 서명 키를 정기적으로 교체하세요 (3-6개월마다 권장)
- 신구 키 병행 기간에는 검증 측에서 두 공개 키를 모두 수락
- `kid` (Key ID) 헤더로 현재 키 버전을 식별하여 점진적 전환에 활용
- 교체 완료 후 이전 키를 폐기하고, 블랙리스트 동기화 필요 여부 확인
:::

## 보안 주의사항

:::danger 금지 사항
- 코드에 키를 하드코딩하지 마세요
- 약한 키를 사용하지 마세요 (숫자만, 반복 문자 등)
- `none` 알고리즘을 사용하지 마세요 (본 라이브러리는 자동으로 거부함)
- HMAC 키는 32 바이트 미만으로 사용하지 마세요
:::

:::tip 모범 사례
- 환경 변수 또는 키 관리 서비스를 사용하여 키를 저장하세요
- 서명 키를 정기적으로 교체하세요
- 프로덕션 환경에서는 RSA 또는 ECDSA 사용을 권장합니다
- RSA 키는 2048 비트 이상을 권장합니다
:::

## 다음 단계

- [커스텀 Claims](./custom-claims) — 비즈니스 필드 정의
- [API 레퍼런스 → 패키지 함수](../api-reference/functions) — 전체 API 시그니처
- [기본 예제](../examples/basic) — HMAC 전체 예제
