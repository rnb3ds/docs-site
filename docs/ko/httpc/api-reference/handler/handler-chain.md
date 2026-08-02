---
sidebar_label: "Handler와 미들웨어 체인"
title: "Handler와 미들웨어 체인 - CyberGo HTTPC | 요청 처리 파이프라인"
description: "HTTPC Handler 파이프라인 아키텍처 해설: 이중 계층 설계에서 Layer 1 메서드 API가 MiddlewareFunc 양파 체인을 조립하고 Handler를 실행하는 방식, Chain 결합기 원리, clientImpl.middlewareChain 구현 메커니즘과 커스텀 미들웨어 작성 예제."
sidebar_position: 1
---

# Handler와 미들웨어 체인

## 이중 계층 아키텍처

HTTPC의 요청 처리는 두 계층의 협력으로 이루어집니다. Layer 1의 메서드 API는 **얇은 래퍼**이며, 실제 요청을 처리하는 엔진은 Layer 2의 Handler 파이프라인입니다. 모든 요청 실행은 "Handler 체인을 조립하고 실행한다"는 것으로 귀결됩니다.

```text
HTTPC 이중 계층 아키텍처
├── Layer 1  메서드 API(얇은 래퍼)
│     패키지 함수 httpc.Get/Post/... + Client 메서드 + 요청 옵션
│     → 내부적으로 client.Request → executeRequest로 통일
│
└── Layer 2  Handler 파이프라인(요청 처리 엔진)
      clientImpl.middlewareChain = Chain(middlewares...)(finalHandler)
      MiddlewareFunc(Handler) 양파 체인 → 조립 → 실행
```

클라이언트에 미들웨어가 설정된 경우, `executeRequest`는 요청 옵션을 `RequestMutator`에 적용한 뒤 `clientImpl.middlewareChain`에 전달하여 실행합니다. 미들웨어가 없으면 엔진으로 직접 요청을 보냅니다. 이 체인이 바로 `buildMiddlewareChain`이 `New()` 시점에 한 번 조립하여 `clientImpl.middlewareChain` 필드에 캐시한 Handler입니다.

## 실행 흐름 상세

Layer 1에서 Layer 2로의 한 요청의 완전한 경로는 다음과 같습니다:

```text
httpc.Get(url, opts...)              ← Layer 1 패키지 함수
  → withDefault(ctx, "GET", url, opts)
    → clientImpl.Request(ctx, "GET", url, opts...)   ← 기본 클라이언트 싱글톤
      → clientImpl.executeRequest(ctx, "GET", url, opts)
          │
          ├─ 닫혔음? → ErrClientClosed
          │
          ├─ 미들웨어 없음?
          │     → c.engine.Request(ctx, method, url, opts...)   ← 엔진 직접 연결
          │
          └─ 미들웨어 있음?
                → engineReq = acquireMiddlewareRequest()         ← 객체 풀에서 획득
                → engineReq.SetMethod/SetURL/SetContext          ← 초기 상태 기록
                → opts를 하나씩 적용(engineReq)                  ← 요청 옵션 효과
                → c.middlewareChain(ctx, engineReq)              ← 양파 체인 진입
                → Chain이 계층별로 래핑 → finalHandler → c.engine.Request
                → defer releaseMiddlewareRequest(engineReq)      ← 객체 풀에 반환
```

핵심 세부 사항:

- **객체 풀 재사용**: 미들웨어가 있을 때, `executeRequest`는 엔진의 공유 객체 풀에서 `*engine.Request`를 획득하여(`acquireMiddlewareRequest()`), 요청 옵션을 적용한 후 `RequestMutator`로 미들웨어 체인에 전달합니다. 전체 체인이 **동기적으로 실행** 완료된 후, `defer`가 요청 객체를 객체 풀에 반환합니다.
- **미들웨어 없을 때 직접 연결**: 미들웨어를 구성하지 않으면 풀링과 체인 조립을 건너뛰고, 요청 옵션이 엔진에 직접 전달됩니다 — 제로 오버헤드의 빠른 경로입니다.
- **기본 panic 안전망**: `clientImpl.Request` 자체에 `recover`가 있어, 실행 경로의 모든 예기치 않은 panic을 error로 변환하여 호출자를 크래시시키지 않고 반환합니다. 이는 `RecoveryMiddleware`와 이중 보장을 형성합니다.

