---
sidebar_label: "미들웨어"
title: "미들웨어 - CyberGo HTTPC | 7개 내장 미들웨어"
description: "HTTPC 미들웨어 시스템 API 레퍼런스: Chain 양파 모델 조합, 7개 내장 미들웨어(Recovery/Logging/Timeout/Metrics/Audit 등), 각 미들웨어 설정 구조체와 Default 생성자, AuditEvent 감사 이벤트 구조체."
sidebar_position: 5
---

# 미들웨어

:::tip 아키텍처 개요
이 페이지는 **내장 미들웨어 참조**입니다. Handler 파이프라인의 전체 아키텍처, 양파 모델 원리와 커스텀 미들웨어 작성은 [핸들러 파이프라인 / Handler 와 미들웨어 체인](../handler/handler-chain)을 참조하세요.
:::

HTTPC는 양파 모델 미들웨어 아키텍처를 채택하여, `MiddlewareFunc`로 요청 처리 로직을 래핑합니다.

```go
type MiddlewareFunc func(Handler) Handler
type Handler func(ctx context.Context, req RequestMutator) (ResponseMutator, error)
```

미들웨어는 `MiddlewareConfig.Middlewares`에서 설정하며, 순서대로 실행됩니다. 각 미들웨어 팩토리는 `*XxxConfig` 설정 포인터를 받으며, `nil`을 전달하면 기본 설정을 사용합니다:

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.RecoveryMiddleware(),
    httpc.LoggingMiddleware(&httpc.LoggingConfig{
        LogFunc: log.Printf,
    }),
    httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),
}
client, err := httpc.New(cfg)
```

## Chain

```go
func Chain(middlewares ...MiddlewareFunc) MiddlewareFunc
```

여러 미들웨어를 단일 미들웨어로 조합합니다. 전달된 순서대로 실행되며, 마지막 미들웨어가 처리를 완료한 후 최종 Handler 를 호출합니다.

```go
combined := httpc.Chain(
    httpc.RecoveryMiddleware(),
    httpc.LoggingMiddleware(&httpc.LoggingConfig{
        LogFunc: log.Printf,
    }),
)
```

## 내장 미들웨어

### RecoveryMiddleware

```go
func RecoveryMiddleware() MiddlewareFunc
```

panic 복구 미들웨어. 처리 체인의 panic 을 포착하여 스택 정보가 포함된 error 로 변환합니다.

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.RecoveryMiddleware(),
}
client, _ := httpc.New(cfg)
```

### LoggingMiddleware

```go
func LoggingMiddleware(config *LoggingConfig) MiddlewareFunc
```

요청 로그 미들웨어. 메서드, URL, 상태 코드와 소요 시간을 기록합니다. URL 은 자동 마스킹됩니다 (자격 증명 제거). `nil`을 전달하면 [`DefaultLoggingConfig()`](#defaultloggingconfig)를 사용합니다 (로깅 비활성화).

#### LoggingConfig

```go
type LoggingConfig struct {
    // LogFunc 는 포맷된 로그 메시지를 받습니다 (log.Printf 와 유사).
    // nil 이면 로깅이 비활성화됩니다.
    LogFunc func(format string, args ...any)
}
```

| 필드 | 기본값 | 설명 |
|------|--------|------|
| `LogFunc` | `nil` | 로그 출력 함수, nil 이면 로깅 비활성화 |

#### DefaultLoggingConfig

```go
func DefaultLoggingConfig() *LoggingConfig
```

로깅이 비활성화된 기본 설정을 반환합니다. `LogFunc` 필드를 설정하여 로깅을 활성화하세요.

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.LoggingMiddleware(&httpc.LoggingConfig{
        LogFunc: log.Printf,
    }),
}
client, _ := httpc.New(cfg)
// 출력 예: GET https://api.example.com/data -> 200 (125ms)
```

### RequestIDMiddleware

```go
func RequestIDMiddleware(config *RequestIDConfig) MiddlewareFunc
```

각 요청에 고유 ID 를 추가합니다. `nil`을 전달하면 [`DefaultRequestIDConfig()`](#defaultrequestidconfig)를 사용합니다 (`"X-Request-ID"` 헤더 + `crypto/rand` 생성기). 요청에 이미 동일한 이름의 헤더가 있으면 원래 값을 유지하고 덮어쓰지 않습니다.

:::tip
기본 생성기는 `crypto/rand`를 사용하여 예측 불가능한 ID 를 생성하므로 보안 민감 시나리오에 적합합니다.
:::

#### RequestIDConfig

```go
type RequestIDConfig struct {
    // HeaderName 은 요청 ID 의 HTTP 헤더 이름입니다.
    // 기본값: "X-Request-ID".
    HeaderName string

    // Generator 는 요청 ID 문자열을 생성합니다. nil 이면 암호학적으로
    // 안전한 난수 생성기를 사용합니다 (crypto/rand, 16 바이트 16 진수 인코딩).
    Generator func() string
}
```

| 필드 | 기본값 | 설명 |
|------|--------|------|
| `HeaderName` | `"X-Request-ID"` | 요청 헤더 이름 |
| `Generator` | `nil` (crypto/rand) | ID 생성 함수, nil 이면 암호학적으로 안전한 생성기 사용 |

#### DefaultRequestIDConfig

```go
func DefaultRequestIDConfig() *RequestIDConfig
```

기본 설정을 반환합니다: `HeaderName`은 `"X-Request-ID"`, `Generator`는 nil (런타임에 `crypto/rand`로 폴백).

```go
// 기본 설정 사용
middleware := httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig())

