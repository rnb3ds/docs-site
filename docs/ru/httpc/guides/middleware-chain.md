---
sidebar_label: "Цепочки промежуточного ПО"
title: "Цепочки промежуточного ПО - CyberGo HTTPC | Луковая модель"
description: "Цепочки промежуточного ПО HTTPC: луковая модель и порядок выполнения, семь встроенных middleware, Chain, свой MiddlewareFunc и короткое замыкание."
sidebar_position: 9
---

# Цепочки промежуточного ПО

## Луковая модель

Промежуточное ПО HTTPC построено по луковой модели: запрос проходит снаружи внутрь, ответ — изнутри наружу:

```text
Запрос → Recovery → Logging → RequestID → Handler
                                                 ↓
Ответ   ← Recovery ← Logging ← RequestID ← Response
```

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.RecoveryMiddleware(),                                      // Самый внешний слой: восстановление после panic
    httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: log.Printf}), // Второй слой: логирование
    httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),          // Самый внутренний слой: Request ID
}

client, err := httpc.New(cfg)
if err != nil {
    log.Fatal(err)
}
defer client.Close()
```

Два ключевых типа (оба — экспортируемые алиасы):

```go
// Handler обрабатывает один HTTP-запрос и возвращает ответ — конец цепочки это движок
type Handler func(ctx context.Context, req RequestMutator) (ResponseMutator, error)

// MiddlewareFunc оборачивает один Handler в новый Handler
type MiddlewareFunc func(Handler) Handler
```

`RequestMutator` / `ResponseMutator` предоставляют все методы чтения и записи запроса и ответа — они доступны промежуточному ПО на обеих фазах.

### Полный порядок выполнения

Отдалимся от деталей: полный конвейер, через который проходит один запрос, выглядит так:

```text
client.Get(url, opts...)
   │
   ├─ 1. Применение опций запроса (WithHeader/WithJSON/WithQuery/…)
   │
   ├─ 2. Цепочка middleware · фаза запроса (снаружи → внутрь)
   │       Recovery → Logging → RequestID → ……
   │
   ├─ 3. Терминальный обработчик: передаёт изменённые middleware поля запроса движку
   │
   ├─ 4. Внутри движка: проверки безопасности → цикл повторов (экспоненциальный откат) → отправка транспортным уровнем
   │
   └─ 5. Цепочка middleware · фаза ответа (изнутри → наружу)
           …… ← RequestID ← Logging ← Recovery
```

Ключевые выводы:

- **Опции запроса выполняются раньше middleware**: middleware видит запрос с уже применёнными опциями и может переопределить любое установленное ими поле (заголовки, параметры запроса, таймауты, стратегию перенаправлений и т. д.)
- **Опции не выполняются второй раз**: терминальный обработчик копирует изменённые middleware поля запроса в совершенно новый запрос движка и отправляет его, а не прогоняет опции заново
- Клиентские значения по умолчанию `Defaults.Headers` / `Defaults.UserAgent` и др. применяются движком при построении итогового запроса по правилу «заполнять только если не задано», поэтому одноимённые заголовки, установленные middleware, имеют приоритет

### Взаимосвязь middleware и повторов

Цепочка middleware оборачивает **весь цикл повторов**: сколько бы попыток ни было у одного логического запроса, middleware выполняется один раз и видит ответ последней попытки — общее число попыток отражает `Meta.Attempts`.

Когда нужны зацепки с гранулярностью на отдельную попытку, используйте [колбэки `WithOnRequest`/`WithOnResponse`](./request-response#обратные-вызовы): они срабатывают внутри движка на каждую попытку (включая повторы).

### Распространение ошибок и короткое замыкание

- Если любое middleware возвращает ошибку, цепочка немедленно прерывается: более внутренние middleware не выполняются, ошибка возвращается вызывающему как есть
- Если middleware **не вызывает `next()`** и возвращает ответ (или ошибку) напрямую — это «короткое замыкание»: фаза ответа внешних middleware всё равно выполнится (например, defer в Recovery), а внутренние слои и движок не выполнятся вовсе; так реализуются попадание в кэш, разомкнутый размыкатель и подобные сценарии
- При одновременном возврате `(resp, err)` клиент подчищает ответ, предотвращая утечку пула объектов; но если выбросить ответ, полученный из `next()`, и вернуть `(nil, err)`, возникнет утечка — не выбрасывайте ответ (см. предупреждение ниже, в разделе о своём middleware)
- У panic две линии обороны: `RecoveryMiddleware` восстанавливает panic внутри цепочки; сам метод `Request` дополнительно имеет recover по умолчанию, превращающий ускользнувший panic в ошибку вместо падения процесса

## Встроенное middleware

### RecoveryMiddleware

Восстановление после panic, защищает от падения процесса:

```go
httpc.RecoveryMiddleware()
```

Значение panic превращается в ошибку со стеком вызовов. Обычно ставится в **самый внешний слой** цепочки, защищая все последующие слои.

### LoggingMiddleware

Логирование запросов/ответов с автоматической санитизацией URL:

```go
httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: func(format string, args ...any) {
    log.Printf("[HTTP] "+format, args...)
}})
// Пример вывода: [HTTP] GET https://api.example.com/data -> 200 (150ms) (код состояния и длительность — фактические измерения, не фиксированные значения)
```

При передаче `nil`-конфигурации или nil `LogFunc` логирование отключено (middleware превращается в прозрачную передачу). Учётные данные в URL (`user:pass@host`) стираются до записи в лог.

### RequestIDMiddleware

Добавляет каждому запросу уникальный ID, генерируемый через `crypto/rand`:

```go
httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()) // по умолчанию 32 hex-символа

