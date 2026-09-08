---
sidebar_label: "Шпаргалка"
title: "Шпаргалка - CyberGo JSON | быстрый справочник по API"
description: "Шпаргалка по API CyberGo JSON: запросы по путям, Set/Delete, сериализация, файлы, валидация, JSONL, кэш, безопасность и Processor — 47 функций пакета."
sidebar_position: 4
---

# Шпаргалка

Быстрый поиск часто используемых API и фрагментов кода.

## Запросы по путям

| Операция | Функция | Пример |
|----------|---------|--------|
| Получить строку | `GetString` | `json.GetString(data, "user.name")` |
| Получить целое | `GetInt` | `json.GetInt(data, "count")` |
| Получить число с плавающей точкой | `GetFloat` | `json.GetFloat(data, "price")` |
| Получить булево значение | `GetBool` | `json.GetBool(data, "enabled")` |
| Получить массив | `GetArray` | `json.GetArray(data, "items")` |
| Получить объект | `GetObject` | `json.GetObject(data, "user")` |
| Получить произвольное значение | `Get` | `json.Get(data, "items[0].id")` |
| Обобщённое получение | `GetTyped[T]` | `json.GetTyped[User](data, "user")` |
| Безопасное получение (без panic) | `SafeGet` | `json.SafeGet(data, "user.age")` |
| Пакетное получение | `GetMultiple` | `json.GetMultiple(data, []string{"a", "b"})` |
| Получение с отменой | `GetWithContext` | `json.GetWithContext(ctx, data, "user.name")` |

### Со значением по умолчанию

Функции `GetString`, `GetInt`, `GetFloat`, `GetBool` и другие принимают необязательный параметр значения по умолчанию:

| Операция | Функция | Пример |
|----------|---------|--------|
| Строка | `GetString` | `json.GetString(data, "name", "unknown")` |
| Целое число | `GetInt` | `json.GetInt(data, "count", 0)` |
| Число с плавающей точкой | `GetFloat` | `json.GetFloat(data, "rate", 0.5)` |
| Булево значение | `GetBool` | `json.GetBool(data, "debug", false)` |

## Операции изменения

| Операция | Функция | Пример |
|----------|---------|--------|
| Установить значение | `Set` | `json.Set(data, "user.name", "Alice")` |
| Пакетная установка | `SetMultiple` | `json.SetMultiple(data, map[string]any{"a": 1, "b": 2})` |
| Установка с созданием пути | `SetCreate` | `json.SetCreate(data, "a.b.c", 1)` |
| Пакетная установка с созданием пути | `SetMultipleCreate` | `json.SetMultipleCreate(data, updates)` |
| Удалить значение | `Delete` | `json.Delete(data, "user.temporary")` |
| Удалить с очисткой | `DeleteClean` | `json.DeleteClean(data, "user.temporary")` |

```go
// Установка значения
result, err := json.Set(`{"user":{}}`, "user.name", "Alice")
// {"user":{"name":"Alice"}}

// Последовательная установка нескольких полей
result, err = json.Set(data, "user.name", "Bob")
result, err = json.Set(result, "user.age", 25)

// Удаление
result, err = json.Delete(data, "user.temporary")
```

### Пакетные операции (несколько типов операций за один вызов)

```go
data := `{"user":{"name":"Alice","temp":true}}`

results, err := json.ProcessBatch([]json.BatchOperation{
	{ID: "n", Type: "get", JSONStr: data, Path: "user.name"},
	{ID: "a", Type: "set", JSONStr: data, Path: "user.age", Value: 30},
	{ID: "d", Type: "delete", JSONStr: data, Path: "user.temp"},
	{ID: "v", Type: "validate", JSONStr: data},
})
if err != nil {
	panic(err)
}
for _, r := range results {
	fmt.Println(r.ID, r.Result, r.Error)
}
```

::: tip
`BatchOperation.Type` поддерживает четыре типа: `get` / `set` / `delete` / `validate`; каждая операция передаёт данные через `JSONStr`; `BatchResult` возвращает `Result` и `Error` в соответствии с `ID`. Подробнее см. [Пакетные операции](../api-reference/functions/batch).
:::

