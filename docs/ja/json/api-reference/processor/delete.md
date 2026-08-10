---
sidebar_label: "削除操作"
title: "Processor 削除メソッド - CyberGo JSON | API リファレンス"
description: "CyberGo JSON Processor 削除メソッド：Delete はパスで削除、DeleteClean は削除後に null 値と空配列を自動クリーンアップし、メソッドチェーンの能力を保持します。"
sidebar_position: 4
---

# 削除メソッド

Processor はデータ削除メソッドを提供し、指定したパスの値を削除して変更後の JSON 文字列を返します。すべてのメソッドは**イミュータブル**です——新しい文字列を返し、元の入力は変更されません。エラー時は元の入力を返します。[パッケージレベルの削除関数](../functions/delete)と動作は同じですが、インスタンスメソッドはプロセッサ自身の設定、キャッシュ、フックと連携できる点が異なります。

## Delete

シグネチャ：`func (p *Processor) Delete(jsonStr, path string, cfg ...Config) (result string, err error)`

指定したパスの値を削除し、変更後の JSON 文字列を返します。

<!-- check-code: skip -->
```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

result, err := p.Delete(data, "user.temporary")
```

### 完全な例：オブジェクトプロパティ、配列要素、ネストされたパス

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// オブジェクトプロパティの削除
	r1, err := p.Delete(`{"user":{"name":"Alice","temp":"x"}}`, "user.temp")
	if err != nil {
		panic(err)
	}
	fmt.Println(r1)
	// 出力：{"user":{"name":"Alice"}}

	// 配列要素の削除（削除して再割り当て、穴は残さない）
	r2, err := p.Delete(`{"items":["a","b","c"]}`, "items[1]")
	if err != nil {
		panic(err)
	}
	fmt.Println(r2)
	// 出力：{"items":["a","c"]}

	// ネストされたパスの削除
	r3, err := p.Delete(`{"a":{"b":{"c":1,"d":2}}}`, "a.b.c")
	if err != nil {
		panic(err)
	}
	fmt.Println(r3)
	// 出力：{"a":{"b":{"d":2}}}
}
```

### 高度なパス：ワイルドカードとスライス

`Delete` は Get/Set と同じパスエンジンを再利用し、ワイルドカード、スライス範囲、マルチフィールド抽出に対応します。バッチパス（`*`、`{}`、`:` を含む）は欠落ターゲットを黙示的にスキップし、エラーになりません。

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data := `{"users":[{"name":"Alice","pwd":"x"},{"name":"Bob","pwd":"y"}],"tags":[1,2,3,4]}`

	// ワイルドカード：各ユーザーの pwd を削除
	r1, err := p.Delete(data, "users[*].pwd")
	if err != nil {
		panic(err)
	}
	fmt.Println(r1)
	// 出力：{"tags":[1,2,3,4],"users":[{"name":"Alice"},{"name":"Bob"}]}

	// スライス範囲：tags[0:2] を削除（左閉右開）
	r2, err := p.Delete(data, "tags[0:2]")
	if err != nil {
		panic(err)
	}
	fmt.Println(r2)
	// 出力：{"tags":[3,4],"users":[{"name":"Alice","pwd":"x"},{"name":"Bob","pwd":"y"}]}
}
```

### エラー処理

厳密パスのターゲットが存在しない場合、`ErrPathNotFound` をラップしたエラーを返し、元の入力は変更されません。`errors.Is` で判定します：

```go
package main

import (
	"errors"
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, _ := json.New()
	defer p.Close()

	result, err := p.Delete(`{"a":1}`, "nonexistent.path")
	if err != nil {
		if errors.Is(err, json.ErrPathNotFound) {
			fmt.Println("パスが存在しません、スキップしました")
		}
	}
	fmt.Println(result) // 元のデータは不変：{"a":1}
	// 出力：
	// パスが存在しません、スキップしました
	// {"a":1}
}
```

## DeleteClean

シグネチャ：`func (p *Processor) DeleteClean(jsonStr, path string, cfg ...Config) (string, error)`

指定したパスを削除し、削除によって生じた `null` 値と空オブジェクト/空配列を**再帰的にクリーンアップ**します。`Delete` で `CleanupNulls: true` + `CompactArrays: true` を強制的に有効化するのと等価です。

