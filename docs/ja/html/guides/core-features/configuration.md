---
sidebar_label: "設定実践"
title: "設定実践 - CyberGo html | Config フィールド選択ガイド"
description: "CyberGo html 設定実践ガイド：DefaultConfig、HighSecurityConfig、TextOnlyConfig、MarkdownConfig の 4 種プリセット選択、6 分類のフィールドガイド、よくある設定組み合わせ、Validate 検証を解説し初心者を支援します。"
sidebar_position: 6
---

# 設定実践

`Config` 構造体には 30 以上のフィールドがありますが、日常的な使用ではいくつかの主要な設定グループを理解するだけで十分です。このガイドはシーンに合った設定方法を素早く選択するのに役立ちます。完全なフィールド説明は [API リファレンス：設定](../../api-reference/core/config) を参照してください。

## 4 種のプリセット

ライブラリは 4 種類のプリセットを提供し、ほとんどのシーンをカバーします：

| プリセット | 適用シーン | 主な違い |
|------|----------|----------|
| `DefaultConfig()` | 汎用抽出 | 全機能有効、安全なデフォルト値 |
| `HighSecurityConfig()` | 信頼できない入力 | 制限を強化、監査を有効化、深さ上限を引き下げ |
| `TextOnlyConfig()` | プレーンテキストのみ | すべてのメディア保持を無効化、最大パフォーマンス |
| `MarkdownConfig()` | Markdown 出力 | インライン画像/リンクを Markdown 形式に変換 |

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    data := []byte(`<html><body><h1>タイトル</h1><p>本文コンテンツ</p></body></html>`)

    // ほとんどのシーン：デフォルト設定をそのまま使用
    p1, _ := html.New()
    defer p1.Close()
    r1, _ := p1.Extract(data)
    fmt.Println(r1.Title)

    // プレーンテキストのみ必要（検索エンジンインデックスなど）
    p2, _ := html.New(html.TextOnlyConfig())
    defer p2.Close()

    // Markdown を出力（CMS マイグレーションなど）
    p3, _ := html.New(html.MarkdownConfig())
    defer p3.Close()
    md, _ := p3.ExtractToMarkdown(data)
    fmt.Println(md)
}
```

:::tip プリセットから始める
迷った場合は `DefaultConfig()` から始め、必要に応じて個別フィールドを調整します。プリセットは組み合わせ可能で、あるプリセットを取得した後にフィールドを上書きできます：
:::

<!-- check-code: skip -->
```go
cfg := html.HighSecurityConfig()
cfg.PreserveImages = false // 高セキュリティ設定に加えて画像を無効化
processor, _ := html.New(cfg)
```

## 6 分類のフィールドガイド

### リソース管理

メモリ使用量とパフォーマンスを制御します。日常的な開発では調整の必要は通常ありません。

| フィールド | デフォルト値 | 説明 |
|------|--------|------|
| `MaxInputSize` | 50 MB | 最大入力サイズ、メモリ枯渇を防止 |
| `MaxCacheEntries` | 2000 | キャッシュエントリ数の上限、0 でキャッシュ無効 |
| `CacheTTL` | 1 時間 | キャッシュの生存時間 |
| `CacheCleanup` | 5 分 | バックグラウンドの期限切れキャッシュのクリーンアップ間隔 |
| `WorkerPoolSize` | 4 | バッチ処理の並行数（1–256） |
| `ProcessingTimeout` | 30 秒 | 1 ドキュメントあたりの処理タイムアウト、0 で無制限 |

:::warning キャッシュは Processor インスタンスのみ有効
パッケージレベル関数（`html.Extract` など）はプールされた Processor を使用し、呼び出しごとにキャッシュをクリアします。キャッシュが必要な場合は `html.New()` で独立した Processor を作成してください。詳細は [Processor 再利用とキャッシュ](../performance/processor-cache) を参照してください。
:::

### セキュリティ

セキュリティ設定は本番環境で重点的に確認すべき項目です。完全なセキュリティ機能の紹介は [セキュリティ概要](../security/) を参照してください。

| フィールド | デフォルト値 | 説明 |
|------|--------|------|
| `EnableSanitization` | `true` | HTML サニタイズ（危険なタグ/属性を除去） |
| `MaxDepth` | 500 | DOM ネスト深さの上限、スタックオーバーフローを防止 |
| `AllowedBaseDir` | `""` | ファイル操作のサンドボックスディレクトリ、空 = 制限なし |
| `Audit` | 無効 | セキュリティ監査ログの設定 |

:::warning AllowedBaseDir
ユーザー提供のファイルパスを処理する際は、必ず `AllowedBaseDir` を設定してください。OS のファイルハンドルを通じて実際のパスを解決し、シンボリックリンクや Windows junction の回避を防止します。
:::

### コンテンツ抽出

HTML からどのコンテンツを抽出するかを制御します。

| フィールド | デフォルト値 | 説明 |
|------|--------|------|
| `ExtractArticle` | `true` | スマート記事認識（メインコンテンツを自動特定） |
| `PreserveImages` | `true` | 画像情報を保持 |
| `PreserveLinks` | `true` | リンク情報を保持 |
| `PreserveVideos` | `true` | 動画を抽出 |
| `PreserveAudios` | `true` | 音声を抽出 |

不要なメディアタイプを無効化するとパフォーマンスが向上します：

<!-- check-code: skip -->
```go
cfg := html.DefaultConfig()
cfg.PreserveVideos = false
cfg.PreserveAudios = false
// テキスト、画像、リンクのみ抽出
```

### 出力フォーマット

テキスト出力における画像とリンクの表示方法を制御します。詳細は [出力フォーマット実践](./output-formats) を参照してください。

| フィールド | デフォルト値 | 選択可能な値 |
|------|--------|--------|
| `InlineImageFormat` | `"none"` | `"none"`, `"markdown"`, `"html"`, `"placeholder"` |
| `InlineLinkFormat` | `"none"` | `"none"`, `"markdown"`, `"html"` |
| `TableFormat` | `"markdown"` | `"markdown"`, `"html"` |
| `Encoding` | `""`（自動） | `"utf-8"`, `"gbk"`, `"shift_jis"`, `"windows-1252"` など |

`Encoding` を空欄にすると自動検出されます。手動指定すると検出ステップをスキップできパフォーマンスが向上しますが、エンコーディングが確実に分かっている場合のみ使用してください。詳細は [エンコーディング検出実践](./encoding-detection) を参照してください。

### リンク抽出

以下のフィールドは `ExtractAllLinks` でのみ有効で、どの種類のリソースリンクを抽出するかを制御します。詳細は [リンク抽出実践](./link-extraction) を参照してください。

| フィールド | デフォルト値 | 説明 |
|------|--------|------|
| `ResolveRelativeURLs` | `true` | 相対 URL を絶対 URL に解決 |
| `BaseURL` | `""` | 解決のベース、空欄時は HTML から自動検出 |
| `IncludeImages` | `true` | `<img>` リンクを含む |
| `IncludeVideos` | `true` | `<video>`/`<iframe>` リンクを含む |
| `IncludeAudios` | `true` | `<audio>` リンクを含む |
| `IncludeCSS` | `true` | `<link rel="stylesheet">` を含む |
| `IncludeJS` | `true` | `<script src>` を含む |
| `IncludeContentLinks` | `true` | `<a href>` サイト内リンクを含む |
| `IncludeExternalLinks` | `true` | サイト外リンクを含む |
| `IncludeIcons` | `true` | favicon/アイコンを含む |

:::tip リンク抽出とコンテンツ抽出の違い
`Include*` フィールドは `ExtractAllLinks` にのみ影響します。コンテンツ抽出（`Extract`）でのリンク保持は `PreserveLinks` で制御します。
:::

### 拡張

| フィールド | 説明 |
|------|------|
| `Scorer` | カスタムコンテンツスコアラー、nil の場合は DefaultScorer を使用 |

カスタム Scorer で特定のウェブサイト向けに記事認識を最適化できます。詳細は [テストとカスタム拡張](../integration/testing-custom) を参照してください。

## よくある設定組み合わせ

### Web クローラー

高頻度バッチクロールのシーンでは、並行数を上げてタイムアウトを短くします：

```go
package main

