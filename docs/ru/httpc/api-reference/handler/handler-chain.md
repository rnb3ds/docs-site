---
sidebar_label: "Handler и цепочка middleware"
title: "Handler и middleware - CyberGo HTTPC | Конвейер обработки"
description: "Подробное описание архитектуры конвейера Handler HTTPC: как в двухслойном дизайне метод API Layer 1 собирает луковую цепочку MiddlewareFunc и выполняет Handler, принципы комбинатора Chain, механизм clientImpl.middlewareChain и примеры написания пользовательского middleware."
sidebar_position: 1
---

# Handler и цепочка middleware

## Двухслойная архитектура

Обработка запросов в HTTPC — сотрудничество двух слоёв: метод API Layer 1 — **тонкая обёртка**, а настоящий движок обработки запросов — конвейер Handler на Layer 2. Выполнение каждого запроса сводится к «собрать и выполнить цепочку Handler».

```text
Двухслойная архитектура HTTPC
├── Layer 1  Методы API (тонкая обёртка)
│     Пакетные функции httpc.Get/Post/... + методы Client + опции запроса
│     → внутренне единообразно через client.Request → executeRequest
│
└── Layer 2  Конвейер Handler (движок обработки запросов)
      clientImpl.middlewareChain = Chain(middlewares...)(finalHandler)
      Луковая цепочка MiddlewareFunc(Handler) → сборка → выполнение
```

Когда клиент настроен с middleware, `executeRequest` применяет опции запроса к `RequestMutator` и передаёт его в `clientImpl.middlewareChain` для выполнения; если middleware не настроены, запрос направляется напрямую в движок. Эта цепочка — Handler, который `buildMiddlewareChain` собирает один раз при `New()` и кэширует в поле `clientImpl.middlewareChain`.

## Подробный разбор потока выполнения

Полный путь одного запроса от Layer 1 к Layer 2:

```text
httpc.Get(url, opts...)              ← Пакетная функция Layer 1
  → withDefault(ctx, "GET", url, opts)
    → clientImpl.Request(ctx, "GET", url, opts...)   ← Синглтон клиента по умолчанию
      → clientImpl.executeRequest(ctx, "GET", url, opts)
          │
          ├─ Клиент закрыт? → ErrClientClosed
          │
          ├─ Без middleware?
          │     → c.engine.Request(ctx, method, url, opts...)   ← Напрямую в движок
          │
          └─ С middleware?
                → engineReq = acquireMiddlewareRequest()         ← Получение из пула объектов
                → engineReq.SetMethod/SetURL/SetContext          ← Запись исходного состояния
                → Последовательное применение opts(engineReq)    ← Опции запроса вступают в силу
                → c.middlewareChain(ctx, engineReq)              ← Вход в луковую цепочку
                → Chain послойно оборачивает → finalHandler → c.engine.Request
                → defer releaseMiddlewareRequest(engineReq)      ← Возврат в пул объектов
```

Ключевые детали:

- **Повторное использование пула объектов**: при наличии middleware `executeRequest` получает `*engine.Request` из общего пула объектов движка (через `acquireMiddlewareRequest()`), применяет опции запроса и передаёт в цепочку middleware как `RequestMutator`. После **синхронного** завершения всей цепочки `defer` возвращает объект запроса в пул.
- **Прямое подключение без middleware**: при отсутствии настроенных middleware пулирование и сборка цепочки пропускаются — опции запроса передаются напрямую в движок, быстрый путь с нулевыми накладными расходами.
- **Сеть безопасности panic по умолчанию**: `clientImpl.Request` имеет встроенный `recover`, преобразующий любой непредвиденный panic на пути выполнения в error, а не обрушивающий вызывающий процесс. Это формирует двойную защиту с `RecoveryMiddleware`.

## Процесс сборки цепочки middleware

`buildMiddlewareChain` **за один проход** собирает всю цепочку при `New()` и кэширует её в поле `clientImpl.middlewareChain`. Сборка состоит из двух шагов:

```text
buildMiddlewareChain(middlewares):

  ① Построение finalHandler (терминальный обработчик)
     finalHandler: func(ctx, req) → читает из req все поля, изменённые middleware
                                    → через единичную option closure перенаправляет в движок
                                    → возвращает *engine.Response

  ② Chain(middlewares...)(finalHandler)
     Послойная обёртка сзади вперёд: final = mw[i](final)
     Срез [mwA, mwB, mwC] → mwA(mwB(mwC(finalHandler)))
```

