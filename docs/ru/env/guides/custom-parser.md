---
sidebar_label: "Пользовательский парсер"
title: "Пользовательский парсер - CyberGo env | расширение форматов файлов"
description: "Руководство по пользовательскому парсеру CyberGo env: реализация метода Parse интерфейса EnvParser и регистрация через RegisterParser, использование ComponentFactory для получения Validator и Auditor, с полными примерами парсеров TOML и INI и лучшими практиками."
sidebar_position: 8
sidebar_icon: "⚙️"
---

# Пользовательский парсер

В этом руководстве описывается создание и регистрация пользовательских парсеров форматов файлов для расширения поддерживаемых библиотекой env форматов конфигурации.

## Интерфейс парсера

### EnvParser

Все парсеры должны реализовывать этот интерфейс:

```go
type EnvParser interface {
    Parse(r io.Reader, filename string) (map[string]string, error)
}
```

**Параметры:**
- `r` - читатель содержимого файла
- `filename` - имя файла (для сообщений об ошибках)

**Возвращает:**
- `map[string]string` - разобранные пары ключ-значение
- `error` - ошибка разбора

---

## Создание пользовательского парсера

### Базовая структура

```go
package myparser

import (
    "io"
    "strings"

    "github.com/cybergodev/env"
)

// Пользовательский парсер
type CustomParser struct {
    cfg       env.Config
    validator env.Validator
    auditor   env.FullAuditLogger
}

// Реализация интерфейса EnvParser
func (p *CustomParser) Parse(r io.Reader, filename string) (map[string]string, error) {
    result := make(map[string]string)

    // 1. Чтение содержимого (учитывайте ограничение размера)
    content, err := io.ReadAll(io.LimitReader(r, p.cfg.MaxFileSize))
    if err != nil {
        return nil, err
    }

    // 2. Разбор содержимого в пары ключ-значение
    for _, line := range strings.Split(string(content), "\n") {
        line = strings.TrimSpace(line)
        if line == "" || strings.HasPrefix(line, "#") {
            continue
        }
        idx := strings.Index(line, "=")
        if idx <= 0 {
            continue
        }
        result[strings.TrimSpace(line[:idx])] = strings.TrimSpace(line[idx+1:])
    }

    // 3. Валидация результатов
    for key := range result {
        if err := p.validator.ValidateKey(key); err != nil {
            return nil, err
        }
    }

    // 4. Возврат результатов
    return result, nil
}
```

### Пример TOML-парсера

```go
package tomlparser

import (
    "fmt"
    "io"
    "strings"
    "time"

    "github.com/cybergodev/env"
)

// TOMLParser разбирает формат TOML
type TOMLParser struct {
    cfg       env.Config
    validator env.Validator
    auditor   env.FullAuditLogger
}

func (p *TOMLParser) Parse(r io.Reader, filename string) (map[string]string, error) {
    start := time.Now()

    // Ограничение размера чтения
    content, err := io.ReadAll(io.LimitReader(r, p.cfg.MaxFileSize+1))
    if err != nil {
        return nil, err
    }
    if int64(len(content)) > p.cfg.MaxFileSize {
        return nil, fmt.Errorf("file exceeds size limit")
    }

    result := make(map[string]string)
    lines := strings.Split(string(content), "\n")

    var currentSection string

    for lineNum, line := range lines {
        line = strings.TrimSpace(line)

        // Пропуск пустых строк и комментариев
        if line == "" || strings.HasPrefix(line, "#") {
            continue
        }

        // Разбор section [section]
        if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
            currentSection = strings.Trim(line, "[]")
            continue
        }

        // Разбор key = value
        parts := strings.SplitN(line, "=", 2)
        if len(parts) != 2 {
            continue // или вернуть ошибку
        }

        key := strings.TrimSpace(parts[0])
        value := strings.TrimSpace(parts[1])

        // Добавление префикса section
        if currentSection != "" {
            key = currentSection + "_" + key
        }

        // Удаление кавычек
        value = strings.Trim(value, "\"'")

        // Преобразование в верхний регистр
        key = strings.ToUpper(key)

        // Валидация ключа
        if err := p.validator.ValidateKey(key); err != nil {
            _ = p.auditor.LogError(env.ActionParse, key, err.Error())
            return nil, fmt.Errorf("line %d: %w", lineNum+1, err)
        }

        result[key] = value
    }

    // Проверка количества переменных
    if len(result) > p.cfg.MaxVariables {
        return nil, fmt.Errorf("exceeds max variables: %d > %d", len(result), p.cfg.MaxVariables)
    }

    _ = p.auditor.LogWithDuration(env.ActionParse, "", "parsed TOML: "+filename, true, time.Since(start))
    return result, nil
}
```

