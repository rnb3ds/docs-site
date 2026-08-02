---
sidebar_label: "Типы ошибок"
title: "Типы ошибок - CyberGo HTTPC | Подробно о ClientError"
description: "Справочник API типов ошибок HTTPC: структура ClientError с восемью полями и методами Code, IsRetryable, Unwrap; двенадцать видов перечисления ошибок (ErrorTypeNetwork и др.), сигнальные переменные ошибок (ErrNilConfig и др.) и примеры сопоставления errors.Is/As."
sidebar_position: 3
---

# Типы ошибок

HTTPC использует двухуровневую модель ошибок: нижний уровень — стандартный интерфейс `error`, верхний — классифицированная структура `ClientError`. Все сбои запросов (сетевой уровень) отображаются `classifyError` в `ClientError` с контекстом, предоставляя тип ошибки, оценку повторяемости и структурированные поля. HTTP-ошибки (4xx/5xx) не возвращаются как error, а проверяются через `Result.StatusCode()`.

## ClientError

```go
type ClientError = engine.ClientError
```

Классифицированная ошибка HTTP-клиента, извлекается через `errors.As`. Является псевдонимом типа внутреннего `engine.ClientError`.

### Поля структуры

```go
type ClientError struct {
    Type       ErrorType  // Классификация ошибки
    Message    string     // Описание ошибки
    Cause      error      // Базовая ошибка
    URL        string     // URL запроса (маскирован)
    Method     string     // HTTP-метод
    Attempts   int        // Число попыток
    StatusCode int        // HTTP-код состояния (если применимо)
    Host       string     // Имя хоста (для автоматов выключения)
}
```

| Поле | Тип | Описание | Типичное значение |
|------|-----|----------|-------------------|
| `Type` | `ErrorType` | Классификация ошибки для switch | `ErrorTypeNetwork`, `ErrorTypeTimeout` |
| `Message` | `string` | Описание ошибки | `"network operation failed"` |
| `Cause` | `error` | Базовая ошибка, доступна через `Unwrap()` | `*net.OpError`, `*net.DNSError` |
| `URL` | `string` | URL запроса (учётные данные маскированы) | `"https://example.com/path"` |
| `Method` | `string` | HTTP-метод | `"GET"`, `"POST"` |
| `Attempts` | `int` | Число попыток (включая первый запрос) | `1` (сбой первой попытки), `4` (после 3 повторов) |
| `StatusCode` | `int` | HTTP-код состояния (0 для не-HTTP ошибок) | `0` (сетевая ошибка), `503` (ошибка сервера) |
| `Host` | `string` | Имя хоста запроса (для автоматов выключения) | `"example.com"` |

### Методы

| Метод | Возвращаемое значение | Описание |
|-------|----------------------|----------|
| `Error()` | `string` | Форматирование как `"METHOD url: message: cause (attempt N)"` |
| `Code()` | `string` | Короткий код ошибки, например `"NETWORK_ERROR"`, `"TIMEOUT"` |
| `IsRetryable()` | `bool` | Определяет, стоит ли повторять эту ошибку |
| `Unwrap()` | `error` | Возвращает `Cause`, поддерживает обход цепочки через `errors.Is`/`errors.As` |
| `WithType(t ErrorType)` | `*ClientError` | Возвращает **копию** с установленным типом ошибки (без изменения оригинала) |

### Форматирование Error()

Метод `Error()` форматирует ошибку в читаемую строку:

- При наличии URL и Method: `"GET https://example.com: network operation failed: dial tcp ... (attempt 1)"`
- Только Message: прямой вывод Message
- При наличии Cause: добавляется `": " + Cause.Error()`
- При наличии Attempts (>0): добавляется `" (attempt N)"`

URL перед выводом автоматически маскируется через `SanitizeURL` (удаление учётных данных). Ошибки из классификационного пути движка уже предварительно маскированы (`urlSanitized=true`), пропуская избыточный вызов url.Parse для избежания выделений.

### Код ошибки Code()

`Code()` возвращает короткую строку, идентифицирующую тип ошибки, удобную для классификации логов и мониторинга:

