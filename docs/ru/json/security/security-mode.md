---
sidebar_label: "Режим безопасности"
title: "Режим безопасности - CyberGo JSON | Справочник API"
description: "API безопасности CyberGo JSON: AddDangerousPattern для своих шаблонов, уровни PatternLevel, защита от JSON-инъекций и XSS с отклонением опасного ввода."
sidebar_position: 2
---

# Безопасный режим

Безопасный режим предоставляет функциональность обнаружения опасных паттернов для предотвращения инъекций JSON, загрязнения прототипа и других угроз безопасности.

## Структура DangerousPattern

DangerousPattern представляет паттерн угрозы безопасности. Это структура.

```go
type DangerousPattern struct {
	Pattern string       // Подстрока для обнаружения во входных данных
	Name    string       // Описательное имя паттерна
	Level   PatternLevel // Уровень серьёзности, определяющий способ обработки паттерна
}
```

### Описание полей

| Поле | Тип | Описание |
|------|------|------|
| `Pattern` | `string` | Подстрока для обнаружения во входных данных |
| `Name` | `string` | Описательное имя паттерна |
| `Level` | `PatternLevel` | Уровень серьёзности, определяющий способ обработки паттерна |

---

## Тип PatternLevel

PatternLevel представляет уровень серьёзности опасного паттерна.

```go
type PatternLevel int
```

### Константы

```go
const (
	// PatternLevelCritical всегда блокирует операцию
	// Используется для паттернов, представляющих немедленную угрозу безопасности (например, загрязнение прототипа)
	PatternLevelCritical PatternLevel = iota

	// PatternLevelWarning блокирует в строгом режиме, записывает предупреждение в мягком режиме
	// Используется для паттернов, которые могут указывать на злонамеренность, но имеют легитимное применение
	PatternLevelWarning

	// PatternLevelInfo только записывает в лог, никогда не блокирует
	// Используется для целей аудита/отслеживания без прерывания операций
	PatternLevelInfo
)
```

### Метод String

```go
func (pl PatternLevel) String() string
```

Возвращает строковое представление PatternLevel (`"critical"`, `"warning"`, `"info"`; для неизвестных значений — `"unknown"`).

### Матрица поведения PatternLevel

| Уровень | Семантическое намерение (документация интерфейса) | Фактическое поведение текущей реализации |
|------|----------------------|--------------------|
| `PatternLevelCritical` | Всегда блокирует операцию | Отказ при совпадении (`ErrSecurityViolation`) |
| `PatternLevelWarning` | Блокирует в строгом режиме, в мягком записывает предупреждение | **Тоже отказ при совпадении** — поле `StrictMode` сейчас не участвует в решении о блокировке паттернов |
| `PatternLevelInfo` | Только запись, никогда не блокирует | **Тоже отказ при совпадении** |

::: warning Планируйте паттерны Warning/Info исходя из «будет заблокировано»
Сканирование паттернов в текущей версии (встроенные паттерны, `Config.AdditionalDangerousPatterns` и глобально зарегистрированные паттерны идут одним путём сканирования) отклоняет операцию при любом совпадении, прошедшем проверку контекста по границам слов; `Level` не меняет результат блокировки и служит только семантической меткой для разграничения серьёзности в аудите и журналах. Поэтому **не** регистрируйте паттерн уровня `PatternLevelInfo` с мыслью «только записать, не блокировать» и не пропускайте ввод с ним — сегодня он будет блокироваться. Все совпадения регистронезависимы.
:::

---

## Встроенные опасные паттерны

### Паттерны по умолчанию

::: warning Внутренний API
Список встроенных паттернов управляется внутренними функциями и больше не экспортируется как публичный API. Пользовательские паттерны можно управлять через поле `AdditionalDangerousPatterns` в Config.
:::

Ниже приведён список встроенных опасных паттернов, все уровня Critical:

| Паттерн | Название | Категория |
|------|------|------|
| `__proto__` | prototype pollution | Загрязнение прототипа |
| `constructor[` | constructor access | Доступ к конструктору |
| `prototype.` | prototype manipulation | Манипуляция прототипом |
| `<script` | script tag injection | HTML-инъекция |
| `<iframe` | iframe injection | HTML-инъекция |
| `<object` | object injection | HTML-инъекция |
| `<embed` | embed injection | HTML-инъекция |
| `<svg` | svg injection | HTML-инъекция |
| `javascript:` | javascript protocol | Инъекция протокола |
| `vbscript:` | vbscript protocol | Инъекция протокола |
| `eval(` | dynamic code execution | Выполнение кода |
| `setTimeout(` | timer manipulation | Манипуляция таймерами |
| `setInterval(` | interval manipulation | Манипуляция интервалами |
| `require(` | code injection | Инъекция кода |
| `new function(` | dynamic function creation | Создание динамических функций |
| `document.cookie` | cookie access | Доступ к DOM |
| `window.location` | redirect manipulation | Манипуляция перенаправлением |
| `innerhtml` | DOM manipulation | Манипуляция DOM |
| `onerror`, `onload`, `onclick`, `onmouseover`, `onfocus` | event handler injection | Инъекция обработчиков событий |
| `fromcharcode(` | character encoding bypass | Обход кодировки |
| `atob(` | base64 decoding | Декодирование base64 |
| `expression(` | CSS expression injection | CSS-инъекция |
| `__defineGetter__` | getter definition | Загрязнение прототипа |
| `__defineSetter__` | setter definition | Загрязнение прототипа |

### Ключевые паттерны

::: warning Внутренний API
GetCriticalPatterns стал внутренней функцией и больше не экспортируется как публичный API. Ключевые паттерны (`__proto__`, `constructor[`, `prototype.`) всегда проверяются принудительно и не могут быть отключены.
:::

Следующие ключевые паттерны всегда полностью сканируются независимо от размера JSON:

| Паттерн | Описание |
|------|------|
| `__proto__` | prototype pollution |
| `constructor[` | constructor access |
| `prototype.` | prototype manipulation |

---

## Методы регистрации паттернов

Опасные паттерны настраиваются через структуру `Config`, а не через глобальные функции регистрации.

### Config.AddDangerousPattern

Сигнатура: `func (c *Config) AddDangerousPattern(pattern DangerousPattern)`

Добавление пользовательского опасного паттерна в конфигурацию.

```go
cfg := json.DefaultConfig()
cfg.AddDangerousPattern(json.DangerousPattern{
	Pattern: "malicious_keyword",
	Name:    "Пользовательский опасный паттерн",
	Level:   json.PatternLevelCritical,
})

processor, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer processor.Close()
```

### Config.AdditionalDangerousPatterns

Также можно напрямую установить поле `Config.AdditionalDangerousPatterns`:

```go
cfg := json.DefaultConfig()
cfg.AdditionalDangerousPatterns = []json.DangerousPattern{
	{Pattern: "eval(", Name: "eval-call", Level: json.PatternLevelCritical},
	{Pattern: "exec(", Name: "exec-call", Level: json.PatternLevelWarning},
}
```

---

## Методы конфигурации Config

### AddDangerousPattern

Добавление паттерна безопасности в конфигурацию.

```go
func (c *Config) AddDangerousPattern(pattern DangerousPattern)
```

```go
cfg := json.DefaultConfig()
cfg.AddDangerousPattern(json.DangerousPattern{
	Pattern: "custom_dangerous_string",
	Name:    "Пользовательская опасная строка",
	Level:   json.PatternLevelWarning,
})
```

### Поля конфигурации

```go
type Config struct {
	// ... другие поля ...

	// AdditionalDangerousPatterns добавляет паттерны безопасности помимо паттернов по умолчанию
	AdditionalDangerousPatterns []DangerousPattern

	// DisableDefaultPatterns отключает встроенные паттерны безопасности по умолчанию (кроме ключевых)
	// При значении true используются только AdditionalDangerousPatterns
	// Примечание: ключевые паттерны (__proto__, constructor[, prototype.) всегда применяются принудительно и не могут быть отключены
	DisableDefaultPatterns bool
}
```

---

## Глобальная регистрация паттернов

Помимо настройки паттернов на уровне экземпляра через `Config`, можно управлять глобальным реестром паттернов через функции уровня пакета. Паттерны в глобальном реестре действуют во всех экземплярах Processor.

### RegisterDangerousPattern

Сигнатура: `func RegisterDangerousPattern(pattern DangerousPattern)`

Добавление пользовательского опасного паттерна в глобальный реестр. Зарегистрированные паттерны действуют во всех экземплярах Processor.

```go
json.RegisterDangerousPattern(json.DangerousPattern{
	Pattern: "malicious_keyword",
	Name:    "Пользовательский опасный паттерн",
	Level:   json.PatternLevelCritical,
})
```

### UnregisterDangerousPattern