### Пример INI-парсера

```go
package iniparser

import (
    "fmt"
    "io"
    "strings"

    "github.com/cybergodev/env"
)

// INIParser разбирает формат INI
type INIParser struct {
    cfg       env.Config
    validator env.Validator
    auditor   env.FullAuditLogger
}

func (p *INIParser) Parse(r io.Reader, filename string) (map[string]string, error) {
    content, err := io.ReadAll(io.LimitReader(r, p.cfg.MaxFileSize+1))
    if err != nil {
        return nil, err
    }

    result := make(map[string]string)
    lines := strings.Split(string(content), "\n")

    var currentSection string

    for lineNum, line := range lines {
        line = strings.TrimSpace(line)

        // Пропуск пустых строк и комментариев
        if line == "" || strings.HasPrefix(line, ";") || strings.HasPrefix(line, "#") {
            continue
        }

        // Section
        if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
            currentSection = strings.Trim(line, "[]")
            continue
        }

        // Key=Value
        if idx := strings.Index(line, "="); idx > 0 {
            key := strings.TrimSpace(line[:idx])
            value := strings.TrimSpace(line[idx+1:])

            if currentSection != "" {
                key = currentSection + "_" + key
            }

            // Валидация
            if err := p.validator.ValidateKey(strings.ToUpper(key)); err != nil {
                return nil, fmt.Errorf("line %d: %w", lineNum+1, err)
            }

            result[strings.ToUpper(key)] = value
        }
    }

    return result, nil
}
```

---

## Регистрация парсера

### Тип ParserFactory

```go
type ParserFactory func(cfg Config, factory *ComponentFactory) (EnvParser, error)
```

Фабричная функция принимает Config и ComponentFactory, возвращая экземпляр парсера.

**Описание параметров:**
- `cfg` - объект конфигурации, содержащий все ограничения и настройки безопасности
- `factory` - фабрика компонентов, позволяющая получить Validator, Auditor и др.

### Функция RegisterParser

```go
func RegisterParser(format FileFormat, factory ParserFactory) error
```

Регистрирует пользовательский парсер формата.

**Параметры:**
- `format` - константа формата файла (рекомендуется использовать значения 100+ для избежания конфликтов)
- `factory` - фабричная функция парсера

**Возвращает:**
- `error` - ошибка при неудаче регистрации

**Случаи ошибок:**
- Встроенные форматы (FormatEnv, FormatJSON, FormatYAML) не могут быть переопределены
- Формат уже зарегистрирован

**Примечания:**
- Регистрация должна выполняться до вызова `env.New()`
- Рекомендуется регистрировать в функции `init()`

### Использование ComponentFactory

Получение валидатора и аудитора через ComponentFactory:

```go
type SecureParser struct {
    cfg       env.Config
    validator env.Validator
    auditor   env.FullAuditLogger
}

func NewSecureParser(cfg env.Config, factory *env.ComponentFactory) (env.EnvParser, error) {
    return &SecureParser{
        cfg:       cfg,
        validator: factory.Validator(),
        auditor:   factory.Auditor(),
    }, nil
}

func (p *SecureParser) Parse(r io.Reader, filename string) (map[string]string, error) {
    result := make(map[string]string)

    // ... логика разбора

    // Валидация имён ключей
    for key := range result {
        if err := p.validator.ValidateKey(key); err != nil {
            _ = p.auditor.Log(env.ActionParse, key, "invalid key", false)
            return nil, err
        }
    }

    _ = p.auditor.Log(env.ActionParse, "", "parse completed", true)
    return result, nil
}
```

### Полный пример регистрации

<!-- check-code: skip -->
```go
package main

import (
    "github.com/cybergodev/env"
)

// 1. Определение констант формата (рекомендуются значения 100+)
const (
    FormatTOML env.FileFormat = 100
    FormatINI  env.FileFormat = 101
    FormatXML  env.FileFormat = 102
)

// 2. Регистрация в init
func init() {
    // Регистрация TOML-парсера
    err := env.RegisterParser(FormatTOML, func(cfg env.Config, f *env.ComponentFactory) (env.EnvParser, error) {
        return &TOMLParser{
            cfg:       cfg,
            validator: f.Validator(),
            auditor:   f.Auditor(),
        }, nil
    })
    if err != nil {
        panic(err) // Формат уже зарегистрирован или другая ошибка
    }

    // Регистрация INI-парсера
    env.RegisterParser(FormatINI, func(cfg env.Config, f *env.ComponentFactory) (env.EnvParser, error) {
        return &INIParser{
            cfg:       cfg,
            validator: f.Validator(),
            auditor:   f.Auditor(),
        }, nil
    })
}

func main() {
    // Регистрация должна быть завершена до New (уже выполнена в init).
    //
    // Важное ограничение: LoadFiles не маршрутизирует автоматически по расширению .toml
    // к TOMLParser выше — DetectFormat распознаёт только .env/.json/.yaml/.yml, другие
    // расширения попадают на встроенный dotenv-парсер (см. format.go, DetectFormat).
    // Чтобы LoadFiles фактически вызвал TOMLParser, используйте ForceRegisterParser
    // для переопределения FormatEnv и назовите файл *.env:
    err := env.ForceRegisterParser(env.FormatEnv, func(cfg env.Config, f *env.ComponentFactory) (env.EnvParser, error) {
        return &TOMLParser{
            cfg:       cfg,
            validator: f.Validator(),
            auditor:   f.Auditor(),
        }, nil
    })
    if err != nil {
        panic(err)
    }

    cfg := env.DefaultConfig()
    loader, _ := env.New(cfg)
    defer loader.Close()

    // Расширение файла должно быть .env (содержимое в формате TOML) для маршрутизации к переопределённому парсеру
    if err := loader.LoadFiles("config.env"); err != nil {
        panic(err)
    }
}
```

