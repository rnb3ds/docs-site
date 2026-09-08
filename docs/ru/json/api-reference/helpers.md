---
sidebar_label: "Вспомогательные функции"
title: "Вспомогательные функции - CyberGo JSON | Справочник API"
description: "Вспомогательные функции CyberGo JSON: сравнение CompareJSON, кэш ClearCache/GetStats, мониторинг GetHealthStatus, SafeError и RedactedPath для безопасности."
sidebar_position: 8
---

# Вспомогательные функции

Пакет json предоставляет богатый набор вспомогательных функций для сравнения JSON, управления кэшем и инструментальной обработки.

## Функции сравнения JSON

### CompareJSON

Сигнатура: `func CompareJSON(json1, json2 string, cfg ...Config) (bool, error)`

Сравнивает две JSON-строки на равенство. Обрабатывает различия точности чисел и порядка ключей.

Без cfg поведение соответствует историческому (без проверки безопасности, обе стороны маршализуются через `encoding/json`). При передаче cfg к обоим входам применяется проверка безопасности (лимиты размера/глубины/опасных шаблонов), а сравнение выполняется симметрично с кодированием из конфигурации.

```go
// Разный порядок ключей, одинаковое содержимое
equal, _ := json.CompareJSON(`{"a":1,"b":2}`, `{"b":2,"a":1}`)
fmt.Println(equal) // true

// Разная точность чисел, одинаковое значение
equal, _ = json.CompareJSON(`{"num":1}`, `{"num":1.0}`)
fmt.Println(equal) // true

// Разное содержимое
equal, _ = json.CompareJSON(`{"a":1}`, `{"a":2}`)
fmt.Println(equal) // false

// С конфигурацией (применяется проверка безопасности и управление кодированием)
equal, err = json.CompareJSON(a, b, json.SecurityConfig())
```

