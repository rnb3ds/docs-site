---
sidebar_label: "Блокировка памяти"
title: "Блокировка памяти - CyberGo env | защита памяти mlock"
description: "Руководство по блокировке памяти CyberGo env: включение через SetMemoryLockEnabled, проверка IsMemoryLockSupported, режим SetMemoryLockStrict и обработка ошибок NewSecureValueStrict, охватывая Linux CAP_IPC_LOCK, права Windows VirtualLock и управление жизненным циклом SecureValue."
sidebar_position: 3
---

# Блокировка памяти

Блокировка памяти (mlock / VirtualLock) предотвращает выгрузку чувствительных данных на диск и является одной из ключевых линий защиты системы безопасности SecureValue.

## Зачем нужна блокировка памяти

В обычных условиях операционная система выгружает неактивные страницы памяти на диск (swap file / page file). Это означает, что даже если вы вызовете `ClearBytes` для обнуления памяти, на диске могут остаться остаточные копии чувствительных данных.

```
Память (RAM)                    Диск (Swap/Page File)
┌──────────────┐                ┌──────────────┐
│ API_KEY=xxx  │ ── свопинг ──→ │ API_KEY=xxx  │ ← остаток!
│              │                │ (даже после   │
│              │ ←─ чтение ──   │  обнуления    │
└──────────────┘                │  всё ещё тут) │
                                └──────────────┘
```

После включения блокировки памяти ОС гарантирует, что эти страницы памяти **не будут выгружены**:

```
Память (RAM)                    Диск (Swap/Page File)
┌──────────────┐                ┌──────────────┐
│ API_KEY=xxx  │ ╳ нельзя ╳     │              │
│ 🔒 mlock     │   выгружать    │ (нет остатка) │
└──────────────┘                └──────────────┘
```

## Поддержка платформ

| Платформа | Системный вызов | Статус поддержки |
|-----------|-----------------|:----------------:|
| Linux | `mlock(2)` / `munlock(2)` | ✅ |
| macOS | `mlock(2)` / `munlock(2)` | ✅ |
| FreeBSD | `mlock(2)` / `munlock(2)` | ✅ |
| Windows | `VirtualLock` / `VirtualUnlock` | ✅ |
| wasm/nacl | Неприменимо | ❌ |

Проверка во время выполнения:

```go
if env.IsMemoryLockSupported() {
    fmt.Println("Текущая платформа поддерживает блокировку памяти")
} else {
    fmt.Println("Текущая платформа не поддерживает блокировку памяти (например wasm)")
}
```

## Требования к правам

Блокировка памяти затрагивает системные ограничения ресурсов; разные платформы требуют разные права.

### Linux

Требуется способность `CAP_IPC_LOCK`:

```bash
# Способ 1: через setcap для бинарного файла
sudo setcap cap_ipc_lock=ep ./myapp

# Способ 2: через systemd-сервис
# /etc/systemd/system/myapp.service
[Service]
CapabilityBoundingSet=CAP_IPC_LOCK
AmbientCapabilities=CAP_IPC_LOCK

# Способ 3: настройка ulimit (RLIMIT_MEMLOCK)
# /etc/security/limits.conf
*    soft    memlock    unlimited
*    hard    memlock    unlimited
```

### macOS / FreeBSD

Обычно не требуют специальных прав, но ограничены `ulimit -l` (максимальная блокируемая память).

### Windows

Требуется право `SeLockMemoryPrivilege`:

```
Групповая политика → Конфигурация компьютера → Конфигурация Windows →
Параметры безопасности → Локальные политики → Назначение прав пользователя →
«Блокировка страниц в памяти»
```

::: warning Поведение без прав
В режиме по умолчанию неудача блокировки памяти **молча игнорируется** — SecureValue остаётся usable, но данные не заблокированы. Для гарантии успешной блокировки используйте строгий режим.
:::

## Базовое использование

### Включение блокировки памяти

Вызывайте при запуске приложения, до создания любого SecureValue:

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

func main() {
    // Проверка поддержки платформой
    if !env.IsMemoryLockSupported() {
        fmt.Println("Предупреждение: текущая платформа не поддерживает блокировку памяти")
    }

    // Глобальное включение блокировки памяти
    env.SetMemoryLockEnabled(true)

    // Загрузка конфигурации
    if err := env.Load(".env"); err != nil {
        panic(err)
    }

    // Все последующие SecureValue будут пытаться заблокировать память
    secret := env.GetSecure("API_KEY")
    if secret != nil {
        defer secret.Release()
        fmt.Println(secret.Masked()) // [SECURE:32 bytes locked]
    }
}
```

### Проверка состояния блокировки

```go
sv := env.GetSecure("DB_PASSWORD")
defer sv.Release()

// Проверка, заблокировано ли
if sv.IsMemoryLocked() {
    fmt.Println("Память заблокирована, не будет выгружена на диск")
} else {
    fmt.Println("Память не заблокирована")
}

// Просмотр ошибки блокировки (если есть)
if err := sv.MemoryLockError(); err != nil {
    fmt.Printf("Ошибка блокировки: %v\n", err)
}
```

## Строгий режим

В режиме по умолчанию неудача блокировки молча игнорируется. Строгий режим делает неудачи наблюдаемыми:

### Включение строгого режима

```go
env.SetMemoryLockEnabled(true)
env.SetMemoryLockStrict(true)

