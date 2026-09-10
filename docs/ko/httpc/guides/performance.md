---
sidebar_label: "성능 최적화"
title: "성능 최적화 - CyberGo HTTPC | 프리셋과 동시성"
description: "HTTPC 성능 최적화 가이드: 5가지 프리셋 비교와 시나리오 선택, 연결 풀 유휴 연결 자동 도출 규칙, 동시성 모델과 세마포어 제어 전체 예제, 타임아웃 예산 계층화 권장, 제로 할당 핫 패스, 객체 풀과 resultBundle 메커니즘, 성능 안티패턴 분석."
sidebar_position: 12
---

# 성능 최적화

HTTPC 는 설계부터 고성능을 지향합니다: 연결 풀 재사용, HTTP/2 멀티플렉싱, 객체 풀링, 단일 할당 결과 객체. 대부분의 시나리오에서는 프리셋 구성을 그대로 사용해도 훌륭한 성능을 얻습니다; 추가 튜닝이 필요할 때는 하위 메커니즘을 이해해야 대증 처방이 가능합니다.

## 프리셋 구성 비교

HTTPC 는 5가지 프리셋 구성을 제공하며, 각각 다른 시나리오에 맞게 체계적으로 조정되어 있습니다. 아래에 카테고리별로 핵심 필드의 정확한 값을 나열해 선택 시 대조하기 쉽게 합니다.

### 타임아웃 구성

| 필드 | Default | Secure | Performance | Testing | Minimal |
|------|---------|--------|-------------|---------|---------|
| `TimeoutConfig.Request` | 180s | 15s | 60s | 180s | 180s |
| `TimeoutConfig.Dial` | 10s | 5s | 15s | 5s | 5s |
| `TimeoutConfig.TLSHandshake` | 10s | 5s | 15s | 5s | 5s |
| `TimeoutConfig.ResponseHeader` | 0(비활성화) | 10s | 0(비활성화) | 0(비활성화) | 0(비활성화) |
| `TimeoutConfig.IdleConn` | 90s | 30s | 120s | 30s | 30s |

### 연결 구성

| 필드 | Default | Secure | Performance | Testing | Minimal |
|------|---------|--------|-------------|---------|---------|
| `MaxIdleConns` | 50 | 20 | 100 | 10 | 10 |
| `MaxConnsPerHost` | 10 | 5 | 20 | 5 | 2 |
| `EnableHTTP2` | 켜짐 | 켜짐 | 켜짐 | **꺼짐** | 켜짐 |
| `EnableCookies` | 꺼짐 | 꺼짐 | 켜짐 | 켜짐 | 꺼짐 |
| `EnableDoH` | 꺼짐 | 꺼짐 | 꺼짐 | 꺼짐 | 꺼짐 |

### 보안 구성

| 필드 | Default | Secure | Performance | Testing | Minimal |
|------|---------|--------|-------------|---------|---------|
| `MaxResponseBodySize` | 10MB | 5MB | 50MB | 10MB | 1MB |
| `MaxDecompressedBodySize` | 100MB | 100MB | 100MB | 100MB | 100MB |
| `ValidateURL` | 켜짐 | 켜짐 | 켜짐 | **꺼짐** | 켜짐 |
| `ValidateHeaders` | 켜짐 | 켜짐 | 켜짐 | **꺼짐** | 켜짐 |
| `StrictContentLength` | 켜짐 | 켜짐 | 꺼짐 | 켜짐 | 켜짐 |
| `AllowPrivateIPs` | false | false | false | **true** | false |
| `InsecureSkipVerify` | false | false | false | **true** | false |

### 재시도 구성

| 필드 | Default | Secure | Performance | Testing | Minimal |
|------|---------|--------|-------------|---------|---------|
| `MaxRetries` | 3 | 1 | 3 | 1 | 0 |
| `Delay` | 1s | 2s | 500ms | 100ms | 0 |
| `BackoffFactor` | 2.0 | 2.0 | 1.5 | 2.0 | 1.0 |
| `MaxRetryDelay` | 30s | 30s | 30s | 30s | 30s |
| `EnableJitter` | 켜짐 | 켜짐 | 켜짐 | 꺼짐 | 꺼짐 |

### 요청 기본값

