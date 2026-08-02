---
sidebar_label: "오류 타입"
title: "오류 타입 - CyberGo HTTPC | ClientError 상세"
description: "HTTPC 오류 타입 API 레퍼런스: ClientError 구조체 8개 필드와 Code, IsRetryable, Unwrap 등 메서드, ErrorTypeNetwork 등 12가지 오류 분류 열거, ErrNilConfig 등 센티널 오류 변수와 errors.Is/As 매칭 예제."
sidebar_position: 3
---

# 오류 타입

HTTPC는 2계층 오류 모델을 채택합니다: 하위는 표준 `error` 인터페이스, 상위는 분류된 `ClientError` 구조체입니다. 모든 요청 실패(네트워크 계층)는 `classifyError`에 의해 컨텍스트를 가진 `ClientError`로 매핑되어, 오류 타입, 재시도 가능 판단, 구조화된 필드를 제공합니다. HTTP 계층 오류(4xx/5xx)는 error로 반환되지 않고 `Result.StatusCode()`로 검사합니다.

## ClientError

```go
type ClientError = engine.ClientError
```

분류된 HTTP 클라이언트 오류로, `errors.As`로 추출합니다. 내부 `engine.ClientError`의 타입 별칭입니다.

### 구조체 필드

```go
type ClientError struct {
    Type       ErrorType  // 오류 분류
    Message    string     // 오류 설명
    Cause      error      // 하위 오류
    URL        string     // 요청 URL(마스킹됨)
    Method     string     // HTTP 메서드
    Attempts   int        // 시도한 횟수
    StatusCode int        // HTTP 상태 코드(해당하는 경우)
    Host       string     // 호스트명(서킷 브레이커용)
}
```

| 필드 | 타입 | 설명 | 전형적 값 |
|------|------|------|-----------|
| `Type` | `ErrorType` | 오류 분류, switch 판단에 사용 | `ErrorTypeNetwork`, `ErrorTypeTimeout` |
| `Message` | `string` | 오류 설명 정보 | `"network operation failed"` |
| `Cause` | `error` | 하위 오류, `Unwrap()`으로 획득 가능 | `*net.OpError`, `*net.DNSError` |
| `URL` | `string` | 요청 URL(자격 증명 마스킹됨) | `"https://example.com/path"` |
| `Method` | `string` | HTTP 메서드 | `"GET"`, `"POST"` |
| `Attempts` | `int` | 시도한 횟수(첫 요청 포함) | `1`(첫 실패), `4`(3회 재시도 후) |
| `StatusCode` | `int` | HTTP 상태 코드(HTTP 오류가 아닌 경우 0) | `0`(네트워크 오류), `503`(서버 오류) |
| `Host` | `string` | 요청 호스트명(서킷 브레이커용) | `"example.com"` |

### 메서드

| 메서드 | 반환값 | 설명 |
|--------|--------|------|
| `Error()` | `string` | `"METHOD url: message: cause (attempt N)"` 형식으로 포맷 |
| `Code()` | `string` | 짧은 오류 코드 반환, 예: `"NETWORK_ERROR"`, `"TIMEOUT"` |
| `IsRetryable()` | `bool` | 이 오류가 재시도할 가치가 있는지 판단 |
| `Unwrap()` | `error` | `Cause` 반환, `errors.Is`/`errors.As`로 오류 체인 순회 지원 |
| `WithType(t ErrorType)` | `*ClientError` | 오류 타입이 설정된 **사본** 반환(원본 수정하지 않음) |

### Error() 포맷

`Error()` 메서드는 오류를 읽을 수 있는 문자열로 포맷합니다:

- URL과 Method가 모두 있을 때: `"GET https://example.com: network operation failed: dial tcp ... (attempt 1)"`
- Message만 있을 때: Message 직접 출력
- Cause가 있을 때: `": " + Cause.Error()` 추가
- Attempts가 있을 때(>0): `" (attempt N)"` 추가

