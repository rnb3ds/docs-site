---
sidebar_label: "설정"
title: "설정 - CyberGo HTTPC | Config와 프리셋"
description: "HTTPC 설정 시스템 API 레퍼런스: Config 구조체 및 Timeouts, Connection, Security, Retry, Middleware 하위 설정, DefaultConfig 등 5가지 프리셋과 ValidateConfig 검증의 완전한 필드 설명."
sidebar_position: 1
---

# 설정

## Config

```go
type Config struct {
    Timeouts   TimeoutConfig
    Connection ConnectionConfig
    Security   SecurityConfig
    Retry      RetryConfig
    Middleware MiddlewareConfig
    Defaults   RequestDefaults
}
```

메인 설정 구조체로, 다섯 가지 하위 설정과 `Defaults`는 모두 **값 타입**입니다. `DefaultConfig()`를 통해 보안 기본값을 얻을 수 있으며, 반환된 Config 의 필드를 직접 수정할 수 있습니다.

```go
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 60 * time.Second
cfg.Retry.MaxRetries = 5
client, err := httpc.New(cfg)
```

## TimeoutConfig

```go
type TimeoutConfig struct {
    Request        time.Duration // 총 요청 타임아웃 (재시도 포함), 기본 180s
    Dial           time.Duration // TCP 연결 타임아웃, 기본 10s
    TLSHandshake   time.Duration // TLS 핸드셰이크 타임아웃, 기본 10s
    ResponseHeader time.Duration // 응답 헤더 대기 타임아웃, 기본 0 (비활성화, 컨텍스트 타임아웃에 의존)
    IdleConn       time.Duration // 유휴 연결 유지 시간, 기본 90s
}
```

| 필드 | 기본값 | 최대값 |
|------|--------|--------|
| Request | 180s | 30min |
| Dial | 10s | 30min |
| TLSHandshake | 10s | 30min |
| ResponseHeader | 0 | 30min |
| IdleConn | 90s | 30min |

0 으로 설정하면 타임아웃 없음 (프로덕션 환경에서는 권장하지 않음).

:::tip ResponseHeader 설계
`ResponseHeader`는 기본값이 0(비활성화) 이며, 이때 `TimeoutConfig.Request` 또는 `WithTimeout()`이 유일한 타임아웃 메커니즘으로 작동하여 `WithTimeout()`이 요청 지속 시간을 완전히 제어합니다. 이 설계는 AI API 와 롱 폴링 등 응답 시간 연장이 필요한 시나리오에 적합합니다. 전송 계층의 엄격한 상한 (Slowloris 공격 방어 등) 이 필요한 경우에만 양수로 설정하되, 이는 `WithTimeout`을 덮어쓴다는 점에 유의하세요.
:::

## ProxyStrategy

```go
type ProxyStrategy = proxypool.Strategy

const (
    ProxyStrategyRoundRobin = proxypool.StrategyRoundRobin // 라운드 로빈 (기본값)
    ProxyStrategyRandom     = proxypool.StrategyRandom     // 무작위
)
```

프록시 풀 선택 전략.

| 상수 | 설명 |
|------|------|
| `ProxyStrategyRoundRobin` | 라운드 로빈 (기본값), 매 선택마다 다음 프록시로 진행하여 재시도 시 자연스럽게 다른 IP 로 떨어짐 |
| `ProxyStrategyRandom` | 무작위, 건강한 프록시 중에서 균일하게 무작위 선택 |

## ConnectionConfig

```go
type ConnectionConfig struct {
    MaxIdleConns           int           // 전역 최대 유휴 연결, 기본 50
    MaxConnsPerHost        int           // 호스트당 최대 연결 수, 기본 10
    ProxyURL               string        // 프록시 주소, 예: "http://proxy:8080"
    EnableSystemProxy      bool          // 시스템 프록시 자동 감지, 기본 false
    ProxyPool              []string      // 순환에 사용할 프록시 서버 목록
    ProxyPoolStrategy      ProxyStrategy // 프록시 선택 전략, 기본 RoundRobin
    ProxyFailureThreshold  int           // 연속 실패 임계값, 0 이면 기본값 3
    ProxyCooldown          time.Duration // 서킷 브레이크 대기 시간, 0 이면 기본값 30s
    ProxyRotateOnStatus    []int         // 프록시 순환을 트리거하는 HTTP 상태 코드
    EnableHTTP2            bool          // HTTP/2 활성화, 기본 true
    EnableCookies          bool          // Cookie 관리 활성화, 기본 false
    EnableDoH              bool          // DNS-over-HTTPS 활성화, 기본 false
    DoHCacheTTL            time.Duration // DoH 캐시 TTL, 기본 5min
    MaxResponseHeaderBytes int64         // 응답 헤더 최대 바이트 수, 기본 0 (Go 표준 라이브러리 기본값 10MB 사용)
}
```

