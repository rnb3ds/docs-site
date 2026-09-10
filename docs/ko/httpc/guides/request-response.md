---
sidebar_label: "요청과 응답"
title: "요청과 응답 - CyberGo HTTPC | 요청 옵션과 응답 처리"
description: "HTTPC 요청과 응답 완전 가이드: 패키지 함수와 클라이언트 메서드, WithJSON/WithForm/WithBody 요청 본문, WithQuery 쿼리 매개변수, Cookie와 인증 옵션, Result 파싱, 스트리밍 업로드, 자동 압축 해제와 크기 제한 설정을 다룹니다."
sidebar_position: 3
---

# 요청과 응답

## 요청 전송

### 패키지 함수

클라이언트를 생성할 필요 없이 직접 요청을 전송합니다:

```go
result, err := httpc.Get("https://api.example.com/data")
if err != nil {
    log.Fatal(err)
}

fmt.Println(result.StatusCode())
fmt.Println(result.Body())
```

지원하는 HTTP 메서드: `Get`, `Post`, `Put`, `Patch`, `Delete`, `Head`, `Options`.

패키지 함수는 지연 초기화되는 하나의 기본 클라이언트를 공유하며, `SetDefaultClient`로 교체하고 `CloseDefaultClient`로 해제할 수 있습니다(자세한 내용은 [실전 튜토리얼](./tutorial) 참조).

### 클라이언트 인스턴스

```go
client, err := httpc.NewDefault()
if err != nil {
    log.Fatal(err)
}
defer client.Close()

result, err := client.Get("https://api.example.com/data")
```

클라이언트 인스턴스는 동시 사용에 안전하며 하나를 오래 유지하며 재사용해야 합니다. `Close()` 이후에 요청하면 `ErrClientClosed`가 반환됩니다.

### 범용 요청 메서드

```go
ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()

result, err := httpc.Request(ctx, "GET", "https://api.example.com/data")
```

`Request`는 임의의 메서드 문자열을 받아 범용 프록시/게이트웨이류 로직을 구현하기에 적합합니다. 클라이언트 메서드 `client.Request`도 사용법이 같습니다.

## 요청 옵션

### 요청 헤더

```go
result, err := client.Get(url,
    httpc.WithHeader("Authorization", "Bearer token"),
    httpc.WithHeader("X-Custom", "value"),
    httpc.WithHeaderMap(map[string]string{
        "Accept":        "application/json",
        "X-Request-ID":  "123",
    }),
    httpc.WithUserAgent("my-app/1.0"),
)
```

모든 헤더 키와 값은 CRLF 인젝션 검증을 거치며, 제어 문자를 포함하거나 지나치게 긴 키/값은 `ErrInvalidHeader`를 반환합니다. 요청 헤더의 최종 적용 순서는 요청 본문 Content-Type → 클라이언트 기본 헤더(`Defaults.Headers`) → 옵션/미들웨어가 설정한 헤더이며, 나중 것이 같은 이름 항목을 덮어씁니다.

### 요청 본문

```go
// JSON
result, err := client.Post(url, httpc.WithJSON(map[string]any{
    "name": "test",
}))

// XML
result, err := client.Post(url, httpc.WithXML(data))

// 폼
result, err := client.Post(url, httpc.WithForm(map[string]string{
    "username": "admin",
    "password": "secret",
}))

// 바이너리 (기본 application/octet-stream)
result, err := client.Post(url, httpc.WithBinary(data))
// 타입 지정
result, err := client.Post(url, httpc.WithBinary(data, "image/png"))

// 자동 타입 감지
result, err := client.Post(url, httpc.WithBody(data))
// string → text/plain; charset=utf-8, []byte → application/octet-stream,
// map[string]string → application/x-www-form-urlencoded,
// *FormData → multipart/form-data, io.Reader → passed through,
// 기타 → application/json
// 명시적으로 지정 가능: httpc.WithBody(data, httpc.BodyJSON)
```

#### BodyKind 명시적 지정

`WithBody(data, kind)`는 자동 감지를 건너뛰고 지정한 타입으로 강제 인코딩합니다:

| BodyKind | Content-Type | 입력 요구 사항 |
|----------|--------------|----------|
| `BodyAuto`(기본값) | 입력 타입에 따라 자동 감지 | 아래 표 참조 |
| `BodyJSON` | `application/json` | JSON으로 직렬화 가능한 임의의 값 |
| `BodyXML` | `application/xml` | XML로 직렬화 가능한 임의의 값 |
| `BodyForm` | `application/x-www-form-urlencoded` | `map[string]string` 또는 `url.Values` |
| `BodyBinary` | `application/octet-stream` | `[]byte` 또는 (비어 있지 않은) `string` |
| `BodyMultipart` | `multipart/form-data` | `*FormData` |

`BodyAuto`의 감지 규칙:

| 입력 타입 | Content-Type |
|----------|--------------|
| `string` | `text/plain; charset=utf-8` |
| `[]byte` | `application/octet-stream` |
| `map[string]string` | `application/x-www-form-urlencoded` |
| `*FormData` | `multipart/form-data` (boundary 포함) |
| `io.Reader` | 설정하지 않음 (그대로 전달) |
| 기타 (struct/map 등) | `application/json` |

#### 폼과 multipart 업로드

```go
// url.Values 폼 (tag=go&tag=http처럼 동일 이름 필드를 여러 개 담을 수 있음)
values := url.Values{"tag": {"go", "http"}, "page": {"2"}}
result, err := client.Post(url, httpc.WithBody(values, httpc.BodyForm))

// multipart/form-data: 필드 + 파일
form := &httpc.FormData{
    Fields: map[string]string{
        "description": "avatar upload",
    },
    Files: map[string]*httpc.FileData{
        "avatar": {Filename: "avatar.png", Content: pngBytes},
    },
}
result, err = client.Post(url, httpc.WithFormData(form))

// 단일 파일 숏컷 (필드명, 파일명, 내용; 파일명은 경로 정규화 검증을 거침)
result, err = client.Post(url, httpc.WithFile("avatar", "avatar.png", pngBytes))
```

폼 필드는 개별적으로 제어 문자와 길이를 검증하며(값에는 탭 문자 허용), `WithForm`은 `WithBody(data, BodyForm)`과 동등하고 둘은 '먼저 검증하고 인코딩하는' 같은 경로를 공유합니다.

#### 스트리밍 요청 본문 (io.Reader)

```go
// io.Reader는 그대로 전달되며 Content-Type을 설정하지 않음 (필요 시 직접 WithHeader)
result, err := client.Post(url,
    httpc.WithBody(io.LimitReader(file, 10<<20)), // 최대 10MB로 제한
    httpc.WithHeader("Content-Type", "application/octet-stream"),
)
```

:::warning io.Reader는 크기 검증을 우회함
`io.Reader` 타입의 요청 본문은 **요청 본문 크기 검증을 거치지 않습니다**. 신뢰할 수 없는 출처를 읽을 때는 반드시 `io.LimitReader`로 감싸 메모리가 가득 차는 일을 막으세요.
:::

### 쿼리 매개변수

```go
result, err := client.Get(url,
    httpc.WithQuery("page", 1),
    httpc.WithQuery("limit", 10),
)

// 또는 Map 사용
result, err := client.Get(url,
    httpc.WithQueryMap(map[string]any{
        "page":  1,
        "limit": 10,
    }),
)
```

핵심 포인트:
- 값은 `string`, `bool`, `int`/`int64`, `uint` 계열, `float32`/`float64`, 그리고 `fmt.Stringer`를 구현한 타입을 지원합니다
- 값이 `nil`이면 해당 매개변수는 URL에 나타나지 않습니다 (리터럴 `<nil>`로 렌더링되지 않음)
- 키가 비어 있거나, 지나치게 길거나, 잘못된 문자를 포함하면 오류를 반환합니다. URL에 이미 있는 쿼리 문자열과 옵션 매개변수는 병합됩니다

### 인증

