---
sidebar_label: "개요"
title: "API 레퍼런스 - CyberGo HTTPC | API 전체 색인"
description: "HTTPC API 레퍼런스 전체 색인: 핵심 함수, 요청 옵션, Result, Config, Handler 미들웨어, Mutator, 타입, 오류와 상수 아홉 그룹의 API 맵으로 28개 WithXxx 옵션, 5가지 프리셋, 7개 내장 미들웨어, 12개 오류 변수를 안내합니다."
sidebar_position: 1
---

# API 레퍼런스

HTTPC는 28개 요청 옵션 함수, 5개 설정 프리셋, 7개 내장 미들웨어와 완전한 다운로드 지원을 제공합니다.

## 핵심 아키텍처

HTTPC는 2계층 설계를 채택합니다. Layer 1의 메서드 API는 얇은 래퍼이며, 실제로 요청을 처리하는 엔진은 Layer 2의 Handler 파이프라인입니다.

```text
HTTPC 2계층 아키텍처
├── Layer 1  메서드 API(얇은 래퍼)
│     패키지 함수 httpc.Get/Post/... + Client 메서드 + 요청 옵션 → Result
│
└── Layer 2  Handler 파이프라인(요청 처리 엔진)
      MiddlewareFunc(Handler) 양파 체인
      → clientImpl.middlewareChain 조립
      → 실행(각 요청 = Handler 체인 조립 및 실행)
```

## 모듈 탐색

### 핵심

| 모듈 | 설명 |
|------|------|
| [패키지 함수와 클라이언트 메서드](./core/functions) | Get/Post/Put/Patch/Delete 등 패키지 함수, 클라이언트 메서드와 보조 함수 |
| [설정](./client-config/config) | Config 구조체, 5가지 프리셋 설정, 검증 함수와 Cookie 보안 |
| [인터페이스](./types/interfaces) | Client, Doer, DomainClienter, RetryPolicy 등 핵심 인터페이스 |
| [Result](./core/result) | Result, RequestInfo, ResponseInfo, RequestMeta 타입과 모든 메서드 |
| [핸들러 파이프라인](./handler/handler-chain) | Handler 파이프라인, MiddlewareFunc 양파 체인, Chain 결합기와 Mutator 계약 |
| [뮤테이터](./handler/mutators) | RequestMutator/ResponseMutator의 읽기/쓰기 메서드와 타입 단언 |

### 요청과 응답

| 모듈 | 설명 |
|------|------|
| [요청 옵션](./core/options) | 28개 WithXxx 요청 옵션 함수(요청 헤더, 본문, 인증, Cookie, 콜백 등) |
| [내장 미들웨어](./client-config/middleware) | Chain 조합, 7개 내장 미들웨어 팩토리와 감사 이벤트 타입 |
| [오류 타입](./types/errors) | ClientError, 12가지 ErrorType 열거와 12개 오류 변수 |

### 고급 기능

| 모듈 | 설명 |
|------|------|
| [도메인 클라이언트](./client-config/domain-client) | DomainClient 생성, HTTP 메서드, 다운로드 메서드와 URL 조합 규칙 |
| [세션 관리](./client-config/session) | SessionManager의 Cookie/요청 헤더 관리와 보안 검증 |
| [파일 다운로드](./client-config/download) | 다운로드 함수, DownloadConfig, 이어받기와 보안 보호 |
| [상수와 타입](./types/constants) | BodyKind 열거, FormData/FileData와 감사 컨텍스트 키 |

## API 맵

기호 타입별로 그룹화한 완전한 색인으로, `github.com/cybergodev/httpc` 패키지의 익스포트 영역과 일대일로 대응합니다. 항목을 클릭하면 해당 상세 페이지로 이동합니다.

### 클라이언트와 패키지 수준 함수

