---
sidebar_label: "Performance"
title: "Performance - CyberGo env | High-Concurrency Tuning"
description: "Performance optimization guide for CyberGo env, covering RWMutex read-write locks and sharded locks for concurrency safety, sync.Pool object pooling to significantly reduce allocations, mlock memory locking overhead tradeoffs, and large-file streaming parsing, with benchmark comparisons, concurrent throughput analysis, and MaxFileSize/MaxVariables tuning recommendations."
sidebar_position: 1
---

# Performance

The env library is optimized for high-performance scenarios. This document covers performance-related features including concurrency safety, object pooling, and memory management.

## Concurrency Safety

### Thread Safety Guarantee

All methods of `Loader` are thread-safe:

```go
loader, _ := env.New(env.DefaultConfig())
defer loader.Close()

var wg sync.WaitGroup

// Concurrent reads
for i := 0; i < 100; i++ {
    wg.Add(1)
    go func() {
        defer wg.Done()
        loader.GetString("KEY")
    }()
}

// Concurrent writes
for i := 0; i < 100; i++ {
    wg.Add(1)
    go func(n int) {
        defer wg.Done()
        loader.Set(fmt.Sprintf("KEY_%d", n), "value")
    }(i)
}

wg.Wait()
```

### Package-level Function Thread Safety

Package-level functions use the global loader and are equally thread-safe:

```go
var wg sync.WaitGroup

for i := 0; i < 100; i++ {
    wg.Add(1)
    go func() {
        defer wg.Done()
        env.GetString("KEY", "default")
    }()
}

wg.Wait()
```

### Internal Implementation

The library uses sharded storage to reduce lock contention:

```text
┌─────────────────────────────────────────┐
│          Loader (8 shards)              │
├─────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐    ┌────────┐ │
│  │ Shard 0 │ │ Shard 1 │... │ Shard 7│ │
│  │  Lock   │ │  Lock   │    │  Lock  │ │
│  │  Data   │ │  Data   │    │  Data  │ │
│  └─────────┘ └─────────┘    └────────┘ │
└─────────────────────────────────────────┘
```

- Keys are distributed across shards based on hash value
- Each shard has an independent lock
- Reduces lock contention, improves concurrency performance

## Object Pool

### Why Use Object Pooling

Frequent creation and destruction of objects increases GC pressure:

```text
Without object pool:
Create object → Use → GC collect → Create object → Use → GC collect ...

With object pool:
Create object → Use → Return to pool → Get → Use → Return to pool ...
```

### SecureValue Pool

`SecureValue` objects use pool management:

```go
// Get a SecureValue (may be reused from pool)
secret := env.GetSecure("API_KEY")

// Use (Reveal returns plaintext, String/Masked return masks)
value := secret.Reveal()

// Release back to pool
secret.Close()  // or secret.Release()
```

### Proper Object Pool Usage

**Release promptly:**

```go
func processData() {
    secret := env.GetSecure("SECRET")
    defer secret.Close()  // Ensure release

    // Use secret...
}
```

**Do not hold references:**

```go
// Wrong: holding a reference to a released object
var globalSecret *env.SecureValue

func init() {
    globalSecret = env.GetSecure("KEY")
    globalSecret.Close()  // After release, the object may be reused
}

func later() {
    // Dangerous: globalSecret may already be in use by other code
    globalSecret.String()
}

// Correct: get it each time it's needed
func getSecret() string {
    secret := env.GetSecure("KEY")
    defer secret.Close()
    return secret.Reveal()
}
```

**Check closed state:**

```go
secret := env.GetSecure("KEY")

// Check before use
if secret.IsClosed() {
    // Object has been closed, cannot be used
}

// Close after use
secret.Close()

// Check after closing
if secret.IsClosed() {
    // Already closed
}
```

## Memory Safety

### Memory Locking

Enable memory locking to prevent sensitive data from being swapped to disk:

```go
// Check platform support
if env.IsMemoryLockSupported() {
    env.SetMemoryLockEnabled(true)
}
```

**Platform support:**

| Platform | Supported |
|----------|-----------|
| Linux | ✅ |
| macOS | ✅ |
| Windows | ✅ |
| FreeBSD | ✅ |
| wasm | ❌ |