## 미들웨어 체인 조립 과정

`buildMiddlewareChain`은 `New()` 시점에 전체 체인을 **한 번 조립**하여 `clientImpl.middlewareChain` 필드에 캐시합니다. 조립 과정은 두 단계로 나뉩니다:

```text
buildMiddlewareChain(middlewares):

  ① finalHandler 구성(단말 처리기)
     finalHandler: func(ctx, req) → req에서 미들웨어가 수정한 모든 필드 읽기
                                    → 단일 option closure를 통해 엔진에 전달
                                    → *engine.Response 반환

  ② Chain(middlewares...)(finalHandler)
     뒤에서 앞으로 계층별로 래핑: final = mw[i](final)
     슬라이스 [mwA, mwB, mwC] → mwA(mwB(mwC(finalHandler)))
```

슬라이스 순서와 실행 순서의 대응 관계: 슬라이스에서 **앞에 있는** 미들웨어가 체인의 **가장 바깥 계층**(가장 먼저 진입, 가장 마지막에 퇴장)에 위치하고, **뒤에 있는** 미들웨어가 `finalHandler`에 밀착합니다(가장 안쪽 계층). `Chain` 결합기는 슬라이스 끝에서 역방향으로 순회하며(`for i := len-1; i >= 0; i--`), 각 미들웨어를 이전 계층 바깥에 차례로 감쌉니다.

## Handler

```go
type Handler func(ctx context.Context, req RequestMutator) (ResponseMutator, error)
```

요청 처리의 핵심 함수 시그니처입니다. 컨텍스트와 요청 뮤테이터를 받아 응답 뮤테이터 또는 오류를 반환합니다. 체인의 끝에 있는 Handler(`finalHandler`)는 미들웨어가 수정한 요청 필드를 하위 엔진으로 전달하여 실제 네트워크 요청을 보낼 책임을 집니다.

## MiddlewareFunc

```go
type MiddlewareFunc func(Handler) Handler
```

미들웨어 함수 시그니처로, "다음 Handler"를 받아 래핑된 Handler를 반환합니다. 미들웨어는 `next` 호출 전후에 로직을 삽입하여(요청 수정, 응답 기록, panic 캡처 등) 양파 모델을 형성합니다: 첫 번째 미들웨어가 가장 바깥 계층으로 가장 먼저 진입하고 가장 마지막에 퇴장합니다.

## 양파 모델 실행 순서

```text
요청 진입 방향 →

  ┌─ 미들웨어 A (바깥 계층, 가장 먼저 실행) ────────────────┐
  │  ┌─ 미들웨어 B (중간 계층) ────────────────────────┐  │
  │  │  ┌─ 미들웨어 C (안쪽 계층, 가장 마지막 실행) ───┐  │  │
  │  │  │                                              │  │  │
  │  │  │  finalHandler → engine.Request → 네트워크    │  │  │
  │  │  │                                              │  │  │
  │  │  └──────────────── 응답 ←─────────────────────┘  │  │
  │  └───────────────────── 응답 ←───────────────────────┘  │
  └───────────────────────── 응답 ←──────────────────────────┘

  ← 응답 반환 방향

  요청 단계: A → B → C → finalHandler(바깥→안쪽)
  응답 단계: finalHandler → C → B → A(안쪽→바깥)
```

미들웨어는 `MiddlewareConfig.Middlewares`에서 슬라이스 순서대로 구성되며, 슬라이스에서 **앞에 있는** 미들웨어가 체인의 **바깥 계층**에 위치합니다.

