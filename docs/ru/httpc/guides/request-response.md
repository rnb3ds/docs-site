---
sidebar_label: "Запросы и ответы"
title: "Запросы и ответы - CyberGo HTTPC | Опции запроса и ответ"
description: "Запросы и ответы HTTPC: опции WithJSON, WithForm и WithBody, параметры WithQuery, потоковая выгрузка через io.Reader, Result и лимиты распаковки ответа."
sidebar_position: 3
---

# Запросы и ответы

## Отправка запросов

### Функции пакета

Нет необходимости создавать клиент — отправляйте запросы напрямую:

```go
result, err := httpc.Get("https://api.example.com/data")
if err != nil {
    log.Fatal(err)
}

fmt.Println(result.StatusCode())
fmt.Println(result.Body())
```

Поддерживаемые HTTP-методы: `Get`, `Post`, `Put`, `Patch`, `Delete`, `Head`, `Options`.

Функции пакета разделяют лениво инициализируемый клиент по умолчанию; перехватить его можно через `SetDefaultClient`, освободить — через `CloseDefaultClient` (подробнее — в [Практическом руководстве](./tutorial)).

### Экземпляр клиента

```go
client, err := httpc.NewDefault()
if err != nil {
    log.Fatal(err)
}
defer client.Close()

result, err := client.Get("https://api.example.com/data")
```

Экземпляр клиента безопасен для параллельного использования и должен жить долго с переиспользованием; запросы после `Close()` возвращают `ErrClientClosed`.

### Универсальный метод запроса

```go
ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()

result, err := httpc.Request(ctx, "GET", "https://api.example.com/data")
```

`Request` принимает любую строку метода — подходит для универсальной прокси-/шлюзовой логики; метод клиента `client.Request` используется так же.

## Опции запроса

### Заголовки запроса

```go
result, err := client.Get(url,
    httpc.WithHeader("Authorization", "Bearer token"),
    httpc.WithHeader("X-Custom", "value"),
    httpc.WithHeaderMap(map[string]string{
        "Accept":        "application/json",
        "X-Request-ID":  "123",
    }),
    httpc.WithUserAgent("my-app/1.0"),
)
```

Все ключи и значения заголовков проходят проверку на CRLF-инъекцию: пары с управляющими символами или превышением длины возвращают `ErrInvalidHeader`. Итоговый порядок применения заголовков: Content-Type тела запроса → заголовки клиента по умолчанию (`Defaults.Headers`) → заголовки, установленные опциями/промежуточным ПО (последние переопределяют одноимённые из первых).

### Тело запроса

```go
// JSON
result, err := client.Post(url, httpc.WithJSON(map[string]any{
    "name": "test",
}))

// XML
result, err := client.Post(url, httpc.WithXML(data))

// Форма
result, err := client.Post(url, httpc.WithForm(map[string]string{
    "username": "admin",
    "password": "secret",
}))

// Бинарные данные (по умолчанию application/octet-stream)
result, err := client.Post(url, httpc.WithBinary(data))
// С указанием типа
result, err := client.Post(url, httpc.WithBinary(data, "image/png"))

// Автоопределение типа
result, err := client.Post(url, httpc.WithBody(data))
// string → text/plain; charset=utf-8, []byte → application/octet-stream,
// map[string]string → application/x-www-form-urlencoded,
// *FormData → multipart/form-data, io.Reader → передаётся как есть,
// другие → application/json
// Можно явно указать: httpc.WithBody(data, httpc.BodyJSON)
```

#### Явное указание BodyKind

`WithBody(data, kind)` пропускает автоопределение и принудительно кодирует по указанному типу:

| BodyKind | Content-Type | Требования к входным данным |
|----------|--------------|----------|
| `BodyAuto` (по умолчанию) | Автоопределение по типу входных данных | См. таблицу ниже |
| `BodyJSON` | `application/json` | Любое значение, сериализуемое в JSON |
| `BodyXML` | `application/xml` | Любое значение, сериализуемое в XML |
| `BodyForm` | `application/x-www-form-urlencoded` | `map[string]string` или `url.Values` |
| `BodyBinary` | `application/octet-stream` | `[]byte` или `string` (непустая) |
| `BodyMultipart` | `multipart/form-data` | `*FormData` |

