---
sidebar_label: "キャッシュと事前解析"
title: "キャッシュと事前解析 - CyberGo JSON | キャッシュ戦略"
description: "CyberGo JSON キャッシュと事前解析：EnableCache の自動キャッシュ、GetStats のヒット率監視、WarmupCache ウォームアップ、PreParse で複数回クエリ、CacheSharedResults ゼロコピー、ClearCache クリア、高頻度クエリの選定判断も解説。"
sidebar_position: 3
---

# キャッシュと事前解析戦略

CyberGo JSON は**自動キャッシュサブシステム**を内蔵しています：解析結果とパスクエリ結果は自動的にキャッシュされ、`sync.Map` を手書きする必要はありません。本ページは内蔵キャッシュの設定、監視、ウォームアップ、PreParse 事前解析パターンに焦点を当て、選定判断も提示します。

:::tip パフォーマンス最適化ページとの分担
[パフォーマンス最適化](./performance)の「キャッシュ戦略」の節で示しているのは**ユーザー自作**の `sync.Map` キャッシュです。本ページが文書化するのは**ライブラリ内蔵**キャッシュ（`EnableCache`/`WarmupCache`/`PreParse`）で、両者は補完関係にあります。
:::

## 内蔵キャッシュの動作

`Config.EnableCache` が `true`（デフォルト）で `CacheResults` が `true`（デフォルト）の場合、`Get` などのクエリ操作は自動的にキャッシュされます：

1. **解析キャッシュ**：JSON 文字列 → 解析済み `any` ツリー（FNV-1a ハッシュをキーにする）
2. **結果キャッシュ**：`(JSON, path)` → クエリ結果

同じ JSON の 2 回目のクエリは解析をスキップして直接パスナビゲーションし、同じ `(JSON, path)` の組み合わせはキャッシュ結果を直接返します。

:::warning 書き込み操作の自動失効
`Set`/`Delete` などの変更操作は、関連するキャッシュエントリを**自動的に失効**させます（JSON ハッシュのプレフィックス単位で一括クリア）。手動介入は不要です。手動の `ClearCache` が必要なのは、外部データソースが変化した場合や、メモリ圧力が大きい場合だけです。
:::

## キャッシュヒット率の監視

`GetStats()` は `Stats` を返し、ヒット回数、ミス回数、ヒット率、現在のエントリ数を含みます。初回クエリはミス（解析キャッシュと結果キャッシュでそれぞれ 1 回の miss を記録）、同じ `(JSON, path)` の再クエリはヒットします：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	data := `{"user":{"name":"Alice","email":"alice@example.com"},"version":1}`

	// 初回クエリ：結果も解析も未ヒット
	_, err = processor.Get(data, "user.name")
	if err != nil {
		panic(err)
	}

	// 同じ (JSON, path) を再クエリ：結果キャッシュが直接ヒット
	_, err = processor.Get(data, "user.name")
	if err != nil {
		panic(err)
	}

	stats := processor.GetStats()
	fmt.Printf("ヒット %d 回、ミス %d 回（ヒット率 %.1f%%）\n",
		stats.HitCount, stats.MissCount, stats.HitRatio*100)
	// 出力: ヒット 1 回、ミス 2 回（ヒット率 33.3%）

	fmt.Printf("キャッシュ有効：%v、TTL：%v\n", stats.CacheEnabled, stats.CacheTTL)
	// 出力: キャッシュ有効：true、TTL：5m0s
}
```

`Stats` の主要フィールド（完全な構造は[ライフサイクルと統計](../api-reference/processor/lifecycle#統計情報)を参照）：

| フィールド | 説明 |
|------|------|
| `HitRatio` | ヒット率（0–1）。0.5 未満の場合はワークロードの確認やパラメータ調整を推奨 |
| `HitCount` / `MissCount` | 累積ヒット / ミス回数 |
| `CacheSize` | 現在のキャッシュエントリ数 |
| `CacheTTL` | キャッシュ有効期限 |

## キャッシュのウォームアップ WarmupCache

`WarmupCache(jsonStr, paths, cfg...)` は実際のクエリの前にキャッシュを一括投入し、最初のリクエスト群の「コールドスタート」遅延を解消します。サービス起動後すぐにトラフィックを受けるシナリオに適します。

```go
// シグネチャ: func (p *Processor) WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)
```

`WarmupResult` は `TotalPaths`/`Successful`/`Failed`/`SuccessRate`/`FailedPaths` を含み、ウォームアップが完全か検証できます（設定ファイル内のパスのタイポは `FailedPaths` に現れます）。

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	data := `{"db":{"host":"db.local","port":5432},"cache":{"ttl":300}}`

	// サービス起動時に高頻度パスをウォームアップ（内部で各パスに 1 回 Get を実行しキャッシュに書き込む）
	hotPaths := []string{"db.host", "db.port", "cache.ttl"}
	result, err := processor.WarmupCache(data, hotPaths)
	if err != nil {
		panic(err)
	}
	fmt.Printf("ウォームアップ：%d/%d 成功（成功率 %.0f%%）\n",
		result.Successful, result.TotalPaths, result.SuccessRate)
	// 出力: ウォームアップ：3/3 成功（成功率 100%）

	// ウォームアップ完了後、最初の業務クエリが即ヒット（最初のパス解析はミス、以降のパスは解析キャッシュを共有）
	_, err = processor.Get(data, "db.host")
	if err != nil {
		panic(err)
	}
	stats := processor.GetStats()
	fmt.Printf("ヒット %d 回 / ミス %d 回\n", stats.HitCount, stats.MissCount)
	// 出力: ヒット 3 回 / ミス 4 回
}
```

