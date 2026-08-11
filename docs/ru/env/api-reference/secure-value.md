---
sidebar_label: "SecureValue"
title: "SecureValue API - CyberGo env | безопасное хранение значений"
description: "Справочник API SecureValue CyberGo env: создание NewSecureValue, блокировка памяти mlock, чтение открытого текста Reveal, маскировка Masked, очистка Release, обнаружение IsSensitiveKey — для безопасного хранения паролей, токенов и ключей."
sidebar_position: 5
---

# SecureValue API

Тип `SecureValue` используется для безопасного хранения чувствительных данных, предоставляя блокировку памяти, автоочистку и маскирование.

## Потокобезопасность

Все методы `SecureValue` потокобезопасны и могут использоваться конкурентно из нескольких goroutine:

- **Методы чтения** (`String()`, `Bytes()`, `Length()`, `Masked()`) используют блокировку чтения, поддерживая конкурентное чтение
- **Методы закрытия** (`Close()`, `Release()`) используют блокировку записи, обеспечивая безопасное обнуление
- **Проверка состояния** (`IsClosed()`, `IsMemoryLocked()`) использует атомарные операции

```go
secret := env.GetSecure("API_KEY")
if secret != nil {
    defer secret.Release()

    // Безопасное конкурентное чтение
    go func() { fmt.Println(secret.Masked()) }()
    go func() { fmt.Println(secret.Length()) }()
}
```

::: warning Внимание
`Close()` и `Release()` должны вызываться только один раз. Повторные вызовы безопасны, но неэффективны.
:::

## Создание

### NewSecureValue

```go
func NewSecureValue(value string) *SecureValue
```

Создаёт обёртку безопасного значения.

**Параметры:**
- `value` - строковое значение для защиты

**Возвращает:**
- `*SecureValue` - объект безопасного значения

**Поведение:**
- Использует пул объектов для уменьшения аллокаций
- Устанавливает GC-финализатор для автоочистки
- Если блокировка памяти включена, пытается заблокировать память (при неудаче молча игнорирует)

```go
secret := env.NewSecureValue("my-secret-password")
defer secret.Release()  // или Close()
```

---

### NewSecureValueStrict

```go
func NewSecureValueStrict(value string) (*SecureValue, error)
```

Создаёт безопасное значение; возвращает ошибку при неудаче блокировки памяти.

**Параметры:**
- `value` - строковое значение для защиты

**Возвращает:**
- `*SecureValue` - объект безопасного значения
- `error` - ошибка блокировки памяти (только в строгом режиме)

```go
env.SetMemoryLockEnabled(true)
env.SetMemoryLockStrict(true)

secret, err := env.NewSecureValueStrict("my-secret")
if err != nil {
    // Блокировка памяти не удалась
    log.Printf("Warning: %v", err)
}
if secret != nil {
    defer secret.Release()
}
```

---

### GetSecure (метод Loader)

```go
func (l *Loader) GetSecure(key string) *SecureValue
```

Получает безопасное значение из загрузчика.

**Параметры:**
- `key` - имя ключа

**Возвращает:**
- `*SecureValue` - **оборонительная копия** безопасного значения; вызывающий отвечает за освобождение; возвращает nil, если ключ не существует или загрузчик закрыт

```go
secret := loader.GetSecure("API_KEY")
if secret != nil {
    defer secret.Release()
    // Использование secret
}
```

::: tip Оборонительная копия
`GetSecure` возвращает копию исходного значения, независимую от родительского Loader. Вызывающий отвечает за вызов `Release()` или `Close()` для освобождения.
:::

---

## Методы

### String

```go
func (sv *SecureValue) String() string
```

Возвращает маскированное представление, безопасное для логов и форматирования. Реализует интерфейс `fmt.Stringer`, предотвращая случайную утечку секрета через `fmt.Printf`, `log.Println` или обёртку ошибок.

**Возвращает:**
- `string` - маскированное представление (например `[SECURE:32 bytes]`), для nil возвращает `[NIL]`