URL은 출력 전 자동으로 `SanitizeURL`을 거쳐 마스킹됩니다(자격 증명 제거). 엔진 분류 경로에서 생성된 오류는 이미 마스킹되어 있어(`urlSanitized=true`), 중복 url.Parse 호출을 건너뛰어 할당을 피합니다.

### Code() 오류 코드

`Code()`는 오류 타입을 식별하는 짧은 문자열을 반환하여, 로그 분류와 모니터링 알림에 편리합니다:

| ErrorType | Code() 반환값 |
|-----------|---------------|
| `ErrorTypeNetwork` | `"NETWORK_ERROR"` |
| `ErrorTypeTimeout` | `"TIMEOUT"` |
| `ErrorTypeContextCanceled` | `"CONTEXT_CANCELED"` |
| `ErrorTypeResponseRead` | `"RESPONSE_READ_ERROR"` |
| `ErrorTypeTransport` | `"TRANSPORT_ERROR"` |
| `ErrorTypeRetryExhausted` | `"RETRY_EXHAUSTED"` |
| `ErrorTypeTLS` | `"TLS_ERROR"` |
| `ErrorTypeCertificate` | `"CERTIFICATE_ERROR"` |
| `ErrorTypeDNS` | `"DNS_ERROR"` |
| `ErrorTypeValidation` | `"VALIDATION_ERROR"` |
| `ErrorTypeHTTP` | `"HTTP_ERROR"` |
| `ErrorTypeUnknown`(및 기타) | `"UNKNOWN_ERROR"` |

```go
var clientErr *httpc.ClientError
if errors.As(err, &clientErr) {
    log.Printf("오류 코드: %s, URL: %s, 시도 횟수: %d, 재시도 가능: %v",
        clientErr.Code(), clientErr.URL, clientErr.Attempts, clientErr.IsRetryable())
}
```

## IsRetryable 판단 로직

`IsRetryable()`은 HTTPC 재시도 메커니즘의 핵심 의사결정 메서드입니다. 판단 흐름:

1. **컨텍스트 오류 우선 검사**: Cause가 `context.Canceled` 또는 `context.DeadlineExceeded`인 경우, 직접 false 반환(재시도하지 않음)
2. **ErrorType별 분배**:

| ErrorType | 재시도 가능 | 판단 로직 |
|-----------|:-----------:|----------|
| `ErrorTypeNetwork` | 상황에 따라 | Cause 검사: 래핑된 ClientError → 재귀 판단; `*net.OpError` → 타임아웃 또는 재시도 가능한 syscall(ECONNREFUSED/ECONNRESET/EPIPE/ETIMEDOUT/ENETUNREACH/EHOSTUNREACH); `net.Error` → 기본 재시도 가능; 메시지 매칭("connection reset"/"eof"/"broken pipe" 등) |
| `ErrorTypeTimeout` | 예 | 모든 전송 계층 타임아웃은 재시도 가능 |
| `ErrorTypeTransport` | 예 | HTTP 전송 계층 오류 |
| `ErrorTypeResponseRead` | 상황에 따라 | 읽기 작업(`Op == "read"` 또는 `"readfrom"`)만 재시도 가능; 쓰기 작업은 재시도하지 않음 |
| `ErrorTypeDNS` | 상황에 따라 | Cause가 `*net.DNSError`일 때, `IsTemporary` 또는 `IsTimeout`이 true여야만 재시도 |
| `ErrorTypeHTTP` | 상황에 따라 | StatusCode가 `retryableStatusCodes`(408/429/500/502/503/504)에 적중하면 재시도 가능 |
| `ErrorTypeContextCanceled` | 아니요 | 사용자 능동 취소 |
| `ErrorTypeValidation` | 아니요 | 요청 자체가 합법적이지 않음, 재시도 무의미 |
| `ErrorTypeTLS` | 아니요 | TLS 프로토콜 오류, 보통 자가 복구되지 않음 |
| `ErrorTypeCertificate` | 아니요 | 인증서 검증 실패, 재시도 무의미 |
| `ErrorTypeRetryExhausted` | 아니요 | 이미 재시도 횟수 소진 |
| `ErrorTypeUnknown` | 아니요 | 알 수 없는 오류, 보수적으로 재시도하지 않음 |

