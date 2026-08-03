---
title: "Основные концепции - CyberGo JWT | Архитектура и модель токенов"
description: "Основные концепции CyberGo JWT: центральный тип Processor и жизненный цикл токена, двухуровневая модель токенов, структуры Claims и RegisteredClaims, интерфейс CustomClaims, обзор Config и интерфейсы расширения."
sidebar_label: "Основные концепции"
sidebar_position: 1
---

# Основные концепции

Эта страница объясняет ключевые абстракции и модель проектирования CyberGo JWT, помогая построить общее понимание. Чтобы сразу перейти к практике, перейдите к [Быстрому старту](./index).

## Processor — центральный тип

[Processor](../api-reference/processor) — центральный тип библиотеки, создаваемый через [`jwt.New(cfg)`](../api-reference/functions#new). Он инкапсулирует всю логику выдачи, проверки, обновления и отзыва токенов. Все методы **потокобезопасны** — один экземпляр можно разделять между горутинами.

Вызовите [`Close()`](../api-reference/processor#close) после использования для безопасного очищения секретного ключа и освобождения ресурсов:

```go
<!-- check-code: skip -->
cfg := jwt.DefaultConfig()
cfg.SecretKey = "your-32-byte-secret-key-here-minimum"

processor, err := jwt.New(cfg)
if err != nil {
    log.Fatal(err)
}
defer processor.Close()
```

Processor реализует интерфейс [`TokenManager`](../api-reference/interfaces#tokenmanager), что позволяет использовать его для внедрения зависимостей и подмены в тестах.

## Жизненный цикл токена

Токен проходит следующие этапы от выдачи до аннулирования:

```text
Выдача  Create(claims)           → Токен доступа (краткосрочный)
        CreateRefresh(claims)     → Токен обновления (долгосрочный)

Проверка Validate(token)          → Claims (проверка подписи, срока, издателя, чёрного списка)

Обновление Refresh(refreshToken)  → Новый токен доступа

Отзыв   Revoke(token)             → Добавлен в чёрный список
Проверка IsRevoked(token)         → bool
```

Каждый этап возвращает **сентинельные ошибки** (например `ErrTokenExpired`, `ErrTokenRevoked`), которые можно точно сопоставить через `errors.Is()`. См. [Обработка ошибок](../guides/error-handling).

## Двухуровневая модель токенов

CyberGo JWT использует дизайн с токеном доступа + токеном обновления:

| | Токен доступа | Токен обновления |
|---|---------|---------|
| **Назначение** | Аутентификация API | Получение новых токенов доступа |
| **TTL по умолчанию** | 15 минут | 7 дней |
| **Метод выдачи** | `Create` | `CreateRefresh` |
| **Метод обновления** | — | `Refresh` |

**Зачем два уровня?** Токены доступа живут недолго, поэтому окно риска при утечке невелико. Токены обновления живут долго, но используются только для получения новых токенов доступа, никогда — для прямой аутентификации API. Этот дизайн балансирует безопасность и пользовательский опыт: пользователям не нужно часто входить в систему, а токены доступа можно обновлять автоматически после истечения.

::: tip Семантика ротации
`Refresh` **не отзывает** токен обновления автоматически. Исходный токен обновления остаётся действительным до истечения срока или явного вызова `Revoke`. Для семантики одноразового использования (ротация токенов обновления) вызовите `Revoke` для старого токена обновления после успешного `Refresh`. См. [Обновление и ротация токенов](../guides/token-refresh).
:::

## Структура Claims

Claims переносят данные идентификации пользователя внутри токена. CyberGo JWT предоставляет двухуровневую структуру:

**RegisteredClaims** (стандартные claims RFC 7519, автоматическое заполнение и проверка):

| Поле | claim | Описание |
|------|-------|----------|
| Issuer | `iss` | Идентификатор издателя |
| Subject | `sub` | Идентификатор субъекта (также ключ ограничения скорости) |
| Audience | `aud` | Целевая аудитория |
| ExpiresAt | `exp` | Срок действия |
| NotBefore | `nbf` | Время начала действия |
| IssuedAt | `iat` | Время выдачи |
| ID | `jti` | Уникальный идентификатор (ключ чёрного списка) |
| TokenType | `token_type` | `access` или `refresh` |

**Claims** (встроенные бизнес-claims, встраивает RegisteredClaims):

```go
<!-- check-code: skip -->
type Claims struct {
    UserID      string         // ID пользователя
    Username    string         // Имя пользователя
    Role        string         // Роль
    Permissions []string       // Список разрешений
    Scopes      []string       // OAuth-области
    SessionID   string         // ID сессии
    ClientID    string         // ID клиента
    Extra       map[string]any // Дополнительные поля
    RegisteredClaims           // Стандартные claims (встраивание)
}
```

Все поля проходят проверку ввода: ограничение длины строки 256, ограничение массива 100, обнаружение шаблонов инъекций (сигнатуры XSS/SQLi).

## Интерфейс CustomClaims

Когда встроенные Claims не отвечают бизнес-требованиям, реализуйте интерфейс [`CustomClaims`](../api-reference/interfaces#customclaims) для определения собственной структуры claims:

```go
<!-- check-code: skip -->
type AppClaims struct {
    UserID string   `json:"user_id"`
    TeamID string   `json:"team_id"`
    Roles  []string `json:"roles,omitempty"`
    jwt.RegisteredClaims
}

func (c *AppClaims) GetRegisteredClaims() *jwt.RegisteredClaims {
    return &c.RegisteredClaims
}

func (c *AppClaims) Validate() error {
    if c.UserID == "" {
        return errors.New("user_id is required")
    }
    return nil
}
```

Пользовательские типы проверяются через `ValidateInto` и обновляются через `RefreshInto` — Processor разбирает токен и заполняет вашу структуру. См. [Пользовательские Claims](../guides/custom-claims).

## Обзор Config

[`Config`](../api-reference/config) — единая точка конфигурации Processor. Начните с `DefaultConfig()` для разумных значений по умолчанию, затем задайте ключ подписи:

| Группа | Поля | Описание |
|--------|------|----------|
| **Подпись** | `SecretKey` / `SigningKey` / `VerificationKey` / `SigningMethod` | HMAC использует SecretKey; RSA/ECDSA использует SigningKey |
| **Токен** | `AccessTokenTTL` / `RefreshTokenTTL` | Время жизни токенов доступа и обновления |
| **Проверка** | `Issuer` / `ExpectedAudience` / `RequireExpiration` / `ClockSkew` | Издатель, аудитория, обязательный срок действия, допуск часов |
| **Безопасность** | `Blacklist` / `EnableRateLimit` | Хранилище отзывов и ограничение скорости |
| **Расширение** | `Clock` | Внедрение часов (для тестирования) |

Выбор алгоритма см. в [Алгоритмы подписи](../guides/signing-algorithms); полную документацию по полям — в [Конфигурации](../guides/configuration).

## Интерфейсы расширения

CyberGo JWT расширяется через интерфейсы:

| Интерфейс | Назначение |
|-----------|------------|
| [`TokenManager`](../api-reference/interfaces#tokenmanager) | Основной интерфейс, реализуемый Processor. Можно определить собственный подмножественный интерфейс (только `Create` + `Validate`) для внедрения зависимостей и слабой связанности |
| [`BlacklistStore`](../api-reference/interfaces#blackliststore) | Пользовательский бэкенд чёрного списка (например, Redis). Реализуйте `Add` / `Contains` / `Close` для подключения внешнего хранилища |
| [`RateLimitProvider`](../api-reference/interfaces#ratelimitprovider) | Пользовательский ограничитель скорости. Реализуйте `Allow` / `Reset` / `Close` для замены встроенного алгоритма token bucket |
| [`ClockProvider`](../api-reference/interfaces#clockprovider) | Внедрение часов. `FixedClock` возвращает фиксированное время для детерминированного контроля логики истечения и обновления в тестах |

## Следующие шаги

- [Быстрый старт](./index) — Выпустите свой первый токен
- [Алгоритмы подписи](../guides/signing-algorithms) — Руководство по выбору HMAC, RSA, ECDSA
- [Конфигурация](../guides/configuration) — Полный справочник по полям и усилению безопасности
- [Интеграция с веб-сервером](../examples/web-server) — Middleware аутентификации и RBAC на практике
