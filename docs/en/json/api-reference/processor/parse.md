---
sidebar_label: "Parse & Validate"
title: "Processor Parse and Validate - CyberGo JSON | API Reference"
description: "CyberGo JSON Processor parse: Valid validation, Parse, ParseAny for any type, PreParse optimization, and GetFromParsed with configurable parsing."
sidebar_position: 6
---

# Parse and Validate Methods

The Processor provides JSON parsing and validity-checking methods. File I/O and streaming load are documented in [File I/O](./file-io).

## Validation Methods

### Valid

Signature: `func (p *Processor) Valid(jsonStr string, cfg ...Config) (bool, error)`

Validates whether a JSON string is valid. Returns `(true, nil)` when valid; returns `(false, error)` when invalid, with the error carrying the specific reason.

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

    cases := []string{
        `{"name":"CyberGo","age":25}`,
        `{"name":}`,
    }
    for _, c := range cases {
        valid, err := p.Valid(c)
        fmt.Printf("valid=%-5v has_error=%v\n", valid, err != nil)
    }
}
// Output:
// valid=true  has_error=false
// valid=false has_error=true
```

### ValidBytes

Signature: `func (p *Processor) ValidBytes(data []byte) bool`

Validates whether a byte slice is valid JSON, returning only a boolean (signature-compatible with `encoding/json.Valid`, suitable for quick checks where error details are not needed).

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

    fmt.Println(p.ValidBytes([]byte(`{"ok":true}`))) // true
    fmt.Println(p.ValidBytes([]byte(`{not json}`)))   // false
}
// Output:
// true
// false
```

## Parse Methods

### Parse

Signature: `func (p *Processor) Parse(jsonStr string, target any, cfg ...Config) error`

Parses a JSON string into the target variable; `target` must be a non-nil pointer. Supports parsing into `map[string]any`, structs, or `any`, and allows switching number preservation mode via `Config`.

```go
package main

import (
    "fmt"
    "github.com/cybergodev/json"
)

type User struct {
    Name string `json:"name"`
    Age  int    `json:"age"`
}

func main() {
    p, err := json.New(json.DefaultConfig())
    if err != nil {
        panic(err)
    }
    defer p.Close()

    data := `{"name":"CyberGo","age":25}`

    // Parse into map[string]any (numbers default to float64)
    var obj map[string]any
    if err := p.Parse(data, &obj); err != nil {
        panic(err)
    }
    fmt.Printf("map: name=%v age=%T(%v)\n", obj["name"], obj["age"], obj["age"])

    // Parse into struct
    var u User
    if err := p.Parse(data, &u); err != nil {
        panic(err)
    }
    fmt.Printf("struct: %+v\n", u)
}
// Output:
// map: name=CyberGo age=float64(25)
// struct: {Name:CyberGo Age:25}
```

### ParseAny

Signature: `func (p *Processor) ParseAny(jsonStr string, cfg ...Config) (any, error)`

Parses a JSON string and returns the root value directly as `any`, without pre-declaring the target type. Internally equivalent to `Parse(jsonStr, &v)`.

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

    data, err := p.ParseAny(`{"name":"CyberGo","age":25}`)
    if err != nil {
        panic(err)
    }
    obj := data.(map[string]any)
    fmt.Printf("name=%v age=%v\n", obj["name"], obj["age"])
}
// Output:
// name=CyberGo age=25
```

### PreserveNumbers Mode

By default (`PreserveNumbers=false`), all JSON numbers are parsed as `float64`, which loses precision for large integers and changes the decimal representation. When `PreserveNumbers=true` is enabled, numbers are preserved as `json.Number` (backed by the original string), fully retaining the original format and precision — suitable for monetary amounts, large integers, scientific notation, and similar scenarios. The example below uses `%T` to directly illustrate the Go type difference of numbers in the two modes:

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

    data := `{"id":42,"price":19.99}`

    // Default mode: all numbers parsed as float64
    var def any
    if err := p.Parse(data, &def); err != nil {
        panic(err)
    }
    defM := def.(map[string]any)
    fmt.Printf("Default : id type=%T value=%v\n", defM["id"], defM["id"])

    // PreserveNumbers mode: numbers preserved as json.Number
    cfg := json.DefaultConfig()
    cfg.PreserveNumbers = true
    var preserved any
    if err := p.Parse(data, &preserved, cfg); err != nil {
        panic(err)
    }
    preM := preserved.(map[string]any)
    fmt.Printf("Preserve: id type=%T value=%v\n", preM["id"], preM["id"])
}
// Output:
// Default : id type=float64 value=42
// Preserve: id type=json.Number value=42
```

::: tip When to enable
It is recommended to enable `PreserveNumbers` when handling financial amounts, integers beyond the exact representation range of `float64` (approximately ±2^53, i.e. 9007199254740992), or when you need to round-trip numbers verbatim (avoiding conversion between `19.99` and `19.990000`). For example, `9007199254740993` (2^53+1) is rounded to `9007199254740992` in default mode, but stays unchanged in `json.Number` mode. Note that `json.Number` requires explicit extraction via `.Int64()` / `.Float64()` / `.String()`.
:::

## Pre-parse Optimization (PreParse)

When you need to run multiple path queries on **the same JSON**, calling [`Get`](./query) repeatedly re-parses the entire document each time. `PreParse` parses only once; subsequent `GetFromParsed` calls navigate directly on the already-parsed data structure, eliminating the repeated parsing overhead.

### PreParse

Signature: `func (p *Processor) PreParse(jsonStr string, cfg ...Config) (*ParsedJSON, error)`

