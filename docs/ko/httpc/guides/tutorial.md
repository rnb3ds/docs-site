---
sidebar_label: "실전 튜토리얼"
title: "실전 튜토리얼 - CyberGo HTTPC | GitHub API 실전"
description: "30분 실전 튜토리얼: GitHub API를 예제로 완전한 HTTP 클라이언트를 구축하며 패키지 함수, 설정 프리셋, WithQuery/WithJSON 옵션, NewDomain 도메인 클라이언트, 미들웨어 체인, ClientError 오류 분류, 파일 다운로드와 동시 요청까지 다룹니다."
sidebar_position: 1
---

# 실전 튜토리얼: GitHub API 클라이언트 구축

다음 예제는 GitHub API를 시나리오로 HTTPC의 핵심 기능을 시연합니다. 각 예제는 서로 독립적이므로 필요에 따라 참고하세요.

**배울 내용:**

- 클라이언트 생성과 설정 프리셋
- 패키지 함수와 기본 클라이언트의 관계
- 클라이언트 인스턴스의 수명 주기와 기본 설정
- GET/POST 요청 전송과 JSON 응답 처리
- 쿼리 매개변수와 자주 쓰는 요청 옵션
- 도메인 클라이언트로 API 기본 URL 관리
- 미들웨어 추가로 로깅과 메트릭 구현
- 오류 처리와 재시도
- Result 응답 객체와 자동 관리

## 기본 요청

의존성을 설치하고 `main.go`를 생성합니다:

```bash
go get github.com/cybergodev/httpc
```

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    result, err := httpc.Get("https://api.github.com/repos/golang/go")
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println(result.StatusCode()) // 200
    fmt.Println(result.Body())       // JSON 응답
}
```

핵심 포인트:
- 패키지 함수 `httpc.Get`는 클라이언트 생성 없이 사용할 수 있어 빠른 검증에 적합합니다
- Result는 요청마다 새로 만들어지며 GC가 자동 회수하므로 수동 해제가 필요 없습니다

### 패키지 함수와 기본 클라이언트

패키지 함수(`Get`/`Post`/`Request` 등)는 각자 따로 요청을 보내는 것이 아니라, **지연 초기화되는 하나의 기본 클라이언트**를 공유합니다. 첫 호출 때 싱글턴이 만들어지고 이후의 패키지 함수 호출은 모두 이를 재사용합니다. 기본 클라이언트가 닫히면 '자가 복구'됩니다 — 다음 패키지 함수 호출이 자동으로 다시 만듭니다.

이 기본 클라이언트를 교체할 수 있습니다:

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    // 커스텀 설정으로 기본 클라이언트 지정 (이전 기본 클라이언트는 자동으로 닫힘)
    cfg := httpc.DefaultConfig()
    cfg.Timeouts.Request = 30 * time.Second
    cfg.Retry.MaxRetries = 2

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    if err := httpc.SetDefaultClient(client); err != nil {
        log.Fatal(err)
    }

    // 이후의 패키지 함수는 모두 이 클라이언트를 사용
    result, err := httpc.Get("https://api.github.com/repos/golang/go")
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(result.StatusCode()) // 200

    // 프로그램 종료 전 기본 클라이언트 해제
    if err := httpc.CloseDefaultClient(); err != nil {
        log.Fatal(err)
    }
}
```

:::tip
장기 실행 서비스에서는 아래 '클라이언트 인스턴스 생성과 설정'의 명시적 클라이언트로 수명 주기를 관리하는 것이 좋습니다. 기본 클라이언트는 스크립트와 일회성 요청에 더 적합합니다.
:::

## JSON 응답 파싱

```go
type Repo struct {
    FullName    string `json:"full_name"`
    Description string `json:"description"`
    Stars       int    `json:"stargazers_count"`
    Language    string `json:"language"`
}

result, err := httpc.Get("https://api.github.com/repos/golang/go")
if err != nil {
    log.Fatal(err)
}

var repo Repo
if err := result.Unmarshal(&repo); err != nil {
    log.Fatal(err)
}

fmt.Printf("%s (⭐ %d)\n", repo.FullName, repo.Stars)
fmt.Printf("언어: %s\n", repo.Language)
fmt.Printf("설명: %s\n", repo.Description)
```

