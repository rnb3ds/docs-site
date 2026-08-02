---
sidebar_label: "Константы и типы"
title: "Константы и типы - CyberGo HTTPC | Вспомогательные типы"
description: "Справочник API констант и вспомогательных типов HTTPC: шесть значений перечисления BodyKind и правила автоопределения, стратегия прокси ProxyStrategy, типы загрузки файлов FormData и FileData, структура события аудита AuditEvent, конфигурация AuditConfig и ключи контекста SourceIPKey."
sidebar_position: 2
---

# Константы и типы

Эта страница объединяет все публичные константы и вспомогательные типы HTTPC, включая перечисления типов тела запроса, стратегии прокси, типы загрузки форм/файлов, алгоритмы проверки, события аудита, функции форматирования, колбэки прогресса и конфигурацию безопасности Cookie.

## BodyKind

```go
type BodyKind int
```

Тип тела запроса, используется в `WithBody` для указания формата тела.

| Константа | Значение | Значение | Требование ко входу | Соответствующий Content-Type |
|-----------|----------|----------|---------------------|------------------------------|
| `BodyAuto` | 0 | Автоопределение | Любой (вывод по типу) | См. таблицу правил ниже |
| `BodyJSON` | 1 | Принудительное JSON-кодирование | Любой сериализуемый тип | application/json |
| `BodyXML` | 2 | Принудительное XML-кодирование | Любой сериализуемый тип | application/xml |
| `BodyForm` | 3 | Кодирование формы | `map[string]string` или совместимый тип | application/x-www-form-urlencoded |
| `BodyBinary` | 4 | Бинарный поток | `[]byte` или `string` | application/octet-stream |
| `BodyMultipart` | 5 | Multipart-форма | `*FormData` | multipart/form-data |

### Правила автоопределения BodyAuto

`BodyAuto` (значение по умолчанию) автоматически выводит формат тела запроса и Content-Type по Go-типу входных данных:

| Входной Go-тип | Выведенный формат | Content-Type |
|----------------|-------------------|--------------|
| `string` | Чистый текст | text/plain; charset=utf-8 |
| `[]byte` | Бинарный поток | application/octet-stream |
| `map[string]string` | Форма | application/x-www-form-urlencoded |
| `*FormData` | Multipart-форма | multipart/form-data |
| `io.Reader` | Прозрачная передача как есть | Не устанавливается (указывается вызывающим) |
| Другие типы | JSON-сериализация | application/json |

:::tip BodyAuto vs явное указание
В большинстве сценариев `BodyAuto` достаточно. Когда автоматический вывод не соответствует ожиданиям (например, нужно отправить struct как XML, а не JSON), явная передача `BodyJSON`/`BodyXML`/`BodyForm` и др. принудительно задаёт формат кодирования.
:::

```go
// Автоопределение (по умолчанию)
result, _ := client.Post(url, httpc.WithBody(data))

// Принудительный JSON (даже если data — map[string]string, используется JSON-кодирование)
result, _ := client.Post(url, httpc.WithBody(data, httpc.BodyJSON))

// Принудительный XML
result, _ := client.Post(url, httpc.WithBody(data, httpc.BodyXML))
```

## ProxyStrategy

```go
type ProxyStrategy = proxypool.Strategy
```

Стратегия выбора пула прокси, используется в `ConnectionConfig.ProxyPoolStrategy`. Является псевдонимом типа внутреннего `proxypool.Strategy`, что позволяет избежать импорта внутреннего пакета.

| Константа | Описание | Поведение при повторе |
|-----------|----------|-----------------------|
| `ProxyStrategyRoundRobin` | Round-robin (по умолчанию). Циклический последовательный выбор прокси, при каждом выборе переход к следующему | При повторе естественно попадает на другой IP, дополнительная настройка не требуется |
| `ProxyStrategyRandom` | Случайный. Равномерный случайный выбор из здоровых прокси | При повторе случайный выбор, статистически склонен к смене IP |

```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyPool = []string{
    "http://proxy1:8080",
    "http://proxy2:8080",
}
cfg.Connection.ProxyPoolStrategy = httpc.ProxyStrategyRoundRobin
client, _ := httpc.New(cfg)
```

:::tip Срабатывание ротации по коду состояния
Совместно с `ProxyRotateOnStatus` (например, `[]int{403}`) можно запускать повтор+ротацию прокси при получении определённого кода состояния — подходит для обхода блокировок CF/WAF на уровне IP. Подробнее см. [Справочник конфигурации](../client-config/config).
:::

