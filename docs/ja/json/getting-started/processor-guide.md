---
sidebar_label: "Processor ガイド"
title: "Processor ガイド - CyberGo JSON | いつプロセッサを使うか"
description: "CyberGo JSON Processor 入門：パッケージ関数と Processor の選定比較、PreParse 事前解析、CompilePath パスプリコンパイル、マルチ goroutine 共有、ライフサイクル管理、監視統計、グローバルプロセッサ設定で高性能 JSON 処理を習得します。"
sidebar_position: 3
---

# Processor ガイド

このガイドでは、Processor を**いつ**・**どのように**使うか、パッケージレベル関数と比べてどんな利点があるかを理解できます。

## パッケージ関数 vs Processor

CyberGo JSON は 2 つの API スタイルを提供します：

| 観点 | パッケージレベル関数 | Processor |
|------|----------|-----------|
| **典型的な呼び出し** | `json.GetString(data, "name")` | `p.GetString(data, "name")` |
| **作成方法** | 作成不要、直接呼び出し | `p, err := json.New()` |
| **設定方法** | 呼び出しごとに `cfg ...Config` を渡す | 作成時に一括設定、以降再利用 |
| **キャッシュ** | グローバル共有キャッシュ | 独立キャッシュ、制御・クリア可能 |
| **リソース管理** | 自動（グローバルプロセッサ） | 手動 `Close()` |
| **フックシステム** | 非対応 | `AddHook` に対応 |
| **事前解析** | 非対応 | `PreParse` + `GetFromParsed` に対応 |
| **パスプリコンパイル** | 非対応 | `CompilePath` + `GetCompiled` に対応 |
| **適したシナリオ** | シンプルな操作、スクリプト、低頻度呼び出し | 高頻度操作、カスタム設定、サーバーサイド |

::: tip クイック判定
- **パッケージ関数**：JSON をたまに操作する、ライフサイクルを管理したくない、ちょっとしたスクリプト
- **Processor**：カスタム設定が必要、同じデータに高頻度でクエリ、フック/監査が必要
:::

## いつ Processor を使うか

### シナリオ 1：カスタム設定

パッケージレベル関数はデフォルト設定を使用します。セキュリティモード、カスタムエンコーダ、フックが必要な場合は Processor を使います：

```go
// パッケージ関数 — 常にデフォルト設定
val := json.GetString(data, "name")

// Processor — 設定をカスタマイズ可能
cfg := json.SecurityConfig() // セキュリティモード
p, err := json.New(cfg)
if err != nil {
    panic(err)
}
defer p.Close()

// 以降のすべての操作がセキュリティ設定を使用
val, err := p.Get(data, "name")
```

### シナリオ 2：同じデータへの高頻度クエリ（PreParse 最適化）

同じ JSON に複数回クエリする場合、`PreParse` は解析を 1 回だけ行い、以降のクエリは解析結果を再利用します：

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

// 1 回だけ解析
parsed, err := p.PreParse(largeJSON)
if err != nil {
    panic(err)
}
defer parsed.Release() // 使い終わったらオブジェクトプールに返却

// 複数回のクエリ — 解析結果を再利用し、重複解析を回避
name, _ := p.GetFromParsed(parsed, "user.name")
email, _ := p.GetFromParsed(parsed, "user.email")
tags, _ := p.GetFromParsed(parsed, "tags")

// 内部の解析結果（map[string]any / []any）を直接取得することも可能
data := parsed.Data()
_ = data

// 変更も事前解析結果に基づいて可能：SetFromParsed は新しい ParsedJSON を返し、元のオブジェクトは不変
modified, err := p.SetFromParsed(parsed, "user.age", 31)
if err != nil {
    panic(err)
}
newAge, _ := p.GetFromParsed(modified, "user.age")
```

::: warning パフォーマンス比較
- パッケージ関数 `GetString`：呼び出しごとに JSON を解析（キャッシュはあるがヒット率はシナリオ次第）
- `PreParse` + `GetFromParsed`：解析 1 回、N 回のクエリはナビゲーションのみ、重複解析ゼロ
:::

### シナリオ 3：同一パスの高頻度クエリ（CompilePath 最適化）

`PreParse` が最適化するのは「同じ JSON への複数回クエリ」です。シナリオが「**同一パス**を大量の異なる JSON に対して繰り返し実行する」場合は、`CompilePath` でパスをプリコンパイルします——パスの解析と検証は 1 回だけ行われ、以降のクエリは直接ナビゲーションします：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// パスは 1 回だけコンパイル（解析 + 検証）
	compiled, err := p.CompilePath("user.name")
	if err != nil {
		panic(err)
	}
	defer compiled.Release() // オブジェクトプールに返却

	// ホットパスで繰り返しクエリ：パス解析をスキップし、ナビゲーションのみ
	for _, data := range []string{
		`{"user":{"name":"Alice"}}`,
		`{"user":{"name":"Bob"}}`,
	} {
		val, err := p.GetCompiled(data, compiled)
		if err != nil {
			panic(err)
		}
		fmt.Println(val)
	}
	// 出力:
	// Alice
	// Bob
}
```

