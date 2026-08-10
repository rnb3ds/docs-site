---
sidebar_label: "Processor"
title: "Processor - CyberGo html | Usage, Parameters & Examples"
description: "CyberGo html Processor API: New constructor, the Extract method family, and lifecycle management (GetStatistics, ClearCache, Close) for high-frequency reuse."
sidebar_position: 2
---

# Processor

`Processor` is the core processing engine of the HTML library. Compared to package functions, the Processor reuses internal resources (cache, encoding detector) and is suited for high-frequency call scenarios.

## Creation

### New

Create a Processor instance, optionally passing a configuration.

```go
func New(cfg ...Config) (*Processor, error)
```

**Parameters**: at most one `Config`; when omitted, `DefaultConfig()` is used.

```go
p, err := html.New(html.DefaultConfig())
if err != nil {
    log.Fatal(err)
}
defer p.Close()
```

**Internal initialization**:

`New` is not a simple assignment; it performs the following steps to ensure the returned Processor is immediately usable:

1. **Validates the config**: calls `Config.Validate()`; an invalid config returns `*ConfigError` (`errors.Is(err, ErrInvalidConfig)` is true). Validation covers numeric bounds (`MaxInputSize`, `MaxCacheEntries`, `WorkerPoolSize`, `MaxDepth` must not be negative/out of range) and format strings (the values of `InlineImageFormat`/`InlineLinkFormat`/`TableFormat` must be legal).
2. **Sets the Scorer**: when a custom `Scorer` is configured it is adapted to the internal interface via `scorerAdapter`; otherwise `SharedDefaultScorer` (read-only, concurrency-safe) is used.
3. **Pre-computes the format strings**: `InlineImageFormat`/`InlineLinkFormat` are normalized (lowercased and whitespace-stripped; an empty string maps to `"none"`) and cached in the `imageFormat`/`linkFormat` fields to avoid repeated `strings.ToLower` in the hot path.
4. **Starts cache cleanup**: a background cleanup goroutine is started only when `CacheTTL>0` **and** `CacheCleanup>0`; if either is 0, nothing is started.

## Concurrency Safety

:::tip
A `Processor` can be safely shared across multiple goroutines without additional locking. The concurrency guarantees come from:

- **Immutable config**: `config` is immutable after `New()` (the `*Config` pointer is never reassigned or mutated), so format methods such as `ExtractToMarkdown` can safely make value copies to spawn a temporary Processor without any lock — format overrides never write back to the shared config.
- **Statistics counters**: `TotalProcessed`/`CacheHits`/`CacheMisses`/`ErrorCount`/`totalProcessTime` all use `atomic` operations.
- **Cache**: the internal `Cache` carries its own lock and is safe to read and write.
- **Scorer**: the built-in `DefaultScorer` is read-only. **A custom `Scorer` must ensure its own concurrency safety** (e.g. by holding an internal lock), because a single Processor will invoke its `Score`/`ShouldRemove` from multiple goroutines during concurrent `Extract`.
:::

## Content Extraction

### Error Returns

The `Extract` method family returns clear sentinel errors at each processing stage, which can be checked precisely with `errors.Is`:

| Error | Trigger | Note |
|-------|---------|------|
| `ErrProcessorClosed` | `p` is `nil` or already `Close`d | Shared by all methods |
| `ErrInputTooLarge` | Input bytes exceed `MaxInputSize` | Wrapped in `*InputError`, includes actual/limit sizes |
| Encoding detection error | Encoding detection or UTF-8 conversion fails | The underlying error is wrapped |
| `ErrInvalidHTML` | Bytes cannot be parsed as HTML | The underlying parse error is wrapped as well |
| `ErrMaxDepthExceeded` | Element nesting depth exceeds `MaxDepth` | Iterative check; prevents stack overflow |
| `ErrProcessingTimeout` | Processing time exceeds `ProcessingTimeout` | `ProcessingTimeout=0` means unlimited |
| `ErrInternalPanic` | An unexpected internal panic was recovered | Fallback protection; should not occur in normal use |

The `context`-aware variants may additionally return `context.Canceled` (user cancellation) or `context.DeadlineExceeded` (context timeout, normalized to `ErrProcessingTimeout`).

### Extract

```go
func (p *Processor) Extract(htmlBytes []byte) (*Result, error)
```

Extract content from HTML bytes, with automatic encoding detection.

### ExtractFromFile

```go
func (p *Processor) ExtractFromFile(filePath string) (*Result, error)
```

Extract content from a file.

### ExtractText

```go
func (p *Processor) ExtractText(htmlBytes []byte) (string, error)
```

Return only the plain text.

### ExtractTextFromFile

```go
func (p *Processor) ExtractTextFromFile(filePath string) (string, error)
```

Extract plain text from a file.

## Context Variants

All extraction methods have `ExtractWithContext` variants:

```go
func (p *Processor) ExtractWithContext(ctx context.Context, htmlBytes []byte) (*Result, error)
func (p *Processor) ExtractFromFileWithContext(ctx context.Context, filePath string) (*Result, error)
func (p *Processor) ExtractTextWithContext(ctx context.Context, htmlBytes []byte) (string, error)
func (p *Processor) ExtractTextFromFileWithContext(ctx context.Context, filePath string) (string, error)
```

