---
sidebar_label: "치트시트"
title: "치트시트 - CyberGo HTTPC | 자주 쓰는 코드 빠른 참조"
description: "HTTPC 치트시트: 클라이언트 생성과 5가지 프리셋, 7가지 HTTP 메서드, 28개 WithXxx 요청 옵션, Result 응답 처리, 미들웨어 체인, ClientError 오류 분류, 파일 다운로드와 도메인 클라이언트의 재사용 가능한 코드 조각 모음."
sidebar_position: 3
---

# 치트시트

## 클라이언트 생성

```go
// 기본 설정
client, _ := httpc.NewDefault()
defer client.Close()

// 사용자 정의 설정
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 60 * time.Second
cfg.Retry.MaxRetries = 5
client, _ = httpc.New(cfg)
```

```go
// 프리셋 한 번에 적용
client, _ := httpc.New(httpc.SecureConfig())     // 보안 우선: 엄격한 타임아웃, 리다이렉트 비활성화, 5MB 상한
client, _ = httpc.New(httpc.PerformanceConfig()) // 높은 처리량: 큰 연결 풀, Cookie 활성화
client, _ = httpc.New(httpc.TestingConfig())     // 테스트 전용: 인증서 검증과 SSRF 건너뜀(프로덕션 금지)
client, _ = httpc.New(httpc.MinimalConfig())     // 경량: 재시도 없음, 리다이렉트 없음

// 요청 기본값(User-Agent / 기본 헤더 / 리다이렉트 정책)
cfg := httpc.DefaultConfig()
cfg.Defaults.UserAgent = "myapp/2.0"
cfg.Defaults.Headers["Authorization"] = "Bearer " + token
cfg.Defaults.FollowRedirects = false
cfg.Defaults.MaxRedirects = 5
client, _ = httpc.New(cfg)

// 패키지 수준 기본 클라이언트 관리
_ = httpc.SetDefaultClient(client) // 기본 클라이언트 교체(이전 클라이언트는 자동 종료)
_ = httpc.CloseDefaultClient()     // 닫고 초기화(다음 패키지 함수 호출 때 자동 재생성)
```

## HTTP 메서드

```go
// 패키지 함수(기본 클라이언트 사용)
result, _ := httpc.Get(url)
result, _ = httpc.Post(url)
result, _ = httpc.Put(url)
result, _ = httpc.Patch(url)
result, _ = httpc.Delete(url)
result, _ = httpc.Head(url)
result, _ = httpc.Options(url)

// 인스턴스 메서드
result, _ := client.Get(url)

// 컨텍스트 포함
result, _ := httpc.Request(ctx, "GET", url)
result, _ = client.Request(ctx, "POST", url)
```

## 요청 옵션

### 요청 헤더

```go
httpc.WithHeader("Authorization", "Bearer token")
httpc.WithHeaderMap(map[string]string{"Key": "Value"})
httpc.WithUserAgent("my-app/1.0")
```

### 요청 본문

```go
httpc.WithJSON(data)                    // application/json
httpc.WithXML(data)                     // application/xml
httpc.WithForm(map[string]string{...})  // x-www-form-urlencoded
httpc.WithFormData(formData)            // multipart/form-data
httpc.WithFile("file", "doc.pdf", data) // 파일 업로드
httpc.WithBinary([]byte{...})           // application/octet-stream
httpc.WithBinary([]byte{...}, "image/png") // 타입 지정
httpc.WithBody(data)                    // 자동 타입 감지
httpc.WithBody(data, httpc.BodyJSON)    // 명시적 지정: BodyJSON/BodyXML/BodyForm/BodyBinary/BodyMultipart
```

`WithBody` 자동 감지 규칙(`BodyAuto`, 기본값): `string` → text/plain; `[]byte` → octet-stream; `map[string]string` → form; `*FormData` → multipart; `io.Reader` → 있는 그대로 전달(Content-Type 설정 안 함); 그 외 타입 → JSON.

### 쿼리 매개변수

```go
httpc.WithQuery("page", 1)
httpc.WithQueryMap(map[string]any{"page": 1, "limit": 10})
// 주의: value가 nil이면 해당 매개변수는 URL에 나타나지 않습니다
```

