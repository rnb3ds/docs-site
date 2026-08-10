---
sidebar_label: "Processor"
title: "Processor - CyberGo html | 用法、参数与示例"
description: "CyberGo html Processor 处理器 API 参考：New 构造、Extract 方法族、ExtractText 等文本提取、ClearCache 清理、GetStatistics 统计与 Close 生命周期管理详解，复用缓存与编码检测器，适合高频调用场景。"
sidebar_position: 2
---

# Processor

`Processor` 是 HTML 库的核心处理引擎。相比包函数，Processor 复用内部资源（缓存、编码检测器），适合高频调用场景。

## 创建

### New

创建 Processor 实例，可选传入配置。

```go
func New(cfg ...Config) (*Processor, error)
```

**参数**：最多一个 `Config`，未提供时使用 `DefaultConfig()`。

```go
p, err := html.New(html.DefaultConfig())
if err != nil {
    log.Fatal(err)
}
defer p.Close()
```

**内部初始化**：

`New` 并非简单赋值，它执行以下步骤保证返回的 Processor 立即可用：

1. **校验配置**：调用 `Config.Validate()`，无效配置返回 `*ConfigError`（`errors.Is(err, ErrInvalidConfig)` 为真）。校验范围包括数值边界（`MaxInputSize`、`MaxCacheEntries`、`WorkerPoolSize`、`MaxDepth` 不能为负/超限）与格式字符串（`InlineImageFormat`/`InlineLinkFormat`/`TableFormat` 取值合法）。
2. **设置 Scorer**：配置了自定义 `Scorer` 时用 `scorerAdapter` 适配到内部接口；否则用 `SharedDefaultScorer`（只读、并发安全）。
3. **预计算格式串**：把 `InlineImageFormat`/`InlineLinkFormat` 归一化（小写+去空格，空串映射为 `"none"`）并缓存到 `imageFormat`/`linkFormat` 字段，避免热路径中反复 `strings.ToLower`。
4. **启动缓存清理**：仅当 `CacheTTL>0` **且** `CacheCleanup>0` 时才启动后台清理 goroutine；两者任一为 0 都不会启动。

## 并发安全性

:::tip 并发使用
`Processor` 可安全地在多个 goroutine 间共享，无需额外加锁。并发保证来自：

- **配置不可变**：`config` 在 `New()` 后不可变（`*Config` 指针永不被重新赋值或修改），因此 `ExtractToMarkdown` 等格式方法可以安全地做值拷贝生成临时 Processor，无需任何锁——格式覆盖不会回写到共享配置。
- **统计计数器**：`TotalProcessed`/`CacheHits`/`CacheMisses`/`ErrorCount`/`totalProcessTime` 全部使用 `atomic` 操作。
- **缓存**：内部 `Cache` 自带锁，读写安全。
- **Scorer**：内置 `DefaultScorer` 只读。**自定义 `Scorer` 必须自行保证并发安全**（如内部持锁），因为单个 Processor 在并发 `Extract` 时会从多个 goroutine 调用其 `Score`/`ShouldRemove`。
:::

## 内容提取

### 错误返回

`Extract` 方法族在处理各阶段会返回明确的哨兵错误，可用 `errors.Is` 精确判断：

| 错误 | 触发条件 | 备注 |
|------|----------|------|
| `ErrProcessorClosed` | `p` 为 `nil` 或已 `Close` | 所有方法共用 |
| `ErrInputTooLarge` | 输入字节数超过 `MaxInputSize` | 包裹在 `*InputError`，含实际/限制大小 |
| 编码检测错误 | 编码检测或 UTF-8 转换失败 | 原始错误被包裹 |
| `ErrInvalidHTML` | 字节无法解析为 HTML | 底层解析错误一并包裹 |
| `ErrMaxDepthExceeded` | 元素嵌套深度超过 `MaxDepth` | 迭代式校验，防栈溢出 |
| `ErrProcessingTimeout` | 处理耗时超过 `ProcessingTimeout` | `ProcessingTimeout=0` 表示不限时 |
| `ErrInternalPanic` | 内部意外 panic 被恢复 | 兜底保护，不应在正常使用中出现 |

带 `context` 的版本还会返回 `context.Canceled`（用户取消）或 `context.DeadlineExceeded`（上下文超时，已归一化为 `ErrProcessingTimeout`）。

### Extract

```go
func (p *Processor) Extract(htmlBytes []byte) (*Result, error)
```

从 HTML 字节提取内容，自动检测编码。

### ExtractFromFile

```go
func (p *Processor) ExtractFromFile(filePath string) (*Result, error)
```

从文件提取内容。

### ExtractText

```go
func (p *Processor) ExtractText(htmlBytes []byte) (string, error)
```

仅返回纯文本。

### ExtractTextFromFile

```go
func (p *Processor) ExtractTextFromFile(filePath string) (string, error)
```

从文件提取纯文本。

## 上下文版本

所有提取方法都有带 `ExtractWithContext` 的版本：

```go
func (p *Processor) ExtractWithContext(ctx context.Context, htmlBytes []byte) (*Result, error)
func (p *Processor) ExtractFromFileWithContext(ctx context.Context, filePath string) (*Result, error)
func (p *Processor) ExtractTextWithContext(ctx context.Context, htmlBytes []byte) (string, error)
func (p *Processor) ExtractTextFromFileWithContext(ctx context.Context, filePath string) (string, error)
```