Соответствие порядка среза и порядка выполнения: middleware, расположенный **раньше** в срезе, находится на **самом внешнем** уровне цепочки (входит первым, выходит последним); middleware **позже** в срезе прилегает к `finalHandler` (самый внутренний). Комбинатор `Chain` обходит срез с конца в обратном порядке (`for i := len-1; i >= 0; i--`), оборачивая каждый middleware вокруг предыдущего слоя.

## Handler

```go
type Handler func(ctx context.Context, req RequestMutator) (ResponseMutator, error)
```

Основная сигнатура функции обработки запроса. Принимает контекст и мутатор запроса, возвращает мутатор ответа или ошибку. Терминальный Handler в конце цепочки (`finalHandler`) отвечает за перенаправление полей запроса, изменённых middleware, в низкоуровневый движок для фактической отправки сетевого запроса.

## MiddlewareFunc

```go
type MiddlewareFunc func(Handler) Handler
```

Сигнатура функции middleware: принимает «следующий Handler» и возвращает обёрнутый Handler. Middleware может вставлять логику до и после вызова `next` (изменение запроса, логирование ответа, перехват panic и др.), образуя луковую модель: первое middleware — самый внешний слой, входит первым и выходит последним.

## Порядок выполнения луковой модели

```text
Направление входа запроса →

  ┌─ Middleware A (внешний, выполняется первым) ───────────┐
  │  ┌─ Middleware B (средний) ────────────────────────┐  │
  │  │  ┌─ Middleware C (внутренний, выполняется последним) ┐  │  │
  │  │  │                                                   │  │  │
  │  │  │  finalHandler → engine.Request → сеть             │  │  │
  │  │  │                                                   │  │  │
  │  │  └──────────────── ответ ←──────────────────────────┘  │  │
  │  └──────────────────────── ответ ←────────────────────────┘  │
  └──────────────────────────────────── ответ ←──────────────────┘

  ← Направление возврата ответа

  Фаза запроса: A → B → C → finalHandler (снаружи внутрь)
  Фаза ответа: finalHandler → C → B → A (изнутри наружу)
```

Middleware настраиваются в срезе `MiddlewareConfig.Middlewares` — middleware, расположенный **раньше** в срезе, находится на **внешнем** уровне цепочки.

## Chain

```go
func Chain(middlewares ...MiddlewareFunc) MiddlewareFunc
```

Объединяет несколько middleware в одно. Возвращаемый комбинатор принимает финальный Handler и вкладывает middleware снаружи внутрь в порядке передачи: первый middleware в срезе оборачивает самый внешний слой (выполняется первым), последний прилегает к финальному Handler. HTTPC использует это внутренне для сборки `MiddlewareConfig.Middlewares` в цепочку.

```go
// Три эквивалентных формы: Chain собирает и внедряет однократно — результат тот же, что и ручное вложение
combined := httpc.Chain(mwA, mwB, mwC)
chain := combined(finalHandler)

// Эквивалентно ручному вложению
chain := mwA(mwB(mwC(finalHandler)))
```

:::tip Назначение Chain
`Chain` в основном используется HTTPC внутренне в `buildMiddlewareChain`, но вы также можете применять его внутри пользовательского middleware для упаковки нескольких под-middleware в одно — для повторного использования и комбинирования.
:::

## finalHandler — терминальный обработчик

`finalHandler` — **терминальный Handler** цепочки middleware: после выполнения всех middleware именно он перенаправляет изменённые поля запроса в низкоуровневый движок для фактической отправки сетевого запроса. Это мост между Layer 2 и движком в двухслойной архитектуре.

Работа finalHandler состоит из трёх шагов:

```text
finalHandler(ctx, req):

  ① Разбор контекста: req.Context() в приоритете, при nil — откат к ctx цепочки

  ② Утверждение типа к *engine.Request, извлечение специфичных хуков движка:
       - OnRequest callback (перед отправкой запроса)
       - OnResponse callback (после получения ответа)
       - AllowPrivateIPs (перезапись SSRF на уровне запроса)
     Эти три хука не входят в интерфейс RequestMutator (сигнатуры ссылаются на
     внутренние типы, экспорт вызвал бы циклический импорт), поэтому читаются
     через утверждение типа

  ③ Вызов c.engine.Request(ctx, method, url, optionClosure)
     optionClosure однократно перенаправляет все изменяемые поля req в новый
     запрос движка:
       headers / queryParams / body / timeout / maxRetries /
       cookies / followRedirects / maxRedirects / allowPrivateIPs /
       streamBody / onRequest / onResponse
```

