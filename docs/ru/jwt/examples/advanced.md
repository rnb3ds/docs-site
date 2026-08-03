---
sidebar_label: "Продвинутые примеры"
title: "Продвинутые примеры - CyberGo JWT | Асимметрия и хранилище"
description: "Сборник продвинутых примеров: асимметричная подпись RSA, RSA-PSS и ECDSA, межсервисная проверка с разделением ключей, загрузка ключей из PEM, пользовательские Claims CustomClaims, чёрный список на Redis, внедрение FixedClock и разбор непроверенных токенов."
sidebar_position: 20
---

# Продвинутые примеры

## Асимметричная подпись RSA

Использование RSA приватного ключа для подписи и публичного для проверки. Подходит для микросервисной архитектуры, где проверяющей стороне не нужен приватный ключ.

```go
package main

import (
    "crypto/rand"
    "crypto/rsa"
    "fmt"
    "log"

    "github.com/cybergodev/jwt"
)

func main() {
    // Генерация пары RSA-ключей (в реальном использовании загружайте из файла)
    privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
    if err != nil {
        log.Fatal(err)
    }

    cfg := jwt.DefaultConfig()
    cfg.SigningMethod = jwt.SigningMethodRS256
    cfg.SigningKey = privateKey
    cfg.VerificationKey = &privateKey.PublicKey // Необязательно, если не указано, используется SigningKey

    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    claims := &jwt.Claims{UserID: "user456", Username: "bob"}
    token, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }
    fmt.Println("RSA Token:", token)

    parsed, valid, err := processor.Validate(token)
    if err != nil {
        panic(err)
    }
    fmt.Println("Valid:", valid)
    fmt.Println("UserID:", parsed.UserID)
}
```

## Подпись RSA-PSS

RSA-PSS (современная замена RS256/384/512) использует заполнение вероятностной схемы подписи (PSS), безопаснее PKCS#1 v1.5. Ключи полностью идентичны RSA, дополнительная генерация не требуется.

```go
package main

import (
    "crypto/rand"
    "crypto/rsa"
    "fmt"
    "log"

    "github.com/cybergodev/jwt"
)

func main() {
    // Генерация пары RSA-ключей (RSA-PSS и RSA используют один тип ключей)
    privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
    if err != nil {
        log.Fatal(err)
    }

    cfg := jwt.DefaultConfig()
    cfg.SigningMethod = jwt.SigningMethodPS256
    cfg.SigningKey = privateKey
    cfg.VerificationKey = &privateKey.PublicKey

    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    claims := &jwt.Claims{UserID: "user_ps", Username: "diana"}
    token, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }
    fmt.Println("RSA-PSS Token:", token)

    parsed, valid, err := processor.Validate(token)
    if err != nil {
        panic(err)
    }
    fmt.Println("Valid:", valid) // Вывод: Valid: true
    fmt.Println("UserID:", parsed.UserID)
}
```

:::tip Рекомендуемая замена RSA
В новых проектах рекомендуется отдавать приоритет RSA-PSS (PS256/384/512). Заполнение PSS обеспечивает более сильную доказуемую безопасность, чем PKCS#1 v1.5, а ключи полностью совместимы с RSA.
:::

## Асимметричная подпись ECDSA

Использование ECDSA на эллиптических кривых — более короткие ключи и лучшая производительность.

```go
package main

import (
    "crypto/ecdsa"
    "crypto/elliptic"
    "crypto/rand"
    "fmt"
    "log"

    "github.com/cybergodev/jwt"
)

func main() {
    // Генерация пары ECDSA-ключей
    privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
    if err != nil {
        log.Fatal(err)
    }

    cfg := jwt.DefaultConfig()
    cfg.SigningMethod = jwt.SigningMethodES256
    cfg.SigningKey = privateKey

    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    claims := &jwt.Claims{UserID: "user789", Username: "charlie"}
    token, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }
    fmt.Println("ECDSA Token:", token)
}
```

## Режим разделения ключей

Имитация межсервисной проверки токенов в микросервисной архитектуре: сервис аутентификации держит приватный ключ и выпускает токены, API-сервис проверяет токен через публичный ключ.

