---
sidebar_label: "Миграция с net/http"
title: "Миграция с net/http - CyberGo HTTPC | Справочник миграции"
description: "Миграция с net/http на CyberGo HTTPC: таблица соответствия API от http.Get до Transport и CookieJar, различия модели ошибок, таймауты и ловушки перехода."
sidebar_position: 2
---

# Миграция с net/http

Уже знакомы с `net/http`? Это руководство отображает ваш опыт со стандартной библиотекой на HTTPC пункт за пунктом: какие конструкции заменяются механически, где изменилась семантика и какие поведения по умолчанию требуют пересмотра. Все описания поведения сверены с исходным кодом.

## Обзор совместимости: построен поверх net/http

HTTPC — не замена `net/http`, а слой улучшений поверх его транспортного уровня. Движком по-прежнему служат `http.Client` и `http.Transport` — переиспользование соединений, согласование HTTP/2, TLS-сессии и прокси-туннели полностью выполняются стандартной библиотекой; HTTPC добавляет поверх проверки безопасности, движок повторов, цепочку middleware и преобразование в `Result` (подробнее — в [FAQ «Как HTTPC соотносится с net/http?»](../faq/#как-httpc-соотносится-с-net-http)).

**Что не меняется при миграции:**

- **Поведение транспортного уровня** — переиспользование пула соединений, согласование HTTP/2 и возобновление TLS-сессий идентичны стандартной библиотеке, характеристики производительности не деградируют;
- **Типы используются напрямую** — `http.Cookie`, `tls.Config`, `context.Context`, `io.Reader`, `http.Header` применяются как есть, слой адаптации не нужен;
- **Ментальная модель** — функциям уровня пакета соответствуют `http.Get`, экземпляру Client — `http.Client`, способ передачи контекста тот же (см. двухуровневую архитектуру API в [Основных концепциях](../getting-started/concepts)).

**Что миграция добавляет:**

- принудительный TLS 1.2+, защиту от SSRF, проверку CRLF-инъекций и лимит размера тела ответа (безопасность по умолчанию);
- интеллектуальные повторы с экспоненциальным откатом (уважают `Retry-After`, бюджет таймаута общий для всех повторов);
- цепочку middleware в луковой модели (логирование/метрики/аудит/ID запроса);
- универсальную обёртку `Result` — жизненный цикл тела ответа управляется автоматически, `Close()` не нужен.

Один и тот же запрос до и после миграции:

```go
package main

import (
    "fmt"
    "io"
    "net/http"
)

func main() {
    resp, err := http.Get("https://httpbin.org/get")
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close() // закрывать нужно вручную, иначе утечка соединений

    body, err := io.ReadAll(resp.Body)
    if err != nil {
        panic(err)
    }

    fmt.Println(resp.StatusCode) // 200
    fmt.Println(len(body))       // количество байт ответа
}
```

```go
package main

import (
    "fmt"

    "github.com/cybergodev/httpc"
)

func main() {
    result, err := httpc.Get("https://httpbin.org/get")
    if err != nil {
        panic(err) // только ошибки сетевого уровня
    }

    fmt.Println(result.StatusCode())  // 200
    fmt.Println(len(result.RawBody())) // количество байт ответа (уже в памяти, закрывать не нужно)
}
```

После миграции код короче, а по умолчанию уже включены политика TLS, защита от SSRF и до трёх интеллектуальных повторов.

## Таблица соответствия API

### Клиент и запрос

| Запись в net/http | Эквивалент HTTPC | Ключевые отличия |
|-------------------|------------------|------------------|
| `http.Get(url)` | `httpc.Get(url)` | Аналогично: функция уровня пакета + общий экземпляр по умолчанию (ленивая инициализация) |
| `http.Post(url, ct, body)` | `httpc.Post(url, httpc.WithJSON(data))` | Тело запроса задаётся декларативно опциями `With*`, Content-Type проставляется автоматически |
| `http.PostForm(url, values)` | `httpc.Post(url, httpc.WithForm(m))` | `WithForm` принимает `map[string]string`; для `url.Values` используйте `WithBody(values, httpc.BodyForm)` |
| `http.Head(url)` | `httpc.Head(url)` | Прямое соответствие; аналогично `Put/Patch/Delete/Options` |
| `client := &http.Client{...}` | `httpc.New(cfg)` / `httpc.NewDefault()` | Возвращает интерфейс `Client`; владеет пулом соединений, для освобождения требуется `Close()` |
| `http.DefaultClient` | Внутренний клиент по умолчанию в функциях уровня пакета | Ленивый синглтон; `SetDefaultClient` подменяет, после `CloseDefaultClient` автоматически пересоздаётся |
| `http.NewRequest` + `client.Do(req)` | `client.Get(url, opts...)` и другие метод-глаголы | Конструировать `*http.Request` не нужно; метод и URL передаются напрямую |
| `http.NewRequestWithContext` + `Do` | `client.Request(ctx, method, url, opts...)` | Универсальная форма для любой строки метода |
| `req.Header.Set(k, v)` | `httpc.WithHeader(k, v)` / `WithHeaderMap(m)` | Ключи и значения заголовков проходят проверку на CRLF-инъекции, некорректные значения возвращают `ErrInvalidHeader` |
| `req.Header.Set("User-Agent", ua)` | `httpc.WithUserAgent(ua)` | Значение по умолчанию на уровне экземпляра — `cfg.Defaults.UserAgent` |
| `req.SetBasicAuth(u, p)` | `httpc.WithBasicAuth(u, p)` | С проверкой формата |
| `req.AddCookie(&http.Cookie{...})` | `httpc.WithCookie(http.Cookie{...})` | Принимает значение (не указатель); для набора — `WithCookies`/`WithCookieMap`/`WithCookieString` |
| `req.URL.Query()` + склейка строки запроса | `httpc.WithQuery(k, v)` / `WithQueryMap(m)` | Значения поддерживают распространённые скаляры и `fmt.Stringer`, автоматически кодируются и сливаются с URL |
| `jar, _ := cookiejar.New(nil)` на `client.Jar` | `cfg.Connection.EnableCookies = true` | Или `DomainClient` с автоматическим ведением Cookie и общих заголовков (см. [Доменный клиент и сессии](./domain-session)) |
| `client.CheckRedirect = func(...)` | `cfg.Defaults.FollowRedirects` / `MaxRedirects` | На уровне запроса — `WithFollowRedirects(false)`; белый список доменов перенаправлений — `Security.RedirectWhitelist` (см. [Перенаправления](./redirects)) |
| Прокси: `Transport.Proxy` | `cfg.Connection.ProxyURL` / `ProxyPool` / `EnableSystemProxy` | Три способа применяются по приоритету, подробнее — в [Прокси и пул прокси](./proxy) |

### Обработка ответа

| Запись в net/http | Эквивалент HTTPC | Ключевые отличия |
|-------------------|------------------|------------------|
| `resp.StatusCode` | `result.StatusCode()` | Nil-безопасный аксессор; для проверки состояния — `IsSuccess()` / `IsClientError()` / `IsServerError()` / `IsRedirect()` |
| `resp.Status` / `resp.Proto` | `result.Response.Status` / `result.Proto()` | Версия протокола, например `HTTP/1.1` |
| `resp.Header.Get(k)` | `result.Response.Headers.Get(k)` | По-прежнему стандартный `http.Header`, регистронезависимый |
| `io.ReadAll(resp.Body)` | `result.Body()` / `result.RawBody()` | Тело ответа уже прочитано в память и скопировано, распаковка выполняется автоматически |
| `defer resp.Body.Close()` | Нет эквивалента | **Не** ищите точку закрытия — соединениями управляет пул, `Result` отдан сборщику мусора |
| `json.NewDecoder(resp.Body).Decode(&v)` | `result.Unmarshal(&v)` | Пустое тело возвращает сигнальную ошибку `ErrResponseBodyEmpty` (не `io.EOF`, см. ниже) |
| `resp.Cookies()` | `result.ResponseCookies()` / `result.GetCookie(name)` | Дополнительно `GetRequestCookie` показывает фактически отправленные Cookie |
| `resp.ContentLength` | `result.Response.ContentLength` | — |
| `resp.Request` (итоговый запрос после перенаправлений) | `result.Request` | Содержит `URL` / `Method` / `Headers` / `Cookies` |
| `io.Copy(f, resp.Body)` для сохранения на диск | `result.SaveToFile(path)` | Для больших файлов используйте `Download` (потоково, с докачкой, см. [Загрузка и скачивание файлов](./file-transfer)) |
| (нет эквивалента) | `result.Meta` | Новое в HTTPC: `Duration` / `Attempts` / `RedirectChain` / `ProxyURL` |
| `resp.Trailer` | Нет эквивалента | `Result` не раскрывает trailer; сценарии с зависимостью от trailer пока не поддерживаются |

## Различия модели ошибок

Это **самое коварное** место миграции. Сначала о совпадающем: ни одна из библиотек не считает 4xx/5xx ошибкой `error` — `err` означает лишь, что запрос не удалось завершить. Настоящие различия — в форме `err`, жизненном цикле тела ответа и поведении повторов:

| Аспект | net/http | HTTPC |
|--------|----------|-------|
| Форма ошибки | Исходная транспортная ошибка, обёрнутая в `*url.Error` | Классифицированная ошибка `*ClientError` (12 типов в перечислении `ErrorType`) |
| Классификация | Утверждение типа (`net.Error`, `net.DNSError`, `x509.UnknownAuthorityError`…) или разбор строки | Извлечение через `errors.As` и чтение `Code()` / `IsRetryable()` / `Attempts`; сигнальные ошибки — через `errors.Is` |
| Ответ при `err != nil` | `resp` может быть не nil (при ошибке от `CheckRedirect` прилагается последний ответ) | `result` всегда nil, проверять ответ на nil не нужно |
| Ошибки чтения тела | Возникают только в `io.ReadAll` / `Decode` (`io.EOF`, `unexpected EOF`) | Тело прочитано на этапе запроса; сбой чтения возвращается как `ClientError` (`ErrorTypeResponseRead`) вместе с `err` |
| Пустое тело + декодирование JSON | `Decode` возвращает `io.EOF` | `Unmarshal` возвращает `ErrResponseBodyEmpty` |
| Повторы | Нет — ошибка сразу уходит вызывающему | Таймауты/транспортные ошибки и 408/429/500/502/503/504 повторяются автоматически; при исчерпании сетевых ошибок возвращается `error`, при исчерпании повторяемых статус-кодов — **последний ответ** |
| URL в сообщении ошибки | Выводится как есть (может содержать учётные данные) | Маскируется автоматически (учётные данные `***:***`, чувствительные параметры `[REDACTED]`) |

Типичная обработка ошибок до миграции:

```go
package main

import (
    "encoding/json"
    "errors"
    "fmt"
    "io"
    "net/http"
)

func main() {
    resp, err := http.Get("https://api.example.com/users/42")
    if err != nil {
        // *url.Error: сбои соединения, таймауты и ошибки TLS выходят сюда;
        // для классификации нужны утверждения типа или разбор строки
        panic(err)
    }
    defer resp.Body.Close()

    // 4xx/5xx — не error: обычный путь, статус проверяется вручную
    if resp.StatusCode != http.StatusOK {
        fmt.Println("HTTP-ошибка:", resp.StatusCode)
        return
    }

    var user map[string]any
    // При пустом теле Decode возвращает io.EOF — часто забываемая ветка
    if err := json.NewDecoder(resp.Body).Decode(&user); err != nil && !errors.Is(err, io.EOF) {
        panic(err)
    }
    fmt.Println(user["name"])
}
// Вывод (зависит от ответа сервера):
// HTTP-ошибка: 404
```

После миграции:

```go
package main

import (
    "errors"
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    result, err := httpc.Get("https://api.example.com/users/42")
    if err != nil {
        // Ошибка сетевого уровня: классифицирована как ClientError (12 типов),
        // с коротким кодом и признаком повторяемости
        var clientErr *httpc.ClientError
        if errors.As(err, &clientErr) {
            log.Printf("Тип ошибки: %s, повторяемая: %v, попыток: %d",
                clientErr.Code(), clientErr.IsRetryable(), clientErr.Attempts)
        }
        panic(err)
    }

    // 4xx/5xx — не error: проверяется методами состояния Result
    if !result.IsSuccess() {
        fmt.Println("HTTP-ошибка:", result.StatusCode())
        return
    }

    var user map[string]any
    // Пустое тело возвращает сигнальную ошибку ErrResponseBodyEmpty,
    // точно ловится через errors.Is
    if err := result.Unmarshal(&user); err != nil {
        if errors.Is(err, httpc.ErrResponseBodyEmpty) {
            fmt.Println("(пустое тело ответа)")
            return
        }
        panic(err)
    }
    fmt.Println(user["name"])
}
// Вывод (зависит от ответа сервера):
// HTTP-ошибка: 404
```

Типичные сценарии классификации ошибок (`clientErr` — `*httpc.ClientError`, извлечённый через `errors.As`):

| Что проверяем | Запись в net/http | Запись в HTTPC |
|---------------|-------------------|----------------|
| Таймаут | `var ne net.Error` + `ne.Timeout()` | `clientErr.Type == httpc.ErrorTypeTimeout` |
| Сбой DNS | `var de *net.DNSError` + `errors.As` | `httpc.ErrorTypeDNS` |
| Сбой проверки сертификата | `var ce x509.UnknownAuthorityError` + `errors.As` | `httpc.ErrorTypeCertificate` |
| Ошибка протокола TLS | Разбор строки `"tls:"` | `httpc.ErrorTypeTLS` |
| Отказ/сброс соединения | `var oe *net.OpError` + `errors.As` | `httpc.ErrorTypeNetwork` |
| Отмена/дедлайн контекста | `errors.Is(err, context.Canceled)` | `httpc.ErrorTypeContextCanceled` (никогда не повторяется) |

Полное описание классификации ошибок, повторяемости и сигнальных ошибок — в [Обработке ошибок](./error-handling) и [Типах ошибок](../api-reference/types/errors).

## Миграция тела запроса, заголовков и контекста

Трёхшаговая схема net/http «построить запрос → устанавливать параметры по одному → Do» в HTTPC сворачивается в «метод-глагол + декларативные опции».

<!-- check-code: skip -->
```go
// net/http: ручная сериализация, ручные заголовки, ручная сборка строки запроса
payload, _ := json.Marshal(map[string]any{"name": "test"})
req, err := http.NewRequest("POST", "https://api.example.com/orders", bytes.NewReader(payload))
if err != nil {
    log.Fatal(err)
}
req.Header.Set("Content-Type", "application/json")
req.Header.Set("Authorization", "Bearer "+token)

q := req.URL.Query()
q.Set("page", "2")
req.URL.RawQuery = q.Encode()

resp, err := client.Do(req)
```

<!-- check-code: skip -->
```go
// HTTPC: опции и есть запрос, Content-Type проставляется автоматически,
// параметры запроса кодируются сами
result, err := client.Post("https://api.example.com/orders",
    httpc.WithJSON(map[string]any{"name": "test"}),
    httpc.WithBearerToken(token),
    httpc.WithQuery("page", 2),
)
```

Соответствие операций стандартной библиотеки опциям запроса:

| Операция стандартной библиотеки | Опция HTTPC |
|---------------------------------|-------------|
| `json.Marshal` + `bytes.NewReader` + Content-Type | `WithJSON(data)` (эквивалент `WithBody(data, BodyJSON)`) |
| `xml.Marshal` | `WithXML(data)` |
| Кодирование формы `url.Values` | `WithForm(m)` / `WithBody(values, httpc.BodyForm)` |
| Ручной `multipart.Writer` с границей | `WithFile(field, name, content)` / `WithFormData(form)` |
| `bytes.NewReader(raw)` для сырого тела | `WithBody(raw)` (тип определяется автоматически) / `WithBinary(data, ct...)` |
| `req.Header.Set(k, v)` | `WithHeader(k, v)` / `WithHeaderMap(m)` |
| `req.SetBasicAuth` / ручная сборка Bearer | `WithBasicAuth(u, p)` / `WithBearerToken(t)` |
| `req.AddCookie` | `WithCookie(c)` / `WithCookies(cs)` / `WithCookieMap(m)` / `WithCookieString(s)` |
| Потоковое тело `io.Reader` | `WithBody(reader)` (передаётся как есть; **обходит проверку размера**, оберните в `io.LimitReader`) |

Работа с контекстом как в стандартной библиотеке — `context.Context` остаётся носителем таймаутов и отмены, меняется лишь место передачи:

<!-- check-code: skip -->
```go
// net/http: ctx вкладывается в объект запроса
req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
resp, err := client.Do(req)
```

<!-- check-code: skip -->
```go
// HTTPC: ctx передаётся первым аргументом напрямую
result, err := client.Request(ctx, "GET", url)

// Удобные методы (Get/Post и др.) не принимают ctx — подмените через WithContext:
result, err = client.Get(url, httpc.WithContext(ctx))
```

Полный список опций — в [Запросах и ответах](./request-response) и [Параметрах запроса API](../api-reference/core/options).

## Сопоставление системы таймаутов

`http.Client.Timeout` — единый таймаут на весь процесс; HTTPC раскладывает его на пять независимых настроек и добавляет переопределение на уровне запроса:

| net/http | Поле HTTPC | По умолчанию | Область действия |
|----------|-----------|--------------|------------------|
| `http.Client.Timeout` | `Timeouts.Request` | 180s | Общий таймаут запроса, **включая все повторы и ожидания отката** |
| `Transport.DialContext` (`net.Dialer{Timeout}`) | `Timeouts.Dial` | 10s | Установка TCP-соединения |
| `Transport.TLSHandshakeTimeout` | `Timeouts.TLSHandshake` | 10s | TLS-рукопожатие (только HTTPS) |
| `Transport.ResponseHeaderTimeout` | `Timeouts.ResponseHeader` | 0 (отключено) | Ожидание заголовков ответа; положительное значение — жёсткий предел транспортного уровня |
| `Transport.IdleConnTimeout` | `Timeouts.IdleConn` | 90s | Время удержания простаивающих соединений |
| (нет переопределения на уровне запроса) | `WithTimeout(d)` | — | Переопределение общего бюджета для одного запроса; предел — 30 минут |

<!-- check-code: skip -->
```go
// net/http: единый таймаут на весь процесс (без повторов)
client := &http.Client{Timeout: 30 * time.Second}
```

<!-- check-code: skip -->
```go
// HTTPC: общий бюджет на уровне экземпляра + переопределение на уровне запроса
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 30 * time.Second // общий бюджет, включая все повторы
client, _ := httpc.New(cfg)

result, err := client.Get(url, httpc.WithTimeout(30*time.Second)) // переопределение для этого запроса
```

Три смысловых отличия стоит держать в уме:

- **Общий бюджет разделён всеми повторами** — `Timeouts.Request` / `WithTimeout` покрывают все попытки и ожидания отката, а не отсчитываются заново на каждую попытку;
- **`ResponseHeader` особенный** — по умолчанию 0 (отключено) и полностью управляется общим бюджетом; положительное значение действует на **все запросы** одного клиента и при меньшем значении перекрывает `WithTimeout` (эшелонированная защита от slowloris, уже настроена в `SecureConfig()`);
- **Долгие ответы** — интерфейсам с долгим ожиданием (AI API и т. п.) просто выдайте достаточный бюджет через `WithTimeout`; по умолчанию проблемы «таймаут заголовков обрывает медленный ответ» не существует.

Подробнее — в разделе таймаутов [Запросов и ответов](./request-response) и в [FAQ «Как выбрать таймауты?»](../faq/#как-выбрать-таймауты).

## Миграция настройки Transport

Распространённые поля тонкой настройки `http.Transport` в HTTPC целиком отображаются на соответствующие подструктуры `Config`:

| Поле `http.Transport` / `http.Client` | Конфигурация HTTPC | По умолчанию |
|----------------------------------------|--------------------|--------------|
| `MaxIdleConns` | `Connection.MaxIdleConns` | 50 |
| `MaxConnsPerHost` / `MaxIdleConnsPerHost` | `Connection.MaxConnsPerHost` | 10 |
| `Proxy: http.ProxyFromEnvironment` | `Connection.EnableSystemProxy` | false |
| Пользовательская функция `Proxy` | `Connection.ProxyURL` (одиночный прокси) / `ProxyPool` (ротация в пуле) | пусто |
| `TLSClientConfig` | `Security.TLSConfig` | nil |
| `ForceAttemptHTTP2` | `Connection.EnableHTTP2` | true |
| `ResponseHeaderTimeout` | `Timeouts.ResponseHeader` | 0 (отключено) |
| `MaxResponseHeaderBytes` | `Connection.MaxResponseHeaderBytes` | 0 (по умолчанию стандартной библиотеки 10MB) |
| `CheckRedirect` | `Defaults.FollowRedirects` / `MaxRedirects` + `Security.RedirectWhitelist` | true / 10 |
| Пользовательский `DialContext` (диалер) | Прямого входа нет | SSRF-проверки обёрнуты в слой установки соединения |

Имеющиеся знания о `tls.Config` (mTLS, пользовательские CA, наборы шифров) переносятся без изменений:

```go
package main

import (
    "crypto/tls"
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    // Имеющийся tls.Config (пользовательский CA, наборы шифров,
    // клиентский сертификат mTLS) переносится как есть
    tlsCfg := &tls.Config{
        MinVersion: tls.VersionTLS12,
        MaxVersion: tls.VersionTLS13,
    }

    cfg := httpc.DefaultConfig()
    cfg.Security.TLSConfig = tlsCfg
    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://httpbin.org/get")
    if err != nil {
        log.Fatal(err) // ошибка сетевого уровня
    }
    fmt.Println(result.StatusCode()) // 200
}
```

:::warning Предупреждение
Как только задан `Security.TLSConfig`, поля `MinTLSVersion` / `MaxTLSVersion` игнорируются — политика версий TLS определяется переданным вами `tls.Config` (не забудьте сами задать `MinVersion` не ниже TLS 1.2).
:::

Две границы нужно знать:

- **Нет точки внедрения пользовательского Transport** — HTTPC сам создаёт и управляет `*http.Transport` (SSRF-проверки обёрнуты в функцию установки соединения, политика перенаправлений внедряется через `CheckRedirect`), `Config` не раскрывает Transport целиком. Если нужна экстремальная настройка поведения диалера, сначала проверьте, не покрывают ли уже `Config.Connection` / `Config.Security`.
- **Для подмены всей реализации есть `Doer`** — тестовым заглушкам и заменяющим реализациям достаточно одно-методного интерфейса `Doer` (`Request(ctx, method, url, opts...)`), без стыковки с полным интерфейсом `Client`, см. [Тестирование](./testing).

## Ловушки миграции

При переходе с `net/http` чаще всего подводят следующие различия в поведении:

**1. `resp.Body` не нужно (и нельзя) закрывать вручную**

`Result` хранит уже прочитанные и скопированные байты: HTTPC сам выполняет чтение, дочитывание и закрытие, а соединениями управляет пул. При миграции **удалите все `defer resp.Body.Close()`** и не ищите точку закрытия. Подробнее см. [FAQ «Нужно ли вручную закрывать тело ответа?»](../faq/#нужно-ли-вручную-закрывать-тело-ответа).

**2. Повторы включены по умолчанию — неидемпотентный POST может продублироваться**

`net/http` никогда не повторяет; HTTPC по умолчанию повторяет до 3 раз при таймаутах/транспортных ошибках и кодах 408/429/500/502/503/504, **не различая метод запроса**. Интерфейсы заказа и списания обязательны к обработке:

<!-- check-code: skip -->
```go
// Опасно: по умолчанию до 3 повторов, POST тоже участвует в повторах
result, err := client.Post("https://api.example.com/orders", httpc.WithJSON(order))

// Безопасно (способ 1): отключение повторов на уровне запроса для неидемпотентного API
result, err = client.Post("https://api.example.com/orders",
    httpc.WithJSON(order),
    httpc.WithMaxRetries(0),
)

// Безопасно (способ 2): идемпотентный ключ на стороне сервера (рекомендуется)
result, err = client.Post("https://api.example.com/orders",
    httpc.WithJSON(order),
    httpc.WithHeader("Idempotency-Key", orderID),
)
```

Подробнее о стратегиях снижения риска — в [FAQ «Могут ли повторы привести к дублированию POST?»](../faq/#могут-ли-повторы-привести-к-дублированию-post).

**3. Защита от SSRF включена по умолчанию — внутренняя сеть и localhost блокируются**

После миграции с `net/http` обращение к приватным/зарезервированным адресам вроде `127.0.0.1`, `10.x`, `192.168.x` завершится ошибкой (в `net/http` такого ограничения нет). Для локальной отладки выбирайте по возрастанию радиуса воздействия:

<!-- check-code: skip -->
```go
// Освобождение на уровне запроса (рекомендуется, минимальный радиус воздействия)
result, err := httpc.Get("http://localhost:8080/health",
    httpc.WithAllowPrivateIPs(true),
)

// Точное освобождение CIDR на уровне клиента (например, VPC / Tailscale)
cfg := httpc.DefaultConfig()
cfg.Security.SSRFExemptCIDRs = []string{"10.0.0.0/8"}
```

Полная политика — в [Защите от SSRF](../security/ssrf).

**4. Клиент по умолчанию — ленивый синглтон, для долгоживущего сервиса создайте явный экземпляр**

Функции уровня пакета делят один внутренне управляемый клиент по умолчанию (автоматически пересоздаваемый после закрытия). Продакшен-сервису следует создать явный экземпляр для контроля конфигурации и жизненного цикла; запрос после `Close()` возвращает `ErrClientClosed`:

<!-- check-code: skip -->
```go
// Долгоживущий сервис: явный экземпляр, общий на процесс, Close по завершении
client, err := httpc.NewDefault()
if err != nil {
    log.Fatal(err)
}
defer client.Close()

// Чтобы функции уровня пакета использовали вашу конфигурацию:
// подмена клиента по умолчанию (старый закрывается автоматически)
custom, err := httpc.New(httpc.SecureConfig())
if err != nil {
    log.Fatal(err)
}
if err := httpc.SetDefaultClient(custom); err != nil {
    log.Fatal(err)
}
```

**5. Сигнальные ошибки ловите через `errors.Is` / `errors.As`, а не разбор строк**

`ErrClientClosed`, `ErrResponseBodyEmpty`, `ErrResponseBodyTooLarge`, `ErrInvalidHeader` и другие сигнальные ошибки проверяйте через `errors.Is`; классифицированные ошибки извлекайте через `errors.As` в `*ClientError`. Цепочка ошибок проницаема до первопричины (`Cause`).

**6. У тела ответа есть лимиты по умолчанию**

Для обычных запросов лимит тела ответа по умолчанию 10MB, распакованного — 100MB (защита от исчерпания памяти и бомб распаковки); при превышении возвращается ошибка. Старый код `http.Get` + `io.Copy` для скачивания больших файлов переведите на `Download` (потоковая запись на диск, докачка, колбэк прогресса). Лимиты настраиваются через `Security.MaxResponseBodySize` / `MaxDecompressedBodySize`.

**7. Поведение перенаправлений предсказуемо, но тоже имеет умолчания**

По умолчанию перенаправления следуются (лимит 10). Учтите, что `WithMaxRedirects(0)` / `MaxRedirects = 0` — сигнальное значение «не задано», а не запрет: для запрета следования используйте `WithFollowRedirects(false)` или `Defaults.FollowRedirects = false`. Подробнее — в [Перенаправлениях](./redirects).

## Пошаговый чек-лист миграции

Выполняйте по порядку — каждый шаг проверяется независимо:

1. **Установите зависимость** — `go get github.com/cybergodev/httpc`, замените клиентские вызовы `"net/http"` на `"github.com/cybergodev/httpc"` (типы вроде `http.Cookie` по-прежнему импортируются из стандартной библиотеки).
2. **Механически замените вызовы запросов** — `http.Get` → `httpc.Get`, `client.Do(req)` → `client.Get/Post/...`; литерал `http.Client` → `httpc.New(cfg)`.
3. **Удалите код управления ресурсами** — уберите `defer resp.Body.Close()`, `io.ReadAll`; используйте `result.Body()` / `result.RawBody()` / `result.Unmarshal(&v)`.
4. **Переделайте обработку ошибок** — в ветке `err` при необходимости добавьте `errors.As` для извлечения `ClientError`; проверку статус-кода замените на семейство `result.IsSuccess()`; ветку пустого тела `io.EOF` — на `errors.Is(err, httpc.ErrResponseBodyEmpty)`.
5. **Отобразите таймауты** — `http.Client.Timeout` → `cfg.Timeouts.Request`; отличия на уровне запроса — `WithTimeout`; таймауты уровня Transport разместите по [сопоставлению системы таймаутов](#сопоставление-системы-таймаутов).
6. **Перенесите настройку Transport** — размеры пула, прокси, TLS и HTTP/2 разместите по таблице выше в `Config.Connection` / `Config.Security`; `tls.Config` перенесите в `Security.TLSConfig`.
7. **Обработайте безопасные умолчания** — добавьте освобождение SSRF для вызовов внутренней сети/localhost; убедитесь, что лимиты тела ответа покрывают объём ответов ваших API.
8. **Оцените влияние повторов** — для неидемпотентных POST добавьте идемпотентный ключ или `WithMaxRetries(0)`; проверьте, что бюджет повторов согласован с бизнесовыми таймаутами.
9. **Завершите жизненный цикл** — долгоживущему сервису явный экземпляр + `defer client.Close()`; убедитесь, что клиент не создаётся заново на каждом запросе.
10. **Регрессионная проверка** — прогоните существующие интеграционные тесты; приоритетно покройте ошибочные пути (нет сети/таймаут/4xx/5xx) и сценарии больших тел ответов.

## Что дальше

- **[Практическое руководство](./tutorial)** — за 30 минут построить полноценный клиент GitHub API с типичными приёмами после миграции
- **[Запросы и ответы](./request-response)** — полные опции запроса и обработка ответа `Result`
- **[Основные концепции](../getting-started/concepts)** — двухуровневая архитектура API, система конфигурации и жизненный цикл запроса
- **[Часто задаваемые вопросы](../faq/)** — сверенные с исходным кодом ответы о повторах, таймаутах, прокси и Cookie
