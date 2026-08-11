---
sidebar_label: "Функции пакета"
title: "Функции пакета - CyberGo env | глобальные удобные функции"
description: "Справочник API пакетных удобных функций CyberGo env: Load, GetString, GetInt, GetBool, GetDuration, GetSlice, GetSecure, Lookup, Keys и ParseInto — потокобезопасные интерфейсы на основе глобального загрузчика по умолчанию."
sidebar_position: 2
---

# Функции пакета

Пакетные удобные функции предоставляют лаконичный API, подходящий для большинства сценариев. Эти функции используют глобальный загрузчик по умолчанию; все функции потокобезопасны.

::: info Требование инициализации
Глобальный загрузчик по умолчанию должен быть явно инициализирован через `Load()` или `LoadWithConfig()`, он **не создаётся** автоматически при первом вызове. Если инициализация не выполнена, функции ведут себя так:

- Функции `Get*` (`GetString`, `GetInt`, `GetBool` и т. д.): возвращают переданное значение по умолчанию (или нулевое значение)
- `Lookup`: возвращает `("", false)`
- `Keys`/`All`/`Len`/`GetSecure`: возвращают `nil`/`0`
- `Set`/`Delete`/`Validate`/`ParseInto`: возвращают `ErrNotInitialized`
:::

## Функции загрузки

### Load

```go
func Load(filenames ...string) error
```

Загружает файлы переменных окружения и применяет их к системному окружению.

**Параметры:**
- `filenames` - список путей к файлам. Если не указан, по умолчанию загружается файл `.env` (используется настройка `Filenames` из `DefaultConfig()`).

**Возвращает:**
- `error` - ошибка загрузки

**Поведение:**
- Создаёт новый экземпляр Loader и устанавливает его как загрузчик по умолчанию
- Автоматически применяется к системному окружению (`os.Environ`)
- Последующие загруженные файлы могут переопределять предыдущие (управляется конфигурацией `OverwriteExisting`; по умолчанию для `Load()` — `false`, т. е. без переопределения)
- Возвращает `ErrAlreadyInitialized`, если загрузчик по умолчанию уже инициализирован
- Поддерживает несколько форматов (.env, JSON, YAML)

```go
// Загрузка .env файла
if err := env.Load(".env"); err != nil {
    log.Fatal(err)
}

// Загрузка указанных файлов (по порядку; для переопределения нужно установить OverwriteExisting)
if err := env.Load(".env", ".env.local", "config.json"); err != nil {
    log.Fatal(err)
}

// Вложенные структуры JSON/YAML поддерживают доступ через точку
// config.json: {"database": {"host": "localhost", "port": 5432}}
env.Load("config.json")
host := env.GetString("database.host") // "localhost"
port := env.GetInt("database.port")    // 5432
```

---

## Разрешение ключей

Все функции получения поддерживают интеллектуальное разрешение ключей, предоставляя гибкие способы доступа.

### Правила разрешения

**1. Точное совпадение (приоритет)**
```go
// .env: APP_NAME=myapp
name := env.GetString("APP_NAME")  // "myapp"
```

**2. Преобразование регистра (простые ключи)**
```go
// Для ключей без точек автоматически пробуется версия в верхнем регистре
name := env.GetString("app_name")  // Ищет app_name -> APP_NAME
```

**3. Разрешение пути через точку (вложенные ключи)**
```go
// JSON: {"app": {"name": "myapp"}}
// Хранится как: APP_NAME=myapp

// Все следующие способы получают значение
name := env.GetString("APP_NAME")   // Плоский ключ (рекомендуется)
name := env.GetString("app.name")   // Путь через точку (автопреобразование)
name := env.GetString("APP.NAME")   // Путь через точку в верхнем регистре
```

### Таблица преобразования путей

| Входной ключ | Ключ хранения |
|--------------|---------------|
| `"database.host"` | `"DATABASE_HOST"` |
| `"db.port"` | `"DB_PORT"` |
| `"servers.0.host"` | `"SERVERS_0_HOST"` |
| `"app.config.name"` | `"APP_CONFIG_NAME"` |