### 인증

```go
httpc.WithBearerToken(token)
httpc.WithBasicAuth("user", "pass")
```

### Cookie

```go
httpc.WithCookie(http.Cookie{Name: "session", Value: "abc"})
httpc.WithCookies([]http.Cookie{{Name: "a", Value: "1"}, {Name: "b", Value: "2"}})
httpc.WithCookieMap(map[string]string{"session": "abc"})
httpc.WithCookieString("session=abc; token=xyz")
httpc.WithSecureCookie(httpc.StrictCookieSecurityConfig()) // 모든 WithCookie* 뒤에 위치해야 함
```

### 제어

```go
httpc.WithContext(ctx)
httpc.WithTimeout(30 * time.Second)
httpc.WithMaxRetries(3)          // 0이면 재시도 비활성화; 상한 10
httpc.WithFollowRedirects(false) // 리다이렉트 팔로우 금지
httpc.WithMaxRedirects(5)        // 주의: 0은 미설정과 동일(기본값 10으로 폴백), 비활성화는 윗줄 사용
httpc.WithStreamBody(true)       // Download에만 적용(일반 요청의 응답 본문은 여전히 Result에 통째로 읽힘)
httpc.WithAllowPrivateIPs(true)  // 요청별 SSRF 면제(내부망/localhost 접근)
```

### 콜백

```go
httpc.WithOnRequest(func(req httpc.RequestMutator) error {
    log.Printf("전송 %s %s", req.Method(), req.URL())
    return nil
})
httpc.WithOnResponse(func(resp httpc.ResponseMutator) error {
    log.Printf("응답 수신: %d", resp.StatusCode())
    return nil
})
```

## 응답 처리

```go
result.StatusCode()                    // int
result.Body()                          // string
result.RawBody()                       // []byte
result.Proto()                         // "HTTP/1.1"
result.IsSuccess()                     // 2xx
result.IsRedirect()                    // 3xx
result.IsClientError()                 // 4xx
result.IsServerError()                 // 5xx
result.Unmarshal(&data)                // JSON 파싱
result.GetCookie("name")               // 응답 Cookie 가져오기
result.HasCookie("name")               // 응답 Cookie 확인
result.ResponseCookies()               // 모든 응답 Cookie
result.RequestCookies()                // 모든 요청 Cookie
result.GetRequestCookie("name")        // 요청 Cookie 가져오기
result.HasRequestCookie("name")        // 요청 Cookie 확인
result.SaveToFile("/path/to/file")     // 파일로 저장
result.String()                        // 사람이 읽을 수 있는 표현(민감한 헤더 마스킹)
```

```go
// 메타 정보(result.Meta)
result.Meta.Duration       // 총 소요 시간(재시도 대기 포함)
result.Meta.Attempts       // 시도 횟수(첫 시도 포함)
result.Meta.RedirectChain  // 거쳐 간 리다이렉트 URL 체인
result.Meta.RedirectCount  // 리다이렉트 횟수
result.Meta.ProxyURL       // 최종 요청이 사용한 프록시(직접 연결 또는 시스템 프록시면 빈 값)

// 구조체 필드(위의 nil 안전 메서드를 우선 사용)
result.Request.URL            // 요청 URL
result.Request.Method         // 요청 메서드
result.Request.Headers        // 요청 헤더
result.Response.Status        // "200 OK"
result.Response.Headers       // 응답 헤더(http.Header)
result.Response.ContentLength // Content-Length
```

## 설정

