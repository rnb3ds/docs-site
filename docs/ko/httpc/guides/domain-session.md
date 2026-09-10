---
sidebar_label: "도메인 클라이언트와 세션"
title: "도메인 클라이언트와 세션 - CyberGo HTTPC | 세션과 도메인 관리"
description: "HTTPC 도메인 클라이언트와 세션 가이드: NewDomain/NewDomainDefault 생성, URL 조합 규칙과 경로 트래버설 방어, SetHeader 세션 헤더, Cookie 자동 캡처와 옵션 저장, CookieSecurity 검증, 동시성과 REST 클라이언트 래핑 실전."
sidebar_position: 5
---

# 도메인 클라이언트와 세션

도메인 클라이언트(DomainClient)는 같은 도메인을 위한 세션 관리 클라이언트로, Cookie와 요청 헤더를 자동으로 유지합니다.

세 컴포넌트의 역할:

| 컴포넌트 | 역할 | 적합한 시나리오 |
|------|------|----------|
| `Client` | 범용 HTTP 클라이언트: 설정, 연결 풀, 재시도, 미들웨어 | 요청이 여러 도메인에 흩어져 있고 요청 간 상태가 필요 없는 경우 |
| `DomainClient` | 도메인 스코프 클라이언트: URL 자동 조합 + 내장 세션 | 특정 API 도메인으로 고정, 요청에 걸쳐 헤더/Cookie 유지 필요 |
| `SessionManager` | 동시성 안전한 세션 상태 저장소(헤더 + Cookie), 단독 사용 가능 | 세션 상태를 직접 관리, 임의의 Client와 조합 |

## 도메인 클라이언트 생성

```go
dc, err := httpc.NewDomainDefault("https://api.example.com")
if err != nil {
    log.Fatal(err)
}
defer dc.Close()

// Cookie 자동 활성화
dc.SetHeader("Authorization", "Bearer "+token)

// 상대 경로로 요청 전송
result, err := dc.Get("/users")
```

:::tip
`NewDomain`은 Cookie 관리를 자동으로 활성화합니다(`EnableCookies = true`). 수동 설정이 필요 없습니다.
:::

생성 시 세 가지가 자동으로 일어납니다:

1. **baseURL 검증**: scheme과 host를 반드시 포함해야 합니다(예: `https://api.example.com`). 아니면 오류를 반환합니다
2. **Cookie 강제 활성화**: 전달된 설정의 `Connection.EnableCookies`는 무시되며, 도메인 클라이언트는 항상 Cookie 관리를 갖습니다
3. **세션 생성**: 내부에 `SessionManager`를 만들며(기본 `DefaultSessionConfig`), 헤더와 Cookie는 모두 여기에 저장됩니다

`NewDomain`은 커스텀 타임아웃, 재시도 등을 위해 완전한 Config도 받습니다(이때 `dc.Get` 등의 메서드는 일반 클라이언트와 동일하게 동작):

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Timeouts.Request = 15 * time.Second
    cfg.Retry.MaxRetries = 2
    cfg.Defaults.UserAgent = "my-app/1.0"

    dc, err := httpc.NewDomain("https://api.github.com", cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer dc.Close()

    if err := dc.SetHeader("Accept", "application/vnd.github+json"); err != nil {
        log.Fatal(err)
    }

    result, err := dc.Get("/repos/golang/go")
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(result.StatusCode()) // 200
}
```

## URL 조합 규칙

`Get`/`Post` 등 메서드의 첫 번째 매개변수는 base URL 기준 상대 경로이며, 조합 규칙은 다음과 같습니다:

| 전달한 path | 결과 | 규칙 |
|-----------|------|------|
| `/users` | `{base}/users` | 상대 경로를 base 경로에 조합 |
| `/users/` | `{base}/users/` | 끝 슬래시 유지 |
| `https://other.com/data` | 그대로 사용 | `http://`/`https://`로 시작하는 완전한 URL은 조합을 건너뜀 |
| `/users?page=2` | `{base}/users?page=2` | 쿼리 문자열 유지; base에 쿼리 매개변수가 있으면 병합 |
| `""` | `{base}` | 빈 경로는 base 자체를 반환 |

:::warning 경로 트래버설 방어
base URL에 경로 접두사가 있으면(예: `https://example.com/api/v1`) 조합 결과는 반드시 그 접두사 안에 있어야 합니다. `..` 등으로 벗어나려는 경로는 `path escapes base URL scope` 오류를 반환하며 요청을 보내지 않습니다.
:::

