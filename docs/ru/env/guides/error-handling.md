---
sidebar_label: "Обработка ошибок"
title: "Обработка ошибок - CyberGo env | сигнальные ошибки и стратегии восстановления"
description: "Руководство по обработке ошибок CyberGo env: точное сопоставление 16 сигнальных ошибок через errors.Is, извлечение контекста структурированных ошибок ParseError/FileError/SecurityError через errors.As, стратегии восстановления и деградации, отслеживание цепочки ошибок Unwrap, практика классификации ошибок в продакшене."
sidebar_position: 5
sidebar_icon: "🛡️"
---

# Обработка ошибок

Библиотека env предоставляет структурированный механизм обработки ошибок, поддерживающий шаблоны `errors.Is` и `errors.As`.

## Сигнальные ошибки

### Файловые ошибки

```go
var (
    ErrFileNotFound  = errors.New("file not found")
    ErrFileTooLarge  = errors.New("file exceeds maximum size limit")
)
```

**Пример использования:**

```go
err := loader.LoadFiles(".env")
if errors.Is(err, env.ErrFileNotFound) {
    log.Println("Файл конфигурации не существует")
}
if errors.Is(err, env.ErrFileTooLarge) {
    log.Println("Файл конфигурации слишком большой")
}
```

### Ошибки разбора

```go
var (
    ErrLineTooLong  = errors.New("line exceeds maximum length limit")
    ErrInvalidKey   = errors.New("invalid key format")
    ErrDuplicateKey = errors.New("duplicate key encountered")
)
```

### Ошибки безопасности

```go
var (
    ErrForbiddenKey      = errors.New("key is forbidden for security reasons")
    ErrSecurityViolation = errors.New("security policy violation")
    ErrInvalidValue      = errors.New("invalid value content")
)
```

**Проверка запрещённых ключей (фактически возвращает `*SecurityError`, сопоставляется с `ErrSecurityViolation`):**

```go
err := loader.Set("PATH", "/malicious")
if errors.Is(err, env.ErrSecurityViolation) {
    log.Println("Попытка установить запрещённый ключ")
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
var (
    ErrClosed             = errors.New("loader has been closed")
    ErrInvalidConfig      = errors.New("invalid configuration")
    ErrAlreadyInitialized = errors.New("default loader already initialized")
    ErrNotInitialized     = errors.New("default loader not initialized; call Load() first")
    ErrMissingRequired    = errors.New("required key is missing")
)
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

// Проверка отсутствия обязательного ключа (фактически возвращает *ValidationError, Rule=="required")
var valErr *env.ValidationError
if errors.As(err, &valErr) && valErr.Rule == "required" {
    // Отсутствует обязательный ключ: valErr.Message содержит список недостающих ключей
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

## Структурированные типы ошибок

### ParseError

Ошибка разбора, содержащая информацию о позиции:

```go
type ParseError struct {
    File    string  // Имя файла
    Line    int     // Номер строки
    Content string  // Содержимое ошибки
    Err     error   // Исходная ошибка
}
```

**Пример использования:**

```go
err := loader.LoadFiles(".env")

