---
sidebar_label: "Validator"
title: "Validator - CyberGo JSON | Schema Validator"
description: "CyberGo JSON validator: Validator interface, Schema structure, ValidationError, SchemaConfig options, providing complete JSON data validation capabilities."
sidebar_position: 2
---

# Schema Validation

The json library provides JSON Schema-based data validation: define a `Schema` describing the structure and constraints the data must satisfy, then use `ValidateSchema` to validate a piece of JSON. This is the **fully-featured** validation system in the current version.

## ValidateSchema Function

`ValidateSchema` validates a JSON string against a `Schema` and returns a list of all constraint violations:

```go
// Package-level function
func ValidateSchema(jsonStr string, schema *Schema, cfg ...Config) ([]ValidationError, error)

// Processor method
func (p *Processor) ValidateSchema(jsonStr string, schema *Schema, cfg ...Config) ([]ValidationError, error)
```

Return value semantics:

| Return value | Meaning |
|--------------|---------|
| `([]ValidationError{}, nil)` | The JSON is valid and **satisfies all constraints** |
| `([]ValidationError{...}, nil)` | The JSON is parseable, but has constraint violations (slice is non-empty) |
| `(nil, error)` | Parse or pre-check failure (e.g. invalid JSON, `schema` is nil, limit exceeded) |

::: tip Key distinction
Constraint violations are expressed via **the returned slice** (`error` remains `nil`); only parse failures, a nil `schema`, size limit exceeded, and similar situations return a non-nil `error`. Therefore, checking "whether validation passed" should look at `len(errs) == 0`, not `err != nil`.
:::

## Basic Example: Object Structure and Required Fields

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	schema := &json.Schema{
		Type:     "object",
		Required: []string{"name", "email"},
		Properties: map[string]*json.Schema{
			"name":  {Type: "string"},
			"email": {Type: "string", Format: "email"},
			"age":   {Type: "number"},
		},
	}

	// Missing the required field email
	data := `{"name":"Alice","age":30}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// Output: email: required property 'email' is missing
}
```

## Schema Constraint Field Overview

The constraint fields supported by `Schema` (grouped by category):

