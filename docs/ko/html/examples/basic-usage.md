---
sidebar_label: "기본 사용법"
title: "기본 사용법 - CyberGo html | 실행 가능 예제 모음"
description: "CyberGo html 기본 예제: 콘텐츠 추출, 파일 추출, 순수 텍스트, Markdown·JSON 출력, 링크 그룹화, 미디어 추출, Processor 재사용, 동시성 배치 처리 등 실행 가능한 완전한 코드를 모았습니다."
sidebar_position: 1
---

# 기본 예제

## 기본 추출

HTML 바이트에서 제목, 본문 및 미디어 정보를 추출합니다:

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
                <p>Go 는 Google 이 개발한 오픈소스 프로그래밍 언어입니다.</p>
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
    fmt.Println("본문:", result.Text)
    fmt.Println("단어 수:", result.WordCount)
    fmt.Println("읽기 시간:", result.ReadingTime)
    // 출력:
    // 제목: Go 언어 튜토리얼
    // 본문: Go 입문 가이드
    //
    //       Go 는 Google 이 개발한 오픈소스 프로그래밍 언어입니다.
    //
    //       Go 공식 웹사이트
    // 단어 수: 8
    // 읽기 시간: 2.4s
}
```

## 파일에서 추출

```go
result, err := html.ExtractFromFile("article.html")
if err != nil {
    log.Fatal(err)
}
fmt.Println(result.Title)
```

## 텍스트만 추출

```go
text, err := html.ExtractText(data)
if err != nil {
    log.Fatal(err)
}
fmt.Println(text)
```

## Markdown 출력

```go
md, err := html.ExtractToMarkdown(data)
if err != nil {
    log.Fatal(err)
}
fmt.Println(md)
```

## 링크 추출

```go
links, err := html.ExtractAllLinks(data)
if err != nil {
    log.Fatal(err)
}

for _, link := range links {
    fmt.Printf("[%s] %s - %s\n", link.Type, link.Title, link.URL)
}

// 유형별 그룹화
groups := html.GroupLinksByType(links)
for typ, items := range groups {
    fmt.Printf("%s: %d개\n", typ, len(items))
}
```

## Processor 사용

```go
p, err := html.New(html.DefaultConfig())
if err != nil {
    log.Fatal(err)
}
defer p.Close()

// Processor 재사용으로 여러 페이지 처리
for _, page := range pages {
    result, err := p.Extract(page)
    if err != nil {
        log.Printf("처리 실패: %v", err)
        continue
    }
    fmt.Println(result.Title)
}

// 통계 확인
stats := p.GetStatistics()
fmt.Printf("처리됨: %d, 캐시 적중: %d\n",
    stats.TotalProcessed, stats.CacheHits)
```

## 타임아웃 제어

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

result, err := html.ExtractWithContext(ctx, data)
if err != nil {
    log.Fatal(err)
}
```

## 배치 처리

```go
pages := [][]byte{page1, page2, page3}

p, _ := html.New(html.DefaultConfig())
defer p.Close()

batch := p.ExtractBatch(pages)
fmt.Printf("성공: %d, 실패: %d\n", batch.Success, batch.Failed)

for i, result := range batch.Results {
    if result != nil {
        fmt.Printf("페이지 %d: %s\n", i, result.Title)
    }
}
```

## JSON 출력

```go
jsonBytes, err := html.ExtractToJSON(data)
if err != nil {
    log.Fatal(err)
}
fmt.Println(string(jsonBytes))
```

## 인코딩 자동 감지

라이브러리는 15+ 종 인코딩(GBK, Shift_JIS, Windows-1252 등)을 자동으로 감지하므로 수동 처리가 필요 없습니다:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
    "golang.org/x/text/encoding/simplifiedchinese"
)

