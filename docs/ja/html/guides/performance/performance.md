---
sidebar_label: "パフォーマンス最適化"
title: "パフォーマンス最適化 - CyberGo html | スループット向上ガイド"
description: "CyberGo html パフォーマンス最適化ガイド：Processor インスタンス再利用、キャッシュ戦略、バッチ並行制御、入力サイズ・タイムアウト設定、sync.Pool メカニズムの理解で、HTML 処理のスループットを向上させる実践的なチューニング手法を解説します。"
sidebar_position: 3
---

# パフォーマンス最適化

本ページは html ライブラリのパフォーマンスチューニングの総覧です。まずライブラリ**内部に実装された最適化メカニズム**（性能特性の理解に役立つ）を説明し、その後に**設定レベルのチューニング**、**アンチパターンの回避**、**ベンチマーク方法**を取り上げます。

各トピックの完全な詳細が必要な場合は、同グループの専門ページを参照してください：

- [Processor 再利用とキャッシュ](./processor-cache) —— パッケージ関数 vs インスタンス、`sync.Pool` メカニズム、キャッシュ戦略とヒット率監視
- [バッチ処理の実践](./batch-processing) —— 4 つのバッチ API、`BatchResult` 構造、並行制御と部分失敗の処理

## 内部最適化メカニズム

html ライブラリはホットパスで大量のゼロアロケーションと再利用の最適化を行っています。これらのメカニズムを理解することで、異なる使用法の性能特性を予測し、ライブラリの最適化と「衝突」するのを避けられます。

### sync.Pool による Processor 再利用

パッケージレベル関数（例：`html.Extract`）は `sync.Pool` で `Processor` インスタンスを再利用し、毎回の呼び出しでエンコーディング検出器やスコアラーなどの重いオブジェクトを再構築するのを回避します：

```text
html.Extract(data)
  → sync.Pool から Processor を取得（プールにあれば再利用、なければ新規作成）
  → 抽出を実行
  → sync.Pool に返却（統計をゼロ化 + 監査ログをクリア + キャッシュをクリア）
```

プール化 Processor には 2 つの重要な設計があります：

- **キャッシュの無効化**：プール化インスタンスの `MaxCacheEntries`、`CacheTTL`、`CacheCleanup` はすべてゼロに設定されています。プール化インスタンスは返却されるたびに `ClearCache()` が呼ばれるため、キャッシュを有効にしてもハッシュ計算とバックグラウンドクリーンアップ goroutine のコストが増えるだけ（`Get` は常に miss）で、ヒットすることはありません。
- **カスタム Config 渡しはプール化されない**：`html.Extract(data, cfg)` でカスタム設定を渡す場合、ライブラリは**一時 Processor**を作成（使い終わったら即 `Close()`）し、プールのインスタンスは再利用しません——プールのインスタンスはデフォルト設定で固定されているためです。

:::tip いつインスタンスを自分で作成すべきか
プール化インスタンスはキャッシュが無効化されています。ループ内で**重複する可能性のある**コンテンツを繰り返し処理する場合（クローラーの重複除去、キャッシュ層の下流のサービスなど）、`html.New()` で常駐 `Processor` インスタンスを作成することでキャッシュヒットのメリットを得られます。詳細は [Processor 再利用とキャッシュ](./processor-cache) を参照してください。
:::

### キャッシュ Key 生成戦略

キャッシュ Key は `[16]byte`（128 ビット）の値で、`map` キーとして直接使用され、**Key の生成でヒープアロケーションは発生しません**。Key の計算入力には以下が含まれます：

- エンコーディング変換後の **UTF-8 コンテンツ**（元のバイト列ではない）——同じコンテンツが異なるエンコーディング宣言で入力されても同じキャッシュエントリにヒットします
- コンテンツ抽出スイッチ（`ExtractArticle`、`PreserveImages` など 5 つのブール値）を 1 つの `uint8` にパック
- フォーマットオプション（`InlineImageFormat`、`InlineLinkFormat`、`TableFormat`）

コンテンツのサイズに応じて、Key 生成は 2 つの戦略を採用します：

