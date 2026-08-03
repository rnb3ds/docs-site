---
sidebar_label: "Batch Operations"
title: "Processor Batch Operations - CyberGo JSON | API Reference"
description: "CyberGo JSON Processor batch operations: ProcessBatch for multi-operations, BatchOperation and BatchResult types, suitable for batch processing."
sidebar_position: 7
---

# Batch Operation Methods

The Processor provides batch operation capabilities, processing multiple JSON operations (get/set/delete/validate) in a single call. Compared to the package-level [`ProcessBatch`](../functions/batch), the Processor form is suited for reusing an instance, or for customizing each batch's behavior via `Config` (pretty output, number preservation, security limits, etc.).

## ProcessBatch

Signature: `func (p *Processor) ProcessBatch(operations []BatchOperation, cfg ...Config) ([]BatchResult, error)`

Batch processes multiple JSON operations. The result order matches the input operation order, correlated via the `ID` field.

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New(json.DefaultConfig())
    if err != nil {
        panic(err)
    }
    defer p.Close()

    data := `{"user":{"name":"CyberGo","age":25}}`
    results, err := p.ProcessBatch([]json.BatchOperation{
        {Type: "get", JSONStr: data, Path: "user.name", ID: "name"},
        {Type: "set", JSONStr: data, Path: "user.age", Value: 30, ID: "age"},
    })
    if err != nil {
        panic(err)
    }
    for _, r := range results {
        fmt.Printf("%s: %v\n", r.ID, r.Result)
    }
}
// Output:
// name: CyberGo
// age: {"user":{"age":30,"name":"CyberGo"}}
```

### Supported Operation Types

| `Type` | Purpose | `Result` content | Typical errors |
|--------|---------|------------------|----------------|
| `get` | Reads the value at a path | The value at the path (`any`) | `ErrPathNotFound`, `ErrInvalidJSON` |
| `set` | Sets a value at a path | **The full modified JSON string** | `ErrPathNotFound` (when `CreatePaths` is off), `ErrInvalidPath` |
| `delete` | Deletes the node at a path | **The full JSON string after deletion** | `ErrPathNotFound`, `ErrInvalidPath` |
| `validate` | Validates whether the JSON is valid | `map[string]any{"valid": bool}` | On invalid JSON, `Result.valid=false` and `Error` is non-nil |

::: warning Operations are not chained
Each `BatchOperation` acts **independently** on its own `JSONStr` input; operations are **not** chained together. Running `set` then `delete` on the same document yields two independent results, not a "set then delete" combined state. If you need multi-step transforms on a single document, feed the previous step's output into the next in your code, or use single-document multi-path methods like [`SetMultiple`](./modify#setmultiple).
:::

### Batch Size Limit

The number of operations is constrained by `Config.MaxBatchSize` (default `2000`). This limit applies per call — the passed-in `cfg` (if any) overrides the Processor's own configuration. When exceeded, the entire batch fails directly, returning `(nil, ErrSizeLimit)`.

## Examples by Operation Type

### get — Batch Read

The `Result` of a `get` operation is the raw value at the path (numbers default to `float64`).

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New(json.DefaultConfig())
    if err != nil {
        panic(err)
    }
    defer p.Close()

    data := `{"user":{"name":"CyberGo","age":25}}`
    results, err := p.ProcessBatch([]json.BatchOperation{
        {Type: "get", JSONStr: data, Path: "user.name", ID: "name"},
        {Type: "get", JSONStr: data, Path: "user.age", ID: "age"},
    })
    if err != nil {
        panic(err)
    }
    for _, r := range results {
        fmt.Printf("%s: %v\n", r.ID, r.Result)
    }
}
// Output:
// name: CyberGo
// age: 25
```

### set — Batch Modification

The `Result` of `set` is **the full modified JSON string** (compact format, object keys sorted alphabetically). The default `CreatePaths=true`, so setting a new path automatically creates intermediate nodes:

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New(json.DefaultConfig())
    if err != nil {
        panic(err)
    }
    defer p.Close()

    data := `{"user":{"name":"CyberGo","age":25}}`
    results, err := p.ProcessBatch([]json.BatchOperation{
        {Type: "set", JSONStr: data, Path: "user.age", Value: 30, ID: "age"},
        {Type: "set", JSONStr: data, Path: "user.role", Value: "admin", ID: "role"},
    })
    if err != nil {
        panic(err)
    }
    for _, r := range results {
        fmt.Printf("%s -> %s\n", r.ID, r.Result)
    }
}
// Output:
// age -> {"user":{"age":30,"name":"CyberGo"}}
// role -> {"user":{"age":25,"name":"CyberGo","role":"admin"}}
```

::: tip How configuration affects the batch
The passed-in `Config` is transparently forwarded to each operation, but **not all fields affect output**: the return value of `set`/`delete` is always a compact string (unaffected by `Pretty`; for pretty output apply [`Prettify`](./output#prettify) to the result); the fields that actually take effect per `cfg` are `MaxBatchSize` (batch limit), `CreatePaths` (whether `set` can create new paths), and `PreserveNumbers` (affects the numeric type returned by `get`: `float64` by default, `json.Number` when enabled).
:::

### delete — Batch Deletion

The `Result` of `delete` is **the full JSON string after deletion**.

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New(json.DefaultConfig())
    if err != nil {
        panic(err)
    }
    defer p.Close()

    data := `{"user":{"name":"CyberGo","age":25,"temp":"x"},"debug":true}`
    results, err := p.ProcessBatch([]json.BatchOperation{
        {Type: "delete", JSONStr: data, Path: "user.temp", ID: "drop-temp"},
        {Type: "delete", JSONStr: data, Path: "debug", ID: "drop-debug"},
    })
    if err != nil {
        panic(err)
    }
    for _, r := range results {
        fmt.Printf("%s -> %s\n", r.ID, r.Result)
    }
}
// Output:
// drop-temp -> {"debug":true,"user":{"age":25,"name":"CyberGo"}}
// drop-debug -> {"user":{"age":25,"name":"CyberGo","temp":"x"}}
```

