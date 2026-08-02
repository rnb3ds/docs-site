---
sidebar_label: "Управление сессиями"
title: "Управление сессиями - CyberGo HTTPC | SessionManager"
description: "Справочник API SessionManager HTTPC: создание NewSessionManager, конфигурация SessionConfig, управление заголовками SetHeader, методы SetCookie и полная проверка безопасности SetCookieSecurity."
sidebar_position: 3
---

# Управление сессиями

SessionManager предоставляет потокобезопасное хранилище Cookie и заголовков запросов, используемое DomainClient внутренне через встраивание. Он инкапсулирует конкурентно-безопасное хранилище на основе `sync.RWMutex` — все операции чтения используют блокировку чтения, операции записи — блокировку записи, подходит для совместного использования состояния сессии между запросами в высококонкурентных сценариях.

:::tip Когда нужно использовать SessionManager напрямую
Обычно вручную создавать SessionManager не требуется — `NewDomain` создаёт DomainClient, который автоматически встраивает его. Сценарии прямого использования SessionManager: необходимость совместного использования сессии между несколькими DomainClient, переключение политики безопасности Cookie во время выполнения или массовое извлечение Cookie из ответов.
:::

## SessionConfig

```go
type SessionConfig struct {
    // CookieSecurity настраивает проверку безопасности Cookie.
    // nil означает отсутствие проверки безопасности Cookie.
    CookieSecurity *CookieSecurityConfig
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| `CookieSecurity` | `*CookieSecurityConfig` | Конфигурация проверки безопасности Cookie; nil означает без проверки |

```go
func DefaultSessionConfig() SessionConfig
```

Возвращает конфигурацию по умолчанию (без проверки безопасности Cookie). Способ использования см. ниже в [NewSessionManager](#newsessionmanager).

## NewSessionManager

```go
func NewSessionManager(cfg SessionConfig) (*SessionManager, error)
```

Создаёт менеджер сессий. Передаётся значение `SessionConfig` или используется `NewSessionManagerDefault()` как быстрый способ без аргументов. Текущая реализация всегда возвращает nil error; возвращаемое значение error зарезервировано для будущей проверки конфигурации.

```go
// С конфигурацией по умолчанию
sm, err := httpc.NewSessionManagerDefault()

