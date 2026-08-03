---
sidebar_label: "バッチ操作"
title: "Processor バッチ操作 - CyberGo JSON | API リファレンス"
description: "CyberGo JSON Processor バッチ操作：ProcessBatch 複数操作、BatchOperation と BatchResult 型で、バッチ処理に適します。"
sidebar_position: 7
---

# バッチ操作メソッド

Processor はバッチ操作能力を提供し、1 回の呼び出しで複数の JSON 操作（get/set/delete/validate）を処理します。パッケージレベルの [`ProcessBatch`](../functions/batch) と比べ、Processor 形式はインスタンスの再利用や、`Config` によるバッチごとの動作カスタマイズ（出力の整形、数値保持、セキュリティ制限など）に適しています。

## ProcessBatch

シグネチャ：`func (p *Processor) ProcessBatch(operations []BatchOperation, cfg ...Config) ([]BatchResult, error)`

複数の JSON 操作をバッチ処理します。戻り値の結果順序は入力操作の順序と一致し、`ID` フィールドで紐付けます。

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New(json.DefaultConfig())
    if err != nil {
        panic(err)
    }
    defer p.Close()

    data := `{"user":{"name":"CyberGo","age":25}}`
    results, err := p.ProcessBatch([]json.BatchOperation{
        {Type: "get", JSONStr: data, Path: "user.name", ID: "name"},
        {Type: "set", JSONStr: data, Path: "user.age", Value: 30, ID: "age"},
    })
    if err != nil {
        panic(err)
    }
    for _, r := range results {
        fmt.Printf("%s: %v\n", r.ID, r.Result)
    }
}
// 出力：
// name: CyberGo
// age: {"user":{"age":30,"name":"CyberGo"}}
```

### 対応する操作タイプ

| `Type` | 役割 | `Result` の内容 | 典型的なエラー |
|--------|------|---------------|----------|
| `get` | パス上の値を読み取り | パスの位置の値（`any`） | `ErrPathNotFound`、`ErrInvalidJSON` |
| `set` | パスの値を設定 | **変更後の完全な JSON 文字列** | `ErrPathNotFound`（`CreatePaths` が無効な場合）、`ErrInvalidPath` |
| `delete` | パス上のノードを削除 | **削除後の完全な JSON 文字列** | `ErrPathNotFound`、`ErrInvalidPath` |
| `validate` | JSON が有効か検証 | `map[string]any{"valid": bool}` | 無効な JSON の場合 `Result.valid=false` かつ `Error` が非 nil |

::: warning 操作は相互にチェーンしません
各 `BatchOperation` はそれぞれの `JSONStr` 入力に対して**独立して**作用し、操作間でチェーン的に積み重なることは**ありません**。同じドキュメントに対して先に `set` してから `delete` すると、2 つの独立した結果が得られ、「先に変更してから削除」の積み重ね状態にはなりません。単一ドキュメントに複数ステップの変換が必要な場合は、コード内で前ステップの出力を次ステップに渡すか、[`SetMultiple`](./modify#setmultiple) などの単一ドキュメント・複数パスメソッドを使ってください。
:::

### バッチサイズ制限

操作数は `Config.MaxBatchSize`（デフォルト `2000`）で制限されます。この上限は「呼び出しごと」に適用されます——渡された `cfg`（存在する場合）がプロセッサ自身の設定を上書きします。超過するとバッチ全体が即座に失敗し、`(nil, ErrSizeLimit)` を返します。

## 各操作タイプの例

### get — バッチ読み取り

`get` 操作の `Result` はパスの位置の生の値です（数値はデフォルトで `float64`）。

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New(json.DefaultConfig())
    if err != nil {
        panic(err)
    }
    defer p.Close()

    data := `{"user":{"name":"CyberGo","age":25}}`
    results, err := p.ProcessBatch([]json.BatchOperation{
        {Type: "get", JSONStr: data, Path: "user.name", ID: "name"},
        {Type: "get", JSONStr: data, Path: "user.age", ID: "age"},
    })
    if err != nil {
        panic(err)
    }
    for _, r := range results {
        fmt.Printf("%s: %v\n", r.ID, r.Result)
    }
}
// 出力：
// name: CyberGo
// age: 25
```

