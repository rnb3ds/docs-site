---
title: "Delete Functions - CyberGo JSON | API Reference"
description: "CyberGo JSON delete functions: Delete removes nodes, DeleteClean removes and cleans empty parent nodes, supporting path expressions and auto cleanup."
sidebar_label: "Delete Operations"
sidebar_position: 4
---

# Delete Functions

The json package provides JSON deletion functions to remove nodes at specified paths, with optional cleanup of empty parent nodes resulting from deletion. All delete functions are **immutable** — they return a new modified JSON string while the original string remains unchanged; on error they return the original input.

## Delete

Signature: `func Delete(jsonStr, path string, cfg ...Config) (string, error)`

Deletes the value at the specified path and returns the modified JSON string.

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `jsonStr` | `string` | Yes | JSON string |
| `path` | `string` | Yes | Path expression (dot notation, index, wildcard, slice, multi-field) |
| `cfg` | `Config` | No | Optional configuration (affects cleanup and validation behavior) |

**Returns**

| Return value | Description |
|--------------|-------------|
| `result string` | The modified JSON string (on success); the original `jsonStr` on error |
| `err error` | `nil` on success; a `*JsonsError` wrapping an underlying sentinel error on failure |

### Delete Object Properties

Delete a single nested property, returning a new object without that key.

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"user":{"name":"Alice","temp":"value","age":30}}`

	result, err := json.Delete(data, "user.temp")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// Output: {"user":{"age":30,"name":"Alice"}}
}
```

### Delete Array Elements

Delete an element from an array (0-based index). The element is **removed** (not set to null); subsequent elements shift forward and indices are reordered, leaving no gaps.

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"items":["a","b","c","d"]}`

	// Delete the element "b" at index 1; "c"/"d" shift forward
	result, err := json.Delete(data, "items[1]")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// Output: {"items":["a","c","d"]}
}
```

Negative indices are supported (counting from the end, `-1` is the last element):

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"items":["a","b","c","d"]}`

	// -1 points to the last element "d"
	result, err := json.Delete(data, "items[-1]")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// Output: {"items":["a","b","c"]}
}
```

### Nested Path Deletion

Use dot-notation paths to reach into nested structures and delete nodes at any level.

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"config":{"database":{"host":"localhost","port":5432,"password":"secret"}}}`

	result, err := json.Delete(data, "config.database.password")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// Output: {"config":{"database":{"host":"localhost","port":5432}}}
}
```

### Immutable Semantics

`Delete` returns a new string; **the original `jsonStr` is not modified**. You can safely reuse the same input in multiple places:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"a":1,"b":2,"c":3}`

	r1, _ := json.Delete(data, "a")
	r2, _ := json.Delete(data, "b")

	fmt.Println(data) // Original data unchanged: {"a":1,"b":2,"c":3}
	fmt.Println(r1)   // Output: {"b":2,"c":3}
	fmt.Println(r2)   // Output: {"a":1,"c":3}
}
```

## Advanced Path Deletion

`Delete` reuses the same recursive path engine as Get/Set, supporting batch semantics such as wildcards, slice ranges, and multi-field extraction. **Batch paths (containing `*`, `{}`, `:`) use a fault-tolerant strategy for missing targets — they delete what matches and silently skip what is missing, returning no error**.

### Wildcard Deletion

`items[*]` deletes all elements of an array; `[*].field` deletes the specified property from each element.

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"users":[{"name":"Alice","temp":"x"},{"name":"Bob","temp":"y"}]}`

	// Delete the temp property from each user object
	result, err := json.Delete(data, "users[*].temp")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// Output: {"users":[{"name":"Alice"},{"name":"Bob"}]}
}
```

No error is returned when some elements lack the target property (idempotent semantics, consistent with Go's native `delete()` behavior on absent keys):

<!-- check-code: skip -->
```go
// data = `[{"a":1},{"b":2}]` — the second element has no "a", still returns normally
result, err := json.Delete(data, "[*].a")
// err == nil, result: [{"b":2}]
```

### Slice Range Deletion

`items[0:2]` deletes a contiguous range of elements (half-open interval, left-closed right-open).

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"items":["a","b","c","d","e"]}`

	// Delete "a" and "b" at indices 0 and 1 (excluding 2)
	result, err := json.Delete(data, "items[0:2]")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// Output: {"items":["c","d","e"]}
}
```

