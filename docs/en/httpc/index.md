---
sidebar_label: "Overview"
title: "HTTP Client - CyberGo HTTPC | Secure High-Performance"
description: "CyberGo HTTPC is a secure, high-performance HTTP client library for Go with TLS 1.2+ enforcement, SSRF protection, smart exponential-backoff retries, onion-model middleware chains, connection pooling, and automatic Result lifecycle management for microservice and high-concurrency API scenarios."
---

# HTTPC

A secure HTTP client library that is secure by default, with built-in smart retries, a middleware chain, and object-pool reuse.

## Features

- **TLS 1.2+** - Enforces a minimum TLS version, defaults to TLS 1.2-1.3
- **SSRF Protection** - Blocks private IP connections by default, with configurable CIDR exemptions
- **Smart Retries** - Exponential backoff with jitter and customizable retry strategies
- **Connection Pool Management** - High-performance connection reuse with HTTP/2 support
- **Middleware Chain** - Built-in middleware for logging, audit, metrics, recovery, request IDs, and more
- **File Downloads** - Resumable downloads, progress callbacks, and checksum verification
- **DNS-over-HTTPS** - Built-in DoH resolution to reduce DNS hijacking risk
- **Object Pool Reuse** - Internal response objects and string builders are pooled via sync.Pool to reduce GC pressure

## Installation

```bash
go get github.com/cybergodev/httpc
```

## 30-Second Experience

```go
package main

import (
    "fmt"
    "github.com/cybergodev/httpc"
)

func main() {
    result, err := httpc.Get("https://httpbin.org/get")
    if err != nil {
        panic(err)
    }

    fmt.Println(result.StatusCode()) // 200
}
```

## Where to Start

Choose a reading path based on your goal:

| Goal | Recommended |
|------|-------------|
| Get started in 5 minutes | [Quick Start](./getting-started/) |
| Hands-on tutorial in 30 minutes | [Tutorial](./guides/tutorial) |
| Look up a usage pattern | [Cheat Sheet](./getting-started/cheatsheet) |
| Understand security features | [Security Overview](./security/) |
| Look up API signatures | [API Reference](./api-reference/) |

## Core Concepts

HTTPC offers three usage modes, from simple to flexible:

```text
Package-level functions    Client instance               Domain client
httpc.Get()  →  client, _ := httpc.NewDefault()  →  dc, _ := httpc.NewDomainDefault(url)
One-off requests       Custom config/middleware       Session management/automatic cookie handling
```

### Configuration Presets

| Preset | Use Case |
|--------|----------|
| `DefaultConfig()` | General scenarios with secure defaults |
| `SecureConfig()` | Security-sensitive scenarios with strict timeouts |
| `PerformanceConfig()` | High throughput with a large connection pool |
| `TestingConfig()` | Test environments with security checks disabled |
| `MinimalConfig()` | Lightweight scripts with no retries or redirects |
