---
sidebar_label: "よくある質問"
title: "よくある質問 - CyberGo html | 高頻度質問回答"
description: "CyberGo html よくある質問と回答：パッケージ関数と Processor の選択基準、エンコーディング検出の仕組み、入力サイズ制限、バッチ上限、空テキストの診断方法、統計監視と監査ログの活用など、高頻度の質問に答え、解決策を提示します。"
sidebar_position: 1
---

# よくある質問

## パッケージ関数と Processor の違いは？

**パッケージ関数**（例：`html.Extract`）は内部で `sync.Pool` を使用して Processor を再利用し、低頻度・一度きりの呼び出しに適しています。呼び出しごとに Processor をプールに返却します。

**Processor**（例：`p := html.New()`）は高頻度の呼び出しに適しており、キャッシュと内部リソースを再利用します。統計収集と監査ログもサポートしています。

```go
// 低頻度：パッケージ関数
result, _ := html.Extract(data)

// 高頻度：Processor
p, _ := html.New(html.DefaultConfig())
defer p.Close()
for _, page := range pages {
    p.Extract(page)
}
```

## エンコーディングの問題をどう処理しますか？

HTML ライブラリは 15+ 種類のエンコーディング（UTF-8、GBK、Shift_JIS、Windows-1252 など）を自動検出するため、通常は手動指定は不要です。

エンコーディングを強制指定する場合：

```go
cfg := html.DefaultConfig()
cfg.Encoding = "gbk"
```

## 入力サイズの上限は？

デフォルトは最大 50MB（`DefaultMaxInputSize = 52428800`）。設定で調整可能です：

```go
cfg.MaxInputSize = 10 * 1024 * 1024 // 10MB
```

## Markdown フォーマットの出力を取得するには？

```go
md, err := html.ExtractToMarkdown(data)
```

または Processor を使用：

```go
p, _ := html.New()
md, _ := p.ExtractToMarkdown(data)
```

## バッチ処理の最大件数は？

1 回のバッチで最大 10000 件です。それ以上のデータセットは分割して処理してください。

## 抽出されたテキストが空になるのはなぜ？

考えられる原因：

1. **HTML 構造の問題** - コンテンツが `<script>` または `<style>` タグの中にある
2. **サニタイズ後にコンテンツが空になる** - 本文がサニタイズで除去されるタグ (例：`<iframe>`、`<object>`) にしか存在しない場合、結果が空になることがあります。信頼できる入力であれば、一時的に `EnableSanitization = false` を設定して調査できます
3. **入力が空** - 入力バイト配列が空でないか確認してください (空白のコンテンツは空の `Result` を返します)
4. **記事検出** - `ExtractArticle` を無効にして抽出できるか試してください

:::tip エラーと空の結果の区別
DOM のネストが `MaxDepth` を超えると、空のテキストではなく `ErrMaxDepthExceeded` エラーを返します。呼び出しが `error` を返した場合、テキストが空かを確認するよりも `errors.Is` でエラー型を先に判定してください。
:::

```go
cfg := html.DefaultConfig()
cfg.ExtractArticle = false // 記事認識を無効化
```

## 処理統計をモニタリングするには？

```go
p, _ := html.New(html.DefaultConfig())
defer p.Close()

// いくつかコンテンツを処理した後
stats := p.GetStatistics()
fmt.Printf("処理済み：%d\n", stats.TotalProcessed)
fmt.Printf("キャッシュヒット：%d\n", stats.CacheHits)
fmt.Printf("平均処理時間: %v\n", stats.AverageProcessTime)
fmt.Printf("エラー数：%d\n", stats.ErrorCount)
```

## 監査を有効にするには？

```go
cfg := html.DefaultConfig()
cfg.Audit = html.DefaultAuditConfig()
cfg.Audit.Enabled = true
cfg.Audit.Sink = html.NewLoggerAuditSink()
```

詳細は [監査システム](../api-reference/modules/audit) を参照してください。

## ファイルパスは安全ですか？

`FileError` は完全なパスを自動的に切り詰め、エラーメッセージでのサーバーパス漏洩を防止します：

```go
var fileErr *html.FileError
if errors.As(err, &fileErr) {
    fmt.Println(fileErr.SafePath()) // ファイル名のみ、完全パスではない
}
```

## カスタムコンテンツスコアリングを実装するには？

`Scorer` インターフェースを実装します：

