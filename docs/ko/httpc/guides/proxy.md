---
title: "프록시와 프록시 풀 - CyberGo HTTPC | 구성과 회전 서킷 브레이킹"
description: "HTTPC 프록시와 프록시 풀 가이드: HTTP/HTTPS/SOCKS5 단일 프록시, 시스템 프록시 감지와 NO_PROXY 우회, 프록시 풀 라운드 로빈과 무작위 전략, 서킷 브레이킹과 쿨다운 복구, ProxyRotateOnStatus 상태 코드 회전, 요청별 회전과 재시도 예산 상향."
sidebar_label: "프록시와 프록시 풀"
sidebar_position: 11
---

# 프록시와 프록시 풀

기업 네트워크 통과, 스크래핑 작업의 프록시 IP 회전, 대상 사이트의 IP 차단 회피 등 프록시는 HTTP 클라이언트의 빈번한 요구 사항입니다. HTTPC는 네 가지 프록시 모드를 내장했습니다 — 단일 프록시, 시스템 프록시 감지, 프록시 풀 회전, 상태 코드 트리거 회전 — 「고정된 송출 경로」부터 「요청마다 IP 교체」까지 전체 스펙트럼을 커버하며, SSRF 방어·TLS 검증·재시도 엔진과 협력해 동작합니다. 모든 프록시 구성은 `ConnectionConfig`에 집중되어 있습니다.

## 프록시 모드 개요

네 가지 모드는 우선순위에 따라 자동으로 적용되며, 여러 가지를 동시에 구성하면 가장 높은 우선순위 하나만 적용됩니다:

| 우선순위 | 구성 | 동작 | 전형적인 시나리오 |
|--------|------|------|----------|
| 1 (최고) | `ProxyURL` | 항상 지정된 프록시 사용 (단일 프록시 모드) | 기업 네트워크 게이트웨이, 로컬 VPN 포트 |
| 2 | `ProxyPool` | 프록시 풀에서 회전, 서킷 브레이킹과 복구 포함 | 스크래핑, 부하 분산, IP 회전 |
| 3 | `EnableSystemProxy` | 시스템 프록시 설정 자동 감지 | 데스크톱 앱이 사용자 구성 따르기 |
| 4 (최저) | 없음 | 직접 연결 | 기본 동작 |

:::tip
`ProxyURL`과 `ProxyPool`을 동시에 설정하면 `ProxyURL`이 적용됩니다. 프록시 풀을 사용하려면 `ProxyURL`을 비우세요.
:::

## 단일 프록시 구성

`ProxyURL`은 고정 프록시 하나를 지정하며, 네 가지 프로토콜을 지원합니다:

| 프로토콜 | 작성법 | 설명 |
|------|------|------|
| HTTP | `http://proxy:8080` | 가장 흔함; HTTPS 요청은 CONNECT 터널로 전달 |
| HTTPS | `https://proxy:8443` | 프록시 서버 자체와도 TLS 통신 |
| SOCKS5 | `socks5://proxy:1080` | 로컬에서 대상 도메인을 해석한 뒤 프록시로 연결 |
| SOCKS5h | `socks5h://proxy:1080` | 도메인 해석을 프록시 측에 위임, 로컬 DNS 오염 회피 |

```go
package main

import (
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Connection.ProxyURL = "socks5://proxy.example.com:1080"

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://api.example.com/data")
    if err != nil {
        log.Fatal(err)
    }
    // 출력: 상태: 200, 프록시: socks5://proxy.example.com:1080
    log.Printf("상태: %d, 프록시: %s", result.StatusCode(), result.Meta.ProxyURL)
}
```

### 인증과 마스킹

프록시 자격 증명은 URL의 userinfo 부분에 직접 작성합니다:

<!-- check-code: skip -->
```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyURL = "http://user:password@proxy.example.com:8080"
```

