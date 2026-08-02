---
sidebar_label: "보안 개요"
title: "보안 개요 - CyberGo HTTPC | 보안 기능 총람"
description: "HTTPC 보안 기능 개요: TLS 1.2+ 버전 제어, SSRF 사설 IP 차단과 CIDR 면제, CRLF 주입 방어, Cookie 보안 검증, 압축 폭탄 방어, 리다이렉트 허용 목록, 응답 본문과 요청 본문 크기 제한 및 보안 경고 메커니즘."
sidebar_position: 1
---

# 보안 개요

HTTPC는 "기본 보안(Secure by Default)" 원칙을 따릅니다: 모든 핵심 보안 기능이 바로 사용 가능하며, 추가 구성 없이 일반적인 공격 표면을 방어합니다. 사용자 제공 URL 처리, 외부 신뢰할 수 없는 서비스 호출, 또는 높은 보안 요구사항 시나리오(금융, 의료, 정부)에서 실행할 때 HTTPC의 다층 방어는 신뢰할 수 있는 기준선이 됩니다.

## 보안 기능 매트릭스

아래 표는 각 보안 기능, 해당 `Config` 필드, 기본값 및 관련 함수/옵션을 요약하여 구성 진입점을 빠르게 찾을 수 있게 합니다.

| 기능 | Config 필드 | 기본값 | 관련 함수 / 옵션 |
|------|-------------|--------|------------------|
| TLS 최소 버전 | `Security.MinTLSVersion` | TLS 1.2 | — |
| TLS 최대 버전 | `Security.MaxTLSVersion` | TLS 1.3 | — |
| 커스텀 TLS 구성 | `Security.TLSConfig` | `nil`(기본값 사용) | — |
| 인증서 검증 건너뛰기 | `Security.InsecureSkipVerify` | `false` | 테스트 전용 |
| 인증서 고정 | `Security.CertificatePinner` | `nil`(비활성화) | `NewSPKIHashPinner` 등 |
| SSRF 방어 | `Security.AllowPrivateIPs` | `false`(활성화) | `WithAllowPrivateIPs` |
| SSRF 정밀 면제 | `Security.SSRFExemptCIDRs` | `nil` | — |
| URL 검증 | `Security.ValidateURL` | `true` | — |
| 요청 헤더 검증 | `Security.ValidateHeaders` | `true` | — |
| Content-Length 엄격 검사 | `Security.StrictContentLength` | `true` | — |
| Cookie 보안 검증 | `Security.CookieSecurity` | `nil`(검증 안 함) | `StrictCookieSecurityConfig`, `WithSecureCookie` |
| 응답 본문 크기 제한 | `Security.MaxResponseBodySize` | 10MB | — |
| 요청 본문 크기 제한 | `Security.MaxRequestBodySize` | 0(제한 없음) | 명시적 설정 필요 |
| 압축 해제 폭탄 방어 | `Security.MaxDecompressedBodySize` | 100MB | — |
| 응답 헤더 크기 제한 | `Connection.MaxResponseHeaderBytes` | 0(Go 기본값 10MB) | — |
| 리다이렉트 허용 목록 | `Security.RedirectWhitelist` | `nil`(전체 허용) | — |
| 리다이렉트 횟수 제한 | `Defaults.MaxRedirects` | 10 | `WithMaxRedirects` |
| 리다이렉트 따르기 여부 | `Defaults.FollowRedirects` | `true` | `WithFollowRedirects` |

:::tip
사용자 제공 URL을 처리할 때 `httpc.SecureConfig()`를 직접 사용하면 가장 엄격한 보안 기준선을 얻을 수 있습니다: 리다이렉트 비활성화, 5MB 응답 상한, 더 짧은 타임아웃, URL/요청 헤더 검증 활성화.
:::

## TLS 보안

HTTPC는 기본적으로 TLS 1.2+를 요구하며, 안전하지 않음이 입증된 TLS 1.0/1.1을 거부합니다:

```go
cfg := httpc.DefaultConfig()
// 기본이 TLS 1.2-1.3, 수동 설정 불필요
cfg.Security.MinTLSVersion = tls.VersionTLS12
cfg.Security.MaxTLSVersion = tls.VersionTLS13
```

TLS 1.3 강제가 필요한 경우(더 높은 보안 요구, 클라이언트와 서버 모두 지원), `MinTLSVersion = tls.VersionTLS13`을 설정하면 됩니다. `TLSConfig`를 설정하면 `MinTLSVersion`/`MaxTLSVersion`은 무시됩니다 — `TLSConfig`가 우선합니다.

:::warning
`InsecureSkipVerify`는 테스트 전용입니다. 프로덕션 환경에서는 절대 `true`로 설정하지 마세요, 그렇지 않으면 TLS 암호화가 무의미해지며 중간자가 임의로 도청하고 변조할 수 있습니다. 설정하면 HTTPC가 비테스트 환경의 `stderr`에 보안 경고를 출력합니다(아래 "보안 경고 메커니즘" 참조).
:::

