---
sidebar_label: "キャッシュと事前パース"
title: "キャッシュと事前パース - CyberGo JSON | キャッシュ戦略"
description: "CyberGo JSON 内蔵キャッシュと事前パース戦略：EnableCache 自動キャッシュ、GetStats ヒット率監視、WarmupCache ウォームアップ、PreParse 1回パース複数回参照、ClearCache で高頻度クエリを最適化。"
sidebar_position: 3
---

# キャッシュと事前パース戦略

CyberGo JSON は**自動キャッシュサブシステム**を内蔵しています。パース結果とパスクエリ結果が自動的にキャッシュされるため、手作りの `sync.Map` は不要です。このページでは内蔵キャッシュの設定・監視・ウォームアップ、`PreParse` 事前パースパターン、選択ガイドを扱います。

:::tip ヒント パフォーマンスページとの役割分担
[パフォーマンス最適化](./performance)の「キャッシュ戦略」節は**ユーザー自作**の `sync.Map` キャッシュを示します。このページは**ライブラリ内蔵**キャッシュ（`EnableCache`/`WarmupCache`/`PreParse`）を文書化し、両ページは相補的です。
:::

## 内蔵キャッシュの仕組み

`Config.EnableCache` が `true`（既定）かつ `CacheResults` が `true`（既定）のとき、`Get` などのクエリ操作が自動的にキャッシュされます:

1. **パースキャッシュ**: JSON 文字列 -> パースされた `any` ツリー（FNV-1a ハッシュをキーに使用）
2. **結果キャッシュ**: `(JSON, path)` -> クエリ結果

同じ JSON への 2 回目のクエリはパースをスキップしてパスナビゲーションに進み、同一の `(JSON, path)` の組はキャッシュ結果を直接返します。

:::warning 警告 書き込み時の自動無効化
`Set`/`Delete` などの変更操作は関連キャッシュエントリを**自動的に無効化**します（JSON ハッシュのプレフィックスで一括削除）。手動操作は不要です。外部データソースが変化した場合やメモリ圧力が大きいときだけ `ClearCache` を呼び出します。
:::

## キャッシュヒット率のモニタリング

`GetStats()` はヒット/ミス回数、ヒット率、現在のエントリ数を含む `Stats` を返します。

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

	// よく使うパスをウォームアップ: 内部的に各パスで Get を1回実行してキャッシュに保存
	paths := []string{"user.name", "user.email", "version"}
	result, err := processor.WarmupCache(data, paths)
	if err != nil {
		panic(err)
	}
	fmt.Printf("ウォームアップ成功: %d/%d (成功率 %.0f%%)\n", result.Successful, result.TotalPaths, result.SuccessRate)
	// 出力: ウォームアップ成功: 3/3 (成功率 100%)

	// 同一 (JSON, path) のクエリがキャッシュにヒット
	name, err := processor.Get(data, "user.name")
	if err != nil {
		panic(err)
	}
	fmt.Printf("user.name = %v\n", name)
	// 出力: user.name = Alice

	// キャッシュ設定と状態を確認
	stats := processor.GetStats()
	fmt.Printf("キャッシュ有効: %v, TTL: %v\n", stats.CacheEnabled, stats.CacheTTL)
	// 出力: キャッシュ有効: true, TTL: 5m0s
}
```

主な `Stats` フィールド（完全な構造は[ライフサイクルと統計](../api-reference/processor/lifecycle#統計情報)を参照）:

| フィールド | 説明 |
|------|------|
| `HitRatio` | ヒット率（0–1）。0.5 未満はワークロードやチューニングの見直し推奨 |
| `HitCount` / `MissCount` | 累積ヒット / ミス回数 |
| `CacheSize` | 現在のキャッシュエントリ数 |
| `CacheTTL` | キャッシュエントリの有効期限 |

## WarmupCache でキャッシュをウォームアップ

`WarmupCache(jsonStr, paths, cfg...)` は実際のクエリより前にキャッシュを一括投入し、初回リクエストのコールドスタート遅延を排除します。起動直後にトラフィックを処理するサービスに適しています。

```go
// シグネチャ: func (p *Processor) WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)
```

`WarmupResult` は `TotalPaths`/`Successful`/`Failed`/`SuccessRate`/`FailedPaths` を含み、ウォームアップの完全性検証に役立ちます（設定ファイルのパスのタイプミスは `FailedPaths` として現れます）。

:::warning 警告 前提条件
`EnableCache` が `false` のとき `WarmupCache` を呼ぶとエラーを返します（無効化されたキャッシュはウォームアップ不可）。ウォームアップは**同じ Processor インスタンス**で行う必要があります。パッケージレベル関数（例: `json.GetString`）はグローバル Processor を使用し、カスタムインスタンスのキャッシュとは隔離されています。
:::

## PreParse 事前パースパターン

**同じ JSON を複数パスでクエリ**する場合、`PreParse` + `GetFromParsed` が最も直接的なパターンです。一度パースし、パース結果を複数回クエリして、キャッシュキー検索を完全にバイパスします。

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

	// 一度パース、複数回クエリ（繰り返しパースをスキップ）
	parsed, err := processor.PreParse(data)
	if err != nil {
		panic(err)
	}
	defer parsed.Release()

	// 複数パスが同じパース結果を共有
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

主な API:

| API | シグネチャ | 説明 |
|-----|------|------|
| `PreParse` | `func (p *Processor) PreParse(jsonStr string, cfg ...Config) (*ParsedJSON, error)` | パースして再利用可能な `*ParsedJSON` を返す |
| `GetFromParsed` | `func (p *Processor) GetFromParsed(parsed *ParsedJSON, path string, cfg ...Config) (any, error)` | 事前パース結果からクエリ、パースステップをスキップ |
| `(*ParsedJSON).Release` | `func (p *ParsedJSON) Release()` | 参照を解放、使い終わったら呼ぶ（通常 `defer`） |

:::tip ヒント PreParse vs 自動キャッシュ
`PreParse` はパース結果のハンドルを明示的に保持し、「1箇所でパース、複数箇所で消費」するローカルフローに適しています。自動キャッシュは **JSON コンテンツ基準でグローバルに重複排除**し、同じ JSON が複数の呼び出し箇所で繰り返しクエリされる場合に適しています。両者は共存します。`PreParse` は内部的にパースキャッシュにも書き込みます。
:::

## キャッシュ設定のチューニング

キャッシュの挙動は複数の `Config` フィールドで制御されます（完全なリストは[Config](../api-reference/config#config-構造体)を参照）:

| フィールド | 既定値 | 説明 |
|------|--------|------|
| `EnableCache` | `true` | マスタースイッチ。オフ時はすべてのキャッシュがスキップ（`Get` は高速パスを使用） |
| `CacheResults` | `true` | クエリ結果をキャッシュするか。`false` はパースキャッシュのみ保持 |
| `CacheTTL` | `5分` | エントリの有効期限 |
| `MaxCacheSize` | `128` | 最大エントリ数（LRU で削除） |
| `CacheSharedResults` | `false` | キャッシュ結果を共有、防御的ディープコピーをスキップ（高性能読み取り専用） |

```go
package main