### set — バッチ変更

`set` の `Result` は**変更後の完全な JSON 文字列**です（コンパクトフォーマット、オブジェクトキーは辞書順）。デフォルトは `CreatePaths=true` で、新しいパスへの設定は自動的に中間ノードを作成します：

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New(json.DefaultConfig())
    if err != nil {
        panic(err)
    }
    defer p.Close()

    data := `{"user":{"name":"CyberGo","age":25}}`
    results, err := p.ProcessBatch([]json.BatchOperation{
        {Type: "set", JSONStr: data, Path: "user.age", Value: 30, ID: "age"},
        {Type: "set", JSONStr: data, Path: "user.role", Value: "admin", ID: "role"},
    })
    if err != nil {
        panic(err)
    }
    for _, r := range results {
        fmt.Printf("%s -> %s\n", r.ID, r.Result)
    }
}
// 出力：
// age -> {"user":{"age":30,"name":"CyberGo"}}
// role -> {"user":{"age":25,"name":"CyberGo","role":"admin"}}
```

::: tip 設定がバッチに作用する仕組み
渡された `Config` は操作ごとに透過的に伝達されますが、**すべてのフィールドが出力に影響するわけではありません**：`set`/`delete` の戻り値は常にコンパクト文字列です（`Pretty` の影響を受けません。整形が必要な場合は結果に対して別途 [`Prettify`](./output#prettify) を使用）。実際に `cfg` で有効になるのは `MaxBatchSize`（バッチ上限）、`CreatePaths`（`set` が新しいパスを作成できるか）、`PreserveNumbers`（`get` が返す数値型に影響：デフォルトは `float64`、有効化すると `json.Number`）です。
:::

### delete — バッチ削除

`delete` の `Result` は**削除後の完全な JSON 文字列**です。

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New(json.DefaultConfig())
    if err != nil {
        panic(err)
    }
    defer p.Close()

    data := `{"user":{"name":"CyberGo","age":25,"temp":"x"},"debug":true}`
    results, err := p.ProcessBatch([]json.BatchOperation{
        {Type: "delete", JSONStr: data, Path: "user.temp", ID: "drop-temp"},
        {Type: "delete", JSONStr: data, Path: "debug", ID: "drop-debug"},
    })
    if err != nil {
        panic(err)
    }
    for _, r := range results {
        fmt.Printf("%s -> %s\n", r.ID, r.Result)
    }
}
// 出力：
// drop-temp -> {"debug":true,"user":{"age":25,"name":"CyberGo"}}
// drop-debug -> {"user":{"age":25,"name":"CyberGo","temp":"x"}}
```

### validate — バッチ検証

