---
sidebar_label: "미들웨어 체인"
title: "미들웨어 체인 - CyberGo HTTPC | 양파 모델과 체인 조합"
description: "HTTPC 미들웨어 체인 가이드: 양파 모델과 전체 실행 순서, 요청 옵션·재시도와의 관계, Recovery/Logging 등 7개 내장 미들웨어, Chain 조합, 커스텀 MiddlewareFunc와 서킷 브레이커 단락 예제로 관측 가능한 요청 파이프라인을 구축합니다."
sidebar_position: 9
---

# 미들웨어 체인

## 양파 모델

HTTPC 미들웨어는 양파 모델을 채택하여, 요청은 바깥에서 안으로, 응답은 안에서 바깥으로 흐릅니다:

```text
요청 →  Recovery  →  Logging  →  RequestID  → Handler
                                                          ↓
응답 ←  Recovery  ←  Logging  ←  RequestID  ← Response
```

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.RecoveryMiddleware(),                                      // 가장 바깥: panic 복구
    httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: log.Printf}), // 두 번째: 로그 기록
    httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),          // 가장 안쪽: 요청 ID
}

client, err := httpc.New(cfg)
if err != nil {
    log.Fatal(err)
}
defer client.Close()
```

두 핵심 타입(둘 다 익스포트된 별칭):

```go
// Handler 는 하나의 HTTP 요청을 처리하고 응답을 반환 — 체인의 종점은 엔진
type Handler func(ctx context.Context, req RequestMutator) (ResponseMutator, error)

// MiddlewareFunc 는 Handler 를 새로운 Handler 로 감쌉니다
type MiddlewareFunc func(Handler) Handler
```

`RequestMutator` / `ResponseMutator`는 요청과 응답의 모든 읽기/쓰기 메서드를 제공하며, 미들웨어의 두 단계에서 모두 사용할 수 있습니다.

### 전체 실행 순서

시야를 넓혀 보면, 한 번의 요청이 거치는 전체 파이프라인은 다음과 같습니다:

```text
client.Get(url, opts...)
   │
   ├─ 1. 요청 옵션 적용(WithHeader/WithJSON/WithQuery/...)
   │
   ├─ 2. 미들웨어 체인 · 요청 단계(바깥 → 안)
   │       Recovery → Logging → RequestID → ……
   │
   ├─ 3. 터미널 핸들러: 미들웨어가 수정한 요청 필드를 엔진에 전달
   │
   ├─ 4. 엔진 내부: 보안 검증 → 재시도 루프(지수 백오프) → 전송 계층 발송
   │
   └─ 5. 미들웨어 체인 · 응답 단계(안 → 바깥)
           …… ← RequestID ← Logging ← Recovery
