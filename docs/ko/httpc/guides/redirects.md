---
title: "리다이렉트 - CyberGo HTTPC | 따라가기 제어와 보안 허용 목록"
description: "HTTPC 리다이렉트 가이드: 자동 따라가기와 10회 상한, WithFollowRedirects/WithMaxRedirects 제어, RedirectChain 추적, 크로스 도메인 자격 증명 자동 제거와 RedirectWhitelist 허용 목록으로 오픈 리다이렉트를 방어합니다."
sidebar_label: "리다이렉트"
sidebar_position: 4
---

# 리다이렉트

HTTPC는 기본적으로 HTTP 리다이렉트를 자동으로 따라가며(최대 10회) 완전한 리다이렉트 체인을 기록합니다. 이 페이지에서는 따라가기 제어, 횟수 제한, 체인 추적, 상태 코드의 메서드 의미, 크로스 도메인 자격 증명 제거, 순환 리다이렉트 감지, 도메인 허용 목록, SSRF 방어와의 연동을 다룹니다.

## 기본 동작

별도 구성 없이 클라이언트는 최종 응답에 도달하거나 횟수 상한에 걸릴 때까지 리다이렉트를 따라갑니다:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    result, err := httpc.Get("https://httpbin.org/redirect/2")
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println(result.StatusCode())        // 200 (최종 응답의 상태 코드)
    fmt.Println(result.Meta.RedirectCount)  // 2 (실제로 따라간 리다이렉트 횟수)
}
```

엔진은 301/302/303/307/308 다섯 가지 리다이렉트 상태 코드를 자동으로 따라가며, 메서드 의미는 HTTP 사양을 따릅니다:

| 상태 코드 | 메서드 처리 |
|--------|----------|
| 301 / 302 / 303 | POST를 GET으로 바꿀 수 있음 (사양이 허용) |
| 307 / 308 | 원래 메서드와 요청 본문을 유지한 채 재전송 |

### 상태 코드 의미 (301/302/303/307/308)

다섯 가지 상태 코드의 '메서드 변경'과 '요청 본문'에서의 차이는 다음과 같습니다:

| 상태 코드 | 의미 | 메서드 처리 | 요청 본문 | 전형적인 용도 |
|--------|------|----------|--------|----------|
| 301 | 영구 이동 | GET/HEAD는 유지, POST 등은 GET으로 변경 | 버려짐 | 도메인 이전, URL 정규화 |
| 302 | 임시 이동 (Found) | 301과 동일 (사실상의 표준 동작을 따름) | 버려짐 | 임시 이동, 로그인 후 전환 |
| 303 | 다른 위치 참조 (See Other) | 항상 GET으로 변경 | 버려짐 | POST 후 결과 페이지로 이동 |
| 307 | 임시 리다이렉트 | 원래 메서드 유지 | 유지한 채 재전송 | 본문을 다시 보내야 하는 임시 이동 |
| 308 | 영구 리다이렉트 | 원래 메서드 유지 | 유지한 채 재전송 | 본문을 다시 보내야 하는 영구 이동 |

:::warning 요청 본문이 있는 307/308은 자동으로 따라가지 않음
307/308은 원래 메서드로 **요청 본문을 다시 전송**하도록 요구합니다. 하부 net/http는 요청 본문을 재전송할 수 있을 때(`GetBody` 설정됨)만 따라가는데, HTTPC는 요청을 만들 때 이 함수를 설정하지 않습니다 — 따라서 비어 있지 않은 요청 본문을 가진 요청이 307/308을 받으면 **자동으로 따라가지 않고 3xx 응답을 그대로 반환**합니다(오류 아님). 이런 이동을 따라가야 한다면 `WithFollowRedirects(false)`로 수동 루프를 처리하거나, 서버가 302/303을 쓰도록 변경하세요.
:::

:::tip 300/304와 그 외 3xx는 따라가기 대상이 아님
`Location` 헤더를 담고 있더라도 엔진은 301/302/303/307/308만 따라갑니다. 300(Multiple Choices), 304(Not Modified) 및 그 외 3xx 응답은 그대로 반환되어 호출자가 직접 처리합니다. 참고로 `Result.IsRedirect()`는 300~399 구간 전체를 판별하며 자동 따라가기 여부와는 무관합니다.
:::

:::tip 상한 초과 시 오류
리다이렉트 횟수가 `MaxRedirects`를 초과하면 요청은 오류로 종료됩니다(오류 메시지 형태: `stopped after 3 redirects`). 무한 루프에 빠지지 않습니다. `MaxRedirects`의 유효 범위는 0-50이며, 범위를 벗어나면 설정 검증에서 오류가 발생합니다.
:::

## 따라가기 제어

리다이렉트 설정은 세 계층에 나뉘며, 적용 범위는 넓은 것부터 좁은 것 순입니다:

| 계층 | 설정 | 적용 범위 |
|------|------|----------|
| 클라이언트 수준 | `Config.Defaults.FollowRedirects` / `MaxRedirects` | 전체 클라이언트의 모든 요청 |
| 요청 수준 | `WithFollowRedirects(bool)` / `WithMaxRedirects(n)` | 단일 요청, 클라이언트 설정 덮어쓰기 |
| 프리셋 | `SecureConfig()`, `MinimalConfig()` (둘 다 `FollowRedirects=false`) | 보안/최소 시나리오는 기본적으로 따라가지 않음 |

### 클라이언트 수준

`Config.Defaults`(`RequestDefaults`)가 전체 클라이언트의 리다이렉트 정책을 설정합니다:

```go
cfg := httpc.DefaultConfig()
cfg.Defaults.FollowRedirects = true  // 기본값: 따라감
cfg.Defaults.MaxRedirects = 5        // 기본값: 10