::: warning Ограничение маршрутизации LoadFiles
Пользовательский номер формата (например `FormatTOML = 100`), зарегистрированный через `RegisterParser`, **не распознаётся `LoadFiles` автоматически по расширению файла**. `LoadFiles` внутренне вызывает `DetectFormat(filename)` для выбора парсера, а `DetectFormat` распознаёт только четыре расширения: `.env` / `.json` / `.yaml` / `.yml`; другие расширения возвращают `FormatAuto`, что в итоге попадает на встроенный dotenv-парсер — пользовательский парсер никогда не вызывается.

Два пути загрузки файлов пользовательского формата:

1. **Расширение `.env` + `ForceRegisterParser`** (рекомендуется): назовите файл пользовательского формата `*.env` и используйте `env.ForceRegisterParser(env.FormatEnv, ...)` для переопределения встроенного dotenv-парсера. Обратите внимание на сохранение проверок безопасности (имена/значения/размер ключей и т. д.), иначе будут введены уязвимости.
2. **Ручной вызов парсера**: прочитайте файл в `io.Reader`, создайте экземпляр парсера вручную и вызовите `parser.Parse(reader, filename)` для получения `map[string]string`, затем используйте `loader.Set` для поэлементной записи. Обратите внимание, что внутренние `validator`/`auditor` парсера обычно зависят от `*ComponentFactory`, который нужно получить и передать при регистрации фабрики.
:::

---

## Лучшие практики

### 1. Соблюдение ограничений конфигурации

```go
func (p *CustomParser) checkLimits(result map[string]string) error {
    // Проверка количества переменных
    if len(result) > p.cfg.MaxVariables {
        return fmt.Errorf("exceeds max variables: %d > %d", len(result), p.cfg.MaxVariables)
    }

    // Проверка длины ключей и значений
    for key, value := range result {
        if len(key) > p.cfg.MaxKeyLength {
            return fmt.Errorf("key too long: %s", key)
        }
        if len(value) > p.cfg.MaxValueLength {
            return fmt.Errorf("value too long for: %s", key)
        }
    }

    return nil
}
```

### 2. Использование валидатора

```go
func (p *CustomParser) Parse(r io.Reader, filename string) (map[string]string, error) {
    result := make(map[string]string)

    // ... логика разбора

    // Валидация всех ключей
    for key := range result {
        if err := p.validator.ValidateKey(key); err != nil {
            return nil, fmt.Errorf("invalid key %q: %w", key, err)
        }
    }

    // Валидация всех значений (если включено)
    if p.cfg.ValidateValues {
        for key, value := range result {
            if err := p.validator.ValidateValue(value); err != nil {
                return nil, fmt.Errorf("invalid value for %q: %w", key, err)
            }
        }
    }

    return result, nil
}
```

### 3. Предоставление значимых ошибок

```go
type CustomParseError struct {
    File    string
    Line    int
    Content string
    Err     error
}

func (e *CustomParseError) Error() string {
    if e.Line > 0 {
        return fmt.Sprintf("%s:%d: %s: %v", e.File, e.Line, e.Content, e.Err)
    }
    return fmt.Sprintf("%s: %s: %v", e.File, e.Content, e.Err)
}

func (e *CustomParseError) Unwrap() error {
    return e.Err
}
```

### 4. Регистрация журнала аудита

```go
func (p *CustomParser) Parse(r io.Reader, filename string) (map[string]string, error) {
    start := time.Now()
    result := make(map[string]string)

    // ... логика разбора

    // Регистрация успеха
    _ = p.auditor.LogWithDuration(
        env.ActionParse,
        "",
        fmt.Sprintf("parsed %d variables", len(result)),
        true,
        time.Since(start),
    )

    return result, nil
}
```