```go
secret := env.GetSecure("PASSWORD")
if secret != nil {
    log.Printf("Password: %s", secret)  // Безопасно, выводится маскированное представление
    // Эквивалентно log.Printf("Password: %s", secret.Masked())
}
```

::: warning Внимание
`String()` возвращает **маскированное представление**, а не открытый текст. Для получения открытого текста используйте `Reveal()`.
:::

---

### Reveal

```go
func (sv *SecureValue) Reveal() string
```

Возвращает значение в открытом виде. Вызывающий отвечает за безопасную обработку возвращённой строки — избегайте логирования, сериализации или сохранения в постоянное хранилище. Используйте только когда необходимо фактическое значение для криптографических операций, вызовов API или аналогичной безопасной обработки.

**Возвращает:**
- `string` - значение в открытом виде; для закрытого или nil возвращает пустую строку

```go
secret := env.GetSecure("API_KEY")
if secret != nil {
    defer secret.Release()
    plaintext := secret.Reveal()  // Получение открытого текста
    // Использование plaintext для вызовов API и других безопасных операций
    _ = plaintext
}
```

::: danger Опасность
`Reveal()` возвращает **строку в открытом виде**. Строки Go неизменяемы и не могут быть обнулены вручную. Используйте только при необходимости и избегайте логирования или хранения возвращённого значения.
:::

---

### Bytes

```go
func (sv *SecureValue) Bytes() []byte
```

Возвращает копию значения в виде среза байтов. Вызывающий отвечает за обнуление через `ClearBytes`.

**Возвращает:**
- `[]byte` - байтовая копия значения; для закрытого возвращает nil

```go
secret := env.GetSecure("API_KEY")
if secret != nil {
    data := secret.Bytes()
    defer env.ClearBytes(data)  // Обнуление после использования
    // Использование data
}
```

---

### Length

```go
func (sv *SecureValue) Length() int
```

Возвращает длину значения, не раскрывая содержимое.

**Возвращает:**
- `int` - длина значения; для закрытого возвращает 0

```go
secret := env.GetSecure("API_KEY")
if secret != nil {
    fmt.Printf("API Key length: %d\n", secret.Length())
}
```

---

### Masked

```go
func (sv *SecureValue) Masked() string
```

Возвращает маскированное значение для вывода в лог.

**Возвращает:**
- `string` - маскированное представление

**Форматы вывода:**
- Закрыто: `[CLOSED]`
- Пустое значение: `[SECURE:0 bytes]`
- Нормальное: `[SECURE:N bytes]` или `[SECURE:N bytes locked]` или `[SECURE:N bytes lock-failed]` или `[SECURE:N bytes unlocked]`

```go
secret := env.GetSecure("API_KEY")
if secret != nil {
    log.Printf("API Key: %s", secret.Masked())
    // Вывод: API Key: [SECURE:32 bytes]
    // Примечание: маска добавляет суффикс " locked" только при включённой блокировке
    // памяти (SetMemoryLockEnabled(true)) и успешной блокировке
    // (также возможны " lock-failed" / " unlocked")
}
```

---

### MarshalJSON

```go
func (sv *SecureValue) MarshalJSON() ([]byte, error)
```

Реализует интерфейс `json.Marshaler`. Возвращает маскированное представление, предотвращая случайную утечку секрета через основанные на отражении сериализаторы вроде `json.Marshal`. Открытый текст никогда не появится в JSON-выводе.

**Возвращает:**
- `[]byte` - JSON-безопасная маскированная строка (например `"[SECURE:32 bytes]"`), для nil возвращает `"null"`
- `error` - всегда возвращает nil

```go
type Response struct {
    APIKey *env.SecureValue `json:"api_key"`
}

resp := Response{APIKey: env.NewSecureValue("sk-1234567890")}
data, _ := json.Marshal(resp)
// {"api_key":"[SECURE:16 bytes]"}
// Открытый текст не появится в выводе
```

