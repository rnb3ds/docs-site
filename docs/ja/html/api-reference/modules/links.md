---
sidebar_label: "リンク抽出"
title: "リンク抽出 - CyberGo html | リソースリンク抽出 API"
description: "CyberGo html リンク抽出 API リファレンス：ExtractAllLinks 系関数と GroupLinksByType で各種リソースリンクを抽出しタイプ別にグループ化、IncludeExclude フィルタ設定やファイル入力版の使い方も解説します。"
sidebar_position: 2
---

# リンク抽出

独立したリンク抽出 API で、HTML からすべてのリンクリソースを抽出し、タイプ別にグループ化できます。

:::tip Extract との主な違い
`ExtractAllLinks` は **HTML サニタイズを適用しません**（ここでは `EnableSanitization` は無効です）。そのため `<script src>`、`<iframe>`、`<link>`、`<embed>` などのタグ内のリソースリンクもすべて抽出されます。これはこれらのリソースリンクを列挙できるようにするためであり、`Extract` の経路では通常サニタイズで除去されます。
:::

:::info 結果の並べ替えと重複排除
`ExtractAllLinks` の結果は **URL の昇順でソート**され、URL で重複排除されます。そのため同じ入力に対して複数回呼び出しても完全に同一の出力が得られます（v1.4.2 以降）。結果の比較、キャッシュ再利用、再現可能な下流処理に役立ちます。同じ URL が複数のタグに現れる場合は 1 件だけ保持されます。
:::

## パッケージ関数

```go
func ExtractAllLinks(htmlBytes []byte, cfg ...Config) ([]LinkResource, error)
func ExtractAllLinksFromFile(filePath string, cfg ...Config) ([]LinkResource, error)
func ExtractAllLinksWithContext(ctx context.Context, htmlBytes []byte, cfg ...Config) ([]LinkResource, error)
func ExtractAllLinksFromFileWithContext(ctx context.Context, filePath string, cfg ...Config) ([]LinkResource, error)
```

## Processor メソッド

```go
func (p *Processor) ExtractAllLinks(htmlBytes []byte) ([]LinkResource, error)
func (p *Processor) ExtractAllLinksFromFile(filePath string) ([]LinkResource, error)
func (p *Processor) ExtractAllLinksWithContext(ctx context.Context, htmlBytes []byte) ([]LinkResource, error)
func (p *Processor) ExtractAllLinksFromFileWithContext(ctx context.Context, filePath string) ([]LinkResource, error)
```

## グループ化ツール

### GroupLinksByType

リンクをタイプ別にグループ化します。

```go
func GroupLinksByType(links []LinkResource) map[string][]LinkResource
```

```go
links, _ := html.ExtractAllLinks(data)
groups := html.GroupLinksByType(links)

for typ, items := range groups {
    fmt.Printf("タイプ %s: %d 件\n", typ, len(items))
}
```

## LinkResource

```go
type LinkResource struct {
    URL   string // リンクアドレス
    Title string // リンクタイトル
    Type  string // リンクタイプ（link, image, video, audio, media, css, js, icon）
}
```

## リンクタイプの詳細

各 `Type` は特定の HTML タグソースに対応します：

| Type 値 | 由来 HTML タグ | 制御スイッチ |
|---------|---------------|----------|
| `link` | `<a href>` | `IncludeContentLinks` / `IncludeExternalLinks` |
| `image` | `<img src>` | `IncludeImages` |
| `video` | `<video src>`、`<source type="video/*">`、`<iframe>`/`<embed>`/`<object>`（動画 URL） | `IncludeVideos` |
| `audio` | `<audio src>`、`<source type="audio/*">` | `IncludeAudios` |
| `media` | `<source>` で video/audio が判定できない場合 | `IncludeVideos` / `IncludeAudios` |
| `css` | `<link rel="stylesheet">` | `IncludeCSS` |
| `js` | `<script src>` | `IncludeJS` |
| `icon` | `<link rel="icon">`、`<link rel="apple-touch-icon">` など | `IncludeIcons` |

