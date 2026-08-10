---
sidebar_label: "缓存与预解析"
title: "缓存与预解析 - CyberGo JSON | 缓存策略"
description: "CyberGo JSON 内置缓存机制与预解析策略：EnableCache 自动缓存查询结果、GetStats 监控命中率、WarmupCache 预热、PreParse 一次解析多次查询、CacheSharedResults 零拷贝与 ClearCache 清理，附高频查询配方与选型决策。"
sidebar_position: 3
---

# 缓存与预解析策略

CyberGo JSON 内置一套**自动缓存子系统**：解析结果与路径查询结果会被自动缓存，无需手写 `sync.Map`。本页聚焦内置缓存的配置、监控、预热与 PreParse 预解析模式，并给出选型决策。

:::tip 与性能优化页的分工
[性能优化](./performance) 的「缓存策略」一节展示的是**用户自建** `sync.Map` 缓存；本页文档化的是**库内置**缓存（`EnableCache`/`WarmupCache`/`PreParse`），二者互补。
:::

## 内置缓存如何工作

当 `Config.EnableCache` 为 `true`（默认）且 `CacheResults` 为 `true`（默认）时，`Get` 等查询操作会自动缓存：

1. **解析缓存**：JSON 字符串 → 解析后的 `any` 树（以 FNV-1a 哈希为键）
2. **结果缓存**：`(JSON, path)` → 查询结果

同一份 JSON 的第二次查询会跳过解析，直接走路径导航；相同的 `(JSON, path)` 组合则直接返回缓存结果。

:::warning 写操作自动失效
`Set`/`Delete` 等变更操作会**自动失效**关联的缓存条目（按 JSON 哈希前缀批量清除），无需手动干预。只有当外部数据源变化、或内存压力较大时才需要手动 `ClearCache`。
:::

## 监控缓存命中率

`GetStats()` 返回 `Stats`，包含命中次数、未命中次数、命中率与当前条目数。

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	data := `{"user":{"name":"Alice","email":"alice@example.com"},"version":1}`

	// 预热常用路径：内部对各路径执行一次 Get 并写入缓存
	paths := []string{"user.name", "user.email", "version"}
	result, err := processor.WarmupCache(data, paths)
	if err != nil {
		panic(err)
	}
	fmt.Printf("预热成功：%d/%d（成功率 %.0f%%）\n", result.Successful, result.TotalPaths, result.SuccessRate)
	// 输出：预热成功：3/3（成功率 100%）

	// 相同 (JSON, path) 查询命中缓存
	name, err := processor.Get(data, "user.name")
	if err != nil {
		panic(err)
	}
	fmt.Printf("user.name = %v\n", name)
	// 输出：user.name = Alice

	// 查看缓存配置与状态
	stats := processor.GetStats()
	fmt.Printf("缓存启用：%v，TTL：%v\n", stats.CacheEnabled, stats.CacheTTL)
	// 输出：缓存启用：true，TTL：5m0s
}
```

`Stats` 关键字段（完整结构见 [生命周期与统计](../api-reference/processor/lifecycle#统计信息)）：

| 字段 | 说明 |
|------|------|
| `HitRatio` | 命中率（0–1），低于 0.5 时建议检查工作负载或调参 |
| `HitCount` / `MissCount` | 累计命中 / 未命中次数 |
| `CacheSize` | 当前缓存条目数 |
| `CacheTTL` | 缓存过期时间 |

## 预热缓存 WarmupCache

`WarmupCache(jsonStr, paths, cfg...)` 在实际查询前批量填充缓存，消除首批请求的「冷启动」延迟。适合服务启动后立即承载流量的场景。

```go
// 签名：func (p *Processor) WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)
```

`WarmupResult` 包含 `TotalPaths`/`Successful`/`Failed`/`SuccessRate`/`FailedPaths`，可用于校验预热是否完整（例如配置文件中的路径拼写错误会体现为 `FailedPaths`）。

:::warning 前提条件
`EnableCache` 为 `false` 时调用 `WarmupCache` 会返回错误（缓存未启用无法预热）。预热必须在**同一个 Processor 实例**上进行——包级函数（如 `json.GetString`）使用的是全局 Processor，与自定义实例的缓存相互隔离。
:::

## PreParse 预解析模式

当**同一份 JSON 需要查询多个不同路径**时，`PreParse` + `GetFromParsed` 是最直接的模式：解析一次，多次查询共享解析结果，完全绕过缓存键查找。

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	data := `{"users":[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}],"total":2}`

	// 一次解析，多次查询（跳过重复解析开销）
	parsed, err := processor.PreParse(data)
	if err != nil {
		panic(err)
	}
	defer parsed.Release()

	// 多个路径共享同一份解析结果
	for _, path := range []string{"users[0].name", "users[1].name", "total"} {
		val, err := processor.GetFromParsed(parsed, path)
		if err != nil {
			panic(err)
		}
		fmt.Printf("%s = %v\n", path, val)
	}
	// 输出：
	// users[0].name = Alice
	// users[1].name = Bob
	// total = 2
}
```

关键 API：

