---
sidebar_label: "数据类型"
title: "类型定义 - CyberGo html | 数据类型参考"
description: "CyberGo html 核心数据类型参考：Result、ImageInfo、LinkInfo、LinkResource、VideoInfo、AudioInfo、Statistics、BatchResult 等结构体字段说明，含自定义 MarshalJSON 序列化行为。"
sidebar_position: 2
---

# 类型定义

## Result

提取结果，包含文本、元数据和媒体信息。

```go
type Result struct {
    Text           string        `json:"text"`
    Title          string        `json:"title"`
    Images         []ImageInfo   `json:"images,omitempty"`
    Links          []LinkInfo    `json:"links,omitempty"`
    Videos         []VideoInfo   `json:"videos,omitempty"`
    Audios         []AudioInfo   `json:"audios,omitempty"`
    ProcessingTime time.Duration `json:"-"`       // 处理耗时（不参与标准序列化）
    WordCount      int           `json:"word_count"`
    ReadingTime    time.Duration `json:"-"`       // 预估阅读时间（不参与标准序列化）
}
```

### MarshalJSON

自定义 JSON 序列化，`ProcessingTime` 和 `ReadingTime` 虽有 `json:"-"` 标签（标准序列化会跳过），但通过自定义 `MarshalJSON()` 方法将它们转为毫秒数输出。

```go
func (r *Result) MarshalJSON() ([]byte, error)
```

:::warning 注意：不支持 round-trip
`Result` **未实现 `UnmarshalJSON`**。如果将 `MarshalJSON()` 的输出反序列化回 `Result`，会**丢失 `ProcessingTime`、`ReadingTime` 等 duration 字段**——JSON 输出的键名（`processing_time_ms`、`reading_time_ms`）与 struct 字段名不一致，无法对应还原。

这是**有意设计**：该 JSON 格式面向外部消费（如 API 响应、日志、前端展示），不是为双向序列化准备的。
:::

## ImageInfo

图片信息。

```go
type ImageInfo struct {
    URL          string `json:"url"`           // 图片地址
    Alt          string `json:"alt"`           // 替代文本
    Title        string `json:"title"`         // 标题
    Width        string `json:"width"`         // 宽度
    Height       string `json:"height"`        // 高度
    IsDecorative bool   `json:"is_decorative"` // 是否为装饰性图片
    Position     int    `json:"position"`      // 在文档中的位置
}
```

### 字段语义

| 字段 | 说明 |
|------|------|
| `URL` | 图片的 `src` 属性值；仅包含合法 URL（通过 `IsValidURL` 校验），无效 URL 的 `<img>` 不会出现在结果中 |
| `Alt` | `alt` 属性原文；为空时 `IsDecorative` 为 `true` |
| `Title` | `title` 属性原文（非页面标题） |
| `Width`/`Height` | HTML 属性中的**原始字符串**（如 `"640"`、`"50%"`），未解析为数字——不同页面的写法可能不一致 |
| `IsDecorative` | `Alt` 为空时为 `true`，可用于识别装饰性图片并跳过 |
| `Position` | 在文档中的 1-based 序号；当 `PreserveImages = false` 时整个 `Images` 切片为空 |

:::warning Width/Height 非数值类型
`Width` 和 `Height` 是 `string` 类型而非 `int`，保留 HTML 源码中的原始表示（可能含单位、百分比等）。需要数值时由调用方自行解析。
:::

## LinkInfo

链接信息。

```go
type LinkInfo struct {
    URL        string `json:"url"`         // 链接地址
    Text       string `json:"text"`        // 链接文本
    Title      string `json:"title"`       // 链接标题
    IsExternal bool   `json:"is_external"` // 是否为外部链接（基于 URL 本身是否为绝对外部 URL 判定，不与 BaseURL 对比）
    IsNoFollow bool   `json:"is_nofollow"` // 是否为 nofollow
    Position   int    `json:"position"`    // 在文档中的位置
}
```

### 字段语义

| 字段 | 说明 |
|------|------|
| `URL` | `href` 属性值；仅包含合法 URL（通过 `IsValidURL` 校验），无效 URL 的 `<a>` 消耗 Position 但不加入切片 |
| `Text` | `<a>` 标签内所有文本节点的拼接（递归 `GetTextContent`） |
| `Title` | `title` 属性原文（非链接文本） |
| `IsExternal` | 基于 URL 本身是否为绝对外部地址判定，**不与 `BaseURL` 做域名比较**——这与 `ExtractAllLinks` 中的内外链判定不同 |
| `IsNoFollow` | `rel` 属性中包含 `nofollow`（大小写不敏感，ASCII 折叠匹配）时为 `true` |
| `Position` | 在文档中的 1-based 序号；无效 `<a>`（href 非法或缺失）仍消耗序号但不加入切片，因此 Position 可能不连续 |

## VideoInfo

视频信息。

```go
type VideoInfo struct {
    URL      string `json:"url"`      // 视频地址
    Type     string `json:"type"`     // 视频类型
    Poster   string `json:"poster"`   // 封面图地址
    Width    string `json:"width"`    // 宽度
    Height   string `json:"height"`   // 高度
    Duration string `json:"duration"` // 时长
}
```

### Type 字段取值规则

| Type 值 | 含义 | 产生场景 |
|---------|------|----------|
| `"embed"` | iframe 引用的视频页面 | YouTube、Vimeo、优酷、Bilibili 等嵌入式播放器 |
| MIME 类型（如 `"video/mp4"`） | 视频文件容器 | `<source type="video/mp4">` 属性值 |
| 空字符串 | 未检测到类型 | `<video src="...">` 直接指定源且无 `<source>` 子元素 |

:::tip 视频提取的三来源
视频提取按原始 HTML 扫描 → DOM 遍历 → 正则兜底三步执行，每步去重。详见 [媒体提取实战](../../guides/core-features/media-extraction)。
:::

## AudioInfo

音频信息。

```go
type AudioInfo struct {
    URL      string `json:"url"`      // 音频地址
    Type     string `json:"type"`     // 音频类型
    Duration string `json:"duration"` // 时长
}
```

### Type 字段取值规则

| Type 值 | 产生场景 |
|---------|----------|
| MIME 类型（如 `"audio/mpeg"`） | `<source type="audio/mpeg">` 属性值 |
| 空字符串 | `<audio src="...">` 直接指定源且无 `<source>` 子元素 |

:::warning .ogg 扩展名的双重性
OGG 容器可承载视频或音频，`.ogg` URL 会同时出现在 `Videos` 和 `Audios` 中。仅音频变体 `.oga` 只出现在 `Audios`。
:::

## LinkResource

链接资源（用于链接提取 API）。

```go
type LinkResource struct {
    URL   string // 链接地址
    Title string // 链接标题
    Type  string // 链接类型
}
```

## Statistics

处理统计信息。

```go
type Statistics struct {
    TotalProcessed     int64         // 总处理数
    CacheHits          int64         // 缓存命中数
    CacheMisses        int64         // 缓存未命中数
    ErrorCount         int64         // 错误数
    AverageProcessTime time.Duration // 平均处理时间
}
```

## BatchResult

批量处理结果。

```go
type BatchResult struct {
    Results   []*Result // 提取结果，失败或取消时为 nil
    Errors    []error   // 失败的错误
    Success   int       // 成功数量
    Failed    int       // 失败数量
    Cancelled int       // 取消数量
}
```

## NodeAttr

HTML 节点属性。

```go
type NodeAttr struct {
    Key   string // 属性名
    Value string // 属性值
}
```
