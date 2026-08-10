---
sidebar_label: "Файловый ввод-вывод"
title: "Файловый I/O Processor - CyberGo JSON | API"
description: "Файловые методы CyberGo JSON Processor: LoadFromFile/LoadFromReader загрузка, SaveToFile/MarshalToFile сохранение и SaveToWriter запись в поток."
sidebar_position: 9
---

# Методы файловых операций

Processor предоставляет методы чтения/записи JSON-файлов и потоковой загрузки, покрывающие три типа источников данных: файлы, `io.Reader`, `io.Writer`. Файловые методы перед операцией выполняют проверку безопасности путей (см. [Справочник функций](../functions/file-io#проверка-путей-файлов-безопасность)).

## Загрузка из файла

### LoadFromFile

Сигнатура: `func (p *Processor) LoadFromFile(filePath string, cfg ...Config) (string, error)`

Загружает JSON-данные из файла и возвращает **исходную строку** (с сохранением порядка байтов и пробелов из файла, без перекодирования). Количество прочитанных байт ограничено `MaxJSONSize`.

```go
data, err := p.LoadFromFile("config.json")
if err != nil {
    panic(err)
}
fmt.Println(data) // Исходная JSON-строка
```

### LoadFromFileAsData (приватизировано)

::: warning Описание изменения API
LoadFromFileAsData переведён во внутренний метод (`loadFromFileAsData`) и больше не экспортируется как публичный API. Используйте комбинацию `LoadFromFile` + `Parse`:

```go
jsonStr, err := p.LoadFromFile("data.json")
if err != nil {
    panic(err)
}
var data any
err = p.Parse(jsonStr, &data)
// Тип data — map[string]any или []any
if obj, ok := data.(map[string]any); ok {
    fmt.Println(obj["name"])
}
```

:::

## Загрузка из Reader

### LoadFromReader

Сигнатура: `func (p *Processor) LoadFromReader(reader io.Reader, cfg ...Config) (string, error)`

Загружает JSON-данные из `io.Reader` и возвращает исходную строку. Чтение ограничено `MaxJSONSize`, подходит для `os.File`, HTTP Body, каналов и других потоковых источников.

```go
file, _ := os.Open("data.json")
defer file.Close()

data, err := p.LoadFromReader(file)
if err != nil {
    panic(err)
}
```

### LoadFromReaderAsData (приватизировано)

::: warning Описание изменения API
LoadFromReaderAsData переведён во внутренний метод (`loadFromReaderAsData`) и больше не экспортируется как публичный API. Используйте комбинацию `LoadFromReader` + `Parse`:

```go
file, _ := os.Open("data.json")
defer file.Close()

jsonStr, err := p.LoadFromReader(file)
if err != nil {
    panic(err)
}
var data any
err = p.Parse(jsonStr, &data)
```

:::

## Запись в файл

### SaveToFile

Сигнатура: `func (p *Processor) SaveToFile(filePath string, data any, cfg ...Config) error`

Сохраняет данные в JSON-файл. Автоматически создаёт родительские каталоги, использует **атомарную запись** (временный файл + rename). Строки / `[]byte` предварительно разбираются во избежание двойного экранирования.

```go
err := p.SaveToFile("data.json", map[string]any{"name": "CyberGo"})

// Сохранение форматированного вывода через PrettyConfig
err = p.SaveToFile("data.json", data, json.PrettyConfig())
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
    p, err := json.New()
    if err != nil {
        panic(err)
    }
    defer p.Close()

    tmp, err := os.CreateTemp("", "cybergo-*.json")
    if err != nil {
        panic(err)
    }
    path := tmp.Name()
    tmp.Close()
    defer os.Remove(path)

    err = p.SaveToFile(path, map[string]any{"name": "Alice", "age": 30})
    if err != nil {
        panic(err)
    }

    data, err := p.LoadFromFile(path)
    if err != nil {
        panic(err)
    }
    fmt.Println(data)
    // Вывод: {"age":30,"name":"Alice"}
}
```

### MarshalToFile

Сигнатура: `func (p *Processor) MarshalToFile(path string, data any, cfg ...Config) error`

Кодирует данные в JSON и записывает в файл. Автоматически создаёт родительские каталоги, атомарная запись. Отличие от `SaveToFile`: `MarshalToFile` напрямую вызывает `Marshal` / `MarshalIndent` (без предварительного разбора строк), подходит для структур, map и других Go-значений.

```go
err := p.MarshalToFile("output.json", data)

// Сохранение с форматированием
err = p.MarshalToFile("output.json", data, json.PrettyConfig())
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
    p, err := json.New()
    if err != nil {
        panic(err)
    }
    defer p.Close()

    tmp, err := os.CreateTemp("", "cybergo-*.json")
    if err != nil {
        panic(err)
    }
    path := tmp.Name()
    tmp.Close()
    defer os.Remove(path)

    err = p.MarshalToFile(path, User{Name: "Alice", Age: 30})
    if err != nil {
        panic(err)
    }

    var user User
    err = p.UnmarshalFromFile(path, &user)
    if err != nil {
        panic(err)
    }
    fmt.Printf("%s, %d\n", user.Name, user.Age)
    // Вывод: Alice, 30
}
```

### UnmarshalFromFile

Сигнатура: `func (p *Processor) UnmarshalFromFile(path string, v any, cfg ...Config) error`

Читает JSON из файла и декодирует в целевую переменную. Чтение ограничено `MaxJSONSize`.

```go
var config Config
err := p.UnmarshalFromFile("config.json", &config)
if err != nil {
    panic(err)
}
```

### SaveToWriter

Сигнатура: `func (p *Processor) SaveToWriter(writer io.Writer, data any, cfg ...Config) error`

Кодирует данные в JSON и записывает в `io.Writer`. Не связан с путём файла, поэтому проверка пути не выполняется.

```go
var buf bytes.Buffer
err := p.SaveToWriter(&buf, data, json.PrettyConfig())
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
    p, err := json.New()
    if err != nil {
        panic(err)
    }
    defer p.Close()

    var buf bytes.Buffer
    err = p.SaveToWriter(&buf, map[string]any{"name": "Alice", "age": 30}, json.PrettyConfig())
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

## Итерация файлов

Processor предоставляет семейство методов `ForeachFile`, напрямую итерирующих JSON-коллекции из файла — это удобное объединение `LoadFromFile` + `Foreach`:

| Метод | Назначение |
|------|------|
| `ForeachFile(path, fn, cfg...)` | Итерация корневого массива / объекта файла |
| `ForeachFileWithPath(path, pathExpr, fn, cfg...)` | Итерация коллекции по указанному пути в файле |
| `ForeachFileChunked(path, chunkSize, fn, cfg...)` | Итерация большого массива порциями |
| `ForeachFileNested(path, fn, cfg...)` | Рекурсивная итерация всех вложенных структур |

```go
err := p.ForeachFile("users.json", func(key any, item *json.IterableValue) error {
    fmt.Println(item.GetString("name"))
    return nil
})
```

Колбек поддерживает `item.Break()` для досрочного завершения итерации. Подробности потоковой обработки и оптимизации больших файлов см. в [Потоковая обработка](../../streaming/large-files).

## Выбор метода

| Сценарий | Рекомендуемый метод |
|------|----------|
| Нужна исходная строка | `LoadFromFile` / `LoadFromReader` |
| Нужны разобранные данные | `LoadFromFile` + `Parse` / `LoadFromReader` + `Parse` |
| Сохранение Go-значения в файл | `SaveToFile` / `MarshalToFile` |
| Чтение из файла и декодирование в структуру | `UnmarshalFromFile` |
| Запись в Writer | `SaveToWriter` |
| Итерация коллекции в файле | Семейство `ForeachFile` |

## См. также

- [Разбор и проверка](./parse) - методы разбора Parse/Valid
- [Файловые функции](../functions/file-io) - функции файлового ввода-вывода уровня пакета (с подробным разбором проверки безопасности путей)
- [Потоковая обработка](../../streaming/large-files) - потоковый процессор и итерация больших файлов
