---
sidebar_label: "パフォーマンス最適化"
title: "パフォーマンス最適化 - CyberGo JSON | 高性能ガイド"
description: "CyberGo JSON 性能最適化：EnableCache/CacheTTL キャッシュ、ParallelThreshold 並列、PreParse・WarmupCache 事前解析・ウォームアップ、CompilePath 事前コンパイル、オブジェクトプール再利用、ベンチマークで高頻度 JSON 処理を高速化。"
sidebar_position: 1
---

# パフォーマンス最適化

JSON 処理のパフォーマンスを最適化する戦略とテクニック。

## プロセッサの再利用

### Processor インスタンスの再利用

```go
// ✅ パッケージレベル関数はグローバル Processor を自動再利用
for _, item := range dataList {
    val := json.GetString(item, "name")
}

// ✅ またはインスタンスを明示再利用（カスタム設定に適する）
processor, err := json.New()
if err != nil {
    panic(err)
}
defer processor.Close()
for _, item := range dataList {
    val := processor.GetString(item, "name")
}
```

## ライブラリ内蔵のパフォーマンス機構

ライブラリ自体が行っている最適化を知り、車輪の再発明を避けます：

| 機構 | 働き | あなたがやること |
|------|------|------------|
| ファストパス検出 | 単一キーのプロパティアクセス（`name` など、パスが英数字/アンダースコアのみ）はルックアップテーブルで識別され、キャッシュ無効時はルートオブジェクトへの直接取得で再帰プロセッサを回避 | なし——自動で有効。キャッシュ有効（デフォルト）時は同種のアクセスが解析/結果キャッシュで高速化 |
| FastEncoder | 単純型（map/slice/プリミティブ値）のエンコードはリフレクション不要 | なし——自動で有効 |
| 結果キャッシュ | 同じ (JSON, パス) の再クエリがキャッシュヒット | デフォルトで有効。`CacheTTL`/`MaxCacheSize` で規模を制御 |
| オブジェクトプール | `IterableValue`、エンコードバッファ、Config などを再利用し、GC 負荷を削減 | `parsed.Release()` / `cp.Release()` で返却 |
| コンパイル済みパスキャッシュ | よく使うパスの解析結果をグローバルにキャッシュ | 高頻度パスには [`CompilePath`](../api-reference/processor/query#compilepath) を使用 |

::: tip CacheSharedResults：読み取り多用・書き込み少用シナリオのゼロコピースイッチ
`Config.CacheSharedResults = true` の場合、キャッシュヒットした `Get` は共有値を直接返し、**防御的ディープコピーをスキップ**します——大型サブツリーの反復読み取りにおける割り当てと CPU オーバーヘッドが大幅に低下します。コントラクトは、呼び出し側が返された `map[string]any`/`[]any` を**変更しない**ことです（プリミティブ値は常に安全）。デフォルトはオフ（読み取り時コピー）で、負荷特性に応じて明示的に有効化します。
:::

## 最適化ディシジョンパス

パフォーマンス問題に遭遇したら固定順序で進め、各ステップは**測定結果**で次に進むか判断します：

| ステップ | 手段 | 適用シグナル |
|------|------|----------|
| ① まず測定 | ベンチマーク + メモリ分析（下記参照）、`GetStats()` でキャッシュヒット率を確認 | いかなる最適化の前——データがなければ最適化の方向性もない |
| ② 再利用 | パッケージレベル関数または共有 `Processor` インスタンス（キャッシュとオブジェクトプールを再利用） | リクエストごとの `json.New()`、プロセッサの頻繁な再構築 |
| ③ パスプリコンパイル | [`CompilePath`](../api-reference/processor/query#compilepath) + `GetCompiled` | **同一パス**を大量の異なる JSON にクエリ（パス解析が重複オーバーヘッドになっている） |
| ④ 事前解析 | [`PreParse`](../api-reference/processor/query#preparse) + `GetFromParsed` | **同一 JSON** に連続して複数パスをクエリ（重複解析がホットスポットになっている） |
| ⑤ 並列 | `NewParallelIterator` / `StreamJSONLParallel`（[並行処理](./concurrency)を参照） | CPU 集約的バッチ処理、行数が多く 1 行の処理が重い |

::: tip 最適化の前に測定
デフォルト設定（キャッシュ有効 + オブジェクトプール + ファストパス）がほとんどのシナリオをカバーします。まずベンチマークでホットスポットを特定し、ボトルネックの所在を確認してから、③④⑤ の明示的最適化に着手してください——これらは柔軟性をある程度犠牲にして速度を得るものです。小さい配列（`ParallelThreshold` デフォルトの 10 未満）は並列化とかえって遅くなります。
:::

## メモリ最適化

### 割り当ての削減

```go
// ✅ Marshal はバイトスライスを返す
bytes, _ := json.Marshal(data)

// ✅ EncodeWithConfig は文字列を返す（Encode は非推奨）
s, _ := json.EncodeWithConfig(data)
```

### バッファの事前確保

```go
// 大量データ処理時は事前確保
buf := make([]byte, 0, 1024*1024)
```

## ファイル処理

### 大規模ファイルには構造化反復を

```go
// ❌ 一括ロード
data, _ := os.ReadFile("large.json")
parsed, _ := json.ParseAny(string(data))

// ✅ 構造化反復（注意：完全なファイルをメモリにロードする点は変わらない）
processor, err := json.New()
if err != nil {
    panic(err)
}
defer processor.Close()
processor.ForeachFile("large.json", func(key any, item *json.IterableValue) error {
    processItem(item)
    return nil
})
```

### NDJSON 処理

```go
// StreamLinesInto でストリーミング処理
file, _ := os.Open("data.jsonl")
defer file.Close()
entries, err := json.StreamLinesInto[LogEntry](file, func(lineNum int, entry LogEntry) error {
    // 各行の JSON を処理
    return nil
})
```

## 並行処理

### 内蔵 ParallelIterator を優先

ライブラリには並列イテレータが付属し、セマフォと goroutine プールの手書きが不要です。自動バッチ分割とキャンセル対応：

```go
items, _ := json.GetArray(data, "items")
it := json.NewParallelIterator(items)
defer it.Close()

// 並列マップ
doubled, err := it.Map(func(i int, v any) (any, error) {
    return processItem(v), nil
})

// または並行走査 / フィルタ（WithContext 版はキャンセルに応答可能）
_ = it.ForEach(func(i int, v any) error { return nil })
_ = it.ForEachWithContext(ctx, func(i int, v any) error { return nil })
filtered := it.Filter(func(i int, v any) bool { return v != nil })
```

### 完全な制御が必要な場合：手書き Worker Pool

```go
items := json.GetArray(data, "items")
jobs := make(chan any, len(items))

// 固定数の worker を起動し、goroutine を再利用して頻繁な作成/破棄を回避
var wg sync.WaitGroup
workers := runtime.NumCPU()
for w := 0; w < workers; w++ {
    wg.Add(1)
    go func() {
        defer wg.Done()
        for item := range jobs {
            processItem(item)
        }
    }()
}

// タスクを配分したらチャネルを閉じ、worker に終了を通知
for _, item := range items {
    jobs <- item
}
close(jobs)
wg.Wait()
```

::: tip 並列しきい値
`Config.ParallelThreshold`（デフォルト 10）はライブラリ内部の並列パスの発動下限を制御します。JSONL 並列処理の worker 数は `Config.JSONLWorkers`（デフォルト 4）または `StreamJSONLParallel(reader, workers, ...)` の引数で制御します。詳しくは[並行処理](./concurrency)を参照してください。
:::

## 設定の最適化

### シナリオに応じた設定調整

```go
// 小規模データ：緩い設定
smallCfg := json.DefaultConfig()
smallCfg.MaxNestingDepthSecurity = 200 // 最大許容値（検証範囲 10-200）

// 信頼できない入力：セキュリティ設定
safeCfg := json.SecurityConfig()
safeCfg.MaxJSONSize = 1024 * 1024
```

### 不要な機能の無効化

```go
// Hook が不要なら設定しない
cfg := json.DefaultConfig() // 最小構成
```

## キャッシュ戦略

### 解析結果のキャッシュ

```go
var cache sync.Map

func getOrParse(key string, data []byte) (any, error) {
    if val, ok := cache.Load(key); ok {
        return val, nil
    }

    result, err := json.ParseAny(string(data))
    if err != nil {
        return nil, err
    }

    cache.Store(key, result)
    return result, nil
}
```

### パスクエリのキャッシュ

```go
// よく使うパスをプリコンパイル（Processor を使用）
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()
path1, _ := p.CompilePath("user.name")
path2, _ := p.CompilePath("user.email")
path3, _ := p.CompilePath("items[*].id")
```

## ベンチマーク

### パフォーマンステストのサンプル

```go
func BenchmarkParse(b *testing.B) {
    data := []byte(`{"name": "test", "items": [1, 2, 3]}`)

    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        _, _ = json.ParseAny(string(data))
    }
}

func BenchmarkGetString(b *testing.B) {
    data := `{"user": {"name": "CyberGo", "email": "test@example.com"}}`

    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        json.GetString(data, "user.name")
    }
}
```

### 最適化手段の A/B 比較

最適化が有効かを検証する最も確実な方法は、「最適化前 / 最適化後」を一対のベンチマークに書いて比較実行することです。`b.ReportAllocs()` で `B/op` と `allocs/op` を一緒に出力し、`go test -bench=. -benchmem` で実行します：

```go
// ベースライン：Get の反復（毎回独立してキャッシュキー検索 + ナビゲーションを実行）
func BenchmarkRepeatGet(b *testing.B) {
    data := `{"user": {"name": "CyberGo"}, "items": [1, 2, 3]}`
    b.ReportAllocs()
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        _, _ = json.Get(data, "user.name")
        _, _ = json.Get(data, "items")
    }
}

// 候補最適化：PreParse で 1 回解析し、GetFromParsed で複数回クエリ
func BenchmarkPreParse(b *testing.B) {
    data := `{"user": {"name": "CyberGo"}, "items": [1, 2, 3]}`
    p, err := json.New()
    if err != nil {
        b.Fatal(err)
    }
    defer p.Close()

    b.ReportAllocs()
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        parsed, err := p.PreParse(data)
        if err != nil {
            b.Fatal(err)
        }
        _, _ = p.GetFromParsed(parsed, "user.name")
        _, _ = p.GetFromParsed(parsed, "items")
        parsed.Release()
    }
}
```

::: tip 結果の解釈
2 つのベンチマークの `ns/op` と `allocs/op` を比較します：事前解析側が明確に低ければ、そのホットスポットのオーバーヘッドは主に重複解析/キャッシュキー検索にあり、事前解析の導入価値があります。差が無視できる場合は、[最適化ディシジョンパス](#最適化ディシジョンパス)に従って次の層（エンコード、ロック競合など）を調査します。
:::

### メモリ分析

```go
func TestMemoryUsage(t *testing.T) {
    var m runtime.MemStats
    runtime.ReadMemStats(&m)
    before := m.Alloc

    // 操作を実行
    data := generateLargeJSON()
    _, _ = json.ParseAny(data)

    runtime.ReadMemStats(&m)
    after := m.Alloc

    fmt.Printf("メモリ使用量：%d bytes\n", after-before)
}
```

## パフォーマンス比較

| 操作 | 小規模データ (<1KB) | 中規模データ (1MB) | 大規模データ (>10MB) |
|------|---------------|----------------|----------------|
| `Parse` | 推奨 | 推奨 | 非推奨 |
| `ForeachFile` | 不要 | 選択可 | 推奨 |

## 関連

- [大規模ファイル処理](../streaming/large-files)
- [エラー処理](./error-handling)
