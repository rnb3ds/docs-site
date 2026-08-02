---
sidebar_label: "Контрольный список для продакшена"
title: "Контрольный список - CyberGo HTTPC | Проверка перед релизом"
description: "Контрольный список безопасности производственной среды HTTPC: проверка по категориям TLS, SSRF, таймауты, ограничения размеров, повторы, Cookie, загрузка файлов, управление ресурсами и мониторинг — для каждого пункта указаны значения по умолчанию, рекомендуемые производственные значения и методы проверки кодом."
sidebar_position: 4
---

# Контрольный список для продакшена

Пострелизная проверка по каждому пункту позволяет эффективно устранить типовые дефекты конфигурации безопасности. Список сгруппирован по категориям, для каждого пункта указаны значение по умолчанию, рекомендуемое продакшен-значение и метод проверки. Рекомендуется автоматизировать проверку высокорисковых пунктов в CI скриптом (см. конец страницы).

## TLS / шифрование

| Пункт проверки | По умолчанию | Рекомендуется в продакшене | Метод проверки |
|----------------|--------------|----------------------------|----------------|
| `InsecureSkipVerify` | `false` | `false` | Поиск в коде, см. команду в конце |
| `MinTLSVersion` | TLS 1.2 | TLS 1.2+ (для высокой безопасности можно принудительно 1.3) | `grep MinTLSVersion` |
| `MaxTLSVersion` | TLS 1.3 | TLS 1.3 | `grep MaxTLSVersion` |
| Не используется `TestingConfig()` | — | Да | Поиск в коде, см. команду в конце |
| Закрепление сертификатов (высокобезопасные сценарии) | Не включено | Рекомендуется включить | `grep CertificatePinner` |

:::warning
`InsecureSkipVerify = true` делает все меры безопасности TLS недействительными. HTTPC выводит предупреждение в `stderr` в не-тестовой среде — перед релизом обязательно убедитесь, что в логах нет этого предупреждения.
:::

## Защита от SSRF

| Пункт проверки | По умолчанию | Рекомендуется в продакшене | Метод проверки |
|----------------|--------------|----------------------------|----------------|
| `AllowPrivateIPs` | `false` | `false` (при обработке недоверенных URL) | Поиск в коде, см. команду в конце |
| `SSRFExemptCIDRs` | `nil` | Точно перечислить только необходимые диапазоны | Аудит возможности сужения диапазонов |
| `SecureConfig()` для пользовательских URL | — | Да | Ревью кода |
| `RedirectWhitelist` | `nil` | Настраивать при обработке пользовательских URL | Ревью кода |

```go
cfg := httpc.DefaultConfig()
cfg.Security.AllowPrivateIPs = false
// Освобождать только фактически нужные диапазоны, по возможности сужая
cfg.Security.SSRFExemptCIDRs = []string{"10.50.0.0/16"}
cfg.Security.RedirectWhitelist = []string{"api.example.com"}
```

## Настройка таймаутов

Таймауты — первая линия обороны против Slowloris, исчерпания ресурсов и каскадных сбоев.

| Пункт проверки | По умолчанию | Рекомендуется в продакшене | Метод проверки |
|----------------|--------------|----------------------------|----------------|
| `Timeouts.Request` | 180s | По бизнесу (например, 30s) | Подтвердить ненулевое значение |
| `Timeouts.Dial` | 10s | 5-10s | `grep Timeouts.Dial` |
| `Timeouts.TLSHandshake` | 10s | 5-10s | `grep Timeouts.TLSHandshake` |
| `Timeouts.ResponseHeader` | 0 | По необходимости (см. ниже) | Понять область действия |
| `Timeouts.IdleConn` | 90s | 60-120s | — |

:::warning
`Timeouts.ResponseHeader` — жёсткий лимит транспортного уровня, применяется ко **всем запросам** данного клиента и **не может** быть переопределён по запросу через `WithTimeout`. Положительное значение переопределит более длинный `WithTimeout`. Устанавливайте положительное значение только при необходимости транспортной независимой защиты от Slowloris; для сценариев с длинными ответами (AI API и др.) устанавливайте 0 и полагайтесь на таймаут `Request`.
:::