:::tip
See [SecureValue API - Memory Lock Configuration](/en/env/api-reference/secure-value#memory-lock-configuration) for complete configuration documentation.
:::

### Strict Mode

In strict mode, memory locking failure causes an error:

```go
env.SetMemoryLockStrict(true)

secret, err := env.NewSecureValueStrict("sensitive_data")
if err != nil {
    // Memory locking failed
}
```

### Secure Zeroing

`SecureValue` automatically zeros memory when closed:

```go
secret := env.GetSecure("PASSWORD")
// Internal storage: ['p', 'a', 's', 's', ...]

secret.Close()
// Internal storage: [0, 0, 0, 0, ...]
```

Manual zeroing of byte slices:

```go
sensitiveBytes := []byte("secret")
env.ClearBytes(sensitiveBytes)
// sensitiveBytes is now all zeros
```

## Performance Patterns

### Read-only After Initialization

The most efficient pattern: load configuration at startup, read-only at runtime:

```go
var config *Config

func init() {
    env.Load(".env")

    config = &Config{}
    env.ParseInto(config)
}

// Safe to read from any goroutine
func getValue() string {
    return config.Key
}
```

### Dynamic Configuration Refresh

Pattern for when you need to dynamically update configuration:

```go
type ConfigManager struct {
    loader *env.Loader
    mu     sync.RWMutex
}

func (m *ConfigManager) Refresh() error {
    m.mu.Lock()
    defer m.mu.Unlock()

    return m.loader.LoadFiles(".env")
}

func (m *ConfigManager) Get(key string) string {
    m.mu.RLock()
    defer m.mu.RUnlock()

    return m.loader.GetString(key)
}
```

### Reduce Lock Hold Time

```go
// Not recommended: time-consuming operations inside lock
func (l *Loader) ProcessValue(key string) {
    value := l.GetString(key)
    // Time-consuming operations...
    processValue(value)
}

// Recommended: quick read, process outside lock
func ProcessValue(key string) {
    value := loader.GetString(key)  // Quick get
    go processValue(value)          // Async processing
}
```

### Batch Operations

```go
// Get all needed values at once
func LoadAllConfig(loader *env.Loader) *Config {
    return &Config{
        Host:    loader.GetString("HOST"),
        Port:    loader.GetInt("PORT"),
        Debug:   loader.GetBool("DEBUG"),
        Timeout: loader.GetDuration("TIMEOUT"),
    }
}
```

### Avoid Frequent Calls

```go
// Not recommended: reading on every request
func Handler(w http.ResponseWriter, r *http.Request) {
    apiKey := env.GetString("API_KEY")  // Locks on every request
    // ...
}

// Recommended: cache at startup
var apiKey string

func init() {
    env.Load(".env")
    apiKey = env.GetString("API_KEY")
}

func Handler(w http.ResponseWriter, r *http.Request) {
    // Use cached value directly
    // ...
}
```

## Performance Impact

### Object Pool Benefits

| Operation | Without Pool | With Pool |
|-----------|-------------|-----------|
| Allocations | N | ~constant |
| GC pressure | High | Low |
| Latency | Unstable | Stable |

### Memory Locking Overhead

Memory locking (Linux `mlock` / Windows `VirtualLock`) incurs a one-time extra syscall overhead only when creating a `SecureValue`; read operations (`Reveal` / `String` / `Masked`) have no difference. It is recommended to keep `SecureValue` small and short-lived — call `Close()` / `Release()` immediately after use to return to the object pool, avoiding holding large blocks of locked memory for extended periods.

## Benchmarks

### Read Performance

```go
func BenchmarkConcurrentRead(b *testing.B) {
    loader, _ := env.New(env.DefaultConfig())
    loader.Set("KEY", "value")

    b.RunParallel(func(pb *testing.PB) {
        for pb.Next() {
            loader.GetString("KEY")
        }
    })
}
```

### Write Performance

```go
func BenchmarkConcurrentWrite(b *testing.B) {
    loader, _ := env.New(env.DefaultConfig())

    var i int64
    b.RunParallel(func(pb *testing.PB) {
        for pb.Next() {
            n := atomic.AddInt64(&i, 1)
            loader.Set(fmt.Sprintf("KEY_%d", n), "value")
        }
    })
}
```

### Mixed Read/Write

```go
func BenchmarkMixedReadWrite(b *testing.B) {
    loader, _ := env.New(env.DefaultConfig())
    loader.Set("KEY", "value")

    b.RunParallel(func(pb *testing.PB) {
        i := 0
        for pb.Next() {
            if i%10 == 0 {
                loader.Set("KEY", "new_value")
            } else {
                loader.GetString("KEY")
            }
            i++
        }
    })
}
```

## Caveats

### Avoid Blocking Inside Locks

```go
// Dangerous: may cause deadlock
func (l *Loader) BadMethod() {
    // Calling potentially blocking operations inside lock
    l.Set("KEY", computeValue())  // computeValue may be slow
}

// Safe: compute first, then set
func GoodMethod() {
    value := computeValue()  // Compute outside lock
    loader.Set("KEY", value)  // Quick set
}
```

### Concurrent Access After Close

```go
loader, _ := env.New(cfg)

// Start goroutine
go func() {
    time.Sleep(1 * time.Second)
    loader.GetString("KEY")  // Returns empty string (GetString doesn't return error)
}()

loader.Close()  // Main goroutine closes
```

### Global Loader Reset

```go
// Not concurrency-safe: do not call at runtime
env.ResetDefaultLoader()

// Safe: only call during tests or startup
func init() {
    env.ResetDefaultLoader()
    env.Load(".env")
}
```

## Related Documentation

- [SecureValue API](/en/env/api-reference/secure-value) - Secure value handling and memory locking
- [Loader API](/en/env/api-reference/loader) - Loader methods
- [Testing](/en/env/guides/testing) - Benchmark examples
