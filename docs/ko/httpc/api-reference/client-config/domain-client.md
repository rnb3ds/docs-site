---
sidebar_label: "도메인 클라이언트"
title: "도메인 클라이언트 - CyberGo HTTPC | NewDomain과 세션"
description: "HTTPC 도메인 클라이언트 API 레퍼런스: NewDomain 생성 함수, 7가지 HTTP 메서드와 Request 범용 메서드, URL 자동 조합 규칙, DomainClienter 인터페이스의 SetHeader/SetCookie 세션 관리와 Close 수명 주기."
sidebar_position: 2
---

# 도메인 클라이언트

도메인 클라이언트(`DomainClient`)는 특정 도메인에 대한 요청 관리를 제공하며, Cookie와 요청 헤더를 자동으로 유지합니다. 이는 일반 `Client`가 여러 요청 간에 인증 헤더를 수동으로 전달하고 Cookie를 추적해야 하는 고통을 해결합니다 — 세션 상태가 각 요청에 자동으로 주입되고, 응답 Cookie가 자동으로 캡처됩니다.

```text
DomainClient 아키텍처
├── client         하위 Client(연결 풀, 미들웨어 체인 재사용)
├── baseURL        도메인 스코프(예: https://api.example.com/v1)
├── parsedURL      해석 결과 캐시(매 요청마다 url.Parse 반복 방지)
├── domain         호스트 이름(포트 제외)
└── SessionManager 세션 상태
      ├── headers  map[string]string  세션 수준 요청 헤더
      └── cookies  map[string]*Cookie 세션 수준 Cookie
```

## DomainClienter 인터페이스

```go
type DomainClienter interface {
    Client

    URL() string
    Domain() string

    SetHeader(key, value string) error
    SetHeaders(headers map[string]string) error
    DeleteHeader(key string)
    ClearHeaders()
    GetHeaders() map[string]string

    SetCookie(cookie *http.Cookie) error
    SetCookies(cookies []*http.Cookie) error
    DeleteCookie(name string)
    ClearCookies()
    GetCookies() []*http.Cookie
    GetCookie(name string) *http.Cookie

    Session() *SessionManager
}
```

`DomainClienter`는 `Client` 인터페이스(`Get`/`Post`/`Put`/`Patch`/`Delete`/`Head`/`Options`/`Request`/`Download`/`Close` 포함)와 세션 관리 메서드를 동시에 구현합니다. 테스트와 구현 교체를 위해 구체적 타입이 아닌 인터페이스 타입 사용을 권장합니다.

### 완전한 메서드 표

#### HTTP 요청 메서드(Client에서 상속)

| 메서드 | 시그니처 | 설명 |
|--------|---------|------|
| `Get` | `(path string, opts ...RequestOption) (*Result, error)` | GET 요청 |
| `Post` | `(path string, opts ...RequestOption) (*Result, error)` | POST 요청 |
| `Put` | `(path string, opts ...RequestOption) (*Result, error)` | PUT 요청 |
| `Patch` | `(path string, opts ...RequestOption) (*Result, error)` | PATCH 요청 |
| `Delete` | `(path string, opts ...RequestOption) (*Result, error)` | DELETE 요청 |
| `Head` | `(path string, opts ...RequestOption) (*Result, error)` | HEAD 요청 |
| `Options` | `(path string, opts ...RequestOption) (*Result, error)` | OPTIONS 요청 |
| `Request` | `(ctx, method, path string, opts ...RequestOption) (*Result, error)` | 컨텍스트 포함 범용 요청 |
| `Download` | `(ctx, path string, cfg *DownloadConfig, opts ...RequestOption) (*DownloadResult, error)` | 파일 다운로드 |
| `Close` | `() error` | 클라이언트 닫기, 자원 해제 |

#### URL 접근 메서드

| 메서드 | 반환 타입 | 설명 |
|--------|-----------|------|
| `URL()` | `string` | 기본 URL(생성 시 전달된 `baseURL`) |
| `Domain()` | `string` | 도메인(호스트 이름, 포트 제외) |
| `Session()` | `*SessionManager` | 하위 세션 관리자 |

