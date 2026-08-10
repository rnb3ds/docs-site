---
sidebar_label: "콘텐츠 추출 실전"
title: "콘텐츠 추출 실전 - CyberGo html | 추출 흐름 가이드"
description: "CyberGo html 콘텐츠 추출 실전: Extract 호출부터 Result까지의 추출 흐름, 스마트 문서 인식과 후보 노드 평가, Result 필드 해석, 커스텀 Scorer 본문 식별, 자동 인코딩 감지 처리와 실전 모범 사례를 다룹니다."
sidebar_position: 1
---

# 콘텐츠 추출 실전

이 가이드는 실제 시나리오를 통해 HTML 콘텐츠 추출의 작동 원리와 모범 사례를 이해하는 데 도움을 줍니다.

## 추출 프로세스 개요

`Extract`를 호출하면 라이브러리는 다음 단계를 실행합니다:

```text
HTML 입력 → 입력 검증 → 인코딩 감지 (자동 UTF-8 변환) → DOM 파싱 → 깊이 검증
    → 안전한 정제 (선택) → 기사 감지 (선택) → 콘텐츠 추출 → 포맷팅 → Result 반환
```

깊이 검증은 정제 **이전에** 실행됩니다. 먼저 DOM 깊이를 반복적으로 (iterative) 검증해 (재귀 순회로 인한 스택 오버플로 회피), 그 다음 파싱된 DOM 트리에 대해 안전한 정제를 수행합니다. 둘 모두 파싱된 노드 트리를 대상으로 하므로 DOM 파싱이 항상 그 둘보다 먼저 일어납니다.

각 단계는 [설정](../../api-reference/core/config)을 통해 커스터마이즈할 수 있습니다.

## 기본 텍스트 추출