:::warning 前提条件
`EnableCache` が `false` の場合、`WarmupCache` はエラーを返します（キャッシュ無効ではウォームアップできない）。ウォームアップは**同じ Processor インスタンス**上で行う必要があります——パッケージレベル関数（`json.GetString` など）が使うのはグローバル Processor で、カスタムインスタンスのキャッシュとは相互に隔離されています。
:::

## PreParse 事前解析パターン

**同じ JSON に複数の異なるパスをクエリする**必要がある場合、`PreParse` + `GetFromParsed` が最も直接的なパターンです：1 回解析し、複数回のクエリが解析結果を共有し、キャッシュキー検索を完全に回避します。

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	data := `{"users":[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}],"total":2}`

	// 1 回解析、複数回クエリ（重複解析のオーバーヘッドをスキップ）
	parsed, err := processor.PreParse(data)
	if err != nil {
		panic(err)
	}
	defer parsed.Release()

	// 複数のパスが同じ解析結果を共有
	for _, path := range []string{"users[0].name", "users[1].name", "total"} {
		val, err := processor.GetFromParsed(parsed, path)
		if err != nil {
			panic(err)
		}
		fmt.Printf("%s = %v\n", path, val)
	}
	// 出力:
	// users[0].name = Alice
	// users[1].name = Bob
	// total = 2
}
```

主要 API：

| API | シグネチャ | 説明 |
|-----|------|------|
| `PreParse` | `func (p *Processor) PreParse(jsonStr string, cfg ...Config) (*ParsedJSON, error)` | 解析して再利用可能な `*ParsedJSON` を返す |
| `GetFromParsed` | `func (p *Processor) GetFromParsed(parsed *ParsedJSON, path string, cfg ...Config) (any, error)` | 事前解析結果からクエリし、解析ステップをスキップ |
| `(*ParsedJSON).Release` | `func (p *ParsedJSON) Release()` | 参照を解放。使い終わったら呼ぶ（通常は `defer`） |

:::tip PreParse vs 自動キャッシュ
`PreParse` は解析結果のハンドルを明示的に保持し、「1 か所で解析、複数か所で消費」するローカルフローに適します。自動キャッシュは**JSON 内容単位でグローバルに**重複排除し、同じ JSON が異なる呼び出し点で繰り返しクエリされる場合に適します。両者は共存可能です：`PreParse` の内部も解析キャッシュに書き込みます。
:::

## キャッシュ設定のチューニング

キャッシュ動作は `Config` のいくつかのフィールドで制御されます（完全なフィールドは [Config](../api-reference/config#config-構造体)を参照）：

| フィールド | デフォルト値 | 説明 |
|------|--------|------|
| `EnableCache` | `true` | 総スイッチ。オフにするとすべてのキャッシュロジックがスキップされる（`Get` はファストパスを通る） |
| `CacheResults` | `true` | クエリ結果をキャッシュするか。`false` の場合は解析キャッシュのみ保持 |
| `CacheTTL` | `5 分` | エントリの有効期限 |
| `MaxCacheSize` | `128` | 最大エントリ数（LRU で退避） |
| `CacheSharedResults` | `false` | キャッシュ結果を共有し、防御的ディープコピーをスキップ（高性能読み取り専用シナリオ） |

```go
package main

import (
	"fmt"
	"time"

	"github.com/cybergodev/json"
)

