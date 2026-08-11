---
sidebar_label: "데이터 마스킹"
title: "데이터 마스킹 - CyberGo env | 로그 보안 도구"
description: "CyberGo env 민감 데이터 마스킹 도구 완전한 가이드로, IsSensitiveKey 자동 감지로 비밀번호와 키 등 민감 키를 식별하고, MaskValue로 민감도별 값을 마스킹하며, MaskKey로 키 이름을 마스킹하고, SanitizeForLog로 로그 문자열을 정리하며 ClearBytes로 안전하게 제로화합니다. HTTP 미들웨어와 구조화된 로그 실전 예제를 포함합니다."
sidebar_position: 2
---

# 민감 데이터 마스킹

env는 로그, 오류 메시지, 디버그 출력에서 민감 데이터 유출을 방지하기 위한 **Loader와 독립적인 실용 도구 함수 세트**를 제공합니다. 이 함수들은 Loader를 생성하지 않고도 직접 호출할 수 있으며, 구성을 안전하게 기록해야 하는 모든 시나리오에 적합합니다.

## 마스킹이 필요한 이유

[SecureValue](/ko/env/api-reference/secure-value)로 메모리 내의 민감 값을 적절히 보호하더라도, 여전히 세 가지 경로로 유출될 수 있습니다:

- **애플리케이션 로그** - 구성, 요청 매개변수, 연결 문자열을 직접 출력
- **오류 메시지** - panic / error가 키를 로그 수집 시스템으로 유입
- **디버그 출력** - `fmt.Println` 디버깅 시 무심코 환경 변수 출력

```text
log.Printf("구성 로드 DB_PASSWORD=%s", pwd)          ← 로그 유출
panic("connect failed: password=hunter2")           ← 오류 유출
fmt.Println(env.GetString("API_KEY"))               ← 디버그 유출
```

이러한 출력이 로그 집계 시스템(ELK, Datadog...)으로 유입되거나 팀 멤버, 운영자, 심지어 공격자에게 보이면 키가 유출된 것이나 다름없습니다. env의 마스킹 도구를 사용하면 기록할 때 **민감 콘텐츠를 자동으로 차폐**하여 근원에서 유출을 막을 수 있습니다.

## 함수 상세

### IsSensitiveKey

```go
func IsSensitiveKey(key string) bool
```

대소문자 구분 없이 `key`가 민감 패턴을 포함하는지 확인합니다. 검사는 **부분 문자열 매칭**을 사용합니다 - 키 이름(대문자로 변환 후)이 내장 패턴 중 하나라도 포함하면 민감으로 판정합니다.

**내장 감지 패턴:**

| 카테고리 | 패턴 |
|------|------|
| 인증류 | `PASSWORD`, `SECRET`, `TOKEN`, `AUTH`, `CREDENTIAL`, `PASSPHRASE`, `SESSION`, `COOKIE` |
| 키류 | `API_KEY`, `APIKEY`, `ACCESS_KEY`, `SECRET_KEY`, `PRIVATE_KEY`, `PUBLIC_KEY` |
| 암호화류 | `PRIVATE`, `ENCRYPTION_KEY`, `ENCRYPT_KEY`, `DECRYPT_KEY`, `SIGNING_KEY`, `SIGN_KEY`, `VERIFY_KEY` |
| 금융 / PII | `SSN`, `SOCIAL_SECURITY`, `CREDIT_CARD`, `CARD_NUMBER`, `CVV`, `CVC`, `CCV`, `PAN` |
| 암호화폐 | `MNEMONIC`, `SEED`, `RECOVERY`, `WALLET`, `PRIVATE_ADDRESS` |
| 인프라 | `CONNECTION_STRING`, `CONN_STRING`, `DATABASE_URL`, `DB_PASSWORD` |
| 클라우드 서비스 | `AWS_SECRET`, `AZURE_KEY`, `GCP_KEY`, `SERVICE_ACCOUNT` |

:::tip 부분 문자열 매칭의 의미
`IsSensitiveKey("MY_API_KEY_TOKEN")`은 `API_KEY`와 `TOKEN`에 모두 매칭되어 true를 반환합니다. 즉, `AUTHORIZATION`도 `AUTH`를 포함하고 있어 민감으로 판정됩니다 - 이것이 의도된 보수적인 동작입니다.
:::

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