::: tip Безопасный дизайн
`MarshalJSON` гарантирует, что даже при встраивании `SecureValue` в структуру и JSON-сериализации открытый текст не утечёт. Вывод согласуется с `String()` / `Masked()`.
:::

---

### MarshalText

```go
func (sv *SecureValue) MarshalText() ([]byte, error)
```

Реализует интерфейс `encoding.TextMarshaler`. Возвращает маскированное представление, согласованное с `String()`, предотвращая случайную утечку секрета через текстовые кодировщики вроде `encoding/xml`, `text/template`, структурированные логи.

**Возвращает:**
- `[]byte` - маскированная строка (например `"[SECURE:32 bytes]"`), для nil возвращает `"[NIL]"`
- `error` - всегда возвращает nil

```go
type Config struct {
    Token *env.SecureValue `xml:"token"`
}

cfg := Config{Token: env.NewSecureValue("Bearer xyz")}
data, _ := xml.Marshal(cfg)
// <Config><token>[SECURE:10 bytes]</token></Config>
```

---

### Close

```go
func (sv *SecureValue) Close() error
```

Безопасно обнуляет память и закрывает объект.

**Возвращает:**
- `error` - всегда возвращает nil

**Поведение:**
- Безопасно обнуляет внутренние данные
- Помечает как закрытый
- **Не** возвращает в пул объектов

```go
secret := env.GetSecure("TOKEN")
if secret != nil {
    defer secret.Close()
    // После Close память обнуляется
}
```

---

### Release

```go
func (sv *SecureValue) Release()
```

Обнуляет память и возвращает объект в пул.

**Поведение:**
- Безопасно обнуляет внутренние данные
- Очищает GC-финализатор
- Возвращает в пул объектов для переиспользования

```go
secret := env.GetSecure("KEY")
if secret != nil {
    defer secret.Release()
    // После Release память обнуляется, а объект возвращается в пул
}
```

::: tip Close против Release
- `Close()` - только обнуляет, не возвращает в пул
- `Release()` - обнуляет и возвращает в пул (рекомендуется для высокочастотных сценариев)
:::

---

### IsClosed

```go
func (sv *SecureValue) IsClosed() bool
```

Проверяет, закрыт ли объект.

**Возвращает:**
- `bool` - закрыт ли

```go
if secret.IsClosed() {
    // Объект закрыт, использовать нельзя
}
```

---

### IsMemoryLocked

```go
func (sv *SecureValue) IsMemoryLocked() bool
```

Проверяет, заблокирована ли память (предотвращая выгрузку на диск).

**Возвращает:**
- `bool` - заблокирована ли

```go
if secret.IsMemoryLocked() {
    fmt.Println("Memory is locked, protected from swapping")
}
```

---

### MemoryLockError

```go
func (sv *SecureValue) MemoryLockError() error
```

Возвращает ошибку попытки блокировки памяти (если есть).

**Возвращает:**
- `error` - ошибка блокировки; возвращает nil при успехе или если попытки не было

```go
if err := secret.MemoryLockError(); err != nil {
    log.Printf("Memory lock failed: %v", err)
}
```

---

## Конфигурация блокировки памяти

### SetMemoryLockEnabled

```go
func SetMemoryLockEnabled(enabled bool)
```

Глобально включает/отключает блокировку памяти. Влияет на все вновь создаваемые SecureValue.

**Параметры:**
- `enabled` - включать ли

```go
package main

import "github.com/cybergodev/env"

func main() {
    // Включение при запуске приложения
    env.SetMemoryLockEnabled(true)

    // Все последующие SecureValue будут пытаться заблокировать
}
```

---

### IsMemoryLockEnabled

```go
func IsMemoryLockEnabled() bool
```

Проверяет, включена ли блокировка памяти.

**Возвращает:**
- `bool` - включена ли

```go
if env.IsMemoryLockEnabled() {
    // Блокировка памяти включена
}
```

---

### SetMemoryLockStrict