## Output Formats

```go
func (p *Processor) ExtractToMarkdown(htmlBytes []byte) (string, error)
func (p *Processor) ExtractToMarkdownFromFile(filePath string) (string, error)
func (p *Processor) ExtractToJSON(htmlBytes []byte) ([]byte, error)
func (p *Processor) ExtractToJSONFromFile(filePath string) ([]byte, error)
```

Context-aware variants:

```go
func (p *Processor) ExtractToMarkdownWithContext(ctx context.Context, htmlBytes []byte) (string, error)
func (p *Processor) ExtractToMarkdownFromFileWithContext(ctx context.Context, filePath string) (string, error)
func (p *Processor) ExtractToJSONWithContext(ctx context.Context, htmlBytes []byte) ([]byte, error)
func (p *Processor) ExtractToJSONFromFileWithContext(ctx context.Context, filePath string) ([]byte, error)
```

:::warning
The two differ sharply in cache handling:

- **`ExtractToMarkdown`** builds a temporary Processor (copying the immutable `config`, but with `MaxCacheEntries` zeroed and audit disabled) and **does not read or write the main cache**, so it neither pollutes nor hits the main Processor's cache. Markdown-format results are not cached either.
- **`ExtractToJSON`** calls `p.Extract` directly and **goes through the normal cache path** — it hits/writes the main cache, and statistics counters are updated accordingly.

If you want Markdown output to benefit from the cache too, create a dedicated Processor with `MarkdownConfig()` and call `Extract`, or cache its output yourself.
:::

## Link Extraction

```go
func (p *Processor) ExtractAllLinks(htmlBytes []byte) ([]LinkResource, error)
func (p *Processor) ExtractAllLinksFromFile(filePath string) ([]LinkResource, error)
func (p *Processor) ExtractAllLinksWithContext(ctx context.Context, htmlBytes []byte) ([]LinkResource, error)
func (p *Processor) ExtractAllLinksFromFileWithContext(ctx context.Context, filePath string) ([]LinkResource, error)
```

## Batch Processing

```go
func (p *Processor) ExtractBatch(htmlContents [][]byte) *BatchResult
func (p *Processor) ExtractBatchWithContext(ctx context.Context, htmlContents [][]byte) *BatchResult
func (p *Processor) ExtractBatchFiles(filePaths []string) *BatchResult
func (p *Processor) ExtractBatchFilesWithContext(ctx context.Context, filePaths []string) *BatchResult
```

## Statistics and Cache

### Cache Behavior in Detail

When `MaxCacheEntries > 0`, `Extract` enables the cache:

- **Hit path**: after detecting a cache entry, `CacheHits` and `TotalProcessed` are each incremented by 1, and what is returned is `cloneResult` — a deep copy that `copy`s slices such as `Images`/`Links`/`Videos`/`Audios`. Mutations by the caller **do not** affect the cached entry and also avoid data races during concurrent hit reads.
- **Miss path**: once processing completes, the result is written to the cache and a `cloneResult` (again a deep copy) is returned. So the cache entry and the return value never alias each other.
- **Disabling the cache**: with `MaxCacheEntries = 0`, `Extract` short-circuits past cache-key generation and `Get/Set`, with no cache overhead at all.

### GetStatistics

Return the current processing statistics.

```go
func (p *Processor) GetStatistics() Statistics
```

Meaning of each `Statistics` field:

| Field | Description |
|-------|-------------|
| `TotalProcessed` | Number of extractions that completed without error, **including cache hits** |
| `CacheHits` | Number of times served directly from the cache |
| `CacheMisses` | Number of misses requiring full processing |
| `ErrorCount` | Number of extractions that returned an error |
| `AverageProcessTime` | Average wall-clock time per extraction (0 when `TotalProcessed` is 0) |

```go
stats := p.GetStatistics()
fmt.Printf("Processed: %d, Cache hits: %d\n",
    stats.TotalProcessed, stats.CacheHits)
```

### ClearCache

Clear the cache, keeping accumulated statistics.

```go
func (p *Processor) ClearCache()
```

### ResetStatistics

Reset all statistics counters.

```go
func (p *Processor) ResetStatistics()
```

## Audit

### GetAuditLog

Retrieve audit log entries.

```go
func (p *Processor) GetAuditLog() []AuditEntry
```

### ClearAuditLog

Clear the audit log.

```go
func (p *Processor) ClearAuditLog()
```

## Lifecycle

### Close

Release the resources held by the Processor. Must be called when done.

```go
func (p *Processor) Close() error
```

```go
p, _ := html.New(cfg)
defer p.Close()
// ... use p to extract
```

:::tip
- **Singleton reuse**: in a long-running service (HTTP handler, worker), create one Processor and share it across concurrent requests, pairing it with the cache to maximize gains. The Processor itself is concurrency-safe; there is no need to create one per request.
- **`defer Close()`**: place `defer p.Close()` right after creation so that even an exceptional path releases the background cleanup goroutine and audit resources. `Close` stops the cache cleanup goroutine, clears the cache, and closes the audit sink.
- **Do not use after Close**: calling any method after `Close` returns `ErrProcessorClosed`. `Close` uses `CompareAndSwap` to be idempotent; repeated calls are safe but pointless.
:::
