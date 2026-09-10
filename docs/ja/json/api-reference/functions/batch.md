---
sidebar_label: "バッチ操作"
title: "バッチ操作関数 - CyberGo JSON | API リファレンス"
description: "CyberGo JSON のバッチ操作関数：ProcessBatch で複数の JSON 操作を一括処理。BatchOperation 記述構造と BatchResult 結果構造を利用し、get/set/delete/validate の 4 種類の操作に対応、1 件失敗してもバッチは中断されません。"
sidebar_position: 7
---

# バッチ操作関数

json パッケージが提供するバッチ操作関数。複数の JSON 操作（get/set/delete/validate）を一度に処理でき、バッチデータ処理シナリオに適しています。

## ProcessBatch

シグネチャ：`func ProcessBatch(operations []BatchOperation, cfg ...Config) ([]BatchResult, error)`

複数の JSON 操作をバッチ処理します（パッケージレベル関数、Processor 作成不要）。返される結果の順序は入力操作の順序と 1 対 1 で対応し、`ID` フィールドで関連付けられます。

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
			fmt.Printf("操作 %s が失敗: %v\n", r.ID, r.Error)
		} else {
			fmt.Printf("操作 %s の結果: %v\n", r.ID, r.Result)
		}
	}
}

// 出力:
// 操作 op1 の結果: CyberGo
// 操作 op2 の結果: {"user":{"age":30,"name":"CyberGo"}}
```

### サポートされる操作型

| `Type` | 機能 | `Result` の内容 | 典型的なエラー |
|--------|------|---------------|----------|
| `get` | パスの値を読み取り | パスの値（`any`） | `ErrPathNotFound`、`ErrInvalidJSON` |
| `set` | パスの値を設定 | **変更後の完全な JSON 文字列** | `ErrPathNotFound`（`CreatePaths` 無効時）、`ErrInvalidPath` |
| `delete` | パスのノードを削除 | **削除後の完全な JSON 文字列** | `ErrPathNotFound`、`ErrInvalidPath` |
| `validate` | JSON が正当か検証 | `map[string]any{"valid": bool}` | 無効 JSON のとき `Result.valid=false` かつ `Error` が非空 |

`Type` が上記 4 つ以外（タイポなど）の場合、その操作の `Error` は `unknown operation type: <type>` になります——**バッチは中断されず**、残りの操作は通常どおり実行されます。

::: warning 操作は相互にチェーンしない
各 `BatchOperation` はそれぞれの `JSONStr` 入力に対して**独立して**作用し、操作間でチェーン的に積み重なることは**ありません**。例えば同じドキュメントに対して先に `set` してから `delete` すると、2 つの独立した結果が得られ、「先に変更してから削除」の積み重ね状態にはなりません。単一ドキュメントに複数ステップの変換が必要な場合は、コード内で前ステップの出力を次ステップに渡すか、[`SetMultiple`](./modify#setmultiple) などの単一ドキュメント・複数パスメソッドを使ってください。
:::

### バッチサイズ制限

操作数は `Config.MaxBatchSize` に従います（デフォルト `2000`、設定検証により 10–10000 にクランプ）。超過した場合、バッチ全体が即座に失敗し `(nil, ErrSizeLimit)` を返します。上限は**今回の呼び出しで渡された cfg** に基づいて有効になります（未渡しの場合はデフォルト設定）：

```go
// カスタム上限（超大型バッチシナリオ向け）
cfg := json.DefaultConfig()
cfg.MaxBatchSize = 5000
results, err := json.ProcessBatch(ops, cfg)
```

## 各操作型のサンプル

### get — バッチ読み取り

`get` 操作の `Result` はパスの生の値です（数値はデフォルトで `float64`、ブールは `bool`、文字列は `string`）。

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
			fmt.Printf("%s が失敗: %v\n", r.ID, r.Error)
			continue
		}
		fmt.Printf("%s = %v\n", r.ID, r.Result)
	}
}

// 出力:
// name = CyberGo
// age = 25
// active = true
```

### set — バッチ変更

`set` 操作の `Result` は**変更後の完全な JSON 文字列**です（書き込んだ値そのものではない点に注意）。デフォルト設定は `CreatePaths=true` のため、新しいパスへの設定は中間ノードを自動作成します。

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
			fmt.Printf("%s が失敗: %v\n", r.ID, r.Error)
			continue
		}
		fmt.Printf("%s -> %s\n", r.ID, r.Result)
	}
}

// 出力:
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
			fmt.Printf("%s が失敗: %v\n", r.ID, r.Error)
			continue
		}
		fmt.Printf("%s -> %s\n", r.ID, r.Result)
	}
}

// 出力:
// drop-temp -> {"debug":true,"user":{"age":25,"name":"CyberGo"}}
// drop-debug -> {"user":{"age":25,"name":"CyberGo","temp":"x"}}
```

### validate — バッチ検証

`validate` 操作の `Result` は常に `map[string]any{"valid": bool}` です。JSON が不正な場合 `valid` は `false` になり、`Error` に解析エラーが入ります。

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

// 出力:
// ok: valid=true
// broken: valid=false
// broken エラー: invalid JSON: ...
```

## エラー処理とフォールトトレランス

### 単一操作の失敗はバッチを中断しない

`ProcessBatch` は**常にすべての操作を処理します**：ある操作が失敗しても、その結果の `Error` フィールドに書き込まれるだけで、後続の操作は中断されず、有効化のための設定も不要です。そのためバッチ結果は「一部成功、一部失敗」になり得るため、必ず `r.Error` を逐一チェックしてください：

