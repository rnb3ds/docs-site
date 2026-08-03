---
sidebar_label: "删除操作"
title: "Processor 删除方法 - CyberGo JSON | API 参考"
description: "CyberGo JSON Processor 删除方法：Delete 按路径删除、DeleteClean 删除后自动清理空值与空数组，保留链式调用能力。"
sidebar_position: 4
---

# 删除方法

Processor 提供数据删除方法，删除指定路径的值并返回修改后的 JSON 字符串。所有方法都是**不可变**的——返回新字符串，原输入不变；出错时返回原输入。与[包级删除函数](../functions/delete)行为一致，区别在于实例方法可与处理器的自身配置、缓存、钩子协同。

## Delete

签名：`func (p *Processor) Delete(jsonStr, path string, cfg ...Config) (result string, err error)`

删除指定路径的值，返回修改后的 JSON 字符串。

<!-- check-code: skip -->
```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

result, err := p.Delete(data, "user.temporary")
```

### 完整示例：对象属性、数组元素与嵌套路径

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

	// 删除对象属性
	r1, err := p.Delete(`{"user":{"name":"Alice","temp":"x"}}`, "user.temp")
	if err != nil {
		panic(err)
	}
	fmt.Println(r1)
	// 输出：{"user":{"name":"Alice"}}

	// 删除数组元素（移除并重排，不留空洞）
	r2, err := p.Delete(`{"items":["a","b","c"]}`, "items[1]")
	if err != nil {
		panic(err)
	}
	fmt.Println(r2)
	// 输出：{"items":["a","c"]}

	// 嵌套路径删除
	r3, err := p.Delete(`{"a":{"b":{"c":1,"d":2}}}`, "a.b.c")
	if err != nil {
		panic(err)
	}
	fmt.Println(r3)
	// 输出：{"a":{"b":{"d":2}}}
}
```

### 高级路径：通配符与切片

`Delete` 复用与 Get/Set 相同的路径引擎，支持通配符、切片范围、多字段提取。批量路径（含 `*`、`{}`、`:`）对缺失目标静默跳过，不报错。

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

	// 通配符：删除每个用户的 pwd
	r1, err := p.Delete(data, "users[*].pwd")
	if err != nil {
		panic(err)
	}
	fmt.Println(r1)
	// 输出：{"tags":[1,2,3,4],"users":[{"name":"Alice"},{"name":"Bob"}]}

	// 切片范围：删除 tags[0:2]（左闭右开）
	r2, err := p.Delete(data, "tags[0:2]")
	if err != nil {
		panic(err)
	}
	fmt.Println(r2)
	// 输出：{"tags":[3,4],"users":[{"name":"Alice","pwd":"x"},{"name":"Bob","pwd":"y"}]}
}
```

### 错误处理

精确路径的目标不存在时返回包装了 `ErrPathNotFound` 的错误，且原输入不变。用 `errors.Is` 判定：

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
			fmt.Println("路径不存在，已跳过")
		}
	}
	fmt.Println(result) // 原数据不变：{"a":1}
	// 输出：
	// 路径不存在，已跳过
	// {"a":1}
}
```

## DeleteClean

签名：`func (p *Processor) DeleteClean(jsonStr, path string, cfg ...Config) (string, error)`

删除指定路径并**递归清理**因删除产生的 `null` 值与空对象/空数组。等价于 `Delete` 强制开启 `CleanupNulls: true` + `CompactArrays: true`。

### 级联清理：父对象变空后自动移除

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, _ := json.New()
	defer p.Close()

	// temp 是 user 唯一的属性
	data := `{"user":{"temp":"value"}}`

	// 普通删除：user 变成 {}，但保留
	r1, _ := p.Delete(data, "user.temp")
	fmt.Println(r1) // 输出：{"user":{}}

	// DeleteClean：user 变空后连同 user 键一起清理，逐层向上
	r2, err := p.DeleteClean(data, "user.temp")
	if err != nil {
		panic(err)
	}
	fmt.Println(r2) // 输出：{}
}
```

### 清理 API 响应

