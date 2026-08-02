---
sidebar_label: "요청과 응답 뮤테이터"
title: "요청과 응답 뮤테이터 - CyberGo HTTPC | Mutator 인터페이스"
description: "HTTPC 미들웨어 읽기/쓰기 계약 상세: RequestMutator와 ResponseMutator는 httpc가 미들웨어에 노출하는 두 개의 공개 합성 인터페이스로, 요청과 응답의 모든 읽기 메서드와 쓰기 메서드를 제공하며, 뮤테이터로 요청 헤더를 수정하고 응답 상태 코드를 읽는 컴파일 가능한 예제를 포함합니다."
sidebar_position: 2
---

# 요청과 응답 뮤테이터

미들웨어는 기저의 요청/응답 객체를 직접 다루지 않고 **뮤테이터(Mutator)** 인터페이스를 통해 읽고 씁니다. 미들웨어는 항상 완전한 읽기/쓰기 뮤테이터(`RequestMutator`/`ResponseMutator`)를 전달받으며, 아래의 읽기/쓰기 그룹화는 가독성을 위한 것일 뿐 별도로 내보낸 인터페이스는 아닙니다.

```text
RequestMutator  =  읽기 메서드  +  쓰기 메서드
ResponseMutator =  읽기 메서드  +  쓰기 메서드
        ↑                                    ↑
  미들웨어가 RequestMutator로 요청 수정  미들웨어가 ResponseMutator로 응답 읽기/수정
```

`Handler` 시그니처 `func(ctx, RequestMutator) (ResponseMutator, error)`가 정확히 이 두 뮤테이터를 미들웨어의 진입점과 출구로 사용합니다.

## 요청 뮤테이터

### 읽기 메서드

다음 메서드는 요청 데이터를 읽습니다. 미들웨어가 요청 속성을 **검사**만 할 때 호출합니다.

| 메서드 | 반환 타입 | 설명 |
|--------|-----------|------|
| `Method()` | `string` | HTTP 메서드 |
| `URL()` | `string` | 요청 URL |
| `Headers()` | `map[string]string` | 전체 요청 헤더(키→단일값) |
| `QueryParams()` | `map[string]any` | 쿼리 매개변수 |
| `Body()` | `any` | 요청 본문 |
| `Timeout()` | `time.Duration` | 요청 타임아웃 |
| `MaxRetries()` | `int` | 최대 재시도 횟수 |
| `Context()` | `context.Context` | 요청 컨텍스트 |
| `Cookies()` | `[]http.Cookie` | 요청 Cookie |
| `FollowRedirects()` | `*bool` | 리다이렉트 따를지 여부(nil이면 기본값 사용) |
| `MaxRedirects()` | `*int` | 최대 리다이렉트 횟수(nil이면 기본값 사용) |
| `StreamBody()` | `bool` | 요청 본문 스트리밍 여부 |

### 쓰기 메서드

다음 메서드는 요청 데이터를 수정합니다. 미들웨어가 요청 속성을 **수정**만 할 때 호출합니다.

| 메서드 | 설명 |
|--------|------|
| `SetMethod(string)` | HTTP 메서드 설정 |
| `SetURL(string)` | URL 설정 |
| `SetHeaders(map[string]string)` | 전체 요청 헤더 설정(전체 교체) |
| `SetHeader(key, value string)` | 단일 요청 헤더 설정(추가/수정) |
| `SetQueryParams(map[string]any)` | 쿼리 매개변수 설정 |
| `SetBody(any)` | 요청 본문 설정 |
| `SetTimeout(time.Duration)` | 타임아웃 설정 |
| `SetMaxRetries(int)` | 최대 재시도 횟수 설정 |
| `SetContext(context.Context)` | 컨텍스트 설정 |
| `SetCookies([]http.Cookie)` | Cookie 설정 |
| `SetFollowRedirects(*bool)` | 리다이렉트 따를지 여부 설정 |
| `SetMaxRedirects(*int)` | 최대 리다이렉트 횟수 설정 |
| `SetStreamBody(bool)` | 스트리밍 여부 설정 |

### RequestMutator

`RequestMutator`는 httpc가 노출하는 읽기/쓰기 겸용 요청 뮤테이터 인터페이스로, 위의 "읽기 메서드"와 "쓰기 메서드" 두 표의 모든 메서드를 포괄합니다. 내부의 읽기/쓰기 분할 인터페이스는 `internal/types` 패키지에 있으며 별도로 내보내지 않고, 외부에서는 `RequestMutator`로 통일되어 참조됩니다. 미들웨어가 요청 전송 전에 이를 통해 요청 속성을 검사하고 수정합니다.