```go
cfg := httpc.DefaultConfig()

// 타임아웃
cfg.Timeouts.Request = 30 * time.Second        // 전체 예산(재시도 포함), 기본 180s
cfg.Timeouts.Dial = 10 * time.Second           // TCP 연결, 기본 10s
cfg.Timeouts.TLSHandshake = 10 * time.Second   // TLS 핸드셰이크, 기본 10s
cfg.Timeouts.ResponseHeader = 30 * time.Second // 기본 0(끔); 설정하면 전송 계층 절대 상한이 되어 WithTimeout으로 덮어쓸 수 없음
cfg.Timeouts.IdleConn = 90 * time.Second       // 유휴 연결, 기본 90s

// 연결
cfg.Connection.MaxIdleConns = 50        // 전역 유휴 연결 상한(기본 50, 상한 1000)
cfg.Connection.MaxConnsPerHost = 10     // 호스트당 연결 상한(기본 10, 상한 1000)
cfg.Connection.ProxyURL = "http://proxy:8080"
cfg.Connection.EnableHTTP2 = true
cfg.Connection.EnableCookies = true

// 프록시 풀(회전 + 수동적 서킷 브레이킹)
cfg.Connection.ProxyPool = []string{"http://p1:8080", "http://p2:8080"}
cfg.Connection.ProxyPoolStrategy = httpc.ProxyStrategyRoundRobin // 또는 ProxyStrategyRandom
cfg.Connection.ProxyFailureThreshold = 3   // 연속 실패 N회 시 임시 제외(기본 3)
cfg.Connection.ProxyCooldown = 30 * time.Second // 제외 후 하프 오픈 프로브 쿨다운(기본 30s)
cfg.Connection.ProxyRotatePerRequest = true     // 매 요청마다 IP 교체(연결 재사용 희생)
cfg.Connection.ProxyRotateOnStatus = []int{403} // 상태 코드에 걸리면 프록시를 바꿔 재시도(MaxRetries > 0 필요)

// DNS-over-HTTPS
cfg.Connection.EnableDoH = true
cfg.Connection.DoHCacheTTL = 5 * time.Minute // 기본 5분

// 보안
cfg.Security.MinTLSVersion = tls.VersionTLS12
cfg.Security.MaxTLSVersion = tls.VersionTLS13
cfg.Security.MaxResponseBodySize = 10 * 1024 * 1024      // 기본 10MB
cfg.Security.MaxDecompressedBodySize = 100 * 1024 * 1024 // 기본 100MB(압축 폭탄 방어)
cfg.Security.MaxRequestBodySize = 50 * 1024 * 1024       // 기본 0(업로드 제한 없음)
cfg.Security.AllowPrivateIPs = false
cfg.Security.SSRFExemptCIDRs = []string{"10.0.0.0/8"}
cfg.Security.RedirectWhitelist = []string{"api.example.com"} // 리다이렉트 대상 허용 목록

// 인증서 고정(MITM 방어, 신뢰된 CA가 침해되어도 효과 유지)
pinner, _ := httpc.NewSPKIHashPinner("base64-spki-sha256-hash", "backup-hash") // 다중 해시로 순환 지원
cfg.Security.CertificatePinner = pinner

// 재시도
cfg.Retry.MaxRetries = 3                   // 기본 3; 0이면 비활성화; 상한 10
cfg.Retry.Delay = 1 * time.Second          // 초기 지연, 기본 1s
cfg.Retry.BackoffFactor = 2.0              // 백오프 배수, 기본 2.0(범위 1.0–10.0)
cfg.Retry.MaxRetryDelay = 30 * time.Second // 단일 대기 상한, 기본 30s
cfg.Retry.EnableJitter = true              // 지터, 기본 켜짐
cfg.Retry.CustomPolicy = myPolicy          // 커스텀 정책(ShouldRetry/GetDelay/MaxRetries 구현)
```