### 프록시 풀

`ProxyPool`은 프록시 서버 집합을 지정하며, 요청은 `ProxyPoolStrategy`에 따라 프록시 간에 분배됩니다. 연결 실패 (dial/TLS) 시 수동 서킷 브레이킹이 트리거됩니다: `ProxyFailureThreshold` 횟수만큼 실패가 누적되면 해당 프록시는 일시적으로 순환에서 제거되고, `ProxyCooldown` 이후에 복구됩니다 (하프 오픈 프로빙).

우선순위: `ProxyURL`보다 낮고, `EnableSystemProxy`보다 높습니다. `ProxyURL`과 `ProxyPool`을 동시에 설정하면 `ProxyURL`이 적용됩니다 (단일 프록시 모드).

`ProxyRotateOnStatus`는 재시도 시 프록시 전환을 트리거하는 HTTP 상태 코드를 지정합니다 (예: CF/WAF 의 IP 기반 차단에 `[]int{403}`). 연결 실패와 달리 상태 코드 순환은 프록시를 서킷 브레이킹 **하지 않습니다** — 차단은 종종 타겟별로 발생하기 때문입니다 (한 프록시가 특정 사이트에서 차단되더라도 다른 사이트에서는 정상일 수 있음). 적용하려면 `Retry.MaxRetries > 0`이 필요합니다.

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyPool = []string{
    "http://proxy1:8080",
    "http://proxy2:8080",
    "http://proxy3:8080",
}
cfg.Connection.ProxyPoolStrategy = httpc.ProxyStrategyRoundRobin
cfg.Connection.ProxyFailureThreshold = 3
cfg.Connection.ProxyCooldown = 30 * time.Second
cfg.Connection.ProxyRotateOnStatus = []int{403}
```

### DNS-over-HTTPS

DoH 를 활성화하여 DNS 해석 지연을 줄이고 DNS 하이재킹을 방지합니다:

```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableDoH = true
cfg.Connection.DoHCacheTTL = 5 * time.Minute
```

기본 DoH 제공자 (우선순위 순): Cloudflare → Google → AliDNS. 자세한 내용은 [연결 풀](../../guides/connection-pool)를 참조하세요.

## SecurityConfig

```go
type SecurityConfig struct {
    TLSConfig               *tls.Config           // 커스텀 TLS 설정
    MinTLSVersion           uint16                // 최소 TLS 버전, 기본 TLS 1.2
    MaxTLSVersion           uint16                // 최대 TLS 버전, 기본 TLS 1.3
    InsecureSkipVerify      bool                  // 인증서 검증 건너뛰기 (테스트만)
    MaxResponseBodySize     int64                 // 응답 본문 크기 제한, 기본 10MB
    MaxRequestBodySize      int64                 // 요청 본문 크기 제한, 기본 0 (요청 본문 크기를 제한하지 않음; MaxResponseBodySize 와 달리 자동 폴백 없음)
    MaxDecompressedBodySize int64                 // 압축 해제 후 크기 제한, 기본 100MB
    AllowPrivateIPs         bool                  // 사설 IP 허용, 기본 false
    SSRFExemptCIDRs         []string              // SSRF 면제 CIDR
    ValidateURL             bool                  // URL 검증, 기본 true
    ValidateHeaders         bool                  // 요청 헤더 검증, 기본 true
    StrictContentLength     bool                  // 엄격한 Content-Length, 기본 true
    CookieSecurity          *CookieSecurityConfig // Cookie 보안 검증
    CertificatePinner       CertificatePinner     // 인증서 고정 (SPKI 해시/공개키), 기본 nil (비활성화)
    RedirectWhitelist       []string              // 리다이렉트 허용 도메인
}
```

### 인증서 고정 (CertificatePinner)

`CertificatePinner`는 인증서 고정을 활성화합니다: 서버가 고정된 키/인증서를 제공하지 않으면 TLS 핸드셰이크가 거부되므로, 신뢰할 수 있는 CA 가 침해되더라도 중간자 공격을 방어할 수 있습니다. 기본값은 `nil`(비활성화) 입니다. 다음 생성자로 만듭니다:

| 생성자 | 설명 |
|----------|------|
| `NewSPKIHashPinner(hashes ...string) (CertificatePinner, error)` | 하나 이상의 base64 인코딩된 SPKI SHA-256 해시로 생성 (가장 일반적으로 사용, 키 로테이션 지원) |
| `NewPublicKeyPinner(publicKeys ...[]byte) (CertificatePinner, error)` | DER 인코딩된 PKIX 공개키로 생성 (내부적으로 SHA-256 계산) |
| `NewCertificatePinnerChain(pinners ...CertificatePinner) CertificatePinner` | 여러 pinner 를 조합, 어느 하나라도 통과하면 수락 |

```go
pinner, err := httpc.NewSPKIHashPinner(
    "YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2fuihg=", // 현재 키
    "C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=", // 백업 키 (로테이션)
)
if err != nil {
    log.Fatal(err)
}