// С конфигурацией (включена строгая проверка безопасности Cookie)
cfg := httpc.DefaultSessionConfig()
cfg.CookieSecurity = httpc.StrictCookieSecurityConfig()
sm, err := httpc.NewSessionManager(cfg)
```

### NewSessionManager vs NewSessionManagerDefault

| Конструктор | Параметр | Сценарий применения |
|-------------|----------|---------------------|
| `NewSessionManager(cfg)` | Явный SessionConfig | Требуется пользовательская политика CookieSecurity |
| `NewSessionManagerDefault()` | Без параметров | Конфигурация по умолчанию (без проверки Cookie) |

`NewSessionManagerDefault()` эквивалентен `NewSessionManager(DefaultSessionConfig())`, симметричен дизайну `NewDefault()` основного клиента.

## NewSessionManagerDefault

```go
func NewSessionManagerDefault() (*SessionManager, error)
```

Удобный конструктор, эквивалент `NewSessionManager(DefaultSessionConfig())`.

```go
sm, err := httpc.NewSessionManagerDefault()
```

## Управление заголовками

SessionManager поддерживает заголовки запросов между запросами через следующие методы. Все методы потокобезопасны: операции записи (SetHeader/SetHeaders/DeleteHeader/ClearHeaders) получают блокировку записи, операции чтения (GetHeaders) — блокировку чтения.

### SetHeader

```go
func (s *SessionManager) SetHeader(key, value string) error
```

Добавляет или обновляет одиночный заголовок сессии. Все последующие запросы автоматически его несут. Перед вызовом через `validation.ValidateHeaderKeyValue` проверяется корректность ключа и значения (перехват управляющих символов, CRLF-инъекций и др.), при некорректности возвращается обёрнутая ошибка. nil-приёмник возвращает `"session manager is nil"`.

```go
err := sm.SetHeader("Authorization", "Bearer "+token)
if err != nil {
    log.Fatalf("Не удалось установить заголовок: %v", err)
}
```

### SetHeaders

```go
func (s *SessionManager) SetHeaders(headers map[string]string) error
```

Массовое добавление или обновление заголовков сессии. Сначала вне блокировки проверяется каждый элемент (при любом некорректном отклоняется вся партия), затем внутри блокировки выполняется слияние через `maps.Copy`. Атомарная семантика: либо все успешны, либо все без изменений.

```go
err := sm.SetHeaders(map[string]string{
    "Authorization": "Bearer " + token,
    "Accept":        "application/json",
    "X-Custom":      "value",
})
```

### DeleteHeader

```go
func (s *SessionManager) DeleteHeader(key string)
```

Удаляет указанный заголовок сессии по key. При отсутствии key — тихая операция без действий. nil-приёмник безопасен (прямой возврат).

### ClearHeaders

```go
func (s *SessionManager) ClearHeaders()
```

Очищает все заголовки сессии, повторная инициализация в пустой map.

### GetHeaders

```go
func (s *SessionManager) GetHeaders() map[string]string
```

Возвращает **глубокую копию** всех заголовков сессии (новый map + копия значений); изменение копии вызывающим не влияет на внутреннее состояние. Пустая сессия возвращает пустой map (не nil).

### Обзор методов управления заголовками

| Метод | Сигнатура | Блокировка | Описание |
|-------|-----------|------------|----------|
| SetHeader | `(key, value string) error` | Запись | Одиночная установка с проверкой |
| SetHeaders | `(headers map[string]string) error` | Запись | Массовая установка с атомарной проверкой |
| DeleteHeader | `(key string)` | Запись | Удаление по key |
| ClearHeaders | `()` | Запись | Очистка всех |
| GetHeaders | `() map[string]string` | Чтение | Возвращает глубокую копию |

## Управление Cookie

SessionManager поддерживает Cookie между запросами через следующие методы. Все операции записи проверяют корректность через `validation.ValidateCookie`; при настроенном `CookieSecurity` дополнительно проверяются атрибуты безопасности (Secure/HttpOnly/SameSite).

### SetCookie

```go
func (s *SessionManager) SetCookie(cookie *http.Cookie) error
```

Добавляет или обновляет одиночный Cookie сессии. Процесс проверки: ① проверка nil cookie; ② базовая проверка `ValidateCookie`; ③ при настроенном CookieSecurity выполнение `validateCookieSecurity` (внутри блокировки записи для потокобезопасности). При любой неудаче возвращается обёрнутая ошибка, хранилище не изменяется.

```go
err := sm.SetCookie(&http.Cookie{
    Name:     "session",
    Value:    "abc123",
    Secure:   true,
    HttpOnly: true,
    SameSite: http.SameSiteStrictMode,
})
if err != nil {
    log.Fatalf("Не удалось установить Cookie: %v", err)
}
```

### SetCookies

```go
func (s *SessionManager) SetCookies(cookies []*http.Cookie) error
```

Массовая установка Cookie. Использует **двухфазную атомарную запись**: ① вне блокировки предварительная проверка базовой корректности всех cookie (проверка nil + ValidateCookie); ② внутри блокировки последовательная проверка безопасности каждого, при любой неудаче немедленный возврат ошибки (уже проверенные также не записываются); ③ только после прохождения всех проверок единое сохранение. Это гарантирует атомарность массовой операции — никакого промежуточного состояния «частичной записи».

### DeleteCookie

```go
func (s *SessionManager) DeleteCookie(name string)
```

Удаляет Cookie по имени. При отсутствии name — тихая операция.

### ClearCookies

```go
func (s *SessionManager) ClearCookies()
```

Очищает все Cookie, повторная инициализация в пустой map.

### GetCookies

```go
func (s *SessionManager) GetCookies() []*http.Cookie
```

Возвращает **глубокую копию** всех Cookie. Используется оптимизация с непрерывным backing array: предварительно выделяется непрерывный массив `[]http.Cookie` длины N, все структуры Cookie располагаются в нём непрерывно, возвращаемый `[]*http.Cookie` указывает на этот массив. Это снижает N независимых выделений в куче до 2 (backing array + срез указателей), значительно уменьшая нагрузку на GC. Пустая сессия возвращает nil.

### GetCookie

```go
func (s *SessionManager) GetCookie(name string) *http.Cookie
```

Получает **глубокую копию** Cookie по имени; при отсутствии возвращает nil.

### Обзор методов управления Cookie

| Метод | Сигнатура | Блокировка | Проверка |
|-------|-----------|------------|----------|
| SetCookie | `(cookie *http.Cookie) error` | Запись | ValidateCookie + опционально CookieSecurity |
| SetCookies | `(cookies []*http.Cookie) error` | Запись | Двухфазная атомарная проверка |
| DeleteCookie | `(name string)` | Запись | Нет |
| ClearCookies | `()` | Запись | Нет |
| GetCookies | `() []*http.Cookie` | Чтение | Нет (возвращает глубокую копию) |
| GetCookie | `(name string) *http.Cookie` | Чтение | Нет (возвращает глубокую копию) |

## Безопасность Cookie

### SetCookieSecurity

```go
func (s *SessionManager) SetCookieSecurity(config *CookieSecurityConfig)
```

Обновляет конфигурацию проверки безопасности Cookie во время выполнения, влияет на **все последующие** вызовы SetCookie/SetCookies/UpdateFromResult/UpdateFromCookies. Передача nil отключает проверку безопасности. nil-приёмник безопасен. Это единственная точка переключения политики безопасности — без пересоздания SessionManager можно переключаться от мягкой к строгой политике и обратно во время выполнения.

```go
// Переключение от мягкой к строгой во время выполнения
sm.SetCookieSecurity(httpc.StrictCookieSecurityConfig())

