---
sidebar_label: "연결 풀과 프록시"
title: "연결 풀과 프록시 - CyberGo HTTPC | 풀 튜닝과 프록시 설정"
description: "HTTPC 연결 풀과 프록시 설정 가이드: MaxIdleConns 풀 튜닝과 시나리오 추천, ProxyURL 수동 프록시와 SOCKS5, EnableSystemProxy 자동 감지, ProxyPool 프록시 풀 회전과 수동 서킷 브레이킹, ProxyRotatePerRequest 요청별 회전, ProxyRotateOnStatus 상태 코드 회전, DoH와 HTTP/2 설정 실무."
sidebar_position: 8
---

# 연결 풀과 프록시

## 연결 풀 설정

연결 풀은 HTTP 클라이언트 성능의 핵심 요소입니다. HTTPC 은 `ConnectionConfig`로 연결 풀을 관리합니다.

```go
cfg := httpc.DefaultConfig()

// 연결 풀 매개변수
cfg.Connection.MaxIdleConns = 100         // 전역 최대 유휴 연결
cfg.Connection.MaxConnsPerHost = 20       // 호스트당 최대 연결 수
cfg.Timeouts.IdleConn = 120 * time.Second // 유휴 연결 유지 시간
```

### 매개변수 설명

| 매개변수 | 기본값 | 설명 |
|-----------|--------|------|
| `MaxIdleConns` | 50 | 전역 최대 유휴 연결 수 |
| `MaxConnsPerHost` | 10 | 호스트당 최대 연결 수 (활성 + 유휴 포함) |
| `IdleConn` | 90s | 유휴 연결 타임아웃, 초과 시 연결 닫기 |
| `Dial` | 10s | 연결 수립 타임아웃 |
| `TLSHandshake` | 10s | TLS 핸드셰이크 타임아웃 |
| `ResponseHeader` | 0 | 비활성화 (Request 타임아웃 사용) |

### 시나리오별 추천

| 시나리오 | MaxIdleConns | MaxConnsPerHost | IdleConn |
|----------|-------------|-----------------|----------|
| 고동시성 API | 100 | 20 | 120s |
| 일반 서비스 | 50 | 10 | 90s |
| 저빈도 요청 | 10 | 2 | 30s |
| 마이크로서비스 내부 | 50 | 10 | 60s |

:::tip
`MaxConnsPerHost`는 활성 연결과 유휴 연결을 모두 포함합니다. 이 제한을 초과하는 새 요청은 연결 해제를 대기합니다.
:::

## 프록시

HTTPC 는 네 가지 프록시 모드를 지원하며, 우선순위에 따라 자동으로 선택됩니다. 모든 프록시 설정은 `ConnectionConfig`에서 구성합니다.

### 수동 프록시

`ProxyURL`로 고정 프록시를 지정합니다 (최우선):

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyURL = "http://proxy.example.com:8080"

client, _ := httpc.New(cfg)
```

인증이 포함된 프록시:

```go
cfg.Connection.ProxyURL = "http://user:password@proxy.example.com:8080"
```

:::tip
`Config.String()` 메서드는 프록시 URL 의 사용자 이름과 비밀번호를 자동으로 마스킹합니다.
:::

### SOCKS5 프록시

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyURL = "socks5://proxy.example.com:1080"
```

### 시스템 프록시 자동 감지

운영체제의 프록시 설정을 자동으로 감지합니다:

```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableSystemProxy = true
```

| 플랫폼 | 감지 소스 |
|--------|----------|
| Windows | 레지스트리 Internet Settings |
| macOS | 시스템 환경설정 네트워크 프록시 |
| Linux | 환경 변수 `HTTP_PROXY` / `HTTPS_PROXY` |

### 프록시 풀

여러 프록시 IP 에 요청을 분산해야 할 때 (스크래핑, 부하 분산, IP 회전), 프록시 풀은 자동 회전, 수동 서킷 브레이킹, 상태 코드 기반 회전을 제공합니다 — 외부 컴포넌트 불필요.

#### 기본 사용법

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyPool = []string{
    "http://proxy1:8080",
    "http://proxy2:8080",
    "http://proxy3:8080",
}
cfg.Connection.ProxyPoolStrategy = httpc.ProxyStrategyRoundRobin // 기본값