Правила определения `BodyAuto`:

| Тип входных данных | Content-Type |
|----------|--------------|
| `string` | `text/plain; charset=utf-8` |
| `[]byte` | `application/octet-stream` |
| `map[string]string` | `application/x-www-form-urlencoded` |
| `*FormData` | `multipart/form-data` (с boundary) |
| `io.Reader` | не устанавливается (передаётся как есть) |
| Другие (struct/map и т.п.) | `application/json` |

#### Формы и multipart-выгрузка

```go
// Форма url.Values (поддерживает одноимённые поля, например tag=go&tag=http)
values := url.Values{"tag": {"go", "http"}, "page": {"2"}}
result, err := client.Post(url, httpc.WithBody(values, httpc.BodyForm))

// multipart/form-data: поля + файл
form := &httpc.FormData{
    Fields: map[string]string{
        "description": "avatar upload",
    },
    Files: map[string]*httpc.FileData{
        "avatar": {Filename: "avatar.png", Content: pngBytes},
    },
}
result, err = client.Post(url, httpc.WithFormData(form))

// Быстрый путь для одного файла (имя поля, имя файла, содержимое; имя файла проходит очистку пути)
result, err = client.Post(url, httpc.WithFile("avatar", "avatar.png", pngBytes))
```

Поля формы проверяются по одному на управляющие символы и длину (табуляция в значениях разрешена); `WithForm` эквивалентен `WithBody(data, BodyForm)` — оба идут по одному пути «сначала валидация, затем кодирование».

#### Потоковое тело запроса (io.Reader)

```go
// io.Reader передаётся как есть, Content-Type не устанавливается (при необходимости задайте сами через WithHeader)
result, err := client.Post(url,
    httpc.WithBody(io.LimitReader(file, 10<<20)), // не более 10MB
    httpc.WithHeader("Content-Type", "application/octet-stream"),
)
```

:::warning io.Reader обходит проверку размера
Тела запросов типа `io.Reader` **не проходят проверку размера тела запроса**. Читая недоверенный источник, обязательно оборачивайте его в `io.LimitReader`, чтобы не переполнить память.
:::

### Параметры запроса

```go
result, err := client.Get(url,
    httpc.WithQuery("page", 1),
    httpc.WithQuery("limit", 10),
)

// Или с использованием Map
result, err := client.Get(url,
    httpc.WithQueryMap(map[string]any{
        "page":  1,
        "limit": 10,
    }),
)
```

Ключевые моменты:
- Значения поддерживают `string`, `bool`, `int`/`int64`, семейство `uint`, `float32`/`float64` и типы, реализующие `fmt.Stringer`
- При значении `nil` параметр **не** попадает в URL (а не отображается литералом `<nil>`)
- Пустой, слишком длинный ключ или ключ с недопустимыми символами возвращает ошибку; строка запроса, уже имеющаяся в URL, объединяется с параметрами опций

### Аутентификация

```go
// Bearer Token
result, err := client.Get(url, httpc.WithBearerToken("my-token"))

// Basic Auth
result, err := client.Get(url, httpc.WithBasicAuth("user", "pass"))
```

Обе опции проверяют формат: в `WithBearerToken` пустой токен или недопустимые символы дают ошибку; `WithBasicAuth` требует непустое имя пользователя, а слишком длинные имя/пароль или недопустимые символы — ошибку.

### Cookie

```go
result, err := client.Get(url,
    httpc.WithCookie(http.Cookie{Name: "session", Value: "abc"}),
    httpc.WithCookieMap(map[string]string{"session": "abc", "lang": "zh"}),
    httpc.WithCookieString("session=abc; lang=zh"),
)
```

Для массовой настройки передайте срез одним вызовом `WithCookies` — это эффективнее нескольких `WithCookie` (одно предварительное выделение памяти, один проход валидации):

```go
result, err := client.Get(url, httpc.WithCookies([]http.Cookie{
    {Name: "session", Value: "abc"},
    {Name: "lang", Value: "zh"},
}))
```