```go
package main

import (
    "crypto/rand"
    "crypto/rsa"
    "fmt"
    "log"

    "github.com/cybergodev/jwt"
)

func main() {
    // Генерация пары RSA-ключей
    privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
    if err != nil {
        log.Fatal(err)
    }
    publicKey := &privateKey.PublicKey

    // --- Сервис аутентификации: держит приватный ключ, выпускает токены ---
    authCfg := jwt.DefaultConfig()
    authCfg.SigningMethod = jwt.SigningMethodRS256
    authCfg.SigningKey = privateKey
    authCfg.Issuer = "auth-service"

    authProcessor, err := jwt.New(authCfg)
    if err != nil {
        panic(err)
    }
    defer authProcessor.Close()

    claims := &jwt.Claims{UserID: "user_dist", Username: "charlie"}
    token, err := authProcessor.Create(claims)
    if err != nil {
        panic(err)
    }
    fmt.Println("Сервис аутентификации выпустил токен (приватный ключ)")

    // --- API-сервис: проверяет токен через публичный ключ ---
    apiCfg := jwt.DefaultConfig()
    apiCfg.SigningMethod = jwt.SigningMethodRS256
    apiCfg.SigningKey = privateKey     // Текущий API требует SigningKey непустым
    apiCfg.VerificationKey = publicKey // При проверке фактически используется этот публичный ключ
    apiCfg.Issuer = "auth-service"     // Должен совпадать с издателем

    apiProcessor, err := jwt.New(apiCfg)
    if err != nil {
        panic(err)
    }
    defer apiProcessor.Close()

    parsed, valid, err := apiProcessor.Validate(token)
    if err != nil {
        panic(err)
    }
    fmt.Println("API-сервис проверка пройдена (публичный ключ):", valid) // Вывод: API-сервис проверка пройдена (публичный ключ): true
    fmt.Println("UserID:", parsed.UserID)
}
```

:::warning SigningKey обязателен
Текущий API требует, чтобы `SigningKey` было непустым (принудительная проверка на этапе валидации), поэтому в конфигурации API-сервиса приватный ключ всё равно должен быть записан. Но после установки `VerificationKey` процесс проверки использует только публичный ключ. Processor, настроенный только на проверку, не должен вызывать `Create` / `CreateRefresh`.
:::

## Загрузка ключей из PEM-файла

В production асимметричные ключи обычно хранятся в PEM-файлах. Следующий пример показывает, как загрузить приватный ключ через `pem.Decode` + `x509.ParsePKCS8PrivateKey` и публичный через `x509.ParsePKIXPublicKey`.

<!-- check-code: skip -->
```go
package main

import (
    "crypto/rsa"
    "crypto/x509"
    "encoding/pem"
    "fmt"
    "os"

    "github.com/cybergodev/jwt"
)

func main() {
    // --- Загрузка приватного RSA-ключа ---
    keyData, err := os.ReadFile("private_key.pem")
    if err != nil {
        fmt.Println("Ошибка чтения приватного ключа:", err)
        return
    }

    block, _ := pem.Decode(keyData)
    if block == nil {
        fmt.Println("Ошибка декодирования PEM приватного ключа")
        return
    }

    parsedKey, err := x509.ParsePKCS8PrivateKey(block.Bytes)
    if err != nil {
        fmt.Println("Ошибка разбора приватного ключа:", err)
        return
    }
    privateKey, ok := parsedKey.(*rsa.PrivateKey)
    if !ok {
        fmt.Println("Тип ключа не RSA")
        return
    }

    // --- Загрузка публичного RSA-ключа ---
    pubData, err := os.ReadFile("public_key.pem")
    if err != nil {
        fmt.Println("Ошибка чтения публичного ключа:", err)
        return
    }

    pubBlock, _ := pem.Decode(pubData)
    if pubBlock == nil {
        fmt.Println("Ошибка декодирования PEM публичного ключа")
        return
    }

    parsedPub, err := x509.ParsePKIXPublicKey(pubBlock.Bytes)
    if err != nil {
        fmt.Println("Ошибка разбора публичного ключа:", err)
        return
    }
    publicKey, ok := parsedPub.(*rsa.PublicKey)
    if !ok {
        fmt.Println("Тип публичного ключа не RSA")
        return
    }

    // --- Настройка Processor ---
    cfg := jwt.DefaultConfig()
    cfg.SigningMethod = jwt.SigningMethodRS256
    cfg.SigningKey = privateKey
    cfg.VerificationKey = publicKey

    processor, err := jwt.New(cfg)
    if err != nil {
        fmt.Println("Ошибка инициализации:", err)
        return
    }
    defer processor.Close()
    fmt.Println("Ключи загружены из PEM-файла") // Вывод: Ключи загружены из PEM-файла
}
```

