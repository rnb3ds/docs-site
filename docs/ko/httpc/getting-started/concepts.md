---
title: "핵심 개념 - CyberGo HTTPC | 2계층 아키텍처와 설정 체계"
description: "HTTPC 핵심 개념 상세 설명: 2계층 API 아키텍처(패키지 함수와 Client 인스턴스), Config 구조체 설정과 With* 요청 옵션의 차이, 요청 수명주기와 Result 자동 관리를 통해 라이브러리 전체에 대한 인식을 빠르게 확립하세요."
sidebar_label: "핵심 개념"
sidebar_position: 2
---

# 핵심 개념

다음 개념을 이해하면 HTTPC 전체에 대한 인식을 빠르게 확립할 수 있습니다.

## 2계층 API 아키텍처

HTTPC는 두 가지 동등한 요청 방식을 제공하며, 표준 라이브러리 `net/http`의 `http.Get`와 `http.Client` 관계에 대응합니다:

**패키지 함수** - 설정 불필요, 내부적으로 지연 초기화된 기본 클라이언트를 공유하며, 스크립트와 일회성 요청에 적합:

```go
result, err := httpc.Get("https://api.example.com/data")
```

**Client 인스턴스** - 설정, 커넥션 풀, 수명주기를 완전히 제어하며, 장기 실행 서비스에 적합:

```go
client, err := httpc.NewDefault()
defer func() { _ = client.Close() }()
result, err := client.Get("https://api.example.com/data")
```

두 방식 모두 동일한 요청 옵션(`WithHeader`, `WithJSON`…)을 받고, 동일한 `*Result` 타입을 반환합니다. 패키지 함수는 Client 인스턴스의 얇은 래퍼입니다.

:::tip 팁
어느 것을 사용해야 할까요? 일회성 요청이나 빠른 프로토타입은 패키지 함수로. 프로덕션 서비스, 사용자 정의 설정이나 커넥션 풀 관리가 필요하면 Client 인스턴스로.
:::

## 설정 체계: Config와 With\* 옵션

HTTPC는 설정을 두 개의 독립적인 계층으로 나누어 혼란을 피합니다:

| 계층 | 매체 | 범위 | 대표 필드 |
|------|------|--------|----------|
| **인스턴스 설정** | `Config` 구조체 | 전체 클라이언트 수명주기 | 타임아웃, 재시도 전략, 커넥션 풀, TLS |
| **요청 옵션** | `WithXxx()` 함수 | 단일 요청 | `WithHeader`, `WithJSON`, `WithTimeout` |

인스턴스 설정은 `Config` 구조체로 `New()`에 전달하며, `DefaultConfig()`에서 시작하여 필요에 따라 수정합니다:

```go
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 60 * time.Second
cfg.Retry.MaxRetries = 5
client, err := httpc.New(cfg)
```

요청 옵션은 매 호출 시 전달되어 인스턴스 수준의 기본값을 보완하거나 덮어씁니다:

```go
result, err := client.Get(url,
    httpc.WithHeader("Authorization", "Bearer "+token),
    httpc.WithTimeout(30*time.Second),
)
```

프리셋 설정(`SecureConfig()`, `PerformanceConfig()` 등)을 출발점으로 사용할 수도 있습니다. 자세한 내용은 [설정 API](../api-reference/client-config/config)를 참조하세요.

## 요청 수명주기

모든 요청은 다음 흐름을 거칩니다:

```text
옵션 적용 → 미들웨어 체인(있는 경우)→ 엔진 실행 → 재시도(필요 시)→ Result 반환
    ↑                                    ↑
  With* 함수                    커넥션 풀 / TLS / 프록시 / SSRF 검사
```

- **옵션 적용** - `With*` 함수가 요청 헤더, 요청 본문, 타임아웃 등을 설정
- **미들웨어 체인** - 사용자 정의 로깅, 메트릭, 감사 등의 로직(`Config.Middleware`로 설정)
- **엔진 실행** - 커넥션 풀 재사용, TLS 핸드셰이크, HTTP/2 협상, SSRF 검증
- **재시도** - 재시도 가능한 오류(타임아웃, 5xx, 429 등) 발생 시 자동 지수 백오프 재시도
- **Result** - 응답 데이터, 요청 메타 정보, 재시도 통계 포함; GC가 자동 회수하며 수동 해제 불필요

## 보안 기본값

HTTPC는 기본적으로 안전(secure by default)하며, 추가 설정 없이 다음을 갖춥니다:

- **TLS 1.2+** 강제 암호화
- **SSRF 방어** - 사설/예약 IP 주소(`127.0.0.1`, `10.x`, `192.168.x` 등) 연결 차단
- **CRLF 주입 방어** - 요청 헤더와 URL 자동 검증
- **응답 본문 크기 제한** - 기본 10MB, 메모리 고갈 방지

내부 서비스(VPN, 인트라넷)에 연결해야 하는 경우, `Security.AllowPrivateIPs = true`를 설정하거나 `SSRFExemptCIDRs`로 정확히 면제할 수 있습니다. 자세한 내용은 [보안 개요](../security/)를 참조하세요.

## 오류 모델

HTTPC는 **네트워크 계층 오류**와 **HTTP 상태 코드**를 구분합니다:

- **네트워크 계층 오류**(연결 실패, 타임아웃, TLS 오류 등)→ `error`로 반환, `errors.As`로 `ClientError`를 추출하여 분류와 재시도 가능성 확인
- **HTTP 상태 코드**(4xx, 5xx)→ `error`로 반환**되지 않으며**, `result.IsSuccess()` 등의 메서드로 확인

```go
result, err := client.Get(url)
if err != nil {
    // 네트워크 계층 오류 - 요청이 성공적으로 완료되지 않음
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        log.Printf("오류 유형: %s, 재시도 가능: %v", clientErr.Code(), clientErr.IsRetryable())
    }
    return err
}
// 요청 성공적으로 완료 - HTTP 상태 코드 확인
if !result.IsSuccess() {
    log.Printf("HTTP 오류: %d", result.StatusCode())
}
```

자세한 내용은 [오류 처리](../guides/error-handling)를 참조하세요.
