---
sidebar_label: "Тестирование и внедрение часов"
title: "Тестирование - CyberGo JWT | Фиксированные часы и воспроизводимые тесты"
description: "Руководство по тестированию и внедрению часов: через ClockProvider внедряется FixedClock для точного контроля времени в модульных тестах, проверка истечения, обновления, разбора пользовательских Claims и отзыва с воспроизводимыми независимыми результатами."
sidebar_position: 60
---

# Тестирование и внедрение часов

Через интерфейс `ClockProvider` можно внедрить пользовательские часы для точного контроля времени в тестах.

## Интерфейс ClockProvider

```go
type ClockProvider interface {
    Now() time.Time
}
```

Библиотека предоставляет две реализации:

| Тип | Описание |
|-----|----------|
| `SystemClock` | По умолчанию, использует системное время |
| `FixedClock` | Фиксированное время для тестирования |

## FixedClock

`FixedClock` всегда возвращает время, указанное при конструировании:

```go
fixedTime := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

cfg := jwt.DefaultConfig()
cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
cfg.Clock = jwt.FixedClock{T: fixedTime}
```

## Тестирование истечения токена

```go
func TestTokenExpiry(t *testing.T) {
    // Установка фиксированного времени
    now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    cfg.AccessTokenTTL = 15 * time.Minute
    cfg.Clock = jwt.FixedClock{T: now}

    processor, err := jwt.New(cfg)
    require.NoError(t, err)
    defer processor.Close()

    // Выпуск токена в момент now
    claims := &jwt.Claims{UserID: "user123"}
    token, err := processor.Create(claims)
    require.NoError(t, err)

    // Проверка в текущий момент → успех
    _, valid, err := processor.Validate(token)
    require.NoError(t, err)
    assert.True(t, valid)

    // Имитация прошествия времени после истечения → используем новый Processor
    expiredCfg := cfg
    expiredCfg.Clock = jwt.FixedClock{T: now.Add(16 * time.Minute)}
    expiredProcessor, err := jwt.New(expiredCfg)
    require.NoError(t, err)
    defer expiredProcessor.Close()

    _, _, err = expiredProcessor.Validate(token)
    assert.True(t, errors.Is(err, jwt.ErrTokenExpired))
}
```

## Тестирование допуска часов (ClockSkew)