::: tip Эквивалентный метод Processor
`Processor.CompareJSON` всегда выполняет проверку безопасности (по cfg или собственной конфигурации процессора), что отличается от пути без cfg у функции уровня пакета. Подробнее см. [Изменение данных Processor](./processor/modify#processor-comparejson).
:::

---

## Функции слияния JSON

### MergeJSON

Сигнатура: `func MergeJSON(json1, json2 string, cfg ...Config) (string, error)`

Сливает два JSON-объекта; режим слияния настраивается через Config. Подробнее см. [Функции изменения](./functions/modify#mergejson).

**Детали семантики**:

- **Оба входных аргумента должны быть JSON-объектами** (если верхний уровень не объект, возвращается ошибка `first/second JSON is not an object`)
- Вложенные объекты рекурсивно глубоко сливаются по `Config.MergeMode`; примитивные значения и массивы берутся напрямую из `json2`
- Числа декодируются с сохранением точности, нормализуются в `float64` и кодируются снова (`1` и `1.0` эквивалентны)
- **Проверка безопасности не выполняется** — это чисто структурный инструмент: декодирование, слияние и повторное кодирование (в отличие от `CompareJSON` при передаче cfg)

---

### MergeMany

Сигнатура: `func MergeMany(jsons []string, cfg ...Config) (string, error)`

Сливает несколько JSON-объектов. Подробнее см. [Функции изменения](./functions/modify#mergemany).

**Детали семантики**: требуется **минимум 2** JSON-строки (иначе ошибка); свёртка выполняется слева направо (эквивалентно последовательным вызовам `MergeJSON`), при сбое на любом шаге возвращается ошибка `merge failed at index N: <причина>`.

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

Возвращает статистику глобального процессора.

```go
stats := json.GetStats()
fmt.Printf("Доля попаданий в кэш: %.2f%%\n", stats.HitRatio*100)
fmt.Printf("Размер кэша: %d\n", stats.CacheSize)
```

---

### GetHealthStatus (функция уровня пакета)

Сигнатура: `func GetHealthStatus() HealthStatus`

Возвращает состояние здоровья глобального процессора.

```go
status := json.GetHealthStatus()
if status.Healthy {
	fmt.Println("Процессор здоров")
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

Возвращает статистику процессора.

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

stats := p.GetStats()
fmt.Printf("Доля попаданий в кэш: %.2f%%\n", stats.HitRatio*100)
fmt.Printf("Размер кэша: %d\n", stats.CacheSize)
```

### Processor.GetHealthStatus

Сигнатура: `func (p *Processor) GetHealthStatus() HealthStatus`

Возвращает состояние здоровья процессора.

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

status := p.GetHealthStatus()
if status.Healthy {
	fmt.Println("Процессор здоров")
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
fmt.Printf("Успешно прогрето путей: %d\n", result.Successful)
```

**Структура WarmupResult**

| Поле | Тип | Описание |
|------|-----|----------|
| `TotalPaths` | `int` | Общее число путей, отправленных на прогрев |
| `Successful` | `int` | Число успешно закэшированных путей |
| `Failed` | `int` | Число неудавшихся путей |
| `SuccessRate` | `float64` | Доля успеха, **проценты 0–100** (не 0–1; для пустого списка путей — 100) |
| `FailedPaths` | `[]string` | Список неудавшихся путей (nil, если всё успешно) |

::: warning Границы ошибок при прогреве
`WarmupCache` возвращает `(result, error)`, только если **все пути завершились неудачей** (error содержит причину последнего сбоя); при отключённом кэше (`EnableCache: false`) сразу возвращается ошибка. Частичные сбои отражаются только в полях `WarmupResult`, error равен nil.
:::

---

## Управление глобальным процессором

Функции уровня пакета внутри используют глобальный процессор. Настроить или закрыть его можно следующими функциями:

| Функция | Сигнатура | Описание |
|---------|-----------|----------|
| `SetGlobalProcessor` | `func SetGlobalProcessor(processor *Processor)` | Установка пользовательского глобального процессора |
| `ShutdownGlobalProcessor` | `func ShutdownGlobalProcessor()` | Закрытие глобального процессора и освобождение ресурсов |

**Детали поведения**:

- `SetGlobalProcessor(nil)` — пустая операция; после успешной замены **старый процессор синхронно закрывается через Close** (Close внутри ждёт максимум около 5 секунд), идущие в этот момент операции не затрагиваются
- `ShutdownGlobalProcessor` потокобезопасна: закрывает процессор по умолчанию, резервный процессор и **все процессоры из кэша конфигураций**, а также очищает глобальные кэши вроде кэша типов путей. После этого первый вызов функции уровня пакета **автоматически создаёт новый процессор по умолчанию** — подходит для финальной очистки долгоживущих сервисов

::: tip Подробное использование
Полные примеры использования глобального процессора и управление его жизненным циклом описаны в [Обзоре Processor](./processor/#управление-глобальным-процессором) и [Введении в Processor](../getting-started/processor-guide#глобальный-процессор).
:::

---

## Функции вывода

::: warning Описание изменения API
Print, PrintPretty, PrintE, PrintPrettyE удалены из библиотеки и больше не предоставляются. Используйте [EncodeWithConfig](./functions/output#encodewithconfig), [EncodePretty](./functions/output#encodepretty) или [Prettify](./functions/output#prettify) вместе с `fmt.Println` (`Encode` устарел). Подробнее см. [Форматированный вывод](../getting-started/print).
:::

---

## Функции совместимости с Buffer

`Compact`, `Indent`, `HTMLEscape` полностью совместимы со стандартной библиотекой `encoding/json` и дополнительно поддерживают конфигурацию через параметр `cfg`. Полные примеры и эквивалентные методы Processor см. в [Функциях кодирования и вывода](./functions/output#compact).

| Функция | Сигнатура | Описание |
|---------|-----------|----------|
| `Compact` | `func Compact(dst *bytes.Buffer, src []byte, cfg ...Config) error` | Удаляет незначащие пробелы и **пишет в dst** (совместим с `encoding/json.Compact`, зеркален `Processor.CompactBuffer`) |
| `CompactString` | `func CompactString(jsonStr string, cfg ...Config) (string, error)` | Строка на входе, строка на выходе (зеркален `Processor.Compact`); это **две разные функции** с `Compact` |
| `Indent` | `func Indent(dst *bytes.Buffer, src []byte, prefix, indent string, cfg ...Config) error` | Форматирует с отступами и пишет в dst (совместим с `encoding/json.Indent`) |
| `HTMLEscape` | `func HTMLEscape(dst *bytes.Buffer, src []byte, cfg ...Config)` | Экранирует `<` `>` `&` и U+2028/U+2029, пишет в dst, без возвращаемого значения |

---

## Функции режима безопасности

### Config.AddDangerousPattern

Регистрируйте пользовательские опасные шаблоны методом `AddDangerousPattern` конфигурации или через поле `AdditionalDangerousPatterns`.

```go
cfg := json.DefaultConfig()
cfg.AddDangerousPattern(json.DangerousPattern{
	Pattern: "malicious_keyword",
	Name:    "пользовательское вредоносное ключевое слово",
	Level:   json.PatternLevelCritical,
})
p, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer p.Close()
```

Можно также задать поле `AdditionalDangerousPatterns` после создания Config:

```go
cfg := json.DefaultConfig()
cfg.AdditionalDangerousPatterns = []json.DangerousPattern{
	{Pattern: "malicious_keyword", Name: "пользовательское вредоносное ключевое слово", Level: json.PatternLevelCritical},
}
p, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer p.Close()
```

**Структура DangerousPattern**

| Поле | Тип | Описание |
|------|-----|----------|
| `Pattern` | `string` | Обнаруживаемая подстрока |
| `Name` | `string` | Человекочитаемое описание риска |
| `Level` | `PatternLevel` | Уровень серьёзности |

**Уровни PatternLevel**

| Уровень | Описание |
|---------|----------|
| `PatternLevelCritical` | Всегда блокирует операцию |
| `PatternLevelWarning` | Блокирует в строгом режиме, записывает предупреждение в мягком |
| `PatternLevelInfo` | Только запись в журнал, никогда не блокирует |

---

## Регистрация опасных шаблонов (глобальные функции)

Помимо `AdditionalDangerousPatterns` на уровне Config библиотека ведёт **глобальный реестр**, подходящий для единой политики безопасности на уровне процесса: шаблон регистрируется один раз при запуске процесса и действует для **всех Processor** в процессе — при проверке глобальный реестр читается в реальном времени, уже созданные Processor пересоздавать не нужно; реестр не зависит от конфигурации отдельных Processor (действует даже при установленном `DisableDefaultPatterns`), а регистрация и удаление потокобезопасны.

Структура `DangerousPattern` и уровни `PatternLevel` описаны выше в разделе [Функции режима безопасности](#функции-режима-безопасности).

### RegisterDangerousPattern

```go
func RegisterDangerousPattern(pattern DangerousPattern)
```

Регистрирует опасный шаблон в **глобальном реестре** уровня процесса; после регистрации он вместе со встроенными шаблонами участвует в проверке безопасности (обнаружение по подстроке, без учёта регистра). Повторная регистрация той же строки шаблона перезаписывает прежнюю запись.

**Параметры**

| Имя | Тип | Обязателен | Описание |
|------|------|------|------|
| `pattern` | `DangerousPattern` | да | Регистрируемый шаблон (`Pattern` — обнаруживаемая подстрока, `Name` — человекочитаемое описание, `Level` — уровень серьёзности) |

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// Регистрация один раз при запуске процесса — действует для всех Processor в процессе
	json.RegisterDangerousPattern(json.DangerousPattern{
		Pattern: "internal_admin_token",
		Name:    "внутренний административный токен",
		Level:   json.PatternLevelCritical,
	})

	// Глобально зарегистрированный шаблон действует и для Processor, созданных позже
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// ListDangerousPatterns возвращает только пользовательские шаблоны (без встроенных)
	for _, dp := range json.ListDangerousPatterns() {
		fmt.Printf("%s (level=%d)\n", dp.Pattern, dp.Level)
	}
	// Вывод: internal_admin_token (level=0)
}
```

### UnregisterDangerousPattern

```go
func UnregisterDangerousPattern(pattern string)
```

Удаляет пользовательский шаблон из глобального реестра по строке шаблона. Удаление незарегистрированного шаблона — безобидная пустая операция; на встроенные шаблоны не действует (см. предупреждение в конце раздела).

**Параметры**

| Имя | Тип | Обязателен | Описание |
|------|------|------|------|
| `pattern` | `string` | да | Строка шаблона, который нужно удалить (то есть значение поля `DangerousPattern.Pattern`) |

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	json.RegisterDangerousPattern(json.DangerousPattern{
		Pattern: "internal_admin_token",
		Name:    "внутренний административный токен",
		Level:   json.PatternLevelCritical,
	})

	// Удаление по строке шаблона; удаление незарегистрированного шаблона — безобидная пустая операция
	json.UnregisterDangerousPattern("internal_admin_token")

	// Глобальный реестр хранит только пользовательские шаблоны, после удаления он снова пуст
	fmt.Println(len(json.ListDangerousPatterns())) // Вывод: 0
}
```

### ListDangerousPatterns

```go
func ListDangerousPatterns() []DangerousPattern
```

Возвращает все шаблоны глобального реестра, то есть **пользовательские шаблоны**, зарегистрированные через `RegisterDangerousPattern` — встроенные шаблоны поддерживаются самой библиотекой, в этом списке не фигурируют и не могут быть удалены. Для пустого реестра возвращается пустой (не nil) срез.

**Возвращаемые значения**

| Тип | Описание |
|------|------|
| `[]DangerousPattern` | Все зарегистрированные пользовательские шаблоны (пустой срез, если реестр пуст) |

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	json.RegisterDangerousPattern(json.DangerousPattern{
		Pattern: "internal_admin_token",
		Name:    "внутренний административный токен",
		Level:   json.PatternLevelCritical,
	})

	patterns := json.ListDangerousPatterns()
	fmt.Println(len(patterns))     // Вывод: 1
	fmt.Println(patterns[0].Name)  // Вывод: внутренний административный токен
	fmt.Println(patterns[0].Level) // Вывод: 0 (то есть PatternLevelCritical)
}
```

::: warning Встроенные ключевые шаблоны отключить нельзя
Ключевые шаблоны вроде `__proto__`, `constructor[`, `prototype.` **всегда принудительно применяются** — `UnregisterDangerousPattern` и `DisableDefaultPatterns` на них не действуют.
:::

Полное описание режима безопасности (список встроенных опасных шаблонов, пресеты `SecurityConfig` и стратегии блокировки `PatternLevel`) см. в разделе [Режим безопасности](../security/security-mode).

---

## Функции обработки ошибок

### SafeError

Сигнатура: `func SafeError(err error) string`

Возвращает безопасное для клиента сообщение об ошибке без внутренних деталей. Подходит для использования в ответах API.

```go
val, err := json.Get(data, "user.name")
if err != nil {
	// Безопасное сообщение об ошибке (без путей, внутреннего состояния и другой чувствительной информации)
	fmt.Println(json.SafeError(err))
}
```

---

### RedactedPath

Сигнатура: `func RedactedPath(path string) string`

Возвращает обезличенный путь для безопасного журналирования. Скрывает чувствительные части пути.

```go
path := "users[0].ssn"
fmt.Println(json.RedactedPath(path)) // Вывод: *** (любой непустой путь возвращает ***, пустой путь — пустую строку)
```

---

## Методы преобразования типов AccessResult

`AccessResult` — тип, возвращаемый `Processor.SafeGet()` и функцией уровня пакета `SafeGet()`; предоставляет типобезопасные методы преобразования.

### AccessResult.AsString

Сигнатура: `func (r AccessResult) AsString() (string, error)`

Типобезопасное преобразование в строку. Успешно, только если само значение является строкой.

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

Преобразует произвольное значение в строку (форматируется через fmt.Sprintf).

```go
result := json.SafeGet(data, "user.age")
ageStr, err := result.AsStringConverted()
// "30" (строковое представление)
```

---

### AccessResult.AsInt

Сигнатура: `func (r AccessResult) AsInt() (int, error)`

Типобезопасное преобразование в целое число. Преобразование bool в int не поддерживается.

```go
result := json.SafeGet(data, "user.age")
age, err := result.AsInt()
```

---

### AccessResult.AsFloat64

Сигнатура: `func (r AccessResult) AsFloat64() (float64, error)`

Типобезопасное преобразование в float64. Преобразование bool во float64 не поддерживается.

```go
result := json.SafeGet(data, "item.price")
price, err := result.AsFloat64()
```

---

### AccessResult.AsBool

Сигнатура: `func (r AccessResult) AsBool() (bool, error)`

Типобезопасное преобразование в булево значение. Поддерживаются только типы bool и string.

```go
result := json.SafeGet(data, "feature.enabled")
enabled, err := result.AsBool()
```

---

## См. также

- [Функции запроса](./functions/query) — операции запроса Get, GetString и др.
- [Функции изменения](./functions/modify) — операции изменения Set, Delete и др.
- [Определения типов](./types) — типы AccessResult и др.
- [Параметры конфигурации](./config) — подробно о конфигурации Config
