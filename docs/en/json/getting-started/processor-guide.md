---
sidebar_label: "Processor Guide"
title: "Processor Guide - CyberGo JSON | When to Use a Processor"
description: "CyberGo JSON Processor guide: when to choose Processor over package functions, PreParse optimization, lifecycle management, and global processor setup."
sidebar_position: 3
---

# Processor Guide

This guide helps you understand **when** and **how** to use a Processor, and what advantages it offers over package-level functions.

## Package Functions vs Processor

CyberGo JSON offers two API styles:

| Dimension | Package Functions | Processor |
|-----------|-------------------|-----------|
| **Typical call** | `json.GetString(data, "name")` | `p.GetString(data, "name")` |
| **Creation** | None, call directly | `p, err := json.New()` |
| **Configuration** | Pass `cfg ...Config` on each call | Configure once at creation, reuse thereafter |
| **Cache** | Shared global cache | Independent cache, controllable and clearable |
| **Resource management** | Automatic (global processor) | Manual `Close()` |
| **Hook system** | Not supported | Supports `AddHook` |
| **Pre-parse** | Not supported | Supports `PreParse` + `GetFromParsed` |
| **Use cases** | Simple operations, scripts, low-frequency calls | High-frequency operations, custom config, server-side |

::: tip Quick Decision
- **Use package functions**: occasional JSON operations, no lifecycle management needed, quick scripts
- **Use Processor**: custom configuration needed, frequent queries on the same data, hooks/auditing required
:::

## When to Use a Processor

### Scenario 1: Custom Configuration

Package-level functions use the default configuration. If you need safe mode, custom encoders, or hooks, use a Processor:

```go
// Package function — always uses the default configuration
val := json.GetString(data, "name")

// Processor — allows custom configuration
cfg := json.SecurityConfig() // Safe mode
p, err := json.New(cfg)
if err != nil {
    panic(err)
}
defer p.Close()

// All subsequent operations use the safe configuration
val, err := p.Get(data, "name")
```

### Scenario 2: Frequent Queries on the Same Data (PreParse Optimization)

When querying the same JSON multiple times, `PreParse` parses it once and subsequent queries reuse the parsed result:

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

// Parse once
parsed, err := p.PreParse(largeJSON)
if err != nil {
    panic(err)
}

// Multiple queries — reuse the parsed result, avoid re-parsing
name, _ := p.GetFromParsed(parsed, "user.name")
email, _ := p.GetFromParsed(parsed, "user.email")
tags, _ := p.GetFromParsed(parsed, "tags")
```

::: warning Performance Comparison
- Package function `GetString`: parses JSON on every call (caching exists but hit rate depends on the scenario)
- `PreParse` + `GetFromParsed`: parses once; N queries only navigate, zero re-parsing
:::

### Scenario 3: Hooks and Auditing

When you need logging, performance monitoring, or input validation, the Processor supports a hook system:

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

// Add a logging hook
p.AddHook(json.LoggingHook(slog.Default()))
// Add a timing hook
p.AddHook(json.TimingHook(&metricsRecorder))

// All operations automatically trigger hooks
result, err := p.Set(data, "user.name", "Alice")
```

See [Hook System](../extensions/hooks).

## Lifecycle Management

A Processor holds resources (cache, goroutines) and **must be closed** after use:

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close() // Ensure resources are released

// Use the Processor...
result, err := p.GetString(data, "name")
```

::: warning Consequences of Forgetting Close
- Cache memory is not released
- Background goroutines leak
- May lead to resource exhaustion under high concurrency
:::

### Checking State

```go
if p.IsClosed() {
    // Processor is closed and can no longer be used
}
```

## Global Processor

Package-level functions (`Get`, `Set`, `Marshal`, etc.) internally use the **global processor**. You can also replace it:

```go
// Create a processor with custom configuration
cfg := json.SecurityConfig()
p, err := json.New(cfg)
if err != nil {
    panic(err)
}

// Set it as the global processor
json.SetGlobalProcessor(p)

// Now all package-level functions use the safe configuration
val := json.GetString(data, "name")

// Clean up when the application exits
defer json.ShutdownGlobalProcessor()
```

::: tip Use Cases
- A globally unified security policy
- Custom encoders applied globally
- Replacing the default configuration without passing Config everywhere
:::

## Decision Tree

```
Need to work with JSON?
├── Occasional use, scripting tools
│   └── → Use package functions json.GetString / json.Set / json.Marshal
├── Need custom configuration (security/encoding/hooks)
│   └── → Use a Processor json.New(cfg)
├── Multiple queries on the same JSON
│   └── → Use a Processor + PreParse
├── Need auditing/monitoring/logging
│   └── → Use a Processor + AddHook
└── Globally unified configuration
    └── → Use SetGlobalProcessor
```

## Next Steps

- [Path Expression Syntax](./path-syntax) — Complete path query syntax
- [Processor API](../api-reference/processor/) — Full method reference
- [Performance Optimization](../advanced/performance) — Deep dive into performance tuning
- [Cheat Sheet](./cheatsheet) — Quick API reference
