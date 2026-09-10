---
sidebar_label: "Методы итерации"
title: "Функции итерации пакета - CyberGo JSON | Справочник API"
description: "Функции итерации CyberGo JSON: Foreach, ForeachWithPath, рекурсивный ForeachNested, ForeachWithError, IterableValue и файловая ForeachFile."
sidebar_position: 10
---

# Функции итерации уровня пакета

Функции итерации, вызываемые напрямую без создания экземпляра Processor. Взаимно однозначно соответствуют [методам итерации Processor](../processor/iterate) (двухуровневый дизайн).

::: tip Порядок итерации детерминирован
Итерация объекта идёт по именам ключей в **лексикографическом порядке**, массива — в естественном порядке. Родной порядок итерации Go map случаен; библиотека внутри выполняет сортировку, поэтому порядок вызовов колбэка для одного ввода воспроизводим, а вывод пригоден для тестирования.
:::

## Foreach

Сигнатура: `func Foreach(jsonStr string, fn func(key any, item *IterableValue), cfg ...Config)`

Итерирует JSON-массив или объект.

```go
json.Foreach(data, func(key any, item *json.IterableValue) {
	fmt.Printf("Key: %v, Value: %v\n", key, item.GetData())
})
```

**При итерации массива**: key — индекс (int)
**При итерации объекта**: key — имя ключа (string)

## ForeachWithPath

Сигнатура: `func ForeachWithPath(jsonStr, path string, fn func(key any, item *IterableValue), cfg ...Config) error`

Итерирует по пути, возвращает ошибку.

```go
err := json.ForeachWithPath(data, "items", func(key any, item *json.IterableValue) {
	fmt.Printf("[%v] %v\n", key, item.GetData())
})
```

Применимо для:
- итерации вложенных массивов
- итерации объекта по указанному пути

## ForeachNested

Сигнатура: `func ForeachNested(jsonStr string, fn func(key any, item *IterableValue), cfg ...Config)`

Рекурсивно итерирует все уровни вложенности. Предельная глубина рекурсии — 200 (защита от переполнения стека на глубоко вложенных структурах; более глубокие поддеревья не обходятся).

```go
json.ForeachNested(data, func(key any, item *json.IterableValue) {
	fmt.Printf("Ключ: %v, Значение: %v\n", key, item.GetData())
})
```

Пример данных:

```json
{
  "user": {
    "name": "test",
    "profile": {
      "age": 25,
      "tags": ["a", "b"]
    }
  }
}
```

Вывод:

```text
Ключ: user, Значение: map[string]any{...}
Ключ: name, Значение: test
Ключ: profile, Значение: map[string]any{...}
Ключ: age, Значение: 25
Ключ: tags, Значение: []any{...}
...
```

## ForeachReturn

Сигнатура: `func ForeachReturn(jsonStr string, fn func(key any, item *IterableValue), cfg ...Config) (string, error)`

Итерирует JSON-данные с доступом к каждому элементу через колбэк и возвращает повторно сериализованную JSON-строку. Колбэк может изменять map/slice через `GetData()`; изменения отражаются в возвращаемом значении. Два замечания: менять можно только **внутренности контейнеров** (добавлять/удалять ключи map, изменять элементы slice) — заменить скалярный элемент на месте через `IterableValue` нельзя; итерация выполняется над **глубокой копией** результата разбора и не загрязняет кэш процессора.

```go
result, err := json.ForeachReturn(data, func(key any, item *json.IterableValue) {
	// Доступ/изменение элемента через item.GetData()
})
```

Подходит для сценариев, где после итерации нужно продолжить цепочку операций.

## ForeachWithError

