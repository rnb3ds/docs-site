---
title: "削除関数 - CyberGo JSON | API リファレンス"
description: "CyberGo JSON の削除関数：Delete はパスでノードを削除、DeleteClean は null 値・空配列を自動クリーンアップし空の親ノードを連鎖削除。ワイルドカード、スライス、複数フィールド、JSON Pointer に対応し、パス欠落時は静かにスキップ、新しい文字列を返しチェーン呼び出しを維持します。"
sidebar_label: "削除操作"
sidebar_position: 4
---

# 削除関数

json パッケージが提供する JSON 削除関数。指定パスのノードを削除し、削除によって生じた空の親ノードをオプションでクリーンアップします。すべての削除関数は**イミュータブル**です——変更後の新しい JSON 文字列を返し、元の文字列は変更されません。エラー時は元の入力を返します。

## Delete

シグネチャ：`func Delete(jsonStr, path string, cfg ...Config) (string, error)`

指定パスの値を削除し、変更後の JSON 文字列を返します。

**パラメータ**

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `jsonStr` | `string` | はい | JSON 文字列 |
| `path` | `string` | はい | パス式（ドット、インデックス、ワイルドカード、スライス、複数フィールド） |
| `cfg` | `Config` | いいえ | オプション設定（クリーンアップと検証の動作に影響） |

**戻り値**

| 戻り値 | 説明 |
|--------|------|
| `result string` | 変更後の JSON 文字列（成功時）。エラー時は元の `jsonStr` |
| `err error` | 成功時は `nil`。失敗時は基底センチネルエラーをラップした `*JsonsError` |

### オブジェクトプロパティの削除

単一のネストされたプロパティを削除し、そのキーを含まない新しいオブジェクトを返します。

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"user":{"name":"Alice","temp":"value","age":30}}`

	result, err := json.Delete(data, "user.temp")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 出力: {"user":{"age":30,"name":"Alice"}}
}
```

### 配列要素の削除

配列から要素を削除します（インデックスは 0 起点）。要素は null 置換ではなく**除去**され、後続の要素は自動で前詰めされ、インデックスが振り直されます。穴は残りません。

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"items":["a","b","c","d"]}`

	// インデックス 1 の要素 "b" を削除、"c"/"d" は自動で前詰め
	result, err := json.Delete(data, "items[1]")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 出力: {"items":["a","c","d"]}
}
```

負数インデックスに対応しています（末尾から数え、`-1` が最後）：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"items":["a","b","c","d"]}`

	// -1 は最後の要素 "d" を指す
	result, err := json.Delete(data, "items[-1]")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 出力: {"items":["a","b","c"]}
}
```

### ネストパスの削除

ドットパスでネスト構造をたどり、任意の階層のノードを削除します。

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"config":{"database":{"host":"localhost","port":5432,"password":"secret"}}}`

	result, err := json.Delete(data, "config.database.password")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 出力: {"config":{"database":{"host":"localhost","port":5432}}}
}
```

### イミュータブルなセマンティクス

`Delete` は新しい文字列を返し、**元の `jsonStr` は変更されません**。同じ入力を複数箇所で安全に再利用できます：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"a":1,"b":2,"c":3}`

	r1, _ := json.Delete(data, "a")
	r2, _ := json.Delete(data, "b")

	fmt.Println(data) // 元データは不変: {"a":1,"b":2,"c":3}
	fmt.Println(r1)   // 出力: {"b":2,"c":3}
	fmt.Println(r2)   // 出力: {"a":1,"c":3}
}
```

## 高度なパス削除

`Delete` は Get/Set と同じ再帰パスエンジンを再利用し、ワイルドカード、スライス範囲、複数フィールド抽出などのバッチセマンティクスをサポートします。**バッチパス（`*`、`{}`、`:` を含む）は欠落ターゲットに寛容な戦略をとります——ヒットしたら削除、欠落は黙ってスキップし、エラーを返しません**。

### ワイルドカード削除

`items[*]` は配列の全要素を削除、`[*].field` は各要素の指定プロパティを削除します。

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"users":[{"name":"Alice","temp":"x"},{"name":"Bob","temp":"y"}]}`

	// 各ユーザーオブジェクトの temp プロパティを削除
	result, err := json.Delete(data, "users[*].temp")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 出力: {"users":[{"name":"Alice"},{"name":"Bob"}]}
}
```

一部の要素にターゲットプロパティがない場合でもエラーになりません（冪等セマンティクス。Go 標準の `delete()` が absent key に対してエラーにしない動作と一致）：

<!-- check-code: skip -->
```go
// data = `[{"a":1},{"b":2}]` — 2 番目の要素に a がなくても正常に返る
result, err := json.Delete(data, "[*].a")
// err == nil、result: [{"b":2}]
```

### スライス範囲削除

`items[0:2]` は連続区間の要素を削除します（左閉右開）。

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"items":["a","b","c","d","e"]}`

	// インデックス 0、1（2 を含まない）の "a"、"b" を削除
	result, err := json.Delete(data, "items[0:2]")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 出力: {"items":["c","d","e"]}
}
```

