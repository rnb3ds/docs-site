---
sidebar_label: "빠른 시작"
title: "빠른 시작 - CyberGo HTTPC | 5분 만에 입문"
description: "HTTPC 빠른 시작 가이드: go get 설치와 프로젝트 초기화, GET/POST 요청과 응답 처리, 5가지 설정 프리셋 선택, JSON 파싱과 타입 바인딩, Bearer Token 인증과 ClientError 오류 분류로 5분 만에 안전한 HTTP 클라이언트를 시작하세요."
sidebar_position: 1
---

# 빠른 시작

## 설치

```bash
# 1. 프로젝트 생성과 Go 모듈 초기화(기존 프로젝트는 이 단계 건너뛰기)
mkdir httpc-demo && cd httpc-demo
go mod init example.com/httpc-demo

# 2. 의존성 추가
go get github.com/cybergodev/httpc
```

코드에서 가져옵니다:

```go
import "github.com/cybergodev/httpc"
```

HTTPC는 Go 1.25 이상을 요구하며, `golang.org/x/sys` 외에는 타사 의존성이 없어 설정 없이도 첫 요청을 바로 보낼 수 있습니다.

## 기본 요청

클라이언트를 만들지 않고 패키지 함수를 직접 사용합니다:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    result, err := httpc.Get("https://httpbin.org/get")
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println(result.StatusCode()) // 200
    fmt.Println(result.Body())       // 응답 내용
}
```

지원되는 HTTP 메서드: `Get`, `Post`, `Put`, `Patch`, `Delete`, `Head`, `Options`.

### 무슨 일이 일어나나요

- 패키지 함수는 내부적으로 **지연 초기화된 공유 기본 클라이언트**를 사용합니다 — 첫 호출 때 만들어지고 이후 재사용되며, 동시성 안전입니다.
- 반환값 `*Result`는 상태 코드, 응답 헤더, 응답 본문, 요청 메타 정보(소요 시간, 시도 횟수, 리다이렉트 체인)를 한데 모읍니다.
- `err != nil`은 **네트워크 계층 오류**(연결 실패, 타임아웃, TLS 오류 등)만 나타냅니다. 4xx/5xx 상태 코드는 `result.IsSuccess()` 등의 메서드로 직접 확인해야 합니다.
- 기본 설정에는 TLS 1.2+, SSRF 방어, 응답 본문 10MB 상한, 최대 3회 지능형 재시도가 포함되어 있어 추가 설정이 필요 없습니다.

## 클라이언트 생성

커스텀 설정이 필요하면 클라이언트 인스턴스를 만듭니다:

```go
client, err := httpc.NewDefault()
if err != nil {
    log.Fatal(err)
}
defer client.Close()

result, err := client.Get("https://httpbin.org/get")
```

클라이언트는 연결 풀 등의 리소스를 보유하므로 다 쓰면 `Close()`를 호출해야 합니다. 장기 실행 서비스는 보통 프로세스 수명 동안 한 번만 만들어 전역 공유합니다 — `Client`는 동시성 안전이므로 요청마다, goroutine마다 만들 필요가 없습니다.

### 프리셋 설정

| 설정 | 용도 | 특징 |
|------|------|------|
| `DefaultConfig()` | 범용 시나리오 | 안전한 기본값, SSRF 방어 활성화 |
| `SecureConfig()` | 보안 민감 시나리오 | 자동 리다이렉트 비활성화, 엄격한 타임아웃 |
| `PerformanceConfig()` | 높은 처리량 시나리오 | 큰 연결 풀, 긴 타임아웃, Cookie 활성화 |
| `TestingConfig()` | 테스트 환경 | 보안 검사와 HTTP/2 비활성화, Cookie 활성화 |
| `MinimalConfig()` | 경량 요청 | 재시도 없음, 리다이렉트 없음 |

```go
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 60 * time.Second

client, err := httpc.New(cfg)
```

모든 요청에 적용되는 기본값(User-Agent, 기본 요청 헤더, 리다이렉트 정책)을 설정할 수도 있습니다:

```go
cfg := httpc.DefaultConfig()
cfg.Defaults.UserAgent = "myapp/2.0"
cfg.Defaults.Headers["Authorization"] = "Bearer " + token
cfg.Defaults.FollowRedirects = false

client, err := httpc.New(cfg)
```

## 응답 처리

```go
result, err := client.Get("https://httpbin.org/json")
if err != nil {
    log.Fatal(err)
}

// 상태 확인
result.StatusCode()     // 200
result.IsSuccess()      // true (2xx)
result.IsClientError()  // false (4xx)
result.IsServerError()  // false (5xx)