## Chain

```go
func Chain(middlewares ...MiddlewareFunc) MiddlewareFunc
```

여러 미들웨어를 단일 미들웨어로 결합합니다. 반환된 결합기는 최종 Handler를 받아 전달 순서대로 바깥에서 안쪽으로 중첩합니다: 슬라이스의 첫 번째 미들웨어가 가장 바깥 계층(가장 먼저 실행)을 감싸고, 마지막 미들웨어가 최종 Handler에 바로 맞닿습니다. HTTPC는 내부적으로 이것을 사용해 `MiddlewareConfig.Middlewares`를 체인으로 조립합니다.

```go
// 세 가지는 동등함: Chain으로 조합 후 한 번에 주입하면 계층별 수동 중첩과 결과가 동일
combined := httpc.Chain(mwA, mwB, mwC)
chain := combined(finalHandler)

// 수동 중첩과 동등
chain := mwA(mwB(mwC(finalHandler)))
```

:::tip Chain의 용도
`Chain`은 주로 HTTPC 내부에서 `buildMiddlewareChain`에 사용되지만, 커스텀 미들웨어 내부에서 여러 서브 미들웨어를 단일 미들웨어로 패키징하여 미들웨어 재사용과 조합을 구현할 수도 있습니다.
:::

## finalHandler 단말 처리기

`finalHandler`는 미들웨어 체인의 **단말 Handler**입니다 — 모든 미들웨어 실행이 완료된 후, 미들웨어가 수정한 요청 필드를 하위 엔진으로 전달하여 실제 네트워크 요청을 보냅니다. 이중 계층 아키텍처에서 Layer 2와 엔진 사이의 다리입니다.

finalHandler의 작업은 세 단계입니다:

```text
finalHandler(ctx, req):

  ① 컨텍스트 해석: req.Context() 우선, nil일 때 체인 ctx로 폴백

  ② *engine.Request로 타입 단언, 엔진 특유의 훅 추출:
       - OnRequest 콜백(요청 전송 전 콜백)
       - OnResponse 콜백(응답 수신 후 콜백)
       - AllowPrivateIPs(요청별 SSRF 덮어쓰기)
     이 세 가지 훅은 RequestMutator 인터페이스에 없음(시그니처가 내부 타입을 참조,
     노출하면 순환 임포트 유발), 따라서 타입 단언으로 읽음

  ③ c.engine.Request(ctx, method, url, optionClosure) 호출
     optionClosure는 req의 모든 가변 필드를 새 엔진 요청에 한 번에 전달:
       headers / queryParams / body / timeout / maxRetries /
       cookies / followRedirects / maxRedirects / allowPrivateIPs /
       streamBody / onRequest / onResponse
```

:::warning 타입 단언의 경계
콜백(`OnRequest`/`OnResponse`)과 요청별 SSRF 덮어쓰기(`AllowPrivateIPs`)는 `RequestMutator` 인터페이스가 아닌 구체적 타입 `*engine.Request`에 존재합니다. `finalHandler`는 타입 단언으로 이러한 훅을 읽습니다. 커스텀 미들웨어가 `req`를 `*engine.Request` 타입이 아닌 것으로 **교체**하면, 타입 단언이 실패하여 이러한 훅이 **조용히 건너뜁니다**. 모든 내장 미들웨어는 제자리에서 요청을 수정하므로(교체하지 않음), 단언은 항상 성공합니다.
:::

## 내장 미들웨어

HTTPC는 7개의 바로 사용 가능한 미들웨어 팩토리를 내장했으며, `MiddlewareConfig.Middlewares`를 통해 클라이언트에 주입합니다. 각 팩토리는 `*XxxConfig` 포인터를 받으며, `nil` 전달 시 기본 구성을 사용합니다.

