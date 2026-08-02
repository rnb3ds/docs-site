---
sidebar_label: "성능 최적화"
title: "성능 최적화 - CyberGo HTTPC | 프리셋과 동시성"
description: "HTTPC 성능 최적화 가이드: Default/Secure/Performance/Minimal 네 가지 프리셋 비교와 시나리오 선택, 프리셋 기반 연결 풀과 타임아웃 매개변수 미세 조정, Result 수명 주기 자동 관리로 GC 부하 감소, 고동시성 요청 패턴과 성능 안티패턴 분석 및 최적화 제안."
sidebar_position: 9
---

# 성능 최적화

HTTPC는 설계 단계부터 고성능을 지향합니다: 연결 풀 재사용, HTTP/2 멀티플렉싱, 객체 풀링, 단일 할당 결과 객체. 대부분의 시나리오에서는 프리셋 구성을 직접 사용하는 것만으로도 우수한 성능을 얻을 수 있으며, 추가 튜닝이 필요할 때는 내부 메커니즘을 이해해야 정확한 처방이 가능합니다.

## 프리셋 구성 비교

HTTPC는 5가지 프리셋 구성을 제공하며, 각각 다른 시나리오에 맞게 체계적으로 조정되었습니다. 아래는 카테고리별로 핵심 필드의 정확한 값을 나열하여 선택 시 비교하기 쉽게 정리한 것입니다.

### 타임아웃 구성

| 필드 | Default | Secure | Performance | Testing | Minimal |
|------|---------|--------|-------------|---------|---------|
| `Timeouts.Request` | 180s | 15s | 60s | 180s | 180s |
| `Timeouts.Dial` | 10s | 5s | 15s | 5s | 5s |
| `Timeouts.TLSHandshake` | 10s | 5s | 15s | 5s | 5s |
| `Timeouts.ResponseHeader` | 0(비활성화) | 10s | 0(비활성화) | 0(비활성화) | 0(비활성화) |
| `Timeouts.IdleConn` | 90s | 30s | 120s | 30s | 30s |

### 연결 구성

| 필드 | Default | Secure | Performance | Testing | Minimal |
|------|---------|--------|-------------|---------|---------|
| `MaxIdleConns` | 50 | 20 | 100 | 10 | 10 |
| `MaxConnsPerHost` | 10 | 5 | 20 | 5 | 2 |
| `EnableHTTP2` | 활성화 | 활성화 | 활성화 | **비활성화** | 활성화 |
| `EnableCookies` | 비활성화 | 비활성화 | 활성화 | 활성화 | 비활성화 |
| `EnableDoH` | 비활성화 | 비활성화 | 비활성화 | 비활성화 | 비활성화 |

### 보안 구성

| 필드 | Default | Secure | Performance | Testing | Minimal |
|------|---------|--------|-------------|---------|---------|
| `MaxResponseBodySize` | 10MB | 5MB | 50MB | 10MB | 1MB |
| `MaxDecompressedBodySize` | 100MB | 100MB | 100MB | 100MB | 100MB |
| `ValidateURL` | 활성화 | 활성화 | 활성화 | **비활성화** | 활성화 |
| `ValidateHeaders` | 활성화 | 활성화 | 활성화 | **비활성화** | 활성화 |
| `StrictContentLength` | 활성화 | 활성화 | 비활성화 | 활성화 | 활성화 |
| `AllowPrivateIPs` | false | false | false | **true** | false |
| `InsecureSkipVerify` | false | false | false | **true** | false |

### 재시도 구성

| 필드 | Default | Secure | Performance | Testing | Minimal |
|------|---------|--------|-------------|---------|---------|
| `MaxRetries` | 3 | 1 | 3 | 1 | 0 |
| `Delay` | 1s | 2s | 500ms | 100ms | 0 |
| `BackoffFactor` | 2.0 | 2.0 | 1.5 | 2.0 | 1.0 |
| `MaxRetryDelay` | 30s | 30s | 30s | 30s | 30s |
| `EnableJitter` | 활성화 | 활성화 | 활성화 | 비활성화 | 비활성화 |

### 요청 기본값

| 필드 | Default | Secure | Performance | Testing | Minimal |
|------|---------|--------|-------------|---------|---------|
| `FollowRedirects` | 활성화 | **비활성화** | 활성화 | 활성화 | **비활성화** |
| `MaxRedirects` | 10 | 10 | 10 | 10 | 10 |
| `UserAgent` | `httpc/1.0` | `httpc/1.0` | `httpc/1.0` | `httpc-test/1.0` | `httpc/1.0` |

