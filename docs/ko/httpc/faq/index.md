---
sidebar_label: "자주 묻는 질문"
title: "자주 묻는 질문 - CyberGo HTTPC | 질문과 답변"
description: "HTTPC 자주 묻는 질문 답변: 패키지 수준 함수와 클라이언트 인스턴스의 선택 기준, 5가지 구성 프리셋 비교와 적용 시나리오, HTTP/SOCKS5 프록시와 DoH 설정, Cookie 세션 관리와 재시도 구성, errors.Is/As 오류 매칭 패턴과 4단계 타임아웃 체계 튜닝 전략의 상세한 답변과 제안."
sidebar_position: 1
---

# 자주 묻는 질문

## 패키지 수준 함수 vs Client 인스턴스는 어떻게 선택하나요?

**답:** 패키지 수준 함수(`httpc.Get`/`httpc.Post` 등)는 내부적으로 전역 공유 기본 클라이언트(`defaultClient`)를 사용하며, 첫 호출 시 지연 로드되고 닫힌 후 자동 자가 복구됩니다. 일회성 요청, 스크립트, CLI 도구 등 커스텀 구성이 필요 없는 시나리오에 적합합니다.

```go
// 패키지 수준 함수: 간단하고 빠르며, 기본 클라이언트의 연결 풀 공유
result, err := httpc.Get("https://api.example.com/data")
```

다음 중 하나의 시나리오가 필요할 때, 명시적 Client 인스턴스를 생성해야 합니다:

- 커스텀 구성(타임아웃, 프록시, 재시도, TLS 등)
- 독립적인 연결 풀 수명 주기 관리
- 미들웨어 체인 사용(로깅/감사/메트릭/요청 ID)
- 서로 다른 구성의 여러 클라이언트 공존

```go
// 명시적 Client: 구성과 수명 주기 완전 제어
client, err := httpc.New(httpc.PerformanceConfig())
if err != nil {
    log.Fatal(err)
}
defer func() { _ = client.Close() }()

result, err := client.Get("https://api.example.com/data")
```

패키지 수준 함수가 커스텀 구성을 사용하게 하려면, `SetDefaultClient`로 전역 클라이언트를 교체하세요(이전 클라이언트는 자동으로 닫힘):

```go
customClient, _ := httpc.New(httpc.SecureConfig())
if err := httpc.SetDefaultClient(customClient); err != nil {
    log.Fatal(err)
}
// 이후의 모든 패키지 수준 함수는 customClient 사용
```

:::tip 프로덕션 환경 권장
장기 실행 서비스는 명시적 Client를 우선 사용하여 전역 상태로 인한 암시적 결합을 피하세요. 패키지 수준 함수는 단기 수명 프로그램이나 빠른 프로토타이핑에만 적합합니다.
:::

## 5가지 구성 프리셋은 어떻게 선택하나요?

**답:** HTTPC는 5가지 프리셋 구성을 제공하며, 보안성과 성능의 균형으로 나열합니다:

| 프리셋 | 타임아웃 | 재시도 | 리다이렉트 | SSRF | 응답 상한 | TLS 검증 | 적용 시나리오 |
|--------|---------|--------|-----------|------|-----------|----------|---------------|
| `SecureConfig()` | 엄격(15s) | 1회 | 금지 | 활성화 | 5MB | 활성화 | 사용자 제공 URL 처리, 금융/의료 |
| `DefaultConfig()` | 보통(180s) | 3회 | 허용 | 활성화 | 10MB | 활성화 | 범용 시나리오 |
| `PerformanceConfig()` | 긴 편(60s) | 3회 | 허용 | 활성화 | 50MB | 활성화 | 내부 마이크로서비스, 고동시성 API |
| `MinimalConfig()` | 보통 | 0회 | 금지 | 활성화 | 1MB | 활성화 | 일회성 스크립트, 단순 호출 |
| `TestingConfig()` | 짧음(5s Dial) | 1회 | 허용 | **비활성화** | 기본값 | **건너뜀** | 단위 테스트, 로컬 개발 |