### Multi-Field Extraction Deletion

`[*].{a,b}` deletes multiple specified properties from each element at once.

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `[{"name":"Alice","pwd":"x","token":"y"},{"name":"Bob","pwd":"z"}]`

	// Delete both pwd and token fields at once
	result, err := json.Delete(data, "[*].{pwd,token}")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// Output: [{"name":"Alice"},{"name":"Bob"}]
}
```

::: tip Exact Path vs Batch Path
- **Exact path** (only property names/indices, e.g. `user.temp`, `items[1]`): returns an `ErrPathNotFound` error when the target does not exist.
- **Batch path** (contains `*`, `{}`, `:`, e.g. `items[*]`, `[*].{a,b}`, `items[0:2]`): silently skips missing targets without error. Use exact paths when strict validation is needed; use batch paths when "best-effort deletion" is desired.
:::

## Error Handling

When the target of an exact path does not exist, `Delete` returns a `*JsonsError` wrapping `ErrPathNotFound`, and the returned input is unchanged. Use `errors.Is` to check the specific error type:

```go
package main

import (
	"errors"
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"a":1}`

	result, err := json.Delete(data, "nonexistent.path")
	if err != nil {
		if errors.Is(err, json.ErrPathNotFound) {
			fmt.Println("Path not found, skipped")
		} else {
			fmt.Println("Other error:", err)
		}
	}
	// result is still the original JSON: {"a":1}
	fmt.Println(result)
	// Output:
	// Path not found, skipped
	// {"a":1}
}
```

Common delete error sentinels:

| Error | Trigger condition |
|-------|-------------------|
| `ErrPathNotFound` | An intermediate segment or the target key/index of an exact path does not exist |
| `ErrInvalidJSON` | `jsonStr` is not valid JSON |
| `ErrInvalidPath` | The path expression has invalid syntax (e.g. unclosed brackets) |

## DeleteClean

Signature: `func DeleteClean(jsonStr, path string, cfg ...Config) (string, error)`

Deletes the specified path and **recursively cleans up** `null` values and empty objects/empty arrays resulting from the deletion. Equivalent to `Delete(jsonStr, path, cfg)` with `CleanupNulls: true` + `CompactArrays: true` forcibly enabled.

### Cascade Cleanup Example

When the parent object becomes empty after deletion, `DeleteClean` continues to remove the empty parent object, cascading upward level by level:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	// temp is the only property of user
	data := `{"user":{"temp":"value"}}`

	// Plain delete: user becomes an empty object {}, but is retained
	r1, _ := json.Delete(data, "user.temp")
	fmt.Println(r1) // Output: {"user":{}}

	// DeleteClean: after user becomes empty, the user key is cleaned up too
	r2, err := json.DeleteClean(data, "user.temp")
	if err != nil {
		panic(err)
	}
	fmt.Println(r2) // Output: {}
}
```

### Cleaning Temporary Fields in API Responses

`DeleteClean` is well suited for cleaning API responses: while removing the target field, it also sweeps other `null` values and residual empty containers, avoiding exposing "empty shell" objects to the frontend.

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	apiResp := `{"data":{"id":1,"name":"Product","desc":null,"price":29.99,"note":null}}`

	// A single DeleteClean removes desc and sweeps other nulls (note) in the tree
	cleaned, err := json.DeleteClean(apiResp, "data.desc")
	if err != nil {
		panic(err)
	}
	fmt.Println(cleaned)
	// Output: {"data":{"id":1,"name":"Product","price":29.99}}
}
```

