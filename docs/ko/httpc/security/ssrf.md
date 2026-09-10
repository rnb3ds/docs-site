---
sidebar_label: "SSRF 방어"
title: "SSRF 방어 - CyberGo HTTPC | 사설 IP와 메타데이터"
description: "HTTPC SSRF 방어 상세: IPv4/IPv6 사설 IP와 클라우드 메타데이터 엔드포인트 차단, SSRFExemptCIDRs 정밀 면제, AllowPrivateIPs 위험 비교, DNS 리바인딩 방어, WithAllowPrivateIPs 요청 수준 덮어쓰기와 리다이렉트 허용 목록."
sidebar_position: 2
---

# SSRF 방어

SSRF(Server-Side Request Forgery, 서버 측 요청 위조)는 공격자가 서버를 유도해 내부망으로 요청을 보내는 공격 방식입니다. 위해에는 클라우드 인스턴스 메타데이터 자격 증명 탈취(IAM 역할 token), 내부망 포트 및 서비스 스캔, 인증 없는 내부 관리 인터페이스 접근, 방화벽 우회로 보호된 자원 접근이 포함됩니다. HTTPC는 기본적으로 SSRF 방어를 활성화하여 사설/예약 IP 대역 연결을 차단합니다.

## 기본 동작

```go
cfg := httpc.DefaultConfig()
// AllowPrivateIPs = false(기본값) → 모든 사설/예약 IP 차단
```

`AllowPrivateIPs`는 기본값이 `false`이며, 다이얼러 계층의 SSRF 검증이 완전히 활성화됩니다. 이는 URL의 호스트명만 검증하는 것과 다릅니다 — HTTPC는 실제 TCP 연결을 설정할 때 해석된 IP를 검증하므로 DNS 리바인딩을 방어할 수 있습니다(아래 참조).

## 검증 실행 위치: 3계층 방어선

SSRF 검증은 3개 계층에 분포하며, 어느 한 계층이 우회되어도 다음 계층이 방어합니다:

| 방어선 | 실행 시점 | 동작 | 구현 위치 |
|------|----------|------|----------|
| 1. 사전 검증 계층 | 요청 전송 전 | URL 해석 후 **호스트명** 기준 빠른 조회: `localhost` 및 변형, IP 리터럴, 전통적 10진수/16진수/8진수 표기(DNS 해석 없이, 네트워크 오버헤드 제로) | `internal/security/validator.go` → `internal/validation/netutil.go` |
| 2. 리다이렉트 계층 | 매 홉 30x | 리다이렉트 대상 호스트명에 대해 반복 검증(도메인 허용 목록 먼저, 이후 SSRF 검증) | `internal/engine/transport.go` |
| 3. 연결 계층(다이얼러) | TCP 연결 설정 전 | **DNS 해석 → IP 개별 검증 → 사설 주소 필터링 → 검증된 IP에 직접 연결**, DNS 리바인딩 방지 | `internal/connection/pool.go` |

사전 검증 계층이 호스트명 형태 기준으로 거부하는 전형적인 사례입니다(요청 자체가 연결을 시작하지 않음):