| 필드 | Default | Secure | Performance | Testing | Minimal |
|------|---------|--------|-------------|---------|---------|
| `FollowRedirects` | 켜짐 | **꺼짐** | 켜짐 | 켜짐 | **꺼짐** |
| `MaxRedirects` | 10 | 10 | 10 | 10 | 10 |
| `UserAgent` | `httpc/1.0` | `httpc/1.0` | `httpc/1.0` | `httpc-test/1.0` | `httpc/1.0` |

:::warning TestingConfig 은 프로덕션 사용 금지
`TestingConfig()`은 URL/Header 검증, TLS 인증서 검증, SSRF 방어를 끄므로 로컬 개발과 테스트 전용입니다. 테스트가 아닌 환경에서 호출하면 보안 경고가 출력됩니다. 프로덕션에서는 `SecureConfig()` 또는 `DefaultConfig()`를 사용하세요.
:::

## 시나리오별 선택

| 시나리오 | 추천 프리셋 | 조정 제안 |
|------|----------|----------|
| 일반 웹 서비스 | Default | — |
| 사용자가 제공한 URL 처리 | Secure | — |
| 내부 마이크로서비스 고동시성 | Performance | 백엔드 수에 맞춰 `MaxIdleConns` 증가 |
| 일회성 스크립트 | Minimal | — |
| 파일 다운로드 서비스 | Performance | `MaxResponseBodySize` 증가 |
| 금융/의료 API | Secure + 커스텀 | 감사 미들웨어 추가 |
| 로컬 개발/단위 테스트 | Testing | 프로덕션 배포 금지 |

<!-- check-code: skip -->
```go
// 고처리량 시나리오는 프리셋을 바로 사용
client, _ := httpc.New(httpc.PerformanceConfig())

// 프리셋을 기준으로 개별 필드 미세 조정
cfg := httpc.PerformanceConfig()
cfg.Timeouts.Request = 120 * time.Second
cfg.Connection.MaxIdleConns = 200
client, _ := httpc.New(cfg)
```

## 동시성 모델: 하나의 Client 로 모든 goroutine 서비스

HTTPC 의 `Client` 와 `DomainClient`는 모두 **동시성 안전**합니다 — 임의의 메서드를 여러 goroutine 이 동시에 호출할 수 있으며, 라이브러리에는 전용 동시성 안전 통합 테스트(`internal/concurrency`)가 있어 고동시성 시나리오에서 공개 API 를 커버합니다. 따라서 올바른 동시성 패턴은 매우 단순합니다:

```
전역/서비스 수준에서 Client 1개 생성
        │
        ├── goroutine 1 ──┐
        ├── goroutine 2 ──┼── 같은 연결 풀과 객체 풀 공유
        └── goroutine N ──┘
```

동시 용량과 연결 풀의 관계:

| 시나리오 | 동작 |
|------|------|
| 동시 수 ≤ `MaxConnsPerHost`(HTTP/1.1) | 각 요청이 연결을 독점, 서로 대기하지 않음 |
| 동시 수 > `MaxConnsPerHost`(HTTP/1.1) | 초과 요청은 전송 계층에서 유휴 연결을 **대기열에서 기다림**(오류는 아니지만 지연 증가) |
| HTTP/2 켜짐(기본) | 같은 호스트의 요청이 단일 연결 멀티플렉싱을 공유, `MaxConnsPerHost`가 병목이 되는 경우는 드묾 |

:::tip 동시성 상한을 조정하는 두 가지 방법
- **클라이언트 측 제어**: `Connection.MaxConnsPerHost`를 피크 동시 수 이상으로 조정(HTTP/1.1 시나리오);
- **호출 측 제어**: 버퍼 있는 channel 을 세마포어로 사용해 동시성을 제한(아래 전체 예제), 다운스트림 서비스를 능동적으로 보호합니다.
둘은 흔히 함께 사용합니다: 세마포어는 다운스트림 감내력에 맞춰 흐름을 제한하고, 연결 풀은 세마포어 상한에 맞춰 연결을 배치합니다.
:::