Сигнатура: `func UnregisterDangerousPattern(pattern string)`

Удаление указанного паттерна из глобального реестра.

```go
json.UnregisterDangerousPattern("malicious_keyword")
```

### ListDangerousPatterns

Сигнатура: `func ListDangerousPatterns() []DangerousPattern`

Возвращает все пользовательские паттерны из глобального реестра.

```go
patterns := json.ListDangerousPatterns()
for _, p := range patterns {
	fmt.Printf("Паттерн: %s, Имя: %s, Уровень: %s\n", p.Pattern, p.Name, p.Level)
}
```

### Глобальная регистрация vs добавление через Config

| Аспект | Глобальная регистрация (`RegisterDangerousPattern`) | Добавление через Config (`AddDangerousPattern` / `AdditionalDangerousPatterns`) |
|------|----------------------------------------|---------------------------------------------------------------------|
| Область действия | **Все** Processor в процессе, включая уже созданные экземпляры (реестр читается во время сканирования) | Только Processor, созданные с этим Config (фиксируется в валидатор безопасности при конструировании) |
| Способ удаления | `UnregisterDangerousPattern(pattern)` с немедленным эффектом | Нет удаления во время работы — нужен новый Config и пересоздание Processor |
| Способ запроса | `ListDangerousPatterns()` | Чтение поля `cfg.AdditionalDangerousPatterns` |
| Отношение к `DisableDefaultPatterns` | Не влияет (явно добавленные паттерны сканируются всегда) | Не влияет (аналогично) |
| Типичное применение | Политика безопасности уровня приложения, комплаенс-чёрные списки, регистрация в `main` при старте | Бизнес-настройка отдельного экземпляра (например, Processor одного тенанта блокирует конкретные ключевые слова) |

Полный сравнительный пример:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	// Глобальная регистрация: действует на все Processor (включая уже созданные)
	json.RegisterDangerousPattern(json.DangerousPattern{
		Pattern: "internal_only",
		Name:    "Внутренний идентификатор",
		Level:   json.PatternLevelCritical,
	})
	defer json.UnregisterDangerousPattern("internal_only")

	// Добавление через Config: влияет только на Processor с этим Config
	cfg := json.DefaultConfig()
	cfg.AddDangerousPattern(json.DangerousPattern{
		Pattern: "project_secret",
		Name:    "Секрет проекта",
		Level:   json.PatternLevelCritical,
	})

	withCfg, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer withCfg.Close()

	withoutCfg, err := json.New(json.DefaultConfig())
	if err != nil {
		panic(err)
	}
	defer withoutCfg.Close()

	_, err1 := withCfg.Get(`{"v": "project_secret"}`, "v")
	_, err2 := withoutCfg.Get(`{"v": "project_secret"}`, "v")
	_, err3 := withoutCfg.Get(`{"v": "internal_only"}`, "v")

	fmt.Println("Локальный паттерн блокирует процессор с конфигурацией:", err1 != nil)
	fmt.Println("Локальный паттерн блокирует обычный процессор:", err2 != nil)
	fmt.Println("Глобальный паттерн блокирует обычный процессор:", err3 != nil)
	// Вывод:
	// Локальный паттерн блокирует процессор с конфигурацией: true
	// Локальный паттерн блокирует обычный процессор: false
	// Глобальный паттерн блокирует обычный процессор: true
}
```

---

## Полные примеры

### Пользовательская политика безопасности

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// Способ 1: через поле конфигурации
	cfg := json.DefaultConfig()
	cfg.AdditionalDangerousPatterns = []json.DangerousPattern{
		{Pattern: "company_secret", Name: "Корпоративная конфиденциальная информация", Level: json.PatternLevelCritical},
	}

	// Способ 2: через метод конфигурации
	cfg.AddDangerousPattern(json.DangerousPattern{
		Pattern: "internal_api",
		Name:    "Ссылка на внутренний API",
		Level:   json.PatternLevelWarning,
	})

	p, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// Тест обнаружения опасных паттернов (паттерн совпадает как целое слово: по бокам не должно быть букв/цифр/подчёркиваний)
	_, err = p.Get(`{"data": "company_secret"}`, "data")
	fmt.Println("Обнаружен опасный паттерн:", err != nil)
	// Вывод: Обнаружен опасный паттерн: true

	// Просмотр зарегистрированных паттернов
	fmt.Printf("Количество пользовательских паттернов: %d\n", len(cfg.AdditionalDangerousPatterns))
}
```

