---
sidebar_label: "오류 처리"
title: "오류 처리 - CyberGo html | 견고한 오류 처리 가이드"
description: "CyberGo html 오류 처리 가이드: 입력·설정·파일·처리·시스템 5가지 오류 분류, errors.Is/As 판별 패턴, context 취소와 배치 부분 실패 처리, 패닉 복구 방법으로 견고한 에러 핸들링 로직을 구축합니다."
sidebar_position: 5
---

# 오류 처리

## 오류 분류

HTML 라이브러리의 오류는 다음과 같이 분류됩니다:

| 분류 | 센티넬 오류 | 설명 |
|------|----------|------|
| 입력 오류 | `ErrInputTooLarge`, `ErrInvalidHTML` | 입력 콘텐츠 문제 |
| 설정 오류 | `ErrInvalidConfig`, `ErrMultipleConfigs` | 설정 문제 |
| 파일 오류 | `ErrFileNotFound`, `ErrInvalidFilePath` | 파일 작업 문제 |
| 처리 오류 | `ErrProcessingTimeout`, `ErrMaxDepthExceeded` | 처리 과정 문제 |
| 시스템 오류 | `ErrProcessorClosed`, `ErrInternalPanic` | 내부 상태 문제 |

## errors.Is 패턴

`errors.Is`를 사용하여 오류 유형을 판별합니다:

```go
result, err := html.Extract(data)
if err != nil {
    switch {
    case errors.Is(err, html.ErrInputTooLarge):
        slog.Warn("입력이 너무 큽니다. 문서 크기를 줄이세요")
    case errors.Is(err, html.ErrInvalidHTML):
        slog.Warn("유효하지 않은 HTML 입니다. 입력을 확인하세요")
    case errors.Is(err, html.ErrProcessingTimeout):
        slog.Warn("처리 타임아웃. 문서가 너무 복잡할 수 있습니다")
    case errors.Is(err, html.ErrFileNotFound):
        slog.Warn("파일이 존재하지 않습니다")
    case errors.Is(err, html.ErrMaxDepthExceeded):
        slog.Warn("DOM 깊이가 너무 깊습니다. 악의적으로 구성되었을 수 있습니다")
    case errors.Is(err, html.ErrInternalPanic):
        slog.Error("내부 패닉이 복구되었습니다. 이 문제를 보고해 주세요")
    default:
        slog.Error("알 수 없는 오류", "err", err)
    }
}
```

## errors.As 패턴

구조화된 오류 정보를 추출합니다:

```go
var inputErr *html.InputError
var configErr *html.ConfigError
var fileErr *html.FileError

if errors.As(err, &inputErr) {
    fmt.Printf("크기 %d가 제한 %d를 초과함\n", inputErr.Size, inputErr.MaxSize)
}

if errors.As(err, &configErr) {
    fmt.Printf("필드 %s 값 %v이(가) 유효하지 않음: %s\n", configErr.Field, configErr.Value, configErr.Message)
}

if errors.As(err, &fileErr) {
    fmt.Printf("파일 작업: %s\n", fileErr.SafePath())
}
```

## 컨텍스트 취소

`ExtractWithContext` 버전을 사용하여 취소를 지원합니다:

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

result, err := html.ExtractWithContext(ctx, data)
if err != nil {
    switch {
    case errors.Is(err, html.ErrProcessingTimeout):
        // 타임아웃 처리 (라이브러리 내 ProcessingTimeout 트리거, 이때 ctx.Err() 는 nil 일 수 있음)
    case ctx.Err() == context.DeadlineExceeded:
        // 사용자 컨텍스트 마감 시간 도달
    case ctx.Err() == context.Canceled:
        // 수동 취소
    default:
        // 기타 오류 (ErrInvalidHTML, ErrInputTooLarge 등)
        slog.Error("추출 실패", "err", err)
    }
}
```

## 배치 오류

배치 처리 결과에는 부분 성공과 부분 실패가 포함됩니다:

```go
batch := p.ExtractBatch(pages)

for i, err := range batch.Errors {
    if err != nil {
        fmt.Printf("항목 %d 실패: %v\n", i, err)
    }
}

fmt.Printf("성공: %d, 실패: %d, 취소: %d\n",
    batch.Success, batch.Failed, batch.Cancelled)
