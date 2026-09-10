---
sidebar_label: "概述"
title: "API 参考 - CyberGo JSON | 完整函数文档"
description: "CyberGo JSON API 参考：GetString/GetInt 路径查询、Set/Delete 修改、Marshal/Unmarshal 序列化、Processor 处理器与 Schema 验证，涵盖包级函数与实例方法两种风格，100% 兼容标准库。"
sidebar_position: 1
---

# API 参考

本节提供 `github.com/cybergodev/json` 库的完整 API 参考。

::: tip 两种 API 风格
本库提供 **包级函数**（如 `json.GetString(data, "path")`，无需创建实例）和 **Processor 方法**（如 `p.GetString(data, "path")`，支持配置复用、预解析缓存与钩子系统）两套 API。不确定该用哪个？参阅 [Processor 入门](../getting-started/processor-guide) 的选择决策树。
:::

## 模块索引

### 函数 API

| 模块 | 说明 |
|------|------|
| [包函数](./functions/) | 包级函数参考（查询/修改/删除/编码/解析/批量/JSONL/文件/迭代） |
| [Processor](./processor/) | 处理器方法（与包函数镜像分类，额外含生命周期与预解析） |

### 类型与接口

| 模块 | 说明 |
|------|------|
| [Config](./config) | 配置选项详解（DefaultConfig / SecurityConfig / PrettyConfig） |
| [类型定义](./types) | 核心类型（Config / Schema / Stats / AccessResult，含 Encoder / Decoder、CompiledPath / PathSegment） |
| [接口定义](./interfaces) | 扩展接口（CustomEncoder / Validator / Hook / PathParser） |
| [迭代器与 IterableValue](./iterator) | Iterator / BatchIterator / ParallelIterator / StreamIterator 类型 |
| [泛型操作](./generics) | 泛型 API（GetTyped[T] / StreamLinesInto[T] / Result[T]） |
| [常量与错误](./constants) | 常量和错误类型（含 `Default*` 常量与 Config 字段对照表） |

### 工具与辅助

| 模块 | 说明 |
|------|------|
| [工具函数](./helpers) | CompareJSON / MergeJSON、缓存管理、全局处理器、SafeError / RedactedPath、AccessResult 方法 |
| [格式化输出](../getting-started/print) | Print 系列迁移指南（已移除 API 的替代方案） |

### 跨模块专题

| 模块 | 说明 |
|------|------|
| [流式处理](../streaming/large-files) | 大文件流式处理指南 |
| [JSONL / NDJSON 处理](../streaming/jsonl) | JSONL 处理器（StreamJSONL / NDJSONProcessor / JSONLWriter） |
| [安全验证](../security/security-mode) | 安全模式 API（SecurityConfig / DangerousPattern / RegisterDangerousPattern） |
| [Schema 校验](./schema) | Schema 验证（ValidateSchema / DefaultSchema / NewSchemaWithConfig） |
| [Hook 钩子系统](../extensions/hooks) | 操作拦截钩子（LoggingHook / TimingHook / ValidationHook / ErrorHook） |
| [自定义编码器](../extensions/custom-encoder) | 自定义编码器（CustomEncoder / TypeEncoder） |

## 快速查找

### 按功能分类

#### 路径查询

| 函数 | 说明 |
|------|------|
| `Get`, `GetWithContext`, `GetString`, `GetInt`, `GetFloat`, `GetBool`, `GetArray`, `GetObject` | 类型安全获取 |
| `GetTyped[T]` | 泛型获取 |
| `SafeGet` | 安全获取 AccessResult |
| `GetMultiple` | 批量获取 |

#### 修改操作

| 函数 | 说明 |
|------|------|
| `Set`, `SetMultiple` | 设置值 |
| `SetCreate`, `SetMultipleCreate` | 设置值并自动创建路径 |
| `Delete`, `DeleteClean` | 删除值 |
| `ProcessBatch` | 批量操作 |

#### 编解码

| 函数 | 说明 |
|------|------|
| `Marshal`, `Unmarshal` | 标准编解码（兼容 `encoding/json`，可附加 `cfg`） |
| `MarshalIndent` | 格式化编码（兼容 `encoding/json.MarshalIndent`，可附加 `cfg`） |
| `EncodeWithConfig`, `EncodePretty` | 编码为字符串（带配置 / 格式化输出） |
| `Encode`（已废弃） | 与 `EncodeWithConfig` 功能等价，将在未来大版本移除——新代码请改用 `Marshal` 或 `EncodeWithConfig` |
| `NewEncoder`, `NewDecoder` | 流式编解码 |
| `Parse`, `ParseAny` | 解析到目标变量 / 解析为 `any` |
| `EncodeBatch`, `EncodeFields`, `EncodeStream` | 键值对编码为对象 / 按字段挑选编码 / 多值编码为数组 |

#### 格式化

