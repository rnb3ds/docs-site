---
title: "Файловый ввод-вывод - CyberGo JSON | API справочник"
description: "Файловый ввод-вывод CyberGo JSON: LoadFromFile/SaveToFile чтение/запись, LoadFromReader/SaveToWriter потоки и MarshalToFile/UnmarshalFromFile сериализация."
sidebar_label: "Файловый ввод-вывод"
sidebar_position: 9
---

# Функции файлового ввода-вывода

Функции файловых операций из пакета json поддерживают чтение/запись файлов, потоковый ввод-вывод и типизированную сериализацию. Все пути файлов проходят проверку безопасности перед чтением/записью (см. [Проверка путей файлов](#проверка-путей-файлов-безопасность)).

## Чтение и запись файлов

### LoadFromFile

Сигнатура: `func LoadFromFile(filePath string, cfg ...Config) (string, error)`

Загружает JSON-данные из файла, возвращает **исходную строку** (без перекодирования, сохраняя порядок байтов и пробельные символы из файла). Размер файла ограничен `Config.MaxJSONSize`.

**Параметры**

| Имя | Тип | Обязателен | Описание |
|------|------|------|------|
| `filePath` | `string` | да | Путь к файлу (должен пройти проверку безопасности) |
| `cfg` | `Config` | нет | Необязательная конфигурация (например, ужесточение `MaxJSONSize`) |

```go
data, err := json.LoadFromFile("config.json")
if err != nil {
    panic(err)
}
fmt.Println(data) // Исходная JSON-строка
```

### SaveToFile

Сигнатура: `func SaveToFile(filePath string, data any, cfg ...Config) error`

Сохраняет данные в JSON-файл. Автоматически создаёт несуществующие родительские каталоги; использует **атомарную запись** (сначала запись во временный файл, затем rename — сбой не приведёт к усечению существующего файла). Строки / `[]byte` предварительно разбираются во избежание двойного экранирования.

**Параметры**

| Имя | Тип | Обязателен | Описание |
|------|------|------|------|
| `filePath` | `string` | да | Путь к файлу (должен пройти проверку безопасности) |
| `data` | `any` | да | Данные для сохранения (Go-значение или JSON-строка) |
| `cfg` | `Config` | нет | Необязательная конфигурация (например, `PrettyConfig()` для форматированного вывода) |

```go
// Компактное сохранение (по умолчанию)
err := json.SaveToFile("output.json", map[string]any{
    "name": "Alice",
    "age":  30,
})

// Сохранение с форматированием
err = json.SaveToFile("output.json", data, json.PrettyConfig())
```

**Полный пример: круговой SaveToFile + LoadFromFile**

```go
package main

import (
    "fmt"
    "os"

    "github.com/cybergodev/json"
)

func main() {
    // Создание временного файла для автономного запуска примера
    tmp, err := os.CreateTemp("", "cybergo-*.json")
    if err != nil {
        panic(err)
    }
    path := tmp.Name()
    tmp.Close()
    defer os.Remove(path)

    // Запись: map кодируется с сортировкой ключей
    err = json.SaveToFile(path, map[string]any{"name": "Alice", "age": 30})
    if err != nil {
        panic(err)
    }

    // Чтение обратно: возвращает исходное содержимое файла
    data, err := json.LoadFromFile(path)
    if err != nil {
        panic(err)
    }
    fmt.Println(data)
    // Вывод: {"age":30,"name":"Alice"}
}
```

## Потоковый ввод-вывод

### LoadFromReader

Сигнатура: `func LoadFromReader(reader io.Reader, cfg ...Config) (string, error)`

Загружает JSON-данные из `io.Reader` и возвращает исходную строку. Количество прочитанных байт ограничено `Config.MaxJSONSize` (защита от исчерпания памяти), подходит для сетевых соединений, тел HTTP-ответов, каналов и других потоковых источников данных.

**Параметры**

| Имя | Тип | Обязателен | Описание |
|------|------|------|------|
| `reader` | `io.Reader` | да | Источник данных |
| `cfg` | `Config` | нет | Необязательная конфигурация |

```go
// Чтение из тела HTTP-ответа
resp, _ := http.Get("https://api.example.com/data")
defer resp.Body.Close()
data, err := json.LoadFromReader(resp.Body)

// Чтение из строки
data, err = json.LoadFromReader(strings.NewReader(`{"name":"test"}`))
```

**Полный пример: чтение из strings.Reader и os.File**

```go
package main

import (
    "fmt"
    "strings"

    "github.com/cybergodev/json"
)

func main() {
    // Чтение из strings.Reader (исходное содержимое возвращается как есть)
    reader := strings.NewReader(`{"name":"Alice","age":30}`)
    data, err := json.LoadFromReader(reader)
    if err != nil {
        panic(err)
    }
    fmt.Println(data)
    // Вывод: {"name":"Alice","age":30}
}
```

Чтение из `os.File` выполняется аналогично — `os.File` реализует `io.Reader`:

```go
file, err := os.Open("data.json")
if err != nil {
    panic(err)
}
defer file.Close()

data, err := json.LoadFromReader(file)
```

### SaveToWriter

Сигнатура: `func SaveToWriter(writer io.Writer, data any, cfg ...Config) error`

Кодирует данные в JSON и записывает в `io.Writer`. Как и `SaveToFile`, предварительно разбирает строки / `[]byte` для предотвращения двойного экранирования, но **не выполняет проверку пути файла** (цель контролируется вызывающим).

**Параметры**

| Имя | Тип | Обязателен | Описание |
|------|------|------|------|
| `writer` | `io.Writer` | да | Цель вывода |
| `data` | `any` | да | Данные для записи |
| `cfg` | `Config` | нет | Необязательная конфигурация |

```go
var buf bytes.Buffer
err := json.SaveToWriter(&buf, map[string]any{"name": "test"}, json.PrettyConfig())
```

**Полный пример: запись в bytes.Buffer**

```go
package main

import (
    "bytes"
    "fmt"

    "github.com/cybergodev/json"
)

func main() {
    var buf bytes.Buffer
    err := json.SaveToWriter(&buf, map[string]any{"name": "Alice", "age": 30}, json.PrettyConfig())
    if err != nil {
        panic(err)
    }
    fmt.Print(buf.String())
    // Вывод:
    // {
    //   "age": 30,
    //   "name": "Alice"
    // }
}
```

Запись в `os.File` выполняется аналогично — просто передайте файловый дескриптор.

## Удобные методы сериализации

### MarshalToFile

Сигнатура: `func MarshalToFile(filePath string, data any, cfg ...Config) error`

Сериализует данные в JSON и записывает в файл. Отличие от `SaveToFile`: `MarshalToFile` напрямую вызывает `Marshal` / `MarshalIndent` (без предварительного разбора строк), подходит для записи структур, map и других Go-значений; `SaveToFile` подходит, когда ввод может уже быть JSON-строкой / `[]byte`. Оба автоматически создают родительские каталоги и используют атомарную запись.

**Параметры**

| Имя | Тип | Обязателен | Описание |
|------|------|------|------|
| `filePath` | `string` | да | Путь к файлу |
| `data` | `any` | да | Данные для сериализации |
| `cfg` | `Config` | нет | Необязательная конфигурация (`PrettyConfig()` для вывода с отступами) |

```go
err := json.MarshalToFile("data.json", myStruct)
err = json.MarshalToFile("data.json", myStruct, json.PrettyConfig())
```

### UnmarshalFromFile

Сигнатура: `func UnmarshalFromFile(filePath string, v any, cfg ...Config) error`

Читает JSON из файла и десериализует в целевую переменную. Это удобное объединение «чтение файла + `Unmarshal`», процесс чтения ограничен `MaxJSONSize`.

**Параметры**

| Имя | Тип | Обязателен | Описание |
|------|------|------|------|
| `filePath` | `string` | да | Путь к файлу |
| `v` | `any` | да | Указатель на целевой объект |
| `cfg` | `Config` | нет | Необязательная конфигурация |

```go
var config MyConfig
err := json.UnmarshalFromFile("config.json", &config)
```

**Полный пример: круговой MarshalToFile + UnmarshalFromFile со структурой**

```go
package main

import (
    "fmt"
    "os"

    "github.com/cybergodev/json"
)

type User struct {
    Name string `json:"name"`
    Age  int    `json:"age"`
}

func main() {
    tmp, err := os.CreateTemp("", "cybergo-*.json")
    if err != nil {
        panic(err)
    }
    path := tmp.Name()
    tmp.Close()
    defer os.Remove(path)

    // Сериализация структуры в файл
    err = json.MarshalToFile(path, User{Name: "Alice", Age: 30})
    if err != nil {
        panic(err)
    }

    // Чтение из файла и десериализация
    var user User
    err = json.UnmarshalFromFile(path, &user)
    if err != nil {
        panic(err)
    }
    fmt.Printf("%s, %d\n", user.Name, user.Age)
    // Вывод: Alice, 30
}
```

## Безопасность: проверка путей файлов

Все функции файлового ввода-вывода (`LoadFromFile` / `SaveToFile` / `MarshalToFile` / `UnmarshalFromFile`) перед операцией выполняют многоуровневую проверку безопасности путей, управляемую `Config.ValidateFilePath` (по умолчанию `true`). Проверка покрывает следующие векторы атак:

| Защита | Описание |
|--------|------|
| Обход пути (path traversal) | Обнаружение `..`, `..\` и их URL-кодированных вариантов (`%2e%2e`, многоуровневое кодирование), Unicode-омоглифы (полноширинные точки / косые черты) |
| Внедрение нуль-байта | Отказ от `\x00` в пути |
| Выход по символической ссылке | Разрешение реального пути symlink для предотвращения указания на ограниченные области |
| Системные каталоги (Unix) | Блокировка доступа к `/dev/`, `/proc/`, `/etc/passwd`, `/root/` и другим чувствительным путям |
| Зарезервированные имена Windows | Отказ от `CON`, `PRN`, `COM1-9`, `LPT1-9`, UNC-путей, альтернативных потоков данных (ADS) |
| Размер файла | Проверка перед чтением, что существующий файл не превышает `MaxJSONSize`; при чтении используется `io.LimitReader` для защиты от TOCTOU |

```go
// Атака обхода пути будет отклонена, возвращается security error
_, err := json.LoadFromFile("../../etc/passwd")
// err не nil: path traversal pattern detected

// Нормальные пути не затрагиваются
data, err := json.LoadFromFile("config/app.json")
```

::: warning Внимание
Проверка путей файлов всегда действует для файловых операций (`LoadFromReader` / `SaveToWriter` не связаны с путями, поэтому не проверяются). При обработке имён файлов, предоставленных пользователем, эти проверки — часть эшелонированной защиты, но на уровне приложения также следует использовать белые списки.
:::

## Функции итерации файлов

Пакет json предоставляет семейство функций `ForeachFile`, напрямую итерирующих JSON-массивы / объекты из файла без ручного чтения и разбора:

| Функция | Назначение |
|------|------|
| `ForeachFile(path, fn, cfg...)` | Итерация корневого массива / объекта файла |
| `ForeachFileWithPath(path, pathExpr, fn, cfg...)` | Итерация коллекции по указанному пути в файле |
| `ForeachFileChunked(path, chunkSize, fn, cfg...)` | Итерация большого массива порциями (chunk) |
| `ForeachFileNested(path, fn, cfg...)` | Рекурсивная итерация всех вложенных структур |

```go
err := json.ForeachFile("users.json", func(key any, item *json.IterableValue) error {
    fmt.Println(item.GetString("name"))
    return nil
})
```

Эти функции — удобное объединение `LoadFromFile` + `Foreach`, подходящее для обработки больших коллекций. Подробности потоковой обработки и оптимизации памяти см. в [Потоковая обработка](../../streaming/large-files).

## Выбор метода

| Сценарий | Рекомендуемая функция |
|------|----------|
| Чтение файла для получения исходной строки | `LoadFromFile` |
| Чтение файла и десериализация в структуру | `UnmarshalFromFile` |
| Чтение из Reader / HTTP Body | `LoadFromReader` |
| Сохранение Go-значения в файл (компактно) | `SaveToFile` / `MarshalToFile` |
| Сохранение с форматированием | `SaveToFile(path, data, json.PrettyConfig())` |
| Запись в Writer / Buffer | `SaveToWriter` |
| Итерация коллекции в файле | Семейство `ForeachFile` |

## См. также

- [Функции обработки JSONL](./jsonl) - ParseJSONL, StreamLinesInto и др. для JSON с разделителями-новыми строками
- [Функции кодирования и вывода](./output) - Marshal, Unmarshal и др. операции сериализации
- [Потоковая обработка](../../streaming/large-files) - потоковый процессор и итерация больших файлов
- [Файловые операции Processor](../processor/file-io) - соответствующие методы экземпляра Processor
