---
sidebar_label: "고급 예제"
title: "고급 예제 - CyberGo html | 심화 시나리오 예제"
description: "CyberGo html 고급 예제: 커스텀 Scorer 구현, 다중 Sink 감사 파이프라인 구축, 배치 동시성 제어, Processor 풀링 재사용, HighSecurityConfig 보안 설정 등 심화 실행 가능 코드를 제공합니다."
sidebar_position: 2
---

# 고급 예제

## 커스텀 Scorer

특정 웹사이트 구조에 맞게 콘텐츠 식별 로직을 커스터마이즈합니다. 전체 구현은 [테스트와 사용자 정의 확장](../guides/integration/testing-custom)을 참조하고, 아래는 핵심 사용법을 보여줍니다:

```go
package main

import (
    "fmt"
    "log"
    "strings"

    "github.com/cybergodev/html"
)

// 커스텀 Scorer 구현 (전체 예시는 guides/testing-custom 참조)
type myScorer struct{}

func (s myScorer) Score(node html.ContentNode) int {
    if node == nil {
        return 0
    }
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
    switch node.Data() {
    case "nav", "footer", "header":
        return true
    }
    return false
}

func main() {
    cfg := html.DefaultConfig()
    cfg.Scorer = myScorer{}

    p, err := html.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer p.Close()

    data := []byte(`<html><body>
        <nav><a href="/">홈</a></nav>
        <article class="post-content">
            <h1>Go 동시성 이해하기</h1>
            <p>고루틴은 Go 의 경량 스레드입니다.</p>
        </article>
        <aside class="sidebar">추천 읽기</aside>
    </body></html>`)

    result, err := p.Extract(data)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println("본문:", result.Text)
    // 본문: Go 동시성 이해하기
    //
    // 고루틴은 Go 의 경량 스레드입니다.
}
```

## 다중 Sink 감사 파이프라인

계층별 감사 파이프라인 구축: critical 이벤트는 별도 파일에 기록하고, 모든 이벤트는 로그에도 출력합니다.

```go
package main

import (
    "fmt"
    "log"
    "os"

    "github.com/cybergodev/html"
)

func main() {
    // 출력 대상 생성
    allFile, _ := os.Create("audit-all.jsonl")
    criticalFile, _ := os.Create("audit-critical.jsonl")
    defer allFile.Close()
    defer criticalFile.Close()

    // 다층 파이프라인 구축
    allSink := html.NewWriterAuditSink(allFile)
    criticalSink := html.NewFilteredSink(
        html.NewWriterAuditSink(criticalFile),
        func(e html.AuditEntry) bool {
            return e.Level == html.AuditLevelCritical
        },
    )
    loggerSink := html.NewLoggerAuditSink()

    pipeline := html.NewMultiSink(allSink, criticalSink, loggerSink)

    // 설정
    cfg := html.HighSecurityConfig()
    cfg.Audit = html.HighSecurityAuditConfig()
    cfg.Audit.Sink = pipeline

    p, err := html.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer p.Close()

    // 콘텐츠 처리
    data := []byte(`<html><body>
        <script>alert('xss')</script>
        <article><p>안전한 콘텐츠</p></article>
    </body></html>`)

    result, err := p.Extract(data)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println("본문:", result.Text)
    // 감사 로그가 파일과 stderr 에 자동으로 기록됨
}
```

## 배치 파일 처리

디렉토리 내의 HTML 파일을 배치로 처리하고 결과와 오류를 수집합니다:

```go
package main

import (
    "fmt"
    "os"
    "path/filepath"

    "github.com/cybergodev/html"
)

func main() {
    // 파일 경로 수집
    var files []string
    filepath.Walk("./pages", func(path string, info os.FileInfo, err error) error {
        if err != nil {
            return nil
        }
        if filepath.Ext(path) == ".html" || filepath.Ext(path) == ".htm" {
            files = append(files, path)
        }
        return nil
    })

    fmt.Printf("%d개 파일 발견\n", len(files))

    // 배치 처리
    p, _ := html.New(html.TextOnlyConfig())
    defer p.Close()

    // 단일 배치 상한 10000; 초과 시 전체 실패, 호출자가 직접 분할
    batch := p.ExtractBatchFiles(files)

    fmt.Printf("성공: %d, 실패: %d, 취소: %d\n",
        batch.Success, batch.Failed, batch.Cancelled)

    // 결과 처리
    for i, result := range batch.Results {
        if result != nil {
            fmt.Printf("[%d] %s (단어 수: %d)\n", i, result.Title, result.WordCount)
        }
    }

    // 오류 확인
    for i, err := range batch.Errors {
        if err != nil {
            fmt.Printf("[%d] 오류: %v\n", i, err)
        }
    }
}
```