| 대상 호스트 | 거부 사유 |
|----------|----------|
| `localhost`, `LOCALHOST`, `localhost.localdomain` | localhost 호스트명 검사(대소문자 구분 없음) |
| `127.0.0.1`, `::1`, `0.0.0.0`, `::` | localhost 호스트명 검사(정확한 매칭) |
| `10.0.0.1`, `192.168.1.1`, `169.254.169.254` | 사설/예약 IP 차단 |
| `2130706433`, `0x7f000001`, `0177.0.0.1` | 전통적 IP 리터럴 표기 차단 |

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
	defer func() { _ = client.Close() }()

	// 루프백 주소는 사전 검증 계층에서 즉시 거부 — 네트워크 연결이 전혀 발생하지 않음
	_, err = client.Get("http://127.0.0.1:9/")
	if err != nil {
		fmt.Println("요청이 차단됨(다이얼 없음)")
	}
	// 출력: 요청이 차단됨(다이얼 없음)
}
```

연결 계층은 최종 방어선입니다: `ValidateURL = false`로 사전 검증 계층을 꺼도 다이얼러는 여전히 도메인을 해석하고 실제 IP를 검증합니다 — 도메인 해석 결과가 모두 사설 주소이면 `domain resolves only to blocked addresses`류 오류를 반환합니다. DNS 해석 타임아웃은 `min(10s, Timeouts.Dial)`입니다.

:::tip
사전 검증 계층에는 URL 단위 캐시가 있습니다(1024개, 초과 시 가장 오래된 25% 제거). 동일 URL에 대한 반복 요청은 해석과 검증을 반복하지 않습니다. `WithAllowPrivateIPs`로 요청별 덮어쓰기를 사용하면 캐시가 자동으로 우회됩니다(동일 URL의 검증 결과가 더 이상 안정적이지 않아 재사용할 수 없음).
:::

## 차단되는 IP 범위

HTTPC는 공중망 통신에 부적합한 모든 IP 주소를 차단하며, IPv4, IPv6 및 그 우회 변형을 포괄합니다.

### IPv4 차단 범위

| 범위 | CIDR | 설명 |
|------|------|------|
| 루프백 | `127.0.0.0/8` | localhost(127.x.x.x 전체 대역 포함) |
| A 클래스 사설 | `10.0.0.0/8` | 내부망(RFC 1918) |
| B 클래스 사설 | `172.16.0.0/12` | 내부망(RFC 1918) |
| C 클래스 사설 | `192.168.0.0/16` | 내부망(RFC 1918) |
| 링크 로컬 | `169.254.0.0/16` | 자동 설정(AWS/Azure 메타데이터 포함) |
| CGNAT | `100.64.0.0/10` | 통신사급 NAT(알리바바 클라우드 메타데이터 `100.100.100.200` 포함) |
| E 클래스 예약 | `240.0.0.0/4` | 예약 주소(`ip4[0] >= 240`) |
| "이 네트워크" | `0.0.0.0/8` | 이 네트워크 식별자(`ip4[0] == 0`) |
| IETF 프로토콜 할당 | `192.0.0.0/24` | 특수 용도 |
| TEST-NET-1 | `192.0.2.0/24` | 문서 용도(RFC 5737) |
| TEST-NET-2 | `198.51.100.0/24` | 문서 용도(RFC 5737) |
| TEST-NET-3 | `203.0.113.0/24` | 문서 용도(RFC 5737) |
| 6to4 릴레이 | `192.88.99.0/24` | 폐기된 애니캐스트 |

또한 IPv6 루프백(`::1`), 고유 로컬(`fc00::/7`), 링크 로컬(`fe80::/10`) 등의 범위도 차단됩니다 — HTTPC의 IP 검증은 루프백, 사설, 링크 로컬 유니캐스트/멀티캐스트, 멀티캐스트, 미지정 등 예약된 모든 범주를 포괄합니다.

### IPv6 차단 범위

| 범위 | CIDR | 설명 |
|------|------|------|
| 루프백 | `::1/128` | localhost |
| 고유 로컬 | `fc00::/7` | 내부망(IPv4 사설에 대응) |
| 링크 로컬 | `fe80::/10` | 자동 설정 |
| 문서 접두사 | `2001:db8::/32` | 문서 용도(RFC 3849) |
| NAT64 | `64:ff9b::/96` | 내장 IPv4 재귀 검증 |

### 우회 방어

HTTPC는 다음의 일반적인 SSRF 우회 기법을 추가로 차단합니다:

| 기법 | 예시 | 방어 |
|------|------|------|
| IPv4-mapped IPv6 | `::ffff:127.0.0.1` | IPv4로 정규화 후 검증 |
| 10진수 정수 | `2130706433`(= 127.0.0.1) | 전통적 IP 리터럴로 식별 후 차단 |
| 16진수 | `0x7f000001`, `0x7f.0.0.1` | `0x` 접두사 식별 후 차단 |
| 8진수 | `0177.0.0.1` | 선행 0 식별 후 차단 |
| NAT64 내장 | `64:ff9b::7f00:1` | 내장 IPv4 재귀 검증 |

:::tip
이러한 우회 방어는 cgo 빌드에서 특히 중요합니다: `getaddrinfo`는 전통적 IP 리터럴을 수용하고 사설 IP로 매핑할 수 있습니다. HTTPC는 DNS 해석 전에 이러한 형식을 차단합니다.
:::

## 클라우드 메타데이터 엔드포인트 방어

각 클라우드 플랫폼의 인스턴스 메타데이터 서비스(IMDS)는 SSRF 공격의 고가치 표적입니다 — 한 번 접근하면 임시 자격 증명을 탈취할 수 있습니다. HTTPC는 기본적으로 이러한 주소를 차단합니다:

| 플랫폼 | 메타데이터 주소 | 차단 메커니즘 |
|------|-----------|----------|
| AWS EC2 | `169.254.169.254` | 링크 로컬 `169.254.0.0/16` 차단 |
| Azure | `169.254.169.254` | 동일(링크 로컬 차단) |
| GCP | `metadata.google.internal` | DNS 해석 후 IP 검증 |
| 알리바바 클라우드 | `100.100.100.200` | CGNAT `100.64.0.0/10` 차단 |

:::warning
AWS 메타데이터 IMDSv2는 token을 요구하지만, SSRF는 여전히 token을 먼저 획득한 후 데이터에 접근할 수 있습니다. HTTPC의 IP 수준 차단은 IMDSv2보다 더 낮은 계층에서 직접 연결을 차단합니다. 둘의 병용을 권장합니다: HTTPC 차단 + IMDSv2 활성화로 심층 방어.
:::

:::warning
알리바바 클라우드 메타데이터(`100.100.100.200`)는 CGNAT 범위(`100.64.0.0/10`)에 위치하며, HTTPC는 **기본적으로 이 범위를 차단**합니다. Tailscale/WireGuard 등 VPN이나 내부 라우팅으로 인해 `100.64.0.0/10` 접근이 필요한 경우, `SSRFExemptCIDRs: []string{"100.64.0.0/10"}`로 명시적으로 면제해야 합니다 — 면제 시 해당 범위의 알리바바 클라우드 메타데이터도 접근 가능해지므로 위험을 평가하세요.
:::

## DNS 리바인딩 방어

DNS 리바인딩(DNS Rebinding)은 SSRF 검증을 우회하는 고전적 기법입니다. 공격자가 도메인의 DNS 서버를 제어하여, 첫 번째 해석에서는 공인 IP를 반환(검증 통과)하고 실제 연결 시에는 `127.0.0.1`을 반환(검증 우회)하게 합니다.

HTTPC는 "해석 - 검증 - 직접 연결" 모드로 이러한 공격을 방어합니다:

1. **해석**: 도메인을 IP 목록으로 해석
2. **검증**: 각 IP가 사설/예약 주소인지 일일이 검증
3. **필터**: 차단된 IP를 제거하고 허용된 IP만 유지
4. **직접 연결**: 검증된 IP에 직접 다이얼, 도메인을 재해석하지 않음

```go
// 공격 시나리오:
// 1. 공격자가 evil.com의 DNS 제어
// 2. 검증 단계에서 해석은 공인 IP 반환(검증 통과)
// 3. 표준 net/http는 도메인을 재해석(이때 127.0.0.1 반환, 검증 우회)
//
// HTTPC 방어: 다이얼 시 검증된 IP를 직접 사용, 도메인 재해석하지 않음
```

:::tip
"Split-Horizon DNS"(동일 도메인이 공인과 내부 IP로 해석) 환경에서, HTTPC는 사설 IP를 자동으로 필터링하고 공인 IP로만 연결을 설정하며, 전체 도메인을 거부하지 않습니다.
:::

DoH를 활성화(`Connection.EnableDoH = true`)해도 동일한 방어선을 거칩니다: DoH 해석 결과가 먼저 같은 IP 필터를 통과하며, 모두 차단되면 `SSRF protection: domain resolves only to blocked addresses`를 보고한 뒤에야 허용된 IP에 하나씩 다이얼을 시도합니다. DNS 해석 타임아웃은 요청 context에서 파생되어 10s로 제한되며(`min(10s, Timeouts.Dial)`), 요청 취소 시 해석이 즉시 중단됩니다.

## SSRFExemptCIDRs 정밀 면제

마이크로서비스 환경에서 VPC, Kubernetes Service 또는 VPN 내 서비스에 접근해야 하는 경우가 많습니다. `SSRFExemptCIDRs`는 특정 CIDR 범위만 정밀하게 면제하여 다른 사설 IP에 대한 차단을 유지합니다 — 이것이 권장되는 내부 서비스 접근 방식입니다.

```go
cfg := httpc.DefaultConfig()
cfg.Security.SSRFExemptCIDRs = []string{
    "10.0.0.0/8",       // VPC 내부
    "100.64.0.0/10",    // Tailscale VPN
    "172.20.0.0/16",    // Kubernetes Service CIDR
}
client, _ := httpc.New(cfg)
```

### 전형적 면제 사례

| 시나리오 | CIDR | 설명 |
|------|------|------|
| VPC 내부 서비스 | `10.0.0.0/8` | AWS/GCP/Azure 기본 VPC |
| Tailscale VPN | `100.64.0.0/10` | Tailscale 네트워크 대역(RFC 6598) |
| Kubernetes | `172.20.0.0/16` 등 | Pod/Service CIDR |
| WireGuard | `10.13.0.0/16` 등 | 커스텀 VPN 대역 |

무효 CIDR은 `httpc.New()`가 오류를 반환합니다(예: `SSRFExemptCIDRs: invalid CIDR "10.0.0/8"`). 구성이 시작 시점에 실패하며 런타임에 조용히 통과하지 않습니다.

:::warning
면제 CIDR은 최대한 정밀하게 지정하세요. 너무 큰 범위(예: `0.0.0.0/0`)를 사용하면 SSRF 방어가 완전히 비활성화되는 것과 같습니다. `10.0.0.0/8`조차도 실제 사용하는 서브넷으로 좁힐 수 있는지 평가해야 합니다.
:::

## AllowPrivateIPs vs SSRFExemptCIDRs 비교

둘 다 내부 서비스를 통과시킬 수 있지만, 보안 의미는 완전히 다릅니다:

| 차원 | `AllowPrivateIPs = true` | `SSRFExemptCIDRs` |
|------|--------------------------|--------------------|
| 방어 상태 | SSRF 검증 **완전 우회** | 지정된 CIDR만 면제, 나머지는 여전히 차단 |
| 적용 범위 | 모든 사설/예약/루프백/링크 로컬 IP | 나열된 CIDR만 |
| localhost | 허용 | 항상 차단 — 호스트명 검사가 면제 매칭보다 먼저 실행되므로 `SSRFExemptCIDRs`로 루프백 주소를 통과시킬 수 없음(아래 "알려진 경계" 참조) |
| 클라우드 메타데이터 | **도달 가능**(위험) | 기본적으로 여전히 차단 |
| 위험 등급 | 높음 — 공격 표면이 SSRF 비활성화와 동일 | 낮음 — 정밀 통과 |
| 권장도 | 테스트/순수 내부망 클라이언트만 | 프로덕션 권장 |

:::danger
`AllowPrivateIPs = true`는 다이얼러 계층의 SSRF 검증을 완전히 우회합니다("사설 IP 허용"뿐 아니라), localhost 검사, 링크 로컬 검사, 모든 예약 주소 검사를 포함합니다. 프로덕션 환경에서 신뢰할 수 없는 URL을 처리할 때 절대 사용하지 마세요. 내부 서비스 접근이 필요하면 `SSRFExemptCIDRs`를 우선 사용하세요.
:::

## 요청별 사설 IP 면제

클라이언트 전체가 보안 기본값(`AllowPrivateIPs = false`)을 사용하지만 개별 요청만 내부망 접근이 필요한 경우(예: `localhost` 헬스 체크 엔드포인트), `WithAllowPrivateIPs` 요청 옵션으로 요청별로 통과시킬 수 있으며 전역 보안 정책을 완화할 필요가 없습니다:

```go
package main