## Лимиты размеров

| Пункт проверки | По умолчанию | Рекомендуется в продакшене | Метод проверки |
|----------------|--------------|----------------------------|----------------|
| `MaxResponseBodySize` | 10MB | По бизнесу (например, 5MB) | Подтвердить ненулевое значение |
| `MaxDecompressedBodySize` | 100MB | По бизнесу (например, 50MB) | Подтвердить ненулевое значение |
| `MaxRequestBodySize` | 0 (без лимита) | **Явно установить** лимит загрузки | `grep MaxRequestBodySize` |
| `MaxResponseHeaderBytes` | 0 (умолчание Go 10MB) | В высокобезопасных можно сузить до 1MB | `grep MaxResponseHeaderBytes` |

```go
cfg := httpc.DefaultConfig()
cfg.Security.MaxResponseBodySize = 5 * 1024 * 1024     // Ответ 5MB
cfg.Security.MaxDecompressedBodySize = 50 * 1024 * 1024 // Распаковка 50MB
cfg.Security.MaxRequestBodySize = 2 * 1024 * 1024       // Загрузка 2MB (по умолчанию 0 без лимита!)
cfg.Connection.MaxResponseHeaderBytes = 1 * 1024 * 1024  // Заголовки ответа 1MB
```

:::danger
`MaxRequestBodySize` по умолчанию равен 0 (без лимита) и не имеет **автоматического резервного значения**. При проксировании или обработке пользовательских загрузок без установки злоумышленник может отправить огромный запрос и исчерпать пропускную способность и память. Обязательно устанавливайте явно.
:::

## Стратегия повторов

| Пункт проверки | По умолчанию | Рекомендуется в продакшене | Метод проверки |
|----------------|--------------|----------------------------|----------------|
| `MaxRetries` | 3 | Не более 5 | Ревью кода |
| Повторы неидемпотентных запросов | — | Осторожность с POST/PUT/PATCH | Ревью кода на идемпотентность |
| `EnableJitter` | `true` | `true` (защита от эффекта стада) | `grep EnableJitter` |
| `MaxRetryDelay` | 30s | 30s | — |

:::warning
Повторы неидемпотентных запросов (POST создание ресурсов, PUT частичное обновление) могут привести к дублированию создания или повторным списаниям. Если бизнес не идемпотентен, устанавливайте `WithMaxRetries(0)` для таких запросов или реализуйте идемпотентный ключ на стороне сервера.
:::

## Безопасность Cookie

| Пункт проверки | По умолчанию | Рекомендуется в продакшене | Метод проверки |
|----------------|--------------|----------------------------|----------------|
| `CookieSecurity` | `nil` (без проверки) | `StrictCookieSecurityConfig()` | `grep CookieSecurity` |
| Порядок `WithSecureCookie` | — | После всех `WithCookie` | Ревью кода |

```go
cfg := httpc.DefaultConfig()
cfg.Security.CookieSecurity = httpc.StrictCookieSecurityConfig()
// Требуется Secure + HttpOnly + SameSite=Strict
```

## Безопасность загрузки файлов

| Пункт проверки | По умолчанию | Рекомендуется в продакшене | Метод проверки |
|----------------|--------------|----------------------------|----------------|
| Недоверенный путь загрузки | — | Только доверенные пути, без конкатенации пользовательского ввода | Ревью кода |
| Проверка `Checksum` | Не задан | Устанавливать SHA-256 для критических файлов | `grep Checksum` |
| `Overwrite` / `ResumeDownload` | `false` | По необходимости | Ревью кода |

`Download` HTTPC уже имеет встроенную пятислойную защиту путей (блокировка UNC, фильтрация управляющих символов, защита системных путей, обнаружение path traversal, защита от символических ссылок), но всё же следует избегать прямой передачи пользовательского ввода в качестве `FilePath`.

