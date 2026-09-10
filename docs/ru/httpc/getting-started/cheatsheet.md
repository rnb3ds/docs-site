---
sidebar_label: "Шпаргалка"
title: "Шпаргалка - CyberGo HTTPC | Краткая справка по коду"
description: "Шпаргалка HTTPC: клиент и пресеты конфигурации, Get/Post, 28 опций WithXxx, Result, middleware, ошибки ClientError, скачивание файлов и доменный клиент."
sidebar_position: 3
---

# Шпаргалка

## Создание клиента

```go
// Конфигурация по умолчанию
client, _ := httpc.NewDefault()
defer client.Close()

// Пользовательская конфигурация
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 60 * time.Second
cfg.Retry.MaxRetries = 5
client, _ = httpc.New(cfg)
```

```go
// Пресеты в одну строку
client, _ := httpc.New(httpc.SecureConfig())     // Безопасность прежде всего: строгие таймауты, без перенаправлений, лимит 5MB
client, _ = httpc.New(httpc.PerformanceConfig()) // Высокая пропускная способность: большой пул соединений, Cookie включены
client, _ = httpc.New(httpc.TestingConfig())     // Только тесты: без проверки сертификатов и SSRF (не для продакшена)
client, _ = httpc.New(httpc.MinimalConfig())     // Лёгкий режим: без повторов, без перенаправлений

// Значения по умолчанию для запросов (User-Agent / стандартные заголовки / политика перенаправлений)
cfg := httpc.DefaultConfig()
cfg.Defaults.UserAgent = "myapp/2.0"
cfg.Defaults.Headers["Authorization"] = "Bearer " + token
cfg.Defaults.FollowRedirects = false
cfg.Defaults.MaxRedirects = 5
client, _ = httpc.New(cfg)

// Управление клиентом по умолчанию на уровне пакета
_ = httpc.SetDefaultClient(client) // Заменить клиент по умолчанию (старый закрывается автоматически)
_ = httpc.CloseDefaultClient()     // Закрыть и сбросить (следующий пакетный вызов пересоздаст)
```

## HTTP-методы

```go
// Функции пакета (используют клиент по умолчанию)
result, _ := httpc.Get(url)
result, _ := httpc.Post(url)
result, _ := httpc.Put(url)
result, _ := httpc.Patch(url)
result, _ := httpc.Delete(url)
result, _ := httpc.Head(url)
result, _ := httpc.Options(url)

// Методы экземпляра
result, _ := client.Get(url)

// С контекстом
result, _ := httpc.Request(ctx, "GET", url)
result, _ := client.Request(ctx, "POST", url)
```

## Параметры запроса

### Заголовки запроса

```go
httpc.WithHeader("Authorization", "Bearer token")
httpc.WithHeaderMap(map[string]string{"Key": "Value"})
httpc.WithUserAgent("my-app/1.0")
```

### Тело запроса

```go
httpc.WithJSON(data)                    // application/json
httpc.WithXML(data)                     // application/xml
httpc.WithForm(map[string]string{...})  // x-www-form-urlencoded
httpc.WithFormData(formData)            // multipart/form-data
httpc.WithFile("file", "doc.pdf", data) // Загрузка файла
httpc.WithBinary([]byte{...})           // application/octet-stream
httpc.WithBinary([]byte{...}, "image/png") // Явное указание типа
httpc.WithBody(data)                    // Автоопределение типа
httpc.WithBody(data, httpc.BodyJSON)    // Явное указание: BodyJSON/BodyXML/BodyForm/BodyBinary/BodyMultipart
```

Правила автоопределения `WithBody` (`BodyAuto`, по умолчанию): `string` → text/plain; `[]byte` → octet-stream; `map[string]string` → form; `*FormData` → multipart; `io.Reader` → передаётся как есть (Content-Type не устанавливается); остальные типы → JSON.

### Параметры строки запроса

```go
httpc.WithQuery("page", 1)
httpc.WithQueryMap(map[string]any{"page": 1, "limit": 10})
// Примечание: если value равен nil, параметр не попадёт в URL
```