핵심 포인트:
- `result.Unmarshal(&v)`가 JSON 응답을 구조체로 바로 파싱합니다
- API 응답에 대응하는 Go 구조체를 정의합니다
- 응답 본문이 비어 있으면 `Unmarshal`은 `ErrResponseBodyEmpty`를 반환하고, 50MB를 초과하면 `ErrResponseBodyTooLarge`를 반환합니다

## 클라이언트 인스턴스 생성과 설정

패키지 함수 뒤에는 항상 하나의 기본 클라이언트가 있습니다. 설정과 수명 주기를 직접 제어하려면 `New`로 인스턴스를 명시적으로 생성합니다:

```go
package main

import (
    "errors"
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Timeouts.Request = 30 * time.Second
    cfg.Timeouts.Dial = 5 * time.Second
    cfg.Retry.MaxRetries = 2

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err) // 설정 검증 실패(잘못된 타임아웃 값 등)가 여기서 반환됨
    }
    defer client.Close()

    result, err := client.Get("https://api.github.com/repos/golang/go",
        httpc.WithUserAgent("my-github-app/1.0"),
    )
    if err != nil {
        if errors.Is(err, httpc.ErrClientClosed) {
            log.Fatal("클라이언트가 닫혀 있음:", err)
        }
        log.Fatal(err)
    }
    fmt.Println(result.StatusCode()) // 200
}
```

핵심 포인트:
- `New(cfg)`는 설정을 먼저 검증한 뒤 **깊은 복사**본을 만듭니다 — 생성 후 원본 `cfg` 변수를 수정해도 클라이언트 동작에 영향을 주지 않습니다
- `Close()`는 연결 풀과 전송 계층 리소스를 해제합니다. 닫은 뒤 다시 요청하면 `ErrClientClosed`가 반환됩니다
- 클라이언트는 동시 사용에 안전합니다(아래 '동시 요청' 참조). 하나를 오래 유지하며 재사용해야 하지, 요청마다 새로 만들면 안 됩니다
- `NewDefault()`는 `New(DefaultConfig())`와 동등합니다

### 설정 프리셋

매번 설정을 처음부터 쓸 필요 없이, HTTPC는 시작점이 될 다섯 가지 프리셋을 제공합니다:

| 프리셋 | 위치 | DefaultConfig 대비 핵심 차이 |
|------|------|------|
| `DefaultConfig()` | 범용 기본값 | 요청 타임아웃 180s, 재시도 3회, 응답 상한 10MB, 리다이렉트 따라가기 |
| `SecureConfig()` | 보안 우선 | 타임아웃 강화(요청 15s, 다이얼/TLS 5s), 응답 상한 5MB, 리다이렉트 따라가기 비활성화, 재시도 1회 |
| `PerformanceConfig()` | 높은 처리량 | 연결 풀 확대(유휴 100/호스트당 20), 응답 상한 50MB, 재시도 지연 500ms, Cookie 활성화 |
| `TestingConfig()` | 테스트 전용 | TLS 검증 건너뜀, 사설 IP 허용, URL/헤더 검증 끔(프로덕션 사용 금지, 테스트 환경 외 호출 시 경고 출력) |
| `MinimalConfig()` | 일회성 요청 | 재시도 없음, 리다이렉트 따라가지 않음, 응답 상한 1MB, 작은 연결 풀 |

사용자가 제공한 URL을 다루거나 보안에 민감한 시나리오에서는 `SecureConfig()`를, 고동시성 스크래핑이나 프록시 시나리오에서는 `PerformanceConfig()`를 선택하세요.

### 기본 설정 한눈에 보기

`DefaultConfig()`의 핵심 기본값입니다(전체 필드는 [설정 API](../api-reference/client-config/config) 참조):

