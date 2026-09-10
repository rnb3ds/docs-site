---
sidebar_label: "Обзор"
title: "Справочник API - CyberGo HTTPC | Полный указатель"
description: "Полный указатель API HTTPC: опции запроса, Result, Config, middleware, мутаторы, типы, ошибки и константы — 28 опций WithXxx и 5 пресетов конфигурации."
sidebar_position: 1
---

# Справочник API

HTTPC предоставляет 28 функций параметров запроса, 5 предустановок конфигурации, 7 встроенных middleware и полную поддержку загрузки файлов.

## Основная архитектура

HTTPC использует двухслойную архитектуру: методы API Layer 1 — тонкая обёртка, а настоящий движок обработки запросов — конвейер Handler на Layer 2.

```text
Двухслойная архитектура HTTPC
├── Layer 1  Метод API (тонкая обёртка)
│     Функции пакета httpc.Get/Post/... + методы Client + опции запроса → Result
│
└── Layer 2  Конвейер Handler (движок обработки запросов)
      Луковая цепочка MiddlewareFunc(Handler)
      → сборка clientImpl.middlewareChain
      → выполнение (каждый запрос = сборка и запуск цепочки Handler)
```

## Навигация по модулям

### Ядро

| Модуль | Описание |
|--------|----------|
| [Функции пакета и методы клиента](./core/functions) | Функции уровня пакета Get/Post/Put/Patch/Delete и др., методы клиента и вспомогательные функции |
| [Конфигурация](./client-config/config) | Структура Config, 5 предустановок конфигурации, функции валидации и безопасность Cookie |
| [Интерфейсы](./types/interfaces) | Основные интерфейсы Client, Doer, DomainClienter, RetryPolicy и др. |
| [Result](./core/result) | Типы Result, RequestInfo, ResponseInfo, RequestMeta и все методы |
| [Конвейер обработчиков](./handler/handler-chain) | Конвейер Handler, луковая цепочка MiddlewareFunc, комбинатор Chain и контракты мутаторов |
| [Мутаторы](./handler/mutators) | Методы чтения/записи RequestMutator/ResponseMutator и утверждения типа |

### Запросы и ответы

| Модуль | Описание |
|--------|----------|
| [Параметры запроса](./core/options) | 28 функций параметров запроса WithXxx (заголовки, тело, аутентификация, Cookie, обратные вызовы и др.) |
| [Встроенное middleware](./client-config/middleware) | Композиция Chain, 7 встроенных фабрик middleware и типы событий аудита |
| [Типы ошибок](./types/errors) | ClientError, 12 типов перечисления ErrorType и 12 переменных ошибок |

### Продвинутые функции

| Модуль | Описание |
|--------|----------|
| [Доменный клиент](./client-config/domain-client) | Создание DomainClient, HTTP-методы, методы загрузки и правила объединения URL |
| [Управление сессиями](./client-config/session) | Управление Cookie/заголовками SessionManager и проверка безопасности |
| [Загрузка файлов](./client-config/download) | Функции загрузки, DownloadConfig, докачка и защита |
| [Константы и типы](./types/constants) | Перечисление BodyKind, FormData/FileData и ключи контекста аудита |

## Карта API

Полный индекс, сгруппированный по типам символов; он один к одному соответствует экспортируемой поверхности пакета `github.com/cybergodev/httpc` — переходите к страницам с подробностями по ссылкам.

### Клиент и функции уровня пакета

