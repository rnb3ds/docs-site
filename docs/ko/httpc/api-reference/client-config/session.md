---
sidebar_label: "세션 관리"
title: "세션 관리 - CyberGo HTTPC | SessionManager"
description: "HTTPC SessionManager API 레퍼런스: NewSessionManager 생성, SessionConfig 구성, SetHeader 헤더 관리, SetCookie 메서드와 SetCookieSecurity 검증의 완전한 사용법."
sidebar_position: 3
---

# 세션 관리

SessionManager는 스레드 안전한 Cookie와 요청 헤더 저장소를 제공하며, DomainClient가 내부적으로 내장하여 사용합니다. `sync.RWMutex` 기반의 동시 안전 저장소를 캡슐화했으며, 모든 읽기 작업은 읽기 잠금을, 쓰기 작업은 쓰기 잠금을 사용하여 고동시성 시나리오에서 요청 간 세션 상태 공유에 적합합니다.

:::tip SessionManager를 직접 사용해야 할 때
보통 SessionManager를 수동으로 생성할 필요가 없습니다 — `NewDomain`이 생성한 DomainClient가 자동으로 하나를 내장합니다. SessionManager를 직접 사용하는 시나리오는 다음과 같습니다: 여러 DomainClient 간에 세션 공유 필요, 런타임에 Cookie 보안 정책 전환 필요, 또는 응답에서 Cookie를 일괄 추출 필요.
:::

## SessionConfig

```go
type SessionConfig struct {
    // CookieSecurity는 Cookie 보안 검증을 구성합니다.
    // nil은 Cookie 보안 검증을 수행하지 않음을 의미합니다.
    CookieSecurity *CookieSecurityConfig
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `CookieSecurity` | `*CookieSecurityConfig` | Cookie 보안 검증 구성, nil은 검증하지 않음 |

```go
func DefaultSessionConfig() SessionConfig
```

기본 구성을 반환합니다(Cookie 보안 검증 수행하지 않음). 사용 방법은 아래 [NewSessionManager](#newsessionmanager)를 참조하세요.

## NewSessionManager

```go
func NewSessionManager(cfg SessionConfig) (*SessionManager, error)
```

세션 관리자를 생성합니다. `SessionConfig` 값을 전달하거나, `NewSessionManagerDefault()`를 제로 인수 단축으로 사용하세요. 현재 구현은 항상 nil error를 반환하며, error 반환값은 향후 확장을 위한 구성 검증용으로 보존됩니다.

```go
// 기본 구성 사용
sm, err := httpc.NewSessionManagerDefault()

