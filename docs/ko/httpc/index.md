---
sidebar_label: "개요"
title: "HTTP 클라이언트 - CyberGo HTTPC | 안전하고 고성능 클라이언트"
description: "CyberGo HTTPC는 안전하고 고성능 Go HTTP 클라이언트 라이브러리로, TLS 1.2+ 강제 암호화, SSRF 방어, 지수 백오프 재시도, 미들웨어 체인, 연결 풀 관리와 Result 수명주기 자동 관리를 제공해 마이크로서비스 통신과 고동시성 API 호출에 적합합니다."
---

# HTTPC

안전한 HTTP 클라이언트 라이브러리. 기본적으로 안전하며, 지능형 재시도, 미들웨어 체인, 객체 풀 재사용을 내장했습니다.

HTTPC는 표준 라이브러리 `net/http`의 전송 계층 위에 구축됩니다. 연결 재사용, HTTP/2 협상, TLS 세션 등 하위 계층 능력은 표준 라이브러리와 동일하고, 그 위에 프로덕션급 HTTP 클라이언트에는 필요하지만 표준 라이브러리가 제공하지 않는 능력 — 강제 TLS 정책, SSRF 방어, 지수 백오프 재시도, 미들웨어 체인, 응답 본문 크기 방어선, 원스톱 `Result` 래퍼 — 를 덧붙였습니다.

## 특징

- **TLS 1.2+** - 최소 TLS 버전 강제, 기본 TLS 1.2-1.3
- **SSRF 방어** - 기본적으로 사설 IP 연결 차단, 면제 CIDR 구성 가능
- **지능형 재시도** - 지수 백오프 + 지터, 커스텀 재시도 정책 지원
- **연결 풀 관리** - 고성능 연결 재사용, HTTP/2 지원
- **미들웨어 체인** - 로깅, 감사, 메트릭, 복구, 요청 ID 등 내장 미들웨어
- **파일 다운로드** - 이어받기, 진행률 콜백, 체크섬 검증 지원
- **DNS-over-HTTPS** - 내장 DoH 해석, DNS 하이재킹 위험 감소
- **객체 풀 재사용** - 내부 응답 객체와 문자열 빌더를 sync.Pool로 재사용, GC 부하 감소
- **프록시와 프록시 풀** - 단일 프록시, 시스템 프록시, 프록시 풀 회전(라운드 로빈/무작위), 실패 서킷 브레이킹과 상태 코드 기반 IP 교체 지원
- **인증서 고정** - SPKI 해시/공개키 고정, 신뢰된 CA가 침해되어도 중간자 공격 방어
- **도메인 세션** - DomainClient가 base URL에 바인딩되고 SessionManager가 Cookie와 공통 요청 헤더를 자동 유지
- **리다이렉트 제어** - 팔로우 토글, 횟수 상한, 대상 도메인 허용 목록

### 능력 매트릭스

| 능력 | 기본 동작 | 주요 커스터마이징 지점 | 더 읽기 |
|------|----------|------------|----------|
| 재시도와 내결함성 | 최대 3회 재시도, 지수 백오프(1s 시작, ×2, 단회 상한 30s)+ 지터, `Retry-After` 존중 | 횟수/백오프 매개변수/커스텀 정책/요청별 재정의 | [재시도와 내결함성](./guides/retry-fault-tolerance) |
| 미들웨어 체인 | 활성화 안 됨 | 로깅/메트릭/감사/복구/요청 ID/타임아웃/정적 헤더, 커스텀 지원 | [미들웨어 체인](./guides/middleware-chain) |
| SSRF 방어 | 사설/예약 IP(127.0.0.1, 10.x, 192.168.x 등) 차단 | `SSRFExemptCIDRs` 정밀 면제/요청별 면제/전체 비활성화 | [SSRF 방어](./security/ssrf) |
| TLS와 인증서 고정 | TLS 1.2–1.3 | 버전 상하한, 커스텀 `tls.Config`, SPKI/공개키 고정 | [TLS와 인증서 고정](./security/tls-certpin) |
| 연결 풀과 HTTP/2 | 유휴 연결 50, 호스트당 10, HTTP/2 켜짐 | 풀 크기, 유휴 시간, 응답 헤더 크기 제한 | [연결 풀과 DNS](./guides/connection-pool) |
| 프록시와 프록시 풀 | 프록시 사용 안 함 | 단일 프록시/시스템 프록시/풀 회전/실패 서킷 브레이킹/상태 코드 기반 IP 교체 | [프록시와 프록시 풀](./guides/proxy) |
| DNS-over-HTTPS | 꺼짐 | `EnableDoH`, 캐시 TTL(기본 5분) | [연결 풀과 DNS](./guides/connection-pool) |
| 세션과 Cookie | 클라이언트 수준 Cookie 꺼짐; DomainClient는 자동 활성화 | `EnableCookies`, 도메인 클라이언트 세션 관리 | [도메인 클라이언트와 세션](./guides/domain-session) |
| 파일 전송 | — | `Download`(이어받기/진행률 콜백/체크섬), `WithFile` 업로드 | [파일 업로드와 다운로드](./guides/file-transfer) |
| 타임아웃 제어 | 전체 180s, 다이얼/TLS 10s, 유휴 연결 90s | 5단계 타임아웃 독립 설정, 요청별 `WithTimeout` 재정의 | [요청과 응답](./guides/request-response) |

