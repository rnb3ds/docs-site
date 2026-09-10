---
sidebar_label: "Сериализация"
title: "Сериализация - CyberGo env | мультиформатное преобразование"
description: "Руководство по сериализации CyberGo env: Marshal/Unmarshal, преобразование между .env, JSON и YAML, интерфейсы Marshaler/Unmarshaler и DetectFormat."
sidebar_position: 4
sidebar_icon: "🔧"
---

# Сериализация

Используйте функции Marshal и Unmarshal для сериализации/десериализации переменных окружения с поддержкой преобразования между форматами `.env`, JSON, YAML.

## Базовая сериализация

### Сериализация Map

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

func main() {
    data := map[string]string{
        "APP_NAME":    "my-app",
        "APP_VERSION": "1.0.0",
        "DEBUG":       "true",
    }

    // Сериализация в формат .env
    result, err := env.Marshal(data, env.FormatEnv)
    if err != nil {
        panic(err)
    }

    fmt.Println(result)
    // Вывод:
    // APP_NAME=my-app
    // APP_VERSION=1.0.0
    // DEBUG=true
}
```

### Формат JSON

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

func main() {
    data := map[string]string{
        "HOST": "localhost",
        "PORT": "8080",
    }

    // Сериализация в JSON
    result, err := env.Marshal(data, env.FormatJSON)
    if err != nil {
        panic(err)
    }

    fmt.Println(result)
    // Вывод:
    // {
    //   "HOST": "localhost",
    //   "PORT": 8080
    // }
}
```

### Формат YAML

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

func main() {
    data := map[string]string{
        "DATABASE_HOST": "localhost",
        "DATABASE_PORT": "5432",
        "DATABASE_NAME": "myapp",
    }

    // Сериализация в YAML
    result, err := env.Marshal(data, env.FormatYAML)
    if err != nil {
        panic(err)
    }

    fmt.Println(result)
    // Вывод:
    // DATABASE_HOST: localhost
    // DATABASE_NAME: myapp
    // DATABASE_PORT: 5432
}
```

## Сериализация структур

### Базовая сериализация

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

type Config struct {
    Host string `env:"HOST"`
    Port int64  `env:"PORT"`
    Debug bool  `env:"DEBUG"`
}

func main() {
    cfg := Config{
        Host:  "localhost",
        Port:  8080,
        Debug: true,
    }

    // Сериализация структуры в формат .env
    result, err := env.Marshal(cfg, env.FormatEnv)
    if err != nil {
        panic(err)
    }

    fmt.Println(result)
    // Вывод:
    // DEBUG=true
    // HOST=localhost
    // PORT=8080
}
```

### Вложенные структуры

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

type DatabaseConfig struct {
    Host string `env:"DB_HOST"`
    Port int64  `env:"DB_PORT"`
}

type AppConfig struct {
    Name     string         `env:"APP_NAME"`
    Database DatabaseConfig
}

func main() {
    cfg := AppConfig{
        Name: "my-app",
        Database: DatabaseConfig{
            Host: "localhost",
            Port: 5432,
        },
    }

    result, err := env.Marshal(cfg, env.FormatEnv)
    if err != nil {
        panic(err)
    }

    fmt.Println(result)
}
```

### Функция MarshalStruct

Преобразует структуру в `map[string]string`:

```go
func MarshalStruct(v any) (map[string]string, error)
```

**Параметры:**
- `v` - указатель на структуру или значение

**Возвращает:**
- `map[string]string` - отображение переменных окружения
- `error` - ошибка сериализации

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

type Config struct {
    Host string `env:"HOST"`
    Port int64  `env:"PORT"`
    Debug bool  `env:"DEBUG"`
}

func main() {
    cfg := Config{
        Host:  "localhost",
        Port:  8080,
        Debug: true,
    }

    // Преобразование в map
    data, err := env.MarshalStruct(cfg)
    if err != nil {
        panic(err)
    }

    fmt.Printf("%+v\n", data)
    // Вывод: map[DEBUG:true HOST:localhost PORT:8080]

    // Можно использовать для экспорта в файл
    content, _ := env.Marshal(data, env.FormatEnv)
    fmt.Println(content)
}
```

## Десериализация

### Десериализация Map

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

func main() {
    // Строка в формате .env
    data := `
HOST=localhost
PORT=8080
DEBUG=true
`

    // Десериализация в map
    result, err := env.UnmarshalMap(data, env.FormatEnv)
    if err != nil {
        panic(err)
    }

    fmt.Printf("%+v\n", result)
    // Вывод: map[DEBUG:true HOST:localhost PORT:8080]
}
```

### Десериализация JSON

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

func main() {
    jsonData := `{
        "API_KEY": "secret123",
        "API_URL": "https://api.example.com",
        "TIMEOUT": "30"
    }`

    result, err := env.UnmarshalMap(jsonData, env.FormatJSON)
    if err != nil {
        panic(err)
    }

    fmt.Printf("%+v\n", result)
}
```

