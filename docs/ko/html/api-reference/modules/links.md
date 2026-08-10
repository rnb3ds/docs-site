---
sidebar_label: "링크 추출"
title: "링크 추출 - CyberGo html | 리소스 링크 추출 API"
description: "CyberGo html 링크 추출 API: ExtractAllLinks 계열과 GroupLinksByType 으로 이미지·스크립트·CSS 리소스 링크를 추출해 유형별로 그룹화하며 URL 정렬·중복 제거와 필터 설정이 가능합니다."
sidebar_position: 2
---

# 링크 추출

독립적인 링크 추출 API 로, HTML 에서 모든 링크 리소스를 추출하고 유형별로 그룹화할 수 있습니다.

:::tip Extract 와의 주요 차이
`ExtractAllLinks`는 **HTML 정제 (sanitization) 를 적용하지 않습니다**(`EnableSanitization`이 여기서는 무효임). 따라서 `<script src>`, `<iframe>`, `<link>`, `<embed>` 같은 태그 안의 리소스 링크도 모두 추출됩니다. 이 리소스 링크를 열거할 수 있도록 하기 위함이며, `Extract` 경로에서는 보통 정제 과정에서 제거됩니다.
:::

:::info 결과 정렬과 중복 제거
`ExtractAllLinks`는 결과를 **URL 오름차순으로 정렬**하고 URL 로 중복을 제거합니다. 따라서 동일한 입력에 대해 여러 번 호출해도 완전히 동일한 결과가 나옵니다 (v1.4.2 부터). 결과 비교, 캐시 재사용, 재현 가능한 다운스트림 처리에 유리합니다. 동일한 URL 이 여러 태그에 나타나면 한 건만 유지됩니다.
:::

## 패키지 함수

```go
func ExtractAllLinks(htmlBytes []byte, cfg ...Config) ([]LinkResource, error)
func ExtractAllLinksFromFile(filePath string, cfg ...Config) ([]LinkResource, error)
func ExtractAllLinksWithContext(ctx context.Context, htmlBytes []byte, cfg ...Config) ([]LinkResource, error)
func ExtractAllLinksFromFileWithContext(ctx context.Context, filePath string, cfg ...Config) ([]LinkResource, error)
```

## Processor 메서드

```go
func (p *Processor) ExtractAllLinks(htmlBytes []byte) ([]LinkResource, error)
func (p *Processor) ExtractAllLinksFromFile(filePath string) ([]LinkResource, error)
func (p *Processor) ExtractAllLinksWithContext(ctx context.Context, htmlBytes []byte) ([]LinkResource, error)
func (p *Processor) ExtractAllLinksFromFileWithContext(ctx context.Context, filePath string) ([]LinkResource, error)
```

## 그룹화 도구

### GroupLinksByType

링크 유형별로 그룹화합니다.

```go
func GroupLinksByType(links []LinkResource) map[string][]LinkResource
```

```go
links, _ := html.ExtractAllLinks(data)
groups := html.GroupLinksByType(links)

for typ, items := range groups {
    fmt.Printf("유형 %s: %d개\n", typ, len(items))
}
```

## LinkResource

```go
type LinkResource struct {
    URL   string // 링크 주소
    Title string // 링크 제목
    Type  string // 링크 유형 (link, image, video, audio, media, css, js, icon)
}
```

## 링크 유형 상세

각 `Type`은 특정 HTML 태그 출처에 대응합니다:

| Type 값 | 출처 HTML 태그 | 제어 스위치 |
|---------|---------------|----------|
| `link` | `<a href>` | `IncludeContentLinks` / `IncludeExternalLinks` |
| `image` | `<img src>` | `IncludeImages` |
| `video` | `<video src>`, `<source type="video/*">`, `<iframe>`/`<embed>`/`<object>`(비디오 URL) | `IncludeVideos` |
| `audio` | `<audio src>`, `<source type="audio/*">` | `IncludeAudios` |
| `media` | `<source>`가 video/audio 인지 판정할 수 없을 때 | `IncludeVideos` / `IncludeAudios` |
| `css` | `<link rel="stylesheet">` | `IncludeCSS` |
| `js` | `<script src>` | `IncludeJS` |
| `icon` | `<link rel="icon">`, `<link rel="apple-touch-icon">` 등 | `IncludeIcons` |

:::info embed 링크의 특수 처리
`<iframe>`, `<embed>`, `<object>`의 `src`/`data`는 **비디오 URL**로 판정될 때만 (YouTube, Vimeo, Dailymotion 등 임베드 패턴 포함) 추출되며, 유형은 `video`로 기록됩니다. 비디오가 아닌 URL 은 수집되지 않습니다.
:::