```go
func SetMemoryLockStrict(strict bool)
```

Устанавливает строгий режим. При включении `NewSecureValueStrict` возвращает ошибку при неудаче блокировки.

**Параметры:**
- `strict` - включать ли строгий режим

```go
env.SetMemoryLockEnabled(true)
env.SetMemoryLockStrict(true)

secret, err := env.NewSecureValueStrict("sensitive-data")
if err != nil {
    // Блокировка не удалась
}
```

---

### IsMemoryLockStrict

```go
func IsMemoryLockStrict() bool
```

Проверяет, включён ли строгий режим.

**Возвращает:**
- `bool` - включён ли

```go
strict := env.IsMemoryLockStrict()
```

---

### IsMemoryLockSupported

```go
func IsMemoryLockSupported() bool
```

Проверяет, поддерживает ли текущая платформа блокировку памяти.

**Возвращает:**
- `bool` - поддерживается ли

| Платформа | Поддержка |
|-----------|-----------|
| Linux | ✅ |
| macOS | ✅ |
| Windows | ✅ |
| FreeBSD | ✅ |
| wasm | ❌ |

::: warning Внимание
Возврат `true` означает только поддержку платформой, а не наличие у процесса достаточных прав. Linux требует `CAP_IPC_LOCK` или root-прав.
:::

```go
if env.IsMemoryLockSupported() {
    env.SetMemoryLockEnabled(true)
}
```

---

## Функции инструментов безопасности

### ClearBytes

```go
func ClearBytes(b []byte)
```

Безопасно обнуляет срез байтов. Немедленно обнуляйте чувствительные данные после использования.

**Параметры:**
- `b` - срез байтов для обнуления

```go
sensitive := []byte("secret-data")
// Использование...
env.ClearBytes(sensitive)
// sensitive теперь все 0
```

---

### IsSensitiveKey

```go
func IsSensitiveKey(key string) bool
```

Проверяет, соответствует ли имя ключа чувствительным шаблонам.

**Параметры:**
- `key` - имя ключа

**Возвращает:**
- `bool` - является ли чувствительным

```go
if env.IsSensitiveKey("DB_PASSWORD") {
    // Чувствительный ключ, обрабатывайте безопасно
    secret := env.GetSecure("DB_PASSWORD")
    if secret != nil {
        defer secret.Release()
    }
}
```

**Чувствительные шаблоны:** password, secret, token, key, api_key, credential и т. д.

---

### MaskValue

```go
func MaskValue(key, value string) string
```

Возвращает маскированное значение в зависимости от чувствительности ключа.

**Параметры:**
- `key` - имя ключа
- `value` - исходное значение

**Возвращает:**
- `string` - маскированное значение

```go
// Чувствительный ключ — возвращает формат [MASKED:N chars]
masked := env.MaskValue("API_KEY", "secret123")
// Возвращает: [MASKED:9 chars]

// Нечувствительный ключ — возвращает исходное значение (обрезается, если > 20 символов)
masked := env.MaskValue("APP_NAME", "myapp")
// Возвращает: myapp
```

---

### MaskKey

```go
func MaskKey(key string) string
```

Маскирует имя ключа для логов.

**Параметры:**
- `key` - имя ключа

**Возвращает:**
- `string` - маскированное имя ключа

```go
masked := env.MaskKey("DB_PASSWORD")
// Возвращает: DB***
```

---

### SanitizeForLog

```go
func SanitizeForLog(s string) string
```

Очищает строкoку от информации о чувствительных парах ключ-значение. Автоматически обнаруживает и маскирует чувствительные значения в формате `key=value`.

**Параметры:**
- `s` - исходная строка

**Возвращает:**
- `string` - очищенная строка

```go
// Автоматическое маскирование чувствительных пар ключ-значение
msg := "Connected with password=secret123 api_key=abc123"
clean := env.SanitizeForLog(msg)
// Возвращает: "Connected with password=[MASKED] api_key=[MASKED]"
```

