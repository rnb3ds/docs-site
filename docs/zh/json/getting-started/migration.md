---
title: "从标准库迁移 - CyberGo JSON | encoding/json 兼容指南"
description: "CyberGo JSON 100% 兼容 encoding/json，import 路径替换即可零改动迁移。附函数对照表、行为差异与增量功能指南。"
sidebar_label: "从标准库迁移"
sidebar_position: 1.5
---

# 从标准库迁移

`cybergodev/json` 与标准库 `encoding/json` **100% 兼容**——只需替换 import 路径，现有代码无需任何改动即可编译运行。本页帮助你完成迁移，并了解迁移后可用的增量能力。

## 三步迁移

1. **安装**：

   ```bash
   go get github.com/cybergodev/json
   ```

2. **替换 import**：将 `"encoding/json"` 替换为 `"github.com/cybergodev/json"`。

   ```go
   // 迁移前
   import "encoding/json"

   // 迁移后
   import "github.com/cybergodev/json"
   ```

3. **完成**：编译通过，所有现有代码无需修改。

## 完全兼容的 API

下表列出 `encoding/json` 与 `cybergodev/json` 的对应关系：

| encoding/json | cybergodev/json | 说明 |
|---|---|---|
| `Marshal(v)` | `Marshal(v, cfg...)` | 签名兼容，额外可选 cfg 参数 |
| `Unmarshal(data, &v)` | `Unmarshal(data, &v, cfg...)` | 同上 |
| `MarshalIndent(v, prefix, indent)` | 同名 | 完全兼容 |
| `Compact(dst, src)` | 同名 | 完全兼容 |
| `Indent(dst, src, prefix, indent)` | 同名 | 完全兼容 |
| `HTMLEscape(dst, src)` | 同名 | 完全兼容 |
| `Valid(data)` | `Valid(data, cfg...)` | 签名兼容 |
| `NewEncoder(w)` | `NewEncoder(w, cfg...)` | 签名兼容 |
| `NewDecoder(r)` | `NewDecoder(r, cfg...)` | 签名兼容 |
| `Number` | `Number` | 类型兼容 |
| `Delim` | `Delim` | 类型兼容 |
| `Token` | `Token` | 类型兼容 |

::: tip 可选的 cfg 参数
所有额外的 `cfg ...Config` 参数都是**可选的**（variadic）。不传时，行为与标准库完全一致；需要启用安全模式、缓存等增强能力时才传入。
:::

## 代码示例：只改 import

下面的示例展示「只改 import」的替换效果，编码、解码与结构体标签（struct tag）用法与 `encoding/json` 完全相同：

```go
package main

import (
    "fmt"

    "github.com/cybergodev/json"
)

func main() {
    type User struct {
        Name string   `json:"name"`
        Age  int      `json:"age"`
        Tags []string `json:"tags"`
    }

    // 编码 — 与 encoding/json 完全相同
    user := User{Name: "Alice", Age: 30, Tags: []string{"go", "json"}}
    b, err := json.Marshal(user)
    if err != nil {
        panic(err)
    }
    fmt.Println(string(b))
    // 输出：{"name":"Alice","age":30,"tags":["go","json"]}

    // 解码 — 与 encoding/json 完全相同
    var u User
    if err := json.Unmarshal(b, &u); err != nil {
        panic(err)
    }
    fmt.Printf("%+v\n", u)
    // 输出：{Name:Alice Age:30 Tags:[go json]}
}
```

## 增量能力

迁移后，你在保持标准库兼容的同时，还能按需使用以下标准库做不到的能力：

| 能力 | 示例 | 了解更多 |
|---|---|---|
| 路径查询 | `json.GetString(data, "user.name")` | [路径表达式语法](./path-syntax) |
| 带默认值获取 | `json.GetInt(data, "timeout", 30)` | [查询获取](../api-reference/functions/query) |
| 泛型获取 | `json.GetTyped[User](data, "user")` | [泛型操作](../api-reference/generics) |
| 路径修改 | `json.Set(data, "user.name", "Bob")` | [修改操作](../api-reference/functions/modify) |
| Schema 验证 | `json.ValidateSchema(data, schema)` | [验证器](../extensions/validator) |
| 流式 JSONL | `json.StreamLinesInto[T](r, fn)` | [JSONL 处理](../streaming/jsonl) |
| 高性能处理器 | `p, _ := json.New()` | [Processor 入门](./processor-guide) |

## 行为差异

在**默认配置**下，`cybergodev/json` 的行为与 `encoding/json` 完全一致。所有额外能力（安全模式、路径查询、Schema 验证等）都是 **opt-in** 的——通过 `Config` 参数显式启用，不会影响现有代码。

换句话说：迁移是零成本的，你获得的是一个「标准库 + 增量能力」的超集。

## 下一步

- [快速开始](./) — 5 分钟上手核心功能
- [路径表达式语法](./path-syntax) — 学习路径查询语法
- [速查表](./cheatsheet) — API 快速参考