```go
// Bearer Token
result, err := client.Get(url, httpc.WithBearerToken("my-token"))

// Basic Auth
result, err := client.Get(url, httpc.WithBasicAuth("user", "pass"))
```

두 옵션 모두 형식 검증을 합니다. `WithBearerToken`은 token이 비어 있거나 잘못된 문자를 포함하면 오류를 반환하고, `WithBasicAuth`는 사용자명이 비어 있으면 안 되며 사용자명/비밀번호가 지나치게 길거나 잘못된 문자를 포함하면 오류를 반환합니다.

### Cookie

```go
result, err := client.Get(url,
    httpc.WithCookie(http.Cookie{Name: "session", Value: "abc"}),
    httpc.WithCookieMap(map[string]string{"session": "abc", "lang": "zh"}),
    httpc.WithCookieString("session=abc; lang=zh"),
)
```

일괄 설정은 `WithCookies`로 슬라이스를 한 번에 전달하는 편이 `WithCookie`를 여러 번 호출하는 것보다 효율적입니다(한 번의 사전 할당, 한 번의 검증 통과):

```go
result, err := client.Get(url, httpc.WithCookies([]http.Cookie{
    {Name: "session", Value: "abc"},
    {Name: "lang", Value: "zh"},
}))
```

Cookie에 보안 속성 검증이 필요하면 `WithSecureCookie`를 **반드시 모든 Cookie 옵션 뒤에** 두세요 — 적용 시점에 이미 존재하는 Cookie만 검증합니다:

```go
result, err := client.Get(url,
    httpc.WithCookie(http.Cookie{Name: "session", Value: "abc"}),
    httpc.WithSecureCookie(httpc.StrictCookieSecurityConfig()), // Secure/HttpOnly/SameSite=Strict 요구
)
```

### 요청 제어

```go
// 타임아웃
result, err := client.Get(url, httpc.WithTimeout(10*time.Second))

// 재시도
result, err := client.Get(url, httpc.WithMaxRetries(5))

// 리다이렉트
result, err := client.Get(url,
    httpc.WithFollowRedirects(false),    // 리다이렉트 금지
)

// 컨텍스트 (이 요청의 ctx를 바꾸는 것과 동일)
result, err := client.Get(url, httpc.WithContext(ctx))
```

:::tip WithMaxRedirects(0)는 비활성화가 아님
`WithMaxRedirects(0)`는 리다이렉트를 **비활성화하지 않습니다** — 엔진은 `0`을 '설정되지 않음'으로 간주하고 기본값 10으로 폴백합니다. 리다이렉트 따라가기를 완전히 끄려면 `WithFollowRedirects(false)`를 사용하세요. 리다이렉트의 전체 제어, 체인 추적, 도메인 허용 목록은 [리다이렉트](./redirects)를 참조하세요.
:::

### 콜백

```go
result, err := client.Get(url,
    httpc.WithOnRequest(func(req httpc.RequestMutator) error {
        log.Printf("요청 전송: %s %s", req.Method(), req.URL())
        return nil
    }),
    httpc.WithOnResponse(func(resp httpc.ResponseMutator) error {
        log.Printf("응답 수신: %d", resp.StatusCode())
        return nil
    }),
)
```

콜백이 오류를 반환하면 요청이 중단됩니다(`OnResponse`가 오류를 반환하면 요청 전체가 실패). 여러 콜백은 추가한 순서대로 연쇄 실행됩니다.

:::tip 콜백은 '시도' 단위로, 미들웨어는 '요청' 단위로 실행
`WithOnRequest`/`WithOnResponse`는 엔진 내부에서 트리거되어 **매 시도(재시도 포함)마다 실행**됩니다. 미들웨어 체인은 재시도 주기 전체를 감싸므로 논리적 요청 하나에 한 번만 실행됩니다. 시도 단위의 세밀함이 필요하면 콜백을, 요청 전체 단위가 필요하면 [미들웨어](./middleware-chain)를 사용하세요.
:::

## 응답 처리

