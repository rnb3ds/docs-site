---
sidebar_label: "Overview"
title: "Environment Variables - CyberGo env | Secure Config Management"
description: "CyberGo env is a high-security Go environment variable management library with .env, JSON, YAML multi-format auto-detection, type-safe conversion, SecureValue memory locking with auto-zeroing, sharded-lock thread safety, ${VAR} variable expansion, env-tag struct mapping, and full audit logging for microservices and cloud-native configuration."
---

# env

A high-security Go environment variable management library supporting `.env`, JSON, and YAML formats, with thread safety, audit logging, and secure storage.

## Core Features

- **Multi-format support** - `.env`, JSON, YAML auto-detection
- **Type safety** - automatic type conversion and validation
- **Thread safety** - concurrent access with sharded locks
- **Secure storage** - memory locking and auto-zeroing for sensitive values
- **Audit logging** - complete operation tracking
- **Variable expansion** - `${VAR}` syntax support
- **Struct mapping** - tag-driven configuration binding

## Navigate by Use Case

Not sure where to start? Choose by your need:

| I want to... | Where to look |
|--------------|---------------|
| Get started in 5 minutes | [Quick Start](/en/env/getting-started/) |
| Store passwords and keys securely | [Security Overview](/en/env/security/) → [SecureValue](/en/env/api-reference/secure-value) |
| Prevent sensitive data from being swapped to disk | [Memory Locking](/en/env/security/memory-locking) |
| Safely handle sensitive data in logs | [Data Masking](/en/env/security/data-masking) |
| Map environment variables to a struct | [Struct Mapping](/en/env/guides/struct-mapping) |
| Load JSON/YAML config files | [Multi-format Config](/en/env/guides/multi-format) |
| Configure variable references and reuse | [Variable Expansion](/en/env/guides/variable-expansion) |
| Serialize/export configuration | [Serialization](/en/env/guides/serialization) |
| Record security audit logs | [Audit Logging](/en/env/guides/audit-logging) |
| Handle and match errors | [Error Handling](/en/env/guides/error-handling) |
| Write unit tests | [Testing](/en/env/guides/testing) |
| Extend with custom file formats | [Custom Parser](/en/env/guides/custom-parser) |
| Security checks before going live | [Production Checklist](/en/env/security/production-checklist) |
| See common code snippets | [Cheat Sheet](/en/env/getting-started/cheatsheet) |
| Find answers to common questions | [FAQ](/en/env/reference/faq) |

## Key Features Overview

| Feature | Description |
|---------|-------------|
| [Type Conversion](/en/env/getting-started/) | GetString, GetInt, GetBool, GetDuration, GetSlice |
| [Struct Mapping](/en/env/guides/struct-mapping) | Tag-driven configuration binding |
| [Secure Storage](/en/env/api-reference/secure-value) | Memory protection for sensitive values |
| [Multi-format Loading](/en/env/guides/multi-format) | .env, JSON, YAML |

## Quick Navigation

<div class="vp-features">

### Getting Started
- [Quick Start](/en/env/getting-started/) - 5-minute tutorial
- [Cheat Sheet](/en/env/getting-started/cheatsheet) - Common code snippets

### API Reference
- [Package Functions](/en/env/api-reference/functions) - Complete API documentation
- [Loader](/en/env/api-reference/loader) - Loader methods
- [SecureValue](/en/env/api-reference/secure-value) - Secure value handling

### Security
- [Security Overview](/en/env/security/) - Security architecture and best practices

</div>
