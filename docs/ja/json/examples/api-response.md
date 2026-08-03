---
sidebar_label: "API レスポンス解析"
title: "API レスポンス解析 - CyberGo JSON | ページネーションと構造体"
description: "CyberGo JSON で HTTP API レスポンスを解析: ParseAny で任意の値、Get/GetArray でネストデータ抽出、パススライスでページネーション配列処理、GetTyped で構造体へ逆シリアル化。"
sidebar_position: 4
---

# API レスポンス解析

このドキュメントでは、CyberGo JSON を使って典型的な HTTP API JSON レスポンスを解析する方法を示します: ステータスとページネーションメタデータの抽出、パス式による配列スライス、構造体への逆シリアル化。

## ページネーション API レスポンスの解析

ページネーション REST API レスポンスをシミュレートし、ステータスとページネーションメタデータを抽出、`items[0:2]` スライスで部分集合を取得し、要素ごとにフィールドを抽出します。

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

    // 4. 配列を走査して各要素のフィールドを抽出
    for i := 0; i < len(items); i++ {
        name := json.GetString(apiResponse, fmt.Sprintf("data.items.%d.name", i))
        stars := json.GetInt(apiResponse, fmt.Sprintf("data.items.%d.stars", i))
        fmt.Printf("  - %s (%d stars)\n", name, stars)
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
パススライス構文 `[start:end]` は配列の部分集合を返します。`[start:end:step]` でステップ付きスライス、`[-1]` で末尾要素、`[*]` ワイルドカードで全要素を走査できます。完全な文法は[パス文法](../getting-started/path-syntax)を参照してください。
:::

## 構造体への逆シリアル化

`GetTyped[T]` でレスポンス全体または任意のネストサブオブジェクトを強い型付けの構造体へ逆シリアル化します。構造が未知の場合は `ParseAny` で `any` 値を取得します。

```go
package main

import (
    "fmt"

    "github.com/cybergodev/json"
)

// Repository は API レスポンスのリポジトリ構造を表します
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

    // 1. レスポンス全体を構造体へ逆シリアル化（パス "." はルートオブジェクト）
    resp := json.GetTyped[APIResponse](apiResponse, ".")
    fmt.Printf("ステータス: %s, リポジトリ %d 件\n", resp.Status, resp.Data.Total)
    for _, repo := range resp.Data.Items {
        fmt.Printf("  #%d %s (%d stars)\n", repo.ID, repo.Name, repo.Stars)
    }

    // 2. 単一のネストオブジェクトに GetTyped を使用（サブオブジェクトを構造体へデコード）
    firstRepo := json.GetTyped[Repository](apiResponse, "data.items.0")
    fmt.Printf("最初のリポジトリ: %+v\n", firstRepo)

    // 3. レスポンス構造が未知の場合に ParseAny を使用（任意の値）
    parsed, err := json.ParseAny(apiResponse)
    if err != nil {
        panic(err)
    }
    fmt.Printf("パース型: %T\n", parsed)
}
// 出力:
// ステータス: success, リポジトリ 3 件
//   #1 cybergo-json (500 stars)
//   #2 cybergo-jwt (320 stars)
//   #3 cybergo-httpc (280 stars)
// 最初のリポジトリ: {ID:1 Name:cybergo-json Stars:500}
// パース型: map[string]interface {}
```

## 次のステップ

- [基本サンプル](./index) — パスクエリ、構造体エンコードの基本
- [高度なサンプル](./examples-advanced) — SafeGet、バッチ操作など
- [チートシート](../getting-started/cheatsheet) — クイック API リファレンス
- [パス文法](../getting-started/path-syntax) — スライス、ワイルドカード、フィールド抽出