```

핵심 결론:

- **요청 옵션이 미들웨어보다 먼저 실행됩니다**: 미들웨어가 읽는 것은 「옵션이 이미 적용된」 요청이며, 옵션이 설정한 어떤 필드든 덮어쓸 수 있습니다(헤더, 쿼리 매개변수, 타임아웃, 리다이렉트 정책 등)
- **옵션은 두 번 실행되지 않습니다**: 터미널 핸들러는 미들웨어가 수정한 요청 필드를 완전히 새로운 엔진 요청에 복사해 발송할 뿐, 옵션을 다시 실행하지 않습니다
- `Defaults.Headers` / `Defaults.UserAgent` 등 클라이언트 기본값은 엔진이 최종 요청을 구성할 때 「미설정일 때만 채움」 방식으로 적용되므로, 미들웨어가 설정한 동일 이름 헤더가 우선합니다

### 미들웨어와 재시도의 관계

미들웨어 체인이 감싸는 것은 **재시도 주기 전체**입니다: 논리적 요청 하나가 몇 번을 재시도하든 미들웨어는 한 번만 실행되고, 보는 것은 최종 시도의 응답입니다 — 총 시도 횟수는 `Meta.Attempts`가 반영합니다.

「시도별」 단위의 훅이 필요하면 [`WithOnRequest`/`WithOnResponse` 콜백](./request-response#콜백)을 사용하세요: 이들은 엔진 내부에서 매 시도(재시도 포함)마다 트리거됩니다.

### 오류 전파와 단락

- 어느 미들웨어든 오류를 반환하면 체인이 즉시 중단됩니다: 더 안쪽의 미들웨어는 실행되지 않고, 오류는 그대로 호출자에게 전달됩니다
- 미들웨어가 `next()`를 **호출하지 않고** 곧바로 응답(또는 오류)을 반환하는 것이 「단락」입니다 — 바깥쪽 미들웨어의 응답 단계는 여전히 실행되지만(예: Recovery 의 defer) 안쪽과 엔진은 전혀 실행되지 않으며, 캐시 적중·서킷 브레이커 오픈 등의 시나리오가 이 방식으로 구현됩니다
- `(resp, err)`를 동시에 반환하면 클라이언트가 응답을 안전하게 해제해 객체 풀 누수를 막습니다; 하지만 `next()`에서 받은 응답을 버리고 `(nil, err)`를 반환하면 누수가 발생합니다 — 응답을 삼키지 마세요(아래 커스텀 미들웨어 경고 참조)
- panic 에는 두 겹의 방어선이 있습니다: `RecoveryMiddleware`가 체인 안의 panic 을 복구하고, `Request` 메서드 자체에도 기본 recover 가 있어 빠져나온 panic 을 프로세스 크래시 대신 오류로 변환합니다

## 내장 미들웨어

### RecoveryMiddleware

panic 복구, 프로세스 크래시 방지:

```go
httpc.RecoveryMiddleware()
```

panic 값은 스택을 포함한 오류로 변환되어 반환됩니다. 보통 체인의 **가장 바깥층**에 두어 이후의 모든 층을 보호합니다.

### LoggingMiddleware

요청/응답 로그, URL 자동 마스킹:

```go
httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: func(format string, args ...any) {
    log.Printf("[HTTP] "+format, args...)
}})
// 출력 예시: [HTTP] GET https://api.example.com/data -> 200 (150ms)(상태 코드와 소요 시간은 실측값이며 고정값이 아님)
```

`nil` 구성을 전달하거나 `LogFunc`가 nil 이면 로그가 꺼집니다(미들웨어가 투과로 변함). URL 의 자격 증명 정보(`user:pass@host`)는 기록 전에 제거됩니다.

### RequestIDMiddleware

각 요청에 고유 ID 를 추가합니다, `crypto/rand`로 생성:

```go
httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()) // 기본 32자 hex

