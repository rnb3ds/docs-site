---
title: "핵심 개념 - CyberGo HTTPC | 2계층 아키텍처와 설정 체계"
description: "HTTPC 핵심 개념 해설: 2계층 API 아키텍처와 핵심 구성 요소 역할표(Client, Result, 세션, 미들웨어, Mutator), Config 설정과 With* 요청 옵션 계층, 요청 수명주기, 도메인 클라이언트와 ClientError 오류 모델을 다룹니다."
sidebar_label: "핵심 개념"
sidebar_position: 2
---

# 핵심 개념

아래 개념을 이해하면 HTTPC 전체를 빠르게 파악할 수 있습니다.

## 핵심 구성 요소 한눈 보기

| 구성 요소 | 역할 | 핵심 포인트 |
|------|------|--------|
| `Client`(인터페이스) | 요청 실행, 연결 풀과 수명주기 관리 | `New(cfg)` / `NewDefault()`로 생성; 7개 동사 메서드 + `Request` + `Download` + `Close` |
| `Doer`(인터페이스) | 최소 요청 인터페이스 | `Request(ctx, method, url, opts...)` 메서드 하나뿐; mock과 커스텀 구현에 사용 |
| `RequestOption`(`With*` 함수) | 단일 요청 구성 | 함수형 옵션; 전달한 순서대로 적용, 하나라도 실패하면 요청 즉시 중단 |
| `MiddlewareFunc` / `Handler` | 미들웨어와 종점 처리 | 양파 모델; `Chain(mw...)`으로 조합 |
| `RequestMutator` / `ResponseMutator` | 미들웨어 내부의 요청/응답 읽기·쓰기 뷰 | 요청 단계에서 요청을, 응답 단계에서 응답을 읽고 씀 |
| `SessionManager` | 세션 상태 저장 | 스레드 안전; Cookie와 공통 요청 헤더를 통일 관리 |
| `DomainClienter`(인터페이스) | 도메인 클라이언트 | base URL 바인딩 + 세션 내장; 상대 경로 자동 조합 |
| `Result` | 응답 래퍼 | 요청/응답/메타 정보 3단 구조; nil 안전 접근자; GC 자동 회수 |
| `ClientError` | 네트워크 계층 오류 분류 | `errors.As`로 추출; `Code()` / `IsRetryable()` / `Attempts` |

구성 요소 간 관계:

```text
패키지 함수 ──공유──▶ 기본 Client ◀──생성── New(cfg)
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   미들웨어 체인(선택)   엔진 실행        Download
   Chain(mw...)     보안 검증/재시도    파일 스트리밍 다운로드
        │              │
        ▼              ▼
  RequestMutator     Result(Request / Response / Meta)

DomainClienter = Client + base URL + SessionManager
(요청 전 세션 헤더/Cookie 주입, 응답 후 Set-Cookie 기록)
```

## 2계층 API 아키텍처

HTTPC는 두 가지 동등한 요청 방식을 제공하며, 표준 라이브러리 `net/http`에서 `http.Get`와 `http.Client`의 관계에 대응합니다:

**패키지 함수** - 설정이 필요 없고, 내부에서 지연 초기화된 기본 클라이언트 하나를 공유합니다. 스크립트와 일회성 요청에 적합합니다:

```go
result, err := httpc.Get("https://api.example.com/data")
```

**Client 인스턴스** - 설정, 연결 풀, 수명주기를 완전히 제어합니다. 장기 실행 서비스에 적합합니다:

```go
client, err := httpc.NewDefault()
defer func() { _ = client.Close() }()
result, err := client.Get("https://api.example.com/data")
```

두 방식 모두 동일한 요청 옵션(`WithHeader`, `WithJSON`…)을 받고 동일한 `*Result` 타입을 반환합니다. 패키지 함수는 Client 인스턴스의 얇은 래퍼입니다. 기본 클라이언트는 교체할 수 있습니다: `SetDefaultClient(client)`로 커스텀 인스턴스를 기본으로 지정하고(이전 인스턴스는 자동 종료), `CloseDefaultClient()`로 닫고 초기화합니다 — 닫힌 뒤 다음 패키지 함수 호출 때 자동 재생성됩니다.

:::tip 어느 쪽을 쓸까요?
일회성 요청이나 빠른 프로토타입은 패키지 함수로. 프로덕션 서비스, 커스텀 설정이나 연결 풀 관리가 필요하면 Client 인스턴스로.
:::

## 설정 체계: Config와 With\* 옵션

HTTPC는 설정을 두 개의 독립 계층으로 나눠 혼란을 피합니다:

