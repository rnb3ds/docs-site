---
sidebar_label: "Обновление и ротация токенов"
title: "Обновление и ротация токенов - CyberGo JWT | Стратегия access и refresh токенов"
description: "Руководство по обновлению и ротации токенов: двухуровневый TTL access/refresh токенов, поток CreateRefresh и Refresh, пользовательские Claims с RefreshInto, стратегии повторного использования и одноразовой ротации, безопасность без автоотзыва при Refresh."
sidebar_position: 25
check_code: false
---

# Обновление и ротация токенов

CyberGo JWT использует двухуровневую модель токенов: краткосрочные **access-токены** для аутентификации в API и долгосрочные **refresh-токены** для получения новых access-токенов после их истечения. Этот подход балансирует безопасность и удобство для пользователя.

## Двухуровневая модель токенов

| Тип токена | Метод выпуска | TTL по умолчанию | Назначение |
|-----------|---------------|------------------|-----------|
| Access-токен | [`Create`](../api-reference/processor#create) | 15 минут | Аутентификация в API, частая проверка |
| Refresh-токен | [`CreateRefresh`](../api-reference/processor#createrefresh) | 7 дней | Обмен на новые access-токены, редкое использование |

Тип токена отмечается через утверждение `token_type` (`access` / `refresh`). Метод [`Refresh`](../api-reference/processor#refresh) отклоняет access-токены, предотвращая их использование для получения новых токенов.

### Настройка TTL

```go
cfg := jwt.DefaultConfig()
cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
cfg.AccessTokenTTL = 15 * time.Minute    // Время жизни access-токена
cfg.RefreshTokenTTL = 7 * 24 * time.Hour // Время жизни refresh-токена (должно быть > AccessTokenTTL)
```

::: tip Ограничение
`Config.Validate()` требует `RefreshTokenTTL > AccessTokenTTL`, иначе возвращается `ErrInvalidConfig`.
:::

## Базовый поток обновления

### 1. Выпуск пары токенов

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

    claims := &jwt.Claims{UserID: "user123", Username: "alice"}

    // Access-токен (краткосрочный)
    accessToken, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }

    // Refresh-токен (долгосрочный)
    refreshToken, err := processor.CreateRefresh(claims)
    if err != nil {
        panic(err)
    }

    fmt.Println("Access Token:", accessToken)
    fmt.Println("Refresh Token:", refreshToken)
}
```

### 2. Обновление для получения нового access-токена

После истечения access-токена используйте refresh-токен для получения нового:

```go
// refreshToken был ранее выпущен через CreateRefresh
newAccessToken, err := processor.Refresh(refreshToken)
if err != nil {
    switch {
    case errors.Is(err, jwt.ErrTokenExpired):
        // Refresh-токен истёк, требуется повторная аутентификация
    case errors.Is(err, jwt.ErrTokenRevoked):
        // Refresh-токен был отозван
    case errors.Is(err, jwt.ErrTokenTypeMismatch):
        // Передан access-токен вместо refresh-токена
    default:
        // Другая ошибка
    }
    return
}
fmt.Println("New Access Token:", newAccessToken)
```

`Refresh` полностью проверяет refresh-токен: подпись, срок действия, издателя, аудиторию и статус в чёрном списке.

## Обновление с пользовательскими Claims

При использовании пользовательских типов Claims применяйте [`RefreshInto`](../api-reference/processor#refreshinto) для заполнения результата в пользовательскую структуру:

```go
type MyClaims struct {
    UserID string `json:"user_id"`
    Role   string `json:"role"`
    jwt.RegisteredClaims
}

func (c *MyClaims) GetRegisteredClaims() *jwt.RegisteredClaims {
    return &c.RegisteredClaims
}

func (c *MyClaims) Validate() error {
    if c.UserID == "" {
        return errors.New("user_id is required")
    }
    return nil
}
```

```go
// Выпуск refresh-токена с пользовательскими Claims
refreshToken, err := processor.CreateRefresh(&MyClaims{UserID: "123", Role: "admin"})

// Обновление в пользовательскую структуру
result := &MyClaims{}
newToken, err := processor.RefreshInto(refreshToken, result)
```

## Стратегии ротации

### Режим повторного использования (по умолчанию)

По умолчанию `Refresh` **не** отзывает исходный refresh-токен. Исходный токен остаётся действительным до истечения или явного отзыва и может использоваться многократно:

```go
// Первое обновление
token1, err := processor.Refresh(refreshToken)
if err != nil {
    panic(err)
}

// Тот же refreshToken всё ещё действителен и может использоваться снова
token2, err := processor.Refresh(refreshToken)
if err != nil {
    panic(err)
}
```

**Сценарии применения**: Мобильные приложения, вход с одного устройства. Пользователю не нужна частая повторная аутентификация; refresh-токен можно использовать повторно в течение TTL.

### Одноразовая ротация

Для сценариев с повышенными требованиями к безопасности отзывайте старый refresh-токен сразу после каждого обновления:

```go
// Обновление и немедленный отзыв старого токена
newAccessToken, err := processor.Refresh(refreshToken)
if err != nil {
    panic(err)
}

// Отзыв старого refresh-токена для предотвращения повторного использования
if err := processor.Revoke(refreshToken); err != nil {
    panic(err)
}
```

**Сценарии применения**: Веб-приложения, системы с высокими требованиями к безопасности. Старый токен аннулируется сразу после каждого обновления, снижая риск утечки.

### Сравнение стратегий

| Критерий | Повторное использование | Одноразовая ротация |
|----------|------------------------|---------------------|
| Безопасность | Ниже (утёкшие токени можно использовать повторно) | Выше (утёкший токен одноразовый) |
| Удобство для пользователя | Лучше (без частой повторной аутентификации) | Среднее (при сбое обновления требуется повторный вход) |
| Сложность реализации | Без дополнительного кода | Требуется вызов `Revoke` |
| Нагрузка на чёрный список | Низкая | Выше (каждое обновление добавляет запись) |

::: warning Обнаружение утечки refresh-токена
В режиме одноразовой ротации, если злоумышленник использует отозванный refresh-токен, `Refresh` вернёт `ErrTokenRevoked`. Приложение может использовать это для обнаружения утечки и принудительной повторной аутентификации.
:::

## Типобезопасность

CyberGo JWT различает типы токенов через утверждение `token_type`. `Refresh` и `RefreshInto` отклоняют access-токены:

```go
// Попытка обновления с access-токеном отклоняется
_, err := processor.Refresh(accessToken)
// err оборачивает ErrTokenTypeMismatch: expected refresh token, got access token
```

Это предотвращает использование access-токенов для получения новых токенов, обеспечивая типовую изоляцию в двухуровневой модели.

Токены без утверждения `token_type` (выпущенные старыми версиями) принимаются для обратной совместимости.

## Замечания по безопасности

- **Refresh не отзывает автоматически**: Исходный refresh-токен остаётся действительным после `Refresh`. Для одноразовой ротации вызывайте `Revoke` вручную.
- **Claims не проходят глубокую проверку**: `Refresh` проверяет стандартные JWT-поля (подпись, срок, издатель, аудитория, чёрный список) и базовую структуру (UserID или Username должен быть заполнен), но не перепроверяет ограничения длины полей и инъекционные шаблоны, доверяя проверке при создании.
- **Согласованность подписи**: Новые access-токены используют тот же алгоритм подписи и ключ, что и refresh-токен. Межалгоритмическое обновление не поддерживается.

## Дальнейшие шаги

- [Чёрный список токенов](./blacklist) — Механизм отзыва и пользовательские хранилища
- [Обработка ошибок](./error-handling) — Все категории ошибок-сигналов и обработка
- [Подробная конфигурация](./configuration) — Настройка TTL, издателя, аудитории и допуска часов
- [Processor API](../api-reference/processor) — Полные сигнатуры `Refresh`, `RefreshInto`, `CreateRefresh`