client, err := httpc.New(cfg)
```

### 요청 수준

`WithFollowRedirects` / `WithMaxRedirects`는 단일 요청에 대해 클라이언트 설정을 덮어씁니다:

```go
// 이 요청만 따라가기를 금지하고 3xx 응답을 바로 받기
result, err := httpc.Get("https://httpbin.org/redirect/1",
    httpc.WithFollowRedirects(false),
)
if result.IsRedirect() {
    fmt.Println(result.Response.Headers.Get("Location")) // 리다이렉트 대상 주소
}

// 이 요청만 3회로 제한
result, err = httpc.Get(url, httpc.WithMaxRedirects(3))
```

:::warning MaxRedirects(0)는 비활성화가 아님
`0`은 '미설정' 센티널 값입니다 — 엔진은 기본값 10으로 폴백하며 리다이렉트를 금지하지 않습니다. 따라가기를 금지하려면 `WithFollowRedirects(false)` 또는 `Config.Defaults.FollowRedirects = false`를 사용하세요.
:::

:::tip SecureConfig는 기본적으로 리다이렉트 비활성화
`SecureConfig()` 프리셋은 `FollowRedirects`를 `false`로 설정해, 리다이렉트를 이용해 요청을 내부 주소로 보내는 일(리다이렉트형 SSRF)을 방지합니다. 보안 세부 사항은 [SSRF 방어](../security/ssrf)를 참조하세요.
:::

## 리다이렉트 체인 추적

`Result.Meta`는 매 요청의 리다이렉트 정보를 기록합니다:

| 필드 | 설명 |
|------|------|
| `Meta.RedirectCount` | 실제로 따라간 리다이렉트 횟수 |
| `Meta.RedirectChain` | 리다이렉트 과정에서 거친 URL 시퀀스 |

두 필드의 정확한 의미:

- `RedirectChain`은 각 홉의 **출발 URL**을 기록합니다. 첫 항목은 초기 요청 URL이고 이후는 각 중간 URL이 차례로 이어지며, **최종 목적지 URL은 체인에 없습니다**. 최종 주소가 필요하면 `result.Request.URL`(따라가기가 끝난 뒤의 최종 요청 URL)을 읽으세요.
- `RedirectCount`는 항상 `len(RedirectChain)`과 같습니다.

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    result, err := httpc.Get("https://httpbin.org/redirect/3")
    if err != nil {
        log.Fatal(err)
    }

    fmt.Printf("%d회 리다이렉트 따라감\n", result.Meta.RedirectCount)
    for i, u := range result.Meta.RedirectChain {
        fmt.Printf("  %d. %s\n", i+1, u)
    }
    fmt.Println("최종 주소:", result.Request.URL)
    // 출력:
    //   1. https://httpbin.org/redirect/3
    //   2. https://httpbin.org/redirect/2
    //   3. https://httpbin.org/redirect/1
    // 최종 주소: https://httpbin.org/get
}
```

## 크로스 도메인 자격 증명 자동 제거

리다이렉트를 따라갈 때 엔진은 매 홉에서 대상 호스트명을 검사합니다. **초기 요청**의 호스트명과 일치하지 않으면(크로스 도메인 이동) 민감한 요청 헤더를 자동으로 삭제해 자격 증명이 리다이렉트 대상으로 새는 것을 막습니다:

| 요청 헤더 | 대상 호스트 = 초기 요청 호스트 | 대상 호스트 ≠ 초기 요청 호스트 |
|--------|------------------------|------------------------|
| `Authorization` | 유지 | 삭제 |
| `Proxy-Authorization` | 유지 | 삭제 |
| `Cookie` | 유지 | 삭제 |
| 그 외 커스텀 헤더 | 유지 | 유지 |

판정 세부 사항:

- 비교 기준은 **초기 요청**의 호스트명(첫 홉의 `via[0]`)이지 이전 홉이 아닙니다. `api.example.com → www.example.com`은 크로스 도메인입니다(정확한 호스트명 비교, 서브도메인이 달라도 다름). `A → B → A`처럼 초기 호스트로 돌아오면 제거하지 않습니다.
- 제거는 cookie jar와 무관하게 작동합니다. `EnableCookies`를 켜지 않았더라도 수동으로 설정한 `Cookie` 요청 헤더는 크로스 도메인 이동 시 마찬가지로 삭제됩니다.

`WithBasicAuth` / `WithBearerToken`과 함께 쓸 때는 별도 처리가 필요 없습니다 — token은 원래 호스트로만 전송되고, 이동에 따라 제3자 도메인으로 넘어가지 않습니다.

## 순환 리다이렉트 감지

횟수 상한 외에 엔진은 **순환 리다이렉트**(이동 대상이 이미 체인에 등장한 적 있는 경우)도 감지합니다. 걸리면 횟수를 다 쓰기를 기다리지 않고 즉시 오류로 종료합니다:

```text
A → B → A     순환: 오류 circular redirect detected: A
A → A → A     연속 같은 URL: 순환 아님 (서버가 매번 다른 응답을 반환할 수 있음)
```

순환 감지와 `MaxRedirects` 횟수 상한은 서로 보완합니다. 횟수 상한이 모든 루프를 막고, 순환 감지는 '명백히 도는' 체인을 미리 간파해 불필요한 요청을 줄입니다.

## 리다이렉트 오류 분류

따라가기가 거부되면(초과, 순환, 허용 목록, SSRF 차단) 요청은 `ClientError`로 종료되며 Type은 `ErrorTypeValidation`으로 통일됩니다:

| 하부 오류 메시지 | Message 필드 | 트리거 조건 |
|--------------|--------------|----------|
| `stopped after N redirects` | `redirect limit exceeded` | 이동 횟수가 `MaxRedirects`(또는 기본값 10)에 도달 |
| `circular redirect detected: <URL>` | `circular redirect detected` | 대상 URL이 이미 이동 체인에 존재 |
| `redirect blocked by whitelist: ...` | `redirect blocked by policy` | 대상 도메인이 `RedirectWhitelist`에 없음 |
| `redirect blocked: ...` | `redirect blocked by policy` | 대상 호스트가 SSRF 방어에 차단됨 |

```go
package main

import (
    "errors"
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Defaults.MaxRedirects = 2 // 2회만 따라가도록 허용

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // /redirect/5는 5번 따라가야 하므로 반드시 상한 초과
    _, err = client.Get("https://httpbin.org/redirect/5")
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) && clientErr.Type == httpc.ErrorTypeValidation {
            fmt.Println("리다이렉트 거부됨:", clientErr.Message)
            // 출력: 리다이렉트 거부됨: redirect limit exceeded
        }
    }
}
```

리다이렉트 대상의 SSRF 검증에는 두 가지 하드 규칙이 더 있습니다. **http/https 프로토콜만 허용**(`ftp://`, 커스텀 프로토콜의 `Location`은 거부)과 **대상 호스트가 비어 있으면 안 됨**. 검증 단계에서는 DNS 확인을 하지 않습니다 — 전체 IP 검증과 DNS 리바인딩 방어는 연결 수립 시 다이얼러가 수행합니다(자세한 내용은 [SSRF 방어](../security/ssrf) 참조).

## 도메인 허용 목록

`Security.RedirectWhitelist`는 리다이렉트 대상을 신뢰할 수 있는 도메인으로 제한해 오픈 리다이렉트 공격을 방어합니다:

```go
cfg := httpc.DefaultConfig()
cfg.Security.RedirectWhitelist = []string{
    "api.example.com",
    "*.cdn.example.com", // 와일드카드: 엄격한 서브도메인만 매칭, 네이키드 도메인은 제외
}

client, err := httpc.New(cfg)
```

매칭 규칙 세부 사항:

- **정확한 매칭**: `api.example.com`은 자기 자신만 매칭합니다.
- **와일드카드**: `*.cdn.example.com`은 **엄격한 서브도메인**(예: `img.cdn.example.com`)을 매칭하고, 네이키드 도메인 `cdn.example.com`은 매칭하지 않습니다. 둘 다 허용하려면 함께 나열해야 합니다.
- 비교 대상은 `Location` 대상의 **호스트명**(포트와 프로토콜 제외)이며, 비교 전 정규화를 합니다. 앞뒤 공백 무시, 대소문자 구분 없음.

설정하면 허용 목록 밖 도메인으로의 리다이렉트가 거부되며, 리다이렉트 대상은 SSRF IP 검증도 동시에 거칩니다. 사용자가 제공한 URL을 다룰 때는 `SecureConfig` 또는 허용 목록과 함께 사용하는 것이 좋습니다.

## 수동 리다이렉트 처리

건별 검사, 조건부 따라가기, 커스텀 로깅이 필요하면 자동 따라가기를 끄고 루프로 처리합니다. 두 가지에 주의하세요. `Location`은 **상대 주소**일 수 있어 현재 URL 기준으로 절대 주소로 해석해야 하고, 수동 루프는 허용 목록 검사를 거치지 않지만 매 홉의 연결 수립 시 연결 계층의 SSRF IP 검증은 그대로 효력을 발휘합니다.

```go
package main

import (
    "fmt"
    "log"
    "net/url"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Defaults.FollowRedirects = false

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    currentURL := "https://httpbin.org/redirect/3"
    base, err := url.Parse(currentURL)
    if err != nil {
        log.Fatal(err)
    }

    for i := 0; i < 5; i++ {
        result, err := client.Get(currentURL)
        if err != nil {
            log.Fatal(err)
        }
        if !result.IsRedirect() {
            fmt.Println("최종 주소 도달:", currentURL)
            break
        }

        location := result.Response.Headers.Get("Location")
        if location == "" {
            fmt.Println("리다이렉트 응답에 Location 헤더가 없어 따라가기를 중단")
            break
        }

        // 상대 주소를 현재 URL 기준으로 절대 주소로 해석
        next, err := base.Parse(location)
        if err != nil {
            log.Fatal(err)
        }
        fmt.Printf("%d번째 홉: %s\n", i+1, next.String())

        currentURL = next.String()
        base = next
    }
}
```

:::tip 수동 루프에서의 보안 책임
자동 따라가기 때의 허용 목록과 리다이렉트 대상 사전 검사는 수동 루프에는 적용되지 않습니다. 신뢰할 수 없는 출처의 `Location`을 다룰 때는 루프 안에서 직접 대상 도메인을 검증하세요(또는 허용 목록 로직을 재사용). 연결 계층의 SSRF 검증은 여전히 최후의 방어선이지만, 도메인 수준 제어는 스스로 해야 합니다.
:::

## 자주 묻는 질문

| 증상 | 원인 | 해결 방법 |
|------|------|----------|
| POST가 307/308을 받았는데 따라가지 않음 | 요청 본문을 재전송할 수 없음(`GetBody` 미설정), 사양상 자동으로 따라가지 않음 | 수동 루프로 처리하거나 서버가 302/303을 쓰도록 변경 |
| `WithMaxRedirects(0)`가 따라가기를 끄지 않음 | `0`은 '미설정' 센티널 값, 기본값 10으로 폴백 | `WithFollowRedirects(false)` 사용 |
| `Location`이 있는 300~399 응답이 이동하지 않음 | 엔진은 301/302/303/307/308만 따라감 | `IsRedirect()` + `Location`으로 직접 처리 |
| 이동 후 쿼리 매개변수가 '사라짐' | 대상 쿼리 문자열은 전적으로 `Location`이 결정하며, 클라이언트는 원래 요청 매개변수를 병합하지 않음 | 서버가 필요한 매개변수를 `Location`에 포함 |
| 최종적으로 어느 도메인에 도착했는지 알고 싶음 | `RedirectChain`에는 최종 URL이 없음 | `result.Request.URL` 읽기 |
| 크로스 도메인 이동 후 요청이 401 | `Authorization`/`Cookie`가 크로스 도메인에서 제거됨 (보안 설계) | 새 도메인으로 재인증하거나, 서버가 같은 도메인으로 이동하도록 변경 |

## 다음 단계

- [요청과 응답](./request-response) — 요청 옵션과 응답 처리
- [SSRF 방어](../security/ssrf) — 리다이렉트에서의 SSRF 검증 상세
- [오류 처리](./error-handling) — ErrorType 분류와 오류 매칭
- [설정 API](../api-reference/client-config/config) — RequestDefaults와 보안 필드 참조