## 미들웨어에서 RequestMutator의 전형적 조작

| 조작 시나리오 | 메서드 조합 | 설명 |
|---------------|-------------|------|
| 요청 헤더 수정 | `SetHeader(key, val)` / `Headers()` + `SetHeader` | 인증 헤더, 추적 ID, API 버전 주입 |
| 쿼리 매개변수 수정 | `QueryParams()` → 추가/삭제 → `SetQueryParams` | 공통 쿼리 매개변수 추가 |
| 요청 본문 수정 | `Body()` → 변환 → `SetBody` | 요청 본문 압축, 서명 주입 |
| 타임아웃 설정 | `SetTimeout(d)` | 요청 경로별 동적 타임아웃 조정 |
| 컨텍스트 설정 | `SetContext(ctx)` | 미들웨어 수준 타임아웃(`TimeoutMiddleware`의 작동 원리) |

```go
// 전형적: 기존 요청 헤더를 읽고 커스텀 헤더 추가 후 재기록
headers := req.Headers()
headers["X-Trace-ID"] = generateTraceID()
req.SetHeaders(headers)

// 동등한 작성법(더 간결)
req.SetHeader("X-Trace-ID", generateTraceID())
```

## 응답 뮤테이터

### 읽기 메서드

다음 메서드는 응답 데이터를 읽습니다.

| 메서드 | 반환 타입 | 설명 |
|--------|-----------|------|
| `StatusCode()` | `int` | 상태 코드 |
| `Status()` | `string` | 상태 텍스트(예: `"200 OK"`) |
| `Proto()` | `string` | 프로토콜 버전(예: `"HTTP/1.1"`) |
| `Headers()` | `http.Header` | 응답 헤더 |
| `Body()` | `string` | 응답 본문(문자열) |
| `RawBody()` | `[]byte` | 응답 본문(바이트) |
| `ContentLength()` | `int64` | 콘텐츠 길이 |
| `Duration()` | `time.Duration` | 요청 소요 시간 |
| `Attempts()` | `int` | 시도 횟수(재시도 포함) |
| `Cookies()` | `[]*http.Cookie` | 응답 Cookie |
| `RedirectChain()` | `[]string` | 리다이렉트 체인(각 홉의 URL) |
| `RedirectCount()` | `int` | 리다이렉트 횟수 |
| `RequestHeaders()` | `http.Header` | 실제 전송된 요청 헤더 |
| `RequestURL()` | `string` | 실제 요청 URL(리다이렉트 후 최종 URL 포함) |
| `RequestMethod()` | `string` | 요청 메서드 |

### 쓰기 메서드

다음 메서드는 응답 데이터를 수정합니다.

| 메서드 | 설명 |
|--------|------|
| `SetStatusCode(int)` | 상태 코드 설정 |
| `SetStatus(string)` | 상태 텍스트 설정 |
| `SetProto(string)` | 프로토콜 버전 설정 |
| `SetHeaders(http.Header)` | 응답 헤더 설정(전체 교체) |
| `SetBody(string)` | 응답 본문 설정 |
| `SetRawBody([]byte)` | 응답 본문(바이트) 설정 |
| `SetContentLength(int64)` | 콘텐츠 길이 설정 |
| `SetDuration(time.Duration)` | 소요 시간 설정 |
| `SetAttempts(int)` | 시도 횟수 설정 |
| `SetCookies([]*http.Cookie)` | Cookie 설정 |
| `SetRedirectChain([]string)` | 리다이렉트 체인 설정 |
| `SetRedirectCount(int)` | 리다이렉트 횟수 설정 |
| `SetRequestHeaders(http.Header)` | 요청 헤더 설정 |
| `SetRequestURL(string)` | 요청 URL 설정 |
| `SetRequestMethod(string)` | 요청 메서드 설정 |
| `SetHeader(key string, values ...string)` | 단일 응답 헤더 설정(추가/수정) |

### ResponseMutator