:::tip 자격 증명 자동 마스킹
`Config.String()`은 프록시 URL의 사용자 이름과 비밀번호를 `***:***`로 치환합니다; 오류 메시지와 로그의 URL도 자동 마스킹됩니다(자격 증명과 민감 쿼리 매개변수 가려짐). 자격 증명이 로그로 새어 나가지는 않지만, 구성 파일 자체는 여전히 안전하게 보관해야 합니다.
:::

## 시스템 프록시 감지와 NO_PROXY

활성화하면 운영체제의 프록시 설정을 자동 감지하며, `ProxyURL`을 수동 지정할 필요가 없습니다:

<!-- check-code: skip -->
```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableSystemProxy = true
```

### 플랫폼 차이

| 플랫폼 | 감지 소스 |
|------|----------|
| Windows | 레지스트리 Internet Settings (`ProxyEnable` / `ProxyServer`) |
| macOS | `networksetup` 명령으로 기본 네트워크 서비스의 Web/Secure Web Proxy 읽기 |
| Linux | 환경 변수 `HTTP_PROXY` / `HTTPS_PROXY` |

:::tip Meta.ProxyURL에는 시스템 프록시가 포함되지 않음
시스템 프록시 선택은 `Result.Meta.ProxyURL`에 기록되지 않습니다(이 필드는 명시적인 `Connection.ProxyURL` 또는 `ProxyPool`을 설정한 경우에만 값을 가지며, 직접 연결과 시스템 프록시 모두에서 비어 있습니다). 요청마다 송출 프록시를 확인해야 한다면 명시적인 설정을 사용하세요.
:::

### 감지 순서와 세부 사항

1. **환경 변수 우선** (전 플랫폼): 먼저 `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`를 읽고(대소문자 모두 인식), 값이 있으면 그대로 사용하며 시스템 설정을 더 조회하지 않습니다.
2. **플랫폼 감지 폴백**: 환경 변수가 없을 때 플랫폼 설정을 읽습니다. Linux 데스크톱(GNOME/KDE)의 프록시는 보통 세션이 환경 변수로 내보내므로, 엔진이 gsettings/dconf를 직접 읽지는 않습니다.
3. **요청 분기**: HTTPS 요청은 `HTTPS_PROXY`를 우선 사용하고, 없으면 `HTTP_PROXY`로 폴백; HTTP 요청은 `HTTP_PROXY`만 사용하며, 없을 때 `HTTPS_PROXY`로도 폴백 — net/http의 해석 순서와 동일합니다.
4. **CGI 환경에서 직접 연결**: 환경 변수에서 온 프록시는 CGI 환경(`REQUEST_METHOD`가 설정됨)에서 적용되지 않으며, net/http 동작과 일치합니다.
5. **네이키드 주소 자동 보완**: `HTTP_PROXY=proxy:8080`처럼 프로토콜 접두사가 없는 값은 `http://`로 취급됩니다.
6. **캐시**: 감지 결과는 클라이언트 수명 주기 동안 캐시되며, 환경 변수 변화를 실시간으로 반영하지 않습니다; 변화를 감지해야 하면 클라이언트를 새로 만드세요.

### NO_PROXY 우회 규칙

`NO_PROXY`는 프록시를 거치지 않을 호스트를 지정하며, 의미는 net/http의 httpproxy 패키지와 동일합니다:

| 규칙 | 예시 | 매칭 범위 |
|------|------|----------|
| 전부 우회 | `*` | 모든 호스트 직접 연결 |
| 도메인 접미사 | `example.com` 또는 `.example.com` | 해당 도메인과 모든 하위 도메인 |
| 와일드카드 하위 도메인 | `*.example.com` | `.example.com`과 동등 |
| IP 리터럴 | `10.0.0.5` | 해당 IP와 정확히 일치 |
| CIDR 범위 | `10.0.0.0/8` | 범위 내 모든 IP |
| 호스트 + 포트 | `example.com:443` | 호스트가 일치하고 포트도 정확히 일치 |