| 설정 항목 | 기본값 | 설명 |
|--------|--------|------|
| `Timeouts.Request` | 180s | 전체 요청 타임아웃(모든 재시도 시도 포함) |
| `Timeouts.Dial` / `Timeouts.TLSHandshake` | 10s / 10s | TCP 연결 / TLS 핸드셰이크 타임아웃 |
| `Timeouts.IdleConn` | 90s | 유휴 연결 유지 시간 |
| `Connection.MaxIdleConns` / `MaxConnsPerHost` | 50 / 10 | 유휴 연결 풀 / 호스트당 연결 상한 |
| `Retry.MaxRetries` / `Delay` / `BackoffFactor` | 3 / 1s / 2.0 | 재시도 횟수, 초기 지연, 백오프 배수(기본적으로 지터 포함, 단회 지연 상한 30s) |
| `Security.MaxResponseBodySize` | 10MB | 응답 본문 크기 상한 |
| `Security.MaxDecompressedBodySize` | 100MB | 압축 해제 후 응답 본문 상한 |
| `Defaults.UserAgent` | `httpc/1.0` | 기본 User-Agent |
| `Defaults.FollowRedirects` / `MaxRedirects` | true / 10 | 리다이렉트 따라가기 정책 |

## 쿼리 매개변수와 요청 옵션

요청 옵션은 `With*` 함수로 표현되며, 자유롭게 조합해 순서대로 URL 뒤에 붙일 수 있습니다:

```go
client, _ := httpc.NewDefault()
defer client.Close()

// 쿼리 매개변수: 개별 설정, 또는 Map으로 일괄 설정
result, err := client.Get("https://api.github.com/search/repositories",
    httpc.WithQuery("q", "language:go"),
    httpc.WithQuery("sort", "stars"),
    httpc.WithQueryMap(map[string]any{
        "order": "desc",
        "page":  1,
    }),
)

// 단일 요청에서 클라이언트 기본값 덮어쓰기: 타임아웃과 재시도
result, err = client.Get("https://api.github.com/repos/golang/go",
    httpc.WithTimeout(10*time.Second),
    httpc.WithMaxRetries(1),
)
```

핵심 포인트:
- `WithQuery`의 값은 `string`, 숫자, 불리언 등 자주 쓰는 타입을 지원합니다. 값이 `nil`이면 해당 매개변수는 URL에 나타나지 않습니다
- `WithTimeout`은 0~30분 범위의 값을 받으며, 음수면 `ErrInvalidTimeout`을 반환합니다. 이 타임아웃은 `Timeouts.Request`를 덮어씁니다
- `WithMaxRetries`는 0~10 범위의 값으로 `Retry.MaxRetries`를 덮어씁니다
- 전체 옵션은 [요청 옵션 API](../api-reference/core/options)를, 요청/응답 세부 사항은 [요청과 응답](./request-response)을 참조하세요

## 도메인 클라이언트 생성

GitHub API의 모든 엔드포인트는 `https://api.github.com` 아래에 있으므로, 도메인 클라이언트를 사용하면 URL을 반복해서 쓰지 않아도 됩니다:

```go
client, err := httpc.NewDomainDefault("https://api.github.com")
if err != nil {
    log.Fatal(err)
}
defer client.Close()

if err := client.SetHeader("Authorization", "Bearer "+os.Getenv("GITHUB_TOKEN")); err != nil {
    log.Fatal(err)
}

// 요청 경로는 baseURL 기준 상대 경로
result, err := client.Get("/repos/golang/go",
    httpc.WithHeader("Accept", "application/vnd.github+json"),
)
if err != nil {
    log.Fatal(err)
}
```

핵심 포인트:
- `NewDomain`은 스코프가 지정된 클라이언트를 생성하며, 경로는 baseURL 기준입니다
- `SetHeader`는 영구 요청 헤더를 설정해 매 요청에 자동으로 포함됩니다
- `WithHeader`는 요청 옵션으로 전달되어 현재 요청에만 적용됩니다
- 도메인 클라이언트는 Cookie를 자동 관리합니다

## 데이터 전송 (Issue 생성)