## 타임아웃이 포함된 Processor 재사용

웹 서비스 시나리오에서의 Processor 싱글톤 모드:

```go
package main

import (
    "context"
    "encoding/json"
    "fmt"
    "log"
    "net/http"
    "time"

    "github.com/cybergodev/html"
)

var processor *html.Processor

func init() {
    cfg := html.DefaultConfig()
    cfg.MaxCacheEntries = 5000
    cfg.CacheTTL = 30 * time.Minute
    cfg.ProcessingTimeout = 10 * time.Second

    var err error
    processor, err = html.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
}

func extractHandler(w http.ResponseWriter, r *http.Request) {
    ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
    defer cancel()

    data := []byte(r.FormValue("html"))
    if len(data) == 0 {
        http.Error(w, "html field required", http.StatusBadRequest)
        return
    }

    result, err := processor.ExtractWithContext(ctx, data)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(result)
}

func statsHandler(w http.ResponseWriter, r *http.Request) {
    stats := processor.GetStatistics()
    fmt.Fprintf(w, "처리됨: %d\n캐시 적중: %d\n오류: %d\n",
        stats.TotalProcessed, stats.CacheHits, stats.ErrorCount)
}

func main() {
    defer processor.Close()

    http.HandleFunc("/extract", extractHandler)
    http.HandleFunc("/stats", statsHandler)
    log.Fatal(http.ListenAndServe(":8080", nil))
}
```

## 추출 및 Markdown 파일 생성

HTML 페이지에서 콘텐츠를 추출하여 Markdown 파일로 저장합니다:

```go
package main

import (
    "fmt"
    "log"
    "os"
    "strings"

    "github.com/cybergodev/html"
)

func main() {
    p, err := html.New(html.MarkdownConfig())
    if err != nil {
        log.Fatal(err)
    }
    defer p.Close()

    urls := []string{
        "downloaded/page1.html",
        "downloaded/page2.html",
        "downloaded/page3.html",
    }

    for _, path := range urls {
        md, err := p.ExtractToMarkdownFromFile(path)
        if err != nil {
            log.Printf("처리 실패 %s: %v", path, err)
            continue
        }

        // 출력 파일명 생성
        outPath := strings.Replace(path, ".html", ".md", 1)
        if err := os.WriteFile(outPath, []byte(md), 0644); err != nil {
            log.Printf("쓰기 실패 %s: %v", outPath, err)
            continue
        }
        fmt.Printf("%s -> %s 완료\n", path, outPath)
    }
}
```

## 컨텍스트 취소와 우아한 종료

HTTP 서비스에서 context 로 추출 타임아웃을 제어하며, 요청 단위 취소를 지원합니다:

```go
package main

import (
    "context"
    "errors"
    "fmt"
    "log"
    "net/http"
    "os"
    "os/signal"
    "syscall"
    "time"

    "github.com/cybergodev/html"
)

var processor *html.Processor

func init() {
    cfg := html.DefaultConfig()
    cfg.ProcessingTimeout = 10 * time.Second
    cfg.MaxCacheEntries = 5000
    var err error
    processor, err = html.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
}

func extractHandler(w http.ResponseWriter, r *http.Request) {
    // 요청 단위 타임아웃(5s), ProcessingTimeout(10s)과 중첩, 빨리 도달하는 쪽이 선발
    ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
    defer cancel()

    body := make([]byte, 0)
    buf := make([]byte, 4096)
    for {
        n, err := r.Body.Read(buf)
        body = append(body, buf[:n]...)
        if err != nil {
            break
        }
        if len(body) > 10*1024*1024 {
            http.Error(w, "요청 본문이 너무 큼", http.StatusRequestEntityTooLarge)
            return
        }
    }

    result, err := processor.ExtractWithContext(ctx, body)
    if err != nil {
        switch {
        case errors.Is(err, html.ErrProcessingTimeout):
            http.Error(w, "처리 타임아웃", http.StatusGatewayTimeout)
        case errors.Is(err, html.ErrInputTooLarge):
            http.Error(w, "입력이 너무 큼", http.StatusRequestEntityTooLarge)
        default:
            http.Error(w, err.Error(), http.StatusInternalServerError)
        }
        return
    }

    w.Header().Set("Content-Type", "application/json")
    fmt.Fprintf(w, `{"title":"%s","word_count":%d}`, result.Title, result.WordCount)
}

func main() {
    defer processor.Close()

    server := &http.Server{Addr: ":8080"}
    http.HandleFunc("/extract", extractHandler)

    // 우아한 종료: 신호 수신 후 Processor 와 HTTP 서비스 종료
    go func() {
        sigChan := make(chan os.Signal, 1)
        signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
        <-sigChan
        log.Println("종료 중...")
        processor.Close()
        server.Shutdown(context.Background())
    }()

    log.Println("서비스가 :8080 에서 시작됨")
    log.Fatal(server.ListenAndServe())
}
```

## 안전한 파일 처리

`AllowedBaseDir` 샌드박스를 사용하여 사용자가 제공한 파일 경로를 처리합니다:

```go
package main

import (
    "errors"
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    cfg := html.HighSecurityConfig()
    // 파일 읽기를 이 디렉토리와 그 하위 디렉토리로 제한
    // OS 파일 핸들로 실제 경로를 해석하여 symlink/junction 우회 방지
    cfg.AllowedBaseDir = "/var/www/uploads"

    p, err := html.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer p.Close()

    // 사용자가 제공한 파일 경로 시뮬레이션
    userFiles := []string{
        "/var/www/uploads/article1.html",  // ✅ 허용
        "/var/www/uploads/sub/page.html",  // ✅ 허용(하위 디렉토리)
        "../../../etc/passwd",             // ❌ 경로 순회
        "/etc/shadow",                     // ❌ 디렉토리 외부
    }

    for _, file := range userFiles {
        _, err := p.ExtractFromFile(file)
        if err != nil {
            var fileErr *html.FileError
            if errors.As(err, &fileErr) {
                // SafePath 는 파일명만 반환, 전체 경로 유출 없음
                fmt.Printf("❌ 거부 %s: %s\n", fileErr.SafePath(), fileErr.FileErr)
            } else {
                fmt.Printf("❌ 오류: %v\n", err)
            }
            continue
        }
        fmt.Printf("✅ 처리 성공: %s\n", file)
    }
}
```

## 인코딩 감지 폴백

자동 감지 실패 시 수동 인코딩 지정으로 폴백합니다:

```go
package main

import (
    "fmt"
    "log"
    "strings"

    "github.com/cybergodev/html"
)

// extractWithFallback 은 먼저 자동 감지를 시도하고, 실패하면 지정된 인코딩으로 재시도합니다
func extractWithFallback(data []byte, fallback string) (*html.Result, error) {
    result, err := html.Extract(data)
    if err == nil {
        return result, nil
    }
    if strings.Contains(err.Error(), "encoding detection failed") {
        cfg := html.DefaultConfig()
        cfg.Encoding = fallback
        return html.Extract(data, cfg)
    }
    return nil, err
}

func main() {
    // 출처를 알 수 없는 GBK 인코딩 HTML 시뮬레이션(meta charset 없음)
    data := []byte{0xbb, 0xb9, 0xca, 0xc7, 0xd3, 0xd0, 0xd2, 0xbb, 0xb8, 0xf6}

    result, err := extractWithFallback(data, "gbk")
    if err != nil {
        log.Fatal(err)
    }

    fmt.Printf("제목: %s\n텍스트 길이: %d\n", result.Title, len(result.Text))
}
```
