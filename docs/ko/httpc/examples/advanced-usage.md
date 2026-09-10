---
sidebar_label: "고급 예제"
title: "고급 예제 - CyberGo HTTPC | 프로덕션급 코드"
description: "HTTPC 고급 예제: 커스텀 RetryPolicy 재시도, 타임아웃과 재시도 조합, 요청/응답 콜백, 미들웨어 체인, REST 클라이언트 래핑, 도메인 클라이언트 설정, Cookie와 SessionManager 세션, worker pool 동시성 패턴, HMAC 서명 미들웨어."
sidebar_position: 2
---

# 고급 예제

## 커스텀 재시도 전략

502/503/504에만 재시도하고 고정 지연을 사용합니다:

:::warning 내부 타입
RetryPolicy.ShouldRetry의 `resp` 매개변수 타입 ResponseReader는 내부 인터페이스(`internal/types` 패키지에 정의)이므로 외부 패키지에서 직접 참조할 수 없습니다. 커스텀 `RetryPolicy`는 `httpc`와 같은 모듈 내의 패키지에서 구현해야 합니다. 대부분의 시나리오는 `RetryConfig` 설정으로 충분합니다. 다음 예제는 구현 패턴을 보여주며, 실제 코드는 `httpc` 모듈 내부에서 컴파일해야 합니다.
:::

```go
// 주의: ResponseReader는 내부 타입(internal/types 패키지)입니다.
// 이 코드는 github.com/cybergodev/httpc 모듈 내부에서만 컴파일됩니다.
// 대부분의 사용자는 RetryConfig와 WithMaxRetries로 재시도를 설정해야 합니다.

type selectiveRetry struct {
    maxAttempts int
    baseDelay   time.Duration
}

// 재시도 여부 판단
func (p *selectiveRetry) ShouldRetry(resp ResponseReader, err error, attempt int) bool {
    if attempt >= p.maxAttempts {
        return false
    }
    if err != nil {
        return true // 네트워크 오류 재시도
    }
    return resp.StatusCode() == 502 || resp.StatusCode() == 503 || resp.StatusCode() == 504
}

func (p *selectiveRetry) GetDelay(attempt int) time.Duration {
    return p.baseDelay * time.Duration(attempt+1)
}

func (p *selectiveRetry) MaxRetries() int {
    return p.maxAttempts
}

// 커스텀 전략 적용
cfg := httpc.DefaultConfig()
cfg.Retry.CustomPolicy = &selectiveRetry{maxAttempts: 5, baseDelay: time.Second}
```

외부 프로젝트의 대안 — `RetryConfig` 설정 사용:

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
    cfg.Retry.MaxRetries = 5
    cfg.Retry.Delay = 500 * time.Millisecond
    cfg.Retry.BackoffFactor = 1.5
    cfg.Retry.EnableJitter = true

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://api.example.com/unstable")
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println(result.StatusCode())
}
```

## 타임아웃과 재시도 조합

3계층 시간 제어가 각자 역할을 담당합니다: context는 전체 시도의 총 예산을, `WithTimeout`은 개별 시도를, `WithMaxRetries`는 시도 횟수를 관리합니다:

```go
package main

import (
    "context"
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // ctx 30s: 모든 재시도와 백오프 대기를 포함한 총 예산
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    result, err := client.Post("https://httpbin.org/post",
        httpc.WithJSON(map[string]string{"data": "important"}),
        httpc.WithContext(ctx),           // 총 예산
        httpc.WithTimeout(10*time.Second), // 개별 시도 상한
        httpc.WithMaxRetries(3),           // 최대 3회 재시도
    )
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println(result.StatusCode())            // 출력: 200
    fmt.Println("시도 횟수:", result.Meta.Attempts) // 출력: 시도 횟수: 1(실패 재시도 후 증가)
    fmt.Println("총 소요 시간:", result.Meta.Duration)
}
```

재시도를 비활성화해야 할 때(예: 멱등하지 않은 생성 작업)는 `WithMaxRetries(0)`로 명시적으로 선언합니다:

```go
result, err := client.Post("https://httpbin.org/post",
    httpc.WithJSON(map[string]string{"action": "create"}),
    httpc.WithMaxRetries(0), // 재시도 안 함: 중복 생성 방지
)
```

## 완전한 미들웨어 체인

```go
package main