import (
	"fmt"
	"time"

	"github.com/cybergodev/json"
)

func main() {
	cfg := json.DefaultConfig()
	cfg.MaxCacheSize = 256            // より多くのホットデータを保持
	cfg.CacheTTL = 10 * time.Minute   // 有効期間を延長

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

### CacheSharedResults ゼロコピーコントラクト

`CacheSharedResults = true` のとき、キャッシュヒット時に `Get`/`GetFromParsed` がキャッシュ値を**直接返し**、防御的ディープコピーをスキップして大きなオブジェクトの繰り返し読み込みオーバーヘッドを大幅に削減します。

:::danger 危険 読み取り専用コントラクト
有効時、呼び出し元は返された `map[string]any` / `[]any` を**変更してはいけません**。さもなくば共有キャッシュが破損し後続の読み込みが汚染されます。プリミティブ（`bool`/`float64`/`string`/`json.Number`/`nil`）は不変で常に安全です。呼び出し元が結果を読み取り専用として扱う場合のみ有効化してください（例: 同じ大きなサブツリーを繰り返し読む分析ワークロード）。
:::

## クリーンアップと無効化

| 操作 | API | タイミング |
|------|-----|----------|
| 手動クリア | `processor.ClearCache()` | データソース変更、メモリ圧力、強制リフレッシュ |
| 書き込み後の自動無効化 | `Set`/`Delete` の内部呼び出し | 変更後の手動クリーンアップ不要。JSON ハッシュプレフィックスで自動削除 |

`ClearCache` は「1つの Processor が長期実行されデータソースが入れ替わる」シナリオに適しています。単発スクリプトは手動クリア不要です。`Close()` がすべてのリソースを回収します。

## レシピ: 高頻度クエリのキャッシュ

このレシピはウォームアップ、PreParse、モニタリングを組み合わせます。高読み取りボリュームの API ゲートウェイ / 設定センターに適しています。

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

	// 1. 起動時にホットパスをウォームアップ
	hotPaths := []string{"db.host", "db.port", "cache.ttl"}
	if _, err := processor.WarmupCache(configJSON, hotPaths); err != nil {
		panic(err)
	}

	// 2. 同じ設定から複数フィールドを抽出（PreParse パターン）
	parsed, err := processor.PreParse(configJSON)
	if err != nil {
		panic(err)
	}
	defer parsed.Release()

	host, err := processor.GetFromParsed(parsed, "db.host")
	if err != nil {
		panic(err)
	}
	fmt.Printf("DB ホスト: %v\n", host)
	// 出力: DB ホスト: db.local

	// 3. ランタイムでヒット率をモニタリング、閾値未満は警告
	stats := processor.GetStats()
	fmt.Printf("現在のヒット率: %.2f%%\n", stats.HitRatio*100)
}
```

## 選択ガイド

| シナリオ | 推奨 | 理由 |
|------|----------|------|
| 単発クエリ / スクリプト | 既定の設定 | 内蔵キャッシュは単一呼び出しに負担をかけない。`Get` は高速パスを持つ |
| 同じ JSON を繰り返しクエリ（異なる呼び出し箇所） | `EnableCache=true` を維持 | JSON コンテンツで自動重複排除、コード変更なし |
| 1つの JSON を一度パース、バッチで複数パスをクエリ | `PreParse` + `GetFromParsed` | パース結果を明示的に再利用、キャッシュキーコストをバイパス |
| 起動直後にトラフィックを処理するサービス | `WarmupCache` ウォームアップ | 初回バッチのコールドスタート遅延を排除 |
| 同じ大きな読み取り専用サブツリーを繰り返し読む | `CacheSharedResults=true` | ディープコピーをスキップしゼロコピー性能 |
| 信頼できない入力 / セキュリティ敏感 | `SecurityConfig()`（短い TTL） | セキュリティプリセットは保守的なキャッシュパラメータを使用 |

## 関連

- [パフォーマンス最適化](./performance) — Processor 再利用、メモリ最適化、ベンチマーク
- [ライフサイクルと統計](../api-reference/processor/lifecycle#統計情報) — `GetStats`/`WarmupCache`/`ClearCache` API 詳細
- [Config 設定](../api-reference/config) — キャッシュ関連フィールドの完全参照
- [並行性と並列処理](./concurrency) — Processor スレッド安全性と並列イテレータ