client, err := httpc.New(cfg)
```

각 요청마다 풀에서 프록시를 자동으로 선택합니다. `http`, `https`, `socks5`, `socks5h` 프로토콜을 지원합니다.

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `ProxyPool` | `[]string` | `nil` | 프록시 URL 목록 |
| `ProxyPoolStrategy` | `ProxyStrategy` | `RoundRobin` | 선택 전략 |
| `ProxyFailureThreshold` | `int` | `3` (0 이면 기본값) | 연속 실패 서킷 브레이크 임계값 |
| `ProxyCooldown` | `time.Duration` | `30s` (0 이면 기본값) | 서킷 브레이크 프록시 대기 시간 |
| `ProxyRotatePerRequest` | `bool` | `false` | 각 독립적인 요청마다 프록시 강제 교체 (유휴 연결 재사용 비활성화) |
| `ProxyRotateOnStatus` | `[]int` | `nil` | 프록시 회전을 트리거하는 상태 코드 |

#### 선택 전략

| 전략 | 상수 | 설명 |
|------|------|------|
| 라운드 로빈 | `ProxyStrategyRoundRobin` | 순서대로 순환 선택, 재시도 시 자동으로 다음 프록시로 이동 |
| 무작위 | `ProxyStrategyRandom` | 정상 프록시 중 균일하게 무작위 선택 |

라운드 로빈(기본값)은 재시도 시 자동으로 다른 프록시 IP 를 선택합니다 — 매 재시도마다 커서가 진행되어 자연스럽게 다음 프록시로 이동합니다.

#### 수동 서킷 브레이킹

프록시 풀은 수동 헬스 체크를 내장합니다. **연결 수준 실패**(dial/TLS)만 서킷 브레이크를 트리거하며, HTTP 상태 코드는 트리거하지 않습니다:

```text
프록시 연결 실패
    ↓
실패 카운트 +1
    ↓
연속 실패 ≥ ProxyFailureThreshold → 서킷 오픈 (회전에서 제거)
    ↓
ProxyCooldown 대기 → 하프 오픈 프로브 (회전 복원)
    ↓
성공 → 카운트 리셋, 서킷 클로즈
첫 실패 → 서킷 재오픈
```

```go
cfg.Connection.ProxyFailureThreshold = 5           // 더 관대하게, 일시적 문제 허용
cfg.Connection.ProxyCooldown = 60 * time.Second    // 더 긴 대기 시간
```

모든 프록시가 서킷 브레이크된 경우, 대기 시간이 가장 짧은 (복원에 가장 가까운) 프록시를 폴백으로 반환하며, 즉시 실패하지 않습니다.

#### 상태 코드 회전

Cloudflare/WAF 등 IP 차단 시나리오에서 — 특정 상태 코드 반환 시 자동으로 다른 프록시로 재시도합니다:

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyPool = []string{
    "http://proxy1:8080",
    "http://proxy2:8080",
    "http://proxy3:8080",
}
cfg.Connection.ProxyRotateOnStatus = []int{403}  // 403 수신 시 프록시 회전
cfg.Retry.MaxRetries = 3                          // 재시도 활성화 필수

client, err := httpc.New(cfg)
```

:::warning 상태 코드 회전 ≠ 서킷 브레이킹
`ProxyRotateOnStatus`로 트리거된 회전은 프록시를 서킷 브레이크하지 **않습니다** — IP 차단은 대상별인 경우가 많습니다 (A 사이트에서 차단된 프록시가 B 사이트에서는 정상일 수 있음). 서킷 브레이킹은 연결 수준 실패로만 트리거됩니다. `Retry.MaxRetries > 0`이 필요합니다.

`ProxyRotateOnStatus`가 설정되고 풀에 여러 프록시가 있는 경우, 재시도 예산이 자동으로 `len(ProxyPool) - 1`로 상향됩니다 (`MaxRetries` 상한 10으로 제한), 모든 프록시가 시도될 기회를 보장합니다.
:::

#### 요청별 로테이션

`ProxyRotatePerRequest`는 **연결 재사용**으로 인해 프록시 터널이 고정되는 문제를 해결합니다: HTTP 연결 풀은 이미 설정된 TCP 연결을 재사용하며, 여기에는 프록시 터널도 포함됩니다. 이는 동일한 호스트에 대한 연속 요청이 `ProxyPoolStrategy`가 선택기 커서를 이미 회전했더라도 이전 요청의 프록시를 재사용함을 의미합니다.

활성화하면, 매 요청 시작 시 모든 유휴 연결을 닫아 Transport가 프록시 풀을 다시 평가하도록 강제합니다 — 대가로 연결 재사용이 없지만(매 요청마다 새 연결 + 프록시 터널), 요청별 회전이 보장됩니다:

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyPool = []string{
    "http://proxy1:8080",
    "http://proxy2:8080",
    "http://proxy3:8080",
}
cfg.Connection.ProxyRotatePerRequest = true  // 매 요청마다 프록시 교체

