---
sidebar_label: "프로덕션 체크리스트"
title: "프로덕션 체크리스트 - CyberGo HTTPC | 출시 전 점검"
description: "HTTPC 프로덕션 보안 체크리스트: TLS와 인증서 고정, SSRF 면제 감사, 5단계 타임아웃 예산, 연결 풀 상한, 재시도 폭풍 제어, 크기 제한, Cookie 보안, 파일 다운로드, Body/임시 파일 정리, 민감 정보 마스킹, 항목마다 기본값·권장 값·검증 방법 포함."
sidebar_position: 4
---

# 프로덕션 체크리스트

출시 전 항목별 점검은 일반적인 보안 구성 결함을 효과적으로 제거합니다. 이 체크리스트는 카테고리별로 그룹화되어 있으며, 각 항목은 기본값, 권장 프로덕션 값, 검증 방법을 표시합니다. CI에서 스크립트(문서 하단 참조)로 고위험 항목을 자동화 점검할 것을 권장합니다.

## TLS / 암호화

| 점검 항목 | 기본값 | 권장 프로덕션 값 | 검증 방법 |
|--------|--------|-----------|----------|
| `InsecureSkipVerify` | `false` | `false` | 코드 검색, 문서 하단 명령 참조 |
| `MinTLSVersion` | TLS 1.2 | TLS 1.2+(고보안 시 1.3 강제 가능) | `grep MinTLSVersion` |
| `MaxTLSVersion` | TLS 1.3 | TLS 1.3 | `grep MaxTLSVersion` |
| `TestingConfig()` 미사용 | — | 예 | 코드 검색, 문서 하단 명령 참조 |
| 인증서 고정(고보안 시나리오) | 미활성화 | 활성화 권장 | `grep CertificatePinner` |

:::warning
`InsecureSkipVerify = true`는 모든 TLS 보안 조치를 무력화합니다. HTTPC는 비테스트 환경의 `stderr`에 경고를 출력하므로, 출시 전 로그에 이 경고가 없는지 반드시 확인하세요.
:::

버전 의미 보충: `MinTLSVersion`/`MaxTLSVersion`이 `0`이면 자동으로 1.2/1.3으로 폴백합니다. `Min > Max`는 `New()` 검증을 통과할 수 없습니다. `TLSConfig`를 설정하면 버전 필드가 무시되고 `Security.InsecureSkipVerify`도 더 이상 효력이 없습니다(`TLSConfig` 내에서 제어해야 함) — 커스텀 `TLSConfig`를 검토할 때는 해당 필드 자체로 확인하세요.

## SSRF 방어

| 점검 항목 | 기본값 | 권장 프로덕션 값 | 검증 방법 |
|--------|--------|-----------|----------|
| `AllowPrivateIPs` | `false` | `false`(신뢰할 수 없는 URL 처리 시) | 코드 검색, 문서 하단 명령 참조 |
| `SSRFExemptCIDRs` | `nil` | 필요한 대역만 정밀 나열 | 대역 좁힘 가능 여부 감사 |
| 사용자 URL 처리 시 `SecureConfig()` | — | 예 | 코드 리뷰 |
| `RedirectWhitelist` | `nil` | 사용자 URL 처리 시 구성 | 코드 리뷰 |

```go
cfg := httpc.DefaultConfig()
cfg.Security.AllowPrivateIPs = false
// 실제로 필요한 대역만 면제, 가능한 한 좁힘
cfg.Security.SSRFExemptCIDRs = []string{"10.50.0.0/16"}
cfg.Security.RedirectWhitelist = []string{"api.example.com"}
```

## 타임아웃 구성

타임아웃은 Slowloris, 자원 고갈, 연쇄 장애를 방어하는 첫 번째 방어선입니다.

| 점검 항목 | 기본값 | 권장 프로덕션 값 | 검증 방법 |
|--------|--------|-----------|----------|
| `Timeouts.Request` | 180s | 비즈니스에 맞게 설정(예: 30s) | 0이 아님 확인 |
| `Timeouts.Dial` | 10s | 5-10s | `grep Timeouts.Dial` |
| `Timeouts.TLSHandshake` | 10s | 5-10s | `grep Timeouts.TLSHandshake` |
| `Timeouts.ResponseHeader` | 0 | 필요에 따라(아래 참조) | 그 적용 범위 이해 |
| `Timeouts.IdleConn` | 90s | 60-120s | — |

