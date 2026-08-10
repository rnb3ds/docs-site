---
sidebar_label: "本番チェックリスト"
title: "本番チェックリスト - CyberGo html | 本番前セキュリティ点検"
description: "CyberGo html 本番デプロイ向けセキュリティチェックリスト：HighSecurityConfig プリセット、Processor ライフサイクル管理、監査監視、コンテキストタイムアウト、エラー処理、優先度別の必須・推奨・任意項目を体系的にまとめます。"
sidebar_position: 3
---

# 本番チェックリスト

html ライブラリを本番に導入する前に、このリストで項目ごとに確認してください。各項目には優先度が付いており、何を必ずやり、何を後回しにできるかの判断に役立ちます：

- 🔴 **必須（P0）**：やらないとセキュリティホールやリソース漏れに直結
- 🟡 **推奨（P1）**：強く推奨、信頼性と可観測性に影響
- 🟢 **任意（P2）**：あればさらに良い

:::tip まずプリセット、次に業務微調整
`HighSecurityConfig()` はすでにすべての制限を安全なレベルに引き締め、完全な監査を有効化しています。信頼できない入力を扱うほとんどのシナリオでは、これをそのまま使い、必要に応じて緩めるだけでよく、ゼロから設定を組み立てる必要はありません。
:::

## 基本設定

- [ ] 🔴 `HighSecurityConfig()` またはカスタムセキュリティ設定を出発点にする
- [ ] 🔴 合理的な `MaxInputSize` を設定（業務要件に応じ、ハード上限は 50MB）
- [ ] 🔴 長時間のブロッキングを防ぐため `ProcessingTimeout` を設定（10–30s を推奨）
- [ ] 🟡 DOM 深度を制限するため `MaxDepth` を設定（デフォルト 500、高セキュリティでは 100 を推奨）
- [ ] 🟡 `EnableSanitization = true` を維持（デフォルトでオン、オフにしない）
- [ ] 🟢 並発量に応じて `WorkerPoolSize` を調整（デフォルト 4、上限 256）

**理由**：

- `MaxInputSize` はメモリの第一防線です。`maxConfigInputSize`（50MB）のハード制約も同時に受け——誤設定しても危険な値まで増幅することはありません。ピークメモリはおおむね `MaxInputSize × WorkerPoolSize` と見積もれます。公開 Web API では 10MB に引き締めることを推奨します。
- `WorkerPoolSize` はバッチ抽出の並行度を決定します。CPU コア数に設定すれば通常十分です。大きすぎ（256 の上限に近い）と、高並発下で大量の goroutine とメモリプレッシャーを生みます。
- `CacheTTL`（デフォルト 1h）と `CacheCleanup`（デフォルト 5min）は結果キャッシュのライフサイクルとバックグラウンド清掃のテンポを制御します。`MaxCacheEntries` を 0 にするとキャッシュを完全に無効化できます。キャッシュヒットは CPU は節約しますがメモリは節約せず、キャッシュ項目自体もメモリを占有します（上限 100000 件）。

## Processor ライフサイクル

- [ ] 🔴 `defer p.Close()` で Processor を確実に解放する
- [ ] 🔴 `Close()` 後に抽出メソッドを呼び出さない（`ErrProcessorClosed` を返す）
- [ ] 🟡 リクエストごとに新設するのではなく、シングルトン Processor でリクエスト間再利用する

```go
p, err := html.New(html.HighSecurityConfig())
if err != nil {
    log.Fatal(err)
}
defer p.Close()
```

**理由**：

- `Processor` は並行安全で、作成後に複数の goroutine で共有でき、内部のキャッシュと統計カウンタは同期保護されています。アプリケーションレベルのシングルトン（例：HTTP handler がグローバルな `*html.Processor` を 1 つ持つ）にすれば、キャッシュを再利用しつつ初期化コストの繰り返しを避けられます。
- **リクエストごとに `html.New()` しないでください**：各 Processor はバックグラウンドのキャッシュ清掃 goroutine を起動し、キャッシュや監査構造体を割り当てるため、頻繁な生成はリソースの無駄遣いであり GC 負荷を増やします。
- パッケージレベルの便利関数（`html.Extract`、`html.ExtractWithContext` など）は内部で `sync.Pool` を使って一時 Processor を再利用しますが、**抽出結果はキャッシュしません**——呼び出しをまたいでキャッシュヒットすることはありません。キャッシュ再利用が必要なシナリオでは明示的に Processor インスタンスを保持してください。

## 監査とモニタリング