의사결정 트리:

```
사용자 제공 URL을 처리하는가?
├── 예 → SecureConfig()
└── 아니오 → 고처리량이 필요한가?
         ├── 예 → PerformanceConfig()
         └── 아니오 → 일회성 요청인가?
                  ├── 예 → MinimalConfig()
                  └── 아니오 → DefaultConfig()
테스트 환경 → TestingConfig()
```

:::warning TestingConfig 보안 위험
`TestingConfig()`는 TLS 검증과 SSRF 방어를 비활성화하며, 비테스트 환경에서 사용하면 경고가 출력됩니다. **프로덕션 환경 사용 엄금**, `*_test.go` 파일이나 로컬 개발에만 제한하세요.
:::

## HTTP/SOCKS5 프록시는 어떻게 설정하나요?

**답:** HTTPC는 세 가지 프록시 방식을 제공하며, 우선순위순: `ProxyURL` > `ProxyPool` > `EnableSystemProxy`.

| 방식 | 필드 | 적용 시나리오 | 특징 |
|------|------|---------------|------|
| 단일 프록시 | `ProxyURL` | 고정 프록시 서버 | 최고 우선순위, 직접 지정 |
| 프록시 풀 | `ProxyPool` | 다중 프록시 순환, 고가용성 | 순환 전략과 수동적 서킷 브레이커 지원 |
| 시스템 프록시 | `EnableSystemProxy` | 환경 변수 읽기 | 최하 우선순위, 시스템 구성 따름 |

```go
// 방식 1: 단일 프록시(http/https/socks5 프로토콜 지원)
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyURL = "socks5://user:pass@proxy:1080"
client, _ := httpc.New(cfg)

// 방식 2: 시스템 프록시(HTTP_PROXY/HTTPS_PROXY 환경 변수 읽기)
cfg.Connection.EnableSystemProxy = true

// 방식 3: 프록시 풀(다중 프록시 순환 + 수동적 서킷 브레이커)
cfg.Connection.ProxyPool = []string{
    "http://proxy1:8080",
    "http://proxy2:8080",
    "socks5://proxy3:1080",
}
cfg.Connection.ProxyPoolStrategy = httpc.ProxyStrategyRoundRobin
```

## 프록시 풀 순환 원리는 무엇인가요?

**답:** 프록시 풀은 세 가지 메커니즘으로 IP 순환을 구현합니다:

**1. 전략 순환**(매 선택 시): `ProxyStrategyRoundRobin`은 순서대로 순환 선택하며, 매 선택마다 다음 프록시로 진행하므로 재시도 시 **자연스럽게 다른 IP**로 떨어지며 추가 구성이 불필요합니다. `ProxyStrategyRandom`은 건강한 프록시 중에서 무작위 선택합니다.

**2. 요청별 순환**(요청 시작 시): `ProxyRotatePerRequest = true`를 설정하면, 매 독립적인 요청 시작 시 모든 유휴 연결을 닫아 Transport가 프록시 풀을 다시 평가하도록 강제합니다. 활성화하지 않으면 HTTP 연결 재사용으로 인해 동일한 호스트에 대한 연속 요청이 이전 요청의 프록시 터널을 재사용하여 전략 순환을 우회하게 됩니다. 대가로 연결 재사용이 없지만(매 요청마다 새 연결), 요청별 순환이 보장됩니다. 동일한 호스트에 대한 스크래핑/데이터 수집에 적합합니다 — 매 요청의 소스 IP가 다릅니다.

**3. 상태 코드 트리거 순환**(응답 시): `ProxyRotateOnStatus`(예: `[]int{403}`)를 설정하면, 응답이 이러한 상태 코드를 반환하고 `Retry.MaxRetries > 0`일 때 재시도를 트리거하며, 재시도 시 전략 순환이 IP 교체를 보장합니다. CF/WAF 등 IP 차원 차단 우회에 적합합니다.

