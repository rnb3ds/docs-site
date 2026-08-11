---
sidebar_label: "Loader"
title: "Loader API - CyberGo env | подробности загрузчика"
description: "Справочник API загрузчика Loader CyberGo env: основной тип обеспечивает мультиформатную загрузку LoadFiles, типобезопасное чтение GetString/GetInt/GetSlice, добавление/удаление Set/Delete, валидацию Validate, экспорт сериализации и управление жизненным циклом Close, все методы потокобезопасны."
sidebar_position: 3
---

# Loader API

Полный справочник по методам типа `Loader`. Loader — основной тип библиотеки env, предоставляющий функции загрузки, хранения и доступа к переменным окружения.

::: tip Потокобезопасность
Все методы Loader потокобезопасны и могут вызываться конкурентно из нескольких goroutine.
:::

## Определение типа

```go
type Loader struct {
    // содержит приватные поля
}

// Проверка реализации интерфейса во время компиляции
var _ EnvLoader = (*Loader)(nil)
var _ io.Closer = (*Loader)(nil)
```

---

## Создание

### New

```go
func New(cfg ...Config) (*Loader, error)
```

Создаёт новый экземпляр загрузчика.

**Параметры:**
- `cfg` - необязательные параметры конфигурации. Если не переданы или передана нулевая Config, автоматически используется `DefaultConfig()`

**Возвращает:**
- `*Loader` - экземпляр загрузчика
- `error` - ошибка валидации конфигурации

**Поведение:**
- Проверяет валидность конфигурации
- Создаёт внутренние компоненты (валидатор, аудитор, раскрыватель)
- Если `cfg.Filenames` не пусто, автоматически загружает файлы
- Если `cfg.AutoApply` равно true, автоматически применяется к системному окружению

```go
// С конфигурацией по умолчанию
loader, err := env.New()

// С пользовательской конфигурацией
cfg := env.DefaultConfig()
cfg.Filenames = []string{".env"}
cfg.AutoApply = true
loader, err := env.New(cfg)

if err != nil {
    panic(err)
}
defer loader.Close()
```

---

## Загрузка файлов

### LoadFiles

```go
func (l *Loader) LoadFiles(filenames ...string) error
```

Загружает один или несколько файлов конфигурации.

**Параметры:**
- `filenames` - список путей к файлам; если пусто, по умолчанию загружается `.env`

**Возвращает:**
- `error` - ошибка загрузки

**Поведение:**
- Загрузка по порядку, последующие переопределяют предыдущие (управляется конфигурацией `OverwriteExisting`)
- Автоопределение формата файла (.env, JSON, YAML)
- Поведение при отсутствии файла определяется конфигурацией `FailOnMissingFile`
- Если `AutoApply` равно true, автоматически применяется после загрузки

```go
// Загрузка файла .env по умолчанию
err := loader.LoadFiles()

// Загрузка указанных файлов
err := loader.LoadFiles(".env", ".env.local")

// Смешанные форматы
err := loader.LoadFiles("config.env", "settings.json", "secrets.yaml")
```

**Типы ошибок:**
- `ErrFileNotFound` - файл не существует (когда `FailOnMissingFile=true`)
- `ErrFileTooLarge` - файл превышает ограничение размера
- `ErrClosed` - загрузчик закрыт
- `*ParseError` - ошибка разбора
- `*JSONError` - ошибка разбора JSON
- `*YAMLError` - ошибка разбора YAML
- `*SecurityError` - ошибка проверки безопасности пути к файлу (например, атака обхода пути)

**Правила определения формата:**

| Расширение | Формат |
|------------|--------|
| `.env` | FormatEnv |
| `.json` | FormatJSON |
| `.yaml`, `.yml` | FormatYAML |
| Другое | FormatAuto (используется парсер .env) |

---

## Получение значений

### Разрешение ключей

Все методы получения поддерживают интеллектуальное разрешение ключей:

| Входной ключ | Результат разрешения |
|--------------|----------------------|
| `"DATABASE_HOST"` | `"DATABASE_HOST"` (точное совпадение) |
| `"database.host"` | `"DATABASE_HOST"` (точки в подчёркивания) |
| `"app.name"` | `"APP_NAME"` (верхний регистр + подчёркивания) |
| `"servers.0.host"` | `"SERVERS_0_HOST"` (индекс массива) |