| 기호 | 설명 |
|------|------|
| [`New`](./core/functions#new) / [`NewDefault`](./core/functions#newdefault) | 클라이언트 생성(커스텀 / 기본 설정) |
| [`Get`](./core/functions#get) / `Post` / `Put` / `Patch` / `Delete` / `Head` / `Options` / [`Request`](./core/functions#request) | 패키지 수준 HTTP 메서드(내부의 기본 클라이언트 공유) |
| [`Download`](./core/functions#download) | 통합 파일 다운로드 진입점(패키지 함수 / Client / DomainClient 세 곳에서 같은 이름·같은 시그니처) |
| [`SetDefaultClient`](./core/functions#setdefaultclient) / [`CloseDefaultClient`](./core/functions#closedefaultclient) | 기본 클라이언트 교체와 닫기 |
| [`NewDomain`](./core/functions#newdomain) / [`NewDomainDefault`](./core/functions#newdomaindefault) | 도메인 범위 클라이언트 |
| [`SetSecurityWarnOutput`](./core/functions#setsecuritywarnoutput) | 보안 경고 출력 리다이렉트 |
| [`FormatBytes`](./core/functions#formatbytes) / [`FormatSpeed`](./core/functions#formatspeed) | 바이트 수 / 속도 포맷 |

### 요청 옵션(28개)

| 그룹 | 옵션 |
|------|------|
| 요청 헤더(3) | `WithHeader`, `WithHeaderMap`, `WithUserAgent` |
| 인증(2) | `WithBasicAuth`, `WithBearerToken` |
| 요청 본문(7) | `WithJSON`, `WithXML`, `WithForm`, `WithFormData`, `WithFile`, `WithBinary`, `WithBody` |
| 쿼리 매개변수(2) | `WithQuery`, `WithQueryMap` |
| Cookie(5) | `WithCookie`, `WithCookies`, `WithCookieMap`, `WithCookieString`, `WithSecureCookie` |
| 요청 제어(7) | `WithContext`, `WithTimeout`, `WithMaxRetries`, `WithFollowRedirects`, `WithMaxRedirects`, `WithAllowPrivateIPs`, `WithStreamBody` |
| 콜백(2) | `WithOnRequest`, `WithOnResponse` |

모든 옵션의 시그니처, 검증 규칙과 덮어쓰는 Config 기본값은 [요청 옵션](./core/options)을 참조하세요.

### Result 계열

| 분류 | 기호 |
|------|------|
| 타입 | `Result`(17개 nil 안전 메서드) |
| 상태와 프로토콜 | `StatusCode`, `Proto`, `IsSuccess`, `IsRedirect`, `IsClientError`, `IsServerError` |
| 요청 본문 접근 | `Body`, `RawBody` |
| 파싱과 저장 | `Unmarshal`, `SaveToFile`, `String` |
| Cookie | `ResponseCookies`, `GetCookie`, `HasCookie`, `RequestCookies`, `GetRequestCookie`, `HasRequestCookie` |
| 하위 타입 | `RequestInfo`, `ResponseInfo`, `RequestMeta`(`ProxyURL` 프록시 필드 포함) |

자세한 내용은 [Result](./core/result)를 참조하세요.

### 설정

| 분류 | 기호 |
|------|------|
| 메인 타입 | `Config`(`Timeouts` / `Connection` / `Security` / `Retry` / `Middleware` / `Defaults` 6개 그룹) |
| 하위 설정 타입 | `TimeoutConfig`, `ConnectionConfig`, `SecurityConfig`, `RetryConfig`, `MiddlewareConfig`, `RequestDefaults` |
| 프리셋(5개) | `DefaultConfig`, `SecureConfig`, `PerformanceConfig`, `TestingConfig`, `MinimalConfig` |
| 검증과 출력 | `ValidateConfig`, `Config.String` |
| Cookie 보안 | `CookieSecurityConfig`, `DefaultCookieSecurityConfig`, `StrictCookieSecurityConfig` |
| 다운로드 설정 | `DownloadConfig`, `DefaultDownloadConfig`, `DownloadResult`, `DownloadProgressCallback`, `ChecksumAlgorithm` |
| 세션 설정 | `SessionConfig`, `DefaultSessionConfig`, `NewSessionManager`, `NewSessionManagerDefault` |

자세한 내용은 [설정](./client-config/config), [파일 다운로드](./client-config/download), [세션 관리](./client-config/session)을 참조하세요.

### Handler, 미들웨어와 뮤테이터

| 분류 | 기호 |
|------|------|
| 파이프라인 타입 | `Handler`, `MiddlewareFunc`, `Chain` |
| 미들웨어 팩토리(7개) | `LoggingMiddleware`, `RecoveryMiddleware`, `RequestIDMiddleware`, `TimeoutMiddleware`, `HeaderMiddleware`, `MetricsMiddleware`, `AuditMiddleware` |
| 미들웨어 설정 | `LoggingConfig`, `RequestIDConfig`, `TimeoutMiddlewareConfig`, `HeaderConfig`, `MetricsConfig`, `AuditConfig`(각각 `Default*Config()` 생성자가 제공됨) |
| 뮤테이터 | `RequestMutator`, `ResponseMutator`(미들웨어가 요청/응답을 읽고 쓰는 계약) |

자세한 내용은 [핸들러 파이프라인](./handler/handler-chain), [내장 미들웨어](./client-config/middleware), [뮤테이터](./handler/mutators)를 참조하세요.

### 인터페이스와 타입

| 분류 | 기호 |
|------|------|
| 핵심 인터페이스 | `Client`, `Doer`, `DomainClienter`, `RetryPolicy` |
| 타입 별칭 | `RequestOption`, `ClientError`, `ErrorType`, `CertificatePinner`, `ProxyStrategy` |
| 인증서 고정 | `NewSPKIHashPinner`, `NewPublicKeyPinner`, `NewCertificatePinnerChain` |
| 세션과 도메인 | `SessionManager`, `DomainClient`(`DomainClienter` 인터페이스로 사용 권장) |
| 데이터 타입 | `FormData`, `FileData`, `AuditEvent` |

자세한 내용은 [인터페이스](./types/interfaces), [도메인 클라이언트](./client-config/domain-client), [세션 관리](./client-config/session), [상수와 타입](./types/constants)을 참조하세요.

### 오류와 상수

| 분류 | 기호 |
|------|------|
| 오류 타입 | `ClientError`, `ErrorType`(12가지 오류 범주 열거) |
| 센티널 오류(12개) | `ErrClientClosed`, `ErrNilConfig`, `ErrInvalidHeader`, `ErrInvalidTimeout`, `ErrInvalidRetry`, `ErrInvalidConnection`, `ErrInvalidSecurity`, `ErrInvalidMiddleware`, `ErrEmptyFilePath`, `ErrFileExists`, `ErrResponseBodyEmpty`, `ErrResponseBodyTooLarge` |
| BodyKind(6개 상수) | `BodyAuto`, `BodyJSON`, `BodyXML`, `BodyForm`, `BodyBinary`, `BodyMultipart` |
| 기타 상수 | `ProxyStrategyRoundRobin` / `ProxyStrategyRandom`, `ChecksumSHA256`, 감사 컨텍스트 키 |

자세한 내용은 [오류 타입](./types/errors), [상수와 타입](./types/constants)을 참조하세요.

## 빠른 참조

### 클라이언트 생성

```go
client, err := httpc.NewDefault()             // 기본 설정
client, err := httpc.New(httpc.SecureConfig()) // 보안 프리셋
client, err := httpc.New(customConfig)         // 사용자 정의 설정
```

### 요청 전송

```go
// 패키지 함수
result, err := httpc.Get(url, options...)

// 클라이언트 메서드
result, err := client.Get(url, options...)

// 컨텍스트 포함
result, err := client.Request(ctx, "GET", url, options...)
```

### 응답 처리

```go
result.StatusCode()           // 상태 코드
result.Body()                 // 응답 본문(문자열)
result.RawBody()              // 응답 본문(바이트)
result.Unmarshal(&data)       // JSON 파싱
result.IsSuccess()            // 2xx 여부
result.Meta.Duration          // 요청 소요 시간
result.Meta.Attempts          // 재시도 횟수
```

## 버전 호환성

- **Go 버전**: Go 1.25 이상 필요(`go.mod`에 `go 1.25.0` 선언).
- **임포트 경로**: `github.com/cybergodev/httpc`(패키지명 `httpc`, 별칭 불필요).
- **직접 의존성**: `golang.org/x/sys`뿐(각 플랫폼의 시스템 프록시 감지용, Linux/macOS/Windows 커버), 그 외 서드파티 의존성 없음.
- **API 상태**: 현재 모든 익스포트 기호에 `Deprecated` 표시가 없으며, 활발히 유지보수되고 있습니다.