### Аутентификация

```go
httpc.WithBearerToken(token)
httpc.WithBasicAuth("user", "pass")
```

### Cookie

```go
httpc.WithCookie(http.Cookie{Name: "session", Value: "abc"})
httpc.WithCookies([]http.Cookie{{Name: "a", Value: "1"}, {Name: "b", Value: "2"}})
httpc.WithCookieMap(map[string]string{"session": "abc"})
httpc.WithCookieString("session=abc; token=xyz")
httpc.WithSecureCookie(httpc.StrictCookieSecurityConfig()) // Должно идти после всех WithCookie*
```

### Управление

```go
httpc.WithContext(ctx)
httpc.WithTimeout(30 * time.Second)
httpc.WithMaxRetries(3)          // 0 отключает повторы; максимум 10
httpc.WithFollowRedirects(false) // Запретить следование перенаправлениям
httpc.WithMaxRedirects(5)        // Внимание: 0 эквивалентно «не задано» (откат к значению 10 по умолчанию); для запрета используйте строку выше
httpc.WithStreamBody(true)       // Действует только для Download (тело обычного запроса всё равно полностью читается в Result)
httpc.WithAllowPrivateIPs(true)  // Исключение SSRF на уровне запроса (доступ к интрасети/localhost)
```

### Обратные вызовы

```go
httpc.WithOnRequest(func(req httpc.RequestMutator) error {
    log.Printf("Отправка %s %s", req.Method(), req.URL())
    return nil
})
httpc.WithOnResponse(func(resp httpc.ResponseMutator) error {
    log.Printf("Получен ответ: %d", resp.StatusCode())
    return nil
})
```

## Обработка ответа

```go
result.StatusCode()                    // int
result.Body()                          // string
result.RawBody()                       // []byte
result.Proto()                         // "HTTP/1.1"
result.IsSuccess()                     // 2xx
result.IsRedirect()                    // 3xx
result.IsClientError()                 // 4xx
result.IsServerError()                 // 5xx
result.Unmarshal(&data)                // Парсинг JSON
result.GetCookie("name")               // Получение Cookie ответа
result.HasCookie("name")               // Проверка Cookie ответа
result.ResponseCookies()               // Все Cookie ответа
result.RequestCookies()                // Все Cookie запроса
result.GetRequestCookie("name")        // Получение Cookie запроса
result.HasRequestCookie("name")        // Проверка Cookie запроса
result.SaveToFile("/path/to/file")     // Сохранение в файл
result.String()                        // Читаемое представление (чувствительные заголовки маскируются)
```

```go
// Метаданные (result.Meta)
result.Meta.Duration       // Общая длительность (включая ожидание между повторами)
result.Meta.Attempts       // Число попыток (включая первую)
result.Meta.RedirectChain  // Цепочка URL пройденных перенаправлений
result.Meta.RedirectCount  // Число перенаправлений
result.Meta.ProxyURL       // Прокси итогового запроса (пусто при прямом соединении или системном прокси)

// Поля структур (предпочтительны nil-безопасные методы выше)
result.Request.URL            // URL запроса
result.Request.Method         // Метод запроса
result.Request.Headers        // Заголовки запроса
result.Response.Status        // "200 OK"
result.Response.Headers       // Заголовки ответа (http.Header)
result.Response.ContentLength // Content-Length
```

## Конфигурация

