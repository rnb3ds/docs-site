---
title: "削除関数 - CyberGo JSON | API リファレンス"
description: "CyberGo JSON 削除関数：Delete でノードを削除、DeleteClean で削除後に空の親ノードをクリーンアップ。パス式と自動クリーンアップに対応。"
sidebar_label: "削除操作"
sidebar_position: 4
---

# 削除関数

json パッケージが提供する JSON 削除関数は、指定したパスのノードを削除し、削除によって生じた空の親ノードをオプションでクリーンアップします。すべての削除関数は**イミュータブル**です——変更後の新しい JSON 文字列を返し、元の文字列は変更されません。エラー時は元の入力を返します。

## Delete

シグネチャ：`func Delete(jsonStr, path string, cfg ...Config) (string, error)`

指定したパスの値を削除し、変更後の JSON 文字列を返します。

**パラメータ**

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `jsonStr` | `string` | はい | JSON 文字列 |
| `path` | `string` | はい | パス式（ドット、インデックス、ワイルドカード、スライス、マルチフィールド） |
| `cfg` | `Config` | いいえ | オプション設定（クリーンアップと検証の動作に影響） |

**戻り値**

| 戻り値 | 説明 |
|--------|------|
| `result string` | 変更後の JSON 文字列（成功時）。エラー時は元の `jsonStr` |
| `err error` | 成功時は `nil`。失敗時は内部のセンチネルエラーをラップした `*JsonsError` |

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
	// 出力：{"user":{"age":30,"name":"Alice"}}
}
```

### 配列要素の削除

配列の要素を削除します（インデックスは 0 から）。要素は `null` に設定されるのではなく**削除**され、後続の要素が自動的に前に詰められ、インデックスが再割り当てされます。穴は残りません。

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"items":["a","b","c","d"]}`

	// インデックス 1 の要素 "b" を削除、"c"/"d" が自動的に前に詰められる
	result, err := json.Delete(data, "items[1]")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 出力：{"items":["a","c","d"]}
}
```

負のインデックス（末尾から数え、`-1` が最後）に対応します：

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
	// 出力：{"items":["a","b","c"]}
}
```

### ネストされたパスの削除

ドット区切りのパスでネストされた構造をたどり、任意の階層のノードを削除します。

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
	// 出力：{"config":{"database":{"host":"localhost","port":5432}}}
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

	fmt.Println(data) // 元のデータは不変：{"a":1,"b":2,"c":3}
	fmt.Println(r1)   // 出力：{"b":2,"c":3}
	fmt.Println(r2)   // 出力：{"a":1,"c":3}
}
```

## 高度なパス削除

`Delete` は Get/Set と同じ再帰パスエンジンを再利用し、ワイルドカード、スライス範囲、マルチフィールド抽出などのバッチセマンティクスに対応します。**バッチパス（`*`、`{}`、`:` を含む）は欠落ターゲットに対してフォールトトレラント戦略を採用します——ヒットすれば削除し、欠落場合は黙示的にスキップし、エラーを返しません**。

### ワイルドカード削除

`items[*]` は配列の全要素を削除します。`[*].field` は各要素の指定プロパティを削除します。

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
	// 出力：{"users":[{"name":"Alice"},{"name":"Bob"}]}
}
```

一部の要素にターゲットプロパティが欠けていてもエラーになりません（べき等セマンティクス、Go のネイティブ `delete()` が存在しないキーに対して示す動作と一致します）：

<!-- check-code: skip -->
```go
// data = `[{"a":1},{"b":2}]` — 2 番目の要素には a がないが、正常に返る
result, err := json.Delete(data, "[*].a")
// err == nil、result：[{"b":2}]
```

### スライス範囲削除