import (
	"fmt"
	"log"

	"github.com/cybergodev/httpc"
)

func main() {
	// 기본 클라이언트는 사설 IP 차단; 이 호출은 요청별로 통과
	result, err := httpc.Get("http://localhost:8080/health",
		httpc.WithAllowPrivateIPs(true),
	)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("헬스 체크 상태: %d\n", result.StatusCode())
}
```

:::warning
**신뢰할 수 있고 사용자 입력이 아닌** URL에만 `WithAllowPrivateIPs(true)`를 활성화하세요. SSRF 방어의 목적은 공격자가 귀하의 프로세스를 유도해 내부망 엔드포인트에 접근하는 것을 막는 것이며, 요청별 비활성화는 해당 호출에 이 위험을 다시 도입합니다. 전체 클라이언트가 내부 서비스 접근을 필요로 하면 `Config`에서 `Security.AllowPrivateIPs = true`를 설정하세요.
:::

역방향 사용도 유효합니다: 클라이언트가 `AllowPrivateIPs = true`(예: 순수 내부망 클라이언트)로 구성되었지만, 단일 요청에서 SSRF 검증을 강제로 활성화해야 하는 경우 `WithAllowPrivateIPs(false)`를 사용할 수 있습니다.

## 리다이렉트에서의 SSRF 검사

리다이렉트는 SSRF 공격의 중요한 매개체입니다: 공개 서비스가 302로 `http://169.254.169.254/`(클라우드 메타데이터)나 내부망 주소로 이동할 수 있습니다. HTTPC는 리다이렉트 대상에 대해서도 SSRF IP 검증을 수행합니다.