```go
cfg := httpc.DefaultConfig()

// Таймауты
cfg.Timeouts.Request = 30 * time.Second        // Общий бюджет (включая повторы), по умолчанию 180s
cfg.Timeouts.Dial = 10 * time.Second           // TCP-соединение, по умолчанию 10s
cfg.Timeouts.TLSHandshake = 10 * time.Second   // TLS-рукопожатие, по умолчанию 10s
cfg.Timeouts.ResponseHeader = 30 * time.Second // По умолчанию 0 (выкл.); после установки — жёсткий лимит транспортного уровня, не переопределяется WithTimeout
cfg.Timeouts.IdleConn = 90 * time.Second       // Неактивные соединения, по умолчанию 90s

// Соединения
cfg.Connection.MaxIdleConns = 50        // Глобальный лимит неактивных соединений (по умолчанию 50, максимум 1000)
cfg.Connection.MaxConnsPerHost = 10     // Лимит соединений на хост (по умолчанию 10, максимум 1000)
cfg.Connection.ProxyURL = "http://proxy:8080"
cfg.Connection.EnableHTTP2 = true
cfg.Connection.EnableCookies = true

// Пул прокси (ротация + пассивный размыкатель)
cfg.Connection.ProxyPool = []string{"http://p1:8080", "http://p2:8080"}
cfg.Connection.ProxyPoolStrategy = httpc.ProxyStrategyRoundRobin // Или ProxyStrategyRandom
cfg.Connection.ProxyFailureThreshold = 3   // Временное отключение после N последовательных сбоев (по умолчанию 3)
cfg.Connection.ProxyCooldown = 30 * time.Second // Полуоткрытая проба после отключения (по умолчанию 30s)
cfg.Connection.ProxyRotatePerRequest = true     // Смена IP на каждый запрос (в ущерб переиспользованию соединений)
cfg.Connection.ProxyRotateOnStatus = []int{403} // Смена прокси и повтор при этих кодах (требуется MaxRetries > 0)

// DNS-over-HTTPS
cfg.Connection.EnableDoH = true
cfg.Connection.DoHCacheTTL = 5 * time.Minute // По умолчанию 5 минут

// Безопасность
cfg.Security.MinTLSVersion = tls.VersionTLS12
cfg.Security.MaxTLSVersion = tls.VersionTLS13
cfg.Security.MaxResponseBodySize = 10 * 1024 * 1024      // По умолчанию 10MB
cfg.Security.MaxDecompressedBodySize = 100 * 1024 * 1024 // По умолчанию 100MB (защита от декомпрессионных бомб)
cfg.Security.MaxRequestBodySize = 50 * 1024 * 1024       // По умолчанию 0 (лимит загрузки не установлен)
cfg.Security.AllowPrivateIPs = false
cfg.Security.SSRFExemptCIDRs = []string{"10.0.0.0/8"}
cfg.Security.RedirectWhitelist = []string{"api.example.com"} // Белый список целей перенаправлений

// Закрепление сертификатов (защита от MITM даже при компрометации доверенного CA)
pinner, _ := httpc.NewSPKIHashPinner("base64-spki-sha256-hash", "backup-hash") // Несколько хэшей — поддержка ротации
cfg.Security.CertificatePinner = pinner

// Повторы
cfg.Retry.MaxRetries = 3              // По умолчанию 3; 0 — отключить; максимум 10
cfg.Retry.Delay = 1 * time.Second     // Начальная задержка, по умолчанию 1s
cfg.Retry.BackoffFactor = 2.0         // Множитель отката, по умолчанию 2.0 (диапазон 1.0-10.0)
cfg.Retry.MaxRetryDelay = 30 * time.Second // Лимит одного ожидания, по умолчанию 30s
cfg.Retry.EnableJitter = true         // Джиттер, по умолчанию включён
cfg.Retry.CustomPolicy = myPolicy     // Пользовательская стратегия (реализует ShouldRetry/GetDelay/MaxRetries)
```