func main() {
    // 인증 및 키류
    fmt.Println(env.IsSensitiveKey("DB_PASSWORD"))  // true
    fmt.Println(env.IsSensitiveKey("API_KEY"))      // true
    fmt.Println(env.IsSensitiveKey("ACCESS_TOKEN")) // true

    // 대소문자 구분 안 함
    fmt.Println(env.IsSensitiveKey("api_key")) // true
    fmt.Println(env.IsSensitiveKey("ApiKey"))  // true

    // 비민감 키
    fmt.Println(env.IsSensitiveKey("PORT"))    // false
    fmt.Println(env.IsSensitiveKey("DB_HOST")) // false
}
```

### MaskValue

```go
func MaskValue(key, value string) string
```

`key`의 민감도에 따라 `value`를 마스킹하며, 구성 키-값 쌍을 기록하는 데 적합합니다:

| 조건 | 반환값 |
|------|--------|
| `IsSensitiveKey(key)`가 true | `[MASKED:N chars]`(N = `len(value)`) |
| 비민감이고 `len(value) ≤ 20` | 원래 값 |
| 비민감이고 `len(value) > 20` | `value[:17] + "..."` |

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

func main() {
    // 민감 값 → 마스킹(문제 해결을 위해 길이 정보 보존)
    fmt.Println(env.MaskValue("DB_PASSWORD", "p@ssw0rd123"))
    // 출력: [MASKED:11 chars]

    // 비민감 짧은 값 → 원래대로 반환
    fmt.Println(env.MaskValue("PORT", "8080"))
    // 출력: 8080

    // 비민감 긴 값(>20자) → 잘림
    fmt.Println(env.MaskValue("DESCRIPTION", "this-is-a-very-long-description-value"))
    // 출력: this-is-a-very-lo...
}
```

:::tip 길이 보존의 의도
`[MASKED:N chars]`은 값의 콘텐츠가 아닌 길이만 노출합니다. 이는 "비밀번호가 잘렸는지", "키가 완전한지"를 해결할 때 유용하며, 평문을 유출하지 않습니다.
:::

### MaskKey

```go
func MaskKey(key string) string
```

키 이름 자체를 마스킹하며, 키의 존재는 보여야 하지만 키의 의미를 노출하지 않아야 하는 시나리오에 사용됩니다(내부적으로 `DefaultMaskKey` 호출):

| 조건 | 반환값 |
|------|--------|
| `len(key) ≤ 3` | `***` |
| `len(key) > 3` | `key[:2] + "***"` |

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

func main() {
    fmt.Println(env.MaskKey("DB_PASSWORD")) // DB***
    fmt.Println(env.MaskKey("API_KEY"))     // AP***
    fmt.Println(env.MaskKey("TOKEN"))       // TO***
    fmt.Println(env.MaskKey("AB"))          // ***
    fmt.Println(env.MaskKey("XYZ"))         // ***(길이 ≤ 3)
}
```

:::warning MaskValue와의 조합
`MaskKey`는 키 이름의 앞 2자만 가져오므로, `DB_HOST`와 `DB_PASSWORD` 모두 `DB***`가 됩니다. 로그에서 둘을 구분해야 하는 경우 `MaskValue`와 함께 출력하거나, 키 이름이 중요하지 않을 때만 단독으로 사용하세요.
:::

### MaskSensitiveInString

```go
func MaskSensitiveInString(s string) string
```

긴 문자열을 잘라내어, 로그에 너무 많은 콘텐츠가 출력되는 것을 방지합니다(간접적으로 정보 유출되거나 로그가 폭발하는 것을 방지):

| 조건 | 반환값 |
|------|--------|
| `len(s) > 50` | `s[:47] + "..."` |
| 그 외 | 원래 값 |

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

func main() {
    long := "012345678901234567890123456789012345678901234567890123456789"
    fmt.Println(env.MaskSensitiveInString(long))
    // 출력: 012345678901234567890123456789012345678901234567...

    short := "hello world"
    fmt.Println(env.MaskSensitiveInString(short))
    // 출력: hello world
}
```

### SanitizeForLog

```go
func SanitizeForLog(s string) string
```

문자열에서 `key=value` 패턴을 스캔하여, 민감 키에 해당하는 `key=value`를 **전체** `[MASKED]`로 교체하며, 제어 문자도 제거합니다(`\n`과 `\t`는 보존). 연결 문자열, 오류 메시지 등 인라인 키-값을 처리하는 데 적합합니다.

**감지하는 할당 패턴:** `password=`, `secret=`, `token=`, `auth=`, `credential=`, `passphrase=`, `session=`, `cookie=`, `api_key=`, `apikey=`, `access_key=`, `secret_key=`, `private_key=`, `public_key=`, `encrypt_key=`, `decrypt_key=`, `signing_key=`, `ssn=`, `credit_card=`, `card_number=`, `cvv=`, `cvc=`, `mnemonic=`, `seed=`, `recovery=`, `wallet=`, `connection_string=`, `database_url=`, `db_password=`

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

