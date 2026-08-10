---
sidebar_label: "Processor 入门"
title: "Processor 入门 - CyberGo JSON | 何时使用处理器"
description: "CyberGo JSON Processor 入门：包函数与 Processor 选择标准、PreParse 预解析优化、生命周期管理与全局处理器，掌握高性能 JSON 处理。"
sidebar_position: 3
---

# Processor 入门

本指南帮助你理解**何时**以及**如何**使用 Processor，相比包级函数能带来什么优势。

## 包函数 vs Processor

CyberGo JSON 提供两种 API 风格：

| 维度 | 包级函数 | Processor |
|------|----------|-----------|
| **典型调用** | `json.GetString(data, "name")` | `p.GetString(data, "name")` |
| **创建方式** | 无需创建，直接调用 | `p, err := json.New()` |
| **配置方式** | 每次调用传入 `cfg ...Config` | 创建时统一配置，后续复用 |
| **缓存** | 全局共享缓存 | 独立缓存，可控可清理 |
| **资源管理** | 自动（全局处理器） | 手动 `Close()` |
| **钩子系统** | 不支持 | 支持 `AddHook` |
| **预解析** | 不支持 | 支持 `PreParse` + `GetFromParsed` |
| **适用场景** | 简单操作、脚本、低频调用 | 高频操作、自定义配置、服务端 |

::: tip 快速判断
- **用包函数**：偶尔操作 JSON、不想管理生命周期、快速脚本
- **用 Processor**：需要自定义配置、高频查询同一数据、需要钩子/审计
:::

## 什么时候用 Processor

### 场景 1：自定义配置

包级函数使用默认配置。如果需要安全模式、自定义编码器或钩子，使用 Processor：

```go
// 包函数 — 始终使用默认配置
val := json.GetString(data, "name")

// Processor — 可自定义配置
cfg := json.SecurityConfig() // 安全模式
p, err := json.New(cfg)
if err != nil {
    panic(err)
}
defer p.Close()

// 后续所有操作都使用安全配置
val, err := p.Get(data, "name")
```

### 场景 2：高频查询同一数据（PreParse 优化）

对同一 JSON 多次查询时，`PreParse` 只解析一次，后续查询复用解析结果：

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

// 一次解析
parsed, err := p.PreParse(largeJSON)
if err != nil {
    panic(err)
}

// 多次查询 — 复用解析结果，避免重复解析
name, _ := p.GetFromParsed(parsed, "user.name")
email, _ := p.GetFromParsed(parsed, "user.email")
tags, _ := p.GetFromParsed(parsed, "tags")
```

::: warning 性能对比
- 包函数 `GetString`：每次调用都会解析 JSON（有缓存但命中率取决于场景）
- `PreParse` + `GetFromParsed`：解析一次，N 次查询只做导航，零重复解析
:::

### 场景 3：钩子与审计

需要日志记录、性能监控或输入验证时，Processor 支持钩子系统：

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

// 添加日志钩子
p.AddHook(json.LoggingHook(slog.Default()))
// 添加计时钩子
p.AddHook(json.TimingHook(&metricsRecorder))

// 所有操作自动触发钩子
result, err := p.Set(data, "user.name", "Alice")
```

详见 [Hook 钩子系统](../extensions/hooks)。

## 生命周期管理

Processor 持有资源（缓存、goroutine），使用后**必须关闭**：

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close() // 确保资源释放

// 使用 Processor...
result, err := p.GetString(data, "name")
```

::: warning 忘记 Close 的后果
- 缓存内存不会释放
- 后台 goroutine 泄漏
- 高并发场景下可能导致资源耗尽
:::

### 检查状态

```go
if p.IsClosed() {
    // Processor 已关闭，不可再使用
}
```

## 全局处理器

包级函数（`Get`、`Set`、`Marshal` 等）内部使用**全局处理器**。你也可以替换它：

```go
// 创建自定义配置的处理器
cfg := json.SecurityConfig()
p, err := json.New(cfg)
if err != nil {
    panic(err)
}

// 设置为全局处理器
json.SetGlobalProcessor(p)

// 现在所有包级函数都使用安全配置
val := json.GetString(data, "name")

// 应用退出时清理
defer json.ShutdownGlobalProcessor()
```

::: tip 适用场景
- 全局统一安全策略
- 自定义编码器全局生效
- 需要替换默认配置而无需到处传 Config
:::

## 选择决策树

```
需要操作 JSON？
├── 偶尔使用、脚本工具
│   └── → 用包函数 json.GetString / json.Set / json.Marshal
├── 需要自定义配置（安全/编码/钩子）
│   └── → 用 Processor json.New(cfg)
├── 对同一 JSON 多次查询
│   └── → 用 Processor + PreParse
├── 需要审计/监控/日志
│   └── → 用 Processor + AddHook
└── 全局统一配置
    └── → 用 SetGlobalProcessor
```

## 下一步

- [路径表达式语法](./path-syntax) — 路径查询完整语法
- [Processor API](../api-reference/processor/) — 完整方法参考
- [性能优化](../advanced/performance) — 深入性能调优
- [速查表](./cheatsheet) — API 快速参考
