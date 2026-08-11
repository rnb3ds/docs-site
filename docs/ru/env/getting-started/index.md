---
sidebar_label: "Быстрый старт"
title: "Быстрый старт - CyberGo env | руководство за 5 минут"
description: "Начало работы с CyberGo env за 5 минут: установка через go get, загрузка .env, типобезопасное чтение, безопасные значения GetSecure, маппинг структур, подстановка переменных и обработка ошибок через errors.Is, четыре пресета конфигурации и загрузка нескольких файлов для разных сред, с полными исполнимыми примерами кода."
sidebar_position: 1
---

# Быстрый старт

Начните работу с библиотекой env за 5 минут — от установки до практического использования.

## Установка

```bash
go get github.com/cybergodev/env
```

::: tip Требования
Go 1.25+
:::

## Создание файла .env

Создайте файл `.env` в корне проекта:

```bash
# Конфигурация базы данных
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=secret

# Конфигурация приложения
DEBUG=true
APP_NAME=myapp
LOG_LEVEL=info

# Множественные значения (через запятую)
ALLOWED_HOSTS=localhost,example.com,api.example.com
```

## Минимальное использование

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

func main() {
    // Загрузка .env файла и применение к системному окружению
    if err := env.Load(".env"); err != nil {
        panic(err)
    }

    // Получение переменных окружения
    host := env.GetString("DB_HOST", "localhost")
    port := env.GetInt("DB_PORT", 5432)

    fmt.Printf("Server: %s:%d\n", host, port)
}
```

::: tip Два режима использования

env предоставляет два способа использования:

| Режим | Использование | Сценарий |
|-------|---------------|----------|
| **Глобальный режим** | `env.Load()` + `env.GetString()` | Простые приложения, скрипты, быстрые прототипы |
| **Режим экземпляра** | `env.New()` + `loader.GetString()` | Множественные экземпляры, изоляция тестов, детальный контроль жизненного цикла |

Глобальный режим использует пакетные функции, внутри которых поддерживается одиночный Loader по умолчанию — после вызова `env.Load()` все `env.GetXxx()` автоматически используют этот экземпляр. Режим экземпляра создаёт независимый Loader через `env.New()`, что подходит для сценариев, где требуется изоляция или одновременное управление несколькими конфигурациями.

Примеры в этой документации по умолчанию используют глобальный режим; полное руководство по режиму экземпляра см. в разделе [Конфигурация нескольких сред](#Конфигурация-нескольких-сред).
:::

## Чтение значений — все типы

### Базовые типы

```go
// === Со значением по умолчанию ===

// Строка — если не найдено, возвращает значение по умолчанию "localhost"
host := env.GetString("HOST", "localhost")

// Целое число (int64) — если не найдено, возвращает значение по умолчанию 8080
port := env.GetInt("PORT", 8080)

// Логическое значение — если не найдено, возвращает значение по умолчанию false
debug := env.GetBool("DEBUG", false)

// Интервал времени — если не найдено, возвращает значение по умолчанию 30s
timeout := env.GetDuration("TIMEOUT", 30*time.Second)


// === Без значения по умолчанию ===

// Строка — если не найдено, возвращает пустую строку ""
host := env.GetString("HOST")

// Целое число (int64) — если не найдено, возвращает 0
port := env.GetInt("PORT")

// Логическое значение — если не найдено, возвращает false
debug := env.GetBool("DEBUG")

// Интервал времени — если не найдено, возвращает 0
timeout := env.GetDuration("TIMEOUT")
```

::: tip Разрешение ключей
Библиотека поддерживает несколько способов доступа к ключам:

```go
// JSON: {"app": {"name": "myapp"}}
// Хранится как: APP_NAME=myapp

// Все следующие способы получают значение
name := env.GetString("APP_NAME")      // Плоский ключ (рекомендуется)
name := env.GetString("app.name")      // Путь через точку (автопреобразование)
name := env.GetString("APP.NAME")      // Путь через точку в верхнем регистре
```

**Правила разрешения:**
1. **Точное совпадение**: сначала ищется точный ключ `KEY`
2. **Преобразование регистра**: для ключей в нижнем регистре пробуется версия в верхнем регистре `key` → `KEY`
3. **Разрешение пути**: путь через точку преобразуется в подчёркивание `app.name` → `APP_NAME`
:::

### Поддержка логических значений

`GetBool` поддерживает следующие значения (без учёта регистра):

| Истина | Ложь |
|--------|------|
| `true`, `1`, `yes`, `on`, `enabled` | `false`, `0`, `no`, `off`, `disabled` |

### Типы срезов

```go
// Срез строк
hosts := env.GetSlice[string]("HOSTS", []string{"localhost"})