// JSON 파싱
var data map[string]any
if err := result.Unmarshal(&data); err != nil {
    log.Fatal(err)
}
```

커스텀 구조체로 파싱:

```go
var repo struct {
    Name  string `json:"name"`
    Stars int    `json:"stargazers_count"`
}
if err := result.Unmarshal(&repo); err != nil {
    log.Fatal(err)
}
```

요청 메타 정보 확인:

```go
result.Meta.Duration       // 총 소요 시간(재시도 대기 포함)
result.Meta.Attempts       // 시도 횟수(첫 시도 + 재시도)
result.Meta.RedirectChain  // 거쳐 간 리다이렉트 URL 체인
result.Meta.ProxyURL       // 이번에 사용한 프록시(직접 연결 또는 시스템 프록시면 빈 값)
```

:::tip
`Unmarshal`은 응답 본문이 비어 있으면 `ErrResponseBodyEmpty`를, 50MB를 초과하면 `ErrResponseBodyTooLarge`를 반환합니다.
:::

## 데이터 전송

```go
// JSON
result, err := client.Post("https://httpbin.org/post",
    httpc.WithJSON(map[string]any{"name": "test"}),
)
```

```go
// 폼
result, err := client.Post("https://httpbin.org/post",
    httpc.WithForm(map[string]string{"username": "admin"}),
)
```

```go
// 인증 포함
result, err := client.Get("https://api.example.com/data",
    httpc.WithBearerToken("my-token"),
)
```

```go
// 쿼리 매개변수
result, err := client.Get("https://httpbin.org/get",
    httpc.WithQuery("page", 1),
    httpc.WithQueryMap(map[string]any{"limit": 10, "sort": "desc"}),
)
```

```go
// 파일 업로드(multipart/form-data)
result, err := client.Post("https://httpbin.org/post",
    httpc.WithFile("file", "report.pdf", fileBytes),
)
```

## 오류 처리

HTTPC는 **네트워크 계층 오류**와 **HTTP 상태 코드**를 구분합니다:

```go
result, err := client.Get("https://api.example.com/data")
if err != nil {
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        log.Printf("오류 코드: %s", clientErr.Code())
    }
    log.Fatal(err)
}

// HTTP 상태 코드는 수동으로 확인해야 합니다
switch {
case result.IsSuccess():
    // 2xx 성공
case result.IsClientError():
    log.Printf("클라이언트 오류: %d", result.StatusCode())
case result.IsServerError():
    log.Printf("서버 오류: %d", result.StatusCode())
}
```

:::tip
4xx/5xx는 `error`로 반환되지 않으며 `result.IsSuccess()` 등의 메서드로 확인해야 합니다. 자세한 내용은 [오류 처리](../guides/error-handling)를 참조하세요.
:::

## 첫 완전한 프로그램

바로 `go run`할 수 있는 완전한 예제입니다. GitHub API로 저장소 정보를 조회하며, 클라이언트 생성, 요청 헤더 설정, 타임아웃 제어, 상태 확인, JSON 파싱을 두루 다룹니다:

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

// Repo는 GitHub API의 저장소 응답에 대응
type Repo struct {
    Name        string `json:"name"`
    Description string `json:"description"`
    Stars       int    `json:"stargazers_count"`
}

func main() {
    // 1. 클라이언트 생성(기본 설정: TLS 1.2+, SSRF 방어, 최대 3회 재시도)
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // 2. 요청 전송: 기본 헤더 + 요청 수준 타임아웃
    result, err := client.Get("https://api.github.com/repos/golang/go",
        httpc.WithUserAgent("httpc-demo/1.0"),
        httpc.WithTimeout(15*time.Second),
    )
    if err != nil {
        log.Fatal(err) // 네트워크 계층 오류(연결/타임아웃/TLS 등)
    }

    // 3. HTTP 상태 코드 확인(4xx/5xx는 error가 아니므로 수동 확인)
    if !result.IsSuccess() {
        log.Fatalf("HTTP 오류: %d", result.StatusCode())
    }

    // 4. JSON을 구조체로 파싱
    var repo Repo
    if err := result.Unmarshal(&repo); err != nil {
        log.Fatal(err)
    }

    fmt.Printf("%s: %s(%d별)\n", repo.Name, repo.Description, repo.Stars)
    fmt.Printf("소요 %v, 시도 %d회\n", result.Meta.Duration, result.Meta.Attempts)
}
// 출력(별 수와 소요 시간은 실제에 따라 달라짐):
// go: The Go programming language(124000별)
// 소요 350ms, 시도 1회
```

