---
sidebar_label: "Загрузка файлов"
title: "Загрузка файлов - CyberGo HTTPC | Download и проверка"
description: "Справочник API загрузки файлов HTTPC: единый вход Download, структура конфигурации DownloadConfig, колбэк прогресса DownloadProgressCallback, тип результата DownloadResult, проверка контрольной суммы SHA-256 и шестислойная защита, включая защиту от UNC-путей."
sidebar_position: 4
---

# Загрузка файлов

## Пакетная функция загрузки

### Download

```go
func Download(ctx context.Context, url string, cfg *DownloadConfig, options ...RequestOption) (*DownloadResult, error)
```

Загружает файл с использованием клиента по умолчанию. `Download` — **единый канонический вход для загрузки** на уровне пакета, интерфейса `Client` и `DomainClient`, заменяющий прежнюю матрицу вариантов одной сигнатурой. `cfg` не может быть nil, и `cfg.FilePath` должен быть задан (иначе возвращается `ErrEmptyFilePath`).

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/file.zip"
cfg.Overwrite = true
cfg.ResumeDownload = true

result, err := httpc.Download(context.Background(), url, cfg)
```

Метод `Download` имеет одинаковую сигнатуру в интерфейсе `Client` и на `DomainClient` — поведение трёх входов унифицировано.

## DownloadConfig

```go
type DownloadConfig struct {
    FilePath          string
    ProgressCallback  DownloadProgressCallback
    Overwrite         bool
    ResumeDownload    bool
    Checksum          string
    ChecksumAlgorithm ChecksumAlgorithm
}