| コンテンツサイズ | 戦略 | 説明 |
|----------|------|------|
| ≤ 64 KB | 完全コンテンツハッシュ | 全バイトに対して xxHash スタイルの計算、衝突リスクなし |
| > 64 KB | 5 点サンプリング | 先頭 + 末尾 + 3 つの均等分布サンプリング点、各セグメント 4096 バイト |

大ドキュメントのサンプリングはハッシュコストを制限するためです——10 MB ドキュメントの完全ハッシュはキャッシュのメリットを打ち消します。5 点サンプリングは**ハッシュフラッド耐性**（ドキュメントの任意の位置の変更が高い確率で Key を変更）と**スループット**のバランスを取ります。

### プリアロケーションとオブジェクトプール化

抽出過程で最も頻繁にアロケートされるオブジェクトはすべてプール化またはプリアロケートされています：

| オブジェクト | メカニズム | 作用 |
|------|------|------|
| テキストビルダー（`TrackedBuilder`） | `sync.Pool` | 呼び出し間で基盤の `[]byte` 容量を再利用、毎回の抽出でゼロからドキュメント長まで成長するのを回避 |
| リンク結果スライス | 容量 128 をプリアロケート | 典型的なページのリンク数をカバー、`append` による基盤配列のコピーを回避 |
| 深度検証スタック（`depthStackEntry`） | `sync.Pool` | 反復式深度検証のスタック再利用、毎回の抽出でのスタックアロケーションを回避 |
| `[]byte` 一時バッファ | `sync.Pool` | エンコーディング変換、テキスト結合などの高頻度小バッファの再利用 |

:::warning 超大バッファはプールから破棄されます
「1 回の抽出で超大ドキュメント → プールが超大バッファを永久に保持 → 以降の小さなリクエストがすべて大きなバッファを受け取る」という古典的な `sync.Pool` の罠を防ぐため、容量が 64 KiB を超えるバッファは返却時にプールに戻されず**破棄**されます。超大ドキュメントの処理がプール化のメリットを得られないのは正常な動作です。
:::

### 事前計算されたフォーマット文字列

`New()` 時に `InlineImageFormat`/`InlineLinkFormat` は `normalizeInlineFormat`（小文字化 + trim + 空値を `"none"` に正規化）で事前計算されて Processor フィールドに格納されます。抽出のホットパスでは事前計算値を直接比較し、**毎回の抽出で `strings.ToLower` を実行するのを回避**します。

この最適化は単回の抽出では影響は微小ですが、上万のドキュメントをバッチ処理する際には累積で無視できない効果があります。

### メディア抽出の遅延アロケーション

動画/音声抽出は 2 段階のゲーティングを採用し、「メディアコンテンツなし」の一般的なシナリオをほぼゼロオーバーヘッドにします：

1. **前置正規表現ゲート**：まず `HasMediaReference` で高速スキャンし、コンテンツにメディア参照が**含まれない**ことを確認した場合、すべての正規表現スキャンと iframe/embed/object 属性抽出をスキップします。
2. **サイズゲート**：コンテンツが 1 MB（`maxHTMLForRegex`）を超える場合は正規表現スキャンをスキップします——超大ドキュメントでの正規表現実行は遅く、ReDoS リスクもあります。
3. **遅延初期化**：`ensureDedup` は最初のメディアマッチが出現した時点で結果スライスと重複排除 map をアロケートします。メディアのないドキュメントは全過程でゼロアロケーションです。