// 구성 포함(엄격한 Cookie 보안 검증 활성화)
cfg := httpc.DefaultSessionConfig()
cfg.CookieSecurity = httpc.StrictCookieSecurityConfig()
sm, err := httpc.NewSessionManager(cfg)
```

### NewSessionManager vs NewSessionManagerDefault

| 생성자 | 매개변수 | 적용 시나리오 |
|--------|----------|---------------|
| `NewSessionManager(cfg)` | 명시적 SessionConfig | 커스텀 CookieSecurity 정책 필요 |
| `NewSessionManagerDefault()` | 없음 | 기본 구성(Cookie 보안 검증 없음) |

`NewSessionManagerDefault()`는 `NewSessionManager(DefaultSessionConfig())`와 동등하며, 주 클라이언트의 `NewDefault()` 설계와 대칭입니다.

## NewSessionManagerDefault

```go
func NewSessionManagerDefault() (*SessionManager, error)
```

편의 생성자로, `NewSessionManager(DefaultSessionConfig())`와 동등합니다.

```go
sm, err := httpc.NewSessionManagerDefault()
```

## 헤더 관리

SessionManager는 다음 메서드로 요청 간 요청 헤더를 유지합니다. 모든 메서드는 스레드 안전하며, 쓰기 작업(SetHeader/SetHeaders/DeleteHeader/ClearHeaders)은 쓰기 잠금을 획득하고, 읽기 작업(GetHeaders)은 읽기 잠금을 획득합니다.

### SetHeader

```go
func (s *SessionManager) SetHeader(key, value string) error
```

단일 세션 헤더를 추가하거나 업데이트합니다. 이후의 모든 요청에 자동으로 포함됩니다. 호출 전 `validation.ValidateHeaderKeyValue`로 키/값의 합법성을 검증하여(제어 문자, CRLF 주입 등 차단), 무효한 경우 래핑된 오류를 반환합니다. nil 수신자는 `"session manager is nil"`을 반환합니다.

```go
err := sm.SetHeader("Authorization", "Bearer "+token)
if err != nil {
    log.Fatalf("요청 헤더 설정 실패: %v", err)
}
```

### SetHeaders

```go
func (s *SessionManager) SetHeaders(headers map[string]string) error
```

세션 헤더를 일괄 추가하거나 업데이트합니다. 잠금 외부에서 항목별로 검증한 후(하나라도 무효하면 전체 거부), 잠금 내부에서 `maps.Copy`로 병합합니다. 원자적 의미: 모두 성공하거나 모두 변경되지 않습니다.

```go
err := sm.SetHeaders(map[string]string{
    "Authorization": "Bearer " + token,
    "Accept":        "application/json",
    "X-Custom":      "value",
})
```

### DeleteHeader

```go
func (s *SessionManager) DeleteHeader(key string)
```

key로 지정된 세션 헤더를 삭제합니다. key가 존재하지 않으면 조용히 무작업입니다. nil 수신자는 안전합니다(직접 반환).

### ClearHeaders

```go
func (s *SessionManager) ClearHeaders()
```

모든 세션 헤더를 비우고 빈 map으로 재초기화합니다.

### GetHeaders

```go
func (s *SessionManager) GetHeaders() map[string]string
```

모든 세션 헤더의 **깊은 복사** 사본을 반환합니다(새로 할당된 map + 값 복사). 호출자가 사본을 수정해도 내부 상태에 영향을 주지 않습니다. 빈 세션은 빈 map(nil이 아님)을 반환합니다.

### 헤더 관리 메서드 총람

| 메서드 | 시그니처 | 잠금 | 설명 |
|--------|---------|------|------|
| SetHeader | `(key, value string) error` | 쓰기 잠금 | 단일 설정, 검증 포함 |
| SetHeaders | `(headers map[string]string) error` | 쓰기 잠금 | 일괄 설정, 원자적 검증 |
| DeleteHeader | `(key string)` | 쓰기 잠금 | key로 삭제 |
| ClearHeaders | `()` | 쓰기 잠금 | 전체 비우기 |
| GetHeaders | `() map[string]string` | 읽기 잠금 | 깊은 복사 사본 반환 |

## Cookie 관리

SessionManager는 다음 메서드로 요청 간 Cookie를 유지합니다. 모든 쓰기 작업은 `validation.ValidateCookie`로 합법성을 검증하며, `CookieSecurity`가 구성된 경우 추가로 보안 속성(Secure/HttpOnly/SameSite)을 검증합니다.

### SetCookie

```go
func (s *SessionManager) SetCookie(cookie *http.Cookie) error
```

단일 세션 Cookie를 추가하거나 업데이트합니다. 검증 흐름: ① nil cookie 검사; ② `ValidateCookie` 기본 검증; ③ CookieSecurity가 구성된 경우 `validateCookieSecurity` 실행(스레드 안전을 위해 쓰기 잠금 내에서 실행). 어느 검증이 실패해도 래핑된 오류를 반환하며 저장소를 수정하지 않습니다.

```go
err := sm.SetCookie(&http.Cookie{
    Name:     "session",
    Value:    "abc123",
    Secure:   true,
    HttpOnly: true,
    SameSite: http.SameSiteStrictMode,
})
if err != nil {
    log.Fatalf("Cookie 설정 실패: %v", err)
}
```

### SetCookies

```go
func (s *SessionManager) SetCookies(cookies []*http.Cookie) error
```

Cookie를 일괄 설정합니다. **2단계 원자적 기록**을 채택합니다: ① 잠금 외부에서 모든 cookie의 기본 합법성을 사전 검증(nil 검사 + ValidateCookie); ② 잠금 내부에서 항목별로 보안 검증을 실행, 하나라도 실패하면 즉시 오류 반환(이미 검증된 것도 기록되지 않음); ③ 모두 통과한 후에야 통일적으로 저장합니다. 이는 일괄 작업의 원자성을 보장합니다 — "부분 기록" 중간 상태가 발생하지 않습니다.

### DeleteCookie

```go
func (s *SessionManager) DeleteCookie(name string)
```

이름으로 Cookie를 삭제합니다. name이 존재하지 않으면 조용히 무작업입니다.

### ClearCookies

```go
func (s *SessionManager) ClearCookies()
```

모든 Cookie를 비우고 빈 map으로 재초기화합니다.

### GetCookies

```go
func (s *SessionManager) GetCookies() []*http.Cookie
```

모든 Cookie의 **깊은 복사** 사본을 반환합니다. 연속 backing array 최적화를 채택합니다: 길이 N의 `[]http.Cookie` 연속 배열을 사전 할당하고, 모든 Cookie 구조체가 그 안에 연속적으로 배치되며, 반환되는 `[]*http.Cookie`가 해당 배열을 가리킵니다. 이는 N번의 독립 힙 할당을 2회(backing array + 포인터 슬라이스)로 줄여 GC 부하를 크게 낮춥니다. 빈 세션은 nil을 반환합니다.

### GetCookie

```go
func (s *SessionManager) GetCookie(name string) *http.Cookie
```

이름으로 Cookie의 **깊은 복사** 사본을 가져오며, 존재하지 않으면 nil을 반환합니다.

### Cookie 관리 메서드 총람

| 메서드 | 시그니처 | 잠금 | 검증 |
|--------|---------|------|------|
| SetCookie | `(cookie *http.Cookie) error` | 쓰기 잠금 | ValidateCookie + 선택적 CookieSecurity |
| SetCookies | `(cookies []*http.Cookie) error` | 쓰기 잠금 | 2단계 원자적 검증 |
| DeleteCookie | `(name string)` | 쓰기 잠금 | 없음 |
| ClearCookies | `()` | 쓰기 잠금 | 없음 |
| GetCookies | `() []*http.Cookie` | 읽기 잠금 | 없음(깊은 복사 반환) |
| GetCookie | `(name string) *http.Cookie` | 읽기 잠금 | 없음(깊은 복사 반환) |

## Cookie 보안

### SetCookieSecurity

```go
func (s *SessionManager) SetCookieSecurity(config *CookieSecurityConfig)
```

런타임에 Cookie 보안 검증 구성을 업데이트하며, **이후의 모든** SetCookie/SetCookies/UpdateFromResult/UpdateFromCookies 호출에 영향을 미칩니다. nil 전달로 보안 검증을 비활성화할 수 있습니다. nil 수신자는 안전합니다. 이것이 보안 정책을 전환하는 유일한 진입점입니다 — SessionManager를 재구축할 필요 없이 런타임에 느슨한 정책에서 엄격한 정책으로, 또는 그 반대로 전환할 수 있습니다.

```go
// 런타임에 느슨함에서 엄격함으로 전환
sm.SetCookieSecurity(httpc.StrictCookieSecurityConfig())