## 자주 만나는 첫 단계 시나리오

### JSON API 호출(인증 + 쿼리 매개변수)

```go
result, err := client.Get("https://api.example.com/v1/issues",
    httpc.WithBearerToken(token),                                   // Bearer 인증
    httpc.WithQueryMap(map[string]any{"state": "open", "page": 2}), // 쿼리 매개변수
    httpc.WithHeader("Accept", "application/json"),
)
```

### 타임아웃과 재시도가 있는 요청

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Timeouts.Request = 30 * time.Second // 전체 타임아웃 예산(모든 재시도 포함)
    cfg.Retry.MaxRetries = 3                // 최대 3회 재시도(0이면 비활성화)
    cfg.Retry.Delay = time.Second           // 초기 백오프 1s
    cfg.Retry.BackoffFactor = 2.0           // 매번 백오프 ×2(1s → 2s → 4s)
    cfg.Retry.EnableJitter = true           // 지터로 동시 재시도 폭주(선더링 헤드) 방지

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // httpbin의 /status/503은 항상 503을 반환(재시도 가능 상태 코드)
    result, err := client.Get("https://httpbin.org/status/503")
    if err != nil {
        log.Fatal(err) // 네트워크 계층 오류
    }

    // 503은 재시도 가능 상태 코드: 재시도를 소진하면 마지막 응답 반환(error가 아님)
    fmt.Println("상태 코드:", result.StatusCode())   // 503
    fmt.Println("시도 횟수:", result.Meta.Attempts) // 4(첫 시도 + 3회 재시도)
}
// 출력:
// 상태 코드: 503
// 시도 횟수: 4
```

### 로컬 또는 내부망 서비스 접근

기본 설정은 `127.0.0.1`, `10.x`, `192.168.x` 같은 사설/예약 주소 연결을 차단합니다(SSRF 방어). 로컬 연동에는 세 가지 여는 방법이 있습니다:

```go
// 방법 1: 요청별 면제(권장, 영향 범위가 가장 작음)
result, err := httpc.Get("http://localhost:8080/health",
    httpc.WithAllowPrivateIPs(true),
)

// 방법 2: 내부망 CIDR 정밀 면제(예: Tailscale, VPC)
cfg := httpc.DefaultConfig()
cfg.Security.SSRFExemptCIDRs = []string{"10.0.0.0/8"}
client, _ := httpc.New(cfg)

// 방법 3: 테스트 프리셋(로컬 개발/테스트 전용, 프로덕션 사용 금지)
client, _ = httpc.New(httpc.TestingConfig())
```

자세한 내용은 [SSRF 방어](../security/ssrf)를 참조하세요.

## 다음 단계

**입문 경로**

- **[핵심 개념](./concepts)** - 2계층 아키텍처, 설정 체계와 요청 수명주기
- **[요청과 응답](../guides/request-response)** - 완전한 요청 옵션과 응답 처리
- **[net/http에서 마이그레이션](../guides/migration)** - 표준 라이브러리 경험의 항목별 대응

**주제별 심화**

- **[재시도와 내결함성](../guides/retry-fault-tolerance)** - 백오프 정책, 커스텀 재시도와 프록시 풀 연동
- **[미들웨어 체인](../guides/middleware-chain)** - 로깅, 메트릭, 감사와 커스텀 미들웨어
- **[연결 풀과 DNS](../guides/connection-pool)** - 연결 풀 튜닝과 DoH
- **[프록시와 프록시 풀](../guides/proxy)** - 단일 프록시, 시스템 프록시, 프록시 풀 회전과 서킷 브레이킹
- **[파일 업로드와 다운로드](../guides/file-transfer)** - 다운로드, 이어받기와 파일 업로드
- **[도메인 클라이언트와 세션](../guides/domain-session)** - DomainClient와 Cookie 세션 관리
- **[리다이렉트](../guides/redirects)** - 팔로우 정책과 도메인 허용 목록
- **[성능 최적화](../guides/performance)** - 튜닝 체크리스트와 시나리오별 설정
- **[테스트 가이드](../guides/testing)** - TestingConfig와 mock 방안

**더 많은 자료**

- **[실전 튜토리얼](../guides/tutorial)** - 30분 만에 GitHub API 클라이언트 구축
- **[치트시트](./cheatsheet)** - 자주 쓰는 작업 빠른 참조
- **[보안](../security/)** - 보안 모범 사례와 프로덕션 체크리스트