`ResponseMutator`는 httpc가 노출하는 읽기/쓰기 겸용 응답 뮤테이터 인터페이스로, 위의 "읽기 메서드"와 "쓰기 메서드" 두 표의 모든 메서드를 포괄합니다. 내부의 읽기/쓰기 분할 인터페이스는 `internal/types` 패키지에 있으며 별도로 내보내지 않고, 외부에서는 `ResponseMutator`로 통일되어 참조됩니다. 미들웨어가 요청 완료 후 이를 통해 응답을 읽거나 수정하며, 응답 캐싱, 콘텐츠 변환(예: JSON pretty-print), 인코딩/디코딩, 응답 필터링에 자주 사용됩니다.

## 미들웨어에서 ResponseMutator의 전형적 조작

| 조작 시나리오 | 메서드 조합 | 설명 |
|---------------|-------------|------|
| 상태 코드 읽기 | `StatusCode()` | 조건부 로깅, 오류 분류 |
| 응답 헤더 읽기 | `Headers()` | `X-Request-ID`, `Content-Type` 추출 |
| 메트릭 계산 | `Duration()` + `Attempts()` | 소요 시간, 재시도 횟수 보고 |
| 리다이렉트 추적 | `RedirectChain()` + `RedirectCount()` | 리다이렉트 경로 감사 |
| 응답 헤더 수정 | `SetHeader(key, vals...)` | 추적 헤더, 보안 헤더 추가 |

## 타입 단언: 엔진 특유 메서드 접근

미들웨어가 받은 `RequestMutator`는 런타임에 실제로는 `*engine.Request` 타입(엔진의 구체적 요청 구조체)입니다. `finalHandler`는 타입 단언을 통해 **인터페이스에 없는** 세 개의 엔진 특유 훅을 읽습니다. 커스텀 미들웨어가 이러한 훅에 접근하려면 동일하게 타입 단언이 필요합니다.

:::warning 인터페이스 경계
`OnRequest`/`OnResponse` 콜백과 `AllowPrivateIPs`는 `RequestMutator` 인터페이스에 없습니다 — 그 시그니처가 내부 패키지 `engine`의 타입(`*engine.Request`/`*engine.Response`)을 참조하므로, 공개 인터페이스에 노출하면 순환 임포트가 발생합니다. 따라서 `*engine.Request` 타입 단언으로만 접근할 수 있습니다.
:::

이러한 엔진 특유 메서드는 다음과 같습니다:

| 메서드(`*engine.Request`에만 존재) | 설명 |
|-------------------------------------|------|
| `OnRequest() func(*engine.Request) error` | 요청 전송 전 콜백 |
| `OnResponse() func(*engine.Response) error` | 응답 수신 후 콜백 |
| `AllowPrivateIPs() *bool` | 요청별 SSRF 덮어쓰기 |
| `SetOnRequest(func)` / `SetOnResponse(func)` | 콜백 설정 |
| `SetAllowPrivateIPs(*bool)` | SSRF 덮어쓰기 설정 |

대부분의 미들웨어는 타입 단언이 **불필요**합니다 — `RequestMutator`/`ResponseMutator` 인터페이스가 모든 일반적인 읽기/쓰기 조작을 포괄합니다. 콜백이나 SSRF 덮어쓰기가 필요할 때만 구체적 타입으로 단언하면 됩니다.

## SanitizedURL 캐시

여러 미들웨어가 마스킹 URL(자격 증명 정보가 제거된 URL)을 기록해야 할 수 있습니다. 중복 계산을 방지하기 위해 HTTPC는 요청 객체에 마스킹 결과를 캐시하여 동일한 요청의 여러 미들웨어가 공유합니다.

```text
getOrComputeSanitizedURL(req):
  ① req가 sanitizedURLer 인터페이스(SanitizedURL/SetSanitizedURL)를 구현하는가?
     - *engine.Request는 이 인터페이스를 구현함
  ② 캐시됨? → 캐시 값 직접 반환
  ③ 캐시 안 됨? → SanitizeURL(req.URL()) 계산, 캐시 후 반환
```

내장된 `LoggingMiddleware`, `MetricsMiddleware`, `AuditMiddleware`는 모두 `getOrComputeSanitizedURL`을 사용하여 마스킹 결과를 공유하며, URL 마스킹이 전체 체인에서 **한 번만 계산**되도록 합니다. 커스텀 미들웨어가 URL을 기록할 때도 `req.URL()`을(자격 증명 포함 가능) 직접 호출하지 말고 이 메커니즘을 사용해야 합니다.