여러 규칙은 쉼표로 구분합니다; `localhost`는 항상 직접 연결되므로 `NO_PROXY`에 쓸 필요가 없습니다.

```bash
# Linux/macOS 설정 예시
export HTTPS_PROXY=http://proxy.corp.example.com:8080
export NO_PROXY=localhost,127.0.0.1,.internal.corp.com,10.0.0.0/8
```

```powershell
# Windows (PowerShell) 설정 예시
$env:HTTPS_PROXY = "http://proxy.corp.example.com:8080"
$env:NO_PROXY = "localhost,127.0.0.1,.internal.corp.com"
```

:::warning 동적 localhost 프록시의 제한
시스템 프록시 모드에서 SSRF 면제 목록은 클라이언트 구축 시 한 번만 탐지됩니다. 실행 중 시스템 프록시가 새로운 내부망/루프백 주소(예: `127.0.0.1`)로 전환되면 해당 주소가 SSRF 방어에 걸릴 수 있습니다. 동적인 시나리오에서는 `Connection.ProxyURL`을 명시적으로 설정하거나(프록시 주소는 항상 SSRF 검증 면제) `SSRFExemptCIDRs`를 구성하세요.
:::

## 프록시 풀

여러 프록시 IP에 요청을 분산해야 할 때(스크래핑, 부하 분산, IP 회전), 프록시 풀은 자동 회전, 수동적 서킷 브레이킹, 상태 코드 기반 프록시 교체를 제공합니다 — 외부 컴포넌트가 전혀 필요 없습니다.

### 기본 사용법

```go
package main

import (
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Connection.ProxyPool = []string{
        "http://proxy1:8080",
        "http://proxy2:8080",
        "http://proxy3:8080",
    }
    cfg.Connection.ProxyPoolStrategy = httpc.ProxyStrategyRoundRobin // 기본값, 생략 가능

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://api.example.com/data")
    if err != nil {
        log.Fatal(err)
    }
    // 출력: 상태: 200, 프록시: http://proxy1:8080 (다음 요청은 자동으로 proxy2)
    log.Printf("상태: %d, 프록시: %s", result.StatusCode(), result.Meta.ProxyURL)
}
```

풀 항목은 `http`, `https`, `socks5`, `socks5h` 프로토콜을 지원하며 섞어 쓸 수 있습니다.

### 설정 필드

| 필드 | 타입 | 기본값 | 설명 |
|------|------|------|------|
| `ProxyPool` | `[]string` | `nil` | 프록시 URL 목록 |
| `ProxyPoolStrategy` | `ProxyStrategy` | `ProxyStrategyRoundRobin` | 선택 전략 |
| `ProxyFailureThreshold` | `int` | `3` (0이면 폴백) | 연속 연결 실패 서킷 브레이크 임계값 |
| `ProxyCooldown` | `time.Duration` | `30s` (0이면 폴백) | 서킷 브레이크된 프록시의 쿨다운 시간 |
| `ProxyRotatePerRequest` | `bool` | `false` | 매 독립 요청마다 프록시 강제 교체 (유휴 연결 재사용 비활성화) |
| `ProxyRotateOnStatus` | `[]int` | `nil` | 프록시 교체 재시도를 트리거하는 상태 코드 (각 항목은 100–599 범위) |

### 선택 전략

| 전략 | 상수 | 설명 |
|------|------|------|
| 라운드 로빈 (기본값) | `ProxyStrategyRoundRobin` | 순서대로 순환 선택, 매 선택마다 커서 진행 |
| 무작위 | `ProxyStrategyRandom` | 정상 프록시 중 균일하게 무작위 선택 |

:::tip 라운드 로빈 + 재시도 = 자동 IP 교체
라운드 로빈 전략은 매 선택 시 커서를 진행하므로, 재시도가 선택을 다시 트리거하면 자연스럽게 다음 프록시로 떨어집니다. 추가 구성이 필요 없습니다.
:::

### 수동적 서킷 브레이킹

