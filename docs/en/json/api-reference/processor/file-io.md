---
sidebar_label: "File I/O"
title: "Processor File I/O Methods - CyberGo JSON | API Reference"
description: "CyberGo JSON Processor file methods: LoadFromFile/LoadFromReader to load, SaveToFile/MarshalToFile to save, UnmarshalFromFile to read, SaveToWriter for streams."
sidebar_position: 9
---

# File I/O Methods

The Processor provides JSON file read/write and streaming load methods, covering three data source types: files, `io.Reader`, and `io.Writer`. File-type methods perform security path validation before operating (see [Function Reference](../functions/file-io#security-file-path-validation)).

## File Loading

### LoadFromFile

Signature: `func (p *Processor) LoadFromFile(filePath string, cfg ...Config) (string, error)`

Loads JSON data from a file and returns the **raw string** (preserves the file byte order and whitespace, no re-encoding). Bytes read are limited by `MaxJSONSize`.

```go
data, err := p.LoadFromFile("config.json")
if err != nil {
    panic(err)
}
fmt.Println(data) // Raw JSON string
```

### LoadFromFileAsData (Now Private)

::: warning API Change Notice
LoadFromFileAsData has been converted to an internal method (`loadFromFileAsData`) and is no longer exported as a public API. Please use the `LoadFromFile` + `Parse` combination instead:

```go
jsonStr, err := p.LoadFromFile("data.json")
if err != nil {
    panic(err)
}
var data any
err = p.Parse(jsonStr, &data)
// data type is map[string]any or []any
if obj, ok := data.(map[string]any); ok {
    fmt.Println(obj["name"])
}
```

:::

## Reader Loading

### LoadFromReader

Signature: `func (p *Processor) LoadFromReader(reader io.Reader, cfg ...Config) (string, error)`

Loads JSON data from an `io.Reader` and returns the raw string. Reading is limited by `MaxJSONSize`. Suitable for streaming sources such as `os.File`, HTTP Body, and pipes.

```go
file, _ := os.Open("data.json")
defer file.Close()

data, err := p.LoadFromReader(file)
if err != nil {
    panic(err)
}
```

### LoadFromReaderAsData (Now Private)

::: warning API Change Notice
LoadFromReaderAsData has been converted to an internal method (`loadFromReaderAsData`) and is no longer exported as a public API. Please use the `LoadFromReader` + `Parse` combination instead:

```go
file, _ := os.Open("data.json")
defer file.Close()

jsonStr, err := p.LoadFromReader(file)
if err != nil {
    panic(err)
}
var data any
err = p.Parse(jsonStr, &data)
```

:::

## File Writing

### SaveToFile

Signature: `func (p *Processor) SaveToFile(filePath string, data any, cfg ...Config) error`

Saves data as a JSON file. Automatically creates parent directories and uses **atomic write** (temp file + rename). String / `[]byte` inputs are pre-parsed to avoid double escaping.

```go
err := p.SaveToFile("data.json", map[string]any{"name": "CyberGo"})

// Save with PrettyConfig for formatted output
err = p.SaveToFile("data.json", data, json.PrettyConfig())
```

**Full Example: SaveToFile + LoadFromFile Round-trip**

```go
package main

import (
    "fmt"
    "os"

    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New()
    if err != nil {
        panic(err)
    }
    defer p.Close()

    tmp, err := os.CreateTemp("", "cybergo-*.json")
    if err != nil {
        panic(err)
    }
    path := tmp.Name()
    tmp.Close()
    defer os.Remove(path)

    err = p.SaveToFile(path, map[string]any{"name": "Alice", "age": 30})
    if err != nil {
        panic(err)
    }

    data, err := p.LoadFromFile(path)
    if err != nil {
        panic(err)
    }
    fmt.Println(data)
    // Output: {"age":30,"name":"Alice"}
}
```

### MarshalToFile

Signature: `func (p *Processor) MarshalToFile(path string, data any, cfg ...Config) error`

Encodes data as JSON and writes it to a file. Automatically creates parent directories and writes atomically. Difference from `SaveToFile`: `MarshalToFile` calls `Marshal` / `MarshalIndent` directly (no string pre-parsing), making it suitable for Go values such as structs and maps.

```go
err := p.MarshalToFile("output.json", data)

// Pretty save
err = p.MarshalToFile("output.json", data, json.PrettyConfig())
```

**Full Example: MarshalToFile + UnmarshalFromFile Struct Round-trip**

```go
package main

import (
    "fmt"
    "os"

    "github.com/cybergodev/json"
)

type User struct {
    Name string `json:"name"`
    Age  int    `json:"age"`
}

func main() {
    p, err := json.New()
    if err != nil {
        panic(err)
    }
    defer p.Close()

    tmp, err := os.CreateTemp("", "cybergo-*.json")
    if err != nil {
        panic(err)
    }
    path := tmp.Name()
    tmp.Close()
    defer os.Remove(path)

    err = p.MarshalToFile(path, User{Name: "Alice", Age: 30})
    if err != nil {
        panic(err)
    }

    var user User
    err = p.UnmarshalFromFile(path, &user)
    if err != nil {
        panic(err)
    }
    fmt.Printf("%s, %d\n", user.Name, user.Age)
    // Output: Alice, 30
}
```

### UnmarshalFromFile

Signature: `func (p *Processor) UnmarshalFromFile(path string, v any, cfg ...Config) error`

Reads JSON from a file and decodes it into the target variable. Reading is limited by `MaxJSONSize`.

```go
var config Config
err := p.UnmarshalFromFile("config.json", &config)
if err != nil {
    panic(err)
}
```

### SaveToWriter

Signature: `func (p *Processor) SaveToWriter(writer io.Writer, data any, cfg ...Config) error`

Encodes data as JSON and writes it to an `io.Writer`. Does not involve file paths, so no path validation is performed.

```go
var buf bytes.Buffer
err := p.SaveToWriter(&buf, data, json.PrettyConfig())
```

**Full Example: Writing to bytes.Buffer**

```go
package main

import (
    "bytes"
    "fmt"

    "github.com/cybergodev/json"
)

func main() {
    p, err := json.New()
    if err != nil {
        panic(err)
    }
    defer p.Close()

    var buf bytes.Buffer
    err = p.SaveToWriter(&buf, map[string]any{"name": "Alice", "age": 30}, json.PrettyConfig())
    if err != nil {
        panic(err)
    }
    fmt.Print(buf.String())
    // Output:
    // {
    //   "age": 30,
    //   "name": "Alice"
    // }
}
```

## File Iteration

The Processor provides the `ForeachFile` family of methods, which iterate JSON collections directly from a file. They are a convenience combination of `LoadFromFile` + `Foreach`:

| Method | Purpose |
|--------|---------|
| `ForeachFile(path, fn, cfg...)` | Iterate the root-level array / object of a file |
| `ForeachFileWithPath(path, pathExpr, fn, cfg...)` | Iterate the collection under a specified path in the file |
| `ForeachFileChunked(path, chunkSize, fn, cfg...)` | Iterate a large array in batches |
| `ForeachFileNested(path, fn, cfg...)` | Recursively iterate all nested structures |

```go
err := p.ForeachFile("users.json", func(key any, item *json.IterableValue) error {
    fmt.Println(item.GetString("name"))
    return nil
})
```

The callback supports `item.Break()` to terminate iteration early. For streaming processing and large file optimization details, see [Stream Processing](../../streaming/large-files).

## Method Selection

| Scenario | Recommended method |
|----------|--------------------|
| Need the raw string | `LoadFromFile` / `LoadFromReader` |
| Need parsed data | `LoadFromFile` + `Parse` / `LoadFromReader` + `Parse` |
| Save Go value to file | `SaveToFile` / `MarshalToFile` |
| Read from file and decode into a struct | `UnmarshalFromFile` |
| Write to a Writer | `SaveToWriter` |
| Iterate collections in a file | `ForeachFile` family |

## See Also

- [Parse & Validate](./parse) - Parse/Valid parsing methods
- [File I/O Functions](../functions/file-io) - Package-level file read/write functions (with detailed path security validation)
- [Stream Processing](../../streaming/large-files) - Stream processor and large file iteration in detail
