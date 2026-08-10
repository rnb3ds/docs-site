---
sidebar_label: "패키지 함수"
title: "패키지 함수 - CyberGo html | 용법·매개변수·예제"
description: "CyberGo html 패키지 함수: Extract, ExtractText, ExtractToMarkdown, ExtractAllLinks 등. 내부 sync.Pool 로 Processor 를 재사용해 일회성 호출과 스크립트에 적합합니다."
sidebar_position: 1
---

# 패키지 함수

패키지 수준 함수는 일회성 호출 시나리오에 적합하며, 내부적으로 `sync.Pool`을 사용하여 Processor 를 재사용하므로 라이프사이클을 수동으로 관리할 필요가 없습니다. 참고: 풀링된 Processor 는 캐시와 감사 보존을 비활성화합니다; 캐시/통계/감사가 필요하면 [html.New](./processor)로 전용 Processor 를 생성하세요.

## 내부 메커니즘

:::info 풀링 설계
패키지 함수는 내부적으로 `sync.Pool`을 유지하여, 호출 사이에 `Processor` 인스턴스를 재사용하며 반복 할당을 피합니다. 핵심 구현 세부 사항:

- **풀링 설정은 캐시 비활성화**: 풀용 설정(`poolCfg`)은 `DefaultConfig()`를 기반으로 하지만, 캐시 관련 세 필드를 명시적으로 0으로 설정합니다 — `MaxCacheEntries=0`, `CacheTTL=0`, `CacheCleanup=0`. 따라서 **패키지 함수는 캐시를 활용할 수 없으며**, 매번 전체 처리를 수행합니다. 이렇게 설계된 이유는 풀링된 Processor 가 반납될 때마다 캐시를 비우기 때문에, 캐시를 켜봤자 해시와 map 쓰기 비용만 들 뿐 절대 적중하지 않기 때문입니다.
- **반납 시 상태 재설정**: 매 호출 종료 시 Processor 를 반납하기 전에 `ResetStatistics`, `audit.Wait()`, `ClearAuditLog`, `ClearCache`를 차례로 실행하여, 호출 간의 통계/감사/캐시 상태 누출을 방지합니다.
- **이미 닫힌 Processor 는 반납하지 않음**: Processor 가 사용 중에 닫힌 경우 (오용), 반납 로직은 이를 풀에 넣지 않고 직접 폐기합니다 (`sync.Pool`은 `Put` 누락을 허용하며, 다음 `Get` 시 `pool.New`가 재구성합니다).
- **panic 안전망**: `pool.New`는 라이브러리 불변 조건이 깨졌을 때만 panic 합니다 (`poolCfg`는 `DefaultConfig()`에서 파생되어 생성 시점에 합법적); 이 panic 은 `getPooledProcessorSafe`에서 포착되어 `ErrInternalPanic`으로 래핑되어 반환되며, 공개 API 로는 유출되지 않습니다.
:::

## 설정 매개변수 해석

모든 패키지 함수의 `cfg ...Config`는 선택적 가변 인자로, 내부 `resolveConfig`가 해석합니다:

| 전달 인자 | 동작 | 풀링 사용 여부 |
|----------|------|:----------:|
| 미전달 | `DefaultConfig()` 사용 | 예(`pooled=true`) |
| 1 개 전달 | 해당 `Config` 사용 | **아니오**(`pooled=false`) |
| ≥2 개 전달 | `ErrMultipleConfigs` 반환 | — |

:::warning 핵심 차이
커스텀 `Config`를 전달하면 **`sync.Pool`을 거치지 않습니다** — 풀은 `DefaultConfig()` 기반의 Processor 만 저장하며, 설정이 다른 인스턴스를 안전하게 재사용할 수 없습니다. 이 경우 매 호출마다 임시 Processor 를 `New`로 생성하고, 사용 후 즉시 `Close`합니다. 고빈도 호출에서 커스텀 설정을 재사용하려면 [Processor](./processor)를 직접 생성하세요.
:::

