---
sidebar_label: "Config"
title: "Config API - CyberGo env | подробности конфигурации"
description: "Справочник API структуры конфигурации Config CyberGo env: пути поиска файлов, ограничения размера и количества, валидация ключей и значений, параметры разбора JSON/YAML, подстановка переменных, конфигурация аудита и шаблоны пресетов Development/Production, доступ через вложенные структуры и поднятие полей."
sidebar_position: 4
---

# Config API

Полный справочник параметров конфигурации структуры `Config`.

## Определение структуры

Config организует параметры через вложенные структуры, сохраняя обратную совместимость через поднятие полей Go:

```go
type Config struct {
    FileConfig       // Поведение загрузки файлов
    ValidationConfig // Валидация ключей и значений
    LimitsConfig     // Ограничения размера и количества
    JSONConfig       // Параметры разбора JSON
    YAMLConfig       // Параметры разбора YAML
    ParsingConfig    // Общее поведение разбора
    ComponentConfig  // Пользовательские компоненты и расширенные опции
}
```

**Два способа доступа:**

```go
// Старый способ (через поднятие полей, всё ещё работает)
cfg.Filenames = []string{".env"}
cfg.MaxFileSize = 1024

// Новый способ (рекомендуется, более явно)
cfg.FileConfig.Filenames = []string{".env"}
cfg.LimitsConfig.MaxFileSize = 1024
```

### Вложенные структуры

```go
// FileConfig управляет поведением загрузки файлов
type FileConfig struct {
    Filenames         []string // Список файлов для загрузки
    FailOnMissingFile bool     // Возвращать ли ошибку при отсутствии файла
    OverwriteExisting bool     // Переопределять ли существующие переменные окружения
    AutoApply         bool     // Применять ли автоматически к os.Environ
}

// ValidationConfig управляет валидацией ключей и значений
type ValidationConfig struct {
    RequiredKeys   []string       // Список обязательных имён ключей
    AllowedKeys    []string       // Белый список разрешённых имён ключей
    ForbiddenKeys  []string       // Дополнительный список запрещённых ключей
    KeyPattern     *regexp.Regexp // Шаблон сопоставления имён ключей
    ValidateValues bool           // Проверять ли безопасность значений
    ValidateUTF8   bool           // Проверять ли, что значение является корректным UTF-8
}

// LimitsConfig управляет ограничениями размера и количества
type LimitsConfig struct {
    MaxFileSize       int64 // Максимальное количество байт на файл
    MaxVariables      int   // Максимальное количество переменных на файл
    MaxLineLength     int   // Максимальная длина строки
    MaxKeyLength      int   // Максимальная длина имени ключа
    MaxValueLength    int   // Максимальная длина значения
    MaxExpansionDepth int   // Максимальная глубина подстановки переменных
}

// JSONConfig управляет поведением разбора JSON
type JSONConfig struct {
    JSONNullAsEmpty    bool // null преобразуется в пустую строку
    JSONNumberAsString bool // Числа преобразуются в строки
    JSONBoolAsString   bool // Логические значения преобразуются в строки
    JSONMaxDepth       int  // Максимальная глубина вложенности
}

// YAMLConfig управляет поведением разбора YAML
type YAMLConfig struct {
    YAMLNullAsEmpty    bool // null/~ преобразуется в пустую строку
    YAMLNumberAsString bool // Числа преобразуются в строки
    YAMLBoolAsString   bool // Логические значения преобразуются в строки
    YAMLMaxDepth       int  // Максимальная глубина вложенности
}

// ParsingConfig управляет общим поведением разбора
type ParsingConfig struct {
    AllowExportPrefix bool // Разрешать синтаксис export KEY=value
    AllowYamlSyntax   bool // Разрешать значения в стиле YAML
    ExpandVariables   bool // Развертывать ли ссылки ${VAR}
}

// ComponentConfig — пользовательские компоненты и расширенные опции
type ComponentConfig struct {
    CustomValidator Validator        // Пользовательский валидатор ключей/значений
    CustomExpander  VariableExpander // Пользовательский раскрыватель переменных
    CustomAuditor   AuditLogger      // Пользовательский журнал аудита
    FileSystem      FileSystem       // Пользовательская файловая система (для тестов)
    AuditHandler    AuditHandler     // Пользовательский обработчик аудита
    AuditEnabled    bool             // Включить журнал аудита
    Prefix          string           // Обрабатывать только переменные с этим префиксом
}
```

