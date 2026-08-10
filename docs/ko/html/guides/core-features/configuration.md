---
sidebar_label: "설정 실전"
title: "설정 실전 - CyberGo html | Config 필드 선택 가이드"
description: "CyberGo html 설정 실전: DefaultConfig 등 4종 프리셋 선택, 6개 주요 필드 그룹 안내, 일반적인 설정 조합 예제와 Validate 검증으로 30개 이상의 필드 중 올바른 설정을 빠르게 선택할 수 있도록 돕습니다."
sidebar_position: 6
---

# 설정 실전

`Config` 구조체에는 30개 이상의 필드가 있지만, 일상적인 사용에서는 몇 가지 주요 설정 그룹만 이해하면 됩니다. 이 가이드는 시나리오에 맞는 설정을 빠르게 선택하는 데 도움을 줍니다. 전체 필드 설명은 [API 레퍼런스 — 설정](../../api-reference/core/config)을 참조하세요.

## 네 가지 프리셋

라이브러리는 대부분의 시나리오를 포괄하는 네 가지 프리셋을 제공합니다:

| 프리셋 | 적용 시나리오 | 주요 차이 |
|------|----------|----------|
| `DefaultConfig()` | 일반 추출 | 모든 기능 활성화, 안전한 기본값 |
| `HighSecurityConfig()` | 신뢰할 수 없는 입력 | 제한 강화, 감사 활성화, 깊이 상한 하향 |
| `TextOnlyConfig()` | 순수 텍스트만 필요 | 모든 미디어 보존 비활성화, 최대 성능 |
| `MarkdownConfig()` | Markdown 출력 | 인라인 이미지/링크를 Markdown 형식으로 변환 |

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    data := []byte(`<html><body><h1>제목</h1><p>본문 내용</p></body></html>`)

    // 대부분의 시나리오: 기본 설정 직접 사용
    p1, _ := html.New()
    defer p1.Close()
    r1, _ := p1.Extract(data)
    fmt.Println(r1.Title)

    // 순수 텍스트만 필요 (예: 검색 엔진 인덱스)
    p2, _ := html.New(html.TextOnlyConfig())
    defer p2.Close()

    // Markdown 출력 (예: CMS 마이그레이션)
    p3, _ := html.New(html.MarkdownConfig())
    defer p3.Close()
    md, _ := p3.ExtractToMarkdown(data)
    fmt.Println(md)
}
```

:::tip 프리셋에서 시작하기
잘 모를 때는 `DefaultConfig()`에서 시작하여 필요에 따라 개별 필드를 조정하세요. 프리셋끼리 조합할 수 있습니다 — 하나의 프리셋을 가져온 뒤 필드를 덮어쓰세요:
:::

<!-- check-code: skip -->
```go
cfg := html.HighSecurityConfig()
cfg.PreserveImages = false // 고보안 기반에서 이미지 추가 비활성화
processor, _ := html.New(cfg)
```

## 6개 주요 필드 그룹 안내

### 리소스 관리

메모리 사용량과 성능을 제어합니다. 일상적인 개발에서는 보통 조정할 필요가 없습니다.

| 필드 | 기본값 | 설명 |
|------|--------|------|
| `MaxInputSize` | 50 MB | 최대 입력 크기, 메모리 고갈 방지 |
| `MaxCacheEntries` | 2000 | 캐시 항목 수 상한; 0으로 설정 시 캐시 비활성화 |
| `CacheTTL` | 1시간 | 캐시 유지 시간 |
| `CacheCleanup` | 5분 | 백그라운드 만료 캐시 정리 간격 |
| `WorkerPoolSize` | 4 | 배치 처리 동시성 (1–256) |
| `ProcessingTimeout` | 30초 | 단일 문서 처리 타임아웃; 0으로 설정 시 무제한 |

:::warning 캐시는 Processor 인스턴스에만 적용
패키지 수준 함수(예: `html.Extract`)는 풀링된 Processor를 사용하며, 호출할 때마다 캐시를 비웁니다. 캐시가 필요하면 `html.New()`로 독립 Processor를 생성하세요. 자세한 내용은 [Processor 재사용과 캐시](../performance/processor-cache)를 참조하세요.
:::

### 보안

보안 설정은 프로덕션 환경에서 반드시 주의해야 할 중요 사항입니다. 전체 보안 기능 소개는 [보안 개요](../security/)를 참조하세요.

| 필드 | 기본값 | 설명 |
|------|--------|------|
| `EnableSanitization` | `true` | HTML 소독 (위험한 태그/속성 제거) |
| `MaxDepth` | 500 | DOM 중첩 깊이 상한, 스택 오버플로 방지 |
| `AllowedBaseDir` | `""` | 파일 작업 샌드박스 디렉토리; 빈 값 = 제한 없음 |
| `Audit` | 비활성화 | 보안 감사 로그 설정 |

:::warning AllowedBaseDir
사용자가 제공한 파일 경로를 처리할 때는 반드시 `AllowedBaseDir`을 설정하세요. OS 파일 핸들을 통해 실제 경로를 해석하여 (심볼릭 링크와 Windows junction 우회 방지).
:::

### 콘텐츠 추출

HTML에서 어떤 콘텐츠를 추출할지 제어합니다.

| 필드 | 기본값 | 설명 |
|------|--------|------|
| `ExtractArticle` | `true` | 지능형 문서 인식 (본문 콘텐츠 자동 위치 파악) |
| `PreserveImages` | `true` | 이미지 정보 보존 |
| `PreserveLinks` | `true` | 링크 정보 보존 |
| `PreserveVideos` | `true` | 비디오 추출 |
| `PreserveAudios` | `true` | 오디오 추출 |

불필요한 미디어 타입을 비활성화하면 성능이 향상됩니다:

<!-- check-code: skip -->
```go
cfg := html.DefaultConfig()
cfg.PreserveVideos = false
cfg.PreserveAudios = false
// 텍스트, 이미지, 링크만 추출
```

### 출력 형식

텍스트 출력에서 이미지와 링크의 표현 방식을 제어합니다. 자세한 내용은 [출력 형식 실전](./output-formats)을 참조하세요.

| 필드 | 기본값 | 선택 가능한 값 |
|------|--------|--------|
| `InlineImageFormat` | `"none"` | `"none"`, `"markdown"`, `"html"`, `"placeholder"` |
| `InlineLinkFormat` | `"none"` | `"none"`, `"markdown"`, `"html"` |
| `TableFormat` | `"markdown"` | `"markdown"`, `"html"` |
| `Encoding` | `""`(자동) | `"utf-8"`, `"gbk"`, `"shift_jis"`, `"windows-1252"` 등 |

`Encoding`을 비워두면 자동 감지됩니다. 수동으로 지정하면 감지 단계를 건너뛰어 성능이 향상되지만, 인코딩을 확실히 알 때만 사용하세요. 자세한 내용은 [인코딩 감지 실전](./encoding-detection)을 참조하세요.

### 링크 추출

다음 필드는 `ExtractAllLinks`에서만 적용되며, 어떤 타입의 리소스 링크를 추출할지 제어합니다. 자세한 내용은 [링크 추출 실전](./link-extraction)을 참조하세요.

| 필드 | 기본값 | 설명 |
|------|--------|------|
| `ResolveRelativeURLs` | `true` | 상대 URL을 절대 URL로 해석 |
| `BaseURL` | `""` | 해석 기준; 빈 값일 때 HTML에서 자동 감지 |
| `IncludeImages` | `true` | `<img>` 링크 포함 |
| `IncludeVideos` | `true` | `<video>`/`<iframe>` 링크 포함 |
| `IncludeAudios` | `true` | `<audio>` 링크 포함 |
| `IncludeCSS` | `true` | `<link rel="stylesheet">` 포함 |
| `IncludeJS` | `true` | `<script src>` 포함 |
| `IncludeContentLinks` | `true` | `<a href>` 내부 링크 포함 |
| `IncludeExternalLinks` | `true` | 외부 링크 포함 |
| `IncludeIcons` | `true` | favicon/icon 포함 |

:::tip 링크 추출 vs 콘텐츠 추출
`Include*` 필드는 `ExtractAllLinks`에만 영향을 줍니다. 콘텐츠 추출(`Extract`)에서의 링크 보존은 `PreserveLinks`가 제어합니다.
:::

### 확장

| 필드 | 설명 |
|------|------|
| `Scorer` | 커스텀 콘텐츠 평가기; nil일 때 DefaultScorer 사용 |

커스텀 Scorer로 특정 웹사이트에 맞춰 문서 인식을 최적화할 수 있습니다. 자세한 내용은 [테스트와 사용자 정의 확장](../integration/testing-custom)을 참조하세요.

## 일반적인 설정 조합

### 웹 크롤러

고빈도 배치 크롤링 시나리오에서는 동시성을 높이고 타임아웃을 줄이세요:

```go
package main

