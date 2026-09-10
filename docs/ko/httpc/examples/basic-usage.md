---
sidebar_label: "기본 예제"
title: "기본 사용법 - CyberGo HTTPC | 실행 가능 예제"
description: "HTTPC 기본 사용법 예제: GET/POST/PUT/DELETE/HEAD/PATCH, XML과 바이너리 요청 본문, 쿼리 매개변수와 인증, 응답 상태 판별과 Result 삼중 구조, DefaultConfig 설정, 프록시, 미들웨어, 진행률 콜백 파일 다운로드 실행 코드."
sidebar_position: 1
---

# 기본 사용법

## GET 요청

### 기본 GET

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
    fmt.Println(result.Body())
}
```

### 쿼리 매개변수 포함

```go
result, err := httpc.Get("https://httpbin.org/get",
    httpc.WithQuery("name", "test"),
    httpc.WithQuery("page", 1),
    httpc.WithQueryMap(map[string]any{
        "limit": 10,
        "sort":  "desc",
    }),
)
```

### 인증 포함

```go
result, err := httpc.Get("https://api.example.com/me",
    httpc.WithBearerToken("my-token"),
)
```

Bearer 토큰 외에도 자주 쓰는 인증/헤더 방식이 세 가지 더 있습니다:

```go
// Basic 인증
result, err := httpc.Get("https://api.example.com/me",
    httpc.WithBasicAuth("username", "password"),
)

// API Key(커스텀 헤더 형식)
result, err := httpc.Get("https://api.example.com/me",
    httpc.WithHeader("X-API-Key", "your-api-key"),
)

// 헤더 일괄 설정 + 커스텀 User-Agent
result, err = httpc.Get("https://api.example.com/me",
    httpc.WithHeaderMap(map[string]string{
        "X-API-Version": "v1",
        "X-Client-ID":   "client-123",
    }),
    httpc.WithUserAgent("MyApp/1.0"),
)
```

## POST 요청

### JSON 요청 본문

```go
data := map[string]any{
    "name":  "John",
    "email": "john@example.com",
}

result, err := httpc.Post("https://httpbin.org/post",
    httpc.WithJSON(data),
)
if err != nil {
    log.Fatal(err)
}

// JSON 응답 파싱
var response map[string]any
if err := result.Unmarshal(&response); err != nil {
    log.Fatal(err)
}
fmt.Println(response)
```

### 폼 제출

```go
result, err := httpc.Post("https://httpbin.org/post",
    httpc.WithForm(map[string]string{
        "username": "admin",
        "password": "secret",
    }),
)
```

### 파일 업로드

```go
fileContent, _ := os.ReadFile("document.pdf")

result, err := httpc.Post("https://httpbin.org/post",
    httpc.WithFile("file", "document.pdf", fileContent),
)
```

### 다중 필드 폼

```go
form := &httpc.FormData{
    Fields: map[string]string{
        "title": "My Document",
        "type":  "pdf",
    },
    Files: map[string]*httpc.FileData{
        "file": {
            Filename: "report.pdf",
            Content:  fileContent,
        },
    },
}

result, err := httpc.Post("https://api.example.com/upload",
    httpc.WithFormData(form),
)
```

### XML 요청 본문

```go
type Person struct {
    XMLName xml.Name `xml:"person"`
    Name    string   `xml:"name"`
    Age     int      `xml:"age"`
}

result, err := httpc.Post("https://httpbin.org/post",
    httpc.WithXML(Person{Name: "Jane", Age: 28}),
)
if err != nil {
    log.Fatal(err)
}
fmt.Println(result.StatusCode()) // 200
```

### 일반 텍스트와 바이너리

문자열 요청 본문은 자동으로 `text/plain`으로 전송됩니다. 바이너리 데이터는 MIME 타입을 명시적으로 지정하는 것이 좋습니다:

```go
// 일반 텍스트: Content-Type이 자동으로 text/plain
result, err := httpc.Post("https://httpbin.org/post",
    httpc.WithBody("Hello, this is plain text!"),
)

