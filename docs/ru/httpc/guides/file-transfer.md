---
sidebar_label: "Загрузка и скачивание файлов"
title: "Загрузка и выгрузка файлов - CyberGo HTTPC | Multipart"
description: "Выгрузка и скачивание файлов в HTTPC: WithFile и WithFormData, потоковый Download, прогресс и докачка ResumeDownload, SHA-256, защита путей и очистка файлов."
sidebar_position: 6
---

# Загрузка и выгрузка файлов

## Выгрузка файлов

### Простая выгрузка файла

```go
package main

import (
    "log"
    "os"

    "github.com/cybergodev/httpc"
)

func main() {
    fileContent, err := os.ReadFile("document.pdf")
    if err != nil {
        log.Fatal(err)
    }

    result, err := httpc.Post("https://api.example.com/upload",
        httpc.WithFile("file", "document.pdf", fileContent),
    )
    if err != nil {
        log.Fatal(err)
    }

    log.Printf("Выгрузка завершена: %d", result.StatusCode()) // Пример вывода: Выгрузка завершена: 200 (фактический код состояния зависит от сервера)
}
```

### Multipart-форма

Выгрузка файла вместе с полями формы:

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

У `FileData` есть также поле `ContentType` — оно явно объявляет MIME-тип каждого файла (если не задано, часть по умолчанию получает `application/octet-stream`):

```go
Files: map[string]*httpc.FileData{
    "file": {
        Filename:    "document.pdf",
        Content:     fileContent,
        ContentType: "application/pdf", // Явно объявляем MIME-тип
    },
},
```

### Многофайловая выгрузка

```go
form := &httpc.FormData{
    Fields: map[string]string{
        "description": "Пакетная выгрузка",
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
data, err := os.ReadFile("data.bin")
if err != nil {
    log.Fatal(err)
}
result, err := httpc.Post(url,
    httpc.WithBinary(data, "application/octet-stream"),
)
if err != nil {
    log.Fatal(err)
}
```

### Потоковая выгрузка (большие файлы)

`WithBody` напрямую принимает `io.Reader` — читать весь файл в память не нужно. Content-Type тела запроса на основе Reader не определяется автоматически, его нужно задать явно:

```go
file, err := os.Open("large-video.mp4")
if err != nil {
    log.Fatal(err)
}
defer file.Close()

result, err := httpc.Post("https://api.example.com/upload",
    httpc.WithBody(file),
    httpc.WithHeader("Content-Type", "video/mp4"),
)
```

В связке с `io.Pipe` возможна потоковая выгрузка без копирования — goroutine-производитель отправляет данные по мере генерации, HTTP-транспорт потребляет их параллельно:

```go
pr, pw := io.Pipe()
go func() {
    defer pw.Close()
    // Пишем в pw кусками, например из базы данных или генератора
    _, _ = pw.Write(chunk)
}()

result, err := httpc.Post("https://api.example.com/upload",
    httpc.WithBody(pr),
    httpc.WithHeader("Content-Type", "application/octet-stream"),
)
```

:::warning Тело запроса Reader обходит проверку размера
Длину данных `io.Reader` заранее узнать нельзя, поэтому HTTPC **не проверяет их размер**. При выгрузке недоверенных данных оберните источник в `io.LimitReader` или задайте глобальный лимит `Security.MaxRequestBodySize`:

```go
result, err := httpc.Post(url,
    httpc.WithBody(io.LimitReader(reader, 10<<20)), // Лимит 10MB
    httpc.WithHeader("Content-Type", "application/octet-stream"),
)
```
:::

## Скачивание файлов

`Download(ctx, url, cfg, options...)` — единый канонический вход скачивания, общий для функций уровня пакета, `Client` и `DomainClient`.

Скачивание **всегда выполняется потоково**: внутри автоматически добавляется `WithStreamBody(true)`, тело ответа идёт из сети напрямую на диск (`io.Copy`), файл никогда не буферизуется в памяти целиком; при включённой контрольной сумме хэш также считается синхронно в процессе записи — второго прохода по диску не возникает.

### Базовое скачивание

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/file.zip"

result, err := httpc.Download(context.Background(), "https://example.com/file.zip", cfg)
if err != nil {
    log.Fatal(err)
}