### Доступ по индексу

Элементы массива доступны по индексу или с откатом к значениям, разделённым запятой:

```go
// JSON: {"servers": [{"host": "a.com"}, {"host": "b.com"}]}
// Хранится как: SERVERS_0_HOST=a.com, SERVERS_1_HOST=b.com

host0 := env.GetString("servers.0.host")  // "a.com"
host1 := env.GetString("servers.1.host")  // "b.com"

// Если ключ не существует, но есть базовое значение, разделённое запятой
// HOSTS=localhost,example.com
host0 := env.GetString("hosts.0")  // "localhost" (из значения, разделённого запятой)
```

---

## Функции получения значений

### GetString

```go
func GetString(key string, defaultValue ...string) string
```

Получает строковое значение. Поддерживает разрешение пути через точку.

**Параметры:**
- `key` - имя ключа (поддерживает точное совпадение, преобразование регистра, путь через точку)
- `defaultValue` - необязательное значение по умолчанию

**Возвращает:**
- `string` - значение или значение по умолчанию (если не найдено и нет значения по умолчанию, возвращается пустая строка)

```go
// Базовое использование
host := env.GetString("HOST", "localhost")

// Доступ через путь с точкой (вложенные структуры JSON/YAML)
dbHost := env.GetString("database.host", "localhost")
appName := env.GetString("app.name")

// Без значения по умолчанию возвращает пустую строку
value := env.GetString("NON_EXISTENT")  // ""
```

---

### GetInt

```go
func GetInt(key string, defaultValue ...int64) int64
```

Получает целочисленное значение. Автоматически преобразует строку в целое число. Поддерживает разрешение пути через точку.

**Параметры:**
- `key` - имя ключа (поддерживает путь через точку)
- `defaultValue` - необязательное значение по умолчанию, тип `int64`

**Возвращает:**
- `int64` - значение или значение по умолчанию (если не найдено и нет значения по умолчанию, возвращается 0)

```go
port := env.GetInt("PORT", 8080)
maxConn := env.GetInt("database.max_connections", 10)

// Без значения по умолчанию возвращает 0
value := env.GetInt("NON_EXISTENT")  // 0
```

---

### GetBool

```go
func GetBool(key string, defaultValue ...bool) bool
```

Получает логическое значение. Поддерживает разрешение пути через точку.

- **Истинные значения (без учёта регистра):** `true`, `1`, `yes`, `on`, `enabled`
- **Ложные значения (без учёта регистра):** `false`, `0`, `no`, `off`, `disabled`

**Параметры:**
- `key` - имя ключа (поддерживает путь через точку)
- `defaultValue` - необязательное значение по умолчанию

**Возвращает:**
- `bool` - значение или значение по умолчанию (если не найдено и нет значения по умолчанию, возвращается false)

```go
debug := env.GetBool("DEBUG", false)
cacheEnabled := env.GetBool("cache.enabled", true)

// Без значения по умолчанию возвращает false
value := env.GetBool("NON_EXISTENT")  // false
```

---

### GetUint64

```go
func GetUint64(key string, defaultValue ...uint64) uint64
```

Получает беззнаковое целочисленное значение. Поддерживает разрешение пути через точку.

**Параметры:**
- `key` - имя ключа (поддерживает путь через точку)
- `defaultValue` - необязательное значение по умолчанию, тип `uint64`

**Возвращает:**
- `uint64` - значение или значение по умолчанию (если не найдено и нет значения по умолчанию, возвращается 0)

```go
port := env.GetUint64("PORT", 8080)
maxSize := env.GetUint64("MAX_SIZE", 1024)

// Без значения по умолчанию возвращает 0
value := env.GetUint64("NON_EXISTENT")  // 0
```

---

### GetFloat64

```go
func GetFloat64(key string, defaultValue ...float64) float64
```

