---
sidebar_label: "Мутаторы запросов и ответов"
title: "Мутаторы запросов и ответов - CyberGo HTTPC | Mutator API"
description: "Подробное описание контрактов чтения/записи middleware HTTPC: RequestMutator и ResponseMutator — два публичных составных интерфейса, предоставляющие все методы чтения и записи для запроса и ответа, с компилируемым примером изменения заголовков и чтения кода состояния."
sidebar_position: 2
---

# Мутаторы запросов и ответов

Middleware не взаимодействует с низкоуровневыми объектами запроса/ответа напрямую, а читает и пишет через интерфейсы **мутаторов (Mutator)**. Middleware всегда получает полный мутатор чтения-записи (`RequestMutator` / `ResponseMutator`); группировка методов чтения/записи ниже служит только для удобства чтения и не является отдельным экспортируемым интерфейсом.

```text
RequestMutator  =  Методы чтения  +  Методы записи
ResponseMutator =  Методы чтения  +  Методы записи
        ↑                                    ↑
  middleware изменяет запрос          middleware читает/изменяет ответ
  через RequestMutator                через ResponseMutator
```

Сигнатура `Handler` `func(ctx, RequestMutator) (ResponseMutator, error)` открывает именно эти два мутатора как точку входа и выхода для middleware.

## Мутатор запроса

### Методы чтения

Следующие методы читают данные запроса. Вызывайте их, когда middleware нужно лишь **инспектировать** свойства запроса.

| Метод | Возвращаемый тип | Описание |
|-------|------------------|----------|
| `Method()` | `string` | HTTP-метод |
| `URL()` | `string` | URL запроса |
| `Headers()` | `map[string]string` | Все заголовки запроса (ключ → одно значение) |
| `QueryParams()` | `map[string]any` | Параметры запроса |
| `Body()` | `any` | Тело запроса |
| `Timeout()` | `time.Duration` | Таймаут запроса |
| `MaxRetries()` | `int` | Максимальное число повторов |
| `Context()` | `context.Context` | Контекст запроса |
| `Cookies()` | `[]http.Cookie` | Cookie запроса |
| `FollowRedirects()` | `*bool` | Следовать ли перенаправлениям (nil — использовать значение по умолчанию) |
| `MaxRedirects()` | `*int` | Максимальное число перенаправлений (nil — значение по умолчанию) |
| `StreamBody()` | `bool` | Потоковая передача тела запроса |

### Методы записи

Следующие методы изменяют данные запроса. Вызывайте их, когда middleware нужно лишь **изменить** свойства запроса.

| Метод | Описание |
|-------|----------|
| `SetMethod(string)` | Установить HTTP-метод |
| `SetURL(string)` | Установить URL |
| `SetHeaders(map[string]string)` | Установить все заголовки запроса (полная замена) |
| `SetHeader(key, value string)` | Установить одиночный заголовок запроса (добавить/изменить) |
| `SetQueryParams(map[string]any)` | Установить параметры запроса |
| `SetBody(any)` | Установить тело запроса |
| `SetTimeout(time.Duration)` | Установить таймаут |
| `SetMaxRetries(int)` | Установить максимальное число повторов |
| `SetContext(context.Context)` | Установить контекст |
| `SetCookies([]http.Cookie)` | Установить Cookie |
| `SetFollowRedirects(*bool)` | Установить следование перенаправлениям |
| `SetMaxRedirects(*int)` | Установить максимальное число перенаправлений |
| `SetStreamBody(bool)` | Установить потоковую передачу |

### RequestMutator

`RequestMutator` — экспортируемый httpc интерфейс мутатора запроса с чтением и записью, охватывающий все методы из таблиц «Методы чтения» и «Методы записи» выше. Внутренние подынтерфейсы чтения/записи находятся в пакете `internal/types` и не экспортируются отдельно — извне они доступны единообразно как `RequestMutator`. Middleware инспектирует и переписывает свойства запроса через него до отправки запроса.

## Типовые операции RequestMutator в middleware

| Сценарий | Комбинация методов | Описание |
|----------|---------------------|----------|
| Изменение заголовков запроса | `SetHeader(key, val)` / `Headers()` + `SetHeader` | Внедрение заголовка авторизации, ID трассировки, версии API |
| Изменение параметров запроса | `QueryParams()` → добавление/удаление → `SetQueryParams` | Добавление общих параметров запроса |
| Изменение тела запроса | `Body()` → преобразование → `SetBody` | Сжатие тела, внедрение подписи |
| Установка таймаута | `SetTimeout(d)` | Динамическая корректировка таймаута по пути запроса |
| Установка контекста | `SetContext(ctx)` | Таймаут на уровне middleware (принцип работы `TimeoutMiddleware`) |

```go
// Типовой шаблон: чтение существующих заголовков, добавление пользовательского и обратная запись
headers := req.Headers()
headers["X-Trace-ID"] = generateTraceID()
req.SetHeaders(headers)

// Эквивалентная запись (более лаконичная)
req.SetHeader("X-Trace-ID", generateTraceID())
```

