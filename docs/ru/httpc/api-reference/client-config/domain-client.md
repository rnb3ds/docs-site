---
sidebar_label: "Доменный клиент"
title: "Доменный клиент - CyberGo HTTPC | NewDomain и сессии"
description: "Справочник API доменного клиента HTTPC: функция создания NewDomain, семь HTTP-методов и универсальный метод Request, правила авто-сборки URL, управление сессией через SetHeader/SetCookie интерфейса DomainClienter и жизненный цикл Close."
sidebar_position: 2
---

# Доменный клиент

Доменный клиент (`DomainClient`) предоставляет управление запросами для конкретного домена, автоматически поддерживая Cookie и заголовки запросов. Он решает проблему обычного `Client` — необходимость вручную передавать заголовки авторизации и отслеживать Cookie между запросами: состояние сессии автоматически внедряется в каждый запрос, Cookie ответа автоматически фиксируются.

```text
Архитектура DomainClient
├── client         Базовый Client (повторное использование пула соединений, цепочки middleware)
├── baseURL        Область действия домена (например, https://api.example.com/v1)
├── parsedURL      Кэшированный результат разбора (избегает повторного url.Parse при каждом запросе)
├── domain         Имя хоста (без порта)
└── SessionManager Состояние сессии
      ├── headers  map[string]string  Заголовки уровня сессии
      └── cookies  map[string]*Cookie Cookie уровня сессии
```

## Интерфейс DomainClienter

```go
type DomainClienter interface {
    Client

    URL() string
    Domain() string

    SetHeader(key, value string) error
    SetHeaders(headers map[string]string) error
    DeleteHeader(key string)
    ClearHeaders()
    GetHeaders() map[string]string

    SetCookie(cookie *http.Cookie) error
    SetCookies(cookies []*http.Cookie) error
    DeleteCookie(name string)
    ClearCookies()
    GetCookies() []*http.Cookie
    GetCookie(name string) *http.Cookie

    Session() *SessionManager
}
```

`DomainClienter` одновременно реализует интерфейс `Client` (включая `Get`/`Post`/`Put`/`Patch`/`Delete`/`Head`/`Options`/`Request`/`Download`/`Close`) и методы управления сессией. Рекомендуется использовать тип интерфейса, а не конкретный — это упрощает тестирование и замену реализации.

### Полная таблица методов

#### HTTP-методы запроса (наследуются от Client)

| Метод | Сигнатура | Описание |
|-------|-----------|----------|
| `Get` | `(path string, opts ...RequestOption) (*Result, error)` | GET-запрос |
| `Post` | `(path string, opts ...RequestOption) (*Result, error)` | POST-запрос |
| `Put` | `(path string, opts ...RequestOption) (*Result, error)` | PUT-запрос |
| `Patch` | `(path string, opts ...RequestOption) (*Result, error)` | PATCH-запрос |
| `Delete` | `(path string, opts ...RequestOption) (*Result, error)` | DELETE-запрос |
| `Head` | `(path string, opts ...RequestOption) (*Result, error)` | HEAD-запрос |
| `Options` | `(path string, opts ...RequestOption) (*Result, error)` | OPTIONS-запрос |
| `Request` | `(ctx, method, path string, opts ...RequestOption) (*Result, error)` | Универсальный запрос с контекстом |
| `Download` | `(ctx, path string, cfg *DownloadConfig, opts ...RequestOption) (*DownloadResult, error)` | Загрузка файла |
| `Close` | `() error` | Закрытие клиента и освобождение ресурсов |

#### Методы доступа к URL

| Метод | Возвращаемый тип | Описание |
|-------|------------------|----------|
| `URL()` | `string` | Базовый URL (`baseURL`, переданный при конструировании) |
| `Domain()` | `string` | Домен (имя хоста, без порта) |
| `Session()` | `*SessionManager` | Базовый менеджер сессий |

#### Управление заголовками сессии

| Метод | Описание |
|-------|----------|
| `SetHeader(key, value string) error` | Установка одиночного заголовка сессии (с проверкой безопасности CRLF) |
| `SetHeaders(headers map[string]string) error` | Массовая установка заголовков сессии |
| `DeleteHeader(key string)` | Удаление одиночного заголовка сессии |
| `ClearHeaders()` | Очистка всех заголовков сессии |
| `GetHeaders() map[string]string` | Получение копии заголовков сессии |

#### Управление Cookie сессии

| Метод | Описание |
|-------|----------|
| `SetCookie(cookie *http.Cookie) error` | Установка одиночного Cookie сессии |
| `SetCookies(cookies []*http.Cookie) error` | Массовая установка Cookie сессии |
| `DeleteCookie(name string)` | Удаление Cookie по имени |
| `ClearCookies()` | Очистка всех Cookie |
| `GetCookies() []*http.Cookie` | Получение копии всех Cookie |
| `GetCookie(name string) *http.Cookie` | Получение копии Cookie по имени |