// Отключение проверки безопасности
sm.SetCookieSecurity(nil)
```

### Поля CookieSecurityConfig

```go
type CookieSecurityConfig struct {
    RequireSecure                bool    // Требовать атрибут Secure (только HTTPS)
    RequireHttpOnly              bool    // Требовать атрибут HttpOnly (защита от XSS)
    RequireSameSite              string  // Требовать значение SameSite: "Strict"/"Lax"/"None"/""
    AllowSameSiteNone            bool    // Разрешать ли SameSite=None
    RequireSecureForSameSiteNone bool    // При SameSite=None принудительно требовать Secure
}
```

Доступные фабричные функции:

| Фабричная функция | Описание |
|-------------------|----------|
| `DefaultCookieSecurityConfig()` | Мягкое значение по умолчанию (разрешает не-HTTPS, доступ из JS, SameSite=None) |
| `StrictCookieSecurityConfig()` | Строгая политика (требует Secure + HttpOnly + SameSite=Strict) |

### UpdateFromResult

```go
func (s *SessionManager) UpdateFromResult(result *Result)
```

Извлекает Cookie из `Response.Cookies` результата запроса (`*Result`) и сохраняет в сессию. При настроенном CookieSecurity небезопасные Cookie **тихо пропускаются** (без возврата ошибки, просто игнорируются), сохраняются только прошедшие проверку. При result=nil, Response=nil или пустых Cookies — прямой возврат. Метод `Request` DomainClient автоматически вызывает этот метод после каждого запроса.

### UpdateFromCookies

```go
func (s *SessionManager) UpdateFromCookies(cookies []*http.Cookie)
```

Обновляет Cookie сессии из среза Cookie. Семантика аналогична UpdateFromResult — небезопасные Cookie тихо пропускаются. Метод Download DomainClient через этот метод фиксирует Cookie из ответа загрузки.

## Внутренние механизмы

### captureFromOptions

```go
func (s *SessionManager) captureFromOptions(options []RequestOption)
```

Метод `prepareSessionOptions` DomainClient внутренне вызывает этот метод для извлечения Cookie и Header из пользовательских RequestOptions в сессию. Детали реализации:

1. Использование временного `engine.Request` из пула объектов (`acquireMiddlewareRequest`/`releaseMiddlewareRequest`) для снижения выделений на горячем пути
2. Последовательное применение option к временному запросу — **мера безопасности**: после каждого option очищаются колбэки `OnRequest`/`OnResponse`, предотвращая накопление побочных эффектов замыканий `WithOnRequest`/`WithOnResponse` в процессе захвата
3. Извлечение Cookie и Header из временного запроса, проверка и сохранение в сессию
4. Извлекаются только Cookie и Header; другие данные (query params, body, колбэки) отбрасываются

:::warning RequestOptions выполняются дважды
Request/Download DomainClient **выполняют RequestOptions дважды** — один раз для захвата сессии (captureFromOptions), второй раз для фактического запроса. Поэтому **избегайте option с побочными эффектами** (счётчики, генерация nonce, случайные числа). При необходимости побочных эффектов используйте базовый Client напрямую.
:::

### prepareOptions

```go
func (s *SessionManager) prepareOptions() []RequestOption
```

DomainClient перед каждым запросом вызывает этот метод для внедрения текущего состояния сессии как RequestOptions:

- **Массовое внедрение Cookie**: все Cookie сессии упаковываются в одну option-замыкание (`r.SetCookies(append(existing, cookies...))`), избегая N выделений замыканий
- **Внедрение header map**: через `WithHeaderMap` однократно внедряется глубокая копия header map

При пустой сессии (без Cookie и без Header) возвращается nil — нулевые накладные расходы.

### Модель потокобезопасности

SessionManager защищает всё состояние одним `sync.RWMutex`:

| Тип операции | Уровень блокировки | Методы |
|--------------|---------------------|--------|
| Чтение (GetHeaders/GetCookies/GetCookie/prepareOptions) | RLock | Допускает конкурентность |
| Запись (Set*/Delete*/Clear*/UpdateFrom*/captureFromOptions/SetCookieSecurity) | Lock | Взаимоисключающие |

`prepareSessionOptions` DomainClient использует неатомарную последовательность «сначала чтение, затем запись»: сначала читается снимок (prepareOptions), затем записывается захват (captureFromOptions) — между двумя шагами возможны пересечения с конкурентными запросами. Это дизайн **в конечном счёте согласованный** — каждый запрос в момент `prepareOptions()` фиксирует согласованный снимок; мгновенная конкурентность между запросами не влияет на корректность отдельного запроса.

## Полный пример: поддержание сессии входа

Следующий пример демонстрирует, как DomainClient автоматически управляет сессией входа: после входа Cookie автоматически поддерживаются до выхода.

```go
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/cybergodev/httpc"
)