:::warning TestingConfig는 프로덕션 사용 금지
`TestingConfig()`는 URL/Header 검증, TLS 인증서 검증, SSRF 방어를 비활성화하므로 로컬 개발과 테스트 용도로만 사용해야 합니다. 비테스트 환경에서 호출하면 보안 경고가 출력됩니다. 프로덕션 환경에서는 `SecureConfig()` 또는 `DefaultConfig()`를 사용하세요.
:::

## 시나리오별 선택

| 시나리오 | 추천 프리셋 | 조정 제안 |
|----------|------------|----------|
| 범용 웹 서비스 | Default | — |
| 사용자 제공 URL 처리 | Secure | — |
| 내부 마이크로서비스 고동시성 | Performance | 백엔드 수에 따라 `MaxIdleConns` 증가 |
| 일회성 스크립트 | Minimal | — |
| 파일 다운로드 서비스 | Performance | `MaxResponseBodySize` 증가 |
| 금융/의료 API | Secure + 커스텀 | 감사 미들웨어 추가 |
| 로컬 개발/단위 테스트 | Testing | 프로덕션 배포 금지 |

<!-- check-code: skip -->
```go
// 고처리량 시나리오에서 프리셋 직접 사용
client, _ := httpc.New(httpc.PerformanceConfig())

// 프리셋 기반으로 단일 필드 미세 조정
cfg := httpc.PerformanceConfig()
cfg.Timeouts.Request = 120 * time.Second
cfg.Connection.MaxIdleConns = 200
client, _ := httpc.New(cfg)
```

## 연결 풀 튜닝 원리

연결 풀은 HTTP 클라이언트 성능의 핵심입니다. HTTPC의 연결 풀은 Go 표준 라이브러리의 `http.Transport`를 기반으로 하지만, 그 위에 자동 계산 로직과 안전한 기본값을 추가했습니다.

### 유휴 연결 자동 계산

`MaxIdleConnsPerHost`(호스트당 유휴 연결 상한)는 수동으로 설정할 필요가 없습니다 — HTTPC가 `MaxConnsPerHost`에 따라 자동으로 도출합니다:

```
유휴 연결 수 = MaxConnsPerHost / 2, [2, 10] 구간으로 제한
```

구체적인 규칙(`calculateIdleConnsPerHost`):

| MaxConnsPerHost | 자동 유휴 연결 수 | 설명 |
|-----------------|-------------------|------|
| 0(무제한) | 10 | 상한 기본값 사용 |
| 1 | 2 | 하한 미만으로 내려가지 않음 |
| 2 | 2 | 하한과 정확히 일치 |
| 5 | 2 | 절반은 하한으로 적용 |
| 10 | 5 | Default 프리셋 |
| 20 | 10 | Performance 프리셋, 상한 적용 |
| 100 | 10 | 상한 초과 시 10 적용 |

:::tip 왜 MaxConnsPerHost / 2인가
유휴 연결은 "연결의 캐시"입니다 — 이미 설정되었지만 현재 사용되지 않는 연결입니다. 최대 연결 수의 절반으로 설정하면 "기존 연결 재사용"(캐시 적중)과 "새 연결 생성"(캐시 미스 시 재핸드셰이크 필요) 사이에서 균형을 잡고, 유휴 연결이 너무 많아 서버 측 자원을 점유하는 것을 방지합니다.
:::

### TCP Keep-Alive