```go
type MyScorer struct{}

func (s *MyScorer) Score(node html.ContentNode) int {
    // カスタムスコアリングロジック
    return 0
}

func (s *MyScorer) ShouldRemove(node html.ContentNode) bool {
    // カスタム削除ロジック
    return false
}

cfg := html.DefaultConfig()
cfg.Scorer = &MyScorer{}
```

詳細は [インターフェース定義](../api-reference/types/interfaces) を参照してください。

## カスタム Scorer は並列安全にする必要がありますか？

必要です。単一の Processor が複数の並行 `Extract` 呼び出しで共有される場合、`Score`/`ShouldRemove` が複数の goroutine から同時にトリガーされます。カスタム Scorer が可変状態（キャッシュ、カウンター）を保持する場合、独自にロックして同期する必要があります。ライブラリ組み込みの `DefaultScorer` は読み取り専用で、自然的に並列安全です。

:::warning ステートレス優先
カスタム Scorer はステートレス（渡された `ContentNode` のみに基づいて計算）に設計することを推奨します。これによりロックのオーバーヘッドを回避し、並行性の問題を根本から排除できます。集計統計が必要な場合は、Scorer 自体ではなく `Processor` の統計チャネルに結果を書き戻してください。
:::

## キャッシュ Key はどのように生成されますか？

キャッシュ Key はエンコーディング変換後の UTF-8 コンテンツに基づき、xxHash スタイルのアルゴリズムで 128 ビット（16 バイト）のハッシュとして生成されます：

- 64KB 以下（`maxCacheKeySize`）：コンテンツ全体に対して計算
- 64KB 超：5 点サンプリング（先頭、末尾、3 つの均等分布点）を使用、総サンプリング予算 4096 バイト（`cacheKeySample`、各点約 819 バイト）、さらにコンテンツの総長さを混入して一意性を強化
- 同一の UTF-8 コンテンツは（元のエンコーディングが GBK、Shift_JIS、Windows-1252 のいずれでも）同じ Key を生成します

:::tip エンコーディング正規化のメリット
Key はエンコーディング検出と UTF-8 変換の**後**に計算されるため、同一ドキュメントが異なるバイトエンコーディングで保存されていても同じキャッシュエントリにヒットします。キャッシュヒット率は入力エンコーディングの影響を受けません。
:::

## なぜ ExtractAllLinks と Extract の結果が異なるのですか？

両者は異なる用途を想定しており、処理パスと戻り値の型も異なります：

- `Extract` はまず HTML サニタイズ（`<script>`、`<iframe>` などのタグを除去）を適用してから、サニタイズ後の DOM からリンクを抽出します。結果は `Result.Links` に格納され、型は `LinkInfo`（`Position`、`IsExternal` などのフィールドを含む）です
- `ExtractAllLinks` は**サニタイズを適用せず**、すべてのリソースリンク（`<script src>`、`<iframe>`、`<link>`、`<embed>` を含む）を列挙し、`[]LinkResource`（`Type` 分類：スクリプト、スタイル、メディアなどを含む）を返します

簡単に言うと：`Extract` は「本文中のリンク」を、`ExtractAllLinks` は「ページが参照するすべてのリソース」を返します。

## パッケージレベル関数に Config を渡すとプール化されますか？

されません。`resolveConfig` のロジックは以下の通りです：

- Config なし → `DefaultConfig()` を使用、**`sync.Pool` プール化を使用**
- Config 1 つ → その Config を使用、**一時 Processor を作成（プールを再利用しない）**

したがって `html.Extract(data, cfg)` は毎回新規に Processor を作成して破棄します。カスタム設定での高頻度呼び出しでは、`html.New(cfg)` で Processor を作成して再利用することで、キャッシュと統計のメリットを得られます。

## 内部 panic の影響は何ですか？

すべての抽出操作は `recoverPanic` でラップされており、panic は呼び出し元に伝播せず、`ErrInternalPanic` エラーとしてリカバリされます。分離粒度は以下の通りです：

- 単回抽出：panic → `ErrInternalPanic`
- バッチ処理：各項目の panic は独立して recover され、その項目のみに影響（`Failed` に記録）、他の項目には影響しません
- 監査サブシステム：`AuditSink` の `Write`/`Close` の panic は分離されます（監査は best-effort、SEC-003 参照）、主抽出フローを中断しません
- タイムアウト goroutine：その内部の panic も独立して recover されます