**Порядок разрешения:**
1. Точное совпадение — прямой поиск ключа
2. Преобразование регистра — для простых ключей пробуется версия в верхнем регистре
3. Разрешение пути — путь через точку преобразуется в формат с подчёркиваниями
4. Откат по индексу — при доступе по индексу откат к значениям, разделённым запятой

---

### GetString

```go
func (l *Loader) GetString(key string, defaultValue ...string) string
```

Получает строковое значение. Поддерживает разрешение пути через точку.

**Параметры:**
- `key` - имя ключа (поддерживает точное совпадение, преобразование регистра, путь через точку)
- `defaultValue` - необязательное значение по умолчанию

**Возвращает:**
- `string` - значение или значение по умолчанию (если не найдено и нет значения по умолчанию, возвращается пустая строка)

```go
// Базовое использование
host := loader.GetString("HOST", "localhost")

// Доступ через путь с точкой (вложенные структуры JSON/YAML)
dbHost := loader.GetString("database.host", "localhost")
appName := loader.GetString("app.name")

// Без значения по умолчанию возвращает пустую строку
value := loader.GetString("NON_EXISTENT")  // ""
```

---

### GetInt

```go
func (l *Loader) GetInt(key string, defaultValue ...int64) int64
```

Получает целочисленное значение. Поддерживает разрешение пути через точку.

**Параметры:**
- `key` - имя ключа (поддерживает путь через точку)
- `defaultValue` - необязательное значение по умолчанию, тип `int64`

**Возвращает:**
- `int64` - значение или значение по умолчанию (если не найдено и нет значения по умолчанию, возвращается 0)

```go
port := loader.GetInt("PORT", 8080)
maxConn := loader.GetInt("database.max_connections", 10)

// Без значения по умолчанию возвращает 0
value := loader.GetInt("NON_EXISTENT")  // 0
```

---

### GetBool

```go
func (l *Loader) GetBool(key string, defaultValue ...bool) bool
```

Получает логическое значение. Поддерживает разрешение пути через точку.

**Параметры:**
- `key` - имя ключа (поддерживает путь через точку)
- `defaultValue` - необязательное значение по умолчанию

**Возвращает:**
- `bool` - значение или значение по умолчанию (если не найдено и нет значения по умолчанию, возвращается false)

**Поддерживаемые значения:**
- Истина: `true`, `1`, `yes`, `on`, `enabled`
- Ложь: `false`, `0`, `no`, `off`, `disabled`

```go
debug := loader.GetBool("DEBUG", false)
cacheEnabled := loader.GetBool("cache.enabled", true)

// Без значения по умолчанию возвращает false
value := loader.GetBool("NON_EXISTENT")  // false
```

---

### GetUint64

```go
func (l *Loader) GetUint64(key string, defaultValue ...uint64) uint64
```

Получает беззнаковое целочисленное значение. Поддерживает разрешение пути через точку.

**Параметры:**
- `key` - имя ключа (поддерживает путь через точку)
- `defaultValue` - необязательное значение по умолчанию, тип `uint64`

**Возвращает:**
- `uint64` - значение или значение по умолчанию (если не найдено и нет значения по умолчанию, возвращается 0)

```go
port := loader.GetUint64("PORT", 8080)
maxSize := loader.GetUint64("MAX_SIZE", 1024)

// Без значения по умолчанию возвращает 0
value := loader.GetUint64("NON_EXISTENT")  // 0
```

---

### GetFloat64

```go
func (l *Loader) GetFloat64(key string, defaultValue ...float64) float64
```

Получает число с плавающей точкой. Поддерживает разрешение пути через точку.

**Параметры:**
- `key` - имя ключа (поддерживает путь через точку)
- `defaultValue` - необязательное значение по умолчанию, тип `float64`

**Возвращает:**
- `float64` - значение или значение по умолчанию (если не найдено и нет значения по умолчанию, возвращается 0)

```go
rate := loader.GetFloat64("RATE", 0.5)
threshold := loader.GetFloat64("THRESHOLD")

// Без значения по умолчанию возвращает 0
value := loader.GetFloat64("NON_EXISTENT")  // 0
```

---

### GetDuration

```go
func (l *Loader) GetDuration(key string, defaultValue ...time.Duration) time.Duration
```

Получает интервал времени. Поддерживает разрешение пути через точку.