| ErrorType | Возвращаемое Code() |
|-----------|---------------------|
| `ErrorTypeNetwork` | `"NETWORK_ERROR"` |
| `ErrorTypeTimeout` | `"TIMEOUT"` |
| `ErrorTypeContextCanceled` | `"CONTEXT_CANCELED"` |
| `ErrorTypeResponseRead` | `"RESPONSE_READ_ERROR"` |
| `ErrorTypeTransport` | `"TRANSPORT_ERROR"` |
| `ErrorTypeRetryExhausted` | `"RETRY_EXHAUSTED"` |
| `ErrorTypeTLS` | `"TLS_ERROR"` |
| `ErrorTypeCertificate` | `"CERTIFICATE_ERROR"` |
| `ErrorTypeDNS` | `"DNS_ERROR"` |
| `ErrorTypeValidation` | `"VALIDATION_ERROR"` |
| `ErrorTypeHTTP` | `"HTTP_ERROR"` |
| `ErrorTypeUnknown` (и другие) | `"UNKNOWN_ERROR"` |

```go
var clientErr *httpc.ClientError
if errors.As(err, &clientErr) {
    log.Printf("Код ошибки: %s, URL: %s, число попыток: %d, повторяемо: %v",
        clientErr.Code(), clientErr.URL, clientErr.Attempts, clientErr.IsRetryable())
}
```

## Логика определения IsRetryable

`IsRetryable()` — ключевой метод принятия решений механизма повторов HTTPC. Логика:

1. **Приоритетная проверка ошибок контекста**: если Cause — `context.Canceled` или `context.DeadlineExceeded`, прямой возврат false (никогда не повторять)
2. **Диспетчеризация по ErrorType**:

| ErrorType | Повторяемо | Логика определения |
|-----------|:----------:|---------------------|
| `ErrorTypeNetwork` | По обстоятельствам | Проверка Cause: обёрнутый ClientError → рекурсивное определение; `*net.OpError` → таймаут или повторяемый syscall (ECONNREFUSED/ECONNRESET/EPIPE/ETIMEDOUT/ENETUNREACH/EHOSTUNREACH); `net.Error` → по умолчанию повторяемо; сопоставление сообщений ("connection reset"/"eof"/"broken pipe" и др.) |
| `ErrorTypeTimeout` | Да | Все транспортные таймауты повторяемы |
| `ErrorTypeTransport` | Да | Ошибки HTTP-транспортного уровня |
| `ErrorTypeResponseRead` | По обстоятельствам | Только операции чтения (`Op == "read"` или `"readfrom"`) повторяемы; операции записи не повторяются |
| `ErrorTypeDNS` | По обстоятельствам | Когда Cause — `*net.DNSError`, повтор только при `IsTemporary` или `IsTimeout` true |
| `ErrorTypeHTTP` | По обстоятельствам | При попадании StatusCode в `retryableStatusCodes` (408/429/500/502/503/504) повторяемо |
| `ErrorTypeContextCanceled` | Нет | Пользовательская отмена |
| `ErrorTypeValidation` | Нет | Запрос сам по себе некорректен, повтор бессмысленен |
| `ErrorTypeTLS` | Нет | Ошибка протокола TLS, обычно не самоустраняется |
| `ErrorTypeCertificate` | Нет | Сбой проверки сертификата, повтор бессмысленен |
| `ErrorTypeRetryExhausted` | Нет | Повторы уже исчерпаны |
| `ErrorTypeUnknown` | Нет | Неизвестная ошибка, консервативно не повторять |

### retryableStatusCodes

```go
var retryableStatusCodes = map[int]bool{
    408: true, // Request Timeout
    429: true, // Too Many Requests
    500: true, // Internal Server Error
    502: true, // Bad Gateway
    503: true, // Service Unavailable
    504: true, // Gateway Timeout
}
```

Это единственный источник истины для срабатывания повторов по HTTP-кодам состояния, одновременно используется логикой повторов и `IsRetryable()`.

:::tip Тонкое различие типов таймаутов
`ErrorTypeTimeout` повторяем, но **таймаут, вызванный дедлайном контекста, не повторяется** — поскольку `context.DeadlineExceeded` будет перехвачен на шаге 1 (возврат false). Только транспортные таймауты (например, `net.OpError.Timeout()`) доходят до шага 2 и определяются как повторяемые. Это гарантирует, что заданный пользователем `WithTimeout` не будет пробит повтором.
:::

## ErrorType

```go
type ErrorType = engine.ErrorType
```

Перечисление классификации ошибок (тип `int`).