Сигнатура: `func ForeachWithError(jsonStr, path string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

Итерирует по пути; колбэк может возвращать ошибку.

```go
err := json.ForeachWithError(data, "items", func(key any, item *json.IterableValue) error {
	if item.GetInt("id") == 0 {
		return fmt.Errorf("invalid item at index %v", key)
	}
	return nil // Продолжаем итерацию
})
```

## ForeachNestedWithError

Сигнатура: `func ForeachNestedWithError(jsonStr string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

Рекурсивно итерирует все уровни вложенности; колбэк может возвращать ошибку.

```go
err := json.ForeachNestedWithError(data, func(key any, item *json.IterableValue) error {
	fmt.Printf("Ключ: %v, Значение: %v\n", key, item.GetData())
	return nil
})
```

## ForeachWithPathAndIterator

Сигнатура: `func ForeachWithPathAndIterator(jsonStr, path string, fn func(key any, item *IterableValue, currentPath string) IteratorControl, cfg ...Config) error`

Итерирует по пути и предоставляет информацию о текущем пути. Управление процессом — через `IteratorControl`.

```go
err := json.ForeachWithPathAndIterator(data, "items", func(key any, item *json.IterableValue, currentPath string) json.IteratorControl {
	fmt.Printf("Путь: %s, Ключ: %v\n", currentPath, key)
	if item.GetInt("id") == targetID {
		return json.IteratorBreak // Остановить итерацию
	}
	return json.IteratorNormal // Продолжить итерацию
})
```

## ForeachWithPathAndControl

Сигнатура: `func ForeachWithPathAndControl(jsonStr, path string, fn func(key any, value any) IteratorControl, cfg ...Config) error`

Итерирует по пути исходные значения; управление процессом — через `IteratorControl`.

```go
err := json.ForeachWithPathAndControl(data, "items", func(key any, value any) json.IteratorControl {
	fmt.Printf("Ключ: %v, Значение: %v\n", key, value)
	return json.IteratorNormal
})
```

## IterableValue

`IterableValue` в колбэке итерации предоставляет удобный доступ к значениям; полные определения методов см. в [Типах итераторов](../iterator#тип-iterablevalue).

| Метод | Описание |
|------|------|
| `GetData() any` | Получить текущее значение |
| `Get(path string) any` | Получить значение по пути |
| `GetString(key string) string` | Получить строковое значение |
| `GetInt(key string) int` | Получить целочисленное значение |
| `GetFloat64(key string) float64` | Получить число с плавающей точкой |
| `GetBool(key string) bool` | Получить логическое значение |
| `GetArray(key string) []any` | Получить массив |
| `GetObject(key string) map[string]any` | Получить объект |
| `Exists(key string) bool` | Проверить, существует ли поле |
| `IsNull(key string) bool` / `IsNullData() bool` | Проверить, является ли значение null |
| `IsEmpty(key string) bool` / `IsEmptyData() bool` | Проверить, является ли значение пустым |
| `Break() error` | Вернуть сигнал ошибки для прерывания итерации |
| `Release()` | Вернуть ресурсы в пул объектов |

## Сравнение методов

| Метод | Параметр пути | Рекурсия | Возвращаемое значение | Колбэк с ошибкой |
|------|:--------:|:----:|--------|:--------:|
| `Foreach` | нет | нет | нет | нет |
| `ForeachWithPath` | да | нет | error | нет |
| `ForeachNested` | нет | да | нет | нет |
| `ForeachReturn` | нет | нет | (string, error) | нет |
| `ForeachWithError` | да | нет | error | да |
| `ForeachNestedWithError` | нет | да | error | да |
| `ForeachWithPathAndIterator` | да | нет | error | IteratorControl |
| `ForeachWithPathAndControl` | да | нет | error | IteratorControl |

::: warning void-варианты не сообщают об ошибках
`Foreach` / `ForeachNested` не возвращают значение: ошибки настройки вроде недоступного процессора молча игнорируются, а паника колбэка перехватывается, записывается в лог, после чего итерация останавливается (процесс не падает). Варианты с error (серия `*WithError`) преобразуют панику колбэка в возвращаемую ошибку. Когда нужны сведения об ошибках, всегда используйте варианты с возвращаемым `error`.
:::

---

## Функции итерации файлов

На уровне пакета предоставляются функции итерации прямо из файла — подходят для больших JSON-файлов; соответствуют [методам итерации файлов Processor](../processor/iterate#методы-итерации-файлов).

### ForeachFile

Сигнатура: `func ForeachFile(filePath string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

Загружает JSON из файла и итерирует.

**Параметры**

| Имя | Тип | Описание |
|------|------|------|
| `filePath` | `string` | Путь к JSON-файлу |
| `fn` | `func(key any, item *IterableValue) error` | Колбэк итерации |

```go
err := json.ForeachFile("data.json", func(key any, item *json.IterableValue) error {
	fmt.Printf("[%v] %v\n", key, item.GetData())
	return nil // Продолжаем итерацию
})
```

---

### ForeachFileWithPath

Сигнатура: `func ForeachFileWithPath(filePath, path string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

Загружает JSON из файла и итерирует по указанному пути.

```go
// Итерируем только массив users
err := json.ForeachFileWithPath("data.json", ".users", func(key any, item *json.IterableValue) error {
	name := item.GetString("name")
	fmt.Printf("Пользователь: %s\n", name)
	return nil
})
```

---

### ForeachFileChunked

Сигнатура: `func ForeachFileChunked(filePath string, chunkSize int, fn func(chunk []*IterableValue) error, cfg ...Config) error`

Итерирует JSON-массив из файла порциями — подходит для пакетной обработки больших наборов данных.

**Параметры**

| Имя | Тип | Описание |
|------|------|------|
| `filePath` | `string` | Путь к JSON-файлу |
| `chunkSize` | `int` | Количество элементов в порции (при ≤0 по умолчанию 100) |
| `fn` | `func(chunk []*IterableValue) error` | Колбэк пакетной обработки |

```go
// Обрабатываем по 100 записей за порцию
err := json.ForeachFileChunked("large_data.json", 100, func(chunk []*json.IterableValue) error {
	// Пакетная вставка в базу данных
	records := make([]Record, len(chunk))
	for i, item := range chunk {
		records[i] = Record{
			ID:   item.GetInt("id"),
			Name: item.GetString("name"),
		}
	}
	return db.BatchInsert(records)
})
```

::: tip Сценарии использования
- Пакетная вставка в базу данных
- Порционные вызовы API
- Обработка больших файлов при ограниченной памяти
:::

---

### ForeachFileNested

Сигнатура: `func ForeachFileNested(filePath string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

Загружает JSON из файла и рекурсивно итерирует все вложенные структуры.

```go
err := json.ForeachFileNested("config.json", func(key any, item *json.IterableValue) error {
	// Обход всех пар ключ-значение на всех уровнях
	fmt.Printf("Путь: %v, Тип: %T\n", key, item.GetData())
	return nil
})
```

**Пример данных**:

```json
{
  "database": {
    "host": "localhost",
    "port": 5432,
    "pool": {
      "min": 5,
      "max": 20
    }
  }
}
```

**Вывод**:

```text
Путь: database, Тип: map[string]any
Путь: host, Тип: string
Путь: port, Тип: float64
Путь: pool, Тип: map[string]any
Путь: min, Тип: float64
Путь: max, Тип: float64
```

---

## Сравнение методов итерации файлов

| Метод | Параметр пути | Рекурсия | Порции | Подходящий сценарий |
|------|:--------:|:----:|:----:|----------|
| `ForeachFile` | нет | нет | нет | Простой обход файла |
| `ForeachFileWithPath` | да | нет | нет | Точечный обход |
| `ForeachFileChunked` | нет | нет | **да** | Пакетная обработка, ограниченная память |
| `ForeachFileNested` | нет | **да** | нет | Глубокий обход всех узлов |

---

## Управление итерацией

### Константы IteratorControl

`ForeachWithPathAndControl` и `ForeachWithPathAndIterator` управляют процессом итерации, возвращая `IteratorControl` (определения констант см. в [Типах итераторов](../iterator#константы-iteratorcontrol)):

| Константа | Описание |
|------|------|
| `IteratorNormal` | Нормально продолжать итерацию |
| `IteratorContinue` | no-op псевдоним `IteratorNormal` (сохранён для симметрии API) — «пропустить текущий элемент» происходит неявно: никаких побочных эффектов, итерация продолжается как обычно |
| `IteratorBreak` | Остановить итерацию |

### Прерывание итерации

Возврат `item.Break()` из колбэка с ошибкой прерывает итерацию:

```go
err := json.ForeachFile("data.json", func(key any, item *json.IterableValue) error {
	if item.GetInt("id") == targetID {
		// Цель найдена, останавливаем итерацию
		return item.Break()
	}
	return nil // Продолжаем итерацию
})
```

### Обработка ошибок

Возврат любой другой ошибки прерывает итерацию и возвращается наружу:

```go
err := json.ForeachFile("data.json", func(key any, item *json.IterableValue) error {
	if item.GetString("status") == "error" {
		return fmt.Errorf("обнаружена ошибочная запись: %v", key)
	}
	return nil
})
if err != nil {
	log.Printf("Итерация прервана: %v", err)
}
```

---

## См. также

- [Методы итерации Processor](../processor/iterate) - соответствующие методы процессора
- [Типы итераторов](../iterator) - определения типов Iterator/IterableValue/Stream/Batch/Parallel
- [Запросы по путям](./query) - серия методов Get
- [Пакетные операции](./batch) - пакетная обработка ProcessBatch
- [Файловые операции](./file-io) - LoadFromFile/SaveToFile
- [Руководство по обработке больших файлов](../../streaming/large-files) - практика потоковой обработки
