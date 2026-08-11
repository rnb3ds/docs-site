---
sidebar_label: "Константы и ошибки"
title: "Константы и ошибки - CyberGo env | сигнальные ошибки и константы безопасности"
description: "Справочник констант и ошибок CyberGo env: ограничения DefaultMaxFileSize и MaxVariables, сигнальные ошибки ErrFileNotFound, тип ParseError, запрещённые ключи DefaultForbiddenKeys и служебные функции IsSensitiveKey, MaskValue."
sidebar_position: 7
---

# Константы и ошибки

Константы, типы ошибок, сигнальные ошибки и предопределённые переменные, определённые в библиотеке.

## Константы ограничений безопасности

### Ограничения по умолчанию

```go
const (
    // DefaultMaxFileSize — максимальное количество байт на файл
    DefaultMaxFileSize int64 = 2 * 1024 * 1024  // 2 MB

    // DefaultMaxLineLength — максимальная длина строки
    DefaultMaxLineLength int = 1024  // 1 KB

    // DefaultMaxKeyLength — максимальная длина имени ключа
    DefaultMaxKeyLength int = 64

    // DefaultMaxValueLength — максимальная длина значения
    DefaultMaxValueLength int = 4096  // 4 KB

    // DefaultMaxVariables — максимальное количество переменных на файл
    DefaultMaxVariables int = 500

    // DefaultMaxExpansionDepth — максимальная глубина подстановки переменных
    DefaultMaxExpansionDepth int = 5
)
```

### Жёсткие пределы

::: warning Внимание
Ниже приведены внутренние жёсткие пределы библиотеки (не экспортируются), используемые для внутренних проверок `Config.Validate()`. Пользователь не может напрямую ссылаться на эти константы, но `cfg.Validate()` автоматически проверяет, не превышает ли конфигурация эти ограничения.
:::

| Константа | Значение | Описание |
|-----------|----------|----------|
| HardMaxFileSize | 100 MB | Жёсткий предел размера файла |
| HardMaxLineLength | 64 KB | Жёсткий предел длины строки |
| HardMaxKeyLength | 1024 | Жёсткий предел длины ключа |
| HardMaxValueLength | 1 MB | Жёсткий предел длины значения |
| HardMaxVariables | 10000 | Жёсткий предел количества переменных |
| HardMaxExpansionDepth | 20 | Жёсткий предел глубины подстановки |

Валидация конфигурации проверяет превышение жёстких ограничений:

```go
cfg := env.DefaultConfig()
cfg.MaxFileSize = 200 * 1024 * 1024  // Превышает предел 100MB

if err := cfg.Validate(); err != nil {
    // Возвращает ошибку: MaxFileSize exceeds hard limit
}
```

## Сигнальные ошибки

::: warning Внимание
Следующие сигнальные ошибки являются предопределёнными символами, однако в текущей реализации некоторые сценарии **не сопоставляются с этими сигнальными ошибками через `errors.Is`**: запрещённые ключи возвращают `*SecurityError` (сопоставляется через `errors.Is(err, ErrSecurityViolation)`), недопустимый формат ключа и отсутствие обязательных ключей возвращают `*ValidationError` (извлекается через `errors.As`). Подробнее см. в разделах о типах ошибок.
:::

### Файловые ошибки

```go
var ErrFileNotFound = errors.New("file not found")
var ErrFileTooLarge = errors.New("file exceeds maximum size limit")
```

Способ проверки:

```go
err := loader.LoadFiles(".env")
if errors.Is(err, env.ErrFileNotFound) {
    // Файл не существует
}
if errors.Is(err, env.ErrFileTooLarge) {
    // Файл слишком большой
}
```

### Ошибки разбора

```go
var ErrLineTooLong = errors.New("line exceeds maximum length limit")
var ErrInvalidKey = errors.New("invalid key format")
var ErrDuplicateKey = errors.New("duplicate key encountered")
```

### Ошибки безопасности

```go
var ErrForbiddenKey = errors.New("key is forbidden for security reasons")
var ErrSecurityViolation = errors.New("security policy violation")
var ErrInvalidValue = errors.New("invalid value content")
```