## Сериализация и кодирование

| Операция | Функция | Пример |
|----------|---------|--------|
| Кодирование (вывод `[]byte`) | `Marshal` | `json.Marshal(data)` |
| Кодирование (вывод `string`) | `EncodeWithConfig` | `json.EncodeWithConfig(data)` |
| Форматированное кодирование (`[]byte`) | `MarshalIndent` | `json.MarshalIndent(data, "", "  ")` |
| Форматированное кодирование (`string`) | `EncodePretty` | `json.EncodePretty(data)` |
| Декодирование | `Unmarshal` | `json.Unmarshal(bytes, &v)` |
| Разбор | `Parse` | `var v T; json.Parse(jsonStr, &v)` |
| Разбор в any | `ParseAny` | `json.ParseAny(jsonStr)` |
| Форматирование JSON-текста | `Prettify` | `json.Prettify(jsonStr)` |
| Сжатие JSON-текста (buffer) | `Compact` | `json.Compact(&buf, []byte(data))` |
| Сжатие JSON-текста (string) | `CompactString` | `json.CompactString(jsonStr)` |
| Переформатирование отступов | `Indent` | `json.Indent(&buf, src, "", "  ")` |
| HTML-экранирование | `HTMLEscape` | `json.HTMLEscape(&buf, src)` |
| Кодирование пар ключ-значение в объект | `EncodeBatch` | `json.EncodeBatch(map[string]any{"a": 1})` |
| Кодирование выбранных полей | `EncodeFields` | `json.EncodeFields(user, []string{"name"})` |
| Кодирование списка значений в массив | `EncodeStream` | `json.EncodeStream([]any{1, 2})` |

`json.Encode` устарел (эквивалент `EncodeWithConfig`, будет удалён в будущей мажорной версии) — в новом коде используйте `Marshal` или `EncodeWithConfig`. Подробное сравнение функций форматирования — в [Форматированный вывод](./print).

```go
// Кодирование
b, err := json.Marshal(map[string]any{"name": "test"})

// Форматированный вывод
pretty, err := json.MarshalIndent(data, "", "  ")

// Разбор в структуру
var result map[string]any
err = json.Parse(`{"name": "test"}`, &result)

// Разбор в any
parsed, err := json.ParseAny(`{"name": "test"}`)

// Форматирование JSON-строки
pretty, err = json.Prettify(`{"name":"Alice","age":30}`)
```

## Чтение и запись файлов

| Операция | Функция | Пример |
|----------|---------|--------|
| Прочитать JSON-файл как текст | `LoadFromFile` | `json.LoadFromFile("config.json")` |
| Читать из произвольного Reader | `LoadFromReader` | `json.LoadFromReader(resp.Body)` |
| Записать значение в файл | `SaveToFile` | `json.SaveToFile("out.json", data)` |
| Закодировать и записать в файл | `MarshalToFile` | `json.MarshalToFile("out.json", v)` |
| Прочитать файл и декодировать | `UnmarshalFromFile` | `json.UnmarshalFromFile("in.json", &v)` |
| Записать значение в Writer | `SaveToWriter` | `json.SaveToWriter(w, data)` |

```go
// Чтение и запрос
data, err := json.LoadFromFile("config.json")
if err != nil {
	panic(err)
}
env := json.GetString(data, "env", "dev")

// Структура за один шаг
var cfg Config
if err := json.UnmarshalFromFile("config.json", &cfg); err != nil {
	panic(err)
}
```

::: tip
Пути файлов проходят проверку безопасности (защита от обхода каталогов и атак через символические ссылки) — недоверенные пути также блокируются. Подробнее см. [Файловые операции](../api-reference/functions/file-io).
:::

## Валидация

| Операция | Функция | Пример |
|----------|---------|--------|
| Быстрая проверка | `Valid` | `json.Valid([]byte(data))` |
| Проверка с указанием причины | `ValidWithConfig` | `json.ValidWithConfig(data)` |
| Проверка по схеме | `ValidateSchema` | `json.ValidateSchema(data, schema)` |