fmt.Printf("Скачивание завершено: %s\n", httpc.FormatBytes(result.BytesWritten))
fmt.Printf("Затрачено: %v\n", result.Duration)
```

### С колбэком прогресса

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/file.zip"
cfg.Overwrite = true
cfg.ProgressCallback = func(downloaded, total int64, speed float64) {
    pct := float64(downloaded) / float64(total) * 100
    fmt.Printf("\rСкачивание: %.1f%% (%s)", pct, httpc.FormatSpeed(speed))
}

result, err := httpc.Download(context.Background(), "https://example.com/file.zip", cfg)
if err != nil {
    log.Fatal(err)
}

fmt.Printf("\nСкачивание завершено: %s, средняя скорость %s\n",
    httpc.FormatBytes(result.BytesWritten),
    httpc.FormatSpeed(result.AverageSpeed),
)
```

:::tip Правила срабатывания колбэка прогресса
Параметры колбэка — `(скачано байт, всего байт, текущая скорость)`, ритм срабатываний гарантирован реализацией:

- **Минимальный интервал 200ms**: на быстрых сетях высокочастотные вызовы не тормозят запись на диск, на медленных — индикация всё равно обновляется стабильно;
- **В конце добавляется финальный вызов**: в нём `downloaded` равен общему числу байт, а `speed` — средней скорости; удобно для финального перевода строки в CLI;
- **Откуда берётся `total`**: из `Content-Length`, возвращённого сервером; при докачке сервер отвечает на Range-запрос только числом оставшихся байт — HTTPC автоматически прибавляет смещение существующего файла и получает полный размер;
- **`total` может быть 0 или отрицательным**: если сервер не вернул Content-Length (chunked-передача), общий размер неизвестен — в колбэке сначала проверяйте `total > 0` и только затем считайте процент.
:::

### С аутентификацией и кастомными заголовками

Вариативные параметры `Download` — это обычные `RequestOption`, поэтому заголовки аутентификации, параметры запроса и таймаут на один запрос добавляются напрямую:

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/report.pdf"
cfg.Overwrite = true

result, err := client.Download(context.Background(),
    "https://api.example.com/files/report.pdf",
    cfg,
    httpc.WithBearerToken("my-token"),                  // Аутентификация
    httpc.WithHeader("Accept", "application/pdf"),      // Кастомный заголовок
    httpc.WithTimeout(5*time.Minute),                   // Бюджет таймаута на одно скачивание
)
```

### Докачка

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/large-file.zip"
cfg.ResumeDownload = true

result, err := httpc.Download(context.Background(), url, cfg)
if err != nil {
    log.Fatal(err)
}

if result.Resumed {
    fmt.Printf("Докачка завершена: восстановлено с точки разрыва\n")
}
```

:::tip
Докачка опирается на поддержку сервером заголовка Range. Если сервер его не поддерживает (возвращает 200 вместо 206), возвращается ошибка — чтобы защитить уже скачанную часть файла.
:::

Полная логика принятия решения при докачке:

| Ответ сервера | Поведение |
|--------------|-----------|
| `206 Partial Content` | Дозапись в существующий файл с `O_APPEND`, `result.Resumed` равен `true` |
| `200 OK` (Range не поддерживается) | Возвращается ошибка `server does not support range requests`, существующая частичная загрузка **не обрезается** |
| `416 Range Not Satisfiable` | Возвращается ошибка (типично, когда локальный файл уже полный либо ресурс на сервере уменьшился) |
| Другой код, не 2xx | Возвращается ошибка `unexpected status code`; сообщение содержит превью первых 200 байт тела ответа |

:::warning Когда Overwrite и ResumeDownload оба равны true
Приоритет у `ResumeDownload` — существующий файл **дозаписывается**, а не заменяется. Кроме того, при докачке в случае сбоя записи на диск в середине процесса уже записанные байты сохраняются (для следующей докачки); без докачки при сбое недописанный файл удаляется, чтобы не оставлять повреждённый артефакт.
:::

### Проверка контрольной суммы (SHA-256)

Если задан `Checksum`, HTTPC параллельно с записью на диск считает SHA-256 проходящих данных и по завершении скачивания сравнивает с ожидаемым значением:

- сравнение **не зависит от регистра** (ожидаемое значение внутри приводится к нижнему регистру);
- **несовпадение → скачанный файл удаляется и возвращается ошибка**, повреждённый артефакт не остаётся;
- при успехе `result.ActualChecksum` несёт фактически вычисленный хэш — можно записать в журнал;
- корректность алгоритма проверяется **до открытия целевого файла** — ошибочная конфигурация (например, неизвестный `ChecksumAlgorithm`) не обрежет существующий файл на диске.

