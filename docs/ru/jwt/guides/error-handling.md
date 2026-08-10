---
sidebar_label: "Обработка ошибок"
title: "Ошибки - CyberGo JWT | Сопоставление errors.Is"
description: "Руководство по обработке ошибок: классификация 19 сигнальных ошибок CyberGo JWT по этапам конфигурации, проверки, ограничения и lifecycle, сопоставление errors.Is, ValidationError и стандартизированные ответы."
sidebar_position: 50
---

# Обработка ошибок

CyberGo JWT использует паттерн сигнальных ошибок (sentinel errors). Все ошибки проверяются через `errors.Is()`.

## Базовый шаблон

```go
claims, valid, err := processor.Validate(tokenString)
if err != nil {
    switch {
    case errors.Is(err, jwt.ErrTokenExpired):
        // Токен истёк
    case errors.Is(err, jwt.ErrTokenRevoked):
        // Токен отозван
    case errors.Is(err, jwt.ErrTokenInvalidIssuer):
        // Издатель не совпадает
    case errors.Is(err, jwt.ErrTokenInvalidAudience):
        // Аудитория не совпадает
    case errors.Is(err, jwt.ErrInvalidToken):
        // Подпись недействительна или формат ошибочен
    case errors.Is(err, jwt.ErrProcessorClosed):
        // Processor закрыт
    default:
        // Другие ошибки
    }
}
```

:::tip Используйте errors.Is()
Не используйте `err == jwt.ErrTokenExpired` или сопоставление строк. `errors.Is()` корректно обрабатывает обёрнутые ошибки.
:::

## Классификация ошибок

### Этап конфигурации

`jwt.New()` может возвращать следующие ошибки:

| Ошибка | Причина | Решение |
|--------|---------|---------|
| `ErrInvalidConfig` | Несколько недопустимых параметров | Проверьте все поля Config |
| `ErrInvalidSecretKey` | HMAC-ключ менее 32 байт или слабый ключ | Используйте более надёжный ключ |
| `ErrInvalidSigningMethod` | Неподдерживаемый алгоритм подписи | Используйте один из 12 встроенных алгоритмов |

### Операции с токенами

| Ошибка | Методы | Рекомендации по обработке |
|--------|--------|--------------------------|
| `ErrEmptyToken` | Все методы операций с токенами | Проверьте заголовок запроса |
| `ErrInvalidToken` | Validate, Refresh, ValidateInto, RefreshInto, Revoke, IsRevoked | Подпись не совпадает, отказать в доступе |
| `ErrAlgorithmMismatch` | Validate, Refresh, ValidateInto, RefreshInto | Алгоритм токена не совпадает с конфигурацией, отказать в доступе |
| `ErrExpirationRequired` | Validate, Refresh, ValidateInto, RefreshInto | `RequireExpiration` включён, но у токена нет утверждения `exp` |
| `ErrTokenTypeMismatch` | Refresh, RefreshInto | Для обновления использован токен доступа (`token_type=access`), отказать в доступе |
| `ErrTokenExpired` | Validate, Refresh, ValidateInto, RefreshInto | Направить пользователя на обновление токена |
| `ErrTokenNotValidYet` | Validate, Refresh, ValidateInto, RefreshInto | Проверьте синхронизацию часов |
| `ErrTokenInvalidIssuer` | Validate, Refresh, ValidateInto, RefreshInto, Revoke, IsRevoked | Издатель не совпадает |
| `ErrTokenInvalidAudience` | Validate, Refresh, ValidateInto, RefreshInto, Revoke, IsRevoked | Аудитория не совпадает |
| `ErrTokenRevoked` | Validate, Refresh, ValidateInto, RefreshInto | Токен отозван, отказать в доступе |
| `ErrInvalidClaims` | Create, CreateRefresh, Validate, Refresh, ValidateInto, RefreshInto | Бизнес-валидация не удалась |
| `ErrTokenMissingID` | Revoke, IsRevoked | В токене отсутствует jti |

### Ограничение скорости и чёрный список

| Ошибка | Методы | Рекомендации по обработке |
|--------|--------|--------------------------|
| `ErrRateLimitExceeded` | Create, CreateRefresh, Refresh, RefreshInto | Вернуть 429 |
| `ErrBlacklistNotConfigured` | Revoke | Настройте чёрный список |

### Жизненный цикл

| Ошибка | Методы | Рекомендации по обработке |
|--------|--------|--------------------------|
| `ErrProcessorClosed` | Все методы | Создайте Processor заново |
| `ErrStoreClosed` | Revoke и другие | Хранилище закрыто |

## Тип ошибки

### ValidationError

Возвращается при неудачной валидации на уровне поля, содержит конкретное поле и информацию об ошибке:

```go
type ValidationError struct {
    Field   string  // Имя поля с ошибкой
    Message string  // Описание ошибки
    Err     error   // Внутренняя ошибка
}
```