// 커스텀 헤더 이름 사용
middleware := httpc.RequestIDMiddleware(&httpc.RequestIDConfig{
    HeaderName: "X-Correlation-ID",
})

// 커스텀 생성기 사용
middleware := httpc.RequestIDMiddleware(&httpc.RequestIDConfig{
    Generator: func() string {
        return uuid.New().String()
    },
})
```

### TimeoutMiddleware

```go
func TimeoutMiddleware(config *TimeoutMiddlewareConfig) MiddlewareFunc
```

미들웨어 레벨의 타임아웃 제어. `nil`을 전달하면 [`DefaultTimeoutMiddlewareConfig()`](#defaulttimeoutmiddlewareconfig)를 사용합니다 (타임아웃 비활성화, 미들웨어가 패스스루). 양수로 설정하면 클라이언트 내장 타임아웃 전에 적용되며, 타임아웃 시 컨텍스트를 취소하고 오류를 반환합니다.

:::warning Download 나 스트리밍 요청에는 사용 금지
`TimeoutMiddleware`의 `defer cancel()`은 핸들러가 반환 (응답 헤더 수신) 된 직후에 실행되어, `Download`나 `WithStreamBody` 요청에서는 응답 본문을 읽기 전에 컨텍스트가 미리 취소되어 "context canceled" 오류가 발생합니다. 스트리밍/다운로드 시나리오에서는 [`WithTimeout`](../core/options#withtimeout)을 대신 사용하세요.
:::

#### TimeoutMiddlewareConfig

```go
type TimeoutMiddlewareConfig struct {
    // Duration 은 요청에 허용된 최대 시간입니다. 0 또는 음수이면 타임아웃이
    // 비활성화됩니다 (미들웨어가 요청을 변경 없이 통과시킴).
    // 기본값: 0 (비활성화).
    Duration time.Duration
}
```

| 필드 | 기본값 | 설명 |
|------|--------|------|
| `Duration` | `0` | 타임아웃 시간, 0 또는 음수면 비활성화 |

타입 이름에 `Middleware`가 포함된 것은 `types.go`의 클라이언트 레벨 `TimeoutConfig`와 구분하기 위함입니다.

#### DefaultTimeoutMiddlewareConfig

```go
func DefaultTimeoutMiddlewareConfig() *TimeoutMiddlewareConfig
```

타임아웃이 비활성화된 기본 설정을 반환합니다. `Duration`을 양수로 설정하여 타임아웃을 활성화하세요.

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.TimeoutMiddleware(&httpc.TimeoutMiddlewareConfig{
        Duration: 10 * time.Second,
    }),
}
client, _ := httpc.New(cfg)
```

### HeaderMiddleware

```go
func HeaderMiddleware(config *HeaderConfig) MiddlewareFunc
```