func DefaultDownloadConfig() *DownloadConfig
```

### Подробный разбор полей

| Поле | Тип | По умолчанию | Описание |
|------|-----|-------------|----------|
| `FilePath` | `string` | — | Путь сохранения файла (**обязательно**, не может быть пустым) |
| `ProgressCallback` | `DownloadProgressCallback` | `nil` | Колбэк прогресса; nil отключает отчётность |
| `Overwrite` | `bool` | `false` | Перезаписывать ли существующий файл. При false и существующем файле возвращается `ErrFileExists` |
| `ResumeDownload` | `bool` | `false` | Включить ли докачку. При true используется существующий частичный файл |
| `Checksum` | `string` | `""` | Ожидаемая контрольная сумма в шестнадцатеричной кодировке. При установке проверяется после завершения загрузки |
| `ChecksumAlgorithm` | `ChecksumAlgorithm` | `"sha256"` | Алгоритм контрольной суммы (в настоящее время поддерживается только SHA-256) |

:::tip Приоритет Overwrite и ResumeDownload
Когда файл существует и оба значения true, приоритет у `ResumeDownload` — существующий файл **дополняется**, а не заменяется. При отсутствии файла поведение одинаково (обычная загрузка).
:::

### DefaultDownloadConfig

```go
func DefaultDownloadConfig() *DownloadConfig
```

Возвращает конфигурацию загрузки по умолчанию: `Overwrite` и `ResumeDownload` оба false, `ChecksumAlgorithm` равен `ChecksumSHA256`. Вызывающий должен установить `FilePath` перед использованием.

## DownloadProgressCallback

```go
type DownloadProgressCallback func(downloaded, total int64, speed float64)
```

| Параметр | Тип | Описание |
|----------|-----|----------|
| `downloaded` | `int64` | Количество загруженных байт (включая смещение докачки) |
| `total` | `int64` | Общее количество байт (`-1` — неизвестно, без Content-Length) |
| `speed` | `float64` | Текущая скорость (байт/сек) |

### Механизм колбэка прогресса

Колбэк прогресса реализуется через обёртку `io.Writer` в `progressWriter`, проверяющую при каждом `Write` достижение интервала троттлинга:

| Характеристика | Описание |
|----------------|----------|
| Интервал троттлинга | 200ms (`progressInterval`) — избегает частых колбэков в высокоскоростных сетях |
| Корректировка смещения докачки | `downloaded = offset + written` — при докачке сообщается общий объём загрузки, а не приращение за этот раз |
| Корректировка общего объёма | При докачке `total = contentLength + offset` — восстанавливается полный размер файла |
| Финальный колбэк | После завершения загрузки дополнительно срабатывает один колбэк с финальной статистикой |

```go
cfg.ProgressCallback = func(downloaded, total int64, speed float64) {
    if total > 0 {
        pct := float64(downloaded) / float64(total) * 100
        fmt.Printf("\r%.1f%% (%s/s)", pct, httpc.FormatSpeed(speed))
    } else {
        fmt.Printf("\r%s (%s/s)", httpc.FormatBytes(downloaded), httpc.FormatSpeed(speed))
    }
}
```

## DownloadResult

```go
type DownloadResult struct {
    FilePath        string
    BytesWritten    int64
    Duration        time.Duration
    AverageSpeed    float64
    StatusCode      int
    ContentLength   int64
    Resumed         bool
    ResponseCookies []*http.Cookie
    ActualChecksum  string
    Proto           string
    ResponseHeaders http.Header
    RequestURL      string
    RequestMethod   string
    RequestHeaders  http.Header
}
```

### Подробный разбор полей

| Поле | Тип | Описание |
|------|-----|----------|
| `FilePath` | `string` | Фактический **абсолютный** путь сохранения файла (после проверки `prepareFilePath`) |
| `BytesWritten` | `int64` | Количество записанных байт за этот раз (при докачке — приращение, не общий размер файла) |
| `Duration` | `time.Duration` | Время загрузки (от начала записи до закрытия файла) |
| `AverageSpeed` | `float64` | Средняя скорость (байт/сек, = BytesWritten / Duration) |
| `StatusCode` | `int` | HTTP-код состояния (200 или 206) |
| `ContentLength` | `int64` | Content-Length сервера (при докачке — длина оставшейся части) |
| `Resumed` | `bool` | Завершена ли докачка (запрошен Range и получен 206) |
| `ResponseCookies` | `[]*http.Cookie` | Cookie ответа |
| `ActualChecksum` | `string` | Фактически вычисленная контрольная сумма (заполняется только при установленном `Checksum`) |
| `Proto` | `string` | Версия HTTP-протокола (например, `"HTTP/1.1"`, `"HTTP/2.0"`) |
| `ResponseHeaders` | `http.Header` | Заголовки ответа |
| `RequestURL` | `string` | Фактический URL запроса |
| `RequestMethod` | `string` | HTTP-метод запроса (всегда `"GET"`) |
| `RequestHeaders` | `http.Header` | Фактически отправленные заголовки запроса |

```go
fmt.Printf("Загрузка завершена: %s, время %v, средняя скорость %s\n",
    httpc.FormatBytes(result.BytesWritten),
    result.Duration,
    httpc.FormatSpeed(result.AverageSpeed),
)
```

:::tip
Используйте [FormatBytes](../core/functions#formatbytes) и [FormatSpeed](../core/functions#formatspeed), чтобы получить человекочитаемые строки байт и скорости и не выполнять вручную пересчёт по основанию `1024`.
:::

## Проверка контрольной суммы

### ChecksumAlgorithm

```go
type ChecksumAlgorithm string
```

Алгоритм проверки целостности загруженного файла.

| Константа | Значение | Описание |
|-----------|----------|----------|
| `ChecksumSHA256` | `"sha256"` | Алгоритм хеширования SHA-256 |

### Потоковая проверка SHA-256

После установки `Checksum` хеш **вычисляется в процессе записи** во время загрузки, избегая повторного чтения всего файла после завершения:

```text
Поток проверки:

  ① hasher = sha256.New()
  ② writer = io.MultiWriter(file, hasher)
     ↓
     Сетевой поток → file (запись на диск)
                   → hasher (обновление состояния хеша)
     ↓
  ③ После завершения загрузки: actualChecksum = hex(hasher.Sum(nil))
  ④ Сравнение: actualChecksum == strings.ToLower(cfg.Checksum)?
     ├─ Совпадение → возврат DownloadResult (с ActualChecksum)
     └─ Несовпадение → удаление файла + возврат ошибки проверки
