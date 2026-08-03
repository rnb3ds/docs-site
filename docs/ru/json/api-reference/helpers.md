---
sidebar_label: "Сервисные функции"
title: "Сервисные функции - CyberGo JSON | API"
description: "Сервисные функции CyberGo JSON: CompareJSON сравнение, ClearCache/GetStats управление кэшем, глобальный процессор и помощники безопасного режима."
sidebar_position: 8
---

# Сервисные функции

Пакет json предоставляет богатый набор сервисных функций для сравнения JSON, управления кэшем и утилит обработки.

## Функции сравнения JSON

### CompareJSON

Сигнатура: `func CompareJSON(json1, json2 string, cfg ...Config) (bool, error)`

Сравнивает две строки JSON на равенство. Обрабатывает различия в точности чисел и порядке ключей.

Без cfg поведение остаётся прежним (проверка безопасности не выполняется, обе стороны маршалируются через `encoding/json`). При передаче cfg к обоим входам применяется проверка безопасности (ограничения размера/глубины/опасных шаблонов) и используется симметричное сравнение с кодировкой из конфигурации.

```go
// Разный порядок ключей, но одинаковое содержимое
equal, _ := json.CompareJSON(`{"a":1,"b":2}`, `{"b":2,"a":1}`)
fmt.Println(equal) // true

// Разная точность числа, но одинаковое значение
equal, _ = json.CompareJSON(`{"num":1}`, `{"num":1.0}`)
fmt.Println(equal) // true

// Разное содержимое
equal, _ = json.CompareJSON(`{"a":1}`, `{"a":2}`)
fmt.Println(equal) // false

// С конфигурацией (применение проверки безопасности и управления кодировкой)
equal, err = json.CompareJSON(a, b, json.SecurityConfig())
```

