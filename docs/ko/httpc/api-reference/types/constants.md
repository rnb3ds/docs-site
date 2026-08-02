---
sidebar_label: "상수와 타입"
title: "상수와 타입 - CyberGo HTTPC | 상수와 보조 타입"
description: "HTTPC 상수와 보조 타입 API 레퍼런스: BodyKind 6가지 요청 본문 열거와 자동 감지 규칙, ProxyStrategy 프록시 전략, FormData와 FileData 파일 업로드 타입, AuditEvent 감사 이벤트 구조체, AuditConfig 감사 구성과 SourceIPKey 등 컨텍스트 키 정의."
sidebar_position: 2
---

# 상수와 타입

이 페이지는 HTTPC의 모든 공개 상수와 보조 타입을 모았으며, 요청 본문 타입 열거, 프록시 전략, 폼/파일 업로드 타입, 검증 알고리즘, 감사 이벤트, 포맷 도구 함수, 진행률 콜백과 Cookie 보안 구성을 포함합니다.

## BodyKind

```go
type BodyKind int
```

요청 본문 타입으로, `WithBody`에서 요청 본문 형식을 지정하는 데 사용합니다.

| 상수 | 값 | 의미 | 입력 요구사항 | 대응 Content-Type |
|------|-----|------|---------------|-------------------|
| `BodyAuto` | 0 | 자동 감지 | 임의(타입에 따라 추론) | 아래 감지 규칙 표 참조 |
| `BodyJSON` | 1 | JSON 강제 인코딩 | 직렬화 가능 타입 | application/json |
| `BodyXML` | 2 | XML 강제 인코딩 | 직렬화 가능 타입 | application/xml |
| `BodyForm` | 3 | 폼 인코딩 | `map[string]string` 또는 호환 타입 | application/x-www-form-urlencoded |
| `BodyBinary` | 4 | 바이너리 스트림 | `[]byte` 또는 `string` | application/octet-stream |
| `BodyMultipart` | 5 | 멀티파트 폼 | `*FormData` | multipart/form-data |

### BodyAuto 자동 감지 규칙

`BodyAuto`(기본값)는 입력 데이터의 Go 타입에 따라 요청 본문 형식과 Content-Type을 자동으로 추론합니다:

| 입력 Go 타입 | 추론 형식 | Content-Type |
|--------------|-----------|-------------|
| `string` | 순수 텍스트 | text/plain; charset=utf-8 |
| `[]byte` | 바이너리 스트림 | application/octet-stream |
| `map[string]string` | 폼 | application/x-www-form-urlencoded |
| `*FormData` | 멀티파트 폼 | multipart/form-data |
| `io.Reader` | 원래대로 투과 | 설정하지 않음(호출자가 지정) |
| 기타 타입 | JSON 직렬화 | application/json |

:::tip BodyAuto vs 명시적 지정
대부분의 시나리오에서 `BodyAuto`로 충분합니다. 자동 추론이 예상과 다를 때(예: struct를 JSON이 아닌 XML로 전송), `BodyJSON`/`BodyXML`/`BodyForm` 등을 명시적으로 전달하여 인코딩 형식을 강제할 수 있습니다.
:::

```go
// 자동 감지(기본값)
result, _ := client.Post(url, httpc.WithBody(data))

// JSON 강제(data가 map[string]string이어도 JSON으로 인코딩)
result, _ := client.Post(url, httpc.WithBody(data, httpc.BodyJSON))

// XML 강제
result, _ := client.Post(url, httpc.WithBody(data, httpc.BodyXML))
```

## ProxyStrategy

```go
type ProxyStrategy = proxypool.Strategy
```

프록시 풀 선택 전략으로, `ConnectionConfig.ProxyPoolStrategy`에서 사용합니다. 내부 패키지 임포트를 피하기 위한 내부 `proxypool.Strategy`의 타입 별칭입니다.