```

| Шаг | Описание |
|------|----------|
| MultiWriter | `io.MultiWriter(file, hasher)` направляет данные одновременно в файл и хешер — нулевая дополнительная память |
| Предпроверка алгоритма | Проверка имени алгоритма **до** касания целевого файла — ошибка конфигурации не обрежет существующий файл |
| Очистка при сбое | При ошибке проверки **автоматически удаляется** загруженный файл (не в режиме докачки), избегая остатков повреждённого файла |
| Независимость от регистра | Ожидаемое значение автоматически `ToLower`, фактическое — нижний регистр hex, регистр не влияет на сравнение |

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/package.tar.gz"
cfg.Checksum = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
cfg.ChecksumAlgorithm = httpc.ChecksumSHA256

result, err := httpc.Download(context.Background(), url, cfg)
if err != nil {
    // При несовпадении контрольной суммы автоматически возвращается ошибка и удаляется загруженный файл
    log.Fatal(err)
}
fmt.Println("Контрольная сумма:", result.ActualChecksum)
```

## Механизм докачки

### Рабочий процесс ResumeDownload

```text
prepareResumeState(filePath, opts, options):

  ① prepareFilePath(filePath) → проверка безопасности пути → validatedPath
  ② os.Stat(validatedPath)
     ├─ Файл не существует → resumeOffset = 0, обычная загрузка
     ├─ Это каталог → возврат ошибки
     ├─ Файл существует + Overwrite=false + Resume=false → ErrFileExists
     ├─ Файл существует + Resume=true → resumeOffset = fileInfo.Size()
     │     → добавление WithHeader("Range", "bytes={offset}-") к options
     └─ Файл существует + Overwrite=true (не Resume) → resumeOffset = 0, загрузка с перезаписью
```

### Обработка ответа сервера

| Ответ сервера | Обработка |
|---------------|-----------|
| `206 Partial Content` | Докачка успешна: запись в режиме `O_APPEND`, `Resumed = true` |
| `200 OK` (Range не поддерживается) | **Возврат ошибки**: сервер игнорирует запрос Range, докачка обрезала бы существующие данные. После опустошения тела ответа возвращается ошибка |
| `416 Range Not Satisfiable` | **Возврат ошибки**: запрошенное смещение превышает размер файла. После опустошения тела ответа возвращается ошибка |
| Другие коды (4xx/5xx) | Возврат ошибки с предварительным просмотром первых 200 символов тела ответа |

:::warning Почему ошибка при 200
Когда `ResumeDownload=true`, но сервер возвращает 200 (а не 206), значит сервер не поддерживает запрос Range. Если продолжить загрузку, существующий частичный файл будет перезаписан с начала — **тихая потеря данных, которые пользователь намеревался докачать**. HTTPC выбирает возврат ошибки вместо обрезки, защищая локальный частичный файл от повреждения. Для принудительной перезаписи установите `Overwrite=true` + `ResumeDownload=false`.
:::

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/large-file.zip"
cfg.ResumeDownload = true

result, err := httpc.Download(context.Background(), url, cfg)
if err != nil {
    log.Fatal(err)
}
if result.Resumed {
    fmt.Printf("Докачка завершена, приращение %s\n", httpc.FormatBytes(result.BytesWritten))
}
```

## Принцип потоковой загрузки

Загрузка файлов использует потоковый режим (`WithStreamBody(true)`), избегая буферизации всего тела ответа в памяти:

```text
Поток данных при потоковой загрузке:

  Ответ сервера
    ↓
  engine.Response.RawBodyReader()  ← Сетевой ридер (io.ReadCloser)
    ↓
  io.Copy(writer, bodyReader)      ← Прямая потоковая запись, без полной буферизации
    ↓
  writer = progressWriter(MultiWriter(file, hasher))
    ↓
  Файл на диске
