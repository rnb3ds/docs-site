---
sidebar_label: "エンコーディング検出実践"
title: "エンコーディング検出実践 - CyberGo html | 文字エンコーディング自動認識ガイド"
description: "CyberGo html エンコーディング検出実践：4 段階の検出優先度、15+ 種のエンコーディング対応、Config.Encoding の手動指定、統計アルゴリズムによるスマート認識と GBK/Shift_JIS の自動検出サンプルを詳しく解説します。"
sidebar_position: 5
---

# エンコーディング検出実践

HTML ドキュメントはさまざまな文字エンコーディング（GBK、Shift_JIS、Windows-1252 など）を使用する場合があります。ライブラリは自動エンコーディング検出を内蔵しており、HTML バイトからエンコーディングを認識して UTF-8 に変換します。15+ 種類のエンコーディングに対応し、手動処理は不要です。

## 検出の優先度

ライブラリは以下の順序で入力エンコーディングを決定します。順番に試行し、最初に一致したものが適用されます：

| 優先度 | ソース | 説明 |
|--------|------|------|
| ① 最高 | `Config.Encoding` の手動指定 | 空でない場合は直接使用され、すべての自動検出がスキップされます |
| ② | HTML meta タグの宣言 | `<meta charset>` または `http-equiv="content-type"`、先頭 1024 バイトをスキャン |
| ③ | 統計アルゴリズムによるスマート検出 | 最大 10KB をサンプリング、信頼度 ≥ 80 で採用 |
| ④ フォールバック | UTF-8 | 上記すべてに一致しない場合は UTF-8 にフォールバック |

```text
Config.Encoding が空でない？── はい ──→ 直接使用
        │
        いいえ
        │
meta タグでエンコーディング宣言あり？── はい ──→ 宣言値を使用
        │
        いいえ
        │
統計アルゴリズムの信頼度 ≥ 80？── はい ──→ 統計結果を採用
        │
        いいえ
        │
        └──→ UTF-8
```

:::tip BOM 検出
上記 4 段階に加えて、ライブラリは BOM（バイトオーダーマーク）も検出します：UTF-8 BOM（`EF BB BF`）、UTF-16 LE BOM（`FF FE`）、UTF-16 BE BOM（`FE FF`）。BOM が存在する場合はエンコーディングが直接確定します。
:::

## 対応するエンコーディング

| 分類 | エンコーディング | 備考 |
|------|------|------|
| Unicode | UTF-8、UTF-16LE、UTF-16BE | デフォルトのフォールバックは UTF-8 |
| 西欧 | Windows-1252、ISO-8859-1、ISO-8859-15 | ISO-8859-15 にはユーロ記号が含まれます |
| 中欧 | Windows-1250 | — |
| キリル | Windows-1251 | ロシア語など |
| 簡体字中国語 | GBK | エイリアス `gb2312` は自動的に `gbk` に正規化 |
| 繁体字中国語 | Big5 | — |
| 日本語 | Shift_JIS、EUC-JP | — |
| 韓国語 | EUC-KR | — |

### エンコーディングエイリアスの正規化

エンコーディング名とエイリアスは**大文字小文字を区別せず**、自動的に標準名に正規化されます：

| 入力エイリアス | 正規化結果 |
|----------|-----------|
| `gb2312`、`GB2312` | `gbk` |
| `sjis`、`x-sjis`、`shift-jis` | `shift_jis` |
| `latin1`、`latin-1` | `iso-8859-1` |
| `utf8`、`utf_8` | `utf-8` |
| `8859-1`、`iso88591` | `iso-8859-1` |
| `cp1252`、`windows1252` | `windows-1252` |

## 自動検出のサンプル

GBK エンコーディングの中国語 HTML を、meta タグの宣言から自動認識します：

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
    "golang.org/x/text/encoding/simplifiedchinese"
)

func main() {
    // GBK エンコーディングの中国語 HTML（meta タグで charset=gbk を宣言）
    gbkHTML := `<html><head><meta charset="gbk">` +
        `<title>中文网页</title></head>` +
        `<body><article><h1>你好世界</h1>` +
        `<p>这是一段中文内容。</p></article></body></html>`

    // UTF-8 文字列を GBK バイトにエンコード（実際の GBK ウェブページをシミュレート）
    gbkBytes, err := simplifiedchinese.GBK.NewEncoder().Bytes([]byte(gbkHTML))
    if err != nil {
        log.Fatal(err)
    }

    // エンコーディングを自動検出して抽出（meta charset から GBK を認識し、UTF-8 変換後に抽出）
    result, err := html.Extract(gbkBytes)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println("タイトル：", result.Title)
    // タイトル：中文网页

    fmt.Println("本文：", result.Text)
    // 本文：你好世界
    //       这是一段中文内容。
}
```

## エンコーディングの手動指定

meta タグが存在しない、宣言が誤っている、または自動検出の結果が不確実な場合は、`Config.Encoding` で強制的に指定できます：

```go
cfg := html.DefaultConfig()
cfg.Encoding = "gbk"