```go
package main

import (
	"fmt"
	"log"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"time"

	"github.com/cybergodev/httpc"
)

func main() {
	// 로컬 모의 서버: 각 요청은 50ms 고정 소요
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(50 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	cfg := httpc.DefaultConfig()
	cfg.Security.AllowPrivateIPs = true // 127.0.0.1 로컬 테스트 서버 연결 허용
	client, err := httpc.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer client.Close()

	const (
		total       = 20
		maxInFlight = 5 // 세마포어: 동시 진행 요청 최대 5개
	)

	sem := make(chan struct{}, maxInFlight)
	var wg sync.WaitGroup
	var okCount int64
	start := time.Now()

	for i := 0; i < total; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}                // 세마포어 획득
			defer func() { <-sem }()         // 세마포어 해제

			result, err := client.Get(server.URL)
			if err != nil {
				return
			}
			if result.IsSuccess() {
				atomic.AddInt64(&okCount, 1)
			}
		}()
	}
	wg.Wait()

	fmt.Printf("%d/%d 성공, 소요 %v(직렬이라면 약 %v)\n",
		okCount, total, time.Since(start), total*50*time.Millisecond)
	// 출력 예시: 20/20 성공, 소요 약 250ms(직렬이라면 약 1s) — 5중 동시성으로 약 5배 처리량
}
```

독립적인 URL 을 대량으로 가져올 때 자주 쓰는 또 다른 패턴은 **worker pool** 입니다: 고정된 수의 worker goroutine 이 jobs channel 에서 작업을 소비하므로, 동시성이 자연스럽게 worker 수에 묶여 세마포어가 필요 없습니다. 전체 구현은 [고급 예제](../examples/advanced-usage)를 참조하세요.

## 연결 풀 튜닝 원리

연결 풀은 HTTP 클라이언트 성능의 핵심입니다. HTTPC 의 연결 풀은 Go 표준 라이브러리의 `http.Transport` 기반이지만, 그 위에 자동 계산 로직과 안전한 기본값을 더했습니다.

### 유휴 연결 자동 계산

`MaxIdleConnsPerHost`(호스트당 유휴 연결 상한)는 수동 설정이 필요 없습니다 — HTTPC 가 `MaxConnsPerHost`에 따라 자동 도출합니다:

```
유휴 연결 수 = MaxConnsPerHost / 2, [2, 10] 구간으로 제한
```

구체적 규칙(`calculateIdleConnsPerHost`):

| MaxConnsPerHost | 자동 유휴 연결 수 | 설명 |
|-----------------|---------------|------|
| 0(무제한) | 10 | 상한 기본값 사용 |
| 1 | 1 | 먼저 하한 2를 취한 뒤 「최대 연결 수 초과 금지」에 의해 1로 되돌아옴 |
| 2 | 2 | 하한과 정확히 같음 |
| 5 | 2 | 절반이 하한에 해당 |
| 10 | 5 | Default 프리셋 |
| 20 | 10 | Performance 프리셋, 상한 채택 |
| 100 | 10 | 상한 초과 시 10 |

:::tip 왜 MaxConnsPerHost / 2 인가
유휴 연결은 「연결의 캐시」입니다 — 이미 수립되었지만 잠시 쓰이지 않는 연결이죠. 최대 연결 수의 절반으로 설정하면 「기존 연결 재사용」(캐시 적중)과 「새 연결 수립」(캐시 미스 시 재핸드셰이크 필요) 사이의 균형을 잡아, 유휴 연결이 과도해 서버 측 리소스를 점유하는 것을 막습니다.
:::

### TCP Keep-Alive

HTTPC 의 연결 풀은 30초 TCP keep-alive 간격으로 고정됩니다(`defaultKeepAlive = 30 * time.Second`). 이 값은 연결 수립 후 운영체제가 주기적으로 keep-alive 탐침 패킷을 보내 죽은 연결을 감지하게 합니다. `IdleConn` 타임아웃은 유휴 연결이 풀에 살아 있는 시간을 제어하며(Default 는 90s), 둘이 협력해 동작합니다.

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    // 마이크로서비스 고 QPS 시나리오: 연결 풀 증가
    cfg := httpc.PerformanceConfig()
    cfg.Connection.MaxIdleConns = 200   // 전역 유휴 연결 상한
    cfg.Connection.MaxConnsPerHost = 50 // 호스트당 최대 연결(유휴는 자동 계산되어 10)
    cfg.Timeouts.IdleConn = 300 * time.Second // 유휴 연결이 더 오래 살아 재사용률 향상

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // 핫 패스 요청은 풀의 연결을 바로 재사용
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

HTTP/2 는 기본 켜져 있습니다(`EnableHTTP2 = true`), 세 가지 성능 향상을 제공합니다:

| 특성 | HTTP/1.1 | HTTP/2 |
|------|----------|--------|
| 멀티플렉싱 | 각 요청이 연결 독점 | 여러 요청이 단일 연결 공유 |
| 헤더 압축 | 평문 반복 전송 | HPACK 헤더 압축 |
| 연결 재사용 | Keep-alive 직렬 | 병렬 스트림(stream) |

:::tip HTTP/2 와 연결 풀의 관계
HTTP/2 멀티플렉싱은 하나의 TCP 연결이 여러 요청을 동시에 실을 수 있게 하여, 연결 수립 오버헤드를 크게 줄입니다. 같은 호스트에 고동시성으로 요청하는 시나리오에서 HTTP/2 의 처리량은 HTTP/1.1 을 크게 앞섭니다. `TestingConfig()` 사용 시(HTTP/2 명시적 비활성화)나 연결이 ALPN 협상을 지원하지 않을 때만 HTTP/1.1 로 폴백합니다.
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
    // 기본 구성은 이미 HTTP/2 활성화
    cfg := httpc.DefaultConfig()
    cfg.Connection.EnableHTTP2 = true // 기본값이 true 이지만 명시가 더 명확

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // HTTP/2 를 지원하는 사이트(대부분의 CDN/클라우드 서비스)에 동시 요청
    // 단일 TCP 연결을 재사용하며 요청마다 새 연결이 필요 없음
    start := time.Now()
    for i := 0; i < 10; i++ {
        result, err := client.Get("https://http2.golang.org/")
        if err != nil {
            log.Printf("요청 %d 실패: %v", i, err)
            continue
        }
        // Proto() 는 프로토콜 버전 반환, 예: "HTTP/2.0"
        fmt.Printf("요청 %d: %s, 상태 코드 %d\n", i, result.Proto(), result.StatusCode())
    }
    fmt.Printf("10개 요청 소요: %v\n", time.Since(start))
}
```

## 메모리 최적화 메커니즘

HTTPC 는 메모리 관리에 여러 겹의 최적화를 적용했으며, 핵심 접근은 힙 할당을 줄이고 객체를 재사용하는 것입니다.

### resultBundle 단일 할당

매 요청이 반환하는 `*Result`는 세 개의 중첩 구조체를 담습니다: `RequestInfo`(요청 정보), `ResponseInfo`(응답 정보), `RequestMeta`(소요 시간 등 메타데이터). 전통적 방식은 Result 와 세 중첩 구조체에 각각 할당이 필요합니다 — 네 번의 힙 할당이죠. HTTPC 는 이들을 하나의 `resultBundle`로 묶어 한 번의 힙 할당으로 전부 해결합니다:

```
전통 방식: 독립 할당 4회(Result + RequestInfo + ResponseInfo + RequestMeta)
HTTPC: 할당 1회(resultBundle), Result 의 세 포인터가 같은 메모리를 가리킴
```

호출자가 받는 것은 `*Result`이며, 그 `Request`, `Response`, `Meta` 필드(포인터)는 bundle 안의 대응 구조체를 가리켜 완전히 투명합니다. 호출자가 `*Result`를 장기간 보유할 수 있어 여기에는 객체 풀이 맞지 않고(풀링하면 데이터 경쟁 발생), GC 가 자동 회수합니다.

### 엔진 객체 풀

HTTPC 엔진 계층은 `sync.Pool`을 폭넓게 사용해 수명이 짧은 객체를 재사용하고 GC 부하를 줄입니다:

| 풀링 객체 | 용도 | 설명 |
|----------|------|------|
| `engine.Response` | 응답 객체 | 요청 완료 후 풀에 반납, 다음 요청에서 재사용 |
| `engine.Request` | 요청 객체 | 위와 동일 |
| `strings.Builder` | 문자열 구성 | URL 구성, 오류 포맷팅, Config 직렬화 |
| `http.Header` | HTTP 헤더 map | 요청/응답 헤더 처리 |
| `bytes.Buffer` | JSON/multipart 인코딩 | 초기 용량 기준 사전 할당 |
| `time.Timer` | 재시도 타이머 | 잦은 타이머 생성 회피 |
| gzip/flate reader | 압축 해제 | 해제기 재사용 |

:::tip 객체 풀과 resultBundle 의 역할 분담
엔진 내부 객체(Response/Request/Builder)는 수명이 짧고 요청 내부에서 borrow-return 주기를 마치므로 풀링에 적합합니다. 호출자에게 반환되는 `*Result`는 수명이 불확정이라 단일 할당 + GC 회수가 맞습니다. 둘은 상호 보완적으로 각자 장점을 취합니다.
:::

### 저할당 핫 패스

객체 풀 외에도 요청 핫 패스에는 일련의 **맞춤형 할당 제거** 최적화가 있습니다:

| 최적화 지점 | 메커니즘 |
|--------|------|
| 헤더 깊은 복사 일괄 할당 | `CloneHeader`가 전체 값 수를 먼저 세고 공유 기반 배열을 한 번에 할당 — 「헤더마다 한 번 할당(N회)」을 1회로 축소 |
| 쿼리 매개변수 이스케이프 제로 할당 | 이스케이프 불필요한 문자열은 **그대로 반환**(제로 할당); 필요할 때는 풀링 버퍼에 바이트 단위로 기록 |
| 숫자 쿼리 매개변수 직접 기록 | `int`/`float64`/`bool` 등 숫자는 `strconv.Append*`로 빌더에 바로 기록되어 중간 문자열이 생기지 않음 |
| 요청 헤더 소유권 이전 | 일반 요청과 다운로드 경로는 엔진 Response 의 header map 을 `Result`에 **소유권째 이전**, 복제가 아님 |
| 리다이렉트 체인 인라인 배열 | 앞의 8번 리다이렉트는 풀링 객체의 인라인 고정 배열에 기록되고, 8번 초과 시에만 오버플로 슬라이스 할당 — 대부분의 요청은 리다이렉트 체인을 위해 추가 할당하지 않음 |
| 재시도 대기 타이머 재사용 | 재시도 백오프용 `time.Timer`를 풀링해 재사용, 고빈도 재시도에서 반복 타이머 생성 회피 |
| 풀 용량 보호 | 임계값을 초과한 객체는 풀에 **반납하지 않음**(예: header map > 64개, query builder 용량 > 4096), 큰 객체가 풀에 오래 남아 메모리를 부풀리는 것을 방지 |

### 내부 지표와 건전도

엔진 내부는 **순수 원자 연산**(잠금 없음)으로 요청별 지표를 수집합니다: 총 요청 수, 성공/실패 수, 그리고 이동 평균 공식 `새 평균 = (기존 평균×9 + 이번 지연) / 10`으로 유지되는 평활 지연; 오류율이 10% 미만이면 건전한 것으로 봅니다. 이 지표는 엔진 자신의 건전도 판단에 쓰이며 **공개 API 로 노출되지 않습니다** — 애플리케이션 계층의 요청 지표는 `MetricsMiddleware`를 사용하세요([미들웨어](../api-reference/client-config/middleware) 참조). 메서드/URL/상태 코드/소요 시간으로 콜백되어 Prometheus 등 모니터링 시스템에 바로 연결할 수 있습니다.

### 신경 쓰지 않아도 되는 부분

위 최적화는 호출자에게 완전히 투명합니다. API 를 평소처럼 사용하기만 하면, 연결 재사용·객체 풀링·단일 할당은 모두 내부에서 자동으로 일어납니다:

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

    // Result 는 매 요청 새로 생성, GC 가 자동 회수, 수동 해제 불필요
    result, err := client.Get("https://api.example.com/data")
    if err != nil {
        log.Fatal(err)
    }

    // 핫 패스에서는 Body() 대신 RawBody() 우선
    // RawBody()는 원시 바이트 슬라이스 반환; Body()는 미리 저장된 문자열 반환; String() 은 디버그 포맷팅(가장 큰 비용)
    data := result.RawBody()
    fmt.Printf("응답 크기: %d 바이트\n", len(data))
    fmt.Printf("요청 소요: %v\n", result.Meta.Duration)
}
```

