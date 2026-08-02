---
sidebar_label: "Quick Start"
title: "Quick Start - CyberGo HTTPC | 5-Minute Setup"
description: "HTTPC quick start guide: go get installation and project setup, sending GET/POST requests and handling responses, choosing among five configuration presets, JSON parsing and type binding, Bearer Token authentication and ClientError classification, and getting started with the secure HTTP client library in five minutes."
sidebar_position: 1
---

# Quick Start

## Installation

```bash
go get github.com/cybergodev/httpc
```

## Basic Requests

Use package-level functions directly without creating a client:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    result, err := httpc.Get("https://httpbin.org/get")
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println(result.StatusCode()) // 200
    fmt.Println(result.Body())       // Response body
}
```

Supported HTTP methods: `Get`, `Post`, `Put`, `Patch`, `Delete`, `Head`, `Options`.

## Creating a Client

When you need custom configuration, create a client instance:

```go
client, err := httpc.NewDefault()
if err != nil {
    log.Fatal(err)
}
defer client.Close()

result, err := client.Get("https://httpbin.org/get")
```

### Configuration Presets

| Config | Use Case | Characteristics |
|--------|----------|-----------------|
| `DefaultConfig()` | General scenarios | Secure defaults, SSRF protection enabled |
| `SecureConfig()` | Security-sensitive scenarios | Disables auto-redirects, strict timeouts |
| `PerformanceConfig()` | High-throughput scenarios | Large connection pool, long timeouts, cookies enabled |
| `TestingConfig()` | Test environments | Disables security checks and HTTP/2, cookies enabled |
| `MinimalConfig()` | Lightweight requests | No retries, no redirects |

```go
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 60 * time.Second

client, err := httpc.New(cfg)
```

## Response Handling

```go
result, err := client.Get("https://httpbin.org/json")
if err != nil {
    log.Fatal(err)
}

// Status checks
result.StatusCode()     // 200
result.IsSuccess()      // true (2xx)
result.IsClientError()  // false (4xx)
result.IsServerError()  // false (5xx)

// JSON parsing
var data map[string]any
if err := result.Unmarshal(&data); err != nil {
    log.Fatal(err)
}
```

## Sending Data

```go
// JSON
result, err := client.Post("https://httpbin.org/post",
    httpc.WithJSON(map[string]any{"name": "test"}),
)
```

```go
// Form
result, err := client.Post("https://httpbin.org/post",
    httpc.WithForm(map[string]string{"username": "admin"}),
)
```

```go
// With authentication
result, err := client.Get("https://api.example.com/data",
    httpc.WithBearerToken("my-token"),
)
```

## Error Handling

HTTPC distinguishes between **network-layer errors** and **HTTP status codes**:

```go
result, err := client.Get("https://api.example.com/data")
if err != nil {
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        log.Printf("Error code: %s", clientErr.Code())
    }
    log.Fatal(err)
}

// HTTP status codes must be checked manually
switch {
case result.IsSuccess():
    // 2xx success
case result.IsClientError():
    log.Printf("Client error: %d", result.StatusCode())
case result.IsServerError():
    log.Printf("Server error: %d", result.StatusCode())
}
```

:::tip
4xx/5xx responses are not returned as `error`; check them via methods like `result.IsSuccess()`. See [Error Handling](../guides/error-handling) for details.
:::

## Next Steps

- **[Tutorial](../guides/tutorial)** - Build a GitHub API client in 30 minutes
- **[Core Concepts](./concepts)** - The two-layer architecture, configuration system, and design decisions
- **[Request & Response](../guides/request-response)** - Complete request options and response handling
- **[Basic Examples](../examples/basic-usage)** - Real-world use cases like GET/POST/middleware
- **[Cheat Sheet](./cheatsheet)** - Quick reference for common operations
- **[Security](../security/)** - Security best practices