## Цепочка обёртки ошибок

Ошибки CyberGo JWT делятся на сигнальные (сопоставимы через `errors.Is`) и обёрнутые (требуют `errors.As` для извлечения структурированной информации). Понимание цепочки обёртки помогает точно локализовать причину сбоя.

### ValidationError и errors.As

При неудачной валидации на уровне поля (превышение длины, обнаружение инъекций и т.п.) возвращается `*ValidationError` с конкретным именем поля и описанием ошибки. Сквозь сколько угодно слоёв обёртки `errors.As` пробивается:

```go
token, err := processor.Create(claims)
if err != nil {
    var ve *jwt.ValidationError
    if errors.As(err, &ve) {
        fmt.Printf("Поле: %s, Причина: %s\n", ve.Field, ve.Message)
        // Поле: user_id, Причина: suspicious pattern detected
        return
    }
    // Не полевая ошибка — идём по ветке errors.Is
}
```

### ErrInvalidClaims оборачивает Claims.Validate()

`Claims.Validate()` (или `Validate()` пользовательских Claims) возвращает **дескриптивную ошибку** (например, `errors.New("user_id is required")`), а не сигнальную. Processor оборачивает её в `ErrInvalidClaims`:

```
invalid claims: user_id is required
└── ErrInvalidClaims (сигнальная, внешний слой)
    └── user_id is required (дескриптивная, внутренний слой)
```

Поэтому сопоставление двухуровневое:

```go
if errors.Is(err, jwt.ErrInvalidClaims) {
    // Это категория «ошибка валидации Claims»
    fmt.Println("Подробности:", err) // invalid claims: user_id is required
}
```

### Ошибки разбора ParseUnverified

