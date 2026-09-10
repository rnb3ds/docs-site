---
sidebar_label: "기본 사용법"
title: "기본 사용법 - CyberGo html | 시나리오별 코드 예제 모음"
description: "CyberGo html 기본 사용법 시나리오 코드 모음: 본문 추출과 순수 텍스트 출력, 파일 읽기, Markdown·JSON 변환, 링크 그룹화, 미디어 정보, 배치 동시성과 타임아웃 제어 여섯 가지 대표 시나리오마다 컴파일 가능한 최소 예제와 심화 학습 입구를 제공합니다."
sidebar_position: 1
---

# 기본 사용법

이 페이지는 **시나리오별로 코드를 복사해 쓰는** 스피드시트 인덱스입니다: 각 시나리오는 최소 실행 가능 골격만 제공하므로 복사하면 바로 시작할 수 있습니다. 원리 설명과 고급 설정은 각 절 끝의 「더 보기」 링크를 따라 해당 가이드를 읽어보세요.

| 시나리오 | 핵심 호출 | 상세 페이지 |
|------|----------|--------|
| 본문과 순수 텍스트 | `html.Extract` / `html.ExtractText` | [콘텐츠 추출 실전](../guides/core-features/content-extraction) |
| 파일에서 추출 | `html.ExtractFromFile` | [콘텐츠 추출 실전](../guides/core-features/content-extraction) |
| Markdown / JSON 출력 | `html.ExtractToMarkdown` / `html.ExtractToJSON` | [출력 형식 실전](../guides/core-features/output-formats) |
| 링크 추출 | `html.ExtractAllLinks` + `html.GroupLinksByType` | [링크 추출 실전](../guides/core-features/link-extraction) |
| 미디어 정보 | `html.Extract` (`Videos` / `Audios`) | [미디어 추출 실전](../guides/core-features/media-extraction) |
| 배치와 타임아웃 재사용 | `html.New` + `ExtractBatchWithContext` | [배치 처리 실전](../guides/performance/batch-processing) |

## 본문과 순수 텍스트

`Extract` 는 한 번에 완전한 `Result` 를 반환합니다; 순수 텍스트만 필요할 때는 근접 함수 `ExtractText` 를 사용해 `string` 을 직접 받으세요:

```go
package main

import (
	"fmt"
	"log"

	"github.com/cybergodev/html"
)

func main() {
	data := []byte(`<html><head><title>Go 언어 튜토리얼</title></head><body><article><h1>Go 입문 가이드</h1><p>Go 는 정적 타입의 컴파일 언어입니다.</p><a href="https://go.dev">Go 공식 웹사이트</a></article></body></html>`)

	result, err := html.Extract(data) // 바이트를 전달하면 완전한 Result 반환
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(result.Title) // 출력: Go 언어 튜토리얼
	fmt.Println(result.Text)
	// 출력: Go 입문 가이드\n\nGo 는 정적 타입의 컴파일 언어입니다.\n\nGo 공식 웹사이트

	text, err := html.ExtractText(data) // 순수 텍스트만 필요할 때: string 을 직접 반환
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(len(text) > 0) // 출력: true (비어 있지 않음)
}
```

더 보기: [콘텐츠 추출 실전](../guides/core-features/content-extraction)

## 파일에서 추출

디스크 파일을 처리할 때는 `ExtractFromFile` 을 사용하며, 경로 순회 방지와 파일 크기 제한이 내장되어 있습니다:

```go
package main

import (
	"fmt"
	"log"

	"github.com/cybergodev/html"
)

func main() {
	result, err := html.ExtractFromFile("article.html")
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(result.Title) // 출력: article.html 의 <title> 내용
}
```

더 보기: [콘텐츠 추출 실전](../guides/core-features/content-extraction)

## Markdown / JSON 출력

콘텐츠 이전은 Markdown 으로, 프로그램 간 전송은 JSON 으로 변환합니다:

```go
package main

import (
	"fmt"
	"log"

	"github.com/cybergodev/html"
)

func main() {
	data := []byte(`<article><h1>Go 입문 가이드</h1><p>Go 는 컴파일 언어입니다.</p><img src="gopher.png" alt="Gopher" /><a href="https://go.dev">Go 공식 웹사이트</a></article>`)
	// Markdown 변환: 이미지와 링크가 자동으로 ![]() 와 []() 문법이 됩니다
	md, err := html.ExtractToMarkdown(data)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(md)
	// 출력: Go 입문 가이드\n\nGo 는 컴파일 언어입니다.\n\n![Gopher](gopher.png)\n[Go 공식 웹사이트](https://go.dev)
	jsonBytes, err := html.ExtractToJSON(data) // JSON 변환: 모든 메타데이터 필드 보존
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println("JSON 바이트 수:", len(jsonBytes))
	// JSON 바이트 수는 콘텐츠에 따라 다름 (text/title/images/links 등 필드 포함)
}
```

더 보기: [출력 형식 실전](../guides/core-features/output-formats)

## 링크 추출

본문과 독립적인 링크 추출 API 이며, 유형별 그룹화도 지원합니다:

```go
package main

import (
	"fmt"
	"log"

	"github.com/cybergodev/html"
)

func main() {
	data := []byte(`<html><body><article><h1>링크 예시</h1><p><a href="https://go.dev">Go 공식 웹사이트</a></p></article></body></html>`)

	links, err := html.ExtractAllLinks(data) // a/img/video/css/js 등 리소스를 포괄
	if err != nil {
		log.Fatal(err)
	}
	for _, link := range links {
		fmt.Printf("[%s] %s - %s\n", link.Type, link.Title, link.URL)
	}
	// 출력: [link] Go 공식 웹사이트 - https://go.dev
	groups := html.GroupLinksByType(links) // 유형별 그룹화
	fmt.Println("link 그룹:", len(groups["link"]))
	// 출력: link 그룹: 1
}
```

더 보기: [링크 추출 실전](../guides/core-features/link-extraction)

## 미디어 정보

비디오와 오디오 정보는 `Extract` 와 함께 반환되므로 별도 호출이 필요 없습니다:

```go
package main

import (
	"fmt"
	"log"

	"github.com/cybergodev/html"
)

func main() {
	data := []byte(`<html><body><article><h1>멀티미디어 페이지</h1>
<video poster="cover.jpg"><source src="https://example.com/video.mp4" type="video/mp4"></video>
<audio><source src="https://example.com/audio.mp3" type="audio/mpeg"></audio>
</article></body></html>`)
	result, err := html.Extract(data)
	if err != nil {
		log.Fatal(err)
	}
	for _, v := range result.Videos {
		fmt.Printf("비디오: %s (%s)\n", v.URL, v.Type)
	}
	for _, a := range result.Audios {
		fmt.Printf("오디오: %s (%s)\n", a.URL, a.Type)
	}
	// 출력:
	// 비디오: https://example.com/video.mp4 (video/mp4)
	// 오디오: https://example.com/audio.mp3 (audio/mpeg)
}
```

더 보기: [미디어 추출 실전](../guides/core-features/media-extraction)

## 배치, 타임아웃과 Processor 재사용

서버 측 전형적인 패턴: 전역으로 재사용 가능한 `Processor` 를 생성해 배치로 동시 추출하고, context 로 배치당 소요 시간을 제어합니다:

```go
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/cybergodev/html"
)

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	p, err := html.New(html.DefaultConfig()) // 동시성 안전, 전역 재사용 가능
	if err != nil {
		log.Fatal(err)
	}
	defer p.Close()
	pages := [][]byte{
		[]byte(`<html><body><article><h1>페이지 1</h1></article></body></html>`),
		[]byte(`<html><body><article><h1>페이지 2</h1></article></body></html>`),
	}
	batch := p.ExtractBatchWithContext(ctx, pages) // context 만료 시 미완료 항목은 Cancelled 로 계산
	fmt.Printf("성공: %d, 실패: %d\n", batch.Success, batch.Failed)
	// 출력: 성공: 2, 실패: 0
}
```

더 보기: [배치 처리 실전](../guides/performance/batch-processing) 와 [Processor 재사용과 캐시](../guides/performance/processor-cache)
