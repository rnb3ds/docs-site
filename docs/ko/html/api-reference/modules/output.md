---
sidebar_label: "출력 형식"
title: "출력 형식 - CyberGo html | Markdown·JSON 출력"
description: "CyberGo html 출력 형식 API: ExtractToMarkdown, ExtractToJSON 패키지 함수와 Processor 메서드로 바이트나 파일을 Markdown·JSON 으로 변환하며 InlineImageFormat·InlineLinkFormat 옵션을 제공합니다."
sidebar_position: 1
---

# 출력 형식

HTML 라이브러리는 추출 결과를 Markdown 또는 JSON 형식으로 출력하는 것을 지원합니다.

## Markdown 출력

HTML 콘텐츠를 추출하여 Markdown 형식으로 변환합니다. 내부적으로 `InlineImageFormat`과 `InlineLinkFormat`을 모두 `markdown`으로 설정한 뒤 추출하며, 최종적으로 `Result.Text`를 반환합니다.

:::warning 캐시 동작 차이
`ExtractToMarkdown`은 주 Processor 의 캐시에 적중하지도, 쓰지도 않습니다. 이 메서드는 `buildFormatProcessor`로 **임시 Processor**를 생성합니다:

- 현재 설정의 **값 복사**를 수행합니다(`config`는 `New()` 이후 불변이므로 복사에 락이 필요 없음), 그 후 두 개의 포맷 필드를 덮어씁니다 — 포맷 설정은 공유 설정에 다시 기록되지 않습니다
- **캐시 비활성화**(`MaxCacheEntries = 0`): 주 Processor 의 캐시를 읽거나 쓰지 않아, 포맷별 결과가 주 캐시를 오염시키는 것을 방지합니다
- **주 Processor 의 Scorer**(점수 매기기 도구)를 재사용하지만, **독립적이고 비활성화된 감사 수집기**를 사용하여 주 Processor 의 `Close()`가 진행 중인 추출과 경쟁하지 않도록 합니다
- 이 메커니즘은 스레드 안전합니다

추출이 캐시를 거치게 하려면 일반 `Extract`를 사용하고 `InlineImageFormat`/`InlineLinkFormat`을 직접 설정하세요.
:::

### 패키지 함수

```go
func ExtractToMarkdown(htmlBytes []byte, cfg ...Config) (string, error)
func ExtractToMarkdownFromFile(filePath string, cfg ...Config) (string, error)
func ExtractToMarkdownWithContext(ctx context.Context, htmlBytes []byte, cfg ...Config) (string, error)
func ExtractToMarkdownFromFileWithContext(ctx context.Context, filePath string, cfg ...Config) (string, error)
```

### Processor 메서드

```go
func (p *Processor) ExtractToMarkdown(htmlBytes []byte) (string, error)
func (p *Processor) ExtractToMarkdownFromFile(filePath string) (string, error)
func (p *Processor) ExtractToMarkdownWithContext(ctx context.Context, htmlBytes []byte) (string, error)
func (p *Processor) ExtractToMarkdownFromFileWithContext(ctx context.Context, filePath string) (string, error)
```

### 예시

```go
package main

import (
	"fmt"
	"log"

	"github.com/cybergodev/html"
)

func main() {
	data := []byte(`<html><head><title>예제 문서</title></head><body>
<p>본문 단락, 이미지 한 장을 포함합니다.</p>
<p><img src="/img/photo.png" alt="예제 이미지"></p>
<p><a href="https://example.com">예제 사이트</a>에서 더 알아보세요.</p>
</body></html>`)

	md, err := html.ExtractToMarkdown(data, html.MarkdownConfig())
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(md)
	// 출력: 이미지와 링크가 포함된 Markdown 텍스트,
	//       예: ![예제 이미지](/img/photo.png) 및 [예제 사이트](https://example.com)
}
```

### 포맷 옵션

`ExtractToMarkdown`은 고정적으로 `markdown` 포맷을 사용합니다. 다른 인라인 포맷이 필요하다면 일반 `Extract`과 다음 `Config` 필드를 함께 사용할 수 있습니다:

| 필드 | 선택값 | 효과 |
|------|--------|------|
| `InlineImageFormat` | `none`(기본값) | 이미지를 텍스트에 인라인하지 않음 |
| | `markdown` | `![alt](url)` 출력 |
| | `html` | `<img src="url" alt="alt">` 출력 |
| | `placeholder` | 플레이스홀더 `[IMAGE:N]` 출력 |
| `InlineLinkFormat` | `none`(기본값) | 링크를 텍스트에 인라인하지 않음 |
| | `markdown` | `[text](url)` 출력 |
| | `html` | `<a href="url">text</a>` 출력 |

