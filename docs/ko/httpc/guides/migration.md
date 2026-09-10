---
title: "net/http에서 마이그레이션 - CyberGo HTTPC | API 대응표와 전환 가이드"
description: "HTTPC로 net/http에서 마이그레이션하는 가이드: http.Get과 http.Client의 API 대응표, ClientError 오류 모델 차이, 5단계 타임아웃 체계, 기본 재시도와 SSRF 방어 같은 마이그레이션 함정 체크리스트와 단계별 전환 절차를 다룹니다."
sidebar_label: "net/http에서 마이그레이션"
sidebar_position: 2
---

# net/http에서 마이그레이션

이미 `net/http`에 익숙한가요? 이 가이드는 기존 표준 라이브러리 경험을 항목별로 HTTPC에 매핑합니다: 어떤 코드가 기계적 치환으로 끝나는지, 어떤 의미가 달라지는지, 어떤 기본 동작을 다시 검토해야 하는지. 모든 동작 설명은 소스 코드를 기준으로 합니다.

## 호환성 개요: net/http 위에 구축

HTTPC는 `net/http`의 대체품이 아니라 그 전송 계층 위에 얹힌 강화 계층입니다. 내부 엔진은 여전히 `http.Client`와 `http.Transport`입니다 — 연결 재사용, HTTP/2 협상, TLS 세션, 프록시 터널이 모두 표준 라이브러리에 의해 실행되며, HTTPC는 외곽에 보안 검증, 재시도 엔진, 미들웨어 체인, `Result` 변환을 더합니다(자세한 배경은 [자주 묻는 질문 "HTTPC와 net/http는 무슨 관계인가요?"](../faq/#httpc와-net-http는-무슨-관계인가요) 참조).

**마이그레이션 후에도 그대로 유지되는 부분:**

- **전송 계층 동작** — 연결 풀 재사용, HTTP/2 협상, TLS 세션 복원은 표준 라이브러리와 동일하며, 마이그레이션 때문에 성능 특성이 나빠지지 않습니다.
- **타입 직접 재사용** — `http.Cookie`, `tls.Config`, `context.Context`, `io.Reader`, `http.Header`를 그대로 사용하며 어댑터 계층이 필요 없습니다.
- **멘탈 모델** — 패키지 함수는 `http.Get`에, Client 인스턴스는 `http.Client`에 대응하고 context 전달 방식도 같습니다(2계층 API 아키텍처는 [핵심 개념](../getting-started/concepts) 참조).

**마이그레이션 후 추가로 얻는 부분:**

- 강제 TLS 1.2+, SSRF 방어, CRLF 주입 검증, 응답 본문 크기 방어선(기본적으로 안전);
- 지수 백오프 지능형 재시도(`Retry-After` 존중, 재시도 전체에 걸쳐 공유되는 타임아웃 예산);
- 양파 모델 미들웨어 체인(로깅/메트릭/감사/요청 ID);
- 원스톱 `Result` 래퍼 — 응답 본문 수명 주기 자동 관리, `Close()` 불필요.

같은 요청의 마이그레이션 전후 비교:

```go
package main

import (
    "fmt"
    "io"
    "net/http"
)

func main() {
    resp, err := http.Get("https://httpbin.org/get")
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close() // 반드시 수동으로 닫아야 함, 그렇지 않으면 연결 누수

    body, err := io.ReadAll(resp.Body)
    if err != nil {
        panic(err)
    }

    fmt.Println(resp.StatusCode) // 200
    fmt.Println(len(body))       // 응답 바이트 수
}
```

```go
package main

import (
    "fmt"

    "github.com/cybergodev/httpc"
)

func main() {
    result, err := httpc.Get("https://httpbin.org/get")
    if err != nil {
        panic(err) // 네트워크 계층 오류만
    }

    fmt.Println(result.StatusCode())  // 200
    fmt.Println(len(result.RawBody())) // 응답 바이트 수 (이미 메모리에 읽힘, 닫기 불필요)
}
```

마이그레이션 후 코드는 더 짧아지고, TLS 정책·SSRF 방어·최대 3회의 지능형 재시도가 기본으로 따라옵니다.

## API 대응표

### 클라이언트와 요청

| net/http 작성법 | HTTPC 대응 | 차이 포인트 |
|---------------|------------|----------|
| `http.Get(url)` | `httpc.Get(url)` | 둘 다 패키지 함수 + 공유 기본 인스턴스 (지연 초기화) |
| `http.Post(url, ct, body)` | `httpc.Post(url, httpc.WithJSON(data))` | 요청 본문은 `With*` 옵션으로 선언, Content-Type 자동 설정 |
| `http.PostForm(url, values)` | `httpc.Post(url, httpc.WithForm(m))` | `WithForm`은 `map[string]string`을 받음; `url.Values`는 `WithBody(values, httpc.BodyForm)` |
| `http.Head(url)` | `httpc.Head(url)` | 일대일 대응; `Put/Patch/Delete/Options`도 동일 |
| `client := &http.Client{...}` | `httpc.New(cfg)` / `httpc.NewDefault()` | `Client` 인터페이스 반환; 연결 풀을 보유하므로 `Close()`로 해제 필요 |
| `http.DefaultClient` | 패키지 함수 내부의 기본 클라이언트 | 지연 싱글턴; `SetDefaultClient`로 교체, `CloseDefaultClient`로 해제 후 자동 재생성 |
| `http.NewRequest` + `client.Do(req)` | `client.Get(url, opts...)` 등 동사 메서드 | `*http.Request`를 만들 필요 없음; 메서드와 URL을 직접 전달 |
| `http.NewRequestWithContext` + `Do` | `client.Request(ctx, method, url, opts...)` | 범용 형태, 임의의 메서드 문자열 |
| `req.Header.Set(k, v)` | `httpc.WithHeader(k, v)` / `WithHeaderMap(m)` | 헤더 키·값은 CRLF 주입 검증을 거치며, 잘못된 값은 `ErrInvalidHeader` 반환 |
| `req.Header.Set("User-Agent", ua)` | `httpc.WithUserAgent(ua)` | 인스턴스 수준 기본값은 `cfg.Defaults.UserAgent` |
| `req.SetBasicAuth(u, p)` | `httpc.WithBasicAuth(u, p)` | 형식 검증 포함 |
| `req.AddCookie(&http.Cookie{...})` | `httpc.WithCookie(http.Cookie{...})` | 값 타입을 받음; 일괄 설정은 `WithCookies`/`WithCookieMap`/`WithCookieString` |
| `req.URL.Query()`로 쿼리 조립 | `httpc.WithQuery(k, v)` / `WithQueryMap(m)` | 값은 흔한 스칼라 타입과 `fmt.Stringer`를 지원하며, 자동 인코딩되어 URL에 병합 |
| `jar, _ := cookiejar.New(nil)`을 `client.Jar`에 연결 | `cfg.Connection.EnableCookies = true` | 또는 `DomainClient`로 Cookie와 공통 헤더 자동 유지([도메인 클라이언트와 세션](./domain-session) 참조) |
| `client.CheckRedirect = func(...)` | `cfg.Defaults.FollowRedirects` / `MaxRedirects` | 요청 수준은 `WithFollowRedirects(false)`; 리다이렉트 도메인 허용 목록은 `Security.RedirectWhitelist`([리다이렉트](./redirects) 참조) |
| 프록시: `Transport.Proxy` | `cfg.Connection.ProxyURL` / `ProxyPool` / `EnableSystemProxy` | 세 가지 방식이 우선순위에 따라 적용, 자세한 내용은 [프록시와 프록시 풀](./proxy) 참조 |

### 응답 처리

| net/http 작성법 | HTTPC 대응 | 차이 포인트 |
|---------------|------------|----------|
| `resp.StatusCode` | `result.StatusCode()` | nil 안전 접근자; 상태 판별은 `IsSuccess()` / `IsClientError()` / `IsServerError()` / `IsRedirect()` |
| `resp.Status` / `resp.Proto` | `result.Response.Status` / `result.Proto()` | 프로토콜 버전 예: `HTTP/1.1` |
| `resp.Header.Get(k)` | `result.Response.Headers.Get(k)` | 여전히 표준 `http.Header`, 대소문자 구분 없음 |
| `io.ReadAll(resp.Body)` | `result.Body()` / `result.RawBody()` | 응답 본문이 이미 메모리로 읽혀 복사되며, 압축 해제도 자동 완료 |
| `defer resp.Body.Close()` | 대응 없음 | 닫기 진입점을 **찾지 마세요** — 연결은 연결 풀이 관리하고 `Result`는 GC에 맡깁니다 |
| `json.NewDecoder(resp.Body).Decode(&v)` | `result.Unmarshal(&v)` | 빈 본문은 센티널 오류 `ErrResponseBodyEmpty` 반환 (`io.EOF`가 아님, 아래 참조) |
| `resp.Cookies()` | `result.ResponseCookies()` / `result.GetCookie(name)` | 실제로 전송된 Cookie를 확인하는 `GetRequestCookie`도 있음 |
| `resp.ContentLength` | `result.Response.ContentLength` | — |
| `resp.Request` (리다이렉트 후 최종 요청) | `result.Request` | `URL` / `Method` / `Headers` / `Cookies` 포함 |
| `io.Copy(f, resp.Body)`로 저장 | `result.SaveToFile(path)` | 대용량 파일은 `Download` 사용(스트리밍, 이어받기 — [파일 업로드와 다운로드](./file-transfer) 참조) |
| (대응 없음) | `result.Meta` | HTTPC 신규: `Duration` / `Attempts` / `RedirectChain` / `ProxyURL` |
| `resp.Trailer` | 대응 없음 | `Result`는 trailer를 노출하지 않음, trailer에 의존하는 시나리오는 미지원 |

## 오류 모델 차이

마이그레이션에서 **가장 함정이 많은 부분**입니다. 먼저 같은 부분부터: 두 라이브러리 모두 4xx/5xx를 `error`로 취급하지 않습니다 — `err`는 요청이 성공적으로 완료되지 못했음만 나타냅니다. 진짜 차이는 `err`의 형태, 응답 본문의 수명 주기, 재시도 동작입니다:

| 관점 | net/http | HTTPC |
|------|----------|-------|
| 오류 형태 | `*url.Error`로 래핑된 원본 전송 오류 | `*ClientError` 분류 오류 (12종 `ErrorType` 열거) |
| 분류 수단 | 타입 어설션(`net.Error`, `net.DNSError`, `x509.UnknownAuthorityError`…) 또는 문자열 매칭 | `errors.As`로 추출 후 `Code()` / `IsRetryable()` / `Attempts` 읽기; 센티널 오류는 `errors.Is` |
| `err != nil`일 때의 응답 | `resp`가 nil이 아닐 수 있음 (`CheckRedirect`가 오류를 반환할 때 마지막 응답 포함) | `result`는 항상 nil, 응답 널 검사 불필요 |
| 응답 본문 읽기 오류 | `io.ReadAll` / `Decode` 시점에 발생 (`io.EOF`, `unexpected EOF`) | 요청 단계에서 이미 읽기를 완료하며, 읽기 실패는 `ClientError`(`ErrorTypeResponseRead`)로 `err`에 담겨 반환 |
| 빈 응답 본문 + JSON 디코딩 | `Decode`가 `io.EOF` 반환 | `Unmarshal`이 `ErrResponseBodyEmpty` 반환 |
| 재시도 | 없음 — 오류가 그대로 호출자에게 전달 | 타임아웃/전송 오류와 408/429/500/502/503/504 자동 재시도; 네트워크 오류 소진 시 `error` 반환, 재시도 가능 상태 코드 소진 시 **마지막 응답** 반환 |
| 오류 메시지의 URL | 그대로 출력 (자격 증명 포함 가능) | 자동 마스킹 (자격 증명 `***:***`, 민감 매개변수 `[REDACTED]`) |

마이그레이션 전형적인 오류 처리:

```go
package main

import (
    "encoding/json"
    "errors"
    "fmt"
    "io"
    "net/http"
)

func main() {
    resp, err := http.Get("https://api.example.com/users/42")
    if err != nil {
        // *url.Error: 연결 실패, 타임아웃, TLS 오류가 모두 여기서 나오며,
        // 추가 분류는 타입 어설션이나 문자열 매칭에 의존
        panic(err)
    }
    defer resp.Body.Close()

    // 4xx/5xx는 error가 아님: 정상 경로로 흐르며 상태 코드를 수동 검사해야 함
    if resp.StatusCode != http.StatusOK {
        fmt.Println("HTTP 오류:", resp.StatusCode)
        return
    }

    var user map[string]any
    // 빈 응답 본문이면 Decode가 io.EOF 반환 — 자주 누락되는 분기
    if err := json.NewDecoder(resp.Body).Decode(&user); err != nil && !errors.Is(err, io.EOF) {
        panic(err)
    }
    fmt.Println(user["name"])
}
// 출력 (서버 응답에 따라 다름):
// HTTP 오류: 404
```

마이그레이션 후:

```go
package main

import (
    "errors"
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    result, err := httpc.Get("https://api.example.com/users/42")
    if err != nil {
        // 네트워크 계층 오류: ClientError(12종)로 분류되어 단축 코드와 재시도 가능 여부를 담아 반환
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) {
            log.Printf("오류 타입: %s, 재시도 가능: %v, 시도 횟수: %d",
                clientErr.Code(), clientErr.IsRetryable(), clientErr.Attempts)
        }
        panic(err)
    }

    // 4xx/5xx는 error가 아님: Result의 상태 판별 메서드로 검사
    if !result.IsSuccess() {
        fmt.Println("HTTP 오류:", result.StatusCode())
        return
    }

    var user map[string]any
    // 빈 응답 본문은 센티널 오류 ErrResponseBodyEmpty 반환, errors.Is로 정확히 판별
    if err := result.Unmarshal(&user); err != nil {
        if errors.Is(err, httpc.ErrResponseBodyEmpty) {
            fmt.Println("(빈 응답 본문)")
            return
        }
        panic(err)
    }
    fmt.Println(user["name"])
}
// 출력 (서버 응답에 따라 다름):
// HTTP 오류: 404
```

흔한 오류 분류 시나리오 대응(`clientErr`는 `errors.As`로 추출한 `*httpc.ClientError`):

| 판별하려는 상황 | net/http 작성법 | HTTPC 작성법 |
|--------------|---------------|------------|
| 타임아웃 | `var ne net.Error` + `ne.Timeout()` | `clientErr.Type == httpc.ErrorTypeTimeout` |
| DNS 실패 | `var de *net.DNSError` + `errors.As` | `httpc.ErrorTypeDNS` |
| 인증서 검증 실패 | `var ce x509.UnknownAuthorityError` + `errors.As` | `httpc.ErrorTypeCertificate` |
| TLS 프로토콜 오류 | 문자열 매칭 `"tls:"` | `httpc.ErrorTypeTLS` |
| 연결 거부/재설정 | `var oe *net.OpError` + `errors.As` | `httpc.ErrorTypeNetwork` |
| 컨텍스트 취소/마감 | `errors.Is(err, context.Canceled)` | `httpc.ErrorTypeContextCanceled` (절대 재시도하지 않음) |

오류 분류, 재시도 가능 여부, 센티널 오류의 전체 설명은 [오류 처리](./error-handling)와 [오류 타입](../api-reference/types/errors)을 참조하세요.

## 요청 본문, 헤더와 컨텍스트 마이그레이션

`net/http`의 「요청 구성 → 항목별 설정 → Do」 3단계는 HTTPC에서 「동사 메서드 + 선언적 옵션」으로 수렴합니다.

<!-- check-code: skip -->
```go
// net/http: 수동 직렬화, 수동 헤더 설정, 수동 쿼리 조립
payload, _ := json.Marshal(map[string]any{"name": "test"})
req, err := http.NewRequest("POST", "https://api.example.com/orders", bytes.NewReader(payload))
if err != nil {
    log.Fatal(err)
}
req.Header.Set("Content-Type", "application/json")
req.Header.Set("Authorization", "Bearer "+token)

q := req.URL.Query()
q.Set("page", "2")
req.URL.RawQuery = q.Encode()

resp, err := client.Do(req)
```

<!-- check-code: skip -->
```go
// HTTPC: 옵션이 곧 요청, Content-Type 자동 설정, 쿼리 매개변수 자동 인코딩
result, err := client.Post("https://api.example.com/orders",
    httpc.WithJSON(map[string]any{"name": "test"}),
    httpc.WithBearerToken(token),
    httpc.WithQuery("page", 2),
)
```

표준 라이브러리 조작과 요청 옵션의 대응:

| 표준 라이브러리 조작 | HTTPC 옵션 |
|------------|------------|
| `json.Marshal` + `bytes.NewReader` + Content-Type | `WithJSON(data)` (`WithBody(data, BodyJSON)`과 동등) |
| `xml.Marshal` | `WithXML(data)` |
| `url.Values` 폼 인코딩 | `WithForm(m)` / `WithBody(values, httpc.BodyForm)` |
| `multipart.Writer` 수동 바운더리 | `WithFile(field, name, content)` / `WithFormData(form)` |
| `bytes.NewReader(raw)` 원시 본문 | `WithBody(raw)` (타입 자동 감지) / `WithBinary(data, ct...)` |
| `req.Header.Set(k, v)` | `WithHeader(k, v)` / `WithHeaderMap(m)` |
| `req.SetBasicAuth` / 수동 Bearer 조립 | `WithBasicAuth(u, p)` / `WithBearerToken(t)` |
| `req.AddCookie` | `WithCookie(c)` / `WithCookies(cs)` / `WithCookieMap(m)` / `WithCookieString(s)` |
| `io.Reader` 스트리밍 요청 본문 | `WithBody(reader)` (그대로 전달; **크기 검증을 우회**하므로 `io.LimitReader`로 감싸기) |

컨텍스트 사용법은 표준 라이브러리와 같습니다 — `context.Context`는 여전히 타임아웃과 취소의 매개체이며, 전달 위치만 다릅니다:

<!-- check-code: skip -->
```go
// net/http: ctx를 요청 객체에 담아 전달
req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
resp, err := client.Do(req)
```

<!-- check-code: skip -->
```go
// HTTPC: ctx를 첫 번째 매개변수로 직접 전달
result, err := client.Request(ctx, "GET", url)

// 편의 메서드(Get/Post 등)는 ctx를 받지 않으므로 WithContext로 교체:
result, err = client.Get(url, httpc.WithContext(ctx))
```

전체 옵션 목록은 [요청과 응답](./request-response)과 [요청 옵션 API](../api-reference/core/options)를 참조하세요.

## 타임아웃 체계 대응

`http.Client.Timeout`은 전 과정을 덮는 단일 타임아웃입니다; HTTPC는 이를 5단계 독립 구성으로 분해하고 요청 수준 덮어쓰기를 제공합니다:

| net/http | HTTPC 필드 | 기본값 | 적용 범위 |
|----------|-----------|--------|--------|
| `http.Client.Timeout` | `Timeouts.Request` | 180s | 요청 총 타임아웃, **모든 재시도와 백오프 대기 포함** |
| `Transport.DialContext` (`net.Dialer{Timeout}`) | `Timeouts.Dial` | 10s | TCP 연결 수립 |
| `Transport.TLSHandshakeTimeout` | `Timeouts.TLSHandshake` | 10s | TLS 핸드셰이크 (HTTPS만) |
| `Transport.ResponseHeaderTimeout` | `Timeouts.ResponseHeader` | 0 (비활성화) | 응답 헤더 대기; 양수로 설정하면 전송 수준 하드 상한 |
| `Transport.IdleConnTimeout` | `Timeouts.IdleConn` | 90s | 유휴 연결 유지 시간 |
| (요청 수준 덮어쓰기 없음) | `WithTimeout(d)` | — | 요청 수준 총 예산 덮어쓰기; 상한 30분 |

<!-- check-code: skip -->
```go
// net/http: 단일 타임아웃이 전 과정 덮음 (재시도 없음)
client := &http.Client{Timeout: 30 * time.Second}
```

<!-- check-code: skip -->
```go
// HTTPC: 인스턴스 수준 총 예산 + 요청 수준 덮어쓰기
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 30 * time.Second // 재시도 포함 총 예산
client, _ := httpc.New(cfg)

result, err := client.Get(url, httpc.WithTimeout(30*time.Second)) // 이번 요청만 덮어쓰기
```

세 가지 의미 차이에 유의하세요:

- **총 예산은 재시도 간 공유** — `Timeouts.Request` / `WithTimeout`은 모든 재시도 시도와 백오프 대기를 덮으며, 시도마다 다시 계산되지 않습니다;
- **`ResponseHeader`는 특수** — 기본 0(비활성화)이며 총 예산이 전적으로 제어합니다; 양수로 설정하면 같은 client를 공유하는 **모든 요청**에 적용되고, 더 짧으면 `WithTimeout`을 덮어씁니다(slowloris 방어용 심층 방어, `SecureConfig()`에 이미 구성됨);
- **긴 응답 시나리오** — AI API 등 긴 대기가 필요한 인터페이스는 `WithTimeout`으로 예산을 넉넉히 주면 되며, 기본값에는 「응답 헤더 타임아웃이 느린 응답을 끊는」문제가 없습니다.

자세한 내용은 [요청과 응답](./request-response)의 타임아웃 부분과 [자주 묻는 질문 "타임아웃은 어떻게 선택하나요?"](../faq/#타임아웃은-어떻게-선택하나요)를 참조하세요.

## Transport 커스터마이징 마이그레이션

표준 라이브러리에서 자주 조정하는 `http.Transport` 필드는 HTTPC에서 모두 `Config`의 대응 하위 구조로 매핑됩니다:

| `http.Transport` / `http.Client` 필드 | HTTPC 구성 | 기본값 |
|----------------------------------------|-----------|--------|
| `MaxIdleConns` | `Connection.MaxIdleConns` | 50 |
| `MaxConnsPerHost` / `MaxIdleConnsPerHost` | `Connection.MaxConnsPerHost` | 10 |
| `Proxy: http.ProxyFromEnvironment` | `Connection.EnableSystemProxy` | false |
| 커스텀 `Proxy` 함수 | `Connection.ProxyURL` (단일 프록시) / `ProxyPool` (풀 회전) | 빈 값 |
| `TLSClientConfig` | `Security.TLSConfig` | nil |
| `ForceAttemptHTTP2` | `Connection.EnableHTTP2` | true |
| `ResponseHeaderTimeout` | `Timeouts.ResponseHeader` | 0 (비활성화) |
| `MaxResponseHeaderBytes` | `Connection.MaxResponseHeaderBytes` | 0 (표준 라이브러리 기본 10MB) |
| `CheckRedirect` | `Defaults.FollowRedirects` / `MaxRedirects` + `Security.RedirectWhitelist` | true / 10 |
| 커스텀 `DialContext` (다이얼러) | 직접적인 진입점 없음 | SSRF 검증이 다이얼 계층에 래핑됨 |

기존 `tls.Config` 지식(mTLS, 커스텀 CA, 암호 스위트)은 그대로 옮겨올 수 있습니다:

```go
package main

import (
    "crypto/tls"
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    // 기존 tls.Config (커스텀 CA, 암호 스위트, mTLS 클라이언트 인증서)를 그대로 마이그레이션
    tlsCfg := &tls.Config{
        MinVersion: tls.VersionTLS12,
        MaxVersion: tls.VersionTLS13,
    }

    cfg := httpc.DefaultConfig()
    cfg.Security.TLSConfig = tlsCfg
    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://httpbin.org/get")
    if err != nil {
        log.Fatal(err) // 네트워크 계층 오류
    }
    fmt.Println(result.StatusCode()) // 200
}
```

:::warning 주의
`Security.TLSConfig`를 설정하면 `MinTLSVersion` / `MaxTLSVersion` 필드는 무시됩니다 — TLS 버전 정책은 전달한 `tls.Config`가 기준입니다(직접 `MinVersion`을 설정하세요, TLS 1.2 미만으로 내리지 말 것).
:::

두 가지 경계를 알아두세요:

- **커스텀 Transport 주입 진입점 없음** — HTTPC가 직접 `*http.Transport`를 생성하고 관리합니다(SSRF 검증은 다이얼 함수에 래핑, 리다이렉트 정책은 `CheckRedirect`로 주입). `Config`는 Transport 전체를 노출하지 않습니다. 극단적인 다이얼 동작 커스터마이징이 필요하면 먼저 `Config.Connection` / `Config.Security`가 이미 커버하는지 확인하세요.
- **구현 전체를 교체할 때는 `Doer`** — 테스트 mock이나 대체 구현은 단일 메서드 인터페이스 `Doer`(`Request(ctx, method, url, opts...)`)만 구현하면 되며, 전체 `Client` 인터페이스를 대응할 필요가 없습니다. [테스트 가이드](./testing) 참조.

## 마이그레이션 함정 목록

`net/http`에서 마이그레이션할 때 다음 동작 차이가 가장 문제를 일으키기 쉽습니다:

**1. `resp.Body`는 수동으로 닫을 필요가 없고 닫을 수도 없습니다**

`Result`가 보유한 것은 이미 읽어 복사된 바이트이며, HTTPC가 내부적으로 읽기·배수·닫기를 완료하고 기저 연결은 연결 풀이 관리합니다. 마이그레이션 시 **모든 `defer resp.Body.Close()`를 삭제**하고, 닫기 진입점을 찾지도 마세요. 자세한 내용은 [자주 묻는 질문 "응답 Body는 수동으로 닫아야 하나요?"](../faq/#응답-body는-수동으로-닫아야-하나요)를 참조하세요.

**2. 재시도가 기본 활성화 — 멱등하지 않은 POST가 중복 제출될 수 있음**

`net/http`는 재시도하지 않지만, HTTPC는 기본적으로 타임아웃/전송 오류와 408/429/500/502/503/504를 최대 3회 자동 재시도하며 **요청 메서드를 구분하지 않습니다**. 주문, 결제류 인터페이스는 반드시 처리해야 합니다:

<!-- check-code: skip -->
```go
// 위험: 기본 최대 3회 재시도, POST도 재시도에 참여
result, err := client.Post("https://api.example.com/orders", httpc.WithJSON(order))

// 안전 (1): 멱등하지 않은 인터페이스는 요청 수준에서 재시도 비활성화
result, err = client.Post("https://api.example.com/orders",
    httpc.WithJSON(order),
    httpc.WithMaxRetries(0),
)

// 안전 (2): 서버 측 멱등 키로 중복 제거 (권장)
result, err = client.Post("https://api.example.com/orders",
    httpc.WithJSON(order),
    httpc.WithHeader("Idempotency-Key", orderID),
)
```

완화 전략은 [자주 묻는 질문 "재시도로 POST가 중복 제출되나요?"](../faq/#재시도로-post가-중복-제출되나요)를 참조하세요.

**3. SSRF 방어가 기본 활성화 — 내부망과 localhost가 차단됨**

`net/http`에서 옮겨온 뒤 `127.0.0.1`, `10.x`, `192.168.x` 등 사설/예약 주소에 접속하면 즉시 오류가 발생합니다(`net/http`에는 이 제한이 없음). 로컬 연동에는 영향 범위가 작은 것부터 선택하세요:

<!-- check-code: skip -->
```go
// 요청 수준 면제 (권장, 영향 범위 최소)
result, err := httpc.Get("http://localhost:8080/health",
    httpc.WithAllowPrivateIPs(true),
)

// 클라이언트 수준 정밀 CIDR 면제 (예: VPC / Tailscale)
cfg := httpc.DefaultConfig()
cfg.Security.SSRFExemptCIDRs = []string{"10.0.0.0/8"}
```

전체 정책은 [SSRF 방어](../security/ssrf)를 참조하세요.

**4. 기본 클라이언트는 지연 싱글턴 — 장기 서비스는 명시적 인스턴스 사용**

패키지 함수는 내부 관리되는 기본 클라이언트 하나를 공유합니다(닫힌 후 자동 재생성). 프로덕션 서비스는 구성과 수명 주기를 제어할 명시적 인스턴스를 생성해야 하며, `Close()` 이후 요청은 `ErrClientClosed`를 반환합니다:

<!-- check-code: skip -->
```go
// 장기 서비스: 명시적 인스턴스, 프로세스 내 공유, 사용 후 Close
client, err := httpc.NewDefault()
if err != nil {
    log.Fatal(err)
}
defer client.Close()

// 패키지 함수가 당신의 구성을 사용하게 하려면: 기본 클라이언트 교체 (이전 인스턴스 자동 종료)
custom, err := httpc.New(httpc.SecureConfig())
if err != nil {
    log.Fatal(err)
}
if err := httpc.SetDefaultClient(custom); err != nil {
    log.Fatal(err)
}
```

**5. 센티널 오류는 `errors.Is` / `errors.As`로, 문자열 매칭 금지**

`ErrClientClosed`, `ErrResponseBodyEmpty`, `ErrResponseBodyTooLarge`, `ErrInvalidHeader` 등 센티널 오류는 `errors.Is`로 판별하고, 분류 오류는 `errors.As`로 `*ClientError`를 추출합니다. 오류 체인은 근본 원인(`Cause`)까지 관통합니다.

**6. 응답 본문에 기본 상한 존재**

일반 요청의 응답 본문 상한은 기본 10MB, 압축 해제 후 상한 100MB입니다(메모리 고갈과 압축 폭탄 방어). 초과하면 오류가 발생합니다. `http.Get` + `io.Copy`로 대용량 파일을 받던 기존 코드는 `Download`(스트리밍 저장, 이어받기, 진행률 콜백)로 바꾸세요. 상한은 `Security.MaxResponseBodySize` / `MaxDecompressedBodySize`로 조정할 수 있습니다.

**7. 리다이렉트 동작은 예측 가능하지만 기본값이 있음**

기본적으로 리다이렉트를 따라갑니다(상한 10회). `WithMaxRedirects(0)` / `MaxRedirects = 0`은 「미설정」 센티널 값이지 비활성화가 아니라는 점에 주의 — 따라가기를 금지하려면 `WithFollowRedirects(false)` 또는 `Defaults.FollowRedirects = false`를 사용하세요. 자세한 내용은 [리다이렉트](./redirects) 참조.

## 단계별 마이그레이션 체크리스트

순서대로 실행하며, 각 단계는 독립적으로 검증할 수 있습니다:

1. **의존성 설치** — `go get github.com/cybergodev/httpc`, 클라이언트 호출부의 `"net/http"`를 `"github.com/cybergodev/httpc"`로 교체(`http.Cookie` 등 타입은 여전히 표준 라이브러리에서 임포트).
2. **요청 호출 기계적 치환** — `http.Get` → `httpc.Get`, `client.Do(req)` → `client.Get/Post/...`; `http.Client` 리터럴 → `httpc.New(cfg)`.
3. **리소스 관리 코드 삭제** — `defer resp.Body.Close()`, `io.ReadAll` 제거; `result.Body()` / `result.RawBody()` / `result.Unmarshal(&v)`로 전환.
4. **오류 처리 개조** — `err` 분기에 필요 시 `errors.As`로 `ClientError` 추출; 상태 코드 검사는 `result.IsSuccess()` 계열로; `io.EOF` 빈 본문 분기는 `errors.Is(err, httpc.ErrResponseBodyEmpty)`로.
5. **타임아웃 매핑** — `http.Client.Timeout` → `cfg.Timeouts.Request`; 요청별 차이는 `WithTimeout`; 기존 Transport 수준 타임아웃은 [타임아웃 체계 대응](#타임아웃-체계-대응)에 따라 배치.
6. **Transport 튜닝 마이그레이션** — 풀 크기, 프록시, TLS, HTTP/2를 위 표에 따라 `Config.Connection` / `Config.Security`에 배치; `tls.Config`는 `Security.TLSConfig`로.
7. **보안 기본값 처리** — 내부망/localhost 호출에 SSRF 면제 추가; 응답 본문 상한이 인터페이스 응답 규모를 만족하는지 확인.
8. **재시도 영향 점검** — 멱등하지 않은 POST에 멱등 키 또는 `WithMaxRetries(0)`; 재시도 예산과 비즈니스 타임아웃의 정합성 확인.
9. **수명 주기 마무리** — 장기 서비스는 명시적 인스턴스 + `defer client.Close()`; 요청 경로에서 클라이언트를 반복 생성하지 않는지 확인.
10. **회귀 검증** — 기존 통합 테스트 실행; 오류 경로(네트워크 단절/타임아웃/4xx/5xx)와 대용량 응답 본문 시나리오 중점 커버.

## 다음 단계

- **[실전 튜토리얼](./tutorial)** - 30분 만에 완전한 GitHub API 클라이언트 구축, 마이그레이션 후 전형적인 작성법 커버
- **[요청과 응답](./request-response)** - 완전한 요청 옵션과 `Result` 응답 처리
- **[핵심 개념](../getting-started/concepts)** - 2계층 API 아키텍처, 구성 체계와 요청 수명 주기
- **[자주 묻는 질문](../faq/)** - 재시도, 타임아웃, 프록시, Cookie 등 빈번한 문제의 소스 코드 수준 해답