func main() {
	cfg := json.DefaultConfig()
	cfg.MaxCacheSize = 256          // より多くのホットデータを収容
	cfg.CacheTTL = 10 * time.Minute // 有効期限を延長

	processor, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	data := `{"key":"value"}`
	_, err = processor.Get(data, "key")
	if err != nil {
		panic(err)
	}
	fmt.Println("クエリ完了")
	// 出力: クエリ完了
}
```

読み取り多く書き込み少なく、結果が読み取り専用のシナリオでは、ゼロコピースイッチをさらに重ねられます：

```go
// 契約：有効化後、呼び出し側は Get が返す map/slice を変更してはならない（プリミティブ値は常に安全）
cfg := json.DefaultConfig()
cfg.CacheSharedResults = true
```

### CacheSharedResults ゼロコピーコントラクト

`CacheSharedResults = true` の場合、キャッシュヒットした `Get`/`GetFromParsed` は**キャッシュ値を直接返し**、防御的ディープコピーをスキップするため、大型オブジェクトの反復読み取りのオーバーヘッドを大幅に削減します。

:::danger 読み取り専用コントラクト
有効化後、呼び出し側は返された `map[string]any` / `[]any` を**変更してはなりません**。そうしないと共有キャッシュが破壊され、後続の読み取りが汚染されます。プリミティブ値（`bool`/`float64`/`string`/`json.Number`/`nil`）はイミュータブルで常に安全です。呼び出し側が結果を読み取り専用とみなせる場合のみ有効化してください（同じ大型サブツリーを繰り返し読む分析負荷など）。
:::

## クリアと失効

| 操作 | API | トリガータイミング |
|------|-----|----------|
| 手動クリア | `processor.ClearCache()` | データソース変化、メモリ圧力大、強制リフレッシュが必要 |
| 書き込み後の自動失効 | `Set`/`Delete` の内部呼び出し | 変更後の手動クリアは不要。キャッシュは JSON ハッシュプレフィックス単位で自動クリア |

`ClearCache` は「同じ Processor の長期運用、データソースの交代」というシナリオに適します。単発スクリプトで手動クリアは不要です——`Close()` がすべてのリソースを回収します。

## 実践レシピ：高頻度クエリのキャッシュ最適化

以下のパターンはウォームアップ、PreParse、監視を組み合わせたもので、API ゲートウェイ / 設定センターなどの高頻度読み取りシナリオに適します。

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	configJSON := `{"db":{"host":"db.local","port":5432},"cache":{"ttl":300},"features":["audit","metrics"]}`

	// 1. 起動時に高頻度パスをウォームアップ
	hotPaths := []string{"db.host", "db.port", "cache.ttl"}
	if _, err := processor.WarmupCache(configJSON, hotPaths); err != nil {
		panic(err)
	}

	// 2. 同じ設定へバッチフィールド抽出（PreParse パターン）
	parsed, err := processor.PreParse(configJSON)
	if err != nil {
		panic(err)
	}
	defer parsed.Release()

	host, err := processor.GetFromParsed(parsed, "db.host")
	if err != nil {
		panic(err)
	}
	fmt.Printf("データベースホスト：%v\n", host)
	// 出力: データベースホスト：db.local

	// 3. 業務クエリが継続的にヒット（ウォームアップと事前解析がキャッシュを充填済み）
	for _, path := range []string{"db.host", "db.port", "cache.ttl"} {
		_, err = processor.Get(configJSON, path)
		if err != nil {
			panic(err)
		}
	}

	// 4. 運用中はヒット率を監視し、しきい値未満ならアラート
	stats := processor.GetStats()
	fmt.Printf("ヒット %d / ミス %d（ヒット率 %.1f%%）\n",
		stats.HitCount, stats.MissCount, stats.HitRatio*100)
	// 出力: ヒット 6 / ミス 4（ヒット率 60.0%）
	if stats.HitRatio < 0.5 {
		fmt.Println("アラート：ヒット率が 50% 未満。ワークロードを確認するか CacheTTL/MaxCacheSize を調整してください")
	}

	// 5. 設定交代（データソース変化）時は手動クリアし、古い値の読み取りを回避
	processor.ClearCache()
	stats = processor.GetStats()
	fmt.Printf("クリア後のキャッシュエントリ：%d\n", stats.CacheSize)
	// 出力: クリア後のキャッシュエントリ：0
}
```

## 選定判断

| シナリオ | 推奨案 | 理由 |
|------|----------|------|
| 単発クエリ / スクリプト | デフォルト設定のままでよい | 内蔵キャッシュは単発呼び出しに負担なし。`Get` にはファストパスがある |
| 同じ JSON を反復クエリ（異なる呼び出し点） | `EnableCache=true` を維持 | JSON 内容で自動重複排除、コード変更ゼロ |
| 同じ JSON を 1 回解析、そのバッチで複数パスクエリ | `PreParse` + `GetFromParsed` | 解析結果を明示再利用し、キャッシュキーのオーバーヘッドを回避 |
| サービス起動後すぐにトラフィックを受ける | `WarmupCache` でウォームアップ | 初回リクエスト群のコールドスタート遅延を解消 |
| 同じ大型読み取り専用サブツリーを反復読み取り | `CacheSharedResults=true` | ディープコピーをスキップし、ゼロコピー性能を得る |
| 信頼できない入力 / セキュリティセンシティブ | `SecurityConfig()`（短めの TTL） | セキュリティ設定は保守的なキャッシュパラメータがデフォルト |

## 関連

- [パフォーマンス最適化](./performance) — プロセッサ再利用、メモリ最適化、ベンチマーク
- [ライフサイクルと統計](../api-reference/processor/lifecycle#統計情報) — `GetStats`/`WarmupCache`/`ClearCache` API 詳細
- [Config 設定](../api-reference/config) — キャッシュ関連フィールドの完全な説明
- [並行・並列処理](./concurrency) — Processor のスレッド安全性と並列イテレータ