:::tip Формат ключей
- Заголовок PEM приватного ключа — `-----BEGIN PRIVATE KEY-----` (PKCS#8) или `-----BEGIN RSA PRIVATE KEY-----` (PKCS#1). PKCS#8 разбирается через `x509.ParsePKCS8PrivateKey`, PKCS#1 — через `x509.ParsePKCS1PrivateKey`.
- Заголовок PEM публичного ключа — `-----BEGIN PUBLIC KEY-----`, разбирается через `x509.ParsePKIXPublicKey`.
- `ParsePKCS8PrivateKey` / `ParsePKIXPublicKey` возвращают `any` и требуют приведения типа к `*rsa.PrivateKey` / `*rsa.PublicKey` (для ECDSA аналогично — к `*ecdsa.PrivateKey` / `*ecdsa.PublicKey`).
:::

## Пользовательские Claims

Определение собственной структуры Claims с бизнес-полями.

```go
package main

import (
    "errors"
    "fmt"

    "github.com/cybergodev/jwt"
)

// Пользовательская структура Claims
type MyClaims struct {
    UserID string `json:"user_id"`
    Email  string `json:"email"`
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
    if c.Email == "" {
        return errors.New("email is required")
    }
    return nil
}

func main() {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    claims := &MyClaims{
        UserID: "user123",
        Email:  "alice@example.com",
        Role:   "admin",
    }

    // Создание токена
    token, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }
    fmt.Println("Token:", token)

    // Проверка в пользовательские Claims
    myClaims := &MyClaims{}
    result, valid, err := processor.ValidateInto(token, myClaims)
    if err != nil {
        panic(err)
    }
    if valid {
        parsed := result.(*MyClaims)
        fmt.Println("UserID:", parsed.UserID) // Вывод: user123
        fmt.Println("Email:", parsed.Email)   // Вывод: alice@example.com
    }

    // Обновление в пользовательские Claims
    refreshToken, err := processor.CreateRefresh(claims)
    if err != nil {
        panic(err)
    }
    newToken, err := processor.RefreshInto(refreshToken, &MyClaims{})
    if err != nil {
        panic(err)
    }
    fmt.Println("New Token:", newToken)
}
```

## Пользовательский бэкенд чёрного списка (Redis)

```go
package main

import (
    "context"
    "fmt"
    "time"

    "github.com/cybergodev/jwt"
)

// RedisBlacklistStore реализует интерфейс BlacklistStore
// Примечание: при реальном использовании необходим Redis-клиент (например, github.com/redis/go-redis)
type RedisBlacklistStore struct {
    // client *redis.Client
}

func (s *RedisBlacklistStore) Add(tokenID string, expiresAt time.Time) error {
    ttl := time.Until(expiresAt)
    if ttl <= 0 {
        return nil
    }
    // return s.client.Set(context.Background(), "blacklist:"+tokenID, "1", ttl).Err()
    fmt.Printf("Redis ADD: %s, TTL: %v\n", tokenID, ttl)
    return nil
}

func (s *RedisBlacklistStore) Contains(tokenID string) (bool, error) {
    // return s.client.Exists(context.Background(), "blacklist:"+tokenID).Result()
    return false, nil
}

func (s *RedisBlacklistStore) Close() error {
    // return s.client.Close()
    return nil
}

func main() {
    _ = context.Background() // Сохраняем импорт context доступным (раскомментируйте Redis-вызовы при реальном использовании)

    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    cfg.Blacklist.Store = &RedisBlacklistStore{}

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

    err = processor.Revoke(token)
    if err != nil {
        panic(err)
    }
    fmt.Println("Token revoked via Redis backend")
}
```

## Внедрение часов (сценарий тестирования)

Использование `FixedClock` для контроля времени в тестах.

```go
package main

import (
    "fmt"
    "time"

    "github.com/cybergodev/jwt"
)

func main() {
    fixedTime := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    cfg.Clock = jwt.FixedClock{T: fixedTime}

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

    parsed, _, err := processor.Validate(token)
    if err != nil {
        panic(err)
    }
    fmt.Println("IssuedAt:", parsed.IssuedAt.Time)   // Вывод: 2026-01-01 00:00:00 +0000 UTC
    fmt.Println("ExpiresAt:", parsed.ExpiresAt.Time) // Вывод: 2026-01-01 00:15:00 +0000 UTC
}
```

## Разбор непроверенного токена

Извлечение информации из Claims без проверки подписи для отладки или логирования.

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

    // Разбор без проверки подписи
    parsed := &jwt.Claims{}
    err = processor.ParseUnverified(token, parsed)
    if err != nil {
        panic(err)
    }
    fmt.Println("UserID (unverified):", parsed.UserID)
}
```

## Дополнительные примеры

- [Интеграция с веб-сервером](./web-server) — промежуточное ПО аутентификации, RBAC, обновление, выход, плавное завершение
- [Базовые примеры](./basic) — HMAC, пары токенов, отзыв, rate limiting