| 미들웨어 | 팩토리 시그니처 | 역할 |
|----------|-----------------|------|
| Recovery | `RecoveryMiddleware()` | 체인 내 panic 캡처, 스택 포함 error로 변환 |
| Logging | `LoggingMiddleware(config *LoggingConfig)` | 메서드/마스킹 URL/상태 코드/소요 시간 기록 |
| RequestID | `RequestIDMiddleware(config *RequestIDConfig)` | `X-Request-ID` 헤더 주입(crypto/rand) |
| Timeout | `TimeoutMiddleware(config *TimeoutMiddlewareConfig)` | 미들웨어 수준 타임아웃 제어 |
| Header | `HeaderMiddleware(config *HeaderConfig)` | 각 요청에 정적 요청 헤더 추가 |
| Metrics | `MetricsMiddleware(config *MetricsConfig)` | 요청 완료 후 메트릭 데이터 콜백 |
| Audit | `AuditMiddleware(config *AuditConfig)` | 보안 감사 이벤트(금융/의료/정부) |

각 미들웨어의 구성 구조체, 기본 생성자, 상세 사용법은 [내장 미들웨어](../client-config/middleware)를 참조하세요.

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.RecoveryMiddleware(),                          // 가장 바깥 계층: panic 최후 방어
    httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),
    httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: log.Printf}),
    httpc.TimeoutMiddleware(&httpc.TimeoutMiddlewareConfig{Duration: 30 * time.Second}),
}
```

## 커스텀 미들웨어 예제

### 예제 1: 요청 헤더 주입 미들웨어

각 요청에 API 키 헤더를 주입합니다. `next(ctx, req)` **이전**의 요청 전처리 패턴을 보여줍니다.

```go
package main

import (
	"context"
	"fmt"

	"github.com/cybergodev/httpc"
)

// apiKeyMiddleware는 각 요청에 X-API-Key 인증 헤더를 주입합니다
func apiKeyMiddleware(key string) httpc.MiddlewareFunc {
	return func(next httpc.Handler) httpc.Handler {
		return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
			// RequestMutator.SetHeader로 인증 헤더 주입(next 이전 = 요청 전처리)
			req.SetHeader("X-API-Key", key)
			// next를 호출하여 체인 계속; 수정된 요청은 finalHandler까지 체인을 따라 전달
			return next(ctx, req)
		}
	}
}

func main() {
	cfg := httpc.DefaultConfig()
	cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
		apiKeyMiddleware("my-secret-api-key"),
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
	fmt.Println(result.StatusCode())
	// 출력: 200
}
```

### 예제 2: 응답 헤더 주입 미들웨어

응답에 처리 소요 시간을 추가합니다. `next(ctx, req)` **이후**의 응답 후처리 패턴을 보여줍니다 — `ResponseMutator`로 응답을 읽고 수정합니다.

```go
package main

import (
	"context"
	"fmt"
	"time"

	"github.com/cybergodev/httpc"
)

// responseTimeMiddleware는 응답 헤더에 처리 소요 시간을 추가합니다
func responseTimeMiddleware() httpc.MiddlewareFunc {
	return func(next httpc.Handler) httpc.Handler {
		return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
			start := time.Now()
			// 먼저 next를 호출하여 요청이 계속 진행되도록 함
			resp, err := next(ctx, req)
			if err != nil {
				return nil, err
			}
			// next 이후 = 응답 후처리: ResponseMutator.SetHeader로 소요 시간 추가
			resp.SetHeader("X-Response-Time-Ms",
				fmt.Sprintf("%d", time.Since(start).Milliseconds()))
			return resp, nil
		}
	}
}