## Поля конфигурации

### Обработка файлов

Эти поля управляют поведением загрузки файлов.

#### `Filenames` []string

Список путей к файлам для загрузки. **По умолчанию `[".env"]`**.

```go
cfg.Filenames = []string{".env", ".env.local"}
```

---

#### `FailOnMissingFile` bool

Возвращать ли ошибку при отсутствии файла. **По умолчанию `false`** (молча пропускает).

```go
cfg.FailOnMissingFile = true  // Ошибка при отсутствии файла
```

---

#### `OverwriteExisting` bool

Переопределять ли существующие переменные окружения. **По умолчанию `false`**.

```go
cfg.OverwriteExisting = true  // Разрешить переопределение
```

---

#### `AutoApply` bool

Автоматически применять к системному окружению (`os.Environ`) после загрузки. **По умолчанию `false`**.

```go
cfg.AutoApply = true  // Автоматически применять после загрузки
```

::: tip Внимание
Пакетная функция `Load()` автоматически устанавливает `AutoApply = true`. При создании Loader через `New()` нужно установить вручную.
:::

### Подстановка переменных

#### `ExpandVariables` bool

Включает подстановку переменных с синтаксисом `${VAR}`. **По умолчанию `true`**.

```go
cfg.ExpandVariables = true
```

Поддерживаемый синтаксис подстановки:

| Синтаксис | Описание |
|-----------|----------|
| `${VAR}` | Ссылка на переменную |
| `${VAR:-default}` | Использовать значение по умолчанию, если переменная не существует (если существует, даже пустая, используется исходное значение) |
| `${VAR:=default}` | Аналогично `${VAR:-default}` (значение по умолчанию при отсутствии переменной, не записывается обратно в хранилище) |
| `${VAR:?error}` | Ошибка, если переменная не существует или пуста |

::: tip Обработка пустой строки
`${VAR:-default}` и `${VAR:=default}` используют значение по умолчанию только когда переменная **не установлена**; если переменная явно установлена в пустую строку (`VAR=`), используется исходное пустое значение. Только `${VAR:?error}` считает пустую строку ошибкой. Подробнее см. [Подстановка переменных](/ru/env/guides/variable-expansion).
:::

### Ограничения безопасности

#### `MaxFileSize` int64

Максимальное количество байт на файл. **По умолчанию 2MB**, жёсткий предел 100MB.

```go
cfg.MaxFileSize = 10 * 1024 * 1024 // 10 MB
```

| Конфигурация | Значение по умолчанию | Жёсткий предел |
|--------------|------------------------|----------------|
| `MaxFileSize` | 2MB (2097152) | 100MB |

---

#### `MaxLineLength` int

Максимальная длина строки. **По умолчанию 1024**, жёсткий предел 64KB.

```go
cfg.MaxLineLength = 2048
```

| Конфигурация | Значение по умолчанию | Жёсткий предел |
|--------------|------------------------|----------------|
| `MaxLineLength` | 1024 | 65536 (64KB) |

---

#### `MaxKeyLength` int

Максимальная длина имени ключа. **По умолчанию 64**, жёсткий предел 1024.

```go
cfg.MaxKeyLength = 128
```

| Конфигурация | Значение по умолчанию | Жёсткий предел |
|--------------|------------------------|----------------|
| `MaxKeyLength` | 64 | 1024 |

---

#### `MaxValueLength` int

Максимальная длина значения. **По умолчанию 4096**, жёсткий предел 1MB.

```go
cfg.MaxValueLength = 8192
```

| Конфигурация | Значение по умолчанию | Жёсткий предел |
|--------------|------------------------|----------------|
| `MaxValueLength` | 4096 | 1048576 (1MB) |

---

#### `MaxVariables` int

Максимальное количество переменных на файл. **По умолчанию 500**, жёсткий предел 10000.

```go
cfg.MaxVariables = 1000
```

| Конфигурация | Значение по умолчанию | Жёсткий предел |
|--------------|------------------------|----------------|
| `MaxVariables` | 500 | 10000 |

---

#### `MaxExpansionDepth` int

Максимальная глубина подстановки переменных. **По умолчанию 5**, жёсткий предел 20.

