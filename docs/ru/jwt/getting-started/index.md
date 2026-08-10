---
sidebar_label: "Быстрый старт"
title: "Быстрый старт - CyberGo JWT | Введение за 5 минут"
description: "Руководство по быстрому старту CyberGo JWT: установка, создание Processor, выпуск, проверка, обновление и отзыв токенов, навигация по дополнительным возможностям."
sidebar_position: 2
---

# Быстрый старт

## Установка

```bash
go get github.com/cybergodev/jwt
```

Требуется Go 1.25+.

## Базовое использование

### 1. Создание Processor

```go
package main

import (
    "fmt"
    "time"

    "github.com/cybergodev/jwt"
)

func main() {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!" // HMAC минимум 32 байта
    cfg.AccessTokenTTL = 15 * time.Minute
    cfg.RefreshTokenTTL = 7 * 24 * time.Hour

    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close() // Безопасная очистка ключей
}
```

### 2. Выпуск токена

```go
claims := &jwt.Claims{
    UserID:   "user123",
    Username: "alice",
    Role:     "admin",
    Permissions: []string{"read", "write"},
}

// Токен доступа (краткосрочный)
accessToken, err := processor.Create(claims)
if err != nil {
    panic(err)
}

// Токен обновления (долгосрочный)
refreshToken, err := processor.CreateRefresh(claims)
if err != nil {
    panic(err)
}
```

### 3. Проверка токена

```go
parsed, valid, err := processor.Validate(accessToken)
if err != nil {
    // Обработка ошибок: истёк срок, недействительная подпись и т.д.
    panic(err)
}
if valid {
    fmt.Println("UserID:", parsed.UserID)
    fmt.Println("Role:", parsed.Role)
    fmt.Println("ExpiresAt:", parsed.ExpiresAt.Time)
}
```

### 4. Обновление токена

```go
newAccessToken, err := processor.Refresh(refreshToken)
if err != nil {
    panic(err)
}
fmt.Println("New Access Token:", newAccessToken)
```

### 5. Отзыв токена

```go
// Добавление токена в чёрный список
err := processor.Revoke(accessToken)
if err != nil {
    panic(err)
}

// Проверка отзыва
revoked, err := processor.IsRevoked(accessToken)
if err != nil {
    panic(err)
}
fmt.Println("Revoked:", revoked) // true
```

## Дополнительные возможности

Описанные выше шаги охватывают основной жизненный цикл токена. CyberGo JWT также предоставляет следующие возможности — перейдите в соответствующее руководство для подробного описания:

| Возможность | Описание | Руководство |
|-------------|----------|-------------|
| Алгоритмы подписи | HMAC, RSA, RSA-PSS, ECDSA — 12 алгоритмов в 4 семействах | [Алгоритмы подписи](../guides/signing-algorithms) |
| Пользовательские Claims | Определение бизнес-полей через интерфейс `CustomClaims` | [Пользовательские Claims](../guides/custom-claims) |
| Обновление и ротация токенов | Двухуровневый TTL, стратегии повторного использования и одноразовой ротации | [Обновление и ротация токенов](../guides/token-refresh) |
| Чёрный список токенов | Отзыв, встроенное хранилище в памяти, пользовательские бэкенды Redis | [Чёрный список токенов](../guides/blacklist) |
| Ограничение скорости | Алгоритм token bucket для защиты конечных точек выпуска | [Ограничение скорости](../guides/rate-limiting) |
| Подробная конфигурация | Проверка издателя/аудитории, допуск часов, обязательный срок, проверка ввода | [Подробная конфигурация](../guides/configuration) |
| Обработка ошибок | 19 категорий ошибок-сигналов и сопоставление `errors.Is` | [Обработка ошибок](../guides/error-handling) |
| Тестирование и внедрение часов | `FixedClock` для детерминированного управления временем без sleep | [Тестирование и внедрение часов](../guides/testing) |

## Дальнейшие шаги

- [Алгоритмы подписи](../guides/signing-algorithms) — выбор алгоритма и настройка ключей
- [Обновление и ротация токенов](../guides/token-refresh) — двухуровневые токены и стратегии ротации
- [Подробная конфигурация](../guides/configuration) — настройки безопасности и проверка ввода
- [Справочник API](../api-reference/) — полная документация API
- [Базовые примеры](../examples/basic) — готовые к запуску примеры
- [Интеграция с веб-сервером](../examples/web-server) — Middleware аутентификации и RBAC на практике