```

## 오류 복구 전략

실제 애플리케이션에서는 오류 타입을 판별하는 것만으로는 부족합니다. 오류 분류에 따라 다른 복구 전략을 취해야 합니다.

### 인코딩 감지 실패

HTML 입력에 `<meta charset>` 선언이 없고 자동 감지가 인코딩을 결정하지 못할 때, 라이브러리가 반환하는 오류 메시지는 `"encoding detection failed"`로 시작합니다. 이는 일반적인 `fmt.Errorf` 래핑 오류(센티넬 오류도, 타입화된 오류도 아님)이므로, 오류 메시지 문자열 매칭으로만 감지할 수 있습니다.

복구 전략: 먼저 자동 감지(`Config.Encoding` 비워둠)를 시도하고, 실패하면 알려진 인코딩을 수동 지정하여 재시도합니다.

```go
package main

import (
	"fmt"
	"log"
	"strings"

	"github.com/cybergodev/html"
	"golang.org/x/text/encoding/simplifiedchinese"
)

// extractWithEncodingFallback 는 먼저 자동 감지로 추출을 시도하고, 인코딩 감지 실패 시 수동 인코딩으로 재시도합니다.
func extractWithEncodingFallback(data []byte, fallbackEncoding string) (*html.Result, error) {
	// 첫 번째: 자동 감지 (Config.Encoding 비워둠)
	result, err := html.Extract(data)
	if err == nil {
		return result, nil
	}

	// 인코딩 감지 실패 시, 수동 지정 인코딩으로 재시도
	if strings.Contains(err.Error(), "encoding detection failed") {
		fmt.Printf("자동 감지 실패(%v), 인코딩 %q로 재시도...\n", err, fallbackEncoding)
		cfg := html.DefaultConfig()
		cfg.Encoding = fallbackEncoding
		return html.Extract(data, cfg)
	}

	// 기타 오류(입력 과대, 유효하지 않은 HTML 등)는 재시도하지 않고 그대로 반환
	return nil, err
}

func main() {
	// GBK 인코딩된 HTML 구성(charset meta 선언 없음, 자동 감지 실패 유발 가능)
	utf8HTML := `<html><head><title>테스트</title></head>` +
		`<body><article><h1>제목</h1><p>안녕하세요 세계</p></article></body></html>`
	gbkBytes, err := simplifiedchinese.GBK.NewEncoder().Bytes([]byte(utf8HTML))
	if err != nil {
		log.Fatal(err)
	}

	result, err := extractWithEncodingFallback(gbkBytes, "gbk")
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("제목: %s\n", result.Title)
	fmt.Printf("텍스트: %s\n", result.Text)
	// 출력:
	// 자동 감지 실패(encoding detection failed: ...), 인코딩 "gbk"로 재시도...
	// 제목: 테스트
	// 텍스트: 제목 안녕하세요 세계
}
```

:::tip 팁
인코딩 감지 재시도는 출처를 알 수 없는 HTML 문서(예: 크롤러가 수집한 구버전 중국어 웹 페이지)를 처리할 때 적합합니다. 입력 출처가 고정되어 있다면 `Config.Encoding`에 인코딩을 직접 지정하면 되므로 재시도 로직이 필요 없습니다.
:::

### 타임아웃 복구

`ErrProcessingTimeout`은 처리 시간이 `Config.ProcessingTimeout`을 초과했음을 나타냅니다. 복구 전략은 문서 특성에 따라 다릅니다:

| 전략 | 적용 시나리오 | 방법 |
|------|----------|------|
| 복잡도 감소 | 문서 구조는 복잡하지만 콘텐츠는 단순함 | `ExtractArticle = false` 설정으로 본문 인식 스킵 |
| 타임아웃 연장 | 문서가 실제로 매우 크고 합법적임 | `ProcessingTimeout` 증가 |
| 출력 단순화 | 순수 텍스트만 필요 | `TextOnlyConfig()`로 모든 미디어 추출 비활성화 |

```go
package main

import (
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/cybergodev/html"
)