## NewDomain

```go
func NewDomain(baseURL string, cfg Config) (DomainClienter, error)
```

Создаёт клиент с областью действия домена. Cookie автоматически включены. Передаётся значение `Config` или используется `NewDomainDefault(baseURL)` как быстрый способ без аргументов.

```go
// С конфигурацией по умолчанию (эквивалентно NewDomainDefault)
dc, err := httpc.NewDomain("https://api.example.com", httpc.DefaultConfig())
if err != nil {
    log.Fatal(err)
}
defer dc.Close()

// С пользовательской конфигурацией
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 60 * time.Second
dc, err := httpc.NewDomain("https://api.example.com", cfg)
if err != nil {
    log.Fatal(err)
}
defer dc.Close()
```

**Описание параметров:**

| Параметр | Тип | Описание |
|----------|-----|----------|
| `baseURL` | `string` | Базовый URL (должен содержать scheme и host) |
| `cfg` | `Config` | Значение конфигурации (рекомендуется получить через `DefaultConfig()` или функцию пресета) |

**Возвращает:** интерфейс `DomainClienter` (не конкретный тип `*DomainClient`).

**Условия ошибок:**

| Условие | Сообщение об ошибке |
|---------|---------------------|
| `baseURL` без scheme или host | `base URL must include scheme and host` |
| Сбой проверки конфигурации | `invalid configuration: ...` |

:::tip Cookie автоматически включены
`NewDomain` внутренне принудительно устанавливает `cfg.Connection.EnableCookies = true`, независимо от того, включены ли Cookie в переданном `cfg`. Это связано с тем, что основная ценность доменного клиента — поддержание Cookie-сессии между запросами.
:::

## NewDomainDefault

```go
func NewDomainDefault(baseURL string) (DomainClienter, error)
```

Удобный конструктор, эквивалент `NewDomain(baseURL, DefaultConfig())`.

```go
dc, err := httpc.NewDomainDefault("https://api.example.com")
if err != nil {
    log.Fatal(err)
}
defer dc.Close()
```

## HTTP-методы

Все методы принимают относительные пути или абсолютные URL:

```go
// Относительный путь: автоматически объединяется с baseURL
result, err := dc.Get("/users")
result, err := dc.Post("/users", httpc.WithJSON(data))
result, err := dc.Put("/users/1", httpc.WithJSON(data))
result, err := dc.Patch("/users/1", httpc.WithJSON(data))
result, err := dc.Delete("/users/1")
result, err := dc.Head("/users/1")
result, err := dc.Options("/users")

// Абсолютный URL: используется напрямую
result, err := dc.Get("https://other-api.com/data")
```

### Request

```go
result, err := dc.Request(ctx, "GET", "/users", options...)
```

Универсальный метод запроса с контекстом, поддерживающий управление таймаутом и отменой. `DomainClient` реализует этот метод для удовлетворения интерфейса `Client`.

## Подробное описание правил сборки URL

Метод `buildURL` отвечает за объединение пути запроса с `baseURL`. Правила:

```text
buildURL(pathStr):

  ① pathStr пуст → возврат baseURL
  ② pathStr начинается с http:// или https:// → абсолютный URL, возврат как есть
  ③ Иначе → объединение относительного пути:
       a. Клонирование кэшированного parsedURL (без изменения оригинала)
       b. Разбор pathStr для разделения path / query / fragment
       c. result.Path = path.Join(basePath, parsedPath)
       d. Сохранение косой черты: если исходный путь заканчивается на /, результат тоже заканчивается на /
       e. Защита от path traversal: результат должен быть в области действия базового пути
       f. Объединение параметров запроса: базовые параметры + параметры пути
       g. Прозрачная передача fragment
```

### Примеры объединения

| Входной путь | Результат (baseURL = `https://api.example.com/v1`) |
|--------------|------|
| `""` | `https://api.example.com/v1` |
| `/users` | `https://api.example.com/v1/users` |
| `users` | `https://api.example.com/v1/users` |
| `/users/` | `https://api.example.com/v1/users/` (косая черта сохранена) |
| `/users?page=1` | `https://api.example.com/v1/users?page=1` |
| `search?q=go` | `https://api.example.com/v1/search?q=go` |
| `https://other.com/api` | `https://other.com/api` (абсолютный URL используется напрямую) |

### Объединение параметров запроса

Когда `baseURL` имеет собственные параметры запроса, параметры пути запроса **добавляются** к ним:

```text
baseURL  = https://api.example.com/v1?lang=zh
path     = /users?page=1
результат = https://api.example.com/v1/users?lang=zh&page=1
```

### Защита от path traversal

`buildURL` проверяет, что объединённый путь находится в области действия базового пути, предотвращая ааки path traversal:

```text
baseURL = https://api.example.com/v1
path    = ../admin/delete       ← после очистки path.Join: /admin/delete

Проверка: находится ли /admin/delete в области /v1?
Результат: нет → возврат ошибки "path escapes base URL scope"
```

:::warning Распознавание абсолютного URL
Только пути с префиксами `http://` и `https://` распознаются как абсолютные URL; другие протоколы (например, `ftp://`) не распознаются и объединяются как относительные, что обычно приводит к ошибке запроса. При пустом базовом пути или `/` проверка области действия не выполняется.
:::

## Автоматическое управление сессией

Управление сессией доменного клиента состоит из трёх этапов:

```text
Управление сессией в жизненном цикле запроса:

  ① prepareOptions() (перед отправкой)
     Чтение заголовков и Cookie сессии из SessionManager
     → преобразование в RequestOption для внедрения в запрос

  ② captureFromOptions() (перед отправкой)
     Извлечение Cookie и заголовков из пользовательских RequestOption
     → сохранение в SessionManager (обновление при наличии, пропуск при отсутствии)

  ③ UpdateFromResult() (после отправки)
     Извлечение Set-Cookie из ответа
     → сохранение в SessionManager
```

```go
dc, _ := httpc.NewDomainDefault("https://api.example.com")

// Заголовки сессии: внедряются в каждый последующий запрос
dc.SetHeader("Authorization", "Bearer token-abc")
dc.SetHeader("Accept-Language", "zh-CN")

// Set-Cookie после входа автоматически фиксируется
dc.Post("/login", httpc.WithJSON(loginData))
// Последующие запросы автоматически несут Cookie сессии

// Cookie также можно установить вручную
dc.SetCookie(&http.Cookie{Name: "session", Value: "xyz"})

// Запрос состояния сессии
dc.GetCookie("session")  // → копия *http.Cookie
dc.GetHeaders()          // → копия map[string]string
```

:::tip Потокобезопасность
`SessionManager` внутренне защищён `sync.RWMutex` — методы `SetHeader`/`SetCookie`/`GetCookie` можно безопасно вызывать конкурентно. `prepareOptions` использует неатомарную последовательность «чтение-запись» — состояние сессии спроектировано как в конечном счёте согласованное; конкурентные запросы могут пересекаться в `prepareOptions`, но каждый запрос в момент `prepareOptions` фиксирует согласованный снимок.
:::

## Предостережение о двойном выполнении опций

`prepareSessionOptions` перед отправкой запроса **применяет дважды** пользовательские `RequestOption`: один раз в `captureFromOptions` для захвата состояния сессии, второй раз в `client.Request` для фактического запроса.

```text
prepareSessionOptions(options):
  ① managedOptions = prepareOptions()        ← чтение состояния сессии
  ② allOptions = managedOptions + options    ← объединение
  ③ captureFromOptions(options)              ← применение к временному запросу (захват сессии)
  ④ return allOptions → client.Request()     ← применение к фактическому запросу (второй раз)
```

::: warning Избегайте опций с побочными эффектами
Следующие опции в `DomainClient` выполняются дважды, что приводит к неожиданному поведению:

| Проблемная опция | Причина |
|------------------|---------|
| Увеличение счётчика | Увеличивается дважды за один запрос |
| Случайная генерация nonce | На этапе захвата и этапе запроса генерируются разные значения |
| `WithOnRequest` / `WithOnResponse` | Колбэки явно очищаются, повторного срабатывания нет (безопасно) |

При необходимости опций с побочными эффектами используйте базовый `Client` для прямой отправки запросов или управляйте состоянием вне опций.
:::

## Метод Download

```go
func (dc *DomainClient) Download(ctx context.Context, path string, cfg *DownloadConfig, options ...RequestOption) (*DownloadResult, error)
```

Загружает файл в `cfg.FilePath`, `path` объединяется относительно `baseURL`. Сигнатура совпадает с пакетной `Download` и `Client.Download` — `Download` является единым каноническим входом для загрузки во всех трёх случаях. `cfg` не может быть nil, `cfg.FilePath` должен быть задан (иначе возвращается `ErrEmptyFilePath`).

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/report.pdf"
cfg.Overwrite = true