Получает число с плавающей точкой. Поддерживает разрешение пути через точку.

**Параметры:**
- `key` - имя ключа (поддерживает путь через точку)
- `defaultValue` - необязательное значение по умолчанию, тип `float64`

**Возвращает:**
- `float64` - значение или значение по умолчанию (если не найдено и нет значения по умолчанию, возвращается 0)

```go
rate := env.GetFloat64("RATE", 0.5)
threshold := env.GetFloat64("THRESHOLD")

// Без значения по умолчанию возвращает 0
value := env.GetFloat64("NON_EXISTENT")  // 0
```

---

### GetDuration

```go
func GetDuration(key string, defaultValue ...time.Duration) time.Duration
```

Получает интервал времени. Поддерживает разрешение пути через точку.

**Поддерживаемые форматы:**
- `300ms` - миллисекунды
- `1.5s` - секунды
- `2m30s` - минуты + секунды
- `1h30m` - часы + минуты

**Параметры:**
- `key` - имя ключа (поддерживает путь через точку)
- `defaultValue` - необязательное значение по умолчанию

**Возвращает:**
- `time.Duration` - значение или значение по умолчанию (если не найдено и нет значения по умолчанию, возвращается 0)

```go
timeout := env.GetDuration("TIMEOUT", 30*time.Second)
interval := env.GetDuration("INTERVAL", 5*time.Minute)

// Без значения по умолчанию возвращает 0
value := env.GetDuration("NON_EXISTENT")  // 0
```

---

### GetSecure

```go
func GetSecure(key string) *SecureValue
```

Получает безопасное значение (для чувствительных данных).

**Параметры:**
- `key` - имя ключа

**Возвращает:**
- `*SecureValue` - обёртка безопасного значения; возвращает nil, если ключ не существует или загрузчик недоступен

```go
secret := env.GetSecure("API_KEY")
if secret != nil {
    defer secret.Release()

    value := secret.Reveal()   // Открытый текст (вызывайте только при необходимости)
    masked := secret.Masked()  // Для логов: [SECURE:32 bytes]
}
```

::: warning Важно
После использования необходимо вызвать `Release()` или `Close()` для освобождения ресурсов. Рекомендуется использовать `defer` для гарантии освобождения.
:::

::: tip Подробности
[SecureValue API](/ru/env/api-reference/secure-value) для полной документации API.
:::

---

### GetSlice[T]

```go
func GetSlice[T sliceElement](key string, defaultValue ...[]T) []T
```

Обобщённая функция получения значения среза.

**Поддерживаемые типы:** `string`, `int`, `int64`, `uint`, `uint64`, `bool`, `float64`, `time.Duration`

**Примечание:** это обобщённая функция, а не метод Loader. Для получения среза из указанного экземпляра Loader используйте `GetSliceFrom[T]`.

**Порядок разбора:**
1. Сначала ищутся индексные ключи `KEY_0`, `KEY_1`, `KEY_2`...
2. Если индексных ключей нет, значение `KEY` разбивается по запятой
3. Поддерживает разрешение пути через точку

**Параметры:**
- `key` - имя ключа
- `defaultValue` - необязательное значение по умолчанию

**Возвращает:**
- `[]T` - значение среза

```go
// Индексный формат ключей (рекомендуется)
// HOSTS_0=localhost
// HOSTS_1=example.com
hosts := env.GetSlice[string]("HOSTS")  // ["localhost", "example.com"]

// Формат с разделением запятой
// PORTS=80,443,8080
ports := env.GetSlice[int64]("PORTS", []int64{80})  // [80, 443, 8080]

// Срез чисел с плавающей точкой
rates := env.GetSlice[float64]("RATES", []float64{0.1, 0.2})

// Срез логических значений
flags := env.GetSlice[bool]("FLAGS")

// Срез Duration
timeouts := env.GetSlice[time.Duration]("TIMEOUTS")

// Срез беззнаковых целых
ports := env.GetSlice[uint]("PORTS")
port64s := env.GetSlice[uint64]("PORTS")

// Тип int
portInts := env.GetSlice[int]("PORTS")

// Без значения по умолчанию возвращает nil
value := env.GetSlice[string]("NON_EXISTENT")  // nil
```