**Параметры:**
- `key` - имя ключа (поддерживает путь через точку)
- `defaultValue` - необязательное значение по умолчанию

**Возвращает:**
- `time.Duration` - значение или значение по умолчанию (если не найдено и нет значения по умолчанию, возвращается 0)

**Поддерживаемые форматы:** `ns`, `us`, `ms`, `s`, `m`, `h` (например, `30s`, `5m`, `1h30m`)

```go
timeout := loader.GetDuration("TIMEOUT", 30*time.Second)
ttl := loader.GetDuration("cache.ttl", 5*time.Minute)

// Без значения по умолчанию возвращает 0
value := loader.GetDuration("NON_EXISTENT")  // 0
```

---

### GetSecure

```go
func (l *Loader) GetSecure(key string) *SecureValue
```

Получает безопасное значение (защита чувствительных данных).

**Параметры:**
- `key` - имя ключа

**Возвращает:**
- `*SecureValue` - **оборонительная копия** безопасного значения; вызывающий отвечает за освобождение; возвращает nil, если ключ не существует или загрузчик закрыт

```go
secret := loader.GetSecure("API_SECRET")
if secret != nil {
    defer secret.Release()

    value := secret.Reveal()   // Открытый текст
    masked := secret.Masked()  // [SECURE:32 bytes]
}
```

::: warning Важно
После использования необходимо вызвать `Release()` или `Close()` для освобождения ресурсов.
:::

::: tip Оборонительная копия
`GetSecure` возвращает копию исходного значения, независимую от родительского Loader. Вызывающий отвечает за вызов `Release()` или `Close()` для освобождения.
:::

::: tip Подробности
[SecureValue API](/ru/env/api-reference/secure-value) для полной документации.
:::

---

### Получение срезов

Loader не предоставляет методов получения срезов (Go не поддерживает обобщённые методы). Используйте отдельную обобщённую функцию `GetSliceFrom[T]` для получения среза из экземпляра Loader:

```go
// Использование отдельной обобщённой функции
hosts := env.GetSliceFrom[string](loader, "HOSTS")
ports := env.GetSliceFrom[int64](loader, "PORTS", []int64{80})
portsInt := env.GetSliceFrom[int](loader, "PORTS")  // также поддерживается int
```

**Поддерживаемые типы:** `string`, `int`, `int64`, `uint`, `uint64`, `bool`, `float64`, `time.Duration`