더 많은 TLS 세부 정보(암호 제품군, 인증서 고정, mTLS, 커스텀 CA)는 [TLS와 인증서 고정](./tls-certpin)을 참조하세요.

## SSRF 방어

SSRF(Server-Side Request Forgery, 서버 측 요청 위조)는 공격자가 서버를 유도해 내부망으로 요청을 보내는 공격 방식으로, 클라우드 메타데이터 자격 증명 탈취, 내부망 포트 스캔, 내부 관리 인터페이스 접근이 가능합니다. HTTPC는 기본적으로 SSRF 방어를 활성화하여 사설/예약 IP 대역 연결을 차단합니다.

```go
cfg := httpc.DefaultConfig()
// AllowPrivateIPs = false(기본값) → 127.0.0.1, 10.x, 192.168.x, 169.254.x 등 차단

// 특정 CIDR 정밀 면제(예: VPN, VPC 내부 서비스)
cfg.Security.SSRFExemptCIDRs = []string{
    "10.0.0.0/8",    // VPC 내부
    "100.64.0.0/10", // Tailscale VPN
}

// 최강 SSRF 방어 프리셋
client, _ := httpc.New(httpc.SecureConfig())
```

### 차단되는 IP 범위

| 범위 | CIDR | 설명 |
|------|------|------|
| IPv4 루프백 | `127.0.0.0/8` | localhost |
| A 클래스 사설 | `10.0.0.0/8` | 내부망 |
| B 클래스 사설 | `172.16.0.0/12` | 내부망 |
| C 클래스 사설 | `192.168.0.0/16` | 내부망 |
| 링크 로컬 | `169.254.0.0/16` | 자동 설정(AWS/Azure 메타데이터 포함) |
| CGNAT | `100.64.0.0/10` | 통신사급 NAT(알리바바 클라우드 메타데이터 포함) |
| E 클래스 예약 | `240.0.0.0/4` | 예약 주소 |
| "이 네트워크" | `0.0.0.0/8` | 이 네트워크 식별자 |
| TEST-NET | `192.0.2.0/24` 등 | 문서 용도 |
| IPv6 루프백 | `::1/128` | localhost |
| IPv6 고유 로컬 | `fc00::/7` | 내부망 |
| IPv6 링크 로컬 | `fe80::/10` | 자동 설정 |

> 위 표는 주요 범위이며, 전체 목록(IPv4-mapped IPv6, NAT64 `64:ff9b::/96`, IPv6 문서 접두사 `2001:db8::/32` 등 포함)은 소스 코드 `isPrivateOrReservedIP`를 참조하세요. HTTPC는 10진수/16진수/8진수 등 전통적 IP 리터럴(예: `2130706433`, `0x7f000001`)도 차단하여 우회를 방지합니다. 자세한 내용은 [SSRF 방어](./ssrf)를 참조하세요.

## 요청 헤더 검증

`ValidateHeaders`(기본 활성화)는 CRLF 주입과 요청 헤더 밀반입을 자동으로 방지합니다 — 캐리지 리턴/라인 피드, 널 바이트 등 제어 문자를 포함한 요청 헤더 값을 거부합니다:

```go
// 다음 요청 헤더는 거부됨
httpc.WithHeader("X-Custom", "value\r\nInjected: header") // CRLF 주입
httpc.WithHeader("X-Bad", "value\x00null")                // 제어 문자
```

검증은 O(1) 룩업 테이블을 사용하여 성능 오버헤드가 극히 낮으며, `PerformanceConfig()`도 이 검증을 유지합니다.

## Cookie 보안

HTTPC는 3계층 Cookie 보안 제어를 제공합니다: 구성 수준(전역), 세션 수준(`SessionManager`), 요청 수준(`WithSecureCookie`).

### CookieSecurityConfig

`CookieSecurityConfig`는 Cookie가 충족해야 할 보안 속성을 정의하여 CSRF, XSS, 세션 하이재킹을 방어합니다:

| 필드 | 설명 | Default | Strict |
|------|------|---------|--------|
| `RequireSecure` | HTTPS 전송만 | `false` | `true` |
| `RequireHttpOnly` | JS 접근 금지 | `false` | `true` |
| `RequireSameSite` | SameSite 속성 | `""`(제한 없음) | `"Strict"` |
| `AllowSameSiteNone` | SameSite=None 허용 | `true` | `false` |
| `RequireSecureForSameSiteNone` | None은 Secure 필수 | `true` | `true` |

### 구성 수준 검증(전역)

