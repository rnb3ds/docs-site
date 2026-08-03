---
sidebar_label: "Базовые примеры"
title: "Базовые примеры - CyberGo JWT | HMAC и отзыв"
description: "Сборник базовых примеров: выпуск и проверка токенов HMAC, ротация через refresh-токен, отзыв через встроенный чёрный список, ограничение скорости корзины токенов и изоляция аудитории — все примеры полностью компилируются и запускаются независимо."
sidebar_position: 10
---

# Базовые примеры

## Подпись HMAC

Самый распространённый способ — использование симметричного ключа для подписи и проверки.

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
    cfg.AccessTokenTTL = 15 * time.Minute
    cfg.RefreshTokenTTL = 7 * 24 * time.Hour

    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    // Выпуск
    claims := &jwt.Claims{
        UserID:      "user123",
        Username:    "alice",
        Role:        "admin",
        Permissions: []string{"read", "write", "delete"},
    }
    token, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }
    fmt.Println("Access Token:", token)

    // Проверка
    parsed, valid, err := processor.Validate(token)
    if err != nil {
        panic(err)
    }
    fmt.Println("Valid:", valid)          // Вывод: true
    fmt.Println("UserID:", parsed.UserID) // Вывод: user123
}
```

## Токен доступа и токен обновления

```go
package main

import (
    "fmt"

    "github.com/cybergodev/jwt"
)

func main() {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    claims := &jwt.Claims{
        UserID:   "user123",
        Username: "alice",
    }

    // Создание токена доступа (краткосрочный)
    accessToken, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }

    // Создание токена обновления (долгосрочный)
    refreshToken, err := processor.CreateRefresh(claims)
    if err != nil {
        panic(err)
    }

    fmt.Println("Access Token:", accessToken)
    fmt.Println("Refresh Token:", refreshToken)

    // Использование токена обновления для получения нового токена доступа
    newAccessToken, err := processor.Refresh(refreshToken)
    if err != nil {
        panic(err)
    }
    fmt.Println("New Access Token:", newAccessToken)
}
```

## Отзыв токена (чёрный список)

```go
package main

import (
    "fmt"

    "github.com/cybergodev/jwt"
)

func main() {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    claims := &jwt.Claims{UserID: "user123", Username: "alice"}
    token, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }

    // Отзыв токена
    err = processor.Revoke(token)
    if err != nil {
        panic(err)
    }
    fmt.Println("Token revoked")

    // Повторная проверка завершится ошибкой
    _, _, err = processor.Validate(token)
    fmt.Println("Validate error:", err) // token revoked

    // Проверка отзыва
    revoked, err := processor.IsRevoked(token)
    if err != nil {
        panic(err)
    }
    fmt.Println("Is revoked:", revoked) // Вывод: true
}
```

## Ограничение скорости

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
    cfg.EnableRateLimit = true
    cfg.RateLimitRate = 5              // Максимум 5 запросов в минуту
    cfg.RateLimitWindow = time.Minute

    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    claims := &jwt.Claims{UserID: "user123", Username: "alice"}

    // Нормальные запросы
    for i := 0; i < 5; i++ {
        _, err := processor.Create(claims)
        if err != nil {
            fmt.Printf("Request %d: %v\n", i+1, err)
        } else {
            fmt.Printf("Request %d: success\n", i+1)
        }
    }

    // 6-й запрос будет отклонён
    _, err = processor.Create(claims)
    fmt.Println("Request 6:", err) // rate limit exceeded
}
```

## Изоляция аудитории

После установки `ExpectedAudience` проверку проходят только токены, утверждение `aud` которых содержит это значение. Это реализует межсервисную изоляцию токенов в микросервисной архитектуре — токены, выпущенные одним сервисом, не могут быть приняты другим.

```go
package main

import (
    "errors"
    "fmt"

    "github.com/cybergodev/jwt"
)

func main() {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    cfg.ExpectedAudience = "billing-api" // Принимаем только токены для billing-api

    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    // Токен с совпадающей аудиторией
    validClaims := &jwt.Claims{
        UserID: "user1",
        RegisteredClaims: jwt.RegisteredClaims{
            Audience: jwt.StringOrSlice{"billing-api"},
        },
    }
    validToken, err := processor.Create(validClaims)
    if err != nil {
        panic(err)
    }

    _, valid, err := processor.Validate(validToken)
    if err != nil {
        panic(err)
    }
    fmt.Println("Matching audience valid:", valid) // Вывод: true

    // Токен с неверной аудиторией отклоняется
    wrongClaims := &jwt.Claims{
        UserID: "user2",
        RegisteredClaims: jwt.RegisteredClaims{
            Audience: jwt.StringOrSlice{"admin-api"},
        },
    }
    wrongToken, err := processor.Create(wrongClaims)
    if err != nil {
        panic(err)
    }

    _, valid, err = processor.Validate(wrongToken)
    fmt.Println("Wrong audience valid:", valid) // Вывод: false
    fmt.Println("Wrong audience error:", err)   // Вывод: token invalid audience
    fmt.Println("Is audience error:",
        errors.Is(err, jwt.ErrTokenInvalidAudience)) // Вывод: true
}
```

::: tip Сценарий микросервисов
В микросервисной архитектуре задавайте разные `ExpectedAudience` для разных сервисов (например, `billing-api`, `user-api`), чтобы каждый сервис принимал только адресованные ему токены и предотвращал межсервисное злоупотребление.
:::

## Расширенные поля Extra

Встроенное `Claims.Extra` — это `map[string]any` для хранения небольшого объёма необязательной дополнительной информации. Processor при создании токена выполняет над Extra глубокую валидацию (длина, обнаружение инъекций), что экономит усилия по сравнению с пользовательскими полями Claims.

```go
package main

import (
    "fmt"

    "github.com/cybergodev/jwt"
)

func main() {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    // Хранение дополнительных бизнес-полей в Extra (поддерживаются только значения string и []string)
    claims := &jwt.Claims{
        UserID:   "user123",
        Username: "alice",
        Role:     "engineer",
        Extra: map[string]any{
            "team_id": "team-backend",
            "level":   "senior",
            "tags":    []string{"onboarding", "mentor"},
        },
    }
    token, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }

    // Чтение полей Extra после проверки
    parsed, valid, err := processor.Validate(token)
    if err != nil {
        panic(err)
    }
    fmt.Println("Valid:", valid)            // Вывод: true
    fmt.Println("UserID:", parsed.UserID)   // Вывод: user123

    // Чтение значений Extra через приведение типа
    if teamID, ok := parsed.Extra["team_id"].(string); ok {
        fmt.Println("TeamID:", teamID) // Вывод: team-backend
    }
    if level, ok := parsed.Extra["level"].(string); ok {
        fmt.Println("Level:", level) // Вывод: senior
    }
    if tags, ok := parsed.Extra["tags"].([]string); ok {
        fmt.Println("Tags:", tags) // Вывод: [onboarding mentor]
    }
}
```

::: warning Ограничения Extra
`Extra` допускает не более 50 ключей, значения только типов `string` и `[]string`, вложенные map не поддерживаются. Если нужны более сложные структуры или пользовательская валидация, используйте [пользовательский тип Claims](../guides/custom-claims#поле-extra-vs-пользовательский-тип).
:::

## Дополнительные примеры

- [Интеграция с веб-сервером](./web-server) — промежуточное ПО аутентификации, RBAC, обновление, выход, плавное завершение
- [Продвинутые примеры](./advanced) — RSA, ECDSA, пользовательские Claims, Redis-чёрный список, внедрение часов
