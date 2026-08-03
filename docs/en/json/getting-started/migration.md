---
title: "Migrating from stdlib - CyberGo JSON | encoding/json Guide"
description: "CyberGo JSON is 100% compatible with encoding/json — swap the import path, zero code changes. API mapping table, behavioral differences, and extra features."
sidebar_label: "Migrating from stdlib"
sidebar_position: 1.5
---

# Migrating from the Standard Library

`cybergodev/json` is **100% compatible** with the standard library `encoding/json` — simply replace the import path and your existing code compiles and runs without any changes. This page walks you through the migration and the additional capabilities you gain.

## Migration in Three Steps

1. **Install**:

   ```bash
   go get github.com/cybergodev/json
   ```

2. **Replace the import**: swap `"encoding/json"` for `"github.com/cybergodev/json"`.

   ```go
   // Before
   import "encoding/json"

   // After
   import "github.com/cybergodev/json"
   ```

3. **Done**: it compiles, and all your existing code works unchanged.

## Fully Compatible API

The table below maps `encoding/json` to `cybergodev/json`:

| encoding/json | cybergodev/json | Notes |
|---|---|---|
| `Marshal(v)` | `Marshal(v, cfg...)` | Compatible signature, optional cfg param |
| `Unmarshal(data, &v)` | `Unmarshal(data, &v, cfg...)` | Same as above |
| `MarshalIndent(v, prefix, indent)` | Same name | Fully compatible |
| `Compact(dst, src)` | Same name | Fully compatible |
| `Indent(dst, src, prefix, indent)` | Same name | Fully compatible |
| `HTMLEscape(dst, src)` | Same name | Fully compatible |
| `Valid(data)` | `Valid(data, cfg...)` | Compatible signature |
| `NewEncoder(w)` | `NewEncoder(w, cfg...)` | Compatible signature |
| `NewDecoder(r)` | `NewDecoder(r, cfg...)` | Compatible signature |
| `Number` | `Number` | Type compatible |
| `Delim` | `Delim` | Type compatible |
| `Token` | `Token` | Type compatible |

::: tip Optional cfg parameter
All extra `cfg ...Config` parameters are **optional** (variadic). When omitted, behavior is identical to the standard library; pass them only when you want to enable enhanced capabilities such as security mode or caching.
:::

## Code Example: Just Swap the Import

The example below shows the "swap the import only" effect — encoding, decoding, and struct tags work exactly as with `encoding/json`:

```go
package main

import (
    "fmt"

    "github.com/cybergodev/json"
)

func main() {
    type User struct {
        Name string   `json:"name"`
        Age  int      `json:"age"`
        Tags []string `json:"tags"`
    }

    // Encode — exactly the same as encoding/json
    user := User{Name: "Alice", Age: 30, Tags: []string{"go", "json"}}
    b, err := json.Marshal(user)
    if err != nil {
        panic(err)
    }
    fmt.Println(string(b))
    // Output: {"name":"Alice","age":30,"tags":["go","json"]}

    // Decode — exactly the same as encoding/json
    var u User
    if err := json.Unmarshal(b, &u); err != nil {
        panic(err)
    }
    fmt.Printf("%+v\n", u)
    // Output: {Name:Alice Age:30 Tags:[go json]}
}
```

## Additional Capabilities

After migrating, while keeping standard-library compatibility, you can opt into the following capabilities that the standard library does not offer:

| Capability | Example | Learn more |
|---|---|---|
| Path queries | `json.GetString(data, "user.name")` | [Path Expression Syntax](./path-syntax) |
| Get with default | `json.GetInt(data, "timeout", 30)` | [Query Functions](../api-reference/functions/query) |
| Generic get | `json.GetTyped[User](data, "user")` | [Generics](../api-reference/generics) |
| Path modification | `json.Set(data, "user.name", "Bob")` | [Modify Operations](../api-reference/functions/modify) |
| Schema validation | `json.ValidateSchema(data, schema)` | [Validator](../extensions/validator) |
| Streaming JSONL | `json.StreamLinesInto[T](r, fn)` | [JSONL Processing](../streaming/jsonl) |
| High-performance processor | `p, _ := json.New()` | [Processor Guide](./processor-guide) |

## Behavioral Differences

Under the **default configuration**, `cybergodev/json` behaves identically to `encoding/json`. All extra capabilities (security mode, path queries, schema validation, etc.) are **opt-in** — enabled explicitly via the `Config` parameter, with no impact on existing code.

In other words: migration is zero-cost, and you gain a superset of "standard library + additional capabilities".

## Next Steps

- [Quick Start](./) — Get going with core features in 5 minutes
- [Path Expression Syntax](./path-syntax) — Learn the path query syntax
- [Cheat Sheet](./cheatsheet) — Quick API reference