import (
    "log"
    "time"

    "github.com/cybergodev/html"
)

func main() {
    cfg := html.DefaultConfig()
    cfg.WorkerPoolSize = 8                          // 배치 동시성 향상
    cfg.ProcessingTimeout = 10 * time.Second        // 타임아웃 단축
    cfg.PreserveVideos = false                      // 크롤러는 비디오 불필요
    cfg.PreserveAudios = false

    processor, err := html.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer processor.Close()

    // 배치 추출
    pages := [][]byte{[]byte("<html><body>페이지1</body></html>")}
    batch := processor.ExtractBatch(pages)
    log.Printf("성공 %d, 실패 %d", batch.Success, batch.Failed)
}
```

### API 백엔드 서비스

사용자가 제출한 HTML을 처리할 때는 고보안 설정을 사용하고 파일 디렉토리를 제한하세요:

```go
package main

import (
    "log"

    "github.com/cybergodev/html"
)

func main() {
    cfg := html.HighSecurityConfig()
    cfg.AllowedBaseDir = "/var/www/uploads" // 파일 디렉토리 제한

    processor, err := html.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer processor.Close()

    // 사용자 업로드 HTML 파일 처리
    result, err := processor.ExtractFromFile("/var/www/uploads/user.html")
    if err != nil {
        log.Fatal(err)
    }
    log.Println(result.Title)
}
```

### 콘텐츠 마이그레이션 도구

구 사이트의 HTML을 Markdown으로 변환하고, 링크를 보존하며 상대 URL을 해석합니다:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    cfg := html.MarkdownConfig()
    cfg.ResolveRelativeURLs = true
    cfg.BaseURL = "https://old-site.example.com"

    processor, err := html.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer processor.Close()

    data := []byte(`<html><body><article><h1>오래된 글</h1><a href="/post/123">링크</a></article></body></html>`)
    md, err := processor.ExtractToMarkdown(data)
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(md)
}
```

## Validate

모든 설정은 `html.New()`에 전달될 때 자동으로 검증됩니다. 수동으로 `Validate()`를 호출하여 미리 확인할 수도 있습니다:

<!-- check-code: skip -->
```go
cfg := html.DefaultConfig()
cfg.MaxInputSize = -1 // 의도적으로 잘못된 값 설정
if err := cfg.Validate(); err != nil {
    log.Fatal(err) // html: invalid config: MaxInputSize=-1, must be positive
}
```

검증 규칙에는 필드 범위 검사와 형식 문자열 검증이 포함됩니다. 잘못된 설정은 `*ConfigError`를 반환하며, `errors.Is(err, html.ErrInvalidConfig)`로 판별할 수 있습니다. 전체 필드 제약 사항은 [API 레퍼런스 — 설정](../../api-reference/core/config)을 참조하세요.