```go
cfg := httpc.DefaultConfig()
// 엄격 모드: Secure + HttpOnly + SameSite=Strict 요구
cfg.Security.CookieSecurity = httpc.StrictCookieSecurityConfig()

// 또는 커스텀
cfg.Security.CookieSecurity = &httpc.CookieSecurityConfig{
    RequireSecure:   true,
    RequireHttpOnly: true,
    RequireSameSite: "Lax",
}
```

### 세션 수준 검증

```go
sm, _ := httpc.NewSessionManagerDefault()
// 이후 모든 SetCookie 호출에 영향, 추가 순서와 무관
sm.SetCookieSecurity(httpc.StrictCookieSecurityConfig())
```

### 요청 수준 검증

```go
security := &httpc.CookieSecurityConfig{
    RequireSecure:   true,
    RequireHttpOnly: true,
}
// 주의: WithSecureCookie는 WithCookie 이후에 배치해야 하며, 이때 이미 추가된 Cookie만 검증
result, err := client.Get("https://api.example.com",
    httpc.WithCookie(sessionCookie),
    httpc.WithSecureCookie(security),
)
```

:::warning
`WithSecureCookie`는 요청 수준의 "사후 검증"입니다: 적용 시점에 이미 존재하는 Cookie만 검증합니다. 반드시 모든 `WithCookie` 옵션 이후에 배치하세요. 추가 순서를 무시하는 전역 검증이 필요하면 구성 수준의 `CookieSecurity` 또는 세션 수준의 `SetCookieSecurity`를 사용하세요.
:::

## 압축 해제 폭탄 방어

공격자는 고압축률 gzip/deflate 응답으로 메모리를 고갈시킬 수 있습니다(예: 10MB 압축 데이터가 해제 후 수 GB). `MaxDecompressedBodySize`(기본값 100MB)는 해제 후 실제 크기를 제한하여 압축 해제 폭탄을 근원적으로 차단합니다.

```go
cfg := httpc.DefaultConfig()
cfg.Security.MaxDecompressedBodySize = 50 * 1024 * 1024 // 50MB 해제 상한
```

### 우선순위 관계

| 구성 상황 | 적용되는 제한 |
|----------|---------------|
| `MaxResponseBodySize`만 설정 | 이 값 기준(더 엄격) |
| `MaxDecompressedBodySize`만 설정 | 해제 후 크기 제한 |
| 둘 다 설정 | 더 작은 값(더 엄격한 쪽) 적용 |

:::tip
`MaxResponseBodySize`는 해제 전 전송 바이트를 제한하고, `MaxDecompressedBodySize`는 해제 후 실제 바이트를 제한합니다. 두 값이 협력하여 이중 방어를 제공합니다.
:::

## 요청 본문 크기 제한

`MaxRequestBodySize`는 업로드 요청 본문 크기를 제한하여, 클라이언트가 유도되어 초대형 요청을 보내 대역폭이나 메모리를 고갈시키는 것을 방지합니다.

```go
cfg := httpc.DefaultConfig()
cfg.Security.MaxRequestBodySize = 5 * 1024 * 1024 // 5MB 업로드 상한
```

:::warning
`MaxResponseBodySize`(기본값 10MB)와 달리 `MaxRequestBodySize`의 기본값은 **0(제한 없음)**이며, **자동 폴백 값이 없습니다**. 사용자 업로드 또는 프록시 전달 요청을 처리할 때는 반드시 명시적으로 상한을 설정해야 합니다.
:::

## 리다이렉트 보안

리다이렉트는 SSRF와 오픈 리다이렉트의 일반적인 매개체입니다. HTTPC는 다층 제어를 제공합니다:

```go
// 보안 민감 시나리오: 리다이렉트 완전 비활성화
cfg := httpc.SecureConfig() // FollowRedirects = false

// 또는 리다이렉트 대상 도메인 제한(와일드카드 *.example.com 지원)
cfg := httpc.DefaultConfig()
cfg.Security.RedirectWhitelist = []string{
    "api.example.com",
    "auth.example.com",
    "*.cdn.example.com",
}
```

`RedirectWhitelist`는 정확한 매칭과 와일드카드를 지원합니다: `*.example.com`은 `api.example.com` 등 엄격한 서브도메인을 매칭하지만, 네이키드 도메인 `example.com`은 매칭하지 않습니다(둘 다 개별적으로 나열해야 함). 허용 목록이 아닌 도메인으로의 리다이렉트는 차단됩니다. 리다이렉트 대상은 SSRF IP 검증도 동시에 거칩니다.

## 응답 헤더 크기 제한

`MaxResponseHeaderBytes`는 서버 응답 헤더 크기를 제한하여, 악의적인 서버가 초대형 응답 헤더를 보내 메모리를 고갈시키는 것을 방지합니다:

```go
cfg := httpc.DefaultConfig()
cfg.Connection.MaxResponseHeaderBytes = 1 * 1024 * 1024 // 1MB 응답 헤더 상한
```

