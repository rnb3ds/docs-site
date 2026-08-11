---
sidebar_label: "Маскирование данных"
title: "Маскирование данных - CyberGo env | инструменты безопасности логов"
description: "Полное руководство по инструментам маскирования чувствительных данных CyberGo env: IsSensitiveKey для автообнаружения паролей и ключей, MaskValue для маскирования по чувствительности, MaskKey для маскирования имён ключей, SanitizeForLog для очистки строк логов и ClearBytes для безопасного обнуления, с практическими примерами HTTP-промежуточного ПО и структурированных логов."
sidebar_position: 2
---

# Маскирование чувствительных данных

env предоставляет набор **утилитарных функций, независимых от Loader**, для предотвращения утечки чувствительных данных в логах, сообщениях об ошибках и отладочном выводе. Эти функции можно вызывать напрямую без создания Loader; они подходят для любого сценария, где требуется безопасное логирование конфигурации.

## Зачем нужно маскирование

Даже если вы надёжно защищаете чувствительные значения в памяти с помощью [SecureValue](/ru/env/api-reference/secure-value), они всё равно могут утечь через три канала:

- **Логи приложения** — прямая печать конфигурации, параметров запроса, строк подключения
- **Сообщения об ошибках** — panic / error уносит ключи в системы сбора логов
- **Отладочный вывод** — `fmt.Println` при отладке случайно выводит переменные окружения

```text
log.Printf("Загрузка конфигурации DB_PASSWORD=%s", pwd)          ← утечка в логи
panic("connect failed: password=hunter2")           ← утечка в ошибки
fmt.Println(env.GetString("API_KEY"))               ← утечка в отладку
```

Как только эти данные попадают в системы агрегации логов (ELK, Datadog...) или становятся доступны команде, ops или даже злоумышленнику, ключ считается скомпрометированным. Инструменты маскирования env позволяют **автоматически скрывать чувствительное содержимое** при логировании, устраняя утечку на уровне источника.

## Подробный обзор функций

### IsSensitiveKey

```go
func IsSensitiveKey(key string) bool
```

Проверяет без учёта регистра, содержит ли `key` чувствительные шаблоны. Обнаружение использует **сопоставление подстрок** — если имя ключа (преобразованное в верхний регистр) содержит любой из встроенных шаблонов, он считается чувствительным.

**Встроенные шаблоны обнаружения:**

| Категория | Шаблоны |
|-----------|---------|
| Аутентификация | `PASSWORD`, `SECRET`, `TOKEN`, `AUTH`, `CREDENTIAL`, `PASSPHRASE`, `SESSION`, `COOKIE` |
| Ключи | `API_KEY`, `APIKEY`, `ACCESS_KEY`, `SECRET_KEY`, `PRIVATE_KEY`, `PUBLIC_KEY` |
| Шифрование | `PRIVATE`, `ENCRYPTION_KEY`, `ENCRYPT_KEY`, `DECRYPT_KEY`, `SIGNING_KEY`, `SIGN_KEY`, `VERIFY_KEY` |
| Финансы / PII | `SSN`, `SOCIAL_SECURITY`, `CREDIT_CARD`, `CARD_NUMBER`, `CVV`, `CVC`, `CCV`, `PAN` |
| Криптовалюта | `MNEMONIC`, `SEED`, `RECOVERY`, `WALLET`, `PRIVATE_ADDRESS` |
| Инфраструктура | `CONNECTION_STRING`, `CONN_STRING`, `DATABASE_URL`, `DB_PASSWORD` |
| Облачные сервисы | `AWS_SECRET`, `AZURE_KEY`, `GCP_KEY`, `SERVICE_ACCOUNT` |

::: tip Смысл сопоставления подстрок
`IsSensitiveKey("MY_API_KEY_TOKEN")` сопоставится с `API_KEY` и `TOKEN`, вернёт true. Это означает, что `AUTHORIZATION` также будет определён как чувствительный из-за содержания `AUTH` — это ожидаемое консервативное поведение.
:::

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