#### 세션 헤더 관리

| 메서드 | 설명 |
|--------|------|
| `SetHeader(key, value string) error` | 단일 세션 헤더 설정(CRLF 안전성 검증) |
| `SetHeaders(headers map[string]string) error` | 세션 헤더 일괄 설정 |
| `DeleteHeader(key string)` | 단일 세션 헤더 삭제 |
| `ClearHeaders()` | 모든 세션 헤더 비우기 |
| `GetHeaders() map[string]string` | 세션 헤더 사본 획득 |

#### 세션 Cookie 관리

| 메서드 | 설명 |
|--------|------|
| `SetCookie(cookie *http.Cookie) error` | 단일 세션 Cookie 설정 |
| `SetCookies(cookies []*http.Cookie) error` | 세션 Cookie 일괄 설정 |
| `DeleteCookie(name string)` | 이름으로 Cookie 삭제 |
| `ClearCookies()` | 모든 Cookie 비우기 |
| `GetCookies() []*http.Cookie` | 모든 Cookie 사본 획득 |
| `GetCookie(name string) *http.Cookie` | 이름으로 Cookie 사본 획득 |

## NewDomain

```go
func NewDomain(baseURL string, cfg Config) (DomainClienter, error)
```

도메인 스코프 클라이언트를 생성합니다. Cookie가 자동으로 활성화됩니다. `Config` 값을 전달하거나, `NewDomainDefault(baseURL)`를 제로 인수 단축으로 사용하세요.

```go
// 기본 구성 사용(또는 NewDomainDefault 호출과 동일한 효과)
dc, err := httpc.NewDomain("https://api.example.com", httpc.DefaultConfig())
if err != nil {
    log.Fatal(err)
}
defer dc.Close()

// 커스텀 구성 사용
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 60 * time.Second
dc, err := httpc.NewDomain("https://api.example.com", cfg)
if err != nil {
    log.Fatal(err)
}
defer dc.Close()
```

**매개변수 설명:**

| 매개변수 | 타입 | 설명 |
|-----------|------|------|
| `baseURL` | `string` | 기본 URL(scheme과 host 포함 필수) |
| `cfg` | `Config` | 구성 값(`DefaultConfig()` 또는 프리셋 함수로 획득 권장) |

**반환값:** `DomainClienter` 인터페이스(구체적 타입 `*DomainClient`가 아님).

**오류 조건:**

| 조건 | 오류 메시지 |
|------|-------------|
| `baseURL`에 scheme 또는 host 누락 | `base URL must include scheme and host` |
| 구성 검증 실패 | `invalid configuration: ...` |

:::tip Cookie 자동 활성화
`NewDomain`은 내부적으로 `cfg.Connection.EnableCookies = true`를 강제 설정하며, 전달한 `cfg`의 Cookie 활성화 여부와 무관합니다. 이는 도메인 클라이언트의 핵심 가치가 요청 간 Cookie 세션 유지이기 때문입니다.
:::

## NewDomainDefault

```go
func NewDomainDefault(baseURL string) (DomainClienter, error)
```

편의 생성자로, `NewDomain(baseURL, DefaultConfig())`와 동일합니다.

```go
dc, err := httpc.NewDomainDefault("https://api.example.com")
if err != nil {
    log.Fatal(err)
}
defer dc.Close()
```

## HTTP 메서드

모든 메서드는 상대 경로 또는 절대 URL을 허용합니다:

```go
// 상대 경로: baseURL과 자동 조합
result, err := dc.Get("/users")
result, err := dc.Post("/users", httpc.WithJSON(data))
result, err := dc.Put("/users/1", httpc.WithJSON(data))
result, err := dc.Patch("/users/1", httpc.WithJSON(data))
result, err := dc.Delete("/users/1")
result, err := dc.Head("/users/1")
result, err := dc.Options("/users")

// 절대 URL: 그대로 사용
result, err := dc.Get("https://other-api.com/data")
```

### Request

```go
result, err := dc.Request(ctx, "GET", "/users", options...)
```