:::warning
`Timeouts.ResponseHeader`는 transport 수준 하드 상한이며, 해당 client의 **모든 요청**에 적용되어 `WithTimeout`으로 요청별 덮어쓰기가 **불가능**합니다. 양수로 설정하면 더 긴 `WithTimeout`을 덮어씁니다. Slowloris에 대한 transport 수준 독립 방어가 필요할 때만 양수로 설정하고, AI API 등 긴 응답 시나리오에서는 0으로 설정하고 `Request` 타임아웃 제어에 의존하세요.
:::

### 타임아웃 예산 계산법

`Timeouts.Request`(기본값 180s)와 `WithTimeout`은 **모든 재시도와 백오프 대기를 포괄하는 총 예산**입니다: 재시도 엔진은 요청 전체에 단일 데드라인을 설정하며, 시도마다 다시 계산하지 않습니다 — `WithTimeout(30s)` + 3회 재시도는 최대 30s가 소요되지 4배가 아닙니다. 구성값과 `WithTimeout` 모두 30분 하드 상한이 있으며, 초과하면 구성 오류입니다.

단일 시도는 더 좁은 타임아웃의 제약을 받습니다: `Dial`(기본값 10s)이 TCP 설정을, `TLSHandshake`(기본값 10s)가 핸드셰이크를 제한합니다. 다운스트림 API의 P99에서 역산할 것을 권장합니다:

```go
// 예산 공식: Request ≥ Dial + TLSHandshake + 예상 전송 시간 × (1 + MaxRetries) + 백오프 총합
cfg.Timeouts.Request = 30 * time.Second // 총 예산
cfg.Timeouts.Dial = 5 * time.Second     // 단일 다이얼
cfg.Timeouts.TLSHandshake = 5 * time.Second
```

## 연결 풀 상한

| 점검 항목 | 기본값 | 권장 프로덕션 값 | 검증 방법 |
|--------|--------|-----------|----------|
| `MaxIdleConns`(전역 유휴 연결) | 50 | 동시성 기반 산정 | 0이 아님 확인 |
| `MaxConnsPerHost`(호스트당 총 연결) | 10 | 고동시성에서 필요 시 상향 | 0 = 제한 없음 주의 |
| `MaxIdleConnsPerHost`(호스트당 유휴) | 자동 산출 | — | `MaxConnsPerHost/2`에서 산출, 2-10으로 클램프 |
| 연결 풀 총량 상한 | 1000 | — | 연결 계층 내장, 초과 시 연결 풀 고갈 오류 반환 |

구성 검증 하드 상한: `MaxIdleConns`와 `MaxConnsPerHost` 모두 0-1000입니다(`ValidateConfig` 강제). 오해하기 쉬운 두 가지 의미:

- `MaxConnsPerHost = 0`은 **제한 없음**을 의미합니다(net/http 의미론) — '연결 금지'가 아닙니다. 기본 구성은 10입니다
- 연결 풀 총량 상한(1000)은 공개 `Config`로 변경할 수 없습니다. 상한에 도달하면 새 다이얼은 대기열에 들어가지 않고 즉시 실패합니다

```go
cfg := httpc.DefaultConfig()
cfg.Connection.MaxIdleConns = 50    // 전역 유휴 연결
cfg.Connection.MaxConnsPerHost = 10 // 호스트당 연결 상한(idle + active)
```

`SecureConfig()`는 더 보수적인 20/5를 사용하고, `PerformanceConfig()`는 100/20으로 완화합니다.

## 크기 제한