// Срез целых чисел (поддержка int, int64, uint, uint64)
ports := env.GetSlice[int64]("PORTS", []int64{80, 443})
portsInt := env.GetSlice[int]("PORTS")  // также поддерживает int

// Срез чисел с плавающей точкой
rates := env.GetSlice[float64]("RATES", []float64{0.1, 0.2})

// Срез логических значений
flags := env.GetSlice[bool]("FLAGS", []bool{true, false})

// Срез Duration
timeouts := env.GetSlice[time.Duration]("TIMEOUTS")
```

**Порядок разбора:**
1. Сначала ищутся индексные ключи `KEY_0`, `KEY_1`, `KEY_2`...
2. Если индексных ключей нет, значение `KEY` разбивается по запятой

```go
// Способ 1: индексные ключи (рекомендуется)
// HOSTS_0=localhost
// HOSTS_1=example.com
hosts := env.GetSlice[string]("HOSTS")  // ["localhost", "example.com"]

// Способ 2: разделение запятой
// PORTS=80,443,8080
ports := env.GetSlice[int64]("PORTS")  // [80, 443, 8080]
```

### Проверка и поиск

```go
// Проверка существования ключа
value, exists := env.Lookup("API_KEY")
if !exists {
    // Ключ не существует
}

// Получение всех ключей
keys := env.Keys()

// Получение всех пар ключ-значение
all := env.All()

// Получение количества переменных
count := env.Len()
```

### Безопасные значения

```go
secret := env.GetSecure("API_KEY")
if secret != nil {
    defer secret.Release()

    // Получение исходного значения (вызывайте только при необходимости открытого текста — шифрование, вызовы API)
    value := secret.Reveal()

    // Использование маски в логах (предотвращает утечку)
    log.Printf("API Key: %s", secret.Masked())  // Вывод: [SECURE:32 bytes]
}
```

## Маппинг структур

Используйте теги для маппинга переменных окружения на структуру:

```go
package main

import (
    "fmt"
    "time"

    "github.com/cybergodev/env"
)

type Config struct {
    Host     string        `env:"DB_HOST" envDefault:"localhost"`
    Port     int64         `env:"DB_PORT" envDefault:"5432"`
    Password string        `env:"DB_PASSWORD"`
    Debug    bool          `env:"DEBUG" envDefault:"false"`
    Timeout  time.Duration `env:"TIMEOUT" envDefault:"30s"`
    Hosts    []string      `env:"ALLOWED_HOSTS"`
}

func main() {
    env.Load(".env")

    var cfg Config
    if err := env.ParseInto(&cfg); err != nil {
        panic(err)
    }

    fmt.Printf("%+v\n", cfg)
}
```

::: details Подробности
Руководство [Маппинг структур](/ru/env/guides/struct-mapping).
:::

## Пресеты конфигурации

Библиотека предоставляет четыре пресета для разных сценариев:

| Пресет | Назначение | Особенности |
|--------|------------|-------------|
| `DefaultConfig()` | Общие сценарии | Безопасные значения по умолчанию, подходит для большинства случаев |
| `DevelopmentConfig()` | Среда разработки | Мягкие ограничения, разрешает переопределение |
| `TestingConfig()` | Среда тестирования | Жёсткие ограничения, разрешает переопределение, подходит для модульных тестов |
| `ProductionConfig()` | Продакшн-среда | Строгая валидация + журнал аудита |

```go
// Среда разработки — мягкие ограничения
cfg := env.DevelopmentConfig()

// Среда тестирования — жёсткие ограничения
cfg := env.TestingConfig()

// Продакшн-среда — строгая валидация + журнал аудита
cfg := env.ProductionConfig()
```

### Подробное сравнение пресетов

| Функция | Default | Development | Testing | Production |
|---------|---------|-------------|---------|------------|
| Переопределение существующих переменных | ✗ | ✓ | ✓ | ✗ |
| Ошибка при отсутствии файла | ✗ | ✗ | ✗ | ✓ |
| Журнал аудита | ✗ | ✗ | ✗ | ✓ |
| Синтаксис YAML | ✗ | ✓ | ✗ | ✗ |
| Ограничение размера файла | 2MB | 10MB | 64KB | 64KB |
| Максимальное количество переменных | 500 | 500 | 50 | 50 |
| Проверка запрещённых ключей | ✓ | ✓ | ✓ | ✓ |
| Валидация значений | ✓ | ✓ | ✓ | ✓ |

::: tip Рекомендации по выбору
- **Среда разработки**: используйте `DevelopmentConfig()`, мягкие ограничения удобны для быстрой итерации
- **Среда тестирования**: используйте `TestingConfig()`, разрешает переопределение для изоляции тестов
- **Продакшн-среда**: используйте `ProductionConfig()`, включает аудит и строгую валидацию
:::

## Конфигурация нескольких сред

### Загрузка по среде

```go
// Определение файла конфигурации по среде
goEnv := os.Getenv("GO_ENV")
if goEnv == "" {
    goEnv = "development"
}