| Символ | Описание |
|--------|----------|
| [`New`](./core/functions#new) / [`NewDefault`](./core/functions#newdefault) | Создание клиента (пользовательская конфигурация / конфигурация по умолчанию) |
| [`Get`](./core/functions#get) / `Post` / `Put` / `Patch` / `Delete` / `Head` / `Options` / [`Request`](./core/functions#request) | HTTP-методы уровня пакета (разделяют внутренний клиент по умолчанию) |
| [`Download`](./core/functions#download) | Единая точка входа загрузки файлов (одинаковые имя и сигнатура в трёх местах: функция пакета / Client / DomainClient) |
| [`SetDefaultClient`](./core/functions#setdefaultclient) / [`CloseDefaultClient`](./core/functions#closedefaultclient) | Замена и закрытие клиента по умолчанию |
| [`NewDomain`](./core/functions#newdomain) / [`NewDomainDefault`](./core/functions#newdomaindefault) | Клиенты с областью действия на уровне домена |
| [`SetSecurityWarnOutput`](./core/functions#setsecuritywarnoutput) | Перенаправление вывода предупреждений безопасности |
| [`FormatBytes`](./core/functions#formatbytes) / [`FormatSpeed`](./core/functions#formatspeed) | Форматирование количества байтов / скорости |

### Параметры запроса (28)

| Группа | Параметры |
|--------|-----------|
| Заголовки (3) | `WithHeader`, `WithHeaderMap`, `WithUserAgent` |
| Аутентификация (2) | `WithBasicAuth`, `WithBearerToken` |
| Тело запроса (7) | `WithJSON`, `WithXML`, `WithForm`, `WithFormData`, `WithFile`, `WithBinary`, `WithBody` |
| Параметры строки запроса (2) | `WithQuery`, `WithQueryMap` |
| Cookie (5) | `WithCookie`, `WithCookies`, `WithCookieMap`, `WithCookieString`, `WithSecureCookie` |
| Управление запросом (7) | `WithContext`, `WithTimeout`, `WithMaxRetries`, `WithFollowRedirects`, `WithMaxRedirects`, `WithAllowPrivateIPs`, `WithStreamBody` |
| Колбэки (2) | `WithOnRequest`, `WithOnResponse` |

Сигнатуры всех параметров, правила валидации и переопределяемые значения по умолчанию Config — в [Параметрах запроса](./core/options).

### Семейство Result

| Категория | Символы |
|-----------|---------|
| Тип | `Result` (17 nil-безопасных методов) |
| Состояние и протокол | `StatusCode`, `Proto`, `IsSuccess`, `IsRedirect`, `IsClientError`, `IsServerError` |
| Доступ к телу | `Body`, `RawBody` |
| Разбор и сохранение | `Unmarshal`, `SaveToFile`, `String` |
| Cookie | `ResponseCookies`, `GetCookie`, `HasCookie`, `RequestCookies`, `GetRequestCookie`, `HasRequestCookie` |
| Подтипы | `RequestInfo`, `ResponseInfo`, `RequestMeta` (включая поле прокси `ProxyURL`) |

Подробнее — [Result](./core/result).

### Конфигурация

| Категория | Символы |
|-----------|---------|
| Основной тип | `Config` (шесть групп: `Timeouts` / `Connection` / `Security` / `Retry` / `Middleware` / `Defaults`) |
| Типы подконфигураций | `TimeoutConfig`, `ConnectionConfig`, `SecurityConfig`, `RetryConfig`, `MiddlewareConfig`, `RequestDefaults` |
| Пресеты (5) | `DefaultConfig`, `SecureConfig`, `PerformanceConfig`, `TestingConfig`, `MinimalConfig` |
| Валидация и вывод | `ValidateConfig`, `Config.String` |
| Безопасность Cookie | `CookieSecurityConfig`, `DefaultCookieSecurityConfig`, `StrictCookieSecurityConfig` |
| Конфигурация загрузки | `DownloadConfig`, `DefaultDownloadConfig`, `DownloadResult`, `DownloadProgressCallback`, `ChecksumAlgorithm` |
| Конфигурация сессий | `SessionConfig`, `DefaultSessionConfig`, `NewSessionManager`, `NewSessionManagerDefault` |

Подробнее — [Конфигурация](./client-config/config), [Загрузка файлов](./client-config/download), [Управление сессиями](./client-config/session).

### Handler, middleware и мутаторы

| Категория | Символы |
|-----------|---------|
| Типы конвейера | `Handler`, `MiddlewareFunc`, `Chain` |
| Фабрики middleware (7) | `LoggingMiddleware`, `RecoveryMiddleware`, `RequestIDMiddleware`, `TimeoutMiddleware`, `HeaderMiddleware`, `MetricsMiddleware`, `AuditMiddleware` |
| Конфигурации middleware | `LoggingConfig`, `RequestIDConfig`, `TimeoutMiddlewareConfig`, `HeaderConfig`, `MetricsConfig`, `AuditConfig` (у каждой — конструктор `Default*Config()`) |
| Мутаторы | `RequestMutator`, `ResponseMutator` (контракт чтения/записи запроса/ответа для middleware) |

Подробнее — [Конвейер обработчиков](./handler/handler-chain), [Встроенное middleware](./client-config/middleware), [Мутаторы](./handler/mutators).

### Интерфейсы и типы

| Категория | Символы |
|-----------|---------|
| Основные интерфейсы | `Client`, `Doer`, `DomainClienter`, `RetryPolicy` |
| Псевдонимы типов | `RequestOption`, `ClientError`, `ErrorType`, `CertificatePinner`, `ProxyStrategy` |
| Закрепление сертификатов | `NewSPKIHashPinner`, `NewPublicKeyPinner`, `NewCertificatePinnerChain` |
| Сессии и домены | `SessionManager`, `DomainClient` (рекомендуется использовать через интерфейс `DomainClienter`) |
| Типы данных | `FormData`, `FileData`, `AuditEvent` |

Подробнее — [Интерфейсы](./types/interfaces), [Доменный клиент](./client-config/domain-client), [Управление сессиями](./client-config/session), [Константы и типы](./types/constants).

### Ошибки и константы

| Категория | Символы |
|-----------|---------|
| Типы ошибок | `ClientError`, `ErrorType` (перечисление из 12 категорий ошибок) |
| Сигнальные ошибки (12) | `ErrClientClosed`, `ErrNilConfig`, `ErrInvalidHeader`, `ErrInvalidTimeout`, `ErrInvalidRetry`, `ErrInvalidConnection`, `ErrInvalidSecurity`, `ErrInvalidMiddleware`, `ErrEmptyFilePath`, `ErrFileExists`, `ErrResponseBodyEmpty`, `ErrResponseBodyTooLarge` |
| BodyKind (6 констант) | `BodyAuto`, `BodyJSON`, `BodyXML`, `BodyForm`, `BodyBinary`, `BodyMultipart` |
| Другие константы | `ProxyStrategyRoundRobin` / `ProxyStrategyRandom`, `ChecksumSHA256`, ключи контекста аудита |

Подробнее — [Типы ошибок](./types/errors), [Константы и типы](./types/constants).

## Краткий справочник

### Создание клиента

```go
client, err := httpc.NewDefault()              // конфигурация по умолчанию
client, err := httpc.New(httpc.SecureConfig()) // безопасная предустановка
client, err := httpc.New(customConfig)         // пользовательская конфигурация
```

### Отправка запросов

```go
// Функции пакета
result, err := httpc.Get(url, options...)

// Методы клиента
result, err := client.Get(url, options...)

// С контекстом
result, err := client.Request(ctx, "GET", url, options...)
```

### Обработка ответов

```go
result.StatusCode()           // код состояния
result.Body()                 // тело ответа (строка)
result.RawBody()              // тело ответа (байты)
result.Unmarshal(&data)       // парсинг JSON
result.IsSuccess()            // является ли 2xx
result.Meta.Duration          // время выполнения запроса
result.Meta.Attempts          // количество повторных попыток
```

## Совместимость версий

- **Версия Go**: требуется Go 1.25 и выше (`go.mod` объявляет `go 1.25.0`).
- **Путь импорта**: `github.com/cybergodev/httpc` (имя пакета `httpc`, псевдоним не требуется).
- **Прямые зависимости**: только `golang.org/x/sys` (для обнаружения системного прокси на всех платформах — Linux/macOS/Windows), других сторонних зависимостей нет.
- **Состояние API**: все экспортируемые символы в настоящее время не имеют маркировки `Deprecated`; библиотека активно поддерживается.
