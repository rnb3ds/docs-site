---
sidebar_label: "오류 처리"
title: "오류 처리 - CyberGo HTTPC | 분류와 센티널 매칭"
description: "HTTPC 오류 처리 가이드: ErrorType 12가지 오류 분류, ClientError 필드와 IsRetryable 판단, errors.Is/As 센티널 오류 매칭, 재시도 소진 처리, context 타임아웃과 취소, 미들웨어 통합 오류 처리와 타임아웃 계층화 모범 사례."
sidebar_position: 5
---

# 오류 처리

HTTPC는 모든 오류를 `ClientError`로 통합 캡슐화하여, 유형 분류, 재시도 가능 여부 판단, 풍부한 컨텍스트 정보를 제공합니다. Go 표준 라이브러리의 `errors.Is`/`errors.As`와 함께 사용하면 센티널 오류를 정확히 매칭하거나 분류별로 유연하게 처리할 수 있습니다.

## ErrorType 완전 참조

HTTPC는 네트워크 계층부터 애플리케이션 계층까지 모든 실패 시나리오를 포괄하는 12가지 오류 유형을 정의합니다:

| ErrorType | Code() | 의미 | 전형적 시나리오 | 재시도 가능 |
|-----------|--------|------|----------------|-------------|
| `ErrorTypeNetwork` | `NETWORK_ERROR` | 네트워크 계층 오류 | 연결 거부, 연결 재설정, 파이프 단절 | 원인에 따라 결정 |
| `ErrorTypeTimeout` | `TIMEOUT` | 타임아웃 | 다이얼 타임아웃, 요청 타임아웃, context 만료 | 예 |
| `ErrorTypeContextCanceled` | `CONTEXT_CANCELED` | 컨텍스트 취소 | `ctx.Cancel()` 호출 | 아니요 |
| `ErrorTypeDNS` | `DNS_ERROR` | DNS 해석 실패 | 도메인 없음, DNS 서버 장애 | 임시/타임아웃 시 재시도 가능 |
| `ErrorTypeTLS` | `TLS_ERROR` | TLS 핸드셰이크 오류 | 프로토콜 버전 미지원, 알고리즘 협상 실패 | 아니요 |
| `ErrorTypeCertificate` | `CERTIFICATE_ERROR` | 인증서 검증 실패 | 인증서 만료, 서명 무효, 신뢰할 수 없는 CA | 아니요 |
| `ErrorTypeTransport` | `TRANSPORT_ERROR` | HTTP 전송 계층 오류 | 프로토콜 오류, 전송 중단 | 예 |
| `ErrorTypeResponseRead` | `RESPONSE_READ_ERROR` | 응답 본문 읽기 오류 | 연결 중단으로 인한 EOF, 읽기 타임아웃 | 원인에 따라 결정 |
| `ErrorTypeRetryExhausted` | `RETRY_EXHAUSTED` | 재시도 소진 | `MaxRetries` 상한 도달 후에도 실패 | 아니요 |
| `ErrorTypeValidation` | `VALIDATION_ERROR` | 요청 검증 실패 | URL 형식 불법, HTTP 헤더에 제어 문자 포함 | 아니요 |
| `ErrorTypeHTTP` | `HTTP_ERROR` | HTTP 상태 코드 오류 | 4xx/5xx 응답 | 상태 코드에 따라 판단 |
| `ErrorTypeUnknown` | `UNKNOWN_ERROR` | 미분류 오류 | 기타 매칭되지 않는 예외 | 아니요 |