import (
    "encoding/json"
    "log"
    "sync/atomic"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    // 요청 카운터
    var requestCount int64

    // 메트릭 수집
    metricsMiddleware := httpc.MetricsMiddleware(
        &httpc.MetricsConfig{OnMetrics: func(method, url string, statusCode int, duration time.Duration, err error) {
            atomic.AddInt64(&requestCount, 1)
            log.Printf("[METRICS] %s %s -> %d (%v)", method, url, statusCode, duration)
        }},
    )

    // 감사 로그(JSON 형식)
    auditCfg := httpc.DefaultAuditConfig()
    auditCfg.Format = "json"
    auditCfg.IncludeHeaders = true
    auditCfg.MaskHeaders = []string{"Authorization", "Cookie"}
    auditCfg.SanitizeError = true
    auditCfg.OnAudit = func(event httpc.AuditEvent) {
        data, _ := json.Marshal(event)
        log.Printf("[AUDIT] %s", data)
    }
    auditMiddleware := httpc.AuditMiddleware(auditCfg)

    cfg := httpc.DefaultConfig()
    cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
        httpc.RecoveryMiddleware(),                              // panic 복구
        httpc.TimeoutMiddleware(&httpc.TimeoutMiddlewareConfig{Duration: 30 * time.Second}), // 강제 타임아웃
        httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),                            // 요청 ID
        httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: func(format string, args ...any) {
            log.Printf("[HTTP] "+format, args...)
        }}),
        metricsMiddleware,
        auditMiddleware,
    }

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    _, err = client.Get("https://httpbin.org/get")
    if err != nil {
        log.Fatal(err)
    }

    log.Printf("총 요청 수: %d", atomic.LoadInt64(&requestCount))
}
```

## 요청/응답 콜백

완전한 미들웨어가 필요 없다면 `WithOnRequest` / `WithOnResponse` 두 개의 요청 수준 콜백만으로 가벼운 관측과 디버깅 요구를 충족할 수 있습니다 — 전송 전에는 수정 가능한 요청을, 완료 후에는 읽을 수 있는 응답을 받게 됩니다:

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
    defer client.Close()

    onRequest := func(req httpc.RequestMutator) error {
        fmt.Printf("[요청] %s %s(헤더 %d개 포함)\n",
            req.Method(), req.URL(), len(req.Headers()))
        return nil // nil이 아닌 error를 반환하면 요청이 중단됩니다
    }

    onResponse := func(resp httpc.ResponseMutator) error {
        fmt.Printf("[응답] %d %s, 소요 %v, 시도 %d회\n",
            resp.StatusCode(), resp.Status(), resp.Duration(), resp.Attempts())
        return nil
    }

    result, err := client.Get("https://httpbin.org/get",
        httpc.WithOnRequest(onRequest),
        httpc.WithOnResponse(onResponse),
        httpc.WithQuery("test", "callbacks"),
    )
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("상태 코드:", result.StatusCode()) // 출력: 상태 코드: 200
}
```

미들웨어와의 역할 분담: 콜백은 **단일 요청**용 편리한 훅입니다(로깅, 디버깅, 간단한 메트릭); 모든 요청에 걸쳐 조합 가능하고 요청을 중단할 수 있는 파이프라인 처리에는 [미들웨어 체인](../guides/middleware-chain)을 사용하세요.

## REST API 클라이언트 래핑