프록시 풀은 수동적 헬스 체크를 내장합니다. **연결 계층 실패**(dial/TLS)만 서킷 브레이크를 트리거하며, HTTP 상태 코드는 트리거하지 않습니다:

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

<!-- check-code: skip -->
```go
cfg.Connection.ProxyFailureThreshold = 5        // 더 관대하게, 일시적 지터 허용
cfg.Connection.ProxyCooldown = 60 * time.Second // 더 긴 쿨다운
```

모든 프록시가 서킷 브레이크된 경우, 쿨다운이 가장 짧은 (복구에 가장 가까운) 프록시를 폴백으로 반환하며 즉시 실패하지 않습니다.

### 상태 코드 회전

Cloudflare/WAF 등 IP 차단 시나리오용 — 특정 상태 코드가 반환되면 자동으로 프록시를 바꿔 재시도합니다:

```go
package main

import (
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Connection.ProxyPool = []string{
        "http://proxy1:8080",
        "http://proxy2:8080",
        "http://proxy3:8080",
    }
    cfg.Connection.ProxyRotateOnStatus = []int{403} // 403 수신 시 프록시 교체 재시도
    cfg.Retry.MaxRetries = 3                        // 재시도 활성화 필수

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://protected-site.example.com/data")
    if err != nil {
        log.Fatal(err)
    }
    // 출력: 상태: 200, 프록시: http://proxy2:8080, 시도: 2
    log.Printf("상태: %d, 프록시: %s, 시도: %d",
        result.StatusCode(), result.Meta.ProxyURL, result.Meta.Attempts)
}
```

:::warning 상태 코드 회전 ≠ 서킷 브레이킹
`ProxyRotateOnStatus`로 트리거된 회전은 프록시를 서킷 브레이크하지 **않습니다** — IP 차단은 대상별인 경우가 많습니다(한 프록시가 A 사이트에서 차단되어도 B 사이트에서는 정상일 수 있음). 서킷 브레이킹은 연결 계층 실패로만 트리거됩니다. 동작하려면 `Retry.MaxRetries > 0`이 필요합니다.

`ProxyRotateOnStatus`가 설정되고 프록시 풀에 여러 프록시가 있으면 재시도 예산이 자동으로 `len(ProxyPool) - 1`까지 상향됩니다(`MaxRetries` 상한 10 제한), 모든 프록시가 시도될 기회를 보장합니다.
:::

### 요청별 회전

`ProxyRotatePerRequest`는 **연결 재사용** 때문에 프록시 터널이 고정되는 문제를 해결합니다: HTTP 연결 풀은 이미 수립된 TCP 연결을 재사용하며, 여기에는 프록시 터널도 포함됩니다. 즉 같은 호스트에 대한 연속 요청은 `ProxyPoolStrategy`가 선택기 커서를 이미 회전했더라도 이전 요청의 프록시를 재사용합니다.

활성화하면 매 요청 시작 시 모든 유휴 연결을 닫아 Transport가 프록시 풀을 다시 평가하게 강제합니다 — 대가는 연결 재사용이 없다는 것(매 요청마다 새 연결 + 프록시 터널)이지만 요청별 회전이 보장됩니다:

```go
package main

import (
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Connection.ProxyPool = []string{
        "http://proxy1:8080",
        "http://proxy2:8080",
        "http://proxy3:8080",
    }
    cfg.Connection.ProxyRotatePerRequest = true // 매 요청마다 프록시 교체

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    for i := 0; i < 3; i++ {
        result, err := client.Get("https://api.example.com/data")
        if err != nil {
            log.Fatal(err)
        }
        // 출력 (순서대로): http://proxy1:8080 / http://proxy2:8080 / http://proxy3:8080
        log.Printf("%d번째 요청 경유: %s", i+1, result.Meta.ProxyURL)
    }
}
```

