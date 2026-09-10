---
sidebar_label: "연결 풀과 DNS"
title: "연결 풀과 DNS - CyberGo HTTPC | 연결 풀 튜닝과 DNS 해석"
description: "HTTPC 연결 풀과 DNS 가이드: MaxIdleConns와 MaxConnsPerHost 튜닝, 유휴·총 연결 상한과 TIME_WAIT 대응, 객체 풀 재사용과 동시성 요청 패턴, DoH 암호화 해석 폴백 체인과 HTTP/2 멀티플렉싱 실무, 고동시성 시나리오 추천 매개변수 안내."
sidebar_position: 10
---

# 연결 풀과 DNS

## 연결 풀 설정

연결 풀은 HTTP 클라이언트 성능의 핵심 요소입니다. HTTPC 는 `ConnectionConfig`로 연결 풀을 관리합니다.

```go
cfg := httpc.DefaultConfig()

// 연결 풀 매개변수
cfg.Connection.MaxIdleConns = 100         // 전역 최대 유휴 연결
cfg.Connection.MaxConnsPerHost = 20       // 호스트당 최대 연결 수
cfg.Timeouts.IdleConn = 120 * time.Second // 유휴 연결 유지 시간
```

### 매개변수 설명

| 매개변수 | 기본값 | 설명 |
|------|------|------|
| `MaxIdleConns` | 50 | 전역 최대 유휴 연결 수 |
| `MaxConnsPerHost` | 10 | 호스트당 최대 연결 수(활성 + 유휴 포함) |
| `IdleConn` | 90s | 유휴 연결 타임아웃, 초과 시 연결 닫힘 |
| `Dial` | 10s | 연결 수립 타임아웃 |
| `TLSHandshake` | 10s | TLS 핸드셰이크 타임아웃 |
| `ResponseHeader` | 0 | 비활성화(Request 타임아웃 사용) |
| `MaxResponseHeaderBytes` | 0 | 응답 헤더 크기 상한; 0 = Go 표준 라이브러리 기본값 10MB |

### 시나리오별 추천

| 시나리오 | MaxIdleConns | MaxConnsPerHost | IdleConn |
|----------|-------------|-----------------|----------|
| 고동시성 API | 100 | 20 | 120s |
| 일반 서비스 | 50 | 10 | 90s |
| 저빈도 요청 | 10 | 2 | 30s |
| 마이크로서비스 내부 | 50 | 10 | 60s |

:::tip
`MaxConnsPerHost`는 활성 연결과 유휴 연결을 모두 포함합니다. 이 제한을 초과하는 새 요청은 연결이 해제되기를 대기열에서 기다립니다.
:::

### 파생 매개변수와 내부 상한

일부 연결 매개변수에는 독립된 설정 항목이 없으며, 엔진이 기존 매개변수에서 **파생**하거나 고정값을 사용합니다:

| 매개변수 | 값 | 출처 |
|------|-----|------|
| `MaxIdleConnsPerHost` | `clamp(MaxConnsPerHost/2, 2, 10)`; `MaxConnsPerHost=0`이면 10 | `MaxConnsPerHost`에서 파생, 독립 필드 없음 |
| 단일 클라이언트 총 연결 상한 | 1000(활성 + 유휴) | 고정값, 초과 시 연결 풀 소진 오류 반환 |
| TCP KeepAlive 탐침 간격 | 30s | 고정값 |
| `ExpectContinueTimeout` | 1s | 고정값(`Expect: 100-continue` 대기 시간) |

:::warning 총 연결 상한 도달 시의 증상
총 연결 1000 상한에 도달하면 새 연결은 오류로 종료되며, `ClientError`(`ErrorTypeNetwork`, Message 는 `connection pool exhausted`)로 분류됩니다. 기본 `MaxIdleConns=50` / `MaxConnsPerHost=10`에서는 거의 트리거되지 않으므로, 극단적 동시성에서의 마지막 방어선 정도로 여기면 됩니다.
:::