```go
result, err := client.Get("https://api.example.com/users/1")
if err != nil {
    log.Fatal(err)
}

// 상태 확인
result.StatusCode()     // 200
result.IsSuccess()      // true (2xx)
result.IsRedirect()     // false (3xx)
result.IsClientError()  // false (4xx)
result.IsServerError()  // false (5xx)

// 응답 읽기
result.Body()           // 문자열
result.RawBody()        // []byte
result.Proto()          // "HTTP/1.1"

// JSON 파싱
var user User
if err := result.Unmarshal(&user); err != nil {
    log.Fatal(err)
}

// Cookie
cookie := result.GetCookie("session")
if cookie != nil {
    fmt.Println(cookie.Value)
}

// 요청 메타데이터
fmt.Println(result.Meta.Duration)       // 요청 소요 시간
fmt.Println(result.Meta.Attempts)       // 재시도 횟수
fmt.Println(result.Meta.RedirectCount)  // 리다이렉트 횟수
```

### Result 기능 한눈에 보기

`Result`는 세 부분으로 구성됩니다: `Request`(실제로 보낸 요청 정보), `Response`(응답 데이터), `Meta`(실행 메타데이터). nil 안전 접근자 메서드를 우선 사용하세요:

| 분류 | 메서드 / 필드 | 설명 |
|------|-------------|------|
| 상태 | `StatusCode()` / `Proto()` / `Response.Status` | 상태 코드, 프로토콜 버전(예: `HTTP/1.1`), 상태 텍스트 |
| 판별 | `IsSuccess()` / `IsRedirect()` / `IsClientError()` / `IsServerError()` | 2xx / 3xx / 4xx / 5xx |
| 내용 | `Body()` / `RawBody()` / `Response.ContentLength` | 문자열 본문 / 원시 바이트 / Content-Length |
| JSON | `Unmarshal(&v)` | 빈 본문이면 `ErrResponseBodyEmpty`, 50MB 초과면 `ErrResponseBodyTooLarge` 반환 |
| 응답 Cookie | `GetCookie(name)` / `HasCookie(name)` / `ResponseCookies()` | 이름으로 조회 / 존재 여부 / 응답 Cookie 전체 |
| 요청 Cookie | `GetRequestCookie(name)` / `HasRequestCookie(name)` / `RequestCookies()` | 실제 요청에 실려 나간 Cookie (리다이렉트 후 최종 값 포함) |
| 메타데이터 | `Meta.Duration` / `Attempts` / `RedirectChain` / `RedirectCount` / `ProxyURL` | 소요 시간, 시도 횟수(첫 요청 포함), 리다이렉트 체인, 이번에 사용한 프록시 |
| 파일 | `SaveToFile(path)` | 응답 본문을 파일로 기록 (경로 트래버설 / symlink 보안 검증 포함) |
| 디버그 | `String()` | 민감 정보 마스킹 요약, 민감 헤더 마스킹, 본문 200자에서 잘림 |

모든 접근자는 nil 안전입니다. `Result`나 내부 포인터가 nil이면 `StatusCode()`는 0, `Body()`는 빈 문자열, 판별 메서드는 false를 반환하며 panic이 일어나지 않습니다.

### 응답 헤더와 메타데이터

```go
// 응답 헤더는 표준 http.Header이며 대소문자를 구분하지 않음
contentType := result.Response.Headers.Get("Content-Type")
date := result.Response.Headers.Get("Date")

// 요청 측: 실제로 보낸 헤더와 Cookie (리다이렉트 후에는 최종 요청)
ua := result.Request.Headers.Get("User-Agent")
finalURL := result.Request.URL

// 프록시 풀 시나리오: 이번 요청이 실제로 사용한 프록시
if result.Meta.ProxyURL != "" {
    log.Printf("프록시 경유: %s", result.Meta.ProxyURL)
}

// 리다이렉트 체인: 차례로 거친 URL
for i, u := range result.Meta.RedirectChain {
    log.Printf("리다이렉트 %d: %s", i+1, u)
}
```

### 파일로 저장

작은 응답 본문은 바로 저장할 수 있습니다(대용량 파일은 전체가 메모리로 들어오지 않도록 [파일 다운로드 API](./file-transfer)를 사용하세요):

