---
sidebar_label: "チートシート"
title: "チートシート - CyberGo html | API 一覧"
description: "CyberGo html 主要 API チートシート：パッケージ関数、Processor メソッド、4 種の設定プリセット、主要設定項目、エラー判定パターン、監査設定、リンク抽出など、日常的に必要な API を 1 ページで素早く参照できるクイックリファレンスです。"
sidebar_position: 3
---

# チートシート

## パッケージ関数

### コンテンツ抽出

```go
// バイトから完全な結果を抽出
result, err := html.Extract(data)

// ファイルから抽出
result, err := html.ExtractFromFile("page.html")

// テキストのみ抽出
text, err := html.ExtractText(data)
text, err := html.ExtractTextFromFile("page.html")
```

### 出力フォーマット

```go
md, err := html.ExtractToMarkdown(data)
jsonBytes, err := html.ExtractToJSON(data)
```

### リンク抽出

```go
links, err := html.ExtractAllLinks(data)
groups := html.GroupLinksByType(links)
```

### バッチ処理

```go
batch := html.ExtractBatch(pages)
// または
batch := html.ExtractBatchFiles(paths)
```

### コンテキスト付きバージョン

すべての関数に `ExtractWithContext` バリアントがあります：

```go
result, err := html.ExtractWithContext(ctx, data)
result, err = html.ExtractFromFileWithContext(ctx, path)
text, err := html.ExtractTextWithContext(ctx, data)
md, err := html.ExtractToMarkdownWithContext(ctx, data)
links, err := html.ExtractAllLinksWithContext(ctx, data)
batch := html.ExtractBatchWithContext(ctx, pages)
```

## Processor

```go
// 作成
p, err := html.New(html.DefaultConfig())
defer p.Close()

// 抽出
result, err := p.Extract(data)
result, err = p.ExtractFromFile(path)
text, err := p.ExtractText(data)

// 出力
md, err := p.ExtractToMarkdown(data)
jsonBytes, err := p.ExtractToJSON(data)

// リンク
links, err := p.ExtractAllLinks(data)

// バッチ
batch := p.ExtractBatch(pages)

// 統計
stats := p.GetStatistics()
p.ClearCache()
p.ResetStatistics()

// 監査
entries := p.GetAuditLog()
p.ClearAuditLog()
```

## 設定プリセット

```go
html.DefaultConfig()       // デフォルト設定
html.TextOnlyConfig()      // テキストのみ
html.MarkdownConfig()      // Markdown 出力
html.HighSecurityConfig()  // 高セキュリティ
```

## よく使う設定項目

```go
cfg := html.DefaultConfig()

// リソース制限
cfg.MaxInputSize = 10 * 1024 * 1024  // 最大入力 10MB
cfg.ProcessingTimeout = time.Minute   // 処理タイムアウト
cfg.MaxDepth = 200                    // 最大 DOM 深度

// コンテンツ制御
cfg.ExtractArticle = true             // スマート記事認識
cfg.PreserveImages = true             // 画像を保持
cfg.PreserveLinks = true              // リンクを保持
cfg.PreserveVideos = false            // 動画を保持しない
cfg.PreserveAudios = false            // 音声を保持しない

// 出力フォーマット
cfg.InlineImageFormat = "markdown"    // none/markdown/html/placeholder
cfg.InlineLinkFormat = "markdown"     // none/markdown/html
cfg.TableFormat = "markdown"          // markdown/html

// リンクフィルタリング
cfg.IncludeImages = true
cfg.IncludeExternalLinks = true
cfg.ResolveRelativeURLs = true
cfg.BaseURL = "https://example.com"

// キャッシュ
cfg.MaxCacheEntries = 1000
cfg.CacheTTL = 30 * time.Minute
```

## エラー処理

```go
result, err := html.Extract(data)
if err != nil {
    switch {
    case errors.Is(err, html.ErrInputTooLarge):
        // 入力が大きすぎる
    case errors.Is(err, html.ErrInvalidHTML):
        // 無効な HTML
    case errors.Is(err, html.ErrProcessingTimeout):
        // 処理タイムアウト
    case errors.Is(err, html.ErrFileNotFound):
        // ファイルが見つからない
    case errors.Is(err, html.ErrInvalidConfig):
        // 設定が無効
    case errors.Is(err, html.ErrProcessorClosed):
        // Processor が閉じている
    case errors.Is(err, html.ErrMaxDepthExceeded):
        // DOM 深度が制限を超過
    case errors.Is(err, html.ErrInvalidFilePath):
        // ファイルパスが無効
    default:
        // その他のエラー
    }
}
```

## エンコーディング検出

```go
// 自動検出（デフォルト、15+ エンコーディング対応）
result, err := html.Extract(gbkData)

// 手動でエンコーディング指定
cfg := html.DefaultConfig()
cfg.Encoding = "shift_jis"
```

UTF-8、GBK、Shift_JIS、EUC-JP、Windows-1252 など 15+ エンコーディングに対応しています。

## メディア抽出

```go
result, err := html.Extract(data)

// 動画
for _, v := range result.Videos {
    fmt.Println(v.URL, v.Type)
}

// 音声
for _, a := range result.Audios {
    fmt.Println(a.URL, a.Type)
}

// メディア抽出を無効化
cfg := html.TextOnlyConfig()
// または個別に制御
cfg.PreserveVideos = false
cfg.PreserveAudios = false
```

## 監査システム

```go
cfg := html.DefaultConfig()
cfg.Audit = html.DefaultAuditConfig()
cfg.Audit.Enabled = true

// カスタム Sink を使用
sink := html.NewWriterAuditSink(os.Stdout)
cfg.Audit.Sink = sink

p, _ := html.New(cfg)
defer p.Close()

// 処理後に監査ログを取得
entries := p.GetAuditLog()
```

### 監査 Sink クイックリファレンス

```go
// 組み込み Sink コンストラクタ
html.NewLoggerAuditSink()                   // stderr、[AUDIT] プレフィックス
html.NewLoggerAuditSinkWithWriter(w)        // カスタム Writer
html.NewWriterAuditSink(w)                  // JSON Lines を io.Writer に書き込み
html.NewChannelAuditSink(bufSize)           // バッファ付き channel
html.NewMultiSink(sinks...)                 // 複数の Sink にファンアウト
html.NewFilteredSink(sink, filterFunc)      // 述語フィルタリング
html.NewLevelFilteredSink(sink, minLevel)   // レベル別フィルタリング

// Channel Sink ヘルパーメソッド
sink.Channel()       // <-chan AuditEntry、イベントを消費
sink.DroppedCount()  // int64、破棄されたイベント数
sink.Close()         // べき等な channel クローズ
```

### Processor ライフサイクル

```go
p, _ := html.New(html.DefaultConfig())
defer p.Close()               // リソース解放（べき等）

stats := p.GetStatistics()    // Statistics{TotalProcessed, CacheHits, ...}
entries := p.GetAuditLog()    // []AuditEntry
p.ClearAuditLog()             // メモリ内監査ログをクリア
p.ClearCache()                // キャッシュをクリア（統計は保持）
p.ResetStatistics()           // 統計カウンタをリセット（キャッシュは保持）
```
