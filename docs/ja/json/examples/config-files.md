---
sidebar_label: "設定ファイル処理"
title: "設定ファイル処理 - CyberGo JSON | 読込・変更・マージ"
description: "CyberGo JSON で設定ファイルを実戦処理: LoadFromFile 読込、GetString/GetInt ネスト値取得、Set/SetCreate 変更、SaveToFile 保存、MergeJSON でデフォルトとユーザー設定をマージ。"
sidebar_position: 3
---

# 設定ファイル処理

このドキュメントでは、CyberGo JSON を使って典型的な設定ファイルシナリオを処理する方法を示します: 読込、ネスト値の取得、変更、保存、デフォルト設定とユーザー設定のマージ。

## 設定ファイルの完全なライフサイクル

設定読込 → ネスト値の取得 → 変更 → ファイルへ保存 → 再読込して検証。例は単独実行できるよう一時ファイルを使用します。

```go
package main

import (
    "fmt"
    "os"
    "path/filepath"

    "github.com/cybergodev/json"
)

func main() {
    // 例が単独実行できるよう一時ディレクトリを使用
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
    fmt.Printf("サーバー: %s:%d\n", json.GetString(data, "server.host"), json.GetInt(data, "server.port"))
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

実際のアプリでは、組み込みのデフォルト値にユーザー設定を上書きし、欠落したネストパスを補完することがよくあります。`MergeJSON` は**ディープマージ**を実行し（ユーザー値が優先）、`SetCreate` は存在しない中間パスを自動生成します。

```go
package main

import (
    "fmt"

    "github.com/cybergodev/json"
)

func main() {
    // 組み込みデフォルト設定
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

    // SetCreate で存在しないネストパスを追加（中間オブジェクトを自動生成）
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
`MergeJSON` はディープな再帰マージを行います: オブジェクトキーは階層ごとにマージされ、配列とスカラー値は直接置換されます。複数の設定ソースを一度にマージするには `MergeMany([]string{...})` を使います。
:::

## 次のステップ

- [基本サンプル](./index) — パスクエリ、変更、構造体エンコードの基本
- [チートシート](../getting-started/cheatsheet) — クイック API リファレンス
- [パス文法](../getting-started/path-syntax) — 完全なパス文法（スライス、ワイルドカード）
- [ヘルパー関数](../api-reference/helpers) — `MergeJSON`、`CompareJSON` などのユーティリティ