```go
// Быстрая проверка
if json.Valid([]byte(data)) {
	// корректный JSON
}

// Когда нужна причина сбоя
ok, err := json.ValidWithConfig(data)
if !ok {
	fmt.Println("Некорректный JSON:", err)
}

// Проверка по схеме
schema := &json.Schema{
	Type:     "object",
	Required: []string{"name"},
	Properties: map[string]*json.Schema{
		"name": {Type: "string"},
		"age":  {Type: "number"},
	},
}
p, err := json.New()
if err != nil {
	panic(err)
}
errors, _ := p.ValidateSchema(data, schema)
```

## Вспомогательные функции

| Операция | Функция | Пример |
|----------|---------|--------|
| Сравнение | `CompareJSON` | `json.CompareJSON(a, b)` |
| Слияние | `MergeJSON` | `json.MergeJSON(a, b)` |
| Слияние нескольких | `MergeMany` | `json.MergeMany([]string{s1, s2, s3})` |

```go
// Сравнение (порядок ключей и точность чисел игнорируются)
equal, _ := json.CompareJSON(`{"a":1.0,"b":2}`, `{"b":2,"a":1}`)
fmt.Println("Equal:", equal) // true (порядок и точность игнорируются)

// Слияние JSON
base := `{"database":{"host":"localhost","port":5432},"debug":false}`
override := `{"database":{"host":"prod-server","ssl":true},"monitoring":true}`

// Слияние
merged, _ := json.MergeJSON(base, override)
// Результат: {"database":{"host":"prod-server","port":5432,"ssl":true},"debug":false,"monitoring":true}

// Слияние нескольких
result, _ := json.MergeMany([]string{
	`{"a":1}`,
	`{"b":2}`,
	`{"c":3}`,
})
```

## Методы Processor

```go
// Создание процессора
processor, err := json.New()
if err != nil {
	panic(err)
}
defer processor.Close()

// Получение значения
result := processor.GetString(data, "user.profile.name")

// Безопасное получение (возвращает AccessResult)
accessResult := processor.SafeGet(data, "user.age")
age, err := accessResult.AsInt()
```

### Создание с конфигурацией

```go
// Конфигурация по умолчанию
processor, err := json.New(json.DefaultConfig())

// Конфигурация безопасности (для недоверенных данных)
processor, err = json.New(json.SecurityConfig())

// Пользовательская конфигурация
cfg := json.DefaultConfig()
cfg.CreatePaths = true
processor, err = json.New(cfg)
```

## Потоковая обработка

### Семейство функций итерации

| Операция | Функция | Особенность |
|----------|---------|-------------|
| Обход массива/объекта | `Foreach` | Самый простой, не возвращает ошибок |
| Обход с возможностью прерывания | `ForeachWithError` | Колбэк возвращает `error` / `item.Break()` |
| Обход по указанному пути | `ForeachWithPath` | Явный вариант пути, эквивалент `Foreach(data, path, ...)` |
| Глубокий обход вложенности | `ForeachNested` | Рекурсия по всем уровням |
| Обход с изменением | `ForeachReturn` | Возвращает новый изменённый JSON |
| С текущим путём | `ForeachWithPathAndIterator` | Колбэк содержит `currentPath`, прерывание управляемо |
| Обход больших файлов | `ForeachFile` | Потоковое чтение без полной загрузки в память |
| Обход файла по частям | `ForeachFileChunked` | Пакетные колбэки по `chunkSize` |

```go
data := `{"users":[{"name":"Alice"},{"name":"Bob"}]}`

// Простой обход
err := json.ForeachWithPath(data, "users", func(key any, item *json.IterableValue) {
	fmt.Println(key, item.GetString("name"))
})

// Когда нужно досрочное прерывание — вариант WithError (возврат item.Break() прерывает обход)
err = json.ForeachWithError(data, "users", func(key any, item *json.IterableValue) error {
	if item.GetString("name") == "Bob" {
		return item.Break() // остановить итерацию
	}
	return nil
})
```