:::tip 재시도 가능 여부 판단의 완전한 규칙
`IsRetryable()`의 판정 로직은 표보다 더 세분화됩니다: `ErrorTypeDNS`는 `net.DNSError`가 임시 또는 타임아웃으로 표시된 경우에만 재시도 가능; `ErrorTypeNetwork`는 `syscall.Errno`(`ECONNREFUSED`/`ECONNRESET`/`EPIPE`/`ETIMEDOUT`/`ENETUNREACH`/`EHOSTUNREACH`)와 오류 메시지 패턴 검사로 판단; `ErrorTypeResponseRead`는 읽기 작업(`read`/`readfrom`)의 네트워크 오류인 경우에만 재시도. 자세한 내용은 아래 '재시도 가능 여부 판단'을 참조하세요.
:::

## ClientError 필드 상세

`ClientError` 구조체는 요청 실패의 완전한 컨텍스트를 전달합니다:

| 필드 | 유형 | 용도 |
|------|------|------|
| `Type` | `ErrorType` | 오류 분류, `switch` 분기 처리에 사용 |
| `Message` | `string` | 사람이 읽을 수 있는 오류 설명 |
| `Cause` | `error` | 내부 원본 오류, `errors.Unwrap` 체인 지원 |
| `URL` | `string` | 요청 URL(마스킹됨, 아래 참조) |
| `Method` | `string` | HTTP 메서드(GET/POST/...) |
| `Attempts` | `int` | 시도 횟수(최초 포함), 재시도 소진 시 > 1 |
| `StatusCode` | `int` | HTTP 상태 코드(`ErrorTypeHTTP`인 경우에만 값 존재) |
| `Host` | `string` | 대상 호스트명(서킷 브레이커 등에 사용) |

### 오류 유형 판단

```go
package main

import (
    "errors"
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://api.example.com/data")
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) {
            switch clientErr.Type {
            case httpc.ErrorTypeTimeout:
                log.Printf("요청 타임아웃 (%d회 시도): %v", clientErr.Attempts, err)
            case httpc.ErrorTypeNetwork:
                log.Printf("네트워크 오류: %v", err)
            case httpc.ErrorTypeDNS:
                log.Printf("DNS 해석 실패: %v", err)
            case httpc.ErrorTypeTLS:
                log.Printf("TLS 핸드셰이크 실패: %v", err)
            case httpc.ErrorTypeCertificate:
                log.Printf("인증서 검증 실패: %v", err)
            case httpc.ErrorTypeRetryExhausted:
                log.Printf("%d회 재시도 후에도 실패: %v", clientErr.Attempts, err)
            case httpc.ErrorTypeValidation:
                log.Printf("요청 검증 실패: %v", err)
            case httpc.ErrorTypeContextCanceled:
                log.Printf("요청 취소됨: %v", err)
            default:
                log.Printf("기타 오류 [%s]: %v", clientErr.Code(), err)
            }
        }
        return
    }
    fmt.Printf("성공: %d\n", result.StatusCode())
}
```

### 재시도 가능 여부 판단

`IsRetryable()`은 오류 유형과 내부 원인을 종합적으로 고려하여 재시도 가치가 있는지 반환합니다:

```go
package main

import (
    "errors"
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    _, err = client.Get("https://api.example.com/data")
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) {
            if clientErr.IsRetryable() {
                fmt.Println("재시도 가능한 오류, 상위 로직에서 나중에 재시도 가능")
            } else {
                fmt.Printf("재시도 불가능한 오류 [%s], 수동 개입 필요\n", clientErr.Code())
            }
        }
    }
}
```

:::warning IsRetryable과 자동 재시도의 차이
`IsRetryable()`이 판단하는 것은 "이 오류가 재시도할 가치가 있는지"이며, 이는 HTTPC 내부 재시도 엔진에서도 사용됩니다. `Retry.MaxRetries`로 자동 재시도를 이미 구성했다면, 오류 처리 코드에 도달했을 때 네트워크/타임아웃류 오류를 받았다면 재시도가 이미 소진된 것입니다. `IsRetryable()`은 주로 상위 계층(서킷 브레이커, 작업 큐 등)의 의사결정에 사용됩니다.
:::

## 센티널 오류 완전 참조