기본값 0은 Go 표준 라이브러리 기본값(10MB) 사용을 의미합니다. 고보안 시나리오에서는 1MB로 조이는 것을 권장합니다.

## 보안 경고 메커니즘

HTTPC는 고위험 구성에 대해 비테스트 환경에서 `stderr` 경고를 출력하여 개발자가 적시에 수정하도록 알립니다. 두 가지 유형의 구성이 경고를 트리거합니다:

| 구성 | 경고 트리거 조건 | 경고 내용 |
|------|------------------|-----------|
| `InsecureSkipVerify = true` | `httpc.New()`에서 감지, 비테스트 환경 | TLS 인증서 검증 비활성화됨 |
| `TestingConfig()` | 호출 시 감지, 비테스트 환경 | TLS 검증, SSRF 방어, URL/요청 헤더 검증 비활성화됨 |

경고는 `sync.Once`로 보장되어 각 프로세스에서 최대 한 번씩만 트리거되며, 로그가 도배되는 것을 방지합니다. 테스트 환경 판정 기준: 실행 파일 확장자가 `.test`/`.test.exe`, 또는 `GO_TEST`/`GOTEST=1` 환경변수 설정.

### 경고 리다이렉트 또는 억제

```go
// 커스텀 writer로 리다이렉트(예: 구조화된 로그)
httpc.SetSecurityWarnOutput(os.Stdout)

// 완전 억제(권장하지 않음 — 경고는 보안 가이드라인이며 조용히 무시해서는 안 됨)
httpc.SetSecurityWarnOutput(io.Discard)
```

:::warning
`SetSecurityWarnOutput(io.Discard)`는 보안 경고를 조용히 무시합니다. 구성을 충분히 감사한 경우(예: `TestingConfig`가 테스트 바이너리에만 사용됨을 확인)에만 사용하고, 프로덕션 배포에서 경고를 숨기는 데 사용하지 마세요.
:::

## 파일 다운로드 보안

`Download`의 파일 경로는 `prepareFilePath`의 5계층 방어를 거쳐 경로 트래버설과 파일 덮어쓰기 공격을 방지합니다:

1. **UNC 경로 차단**: `\\server\share` 등 네트워크 경로 거부
2. **제어 문자 필터링**: 제어 문자(`< 0x20`, `0x7F`, `0x00`) 포함 경로 거부
3. **시스템 경로 보호**: `/etc`, `/bin`, `C:\Windows` 등 시스템 디렉토리 쓰기 거부(부모 디렉토리 심볼릭 링크 해석 포함)
4. **경로 트래버설 검출**: `filepath.Clean` 후 `../`로 작업 디렉토리 이탈 차단
5. **심볼릭 링크 방어**: 심볼릭 링크가 대상인 경로 거부, 부모 디렉토리 재귀 검사로 TOCTOU 공격 방지

다운로드 완료 후 `Checksum` 필드로 파일 무결성을 검증(SHA-256)할 수 있으며, 검증 실패 시 다운로드된 파일을 자동 삭제합니다.

## 감사 미들웨어

`AuditMiddleware`는 각 요청/응답 주기에 대해 구조화된 감사 이벤트를 생성하며, 규정 준수 요구사항이 엄격한 시나리오(금융, 의료, 정부)에 적합합니다. URL은 자동 마스킹(자격 증명 제거)되며, 민감한 요청 헤더(Authorization, Cookie 등)는 기본 마스킹됩니다.

```go
auditMiddleware := httpc.AuditMiddleware(&httpc.AuditConfig{
    OnAudit: func(event httpc.AuditEvent) {
        // event.URL은 마스킹됨; SourceIP/UserID는 context에서 추출
        log.Printf("[AUDIT] %s %s -> %d (%v)",
            event.Method, event.URL, event.StatusCode, event.Duration)
    },
    Format:         "json",   // text 또는 json
    IncludeHeaders: true,     // 요청/응답 헤더 기록(민감한 헤더 마스킹)
    MaskHeaders:    []string{"Authorization", "Cookie", "Set-Cookie"},
    SanitizeError:  true,     // 오류 내 민감 정보 정리
})

cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{auditMiddleware}
```

`SourceIP`와 `UserID`는 context 키로 주입됩니다: `httpc.SourceIPKey`, `httpc.UserIDKey`. 전체 감사 필드, 구성 옵션, 프로덕션 실천 방법은 [프로덕션 체크리스트](./production-checklist)를 참조하세요.

## 다음 단계

- [SSRF 방어](./ssrf) - SSRF 방어 상세, CIDR 면제와 클라우드 메타데이터 보호
- [TLS와 인증서 고정](./tls-certpin) - TLS 구성, 인증서 고정과 mTLS
- [프로덕션 체크리스트](./production-checklist) - 출시 전 분류 점검 항목과 검증 방법