### 複数フィールド抽出削除

`[*].{a,b}` は各要素の複数の指定プロパティを一度に削除します。

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `[{"name":"Alice","pwd":"x","token":"y"},{"name":"Bob","pwd":"z"}]`

	// pwd と token の 2 フィールドを同時に削除
	result, err := json.Delete(data, "[*].{pwd,token}")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 出力: [{"name":"Alice"},{"name":"Bob"}]
}
```

### JSON Pointer パス削除

パスが `/` で始まる場合、`Delete` は **RFC 6901 JSON Pointer** セマンティクスで解析します（ドット構文は使われません）。セグメントは `/` で区切られ、`~0`/`~1` はそれぞれ `~` と `/` をエスケープします。これにより**キー名自体にドットなどの特殊文字を含む**キーの削除が可能になります（ドット構文ではこのようなキー名を表現できません）：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	// キー名 "a.b" 自体にドットが含まれる。ドットパス "a.b" は 2 階層に解析されヒットしない
	data := `{"a.b": 1, "user": {"name": "Alice"}}`

	r1, err := json.Delete(data, "/a.b")
	if err != nil {
		panic(err)
	}
	fmt.Println(r1) // 出力: {"user":{"name":"Alice"}}

	// /user/name はドットパス user.name と等価
	r2, err := json.Delete(data, "/user/name")
	if err != nil {
		panic(err)
	}
	fmt.Println(r2) // 出力: {"a.b":1}
}
```

::: warning ルートノードは削除不可
JSON Pointer の `/` はドキュメントルートを指し、ルートの削除は意味を持ちません——エラーを返します（`cannot delete root`）。ポインタパスの欠落セグメントは、ドットの厳密パスと同様に `ErrPathNotFound` を返します。
:::

::: tip 厳密パス vs バッチパス
- **厳密パス**（プロパティ名/インデックスのみ、例：`user.temp`、`items[1]`）：ターゲットが存在しない場合 `ErrPathNotFound` エラーを返します。
- **バッチパス**（`*`、`{}`、`:` を含む、例：`items[*]`、`[*].{a,b}`、`items[0:2]`）：ターゲット欠落時は黙ってスキップし、エラーにしません。厳密な検証が必要な場合は厳密パスを、「ベストエフォートで削除」したい場合はバッチパスを使ってください。
:::

## エラー処理

厳密パスのターゲットが存在しない場合、`Delete` は `ErrPathNotFound` をラップした `*JsonsError` を返し、戻りの元の入力は変更されません。`errors.Is` で具体的なエラー型を判定します：

```go
package main

import (
	"errors"
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"a":1}`

	result, err := json.Delete(data, "nonexistent.path")
	if err != nil {
		if errors.Is(err, json.ErrPathNotFound) {
			fmt.Println("パスが存在しないためスキップ")
		} else {
			fmt.Println("その他のエラー：", err)
		}
	}
	// result は元の JSON のまま: {"a":1}
	fmt.Println(result)
	// 出力:
	// パスが存在しないためスキップ
	// {"a":1}
}
```

削除でよくあるセンチネルエラー：

| エラー | トリガーシナリオ |
|------|----------|
| `ErrPathNotFound` | 厳密パスの中間セグメントまたはターゲットのキー/インデックスが存在しない |
| `ErrInvalidJSON` | `jsonStr` が正当な JSON でない |
| `ErrInvalidPath` | パス式の構文が不正（未クローズのブラケットなど） |

## DeleteClean

シグネチャ：`func DeleteClean(jsonStr, path string, cfg ...Config) (string, error)`

指定パスを削除し、削除によって生じた `null` 値と空オブジェクト/空配列を**再帰的にクリーンアップ**します。`Delete(jsonStr, path, cfg)` に `CleanupNulls: true` + `CompactArrays: true` の強制有効を組み合わせたものと等価です。

### カスケードクリーンアップのサンプル

削除後に親オブジェクトが空になると、`DeleteClean` は空の親オブジェクトも一緒に除去し、上へ向かって段階的にカスケードします：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	// temp は user の唯一のプロパティ
	data := `{"user":{"temp":"value"}}`

	// 通常の削除：user は空オブジェクト {} になるが保持される
	r1, _ := json.Delete(data, "user.temp")
	fmt.Println(r1) // 出力: {"user":{}}

	// DeleteClean：user が空になったら user キーごとクリーンアップ
	r2, err := json.DeleteClean(data, "user.temp")
	if err != nil {
		panic(err)
	}
	fmt.Println(r2) // 出力: {}
}
```

### API レスポンスの一時フィールドのクリーンアップ