Проверка запрещённых ключей:

```go
err := loader.Set("PATH", "value")
if errors.Is(err, env.ErrSecurityViolation) {
    // Попытка установить запрещённый ключ возвращает *SecurityError
}
```

### Ошибки подстановки

```go
var ErrExpansionDepth = errors.New("variable expansion depth exceeded")
```

### Ошибки ограничений

```go
var ErrMaxVariables = errors.New("maximum number of variables exceeded")
```

### Ошибки состояния

```go
var ErrClosed = errors.New("loader has been closed")
var ErrInvalidConfig = errors.New("invalid configuration")
var ErrAlreadyInitialized = errors.New("default loader already initialized")
var ErrNotInitialized = errors.New("default loader not initialized; call Load() first")
var ErrMissingRequired = errors.New("required key is missing")
```

**Способ проверки:**

```go
// Проверка, закрыт ли загрузчик
if errors.Is(err, env.ErrClosed) {
    // Загрузчик закрыт
}

// Проверка, инициализирован ли загрузчик по умолчанию
if errors.Is(err, env.ErrAlreadyInitialized) {
    // Загрузчик по умолчанию уже существует, нельзя повторно вызвать Load()
}

// Проверка, не инициализирован ли загрузчик по умолчанию
if errors.Is(err, env.ErrNotInitialized) {
    // Нужно сначала вызвать env.Load() или env.LoadWithConfig()
}

// Проверка отсутствия обязательного ключа (фактически возвращает *ValidationError{Rule:"required"})
var valErr *env.ValidationError
if errors.As(err, &valErr) && valErr.Rule == "required" {
    // Отсутствует обязательный ключ
}
```

### Ошибки адаптера

```go
var ErrValidateRequiredUnsupported = errors.New(
    "custom validator does not implement ValidateRequired; " +
    "implement Validator interface for required key validation",
)
```

Возвращается, когда пользовательский валидатор реализует только интерфейс `KeyValidator`, но не полный интерфейс `Validator`, при вызове `ValidateRequired`.

**Способ проверки:**

```go
if errors.Is(err, env.ErrValidateRequiredUnsupported) {
    // Пользовательский валидатор не поддерживает валидацию обязательных ключей
    // Нужно реализовать полный интерфейс Validator
}
```

::: tip Решение
Реализуйте интерфейс `Validator` (включающий три метода: ValidateKey, ValidateValue, ValidateRequired), а не только `KeyValidator`.
:::

## Типы ошибок

### ParseError

Ошибка разбора, содержащая информацию о позиции:

```go
type ParseError struct {
    File    string  // Имя файла
    Line    int     // Номер строки
    Content string  // Содержимое ошибки (маскированное)
    Err     error   // Исходная ошибка
}
```

Пример использования:

```go
err := loader.LoadFiles(".env")
var parseErr *env.ParseError
if errors.As(err, &parseErr) {
    fmt.Printf("Ошибка разбора %s:%d: %v\n",
        parseErr.File, parseErr.Line, parseErr.Err)
}
```

### ValidationError

Ошибка валидации:

```go
type ValidationError struct {
    Field   string  // Имя поля
    Value   string  // Значение (маскированное)
    Rule    string  // Правило
    Message string  // Сообщение
}
```

### SecurityError

Ошибка безопасности:

```go
type SecurityError struct {
    Action  string  // Действие
    Reason  string  // Причина
    Key     string  // Имя ключа (маскированное)
    Details string  // Дополнительные подробности
}
```

Пример использования:

```go
var secErr *env.SecurityError
if errors.As(err, &secErr) {
    fmt.Printf("Ошибка безопасности: %s - %s\n", secErr.Action, secErr.Reason)
}
```

### FileError

Ошибка файловой операции:

```go
type FileError struct {
    Path  string  // Путь к файлу
    Op    string  // Операция (open, stat, size_check)
    Err   error   // Исходная ошибка
    Size  int64   // Размер файла (при проверке Size)
    Limit int64   // Ограничение (при проверке Size)
}
```

Пример использования:

```go
var fileErr *env.FileError
if errors.As(err, &fileErr) {
    fmt.Printf("Файл %s размер %d превышает ограничение %d\n",
        fileErr.Path, fileErr.Size, fileErr.Limit)
}
```

