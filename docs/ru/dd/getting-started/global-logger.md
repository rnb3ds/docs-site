---
sidebar_label: "Глобальный Logger"
title: "Глобальный Logger - CyberGo DD | Руководство по использованию Logger по умолчанию"
description: "Паттерн глобального Logger в CyberGo DD: ленивая инициализация Default(), замена SetDefault(), InitDefault() с обработкой ошибок и выбор между функциями уровня пакета dd.Info() и методами экземпляра logger.Info()."
sidebar_position: 3
---

# Глобальный Logger

DD предоставляет глобальный Logger на уровне процесса. Все **вспомогательные функции уровня пакета** (`dd.Info()`, `dd.Errorf()` и т.д.) делегируют ему. Это простейший режим использования — начинайте логирование с нулевой конфигурацией.

## Сравнение двух режимов использования

| Режим | Пример кода | Сценарий использования |
|------|-------------|------------------------|
| **Глобальный Logger** | `dd.Info("hello")` | Скрипты, небольшие проекты, быстрое прототипирование |
| **Logger-экземпляр** | `logger, _ := dd.New(cfg); logger.Info("hello")` | Пользовательская конфигурация, несколько экземпляров Logger, DI |

Глобальный Logger по сути является singleton-объектом `*Logger`, защищённым `sync.Once`, который создаётся автоматически при первом обращении.

## Вспомогательные функции уровня пакета

Все стандартные методы логирования имеют аналоги уровня пакета, работающие с глобальным Logger:

```go
package main

import "github.com/cybergodev/dd"

func main() {
    // Базовое логирование
    dd.Debug("debug info")
    dd.Info("service started")
    dd.Warn("high memory usage")
    dd.Error("request failed")
    // dd.Fatal("fatal error")  // ⚠️ вызывает os.Exit(1)

    // Форматированное логирование
    dd.Infof("user %s logged in", username)

    // Структурированное логирование
    dd.InfoWith("request completed",
        dd.String("method", "GET"),
        dd.Int("status", 200),
    )

    // Цепочка Field
    dd.WithFields(dd.String("service", "api")).
        Info("service ready")

    // Управление уровнем
    dd.SetLevel(dd.LevelDebug)
    if dd.IsDebugEnabled() {
        dd.Debug("debug enabled")
    }
}
```

:::tip Подсказка Все функции уровня пакета
Базовые (`Debug/Info/Warn/Error/Fatal`), форматированные (`Debugf/Infof/...`), структурированные (`DebugWith/InfoWith/...`), универсальные по уровню (`Log/Logf/LogWith`), цепочки Field (`WithFields/WithField`), запросы уровня (`IsLevelEnabled/IsDebugEnabled/...`), сэмплирование (`SetSampling/GetSampling`), управление Writer (`AddWriter/RemoveWriter/WriterCount`), жизненный цикл (`Flush`).
:::

## Инициализация глобального Logger

### Default(): ленивая инициализация

`dd.Default()` возвращает глобальный Logger, создаваемый при первом вызове с `DefaultConfig()`:

```go
// Первый вызов → автосоздание (sync.Once обеспечивает потокобезопасность)
logger := dd.Default()
logger.Info("hello") // эквивалентно dd.Info("hello")
```

### InitDefault(): пользовательская конфигурация

Инициализируйте глобальный Logger с пользовательской конфигурацией при запуске:

```go
package main

import (
    "log"

    "github.com/cybergodev/dd"
)

func main() {
    cfg := dd.DefaultConfig()
    cfg.Level = dd.LevelDebug
    cfg.Format = dd.FormatJSON

    if err := dd.InitDefault(cfg); err != nil {
        log.Fatalf("failed to init logger: %v", err)
    }

    // Теперь все функции уровня пакета используют эту конфигурацию
    dd.Info("global Logger initialized")
}
```

:::warning Предупреждение InitDefault заменяет старый экземпляр
Если глобальный Logger уже существует (например, автосозданный через `Default()`), `InitDefault()` **закрывает старый экземпляр** и заменяет его. Старый экземпляр закрывается в фоновой goroutine с задержкой 100 мс, чтобы дать выполняющимся операциям записи завершиться.
:::

### SetDefault(): прямая замена

Замените глобальный Logger уже созданным экземпляром Logger:

```go
logger, _ := dd.New(dd.DevelopmentConfig())
dd.SetDefault(logger)

// Функции уровня пакета теперь используют новый Logger
dd.Info("using custom Logger")
```

## Обработка ошибок

При неудачной инициализации глобального Logger происходит откат к выводу в stderr (без паники). Узнать статус инициализации можно так:

```go
logger := dd.Default()

if err := dd.DefaultInitError(); err != nil {
    // Logger работает в режиме отката (вывод в stderr)
    log.Printf("warning: global Logger init failed: %v", err)
}

// Или получите Logger и ошибку одновременно
logger, err := dd.DefaultWithErr()
if err != nil {
    log.Printf("fallback mode: %v", err)
}
```

## Использование вместе с Logger-экземплярами

Глобальный Logger и Logger-экземпляры могут сосуществовать. Распространённый паттерн — инициализация глобального Logger в `main` с использованием интерфейсов для DI:

```go
// main.go
func main() {
    cfg := dd.DefaultConfig()
    cfg.Format = dd.FormatJSON
    _ = dd.InitDefault(cfg)
    defer dd.Flush()
}

// service.go — используем интерфейс для тестируемости
type Service struct {
    logger dd.LogProvider // интерфейс, можно замокать
}

func NewService(logger dd.LogProvider) *Service {
    return &Service{logger: logger}
}

// Создание Service с глобальным Logger
svc := NewService(dd.Default())
```

:::tip Подсказка Рекомендуемый интерфейс для DI
`dd.LogProvider` — наиболее полный интерфейс логирования для внедрения зависимостей. Более компактные интерфейсы: `dd.CoreLogger` (только методы логирования), `dd.LevelLogger` (+ управление уровнем), `dd.ConfigurableLogger` (+ конфигурация и жизненный цикл). См. [Интерфейсы](../api-reference/core/interfaces).
:::

## Следующие шаги

- [Конфигурация](../guides/basics/configuration) -- Полный справочник по полям Config
- [Шпаргалка](./cheatsheet) -- Краткий справочник по частым API
- [Интерфейсы](../api-reference/core/interfaces) -- Иерархия интерфейсов Logger