删除目标字段的同时，连带扫除整棵树中其他的 `null` 与残留空容器：

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
	// 输出：{"data":{"id":1,"name":"Product","price":29.99}}
}
```

::: warning DeleteClean 会清扫整棵树的 null
`DeleteClean` 的清理是**全局**的：它对整个 JSON 树递归执行清理，因此会移除文档中**所有**预先存在的 `null` 与空容器，而不仅是删除点产生的那个。只想移除指定字段、保留其余 `null` 时，请用普通 `Delete`。
:::

## Delete 与 DeleteClean 对比

| 特性 | Delete | DeleteClean |
|------|--------|-------------|
| 删除目标节点 | 是 | 是 |
| 数组元素移除后重排（无空洞） | 是 | 是 |
| 精确路径缺失时报错 | 是（`ErrPathNotFound`） | 是（`ErrPathNotFound`） |
| 清理删除产生的 `null` | 否 | 是 |
| 清理空对象/空数组（级联） | 否 | 是（逐层向上） |
| 扫除整棵树预存的 `null` | 否 | 是（全局清理） |
| 等价配置 | 默认 | `CleanupNulls+CompactArrays` |
| 相对开销 | 较低 | 略高（额外一次全树清理遍历） |

## Config 对删除行为的影响

删除方法的清理行为由「**调用参数 `cfg` 与处理器自身配置取并集**」决定。也就是说，若创建处理器时已开启 `CleanupNulls`，则后续普通 `p.Delete(...)` 也会自动清理：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	// 创建一个默认开启清理的处理器
	cfg := json.DefaultConfig()
	cfg.CleanupNulls = true
	cfg.CompactArrays = true
	p, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data := `{"user":{"temp":"value"}}`

	// 普通 Delete 也会清理，因为处理器自身配置已开启
	result, err := p.Delete(data, "user.temp")
	if err != nil {
		panic(err)
	}
	fmt.Println(result) // 输出：{}
}
```

影响删除行为的 `Config` 字段：

| 字段 | 默认 | 对删除的影响 |
|------|------|--------------|
| `CleanupNulls` | `false` | 递归移除结果中的 `null` 与空对象/空数组（级联） |
| `CompactArrays` | `false` | 移除数组中的 `null`/空元素；开启时隐含 `CleanupNulls` |
| `CreatePaths` | `true` | **不影响删除**（删除从不创建路径） |

> 因此 `DeleteClean(s, p)` 与在 `CleanupNulls+CompactArrays` 处理器上调用 `Delete(s, p)` 效果相同——选择语义更清晰的写法即可。

## 链式删除

删除方法返回新字符串，可直接喂给下一次调用，组合成链式修改流程：

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

	// 链式：先设置，再删除，每步基于上一步结果
	r1, _ := p.Set(data, "user.name", "CyberGo")
	r2, _ := p.Delete(r1, "user.temp")
	final, _ := p.Delete(r2, "user.version")

	fmt.Println(final)
	// 输出：{"user":{"name":"CyberGo"}}
}
```

## 常见陷阱

::: warning 数组删除不留空洞
`Delete` 删除数组元素时，元素被**整体移除**、后续元素自动前移，不会留下 `null` 占位或空洞。若你需要"删除后索引保持不变、留下空位"的语义，请改用 `Set` 将该位置设为 `null`。
:::

::: warning DeleteClean 可能误删"恰好为空"的合法数据
`DeleteClean` 的级联清理会把所有空对象 `{}`、空数组 `[]` 视为需要清理的对象。若业务中"空数组"是有意义的状态（如 `"tags":[]` 表示"无标签"），`DeleteClean` 会将其连同键一起移除。需要保留这类字段时，请使用普通 `Delete`。
:::

::: warning 批量删除是容错的
通配符/切片/多字段路径对缺失目标**静默跳过**，不返回错误。需要"目标必须存在"的强校验语义时，请改用精确路径（如 `items[1]` 而非 `items[*]`）。
:::

## 相关

- [修改操作](./modify) - Set/SetCreate 链式修改
- [删除函数](../functions/delete) - 包级 Delete/DeleteClean 函数（含完整路径语法参考）
- [配置参考](../config) - CleanupNulls / CompactArrays 等字段详情