## 세션 헤더 관리

```go
// 세션 헤더 설정 (이후 모든 요청에 자동 포함)
dc.SetHeader("Authorization", "Bearer "+token)
dc.SetHeader("Accept", "application/json")

// 일괄 설정
dc.SetHeaders(map[string]string{
    "Authorization": "Bearer " + token,
    "Accept":        "application/json",
    "X-Version":     "2.0",
})

// 삭제와 초기화
dc.DeleteHeader("X-Version")
dc.ClearHeaders()

// 조회
headers := dc.GetHeaders()
```

모든 키와 값은 `WithHeader`와 동일한 CRLF 인젝션 검증을 거치며, 잘못된 키/값은 오류를 반환합니다. `GetHeaders()`는 **사본**을 반환하므로 이를 수정해도 세션에 영향을 주지 않습니다.

단일 요청은 옵션으로 세션 헤더를 덮어쓸 수 있습니다(옵션은 세션 헤더 이후에 적용):

```go
dc.SetHeader("X-API-Version", "v1")

// 이번 요청은 v2를 전송
result, _ := dc.Get("/data", httpc.WithHeader("X-API-Version", "v2"))
```

주의: 다음 절에서 설명하듯 `v2`는 세션에 다시 기록되어 이후 요청에도 `v2`가 전송됩니다.

## Cookie 관리

```go
// Cookie 설정
dc.SetCookie(&http.Cookie{Name: "session", Value: "abc123"})

// 일괄 설정
dc.SetCookies([]*http.Cookie{
    {Name: "session", Value: "abc123"},
    {Name: "lang", Value: "zh"},
})

// 응답 Cookie 자동 캡처
result, _ := dc.Get("/login")
// 서버가 반환한 Set-Cookie가 세션에 자동 저장됨

// 조회
cookie := dc.GetCookie("session")
cookies := dc.GetCookies()

// 삭제와 초기화
dc.DeleteCookie("session")
dc.ClearCookies()
```

:::tip
매 요청 후 서버가 반환한 Cookie가 세션에 자동으로 갱신되므로 수동 처리가 필요 없습니다.
:::

Cookie의 자동 유지는 세 가지 경로를 커버합니다:

- **응답 반영**: 매 요청이 끝나면 응답의 `Set-Cookie`가 세션에 자동 기록됩니다(다운로드용 `Download` 메서드도 응답 Cookie를 캡처)
- **검증**: 기록 전 `WithCookie`와 동일한 유효성 검증을 하며, Cookie 보안 정책(아래 'Cookie 보안 검증' 참조)을 구성했다면 규칙에 맞지 않는 Cookie는 **자동으로 건너뛰고** 나머지 Cookie에는 영향을 주지 않습니다
- **사본 의미**: `GetCookie`/`GetCookies`는 Cookie의 사본을 반환하므로 반환값을 수정해도 세션 내부 상태를 오염시키지 않습니다

### 요청 옵션 자동 저장

**요청 옵션**으로 전달된 Cookie와 요청 헤더도 세션에 캡처되어 이후 요청에 계속 적용됩니다:

```go
// 첫 번째 요청: 옵션으로 전달한 Cookie와 요청 헤더는...
_, err := dc.Get("/login",
    httpc.WithCookie(http.Cookie{Name: "session", Value: "abc"}),
    httpc.WithHeader("X-Client", "mobile"),
)
if err != nil {
    log.Fatal(err)
}

// ...세션에 이미 기록됨:
fmt.Println(dc.GetCookie("session").Value) // 출력: abc
fmt.Println(dc.GetHeaders()["X-Client"])   // 출력: mobile

// 이후 요청은 옵션 없이도 자동으로 포함. 옵션으로 같은 이름을 다시 전달하면 세션 값을 덮어씀
_, err = dc.Get("/profile")
```

:::warning 임시 헤더는 옵션으로 전달하지 말 것
옵션의 헤더/Cookie는 세션에 저장되어 **이후 모든 요청**에 적용됩니다. 매번 값이 달라지는 일회성 헤더(증가하는 trace ID, 무작위 nonce 등)는 다 쓴 뒤 `DeleteHeader`/`DeleteCookie`로 제거하거나, 해당 요청은 내부 `Client`로 보내세요.
:::

## 요청 방식