컨텍스트가 포함된 범용 요청 메서드로, 타임아웃과 취소 제어를 지원합니다. `DomainClient`는 이 메서드를 구현하여 `Client` 인터페이스를 만족합니다.

## URL 조합 규칙 상세

`buildURL` 메서드는 요청 경로를 `baseURL`과 조합합니다. 규칙은 다음과 같습니다:

```text
buildURL(pathStr):

  ① pathStr이 비어 있음 → baseURL 반환
  ② pathStr이 http:// 또는 https://로 시작 → 절대 URL, 직접 반환
  ③ 그 외 → 상대 경로 조합:
       a. 캐시된 parsedURL 클론(원본 수정 방지)
       b. pathStr 해석으로 path / query / fragment 분리
       c. result.Path = path.Join(basePath, parsedPath)
       d. 후행 슬래시 보존: 원래 경로가 /로 끝나면 조합 결과도 /로 끝음
       e. 경로 트래버설 방어: 결과가 base 경로 스코프 내에 있어야 함
       f. 쿼리 매개변수 병합: base 쿼리 매개변수 + path 쿼리 매개변수
       g. fragment 투과
```

### 조합 예시

| 입력 경로 | 조합 결과(baseURL = `https://api.example.com/v1`) |
|-----------|------|
| `""` | `https://api.example.com/v1` |
| `/users` | `https://api.example.com/v1/users` |
| `users` | `https://api.example.com/v1/users` |
| `/users/` | `https://api.example.com/v1/users/`(후행 슬래시 보존) |
| `/users?page=1` | `https://api.example.com/v1/users?page=1` |
| `search?q=go` | `https://api.example.com/v1/search?q=go` |
| `https://other.com/api` | `https://other.com/api`(절대 URL 직접 사용) |

### 쿼리 매개변수 병합

`baseURL` 자체에 쿼리 매개변수가 있을 때, 요청 경로의 쿼리 매개변수는 그 뒤에 **추가**됩니다:

```text
baseURL  = https://api.example.com/v1?lang=zh
path     = /users?page=1
조합 결과 = https://api.example.com/v1/users?lang=zh&page=1
```

### 경로 트래버설 방어

`buildURL`은 조합 후 경로가 base 경로 스코프 내에 있는지 검사하여 경로 트래버설 공격을 방지합니다:

```text
baseURL = https://api.example.com/v1
path    = ../admin/delete       ← path.Join 정리 후 /admin/delete

검사: /admin/delete가 /v1 스코프 내에 있는가?
결과: 아니오 → 오류 "path escapes base URL scope" 반환
```

:::warning 절대 URL 식별
`http://`와 `https://`로 시작하는 경로만 절대 URL로 식별됩니다; 다른 프로토콜(예: `ftp://`)은 절대 경로로 식별되지 않고 상대 경로로 조합되어, 일반적으로 요청 실패를 초래합니다. base 경로가 비어 있거나 `/`일 때는 스코프 검사를 하지 않습니다.
:::

## 세션 자동 관리

도메인 클라이언트의 세션 관리는 세 가지 단계로 나뉩니다:

```text
요청 수명 주기에서의 세션 관리:

  ① prepareOptions()(전송 전)
     SessionManager에서 세션 헤더와 Cookie 읽기
     → RequestOption으로 변환하여 요청에 주입

  ② captureFromOptions()(전송 전)
     사용자가 전달한 RequestOption에서 Cookie와 헤더 추출
     → SessionManager에 저장(있으면 업데이트, 없으면 건너뜀)

  ③ UpdateFromResult()(전송 후)
     응답에서 Set-Cookie 추출
     → SessionManager에 저장
```

```go
dc, _ := httpc.NewDomainDefault("https://api.example.com")

// 세션 헤더: 이후의 모든 요청에 주입
dc.SetHeader("Authorization", "Bearer token-abc")
dc.SetHeader("Accept-Language", "zh-CN")

// 로그인 후 응답의 Set-Cookie 자동 캡처
dc.Post("/login", httpc.WithJSON(loginData))
// 이후 요청은 로그인 Cookie 자동 휴대

// 수동으로 Cookie 설정도 가능
dc.SetCookie(&http.Cookie{Name: "session", Value: "xyz"})

// 세션 상태 조회
dc.GetCookie("session")  // → *http.Cookie 사본
dc.GetHeaders()          // → map[string]string 사본
```