### ExpansionError

Ошибка подстановки переменных:

```go
type ExpansionError struct {
    Key   string             // Имя ключа
    Depth int                // Текущая глубина
    Limit int                // Ограничение
    Chain string             // Цепочка подстановки (санитизированная)
    Kind  ExpansionErrorKind // Категория причины ошибки (нулевое значение = глубина/цикл)
}
```

**Классификация ошибок (поле Kind):**

```go
type ExpansionErrorKind int

const (
    // ExpansionDepthKind означает, что подстановка достигла ограничения рекурсивной глубины
    // или обнаружила цикл переменных. Это нулевое значение, поэтому обычные ошибки глубины/цикла
    // не требуют явной классификации.
    // errors.Is(err, ErrExpansionDepth) может сопоставлять эту ошибку.
    ExpansionDepthKind ExpansionErrorKind = iota

    // ExpansionRequiredKind означает, что обязательная переменная (${VAR:?message}) не установлена
    // или пуста. Это не переполнение глубины, поэтому не сопоставляется с ErrExpansionDepth.
    ExpansionRequiredKind
)
```

**Поведение `errors.Is`:** `*ExpansionError` сопоставляется с `ErrExpansionDepth` только при `Kind != ExpansionRequiredKind`. Ошибки обязательных переменных относятся к независимому режиму отказа и не сопоставляются через `ErrExpansionDepth`.

Пример использования:

```go
var expErr *env.ExpansionError
if errors.As(err, &expErr) {
    switch expErr.Kind {
    case env.ExpansionDepthKind:
        // Переполнение глубины или цикл: errors.Is(err, env.ErrExpansionDepth) == true
        fmt.Printf("Глубина %d/%d, цепочка: %s\n", expErr.Depth, expErr.Limit, expErr.Chain)
    case env.ExpansionRequiredKind:
        // Обязательная переменная не установлена: errors.Is(err, env.ErrExpansionDepth) == false
        fmt.Printf("Обязательная переменная %s не установлена\n", expErr.Key)
    }
}
```

### JSONError

Ошибка разбора JSON:

```go
type JSONError struct {
    Path    string  // Путь к файлу
    Message string  // Сообщение об ошибке
    Err     error   // Исходная ошибка
}
```

### YAMLError

Ошибка разбора YAML:

```go
type YAMLError struct {
    Path    string  // Путь к файлу
    Line    int     // Номер строки
    Column  int     // Номер столбца
    Message string  // Сообщение об ошибке
    Err     error   // Исходная ошибка
}
```

### MarshalError

Ошибка сериализации:

```go
type MarshalError struct {
    Field   string  // Имя поля
    Message string  // Сообщение об ошибке
}

func IsMarshalError(err error) bool  // Функция проверки
```

## Предопределённые переменные

### DefaultForbiddenKeys

Встроенный список запрещённых ключей, предотвращающий изменение системно-важных переменных:

::: warning Внимание
`defaultForbiddenKeys` — внутренняя переменная библиотеки (не экспортируется), недоступна напрямую через `env.DefaultForbiddenKeys`. Ниже приведён полный список для справки.
:::

| Категория | Запрещённые ключи |
|-----------|-------------------|
| Системный путь | `PATH` |
| Динамический линковщик (Linux) | `LD_PRELOAD`, `LD_PRELOAD_32`, `LD_PRELOAD_64`, `LD_LIBRARY_PATH`, `LD_LIBRARY_PATH_32`, `LD_LIBRARY_PATH_64`, `LD_AUDIT`, `LD_DEBUG` |
| macOS | `DYLD_INSERT_LIBRARIES`, `DYLD_LIBRARY_PATH` |
| Windows | `COMSPEC`, `PATHEXT`, `SYSTEMROOT`, `WINDIR` |
| Shell | `SHELL`, `ENV`, `BASH_ENV`, `IFS` |
| Рантаймы языков | `PYTHONPATH`, `NODE_PATH`, `PERL5OPT`, `RUBYLIB` |

**Описание рисков:**