## 콘텐츠 추출

### Extract

HTML 바이트에서 콘텐츠를 추출하여 완전한 `Result`를 반환합니다.

```go
func Extract(htmlBytes []byte, cfg ...Config) (*Result, error)
```

**매개변수**:

| 매개변수 | 타입 | 설명 |
|------|------|------|
| `htmlBytes` | `[]byte` | HTML 콘텐츠 |
| `cfg` | `...Config` | 선택적 설정, 최대 1 개 |

**예시**:

```go
result, err := html.Extract(data)
if err != nil {
    log.Fatal(err)
}
fmt.Println(result.Title, result.Text)
```

완전히 실행 가능한 예시 (필드 접근과 오류 처리 시연):

```go
package main

import (
	"fmt"
	"log"

	"github.com/cybergodev/html"
)

func main() {
	data := []byte(`<html><head><title>예제 페이지</title></head>
<body><h1>환영합니다</h1><p>본문 내용<a href="https://example.com">링크</a>.</p></body></html>`)

	// Config 미전달, 풀링 경로 사용
	result, err := html.Extract(data)
	if err != nil {
		log.Fatalf("추출 실패: %v", err)
	}

	fmt.Println("제목:", result.Title)
	fmt.Println("단어 수:", result.WordCount)
	fmt.Println("링크 수:", len(result.Links))
	// 출력:
	// 제목: 예제 페이지
	// 단어 수: 4
	// 링크 수: 1
}
```