Когда нужна проверка атрибутов безопасности Cookie, `WithSecureCookie` **должен стоять после всех опций Cookie** — он проверяет только те Cookie, которые существуют на момент применения:

```go
result, err := client.Get(url,
    httpc.WithCookie(http.Cookie{Name: "session", Value: "abc"}),
    httpc.WithSecureCookie(httpc.StrictCookieSecurityConfig()), // требует Secure/HttpOnly/SameSite=Strict
)
```

### Управление запросом

```go
// Таймаут
result, err := client.Get(url, httpc.WithTimeout(10*time.Second))

// Повторные попытки
result, err := client.Get(url, httpc.WithMaxRetries(5))

// Перенаправления
result, err := client.Get(url,
    httpc.WithFollowRedirects(false),    // запретить перенаправления
)

// Контекст (эквивалентно замене ctx для этого запроса)
result, err := client.Get(url, httpc.WithContext(ctx))
```

:::tip WithMaxRedirects(0) не отключает
`WithMaxRedirects(0)` **не** отключает перенаправления — движок рассматривает `0` как «не задано» и возвращается к значению по умолчанию 10. Чтобы полностью отключить следование перенаправлениям, используйте `WithFollowRedirects(false)`. Полное управление перенаправлениями, отслеживание цепочки и доменный белый список — в [Перенаправлениях](./redirects).
:::

### Обратные вызовы

```go
result, err := client.Get(url,
    httpc.WithOnRequest(func(req httpc.RequestMutator) error {
        log.Printf("Отправка запроса: %s %s", req.Method(), req.URL())
        return nil
    }),
    httpc.WithOnResponse(func(resp httpc.ResponseMutator) error {
        log.Printf("Получен ответ: %d", resp.StatusCode())
        return nil
    }),
)
```

Ошибка из колбэка прерывает запрос (если `OnResponse` возвращает ошибку, весь запрос считается неудачным). Несколько колбэков выполняются цепочкой в порядке добавления.

:::tip Колбэки выполняются по «попыткам», промежуточное ПО — по «запросам»
`WithOnRequest`/`WithOnResponse` срабатывают внутри движка и **выполняются на каждую попытку (включая повторы)**; цепочка же промежуточного ПО оборачивает весь цикл повторов и для одного логического запроса выполняется один раз. Нужна гранулярность на попытку — используйте колбэки, на весь запрос — [промежуточное ПО](./middleware-chain).
:::

## Обработка ответов

```go
result, err := client.Get("https://api.example.com/users/1")
if err != nil {
    log.Fatal(err)
}

// Проверка состояния
result.StatusCode()     // 200
result.IsSuccess()      // true (2xx)
result.IsRedirect()     // false (3xx)
result.IsClientError()  // false (4xx)
result.IsServerError()  // false (5xx)

// Чтение ответа
result.Body()           // строка
result.RawBody()        // []byte
result.Proto()          // "HTTP/1.1"

// Парсинг JSON
var user User
if err := result.Unmarshal(&user); err != nil {
    log.Fatal(err)
}

// Cookie
cookie := result.GetCookie("session")
if cookie != nil {
    fmt.Println(cookie.Value)
}

// Метаданные запроса
fmt.Println(result.Meta.Duration)       // время выполнения запроса
fmt.Println(result.Meta.Attempts)       // число попыток
fmt.Println(result.Meta.RedirectCount)  // число перенаправлений
```

### Обзор возможностей Result

`Result` состоит из трёх частей: `Request` (информация о фактически отправленном запросе), `Response` (данные ответа) и `Meta` (метаданные выполнения). Предпочитайте nil-безопасные методы-аксессоры:

| Категория | Метод / поле | Описание |
|------|-------------|------|
| Состояние | `StatusCode()` / `Proto()` / `Response.Status` | Код состояния, версия протокола (например, `HTTP/1.1`), текст статуса |
| Проверки | `IsSuccess()` / `IsRedirect()` / `IsClientError()` / `IsServerError()` | 2xx / 3xx / 4xx / 5xx |
| Содержимое | `Body()` / `RawBody()` / `Response.ContentLength` | Тело строкой / сырые байты / Content-Length |
| JSON | `Unmarshal(&v)` | Пустое тело — `ErrResponseBodyEmpty`; свыше 50MB — `ErrResponseBodyTooLarge` |
| Cookie ответа | `GetCookie(name)` / `HasCookie(name)` / `ResponseCookies()` | Получить по имени / проверить наличие / все Cookie ответа |
| Cookie запроса | `GetRequestCookie(name)` / `HasRequestCookie(name)` / `RequestCookies()` | Cookie, фактически отправленные с запросом (включая итоговые значения после перенаправлений) |
| Метаданные | `Meta.Duration` / `Attempts` / `RedirectChain` / `RedirectCount` / `ProxyURL` | Время выполнения, число попыток (включая первую), цепочка перенаправлений, использованный прокси |
| Файлы | `SaveToFile(path)` | Запись тела ответа в файл (с проверкой path traversal / symlink) |
| Отладка | `String()` | Обезличенная сводка: чувствительные заголовки маскируются, тело обрезается до 200 символов |

Все аксессоры nil-безопасны: если `Result` или внутренний указатель равны nil, `StatusCode()` вернёт 0, `Body()` — пустую строку, методы-проверки — false; паники не будет.

### Заголовки ответа и метаданные

```go
// Заголовки ответа — стандартный http.Header, регистр не учитывается
contentType := result.Response.Headers.Get("Content-Type")
date := result.Response.Headers.Get("Date")

// Сторона запроса: фактически отправленные заголовки и Cookie (после перенаправлений — итоговый запрос)
ua := result.Request.Headers.Get("User-Agent")
finalURL := result.Request.URL

// Сценарий пула прокси: прокси, фактически использованный этим запросом
if result.Meta.ProxyURL != "" {
    log.Printf("Через прокси: %s", result.Meta.ProxyURL)
}

// Цепочка перенаправлений: пройденные URL по порядку
for i, u := range result.Meta.RedirectChain {
    log.Printf("Перенаправление %d: %s", i+1, u)
}
```

### Сохранение в файл

Небольшое тело ответа можно сохранить напрямую (для больших файлов используйте [API загрузки файлов](./file-transfer), чтобы не грузить всё в память):

```go
if err := result.SaveToFile("user.json"); err != nil {
    log.Fatal(err) // пустое тело ответа или путь, не прошедший проверку безопасности (path traversal, symlink и т.п.)
}
```

### Отладочный вывод

`String()` генерирует однострочную сводку, удобную для логов: чувствительные заголовки (`Authorization`, `Cookie`, `Set-Cookie`, `X-Api-Key` и др.) отображаются как `***`, тело ответа обрезается до 200 символов:

```go
fmt.Println(result.String())
// Пример вывода: Result{Status: 200 200 OK, ContentLength: 5102, Duration: 150ms,
// Attempts: 1, Headers: 14 [Content-Length, Content-Type, ...], Body: {"id":...}
```

## Управление контекстом

```go
// Управление таймаутом
ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()
result, err := httpc.Request(ctx, "GET", url)

// Управление отменой
ctx, cancel := context.WithCancel(context.Background())
go func() {
    time.Sleep(5 * time.Second)
    cancel() // отмена через 5 секунд
}()
result, err := httpc.Request(ctx, "GET", url)
```

Взаимосвязь `WithTimeout` и таймаута context: `WithTimeout` — это **общий бюджет на все повторы**, движок надевает его на весь цикл повторов снаружи; отмена context действует немедленно на транспортном уровне.

## Потоковые запросы