cfg := httpc.DefaultConfig()
cfg.Security.CertificatePinner = pinner
client, err := httpc.New(cfg)
```

:::warning 유지보수 비용
인증서 고정은 서버가 인증서를 교체할 때 (예: Let's Encrypt 갱신) 고정 값도 함께 업데이트해야 합니다. 여러 해시 (현재 + 백업) 를 고정하고 업데이트 메커니즘을 구축하여 키 로테이션으로 인한 연결 중단을 방지하는 것을 권장합니다.
:::

:::warning SSRF 방어
`AllowPrivateIPs`는 기본값이 `false`이며, 사설/예약 IP(127.0.0.1, 10.x, 192.168.x 등) 연결을 차단합니다. 내부 서비스에 연결할 때만 `true`로 설정하세요.
:::

### SSRF 면제 예제

```go
cfg := httpc.DefaultConfig()
cfg.Security.SSRFExemptCIDRs = []string{
    "10.0.0.0/8",       // VPC 내부
    "100.64.0.0/10",    // Tailscale
}
```

## RetryConfig

```go
type RetryConfig struct {
    MaxRetries    int           // 최대 재시도 횟수, 기본 3
    Delay         time.Duration // 초기 재시도 지연, 기본 1s
    BackoffFactor float64       // 백오프 배수, 기본 2.0
    EnableJitter  bool          // 지터 활성화, 기본 true
    MaxRetryDelay time.Duration // 최대 재시도 지연 상한, 기본 30s
    CustomPolicy  RetryPolicy   // 커스텀 재시도 전략
}
```

| 필드 | 기본값 | 범위 |
|------|--------|------|
| MaxRetries | 3 | 0-10 |
| Delay | 1s | 0-30min |
| BackoffFactor | 2.0 | 1.0-10.0 |
| MaxRetryDelay | 30s | 0-30min |

재시도 지연 공식: `min(Delay * BackoffFactor^attempt + jitter, MaxRetryDelay)`

## MiddlewareConfig

```go
type MiddlewareConfig struct {
    Middlewares []MiddlewareFunc // 미들웨어 목록, 기본 nil
}
```

미들웨어 체인만 포함합니다. 요청 기본값 (User-Agent, 기본 요청 헤더, 리다이렉트 정책) 은 [`RequestDefaults`](#requestdefaults)로 이동했습니다.

## RequestDefaults

```go
type RequestDefaults struct {
    UserAgent       string            // User-Agent, 기본 "httpc/1.0"
    Headers         map[string]string // 기본 요청 헤더, 기본 비어 있음
    FollowRedirects bool              // 리다이렉트 따라가기, 기본 true
    MaxRedirects    int               // 최대 리다이렉트 횟수, 기본 10
}
```

요청별 기본값의 정규 위치: User-Agent, 기본 요청 헤더, 리다이렉트 정책. `DefaultConfig()`로 합리적인 기본값을 얻은 후 필요에 따라 수정합니다.

```go
cfg := httpc.DefaultConfig()
cfg.Defaults.UserAgent = "myapp/2.0"
cfg.Defaults.Headers = map[string]string{"Accept": "application/json"}
cfg.Defaults.MaxRedirects = 5
```

## 설정 프리셋

### DefaultConfig

```go
func DefaultConfig() Config
```

보안 기본 설정. SSRF 방어가 기본적으로 활성화되어 있습니다.

### SecureConfig

```go
func SecureConfig() Config
```

보안 우선 설정. 더 짧은 타임아웃, 자동 리다이렉트 비활성화, 엄격한 SSRF 방어.

| 설정 항목 | 값 |
|-----------|-----|
| Request 타임아웃 | 15s |
| Dial 타임아웃 | 5s |
| TLSHandshake 타임아웃 | 5s |
| ResponseHeader 타임아웃 | 10s (Slowloris 방어) |
| IdleConn 타임아웃 | 30s |
| MaxIdleConns | 20 |
| MaxConnsPerHost | 5 |
| MaxResponseBodySize | 5MB |
| MaxRetries | 1 |
| Delay | 2s |
| EnableJitter | true |
| FollowRedirects | false |

### PerformanceConfig

```go
func PerformanceConfig() Config
```

고처리량 설정. 더 큰 연결 풀, 더 긴 타임아웃, 보안 검증은 유지.

:::tip
PerformanceConfig 은 보안을 위해 `ValidateURL`과 `ValidateHeaders`를 활성화 상태로 유지합니다. 신뢰할 수 있는 환경에서 최대 성능이 필요한 경우 `cfg.Security.ValidateURL = false`로 수동 비활성화할 수 있으나, 보안 위험 (주입 공격, SSRF) 에 주의하세요.
:::

| 설정 항목 | 값 |
|-----------|-----|
| Request 타임아웃 | 60s |
| Dial 타임아웃 | 15s |
| TLSHandshake 타임아웃 | 15s |
| ResponseHeader 타임아웃 | 0 (비활성화, Request 타임아웃 사용) |
| IdleConn 타임아웃 | 120s |
| MaxIdleConns | 100 |
| MaxConnsPerHost | 20 |
| EnableCookies | true |
| MaxResponseBodySize | 50MB |
| StrictContentLength | false |
| ValidateURL | true |
| ValidateHeaders | true |
| Delay | 500ms |
| BackoffFactor | 1.5 |
| EnableJitter | true |

### TestingConfig

```go
func TestingConfig() Config
```

테스트 환경 설정. 보안 검사 비활성화, 짧은 타임아웃.

| 설정 항목 | 값 |
|-----------|-----|
| Dial 타임아웃 | 5s |
| TLSHandshake 타임아웃 | 5s |
| ResponseHeader 타임아웃 | 0 (비활성화, Request 타임아웃 사용) |
| IdleConn 타임아웃 | 30s |
| MaxIdleConns | 10 |
| MaxConnsPerHost | 5 |
| EnableHTTP2 | false |
| EnableCookies | true |
| InsecureSkipVerify | true |
| AllowPrivateIPs | true |
| ValidateURL | false |
| ValidateHeaders | false |
| MaxRetries | 1 |
| Delay | 100ms |
| EnableJitter | false |
| UserAgent | httpc-test/1.0 |

:::danger
이 설정은 TLS 검증과 SSRF 방어를 비활성화하므로 **테스트에만 사용**하세요. 테스트 환경 외부에서 사용하면 보안 경고가 출력됩니다 (자세한 내용은 [보안 경고 출력](#setsecuritywarnoutput) 참조).
:::

### MinimalConfig

```go
func MinimalConfig() Config
```

경량 설정. 재시도와 리다이렉트 비활성화, 최소 연결 풀.

| 설정 항목 | 값 |
|-----------|-----|
| Dial 타임아웃 | 5s |
| TLSHandshake 타임아웃 | 5s |
| ResponseHeader 타임아웃 | 0 (비활성화, Request 타임아웃 사용) |
| IdleConn 타임아웃 | 30s |
| MaxIdleConns | 10 |
| MaxConnsPerHost | 2 |
| MaxResponseBodySize | 1MB |
| MaxRetries | 0 |
| Delay | 0 |
| BackoffFactor | 1.0 |
| EnableJitter | false |
| FollowRedirects | false |

## 보안 경고 출력

### SetSecurityWarnOutput

```go
func SetSecurityWarnOutput(w io.Writer)
```

보안 경고의 출력 대상을 설정합니다. `TestingConfig()`를 사용하거나 `SecurityConfig.InsecureSkipVerify`(`Config.Security`) 를 `true`로 설정하면, httpc 는 이 writer 에 `[SECURITY WARNING]` 수준의 경고를 출력합니다 (각 경고 유형별로 프로세스당 최대 한 번). 기본 출력은 `os.Stderr`이며, `io.Discard`를 전달하면 경고를 완전히 억제하여 테스트나 이미 알려진 안전한 내부 시나리오에서 조용히 실행할 수 있습니다.

```go
// 테스트에서 보안 경고 억제
httpc.SetSecurityWarnOutput(io.Discard)
cfg := httpc.TestingConfig()
```

:::tip 영향 범위
이 설정은 프로세스 수준의 전역 상태이며, 이후에 생성되는 모든 클라이언트에 영향을 줍니다. `TestingConfig`와 `InsecureSkipVerify` 두 가지 경고는 각각 독립적으로 카운트됩니다 (서로의 트리거에 영향을 주지 않음), 하지만 동일한 출력 writer 를 공유합니다.
:::

## 검증

### ValidateConfig

```go
func ValidateConfig(cfg *Config) error
```

설정의 유효성을 검증합니다. `New()` 내부에서 자동 호출되지만, 명시적으로 호출할 수도 있습니다.

```go
cfg := httpc.DefaultConfig()
cfg.Retry.MaxRetries = 100 // 범위 초과

