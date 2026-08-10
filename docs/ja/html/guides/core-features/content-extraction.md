---
sidebar_label: "コンテンツ抽出実践"
title: "コンテンツ抽出実践 - CyberGo html | 抽出フローガイド"
description: "CyberGo html コンテンツ抽出実践ガイド：入力から Result までの抽出フロー、スマート記事認識メカニズム、Result 構造体の各フィールド解読、カスタム Scorer の実装、エンコーディング検出処理について詳しく解説します。"
sidebar_position: 1
---

# コンテンツ抽出実践

このガイドでは、実際のユースケースを通じて HTML コンテンツ抽出の仕組みとベストプラクティスを理解します。

## 抽出フローの概要

`Extract` を呼び出すと、ライブラリは以下のステップを実行します：

```text
HTML 入力 → 入力検証 → エンコーディング検出 (自動 UTF-8 変換) → DOM パース → 深さ検証
    → 安全なサニタイズ (任意) → 記事検出 (任意) → コンテンツ抽出 → フォーマット → Result を返す
```

深さ検証はサニタイズの **前に**実行されます。まず DOM の深さを反復的 (iterative) に検証し (再帰的な走査によるスタックオーバーフローを回避)、その後でパースされた DOM ツリーに対して安全なサニタイズを行います。どちらもパースされたノードツリーを対象とするため、DOM パースは常にその両方より先に行われます。

各ステップは [設定](../../api-reference/core/config) でカスタマイズできます。

## 基本的なテキスト抽出

最もシンプルな使い方は、HTML バイトからコンテンツを抽出することです：

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    data := []byte(`<html>
        <head><title>Go 言語チュートリアル</title></head>
        <body>
            <article>
                <h1>Go 入門ガイド</h1>
                <p>Go は静的型付けのコンパイル言語で、組み込みの並行処理サポートを備えています。</p>
                <p>コンパイルが速く、デプロイが簡単で、高性能サービスの構築に適しています。</p>
                <img src="gopher.png" alt="Gopher マスコット" />
                <a href="https://go.dev">Go 公式サイト</a>
            </article>
        </body>
    </html>`)

    result, err := html.Extract(data)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println("タイトル：", result.Title)
    // タイトル：Go 言語チュートリアル

    fmt.Println("本文：", result.Text)
    // 本文：Go 入門ガイド
    //       Go は静的型付けのコンパイル言語で、組み込みの並行処理サポートを備えています。
    //       コンパイルが速く、デプロイが簡単で、高性能サービスの構築に適しています。
    //       Go 公式サイト

    fmt.Println("単語数：", result.WordCount)
    // 単語数：7

    fmt.Println("読了時間：", result.ReadingTime)
    // 読了時間：2.1s（200 語/分で計算）

    fmt.Println("画像：", len(result.Images))
    // 画像：1

    fmt.Println("リンク：", len(result.Links))
    // リンク：1
}
```

## 抽出結果の理解

`Result` は以下のフィールドを含みます：

| フィールド | 型 | 説明 |
|------|------|------|
| `Title` | `string` | ページタイトル。`<title>` を優先、次に `<h1>`、`<h2>` |
| `Text` | `string` | 本文コンテンツ（クリーニング済み、タグと余分な空白は除去） |
| `Images` | `[]ImageInfo` | 抽出された画像のリスト |
| `Links` | `[]LinkInfo` | 抽出されたリンクのリスト |
| `Videos` | `[]VideoInfo` | 抽出された動画のリスト |
| `Audios` | `[]AudioInfo` | 抽出された音声のリスト |
| `WordCount` | `int` | 本文の単語数 |
| `ReadingTime` | `time.Duration` | 推定読了時間（200 語/分） |
| `ProcessingTime` | `time.Duration` | 処理時間 |

## ファイルから抽出

ローカル HTML ファイルを処理する場合、`ExtractFromFile` を使用します：

```go
result, err := html.ExtractFromFile("article.html")
if err != nil {
    log.Fatal(err)
}
fmt.Println("タイトル：", result.Title)
```

ファイル操作には組み込みのセキュリティチェックがあります：
- パストラバーサル攻撃の自動検出（例：`../../../etc/passwd`）
- ファイルサイズは `MaxInputSize` で制限
- エラーメッセージは `SafePath()` で完全パスを隠蔽

## 記事認識アルゴリズム

`ExtractArticle` が `true`（デフォルト）の場合、ライブラリはページ内の「メインコンテンツ領域」を自動的に認識します。

### 動作原理

1. **候補ノードのスコアリング**：DOM ツリーを走査し、各要素ノードのコンテンツ関連性をスコアリング
2. **最良候補の選択**：最もスコアの高いノードを記事コンテナとして選択
3. **フォールバック**：適切な候補が見つからない場合、`<body>` ノードにフォールバック

### デフォルトスコアラーのシグナル次元

組み込みの `DefaultScorer` は多次元シグナルに基づいて総合的にスコアリングし、最もスコアの高いコンテナを選択します：

| 次元 | 正のシグナル | 負のシグナル |
|------|----------|----------|
| **タグセマンティクス** | `<article>`(+1000)、`<main>`(+900)、`<section>`(+300)、`<body>`(+100) | `nav`/`aside`/`footer`/`header`/`script`/`style` は直接 0 を返す |
| **class/id パターン** | `content`/`article`/`post`/`main`/`entry`/`story`（強い正）；`blog`/`news`/`detail`/`page`（中程度の正） | `comment`/`sidebar`/`nav`/`ad`/`menu`（強い負）；`widget`/`share`/`social`/`related`（中程度の負）；`promo`/`banner`/`sponsor`（弱い負） |
| **段落密度** | サブツリー内の `<p>` 数に倍率を乗じて加点（段落が多いほど本文である可能性が高い） | — |
| **テキスト長** | 閾値を超える長いテキストで加点；閾値未満の短いテキストで減点 | — |
| **コンテンツ密度** | テキスト/タグ比が高い場合に増幅係数を乗算 | 比が低い場合に減衰係数を乗算 |
| **リンク密度** | — | テキストが短くリンクが密集している場合にペナルティ（ナビゲーションバーやサイトマップの可能性） |
| **句読点特徴** | カンマ密集（中国語のカンマ `，` を含む）は散文体を示唆し、加点 | — |
| **ARIA role** | `role="main"`/`role="article"`(+500) | `role="navigation"`/`role="complementary"`(-400) |
| **非表示要素** | — | `style="display:none"`/`visibility:hidden` または `hidden` 属性のノードは削除 |

:::tip レイアウトラッパーの特別扱い
class/id がコンテンツシグナル（`content`/`article`）と削除シグナル（`sidebar` など）を同時に含む場合——典型的なのが CSS レイアウトクラス `content-sidebar`——スコアラーはそのノードを**削除しません**。メインコンテンツを内包しているためです。セマンティックタグ `<article>`/`<main>`（または `role="main"`/`role="article"`）は class/id 削除ヒューリスティックから一律に除外され、`<article class="post-with-sidebar">` が誤って削除されないようにします。
:::

:::warning 記事認識は万能ではない
記事認識はニュース、ブログ、ドキュメントなど明確な「本文領域」があるページに最も適しています。ナビゲーションページ、リストページ、ギャラリーなどの非記事型ページでは本文を正確に特定できない場合があります——その場合は `ExtractArticle = false` を設定して `<body>` 全体のコンテンツを抽出できます。
:::

:::tip 適用シーン
記事認識は、ニュース、ブログ、ドキュメントなど明確な「本文領域」があるページに最適です。ナビゲーションページやリストページでは、本文を正確に特定できない場合があります。
:::

### カスタムスコアリング

`Scorer` インターフェースを実装してスコアリングロジックをカスタマイズします：

```go
type myScorer struct{}