## 미들웨어

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: log.Printf}),
    httpc.RecoveryMiddleware(),
    httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),
    httpc.TimeoutMiddleware(&httpc.TimeoutMiddlewareConfig{Duration: 30 * time.Second}),
    httpc.MetricsMiddleware(&httpc.MetricsConfig{
        OnMetrics: func(method, url string, statusCode int, duration time.Duration, err error) {
            metrics.Record(method, statusCode, duration)
        },
    }),
    httpc.AuditMiddleware(&httpc.AuditConfig{
        OnAudit: func(event httpc.AuditEvent) {
            log.Printf("[AUDIT] %s %s -> %d", event.Method, event.URL, event.StatusCode)
        },
    }),
    httpc.HeaderMiddleware(&httpc.HeaderConfig{ // 정적 헤더(생성 시점에 CRLF 검증)
        Headers: map[string]string{"X-Service": "api"},
    }),
}
```

```go
// 커스텀 미들웨어: 요청 단계는 next 이전(등록 순서), 응답 단계는 next 이후(역순)
func traceMiddleware(next httpc.Handler) httpc.Handler {
    return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
        req.SetHeader("X-Trace", "on") // 요청 단계
        resp, err := next(ctx, req)    // 내부로 전달
        if resp != nil {
            log.Printf("-> %d", resp.StatusCode()) // 응답 단계
        }
        return resp, err
    }
}
// 등록: cfg.Middleware.Middlewares = append(cfg.Middleware.Middlewares, traceMiddleware)
// 조합: httpc.Chain(mw1, mw2)(finalHandler)
```

:::warning 주의
`TimeoutMiddleware`는 `Download`나 `WithStreamBody(true)` 요청에 사용하지 마세요(응답 헤더를 받는 즉시 컨텍스트가 취소되어 응답 본문 읽기에서 "context canceled" 발생). 이런 시나리오에는 `WithTimeout`을 사용하세요.
:::

## 오류 처리

```go
result, err := client.Get(url)
if err != nil {
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        switch clientErr.Type {
        case httpc.ErrorTypeTimeout:
            // 타임아웃
        case httpc.ErrorTypeNetwork:
            // 네트워크 오류
        case httpc.ErrorTypeTLS:
            // TLS 오류
        case httpc.ErrorTypeDNS:
            // DNS 해석 오류
        case httpc.ErrorTypeContextCanceled:
            // 컨텍스트 취소
        case httpc.ErrorTypeRetryExhausted:
            // 재시도 소진
        case httpc.ErrorTypeValidation:
            // 요청 검증 오류
        case httpc.ErrorTypeHTTP:
            // HTTP 계층 오류
        // 기타: ErrorTypeUnknown, ErrorTypeResponseRead,
        //       ErrorTypeTransport, ErrorTypeCertificate
        }
        if clientErr.IsRetryable() {
            // 재시도 가능
        }
    }
}
```

```go
// 오류 짧은 코드(ClientError.Code())
switch clientErr.Code() {
case "TIMEOUT":           // 타임아웃
case "NETWORK_ERROR":     // 네트워크 오류
case "TLS_ERROR":         // TLS 핸드셰이크/프로토콜 오류
case "CERTIFICATE_ERROR": // 인증서 검증 오류
case "DNS_ERROR":         // DNS 해석 오류
case "CONTEXT_CANCELED":  // 컨텍스트 취소
case "RETRY_EXHAUSTED":   // 재시도 소진
case "VALIDATION_ERROR":  // 요청 검증 오류(CRLF/잘못된 헤더 등)
case "HTTP_ERROR":        // HTTP 계층 오류
case "TRANSPORT_ERROR", "RESPONSE_READ_ERROR", "UNKNOWN_ERROR":
}

// 센티널 오류(errors.Is)
errors.Is(err, httpc.ErrClientClosed)         // 닫힌 클라이언트 사용
errors.Is(err, httpc.ErrResponseBodyEmpty)    // Unmarshal 빈 응답 본문
errors.Is(err, httpc.ErrResponseBodyTooLarge) // 파싱 본문 50MB 초과
errors.Is(err, httpc.ErrFileExists)           // 다운로드 대상이 이미 존재하고 Overwrite/Resume이 꺼져 있음
errors.Is(err, httpc.ErrEmptyFilePath)        // DownloadConfig.FilePath 미설정

// 재시도 가능성 빠른 판정
// 항상 재시도 가능: 타임아웃, 전송 오류
// 원인에 따라: 네트워크 오류, DNS(일시적/타임아웃), HTTP 408/429/500/502/503/504
// 항상 재시도 불가: 컨텍스트 취소, 검증 오류, TLS, 인증서 오류
```

## 파일 다운로드

```go
// 기본 다운로드(ctx는 context.Context, 예: context.Background())
dlCfg := httpc.DefaultDownloadConfig()
dlCfg.FilePath = "/path/to/file"
dlResult, err := client.Download(ctx, url, dlCfg)

