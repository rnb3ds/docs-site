---
sidebar_label: "커스텀 Claims"
title: "커스텀 Claims - CyberGo JWT | 비즈니스 클레임 인터페이스"
description: "커스텀 Claims 가이드: CustomClaims 인터페이스로 비즈니스 전용 클레임 필드를 정의하고, 내장 Claims 와 커스텀 타입의 검증 차이, ValidateInto 와 RefreshInto 파싱·갱신 사용법을 안내합니다."
sidebar_position: 20
---

# 커스텀 Claims

내장 [`Claims`](../api-reference/claims#claims) 구조체는 일반적인 시나리오를 다루지만, 비즈니스 시스템은 일반적으로 추가 필드가 필요합니다. `CustomClaims` 인터페이스를 구현하여 자체 Claims 구조체를 정의할 수 있습니다.

## CustomClaims 인터페이스

```go
type CustomClaims interface {
    GetRegisteredClaims() *RegisteredClaims
    Validate() error
}
```

두 가지 메서드만 구현하면 됩니다:

| 메서드 | 설명 |
|------|------|
| `GetRegisteredClaims()` | 표준 JWT 필드 반환 (iss, sub, aud 등) |
| `Validate()` | 커스텀 검증 로직 |

## Extra 필드 vs 커스텀 타입

비즈니스 필드를 저장하는 방법에는 두 가지가 있습니다: 내장 [`Claims.Extra`](../api-reference/claims#claims) 필드를 사용하거나, 커스텀 Claims 타입을 정의하는 것입니다. 각각 장단점이 있습니다.

### 비교

| 차원 | `Claims.Extra` | 커스텀 Claims 타입 |
|------|----------------|-------------------|
| 타입 안전 | 아니오, 값이 `any`, 타입 단언 필요 | 예, 컴파일 타임 타입 검사 |
| IDE 자동 완성 | 아니오, map 키에 힌트 없음 | 예, 필드 자동 완성 |
| 커스텀 검증 | 아니오, 라이브러리 내장 심층 검증만 | 예, `Validate()`에서 자유롭게 구현 |
| 심층 검증 | 예, 길이/인젝션/제어 문자 | 아니오, 등록 클레임 정제만 |
| 중첩 구조 | 아니오, 중첩 map 미지원 | 예, 임의의 구조체 |
| 적용 시나리오 | 소수의 선택적 부가 필드 | 핵심 비즈니스 필드, 커스텀 검증 필요 |

### Extra 필드의 제한

내장 `Claims.Extra`는 `map[string]any`이며, Processor는 토큰 생성 시 이에 대해 심층 검증을 수행합니다:

| 제한 항목 | 제약 |
|--------|------|
| 최대 키 수 | 50 개 |
| 허용되는 값 타입 | `string`과 `[]string`만 |
| 중첩 map | 거부 (`ValidationError` 반환) |
| 문자열 값 길이 | ≤ 256 문자 |
| 인젝션 패턴 탐지 | 다른 문자열 필드와 동일 |

```go
// ✅ 합법 — string 과 []string 값만
claims := &jwt.Claims{
    UserID: "user1",
    Extra: map[string]any{
        "team_id": "team-abc",            // string
        "tags":    []string{"vip", "qa"}, // []string
    },
}

// ❌ 불법 — 중첩 map 은 심층 검증에서 거부됨
claims = &jwt.Claims{
    Extra: map[string]any{
        "profile": map[string]any{"age": 30}, // ValidationError: nested maps not allowed
    },
}
```

::: tip 선택 방법
- **소수, 선택적, 평면적인** 부가 정보(예: `team_id`, `tags`) → `Extra`를 사용하여 라이브러리 내장 심층 검증의 혜택을 누리세요. 직접 검증을 작성할 필요가 없습니다.
- **핵심 비즈니스 필드** 또는 **열거/교차 필드 제약/타입 안전**이 필요한 경우 → 커스텀 Claims 타입을 정의하고 `Validate()`에서 비즈니스 규칙을 구현하세요. 단, 커스텀 구조체 필드는 심층 검증되지 않으므로 길이 및 인젝션 검사를 직접 보충해야 합니다 (아래 [보안 영향과 검증 템플릿](#보안-영향과-검증-템플릿) 참조).
:::

## 커스텀 Claims 정의

```go
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
```

:::tip 핵심 포인트
- `jwt.RegisteredClaims`를 반드시 임베드해야 합니다
- `GetRegisteredClaims()`는 임베드된 필드의 포인터를 반환해야 합니다
- `Validate()`는 토큰 생성과 검증 시 모두 호출됩니다
:::

## 커스텀 Claims 사용

### 토큰 생성

```go
claims := &MyClaims{
    UserID: "user123",
    Email:  "alice@example.com",
    Role:   "admin",
}
token, err := processor.Create(claims)
```

### 커스텀 구조체로 검증

`ValidateInto`를 사용하여 토큰을 커스텀 구조체로 파싱:

```go
myClaims := &MyClaims{}
result, valid, err := processor.ValidateInto(token, myClaims)
if err != nil {
    panic(err)
}
if valid {
    parsed := result.(*MyClaims)
    fmt.Println("UserID:", parsed.UserID)
    fmt.Println("Email:", parsed.Email)
}
```

### 커스텀 구조체로 갱신

`RefreshInto`를 사용하여 토큰을 갱신하고 커스텀 필드를 유지:

```go
newToken, err := processor.RefreshInto(refreshToken, &MyClaims{})
if err != nil {
    panic(err)
}
```

:::warning 시간 필드 보호
`RefreshInto`는 Claims 의 시간 필드 (`IssuedAt`, `ExpiresAt`, `ID`) 를 자동으로 복원하며, 작업이 실패해도 복원이 보장됩니다.
:::

## 복잡한 검증 예제

커스텀 Claims의 진정한 가치는 `Validate()`에서 비즈니스 규칙을 구현하는 데 있습니다. 아래 예제는 필수 검증, 열거값 제약, 교차 필드 제약을 보여줍니다:

```go
package main

import (
    "errors"
    "fmt"

    "github.com/cybergodev/jwt"
)

// AccountClaims 계정 계층과 기기 할당량의 비즈니스 클레임을 담음
type AccountClaims struct {
    UserID    string   `json:"user_id"`
    Tier      string   `json:"tier"`       // free | pro | enterprise
    Region    string   `json:"region"`     // cn | us | eu
    DeviceIDs []string `json:"device_ids"`
    jwt.RegisteredClaims
}

// 각 계층의 최대 기기 수
var tierMaxDevices = map[string]int{
    "free":       2,
    "pro":        10,
    "enterprise": 100,
}

var allowedRegions = map[string]bool{"cn": true, "us": true, "eu": true}

func (c *AccountClaims) GetRegisteredClaims() *jwt.RegisteredClaims {
    return &c.RegisteredClaims
}

func (c *AccountClaims) Validate() error {
    // 1. 필수 필드 검증
    if c.UserID == "" {
        return errors.New("user_id is required")
    }

    // 2. 열거값 검증
    if _, ok := tierMaxDevices[c.Tier]; !ok {
        return fmt.Errorf("invalid tier %q: must be free, pro or enterprise", c.Tier)
    }
    if !allowedRegions[c.Region] {
        return fmt.Errorf("invalid region %q: must be cn, us or eu", c.Region)
    }

    // 3. 교차 필드 제약: 기기 수는 해당 계층 할당량을 초과할 수 없음
    if max := tierMaxDevices[c.Tier]; len(c.DeviceIDs) > max {
        return fmt.Errorf("tier %q allows at most %d devices, got %d",
            c.Tier, max, len(c.DeviceIDs))
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

    // 합법 토큰: pro 계층, 3대 기기 (≤ 10)
    valid := &AccountClaims{
        UserID:    "user123",
        Tier:      "pro",
        Region:    "cn",
        DeviceIDs: []string{"dev-1", "dev-2", "dev-3"},
    }
    _, err = processor.Create(valid)
    if err != nil {
        panic(err)
    }
    fmt.Println("Token created successfully")

    // 위반 토큰: free 계층에 5대 기기 (> 2) → Validate() 거부
    _, err = processor.Create(&AccountClaims{
        UserID:    "user456",
        Tier:      "free",
        Region:    "us",
        DeviceIDs: []string{"d1", "d2", "d3", "d4", "d5"},
    })
    fmt.Println("Over-quota error:", err)
    // 출력: Over-quota error: invalid claims: tier "free" allows at most 2 devices, got 5
}
```

::: tip 오류 래핑
`Validate()`가 반환하는 설명적 오류는 `ErrInvalidClaims`로 래핑됩니다. 호출자는 `errors.Is(err, jwt.ErrInvalidClaims)`로 카테고리를 판단할 수도 있고, 오류 문자열을 직접 읽어 비즈니스 세부 정보를 얻을 수도 있습니다. 자세한 내용은 [오류 처리](./error-handling#오류-래핑-체인)를 참조하세요.
:::

## 검증 차이

내장 `*Claims`와 커스텀 타입은 서로 다른 검증 경로를 따릅니다:

| 검증 항목 | `*Claims` | 커스텀 타입 |
|--------|-----------|------------|
| `Validate()` 메서드 | ✅ | ✅ |
| 문자열 길이 제한 (256 자) | ✅ | ❌ |
| 배열 크기 제한 (100 개 항목) | ✅ | ❌ |
| 인젝션 패턴 감지 | ✅ | ❌ |
| 제어 문자 필터링 | ✅ | ❌ |
| `Extra` 필드 제한 | ✅ | 해당 없음 |
| 등록 클레임 문자열 정제 | ✅ | ✅ |

:::warning 보안 영향
커스텀 Claims의 비즈니스 필드는 심층 검증되지 **않습니다**. 이는 악의적 입력이 서명 검증을 통과한 후 커스텀 구조체로 파싱되면, `<script>` 태그, SQL 단편, 초장 문자열 등 위험한 내용이 그대로 토큰에 저장됨을 의미합니다 — 내장 `*Claims`의 46가지 인젝션 패턴 탐지, 256문자 길이 제한, 제어 문자 필터링이 모두 적용되지 않습니다.

`Validate()` 메서드에서 필요한 모든 검증을 직접 구현하세요. 그렇지 않으면 토큰이 XSS/SQL 인젝션의 매개체가 될 수 있습니다.
:::

### 보안 영향과 검증 템플릿

아래 보조 함수는 내장 심층 검증의 핵심 로직(길이 상한, 제어 문자, 인젝션 부분문자열)을 복제한 것으로, 커스텀 Claims의 `Validate()`에서 직접 호출할 수 있습니다:

```go
package main

import (
    "errors"
    "fmt"
    "strings"
)

const maxClaimLength = 256

// dangerousSubstrings 는 라이브러리 내장 탐지와 중복되는 고위험 부분문자열이며, 비즈니스에 따라 추가/삭제 가능.
var dangerousSubstrings = []string{
    "<script", "javascript:", "onerror=", "onload=",
    "drop table", "union select", "../", "/etc/passwd",
}

// validateField 는 커스텀 필드의 길이, 제어 문자, 일반적인 인젝션 패턴을 검증.
func validateField(name, value string) error {
    if len(value) > maxClaimLength {
        return fmt.Errorf("%s exceeds maximum length of %d", name, maxClaimLength)
    }
    for i := 0; i < len(value); i++ {
        c := value[i]
        if c < 32 && c != '\t' && c != '\n' && c != '\r' {
            return fmt.Errorf("%s contains invalid control character", name)
        }
    }
    lower := strings.ToLower(value)
    for _, pattern := range dangerousSubstrings {
        if strings.Contains(lower, pattern) {
            return fmt.Errorf("%s contains suspicious pattern", name)
        }
    }
    return nil
}

type MyClaims struct {
    UserID     string `json:"user_id"`
    Department string `json:"department"`
}

func (c *MyClaims) Validate() error {
    if c.UserID == "" {
        return errors.New("user_id is required")
    }
    // 커스텀 필드는 내장 심층 검증의 혜택을 받지 못하므로 길이와 인젝션 검사를 수동으로 보충
    if err := validateField("user_id", c.UserID); err != nil {
        return err
    }
    if err := validateField("department", c.Department); err != nil {
        return err
    }
    return nil
}

func main() {}
```

## 선택적 인터페이스: RateLimitKeyer

커스텀 Claims 는 `RateLimitKeyer` 인터페이스를 구현하여 속도 제한 키를 제공할 수 있습니다:

```go
func (c *MyClaims) RateLimitKey() string {
    return c.Email // Email 을 속도 제한 키로 사용
}
```

속도 제한 키 조회 우선순위: `Subject` → `*Claims.UserID` → `RateLimitKey()`.

## 다음 단계

- [API 레퍼런스 → 인터페이스 정의](../api-reference/interfaces#customclaims) — CustomClaims 전체 정의
- [API 레퍼런스 → Processor](../api-reference/processor#validateinto) — ValidateInto / RefreshInto 메서드
- [고급 예제](../examples/advanced) — 커스텀 Claims 전체 예제