`items[0:2]` は連続する区間の要素を削除します（左閉右開）。

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
	// 出力：{"items":["c","d","e"]}
}
```

### マルチフィールド抽出削除

`[*].{a,b}` で各要素の複数の指定プロパティを一度に削除します。

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `[{"name":"Alice","pwd":"x","token":"y"},{"name":"Bob","pwd":"z"}]`

	// pwd と token の 2 つのフィールドを同時に削除
	result, err := json.Delete(data, "[*].{pwd,token}")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 出力：[{"name":"Alice"},{"name":"Bob"}]
}
```

::: tip 厳密パス vs バッチパス
- **厳密パス**（プロパティ名/インデックスのみ、例：`user.temp`、`items[1]`）：ターゲットが存在しない場合 `ErrPathNotFound` エラーを返します。
- **バッチパス**（`*`、`{}`、`:` を含む、例：`items[*]`、`[*].{a,b}`、`items[0:2]`）：ターゲット欠落時に黙示的にスキップし、エラーになりません。厳格な検証が必要な場合は厳密パスを使い、「ベストエフォートで削除」したい場合はバッチパスを使います。
:::

## エラー処理

厳密パスのターゲットが存在しない場合、`Delete` は `ErrPathNotFound` をラップした `*JsonsError` を返し、元の入力は変更されません。`errors.Is` で具体的なエラー型を判定します：

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
			fmt.Println("パスが存在しません、スキップしました")
		} else {
			fmt.Println("その他のエラー：", err)
		}
	}
	// result は元の JSON のまま：{"a":1}
	fmt.Println(result)
	// 出力：
	// パスが存在しません、スキップしました
	// {"a":1}
}
```

よくある削除エラーのセンチネル値：

| エラー | トリガー条件 |
|------|----------|
| `ErrPathNotFound` | 厳密パスの中間セグメントまたはターゲットキー/インデックスが存在しない |
| `ErrInvalidJSON` | `jsonStr` が有効な JSON ではない |
| `ErrInvalidPath` | パス式の構文が不正（例：閉じていない角括弧） |

## DeleteClean

シグネチャ：`func DeleteClean(jsonStr, path string, cfg ...Config) (string, error)`

指定したパスを削除し、削除によって生じた `null` 値と空オブジェクト/空配列を**再帰的にクリーンアップ**します。`Delete(jsonStr, path, cfg)` で `CleanupNulls: true` + `CompactArrays: true` を強制的に有効化するのと等価です。

### カスケードクリーンアップの例

削除後に親オブジェクトが空になった場合、`DeleteClean` は空の親オブジェクトも一緒に削除し、階層を上へとカスケードします：

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
	fmt.Println(r1) // 出力：{"user":{}}

	// DeleteClean：user が空になった後、user キーも一緒にクリーンアップ
	r2, err := json.DeleteClean(data, "user.temp")
	if err != nil {
		panic(err)
	}
	fmt.Println(r2) // 出力：{}
}
```

### API レスポンスの一時フィールドのクリーンアップ

