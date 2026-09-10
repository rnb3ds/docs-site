---
sidebar_label: "테스트 가이드"
title: "테스트 가이드 - CyberGo HTTPC | httptest와 단언"
description: "HTTPC 테스트 가이드: TestingConfig 테스트 전용 설정, net/http/httptest 모의 서버 통합, Doer 인터페이스 Mock 주입, 오류 응답·지연·리다이렉트 모의, 결정적 재시도와 다운로드 테스트, 테이블 기반 테스트와 Cookie 세션 단언 모범 사례."
sidebar_position: 13
---

# 테스트 가이드

## TestingConfig

`TestingConfig()`은 테스트 환경에 특화되어 보안 검사를 비활성화하고 연결/핸드셰이크 타임아웃을 단축합니다(Request 는 기본 180s 유지):

```go
func TestAPI(t *testing.T) {
    client, err := httpc.New(httpc.TestingConfig())
    if err != nil {
        t.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("http://localhost:8080/test")
    // ...
}
```

:::danger
`TestingConfig`은 TLS 검증, SSRF 방어 등 보안 기능을 비활성화하므로 **테스트 환경 전용**입니다. 테스트 환경이 아닌 곳에서 사용하면 보안 경고가 출력됩니다.
:::

`TestingConfig`의 핵심 값(`DefaultConfig`를 기준으로 덮어쓰기): `InsecureSkipVerify=true`, `AllowPrivateIPs=true`, `ValidateURL=false`, `ValidateHeaders=false`(127.0.0.1/내망 httptest 서버 허용); `EnableHTTP2=false`(프로토콜 동작이 더 단순하고 단언하기 쉬움); `MaxRetries=1`, `EnableJitter=false`(재시도 리듬이 결정적); 연결/핸드셰이크 타임아웃은 5s 로 단축, `Request`는 기본 180s 유지.

:::tip 보안 경고에 대해
경고는 `.test` 실행 파일과 `GO_TEST` 환경변수를 감지해 테스트 환경을 식별합니다 — `go test` 로 실행되는 테스트는 트리거되지 **않습니다**. 로컬 개발 스크립트 등 테스트가 아닌 프로세스에서 임시로 사용해야 한다면 `httpc.SetSecurityWarnOutput(io.Discard)`로 출력을 잠재울 수 있습니다(`io`는 표준 라이브러리 `io` 패키지).
:::

## httptest.Server 통합

표준 라이브러리 `net/http/httptest`로 모의 서버를 만들어, 실제 백엔드 없이 통합 테스트를 구현합니다:

<!-- check-code: skip -->
```go
package main

import (
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "testing"

    "github.com/cybergodev/httpc"
)

func TestGetUser(t *testing.T) {
    // 모의 서버 생성
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if r.URL.Path != "/users/1" {
            t.Errorf("unexpected path: %s", r.URL.Path)
        }
        if r.Header.Get("Authorization") != "Bearer test-token" {
            t.Errorf("missing auth header")
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
            "id":   1,
            "name": "Test User",
        })
    }))
    defer server.Close()

    // TestingConfig 으로 클라이언트 생성
    client, err := httpc.New(httpc.TestingConfig())
    if err != nil {
        t.Fatal(err)
    }
    defer client.Close()

    // 모의 서버로 요청 전송
    result, err := client.Get(server.URL+"/users/1",
        httpc.WithBearerToken("test-token"),
    )
    if err != nil {
        t.Fatal(err)
    }

    if !result.IsSuccess() {
        t.Fatalf("expected success, got %d", result.StatusCode())
    }

    var user struct {
        ID   int    `json:"id"`
        Name string `json:"name"`
    }
    if err := result.Unmarshal(&user); err != nil {
        t.Fatal(err)
    }

    if user.Name != "Test User" {
        t.Errorf("expected Test User, got %s", user.Name)
    }
}
```

## Mock 과 Transport 주입

커스텀 Transport 주입(하위 `http.RoundTripper` 교체)은 현재 HTTPC 의 **내부 메커니즘**입니다 — 엔진의 전송 계층 인터페이스와 mock 은 라이브러리 자체 테스트용이며, 루트 패키지 `httpc`는 주입 진입점을 익스포트하지 않습니다. 사용자에게 추천하는 경로는 두 가지입니다:

| 방식 | 적합한 계층 | 특징 |
|------|----------|------|
| `httptest.Server` | 통합 테스트 | **완전한** 요청 파이프라인 통과(보안 검증, 재시도, 미들웨어, 연결 풀), 실제 동작에 가장 근접 |
| `httpc.Doer` 최소 인터페이스 구현 | 단위 테스트 | 서버를 띄우지 않고 네트워크 요청도 보내지 않으며, 구성해 둔 `*Result`를 바로 반환 — 나노초 수준, 완전히 결정적 |

`Doer`는 `Request` 하나만 가진 인터페이스입니다; `Result`의 `Request`/`Response`/`Meta` 세 필드 자체가 호출자가 테스트에서 직접 구성하도록 익스포트된 것입니다:

```go
package main

import (
    "context"
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

// fakeDoer 는 httpc.Doer 구현: 네트워크 없이 미리 설정된 결과를 바로 반환
type fakeDoer struct {
    result *httpc.Result
    err    error
}

func (f *fakeDoer) Request(ctx context.Context, method, url string, options ...httpc.RequestOption) (*httpc.Result, error) {
    return f.result, f.err
}

// getUser 는 테스트 대상 비즈니스 함수 예시: 구체적 Client 가 아닌 httpc.Doer 에 의존
func getUser(d httpc.Doer, id int) (string, error) {
    result, err := d.Request(context.Background(), "GET", fmt.Sprintf("https://api.example.com/users/%d", id))
    if err != nil {
        return "", err
    }
    if !result.IsSuccess() {
        return "", fmt.Errorf("API error: %d", result.StatusCode())
    }
    var name struct {
        Name string `json:"name"`
    }
    if err := result.Unmarshal(&name); err != nil {
        return "", err
    }
    return name.Name, nil
}

func main() {
    fake := &fakeDoer{
        result: &httpc.Result{
            Response: &httpc.ResponseInfo{
                StatusCode: 200,
                Status:     "200 OK",
                Body:       `{"name":"Test User"}`,
                RawBody:    []byte(`{"name":"Test User"}`),
                Headers:    map[string][]string{"Content-Type": {"application/json"}},
            },
            Meta: &httpc.RequestMeta{Attempts: 1},
        },
    }

    name, err := getUser(fake, 1)
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(name) // 출력: Test User
}
```

:::tip Result 를 구성할 때 Body 와 RawBody 를 함께 채우기
`Body()`는 미리 저장된 문자열을, `RawBody()`는 바이트 슬라이스를 반환하며 `Unmarshal`은 원시 바이트를 사용합니다 — mock 에서 둘 다 채워야 각 접근자가 의도대로 동작합니다.
:::

## 다양한 시나리오 모의

### 오류 응답 모의

```go
server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusNotFound)
    json.NewEncoder(w).Encode(map[string]string{
        "error": "user not found",
    })
}))
defer server.Close()
```

### 지연 모의

```go
// TestingConfig 은 SSRF 방어를 끔 — 그렇지 않으면 기본 클라이언트가 127.0.0.1
// 테스트 서버를 차단하여 타임아웃 오류 대신 SSRF 오류가 발생함.
client, _ := httpc.New(httpc.TestingConfig())
defer client.Close()

server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    time.Sleep(5 * time.Second)
    w.WriteHeader(http.StatusOK)
}))
defer server.Close()

// 타임아웃 처리 테스트: 1s 컨텍스트 타임아웃 < 5s 서버 지연
ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
defer cancel()

_, err := client.Request(ctx, "GET", server.URL)
if err == nil {
    t.Fatal("expected timeout error")
}
```

### 리다이렉트 모의

```go
server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    switch r.URL.Path {
    case "/old":
        http.Redirect(w, r, "/new", http.StatusMovedPermanently)
    case "/new":
        w.WriteHeader(http.StatusOK)
        w.Write([]byte("redirected"))
    }
}))
defer server.Close()
```

