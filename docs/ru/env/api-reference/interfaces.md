---
sidebar_label: "Определения интерфейсов"
title: "Определения интерфейсов - CyberGo env | иерархия основных интерфейсов"
description: "Справочник определений ключевых интерфейсов CyberGo env: тонкозернистый дизайн с поддержкой внедрения зависимостей, включает композитный интерфейс EnvLoader и субинтерфейсы EnvFileLoader, EnvGetter, EnvSetter, Validator, FullAuditLogger, EnvParser, FileSystem."
sidebar_position: 6
---

# Определения интерфейсов

Библиотека env использует тонкозернистый дизайн интерфейсов, поддерживающий внедрение зависимостей и гибкую композицию.

## Основные интерфейсы

### EnvLoader

Полный интерфейс загрузчика, комбинирующий все субинтерфейсы:

```go
type EnvLoader interface {
    EnvFileLoader
    EnvGetter
    EnvSetter
    EnvApplicator
    EnvCloser
}
```

---

### EnvFileLoader

Интерфейс загрузки файлов:

```go
type EnvFileLoader interface {
    LoadFiles(filenames ...string) error
}
```

**Назначение:** сценарии, где требуется только возможность загрузки файлов.

```go
func loadConfig(loader env.EnvFileLoader) error {
    return loader.LoadFiles(".env")
}
```

---

### EnvGetter

Интерфейс доступа на чтение:

```go
type EnvGetter interface {
    GetString(key string, defaultValue ...string) string
    Lookup(key string) (string, bool)
    Keys() []string
    All() map[string]string
}
```

**Назначение:** доступ к конфигурации только для чтения (минимальный интерфейс).

```go
func readConfig(getter env.EnvGetter) {
    host := getter.GetString("HOST", "localhost")
    value, exists := getter.Lookup("API_KEY")
    keys := getter.Keys()
}
```

::: warning Внимание
`GetInt`, `GetBool`, `GetUint64`, `GetFloat64`, `GetDuration`, `GetSecure`, `Len` **не являются** частью интерфейса `EnvGetter`.
Эти методы реализованы на типе `*Loader`, но не входят в минимальный интерфейс.

Для полного доступа на чтение используйте тип `*Loader` напрямую:

```go
func readFullConfig(loader *env.Loader) {
    port := loader.GetInt("PORT", 8080)      // ✓ доступно
    debug := loader.GetBool("DEBUG", false)  // ✓ доступно
    count := loader.Len()                     // ✓ доступно
}
```
:::

---

### EnvSetter

Интерфейс доступа на запись:

```go
type EnvSetter interface {
    Set(key, value string) error
    Delete(key string) error
}
```

**Назначение:** сценарии, где требуется только возможность установки/удаления.

```go
func updateConfig(setter env.EnvSetter) error {
    if err := setter.Set("KEY", "value"); err != nil {
        return err
    }
    return setter.Delete("TEMP_KEY")
}
```

---

### EnvApplicator

Интерфейс применения к системному окружению:

```go
type EnvApplicator interface {
    Apply() error
}
```

**Назначение:** применение загруженных переменных к `os.Environ`.

```go
func applyToSystem(applicator env.EnvApplicator) error {
    return applicator.Apply()
}
```

---

### EnvCloser

Интерфейс освобождения ресурсов:

```go
type EnvCloser interface {
    Close() error
}
```

**Назначение:** освобождение ресурсов загрузчика.

---

## Интерфейсы валидации

### Validator

Композитный интерфейс валидации:

```go
type Validator interface {
    KeyValidator
    ValueValidator
    RequiredValidator
}
```

::: tip Внимание
`Validator` предоставляет метод `ValidateRequired` через встраивание `RequiredValidator`. Пользовательский валидатор, реализующий только `KeyValidator`, вернёт `ErrValidateRequiredUnsupported` при вызове `ValidateRequired`.
:::

---

### RequiredValidator

Интерфейс валидации обязательных ключей:

```go
type RequiredValidator interface {
    ValidateRequired(keys map[string]bool) error
}
```

Проверяет наличие всех обязательных ключей.

---

### KeyValidator

Интерфейс валидации ключей:

```go
type KeyValidator interface {
    ValidateKey(key string) error
}
```

Проверяет, соответствует ли имя ключа правилам (длина, формат, запрещённые ключи и т. д.).

---

### ValueValidator

Интерфейс валидации значений:

```go
type ValueValidator interface {
    ValidateValue(value string) error
}
```

Проверяет, безопасно ли значение (нет нулевых байтов, управляющих символов и т. д.).

---

## Интерфейсы аудита

### AuditLogger

Минимальный интерфейс журнала аудита (псевдоним `internal.AuditLogger`):