var parseErr *env.ParseError
if errors.As(err, &parseErr) {
    log.Printf("Ошибка разбора %s:%d - %s\n",
        parseErr.File, parseErr.Line, parseErr.Err)
    // Вывод: Ошибка разбора .env:15 - invalid key format
}
```

### FileError

Ошибка файловой операции:

```go
type FileError struct {
    Path  string  // Путь к файлу
    Op    string  // Операция
    Err   error   // Исходная ошибка
    Size  int64   // Размер файла
    Limit int64   // Ограничение
}
```

**Пример использования:**

```go
var fileErr *env.FileError
if errors.As(err, &fileErr) {
    if fileErr.Size > 0 {
        log.Printf("Файл %s размер %d превышает ограничение %d\n",
            fileErr.Path, fileErr.Size, fileErr.Limit)
    }
}
```

### SecurityError

Ошибка безопасности:

```go
type SecurityError struct {
    Action  string  // Действие
    Reason  string  // Причина
    Key     string  // Имя ключа
    Details string  // Подробности
}
```

**Пример использования:**

```go
var secErr *env.SecurityError
if errors.As(err, &secErr) {
    log.Printf("Ошибка безопасности: %s - %s (ключ: %s)\n",
        secErr.Action, secErr.Reason, secErr.Key)
}
```

### ValidationError

Ошибка валидации:

```go
type ValidationError struct {
    Field   string  // Имя поля
    Value   string  // Значение
    Rule    string  // Правило
    Message string  // Сообщение
}
```

**Пример использования:**

```go
var valErr *env.ValidationError
if errors.As(err, &valErr) {
    log.Printf("Валидация не прошла: поле %s - %s\n", valErr.Field, valErr.Message)
}
```

### ExpansionError

Ошибка подстановки переменных:

```go
type ExpansionError struct {
    Key   string             // Имя ключа
    Depth int                // Текущая глубина
    Limit int                // Ограничение
    Chain string             // Цепочка подстановки
    Kind  ExpansionErrorKind // Категория причины ошибки (нулевое значение = глубина/цикл)
}
```

**Пример использования:**

```go
var expErr *env.ExpansionError
if errors.As(err, &expErr) {
    log.Printf("Превышена глубина подстановки: %s (цепочка: %s)\n", expErr.Key, expErr.Chain)
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

**Пример использования:**

```go
var jsonErr *env.JSONError
if errors.As(err, &jsonErr) {
    log.Printf("JSON ошибка %s: %s\n", jsonErr.Path, jsonErr.Message)
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

**Пример использования:**

```go
var yamlErr *env.YAMLError
if errors.As(err, &yamlErr) {
    log.Printf("YAML ошибка %s:%d:%d - %s\n",
        yamlErr.Path, yamlErr.Line, yamlErr.Column, yamlErr.Message)
}
```

### MarshalError

Ошибка сериализации/десериализации:

```go
type MarshalError struct {
    Field   string  // Имя поля
    Message string  // Сообщение об ошибке
}
```

**Пример использования:**

```go
_, err := env.MarshalStruct(invalidData)
if err != nil && env.IsMarshalError(err) {
    var marshalErr *env.MarshalError
    if errors.As(err, &marshalErr) {
        log.Printf("Ошибка сериализации: поле %s - %s\n", marshalErr.Field, marshalErr.Message)
    }
}
```

## Шаблоны обработки ошибок

### Шаблон errors.Is

Проверка сигнальных ошибок:

```go
err := loader.LoadFiles(".env")

switch {
case errors.Is(err, env.ErrFileNotFound):
    // Файл не существует
    log.Println("Файл конфигурации не существует, используются значения по умолчанию")

case errors.Is(err, env.ErrFileTooLarge):
    // Файл слишком большой
    log.Fatal("Файл конфигурации слишком большой")

case errors.Is(err, env.ErrSecurityViolation):
    // Запрещённый ключ (фактически возвращает *SecurityError)
    log.Fatal("Обнаружен запрещённый ключ")

case err != nil:
    // Другая ошибка
    log.Fatalf("Загрузка не удалась: %v", err)
}

// Недопустимый формат ключа (фактически возвращает *ValidationError, Field=="key")
var valErr *env.ValidationError
if errors.As(err, &valErr) && valErr.Field == "key" {
    log.Fatalf("Обнаружен недопустимый ключ: %s", valErr.Message)
}
```

### Шаблон errors.As

Извлечение подробной информации об ошибках:

```go
err := loader.LoadFiles(".env")
if err == nil {
    return
}

// Попытка извлечь ошибку разбора
var parseErr *env.ParseError
if errors.As(err, &parseErr) {
    log.Fatalf("Ошибка разбора в %s на строке %d: %v",
        parseErr.File, parseErr.Line, parseErr.Err)
}

// Попытка извлечь файловую ошибку
var fileErr *env.FileError
if errors.As(err, &fileErr) {
    log.Fatalf("Файловая ошибка %s: %v", fileErr.Path, fileErr.Err)
}

// Попытка извлечь ошибку безопасности
var secErr *env.SecurityError
if errors.As(err, &secErr) {
    log.Fatalf("Ошибка безопасности: %s - %s", secErr.Action, secErr.Reason)
}

// Другая ошибка
log.Fatalf("Неизвестная ошибка: %v", err)
```

### Комбинированная обработка

```go
func handleLoadError(err error) {
    if err == nil {
        return
    }

    // Сначала проверяем сигнальные ошибки
    switch {
    case errors.Is(err, env.ErrFileNotFound):
        log.Println("Предупреждение: файл конфигурации не существует")
        return

    case errors.Is(err, env.ErrFileTooLarge):
        var fileErr *env.FileError
        errors.As(err, &fileErr)
        log.Fatalf("Файл %s слишком большой (%d > %d)",
            fileErr.Path, fileErr.Size, fileErr.Limit)
    }

    // Затем проверяем структурированные ошибки
    var parseErr *env.ParseError
    if errors.As(err, &parseErr) {
        log.Fatalf("Ошибка разбора %s:%d - %v",
            parseErr.File, parseErr.Line, parseErr.Err)
    }

    var secErr *env.SecurityError
    if errors.As(err, &secErr) {
        log.Fatalf("Ошибка безопасности: %s", secErr.Reason)
    }

    // Неизвестная ошибка
    log.Fatalf("Ошибка: %v", err)
}
```

## Шаблоны восстановления

### Изящная деградация

```go
func loadConfig() *Config {
    cfg := env.ProductionConfig()
    cfg.Filenames = nil
    loader, err := env.New(cfg)
    if err != nil {
        log.Printf("Ошибка конфигурации: %v, используется конфигурация по умолчанию", err)
        return defaultConfig()
    }
    defer loader.Close()

    err = loader.LoadFiles(".env")
    if err != nil {
        if errors.Is(err, env.ErrFileNotFound) {
            log.Println("Файл конфигурации не существует, используются значения по умолчанию")
            return defaultConfig()
        }
        log.Fatalf("Загрузка не удалась: %v", err)
    }

    if err := loader.Validate(); err != nil {
        log.Fatalf("Валидация не прошла: %v", err)
    }

    return parseConfig(loader)
}
```

### Шаблон повтора

```go
func loadWithRetry(filenames []string, maxRetries int) error {
    cfg := env.DefaultConfig()
    cfg.Filenames = nil
    loader, err := env.New(cfg)
    if err != nil {
        return err
    }
    defer loader.Close()

    for i := 0; i < maxRetries; i++ {
        err := loader.LoadFiles(filenames...)
        if err == nil {
            return nil
        }

        if errors.Is(err, env.ErrFileNotFound) {
            time.Sleep(time.Second * time.Duration(i+1))
            continue
        }

        return err
    }

    return errors.New("max retries exceeded")
}
```

## Полный пример

```go
package main

import (
    "errors"
    "log"

    "github.com/cybergodev/env"
)

func main() {
    cfg := env.ProductionConfig()
    cfg.Filenames = nil
    cfg.FailOnMissingFile = true
    cfg.RequiredKeys = []string{"DB_HOST", "API_KEY"}

    loader, err := env.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer loader.Close()

    err = loader.LoadFiles(".env")
    if err != nil {
        handleLoadError(err)
    }

    if err := loader.Validate(); err != nil {
        handleValidationError(err)
    }

    log.Println("Конфигурация успешно загружена")
}

func handleLoadError(err error) {
    switch {
    case errors.Is(err, env.ErrFileNotFound):
        log.Fatal("Файл конфигурации не существует")

    case errors.Is(err, env.ErrFileTooLarge):
        var fileErr *env.FileError
        errors.As(err, &fileErr)
        log.Fatalf("Файл слишком большой: %s (%d bytes)", fileErr.Path, fileErr.Size)

    case errors.Is(err, env.ErrSecurityViolation):
        log.Fatal("Обнаружен запрещённый ключ")
    }

    // Структурированные ошибки
    var parseErr *env.ParseError
    if errors.As(err, &parseErr) {
        log.Fatalf("Ошибка разбора %s:%d - %v",
            parseErr.File, parseErr.Line, parseErr.Err)
    }

    var secErr *env.SecurityError
    if errors.As(err, &secErr) {
        log.Fatalf("Ошибка безопасности: %s - %s", secErr.Action, secErr.Reason)
    }

    log.Fatalf("Загрузка не удалась: %v", err)
}

func handleValidationError(err error) {
    var valErr *env.ValidationError
    if errors.As(err, &valErr) {
        if valErr.Rule == "required" {
            // Отсутствует обязательный ключ: valErr.Message содержит список недостающих ключей
            log.Fatalf("Отсутствует обязательный ключ: %s", valErr.Message)
        }
        log.Fatalf("Валидация не прошла: %s - %s", valErr.Field, valErr.Message)
    }

    log.Fatalf("Валидация не прошла: %v", err)
}
```

## Связанная документация

- [Константы и ошибки](/ru/env/api-reference/constants) - полный список ошибок
- [Config API](/ru/env/api-reference/config) - настройки ограничений конфигурации
- [Обзор безопасности](/ru/env/security/) - обработка ошибок безопасности