가장 간단한 사용법은 HTML 바이트에서 콘텐츠를 추출하는 것입니다:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    data := []byte(`<html>
        <head><title>Go 언어 튜토리얼</title></head>
        <body>
            <article>
                <h1>Go 입문 가이드</h1>
                <p>Go 는 정적 타입의 컴파일 언어로, 동시성을 내장 지원합니다.</p>
                <p>컴파일 속도가 빠르고 배포가 간단하여 고성능 서비스 구축에 적합합니다.</p>
                <img src="gopher.png" alt="Gopher 마스코트" />
                <a href="https://go.dev">Go 공식 웹사이트</a>
            </article>
        </body>
    </html>`)

    result, err := html.Extract(data)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println("제목:", result.Title)
    // 제목: Go 언어 튜토리얼

    fmt.Println("본문:", result.Text)
    // 본문: Go 입문 가이드
    //       Go 는 정적 타입의 컴파일 언어로, 동시성을 내장 지원합니다.
    //       컴파일 속도가 빠르고 배포가 간단하여 고성능 서비스 구축에 적합합니다.
    //       Go 공식 웹사이트

    fmt.Println("단어 수:", result.WordCount)
    // 단어 수: 7

    fmt.Println("읽기 시간:", result.ReadingTime)
    // 읽기 시간: 2.1s(200 단어/분 기준)

    fmt.Println("이미지:", len(result.Images))
    // 이미지: 1

    fmt.Println("링크:", len(result.Links))
    // 링크: 1
}
```

## 추출 결과 이해하기

`Result`는 다음 필드를 포함합니다:

| 필드 | 타입 | 설명 |
|------|------|------|
| `Title` | `string` | 페이지 제목, `<title>`을 우선, 그 다음 `<h1>`, `<h2>` |
| `Text` | `string` | 본문 콘텐츠 (정제됨, 태그와 불필요한 공백 제거) |
| `Images` | `[]ImageInfo` | 추출된 이미지 목록 |
| `Links` | `[]LinkInfo` | 추출된 링크 목록 |
| `Videos` | `[]VideoInfo` | 추출된 비디오 목록 |
| `Audios` | `[]AudioInfo` | 추출된 오디오 목록 |
| `WordCount` | `int` | 본문 단어 수 |
| `ReadingTime` | `time.Duration` | 예상 읽기 시간 (200 단어/분) |
| `ProcessingTime` | `time.Duration` | 처리 소요 시간 |

## 파일에서 추출

로컬 HTML 파일을 처리할 때는 `ExtractFromFile`을 사용합니다:

```go
result, err := html.ExtractFromFile("article.html")
if err != nil {
    log.Fatal(err)
}
fmt.Println("제목:", result.Title)
```

파일 작업에는 다음과 같은 보안 검사가 내장되어 있습니다:
- 경로 순회 공격 자동 감지 (예: `../../../etc/passwd`)
- 파일 크기는 `MaxInputSize`로 제한
- 오류 메시지에서 `SafePath()`로 전체 경로 숨김

## 문서 인식 알고리즘

`ExtractArticle`이 `true`(기본값) 인 경우, 라이브러리는 페이지의 "주요 콘텐츠 영역"을 자동으로 식별합니다.

### 작동 원리

1. **후보 노드 평가**: DOM 트리를 순회하며 각 요소 노드에 대해 콘텐츠 관련성 점수를 매깁니다
2. **최적 후보 선택**: 가장 높은 점수의 노드를 콘텐츠 컨테이너로 선택합니다
3. **폴백 메커니즘**: 적합한 후보를 찾지 못하면 `<body>` 노드로 폴백합니다

### 기본 스코어러의 신호 차원

내장 `DefaultScorer`는 다차원 신호를 종합적으로 평가하여, 가장 높은 점수의 컨테이너를 선택합니다:

| 차원 | 긍정 신호 | 부정 신호 |
|------|----------|----------|
| **태그 의미** | `<article>`(+1000), `<main>`(+900), `<section>`(+300), `<body>`(+100) | `nav`/`aside`/`footer`/`header`/`script`/`style`은 즉시 0 반환 |
| **class/id 패턴** | `content`/`article`/`post`/`main`/`entry`/`story`(강한 긍정); `blog`/`news`/`detail`/`page`(중간 긍정) | `comment`/`sidebar`/`nav`/`ad`/`menu`(강한 부정); `widget`/`share`/`social`/`related`(중간 부정); `promo`/`banner`/`sponsor`(약한 부정) |
| **단락 밀도** | 하위 트리의 `<p>` 수 × 배율 가점(단락이 많을수록 본문일 가능성 높음) | — |
| **텍스트 길이** | 임계값 초과의 긴 텍스트 가점; 미만의 짧은 텍스트 감점 | — |
| **콘텐츠 밀도** | 텍스트/태그 비율이 높을 때 증폭 계수 적용 | 비율이 낮을 때 감쇠 계수 적용 |
| **링크 밀도** | — | 텍스트가 짧고 링크가 조밀할 때 페널티 부과(내비게이션 바나 사이트맵일 수 있음) |
| **구두점 특징** | 쉼표 조밀(`,` 또는 `，`)은 산문체를 암시, 가점 | — |
| **ARIA role** | `role="main"`/`role="article"`(+500) | `role="navigation"`/`role="complementary"`(-400) |
| **숨김 요소** | — | `style="display:none"`/`visibility:hidden` 또는 `hidden` 속성의 노드는 제거됨 |

:::tip 레이아웃 래퍼의 면제
class/id 에 콘텐츠 신호(`content`/`article`)와 제거 신호(예: `sidebar`)가 동시에 포함된 경우 — 전형적으로 CSS 레이아웃 클래스 `content-sidebar` — 스코어러는 해당 노드를 **제거하지 않습니다**. 주 콘텐츠를 감싸고 있기 때문입니다. 의미 태그 `<article>`/`<main>`(또는 `role="main"`/`role="article"`)은 class/id 제거 휴리스틱에서 일률적으로 면제되어, `<article class="post-with-sidebar">`가 잘못 삭제되지 않도록 보장합니다.
:::

:::warning 문서 인식이 만능은 아님
문서 인식은 뉴스, 블로그, 문서 등 명확한 "본문 영역"이 있는 페이지에 가장 적합합니다. 내비게이션 페이지, 목록 페이지, 갤러리 등 비문서형 페이지에서는 본문을 정확히 찾지 못할 수 있습니다 — 이 경우 `ExtractArticle = false`로 설정하여 전체 `<body>` 콘텐츠를 추출할 수 있습니다.
:::

:::tip 적용 시나리오
문서 인식은 뉴스, 블로그, 문서 등 명확한 "본문 영역"이 있는 페이지에 가장 적합합니다. 내비게이션 페이지, 목록 페이지에서는 본문을 정확하게 찾지 못할 수 있습니다.
:::

### 커스텀 평가

`Scorer` 인터페이스를 구현하여 평가 로직을 커스터마이즈합니다:

```go
type myScorer struct{}