---

### GetSliceFrom[T]

```go
func GetSliceFrom[T sliceElement](loader *Loader, key string, defaultValue ...[]T) []T
```

Получает значение среза из указанного экземпляра Loader. Это отдельная обобщённая функция (не метод Loader).

**Параметры:**
- `loader` - указатель на экземпляр Loader (если nil, возвращается значение по умолчанию)
- `key` - имя ключа
- `defaultValue` - необязательное значение по умолчанию

**Возвращает:**
- `[]T` - значение среза

**Поддерживаемые типы:** `string`, `int`, `int64`, `uint`, `uint64`, `bool`, `float64`, `time.Duration`

```go
loader, _ := env.New(cfg)
defer loader.Close()

// Получение среза из экземпляра loader
hosts := env.GetSliceFrom[string](loader, "HOSTS")
ports := env.GetSliceFrom[int64](loader, "PORTS", []int64{80})

// Также поддерживаются типы int, uint, uint64
portsInt := env.GetSliceFrom[int](loader, "PORTS")
portsUint := env.GetSliceFrom[uint](loader, "PORTS")
portsUint64 := env.GetSliceFrom[uint64](loader, "PORTS")
```

::: tip Различие
- `GetSlice[T]` - пакетная функция, использующая загрузчик по умолчанию
- `GetSliceFrom[T]` - обобщённая функция для указанного экземпляра Loader (Go не поддерживает обобщённые методы)
:::

---

## Функции запросов

### Lookup

```go
func Lookup(key string) (string, bool)
```

Проверяет существование ключа и получает значение. Поддерживает разрешение пути через точку.

**Параметры:**
- `key` - имя ключа (поддерживает путь через точку)

**Возвращает:**
- `string` - значение (пробелы в начале и конце удалены)
- `bool` - существует ли

```go
value, exists := env.Lookup("API_KEY")
if !exists {
    // Ключ не существует
}

// Путь через точку
if value, exists := env.Lookup("database.host"); exists {
    fmt.Println(value)
}
```

---

### Keys

```go
func Keys() []string
```

Получает все имена ключей.

**Возвращает:**
- `[]string` - список имён ключей; возвращает nil, если загрузчик недоступен

```go
keys := env.Keys()
for _, key := range keys {
    fmt.Println(key)
}
```

---

### All

```go
func All() map[string]string
```

Получает все пары ключ-значение.

**Возвращает:**
- `map[string]string` - отображение ключ-значение; возвращает nil, если загрузчик недоступен

```go
all := env.All()
for key, value := range all {
    fmt.Printf("%s=%s\n", key, value)
}
```

---

### Len

```go
func Len() int
```

Получает количество переменных.

**Возвращает:**
- `int` - количество переменных; возвращает 0, если загрузчик недоступен

```go
count := env.Len()
fmt.Printf("Загружено %d переменных окружения\n", count)
```

---

## Установка и удаление

### Set

```go
func Set(key, value string) error
```

Устанавливает переменную окружения.

**Параметры:**
- `key` - имя ключа
- `value` - значение

**Возвращает:**
- `error` - ошибка установки

**Типы ошибок:**
- `*ValidationError` - недопустимый формат ключа (Field="key")
- `*SecurityError` - ключ запрещён (сопоставляется через `errors.Is(err, env.ErrSecurityViolation)`)
- `ErrInvalidValue` - недопустимое значение (когда `ValidateValues` равно true, значение содержит нулевые байты, управляющие символы и т. д.)
- `ErrClosed` - загрузчик закрыт

```go
if err := env.Set("CUSTOM_KEY", "value"); err != nil {
    // Может быть *SecurityError (запрещённый ключ) или *ValidationError (формат ключа)
}
```

---

### Delete