## Промежуточное ПО

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: log.Printf}),
    httpc.RecoveryMiddleware(),
    httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),
    httpc.TimeoutMiddleware(&httpc.TimeoutMiddlewareConfig{Duration: 30 * time.Second}),
    httpc.MetricsMiddleware(&httpc.MetricsConfig{
        OnMetrics: func(method, url string, statusCode int, duration time.Duration, err error) {
            metrics.Record(method, statusCode, duration)
        },
    }),
    httpc.AuditMiddleware(&httpc.AuditConfig{
        OnAudit: func(event httpc.AuditEvent) {
            log.Printf("[AUDIT] %s %s -> %d", event.Method, event.URL, event.StatusCode)
        },
    }),
    httpc.HeaderMiddleware(&httpc.HeaderConfig{ // Статические заголовки (CRLF проверяется при создании)
        Headers: map[string]string{"X-Service": "api"},
    }),
}
```

```go
// Пользовательское middleware: фаза запроса — до next (в порядке регистрации), фаза ответа — после next (в обратном порядке)
func traceMiddleware(next httpc.Handler) httpc.Handler {
    return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
        req.SetHeader("X-Trace", "on") // Фаза запроса
        resp, err := next(ctx, req)    // Передача внутреннему слою
        if resp != nil {
            log.Printf("-> %d", resp.StatusCode()) // Фаза ответа
        }
        return resp, err
    }
}
// Регистрация: cfg.Middleware.Middlewares = append(cfg.Middleware.Middlewares, traceMiddleware)
// Композиция: httpc.Chain(mw1, mw2)(finalHandler)
```

:::warning Предупреждение
Не используйте `TimeoutMiddleware` для `Download` или запросов с `WithStreamBody(true)` (контекст отменяется сразу после получения заголовков ответа, чтение тела завершится ошибкой "context canceled") — в таких сценариях применяйте `WithTimeout`.
:::

## Обработка ошибок

```go
result, err := client.Get(url)
if err != nil {
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        switch clientErr.Type {
        case httpc.ErrorTypeTimeout:
            // Таймаут
        case httpc.ErrorTypeNetwork:
            // Сетевая ошибка
        case httpc.ErrorTypeTLS:
            // Ошибка TLS
        case httpc.ErrorTypeDNS:
            // Ошибка разрешения DNS
        case httpc.ErrorTypeContextCanceled:
            // Отмена контекста
        case httpc.ErrorTypeRetryExhausted:
            // Повторы исчерпаны
        case httpc.ErrorTypeValidation:
            // Ошибка валидации запроса
        case httpc.ErrorTypeHTTP:
            // Ошибка уровня HTTP
        // Остальные: ErrorTypeUnknown, ErrorTypeResponseRead,
        //            ErrorTypeTransport, ErrorTypeCertificate
        }
        if clientErr.IsRetryable() {
            // Можно повторять
        }
    }
}
```

```go
// Короткие коды ошибок (ClientError.Code())
switch clientErr.Code() {
case "TIMEOUT":           // Таймаут
case "NETWORK_ERROR":     // Сетевая ошибка
case "TLS_ERROR":         // Ошибка TLS-рукопожатия/протокола
case "CERTIFICATE_ERROR": // Ошибка проверки сертификата
case "DNS_ERROR":         // Ошибка разрешения DNS
case "CONTEXT_CANCELED":  // Отмена контекста
case "RETRY_EXHAUSTED":   // Повторы исчерпаны
case "VALIDATION_ERROR":  // Ошибка валидации запроса (CRLF/недопустимые заголовки и т.п.)
case "HTTP_ERROR":        // Ошибка уровня HTTP
case "TRANSPORT_ERROR", "RESPONSE_READ_ERROR", "UNKNOWN_ERROR":
}

// Сигнальные ошибки (errors.Is)
errors.Is(err, httpc.ErrClientClosed)         // Использование закрытого клиента
errors.Is(err, httpc.ErrResponseBodyEmpty)    // Пустое тело ответа в Unmarshal
errors.Is(err, httpc.ErrResponseBodyTooLarge) // Тело для парсинга свыше 50MB
errors.Is(err, httpc.ErrFileExists)           // Цель скачивания существует, а Overwrite/Resume не включены
errors.Is(err, httpc.ErrEmptyFilePath)        // DownloadConfig.FilePath не задан

// Быстрая оценка повторяемости
// Всегда повторяемо: таймаут, транспортные ошибки
// Зависит от причины: сетевые ошибки, DNS (временные/таймаут), HTTP 408/429/500/502/503/504
// Никогда не повторяемо: отмена контекста, ошибки валидации, TLS, ошибки сертификатов
```

## Скачивание файлов

```go
// Базовое скачивание (ctx — context.Context, например context.Background())
dlCfg := httpc.DefaultDownloadConfig()
dlCfg.FilePath = "/path/to/file"
dlResult, err := client.Download(ctx, url, dlCfg)

