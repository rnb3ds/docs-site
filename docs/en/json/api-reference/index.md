---
sidebar_label: "Overview"
title: "API Reference - CyberGo JSON | Complete Function Docs"
description: "CyberGo JSON API reference: GetString/GetInt queries, Set/Delete, Marshal/Unmarshal, Processor, Schema validation, package/instance methods, stdlib compatible."
sidebar_position: 1
---

# API Reference

This section provides the complete API reference for the `github.com/cybergodev/json` library.

:::tip Two API styles
The library offers two API surfaces: **package-level functions** (e.g. `json.GetString(data, "path")`, no instance required) and **Processor methods** (e.g. `p.GetString(data, "path")`, with configuration reuse, pre-parse caching, and the hook system). Not sure which to use? See the decision tree in the [Processor Guide](../getting-started/processor-guide).
:::

## Module Index

### Function APIs

| Module | Description |
|--------|-------------|
| [Package Functions](./functions/) | Package-level function reference (query/modify/delete/encode/parse/batch/JSONL/file/iteration) |
| [Processor](./processor/) | Processor methods (mirrors the package functions, plus lifecycle and pre-parsing) |

### Types and Interfaces

| Module | Description |
|--------|-------------|
| [Config](./config) | Configuration options in detail (DefaultConfig / SecurityConfig / PrettyConfig) |
| [Type Definitions](./types) | Core types (Config / Schema / Stats / AccessResult, plus Encoder / Decoder, CompiledPath / PathSegment) |
| [Interface Definitions](./interfaces) | Extension interfaces (CustomEncoder / Validator / Hook / PathParser) |
| [Iterators and IterableValue](./iterator) | Iterator / BatchIterator / ParallelIterator / StreamIterator types |
| [Generic Operations](./generics) | Generic APIs (GetTyped[T] / StreamLinesInto[T] / Result[T]) |
| [Constants and Errors](./constants) | Constants and error types (including `Default*` constants and a Config field mapping table) |

### Utilities and Helpers

| Module | Description |
|--------|-------------|
| [Helper Functions](./helpers) | CompareJSON / MergeJSON, cache management, the global processor, SafeError / RedactedPath, AccessResult methods |
| [Formatted Output](../getting-started/print) | Migration guide for the Print family (replacements for removed APIs) |

### Cross-Module Topics

| Module | Description |
|--------|-------------|
| [Streaming](../streaming/large-files) | Large-file streaming guide |
| [JSONL / NDJSON Processing](../streaming/jsonl) | JSONL processors (StreamJSONL / NDJSONProcessor / JSONLWriter) |
| [Security Validation](../security/security-mode) | Security-mode API (SecurityConfig / DangerousPattern / RegisterDangerousPattern) |
| [Schema Validation](./schema) | Schema validation (ValidateSchema / DefaultSchema / NewSchemaWithConfig) |
| [Hook System](../extensions/hooks) | Operation interception hooks (LoggingHook / TimingHook / ValidationHook / ErrorHook) |
| [Custom Encoders](../extensions/custom-encoder) | Custom encoders (CustomEncoder / TypeEncoder) |

## Quick Lookup

### By Feature

#### Path Queries

| Function | Description |
|----------|-------------|
| `Get`, `GetWithContext`, `GetString`, `GetInt`, `GetFloat`, `GetBool`, `GetArray`, `GetObject` | Type-safe gets |
| `GetTyped[T]` | Generic get |
| `SafeGet` | Safe get returning an AccessResult |
| `GetMultiple` | Batch get |

#### Modification Operations

| Function | Description |
|----------|-------------|
| `Set`, `SetMultiple` | Set values |
| `SetCreate`, `SetMultipleCreate` | Set values with automatic path creation |
| `Delete`, `DeleteClean` | Delete values |
| `ProcessBatch` | Batch operations |

#### Encoding and Decoding

| Function | Description |
|----------|-------------|
| `Marshal`, `Unmarshal` | Standard encode/decode (`encoding/json` compatible, optional `cfg`) |
| `MarshalIndent` | Indented encoding (`encoding/json.MarshalIndent` compatible, optional `cfg`) |
| `EncodeWithConfig`, `EncodePretty` | Encode to string (with config / pretty output) |
| `Encode` (deprecated) | Functionally equivalent to `EncodeWithConfig`, will be removed in a future major version — use `Marshal` or `EncodeWithConfig` in new code |
| `NewEncoder`, `NewDecoder` | Streaming encode/decode |
| `Parse`, `ParseAny` | Parse into a target variable / parse as `any` |
| `EncodeBatch`, `EncodeFields`, `EncodeStream` | Encode key-value pairs into an object / encode selected fields / encode multiple values into an array |