:::tip 스레드 안전성
`SessionManager`는 내부적으로 `sync.RWMutex`로 보호되며, `SetHeader`/`SetCookie`/`GetCookie` 등의 메서드는 안전하게 동시 호출할 수 있습니다. `prepareOptions`는 읽기 후 쓰기의 비원자적 시퀀스를 채택합니다 — 세션 상태는 최종 일관성으로 설계되었으며, 동시 요청이 `prepareOptions`에서 교차할 수 있지만 각 요청은 `prepareOptions` 시점에 일관된 스냅샷을 캡처합니다.
:::

## 옵션 이중 실행 주의사항

`prepareSessionOptions`는 요청 전송 전에 사용자가 전달한 `RequestOption`을 **두 번 적용**합니다: 한 번은 `captureFromOptions`에서 세션 상태 캡처용, 한 번은 `client.Request`에서 실제 요청용입니다.

```text
prepareSessionOptions(options):
  ① managedOptions = prepareOptions()        ← 세션 상태 읽기
  ② allOptions = managedOptions + options    ← 병합
  ③ captureFromOptions(options)              ← 임시 요청에 한 번 적용(세션 캡처)
  ④ return allOptions → client.Request()     ← 실제 요청에 두 번째 적용
```

::: warning 부작용이 있는 옵션 피하기
다음 옵션은 `DomainClient`에서 두 번 실행되어 예상치 못한 동작을 유발합니다:

| 문제가 있는 옵션 | 원인 |
|------------------|------|
| 카운터 증분 | 매 요청마다 두 번 증분 |
| nonce 무작위 생성 | 캡처 단계와 요청 단계에서 다른 값 생성 |
| `WithOnRequest` / `WithOnResponse` | 콜백이 명시적으로 제거되어 반복 트리거되지 않음(안전) |

부작용이 있는 옵션이 필요하면 하위 `Client`로 직접 요청을 보내거나, 옵션 외부에서 상태를 관리하세요.
:::

## Download 메서드

```go
func (dc *DomainClient) Download(ctx context.Context, path string, cfg *DownloadConfig, options ...RequestOption) (*DownloadResult, error)
```

파일을 `cfg.FilePath`로 다운로드하며, `path`는 `baseURL`에 상대적으로 조합됩니다. 패키지 수준 `Download` 및 `Client.Download` 시그니처와 동일합니다 — `Download`는 세 곳 모두에 걸친 유일한 정규 다운로드 진입점입니다. `cfg`는 nil일 수 없으며, `cfg.FilePath`를 반드시 설정해야 합니다(그렇지 않으면 `ErrEmptyFilePath` 반환).

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/report.pdf"
cfg.Overwrite = true

result, err := dc.Download(ctx, "/files/report.pdf", cfg)
```

다운로드 응답 Cookie는 세션에 자동으로 캡처됩니다(`UpdateFromCookies` 경유). `Request`와 마찬가지로 요청 옵션이 두 번 적용됩니다.

## Client 인터페이스와의 관계

`DomainClient`는 컴파일 타임 단언으로 두 인터페이스를 **동시에 구현**합니다:

```go
var _ Client = (*DomainClient)(nil)           // Client 인터페이스 구현
var _ DomainClienter = (*DomainClient)(nil)   // DomainClienter 인터페이스 구현
```

```text
인터페이스 계층:
  Doer                                    ← 최소 인터페이스(Request만)
    └── Client                             ← + HTTP 메서드 + Download + Close
          └── DomainClienter               ← + URL/Domain/Session + 세션 헤더/Cookie 관리
                └── *DomainClient          ← 구체적 구현