:::tip 적용 시나리오
같은 호스트에 대한 스크래핑에 적합 — 매 요청의 소스 IP가 달라 대상 사이트의 IP 차단 위험이 줄어듭니다. 서로 다른 호스트에 대한 요청은 연결 재사용이 같은 프록시에 묶이지 않으므로 보통 활성화할 필요가 없습니다.
:::

`ProxyRotateOnStatus`와 마찬가지로 `ProxyRotatePerRequest`도 프록시 풀에 여러 프록시가 있으면 재시도 예산을 `len(ProxyPool) - 1`까지 자동 상향하여(상한 10), 각 프록시가 최소 한 번 시도되도록 보장합니다.

### 결정론적 회전

상태 코드 회전의 재시도는 일반 재시도와 다릅니다: 엔진은 매 요청에 **기준 프록시 인덱스** 하나를 배정하고, N번째 재시도는 고정적으로 「기준 + N」에 해당하는 프록시를 사용합니다. 이로써 세 가지가 보장됩니다:

- **재시도마다 프록시 교체**: 같은 요청 안에서 N번째 재시도와 N-1번째는 반드시 다른 프록시에 떨어집니다;
- **리다이렉트 체인 유지**: 같은 시도 안의 여러 차례 이동은 같은 인덱스를 공유하므로, 리다이렉트를 따라가며 프록시 선택을 몇 번 더 소비해도 어긋나지 않습니다;
- **요청 간 지속 회전**: 서로 다른 요청의 기준 인덱스가 증가하며 전체적으로 라운드 로빈/무작위 분포가 유지됩니다.

또한 프록시 자체의 연결 실패(dial/TLS 실패)는 회전이 활성화되어 있으면 **항상 재시도 가능**합니다 — 일반 분류가 재시도 불가로 판정하더라도(예: 영구적인 주소 오류) 다음 번에는 프록시를 바꿔 다시 시도하며, 수동적 서킷 브레이킹과 함께 나쁜 프록시를 자연스럽게 도태시킵니다. 재시도 측 세부 사항은 [재시도와 내결함성](./retry-fault-tolerance)을 참조하세요.

## 이번 요청에 사용된 프록시 확인

프록시 풀 시나리오에서는 「이 요청이 실제로 어떤 프록시를 거쳤는지」 감사가 자주 필요합니다. 두 도구를 조합하세요:

- **`Result.Meta.ProxyURL`**: 최종 응답을 만들어낸 시도가 사용한 프록시를 보고; 직접 연결이면 빈 문자열이며 시스템 프록시(`EnableSystemProxy`)도 마찬가지로 기록되지 않습니다(계속 빈 값). 회전 시나리오에서는 재시도마다 다른 프록시를 쓸 수 있으며, 이 필드는 **최종 시도**에 해당합니다.
- **`WithOnResponse` 콜백**: 매 시도(프록시를 바꾼 재시도 포함)마다 트리거되어, 시도별 상태 코드와 시도 횟수를 관찰할 수 있습니다.

```go
package main

import (
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Connection.ProxyPool = []string{
        "http://proxy1:8080",
        "http://proxy2:8080",
        "http://proxy3:8080",
    }
    cfg.Connection.ProxyRotateOnStatus = []int{403}

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://protected-site.example.com/data",
        httpc.WithOnResponse(func(resp httpc.ResponseMutator) error {
            log.Printf("%d번째 시도에서 %d 수신", resp.Attempts(), resp.StatusCode())
            return nil
        }),
    )
    if err != nil {
        log.Fatal(err)
    }

    // 출력: 최종 프록시: http://proxy2:8080, 총 시도: 2
    log.Printf("최종 프록시: %s, 총 시도: %d", result.Meta.ProxyURL, result.Meta.Attempts)
}
```

:::tip 콜백은 시도 단위로, 미들웨어는 요청 단위로 실행
`WithOnResponse`는 엔진 내부에서 트리거되어 매 시도(재시도 포함)마다 실행됩니다; 미들웨어 체인은 재시도 주기 전체를 감싸므로 하나의 논리적 요청에 한 번만 실행됩니다. 시도별 관찰은 콜백, 요청 단위 감사는 [미들웨어 체인](./middleware-chain)을 사용하세요.
:::