## FormData / FileData

### FormData

```go
type FormData struct {
    Fields map[string]string    // Обычные поля формы
    Files  map[string]*FileData // Поля файлов
}
```

Используется для данных multipart-формы в режиме `BodyMultipart`. `Fields` хранит пары ключ-значение, `Files` — файлы. Является псевдонимом типа внутреннего `types.FormData`.

### FileData

```go
type FileData struct {
    Filename    string // Имя файла
    Content     []byte // Содержимое файла
    ContentType string // MIME-тип, например "image/png", "application/pdf"
}
```

Является псевдонимом типа внутреннего `types.FileData`.

```go
package main

import (
	"fmt"
	"log"

	"github.com/cybergodev/httpc"
)

func main() {
	client, err := httpc.NewDefault()
	if err != nil {
		log.Fatalf("Не удалось создать клиент: %v", err)
	}
	defer func() { _ = client.Close() }()

	form := &httpc.FormData{
		Fields: map[string]string{
			"username": "alice",
			"title":    "profile photo",
		},
		Files: map[string]*httpc.FileData{
			"avatar": {
				Filename:    "photo.png",
				Content:     []byte("\x89PNG..."), // На практике используйте os.ReadFile
				ContentType: "image/png",
			},
		},
	}

	result, err := client.Post("https://httpbin.org/post", httpc.WithFormData(form))
	if err != nil {
		log.Fatalf("Сбой загрузки: %v", err)
	}

	fmt.Println("Загрузка завершена, код состояния:", result.StatusCode())
}
```

## ChecksumAlgorithm

```go
type ChecksumAlgorithm string

const ChecksumSHA256 ChecksumAlgorithm = "sha256"
```

Алгоритм проверки загрузки. В настоящее время поддерживается только `"sha256"`. Используется в `DownloadConfig.ChecksumAlgorithm`, в `DefaultDownloadConfig()` по умолчанию `ChecksumSHA256`. Передача неподдерживаемого алгоритма возвращает ошибку `"unsupported checksum algorithm"` перед началом загрузки.

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/archive.zip"
cfg.Checksum = "e3b0c44298fc1c149afbf4c8996fb924..." // Ожидаемое шестнадцатеричное значение SHA-256
cfg.ChecksumAlgorithm = httpc.ChecksumSHA256
```

## AuditEvent

```go
type AuditEvent struct {
    Timestamp     time.Time           `json:"timestamp"`
    Method        string              `json:"method"`
    URL           string              `json:"url"`           // Маскировано (учётные данные удалены)
    StatusCode    int                 `json:"statusCode"`
    Duration      time.Duration       `json:"duration"`
    Attempts      int                 `json:"attempts"`
    Error         error               `json:"error,omitempty"`
    SourceIP      string              `json:"sourceIP,omitempty"`
    UserID        string              `json:"userID,omitempty"`
    RedirectChain []string            `json:"redirectChain,omitempty"`
    ReqHeaders    map[string][]string `json:"reqHeaders,omitempty"`
    RespHeaders   map[string][]string `json:"respHeaders,omitempty"`
}
```

Событие аудита безопасности, генерируемое `AuditMiddleware` после каждого цикла запрос/ответ. Спроектировано для высококомплаенсных сценариев (финансы, медицина, госсектор), фиксирует полный контекст запроса/ответа.

| Поле | Тип | Описание |
|------|-----|----------|
| `Timestamp` | `time.Time` | Время начала запроса |
| `Method` | `string` | HTTP-метод |
| `URL` | `string` | URL запроса (маскирован, учётные данные удалены) |
| `StatusCode` | `int` | Код состояния ответа (0 при отсутствии ответа) |
| `Duration` | `time.Duration` | Общее время запроса |
| `Attempts` | `int` | Число попыток (включая повторы) |
| `Error` | `error` | Объект ошибки (с SanitizeError — маскированный) |
| `SourceIP` | `string` | Исходный IP (извлекается из context) |
| `UserID` | `string` | ID пользователя (извлекается из context) |
| `RedirectChain` | `[]string` | Цепочка перенаправлений |
| `ReqHeaders` | `map[string][]string` | Заголовки запроса (требуется IncludeHeaders=true) |
| `RespHeaders` | `map[string][]string` | Заголовки ответа (требуется IncludeHeaders=true) |

### MarshalJSON — пользовательская сериализация

`AuditEvent` реализует пользовательскую JSON-сериализацию, предоставляя два JSON-дружественных производных поля:

| JSON-поле | Источник | Описание |
|-----------|----------|----------|
| `durationMs` | `Duration.Milliseconds()` | Целочисленное значение в миллисекундах, удобно для инструментов агрегации логов |
| `error` | `Error.Error()` | Строка ошибки (заменяет сериализацию по умолчанию интерфейса error) |

Таким образом, JSON-вывод одновременно содержит исходный `duration` (наносекунды) и удобочитаемый `durationMs` (миллисекунды), а поле `error` выводится как строка, а не пустой объект.

### AuditConfig

```go
type AuditConfig struct {
    OnAudit        func(event AuditEvent) // Колбэк аудита; при nil middleware — no-op
    Format         string                 // "text" или "json"
    IncludeHeaders bool                   // Включать ли заголовки запроса/ответа
    MaskHeaders    []string               // Имена заголовков для маскировки (например, "Authorization", "Cookie")
    SanitizeError  bool                   // Маскировать ли информацию об ошибках (заменяется на "[sanitized]")
}
```

`DefaultAuditConfig()` предоставляет значения по умолчанию: `Format="text"`, `IncludeHeaders=false`, `MaskHeaders=список конфиденциальных заголовков` (Authorization/Cookie и др.), `SanitizeError=true`.

## Ключи контекста

| Константа | Значение | Описание |
|-----------|----------|----------|
| `SourceIPKey` | `"source_ip"` | Исходный IP-адрес в событии аудита |
| `UserIDKey` | `"user_id"` | Идентификатор пользователя в событии аудита |

Тип этих ключей — `auditContextKey` (неэкспортируемый строковый тип), используется для передачи информации аудита через `context.WithValue`. `AuditMiddleware` извлекает эти значения через `ctx.Value(httpc.SourceIPKey)` и `ctx.Value(httpc.UserIDKey)` и заполняет ими `AuditEvent`.

```go
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/cybergodev/httpc"
)

