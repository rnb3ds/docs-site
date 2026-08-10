---
sidebar_label: "API 响应解析"
title: "API 响应解析 - CyberGo JSON | 分页与结构体反序列化"
description: "CyberGo JSON 解析 HTTP API 响应：ParseAny 解析任意值、Get/GetArray 提取嵌套数据、路径切片处理分页数组、GetTyped 反序列化到结构体。"
sidebar_position: 4
---

# API 响应解析

本文演示如何用 CyberGo JSON 解析典型的 HTTP API JSON 响应：提取响应状态与分页元信息、用路径切片处理数组、反序列化到结构体。

## 解析分页 API 响应

模拟一个 REST API 的分页响应，提取状态字段、分页元信息，用路径切片 `items[0:2]` 取子集，再逐元素提取字段。

```go
package main

import (
    "fmt"

    "github.com/cybergodev/json"
)

func main() {
    // 模拟一个分页 API 响应
    apiResponse := `{
        "status": "success",
        "data": {
            "page": 2,
            "per_page": 5,
            "total": 48,
            "items": [
                {"id": 6, "name": "项目六", "stars": 120},
                {"id": 7, "name": "项目七", "stars": 89},
                {"id": 8, "name": "项目八", "stars": 245},
                {"id": 9, "name": "项目九", "stars": 56},
                {"id": 10, "name": "项目十", "stars": 312}
            ]
        }
    }`

    // 1. 提取响应状态与分页元信息
    status := json.GetString(apiResponse, "status")
    page := json.GetInt(apiResponse, "data.page")
    total := json.GetInt(apiResponse, "data.total")
    fmt.Printf("状态: %s, 第 %d 页, 共 %d 条\n", status, page, total)

    // 2. 获取整个数据数组
    items := json.GetArray(apiResponse, "data.items")
    fmt.Printf("本页条目数: %d\n", len(items))

    // 3. 使用路径切片获取子集（取前 2 条）
    firstTwo, err := json.Get(apiResponse, "data.items[0:2]")
    if err != nil {
        panic(err)
    }
    fmt.Printf("前两条: %v\n", firstTwo)

    // 4. 遍历数组提取每个元素的字段
    for i := 0; i < len(items); i++ {
        name := json.GetString(apiResponse, fmt.Sprintf("data.items.%d.name", i))
        stars := json.GetInt(apiResponse, fmt.Sprintf("data.items.%d.stars", i))
        fmt.Printf("  - %s (%d stars)\n", name, stars)
    }
}
// 输出：
// 状态: success, 第 2 页, 共 48 条
// 本页条目数: 5
// 前两条: [map[id:6 name:项目六 stars:120] map[id:7 name:项目七 stars:89]]
//   - 项目六 (120 stars)
//   - 项目七 (89 stars)
//   - 项目八 (245 stars)
//   - 项目九 (56 stars)
//   - 项目十 (312 stars)
```

:::tip 提示
路径切片语法 `[start:end]` 返回数组子集，也可用 `[start:end:step]` 带步长切片、`[-1]` 取末尾元素、`[*]` 通配符遍历所有元素。完整语法见[路径表达式](../getting-started/path-syntax)。
:::

## 反序列化到结构体

用 `GetTyped[T]` 将整个响应或任意嵌套子对象反序列化为强类型结构体；用 `ParseAny` 获取 `any` 类型值（适合结构未知的场景）。

```go
package main

import (
    "fmt"

    "github.com/cybergodev/json"
)

// Repository 表示 API 响应中的仓库结构
type Repository struct {
    ID    int    `json:"id"`
    Name  string `json:"name"`
    Stars int    `json:"stars"`
}

// APIResponse 表示整个 API 响应
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

    // 1. 将整个响应反序列化为结构体（路径 "." 表示根对象）
    resp := json.GetTyped[APIResponse](apiResponse, ".")
    fmt.Printf("状态: %s, 共 %d 个仓库\n", resp.Status, resp.Data.Total)
    for _, repo := range resp.Data.Items {
        fmt.Printf("  #%d %s (%d stars)\n", repo.ID, repo.Name, repo.Stars)
    }

    // 2. 对单个嵌套对象使用 GetTyped（解码子对象到结构体）
    firstRepo := json.GetTyped[Repository](apiResponse, "data.items.0")
    fmt.Printf("第一个仓库: %+v\n", firstRepo)

    // 3. 使用 ParseAny 获取任意值（响应结构未知时适用）
    parsed, err := json.ParseAny(apiResponse)
    if err != nil {
        panic(err)
    }
    fmt.Printf("解析类型: %T\n", parsed)
}
// 输出：
// 状态: success, 共 3 个仓库
//   #1 cybergo-json (500 stars)
//   #2 cybergo-jwt (320 stars)
//   #3 cybergo-httpc (280 stars)
// 第一个仓库: {ID:1 Name:cybergo-json Stars:500}
// 解析类型: map[string]interface {}
```

## 下一步

- [基础示例](./index) — 路径查询、结构体编解码基础用法
- [高级示例](./examples-advanced) — SafeGet、批量操作等进阶用法
- [速查表](../getting-started/cheatsheet) — API 快速参考
- [路径表达式语法](../getting-started/path-syntax) — 切片、通配符、字段提取