```go
type AuditLogger interface {
    LogError(action AuditAction, key, errMsg string) error
}
```

**Назначение:** минимальный интерфейс для удобной реализации пользовательского журнала аудита. Для полного аудита используйте `FullAuditLogger`.

---

### FullAuditLogger

Расширенный интерфейс журнала аудита, предоставляющий полный функционал:

```go
type FullAuditLogger interface {
    AuditLogger
    Log(action AuditAction, key, reason string, success bool) error
    LogWithFile(action AuditAction, key, file, reason string, success bool) error
    LogWithDuration(action AuditAction, key, reason string, success bool, duration time.Duration) error
    Close() error
}
```

**Назначение:** полный функционал журнала аудита. `ComponentFactory.Auditor()` возвращает этот интерфейс.

**Описание методов:**

| Метод | Назначение |
|-------|------------|
| LogError | Регистрирует событие ошибки (наследуется от AuditLogger) |
| `Log` | Регистрирует общее событие аудита |
| `LogWithFile` | Регистрирует событие с информацией о файле |
| `LogWithDuration` | Регистрирует событие с длительностью |
| `Close` | Закрывает журнал аудита |

---

### AuditHandler

Интерфейс обработчика аудита (для конфигурации Config.AuditHandler):

```go
type AuditHandler interface {
    Log(event AuditEvent) error
    Close() error
}
```

**Назначение:** реализация этого интерфейса позволяет настроить способ обработки событий аудита. В отличие от интерфейса `AuditLogger`, `AuditHandler` требует методы `Log` и `Close` для приёма обработки событий аудита и освобождения ресурсов.

**Встроенные реализации:**
- `JSONAuditHandler` - выводит логи в формате JSON
- `LogAuditHandler` - выводит через стандартный пакет log
- `ChannelAuditHandler` - отправляет в канал
- `CloseableChannelHandler` - закрываемый обработчик с собственным буферизованным каналом
- `NopAuditHandler` - заглушка (ничего не делает)

---

## Интерфейс подстановки переменных

### VariableExpander

Интерфейс подстановки переменных:

```go
type VariableExpander interface {
    Expand(s string) (string, error)
}
```

**Назначение:** пользовательская логика подстановки переменных, поддерживающая синтаксис `${VAR}`, `${VAR:-default}` и т. д.

```go
expanded, err := expander.Expand("${BASE_URL}/api")
```

---

## Интерфейсы разбора

### EnvParser

Интерфейс парсера:

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

**Назначение:** пользовательские парсеры форматов файлов.

---

## Интерфейсы хранения

### EnvStorage

Интерфейс хранения переменных окружения:

```go
type EnvStorage interface {
    Get(key string) (string, bool)
    Set(key, value string)
    Delete(key string)
    Keys() []string
    Len() int
    ToMap() map[string]string
    Clear()
}
```

**Назначение:** пользовательское хранилище.

**Описание методов:**

| Метод | Назначение |
|-------|------------|
| `Get` | Получает значение, возвращает значение и флаг существования |
| `Set` | Устанавливает пару ключ-значение |
| `Delete` | Удаляет ключ |
| `Keys` | Возвращает все имена ключей |
| `Len` | Возвращает количество пар ключ-значение |
| `ToMap` | Возвращает копию всех пар ключ-значение |
| `Clear` | Очищает все данные |

---

## Интерфейсы сериализации

### Marshaler

Интерфейс пользовательской сериализации:

```go
type Marshaler interface {
    MarshalEnv() ([]byte, error)
}
```

**Назначение:** сериализация пользовательских типов.

```go
type LogLevel string

func (l LogLevel) MarshalEnv() ([]byte, error) {
    return []byte(string(l)), nil
}

// Использование
level := LogLevel("debug")
env.Marshal(level)  // Вызывает MarshalEnv
```

---

### Unmarshaler

Интерфейс пользовательской десериализации:

```go
type Unmarshaler interface {
    UnmarshalEnv(data map[string]string) error
}
```

**Назначение:** десериализация пользовательских типов.

```go
type Config struct {
    Host string
    Port int
}

func (c *Config) UnmarshalEnv(data map[string]string) error {
    c.Host = data["HOST"]
    port, _ := strconv.Atoi(data["PORT"])
    c.Port = port
    return nil
}

// Использование
var cfg Config
env.UnmarshalInto(data, &cfg)  // Вызывает UnmarshalEnv
```

---

## Интерфейсы файловой системы

### FileSystem

Интерфейс абстракции файловой системы:

```go
type FileSystem interface {
    Open(name string) (File, error)
    OpenFile(name string, flag int, perm os.FileMode) (File, error)
    Stat(name string) (os.FileInfo, error)
    MkdirAll(path string, perm os.FileMode) error
    Remove(name string) error
    Rename(oldpath, newpath string) error
    Getenv(key string) string
    Setenv(key, value string) error
    Unsetenv(key string) error
    LookupEnv(key string) (string, bool)
}
```

**Назначение:** имитация файловой системы при тестировании.

```go
type MockFileSystem struct {
    files map[string]string
    env   map[string]string
}

// MockFile реализует интерфейс env.File (для тестов)
type MockFile struct {
    reader *strings.Reader
}

func (f *MockFile) Read(p []byte) (n int, err error)   { return f.reader.Read(p) }
func (f *MockFile) Write(p []byte) (n int, err error)  { return 0, errors.ErrUnsupported }
func (f *MockFile) Close() error                       { return nil }
func (f *MockFile) Stat() (os.FileInfo, error)         { return nil, errors.ErrUnsupported }
func (f *MockFile) Sync() error                        { return nil }

func (m *MockFileSystem) Open(name string) (env.File, error) {
    content, ok := m.files[name]
    if !ok {
        return nil, os.ErrNotExist
    }
    return &MockFile{reader: strings.NewReader(content)}, nil
}

func (m *MockFileSystem) OpenFile(name string, flag int, perm os.FileMode) (env.File, error) {
    return m.Open(name)
}

func (m *MockFileSystem) Stat(name string) (os.FileInfo, error) {
    if _, ok := m.files[name]; !ok {
        return nil, os.ErrNotExist
    }
    return nil, nil
}

func (m *MockFileSystem) MkdirAll(path string, perm os.FileMode) error { return nil }
func (m *MockFileSystem) Remove(name string) error                     { delete(m.files, name); return nil }
func (m *MockFileSystem) Rename(oldpath, newpath string) error {
    m.files[newpath] = m.files[oldpath]
    delete(m.files, oldpath)
    return nil
}

func (m *MockFileSystem) Getenv(key string) string            { return m.env[key] }
func (m *MockFileSystem) Setenv(key, value string) error      { m.env[key] = value; return nil }
func (m *MockFileSystem) Unsetenv(key string) error           { delete(m.env, key); return nil }
func (m *MockFileSystem) LookupEnv(key string) (string, bool) { val, ok := m.env[key]; return val, ok }

// Использование
cfg := env.TestingConfig()
cfg.FileSystem = &MockFileSystem{
    files: map[string]string{".env": "KEY=value"},
    env:   make(map[string]string),
}
```

---

### File

Интерфейс файла:

```go
type File interface {
    io.Reader
    io.Writer
    io.Closer
    Stat() (os.FileInfo, error)
    Sync() error
}
```

**Описание методов:**

| Метод | Назначение |
|-------|------------|
| Read | Чтение данных |
| Write | Запись данных |
| Close | Закрытие файла |
| Stat | Получение информации о файле |
| Sync | Синхронизация с диском |

---

### DefaultFileSystem

Реализация файловой системы по умолчанию:

```go
var DefaultFileSystem FileSystem = OSFileSystem{}
```

Использует реальную файловую систему ОС и переменные окружения:

```go
cfg := env.DefaultConfig()
cfg.FileSystem = env.DefaultFileSystem  // Значение по умолчанию
```

---

## Обработчики аудита

### JSONAuditHandler

Выводит журнал аудита в формате JSON:

```go
func NewJSONAuditHandler(w io.Writer) *JSONAuditHandler
```

**Параметры:**
- `w` - цель вывода (например `os.Stdout`, файл)

```go
handler := env.NewJSONAuditHandler(os.Stdout)
```

**Пример вывода:**
```json
{"timestamp":"2024-01-15T10:30:00Z","action":"load","key":"API_KEY","success":true}
```

---

### LogAuditHandler

Вывод через стандартный пакет log:

```go
func NewLogAuditHandler(logger *log.Logger) *LogAuditHandler
```

**Параметры:**
- `logger` - экземпляр стандартного log.Logger

```go
import "log"

logger := log.New(os.Stderr, "[AUDIT] ", log.LstdFlags)
handler := env.NewLogAuditHandler(logger)
```

**Пример вывода:**
```text
[AUDIT] 2024/01/15 10:30:00 load .env success
```

---

### ChannelAuditHandler

Отправка в канал:

```go
func NewChannelAuditHandler(ch chan<- AuditEvent) *ChannelAuditHandler
```

**Параметры:**
- `ch` - канал событий аудита