::: tip Совпадение — «целое слово»
После совпадения паттерна выполняется проверка контекста по границам слова: если по бокам паттерна вплотную стоят буквы, цифры или подчёркивания, он считается частью обычного идентификатора и не блокируется. Например, паттерн `company_secret` срабатывает на `"company_secret"`, но не на `"company_secret_info"` (следующий `_` — внутрисловесный символ); паттерны, оканчивающиеся разделителем вроде `(`, `[`, `:`, `.`, (например, `eval(`) от суффикса не зависят. Так же совпадают и встроенные паттерны библиотеки (например, `eval(`, `__proto__`).
:::

### Отключение паттернов по умолчанию

```go
cfg := json.DefaultConfig()

// Отключение встроенных паттернов по умолчанию (кроме ключевых), использование только пользовательских паттернов
// Примечание: ключевые паттерны (__proto__, constructor[, prototype.) всегда применяются принудительно
cfg.DisableDefaultPatterns = true

// Добавление пользовательских паттернов
cfg.AddDangerousPattern(json.DangerousPattern{
	Pattern: "xss_payload",
	Name:    "Нагрузка XSS-атаки",
	Level:   json.PatternLevelCritical,
})

p, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer p.Close()
```

### Обработка паттернов по уровню

```go
// Регистрация паттернов разных уровней
cfg := json.DefaultConfig()
cfg.AddDangerousPattern(json.DangerousPattern{
	Pattern: "suspicious_but_allowed",
	Name:    "Подозрительно, но разрешено",
	Level:   json.PatternLevelInfo, // семантическая метка; в текущей реализации совпадение тоже блокируется (см. Матрицу поведения PatternLevel)
})

// Просмотр зарегистрированных пользовательских паттернов
for _, p := range cfg.AdditionalDangerousPatterns {
	fmt.Printf("Паттерн: %s, Имя: %s, Уровень: %s\n", p.Pattern, p.Name, p.Level)
}
```

---

## Переключатели сканирования

Три поля Config управляют тем, «как сканировать»:

| Поле | По умолчанию | Действие |
|------|------|------|
| `FullSecurityScan` | `false` | при `true` все входные данные сканируются полностью независимо от размера; при `false` малый ввод (< 4KB) сканируется полностью, крупный идёт по многоуровневой оптимизированной схеме (см. следующий раздел, тоже с 100% покрытием). Полный режим добавляет примерно 10–30% накладных расходов на ввод > 100KB |
| `DisableDefaultPatterns` | `false` | при `true` пропускает неключевые встроенные паттерны (HTML-теги, обработчики событий и др.), остаются 3 ключевых паттерна + пользовательские |
| `AdditionalDangerousPatterns` | `nil` | добавляет пользовательские паттерны поверх встроенных (см. выше) |

```go
cfg := json.SecurityConfig() // уже включает FullSecurityScan и ужесточает все лимиты
// эквивалент ручной настройки:
// cfg := json.DefaultConfig()
// cfg.FullSecurityScan = true
```

Рекомендация по включению: обрабатываете **недоверенный ввод** (публичные API, пользовательские загрузки, внешние webhook), работаете с конфиденциальными данными (аутентификация, финансы, персональные данные) или есть комплаенс-требование полного аудита — включайте `FullSecurityScan`; доверенным внутренним сервисам с крупными сообщениями достаточно многоуровневого сканирования по умолчанию ради пропускной способности.

---

## Стратегия сканирования безопасности

### Малый JSON (< 4KB)

Всегда выполняется полное сканирование безопасности с последовательной проверкой всех опасных паттернов.

### Крупный JSON (≥ 4KB)

Применяется многоуровневое оптимизированное сканирование с **гарантией 100% покрытия** (без слепых зон выборки):

- Ключевые паттерны (`__proto__`, `constructor[`, `prototype.`) всегда полностью сканируются
- Сначала выполняется проверка индикаторных символов: если опасных символов нет — быстрый пропуск
- Отслеживается плотность подозрительных символов: при высокой плотности выполняется откат к полному сканированию, чтобы злоумышленник не мог спрятать вредоносное содержимое в плотных областях
- Остальные паттерны сканируются **скользящим окном** 32KB (с перекрытием), что исключает пропуск паттернов на границах окон

---

## См. также

- [Config](../api-reference/config) - Параметры конфигурации
- [Валидация Schema](../api-reference/schema) - проверка через ValidateSchema
- [Система хуков](../extensions/hooks) - Перехват операций