// После этого при неудаче блокировки выводится в стандартный лог:
// env: memory lock failed in strict mode: operation not permitted
```

### Явная обработка ошибок

Используйте `NewSecureValueStrict` для получения ошибки блокировки при создании:

```go
env.SetMemoryLockEnabled(true)
env.SetMemoryLockStrict(true)

sv, err := env.NewSecureValueStrict("my-api-key")
if err != nil {
    // Блокировка памяти не удалась
    // SecureValue всё ещё действителен, но данные не защищены блокировкой
    log.Printf("Предупреждение безопасности: блокировка памяти не удалась: %v", err)
}
defer sv.Release()

// Обычное использование
fmt.Println(sv.Masked())
```

::: tip Поведение строгого режима
В строгом режиме неудача блокировки вызывает callback `onStrictLockFailure` (по умолчанию вывод в stderr). SecureValue остаётся всегда usable — строгий режим лишь делает неудачу блокировки **наблюдаемой**, а не блокирует использование.
:::

## Вывод Masked и состояние блокировки

Метод `Masked()` включает информацию о состоянии блокировки в выводе:

```go
env.SetMemoryLockEnabled(true)

sv := env.GetSecure("API_KEY")
defer sv.Release()

fmt.Println(sv.Masked())
// Успешная блокировка:   [SECURE:32 bytes locked]
// Неудача блокировки:    [SECURE:32 bytes lock-failed]
// Блокировка отключена:  [SECURE:32 bytes]
// Закрыто:               [CLOSED]
```

## Полный продакшн-пример

```go
package main

import (
    "log"
    "os"

    "github.com/cybergodev/env"
)

func main() {
    // ── Инициализация конфигурации безопасности ──

    if env.IsMemoryLockSupported() {
        env.SetMemoryLockEnabled(true)
        env.SetMemoryLockStrict(true) // В продакшене включаем строгий режим
        log.Println("Блокировка памяти включена (строгий режим)")
    } else {
        log.Println("Предупреждение: платформа не поддерживает блокировку памяти")
    }

    // ── Загрузка конфигурации ──

    cfg := env.ProductionConfig()
    cfg.RequiredKeys = []string{"DB_PASSWORD", "API_KEY"}
    cfg.AutoApply = true

    loader, err := env.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer loader.Close()

    if err := loader.LoadFiles(".env"); err != nil {
        log.Fatal(err)
    }

    // ── Безопасный доступ к чувствительным значениям ──

    dbPassword := loader.GetSecure("DB_PASSWORD")
    if dbPassword == nil {
        log.Fatal("DB_PASSWORD not found")
    }
    defer dbPassword.Release()

    // Проверка состояния блокировки
    if !dbPassword.IsMemoryLocked() {
        log.Printf("Предупреждение безопасности: DB_PASSWORD не заблокирован")
        if err := dbPassword.MemoryLockError(); err != nil {
            log.Printf("Причина: %v", err)
        }
    }

    // Получение открытого текста только при необходимости
    password := dbPassword.Reveal()
    _ = password // Используется для подключения к БД и т. д.

    // Безопасное логирование (без утечки открытого текста)
    log.Printf("Пароль базы данных: %s", dbPassword.Masked())
    // Вывод: Пароль базы данных: [SECURE:12 bytes locked]

    _ = os.Stdout
}
```

## Лучшие практики

### Своевременное освобождение

Блокировка памяти увеличивает давление на память (не может быть выгружена), поэтому освобождайте сразу после использования:

```go
// ✅ Рекомендуется: освободить сразу после использования
sv := env.GetSecure("API_KEY")
defer sv.Release()
value := sv.Reveal()
// Использование value...
// При срабатывании defer автоматически: обнуление + разблокировка + возврат в пул объектов

// ❌ Избегать: длительное удержание
var globalSecret *env.SecureValue // Не рекомендуется
```

### Небольшие и короткоживущие

Блокировка больших объёмов памяти влияет на производительность системы. Каждый SecureValue должен хранить только необходимые чувствительные значения (пароли, ключи, токены), а не целые блоки конфигурации.

### Предпочитайте Release вместо Close

```go
sv := env.GetSecure("TOKEN")

// ✅ Release: обнуление + разблокировка + возврат в пул объектов (рекомендуется)
defer sv.Release()

// Close тоже можно, но не возвращает в пул объектов
// defer sv.Close()
```

## Устранение неполадок

| Проблема | Возможная причина | Решение |
|----------|-------------------|---------|
| `lock-failed` в выводе Masked | Недостаточно прав | Настройте `CAP_IPC_LOCK` (Linux) или `SeLockMemoryPrivilege` (Windows) |
| Спам в логах строгого режима | Неудача блокировки при массовом создании SecureValue | Проверьте системные ограничения `RLIMIT_MEMLOCK` или используйте нестрогий режим |
| `IsMemoryLockSupported()` возвращает false | Платформа wasm/nacl | Эти платформы не поддерживают блокировку памяти, используйте другие меры безопасности (например шифрованное хранение) |
| Рост использования памяти | Заблокированные страницы не могут быть выгружены | Уменьшите время удержания SecureValue, своевременно вызывайте Release |

## Связанная документация

- [Обзор безопасности](/ru/env/security/) - общий обзор архитектуры безопасности
- [SecureValue API](/ru/env/api-reference/secure-value) - полный API безопасных значений (включая функции блокировки памяти)
- [Оптимизация производительности](/ru/env/advanced/performance) - анализ накладных расходов блокировки памяти
- [Контрольный список для продакшена](/ru/env/security/production-checklist) - проверка безопасности перед запуском