```

| Характеристика | Описание |
|----------------|----------|
| Нулевая буферизация в памяти | Данные идут из сети напрямую на диск, минуя полную буферизацию в памяти |
| Потоковое хеширование | Вычисление контрольной суммы синхронно с записью, без повторного чтения |
| Автоматическое освобождение | Ридер тела ответа закрывается через `defer`, ответ движка возвращается в пул объектов через `defer` |

:::warning Совместимость с middleware
Загрузке требуется прямой доступ к `RawBodyReader()` из `*engine.Response`. Если middleware **оборачивает** `ResponseMutator` пользовательским типом (а не изменяет ответ движка по месту), загрузка вернёт ошибку: `download is not compatible with middleware that wraps ResponseMutator`. Все встроенные middleware изменяют по месту и не вызывают эту ошибку.
:::

## Защита пути файла

`prepareFilePath` реализует многоуровневую защиту, предотвращающую запись по вредоносным путям в чувствительные системные расположения. Каждый уровень перехватывает до попадания пути в файловую систему:

### Обзор уровней защиты

| Уровень | Защита | Что перехватывает |
|---------|--------|---------------------|
| 1 | Проверка длины | Пустой путь / превышение 4096 символов |
| 2 | Блокировка UNC-путей | `\\server\share` или `//server/share` сетевые пути |
| 3 | Фильтрация управляющих символов | ASCII < 0x20, 0x7F (DEL), 0x00 (NUL) |
| 4 | Защита системных путей | Запись в защищённые ОС каталоги (см. таблицу ниже) |
| 5 | Обнаружение path traversal | Выход `../` за пределы рабочего каталога |
| 6 | Защита от symlink | Проверка символических ссылок на самом файле + рекурсивно по родительским каталогам |

### Уровень 2: блокировка UNC-путей

```text
Блокируемые форматы:
  \\server\share\file     ← Windows UNC-путь
  //server/share/file     ← POSIX сетевой путь с двойной косой чертой

Причина: UNC-пути могут обращаться к сетевым ресурсам и быть использованы для атак SSRF или SMB-реля
```

### Уровень 3: фильтрация управляющих символов

Каждый байт пути проверяется — ASCII управляющие символы (0x00-0x1F), DEL (0x7F) и NUL-байты отклоняются. Это предотвращает инъекции escape-последовательностей терминала и атаки подмены пути через CRLF.

### Уровень 4: защита системных путей

В зависимости от ОС блокируется запись в защищённые системные каталоги:

| ОС | Защищённые пути |
|----|-----------------|
| **Windows** | `C:\Windows\`, `C:\System32\`, `C:\Program Files\`, `C:\ProgramData\`, `C:\Program Files (x86)\` + раскрытие переменных окружения: `${SystemRoot}`, `${windir}`, `${ProgramFiles}` и др. |
| **macOS** | `/system/`, `/library/`, `/applications/`, `/usr/`, `/bin/`, `/sbin/`, `/etc/`, `/var/` |
| **Linux** | `/etc/`, `/sys/`, `/proc/`, `/dev/`, `/boot/`, `/root/`, `/usr/bin/`, `/usr/sbin/`, `/bin/`, `/sbin/`, `/lib/`, `/run/` и др. |

Сопоставление путей использует проверку префикса (с замыкающим разделителем), предотвращая коллизии префиксов (например, `C:\Windows` не ошибочно сопоставится с `C:\WindowsEvil`). Шаблоны переменных окружения Windows динамически раскрываются при проверке, охватывая системные каталоги на дисках, отличных от C.

### Уровень 5: обнаружение path traversal

```text
Проверка границы рабочего каталога:

  filePath = "../../etc/passwd"
  cleanPath = filepath.Clean → "../../etc/passwd"
  absPath = filepath.Abs → "/home/user/../../etc/passwd" → "/etc/passwd"

  Проверка: находится ли absPath в рабочем каталоге?
  Результат: нет → "path traversal detected: path outside working directory"
