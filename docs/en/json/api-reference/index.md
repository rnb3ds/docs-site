---
sidebar_label: "Overview"
title: "API Reference - CyberGo JSON | Complete Function Reference"
description: "CyberGo JSON API reference: GetString/GetInt queries, Set/Delete, Marshal/Unmarshal, Processor, Schema validation, Hook, and security config."
sidebar_position: 1
---

# API Reference

This section provides the complete API reference for the `github.com/cybergodev/json` library.

::: tip Two API Styles
This library offers **package-level functions** (e.g., `json.GetString(data, "path")`, no instance needed) and **Processor methods** (e.g., `p.GetString(data, "path")`, with config reuse, pre-parse caching, and hooks). Not sure which to use? See the decision tree in the [Processor Guide](../getting-started/processor-guide).
:::

## Module Index

### Function APIs

| Module | Description |
|--------|-------------|
| [Package Functions](./functions/) | Package-level function reference (query/modify/delete/encode/parse/batch/JSONL/file/iterate) |
| [Processor](./processor/) | Processor methods (mirrors package functions by category, plus lifecycle and pre-parse) |

### Types & Interfaces

| Module | Description |
|--------|-------------|
| [Config](./config) | Configuration options in detail (DefaultConfig / SecurityConfig / PrettyConfig) |
| [Type Definitions](./types) | Core types (Config / Schema / Stats / AccessResult, including Encoder / Decoder) |
| [Interface Definitions](./interfaces) | Extension interfaces (CustomEncoder / Validator / Hook / PathParser) |
| [Iterators & IterableValue](./iterator) | Iterator / BatchIterator / ParallelIterator / StreamIterator types |
| [Generic Operations](./generics) | Generic API (GetTyped[T] / StreamLinesInto[T] / Result[T]) |
| [Constants & Errors](./constants) | Constants and error types |

### Utilities

| Module | Description |
|--------|-------------|
| [Utility Functions](./helpers) | CompareJSON / MergeJSON, cache management, global processor, SafeError / RedactedPath, AccessResult methods |
| [Formatting Guide](./print) | Print series migration guide (alternatives for removed APIs) |

### Cross-cutting Topics

| Module | Description |
|--------|-------------|
| [Stream Processing](../streaming/large-files) | Large file stream processing guide |
| [NDJSON Processing](../streaming/jsonl) | JSONL processor (StreamJSONL / NDJSONProcessor / JSONLWriter) |
| [Security](../security/security-mode) | Security mode API (SecurityConfig / DangerousPattern / RegisterDangerousPattern) |
| [Validator](../extensions/validator) | Schema validation (ValidateSchema / DefaultSchema / NewSchemaWithConfig) |
| [Hook System](../extensions/hooks) | Operation interception hooks (LoggingHook / TimingHook / ValidationHook / ErrorHook) |
| [Custom Encoder](../extensions/custom-encoder) | Custom encoders (CustomEncoder / TypeEncoder) |

## Quick Find

### By Feature Category

#### Path Queries

| Function | Description |
|----------|-------------|
| `Get`, `GetWithContext`, `GetString`, `GetInt`, `GetFloat`, `GetBool`, `GetArray`, `GetObject` | Type-safe getters |
| `GetTyped[T]` | Generic getter |
| `SafeGet` | Safe getter returning AccessResult |
| `GetMultiple` | Batch getter |

#### Modify Operations

| Function | Description |
|----------|-------------|
| `Set`, `SetMultiple` | Set values |
| `SetCreate`, `SetMultipleCreate` | Set values with automatic path creation |
| `Delete`, `DeleteClean` | Delete values |
| `ProcessBatch` | Batch operations |

#### Encoding & Decoding

| Function | Description |
|----------|-------------|
| `Marshal`, `Unmarshal` | Standard encoding/decoding (compatible with `encoding/json`, optional `cfg`) |
| `MarshalIndent` | Pretty-print encoding (compatible with `encoding/json.MarshalIndent`, optional `cfg`) |
| `Encode`, `EncodeWithConfig` | Encode to string |
| `NewEncoder`, `NewDecoder` | Stream encoding/decoding |
| `Parse` | Parse JSON |

#### Formatting

| Function | Description |
|----------|-------------|
| `Prettify` | Format JSON |
| `Compact` | Compact JSON (buffer form, compatible with `encoding/json.Compact`) |
| `CompactString` | Compact JSON (string in/out form, mirrors `Processor.Compact`) |

#### File Operations

| Function | Description |
|----------|-------------|
| `LoadFromFile`, `SaveToFile` | File read/write |
| `LoadFromReader` | Read from Reader |
| `MarshalToFile`, `UnmarshalFromFile` | File encoding/decoding |

#### Stream Processing

| Type/Method | Description |
|-------------|-------------|
| `StreamLinesInto[T]` | Stream read JSONL from Reader and convert to `[]T` |
| `ParseJSONL` | Parse JSONL bytes to `[]any` |
| `ToJSONL`, `ToJSONLString` | Convert `[]any` to JSONL format |
| `JSONLWriter` | JSONL writer (Write/WriteAll/WriteRaw) |
| `NDJSONProcessor` | NDJSON/JSONL processor |
| `ForeachFile` | File stream processing |

#### Validation

| Function | Description |
|----------|-------------|
| `Valid` | JSON validation (compatible with `encoding/json.Valid`) |
| `ValidWithConfig` | JSON validation with configuration |
| `ValidateSchema` | Schema validation (used with `Schema` type) |
| `CompareJSON` | Compare JSON for equivalence |

## Naming Conventions

The library follows these naming conventions:

| Pattern | Description | Example |
|---------|-------------|---------|
| `Get{Type}` | Get specified type (supports defaultValue) | `GetString`, `GetInt` |
| `GetTyped[T]` | Generic getter, returns T | `GetTyped[User]` |
| `New{Type}` | Create instance | `New` (returns *Processor), `NewEncoder` |
| `Default{Type}` | Default configuration | `DefaultConfig` |
| `{Type}Config` | Configuration preset | `SecurityConfig`, `PrettyConfig` |

## Related

- [Getting Started](../getting-started/) -- Installation and basic usage
- [Processor Guide](../getting-started/processor-guide) -- When to use a Processor
- [Path Expression Syntax](../getting-started/path-syntax) -- Path query syntax
- [Usage Examples](../examples/) -- Practical code examples
- [Large File Processing](../streaming/large-files) -- Stream processing guide