```go
func Delete(key string) error
```

Удаляет переменную окружения.

**Параметры:**
- `key` - имя ключа

**Возвращает:**
- `error` - ошибка удаления

```go
if err := env.Delete("TEMP_KEY"); err != nil {
    panic(err)
}
```

---

## Валидация и маппинг

### Validate

```go
func Validate() error
```

Проверяет наличие обязательных ключей. Требуется установить RequiredKeys в Config.

**Возвращает:**
- `error` - ошибка валидации

```go
// Необходимо сначала настроить RequiredKeys (через пользовательский загрузчик)
cfg := env.ProductionConfig()
cfg.RequiredKeys = []string{"DB_HOST", "API_KEY"}

loader, _ := env.New(cfg)
loader.LoadFiles(".env")

if err := loader.Validate(); err != nil {
    // Отсутствует обязательный ключ
}
```

---

### ParseInto

```go
func ParseInto(v any) error
```

Маппирует переменные окружения на структуру.

**Параметры:**
- `v` - указатель на структуру

**Возвращает:**
- `error` - ошибка маппинга

```go
type Config struct {
    Host string `env:"HOST" envDefault:"localhost"`
    Port int64  `env:"PORT" envDefault:"8080"`
}

var cfg Config
if err := env.ParseInto(&cfg); err != nil {
    panic(err)
}
```

**Теги структуры:**
| Тег | Описание |
|-----|----------|
| `env:"KEY"` | Маппинг на указанный ключ |
| `env:"-"` | Игнорировать это поле |
| `envDefault:"value"` | Значение по умолчанию |

Поля срезов по умолчанию разделяются запятой `,` (пробелы вокруг разделителя удаляются автоматически), пользовательского тега разделителя нет.

::: tip Подробности
[Маппинг структур](/ru/env/guides/struct-mapping) для полного руководства.
:::

---

## Сервисные функции

### ResetDefaultLoader

```go
func ResetDefaultLoader() error
```

Сбрасывает глобальный загрузчик по умолчанию. В основном используется в тестах.

**Возвращает:**
- `error` - ошибка закрытия старого загрузчика (если он существует); возвращает nil, если загрузчика ранее не было или закрытие прошло успешно

**Поведение:**
- После блокировки через `defaultMu.Lock()` использует `defaultLoader.Swap(nil)` для атомарной замены загрузчика по умолчанию на nil, затем немедленно снимает блокировку
- Закрывает старый загрузчик **вне** блокировки (чтобы избежать потенциально длительных операций очистки при удержании блокировки, предотвращая дедлоки, если `Close()` вызывает код, требующий загрузчика по умолчанию)
- После сброса позволяет создать новый загрузчик по умолчанию через `Load()` или `LoadWithConfig()`

```go
func TestMain(m *testing.M) {
    if err := env.ResetDefaultLoader(); err != nil {
        log.Printf("warning: failed to reset loader: %v", err)
    }
    os.Exit(m.Run())
}

func TestSomething(t *testing.T) {
    if err := env.ResetDefaultLoader(); err != nil {
        t.Logf("warning: %v", err)
    }
    defer env.ResetDefaultLoader()
    // ... код теста
}
```

::: warning Внимание
Эта функция конкурентно безопасна, но вызывайте её только в тестах или при запуске, чтобы избежать непредвиденного поведения.
:::

---

### LoadWithConfig

```go
func LoadWithConfig(cfg Config) error
```

Инициализирует загрузчик по умолчанию с пользовательской конфигурацией.

**Параметры:**
- `cfg` - пользовательская конфигурация

**Возвращает:**
- `error` - ошибка инициализации

**Поведение:**
- Устанавливает пакетный загрузчик по умолчанию (используется функциями `GetString`, `GetInt` и др.)
- **Принудительно** устанавливает `AutoApply = true` (независимо от значения в cfg)
- Возвращает `ErrAlreadyInitialized`, если загрузчик по умолчанию уже инициализирован

