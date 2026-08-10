---
sidebar_label: "バッチ操作"
title: "バッチ操作関数 - CyberGo JSON | API リファレンス"
description: "CyberGo JSON バッチ操作関数：ProcessBatch で複数の JSON 操作を一度に処理し、BatchOperation 記述構造体と BatchResult 結果構造体を組み合わせます。"
sidebar_position: 7
---

# バッチ操作関数

json パッケージが提供するバッチ操作関数は、複数の JSON 操作（get/set/delete/validate）を一度に処理でき、バッチデータ処理シナリオに適しています。

## ProcessBatch

シグネチャ：`func ProcessBatch(operations []BatchOperation, cfg ...Config) ([]BatchResult, error)`

複数の JSON 操作をバッチ処理します（パッケージレベル関数、Processor の作成不要）。戻り値の結果順序は入力操作の順序と 1 対 1 で対応し、`ID` フィールドで紐付けます。

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    jsonStr := `{"user": {"name": "CyberGo", "age": 25}}`

    operations := []json.BatchOperation{
        {Type: "get", JSONStr: jsonStr, Path: "user.name", ID: "op1"},
        {Type: "set", JSONStr: jsonStr, Path: "user.age", Value: 30, ID: "op2"},
    }

    results, err := json.ProcessBatch(operations)
    if err != nil {
        panic(err)
    }
    for _, r := range results {
        if r.Error != nil {
            fmt.Printf("操作 %s 失敗: %v\n", r.ID, r.Error)
        } else {
            fmt.Printf("操作 %s 結果: %v\n", r.ID, r.Result)
        }
    }
}
// 出力：
// 操作 op1 結果: CyberGo
// 操作 op2 結果: {"user":{"age":30,"name":"CyberGo"}}
```

### 対応する操作タイプ

| `Type` | 役割 | `Result` の内容 | 典型的なエラー |
|--------|------|---------------|----------|
| `get` | パス上の値を読み取り | パスの位置の値（`any`） | `ErrPathNotFound`、`ErrInvalidJSON` |
| `set` | パスの値を設定 | **変更後の完全な JSON 文字列** | `ErrPathNotFound`（`CreatePaths` が無効な場合）、`ErrInvalidPath` |
| `delete` | パス上のノードを削除 | **削除後の完全な JSON 文字列** | `ErrPathNotFound`、`ErrInvalidPath` |
| `validate` | JSON が有効か検証 | `map[string]any{"valid": bool}` | 無効な JSON の場合 `Result.valid=false` かつ `Error` が非 nil |

::: warning 操作は相互にチェーンしません
各 `BatchOperation` はそれぞれの `JSONStr` 入力に対して**独立して**作用し、操作間でチェーン的に積み重なることは**ありません**。例えば同じドキュメントに対して先に `set` してから `delete` すると、2 つの独立した結果が得られ、「先に変更してから削除」の積み重ね状態にはなりません。単一ドキュメントに複数ステップの変換が必要な場合は、コード内で前ステップの出力を次ステップに渡すか、[`SetMultiple`](./modify#setmultiple) などの単一ドキュメント・複数パスメソッドを使ってください。
:::

### バッチサイズ制限

操作数は `Config.MaxBatchSize`（デフォルト `2000`）で制限されます。超過するとバッチ全体が即座に失敗し、`(nil, ErrSizeLimit)` を返します：

```go
// カスタム上限（超大規模バッチシナリオ向け）
cfg := json.DefaultConfig()
cfg.MaxBatchSize = 5000
results, err := json.ProcessBatch(ops, cfg)
```

## 各操作タイプの例

### get — バッチ読み取り

`get` 操作の `Result` はパスの位置の生の値です（数値はデフォルトで `float64`、ブーリアンは `bool`、文字列は `string`）。

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    data := `{"user":{"name":"CyberGo","age":25},"active":true}`

    results, err := json.ProcessBatch([]json.BatchOperation{
        {Type: "get", JSONStr: data, Path: "user.name", ID: "name"},
        {Type: "get", JSONStr: data, Path: "user.age", ID: "age"},
        {Type: "get", JSONStr: data, Path: "active", ID: "active"},
    })
    if err != nil {
        panic(err)
    }

    for _, r := range results {
        if r.Error != nil {
            fmt.Printf("%s 失敗: %v\n", r.ID, r.Error)
            continue
        }
        fmt.Printf("%s = %v\n", r.ID, r.Result)
    }
}
// 出力：
// name = CyberGo
// age = 25
// active = true
```

### set — バッチ変更

