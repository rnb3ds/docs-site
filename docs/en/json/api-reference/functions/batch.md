---
sidebar_label: "Batch Operations"
title: "Batch Operation Functions - CyberGo JSON | API Reference"
description: "CyberGo JSON batch operations: ProcessBatch runs multiple JSON ops at once via BatchOperation and BatchResult for efficient bulk processing."
sidebar_position: 7
---

# Batch Operation Functions

The json package provides batch operation functions, supporting processing multiple JSON operations (get/set/delete/validate) at once, suitable for bulk data processing scenarios.

## ProcessBatch

Signature: `func ProcessBatch(operations []BatchOperation, cfg ...Config) ([]BatchResult, error)`

Batch processes multiple JSON operations (package-level function, no Processor required). The result order corresponds one-to-one with the input operation order, correlated via the `ID` field.

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    jsonStr := `{"user": {"name": "CyberGo", "age": 25}}`

    operations := []json.BatchOperation{
        {Type: "get", JSONStr: jsonStr, Path: "user.name", ID: "op1"},
        {Type: "set", JSONStr: jsonStr, Path: "user.age", Value: 30, ID: "op2"},
    }

    results, err := json.ProcessBatch(operations)
    if err != nil {
        panic(err)
    }
    for _, r := range results {
        if r.Error != nil {
            fmt.Printf("Operation %s failed: %v\n", r.ID, r.Error)
        } else {
            fmt.Printf("Operation %s result: %v\n", r.ID, r.Result)
        }
    }
}
// Output:
// Operation op1 result: CyberGo
// Operation op2 result: {"user":{"age":30,"name":"CyberGo"}}
```

### Supported Operation Types

| `Type` | Purpose | `Result` content | Typical errors |
|--------|---------|------------------|----------------|
| `get` | Reads the value at a path | The value at the path (`any`) | `ErrPathNotFound`, `ErrInvalidJSON` |
| `set` | Sets a value at a path | **The full modified JSON string** | `ErrPathNotFound` (when `CreatePaths` is off), `ErrInvalidPath` |
| `delete` | Deletes the node at a path | **The full JSON string after deletion** | `ErrPathNotFound`, `ErrInvalidPath` |
| `validate` | Validates whether the JSON is valid | `map[string]any{"valid": bool}` | On invalid JSON, `Result.valid=false` and `Error` is non-nil |

::: warning Operations are not chained
Each `BatchOperation` acts **independently** on its own `JSONStr` input; operations are **not** chained together. For example, running `set` then `delete` on the same document yields two independent results, not a "set then delete" combined state. If you need multi-step transforms on a single document, feed the previous step's output into the next in your code, or use single-document multi-path methods like [`SetMultiple`](./modify#setmultiple).
:::

### Batch Size Limit

The number of operations is constrained by `Config.MaxBatchSize` (default `2000`). When exceeded, the entire batch fails directly, returning `(nil, ErrSizeLimit)`:

```go
// Custom upper bound (for very large batch scenarios)
cfg := json.DefaultConfig()
cfg.MaxBatchSize = 5000
results, err := json.ProcessBatch(ops, cfg)
```

## Examples by Operation Type

### get — Batch Read

The `Result` of a `get` operation is the raw value at the path (numbers default to `float64`, booleans to `bool`, strings to `string`).

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    data := `{"user":{"name":"CyberGo","age":25},"active":true}`

    results, err := json.ProcessBatch([]json.BatchOperation{
        {Type: "get", JSONStr: data, Path: "user.name", ID: "name"},
        {Type: "get", JSONStr: data, Path: "user.age", ID: "age"},
        {Type: "get", JSONStr: data, Path: "active", ID: "active"},
    })
    if err != nil {
        panic(err)
    }

    for _, r := range results {
        if r.Error != nil {
            fmt.Printf("%s failed: %v\n", r.ID, r.Error)
            continue
        }
        fmt.Printf("%s = %v\n", r.ID, r.Result)
    }
}
// Output:
// name = CyberGo
// age = 25
// active = true
```

### set — Batch Modification