::: warning Владение каналом
`ChannelAuditHandler` **не владеет** каналом, `Close()` **не закрывает** базовый канал. Вызывающий должен самостоятельно закрыть канал, чтобы уведомить получателя о завершении. Кроме того, `Log()` блокируется при заполнении буфера канала — рекомендуется использовать буферизованный канал. Для автоматического управления жизненным циклом канала используйте [NewCloseableChannelHandler](/ru/env/api-reference/factory#newcloseablechannelhandler).
:::

```go
ch := make(chan env.AuditEvent, 100)
handler := env.NewChannelAuditHandler(ch)

// Асинхронная обработка
go func() {
    for event := range ch {
        processAuditEvent(event)
    }
}()
```

---

### NopAuditHandler

Заглушка (отбрасывает все события):

```go
func NewNopAuditHandler() *NopAuditHandler
```

```go
handler := env.NewNopAuditHandler()
```

---

## Типы аудита

### AuditAction

Константы типов операций:

```go
type AuditAction = internal.Action

const (
    ActionLoad       AuditAction = "load"        // Загрузка файла
    ActionParse      AuditAction = "parse"       // Операция разбора
    ActionGet        AuditAction = "get"         // Чтение переменной
    ActionSet        AuditAction = "set"         // Установка переменной
    ActionDelete     AuditAction = "delete"      // Удаление переменной
    ActionValidate   AuditAction = "validate"    // Операция валидации
    ActionExpand     AuditAction = "expand"      // Подстановка переменной
    ActionSecurity   AuditAction = "security"    // Событие безопасности
    ActionError      AuditAction = "error"       // Событие ошибки
    ActionFileAccess AuditAction = "file_access" // Доступ к файлу
)
```

---

### AuditEvent

Структура события аудита:

```go
type AuditEvent = internal.Event
```

**Поля:**

| Поле | Тип | Описание |
|------|-----|----------|
| Timestamp | `time.Time` | Временная метка |
| Action | `AuditAction` | Тип операции |
| Key | `string` | Имя ключа (маскированное) |
| File | `string` | Имя файла |
| Reason | `string` | Причина/описание |
| Success | `bool` | Успешно ли |
| Masked | `bool` | Маскировано ли |
| Details | `string` | Подробности |
| Duration | `int64` | Длительность (наносекунды) |

---

## ComponentFactory

Фабрика компонентов, управляющая общими компонентами:

```go
type ComponentFactory struct {
    // содержит приватные поля
}
```

### Методы

```go
func (f *ComponentFactory) Validator() Validator
func (f *ComponentFactory) Auditor() FullAuditLogger
func (f *ComponentFactory) Expander() VariableExpander
func (f *ComponentFactory) Close() error
func (f *ComponentFactory) IsClosed() bool
```

**Назначение:** внутреннее использование, автоматически управляется при создании Loader. Подробнее см. [ComponentFactory API](/ru/env/api-reference/factory).

---

## Полные примеры

### Реализация пользовательского обработчика аудита

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

// Пользовательский обработчик аудита
type CustomAuditHandler struct {
    events []env.AuditEvent
}

func (h *CustomAuditHandler) Log(event env.AuditEvent) error {
    h.events = append(h.events, event)
    return nil
}

func (h *CustomAuditHandler) Close() error {
    return nil
}

func main() {
    cfg := env.ProductionConfig()
    cfg.AuditEnabled = true
    handler := &CustomAuditHandler{}
    cfg.AuditHandler = handler

    loader, _ := env.New(cfg)
    defer loader.Close()
    // Использование loader...

    // Просмотр событий аудита
    for _, event := range handler.events {
        fmt.Printf("%s: %s - %s\n", event.Action, event.Key, event.Reason)
    }
}
```

### Использование тонкозернистых интерфейсов

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

// Требуется только чтение
func printConfig(getter env.EnvGetter) {
    for _, key := range getter.Keys() {
        value, _ := getter.Lookup(key)
        fmt.Printf("%s = %s\n", key, value)
    }
}

// Требуется только запись
func setDefaults(setter env.EnvSetter) error {
    return setter.Set("DEFAULT_KEY", "default_value")
}

// Требуется только загрузка
func loadConfig(loader env.EnvFileLoader) error {
    return loader.LoadFiles(".env")
}

func main() {
    cfg := env.DefaultConfig()
    loader, _ := env.New(cfg)
    defer loader.Close()

    // Использование тонкозернистых интерфейсов
    loadConfig(loader)
    setDefaults(loader)
    printConfig(loader)
}
```

## Связанная документация

- [Loader API](/ru/env/api-reference/loader) - методы экземпляра Loader
- [ComponentFactory API](/ru/env/api-reference/factory) - фабрика компонентов
- [Пользовательский парсер](/ru/env/guides/custom-parser) - руководство по пользовательским парсерам