В симметрии с [потоковыми ответами](#потоковые-ответы) сторона выгрузки тоже может быть потоковой: `WithBody` напрямую принимает любой `io.Reader`, данные отправляются по мере генерации, без предварительного чтения всего тела запроса в память. В этом разделе разбираются семантика и ловушки; полный сценарий выгрузки больших файлов (чанки, контрольные суммы) — в [Загрузке и скачивании файлов](./file-transfer#потоковая-выгрузка-большие-файлы).

### Тело запроса io.Reader

`WithBody(reader)` идёт в ветку автоматического определения `io.Reader`: Reader передаётся транспортному уровню как есть, **Content-Type не проставляется** (при необходимости задайте сами через `WithHeader`). Движок не читает наперёд и не оборачивает — темп чтения полностью задаёт HTTP-транспорт.

:::warning Тело-Reader не проверяется по размеру
`io.Reader` читается по мере потребления, длину данных заранее узнать нельзя, поэтому HTTPC **не выполняет для него никаких проверок размера** — `Security.MaxRequestBodySize` действует только на тела в памяти (`string`, `[]byte`, `url.Values`, `*FormData`), а `io.Reader` пропускается всегда. Читая недоверенный источник, обязательно оберните его в `io.LimitReader` — это единственная защита. Подробнее — в [FAQ: почему тело запроса io.Reader не проверяется по размеру](../faq/#почему-тело-запроса-io-reader-не-проверяется-по-размеру).
:::

### Компромисс между повторами и потоковой передачей

Для повтора нужно воспроизвести тело запроса, а `io.Reader` после одного чтения пуст. Движок обрабатывает это так:

| Конфигурация повторов | Поведение тела запроса |
|----------|------------|
| Включены (по умолчанию `Retry.MaxRetries = 3`) | **Перед первой попыткой** Reader полностью читается в память и превращается в `[]byte`, каждый повтор воспроизводит Reader заново; предел 100MB, при превышении — ошибка (`retry not supported for streaming bodies exceeding 104857600 bytes`) |
| `WithMaxRetries(0)` | Reader проходит прямо в транспортный уровень, **настоящая потоковая передача без буферизации**; расплата — запрос не повторяется |

Два сопутствующих отличия:

- **Content-Length**: на буферизованном пути после преобразования в `[]byte` длина известна, и запрос несёт Content-Length; на прямом пути длина неизвестна, и в HTTP/1.1 автоматически используется chunked-кодирование передачи.
- **Потребление памяти**: при конфигурации повторов по умолчанию тело целиком попадает в память, даже если первая же попытка успешна — «потоковость» здесь лишь избавляет от ручной сборки `[]byte`, это не zero-copy. Для настоящей отправки по мере генерации требуется `WithMaxRetries(0)`.

### WithStreamBody не связан с телом запроса

Название `WithStreamBody(true)` легко принять за переключатель потокового тела запроса, но это механизм **стороны ответа**: он пропускает буферизацию тела ответа в памяти и используется внутри API загрузки файлов. На обработку тела запроса он не влияет и не меняет описанное выше буферизованное поведение повторов — потоковое ли тело запроса, определяется только тем, передан ли `io.Reader`, и включены ли повторы. Подробнее — ниже в [Потоковых ответах](#потоковые-ответы).

### Выгрузка без копирования через io.Pipe

`io.Pipe` соединяет «генерацию данных» и «отправку данных» одной трубой: goroutine-производитель пишет по мере генерации, HTTP-транспорт потребляет параллельно, без промежуточного буфера на всём пути. Типичный сценарий — выгрузка потока сжатия напрямую, без промежуточного файла `.gz`:

```go
package main

import (
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"time"

	"github.com/cybergodev/httpc"
)

func main() {
	file, err := os.Open("data.json")
	if err != nil {
		log.Fatal(err)
	}
	defer file.Close()

	pr, pw := io.Pipe()
	gw := gzip.NewWriter(pw)

	// Производитель: читает файл и пишет сжатые данные в трубу
	go func() {
		_, copyErr := io.Copy(gw, file)
		if closeErr := gw.Close(); closeErr != nil && copyErr == nil {
			copyErr = closeErr
		}
		pw.CloseWithError(copyErr) // при copyErr == nil эквивалентно Close
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	// Потребитель: HTTP-транспорт читает прямо из трубы
	result, err := httpc.Request(ctx, "POST", "https://api.example.com/upload",
		httpc.WithBody(pr),
		httpc.WithMaxRetries(0), // настоящий стриминг: повторы отключены, иначе движок буферизует всё тело
		httpc.WithHeader("Content-Type", "application/gzip"),
	)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println(result.StatusCode(), result.Meta.Attempts)
	// Вывод: 200 1
}
```

Ключевые моменты:

- Любая ошибка производителя должна передаваться потребителю через `pw.CloseWithError`, иначе другая сторона увидит лишь EOF, и испорченные данные будут приняты за полную выгрузку
- `io.Pipe` невозможно воспроизвести, он естественно сочетается с `WithMaxRetries(0)`; если повторы обязательны — переходите на буферизованное решение (например, сначала файл на диск, затем выгрузка)
- Сервер получает сжатые данные кусками по `Content-Type: application/gzip`, принимающая сторона распаковывает потоково — ни одной из сторон не нужна полная буферизация

## Потоковые ответы

`WithStreamBody(true)` — внутренний механизм, используемый при загрузке файлов, чтобы избежать кэширования полного тела ответа в памяти. При включении тело ответа не считывается в `Result` (`Body()` и `RawBody()` возвращают пустые значения).

:::warning
`WithStreamBody(true)` используется внутри API загрузки файлов. Если нужно потоковое получение содержимого ответа, используйте [API загрузки файлов](./file-transfer).
:::

Если нужно скачать большой файл, используйте API загрузки:

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/path/to/file"
result, err := client.Download(context.Background(), url, cfg)
```

## Распаковка ответов

HTTPC автоматически распаковывает контентные кодировки gzip и deflate. Прозрачная распаковка стандартной библиотеки Go на транспортном уровне отключена — движок обрабатывает её вручную: запросы автоматически несут `Accept-Encoding: gzip, deflate` (можно переопределить через `WithHeader("Accept-Encoding", ...)`).

Поддерживаемые кодировки:

| Content-Encoding | Обработка |
|------------------|----------|
| `gzip` / `deflate` | Автоматическая распаковка (с переиспользованием распаковщиков из пула объектов) |
| `br` (brotli) / `compress` (LZW) | Не поддерживаются, возвращается ошибка |
| `identity` / неизвестные кодировки | Передаются как есть |

Размер после распаковки можно ограничить через настройки безопасности, чтобы защититься от бомб распаковки:

```go
cfg := httpc.DefaultConfig()
cfg.Security.MaxResponseBodySize = 10 * 1024 * 1024      // Лимит тела ответа: обязателен при потоковой загрузке; для непотокового чтения — запасной лимит распакованного тела
cfg.Security.MaxDecompressedBodySize = 100 * 1024 * 1024  // Максимум после распаковки: 100MB
```

| Параметр | По умолчанию | Описание |
|--------|--------|------|
| `MaxResponseBodySize` | 10MB | Лимит тела ответа при потоковой загрузке; для непотокового чтения — запасной лимит распакованного тела |
| `MaxDecompressedBodySize` | 100MB | Верхний предел размера распакованного тела ответа (если не задан, откат к `MaxResponseBodySize`) |

Для байтов сжатого тела ответа действует отдельный жёсткий лимит 100MB (`maxCompressedSize`, не настраивается), предназначенный для защиты от бомб распаковки, независимый от `MaxResponseBodySize`.

При превышении лимита возвращается ошибка, содержащая `"exceeds limit"`; её можно обработать проверкой типа `ClientError`. `ErrResponseBodyTooLarge` возвращается в `Result.Unmarshal()` при разборе тела ответа свыше лимита JSON в 50MB (независимо от `MaxResponseBodySize`).

## Функции форматирования

Для отображения прогресса загрузки или объёмов в логах пригодятся функции форматирования уровня пакета (шаг 1024):

```go
fmt.Println(httpc.FormatBytes(1536))        // Вывод: 1.50 KB
fmt.Println(httpc.FormatBytes(1048576))     // Вывод: 1.00 MB
fmt.Println(httpc.FormatSpeed(1048576))     // Вывод: 1.00 MB/s
```

## Что дальше

- [Перенаправления](./redirects) - управление следованием, отслеживание цепочки и доменный белый список
- [Загрузка и скачивание файлов](./file-transfer) - потоковая выгрузка больших файлов, скачивание и контрольные суммы
- [Доменный клиент и сессии](./domain-session) - управление сессиями
- [Параметры запроса API](../api-reference/core/options) - полный справочник опций
- [Result API](../api-reference/core/result) - справочник обработки ответов