| 函数 | 说明 |
|------|------|
| `Prettify` | 格式化 JSON |
| `Compact` | 压缩 JSON（buffer 形式，兼容 `encoding/json.Compact`） |
| `CompactString` | 压缩 JSON（字符串输入/输出形式，镜像 `Processor.Compact`） |
| `Indent` | 缩进格式化并写入 buffer（兼容 `encoding/json.Indent`） |
| `HTMLEscape` | HTML 字符转义并写入 buffer（兼容 `encoding/json.HTMLEscape`） |

#### 文件操作

| 函数 | 说明 |
|------|------|
| `LoadFromFile`, `SaveToFile` | 文件读写 |
| `LoadFromReader` | 从 Reader 读取 |
| `MarshalToFile`, `UnmarshalFromFile` | 文件编解码 |
| `SaveToWriter` | 写入任意 Writer |

#### 迭代遍历

| 函数 | 说明 |
|------|------|
| `Foreach`, `ForeachWithError`, `ForeachNested`, `ForeachNestedWithError` | 遍历数组/对象（含深度遍历） |
| `ForeachWithPath`, `ForeachWithPathAndIterator`, `ForeachWithPathAndControl` | 指定路径遍历（携带当前路径/可控制中断） |
| `ForeachReturn` | 遍历并返回修改后的 JSON |
| `ForeachFile`, `ForeachFileWithPath`, `ForeachFileChunked`, `ForeachFileNested` | 大文件流式迭代 |
| `NewIterator`, `NewBatchIterator`, `NewParallelIterator`, `NewStreamIterator` | 独立迭代器构造（详见[迭代器](./iterator)） |

#### 缓存与全局

| 函数 | 说明 |
|------|------|
| `WarmupCache`, `ClearCache` | 缓存预热 / 清理 |
| `GetStats`, `GetHealthStatus` | 运行统计 / 健康检查 |
| `GetConfig`, `SetLogger` | 处理器配置读取 / 日志注入（含全局与 Processor 方法） |
| `SetGlobalProcessor`, `ShutdownGlobalProcessor` | 全局处理器替换与关闭 |
| `RegisterDangerousPattern`, `UnregisterDangerousPattern`, `ListDangerousPatterns` | 全局危险模式注册表的注册 / 移除 / 列举（详见[工具函数](./helpers#registerdangerouspattern)） |
| `CompilePath`（Processor）, `PreParse`（Processor） | 路径预编译 / JSON 预解析 |

#### 流式处理

| 类型/方法 | 说明 |
|------|------|
| `StreamLinesInto[T]` | 从 Reader 流式读取 JSONL 并转换为 `[]T` |
| `ParseJSONL` | 解析 JSONL 字节为 `[]any` |
| `ToJSONL`, `ToJSONLString` | 将 `[]any` 转换为 JSONL 格式 |
| `JSONLWriter` | JSONL 写入器（Write/WriteAll/WriteRaw） |
| `NDJSONProcessor` | NDJSON/JSONL 处理器（由 `NewNDJSONProcessor` 创建） |
| `ForeachFile` | 文件流式处理 |

#### 验证

| 函数 | 说明 |
|------|------|
| `Valid` | JSON 验证（兼容 `encoding/json.Valid`） |
| `ValidWithConfig` | 带配置的 JSON 验证 |
| `ValidateSchema` | Schema 验证（配合 `Schema` 类型使用） |
| `CompareJSON` | 比较 JSON 是否等价 |
| `MergeJSON`, `MergeMany` | JSON 合并（联合/交集/差集模式，详见[工具函数](./helpers)） |

## 命名约定

库遵循以下命名约定：

| 模式 | 说明 | 示例 |
|------|------|------|
| `Get{Type}` | 获取指定类型（支持 defaultValue） | `GetString`, `GetInt` |
| `GetTyped[T]` | 泛型获取，返回 T | `GetTyped[User]` |
| `New{Type}` | 创建实例 | `New` (返回 *Processor), `NewEncoder` |
| `Default{Type}` | 默认配置 | `DefaultConfig` |
| `{Type}Config` | 配置预设 | `SecurityConfig`, `PrettyConfig` |
| `Foreach*` | 迭代变体（WithError / WithPath / Nested / File） | `ForeachNestedWithError` |
| `Stream*` | 流式处理变体（Into / Parallel / File / Chunked） | `StreamJSONLParallel` |
| `{Verb}Hook` | 钩子工厂 | `LoggingHook`, `ValidationHook` |

## 相关

- [快速开始](../getting-started/) -- 安装和基本用法
- [Processor 入门](../getting-started/processor-guide) -- 何时使用处理器
- [路径表达式语法](../getting-started/path-syntax) -- 路径查询语法
- [使用示例](../examples/) -- 实战代码示例
- [大文件处理](../streaming/large-files) -- 流式处理指南