| 점검 항목 | 기본값 | 권장 프로덕션 값 | 검증 방법 |
|--------|--------|-----------|----------|
| `MaxResponseBodySize` | 10MB | 비즈니스에 맞게(예: 5MB) | 0이 아님 확인 |
| `MaxDecompressedBodySize` | 100MB | 비즈니스에 맞게(예: 50MB) | 0이 아님 확인 |
| `MaxRequestBodySize` | 0(제한 없음) | 업로드 상한 **명시적 설정** | `grep MaxRequestBodySize` |
| `MaxResponseHeaderBytes` | 0(Go 기본값 10MB) | 고보안 시 1MB로 조임 가능 | `grep MaxResponseHeaderBytes` |

```go
cfg := httpc.DefaultConfig()
cfg.Security.MaxResponseBodySize = 5 * 1024 * 1024     // 5MB 응답
cfg.Security.MaxDecompressedBodySize = 50 * 1024 * 1024 // 50MB 해제
cfg.Security.MaxRequestBodySize = 2 * 1024 * 1024       // 2MB 업로드(기본값 0은 제한 없음!)
cfg.Connection.MaxResponseHeaderBytes = 1 * 1024 * 1024  // 1MB 응답 헤더
```

:::danger
`MaxRequestBodySize`는 기본값이 0(제한 없음)이며, **자동 폴백이 없습니다**. 프록시 전달 또는 사용자 업로드 처리 시 설정하지 않으면, 공격자가 초대형 요청을 보내 대역폭과 메모리를 고갈시킬 수 있습니다. 반드시 명시적으로 설정하세요.
:::

## 재시도 전략

| 점검 항목 | 기본값 | 권장 프로덕션 값 | 검증 방법 |
|--------|--------|-----------|----------|
| `MaxRetries` | 3 | 5 초과하지 않음 | 코드 리뷰 |
| 비멱등 요청 재시도 | — | POST/PUT/PATCH 신중 | 코드 리뷰로 멱등성 확인 |
| `EnableJitter` | `true` | `true`(썬더링 허드 방지) | `grep EnableJitter` |
| `MaxRetryDelay` | 30s | 30s | — |

:::warning
비멱등 요청(POST 리소스 생성, PUT 부분 업데이트)의 재시도는 중복 생성이나 중복 결제를 유발할 수 있습니다. 비즈니스가 비멱등이면 해당 요청에 `WithMaxRetries(0)`를 설정하거나, 서버 측에서 멱등 키를 구현하세요.
:::

### 재시도 폭풍 제어

내장 재시도 가능 상태 코드는 408/429/500/502/503/504로 고정입니다(`internal/engine/errors.go`). 네트워크 계층의 순간 오류(연결 거부/리셋/도달 불가, context가 아닌 전송 타임아웃)도 재시도됩니다. 폭풍 방지 메커니즘은 기본으로 갖춰져 있으며, 출시 전 약화되지 않았는지 항목별로 확인하세요:

| 메커니즘 | 기본값 | 역할 |
|------|--------|------|
| 지수 백오프 | `Delay=1s`, `BackoffFactor=2.0` | 재시도 간격을 벌려 장애 서버에 설상가상하지 않음 |
| 지터 | `EnableJitter=true` | 동시 재시도의 동기화된 리듬을 분산, 썬더링 허드 방지 |
| 단일 지연 상한 | `MaxRetryDelay=30s` | 백오프가 무한히 커지지 않음 |
| Retry-After 준수 | 자동 해석 | 서버 지시대로 대기하되 **60s로 제한** — 악의적인 서버가 초대형 Retry-After로 클라이언트를 끝없이 지연시키는 것을 방지 |
| 총 예산 | `WithTimeout`이 전체 시도를 포괄 | 재시도가 요청 총 타임아웃을 돌파할 수 없음 |

```go
cfg := httpc.DefaultConfig()
cfg.Retry.MaxRetries = 3                   // 상한 10(ValidateConfig 강제)
cfg.Retry.MaxRetryDelay = 30 * time.Second
cfg.Retry.EnableJitter = true              // 기본 활성화, 감사 편의를 위해 명시
// 비멱등 인터페이스는 요청 수준에서 재시도 비활성화:
// client.Post(url, httpc.WithJSON(body), httpc.WithMaxRetries(0))
```

:::tip
`ProxyRotateOnStatus`(상태 코드 기반 프록시 교체 재시도)를 구성하면 `MaxRetries`가 `len(ProxyPool)-1`로 자동 상향됩니다(상한 10). 모든 프록시가 최소 한 번은 시도되도록 보장합니다.
:::