result, err := html.Extract(gbkBytes, cfg)
```

| 適用シーン | 説明 |
|----------|------|
| ソースのエンコーディングが既知 | HTTP `Content-Type` ヘッダーからエンコーディングを取得し、直接指定して誤検出を回避 |
| meta タグが不在 | `<meta charset>` 宣言がない古いウェブページ |
| 自動検出のエラー | 統計アルゴリズムの信頼度が不足し、結果が不正確 |

:::tip Config.Encoding の優先度が最も高い
`Config.Encoding` を設定すると、ライブラリは自動検出を完全にスキップし、指定されたエンコーディングで直接デコードします。確実性が求められるシーンに適しており、統計的検出の不確実性を回避できます。
:::

### Shift_JIS 自動検出の実践

日本語のウェブページでは Shift_JIS エンコーディングがよく使われます。meta 宣言がなくても、統計アルゴリズムで認識できます：

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
    "golang.org/x/text/encoding/japanese"
)

func main() {
    // Shift_JIS エンコーディングの日本語 HTML（meta charset 宣言なし）
    sjisHTML := `<html><head><title>日本語ページ</title></head>` +
        `<body><article><h1>こんにちは</h1>` +
        `<p>東京の天気は晴れです。</p></article></body></html>`

    // Shift_JIS バイトにエンコード
    sjisBytes, err := japanese.ShiftJIS.NewEncoder().Bytes([]byte(sjisHTML))
    if err != nil {
        log.Fatal(err)
    }

    // 統計アルゴリズムで Shift_JIS を自動認識（サンプリングしたバイトから日本語文字の分布を分析）
    result, err := html.Extract(sjisBytes)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println("タイトル：", result.Title)
    // タイトル：日本語ページ

    fmt.Println("本文：", result.Text)
    // 本文：こんにちは
    //       東京の天気は晴れです。
}
```

### Windows-1252 の手動指定

西欧エンコーディング（`é`、`€` などの文字を含む）は手動で指定できます：

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
    "golang.org/x/text/encoding/charmap"
)

func main() {
    // Windows-1252 エンコーディングの西欧テキスト
    winHTML := `<html><head><title>Café Menu</title></head>` +
        `<body><article><h1>Café</h1>` +
        `<p>Price: 100 €. Résumé available.</p></article></body></html>`

    winBytes, err := charmap.Windows1252.NewEncoder().Bytes([]byte(winHTML))
    if err != nil {
        log.Fatal(err)
    }

    // Windows-1252 エンコーディングを手動指定
    cfg := html.DefaultConfig()
    cfg.Encoding = "windows-1252"

    result, err := html.Extract(winBytes, cfg)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println("タイトル：", result.Title)
    // タイトル：Café Menu

    fmt.Println("本文：", result.Text)
    // 本文：Café
    //       Price: 100 €. Résumé available.
}
```

## エンコーディング検出の失敗

エンコーディングの検出や変換に失敗した場合（データの破損、未サポートのエンコーディングの使用など）、wrapping error が返されます：

```go
result, err := html.Extract(data)
if err != nil {
    if strings.Contains(err.Error(), "encoding detection failed") {
        // エンコーディング検出失敗、手動指定にフォールバック
        cfg := html.DefaultConfig()
        cfg.Encoding = "windows-1252"
        result, err = html.Extract(data, cfg)
        if err != nil {
            log.Fatal(err)
        }
    } else {
        log.Fatal(err)
    }
}
```

:::warning エラーメッセージの形式
エンコーディング検出失敗のエラーメッセージには固定のプレフィックス `"encoding detection failed"` が含まれ、`strings.Contains` でマッチできます。検出失敗時は手動でのエンコーディング指定へのフォールバックを推奨します。
:::

## 監査ログ

監査を有効にすると、エンコーディング検出の問題は `AuditEventEncodingIssue`（info レベル）として記録されます：

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    cfg := html.DefaultConfig()
    cfg.Audit = html.DefaultAuditConfig()
    cfg.Audit.Enabled = true
    // LogEncodingIssues はデフォルトで true（DefaultAuditConfig で有効化済み）

    p, err := html.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer p.Close()

    // HTML を処理（エンコーディングの問題は自動的に監査ログに記録）
    p.Extract([]byte(`<html><body><p>content</p></body></html>`))

    // 監査ログ内のエンコーディングイベントを照会
    for _, entry := range p.GetAuditLog() {
        if entry.EventType == html.AuditEventEncodingIssue {
            fmt.Printf("[エンコーディングの問題] %s\n", entry.Message)
        }
    }

    fmt.Println("エンコーディングイベントのチェック完了")
    // エンコーディングイベントのチェック完了
}
```

:::tip トリガー条件
`AuditEventEncodingIssue` はエンコーディングの検出や変換に失敗した場合にのみ記録されます（未サポートのエンコーディングの使用かつデータが有効な UTF-8 でない場合など）。正常なドキュメントではこのイベントは発生しません。エンコーディングの問題は `info` レベル（最低）に属し、データが完全にデコードされていない可能性があるものの、セキュリティには影響しないことを示します。フィルタリングが必要な場合は、`LevelFilteredSink` で最低レベルを `warning` に設定することで除外できます。
:::

## 次のステップ

- [コンテンツ抽出実践](./content-extraction) - 抽出フローと記事認識
- [エラー処理](../error-handling) - センチネルエラーと構造化エラー処理
- [API リファレンス：設定](../../api-reference/core/config) - Encoding フィールドとすべての設定オプション