:::tip プレーンテキストシナリオの最適設定
本文テキストのみに関心があり、画像/動画/音声情報が不要な場合は、[`TextOnlyConfig()`](../../api-reference/core/config#预设配置) で全メディア保持を一括無効化し、ここで説明する遅延メカニズムと組み合わせることで、メディア関連のオーバーヘッドをほぼゼロにできます。
:::

## キャッシュの深掘りチューニング

[Processor 再利用とキャッシュ](./processor-cache) でキャッシュの基本用法とヒット率監視を紹介しました。ここではキャッシュ動作に影響するいくつかの重要な詳細を補足します。

### ヒット条件

2 つの入力が**同じキャッシュ Key** を生成した場合のみヒットします。つまり：

- 同じコンテンツ + 同じ設定 → ヒット
- 同じコンテンツのバイト列だが、異なるエンコーディングを宣言している場合（例：`charset=gbk` と `charset=utf-8` で同じ本文）→ **ヒット**（Key はエンコーディング変換後の UTF-8 テキストに基づいて計算）
- 同じコンテンツだが `PreserveImages` などのスイッチが異なる → **ヒットしない**（スイッチビットが Key 計算に参加）

### ヒット後のクローンコスト

毎回のキャッシュヒットは `cloneResult`（Images/Links/Videos/Audios スライスを含む `Result` 全体のディープコピー）を返します。これは**必須**です——キャッシュ内のエントリは並行読み取りされるため、ポインタを直接返して呼び出し元が結果を変更すると、エイリアス経由でキャッシュが汚染されるためです。

代償として、`Result` に大量のリンク/画像が含まれる場合、クローン自体に一定のオーバーヘッドがあります。「キャッシュヒット率が極めて高い + 単回の結果が大きい」シナリオ（例：同じリンク密集の大ドキュメントを繰り返し抽出）では、この部分のコストが顕在化する可能性があります。

### キャッシュを無効化するタイミング

`MaxCacheEntries = 0` の場合、`Extract` は**Key 生成を完全にスキップ**します（ハッシュ計算なし、ルックアップなし、書き込みなし）。これは「キャッシュが有効だが常に miss」ではなく、真のゼロオーバーヘッドです。

キャッシュの無効化は**大量の異なるコンテンツを一度だけ処理する**シナリオに適しています：

```go
package main

import (
    "fmt"

    "github.com/cybergodev/html"
)

func main() {
    // クローラーが海量の異なるページを処理：キャッシュを無効化してハッシュ計算とメモリ使用を省く
    cfg := html.DefaultConfig()
    cfg.MaxCacheEntries = 0 // ゼロオーバーヘッドでキャッシュレイヤー全体をスキップ
    cfg.CacheTTL = 0         // バックグラウンドクリーンアップ goroutine も同時に無効化
    cfg.CacheCleanup = 0

    p, err := html.New(cfg)
    if err != nil {
        panic(err)
    }
    defer p.Close()

    // eachPage は実際のスクレイピングストリームから来る、ほぼ重複しない
    result, err := p.Extract([]byte("<html><body>各ページはすべて異なる</body></html>"))
    if err != nil {
        panic(err)
    }
    fmt.Println("テキスト長：", len(result.Text))
    // 出力：テキスト長：...
}
```

### フォーマット変換はメインキャッシュを使用しない

`ExtractToMarkdown` / `ExtractToMarkdownFromFile` は内部で `buildFormatProcessor` を使って**キャッシュを無効化した一時 Processor**を作成し、フォーマット変換を実行します。つまり：

- Markdown 変換はメイン Processor のキャッシュから**読み取らず**、**書き込みもしません**——以前に `Extract` で同じコンテンツを抽出していても、`ExtractToMarkdown` はヒットしません
- 同じコンテンツで `ExtractToMarkdown` を複数回呼び出しても、相互にヒットしません

:::warning フォーマット変換でのキャッシュヒットを期待しないでください
同じコンテンツから繰り返し Markdown を取得したい場合、`ExtractToMarkdown` を複数回呼び出すより、`Extract` を（`InlineImageFormat`/`InlineLinkFormat` を `"markdown"` に設定して）1 回呼び出す方が良いでしょう——結果がメインキャッシュに入り、重複入力でヒットします。
:::

## タイムアウトと Goroutine 管理

`ProcessingTimeout` は協調的タイムアウトであり、強制キルではありません。その協調ポイントとエラーセマンティクスを理解することで、タイムアウトとユーザーキャンセルを正しく処理できます。

### 協調的キャンセルメカニズム

`ProcessingTimeout > 0` の場合、ライブラリは渡された context からデッドライン付きの子 context を派生し、処理関数は**重要なチェックポイント**で `ctx.Done()` をポーリングします：

- エンコーディング検出前
- DOM 解析前
- 深度検証前
- コンテンツ抽出前

デッドラインに到達した場合、処理は**次のチェックポイント**で中止されエラーを返します。つまりタイムアウトは瞬時に有効になるわけではなく——2 つのチェックポイント間の作業（超大ドキュメントの解析など）は完了するまで実行されます。

### タイムアウト goroutine のグローバル上限

タイムアウト付きの各抽出は完了またはタイムアウトまで 1 つの goroutine を占有します。goroutine リークによるリソース枯渇を防ぐため、ライブラリはグローバル上限 `maxTimeoutGoroutines = 1000` を設定しています。並行タイムアウト操作数が上限に達した場合、新しい抽出は（待機行列に入らず）**直ちに** `ErrProcessingTimeout` を返します。

:::warning バッチシナリオの並行上限
バッチ抽出（`ExtractBatch`）の並行は `WorkerPoolSize`（デフォルト 4、上限 256）で制限され、通常は 1000 の goroutine 上限よりはるかに低いです。ただし、アプリケーション層で独自に大量のタイムアウト付き `ExtractWithContext` を並行呼び出す場合、このグローバル上限に注意してください——プロセスレベルで、すべての Processor 間で共有されます。
:::

### 3 つのキャンセルソースの区別

アプリケーション層でタイムアウト/キャンセルを処理する際、エラー型に基づいてソースを区別すべきです：

| トリガー条件 | 戻りエラー | 意味 |
|----------|----------|------|
| ライブラリ内 `ProcessingTimeout` の期限切れ | `ErrProcessingTimeout` | 単一ドキュメントの処理が設定タイムアウトを超過 |
| ユーザー context の deadline 期限切れ | `context.DeadlineExceeded` | 外層 context のタイムアウト（ライブラリがそのまま透過） |
| ユーザーによる context の手動キャンセル | `context.Canceled` | 外層の能動的キャンセル（ライブラリがそのまま透過） |

```go
package main

import (
    "context"
    "errors"
    "fmt"
    "time"

    "github.com/cybergodev/html"
)

func main() {
    cfg := html.DefaultConfig()
    cfg.ProcessingTimeout = 5 * time.Second // ライブラリ内タイムアウト
    p, err := html.New(cfg)
    if err != nil {
        panic(err)
    }
    defer p.Close()

    // 外層 context でさらに一層の保険（ライブラリ内タイムアウトより短くても可）
    ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
    defer cancel()

    result, err := p.ExtractWithContext(ctx, []byte("<html></html>"))
    switch {
    case errors.Is(err, html.ErrProcessingTimeout):
        fmt.Println("ライブラリ内処理タイムアウト：ProcessingTimeout を大きくするか入力を小さくすることを検討")
    case errors.Is(err, context.DeadlineExceeded):
        fmt.Println("外層 context のタイムアウト")
    case errors.Is(err, context.Canceled):
        fmt.Println("呼び出し元の能動的キャンセル")
    case err != nil:
        fmt.Println("その他のエラー：", err)
    default:
        fmt.Println("成功、テキスト長：", len(result.Text))
    }
    // 出力：成功、テキスト長：...
}
```

## バッチ処理のパフォーマンスチューニング

[バッチ処理の実践](./batch-processing) でバッチ API の用法を詳しく紹介しました。ここではスループットに影響するいくつかのチューニングポイントに焦点を当てます。

### WorkerPoolSize の役割

`WorkerPoolSize` は **semaphore**（バッファ付き channel）で並行 goroutine 数を制限し、無制限のスポーンを行いません：

```text
ExtractBatch(items)
  → 各項目に extractor を作成
  → ループ：まず semaphore スロットを取得（満杯ならブロック）→ goroutine をスポーン
  → goroutine 完了後にスロットを解放
```

したがってバッチサイズがいくつであっても、**同時に実行中の抽出数**は `WorkerPoolSize` を超えません。デフォルト値 4 は I/O 混合シナリオに適しています。純 CPU 集約的な抽出では `runtime.NumCPU()` に近い値（上限 256）に設定できます。

```go
package main

import (
    "fmt"
    "runtime"

    "github.com/cybergodev/html"
)

func main() {
    cfg := html.DefaultConfig()
    // WorkerPoolSize の上限は 256、高コア数マシンではキャップが必要
    if n := runtime.NumCPU(); n > 256 {
        n = 256
    }
    cfg.WorkerPoolSize = n
    p, err := html.New(cfg)
    if err != nil {
        panic(err)
    }
    defer p.Close()

    pages := [][]byte{
        []byte("<html><body>ページ A</body></html>"),
        []byte("<html><body>ページ B</body></html>"),
    }
    br := p.ExtractBatch(pages)
    fmt.Printf("成功 %d、失敗 %d\n", br.Success, br.Failed)
    // 出力：成功 2、失敗 0
}
```

### バッチ上限とフォールトトレランス

| 制約 | 値 | 動作 |
|------|----|------|
| 1 バッチ最大項目数 | 10000 | 超過時に**バッチ全体が失敗**（各項目がエラーを返す）、部分処理なし |
| 項目ごとの panic 分離 | — | ある項目の抽出 panic は `recover` され、その項目のみ失敗としてマーク、他の項目には影響しない |

:::tip インスタンスバッチメソッドはキャッシュを再利用
`Processor` インスタンスのバッチメソッド（`p.ExtractBatch`）は内部で `p.Extract` を呼び出すため、**メインキャッシュを共有して書き込み**ます——バッチ処理中に重複コンテンツが出現すると、後続でキャッシュヒットします。パッケージレベル `html.ExtractBatch` はキャッシュ無効化のプール化インスタンスを使用するため、この効果はありません。バッチでの重複除去アクセラレーションが必要な場合は、インスタンスメソッドを優先してください。
:::

## 入力の制御

抽出の作業量を減らすのが最も直接的な最適化手段です：

- **`MaxInputSize` の制限**：過大なドキュメントを拒否し、無駄な解析オーバーヘッドを回避。デフォルト 50 MB、多くのシナリオで 5–10 MB に縮小可能
- **不要な抽出スイッチの無効化**：`PreserveImages`/`PreserveVideos`/`PreserveAudios` などを無効化し、メディア遅延メカニズムと組み合わせることで該当オーバーヘッドをスキップ
- **プレーンテキストに `TextOnlyConfig()` を使用**：全メディア保持がすでに無効化されている、さらに `ExtractArticle` を無効化することでプレーンテキスト抽出速度をさらに向上

```go
package main

import (
    "fmt"

    "github.com/cybergodev/html"
)

func main() {
    // TextOnlyConfig は全メディア保持を無効化済み、追加設定不要
    cfg := html.TextOnlyConfig()
    cfg.MaxInputSize = 10 * 1024 * 1024 // 10MB、過大な入力を拒否
    cfg.ExtractArticle = false           // 記事認識を無効化、プレーンテキスト抽出を高速化

    p, err := html.New(cfg)
    if err != nil {
        panic(err)
    }
    defer p.Close()

    result, err := p.Extract([]byte("<html><body><p>プレーンテキストのみ必要</p></body></html>"))
    if err != nil {
        panic(err)
    }
    fmt.Println(result.Text)
    // 出力：プレーンテキストのみ必要
}
```

## パフォーマンスのアンチパターン

以下はよくあるパフォーマンスを低下させる使用法です。対照表で素早く罠を回避できます：

| アンチパターン | 問題 | 正しいやり方 |
|--------|------|----------|
| ループ内で毎回 `html.New()` | 毎回 Processor を作成+破棄、エンコーディング検出器やスコアラーを再構築 | ループ外でインスタンスを 1 つ作成、ループ内で再利用 |
| パッケージ関数でキャッシュヒットを期待 | プール化 Processor はキャッシュが無効、永遠に miss | `Processor` インスタンスを使用 |
| 大量の異なるコンテンツなのに大キャッシュを有効化 | キャッシュが膨張、ヒット率が極めて低く、メモリとハッシュオーバーヘッドが無駄 | `MaxCacheEntries = 0` でキャッシュを無効化 |
| `ExtractToMarkdown` でメインキャッシュヒットを期待 | フォーマット変換はキャッシュ無効化の一時 Processor を使用 | `InlineImageFormat="markdown"` を設定して `Extract` を使用 |
| 超大 HTML にタイムアウトを設定しない | 悪意のある/不正な入力が長時間リソースを占有する可能性 | `ProcessingTimeout` を設定または `ExtractWithContext` を使用 |
| バッチ項目数が `WorkerPoolSize` を大幅に超えるのに線形加速を期待 | semaphore が実際の並行を制限、項目数を増やしても加速しない | CPU コア数に合わせて `WorkerPoolSize` を調整、バッチ分割して送信 |

## ベンチマークの推奨事項

Go benchmark で設定変更とキャッシュヒットの効果を定量化することは、パフォーマンスチューニングの最も信頼できる根拠です。

### 基本抽出ベンチマーク

<!-- check-code: skip -->
```go
package html_test

import (
    "os"
    "testing"

    "github.com/cybergodev/html"
)

// 代表的な実際の HTML を用意（極小の合成断片は使用しない）
var benchDoc, _ = os.ReadFile("testdata/sample.html")

// BenchmarkExtract は単回抽出のベースライン性能を測定（エンコーディング検出、解析、スコアリング、抽出を含む）
func BenchmarkExtract(b *testing.B) {
    p, _ := html.New(html.DefaultConfig())
    defer p.Close()

    b.ReportAllocs() // 重要：毎回の抽出のヒープアロケーション数を観察
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        _, err := p.Extract(benchDoc)
        if err != nil {
            b.Fatal(err)
        }
    }
}
```

### キャッシュヒットのメリットの測定

「同じコンテンツの繰り返し抽出」と「毎回異なるコンテンツ」を比較することで、キャッシュが本当に役立っているかを確認できます：

<!-- check-code: skip -->
```go
// BenchmarkExtractCacheHit は同じコンテンツを繰り返し抽出、2 回目以降はキャッシュヒットするはず
func BenchmarkExtractCacheHit(b *testing.B) {
    p, _ := html.New(html.DefaultConfig())
    defer p.Close()
    p.Extract(benchDoc) // キャッシュをウォームアップ

    b.ReportAllocs()
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        _, _ = p.Extract(benchDoc)
    }
}

// BenchmarkExtractNoCache はキャッシュ無効化を対照群とする
func BenchmarkExtractNoCache(b *testing.B) {
    cfg := html.DefaultConfig()
    cfg.MaxCacheEntries = 0
    p, _ := html.New(cfg)
    defer p.Close()

    b.ReportAllocs()
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        _, _ = p.Extract(benchDoc)
    }
}
```

### 異なる設定の比較

`b.Run` サブテストで 1 つのベンチマーク内で複数の設定を比較し、横断比較を容易にします：

<!-- check-code: skip -->
```go
func BenchmarkConfigs(b *testing.B) {
    cases := []struct {
        name string
        cfg  func() html.Config
    }{
        {"Default", html.DefaultConfig},
        {"TextOnly", html.TextOnlyConfig},
        {"NoCache", func() html.Config {
            c := html.DefaultConfig()
            c.MaxCacheEntries = 0
            return c
        }},
    }
    for _, tc := range cases {
        b.Run(tc.name, func(b *testing.B) {
            p, _ := html.New(tc.cfg())
            defer p.Close()
            b.ReportAllocs()
            b.ResetTimer()
            for i := 0; i < b.N; i++ {
                _, _ = p.Extract(benchDoc)
            }
        })
    }
}
```

:::tip ベンチマーク結果の読み方
- `ns/op`：単回抽出の所要時間、小さいほど高速
- `B/op` と `allocs/op`：毎回の抽出のヒープアロケーションバイト数と回数、「プール化が機能しているか」「キャッシュがヒットしているか」を判断する中核指標——キャッシュヒット時に `allocs/op` は顕著に低下
- `CacheHit` と `NoCache` の比較：両者が近い場合、コンテンツに**重複がない**ことを示し、キャッシュは純粋な負担であるため無効化すべき
:::

ベンチマークの実行：

```bash
go test -bench=. -benchmem ./...          # すべての benchmark を実行、メモリアロケーションを報告
go test -bench=BenchmarkExtract -count=5  # 複数回実行してばらつきを観察
```

## 次のステップ

- [Processor 再利用とキャッシュ](./processor-cache) —— `sync.Pool` メカニズムとキャッシュヒット率監視の詳細
- [バッチ処理の実践](./batch-processing) —— バッチ API の完全な用法と並行制御
- [設定リファレンス](../../api-reference/core/config) —— すべての `Config` フィールドと値の制約
- [セキュリティ生産チェックリスト](../security/production-checklist) —— パフォーマンス以外の本番準備のポイント