:::info embed リンクの特別扱い
`<iframe>`、`<embed>`、`<object>` の `src`/`data` は**動画 URL**（YouTube、Vimeo、Dailymotion などの埋め込み模式を含む）と判定された場合にのみ抽出され、タイプは `video` と記録されます。動画以外の URL は収録されません。
:::

## 設定

リンク抽出の動作は `Config` のリンクフィルタフィールドで制御できます：

```go
cfg := html.DefaultConfig()
cfg.IncludeImages = true
cfg.IncludeCSS = true
cfg.IncludeJS = true
cfg.IncludeExternalLinks = true
cfg.ResolveRelativeURLs = true
cfg.BaseURL = "https://example.com"
```

### 相対 URL の解決

`ResolveRelativeURLs=true`（デフォルト）の場合、すべてのタイプの相対 URL は `BaseURL` を基準に統一的に絶対 URL に解決されます：

- 解析ロジックは `resolveURLIfEnabled` で一元処理され、コンテンツリンク、画像、メディア、source、script、embed、link タグを**平等に扱います**
- `BaseURL` を明示的に設定すると**自動検出をスキップ**し、呼び出し元が提供した値を直接使用します
- `BaseURL` が空かつ `ResolveRelativeURLs=true` の場合、文書から BaseURL を自動推論します（下記のヒントを参照）

### 内部リンクと外部リンク

コンテンツリンク（`<a href>`）は 2 つのスイッチで内部リンクと外部リンクを個別に制御します：

| スイッチ | 制御範囲 | 判定方法 |
|------|----------|----------|
| `IncludeContentLinks` | 内部リンク | URL 自体が相対パス、または `BaseURL` と同一ドメイン |
| `IncludeExternalLinks` | 外部リンク | URL が絶対パスかつ `BaseURL` と異なるドメイン（`IsDifferentDomain`） |

デフォルトはともに `true`（すべてのコンテンツリンクを抽出）。その他のリソースタイプ（画像、CSS、JS など）は内部/外部の区別を受けず、それぞれの `Include*` スイッチでのみ制御されます。

### preload / prefetch の処理

`<link rel="preload" as="...">` と `rel="prefetch"` は `as` 属性に基づいて異なるタイプにルーティングされます：

| `as` 属性値 | 分類されるタイプ | 制御スイッチ |
|-------------|----------|----------|
| `style` | `css` | `IncludeCSS` |
| `script` | `js` | `IncludeJS` |
| `image` | `image` | `IncludeImages` |
| `video` | `video` | `IncludeVideos` |
| `audio` | `audio` | `IncludeAudios` |

`dns-prefetch`、`preconnect` も同様にこのルーティングを経由しますが、通常 `as` 属性を持たないため収録されません。

:::tip BaseURL の自動検出
`ResolveRelativeURLs=true` かつ `BaseURL` が**空の場合**、ライブラリは HTML 文書自身から BaseURL を自動的に推論します。以下の**優先順位**で順に試し、一致したものがあればその時点で返します：

1. `<base href>` タグ;
2. `<meta property="og:url">` または `<meta property="canonical">` の `content`;
3. `<link rel="canonical" href>`;
4. 文書中に最初に出現する絶対 URL（`href`/`src` から base を抽出）。

`BaseURL` を明示的に設定すると**自動検出をスキップ**し、呼び出し元が指定した値を優先します。
:::

## 例

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
<a href="/about">私たちについて</a>
<img src="/img/logo.png" alt="Logo">
<video src="/media/intro.mp4"></video>
</body></html>`)

	cfg := html.DefaultConfig()
	cfg.BaseURL = "https://example.com"
	links, err := html.ExtractAllLinks(data, cfg)
	if err != nil {
		log.Fatal(err)
	}

	// タイプ別にグループ化してから出力
	groups := html.GroupLinksByType(links)
	for typ, items := range groups {
		fmt.Printf("%s（%d 件）:\n", typ, len(items))
		for _, l := range items {
			fmt.Printf("  - %s [%s]\n", l.URL, l.Title)
		}
	}
}
```