## 설치

```bash
# 모듈 초기화(기존 프로젝트는 건너뜀)
go mod init example.com/demo

# HTTPC 설치(Go 1.25+ 필요)
go get github.com/cybergodev/httpc
```

```go
import "github.com/cybergodev/httpc"
```

`golang.org/x/sys` 외에는 타사 의존성이 없으므로 가져오기만 하면 바로 사용할 수 있고, 초기화 설정이 전혀 필요 없습니다.

## 30초 체험

```go
package main

import (
    "fmt"
    "github.com/cybergodev/httpc"
)

func main() {
    result, err := httpc.Get("https://httpbin.org/get")
    if err != nil {
        panic(err)
    }

    fmt.Println(result.StatusCode()) // 200
}
```

이 한 줄 요청 뒤에서 일어나는 일:

1. `httpc.Get`은 내부적으로 공유 기본 클라이언트를 사용합니다(첫 호출 때 지연 생성, 이후 재사용, 동시성 안전).
2. 요청은 CRLF 주입 방어, SSRF 검사, TLS 1.2+ 핸드셰이크를 거쳐 전송됩니다.
3. 재시도 가능한 오류(타임아웃, 408/429/5xx 등)를 만나면 지수 백오프로 자동 재시도하며 최대 3회입니다.
4. 응답은 `*Result`로 래핑되어 반환됩니다 — 상태 코드, 응답 본문, 재시도 통계를 한곳에서 읽을 수 있습니다.

:::tip
4xx/5xx는 `error`로 반환되지 **않습니다**. `result.IsSuccess()` 등의 메서드로 상태 코드를 확인해야 하며, `err`는 네트워크 계층 오류만 나타냅니다. 자세한 내용은 [빠른 시작](./getting-started/)을 참조하세요.
:::

## 표준 라이브러리 net/http와의 관계

HTTPC의 API 계층은 의도적으로 표준 라이브러리와 대응시켜 마이그레이션과 인지 부담을 줄였습니다:

- **2계층 API 대응** — 패키지 수준 `httpc.Get`은 `http.Get`에, `httpc.New(cfg)`가 반환하는 `Client`는 `http.Client`에 대응합니다(각각 공유 기본 인스턴스 / 명시적 설정과 수명주기).
- **전송 계층은 재발명하지 않고 재사용** — 하위 연결 풀, HTTP/2, 프록시 터널은 `net/http`의 Transport가 제공하며, HTTPC는 바깥 계층에 보안 검증, 재시도 엔진, 미들웨어 체인, `Result` 변환을 얹습니다.
- **최소 인터페이스 `Doer`** — `Request` 메서드 하나뿐입니다. 구현을 교체할 때(테스트 mock 등) 이것만 구현하면 되고, 전체 `Client` 인터페이스를 맞출 필요가 없습니다.
- **일관된 멘탈 모델** — `http.Cookie`, `context.Context`, 타임아웃 의미가 표준 라이브러리 사용법과 일대일 대응해 기존 `net/http` 경험을 그대로 옮길 수 있습니다.