### 파일 업로드 모의

```go
server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    if r.Method != "POST" {
        t.Errorf("expected POST, got %s", r.Method)
    }

    // multipart 폼 파싱
    r.ParseMultipartForm(10 << 20)
    file, header, err := r.FormFile("upload")
    if err != nil {
        t.Fatal(err)
    }
    defer file.Close()

    if header.Filename != "test.txt" {
        t.Errorf("expected test.txt, got %s", header.Filename)
    }

    w.WriteHeader(http.StatusOK)
}))
defer server.Close()
```

### TLS 서버 모의

`httptest.NewTLSServer`는 자체 서명 인증서를 사용합니다. `TestingConfig`는 이미 `InsecureSkipVerify=true`를 설정하므로 추가 TLS 구성 없이 바로 요청할 수 있습니다:

```go
server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusOK)
    w.Write([]byte("secure"))
}))
defer server.Close()

client, _ := httpc.New(httpc.TestingConfig())
defer client.Close()

result, err := client.Get(server.URL) // 자체 서명 TLS 서버로 바로 요청
```

### 결정적 재시도 테스트

서버가 **앞의 N번은 재시도 가능 상태 코드(408/429/500/502/503/504)를 반환하고 그다음 성공**하게 하면, 타이머나 실제 네트워크 지터에 의존하지 않고 재시도 동작을 검증할 수 있으며, 실제 시도 횟수는 `result.Meta.Attempts`로 단언합니다:

```go
func TestRetry(t *testing.T) {
    var calls int32

    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if atomic.AddInt32(&calls, 1) <= 2 {
            w.WriteHeader(http.StatusServiceUnavailable) // 앞의 두 번은 503(재시도 가능)
            return
        }
        w.WriteHeader(http.StatusOK) // 세 번째에 성공
    }))
    defer server.Close()

    client, err := httpc.New(httpc.TestingConfig())
    if err != nil {
        t.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get(server.URL, httpc.WithMaxRetries(2))
    if err != nil {
        t.Fatal(err)
    }

    if result.Meta.Attempts != 3 { // 최초 1회 + 재시도 2회
        t.Errorf("expected 3 attempts, got %d", result.Meta.Attempts)
    }
}
```

:::tip 테스트에서 재시도 매개변수를 명시적으로 고정
`TestingConfig`는 기본적으로 `MaxRetries=1`이고 지터가 없습니다; 테스트에서 `WithMaxRetries(N)`로 기대값을 명시적으로 주어야 단언이 안정적입니다.
:::

## 파일 다운로드 테스트

`Download`도 마찬가지로 httptest 로 커버할 수 있습니다: 서버가 알려진 내용을 쓰고, `DownloadConfig.FilePath`를 `t.TempDir()`로 지정하며(테스트 종료 시 자동 정리), 바이트 수와 체크섬을 단언합니다:

```go
func TestDownload(t *testing.T) {
    payload := []byte("file content for download test")

    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Length", strconv.Itoa(len(payload)))
        _, _ = w.Write(payload)
    }))
    defer server.Close()

    client, err := httpc.New(httpc.TestingConfig())
    if err != nil {
        t.Fatal(err)
    }
    defer client.Close()

    sum := sha256.Sum256(payload)

    cfg := httpc.DefaultDownloadConfig()
    cfg.FilePath = filepath.Join(t.TempDir(), "out.bin")
    cfg.Checksum = hex.EncodeToString(sum[:]) // 체크섬 경로도 함께 검증

    result, err := client.Download(context.Background(), server.URL, cfg)
    if err != nil {
        t.Fatal(err)
    }

    if result.BytesWritten != int64(len(payload)) {
        t.Errorf("expected %d bytes, got %d", len(payload), result.BytesWritten)
    }
    if result.ActualChecksum != cfg.Checksum {
        t.Errorf("checksum mismatch: %s != %s", result.ActualChecksum, cfg.Checksum)
    }
}
```

## Cookie 와 세션 단언