| 상수 | 설명 | 재시도 동작 |
|------|------|-------------|
| `ProxyStrategyRoundRobin` | 라운드 로빈(기본값). 순서대로 프록시를 순환 선택하며, 매 선택마다 다음으로 진행 | 재시도 시 자연스럽게 다른 IP로 떨어지며, 추가 구성 불필요 |
| `ProxyStrategyRandom` | 무작위. 건강한 프록시 중에서 균일하게 무작위 선택 | 재시도 시 무작위 선택, 통계적으로 IP 교체에 유리 |

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyPool = []string{
    "http://proxy1:8080",
    "http://proxy2:8080",
}
cfg.Connection.ProxyPoolStrategy = httpc.ProxyStrategyRoundRobin
client, _ := httpc.New(cfg)
```

:::tip 상태 코드로 순환 트리거
`ProxyRotateOnStatus`(예: `[]int{403}`)와 함께 사용하여 특정 상태 코드 수신 시 재시도+프록시 순환을 트리거할 수 있으며, CF/WAF 등 IP 차원의 차단을 우회하는 데 적합합니다. 자세한 내용은 [구성 레퍼런스](../client-config/config)를 참조하세요.
:::

## FormData / FileData

### FormData

```go
type FormData struct {
    Fields map[string]string    // 일반 폼 필드
    Files  map[string]*FileData // 파일 필드
}
```

`BodyMultipart` 모드의 멀티파트 폼 데이터에 사용합니다. `Fields`는 키-값 쌍을, `Files`는 파일을 저장합니다. 내부 `types.FormData`의 타입 별칭입니다.

### FileData

```go
type FileData struct {
    Filename    string // 파일 이름
    Content     []byte // 파일 내용
    ContentType string // MIME 타입, 예: "image/png", "application/pdf"
}
```

내부 `types.FileData`의 타입 별칭입니다.

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
		log.Fatalf("클라이언트 생성 실패: %v", err)
	}
	defer func() { _ = client.Close() }()

	form := &httpc.FormData{
		Fields: map[string]string{
			"username": "alice",
			"title":    "profile photo",
		},
		Files: map[string]*httpc.FileData{
			"avatar": {
				Filename:    "photo.png",
				Content:     []byte("\x89PNG..."), // 실제 사용 시 os.ReadFile로 읽기
				ContentType: "image/png",
			},
		},
	}

	result, err := client.Post("https://httpbin.org/post", httpc.WithFormData(form))
	if err != nil {
		log.Fatalf("업로드 실패: %v", err)
	}

	fmt.Println("업로드 완료, 상태 코드:", result.StatusCode())
}
```

## ChecksumAlgorithm

```go
type ChecksumAlgorithm string

const ChecksumSHA256 ChecksumAlgorithm = "sha256"
```