```go
if err := result.SaveToFile("user.json"); err != nil {
    log.Fatal(err) // 빈 응답 본문, 또는 경로가 보안 검증을 통과하지 못함 (경로 트래버설, symlink 등)
}
```

### 디버그 출력

`String()`은 로그에 넣기 좋은 한 줄 요약을 만듭니다. 민감 헤더(`Authorization`, `Cookie`, `Set-Cookie`, `X-Api-Key` 등)는 `***`로 표시되고 응답 본문은 200자에서 잘립니다:

```go
fmt.Println(result.String())
// 출력 예시: Result{Status: 200 200 OK, ContentLength: 5102, Duration: 150ms,
// Attempts: 1, Headers: 14 [Content-Length, Content-Type, ...], Body: {"id":...}
```

## 컨텍스트 제어

```go
// 타임아웃 제어
ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()
result, err := httpc.Request(ctx, "GET", url)

// 취소 제어
ctx, cancel := context.WithCancel(context.Background())
go func() {
    time.Sleep(5 * time.Second)
    cancel() // 5초 후 취소
}()
result, err := httpc.Request(ctx, "GET", url)
```

`WithTimeout`과 context 타임아웃의 관계: `WithTimeout`은 **전체 재시도의 총 예산**이며, 엔진은 이를 재시도 루프 전체의 바깥에 씌웁니다. context 취소는 전송 계층에서 즉시 효력을 발휘합니다.

## 스트리밍 요청