| 클라이언트 구성 | 사설 IP로 리다이렉트 동작 |
|-----------|----------------------|
| `AllowPrivateIPs = false`(기본값) | 차단 — 리다이렉트 대상 IP 검증 실패 |
| `AllowPrivateIPs = true` | 허용 — SSRF 우회(리다이렉트 포함) |
| `WithAllowPrivateIPs(true)` 요청별 | 해당 요청의 사설 IP 리다이렉트 허용 |
| `SSRFExemptCIDRs` 적중 | 면제 CIDR로 리다이렉트 허용 |

```go
// 시나리오: public-api.com에 요청, 서버가 302로 http://169.254.169.254/로 이동
// HTTPC가 리다이렉트 대상의 IP를 검증하여 클라우드 메타데이터 서비스 접근 차단
```

매 홉 리다이렉트는 다음 순서로 검사합니다(한 단계라도 실패하면 해당 홉을 거부, 구현은 `internal/engine/transport.go`의 `checkRedirect`):

1. **도메인 허용 목록**(`RedirectWhitelist` 구성 시)
2. **프로토콜 검사**: http/https만 허용(`file://`, `gopher://` 등 거부)
3. **SSRF 호스트 검증**: 대상 호스트명을 사설망/루프백/예약 규칙으로 검증
4. **크로스 도메인 민감 헤더 제거**: 대상 호스트가 시작 호스트와 다르면 `Authorization`, `Cookie`, `Proxy-Authorization` 제거 — 리다이렉트가 허용되더라도 자격 증명이 제3자 도메인으로 전달되지 않음
5. **순환 리다이렉트 검출**: A→B→A식 순환 시 오류(연속 동일 URL의 A→A는 제외)
6. **횟수 상한**: 기본 10회, 구성 하드 상한 50