### Десериализация YAML

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

func main() {
    yamlData := `
DATABASE_HOST: localhost
DATABASE_PORT: "5432"
DATABASE_USER: postgres
`

    result, err := env.UnmarshalMap(yamlData, env.FormatYAML)
    if err != nil {
        panic(err)
    }

    fmt.Printf("%+v\n", result)
}
```

## Десериализация структур

### Из Map

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

type Config struct {
    Host string `env:"HOST"`
    Port int64  `env:"PORT"`
}

func main() {
    data := map[string]string{
        "HOST": "example.com",
        "PORT": "443",
    }

    var cfg Config
    err := env.UnmarshalInto(data, &cfg)
    if err != nil {
        panic(err)
    }

    fmt.Printf("%+v\n", cfg)
    // Вывод: {Host:example.com Port:443}
}
```

### Из строки

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

type ServerConfig struct {
    Host    string `env:"SERVER_HOST"`
    Port    int64  `env:"SERVER_PORT"`
    Enabled bool   `env:"ENABLED"`
}

func main() {
    envData := `
SERVER_HOST=0.0.0.0
SERVER_PORT=8080
ENABLED=true
`

    var cfg ServerConfig
    err := env.UnmarshalStruct(envData, &cfg, env.FormatEnv)
    if err != nil {
        panic(err)
    }

    fmt.Printf("%+v\n", cfg)
}
```

## Пользовательская сериализация

::: tip Область действия двух пользовательских интерфейсов
- **На уровне поля**: пользовательское кодирование/декодирование полей структуры через реализацию стандартных интерфейсов `encoding.TextMarshaler` / `encoding.TextUnmarshaler` (`MarshalText()` / `UnmarshalText([]byte)`). При обработке структуры через `env.Marshal`/`env.UnmarshalInto` пословная логика распознаёт эти два интерфейса.
- **На верхнем уровне**: интерфейсы `env.Marshaler` (`MarshalEnv()`) и `env.Unmarshaler` (`UnmarshalEnv(map[string]string)`) **действуют только на верхнем уровне значения, непосредственно переданного в `env.Marshal`/`env.MarshalStruct`/`env.UnmarshalInto`**; если передаётся внешняя структура, содержащая поле этого типа, они не вызываются.
:::

### На уровне поля: реализация encoding.TextMarshaler

```go
package main

import (
    "fmt"
    "strings"

    "github.com/cybergodev/env"
)

type LogLevel string

// Реализация encoding.TextMarshaler — вызывается при сериализации как поле структуры
func (l LogLevel) MarshalText() ([]byte, error) {
    return []byte(strings.ToUpper(string(l))), nil
}

type LogConfig struct {
    Level LogLevel `env:"LOG_LEVEL"`
}

func main() {
    cfg := LogConfig{
        Level: LogLevel("debug"),
    }

    result, err := env.Marshal(cfg, env.FormatEnv)
    if err != nil {
        panic(err)
    }

    fmt.Println(result)
    // Вывод: LOG_LEVEL=DEBUG
}
```

### На уровне поля: реализация encoding.TextUnmarshaler

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

type LogLevel string

// Реализация encoding.TextUnmarshaler — вызывается при десериализации как поле структуры
func (l *LogLevel) UnmarshalText(text []byte) error {
    switch string(text) {
    case "debug", "info", "warn", "error":
        *l = LogLevel(text)
        return nil
    default:
        return fmt.Errorf("invalid log level: %s", string(text))
    }
}

type LogConfig struct {
    Level LogLevel `env:"LOG_LEVEL"`
}

func main() {
    data := map[string]string{
        "LOG_LEVEL": "info",
    }

    var cfg LogConfig
    err := env.UnmarshalInto(data, &cfg)
    if err != nil {
        panic(err)
    }

    fmt.Printf("Level: %s\n", cfg.Level)
    // Вывод: Level: info
}
```

### На верхнем уровне: реализация env.Marshaler / env.Unmarshaler

Когда значение типа **непосредственно** передаётся в `env.Marshal` / `env.UnmarshalInto` (а не как поле внешней структуры), интерфейсы `env.Marshaler` / `env.Unmarshaler` действуют на этом верхнем уровне:

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

// Тип верхнего уровня напрямую реализует env.Marshaler
type EnvBlob string

func (e EnvBlob) MarshalEnv() ([]byte, error) {
    // Пользовательский вывод сериализации
    return []byte("APP_NAME=custom\nAPP_VERSION=2.0.0"), nil
}