모든 요청에 정적 요청 헤더를 추가합니다. `nil`을 전달하면 [`DefaultHeaderConfig()`](#defaultheaderconfig)를 사용합니다 (헤더 없음, 미들웨어가 패스스루). 생성 시 헤더 보안 검증을 수행합니다 (CRLF 주입 방지). 요청에 이미 동일한 이름의 헤더가 있으면 덮어씁니다.

#### HeaderConfig

```go
type HeaderConfig struct {
    // Headers 는 모든 요청에 추가할 정적 헤더를 포함합니다. 동일한 키의 기존 헤더는
    // 덮어씌워집니다. 헤더는 미들웨어 생성 시 보안 검증을 받습니다 (CRLF 주입 방지).
    // 기본값: 비어 있음 (추가되는 헤더 없음, 미들웨어가 패스스루).
    Headers map[string]string
}
```

| 필드 | 기본값 | 설명 |
|------|--------|------|
| `Headers` | `nil` (비어 있음) | 정적 헤더 키-값 쌍, 생성 시 보안 검증 수행 |

#### DefaultHeaderConfig

```go
func DefaultHeaderConfig() *HeaderConfig
```

헤더가 없는 기본 설정을 반환합니다.

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.HeaderMiddleware(&httpc.HeaderConfig{
        Headers: map[string]string{
            "X-API-Version": "v2",
            "X-Client":      "myapp/1.0",
        },
    }),
}
client, _ := httpc.New(cfg)
```

### MetricsMiddleware

```go
func MetricsMiddleware(config *MetricsConfig) MiddlewareFunc
```

메트릭 수집 미들웨어. 매 요청 완료 후 콜백을 호출하여 메서드, URL, 상태 코드, 소요 시간과 오류 정보를 전달합니다. `nil`을 전달하면 [`DefaultMetricsConfig()`](#defaultmetricsconfig)를 사용합니다 (메트릭 비활성화).

#### MetricsConfig

```go
type MetricsConfig struct {
    // OnMetrics 는 각 요청/응답 주기가 완료된 후 호출되어 요청 메트릭을 받습니다.
    // nil 이면 메트릭 수집이 비활성화됩니다.
    OnMetrics func(method, url string, statusCode int, duration time.Duration, err error)
}
```

| 필드 | 기본값 | 설명 |
|------|--------|------|
| `OnMetrics` | `nil` | 메트릭 콜백, nil 이면 메트릭 수집 비활성화 |

#### DefaultMetricsConfig

```go
func DefaultMetricsConfig() *MetricsConfig
```

메트릭이 비활성화된 기본 설정을 반환합니다. `OnMetrics` 필드를 설정하여 메트릭 수집을 활성화하세요.

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.MetricsMiddleware(&httpc.MetricsConfig{
        OnMetrics: func(method, url string, status int, d time.Duration, err error) {
            metrics.Record(method, status, d, err)
        },
    }),
}
client, _ := httpc.New(cfg)
```

### AuditMiddleware

```go
func AuditMiddleware(config *AuditConfig) MiddlewareFunc
```