| 계층 | 매체 | 범위 | 대표 필드 |
|------|------|--------|----------|
| **인스턴스 설정** | `Config` 구조체 | 클라이언트 전체 수명주기 | 타임아웃, 재시도 정책, 연결 풀, TLS |
| **요청 옵션** | `WithXxx()` 함수 | 단일 요청 | `WithHeader`, `WithJSON`, `WithTimeout` |

인스턴스 설정은 `Config` 구조체로 `New()`에 전달하며, `DefaultConfig()`에서 출발해 필요에 따라 수정합니다:

```go
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 60 * time.Second
cfg.Retry.MaxRetries = 5
client, err := httpc.New(cfg)
```

요청 옵션은 매 호출 때 전달되어 인스턴스 수준 기본값을 보완하거나 덮어씁니다:

```go
result, err := client.Get(url,
    httpc.WithHeader("Authorization", "Bearer "+token),
    httpc.WithTimeout(30*time.Second),
)
```

프리셋 설정(`SecureConfig()`, `PerformanceConfig()` 등)을 출발점으로 사용할 수도 있습니다. 자세한 내용은 [설정 API](../api-reference/client-config/config)를 참조하세요.

전 라이브러리 설정은 통일된 관례를 따릅니다: 주 `Config`와 `SessionConfig`는 **값으로 전달**(필수); 미들웨어 설정은 **포인터로 전달**되며 `nil`을 넘기면 기본값을 사용; `DownloadConfig`는 포인터로 전달되며 `FilePath`를 반드시 설정해야 합니다. 모든 `XxxConfig`에는 대응하는 `DefaultXxxConfig()` 생성자가 있습니다 — 기본값에서 출발해 필요한 필드만 수정하는 것이 HTTPC의 일관된 설정 방식입니다.

## 요청 수명주기

모든 요청은 다음 흐름을 거칩니다:

```text
옵션 적용 → 미들웨어 체인(있는 경우) → 엔진 실행 → 재시도(필요 시) → Result 반환
    ↑                                    ↑
  With* 함수                    연결 풀 / TLS / 프록시 / SSRF 검사
```

각 단계의 세부 사항:

- **옵션 적용** - `With*` 함수가 요청 헤더, 요청 본문, 타임아웃 등을 설정합니다. 전달한 순서대로 실행되며, 어떤 옵션이든 오류를 반환하면(예: 요청 헤더가 CRLF 검증을 통과하지 못함) 요청은 즉시 실패합니다.
- **미들웨어 체인** - `Config.Middleware.Middlewares`를 구성했을 때 활성화됩니다. 요청은 등록 순서대로 미들웨어를 통과하고, 종점 Handler가(변경되었을 수 있는) 요청을 엔진에 넘깁니다. 미들웨어를 구성하지 않으면 엔진에 직접 연결되어 추가 오버헤드가 없습니다.
- **엔진 실행** - URL/요청 헤더 검증(기본 켜짐) → SSRF 다이얼 검증(기본적으로 사설 IP 차단) → DNS 해석(선택적 DoH) → 연결 풀에서 연결 획득(부족하면 새로 생성, `MaxConnsPerHost` 제약) → TLS 핸드셰이크(버전 정책, 선택적 인증서 고정) → 요청 전송 → 응답 읽기(응답 본문 크기와 압축 해제 상한 검사).
- **재시도** - 재시도 조건: 타임아웃, 전송 오류, 대부분의 일시적 네트워크 오류, 상태 코드 408/429/500/502/503/504. 백오프는 `Delay × BackoffFactor^n`으로 계산하고 지터를 더하며, 단일 대기는 `MaxRetryDelay`를 넘지 않습니다. 응답에 `Retry-After` 헤더가 있으면 우선 적용합니다(상한 60s). 전체 소요 시간은 `Timeouts.Request` 또는 `WithTimeout`의 제약을 받습니다 — **타임아웃 예산은 재시도에 걸쳐 공유**되며 매 라운드 초기화되지 않습니다.
- **Result** - 응답 데이터, 요청 메타 정보, 재시도 통계를 담습니다. 엔진 내부 객체는 풀링되지만 호출자에게는 투명하며, `Result`는 GC가 자동 회수하므로 수동 해제가 필요 없습니다.

재시도 소진에는 두 가지 결말이 있습니다:

- **네트워크 오류 소진** → `error` 반환(`ClientError.Attempts`에 시도 횟수 기록);
- **재시도 가능 상태 코드(예: 503) 소진** → **마지막 응답** 반환(`result.StatusCode() == 503`, `Meta.Attempts`에 총 횟수 기록). 호출자가 상태 코드에 따라 직접 처리합니다.

## 미들웨어 모델

미들웨어는 `func(Handler) Handler` 형태의 함수(`MiddlewareFunc`)이며, `Handler`는 실제로 요청을 처리하는 함수 시그니처입니다:

```go
type Handler func(ctx context.Context, req RequestMutator) (ResponseMutator, error)
type MiddlewareFunc func(Handler) Handler
```

미들웨어는 `Config.Middleware.Middlewares`에 등록되고 `Chain(middlewares...)`로 양파 모델로 조합됩니다: **등록 순서대로 감싸며** — 첫 번째 미들웨어가 가장 바깥에 위치하고, 요청 단계는 순서대로, 응답 단계는 역순으로 실행됩니다.

커스텀 미들웨어 골격:

```go
func TimingMiddleware(report func(d time.Duration)) httpc.MiddlewareFunc {
    return func(next httpc.Handler) httpc.Handler {
        return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
            start := time.Now()
            resp, err := next(ctx, req)        // 내부 호출(다음 미들웨어 또는 엔진)
            report(time.Since(start))          // 응답 단계 논리(역순 실행)
            return resp, err
        }
    }
}
```

내장 미들웨어 한눈 보기:

| 미들웨어 | 역할 | nil 구성 시 동작 |
|--------|------|------------------|
| `LoggingMiddleware` | 요청/응답 요약 출력(URL 자동 마스킹) | 로깅 비활성화(no-op) |
| `RecoveryMiddleware` | 체인 내 panic을 포착해 error로 변환 | — |
| `RequestIDMiddleware` | `X-Request-ID` 주입(crypto/rand로 생성) | 기본 헤더 이름과 안전한 생성기 |
| `TimeoutMiddleware` | 미들웨어 계층 타임아웃(클라이언트 내장 타임아웃보다 먼저 적용) | 타임아웃 비활성화(통과) |
| `MetricsMiddleware` | 요청별 콜백(메서드/URL/상태/소요 시간/오류) | 메트릭 비활성화(no-op) |
| `AuditMiddleware` | 컴플라이언스 감사 이벤트(text/json 형식, 민감한 헤더 마스킹) | 기본 text 구성 |
| `HeaderMiddleware` | 모든 요청에 정적 헤더 부착(생성 시점에 CRLF 검증) | 헤더 없음(통과) |

:::warning 주의
`TimeoutMiddleware`는 `Download`와 `WithStreamBody(true)` 요청에는 사용할 수 없습니다 — 핸들러가 반환된 직후(응답 헤더를 받은 직후) 컨텍스트를 취소해 응답 본문 읽기 단계에서 "context canceled" 오류가 발생하기 때문입니다. 이런 시나리오에는 `WithTimeout`을 사용하세요.
:::

## 세션과 도메인 클라이언트

같은 도메인에 연속 요청(로그인 상태, 공통 헤더, Cookie 전달)을 보낼 때는 URL을 손으로 조립하고 Cookie를 매번 넘기는 대신 `DomainClient`를 사용합니다:

```go
dc, err := httpc.NewDomainDefault("https://api.example.com")
if err != nil {
    log.Fatal(err)
}
defer dc.Close()

dc.SetHeader("Authorization", "Bearer "+token) // 세션 헤더: 이후 요청에 자동 부착

_, _ = dc.Post("/login", httpc.WithJSON(creds)) // 응답 Set-Cookie가 세션에 자동 기록
_, _ = dc.Get("/me")                            // 세션 Cookie 자동 부착
```

두 구성 요소의 분업:

- **`DomainClient`** - base URL에 바인딩됩니다. 상대 경로는 자동 조합(`/users` → `https://api.example.com/users`), 완전한 `http(s)://` URL이 들어오면 그대로 사용합니다. 경로 트래버설 방어를 내장해 조합 결과가 base 경로 범위를 벗어나면 오류를 반환합니다. 생성 시 Cookie jar가 자동 활성화됩니다.
- **`SessionManager`** - 스레드 안전한 세션 상태 저장소(Cookie + 요청 헤더)입니다. `DomainClient`가 이를 내장해 매 요청 전 세션 상태를 요청 옵션에 주입하고 응답 후 `Set-Cookie`를 기록합니다. `DomainClient` 없이 단독으로 사용할 수도 있습니다(`NewSessionManagerDefault()`).

:::warning 요청 옵션이 두 번 적용됨
`DomainClient`의 요청 옵션은 내부에서 **두 번** 적용됩니다 — 한 번은 세션 상태 캡처(Cookie/헤더), 한 번은 실제 요청 실행입니다. 부수 효과가 있는 로직(카운터, 일회용 nonce 등)을 옵션에 넣지 마세요.
:::

자세한 내용은 [도메인 클라이언트와 세션 가이드](../guides/domain-session)를 참조하세요.

## 보안 기본값

HTTPC는 기본적으로 안전(secure by default)하여 추가 설정 없이 다음을 갖춥니다:

- **TLS 1.2+** 강제 암호화
- **SSRF 방어** - 사설/예약 IP 주소(`127.0.0.1`, `10.x`, `192.168.x` 등) 연결 차단
- **CRLF 주입 방어** - 요청 헤더와 URL 자동 검증
- **응답 본문 크기 제한** - 기본 10MB, 메모리 고갈 방지
- **압축 폭탄 방어선** - 압축 해제 후 응답 본문 기본 상한 100MB
- **엄격한 Content-Length 검증** - 기본 활성화, 응답 본문 길이가 선언과 다르면 오류

내부 서비스(VPN, 사내망)에 연결해야 한다면 `Security.AllowPrivateIPs = true`를 설정하거나 `SSRFExemptCIDRs`로 정밀 면제하세요. 자세한 내용은 [보안 개요](../security/)를 참조하세요.

## 오류 모델

HTTPC는 **네트워크 계층 오류**와 **HTTP 상태 코드**를 구분합니다:

- **네트워크 계층 오류**(연결 실패, 타임아웃, TLS 오류 등) → `error`로 반환되며, `errors.As`로 `ClientError`를 추출해 분류와 재시도 가능성을 확인할 수 있습니다
- **HTTP 상태 코드**(4xx, 5xx) → `error`로 반환되지 **않으며**, `result.IsSuccess()` 등의 메서드로 확인해야 합니다

```go
result, err := client.Get(url)
if err != nil {
    // 네트워크 계층 오류 - 요청이 성공적으로 완료되지 않음
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        log.Printf("오류 유형: %s, 재시도 가능: %v", clientErr.Code(), clientErr.IsRetryable())
    }
    return err
}
// 요청 성공적으로 완료 - HTTP 상태 코드 확인
if !result.IsSuccess() {
    log.Printf("HTTP 오류: %d", result.StatusCode())
}
```

`ClientError`가 담는 컨텍스트:

| 멤버 | 설명 |
|------|------|
| `Type` | 오류 분류(`ErrorTypeTimeout`, `ErrorTypeNetwork` 등 12종 열거) |
| `Code()` | 짧은 코드 문자열: `TIMEOUT`, `NETWORK_ERROR`, `TLS_ERROR`, `DNS_ERROR`, `CONTEXT_CANCELED`, `VALIDATION_ERROR`, `HTTP_ERROR` 등 |
| `IsRetryable()` | 재시도할 가치가 있는지(컨텍스트 취소/검증/TLS/인증서류는 항상 false; 타임아웃/전송은 항상 true; 네트워크/DNS/5xx는 구체적 원인에 따라) |
| `Attempts` | 시도한 횟수(첫 시도 포함) |
| `StatusCode` | 관련된 HTTP 상태 코드(해당하는 경우) |
| `Cause` | 하위 오류, `errors.Is` / `errors.As`로 관통 가능 |
| `URL` / `Method` | 마스킹된 요청 URL과 요청 메서드 |

자주 쓰는 센티널 오류는 `errors.Is`로 판별할 수 있습니다: `ErrClientClosed`(닫힌 클라이언트 사용), `ErrResponseBodyEmpty`(`Unmarshal` 빈 응답 본문), `ErrResponseBodyTooLarge`(파싱 본문 50MB 초과) 등. 전체 목록은 [오류 타입](../api-reference/types/errors)을 참조하세요.

자세한 내용은 [오류 처리](../guides/error-handling)를 참조하세요.

## 동시성과 리소스 관리

- **Client 동시성 안전** - 하나의 클라이언트를 임의의 개수 goroutine이 공유할 수 있으며, 연결 풀은 내부에서 호스트별로 관리됩니다. 동시성을 위해 별도 클라이언트를 만들 필요가 없습니다.
- **Result는 독립적이고 해제 불필요** - 매 요청마다 새 `*Result`가 반환되며(세 개의 메타 정보 구조체도 한 번에 할당), 들고 있어도 수명주기 부담이 없고 GC에 맡기면 됩니다.
- **명시적 Close** - `client.Close()`는 연결 풀과 전송 계층 리소스를 해제합니다. 닫힌 뒤 요청을 보내면 `ErrClientClosed`가 반환됩니다.
- **기본 클라이언트 자가 치유** - 패키지 함수가 쓰는 기본 클라이언트는 `SetDefaultClient()`로 교체하거나 `CloseDefaultClient()`로 종료할 수 있으며, 종료 후 다음 패키지 함수 호출 때 자동 재생성됩니다.
- **panic 안전망** - `Request` 내부에 최후의 recover가 있어 실행 경로의 예기치 않은 panic은 스택을 담은 `error`로 변환되어 반환되며, 호출자를 뚫고 나가지 않습니다.