`DeleteClean` は API レスポンスのクリーンアップに適しています：ターゲットフィールドを削除すると同時に、他の `null` 値と残った空コンテナをスキャンして削除し、「空殻」のオブジェクトをフロントエンドに晒すことを防ぎます。

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	apiResp := `{"data":{"id":1,"name":"Product","desc":null,"price":29.99,"note":null}}`

	// 一度の DeleteClean で desc を削除し、ツリー全体の他の null（note）もスキャンして削除
	cleaned, err := json.DeleteClean(apiResp, "data.desc")
	if err != nil {
		panic(err)
	}
	fmt.Println(cleaned)
	// 出力：{"data":{"id":1,"name":"Product","price":29.99}}
}
```

::: warning DeleteClean はツリー全体の null をスキャンして削除します
`DeleteClean` のクリーンアップは**グローバル**です：JSON ツリー全体に対して `CleanupNullValues` を再帰的に実行するため、削除ポイントで生じたものだけでなく、ドキュメント内の**すべて**の既存 `null` 値と空コンテナが削除されます。指定フィールドだけを削除し、他の `null` を保持したい場合は通常の `Delete` を使ってください。
:::

## DeleteClean と Config の関係

`DeleteClean` は本質的に `Delete` + 2 つの設定項目のシンタックスシュガーです。通常の `Delete` でも同じ設定を明示的に渡せば、完全に等価な効果が得られます：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"user":{"temp":"value"}}`

	// 方式 1：DeleteClean
	r1, _ := json.DeleteClean(data, "user.temp")

	// 方式 2：Delete + 明示的設定（完全に等価）
	cfg := json.DefaultConfig()
	cfg.CleanupNulls = true
	cfg.CompactArrays = true
	r2, _ := json.Delete(data, "user.temp", cfg)

	fmt.Println(r1) // 出力：{}
	fmt.Println(r2) // 出力：{}
}
```

削除動作に影響する `Config` フィールド：

| フィールド | デフォルト | 削除への影響 |
|------|------|--------------|
| `CleanupNulls` | `false` | 結果の `null` 値と空オブジェクト/空配列を再帰的に削除（カスケードクリーンアップ） |
| `CompactArrays` | `false` | 配列の `null`/空要素を削除。有効化すると `CleanupNulls` を暗黙的に含む |
| `CreatePaths` | `true` | **削除には影響しない**（削除はパスを作成しません。ここは対比のための説明） |

## Delete と DeleteClean の比較

| 特性 | Delete | DeleteClean |
|------|--------|-------------|
| ターゲットノードの削除 | はい | はい |
| 配列要素削除後の再割り当て（穴なし） | はい | はい |
| 厳密パス欠落時のエラー | はい（`ErrPathNotFound`） | はい（`ErrPathNotFound`） |
| 削除によって生じた `null` のクリーンアップ | いいえ | はい |
| 空オブジェクト/空配列のクリーンアップ（カスケード） | いいえ | はい（階層を上へ） |
| ツリー全体の既存 `null` のスキャン削除 | いいえ | はい（グローバルクリーンアップ） |
| 等価な設定 | デフォルト | `CleanupNulls+CompactArrays` |
| 相対コスト | 低い | やや高い（ツリー全体のクリーンアップ走査が追加） |

## よくある落とし穴

::: warning 配列削除は穴を残しません
`Delete` で配列要素を削除すると、要素は**完全に削除**され、後続の要素が自動的に前に詰められます。`null` プレースホルダや穴は残りません。削除後もインデックスを維持したい（空席を残したい）場合、CyberGo の削除セマンティクスはその要件を満たしません——`Set` でその位置を `null` に設定してください。
:::

::: warning DeleteClean は「たまたま空」の正当なデータを誤って削除する可能性
`DeleteClean` のカスケードクリーンアップは、すべての空オブジェクト `{}`、空配列 `[]` をクリーンアップ対象と見なします。業務セマンティクスにおいて「空配列」や「空オブジェクト」が意味のある状態（例：`"tags":[]` が「フィールド欠落」ではなく「タグなし」を意味する）の場合、`DeleteClean` はキーも一緒に削除してしまいます。こうしたフィールドを保持したい場合は、通常の `Delete` を使ってください。
:::

::: warning バッチ削除はフォールトトレラントです
ワイルドカード/スライス/マルチフィールドパスは欠落ターゲットに対して**黙示的にスキップ**し、エラーを返しません。「ターゲットが必ず存在する」という厳格な検証セマンティクスが必要な場合は、厳密パス（`items[*]` ではなく `items[1]` など）を使ってください。
:::

## 複数フィールドのバッチ削除

複数の無関係なフィールドを一度に削除したい場合、通常の `Delete` をループで呼び出します（毎回前回の結果に基づいて）：

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
	// 出力：{"user":{"id":1,"name":"Alice"}}
}
```

## 関連

- [変更操作](./modify) - Set、マージなどの変更関数
- [クエリ取得関数](./query) - Get、GetString などのクエリ操作
- [Processor 削除メソッド](../processor/delete) - インスタンスメソッド版、メソッドチェーンに対応
- [設定リファレンス](../config) - CleanupNulls / CompactArrays などのフィールド詳細