Ошибки разбора, возвращаемые [`ParseUnverified`](../api-reference/processor#parseunverified) при malformed токене (сбой декодирования base64, сбой разбора JSON и т.п.), являются **обёрнутыми ошибками**, а не сигнальными:

```go
err := processor.ParseUnverified(malformedToken, &claims)
if err != nil {
    // ❌ Невозможно сопоставить конкретную причину через errors.Is
    // ✅ Можно лишь констатировать факт «сбой разбора»
    fmt.Println("Сбой разбора:", err) // failed to parse token: ...
}
```

Единственные две сигнальные ошибки `ParseUnverified` — `ErrProcessorClosed` (Processor закрыт) и `ErrEmptyToken` (передана пустая строка); остальные ошибки формата невозможно точно сопоставить через `errors.Is`.

::: tip Когда использовать errors.Is vs errors.As
- **`errors.Is`**: сопоставление сигнальных ошибок (`ErrTokenExpired`, `ErrInvalidClaims` и т.д.) для определения «к какой категории отказов относится ошибка».
- **`errors.As`**: извлечение структурированных ошибок (`*ValidationError`) для получения «какое именно поле и в чём ошиблось».
- Оба можно комбинировать: сначала `errors.Is` для категории, затем `errors.As` для деталей.
:::

## Сопоставление с HTTP-статусами

В RESTful API отображение ошибок JWT на соответствующие HTTP-статусы — лучшая практика, позволяющая клиенту различать «проблемы с учётными данными» (401), «проблемы формата запроса» (400) и «серверные проблемы» (500).

### Таблица сопоставления

| Ошибка JWT | HTTP-статус | Действие клиента |
|------------|-------------|------------------|
| `ErrEmptyToken` | 401 Unauthorized | Предоставьте токен аутентификации |
| `ErrInvalidToken` | 401 Unauthorized | Повторный вход |
| `ErrAlgorithmMismatch` | 401 Unauthorized | Источник токена недоверенный, повторный вход |
| `ErrTokenExpired` | 401 Unauthorized | Обменять refresh-токен на новый |
| `ErrTokenRevoked` | 401 Unauthorized | Токен отозван, повторный вход |
| `ErrTokenInvalidIssuer` | 401 Unauthorized | Издатель токена не совпадает |
| `ErrTokenInvalidAudience` | 401 Unauthorized | Аудитория токена не совпадает |
| `ErrTokenNotValidYet` | 401 Unauthorized | Проверьте синхронизацию часов клиента |
| `ErrTokenTypeMismatch` | 401 Unauthorized | Используйте правильный refresh-токен |
| `ErrExpirationRequired` | 401 Unauthorized | В токене отсутствует утверждение истечения |
| `ErrInvalidClaims` | 400 Bad Request | Исправьте содержимое Claims (сценарий создания) |
| `ErrRateLimitExceeded` | 429 Too Many Requests | Снизьте частоту запросов, повторите позже |
| `ErrProcessorClosed` | 500 Internal Server Error | Серверу нужно перезапустить Processor |

::: tip Лучшие практики RESTful
- **401 Unauthorized**: все проблемы действительности токена (истёк, отозван, ошибка подписи, несоответствие издателя/аудитории). Клиент должен направить пользователя на повторную аутентификацию или обновление токена.
- **400 Bad Request**: ошибка валидации Claims при создании токена — это программная ошибка вызывающего, а не сбой аутентификации.
- **429 Too Many Requests**: возвращать при срабатывании ограничения скорости, прилагая заголовок `Retry-After` с указанием времени ожидания.
- **500 Internal Server Error**: `ErrProcessorClosed` — серверная аномалия состояния, которую не следует раскрывать клиенту.
:::

## Обработка ошибок в веб-сервисе

Следующий обработчик покрывает все распространённые ошибки, которые может вернуть `Validate`, и возвращает соответствующие ответы согласно [сопоставлению HTTP-статусов](#сопоставление-с-http-статусами):

<!-- check-code: skip -->
```go
package main

import (
    "encoding/json"
    "errors"
    "net/http"

    "github.com/cybergodev/jwt"
)

// authError отображает ошибку JWT в HTTP-статус и сообщение
func authError(w http.ResponseWriter, err error) {
    w.Header().Set("Content-Type", "application/json")

    switch {
    // Токен истёк — направляем клиента на обновление
    case errors.Is(err, jwt.ErrTokenExpired):
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "token_expired",
            "message": "Срок действия токена истёк, пожалуйста, обновите",
        })

    // Токен отозван
    case errors.Is(err, jwt.ErrTokenRevoked):
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "token_revoked",
            "message": "Токен был отозван",
        })

    // Издатель не совпадает
    case errors.Is(err, jwt.ErrTokenInvalidIssuer):
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "invalid_issuer",
            "message": "Издатель не совпадает",
        })

    // Аудитория не совпадает
    case errors.Is(err, jwt.ErrTokenInvalidAudience):
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "invalid_audience",
            "message": "Аудитория не совпадает",
        })

    // Ещё не действителен — рассинхронизация часов
    case errors.Is(err, jwt.ErrTokenNotValidYet):
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "token_not_valid_yet",
            "message": "Токен ещё не действителен",
        })

    // Алгоритм не совпадает
    case errors.Is(err, jwt.ErrAlgorithmMismatch):
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "algorithm_mismatch",
            "message": "Алгоритм подписи не совпадает",
        })

    // Недействительный токен (ошибка подписи, формата, пустой токен)
    case errors.Is(err, jwt.ErrInvalidToken),
        errors.Is(err, jwt.ErrEmptyToken),
        errors.Is(err, jwt.ErrExpirationRequired):
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "invalid_token",
            "message": "Недействительный токен",
        })

    // Ошибка валидации Claims — пытаемся извлечь детали уровня поля
    case errors.Is(err, jwt.ErrInvalidClaims):
        var ve *jwt.ValidationError
        if errors.As(err, &ve) {
            w.WriteHeader(http.StatusBadRequest)
            json.NewEncoder(w).Encode(map[string]string{
                "error":   "validation_failed",
                "field":   ve.Field,
                "message": ve.Message,
            })
        } else {
            w.WriteHeader(http.StatusBadRequest)
            json.NewEncoder(w).Encode(map[string]string{
                "error":   "validation_failed",
                "message": "Ошибка валидации утверждений",
            })
        }

    // Ограничение скорости
    case errors.Is(err, jwt.ErrRateLimitExceeded):
        w.Header().Set("Retry-After", "60")
        w.WriteHeader(http.StatusTooManyRequests)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "rate_limited",
            "message": "Слишком частые запросы, повторите позже",
        })

    // Системная ошибка — Processor закрыт
    case errors.Is(err, jwt.ErrProcessorClosed):
        w.WriteHeader(http.StatusInternalServerError)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "internal_error",
            "message": "Сервис временно недоступен",
        })

    // Запасной вариант
    default:
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "auth_failed",
            "message": "Ошибка аутентификации",
        })
    }
}

func handleProtected(w http.ResponseWriter, r *http.Request) {
    tokenString := extractToken(r)
    claims, valid, err := processor.Validate(tokenString)
    if err != nil {
        authError(w, err)
        return
    }
    if !valid {
        authError(w, jwt.ErrInvalidToken)
        return
    }
    // Аутентификация пройдена, обработка запроса
    _ = claims
}
```

::: tip Повторное использование authError
`authError` — функция отображения ошибок, не зависящая от конкретного маршрута и пригодная для повторного использования всеми обработчиками, требующими аутентификации. Её можно вызывать и при обработке `ErrTokenTypeMismatch` в [эндпоинте обновления](../examples/web-server#_5-эндпоинт-обновления-refresh).
:::

## Дальнейшие шаги

- [Справочник API → Ошибки](../api-reference/errors) — полный список ошибок
- [Справочник API → Типы](../api-reference/types#validationerror) — определение типа ошибки