또한, 프록시 풀은 **수동적 서킷 브레이커와 자동 복구**를 내장합니다: 연속 연결 실패(dial/TLS)가 `ProxyFailureThreshold`(기본값 3)에 도달하면 해당 프록시는 순환 풀에서 임시 제거되며, `ProxyCooldown`(기본값 30s) 후 하프오픈 탐침 방식으로 복구됩니다. 참고로 HTTP 상태 코드는 서킷 브레이커를 **트리거하지 않습니다** — 차단은 보통 대상 사이트별로 특정되기 때문입니다(한 사이트에서 차단된 프록시가 다른 사이트에서는 정상일 수 있음).

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyPool = []string{
    "http://proxy1:8080",
    "http://proxy2:8080",
    "http://proxy3:8080",
}
cfg.Connection.ProxyPoolStrategy = httpc.ProxyStrategyRoundRobin
cfg.Connection.ProxyFailureThreshold = 3   // 연속 3회 연결 실패 후 서킷 브레이커
cfg.Connection.ProxyCooldown = 30 * time.Second // 30s 후 하프오픈 탐침 복구
cfg.Connection.ProxyRotateOnStatus = []int{403} // 403 수신 시 IP 교체 재시도
cfg.Retry.MaxRetries = 3 // ProxyRotateOnStatus는 재시도와 함께 사용 필요
```

## DoH는 어떻게 구성하나요?

**답:** DNS-over-HTTPS(DoH)는 DNS 해석 지연을 줄이고 DNS 하이재킹과 캐시 포이즈닝을 방지할 수 있습니다. 활성화 방법:

```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableDoH = true
cfg.Connection.DoHCacheTTL = 5 * time.Minute // DNS 응답 캐시 기간(기본값 5분)
```

기본적으로 Cloudflare, Google, AliDNS 세 가지 제공자를 사용합니다(우선순위에 따라 폴백). 모든 DoH 제공자를 사용할 수 없는 경우 시스템 DNS로 자동 폴백하여 가용성을 보장합니다.

:::tip DoH 사용 시기
DoH는 DNS 해석 보안에 높은 요구사항이 있는 시나리오에 적합합니다(예: ISP DNS 하이재킹 방지). 일반적인 API 호출에서는 활성화할 필요가 없습니다 — 시스템 DNS로 보통 충분하며, DoH는 약간의 해석 지연을 추가합니다(첫 조회는 HTTPS 왕복 필요).
:::

## Cookie 세션은 어떻게 관리하나요?

**답:** HTTPC는 2계층 Cookie 관리를 제공합니다:

**1. 자동 관리(DomainClient)**: `NewDomain`이 생성한 DomainClient는 Cookie를 자동으로 활성화하며(`EnableCookies=true`), SessionManager를 내장합니다. 매 요청 후 `UpdateFromResult`로 응답의 `Set-Cookie`를 자동 캡처하며, 다음 요청 전 `prepareOptions`로 자동 주입합니다. 로그인 세션 유지 등의 시나리오에 적합합니다.

**2. 수동 관리(SessionManager)**: 더 정밀한 제어가 필요할 때, `dc.Session()`이 반환하는 `*SessionManager`를 직접 조작합니다 — Cookie 설정/삭제/조회, 런타임 보안 정책 전환, 응답에서 일괄 추출.

```go
// 자동 관리: 로그인 후 세션 자동 유지
dc, _ := httpc.NewDomain("https://api.example.com", httpc.DefaultConfig())
defer func() { _ = dc.Close() }()

// 로그인(응답의 Set-Cookie가 자동 캡처됨)
_, _ = dc.Request(ctx, "POST", "/login", httpc.WithJSON(loginData))