```go
cfg.MaxExpansionDepth = 10
```

| Конфигурация | Значение по умолчанию | Жёсткий предел |
|--------------|------------------------|----------------|
| `MaxExpansionDepth` | 5 | 20 |

### Валидация ключей

#### `KeyPattern` *regexp.Regexp

Пользовательский шаблон сопоставления имён ключей. **По умолчанию `nil`** (используется быстрая побайтовая валидация).

::: tip Оптимизация производительности
Значение `nil` включает быструю побайтовую валидацию (примерно 10-кратный прирост производительности). Правило валидации по умолчанию: начинается с буквы, содержит только буквы, цифры, подчёркивания.
:::

```go
import "regexp"

// Пользовательский шаблон
cfg.KeyPattern = regexp.MustCompile(`^[A-Z][A-Z0-9_]*$`)
```

---

#### `AllowedKeys` []string

Белый список разрешённых имён ключей. Если пусто, разрешены все ключи (кроме запрещённых).

```go
cfg.AllowedKeys = []string{"APP_NAME", "APP_VERSION", "PORT"}
```

---

#### `ForbiddenKeys` []string

Дополнительный список запрещённых ключей (добавляется к встроенным запрещённым ключам).

```go
cfg.ForbiddenKeys = []string{"CUSTOM_DANGEROUS_VAR"}
```

