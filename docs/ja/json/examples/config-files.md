---
sidebar_label: "設定ファイル処理"
title: "設定ファイル処理 - CyberGo JSON | 読込・変更・マージ"
description: "CyberGo JSON で設定ファイルを実践処理：LoadFromFile 読込、GetString/GetInt ネスト値取得、Set/SetCreate 変更、SaveToFile と PrettyConfig による整形保存、MergeJSON でデフォルトとユーザー設定をマージし再読込で検証。"
sidebar_position: 3
---

# 設定ファイル処理

このドキュメントでは、CyberGo JSON を使って典型的な設定ファイルシナリオを処理する方法を示します: 読込、ネスト値の取得、変更、保存、およびデフォルト設定とユーザー設定のマージ。

## 設定ファイルの完全なライフサイクル

設定の読込 → ネスト値の取得 → 変更 → ファイルへ保存 → 再読込して検証。サンプルは単独実行できるよう一時ファイルを使用します。

```go
package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/cybergodev/json"
)

func main() {
	// サンプルが単独実行できるよう一時ディレクトリを使用
	tmpDir, err := os.MkdirTemp("", "cybergo-config-*")
	if err != nil {
		panic(err)
	}
	defer os.RemoveAll(tmpDir)

	configPath := filepath.Join(tmpDir, "config.json")

	// 初期設定ファイルを書き込み
	initial := `{
        "server": {"host": "0.0.0.0", "port": 8080},
        "database": {"host": "localhost", "port": 5432, "name": "appdb"},
        "logging": {"level": "info"}
    }`
	if err := os.WriteFile(configPath, []byte(initial), 0644); err != nil {
		panic(err)
	}

	// 1. ファイルから設定を読込
	data, err := json.LoadFromFile(configPath)
	if err != nil {
		panic(err)
	}

	// 2. ネスト値を取得（オプションのデフォルト値引数をサポート）
	fmt.Printf("サーバーアドレス: %s:%d\n", json.GetString(data, "server.host"), json.GetInt(data, "server.port"))
	fmt.Printf("データベース: %s/%s\n", json.GetString(data, "database.host"), json.GetString(data, "database.name"))
	fmt.Printf("ログレベル: %s\n", json.GetString(data, "logging.level", "info"))

	// 3. 設定を変更（既存値の更新）
	data, err = json.Set(data, "server.port", 9090)
	if err != nil {
		panic(err)
	}
	data, err = json.Set(data, "logging.level", "debug")
	if err != nil {
		panic(err)
	}

	// 4. ファイルへ保存（整形出力）
	if err := json.SaveToFile(configPath, data, json.PrettyConfig()); err != nil {
		panic(err)
	}

	// 5. 再読込して変更が永続化されたことを検証
	reloaded, err := json.LoadFromFile(configPath)
	if err != nil {
		panic(err)
	}
	fmt.Printf("再起動後ポート: %d\n", json.GetInt(reloaded, "server.port"))
	fmt.Printf("再起動後ログ: %s\n", json.GetString(reloaded, "logging.level"))
}
```

## デフォルト設定とユーザー設定のマージ

実際のアプリケーションでは、組み込みのデフォルト値にユーザー設定を上書きし、欠落したネストパスを補完することがよくあります。`MergeJSON` は**ディープマージ**を実行し（ユーザー値が優先）、`SetCreate` は存在しない中間パスを自動作成します。

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	// 組み込みのデフォルト設定
	defaults := `{
        "server": {"host": "0.0.0.0", "port": 8080, "timeout": 30},
        "database": {"host": "localhost", "port": 5432, "pool": 10},
        "logging": {"level": "info", "format": "json"}
    }`

	// ユーザー設定（一部フィールドを上書き）
	userConfig := `{
        "server": {"port": 3000},
        "database": {"host": "db.prod.example.com"},
        "logging": {"level": "debug"}
    }`

	// ディープマージ: ユーザー設定がデフォルトを上書き、未上書きのデフォルトフィールドは保持
	merged, err := json.MergeJSON(defaults, userConfig)
	if err != nil {
		panic(err)
	}
	fmt.Printf("ポート: %d（ユーザー上書き）\n", json.GetInt(merged, "server.port"))
	fmt.Printf("タイムアウト: %d（デフォルト保持）\n", json.GetInt(merged, "server.timeout"))
	fmt.Printf("データベース: %s:%d\n", json.GetString(merged, "database.host"), json.GetInt(merged, "database.port"))

	// SetCreate で存在しないネストパスを追加（中間オブジェクトを自動作成）
	merged, err = json.SetCreate(merged, "features.metrics.enabled", true)
	if err != nil {
		panic(err)
	}
	merged, err = json.SetCreate(merged, "features.metrics.endpoint", "/metrics")
	if err != nil {
		panic(err)
	}

	fmt.Printf("メトリクス有効: %v\n", json.GetBool(merged, "features.metrics.enabled"))
	fmt.Printf("メトリクスエンドポイント: %s\n", json.GetString(merged, "features.metrics.endpoint"))
}