```go
package main

import (
    "context"
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

type APIClient struct {
    dc httpc.DomainClienter
}

type User struct {
    ID   int    `json:"id"`
    Name string `json:"name"`
}

func NewAPIClient(baseURL, token string) (*APIClient, error) {
    dc, err := httpc.NewDomainDefault(baseURL)
    if err != nil {
        return nil, err
    }
    if err := dc.SetHeader("Authorization", "Bearer "+token); err != nil {
        dc.Close()
        return nil, err
    }
    if err := dc.SetHeader("Accept", "application/json"); err != nil {
        dc.Close()
        return nil, err
    }

    return &APIClient{dc: dc}, nil
}

func (c *APIClient) GetUser(ctx context.Context, id int) (*User, error) {
    result, err := c.dc.Request(ctx, "GET", fmt.Sprintf("/users/%d", id))
    if err != nil {
        return nil, err
    }

    if !result.IsSuccess() {
        return nil, fmt.Errorf("API error: %d", result.StatusCode())
    }

    var user User
    if err := result.Unmarshal(&user); err != nil {
        return nil, err
    }
    return &user, nil
}

func (c *APIClient) CreateUser(ctx context.Context, name string) (*User, error) {
    result, err := c.dc.Request(ctx, "POST", "/users",
        httpc.WithJSON(map[string]string{"name": name}),
    )
    if err != nil {
        return nil, err
    }

    var user User
    if err := result.Unmarshal(&user); err != nil {
        return nil, err
    }
    return &user, nil
}

func (c *APIClient) Close() error {
    return c.dc.Close()
}

func main() {
    api, err := NewAPIClient("https://api.example.com", "my-token")
    if err != nil {
        log.Fatal(err)
    }
    defer api.Close()

    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    // 사용자 생성
    user, err := api.CreateUser(ctx, "Alice")
    if err != nil {
        log.Fatal(err)
    }
    fmt.Printf("생성: %+v\n", user)

    // 사용자 조회
    user, err = api.GetUser(ctx, user.ID)
    if err != nil {
        log.Fatal(err)
    }
    fmt.Printf("조회: %+v\n", user)
}
```

## 도메인 클라이언트(커스텀 설정)

`NewDomainDefault(baseURL)` 외에 `NewDomain(baseURL, cfg)`는 완전한 `Config`를 받습니다 — 프리셋, 타임아웃, 재시도, 프록시 모두 커스터마이즈할 수 있습니다. 도메인 클라이언트는 세션 헤더와 Cookie를 자동 관리하며, 개별 요청에서 세션 헤더를 일시적으로 재정의할 수도 있습니다:

```go
package main

import (
    "fmt"
    "log"
    "net/http"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    // 기본 설정을 바탕으로 필드별로 커스터마이즈
    cfg := httpc.DefaultConfig()
    cfg.Timeouts.Request = 15 * time.Second
    cfg.Retry.MaxRetries = 2
    cfg.Defaults.UserAgent = "domain-client-demo/1.0"

    dc, err := httpc.NewDomain("https://httpbin.org", cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer dc.Close()

    fmt.Println("Base URL:", dc.URL())  // 출력: Base URL: https://httpbin.org
    fmt.Println("Domain:", dc.Domain()) // 출력: Domain: httpbin.org

    // 세션 헤더: 해당 도메인의 모든 요청에 자동으로 포함
    if err := dc.SetHeaders(map[string]string{
        "X-API-Version": "v1",
        "X-Client-ID":   "client-123",
    }); err != nil {
        log.Fatal(err)
    }

    // 개별 요청에서 세션 헤더 재정의, 영구 세션에는 영향 없음
    resp, err := dc.Get("/get",
        httpc.WithHeader("X-API-Version", "v2"), // 이 요청에만 적용
    )
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("요청 상태:", resp.StatusCode())      // 출력: 요청 상태: 200
    fmt.Println("세션 헤더 수:", len(dc.GetHeaders())) // 출력: 세션 헤더 수: 2

    // 세션 Cookie 수동 주입; 응답 Cookie도 세션에 자동 병합됩니다
    if err := dc.SetCookies([]*http.Cookie{
        {Name: "session", Value: "abc123"},
    }); err != nil {
        log.Fatal(err)
    }

    resp2, err := dc.Get("/cookies") // 세션 Cookie가 요청과 함께 자동 전송
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("두 번째 요청:", resp2.StatusCode()) // 출력: 두 번째 요청: 200

    // Session()으로 내부 SessionManager 획득(다음 절에서 독립 사용법 시연)
    session := dc.Session()
    session.UpdateFromResult(resp2) // 이번 응답의 Cookie를 세션에 병합
    fmt.Println("세션 Cookie 수:", len(session.GetCookies()))
}
```

:::warning 상대 경로와 옵션 부작용
`path` 매개변수에 상대 경로(예: `/get`)를 쓰면 baseURL에 자동으로 연결됩니다; 전체 URL(scheme 포함)은 그대로 사용됩니다. 또한 도메인 클라이언트는 요청 옵션을 **두 번 실행**하므로(한 번은 세션 상태 캡처, 한 번은 실제 요청), 카운터나 nonce 같은 부작용이 있는 옵션은 전달하지 마세요.
:::

## Cookie 고급 활용

### Cookie를 보내는 다섯 가지 방법

