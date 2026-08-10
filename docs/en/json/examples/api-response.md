---
sidebar_label: "API Response Parsing"
title: "API Response Parsing - CyberGo JSON | Pagination & Structs"
description: "Parse HTTP API responses with CyberGo JSON: ParseAny for arbitrary values, Get/GetArray for nested data, path slices and GetTyped for struct deserialization."
sidebar_position: 4
---

# API Response Parsing

This guide demonstrates how to parse typical HTTP API JSON responses with CyberGo JSON: extract status and pagination metadata, slice arrays with path expressions, and deserialize into structs.

## Parsing a Paginated API Response

Simulate a paginated REST API response, extract status and pagination metadata, take a subset with the `items[0:2]` slice, then iterate to extract fields per element.

```go
package main

import (
    "fmt"

    "github.com/cybergodev/json"
)

func main() {
    // Simulate a paginated API response
    apiResponse := `{
        "status": "success",
        "data": {
            "page": 2,
            "per_page": 5,
            "total": 48,
            "items": [
                {"id": 6, "name": "Project Six", "stars": 120},
                {"id": 7, "name": "Project Seven", "stars": 89},
                {"id": 8, "name": "Project Eight", "stars": 245},
                {"id": 9, "name": "Project Nine", "stars": 56},
                {"id": 10, "name": "Project Ten", "stars": 312}
            ]
        }
    }`

    // 1. Extract status and pagination metadata
    status := json.GetString(apiResponse, "status")
    page := json.GetInt(apiResponse, "data.page")
    total := json.GetInt(apiResponse, "data.total")
    fmt.Printf("Status: %s, page %d, total %d\n", status, page, total)

    // 2. Get the entire data array
    items := json.GetArray(apiResponse, "data.items")
    fmt.Printf("Items on page: %d\n", len(items))

    // 3. Take a subset using a path slice (first 2 items)
    firstTwo, err := json.Get(apiResponse, "data.items[0:2]")
    if err != nil {
        panic(err)
    }
    fmt.Printf("First two: %v\n", firstTwo)

    // 4. Iterate the array to extract each element's fields
    for i := 0; i < len(items); i++ {
        name := json.GetString(apiResponse, fmt.Sprintf("data.items.%d.name", i))
        stars := json.GetInt(apiResponse, fmt.Sprintf("data.items.%d.stars", i))
        fmt.Printf("  - %s (%d stars)\n", name, stars)
    }
}
// Output:
// Status: success, page 2, total 48
// Items on page: 5
// First two: [map[id:6 name:Project Six stars:120] map[id:7 name:Project Seven stars:89]]
//   - Project Six (120 stars)
//   - Project Seven (89 stars)
//   - Project Eight (245 stars)
//   - Project Nine (56 stars)
//   - Project Ten (312 stars)
```

:::tip
The path slice syntax `[start:end]` returns an array subset. You can also use `[start:end:step]` for stepped slices, `[-1]` for the last element, and `[*]` as a wildcard over all elements. See [Path Syntax](../getting-started/path-syntax) for the full grammar.
:::

## Deserializing into Structs

Use `GetTyped[T]` to deserialize the entire response or any nested sub-object into a strongly typed struct; use `ParseAny` to get an `any` value (handy when the shape is unknown).

```go
package main

import (
    "fmt"

    "github.com/cybergodev/json"
)

// Repository represents a repository in the API response
type Repository struct {
    ID    int    `json:"id"`
    Name  string `json:"name"`
    Stars int    `json:"stars"`
}

// APIResponse represents the whole API response
type APIResponse struct {
    Status string `json:"status"`
    Data   struct {
        Page  int          `json:"page"`
        Total int          `json:"total"`
        Items []Repository `json:"items"`
    } `json:"data"`
}

func main() {
    apiResponse := `{
        "status": "success",
        "data": {
            "page": 1,
            "total": 3,
            "items": [
                {"id": 1, "name": "cybergo-json", "stars": 500},
                {"id": 2, "name": "cybergo-jwt", "stars": 320},
                {"id": 3, "name": "cybergo-httpc", "stars": 280}
            ]
        }
    }`

    // 1. Deserialize the whole response into a struct (path "." means root object)
    resp := json.GetTyped[APIResponse](apiResponse, ".")
    fmt.Printf("Status: %s, %d repos\n", resp.Status, resp.Data.Total)
    for _, repo := range resp.Data.Items {
        fmt.Printf("  #%d %s (%d stars)\n", repo.ID, repo.Name, repo.Stars)
    }

    // 2. Use GetTyped on a single nested object (decode a sub-object into a struct)
    firstRepo := json.GetTyped[Repository](apiResponse, "data.items.0")
    fmt.Printf("First repo: %+v\n", firstRepo)

    // 3. Use ParseAny for an arbitrary value (when the response shape is unknown)
    parsed, err := json.ParseAny(apiResponse)
    if err != nil {
        panic(err)
    }
    fmt.Printf("Parsed type: %T\n", parsed)
}
// Output:
// Status: success, 3 repos
//   #1 cybergo-json (500 stars)
//   #2 cybergo-jwt (320 stars)
//   #3 cybergo-httpc (280 stars)
// First repo: {ID:1 Name:cybergo-json Stars:500}
// Parsed type: map[string]interface {}
```

## Next Steps

- [Basic Examples](./index) — path queries, struct encoding basics
- [Advanced Examples](./examples-advanced) — SafeGet, batch operations, and more
- [Cheat Sheet](../getting-started/cheatsheet) — quick API reference
- [Path Syntax](../getting-started/path-syntax) — slices, wildcards, field extraction
