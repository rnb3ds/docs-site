---
sidebar_label: "データ型"
title: "型定義 - CyberGo html | データ型リファレンス"
description: "CyberGo html データ型リファレンス：Result、ImageInfo、LinkInfo、LinkResource、Statistics、BatchResult などコア型のフィールド定義と JSON タグ、VideoInfo や AudioInfo などのメディア型について詳しく説明します。"
sidebar_position: 2
---

# 型定義

## Result

抽出結果。テキスト、メタデータ、メディア情報を含みます。

```go
type Result struct {
    Text           string        `json:"text"`
    Title          string        `json:"title"`
    Images         []ImageInfo   `json:"images,omitempty"`
    Links          []LinkInfo    `json:"links,omitempty"`
    Videos         []VideoInfo   `json:"videos,omitempty"`
    Audios         []AudioInfo   `json:"audios,omitempty"`
    ProcessingTime time.Duration `json:"-"`       // 処理時間（標準シリアライズに含まれない）
    WordCount      int           `json:"word_count"`
    ReadingTime    time.Duration `json:"-"`       // 推定読了時間（標準シリアライズに含まれない）
}
```

### MarshalJSON

カスタム JSON シリアライズ。`ProcessingTime` と `ReadingTime` は `json:"-"` タグを持ちますが（標準シリアライズではスキップ）、カスタム `MarshalJSON()` メソッドによりミリ秒数として出力されます。

```go
func (r *Result) MarshalJSON() ([]byte, error)
```

:::warning 警告
`Result`は`UnmarshalJSON`を**実装していません**。`MarshalJSON()`の出力を再度`Result`にデシリアライズすると、`ProcessingTime`や`ReadingTime`などの duration フィールドが**失われます** — JSON 出力のキー名（`processing_time_ms`, `reading_time_ms`）が struct フィールド名と一致しないため、復元できません。

これは**意図的な設計**です。この JSON 形式は外部消費（API レスポンス、ログ、フロントエンド表示など）を対象としており、双方向シリアライズを想定したものではありません。
:::

## ImageInfo

画像情報。

```go
type ImageInfo struct {
    URL          string `json:"url"`           // 画像アドレス
    Alt          string `json:"alt"`           // 代替テキスト
    Title        string `json:"title"`         // タイトル
    Width        string `json:"width"`         // 幅
    Height       string `json:"height"`        // 高さ
    IsDecorative bool   `json:"is_decorative"` // 装飾画像かどうか
    Position     int    `json:"position"`      // ドキュメント内の位置
}
```

### フィールドの意味

| フィールド | 説明 |
|------|------|
| `URL` | 画像の `src` 属性値；有効な URL のみ（`IsValidURL` で検証）、無効な URL の `<img>` は結果に含まれません |
| `Alt` | `alt` 属性の原文；空の場合 `IsDecorative` が `true` になります |
| `Title` | `title` 属性の原文（ページタイトルではありません） |
| `Width`/`Height` | HTML 属性の**元の文字列**（`"640"`、`"50%"` など）、数値には解析されていません——ページによって表記が異なる場合があります |
| `IsDecorative` | `Alt` が空の場合 `true`、装飾画像の識別とスキップに利用できます |
| `Position` | ドキュメント内の 1 始まりの序数；`PreserveImages = false` の場合 `Images` スライス全体が空になります |

:::warning Width/Height は数値型ではない
`Width` と `Height` は `int` ではなく `string` 型で、HTML ソースの元の表現（単位、パーセンテージなどを含む可能性）を保持します。数値が必要な場合は呼び出し側で解析してください。
:::

## LinkInfo

リンク情報。

```go
type LinkInfo struct {
    URL        string `json:"url"`         // リンクアドレス
    Text       string `json:"text"`        // リンクテキスト
    Title      string `json:"title"`       // リンクタイトル
    IsExternal bool   `json:"is_external"` // 外部リンクかどうか（URL 自体が絶対外部 URL かで判定し、BaseURL とは比較しない）
    IsNoFollow bool   `json:"is_nofollow"` // nofollow かどうか
    Position   int    `json:"position"`    // ドキュメント内の位置
}
```