Pre-parses the JSON and returns a reusable `*ParsedJSON`. Call `parsed.Release()` when done to release the reference to the processor.

### GetFromParsed

Signature: `func (p *Processor) GetFromParsed(parsed *ParsedJSON, path string, cfg ...Config) (any, error)`

Retrieves a value by path from the pre-parsed data, skipping JSON parsing and performing path navigation directly.

### Full Comparison Example

The example below compares "multiple package-level `Get` calls (re-parsing each time)" with "`PreParse` + `GetFromParsed` (parsing only once)". Both produce the same result, but the latter is significantly faster when there are many queries or the document is large:

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

    data := `{"user":{"name":"CyberGo","age":25},"meta":{"version":2,"env":"prod"}}`

    // Option 1: each package-level Get re-parses the JSON
    name1, err := json.Get(data, "user.name")
    if err != nil {
        panic(err)
    }
    age1, err := json.Get(data, "user.age")
    if err != nil {
        panic(err)
    }
    ver1, err := json.Get(data, "meta.version")
    if err != nil {
        panic(err)
    }

    // Option 2: PreParse parses once, GetFromParsed reuses the parsed result (recommended for multiple queries)
    parsed, err := p.PreParse(data)
    if err != nil {
        panic(err)
    }
    defer parsed.Release()

    name2, err := p.GetFromParsed(parsed, "user.name")
    if err != nil {
        panic(err)
    }
    age2, err := p.GetFromParsed(parsed, "user.age")
    if err != nil {
        panic(err)
    }
    ver2, err := p.GetFromParsed(parsed, "meta.version")
    if err != nil {
        panic(err)
    }

    fmt.Println("Get     :", name1, age1, ver1)
    fmt.Println("PreParse:", name2, age2, ver2)
}
// Output:
// Get     : CyberGo 25 2
// PreParse: CyberGo 25 2
```

### SetFromParsed

Signature: `func (p *Processor) SetFromParsed(parsed *ParsedJSON, path string, value any, cfg ...Config) (*ParsedJSON, error)`

Sets a value on the pre-parsed data and returns a **new** `*ParsedJSON` (internally deep-copied; the original data remains unchanged). You can continue running `GetFromParsed` queries on the new result.

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

    parsed, err := p.PreParse(`{"user":{"name":"CyberGo","age":25}}`)
    if err != nil {
        panic(err)
    }
    defer parsed.Release()

    // SetFromParsed returns a new ParsedJSON; the original data remains unchanged
    modified, err := p.SetFromParsed(parsed, "user.name", "Bob")
    if err != nil {
        panic(err)
    }
    defer modified.Release()

    oldName, _ := p.GetFromParsed(parsed, "user.name")
    newName, _ := p.GetFromParsed(modified, "user.name")
    ageAfter, _ := p.GetFromParsed(modified, "user.age")
    fmt.Println("Original name:", oldName)
    fmt.Println("Modified name:", newName)
    fmt.Println("Modified age :", ageAfter)
}
// Output:
// Original name: CyberGo
// Modified name: Bob
// Modified age : 25
```

### ParsedJSON Type

`ParsedJSON` wraps the parsed data and cache information; its fields are unexported, exposing only two methods:

| Method | Description |
|--------|-------------|
| `Data() any` | Returns the underlying parsed data (usually `map[string]any` or `[]any`) |
| `Release()` | Releases the reference to the processor; after calling, `Data()` returns `nil`. Should be used with `defer` |

## Method Selection Guide

| Scenario | Recommended method | Input | Output |
|----------|--------------------|-------|--------|
| Only check validity (no error details needed) | `ValidBytes` | `[]byte` | `bool` |
| Check validity and get the failure reason | `Valid` | `string` | `(bool, error)` |
| Parse into a struct / concrete type | `Parse` | `string` | Writes to `target` pointer |
| Parse into `any` (no pre-declared type needed) | `ParseAny` | `string` | `any` |
| `encoding/json`-compatible (`[]byte` input) | [`Unmarshal`](./output#unmarshal) | `[]byte` | Writes to `target` pointer |
| Multiple path queries on the same JSON | `PreParse` + `GetFromParsed` | `string` | `*ParsedJSON` / `any` |
| Modify parsed data then continue querying | `PreParse` + `SetFromParsed` + `GetFromParsed` | `string` | `*ParsedJSON` |
| Preserve original number precision | Any of the above parse methods + `Config{PreserveNumbers: true}` | — | Numbers as `json.Number` |

::: tip Parse vs ParseAny vs Unmarshal
- **`Unmarshal(data, &v)`**: fully compatible with the standard library `encoding/json`; input is `[]byte`. Suitable for directly replacing the standard library or handling network/file byte streams.
- **`Parse(jsonStr, &v)`**: input is `string`; semantically identical to `Unmarshal`, but natively supports `Config` (security limits, `PreserveNumbers`, etc.). It is the preferred choice for everyday parsing.
- **`ParseAny(jsonStr)`**: no need to pre-declare the target type; returns `any` directly. Suitable for scenarios with unknown structure or one-off value extraction.

The underlying parsing capability of all three is equivalent; the differences lie only in the input type and whether a target variable must be prepared in advance.
:::

## See Also

- [File I/O](./file-io) - LoadFromFile/SaveToFile and other file methods
- [Output Methods](./output) - Encode/EncodePretty/Unmarshal encoding methods
- [Path Query](./query) - Get series methods
- [Package-level Parse Functions](../functions/parse) - Parse/ParseAny/Valid without a Processor