::: warning DeleteClean sweeps nulls across the entire tree
`DeleteClean` cleanup is **global**: it recursively runs `CleanupNullValues` across the entire JSON tree, so it removes **all** pre-existing `null` values and empty containers in the document, not just the one produced at the deletion point. If you only want to remove a specific field and keep other `null`s, use plain `Delete`.
:::

## Relationship Between DeleteClean and Config

`DeleteClean` is essentially syntactic sugar for `Delete` + two config options. You can also explicitly pass the same configuration to plain `Delete` for a fully equivalent result:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"user":{"temp":"value"}}`

	// Option 1: DeleteClean
	r1, _ := json.DeleteClean(data, "user.temp")

	// Option 2: Delete + explicit configuration (fully equivalent)
	cfg := json.DefaultConfig()
	cfg.CleanupNulls = true
	cfg.CompactArrays = true
	r2, _ := json.Delete(data, "user.temp", cfg)

	fmt.Println(r1) // Output: {}
	fmt.Println(r2) // Output: {}
}
```

`Config` fields that affect deletion behavior:

| Field | Default | Effect on deletion |
|-------|---------|--------------------|
| `CleanupNulls` | `false` | Recursively removes `null` values and empty objects/empty arrays from the result (cascade cleanup) |
| `CompactArrays` | `false` | Removes `null`/empty elements from arrays; enabling implies `CleanupNulls` |
| `CreatePaths` | `true` | **Does not affect deletion** (deletion never creates paths; listed here for comparison) |

## Delete vs DeleteClean Comparison

| Feature | Delete | DeleteClean |
|---------|--------|-------------|
| Deletes the target node | Yes | Yes |
| Array elements removed and reordered (no gaps) | Yes | Yes |
| Errors on missing exact path | Yes (`ErrPathNotFound`) | Yes (`ErrPathNotFound`) |
| Cleans `null` produced by deletion | No | Yes |
| Cleans empty objects/empty arrays (cascade) | No | Yes (upward level by level) |
| Sweeps pre-existing `null` across the tree | No | Yes (global cleanup) |
| Equivalent configuration | Default | `CleanupNulls+CompactArrays` |
| Relative overhead | Lower | Slightly higher (one extra full-tree cleanup traversal) |

## Common Pitfalls

::: warning Array deletion leaves no gaps
When `Delete` removes an array element, the element is **entirely removed** and subsequent elements shift forward automatically, leaving no `null` placeholder or gap. If you expect indices to remain unchanged after deletion (leaving holes), CyberGo's deletion semantics do not meet that need — use `Set` to set that position to `null` instead.
:::

::: warning DeleteClean may remove legitimately empty data
`DeleteClean` cascade cleanup treats all empty objects `{}` and empty arrays `[]` as things to clean up. If your business semantics treat "empty array" or "empty object" as a meaningful state (e.g. `"tags":[]` means "no tags" rather than "field missing"), `DeleteClean` will remove them along with their keys. Use plain `Delete` when you need to keep such fields.
:::

::: warning Batch deletion is fault-tolerant
Wildcard/slice/multi-field paths **silently skip** missing targets without returning an error. If you depend on "target must exist" strict validation semantics, use an exact path instead (e.g. `items[1]` rather than `items[*]`).
:::

## Batch Deletion of Multiple Fields

When you need to delete multiple unrelated fields at once, loop over plain `Delete` (basing each call on the previous result):

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"user":{"id":1,"name":"Alice","password":"secret","ssn":"123-45-6789"}}`

	sensitive := []string{"user.password", "user.ssn"}
	result := data
	for _, field := range sensitive {
		var err error
		result, err = json.Delete(result, field)
		if err != nil {
			fmt.Printf("Failed to delete %s: %v\n", field, err)
		}
	}
	fmt.Println(result)
	// Output: {"user":{"id":1,"name":"Alice"}}
}
```

## See Also

- [Modify Operations](./modify) - Set, merge and other modify functions
- [Query & Get Functions](./query) - Get, GetString and other query operations
- [Processor Delete Methods](../processor/delete) - Instance method versions, supporting chaining
- [Config Reference](../config) - Details on CleanupNulls / CompactArrays and other fields