### retryableStatusCodes

```go
var retryableStatusCodes = map[int]bool{
    408: true, // Request Timeout
    429: true, // Too Many Requests
    500: true, // Internal Server Error
    502: true, // Bad Gateway
    503: true, // Service Unavailable
    504: true, // Gateway Timeout
}
```

이것은 HTTP 상태 코드가 재시도를 트리거하는 유일한 진실 소스이며, 재시도 로직과 `IsRetryable()`이 동시에 사용합니다.

:::tip 타임아웃 타입의 미세한 차이
`ErrorTypeTimeout`은 재시도 가능하지만, **컨텍스트 마감으로 트리거된 타임아웃은 재시도할 수 없습니다** — `context.DeadlineExceeded`가 1단계에서 가로채어지기(false 반환) 때문입니다. 전송 계층 타임아웃(예: `net.OpError.Timeout()`)만이 2단계에 도달하여 재시도 가능으로 판정됩니다. 이는 사용자가 설정한 `WithTimeout`이 재시도로 돌파되지 않도록 보장합니다.
:::

## ErrorType

```go
type ErrorType = engine.ErrorType
```

오류 분류 열거(`int` 타입)입니다.

| 상수 | 값 | 의미 | 전형적 트리거 시나리오 | 재시도 가능 |
|------|-----|------|------------------------|:-----------:|
| `ErrorTypeUnknown` | 0 | 알 수 없음/미분류 | 알려진 패턴에 매칭되지 않음 | 아니요 |
| `ErrorTypeNetwork` | 1 | 네트워크 계층 오류 | 연결 거부, 연결 재설정, 네트워크 도달 불가 | 상황에 따라 |
| `ErrorTypeTimeout` | 2 | 타임아웃 | `net.OpError` 타임아웃, 컨텍스트 마감¹ | 상황에 따라² |
| `ErrorTypeContextCanceled` | 3 | 컨텍스트 취소 | `context.Cancel` 트리거 | 아니요 |
| `ErrorTypeResponseRead` | 4 | 응답 본문 읽기 오류 | 응답 본문 읽기 시 EOF/연결 중단 | 상황에 따라 |
| `ErrorTypeTransport` | 5 | 전송 계층 오류 | HTTP 프로토콜 오류, 전송 실패 | 예 |
| `ErrorTypeRetryExhausted` | 6 | 재시도 소진 | MaxRetries 도달 후에도 실패 | 아니요 |
| `ErrorTypeTLS` | 7 | TLS 오류 | TLS 핸드셰이크 실패, 프로토콜 불일치 | 아니요 |
| `ErrorTypeCertificate` | 8 | 인증서 검증 오류 | x509 인증서 만료/신뢰할 수 없음 | 아니요 |
| `ErrorTypeDNS` | 9 | DNS 해석 오류 | 도메인 없음, DNS 타임아웃 | 상황에 따라 |
| `ErrorTypeValidation` | 10 | 요청 검증 오류 | URL 형식 오류, 리다이렉트 초과, CRLF 주입 | 아니요 |
| `ErrorTypeHTTP` | 11 | HTTP 계층 오류 | 4xx/5xx 응답(재시도 시나리오에서만 발생) | 상황에 따라 |

