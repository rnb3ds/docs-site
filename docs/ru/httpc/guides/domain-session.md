---
sidebar_label: "Доменный клиент и сессии"
title: "Доменный клиент и сессии - CyberGo HTTPC | Сессии и домены"
description: "Доменный клиент HTTPC: создание через NewDomain, правила сборки URL и защита от path traversal, SetHeader, автозахват Cookie, CookieSecurity и параллелизм."
sidebar_position: 5
---

# Доменный клиент и сессии

Доменный клиент (DomainClient) — это клиент управления сессиями для одного домена, автоматически поддерживающий Cookie и заголовки запросов.

Три компонента, каждый со своей зоной ответственности:

| Компонент | Ответственность | Сценарий применения |
|------|------|----------|
| `Client` | Универсальный HTTP-клиент: конфигурация, пул соединений, повторы, промежуточное ПО | Запросы к нескольким доменам, состояние между запросами не нужно |
| `DomainClient` | Клиент с областью действия на домен: автосборка URL + встроенная сессия | Фиксированный домен API, нужно поддерживать заголовки/Cookie между запросами |
| `SessionManager` | Потокобезопасное хранилище состояния сессии (заголовки + Cookie), используется самостоятельно | Самостоятельное управление состоянием сессии, комбинация с любым Client |

## Создание доменного клиента

```go
dc, err := httpc.NewDomainDefault("https://api.example.com")
if err != nil {
    log.Fatal(err)
}
defer dc.Close()

// Cookie включены автоматически
dc.SetHeader("Authorization", "Bearer "+token)

// Отправка запросов по относительным путям
result, err := dc.Get("/users")
```

:::tip
`NewDomain` автоматически включает управление Cookie (`EnableCookies = true`), ручная настройка не требуется.
:::

При создании автоматически происходят три вещи:

1. **Валидация baseURL**: должны присутствовать scheme и host (например, `https://api.example.com`), иначе возвращается ошибка
2. **Принудительное включение Cookie**: `Connection.EnableCookies` переданной конфигурации игнорируется — доменный клиент всегда имеет управление Cookie
3. **Создание сессии**: внутри создаётся `SessionManager` (по умолчанию `DefaultSessionConfig`) — заголовки и Cookie хранятся именно здесь

`NewDomain` принимает и полную Config — для настройки таймаутов, повторов и т.п. (при этом методы `dc.Get` и др. ведут себя так же, как у обычного клиента):

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Timeouts.Request = 15 * time.Second
    cfg.Retry.MaxRetries = 2
    cfg.Defaults.UserAgent = "my-app/1.0"

    dc, err := httpc.NewDomain("https://api.github.com", cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer dc.Close()

    if err := dc.SetHeader("Accept", "application/vnd.github+json"); err != nil {
        log.Fatal(err)
    }

    result, err := dc.Get("/repos/golang/go")
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(result.StatusCode()) // 200
}
```

## Правила сборки URL

Первый параметр методов `Get`/`Post` и др. — путь относительно base URL; правила сборки:

| Переданный path | Результат | Правило |
|-----------|------|------|
| `/users` | `{base}/users` | Относительный путь присоединяется к базовому пути |
| `/users/` | `{base}/users/` | Завершающий слэш сохраняется |
| `https://other.com/data` | Используется как есть | Полный URL, начинающийся с `http://`/`https://`, пропускает сборку |
| `/users?page=2` | `{base}/users?page=2` | Строка запроса сохраняется; если у base есть свои параметры, они объединяются |
| `""` | `{base}` | Пустой путь возвращает сам base |

:::warning Защита от path traversal
Если base URL несёт префикс пути (например, `https://example.com/api/v1`), результат сборки обязан оставаться внутри этого префикса; пути, пытающиеся выйти через `..` и подобные, возвращают ошибку `path escapes base URL scope` — запрос не отправляется.
:::

## Управление заголовками сессии

