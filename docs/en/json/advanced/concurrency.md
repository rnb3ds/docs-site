---
sidebar_label: "Concurrency & Parallelism"
title: "Concurrency - CyberGo JSON | Practical Guide"
description: "CyberGo JSON concurrency: Processor thread-safety guarantees, ParallelIterator and StreamJSONLParallel for parallel large-dataset processing."
sidebar_position: 4
---

# Concurrency & Parallel Processing

All CyberGo JSON operations are **concurrency-safe**, with ready-to-use parallel APIs (`ParallelIterator`, parallel JSONL streaming). This page documents the thread-safety semantics, built-in parallel APIs, and concurrency usage patterns.

:::tip Scope split with the Performance page
The "Concurrency" section of [Performance](./performance) shows **generic Go patterns** (`sync.WaitGroup` + semaphore + Worker Pool) for manually parallelizing array work; this page documents the **library's built-in** parallel APIs. They are complementary.
:::

## Thread-safety guarantees

`Processor` is a thread-safe processing engine (source comment: `Processor is the main JSON processing engine with thread safety`):

- **A single Processor instance can be shared across goroutines** — all public methods (`Get`/`Set`/`Delete`/`Marshal`, etc.) are internally protected by atomics and concurrency governance (`beginGovernedOp`/`endGovernedOp`).
- **Package-level functions** (`json.Get`, `json.GetString`, etc.) share one global Processor and are concurrency-safe by default.
- **A `*ParsedJSON` from `PreParse` can be read concurrently** — multiple goroutines may call `GetFromParsed` on the same `ParsedJSON` simultaneously.

:::warning When not to share
The `Processor` is shareable, but **do not share mutable Go containers across goroutines** (e.g. handing a `map[string]any` returned by `Get` to multiple goroutines for mutation). Returned containers are copies by default (unless `CacheSharedResults` is on), so mutating a return value does not affect the cache — but concurrent mutation of one container still requires caller-side locking.
:::

## ParallelIterator

`ParallelIterator` parallelizes array processing across CPU cores, with a built-in worker pool, error aggregation, and panic recovery — safer than a hand-rolled goroutine pool.

### Basic parallel iteration

```go
package main

import (
	"fmt"
	"sync"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"items":[1,2,3,4,5,6,7,8]}`
	items := json.GetArray(data, "items")

	// Worker count defaults to Config.MaxConcurrency (clamped by array length)
	iter := json.NewParallelIterator(items)
	defer iter.Close()

	var mu sync.Mutex
	var sum int64
	err := iter.ForEach(func(_ int, val any) error {
		mu.Lock()
		sum += int64(val.(float64))
		mu.Unlock()
		return nil
	})
	if err != nil {
		panic(err)
	}
	fmt.Printf("Sum = %d\n", sum)
	// Output: Sum = 36
}
```

### Parallel Map

`Map` transforms each element in parallel; results **preserve input order** (each worker writes its own index, no lock needed).

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"items":[1,2,3,4]}`
	items := json.GetArray(data, "items")

	iter := json.NewParallelIterator(items)
	defer iter.Close()

	// Parallel map: each element * 10, result order matches input
	doubled, err := iter.Map(func(_ int, val any) (any, error) {
		return int(val.(float64)) * 10, nil
	})
	if err != nil {
		panic(err)
	}
	fmt.Println(doubled)
	// Output: [10 20 30 40]
}
```

### ParallelIterator API overview

| API | Signature | Description |
|-----|------|------|
| `NewParallelIterator` | `func NewParallelIterator(data []any, cfg ...Config) *ParallelIterator` | Creates the iterator; worker count from `cfg.MaxConcurrency` |
| `ForEach` | `func (it *ParallelIterator) ForEach(fn func(int, any) error) error` | Parallel iteration; returns the first error |
| `ForEachWithContext` | `func (it *ParallelIterator) ForEachWithContext(ctx context.Context, fn func(int, any) error) error` | Supports context cancellation |
| `ForEachBatch` | `func (it *ParallelIterator) ForEachBatch(batchSize int, fn func(int, []any) error) error` | Processes in batches in parallel |
| `Map` | `func (it *ParallelIterator) Map(transform func(int, any) (any, error)) ([]any, error)` | Parallel transform, order-preserving |
| `Filter` | `func (it *ParallelIterator) Filter(predicate func(int, any) bool) []any` | Parallel filter |
| `Close` | `func (it *ParallelIterator) Close()` | Releases resources (call when done) |

Full signatures and usage in [Iterator types](../api-reference/iterator#paralleliterator-type).

:::tip Error and panic handling
`ForEach` stops dispatching new tasks and returns the **first** error; panics inside workers are recovered and converted to errors, so a callback panic never crashes the process. Use `ForEachWithContext` for cancellation — it exits gracefully on `ctx.Done()`.
:::

## Parallel JSONL streaming

For large JSONL (NDJSON) files, `StreamJSONLParallel` processes each line across multiple workers.

```go
package main

import (
	"fmt"
	"strings"
	"sync"

	"github.com/cybergodev/json"
)