## 프록시와 재시도의 상호작용

프록시 회전과 재시도 엔진은 깊게 연동합니다. 두 가지 규칙을 기억할 만합니다.

**1. 재시도 예산 자동 상향.** `ProxyRotateOnStatus` 또는 `ProxyRotatePerRequest`를 설정하고 프록시 풀이 1개 초과이면:

```text
유효 MaxRetries = max(구성된 MaxRetries, len(ProxyPool) - 1) (상한 10)
```

예를 들어 프록시 5개, `MaxRetries = 3` 구성: 예산은 4(= 5 - 1)로 상향되어, 첫 요청은 proxy1을 사용하고 403 수신 후 proxy2…proxy5로 차례로 바꿔 각 프록시를 한 번씩 시도합니다.

**2. 프록시 연결 실패는 강제 재시도.** 회전이 활성화되어 있으면 프록시 자체의 연결 실패(dial 실패, TLS 실패)는 일반 재시도 가능 분류를 우회해 다음 재시도로 바로 진입하고 다음 프록시로 이동합니다 — 영구적으로 죽은 프록시(포트 오류, 호스트 도달 불가)를 미리 수동 제거할 필요가 없으며, 강제 재시도 + 연속 실패 서킷 브레이킹이 자연스럽게 도태시킵니다.

재시도 조건, 백오프 수학, 재시도 간 공유되는 총 타임아웃 예산은 [재시도와 내결함성](./retry-fault-tolerance)을 참조하세요.

## 프록시 시나리오의 보안 주의 사항

프록시 관련 기능은 다음 보안 세부 사항을 자동으로 처리하므로 수동 구성이 필요 없습니다:

- **SSRF 면제**: 프록시 호스트 주소(`ProxyURL`과 `ProxyPool` 전체 항목)는 자동으로 SSRF 면제 목록에 추가되어 사설 IP 검사에 걸리지 않습니다 — 로컬 프록시(예: `127.0.0.1:7890`)도 정상 동작합니다.
- **중복 제거**: 프록시 풀에서 같은 `host:port`의 항목은 자동 병합되어 회전 편향과 중복 카운트를 방지합니다.
- **URL 검증**: 모든 프록시 URL은 보안 검증을 거칩니다(프로토콜 화이트리스트 http/https/socks5/socks5h, host 비어 있지 않음, 주입 방지). 잘못된 값은 `New()`에서 즉시 오류를 반환하며 조용히 무시되지 않습니다.

TLS와의 관계: HTTP 프록시의 CONNECT 터널을 지나는 HTTPS 요청은 여전히 **종단 간 TLS**입니다 — 인증서 검증, 최소 TLS 버전, 인증서 고정은 대상 사이트에 그대로 적용되며 프록시는 암호문만 전달할 수 있습니다. 로컬 DNS 오염이 걱정되면 `socks5h`를 우선 사용하세요(도메인 해석을 프록시 측에 위임); DoH를 활성화하면 비즈니스 도메인은 암호화 해석을 거치지만 프록시 주소 자체는 DoH를 거치지 않습니다(프록시는 개발자가 명시적으로 구성하므로 프록시 호스트에 직접 다이얼). SSRF 방어 전체는 [SSRF 방어](../security/ssrf)를 참조하세요.

## 자주 묻는 질문