---

### MaskSensitiveInString

```go
func MaskSensitiveInString(s string) string
```

Маскирует потенциально чувствительное содержимое в строке. Обрезает строки длиннее 50 символов.

**Параметры:**
- `s` - исходная строка

**Возвращает:**
- `string` - маскированная строка

```go
// Длинные строки будут обрезаны (сохраняются первые 47 символов и добавляется "...")
long := "This is a very long string that exceeds 50 characters"
clean := env.MaskSensitiveInString(long)
// Возвращает: "This is a very long string that exceeds 50 char..."
```

::: tip Сценарий использования
Используется для обрезки длинных строк, которые могут содержать чувствительные данные. Для автоматического маскирования чувствительных пар ключ-значение используйте `SanitizeForLog`.
:::

---

## Полный пример

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/env"
)

func main() {
    // Проверка и включение блокировки памяти
    if env.IsMemoryLockSupported() {
        env.SetMemoryLockEnabled(true)
        fmt.Println("Memory locking enabled")
    }

    // Загрузка переменных окружения
    if err := env.Load(".env"); err != nil {
        log.Printf("Warning: %v", err)
    }

    // Безопасное получение чувствительного значения
    apiKey := env.GetSecure("API_KEY")
    if apiKey == nil {
        log.Fatal("API_KEY not found")
    }
    defer apiKey.Release()

    // Безопасное использование
    fmt.Printf("API Key length: %d\n", apiKey.Length())
    fmt.Printf("API Key (masked): %s\n", apiKey.Masked())

    // Проверка состояния блокировки памяти
    if apiKey.IsMemoryLocked() {
        fmt.Println("Memory is locked")
    }

    // Проверка ошибки блокировки
    if err := apiKey.MemoryLockError(); err != nil {
        fmt.Printf("Memory lock warning: %v\n", err)
    }

    // Передача в другую функцию
    connectAPI(apiKey.Reveal())

    // Использование функций инструментов безопасности
    logMessage := "Processing with API_KEY=secret"
    safeMessage := env.SanitizeForLog(logMessage)
    fmt.Println(safeMessage)  // Processing with API_KEY=[MASKED]
}

func connectAPI(key string) {
    // Подключение с использованием ключа...
    fmt.Printf("Connecting with key of length %d\n", len(key))
}
```

---

## Внутренняя реализация

### Пул объектов

`SecureValue` использует `sync.Pool` для уменьшения аллокаций памяти:

```go
var secureValuePool = sync.Pool{
    New: func() interface{} {
        return &SecureValue{}
    },
}
```

### GC-финализатор

При создании устанавливается GC-финализатор, обеспечивающий автоочистку при сборке мусора:

```go
runtime.SetFinalizer(sv, (*SecureValue).finalize)
```

### Безопасное обнуление

Использует `unsafe.Pointer` для предотвращения оптимизаций компилятора (должно вызываться при удержании блокировки `sv.mu`):

```go
func (sv *SecureValue) clearDataLocked() {
    if len(sv.data) == 0 {
        return
    }
    // Разблокировка памяти (если заблокирована)
    if sv.locked {
        internal.UnlockMemory(sv.data)
        sv.locked = false
    }
    dataPtr := unsafe.Pointer(&sv.data[0])
    for i := range sv.data {
        *(*byte)(unsafe.Pointer(uintptr(dataPtr) + uintptr(i))) = 0
    }
    runtime.KeepAlive(sv.data)
    sv.data = nil
    sv.lockErr = nil
}
```

---

## Связанная документация

- [Константы и ошибки](/ru/env/api-reference/constants) - запрещённые ключи, шаблоны чувствительных ключей, типы ошибок
- [Обзор безопасности](/ru/env/security/) - архитектура безопасности и ключевые особенности
- [Контрольный список для продакшена](/ru/env/security/production-checklist) - проверка безопасности перед запуском
- [Loader API](/ru/env/api-reference/loader) - метод GetSecure