리다이렉트 계층은 호스트명 빠른 조회만 수행합니다(DNS 해석을 하지 않아 다이얼 계층과의 중복 해석으로 새로운 TOCTOU 윈도우가 생기는 것을 방지). 대상 도메인의 실제 IP는 다이얼 계층이 연결 시 다시 검증합니다 — 두 계층이 협력하여 리다이렉트로 DNS 리바인딩 방어를 우회할 수 없습니다.

`WithAllowPrivateIPs`의 요청별 덮어쓰기는 리다이렉트 검사에도 적용됩니다: 덮어쓴 값은 context를 통해 리다이렉트 검증기와 다이얼러로 전파되며(`internal/connection/ssrf_context.go`), 해당 요청의 리다이렉트 대상도 덮어쓴 정책 기준으로 판정됩니다.

### 리다이렉트 도메인 허용 목록

`RedirectWhitelist`는 IP 검증 위에 도메인 수준 제어를 추가하여 오픈 리다이렉트 취약점을 방지합니다:

```go
cfg := httpc.DefaultConfig()
cfg.Security.RedirectWhitelist = []string{
    "api.example.com",
    "auth.example.com",
    "*.cdn.example.com", // 와일드카드: 엄격한 서브도메인 매칭
}
// 허용 목록이 아닌 도메인의 리다이렉트는 차단됨
```

