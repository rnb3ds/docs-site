---
sidebar_label: "高度なサンプル"
title: "高度なサンプル - CyberGo html | 応用シナリオ集"
description: "CyberGo html 高度なサンプル集：カスタム Scorer 実装、マルチ Sink 監査パイプライン、バッチ並行制御、Processor プーリング再利用、HighSecurityConfig によるセキュア抽出など、実践的な応用シナリオ向けの実行可能コードを提供します。"
sidebar_position: 2
---

# 高度なサンプル

## カスタム Scorer

特定のウェブサイト構造に合わせてコンテンツ認識ロジックをカスタマイズします。完全な実装は [テストとカスタム拡張](../guides/integration/testing-custom) を参照してください。以下はコアとなる使い方です：

```go
package main

import (
    "fmt"
    "log"
    "strings"

    "github.com/cybergodev/html"
)

// カスタム Scorer の実装（完全な例は guides/testing-custom を参照）
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
        <nav><a href="/">ホーム</a></nav>
        <article class="post-content">
            <h1>Go 並行処理の深い理解</h1>
            <p>goroutine は Go の軽量スレッドです。</p>
        </article>
        <aside class="sidebar">おすすめ記事</aside>
    </body></html>`)

    result, err := p.Extract(data)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println("本文：", result.Text)
    // 本文：Go 並行処理の深い理解
    //
    // goroutine は Go の軽量スレッドです。
}
```

## マルチ Sink 監査パイプライン

階層型監査パイプラインの構築：critical イベントは別ファイルに書き込み、すべてのイベントは同時にログにも出力します。

```go
package main

import (
    "fmt"
    "log"
    "os"

    "github.com/cybergodev/html"
)

func main() {
    // 出力先を作成
    allFile, _ := os.Create("audit-all.jsonl")
    criticalFile, _ := os.Create("audit-critical.jsonl")
    defer allFile.Close()
    defer criticalFile.Close()

    // 多層パイプラインを構築
    allSink := html.NewWriterAuditSink(allFile)
    criticalSink := html.NewFilteredSink(
        html.NewWriterAuditSink(criticalFile),
        func(e html.AuditEntry) bool {
            return e.Level == html.AuditLevelCritical
        },
    )
    loggerSink := html.NewLoggerAuditSink()

    pipeline := html.NewMultiSink(allSink, criticalSink, loggerSink)

    // 設定
    cfg := html.HighSecurityConfig()
    cfg.Audit = html.HighSecurityAuditConfig()
    cfg.Audit.Sink = pipeline

    p, err := html.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer p.Close()

    // コンテンツを処理
    data := []byte(`<html><body>
        <script>alert('xss')</script>
        <article><p>安全なコンテンツ</p></article>
    </body></html>`)

    result, err := p.Extract(data)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println("本文：", result.Text)
    // 監査ログは自動的にファイルと stderr に記録される
}
```

## バッチファイル処理

ディレクトリ内の HTML ファイルをバッチ処理し、結果とエラーを収集します：

```go
package main

import (
    "fmt"
    "os"
    "path/filepath"

    "github.com/cybergodev/html"
)

func main() {
    // ファイルパスを収集
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

    fmt.Printf("%d 個のファイルを発見\n", len(files))

    // バッチ処理
    p, _ := html.New(html.TextOnlyConfig())
    defer p.Close()

    // 単一バッチの上限は 10000、超過するとバッチ全体が失敗し呼び出し側で分割が必要
    batch := p.ExtractBatchFiles(files)

    fmt.Printf("成功：%d, 失敗：%d, キャンセル：%d\n",
        batch.Success, batch.Failed, batch.Cancelled)

    // 結果を処理
    for i, result := range batch.Results {
        if result != nil {
            fmt.Printf("[%d] %s (単語数: %d)\n", i, result.Title, result.WordCount)
        }
    }

    // エラーを確認
    for i, err := range batch.Errors {
        if err != nil {
            fmt.Printf("[%d] エラー: %v\n", i, err)
        }
    }
}
```

## タイムアウト付き Processor 再利用

Web サービスシーンでの Processor シングルトンパターン：

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
    fmt.Fprintf(w, "処理済み：%d\nキャッシュヒット：%d\nエラー: %d\n",
        stats.TotalProcessed, stats.CacheHits, stats.ErrorCount)
}

func main() {
    defer processor.Close()

    http.HandleFunc("/extract", extractHandler)
    http.HandleFunc("/stats", statsHandler)
    log.Fatal(http.ListenAndServe(":8080", nil))
}
```