// 보안 검증 비활성화
sm.SetCookieSecurity(nil)
```

### CookieSecurityConfig 필드

```go
type CookieSecurityConfig struct {
    RequireSecure                bool    // Secure 속성 요구(HTTPS 전송만)
    RequireHttpOnly              bool    // HttpOnly 속성 요구(XSS 방지)
    RequireSameSite              string  // SameSite 값 요구: "Strict"/"Lax"/"None"/""
    AllowSameSiteNone            bool    // SameSite=None 허용 여부
    RequireSecureForSameSiteNone bool    // SameSite=None일 때 Secure 강제 요구
}
```

사용 가능한 팩토리 함수:

| 팩토리 함수 | 설명 |
|-------------|------|
| `DefaultCookieSecurityConfig()` | 느슨한 기본값(비 HTTPS 허용, JS 접근 허용, SameSite=None 허용) |
| `StrictCookieSecurityConfig()` | 엄격한 정책(Secure + HttpOnly + SameSite=Strict 요구) |

### UpdateFromResult

```go
func (s *SessionManager) UpdateFromResult(result *Result)
```

요청 결과(`*Result`)의 `Response.Cookies`에서 Cookie를 추출하여 세션에 저장합니다. CookieSecurity가 구성된 경우, 안전하지 않은 Cookie는 **조용히 건너뛰며**(오류를 반환하지 않고 직접 무시), 검증을 통과한 Cookie만 저장합니다. result가 nil, Response가 nil, 또는 Cookies가 비어 있으면 직접 반환합니다. DomainClient의 `Request` 메서드가 매 요청 후 이 메서드를 자동으로 호출합니다.

### UpdateFromCookies

```go
func (s *SessionManager) UpdateFromCookies(cookies []*http.Cookie)
```

Cookie 슬라이스에서 세션 Cookie를 업데이트합니다. 의미는 UpdateFromResult와 동일합니다 — 안전하지 않은 Cookie는 조용히 건너뜁니다. DomainClient의 Download 메서드가 이 메서드를 통해 다운로드 응답의 Cookie를 캡처합니다.

## 내부 메커니즘

### captureFromOptions

```go
func (s *SessionManager) captureFromOptions(options []RequestOption)
```

DomainClient의 `prepareSessionOptions`가 내부적으로 이 메서드를 호출하여, 사용자가 제공한 RequestOptions에서 Cookie와 Header를 추출해 세션에 저장합니다. 구현 세부 사항:

1. 객체 풀의 임시 `engine.Request`를 사용하여(`acquireMiddlewareRequest`/`releaseMiddlewareRequest`) 핫 경로 할당 감소
2. 임시 요청에 option을 하나씩 적용 — **보안 조치**: 각 option 적용 전후에 `OnRequest`/`OnResponse` 콜백을 지워, `WithOnRequest`/`WithOnResponse`의 클로저가 캡처 과정에서 누적 부작용을 트리거하는 것을 방지
3. 임시 요청의 Cookie와 Header를 추출하여 검증 후 세션에 저장
4. Cookie와 Header만 추출하며, 기타 데이터(query params, body, callbacks)는 폐기

:::warning RequestOptions 두 번 실행
DomainClient의 Request/Download는 RequestOptions를 **두 번 실행**합니다 — 한 번은 세션 캡처용(captureFromOptions), 한 번은 실제 요청용. 따라서 **부작용이 있는 option 사용을 피하세요**(카운터, nonce 생성, 무작위 수 등). 부작용이 필요하면 하위 Client를 직접 사용하세요.
:::

### prepareOptions

```go
func (s *SessionManager) prepareOptions() []RequestOption
```

DomainClient가 매 요청 전 이 메서드를 호출하여, 현재 세션 상태를 RequestOptions로 주입합니다:

- **Cookie 일괄 주입**: 모든 세션 Cookie를 하나의 클로저 option으로 패키징(`r.SetCookies(append(existing, cookies...))`), N번의 클로저 할당 회피
- **Header map 주입**: `WithHeaderMap`로 깊은 복사된 header map을 한 번에 주입

세션이 비어 있을 때(Cookie와 Header 모두 없음) nil을 반환하여 제로 오버헤드를 실현합니다.

### 스레드 안전 모델

SessionManager는 단일 `sync.RWMutex`로 모든 상태를 보호합니다:

| 작업 유형 | 잠금 수준 | 메서드 |
|-----------|-----------|--------|
| 읽기(GetHeaders/GetCookies/GetCookie/prepareOptions) | RLock | 동시 가능 |
| 쓰기(Set*/Delete*/Clear*/UpdateFrom*/captureFromOptions/SetCookieSecurity) | Lock | 상호 배제 |

DomainClient의 `prepareSessionOptions`는 "읽기 후 쓰기"의 비원자적 시퀀스를 채택합니다: 먼저 스냅샷을 읽고(prepareOptions) 그 다음 캡처를 기록(captureFromOptions)하며, 두 단계 사이에 동시 요청이 교차할 수 있습니다. 이는 **최종 일관성** 설계입니다 — 각 요청은 `prepareOptions()` 시점에 일관된 스냅샷을 캡처하며, 요청 간의 순간적 경쟁은 단일 요청의 정확성에 영향을 주지 않습니다.

## 완전한 예제: 로그인 세션 유지

다음 예제는 DomainClient가 로그인 세션을 자동으로 관리하는 방법을 보여줍니다: 로그인 후 Cookie가 자동으로 유지되며, 로그아웃까지 지속됩니다.

```go
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/cybergodev/httpc"
)

