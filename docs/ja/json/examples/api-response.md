---
sidebar_label: "API レスポンス解析"
title: "API レスポンス解析 - CyberGo JSON | ページネーションと構造体逆シリアル化"
description: "CyberGo JSON で HTTP API レスポンスを解析：ParseAny で任意値をパースし、GetString/GetInt でステータスとページネーション情報、Get/GetArray でネストデータを抽出、GetTyped で構造体へ逆シリアル化、ForeachWithPath で要素ごとに走査。"
sidebar_position: 4
---

# API レスポンス解析

このドキュメントでは、CyberGo JSON を使って典型的な HTTP API JSON レスポンスを解析する方法を示します: レスポンスのステータスとページネーションメタデータの抽出、パススライスによる配列処理、構造体への逆シリアル化。

## ページネーション API レスポンスの解析

REST API のページネーションレスポンスをシミュレートし、ステータスフィールドとページネーションメタデータを抽出、パススライス `items[0:2]` で部分集合を取得して、要素ごとにフィールドを抽出します。

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	// ページネーション API レスポンスをシミュレート
	apiResponse := `{
        "status": "success",
        "data": {
            "page": 2,
            "per_page": 5,
            "total": 48,
            "items": [
                {"id": 6, "name": "プロジェクト6", "stars": 120},
                {"id": 7, "name": "プロジェクト7", "stars": 89},
                {"id": 8, "name": "プロジェクト8", "stars": 245},
                {"id": 9, "name": "プロジェクト9", "stars": 56},
                {"id": 10, "name": "プロジェクト10", "stars": 312}
            ]
        }
    }`

	// 1. ステータスとページネーションメタデータを抽出
	status := json.GetString(apiResponse, "status")
	page := json.GetInt(apiResponse, "data.page")
	total := json.GetInt(apiResponse, "data.total")
	fmt.Printf("ステータス: %s, %d ページ目, 計 %d 件\n", status, page, total)

	// 2. データ配列全体を取得
	items := json.GetArray(apiResponse, "data.items")
	fmt.Printf("ページの項目数: %d\n", len(items))

	// 3. パススライスで部分集合を取得（最初の 2 件）
	firstTwo, err := json.Get(apiResponse, "data.items[0:2]")
	if err != nil {
		panic(err)
	}
	fmt.Printf("最初の2件: %v\n", firstTwo)

	// 4. 配列を走査して各要素のフィールドを抽出（推奨: ForeachWithPath — 1 回のパースで要素ごとにアクセス）
	err = json.ForeachWithPath(apiResponse, "data.items", func(key any, item *json.IterableValue) {
		fmt.Printf("  - %s (%d stars)\n", item.GetString("name"), item.GetInt("stars"))
	})
	if err != nil {
		panic(err)
	}
}

// 出力:
// ステータス: success, 2 ページ目, 計 48 件
// ページの項目数: 5
// 最初の2件: [map[id:6 name:プロジェクト6 stars:120] map[id:7 name:プロジェクト7 stars:89]]
//   - プロジェクト6 (120 stars)
//   - プロジェクト7 (89 stars)
//   - プロジェクト8 (245 stars)
//   - プロジェクト9 (56 stars)
//   - プロジェクト10 (312 stars)
```

:::tip ヒント
パススライス構文 `[start:end]` は配列の部分集合を返します。`[start:end:step]` でステップ付きスライス、`[-1]` で末尾要素、`[*]` ワイルドカードで全要素を走査することもできます。完全な構文は[パス式](../getting-started/path-syntax)を参照してください。

配列を走査する際は、ループでパスを組み立てる方法（`fmt.Sprintf("data.items.%d.name", i)` で 1 件ずつクエリ）ではなく **`ForeachWithPath` を優先**してください: 前者は 1 回だけパースし、各要素の中で直接フィールド名で値を取得でき、コードもより簡潔です。後者はパスごとに独立したクエリが発生します。
:::

## 複数フィールドの一括取得

レスポンスから抽出するフィールドが多い場合、`GetMultiple` は 1 回のパースですべてのパスの値を取得できます（結果 map はパスをキーとします）。`Get` を逐次呼び出すよりもお得です:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	apiResponse := `{
        "status": "success",
        "data": {
            "page": 2,
            "per_page": 5,
            "total": 48,
            "items": [
                {"id": 6, "name": "プロジェクト6", "stars": 120},
                {"id": 7, "name": "プロジェクト7", "stars": 89}
            ]
        }
    }`

	values, err := json.GetMultiple(apiResponse, []string{
		"status",
		"data.page",
		"data.per_page",
		"data.total",
		"data.items.0.name",
	})
	if err != nil {
		panic(err)
	}

	fmt.Printf("%s | %v/%v ページ目、計 %v 件、先頭: %v\n",
		values["status"], values["data.page"], values["data.per_page"],
		values["data.total"], values["data.items.0.name"])
}

// 出力: success | 2/5 ページ目、計 48 件、先頭: プロジェクト6
```