## Управление ресурсами

| Пункт проверки | По умолчанию | Рекомендуется в продакшене | Метод проверки |
|----------------|--------------|----------------------------|----------------|
| Явный `client.Close()` | — | `defer client.Close()` | Ревью кода |
| Закрытие клиента по умолчанию | — | `CloseDefaultClient()` при выходе долгоживущего сервиса | Ревью кода |
| `WithContext` для отмены | — | Да | Ревью кода |

```go
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/cybergodev/httpc"
)

func main() {
	cfg := httpc.DefaultConfig()
	client, err := httpc.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	// Гарантируем освобождение пула соединений
	defer func() {
		if cerr := client.Close(); cerr != nil {
			log.Printf("Не удалось закрыть клиент: %v", cerr)
		}
	}()

	// Управление таймаутом и отменой одного запроса через context
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	result, err := client.Get("https://api.example.com", httpc.WithContext(ctx))
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Код состояния: %d\n", result.StatusCode())
}
```

:::tip
При использовании пакетных функций (`httpc.Get` и др.) клиент по умолчанию не закрывает соединения автоматически при выходе программы. Долгоживущие сервисы должны вызывать `httpc.CloseDefaultClient()` при изящной остановке для освобождения пула соединений. Для продакшен-сервисов рекомендуется создавать клиент через явный `httpc.New(cfg)`, управляя конфигурацией и жизненным циклом.
:::

## Мониторинг и аудит

### Промежуточное ПО аудита (высокобезопасные сценарии)

`AuditMiddleware` генерирует структурированные события аудита, подходит для сценариев со строгими требованиями соответствия. URL в событии уже маскирован (учётные данные удалены), конфиденциальные заголовки по умолчанию скрываются.

```go
auditCfg := httpc.DefaultAuditConfig()
auditCfg.OnAudit = func(event httpc.AuditEvent) {
    // event.SourceIP / event.UserID внедряются из context
    data, _ := json.Marshal(event)
    log.Println(string(data))
}
auditCfg.Format = "json"
auditCfg.IncludeHeaders = true
auditCfg.MaskHeaders = []string{"Authorization", "Cookie", "Set-Cookie", "X-API-Key"}
auditMiddleware := httpc.AuditMiddleware(auditCfg)
```

`SourceIP` и `UserID` внедряются через ключи context `httpc.SourceIPKey`, `httpc.UserIDKey`, что удобно для связывания запроса с вызывающей стороной. `AuditEvent` содержит временную метку, метод, URL, код состояния, длительность, число повторов, ошибку, цепочку перенаправлений, заголовки запроса/ответа и другие поля.

### Промежуточное ПО логирования и метрик

| Пункт проверки | Рекомендуется в продакшене | Метод проверки |
|----------------|----------------------------|----------------|
| `RecoveryMiddleware()` | Включить (защита от обрушения при panic) | `grep RecoveryMiddleware` |
| `LoggingMiddleware()` | Включить (логи запросов) | `grep LoggingMiddleware` |
| `MetricsMiddleware()` | Включить (сбор метрик) | `grep MetricsMiddleware` |
| `RequestIDMiddleware()` | Включить (трассировка запросов) | `grep RequestIDMiddleware` |

## Закрепление сертификатов

В высокобезопасных сценариях (финансы, медицина) рекомендуется включить закрепление сертификатов для защиты от атак «человек посередине» при компрометации CA:

```go
pinner, err := httpc.NewSPKIHashPinner(
    "YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2fuihg=", // Текущий ключ
    "C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=", // Резервный (ротация)
)
if err != nil {
    log.Fatal(err)
}
cfg := httpc.DefaultConfig()
cfg.Security.CertificatePinner = pinner
```

Детали настройки и сопровождения закрепления см. в [TLS и закрепление сертификатов](./tls-certpin).