#### Formatting

| Function | Description |
|----------|-------------|
| `Prettify` | Pretty-print JSON |
| `Compact` | Compact JSON (buffer form, `encoding/json.Compact` compatible) |
| `CompactString` | Compact JSON (string in/out form, mirrors `Processor.Compact`) |
| `Indent` | Indent and write to a buffer (`encoding/json.Indent` compatible) |
| `HTMLEscape` | Escape HTML characters into a buffer (`encoding/json.HTMLEscape` compatible) |

#### File Operations

| Function | Description |
|----------|-------------|
| `LoadFromFile`, `SaveToFile` | Read and write files |
| `LoadFromReader` | Read from a Reader |
| `MarshalToFile`, `UnmarshalFromFile` | File encode/decode |
| `SaveToWriter` | Write to any Writer |

#### Iteration and Traversal

| Function | Description |
|----------|-------------|
| `Foreach`, `ForeachWithError`, `ForeachNested`, `ForeachNestedWithError` | Iterate arrays/objects (incl. deep traversal) |
| `ForeachWithPath`, `ForeachWithPathAndIterator`, `ForeachWithPathAndControl` | Iterate at a given path (carrying the current path / with break control) |
| `ForeachReturn` | Iterate and return the modified JSON |
| `ForeachFile`, `ForeachFileWithPath`, `ForeachFileChunked`, `ForeachFileNested` | Streaming iteration over large files |
| `NewIterator`, `NewBatchIterator`, `NewParallelIterator`, `NewStreamIterator` | Standalone iterator constructors (see [Iterators](./iterator)) |

#### Cache and Globals

| Function | Description |
|----------|-------------|
| `WarmupCache`, `ClearCache` | Cache warm-up / clearing |
| `GetStats`, `GetHealthStatus` | Runtime statistics / health check |
| `GetConfig`, `SetLogger` | Read processor config / inject a logger (both global and Processor methods) |
| `SetGlobalProcessor`, `ShutdownGlobalProcessor` | Replace and shut down the global processor |
| `RegisterDangerousPattern`, `UnregisterDangerousPattern`, `ListDangerousPatterns` | Global dangerous-pattern registry register / remove / list (see [Helper Functions](./helpers#registerdangerouspattern)) |
| `CompilePath` (Processor), `PreParse` (Processor) | Path pre-compilation / JSON pre-parsing |

#### Streaming

| Type/Method | Description |
|-------------|-------------|
| `StreamLinesInto[T]` | Stream JSONL from a Reader and convert to `[]T` |
| `ParseJSONL` | Parse JSONL bytes into `[]any` |
| `ToJSONL`, `ToJSONLString` | Convert `[]any` to JSONL format |
| `JSONLWriter` | JSONL writer (Write/WriteAll/WriteRaw) |
| `NDJSONProcessor` | NDJSON/JSONL processor (created by `NewNDJSONProcessor`) |
| `ForeachFile` | File streaming |

#### Validation

| Function | Description |
|----------|-------------|
| `Valid` | JSON validation (`encoding/json.Valid` compatible) |
| `ValidWithConfig` | JSON validation with config |
| `ValidateSchema` | Schema validation (used with the `Schema` type) |
| `CompareJSON` | Compare JSON for equivalence |
| `MergeJSON`, `MergeMany` | JSON merging (union/intersection/difference modes, see [Helper Functions](./helpers)) |

## Naming Conventions

The library follows these naming conventions:

| Pattern | Description | Example |
|---------|-------------|---------|
| `Get{Type}` | Get as the given type (defaultValue supported) | `GetString`, `GetInt` |
| `GetTyped[T]` | Generic get, returns T | `GetTyped[User]` |
| `New{Type}` | Create an instance | `New` (returns *Processor), `NewEncoder` |
| `Default{Type}` | Default configuration | `DefaultConfig` |
| `{Type}Config` | Configuration preset | `SecurityConfig`, `PrettyConfig` |
| `Foreach*` | Iteration variants (WithError / WithPath / Nested / File) | `ForeachNestedWithError` |
| `Stream*` | Streaming variants (Into / Parallel / File / Chunked) | `StreamJSONLParallel` |
| `{Verb}Hook` | Hook factories | `LoggingHook`, `ValidationHook` |

## See Also

- [Quick Start](../getting-started/) -- installation and basic usage
- [Processor Guide](../getting-started/processor-guide) -- when to use a processor
- [Path Expression Syntax](../getting-started/path-syntax) -- path query syntax
- [Examples](../examples/) -- real-world code examples
- [Large File Handling](../streaming/large-files) -- streaming guide