func main() {
    fmt.Println(env.SanitizeForLog("user=admin password=s3cret"))
    // 출력: user=admin [MASKED]

    fmt.Println(env.SanitizeForLog("token=abc123 host=localhost"))
    // 출력: [MASKED] host=localhost

    // 여러 민감 값을 모두 마스킹
    fmt.Println(env.SanitizeForLog("user=pguser password=hunter2 api_key=sk_123"))
    // 출력: user=pguser [MASKED] [MASKED]
}
```

:::tip 교체 단위
`SanitizeForLog`는 `password=s3cret` 전체를 단일 `[MASKED]`로 교체합니다(키 이름과 함께). `password=[MASKED]`로 보존하지 않습니다. 이렇게 하면 로그에 "여기에 비밀번호가 있다"는 정보조차 노출되지 않습니다.
:::

### ClearBytes

```go
func ClearBytes(b []byte)
```

바이트 슬라이스를 모두 0으로 설정합니다. `Reveal()`로 획득하여 `[]byte` 형태로 처리한 민감 데이터를 수동으로 제로화하여 평문이 메모리에 남지 않도록 합니다.

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

func main() {
    // []byte 형태로 처리되는 민감 데이터 시뮬레이션
    secret := []byte("secret123")
    fmt.Printf("제로화 전: %s\n", secret)
    // 출력: 제로화 전: secret123

    env.ClearBytes(secret)
    fmt.Printf("제로화 후: %q\n", secret)
    // 출력: 제로화 후: "\x00\x00\x00\x00\x00\x00\x00\x00\x00"
}
```

:::warning ClearBytes의 한계
`ClearBytes`는 전달된 슬라이스만 제로화합니다. 동일한 민감 데이터가 여러 번 복사된 경우(예: string과 []byte 간 변환은 새 복사본을 생성), 이 복사본들은 일괄 제로화할 수 없습니다. 민감 데이터는 복사를 최소화하고, [SecureValue](/ko/env/api-reference/secure-value)의 `Release()` / `Close()`와 함께 사용해야 합니다.
:::

## 실전 예제

아래는 애플리케이션 시작 시 구성을 안전하게 출력하고, 인라인 자격 증명이 포함된 오류 메시지를 처리하는 예제입니다 - `MaskValue`, `SanitizeForLog`, `IsSensitiveKey`, `MaskKey`의 협력 사용을 다룹니다:

```go
package main

import (
    "errors"
    "fmt"

    "github.com/cybergodev/env"
)

func main() {
    // 환경 변수에서 로드된 구성 시뮬레이션
    config := []struct{ key, value string }{
        {"PORT", "8080"},
        {"DB_HOST", "localhost"},
        {"DB_PASSWORD", "super-secret-pwd"},
        {"API_KEY", "sk_live_1234567890abcdef"},
    }

    fmt.Println("=== 시작 구성(마스킹됨)===")
    for _, c := range config {
        fmt.Printf("%-15s = %s\n", c.key, env.MaskValue(c.key, c.value))
    }

    fmt.Println("\n=== 오류 로그(자동 마스킹)===")
    err := errors.New("failed to connect: user=admin password=hunter2 host=db.local")
    fmt.Println(env.SanitizeForLog(err.Error()))

    fmt.Println("\n=== 민감 키 목록(키 이름 마스킹)===")
    for _, c := range config {
        if env.IsSensitiveKey(c.key) {
            fmt.Printf("민감 구성: %s\n", env.MaskKey(c.key))
        }
    }
}
```

출력:

```text
=== 시작 구성(마스킹됨)===
PORT            = 8080
DB_HOST         = localhost
DB_PASSWORD     = [MASKED:16 chars]
API_KEY         = [MASKED:24 chars]

=== 오류 로그(자동 마스킹)===
failed to connect: user=admin [MASKED] host=db.local

=== 민감 키 목록(키 이름 마스킹)===
민감 구성: DB***
민감 구성: AP***
```

## SecureValue와의 관계

env의 보안 체계는 두 가지 상호 보완적인 방어선으로 구성됩니다:

| 방어선 | 보호 대상 | 도구 |
|------|----------|------|
| **메모리 보호** | 런타임에 메모리에 상주하는 값 | `GetSecure` / `Reveal` / `Masked` / `Release` |
| **출력 마스킹** | 로그, 오류, 디버그 출력에 기록되는 값 | `IsSensitiveKey` / `MaskValue` / `SanitizeForLog` 등 |

```go
// 1. 메모리 보호: SecureValue로 읽기
secret := env.GetSecure("API_KEY")
defer secret.Release()
key := secret.Reveal()

// 2. 출력 마스킹: 기록 시 차폐
log.Printf("사용 %s 연결", secret.Masked())
// 또는 임의 소스의 값을 수동으로 마스킹(SecureValue에 한정하지 않음)
log.Printf("구성 %s", env.MaskValue("API_KEY", key))
```

:::tip 명확한 역할 분담
- SecureValue의 `Masked()` 출력은 `[SECURE:32 bytes locked]` 형태로, 자신이 관리하는 값에만 사용됩니다.
- 마스킹 도구 함수(`MaskValue` 등)는 **모든 소스**의 값에 사용할 수 있습니다 - SecureValue에 한정하지 않으며, Loader에도 의존하지 않습니다.
:::

## 관련 문서

- [보안 개요](/ko/env/security/) - 보안 아키텍처 총관
- [SecureValue API](/ko/env/api-reference/secure-value) - 메모리 내 값 보호(`Masked` / `Reveal` 포함)
- [메모리 잠금](/ko/env/security/memory-locking) - 민감 데이터가 디스크로 스왑되는 것 방지
- [프로덕션 체크리스트](/ko/env/security/production-checklist) - 프로덕션 적용 전 보안 점검
