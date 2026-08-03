---
sidebar_label: "Ограничение скорости"
title: "Лимит запросов - CyberGo JWT | Корзина токенов"
description: "Руководство по ограничению скорости: настройка корзины токенов для максимального числа запросов к интерфейсу выпуска за окно, приоритет ключей Subject, UserID и RateLimitKeyer, встроенные и пользовательские распределённые реализации."
sidebar_position: 40
---

# Ограничение скорости

Ограничение скорости используется для предотвращения злоупотребления интерфейсом выпуска токенов (например, перебора).

## Принцип работы

Используется алгоритм корзины токенов, ограничивающий максимальное количество запросов для каждого ключа в указанном временном окне.

```text
Create(claims) → извлечение ключа ограничения → проверка RateLimitProvider → разрешить/отклонить
```

### Подробное описание алгоритма корзины токенов

Встроенный [`RateLimiter`](../api-reference/types#ratelimiter) использует алгоритм корзины токенов (token bucket), а не простой счётчик фиксированного окна. Каждому ключу ограничения соответствует независимая корзина, в которой хранятся оставшееся количество токенов `tokens` и время последнего пополнения `lastRefill`.

**Пропорциональное пополнение токенов**: при каждом запросе количество токенов к пополнению рассчитывается пропорционально времени, прошедшему с момента последнего пополнения:

```text
tokensToAdd = (maxRate × elapsed) / window
```

где `elapsed` — количество наносекунд с момента последнего пополнения, `window` — окно ограничения. После пополнения количество токенов не превышает `maxRate` (верхний предел), что гарантирует непревышение настроенной скорости.

**Сохранение остаточного времени**: после пополнения токенов `lastRefill` не сбрасывается на текущее время, а сдвигается только на «потреблённое» время, соответствующее добавленным токенам:

```text
consumedNano = (tokensToAdd × window) / maxRate
lastRefill += consumedNano
```

Этот механизм предотвращает неравномерное пополнение токенов — если бы `lastRefill` каждый раз сбрасывался на `now`, неучтённое остаточное время терялось бы, что привело бы к завышению фактической скорости пополнения.

:::tip Корзина токенов vs фиксированное окно
Счётчик фиксированного окна на границе окна может внезапно пропустить `maxRate` запросов (например, 100 в 59-й секунде и ещё 100 в 1-й секунде — мгновенно 200). Корзина токенов пополняет токены пропорционально и непрерывно, обеспечивая более плавную кривую трафика и лучше подходя для ограничения скорости API.
:::

## Конфигурация

```go
cfg := jwt.DefaultConfig()
cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
cfg.EnableRateLimit = true
cfg.RateLimitRate = 100              // Максимальное количество запросов в окне
cfg.RateLimitWindow = time.Minute    // Временное окно
```

| Поле | По умолчанию | Описание |
|------|--------------|----------|
| `EnableRateLimit` | `false` | Включить ограничение скорости |
| `RateLimitRate` | `100` | Максимальное количество запросов в окне |
| `RateLimitWindow` | `1m` | Временное окно |

:::tip Примечание
Ограничение скорости действует на все методы выпуска токенов: `Create()`, `CreateRefresh()`, `Refresh()`, `RefreshInto()`. Не влияет на `Validate()` и `ValidateInto()`.
:::

## Ключ ограничения

Ограничение скорости изолировано по ключам. Приоритет поиска ключа:

1. `RegisteredClaims.Subject` — если не пустой
2. `*Claims.UserID` — только для встроенных Claims
3. `RateLimitKey()` — если реализован интерфейс `RateLimitKeyer`
4. Пустая строка — проверка ограничения пропускается

### Пользовательский ключ ограничения

```go
type MyClaims struct {
    UserID string `json:"user_id"`
    Email  string `json:"email"`
    jwt.RegisteredClaims
}

// Реализация интерфейса RateLimitKeyer
func (c *MyClaims) RateLimitKey() string {
    return c.Email
}
```

## Пакетная проверка AllowN

[`Allow`](../api-reference/types#ratelimiter) проверяет один запрос, а метод расширения конкретного типа [`*RateLimiter`](../api-reference/types#ratelimiter) `AllowN` позволяет за один вызов определить, доступны ли `n` запросов:

```go
func (rl *RateLimiter) AllowN(key string, n int) bool
```

Поведение `AllowN`:

| Условие | Возвращаемое значение |
|---------|----------------------|
| `n < 0` | `false` |
| `n == 0` | `true` |
| `n > maxRate` | `false` (одна партия не может превысить лимит окна) |
| `key == ""` | `false` |
| Токенов в корзине ≥ `n` | `true` (потребляет `n` токенов) |
| Токенов в корзине < `n` | `false` |

Сценарии применения: когда одна операция требует нескольких квот (пакетный выпуск, взвешенный биллинг), один вызов `AllowN` заменяет несколько `Allow`, сокращая конкуренцию за блокировку и обеспечивая атомарность.

```go
package main

import (
    "fmt"
    "time"

    "github.com/cybergodev/jwt"
)

func main() {
    limiter := jwt.NewRateLimiter(100, time.Minute)
    defer limiter.Close()

    // Единовременный запрос 10 квот (например, пакетный выпуск 10 токенов)
    if limiter.AllowN("user:123", 10) {
        fmt.Println("Пакетная операция разрешена") // Вывод: Пакетная операция разрешена
    }

    // Осталось 90 токенов, запрос 95 — отказ
    fmt.Println(limiter.AllowN("user:123", 95)) // Вывод: false
}
```

## Встроенный RateLimiter

Используйте `NewRateLimiter` для создания независимого ограничителя:

```go
limiter := jwt.NewRateLimiter(100, time.Minute)

if limiter.Allow("user:123") {
    // Разрешено
} else {
    // Отклонено
}

limiter.Reset("user:123") // Сброс счётчика
defer limiter.Close()
```

### Ёмкость и вытеснение

Встроенный `RateLimiter` отслеживает до 10000 различных ключей ограничения (`maxBuckets = 10000`), предотвращая исчерпание памяти злоумышленником, генерирующим огромное количество ключей. При достижении лимита применяется следующая стратегия вытеснения:

1. **Вытеснение по истечению**: сначала очищаются корзины, у которых `lastRefill` старше 2-х окон (считаются неактивными).
2. **Пакетное вытеснение 10% самых старых**: если всё ещё заполнен, сканируются все корзины и вытесняются около 10% (минимум 1) самых старых по `lastRefill`, освобождая место для новых ключей.

:::tip Почему пакетное вытеснение
Вытеснение по одной корзине требует полного сканирования при каждой вставке (O(n)), тогда как разовое вытеснение около 10% означает, что следующие ~1000 вставок не требуют сканирования. Это снижает амортизированную стоимость единичного вытеснения при заполненной ёмкости с O(n) примерно до O(n/1000), значительно сокращая время удержания блокировки.
:::

## Пользовательский ограничитель

Реализуйте интерфейс [`RateLimitProvider`](../api-reference/interfaces#ratelimitprovider):

```go
type RateLimitProvider interface {
    Allow(key string) bool
    Reset(key string)
    Close()
}
```

:::tip Об AllowN
Сам интерфейс определяет только единичную проверку `Allow`. Метод пакетной проверки `AllowN(key string, n int) bool` — метод расширения конкретного типа [`*RateLimiter`](../api-reference/types#ratelimiter), не входящий в этот интерфейс.
:::

Например, подключение к Redis для распределённого ограничения:

```go
cfg.RateLimiter = &RedisRateLimiter{client: rdb}
```

### Пример распределённого ограничителя на Redis

Встроенный `RateLimiter` работает в пределах процесса; при развёртывании нескольких экземпляров каждый экземпляр считает независимо и не может делиться данными. Ниже приведён распределённый ограничитель на базе Redis, использующий схему фиксированного окна с атомарным счётом INCR, подходящую для сценариев с несколькими экземплярами:

<!-- check-code: skip -->
```go
package main

import (
    "context"
    "fmt"
    "time"

    "github.com/cybergodev/jwt"
    "github.com/redis/go-redis/v9"
)

// RedisRateLimiter — распределённый ограничитель на базе Redis (фиксированное окно + атомарный счёт INCR).
type RedisRateLimiter struct {
    client *redis.Client
    rate   int
    window time.Duration
}

func NewRedisRateLimiter(client *redis.Client, rate int, window time.Duration) *RedisRateLimiter {
    return &RedisRateLimiter{client: client, rate: rate, window: window}
}

// Allow использует атомарный инкремент Redis INCR; при первом инкременте устанавливает время истечения как окно.
func (r *RedisRateLimiter) Allow(key string) bool {
    ctx := context.Background()
    fullKey := "ratelimit:" + key

    count, err := r.client.Incr(ctx, fullKey).Result()
    if err != nil {
        return false // При сбое Redis отказываем, защищая бэкенд
    }
    if count == 1 {
        // Первый запрос, устанавливаем истечение окна
        r.client.Expire(ctx, fullKey, r.window)
    }
    return count <= int64(r.rate)
}

// Reset сбрасывает счётчик указанного ключа.
func (r *RedisRateLimiter) Reset(key string) {
    r.client.Del(context.Background(), "ratelimit:"+key)
}

// Close освобождает ресурсы (Redis-соединение управляется вызывающим, здесь пустая реализация).
func (r *RedisRateLimiter) Close() {}

func main() {
    rdb := redis.NewClient(&redis.Options{Addr: "localhost:6379"})

    limiter := NewRedisRateLimiter(rdb, 100, time.Minute)
    if limiter.Allow("user:123") {
        fmt.Println("Разрешено") // Вывод: Разрешено
    }

    // Внедрение в конфигурацию JWT, замена встроенного ограничителя в процессе
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    cfg.EnableRateLimit = true
    cfg.RateLimiter = limiter

    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()
    fmt.Println("Processor успешно создан") // Вывод: Processor успешно создан
}
```

:::warning Предупреждение
Этот пример использует алгоритм фиксированного окна (Redis INCR + EXPIRE), поведение которого немного отличается от алгоритма корзины токенов встроенного `RateLimiter`: фиксированное окно может давать всплески на границе, но достаточно практично для распределённых сценариев. Для строгой семантики корзины токенов можно реализовать логику пополнения через Lua-скрипт.
:::

## Превышение ограничения

При превышении порога ограничения методы выпуска токенов (`Create()`, `CreateRefresh()`, `Refresh()`, `RefreshInto()`) возвращают `ErrRateLimitExceeded`:

```go
token, err := processor.Create(claims)
if errors.Is(err, jwt.ErrRateLimitExceeded) {
    // Обработка ограничения: возврат 429 Too Many Requests
}
```

## Дальнейшие шаги

- [Справочник API → RateLimitProvider](../api-reference/interfaces#ratelimitprovider) — определение интерфейса
- [Справочник API → RateLimiter](../api-reference/types#ratelimiter) — встроенная реализация
- [Базовые примеры](../examples/basic) — пример ограничения скорости
