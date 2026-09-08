---
sidebar_label: "バッチ操作"
title: "Processor バッチ操作 - CyberGo JSON | API リファレンス"
description: "CyberGo JSON の Processor バッチ操作：ProcessBatch で get/set/delete/validate の複数操作を一括処理し、BatchOperation と BatchResult 型を備え、Config によるバッチのカスタマイズとインスタンス再利用に適しています。"
sidebar_position: 7
---

# バッチ操作メソッド

Processor はバッチ操作能力を提供し、1 回の呼び出しで複数の JSON 操作（get/set/delete/validate）を処理します。パッケージレベルの [`ProcessBatch`](../functions/batch) と比較して、Processor 形式はインスタンスの再利用や、`Config` によるバッチごとの動作カスタマイズ（整形出力、数値保持、セキュリティ制限など）に適しています。

## ProcessBatch

シグネチャ：`func (p *Processor) ProcessBatch(operations []BatchOperation, cfg ...Config) ([]BatchResult, error)`

複数の JSON 操作をバッチ処理します。返される結果の順序は入力操作の順序と一致し、`ID` フィールドで関連付けられます。

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

// 出力:
// name: CyberGo
// age: {"user":{"age":30,"name":"CyberGo"}}
```

### サポートされる操作型

| `Type` | 機能 | `Result` の内容 | 典型的なエラー |
|--------|------|---------------|----------|
| `get` | パスの値を読み取り | パスの値（`any`） | `ErrPathNotFound`、`ErrInvalidJSON` |
| `set` | パスの値を設定 | **変更後の完全な JSON 文字列** | `ErrPathNotFound`（`CreatePaths` 無効時）、`ErrInvalidPath` |
| `delete` | パスのノードを削除 | **削除後の完全な JSON 文字列** | `ErrPathNotFound`、`ErrInvalidPath` |
| `validate` | JSON が正当か検証 | `map[string]any{"valid": bool}` | 無効 JSON のとき `Result.valid=false` かつ `Error` が非空 |

::: warning 操作は相互にチェーンしない
各 `BatchOperation` はそれぞれの `JSONStr` 入力に対して**独立して**作用し、操作間でチェーン的に積み重なることは**ありません**。同じドキュメントに対して先に `set` してから `delete` すると、「先に変更してから削除」の積み重ね状態ではなく 2 つの独立した結果が得られます。単一ドキュメントに複数ステップの変換が必要な場合は、コード内で前ステップの出力を次ステップに渡すか、[`SetMultiple`](./modify#setmultiple) などの単一ドキュメント・複数パスメソッドを使ってください。
:::

### バッチサイズ制限

操作数は `Config.MaxBatchSize` に従います（デフォルト `2000`）。この上限は「呼び出しごと」に適用されます——渡された `cfg`（あれば）がプロセッサ自身の設定を上書きします。超過した場合、バッチ全体が即座に失敗し `(nil, ErrSizeLimit)` を返します。

## 各操作型のサンプル

### get — バッチ読み取り

`get` 操作の `Result` はパスの生の値です（数値はデフォルトで `float64`）。

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

// 出力:
// name: CyberGo
// age: 25
```

### set — バッチ変更

`set` の `Result` は**変更後の完全な JSON 文字列**です（コンパクトフォーマット、オブジェクトキーは辞書順）。デフォルトは `CreatePaths=true` のため、新しいパスへの設定は中間ノードを自動作成します：

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

// 出力:
// age -> {"user":{"age":30,"name":"CyberGo"}}
// role -> {"user":{"age":25,"name":"CyberGo","role":"admin"}}
```

::: tip 設定がバッチに作用する仕組み
渡された `Config` は操作ごとに透過的に渡されますが、**すべてのフィールドが出力に影響するわけではありません**：`set`/`delete` の戻り値は常にコンパクト文字列です（`Pretty` の影響を受けません。整形が必要な場合は結果に別途 [`Prettify`](./output#prettify) を使用）。実際に `cfg` で有効になるのは `MaxBatchSize`（バッチ上限）、`CreatePaths`（`set` が新しいパスを作成できるか）、`PreserveNumbers`（`get` が返す数値型への影響：デフォルトは `float64`、有効時は `json.Number`）です。
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

// 出力:
// drop-temp -> {"debug":true,"user":{"age":25,"name":"CyberGo"}}
// drop-debug -> {"user":{"age":25,"name":"CyberGo","temp":"x"}}
```

### validate — バッチ検証

`validate` の `Result` は常に `map[string]any{"valid": bool}` です。不正な JSON の場合 `valid` は `false` になり、`Error` に解析エラーが入ります。

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

// 出力:
// ok: valid=true
// broken: valid=false
// broken エラー: invalid JSON: ...
```

### 混合操作

同じバッチに異なる型の操作を混在でき、結果は順序どおり返されます：

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

// 出力:
// 検証結果: true
// name: CyberGo
// mark: {"processed":true,"user":{"name":"CyberGo"}}
```

## エラー処理とフォールトトレランス

### 単一操作の失敗はバッチを中断しない

`ProcessBatch` は**常にすべての操作を処理します**：ある操作が失敗しても、その結果の `Error` フィールドに書き込まれるだけで、後続の操作は中断されず、有効化のための設定も不要です。そのためバッチ結果は「一部成功、一部失敗」になり得るため、必ず `r.Error` を逐一チェックしてください：

```go
results, err := p.ProcessBatch(operations)
if err != nil {
    // err が現れるのはプロセッサクローズ時、設定不正、MaxBatchSize 超過の時のみ
    return err
}
for _, r := range results {
    if r.Error != nil {
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

一連のレコードに一括でマイグレーションフラグを付け、1 回の `ProcessBatch` 呼び出しで全部の変換を完了させます。Processor 形式は、常駐サービスで同じインスタンスを再利用して大量のバッチを処理する場合に特に適しています：

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

シグネチャ：`func (p *Processor) WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)`

同一 JSON のホットパスを事前に評価してキャッシュに投入し、以降の最初の [`Get`](./query) が直接キャッシュヒットするようにします。プロセッサでキャッシュが有効（デフォルトで有効）である必要があり、無効の場合は `JsonsError` を返します（`Op` は `warmup_cache`、エラーメッセージは "cache is disabled, cannot warmup cache"）。

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

// 出力:
// ウォームアップ：3/3 成功（100%）
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

### BatchOperation 構造体

```go
type BatchOperation struct {
    Type    string `json:"type"`     // 操作型："get", "set", "delete", "validate"
    JSONStr string `json:"json_str"` // JSON 文字列
    Path    string `json:"path"`     // ターゲットパス
    Value   any    `json:"value"`    // Set 操作の値
    ID      string `json:"id"`       // 操作識別子
}
```

### BatchResult 構造体

```go
type BatchResult struct {
    ID     string `json:"id"`     // 対応する操作 ID
    Result any    `json:"result"` // 操作結果（意味は Type により変化、上表参照）
    Error  error  `json:"error"`  // 単一操作のエラー（他の操作に影響しない）
}
```

## 注意事項

1. 各操作は独立して実行され、1 つの失敗は他の操作に影響しません（組み込み動作、設定不要）
2. 結果の順序は操作の順序と一致し、`ID` で操作と結果を対応付けます
3. `MaxBatchSize`（デフォルト 2000）は呼び出しごとの `cfg` で適用され、超過するとバッチ全体が失敗します

## 関連

- [パスクエリ](./query) - Get 系メソッド
- [データ変更](./modify) - Set/Delete/SetMultiple メソッド
- [パッケージレベルバッチ操作](../functions/batch) - Processor 不要のパッケージレベル ProcessBatch
