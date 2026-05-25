---
title: "ファイルアップロードとダウンロード - HTTPC"
description: "HTTPC ファイルアップロードとダウンロードガイド：WithFile で簡単アップロード、WithFormData Multipart マルチファイルアップロード、DownloadFile 基本ダウンロード、DownloadWithOptions プログレス付きダウンロード、レジューム ResumeDownload、SHA-256 チェックサムと UNC パスなどのセキュリティ防護。"
---

# ファイルアップロードとダウンロード

## ファイルアップロード

### シンプルなファイルアップロード

```go
fileContent, err := os.ReadFile("document.pdf")
if err != nil {
    log.Fatal(err)
}

result, err := httpc.Post("https://api.example.com/upload",
    httpc.WithFile("file", "document.pdf", fileContent),
)
```

### Multipart フォーム

ファイルと一緒にフォームフィールドを送信：

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

### マルチファイルアップロード

```go
form := &httpc.FormData{
    Fields: map[string]string{
        "description": "一括アップロード",
    },
    Files: map[string]*httpc.FileData{
        "file1": {Filename: "doc1.pdf", Content: content1},
        "file2": {Filename: "doc2.pdf", Content: content2},
        "file3": {Filename: "image.png", Content: content3},
    },
}

result, err := httpc.Post(url, httpc.WithFormData(form))
```

### バイナリアップロード

```go
data, _ := os.ReadFile("data.bin")
result, err := httpc.Post(url,
    httpc.WithBinary(data, "application/octet-stream"),
)
```

## ファイルダウンロード

### 基本ダウンロード

```go
result, err := httpc.DownloadFile(
    "https://example.com/file.zip",
    "/tmp/file.zip",
)
if err != nil {
    log.Fatal(err)
}

fmt.Printf("ダウンロード完了: %d bytes\n", result.BytesWritten)
fmt.Printf("所要時間: %v\n", result.Duration)
```

### 進捗コールバック付き

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/file.zip"
cfg.Overwrite = true
cfg.ProgressCallback = func(downloaded, total int64, speed float64) {
    pct := float64(downloaded) / float64(total) * 100
    fmt.Printf("\rダウンロード中: %.1f%% (%.2f MB/s)", pct, float64(speed)/1024/1024)
}

result, err := httpc.DownloadWithOptions("https://example.com/file.zip", cfg)
if err != nil {
    log.Fatal(err)
}

fmt.Printf("\nダウンロード完了: %d bytes, 平均速度 %.2f MB/s\n",
    result.BytesWritten,
    float64(result.AverageSpeed)/1024/1024,
)
```

### レジューム

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/large-file.zip"
cfg.ResumeDownload = true

result, err := httpc.DownloadWithOptions(url, cfg)
if err != nil {
    log.Fatal(err)
}

if result.Resumed {
    fmt.Printf("レジューム完了: ブレイクポイントから再開\n")
}
```

:::tip
レジュームはサーバーが `Range` リクエストヘッダーをサポートしている必要があります。サーバーがサポートしていない場合（206 ではなく 200 を返す）、ダウンロード済みの部分ファイルを保護するためにエラーが返されます。
:::

### コンテキスト制御付き

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
defer cancel()

result, err := httpc.DownloadFileWithContext(ctx, url, "/tmp/file.zip")
if err != nil {
    if errors.Is(err, context.DeadlineExceeded) {
        log.Println("ダウンロードタイムアウト")
    }
    log.Fatal(err)
}
```

## セキュリティ保護

ファイルダウンロードは多層セキュリティ保護を内蔵しています：

| 保護層 | 説明 |
|--------|------|
| パス検証 | UNC パス、制御文字、パストラバーサルをブロック |
| システムパス保護 | `/etc/`、`C:\Windows\` などのシステムディレクトリへの書き込みを禁止 |
| シンボリックリンク検出 | シンボリックリンク攻撃を防止 |
| ファイルサイズ制限 | `MaxResponseBodySize` による制限 |

## ドメインクライアントでのダウンロード

ドメインクライアントのダウンロードでは、レスポンス Cookie が自動的にセッションにキャプチャされます：

```go
dc, _ := httpc.NewDomain("https://api.example.com")
defer dc.Close()

dc.SetHeader("Authorization", "Bearer "+token)

// ダウンロードしながらセッションを自動管理
result, err := dc.DownloadFile("/files/report.pdf", "/tmp/report.pdf")
```

## 次のステップ

- [ファイルダウンロード API](../api-reference/download) - 完全なダウンロード API リファレンス
- [ドメインクライアントとセッション](./domain-session) - セッション管理
- [リクエストとレスポンス](./request-response) - 基本リクエストガイド