client, err := httpc.New(cfg)
```

:::tip 적용 시나리오
동일한 호스트에 대한 스크래핑/데이터 수집에 적용 — 매 요청의 소스 IP가 달라 대상 사이트의 IP 차단 위험을 낮춥니다. 서로 다른 호스트에 대한 요청은 연결 재사용이 동일한 프록시에 바인딩되지 않으므로 보통 활성화할 필요가 없습니다.
:::

`ProxyRotateOnStatus`와 마찬가지로, `ProxyRotatePerRequest`도 프록시 풀에 여러 프록시가 있는 경우 재시도 예산을 자동으로 `len(ProxyPool) - 1`로 상향하여, 각 프록시가 최소 한 번 시도되도록 보장합니다.

### 프록시 우선순위

여러 프록시 모드를 동시에 구성한 경우, 우선순위에 따라 적용됩니다:

| 우선순위 | 설정 | 동작 |
|---------|------|------|
| 1 (최고) | `ProxyURL` | 항상 지정된 프록시 사용 (단일 프록시 모드) |
| 2 | `ProxyPool` | 프록시 풀에서 회전 |
| 3 | `EnableSystemProxy` | 시스템 프록시 자동 감지 |
| 4 (최저) | 없음 | 직접 연결 |

:::tip
`ProxyURL`과 `ProxyPool`을 모두 설정한 경우 `ProxyURL`이 적용됩니다. 프록시 풀을 사용하려면 `ProxyURL`을 비우세요.
:::

### 내장 보안

프록시 관련 기능은 다음 보안 세부 사항을 자동으로 처리합니다 — 수동 구성 불필요:

- **SSRF 면제**: 프록시 호스트 주소가 자동으로 SSRF 면제 목록에 추가되어, 사설 IP 검사에 의해 차단되지 않습니다
- **중복 제거**: 동일한 `host:port`를 가진 항목이 자동으로 병합되어, 회전 편향과 중복 카운트를 방지합니다
- **URL 검증**: 모든 프록시 URL이 보안 검증됩니다 (CRLF 주입 방지, 프로토콜 화이트리스트)

전체 필드 설명은 [설정 API — 프록시 풀](../api-reference/client-config/config#프록시-풀)을 참조하세요.

## DNS-over-HTTPS

DoH 를 활성화하여 DNS 해석 지연을 줄이고 DNS 하이재킹을 방지합니다:

```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableDoH = true
cfg.Connection.DoHCacheTTL = 5 * time.Minute
```

기본 DoH 제공자 (우선순위 순):

| 제공자 | 주소 | 설명 |
|--------|------|------|
| Cloudflare | `1.1.1.1/dns-query` | 가장 빠름, 프라이버시 우선 |
| Google | `dns.google/resolve` | 글로벌 커버리지 |
| AliDNS | `dns.alidns.com/resolve` | 중국 지역 최적화 |

:::tip
DoH 활성화 시 DNS 해석 결과가 `DoHCacheTTL` 시간 동안 캐시됩니다. 모든 DoH 제공자를 사용할 수 없는 경우 시스템 DNS 로 폴백합니다.
:::

## HTTP/2

기본적으로 HTTP/2가 활성화되어 있습니다 (TLS 필요):

```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableHTTP2 = false // HTTP/2 비활성화
```

HTTP/2 특징:
- 멀티플렉싱: 단일 연결로 여러 동시 요청 처리
- 헤더 압축: 반복 헤더 전송 감소
- 서버 푸시

## 객체 풀 재사용

HTTPC 는 내부적으로 엔진 응답 객체와 문자열 빌더를 sync.Pool 로 재사용하여 GC 부하를 줄이며, Result 는 매 요청마다 새로 생성되어 GC 가 자동 회수합니다.

```go
result, err := client.Get(url)
if err != nil {
    return err
}
// Result 는 매 요청마다 새로 생성, GC 가 자동 회수, 수동 해제 불필요
```

고동시성 시나리오에서 내부 객체 풀 재사용은 GC 부하를 크게 줄일 수 있습니다.

## 동시성 요청 패턴

```go
func fetchAll(ctx context.Context, urls []string) ([]*httpc.Result, error) {
    results := make([]*httpc.Result, len(urls))
    errs := make([]error, len(urls))

    var wg sync.WaitGroup
    for i, url := range urls {
        wg.Add(1)
        go func(idx int, u string) {
            defer wg.Done()
            result, err := client.Request(ctx, "GET", u)
            results[idx] = result
            errs[idx] = err
        }(i, url)
    }
    wg.Wait()

    for _, err := range errs {
        if err != nil {
            return nil, err
        }
    }
    return results, nil
}
```

## 자주 묻는 질문

| 문제 | 원인 | 해결 방법 |
|------|------|-----------|
| 대량의 TIME_WAIT | 유휴 연결 타임아웃이 너무 짧음 | `IdleConn` 타임아웃 증가 |
| 연결 거부 | 호스트당 연결 수 부족 | `MaxConnsPerHost` 증가 |
| 요청 대기 | 연결 풀이 너무 작음 | `MaxIdleConns` 증가 |
| 프록시 미작동 | `ProxyURL`과 `ProxyPool`을 동시 설정 | `ProxyURL` 비우기, `ProxyPool`만 사용 |
| 프록시 잦은 서킷 브레이크 | `ProxyFailureThreshold`가 너무 낮음 | 임계값 또는 `ProxyCooldown` 증가 |

성능 안티패턴과 최적화 제안의 전체 내용은 [성능 최적화](./performance)를 참조하세요.

## 다음 단계

- [성능 최적화](./performance) - 성능 튜닝 가이드
- [설정 API](../api-reference/client-config/config) - 연결 및 프록시 필드 참조
- [보안 개요](../security/) - SSRF 와 TLS 보안