func main() {
	// 첫 번째: 표준 설정(30초 타임아웃)
	cfg := html.DefaultConfig()
	p, err := html.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer p.Close()

	largeHTML := []byte(`<html><body><article><h1>대용량 문서</h1><p>` +
		strings.Repeat("콘텐츠 ", 100000) + `</p></article></body></html>`)

	_, err = p.Extract(largeHTML)
	if err != nil {
		if errors.Is(err, html.ErrProcessingTimeout) {
			fmt.Println("표준 설정 타임아웃, 단순화 모드로 전환하여 재시도...")

			// 재시도: 본문 추출 끄기 + 순수 텍스트 모드 + 더 긴 타임아웃
			retryCfg := html.TextOnlyConfig()
			retryCfg.ExtractArticle = false
			retryCfg.ProcessingTimeout = 60 * time.Second
			p2, err := html.New(retryCfg)
			if err != nil {
				log.Fatal(err)
			}
			defer p2.Close()

			result, err := p2.Extract(largeHTML)
			if err != nil {
				log.Fatal(err)
			}
			fmt.Printf("재시도 성공, %d자 추출\n", len(result.Text))
		} else {
			log.Fatal(err)
		}
	}
}
```

### 입력 과대

`ErrInputTooLarge`는 입력이 `Config.MaxInputSize`(기본 50MB, 상한도 50MB)를 초과했음을 나타냅니다. 두 가지 처리 방법:

- **입력 축소**: 웹 서비스라면 사용자에게 더 작은 파일 업로드를 안내
- **제한 증가**: 실제로 대용량 파일 처리가 필요한 경우 `MaxInputSize` 증가(상한 50MB)

```go
package main

import (
	"errors"
	"fmt"
	"log"
	"strings"

	"github.com/cybergodev/html"
)

func main() {
	cfg := html.DefaultConfig()
	cfg.MaxInputSize = 1024 // 1KB 제한(데모용)
	p, err := html.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer p.Close()

	// 제한을 초과하는 입력 구성
	largeInput := []byte(strings.Repeat("<div>", 500))
	_, err = p.Extract(largeInput)
	if err != nil {
		var inputErr *html.InputError
		if errors.As(err, &inputErr) {
			fmt.Printf("입력 %d바이트가 제한 %d바이트를 초과\n", inputErr.Size, inputErr.MaxSize)
			// 출력: 입력 2500바이트가 제한 1024바이트를 초과
		}
	}
}
```

## 오류 래핑 체인

세 가지 구조화된 오류 타입(`InputError`, `ConfigError`, `FileError`)은 모두 `Unwrap()` 메서드를 구현하여, `errors.Is()`와 `errors.As()` 표준 패턴을 지원합니다. `Unwrap()`의 동작을 이해하는 것은 올바른 오류 판별에 매우 중요합니다.

### Unwrap 동작 비교

| 타입 | `Unwrap()` 반환값 | 설명 |
|------|-------------------|------|
| `*InputError` | `InputErr`(nil이 아닐 때) → 아니면 `ErrInputTooLarge` | 기저 오류가 있으면 우선 노출, 없으면 센티넬로 폴백 |
| `*ConfigError` | 항상 `ErrInvalidConfig` | 설정 센티넬로 고정 매핑 |
| `*FileError` | ① `FileErr`이 `ErrFileNotFound`를 래핑 중 → `ErrFileNotFound`; ② 그 외 `FileErr != nil` → `FileErr`(원본 오류); ③ 아니면 → `ErrInvalidFilePath` | 3단계 폴백: 파일 없음 → 원본 오류 → 경로 무효 |

:::warning 주의
`FileError.Unwrap()`의 3단계 로직은 경로 순회 공격으로 인한 오류(`FileErr` = `"path traversal detected: ..."`)가 어떤 센티넬 오류와도 매치되지 않음을 의미합니다. `Unwrap()`이 반환하는 것은 `ErrFileNotFound`나 `ErrInvalidFilePath`가 아닌, 원본 경로 순회 오류이기 때문입니다. 경로 순회 감지는 `errors.As`로 `FileError`를 추출한 후 메시지를 검사해야 합니다.
:::

### 종합 판별 예시

```go
package main

import (
	"errors"
	"fmt"
	"log"
	"strings"

	"github.com/cybergodev/html"
)