놓치기 쉬운 함정이 두 가지 더 있습니다: `io.Reader` 요청 본문은 재시도 재생을 지원하기 위해 완전히 버퍼링되며, 100MB 초과 시 즉시 오류가 발생합니다(`retry not supported for streaming bodies`). `context.Canceled`/`context.DeadlineExceeded`는 절대 재시도되지 않으므로 능동적 취소가 중복 요청을 유발하지 않습니다.

## Cookie 보안

| 점검 항목 | 기본값 | 권장 프로덕션 값 | 검증 방법 |
|--------|--------|-----------|----------|
| `CookieSecurity` | `nil`(검증 안 함) | `StrictCookieSecurityConfig()` | `grep CookieSecurity` |
| `WithSecureCookie` 순서 | — | 모든 `WithCookie` 이후 배치 | 코드 리뷰 |

```go
cfg := httpc.DefaultConfig()
cfg.Security.CookieSecurity = httpc.StrictCookieSecurityConfig()
// Secure + HttpOnly + SameSite=Strict 요구
```

## 파일 다운로드 보안

| 점검 항목 | 기본값 | 권장 프로덕션 값 | 검증 방법 |
|--------|--------|-----------|----------|
| 다운로드 경로 신뢰할 수 없음 | — | 신뢰할 수 있는 경로만 사용, 사용자 입력 결합 금지 | 코드 리뷰 |
| `Checksum` 검증 | 미설정 | 핵심 파일에 SHA-256 설정 | `grep Checksum` |
| `Overwrite` / `ResumeDownload` | `false` | 필요에 따라 | 코드 리뷰 |

HTTPC의 `Download`는 5계층 경로 방어(UNC 차단, 제어 문자 필터링, 시스템 경로 보호, 경로 트래버설 검출, 심볼릭 링크 방어)를 내장했지만, 사용자 입력을 직접 `FilePath`로 사용하는 것은 여전히 피해야 합니다.

## 자원 관리