HTTPC는 다음 센티널 오류 변수를 정의하며, `errors.Is`로 정확히 매칭할 수 있습니다:

| 센티널 변수 | 트리거 조건 | 권장 처리 |
|-------------|------------|----------|
| `ErrClientClosed` | `client.Close()` 이후에 해당 클라이언트를 계속 사용 | 새 Client 초기화 또는 수명 주기 관리 수정 |
| `ErrNilConfig` | `New()`에 전달된 Config 포인터가 nil | `DefaultConfig()`로 기본값 획득 |
| `ErrInvalidHeader` | HTTP 헤더 검증 실패(제어 문자 포함 또는 형식 불법) | Header 값 수정 후 재시도 |
| `ErrInvalidTimeout` | 타임아웃 값이 음수이거나 30분 상한 초과 | 합법적 범위 `[0, 30min]`으로 조정 |
| `ErrInvalidRetry` | 재시도 구성 불법(MaxRetries가 0-10 외, BackoffFactor가 1.0-10.0 외) | 재시도 매개변수 수정 |
| `ErrInvalidConnection` | 연결 구성 불법(연결 풀 크기 범위 초과, 프록시 URL 형식 오류) | 연결 매개변수 수정 |
| `ErrInvalidSecurity` | 보안 구성 불법(응답 본문 크기 제한 범위 초과) | 보안 매개변수 수정 |
| `ErrInvalidMiddleware` | 미들웨어 구성 불법(리다이렉트 횟수 50 초과, UserAgent가 너무 길거나 제어 문자 포함) | 미들웨어 매개변수 수정 |
| `ErrEmptyFilePath` | 다운로드 시 파일 경로 미지정 | `DownloadConfig.FilePath` 설정 |
| `ErrFileExists` | 대상 파일이 이미 존재하며 `Overwrite=false`, `ResumeDownload=false` | 덮어쓰기 또는 이어받기 설정, 또는 경로 변경 |
| `ErrResponseBodyEmpty` | 응답 본문이 비어 있을 때 `Unmarshal()` 등 파싱 메서드 호출 | 파싱 전에 `RawBody` 먼저 확인 |
| `ErrResponseBodyTooLarge` | 응답 본문이 `MaxResponseBodySize` 제한 초과 | 제한 증가 또는 인터페이스로 페이징 조회 |

:::tip 구성류 오류 vs 런타임 오류
`ErrInvalid*` 시리즈(`ErrInvalidHeader`/`ErrInvalidTimeout`/`ErrInvalidRetry`/`ErrInvalidConnection`/`ErrInvalidSecurity`/`ErrInvalidMiddleware`)는 구성 검증 오류로, `New()` 호출 시 반환되며 요청 핫 경로에서 발생하지 않아야 합니다. 런타임 오류는 `ClientError` 분류로 처리됩니다.
:::

```go
package main

import (
    "errors"
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://api.example.com/data")

    switch {
    case errors.Is(err, httpc.ErrClientClosed):
        fmt.Println("클라이언트가 닫혔음, 재생성 필요")
    case errors.Is(err, httpc.ErrResponseBodyTooLarge):
        fmt.Println("응답 본문이 너무 큼, MaxResponseBodySize 증가 고려")
    case errors.Is(err, httpc.ErrResponseBodyEmpty):
        fmt.Println("응답 본문이 비어 있음, 파싱 메서드 호출 전 RawBody 확인")
    case errors.Is(err, httpc.ErrInvalidHeader):
        fmt.Println("요청 헤더가 무효, 수정 후 재시도")
    }

    if result != nil {
        fmt.Printf("상태 코드: %d\n", result.StatusCode())
    }
}
```

## URL 자동 마스킹