// С опциями (перезапись, докачка, прогресс)
dlCfg := httpc.DefaultDownloadConfig()
dlCfg.FilePath = "/path/to/file"
dlCfg.Overwrite = true
dlCfg.ResumeDownload = true
dlCfg.ProgressCallback = func(downloaded, total int64, speed float64) {
    fmt.Printf("\r%.1f%% (%.2f MB/s)", float64(downloaded)/float64(total)*100, float64(speed)/1024/1024)
}
dlResult, err := client.Download(ctx, url, dlCfg)

// Проверка контрольной суммы (после скачивания; несовпадение — ошибка и удаление файла)
dlCfg.Checksum = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
dlCfg.ChecksumAlgorithm = httpc.ChecksumSHA256 // Пока поддерживается только sha256

// Пакетное скачивание (использует клиент по умолчанию)
dlResult, err := httpc.Download(ctx, url, dlCfg)

// Тип dlResult — *DownloadResult (не *Result)
// Поля: FilePath, BytesWritten, Duration, AverageSpeed, StatusCode, ContentLength, Resumed, ResponseCookies, ActualChecksum
```

## Доменный клиент

```go
dc, _ := httpc.NewDomainDefault("https://api.example.com")
defer dc.Close()

dc.SetHeader("Authorization", "Bearer "+token)
result, _ := dc.Get("/users")
```

```go
// Сессионные заголовки / управление Cookie
dc.SetHeaders(map[string]string{"Authorization": "Bearer " + token, "Accept": "application/json"})
dc.DeleteHeader("Authorization")
dc.ClearHeaders()
dc.SetCookie(&http.Cookie{Name: "session", Value: "abc"}) // Set-Cookie из ответа тоже автоматически попадает в сессию
dc.GetCookie("session")
dc.ClearCookies()
dc.URL()     // "https://api.example.com"
dc.Domain()  // "api.example.com"
dc.Session() // *SessionManager (потокобезопасен)

// Склейка URL: относительный путь отталкивается от base; полный URL используется напрямую; выход за пределы base-пути — ошибка
result, _ = dc.Get("/repos/golang/go")       // https://api.example.com/repos/golang/go
result, _ = dc.Get("https://other.host/api") // Напрямую

// Менеджер сессий можно использовать и отдельно
sm, _ := httpc.NewSessionManagerDefault()
sm.SetHeader("X-App", "demo")
sm.UpdateFromResult(result) // Извлечь Set-Cookie из ответа
```

:::warning Опции выполняются дважды
Опции запроса `DomainClient` внутри применяются дважды (захват сессии + реальный запрос) — не добавляйте опции с побочными эффектами (счётчики, одноразовые nonce).
:::

## Быстрые сценарии

```go
// Таймаут уровня запроса (переопределяет конфигурацию экземпляра)
result, err := client.Get(url, httpc.WithTimeout(30*time.Second))

// Медленные API (AI/LLM): общий таймаут по умолчанию 180s, можно увеличить
result, err := httpc.Post(url,
    httpc.WithJSON(payload),
    httpc.WithTimeout(900*time.Second),
)

// Отключить повторы для этого запроса / поднять лимит повторов
httpc.WithMaxRetries(0)
httpc.WithMaxRetries(5)

// Запретить перенаправления / ограничить их количество
httpc.WithFollowRedirects(false)
httpc.WithMaxRedirects(3)

// Доступ к внутренним сервисам (исключение SSRF на уровне запроса)
result, err := httpc.Get("http://10.0.0.5:8080/health",
    httpc.WithAllowPrivateIPs(true),
)

// Отмена и контроль дедлайна
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()
result, err := httpc.Request(ctx, "GET", url)

// JSON + аутентификация + таймаут одним вызовом
result, err := httpc.Post("https://api.example.com/orders",
    httpc.WithJSON(order),
    httpc.WithBearerToken(token),
    httpc.WithTimeout(15*time.Second),
)
```