| Ключ | Тип риска | Описание |
|------|-----------|----------|
| `PATH` | Перехват команд | Изменение пути поиска команд |
| `LD_PRELOAD` | Внедрение библиотек | Предзагрузка вредоносных динамических библиотек |
| `LD_LIBRARY_PATH` | Перехват библиотек | Изменение пути поиска библиотек |
| `DYLD_INSERT_LIBRARIES` | Внедрение библиотек | Внедрение библиотек macOS |
| `COMSPEC` | Перехват команд | Перекрытие пути интерпретатора команд Windows |
| `PATHEXT` | Перехват команд | Подмена расширений исполняемых файлов Windows |
| `SYSTEMROOT` | Разрушение системы | Подмена корневого каталога Windows |
| `WINDIR` | Разрушение системы | Подмена каталога Windows |
| `PYTHONPATH` | Перехват модулей | Путь поиска модулей Python |
| `IFS` | Атака на разбор | Изменение разделителя полей |

**Пример использования:**

```go
// Установка запрещённого ключа возвращает *SecurityError
err := loader.Set("PATH", "/malicious/path")
if errors.Is(err, env.ErrSecurityViolation) {
    // Ключ запрещён
}

// Добавление дополнительных запрещённых ключей
cfg := env.DefaultConfig()
cfg.ForbiddenKeys = []string{"MY_SENSITIVE_VAR"}
```

### SensitiveKeyPatterns

Список шаблонов чувствительных ключей для автоматического обнаружения чувствительной конфигурации. Имена ключей, содержащие эти шаблоны (без учёта регистра), идентифицируются как чувствительные:

::: warning Внимание
`sensitiveKeyPatterns` — внутренняя переменная библиотеки (не экспортируется), доступна косвенно через функцию `IsSensitiveKey()`. Ниже приведены основные категории чувствительных шаблонов для справки.
:::

**Основные категории чувствительных шаблонов:**

| Категория | Примеры шаблонов |
|-----------|------------------|
| Аутентификация и авторизация | `PASSWORD`, `SECRET`, `TOKEN`, `AUTH`, `CREDENTIAL`, `PASSPHRASE`, `SESSION`, `COOKIE` |
| API и ключи | `API_KEY`, `APIKEY`, `ACCESS_KEY`, `SECRET_KEY`, `PRIVATE_KEY`, `PUBLIC_KEY` |
| Шифрование и безопасность | `PRIVATE`, `ENCRYPTION_KEY`, `ENCRYPT_KEY`, `DECRYPT_KEY`, `SIGNING_KEY`, `SIGN_KEY`, `VERIFY_KEY` |
| Финансы и PII | `SSN`, `SOCIAL_SECURITY`, `CREDIT_CARD`, `CARD_NUMBER`, `CVV`, `CVC`, `CCV`, `PAN` |
| Криптовалюта | `MNEMONIC`, `SEED`, `RECOVERY`, `WALLET`, `PRIVATE_ADDRESS` |
| Базы данных | `CONNECTION_STRING`, `CONN_STRING`, `DATABASE_URL`, `DB_PASSWORD` |
| Облачные сервисы | `AWS_SECRET`, `AZURE_KEY`, `GCP_KEY`, `SERVICE_ACCOUNT` |

**Правила сопоставления:**
- Без учёта регистра
- Если имя ключа содержит любой из шаблонов, он считается чувствительным

**Пример использования:**

```go
// Проверка, является ли ключ чувствительным
if env.IsSensitiveKey("DB_PASSWORD") {
    // Обработка безопасным способом
    secret := env.GetSecure("DB_PASSWORD")
    if secret != nil {
        defer secret.Release()
    }
}
```

### DefaultKeyPattern

Шаблон валидации имён ключей по умолчанию:

```go
var DefaultKeyPattern *regexp.Regexp = nil
```

::: tip Оптимизация производительности
Значение `nil` включает быструю побайтовую валидацию (примерно 10-кратный прирост производительности).
Правило валидации по умолчанию: начинается с буквы, содержит только буквы, цифры, подчёркивания.
:::

**Пользовательский шаблон:**