와일드카드 `*.example.com`은 `api.example.com`, `static.cdn.example.com` 등 엄격한 서브도메인을 매칭하지만, 네이키드 도메인 `example.com`은 **매칭하지 않습니다**(별도 나열 필요). 허용 목록이 `nil`이면 전체 허용입니다(기본 동작).

## 구성 예시

### 보안 구성(사용자 URL 처리)

사용자 제공 URL을 처리할 때 `SecureConfig()`로 가장 엄격한 SSRF 방어를 얻습니다:

```go
cfg := httpc.SecureConfig()
// AllowPrivateIPs = false(엄격 SSRF)
// FollowRedirects = false(리다이렉트 SSRF 차단)
// MaxResponseBodySize = 5MB
client, _ := httpc.New(cfg)
```

### 내부 서비스 구성(VPC 접근)

VPC/Kubernetes 내부 서비스에 접근할 때 `SSRFExemptCIDRs`로 정밀하게 통과:

```go
cfg := httpc.DefaultConfig()
cfg.Security.SSRFExemptCIDRs = []string{
    "10.0.0.0/8",     // VPC
    "172.20.0.0/16",  // Kubernetes Service
}
client, _ := httpc.New(cfg)
```

### 혼합 구성(공인망 + 내부망)

동일 클라이언트가 공인망 API와 내부 서비스에 접근해야 하며, 내부 서비스 대역이 알려진 경우:

```go
cfg := httpc.DefaultConfig()
cfg.Security.SSRFExemptCIDRs = []string{
    "10.50.0.0/16",   // 내부 서비스 전용 서브넷(정밀)
}
cfg.Security.RedirectWhitelist = []string{
    "api.public.com",
    "*.internal.corp", // 내부 신뢰 도메인으로만 리다이렉트 허용
}
client, _ := httpc.New(cfg)
```

## SSRF 방어 완전 비활성화

테스트 환경에서만 사용하세요. 두 가지 방법:

```go
// 방법 1: TestingConfig(TLS 검증 등 여러 보안 기능도 동시 비활성화)
client, _ := httpc.New(httpc.TestingConfig())

// 방법 2: 수동 구성
cfg := httpc.DefaultConfig()
cfg.Security.AllowPrivateIPs = true
client, _ := httpc.New(cfg)
```

`TestingConfig()`는 비테스트 환경에서 `stderr`에 보안 경고를 출력합니다([보안 개요](./) 참조).

:::danger
프로덕션 환경에서는 절대 `AllowPrivateIPs = true`로 설정하지 마세요. 이는 SSRF 방어를 완전히 포기하는 것과 같으며, 공격자가 이를 통해 클라우드 메타데이터, 내부 서비스, 관리 인터페이스에 접근할 수 있습니다.
:::

## 알려진 경계와 우회 표면

소스 코드 기준으로 SSRF 방어에는 다음과 같은 알려진 경계가 있으며, 구성 전에 알아두어야 합니다:

### localhost는 CIDR 면제로 통과할 수 없음

사전 검증 계층의 `isLocalhost` 호스트명 검사는 CIDR 면제 매칭보다 **먼저** 실행됩니다(`internal/validation/netutil.go`의 `ValidateSSRFHost`: localhost를 먼저 검사한 뒤 IP 면제 검사). 따라서 `127.0.0.0/8`을 `SSRFExemptCIDRs`에 추가해도 `localhost`나 `127.x.x.x`를 통과시킬 수 없습니다 — 요청은 여전히 사전 검증 계층에서 거부됩니다. 루프백 주소 접근이 꼭 필요하면 `WithAllowPrivateIPs(true)`(요청 수준) 또는 `AllowPrivateIPs = true`(클라이언트 수준)를 사용하세요.