// 바이너리: Content-Type은 선택 매개변수
pngHeader := []byte{0x89, 0x50, 0x4E, 0x47}
result, err = httpc.Post("https://httpbin.org/post",
    httpc.WithBinary(pngHeader, "image/png"),
)
```

### 요청 본문 타입 강제 지정(BodyKind)

`WithBody`는 기본적으로 입력 타입에서 인코딩을 추론하며, 두 번째 매개변수로 강제 지정할 수 있습니다:

```go
// map은 JSON으로 강제 인코딩됩니다(범용 포맷팅 분기를 거치지 않음)
result, err := httpc.Post("https://httpbin.org/post",
    httpc.WithBody(map[string]string{"key": "value"}, httpc.BodyJSON),
)
```

## 기타 HTTP 메서드

PUT, DELETE, HEAD, PATCH, OPTIONS와 범용 `Request`도 모두 사용할 수 있습니다. 다음은 전체 메서드를 다루는 완전한 예제입니다:

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

    // PUT: 리소스 전체 교체
    put, err := client.Put("https://httpbin.org/put",
        httpc.WithJSON(map[string]string{"name": "Jane", "status": "active"}),
        httpc.WithBearerToken("your-token"),
    )
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("PUT:", put.StatusCode()) // 출력: PUT: 200

    // DELETE: 리소스 삭제
    del, err := client.Delete("https://httpbin.org/delete",
        httpc.WithHeader("X-Request-ID", "delete-123"),
    )
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("DELETE:", del.StatusCode()) // 출력: DELETE: 200

    // HEAD: 응답 헤더만 가져옴(응답 본문 없음), 리소스 존재 여부와 크기 확인에 적합
    head, err := client.Head("https://httpbin.org/get")
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("HEAD:", head.StatusCode())                                 // 출력: HEAD: 200
    fmt.Println("Content-Type:", head.Response.Headers.Get("Content-Type")) // 출력: Content-Type: application/json

    // PATCH: 부분 업데이트(변경된 필드만 제출)
    patch, err := client.Patch("https://httpbin.org/patch",
        httpc.WithJSON(map[string]string{"status": "inactive"}),
    )
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("PATCH:", patch.StatusCode()) // 출력: PATCH: 200

    // OPTIONS: 서버가 허용하는 메서드 탐지(CORS 프리플라이트와 동일)
    opt, err := client.Options("https://httpbin.org/post")
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println("OPTIONS:", opt.StatusCode()) // 출력: OPTIONS: 200
}
```

메서드 빠른 참조:

| 메서드 | 요청 본문 포함 | 멱등성 | 일반적 용도 |
|------|:---:|:---:|----------|
| GET | 아니요 | 예 | 리소스 조회 |
| HEAD | 아니요 | 예 | 응답 헤더만 가져오기(존재 여부/크기/캐시 메타정보 확인) |
| POST | 예 | 아니요 | 리소스 생성, 데이터 제출 |
| PUT | 예 | 예 | 리소스 전체 교체 |
| PATCH | 예 | 아니요 | 부분 업데이트 |
| DELETE | 아니요 | 예 | 리소스 삭제 |
| OPTIONS | 아니요 | 예 | 허용 메서드 탐지 |

### 범용 Request 메서드

HTTP 메서드가 런타임에 비로소 결정되는 경우(구성, 요청 빌더, 프록시 전달에서) `Request(ctx, method, url, options...)`를 사용합니다:

```go
ctx := context.Background()

for _, m := range []struct{ method, url string }{
    {"GET", "https://httpbin.org/get"},
    {"POST", "https://httpbin.org/post"},
    {"PUT", "https://httpbin.org/put"},
} {
    resp, err := client.Request(ctx, m.method, m.url,
        httpc.WithJSON(map[string]string{"key": "value"}),
    )
    if err != nil {
        log.Printf("%s error: %v", m.method, err)
        continue
    }
    fmt.Printf("%s %s -> %d\n", m.method, m.url, resp.StatusCode())
}
```

## 응답 처리

각 요청이 반환하는 `*Result`는 "요청/응답/메타데이터" 삼중 구조이며, 세 개의 중첩 구조가 한 번의 할당으로 생성되어 같은 메모리를 공유합니다:

| 그룹 | 주요 필드 | 설명 |
|------|----------|------|
| `result.Request` | `URL` / `Method` / `Headers` / `Cookies` | 실제로 보낸 요청 정보 |
| `result.Response` | `StatusCode` / `Status` / `Proto` / `Headers` / `Body` / `RawBody` / `ContentLength` / `Cookies` | 응답 데이터 |
| `result.Meta` | `Duration` / `Attempts` / `RedirectCount` / `RedirectChain` / `ProxyURL` | 실행 메타데이터(재시도 횟수, 리다이렉트 체인 등) |

### 상태 판별