func main() {
    // Аутентификация и ключи
    fmt.Println(env.IsSensitiveKey("DB_PASSWORD"))  // true
    fmt.Println(env.IsSensitiveKey("API_KEY"))      // true
    fmt.Println(env.IsSensitiveKey("ACCESS_TOKEN")) // true

    // Без учёта регистра
    fmt.Println(env.IsSensitiveKey("api_key")) // true
    fmt.Println(env.IsSensitiveKey("ApiKey"))  // true

    // Нечувствительные ключи
    fmt.Println(env.IsSensitiveKey("PORT"))    // false
    fmt.Println(env.IsSensitiveKey("DB_HOST")) // false
}
```

### MaskValue

```go
func MaskValue(key, value string) string
```

Маскирует `value` в зависимости от чувствительности `key`, подходит для логирования пар ключ-значение конфигурации:

| Условие | Возвращаемое значение |
|---------|----------------------|
| `IsSensitiveKey(key)` равно true | `[MASKED:N chars]` (N = `len(value)`) |
| Нечувствительный и `len(value) ≤ 20` | Исходное значение |
| Нечувствительный и `len(value) > 20` | `value[:17] + "..."` |

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

func main() {
    // Чувствительное значение → маскирование (сохраняется информация о длине для отладки)
    fmt.Println(env.MaskValue("DB_PASSWORD", "p@ssw0rd123"))
    // Вывод: [MASKED:11 chars]

    // Нечувствительное короткое значение → возвращается как есть
    fmt.Println(env.MaskValue("PORT", "8080"))
    // Вывод: 8080

    // Нечувствительное длинное значение (>20 символов) → обрезается
    fmt.Println(env.MaskValue("DESCRIPTION", "this-is-a-very-long-description-value"))
    // Вывод: this-is-a-very-lo...
}
```

::: tip Зачем сохраняется длина
`[MASKED:N chars]` раскрывает длину значения, а не его содержимое. Это полезно при расследовании «был ли пароль обрезан» или «полный ли ключ», не раскрывая открытый текст.
:::

### MaskKey

```go
func MaskKey(key string) string
```

Маскирует само имя ключа для сценариев, где нужно показать наличие ключа, не раскрывая его смысл (внутренне вызывает `DefaultMaskKey`):

| Условие | Возвращаемое значение |
|---------|----------------------|
| `len(key) ≤ 3` | `***` |
| `len(key) > 3` | `key[:2] + "***"` |

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

func main() {
    fmt.Println(env.MaskKey("DB_PASSWORD")) // DB***
    fmt.Println(env.MaskKey("API_KEY"))     // AP***
    fmt.Println(env.MaskKey("TOKEN"))       // TO***
    fmt.Println(env.MaskKey("AB"))          // ***
    fmt.Println(env.MaskKey("XYZ"))         // *** (длина ≤ 3)
}
```

::: warning Сочетание с MaskValue
`MaskKey` берёт только первые 2 символа имени ключа, поэтому `DB_HOST` и `DB_PASSWORD` оба превращаются в `DB***`. Если нужно различать их в логах, выводите совместно с `MaskValue` или используйте `MaskKey` отдельно только когда имя ключа не имеет значения.
:::

### MaskSensitiveInString

```go
func MaskSensitiveInString(s string) string
```

Обрезает длинные строки, предотвращая вывод слишком большого объёма данных в логи (что может косвенно раскрыть информацию или переполнить логи):

| Условие | Возвращаемое значение |
|---------|----------------------|
| `len(s) > 50` | `s[:47] + "..."` |
| Иначе | Исходное значение |

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

func main() {
    long := "012345678901234567890123456789012345678901234567890123456789"
    fmt.Println(env.MaskSensitiveInString(long))
    // Вывод: 012345678901234567890123456789012345678901234567...

    short := "hello world"
    fmt.Println(env.MaskSensitiveInString(short))
    // Вывод: hello world
}
```

### SanitizeForLog

```go
func SanitizeForLog(s string) string
```

Сканирует строку на наличие шаблонов `key=value` и **целиком** заменяет `key=value` чувствительных ключей на `[MASKED]`, удаляя управляющие символы (сохраняя `\n` и `\t`). Подходит для обработки строк подключения, сообщений об ошибках и других инлайн-пар ключ-значение.

**Обнаруживаемые шаблоны присваивания:** `password=`, `secret=`, `token=`, `auth=`, `credential=`, `passphrase=`, `session=`, `cookie=`, `api_key=`, `apikey=`, `access_key=`, `secret_key=`, `private_key=`, `public_key=`, `encrypt_key=`, `decrypt_key=`, `signing_key=`, `ssn=`, `credit_card=`, `card_number=`, `cvv=`, `cvc=`, `mnemonic=`, `seed=`, `recovery=`, `wallet=`, `connection_string=`, `database_url=`, `db_password=`

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