## Мутатор ответа

### Методы чтения

Следующие методы читают данные ответа.

| Метод | Возвращаемый тип | Описание |
|-------|------------------|----------|
| `StatusCode()` | `int` | Код состояния |
| `Status()` | `string` | Текст состояния (например, `"200 OK"`) |
| `Proto()` | `string` | Версия протокола (например, `"HTTP/1.1"`) |
| `Headers()` | `http.Header` | Заголовки ответа |
| `Body()` | `string` | Тело ответа (строка) |
| `RawBody()` | `[]byte` | Тело ответа (байты) |
| `ContentLength()` | `int64` | Длина содержимого |
| `Duration()` | `time.Duration` | Время выполнения запроса |
| `Attempts()` | `int` | Число попыток (включая повторы) |
| `Cookies()` | `[]*http.Cookie` | Cookie ответа |
| `RedirectChain()` | `[]string` | Цепочка перенаправлений (URL каждого перехода) |
| `RedirectCount()` | `int` | Число перенаправлений |
| `RequestHeaders()` | `http.Header` | Фактически отправленные заголовки запроса |
| `RequestURL()` | `string` | Фактический URL запроса (включая итоговый после перенаправлений) |
| `RequestMethod()` | `string` | Метод запроса |

### Методы записи

Следующие методы изменяют данные ответа.

| Метод | Описание |
|-------|----------|
| `SetStatusCode(int)` | Установить код состояния |
| `SetStatus(string)` | Установить текст состояния |
| `SetProto(string)` | Установить версию протокола |
| `SetHeaders(http.Header)` | Установить заголовки ответа (полная замена) |
| `SetBody(string)` | Установить тело ответа |
| `SetRawBody([]byte)` | Установить тело ответа (байты) |
| `SetContentLength(int64)` | Установить длину содержимого |
| `SetDuration(time.Duration)` | Установить длительность |
| `SetAttempts(int)` | Установить число попыток |
| `SetCookies([]*http.Cookie)` | Установить Cookie |
| `SetRedirectChain([]string)` | Установить цепочку перенаправлений |
| `SetRedirectCount(int)` | Установить число перенаправлений |
| `SetRequestHeaders(http.Header)` | Установить заголовки запроса |
| `SetRequestURL(string)` | Установить URL запроса |
| `SetRequestMethod(string)` | Установить метод запроса |
| `SetHeader(key string, values ...string)` | Установить одиночный заголовок ответа (добавить/изменить) |

### ResponseMutator

`ResponseMutator` — экспортируемый httpc интерфейс мутатора ответа с чтением и записью, охватывающий все методы из таблиц «Методы чтения» и «Методы записи» выше. Внутренние подынтерфейсы чтения/записи находятся в пакете `internal/types` и не экспортируются отдельно — извне они доступны единообразно как `ResponseMutator`. Middleware читает или переписывает ответ через него после завершения запроса — удобно для кэширования ответов, преобразования содержимого (например, форматирования JSON), кодирования/декодирования и фильтрации ответов.

## Типовые операции ResponseMutator в middleware

| Сценарий | Комбинация методов | Описание |
|----------|---------------------|----------|
| Чтение кода состояния | `StatusCode()` | Условное логирование, классификация ошибок |
| Чтение заголовков ответа | `Headers()` | Извлечение `X-Request-ID`, `Content-Type` |
| Вычисление метрик | `Duration()` + `Attempts()` | Отправка длительности, числа повторов |
| Трассировка перенаправлений | `RedirectChain()` + `RedirectCount()` | Аудит пути перенаправлений |
| Изменение заголовков ответа | `SetHeader(key, vals...)` | Добавление заголовков трассировки, безопасности |

## Утверждение типа: доступ к специфичным методам движка

`RequestMutator`, получаемый middleware во время выполнения, фактически имеет тип `*engine.Request` (конкретная структура запроса движка). `finalHandler` через утверждение типа читает три специфичных хука движка, **не входящих в интерфейс**. Пользовательскому middleware для доступа к этим хукам также требуется утверждение типа.

:::warning Границы интерфейса
Колбэки `OnRequest`/`OnResponse` и `AllowPrivateIPs` не входят в интерфейс `RequestMutator` — их сигнатуры ссылаются на типы внутреннего пакета `engine` (`*engine.Request`/`*engine.Response`), и экспорт в публичный интерфейс вызвал бы циклический импорт. Поэтому доступ возможен только через утверждение типа `*engine.Request`.
:::

Эти специфичные методы движка включают:

| Метод (только на `*engine.Request`) | Описание |
|--------------------------------------|----------|
| `OnRequest() func(*engine.Request) error` | Колбэк перед отправкой запроса |
| `OnResponse() func(*engine.Response) error` | Колбэк после получения ответа |
| `AllowPrivateIPs() *bool` | Перезапись SSRF на уровне запроса |
| `SetOnRequest(func)` / `SetOnResponse(func)` | Установка колбэка |
| `SetAllowPrivateIPs(*bool)` | Установка перезаписи SSRF |