### 유휴 연결 관리

- **`IdleConn`(기본 90s)**: 유휴 연결은 전송 계층 타임아웃 후 자동으로 닫힙니다. 값을 늘리면 연결 재사용률이 올라가고, 줄이면 상대 측 리소스를 더 빨리 해제합니다(고빈도 짧은 연결 시나리오는 TIME_WAIT 누적 주의).
- **프록시 회전 시 능동 정리**: `ProxyRotatePerRequest` 또는 상태 코드 회전의 재시도 경로를 활성화하면 **모든 유휴 연결을 자동으로 닫아** 다음 요청이 프록시를 다시 선택하도록 강제합니다 — 그렇지 않으면 HTTP/2 의 CONNECT 터널 연결 재사용이 프록시 선택을 우회해 회전을 무효화하기 때문입니다. 프록시 구성과 회전 전략은 [프록시와 프록시 풀](./proxy)을 참조하세요.
- **`client.Close()`**: 모든 유휴 연결, DoH 리졸버와 내부 리소스를 닫습니다; 이후 요청은 `ErrClientClosed`를 반환합니다.
- **호스트별 통계의 자동 정리**: 내부적으로 호스트별 연결 수를 유지하며, 30분간 활동이 없고 활성 연결이 없는 항목은 주기적으로 정리됩니다(최대 분당 1회, 호스트 항목 상한 10000). 장기 실행해도 메모리가 무한히 늘어나지 않습니다.

### 응답 압축 해제의 특별 처리

전송 계층에서는 **표준 라이브러리 자동 압축 해제를 비활성화**하고, HTTPC 가 응답 처리 계층에서 `gzip` / `deflate`를 수동으로 처리합니다: 압축 해제는 `Security.MaxDecompressedBodySize`(기본 100MB)의 제약을 받아 압축 폭탄 공격을 방어합니다. 일상적으로 이 계층을 신경 쓸 필요는 없습니다 — `Result.RawBody()`로 받는 것이 이미 압축 해제된 바이트라는 점만 알면 됩니다.

## DNS-over-HTTPS

DoH 를 활성화하면 DNS 해석이 암호화된 HTTPS 채널을 통해 이루어져, 통신사 하이재킹과 DNS 포이즈닝을 방지하며 다중 제공자 재해 내성이 내장되어 있습니다:

```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableDoH = true
cfg.Connection.DoHCacheTTL = 5 * time.Minute // 0을 전달해도 5분으로 폴백
```

기본 DoH 제공자(우선순위 순):

| 제공자 | 주소 | 설명 |
|--------|------|------|
| Cloudflare | `1.1.1.1/dns-query` | 가장 빠름, 프라이버시 우선 |
| Google | `dns.google/resolve` | 글로벌 커버리지 |
| AliDNS | `dns.alidns.com/resolve` | 중국 지역 최적화 |

### 동작 메커니즘

- **A + AAAA 동시 조회**: 매 해석마다 IPv4 와 IPv6 레코드를 동시에 조회해 결과를 병합합니다.
- **듀얼 형식 해석**: 응답 `Content-Type`에 따라 JSON(Google/AliDNS 스타일) 또는 RFC 1035 wire 형식(Cloudflare 스타일)을 자동으로 선택합니다; 누락되거나 인식할 수 없는 경우 JSON 을 먼저 시도한 뒤 wire 를 시도하여, 구성이 잘못된 서버와도 호환됩니다.
- **동시 병합**: 같은 호스트의 동시 캐시 미스는 하나의 네트워크 왕복으로 병합되어(singleflight), 캐시 스탬피드로 제공자가 과부하되는 것을 막습니다.
- **독립 내부 클라이언트**: DoH 요청은 독립된 HTTP 클라이언트(5s 타임아웃, HTTP/2 활성화)를 사용하며, 업무 연결 풀과 요청 타임아웃 예산을 소모하지 않습니다.

### 폴백 체인