| API | 签名 | 说明 |
|-----|------|------|
| `PreParse` | `func (p *Processor) PreParse(jsonStr string, cfg ...Config) (*ParsedJSON, error)` | 解析并返回可复用的 `*ParsedJSON` |
| `GetFromParsed` | `func (p *Processor) GetFromParsed(parsed *ParsedJSON, path string, cfg ...Config) (any, error)` | 从预解析结果查询，跳过解析步骤 |
| `(*ParsedJSON).Release` | `func (p *ParsedJSON) Release()` | 释放引用，用完即调（通常 `defer`） |

:::tip PreParse vs 自动缓存
`PreParse` 显式持有解析结果句柄，适合「一处解析、多处消费」的局部流程；自动缓存则是**全局按 JSON 内容**去重，适合同一 JSON 在不同调用点被反复查询。两者可共存：`PreParse` 内部也会写入解析缓存。
:::

## 缓存配置调优

缓存行为由 `Config` 的若干字段控制（完整字段见 [Config](../api-reference/config#config-结构体)）：

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `EnableCache` | `true` | 总开关；关闭后所有缓存逻辑被跳过（`Get` 走快速路径） |
| `CacheResults` | `true` | 是否缓存查询结果；`false` 时仅保留解析缓存 |
| `CacheTTL` | `5 分钟` | 条目过期时间 |
| `MaxCacheSize` | `128` | 最大条目数（按 LRU 驱逐） |
| `CacheSharedResults` | `false` | 共享缓存结果，跳过防御性深拷贝（高性能只读场景） |

```go
package main

import (
	"fmt"
	"time"

	"github.com/cybergodev/json"
)

func main() {
	cfg := json.DefaultConfig()
	cfg.MaxCacheSize = 256            // 容纳更多热数据
	cfg.CacheTTL = 10 * time.Minute   // 延长有效期

	processor, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	data := `{"key":"value"}`
	_, err = processor.Get(data, "key")
	if err != nil {
		panic(err)
	}
	fmt.Println("查询完成")
	// 输出：查询完成
}
```

### CacheSharedResults 零拷贝契约

`CacheSharedResults = true` 时，缓存命中的 `Get`/`GetFromParsed` 会**直接返回缓存值**，跳过防御性深拷贝，显著降低大对象的反复读取开销。

:::danger 只读契约
启用后**调用方不得修改**返回的 `map[string]any` / `[]any`，否则会破坏共享缓存、污染后续读取。原始值（`bool`/`float64`/`string`/`json.Number`/`nil`）不可变，始终安全。仅在调用方将结果视为只读时启用（如反复读取同一大型子树的分析型负载）。
:::

## 清理与失效

| 操作 | API | 触发时机 |
|------|-----|----------|
| 手动清空 | `processor.ClearCache()` | 数据源变化、内存压力大、需要强制刷新 |
| 写后自动失效 | `Set`/`Delete` 内部调用 | 变更后无需手动清理，缓存按 JSON 哈希前缀自动清除 |

`ClearCache` 适合处理「同一 Processor 长期运行、数据源轮换」的场景。一次性脚本无需手动清理——`Close()` 会回收所有资源。

## 实战配方：高频查询缓存优化

以下模式综合了预热、PreParse 与监控，适合 API 网关 / 配置中心等高频读取场景。

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	configJSON := `{"db":{"host":"db.local","port":5432},"cache":{"ttl":300},"features":["audit","metrics"]}`

	// 1. 启动时预热高频路径
	hotPaths := []string{"db.host", "db.port", "cache.ttl"}
	if _, err := processor.WarmupCache(configJSON, hotPaths); err != nil {
		panic(err)
	}

	// 2. 对同一配置做批量字段提取（PreParse 模式）
	parsed, err := processor.PreParse(configJSON)
	if err != nil {
		panic(err)
	}
	defer parsed.Release()

	host, err := processor.GetFromParsed(parsed, "db.host")
	if err != nil {
		panic(err)
	}
	fmt.Printf("数据库主机：%v\n", host)
	// 输出：数据库主机：db.local

	// 3. 运行期监控命中率，低于阈值时告警
	stats := processor.GetStats()
	fmt.Printf("当前命中率：%.2f%%\n", stats.HitRatio*100)
}
```

## 选型决策

| 场景 | 推荐方案 | 理由 |
|------|----------|------|
| 一次性查询 / 脚本 | 默认配置即可 | 内置缓存对单次调用无负担，`Get` 有快速路径 |
| 同一 JSON 反复查询（不同调用点） | 保持 `EnableCache=true` | 自动按 JSON 内容去重，零代码改动 |
| 同一 JSON 一次解析、当批查多路径 | `PreParse` + `GetFromParsed` | 显式复用解析结果，绕过缓存键开销 |
| 服务启动后立即承载流量 | `WarmupCache` 预热 | 消除首批请求冷启动延迟 |
| 反复读取同一大型只读子树 | `CacheSharedResults=true` | 跳过深拷贝，换取零拷贝性能 |
| 不可信输入 / 安全敏感 | `SecurityConfig()`（较短 TTL） | 安全配置默认较保守的缓存参数 |

## 相关

- [性能优化](./performance) — 处理器复用、内存优化、基准测试
- [生命周期与统计](../api-reference/processor/lifecycle#统计信息) — `GetStats`/`WarmupCache`/`ClearCache` API 详情
- [Config 配置](../api-reference/config) — 缓存相关字段完整说明
- [并发与并行处理](./concurrency) — Processor 线程安全与并行迭代器