// 이후 요청은 세션 Cookie를 자동으로 휴대
result, _ := dc.Request(ctx, "GET", "/profile")
```

일반 Client의 경우 `cfg.Connection.EnableCookies = true`를 설정하면 cookie jar 자동 관리를 활성화할 수 있지만, SessionManager로 자동 추출되지는 않습니다.

자세한 내용은 [세션 관리](../api-reference/client-config/session)를 참조하세요.

## 재시도는 어떻게 구성하나요?

**답:** HTTPC는 기본적으로 3회 재시도하며, **재시도 가능한 일시적 오류**에 대해서만 재시도합니다:

**기본 재시도 조건**(구성 없이 즉시 적용):
- 네트워크 계층 오류: 연결 거부, 연결 재설정, 네트워크 도달 불가 등
- 전송 계층 타임아웃: `net.OpError` 타임아웃(**컨텍스트 마감이 아님**)
- 특정 HTTP 상태 코드: 408(요청 타임아웃), 429(속도 제한), 500, 502, 503, 504

**Retry-After 헤더 파싱**: 429/503을 받고 응답에 `Retry-After` 헤더가 포함된 경우, HTTPC는 자체 백오프 계산 대신 서버가 지시한 지연대로 대기하여 서버 부하 가중을 방지합니다.

**커스텀 재시도**: `RetryPolicy` 인터페이스(`ShouldRetry` + `GetDelay` 두 메서드)를 구현하여 내장 로직을 교체하고 `cfg.Retry.CustomPolicy`에 할당합니다. 자세한 내용은 [재시도와 내결함성 가이드](../guides/retry-fault-tolerance)를 참조하세요.

```go
cfg := httpc.DefaultConfig()
cfg.Retry.MaxRetries = 5              // 최대 5회 재시도(상한 10)
cfg.Retry.Delay = 2 * time.Second     // 초기 지연
cfg.Retry.BackoffFactor = 2.0         // 지수 백오프 인수
cfg.Retry.MaxRetryDelay = 60 * time.Second // 단일 최대 지연
cfg.Retry.EnableJitter = true         // 지터(썬더링 허드 방지)
```

:::warning context 취소는 재시도하지 않음
`context.Canceled`와 `context.DeadlineExceeded`로 트리거된 실패는 **절대 재시도하지 않습니다** — 이는 사용자의 명시적 취소/타임아웃 의도이며, 재시도는 이 의도에 위배됩니다.
:::

자세한 내용은 [재시도와 내결함성](../guides/retry-fault-tolerance)을 참조하세요.

## 타임아웃은 어떻게 선택하나요?

**답:** HTTPC는 4단계 타임아웃 체계를 제공하며, 적용 범위가 넓은 것부터 좁은 것순입니다:

| 타임아웃 계층 | 필드 | 기본값 | 적용 범위 | 요청 수준 덮어쓰기 |
|--------------|------|--------|-----------|:-------------------:|
| 요청 총 타임아웃 | `Timeouts.Request` | 180s | 재시도 포함 전체 과정 | `WithTimeout()` |
| 다이얼 타임아웃 | `Timeouts.Dial` | 10s | TCP 연결 설정 | 아니요 |
| TLS 핸드셰이크 타임아웃 | `Timeouts.TLSHandshake` | 10s | TLS 핸드셰이크(HTTPS만) | 아니요 |
| 유휴 연결 타임아웃 | `Timeouts.IdleConn` | 90s | 연결이 유휴로 유지되는 시간 | 아니요 |
| 응답 헤더 타임아웃 | `Timeouts.ResponseHeader` | 0(비활성화) | 응답 헤더 도달 대기 | **불가능** |

**ResponseHeader 특수 동작**: 기본값 0(비활성화)일 때, `Timeouts.Request` 또는 `WithTimeout()`의 컨텍스트 타임아웃이 전적으로 제어합니다. 양수로 설정하면 전송 수준 하드 상한(slowloris 방어)이 활성화되지만, 이 값은 `WithTimeout`을 **덮어씁니다**(ResponseHeader가 더 짧은 경우), 그리고 **동일한 client를 공유하는 모든 요청**에 적용되어 요청별 덮어쓰기가 불가능합니다.

```go
// 권장: 컨텍스트 타임아웃(정밀 제어, 요청별 설정 가능)
ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
defer cancel()
result, _ := client.Request(ctx, "GET", url)