HTTPC의 연결 풀은 30초 TCP keep-alive 간격(`defaultKeepAlive = 30 * time.Second`)을 고정으로 사용합니다. 이 값은 연결 설정 후 운영체제가 주기적으로 keep-alive 프로브 패킷을 보내 죽은 연결을 감지합니다. `IdleConn` 타임아웃은 유휴 연결이 풀에 머무는 시간을 제어하며(Default는 90s), 두 값이 함께 작동합니다.

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    // 마이크로서비스 고 QPS 시나리오: 연결 풀 확대
    cfg := httpc.PerformanceConfig()
    cfg.Connection.MaxIdleConns = 200         // 전역 유휴 연결 상한
    cfg.Connection.MaxConnsPerHost = 50       // 호스트당 최대 연결 (유휴는 자동으로 10으로 계산)
    cfg.Timeouts.IdleConn = 300 * time.Second // 유휴 연결이 더 오래 유지되어 재사용률 향상

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // 핫 경로 요청은 연결 풀의 연결을 직접 재사용
    for i := 0; i < 100; i++ {
        result, err := client.Get("https://api.example.com/data")
        if err != nil {
            log.Printf("요청 %d 실패: %v", i, err)
            continue
        }
        fmt.Printf("요청 %d: %d\n", i, result.StatusCode())
    }
}
```

## HTTP/2 성능 이점

HTTP/2는 기본적으로 활성화되어 있으며(`EnableHTTP2 = true`), 세 가지 주요 성능 향상을 제공합니다:

| 특징 | HTTP/1.1 | HTTP/2 |
|------|----------|--------|
| 멀티플렉싱 | 각 요청이 연결 독점 | 여러 요청이 단일 연결 공유 |
| 헤더 압축 | 평문 반복 전송 | HPACK 헤더 압축 |
| 연결 재사용 | Keep-alive 직렬 | 병렬 스트림 |

:::tip HTTP/2와 연결 풀의 관계
HTTP/2의 멀티플렉싱은 단일 TCP 연결로 여러 요청을 동시에 처리할 수 있게 하여, 연결 설정 오버헤드를 대폭 줄입니다. 동일한 호스트에 대한 고동시성 시나리오에서 HTTP/2의 처리량은 HTTP/1.1을 훨씬 능가합니다. `TestingConfig()`(HTTP/2를 명시적으로 비활성화)를 사용하거나 연결이 ALPN 협상을 지원하지 않는 경우에만 HTTP/1.1로 폴백합니다.
:::

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    // 기본 구성으로 이미 HTTP/2 활성화됨
    cfg := httpc.DefaultConfig()
    cfg.Connection.EnableHTTP2 = true // 기본값이 true, 명시적 선언이 더 명확

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // HTTP/2를 지원하는 사이트(대부분의 CDN/클라우드 서비스)에 동시 요청
    // 단일 TCP 연결을 재사용, 각 요청마다 새 연결 불필요
    start := time.Now()
    for i := 0; i < 10; i++ {
        result, err := client.Get("https://http2.golang.org/")
        if err != nil {
            log.Printf("요청 %d 실패: %v", i, err)
            continue
        }
        // Proto()는 프로토콜 버전 반환, 예: "HTTP/2.0"
        fmt.Printf("요청 %d: %s, 상태 코드 %d\n", i, result.Proto(), result.StatusCode())
    }
    fmt.Printf("10개 요청 소요 시간: %v\n", time.Since(start))
}
```

## 메모리 최적화 메커니즘

HTTPC는 메모리 관리에서 다층 최적화를 수행하며, 핵심 아이디어는 힙 할당 감소와 객체 재사용입니다.

### resultBundle 단일 할당

각 요청이 반환하는 `*Result`는 세 개의 중첩 구조체를 가집니다: `RequestInfo`(요청 정보), `ResponseInfo`(응답 정보), `RequestMeta`(소요 시간 등 메타데이터). 전통적인 방식에서는 Result와 세 개의 중첩 구조체 각각에 할당이 필요합니다 — 네 번의 힙 할당입니다. HTTPC는 이를 하나의 `resultBundle`로 패키징하여 한 번의 힙 할당으로 모두 해결합니다:

```
전통 방식: 4회 독립 할당 (Result + RequestInfo + ResponseInfo + RequestMeta)
HTTPC: 1회 할당 (resultBundle), Result의 세 포인터가 동일한 메모리를 가리킴
```

호출자가 받는 것은 `*Result`이며, 그 `Request`, `Response`, `Meta` 필드(포인터)는 bundle 내의 해당 구조체를 가리키며 완전히 투명합니다. 호출자가 `*Result`를 장기 보유할 수 있으므로 여기서는 객체 풀을 사용하지 않습니다(풀링은 데이터 경합을 유발), GC가 자동 회수합니다.

### 엔진 객체 풀

HTTPC 엔진 계층은 짧은 수명 주기의 객체를 재사용하기 위해 `sync.Pool`을 광범위하게 사용하여 GC 부하를 줄입니다:

| 풀링 객체 | 용도 | 설명 |
|----------|------|------|
| `engine.Response` | 응답 객체 | 요청 완료 후 풀에 반환, 다음 요청에서 재사용 |
| `engine.Request` | 요청 객체 | 동일 |
| `strings.Builder` | 문자열 빌드 | URL 빌드, 오류 포맷, Config 직렬화 |
| `http.Header` | HTTP 헤더 map | 요청/응답 헤더 처리 |
| `bytes.Buffer` | JSON/multipart 인코딩 | 초기 용량으로 사전 할당 |
| `time.Timer` | 재시도 타이머 | 빈번한 타이머 생성 방지 |
| gzip/flate reader | 압축 해제 | 압축 해제기 재사용 |