```go
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"net/http/httptest"

	"github.com/cybergodev/httpc"
)

func main() {
	payload := []byte("hello httpc checksum")

	// Локальный имитационный сервер с фиксированным содержимым; в продакшене ожидаемое значение должно приходить из доверенного источника вроде манифеста релиза
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(payload)
	}))
	defer server.Close()

	sum := sha256.Sum256(payload)
	expected := hex.EncodeToString(sum[:])

	cfg := httpc.DefaultConfig()
	cfg.Security.AllowPrivateIPs = true // Разрешаем подключение к локальному серверу 127.0.0.1
	client, err := httpc.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer client.Close()

	dlCfg := httpc.DefaultDownloadConfig()
	dlCfg.FilePath = "checksum-demo.txt"
	dlCfg.Overwrite = true
	dlCfg.Checksum = expected // Ожидаемый SHA-256 (hex-кодирование)
	dlCfg.ChecksumAlgorithm = httpc.ChecksumSHA256

	result, err := client.Download(context.Background(), server.URL, dlCfg)
	if err != nil {
		log.Fatal(err) // Проверка не пройдена: файл уже удалён, сообщение содержит ожидаемое и фактическое значения
	}
	fmt.Printf("Проверка пройдена: %s\n", result.ActualChecksum) // Вывод: Проверка пройдена: 2f2b7c... (SHA-256 от payload)
}
```

### С управлением через контекст

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
defer cancel()

cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/file.zip"