// 요청 옵션 덮어쓰기(내부적으로 컨텍스트 타임아웃으로 변환)
result, _ := client.Get(url, httpc.WithTimeout(30*time.Second))
```

:::warning TimeoutMiddleware는 Download에 부적합
`TimeoutMiddleware`는 handler 반환 후 즉시 컨텍스트를 취소(`defer cancel()`)하지만, Download의 handler는 응답 헤더를 받은 후 반환합니다 — 이때 body가 아직 소비되지 않았으므로, cancel이 body 첫 바이트에서 "context canceled"를 트리거합니다. Download를 TimeoutMiddleware로 감싸지 **마세요**, 대신 `WithTimeout`을 사용하세요(그 마감 시간은 엔진의 전체 컨텍스트에 적용되어 body 읽기를 커버).
:::

## 4xx/5xx는 왜 error로 반환되지 않나요?

**답:** 이것은 HTTPC의 설계 철학입니다: HTTP 상태 코드는 **애플리케이션 계층 의미**이지 전송 계층 오류가 아닙니다. 404를 반환하는 응답은 네트워크 계층에서 완전히 성공한 것입니다 — TCP 연결 설정, TLS 핸드셰이크 완료, HTTP 요청 전달, 응답 정상 반환. 이를 error로 취급하면 네트워크 계층 오류와 혼동되어 오류 처리 복잡도가 증가합니다.

따라서 HTTPC는 **네트워크 계층 실패** 시에만 error를 반환하고(연결 거부, 타임아웃, DNS 실패 등), HTTP 상태 코드는 `Result`로 검사합니다:

```go
result, err := client.Get(url)
if err != nil {
    // 네트워크 계층 오류(연결 실패, 타임아웃 등)
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        log.Printf("네트워크 오류: %s", clientErr.Code())
    }
    return err
}

// HTTP 상태 코드 검사
switch {
case result.IsSuccess():      // 2xx
    handleSuccess(result)
case result.IsClientError():  // 4xx
    log.Printf("클라이언트 오류: %d", result.StatusCode())
case result.IsServerError():  // 5xx
    log.Printf("서버 오류: %d", result.StatusCode())
}
```

## 대용량 파일 다운로드는 어떻게 처리하나요?

**답:** `Download` 메서드로 스트리밍 다운로드를 수행하며, 진행률 콜백, 이어받기, SHA-256 검증과 경로 보안 검사를 지원합니다:

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
	client, err := httpc.NewDefault()
	if err != nil {
		log.Fatalf("클라이언트 생성 실패: %v", err)
	}
	defer func() { _ = client.Close() }()

	cfg := httpc.DefaultDownloadConfig()
	cfg.FilePath = "/tmp/large-file.zip"
	cfg.Overwrite = true
	cfg.ResumeDownload = true // 이어받기: 중단 후 재다운로드 시 중단점부터 계속
	cfg.Checksum = "e3b0c44298fc1c149afbf4c8996fb924..." // 예상 SHA-256
	cfg.ChecksumAlgorithm = httpc.ChecksumSHA256
	cfg.ProgressCallback = func(downloaded, total int64, speed float64) {
		if total > 0 {
			fmt.Printf("\r%.1f%% (%s / %s, %s)",
				float64(downloaded)/float64(total)*100,
				httpc.FormatBytes(downloaded),
				httpc.FormatBytes(total),
				httpc.FormatSpeed(speed))
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	result, err := client.Download(ctx, "https://example.com/large-file.zip", cfg)
	if err != nil {
		log.Fatalf("다운로드 실패: %v", err)
	}
	fmt.Printf("\n다운로드 완료: %s (%d 바이트)\n", result.FilePath, result.BytesWritten)
}
```

:::tip 경로 보안
Download는 FilePath를 검증하여 디렉토리 경로(파일 열기 오류 반환)와 지원하지 않는 검증 알고리즘(대상 파일에 접근하기 전에 거부)을 거부합니다. 이어받기는 서버의 Range 요청 지원에 의존합니다 — 서버가 206이 아닌 200을 반환해도 HTTPC가 올바르게 처리합니다(잘라내지 않고 처음부터 시작).
:::