- [ ] 🔴 監査システムを有効化（`Audit.Enabled = true`）
- [ ] 🟡 `WriterAuditSink` で監査ログをファイルに永続化
- [ ] 🟡 `GetStatistics()` の `ErrorCount` と `CacheHits` をモニタリング
- [ ] 🟡 critical レベルのイベント（入力違反、パス横断）にリアルタイムアラートを設定
- [ ] 🟢 `ChannelAuditSink` で監査ストリームを外部 SIEM に接続

```go
auditFile, err := os.OpenFile("audit.jsonl", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
if err != nil {
    log.Fatal(err)
}
defer auditFile.Close()

cfg := html.HighSecurityConfig()
cfg.Audit.Sink = html.NewWriterAuditSink(auditFile)
```

**レベル別監査パイプライン**——critical イベントはリアルタイムでアラート、それ以外はファイルに保存：

```go
// critical イベントを channel に送り、独立 goroutine がアラートを送信
alertSink := html.NewChannelAuditSink(50)
go func() {
    for entry := range alertSink.Channel() {
        sendAlert(entry) // PagerDuty / Slack / SMS に接続
    }
}()

// ファイル保存 + critical アラート、2 経路を並行させ互いにブロックしない
cfg.Audit.Sink = html.NewMultiSink(
    html.NewWriterAuditSink(auditFile),
    html.NewFilteredSink(alertSink, func(e html.AuditEntry) bool {
        return e.Level == html.AuditLevelCritical
    }),
)
```

**ChannelAuditSink のドロップ監視**：channel のバッファが一杯になるとイベントはドロップされるため、`DroppedCount()` で巡回点検します：

```go
if n := alertSink.DroppedCount(); n > 0 {
    log.Printf("アラート channel が %d 件の監査イベントをドロップしました。バッファを増やすか消費を速めてください", n)
}
```

パイプライン構築のより多くのパターン（レベル別ルーティング、カスタム Sink、高セキュリティフォレンジクス）は[監査システム実戦](./audit-pipeline)を参照してください。

## コンテキストとタイムアウト

- [ ] 🔴 すべての抽出操作で生の `Extract` ではなく `ExtractWithContext` 版を使う
- [ ] 🔴 合理的なコンテキストタイムアウトを設定する
- [ ] 🟡 バッチ操作ではキャンセル付きコンテキストを使い、エラー発生時に残りタスクを即座に停止できるようにする

```go
ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
defer cancel()
result, err := p.ExtractWithContext(ctx, data)
```

**理由**：

- ライブラリには 2 層のタイムアウトがあります：`Config.ProcessingTimeout`（デフォルト 30s、単一文書に有効）と呼び出し元が渡す `context.Context`。両者は**重ねて有効**——先に満了した方が優先されます。タイムアウト context を渡さなくても `ProcessingTimeout` がフォールバックし、より短い context を渡せば context が優先されます。
- バッチ抽出（`ExtractBatch`）ではバッチ全体に総タイムアウト context を設定し、あるバッチのコストが暴走しないようにします。単一項目の失敗がバッチ全体をブロックしてはいけません——バッチメソッドは内部で各項目を独立して recover します。
- タイムアウト機構は独立 goroutine + context deadline で実装され、全体は `maxTimeoutGoroutines`（1000）で保護されます。極端な高並発下で上限を超えると、新リクエストは goroutine を無限に積まず、直接 `ErrProcessingTimeout` を返します。

## エラー処理

- [ ] 🔴 `errors.Is` で業務エラーとセキュリティエラーを区別する
- [ ] 🔴 `*FileError` は元のエラー文字列ではなく `SafePath()` で出力する
- [ ] 🟡 すべての `ErrInputTooLarge` と `ErrMaxDepthExceeded` を記録（攻撃探査の可能性）
- [ ] 🟡 `ErrInternalPanic` の発生頻度をモニタリング（出現時は調査し issue を報告すべき）
- [ ] 🟢 `ErrProcessorClosed` ではクラッシュせずグレースフルデグラデーションを行う

```go
_, err := p.Extract(data)
switch {
case errors.Is(err, html.ErrInputTooLarge):
    log.Printf("入力が上限超過、攻撃探査の疑い")
case errors.Is(err, html.ErrMaxDepthExceeded):
    log.Printf("深度違反、再帰爆弾の疑い")
case errors.Is(err, html.ErrInternalPanic):
    // panic は recover 済みだがライブラリのバグなので報告すべき
    log.Printf("内部 panic をリカバリ: %v", err)
case errors.Is(err, html.ErrFileNotFound),
    errors.Is(err, html.ErrInvalidFilePath):
    var fe *html.FileError
    if errors.As(err, &fe) {
        log.Printf("ファイルエラー: %s", fe.SafePath()) // ファイル名だけ出力しフルパスを漏らさない
    }
}
```

