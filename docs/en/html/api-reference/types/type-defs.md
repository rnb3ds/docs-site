---
sidebar_label: "Data Types"
title: "Types - CyberGo html | Data Type Reference"
description: "CyberGo html data types: field reference for Result, ImageInfo, LinkInfo, LinkResource, Statistics, BatchResult, and other core types."
sidebar_position: 2
---

# Types

## Result

Extraction result containing text, metadata, and media information.

```go
type Result struct {
    Text           string        `json:"text"`
    Title          string        `json:"title"`
    Images         []ImageInfo   `json:"images,omitempty"`
    Links          []LinkInfo    `json:"links,omitempty"`
    Videos         []VideoInfo   `json:"videos,omitempty"`
    Audios         []AudioInfo   `json:"audios,omitempty"`
    ProcessingTime time.Duration `json:"-"`       // Processing duration (excluded from standard serialization)
    WordCount      int           `json:"word_count"`
    ReadingTime    time.Duration `json:"-"`       // Estimated reading time (excluded from standard serialization)
}
```

### MarshalJSON

Custom JSON serialization. `ProcessingTime` and `ReadingTime` have `json:"-"` tags (standard serialization skips them), but the custom `MarshalJSON()` method includes them as millisecond values.

```go
func (r *Result) MarshalJSON() ([]byte, error)
```

:::warning
`Result` **does not implement `UnmarshalJSON`**. If you deserialize the output of `MarshalJSON()` back into a `Result`, duration fields such as `ProcessingTime` and `ReadingTime` **will be lost** — the JSON output key names (`processing_time_ms`, `reading_time_ms`) do not match the struct field names, so they cannot be restored.

This is **intentional**: the JSON format is designed for external consumption (e.g., API responses, logs, frontend display), not for bidirectional serialization.
:::

## ImageInfo

Image information.

```go
type ImageInfo struct {
    URL          string `json:"url"`           // Image URL
    Alt          string `json:"alt"`           // Alternative text
    Title        string `json:"title"`         // Title
    Width        string `json:"width"`         // Width
    Height       string `json:"height"`        // Height
    IsDecorative bool   `json:"is_decorative"` // Whether the image is decorative
    Position     int    `json:"position"`      // Position in the document
}
```

### Field Semantics

| Field | Description |
|-------|-------------|
| `URL` | The `src` attribute value of the image; only valid URLs (passing `IsValidURL` validation) are included — `<img>` with an invalid URL does not appear in the result |
| `Alt` | The original `alt` attribute; when empty, `IsDecorative` is `true` |
| `Title` | The original `title` attribute (not the page title) |
| `Width`/`Height` | The **raw strings** from the HTML attributes (e.g. `"640"`, `"50%"`), not parsed into numbers — different pages may use inconsistent formats |
| `IsDecorative` | `true` when `Alt` is empty; can be used to identify and skip decorative images |
| `Position` | 1-based index in the document; when `PreserveImages = false`, the entire `Images` slice is empty |

:::warning Width/Height are string types
`Width` and `Height` are `string` types, not `int`. They preserve the original representation from the HTML source (which may include units, percentages, etc.). Parse them into numbers yourself when needed.
:::

## LinkInfo

Link information.

```go
type LinkInfo struct {
    URL        string `json:"url"`         // Link URL
    Text       string `json:"text"`        // Link text
    Title      string `json:"title"`       // Link title
    IsExternal bool   `json:"is_external"` // Whether it is an external link (determined by whether the URL itself is an absolute external URL, not by comparison with BaseURL)
    IsNoFollow bool   `json:"is_nofollow"` // Whether the link is nofollow
    Position   int    `json:"position"`    // Position in the document
}
```

### Field Semantics

| Field | Description |
|-------|-------------|
| `URL` | The `href` attribute value; only valid URLs (passing `IsValidURL` validation) are included — an `<a>` with an invalid URL still consumes a Position but is not added to the slice |
| `Text` | Concatenation of all text nodes inside the `<a>` tag (recursive `GetTextContent`) |
| `Title` | The original `title` attribute (not the link text) |
| `IsExternal` | Determined by whether the URL itself is an absolute external address, **not by domain comparison with `BaseURL`** — this differs from the internal/external link determination in `ExtractAllLinks` |
| `IsNoFollow` | `true` when the `rel` attribute contains `nofollow` (case-insensitive, ASCII-fold matching) |
| `Position` | 1-based index in the document; invalid `<a>` (illegal or missing href) still consume index numbers but are not added to the slice, so Position values may be non-contiguous |

## VideoInfo

Video information.

```go
type VideoInfo struct {
    URL      string `json:"url"`      // Video URL
    Type     string `json:"type"`     // Video type
    Poster   string `json:"poster"`   // Poster image URL
    Width    string `json:"width"`    // Width
    Height   string `json:"height"`   // Height
    Duration string `json:"duration"` // Duration
}
```

### Type Field Value Rules

| Type value | Meaning | When it occurs |
|-----------|---------|----------------|
| `"embed"` | A video page referenced by an iframe | Embedded players such as YouTube, Vimeo, Youku, Bilibili |
| MIME type (e.g. `"video/mp4"`) | Video file container | Attribute value from `<source type="video/mp4">` |
| Empty string | No type detected | `<video src="...">` specifying the source directly with no `<source>` child element |

:::tip Three sources of video extraction
Video extraction runs in three steps — raw HTML scan, DOM traversal, regex fallback — with deduplication at each step. See [Media Extraction Guide](../../guides/core-features/media-extraction).
:::

## AudioInfo

Audio information.

```go
type AudioInfo struct {
    URL      string `json:"url"`      // Audio URL
    Type     string `json:"type"`     // Audio type
    Duration string `json:"duration"` // Duration
}
```

### Type Field Value Rules

| Type value | When it occurs |
|-----------|----------------|
| MIME type (e.g. `"audio/mpeg"`) | Attribute value from `<source type="audio/mpeg">` |
| Empty string | `<audio src="...">` specifying the source directly with no `<source>` child element |

:::warning Duality of the .ogg extension
An OGG container can carry video or audio; a `.ogg` URL will appear in both `Videos` and `Audios`. The audio-only variant `.oga` appears only in `Audios`.
:::

## LinkResource

Link resource (used by link extraction API).

```go
type LinkResource struct {
    URL   string // Link URL
    Title string // Link title
    Type  string // Link type
}
```

## Statistics

Processing statistics.

```go
type Statistics struct {
    TotalProcessed    int64         // Total processed count
    CacheHits         int64         // Cache hit count
    CacheMisses       int64         // Cache miss count
    ErrorCount        int64         // Error count
    AverageProcessTime time.Duration // Average processing time
}
```

## BatchResult

Batch processing result.

```go
type BatchResult struct {
    Results   []*Result // Extraction results, nil on failure or cancellation
    Errors    []error   // Failed errors
    Success   int       // Success count
    Failed    int       // Failure count
    Cancelled int       // Cancelled count
}
```

## NodeAttr

HTML node attribute.

```go
type NodeAttr struct {
    Key   string // Attribute name
    Value string // Attribute value
}
```