### Markdown 포맷팅 메커니즘

인라인 이미지와 링크는 **플레이스홀더 교체**로 구현되며, 두 단계로 진행됩니다:

1. **텍스트 추출 단계**: 각 `<img>`는 텍스트 흐름에 플레이스홀더 `[IMAGE:N]`을 삽입하고, 각 `<a>`는 쌍으로 된 `[LINK:N]...[/LINK]`를 삽입합니다 (`N`은 위치 번호로, `Images`/`Links` 슬라이스의 `Position`과 일대일 대응)
2. **포맷팅 단계**: `InlineImageFormat`/`InlineLinkFormat`에 따라 플레이스홀더를 대상 포맷(markdown/html)으로 교체하거나, 직접 제거합니다 (none)

원본 텍스트의 리터럴 `[`/`]`가 플레이스홀더로 오인되는 것을 방지하기 위해, 추출 단계에서 이스케이프 처리(`\[`, `\]`, `\\`)를 하고 포맷팅 단계에서 복원합니다.

## JSON 출력

추출 결과를 JSON 바이트로 직렬화합니다. Markdown 과 달리 이 메서드는 주 Processor 의 일반 `Extract`를 거칩니다 (캐시 활성화 시 적중/기록), 이후 `json.Marshal`로 직렬화합니다.

### 패키지 함수

```go
func ExtractToJSON(htmlBytes []byte, cfg ...Config) ([]byte, error)
func ExtractToJSONFromFile(filePath string, cfg ...Config) ([]byte, error)
func ExtractToJSONWithContext(ctx context.Context, htmlBytes []byte, cfg ...Config) ([]byte, error)
func ExtractToJSONFromFileWithContext(ctx context.Context, filePath string, cfg ...Config) ([]byte, error)
```

### Processor 메서드

```go
func (p *Processor) ExtractToJSON(htmlBytes []byte) ([]byte, error)
func (p *Processor) ExtractToJSONFromFile(filePath string) ([]byte, error)
func (p *Processor) ExtractToJSONWithContext(ctx context.Context, htmlBytes []byte) ([]byte, error)
func (p *Processor) ExtractToJSONFromFileWithContext(ctx context.Context, filePath string) ([]byte, error)
```

### 예시

```go
package main

import (
	"fmt"
	"log"

	"github.com/cybergodev/html"
)

func main() {
	data := []byte(`<html><head><title>예제 문서</title></head><body>
<p>본문 단락입니다.</p>
<p><img src="/img/photo.png" alt="예제 이미지"></p>
<a href="https://example.com">예제 사이트</a>
</body></html>`)

	jsonBytes, err := html.ExtractToJSON(data)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(string(jsonBytes))
	// 출력: text/title/images/links 등의 필드를 포함한 JSON 문자열
}
```

### JSON 출력 구조

JSON 직렬화는 `Result.MarshalJSON()`의 커스텀 구현으로, 내부 구조체 `jsonResult`에 대응합니다:

| JSON 필드 | 타입 | 출처 |
|-----------|------|------|
| `text` | string | `Result.Text`(추출된 본문) |
| `title` | string | `Result.Title`(문서 제목) |
| `images` | array | `Result.Images`(`omitempty`, 비어 있으면 생략) |
| `links` | array | `Result.Links`(`omitempty`) |
| `videos` | array | `Result.Videos`(`omitempty`) |
| `audios` | array | `Result.Audios`(`omitempty`) |
| `processing_time_ms` | int | `Result.ProcessingTime`을 **밀리초**로 변환 |
| `word_count` | int | `Result.WordCount` |
| `reading_time_ms` | int | `Result.ReadingTime`을 **밀리초**로 변환 |

참고로 `ProcessingTime`과 `ReadingTime`은 `Result` 구조체에서 `json:"-"` 태그를 가집니다 (표준 직렬화 시 건너뜀), 커스텀 `MarshalJSON`에서만 밀리초 형태로 출력에 포함됩니다. JSON 포맷은 외부 소비용이며, **`UnmarshalJSON`은 구현되지 않아** `Result`로 그대로 역직렬화할 수 없습니다.

:::tip Result.MarshalJSON
`Result`는 `json.Marshaler` 인터페이스를 구현합니다. `ProcessingTime`과 `ReadingTime` 필드에는 `json:"-"` 태그가 있어 표준 직렬화에서는 건너뛰지만, 커스텀 `MarshalJSON()` 메서드를 통해 밀리초 단위로 출력에 포함됩니다.
:::