`ClientError.Error()`는 URL의 민감 정보를 자동으로 제거합니다. 사용자 이름과 비밀번호를 포함한 URL(예: `https://user:pass@host/path`)은 `https://***:***@host/path`로 마스킹되어, 로그와 오류 메시지에 자격 증명이 유출되지 않도록 합니다:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // URL에 자격 증명 정보 포함
    result, err := client.Get("https://admin:s3cret@api.example.com/data")
    if err != nil {
        // 오류 메시지의 자격 증명이 자동으로 마스킹됨:
        // "GET https://***:***@api.example.com/data: network error occurred"
        fmt.Println(err)
    }
    if result != nil {
        fmt.Println(result.StatusCode())
    }
}
```

:::tip 마스킹 적용 범위
마스킹은 `user:pass@host` 형식의 자격 증명뿐 아니라 민감한 쿼리 매개변수(`token`, `key`, `secret` 등)도 처리합니다. 자격 증명이나 민감 매개변수가 없는 URL은 빠른 경로를 통해 파싱을 건너뛰어 불필요한 `url.Parse` 오버헤드를 피합니다.
:::

## panic 복구 안전망

HTTPC는 `Request()`와 `Download()` 메서드에 panic 안전망을 내장했습니다. 엔진, 전송 계층, TLS 라이브러리 또는 미들웨어에서 발생하는 예기치 않은 panic은 모두 캡처되어 `ClientError`로 변환되며, 호출자 프로세스를 충돌시키지 않습니다:

<!-- check-code: skip -->
```go
// client.go 내부 구현(개념적 예시)
func (c *clientImpl) Request(ctx context.Context, method, url string, ...) (*Result, error) {
    defer func() {
        if r := recover(); r != nil {
            result = nil
            err = panicToError(r) // ClientError로 변환
        }
    }()
    // ... 정상 요청 로직
}
```

:::warning 안전망은 미들웨어 복구를 대체하지 않음
내장 안전망은 최후의 방어선으로, panic을 오류로 변환하여 충돌을 방지합니다. 하지만 미들웨어에서 panic이 발생할 수 있다면 추가로 `RecoveryMiddleware()` 사용을 권장합니다 — 미들웨어 체인에서 더 일찍 panic을 캡처하여 더 완전한 로그 컨텍스트를 제공합니다:

<!-- check-code: skip -->
```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.RecoveryMiddleware(),       // 미들웨어 계층 panic 복구
    httpc.LoggingMiddleware(nil),     // 로깅
    httpc.MetricsMiddleware(nil),     // 메트릭
}
```
:::

## 자동 재시도와 오류의 관계

HTTPC의 재시도 엔진은 내부에서 재시도 가능한 오류를 자동으로 처리합니다. 어떤 오류가 자동으로 재시도되는지 이해하면 애플리케이션 계층에서 중복 재시도를 피할 수 있습니다.

### 자동 재시도되는 오류

| 조건 | 재시도 여부 | 설명 |
|------|-----------|------|
| 네트워크 오류(연결 거부, 재설정, EOF) | 예 | `isRetryableNetworkMessage` 매칭 |
| 다이얼/요청 타임아웃 | 예 | `ErrorTypeTimeout` |
| 임시/타임아웃류 DNS 실패 | 예 | `dnsErr.IsTemporary \|\| dnsErr.IsTimeout` |
| 응답 본문 읽기 네트워크 오류 | 예 | 읽기 작업의 `net.OpError` |
| 재시도 가능 HTTP 상태 코드 | 예 | 408/429/500/502/503/504 |
| `ProxyRotateOnStatus` 지정 상태 코드 | 예 | 예: 403이 프록시 순환 트리거 |

### 재시도하지 않는 오류

| 조건 | 재시도 여부 | 설명 |
|------|-----------|------|
| `context.Canceled` | 아니요 | 빠른 경로로 직접 반환 |
| `context.DeadlineExceeded` | 아니요 | 빠른 경로로 직접 반환 |
| TLS 핸드셰이크 실패 | 아니요 | `ErrorTypeTLS`는 재시도 불가 |
| 인증서 검증 실패 | 아니요 | `ErrorTypeCertificate`는 재시도 불가 |
| 구성 검증 오류 | 아니요 | `ErrorTypeValidation`은 재시도 불가 |
| 기타 4xx 클라이언트 오류 | 아니요 | 예: 400/401/403/404 |

:::tip context 취소는 빠른 경로
`isRetryableError`는 판단 전에 `context.Canceled`와 `context.DeadlineExceeded`를 먼저 검사합니다 — 매칭되면 직접 false를 반환하며 완전한 오류 분류를 건너뜁니다. 이는 context가 이미 취소되었을 때 리소스를 낭비하며 재시도를 판단하는 것을 방지합니다.
:::

```go
package main