## 인증서 고정은 어떻게 하나요?

**답:** 인증서 고정(Certificate Pinning)은 TLS 핸드셰이크 단계에서 서버 공개키가 사전 설정된 지문과 일치하는지 검증하여, 신뢰할 수 있는 CA가 침해되더라도 중간자 공격을 방어할 수 있습니다.

**SPKI 해시 생성 단계**(OpenSSL 사용):

```bash
openssl x509 -in cert.pem -pubkey -noout | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary | openssl enc -base64
```

**다중 해시 순환**: 여러 해시를 전달하여 키 순환을 지원합니다 — 서버 키가 **어느 하나**의 사전 설정 해시와 일치하면 통과합니다. 서버가 키를 순환할 때 클라이언트가 연결이 끊기지 않도록 항상 백업 해시를 구성할 것을 권장합니다.

```go
pinner, err := httpc.NewSPKIHashPinner(
    "YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2fuihg=", // 현재 키
    "C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=", // 백업 키(순환용)
)
if err != nil {
    log.Fatal(err)
}

cfg := httpc.DefaultConfig()
cfg.Security.CertificatePinner = pinner
client, _ := httpc.New(cfg)
```

Pinner 인스턴스는 여러 Client에서 안전하게 공유할 수 있습니다(내부적으로 동시 안전하며, 깊은 복사되지 않음).

## context 취소 후 요청이 재시도되나요?

**답:** **되지 않습니다**. `context.Canceled`와 `context.DeadlineExceeded`은 재시도 불가능합니다 — 이들은 사용자의 명시적 취소 또는 타임아웃 의도를 나타내며, 재시도는 이 의도에 위배됩니다.

HTTPC의 `IsRetryable()` 메서드는 모든 판단 전에 **context 오류를 우선 검사**합니다: Cause 체인에 `context.Canceled` 또는 `context.DeadlineExceeded`이 포함되기만 하면 직접 false를 반환합니다. 오류가 `ErrorTypeNetwork`(보통 재시도 가능)로 분류되더라도 context 오류 검사로 인해 재시도 불가능으로 올바르게 식별됩니다.

```go
ctx, cancel := context.WithCancel(context.Background())
go func() {
    time.Sleep(100 * time.Millisecond)
    cancel() // 능동 취소
}()

_, err := client.Request(ctx, "GET", "https://example.com/slow")
if err != nil {
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        fmt.Println(clientErr.Type == httpc.ErrorTypeContextCanceled) // true
        fmt.Println(clientErr.IsRetryable())                          // false
    }
}
```

## MaxRedirects(0)는 왜 리다이렉트를 금지하지 않나요?

**답:** `MaxRedirects = 0`은 "금지"가 아닌 "미설정" 센티널 값입니다. `DefaultConfig()`에서 `MaxRedirects`의 기본값은 10입니다. 리다이렉트를 실제로 금지하려면 `WithFollowRedirects(false)` 또는 `Config.Defaults.FollowRedirects = false`를 사용하세요:

```go
// 방식 1: 구성 수준 금지
cfg := httpc.DefaultConfig()
cfg.Defaults.FollowRedirects = false
client, _ := httpc.New(cfg)

// 방식 2: 요청 수준 금지
result, _ := client.Get(url, httpc.WithFollowRedirects(false))
```

`SecureConfig()` 프리셋은 기본적으로 리다이렉트를 금지(`FollowRedirects = false`)하여, 리다이렉트 기반 SSRF 공격을 방지합니다.

## io.Reader 요청 본문은 왜 크기를 검증하지 않나요?

**답:** `io.Reader`는 스트리밍 인터페이스이며, 데이터 길이를 미리 알 수 없습니다 — `Len()` 메서드가 없고, 읽으면 소비됩니다. 따라서 HTTPC는 `io.Reader` 타입의 요청 본문에 대해 **크기 검증을 하지 않으며**, 호출자가 데이터 양을 제어할 책임이 있습니다.