### validate — Batch Validation

The `Result` of `validate` is always `map[string]any{"valid": bool}`; on invalid JSON, `valid` is `false` and `Error` carries the parse error.

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New(json.DefaultConfig())
    if err != nil {
        panic(err)
    }
    defer p.Close()

    results, err := p.ProcessBatch([]json.BatchOperation{
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

### Mixed Operations

Different operation types can be mixed in the same batch, with results returned in order:

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New(json.DefaultConfig())
    if err != nil {
        panic(err)
    }
    defer p.Close()

    data := `{"user":{"name":"CyberGo"},"processed":false}`
    results, err := p.ProcessBatch([]json.BatchOperation{
        {Type: "validate", JSONStr: data, ID: "check"},
        {Type: "get", JSONStr: data, Path: "user.name", ID: "name"},
        {Type: "set", JSONStr: data, Path: "processed", Value: true, ID: "mark"},
    })
    if err != nil {
        panic(err)
    }

    for _, r := range results {
        if r.ID == "check" {
            if m, ok := r.Result.(map[string]any); ok {
                fmt.Printf("Validation result: %v\n", m["valid"])
            }
        } else {
            fmt.Printf("%s: %v\n", r.ID, r.Result)
        }
    }
}
// Output:
// Validation result: true
// name: CyberGo
// mark: {"processed":true,"user":{"name":"CyberGo"}}
```

## Error Handling and Fault Tolerance

### Single-Operation Failure Does Not Interrupt the Batch

`ProcessBatch` **always processes all operations**: a failure in one operation only writes to that result's `Error` field, without interrupting subsequent operations, and requires no configuration to enable. Therefore batch results may be "partially successful, partially failed" — always check `r.Error` for each entry:

```go
results, err := p.ProcessBatch(operations)
if err != nil {
    // err only appears when the processor is closed, configuration is invalid,
    // or MaxBatchSize is exceeded
    return err
}
for _, r := range results {
    if r.Error != nil {
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

Add a migration flag to a batch of records, completing all transforms in a single `ProcessBatch` call. The Processor form is especially suited for long-running services that reuse the same instance to handle a large volume of batches:

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New(json.DefaultConfig())
    if err != nil {
        panic(err)
    }
    defer p.Close()

    records := []string{
        `{"id":1,"name":"Alice","age":30}`,
        `{"id":2,"name":"Bob","age":25}`,
        `{"id":3,"name":"CyberGo","age":28}`,
    }

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

    results, err := p.ProcessBatch(ops)
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

Signature: `func (p *Processor) WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)`

Pre-evaluates hot paths on the same JSON and fills the cache, so that the first subsequent [`Get`](./query) hits the cache directly. Requires the Processor cache to be enabled (enabled by default), otherwise returns `ErrCacheDisabled`.

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New(json.DefaultConfig())
    if err != nil {
        panic(err)
    }
    defer p.Close()

    data := `{"user":{"name":"CyberGo","age":25},"meta":{"version":2}}`
    result, err := p.WarmupCache(data, []string{"user.name", "user.age", "meta.version"})
    if err != nil {
        panic(err)
    }
    fmt.Printf("Warmup: %d/%d successful (%.0f%%)\n", result.Successful, result.TotalPaths, result.SuccessRate)
}
// Output:
// Warmup: 3/3 successful (100%)
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

### BatchOperation Struct

```go
type BatchOperation struct {
    Type    string `json:"type"`     // Operation type: "get", "set", "delete", "validate"
    JSONStr string `json:"json_str"` // JSON string
    Path    string `json:"path"`     // Target path
    Value   any    `json:"value"`    // Value for set operations
    ID      string `json:"id"`       // Operation identifier
}
```

### BatchResult Struct

```go
type BatchResult struct {
    ID     string `json:"id"`     // Corresponding operation ID
    Result any    `json:"result"` // Operation result (meaning varies by Type, see table above)
    Error  error  `json:"error"`  // Error for a single operation (does not affect other operations)
}
```

## Notes

1. Each operation is executed independently; one failure does not affect other operations (built-in behavior, no configuration needed)
2. Result order matches the operation order; use `ID` to match operations with results
3. `MaxBatchSize` (default 2000) applies per call's `cfg`; when exceeded the entire batch fails

## See Also

- [Path Query](./query) - Get series methods
- [Data Modification](./modify) - Set/Delete/SetMultiple methods
- [Package-level Batch Operations](../functions/batch) - Package-level ProcessBatch without a Processor