// 커스텀 생성기
httpc.RequestIDMiddleware(&httpc.RequestIDConfig{
    HeaderName: "X-Request-ID",
    Generator:  func() string {
        return uuid.New().String()
    },
})
```

요청에 이미 동일 이름 헤더가 있으면(상위 게이트웨이가 주입한 경우 등) 미들웨어는 기존값을 **덮어쓰지 않아**, 전체 구간 추적 전달에 유용합니다.

### TimeoutMiddleware

미들웨어 계층 타임아웃, 클라이언트 타임아웃보다 먼저 강제됩니다:

```go
httpc.TimeoutMiddleware(&httpc.TimeoutMiddlewareConfig{Duration: 30 * time.Second})
```

타임아웃은 요청 자체의 context 에서 파생됩니다(이미 설정된 데드라인/취소 신호는 보존). 만료되면 context 가 취소되고 타임아웃 오류가 반환됩니다. `Duration`이 0 이하면 비활성화됩니다(투과).

:::warning Download 나 스트리밍 요청에는 사용 금지
`TimeoutMiddleware`의 `defer cancel()`은 핸들러가 반환 (응답 헤더 수신) 된 직후에 실행되어, `Download`나 `WithStreamBody` 요청에서는 응답 본문을 읽기 전에 컨텍스트가 미리 취소되어 "context canceled" 오류가 발생합니다. 스트리밍/다운로드 시나리오에서는 [`WithTimeout`](../api-reference/core/options#withtimeout) 옵션을 대신 사용하세요.
:::

### HeaderMiddleware

모든 요청에 정적 헤더 추가:

```go
httpc.HeaderMiddleware(&httpc.HeaderConfig{Headers: map[string]string{
    "X-App-Version": "1.0.0",
    "X-Platform":    "server",
}})
```

헤더 표는 **미들웨어 생성 시점에** CRLF 검증과 방어적 복사를 마칩니다 — 이후 전달된 map 을 수정해도 미들웨어에 영향이 없습니다; 검증에 실패하면 이 미들웨어는 모든 요청에 오류를 반환합니다. 이미 존재하는 동일 이름 헤더는 덮어써집니다.

### MetricsMiddleware

요청 메트릭 수집:

```go
httpc.MetricsMiddleware(&httpc.MetricsConfig{OnMetrics: func(method, url string, statusCode int, duration time.Duration, err error) {
    metrics.IncrCounter("http.requests", 1)
    metrics.RecordTimer("http.latency", duration)
    if err != nil {
        metrics.IncrCounter("http.errors", 1)
    }
}})
```

콜백에 전달되는 URL 과 오류 메시지는 모두 마스킹을 거칩니다(URL 자격 증명 제거, 오류 메시지의 원본 URL 을 마스킹된 버전으로 교체)하여 민감한 데이터가 메트릭 시스템에 유입되지 않습니다. 요청 실패 시 `statusCode`는 0입니다.

### AuditMiddleware

보안 감사, 금융·의료 등 컴플라이언스 시나리오에 사용:

```go
auditCfg := httpc.DefaultAuditConfig()
auditCfg.OnAudit = func(event httpc.AuditEvent) {
    log.Printf("[AUDIT] %s %s -> %d (%v)",
        event.Method, event.URL, event.StatusCode, event.Duration)
}
httpc.AuditMiddleware(auditCfg)
```

`OnAudit`가 nil 이면 미들웨어는 no-op 입니다(바로 투과).

### 감사 옵션 설정

`DefaultAuditConfig()`로 기본 구성을 가져온 뒤 필드를 수정하여, 출력 형식과 헤더 기록 및 마스킹을 제어할 수 있습니다:

```go
auditCfg := httpc.DefaultAuditConfig()
auditCfg.Format = "json"
auditCfg.IncludeHeaders = true
auditCfg.MaskHeaders = []string{"Authorization", "Cookie"}
auditCfg.SanitizeError = true
auditCfg.OnAudit = func(event httpc.AuditEvent) {
    data, err := json.Marshal(event)
    if err != nil {
        log.Println("감사 이벤트 직렬화 실패:", err)
        return
    }
    log.Println(string(data))
}

httpc.AuditMiddleware(auditCfg)
```

`AuditEvent`는 타임스탬프, 메서드, 마스킹된 URL, 상태 코드, 소요 시간, 시도 횟수, 리다이렉트 체인 등의 필드를 담습니다; `SanitizeError = true`이면 오류가 일괄적으로 `[sanitized]`로 교체되어, 오류 세부 정보가 민감한 정보를 유출하지 않습니다. JSON 직렬화 시 `Duration`은 `durationMs` 필드(밀리초)가 추가로 출력됩니다.

감사 이벤트는 컨텍스트에서 SourceIP 와 UserID 추출을 지원합니다:

```go
ctx := context.WithValue(context.Background(), httpc.SourceIPKey, "192.168.1.1")
ctx = context.WithValue(ctx, httpc.UserIDKey, "user-123")
```

## 수동 체인 조합

`Chain` 함수로 미들웨어를 조합합니다:

```go
middleware := httpc.Chain(
    httpc.RecoveryMiddleware(),
    httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: log.Printf}),
    httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),
)

cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{middleware}
```

`Chain`은 마지막 미들웨어부터 앞쪽으로 한 층씩 감싸므로, **슬라이스 순서 = 바깥에서 안으로의 실행 순서**입니다: 첫 번째 요소가 가장 바깥층(요청을 가장 먼저, 응답을 가장 늦게 봄)입니다. `Chain`은 여러 미들웨어를 하나의 `MiddlewareFunc`로 수렴시켜, 라이브러리로 재사용하거나 필요에 따라 다른 조합을 장착하기에 적합합니다.

## 커스텀 미들웨어

```go
func CORSMiddleware(origin string) httpc.MiddlewareFunc {
    return func(next httpc.Handler) httpc.Handler {
        return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
            // 요청 단계: 요청 수정
            req.SetHeader("Origin", origin)

            // 다음 핸들러 호출
            resp, err := next(ctx, req)

            // 응답 단계: 기록 또는 응답 수정
            if resp != nil {
                log.Printf("응답 상태: %d", resp.StatusCode())
            }

            return resp, err
        }
    }
}
```

완전히 실행 가능한 예제 — 소요 시간과 상태를 기록하는 타이밍 미들웨어입니다:

```go
package main