## 输出格式

```go
func (p *Processor) ExtractToMarkdown(htmlBytes []byte) (string, error)
func (p *Processor) ExtractToMarkdownFromFile(filePath string) (string, error)
func (p *Processor) ExtractToJSON(htmlBytes []byte) ([]byte, error)
func (p *Processor) ExtractToJSONFromFile(filePath string) ([]byte, error)
```

带上下文版本：

```go
func (p *Processor) ExtractToMarkdownWithContext(ctx context.Context, htmlBytes []byte) (string, error)
func (p *Processor) ExtractToMarkdownFromFileWithContext(ctx context.Context, filePath string) (string, error)
func (p *Processor) ExtractToJSONWithContext(ctx context.Context, htmlBytes []byte) ([]byte, error)
func (p *Processor) ExtractToJSONFromFileWithContext(ctx context.Context, filePath string) ([]byte, error)
```

:::warning 缓存行为差异
两者在缓存处理上截然不同：

- **`ExtractToMarkdown`** 构建一个临时 Processor（拷贝不可变的 `config`，但 `MaxCacheEntries` 置零、审计禁用），**不读写主缓存**，因此不会污染或命中主 Processor 的缓存。Markdown 格式结果也不会被缓存。
- **`ExtractToJSON`** 直接调用 `p.Extract`，**走正常缓存路径**——会命中/写入主缓存，统计计数器也会随之更新。

若希望 Markdown 输出也享受缓存，可改用 `MarkdownConfig()` 创建专用 Processor 并调用 `Extract`，或自行缓存其输出。
:::

## 链接提取

```go
func (p *Processor) ExtractAllLinks(htmlBytes []byte) ([]LinkResource, error)
func (p *Processor) ExtractAllLinksFromFile(filePath string) ([]LinkResource, error)
func (p *Processor) ExtractAllLinksWithContext(ctx context.Context, htmlBytes []byte) ([]LinkResource, error)
func (p *Processor) ExtractAllLinksFromFileWithContext(ctx context.Context, filePath string) ([]LinkResource, error)
```

## 批量处理

```go
func (p *Processor) ExtractBatch(htmlContents [][]byte) *BatchResult
func (p *Processor) ExtractBatchWithContext(ctx context.Context, htmlContents [][]byte) *BatchResult
func (p *Processor) ExtractBatchFiles(filePaths []string) *BatchResult
func (p *Processor) ExtractBatchFilesWithContext(ctx context.Context, filePaths []string) *BatchResult
```

## 统计与缓存

### 缓存行为详解

当 `MaxCacheEntries > 0` 时，`Extract` 启用缓存：

- **命中路径**：检测到缓存项后，`CacheHits` 与 `TotalProcessed` 各加 1，返回的是 `cloneResult`——对 `Images`/`Links`/`Videos`/`Audios` 等 slice 做 `copy` 的深拷贝。调用方修改返回值**不会**影响缓存中的条目，也避免并发命中读取时的数据竞争。
- **未命中路径**：处理完成后将结果写入缓存，再返回一份 `cloneResult`（同样深拷贝）。因此缓存条目与返回值互不别名。
- **禁用缓存**：`MaxCacheEntries = 0` 时，`Extract` 跳过缓存键生成与 `Get/Set`（短路），无任何缓存开销。

### GetStatistics

返回当前处理统计信息。

```go
func (p *Processor) GetStatistics() Statistics
```

`Statistics` 各字段含义：

| 字段 | 说明 |
|------|------|
| `TotalProcessed` | 完成且无错误的提取次数，**包含缓存命中** |
| `CacheHits` | 由缓存直接命中的次数 |
| `CacheMisses` | 未命中、需完整处理的次数 |
| `ErrorCount` | 返回错误的提取次数 |
| `AverageProcessTime` | 每次提取的平均墙上时间（`TotalProcessed` 为 0 时为 0） |

```go
stats := p.GetStatistics()
fmt.Printf("已处理：%d, 缓存命中：%d\n",
    stats.TotalProcessed, stats.CacheHits)
```

### ClearCache

清空缓存，保留累计统计。

```go
func (p *Processor) ClearCache()
```

### ResetStatistics

重置所有统计计数器。

```go
func (p *Processor) ResetStatistics()
```

## 审计

### GetAuditLog

获取审计日志条目。

```go
func (p *Processor) GetAuditLog() []AuditEntry
```

### ClearAuditLog

清空审计日志。

```go
func (p *Processor) ClearAuditLog()
```

## 生命周期

### Close

释放 Processor 持有的资源。使用完毕后必须调用。

```go
func (p *Processor) Close() error
```

```go
p, _ := html.New(cfg)
defer p.Close()
// ... 使用 p 进行提取
```

:::tip 生命周期最佳实践
- **单例复用**：在长驻服务（HTTP handler、worker）中创建一个 Processor 并在并发请求间共享，配合缓存最大化收益。Processor 本身并发安全，无需每请求新建。
- **`defer Close()`**：在创建后立即 `defer p.Close()`，确保异常路径也释放后台清理 goroutine 与审计资源。`Close` 会停止缓存清理 goroutine、清空缓存、关闭审计 sink。
- **不要 Close 后使用**：`Close` 之后调用任何方法都会返回 `ErrProcessorClosed`。`Close` 用 `CompareAndSwap` 保证幂等，重复调用安全但无意义。
:::