```

Проверка срабатывает, когда очищенный путь (`filepath.Clean`) начинается с `..`. Проверяются только **относительные пути** — абсолютные не ограничиваются рабочим каталогом (но всё равно подчиняются защите системных путей).

### Уровень 6: защита от symlink

| Проверка | Описание |
|----------|----------|
| Сам файл | `os.Lstat` проверяет, является ли целевой файл symlink — злоумышленник может создать symlink на чувствительный файл |
| Рекурсия по родительским каталогам | `checkParentDirSymlinks` рекурсивно проверяет все родительские каталоги (максимум 32 уровня), предотвращая атаки TOCTOU (каталог заменён на symlink после проверки) |
| Системный путь после разрешения | Если после разрешения symlink родительского каталога путь указывает на системный каталог, также отклоняется |

```go
// Каждый уровень защиты блокирует следующие сценарии атак:
cfg.FilePath = "\\malicious-server\share\payload"  // Блокировка UNC
cfg.FilePath = "/etc/passwd"                        // Защита системных путей
cfg.FilePath = "../../../etc/shadow"                // Обнаружение path traversal
cfg.FilePath = "/tmp/safe/../../../etc/passwd"      // Clean + traversal + системный путь
```

## Полный пример: продакшен-загрузка

Следующий пример демонстрирует полный процесс загрузки с колбэком прогресса, проверкой SHA-256 и докачкой.

```go
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/cybergodev/httpc"
)

func main() {
	cfg := httpc.DefaultDownloadConfig()
	cfg.FilePath = "/tmp/large-archive.zip"
	cfg.Overwrite = true
	cfg.ResumeDownload = true
	cfg.Checksum = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"

	lastUpdate := time.Now()
	cfg.ProgressCallback = func(downloaded, total int64, speed float64) {
		// Управление троттлингом: колбэк прогресса срабатывает каждые 200ms, здесь дополнительная фильтрация
		if time.Since(lastUpdate) < time.Second {
			return
		}
		lastUpdate = time.Now()

		if total > 0 {
			pct := float64(downloaded) / float64(total) * 100
			fmt.Printf("Прогресс: %s / %s (%.1f%%) Скорость: %s/s\n",
				httpc.FormatBytes(downloaded),
				httpc.FormatBytes(total),
				pct,
				httpc.FormatSpeed(speed))
		} else {
			fmt.Printf("Загружено: %s  Скорость: %s/s\n",
				httpc.FormatBytes(downloaded),
				httpc.FormatSpeed(speed))
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	result, err := httpc.Download(ctx,
		"https://example.com/files/large-archive.zip", cfg)
	if err != nil {
		log.Fatalf("Сбой загрузки: %v", err)
	}

	fmt.Println("Загрузка завершена")
	fmt.Printf("  Путь файла:    %s\n", result.FilePath)
	fmt.Printf("  Записано:      %s\n", httpc.FormatBytes(result.BytesWritten))
	fmt.Printf("  Время:         %v\n", result.Duration)
	fmt.Printf("  Средняя скорость: %s/s\n", httpc.FormatSpeed(result.AverageSpeed))
	fmt.Printf("  Код состояния: %d\n", result.StatusCode)
	fmt.Printf("  Докачка:       %v\n", result.Resumed)
	fmt.Printf("  Контрольная сумма: %s\n", result.ActualChecksum)
	// Пример вывода:
	// Прогресс: 5.2 MB / 52.4 MB (9.9%) Скорость: 12.3 MB/s
	// Прогресс: 26.1 MB / 52.4 MB (49.8%) Скорость: 11.8 MB/s
	// Прогресс: 52.4 MB / 52.4 MB (100.0%) Скорость: 12.1 MB/s
	// Загрузка завершена
	//   Путь файла:    /tmp/large-archive.zip
	//   Записано:      52.4 MB
	//   Время:         4.331s
	//   Средняя скорость: 12.1 MB/s
	//   Код состояния: 200
	//   Докачка:       false
	//   Контрольная сумма: abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
}
```

## См. также

- [Загрузка и выгрузка файлов](../../guides/file-transfer) — руководство по использованию
- [Пакетные функции](../core/functions) — справочник вспомогательных функций `FormatBytes`/`FormatSpeed`
- [Доменный клиент](./domain-client) — метод загрузки доменного клиента
