---
title: "Загрузка и выгрузка файлов - HTTPC"
description: "Руководство по загрузке и выгрузке файлов HTTPC: простая выгрузка через WithFile, Multipart-выгрузка нескольких файлов через WithFormData, базовая загрузка через DownloadFile, загрузка с обратным вызовом прогресса через DownloadWithOptions, возобновление загрузки ResumeDownload, проверка SHA-256 и защита от UNC-путей."
---

# Загрузка и выгрузка файлов

## Выгрузка файлов

### Простая выгрузка файла

```go
fileContent, err := os.ReadFile("document.pdf")
if err != nil {
    log.Fatal(err)
}

result, err := httpc.Post("https://api.example.com/upload",
    httpc.WithFile("file", "document.pdf", fileContent),
)
```

### Multipart-форма

Загрузка файла с одновременной передачей полей формы:

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

### Множественная загрузка файлов

```go
form := &httpc.FormData{
    Fields: map[string]string{
        "description": "Пакетная загрузка",
    },
    Files: map[string]*httpc.FileData{
        "file1": {Filename: "doc1.pdf", Content: content1},
        "file2": {Filename: "doc2.pdf", Content: content2},
        "file3": {Filename: "image.png", Content: content3},
    },
}

result, err := httpc.Post(url, httpc.WithFormData(form))
```

### Бинарная выгрузка

```go
data, _ := os.ReadFile("data.bin")
result, err := httpc.Post(url,
    httpc.WithBinary(data, "application/octet-stream"),
)
```

## Загрузка файлов

### Базовая загрузка

```go
result, err := httpc.DownloadFile(
    "https://example.com/file.zip",
    "/tmp/file.zip",
)
if err != nil {
    log.Fatal(err)
}

fmt.Printf("Загрузка завершена: %d bytes\n", result.BytesWritten)
fmt.Printf("Время: %v\n", result.Duration)
```

### С обратным вызовом прогресса

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/file.zip"
cfg.Overwrite = true
cfg.ProgressCallback = func(downloaded, total int64, speed float64) {
    pct := float64(downloaded) / float64(total) * 100
    fmt.Printf("\rЗагрузка: %.1f%% (%.2f MB/s)", pct, float64(speed)/1024/1024)
}

result, err := httpc.DownloadWithOptions("https://example.com/file.zip", cfg)
if err != nil {
    log.Fatal(err)
}

fmt.Printf("\nЗагрузка завершена: %d bytes, средняя скорость %.2f MB/s\n",
    result.BytesWritten,
    float64(result.AverageSpeed)/1024/1024,
)
```

### Докачка

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/large-file.zip"
cfg.ResumeDownload = true

result, err := httpc.DownloadWithOptions(url, cfg)
if err != nil {
    log.Fatal(err)
}

if result.Resumed {
    fmt.Printf("Докачка завершена: возобновлено с точки останова\n")
}
```

:::tip
Докачка зависит от поддержки сервером заголовка `Range`. Если сервер не поддерживает Range (возвращает 200 вместо 206), будет возвращена ошибка для защиты частично загруженного файла.
:::

### С управлением контекстом

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
defer cancel()

result, err := httpc.DownloadFileWithContext(ctx, url, "/tmp/file.zip")
if err != nil {
    if errors.Is(err, context.DeadlineExceeded) {
        log.Println("Таймаут загрузки")
    }
    log.Fatal(err)
}
```

## Защита безопасности

Загрузка файлов включает многоуровневую защиту:

| Уровень защиты | Описание |
|----------------|----------|
| Валидация пути | Блокировка UNC-путей, управляющих символов, обхода пути |
| Защита системных путей | Запрет записи в `/etc/`, `C:\Windows\` и другие системные каталоги |
| Обнаружение символических ссылок | Предотвращение атак через символические ссылки |
| Ограничение размера файла | Ограничено настройкой `MaxResponseBodySize` |

## Загрузка через доменный клиент

Загрузки через доменный клиент автоматически фиксируют Cookie ответа в сессии:

```go
dc, _ := httpc.NewDomain("https://api.example.com")
defer dc.Close()

dc.SetHeader("Authorization", "Bearer "+token)

// Загрузка с автоматическим управлением сессией
result, err := dc.DownloadFile("/files/report.pdf", "/tmp/report.pdf")
```

## Что дальше

- [Загрузка файлов API](../api-reference/download) - полный справочник API загрузки
- [Доменный клиент и сессии](./domain-session) - управление сессиями
- [Запросы и ответы](./request-response) - руководство по базовым запросам