```go
result, err := client.Get("https://httpbin.org/get")
if err != nil {
    log.Fatal(err) // 네트워크 계층 오류(DNS, 타임아웃, 연결 실패 등)
}

switch {
case result.IsSuccess(): // 2xx
    fmt.Println("성공")
case result.IsRedirect(): // 3xx(리다이렉트를 따라가지 않을 때)
    fmt.Println("리다이렉트 위치:", result.Response.Headers.Get("Location"))
case result.IsClientError(): // 4xx
    fmt.Println("클라이언트 오류, 요청 매개변수/인증을 확인하세요")
    if result.StatusCode() == http.StatusTooManyRequests {
        fmt.Println("요청이 제한됨, 잠시 후 재시도:", result.Response.Headers.Get("Retry-After"))
    }
case result.IsServerError(): // 5xx
    fmt.Println("서버 오류, 재시도가 도움될 수 있습니다")
}
```

:::tip err과 상태 코드는 별개의 두 계층
네트워크 계층 실패(DNS, 타임아웃, TLS)는 `err != nil`로 나타납니다; HTTP 4xx/5xx는 `err`에 **포함되지 않습니다** — 응답은 정상적으로 반환되므로 `IsSuccess()` 등의 메서드로 직접 판별하세요. 두 계층을 나눠 처리하는 것이 가장 흔한 올바른 방식입니다.
:::

### Body / RawBody / String 선택 기준

| 메서드 | 반환값 | 용도 |
|------|------|------|
| `result.Body()` | `string`(사전 저장) | 텍스트를 바로 읽기; 추가 오버헤드 없음 |
| `result.RawBody()` | `[]byte`(원본) | 바이트 슬라이스가 필요한 API에 전달(해시, 이중 디코딩) |
| `result.String()` | 포맷된 요약 | 디버깅 출력(상태, 헤더, 본문 요약 포함); 오버헤드가 가장 크므로 핫 패스에 두지 마세요 |

```go
result, _ := client.Get("https://httpbin.org/get")

fmt.Println(len(result.Body()))     // 출력 예시: 268(본문 길이)
fmt.Println(len(result.RawBody()))  // 출력 예시: 268(같은 데이터의 바이트 뷰)
fmt.Println(result.Meta.Attempts)   // 출력: 1(재시도 후 증가)
fmt.Println(result.Meta.RedirectCount) // 출력: 0(리다이렉트를 따라간 적이 있으면 0보다 큼)
```

## 클라이언트 생성

### 커스텀 설정

```go
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 60 * time.Second
cfg.Retry.MaxRetries = 5
cfg.Retry.Delay = 2 * time.Second
cfg.Retry.BackoffFactor = 2.0
cfg.Retry.EnableJitter = true

client, err := httpc.New(cfg)
if err != nil {
    log.Fatal(err)
}
defer client.Close()
```

### 프록시 설정

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyURL = "http://proxy:8080"

client, _ := httpc.New(cfg)
```

## 미들웨어

### 로깅 + 복구

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.RecoveryMiddleware(),
    httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: log.Printf}),
}
cfg.Defaults.UserAgent = "my-app/1.0"

client, _ := httpc.New(cfg)
```

### 요청 ID + 메트릭

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),
    httpc.MetricsMiddleware(&httpc.MetricsConfig{OnMetrics: func(method, url string, statusCode int, duration time.Duration, err error) {
        metrics.Record(method, statusCode, duration)
    }}),
}

client, _ := httpc.New(cfg)
```

## 파일 다운로드

```go
client, _ := httpc.NewDefault()
defer client.Close()

cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/file.zip"
cfg.Overwrite = true
cfg.ProgressCallback = func(downloaded, total int64, speed float64) {
    pct := float64(downloaded) / float64(total) * 100
    fmt.Printf("\r다운로드 중: %.1f%% (%.2f MB/s)", pct, float64(speed)/1024/1024)
}

result, err := client.Download(context.Background(), "https://example.com/file.zip", cfg)
if err != nil {
    log.Fatal(err)
}

fmt.Printf("\n다운로드 완료: %d bytes, 소요 시간 %v, 평균 속도 %.2f MB/s\n",
    result.BytesWritten,
    result.Duration,
    float64(result.AverageSpeed)/1024/1024,
)
```

## 도메인 클라이언트

```go
dc, err := httpc.NewDomainDefault("https://api.example.com")
if err != nil {
    log.Fatal(err)
}
defer dc.Close()

// 세션 정보 설정
dc.SetHeader("Authorization", "Bearer "+token)
dc.SetHeader("Accept", "application/json")

// 요청에 세션 헤더와 Cookie가 자동으로 포함됩니다
users, _ := dc.Get("/users")
user, _ := dc.Get("/users/1")

fmt.Println(users.StatusCode()) // 200
```

## 다음 단계

- [고급 예제](./advanced-usage) - 커스텀 재시도, 미들웨어 체인, 동시성 다운로드
- [요청과 응답](../guides/request-response) - 요청 옵션 상세
- [도메인 클라이언트와 세션](../guides/domain-session) - 세션 관리