// diagnoseError 는 errors.Is + errors.As 로 오류를 종합 진단합니다.
func diagnoseError(err error) {
	if err == nil {
		fmt.Println("오류 없음")
		return
	}

	// 1. errors.Is: 센티넬 오류 확인(Unwrap 체인 따라 검색)
	fmt.Printf("errors.Is 검사:\n")
	fmt.Printf("  ErrInputTooLarge:    %v\n", errors.Is(err, html.ErrInputTooLarge))
	fmt.Printf("  ErrInvalidConfig:    %v\n", errors.Is(err, html.ErrInvalidConfig))
	fmt.Printf("  ErrFileNotFound:     %v\n", errors.Is(err, html.ErrFileNotFound))
	fmt.Printf("  ErrInvalidFilePath:  %v\n", errors.Is(err, html.ErrInvalidFilePath))

	// 2. errors.As: 구조화된 오류 타입 추출
	var inputErr *html.InputError
	if errors.As(err, &inputErr) {
		fmt.Printf("InputError 상세: op=%s size=%d max=%d\n",
			inputErr.Op, inputErr.Size, inputErr.MaxSize)
	}

	var configErr *html.ConfigError
	if errors.As(err, &configErr) {
		fmt.Printf("ConfigError 상세: field=%s value=%v message=%s\n",
			configErr.Field, configErr.Value, configErr.Message)
	}

	var fileErr *html.FileError
	if errors.As(err, &fileErr) {
		fmt.Printf("FileError 상세: op=%s safePath=%s\n",
			fileErr.Op, fileErr.SafePath())
		// 경로 순회 감지(센티넬과 매치되지 않으므로 메시지 확인 필요)
		if fileErr.FileErr != nil &&
			strings.Contains(fileErr.FileErr.Error(), "path traversal") {
			fmt.Println("  [보안 경고] 경로 순회 공격 감지")
		}
	}
}

func main() {
	cfg := html.DefaultConfig()
	cfg.MaxInputSize = 100
	p, err := html.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer p.Close()

	// 시나리오 1: 입력 과대 → InputError → ErrInputTooLarge
	fmt.Println("=== 시나리오 1: 입력 과대 ===")
	_, err = p.Extract([]byte(strings.Repeat("x", 200)))
	diagnoseError(err)

	// 시나리오 2: 파일 없음 → FileError → ErrFileNotFound
	fmt.Println("\n=== 시나리오 2: 파일 없음 ===")
	_, err = p.ExtractFromFile("nonexistent.html")
	diagnoseError(err)

	// 시나리오 3: 경로 순회 → FileError → 센티넬과 매치 안 됨
	fmt.Println("\n=== 시나리오 3: 경로 순회 ===")
	_, err = p.ExtractFromFile("../../etc/passwd")
	diagnoseError(err)
}
```

## FileError 의 경로 마스킹 메커니즘

`FileError`는 설계상 **경로 정보 마스킹** 메커니즘을 내장하여, 오류 메시지를 통해 서버 파일 시스템 구조가 유출되는 것을 방지합니다. 이는 신뢰할 수 없는 사용자의 파일 경로를 처리할 때 특히 중요합니다.

### 마스킹 계층

| 계층 | 메서드 | 동작 |
|------|------|------|
| 오류 메시지 | `Error()` | `SafePath()` 호출로 파일명만 표시, `sanitizeErrorMessage()` 호출로 경로 세부 정보 제거 |
| 경로 잘라내기 | `SafePath()` | 경로의 basename 반환(예: `/var/data/secret/page.html` → `page.html`) |
| 오류 정제 | `sanitizeErrorMessage()` | 오류 타입 유지(path traversal / not found / permission denied / access denied), 경로 문자열 제거 |
| JSON 직렬화 | `MarshalJSON()` | 자동으로 `SafePath()` 적용, HTTP API 응답에 적합 |
| 내부 디버그 | `Path` 필드 | 전체 경로 유지, 로그 및 감사용(외부 노출 안 함) |

### 웹 서비스 마스킹 예시

```go
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"

	"github.com/cybergodev/html"
)

// apiResponse 는 클라이언트에 반환되는 JSON 구조체입니다.
type apiResponse struct {
	Error   string `json:"error,omitempty"`
	Message string `json:"message,omitempty"`
}

func extractHandler(w http.ResponseWriter, r *http.Request) {
	filePath := r.URL.Query().Get("file")
	if filePath == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(apiResponse{Error: "missing file parameter"})
		return
	}

	cfg := html.DefaultConfig()
	result, err := html.ExtractFromFile(filePath, cfg)
	if err != nil {
		// 오류 메시지는 자동으로 마스킹됨 — 클라이언트는 서버 경로를 볼 수 없음
		w.WriteHeader(http.StatusUnprocessableEntity)

		var fileErr *html.FileError
		if errors.As(err, &fileErr) {
			// MarshalJSON 이 자동으로 SafePath() 적용, 클라이언트에 안전하게 반환 가능
			fileErrJSON, _ := json.Marshal(fileErr)
			fmt.Fprintf(w, `{"error":"file_error","detail":%s}`, fileErrJSON)
			// 클라이언트가 보는 것: {"error":"file_error","detail":{"op":"ReadFile","path":"secret.html","message":"file not found"}}
			// 전체 서버 경로 /var/www/uploads/secret.html 가 아님
		} else {
			json.NewEncoder(w).Encode(apiResponse{Error: "extraction_failed"})
		}
		return
	}

	json.NewEncoder(w).Encode(result)
}