:::tip 객체 풀과 resultBundle의 역할 분담
엔진 내부 객체(Response/Request/Builder)는 수명 주기가 짧고 요청 내부에서 borrow-return 순환을 완료하므로 풀링에 적합합니다. 호출자에게 반환되는 `*Result`는 수명 주기가 불확실하여 단일 할당 + GC 회수에 적합합니다. 두 방식이 상호 보완적으로 각자의 장점을 취합니다.
:::

### 사용자가 신경 쓸 필요 없는 부분

위 최적화는 호출자에게 완전히 투명합니다. 평소처럼 API를 사용하기만 하면, 연결 재사용, 객체 풀링, 단일 할당이 모두 내부에서 자동으로 이루어집니다:

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

    // Result는 매 요청마다 새로 생성, GC가 자동 회수, 수동 해제 불필요
    result, err := client.Get("https://api.example.com/data")
    if err != nil {
        log.Fatal(err)
    }

    // 핫 경로에서는 Body() 대신 RawBody() 우선 사용
    // RawBody()는 원시 바이트 슬라이스 반환; Body()는 사전 저장된 문자열 반환; String()은 디버그 포맷(오버헤드 최대)
    data := result.RawBody()
    fmt.Printf("응답 크기: %d 바이트\n", len(data))
    fmt.Printf("요청 소요 시간: %v\n", result.Meta.Duration)
}
```

## 워크로드 튜닝 예시

### AI API 롱 폴링

AI 추론 API 응답 시간은 수 분에 달할 수 있어 타임아웃 제한을 완화해야 합니다:

<!-- check-code: skip -->
```go
// AI API는 5-15분 응답 시간이 걸릴 수 있음, 기본 180s 타임아웃에 잘리지 않도록
result, err := httpc.Post("https://api.ai.example.com/v1/completions",
    httpc.WithJSON(payload),
    httpc.WithTimeout(900*time.Second), // 15분
)
```

:::warning Default의 ResponseHeader가 0인 이유
`Timeouts.ResponseHeader = 0`은 전송 계층에서 응답 헤더 타임아웃을 강제하지 않음을 의미하며, context 수준 타임아웃(`Timeouts.Request` 또는 `WithTimeout`)이 통일되게 제어합니다. 이는 `WithTimeout()`이 긴 응답 요청에 대해 완전한 제어권을 갖도록 보장합니다. slowloris 공격에 대한 전송 계층 방어가 필요하면 `SecureConfig()`(10s로 설정)를 사용하세요.
:::

### 마이크로서비스 고 QPS

내부 마이크로서비스 간 고빈도 호출에는 대형 연결 풀이 필요합니다:

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.PerformanceConfig()
    // 백엔드 인스턴스 수에 따라 연결 풀 튜닝
    cfg.Connection.MaxIdleConns = 300   // 총 유휴 연결
    cfg.Connection.MaxConnsPerHost = 30 // 백엔드 인스턴스당
    // 마이크로서비스 응답은 보통 빠름, 타임아웃 단축으로 빠른 실패
    cfg.Timeouts.Request = 10 * time.Second
    cfg.Retry.Delay = 200 * time.Millisecond
    cfg.Retry.BackoffFactor = 2.0
    cfg.Retry.MaxRetries = 2

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    start := time.Now()
    // 고빈도 요청이 연결 풀 재사용, TCP/TLS 재구축 불필요
    for i := 0; i < 50; i++ {
        result, err := client.Get("http://user-service:8080/api/users")
        if err != nil {
            log.Printf("요청 %d 실패: %v", i, err)
            continue
        }
        _ = result
    }
    fmt.Printf("50개 요청 소요 시간: %v\n", time.Since(start))
}
```

### 대용량 파일 다운로드(스트리밍)

대용량 파일 다운로드 시 `WithStreamBody(true)`를 사용하여 전체 응답을 메모리에 로드하는 것을 피하고, `Download()` 메서드와 함께 중단 이어받기를 지원합니다:

```go
package main

import (
    "context"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.PerformanceConfig()
    cfg.Security.MaxResponseBodySize = 500 * 1024 * 1024 // 500MB 상한

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    dcfg := httpc.DefaultDownloadConfig()
    dcfg.FilePath = "/tmp/large-file.zip"
    dcfg.ResumeDownload = true // 중단 이어받기

    result, err := client.Download(
        context.Background(),
        "https://example.com/large-file.zip",
        dcfg,
    )
    if err != nil {
        log.Fatal(err)
    }
    log.Printf("다운로드 완료: %d 바이트", result.BytesWritten)
}
```

### 크롤러와 프록시 풀

크롤러 시나리오에서 프록시 풀로 IP를 순환하면, HTTPC는 자동으로 재시도 횟수를 늘려 각 프록시를 최소 한 번 시도하도록 보장합니다(자세한 내용은 [재시도와 내결함성](./retry-fault-tolerance#프록시-풀과-재시도-상호작용) 참조):

<!-- check-code: skip -->
```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyPool = []string{
    "http://proxy1:8080",
    "http://proxy2:8080",
    "http://proxy3:8080",
    "http://proxy4:8080",
    "http://proxy5:8080",
}
cfg.Connection.ProxyRotateOnStatus = []int{403} // 403 시 프록시 교체
cfg.Connection.ProxyPoolStrategy = httpc.ProxyStrategyRoundRobin
// MaxRetries가 자동으로 4로 증가(프록시 수-1), 5개 프록시 모두 시도 보장
```

## 성능 안티패턴

| 안티패턴 | 원인 | 올바른 방법 |
|----------|------|------------|
| 요청마다 Client 생성 | 연결 재사용 불가, 매번 TCP/TLS 핸드셰이크 | 전역 단일 Client 인스턴스 재사용 |
| 과도한 `MaxResponseBodySize` | 불필요하게 메모리 상한 완화 | 실제 응답 크기에 맞게 설정 |
| 핫 경로에서 `result.String()` 사용 | 추가 문자열 빌드 오버헤드 | `result.Body()` 또는 `result.RawBody()` 사용 |
| 연결 풀이 너무 작음 | 고동시성 시 연결 부족, 대기 발생 | `MaxConnsPerHost`를 동시성에 맞게 조정 |
| HTTP/2 비활성화 | HTTP/1.1 직렬 요청으로 퇴보 | 기본 활성화 유지 |
| `Close()` 무시 | 연결 누수 | `defer client.Close()` |
| 전역 공유 후 재사용 잊음 | Client 반복 생성/소멸 | 한 번 생성, 장기 보유 |

:::warning Client는 반드시 재사용
HTTP 성능의 근간은 연결 재사용입니다. 요청마다 새 Client를 생성하면 매번 TCP 3-way 핸드셰이크 + TLS 핸드셰이크를 수행해야 하며, 지연 시간이 서브밀리초에서 수십 밀리초로 급증합니다. 마이크로서비스 시나리오에서는 Client를 싱글톤으로 서비스 구조체에 주입하고, 서비스 수명 주기와 함께 유지하세요.
:::

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

// 안티패턴 데모: 요청마다 Client 생성
func main() {
    start := time.Now()

    for i := 0; i < 5; i++ {
        // ❌ 매 루프마다 Client 생성 — 연결 재사용 불가
        client, err := httpc.NewDefault()
        if err != nil {
            log.Fatal(err)
        }
        result, err := client.Get("https://httpbin.org/get")
        client.Close() // 매번 닫기, 연결 풀 비움
        if err != nil {
            log.Printf("요청 %d 실패: %v", i, err)
            continue
        }
        _ = result
    }
    // 5개 요청 소요 시간이 Client 재사용 방식보다 훨씬 높음
    fmt.Printf("안티패턴 소요 시간: %v\n", time.Since(start))

    // ✅ 올바른 방법: Client 재사용
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    start = time.Now()
    for i := 0; i < 5; i++ {
        result, err := client.Get("https://httpbin.org/get")
        if err != nil {
            log.Printf("요청 %d 실패: %v", i, err)
            continue
        }
        _ = result
    }
    fmt.Printf("재사용 방식 소요 시간: %v\n", time.Since(start))
}
```

## 다음 단계

- [연결 풀과 프록시](./connection-pool) — 연결 풀 매개변수 상세, 프록시 풀 구성과 순환 전략
- [오류 처리](./error-handling) — 타임아웃 계층화 전략과 오류 분류
- [재시도와 내결함성](./retry-fault-tolerance) — 백오프 알고리즘 상세와 재시도 예산
- [보안 개요](../security/) — 보안과 성능의 균형
