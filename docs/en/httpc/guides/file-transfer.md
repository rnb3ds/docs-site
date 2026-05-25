---
title: "File Upload and Download - HTTPC"
description: "HTTPC file upload and download guide: WithFile simple upload, WithFormData multipart multi-file upload, DownloadFile basic download, DownloadWithOptions with progress callbacks, resumable downloads with ResumeDownload, SHA-256 checksums, and UNC path security protection."
---

# File Upload and Download

## File Upload

### Simple File Upload

```go
fileContent, err := os.ReadFile("document.pdf")
if err != nil {
    log.Fatal(err)
}

result, err := httpc.Post("https://api.example.com/upload",
    httpc.WithFile("file", "document.pdf", fileContent),
)
```

### Multipart Form

Upload files with accompanying form fields:

```go
form := &httpc.FormData{
    Fields: map[string]string{
        "title": "My Document",
        "type":  "pdf",
    },
    Files: map[string]*httpc.FileData{
        "file": {
            Filename: "report.pdf",
            Content:  fileContent,
        },
    },
}

result, err := httpc.Post("https://api.example.com/upload",
    httpc.WithFormData(form),
)
```

### Multi-File Upload

```go
form := &httpc.FormData{
    Fields: map[string]string{
        "description": "Batch upload",
    },
    Files: map[string]*httpc.FileData{
        "file1": {Filename: "doc1.pdf", Content: content1},
        "file2": {Filename: "doc2.pdf", Content: content2},
        "file3": {Filename: "image.png", Content: content3},
    },
}

result, err := httpc.Post(url, httpc.WithFormData(form))
```

### Binary Upload

```go
data, _ := os.ReadFile("data.bin")
result, err := httpc.Post(url,
    httpc.WithBinary(data, "application/octet-stream"),
)
```

## File Download

### Basic Download

```go
result, err := httpc.DownloadFile(
    "https://example.com/file.zip",
    "/tmp/file.zip",
)
if err != nil {
    log.Fatal(err)
}

fmt.Printf("Download complete: %d bytes\n", result.BytesWritten)
fmt.Printf("Duration: %v\n", result.Duration)
```

### With Progress Callback

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/file.zip"
cfg.Overwrite = true
cfg.ProgressCallback = func(downloaded, total int64, speed float64) {
    pct := float64(downloaded) / float64(total) * 100
    fmt.Printf("\rDownloading: %.1f%% (%.2f MB/s)", pct, float64(speed)/1024/1024)
}

result, err := httpc.DownloadWithOptions("https://example.com/file.zip", cfg)
if err != nil {
    log.Fatal(err)
}

fmt.Printf("\nDownload complete: %d bytes, average speed %.2f MB/s\n",
    result.BytesWritten,
    float64(result.AverageSpeed)/1024/1024,
)
```

### Resumable Downloads

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/large-file.zip"
cfg.ResumeDownload = true

result, err := httpc.DownloadWithOptions(url, cfg)
if err != nil {
    log.Fatal(err)
}

if result.Resumed {
    fmt.Printf("Resumed download complete: recovered from breakpoint\n")
}
```

:::tip
Resumable downloads depend on server support for the `Range` request header. If the server does not support it (returns 200 instead of 206), an error is returned to protect the existing partial file.
:::

### With Context Control

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
defer cancel()

result, err := httpc.DownloadFileWithContext(ctx, url, "/tmp/file.zip")
if err != nil {
    if errors.Is(err, context.DeadlineExceeded) {
        log.Println("Download timed out")
    }
    log.Fatal(err)
}
```

## Security Protection

File downloads include multiple layers of built-in security:

| Protection Layer | Description |
|------------------|-------------|
| Path validation | Blocks UNC paths, control characters, path traversal |
| System path protection | Blocks writing to `/etc/`, `C:\Windows\`, and other system directories |
| Symlink detection | Prevents symlink attacks |
| File size limits | Subject to `MaxResponseBodySize` limit |

## Domain Client Downloads

Domain client downloads automatically capture response cookies into the session:

```go
dc, _ := httpc.NewDomain("https://api.example.com")
defer dc.Close()

dc.SetHeader("Authorization", "Bearer "+token)

// Download with automatic session management
result, err := dc.DownloadFile("/files/report.pdf", "/tmp/report.pdf")
```

## Next Steps

- [File Download API](../api-reference/download) - Complete download API reference
- [Domain Client and Sessions](./domain-session) - Session management
- [Request and Response](./request-response) - Basic request guide