```go
import "regexp"

cfg := env.DefaultConfig()
// Разрешать только ключи, начинающиеся с заглавной буквы
cfg.KeyPattern = regexp.MustCompile(`^[A-Z][A-Z0-9_]{1,63}$`)
```

## Функции инструментов безопасности

::: tip Полная документация
Полную документацию функций инструментов безопасности `IsSensitiveKey`, `MaskValue`, `SanitizeForLog` также можно найти в [SecureValue API](./secure-value#Функции-инструментов-безопасности).
:::

### IsSensitiveKey

```go
func IsSensitiveKey(key string) bool
```

Проверяет, соответствует ли имя ключа чувствительным шаблонам.

```go
if env.IsSensitiveKey("DB_PASSWORD") {
    // Чувствительный ключ, обрабатывайте безопасно
    secret := env.GetSecure("DB_PASSWORD")
    defer secret.Release()
}
```

### MaskValue

```go
func MaskValue(key, value string) string
```

Возвращает маскированное значение в зависимости от чувствительности ключа.

```go
// Чувствительный ключ — возвращает формат [MASKED:N chars]
masked := env.MaskValue("API_KEY", "secret123")
// Возвращает: [MASKED:9 chars]

// Нечувствительный ключ — возвращает исходное значение (обрезается, если > 20 символов)
masked := env.MaskValue("APP_NAME", "myapp")
// Возвращает: myapp
masked := env.MaskValue("DESCRIPTION", "this is a very long description text")
// Возвращает: this is a very lo...
```

### MaskKey

```go
func MaskKey(key string) string
```

Маскирует имя ключа для логов.

```go
masked := env.MaskKey("DB_PASSWORD")
// Возвращает: DB***
```

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
// Длинные строки будут обрезаны
log := "This is a very long log message that exceeds 50 characters and will be truncated"
clean := env.MaskSensitiveInString(log)
// Возвращает: "This is a very long log message that exceeds 50..."

// Короткие строки остаются без изменений
short := "Short message"
clean := env.MaskSensitiveInString(short)
// Возвращает: "Short message"
```

::: warning Внимание
Эта функция в основном используется для обрезки длинных строк. Для автоматического маскирования чувствительных пар ключ-значение используйте `SanitizeForLog`.
:::

### SanitizeForLog

```go
func SanitizeForLog(s string) string
```

Очищает строку от информации о чувствительных парах ключ-значение. Автоматически обнаруживает и маскирует чувствительные значения в формате `key=value`.

**Параметры:**
- `s` - исходная строка

**Возвращает:**
- `string` - очищенная строка

**Обнаруживаемые шаблоны чувствительных ключей:**
- `password=`, `secret=`, `token=`, `auth=`, `credential=`, `passphrase=`, `session=`, `cookie=`
- `api_key=`, `apikey=`, `access_key=`, `secret_key=`, `private_key=`, `public_key=`
- `encrypt_key=`, `decrypt_key=`, `signing_key=`
- `ssn=`, `credit_card=`, `card_number=`, `cvv=`, `cvc=`
- `mnemonic=`, `seed=`, `recovery=`, `wallet=`
- `connection_string=`, `database_url=`, `db_password=`

```go
// Автоматическое маскирование чувствительных пар ключ-значение
msg := "Connected with password=secret123 api_key=abc123"
clean := env.SanitizeForLog(msg)
// Возвращает: "Connected with password=[MASKED] api_key=[MASKED]"

// Нечувствительные пары ключ-значение остаются без изменений
msg := "Config loaded: app_name=myapp port=8080"
clean := env.SanitizeForLog(msg)
// Возвращает: "Config loaded: app_name=myapp port=8080"
```

::: tip Сценарий использования
Подходит для вывода в логи, сообщений об ошибках, отладочной информации, где требуется автоматическая фильтрация чувствительных пар ключ-значение.
:::

### ClearBytes

```go
func ClearBytes(b []byte)
```

Безопасно обнуляет срез байтов.

```go
sensitive := []byte("secret-data")
// Использование...
env.ClearBytes(sensitive)
// sensitive теперь все 0
```

## Константы FileFormat

Типы форматов файлов:

```go
type FileFormat int

const (
    FormatAuto  FileFormat = iota  // Автоопределение
    FormatEnv                      // Формат .env
    FormatJSON                     // Формат JSON
    FormatYAML                     // Формат YAML
)
```

Пример использования:

```go
// Определение формата
format := env.DetectFormat("config.json")  // FormatJSON

// Сериализация с указанием формата
data, _ := env.Marshal(cfg, env.FormatJSON)

// Строковое представление формата
fmt.Println(format.String())  // "json"
```

## Шаблоны проверки ошибок

### Шаблон errors.Is

Проверка сигнальных ошибок:

```go
err := loader.LoadFiles(".env")

switch {
case errors.Is(err, env.ErrFileNotFound):
    // Файл не существует
case errors.Is(err, env.ErrFileTooLarge):
    // Файл слишком большой
case errors.Is(err, env.ErrSecurityViolation):
    // Запрещённый ключ
case errors.Is(err, env.ErrClosed):
    // Загрузчик закрыт
}
```

### Шаблон errors.As

Извлечение подробной информации об ошибках:

```go
err := loader.LoadFiles(".env")

var parseErr *env.ParseError
if errors.As(err, &parseErr) {
    fmt.Printf("Ошибка разбора в %s на строке %d\n", parseErr.File, parseErr.Line)
}

var fileErr *env.FileError
if errors.As(err, &fileErr) {
    fmt.Printf("Файл %s размер %d превышает ограничение %d\n",
        fileErr.Path, fileErr.Size, fileErr.Limit)
}

var secErr *env.SecurityError
if errors.As(err, &secErr) {
    fmt.Printf("Ошибка безопасности: %s - %s\n", secErr.Action, secErr.Reason)
}
```

## Полный пример обработки ошибок

```go
package main

import (
    "errors"
    "log"

    "github.com/cybergodev/env"
)

func main() {
    cfg := env.ProductionConfig()
    cfg.FailOnMissingFile = true

    loader, err := env.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer loader.Close()

    err = loader.LoadFiles(".env")
    if err != nil {
        switch {
        case errors.Is(err, env.ErrFileNotFound):
            log.Fatal("Файл конфигурации не существует")

        case errors.Is(err, env.ErrFileTooLarge):
            log.Fatal("Файл конфигурации слишком большой")

        case errors.Is(err, env.ErrClosed):
            log.Fatal("Загрузчик закрыт")

        default:
            var parseErr *env.ParseError
            if errors.As(err, &parseErr) {
                log.Fatalf("Ошибка разбора %s:%d - %v",
                    parseErr.File, parseErr.Line, parseErr.Err)
            }

            var fileErr *env.FileError
            if errors.As(err, &fileErr) {
                log.Fatalf("Файловая ошибка %s - %v", fileErr.Path, fileErr.Err)
            }

            var secErr *env.SecurityError
            if errors.As(err, &secErr) {
                log.Fatalf("Ошибка безопасности: %s - %s", secErr.Action, secErr.Reason)
            }

            var jsonErr *env.JSONError
            if errors.As(err, &jsonErr) {
                log.Fatalf("JSON ошибка %s: %s", jsonErr.Path, jsonErr.Message)
            }

            var yamlErr *env.YAMLError
            if errors.As(err, &yamlErr) {
                log.Fatalf("YAML ошибка %s:%d:%d - %s",
                    yamlErr.Path, yamlErr.Line, yamlErr.Column, yamlErr.Message)
            }

            log.Fatal(err)
        }
    }

    // Валидация обязательных ключей
    if err := loader.Validate(); err != nil {
        var valErr *env.ValidationError
        if errors.As(err, &valErr) {
            log.Fatalf("Валидация не прошла: %s - %s", valErr.Field, valErr.Message)
        }
        log.Fatal(err)
    }
}
```

## Связанная документация

- [SecureValue API](/ru/env/api-reference/secure-value) - полный API функций безопасности
- [Config API](/ru/env/api-reference/config) - параметры конфигурации и ограничения
- [Обзор безопасности](/ru/env/security/) - архитектура безопасности и ключевые особенности
- [Контрольный список для продакшена](/ru/env/security/production-checklist) - проверка безопасности перед запуском