**Отличие от Load:**
- `Load()` - принимает только список имён файлов, использует конфигурацию по умолчанию
- `LoadWithConfig()` - принимает полную Config, поддерживает все параметры конфигурации

```go
cfg := env.DefaultConfig()
cfg.Filenames = []string{".env.production"}
cfg.OverwriteExisting = true
if err := env.LoadWithConfig(cfg); err != nil {
    log.Fatal(err)
}
// Теперь можно использовать пакетные функции
port := env.GetInt("PORT", 8080)
```

::: warning Внимание
Эта функция принудительно устанавливает `cfg.AutoApply` в `true`, обеспечивая применение переменных к системному окружению. Для контроля момента применения используйте `New()` для создания независимого экземпляра.
:::

---

## Функции сериализации

### Marshal

```go
func Marshal(data any, format ...FileFormat) (string, error)
```

Сериализует данные в строку указанного формата. Поддерживает `map[string]string` или структуру в качестве входных данных.

**Интеграция интерфейсов:** если тип входных данных реализует интерфейс `Marshaler`, приоритетно вызывается метод `MarshalEnv()`.

**Параметры:**
- `data` - данные для сериализации (map или структура)
- `format` - необязательный формат, по умолчанию `FormatEnv`

**Возвращает:**
- `string` - сериализованная строка (ключи отсортированы)
- `error` - ошибка сериализации

**Поддерживаемые форматы:**
- `FormatEnv` (по умолчанию) - формат .env
- `FormatJSON` - формат JSON
- `FormatYAML` - формат YAML

```go
// map в формат .env
mapData := map[string]string{"HOST": "localhost", "PORT": "8080"}
envStr, _ := env.Marshal(mapData)
// HOST=localhost
// PORT=8080

// map в формат JSON (строковые числа выводятся как числа, ключи сортируются по алфавиту)
jsonStr, _ := env.Marshal(mapData, env.FormatJSON)
// {
//   "HOST": "localhost",
//   "PORT": 8080
// }

// Структура в формат .env
type Config struct {
    Host string `env:"HOST"`
    Port string `env:"PORT"`
}
envStr, _ := env.Marshal(Config{Host: "localhost", Port: "8080"})
```

---

### UnmarshalMap

```go
func UnmarshalMap(data string, format ...FileFormat) (map[string]string, error)
```

Разбирает форматированную строку в map. Поддерживает автоопределение формата.

**Параметры:**
- `data` - форматированная строка
- `format` - необязательный формат, по умолчанию `FormatEnv`; используйте `FormatAuto` для автоопределения

**Возвращает:**
- `map[string]string` - разобранные пары ключ-значение
- `error` - ошибка разбора

```go
// Формат .env
m, _ := env.UnmarshalMap("HOST=localhost\nPORT=8080")

// Формат JSON (вложенные структуры будут плоскими)
m, _ := env.UnmarshalMap(`{"database": {"host": "localhost"}}`, env.FormatJSON)
// m["DATABASE_HOST"] = "localhost"

// Автоопределение формата
m, _ := env.UnmarshalMap(jsonString, env.FormatAuto)
```

---

### UnmarshalStruct

```go
func UnmarshalStruct(data string, v any, format ...FileFormat) error
```

Разбирает форматированную строку и заполняет структуру.

**Параметры:**
- `data` - форматированная строка
- `v` - указатель на структуру
- `format` - необязательный формат, по умолчанию `FormatEnv`

**Возвращает:**
- `error` - ошибка разбора

```go
type Config struct {
    Host string `env:"SERVER_HOST"`
    Port int    `env:"SERVER_PORT"`
}

var cfg Config
err := env.UnmarshalStruct("SERVER_HOST=localhost\nSERVER_PORT=8080", &cfg)
// cfg.Host = "localhost", cfg.Port = 8080

// Разбор из JSON
err = env.UnmarshalStruct(`{"server": {"host": "localhost"}}`, &cfg, env.FormatJSON)
```

---

### UnmarshalInto