::: tip Эквивалентный метод Processor
`Processor.CompareJSON` всегда выполняет проверку безопасности (по cfg или собственной конфигурации процессора), в отличие от пути без cfg у функции уровня пакета. Подробнее см. [Модификация данных Processor](./processor/modify#processor-comparejson).
:::

---

## Функции слияния JSON

### MergeJSON

Сигнатура: `func MergeJSON(json1, json2 string, cfg ...Config) (string, error)`

Объединяет два объекта JSON с поддержкой настройки режима слияния через Config. Подробности в разделе [Функции модификации](./functions/modify#mergejson).

---

### MergeMany

Сигнатура: `func MergeMany(jsons []string, cfg ...Config) (string, error)`

Объединяет несколько объектов JSON. Подробности в разделе [Функции модификации](./functions/modify#mergemany).

---

## Кэш и статистика

### ClearCache (функция уровня пакета)

Сигнатура: `func ClearCache()`

Очищает внутренний кэш глобального процессора.

```go
json.ClearCache()
```

---

### GetStats (функция уровня пакета)

Сигнатура: `func GetStats() Stats`

Получает статистику глобального процессора.

```go
stats := json.GetStats()
fmt.Printf("Коэффициент попаданий в кэш: %.2f%%\n", stats.HitRatio * 100)
fmt.Printf("Размер кэша: %d\n", stats.CacheSize)
```

---

### GetHealthStatus (функция уровня пакета)

Сигнатура: `func GetHealthStatus() HealthStatus`

Получает статус работоспособности глобального процессора.

```go
status := json.GetHealthStatus()
if status.Healthy {
    fmt.Println("Процессор работоспособен")
}
```

---

### Processor.ClearCache

Сигнатура: `func (p *Processor) ClearCache()`

Очищает внутренний кэш процессора.

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

p.ClearCache()
```

### Processor.GetStats

Сигнатура: `func (p *Processor) GetStats() Stats`

Получает статистику процессора.

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

stats := p.GetStats()
fmt.Printf("Коэффициент попаданий в кэш: %.2f%%\n", stats.HitRatio * 100)
fmt.Printf("Размер кэша: %d\n", stats.CacheSize)
```

### Processor.GetHealthStatus

Сигнатура: `func (p *Processor) GetHealthStatus() HealthStatus`

Получает статус работоспособности процессора.

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

status := p.GetHealthStatus()
if status.Healthy {
    fmt.Println("Процессор работоспособен")
}
```

### WarmupCache

Сигнатура: `func WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)`

Прогревает кэш для повышения производительности последующих операций.

```go
data := `{"user": {"name": "Alice", "email": "alice@example.com"}, "items": [{"id": 1}]}`
paths := []string{"user.name", "user.email", "items[*].id"}
result, err := json.WarmupCache(data, paths)
if err != nil {
    panic(err)
}
fmt.Printf("Успешно прогрето %d путей\n", result.Successful)
```

---

## Управление глобальным процессором

Функции уровня пакета внутри используют глобальный процессор. Настроить или завершить его работу можно следующими функциями:

| Функция | Сигнатура | Описание |
|------|------|------|
| `SetGlobalProcessor` | `func SetGlobalProcessor(p *Processor)` | Устанавливает пользовательский глобальный процессор |
| `ShutdownGlobalProcessor` | `func ShutdownGlobalProcessor()` | Завершает работу глобального процессора и освобождает ресурсы |

::: tip Подробное использование
Полные примеры использования глобального процессора и управление жизненным циклом см. в [Обзор Processor](./processor/#управление-глобальным-процессором) и [Руководство по Processor](../getting-started/processor-guide#глобальный-процессор).
:::

---

## Функции вывода

::: warning
Print, PrintPretty, PrintE, PrintPrettyE удалены из библиотеки и больше не предоставляются. Используйте [EncodeWithConfig](./functions/output#encodewithconfig), [EncodePretty](./functions/output#encodepretty) или [Prettify](./functions/output#prettify) вместе с `fmt.Println` (`Encode` устарел). Подробности в разделе [Функции печати](./print).
:::

---

## Функции совместимости с Buffer

`Compact`, `Indent`, `HTMLEscape` полностью совместимы со стандартной библиотекой `encoding/json` и при этом поддерживают дополнительную конфигурацию через параметр `cfg`. Полные сигнатуры, примеры и эквивалентные методы Processor см. в [Функции кодирования и вывода](./functions/output#compact).

---

## Функции безопасного режима

### Config.AddDangerousPattern

Регистрация пользовательских опасных шаблонов через метод `AddDangerousPattern` объекта Config или поле `AdditionalDangerousPatterns`.

```go
cfg := json.DefaultConfig()
cfg.AddDangerousPattern(json.DangerousPattern{
    Pattern: "malicious_keyword",
    Name:    "Пользовательское опасное ключевое слово",
    Level:   json.PatternLevelCritical,
})
p, err := json.New(cfg)
if err != nil {
    panic(err)
}
defer p.Close()
```

Также можно установить поле `AdditionalDangerousPatterns` после создания Config:

```go
cfg := json.DefaultConfig()
cfg.AdditionalDangerousPatterns = []json.DangerousPattern{
    {Pattern: "malicious_keyword", Name: "Пользовательское опасное ключевое слово", Level: json.PatternLevelCritical},
}
p, err := json.New(cfg)
if err != nil {
    panic(err)
}
defer p.Close()
```

**Структура DangerousPattern**

| Поле | Тип | Описание |
|------|------|------|
| `Pattern` | `string` | Подстрока для обнаружения |
| `Name` | `string` | Читаемое описание риска |
| `Level` | `PatternLevel` | Уровень серьёзности |

**Уровни PatternLevel**

| Уровень | Описание |
|------|------|
| `PatternLevelCritical` | Всегда блокирует операцию |
| `PatternLevelWarning` | Блокирует в строгом режиме, записывает предупреждение в мягком режиме |
| `PatternLevelInfo` | Только запись в журнал, никогда не блокирует |

---

## Функции обработки ошибок

### SafeError

Сигнатура: `func SafeError(err error) string`

Возвращает безопасное для клиента сообщение об ошибке без внутренней информации. Подходит для использования в ответах API.

```go
val, err := json.Get(data, "user.name")
if err != nil {
    // Возвращает безопасное сообщение об ошибке (без пути, внутреннего состояния и другой чувствительной информации)
    fmt.Println(json.SafeError(err))
}
```

---

### RedactedPath

Сигнатура: `func RedactedPath(path string) string`

Возвращает отредактированный путь для безопасного логирования. Скрывает чувствительные части пути.

```go
path := "users[0].ssn"
fmt.Println(json.RedactedPath(path)) // Безопасное представление пути
```

---

## Методы преобразования типов AccessResult

`AccessResult` — это тип возвращаемого значения `Processor.SafeGet()` и функции уровня пакета `SafeGet()`, предоставляющий типобезопасные методы преобразования.

### AccessResult.AsString

Сигнатура: `func (r AccessResult) AsString() (string, error)`

Безопасное преобразование в строку. Успешно только если само значение является строкой.

```go
result := json.SafeGet(data, "user.name")
name, err := result.AsString()
if err != nil {
    return
}
fmt.Println(name)
```

---

### AccessResult.AsStringConverted

Сигнатура: `func (r AccessResult) AsStringConverted() (string, error)`

Преобразует любое значение в строку (используя форматирование fmt.Sprintf).

```go
result := json.SafeGet(data, "user.age")
ageStr, err := result.AsStringConverted()
// "30" (строковое представление)
```

---

### AccessResult.AsInt

Сигнатура: `func (r AccessResult) AsInt() (int, error)`

Безопасное преобразование в целое число. Не поддерживает преобразование bool в int.

```go
result := json.SafeGet(data, "user.age")
age, err := result.AsInt()
```

---

### AccessResult.AsFloat64

Сигнатура: `func (r AccessResult) AsFloat64() (float64, error)`

Безопасное преобразование в float64. Не поддерживает преобразование bool в float64.

```go
result := json.SafeGet(data, "item.price")
price, err := result.AsFloat64()
```

---

### AccessResult.AsBool

Сигнатура: `func (r AccessResult) AsBool() (bool, error)`

Безопасное преобразование в логическое значение. Поддерживает только типы bool и string.

```go
result := json.SafeGet(data, "feature.enabled")
enabled, err := result.AsBool()
```

---

## Связанные разделы

- [Функции запросов](./functions/query) - Операции запросов Get, GetString и др.
- [Функции модификации](./functions/modify) - Операции изменения Set, Delete и др.
- [Определения типов](./types) - Типы, такие как AccessResult
- [Параметры конфигурации](./config) - Подробное описание Config