import (
    "context"
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

// timingMiddleware 는 각 요청의 메서드, URL, 상태 코드, 소요 시간을 기록
func timingMiddleware() httpc.MiddlewareFunc {
    return func(next httpc.Handler) httpc.Handler {
        return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
            start := time.Now()

            // 요청 단계: 요청 읽기/수정 가능
            req.SetHeader("X-Client-Trace", "demo")

            // 다음 층 호출(결국 엔진에 도달)
            resp, err := next(ctx, req)

            // 응답 단계: 응답 읽기/수정 가능
            status := 0
            if resp != nil {
                status = resp.StatusCode()
            }
            log.Printf("%s %s -> %d (%v)", req.Method(), req.URL(), status, time.Since(start))

            return resp, err
        }
    }
}

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
        httpc.RecoveryMiddleware(),
        timingMiddleware(),
    }

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://httpbin.org/get")
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(result.StatusCode()) // 200
}
```

:::warning next() 의 응답을 삼키지 마세요
`next()`를 호출해 nil 이 아닌 응답을 받았으면, 그대로 반환하거나 더 안쪽을 호출한 뒤 안쪽 응답을 반환해야 합니다. 응답을 버리고 `(nil, err)`를 반환하면 엔진 객체 풀이 누수됩니다; `(resp, err)`를 함께 반환하면 클라이언트가 응답을 안전하게 해제하지만, 여전히 그대로 전달하는 것이 우선입니다.
:::

:::warning 미들웨어 상태와 동시성
같은 미들웨어 인스턴스는 클라이언트 생성 시 한 번 장착되어 **모든 동시 요청이 공유**합니다. 클로저에 저장한 가변 상태(카운터, 서킷 브레이커 임계값 등)는 아래 서킷 브레이커 예제처럼 뮤텍스로 보호해야 합니다; 상태 없는 미들웨어는 추가 처리가 필요 없습니다.
:::

### 단락 미들웨어

```go
func CircuitBreakerMiddleware(threshold int) httpc.MiddlewareFunc {
    var failures int
    var mu sync.Mutex

    return func(next httpc.Handler) httpc.Handler {
        return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
            mu.Lock()
            if failures >= threshold {
                mu.Unlock()
                return nil, fmt.Errorf("circuit breaker open")
            }
            mu.Unlock()

            resp, err := next(ctx, req)
            if err != nil {
                mu.Lock()
                failures++
                mu.Unlock()
            }
            return resp, err
        }
    }
}
```

단락으로 `(nil, err)`를 반환할 때는 `next()`를 **호출한 적이 없으므로** 해제해야 할 응답을 가지고 있지 않아 누수 문제가 없습니다. 자체적으로 만든 응답을 단락 반환할 수도 있습니다(캐시 적중 시나리오 등) — `ResponseMutator` 인터페이스를 구현해 반환하면 되며, 엔진 응답은 정상적으로 교체됩니다.

## 미들웨어 설정

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.RecoveryMiddleware(),
    httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: log.Printf}),
}
cfg.Defaults.UserAgent = "my-app/1.0"
cfg.Defaults.Headers = map[string]string{"X-App": "my-app"}
cfg.Defaults.FollowRedirects = true
cfg.Defaults.MaxRedirects = 10

client, err := httpc.New(cfg)
if err != nil {
    log.Fatal(err)
}
defer client.Close()
```

두 종류의 「기본값」을 구분하세요: `Middleware.Middlewares`는 가로채기 파이프라인이고; `Defaults.*`는 엔진이 요청을 구성할 때 채우는 정적 기본값입니다(요청에 설정되지 않았을 때만 적용되며, 옵션과 미들웨어보다 우선순위가 낮음).

## 다음 단계

- [내장 미들웨어 API](../api-reference/client-config/middleware) - 완전한 미들웨어 레퍼런스
- [재시도와 내결함성](./retry-fault-tolerance) - 재시도 전략 가이드
- [보안 개요](../security/) - 감사 미들웨어 보안 실천
