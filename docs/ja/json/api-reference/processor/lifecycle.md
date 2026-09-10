---
sidebar_label: "ライフサイクル"
title: "Processor ライフサイクル - CyberGo JSON | API リファレンス"
description: "CyberGo JSON Processor ライフサイクル：New 作成、Close の冪等なリソース解放、IsClosed 状態確認、GetStats 統計、GetHealthStatus ヘルス監視、ClearCache と WarmupCache キャッシュ管理で並行安全な終了を保証します。"
sidebar_position: 11
---

# ライフサイクルと統計

Processor はライフサイクル管理、キャッシュ制御、ヘルスモニタリング機能を完全に提供します。

## ライフサイクル

### Close

シグネチャ：`func (p *Processor) Close() error`

プロセッサを閉じてリソース（キャッシュ、セキュリティバリデータ、フック参照）を解放します。Processor の使用後はこのメソッドを呼び出す必要があります。

```go
processor, _ := json.New(json.DefaultConfig())
defer processor.Close()
```

::: tip クローズのセマンティクス
- **冪等かつスレッドセーフ**：`Close` を繰り返し呼んでも 1 回だけ有効です。
- **まず進行中の操作を排出**：`Close` は進行中の操作の終了を待ちます（タイムアウト上限あり）。タイムアウト後、プロセッサは新しい操作を拒否します（`IsClosed()` が `true` を返す）が、リソースは完全に保持され、進行中の操作は妨害されずに完了できます。
- クローズ後、すべての操作は `ErrProcessorClosed` を返します。
- `Close` はインスタンス間で共有されるグローバルキャッシュ（パス型キャッシュ、構造体エンコーダキャッシュ）を**クリーンアップしません**。プロセス終了前の完全なクリーンアップには [`ShutdownGlobalProcessor`](#グローバルプロセッサ管理) を使ってください。
:::

### IsClosed

シグネチャ：`func (p *Processor) IsClosed() bool`

プロセッサが閉じられているかどうかを確認します。「クローズ中（排出中）」状態でも `true` を返します——このウィンドウでは新しい操作はすでに拒否されています。

```go
if processor.IsClosed() {
    // プロセッサは閉じられており、使用不可
}
```

## キャッシュ管理

### ClearCache

シグネチャ：`func (p *Processor) ClearCache()`

プロセッサの内部キャッシュをクリアします。

```go
processor.ClearCache()
```

用途：
- データソースが変更された場合
- メモリ使用量が高すぎる場合
- 強制リフレッシュが必要な場合

### WarmupCache

シグネチャ：`func (p *Processor) WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)`

キャッシュをウォームアップし、以降の操作のパフォーマンスを向上させます。プロセッサでキャッシュが有効（デフォルトで有効）である必要があり、無効の場合はエラーを返します。完全なサンプルと `WarmupResult` フィールドの説明は[バッチ操作](./batch#キャッシュウォームアップ-warmupcache)を参照してください。

```go
paths := []string{"user.name", "user.email", "items[*].id"}
result, err := processor.WarmupCache(data, paths)
if err != nil {
    panic(err)
}
fmt.Printf("%d 個のパスのウォームアップに成功\n", result.Successful)
```

## 統計情報

### GetStats

シグネチャ：`func (p *Processor) GetStats() Stats`

プロセッサの統計情報を取得します。

```go
stats := processor.GetStats()
fmt.Printf("キャッシュヒット率：%.2f%%\n", stats.HitRatio * 100)
fmt.Printf("キャッシュサイズ：%d\n", stats.CacheSize)
```

**Stats 構造**：

```go
type Stats struct {
    CacheSize        int64         `json:"cache_size"`        // キャッシュエントリ数
    CacheMemory      int64         `json:"cache_memory"`      // キャッシュメモリ使用量（バイト）
    MaxCacheSize     int           `json:"max_cache_size"`    // 最大キャッシュサイズ
    HitCount         int64         `json:"hit_count"`         // キャッシュヒット回数
    MissCount        int64         `json:"miss_count"`        // キャッシュミス回数
    HitRatio         float64       `json:"hit_ratio"`         // キャッシュヒット率
    CacheTTL         time.Duration `json:"cache_ttl"`         // キャッシュ TTL
    CacheEnabled     bool          `json:"cache_enabled"`     // キャッシュが有効か
    IsClosed         bool          `json:"is_closed"`         // プロセッサが閉じられているか
    MemoryEfficiency float64       `json:"memory_efficiency"` // メモリ効率
    OperationCount   int64         `json:"operation_count"`   // 操作総数
    ErrorCount       int64         `json:"error_count"`       // エラー総数
}
```

| フィールド | 型 | 説明 |
|------|------|------|
| `CacheSize` | `int64` | 現在のキャッシュエントリ数 |
| `CacheMemory` | `int64` | キャッシュメモリ使用量（バイト） |
| `MaxCacheSize` | `int` | 最大キャッシュサイズ制限 |
| `HitCount` | `int64` | キャッシュヒット回数 |
| `MissCount` | `int64` | キャッシュミス回数 |
| `HitRatio` | `float64` | キャッシュヒット率（0-1） |
| `CacheTTL` | `time.Duration` | キャッシュ有効期限 |
| `CacheEnabled` | `bool` | キャッシュが有効か |
| `IsClosed` | `bool` | プロセッサが閉じられているか |
| `MemoryEfficiency` | `float64` | メモリ効率 |
| `OperationCount` | `int64` | 総操作回数 |
| `ErrorCount` | `int64` | 総エラー回数 |

**フィールドの解釈**：

- `OperationCount` / `ErrorCount`：読み書き操作（`Get` / `GetMultiple` / `Set` / `SetMultiple` / `Delete` など）すべてが累積されます。ライフサイクル系の拒否（プロセッサ終了済み、並行数超過）はエラー数に含まれません。
- `HitRatio`：0–1 の範囲（0.85 なら 85%）。`CacheEnabled=false` のときはヒットデータがありません。
- `CacheSize` / `CacheMemory` はキャッシュの実況、`MaxCacheSize` / `CacheTTL` は設定上限です（[Config](../config) を参照）。
- `IsClosed`：[`IsClosed()`](#isclosed) と一致し、監視でプロセッサが意図せず閉じられていないか検出できます。

## ヘルスチェック

### GetHealthStatus

シグネチャ：`func (p *Processor) GetHealthStatus() HealthStatus`

プロセッサのヘルス状態を取得します。

```go
status := processor.GetHealthStatus()
if status.Healthy {
    fmt.Println("プロセッサは正常")
} else {
    for name, check := range status.Checks {
        if !check.Healthy {
            fmt.Printf("チェック %s が失敗: %s\n", name, check.Message)
        }
    }
}
```

**HealthStatus 構造**（全体状態は `HealthStatus` に、各分項の結果は `CheckResult` に入ります）：

```go
type HealthStatus struct {
    Timestamp time.Time              `json:"timestamp"` // チェック時刻
    Healthy   bool                   `json:"healthy"`   // 全体の健康状態
    Checks    map[string]CheckResult `json:"checks"`    // 各チェックの結果
}

type CheckResult struct {
    Healthy bool   `json:"healthy"` // 健康かどうか
    Message string `json:"message"` // 状態メッセージ
}
```

`HealthStatus` フィールド：

| フィールド | 型 | 説明 |
|------|------|------|
| `Timestamp` | `time.Time` | チェック時刻 |
| `Healthy` | `bool` | 全体として健康か |
| `Checks` | `map[string]CheckResult` | 各チェックの詳細 |

`CheckResult` フィールド：

| フィールド | 型 | 説明 |
|------|------|------|
| `Healthy` | `bool` | この分項が健康か |
| `Message` | `string` | 状態メッセージ（失敗理由など） |

::: tip 解釈
`Checks` は各分項チェック（メトリクス収集など）の結果マッピングで、いずれかの分項が不健康なら `Healthy=false` になります。nil プロセッサやメトリクスコレクター未初期化の場合は `Healthy=false` を直接返し、`Checks` に理由（`processor is nil` など）が入ります。メトリクスコレクターは `EnableMetrics=true` のときにのみ作成されます——無効の場合、`GetHealthStatus` は `Healthy=false` を返し、`Checks` に `Metrics collector not initialized` と明記されます。`Config.EnableHealthCheck` フィールドは予約済みで、この動作には影響しません（[Config](../config#入力とオブザーバビリティのスイッチ)を参照）。
:::

## 拡張フック

### AddHook

シグネチャ：`func (p *Processor) AddHook(hook Hook)`

操作フックをプロセッサに追加します。

```go
processor.AddHook(&LoggingHook{})
processor.AddHook(json.TimingHook(&MetricsRecorder{}))
```

フックは毎回の操作の前後に呼び出され、次の用途に使用できます：
- ログ記録
- パフォーマンス監視
- メトリクス収集
- 監査トレース

### SetLogger

シグネチャ：`func (p *Processor) SetLogger(logger *slog.Logger)`

`SetLogger` はプロセッサの構造化ロガーをアトミックに置き換えます（`component=json-processor` フィールドを自動付加）。`nil` を渡すと `slog.Default()` にフォールバックします。デバッグと実行時診断に使用します。

```go
processor, _ := json.New()
defer processor.Close()

processor.SetLogger(slog.Default().With("component", "json-processor"))
```

### GetConfig

シグネチャ：`func (p *Processor) GetConfig() Config`

`GetConfig` はプロセッサの現在の設定のディープコピーを返します（内部で `Config.Clone` を使用）。返された値を変更してもプロセッサには影響しません。nil プロセッサへの呼び出しはゼロ値 Config を返します。

```go
processor, _ := json.New()
defer processor.Close()

cfg := processor.GetConfig()
fmt.Printf("キャッシュ有効: %v\n", cfg.EnableCache)
fmt.Printf("最大 JSON サイズ：%d\n", cfg.MaxJSONSize)
```

## グローバルプロセッサ管理

パッケージレベル関数は内部グローバルプロセッサに依存しており、2 つのパッケージレベル管理関数もライフサイクルの範疇に属します（シグネチャと完全なサンプルは [Processor 概要](./index#グローバルプロセッサ管理)を参照）：

- `json.SetGlobalProcessor(p)` — カスタムプロセッサをグローバルに設定：`nil` を渡すと no-op。古いグローバルプロセッサは先にクローズされ、関数はスレッドセーフです。
- `json.ShutdownGlobalProcessor()` — グローバルプロセッサをクローズして削除し、同時にインスタンス間で共有されるグローバルキャッシュと設定付きプロセッサキャッシュもクリーンアップします。常駐サービスの終了前に呼び出すのに適します。

## 使用のヒント

### リソース管理

```go
processor, _ := json.New()
defer processor.Close()  // 確実にリソースを解放

// processor を使用...
```

### パフォーマンス最適化

```go
// よく使うパスをウォームアップ
processor.WarmupCache(data, []string{
    "user.name",
    "user.email",
    "items[*].id",
})

// 統計を定期的にチェック
stats := processor.GetStats()
if stats.HitRatio < 0.5 {
    // ヒット率が低い。キャッシュ設定の調整を検討
}
```

### 監視の統合

```go
// 定期的なヘルスチェック
go func() {
    ticker := time.NewTicker(30 * time.Second)
    for range ticker.C {
        status := processor.GetHealthStatus()
        if !status.Healthy {
            log.Printf("Processor unhealthy: %+v", status.Checks)
        }
    }
}()
```

## 関連

- [Config](../config) - 設定オプション（キャッシュサイズ、TTL など）
- [Hook フックシステム](../../extensions/hooks) - フックの詳細な使い方ガイド
- [インターフェース定義](../interfaces) - Hook インターフェース