```go
// Установка заголовков сессии (все последующие запросы автоматически их содержат)
dc.SetHeader("Authorization", "Bearer "+token)
dc.SetHeader("Accept", "application/json")

// Массовая установка
dc.SetHeaders(map[string]string{
    "Authorization": "Bearer " + token,
    "Accept":        "application/json",
    "X-Version":     "2.0",
})

// Удаление и очистка
dc.DeleteHeader("X-Version")
dc.ClearHeaders()

// Получение
headers := dc.GetHeaders()
```

Все ключи и значения проходят ту же проверку на CRLF-инъекцию, что и `WithHeader`; недопустимые пары возвращают ошибку. `GetHeaders()` возвращает **копию** — её изменение не влияет на сессию.

Для одного запроса заголовок сессии можно переопределить опцией (опции применяются после заголовков сессии):

```go
dc.SetHeader("X-API-Version", "v1")

// Этот запрос отправит v2
result, _ := dc.Get("/data", httpc.WithHeader("X-API-Version", "v2"))
```

Обратите внимание: как описано в следующем разделе, `v2` будет записан обратно в сессию, и последующие запросы тоже будут отправлять `v2`.

## Управление Cookie

```go
// Установка Cookie
dc.SetCookie(&http.Cookie{Name: "session", Value: "abc123"})

// Массовая установка
dc.SetCookies([]*http.Cookie{
    {Name: "session", Value: "abc123"},
    {Name: "lang", Value: "zh"},
})

// Автоматический захват Cookie из ответа
result, _ := dc.Get("/login")
// Set-Cookie сервера автоматически сохраняется в сессию

// Получение
cookie := dc.GetCookie("session")
cookies := dc.GetCookies()

// Удаление и очистка
dc.DeleteCookie("session")
dc.ClearCookies()
```

:::tip
После каждого запроса Cookie, возвращённые сервером, автоматически обновляются в сессии, ручная обработка не требуется.
:::

Автоматическое поддержание Cookie покрывает три пути:

- **Обратное заполнение из ответа**: по завершении каждого запроса `Set-Cookie` из ответа автоматически записывается в сессию (метод `Download` для скачивания файлов тоже захватывает Cookie ответа)
- **Валидация**: перед записью выполняется та же проверка корректности, что и у `WithCookie`; при настроенной политике безопасности Cookie (см. ниже «Проверка безопасности Cookie») несоответствующие Cookie **молча пропускаются**, не затрагивая остальные
- **Семантика копий**: `GetCookie`/`GetCookies` возвращают копии Cookie — изменение возвращённого значения не загрязняет внутреннее состояние сессии

### Автосохранение опций запроса в сессии

Cookie и заголовки, переданные через **опции запроса**, тоже захватываются в сессию и действуют на последующие запросы:

```go
// Первый запрос: Cookie и заголовки из опций…
_, err := dc.Get("/login",
    httpc.WithCookie(http.Cookie{Name: "session", Value: "abc"}),
    httpc.WithHeader("X-Client", "mobile"),
)
if err != nil {
    log.Fatal(err)
}

// …уже записаны в сессию:
fmt.Println(dc.GetCookie("session").Value) // Вывод: abc
fmt.Println(dc.GetHeaders()["X-Client"])   // Вывод: mobile

// Последующие запросы несут их автоматически даже без опций;
// повторная передача одноимённого элемента через опцию перезапишет значение в сессии
_, err = dc.Get("/profile")
```

:::warning Не передавайте временные заголовки через опции
Заголовки/Cookie из опций сохраняются в сессию и действуют на **все последующие запросы**. Одноразовые заголовки с меняющимся значением (инкрементный trace ID, случайный nonce) удаляйте после использования через `DeleteHeader`/`DeleteCookie` или отправляйте такой запрос через базовый `Client`.
:::

## Способы запросов