```go
type CreateIssueRequest struct {
    Title string `json:"title"`
    Body  string `json:"body"`
}

newIssue := CreateIssueRequest{
    Title: "Bug report",
    Body:  "Found a bug in the API response",
}

result, err := client.Post("/repos/owner/repo/issues",
    httpc.WithJSON(newIssue),
)
if err != nil {
    log.Fatal(err)
}

if !result.IsSuccess() {
    log.Fatalf("생성 실패: %d %s", result.StatusCode(), result.Body())
}

var created struct {
    Number int    `json:"number"`
    URL    string `json:"html_url"`
}
result.Unmarshal(&created)
fmt.Printf("Issue #%d 생성됨: %s\n", created.Number, created.URL)
```

핵심 포인트:
- `WithJSON(data)`는 자동으로 직렬화하고 Content-Type을 설정합니다
- `result.IsSuccess()`는 2xx 상태 코드를 확인합니다

## 미들웨어 추가

클라이언트에 로깅과 요청 ID를 추가합니다:

```go
// 미들웨어 구성
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: func(format string, args ...any) {
        log.Printf("[HTTP] "+format, args...)
    }}),
    httpc.RecoveryMiddleware(),
    httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),
}

// 설정을 NewDomain에 전달해 미들웨어가 포함된 도메인 클라이언트 생성
client, err := httpc.NewDomain("https://api.github.com", cfg)
if err != nil {
    log.Fatal(err)
}
defer client.Close()

if err := client.SetHeader("Authorization", "Bearer "+os.Getenv("GITHUB_TOKEN")); err != nil {
    log.Fatal(err)
}

result, err := client.Get("/repos/golang/go",
    httpc.WithHeader("Accept", "application/vnd.github+json"),
)
if err != nil {
    log.Fatal(err)
}

var repo Repo
result.Unmarshal(&repo)
fmt.Printf("%s: ⭐ %d\n", repo.FullName, repo.Stars)
```

핵심 포인트:
- 미들웨어는 `MiddlewareConfig.Middlewares`에서 구성합니다
- `LoggingMiddleware`는 요청 로그를 기록합니다
- `RecoveryMiddleware`는 panic으로 인한 크래시를 막습니다
- `RequestIDMiddleware`는 매 요청에 고유 ID를 생성합니다

## 오류 처리와 재시도

```go
result, err := client.Get("/repos/golang/go")
if err != nil {
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        switch clientErr.Type {
        case httpc.ErrorTypeTimeout:
            log.Println("요청 시간 초과, 잠시 후 재시도")
        case httpc.ErrorTypeNetwork:
            log.Println("네트워크 오류")
        case httpc.ErrorTypeTLS:
            log.Println("TLS 오류")
        default:
            log.Printf("HTTP 오류: %s", clientErr.Error())
        }

        if clientErr.IsRetryable() {
            log.Println("이 오류는 자동 재시도 가능")
        }
    }
    return
}

// HTTP 상태 코드 처리
switch {
case result.IsSuccess():
    // 2xx 성공
case result.StatusCode() == 401:
    log.Println("Token 만료 또는 무효")
case result.IsClientError():
    log.Printf("클라이언트 오류: %d", result.StatusCode())
case result.IsServerError():
    log.Printf("서버 오류: %d (총 %d회 시도, 첫 요청 포함)",
        result.StatusCode(), result.Meta.Attempts)
}
```

재시도 정책 구성:

```go
cfg := httpc.DefaultConfig()
cfg.Retry.MaxRetries = 5
cfg.Retry.Delay = 2 * time.Second
cfg.Retry.BackoffFactor = 2.0
cfg.Retry.EnableJitter = true
```

핵심 포인트:
- HTTPC는 네트워크 오류와 HTTP 상태 코드를 분리해서 처리합니다
- `ClientError`는 오류 분류와 재시도 가능 여부 판단을 제공합니다
- 기본적으로 408, 429, 500, 502, 503, 504를 자동 재시도합니다
- `Timeouts.Request`는 전체 재시도의 총 예산이지, 단일 시도의 타임아웃이 아닙니다

## 파일 다운로드 (릴리스 패키지 다운로드)