func main() {
	// Simulated JSONL data (one JSON object per line)
	jsonlData := `{"id":1,"score":95}
{"id":2,"score":82}
{"id":3,"score":78}
{"id":4,"score":90}`

	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	var mu sync.Mutex
	var total int64
	var count int64

	// 4 workers process lines in parallel
	err = processor.StreamJSONLParallel(strings.NewReader(jsonlData), 4, func(lineNum int, item *json.IterableValue) error {
		score := int64(item.GetInt("score"))
		mu.Lock()
		total += score
		count++
		mu.Unlock()
		return nil
	})
	if err != nil {
		panic(err)
	}
	fmt.Printf("Processed %d records, total score %d\n", count, total)
	// Output: Processed 4 records, total score 345
}
```

| API | Description |
|-----|------|
| `StreamJSONLParallel(reader, workers, fn)` | Multi-worker parallel JSONL processing |
| `StreamJSONLParallelWithContext(ctx, reader, workers, fn)` | Same, with context cancellation/timeout |
| `StreamJSONLChunked(reader, chunkSize, fn)` | Chunk-based processing, memory-friendly |

Full signatures and config (`JSONLWorkers`/`JSONLChunkSize`, etc.) in [JSONL processing](../api-reference/processor/jsonl) and [JSONL streaming](../streaming/jsonl).

:::tip Line ordering
In parallel mode the callback `lineNum` still reflects the original line number, but **execution order is not guaranteed**. For ordered output, write into a pre-allocated slice at the position matching `lineNum`.
:::

## Global processor for concurrent use

`SetGlobalProcessor` lets all package-level functions share one custom Processor — suited to multi-goroutine services that need uniform configuration (cache params, hooks, security limits).

```go
package main

import (
	"fmt"
	"sync"

	"github.com/cybergodev/json"
)

func main() {
	// Custom global processor (shared by all package-level functions, concurrency-safe)
	cfg := json.DefaultConfig()
	processor, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	json.SetGlobalProcessor(processor) // the previous global Processor is closed automatically
	defer json.ShutdownGlobalProcessor() // clean shutdown at app exit

	data := `{"user":{"name":"Alice","age":30}}`

	// Multiple goroutines use package-level functions concurrently (same global Processor)
	var wg sync.WaitGroup
	results := make([]string, 3)
	for i := 0; i < 3; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			switch idx {
			case 0:
				results[idx] = json.GetString(data, "user.name")
			case 1:
				results[idx] = fmt.Sprintf("%d", json.GetInt(data, "user.age"))
			case 2:
				results[idx] = json.GetString(data, "user.name")
			}
		}(i)
	}
	wg.Wait()
	fmt.Println(results)
	// Output: [Alice 30 Alice]
}
```

:::warning Ownership transfer
After `SetGlobalProcessor`, that Processor's lifecycle is owned by the global — **do not** call `Close()` on it manually, or you conflict with the global shutdown logic. Call `ShutdownGlobalProcessor()` at exit for a clean close and resource release.
:::

## MaxConcurrency limit

`Config.MaxConcurrency` (default 50) is a **soft concurrency cap** per Processor: an atomic counting semaphore limits in-flight operations. When the cap is reached, new operations return `ErrConcurrencyLimit` (retryable).

```go
cfg := json.DefaultConfig()
cfg.MaxConcurrency = 100 // raise the per-Processor concurrency cap
```

- `ErrConcurrencyLimit` is a **retryable** transient error (see [Error handling](./error-handling#system-errors)).
- Parallel streaming (`StreamJSONLParallel`) takes its worker count from the explicit argument, not bound directly to `MaxConcurrency`, but shares the same governance slot.
- `ParallelIterator` worker count comes from `cfg.MaxConcurrency` (default 50), clamped by the array length.

## Best practices & pitfalls

### 1. Reuse the Processor; don't create one per request

A `Processor` holds cache, a recursive processor, and other state — **reusing one instance** is what makes the cache hit. Calling `json.New()` per request forfeits cache gains and adds allocations.

### 2. Sharing the instance is safe; sharing return containers needs care

The `Processor` is safe across goroutines; but a `map`/`slice` returned by `Get`, if shared for mutation across goroutines, requires caller-side locking (or treat as read-only under `CacheSharedResults`).

### 3. Release resources with Close

In long-running services, explicitly `defer processor.Close()` and `defer iter.Close()` to avoid cache goroutine and memory leaks. An instance set via `SetGlobalProcessor` uses `ShutdownGlobalProcessor` instead.

### 4. Only parallelize CPU-bound work

Parallelism has scheduling and sync overhead. Small arrays (< `ParallelThreshold`, default 10) are faster serially; JSONL with many lines and heavy per-line work benefits clearly.

### 5. Mind ordering in parallel mode

`StreamJSONLParallel` does not guarantee processing order. For ordered results, write by `lineNum` into position, then consume in order.

## See Also

- [Performance](./performance) — processor reuse, generic Go concurrency patterns, benchmarks
- [Iterator types](../api-reference/iterator) — full `ParallelIterator` API
- [JSONL processing](../api-reference/processor/jsonl) — parallel JSONL API details
- [Caching & Pre-Parsing](./caching) — cache mechanism and PreParse
- [Error handling](./error-handling) — `ErrConcurrencyLimit` and error classification