:::tip 注意
いずれかのパスが失敗（存在しない、または不正）すると、`GetMultiple` は**最初の**エラーを返し、そのパスの値は結果 map で `nil` になります。したがって「フィールドが必ず存在する」レスポンスの抽出に適しています。オプションフィールドには、デフォルト値付きの `GetString(apiResponse, "path", "デフォルト値")` または後述の `SafeGet` を使ってください。
:::

## SafeGet による安全なアクセス

`SafeGet` は error を返さず、代わりに `AccessResult` を返します: `Ok()` で存在を判定、`AsInt`/`AsString` などのメソッドで必要に応じて変換、`UnwrapOr` でデフォルト値を提供——フィールドの型が不安定だったりオプションだったりするサードパーティレスポンスに適しており、途中で一切 panic しません:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	apiResponse := `{
        "status": 200,
        "message": "ok",
        "retry_after": "30",
        "trace_id": "abc-123"
    }`

	// status は数値（JSON の数値は float64 としてパースされる）。Type フィールドが実行時型を報告
	status := json.SafeGet(apiResponse, "status")
	fmt.Println("status の型:", status.Type)
	if code, err := status.AsInt(); err == nil {
		fmt.Println("ステータスコード:", code)
	}

	// retry_after は文字列形式の秒数
	retry := json.SafeGet(apiResponse, "retry_after")
	if secs, err := retry.AsString(); err == nil {
		fmt.Println("再試行待ち(秒):", secs)
	}

	// 存在しないパス: Ok() は false、UnwrapOr がフォールバック値を提供
	deprecated := json.SafeGet(apiResponse, "deprecated_field")
	fmt.Println("非推奨フィールドの存在:", deprecated.Ok())
	fmt.Println("非推奨フィールドのフォールバック:", deprecated.UnwrapOr("none"))
}

// 出力:
// status の型: float64
// ステータスコード: 200
// 再試行待ち(秒): 30
// 非推奨フィールドの存在: false
// 非推奨フィールドのフォールバック: none
```

厳密な変換が失敗した場合、`As*` メソッドはサイレントなゼロ値ではなくエラーを返すため、「フィールドの欠落」と「値が 0」を混同しません。緩い変換（任意の型から文字列表現への変換など）が必要な場合は `AsStringConverted` を使ってください。

## 構造体への逆シリアル化

`GetTyped[T]` でレスポンス全体または任意のネストサブオブジェクトを強く型付けされた構造体へ逆シリアル化します。`ParseAny` は `any` 型の値を取得します（構造が未知のシナリオに適しています）。

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

// Repository は API レスポンス内のリポジトリ構造を表します
type Repository struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Stars int    `json:"stars"`
}

// APIResponse は API レスポンス全体を表します
type APIResponse struct {
	Status string `json:"status"`
	Data   struct {
		Page  int          `json:"page"`
		Total int          `json:"total"`
		Items []Repository `json:"items"`
	} `json:"data"`
}

func main() {
	apiResponse := `{
        "status": "success",
        "data": {
            "page": 1,
            "total": 3,
            "items": [
                {"id": 1, "name": "cybergo-json", "stars": 500},
                {"id": 2, "name": "cybergo-jwt", "stars": 320},
                {"id": 3, "name": "cybergo-httpc", "stars": 280}
            ]
        }
    }`

	// 1. レスポンス全体を構造体へ逆シリアル化（パス "." はルートオブジェクトを表す）
	resp := json.GetTyped[APIResponse](apiResponse, ".")
	fmt.Printf("ステータス: %s, リポジトリ計 %d 件\n", resp.Status, resp.Data.Total)
	for _, repo := range resp.Data.Items {
		fmt.Printf("  #%d %s (%d stars)\n", repo.ID, repo.Name, repo.Stars)
	}

	// 2. 単一のネストオブジェクトに GetTyped を使用（サブオブジェクトを構造体へデコード）
	firstRepo := json.GetTyped[Repository](apiResponse, "data.items.0")
	fmt.Printf("最初のリポジトリ: %+v\n", firstRepo)

	// 3. ParseAny で任意の値を取得（レスポンス構造が未知の場合に適用）
	parsed, err := json.ParseAny(apiResponse)
	if err != nil {
		panic(err)
	}
	fmt.Printf("パース型: %T\n", parsed)
}

// 出力:
// ステータス: success, リポジトリ計 3 件
//   #1 cybergo-json (500 stars)
//   #2 cybergo-jwt (320 stars)
//   #3 cybergo-httpc (280 stars)
// 最初のリポジトリ: {ID:1 Name:cybergo-json Stars:500}
// パース型: map[string]interface {}
```

## 次のステップ

- [基本サンプル](./index) — パスクエリ、構造体エンコード/デコードの基本用法
- [高度なサンプル](./examples-advanced) — SafeGet、バッチ操作などの応用用法
- [チートシート](../getting-started/cheatsheet) — API クイックリファレンス
- [パス式の構文](../getting-started/path-syntax) — スライス、ワイルドカード、フィールド抽出
