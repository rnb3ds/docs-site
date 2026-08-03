---
sidebar_label: "Validator 验证器"
title: "Validator - CyberGo JSON | Schema 验证器"
description: "CyberGo JSON 验证器：Validator 接口、Schema 验证结构、ValidationError 错误与 SchemaConfig 配置，提供完整 JSON 数据验证能力。"
sidebar_position: 2
---

# Schema 验证

json 库提供基于 JSON Schema 的数据验证能力：定义一个 `Schema` 描述数据应满足的结构与约束，再用 `ValidateSchema` 校验一段 JSON。这是当前版本**功能完备**的验证系统。

## ValidateSchema 函数

`ValidateSchema` 将 JSON 字符串与 `Schema` 对照校验，返回所有违反约束的列表：

```go
// 包级函数
func ValidateSchema(jsonStr string, schema *Schema, cfg ...Config) ([]ValidationError, error)

// Processor 方法
func (p *Processor) ValidateSchema(jsonStr string, schema *Schema, cfg ...Config) ([]ValidationError, error)
```

返回值语义：

| 返回值 | 含义 |
|--------|------|
| `([]ValidationError{}, nil)` | JSON 合法且**满足全部约束** |
| `([]ValidationError{...}, nil)` | JSON 可解析，但存在约束违反（切片非空） |
| `(nil, error)` | 解析或前置失败（如 JSON 非法、`schema` 为 nil、超限） |

::: tip 关键区分
约束违反通过**返回切片**表达（`error` 仍为 `nil`）；只有解析失败、`schema` 为 nil、超出大小限制等情况才会返回非 `nil` 的 `error`。因此检查「是否通过验证」应看 `len(errs) == 0`，而非 `err != nil`。
:::

## 基础示例：对象结构与必填字段

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	schema := &json.Schema{
		Type:     "object",
		Required: []string{"name", "email"},
		Properties: map[string]*json.Schema{
			"name":  {Type: "string"},
			"email": {Type: "string", Format: "email"},
			"age":   {Type: "number"},
		},
	}

	// 缺少必填字段 email
	data := `{"name":"Alice","age":30}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// 输出：email: required property 'email' is missing
}
```

## Schema 约束字段总览

`Schema` 支持的约束字段（按类别分组）：