::: tip Подробности
[Функции пакета — GetSliceFrom](/ru/env/api-reference/functions#getslicefrom-t) для полной документации.
:::

---

### Lookup

```go
func (l *Loader) Lookup(key string) (string, bool)
```

Проверяет существование ключа и получает значение. Поддерживает разрешение пути через точку.

**Параметры:**
- `key` - имя ключа (поддерживает путь через точку)

**Возвращает:**
- `string` - значение (пробелы в начале и конце удалены)
- `bool` - существует ли

```go
value, exists := loader.Lookup("API_KEY")
if !exists {
    // Ключ не существует
}

// Путь через точку
if value, exists := loader.Lookup("database.host"); exists {
    fmt.Println(value)
}

// Доступ по индексу (откат к значениям, разделённым запятой)
// HOSTS=localhost,example.com
if value, exists := loader.Lookup("hosts.0"); exists {
    fmt.Println(value)  // "localhost"
}
```

---

## Установка и удаление

### Set

```go
func (l *Loader) Set(key, value string) error
```

Устанавливает переменную окружения.

**Параметры:**
- `key` - имя ключа
- `value` - значение

**Возвращает:**
- `error` - ошибка установки

**Поведение:**
- Проверяет валидность имени ключа
- Если `ValidateValues` равно true, проверяет безопасность значения
- Если `OverwriteExisting` равно false и ключ уже существует, пропускает (возвращает nil)
- Если `AutoApply` равно true, также устанавливает в системное окружение

```go
err := loader.Set("CUSTOM_KEY", "value")
if err != nil {
    // Обработка ошибки
}
```

**Типы ошибок:**
- `*ValidationError` - недопустимый формат ключа (Field="key")
- `*SecurityError` - ключ запрещён (сопоставляется через `errors.Is(err, env.ErrSecurityViolation)`)
- `ErrInvalidValue` - недопустимое значение (когда `ValidateValues` равно true, значение содержит нулевые байты, управляющие символы и т. д.)
- `ErrClosed` - загрузчик закрыт

---

### Delete

```go
func (l *Loader) Delete(key string) error
```

Удаляет переменную окружения.

**Параметры:**
- `key` - имя ключа

**Возвращает:**
- `error` - ошибка удаления

**Поведение:**
- Если переменная была применена к системному окружению, также удаляется из системного окружения

```go
err := loader.Delete("TEMP_KEY")
if err != nil {
    panic(err)
}
```

---

## Операции с коллекциями

### Keys

```go
func (l *Loader) Keys() []string
```

Получает все имена ключей.

**Возвращает:**
- `[]string` - список имён ключей; возвращает nil, если загрузчик закрыт

```go
keys := loader.Keys()
for _, key := range keys {
    fmt.Println(key)
}
```

---

### All

```go
func (l *Loader) All() map[string]string
```

Получает все пары ключ-значение.

**Возвращает:**
- `map[string]string` - отображение ключ-значение; возвращает nil, если загрузчик закрыт

```go
all := loader.All()
for key, value := range all {
    fmt.Printf("%s=%s\n", key, value)
}
```

---

### Len

```go
func (l *Loader) Len() int
```

Получает количество переменных.

**Возвращает:**
- `int` - количество переменных; возвращает 0, если загрузчик закрыт

```go
count := loader.Len()
fmt.Printf("Загружено %d переменных\n", count)
```

---

## Применение к системе

### Apply

```go
func (l *Loader) Apply() error
```

Применяет переменные к системному окружению (`os.Environ`).

**Возвращает:**
- `error` - ошибка применения

**Поведение:**
- Перебирает все загруженные переменные
- В зависимости от конфигурации `OverwriteExisting` решает, переопределять ли существующие системные переменные окружения
- После применения доступно через `os.Getenv()`

**Типы ошибок:**
- `ErrClosed` - загрузчик закрыт
- Обёрнутая ошибка `os` - ошибка установки переменной окружения (имя ключа маскируется, конфиденциальные имена ключей не раскрываются в сообщении об ошибке)

```go
err := loader.Apply()
if err != nil {
    panic(err)
}

// Теперь os.Getenv() также имеет доступ
host := os.Getenv("HOST")
```

---

### IsApplied

```go
func (l *Loader) IsApplied() bool
```

Проверяет, применены ли переменные к системному окружению.

**Возвращает:**
- `bool` - применено ли

```go
if loader.IsApplied() {
    // Переменные применены к os.Environ
}
```

---

## Запрос состояния

### LoadTime

```go
func (l *Loader) LoadTime() time.Time
```

Возвращает время последней загрузки файла.

**Возвращает:**
- `time.Time` - время загрузки; если не загружалось, возвращает нулевое значение

```go
loadTime := loader.LoadTime()
if !loadTime.IsZero() {
    fmt.Printf("Время последней загрузки: %v\n", loadTime)
}
```

---

### Config

```go
func (l *Loader) Config() Config
```

Возвращает конфигурацию загрузчика.

**Возвращает:**
- `Config` - конфигурация (следует рассматривать как только для чтения)

::: warning Внимание
Возвращаемую Config следует рассматривать как только для чтения. Изменение полей `KeyPattern`, `AllowedKeys`, `ForbiddenKeys`, `RequiredKeys` и т. д. может повлиять на поведение загрузчика. Для безопасной изменяемой копии скопируйте нужные поля вручную.
:::

```go
cfg := loader.Config()
fmt.Printf("Максимальный размер файла: %d\n", cfg.MaxFileSize)
```

---

## Валидация и маппинг

### Validate

```go
func (l *Loader) Validate() error
```

Проверяет наличие обязательных ключей.

**Возвращает:**
- `error` - ошибка валидации

**Поведение:**
- Проверяет наличие всех ключей, указанных в `ValidationConfig.RequiredKeys`

```go
cfg := env.DefaultConfig()
cfg.RequiredKeys = []string{"DB_HOST", "API_KEY"}

loader, _ := env.New(cfg)
loader.LoadFiles(".env")

if err := loader.Validate(); err != nil {
    // Отсутствует обязательный ключ
    var missingErr *env.ValidationError
    if errors.As(err, &missingErr) {
        fmt.Printf("Отсутствует: %s\n", missingErr.Field)
    }
}
```

---

### ParseInto

```go
func (l *Loader) ParseInto(v any) error
```

Маппирует переменные окружения на структуру.

**Параметры:**
- `v` - указатель на структуру

**Возвращает:**
- `error` - ошибка маппинга

**Поддерживаемые теги:**
- `env:"KEY"` - указывает имя переменной окружения
- `env:"-"` - игнорировать это поле
- `envDefault:"value"` - указывает значение по умолчанию

Поля срезов по умолчанию разделяются запятой `,` (пробелы вокруг разделителя удаляются автоматически), пользовательского тега разделителя нет.

```go
type Config struct {
    Host    string   `env:"HOST" envDefault:"localhost"`
    Port    int64    `env:"PORT" envDefault:"8080"`
    Debug   bool     `env:"DEBUG" envDefault:"false"`
    Hosts   []string `env:"HOSTS"`
    Ignored string   `env:"-"`
}

var cfg Config
err := loader.ParseInto(&cfg)
if err != nil {
    panic(err)
}
```

---

## Освобождение ресурсов

### Close

```go
func (l *Loader) Close() error
```

Освобождает ресурсы и очищает хранилище.

**Возвращает:**
- `error` - ошибка закрытия

**Поведение:**
- Безопасно обнуляет все хранящиеся конфиденциальные данные
- Если загрузчик владеет ComponentFactory, также закрывает фабрику
- Безопасное закрытие, многократный вызов возвращает nil

```go
loader, _ := env.New(cfg)
defer loader.Close()

// Использование loader...
```

::: warning Поведение после закрытия
После закрытия все операции возвращают ошибки или нулевые значения:
- `LoadFiles` → `ErrClosed`
- `GetString` → возвращает пустое значение
- `Set` → `ErrClosed`
- `Keys` → возвращает nil
- `Len` → возвращает 0
:::

---

### IsClosed

```go
func (l *Loader) IsClosed() bool
```

Проверяет, закрыт ли загрузчик.

**Возвращает:**
- `bool` - закрыт ли

```go
if loader.IsClosed() {
    // Загрузчик закрыт
}
```

---

## Полный пример

```go
package main

import (
    "errors"
    "fmt"
    "log"
    "os"
    "time"

    "github.com/cybergodev/env"
)

func main() {
    // Создание продакшн-конфигурации
    cfg := env.ProductionConfig()
    cfg.RequiredKeys = []string{"DB_HOST", "API_KEY"}
    cfg.AuditHandler = env.NewJSONAuditHandler(os.Stdout)

    // Создание загрузчика
    loader, err := env.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer loader.Close()

    // Загрузка файлов
    if err := loader.LoadFiles(".env", ".env.production"); err != nil {
        if errors.Is(err, env.ErrFileNotFound) {
            log.Fatal("Файл конфигурации не существует")
        }
        log.Fatal(err)
    }

    // Валидация обязательных ключей
    if err := loader.Validate(); err != nil {
        log.Fatal("Отсутствует обязательная конфигурация:", err)
    }

    // Чтение конфигурации
    host := loader.GetString("DB_HOST")
    port := loader.GetInt("DB_PORT", 5432)
    debug := loader.GetBool("DEBUG", false)
    timeout := loader.GetDuration("TIMEOUT", 30*time.Second)

    fmt.Printf("Server: %s:%d\n", host, port)
    fmt.Printf("Debug: %v, Timeout: %v\n", debug, timeout)

    // Чувствительные данные
    secret := loader.GetSecure("API_KEY")
    if secret != nil {
        defer secret.Release()
        fmt.Printf("API Key length: %d\n", secret.Length())
    }

    // Применение к системному окружению
    if err := loader.Apply(); err != nil {
        log.Fatal(err)
    }

    // Все переменные
    fmt.Printf("Loaded %d variables\n", loader.Len())
    fmt.Printf("Load time: %v\n", loader.LoadTime())
}
```

## Связанная документация

- [Функции пакета](/ru/env/api-reference/functions) - пакетные удобные функции
- [Config API](/ru/env/api-reference/config) - параметры конфигурации
- [SecureValue API](/ru/env/api-reference/secure-value) - обработка безопасных значений
- [Определения интерфейсов](/ru/env/api-reference/interfaces) - все определения интерфейсов