// 옵션 포함(덮어쓰기, 이어받기, 진행률)
dlCfg := httpc.DefaultDownloadConfig()
dlCfg.FilePath = "/path/to/file"
dlCfg.Overwrite = true
dlCfg.ResumeDownload = true
dlCfg.ProgressCallback = func(downloaded, total int64, speed float64) {
    fmt.Printf("\r%.1f%% (%.2f MB/s)", float64(downloaded)/float64(total)*100, float64(speed)/1024/1024)
}
dlResult, err := client.Download(ctx, url, dlCfg)

// 체크섬 검증(다운로드 완료 후 검사, 불일치 시 실패하고 파일 삭제)
dlCfg.Checksum = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
dlCfg.ChecksumAlgorithm = httpc.ChecksumSHA256 // 현재는 sha256만 지원

// 패키지 수준 다운로드(기본 클라이언트 사용)
dlResult, err := httpc.Download(ctx, url, dlCfg)

// dlResult 타입은 *DownloadResult(*Result가 아님)
// 필드: FilePath, BytesWritten, Duration, AverageSpeed, StatusCode, ContentLength, Resumed, ResponseCookies, ActualChecksum
```

## 도메인 클라이언트

```go
dc, _ := httpc.NewDomainDefault("https://api.example.com")
defer dc.Close()

dc.SetHeader("Authorization", "Bearer "+token)
result, _ := dc.Get("/users")
```

```go
// 세션 헤더 / Cookie 관리
dc.SetHeaders(map[string]string{"Authorization": "Bearer " + token, "Accept": "application/json"})
dc.DeleteHeader("Authorization")
dc.ClearHeaders()
dc.SetCookie(&http.Cookie{Name: "session", Value: "abc"}) // 응답 Set-Cookie도 세션에 자동 기록
dc.GetCookie("session")
dc.ClearCookies()
dc.URL()     // "https://api.example.com"
dc.Domain()  // "api.example.com"
dc.Session() // *SessionManager(스레드 안전)

// URL 조합: 상대 경로는 base 기반; 완전한 URL은 그대로 사용; base 경로를 벗어나면 오류
result, _ = dc.Get("/repos/golang/go")       // https://api.example.com/repos/golang/go
result, _ = dc.Get("https://other.host/api") // 그대로 통과

// 세션 관리자는 단독으로도 사용 가능
sm, _ := httpc.NewSessionManagerDefault()
sm.SetHeader("X-App", "demo")
sm.UpdateFromResult(result) // 응답에서 Set-Cookie 추출
```

:::warning 옵션이 두 번 실행됨
`DomainClient`의 요청 옵션은 내부에서 두 번 적용됩니다(세션 캡처 + 실제 요청). 부수 효과가 있는 옵션(카운터, 일회용 nonce)은 넣지 마세요.
:::

## 시나리오 빠른 매칭

```go
// 요청 수준 타임아웃(인스턴스 설정 덮어쓰기)
result, err := client.Get(url, httpc.WithTimeout(30*time.Second))

// 긴 응답 인터페이스(AI/대형 모델 API): 전체 타임아웃 기본 180s, 여유 있게 조정 가능
result, err := httpc.Post(url,
    httpc.WithJSON(payload),
    httpc.WithTimeout(900*time.Second),
)

// 이번 요청 재시도 비활성화 / 재시도 상한 올리기
httpc.WithMaxRetries(0)
httpc.WithMaxRetries(5)

// 리다이렉트 금지 / 횟수 제한
httpc.WithFollowRedirects(false)
httpc.WithMaxRedirects(3)

// 내부망 서비스 접근(요청별 SSRF 면제)
result, err := httpc.Get("http://10.0.0.5:8080/health",
    httpc.WithAllowPrivateIPs(true),
)

// 취소와 데드라인 제어
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()
result, err := httpc.Request(ctx, "GET", url)

// JSON 업로드 + 인증 + 타임아웃 한 번에
result, err := httpc.Post("https://api.example.com/orders",
    httpc.WithJSON(order),
    httpc.WithBearerToken(token),
    httpc.WithTimeout(15*time.Second),
)
```