| Константа | Значение | Значение | Типичный сценарий срабатывания | Повторяемо |
|-----------|----------|----------|---------------------------------|:----------:|
| `ErrorTypeUnknown` | 0 | Неизвестно/неклассифицировано | Не сопоставляется ни с одним известным шаблоном | Нет |
| `ErrorTypeNetwork` | 1 | Ошибка сетевого уровня | Отказ соединения, сброс соединения, сеть недоступна | По обстоятельствам |
| `ErrorTypeTimeout` | 2 | Таймаут | Таймаут `net.OpError`, дедлайн контекста¹ | По обстоятельствам² |
| `ErrorTypeContextCanceled` | 3 | Отмена контекста | Срабатывание `context.Cancel` | Нет |
| `ErrorTypeResponseRead` | 4 | Ошибка чтения тела ответа | EOF/обрыв соединения при чтении тела ответа | По обстоятельствам |
| `ErrorTypeTransport` | 5 | Ошибка транспортного уровня | Ошибка протокола HTTP, сбой передачи | Да |
| `ErrorTypeRetryExhausted` | 6 | Исчерпание повторов | Сбой после достижения MaxRetries | Нет |
| `ErrorTypeTLS` | 7 | Ошибка TLS | Сбой TLS-рукопожатия, несовпадение протокола | Нет |
| `ErrorTypeCertificate` | 8 | Ошибка проверки сертификата | Просрочка/недоверие x509 сертификата | Нет |
| `ErrorTypeDNS` | 9 | Ошибка разрешения DNS | Домен не существует, таймаут DNS | По обстоятельствам |
| `ErrorTypeValidation` | 10 | Ошибка валидации запроса | Неверный формат URL, превышение лимита перенаправлений, CRLF-инъекция | Нет |
| `ErrorTypeHTTP` | 11 | Ошибка уровня HTTP | Ответы 4xx/5xx (только в сценариях повтора) | По обстоятельствам |

