---
sidebar_label: "メディア抽出実践"
title: "メディア抽出実践 - CyberGo html | 動画と音声抽出ガイド"
description: "CyberGo html メディア抽出実践：動画の 3 ソーススキャン（生 HTML、DOM 走査、正規表現フォールバック）、音声の 2 ソース抽出、VideoInfo と AudioInfo のフィールド、Type によるファイルと embed 埋め込みの区別を詳しく解説します。"
sidebar_position: 2
---

# メディア抽出実践

テキスト、画像、リンクに加えて、ライブラリは HTML から動画と音声リソースを抽出できます。本ガイドでは抽出メカニズムとフィールドの意味を詳しく解説します。

## 抽出の概要

`Extract` を呼び出す際、動画と音声の抽出は DOM パースの後、コンテンツのフォーマット前に実行されます。結果はそれぞれ `Result.Videos` と `Result.Audios` に格納されます。

```text
DOM パース → 動画抽出（3 ソース） → 音声抽出（2 ソース） → フォーマット → Result
```

## 動画抽出（3 つのソース）

動画抽出は以下の順序で実行され、各 URL は重複排除されるため、重複して収集されることはありません：

| 順序 | ソース | 走査対象 | 説明 |
|------|------|----------|------|
| ① | 生 HTML スキャン | `iframe`/`embed`/`object` の `src`/`data` 属性 | 安全なサニタイズの**前に**実行され、サニタイズされる埋め込みタグが失われないようにします |
| ② | DOM 走査 | `video`/`iframe`/`embed`/`object` 要素 | パースされた DOM ツリーを走査し、要素の属性と `<source>` 子要素を読み取ります |
| ③ | 正規表現フォールバック | 動画ファイル URL | HTML テキスト内の裸の動画リンクをスキャンします |

:::tip なぜ生 HTML をスキャンするのか
`iframe`、`embed`、`object` などの埋め込みタグは、安全なサニタイズ段階で削除される可能性があります。ライブラリはサニタイズの前に、生 HTML 文字列からこれらのタグのメディア URL を抽出することで、埋め込み動画がサニタイズによって失われないようにします。
:::

### 正規表現フォールバックが対応する動画拡張子

```
.mp4  .webm  .ogg  .mov  .avi  .wmv  .flv  .mkv  .m4v  .3gp
```

正規表現は `http://` または `https://` で始まる完全な URL のみをマッチし、ファイル名の断片を誤ってマッチすることはありません。

## 音声抽出（2 つのソース）

| 順序 | ソース | 走査対象 | 説明 |
|------|------|----------|------|
| ① | DOM 走査 | `audio` 要素および `<source>` 子要素 | `src` 属性または子 `<source>` の `src`/`type` を読み取ります |
| ② | 正規表現フォールバック | 音声ファイル URL | HTML テキスト内の裸の音声リンクをスキャンします |

### 正規表現フォールバックが対応する音声拡張子

```
.mp3  .wav  .ogg  .m4a  .aac  .flac  .wma  .opus  .oga
```

:::warning .ogg 拡張子は動画と音声の両方のリストに含まれます
OGG はコンテナフォーマットであり、動画（Theora）または音声（Vorbis/Opus）を格納できます。拡張子 `.ogg` の URL は**動画でも音声でもある**と検出され、`Result.Videos` と `Result.Audios` の両方に同時に現れる可能性があります。音声専用のバリアント `.oga` は音声リストにのみ現れます。
:::

## フィールドの詳細

### VideoInfo

| フィールド | 型 | 説明 |
|------|------|------|
| `URL` | `string` | 動画ソースのアドレス |
| `Type` | `string` | 検出されたタイプ：MIME タイプ（例：`video/mp4`）または `embed`（iframe で埋め込まれたページ） |
| `Poster` | `string` | `<video>` の `poster` 属性（カバー画像の URL） |
| `Width` | `string` | 幅属性（元の文字列、数値にはパースされません） |
| `Height` | `string` | 高さ属性（元の文字列、数値にはパースされません） |
| `Duration` | `string` | 再生時間属性（元の文字列、数値にはパースされません） |

### AudioInfo

| フィールド | 型 | 説明 |
|------|------|------|
| `URL` | `string` | 音声ソースのアドレス |
| `Type` | `string` | 検出されたタイプ：MIME タイプ（例：`audio/mpeg`） |
| `Duration` | `string` | 再生時間属性（元の文字列、数値にはパースされません） |

### Type フィールドの値の決定ルール

`Type` は 2 種類の動画ソースを区別します：

| Type の値 | 意味 | 発生するシーン |
|---------|------|----------|
| `embed` | iframe が参照する動画ページ | YouTube、Vimeo、Youku、Bilibili などの埋め込みプレーヤー |
| MIME タイプ（例：`video/mp4`） | 動画ファイルコンテナ | 正規表現フォールバックでマッチした裸の URL、または `<source type="...">` 属性値 |
| 空文字列 | タイプが検出されなかった | `<video src="...">` でソースを直接指定（`<source>` 子要素がない場合） |