```

`DomainClienter`는 `Client`를 내장하므로, `Client` 매개변수를 받는 모든 함수가 `DomainClienter`를 받을 수 있습니다. 이는 `DomainClient`가 `Client`가 필요한 곳에서 원활하게 사용되면서 추가 세션 관리 능력을 제공하게 합니다.

## 완전한 REST API 클라이언트 패키징 예제

다음 예제는 `DomainClient`로 GitHub API 클라이언트를 패키징하여, 인증 헤더와 페이징 쿼리 매개변수를 자동으로 관리하는 방법을 보여줍니다.

```go
package main

import (
	"fmt"
	"time"

	"github.com/cybergodev/httpc"
)

// GitHubClient는 GitHub REST API를 패키징합니다
type GitHubClient struct {
	dc httpc.DomainClienter
}

// NewGitHubClient는 GitHub API 클라이언트를 생성합니다
func NewGitHubClient(token string) (*GitHubClient, error) {
	cfg := httpc.DefaultConfig()
	cfg.Timeouts.Request = 30 * time.Second

	dc, err := httpc.NewDomain("https://api.github.com", cfg)
	if err != nil {
		return nil, err
	}

	// 세션 수준 요청 헤더 설정
	if err := dc.SetHeader("Authorization", "Bearer "+token); err != nil {
		return nil, fmt.Errorf("set auth header: %w", err)
	}
	if err := dc.SetHeader("Accept", "application/vnd.github+json"); err != nil {
		return nil, fmt.Errorf("set accept header: %w", err)
	}
	if err := dc.SetHeader("X-GitHub-Api-Version", "2022-11-28"); err != nil {
		return nil, fmt.Errorf("set api version: %w", err)
	}

	return &GitHubClient{dc: dc}, nil
}

// Close는 자원을 해제합니다
func (g *GitHubClient) Close() error { return g.dc.Close() }

// GetUser는 사용자 정보를 가져옵니다(상대 경로가 baseURL과 자동 조합)
func (g *GitHubClient) GetUser(username string) (*httpc.Result, error) {
	return g.dc.Get(fmt.Sprintf("/users/%s", username))
}

// ListUserRepos는 사용자 저장소를 나열합니다(페이징 매개변수 포함)
func (g *GitHubClient) ListUserRepos(username string, page, perPage int) (*httpc.Result, error) {
	return g.dc.Get(fmt.Sprintf("/users/%s/repos?page=%d&per_page=%d", username, page, perPage))
}

func main() {
	client, err := NewGitHubClient("ghp_your_token_here")
	if err != nil {
		panic(err)
	}
	defer client.Close()

	// 각 요청이 Authorization, Accept, X-GitHub-Api-Version 헤더를 자동으로 휴대
	result, err := client.GetUser("torvalds")
	if err != nil {
		panic(err)
	}
	fmt.Printf("상태 코드: %d\n", result.StatusCode())

	// Unmarshal로 JSON 응답 파싱
	var user struct {
		Login string `json:"login"`
	}
	if err := result.Unmarshal(&user); err != nil {
		panic(err)
	}
	fmt.Printf("사용자 이름: %s\n", user.Login)

	repos, err := client.ListUserRepos("torvalds", 1, 5)
	if err != nil {
		panic(err)
	}
	fmt.Printf("저장소 목록 상태 코드: %d\n", repos.StatusCode())
	// 출력 예시:
	// 상태 코드: 200
	// 사용자 이름: torvalds
	// 저장소 목록 상태 코드: 200
}
```

:::tip 인터페이스 반환값
`NewDomain`과 `NewDomainDefault`는 `*DomainClient` 구체적 타입이 아닌 `DomainClienter` 인터페이스를 반환하여, 테스트에서 mock으로 교체하기 편리합니다. 구체적 타입에 접근해야 할 때는 타입 단언을 하면 됩니다.
:::

## 참고

- [세션 관리](./session) — SessionManager 상세 레퍼런스
- [도메인 클라이언트와 세션](../../guides/domain-session) — 사용 가이드
- [인터페이스 정의](../types/interfaces) — Client, Doer, DomainClienter 인터페이스 정의
- [파일 다운로드](./download) — DownloadConfig와 DownloadResult 상세