| 类别 | 字段 | 适用类型 | 说明 |
|------|------|----------|------|
| 结构 | `Type` | 所有 | 取值见下表 |
| 结构 | `Required` | object | 必须出现的属性名列表 |
| 结构 | `Properties` | object | 各属性对应的子 Schema |
| 结构 | `Items` | array | 元素对应的子 Schema |
| 结构 | `AdditionalProperties` | object | `true` 允许额外属性，`false` 拒绝 |
| 字符串 | `MinLength` / `MaxLength` | string | 长度区间（按 rune 计数） |
| 字符串 | `Pattern` | string | 正则表达式 |
| 字符串 | `Format` | string | 语义格式（见[Format 值表](#支持的-format-值)） |
| 数值 | `Minimum` / `Maximum` | number | 取值区间 |
| 数值 | `ExclusiveMinimum` / `ExclusiveMaximum` | number | 排除边界值 |
| 数值 | `MultipleOf` | number | 必须为该值的倍数 |
| 数组 | `MinItems` / `MaxItems` | array | 元素数量区间 |
| 数组 | `UniqueItems` | array | `true` 要求元素唯一 |
| 取值 | `Enum` | 所有 | 允许的枚举值列表 |
| 取值 | `Const` | 所有 | 必须等于该固定值 |

`Type` 支持的取值：`object`、`array`、`string`、`number`、`boolean`、`null`。

::: warning 数值类型用 "number"
JSON 解析后所有数字（含整数）都是 `float64`，因此数值字段应使用 `Type: "number"`。`MultipleOf` 等数值约束也只在 `Type` 为 `number` 时生效。
:::

## 对象约束：Required / Properties / AdditionalProperties

`AdditionalProperties` 控制是否允许出现 `Properties` 中未声明的属性。直接用结构体字面量构造 `Schema` 时该字段默认为 `false`（拒绝额外属性）：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	schema := &json.Schema{
		Type:     "object",
		Required: []string{"name"},
		Properties: map[string]*json.Schema{
			"name":  {Type: "string"},
			"email": {Type: "string"},
		},
		// AdditionalProperties 未设置，结构体字面量默认 false → 拒绝额外属性
	}

	// "extra" 未在 Properties 中声明
	data := `{"name":"Alice","extra":"x"}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// 输出：extra: additional property 'extra' is not allowed
}
```

::: tip 允许额外属性
若要放行额外属性，把 `AdditionalProperties` 设为 `true`，或用 [`DefaultSchema()`](#schema-的创建方式) 构造（其默认 `AdditionalProperties` 为 `true`）。
:::

## 字符串约束：MinLength / MaxLength / Pattern / Format

`MinLength`、`MaxLength`、`Minimum`、`Maximum`、`MinItems`、`MaxItems` 等约束**只在通过 `NewSchemaWithConfig` 创建时才生效**（原因见[创建方式](#schema-的创建方式)）。下面用 `SchemaConfig` 的指针字段设置长度，并用 `Pattern` 限定为小写字母：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	nameCfg := json.DefaultSchemaConfig()
	nameCfg.Type = "string"
	minLen, maxLen := 3, 10
	nameCfg.MinLength = &minLen
	nameCfg.MaxLength = &maxLen
	nameCfg.Pattern = `^[a-z]+$`
	nameSchema := json.NewSchemaWithConfig(nameCfg)

	schema := &json.Schema{
		Type:     "object",
		Required: []string{"name"},
		Properties: map[string]*json.Schema{
			"name": nameSchema,
		},
	}

	// "AB"：长度不足且含大写字母
	data := `{"name":"AB"}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// 输出：
	// name: string length 2 is less than minimum 3
	// name: string 'AB' does not match pattern '^[a-z]+$'
}
```

`Pattern` 在首次校验时惰性编译并缓存，同一 `*Schema` 可安全用于并发校验。若正则本身非法，每次校验都会报告该编译错误。

## 数值约束：Minimum / Maximum / MultipleOf

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	ageCfg := json.DefaultSchemaConfig()
	ageCfg.Type = "number"
	minVal, maxVal := 0.0, 120.0
	ageCfg.Minimum = &minVal
	ageCfg.Maximum = &maxVal
	mult := 5.0
	ageCfg.MultipleOf = &mult
	ageSchema := json.NewSchemaWithConfig(ageCfg)

	schema := &json.Schema{
		Type: "object",
		Properties: map[string]*json.Schema{
			"age": ageSchema,
		},
	}

	// 148：超出上限 120，且不是 5 的倍数
	data := `{"age":148}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// 输出：
	// age: number 148 exceeds maximum 120
	// age: number 148 is not a multiple of 5
}
```

`ExclusiveMinimum` / `ExclusiveMaximum` 需配合 `Minimum` / `Maximum` 一并通过 `SchemaConfig`（同为指针字段）设置，用于把边界值本身排除在外。

## 数组约束：Items / MinItems / MaxItems / UniqueItems

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	tagsCfg := json.DefaultSchemaConfig()
	tagsCfg.Type = "array"
	minItems, maxItems := 1, 3
	tagsCfg.MinItems = &minItems
	tagsCfg.MaxItems = &maxItems
	tagsCfg.UniqueItems = true
	tagsCfg.Items = &json.Schema{Type: "string"}
	tagsSchema := json.NewSchemaWithConfig(tagsCfg)

	schema := &json.Schema{
		Type: "object",
		Properties: map[string]*json.Schema{
			"tags": tagsSchema,
		},
	}

	// 4 个元素（超过上限 3），且 "a" 重复
	data := `{"tags":["a","a","b","c"]}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// 输出：
	// tags: array length 4 exceeds maximum 3
	// tags[1]: duplicate item found: a
}
```

`Items` 指定每个元素需满足的子 Schema（上例限定为字符串）；`UniqueItems` 按元素的字符串表示判重。

## 枚举与常量：Enum / Const

`Enum` 限定取值必须命中其一；`Const` 限定必须等于某个固定值。两者均通过直接比较生效，无需 `NewSchemaWithConfig`：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	schema := &json.Schema{
		Type: "object",
		Properties: map[string]*json.Schema{
			"role":   {Enum: []any{"admin", "user", "guest"}},
			"status": {Const: "active"},
		},
	}

	// role 不在枚举内；status 符合常量
	data := `{"role":"superuser","status":"active"}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// 输出：role: value 'superuser' is not in allowed enum values: [admin user guest]
}
```

## 支持的 Format 值

`Format` 字段支持的语义格式（未知格式会被静默跳过，不报错也不通过）：

| Format | 校验规则 |
|--------|----------|
| `email` | 校验本地部分、域名、TLD 结构与长度 |
| `date` | `YYYY-MM-DD` |
| `date-time` | RFC3339 |
| `time` | `HH:MM:SS` |
| `uri` | 必须包含 `://` |
| `uuid` | UUID 正则匹配 |
| `ipv4` | 4 段，每段 0–255 |
| `ipv6` | `net.ParseIP` 解析通过且包含 `:` |

## ValidationError 类型

每条约束违反都是一个 `ValidationError`，携带出错的 JSON 路径与描述：

```go
type ValidationError struct {
    Path    string `json:"path"`    // 错误路径（如 "user.email"、"tags[1]"）
    Message string `json:"message"` // 错误消息
}

func (ve *ValidationError) Error() string
```

由于 `ValidateSchema` 返回的是 `[]ValidationError` 切片，直接遍历读取 `Path` / `Message` 即可；`Error()` 方法用于把单条错误格式化为字符串（如需记日志）。

## Schema 的创建方式

构造 `Schema` 有三种方式，**关键区别在于长度/区间类约束是否生效**：

```go
// 1) 直接字面量：Type/Required/Properties/Items/Pattern/Format/Enum/Const/
//    UniqueItems/MultipleOf 立即生效；但 MinLength/MaxLength/Minimum/Maximum/
//    MinItems/MaxItems/ExclusiveMinimum/ExclusiveMaximum 不生效（见下方说明）
schema := &json.Schema{Type: "string", Pattern: `^\d+$`}

// 2) NewSchemaWithConfig：通过 SchemaConfig 的指针字段设置约束，长度/区间类全部生效
cfg := json.DefaultSchemaConfig()
cfg.Type = "string"
minLen := 1
cfg.MinLength = &minLen
schema := json.NewSchemaWithConfig(cfg)

// 3) DefaultSchema：返回带默认值的 Schema（AdditionalProperties 为 true）
schema := json.DefaultSchema()
```

::: warning 长度/区间约束必须用 NewSchemaWithConfig
`MinLength`、`MaxLength`、`Minimum`、`Maximum`、`MinItems`、`MaxItems`、`ExclusiveMinimum`、`ExclusiveMaximum` 这一组约束依赖 `Schema` 内部不可外部设置的跟踪标志。直接在 `&json.Schema{...}` 字面量中给这些字段赋值**不会生效**；必须通过 `NewSchemaWithConfig` 并传入对应的**指针字段**（如 `cfg.MinLength = &v`）才会被启用。`Type`、`Required`、`Properties`、`Items`、`Pattern`、`Format`、`Enum`、`Const`、`UniqueItems`、`MultipleOf` 则不受此限制，字面量与 `NewSchemaWithConfig` 均生效。
:::

## Config 中的验证相关字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `EnableValidation` | `bool` | 启用输入验证（影响操作前的安全/结构校验） |
| `ValidateInput` | `bool` | 校验输入 JSON |
| `SkipValidation` | `bool` | 跳过非必要校验（仅用于可信输入） |

::: warning 未连接的扩展字段
`Config.CustomValidators`（`[]Validator`）与 `Validator` 接口在当前版本中**已声明并参与配置克隆与缓存键计算，但尚未在操作流水线中挂接**。通过 `Config.CustomValidators`（或 `Config.AddValidator`）注册验证器**不会影响任何操作的执行**——操作不会被自定义验证器拒绝。`Validator` 接口当前为预留接口：

```go
// 当前版本：已声明但未挂接，注册后对操作无影响（预留接口）
type Validator interface {
    Validate(jsonStr string) error
}
```

如需在操作前后做自定义校验，请使用已生效的 [Hooks 钩子](./hooks)（例如 `ValidationHook`）。
:::

## 相关

- [接口定义](../api-reference/interfaces) - `Validator` 接口（预留）与 `Schema` 相关类型
- [配置选项](../api-reference/config) - 验证相关配置字段
- [Hooks 钩子](./hooks) - 已生效的操作前后拦截机制（含 `ValidationHook`）