### Параллельная обработка (ParallelIterator)

```go
items, _ := json.GetArray(`[1,2,3,4,5,6]`, ".")
it := json.NewParallelIterator(items)

// Параллельное отображение
doubled, err := it.Map(func(i int, v any) (any, error) {
	return v.(float64) * 2, nil
})

// Параллельная фильтрация / обход (автоматическая разбивка на партии)
_ = it.Filter(func(i int, v any) bool { return v.(float64) > 2 })
_ = it.ForEach(func(i int, v any) error { return nil })
```

### Потоковые итераторы (StreamIterator / StreamObjectIterator)

```go
f, _ := os.Open("huge.json")
defer f.Close()

// Потоковая поэлементная обработка большого массива
it, err := json.NewStreamIterator(f)
if err != nil {
	panic(err)
}
for it.Next() {
	val := it.Value() // поэлементная обработка, потребление памяти постоянно
	_ = val
	_ = it.Index()
}
if err := it.Err(); err != nil {
	panic(err) // ошибка разбора, возникшая в потоке
}

// Потоковая обработка большого объекта по ключам
oit, err := json.NewStreamObjectIterator(f)
for oit.Next() {
	fmt.Println(oit.Key(), oit.Value())
}
```

### Processor.ForeachFile (большие файлы)

```go
// Обработка большого файла
processor, err := json.New()
if err != nil {
	panic(err)
}
defer processor.Close()

err = processor.ForeachFile("large-data.json", func(key any, item *json.IterableValue) error {
	// обработка элемента данных
	id := item.GetInt("id")
	name := item.GetString("name")
	return nil // возврат item.Break() прерывает обход
})
```

### NDJSON/JSONL

```go
// Разбор JSONL
results, err := json.ParseJSONL(jsonlBytes)

// Обобщённый разбор (через StreamLinesInto)
file, _ := os.Open("data.jsonl")
defer file.Close()
users, err := json.StreamLinesInto[User](file, func(lineNum int, user User) error {
	return nil
})

// Потоковая запись
outputFile, _ := os.Create("output.jsonl")
defer outputFile.Close()
writer := json.NewJSONLWriter(outputFile)
_ = writer.Write(map[string]any{"name": "Alice"})
_ = writer.Write(map[string]any{"name": "Bob"})

// Параллельная построчная обработка несколькими воркерами
err = json.StreamJSONLParallel(file, 4, func(lineNum int, item *json.IterableValue) error {
	return nil
})

// NDJSONProcessor: с номером строки, колбэк по объектам
np := json.NewNDJSONProcessor()
err = np.ProcessFile("events.ndjson", func(lineNum int, obj map[string]any) error {
	fmt.Println(lineNum, obj)
	return nil
})
```

## Параметры конфигурации

```go
// Рекомендуемый способ: изменить конфигурацию по умолчанию
cfg := json.DefaultConfig()
cfg.MaxJSONSize = 200 * 1024 * 1024 // пользовательский лимит размера
cfg.FullSecurityScan = true         // включить полное сканирование безопасности
```

### Предустановки конфигурации

```go
// Конфигурация по умолчанию
cfg := json.DefaultConfig()

// Конфигурация безопасности (для недоверенных данных)
// cfg = json.SecurityConfig()

// Конфигурация форматирования
// cfg = json.PrettyConfig()
```

## Синтаксис путей

| Синтаксис | Описание | Пример |
|-----------|----------|--------|
| `.property` | Доступ к свойству | `user.name` |
| `[n]` | Индекс массива | `items[0]` |
| `[*]` | Подстановочный знак | `items[*].id` |
| `[start:end]` | Срез | `items[0:5]` |
| `[start:end:step]` | Срез с шагом | `items[0:10:2]` |
| `{field1,field2}` | Извлечение полей | `user{name,email}` |
| `{flat:field}` | Плоское извлечение | `groups{flat:tags}` |
| `[+]` | Добавление в конец | `items[+]` |
| `[-1]` | Отрицательный индекс (с конца) | `items[-1]` |
| `/key/key` | JSON Pointer (RFC 6901) | `/user/name` |