### 명시적으로 구성된 프록시는 SSRF 검증을 거치지 않음

`ProxyURL`과 `ProxyPool`의 프록시 호스트 주소는 **개발자가 구성한 인프라**로 간주되어, 다이얼 시 SSRF 검증과 DoH 해석을 건너뜁니다(`internal/connection/pool.go`). 이는 의도된 설계입니다: 프록시를 구성할 수 있는 개발자는 원래 임의의 주소에 직접 연결할 수 있으므로, 프록시 호스트를 차단해도 실질적인 보안이 늘지 않습니다. 단, 시스템 프록시에는 한 가지 제한이 있습니다: `EnableSystemProxy`는 클라이언트 생성 시 프록시 주소를 한 번만 탐지합니다(SSRF 면제용). 이후 환경변수에서 localhost 프록시(예: `127.0.0.1:7890`)가 해석되면 해당 프록시가 SSRF 방어에 차단될 수 있습니다. 동적으로 변하는 로컬 프록시는 `ProxyURL`로 명시적으로 설정하세요.

### localhost.\* 임의 서브도메인은 일반 도메인으로 취급

`localhost.example.com` 같은 `localhost.*` 서브도메인은 localhost로 취급되지 **않습니다** — 이들은 합법적인 공인 도메인일 수 있기 때문입니다. 단, DNS 해석 결과가 루프백 IP이면 연결 계층에서 여전히 차단되며, 다만 사전 검증 계층의 해석 없는 빠른 조회 혜택은 더 이상 받지 못합니다.

### ValidateURL 비활성화 시 리다이렉트 계층과 연결 계층이 방어

URL 검증을 끄면(권장하지 않으며, `TestingConfig` 외에는 정당한 이유가 거의 없음) 사전 검증 계층이 실행되지 않습니다. 리다이렉트 계층과 연결 계층은 여전히 유효합니다. 이때 URL의 `localhost` 리터럴은 DNS가 루프백 IP를 해석한 뒤에야 다이얼 계층에서 차단되며, 오류 메시지도 다릅니다(`domain resolves only to blocked addresses`). 전통적 IP 리터럴 빠른 조회도 함께 무효가 됩니다.

### 전통적 IP 리터럴은 DNS 해석 전에 차단

`2130706433`, `0x7f000001`, `0177.0.0.1` 등의 표기는 `net.ParseIP`가 거부하지만, cgo 빌드의 `getaddrinfo` 해석기에서는 수용되어 사설 IP로 매핑될 수 있습니다. HTTPC는 사전 검증 계층에서 `looksLikeLegacyIPLiteral`로 이러한 형식을 식별해 차단합니다(식별 규칙: `0x` 접두사, 점 없는 순수 숫자, 점이 여러 개인 형식의 선행 0 8진수 또는 16진수 세그먼트). 플랫폼 해석기 동작에 의존하지 않습니다.

## 모범 사례

1. 신뢰할 수 없는 URL 처리 시 `SecureConfig()`를 보안 기준선으로 사용
2. `SSRFExemptCIDRs`로 필요한 CIDR 범위만 정밀 면제, `AllowPrivateIPs`는 피하기
3. `RedirectWhitelist`를 구성하여 리다이렉트 대상 도메인 제한
4. 사용자 URL 처리 시 리다이렉트 비활성화(`FollowRedirects = false`)
5. `SSRFExemptCIDRs` 구성을 정기적으로 감사하여 더 이상 사용하지 않는 대역 제거
6. `AuditMiddleware`로 모든 요청을 기록하여 사후 SSRF 공격 시도 추적 용이

## 다음 단계

- [TLS와 인증서 고정](./tls-certpin) - TLS 보안 구성과 인증서 고정
- [보안 개요](./) - 보안 기능 총람
- [프로덕션 체크리스트](./production-checklist) - 출시 전 SSRF 점검 항목