보안 감사 미들웨어로, 금융, 의료, 정부 등 컴플라이언스 시나리오에 적합합니다. 요청/응답 메타데이터 (메서드, URL, 상태 코드, 소요 시간, 재시도 등) 를 기록하며, URL 은 자동 마스킹됩니다. 콜백은 `config.OnAudit`로 제공되며, nil 이면 미들웨어는 아무 작업도 수행하지 않습니다. `nil`을 전달하면 [`DefaultAuditConfig()`](#defaultauditconfig)를 사용합니다.

`SourceIP`와 `UserID`는 요청 컨텍스트에서 [`SourceIPKey`](#감사-컨텍스트-키)와 [`UserIDKey`](#감사-컨텍스트-키)를 통해 추출됩니다.

#### AuditConfig

```go
type AuditConfig struct {
    // OnAudit 는 각 요청/응답 주기가 완료된 후 AuditEvent 를 받습니다.
    // nil 이면 미들웨어는 아무 작업도 수행하지 않습니다.
    OnAudit func(event AuditEvent)

    // Format 은 출력 형식을 지정합니다: "text"(기본값) 또는 "json"
    Format string

    // IncludeHeaders 는 감사 로그에 요청/응답 헤더를 포함합니다
    IncludeHeaders bool

    // MaskHeaders 는 마스킹할 헤더 이름 목록입니다 (예: "Authorization", "Cookie")
    MaskHeaders []string

    // SanitizeError 는 오류 메시지에서 민감 정보를 제거합니다
    SanitizeError bool
}
```

| 필드 | 기본값 | 설명 |
|------|--------|------|
| `OnAudit` | `nil` | 감사 콜백, nil 이면 미들웨어가 아무 작업도 수행하지 않음 |
| `Format` | `"text"` | 출력 형식 |
| `IncludeHeaders` | `false` | 헤더 기록 여부 |
| `MaskHeaders` | `["Authorization", "Cookie", ...]` | 표준 민감 헤더 목록 |
| `SanitizeError` | `true` | 오류 정보를 `[sanitized]`로 대체 |

#### DefaultAuditConfig

```go
func DefaultAuditConfig() *AuditConfig
```

기본 감사 설정을 반환합니다: `Format`은 `"text"`, `IncludeHeaders`는 `false`, `MaskHeaders`는 표준 민감 헤더 목록, `SanitizeError`는 `true`. `OnAudit` 필드를 설정하여 감사 콜백을 활성화하세요.

```go
auditCfg := httpc.DefaultAuditConfig()
auditCfg.OnAudit = func(event httpc.AuditEvent) {
    log.Printf("[AUDIT] %s %s -> %d (%v) user=%s ip=%s",
        event.Method, event.URL, event.StatusCode,
        event.Duration, event.UserID, event.SourceIP)
}
auditCfg.Format = "json"
auditCfg.IncludeHeaders = true

cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.AuditMiddleware(auditCfg),
}
client, _ := httpc.New(cfg)
```

## 감사 타입

### AuditEvent

```go
type AuditEvent struct {
    Timestamp     time.Time           `json:"timestamp"`
    Method        string              `json:"method"`
    URL           string              `json:"url"`              // 마스킹됨 (자격 증명 제거)
    StatusCode    int                 `json:"statusCode"`
    Duration      time.Duration       `json:"duration"`
    Attempts      int                 `json:"attempts"`
    Error         error               `json:"error,omitempty"`
    SourceIP      string              `json:"sourceIP,omitempty"`
    UserID        string              `json:"userID,omitempty"`
    RedirectChain []string            `json:"redirectChain,omitempty"`
    ReqHeaders    map[string][]string `json:"reqHeaders,omitempty"`
    RespHeaders   map[string][]string `json:"respHeaders,omitempty"`
}
```

보안 감사 이벤트입니다.

#### MarshalJSON

```go
func (e AuditEvent) MarshalJSON() ([]byte, error)
```

커스텀 JSON 직렬화로, 두 특수 필드를 처리합니다:

| 필드 | 변환 규칙 |
|------|-----------|
| `Duration` | `durationMs`(밀리초 정수) 추가, 원본 `duration` 필드 (나노초) 유지 |
| `Error` | `error`(오류 메시지 문자열) 로 변환, nil 이면 생략 |

```go
event := httpc.AuditEvent{
    Method:    "GET",
    URL:       "https://api.example.com/data",
    Duration:  150 * time.Millisecond,
    StatusCode: 200,
}
data, _ := json.Marshal(event)
// {"timestamp":"...","method":"GET","url":"...","statusCode":200,"duration":150000000,"attempts":0,"durationMs":150}
```

### 감사 컨텍스트 키

요청 컨텍스트로 감사 정보를 전달합니다:

```go
// 출처 IP 설정
ctx = context.WithValue(ctx, httpc.SourceIPKey, "192.168.1.1")

// 사용자 ID 설정
ctx = context.WithValue(ctx, httpc.UserIDKey, "user-123")

result, err := client.Request(ctx, "GET", url)
```

| 상수 | 타입 | 설명 |
|------|------|------|
| `SourceIPKey` | `auditContextKey` | 출처 IP 컨텍스트 키 |
| `UserIDKey` | `auditContextKey` | 사용자 식별 컨텍스트 키 |

## 관련 항목

- [인터페이스 정의](../types/interfaces) - MiddlewareFunc, Handler 타입 정의
- [미들웨어 체인](../../guides/middleware-chain) - 미들웨어 사용 가이드
- [상수와 타입](../types/constants) - AuditEvent, AuditConfig 타입