func main() {
    // Непосредственная сериализация значения верхнего уровня (не поле внешней структуры)
    result, err := env.Marshal(EnvBlob(""), env.FormatEnv)
    if err != nil {
        panic(err)
    }

    fmt.Println(result)
    // Вывод:
    // APP_NAME=custom
    // APP_VERSION=2.0.0
}
```

## Определение формата

### Автоопределение формата

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

func main() {
    // Автоопределение формата
    format := env.DetectFormat("config.json")
    fmt.Println(format.String()) // json

    format = env.DetectFormat("settings.yaml")
    fmt.Println(format.String()) // yaml

    format = env.DetectFormat(".env")
    fmt.Println(format.String()) // dotenv

    // Использование FormatAuto для автоопределения
    data := `{"KEY": "value"}`
    result, _ := env.UnmarshalMap(data, env.FormatAuto)
    fmt.Println(result)
}
```

## Практические сценарии

### Сохранение конфигурации в файл

```go
package main

import (
    "os"
    "github.com/cybergodev/env"
)

func main() {
    cfg := map[string]string{
        "HOST": "localhost",
        "PORT": "8080",
    }

    // Сериализация
    content, err := env.Marshal(cfg, env.FormatEnv)
    if err != nil {
        panic(err)
    }

    // Запись в файл
    err = os.WriteFile(".env", []byte(content), 0644)
    if err != nil {
        panic(err)
    }
}
```

### Экспорт текущего окружения

```go
package main

import (
    "fmt"
    "os"
    "github.com/cybergodev/env"
)

func main() {
    env.Load(".env")

    // Получение всех переменных окружения
    all := env.All()

    // Экспорт в JSON
    content, err := env.Marshal(all, env.FormatJSON)
    if err != nil {
        panic(err)
    }

    fmt.Println(content)

    // Или запись в файл
    os.WriteFile("env-export.json", []byte(content), 0644)
}
```

### Миграция конфигурации

```go
package main

import (
    "fmt"
    "os"
    "github.com/cybergodev/env"
)

func main() {
    // Чтение JSON-конфигурации
    jsonContent, _ := os.ReadFile("config.json")

    // Разбор JSON
    data, err := env.UnmarshalMap(string(jsonContent), env.FormatJSON)
    if err != nil {
        panic(err)
    }

    // Преобразование в формат .env
    envContent, err := env.Marshal(data, env.FormatEnv)
    if err != nil {
        panic(err)
    }

    // Сохранение как .env файл
    os.WriteFile(".env", []byte(envContent), 0644)

    fmt.Println("Config migrated from JSON to .env")
}
```

## Подводные камни round-trip и автоопределение формата

### `$` не экранируется: вывод Marshal при обратном чтении может измениться

`Marshal` **не** экранирует `$` в значениях. Если значение содержит литералы `$VAR` или `${VAR}`, повторный разбор вывода Marshal при включённом (по умолчанию) `ExpandVariables` развернёт эти последовательности как ссылки на переменные:

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

func main() {
    data := map[string]string{"PRICE": "100$USD"}

    out, err := env.Marshal(data, env.FormatEnv)
    if err != nil {
        panic(err)
    }
    fmt.Println(out)
    // Вывод: PRICE=100$USD
    // Примечание: запись `out` обратно в .env и загрузка с настройками
    // по умолчанию попытается развернуть $USD
}
```

Смягчение: задайте `cfg.ExpandVariables = false` на читающей стороне либо избегайте round-trip `Marshal` для значений с `$`.

### Обработка полей в MarshalStruct

При маршалинге структуры поля, маршалящиеся в **пустую строку, опускаются** (пустые строки, nil-указатели, пустые срезы); скалярные нулевые значения (`0`, `false`) **сохраняются** — они не маршалятся в пустую строку. Выровняйте на читающей стороне тегами `envDefault`.

### Гарантия отсортированных ключей

Ключи вывода `Marshal` **всегда отсортированы лексикографически**, независимо от порядка полей входной map/структуры — вывод для одной конфигурации стабилен, что удобно для diff и кэширования.

### Правила автоопределения FormatAuto

Когда `UnmarshalMap`/`UnmarshalStruct` получают `FormatAuto`, формат определяется по **содержимому** (не по расширению):

| Признак | Вердикт |
|---------|---------|
| Только пробелы | `.env` |
| Первый символ `{` или `[` | JSON |
| Первая значимая строка начинается с `- ` или содержит `: ` (двоеточие+пробел) | YAML |
| Содержит `=` | `.env` |

Обратите внимание: `: ` приоритетнее `=` — строка вида `connection: host=db port=5432` распознаётся как YAML (не `.env`).

### Вспомогательный предикат IsMarshalError

<!-- check-code: skip -->
```go
if _, err := env.Marshal(data); err != nil {
    if env.IsMarshalError(err) {
        // Ошибка маршалинга: неподдерживаемый тип входа или сбой преобразования поля
    }
}
```

## Связанная документация

- [Функции пакета](/ru/env/api-reference/functions) - справочник функций Marshal, UnmarshalMap и др.
- [Многоформатная конфигурация](/ru/env/guides/multi-format) - руководство по загрузке нескольких форматов
- [Маппинг структур](/ru/env/guides/struct-mapping) - руководство по маппингу структур