```go
// Относительные пути
result, _ := dc.Get("/users")
result, _ := dc.Post("/users", httpc.WithJSON(data))
result, _ := dc.Put("/users/1", httpc.WithJSON(data))
result, _ := dc.Patch("/users/1", httpc.WithJSON(data))
result, _ := dc.Delete("/users/1")
result, _ := dc.Head("/users/1")
result, _ := dc.Options("/users")

// С контекстом
result, _ := dc.Request(ctx, "GET", "/users")

// Абсолютный URL (пропускает сборку с base URL)
result, _ := dc.Get("https://other-api.com/data")
```

:::warning Опции запроса применяются дважды
Доменный клиент внутри **применяет опции запроса дважды** (один раз — для захвата состояния сессии, второй — для самого запроса). Избегайте опций с побочными эффектами (счётчики, генерация nonce); если такие нужны — используйте базовый `Client`.
:::

Метод `Download` имеет ту же сигнатуру, что и `Client.Download`; путь также разрешается относительно base URL, а по завершении Cookie ответа захватываются в сессию:

```go
dlCfg := httpc.DefaultDownloadConfig()
dlCfg.FilePath = "data.json"
dlCfg.Overwrite = true

result, err := dc.Download(ctx, "/export/data", dlCfg)
if err != nil {
    log.Fatal(err)
}
fmt.Println(result.FilePath, result.BytesWritten)
```

## Доступ к сессии

```go
// Получение базовой информации
dc.URL()     // "https://api.example.com"
dc.Domain()  // "api.example.com" (host без порта)

// Доступ к базовому SessionManager
session := dc.Session()
if err := session.SetHeader("X-Trace-ID", traceID); err != nil {
    log.Fatal(err)
}
```

`DomainClient` встраивает `SessionManager` и открывает через него все методы сессии, поэтому `dc.SetHeader(...)` полностью эквивалентен `dc.Session().SetHeader(...)`.

### Самостоятельное использование SessionManager

`SessionManager` можно создать и отдельно от `DomainClient` — как потокобезопасный аксессор заголовков/Cookie:

```go
session, err := httpc.NewSessionManagerDefault()
if err != nil {
    log.Fatal(err)
}

// Запись состояния
if err := session.SetHeader("Authorization", "Bearer my-token"); err != nil {
    log.Fatal(err)
}
if err := session.SetCookies([]*http.Cookie{{Name: "session_id", Value: "abc123"}}); err != nil {
    log.Fatal(err)
}

// Обратное заполнение Cookie из ответа
result, err := client.Get("https://api.example.com/data")
if err != nil {
    log.Fatal(err)
}
session.UpdateFromResult(result)     // захват Cookie ответа из Result
session.UpdateFromCookies(cookies)   // массовое обновление из []*http.Cookie
```

В связке с обычным `Client` читайте `GetHeaders()`/`GetCookies()` сами и превращайте их в опции `WithHeaderMap`/`WithCookie`, добавляемые к запросу (именно так `DomainClient` внутри внедряет состояние сессии в каждый запрос).

## Семантика параллельной работы

- **SessionManager потокобезопасен**: все методы чтения/записи защищены `sync.RWMutex` — несколько goroutine могут одновременно вызывать `SetHeader`/`GetCookies` без дополнительной блокировки
- **Снимки сессии согласованы в конечном счёте**: последовательность «прочитать снимок сессии → отправить запрос → записать Cookie ответа» для каждого запроса не атомарна — параллельные запросы могут увидеть чуть устаревший снимок (например, login-Cookie, только что полученный другим запросом, вам ещё не виден); это осознанный компромисс, при этом снимок отдельного запроса всегда согласован
- **DomainClient можно использовать параллельно**: сами методы без дополнительных блокировок, могут разделяться несколькими goroutine

:::tip
Операции, заметно меняющие состояние сессии — вход, обновление Token — не выполняйте параллельно с бизнес-запросами либо запускайте зависящие от нового состояния запросы после их завершения.
:::