:::warning ErrInternalPanic が表示された場合の対応
`ErrInternalPanic` は、入力がライブラリ内部のバグをトリガーした可能性を示します。単純に再試行するのではなく、元の入力（または最小再現サンプル）を記録して報告してください。同じ入力で再びトリガーされる可能性が高いです。
:::

## メモリを節約するためにキャッシュを無効化するには？

<!-- check-code: skip -->
```go
cfg := html.DefaultConfig()
cfg.MaxCacheEntries = 0 // キャッシュを無効化、Key 生成をスキップ（ゼロオーバーヘッド）
```

無効化後は毎回の抽出が完全に処理されますが、キャッシュエントリによるメモリオーバーヘッドを回避できます。大量の異なるコンテンツを処理する場面（例：海量の異なるページを一度だけスクレイピング）に適しています。

:::tip プール化 Processor はデフォルトでキャッシュが無効
パッケージレベル関数（例：`html.Extract`）が使用するプール化 Processor は `MaxCacheEntries = 0`、`CacheTTL = 0` に設定されています。プールに返却されるたびにキャッシュがクリアされるため、キャッシュを有効にしてもハッシュと map 操作のオーバーヘッドが増えるだけです。キャッシュが必要な場合は明示的に `html.New(cfg)` を使用してください。
:::

## ProcessingTimeout とユーザー context のタイムアウトの違いは？

ライブラリ内のタイムアウトは呼び出し元の context と連携します。エラー型はトリガー源と設定に依存します：

| シナリオ | エラー型 | トリガー元 |
|------|----------|--------|
| `ProcessingTimeout` を設定し、それが先に期限切れ | `ErrProcessingTimeout` | ライブラリ内タイムアウト |
| ユーザー context が `ProcessingTimeout` より先に期限切れ | `ErrProcessingTimeout`（正規化される） | 呼び出し元のタイムアウト |
| `ProcessingTimeout` 未設定、ユーザー context が期限切れ | `context.DeadlineExceeded` | 呼び出し元のタイムアウト |
| ユーザー `cancel()` | `context.Canceled` | 手動キャンセル |

メカニズム：`ProcessingTimeout > 0` の場合、ライブラリは `context.WithTimeout(parentCtx, ProcessingTimeout)` で新しいデッドラインを派生し、**両者の早い方**を採用します。どちらが期限切れになっても、統一して `ErrProcessingTimeout` を報告します。手動 `cancel()` による `context.Canceled` のみがそのまま返されます。`ProcessingTimeout` が未設定の場合、ユーザー context のエラーがそのまま透過されます。

## ExtractToMarkdown はキャッシュを使用しますか？

使用しません。`ExtractToMarkdown` は内部で `buildFormatProcessor` を使って一時 Processor を作成し、その Processor は明示的にキャッシュを無効化しています（`MaxCacheEntries = 0` + `NewCache(0, 0)`）。メイン Processor のキャッシュへの読み書きを行いません。

:::tip なぜこの設計なのか
Markdown フォーマット変換は出力形式が異なるだけで、抽出自体の結果がメインキャッシュを汚染すべきではありません（そうしないと、同じコンテンツがフォーマットの違いによって複数キャッシュされてしまいます）。一時 Processor はメイン Processor の `Scorer` を再利用し、`InlineImageFormat`/`InlineLinkFormat` のみを上書きします。設定は値コピーで分離され、共有状態の並行変更を回避します。
:::

## なぜ `<form>` タグがサニタイズで除去されないのですか？

多くのサーバーサイドフレームワーク（ASP.NET WebForms、JSF、JSP）はページ全体の `<body>` を単一の `<form>` で囲みます。`<form>` を除去すると、表示可能なコンテンツのほぼすべてが失われます。テキスト抽出はフォームをレンダリングも送信もしないため、`<form>` を除去する CSRF/UI-redress の根拠は**コンテナ自体には適用されません**。ただし、`<input>` や `<button>` などのフォームコントロールは引き続き除去されます。

## data URL にどのような制限がありますか？

サニタイザは `data:` URL に対して多段階の検証を実行します：

- ホワイトリストの MIME タイプのみ許可：画像（gif/jpeg/png/webp/bmp/avif など）、フォント（woff/woff2/ttf/otf）、PDF
- **`image/svg+xml` をブロック**（SVG は JavaScript を埋め込める）
- 空のメディアタイプをブロック（例：`data:;base64,...`）
- サイズ上限 `MaxDataURILength`（100KB）
- base64 エンコード部分の文字の正当性を検証