func main() {
	// 마스킹 효과 데모: 존재하지 않는 파일 경로 처리 시뮬레이션
	cfg := html.DefaultConfig()
	_, err := html.ExtractFromFile("/var/www/private/secret.html", cfg)
	if err != nil {
		var fileErr *html.FileError
		if errors.As(err, &fileErr) {
			fmt.Printf("Error() 출력(마스킹): %v\n", fileErr)
			// 출력: Error() 출력(마스킹): html: ReadFile "secret.html": file not found

			fmt.Printf("SafePath(): %s\n", fileErr.SafePath())
			// 출력: SafePath(): secret.html

			jsonBytes, _ := json.Marshal(fileErr)
			fmt.Printf("MarshalJSON(): %s\n", jsonBytes)
			// 출력: MarshalJSON(): {"op":"ReadFile","path":"secret.html","message":"file not found"}

			fmt.Printf("Path 필드(내부 디버그용): %s\n", fileErr.Path)
			// 출력: Path 필드(내부 디버그용): /var/www/private/secret.html
		}
	}

	// HTTP 핸들러 등록(등록만, 서버 시작 안 함)
	http.HandleFunc("/extract", extractHandler)
	fmt.Println("\n핸들러 등록됨, 오류 메시지 자동 마스킹")
}
```

:::tip 팁
`MarshalJSON()` 덕분에 `FileError`를 `json.Marshal()`한 후 HTTP 클라이언트에 직접 반환할 수 있으며, 추가 처리가 필요 없습니다. 경로 정보는 직렬화 시 자동으로 마스킹됩니다. 단, `Path` 필드는 전체 경로를 유지하며 내부 로그와 디버그 전용이므로 클라이언트에 직접 반환하지 마세요.
:::

## 웹 서비스 오류 매핑

웹 서비스에서는 라이브러리의 오류를 적절한 HTTP 상태 코드로 매핑하여 클라이언트가 올바르게 처리할 수 있도록 해야 합니다.

### HTTP 상태 코드 매핑 테이블

| 센티넬 오류 | 권장 HTTP 상태 코드 | 설명 |
|----------|------------------|------|
| `ErrInputTooLarge` | 413 Payload Too Large | 입력 초과, 클라이언트는 입력 축소 필요 |
| `ErrInvalidHTML` | 422 Unprocessable Entity | 파싱 불가한 HTML 형식 |
| `ErrFileNotFound` | 404 Not Found | 파일이 존재하지 않음 |
| `ErrInvalidFilePath` | 400 Bad Request | 경로 형식 무효 |
| `ErrMaxDepthExceeded` | 400 Bad Request | 악의적으로 구성되었을 수 있는 깊은 중첩 |
| `ErrProcessingTimeout` | 504 Gateway Timeout | 처리 타임아웃, 클라이언트는 나중에 재시도 가능 |
| `ErrProcessorClosed` | 500 Internal Server Error | 프로그래밍 오류(수명 주기 관리 부실) |
| `ErrInvalidConfig` | 500 Internal Server Error | 프로그래밍 오류(설정 검증은 시작 시 완료해야 함) |
| `ErrInternalPanic` | 500 Internal Server Error | 내부 버그, 보고 필요 |
| `ErrMultipleConfigs` | 500 Internal Server Error | 프로그래밍 오류(여러 Config 전달) |

### 상태 코드 매핑 구현

```go
package main

import (
	"errors"
	"fmt"
	"log"
	"net/http"

	"github.com/cybergodev/html"
)