---

## Полный пример

### Реализация XML-парсера

```go
package main

import (
    "encoding/xml"
    "fmt"
    "io"
    "strings"
    "time"

    "github.com/cybergodev/env"
)

// Структура XML-конфигурации
type XMLConfig struct {
    XMLName xml.Name   `xml:"config"`
    Entries []XMLEntry `xml:"entry"`
}

type XMLEntry struct {
    Key   string `xml:"key,attr"`
    Value string `xml:",chardata"`
}

// XMLParser разбирает формат XML
type XMLParser struct {
    cfg       env.Config
    validator env.Validator
    auditor   env.FullAuditLogger
}

func (p *XMLParser) Parse(r io.Reader, filename string) (map[string]string, error) {
    start := time.Now()

    // Ограничение размера чтения
    content, err := io.ReadAll(io.LimitReader(r, p.cfg.MaxFileSize+1))
    if err != nil {
        return nil, err
    }
    if int64(len(content)) > p.cfg.MaxFileSize {
        _ = p.auditor.LogError(env.ActionParse, "", "file exceeds size limit")
        return nil, fmt.Errorf("file exceeds size limit: %d > %d", len(content), p.cfg.MaxFileSize)
    }

    var xmlConfig XMLConfig
    if err := xml.Unmarshal(content, &xmlConfig); err != nil {
        _ = p.auditor.LogError(env.ActionParse, "", "xml parse error: "+err.Error())
        return nil, fmt.Errorf("xml parse error: %w", err)
    }

    result := make(map[string]string)

    for _, entry := range xmlConfig.Entries {
        key := strings.ToUpper(entry.Key)

        // Валидация длины ключа
        if len(key) > p.cfg.MaxKeyLength {
            return nil, fmt.Errorf("key too long: %s", key)
        }

        // Валидация формата ключа
        if err := p.validator.ValidateKey(key); err != nil {
            return nil, fmt.Errorf("invalid key %q: %w", key, err)
        }

        // Валидация длины значения
        if len(entry.Value) > p.cfg.MaxValueLength {
            return nil, fmt.Errorf("value too long for key: %s", key)
        }

        result[key] = entry.Value
    }

    // Проверка количества переменных
    if len(result) > p.cfg.MaxVariables {
        return nil, fmt.Errorf("too many variables: %d > %d", len(result), p.cfg.MaxVariables)
    }

    _ = p.auditor.LogWithDuration(env.ActionParse, "", "parsed XML: "+filename, true, time.Since(start))
    return result, nil
}

// Определение константы XML-формата
const FormatXML env.FileFormat = 102

func init() {
    // Регистрация XML-парсера
    env.RegisterParser(FormatXML, func(cfg env.Config, f *env.ComponentFactory) (env.EnvParser, error) {
        return &XMLParser{
            cfg:       cfg,
            validator: f.Validator(),
            auditor:   f.Auditor(),
        }, nil
    })
}

func main() {
    // LoadFiles не маршрутизирует автоматически по расширению .xml к XML-парсеру — DetectFormat
    // распознаёт только .env/.json/.yaml/.yml. Здесь используется ForceRegisterParser для переопределения
    // FormatEnv, файл загружается с расширением .env (содержимое в формате XML):
    err := env.ForceRegisterParser(env.FormatEnv, func(cfg env.Config, f *env.ComponentFactory) (env.EnvParser, error) {
        return &XMLParser{
            cfg:       cfg,
            validator: f.Validator(),
            auditor:   f.Auditor(),
        }, nil
    })
    if err != nil {
        panic(err)
    }

    cfg := env.DefaultConfig()
    loader, _ := env.New(cfg)
    defer loader.Close()

    /*
    Содержимое файла config.env (формат XML):
    <?xml version="1.0"?>
    <config>
        <entry key="DATABASE_HOST">localhost</entry>
        <entry key="DATABASE_PORT">5432</entry>
    </config>
    */
    if err := loader.LoadFiles("config.env"); err != nil {
        panic(err)
    }

    fmt.Println(loader.GetString("DATABASE_HOST"))  // localhost
    fmt.Println(loader.GetInt("DATABASE_PORT"))     // 5432
}
```

---

## Связанная документация

- [ComponentFactory API](/ru/env/api-reference/factory) - ComponentFactory и RegisterParser
- [Определения интерфейсов](/ru/env/api-reference/interfaces) - определение интерфейса EnvParser
- [Config API](/ru/env/api-reference/config) - подробности параметров конфигурации
- [Многоформатная конфигурация](/ru/env/guides/multi-format) - подробно о форматах JSON/YAML