func main() {
	cfg := httpc.DefaultConfig()
	cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
		responseTimeMiddleware(),
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
	fmt.Println(result.Response.Headers.Get("X-Response-Time-Ms"))
	// 출력 예시: 156
}
```

### 응답 캐시 미들웨어(개념)

응답 캐시는 `ResponseMutator`의 전형적인 고급 사용 사례입니다: GET 요청 캐시 적중 시 `next`를 호출하지 않고 단락 반환합니다. 하지만 완전한 캐시 응답을 구성하려면 `ResponseMutator`의 모든 메서드(31개 읽기/쓰기 메서드)를 구현하는 커스텀 타입이 필요하며, 코드량이 많습니다. 핵심 패턴은 다음과 같습니다:

<!-- check-code: skip -->
```go
func cacheMiddleware(cache Cache) httpc.MiddlewareFunc {
	return func(next httpc.Handler) httpc.Handler {
		return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
			// GET 요청만 캐시
			if req.Method() == "GET" {
				if cached, ok := cache.Get(req.URL()); ok {
					return cached, nil // 캐시 적중: 단락, next 호출 안 함
				}
			}
			// 미스: 요청 실행
			resp, err := next(ctx, req)
			if err != nil {
				return nil, err
			}
			// 응답 캐시(커스텀 ResponseMutator 구현 필요)
			cache.Set(req.URL(), resp)
			return resp, nil
		}
	}
}
```

## 미들웨어 실행 계약

커스텀 미들웨어 작성 시 다음 계약을 준수해야 하며, 그렇지 않으면 자원 누수 또는 요청 손실이 발생합니다:

| 계약 | 설명 |
|------|------|
| **반드시 `next()` 호출** | `next`를 호출하지 않으면 요청이 영원히 발송되지 않습니다(캐시 적중 등 단락 미들웨어 제외). `next`가 반환하는 응답이 이후 체인과 엔진의 최종 결과입니다. |
| **응답은 반드시 반환 또는 해제** | `next`가 반환한 `resp`는 원래대로 반환되어야(또는 이후 `next`를 통해 전달되어야) 하며, 그렇지 않으면 엔진 객체 풀의 응답이 누수됩니다. `(nil, error)`를 반환하면서 미해제 응답을 보유하면 풀 누수가 발생합니다. |
| **panic은 RecoveryMiddleware가 캡처** | 미들웨어의 panic은 `RecoveryMiddleware`(구성된 경우) 또는 `clientImpl.Request`의 기본 안전망이 캡처하여 error로 변환하며, 호출자에게 전파되지 않습니다. |
| **동기 실행** | 미들웨어 체인은 **동기적으로 실행**됩니다 — `next`가 반환될 때 전체 내부 체인이 완료됩니다. 비동기 미들웨어를 지원하지 않습니다; 비동기를 도입하면 객체 풀 재사용 패턴에서 데이터 경합이 발생합니다. |
| **요청 객체 교체 금지** | 커스텀 미들웨어는 `req`를 **제자리에서 수정**해야 하며(`SetHeader`/`SetBody` 등을 통해), 새 객체로 `req`를 교체하지 마세요. 교체하면 `finalHandler`의 타입 단언이 실패하고, 콜백과 SSRF 덮어쓰기가 조용히 건너뛰어집니다. |

:::warning 객체 풀 누수 위험
`executeRequest`가 엔진 객체 풀에서 `*engine.Request`를 획득하여 미들웨어 체인에 전달하고, 체인 반환 후 `defer`로 반환합니다. 미들웨어가 `next`가 준 응답을 반환하면서 추가로 참조를 보유하면(예: 전역 캐시에 저장), 해당 응답은 객체 풀에 반환된 후 재사용되어 요청 간 데이터 누수가 발생합니다. 캐시 미들웨어는 반드시 응답 데이터를 깊은 복사해야 합니다.
:::

## 참고

- [내장 미들웨어](../client-config/middleware) — Recovery/Logging/Timeout 등 7개의 바로 사용 가능한 미들웨어 팩토리
- [요청과 응답 뮤테이터](./mutators) — `RequestMutator`/`ResponseMutator`의 전체 메서드 계약
- [인터페이스 정의](../types/interfaces) — `Handler`/`MiddlewareFunc`의 타입 별칭 정의