// 出力:
// ポート: 3000（ユーザー上書き）
// タイムアウト: 30（デフォルト保持）
// データベース: db.prod.example.com:5432
// メトリクス有効: true
// メトリクスエンドポイント: /metrics
```

:::tip ヒント
`MergeJSON` はディープな再帰マージです: オブジェクトキーは階層ごとにマージされ、配列とスカラー値は直接置換されます。複数の設定ソースをマージする場合は `MergeMany([]string{...})` で一括マージできます。
:::

## マージモードの選択: MergeUnion / MergeIntersection / MergeDifference

`Config.MergeMode` がマージ戦略を制御します。デフォルトは `MergeUnion`（和集合、ユーザー値がデフォルトを上書き）。残りの 2 つのモードはそれぞれ異なる設定管理の課題に対応します:

| モード | 意味 | 典型的な設定シナリオ |
|--------|------|---------------------|
| `MergeUnion`（デフォルト） | 両オブジェクトの全集合を取り、競合時はユーザー値を優先 | 通常の設定積み上げ: デフォルト値ベース + ユーザー上書き |
| `MergeIntersection` | 両側に共通するキーのみ保持（値はユーザー側） | 「ユーザーが実際に書き換えた共有設定」の抽出。多環境設定の共通部分の算出 |
| `MergeDifference` | 基準側（第 1 引数）にのみ存在するキーのみ保持 | 「まだデフォルト値のままである設定項目」の特定。監査や設定ドキュメント生成に使用 |

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	// 前節と同じデフォルト/ユーザー設定
	defaults := `{
        "server": {"host": "0.0.0.0", "port": 8080, "timeout": 30},
        "database": {"host": "localhost", "port": 5432, "pool": 10},
        "logging": {"level": "info", "format": "json"}
    }`
	user := `{
        "server": {"port": 3000},
        "database": {"host": "db.prod.example.com"},
        "logging": {"level": "debug"}
    }`

	// 積集合: 両側に現れるキーのみ保持（ネストオブジェクトは再帰的に共通部分を取り、スカラーはユーザー値）
	interCfg := json.DefaultConfig()
	interCfg.MergeMode = json.MergeIntersection
	overridden, err := json.MergeJSON(defaults, user, interCfg)
	if err != nil {
		panic(err)
	}
	fmt.Println("[積集合] ユーザーが上書きしたポート:", json.GetInt(overridden, "server.port"))
	fmt.Println("[積集合] ユーザーが上書きした DB ホスト:", json.GetString(overridden, "database.host"))
	// 出力:
	// [積集合] ユーザーが上書きしたポート: 3000
	// [積集合] ユーザーが上書きした DB ホスト: db.prod.example.com

	// 差集合: デフォルト設定のうちユーザーに上書きされていないキーのみ保持
	diffCfg := json.DefaultConfig()
	diffCfg.MergeMode = json.MergeDifference
	untouched, err := json.MergeJSON(defaults, user, diffCfg)
	if err != nil {
		panic(err)
	}
	fmt.Println("[差集合] まだデフォルト値のホスト:", json.GetString(untouched, "server.host"))
	fmt.Println("[差集合] まだデフォルト値のタイムアウト:", json.GetInt(untouched, "server.timeout"))
	fmt.Println("[差集合] まだデフォルト値の接続プール:", json.GetInt(untouched, "database.pool"))
	// 出力:
	// [差集合] まだデフォルト値のホスト: 0.0.0.0
	// [差集合] まだデフォルト値のタイムアウト: 30
	// [差集合] まだデフォルト値の接続プール: 10
}
```

:::tip ヒント
`MergeMany` も同じく `cfg.MergeMode` を参照します（左から右へ順にマージ）。和集合モードの完全な効果は前節を参照してください。2 つの非デフォルトモードはどちらも「第 1 引数を基準とする」視点です: 積集合は「何を変えたか」に答え、差集合は「何がまだ変わっていないか」に答えます。
:::

## 次のステップ

- [基本サンプル](./index) — パスクエリ、変更、構造体エンコード/デコードなどの基本用法
- [チートシート](../getting-started/cheatsheet) — API クイックリファレンス
- [パス式の構文](../getting-started/path-syntax) — 完全なパス構文（スライス、ワイルドカード付き）
- [ヘルパー関数](../api-reference/helpers) — `MergeJSON`、`CompareJSON` などのユーティリティ関数