func (s myScorer) Score(node html.ContentNode) int {
    // ノードの特徴に基づいてスコアを返す
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
    // true を返すとそのノードを削除
    return node.Data() == "nav" || node.Data() == "footer"
}
```

:::tip 注意
この例の `strings.Contains` は標準ライブラリ `strings` パッケージのものです。完全な実行可能な例は [テストとカスタム拡張](../integration/testing-custom) を参照してください。
:::

## テキストのみ抽出

プレーンテキストのみが必要で、画像やリンクなどのメタデータが不要な場合：

```go
text, err := html.ExtractText(data)
if err != nil {
    log.Fatal(err)
}
fmt.Println(text)
```

これはテキスト分析や検索インデックス構築などのシーンで非常に実用的です。

## テーブルレンダリング

HTML 中の `<table>` は `TableFormat` 設定に従って抽出テキストにレンダリングされます：

```go
cfg := html.DefaultConfig()
cfg.TableFormat = "markdown" // デフォルト、または "html"
```

| フォーマット | レンダリング効果 | 適用シーン |
|------|----------|----------|
| `"markdown"` | Markdown テーブル（ヘッダー区切り行を含む）；`colspan` は繰り返しセルに展開；幅定義のみの構造行はスキップ | 人間の閲覧、Markdown 消費 |
| `"html"` | 元の HTML `<table>` タグを保持（`colspan`/`rowspan` はそのまま保持）；構造行も保持 | 正確なテーブル構造が必要な下流処理 |

:::tip フォーマットは大文字小文字を区別しない
`TableFormat` の値は大文字小文字を区別しません（`"Markdown"` と `"markdown"` は同等）。空の値は `"markdown"` にフォールバックします。
:::

例——テーブルを含む HTML の抽出：

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    data := []byte(`<html><body><article>
        <h1>価格表</h1>
        <table>
            <tr><th>製品</th><th>価格</th></tr>
            <tr><td>ベーシック版</td><td>無料</td></tr>
            <tr><td>プロ版</td><td>¥99/月</td></tr>
        </table>
    </article></body></html>`)

    result, err := html.Extract(data)
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(result.Text)
    // 出力（TableFormat = "markdown" の場合）：
    // 価格表
    //
    // | 製品       | 価格    |
    // |------------|---------|
    // | ベーシック版 | 無料    |
    // | プロ版      | ¥99/月  |
}
```

## 非 UTF-8 エンコーディングの処理

ライブラリは 15+ 種類の文字エンコーディング（UTF-8、GBK、Shift_JIS、Windows-1252 など）を自動検出し、自動的に UTF-8 に変換します。

```go
// エンコーディングを自動検出
result, err := html.Extract(gbkEncodedData)

// エンコーディングを手動指定
cfg := html.DefaultConfig()
cfg.Encoding = "gbk"
result, err = html.Extract(gbkEncodedData, cfg)
```

## コンテキストとタイムアウト

大きなファイルや信頼できないソースからの HTML では、コンテキスト付きバージョンの使用を推奨します：

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

result, err := html.ExtractWithContext(ctx, data)
if errors.Is(err, html.ErrProcessingTimeout) {
    log.Println("処理がタイムアウトしました")
}
```

## 次のステップ

- [出力フォーマット実践](./output-formats) - 用途に合った出力フォーマットの選択
- [Processor 再利用とキャッシュ](../performance/processor-cache) - 高頻度呼び出しのパフォーマンス最適化
- [API リファレンス：パッケージ関数](../../api-reference/core/functions) - 完全な関数シグネチャ
