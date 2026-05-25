---
title: "Package Functions - HTTPC"
description: "HTTPC package-level functions and client methods API reference: seven HTTP methods including Get/Post, New client creation, four download functions, SetSecurityWarnOutput helper function, and NewDomain domain client creation."
---

# Package Functions

## Package-Level HTTP Methods

No need to create a client - send requests directly. Uses a lazily initialized default client internally.

### Get

```go
func Get(url string, options ...RequestOption) (*Result, error)
```

Sends a GET request.

```go
result, err := httpc.Get("https://api.example.com/data",
    httpc.WithBearerToken(token),
    httpc.WithQuery("page", 1),
)
```

### Post

```go
func Post(url string, options ...RequestOption) (*Result, error)
```

Sends a POST request.

```go
result, err := httpc.Post("https://api.example.com/users",
    httpc.WithJSON(map[string]any{"name": "test"}),
)
```

### Put / Patch / Delete / Head / Options

```go
func Put(url string, options ...RequestOption) (*Result, error)
func Patch(url string, options ...RequestOption) (*Result, error)
func Delete(url string, options ...RequestOption) (*Result, error)
func Head(url string, options ...RequestOption) (*Result, error)
func Options(url string, options ...RequestOption) (*Result, error)
```

### Request

```go
func Request(ctx context.Context, method, url string, options ...RequestOption) (*Result, error)
```

Generic request method with context support for timeout and cancellation control.

```go
ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()

result, err := httpc.Request(ctx, "GET", "https://api.example.com/data")
```

## Client Methods

The Client interface provides the same HTTP methods as package-level functions, plus a `Request` method with context.

### New

```go
func New(config ...*Config) (Client, error)
```

Creates a new HTTP client. Pass no config or `nil` to use `DefaultConfig()`.

```go
client, err := httpc.New()
client, err := httpc.New(nil)
client, err := httpc.New(httpc.SecureConfig())

cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 60 * time.Second
client, err := httpc.New(cfg)
```

### Client HTTP Methods

```go
result, err := client.Get(url, options...)
result, err := client.Post(url, options...)
result, err := client.Put(url, options...)
result, err := client.Patch(url, options...)
result, err := client.Delete(url, options...)
result, err := client.Head(url, options...)
result, err := client.Options(url, options...)
result, err := client.Request(ctx, "GET", url, options...)
```

### Close

Client interface method that releases resources held by the client (connection pool, Transport). Cannot be used after calling.

```go
// Client interface method
Close() error
```

```go
client, _ := httpc.New()
defer client.Close()
```

## Default Client Management

### SetDefaultClient

```go
func SetDefaultClient(client Client) error
```

Sets a custom client as the default client for package-level functions. The old default client is automatically closed.

:::warning
Only accepts clients created via `httpc.New()`. Cannot set a closed client.
:::

```go
client, _ := httpc.New(httpc.PerformanceConfig())
httpc.SetDefaultClient(client)

// Subsequent package-level functions use PerformanceConfig
result, _ := httpc.Get(url)
```

### CloseDefaultClient

```go
func CloseDefaultClient() error
```

Closes the default client and resets it. A new client will be created on the next package-level function call.

## Download Functions

Package-level download functions use the default client. The Client interface also provides methods with the same names.

### DownloadFile

```go
func DownloadFile(url string, filePath string, options ...RequestOption) (*DownloadResult, error)
```

Downloads a file to the specified path using the default client.

```go
// Package-level function
result, err := httpc.DownloadFile("https://example.com/file.zip", "/tmp/file.zip")

// Client interface method
result, err := client.DownloadFile("https://example.com/file.zip", "/tmp/file.zip")
```

### DownloadWithOptions

```go
func DownloadWithOptions(url string, downloadOpts *DownloadConfig, options ...RequestOption) (*DownloadResult, error)
```

File download with configuration, supporting resumable downloads and progress callbacks.

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/file.zip"
cfg.Overwrite = true
cfg.ResumeDownload = true
cfg.ProgressCallback = func(downloaded, total int64, speed float64) {
    fmt.Printf("\r%.1f%%", float64(downloaded)/float64(total)*100)
}

// Package-level function
result, err := httpc.DownloadWithOptions(url, cfg)
// Client interface method
result, err = client.DownloadWithOptions(url, cfg)
```

### DownloadFileWithContext

```go
func DownloadFileWithContext(ctx context.Context, url string, filePath string, options ...RequestOption) (*DownloadResult, error)
```

File download with context control, supporting timeout and cancellation.

```go
// Package-level function
result, err := httpc.DownloadFileWithContext(ctx, url, "/tmp/file.zip")
// Client interface method
result, err = client.DownloadFileWithContext(ctx, url, "/tmp/file.zip")
```

### DownloadWithOptionsWithContext

```go
func DownloadWithOptionsWithContext(ctx context.Context, url string, downloadOpts *DownloadConfig, options ...RequestOption) (*DownloadResult, error)
```

File download with configuration and context control.

```go
// Package-level function
result, err := httpc.DownloadWithOptionsWithContext(ctx, url, downloadOpts)
// Client interface method
result, err = client.DownloadWithOptionsWithContext(ctx, url, downloadOpts)
```

## Helper Functions

### SetSecurityWarnOutput

```go
func SetSecurityWarnOutput(w io.Writer)
```

Redirects security warning output (such as `TestingConfig`, `InsecureSkipVerify` warnings). Pass `io.Discard` to silence all warnings.

```go
// Silence all security warnings
httpc.SetSecurityWarnOutput(io.Discard)

// Redirect to custom log
httpc.SetSecurityWarnOutput(log.Writer())
```

:::warning
This function is primarily for testing. Production environments should use `SecureConfig()` or `DefaultConfig()` rather than suppressing warnings.
:::

## Domain Client

### NewDomain

```go
func NewDomain(baseURL string, config ...*Config) (DomainClienter, error)
```

Creates a domain-scoped client with automatic cookie and header management.

```go
dc, err := httpc.NewDomain("https://api.example.com")
defer dc.Close()

dc.SetHeader("Authorization", "Bearer "+token)
result, err := dc.Get("/users")
```

## See Also

- [Result](./result) - Response result types and methods
- [Request Options](./options) - Request configuration options
- [Domain Client](./domain-client) - Domain-scoped client
- [File Download](./download) - Download functions and types