## Распространённые паттерны

### Безопасное получение вложенных значений

```go
// Функции получения со значением по умолчанию
name := json.GetString(data, "user.profile.name", "unknown")

// Когда нужно различать типы ошибок — используйте Get
val, err := json.Get(data, "user.profile.name")
if err != nil {
	if errors.Is(err, json.ErrPathNotFound) {
		// ключ не существует
	} else if errors.Is(err, json.ErrInvalidJSON) {
		// ошибка формата JSON
	}
	// остальные ошибки (конфликт типов, превышение лимитов) — JsonsError с контекстом, достаточно просто записать в журнал
}
```

### Получение со значением по умолчанию

```go
// Функции GetString/GetInt и др. поддерживают необязательное значение по умолчанию
timeout := json.GetInt(data, "timeout", 30)
debug := json.GetBool(data, "debug", false)
name := json.GetString(data, "user.nickname", "unknown")
```

### Утверждение типа

```go
val, _ := json.Get(data, "value")
switch v := val.(type) {
case string:
	fmt.Println("строка:", v)
case float64:
	fmt.Println("число:", v)
case bool:
	fmt.Println("булево:", v)
case []any:
	fmt.Println("массив:", len(v), "элементов")
case map[string]any:
	fmt.Println("объект:", len(v), "ключей")
}
```

### Прочитать файл -> изменить поле -> записать обратно

`Set` возвращает новую строку; `SaveToFile`, получив JSON-строку, сначала разбирает её и лишь затем кодирует (двойных кавычек не появится); вместе с `PrettyConfig` файл остаётся читаемым:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data, err := json.LoadFromFile("config.json")
	if err != nil {
		panic(err)
	}

	updated, err := json.Set(data, "server.port", 8080)
	if err != nil {
		panic(err)
	}

	if err := json.SaveToFile("config.json", updated, json.PrettyConfig()); err != nil {
		panic(err)
	}
	fmt.Println("Обновлено")
}
```

### Пакетное извлечение полей из API-ответа

Одно поле собирается подстановочным знаком, несколько разных путей — через `GetMultiple` (один парсинг):

```go
resp := `{"code":0,"data":{"users":[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}]}}`

// Одно поле: сбор подстановочным знаком
names, _ := json.GetArray(resp, "data.users[*].name") // ["Alice", "Bob"]

// Несколько разных путей: один парсинг, пакетное получение
vals, err := json.GetMultiple(resp, []string{"code", "data.users[0].id"})
if err != nil {
	panic(err)
}
fmt.Println(names, vals["data.users[0].id"]) // [Alice Bob] 1
```

### Поэлементное изменение (ForeachReturn)

В колбэке `item.GetData()` даёт ссылку на рабочую копию — изменение содержимого map/slice отразится в возвращённом новом JSON (`ForeachReturn` итерирует корневой контейнер):

```go
data := `[{"name":"Alice","active":false},{"name":"Bob","active":false}]`

updated, err := json.ForeachReturn(data, func(key any, item *json.IterableValue) {
	m, ok := item.GetData().(map[string]any)
	if !ok {
		return
	}
	m["active"] = true
})
if err != nil {
	panic(err)
}
// active обоих элементов станет true (порядок полей в выводе может отличаться от исходного)
```

::: tip Скаляры нельзя заменить на месте
Замена по ссылке из `GetData()` подходит для изменения полей map и элементов массива; если весь элемент — скаляр, заменить его на месте через IterableValue нельзя — используйте `Set(data, "items[*]", v)` или последовательные `Set`.
:::

### Слияние конфигураций

```go
// Конфигурация по умолчанию + пользовательская
defaults := `{"timeout": 30, "retries": 3}`
userConfig := `{"timeout": 60, "debug": true}`