result, err := dc.Download(ctx, "/files/report.pdf", cfg)
```

Cookie ответа при загрузке автоматически фиксируются в сессии (через `UpdateFromCookies`). Как и в `Request`, опции запроса применяются дважды.

## Отношение к интерфейсу Client

`DomainClient` через утверждение типа при компиляции **одновременно реализует** два интерфейса:

```go
var _ Client = (*DomainClient)(nil)           // Реализует интерфейс Client
var _ DomainClienter = (*DomainClient)(nil)   // Реализует интерфейс DomainClienter
```

```text
Иерархия интерфейсов:
  Doer                                    ← Минимальный интерфейс (только Request)
    └── Client                             ← + HTTP-методы + Download + Close
          └── DomainClienter               ← + URL/Domain/Session + заголовки/Cookie сессии
                └── *DomainClient          ← Конкретная реализация
```

`DomainClienter` встраивает `Client`, поэтому любая функция, принимающая `Client`, может принимать `DomainClienter`. Это позволяет `DomainClient` бесшовно использоваться там, где требуется `Client`, дополнительно предоставляя возможности управления сессией.

## Полный пример инкапсуляции REST API-клиента

Следующий пример демонстрирует, как с помощью `DomainClient` инкапсулировать клиент GitHub API с автоматическим управлением заголовками авторизации и параметрами пагинации.

```go
package main

import (
	"fmt"
	"time"

	"github.com/cybergodev/httpc"
)

// GitHubClient инкапсулирует GitHub REST API
type GitHubClient struct {
	dc httpc.DomainClienter
}

// NewGitHubClient создаёт клиент GitHub API
func NewGitHubClient(token string) (*GitHubClient, error) {
	cfg := httpc.DefaultConfig()
	cfg.Timeouts.Request = 30 * time.Second

	dc, err := httpc.NewDomain("https://api.github.com", cfg)
	if err != nil {
		return nil, err
	}

	// Установка заголовков уровня сессии
	if err := dc.SetHeader("Authorization", "Bearer "+token); err != nil {
		return nil, fmt.Errorf("set auth header: %w", err)
	}
	if err := dc.SetHeader("Accept", "application/vnd.github+json"); err != nil {
		return nil, fmt.Errorf("set accept header: %w", err)
	}
	if err := dc.SetHeader("X-GitHub-Api-Version", "2022-11-28"); err != nil {
		return nil, fmt.Errorf("set api version: %w", err)
	}

	return &GitHubClient{dc: dc}, nil
}

// Close освобождает ресурсы
func (g *GitHubClient) Close() error { return g.dc.Close() }

// GetUser получает информацию о пользователе (относительный путь автоматически объединяется с baseURL)
func (g *GitHubClient) GetUser(username string) (*httpc.Result, error) {
	return g.dc.Get(fmt.Sprintf("/users/%s", username))
}

// ListUserRepos выводит список репозиториев пользователя (с параметрами пагинации)
func (g *GitHubClient) ListUserRepos(username string, page, perPage int) (*httpc.Result, error) {
	return g.dc.Get(fmt.Sprintf("/users/%s/repos?page=%d&per_page=%d", username, page, perPage))
}

func main() {
	client, err := NewGitHubClient("ghp_your_token_here")
	if err != nil {
		panic(err)
	}
	defer client.Close()

	// Каждый запрос автоматически несёт заголовки Authorization, Accept, X-GitHub-Api-Version
	result, err := client.GetUser("torvalds")
	if err != nil {
		panic(err)
	}
	fmt.Printf("Код состояния: %d\n", result.StatusCode())

	// Разбор JSON-ответа через Unmarshal
	var user struct {
		Login string `json:"login"`
	}
	if err := result.Unmarshal(&user); err != nil {
		panic(err)
	}
	fmt.Printf("Имя пользователя: %s\n", user.Login)

	repos, err := client.ListUserRepos("torvalds", 1, 5)
	if err != nil {
		panic(err)
	}
	fmt.Printf("Код состояния списка репозиториев: %d\n", repos.StatusCode())
	// Пример вывода:
	// Код состояния: 200
	// Имя пользователя: torvalds
	// Код состояния списка репозиториев: 200
}
```

:::tip Возвращаемое значение интерфейса
`NewDomain` и `NewDomainDefault` возвращают интерфейс `DomainClienter`, а не конкретный тип `*DomainClient`, что удобно для замены на mock в тестах. Для доступа к конкретному типу используйте утверждение типа.
:::

## См. также

- [Управление сессиями](./session) — подробный справочник по SessionManager
- [Доменный клиент и сессии](../../guides/domain-session) — руководство по использованию
- [Определения интерфейсов](../types/interfaces) — определения интерфейсов Client, Doer, DomainClienter
- [Загрузка файлов](./download) — детали DownloadConfig и DownloadResult