`validate` の `Result` は常に `map[string]any{"valid": bool}` です。不正な JSON の場合 `valid` は `false` で、`Error` に解析エラーが含まれます。

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New(json.DefaultConfig())
    if err != nil {
        panic(err)
    }
    defer p.Close()

    results, err := p.ProcessBatch([]json.BatchOperation{
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

### 混合操作

同じバッチで異なるタイプの操作を混在でき、結果は順序通りに返されます：

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New(json.DefaultConfig())
    if err != nil {
        panic(err)
    }
    defer p.Close()

    data := `{"user":{"name":"CyberGo"},"processed":false}`
    results, err := p.ProcessBatch([]json.BatchOperation{
        {Type: "validate", JSONStr: data, ID: "check"},
        {Type: "get", JSONStr: data, Path: "user.name", ID: "name"},
        {Type: "set", JSONStr: data, Path: "processed", Value: true, ID: "mark"},
    })
    if err != nil {
        panic(err)
    }

    for _, r := range results {
        if r.ID == "check" {
            if m, ok := r.Result.(map[string]any); ok {
                fmt.Printf("検証結果: %v\n", m["valid"])
            }
        } else {
            fmt.Printf("%s: %v\n", r.ID, r.Result)
        }
    }
}
// 出力：
// 検証結果: true
// name: CyberGo
// mark: {"processed":true,"user":{"name":"CyberGo"}}
```

## エラー処理とフォールトトレランス

### 単一操作の失敗はバッチを中断しない

`ProcessBatch` は**常にすべての操作を処理します**：ある操作が失敗してもその結果の `Error` フィールドに書き込まれるだけで、後続の操作は中断されず、何ら設定を有効化する必要もありません。したがってバッチ結果は「一部成功、一部失敗」になる可能性があり、必ず `r.Error` を 1 件ずつ確認してください：

```go
results, err := p.ProcessBatch(operations)
if err != nil {
    // err はプロセッサがクローズ済み、設定が不正、MaxBatchSize 超過の場合にのみ現れる
    return err
}
for _, r := range results {
    if r.Error != nil {
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

一連のレコードにマイグレーションフラグを一括付与し、一度の `ProcessBatch` 呼び出しで全変換を完了します。Processor 形式は長期間稼働するサービスで同じインスタンスを再利用して大量のバッチを処理するのに特に適しています：

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New(json.DefaultConfig())
    if err != nil {
        panic(err)
    }
    defer p.Close()

    records := []string{
        `{"id":1,"name":"Alice","age":30}`,
        `{"id":2,"name":"Bob","age":25}`,
        `{"id":3,"name":"CyberGo","age":28}`,
    }

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

    results, err := p.ProcessBatch(ops)
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

シグネチャ：`func (p *Processor) WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)`

同じ JSON のホットパスを事前に評価してキャッシュに格納し、以降の初回 [`Get`](./query) が直接キャッシュヒットするようにします。プロセッサのキャッシュが有効（デフォルトで有効）である必要があり、無効な場合は `ErrCacheDisabled` を返します。

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New(json.DefaultConfig())
    if err != nil {
        panic(err)
    }
    defer p.Close()

    data := `{"user":{"name":"CyberGo","age":25},"meta":{"version":2}}`
    result, err := p.WarmupCache(data, []string{"user.name", "user.age", "meta.version"})
    if err != nil {
        panic(err)
    }
    fmt.Printf("ウォームアップ：%d/%d 成功（%.0f%%）\n", result.Successful, result.TotalPaths, result.SuccessRate)
}
// 出力：
// ウォームアップ：3/3 成功（100%）
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

### BatchOperation 構造体

```go
type BatchOperation struct {
    Type    string `json:"type"`     // 操作タイプ："get", "set", "delete", "validate"
    JSONStr string `json:"json_str"` // JSON 文字列
    Path    string `json:"path"`     // 対象パス
    Value   any    `json:"value"`    // Set 操作の値
    ID      string `json:"id"`       // 操作識別子
}
```

### BatchResult 構造体

```go
type BatchResult struct {
    ID     string `json:"id"`     // 対応する操作 ID
    Result any    `json:"result"` // 操作結果（意味は Type ごとに変化、上表参照）
    Error  error  `json:"error"`  // 単一操作のエラー（他の操作に影響しない）
}
```

## 注意事項

1. 各操作は独立して実行され、1 つの失敗が他に影響することはありません（組み込み動作、設定不要）
2. 結果順序は操作順序と一致し、`ID` で操作と結果を紐付けます
3. `MaxBatchSize`（デフォルト 2000）は呼び出しごとの `cfg` で有効になり、超過するとバッチ全体が失敗します

## 関連

- [パスクエリ](./query) - Get シリーズメソッド
- [データ変更](./modify) - Set/Delete/SetMultiple メソッド
- [パッケージレベルバッチ操作](../functions/batch) - Processor 不要のパッケージレベル ProcessBatch