## 抽出して Markdown ファイルを生成

HTML ページからコンテンツを抽出し、Markdown ファイルとして保存します：

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
            log.Printf("処理 %s に失敗: %v", path, err)
            continue
        }

        // 出力ファイル名を生成
        outPath := strings.Replace(path, ".html", ".md", 1)
        if err := os.WriteFile(outPath, []byte(md), 0644); err != nil {
            log.Printf("書き込み %s に失敗: %v", outPath, err)
            continue
        }
        fmt.Printf("ok %s -> %s\n", path, outPath)
    }
}
```

## コンテキストキャンセルとグレースフルシャットダウン

HTTP サービスで context を使って抽出タイムアウトを制御し、リクエストレベルのキャンセルをサポートします：

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
    // リクエストレベルのタイムアウト（5s）、ProcessingTimeout（10s）と重ねて、先に到達した方が有効
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
            http.Error(w, "リクエストボディが大きすぎます", http.StatusRequestEntityTooLarge)
            return
        }
    }

    result, err := processor.ExtractWithContext(ctx, body)
    if err != nil {
        switch {
        case errors.Is(err, html.ErrProcessingTimeout):
            http.Error(w, "処理タイムアウト", http.StatusGatewayTimeout)
        case errors.Is(err, html.ErrInputTooLarge):
            http.Error(w, "入力が大きすぎます", http.StatusRequestEntityTooLarge)
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

    // グレースフルシャットダウン：シグナル受信後に Processor と HTTP サービスをクローズ
    go func() {
        sigChan := make(chan os.Signal, 1)
        signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
        <-sigChan
        log.Println("シャットダウン中...")
        processor.Close()
        server.Shutdown(context.Background())
    }()

    log.Println("サービスを :8080 で起動")
    log.Fatal(server.ListenAndServe())
}
```

## セキュアなファイル処理

`AllowedBaseDir` サンドボックスを使ってユーザー提供のファイルパスを処理します：

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
    // ファイル読み取りをこのディレクトリとそのサブディレクトリに制限
    // OS ファイルハンドル経由で実際のパスを解決し、symlink/junction のバイパスを防止
    cfg.AllowedBaseDir = "/var/www/uploads"

    p, err := html.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer p.Close()

    // ユーザー提供のファイルパスをシミュレート
    userFiles := []string{
        "/var/www/uploads/article1.html",  // ✅ 許可
        "/var/www/uploads/sub/page.html",  // ✅ 許可（サブディレクトリ）
        "../../../etc/passwd",             // ❌ パストラバーサル
        "/etc/shadow",                     // ❌ ディレクトリ外
    }

    for _, file := range userFiles {
        _, err := p.ExtractFromFile(file)
        if err != nil {
            var fileErr *html.FileError
            if errors.As(err, &fileErr) {
                // SafePath はファイル名のみを返し、完全なパスを漏洩しない
                fmt.Printf("❌ 拒否 %s: %s\n", fileErr.SafePath(), fileErr.FileErr)
            } else {
                fmt.Printf("❌ エラー: %v\n", err)
            }
            continue
        }
        fmt.Printf("✅ 処理成功: %s\n", file)
    }
}
```

## エンコーディング検出のフォールバック

自動検出失敗時に手動指定のエンコーディングへフォールバックします：

```go
package main

import (
    "fmt"
    "log"
    "strings"

    "github.com/cybergodev/html"
)

// extractWithFallback はまず自動検出を試み、失敗時に指定エンコーディングでリトライ
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
    // 出所不明の GBK エンコーディング HTML をシミュレート（meta charset なし）
    data := []byte{0xbb, 0xb9, 0xca, 0xc7, 0xd3, 0xd0, 0xd2, 0xbb, 0xb8, 0xf6}

    result, err := extractWithFallback(data, "gbk")
    if err != nil {
        log.Fatal(err)
    }

    fmt.Printf("タイトル：%s\nテキスト長：%d\n", result.Title, len(result.Text))
}
```