func main() {
	ctx := context.Background()

	// Создание DomainClient с автоматическим включением Cookie и встраиванием SessionManager
	dc, err := httpc.NewDomain("https://httpbin.org", httpc.DefaultConfig())
	if err != nil {
		log.Fatalf("Не удалось создать клиент: %v", err)
	}
	defer func() { _ = dc.Close() }()

	// Ручная установка заголовков сессии (все последующие запросы автоматически их несут)
	sm := dc.Session()
	if err := sm.SetHeader("Accept", "application/json"); err != nil {
		log.Fatalf("Не удалось установить заголовок: %v", err)
	}
	if err := sm.SetCookie(&http.Cookie{
		Name:  "session",
		Value: "initial",
	}); err != nil {
		log.Fatalf("Не удалось установить Cookie: %v", err)
	}

	// Вход: Set-Cookie ответа автоматически фиксируется UpdateFromResult в сессию
	loginCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	_, err = dc.Request(loginCtx, "POST", "/cookies/set?token=abc123")
	cancel()
	if err != nil {
		log.Fatalf("Сбой входа: %v", err)
	}

	// Последующие запросы автоматически несут Cookie из сессии
	verifyCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	result, err := dc.Request(verifyCtx, "GET", "/cookies")
	cancel()
	if err != nil {
		log.Fatalf("Сбой проверки: %v", err)
	}

	fmt.Println("Сессия Cookie успешно поддерживается, ответ:")
	fmt.Println(result.String())

	// Выход: очистка сессии
	sm.ClearCookies()
	sm.ClearHeaders()

	fmt.Println("Выполнен выход, сессия очищена")
}
```

:::tip Ручное управление SessionManager
Вы также можете независимо создать SessionManager и совместно использовать его между несколькими DomainClient. Но обычно автоматического управления DomainClient достаточно — после каждого запроса автоматически фиксируются Cookie ответа, а перед запросом автоматически внедряется состояние сессии.
:::

## См. также

- [Доменный клиент](./domain-client) — справочник DomainClient
- [Доменный клиент и сессии](../../guides/domain-session) — руководство по использованию
- [Определения интерфейсов](../types/interfaces) — справочник интерфейса DomainClienter
- [Константы и типы](../types/constants) — справочник полей CookieSecurityConfig