if err := httpc.ValidateConfig(&cfg); err != nil {
    log.Fatal(err) // invalid retry configuration: Retry.MaxRetries must be 0-10, got 100
}
```

### Config.String

```go
func (c *Config) String() string
```

안전한 문자열 표현을 반환합니다. ProxyURL 자격 증명은 마스킹되고, TLSConfig 는 `<configured>` 또는 `<default>`로 표시되며, Headers 는 출력되지 않습니다.

```go
cfg := httpc.DefaultConfig()
fmt.Println(cfg.String())
// Config{Timeouts:{Request: 3m0s, ...}, Security:{TLSConfig: <default>, ...}}
```

## Cookie 보안

### CookieSecurityConfig

```go
type CookieSecurityConfig struct {
    RequireSecure                bool
    RequireHttpOnly              bool
    RequireSameSite              string
    AllowSameSiteNone            bool
    RequireSecureForSameSiteNone bool
}
```

Cookie 보안 속성 검증 설정.

| 필드 | 타입 | 설명 |
|------|------|------|
| RequireSecure | `bool` | Cookie 에 Secure 속성 설정 요구 |
| RequireHttpOnly | `bool` | Cookie 에 HttpOnly 속성 설정 요구 |
| RequireSameSite | `string` | 요구되는 SameSite 값, 예: `"Strict"`, `"Lax"`, 빈 문자열은 검사하지 않음 |
| AllowSameSiteNone | `bool` | SameSite=None 허용 여부 |
| RequireSecureForSameSiteNone | `bool` | SameSite=None 일 때 Secure 속성 요구 (기본 `true`) |

### DefaultCookieSecurityConfig

```go
func DefaultCookieSecurityConfig() *CookieSecurityConfig
```

기본 Cookie 보안 설정. Secure/HttpOnly/SameSite 속성을 요구하지 않지만, SameSite=None 인 Cookie 는 반드시 Secure 를 설정해야 합니다.

### StrictCookieSecurityConfig

```go
func StrictCookieSecurityConfig() *CookieSecurityConfig
```

엄격한 Cookie 보안 설정. Secure, HttpOnly 및 SameSite=Strict 을 요구합니다.

```go
cfg := httpc.DefaultConfig()
cfg.Security.CookieSecurity = httpc.StrictCookieSecurityConfig()
```