```go
// 상대 경로
result, _ := dc.Get("/users")
result, _ := dc.Post("/users", httpc.WithJSON(data))
result, _ := dc.Put("/users/1", httpc.WithJSON(data))
result, _ := dc.Patch("/users/1", httpc.WithJSON(data))
result, _ := dc.Delete("/users/1")
result, _ := dc.Head("/users/1")
result, _ := dc.Options("/users")

// 컨텍스트 포함
result, _ := dc.Request(ctx, "GET", "/users")

// 절대 URL (base URL 조합 건너뜀)
result, _ := dc.Get("https://other-api.com/data")
```

:::warning 요청 옵션이 두 번 적용됨
도메인 클라이언트는 내부적으로 요청 옵션을 **두 번 적용**합니다(한 번은 세션 상태 캡처, 한 번은 실제 요청). 부작용이 있는 옵션(카운터, nonce 생성 등)은 피하세요. 이런 옵션이 필요하면 내부 `Client`를 사용하세요.
:::

`Download` 메서드는 `Client.Download`와 시그니처가 같고 경로도 base URL 기준으로 해석되며, 완료 후 응답 Cookie를 세션에 캡처합니다:

```go
dlCfg := httpc.DefaultDownloadConfig()
dlCfg.FilePath = "data.json"
dlCfg.Overwrite = true

result, err := dc.Download(ctx, "/export/data", dlCfg)
if err != nil {
    log.Fatal(err)
}
fmt.Println(result.FilePath, result.BytesWritten)
```

## 세션 접근

```go
// 기본 정보 가져오기
dc.URL()     // "https://api.example.com"
dc.Domain()  // "api.example.com" (host에서 포트 제거)

// 내부 SessionManager 접근
session := dc.Session()
if err := session.SetHeader("X-Trace-ID", traceID); err != nil {
    log.Fatal(err)
}
```

`DomainClient`는 `SessionManager`를 내장해 전체 세션 메서드를 노출하므로, `dc.SetHeader(...)`와 `dc.Session().SetHeader(...)`는 완전히 동등합니다.

### SessionManager 단독 사용

`SessionManager`는 `DomainClient`와 분리해 단독으로 생성할 수 있으며, 동시성 안전한 헤더/Cookie 저장소로 쓸 수 있습니다:

```go
session, err := httpc.NewSessionManagerDefault()
if err != nil {
    log.Fatal(err)
}

// 상태 기록
if err := session.SetHeader("Authorization", "Bearer my-token"); err != nil {
    log.Fatal(err)
}
if err := session.SetCookies([]*http.Cookie{{Name: "session_id", Value: "abc123"}}); err != nil {
    log.Fatal(err)
}

// 응답에서 Cookie 반영
result, err := client.Get("https://api.example.com/data")
if err != nil {
    log.Fatal(err)
}
session.UpdateFromResult(result)     // Result에서 응답 Cookie 캡처
session.UpdateFromCookies(cookies)   // []*http.Cookie로 일괄 갱신
```

일반 `Client`와 함께 쓸 때는 `GetHeaders()`/`GetCookies()`를 직접 읽어 `WithHeaderMap`/`WithCookie` 옵션으로 변환해 요청에 붙여야 합니다(`DomainClient` 내부에서도 정확히 이렇게 세션 상태를 각 요청에 주입합니다).

## 동시성 의미

- **SessionManager는 동시성 안전**: 모든 읽기/쓰기 메서드는 `sync.RWMutex`로 보호되므로, 여러 goroutine이 동시에 `SetHeader`/`GetCookies`를 호출해도 추가 락이 필요 없습니다
- **세션 스냅샷의 최종 일관성**: 각 요청의 '세션 스냅샷 읽기 → 요청 전송 → 응답 Cookie 반영' 순서는 원자적이지 않습니다 — 동시 요청이 살짝 오래된 스냅샷을 읽을 수 있습니다(예: 다른 요청이 방금 받은 로그인 Cookie가 아직 보이지 않는 경우). 이는 설계상의 트레이드오프이며, 단일 요청이 얻는 스냅샷은 항상 일관됩니다
- **DomainClient는 동시 사용 가능**: 메서드 자체에 추가 락이 없어 여러 goroutine이 공유할 수 있습니다

:::tip
로그인, Token 갱신 등 세션 상태를 크게 바꾸는 작업은 비즈니스 요청과 동시에 실행하지 않거나, 완료된 뒤 새 상태에 의존하는 요청을 보내는 것이 좋습니다.
:::