ブロックされた URL は `AuditRecorder` で原因（例：`malformed data URL`、`unsafe media type`）とともに記録されます。

## バッチ処理で 10000 項目を超えるとどうなりますか？

バッチ全体が失敗します（部分処理されません）。`maxBatchSize` の上限は 10000 で、超過時は各項目の `Errors` に `html: batch size N exceeds maximum 10000` が格納され、`Failed` カウントが入力数と等しくなり、`Results` はすべて `nil` になります。

<!-- check-code: skip -->
```go
// 超過時に返される BatchResult：Failed == len(inputs)、部分的な成功なし
br := html.ExtractBatch(hugeSlice) // len(hugeSlice) > 10000
fmt.Println(br.Failed)             // == len(hugeSlice)
```

呼び出し元が独自にバッチを分割（例：1 バッチ 5000 項目）してより大きなデータセットを処理する必要があります。

## Processor をクローズした後に呼び出し続けるとどうなりますか？

`ErrProcessorClosed` を返します。Processor は内部で `atomic.Bool` を使用してクローズ状態をマークし、すべての抽出/フォーマットメソッドの入口でこれをチェックします。動作のポイント：

- `Close()` は冪等で、複数回の呼び出しも安全です
- プール化 Processor はクローズ後**プールに返却されません**（次回の `Get` でクローズ済み・キャッシュクリーンアップ goroutine が停止したインスタンスを取得するのを回避）。代わりに破棄され、次回 `Get` 時に `sync.Pool` が再構築します
- クローズされた Processor でバッチメソッドを呼び出すと、返される `BatchResult` の各項目のエラーはすべて `ErrProcessorClosed` になります

## 記事スマート認識（ExtractArticle）のスコアリングアルゴリズムはどうなっていますか？

デフォルトスコアラー（`DefaultScorer`）は多次元シグナルに基づいて各要素ノードのコンテンツ関連性スコアを計算し、最もスコアの高いノードを記事コンテナとして選択します。スコアリングの次元：

| 次元 | 正のシグナル | 負のシグナル |
|------|----------|----------|
| タグセマンティクス | `<article>`(+1000)、`<main>`(+900)、`<section>`(+300) | `nav`/`aside`/`footer`/`header` は直接 0 を返す |
| class/id パターン | `content`/`article`/`post`/`main`/`entry`（強い正）；`blog`/`news`/`detail`（中程度の正） | `comment`/`sidebar`/`nav`/`ad`/`menu`（強い負）；`widget`/`share`/`social`（中程度の負） |
| 段落密度 | サブツリー内の `<p>` 数 × 倍率で加点 | — |
| テキスト長 | 閾値を超える長いテキストで加点；閾値未満の短いテキストで減点 | — |
| リンク密度 | — | テキストが短くリンクが密集している場合にペナルティ（ナビゲーションバーの可能性） |
| 句読点特徴 | カンマ密集（`,` または `，`）は散文体を示唆し、加点 | — |
| コンテンツ密度 | テキスト/タグ比が高い場合に増幅係数を乗算 | 比が低い場合に減衰係数を乗算 |
| ARIA role | `role="main"`/`role="article"`(+500) | `role="navigation"`/`role="complementary"`(-400) |

:::tip レイアウトラッパーの特別扱い
class/id がコンテンツシグナル（`content`/`article`）と削除シグナル（`sidebar` など）を同時に含む場合——典型的なのが CSS レイアウトクラス `content-sidebar`——スコアラーはそのノードを**削除しません**。メインコンテンツを内包しているためです。セマンティックタグ `<article>`/`<main>` は class/id 削除ヒューリスティックから一律に除外されます。
:::

デフォルトスコアラーがターゲットウェブサイトに適さない場合は、カスタム `Scorer` インターフェースを実装して置き換えられます。詳細は [テストとカスタム拡張](../guides/integration/testing-custom) を参照してください。

## TableFormat はテーブル出力にどのような影響を与えますか？

`TableFormat` は抽出されたプレーンテキスト/Markdown 中の HTML `<table>` のレンダリング方法を制御します：