func main() {
	// Передача информации аудита через context
	ctx := context.WithValue(context.Background(), httpc.SourceIPKey, "192.168.1.100")
	ctx = context.WithValue(ctx, httpc.UserIDKey, "user-789")

	// Настройка middleware аудита
	auditCfg := httpc.DefaultAuditConfig()
	auditCfg.Format = "json"
	auditCfg.IncludeHeaders = true
	auditCfg.OnAudit = func(event httpc.AuditEvent) {
		fmt.Printf("[AUDIT] %s %s -> %d (%v) src=%s user=%s\n",
			event.Method, event.URL, event.StatusCode,
			event.Duration, event.SourceIP, event.UserID)
	}

	cfg := httpc.DefaultConfig()
	cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
		httpc.AuditMiddleware(auditCfg),
	}
	client, err := httpc.New(cfg)
	if err != nil {
		log.Fatalf("Не удалось создать клиент: %v", err)
	}
	defer func() { _ = client.Close() }()

	// SourceIP/UserID из context будут извлечены middleware в событие аудита
	result, err := client.Request(ctx, "GET", "https://httpbin.org/get")
	if err != nil {
		log.Fatalf("Сбой запроса: %v", err)
	}
	fmt.Println("Код состояния:", result.StatusCode())
}
```

## FormatBytes / FormatSpeed

### FormatBytes

```go
func FormatBytes(bytes int64) string
```

Форматирует количество байт в человекочитаемую строку. Использует двоичные единицы (по основанию 1024), при значении менее 1024 отображается целым числом, иначе — с двумя знаками после запятой.

| Вход | Выход |
|------|-------|
| `512` | `"512 B"` |
| `1536` | `"1.50 KB"` |
| `1572864` | `"1.50 MB"` |
| `1073741824` | `"1.00 GB"` |

Цепочка единиц: B → KB → MB → GB → TB → PB → EB.

### FormatSpeed

```go
func FormatSpeed(bytesPerSecond float64) string
```

Форматирует скорость передачи байт в человекочитаемую строку. Единицы те же, что у FormatBytes, но с суффиксом `/s`.

| Вход | Выход |
|------|-------|
| `512.0` | `"512 B/s"` |
| `1572864.0` | `"1.50 MB/s"` |

Часто используется для отображения скорости в колбэках прогресса загрузки.

```go
speed := httpc.FormatSpeed(1572864.0) // "1.50 MB/s"
size := httpc.FormatBytes(1572864)    // "1.50 MB"
```

## DownloadProgressCallback

```go
type DownloadProgressCallback func(downloaded, total int64, speed float64)
```

Сигнатура колбэка прогресса загрузки, используется в `DownloadConfig.ProgressCallback`.

| Параметр | Тип | Описание |
|----------|-----|----------|
| `downloaded` | `int64` | Количество загруженных байт (при докачке включая уже докачанную часть) |
| `total` | `int64` | Общее количество байт (-1, если сервер не вернул Content-Length) |
| `speed` | `float64` | Текущая скорость загрузки (байт/сек), можно передать напрямую в `FormatSpeed` |

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/large.zip"
cfg.ProgressCallback = func(downloaded, total int64, speed float64) {
	if total > 0 {
		pct := float64(downloaded) / float64(total) * 100
		fmt.Printf("\r%.1f%%  %s / %s  %s",
			pct,
			httpc.FormatBytes(downloaded),
			httpc.FormatBytes(total),
			httpc.FormatSpeed(speed),
		)
	}
}
```