The `Result` of a `set` operation is **the full modified JSON string** (note: not the written value itself). The default configuration has `CreatePaths=true`, so setting a new path automatically creates intermediate nodes.

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    data := `{"user":{"name":"CyberGo","age":25}}`

    results, err := json.ProcessBatch([]json.BatchOperation{
        {Type: "set", JSONStr: data, Path: "user.age", Value: 30, ID: "update-age"},
        {Type: "set", JSONStr: data, Path: "user.role", Value: "admin", ID: "add-role"},
    })
    if err != nil {
        panic(err)
    }

    for _, r := range results {
        if r.Error != nil {
            fmt.Printf("%s failed: %v\n", r.ID, r.Error)
            continue
        }
        fmt.Printf("%s -> %s\n", r.ID, r.Result)
    }
}
// Output:
// update-age -> {"user":{"age":30,"name":"CyberGo"}}
// add-role -> {"user":{"age":25,"name":"CyberGo","role":"admin"}}
```

::: tip Output format note
The JSON strings returned by `set`/`delete` are in **compact format** (no extraneous whitespace), and object keys are sorted alphabetically (consistent with `encoding/json` behavior, ensuring deterministic output). For pretty output, apply [`Prettify`](./output#prettify) to the result separately.
:::

### delete — Batch Deletion

The `Result` of a `delete` operation is **the full JSON string after deletion**.

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    data := `{"user":{"name":"CyberGo","age":25,"temp":"x"},"debug":true}`

    results, err := json.ProcessBatch([]json.BatchOperation{
        {Type: "delete", JSONStr: data, Path: "user.temp", ID: "drop-temp"},
        {Type: "delete", JSONStr: data, Path: "debug", ID: "drop-debug"},
    })
    if err != nil {
        panic(err)
    }

    for _, r := range results {
        if r.Error != nil {
            fmt.Printf("%s failed: %v\n", r.ID, r.Error)
            continue
        }
        fmt.Printf("%s -> %s\n", r.ID, r.Result)
    }
}
// Output:
// drop-temp -> {"debug":true,"user":{"age":25,"name":"CyberGo"}}
// drop-debug -> {"user":{"age":25,"name":"CyberGo","temp":"x"}}
```

### validate — Batch Validation

The `Result` of a `validate` operation is always `map[string]any{"valid": bool}`; when the JSON is invalid, `valid` is `false` and `Error` carries the parse error.

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    results, err := json.ProcessBatch([]json.BatchOperation{
        {Type: "validate", JSONStr: `{"name":"CyberGo"}`, ID: "ok"},
        {Type: "validate", JSONStr: `{"name":}`, ID: "broken"},
    })
    if err != nil {
        panic(err)
    }

    for _, r := range results {
        if m, ok := r.Result.(map[string]any); ok {
            fmt.Printf("%s: valid=%v\n", r.ID, m["valid"])
        }
        if r.Error != nil {
            fmt.Printf("%s error: %v\n", r.ID, r.Error)
        }
    }
}
// Output:
// ok: valid=true
// broken: valid=false
// broken error: invalid JSON: ...
```

## Error Handling and Fault Tolerance

### Single-Operation Failure Does Not Interrupt the Batch

`ProcessBatch` **always processes all operations**: a failure in one operation only writes to that result's `Error` field, without interrupting subsequent operations, and requires no configuration to enable. Therefore batch results may be "partially successful, partially failed" — always check `r.Error` for each entry:

```go
results, err := json.ProcessBatch(operations)
if err != nil {
    // err only appears when the processor is closed, configuration is invalid,
    // or MaxBatchSize is exceeded
    panic(err)
}
var failed int
for _, r := range results {
    if r.Error != nil {
        failed++
        log.Printf("Operation %s failed: %v", r.ID, r.Error)
        continue
    }
    // Process r.Result ...
}
```

::: tip Difference from ContinueOnError
The `Config.ContinueOnError` field controls the mid-stream fault tolerance of [`SetMultiple`](./modify#setmultiple) (whether to continue writing other paths when one path write fails), and does **not** apply to `ProcessBatch`. The per-operation isolation of `ProcessBatch` is built-in behavior that cannot be turned off via this switch.
:::

## Practical Scenario: Batch Data Migration

Add a migration flag to a batch of records, completing all transforms in a single `ProcessBatch` call and collecting each record's output:

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    // Simulate multiple records read from a data source
    records := []string{
        `{"id":1,"name":"Alice","age":30}`,
        `{"id":2,"name":"Bob","age":25}`,
        `{"id":3,"name":"CyberGo","age":28}`,
    }

    // Generate a set operation for each record, uniformly adding a migration flag
    ops := make([]json.BatchOperation, len(records))
    for i, r := range records {
        ops[i] = json.BatchOperation{
            Type:    "set",
            JSONStr: r,
            Path:    "migrated",
            Value:   true,
            ID:      fmt.Sprintf("record-%d", i),
        }
    }

    results, err := json.ProcessBatch(ops)
    if err != nil {
        panic(err)
    }

    for _, r := range results {
        if r.Error != nil {
            fmt.Printf("%s failed: %v\n", r.ID, r.Error)
            continue
        }
        fmt.Printf("%s -> %s\n", r.ID, r.Result)
    }
}
// Output:
// record-0 -> {"age":30,"id":1,"migrated":true,"name":"Alice"}
// record-1 -> {"age":25,"id":2,"migrated":true,"name":"Bob"}
// record-2 -> {"age":28,"id":3,"migrated":true,"name":"CyberGo"}
```

