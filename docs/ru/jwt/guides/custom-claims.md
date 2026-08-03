---
sidebar_label: "Пользовательские Claims"
title: "Custom Claims - CyberGo JWT | Бизнес-утверждения"
description: "Руководство по пользовательским Claims: реализация интерфейса CustomClaims для бизнес-полей, сравнение встроенных Claims и пользовательских типов по валидации, примеры ValidateInto и RefreshInto с разбором."
sidebar_position: 20
---

# Пользовательские Claims

Встроенная структура [`Claims`](../api-reference/claims#claims) покрывает типичные сценарии, но бизнес-системам часто требуются дополнительные поля. Через реализацию интерфейса `CustomClaims` можно определить собственную структуру Claims.

## Интерфейс CustomClaims

```go
type CustomClaims interface {
    GetRegisteredClaims() *RegisteredClaims
    Validate() error
}
```

Необходимо реализовать только два метода:

| Метод | Описание |
|-------|----------|
| `GetRegisteredClaims()` | Возвращает стандартные JWT-поля (iss, sub, aud и т.д.) |
| `Validate()` | Пользовательская логика валидации |

## Поле Extra vs пользовательский тип

Хранить бизнес-поля можно двумя способами: использовать встроенное поле [`Claims.Extra`](../api-reference/claims#claims) или определить пользовательский тип Claims. У каждого подхода свои компромиссы.

### Сравнение

| Аспект | `Claims.Extra` | Пользовательский тип Claims |
|-------|----------------|------------------------------|
| Типобезопасность | Нет, значения `any`, требуется приведение типа | Да, проверка типов на этапе компиляции |
| Автодополнение IDE | Нет, ключи map без подсказок | Да, автодополнение полей |
| Пользовательская валидация | Нет, только встроенная глубокая проверка | Да, свободная реализация в `Validate()` |
| Глубокая валидация | Да, длина/инъекции/управляющие символы | Нет, только очистка зарегистрированных утверждений |
| Вложенные структуры | Нет, вложенные map не поддерживаются | Да, произвольные структуры |
| Сценарий применения | Несколько необязательных дополнительных полей | Ключевые бизнес-поля, требуется пользовательская проверка |

### Ограничения поля Extra

Встроенное `Claims.Extra` — это `map[string]any`, над которым Processor при создании токена выполняет глубокую валидацию:

| Ограничение | Условие |
|-------------|---------|
| Максимальное число ключей | 50 |
| Разрешённые типы значений | Только `string` и `[]string` |
| Вложенные map | Отклоняются (возвращается `ValidationError`) |
| Длина строкового значения | ≤ 256 символов |
| Обнаружение инъекционных шаблонов | Как и для других строковых полей |

```go
// ✅ Допустимо — только значения string и []string
claims := &jwt.Claims{
    UserID: "user1",
    Extra: map[string]any{
        "team_id": "team-abc",            // string
        "tags":    []string{"vip", "qa"}, // []string
    },
}

// ❌ Недопустимо — вложенный map будет отклонён глубокой валидацией
claims = &jwt.Claims{
    Extra: map[string]any{
        "profile": map[string]any{"age": 30}, // ValidationError: nested maps not allowed
    },
}
```

::: tip Как выбрать
- **Небольшой, необязательный, плоский** набор дополнительной информации (например, `team_id`, `tags`) → используйте `Extra`, пользуясь встроенной глубокой валидацией без необходимости писать проверки.
- **Ключевые бизнес-поля** или при необходимости **перечислений/межполевых ограничений/типобезопасности** → определите пользовательский тип Claims и реализуйте бизнес-правила в `Validate()`. Обратите внимание: поля пользовательской структуры не проходят глубокую валидацию, необходимо самостоятельно дополнить проверки длины и инъекций (см. ниже [Влияние на безопасность и шаблон проверки](#влияние-на-безопасность-и-шаблон-проверки)).
:::

## Определение пользовательских Claims

```go
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
```

:::tip Ключевые моменты
- Необходимо встроить `jwt.RegisteredClaims`
- `GetRegisteredClaims()` должен возвращать указатель на встроенное поле
- `Validate()` вызывается как при создании, так и при проверке токена
:::

## Использование пользовательских Claims

### Создание токена

```go
claims := &MyClaims{
    UserID: "user123",
    Email:  "alice@example.com",
    Role:   "admin",
}
token, err := processor.Create(claims)
```

### Проверка в пользовательскую структуру

Используйте `ValidateInto` для разбора токена в пользовательскую структуру:

```go
myClaims := &MyClaims{}
result, valid, err := processor.ValidateInto(token, myClaims)
if err != nil {
    panic(err)
}
if valid {
    parsed := result.(*MyClaims)
    fmt.Println("UserID:", parsed.UserID)
    fmt.Println("Email:", parsed.Email)
}
```

### Обновление в пользовательскую структуру

Используйте `RefreshInto` для обновления токена с сохранением пользовательских полей:

```go
newToken, err := processor.RefreshInto(refreshToken, &MyClaims{})
if err != nil {
    panic(err)
}
```

:::warning Защита временных полей
`RefreshInto` автоматически восстанавливает временные поля Claims (`IssuedAt`, `ExpiresAt`, `ID`), даже в случае неудачной операции.
:::

## Пример сложной валидации

Настоящая ценность пользовательских Claims — в реализации бизнес-правил в `Validate()`. Следующий пример демонстрирует проверку обязательных полей, ограничение значений перечисления и межполевые ограничения:

```go
package main

import (
    "errors"
    "fmt"

    "github.com/cybergodev/jwt"
)

// AccountClaims несёт бизнес-утверждения об уровне аккаунта и квоте устройств
type AccountClaims struct {
    UserID    string   `json:"user_id"`
    Tier      string   `json:"tier"`       // free | pro | enterprise
    Region    string   `json:"region"`     // cn | us | eu
    DeviceIDs []string `json:"device_ids"`
    jwt.RegisteredClaims
}

// Максимальное число устройств для каждого уровня
var tierMaxDevices = map[string]int{
    "free":       2,
    "pro":        10,
    "enterprise": 100,
}

var allowedRegions = map[string]bool{"cn": true, "us": true, "eu": true}

func (c *AccountClaims) GetRegisteredClaims() *jwt.RegisteredClaims {
    return &c.RegisteredClaims
}

func (c *AccountClaims) Validate() error {
    // 1. Проверка обязательных полей
    if c.UserID == "" {
        return errors.New("user_id is required")
    }

    // 2. Проверка значений перечисления
    if _, ok := tierMaxDevices[c.Tier]; !ok {
        return fmt.Errorf("invalid tier %q: must be free, pro or enterprise", c.Tier)
    }
    if !allowedRegions[c.Region] {
        return fmt.Errorf("invalid region %q: must be cn, us or eu", c.Region)
    }

    // 3. Межполевое ограничение: число устройств не должно превышать квоту уровня
    if max := tierMaxDevices[c.Tier]; len(c.DeviceIDs) > max {
        return fmt.Errorf("tier %q allows at most %d devices, got %d",
            c.Tier, max, len(c.DeviceIDs))
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

    // Допустимый набор: уровень pro, 3 устройства (≤ 10)
    valid := &AccountClaims{
        UserID:    "user123",
        Tier:      "pro",
        Region:    "cn",
        DeviceIDs: []string{"dev-1", "dev-2", "dev-3"},
    }
    _, err = processor.Create(valid)
    if err != nil {
        panic(err)
    }
    fmt.Println("Token created successfully")

    // Недопустимый набор: уровень free с 5 устройствами (> 2) → Validate() отклоняет
    _, err = processor.Create(&AccountClaims{
        UserID:    "user456",
        Tier:      "free",
        Region:    "us",
        DeviceIDs: []string{"d1", "d2", "d3", "d4", "d5"},
    })
    fmt.Println("Over-quota error:", err)
    // Вывод: Over-quota error: invalid claims: tier "free" allows at most 2 devices, got 5
}
```

::: tip Обёртка ошибок
Дескриптивная ошибка, возвращаемая `Validate()`, оборачивается в `ErrInvalidClaims`. Вызывающая сторона может как использовать `errors.Is(err, jwt.ErrInvalidClaims)` для определения категории, так и напрямую читать строку ошибки для получения бизнес-подробностей. См. [Обработка ошибок](./error-handling#цепочка-обёртки-ошибок).
:::

## Различия в валидации

Встроенные `*Claims` и пользовательские типы проходят разные пути валидации:

| Проверка | `*Claims` | Пользовательский тип |
|----------|-----------|---------------------|
| Метод `Validate()` | ✅ | ✅ |
| Ограничение длины строк (256 символов) | ✅ | ❌ |
| Ограничение размера массивов (100 элементов) | ✅ | ❌ |
| Обнаружение инъекционных паттернов | ✅ | ❌ |
| Фильтрация управляющих символов | ✅ | ❌ |
| Ограничения полей `Extra` | ✅ | Неприменимо |
| Очистка строк зарегистрированных утверждений | ✅ | ✅ |

:::warning Влияние на безопасность
Бизнес-поля пользовательских Claims **не** проходят глубокую валидацию. Это означает: если злонамеренный ввод проходит проверку подписи и разбирается в пользовательскую структуру, опасное содержимое — теги `<script>`, SQL-фрагменты, сверхдлинные строки — будет сохранено в токене как есть; 46 шаблонов обнаружения инъекций, ограничение длины в 256 символов и фильтрация управляющих символов встроенного `*Claims` не применяются.

Пожалуйста, реализуйте все необходимые проверки в методе `Validate()`, иначе ваш токен может стать носителем XSS/SQL-инъекций.
:::

### Влияние на безопасность и шаблон проверки

Следующая вспомогательная функция воспроизводит базовую логику встроенной глубокой валидации (лимит длины, управляющие символы, инъекционные подстроки) и может напрямую вызываться в `Validate()` пользовательских Claims:

```go
package main

import (
    "errors"
    "fmt"
    "strings"
)

const maxClaimLength = 256

// dangerousSubstrings перечисляет высокорисковые подстроки, пересекающиеся со встроенным обнаружением; можно добавлять/удалять по бизнес-потребностям.
var dangerousSubstrings = []string{
    "<script", "javascript:", "onerror=", "onload=",
    "drop table", "union select", "../", "/etc/passwd",
}

// validateField проверяет длину, управляющие символы и распространённые инъекционные шаблоны пользовательского поля.
func validateField(name, value string) error {
    if len(value) > maxClaimLength {
        return fmt.Errorf("%s exceeds maximum length of %d", name, maxClaimLength)
    }
    for i := 0; i < len(value); i++ {
        c := value[i]
        if c < 32 && c != '\t' && c != '\n' && c != '\r' {
            return fmt.Errorf("%s contains invalid control character", name)
        }
    }
    lower := strings.ToLower(value)
    for _, pattern := range dangerousSubstrings {
        if strings.Contains(lower, pattern) {
            return fmt.Errorf("%s contains suspicious pattern", name)
        }
    }
    return nil
}

type MyClaims struct {
    UserID     string `json:"user_id"`
    Department string `json:"department"`
}

func (c *MyClaims) Validate() error {
    if c.UserID == "" {
        return errors.New("user_id is required")
    }
    // Пользовательские поля не пользуются встроенной глубокой валидацией — вручную дополняем проверку длины и инъекций
    if err := validateField("user_id", c.UserID); err != nil {
        return err
    }
    if err := validateField("department", c.Department); err != nil {
        return err
    }
    return nil
}

func main() {}
```

## Дополнительный интерфейс: RateLimitKeyer

Пользовательские Claims могут реализовать интерфейс `RateLimitKeyer` для предоставления ключа ограничения скорости:

```go
func (c *MyClaims) RateLimitKey() string {
    return c.Email // Использование Email в качестве ключа ограничения
}
```

Приоритет поиска ключа ограничения: `Subject` → `*Claims.UserID` → `RateLimitKey()`.

## Дальнейшие шаги

- [Справочник API → Определения интерфейсов](../api-reference/interfaces#customclaims) — полное определение CustomClaims
- [Справочник API → Processor](../api-reference/processor#validateinto) — методы ValidateInto / RefreshInto
- [Продвинутые примеры](../examples/advanced) — полный пример пользовательских Claims