import (
    "context"
    "errors"
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()

    result, err := client.Request(ctx, "GET", "https://api.example.com/slow")
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) {
            if clientErr.Type == httpc.ErrorTypeContextCanceled {
                // context 타임아웃 또는 수동 취소, 자동 재시도되지 않음
                fmt.Println("요청이 취소됨(타임아웃 또는 수동 취소), 재시도하지 않음")
            } else if clientErr.Type == httpc.ErrorTypeTimeout {
                fmt.Println("요청 타임아웃, 자동 재시도 후에도 실패")
            }
        }
        return
    }
    fmt.Println(result.StatusCode())
}
```

## 오류 처리 모범 사례

### 1. 클라이언트 오류와 서버 오류 구분

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://api.example.com/data")
    if err != nil {
        // 네트워크 계층 오류 — 연결, TLS, DNS 등의 문제
        log.Printf("네트워크 계층 오류: %v", err)
        return
    }

    // HTTP 계층 오류 — 응답은 받았으나 상태 코드가 2xx가 아님
    if result.IsClientError() {
        // 4xx: 클라이언트 요청 오류(매개변수 오류, 권한 부족 등)
        log.Printf("클라이언트 오류: %d", result.StatusCode())
    } else if result.IsServerError() {
        // 5xx: 서버 장애(재시도 소진, 상위 서비스 여전히 사용 불가)
        log.Printf("서버 오류: %d", result.StatusCode())
    } else {
        fmt.Printf("성공: %d\n", result.StatusCode())
    }
}
```

### 2. 서킷 브레이커 패턴

특정 서비스가 지속적으로 실패할 때, 서킷 브레이커가 일시적으로 요청을 중단하여 연쇄 장애와 자원 낭비를 방지합니다:

<!-- check-code: skip -->
```go
type CircuitBreaker struct {
    mu           sync.Mutex
    failures     int
    threshold    int           // 연속 실패 임계값
    cooldown     time.Duration // 트립 해제 대기 시간
    trippedAt    time.Time
}

func (cb *CircuitBreaker) Allow() bool {
    cb.mu.Lock()
    defer cb.mu.Unlock()
    if cb.failures >= cb.threshold {
        if time.Since(cb.trippedAt) < cb.cooldown {
            return false // 트립 상태, 요청 거부
        }
        cb.failures = 0 // 대기 시간 경과, 리셋
    }
    return true
}

func (cb *CircuitBreaker) Record(err error) {
    cb.mu.Lock()
    defer cb.mu.Unlock()
    if err != nil {
        cb.failures++
        if cb.failures >= cb.threshold {
            cb.trippedAt = time.Now()
        }
    } else {
        cb.failures = 0 // 성공 시 리셋
    }
}

// 사용 시 IsRetryable 판단과 결합
func requestWithBreaker(client httpc.Client, cb *CircuitBreaker, url string) error {
    if !cb.Allow() {
        return fmt.Errorf("circuit breaker open")
    }
    result, err := client.Get(url)
    cb.Record(err)
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) && !clientErr.IsRetryable() {
            cb.Record(nil) // 재시도 불가능한 오류는 서비스 장애로 간주하지 않음
        }
        return err
    }
    _ = result
    return nil
}
```