// errorToHTTPStatus 는 html 라이브러리의 오류를 적절한 HTTP 상태 코드로 매핑합니다.
func errorToHTTPStatus(err error) int {
	switch {
	case errors.Is(err, html.ErrInputTooLarge):
		return http.StatusRequestEntityTooLarge // 413
	case errors.Is(err, html.ErrInvalidHTML):
		return http.StatusUnprocessableEntity // 422
	case errors.Is(err, html.ErrFileNotFound):
		return http.StatusNotFound // 404
	case errors.Is(err, html.ErrInvalidFilePath):
		return http.StatusBadRequest // 400
	case errors.Is(err, html.ErrMaxDepthExceeded):
		return http.StatusBadRequest // 400
	case errors.Is(err, html.ErrProcessingTimeout):
		return http.StatusGatewayTimeout // 504
	case errors.Is(err, html.ErrProcessorClosed):
		return http.StatusInternalServerError // 500
	case errors.Is(err, html.ErrInvalidConfig):
		return http.StatusInternalServerError // 500
	case errors.Is(err, html.ErrInternalPanic):
		return http.StatusInternalServerError // 500
	case errors.Is(err, html.ErrMultipleConfigs):
		return http.StatusInternalServerError // 500
	default:
		return http.StatusInternalServerError // 500
	}
}

func main() {
	// 다양한 오류의 HTTP 상태 코드 매핑 데모

	// ErrInputTooLarge → 413
	cfg := html.DefaultConfig()
	cfg.MaxInputSize = 10
	p, err := html.New(cfg)
	if err != nil {
		log.Fatal(err)
	}

	testCases := []struct {
		name string
		err  error
	}{
		{"입력 과대", func() error {
			_, e := p.Extract(make([]byte, 100))
			return e
		}()},
		{"파일 없음", func() error {
			_, e := p.ExtractFromFile("missing.html")
			return e
		}()},
		{"Processor 닫힘", html.ErrProcessorClosed},
		{"내부 패닉", html.ErrInternalPanic},
	}

	for _, tc := range testCases {
		if tc.err != nil {
			fmt.Printf("%-12s → HTTP %d\n", tc.name, errorToHTTPStatus(tc.err))
		}
	}
	// 출력:
	// 입력 과대      → HTTP 413
	// 파일 없음      → HTTP 404
	// Processor 닫힘 → HTTP 500
	// 내부 패닉      → HTTP 500

	p.Close()
}
```

## 오류 결정 흐름도

오류 발생 시, 다음 우선순위 순서대로 판별합니다(가장 심각한 것부터):

```
error != nil ?
│
├── errors.Is(err, ErrProcessorClosed)
│   → 프로그래밍 오류: Close() 호출 시점 확인, Processor 가 사용 후 닫히지 않았는지 점검
│
├── errors.Is(err, ErrInternalPanic)
│   → 내부 버그: 전체 스택 기록 및 보고, 입력이 커버되지 않은 경계 조건을 trigger 했을 수 있음
│
├── errors.As(err, &fileErr)
│   → 파일 오류: SafePath()로 마스킹된 경로 기록, FileErr 확인하여 구체적 원인 판단
│   ├── errors.Is(err, ErrFileNotFound)    → 파일이 존재하지 않음
│   ├── 메시지에 "path traversal" 포함      → 보안 이벤트, 감사 로그 + 거부
│   └── errors.Is(err, ErrInvalidFilePath) → 경로 형식 문제
│
├── errors.As(err, &inputErr)
│   → 입력 오류: Size/MaxSize 확인, 사용자에게 입력 축소 안내 또는 제한 조정
│
├── errors.Is(err, ErrProcessingTimeout)
│   → 타임아웃: 처리 단순화(ExtractArticle=false) 또는 타임아웃 증가 후 재시도 검토
│
├── errors.Is(err, ErrMaxDepthExceeded)
│   → 악의적 구성 가능성: 거부 및 감사 로그 기록
│
├── errors.Is(err, ErrInvalidHTML)
│   → 입력 형식 문제: 사용자에게 HTML 소스 확인 안내
│
├── errors.Is(err, ErrInvalidConfig)
│   → 설정 오류: 서비스 시작 시 Validate()로 잡아야 함, 런타임 발생은 로직 오류
│
└── 기타
    → 알 수 없는 오류: 전체 오류 체인 기록, 상위로 전파 또는 500 반환