Cookie 동작은 양 끝에서 단언할 수 있습니다: **서버 측**에서 요청에 실제 도착한 Cookie 를 읽어(클라이언트가 실제로 보냈는지 검증) 확인하거나; **클라이언트 측**에서 `result.GetCookie`/`HasCookie`로 응답 Cookie 를 확인하거나, `DomainClient`에서 세션 자동 캡처를 검증합니다:

```go
func TestCookieSession(t *testing.T) {
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        switch r.URL.Path {
        case "/login":
            http.SetCookie(w, &http.Cookie{Name: "session", Value: "abc123", Path: "/"})
            w.WriteHeader(http.StatusOK)
        case "/me":
            // 서버 측 단언: 두 번째 요청에는 세션 Cookie 가 자동으로 붙어야 함
            if c, err := r.Cookie("session"); err != nil || c.Value != "abc123" {
                t.Errorf("expected session cookie abc123, got %v (err=%v)", c, err)
            }
            w.WriteHeader(http.StatusOK)
        }
    }))
    defer server.Close()

    dc, err := httpc.NewDomain(server.URL, httpc.TestingConfig()) // SSRF 사설망 차단 우회
    if err != nil {
        t.Fatal(err)
    }
    defer dc.Close()

    if _, err := dc.Get("/login"); err != nil { // 응답 Cookie 가 자동으로 세션에 진입
        t.Fatal(err)
    }
    if c := dc.GetCookie("session"); c == nil || c.Value != "abc123" {
        t.Errorf("session cookie not captured: %+v", c)
    }
    if _, err := dc.Get("/me"); err != nil { // 세션 Cookie 가 요청과 함께 전송
        t.Fatal(err)
    }
}
```

## 테이블 기반 테스트

```go
func TestHTTPMethods(t *testing.T) {
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        w.Write([]byte(r.Method))
    }))
    defer server.Close()

    client, err := httpc.New(httpc.TestingConfig())
    if err != nil {
        t.Fatal(err)
    }
    defer client.Close()

    tests := []struct {
        name   string
        method func(url string, opts ...httpc.RequestOption) (*httpc.Result, error)
    }{
        {"GET", client.Get},
        {"POST", client.Post},
        {"PUT", client.Put},
        {"PATCH", client.Patch},
        {"DELETE", client.Delete},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result, err := tt.method(server.URL + "/test")
            if err != nil {
                t.Fatal(err)
            }

            if result.Body() != tt.name {
                t.Errorf("expected %s, got %s", tt.name, result.Body())
            }
        })
    }
}
```

## 모범 사례

| 실천 사항 | 설명 |
|------|------|
| `httptest.Server` 사용 | 실제 HTTP 동작 모의, 네트워크 의존 없음, 완전한 요청 파이프라인 커버 |
| `TestingConfig()` 사용 | 보안 검사 비활성화, 로컬 연결이 SSRF 방어에 차단되지 않도록 함 |
| 비즈니스 계층이 `Doer` 인터페이스에 의존 | 최소 인터페이스 의존으로 단위 테스트에서 fake 대역 사용 가능, 서버 불필요 |
| 결정적 재시도 | 서버가 앞의 N번 503 을 반환한 뒤 성공, `Meta.Attempts`로 단언 |
| 다운로드 테스트에 `t.TempDir()` 사용 | 테스트 종료 시 파일 자동 정리, 경로도 자연스럽게 보안 검증 통과 |
| `defer` 사용 | 테스트 실패 시에도 리소스 해제 보장 |
| 테이블 기반 | 다양한 입력 커버, 코드 간결 |
| 재시도/타임아웃 매개변수 명시적 고정 | `WithMaxRetries(N)` 등으로 명시 선언해야 단언이 안정적 |

## 다음 단계

- [설정 API](../api-reference/client-config/config) - TestingConfig 상세 매개변수
- [오류 타입](../api-reference/types/errors) - 오류 단언 레퍼런스
- [미들웨어 체인](./middleware-chain) - 미들웨어 테스트 패턴
- [파일 업로드와 다운로드](./file-transfer) - 다운로드 동작 상세(이 페이지 「파일 다운로드 테스트」의 확장)
- [고급 예제](../examples/advanced-usage) - 프로덕션 수준 코드 패턴