func (s myScorer) Score(node html.ContentNode) int {
    // 노드 특성에 따라 점수 반환
    class := node.AttrValue("class")
    if strings.Contains(class, "article") || strings.Contains(class, "post") {
        return 100
    }
    if strings.Contains(class, "sidebar") || strings.Contains(class, "comment") {
        return -50
    }
    return 0
}

func (s myScorer) ShouldRemove(node html.ContentNode) bool {
    // true 를 반환하면 해당 노드를 제거
    return node.Data() == "nav" || node.Data() == "footer"
}
```

:::tip 참고
이 예시의 `strings.Contains`는 표준 라이브러리 `strings` 패키지에서 가져옵니다. 완전한 실행 가능한 예시는 [테스트와 사용자 정의 확장](../integration/testing-custom)을 참조하세요.
:::

## 텍스트만 추출

이미지, 링크 등 메타데이터 없이 순수 텍스트만 필요한 경우:

```go
text, err := html.ExtractText(data)
if err != nil {
    log.Fatal(err)
}
fmt.Println(text)
```

텍스트 분석, 검색 인덱스 구축 등의 시나리오에서 매우 실용적입니다.

## 테이블 렌더링

HTML 의 `<table>`은 `TableFormat` 설정에 따라 추출된 텍스트에 렌더링됩니다:

```go
cfg := html.DefaultConfig()
cfg.TableFormat = "markdown" // 기본값; 또는 "html"
```

| 형식 | 렌더링 효과 | 적용 시나리오 |
|------|----------|----------|
| `"markdown"` | Markdown 테이블(헤더 구분행 포함); `colspan`은 반복 셀로 전개; 너비 정의만 있는 구조행은 건너뜀 | 사람이 읽기, Markdown 소비 |
| `"html"` | 원본 HTML `<table>` 태그 유지(`colspan`/`rowspan` 그대로 보존); 구조행 유지 | 정확한 테이블 구조가 필요한 다운스트림 처리 |

:::tip 형식 대소문자 구분 없음
`TableFormat` 값은 대소문자를 구분하지 않으며(`"Markdown"`과 `"markdown"`이 동일), 빈 값은 `"markdown"`으로 폴백됩니다.
:::

예시 — 테이블이 포함된 HTML 추출:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    data := []byte(`<html><body><article>
        <h1>가격표</h1>
        <table>
            <tr><th>제품</th><th>가격</th></tr>
            <tr><td>베이직</td><td>무료</td></tr>
            <tr><td>프로</td><td>₩9,900/월</td></tr>
        </table>
    </article></body></html>`)

    result, err := html.Extract(data)
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(result.Text)
    // 출력(TableFormat = "markdown"일 때):
    // 가격표
    //
    // | 제품   | 가격      |
    // |--------|-----------|
    // | 베이직 | 무료      |
    // | 프로   | ₩9,900/월 |
}
```

## 비 UTF-8 인코딩 처리

라이브러리는 15+ 문자 인코딩 (UTF-8, GBK, Shift_JIS, Windows-1252 등 포함) 을 자동으로 감지하고 UTF-8 로 자동 변환합니다.

```go
// 자동 인코딩 감지
result, err := html.Extract(gbkEncodedData)

// 수동으로 인코딩 지정
cfg := html.DefaultConfig()
cfg.Encoding = "gbk"
result, err = html.Extract(gbkEncodedData, cfg)
```

## 컨텍스트와 타임아웃

대용량 파일이나 신뢰할 수 없는 출처의 HTML 의 경우, 컨텍스트가 포함된 버전을 사용하는 것이 좋습니다:

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

result, err := html.ExtractWithContext(ctx, data)
if errors.Is(err, html.ErrProcessingTimeout) {
    log.Println("처리 타임아웃")
}
```

## 다음 단계

- [출력 형식 실전](./output-formats) - 시나리오에 맞는 출력 형식 선택
- [Processor 재사용과 캐시](../performance/processor-cache) - 고빈도 호출의 성능 최적화
- [API 레퍼런스: 패키지 함수](../../api-reference/core/functions) - 전체 함수 시그니처