::: tip 2 つの最適化の分担
| 最適化 | 省けるオーバーヘッド | 適したシナリオ |
|------|-----------|----------|
| `PreParse` + `GetFromParsed` | JSON ドキュメントの重複解析 | 同じ JSON に複数の異なるパスをクエリ |
| `CompilePath` + `GetCompiled` | パス式の重複解析 | 同一パスを複数の JSON に適用（ホットパス） |

両者は独立した最適化の次元で、ボトルネックに応じて選択します。なお `GetCompiled` には現在クエリのバリアントのみがあり、`Set`/`Delete` はプリコンパイルパスに未対応です。事前解析側の変更は `SetFromParsed` を使えます。
:::

### シナリオ 4：フックと監査

ログ記録、パフォーマンス監視、入力検証が必要な場合、Processor はフックシステムをサポートします：

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

// ログフックを追加
p.AddHook(json.LoggingHook(slog.Default()))
// 計時フックを追加
p.AddHook(json.TimingHook(&metricsRecorder))

// すべての操作が自動的にフックを発火
result, err := p.Set(data, "user.name", "Alice")
```

詳しくは [Hook フックシステム](../extensions/hooks)を参照してください。

### シナリオ 5：複数 goroutine での Processor 共有

`Processor` は並行安全です——正しいやり方は**1 回作成して全体で共有し、最後に 1 回 Close** することです。リクエストごとに作るのではありません（後者は作成オーバーヘッドが増えるだけでなく、リソース管理コストも膨らみます）：

```go
package main

import (
	"fmt"
	"sync"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close() // すべての goroutine 終了後に実行

	data := `{"user":{"name":"Alice","age":30}}`

	var wg sync.WaitGroup
	for i := 1; i <= 8; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			name := p.GetString(data, "user.name")
			age := p.GetInt(data, "user.age")
			fmt.Printf("goroutine %d: %s (%d)\n", i, name, age)
		}(i)
	}
	wg.Wait()

	stats := p.GetStats()
	fmt.Println("累積操作回数:", stats.OperationCount)
}

// 出力（goroutine の順序は不定）:
// goroutine 5: Alice (30)
// goroutine 2: Alice (30)
// ...
// 累積操作回数: 16
```

::: tip MaxConcurrency はソフト制限
デフォルトは `MaxConcurrency = 50` です：進行中の操作数がこの値を超えると、新しい操作は待ち行列に入らず**即座に失敗**し `ErrConcurrencyLimit` を返します。高並行サービスでは必要に応じてこの値を引き上げるか、呼び出し側でレート制限とリトライを行ってください。
:::

### シナリオ 6：グローバルな統一設定

パッケージレベル関数の背後には**グローバルプロセッサ**がいます。アプリケーション全体——引数渡しを改造できない古いコードも含めて——を同じ設定で統一したい場合は、`SetGlobalProcessor` で一度置き換えるだけで、`json.Get`/`json.Marshal` などのパッケージレベル呼び出しがすべて即座に反映されます。完全なサンプルと注意点は下記の[グローバルプロセッサ](#グローバルプロセッサ)の節を参照してください。

## ライフサイクル管理

Processor はリソース（キャッシュ、goroutine）を保持するため、使用後は**必ずクローズ**します：

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close() // 確実にリソースを解放

// Processor を使用...
result, err := p.GetString(data, "name")
```

::: warning Close 忘れの影響
- キャッシュメモリが解放されない
- バックグラウンド goroutine のリーク
- 高並行シナリオでリソース枯渇を招く可能性
:::

### 状態確認

```go
if p.IsClosed() {
    // Processor はクローズ済み、使用不可
}
```

`IsClosed` は 2 つの状態で `true` を返します：完全にクローズ済み、またはクローズ中（排出待ち期間）/クローズタイムアウト。どちらの状態でも新しい操作は拒否されてエラーを返すため、「まだ使えるか」の唯一の判断基準として扱って問題ありません。