### 3. 폴백 대체

주 서비스가 사용 불가능할 때 캐시나 기본값으로 폴백합니다:

<!-- check-code: skip -->
```go
package main

import (
    "errors"
    "log"

    "github.com/cybergodev/httpc"
)

func fetchWithFallback(client httpc.Client, url string, fallback []byte) []byte {
    result, err := client.Get(url)
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) {
            switch clientErr.Type {
            case httpc.ErrorTypeTimeout, httpc.ErrorTypeRetryExhausted:
                log.Printf("주 서비스 사용 불가, 폴백 데이터 사용: %v", err)
                return fallback
            case httpc.ErrorTypeValidation:
                // 검증 오류는 로컬 버그, 폴백하지 않음
                log.Fatalf("요청 구성 오류: %v", err)
            }
        }
        log.Printf("알 수 없는 오류, 폴백 데이터 사용: %v", err)
        return fallback
    }
    return result.RawBody()
}
```

### 4. 미들웨어로 통합 처리

```go
package main

import (
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
        httpc.RecoveryMiddleware(),
        httpc.LoggingMiddleware(&httpc.LoggingConfig{
            LogFunc: func(format string, args ...any) {
                log.Printf("[HTTP] "+format, args...)
            },
        }),
        httpc.MetricsMiddleware(&httpc.MetricsConfig{
            OnMetrics: func(method, url string, statusCode int, duration time.Duration, err error) {
                if err != nil {
                    log.Printf("[METRICS] %s %s 실패: %v (소요 %v)", method, url, err, duration)
                } else {
                    log.Printf("[METRICS] %s %s -> %d (소요 %v)", method, url, statusCode, duration)
                }
            },
        }),
    }

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://api.example.com/data")
    if err != nil {
        log.Fatal(err)
    }
    log.Printf("상태 코드: %d", result.StatusCode())
}
```

### 5. 타임아웃 계층화

HTTPC는 여러 계층의 타임아웃 제어를 제공합니다, 거친 것부터 세밀한 것까지:

<!-- check-code: skip -->
```go
// 제1계층: 클라이언트 기본 타임아웃(모든 요청의 전역 상한)
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 30 * time.Second

// 제2계층: 미들웨어 강제 타임아웃(기본값 덮어쓰기)
timeoutMW := httpc.TimeoutMiddleware(&httpc.TimeoutMiddlewareConfig{
    Duration: 30 * time.Second,
})

// 제3계층: 단일 요청 덮어쓰기(WithTimeout이 미들웨어와 기본값 덮어쓰기)
result, err := client.Get(url, httpc.WithTimeout(10*time.Second))

// 제4계층: context 타임아웃(가장 정밀, 핵심 경로에 권장)
ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
defer cancel()
result, err := client.Request(ctx, "GET", url)
```

:::warning ResponseHeader 타임아웃과 WithTimeout의 상호작용
`Timeouts.ResponseHeader = 0`(기본값)일 때 전송 계층은 응답 헤드 타임아웃을 강제하지 않으며, `WithTimeout`이 완전한 제어권을 갖습니다. 하지만 양수로 설정하면(예: `SecureConfig()`의 10s) 전송 계층에서 모든 요청에 강제 적용되며, `WithTimeout`으로 연장할 수 없습니다 — 이는 slowloris 공격 방어를 위한 설계입니다. AI API 등 긴 응답 시나리오에서는 `ResponseHeader = 0`을 유지하세요.
:::

## 다음 단계

- [재시도와 내결함성](./retry-fault-tolerance) — 백오프 알고리즘 상세와 커스텀 재시도 전략
- [오류 유형 API](../api-reference/types/errors) — 오류 유형과 센티널 변수 완전 참조
- [미들웨어 체인](./middleware-chain) — 미들웨어로 오류 통합 처리
- [구성 API](../api-reference/client-config/config) — 타임아웃과 보안 구성 참조