```text
Cloudflare (1.1.1.1) → Google (dns.google) → AliDNS → 시스템 DNS 리졸버
```

어느 한 제공자라도 성공하면 그대로 반환합니다; 전부 실패하면 시스템 DNS 리졸버로 자동 폴백하며, 두 계층의 오류를 오류 메시지에 병합합니다. 개별 제공자의 장애가 요청 실패로 이어지지 않습니다.

### 캐시

| 항목 | 값 |
|----|-----|
| TTL | `DoHCacheTTL`(기본 5분) |
| 용량 상한 | 1000건; 가득 차면 만료된 항목부터, 그다음 만료가 가장 임박한 항목부터 제거 |
| 응답 크기 상한 | 64KB(악성 DNS 응답이 메모리를 가득 채우는 것을 방지) |

### SSRF 방어와의 연동

DoH 로 해석된 IP 는 먼저 SSRF 필터를 거쳐(사설/예약 주소 제거, `SSRFExemptCIDRs` 존중) **검증된 IP 로 직접 다이얼**됩니다 — 검증과 다이얼 사이에 두 번째 DNS 해석이 존재하지 않아 DNS 리바인딩 공격을 원천 차단합니다. 프록시 주소는 DoH 해석을 거치지 않습니다(프록시는 개발자가 명시적으로 구성하므로 프록시 호스트에 직접 다이얼, [프록시와 프록시 풀](./proxy) 참조). 자세한 내용은 [SSRF 방어](../security/ssrf)를 참조하세요.

## HTTP/2

기본적으로 HTTP/2가 활성화되어 있습니다(TLS 필요):

```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableHTTP2 = false // HTTP/2 비활성화
```

HTTP/2 특징:
- 멀티플렉싱: 단일 연결로 여러 동시 요청 처리
- 헤더 압축: 반복 헤더 전송 감소
- 서버 푸시

비활성화하면 전송 계층은 HTTP/2 협상을 전혀 시도하지 않습니다(커스텀 TLS 구성 시나리오의 강제 시도 포함). 평문 HTTP/2(h2c)는 지원되지 않습니다. HTTP/2 멀티플렉싱은 「같은 호스트의 동시 요청이 하나의 연결을 공유」하게 만듭니다 — 이것이 프록시 회전 시나리오에서 유휴 연결을 닫아야 하는 이유입니다([프록시와 프록시 풀](./proxy)의 요청별 회전 참조).

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
|------|------|----------|
| 대량의 TIME_WAIT | 유휴 연결 타임아웃이 너무 짧음 | `IdleConn` 타임아웃 증가 |
| 연결 거부 | 호스트당 연결 수 부족 | `MaxConnsPerHost` 증가 |
| 요청이 대기열에서 대기 | 연결 풀이 너무 작음 | `MaxIdleConns` 증가 |
| 호스트당 유휴 연결 수를 제어하고 싶음 | 독립 설정 필드 없음 | `MaxConnsPerHost`에서 파생(÷2, 2–10 사이로 클램프) |
| DoH 활성화 후 해석 실패 | 모든 DoH 제공자에 접근 불가/타임아웃 | 시스템 DNS 폴백이 내장됨; 아웃바운드 네트워크 점검 또는 기본값 유지 |
| 프록시 미작동 또는 잦은 서킷 브레이킹 | 프록시 구성과 연결 재사용의 상호작용 | [프록시와 프록시 풀](./proxy)의 자주 묻는 질문 참조 |

성능 안티패턴과 최적화 제안의 전체 내용은 [성능 최적화](./performance)를 참조하세요.

## 다음 단계

- [성능 최적화](./performance) - 성능 튜닝 가이드
- [프록시와 프록시 풀](./proxy) - 단일 프록시, 시스템 프록시와 프록시 풀 회전·서킷 브레이킹
- [설정 API](../api-reference/client-config/config) - 연결 설정 필드 레퍼런스
- [보안 개요](../security/) - SSRF 와 TLS 보안