:::warning Границы утверждения типа
Колбэки (`OnRequest`/`OnResponse`) и перезапись SSRF на уровне запроса (`AllowPrivateIPs`) существуют на конкретном типе `*engine.Request`, а не на интерфейсе `RequestMutator`. `finalHandler` читает эти хуки через утверждение типа. Если пользовательское middleware **заменяет** `req` на тип, отличный от `*engine.Request`, утверждение типа завершится неудачей и хуки будут **тихо пропущены**. Все встроенные middleware изменяют запрос по месту (без замены), поэтому утверждение всегда успешно.
:::

## Встроенное middleware

HTTPC включает 7 готовых фабрик middleware, внедряемых в клиент через `MiddlewareConfig.Middlewares`. Каждая фабрика принимает указатель `*XxxConfig`, при `nil` используется конфигурация по умолчанию.

| Middleware | Сигнатура фабрики | Назначение |
|------------|-------------------|-----------|
| Recovery | `RecoveryMiddleware()` | Перехват panic в цепочке, преобразование в error со стеком |
| Logging | `LoggingMiddleware(config *LoggingConfig)` | Логирование метода/маскированного URL/кода состояния/длительности |
| RequestID | `RequestIDMiddleware(config *RequestIDConfig)` | Внедрение заголовка `X-Request-ID` (crypto/rand) |
| Timeout | `TimeoutMiddleware(config *TimeoutMiddlewareConfig)` | Контроль таймаута на уровне middleware |
| Header | `HeaderMiddleware(config *HeaderConfig)` | Добавление статических заголовков каждому запросу |
| Metrics | `MetricsMiddleware(config *MetricsConfig)` | Колбэк данных метрик после завершения запроса |
| Audit | `AuditMiddleware(config *AuditConfig)` | События аудита безопасности (финансы/медицина/госсектор) |

Структуры конфигурации каждого middleware, конструкторы по умолчанию и подробное использование см. в [Встроенное middleware](../client-config/middleware).

```go
cfg := httpc.DefaultConfig()
cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
    httpc.RecoveryMiddleware(),                          // Внешний слой: подстраховка от panic
    httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),
    httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: log.Printf}),
    httpc.TimeoutMiddleware(&httpc.TimeoutMiddlewareConfig{Duration: 30 * time.Second}),
}
```

## Примеры пользовательского middleware

### Пример 1: middleware внедрения заголовка запроса

Внедряет заголовок API-ключа для каждого запроса. Демонстрирует шаблон предобработки запроса **до** `next(ctx, req)`.

```go
package main

import (
	"context"
	"fmt"

	"github.com/cybergodev/httpc"
)

// apiKeyMiddleware внедряет заголовок аутентификации X-API-Key для каждого запроса
func apiKeyMiddleware(key string) httpc.MiddlewareFunc {
	return func(next httpc.Handler) httpc.Handler {
		return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
			// Внедрение заголовка аутентификации через RequestMutator.SetHeader (до next = предобработка запроса)
			req.SetHeader("X-API-Key", key)
			// Вызов next для продолжения цепочки; изменённый запрос передаётся вдоль цепочки к finalHandler
			return next(ctx, req)
		}
	}
}

func main() {
	cfg := httpc.DefaultConfig()
	cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
		apiKeyMiddleware("my-secret-api-key"),
	}
	client, err := httpc.New(cfg)
	if err != nil {
		panic(err)
	}
	defer client.Close()

	result, err := client.Get("https://httpbin.org/get")
	if err != nil {
		panic(err)
	}
	fmt.Println(result.StatusCode())
	// Вывод: 200
}
```

### Пример 2: middleware внедрения заголовка ответа

Добавляет время обработки в ответ. Демонстрирует шаблон постобработки ответа **после** `next(ctx, req)` — чтение и изменение ответа через `ResponseMutator`.