// Один вызов загружает все файлы конфигурации (по порядку, последующие переопределяют предыдущие)
env.Load(".env", ".env."+goEnv, ".env.local")
```

### Использование экземпляра Loader

Когда требуется больше контроля, используйте экземпляр Loader:

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

func main() {
    // Создание конфигурации
    cfg := env.ProductionConfig()
    cfg.RequiredKeys = []string{"DB_HOST", "API_KEY"}

    // Создание загрузчика
    loader, err := env.New(cfg)
    if err != nil {
        panic(err)
    }
    defer loader.Close()

    // Загрузка файлов (по порядку, последующие переопределяют предыдущие)
    if err := loader.LoadFiles(".env", ".env.production"); err != nil {
        panic(err)
    }

    // Валидация обязательных ключей
    if err := loader.Validate(); err != nil {
        panic(err)
    }

    // Использование
    host := loader.GetString("DB_HOST")
    fmt.Println("Host:", host)
}
```

## Несколько файлов и форматов

### Загрузка нескольких файлов

Загрузка по порядку, последующие переопределяют предыдущие:

::: code-group

```go [Пакетные функции]
env.Load(".env", "config.json", "config.yaml")
```

```go [Экземпляр Loader]
loader.LoadFiles(".env", ".env.local")
```

:::

### Поддержка нескольких форматов

Автоопределение формата файла:

```go
loader.LoadFiles("config.env", "settings.json", "secrets.yaml")
```

::: details Поддерживаемые форматы
| Формат | Расширение | Метод определения |
|--------|------------|-------------------|
| .env | `.env` | По расширению файла |
| JSON | `.json` | По расширению файла |
| YAML | `.yaml`, `.yml` | По расширению файла |
:::

## Обработка ошибок

```go
import "errors"

err := loader.LoadFiles(".env")
if err != nil {
    switch {
    case errors.Is(err, env.ErrFileNotFound):
        // Файл не существует
    case errors.Is(err, env.ErrFileTooLarge):
        // Файл слишком большой
    case errors.Is(err, env.ErrSecurityViolation):
        // Запрещённый ключ (фактически возвращает *SecurityError)
    default:
        // Другая ошибка
    }

    // Неверный формат ключа: фактически возвращает *ValidationError, Field=="key"
    var valErr *env.ValidationError
    if errors.As(err, &valErr) && valErr.Field == "key" {
        // Неверный формат ключа
    }
}
```

::: details Получение подробной информации об ошибках
```go
// Детали ошибки разбора
var parseErr *env.ParseError
if errors.As(err, &parseErr) {
    fmt.Printf("Файл %s строка %d: %v\n", parseErr.File, parseErr.Line, parseErr.Err)
}

// Детали файловой ошибки
var fileErr *env.FileError
if errors.As(err, &fileErr) {
    fmt.Printf("Файл %s операция %s не удалась: %v\n", fileErr.Path, fileErr.Op, fileErr.Err)
}

// Детали ошибки безопасности
var secErr *env.SecurityError
if errors.As(err, &secErr) {
    fmt.Printf("Ошибка безопасности: %s - %s\n", secErr.Action, secErr.Reason)
}
```
:::

## Следующие шаги

<div class="vp-features">

### Углублённое изучение
- [Маппинг структур](/ru/env/guides/struct-mapping) - детальная привязка конфигурации
- [Сериализация](/ru/env/guides/serialization) - сериализация и десериализация конфигурации
- [Многоформатная конфигурация](/ru/env/guides/multi-format) - подробно о JSON/YAML
- [Сценарии тестирования](/ru/env/guides/testing) - использование в тестах

### Справочник API
- [Функции пакета](/ru/env/api-reference/functions) - полный список пакетных функций
- [Loader API](/ru/env/api-reference/loader) - методы загрузчика
- [Config API](/ru/env/api-reference/config) - параметры конфигурации

### Безопасность
- [Обзор безопасности](/ru/env/security/) - архитектура безопасности и лучшие практики
- [SecureValue API](/ru/env/api-reference/secure-value) - обработка безопасных значений

</div>