## 워크로드별 튜닝 예제

### 타임아웃 예산

네 가지 전송 계층 타임아웃(`Dial`, `TLSHandshake`, `ResponseHeader`, 암묵적 본문 전송)은 모두 `Timeouts.Request`라는 **총 예산**의 제약을 받습니다. 프리셋을 조정할 때는 「항목별 합 ≤ 총 예산」의 계층 관계를 유지하여, 「다이얼 타임아웃이 총 타임아웃보다 긴」 무의미한 구성이 생기지 않게 하세요:

```
Timeouts.Request(총 예산, 기본 180s)
 ├── Timeouts.Dial          다이얼(기본 10s)
 ├── Timeouts.TLSHandshake  TLS 핸드셰이크(기본 10s)
 ├── Timeouts.ResponseHeader 응답 헤더 대기(Default/Performance 는 0=전송 계층 제한 없음)
 └── 응답 본문 전송          남은 시간을 모두 사용 가능
```

| 워크로드 | Request | Dial/TLS | 설명 |
|----------|---------|----------|------|
| 내망 마이크로서비스 | 5–10s | 1–2s | 빠른 실패, 오류를 상위 재시도/서킷 브레이커에 맡김 |
| 공인망 API | 30s | 5s | 망 간 지연과 드문 느린 응답을 모두 고려 |
| AI/장기 작업 | 300s+ | 10s | 긴 응답 본문이 남은 예산을 점유 |
| 대용량 파일 다운로드 | 0(context 로 제어) | 15s | 총 시간은 `Download`의 ctx 로, 단일 요청은 `WithTimeout`으로 관리 |