## Cookie 보안 검증

Cookie 보안 정책을 구성하여 보안 기준을 충족하는 Cookie만 받아들일 수 있습니다:

```go
dc, _ := httpc.NewDomainDefault("https://api.example.com")

// 엄격한 Cookie 보안 설정
session := dc.Session()
session.SetCookieSecurity(httpc.StrictCookieSecurityConfig())
// 요구 사항: Secure=true, HttpOnly=true, SameSite=Strict

// 보안 요구 사항을 충족하지 않는 Cookie는 SetCookie에서 오류 반환
if err := dc.SetCookie(&http.Cookie{
    Name:  "insecure",
    Value: "test",
    // Secure, HttpOnly 누락 → 거부됨
}); err != nil {
    log.Println("Cookie가 거부됨:", err)
}
```

두 가지 검증 진입점의 동작 차이:

| 진입점 | 규칙에 맞지 않을 때의 동작 |
|------|----------------|
| `SetCookie` / `SetCookies` (명시적 기록) | 오류 반환, Cookie는 세션에 들어가지 않음 |
| 응답 반영 / 옵션 캡처 (자동 기록) | 해당 Cookie를 **자동으로 건너뛰고** 나머지는 정상 처리 |

정책은 `SetCookieSecurity` 이후의 모든 후속 기록에 적용됩니다. `SessionManager`를 단독 생성할 때는 `SessionConfig.CookieSecurity`로 미리 구성할 수 있습니다(`NewDomain` 내부는 기본 세션 설정을 사용하므로 생성 후 `SetCookieSecurity`를 호출해야 합니다). 느슨한 시작점은 `DefaultCookieSecurityConfig()`(기본적으로 어떤 속성도 강제하지 않음)를 쓰고 필요에 따라 필드를 조이세요.

## 수명 주기와 재사용

```go
// 권장: 프로세스 내내 하나의 DomainClient를 유지하며 요청에 걸쳐 연결 풀과 세션 재사용
dc, err := httpc.NewDomainDefault("https://api.example.com")
if err != nil {
    log.Fatal(err)
}
defer dc.Close()

// 세션 무효화(Token 만료 등) 시 세션 초기화 후 재로그인
dc.ClearCookies()
dc.DeleteHeader("Authorization")
// ...로그인 절차를 다시 실행해 SetCookie/SetHeader로 상태 복구...
```

- `Close()`는 내부 Client(연결 풀, 전송 계층)를 닫지만 세션 헤더/Cookie는 **지우지 않습니다**(둘은 SessionManager에 저장됨). 닫은 뒤 다시 요청하면 `ErrClientClosed`가 반환됩니다
- 요청마다 `DomainClient`를 새로 만들지 마세요 — 연결 재사용과 세션 누적을 잃고 연결이 고갈될 수도 있습니다
- 클라이언트 전체의 보안 정책 교체 등이 필요하면 그냥 새 인스턴스를 만들고, 기존 인스턴스는 `Close` 후 버리세요

## 완전한 예제: REST API 클라이언트

```go
package main

import (
    "context"
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    // 도메인 클라이언트 생성
    dc, err := httpc.NewDomainDefault("https://api.example.com")
    if err != nil {
        log.Fatal(err)
    }
    defer dc.Close()

    // 로그인해 Token 획득
    loginResult, err := dc.Post("/auth/login", httpc.WithJSON(map[string]string{
        "username": "admin",
        "password": "secret",
    }))
    if err != nil {
        log.Fatal(err)
    }

    // 응답에서 Token 파싱
    var loginResp struct {
        Token string `json:"token"`
    }
    if err := loginResult.Unmarshal(&loginResp); err != nil {
        log.Fatal(err)
    }

    // 세션 헤더 설정
    if err := dc.SetHeader("Authorization", "Bearer "+loginResp.Token); err != nil {
        log.Fatal(err)
    }

    // 이후 요청은 Token과 Cookie 자동 포함
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    users, err := dc.Request(ctx, "GET", "/users")
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println(users.StatusCode()) // 200
}
```

## 다음 단계

- [도메인 클라이언트 API](../api-reference/client-config/domain-client) — 전체 API 참조
- [세션 관리 API](../api-reference/client-config/session) — SessionManager 참조
- [요청과 응답](./request-response) — 기본 요청 가이드