:::tip URL 마스킹
로그/메트릭 미들웨어에서 URL을 기록할 때 절대 `req.URL()`을 직접 사용하지 마세요 — URL에 `user:pass@host` 형식의 자격 증명이 포함되어 있으면 로그에 유출됩니다. 내장 미들웨어는 `getOrComputeSanitizedURL`을 통해 자격 증명 부분을 자동으로 제거합니다.
:::

## 예제: 뮤테이터로 요청/응답 읽고 쓰기

인증 미들웨어: `RequestMutator`의 `SetHeader` 메서드로 인증 헤더를 주입하고, `ResponseMutator`의 `StatusCode` 메서드로 응답 상태 코드를 읽습니다.

```go
package main

import (
	"context"
	"fmt"

	"github.com/cybergodev/httpc"
)

// authMiddleware는 RequestMutator로 인증 헤더를 주입하고 ResponseMutator로 상태 코드를 읽습니다
func authMiddleware(token string) httpc.MiddlewareFunc {
	return func(next httpc.Handler) httpc.Handler {
		return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
			// 쓰기: RequestMutator로 요청 헤더 설정
			req.SetHeader("Authorization", "Bearer "+token)
			// 읽기: RequestMutator로 요청 메서드 검사
			fmt.Printf("%s 요청 전송\n", req.Method())

			resp, err := next(ctx, req)
			if err != nil {
				return nil, err
			}
			// 읽기: ResponseMutator로 상태 코드 읽기
			fmt.Printf("상태 코드 %d 수신\n", resp.StatusCode())
			return resp, nil
		}
	}
}

func main() {
	cfg := httpc.DefaultConfig()
	cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
		authMiddleware("my-secret-token"),
	}
	client, err := httpc.New(cfg)
	if err != nil {
		panic(err)
	}
	defer client.Close()

	result, err := client.Get("https://httpbin.org/get")
	if err != nil {
		panic(err)
	}
	fmt.Println(result.IsSuccess())
	// 출력 예시:
	// GET 요청 전송
	// 상태 코드 200 수신
	// true
}
```

## 실전 예제: 요청/응답 로깅 미들웨어

완전한 로깅 미들웨어로, `RequestMutator`와 `ResponseMutator`의 읽기/쓰기 능력을 동시에 보여줍니다 — 뮤테이터로 요청 메서드/URL과 응답 상태 코드/소요 시간/재시도 정보를 읽어 통일된 형식으로 출력합니다.

```go
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/cybergodev/httpc"
)

// loggingMiddleware는 뮤테이터로 요청과 응답의 완전한 정보를 읽어 포맷하여 출력합니다
func loggingMiddleware() httpc.MiddlewareFunc {
	return func(next httpc.Handler) httpc.Handler {
		return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
			start := time.Now()

			// 요청 단계: 요청 정보 읽기
			log.Printf("[REQ] %s %s", req.Method(), req.URL())

			resp, err := next(ctx, req)
			duration := time.Since(start)

			if err != nil {
				// 오류 응답: 상태 코드를 읽을 수 없음
				log.Printf("[ERR] %s %s -> %v (%v)",
					req.Method(), req.URL(), err, duration)
				return nil, err
			}

			// 응답 단계: 상태 코드, 소요 시간, 재시도 횟수, 리다이렉트 체인 읽기
			log.Printf("[RESP] %s %s -> %d (%v, attempts=%d, redirects=%d)",
				req.Method(),
				req.URL(),
				resp.StatusCode(),
				duration,
				resp.Attempts(),
				resp.RedirectCount(),
			)
			return resp, nil
		}
	}
}

func main() {
	cfg := httpc.DefaultConfig()
	cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
		loggingMiddleware(),
	}
	client, err := httpc.New(cfg)
	if err != nil {
		panic(err)
	}
	defer client.Close()

	result, err := client.Get("https://httpbin.org/get")
	if err != nil {
		panic(err)
	}
	fmt.Println("상태 코드:", result.StatusCode())
	// 출력 예시:
	// [REQ] GET https://httpbin.org/get
	// [RESP] GET https://httpbin.org/get -> 200 (123.456ms, attempts=1, redirects=0)
	// 상태 코드: 200
}
```

## 참고

- [Handler와 미들웨어 체인](./handler-chain) — 이중 계층 아키텍처와 양파 모델 총람
- [내장 미들웨어](../client-config/middleware) — HeaderMiddleware 등은 뮤테이터로 동작하는 완성된 예제입니다
- [인터페이스 정의](../types/interfaces) — 뮤테이터의 타입 별칭 정의