다운로드 검증 알고리즘. 현재 `"sha256"`만 지원합니다. `DownloadConfig.ChecksumAlgorithm`에 사용되며, `DefaultDownloadConfig()`에서 기본적으로 `ChecksumSHA256`으로 설정됩니다. 지원하지 않는 알고리즘을 전달하면 다운로드 시작 전에 `"unsupported checksum algorithm"` 오류를 반환합니다.

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/archive.zip"
cfg.Checksum = "e3b0c44298fc1c149afbf4c8996fb924..." // 예상되는 SHA-256 16진수 값
cfg.ChecksumAlgorithm = httpc.ChecksumSHA256
```

## AuditEvent

```go
type AuditEvent struct {
    Timestamp     time.Time           `json:"timestamp"`
    Method        string              `json:"method"`
    URL           string              `json:"url"`           // 마스킹됨(자격 증명 제거)
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

보안 감사 이벤트로, `AuditMiddleware`가 매 요청/응답 주기 완료 후 생성합니다. 금융, 의료, 정부 등 고규정 준수 시나리오를 위해 설계되었으며, 완전한 요청/응답 컨텍스트를 캡처합니다.

| 필드 | 타입 | 설명 |
|------|------|------|
| `Timestamp` | `time.Time` | 요청 시작 시간 |
| `Method` | `string` | HTTP 메서드 |
| `URL` | `string` | 요청 URL(마스킹됨, 자격 증명 제거) |
| `StatusCode` | `int` | 응답 상태 코드(응답 없을 시 0) |
| `Duration` | `time.Duration` | 요청 총 소요 시간 |
| `Attempts` | `int` | 시도 횟수(재시도 포함) |
| `Error` | `error` | 오류 객체(SanitizeError로 마스킹 가능) |
| `SourceIP` | `string` | 소스 IP(context에서 추출) |
| `UserID` | `string` | 사용자 ID(context에서 추출) |
| `RedirectChain` | `[]string` | 리다이렉트 체인 |
| `ReqHeaders` | `map[string][]string` | 요청 헤더(IncludeHeaders=true 필요) |
| `RespHeaders` | `map[string][]string` | 응답 헤더(IncludeHeaders=true 필요) |

### MarshalJSON 커스텀 직렬화

`AuditEvent`는 커스텀 JSON 직렬화를 구현하여, JSON 친화적인 두 가지 파생 필드를 제공합니다:

| JSON 필드 | 출처 | 설명 |
|-----------|------|------|
| `durationMs` | `Duration.Milliseconds()` | 밀리초 정수, 로그 집계 도구에서 파싱하기 편리 |
| `error` | `Error.Error()` | 오류 문자열(error 인터페이스의 기본 직렬화 대체) |

이렇게 JSON 출력에는 원본 `duration`(나노초)과 읽기 쉬운 `durationMs`(밀리초)가 모두 포함되며, `error` 필드는 빈 객체가 아닌 문자열로 출력됩니다.

### AuditConfig

```go
type AuditConfig struct {
    OnAudit        func(event AuditEvent) // 감사 콜백, nil일 때 미들웨어는 무작업
    Format         string                 // "text" 또는 "json"
    IncludeHeaders bool                   // 요청/응답 헤더 포함
    MaskHeaders    []string               // 마스킹할 헤더 이름(예: "Authorization", "Cookie")
    SanitizeError  bool                   // 오류 정보 마스킹("[sanitized]"로 대체)
}
```

`DefaultAuditConfig()`는 기본값을 제공합니다: `Format="text"`, `IncludeHeaders=false`, `MaskHeaders=민감한 헤더 목록`(Authorization/Cookie 등), `SanitizeError=true`.

## 컨텍스트 키

| 상수 | 값 | 설명 |
|------|-----|------|
| `SourceIPKey` | `"source_ip"` | 감사 이벤트의 소스 IP 주소 |
| `UserIDKey` | `"user_id"` | 감사 이벤트의 사용자 식별자 |

이 두 키의 타입은 `auditContextKey`(비내보내기 문자열 타입)이며, `context.WithValue`로 감사 정보를 전달하는 데 사용됩니다. `AuditMiddleware`가 `ctx.Value(httpc.SourceIPKey)`와 `ctx.Value(httpc.UserIDKey)`로 이 값을 추출하여 `AuditEvent`에 채웁니다.

```go
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/cybergodev/httpc"
)

func main() {
	// context로 감사 정보 전달
	ctx := context.WithValue(context.Background(), httpc.SourceIPKey, "192.168.1.100")
	ctx = context.WithValue(ctx, httpc.UserIDKey, "user-789")

	// 감사 미들웨어 구성
	auditCfg := httpc.DefaultAuditConfig()
	auditCfg.Format = "json"
	auditCfg.IncludeHeaders = true
	auditCfg.OnAudit = func(event httpc.AuditEvent) {
		fmt.Printf("[AUDIT] %s %s -> %d (%v) src=%s user=%s\n",
			event.Method, event.URL, event.StatusCode,
			event.Duration, event.SourceIP, event.UserID)
	}

	cfg := httpc.DefaultConfig()
	cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
		httpc.AuditMiddleware(auditCfg),
	}
	client, err := httpc.New(cfg)
	if err != nil {
		log.Fatalf("클라이언트 생성 실패: %v", err)
	}
	defer func() { _ = client.Close() }()

	// context의 SourceIP/UserID가 미들웨어에서 감사 이벤트로 추출됨
	result, err := client.Request(ctx, "GET", "https://httpbin.org/get")
	if err != nil {
		log.Fatalf("요청 실패: %v", err)
	}
	fmt.Println("상태 코드:", result.StatusCode())
}
```

## FormatBytes / FormatSpeed

### FormatBytes

```go
func FormatBytes(bytes int64) string
```

바이트 수를 사람이 읽을 수 있는 문자열로 포맷합니다. 이진 단위(1024진법)를 사용하며, 1024 미만일 때는 정수로 표시하고 그렇지 않으면 소수점 둘째 자리까지 표시합니다.

| 입력 | 출력 |
|------|------|
| `512` | `"512 B"` |
| `1536` | `"1.50 KB"` |
| `1572864` | `"1.50 MB"` |
| `1073741824` | `"1.00 GB"` |

단위 체인: B → KB → MB → GB → TB → PB → EB.

### FormatSpeed

```go
func FormatSpeed(bytesPerSecond float64) string
```

바이트 속도를 사람이 읽을 수 있는 문자열로 포맷합니다. 단위는 FormatBytes와 동일하지만 `/s` 접미사가 추가됩니다.

| 입력 | 출력 |
|------|------|
| `512.0` | `"512 B/s"` |
| `1572864.0` | `"1.50 MB/s"` |

다운로드 진행률 콜백에서 속도 표시에 자주 사용됩니다.

```go
speed := httpc.FormatSpeed(1572864.0) // "1.50 MB/s"
size := httpc.FormatBytes(1572864)    // "1.50 MB"
```

## DownloadProgressCallback

```go
type DownloadProgressCallback func(downloaded, total int64, speed float64)
```

다운로드 진행률 콜백 함수 시그니처로, `DownloadConfig.ProgressCallback`에 사용됩니다.

| 매개변수 | 타입 | 설명 |
|-----------|------|------|
| `downloaded` | `int64` | 다운로드된 바이트 수(이어받기 시 이미 이어받은 부분 포함) |
| `total` | `int64` | 전체 바이트 수(서버가 Content-Length를 반환하지 않은 경우 -1) |
| `speed` | `float64` | 현재 다운로드 속도(바이트/초), `FormatSpeed`에 직접 전달 가능 |

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/large.zip"
cfg.ProgressCallback = func(downloaded, total int64, speed float64) {
	if total > 0 {
		pct := float64(downloaded) / float64(total) * 100
		fmt.Printf("\r%.1f%%  %s / %s  %s",
			pct,
			httpc.FormatBytes(downloaded),
			httpc.FormatBytes(total),
			httpc.FormatSpeed(speed),
		)
	}
}
```

## CookieSecurityConfig

```go
type CookieSecurityConfig = validation.CookieSecurityConfig
```

Cookie 보안 속성 검증 구성입니다. 내부 `validation.CookieSecurityConfig`의 타입 별칭으로, SessionManager와 `WithSecureCookie` 요청 옵션에 사용됩니다.

```go
type CookieSecurityConfig struct {
    RequireSecure                bool    // Secure 속성 요구(HTTPS 전송만)
    RequireHttpOnly              bool    // HttpOnly 속성 요구(XSS 도용 방지)
    RequireSameSite              string  // SameSite 값 요구: "Strict"/"Lax"/"None"/""
    AllowSameSiteNone            bool    // SameSite=None 허용 여부
    RequireSecureForSameSiteNone bool    // SameSite=None일 때 Secure 강제 요구
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `RequireSecure` | `bool` | Secure 속성 요구, HTTPS로만 전송. 프로덕션 환경에서 true 권장 |
| `RequireHttpOnly` | `bool` | HttpOnly 속성 요구, JS 접근 금지, XSS 방지. 세션 Cookie에 true 권장 |
| `RequireSameSite` | `string` | SameSite 값 요구. `"Strict"`(퍼스트 파티만), `"Lax"`(퍼스트 파티+탑 레벨 내비게이션), `"None"`(모든 컨텍스트, Secure 필요), `""`(요구 없음) |
| `AllowSameSiteNone` | `bool` | SameSite=None 허용 여부. false이고 RequireSameSite가 비어 있을 때 SameSite=None인 Cookie 거부 |
| `RequireSecureForSameSiteNone` | `bool` | SameSite=None일 때 Secure 강제 요구(RFC 6265bis 준수). 기본값 true |

사용 가능한 팩토리 함수:

| 팩토리 함수 | 정책 | 적용 시나리오 |
|-------------|------|---------------|
| `DefaultCookieSecurityConfig()` | 느슨함: 비 HTTPS 허용, JS 접근 허용, SameSite=None 허용 | 개발 환경, 호환성 우선 |
| `StrictCookieSecurityConfig()` | 엄격함: Secure + HttpOnly + SameSite=Strict 요구 | 프로덕션 환경, 고보안 시나리오(금융/의료/정부) |

```go
// 엄격 정책: Secure + HttpOnly + SameSite=Strict 요구
strict := httpc.StrictCookieSecurityConfig()

// 커스텀 정책: HttpOnly 요구, SameSite=Lax 허용
custom := &httpc.CookieSecurityConfig{
    RequireHttpOnly: true,
    RequireSameSite: "Lax",
    AllowSameSiteNone: false,
}

// SessionManager에 적용
sm.SetCookieSecurity(strict)

// 또는 단일 요청의 Cookie 검증에 적용
result, err := client.Get(url, httpc.WithSecureCookie(strict))
```

:::warning WithSecureCookie 순서 민감
`WithSecureCookie`는 **적용 시점에 이미 존재하는** Cookie만 검증합니다. 반드시 모든 `WithCookie`/`WithCookieMap` 이후에 배치해야 합니다. 순서 무관한 세션 수준 검증이 필요하면 `SessionManager.SetCookieSecurity`를 사용하세요.
:::

## 참고

- [오류 타입](./errors) - ClientError, ErrorType과 오류 변수의 완전한 레퍼런스
- [요청 옵션](../core/options) - BodyKind의 WithBody 사용
- [미들웨어](../client-config/middleware) - AuditMiddleware와 감사 구성
- [세션 관리](../client-config/session) - SessionManager와 CookieSecurityConfig의 세션 수준 사용