## Проверка безопасности Cookie

Можно настроить политику безопасности Cookie, принимая только Cookie, соответствующие стандартам безопасности:

```go
dc, _ := httpc.NewDomainDefault("https://api.example.com")

// Установка строгой безопасности Cookie
session := dc.Session()
session.SetCookieSecurity(httpc.StrictCookieSecurityConfig())
// Требуется: Secure=true, HttpOnly=true, SameSite=Strict

// Cookie, не соответствующие требованиям безопасности, вызовут ошибку при SetCookie
if err := dc.SetCookie(&http.Cookie{
    Name:  "insecure",
    Value: "test",
    // Отсутствуют Secure, HttpOnly → отклонено
}); err != nil {
    log.Println("Cookie отклонён:", err)
}
```

Различие поведения двух точек валидации:

| Точка | Поведение при несоответствии |
|------|----------------|
| `SetCookie` / `SetCookies` (явная запись) | Возвращается ошибка, Cookie не попадает в сессию |
| Обратное заполнение из ответа / захват опций (автоматическая запись) | Cookie **молча пропускается**, остальные обрабатываются как обычно |

Политика действует на все последующие записи после `SetCookieSecurity`. При самостоятельном создании `SessionManager` её можно задать заранее через `SessionConfig.CookieSecurity` (внутри `NewDomain` используется конфигурация сессии по умолчанию — вызывайте `SetCookieSecurity` после создания). Для мягкой отправной точки возьмите `DefaultCookieSecurityConfig()` (по умолчанию ничего не требует) и ужесточайте поля по мере надобности.

## Жизненный цикл и повторное использование

```go
// Рекомендуется: один долгоживущий DomainClient на процесс —
// пул соединений и сессия переиспользуются между запросами
dc, err := httpc.NewDomainDefault("https://api.example.com")
if err != nil {
    log.Fatal(err)
}
defer dc.Close()

// При инвалидации сессии (например, Token истёк) сбросьте сессию и войдите заново
dc.ClearCookies()
dc.DeleteHeader("Authorization")
// …заново выполнить вход и восстановить состояние через SetCookie/SetHeader…
```

- `Close()` закрывает базовый Client (пул соединений, транспортный уровень) и **не** очищает заголовки/Cookie сессии (они живут в SessionManager); запросы после закрытия возвращают `ErrClientClosed`
- Не создавайте `DomainClient` на каждый запрос — потеряете переиспользование соединений и накопление сессии, к тому же можете исчерпать соединения
- Для смены политики безопасности всего клиента просто создайте новый экземпляр, а старый закройте через `Close` и отбросьте

## Полный пример: клиент REST API

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
    // Создание доменного клиента
    dc, err := httpc.NewDomainDefault("https://api.example.com")
    if err != nil {
        log.Fatal(err)
    }
    defer dc.Close()

    // Вход для получения Token
    loginResult, err := dc.Post("/auth/login", httpc.WithJSON(map[string]string{
        "username": "admin",
        "password": "secret",
    }))
    if err != nil {
        log.Fatal(err)
    }

    // Парсинг Token из ответа
    var loginResp struct {
        Token string `json:"token"`
    }
    if err := loginResult.Unmarshal(&loginResp); err != nil {
        log.Fatal(err)
    }

    // Установка заголовка сессии
    if err := dc.SetHeader("Authorization", "Bearer "+loginResp.Token); err != nil {
        log.Fatal(err)
    }

    // Последующие запросы автоматически несут Token и Cookie
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    users, err := dc.Request(ctx, "GET", "/users")
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println(users.StatusCode()) // 200
}
```

## Что дальше

- [Доменный клиент API](../api-reference/client-config/domain-client) - полный справочник API
- [Управление сессиями API](../api-reference/client-config/session) - справочник по SessionManager
- [Запросы и ответы](./request-response) - руководство по базовым запросам