import (
    "log"
    "time"

    "github.com/cybergodev/html"
)

func main() {
    cfg := html.DefaultConfig()
    cfg.WorkerPoolSize = 8                          // バッチ並行数を向上
    cfg.ProcessingTimeout = 10 * time.Second        // タイムアウトを短縮
    cfg.PreserveVideos = false                      // クローラーには不要な動画
    cfg.PreserveAudios = false

    processor, err := html.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer processor.Close()

    // バッチ抽出
    pages := [][]byte{[]byte("<html><body>ページ1</body></html>")}
    batch := processor.ExtractBatch(pages)
    log.Printf("成功 %d、失敗 %d", batch.Success, batch.Failed)
}
```

### API バックエンドサービス

ユーザーが送信した HTML を処理する場合、高セキュリティ設定を使用しファイルディレクトリを制限します：

```go
package main

import (
    "log"

    "github.com/cybergodev/html"
)

func main() {
    cfg := html.HighSecurityConfig()
    cfg.AllowedBaseDir = "/var/www/uploads" // ファイルディレクトリを制限

    processor, err := html.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer processor.Close()

    // ユーザーがアップロードした HTML ファイルを処理
    result, err := processor.ExtractFromFile("/var/www/uploads/user.html")
    if err != nil {
        log.Fatal(err)
    }
    log.Println(result.Title)
}
```

### コンテンツ移行ツール

旧サイトの HTML を Markdown に変換し、リンクを保持して相対 URL を解決します：

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

    data := []byte(`<html><body><article><h1>旧記事</h1><a href="/post/123">リンク</a></article></body></html>`)
    md, err := processor.ExtractToMarkdown(data)
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(md)
}
```

## Validate

すべての設定は `html.New()` に渡された際に自動的に検証されます。手動で `Validate()` を呼び出して事前チェックすることも可能です：

<!-- check-code: skip -->
```go
cfg := html.DefaultConfig()
cfg.MaxInputSize = -1 // 意図的に誤った値を設定
if err := cfg.Validate(); err != nil {
    log.Fatal(err) // html: invalid config: MaxInputSize=-1, must be positive
}
```

検証ルールにはフィールドの範囲チェックとフォーマット文字列の検証が含まれます。無効な設定は `*ConfigError` を返し、`errors.Is(err, html.ErrInvalidConfig)` で判定できます。完全なフィールド制約は [API リファレンス：設定](../../api-reference/core/config) を参照してください。