## 설정

링크 추출 동작은 `Config`의 링크 필터링 필드로 제어할 수 있습니다:

```go
cfg := html.DefaultConfig()
cfg.IncludeImages = true
cfg.IncludeCSS = true
cfg.IncludeJS = true
cfg.IncludeExternalLinks = true
cfg.ResolveRelativeURLs = true
cfg.BaseURL = "https://example.com"
```

### 상대 URL 해석

`ResolveRelativeURLs=true`(기본값)일 때, 모든 유형의 상대 URL 은 `BaseURL`을 기준으로 절대 URL 로 통일하여 해석됩니다:

- 해석 로직은 `resolveURLIfEnabled`가 중앙에서 처리하며, 콘텐츠 링크, 이미지, 미디어, source, script, embed, link 태그를 **동일하게 취급**합니다
- `BaseURL`을 명시적으로 설정하면 **자동 감지를 건너뛰고** 호출자가 제공한 값을 직접 사용합니다
- `BaseURL`이 비어 있고 `ResolveRelativeURLs=true`일 때, 문서에서 BaseURL 을 자동으로 유추합니다 (아래 팁 참조)

### 내부와 외부 링크

콘텐츠 링크(`<a href>`)는 두 그룹의 스위치로 내부와 외부 링크를 각각 제어합니다:

| 스위치 | 제어 범위 | 판정 방식 |
|------|----------|----------|
| `IncludeContentLinks` | 내부 링크 | URL 자체가 상대 경로이거나, `BaseURL`과 같은 도메인 |
| `IncludeExternalLinks` | 외부 링크 | URL 이 절대 경로이고 `BaseURL`과 다른 도메인(`IsDifferentDomain`) |

기본값은 둘 다 `true`입니다 (모든 콘텐츠 링크 추출). 나머지 리소스 유형(이미지, CSS, JS 등)은 내/외부 구분의 영향을 받지 않으며, 각자의 `Include*` 스위치로만 제어됩니다.

### preload / prefetch 처리

`<link rel="preload" as="...">`와 `rel="prefetch"`는 `as` 속성에 따라 다른 유형으로 라우팅됩니다:

| `as` 속성값 | 분류 유형 | 제어 스위치 |
|-------------|----------|----------|
| `style` | `css` | `IncludeCSS` |
| `script` | `js` | `IncludeJS` |
| `image` | `image` | `IncludeImages` |
| `video` | `video` | `IncludeVideos` |
| `audio` | `audio` | `IncludeAudios` |

`dns-prefetch`, `preconnect`도 같은 라우팅을 거치지만, 보통 `as` 속성을 가지지 않으므로 수집되지 않습니다.

:::tip BaseURL 자동 감지
`ResolveRelativeURLs=true`이고 `BaseURL`이 **비어 있을 때**, 라이브러리는 HTML 문서 자체에서 BaseURL 을 자동으로 유추합니다. 다음 **우선순위** 순서대로 시도하여, 일치하는 항목이 있으면 그 즉시 반환합니다:

1. `<base href>` 태그;
2. `<meta property="og:url">` 또는 `<meta property="canonical">`의 `content`;
3. `<link rel="canonical" href>`;
4. 문서에서 처음으로 등장하는 절대 URL(`href`/`src`에서 base 추출).

`BaseURL`을 명시적으로 설정하면 **자동 감지를 건너뛰고** 호출자가 제공한 값을 우선 사용합니다.
:::

## 예시

```go
package main

import (
	"fmt"
	"log"

	"github.com/cybergodev/html"
)

func main() {
	data := []byte(`<html><head>
<link rel="stylesheet" href="/css/main.css">
<link rel="icon" href="/favicon.ico">
<script src="/js/app.js"></script>
</head><body>
<a href="/about">소개</a>
<img src="/img/logo.png" alt="Logo">
<video src="/media/intro.mp4"></video>
</body></html>`)

	cfg := html.DefaultConfig()
	cfg.BaseURL = "https://example.com"
	links, err := html.ExtractAllLinks(data, cfg)
	if err != nil {
		log.Fatal(err)
	}

	// 유형별로 그룹화한 뒤 순회하며 출력
	groups := html.GroupLinksByType(links)
	for typ, items := range groups {
		fmt.Printf("%s(%d개):\n", typ, len(items))
		for _, l := range items {
			fmt.Printf("  - %s [%s]\n", l.URL, l.Title)
		}
	}
}
```