```go
dlCfg := httpc.DefaultDownloadConfig()
dlCfg.FilePath = "go1.22.0.linux-amd64.tar.gz"
dlCfg.Overwrite = true
dlCfg.ProgressCallback = func(downloaded, total int64, speed float64) {
    pct := float64(downloaded) / float64(total) * 100
    fmt.Printf("\r다운로드 진행률: %.1f%% (%.2f MB/s)", pct, float64(speed)/1024/1024)
}

result, err := client.Download(
    context.Background(),
    "https://go.dev/dl/go1.22.0.linux-amd64.tar.gz",
    dlCfg,
)
if err != nil {
    log.Fatal(err)
}

fmt.Printf("\n다운로드 완료: %s (%d bytes)\n",
    result.FilePath,
    result.BytesWritten,
)
```

## 동시 요청

여러 저장소 정보를 동시에 가져옵니다:

```go
func fetchRepos(ctx context.Context, repos []string) error {
    client, err := httpc.New(httpc.PerformanceConfig())
    if err != nil {
        return err
    }
    defer client.Close()

    results := make([]*httpc.Result, len(repos))
    errs := make([]error, len(repos))

    var wg sync.WaitGroup
    for i, name := range repos {
        wg.Add(1)
        go func(idx int, repo string) {
            defer wg.Done()
            r, err := client.Request(ctx, "GET", fmt.Sprintf("https://api.github.com/repos/%s", repo))
            results[idx] = r
            errs[idx] = err
        }(i, name)
    }
    wg.Wait()

    for i, err := range errs {
        if err != nil {
            return err
        }

        var repo Repo
        results[i].Unmarshal(&repo)
        fmt.Printf("%s: ⭐ %d\n", repo.FullName, repo.Stars)
    }
    return nil
}
```

:::tip
`PerformanceConfig()`는 큰 연결 풀 설정을 제공해 고동시성 시나리오에 적합합니다. Result는 요청마다 새로 만들어지며 GC가 자동 회수합니다.
:::

## 완전한 예제

지금까지의 예제를 하나로 묶은 완전한 코드입니다:

```go
package main

import (
    "errors"
    "fmt"
    "log"
    "os"
    "time"

    "github.com/cybergodev/httpc"
)

type Repo struct {
    FullName    string `json:"full_name"`
    Description string `json:"description"`
    Stars       int    `json:"stargazers_count"`
    Language    string `json:"language"`
}

func main() {
    token := os.Getenv("GITHUB_TOKEN")

    cfg := httpc.DefaultConfig()
    cfg.Retry.MaxRetries = 3
    cfg.Retry.Delay = 1 * time.Second
    cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
        httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: func(format string, args ...any) {
            log.Printf("[HTTP] "+format, args...)
        }}),
        httpc.RecoveryMiddleware(),
    }

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // 저장소 정보 가져오기
    result, err := client.Get("https://api.github.com/repos/golang/go",
        httpc.WithHeader("Authorization", "Bearer "+token),
    )
    if err != nil {
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) && clientErr.IsRetryable() {
            log.Fatal("요청 실패 (재시도함):", err)
        }
        log.Fatal(err)
    }

    if result.IsSuccess() {
        var repo Repo
        result.Unmarshal(&repo)
        fmt.Printf("✅ %s\n", repo.FullName)
        fmt.Printf("   ⭐ %d | 언어: %s\n", repo.Stars, repo.Language)
        fmt.Printf("   %s\n", repo.Description)
        fmt.Printf("   소요 시간: %s (총 %d회 시도, 첫 요청 포함)\n",
            result.Meta.Duration, result.Meta.Attempts)
    }
}
```

## 다음 단계

- [요청과 응답](./request-response) — 완전한 요청 옵션 참조
- [미들웨어 체인](./middleware-chain) — 커스텀 미들웨어 개발
- [재시도와 내결함성](./retry-fault-tolerance) — 고급 재시도 정책
- [도메인 클라이언트와 세션](./domain-session) — 세션 상태 관리
- [성능 최적화](./performance) — 프로덕션 환경 튜닝
- [설정 API](../api-reference/client-config/config) — 전체 설정 필드와 프리셋
- [프로덕션 체크리스트](../security/production-checklist) — 보안 모범 사례