```

:::tip 팁
판별 순서는 매우 중요합니다: `ErrProcessorClosed`와 `ErrInternalPanic`을 우선 검사해야 합니다. 이들은 프로그래밍 오류나 내부 장애를 나타내며 입력 오류와 구분하여 처리해야 합니다. `FileError`의 `errors.As` 검사는 `errors.Is` 센티넬 검사 후 또는 병행해야 합니다. 경로 순회 오류는 어떤 센티넬과도 매치되지 않기 때문입니다.
:::

## 구조화된 로깅 실전

`slog`로 오류를 기록할 때, 단순히 `err.Error()` 문자열을 기록하는 대신 구조화된 오류 타입에서 필드를 추출해야 합니다. 이는 후속 로그 쿼리와 알림에 유리합니다.

```go
package main

import (
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"github.com/cybergodev/html"
)

// logExtractionError 는 오류 타입에 따라 구조화된 필드를 추출하여 slog에 기록합니다.
func logExtractionError(err error) {
	var inputErr *html.InputError
	var configErr *html.ConfigError
	var fileErr *html.FileError

	switch {
	case errors.As(err, &inputErr):
		// 입력 오류: Op/Size/MaxSize 기록으로 용량 문제 조사 용이
		slog.Warn("추출 실패: 입력 오류",
			"op", inputErr.Op,
			"size", inputErr.Size,
			"max_size", inputErr.MaxSize,
			"sentinel", "ErrInputTooLarge",
		)

	case errors.As(err, &configErr):
		// 설정 오류: Field/Value/Message 기록으로 설정 문제 위치 파악 용이
		slog.Error("추출 실패: 설정 오류",
			"field", configErr.Field,
			"value", configErr.Value,
			"message", configErr.Message,
			"sentinel", "ErrInvalidConfig",
		)

	case errors.As(err, &fileErr):
		// 파일 오류: SafePath()로 마스킹된 경로 기록, 경로 순회 확인
		attrs := []any{
			"op", fileErr.Op,
			"path", fileErr.SafePath(), // 마스킹된 경로, 로그에서 전체 경로 유출 방지
		}
		if fileErr.FileErr != nil {
			attrs = append(attrs, "cause", fileErr.FileErr.Error())
			if strings.Contains(fileErr.FileErr.Error(), "path traversal") {
				attrs = append(attrs, "security_event", "path_traversal")
			}
		}
		slog.Warn("추출 실패: 파일 오류", attrs...)

	case errors.Is(err, html.ErrProcessingTimeout):
		slog.Warn("추출 실패: 처리 타임아웃", "err", err)

	case errors.Is(err, html.ErrMaxDepthExceeded):
		slog.Warn("추출 실패: 깊이 초과, 악의적 구성 가능", "err", err)

	case errors.Is(err, html.ErrProcessorClosed):
		slog.Error("추출 실패: Processor 가 닫혀 있음(프로그래밍 오류)", "err", err)

	case errors.Is(err, html.ErrInternalPanic):
		slog.Error("추출 실패: 내부 패닉, 보고해 주세요",
			"err", err,
			"issue", "https://github.com/cybergodev/html/issues",
		)

	default:
		slog.Error("추출 실패: 알 수 없는 오류", "err", err, "err_type", fmt.Sprintf("%T", err))
	}
}

func main() {
	cfg := html.DefaultConfig()
	cfg.MaxInputSize = 100
	p, err := html.New(cfg)
	if err != nil {
		slog.Error("Processor 생성 실패", "err", err)
		return
	}
	defer p.Close()

	// 시나리오 1: 입력 과대 → 구조화된 Size/MaxSize 기록
	_, err = p.Extract([]byte(strings.Repeat("x", 200)))
	if err != nil {
		logExtractionError(err)
	}

	// 시나리오 2: 파일 없음 → 구조화된 SafePath 기록
	_, err = p.ExtractFromFile("/data/secret/missing.html")
	if err != nil {
		logExtractionError(err)
	}

	// 시나리오 3: 경로 순회 → 보안 이벤트 표시
	_, err = p.ExtractFromFile("../../../etc/passwd")
	if err != nil {
		logExtractionError(err)
	}
}
```

:::tip 팁
구조화된 로깅의 핵심은 문자열을 조립하는 것이 아니라 **필드**를 추출하는 것입니다. 예를 들어 `inputErr.Size`와 `inputErr.MaxSize`를 기록하면, 로그 시스템에서 `size > max_size * 0.9`로 쿼리하여 상한에 근접한 요청을 찾아 용량 문제를 조기에 발견할 수 있습니다. `FileError`의 경우 항상 `Path` 필드가 아닌 `SafePath()`로 로그를 기록하여, 로그 파일 자체가 정보 유출원이 되지 않도록 하세요.
:::