`set` 操作の `Result` は**変更後の完全な JSON 文字列**です（書き込んだ値そのものではない点に注意）。デフォルト設定は `CreatePaths=true` のため、新しいパスへの設定は自動的に中間ノードを作成します。

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    data := `{"user":{"name":"CyberGo","age":25}}`

    results, err := json.ProcessBatch([]json.BatchOperation{
        {Type: "set", JSONStr: data, Path: "user.age", Value: 30, ID: "update-age"},
        {Type: "set", JSONStr: data, Path: "user.role", Value: "admin", ID: "add-role"},
    })
    if err != nil {
        panic(err)
    }

    for _, r := range results {
        if r.Error != nil {
            fmt.Printf("%s 失敗: %v\n", r.ID, r.Error)
            continue
        }
        fmt.Printf("%s -> %s\n", r.ID, r.Result)
    }
}
// 出力：
// update-age -> {"user":{"age":30,"name":"CyberGo"}}
// add-role -> {"user":{"age":25,"name":"CyberGo","role":"admin"}}
```

::: tip 出力フォーマットの説明
`set`/`delete` が返す JSON 文字列は**コンパクトフォーマット**（余分な空白なし）で、オブジェクトキーは辞書順にソートされます（`encoding/json` の動作と一致し、出力が確定的になります）。整形出力が必要な場合は、結果に対して別途 [`Prettify`](./output#prettify) を使ってください。
:::

### delete — バッチ削除

`delete` 操作の `Result` は**削除後の完全な JSON 文字列**です。

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    data := `{"user":{"name":"CyberGo","age":25,"temp":"x"},"debug":true}`

    results, err := json.ProcessBatch([]json.BatchOperation{
        {Type: "delete", JSONStr: data, Path: "user.temp", ID: "drop-temp"},
        {Type: "delete", JSONStr: data, Path: "debug", ID: "drop-debug"},
    })
    if err != nil {
        panic(err)
    }

    for _, r := range results {
        if r.Error != nil {
            fmt.Printf("%s 失敗: %v\n", r.ID, r.Error)
            continue
        }
        fmt.Printf("%s -> %s\n", r.ID, r.Result)
    }
}
// 出力：
// drop-temp -> {"debug":true,"user":{"age":25,"name":"CyberGo"}}
// drop-debug -> {"user":{"age":25,"name":"CyberGo","temp":"x"}}
```

### validate — バッチ検証

`validate` 操作の `Result` は常に `map[string]any{"valid": bool}` です。JSON が不正な場合 `valid` は `false` で、`Error` に解析エラーが含まれます。

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    results, err := json.ProcessBatch([]json.BatchOperation{
        {Type: "validate", JSONStr: `{"name":"CyberGo"}`, ID: "ok"},
        {Type: "validate", JSONStr: `{"name":}`, ID: "broken"},
    })
    if err != nil {
        panic(err)
    }

    for _, r := range results {
        if m, ok := r.Result.(map[string]any); ok {
            fmt.Printf("%s: valid=%v\n", r.ID, m["valid"])
        }
        if r.Error != nil {
            fmt.Printf("%s エラー: %v\n", r.ID, r.Error)
        }
    }
}
// 出力：
// ok: valid=true
// broken: valid=false
// broken エラー: invalid JSON: ...
```

## エラー処理とフォールトトレランス

### 単一操作の失敗はバッチを中断しない

`ProcessBatch` は**常にすべての操作を処理します**：ある操作が失敗してもその結果の `Error` フィールドに書き込まれるだけで、後続の操作は中断されず、何ら設定を有効化する必要もありません。したがってバッチ結果は「一部成功、一部失敗」になる可能性があり、必ず `r.Error` を 1 件ずつ確認してください：

```go
results, err := json.ProcessBatch(operations)
if err != nil {
    // err はプロセッサがクローズ済み、設定が不正、MaxBatchSize 超過の場合にのみ現れる
    panic(err)
}
var failed int
for _, r := range results {
    if r.Error != nil {
        failed++
        log.Printf("操作 %s 失敗: %v", r.ID, r.Error)
        continue
    }
    // r.Result を処理...
}
```

::: tip ContinueOnError との違い
`Config.ContinueOnError` フィールドが制御するのは [`SetMultiple`](./modify#setmultiple) の途中フォールトトレランス（あるパスへの書き込み失敗時に残りのパスへの書き込みを継続するか）であり、`ProcessBatch` には**作用しません**。`ProcessBatch` の操作ごとの隔離は組み込みの動作であり、このスイッチで無効化することはできません。
:::

## 実戦シナリオ：バッチデータマイグレーション

一連のレコードにマイグレーションフラグを一括付与し、一度の `ProcessBatch` 呼び出しで全変換を完了し、各レコードの出力を収集します：

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    // データソースから読み取った複数レコードをシミュレート
    records := []string{
        `{"id":1,"name":"Alice","age":30}`,
        `{"id":2,"name":"Bob","age":25}`,
        `{"id":3,"name":"CyberGo","age":28}`,
    }

    // 各レコードに対して set 操作を生成し、マイグレーションフラグを一括付与
    ops := make([]json.BatchOperation, len(records))
    for i, r := range records {
        ops[i] = json.BatchOperation{
            Type:    "set",
            JSONStr: r,
            Path:    "migrated",
            Value:   true,
            ID:      fmt.Sprintf("record-%d", i),
        }
    }

    results, err := json.ProcessBatch(ops)
    if err != nil {
        panic(err)
    }

    for _, r := range results {
        if r.Error != nil {
            fmt.Printf("%s 失敗: %v\n", r.ID, r.Error)
            continue
        }
        fmt.Printf("%s -> %s\n", r.ID, r.Result)
    }
}
// 出力：
// record-0 -> {"age":30,"id":1,"migrated":true,"name":"Alice"}
// record-1 -> {"age":25,"id":2,"migrated":true,"name":"Bob"}
// record-2 -> {"age":28,"id":3,"migrated":true,"name":"CyberGo"}
```