> ¹ 컨텍스트 마감(`WithTimeout`, `TimeoutConfig.Request`)으로 트리거된 타임아웃은 재시도**하지 않습니다**; 전송 계층 타임아웃(예: `net.OpError` 타임아웃)만 재시도됩니다.
> ² 위 [IsRetryable 판단 로직](#isretryable-판단-로직)을 참조하세요.

### 타입 판단

```go
result, err := client.Get(url)
if err != nil {
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        switch clientErr.Type {
        case httpc.ErrorTypeTimeout:
            log.Println("요청 타임아웃")
        case httpc.ErrorTypeNetwork:
            log.Println("네트워크 오류:", clientErr.Message)
        case httpc.ErrorTypeTLS:
            log.Println("TLS 오류")
        case httpc.ErrorTypeCertificate:
            log.Println("인증서 검증 실패")
        case httpc.ErrorTypeDNS:
            log.Println("DNS 해석 실패")
        case httpc.ErrorTypeRetryExhausted:
            log.Println("재시도 소진, 총", clientErr.Attempts, "회 시도")
        case httpc.ErrorTypeContextCanceled:
            log.Println("요청 취소됨")
        case httpc.ErrorTypeValidation:
            log.Println("요청 검증 실패")
        }
    }
}
```

## URL 마스킹 메커니즘

`ClientError.Error()`는 포맷 시 자동으로 `validation.SanitizeURL`을 호출하여 URL에서 자격 증명 정보를 제거합니다(`user:pass@host` → `***:***@host`), 민감 정보가 로그와 오류 메시지로 유출되는 것을 방지합니다.

```go
// 원본 URL: https://admin:secret@api.example.com/data
// Error() 출력: GET https://***:***@api.example.com/data: ...
```

엔진 분류 경로(`classifyErrorWithSanitizedURL`)는 첫 분류 시 마스킹을 완료하고 `urlSanitized=true`를 설정하며, 이후 `Error()` 호출은 중복 url.Parse를 건너뛰어 매 로그 출력마다 할당이 발생하지 않습니다.

:::tip 콜백에서의 오류 마스킹
`MetricsMiddleware`와 `LoggingMiddleware` 등 미들웨어의 콜백에서, HTTPC는 ClientError가 아닌 타입의 오류 메시지를 추가로 검사하여 원본 URL을 마스킹된 버전으로 교체하며, 콜백이 자격 증명을 유출하지 않도록 보장합니다.
:::

## 오류 분류 흐름

`classifyError`는 하위 `error`를 `*ClientError`로 매핑하는 핵심 함수이며, 다음 순서로 계층별 판단합니다:

1. **컨텍스트 오류**: `context.Canceled` → `ErrorTypeContextCanceled`; `context.DeadlineExceeded` → `ErrorTypeTimeout`
2. **연결 풀 소진**: `connection.ErrPoolExhausted` → `ErrorTypeNetwork`
3. **`*url.Error` 언랩**: HTTP/2 무효 헤더, URL 파싱 실패 → `ErrorTypeValidation`; 그 외에는 내부 오류를 언랩하여 계속 판단
4. **`*net.DNSError`**: `ErrorTypeDNS`, 타임아웃과 실패 구분
5. **`*net.OpError`**: `ErrorTypeNetwork`, 타임아웃과 작업 실패 구분
6. **`net.Error`**: 타임아웃 → `ErrorTypeTimeout`; 기타 → `ErrorTypeNetwork`
7. **메시지 패턴 매칭**(fallback): 오류 메시지 키워드로 TLS/certificate/timeout/connection refused 등 20+ 패턴 매칭
8. **폴백**: `url.Error`의 내부가 어떤 패턴에도 매칭되지 않을 때 → `ErrorTypeNetwork`; 그 외 → `ErrorTypeUnknown`

## 오류 변수

### 구성 오류

| 변수 | 오류 메시지 | 트리거 조건 |
|------|-------------|-------------|
| `ErrNilConfig` | `"config cannot be nil"` | nil Config을 `New`/`ValidateConfig`에 전달 |
| `ErrInvalidTimeout` | `"invalid timeout"` | 타임아웃 값이 음수이거나 30분 상한 초과 |
| `ErrInvalidRetry` | `"invalid retry configuration"` | MaxRetries가 0–10 외, BackoffFactor가 1.0–10.0 외 |
| `ErrInvalidConnection` | `"invalid connection configuration"` | MaxIdleConns/MaxConnsPerHost 범위 초과, ProxyURL 형식 오류 |
| `ErrInvalidSecurity` | `"invalid security configuration"` | MaxResponseBodySize가 0–1GB 범위 초과 |
| `ErrInvalidMiddleware` | `"invalid middleware configuration"` | MaxRedirects가 0–50 외, UserAgent가 너무 길거나 제어 문자 포함 |
| `ErrInvalidHeader` | `"invalid header"` | 요청 헤더 키/값에 제어 문자 포함 또는 크기 제한 초과 |

### 요청과 응답 오류

| 변수 | 오류 메시지 | 트리거 조건 |
|------|-------------|-------------|
| `ErrEmptyFilePath` | `"file path cannot be empty"` | DownloadConfig.FilePath가 비어 있음 |
| `ErrFileExists` | `"file already exists"` | 파일이 이미 존재하고 Overwrite=false이며 ResumeDownload=false |
| `ErrResponseBodyEmpty` | `"response body is empty"` | 빈 응답 본문에 Unmarshal 등 파싱 메서드 호출 |
| `ErrResponseBodyTooLarge` | `"response body too large"` | 응답 본문이 MaxResponseBodySize 초과 |

### 클라이언트 오류

| 변수 | 오류 메시지 | 트리거 조건 |
|------|-------------|-------------|
| `ErrClientClosed` | `"client is closed"` | Close() 이후에 클라이언트 사용 |

## 실용적 매칭 패턴

### errors.As로 ClientError 추출

```go
result, err := client.Get(url)
if err != nil {
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        // 구조화된 필드 접근
        fmt.Printf("오류 코드: %s\n", clientErr.Code())
        fmt.Printf("오류 타입: %d\n", clientErr.Type)
        fmt.Printf("요청: %s %s\n", clientErr.Method, clientErr.URL)
        fmt.Printf("시도 횟수: %d\n", clientErr.Attempts)
        if clientErr.StatusCode != 0 {
            fmt.Printf("상태 코드: %d\n", clientErr.StatusCode)
        }
    }
}
```

### errors.Is로 센티널 오류 매칭

```go
if errors.Is(err, httpc.ErrClientClosed) {
    // 클라이언트가 닫혔음, 재생성 필요
}
if errors.Is(err, httpc.ErrResponseBodyEmpty) {
    // 응답 본문이 비어 있음, 파싱 건너뛰기
}
if errors.Is(err, httpc.ErrFileExists) {
    // 파일이 이미 존재함, 사용자에게 알리거나 Overwrite=true 설정
}
```

### errors.Unwrap으로 오류 체인 순회

```go
var clientErr *httpc.ClientError
if errors.As(err, &clientErr) {
    // Cause는 하위 오류(예: *net.OpError)
    cause := clientErr.Unwrap()
    if cause != nil {
        var opErr *net.OpError
        if errors.As(cause, &opErr) {
            fmt.Println("작업:", opErr.Op)
            fmt.Println("네트워크:", opErr.Net)
            fmt.Println("주소:", opErr.Addr)
        }
    }
}
```

:::tip 세 가지 매칭 방식의 선택
- `errors.As`: ClientError의 구조화된 필드(Type/Code/URL/Attempts 등)에 접근 필요할 때
- `errors.Is`: 센티널 오류 매칭(ErrClientClosed 등 구성/파일 오류)
- `errors.Unwrap`: 최하위 net/error에 도달하여 시스템 수준 진단 정보를 얻어야 할 때
:::

## 참고

- [오류 처리](../../guides/error-handling) - 완전한 오류 처리 가이드
- [상수와 타입](./constants) - BodyKind 등 상수 레퍼런스
- [재시도와 내결함성](../../guides/retry-fault-tolerance) - 재시도 전략 가이드