업로드 크기를 제한하려면 표준 라이브러리 `io.LimitReader`로 감싸세요:

```go
// 최대 1MB 업로드 제한
limitedReader := io.LimitReader(unlimitedReader, 1024*1024)
result, err := client.Post(url, httpc.WithBody(limitedReader))
```

또는 `Security.MaxRequestBodySize`로 전역 업로드 상한을 설정합니다(기본값 0 = 제한 없음):

```go
cfg := httpc.DefaultConfig()
cfg.Security.MaxRequestBodySize = 10 * 1024 * 1024 // 전역 10MB 제한
```

## 보안 경고는 어떻게 억제하나요?

**답:** `TestingConfig()` 등 안전하지 않은 구성을 비테스트 환경에서 사용하면 `log.Printf`로 경고가 출력됩니다. 억제가 필요한 경우(예: CI 환경의 특정 시나리오), 경고 출력을 `io.Discard`로 리다이렉트하세요:

```go
// 모든 보안 경고 출력 억제
httpc.SetSecurityWarnOutput(io.Discard)

cfg := httpc.TestingConfig() // 더 이상 경고 출력하지 않음
```

:::warning 통제된 환경에서만 사용
보안 경고 억제는 출력을 조용히 할 뿐, 비활성화된 보안 기능을 **복원하지 않습니다**. 반드시 통제된 환경(CI, 컨테이너화된 테스트)에서만 사용하고, 프로덕션 환경에서는 `SecureConfig()` 또는 `DefaultConfig()`를 사용해야 합니다.
:::

## 내부 서비스는 어떻게 접근하나요?

**답:** 기본 SSRF 방어가 사설 IP 연결을 차단합니다(127.0.0.1, 10.x, 192.168.x, 169.254.x 등). 내부 서비스 접근에는 두 가지 방식이 있습니다:

```go
// 방식 1: 정밀 면제(권장) — 지정된 CIDR 범위만 허용
cfg := httpc.DefaultConfig()
cfg.Security.SSRFExemptCIDRs = []string{
    "10.0.0.0/8",     // VPC 내부망
    "100.64.0.0/10",  // Tailscale/VPN
}

// 방식 2: 완전 비활성화(위험) — 모든 연결 수준 SSRF 다이얼 검증 폐쇄
cfg.Security.AllowPrivateIPs = true
```

:::warning AllowPrivateIPs의 위험
`AllowPrivateIPs = true`는 사설 IP를 허용할 뿐 아니라 연결 수준 SSRF 다이얼 검증을 **완전히 우회**합니다(localhost/loopback/link-local 검사 포함). 신뢰할 수 있는 내부 서비스에 연결할 때만 사용하며, 사용자 입력의 URL을 처리할 때는 **엄금**합니다 — 대신 `SSRFExemptCIDRs`로 정밀 면제하세요.
:::

## 요청 로그는 어떻게 기록하나요?

**답:** `LoggingMiddleware`로 요청 로그를 추가하며, URL은 자동 마스킹되어 자격 증명 유출을 방지합니다:

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.LoggingMiddleware(&httpc.LoggingConfig{
        LogFunc: func(format string, args ...any) {
            log.Printf("[HTTP] "+format, args...)
        },
    }),
}
client, _ := httpc.New(cfg)
```

규정 준수 수준의 감사(요청/응답 헤더, 리다이렉트 체인, 소스 IP, 사용자 ID 기록)가 필요하면, 기능이 더 완전한 `AuditMiddleware`를 사용하세요. 자세한 내용은 [미들웨어 레퍼런스](../api-reference/client-config/middleware)를 참조하세요.

## 추가 리소스

- [빠른 시작](../getting-started/) - 5분 빠른 시작
- [실전 튜토리얼](../guides/tutorial) - 단계별 완전한 예제
- [구성 API](../api-reference/client-config/config) - 완전한 구성 레퍼런스
- [오류 타입](../api-reference/types/errors) - ClientError와 오류 분류 상세
- [오류 처리](../guides/error-handling) - 오류 처리 가이드