## Cache Warmup: WarmupCache

Signature: `func WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)`

Pre-evaluates hot paths on the same JSON and fills the cache, so that the first subsequent `Get` hits the cache directly. Requires the processor cache to be enabled (enabled by default), otherwise returns `ErrCacheDisabled`.

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    data := `{"user":{"name":"CyberGo","age":25},"meta":{"version":2}}`

    result, err := json.WarmupCache(data, []string{"user.name", "user.age", "meta.version"})
    if err != nil {
        panic(err)
    }
    fmt.Printf("Warmup: %d/%d successful (%.0f%%)\n", result.Successful, result.TotalPaths, result.SuccessRate)

    // After warmup, the first Get hits the cache
    name, err := json.Get(data, "user.name")
    if err != nil {
        panic(err)
    }
    fmt.Println("name:", name)
}
// Output:
// Warmup: 3/3 successful (100%)
// name: CyberGo
```

`WarmupResult` structure:

| Field | Type | Description |
|-------|------|-------------|
| `TotalPaths` | `int` | Total number of paths to warm up |
| `Successful` | `int` | Number of successful entries |
| `Failed` | `int` | Number of failed entries |
| `SuccessRate` | `float64` | Success rate (percentage) |
| `FailedPaths` | `[]string` | List of failed paths (nil when there are no failures) |

When all paths fail, `WarmupCache` returns the `WarmupResult` along with the last error.

## Type Definitions

### BatchOperation

Batch operation descriptor structure.

```go
type BatchOperation struct {
    Type    string `json:"type"`     // Operation type: "get", "set", "delete", "validate"
    JSONStr string `json:"json_str"` // Target JSON string
    Path    string `json:"path"`     // Path expression
    Value   any    `json:"value"`    // Operation value (used by set operations)
    ID      string `json:"id"`       // Operation identifier
}
```

### BatchResult

Batch operation result structure.

```go
type BatchResult struct {
    ID     string `json:"id"`     // Operation identifier
    Result any    `json:"result"` // Operation result (meaning varies by Type, see table above)
    Error  error  `json:"error"`  // Error information (per-operation level)
}
```

::: tip Processor Batch Method
The Processor instance provides an equivalent batch method `p.ProcessBatch(operations)` with the same signature as the package-level function, suitable for scenarios that reuse a Processor or need per-`Config` customization (e.g. `Pretty` output, `PreserveNumbers`). See [Processor Batch Operations](../processor/batch).
:::

## See Also

- [Modify Functions](./modify) - Set, SetMultiple, MergeJSON and other modify operations
- [Processor Batch Operations](../processor/batch) - Processor-level batch operation methods in detail
- [Helper Functions](../helpers) - WarmupCache, ClearCache, GetStats and other utility functions
