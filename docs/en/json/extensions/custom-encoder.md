---
sidebar_label: "Custom Encoder"
title: "CustomEncoder - CyberGo JSON | Custom Encoder"
description: "CyberGo JSON custom encoders: MarshalJSON, TextMarshaler, time.Time handling, and CustomEscapes for registering JSON serialization logic for custom Go types."
sidebar_position: 3
---

# Custom Encoding

The json library is encoding-compatible with the standard library `encoding/json`, so the JSON form of a custom type is primarily achieved by implementing standard library interfaces. This page covers the encoding extension points that are **effective in the current version**:

- [`json.Marshaler`](#json-marshaler-interface) — a type customizes its own JSON encoding
- [`encoding.TextMarshaler`](#encoding-textmarshaler-interface) — a type customizes its text encoding (output as a JSON string)
- [`time.Time`](#built-in-handling-of-time-time) — the library's built-in RFC3339Nano time format
- [`Config.CustomEscapes`](#custom-character-escaping-customescapes) — custom character escape mapping

::: tip Interfaces first
For "how a certain type should be encoded" needs, prefer implementing `MarshalJSON` or `MarshalText`; such implementations can be shared by this library, the standard library `encoding/json`, and any compatible library, offering the best portability.
:::

## json.Marshaler Interface

Types that implement `MarshalJSON() ([]byte, error)` can fully control their own JSON representation. The library calls this method first when encoding (both value receivers and pointer receivers are supported), consistent with the standard library `encoding/json` behavior.

Interface signature (compatible with `encoding/json.Marshaler`):

```go
type Marshaler interface {
    MarshalJSON() ([]byte, error)
}
```

Below we define a `Hex` type that encodes a `uint64` as a hexadecimal string with a `0x` prefix:

```go
package main

import (
	"fmt"
	"strconv"

	"github.com/cybergodev/json"
)

// Hex wraps a uint64 as a hexadecimal-represented type.
type Hex uint64

// MarshalJSON implements json.Marshaler, encoding the value as a "0x.." string.
func (h Hex) MarshalJSON() ([]byte, error) {
	return []byte(`"0x` + strconv.FormatUint(uint64(h), 16) + `"`), nil
}

func main() {
	type Device struct {
		ID    Hex    `json:"id"`
		Label string `json:"label"`
	}
	d := Device{ID: Hex(255), Label: "sensor-1"}

	out, err := json.Marshal(d)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(out))
	// Output: {"id":"0xff","label":"sensor-1"}
}
```

::: warning Avoid infinite recursion
When you need "regular encoding" assistance inside `MarshalJSON`, use the standard library `stdjson.Marshal` or call this library on a **different concrete type**. Calling `Marshal` again on the same type will re-enter `MarshalJSON`, forming infinite recursion.
:::

## encoding.TextMarshaler Interface

Types that do not implement `MarshalJSON` but implement `MarshalText() ([]byte, error)` are encoded as a JSON string whose value is the text content (quotes and escaping are added automatically). Suitable for types whose form can be fully expressed as text.

Interface signature (compatible with `encoding.TextMarshaler`):

```go
type TextMarshaler interface {
    MarshalText() ([]byte, error)
}
```

Below we define a `Slug` type that is automatically normalized to lowercase-hyphen form when encoded:

```go
package main

import (
	"fmt"
	"strings"

	"github.com/cybergodev/json"
)

// Slug represents a URL-friendly short text.
type Slug string

// MarshalText implements encoding.TextMarshaler, outputting normalized text.
func (s Slug) MarshalText() ([]byte, error) {
	return []byte(strings.ToLower(strings.ReplaceAll(string(s), " ", "-"))), nil
}

func main() {
	type Article struct {
		Title string `json:"title"`
		Slug  Slug   `json:"slug"`
	}
	a := Article{Title: "Hello World", Slug: Slug("Hello World")}

	out, err := json.Marshal(a)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(out))
	// Output: {"title":"Hello World","slug":"hello-world"}
}
```

::: tip Priority of the two interfaces
If the same type implements both interfaces, `MarshalJSON` takes precedence over `MarshalText`. If you want to encode a type as a JSON string, implementing `MarshalText` is usually simpler (no need to handle quotes and escaping yourself).
:::

## Built-in Handling of time.Time

The library has built-in handling for `time.Time`, uniformly outputting the RFC3339Nano format (preserving sub-second precision, consistent with the standard library `encoding/json`). No configuration is needed:

```go
package main

import (
	"fmt"
	"time"

	"github.com/cybergodev/json"
)

func main() {
	type Event struct {
		Name string    `json:"name"`
		At   time.Time `json:"at"`
	}
	t := time.Date(2026, 1, 15, 10, 30, 0, 0, time.UTC)
	e := Event{Name: "deploy", At: t}

	out, err := json.Marshal(e)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(out))
	// Output: {"name":"deploy","at":"2026-01-15T10:30:00Z"}
}
```

If you need a different time format, implement `MarshalJSON` for that type (see [above](#json-marshaler-interface)) to override the built-in behavior — a custom type's `MarshalJSON` always takes precedence over the default handling of `time.Time`.

## Custom Character Escaping: CustomEscapes

`Config.CustomEscapes` is a `map[rune]string` used to **globally override** how certain characters are escaped. When encoding a string, the library first consults this mapping: on a match it writes the corresponding string verbatim (you must ensure it is JSON-valid); on no match it falls back to the default escaping.

Below we rewrite the copyright symbol `©` to ASCII text (matched entries are written verbatim; all other characters use the default handling):

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	cfg := json.DefaultConfig()
	// © is output verbatim by default; here we rewrite it to ASCII text
	cfg.CustomEscapes = map[rune]string{
		'©': "(c)",
	}

	out, err := json.EncodeWithConfig(map[string]string{"note": "Copyright © 2026"}, cfg)
	if err != nil {
		panic(err)
	}
	fmt.Println(out)
	// Output: {"note":"Copyright (c) 2026"}
}
```

::: warning Custom escape strings must be JSON-valid
`CustomEscapes` values are **written verbatim** to the output without a second pass, so be careful about string escaping in your Go source code: if you want a literal backslash escape sequence in the output, write a double backslash `\\` in Go source (a single backslash is treated as an escape by Go, yielding the character itself rather than the escape sequence).
:::

::: tip When the custom escape path is triggered
Setting `CustomEscapes` (non-nil) activates the custom encoding path. This path also reads the `EscapeHTML`, `EscapeUnicode`, `EscapeSlash`, `EscapeNewlines`, `EscapeTabs`, `SortKeys`, `FloatPrecision`, `IncludeNulls` fields (see [Configuration Options](../api-reference/config)).
:::

## How to Choose an Extension Point

| Need | Approach |
|------|----------|
| A type customizes its JSON form | Implement `MarshalJSON()` |
| A type is encoded as a JSON string (text representation) | Implement `MarshalText()` |
| Globally change how certain characters are escaped | `Config.CustomEscapes` |
| Control indentation, HTML escaping, Unicode escaping, key sorting, float precision, etc. | The `Pretty`/`EscapeHTML`/`EscapeUnicode`/`SortKeys`/`FloatPrecision` fields of `Config` (see [Configuration Options](../api-reference/config)) |
| Override the default time format of `time.Time` | Implement `MarshalJSON()` for a custom time type |

## Encoding-Related Fields Effective in Config

| Field | Type | Description |
|-------|------|-------------|
| `CustomEscapes` | `map[rune]string` | Custom character escape mapping (matched entries are written verbatim) |
| `EscapeHTML` | `bool` | Whether to escape `<` `>` `&` (default `true`) |
| `EscapeUnicode` | `bool` | Whether to escape characters `>0x7F` as `\uXXXX` |
| `EscapeSlash` | `bool` | Whether to escape `/` |
| `EscapeNewlines` / `EscapeTabs` | `bool` | Whether to escape newlines/tabs |
| `SortKeys` | `bool` | Whether to sort object keys (object keys are sorted by default) |
| `FloatPrecision` | `int` | Float precision (`-1` for default) |
| `IncludeNulls` | `bool` | Whether to include null-valued fields |

## Unconnected Extension Fields (Reserved)

::: warning Unconnected Extension Fields
`Config.CustomEncoder` (the `CustomEncoder` interface) and `Config.CustomTypeEncoders` (the `TypeEncoder` interface) are **declared in the current version and participate in configuration cloning and cache key computation, but are not yet wired into the encoding pipeline**. Setting these two fields **will not change the encoding output**. They are extension points reserved for future versions; in the meantime, use the already-effective mechanisms above (`MarshalJSON` / `MarshalText` / `CustomEscapes`).

```go
// Current version: the following two fields are declared but not wired; setting them has no effect (reserved interfaces)
type CustomEncoder interface {
    Encode(value any) (string, error)
}

type TypeEncoder interface {
    Encode(v reflect.Value) (string, error)
}
```
:::

## See Also

- [Interface Definitions](../api-reference/interfaces) - `Marshaler` / `TextMarshaler` / `CustomEncoder` / `TypeEncoder` interfaces
- [Configuration Options](../api-reference/config) - Encoding-related configuration fields
- [Hooks](./hooks) - Pre/post-operation interception (including available validation hooks)