| 문제 | 원인 | 해결 방법 |
|------|------|----------|
| 프록시가 적용되지 않음 | `ProxyURL`과 `ProxyPool`을 동시에 설정, `ProxyURL`이 우선 | `ProxyURL`을 비우고 `ProxyPool`만 사용 |
| 같은 호스트에 연속 요청해도 송출 IP가 변하지 않음 | 연결 재사용이 이전 프록시 터널에 묶임 | `ProxyRotatePerRequest` 활성화 |
| 프록시가 잦은 서킷 브레이크 | `ProxyFailureThreshold`가 너무 낮음 | 임계값 또는 `ProxyCooldown` 증가 |
| 상태 코드 회전이 동작하지 않음 | `Retry.MaxRetries = 0`이거나 프록시 풀에 프록시 1개뿐 | `MaxRetries > 0` 설정; 풀에 최소 2개 프록시 |
| 모든 프록시가 서킷 브레이크되면? | 풀 전체 연속 실패 | 엔진이 복구에 가장 가까운 프록시를 폴백으로 반환하며 즉시 실패하지 않음; 프록시 가용성과 임계값 점검 |
| 시스템 프록시가 감지되지 않음 | 환경 변수가 없고 플랫폼 설정도 꺼져 있음 | `HTTP_PROXY`/`HTTPS_PROXY` 또는 시스템 프록시 스위치 확인 |
| localhost 프록시가 SSRF에 걸림 | 시스템 프록시의 면제 목록은 구축 시 한 번만 탐지 | `Connection.ProxyURL` 명시 설정 (항상 면제) 또는 `SSRFExemptCIDRs` 구성 |
| 403 수신 후 프록시를 바꿨는데 서킷 브레이크된 건가요? | 상태 코드가 서킷 브레이크를 트리거한다는 오해 | 아니요 — 상태 코드 회전은 프록시를 서킷 브레이크하지 않으며, 연결 계층 실패만 브레이크 |
| `Meta.ProxyURL`이 항상 비어 있음 | 시스템 프록시만 활성화됨 — `EnableSystemProxy`는 이 필드에 기록되지 않음 | 송출을 확인해야 한다면 명시적인 `ProxyURL` 또는 `ProxyPool` 사용 |

전체 필드 설명은 [설정 API — 프록시 풀](../api-reference/client-config/config#프록시-풀)을 참조하세요.

## 모범 사례

| 시나리오 | 권장 구성 |
|------|----------|
| 기업 고정 게이트웨이 | `ProxyURL` (필요에 따라 http/https/socks5) |
| 사용자 시스템 설정 따르기 | `EnableSystemProxy` + `NO_PROXY`로 내부망 대역 허용 |
| 다중 프록시 부하 분산 | `ProxyPool` + 기본 라운드 로빈 전략 |
| 같은 호스트 스크래핑 | `ProxyPool` + `ProxyRotatePerRequest` |
| CF/WAF IP 차단 | `ProxyPool` + `ProxyRotateOnStatus: []int{403}` |
| 프록시 품질 불균일 | `ProxyFailureThreshold`(지터 허용)와 `ProxyCooldown` 증가 |
| 송출 IP 감사 필요 | `Result.Meta.ProxyURL` 읽기, `WithOnResponse`로 시도별 관찰 |
| 프록시 자격 증명 관리 | URL userinfo에 작성, 로그는 자동 마스킹; 구성 파일은 별도 보관 |

:::warning 회전의 성능 대가
`ProxyRotatePerRequest`와 상태 코드 회전의 재시도 경로는 모두 유휴 연결을 닫아 연결 재사용을 희생하고 송출 회전을 얻습니다. 성능에 민감하고 회전이 필요 없는 시나리오는 기본값(연결 재사용)을 유지하세요. 유휴 연결 관리는 [연결 풀과 DNS](./connection-pool)를 참조하세요.
:::

## 다음 단계

- [연결 풀과 DNS](./connection-pool) - 연결 재사용과 프록시 회전의 상호작용, DoH 해석
- [재시도와 내결함성](./retry-fault-tolerance) - 재시도 조건, 백오프 알고리즘과 프록시 풀 연동
- [성능 최적화](./performance) - 프록시 회전의 성능 대가와 전반적 튜닝
- [설정 API](../api-reference/client-config/config) - ConnectionConfig 프록시 필드 레퍼런스