```go
package main

import (
	"context"
	"fmt"
	"time"

	"github.com/cybergodev/httpc"
)

// responseTimeMiddleware добавляет время обработки в заголовок ответа
func responseTimeMiddleware() httpc.MiddlewareFunc {
	return func(next httpc.Handler) httpc.Handler {
		return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
			start := time.Now()
			// Сначала вызываем next для продолжения запроса
			resp, err := next(ctx, req)
			if err != nil {
				return nil, err
			}
			// После next = постобработка ответа: добавление длительности через ResponseMutator.SetHeader
			resp.SetHeader("X-Response-Time-Ms",
				fmt.Sprintf("%d", time.Since(start).Milliseconds()))
			return resp, nil
		}
	}
}

func main() {
	cfg := httpc.DefaultConfig()
	cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
		responseTimeMiddleware(),
	}
	client, err := httpc.New(cfg)
	if err != nil {
		panic(err)
	}
	defer client.Close()

	result, err := client.Get("https://httpbin.org/get")
	if err != nil {
		panic(err)
	}
	fmt.Println(result.Response.Headers.Get("X-Response-Time-Ms"))
	// Пример вывода: 156
}
```

### Middleware кэширования ответов (концепция)

Кэширование ответов — типовой продвинутый пример использования `ResponseMutator`: при попадании в кэш GET-запроса возвращается короткое замыкание без вызова `next`. Однако построение полного кэшированного ответа требует пользовательского типа, реализующего все методы `ResponseMutator` (31 метод чтения/записи) — значительный объём кода. Базовый шаблон:

<!-- check-code: skip -->
```go
func cacheMiddleware(cache Cache) httpc.MiddlewareFunc {
	return func(next httpc.Handler) httpc.Handler {
		return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
			// Кэшировать только GET-запросы
			if req.Method() == "GET" {
				if cached, ok := cache.Get(req.URL()); ok {
					return cached, nil // Попадание в кэш: короткое замыкание без вызова next
				}
			}
			// Промах: выполнение запроса
			resp, err := next(ctx, req)
			if err != nil {
				return nil, err
			}
			// Кэширование ответа (требуется пользовательская реализация ResponseMutator)
			cache.Set(req.URL(), resp)
			return resp, nil
		}
	}
}
```

## Контракт выполнения middleware

При написании пользовательского middleware соблюдайте следующие контракты, иначе возможны утечки ресурсов или потеря запросов:

| Контракт | Описание |
|----------|----------|
| **Обязательно вызывать `next()`** | Без вызова `next` запрос никогда не будет отправлен (кроме middleware короткого замыкания, например, попадание в кэш). Ответ, возвращаемый `next`, — финальный результат последующей цепочки и движка. |
| **Ответ должен быть возвращён или освобождён** | Возвращаемый из `next` `resp` должен быть возвращён как есть (или передан обратно через последующий `next`), иначе произойдёт утечка объекта ответа из пула движка. Возврат `(nil, error)` при удержании неосвобождённого ответа приводит к утечке пула. |
| **panic перехватывается RecoveryMiddleware** | panic в middleware будет перехвачен `RecoveryMiddleware` (если настроен) или сетью безопасности по умолчанию `clientImpl.Request` и преобразован в error, не распространяясь к вызывающему. |
| **Синхронное выполнение** | Цепочка middleware выполняется **синхронно** — при возврате `next` вся внутренняя цепочка уже завершена. Асинхронное middleware не поддерживается; его внедрение приведёт к гонке данных в шаблоне повторного использования пула объектов. |
| **Не заменять объект запроса** | Пользовательское middleware должно **изменять `req` по месту** (через `SetHeader`/`SetBody` и др.), а не заменять `req` новым объектом. Замена приведёт к неудаче утверждения типа в `finalHandler`, колбэки и перезапись SSRF будут тихо пропущены. |

:::warning Риск утечки пула объектов
`executeRequest` получает `*engine.Request` из пула объектов движка и передаёт его в цепочку middleware, а после возврата цепочки возвращает его через `defer`. Если middleware вернуло ответ от `next`, но дополнительно удерживает ссылку (например, сохраняет в глобальный кэш), этот ответ будет переиспользован после возврата в пул, что приведёт к утечке данных между запросами. Middleware кэширования должно выполнять глубокое копирование данных ответа.
:::

## См. также

- [Встроенное middleware](../client-config/middleware) — 7 готовых фабрик middleware (Recovery/Logging/Timeout и др.)
- [Мутаторы запросов и ответов](./mutators) — полный контракт методов `RequestMutator`/`ResponseMutator`
- [Определения интерфейсов](../types/interfaces) — определения псевдонимов типов `Handler`/`MiddlewareFunc`
