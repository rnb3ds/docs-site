---
sidebar_label: "Caching & Pre-Parsing"
title: "Caching & Pre-Parsing - CyberGo JSON | Cache Strategies"
description: "CyberGo JSON caching and pre-parsing: EnableCache auto-caching, GetStats monitoring, WarmupCache warmup and PreParse for high-frequency queries."
sidebar_position: 3
---

# Caching & Pre-Parsing Strategies

CyberGo JSON ships with an **automatic caching subsystem**: parse results and path-query results are cached for you, no hand-rolled `sync.Map` required. This page covers configuring, monitoring, and warming the built-in cache, the `PreParse` pre-parsing pattern, and selection guidance.

:::tip Scope split with the Performance page
The "Caching strategy" section of [Performance](./performance) shows a **user-built** `sync.Map` cache; this page documents the **library's built-in** cache (`EnableCache`/`WarmupCache`/`PreParse`). They are complementary.
:::

## How the built-in cache works

When `Config.EnableCache` is `true` (default) and `CacheResults` is `true` (default), query operations such as `Get` cache automatically:

1. **Parse cache**: JSON string -> parsed `any` tree (keyed by FNV-1a hash)
2. **Result cache**: `(JSON, path)` -> query result

A second query on the same JSON skips parsing and goes straight to path navigation; an identical `(JSON, path)` pair returns the cached result directly.

:::warning Automatic invalidation on writes
Mutation operations (`Set`/`Delete`) **automatically invalidate** related cache entries (cleared in bulk by JSON-hash prefix) — no manual action needed. You only need `ClearCache` when an external data source changes or memory pressure is high.
:::

## Monitoring cache hit ratio

`GetStats()` returns a `Stats` struct with hit/miss counts, hit ratio, and current entry count.

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

	// Warm up frequently used paths: internally runs one Get per path and stores results
	paths := []string{"user.name", "user.email", "version"}
	result, err := processor.WarmupCache(data, paths)
	if err != nil {
		panic(err)
	}
	fmt.Printf("Warmed up: %d/%d (success rate %.0f%%)\n", result.Successful, result.TotalPaths, result.SuccessRate)
	// Output: Warmed up: 3/3 (success rate 100%)

	// The same (JSON, path) query now hits the cache
	name, err := processor.Get(data, "user.name")
	if err != nil {
		panic(err)
	}
	fmt.Printf("user.name = %v\n", name)
	// Output: user.name = Alice

	// Inspect cache config and state
	stats := processor.GetStats()
	fmt.Printf("Cache enabled: %v, TTL: %v\n", stats.CacheEnabled, stats.CacheTTL)
	// Output: Cache enabled: true, TTL: 5m0s
}
```

Key `Stats` fields (full struct in [Lifecycle & Stats](../api-reference/processor/lifecycle#statistics)):

| Field | Description |
|------|------|
| `HitRatio` | Hit ratio (0–1); below 0.5 warrants a workload or tuning review |
| `HitCount` / `MissCount` | Cumulative hit / miss counts |
| `CacheSize` | Current number of cache entries |
| `CacheTTL` | Cache entry expiry |

## Warming the cache with WarmupCache

`WarmupCache(jsonStr, paths, cfg...)` bulk-populates the cache ahead of real queries, eliminating first-request cold-start latency. Ideal for services that serve traffic immediately after startup.

```go
// Signature: func (p *Processor) WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)
```

`WarmupResult` carries `TotalPaths`/`Successful`/`Failed`/`SuccessRate`/`FailedPaths`, useful for verifying warmup completeness (a typo in a config path surfaces as a `FailedPaths` entry).

:::warning Prerequisite
Calling `WarmupCache` with `EnableCache = false` returns an error (cannot warm a disabled cache). Warmup must happen on the **same Processor instance** you query — package-level functions (e.g. `json.GetString`) use the global Processor, whose cache is isolated from a custom instance.
:::

## The PreParse pattern

When the **same JSON is queried across many paths**, `PreParse` + `GetFromParsed` is the most direct pattern: parse once, then query the parsed result multiple times, bypassing cache-key lookups entirely.

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

	// Parse once, query many times (skips repeated parsing)
	parsed, err := processor.PreParse(data)
	if err != nil {
		panic(err)
	}
	defer parsed.Release()

	// Multiple paths share the same parsed result
	for _, path := range []string{"users[0].name", "users[1].name", "total"} {
		val, err := processor.GetFromParsed(parsed, path)
		if err != nil {
			panic(err)
		}
		fmt.Printf("%s = %v\n", path, val)
	}
	// Output:
	// users[0].name = Alice
	// users[1].name = Bob
	// total = 2
}
```

Key APIs:

| API | Signature | Description |
|-----|------|------|
| `PreParse` | `func (p *Processor) PreParse(jsonStr string, cfg ...Config) (*ParsedJSON, error)` | Parses and returns a reusable `*ParsedJSON` |
| `GetFromParsed` | `func (p *Processor) GetFromParsed(parsed *ParsedJSON, path string, cfg ...Config) (any, error)` | Queries the pre-parsed result, skipping the parse step |
| `(*ParsedJSON).Release` | `func (p *ParsedJSON) Release()` | Releases the reference; call when done (usually via `defer`) |

:::tip PreParse vs automatic cache
`PreParse` explicitly holds the parsed-result handle, suited to local "parse once, consume many" flows; the automatic cache deduplicates **globally by JSON content**, suited to the same JSON being queried repeatedly across call sites. They coexist: `PreParse` also writes into the parse cache internally.
:::

## Tuning cache configuration

Cache behavior is governed by several `Config` fields (full list in [Config](../api-reference/config#config-struct)):

| Field | Default | Description |
|------|--------|------|
| `EnableCache` | `true` | Master switch; when off, all caching is skipped (`Get` takes a fast path) |
| `CacheResults` | `true` | Whether to cache query results; `false` keeps only the parse cache |
| `CacheTTL` | `5 minutes` | Entry expiry |
| `MaxCacheSize` | `128` | Max entries (LRU eviction) |
| `CacheSharedResults` | `false` | Share cached results, skipping the defensive deep copy (high-perf read-only) |

```go
package main

import (
	"fmt"
	"time"

	"github.com/cybergodev/json"
)

func main() {
	cfg := json.DefaultConfig()
	cfg.MaxCacheSize = 256            // hold more hot data
	cfg.CacheTTL = 10 * time.Minute   // extend validity

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
	fmt.Println("Query done")
	// Output: Query done
}
```

### The CacheSharedResults zero-copy contract

With `CacheSharedResults = true`, a cache hit on `Get`/`GetFromParsed` returns the cached value **directly**, skipping the defensive deep copy and dramatically cutting overhead for repeated reads of large objects.

:::danger Read-only contract
When enabled, **callers must not mutate** the returned `map[string]any` / `[]any`, or the shared cache is corrupted and subsequent reads poisoned. Primitives (`bool`/`float64`/`string`/`json.Number`/`nil`) are immutable and always safe. Enable only when callers treat results as read-only (e.g. analytical workloads that repeatedly read the same large subtree).
:::

## Cleanup & invalidation

| Operation | API | When |
|------|-----|----------|
| Manual clear | `processor.ClearCache()` | Data source changed, memory pressure, forced refresh |
| Automatic post-write invalidation | internal call inside `Set`/`Delete` | No manual cleanup after mutations; entries are cleared by JSON-hash prefix |

`ClearCache` fits "one Processor running long-term with rotating data sources." One-off scripts need no manual clear — `Close()` reclaims all resources.

## Recipe: high-frequency query caching

This recipe combines warmup, PreParse, and monitoring — suited to API gateways / config centers with high read volume.

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

	// 1. Warm up hot paths at startup
	hotPaths := []string{"db.host", "db.port", "cache.ttl"}
	if _, err := processor.WarmupCache(configJSON, hotPaths); err != nil {
		panic(err)
	}

	// 2. Extract multiple fields from the same config (PreParse pattern)
	parsed, err := processor.PreParse(configJSON)
	if err != nil {
		panic(err)
	}
	defer parsed.Release()

	host, err := processor.GetFromParsed(parsed, "db.host")
	if err != nil {
		panic(err)
	}
	fmt.Printf("DB host: %v\n", host)
	// Output: DB host: db.local

	// 3. Monitor hit ratio at runtime; alert below a threshold
	stats := processor.GetStats()
	fmt.Printf("Current hit ratio: %.2f%%\n", stats.HitRatio*100)
}
```

## Selection guidance

| Scenario | Recommendation | Why |
|------|----------|------|
| One-off query / script | Default config | Built-in cache adds no burden to a single call; `Get` has a fast path |
| Same JSON queried repeatedly (different call sites) | Keep `EnableCache=true` | Auto-dedup by JSON content, zero code change |
| One JSON, parse once, query many paths in a batch | `PreParse` + `GetFromParsed` | Explicitly reuses the parse result, bypasses cache-key cost |
| Service serving traffic right after startup | `WarmupCache` | Eliminates first-batch cold-start latency |
| Repeatedly reading the same large read-only subtree | `CacheSharedResults=true` | Skips deep copy for zero-copy performance |
| Untrusted input / security-sensitive | `SecurityConfig()` (shorter TTL) | Security preset uses conservative cache parameters |

## See Also

- [Performance](./performance) — processor reuse, memory optimization, benchmarks
- [Lifecycle & Stats](../api-reference/processor/lifecycle#statistics) — `GetStats`/`WarmupCache`/`ClearCache` API details
- [Config](../api-reference/config) — full cache field reference
- [Concurrency & Parallel Processing](./concurrency) — Processor thread safety and parallel iterators