| 점검 항목 | 기본값 | 권장 프로덕션 값 | 검증 방법 |
|--------|--------|-----------|----------|
| 명시적 `client.Close()` | — | `defer client.Close()` | 코드 리뷰 |
| 기본 클라이언트 닫기 | — | 장기 서비스 종료 시 `CloseDefaultClient()` | 코드 리뷰 |
| `WithContext`로 취소 전달 | — | 예 | 코드 리뷰 |
| 응답 Body 해제 | 자동 | 일반 요청은 수동 닫기 불필요(닫을 방법도 없음) | 스트림을 직접 보유하지 않았는지 확인 |
| Download 잔여물 정리 | 자동 | 중단/검증 실패 시 불완전 파일 자동 삭제 | `Download`를 우회해 직접 디스크에 쓰지 않았는지 확인 |

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
	cfg := httpc.DefaultConfig()
	client, err := httpc.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	// 연결 풀 해제 보장
	defer func() {
		if cerr := client.Close(); cerr != nil {
			log.Printf("클라이언트 닫기 실패: %v", cerr)
		}
	}()

	// context로 단일 요청 타임아웃과 취소 제어
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	result, err := client.Get("https://api.example.com", httpc.WithContext(ctx))
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("상태 코드: %d\n", result.StatusCode())
}
```

:::tip
패키지 수준 함수(`httpc.Get` 등)를 사용할 때, 기본 클라이언트는 프로그램 종료 시 자동으로 연결을 닫지 않습니다. 장기 실행 서비스는 우아한 종료 시 `httpc.CloseDefaultClient()`를 호출하여 연결 풀을 해제해야 합니다. 프로덕션 서비스에서는 명시적 `httpc.New(cfg)`로 클라이언트를 생성하여 구성과 수명 주기를 직접 제어할 것을 권장합니다.
:::

### 응답 Body와 임시 파일

- **일반 요청**: `Result`가 보유한 것은 읽어 복사된 바이트입니다 — HTTPC가 내부적으로 읽기, 드레인(최대 `min(10MB, MaxResponseBodySize)`, 연결 재사용 용이), 닫기를 완료하며, 수동으로 닫아야 할(닫을 진입점도 없는) Body가 없습니다
- **대용량 파일**: 일반 요청이 아닌 `Download`를 사용 — 스트리밍 디스크 기록, 진행률 콜백과 이어 받기 지원. 전송 중단, 검증 실패, 디스크 쓰기 오류로 인한 불완전 파일은 자동 삭제되며 절반만 쓰인 파일이 남지 않습니다
- **`client.Close()`**: 유휴 연결, DoH 해석기, 연결 풀을 닫으며 멱등으로 반복 호출 가능합니다. 닫힌 클라이언트로 요청을 보내면 `ErrClientClosed`를 반환합니다

## 모니터링과 감사

### 감사 미들웨어(고보안 시나리오)

`AuditMiddleware`는 구조화된 감사 이벤트를 생성하며, 규정 준수 요구사항이 엄격한 시나리오에 적합합니다. 이벤트의 URL은 마스킹(자격 증명 제거)되며, 민감한 요청 헤더는 기본 마스킹됩니다.

```go
auditCfg := httpc.DefaultAuditConfig()
auditCfg.OnAudit = func(event httpc.AuditEvent) {
    // event.SourceIP / event.UserID는 context에서 주입
    data, _ := json.Marshal(event)
    log.Println(string(data))
}
auditCfg.Format = "json"
auditCfg.IncludeHeaders = true
auditCfg.MaskHeaders = []string{"Authorization", "Cookie", "Set-Cookie", "X-API-Key"}
auditMiddleware := httpc.AuditMiddleware(auditCfg)
```

`SourceIP`와 `UserID`는 context 키 `httpc.SourceIPKey`, `httpc.UserIDKey`를 통해 주입되어 요청과 호출자의 연관을 용이하게 합니다. `AuditEvent`는 타임스탬프, 메서드, URL, 상태 코드, 소요 시간, 재시도 횟수, 오류, 리다이렉트 체인, 요청/응답 헤더 등의 필드를 포함합니다.

### 로깅과 메트릭 미들웨어

| 점검 항목 | 권장 프로덕션 값 | 검증 방법 |
|--------|-----------|----------|
| `RecoveryMiddleware()` | 활성화(panic 크래시 방지) | `grep RecoveryMiddleware` |
| `LoggingMiddleware()` | 활성화(요청 로그) | `grep LoggingMiddleware` |
| `MetricsMiddleware()` | 활성화(메트릭 수집) | `grep MetricsMiddleware` |
| `RequestIDMiddleware()` | 활성화(요청 추적) | `grep RequestIDMiddleware` |

### 민감 정보 로그 마스킹

HTTPC는 기본적으로 출력에 다중 채널 마스킹을 적용합니다. 출시 전 우회되지 않았는지 확인하세요:

| 출력 채널 | 마스킹 동작 |
|----------|----------|
| 오류 메시지 | URL 자격 증명 → `***:***`; `token`/`password`/`api_key` 등 20여 개 민감 파라미터 → `[REDACTED]`; 프래그먼트 제거 |
| `LoggingMiddleware` | 요청 로그 URL도 동일(`SanitizeURL`, 비활성화 불가) |
| `AuditMiddleware` | 감사 이벤트 URL 마스킹; `MaskHeaders`에 나열된 요청 헤더 마스킹 |
| `Config.String()` | 프록시 URL 자격 증명 마스킹; 요청 헤더는 출력하지 않음 |

확인 사항: 커스텀 로깅 미들웨어가 원본 요청 URL을 직접 출력하면 내장 마스킹을 우회합니다 — 마스킹된 URL을 출력하거나 `LoggingMiddleware`를 재사용하세요. `MaskHeaders`는 비즈니스 커스텀 민감 헤더(예: `X-API-Key`, `X-Auth-Token`)를 포함해야 합니다.

## 인증서 고정

고보안 시나리오(금융, 의료)에서는 인증서 고정 활성화를 권장하며, CA 침해 후의 중간자 공격을 방어합니다:

```go
pinner, err := httpc.NewSPKIHashPinner(
    "YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2fuihg=", // 현재 키
    "C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=", // 백업(순환)
)
if err != nil {
    log.Fatal(err)
}
cfg := httpc.DefaultConfig()
cfg.Security.CertificatePinner = pinner
```

고정 구성과 유지 관리 세부 정보는 [TLS와 인증서 고정](./tls-certpin)을 참조하세요.

## 코드 예시

### 프로덕션급 클라이언트 생성

```go
package main

