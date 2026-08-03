---
sidebar_label: "File I/O"
title: "File Operation Functions - CyberGo JSON | API Reference"
description: "CyberGo JSON file I/O: LoadFromFile/SaveToFile for read/write, LoadFromReader/SaveToWriter for streaming, and MarshalToFile/UnmarshalFromFile serialization."
sidebar_position: 9
---

# File Operation Functions

The json package provides file operation functions, supporting file read/write, streaming I/O, and typed serialization. All file paths undergo security validation before read/write (see [File Path Validation](#security-file-path-validation)).

## File Read/Write

### LoadFromFile

Signature: `func LoadFromFile(filePath string, cfg ...Config) (string, error)`

Loads JSON data from a file and returns the **raw string** (no re-encoding; preserves the byte order and whitespace from the file). File size is limited by `Config.MaxJSONSize`.

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `filePath` | `string` | Yes | File path (must pass security validation) |
| `cfg` | `Config` | No | Optional configuration (e.g. to tighten `MaxJSONSize`) |

```go
data, err := json.LoadFromFile("config.json")
if err != nil {
    panic(err)
}
fmt.Println(data) // Raw JSON string
```

### SaveToFile

Signature: `func SaveToFile(filePath string, data any, cfg ...Config) error`

Saves data as a JSON file. Automatically creates parent directories that do not exist; uses **atomic write** (writes a temp file first, then renames, so a crash will not truncate the existing file). String / `[]byte` inputs are pre-parsed to avoid double escaping.

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `filePath` | `string` | Yes | File path (must pass security validation) |
| `data` | `any` | Yes | Data to save (Go value or JSON string) |
| `cfg` | `Config` | No | Optional configuration (e.g. `PrettyConfig()` for formatted output) |

```go
// Compact save (default)
err := json.SaveToFile("output.json", map[string]any{
    "name": "Alice",
    "age":  30,
})

// Pretty save
err = json.SaveToFile("output.json", data, json.PrettyConfig())
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
    // Create a temp file to ensure the example runs standalone
    tmp, err := os.CreateTemp("", "cybergo-*.json")
    if err != nil {
        panic(err)
    }
    path := tmp.Name()
    tmp.Close()
    defer os.Remove(path)

    // Write: map is encoded with keys sorted by name
    err = json.SaveToFile(path, map[string]any{"name": "Alice", "age": 30})
    if err != nil {
        panic(err)
    }

    // Read back: returns the raw file contents
    data, err := json.LoadFromFile(path)
    if err != nil {
        panic(err)
    }
    fmt.Println(data)
    // Output: {"age":30,"name":"Alice"}
}
```

## Streaming I/O

### LoadFromReader

Signature: `func LoadFromReader(reader io.Reader, cfg ...Config) (string, error)`

Loads JSON data from an `io.Reader` and returns the raw string. The number of bytes read is limited by `Config.MaxJSONSize` (to prevent memory exhaustion). Suitable for streaming data sources such as network connections, HTTP response bodies, and pipes.

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `reader` | `io.Reader` | Yes | Data source |
| `cfg` | `Config` | No | Optional configuration |

```go
// Read from HTTP response body
resp, _ := http.Get("https://api.example.com/data")
defer resp.Body.Close()
data, err := json.LoadFromReader(resp.Body)

// Read from a string
data, err = json.LoadFromReader(strings.NewReader(`{"name":"test"}`))
```

**Full Example: Reading from strings.Reader and os.File**

```go
package main

import (
    "fmt"
    "strings"

    "github.com/cybergodev/json"
)

func main() {
    // Read from strings.Reader (raw content returned as-is)
    reader := strings.NewReader(`{"name":"Alice","age":30}`)
    data, err := json.LoadFromReader(reader)
    if err != nil {
        panic(err)
    }
    fmt.Println(data)
    // Output: {"name":"Alice","age":30}
}
```

When reading from an `os.File`, the usage is the same — `os.File` implements `io.Reader`:

```go
file, err := os.Open("data.json")
if err != nil {
    panic(err)
}
defer file.Close()

data, err := json.LoadFromReader(file)
```

### SaveToWriter

Signature: `func SaveToWriter(writer io.Writer, data any, cfg ...Config) error`

Encodes data as JSON and writes it to an `io.Writer`. Like `SaveToFile`, it pre-parses string / `[]byte` inputs to prevent double escaping, but **does not perform file path validation** (the target is controlled by the caller).

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `writer` | `io.Writer` | Yes | Output target |
| `data` | `any` | Yes | Data to write |
| `cfg` | `Config` | No | Optional configuration |

```go
var buf bytes.Buffer
err := json.SaveToWriter(&buf, map[string]any{"name": "test"}, json.PrettyConfig())
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
    var buf bytes.Buffer
    err := json.SaveToWriter(&buf, map[string]any{"name": "Alice", "age": 30}, json.PrettyConfig())
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

Writing to an `os.File` works the same way — just pass in the file handle.

## Serialization Convenience Methods

### MarshalToFile

Signature: `func MarshalToFile(filePath string, data any, cfg ...Config) error`

Serializes data as JSON and writes it to a file. Difference from `SaveToFile`: `MarshalToFile` calls `Marshal` / `MarshalIndent` directly (no string pre-parsing), making it suitable for writing Go values such as structs and maps; `SaveToFile` is suited for cases where the input may already be a JSON string / `[]byte`. Both automatically create parent directories and write atomically.

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `filePath` | `string` | Yes | File path |
| `data` | `any` | Yes | Data to serialize |
| `cfg` | `Config` | No | Optional configuration (`PrettyConfig()` produces indented output) |

```go
err := json.MarshalToFile("data.json", myStruct)
err = json.MarshalToFile("data.json", myStruct, json.PrettyConfig())
```

### UnmarshalFromFile

Signature: `func UnmarshalFromFile(filePath string, v any, cfg ...Config) error`

Reads JSON from a file and deserializes it into the target variable. It is a convenience combination of "read file + `Unmarshal`"; reading is limited by `MaxJSONSize`.

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `filePath` | `string` | Yes | File path |
| `v` | `any` | Yes | Target object pointer |
| `cfg` | `Config` | No | Optional configuration |

```go
var config MyConfig
err := json.UnmarshalFromFile("config.json", &config)
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
    tmp, err := os.CreateTemp("", "cybergo-*.json")
    if err != nil {
        panic(err)
    }
    path := tmp.Name()
    tmp.Close()
    defer os.Remove(path)

    // Serialize a struct and write to file
    err = json.MarshalToFile(path, User{Name: "Alice", Age: 30})
    if err != nil {
        panic(err)
    }

    // Read from file and deserialize
    var user User
    err = json.UnmarshalFromFile(path, &user)
    if err != nil {
        panic(err)
    }
    fmt.Printf("%s, %d\n", user.Name, user.Age)
    // Output: Alice, 30
}
```

## Security: File Path Validation

All file read/write functions (`LoadFromFile` / `SaveToFile` / `MarshalToFile` / `UnmarshalFromFile`) perform multi-layer security validation on the path before operating, controlled by `Config.ValidateFilePath` (default `true`). The validation covers the following attack vectors:

| Protection | Description |
|------------|-------------|
| Path traversal | Detects `..`, `..\` and their URL-encoded variants (`%2e%2e`, multi-layer encoding), Unicode homoglyph characters (fullwidth dot / slash) |
| Null byte injection | Rejects `\x00` in paths |
| Symlink escape | Resolves the real path of symlinks to prevent pointing into restricted areas |
| System directories (Unix) | Blocks access to `/dev/`, `/proc/`, `/etc/passwd`, `/root/`, and other sensitive paths |
| Windows reserved names | Rejects `CON`, `PRN`, `COM1-9`, `LPT1-9`, UNC paths, Alternate Data Streams (ADS) |
| File size | Checks whether an existing file exceeds `MaxJSONSize` before reading; uses `io.LimitReader` during reading to prevent TOCTOU |

```go
// Path traversal attacks are rejected, returning a security error
_, err := json.LoadFromFile("../../etc/passwd")
// err is non-nil: path traversal pattern detected

// Normal paths are unaffected
data, err := json.LoadFromFile("config/app.json")
```

::: warning Note
File path validation always applies to file operations (`LoadFromReader` / `SaveToWriter` do not involve paths, so they are not validated). When handling user-supplied filenames, these checks are one layer of defense in depth, but you should still apply whitelist constraints at the application layer.
:::

## File Iteration Functions

The json package provides the `ForeachFile` family of functions, which iterate JSON arrays / objects directly from a file without manual read + parse:

| Function | Purpose |
|----------|---------|
| `ForeachFile(path, fn, cfg...)` | Iterate the root-level array / object of a file |
| `ForeachFileWithPath(path, pathExpr, fn, cfg...)` | Iterate the collection under a specified path in the file |
| `ForeachFileChunked(path, chunkSize, fn, cfg...)` | Iterate a large array in batches (chunks) |
| `ForeachFileNested(path, fn, cfg...)` | Recursively iterate all nested structures |

```go
err := json.ForeachFile("users.json", func(key any, item *json.IterableValue) error {
    fmt.Println(item.GetString("name"))
    return nil
})
```

These functions are a convenience combination of `LoadFromFile` + `Foreach`, suitable for processing large collections. For streaming processing and memory optimization details, see [Stream Processing](../../streaming/large-files).

## Method Selection

| Scenario | Recommended function |
|----------|----------------------|
| Read file to get the raw string | `LoadFromFile` |
| Read file and deserialize into a struct | `UnmarshalFromFile` |
| Read from Reader / HTTP Body | `LoadFromReader` |
| Save Go value to file (compact) | `SaveToFile` / `MarshalToFile` |
| Save and format | `SaveToFile(path, data, json.PrettyConfig())` |
| Write to Writer / Buffer | `SaveToWriter` |
| Iterate collections in a file | `ForeachFile` family |

## See Also

- [JSONL Processing Functions](./jsonl) - ParseJSONL, StreamLinesInto and other newline-delimited JSON processing
- [Encoding & Output Functions](./output) - Marshal, Unmarshal and other serialization operations
- [Stream Processing](../../streaming/large-files) - Stream processor and large file iteration in detail
- [Processor File I/O](../processor/file-io) - Corresponding Processor instance methods