func main() {
    // GBK 인코딩된 중국어 HTML 구성
    utf8HTML := `<html><head><meta charset="gbk"><title>中文网页</title></head>
<body><article><h1>你好世界</h1><p>这是一段中文内容。</p></article></body></html>`
    gbkBytes, err := simplifiedchinese.GBK.NewEncoder().Bytes([]byte(utf8HTML))
    if err != nil {
        log.Fatal(err)
    }

    // 인코딩 자동 감지 및 추출
    result, err := html.Extract(gbkBytes)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println("제목:", result.Title)
    // 제목: 中文网页
    fmt.Println("본문:", result.Text)
    // 본문: 你好世界
    //       这是一段中文内容。
}
```

## 미디어 추출

비디오와 오디오 리소스 정보를 추출합니다:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    data := []byte(`<html><body><article>
        <h1>멀티미디어 페이지</h1>
        <p>비디오와 오디오 추출 예시.</p>
        <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" width="560" height="315"></iframe>
        <video poster="cover.jpg" width="640">
            <source src="https://example.com/video.mp4" type="video/mp4">
        </video>
        <audio>
            <source src="https://example.com/audio.mp3" type="audio/mpeg">
        </audio>
    </article></body></html>`)

    result, err := html.Extract(data)
    if err != nil {
        log.Fatal(err)
    }

    // 비디오 정보
    fmt.Printf("비디오 수: %d\n", len(result.Videos))
    for i, v := range result.Videos {
        fmt.Printf("  [%d] %s (Type: %s", i+1, v.URL, v.Type)
        if v.Poster != "" {
            fmt.Printf(", Poster: %s", v.Poster)
        }
        if v.Width != "" {
            fmt.Printf(", W: %s", v.Width)
        }
        fmt.Println(")")
    }

    // 오디오 정보
    fmt.Printf("오디오 수: %d\n", len(result.Audios))
    for i, a := range result.Audios {
        fmt.Printf("  [%d] %s (Type: %s)\n", i+1, a.URL, a.Type)
    }
}
```

## 이미지와 링크 필드 접근

`Result`의 구조화된 필드에 완전히 접근합니다:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    data := []byte(`<html><body><article>
        <h1>필드 접근 예시</h1>
        <p>본문 단락.<a href="https://go.dev" title="Go 공식 웹사이트">Go</a></p>
        <img src="logo.png" alt="Logo" width="200" height="100">
        <a href="/about" rel="nofollow">소개</a>
    </article></body></html>`)

    result, err := html.Extract(data)
    if err != nil {
        log.Fatal(err)
    }

    // 이미지 필드
    for _, img := range result.Images {
        fmt.Printf("이미지: url=%s, alt=%s, %sx%s, decorative=%v, pos=%d\n",
            img.URL, img.Alt, img.Width, img.Height, img.IsDecorative, img.Position)
    }

    // 링크 필드
    for _, link := range result.Links {
        fmt.Printf("링크: url=%s, text=%s, external=%v, nofollow=%v, pos=%d\n",
            link.URL, link.Text, link.IsExternal, link.IsNoFollow, link.Position)
    }

    // 통계 정보
    fmt.Printf("단어 수: %d, 읽기 시간: %v, 처리 소요: %v\n",
        result.WordCount, result.ReadingTime, result.ProcessingTime)
}
```

## 통계 모니터링

Processor 인스턴스를 사용하여 처리 통계를 모니터링합니다:

```go
package main

import (
    "fmt"

    "github.com/cybergodev/html"
)

func main() {
    p, _ := html.New(html.DefaultConfig())
    defer p.Close()

    pages := [][]byte{
        []byte(`<html><body><article><h1>페이지 1</h1><p>내용 A.</p></article></body></html>`),
        []byte(`<html><body><article><h1>페이지 2</h1><p>내용 B.</p></article></body></html>`),
        []byte(`<html><body><article><h1>페이지 1</h1><p>내용 A.</p></article></body></html>`), // 중복, 캐시 적중
    }

    for _, page := range pages {
        p.Extract(page)
    }

    stats := p.GetStatistics()
    fmt.Printf("총 처리: %d\n", stats.TotalProcessed)
    fmt.Printf("캐시 적중: %d\n", stats.CacheHits)
    fmt.Printf("캐시 미스: %d\n", stats.CacheMisses)
    fmt.Printf("오류 수: %d\n", stats.ErrorCount)
    fmt.Printf("평균 소요: %v\n", stats.AverageProcessTime)

    hitRate := float64(0)
    if stats.TotalProcessed > 0 {
        hitRate = float64(stats.CacheHits) / float64(stats.TotalProcessed) * 100
    }
    fmt.Printf("적중률: %.1f%%\n", hitRate)
}
```