## Примеры кода

### Создание продакшен-клиента

```go
package main

import (
	"log"
	"time"

	"github.com/cybergodev/httpc"
)

func main() {
	cfg := httpc.DefaultConfig()

	// Таймауты
	cfg.Timeouts.Request = 30 * time.Second
	cfg.Timeouts.Dial = 10 * time.Second
	cfg.Timeouts.TLSHandshake = 10 * time.Second
	cfg.Timeouts.ResponseHeader = 0 // Полагаться на таймаут Request, не устанавливать транспортный жёсткий лимит
	cfg.Timeouts.IdleConn = 90 * time.Second

	// Пул соединений
	cfg.Connection.MaxIdleConns = 50
	cfg.Connection.MaxConnsPerHost = 10

	// Безопасность
	cfg.Security.AllowPrivateIPs = false
	cfg.Security.MaxResponseBodySize = 5 * 1024 * 1024      // 5MB
	cfg.Security.MaxDecompressedBodySize = 50 * 1024 * 1024 // 50MB
	cfg.Security.MaxRequestBodySize = 2 * 1024 * 1024       // Загрузка 2MB

	// Повторы
	cfg.Retry.MaxRetries = 3
	cfg.Retry.Delay = 1 * time.Second
	cfg.Retry.EnableJitter = true

	// Значения по умолчанию запроса
	cfg.Defaults.UserAgent = "my-service/1.0"
	cfg.Defaults.FollowRedirects = true
	cfg.Defaults.MaxRedirects = 5

	// Промежуточное ПО
	cfg.Middleware.Middlewares = []httpc.MiddlewareFunc{
		httpc.RecoveryMiddleware(),
		httpc.LoggingMiddleware(&httpc.LoggingConfig{LogFunc: log.Printf}),
		httpc.RequestIDMiddleware(httpc.DefaultRequestIDConfig()),
	}

	client, err := httpc.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer func() { _ = client.Close() }()
	log.Println("Продакшен-клиент готов")
}
```

### Безопасный клиент (обработка пользовательских URL)

```go
func createSecureClient() (httpc.Client, error) {
	cfg := httpc.SecureConfig()
	cfg.Security.CookieSecurity = httpc.StrictCookieSecurityConfig()
	cfg.Security.RedirectWhitelist = []string{"api.example.com"}
	// SecureConfig уже установил FollowRedirects = false, AllowPrivateIPs = false, лимит ответа 5MB
	return httpc.New(cfg)
}
```

## Команды проверки

Запустите следующие команды в CI или перед коммитом для сканирования высокорисковых конфигураций:

```bash
# Проверка misuse of TestingConfig (исключая тестовые файлы)
grep -r "TestingConfig" --include="*.go" | grep -v "_test.go"

# Проверка InsecureSkipVerify = true
grep -rn "InsecureSkipVerify.*true\|InsecureSkipVerify:\s*true" --include="*.go" | grep -v "_test.go"

# Проверка AllowPrivateIPs = true (опасно для продакшена)
grep -rn "AllowPrivateIPs.*true\|AllowPrivateIPs:\s*true" --include="*.go" | grep -v "_test.go"

# Проверка, установлен ли MaxRequestBodySize (по умолчанию 0 без лимита)
grep -rn "MaxRequestBodySize" --include="*.go" | grep -v "_test.go"
```

:::tip
Рекомендуется инкапсулировать эти команды как шаг CI — срабатывание высокорисковой конфигурации (`TestingConfig`, `InsecureSkipVerify: true`, `AllowPrivateIPs: true` в не-тестовом коде) должно блокировать сборку.
:::

## Что дальше

- [Обзор безопасности](./) — обзор функций безопасности
- [Защита от SSRF](./ssrf) — детальный разбор защиты SSRF
- [TLS и закрепление сертификатов](./tls-certpin) — практики закрепления сертификатов в продакшене
- [Config API](../api-reference/client-config/config) — полный справочник конфигурации