## 여기서 시작하기

목표에 따라 읽기 경로를 선택하세요:

| 목표 | 추천 |
|------|------|
| 5분 만에 시작 | [빠른 시작](./getting-started/) |
| net/http에서 마이그레이션 | [마이그레이션 가이드](./guides/migration) |
| 30분 실전 | [실전 튜토리얼](./guides/tutorial) |
| 특정 사용법 찾기 | [치트시트](./getting-started/cheatsheet) |
| 설계 사고 이해 | [핵심 개념](./getting-started/concepts) |
| 요청 옵션과 응답 처리 | [요청과 응답](./guides/request-response) |
| 재시도와 내결함성 | [재시도와 내결함성](./guides/retry-fault-tolerance) |
| 미들웨어 체인 | [미들웨어 체인](./guides/middleware-chain) |
| 연결 풀과 DNS | [연결 풀과 DNS](./guides/connection-pool) |
| 프록시와 프록시 풀 | [프록시와 프록시 풀](./guides/proxy) |
| 파일 업로드와 다운로드 | [파일 업로드와 다운로드](./guides/file-transfer) |
| 세션과 Cookie | [도메인 클라이언트와 세션](./guides/domain-session) |
| 리다이렉트 제어 | [리다이렉트](./guides/redirects) |
| 성능 튜닝 | [성능 최적화](./guides/performance) |
| 보안 기능 이해 | [보안 개요](./security/) |
| API 시그니처 확인 | [API 레퍼런스](./api-reference/) |

## 핵심 개념

HTTPC는 간단한 것부터 유연한 것까지 세 가지 사용 방식을 제공합니다:

```text
패키지 함수            클라이언트 인스턴스                  도메인 클라이언트
httpc.Get()  →  client, _ := httpc.NewDefault()  →  dc, _ := httpc.NewDomainDefault(url)
일회성 요청       사용자 정의 설정/미들웨어       세션 관리/Cookie 자동 유지
```

### 설정 프리셋

| 프리셋 | 적용 시나리오 |
|------|----------|
| `DefaultConfig()` | 범용 시나리오, 안전한 기본값 |
| `SecureConfig()` | 보안 민감 시나리오, 엄격한 타임아웃 |
| `PerformanceConfig()` | 높은 처리량, 큰 연결 풀 |
| `TestingConfig()` | 테스트 환경, 보안 검사 비활성화 |
| `MinimalConfig()` | 경량 스크립트, 재시도/리다이렉트 없음 |

:::tip 어떻게 고를까
고민되면 `DefaultConfig()`에서 시작하세요. 사용자가 제공한 URL을 다룰 때는 `SecureConfig()`(리다이렉트 비활성화, 엄격한 타임아웃, 5MB 응답 상한), 높은 처리량 시나리오는 `PerformanceConfig()`(큰 연결 풀, Cookie 활성화), 단위 테스트/로컬 연동은 `TestingConfig()`(인증서 검증과 SSRF 방어 비활성화, **프로덕션 사용 금지**), 일회성 스크립트는 `MinimalConfig()`를 사용하세요.
:::

## 프로덕션 준비

- **동시성 안전** — `Client`는 여러 goroutine이 공유해 사용할 수 있어, 동시성 때문에 별도 클라이언트를 만들 필요가 없습니다
- **panic 안전망** — 요청 경로에서 발생한 예기치 않은 panic은 포착되어 `error`로 변환되어 돌아오며, 호출자를 뚫고 나가지 않습니다
- **메모리 방어선** — 응답 본문은 기본 상한 10MB, 압축 해제 후 상한 100MB로 메모리 고갈과 압축 폭탄 공격을 막습니다
- **관측 가능성** — 로깅, 메트릭, 감사, 요청 ID 미들웨어를 내장했으며, 로그와 오류의 URL 자격 증명과 민감한 헤더는 자동 마스킹됩니다
- **명확한 수명주기** — 인스턴스 클라이언트는 다 쓴 뒤 `Close()`로 연결 풀을 해제합니다. 패키지 함수의 기본 클라이언트는 라이브러리 내부에서 관리되며, `SetDefaultClient()`로 커스텀 인스턴스로 교체할 수도 있습니다