**오류 반환**: `Extract`는 [Processor.Extract](./processor#오류-반환)와 동일한 오류를 반환하며, 추가로 다음을 반환할 수 있습니다:

| 오류 | 조건 |
|------|------|
| `ErrMultipleConfigs` | 2 개 이상의 `Config` 전달 |
| `ErrInvalidConfig`(`*ConfigError`로 래핑) | 전달된 `Config` 검증 실패 (예: `MaxInputSize<=0`) |

### ExtractFromFile

HTML 파일에서 콘텐츠를 추출합니다.

```go
func ExtractFromFile(filePath string, cfg ...Config) (*Result, error)
```

**오류 반환**: `Extract`의 오류 외에도, 파일 접근 시 `*FileError`를 반환할 수 있으며, `ErrFileNotFound`, `ErrInvalidFilePath` 또는 경로 순회 거부를 래핑합니다 ([보안 방어](../modules/security)의 `AllowedBaseDir` 참조).

## 텍스트 추출

### ExtractText

순수 텍스트 콘텐츠만 추출합니다.

```go
func ExtractText(htmlBytes []byte, cfg ...Config) (string, error)
```

### ExtractTextFromFile

파일에서 순수 텍스트를 추출합니다.

```go
func ExtractTextFromFile(filePath string, cfg ...Config) (string, error)
```

## 컨텍스트 버전

모든 함수는 `context.Context`가 포함된 버전을 지원하여 취소 및 타임아웃 제어에 사용합니다:

| 함수 | 시그니처 |
|------|------|
| `ExtractWithContext` | `(ctx context.Context, htmlBytes []byte, cfg ...Config) (*Result, error)` |
| `ExtractFromFileWithContext` | `(ctx context.Context, filePath string, cfg ...Config) (*Result, error)` |
| `ExtractTextWithContext` | `(ctx context.Context, htmlBytes []byte, cfg ...Config) (string, error)` |
| `ExtractTextFromFileWithContext` | `(ctx context.Context, filePath string, cfg ...Config) (string, error)` |

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

result, err := html.ExtractWithContext(ctx, data)
```

## 출력 형식

| 함수 | 시그니처 | 설명 |
|------|------|------|
| `ExtractToMarkdown` | `(htmlBytes []byte, cfg ...Config) (string, error)` | HTML → Markdown |
| `ExtractToMarkdownFromFile` | `(filePath string, cfg ...Config) (string, error)` | 파일 → Markdown |
| `ExtractToMarkdownWithContext` | `(ctx context.Context, htmlBytes []byte, cfg ...Config) (string, error)` | 컨텍스트 포함 |
| `ExtractToMarkdownFromFileWithContext` | `(ctx context.Context, filePath string, cfg ...Config) (string, error)` | 파일 + 컨텍스트 |
| `ExtractToJSON` | `(htmlBytes []byte, cfg ...Config) ([]byte, error)` | HTML → JSON |
| `ExtractToJSONFromFile` | `(filePath string, cfg ...Config) ([]byte, error)` | 파일 → JSON |
| `ExtractToJSONWithContext` | `(ctx context.Context, htmlBytes []byte, cfg ...Config) ([]byte, error)` | 컨텍스트 포함 |
| `ExtractToJSONFromFileWithContext` | `(ctx context.Context, filePath string, cfg ...Config) ([]byte, error)` | 파일 + 컨텍스트 |

자세한 사용법과 예시는 [출력 형식](../modules/output)을 참조하세요.

## 링크 추출

| 함수 | 시그니처 | 설명 |
|------|------|------|
| `ExtractAllLinks` | `(htmlBytes []byte, cfg ...Config) ([]LinkResource, error)` | 모든 링크 추출 |
| `ExtractAllLinksFromFile` | `(filePath string, cfg ...Config) ([]LinkResource, error)` | 파일에서 링크 추출 |
| `ExtractAllLinksWithContext` | `(ctx context.Context, htmlBytes []byte, cfg ...Config) ([]LinkResource, error)` | 컨텍스트 포함 |
| `ExtractAllLinksFromFileWithContext` | `(ctx context.Context, filePath string, cfg ...Config) ([]LinkResource, error)` | 파일 + 컨텍스트 |

자세한 사용법과 예시는 [링크 추출](../modules/links)을 참조하세요.

## 배치 처리

| 함수 | 시그니처 | 설명 |
|------|------|------|
| `ExtractBatch` | `(htmlContents [][]byte, cfg ...Config) *BatchResult` | 배치 추출 |
| `ExtractBatchWithContext` | `(ctx context.Context, htmlContents [][]byte, cfg ...Config) *BatchResult` | 컨텍스트 포함 |
| `ExtractBatchFiles` | `(filePaths []string, cfg ...Config) *BatchResult` | 배치 파일 추출 |
| `ExtractBatchFilesWithContext` | `(ctx context.Context, filePaths []string, cfg ...Config) *BatchResult` | 파일 + 컨텍스트 |

자세한 사용법과 예시는 [배치 처리](../modules/batch)를 참조하세요.

## 패키지 함수 vs Processor

둘 다 내부적으로 `Processor`를 호출하지만, 리소스 재사용과 상태 보존에서 차이가 뚜렷합니다:

| 차원 | 패키지 함수 | [Processor](./processor) |
|------|--------|--------------------------|
| 캐시 | **없음**(풀링 설정 `MaxCacheEntries=0`) | 있음 (적중 시 딥카피 반환) |
| 통계 | 매번 재설정 (반납 시 `ResetStatistics`) | 누적, 언제든 `GetStatistics` 가능 |
| 감사 로그 | 매번 비움 (반납 시 `ClearAuditLog`) | 누적, `GetAuditLog`로 조회 가능 |
| 커스텀 `Config` | 매번 임시 Processor 생성+파괴 | 동일 인스턴스 재사용 |
| 라이프사이클 | 자동 관리 (풀/임시 인스턴스) | 수동 `defer Close()` 필요 |
| 적용 시나리오 | 일회성 호출, 스크립트, 저빈도 요청 | 고빈도 호출, 장기 실행 서비스, 캐시 필요 |

:::tip 선택 조언
단일 추출이나 간헐적 호출에는 패키지 함수가 가장 편리합니다; 루프, HTTP handler, 배치 처리에서 반복 추출하려면 장기 생존하는 `Processor`를 생성하고 재사용하면, 캐시를 활용해 오버헤드를 크게 줄일 수 있습니다.
:::