### フィールドの意味

| フィールド | 説明 |
|------|------|
| `URL` | `href` 属性値；有効な URL のみ（`IsValidURL` で検証）、無効な URL の `<a>` は Position を消費しますがスライスには追加されません |
| `Text` | `<a>` タグ内の全テキストノードの結合（再帰的 `GetTextContent`） |
| `Title` | `title` 属性の原文（リンクテキストではありません） |
| `IsExternal` | URL 自体が絶対外部アドレスかで判定し、**`BaseURL` とのドメイン比較は行いません**——これは `ExtractAllLinks` の内部/外部判定とは異なります |
| `IsNoFollow` | `rel` 属性に `nofollow` が含まれる（大文字小文字を区別しない、ASCII フォールディングマッチ）場合 `true` |
| `Position` | ドキュメント内の 1 始まりの序数；無効な `<a>`（href が不正または欠落）も序数を消費しますがスライスには追加されないため、Position は連続しない場合があります |

## VideoInfo

動画情報。

```go
type VideoInfo struct {
    URL      string `json:"url"`      // 動画アドレス
    Type     string `json:"type"`     // 動画タイプ
    Poster   string `json:"poster"`   // サムネイル画像アドレス
    Width    string `json:"width"`    // 幅
    Height   string `json:"height"`   // 高さ
    Duration string `json:"duration"` // 再生時間
}
```

### Type フィールドの値の規則

| Type 値 | 意味 | 生成されるシナリオ |
|---------|------|----------|
| `"embed"` | iframe が参照する動画ページ | YouTube、Vimeo、優酷、Bilibili などの組み込みプレーヤー |
| MIME タイプ（例 `"video/mp4"`） | 動画ファイルコンテナ | `<source type="video/mp4">` 属性値 |
| 空文字列 | タイプ未検出 | `<video src="...">` で直接ソース指定かつ `<source>` 子要素がない場合 |

:::tip 動画抽出の 3 つのソース
動画抽出は生 HTML スキャン → DOM 走査 → 正規表現フォールバックの 3 ステップで実行され、各ステップで重複排除されます。詳細は [メディア抽出ガイド](../../guides/core-features/media-extraction) を参照してください。
:::

## AudioInfo

音声情報。

```go
type AudioInfo struct {
    URL      string `json:"url"`      // 音声アドレス
    Type     string `json:"type"`     // 音声タイプ
    Duration string `json:"duration"` // 再生時間
}
```

### Type フィールドの値の規則

| Type 値 | 生成されるシナリオ |
|---------|----------|
| MIME タイプ（例 `"audio/mpeg"`） | `<source type="audio/mpeg">` 属性値 |
| 空文字列 | `<audio src="...">` で直接ソース指定かつ `<source>` 子要素がない場合 |

:::warning .ogg 拡張子の二重性
OGG コンテナは動画または音声を格納できるため、`.ogg` URL は `Videos` と `Audios` の両方に現れます。音声専用の派生拡張子 `.oga` は `Audios` のみに現れます。
:::

## LinkResource

リンクリソース（リンク抽出 API で使用）。

```go
type LinkResource struct {
    URL   string // リンクアドレス
    Title string // リンクタイトル
    Type  string // リンクタイプ
}
```

## Statistics

処理統計情報。

```go
type Statistics struct {
    TotalProcessed    int64         // 総処理数
    CacheHits         int64         // キャッシュヒット数
    CacheMisses       int64         // キャッシュミス数
    ErrorCount        int64         // エラー数
    AverageProcessTime time.Duration // 平均処理時間
}
```

## BatchResult

バッチ処理結果。

```go
type BatchResult struct {
    Results   []*Result // 抽出結果、失敗またはキャンセル時は nil
    Errors    []error   // 失敗したエラー
    Success   int       // 成功数
    Failed    int       // 失敗数
    Cancelled int       // キャンセル数
}
```

## NodeAttr

HTML ノード属性。

```go
type NodeAttr struct {
    Key   string // 属性名
    Value string // 属性値
}
```