```go
// 1. 개별 Cookie(완전한 http.Cookie 구조체, 속성 포함 가능)
result, err := client.Get("https://httpbin.org/cookies",
    httpc.WithCookie(http.Cookie{
        Name:     "auth_token",
        Value:    "xyz789",
        Path:     "/api",
        Expires:  time.Now().Add(24 * time.Hour),
        Secure:   true,
        HttpOnly: true,
    }),
)

// 2. 일괄 설정(권장, 한 번의 직렬화)
result, err = client.Get("https://httpbin.org/cookies",
    httpc.WithCookies([]http.Cookie{
        {Name: "session_id", Value: "abc123"},
        {Name: "user_pref", Value: "dark_mode"},
        {Name: "lang", Value: "en"},
    }),
)

// 3. Cookie 문자열(브라우저 DevTools에서 바로 복사)
result, err = client.Get("https://httpbin.org/cookies",
    httpc.WithCookieString("cookie1=value1; cookie2=value2"),
)

// 4. Cookie map
result, err = client.Get("https://httpbin.org/cookies",
    httpc.WithCookieMap(map[string]string{
        "theme": "dark",
        "lang":  "en",
    }),
)

// 5. 여러 방식 조합 사용
result, err = client.Get("https://httpbin.org/cookies",
    httpc.WithCookieString("session=abc123"),
    httpc.WithCookie(http.Cookie{Name: "manual", Value: "cookie"}),
)
```

### 응답 Cookie 읽기와 자동 관리

```go
result, _ := client.Get("https://httpbin.org/response-headers?Set-Cookie=session=abc123")

fmt.Println(len(result.Response.Cookies))       // 출력 예시: 1(응답에 포함된 Cookie 수)
if c := result.GetCookie("session"); c != nil { // 이름으로 정확히 조회
    fmt.Println(c.Value) // 출력: abc123
}
fmt.Println(result.HasCookie("nonexistent")) // 출력: false

// 요청 간 자동 관리: Cookie Jar를 켜면 응답 Cookie가 자동 저장되어 이후 요청에 다시 실려 갑니다
cfg := httpc.DefaultConfig()
cfg.Connection.EnableCookies = true
jarClient, _ := httpc.New(cfg)
defer jarClient.Close()

_, _ = jarClient.Get("https://httpbin.org/cookies/set?session=xyz789") // Cookie가 Jar에 저장
resp, _ := jarClient.Get("https://httpbin.org/cookies")                 // 자동으로 다시 실려 전송
fmt.Println(resp.StatusCode()) // 출력: 200
```

세션 수준 Cookie와 보안 검증(`WithSecureCookie` + `StrictCookieSecurityConfig`)은 [도메인 클라이언트와 세션](../guides/domain-session)에서 자세히 다룹니다.

## SessionManager 독립 세션

세션(영구 헤더 + Cookie)은 도메인 클라이언트에 종속되지 않고, 독립적으로 생성해 어떤 요청에나 개별적으로 주입할 수 있습니다. "같은 서비스에 여러 신원" 또는 "요청 옵션을 수동으로 구성"하는 시나리오에 적합합니다:

```go
package main

import (
    "fmt"
    "log"
    "net/http"

    "github.com/cybergodev/httpc"
)

func main() {
    session, err := httpc.NewSessionManagerDefault()
    if err != nil {
        log.Fatal(err)
    }

    // 영구 헤더: 이 세션을 사용하는 모든 요청에 적용
    if err := session.SetHeader("Authorization", "Bearer my-token"); err != nil {
        log.Fatal(err)
    }
    if err := session.SetHeaders(map[string]string{
        "X-API-Version": "v2",
        "X-Client-ID":   "session-demo",
    }); err != nil {
        log.Fatal(err)
    }

    // 영구 Cookie
    if err := session.SetCookies([]*http.Cookie{
        {Name: "session_id", Value: "abc123"},
        {Name: "preferences", Value: "theme_dark"},
    }); err != nil {
        log.Fatal(err)
    }

    fmt.Println("세션 헤더:", len(session.GetHeaders()))   // 출력: 세션 헤더: 3
    fmt.Println("세션 Cookie:", len(session.GetCookies())) // 출력: 세션 Cookie: 2

    if c := session.GetCookie("session_id"); c != nil {
        fmt.Printf("찾은 Cookie: %s = %s\n", c.Name, c.Value) // 출력: 찾은 Cookie: session_id = abc123
    }

    // 선택적 삭제와 전체 비우기
    session.DeleteHeader("X-API-Version")
    session.DeleteCookie("preferences")
    fmt.Println("삭제 후 헤더/Cookie:", len(session.GetHeaders()), "/", len(session.GetCookies()))
    // 출력: 삭제 후 헤더/Cookie: 2 / 1

    session.ClearHeaders()
    session.ClearCookies()
    fmt.Println("비운 후 헤더/Cookie:", len(session.GetHeaders()), "/", len(session.GetCookies()))
    // 출력: 비운 후 헤더/Cookie: 0 / 0
}
```