result, err := httpc.Download(ctx, url, cfg)
if err != nil {
    if errors.Is(err, context.DeadlineExceeded) {
        log.Println("Таймаут скачивания")
    }
    log.Fatal(err)
}
```

### Семантика конфликтов файлов и очистки

Сводка правил обращения с целевым файлом при скачивании (в паре с сигнальными ошибками `ErrFileExists` и `ErrEmptyFilePath` проверяйте через `errors.Is`):

| Сценарий | Поведение |
|----------|-----------|
| Целевой файл существует, `Overwrite`/`ResumeDownload` оба false | Возвращается `ErrFileExists`, файл не трогается |
| Целевой путь — каталог | Возвращается ошибка |
| `Overwrite = true` (без докачки) | Перезапись с `O_TRUNC` |
| `ResumeDownload = true`, сервер поддерживает Range | Дозапись с `O_APPEND` |
| Ошибка записи/сброса на диск (sync/close) | Без докачки: недописанный файл удаляется; с докачкой: уже записанные байты сохраняются |
| Несовпадение контрольной суммы | Скачанный файл удаляется |
| Требуемый алгоритм не поддерживается (только SHA-256) | Ошибка возвращается **до открытия файла**, существующий файл не обрезается |
| Целевой каталог не существует | Создаётся автоматически рекурсивно (права 0755), права файла 0644 |
| Пустой путь | Возвращается `ErrEmptyFilePath` |

При ошибочных кодах состояния (не 200/206) сообщение об ошибке содержит превью первых 200 байт тела ответа для диагностики; одновременно вычитается до 1MiB тела ответа, чтобы соединение по возможности вернулось в пул для переиспользования.

### Что выбрать: Download или SaveToFile

`Result.SaveToFile(path)` записывает на диск тело ответа, **уже находящееся в памяти**; `Download` пишет на диск потоково от начала до конца:

| Способ | Сценарий применения | Описание |
|--------|---------------------|----------|
| `result.SaveToFile(path)` | От малого до среднего тела ответа (уже в памяти) | Путь проходит те же проверки безопасности, что и Download; пустое тело возвращает `ErrResponseBodyEmpty` |
| `client.Download(ctx, url, cfg)` | Большие файлы | Потоковая запись на диск, поддержка прогресса/докачки/контрольной суммы; потребление памяти не зависит от размера файла |

```go
// Тело ответа уже в памяти: пишем прямо на диск
result, err := client.Get("https://example.com/small.json")
if err != nil {
    log.Fatal(err)
}
if err := result.SaveToFile("/tmp/small.json"); err != nil {
    log.Fatal(err)
}
```

### Обзор полей DownloadResult

Помимо привычных числа байт и длительности, возвращаемый `Download` `DownloadResult` несёт полные метаданные запроса и ответа:

| Поле | Тип | Описание |
|------|-----|----------|
| `FilePath` | `string` | Проверенный абсолютный путь сохранения |
| `BytesWritten` | `int64` | Число байт, записанных на диск в этом запуске (при докачке **не включает** имевшееся до неё смещение) |
| `Duration` | `time.Duration` | Общее время скачивания |
| `AverageSpeed` | `float64` | Средняя скорость (байт/секунду) |
| `StatusCode` | `int` | Код состояния ответа (200 или 206) |
| `ContentLength` | `int64` | Content-Length, возвращённый сервером (при докачке — число оставшихся байт) |
| `Resumed` | `bool` | Была ли это докачка |
| `ResponseCookies` | `[]*http.Cookie` | Cookie из ответа (`DomainClient` автоматически захватывает их в сессию) |
| `ActualChecksum` | `string` | Фактически вычисленная контрольная сумма (непустая, только если задан `Checksum`) |
| `Proto` | `string` | Версия протокола (например, `HTTP/2.0`) |
| `ResponseHeaders` | `http.Header` | Заголовки ответа |
| `RequestURL` / `RequestMethod` | `string` | Фактически запрошенные URL и метод |
| `RequestHeaders` | `http.Header` | Фактически отправленные заголовки запроса |

## Защита

Скачивание файлов включает многоуровневую защиту, целиком выполняемую **до открытия целевого файла**:

| Уровень защиты | Описание |
|----------------|----------|
| Валидация пути | Отсекаются UNC-пути (`\\server\share`, `//server`), управляющие символы, path traversal (если после `Clean` путь начинается с `..` и выходит за рабочий каталог — отказ) |
| Лимит длины | Путь не длиннее 4096 символов, сверх — прямой отказ |
| Защита системных путей | Запись в системные каталоги запрещена: на Windows перекрываются `C:\Windows\`, `C:\Program Files\` и позиции раскрытия переменных вроде `%SystemRoot%`; на Linux/macOS — `/etc/`, `/usr/`, `/bin/`, `/System/`, `/Library/` и др. |
| Детект символических ссылок | Отказ, если цель сама симлинк или любой родительский каталог резолвится в системный каталог (защита от TOCTOU, рекурсивная проверка до 32 уровней) |
| Лимит размера файла | Ограничен `MaxResponseBodySize` |

:::tip Каталоги тоже проверяются
Автосоздание родительских каталогов (`MkdirAll`) происходит **после** валидации пути, поэтому ни один уровень каталогов в `FilePath` не сможет подобраться к системным путям или симлинкам в обход защиты. `Result.SaveToFile` переиспользует тот же набор проверок.
:::

## Скачивание через доменный клиент

Скачивание доменным клиентом автоматически захватывает Cookie ответа в сессию:

```go
dc, err := httpc.NewDomainDefault("https://api.example.com")
if err != nil {
    log.Fatal(err)
}
defer dc.Close()

dc.SetHeader("Authorization", "Bearer "+token)

cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/report.pdf"

// Скачивание с автоматическим управлением сессией (path относительно baseURL)
result, err := dc.Download(context.Background(), "/files/report.pdf", cfg)
if err != nil {
    log.Fatal(err)
}
```

:::warning Два нюанса доменного клиента
- **Опции запроса выполняются дважды** (один раз для захвата состояния сессии, один — для фактического запроса). Не передавайте опции с побочными эффектами (счётчики, генераторы случайных nonce и т. п.); если без этого не обойтись — качайте напрямую через низкоуровневый `Client`.
- **Download несовместим с «кастомным middleware, оборачивающим объект ответа»**: путь скачивания требует прямого доступа к исходному потоку ответа, и если кастомное middleware заменяет `ResponseMutator` обёрточным типом, `Download` вернёт явную ошибку. Встроенные middleware (Recovery/Logging/Metrics и др.) прозрачны и не затрагиваются.
:::

## Что дальше

- [API загрузки файлов](../api-reference/client-config/download) - полный справочник API скачивания
- [Доменный клиент и сессии](./domain-session) - управление сессией
- [Запросы и ответы](./request-response) - руководство по базовым запросам
- [Оптимизация производительности](./performance) - пресеты и настройка для скачивания больших файлов
- [Руководство по тестированию](./testing) - тестирование логики скачивания через httptest
