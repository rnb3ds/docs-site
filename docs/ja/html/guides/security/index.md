---
sidebar_label: "セキュリティ概要"
title: "セキュリティ概要 - CyberGo html | セキュリティ防護総覧"
description: "CyberGo html セキュリティ機能の概要：入力サイズ制限、DOM 深度制限、パストラバーサル防御、パニックリカバリ、処理タイムアウト、コンテンツサニタイズクリーニング、プラグイン監査パイプラインによる縦深防御アーキテクチャを網羅します。"
sidebar_position: 1
---

# セキュリティ概要

HTML ライブラリはインターネットからの信頼できない入力を処理するため、設計上セキュリティを最優先としています。ライブラリは複数層の独立した防護メカニズムを内蔵し、**縦深防御**の理念に従います：各層は他の層が失敗する可能性を前提とし、単一層の迂回が全体の陥落につながりません。

本ページはセキュリティ機能の総覧です。監査パイプラインの設定や本番チェックリストの確認をすぐに行いたい場合は、末尾の[次のステップ](#次のステップ)にジャンプしてください。

## 縦深防御アーキテクチャ

ライブラリのセキュリティ防護は 3 つの独立した階層に分散しており、各層に独自の失敗モードとリカバリ戦略があります：

```text
入力層防護（フィルタ前に拒否）
├── MaxInputSize        バイトレベルのサイズ上限（デフォルト 50MB）
├── MaxDepth            DOM ネスト深度上限（デフォルト 500、スタックオーバーフロー防止）
├── ProcessingTimeout   単一ドキュメント処理タイムアウト（デフォルト 30s）
├── パストラバーサル検出    ファイルパスの .. コンポーネント
└── AllowedBaseDir      ファイル読み取りサンドボックス（OS ハンドル解決、symlink/junction 防止）

処理層防護（サニタイズとキャンセル）
├── HTML サニタイズ      タグ / 属性 / URL / CSS の多角的フィルタリング
├── 協調的 context キャンセル  ExtractWithContext が ctx.Done() に応答
├── Panic リカバリ       recoverPanic ジェネリックラップ、ErrInternalPanic を返す
└── Goroutine リーク防護   maxTimeoutGoroutines（上限 1000）

監査層防護（可観測性 + 分離）
├── AuditSink panic 分離 SEC-003（監査サブシステムは best-effort）
├── 8 種の監査イベント      blocked_tag/blocked_attr/blocked_url/...
└── 原始値の HTML エスケープ   監査ログが SIEM ダッシュボードで XSS をトリガーするのを防止
```

:::tip なぜ「独立」を強調するのか
縦深防御の価値は階層間に結合の仮定がないことにあります。例えば、サニタイズ層が悪意のある URL を見逃しても（処理層の失敗）、入力層の `MaxInputSize` が超長ペイロードをブロックします。AuditSink 自身が panic しても（監査層の失敗）、`recoverPanic` が主フローがクラッシュしないことを保証します。
:::

## 入力境界防護

### 入力サイズ制限

デフォルトの最大入力は 50MB（`DefaultMaxInputSize`）で、メモリ枯渇攻撃を防止します。設定上限は同時に `maxConfigInputSize` で拘束され（同じく 50MB）、設定で安全でない値に拡大することはできません：

```go
cfg := html.DefaultConfig()
cfg.MaxInputSize = 10 * 1024 * 1024 // 10MB に厳格化
```

ファイルパスにはさらに**予備チェック**があります：`Stat` でサイズを取得した後、`ReadAll` でコンテンツをメモリにロードする前に超過ファイルを拒否し、「読み切ってから超過に気づく」メモリピークの窓を閉じます。

### DOM 深度制限

デフォルトの最大深度は 500（`DefaultMaxDepth`）で、再帰ネストで構成されたスタックオーバーフロー爆弾を防止します：

```go
cfg.MaxDepth = 200 // より厳格に
```

深度検証は再帰ではなく**反復式**トラバーサルを採用しており、入力のネストが深すぎてもスタックオーバーフローしません。

### 処理タイムアウト

設定可能な処理タイムアウトで、悪意のある HTML が指数関数的処理時間を引き起こすのを防止します：

```go
cfg.ProcessingTimeout = 10 * time.Second
```

タイムアウトメカニズムは独立 goroutine + context deadline で実装され、`maxTimeoutGoroutines`（1000）上限で保護され、高並行下での goroutine 暴走を防止します。`ExtractWithContext` と組み合わせることで呼び出し元のキャンセル信号を重ね合わせできます。

## コンテンツサニタイズメカニズムの詳細

サニタイズ機能は `EnableSanitization`（デフォルト `true`）で制御され、解析済み DOM ツリーに対してインプレース修正を行い、潜在的に悪意のあるコンテンツを除去します。全体のフローは `internal/sanitize.go` で実装され、各ステップのブロックは監査ログに書き込まれます。

:::warning いつサニタイズを無効化するか
入力が**完全に信頼できる**内部データの場合のみ `EnableSanitization = false` を検討してください。ユーザーアップロード、ウェブスクレイピング、サードパーティ API からの HTML を処理する場合は常に有効にすべきです。
:::

### 除去されるタグ

以下のタグは子ツリーとともに全体が除去されます：

| タグ | 除去理由 |
|------|----------|
| `<script>`、`<style>`、`<noscript>` | スクリプトとスタイルのコンテナ、実行可能コードや隠されたペイロード |
| `<iframe>`、`<embed>`、`<object>` | 外部コンテンツの埋め込み、古典的な XSS とフィッシングのベクタ |
| `<input>`、`<button>` | フォームコントロール、CSRF や UI 偽装に使用可能 |
| `<svg>` | JavaScript とイベントハンドラを埋め込み可能 |
| `<math>` | MathML、一部のブラウザでスクリプト実行に悪用可能 |

:::tip なぜ `<form>` が除去されないのか
`<form>` タグは**意図的に保持**されます。ASP.NET WebForms、JSF、JSP などのサーバーサイドフレームワークはページ全体の `<body>` を単一の `<form>` で囲みます。`<form>` を除去するとページの表示可能なコンテンツがすべて失われます。テキスト抽出シナリオではフォームをレンダリングも送信もしないため、`<input>`/`<button>` に適用される CSRF/UI 偽装の根拠は `<form>` コンテナ自体には適用されません。
:::

### 除去される属性

| 属性カテゴリ | 検出方法 | 例 |
|----------|----------|------|
| イベントハンドラ | プレフィックスマッチ `on*` | `onclick`、`onerror`、`onmouseover` |
| フォーム action オーバーライド | 完全一致 | `formaction`（フォーム送信先をハイジャック可能） |
| オートフォーカス | 完全一致 | `autofocus`（フィッシングでクリック誘導に使用可能） |

イベントハンドラの検出はプレフィックスマッチング（属性名が `on` で始まる）を採用しているため、固定ブラックリストに依存せず、現在および将来のすべての `on*` バリアントをカバーします。

### CSS の危険パターン

`style` 属性の値は以下の危険な部分文字列を検出し、ヒットすると**style 全体が剥離**されます（安全な CSS 属性をメタデータ抽出のために保持するには別途評価が必要、現在の戦略は危険検出時に全体を破棄）：

- `expression(` —— 旧版 IE の動的式
- `behavior:` —— IE ビヘイビアバインディング
- `-moz-binding:` —— 旧版 Firefox の XBL バインディング
- `javascript:` —— プロトコルインジェクション
- `vbscript:` —— プロトコルインジェクション

### 検査される URI 属性

以下の属性の値は [URL セキュリティ防護の深さ](#url-セキュリティ防護の深さ) パイプラインに入り、プロトコルと data URL の検証を行います：

```text
href  src  cite  action  data  poster  background
longdesc  usemap  profile  xlink:href
```

:::tip 完全ブロックされた属性は重複検査されません
`formaction` は「除去される属性」で既に全体ブロックされているため、URI 検証パイプラインに入りません——同じ属性に対する冗長な検査を回避します。
:::

## URL セキュリティ防護の深さ

URI 属性の値は `isSafeURIWithAudit` の多層パイプラインで検証されます。各層は既知のブラウザ解析動作や攻撃バイパス手法に対応し、欠かせないものです。

### 多層検証パイプライン

```text
原始 URI
  │
  ├─ 1. NFC 正規化           全角/結合文字を正規化
  ├─ 2. TrimSpace            前後の空白を削除
  ├─ 3. C0 制御文字+スペースの剥離   前後の U+0000–U+001F およびスペースを削除
  ├─ 4. tab/LF/CR の剥離       URL 内部の \t \n \r を削除
  ├─ 5. ToLower              大小文字を正規化
  ├─ 6. 長さ上限             data URL 以外は MaxURLLength(2000) で拘束
  ├─ 7. 危険プロトコル検出       javascript: / vbscript: / file: + 全角変形
  ├─ 8. プロトコル相対 URL 検出  //javascript: など
  └─ 9. data URL ホワイトリスト   画像/フォント/PDF のみ、svg と空 MIME をブロック
```

### Unicode 正規化（NFC）

最初のステップで URI に NFC 正規化（`normalizeURIForSecurity`）を行い、Unicode 変形で危険なプロトコルを偽装するのを防止します：

- 全角文字 `ｊａｖａｓｃｒｉｐｔ：` を ASCII にマップ
- 結合文字、異スクリプト類似文字を単一表現に正規化

これに加え、`isDangerousScheme` は全角ラテン文字（U+FF01–U+FF5E）に対して専用の ASCII 折り畳み（`normalizeFullwidthToASCII`）を行い、二重の保険としています——一部のブラウザ/パーサーが全角形式を ASCII として扱う場合でも、ライブラリは識別できます。

### 空白と制御文字の剥離

ブラウザは URL を解析する際に特定の制御文字を剥離します（WHATWG URL 標準に準拠）。ライブラリはプロトコル検出の**前**に同様の剥離をシミュレートする必要があります。そうしないと、攻撃者はこれらの文字を使って危険なプロトコル名を分割し、検出をバイパスできます：

- **tab / LF / CR**：`java\tscript:` はブラウザによって再結合されて `javascript:` として実行されます。ライブラリは `stripURLWhitespace` でプロトコル検出前にこの 3 バイトを削除します。
- **C0 制御文字（U+0000–U+001F）+ ASCII スペース**：ブラウザは scheme 解析前に前後のこれらのバイトを剥離します。`strings.TrimSpace` は Unicode 空白のみをカバーし、大部分の C0 制御文字をカバーしないため、ライブラリは専用の `c0ControlOrSpace` セットで明示的に剥離します。さもなくば `\x01javascript:…` がすべての `HasPrefix` 検出を騙せます。

### 危険プロトコル検出

| プロトコル | ブロック方法 |
|------|----------|
| `javascript:` | 直接マッチ + 全角文字正規化 |
| `vbscript:` | 同上 |
| `file:` | 同上（ローカルファイルシステムへのアクセス） |
| `//javascript:`、`//vbscript:`、`//data:`、`//file:` | プロトコル相対形式を個別検出 |

プロトコル相対形式（`//` で始まる）の検出は、まず `//` の後の先行空白を剥離してから、同様の危険プロトコル判定を適用し、`// javascript:` のようなバリアントがバイパスできないようにします。

### data URL ホワイトリスト

data URL は以下の明示的に宣言された MIME タイプのみ許可されます：

| カテゴリ | 許可される MIME タイプ |
|------|------------------|
| 画像 | `image/gif`、`image/jpeg`、`image/jpg`、`image/png`、`image/webp`、`image/bmp`、`image/x-icon`、`image/vnd.microsoft.icon`、`image/avif`、`image/apng` |
| フォント | `font/woff`、`font/woff2`、`font/ttf`、`font/otf`、`application/font-woff`、`application/font-woff2` |
| ドキュメント | `application/pdf` |

明示的なブロック：

- **`image/svg+xml`**：SVG は JavaScript を埋め込めるため、タグ除去後の縦深防御パッチとしてブロック
- **空のメディアタイプ**：例：`data:;base64,<payload>` や `data:;,...`。これらの形式はかつてホワイトリストをバイパスできたが、現在は直接拒否
- **超長 data URL**：`MaxDataURILength`（100KB）で拘束、base64 の大塊コンテンツによるメモリ枯渇を防止
- **不正な base64 文字**：base64 部分はバイトごとに文字セットの正当性を検証

:::tip 監査ログは data URL を切り詰めます
data URL は大段の base64 を含む可能性があり、監査ログに完全に書き込むとスペースの無駄遣いであり、埋め込まれた機密コンテンツの漏洩につながる可能性があります。監査レコードは `truncateAuditURL` で 256 文字に切り詰められます。
:::

### サニタイザをバイパスするパス

一部のコードパス（`ExtractAllLinks`、原始 HTML 内の video/audio スキャンなど）は**未サニタイズ**の HTML を読み取ります。これらのパスは `containsDangerousScheme` ガードで保護されています——サニタイザと完全に同じ正規化パイプライン（NFC、trim、C0 剥離、tab/LF/CR 剥離、全角折り畳み）を再利用し、2 つのパスが**同一のプロトコルポリシー**を実行することを保証します。サニタイザがブロックし、ここでは通過させるという不整合は生じません。

例えば `javascript:alert(1).mp4` のようなメディア URL を偽装したペイロードは、先頭文字 `j` が字母のためかつては簡易検証を通過できましたが、現在は `containsDangerousScheme` でブロックされます。

## AllowedBaseDir サンドボックスメカニズム

`ExtractFromFile` で信頼できないソースからのファイルパスを処理する際、`AllowedBaseDir` が読み取り可能範囲を指定ディレクトリ内に制限します。このメカニズムは `processor.go` の `readContained` / `realPath` / `pathWithin` で実装されています。

### なぜ OS ファイルハンドル解決が必要なのか

通常の `filepath.EvalSymlinks` は Windows のディレクトリ junction と reparse points を解決**できません**——そしてこれらは特権なしで作成可能であり、Windows でパス制限をバイパスする主要な手段です。ライブラリのアプローチは以下の通りです：

1. `os.Open()` でターゲットファイルを開き、OS ファイルハンドルを取得
2. `realPath(f)` が**開かれたハンドル**から実際のディスクパスを解決
3. `pathWithin(realBase, realTarget)` が実際のパスが許可ディレクトリ内にあるかを判定
4. **同じ検証済みハンドル**から `io.ReadAll` でコンテンツを読み取り

同じハンドルから検証と読み取りを行うことで、TOCTOU（check-time-to-use-time）競合ウィンドウを閉じます——検証後に読み取り前にパスがシンボリックリンクに置き換えられても結果に影響しません。読み取るのは当時検証した inode だからです。

### クロスプラットフォームの実際のパス解決

| プラットフォーム | 解決方法 | カバーするリダイレクトの種類 |
|------|----------|------------------|
| Linux | `/proc/self/fd/<fd>` の link を読み取り | シンボリックリンク（race-free） |
| macOS / BSD | `/dev/fd/<fd>` の link を読み取り | シンボリックリンク（race-free） |
| その他 Unix | `filepath.EvalSymlinks` にフォールバック | シンボリックリンク（わずかな TOCTOU 残存） |
| Windows | `GetFinalPathNameByHandleW` | シンボリックリンク + junction + すべての reparse points |

Windows パスは返却後に `\\?\` 拡張長プレフィックスを剥離して `Clean` を行い、`filepath.Abs` の出力形式と一致させ、以降の包含判定の正確性を確保します。

### 防護階層

`AllowedBaseDir` モードでのファイル読み取りには 4 つの独立したチェックが重ね合わされます：

1. **パストラバーサル検出**：`filepath.Clean` 後に `..` コンポーネントが含まれるかチェック
2. **OS ハンドルサンドボックス**：`realPath` が実際のパスを解決、`pathWithin` が包含関係を判定
3. **サイズ予備チェック**：検証済みハンドルで `Stat` によりサイズをチェック、`MaxInputSize` を超えるものを `ReadAll` 前に拒否
4. **バイトレベル上限**：読み取り後も `validateInput` でバイト数を再チェック

ファイルが許可ディレクトリ内にあっても、`AllowedBaseDir` が拘束するのは「どのファイルを読めるか」、`MaxInputSize` が拘束するのは「ファイルがどれくらい大きいか」であり、両者は直交し、互いに代わらない関係です。

:::warning AllowedBaseDir が空 = サンドボックス無効
`AllowedBaseDir` のデフォルトは空文字列で、**ディレクトリ制限なし**（`..` トラバーサル検出のみ保持）を意味します。ファイルパスがユーザー入力に由来する場合は、必ず明示的に設定してください。
:::

### 設定例

```go
cfg := html.DefaultConfig()
// /var/app/uploads とそのサブディレクトリ内のファイルのみ読み取りを許可
cfg.AllowedBaseDir = "/var/app/uploads"

p, err := html.New(cfg)
if err != nil {
    log.Fatal(err)
}
defer p.Close()

// 正常：ファイルは許可ディレクトリ内
result, err := p.ExtractFromFile("/var/app/uploads/page.html")

// 拒否：symlink/junction 経由で外部を指す
_, err = p.ExtractFromFile("/var/app/uploads/escape.txt") // これが junction → /etc の場合
```

拒否された範囲外アクセスは `AuditEventPathTraversal` 監査イベントとして記録され、「path outside allowed directory」をラップした `*FileError` を返します。エラーには解決された実際のパスは**含まれません**（ファイルシステム構成の漏洩を防止）。

## パニックリカバリと分離

すべての公開抽出メソッドは `recoverPanic[T]` ジェネリック関数でラップされています。panic はキャプチャされて `ErrInternalPanic` エラーに変換されて返され、悪意のある入力が呼び出し元プロセスをクラッシュさせないことを保証します。

```go
func recoverPanic[T any](fn func() (T, error)) (result T, err error) {
    defer func() {
        if r := recover(); r != nil {
            err = fmt.Errorf("%w: %v", ErrInternalPanic, r)
        }
    }()
    return fn()
}
```

### 多層分離境界

| 分離境界 | 動作 | 位置 |
|----------|------|------|
| 単回抽出 | panic → `ErrInternalPanic` | `extract.go` `recoverPanic` |
| バッチ抽出の各項目 | 各項目が独立して recover、1 項目の panic が他項目に影響しない | `batch.go` |
| タイムアウト goroutine | `withTimeout` の worker goroutine が独立して recover | `extract.go` |
| AuditSink 書き込み | sink 自身の panic は飲み込まれる（SEC-003） | `audit.go` `Record` |
| AuditSink クローズ | sink.Close の panic は `ErrInternalPanic` に変換されて error で返される | `audit.go` `Close` |
| プール化 Processor 作成 | `sync.Pool.New` の panic → `ErrInternalPanic` | `processor_pool.go` |

### SEC-003：監査サブシステムは best-effort

監査サブシステムは panic を公開 API 呼び出し元に伝播させては**なりません**。ユーザーが渡した `AuditSink`（手作りの可能性、フィルタ/マルチファンアウトでラップされている可能性）の `Write()` は任意のパスで panic する可能性があります。`Record` は `defer recover()` でこの種の panic を飲み込みます（リカバリ値は破棄——監査パス自体には安全な上报チャネルがないため）。`Close` は error 戻り値があるため、リカバリ値を `ErrInternalPanic` に包んで返します。

つまり、カスタム Sink にバグがあっても、`defer processor.Close()` の慣用句がプロセスを爆破することはありません。

### Goroutine リーク防護

`withTimeout` の毎回の呼び出しで worker goroutine を起動してデッドラインを待機します。高並行下での goroutine 暴走を防ぐため、グローバルカウンター `activeTimeoutGoroutines` が並行上限を `maxTimeoutGoroutines`（1000）に制限します。超過時は新規リクエストが直接 `ErrProcessingTimeout` を返し、goroutine が無限に積み上がるのを防ぎます（各 goroutine 約 1MB スタックで試算、1000 ≈ 1GB 上限）。

### 監査原始値のログインジェクション防護

`AuditConfig.IncludeRawValues = true` の場合、監査エントリにブロックされた属性/URL の原始値が付加されます。これらの値は `sanitizeRawValue` で HTML エスケープ（`&` `<` `>` `"` `'`）され、監査ログがブラウザや SIEM ダッシュボードにレンダリングされる際の保存型 XSS トリガーを防止します。

## 監査システム

セキュリティイベントは監査システムを通じて記録され、8 種のイベントタイプ、複数の組み込み Sink、レベルフィルタリングをサポートします。完全な設定は[監査システムの実践](./audit-pipeline)を参照してください。

| イベント | 説明 |
|------|------|
| `AuditEventBlockedTag` | ブロックされた HTML タグ |
| `AuditEventBlockedAttr` | ブロックされた属性 |
| `AuditEventBlockedURL` | ブロックされた URL |
| `AuditEventInputViolation` | 入力サイズ違反 |
| `AuditEventDepthViolation` | DOM 深度違反 |
| `AuditEventPathTraversal` | パストラバーサルの試行（AllowedBaseDir の範囲外アクセスを含む） |
| `AuditEventTimeout` | 処理タイムアウト |
| `AuditEventEncodingIssue` | エンコーディング異常 |

## セキュリティ設定の意思決定表

| シナリオ | 推奨設定 | 説明 |
|------|----------|------|
| 完全に信頼できる内部データ | `DefaultConfig()` + オプションで `EnableSanitization = false` | パフォーマンス優先；外部入力がないと確認した場合のみサニタイズを無効化 |
| ユーザーアップロード HTML | `HighSecurityConfig()` | 全面防護：制限を厳格化 + 完全な監査 |
| 外部ウェブページの処理 | `DefaultConfig()` | デフォルトのサニタイズが一般的な脅威をカバー |
| ユーザー提供のファイルパスの処理 | `AllowedBaseDir` を設定 | OS ハンドルサンドボックスを有効化、symlink/junction エスケープを防止 |
| 高スループットクローラー | `MaxInputSize` を縮小 + `ProcessingTimeout` を短縮 | 悪意のあるページが Worker を引きずり込むのを防止 |

## 高セキュリティ設定

`HighSecurityConfig()` はプリセットで、すべての制限を一括で厳格化し完全な監査を有効化します：

```go
cfg := html.HighSecurityConfig()
// 自動設定：
//   MaxInputSize      = 10MB（デフォルト 50MB）
//   MaxDepth          = 100（デフォルト 500）
//   ProcessingTimeout = 10s（デフォルト 30s）
//   WorkerPoolSize    = 2（デフォルト 4）
//   Audit             = HighSecurityAuditConfig()（有効化 + 原始値を含む）
```

## エラー処理

すべてのセキュリティ違反は明確なセンチネルエラーを返し、`errors.Is` によるカテゴリ判定をサポートします：

```go
package main

import (
	"errors"
	"fmt"

	"github.com/cybergodev/html"
)

func main() {
	data := []byte(`<html><body>悪意のある超深ネスト構成</body></html>`)
	_, err := html.Extract(data)
	if err != nil {
		switch {
		case errors.Is(err, html.ErrInputTooLarge):
			// 入力が制限を超過、記録して拒否
			fmt.Println("入力過大")
		case errors.Is(err, html.ErrMaxDepthExceeded):
			// 再帰爆弾の可能性
			fmt.Println("深度違反")
		case errors.Is(err, html.ErrInternalPanic):
			// panic はリカバリ済み、入力の調査と報告が必要
			fmt.Println("内部 panic はリカバリ済み")
		}
	}
	// 出力：深度違反（例、実際は入力に依存）
}
```

:::tip ファイルエラーには SafePath を使用
`*FileError` に対しては、元の error を直接印刷するのではなく `SafePath()` で匿名化されたパス文字列を取得してください——解決された実際のパスがログに漏洩するのを防ぎます。
:::

## 次のステップ

- [監査システムの実践](./audit-pipeline) — 8 種のイベントタイプ、組み込み Sink の比較、段階的ルーティングパイプライン
- [本番チェックリスト](./production-checklist) — デプロイ前のセキュリティチェックリスト
- [API リファレンス：監査システム](../../api-reference/modules/audit) — 完全な API シグネチャ