## 동시성 다운로드

```go
package main

import (
    "context"
    "fmt"
    "log"
    "sync"
    "sync/atomic"

    "github.com/cybergodev/httpc"
)

func main() {
    urls := map[string]string{
        "file1.zip": "https://example.com/files/file1.zip",
        "file2.zip": "https://example.com/files/file2.zip",
        "file3.zip": "https://example.com/files/file3.zip",
    }

    client, _ := httpc.NewDefault()
    defer client.Close()

    var successCount int64
    var totalBytes int64
    var wg sync.WaitGroup

    for filename, url := range urls {
        wg.Add(1)
        go func(name, u string) {
            defer wg.Done()

            cfg := httpc.DefaultDownloadConfig()
            cfg.FilePath = "/tmp/" + name
            cfg.Overwrite = true
            cfg.ProgressCallback = func(downloaded, total int64, speed float64) {
                fmt.Printf("\r%s: %.1f%% (%s/s)", name,
                    float64(downloaded)/float64(total)*100,
                    float64(speed)/1024/1024)
            }

            result, err := client.Download(context.Background(), u, cfg)
            if err != nil {
                log.Printf("%s 다운로드 실패: %v", name, err)
                return
            }

            atomic.AddInt64(&successCount, 1)
            atomic.AddInt64(&totalBytes, result.BytesWritten)
            fmt.Printf("\n%s 완료: %d\n", name, result.BytesWritten)
        }(filename, url)
    }

    wg.Wait()
    fmt.Printf("\n다운로드 완료: %d/%d, 총 %d\n",
        successCount, len(urls), totalBytes)
}
```

## 동시 요청: worker pool과 세마포어

대량의 URL을 일괄 요청할 때 worker pool은 동시성을 worker 수에 고정하고, 세마포어 방식은 작업의 동적 확장은 허용하되 동시 진행 상한만 제한합니다. 두 방식 모두 같은 `Client`를 공유합니다(HTTPC의 Client는 동시성 안전이며 연결 풀이 goroutine 간 재사용됩니다):

```go
package main

import (
    "fmt"
    "log"
    "net/http"
    "net/http/httptest"
    "sync"
    "sync/atomic"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    // 로컬 모의 서버: 요청마다 20ms 소요
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        time.Sleep(20 * time.Millisecond)
        w.WriteHeader(http.StatusOK)
    }))
    defer server.Close()

    cfg := httpc.DefaultConfig()
    cfg.Security.AllowPrivateIPs = true // 127.0.0.1 로컬 서버 허용
    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    const (
        numWorkers = 5
        numJobs    = 20
    )

    jobs := make(chan string, numJobs)
    results := make(chan int, numJobs)

    // 고정된 수의 worker가 작업을 소비: 동시성은 항상 numWorkers
    var wg sync.WaitGroup
    for w := 0; w < numWorkers; w++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for url := range jobs {
                resp, err := client.Get(url)
                if err != nil {
                    log.Printf("요청 실패: %v", err)
                    results <- 0
                    continue
                }
                results <- resp.StatusCode()
            }
        }()
    }

    start := time.Now()
    for i := 0; i < numJobs; i++ {
        jobs <- fmt.Sprintf("%s/api/item/%d", server.URL, i)
    }
    close(jobs)
    wg.Wait()
    close(results)

    var okCount int64
    for status := range results {
        if status >= 200 && status < 300 {
            okCount++
        }
    }
    fmt.Printf("worker pool: %d/%d 성공, 소요 %v(직렬 실행 시 약 %v)\n",
        okCount, numJobs, time.Since(start), numJobs*20*time.Millisecond)
    // 출력 예시: worker pool: 20/20 성공, 약 90ms 소요(직렬 실행 시 약 400ms)

    // 세마포어 방식: goroutine 수는 많아도 동시 진행 요청은 최대 maxInFlight개
    const maxInFlight = 3
    sem := make(chan struct{}, maxInFlight)
    var wg2 sync.WaitGroup
    var okCount2 int64
    start = time.Now()

    for i := 0; i < numJobs; i++ {
        wg2.Add(1)
        go func(id int) {
            defer wg2.Done()
            sem <- struct{}{}
            defer func() { <-sem }()

            resp, err := client.Get(fmt.Sprintf("%s/api/request/%d", server.URL, id))
            if err != nil {
                return
            }
            if resp.IsSuccess() {
                atomic.AddInt64(&okCount2, 1)
            }
        }(i)
    }
    wg2.Wait()
    fmt.Printf("세마포어: %d/%d 성공, 소요 %v\n", okCount2, numJobs, time.Since(start))
    // 출력 예시: 세마포어: 20/20 성공, 약 140ms 소요
}
```