func main() {
    fmt.Println(env.SanitizeForLog("user=admin password=s3cret"))
    // Вывод: user=admin [MASKED]

    fmt.Println(env.SanitizeForLog("token=abc123 host=localhost"))
    // Вывод: [MASKED] host=localhost

    // Все чувствительные значения маскируются
    fmt.Println(env.SanitizeForLog("user=pguser password=hunter2 api_key=sk_123"))
    // Вывод: user=pguser [MASKED] [MASKED]
}
```

::: tip Гранулярность замены
`SanitizeForLog` заменяет `password=s3cret` целиком на один `[MASKED]` (включая имя ключа), а не сохраняет `password=[MASKED]`. Таким образом, в логах не раскрывается даже информация «здесь есть пароль».
:::

### ClearBytes

```go
func ClearBytes(b []byte)
```

Обнуляет весь срез байтов. Используется для ручной очистки чувствительных данных, полученных через `Reveal()` и обрабатываемых в форме `[]byte`, чтобы избежать остатков открытого текста в памяти.

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

func main() {
    // Имитация чувствительных данных, обрабатываемых как []byte
    secret := []byte("secret123")
    fmt.Printf("До очистки: %s\n", secret)
    // Вывод: До очистки: secret123

    env.ClearBytes(secret)
    fmt.Printf("После очистки: %q\n", secret)
    // Вывод: После очистки: "\x00\x00\x00\x00\x00\x00\x00\x00\x00"
}
```

::: warning Ограничения ClearBytes
`ClearBytes` обнуляет только тот срез, который вы передаёте. Если одни и те же чувствительные данные копировались многократно (например, преобразование между string и []byte создаёт новые копии), эти копии не могут быть обнулены все сразу. Чувствительные данные следует минимизировать в копиях и использовать совместно с `Release()` / `Close()` [SecureValue](/ru/env/api-reference/secure-value).
:::

## Практический пример

Ниже демонстрируется безопасная печать конфигурации при запуске приложения и обработка сообщений об ошибках с инлайн-учётными данными — охватывая совместное использование `MaskValue`, `SanitizeForLog`, `IsSensitiveKey`, `MaskKey`:

```go
package main

import (
    "errors"
    "fmt"

    "github.com/cybergodev/env"
)

func main() {
    // Имитация конфигурации, загруженной из переменных окружения
    config := []struct{ key, value string }{
        {"PORT", "8080"},
        {"DB_HOST", "localhost"},
        {"DB_PASSWORD", "super-secret-pwd"},
        {"API_KEY", "sk_live_1234567890abcdef"},
    }

    fmt.Println("=== Конфигурация запуска (маскированная) ===")
    for _, c := range config {
        fmt.Printf("%-15s = %s\n", c.key, env.MaskValue(c.key, c.value))
    }

    fmt.Println("\n=== Логи ошибок (автомаскирование) ===")
    err := errors.New("failed to connect: user=admin password=hunter2 host=db.local")
    fmt.Println(env.SanitizeForLog(err.Error()))

    fmt.Println("\n=== Список чувствительных ключей (имена маскированы) ===")
    for _, c := range config {
        if env.IsSensitiveKey(c.key) {
            fmt.Printf("Чувствительная конфигурация: %s\n", env.MaskKey(c.key))
        }
    }
}
```

Вывод:

```text
=== Конфигурация запуска (маскированная) ===
PORT            = 8080
DB_HOST         = localhost
DB_PASSWORD     = [MASKED:16 chars]
API_KEY         = [MASKED:24 chars]

=== Логи ошибок (автомаскирование) ===
failed to connect: user=admin [MASKED] host=db.local

=== Список чувствительных ключей (имена маскированы) ===
Чувствительная конфигурация: DB***
Чувствительная конфигурация: AP***
```

## Отношение с SecureValue

Система безопасности env состоит из двух взаимодополняющих линий защиты:

| Линия защиты | Объект защиты | Инструменты |
|--------------|---------------|-------------|
| **Защита памяти** | Значения, находящиеся в памяти во время выполнения | `GetSecure` / `Reveal` / `Masked` / `Release` |
| **Маскирование вывода** | Значения, записываемые в логи, ошибки, отладочный вывод | `IsSensitiveKey` / `MaskValue` / `SanitizeForLog` и др. |

```go
// 1. Защита памяти: чтение через SecureValue
secret := env.GetSecure("API_KEY")
defer secret.Release()
key := secret.Reveal()

// 2. Маскирование вывода: скрытие при логировании
log.Printf("Подключение с %s", secret.Masked())
// Или ручное маскирование значений из любого источника (не только SecureValue)
log.Printf("Конфигурация %s", env.MaskValue("API_KEY", key))
```

::: tip Чёткое разделение
- `Masked()` SecureValue выводит форму вроде `[SECURE:32 bytes locked]`, предназначенную для значений, которыми она управляет.
- Функции маскирования (`MaskValue` и др.) применимы к значениям из **любого источника** — не только SecureValue, и не зависят от Loader.
:::

## Связанная документация

- [Обзор безопасности](/ru/env/security/) - общий обзор архитектуры безопасности
- [SecureValue API](/ru/env/api-reference/secure-value) - защита значений в памяти (включая `Masked` / `Reveal`)
- [Блокировка памяти](/ru/env/security/memory-locking) - предотвращение выгрузки чувствительных данных на диск
- [Контрольный список для продакшена](/ru/env/security/production-checklist) - проверка безопасности перед запуском