`DeleteClean` は API レスポンスのクリーンアップに適しています：ターゲットフィールドを削除すると同時に、他の `null` 値や残留した空コンテナも掃き出し、「空殻」オブジェクトをフロントエンドに晒すのを防ぎます。

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	apiResp := `{"data":{"id":1,"name":"Product","desc":null,"price":29.99,"note":null}}`

	// 1 回の DeleteClean で desc を削除し、ツリー全体の他の null（note）も掃き出す
	cleaned, err := json.DeleteClean(apiResp, "data.desc")
	if err != nil {
		panic(err)
	}
	fmt.Println(cleaned)
	// 出力: {"data":{"id":1,"name":"Product","price":29.99}}
}
```

::: warning DeleteClean はツリー全体の null を掃き出す
`DeleteClean` のクリーンアップは**グローバル**です。JSON ツリー全体に対して null 値と空コンテナを再帰的にクリーンアップするため、削除点で生じたものだけでなく、ドキュメント中の**すべての**既存 `null` 値と空コンテナが除去されます。指定フィールドだけを除去し、残りの `null` を保持したい場合は、通常の `Delete` を使ってください。
:::

## DeleteClean と Config の関係

`DeleteClean` は本質的に `Delete` + 2 つの設定項目のシンタックスシュガーです。通常の `Delete` に同じ設定を明示的に渡しても、効果は完全に等価です：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"user":{"temp":"value"}}`

	// 方法 1：DeleteClean
	r1, _ := json.DeleteClean(data, "user.temp")

	// 方法 2：Delete + 明示的設定（完全に等価）
	cfg := json.DefaultConfig()
	cfg.CleanupNulls = true
	cfg.CompactArrays = true
	r2, _ := json.Delete(data, "user.temp", cfg)

	fmt.Println(r1) // 出力: {}
	fmt.Println(r2) // 出力: {}
}
```

削除動作に影響する `Config` フィールド：

| フィールド | デフォルト | 削除への影響 |
|------|------|--------------|
| `CleanupNulls` | `false` | 結果中の `null` 値と空オブジェクト/空配列を再帰的に除去（カスケードクリーンアップ） |
| `CompactArrays` | `false` | 配列中の `null`/空要素を除去。有効時は `CleanupNulls` を暗黙的に含む |
| `CreatePaths` | `true` | **削除に影響しない**（削除はパスを作成しない。ここは対比のための説明） |

## Delete と DeleteClean の比較

| 特性 | Delete | DeleteClean |
|------|--------|-------------|
| ターゲットノードの削除 | はい | はい |
| 配列要素除去後の再配置（穴なし） | はい | はい |
| 厳密パス欠落時のエラー | はい（`ErrPathNotFound`） | はい（`ErrPathNotFound`） |
| 削除で生じた `null` のクリーンアップ | いいえ | はい |
| 空オブジェクト/空配列のクリーンアップ（カスケード） | いいえ | はい（上へ段階的に） |
| ツリー全体の既存 `null` の掃き出し | いいえ | はい（グローバルクリーンアップ） |
| 等価な設定 | デフォルト | `CleanupNulls+CompactArrays` |
| 相対コスト | 低め | やや高め（ツリー全体のクリーンアップ走査が 1 回追加） |

## よくある落とし穴

::: warning 配列削除は穴を残さない
`Delete` が配列要素を削除するとき、要素は**全体として除去**され、後続の要素は自動で前詰めされます。`null` プレースホルダや穴は残りません。削除後にインデックスを保持したい（空席を残したい）場合、CyberGo の削除セマンティクスはその要件を満たしません——`Set` でその位置を `null` に設定してください。
:::

::: warning DeleteClean は「たまたま空」の正当なデータを誤って削除する可能性
`DeleteClean` のカスケードクリーンアップは、すべての空オブジェクト `{}`、空配列 `[]` をクリーンアップ対象とみなします。ビジネスセマンティクス上で「空配列」や「空オブジェクト」が意味のある状態（例：`"tags":[]` が「フィールド欠落」ではなく「タグなし」を表す）の場合、`DeleteClean` はキーごと除去します。このようなフィールドを保持したい場合は、通常の `Delete` を使ってください。
:::

::: warning バッチ削除は寛容
ワイルドカード/スライス/複数フィールドパスは欠落ターゲットを**黙ってスキップ**し、エラーを返しません。「ターゲットが必ず存在する」という厳格な検証セマンティクスが必要な場合は、厳密パス（`items[*]` ではなく `items[1]` など）を使ってください。
:::

## 複数フィールドの一括削除

互いに無関係な複数フィールドを一度に削除したい場合は、通常の `Delete` をループで呼び出すだけで済みます（毎回前回の結果をベースに）：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"user":{"id":1,"name":"Alice","password":"secret","ssn":"123-45-6789"}}`

	sensitive := []string{"user.password", "user.ssn"}
	result := data
	for _, field := range sensitive {
		var err error
		result, err = json.Delete(result, field)
		if err != nil {
			fmt.Printf("%s の削除に失敗：%v\n", field, err)
		}
	}
	fmt.Println(result)
	// 出力: {"user":{"id":1,"name":"Alice"}}
}
```

## 関連

- [変更操作](./modify) - 設定、マージなどの変更関数
- [クエリと取得関数](./query) - Get, GetString などのクエリ操作
- [Processor 削除メソッド](../processor/delete) - インスタンスメソッド版、メソッドチェーン対応
- [設定リファレンス](../config) - CleanupNulls / CompactArrays などのフィールド詳細