import (
	"log"
	"time"

	"github.com/cybergodev/httpc"
)

func main() {
	cfg := httpc.DefaultConfig()

	// 타임아웃
	cfg.Timeouts.Request = 30 * time.Second
	cfg.Timeouts.Dial = 10 * time.Second
	cfg.Timeouts.TLSHandshake = 10 * time.Second
	cfg.Timeouts.ResponseHeader = 0 // Request 타임아웃에 의존, transport 수준 하드 상한 설정 안 함
	cfg.Timeouts.IdleConn = 90 * time.Second

	// 연결 풀
	cfg.Connection.MaxIdleConns = 50
	cfg.Connection.MaxConnsPerHost = 10

	// 보안
	cfg.Security.AllowPrivateIPs = false
	cfg.Security.MaxResponseBodySize = 5 * 1024 * 1024      // 5MB
	cfg.Security.MaxDecompressedBodySize = 50 * 1024 * 1024 // 50MB
	cfg.Security.MaxRequestBodySize = 2 * 1024 * 1024       // 2MB 업로드

	// 재시도
	cfg.Retry.MaxRetries = 3
	cfg.Retry.Delay = 1 * time.Second
	cfg.Retry.EnableJitter = true

	// 요청 기본값
	cfg.Defaults.UserAgent = "my-service/1.0"
	cfg.Defaults.FollowRedirects = true
	cfg.Defaults.MaxRedirects = 5

	// 미들웨어
	cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
		httpc.RecoveryMiddleware(),
		httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: log.Printf}),
		httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),
	}

	client, err := httpc.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer func() { _ = client.Close() }()
	log.Println("프로덕션 클라이언트 준비 완료")
}
```

### 보안급 클라이언트(사용자 URL 처리)

```go
func createSecureClient() (httpc.Client, error) {
	cfg := httpc.SecureConfig()
	cfg.Security.CookieSecurity = httpc.StrictCookieSecurityConfig()
	cfg.Security.RedirectWhitelist = []string{"api.example.com"}
	// SecureConfig는 이미 FollowRedirects = false, AllowPrivateIPs = false, 5MB 응답 상한 설정
	return httpc.New(cfg)
}
```

## 점검 명령

CI 또는 커밋 전에 다음 명령을 실행하여 고위험 구성을 스캔합니다:

```bash
# TestingConfig 오용 확인(테스트 파일 제외)
grep -r "TestingConfig" --include="*.go" | grep -v "_test.go"

# InsecureSkipVerify = true 확인
grep -rn "InsecureSkipVerify.*true\|InsecureSkipVerify:\s*true" --include="*.go" | grep -v "_test.go"

# AllowPrivateIPs = true 확인(프로덕션 위험)
grep -rn "AllowPrivateIPs.*true\|AllowPrivateIPs:\s*true" --include="*.go" | grep -v "_test.go"

# MaxRequestBodySize 설정 여부 확인(기본값 0은 제한 없음)
grep -rn "MaxRequestBodySize" --include="*.go" | grep -v "_test.go"
```

:::tip
위 명령을 CI 단계로 캡슐화하여, 고위험 구성(`TestingConfig`, `InsecureSkipVerify: true`, `AllowPrivateIPs: true`가 비테스트 코드에 나타남)이 적중되면 빌드를 차단하는 것을 권장합니다.
:::

## 다음 단계

- [보안 개요](./) - 보안 기능 총람
- [SSRF 방어](./ssrf) - SSRF 방어 상세
- [TLS와 인증서 고정](./tls-certpin) - 인증서 고정 프로덕션 실천
- [구성 API](../api-reference/client-config/config) - 완전한 구성 참조