## 監視と診断

Processor は実行統計とヘルスチェックを内蔵しており、サービス監視への組み込みに適します：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	_, _ = p.Get(`{"user":{"name":"Alice"}}`, "user.name")

	// 実行統計：操作回数、エラー数、キャッシュヒット率とメモリ使用量
	stats := p.GetStats()
	fmt.Printf("操作回数=%d エラー数=%d ヒット率=%.2f キャッシュエントリ=%d\n",
		stats.OperationCount, stats.ErrorCount, stats.HitRatio, stats.CacheSize)

	// ヘルスチェック：キャッシュ、メモリなどの項目別チェック結果
	health := p.GetHealthStatus()
	fmt.Println("ヘルス:", health.Healthy)
	for name, check := range health.Checks {
		fmt.Printf("  %s: %s\n", name, check.Message)
	}

	// 現在の設定を読み取り（コピーを返すため、変更しても Processor に影響しない）
	cfg := p.GetConfig()
	fmt.Println("キャッシュ有効:", cfg.EnableCache)
}
```

::: tip パッケージレベル版
グローバルプロセッサにもパッケージレベルの監視入口があります：`json.GetStats()` と `json.GetHealthStatus()` で、Processor の参照を持たないコードでのグローバル診断に適します。キャッシュ統計と `ClearCache`/`WarmupCache` の完全な使い方は[高度なキャッシュ戦略](../advanced/caching)を参照してください。
:::

## グローバルプロセッサ

パッケージレベル関数（`Get`、`Set`、`Marshal` など）は内部で**グローバルプロセッサ**を使用します。これを置き換えることもできます：

```go
// カスタム設定のプロセッサを作成
cfg := json.SecurityConfig()
p, err := json.New(cfg)
if err != nil {
    panic(err)
}

// グローバルプロセッサとして設定
json.SetGlobalProcessor(p)

// 以降、すべてのパッケージレベル関数がセキュリティ設定を使用
val := json.GetString(data, "name")

// アプリケーション終了時にクリーンアップ
defer json.ShutdownGlobalProcessor()
```

動作の詳細：

- `SetGlobalProcessor` はスレッドセーフで、`nil` を渡すと no-op。置き換え時には**古いプロセッサが自動的にクローズ**されます
- `ShutdownGlobalProcessor` は完全な終了クリーンアップです：グローバルプロセッサを閉じるほか、「設定ごとにキャッシュ」されたプロセッサも閉じ、グローバルのパス/エンコードキャッシュも空にします。以降パッケージレベル関数を呼び出すと、新しいデフォルトプロセッサが自動作成されます
- `cfg` を渡すパッケージレベル関数（`json.Get(data, path, json.SecurityConfig())` など）は**設定ごとのキャッシュ**されたプロセッサを使用し、グローバルプロセッサは経由しません——2 つの機構は並行して動き、相互に影響しません

::: tip 適したシナリオ
- グローバルなセキュリティポリシーの統一
- カスタムエンコーダの全体適用
- あちこちに Config を渡さずにデフォルト設定を置き換えたい
:::

## 選択ディシジョンツリー

```
JSON を操作する必要がある？
├── たまに使う、スクリプトツール
│   └── → パッケージ関数 json.GetString / json.Set / json.Marshal
├── たまに使うが、セキュリティ/エンコード設定が必要
│   └── → パッケージ関数 + 末尾 cfg：json.Get(data, path, json.SecurityConfig())
├── 高頻度で使う、またはフックなどのプロセッサ機能が必要
│   └── → Processor json.New(cfg)
├── 同じ JSON に複数回クエリ
│   └── → Processor + PreParse
├── 同一パスを大量の JSON に適用（ホットパス）
│   └── → Processor + CompilePath
├── 複数 goroutine で並行処理
│   └── → 1 つの Processor を共有（並行安全）。リクエストごとに新規作成しない
├── 監査/監視/ログが必要
│   └── → Processor + AddHook
├── 実行時メトリクス/ヘルスチェックが必要
│   └── → GetStats / GetHealthStatus（Processor メソッドとパッケージ関数のどちらでも）
└── グローバルな統一設定
    └── → SetGlobalProcessor
```

## 次のステップ

- [パス式の構文](./path-syntax) — パスクエリの完全な構文
- [Processor API](../api-reference/processor/) — 完全なメソッドリファレンス
- [パフォーマンス最適化](../advanced/performance) — パフォーマンスチューニングの深掘り
- [チートシート](./cheatsheet) — API クイックリファレンス