:::tip 동시성과 연결 풀의 조합
worker 수/세마포어 상한을 `Connection.MaxConnsPerHost`를 장기간 크게 초과하지 마세요(HTTP/1.1 시나리오). 초과하면 요청이 전송 계층에서 대기하고 총 처리량이 더 늘지 않습니다; HTTP/2(기본 켜짐)에서는 같은 호스트가 연결을 공유해 멀티플렉싱하므로 영향이 더 작습니다. 자세한 내용은 [성능 최적화](../guides/performance)를 참조하세요.
:::

## 구조화된 오류 처리

`ClientError`는 분류(`Code()`/`Type`), 재시도 가능 여부(`IsRetryable()`), 요청 컨텍스트(URL/Method/Attempts/StatusCode)를 담고 있어, `errors.As`로 추출한 뒤 카테고리별로 서로 다른 처리 분기를 실행할 수 있습니다:

```go
package main

import (
    "context"
    "errors"
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // 1나노초 타임아웃: 데모를 위해 확실하게 타임아웃 오류를 유발
    _, err = client.Get("https://httpbin.org/get",
        httpc.WithTimeout(1*time.Nanosecond),
    )
    if err == nil {
        log.Fatal("expected timeout error")
    }

    // errors.Is: 센티널 오류 판별(context 오류는 Unwrap을 통해 그대로 전달)
    switch {
    case errors.Is(err, context.DeadlineExceeded):
        fmt.Println("요청 시간 초과, 타임아웃 완화 또는 네트워크 점검 고려")
    case errors.Is(err, context.Canceled):
        fmt.Println("요청이 취소됨")
    }

    // errors.As: 구조화된 오류 추출
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        fmt.Println("Code:", clientErr.Code())         // 출력: Code: TIMEOUT
        fmt.Println("Method:", clientErr.Method)        // 출력: Method: GET
        fmt.Println("Attempts:", clientErr.Attempts)    // 출력: Attempts: 1
        fmt.Println("Retryable:", clientErr.IsRetryable()) // 출력: Retryable: false

        switch clientErr.Code() {
        case "TIMEOUT":
            fmt.Println("→ 분기: 타임아웃, 예산 완화 후 재시도 가능")
        case "NETWORK_ERROR", "DNS_ERROR":
            fmt.Println("→ 분기: 네트워크/DNS 장애, 연결성 확인")
        case "TLS_ERROR", "CERTIFICATE":
            fmt.Println("→ 분기: 인증서 문제, CA와 시스템 시간 검증")
        case "RETRY_EXHAUSTED":
            fmt.Println("→ 분기: 재시도 소진, 폴백 로직 진입")
        }
    }
}
```

HTTP 상태 코드 오류(4xx/5xx 응답은 `HTTP_ERROR`로 분류)도 마찬가지로 `clientErr.StatusCode`를 담습니다; `Cause` 필드는 기저 오류를 보존해 `errors.Unwrap`으로 더 깊이 파고들 수 있습니다. 오류 분류 전체 표는 [오류 처리](../guides/error-handling)와 [오류 타입](../api-reference/types/errors)을 참조하세요.

## 응답 디스크 기록: SaveToFile과 Download

작은 응답 본문이 이미 메모리에 있을 때는 `SaveToFile` 한 줄로 디스크에 기록합니다; 대용량 파일은 `Download`로 스트리밍 디스크 기록하며 진행률/이어받기/체크섬을 지원합니다:

```go
package main

import (
    "context"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    client, err := httpc.NewDefault()
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    // 응답 본문이 이미 메모리에 있음: 바로 디스크에 기록(경로는 Download와 동일한 보안 검증을 거침)
    result, err := client.Get("https://httpbin.org/get")
    if err != nil {
        log.Fatal(err)
    }
    if err := result.SaveToFile("response.json"); err != nil {
        log.Fatal(err)
    }

    // 대용량 파일: Download 스트리밍 디스크 기록 + SHA-256 검증(불일치 시 파일 자동 삭제)
    cfg := httpc.DefaultDownloadConfig()
    cfg.FilePath = "large-file.bin"
    cfg.Overwrite = true
    cfg.Checksum = "릴리스 매니페스트 등 신뢰 가능한 경로에서 얻은 SHA-256 hex"

    if _, err := client.Download(
        context.Background(), // 취소/타임아웃이 필요 없을 때는 Background 전달, nil은 전달 금지
        "https://example.com/large-file.bin",
        cfg,
    ); err != nil {
        log.Fatal(err)
    }
    log.Println("디스크 기록 완료")
}
```

## 기본 클라이언트 관리

패키지 수준 함수(`httpc.Get` 등)의 배후에는 지연 초기화된 공유 기본 클라이언트 하나가 있습니다. `SetDefaultClient`로 커스텀 설정의 인스턴스로 교체(이전 인스턴스는 자동 종료)하여 전역 호출이 새 설정을 따르게 할 수 있습니다:

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    // 기본 설정에서 출발해 필요한 필드만 변경
    cfg := httpc.DefaultConfig()
    cfg.Timeouts.Request = 5 * time.Second
    cfg.Retry.MaxRetries = 0

    customClient, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }

    // 기본 클라이언트로 지정: 이후 패키지 수준 함수는 모두 새 설정 사용(이전 기본 클라이언트는 자동 종료)
    if err := httpc.SetDefaultClient(customClient); err != nil {
        log.Fatal(err)
    }

    result, err := httpc.Get("https://httpbin.org/get") // 5s 타임아웃, 0회 재시도 사용
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(result.StatusCode()) // 출력: 200

    // 마무리: 기본 클라이언트를 닫아 연결 풀 해제
    if err := httpc.CloseDefaultClient(); err != nil {
        log.Fatal(err)
    }
}
```

적합한 시나리오: 애플리케이션 시작 시 전역 동작을 일괄 커스터마이즈하거나 환경별(개발/프로덕션)로 설정을 전환할 때. `SetDefaultClient`는 `httpc.New`로 생성한 클라이언트만 받으며, 이미 닫힌 인스턴스는 전달할 수 없습니다.

## 커스텀 미들웨어: 요청 서명

```go
package main

import (
    "context"
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func SigningMiddleware(secret string) httpc.MiddlewareFunc {
    return func(next httpc.Handler) httpc.Handler {
        return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
            timestamp := time.Now().Unix()
            message := fmt.Sprintf("%s%s%d", req.Method(), req.URL(), timestamp)

            mac := hmac.New(sha256.New, []byte(secret))
            mac.Write([]byte(message))
            signature := hex.EncodeToString(mac.Sum(nil))

            req.SetHeader("X-Timestamp", fmt.Sprintf("%d", timestamp))
            req.SetHeader("X-Signature", signature)

            return next(ctx, req)
        }
    }
}

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
        httpc.RecoveryMiddleware(),
        SigningMiddleware("my-secret-key"),
    }

    client, _ := httpc.New(cfg)
    defer client.Close()

    result, err := client.Get("https://api.example.com/protected")
    if err != nil {
        log.Fatal(err)
    }
    log.Println(result.StatusCode())
}
```

## 다음 단계

- [미들웨어 체인](../guides/middleware-chain) - 미들웨어 아키텍처 상세
- [재시도와 내결함성](../guides/retry-fault-tolerance) - 커스텀 재시도 전략
- [도메인 클라이언트와 세션](../guides/domain-session) - 세션과 Cookie 심화
- [파일 업로드와 다운로드](../guides/file-transfer) - 다운로드 동작과 체크섬
- [성능 최적화](../guides/performance) - 동시성 모델과 성능 튜닝
- [테스트 가이드](../guides/testing) - httptest와 Doer Mock