> ¹ Таймауты, вызванные дедлайном контекста (`WithTimeout`, `TimeoutConfig.Request`), **не** повторяются; только транспортные таймауты (например, таймаут `net.OpError`) повторяются.
> ² Подробнее см. выше [Логика определения IsRetryable](#логика-определения-isretryable).

### Определение типа

```go
result, err := client.Get(url)
if err != nil {
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        switch clientErr.Type {
        case httpc.ErrorTypeTimeout:
            log.Println("Таймаут запроса")
        case httpc.ErrorTypeNetwork:
            log.Println("Сетевая ошибка:", clientErr.Message)
        case httpc.ErrorTypeTLS:
            log.Println("Ошибка TLS")
        case httpc.ErrorTypeCertificate:
            log.Println("Сбой проверки сертификата")
        case httpc.ErrorTypeDNS:
            log.Println("Сбой разрешения DNS")
        case httpc.ErrorTypeRetryExhausted:
            log.Println("Повторы исчерпаны, всего попыток", clientErr.Attempts)
        case httpc.ErrorTypeContextCanceled:
            log.Println("Запрос отменён")
        case httpc.ErrorTypeValidation:
            log.Println("Сбой валидации запроса")
        }
    }
}
```

## Механизм маскировки URL

`ClientError.Error()` при форматировании автоматически вызывает `validation.SanitizeURL` для удаления учётных данных из URL (`user:pass@host` → `***:***@host`), предотвращая утечку конфиденциальной информации в логи и сообщения об ошибках.

```go
// Исходный URL: https://admin:secret@api.example.com/data
// Вывод Error(): GET https://***:***@api.example.com/data: ...
```

Классификационный путь движка (`classifyErrorWithSanitizedURL`) выполняет маскировку при первой классификации и устанавливает `urlSanitized=true`; последующие вызовы `Error()` пропускают избыточный url.Parse, избегая выделений при каждом выводе в лог.

:::tip Маскировка ошибок в колбэках
В колбэках middleware, таких как `MetricsMiddleware` и `LoggingMiddleware`, HTTPC дополнительно проверяет сообщения ошибок, не являющихся ClientError, и заменяет в них исходный URL на маскированную версию, гарантируя, что колбэки не утекают учётные данные.
:::

## Поток классификации ошибок

`classifyError` — основная функция отображения базового `error` в `*ClientError`, последовательно проверяющая по уровням:

1. **Ошибки контекста**: `context.Canceled` → `ErrorTypeContextCanceled`; `context.DeadlineExceeded` → `ErrorTypeTimeout`
2. **Исчерпание пула соединений**: `connection.ErrPoolExhausted` → `ErrorTypeNetwork`
3. **Распаковка `*url.Error`**: неверный заголовок HTTP/2, сбой разбора URL → `ErrorTypeValidation`; иначе распаковка внутреннего ошибки и продолжение проверки
4. **`*net.DNSError`**: `ErrorTypeDNS`, различение таймаута и сбоя
5. **`*net.OpError`**: `ErrorTypeNetwork`, различение таймаута и сбоя операции
6. **`net.Error`**: таймаут → `ErrorTypeTimeout`; прочее → `ErrorTypeNetwork`
7. **Сопоставление шаблонов сообщений** (fallback): по ключевым словам сообщения — TLS/certificate/timeout/connection refused и др. (20+ шаблонов)
8. **Запасной вариант**: если внутренний `url.Error` не сопоставлен ни с одним шаблоном → `ErrorTypeNetwork`; иначе → `ErrorTypeUnknown`

## Переменные ошибок

### Ошибки конфигурации

| Переменная | Сообщение об ошибке | Условие срабатывания |
|------------|---------------------|----------------------|
| `ErrNilConfig` | `"config cannot be nil"` | Передача nil Config в `New`/`ValidateConfig` |
| `ErrInvalidTimeout` | `"invalid timeout"` | Отрицательное значение таймаута или превышение лимита 30 минут |
| `ErrInvalidRetry` | `"invalid retry configuration"` | MaxRetries вне 0–10, BackoffFactor вне 1.0–10.0 |
| `ErrInvalidConnection` | `"invalid connection configuration"` | MaxIdleConns/MaxConnsPerHost вне диапазона, неверный формат ProxyURL |
| `ErrInvalidSecurity` | `"invalid security configuration"` | MaxResponseBodySize вне диапазона 0–1GB |
| `ErrInvalidMiddleware` | `"invalid middleware configuration"` | MaxRedirects вне 0–50, слишком длинный UserAgent или управляющие символы |
| `ErrInvalidHeader` | `"invalid header"` | Ключ/значение заголовка запроса с управляющими символами или превышение лимита размера |

### Ошибки запроса и ответа

| Переменная | Сообщение об ошибке | Условие срабатывания |
|------------|---------------------|----------------------|
| `ErrEmptyFilePath` | `"file path cannot be empty"` | Пустой DownloadConfig.FilePath |
| `ErrFileExists` | `"file already exists"` | Файл существует и Overwrite=false и ResumeDownload=false |
| `ErrResponseBodyEmpty` | `"response body is empty"` | Вызов методов парсинга (Unmarshal и др.) при пустом теле ответа |
| `ErrResponseBodyTooLarge` | `"response body too large"` | Тело ответа превышает MaxResponseBodySize |

### Ошибки клиента

| Переменная | Сообщение об ошибке | Условие срабатывания |
|------------|---------------------|----------------------|
| `ErrClientClosed` | `"client is closed"` | Использование клиента после Close() |

## Практичные шаблоны сопоставления

### Извлечение ClientError через errors.As

```go
result, err := client.Get(url)
if err != nil {
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        // Доступ к структурированным полям
        fmt.Printf("Код ошибки: %s\n", clientErr.Code())
        fmt.Printf("Тип ошибки: %d\n", clientErr.Type)
        fmt.Printf("Запрос: %s %s\n", clientErr.Method, clientErr.URL)
        fmt.Printf("Число попыток: %d\n", clientErr.Attempts)
        if clientErr.StatusCode != 0 {
            fmt.Printf("Код состояния: %d\n", clientErr.StatusCode)
        }
    }
}
```

### Сопоставление сигнальных ошибок через errors.Is

```go
if errors.Is(err, httpc.ErrClientClosed) {
    // Клиент закрыт, нужно пересоздать
}
if errors.Is(err, httpc.ErrResponseBodyEmpty) {
    // Тело ответа пусто, пропуск парсинга
}
if errors.Is(err, httpc.ErrFileExists) {
    // Файл уже существует, подсказка пользователю или установка Overwrite=true
}
```

### Обход цепочки ошибок через errors.Unwrap

```go
var clientErr *httpc.ClientError
if errors.As(err, &clientErr) {
    // Cause — базовая ошибка (например, *net.OpError)
    cause := clientErr.Unwrap()
    if cause != nil {
        var opErr *net.OpError
        if errors.As(cause, &opErr) {
            fmt.Println("Операция:", opErr.Op)
            fmt.Println("Сеть:", opErr.Net)
            fmt.Println("Адрес:", opErr.Addr)
        }
    }
}
```

:::tip Выбор из трёх способов сопоставления
- `errors.As`: для доступа к структурированным полям ClientError (Type/Code/URL/Attempts и др.)
- `errors.Is`: для сопоставления сигнальных ошибок (ErrClientClosed и др. — конфигурационные/файловые ошибки)
- `errors.Unwrap`: для достижения самого нижнего net/error с получением системной диагностической информации
:::

## См. также

- [Обработка ошибок](../../guides/error-handling) — полное руководство по обработке ошибок
- [Константы и типы](./constants) — справочник констант BodyKind и др.
- [Повторные попытки и отказоустойчивость](../../guides/retry-fault-tolerance) — руководство по стратегии повторов