| Category | Field | Applicable types | Description |
|----------|-------|------------------|-------------|
| Structure | `Type` | All | Values listed below |
| Structure | `Required` | object | List of property names that must be present |
| Structure | `Properties` | object | Sub-schema for each property |
| Structure | `Items` | array | Sub-schema for elements |
| Structure | `AdditionalProperties` | object | `true` allows extra properties, `false` rejects them |
| String | `MinLength` / `MaxLength` | string | Length range (counted by rune) |
| String | `Pattern` | string | Regular expression |
| String | `Format` | string | Semantic format (see [Format value table](#supported-format-values)) |
| Number | `Minimum` / `Maximum` | number | Value range |
| Number | `ExclusiveMinimum` / `ExclusiveMaximum` | number | Exclude boundary value |
| Number | `MultipleOf` | number | Must be a multiple of this value |
| Array | `MinItems` / `MaxItems` | array | Element count range |
| Array | `UniqueItems` | array | `true` requires unique elements |
| Value | `Enum` | All | List of allowed enum values |
| Value | `Const` | All | Must equal this fixed value |

Supported values for `Type`: `object`, `array`, `string`, `number`, `boolean`, `null`.

::: warning Use "number" for numeric types
After JSON parsing, all numbers (including integers) are `float64`, so numeric fields should use `Type: "number"`. Numeric constraints such as `MultipleOf` also only take effect when `Type` is `number`.
:::

## Object Constraints: Required / Properties / AdditionalProperties

`AdditionalProperties` controls whether properties not declared in `Properties` are allowed. When constructing a `Schema` directly with a struct literal, this field defaults to `false` (rejects extra properties):

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	schema := &json.Schema{
		Type:     "object",
		Required: []string{"name"},
		Properties: map[string]*json.Schema{
			"name":  {Type: "string"},
			"email": {Type: "string"},
		},
		// AdditionalProperties not set; struct literal defaults to false -> rejects extra properties
	}

	// "extra" is not declared in Properties
	data := `{"name":"Alice","extra":"x"}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// Output: extra: additional property 'extra' is not allowed
}
```

::: tip Allowing extra properties
To allow extra properties, set `AdditionalProperties` to `true`, or construct with [`DefaultSchema()`](#ways-to-create-a-schema) (whose default `AdditionalProperties` is `true`).
:::

## String Constraints: MinLength / MaxLength / Pattern / Format

Constraints such as `MinLength`, `MaxLength`, `Minimum`, `Maximum`, `MinItems`, `MaxItems` **only take effect when created via `NewSchemaWithConfig`** (for the reason, see [Ways to Create](#ways-to-create-a-schema)). Below we set lengths via `SchemaConfig` pointer fields and restrict to lowercase letters with `Pattern`:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	nameCfg := json.DefaultSchemaConfig()
	nameCfg.Type = "string"
	minLen, maxLen := 3, 10
	nameCfg.MinLength = &minLen
	nameCfg.MaxLength = &maxLen
	nameCfg.Pattern = `^[a-z]+$`
	nameSchema := json.NewSchemaWithConfig(nameCfg)

	schema := &json.Schema{
		Type:     "object",
		Required: []string{"name"},
		Properties: map[string]*json.Schema{
			"name": nameSchema,
		},
	}

	// "AB": too short and contains uppercase letters
	data := `{"name":"AB"}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// Output:
	// name: string length 2 is less than minimum 3
	// name: string 'AB' does not match pattern '^[a-z]+$'
}
```

`Pattern` is lazily compiled and cached on first validation; the same `*Schema` can be safely used for concurrent validation. If the regex itself is invalid, the compilation error is reported on every validation.

## Number Constraints: Minimum / Maximum / MultipleOf

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	ageCfg := json.DefaultSchemaConfig()
	ageCfg.Type = "number"
	minVal, maxVal := 0.0, 120.0
	ageCfg.Minimum = &minVal
	ageCfg.Maximum = &maxVal
	mult := 5.0
	ageCfg.MultipleOf = &mult
	ageSchema := json.NewSchemaWithConfig(ageCfg)

	schema := &json.Schema{
		Type: "object",
		Properties: map[string]*json.Schema{
			"age": ageSchema,
		},
	}

	// 148: exceeds the maximum of 120, and is not a multiple of 5
	data := `{"age":148}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// Output:
	// age: number 148 exceeds maximum 120
	// age: number 148 is not a multiple of 5
}
```

`ExclusiveMinimum` / `ExclusiveMaximum` must be set together with `Minimum` / `Maximum` via `SchemaConfig` (also pointer fields), used to exclude the boundary value itself.

## Array Constraints: Items / MinItems / MaxItems / UniqueItems

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	tagsCfg := json.DefaultSchemaConfig()
	tagsCfg.Type = "array"
	minItems, maxItems := 1, 3
	tagsCfg.MinItems = &minItems
	tagsCfg.MaxItems = &maxItems
	tagsCfg.UniqueItems = true
	tagsCfg.Items = &json.Schema{Type: "string"}
	tagsSchema := json.NewSchemaWithConfig(tagsCfg)

	schema := &json.Schema{
		Type: "object",
		Properties: map[string]*json.Schema{
			"tags": tagsSchema,
		},
	}

	// 4 elements (exceeds the maximum of 3), and "a" is duplicated
	data := `{"tags":["a","a","b","c"]}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// Output:
	// tags: array length 4 exceeds maximum 3
	// tags[1]: duplicate item found: a
}
```

`Items` specifies the sub-schema that each element must satisfy (the example restricts it to strings); `UniqueItems` checks for duplicates by the string representation of elements.

## Enum and Constant: Enum / Const

`Enum` restricts the value to be one of the listed options; `Const` restricts it to equal a fixed value. Both take effect via direct comparison, with no need for `NewSchemaWithConfig`:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	schema := &json.Schema{
		Type: "object",
		Properties: map[string]*json.Schema{
			"role":   {Enum: []any{"admin", "user", "guest"}},
			"status": {Const: "active"},
		},
	}

	// role is not in the enum; status matches the constant
	data := `{"role":"superuser","status":"active"}`

	errs, err := json.ValidateSchema(data, schema)
	if err != nil {
		panic(err)
	}
	for _, e := range errs {
		fmt.Printf("%s: %s\n", e.Path, e.Message)
	}
	// Output: role: value 'superuser' is not in allowed enum values: [admin user guest]
}
```

## Supported Format Values

The semantic formats supported by the `Format` field (unknown formats are silently skipped — no error, no pass):

| Format | Validation rule |
|--------|-----------------|
| `email` | Validates the local part, domain, TLD structure and length |
| `date` | `YYYY-MM-DD` |
| `date-time` | RFC3339 |
| `time` | `HH:MM:SS` |
| `uri` | Must contain `://` |
| `uuid` | UUID regex match |
| `ipv4` | 4 segments, each 0–255 |
| `ipv6` | Passes `net.ParseIP` parsing and contains `:` |

## ValidationError Type

Each constraint violation is a `ValidationError`, carrying the JSON path of the error and a description:

```go
type ValidationError struct {
    Path    string `json:"path"`    // Error path (e.g. "user.email", "tags[1]")
    Message string `json:"message"` // Error message
}

func (ve *ValidationError) Error() string
```

Since `ValidateSchema` returns a `[]ValidationError` slice, you can directly iterate and read `Path` / `Message`; the `Error()` method is used to format a single error as a string (e.g. for logging).

## Ways to Create a Schema

There are three ways to construct a `Schema`. **The key difference is whether length/range constraints take effect**:

```go
// 1) Direct literal: Type/Required/Properties/Items/Pattern/Format/Enum/Const/
//    UniqueItems/MultipleOf take effect immediately; but MinLength/MaxLength/Minimum/Maximum/
//    MinItems/MaxItems/ExclusiveMinimum/ExclusiveMaximum do NOT take effect (see note below)
schema := &json.Schema{Type: "string", Pattern: `^\d+$`}

// 2) NewSchemaWithConfig: set constraints via SchemaConfig pointer fields; all length/range
//    constraints take effect
cfg := json.DefaultSchemaConfig()
cfg.Type = "string"
minLen := 1
cfg.MinLength = &minLen
schema := json.NewSchemaWithConfig(cfg)

// 3) DefaultSchema: returns a Schema with default values (AdditionalProperties is true)
schema := json.DefaultSchema()
```

::: warning Length/range constraints must use NewSchemaWithConfig
The set of constraints `MinLength`, `MaxLength`, `Minimum`, `Maximum`, `MinItems`, `MaxItems`, `ExclusiveMinimum`, `ExclusiveMaximum` rely on tracking flags internal to `Schema` that cannot be set externally. Assigning these fields directly in a `&json.Schema{...}` literal **will not take effect**; you must use `NewSchemaWithConfig` and pass the corresponding **pointer fields** (e.g. `cfg.MinLength = &v`) to enable them. `Type`, `Required`, `Properties`, `Items`, `Pattern`, `Format`, `Enum`, `Const`, `UniqueItems`, `MultipleOf` are not subject to this restriction and take effect with both literals and `NewSchemaWithConfig`.
:::

## Validation-Related Fields in Config

| Field | Type | Description |
|-------|------|-------------|
| `EnableValidation` | `bool` | Enables input validation (affects security/structural checks before operations) |
| `ValidateInput` | `bool` | Validates input JSON |
| `SkipValidation` | `bool` | Skips non-essential validation (only for trusted input) |

::: warning Unconnected Extension Fields
`Config.CustomValidators` (`[]Validator`) and the `Validator` interface are **declared in the current version and participate in configuration cloning and cache key computation, but are not yet wired into the operation pipeline**. Registering validators via `Config.CustomValidators` (or `Config.AddValidator`) **will not affect the execution of any operation** — operations will not be rejected by custom validators. The `Validator` interface is currently a reserved interface:

```go
// Current version: declared but not wired; registering has no effect on operations (reserved interface)
type Validator interface {
    Validate(jsonStr string) error
}
```

For custom validation before or after operations, use the already-effective [Hooks](./hooks) (e.g. `ValidationHook`).
:::

## See Also

- [Interface Definitions](../api-reference/interfaces) - `Validator` interface (reserved) and `Schema`-related types
- [Configuration Options](../api-reference/config) - Validation-related configuration fields
- [Hooks](./hooks) - The effective pre/post-operation interception mechanism (including `ValidationHook`)