[`ClockSkew`](./configuration#допуск-часов-clockskew) предоставляет окно допустимости для проверки `exp` (истечение) и `nbf` (не ранее). Задав допуск, можно проверить, принимается ли токен в течение короткого времени после строгого момента истечения:

```go
func TestClockSkew(t *testing.T) {
    now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

    // Выпуск токена: exp = now + 1h
    issueCfg := jwt.DefaultConfig()
    issueCfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    issueCfg.AccessTokenTTL = time.Hour
    issueCfg.Clock = jwt.FixedClock{T: now}

    issueProc, err := jwt.New(issueCfg)
    require.NoError(t, err)
    defer issueProc.Close()

    token, err := issueProc.Create(&jwt.Claims{UserID: "user123"})
    require.NoError(t, err)

    const skew = 30 * time.Second

    // exp + 10s всё ещё в 30s окне допуска → действителен
    withinCfg := jwt.DefaultConfig()
    withinCfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    withinCfg.ClockSkew = skew
    withinCfg.Clock = jwt.FixedClock{T: now.Add(time.Hour + 10*time.Second)}
    withinProc, err := jwt.New(withinCfg)
    require.NoError(t, err)
    defer withinProc.Close()

    _, valid, err := withinProc.Validate(token)
    require.NoError(t, err)
    assert.True(t, valid)

    // exp + 40s выходит за 30s окно допуска → истёк
    beyondCfg := jwt.DefaultConfig()
    beyondCfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    beyondCfg.ClockSkew = skew
    beyondCfg.Clock = jwt.FixedClock{T: now.Add(time.Hour + 40*time.Second)}
    beyondProc, err := jwt.New(beyondCfg)
    require.NoError(t, err)
    defer beyondProc.Close()

    _, _, err = beyondProc.Validate(token)
    assert.True(t, errors.Is(err, jwt.ErrTokenExpired))
}
```

::: tip FixedClock и ограничение скорости
При включённом ограничении скорости часы встроенного [`RateLimiter`](../api-reference/types#ratelimiter) наследуются от `Config.Clock` — при использовании `FixedClock` ограничитель также использует фиксированное время и не пополняет токены с течением реального времени. Это делает тесты ограничения скорости полностью предсказуемыми. См. [Тестирование ограничения скорости](#тестирование-ограничения-скорости).
:::

## Тестирование потока обновления

```go
func TestRefreshFlow(t *testing.T) {
    now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    cfg.Clock = jwt.FixedClock{T: now}

    processor, err := jwt.New(cfg)
    require.NoError(t, err)
    defer processor.Close()

    claims := &jwt.Claims{UserID: "user123"}
    refreshToken, err := processor.CreateRefresh(claims)
    require.NoError(t, err)

    // Получение нового токена доступа через токен обновления
    newToken, err := processor.Refresh(refreshToken)
    require.NoError(t, err)
    assert.NotEmpty(t, newToken)
}
```

## Тестирование пользовательских Claims

```go
func TestCustomClaims(t *testing.T) {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"

    processor, err := jwt.New(cfg)
    require.NoError(t, err)
    defer processor.Close()

    claims := &MyClaims{
        UserID: "user123",
        Email:  "test@example.com",
    }

    token, err := processor.Create(claims)
    require.NoError(t, err)

    result := &MyClaims{}
    parsed, valid, err := processor.ValidateInto(token, result)
    require.NoError(t, err)
    assert.True(t, valid)

    myResult := parsed.(*MyClaims)
    assert.Equal(t, "user123", myResult.UserID)
    assert.Equal(t, "test@example.com", myResult.Email)
}
```

## Тестирование валидации ввода

Поля [`Claims`](../api-reference/claims) при `Create` проходят многоуровневую валидацию. Тесты могут проверять, вызывают ли сверхдлинные строки, инъекционные шаблоны и управляющие символы [`ValidationError`](../api-reference/types#validationerror), и извлекать информацию уровня поля через `errors.As`:

```go
func TestInputValidation(t *testing.T) {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"

    processor, err := jwt.New(cfg)
    require.NoError(t, err)
    defer processor.Close()

    var ve *jwt.ValidationError

    // Сверхдлинная строка вызывает ограничение длины (максимум 256 символов)
    _, err = processor.Create(&jwt.Claims{
        UserID: strings.Repeat("a", 300),
    })
    require.ErrorAs(t, err, &ve)
    assert.Equal(t, "UserID", ve.Field)
    assert.Contains(t, ve.Message, "maximum length")

    // Обнаружение XSS-инъекции
    _, err = processor.Create(&jwt.Claims{
        UserID: "<script>alert(1)</script>",
    })
    require.ErrorAs(t, err, &ve)
    assert.Equal(t, "UserID", ve.Field)
    assert.Equal(t, "suspicious pattern detected", ve.Message)

    // Фильтрация управляющих символов (null-байт отклоняется)
    _, err = processor.Create(&jwt.Claims{
        UserID: "user\x00inject",
    })
    require.ErrorAs(t, err, &ve)
    assert.Equal(t, "UserID", ve.Field)
    assert.Equal(t, "invalid control character", ve.Message)
}
```

::: warning Уровни обёртки ValidationError
В пути `Create` `ValidationError` оборачивается в `ErrInvalidClaims`. Использование `errors.As(err, &ve)` пробивается сквозь обёртку и извлекает `ValidationError`, позволяя читать `Field` и `Message` для утверждений. Полное описание правил валидации см. в [Подробная конфигурация → Проверка ввода и усиление безопасности](./configuration#проверка-ввода-и-усиление-безопасности).
:::

## Тестирование обработки ошибок

```go
func TestRevokeToken(t *testing.T) {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"

    processor, err := jwt.New(cfg)
    require.NoError(t, err)
    defer processor.Close()

    claims := &jwt.Claims{UserID: "user123"}
    token, err := processor.Create(claims)
    require.NoError(t, err)

    // Отзыв токена
    err = processor.Revoke(token)
    require.NoError(t, err)

    // Проверка должна завершиться ошибкой
    _, _, err = processor.Validate(token)
    assert.True(t, errors.Is(err, jwt.ErrTokenRevoked))
}
```

## Тестирование ограничения скорости

После включения ограничения скорости `Create` сверх квоты возвращает [`ErrRateLimitExceeded`](../api-reference/errors#сигнальные-ошибки). В сочетании с `FixedClock` можно точно контролировать отсутствие пополнения корзины токенов, делая тест полностью предсказуемым:

```go
func TestRateLimit(t *testing.T) {
    now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    cfg.EnableRateLimit = true
    cfg.RateLimitRate = 3               // 3 раза за окно
    cfg.RateLimitWindow = time.Minute
    cfg.Clock = jwt.FixedClock{T: now}  // Фиксированное время → корзина токенов не пополняется

    processor, err := jwt.New(cfg)
    require.NoError(t, err)
    defer processor.Close()

    // Один и тот же UserID делит квоту скорости (при пустом Subject откат к UserID)
    claims := &jwt.Claims{UserID: "user123"}

    // Первые 3 создания успешны
    for i := 0; i < 3; i++ {
        _, err := processor.Create(claims)
        require.NoError(t, err, "Создание %d должно быть успешным", i+1)
    }

    // 4-е превышает квоту
    _, err = processor.Create(claims)
    assert.True(t, errors.Is(err, jwt.ErrRateLimitExceeded))
}
```

::: tip Ключ ограничения скорости
Ограничение скорости рассчитывается по утверждению `Subject`; при пустом `Subject` откат к `UserID`. В тестах использование одного и того же `UserID` гарантирует, что все запросы делят квоту. Подробнее см. [Ограничение скорости](./rate-limiting).
:::

## Тестирование потокобезопасности

Все методы `Processor` goroutine-безопасны. Используйте `sync.WaitGroup` для параллельного выполнения `Create`/`Validate`, проверяя отсутствие panic и data race:

```go
func TestConcurrentSafety(t *testing.T) {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"

    processor, err := jwt.New(cfg)
    require.NoError(t, err)
    defer processor.Close()

    const goroutines = 50
    const opsPerGoroutine = 20

    var wg sync.WaitGroup
    var success atomic.Int64
    wg.Add(goroutines)

    for i := 0; i < goroutines; i++ {
        go func(id int) {
            defer wg.Done()
            for j := 0; j < opsPerGoroutine; j++ {
                claims := &jwt.Claims{
                    UserID: fmt.Sprintf("user-%d-%d", id, j),
                }
                token, err := processor.Create(claims)
                if err != nil {
                    continue
                }
                if _, valid, err := processor.Validate(token); err == nil && valid {
                    success.Add(1)
                }
            }
        }(i)
    }
    wg.Wait()

    assert.Equal(t, int64(goroutines*opsPerGoroutine), success.Load(),
        "Параллельные создание и проверка должны быть полностью успешными")
}
```

::: warning Обнаружение гонок
Запускайте `go test -race ./...` для включения детектора гонок Go, который может выявить скрытые data race в параллельных тестах. Это стандартный способ проверки потокобезопасности `Processor`; тестовые наборы production-кода всегда должны проходить под `-race`.
:::

## Лучшие практики

### Рекомендации по табличным тестам

| Сценарий | Рекомендуемый подход | Ключевые утверждения |
|----------|----------------------|----------------------|
| Истечение токена | `FixedClock` фиксирует время выпуска, новый Processor имитирует истечение | `errors.Is(err, ErrTokenExpired)` |
| Допуск часов | Задать `ClockSkew`, проверить границу окна | В пределах exp + skew действителен / вне — истёк |
| Поток обновления | Сразу `Refresh` после создания refresh-токена | Возвращённый токен непустой |
| Пользовательские Claims | `ValidateInto` десериализует в целевой тип | Значения полей совпадают |
| Валидация ввода | Сверхдлинные строки / инъекции / управляющие символы | `errors.As` извлекает `ValidationError` |
| Ограничение скорости | Малое окно + низкая скорость + фиксированные часы | Превышение возвращает `ErrRateLimitExceeded` |
| Потокобезопасность | `goroutine` + `WaitGroup` для параллельных операций | Без panic, без data race |
| Отзыв токена | `Revoke` затем `Validate` | `errors.Is(err, ErrTokenRevoked)` |

:::tip Основные принципы
- Используйте `FixedClock` для обеспечения **воспроизводимости** тестов — без зависимости от системного времени
- Создавайте **независимый Processor** для каждого теста во избежание утечки состояния
- Используйте `t.Cleanup()` или `defer` для гарантии вызова `Close()`
- При проверке ошибок используйте `errors.Is()` / `errors.As()` вместо сопоставления строк
- Параллельные тесты всегда запускайте с `go test -race`
:::

## Дальнейшие шаги

- [Справочник API → ClockProvider](../api-reference/interfaces#clockprovider) — интерфейс часов
- [Справочник API → FixedClock](../api-reference/types#fixedclock) — часы с фиксированным временем
- [Продвинутые примеры](../examples/advanced) — пример внедрения часов