**理由**：

- `FileError.Error()` にはすでにマスキングが組み込まれています（ファイル名だけを表示し完全パスは表示しない）が、`FileError.Path` フィールドは元のパスを保持しています。ログでは**必ず `SafePath()` を経由してください**。サーバー側のディレクトリ構造がログ集計システムに漏れるのを防げます。
- `ErrInternalPanic` は理論上出現しないはずです——悪意のある入力がライブラリの予期しない panic を引き起こしたことを示します。一度でも監視したら、トリガーとなった入力を保持して報告してください。ライブラリの panic リカバリはプロセスのクラッシュを防ぎますが、長期的にそれに依存すべきではありません。

## リソース管理

- [ ] 🔴 バッチ操作は 1 バッチ 10000 件を超えない
- [ ] 🟡 合理的に `WorkerPoolSize` を設定（CPU コア数と同数を推奨）
- [ ] 🟡 メモリ使用量とキャッシュヒット率をモニタリング
- [ ] 🟢 長期稼働インスタンスは定期的に `ClearCache()` を呼び出してキャッシュを解放

**理由**：

- **ピークメモリの見積もり**：`MaxInputSize × WorkerPoolSize` がおおむねバッチ処理時のメモリピークです（各 worker が同時に 1 つの入力を処理）。例えば `10MB × 8 = 80MB`。これに基づいてコンテナメモリを予備確保してください。
- **キャッシュとメモリ**：`MaxCacheEntries`（デフォルト 2000）の各項目は抽出結果サイズに応じてメモリを占有します。長稼働サービスでメモリが逼迫している場合は entries を小さくするか `CacheTTL` を短くしてください。`CacheCleanup` が短いほど期限切れ項目の回収が迅速です。
- **バッチ分割戦略**：1 バッチが大きすぎるとメモリを占有するうえに失敗時のコストも増幅します。大きなタスクは 1 バッチ 1000–5000 件の小バッチに分け、各バッチに独立のタイムアウト付き context を使うことを推奨します。1 バッチの失敗が後続バッチに影響することはありません。

## ファイル処理

- [ ] 🔴 ファイルパスの提供元を検証（ユーザーに完全なパスを直接制御させない）
- [ ] 🔴 `AllowedBaseDir` を設定してファイル読み取りディレクトリを制限
- [ ] 🟡 処理前に `os.Stat` でファイルサイズを事前チェック（ライブラリ内部でも実施するが、外層でもう一道やるとより堅牢）
- [ ] 🟢 アップロードファイルにタイプ/拡張子のホワイトリスト検証を行う

**理由**：

- `AllowedBaseDir` はファイル読み取りのサンドボックスです。**OS のファイルハンドルで実際のパスを解決**し、`filepath.EvalSymlinks` では扱えない Windows junction/reparse points やクロスプラットフォームの symlink エスケープをブロックできます。空のまま＝`..` 横断検出だけを保持しサンドボックスは有効化しません——パスがユーザー入力に由来する場合は必ず明示的に設定してください。
- ライブラリ内部はすでに `ReadAll` でメモリに読み込む前に `Stat` でファイルサイズを事前チェックし、上限超過のファイルを拒否しています。「読み切ってから上限超過に気づく」というメモリピークの窓は閉じられています。外層の業務でさらに一道のサイズ事前チェックを加えるのは深度防御にあたります。

## デプロイ前の自己検証スクリプト

本番前にこの自己検証プログラムを 1 回走らせ、設定が合法で Processor が正常に作成・抽出できることを確認してください：

```go
package main

import (
    "context"
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/html"
)

func main() {
    cfg := html.HighSecurityConfig()

    // 1. 設定の合法性検証（New が内部で Validate を呼ぶ）
    p, err := html.New(cfg)
    if err != nil {
        log.Fatalf("設定が不正: %v", err)
    }
    defer p.Close()

    // 2. 主要な設定項目の確認
    fmt.Printf("MaxInputSize      = %d bytes\n", cfg.MaxInputSize)
    fmt.Printf("MaxDepth          = %d\n", cfg.MaxDepth)
    fmt.Printf("ProcessingTimeout = %v\n", cfg.ProcessingTimeout)
    fmt.Printf("WorkerPoolSize    = %d\n", cfg.WorkerPoolSize)
    fmt.Printf("Audit.Enabled     = %v\n", cfg.Audit.Enabled)

    // 3. 実際の抽出テスト
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()

    sample := []byte("<html><body><h1>自己検証</h1><p>本番準備完了</p></body></html>")
    result, err := p.ExtractWithContext(ctx, sample)
    if err != nil {
        log.Fatalf("抽出失敗: %v", err)
    }
    fmt.Printf("抽出成功、テキスト長: %d\n", len(result.Text))

    fmt.Println("✓ 設定の自己検証に合格")
}
```