```go
results, err := json.ProcessBatch(operations)
if err != nil {
    // err が現れるのはプロセッサクローズ時、設定不正、MaxBatchSize 超過の時のみ
    panic(err)
}
var failed int
for _, r := range results {
    if r.Error != nil {
        failed++
        log.Printf("操作 %s が失敗: %v", r.ID, r.Error)
        continue
    }
    // r.Result を処理 ...
}
```

::: tip ContinueOnError との違い
`Config.ContinueOnError` フィールドが制御するのは [`SetMultiple`](./modify#setmultiple) の途中フォールトトレランス（あるパスへの書き込み失敗時に残りのパスへの書き込みを継続するか）であり、`ProcessBatch` には**作用しません**。`ProcessBatch` の操作ごとの隔離は組み込みの動作であり、このスイッチで無効化することはできません。
:::

## 実践シナリオ：バッチデータマイグレーション

一連のレコードに一括でマイグレーションフラグを付け、1 回の `ProcessBatch` 呼び出しで全部の変換を完了し、各レコードの出力を収集します：

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

	// 各レコードに set 操作を生成し、一括でマイグレーションフラグを付与
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
			fmt.Printf("%s が失敗: %v\n", r.ID, r.Error)
			continue
		}
		fmt.Printf("%s -> %s\n", r.ID, r.Result)
	}
}

// 出力:
// record-0 -> {"age":30,"id":1,"migrated":true,"name":"Alice"}
// record-1 -> {"age":25,"id":2,"migrated":true,"name":"Bob"}
// record-2 -> {"age":28,"id":3,"migrated":true,"name":"CyberGo"}
```

## キャッシュウォームアップ WarmupCache

シグネチャ：`func WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)`

同一 JSON のホットパスを事前に評価してキャッシュに投入し、以降の最初の `Get` が直接キャッシュヒットするようにします。プロセッサでキャッシュが有効（デフォルトで有効）である必要があり、無効の場合は `JsonsError` を返します（`Op` は `warmup_cache`、エラーメッセージは "cache is disabled, cannot warmup cache"）。

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

	// ウォームアップ後の最初の Get はキャッシュヒット
	name, err := json.Get(data, "user.name")
	if err != nil {
		panic(err)
	}
	fmt.Println("name:", name)
}

// 出力:
// ウォームアップ：3/3 成功（100%）
// name: CyberGo
```

`WarmupResult` 構造：

| フィールド | 型 | 説明 |
|------|------|------|
| `TotalPaths` | `int` | ウォームアップ対象パスの総数 |
| `Successful` | `int` | 成功数 |
| `Failed` | `int` | 失敗数 |
| `SuccessRate` | `float64` | 成功率（パーセント） |
| `FailedPaths` | `[]string` | 失敗したパスのリスト（失敗なしの場合は nil） |

すべてのパスが失敗した場合、`WarmupCache` は `WarmupResult` を返すと同時に最後のエラーを付加します。

## 型定義

### BatchOperation

バッチ操作記述構造。

```go
type BatchOperation struct {
    Type    string `json:"type"`     // 操作型："get", "set", "delete", "validate"
    JSONStr string `json:"json_str"` // 対象 JSON 文字列
    Path    string `json:"path"`     // パス式
    Value   any    `json:"value"`    // 操作値（set 操作で使用）
    ID      string `json:"id"`       // 操作識別子
}
```

| フィールド | 型 | 説明 |
|------|------|------|
| `Type` | `string` | 操作型：`get` / `set` / `delete` / `validate` |
| `JSONStr` | `string` | この操作の入力 JSON（各操作は相互独立、チェーンしない） |
| `Path` | `string` | パス式（`validate` では使用されない） |
| `Value` | `any` | `set` が書き込む値（その他の型では使用されない） |
| `ID` | `string` | 呼び出し側のカスタム識別子。対応する結果の `BatchResult.ID` にそのままコピーされる |

### BatchResult

バッチ操作結果構造。

```go
type BatchResult struct {
    ID     string `json:"id"`     // 操作識別子
    Result any    `json:"result"` // 操作結果（意味は Type により変化、上表参照）
    Error  error  `json:"error"`  // エラー情報（単一操作レベル）
}
```

| フィールド | 型 | 説明 |
|------|------|------|
| `ID` | `string` | 対応操作の `ID`。結果スライスは入力操作と添字順で 1 対 1 対応 |
| `Result` | `any` | 操作結果。意味は `Type` により変化（上の表を参照） |
| `Error` | `error` | この操作のエラー。`nil` は成功を意味します。**必ず逐一チェック** |

::: tip Processor バッチメソッド
Processor インスタンスは等価のバッチメソッド `p.ProcessBatch(operations)` を提供します。シグネチャはパッケージレベル関数と同一で、Processor の再利用や、`Config` によるカスタマイズ（`Pretty` 出力、`PreserveNumbers` など）が必要なシナリオに適します。詳しくは [Processor バッチ操作](../processor/batch)を参照してください。
:::

## 関連

- [変更関数](./modify) - Set, SetMultiple, MergeJSON などの変更操作
- [Processor バッチ操作](../processor/batch) - Processor レベルのバッチ操作メソッド詳解
- [補助ツール](../helpers) - WarmupCache、ClearCache、GetStats などのユーティリティ関数