::: tip Встроенные запрещённые ключи
Библиотека по умолчанию запрещает `PATH`, `LD_PRELOAD`, `LD_LIBRARY_PATH`, `DYLD_INSERT_LIBRARIES` и другие системно-важные переменные. Подробнее см. [Константы и ошибки](/ru/env/api-reference/constants#defaultforbiddenkeys).
:::

---

#### `RequiredKeys` []string

Список обязательных имён ключей. Проверяется при вызове `Validate()`.

```go
cfg.RequiredKeys = []string{"DB_HOST", "API_KEY"}
```

---

#### `ValidateValues` bool

Проверять безопасность значений (управляющие символы, нулевые байты и т. д.). **По умолчанию `true`**.

::: warning Рекомендация по безопасности
Рекомендуется всегда сохранять включённым; отключайте только в особых сценариях (например, когда нужно хранить значения с управляющими символами).
:::

```go
cfg.ValidateValues = true  // Включено по умолчанию
```

---

#### `ValidateUTF8` bool

Проверять, является ли значение корректной UTF-8 кодировкой. **По умолчанию `false`**.

```go
cfg.ValidateUTF8 = true  // Включить валидацию UTF-8
```

### Параметры разбора

#### `AllowExportPrefix` bool

Разрешать синтаксис `export KEY=value`. **По умолчанию `true`**.

```go
cfg.AllowExportPrefix = false  // Запретить префикс export
```

---

#### `AllowYamlSyntax` bool

Разрешать синтаксис в стиле YAML (`KEY: value`). **По умолчанию `false`**.

```go
cfg.AllowYamlSyntax = true
```

### Параметры JSON

#### `JSONNullAsEmpty` bool

Значение `null` в JSON преобразуется в пустую строку. **По умолчанию `true`**.

```go
cfg.JSONNullAsEmpty = true
```

---

#### `JSONNumberAsString` bool

Числа в JSON преобразуются в строки. **По умолчанию `true`**.

```go
cfg.JSONNumberAsString = true
```

---

#### `JSONBoolAsString` bool

Логические значения в JSON преобразуются в строки. **По умолчанию `true`**.

```go
cfg.JSONBoolAsString = true
```

---

#### `JSONMaxDepth` int

Максимальная глубина вложенности JSON. **По умолчанию 10**.

```go
cfg.JSONMaxDepth = 20
```

### Параметры YAML

#### `YAMLNullAsEmpty` bool

Значения `null`/`~` в YAML преобразуются в пустую строку. **По умолчанию `true`**.

```go
cfg.YAMLNullAsEmpty = true
```

---

#### `YAMLNumberAsString` bool

Числа в YAML преобразуются в строки. **По умолчанию `true`**.

```go
cfg.YAMLNumberAsString = true
```

---

#### `YAMLBoolAsString` bool

Логические значения в YAML преобразуются в строки. **По умолчанию `true`**.

```go
cfg.YAMLBoolAsString = true
```

---

#### `YAMLMaxDepth` int

Максимальная глубина вложенности YAML. **По умолчанию 10**.

```go
cfg.YAMLMaxDepth = 15
```

### Аудит

#### `AuditEnabled` bool

Включает журнал аудита. **По умолчанию `false`**.

```go
cfg.AuditEnabled = true
```

---

#### `AuditHandler` AuditHandler

Пользовательский обработчик аудита.

```go
cfg.AuditHandler = env.NewJSONAuditHandler(os.Stdout)
```

::: tip Подробности
[Журнал аудита](/ru/env/guides/audit-logging) для полного описания конфигурации аудита.
:::

### Расширенные опции

#### `Prefix` string

Обрабатывать только переменные с этим префиксом. **По умолчанию `""`** (обрабатывать все переменные).

```go
cfg.Prefix = "MYAPP_"  // Загружать только переменные, начинающиеся с MYAPP_
```

---

#### `FileSystem` FileSystem

Пользовательский интерфейс файловой системы (для тестирования).

```go
cfg.FileSystem = &MockFileSystem{}
```

---

#### `CustomValidator` Validator

Пользовательский валидатор ключей/значений. Переопределяет встроенный валидатор.

```go
cfg.CustomValidator = &MyValidator{}
```

---

#### `CustomExpander` VariableExpander

Пользовательский раскрыватель переменных. Переопределяет встроенный раскрыватель.

```go
cfg.CustomExpander = &MyExpander{}
```

---

#### `CustomAuditor` AuditLogger

Пользовательский журнал аудита. Переопределяет встроенный аудитор.

```go
cfg.CustomAuditor = &MyAuditLogger{}
```

---

## Фабричные функции

### DefaultConfig

```go
func DefaultConfig() Config
```

Возвращает безопасную конфигурацию по умолчанию.

**Значения по умолчанию:**

| Поле | Значение |
|------|----------|
| `Filenames` | `[".env"]` |
| `FailOnMissingFile` | `false` |
| `OverwriteExisting` | `false` |
| `AutoApply` | `false` |
| `ExpandVariables` | `true` |
| `MaxFileSize` | 2MB |
| `MaxLineLength` | 1024 |
| `MaxKeyLength` | 64 |
| `MaxValueLength` | 4096 |
| `MaxVariables` | 500 |
| `MaxExpansionDepth` | 5 |
| `ValidateValues` | `true` |
| `KeyPattern` | `nil` (быстрая валидация) |
| `AllowExportPrefix` | `true` |
| `AllowYamlSyntax` | `false` |
| `JSONNullAsEmpty` | `true` |
| `JSONNumberAsString` | `true` |
| `JSONBoolAsString` | `true` |
| `JSONMaxDepth` | 10 |
| `YAMLNullAsEmpty` | `true` |
| `YAMLNumberAsString` | `true` |
| `YAMLBoolAsString` | `true` |
| `YAMLMaxDepth` | 10 |
| `ValidateUTF8` | `false` |
| `AuditEnabled` | `false` |
| `Prefix` | `""` |

---

### DevelopmentConfig

```go
func DevelopmentConfig() Config
```

Возвращает конфигурацию для среды разработки (мягкие ограничения).

**Отличия от конфигурации по умолчанию:**
- `OverwriteExisting`: `true`
- `AllowYamlSyntax`: `true`
- `MaxFileSize`: 10MB

::: tip Гарантия безопасности
`ValidateValues` остаётся `true` во всех пресетах конфигурации (как и значение по умолчанию), обеспечивая безопасность независимо от среды.
:::

```go
cfg := env.DevelopmentConfig()
cfg.Filenames = []string{".env.development"}
loader, _ := env.New(cfg)
```

---

### TestingConfig

```go
func TestingConfig() Config
```

Возвращает конфигурацию для среды тестирования.

**Отличия от конфигурации по умолчанию:**
- `OverwriteExisting`: `true`
- `MaxFileSize`: 64KB
- `MaxVariables`: 50

```go
func TestSomething(t *testing.T) {
    cfg := env.TestingConfig()
    cfg.Filenames = []string{".env.test"}
    loader, _ := env.New(cfg)
    defer loader.Close()
}
```

---

### ProductionConfig

```go
func ProductionConfig() Config
```

Возвращает конфигурацию для продакшн-среды (строгая валидация + аудит).

**Отличия от конфигурации по умолчанию:**
- `FailOnMissingFile`: `true`
- `AuditEnabled`: `true`
- `MaxFileSize`: 64KB
- `MaxVariables`: 50

```go
cfg := env.ProductionConfig()
cfg.RequiredKeys = []string{"DB_HOST", "API_KEY"}
cfg.AuditHandler = env.NewJSONAuditHandler(os.Stdout)
loader, _ := env.New(cfg)
```

---

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

---

## Методы

### Validate

```go
func (c *Config) Validate() error
```

Проверяет валидность конфигурации. Проверяет, что все значения ограничений находятся в допустимом диапазоне.

```go
cfg := env.DefaultConfig()
cfg.MaxFileSize = 1000

if err := cfg.Validate(); err != nil {
    // Конфигурация недопустима
}
```

**Правила валидации:**
- Все значения ограничений должны быть положительными
- Все значения ограничений не должны превышать жёсткие пределы
- `KeyPattern`, если не nil, должен сопоставляться с допустимым именем ключа (например `TEST_KEY`), не должен сопоставляться с пустой строкой и не должен сопоставляться с именами ключей, начинающимися с цифры
- `JSONMaxDepth` и `YAMLMaxDepth` должны быть в диапазоне 1-100

---

### IsZero

```go
func (c *Config) IsZero() bool
```

Проверяет, является ли Config неинициализированным нулевым значением. Используется для определения, следует ли использовать `DefaultConfig()`.

**Возвращает:**
- `bool` - является ли конфигурация нулевым значением

**Диапазон проверки:**
- Числовые ограничения (MaxFileSize, MaxVariables и т. д.)
- Логические поля (ValidateValues, AutoApply и т. д.)
- Поля указателей/интерфейсов (KeyPattern, FileSystem и т. д.)
- Поля срезов (Filenames, RequiredKeys и т. д.)

::: warning Внимание
Частично инициализированный Config может не определяться как нулевое значение. Рекомендуется всегда начинать кастомизацию конфигурации с `DefaultConfig()`:

```go
// Рекомендуется
cfg := env.DefaultConfig()
cfg.Filenames = []string{".env.production"}

// Не рекомендуется (часть полей — нулевые значения)
var cfg env.Config
cfg.Filenames = []string{".env.production"}
```
:::

---

## Примеры использования

### Базовая конфигурация

```go
cfg := env.DefaultConfig()
cfg.Filenames = []string{".env", ".env.local"}
cfg.OverwriteExisting = true

loader, err := env.New(cfg)
if err != nil {
    log.Fatal(err)
}
defer loader.Close()
```

### Продакшн-конфигурация

```go
cfg := env.ProductionConfig()
cfg.RequiredKeys = []string{"DB_HOST", "DB_PORT", "API_KEY"}
cfg.AuditHandler = env.NewJSONAuditHandler(os.Stdout)

loader, err := env.New(cfg)
if err != nil {
    log.Fatal(err)
}
defer loader.Close()

if err := loader.LoadFiles(".env"); err != nil {
    log.Fatal(err)
}

if err := loader.Validate(); err != nil {
    log.Fatal("Отсутствует обязательная конфигурация:", err)
}
```

### Использование префиксного фильтра

```go
cfg := env.DefaultConfig()
cfg.Prefix = "MYAPP_"  // Загружать только MYAPP_KEY1, MYAPP_KEY2 и т. д.
cfg.Filenames = []string{".env"}

loader, _ := env.New(cfg)
// В loader только переменные, начинающиеся с MYAPP_
```

### Пользовательская валидация

```go
import "regexp"

cfg := env.DefaultConfig()
// Разрешать только ключи, начинающиеся с заглавной буквы
cfg.KeyPattern = regexp.MustCompile(`^[A-Z][A-Z0-9_]*$`)
// Добавить пользовательские запрещённые ключи
cfg.ForbiddenKeys = []string{"DEBUG", "TRACE"}

loader, _ := env.New(cfg)
```

---

## Связанная документация

- [Loader API](/ru/env/api-reference/loader) - методы загрузчика
- [Константы и ошибки](/ru/env/api-reference/constants) - константы ограничений и типы ошибок
- [Журнал аудита](/ru/env/guides/audit-logging) - руководство по конфигурации аудита
