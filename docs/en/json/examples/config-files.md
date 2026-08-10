---
sidebar_label: "Configuration Files"
title: "Configuration Files - CyberGo JSON | Load, Modify & Merge"
description: "Practical CyberGo JSON config: LoadFromFile/SaveToFile, GetString/GetInt for nested values, Set editing and MergeJSON to merge defaults with user config."
sidebar_position: 3
---

# Configuration Files

This guide demonstrates how to handle typical configuration file scenarios with CyberGo JSON: loading, reading nested values, modifying, saving, and merging default config with user config.

## Full Config Lifecycle

Load config → read nested values → modify → save back to file → reload to verify. The example uses a temporary file so it runs standalone.

```go
package main

import (
    "fmt"
    "os"
    "path/filepath"

    "github.com/cybergodev/json"
)

func main() {
    // Use a temp directory so the example runs standalone
    tmpDir, err := os.MkdirTemp("", "cybergo-config-*")
    if err != nil {
        panic(err)
    }
    defer os.RemoveAll(tmpDir)

    configPath := filepath.Join(tmpDir, "config.json")

    // Write the initial config file
    initial := `{
        "server": {"host": "0.0.0.0", "port": 8080},
        "database": {"host": "localhost", "port": 5432, "name": "appdb"},
        "logging": {"level": "info"}
    }`
    if err := os.WriteFile(configPath, []byte(initial), 0644); err != nil {
        panic(err)
    }

    // 1. Load config from file
    data, err := json.LoadFromFile(configPath)
    if err != nil {
        panic(err)
    }

    // 2. Read nested values (supports an optional default argument)
    fmt.Printf("Server: %s:%d\n", json.GetString(data, "server.host"), json.GetInt(data, "server.port"))
    fmt.Printf("Database: %s/%s\n", json.GetString(data, "database.host"), json.GetString(data, "database.name"))
    fmt.Printf("Log level: %s\n", json.GetString(data, "logging.level", "info"))

    // 3. Modify config (update existing values)
    data, err = json.Set(data, "server.port", 9090)
    if err != nil {
        panic(err)
    }
    data, err = json.Set(data, "logging.level", "debug")
    if err != nil {
        panic(err)
    }

    // 4. Save back to file (pretty-printed)
    if err := json.SaveToFile(configPath, data, json.PrettyConfig()); err != nil {
        panic(err)
    }

    // 5. Reload to verify the change persisted
    reloaded, err := json.LoadFromFile(configPath)
    if err != nil {
        panic(err)
    }
    fmt.Printf("Restart port: %d\n", json.GetInt(reloaded, "server.port"))
    fmt.Printf("Restart log: %s\n", json.GetString(reloaded, "logging.level"))
}
```

## Merging Defaults and User Config

In real apps you often overlay a user config on top of built-in defaults, then fill in missing nested paths. `MergeJSON` performs a **deep merge** (user values win), while `SetCreate` automatically creates intermediate paths that don't exist yet.

```go
package main

import (
    "fmt"

    "github.com/cybergodev/json"
)

func main() {
    // Built-in default config
    defaults := `{
        "server": {"host": "0.0.0.0", "port": 8080, "timeout": 30},
        "database": {"host": "localhost", "port": 5432, "pool": 10},
        "logging": {"level": "info", "format": "json"}
    }`

    // User config (overrides some fields)
    userConfig := `{
        "server": {"port": 3000},
        "database": {"host": "db.prod.example.com"},
        "logging": {"level": "debug"}
    }`

    // Deep merge: user config overrides defaults, unmodified default fields are kept
    merged, err := json.MergeJSON(defaults, userConfig)
    if err != nil {
        panic(err)
    }
    fmt.Printf("Port: %d (user override)\n", json.GetInt(merged, "server.port"))
    fmt.Printf("Timeout: %d (default kept)\n", json.GetInt(merged, "server.timeout"))
    fmt.Printf("Database: %s:%d\n", json.GetString(merged, "database.host"), json.GetInt(merged, "database.port"))

    // Use SetCreate to add nested paths that don't exist yet (creates intermediate objects)
    merged, err = json.SetCreate(merged, "features.metrics.enabled", true)
    if err != nil {
        panic(err)
    }
    merged, err = json.SetCreate(merged, "features.metrics.endpoint", "/metrics")
    if err != nil {
        panic(err)
    }

    fmt.Printf("Metrics enabled: %v\n", json.GetBool(merged, "features.metrics.enabled"))
    fmt.Printf("Metrics endpoint: %s\n", json.GetString(merged, "features.metrics.endpoint"))
}
// Output:
// Port: 3000 (user override)
// Timeout: 30 (default kept)
// Database: db.prod.example.com:5432
// Metrics enabled: true
// Metrics endpoint: /metrics
```

:::tip
`MergeJSON` does a deep recursive merge: object keys are merged layer by layer, while arrays and scalar values are replaced directly. To merge multiple config sources at once, use `MergeMany([]string{...})`.
:::

## Next Steps

- [Basic Examples](./index) — path queries, modification, struct encoding basics
- [Cheat Sheet](../getting-started/cheatsheet) — quick API reference
- [Path Syntax](../getting-started/path-syntax) — full path syntax (slices, wildcards)
- [Helper Functions](../api-reference/helpers) — `MergeJSON`, `CompareJSON`, and other utilities