[스트리밍 응답](#스트리밍-응답)과 대칭적으로, 업로드 측도 스트리밍이 가능합니다. `WithBody`는 임의의 `io.Reader`를 직접 받아들여, 데이터를 생성하는 대로 전송하므로 요청 본문 전체를 미리 메모리에 읽어 들일 필요가 없습니다. 이 절에서는 그 의미와 함정을 깊이 다룹니다. 대용량 파일 업로드의 완전한 시나리오(청크, 체크섬)는 [파일 업로드와 다운로드](./file-transfer#스트리밍-업로드-대용량-파일)를 참조하세요.

### io.Reader 요청 본문

`WithBody(reader)`는 자동 감지의 `io.Reader` 분기로 처리됩니다. Reader는 그대로 전송 계층에 전달되며 **Content-Type을 설정하지 않습니다**(필요 시 직접 `WithHeader`). 엔진이 미리 읽거나 감싸지 않으며, 읽기 속도는 전적으로 HTTP 전송이 주도합니다.

:::warning Reader 요청 본문은 크기 검증을 하지 않음
`io.Reader`는 읽으면 소비되어 데이터 길이를 미리 알 수 없으므로, HTTPC는 이에 대해 **어떤 크기 검증도 하지 않습니다** — `Security.MaxRequestBodySize`는 메모리형 요청 본문(`string`, `[]byte`, `url.Values`, `*FormData`)에만 적용되고 `io.Reader`는 항상 통과시킵니다. 신뢰할 수 없는 출처를 읽을 때는 반드시 `io.LimitReader`로 감싸세요. 이것이 유일한 안전장치입니다. 원리는 [FAQ: io.Reader 요청 본문은 왜 크기를 검증하지 않나요](../faq/#io-reader-요청-본문은-왜-크기를-검증하지-않나요)를 참조하세요.
:::

### 재시도와 스트리밍의 트레이드오프

재시도는 요청 본문을 다시 전송할 수 있어야 하는데, `io.Reader`는 한 번 읽으면 비워집니다. 엔진의 실제 처리 방식:

| 재시도 구성 | 요청 본문 동작 |
|----------|------------|
| 활성화 (기본 `Retry.MaxRetries = 3`) | **첫 시도 이전에** Reader를 완전히 메모리로 읽어 `[]byte`로 변환하고, 재시도마다 Reader를 재생성해 재전송. 상한 100MB, 초과 시 오류 반환 (`retry not supported for streaming bodies exceeding 104857600 bytes`) |
| `WithMaxRetries(0)` | Reader가 전송 계층으로 직통, **제로 버퍼 진짜 스트리밍**. 대가는 이 요청이 재시도되지 않는다는 것 |

따라오는 두 가지 차이:

- **Content-Length**: 버퍼 경로는 `[]byte`로 변환된 뒤 길이를 알 수 있어 요청이 Content-Length를 담습니다. 직통 경로는 길이를 알 수 없어 HTTP/1.1에서 chunked 전송 인코딩이 자동으로 사용됩니다.
- **메모리 사용량**: 기본 재시도 구성에서는 첫 시도가 성공하더라도 요청 본문이 이미 온전히 메모리에 들어간 뒤입니다 — 이때의 '스트리밍'은 수동으로 `[]byte`를 조립하지 않아도 될 뿐 제로 카피가 아닙니다. 진짜로 생성하는 대로 보내려면 반드시 `WithMaxRetries(0)`를 사용해야 합니다.

### WithStreamBody는 요청 본문과 무관

`WithStreamBody(true)`라는 이름은 요청 본문 스트리밍 스위치처럼 보이지만, 실제로는 **응답 측** 메커니즘입니다. 응답 본문의 메모리 버퍼링을 건너뛰며, 파일 다운로드 API가 내부적으로 사용합니다. 요청 본문의 처리 방식에 영향을 주지 않고 위의 재시도 버퍼링 동작도 바꾸지 않습니다 — 요청 본문이 스트리밍인지는 '`io.Reader`를 전달했는지'와 '재시도가 활성화되었는지'만으로 결정됩니다. 자세한 내용은 아래 [스트리밍 응답](#스트리밍-응답)을 참조하세요.

### io.Pipe 제로카피 업로드

`io.Pipe`는 '데이터 생성'과 '데이터 전송'을 하나의 파이프에 연결합니다. 생산자 goroutine이 생성하는 대로 쓰고, HTTP 전송 계층이 동시에 소비하며, 전체 경로에 중간 버퍼가 없습니다. 전형적인 시나리오 — 압축 스트림을 그대로 업로드하고 `.gz` 중간 파일을 만들지 않기:

```go
package main

import (
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"time"

	"github.com/cybergodev/httpc"
)

func main() {
	file, err := os.Open("data.json")
	if err != nil {
		log.Fatal(err)
	}
	defer file.Close()

	pr, pw := io.Pipe()
	gw := gzip.NewWriter(pw)

	// 생산자: 파일을 읽는 대로 압축해 파이프에 기록
	go func() {
		_, copyErr := io.Copy(gw, file)
		if closeErr := gw.Close(); closeErr != nil && copyErr == nil {
			copyErr = closeErr
		}
		pw.CloseWithError(copyErr) // copyErr가 nil이면 Close와 동등
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	// 소비자: HTTP 전송 계층이 파이프에서 직접 읽음
	result, err := httpc.Request(ctx, "POST", "https://api.example.com/upload",
		httpc.WithBody(pr),
		httpc.WithMaxRetries(0), // 진짜 스트리밍: 재시도 비활성화로 엔진이 요청 본문 전체를 버퍼링하지 않게 함
		httpc.WithHeader("Content-Type", "application/gzip"),
	)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println(result.StatusCode(), result.Meta.Attempts)
	// 출력: 200 1
}
```

핵심 포인트:

- 생산자의 모든 오류는 `pw.CloseWithError`로 소비자에게 전달해야 합니다. 그렇지 않으면 상대는 EOF만 보게 되고, 깨진 데이터가 온전한 업로드로 취급됩니다
- `io.Pipe`는 재생할 수 없어 `WithMaxRetries(0)`와 자연스럽게 잘 어울립니다. 재시도가 반드시 필요하면 버퍼링 방식으로 전환해야 합니다(예: 먼저 파일로 저장한 뒤 업로드)
- 서버는 `Content-Type: application/gzip`에 따라 압축 데이터를 청크 단위로 받으며, 수신 측이 스트리밍으로 압축 해제하면 됩니다. 양쪽 모두 완전한 버퍼링이 필요 없습니다

## 스트리밍 응답

`WithStreamBody(true)`는 내부 메커니즘으로, 파일 다운로드 시 전체 응답 본문이 메모리에 캐시되는 것을 피하기 위해 사용됩니다. 활성화하면 응답 본문이 `Result`로 읽히지 않습니다(`Body()`와 `RawBody()`가 빈 값을 반환).

:::warning
`WithStreamBody(true)`는 파일 다운로드 API가 내부적으로 사용합니다. 응답 내용을 스트리밍으로 가져와야 한다면 [파일 다운로드 API](./file-transfer)를 사용하세요.
:::

대용량 파일을 다운로드해야 한다면 다운로드 API를 사용하세요:

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/path/to/file"
result, err := client.Download(context.Background(), url, cfg)
```

## 응답 압축 해제

HTTPC는 gzip, deflate 콘텐츠 인코딩의 압축 해제를 자동으로 처리합니다. 전송 계층은 Go 표준 라이브러리의 투명한 압축 해제를 끄고 엔진이 직접 처리합니다. 요청에는 `Accept-Encoding: gzip, deflate`가 자동으로 포함되며(`WithHeader("Accept-Encoding", ...)`로 덮어쓸 수 있음), 지원하는 인코딩:

| Content-Encoding | 처리 방식 |
|------------------|----------|
| `gzip` / `deflate` | 자동 압축 해제 (객체 풀로 압축 해제기 재사용) |
| `br`(brotli) / `compress`(LZW) | 미지원, 오류 반환 |
| `identity` / 알 수 없는 인코딩 | 그대로 전달 |

보안 설정으로 압축 해제 후 크기를 제한해 압축 폭탄 공격을 방어할 수 있습니다:

```go
cfg := httpc.DefaultConfig()
cfg.Security.MaxResponseBodySize = 10 * 1024 * 1024      // 응답 본문 상한: 스트리밍 다운로드 시 강제; 비스트리밍 시 압축 해제 후 상한의 폴백
cfg.Security.MaxDecompressedBodySize = 100 * 1024 * 1024  // 압축 해제 후 최대 100MB
```

| 설정 항목 | 기본값 | 설명 |
|--------|--------|------|
| `MaxResponseBodySize` | 10MB | 스트리밍 다운로드 응답 본문 상한; 비스트리밍 시 압축 해제 후 상한의 폴백 |
| `MaxDecompressedBodySize` | 100MB | 압축 해제 후 응답 본문 크기 상한 (미설정 시 `MaxResponseBodySize`로 폴백) |

압축된 응답 본문의 바이트 수에는 별도의 100MB 하드 캡(`maxCompressedSize`, 설정 불가)이 있으며, 압축 폭탄 방어용으로 `MaxResponseBodySize`와 독립적으로 작동합니다.

한도를 초과하면 `"exceeds limit"` 정보가 포함된 오류가 반환되며, `ClientError` 타입으로 확인할 수 있습니다. `ErrResponseBodyTooLarge`는 `Result.Unmarshal()`이 50MB JSON 크기 제한을 초과하는 응답 본문을 파싱할 때 반환됩니다(`MaxResponseBodySize`와 별개).

## 포맷 유틸리티

다운로드 진행률이나 로그 크기를 표시할 때는 패키지 수준 포맷 함수(1024 진법)를 사용할 수 있습니다:

```go
fmt.Println(httpc.FormatBytes(1536))        // 출력: 1.50 KB
fmt.Println(httpc.FormatBytes(1048576))     // 출력: 1.00 MB
fmt.Println(httpc.FormatSpeed(1048576))     // 출력: 1.00 MB/s
```

## 다음 단계

- [리다이렉트](./redirects) — 따라가기 제어, 체인 추적, 도메인 허용 목록
- [파일 업로드와 다운로드](./file-transfer) — 대용량 파일 스트리밍 업로드, 다운로드, 체크섬
- [도메인 클라이언트와 세션](./domain-session) — 세션 관리
- [요청 옵션 API](../api-reference/core/options) — 전체 옵션 참조
- [Result API](../api-reference/core/result) — 응답 처리 참조