// Кастомный генератор
httpc.RequestIDMiddleware(&httpc.RequestIDConfig{
    HeaderName: "X-Request-ID",
    Generator:  func() string {
        return uuid.New().String()
    },
})
```

Если в запросе уже есть одноимённый заголовок (например, проставлен вышестоящим шлюзом), middleware **не перезаписывает** существующее значение — это удобно для сквозной трассировки.

### TimeoutMiddleware

Таймаут на уровне middleware, принудительно срабатывающий раньше клиентского таймаута:

```go
httpc.TimeoutMiddleware(&httpc.TimeoutMiddlewareConfig{Duration: 30 * time.Second})
```

Таймаут наследуется от собственного context запроса (уже установленные дедлайны и сигналы отмены сохраняются); по истечении context отменяется и возвращается ошибка таймаута. `Duration`, равное 0 или отрицательному, отключает механизм (прозрачная передача).

:::warning Не используйте с Download или потоковыми запросами
`defer cancel()` внутри `TimeoutMiddleware` срабатывает сразу после возврата обработчика (то есть по получении заголовков ответа) — для `Download` или запросов с `WithStreamBody` контекст отменится до чтения тела ответа и проявится как ошибка «context canceled». В потоковых сценариях и при скачивании используйте опцию [`WithTimeout`](../api-reference/core/options#withtimeout).
:::

### HeaderMiddleware

Добавляет статические заголовки ко всем запросам:

```go
httpc.HeaderMiddleware(&httpc.HeaderConfig{Headers: map[string]string{
    "X-App-Version": "1.0.0",
    "X-Platform":    "server",
}})
```

Таблица заголовков проходит проверку на CRLF **в момент создания middleware** и копируется защитным образом — последующие изменения переданного map на middleware не влияют; при провале проверки middleware возвращает ошибку на каждый запрос. Существующие одноимённые заголовки перезаписываются.

### MetricsMiddleware

Сбор метрик запросов:

```go
httpc.MetricsMiddleware(&httpc.MetricsConfig{OnMetrics: func(method, url string, statusCode int, duration time.Duration, err error) {
    metrics.IncrCounter("http.requests", 1)
    metrics.RecordTimer("http.latency", duration)
    if err != nil {
        metrics.IncrCounter("http.errors", 1)
    }
}})
```

URL и сообщения об ошибках, передаваемые в колбэк, проходят санитизацию (учётные данные в URL стираются, исходный URL в сообщении об ошибке заменяется санитизированным) — чувствительные данные не попадут в системы метрик. При неудачном запросе `statusCode` равен 0.

### AuditMiddleware

Аудит безопасности для комплаенс-сценариев вроде финансов и медицины:

```go
auditCfg := httpc.DefaultAuditConfig()
auditCfg.OnAudit = func(event httpc.AuditEvent) {
    log.Printf("[AUDIT] %s %s -> %d (%v)",
        event.Method, event.URL, event.StatusCode, event.Duration)
}
httpc.AuditMiddleware(auditCfg)
```

При `OnAudit`, равном nil, middleware ничего не делает (чистая прозрачная передача).

### Настройка параметров аудита

Получите конфигурацию через `DefaultAuditConfig()` и измените нужные поля — так управляются формат вывода, запись заголовков и санитизация:

```go
auditCfg := httpc.DefaultAuditConfig()
auditCfg.Format = "json"
auditCfg.IncludeHeaders = true
auditCfg.MaskHeaders = []string{"Authorization", "Cookie"}
auditCfg.SanitizeError = true
auditCfg.OnAudit = func(event httpc.AuditEvent) {
    data, err := json.Marshal(event)
    if err != nil {
        log.Println("Не удалось сериализовать событие аудита:", err)
        return
    }
    log.Println(string(data))
}

httpc.AuditMiddleware(auditCfg)
```

`AuditEvent` несёт метку времени, метод, санитизированный URL, код состояния, длительность, число попыток, цепочку перенаправлений и другие поля; при `SanitizeError = true` ошибки единообразно заменяются на `[sanitized]`, чтобы детали не раскрывали чувствительную информацию. При JSON-сериализации `Duration` дополнительно выводится в поле `durationMs` (миллисекунды).

События аудита поддерживают извлечение SourceIP и UserID из контекста:

```go
ctx := context.WithValue(context.Background(), httpc.SourceIPKey, "192.168.1.1")
ctx = context.WithValue(ctx, httpc.UserIDKey, "user-123")
```

## Ручная композиция цепочки

Для комбинации middleware используйте функцию `Chain`:

```go
middleware := httpc.Chain(
    httpc.RecoveryMiddleware(),
    httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: log.Printf}),
    httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),
)

cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{middleware}
```

`Chain` оборачивает послойно от последнего middleware к первому, поэтому **порядок в срезе = порядок выполнения снаружи внутрь**: первый элемент — самый внешний (первым видит запрос, последним — ответ). `Chain` сворачивает несколько middleware в один `MiddlewareFunc` — удобно переиспользовать как библиотеку или собирать разные комбинации по необходимости.

## Своё middleware

```go
func CORSMiddleware(origin string) httpc.MiddlewareFunc {
    return func(next httpc.Handler) httpc.Handler {
        return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
            // Фаза запроса: изменение запроса
            req.SetHeader("Origin", origin)

            // Вызов следующего обработчика
            resp, err := next(ctx, req)

            // Фаза ответа: запись или изменение ответа
            if resp != nil {
                log.Printf("Код состояния ответа: %d", resp.StatusCode())
            }

            return resp, err
        }
    }
}
```

Полный запускаемый пример — middleware-таймер, фиксирующее длительность и код состояния:

```go
package main

import (
    "context"
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/httpc"
)

// timingMiddleware фиксирует метод, URL, код состояния и длительность каждого запроса
func timingMiddleware() httpc.MiddlewareFunc {
    return func(next httpc.Handler) httpc.Handler {
        return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
            start := time.Now()

            // Фаза запроса: можно читать/изменять запрос
            req.SetHeader("X-Client-Trace", "demo")

            // Вызов следующего слоя (в конце концов — движка)
            resp, err := next(ctx, req)

            // Фаза ответа: можно читать/изменять ответ
            status := 0
            if resp != nil {
                status = resp.StatusCode()
            }
            log.Printf("%s %s -> %d (%v)", req.Method(), req.URL(), status, time.Since(start))

            return resp, err
        }
    }
}

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
        httpc.RecoveryMiddleware(),
        timingMiddleware(),
    }

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://httpbin.org/get")
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(result.StatusCode()) // 200
}
```

:::warning Не выбрасывайте ответ из next()
Получив от `next()` ненулевой ответ, либо возвращайте его как есть, либо продолжите вызовы внутрь и верните ответ внутреннего слоя. Выброс ответа с возвратом `(nil, err)` приведёт к утечке пула объектов движка; если вернуть одновременно `(resp, err)`, клиент подчищет ответ, но приоритет всегда у передачи как есть.
:::

:::warning Состояние middleware и конкурентность
Один экземпляр middleware собирается при создании клиента и разделяется **всеми конкурентными запросами**. Изменяемое состояние в замыкании (счётчики, пороги размыкателя и т. п.) обязательно защищайте мьютексом, как в примере размыкателя ниже; middleware без состояния в этом не нуждается.
:::

### Middleware с коротким замыканием

```go
func CircuitBreakerMiddleware(threshold int) httpc.MiddlewareFunc {
    var failures int
    var mu sync.Mutex

    return func(next httpc.Handler) httpc.Handler {
        return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
            mu.Lock()
            if failures >= threshold {
                mu.Unlock()
                return nil, fmt.Errorf("circuit breaker open")
            }
            mu.Unlock()

            resp, err := next(ctx, req)
            if err != nil {
                mu.Lock()
                failures++
                mu.Unlock()
            }
            return resp, err
        }
    }
}
```

При коротком замыкании с возвратом `(nil, err)` **`next()` не вызывался вовсе**, поэтому middleware не держит ответ, требующий освобождения, — утечки не возникает. Можно также замкнуть накоротко, вернув собственноручно созданный ответ (сценарий попадания в кэш) — достаточно реализовать интерфейс `ResponseMutator` и вернуть его, ответ движка будет корректно заменён.

## Конфигурация middleware

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.RecoveryMiddleware(),
    httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: log.Printf}),
}
cfg.Defaults.UserAgent = "my-app/1.0"
cfg.Defaults.Headers = map[string]string{"X-App": "my-app"}
cfg.Defaults.FollowRedirects = true
cfg.Defaults.MaxRedirects = 10

client, err := httpc.New(cfg)
if err != nil {
    log.Fatal(err)
}
defer client.Close()
```

Различайте два вида «значений по умолчанию»: `Middleware.Middlewares` — перехватывающий конвейер; `Defaults.*` — статические значения, заполняемые движком при построении запроса (действуют, только если запрос их не задал; приоритет ниже, чем у опций и middleware).

## Что дальше

- [Встроенное middleware](../api-reference/client-config/middleware) - полный справочник middleware
- [Повторные попытки и отказоустойчивость](./retry-fault-tolerance) - руководство по стратегиям повторов
- [Обзор безопасности](../security/) - безопасные практики аудита middleware