merged, _ := json.MergeJSON(defaults, userConfig)
// {"timeout": 60, "retries": 3, "debug": true}
```

### Обработка ошибок

```go
val, err := json.Get(data, path)
if err != nil {
	// Частые сентинели: ключ не существует / ошибка формата JSON / превышен лимит размера / превышена глубина вложенности
	// (конфликт типов возвращает дескриптивный JsonsError, не совпадающий с сентинелем ErrTypeMismatch)
	switch {
	case errors.Is(err, json.ErrPathNotFound):
	case errors.Is(err, json.ErrInvalidJSON):
	case errors.Is(err, json.ErrSizeLimit):
	case errors.Is(err, json.ErrDepthLimit):
	default:
		// записать полную ошибку (с именем операции и путём)
		fmt.Println(err)
	}

	// Для ответа клиенту используйте SafeError, чтобы не раскрыть путь и внутренние детали
	_ = json.SafeError(err)
}
```

## Управление кэшем

```go
// Прогрев кэша
paths := []string{"user.name", "user.email", "items[*].id"}
result, _ := json.WarmupCache(data, paths)
fmt.Printf("Прогрев выполнен: %d/%d\n", result.Successful, result.TotalPaths)

// Очистка кэша
json.ClearCache()

// Получение статистики
stats := json.GetStats()
fmt.Printf("Доля попаданий в кэш: %.2f%%\n", stats.HitRatio*100)

// Проверка здоровья (последовательная проверка кэша, памяти и др.)
health := json.GetHealthStatus()
fmt.Println("Здоровье:", health.Healthy)
```

## Глобальный процессор

```go
// Установка пользовательского глобального процессора
cfg := json.SecurityConfig()
p, err := json.New(cfg)
if err != nil {
	panic(err)
}
json.SetGlobalProcessor(p)

// Теперь все функции уровня пакета используют этот процессор
name := json.GetString(data, "user.name")

// Очистка при завершении приложения
defer json.ShutdownGlobalProcessor()
```

## Безопасность и расширения

```go
// Управление опасными шаблонами (по умолчанию блокируются <script>, javascript: и др.)
for _, p := range json.ListDangerousPatterns() {
	fmt.Println(p.Pattern, p.Level) // Pattern — совпадение подстроки, Level — уровень
}

// Регистрация пользовательского шаблона (совпадение подстроки, трёхуровневая стратегия обработки):
//
//	PatternLevelCritical — всегда блокирует / Warning — блокирует в строгом режиме / Info — только записывает
json.RegisterDangerousPattern(json.DangerousPattern{
	Pattern: "eval(",
	Name:    "Блокировка вызовов eval",
	Level:   json.PatternLevelCritical,
})

// Отмена регистрации по строке Pattern
json.UnregisterDangerousPattern("eval(")

// Фабрики хуков: логирование / замеры / преобразование ошибок / проверка входных данных
p, _ := json.New()
p.AddHook(json.LoggingHook(slog.Default()))
p.AddHook(json.ErrorHook(func(ctx json.HookContext, err error) error {
	return fmt.Errorf("op %s: %w", ctx.Operation, err)
}))
p.AddHook(json.ValidationHook(func(jsonStr, path string) error {
	return nil // возврат не-nil отклоняет данные на входе
}))

// Цепочечные методы Config
cfg := json.SecurityConfig()
cfg.AddHook(json.LoggingHook(slog.Default()))
cfg.AddDangerousPattern(json.DangerousPattern{Pattern: "exec("})
if err := cfg.Validate(); err != nil {
	panic(err) // самопроверка конфигурации, некорректные значения вскрываются заранее
}
clone := cfg.Clone() // глубокая копия, безопасный совместный доступ
```

## См. также

- [Функции пакета](../api-reference/functions/) - полный справочник API
- [Вспомогательные функции](../api-reference/helpers) - инструменты преобразования типов
- [Processor](../api-reference/processor/) - методы процессора
- [Конфигурация](../api-reference/config) - параметры конфигурации
- [Определения типов](../api-reference/types) - AccessResult, Schema и др.