```go
func UnmarshalInto(data map[string]string, v any) error
```

Заполняет структуру из map. Поддерживает теги `env` и `envDefault`.

**Интеграция интерфейсов:** если целевой тип реализует интерфейс `Unmarshaler`, приоритетно вызывается метод `UnmarshalEnv(data)`.

**Параметры:**
- `data` - отображение пар ключ-значение
- `v` - указатель на структуру

**Возвращает:**
- `error` - ошибка заполнения

```go
type Config struct {
    Host string `env:"HOST" envDefault:"localhost"`
    Port int    `env:"PORT" envDefault:"8080"`
}

data := map[string]string{"HOST": "example.com"}
var cfg Config
err := env.UnmarshalInto(data, &cfg)
// cfg.Host = "example.com", cfg.Port = 8080 (используется значение по умолчанию)
```

---

### MarshalStruct

```go
func MarshalStruct(v any) (map[string]string, error)
```

Преобразует структуру в map. Поддерживает указание имён ключей через тег `env`.

**Интеграция интерфейсов:** если тип входных данных реализует интерфейс `Marshaler`, приоритетно вызывается метод `MarshalEnv()`.

**Параметры:**
- `v` - структура или указатель на структуру

**Возвращает:**
- `map[string]string` - отображение пар ключ-значение
- `error` - ошибка преобразования

```go
type Config struct {
    Host string `env:"SERVER_HOST"`
    Port int    `env:"SERVER_PORT"`
}

cfg := Config{Host: "localhost", Port: 8080}
m, _ := env.MarshalStruct(cfg)
// m["SERVER_HOST"] = "localhost"
// m["SERVER_PORT"] = "8080"
```

---

### IsMarshalError

```go
func IsMarshalError(err error) bool
```

Проверяет, является ли ошибка ошибкой сериализации/десериализации.

**Параметры:**
- `err` - проверяемая ошибка

**Возвращает:**
- `bool` - является ли ошибкой типа MarshalError

```go
_, err := env.MarshalStruct(invalidData)
if env.IsMarshalError(err) {
    // Обработка ошибки сериализации
}
```

---

## Полный пример

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/env"
)

type AppConfig struct {
    Host     string        `env:"APP_HOST" envDefault:"0.0.0.0"`
    Port     int64         `env:"APP_PORT" envDefault:"8080"`
    Debug    bool          `env:"DEBUG" envDefault:"false"`
    Timeout  time.Duration `env:"TIMEOUT" envDefault:"30s"`
    Hosts    []string      `env:"HOSTS"`
}

func main() {
    // Загрузка файла конфигурации
    if err := env.Load(".env"); err != nil {
        log.Printf("Warning: %v", err)
    }

    // Чтение отдельных значений
    host := env.GetString("APP_HOST", "localhost")
    port := env.GetInt("APP_PORT", 8080)
    debug := env.GetBool("DEBUG", false)
    timeout := env.GetDuration("TIMEOUT", 30*time.Second)

    fmt.Printf("Server: %s:%d\n", host, port)
    fmt.Printf("Debug: %v, Timeout: %v\n", debug, timeout)

    // Чувствительные данные
    secret := env.GetSecure("API_KEY")
    if secret != nil {
        defer secret.Release()
        fmt.Printf("API Key length: %d\n", secret.Length())
    }

    // Маппинг структуры
    var cfg AppConfig
    if err := env.ParseInto(&cfg); err != nil {
        log.Fatal(err)
    }
    fmt.Printf("Config: %+v\n", cfg)

    // Все переменные
    fmt.Printf("Loaded %d variables\n", env.Len())
}
```

## Связанная документация

- [Loader API](/ru/env/api-reference/loader) - методы экземпляра Loader
- [Config API](/ru/env/api-reference/config) - параметры конфигурации
- [SecureValue API](/ru/env/api-reference/secure-value) - обработка безопасных значений
- [Маппинг структур](/ru/env/guides/struct-mapping) - руководство по маппингу структур