### カスケードクリーンアップ：親オブジェクトが空になったら自動削除

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, _ := json.New()
	defer p.Close()

	// temp は user の唯一のプロパティ
	data := `{"user":{"temp":"value"}}`

	// 通常の削除：user は {} になるが保持される
	r1, _ := p.Delete(data, "user.temp")
	fmt.Println(r1) // 出力：{"user":{}}

	// DeleteClean：user が空になった後、user キーも一緒にクリーンアップ、階層を上へ
	r2, err := p.DeleteClean(data, "user.temp")
	if err != nil {
		panic(err)
	}
	fmt.Println(r2) // 出力：{}
}
```

### API レスポンスのクリーンアップ

ターゲットフィールドを削除すると同時に、ツリー全体の他の `null` と残った空コンテナもスキャンして削除します：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, _ := json.New()
	defer p.Close()

	apiResp := `{"data":{"id":1,"name":"Product","desc":null,"price":29.99}}`

	cleaned, err := p.DeleteClean(apiResp, "data.desc")
	if err != nil {
		panic(err)
	}
	fmt.Println(cleaned)
	// 出力：{"data":{"id":1,"name":"Product","price":29.99}}
}
```

::: warning DeleteClean はツリー全体の null をスキャンして削除します
`DeleteClean` のクリーンアップは**グローバル**です：JSON ツリー全体に対して再帰的にクリーンアップを実行するため、削除ポイントで生じたものだけでなく、ドキュメント内の**すべて**の既存 `null` と空コンテナが削除されます。指定フィールドだけを削除し、他の `null` を保持したい場合は通常の `Delete` を使ってください。
:::

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

## Config が削除動作に与える影響

削除メソッドのクリーンアップ動作は「**呼び出し時の引数 `cfg` とプロセッサ自身の設定の和集合**」で決まります。つまり、プロセッサ作成時に `CleanupNulls` を有効化していれば、以降の通常の `p.Delete(...)` も自動的にクリーンアップします：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	// デフォルトでクリーンアップを有効化したプロセッサを作成
	cfg := json.DefaultConfig()
	cfg.CleanupNulls = true
	cfg.CompactArrays = true
	p, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data := `{"user":{"temp":"value"}}`

	// プロセッサ自身の設定が有効なため、通常の Delete でもクリーンアップされる
	result, err := p.Delete(data, "user.temp")
	if err != nil {
		panic(err)
	}
	fmt.Println(result) // 出力：{}
}
```

削除動作に影響する `Config` フィールド：

| フィールド | デフォルト | 削除への影響 |
|------|------|--------------|
| `CleanupNulls` | `false` | 結果の `null` と空オブジェクト/空配列を再帰的に削除（カスケード） |
| `CompactArrays` | `false` | 配列の `null`/空要素を削除。有効化すると `CleanupNulls` を暗黙的に含む |
| `CreatePaths` | `true` | **削除には影響しない**（削除はパスを作成しない） |

> したがって `DeleteClean(s, p)` は `CleanupNulls+CompactArrays` のプロセッサ上で `Delete(s, p)` を呼び出すのと同じ効果です——セマンティクスがより明確な書き方を選べばよいです。

## チェーン削除

削除メソッドは新しい文字列を返すため、次の呼び出しに直接渡して、チェーン変更フローを構成できます：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, _ := json.New()
	defer p.Close()

	data := `{"user":{"name":"Alice","temp":"x","version":"1.0.0"}}`

	// チェーン：まず設定し、次に削除。各ステップは前のステップの結果に基づく
	r1, _ := p.Set(data, "user.name", "CyberGo")
	r2, _ := p.Delete(r1, "user.temp")
	final, _ := p.Delete(r2, "user.version")

	fmt.Println(final)
	// 出力：{"user":{"name":"CyberGo"}}
}
```

## よくある落とし穴

::: warning 配列削除は穴を残しません
`Delete` で配列要素を削除すると、要素は**完全に削除**され、後続の要素が自動的に前に詰められます。`null` プレースホルダや穴は残りません。「削除後もインデックスを維持し、空席を残す」セマンティクスが必要な場合は、`Set` でその位置を `null` に設定してください。
:::

::: warning DeleteClean は「たまたま空」の正当なデータを誤って削除する可能性
`DeleteClean` のカスケードクリーンアップは、すべての空オブジェクト `{}`、空配列 `[]` をクリーンアップ対象と見なします。業務において「空配列」が意味のある状態（例：`"tags":[]` が「タグなし」を意味する）の場合、`DeleteClean` はキーも一緒に削除してしまいます。こうしたフィールドを保持したい場合は、通常の `Delete` を使ってください。
:::

::: warning バッチ削除はフォールトトレラントです
ワイルドカード/スライス/マルチフィールドパスは欠落ターゲットに対して**黙示的にスキップ**し、エラーを返しません。「ターゲットが必ず存在する」という厳格な検証セマンティクスが必要な場合は、厳密パス（`items[*]` ではなく `items[1]` など）を使ってください。
:::

## 関連

- [変更操作](./modify) - Set/SetCreate チェーン変更
- [削除関数](../functions/delete) - パッケージレベルの Delete/DeleteClean 関数（完全なパス構文リファレンス含む）
- [設定リファレンス](../config) - CleanupNulls / CompactArrays などのフィールド詳細
