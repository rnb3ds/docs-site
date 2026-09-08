---
sidebar_label: "Файловые операции"
title: "Функции файловых операций - CyberGo JSON | Справочник API"
description: "Функции файловых операций CyberGo JSON: LoadFromFile/SaveToFile, потоковые LoadFromReader/SaveToWriter и MarshalToFile/UnmarshalFromFile."
sidebar_position: 9
---

# Функции файловых операций

Функции файловых операций пакета json: чтение/запись файлов, потоковый ввод-вывод и типизированная сериализация. Все пути файлов перед чтением/записью проходят проверку безопасности (см. [Проверка путей файлов](#безопасность-проверка-путей-файлов)).

## Чтение и запись файлов

### LoadFromFile

Сигнатура: `func LoadFromFile(filePath string, cfg ...Config) (string, error)`

Загружает JSON-данные из файла и возвращает **исходную строку** (без перекодирования: порядок байтов и пробелы из файла сохраняются). Размер файла ограничен `Config.MaxJSONSize`.

**Параметры**

| Имя | Тип | Обязателен | Описание |
|------|------|------|------|
| `filePath` | `string` | да | Путь к файлу (должен пройти проверку безопасности) |
| `cfg` | `Config` | нет | Необязательная конфигурация (например, ужесточить `MaxJSONSize`) |

```go
data, err := json.LoadFromFile("config.json")
if err != nil {
	panic(err)
}
fmt.Println(data) // Исходная JSON-строка
```

### SaveToFile

Сигнатура: `func SaveToFile(filePath string, data any, cfg ...Config) error`

Сохраняет данные в JSON-файл. Автоматически создаёт несуществующие родительские каталоги; используется **атомарная запись** (сначала временный файл, затем rename — сбой не обрежет существующий файл). Входные данные string / `[]byte` предварительно парсятся, чтобы избежать двойного экранирования.

**Параметры**

| Имя | Тип | Обязателен | Описание |
|------|------|------|------|
| `filePath` | `string` | да | Путь к файлу (должен пройти проверку безопасности) |
| `data` | `any` | да | Сохраняемые данные (значение Go или JSON-строка) |
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

**Полный пример: цикл SaveToFile + LoadFromFile**

```go
package main

import (
	"fmt"
	"os"

	"github.com/cybergodev/json"
)

func main() {
	// Создаём временный файл, чтобы пример был самодостаточным
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

	// Чтение обратно: возвращается исходное содержимое файла
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

Загружает JSON-данные из `io.Reader` и возвращает исходную строку. Объём прочитанных байтов ограничен `Config.MaxJSONSize` (защита от исчерпания памяти); подходит для сетевых соединений, тел HTTP-ответов, пайпов и других потоковых источников.

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

Чтение из `os.File` выполняется так же — `os.File` реализует `io.Reader`:

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

Кодирует данные в JSON и записывает в `io.Writer`. Как и `SaveToFile`, предварительно парсит входные данные string / `[]byte` против двойного экранирования, но **не проверяет путь файла** (цель контролирует вызывающая сторона).

**Параметры**

| Имя | Тип | Обязателен | Описание |
|------|------|------|------|
| `writer` | `io.Writer` | да | Цель вывода |
| `data` | `any` | да | Записываемые данные |
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

Запись в `os.File` аналогична — просто передайте дескриптор файла.

## Удобные методы сериализации

### MarshalToFile

Сигнатура: `func MarshalToFile(filePath string, data any, cfg ...Config) error`

Сериализует данные в JSON и записывает в файл. **В текущей версии использует тот же конвейер «кодирование + атомарная запись», что и `SaveToFile`**: так же автоматически создаёт родительские каталоги, выполняет атомарную запись (временный файл + rename) и предварительно парсит входные данные string / `[]byte` против двойного экранирования; переданный `cfg` **действует полностью** (отступы, экранирование, обработка чисел и др. — в исторических версиях читался только флаг `Pretty`, остальные параметры кодирования молча отбрасывались). Поведение эквивалентно — выбирайте по смыслу: `MarshalToFile` для записи значений Go, `SaveToFile`, когда акцент на «сохранении JSON-документа».

**Параметры**

| Имя | Тип | Обязателен | Описание |
|------|------|------|------|
| `filePath` | `string` | да | Путь к файлу |
| `data` | `any` | да | Сериализуемые данные |
| `cfg` | `Config` | нет | Необязательная конфигурация (`PrettyConfig()` даёт вывод с отступами) |

```go
err := json.MarshalToFile("data.json", myStruct)
err = json.MarshalToFile("data.json", myStruct, json.PrettyConfig())
```

### UnmarshalFromFile

Сигнатура: `func UnmarshalFromFile(filePath string, v any, cfg ...Config) error`

Читает JSON из файла и десериализует в целевую переменную. Удобное сочетание «чтение файла + `Unmarshal`»; чтение ограничено `MaxJSONSize`.

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

**Полный пример: цикл MarshalToFile + UnmarshalFromFile для структуры**

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

Все файловые функции (`LoadFromFile` / `SaveToFile` / `MarshalToFile` / `UnmarshalFromFile`) перед операцией выполняют многоуровневую проверку пути; она управляется `Config.ValidateFilePath` (по умолчанию `true`). Проверка покрывает следующие векторы атак:

| Мера защиты | Описание |
|--------|------|
| Обход пути (path traversal) | Обнаружение `..`, `..\` и их URL-кодированных вариантов (`%2e%2e`, многослойное кодирование), Unicode-омоглифов (полноширинные точка/слэш) |
| Внедрение нулевого байта | Отклонение `\x00` в пути |
| Побег по символическим ссылкам | Разрешение реального пути symlink против выхода в закрытые области |
| Системные каталоги (Unix) | Блокировка доступа к `/dev/`, `/proc/`, `/etc/passwd`, `/root/` и другим чувствительным путям |
| Зарезервированные имена Windows | Отклонение `CON`, `PRN`, `COM1-9`, `LPT1-9`, UNC-путей, альтернативных потоков данных (ADS) |
| Размер файла | Перед чтением проверяется, не превышает ли существующий файл `MaxJSONSize`; при чтении `io.LimitReader` защищает от TOCTOU |

```go
// Атака обходом пути будет отклонена с возвратом security error
_, err := json.LoadFromFile("../../etc/passwd")
// err не nil: path traversal pattern detected

// Обычные пути не затрагиваются
data, err := json.LoadFromFile("config/app.json")
```

::: warning Примечание
Проверка пути файлов всегда действует для файловых операций (`LoadFromReader` / `SaveToWriter` пути не касаются и потому не проверяются). При работе с пользовательскими именами файлов эти проверки — один из уровней эшелонированной обороны, но на уровне приложения всё равно следует применять white-list ограничения.
:::

## Функции итерации файлов

Пакет json предоставляет серию функций `ForeachFile`, выполняющих итерацию JSON-массива/объекта прямо из файла, без ручного чтения + разбора:

| Функция | Назначение |
|------|------|
| `ForeachFile(path, fn, cfg...)` | Итерация корневого массива/объекта файла |
| `ForeachFileWithPath(path, pathExpr, fn, cfg...)` | Итерация коллекции по указанному пути внутри файла |
| `ForeachFileChunked(path, chunkSize, fn, cfg...)` | Итерация большого массива порциями (chunk) |
| `ForeachFileNested(path, fn, cfg...)` | Рекурсивная итерация всех вложенных структур |

```go
err := json.ForeachFile("users.json", func(key any, item *json.IterableValue) error {
	fmt.Println(item.GetString("name"))
	return nil
})
```

Это удобное сочетание `LoadFromFile` + `Foreach`, подходящее для больших коллекций. Подробности потоковой обработки и оптимизации памяти см. в [Потоковой обработке](../../streaming/large-files).

## Выбор метода

| Сценарий | Рекомендуемая функция |
|------|----------|
| Прочитать файл в исходную строку | `LoadFromFile` |
| Прочитать файл и десериализовать в структуру | `UnmarshalFromFile` |
| Читать из Reader / HTTP Body | `LoadFromReader` |
| Сохранить значение Go в файл (компактно) | `SaveToFile` / `MarshalToFile` |
| Сохранить с форматированием | `SaveToFile(path, data, json.PrettyConfig())` |
| Записать в Writer / Buffer | `SaveToWriter` |
| Итерировать коллекцию из файла | серия `ForeachFile` |

## См. также

- [Функции обработки JSONL](./jsonl) - обработка JSON с разделением строками ParseJSONL, StreamLinesInto и др.
- [Функции кодирования и вывода](./output) - операции сериализации Marshal, Unmarshal и др.
- [Потоковая обработка](../../streaming/large-files) - подробный разбор потоковых обработчиков и итерации больших файлов
- [Файловые операции Processor](../processor/file-io) - соответствующие методы экземпляра Processor
