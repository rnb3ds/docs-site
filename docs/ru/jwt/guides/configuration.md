---
sidebar_label: "Подробная конфигурация"
title: "Подробная конфигурация - CyberGo JWT | Поля конфигурации и усиление безопасности"
description: "Руководство по конфигурации: все поля Config включая проверку издателя/аудитории, допуск часов, обязательный срок, дизайн TTL, а также встроенную проверку ввода с ограничениями длины, обнаружением инъекций и обработкой ValidationError."
sidebar_position: 15
check_code: false
---

# Подробная конфигурация

[`Config`](../api-reference/config) — единая точка входа для конфигурации CyberGo JWT. Эта страница посвящена полям безопасности и поведения помимо алгоритмов подписи; ключи и выбор алгоритма см. в [Алгоритмы подписи](./signing-algorithms).

## Обзор конфигурации

[`DefaultConfig()`](../api-reference/functions#defaultconfig) предоставляет разумные значения по умолчанию — достаточно задать секретный ключ:

| Поле | По умолчанию | Описание |
|------|-------------|----------|
| `AccessTokenTTL` | 15 минут | Время жизни access-токена |
| `RefreshTokenTTL` | 7 дней | Время жизни refresh-токена |
| `Issuer` | `"jwt-service"` | Записывается в `iss` и проверяется |
| `SigningMethod` | `HS256` | Алгоритм подписи |
| `ClockSkew` | 0 | Допуск часов |
| `RequireExpiration` | `false` | Требуется ли утверждение `exp` |
| `ExpectedAudience` | `""` (без проверки) | Ожидаемая аудитория |

### Правила автозаполнения normalizeConfig

[`New()`](../api-reference/functions#new) перед проверкой вызывает `normalizeConfig`, заполняющий нулевые поля значениями по умолчанию. Следующая таблица описывает каждое правило:

| Нулевое условие | Заполняемое значение | Условие срабатывания |
|-----------------|----------------------|----------------------|
| `AccessTokenTTL == 0` | 15 минут | Всегда |
| `RefreshTokenTTL == 0` | 7 дней | Всегда |
| `Issuer == ""` | `"jwt-service"` | Всегда |
| `SigningMethod == ""` | `HS256` | Всегда |
| `RateLimitRate == 0` | 100 | Только при `EnableRateLimit == true` |
| `RateLimitWindow == 0` | 1 минута | Только при `EnableRateLimit == true` |
| `Blacklist.MaxSize == 0` | 100000 | Только для встроенного хранилища (`Store == nil`) |
| `Blacklist.CleanupInterval == 0` | 5 минут | Только для встроенного хранилища |
| `Blacklist.EnableAutoCleanup` | Принудительно `true` | Только для встроенного хранилища |

::: tip Когда срабатывают значения по умолчанию для ограничения скорости
Значения по умолчанию `RateLimitRate` и `RateLimitWindow` **заполняются только когда `EnableRateLimit` равно `true`**. Если `EnableRateLimit` равно `false` (по умолчанию), ограничение скорости не включается и эти поля игнорируются. См. [Ограничение скорости](./rate-limiting).
:::

::: warning Пользовательский BlacklistStore пропускает заполнение
Когда `Blacklist.Store` не равно `nil` (используется пользовательский бэкенд хранилища), поля `MaxSize`, `CleanupInterval` и `EnableAutoCleanup` игнорируются — управление хранилищем берёт на себя бэкенд. `EnableAutoCleanup` встроенного хранилища принудительно устанавливается в `true` для предотвращения неограниченного роста памяти.
:::

## Проверка издателя и аудитории

### Issuer (Издатель)

При заданном `Issuer` он записывается в утверждение `iss` при создании токена и проверяется на соответствие при верификации:

```go
cfg := jwt.DefaultConfig()
cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
cfg.Issuer = "my-app-v1" // Токен будет содержать iss: "my-app-v1"
```

При проверке, если `iss` токена не соответствует настроенному значению, возвращается `ErrTokenInvalidIssuer`.

### ExpectedAudience (Ожидаемая аудитория)

При заданном `ExpectedAudience` проверка удостоверяется, что утверждение `aud` токена содержит это значение:

```go
package main

import (
    "fmt"
    "time"

    "github.com/cybergodev/jwt"
)

func main() {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    cfg.ExpectedAudience = "billing-api"

    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    // Токен с совпадающей аудиторией
    claims := &jwt.Claims{
        UserID: "user1",
        RegisteredClaims: jwt.RegisteredClaims{
            Audience: jwt.StringOrSlice{"billing-api"},
        },
    }
    token, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }

    _, valid, _ := processor.Validate(token)
    fmt.Println("Valid:", valid)
    // Вывод: Valid: true

    // Токен с неверной аудиторией отклоняется
    wrongClaims := &jwt.Claims{
        UserID: "user2",
        RegisteredClaims: jwt.RegisteredClaims{
            Audience: jwt.StringOrSlice{"admin-api"},
        },
    }
    wrongToken, _ := processor.Create(wrongClaims)
    _, valid, _ = processor.Validate(wrongToken)
    fmt.Println("Wrong audience valid:", valid)
    // Вывод: Wrong audience valid: false
}
```

::: tip Сценарии с микросервисами
В микросервисных архитектурах задавайте разные `ExpectedAudience` для разных сервисов, чтобы токены, выпущенные одним сервисом, не принимались другим, обеспечивая межсервисную изоляцию токенов.
:::

## Допуск часов (ClockSkew)

`ClockSkew` предоставляет окно допустимости для проверки `exp` (истечение) и `nbf` (не ранее), компенсируя рассинхронизацию часов между издателем и проверяющим. Допуск симметрично действует на оба временных утверждения:

- **В направлении `exp`**: токен считается истёкшим только после `exp + ClockSkew` — смягчает проверку истечения
- **В направлении `nbf`**: токен считается действительным уже с `nbf - ClockSkew` — смягчает проверку «не ранее»

```go
cfg := jwt.DefaultConfig()
cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
cfg.ClockSkew = 30 * time.Second // Допуск 30 секунд рассинхронизации
```

::: warning Рекомендация
В распределённых системах рассинхронизация часов между серверами может составлять несколько секунд. Рекомендуется `ClockSkew = 30с ~ 60с`. Нулевое значение (по умолчанию) означает строгую проверку без допуска.
:::

### Влияние ClockSkew на действительность токена

Следующая таблица показывает действительность токена с `exp = 12:00:00`, `nbf = 12:00:00` при `ClockSkew = 30s` в различные моменты проверки:

| Время проверки | Отношение к exp | Отношение к nbf | Результат |
|----------------|-----------------|-----------------|-----------|
| `11:59:20` | Не истёк | `nbf - 40s` (за пределами допуска) | Недействителен: `ErrTokenNotValidYet` |
| `11:59:40` | Не истёк | `nbf - 20s` (в пределах допуска) | Действителен |
| `12:00:00` | Не истёк | Момент `nbf` | Действителен |
| `12:00:10` | `exp + 10s` (в пределах допуска) | Уже действителен | Действителен |
| `12:00:40` | `exp + 40s` (за пределами допуска) | Уже действителен | Недействителен: `ErrTokenExpired` |

::: tip Допуск только расширяет, не сужает
`ClockSkew` только расширяет окно принятия токена, не сужая его по сравнению со строгой проверкой. Нулевое значение эквивалентно строгой семантике RFC 7519: токен вступает в силу ровно с `nbf` и истекает ровно в `exp`.
:::

`ClockSkew` не может быть отрицательным — `Config.Validate()` возвращает `ErrInvalidConfig`.

## Обязательный срок (RequireExpiration)

По умолчанию (`RequireExpiration = false`) токены без утверждения `exp` никогда не истекают. Это допустимо по RFC 7519, но может быть проблемой безопасности в чувствительных сценариях.

Установка `RequireExpiration = true` отклоняет токены без `exp` при проверке:

```go
cfg := jwt.DefaultConfig()
cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
cfg.RequireExpiration = true // Отклонять токены без exp
```

::: tip Усиление безопасности
Токены, выпущенные этой библиотекой, всегда содержат `exp` (производный от TTL), поэтому `RequireExpiration` в первую очередь влияет на токены от других издателей или устаревшие токены без `exp`. Рекомендуется включать в production.
:::

## Дизайн TTL токенов

TTL access и refresh токенов должен балансировать безопасность и удобство в зависимости от сценария:

| Сценарий | AccessTokenTTL | RefreshTokenTTL | Описание |
|----------|----------------|-----------------|----------|
| Высокая безопасность (финансы, медицина) | 5 минут | 1 час | Короткий TTL ограничивает окно доступа |
| Веб-приложение | 15 минут | 7 дней | По умолчанию, баланс безопасности и UX |
| Мобильное приложение | 30 минут | 30 дней | Длинный TTL сокращает повторные входы |
| Внутренний сервис | 1 час | 24 часа | Высокое доверие во внутренней сети |

::: warning Ограничение
`Config.Validate()` требует `AccessTokenTTL < RefreshTokenTTL`, и оба должны быть положительными.
:::

## Матрица проверки конфигурации

`Config.Validate()` выполняется в `New()` после `normalizeConfig` и возвращает три категории ошибок: `ErrInvalidConfig`, `ErrInvalidSecretKey`, `ErrInvalidSigningMethod`.

### Проверка ключа подписи (по семейству алгоритмов)

| Семейство | Требования к `SigningKey` | `VerificationKey` (необязательно) |
|-----------|---------------------------|-----------------------------------|
| HMAC (HS256/384/512) | Строка `SecretKey` ≥ 32 байт + не слабый ключ | Неприменимо (HMAC симметричный) |
| RSA (RS/PS 256/384/512) | `*rsa.PrivateKey` ≥ 2048 бит | `*rsa.PublicKey` ≥ 2048 бит |
| ECDSA (ES256/384/512) | `*ecdsa.PrivateKey`, кривая соответствует алгоритму | `*ecdsa.PublicKey` |

::: tip Назначение VerificationKey
После установки `VerificationKey` проверка токена использует публичный ключ, а не приватный — подходит для сервисов, которые только проверяют (например, серверы ресурсов). Если опущено, для проверки используется приватный ключ из `SigningKey`. Подробнее см. [Алгоритмы подписи](./signing-algorithms).
:::

### Полный перечень проверок Config.Validate()

| Проверка | Условие | Возвращаемая ошибка |
|-----------|---------|---------------------|
| Указатель конфигурации | `nil` | `ErrInvalidConfig` |
| Длина HMAC-ключа | `SecretKey < 32` байт | `ErrInvalidSecretKey` |
| Сила HMAC-ключа | Слабый ключ (низкая энтропия/сложность) | `ErrInvalidSecretKey` |
| Тип ключа подписи RSA | Не `*rsa.PrivateKey` | `ErrInvalidSecretKey` |
| Сила ключа подписи RSA | `< 2048` бит | `ErrInvalidSecretKey` |
| Тип ключа проверки RSA | Не `*rsa.PublicKey` (если задан) | `ErrInvalidSecretKey` |
| Сила ключа проверки RSA | `< 2048` бит (если задан) | `ErrInvalidSecretKey` |
| Тип ключа подписи ECDSA | Не `*ecdsa.PrivateKey` | `ErrInvalidSecretKey` |
| Соответствие кривой ECDSA | Кривая не соответствует алгоритму (например, ES256 требует P-256) | `ErrInvalidSecretKey` |
| Тип ключа проверки ECDSA | Не `*ecdsa.PublicKey` (если задан) | `ErrInvalidSecretKey` |
| Алгоритм подписи | Не входит в 12 встроенных | `ErrInvalidSigningMethod` |
| AccessTokenTTL | `<= 0` | `ErrInvalidConfig` |
| RefreshTokenTTL | `<= 0` | `ErrInvalidConfig` |
| Соотношение TTL | `AccessTokenTTL >= RefreshTokenTTL` | `ErrInvalidConfig` |
| ClockSkew | `< 0` | `ErrInvalidConfig` |
| Blacklist MaxSize | `<= 0` (только встроенное хранилище) | `ErrInvalidConfig` |
| Blacklist CleanupInterval | `<= 0` (только встроенное хранилище) | `ErrInvalidConfig` |

::: tip Порядок проверки
`Validate()` сначала проверяет ключ подписи (возвращая `ErrInvalidSecretKey` или `ErrInvalidSigningMethod`), затем TTL, ClockSkew и конфигурацию Blacklist (возвращая `ErrInvalidConfig`). Если ключ недействителен, последующие проверки не выполняются — исправьте первую ошибку и повторите.
:::

## Проверка ввода и усиление безопасности

CyberGo JWT применяет многоуровневую проверку ввода к полям [`Claims`](../api-reference/claims), предотвращая инъекционные атаки и аномальные данные.

### Ограничения полей

| Проверка | Ограничение | Вызываемая ошибка |
|----------|-------------|-------------------|
| Длина строкового поля | ≤ 256 символов | `ValidationError` |
| Размер массива (permissions, scopes, audience) | ≤ 100 элементов | `ValidationError` |
| Количество Extra-полей | ≤ 50 полей | `ValidationError` |
| Типы значений Extra | `string`, `[]string` | `ValidationError` (вложенные map отклоняются) |

Проверяемые строковые поля включают `UserID`, `Username`, `Role`, `SessionID`, `ClientID` и поля `RegisteredClaims`: `Issuer`, `Subject`, `ID`, `TokenType`.

### Обнаружение инъекционных шаблонов

Библиотека включает 46 встроенных определений опасных шаблонов, охватывающих XSS, SQL-инъекции, обход пути и другие векторы атак:

- **XSS**: `<script>`, `javascript:`, `onerror=`, `<iframe>` и другие HTML/JS инъекционные теги
- **SQL-инъекции**: `drop table`, `union select` и т.д.
- **Обход пути**: `../`, `/etc/passwd`, `file://`
- **Управляющие символы**: ASCII < 32 кроме Tab (9), перевода строки (10), возврата каретки (13)

При обнаружении опасного шаблона возвращается `ValidationError` с `Field`, равным имени поля, и `Message`, равным `"suspicious pattern detected"`.

### Обработка ошибок проверки

```go
token, err := processor.Create(claims)
if err != nil {
    var ve *jwt.ValidationError
    if errors.As(err, &ve) {
        fmt.Printf("Поле: %s, Причина: %s\n", ve.Field, ve.Message)
        // Поле: user_id, Причина: suspicious pattern detected
    }
}
```

`ValidationError` реализует `Unwrap()`, позволяя `errors.Is` и `errors.As` обходить underlying ошибку. В путях `Create` и `Validate` ошибки проверки оборачиваются в `ErrInvalidClaims`.

::: tip Проверка пользовательских Claims
Типы, реализующие интерфейс `CustomClaims`, не проходят глубокую проверку пользовательских полей — реализующий должен обрабатывать это в методе `Validate()`. Стандартные JWT-поля (`iss`, `sub`, `jti` и др.) всегда проверяются на длину и инъекции. См. [Пользовательские Claims](./custom-claims).
:::

## Дальнейшие шаги

- [Алгоритмы подписи](./signing-algorithms) — Выбор алгоритма и настройка ключей
- [Пользовательские Claims](./custom-claims) — Реализация интерфейса CustomClaims
- [Обновление и ротация токенов](./token-refresh) — Двухуровневый TTL и стратегии ротации
- [Config API](../api-reference/config) — Полный справочник полей Config
