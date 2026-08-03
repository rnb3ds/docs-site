---
sidebar_label: "Modify"
title: "Processor Data Modification - CyberGo JSON | API Reference"
description: "CyberGo JSON Processor modify methods: Set, SetMultiple batching, SetCreate auto-path creation, SetMultipleCreate batch creation, all supporting chained calls."
sidebar_position: 3
---

# Data Modification Methods

The Processor provides data modification methods. All methods **return a new modified JSON string** (immutable semantics; the original string is unchanged) and support chained calls. Deletion methods are documented in [Delete Operations](./delete).

## Immutable Semantics

All modification methods return a **new JSON string**; the original input string is never modified (Go strings are immutable by nature). On failure, the original string and the error are returned, enabling safe fallback:

```go
original := `{"user":{"name":"Alice"}}`

// Set returns a new string; original is unchanged
modified, err := p.Set(original, "user.name", "Bob")
// original is still {"user":{"name":"Alice"}}
// modified is {"user":{"name":"Bob"}}

// On failure, returns the original string + error
result, err := p.Set(original, "nonexistent.deep.path", "x")
// result == original (when CreatePaths=false and the path does not exist)
```

**Full Example**

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

    original := `{"user":{"name":"Alice"}}`
    modified, err := p.Set(original, "user.name", "Bob")
    if err != nil {
        panic(err)
    }
    fmt.Println(original) // Output: {"user":{"name":"Alice"}}
    fmt.Println(modified) // Output: {"user":{"name":"Bob"}}
}
```

## Set

Signature: `func (p *Processor) Set(jsonStr, path string, value any, cfg ...Config) (result string, err error)`

Sets the value at the specified path and returns the modified JSON string. Whether non-existent intermediate paths are automatically created depends on `Config.CreatePaths` (see [CreatePaths and SetCreate](#createpaths-and-setcreate)).

```go
result, err := p.Set(data, "user.name", "NewName")
```

Supports setting values of various types:

```go
// String
result, _ := p.Set(data, "user.name", "CyberGo")

// Number
result, _ = p.Set(data, "user.age", 25)

// Boolean
result, _ = p.Set(data, "user.active", true)

// Object
result, _ = p.Set(data, "user.profile", map[string]any{
    "bio":      "Developer",
    "location": "China",
})

// Array
result, _ = p.Set(data, "items", []any{"a", "b", "c"})
```

**Full Example: Modifying a Nested Path**

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

    data := `{"user":{"name":"Alice","address":{"city":"Beijing"}}}`
    result, err := p.Set(data, "user.address.city", "Shanghai")
    if err != nil {
        panic(err)
    }
    fmt.Println(result)
    // Output: {"user":{"address":{"city":"Shanghai"},"name":"Alice"}}
}
```

## SetMultiple

Signature: `func (p *Processor) SetMultiple(jsonStr string, updates map[string]any, cfg ...Config) (string, error)`

Batch sets values at multiple paths and returns the modified JSON string. Compared to calling `Set` multiple times, `SetMultiple` parses the JSON only once and applies all updates in a single traversal, making it more efficient. Whether paths are created depends on `Config.CreatePaths`.

```go
result, err := p.SetMultiple(data, map[string]any{
    "user.name":   "CyberGo",
    "user.age":    25,
    "user.active": true,
})
```

**Full Example: Batch Updating Existing Fields**

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

    data := `{"user":{"name":"Alice","age":25,"email":"a@x.com"}}`
    result, err := p.SetMultiple(data, map[string]any{
        "user.name":  "Bob",
        "user.age":   26,
        "user.email": "b@x.com",
    })
    if err != nil {
        panic(err)
    }
    fmt.Println(result)
    // Output: {"user":{"age":26,"email":"b@x.com","name":"Bob"}}
}
```

## SetCreate

Signature: `func (p *Processor) SetCreate(jsonStr, path string, value any, cfg ...Config) (string, error)`

Sets a value and **automatically creates non-existent intermediate paths**. It is a convenience wrapper for `Set` + `CreatePaths=true`; it creates paths regardless of the processor's own configuration. See [CreatePaths and SetCreate](#createpaths-and-setcreate).

**Creating Intermediate Objects**

```go
// user.profile is automatically created as an object when it does not exist
result, err := p.SetCreate(data, "user.profile.bio", "Developer")
// {"user":{"profile":{"bio":"Developer"}}}
```

**Full Example: Automatically Creating Intermediate Objects and Arrays**

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

    data := `{"user":{"name":"Alice"}}`

    // Create a nested object: user.profile.bio
    result, err := p.SetCreate(data, "user.profile.bio", "Developer")
    if err != nil {
        panic(err)
    }
    fmt.Println(result)
    // Output: {"user":{"name":"Alice","profile":{"bio":"Developer"}}}

    // Create an array: user.tags[0] creates the array and fills index 0 when it does not exist
    result, err = p.SetCreate(data, "user.tags[0]", "admin")
    if err != nil {
        panic(err)
    }
    fmt.Println(result)
    // Output: {"user":{"name":"Alice","tags":["admin"]}}
}
```

## SetMultipleCreate

Signature: `func (p *Processor) SetMultipleCreate(jsonStr string, updates map[string]any, cfg ...Config) (string, error)`

Batch sets multiple values and automatically creates intermediate paths. It is a convenience wrapper for `SetMultiple` + `CreatePaths=true`.

```go
result, err := p.SetMultipleCreate(data, map[string]any{
    "user.profile.bio":      "Developer",
    "user.profile.location": "China",
})
```