:::warning ResponseHeader 와 WithTimeout 의 상호작용
`Default`/`Performance` 프리셋은 `ResponseHeader`를 0으로 설정해(전송 계층에서 강제하지 않음) `WithTimeout()`이 긴 응답을 완전히 제어하게 합니다; `Secure` 프리셋은 slowloris 류 공격 대응을 위해 10s 로 설정합니다. `ResponseHeader`를 수동으로 좁힌다면, `WithTimeout`보다 먼저 느린 응답을 끊을 수 있음에 주의하세요.
:::

### AI API 롱폴링

AI 추론 API 의 응답 시간은 수 분에 이를 수 있어, 타임아웃 제한을 완화해야 합니다:

<!-- check-code: skip -->
```go
// AI API 는 5-15분 걸릴 수 있음, 기본 180s 타임아웃에 잘리지 않도록
result, err := httpc.Post("https://api.ai.example.com/v1/completions",
    httpc.WithJSON(payload),
    httpc.WithTimeout(900*time.Second), // 15분
)
```

:::warning Default 의 ResponseHeader 가 0인 이유
`TimeoutConfig.ResponseHeader = 0`은 전송 계층에서 응답 헤더 타임아웃을 강제하지 않고, context 수준 타임아웃(`TimeoutConfig.Request` 또는 `WithTimeout`)이 통일 제어함을 뜻합니다. 덕분에 `WithTimeout()`이 긴 응답 요청을 완전히 제어합니다. slowloris 공격에 대응하는 전송 계층 방어가 필요하면 `SecureConfig()`을 사용하세요(10s 로 설정).
:::

### 마이크로서비스 고 QPS

내부 마이크로서비스 사이의 잦은 호출에는 큰 연결 풀이 필요합니다:

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
    // 연결 풀을 백엔드 인스턴스 수에 맞게 튜닝
    cfg.Connection.MaxIdleConns = 300   // 총 유휴 연결
    cfg.Connection.MaxConnsPerHost = 30 // 백엔드 인스턴스당
    // 마이크로서비스 응답은 보통 빠름, 타임아웃을 줄여 빠르게 실패
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
    // 고빈도 요청은 연결 풀 재사용, TCP/TLS 재수립 불필요
    for i := 0; i < 50; i++ {
        result, err := client.Get("http://user-service:8080/api/users")
        if err != nil {
            log.Printf("요청 %d 실패: %v", i, err)
            continue
        }
        _ = result
    }
    fmt.Printf("50개 요청 소요: %v\n", time.Since(start))
}
```

### 대용량 파일 다운로드(스트리밍)

대용량 파일 다운로드에는 `Download()`를 사용하세요: 내부에서 스트리밍 모드를 자동으로 켜고 응답 본문이 네트워크에서 디스크로 직접 흐르며, 메모리 사용량은 파일 크기와 무관하고 이어받기와 체크섬을 지원합니다:

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
    dcfg.ResumeDownload = true // 이어받기

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

:::warning 일반 요청 메서드에 WithStreamBody 를 사용하지 마세요
`WithStreamBody(true)`는 `Download`처럼 엔진 응답을 직접 소비하는 경로에만 유효합니다. `Get`/`Post`/`Request` 등 일반 메서드에 설정하면 응답 본문은 여전히 `Result`로 온전히 읽힌 뒤 하위 스트림이 닫힙니다 — 반환된 `Result`의 요청 본문은 비어 있고 호출자는 스트림을 얻지 못합니다. 큰 응답 본문을 소비하는 올바른 진입점은 곧바로 `Download` 입니다(자세한 내용은 [파일 업로드와 다운로드](./file-transfer)).
:::

### 크롤러와 프록시 풀

크롤러 시나리오에서는 프록시 풀로 IP 를 회전시키며, HTTPC 는 모든 프록시가 최소 한 번 시도되도록 재시도 횟수를 자동으로 높입니다(자세한 내용은 [재시도와 내결함성](./retry-fault-tolerance#프록시-풀과-재시도-상호작용)):

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
cfg.Connection.ProxyRotateOnStatus = []int{403} // 403 이면 프록시 교체 트리거
cfg.Connection.ProxyPoolStrategy = httpc.ProxyStrategyRoundRobin
// MaxRetries 는 자동으로 4로 상향(프록시 수-1), 5개 프록시를 모두 한 번씩 시도하도록 보장
```