## CookieSecurityConfig

```go
type CookieSecurityConfig = validation.CookieSecurityConfig
```

Конфигурация проверки атрибутов безопасности Cookie. Является псевдонимом типа внутреннего `validation.CookieSecurityConfig`, используется в SessionManager и опции запроса `WithSecureCookie`.

```go
type CookieSecurityConfig struct {
    RequireSecure                bool    // Требовать атрибут Secure (только HTTPS)
    RequireHttpOnly              bool    // Требовать атрибут HttpOnly (защита от XSS)
    RequireSameSite              string  // Требовать значение SameSite: "Strict"/"Lax"/"None"/""
    AllowSameSiteNone            bool    // Разрешать ли SameSite=None
    RequireSecureForSameSiteNone bool    // При SameSite=None принудительно требовать Secure
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| `RequireSecure` | `bool` | Требовать атрибут Secure, передача только по HTTPS. В продакшене рекомендуется true |
| `RequireHttpOnly` | `bool` | Требовать атрибут HttpOnly, запрет доступа из JS, защита от XSS. Для сессионных Cookie рекомендуется true |
| `RequireSameSite` | `string` | Требовать значение SameSite. `"Strict"` (только same-site), `"Lax"` (same-site + top-level navigation), `"None"` (все контексты, требует Secure), `""` (без требований) |
| `AllowSameSiteNone` | `bool` | Разрешать ли SameSite=None. При false и пустом RequireSameSite отклоняет Cookie с SameSite=None |
| `RequireSecureForSameSiteNone` | `bool` | При SameSite=None принудительно требовать Secure (соответствует RFC 6265bis). По умолчанию true |

Доступные фабричные функции:

| Фабричная функция | Политика | Сценарий применения |
|-------------------|----------|---------------------|
| `DefaultCookieSecurityConfig()` | Мягкая: разрешает не-HTTPS, доступ из JS, SameSite=None | Среда разработки, приоритет совместимости |
| `StrictCookieSecurityConfig()` | Строгая: требует Secure + HttpOnly + SameSite=Strict | Продакшен, высокобезопасные сценарии (финансы/медицина/госсектор) |

```go
// Строгая политика: требует Secure + HttpOnly + SameSite=Strict
strict := httpc.StrictCookieSecurityConfig()

// Пользовательская политика: требует HttpOnly, разрешает SameSite=Lax
custom := &httpc.CookieSecurityConfig{
    RequireHttpOnly: true,
    RequireSameSite: "Lax",
    AllowSameSiteNone: false,
}

// Применение к SessionManager
sm.SetCookieSecurity(strict)

// Или применение к проверке Cookie одного запроса
result, err := client.Get(url, httpc.WithSecureCookie(strict))
```

:::warning WithSecureCookie чувствителен к порядку
`WithSecureCookie` проверяет только те Cookie, которые **существуют на момент применения**. Он должен идти после всех `WithCookie`/`WithCookieMap`. Для сессионной проверки без учёта порядка используйте `SessionManager.SetCookieSecurity`.
:::

## См. также

- [Типы ошибок](./errors) — полный справочник ClientError, ErrorType и переменных ошибок
- [Опции запроса](../core/options) — использование BodyKind в WithBody
- [Промежуточное ПО](../client-config/middleware) — AuditMiddleware и конфигурация аудита
- [Управление сессиями](../client-config/session) — сессионное использование SessionManager и CookieSecurityConfig