**Full Example: Batch Creating a Nested Structure from an Empty Object**

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

    data := `{}`
    result, err := p.SetMultipleCreate(data, map[string]any{
        "user.name":        "Alice",
        "user.profile.bio": "Developer",
    })
    if err != nil {
        panic(err)
    }
    fmt.Println(result)
    // Output: {"user":{"name":"Alice","profile":{"bio":"Developer"}}}
}
```

## Appending Array Elements

Using the `[+]` syntax in a path appends an element to the end of an array, without needing to know the array length in advance. `[+]` must follow an existing array path (e.g. `items[+]`).

```go
data := `{"items":["a","b"]}`

// Append a single element
result, err := p.Set(data, "items[+]", "c")
// {"items":["a","b","c"]}

// Append multiple elements (a slice is expanded)
result, err = p.Set(data, "items[+]", []any{"c", "d"})
// {"items":["a","b","c","d"]}
```

**Full Example**

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

    data := `{"items":["a","b"]}`
    result, err := p.Set(data, "items[+]", "c")
    if err != nil {
        panic(err)
    }
    fmt.Println(result)
    // Output: {"items":["a","b","c"]}
}
```

## CreatePaths and SetCreate

There are two control entry points for automatic path creation. Understanding the difference helps you choose between "per-processor configuration" and "per-call enforcement":

| Approach | Behavior | Use case |
|----------|----------|----------|
| `Config.CreatePaths` (default `true`) | Processor-level switch; affects `Set` / `SetMultiple` | Build a **dedicated** processor that uniformly enables or disables path creation |
| `SetCreate` / `SetMultipleCreate` | Forces `CreatePaths=true`, **overriding** the processor configuration | Occasionally need to create paths without changing the processor configuration |

**Configuration precedence** (from highest to lowest):

1. **`SetCreate` / `SetMultipleCreate`** — always forces `CreatePaths=true`.
2. **per-call `cfg`** — explicitly passed `cfg` fully overrides the processor settings (including turning it off).
3. **processor `Config.CreatePaths`** — takes effect when `cfg` is omitted.

```go
// Build a processor with path creation disabled
cfg := json.DefaultConfig()
cfg.CreatePaths = false
p, _ := json.New(cfg)

// Set follows the processor configuration: errors when the path does not exist
_, err := p.Set(`{"user":{}}`, "user.profile.bio", "x") // err is non-nil

// SetCreate forces creation: regardless of the processor configuration
result, _ := p.SetCreate(`{"user":{}}`, "user.profile.bio", "x")
// {"user":{"profile":{"bio":"x"}}}

// per-call cfg overrides the processor settings (here re-enabling)
result, _ = p.Set(`{"user":{}}`, "user.profile.bio", "x", json.DefaultConfig())
// {"user":{"profile":{"bio":"x"}}}
```

## Chained Modifications

Modification methods return a new string; you can feed the previous step's result as input to the next step to achieve chained operations:

```go
processor, _ := json.New()

result1, _ := processor.Set(data, "user.name", "CyberGo")
result2, _ := processor.Set(result1, "user.version", "1.0.0")
finalResult, _ := processor.Delete(result2, "user.temporary")
```

## Processor Merge Methods

The Processor provides instance methods corresponding to the package-level [MergeJSON](../functions/modify#mergejson), [MergeMany](../functions/modify#mergemany), and [CompareJSON](../helpers#comparejson).

### Processor.MergeJSON

Signature: `func (p *Processor) MergeJSON(json1, json2 string, cfg ...Config) (string, error)`

Resolves options from `cfg` (**when `cfg` is omitted it uses `DefaultConfig`, not the processor's own configuration** — if the processor was created with a custom `MergeMode`, you must pass `cfg` explicitly to apply that mode), deeply merges the two objects according to `Config.MergeMode`, then re-encodes the result with this processor.

Like the package-level function, `Processor.MergeJSON` performs no security validation — it is a structural tool that only decodes, deep-merges, and re-encodes. When security validation is required, use `CompareJSON` (which always performs security validation; per `cfg` when passed, otherwise per the processor's own configuration).

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

// Union merge (default)
result, err := p.MergeJSON(base, override)

// Intersection merge
cfg := json.DefaultConfig()
cfg.MergeMode = json.MergeIntersection
result, err = p.MergeJSON(base, override, cfg)
```

### Processor.MergeMany

Signature: `func (p *Processor) MergeMany(jsons []string, cfg ...Config) (string, error)`

Folds the slice from left to right via `MergeJSON`; the merge strategy is determined by `Config.MergeMode` (default `MergeUnion`). Returns an error when fewer than 2 JSON strings are provided, and returns an error carrying the failing index if any merge step fails.

```go
result, err := p.MergeMany([]string{config1, config2, config3})
```

### Processor.CompareJSON

Signature: `func (p *Processor) CompareJSON(json1, json2 string, cfg ...Config) (bool, error)`

Compares two JSON strings for equality (number normalization, key-order independent).

::: warning Difference from package-level CompareJSON
The package-level `CompareJSON` performs no security validation when called without `cfg` and marshals both sides with `encoding/json`; the Processor method **always** performs security validation (per `cfg` when passed, otherwise per the processor's own configuration) and symmetrically marshals both sides with the library encoder, so configured encoding (such as `EscapeHTML`) applies symmetrically.
:::

```go
equal, err := p.CompareJSON(a, b)
equal, err = p.CompareJSON(a, b, json.SecurityConfig())
```

## See Also

- [Path Query](./query) - Get series methods
- [Delete Operations](./delete) - Delete/DeleteClean methods
- [Batch Operations](./batch) - ProcessBatch batch processing
- [Modify Functions](../functions/modify) - Package-level Set/SetMultiple/MergeJSON functions