:::tip 自己検証は「動くこと」の確認のみ
自己検証スクリプトは設定が合法で経路が通ることを確認しますが、実トラフィック下のモニタリングを**代替しません**。本番後もランタイム指標を継続的に観察してください。
:::

## ランタイムモニタリングのポイント

デプロイ後は以下の指標を継続的に注視し、異常時には即座にアラートを出します：

| 指標 | 取得方法 | アラート閾値 | 考えられる原因 |
|------|----------|----------|----------|
| エラー率 | `Statistics.ErrorCount / TotalProcessed` | > 5% | 入力品質の低下、設定が厳すぎ、上流の異常 |
| キャッシュヒット率 | `Statistics.CacheHits / TotalProcessed` | < 30% | 入力の重複排除不足、キャッシュ TTL が短すぎ |
| 平均処理時間 | `Statistics.AverageProcessTime` | 業務ベースライン超過 | 悪意のある入力、タイムアウト設定の不備 |
| critical 監査イベント | `GetAuditLog()` で `AuditLevelCritical` をフィルタ | 1 件でも | 入力違反、パス横断攻撃 |
| ChannelAuditSink のドロップ数 | `sink.DroppedCount()` | > 0 | バッファ不足、消費側が遅すぎ |

```go
// 定期的に指標を取得（例：毎分 Prometheus が pull）
stats := p.GetStatistics()
var errorRate float64
if stats.TotalProcessed > 0 {
    errorRate = float64(stats.ErrorCount) / float64(stats.TotalProcessed)
}

hitRate := 0.0
if stats.TotalProcessed > 0 {
    hitRate = float64(stats.CacheHits) / float64(stats.TotalProcessed)
}

log.Printf("処理済み=%d エラー率=%.2f%% キャッシュヒット=%.1f%% 平均処理時間=%v",
    stats.TotalProcessed, errorRate*100, hitRate*100, stats.AverageProcessTime)

// critical イベントの巡回点検
for _, e := range p.GetAuditLog() {
    if e.Level == html.AuditLevelCritical {
        log.Printf("[アラート] critical 監査イベント: %s - %s", e.EventType, e.Message)
    }
}
```

:::warning Statistics は累積値
`GetStatistics()` の返すカウンタは Processor 作成時点から累積され、`ClearCache()` ではリセットされません。ウィンドウごとに集計したい場合は、定期的に `ResetStatistics()` でゼロにするか、自分で差分を取ってください。
:::

## 設定クイックマトリクス

デプロイ環境に応じて設定値を手早く選択：

| 環境 | MaxInputSize | ProcessingTimeout | MaxDepth | WorkerPoolSize | 監査 | 推奨プリセット |
|------|-------------|-------------------|----------|----------------|------|----------|
| 社内ツール | 50MB（デフォルト） | 30s（デフォルト） | 500（デフォルト） | 4（デフォルト） | 任意 | `DefaultConfig()` |
| Web API | 10MB | 10s | 200 | CPU コア数 | 推奨 | `DefaultConfig()` を微調整 |
| 高セキュリティ | 10MB | 10s | 100 | 2 | 必須 | `HighSecurityConfig()` |
| バッチクローラー | 50MB | 30s | 500 | 8–16 | 推奨 | `DefaultConfig()` を微調整 |

:::tip クローラーシナリオの特別な考慮
バッチクローラーは信頼できない Web ページを扱いますがスループット優先です。`EnableSanitization = true` を維持しつつ、`WorkerPoolSize` を 8–16 に上げてスループットを高め、同時に各バッチに独立の総タイムアウト context を設定して悪意のあるページがバッチ全体を引きずり下ろさないようにすることを推奨します。
:::

## 関連ドキュメント

- [セキュリティ概要](./) — 深度防御アーキテクチャと各防御層の詳細
- [監査システム実戦](./audit-pipeline) — 8 種のイベントタイプ、内蔵 Sink の比較、レベル別ルーティングパイプライン
- [API リファレンス：セキュリティ保護](../../api-reference/modules/security) — セキュリティ関連 API シグネチャ
- [API リファレンス：定数とエラー](../../api-reference/types/constants) — デフォルト値定数とセンチネルエラー