`embed` 検出に対応する埋め込みプラットフォーム：

| プラットフォーム | URL パターン |
|------|----------|
| YouTube | `youtube.com/embed/`、`youtube-nocookie.com/embed/` |
| Vimeo | `player.vimeo.com/video/` |
| Dailymotion | `dailymotion.com/embed/` |
| Youku | `player.youku.com/` |
| Tencent Video | `v.qq.com/` |
| Bilibili | `bilibili.com/` |

## 完全なサンプル

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    // 3 つのメディアシナリオを含む HTML：
    // 1. iframe による YouTube 埋め込み（Type = "embed"）
    // 2. <source> 子要素を持つネイティブ動画（Type は type 属性から取得）
    // 3. <source> 子要素を持つ音声（Type は type 属性から取得）
    data := []byte(`<html><body><article>
        <h1>マルチメディアページ</h1>
        <p>この記事では動画と音声の技術について紹介します。</p>
        <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" width="560" height="315"></iframe>
        <video poster="poster.jpg" width="640" height="360">
            <source src="https://example.com/trailer.mp4" type="video/mp4">
        </video>
        <audio>
            <source src="https://example.com/episode.mp3" type="audio/mpeg">
        </audio>
    </article></body></html>`)

    result, err := html.Extract(data)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Printf("動画数：%d\n", len(result.Videos))
    // 動画数：2

    for i, v := range result.Videos {
        fmt.Printf("  動画 %d: %s\n", i+1, v.URL)
        fmt.Printf("    Type: %s", v.Type)
        if v.Poster != "" {
            fmt.Printf(", ポスター: %s", v.Poster)
        }
        if v.Width != "" || v.Height != "" {
            fmt.Printf(", サイズ: %sx%s", v.Width, v.Height)
        }
        fmt.Println()
    }
    // 動画 1: https://www.youtube.com/embed/dQw4w9WgXcQ
    //   Type: embed, サイズ: 560x315
    // 動画 2: https://example.com/trailer.mp4
    //   Type: video/mp4, ポスター: poster.jpg, サイズ: 640x360

    fmt.Printf("\n音声数：%d\n", len(result.Audios))
    // 音声数：1

    for i, a := range result.Audios {
        fmt.Printf("  音声 %d: %s (Type: %s)\n", i+1, a.URL, a.Type)
    }
    // 音声 1: https://example.com/episode.mp3 (Type: audio/mpeg)
}
```

## 設定による制御

### Preserve* オプション

`PreserveVideos` と `PreserveAudios` は `Extract` の結果にメディアを含めるかどうかを制御します：

| 設定フィールド | デフォルト値 | 機能 |
|----------|--------|------|
| `PreserveVideos` | `true` | `false` の場合 `Result.Videos` は空のスライスになります |
| `PreserveAudios` | `true` | `false` の場合 `Result.Audios` は空のスライスになります |

```go
cfg := html.DefaultConfig()

// 動画と音声の抽出を無効化（テキスト、画像、リンクのみ保持）
cfg.PreserveVideos = false
cfg.PreserveAudios = false

result, err := html.Extract(data, cfg)
// result.Videos → []
// result.Audios → []
```

### Preserve* と Include* の違い

2 つの設定グループは独立して動作し、異なる API を制御します：

| 設定グループ | 制御する API | 説明 |
|--------|-----------|------|
| `PreserveVideos`/`PreserveAudios` | `Extract` | `Result.Videos`/`Result.Audios` にデータを格納するかどうかを制御 |
| `IncludeVideos`/`IncludeAudios` | `ExtractAllLinks` | リンク列挙に動画/音声 URL を含めるかどうかを制御 |

:::warning 両者は独立しています
`PreserveVideos` を無効にしても `ExtractAllLinks` の `IncludeVideos` には影響せず、逆も同様です。使用する API に応じて対応するオプションを設定してください。
:::

### TextOnlyConfig パフォーマンスプリセット

テキストのみが必要な場合、`TextOnlyConfig()` はすべての `Preserve*` オプションを無効化済みのため、手動設定は不要です：

```go
cfg := html.TextOnlyConfig()
// PreserveImages = false
// PreserveLinks = false
// PreserveVideos = false
// PreserveAudios = false

result, err := html.Extract(data, cfg)
// すべてのメディア抽出をスキップし、最高のパフォーマンスを得る
```

## 次のステップ

- [コンテンツ抽出実践](./content-extraction) - 抽出フローと記事認識
- [出力フォーマット実践](./output-formats) - プレーンテキスト、Markdown、JSON の比較
- [API リファレンス：データ型](../../api-reference/types/type-defs) - VideoInfo/AudioInfo の完全な定義
