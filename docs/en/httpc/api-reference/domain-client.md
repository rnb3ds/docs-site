---
title: "Domain Client - HTTPC"
description: "HTTPC domain client API reference: NewDomain creation function, seven HTTP methods including Get/Post and Request generic method, four download methods, URL auto-concatenation rules, DomainClienter interface with SetHeader/SetCookie session management, and Close lifecycle."
---

# Domain Client

The domain client provides request management for a specific domain, automatically maintaining cookies and headers.

## NewDomain

```go
func NewDomain(baseURL string, config ...*Config) (DomainClienter, error)
```

Creates a domain-scoped client. Cookies are automatically enabled.

```go
// Using default configuration
dc, err := httpc.NewDomain("https://api.example.com")
if err != nil {
    log.Fatal(err)
}
defer dc.Close()

// Using custom configuration
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 60 * time.Second
dc, err := httpc.NewDomain("https://api.example.com", cfg)
if err != nil {
    log.Fatal(err)
}
defer dc.Close()
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `baseURL` | `string` | Base URL (must include scheme and host) |
| `config` | `...*Config` | Optional configuration; uses DefaultConfig() if not provided |

**Returns:** `DomainClienter` interface (not the concrete `*DomainClient` type).

## HTTP Methods

All methods accept relative paths or absolute URLs:

```go
// Relative path: auto-concatenated with baseURL
result, err := dc.Get("/users")
result, err := dc.Post("/users", httpc.WithJSON(data))
result, err := dc.Put("/users/1", httpc.WithJSON(data))
result, err := dc.Patch("/users/1", httpc.WithJSON(data))
result, err := dc.Delete("/users/1")
result, err := dc.Head("/users/1")
result, err := dc.Options("/users")

// Absolute URL: used directly
result, err := dc.Get("https://other-api.com/data")
```

### Request

```go
result, err := dc.Request(ctx, "GET", "/users", options...)
```

Generic request method with context support for timeout and cancellation control.

## Download Methods

```go
// Basic download
result, err := dc.DownloadFile("/files/report.pdf", "/tmp/report.pdf")

// Download with configuration
result, err := dc.DownloadWithOptions("/files/report.pdf", downloadOpts)

// With context
result, err := dc.DownloadFileWithContext(ctx, "/files/report.pdf", "/tmp/report.pdf")
result, err := dc.DownloadWithOptionsWithContext(ctx, "/files/report.pdf", downloadOpts)
```

Download response cookies are automatically captured into the session.

## Access Methods

```go
dc.URL()      // string - Base URL
dc.Domain()   // string - Domain (without port)
dc.Session()  // *SessionManager - Underlying session manager
dc.Close()    // error - Close client and release resources
```

## URL Concatenation Rules

| Input Path | Result (baseURL = `https://api.example.com/v1`) |
|------------|------|
| `/users` | `https://api.example.com/v1/users` |
| `users` | `https://api.example.com/v1/users` |
| `/users?page=1` | `https://api.example.com/v1/users?page=1` |
| `https://other.com/api` | `https://other.com/api` (absolute URL) |

:::warning
Only `http://` and `https://` protocol absolute URLs are allowed; other protocols are rejected (SSRF prevention).
:::

## DomainClienter Interface

```go
type DomainClienter interface {
    Client

    URL() string
    Domain() string

    SetHeader(key, value string) error
    SetHeaders(headers map[string]string) error
    DeleteHeader(key string)
    ClearHeaders()
    GetHeaders() map[string]string

    SetCookie(cookie *http.Cookie) error
    SetCookies(cookies []*http.Cookie) error
    DeleteCookie(name string)
    ClearCookies()
    GetCookies() []*http.Cookie
    GetCookie(name string) *http.Cookie

    Session() *SessionManager
}
```

Using the interface type rather than the concrete type is recommended for easier testing and implementation swapping.

## See Also

- [Session Management](./session) - Detailed SessionManager reference
- [Domain Client and Sessions](../guides/domain-session) - Usage guide
- [Interface Definitions](./interfaces) - Client, Doer interface reference