## キャッシュウォームアップ WarmupCache

シグネチャ：`func WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)`

同じ JSON のホットパスを事前に評価してキャッシュに格納し、以降の初回 `Get` が直接キャッシュヒットするようにします。プロセッサのキャッシュが有効（デフォルトで有効）である必要があり、無効な場合は `ErrCacheDisabled` を返します。

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    data := `{"user":{"name":"CyberGo","age":25},"meta":{"version":2}}`

    result, err := json.WarmupCache(data, []string{"user.name", "user.age", "meta.version"})
    if err != nil {
        panic(err)
    }
    fmt.Printf("ウォームアップ：%d/%d 成功（%.0f%%）\n", result.Successful, result.TotalPaths, result.SuccessRate)

    // ウォームアップ後、初回 Get はキャッシュヒット
    name, err := json.Get(data, "user.name")
    if err != nil {
        panic(err)
    }
    fmt.Println("name:", name)
}
// 出力：
// ウォームアップ：3/3 成功（100%）
// name: CyberGo
```

`WarmupResult` 構造：

| フィールド | 型 | 説明 |
|------|------|------|
| `TotalPaths` | `int` | ウォームアップ対象パスの総数 |
| `Successful` | `int` | 成功件数 |
| `Failed` | `int` | 失敗件数 |
| `SuccessRate` | `float64` | 成功率（パーセンテージ） |
| `FailedPaths` | `[]string` | 失敗したパスのリスト（失敗がない場合は nil） |

すべてのパスが失敗した場合、`WarmupCache` は `WarmupResult` を返すと同時に最後のエラーを付加します。

## 型定義

### BatchOperation

バッチ操作記述構造体。

```go
type BatchOperation struct {
    Type    string `json:"type"`     // 操作タイプ："get", "set", "delete", "validate"
    JSONStr string `json:"json_str"` // 対象 JSON 文字列
    Path    string `json:"path"`     // パス式
    Value   any    `json:"value"`    // 操作値（set 操作で使用）
    ID      string `json:"id"`       // 操作識別子
}
```

### BatchResult

バッチ操作結果構造体。

```go
type BatchResult struct {
    ID     string `json:"id"`     // 操作識別子
    Result any    `json:"result"` // 操作結果（意味は Type ごとに変化、上表参照）
    Error  error  `json:"error"`  // エラー情報（単一操作レベル）
}
```

::: tip Processor バッチメソッド
Processor インスタンスは等価なバッチメソッド `p.ProcessBatch(operations)` を提供し、シグネチャはパッケージレベル関数と同じです。Processor の再利用や、`Config` によるカスタマイズ（`Pretty` 出力、`PreserveNumbers` など）が必要なシナリオに適しています。詳細は [Processor バッチ操作](../processor/batch) を参照。
:::

## 関連

- [変更関数](./modify) - Set、SetMultiple、MergeJSON などの変更操作
- [Processor バッチ操作](../processor/batch) - Processor レベルのバッチ操作メソッドの詳細
- [ヘルパー関数](../helpers) - WarmupCache、ClearCache、GetStats などのユーティリティ関数