| フォーマット値 | 効果 | 適用シナリオ |
|--------|------|----------|
| `"markdown"`（デフォルト） | Markdown テーブルとしてレンダリング（ヘッダー区切り行を含む）、`colspan` は繰り返しセルに展開、幅定義のみの構造行はスキップ | 人間の閲覧、Markdown 消費 |
| `"html"` | 元の HTML `<table>` タグを保持（`colspan`/`rowspan` はそのまま保持）、構造行はスキップしない | 正確なテーブル構造が必要な下流処理 |

```go
cfg := html.DefaultConfig()
cfg.TableFormat = "html" // HTML テーブルを保持
```

フォーマット文字列は大文字小文字を区別しません（`"Markdown"` と `"markdown"` は同等）。空の値は `"markdown"` にフォールバックします。

## AllowedBaseDir は異なるプラットフォームで一貫した動作をしますか？

はい、コアのセキュリティセマンティクスはクロスプラットフォームで一貫していますが、基盤のパス解決メカニズムが異なります：

| プラットフォーム | 解決方法 | カバーするリダイレクト |
|------|----------|-------------|
| Linux | `/proc/self/fd/<fd>` の link を読み取り | シンボリックリンク（race-free） |
| macOS / BSD | `/dev/fd/<fd>` の link を読み取り | シンボリックリンク（race-free） |
| その他 Unix | `filepath.EvalSymlinks` にフォールバック | シンボリックリンク（わずかな TOCTOU 残存） |
| Windows | `GetFinalPathNameByHandleW` | シンボリックリンク + junction + すべての reparse points |

重要な設計：ライブラリは**開かれた OS ファイルハンドル**から実際のパスを解決し（パス文字列ではなく）、TOCTOU 競合ウィンドウを閉じています——検証と読み取りは同一のファイルハンドルを使用するため、その間にパスが置き換えられても結果に影響しません。Windows 上の junction/reparse points は特権なしで作成可能で、`filepath.EvalSymlinks` では解決できないため、ライブラリは専用に `GetFinalPathNameByHandleW` を使用しています。

## キャッシュヒット時に返されるのは元のオブジェクトですか？

いいえ。キャッシュヒット時は `cloneResult` が生成した**ディープコピー**を返します——`Images`/`Links`/`Videos`/`Audios` スライスはすべて `copy` されます。これは必須です：キャッシュ内のエントリは複数の goroutine から並行読み取りされるため、ポインタをそのまま返すと呼び出し側が結果を変更した際にエイリアス経由でキャッシュが汚染されます。

ミス経路も同様に、まずキャッシュへ書き込んでからクローンを返すため、キャッシュエントリと戻り値はエイリアスしません。

## なぜ同じ動画 URL が Videos と Audios の両方に現れるのですか？

`.ogg` はコンテナフォーマットで、動画（Theora エンコード）または音声（Vorbis/Opus エンコード）を格納できます。正規表現フォールバックスキャン時、`.ogg` URL は動画と音声の拡張子リストの両方にマッチするため、`Result.Videos` と `Result.Audios` の両方に現れます。音声専用の派生拡張子 `.oga` は音声リストにのみ現れます。

## ProcessingTimeout を 0 にするのと設定しないのの違いは？

違いはありません。`Config` のゼロ値はそのままでは使用できず（`DefaultConfig()` から開始する必要があります）、`DefaultConfig()` は `ProcessingTimeout` を 30 秒に設定します。手動で `0` に設定するのは「時間無制限」と等価です——`Extract` はタイムアウト goroutine を起動せず、`maxTimeoutGoroutines` の枠も消費しません。これは既知の正当な大規模ドキュメントを処理する際、不要な goroutine オーバーヘッドを回避できます。

## `Extract` と `ExtractAllLinks` は併用できますか？

はい、独立して動作します：

- `Extract` は `*Result` を返し、`Result.Links` は**サニタイズ後** DOM 内の `<a>` リンク（`LinkInfo` 型、`Position`/`IsExternal` などのフィールドを含む）です
- `ExtractAllLinks` は `[]LinkResource` を返し、**サニタイズ前** HTML 内のすべてのリソースリンク（`<script src>`、`<iframe>`、`<link>` などを含む）を列挙し、`Type` 分類を含みます

両者は前後して呼び出しても互いに影響しません。典型的なシナリオ：まず `Extract` で本文コンテンツを抽出し、その後 `ExtractAllLinks` でページが参照するすべてのリソースを収集します。