## 성능 안티패턴

| 안티패턴 | 원인 | 올바른 방법 |
|--------|------|----------|
| 요청마다 Client 신규 생성 | 연결 재사용 불가, 매번 TCP/TLS 핸드셰이크 재수행 | 전역에서 단일 Client 인스턴스 재사용 |
| 과도하게 큰 `MaxResponseBodySize` | 불필요하게 메모리 상한 해제 | 실제 응답 크기에 맞게 설정 |
| 핫 패스에서 `result.String()` 사용 | 추가 문자열 구성 비용 | `result.Body()` 또는 `result.RawBody()` 사용 |
| 연결 풀이 너무 작음 | 고동시성에서 연결 부족, 대기 발생 | `MaxConnsPerHost`를 동시 수에 맞게 조정 |
| 일반 요청에 `WithStreamBody` 사용 | 반환된 Result 의 요청 본문이 비고 스트림도 얻지 못함 | 큰 응답 본문은 `Download`로 |
| HTTP/2 끄기 | HTTP/1.1 직렬 요청으로 퇴행 | 기본값 켜짐 유지 |
| `Close()` 무시 | 연결 누수 | `defer client.Close()` |
| 전역 공유 후 재사용 잊음 | Client 를 반복 생성/파기 | 한 번 생성해 장기 보유 |
| goroutine 수로 버티기 | 다운스트림 과부하, 429/서킷 브레이커 트리거 | 세마포어나 worker pool 로 진행 중 요청 수 제어 |

:::warning Client 는 반드시 재사용
HTTP 성능의 근간은 연결 재사용입니다. 요청마다 Client 를 새로 만들면 매번 TCP 3-way 핸드셰이크 + TLS 핸드셰이크를 수행하여, 지연이 서브밀리초에서 수십 밀리초로 급증합니다. 마이크로서비스 시나리오에서는 Client 를 싱글턴으로 서비스 구조체에 주입해 서비스 수명주기와 함께 살리세요.
:::

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

// 안티패턴 데모: 요청마다 Client 신규 생성
func main() {
    start := time.Now()

    for i := 0; i < 5; i++ {
        // ❌ 매 루프마다 Client 생성 — 연결 재사용 불가
        client, err := httpc.NewDefault()
        if err != nil {
            log.Fatal(err)
        }
        result, err := client.Get("https://httpbin.org/get")
        client.Close() // 매번 닫아 연결 풀이 비워짐
        if err != nil {
            log.Printf("요청 %d 실패: %v", i, err)
            continue
        }
        _ = result
    }
    // 5개 요청의 소요 시간은 Client 재사용 방식보다 훨씬 큼
    fmt.Printf("안티패턴 소요: %v\n", time.Since(start))

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
    fmt.Printf("재사용 방식 소요: %v\n", time.Since(start))
}
```

## 다음 단계

- [연결 풀과 DNS](./connection-pool) — 연결 풀 매개변수 상세와 DoH 해석
- [프록시와 프록시 풀](./proxy) — 프록시 풀 구성과 회전 전략
- [오류 처리](./error-handling) — 타임아웃 계층화 전략과 오류 분류
- [재시도와 내결함성](./retry-fault-tolerance) — 백오프 알고리즘 상세와 재시도 예산
- [보안 개요](../security/) — 보안과 성능의 균형