Подавляющему большинству middleware **не требуется** утверждение типа — интерфейсы `RequestMutator`/`ResponseMutator` уже охватывают все часто используемые операции чтения/записи. Утверждение к конкретному типу требуется только при необходимости колбэков или перезаписи SSRF.

## Кэширование SanitizedURL

Несколько middleware могут нуждаться в логировании маскированного URL (URL с удалёнными учётными данными). Во избежание повторных вычислений HTTPC кэширует маскированный результат на объекте запроса для совместного использования несколькими middleware одного запроса.

```text
getOrComputeSanitizedURL(req):
  ① Реализует ли req интерфейс sanitizedURLer (SanitizedURL/SetSanitizedURL)?
     - *engine.Request реализует этот интерфейс
  ② Уже закэшировано? → возврат кэшированного значения
  ③ Не закэшировано? → вычисление SanitizeURL(req.URL()), кэширование и возврат
```

Встроенные `LoggingMiddleware`, `MetricsMiddleware` и `AuditMiddleware` используют `getOrComputeSanitizedURL` для совместного использования маскированного результата, так что маскировка URL **вычисляется только один раз** на всю цепочку. Пользовательское middleware при логировании URL также должно использовать этот механизм, а не вызывать напрямую `req.URL()` (может содержать учётные данные).

:::tip Маскировка URL
При логировании URL в middleware логирования/метрик никогда не используйте напрямую `req.URL()` — если URL содержит учётные данные в формате `user:pass@host`, они попадут в логи. Встроенные middleware через `getOrComputeSanitizedURL` автоматически удаляют часть с учётными данными.
:::

## Пример: чтение и запись запроса/ответа через мутаторы

Middleware аутентификации: внедряет заголовок авторизации через `SetHeader` из `RequestMutator` и читает код состояния ответа через `StatusCode` из `ResponseMutator`.

```go
package main

import (
	"context"
	"fmt"

	"github.com/cybergodev/httpc"
)

// authMiddleware внедряет заголовок авторизации через RequestMutator
// и читает код состояния через ResponseMutator
func authMiddleware(token string) httpc.MiddlewareFunc {
	return func(next httpc.Handler) httpc.Handler {
		return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
			// Запись: установка заголовка запроса через RequestMutator
			req.SetHeader("Authorization", "Bearer "+token)
			// Чтение: инспектирование метода запроса через RequestMutator
			fmt.Printf("Отправка %s-запроса\n", req.Method())

			resp, err := next(ctx, req)
			if err != nil {
				return nil, err
			}
			// Чтение: получение кода состояния через ResponseMutator
			fmt.Printf("Получен код состояния %d\n", resp.StatusCode())
			return resp, nil
		}
	}
}

func main() {
	cfg := httpc.DefaultConfig()
	cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
		authMiddleware("my-secret-token"),
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
	fmt.Println(result.IsSuccess())
	// Пример вывода:
	// Отправка GET-запроса
	// Получен код состояния 200
	// true
}
```

## Практический пример: middleware логирования запроса/ответа

Полное middleware логирования, одновременно демонстрирующее возможности чтения/записи `RequestMutator` и `ResponseMutator` — через мутаторы читает метод/URL запроса и код состояния/длительность/информацию о повтораx ответа, форматируя единый вывод.

```go
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/cybergodev/httpc"
)

// loggingMiddleware читает полную информацию о запросе и ответе через мутаторы и форматирует вывод
func loggingMiddleware() httpc.MiddlewareFunc {
	return func(next httpc.Handler) httpc.Handler {
		return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
			start := time.Now()

			// Фаза запроса: чтение информации о запросе
			log.Printf("[REQ] %s %s", req.Method(), req.URL())

			resp, err := next(ctx, req)
			duration := time.Since(start)

			if err != nil {
				// Ошибка ответа: код состояния недоступен
				log.Printf("[ERR] %s %s -> %v (%v)",
					req.Method(), req.URL(), err, duration)
				return nil, err
			}

			// Фаза ответа: чтение кода состояния, длительности, числа повторов, цепочки перенаправлений
			log.Printf("[RESP] %s %s -> %d (%v, attempts=%d, redirects=%d)",
				req.Method(),
				req.URL(),
				resp.StatusCode(),
				duration,
				resp.Attempts(),
				resp.RedirectCount(),
			)
			return resp, nil
		}
	}
}

func main() {
	cfg := httpc.DefaultConfig()
	cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
		loggingMiddleware(),
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
	fmt.Println("Код состояния:", result.StatusCode())
	// Пример вывода:
	// [REQ] GET https://httpbin.org/get
	// [RESP] GET https://httpbin.org/get -> 200 (123.456ms, attempts=1, redirects=0)
	// Код состояния: 200
}
```

## См. также

- [Handler и цепочка middleware](./handler-chain) — обзор двухслойной архитектуры и луковой модели
- [Встроенное middleware](../client-config/middleware) — HeaderMiddleware и др. как готовые примеры работы через мутаторы
- [Определения интерфейсов](../types/interfaces) — определения псевдонимов типов мутаторов