func main() {
	ctx := context.Background()

	// DomainClient 생성, 자동으로 Cookie 활성화 및 SessionManager 내장
	dc, err := httpc.NewDomain("https://httpbin.org", httpc.DefaultConfig())
	if err != nil {
		log.Fatalf("클라이언트 생성 실패: %v", err)
	}
	defer func() { _ = dc.Close() }()

	// 수동으로 세션 헤더 설정(이후 모든 요청에 자동 포함)
	sm := dc.Session()
	if err := sm.SetHeader("Accept", "application/json"); err != nil {
		log.Fatalf("요청 헤더 설정 실패: %v", err)
	}
	if err := sm.SetCookie(&http.Cookie{
		Name:  "session",
		Value: "initial",
	}); err != nil {
		log.Fatalf("Cookie 설정 실패: %v", err)
	}

	// 로그인: 응답의 Set-Cookie가 UpdateFromResult에 의해 자동으로 세션에 캡처
	loginCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	_, err = dc.Request(loginCtx, "POST", "/cookies/set?token=abc123")
	cancel()
	if err != nil {
		log.Fatalf("로그인 실패: %v", err)
	}

	// 이후 요청은 세션의 Cookie를 자동으로 휴대
	verifyCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	result, err := dc.Request(verifyCtx, "GET", "/cookies")
	cancel()
	if err != nil {
		log.Fatalf("검증 실패: %v", err)
	}

	fmt.Println("세션 Cookie 유지 성공, 응답:")
	fmt.Println(result.String())

	// 로그아웃: 세션 비우기
	sm.ClearCookies()
	sm.ClearHeaders()

	fmt.Println("로그아웃 완료, 세션이 비워짐")
}
```

:::tip 수동 SessionManager 관리
독립적으로 SessionManager를 생성하고 여러 DomainClient 간에 공유할 수도 있습니다. 하지만 보통 DomainClient의 자동 관리로 충분합니다 — 매 요청 후 응답 Cookie를 자동으로 캡처하고, 요청 전 세션 상태를 자동으로 주입합니다.
:::

## 참고

- [도메인 클라이언트](./domain-client) - DomainClient 레퍼런스
- [도메인 클라이언트와 세션](../../guides/domain-session) - 사용 가이드
- [인터페이스 정의](../types/interfaces) - DomainClienter 인터페이스 레퍼런스
- [상수와 타입](../types/constants) - CookieSecurityConfig 필드 레퍼런스
