---
sidebar_label: "Обзор безопасности"
title: "Обзор безопасности - CyberGo JSON | лучшие практики"
description: "Безопасность CyberGo JSON: валидация ввода, лимиты MaxNestingDepthSecurity и MaxMemory, защита от обхода путей и JSON-инъекций, пресеты SecurityConfig."
sidebar_position: 1
---

# Обзор безопасности

Соображения безопасности и лучшие практики при обработке данных JSON.

## Распространённые угрозы безопасности

### 1. Атаки исчерпания ресурсов

Злонамеренно сконструированный JSON может привести к исчерпанию памяти или перегрузке CPU: сверхглубокая вложенность (переполнение стека), сверхкрупное одиночное значение (память), плоские сверхширокие объекты/массивы (миллионы ключей).

**Минимальное воспроизведение** (библиотека по умолчанию блокирует глубокую вложенность и сверхкрупный ввод):

```go
package main

import (
	"fmt"
	"strings"

	"github.com/cybergodev/json"
)

func main() {
	// Вложенность глубиной 5000 уровней превышает лимит по умолчанию 200 (DefaultMaxNestingDepth)
	deep := strings.Repeat(`{"a":`, 5000) + `1` + strings.Repeat(`}`, 5000)

	p, err := json.New(json.SecurityConfig()) // лимит вложенности ужесточён до 30
	if err != nil {
		panic(err)
	}
	defer p.Close()

	_, err = p.Get(deep, "a")
	fmt.Println("Глубокая вложенность перехвачена:", err != nil)
	// Вывод: Глубокая вложенность перехвачена: true
}
```

**Защитные меры:**

```go
cfg := json.DefaultConfig()
cfg.MaxNestingDepthSecurity = 50                  // ограничить глубину вложенности
cfg.MaxJSONSize = 10 * 1024 * 1024                // ограничить размер JSON (10MB)
cfg.MaxObjectKeys = 5000                          // ограничить число ключей объекта (по умолчанию 100000)
cfg.MaxArrayElements = 5000                       // ограничить число элементов массива (по умолчанию 100000)
cfg.MaxSecurityValidationSize = 100 * 1024 * 1024 // поднять лимит безопасности до 100MB (по умолчанию 10MB)
```

Либо используйте готовый пресет [`json.SecurityConfig()`](./production-checklist#шаблон-контрольного-списка) — все лимиты в нём уже ужесточены для недоверенного ввода.

### 2. Атаки обхода пути

Злонамеренные пути могут получить доступ к непредусмотренным данным. Для обоих классов путей есть встроенная защита: **пути файлов** (`LoadFromFile`/`SaveToFile` и др.) при чтении/записи **безусловно** проверяют обход каталогов, символические ссылки, платформенные ограничения и системные каталоги; **пути JSON** (`Get`/`Set` и др.) отклоняют `..`, обход через URL-кодирование, невидимые символы нулевой ширины и другие инъекционные паттерны.

**Минимальное воспроизведение** (оба класса путей блокируются по умолчанию):

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// Путь файла: сначала NFC-нормализация + рекурсивное URL-декодирование, затем детект паттернов обхода
	_, err = p.LoadFromFile("../../../etc/passwd")
	fmt.Println("Обход файлового пути перехвачен:", err != nil)

	// Путь JSON: отклонение "..", URL-кодирования и инъекций невидимых символов
	_, err = p.Get(`{"data": 1}`, "../../etc/passwd")
	fmt.Println("Обход JSON-пути перехвачен:", err != nil)
	// Вывод:
	// Обход файлового пути перехвачен: true
	// Обход JSON-пути перехвачен: true
}
```

**Защитные меры:**

```go
// Проверка пути, введённого пользователем
func safePath(path string) bool {
	// Запрет специальных символов
	if strings.ContainsAny(path, `<>:"|\`) {
		return false
	}
	return true
}
```

На уровне приложения по-прежнему рекомендуется вести белый список путей; встроенные проверки библиотеки отвечают за перехват обходов через кодирование и обфускацию.

### 3. JSON-инъекции

Злонамеренные данные могут разрушить структуру JSON или протащить полезные нагрузки вроде `<script>`, `__proto__` в нижестоящие системы. Библиотека по умолчанию сканирует все входные данные на опасные паттерны (без учёта регистра + проверка контекста по границам слов); при совпадении операция отклоняется.

**Минимальное воспроизведение** (блокируется по умолчанию, без настройки):

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	payloads := []string{
		`{"name": "Alice", "bio": "<script>alert(1)</script>"}`, // XSS
		`{"__proto__": {"isAdmin": true}}`,                      // прототипное загрязнение
	}
	for i, in := range payloads {
		_, err := p.Get(in, ".")
		fmt.Printf("Полезная нагрузка %d перехвачена: %v\n", i+1, err != nil)
	}
	// Вывод:
	// Полезная нагрузка 1 перехвачена: true
	// Полезная нагрузка 2 перехвачена: true
}
```

Полный список встроенных паттернов — в [Безопасный режим](./security-mode#встроенные-опасные-паттерны).

**Защитные меры:**

```go
// Всегда используйте библиотечные функции для сериализации, не конкатенируйте строки
data := map[string]any{
	"user": userInput, // Библиотека автоматически экранирует
}
bytes, _ := json.Marshal(data)
```

### 4. Утечка конфиденциальных данных

Журналы или сообщения об ошибках могут раскрыть конфиденциальные данные. В библиотеке два эшелона защиты: **результаты, содержащие конфиденциальные паттерны (`password`, `token`, `api_key`, `ssn`, `aws_secret` и др.), не попадают в операционный кэш** — конфиденциальные данные не залёживаются в кэше надолго; а документирующий комментарий `HookContext.JSONStr` прямо предупреждает не записывать исходный ввод.

**Защитные меры** (удаление конфиденциальных полей перед возвратом через Hook):

```go
// Использование пользовательского Hook для фильтрации конфиденциальных полей
type FilterFieldsHook struct {
    fields map[string]bool
}

func (h *FilterFieldsHook) Before(ctx json.HookContext) error {
    return nil
}

func (h *FilterFieldsHook) After(ctx json.HookContext, result any, err error) (any, error) {
    if m, ok := result.(map[string]any); ok {
        for field := range h.fields {
            delete(m, field)
        }
    }
    return result, err
}

cfg := json.DefaultConfig()
cfg.AddHook(&FilterFieldsHook{fields: map[string]bool{
    "password": true,
    "token":    true,
    "secret":   true,
}})
```

Полный работоспособный код — в [Контрольном списке для продакшена · Обработка конфиденциальных данных](./production-checklist#обработка-конфиденциальных-данных).

## Рекомендации по конфигурации безопасности

### Обзор полей Config, связанных с безопасностью

Эти лимиты сведены внутри библиотеки в экспортируемый тип `SecurityLimits` (без публичных методов доступа, приводится как описание структуры полей):

```go
type SecurityLimits struct {
	MaxNestingDepth           int   `json:"max_nesting_depth"`
	MaxSecurityValidationSize int64 `json:"max_security_validation_size"`
	MaxObjectKeys             int   `json:"max_object_keys"`
	MaxArrayElements          int   `json:"max_array_elements"`
	MaxJSONSize               int64 `json:"max_json_size"`
	MaxPathDepth              int   `json:"max_path_depth"`
}
```

Значения полей в двух типовых конфигурациях:

| Поле Config | `DefaultConfig()` по умолчанию | Пресет `SecurityConfig()` | Вызываемая ошибка |
|------------|------------------------|--------------------------|------------|
| `MaxJSONSize` | 100MB (`DefaultMaxJSONSize`) | 10MB | `ErrSizeLimit` |
| `MaxNestingDepthSecurity` | 200 (`DefaultMaxNestingDepth`) | 30 | `ErrDepthLimit` |
| `MaxPathDepth` | 50 (`DefaultMaxPathDepth`) | 30 | `ErrInvalidPath` |
| `MaxObjectKeys` | 100000 (`DefaultMaxObjectKeys`) | 5000 | `ErrSizeLimit` |
| `MaxArrayElements` | 100000 (`DefaultMaxArrayElements`) | 5000 | `ErrSizeLimit` |
| `MaxSecurityValidationSize` | 10MB (`DefaultMaxSecuritySize`) | 10MB | — (пороговый характер) |
| `FullSecurityScan` | `false` (многоуровневое оптимизированное сканирование) | `true` (полное сканирование) | — |

`Config.Validate` зажимает выходящие за границы значения обратно в допустимый диапазон (например, `MaxNestingDepthSecurity` зажимается в 10–200, `MaxObjectKeys` — в 100–100000); детали корректировки можно посмотреть через `ValidateWithWarnings`.

### Управление опасными паттернами

Библиотека имеет встроенное обнаружение опасных паттернов по умолчанию, а также поддерживает регистрацию, отмену регистрации и запрос пользовательских паттернов.

Пользовательские паттерны единообразно выражаются структурой `DangerousPattern`:

```go
type DangerousPattern struct {
	Pattern string       // подстрока, которую нужно обнаруживать во вводе
	Name    string       // описательное имя паттерна
	Level   PatternLevel // уровень серьёзности
}
```

| Поле | Тип | Описание |
|------|------|------|
| `Pattern` | `string` | Подстрока для обнаружения во вводе (совпадение без учёта регистра) |
| `Name` | `string` | Читаемое описание риска (для журналов и аудита) |
| `Level` | `PatternLevel` | Уровень серьёзности; значения — в таблице уровней ниже (пока только семантическая метка) |

#### RegisterDangerousPattern

Сигнатура: `func RegisterDangerousPattern(pattern DangerousPattern)`

Регистрирует глобальный опасный паттерн. Паттерны из глобального реестра действуют на **все экземпляры Processor** (включая уже созданные — реестр читается во время сканирования) и проверяются в дополнение к паттернам по умолчанию.

```go
json.RegisterDangerousPattern(json.DangerousPattern{
	Pattern: "eval(",
	Name:    "eval-call",
	Level:   json.PatternLevelCritical,
})
```

#### UnregisterDangerousPattern

Сигнатура: `func UnregisterDangerousPattern(pattern string)`

Отменяет регистрацию глобального опасного паттерна по строке паттерна. Параметр `pattern` — подстрока опасного паттерна для отмены (соответствует полю `DangerousPattern.Pattern`).

```go
json.UnregisterDangerousPattern("eval(")
```

#### ListDangerousPatterns

Сигнатура: `func ListDangerousPatterns() []DangerousPattern`

Перечисляет **глобально зарегистрированные пользовательские паттерны** (без встроенных паттернов по умолчанию — встроенные действуют всегда и регистрации не требуют).

```go
patterns := json.ListDangerousPatterns()
for _, p := range patterns {
	fmt.Printf("Паттерн: %s, Имя: %s, Уровень: %s\n", p.Pattern, p.Name, p.Level)
}
```

#### Уровни опасных паттернов

| Константа | Тип | Значение | Описание |
|-----------|-----|----------|----------|
| `PatternLevelCritical` | `PatternLevel` | `0` | Критический уровень, семантически всегда блокирует |
| `PatternLevelWarning` | `PatternLevel` | `1` | Уровень предупреждения, семантически блокируется в строгом режиме |
| `PatternLevelInfo` | `PatternLevel` | `2` | Информационный уровень, семантически только запись |

::: warning Фактическое поведение блокировки по уровням
Сканирование в текущей реализации отклоняет операцию при **любом совпадении** (прошедшем проверку контекста по границам слов); поле `Level` пока не меняет поведение блокировки и служит только семантической меткой (для разграничения серьёзности в аудите и журналах). Подробнее — [Безопасный режим · Матрица поведения PatternLevel](./security-mode#матрица-поведения-patternlevel).
:::

::: tip
Метод `String()` типа `PatternLevel` возвращает соответствующее строковое представление (`"critical"`, `"warning"`, `"info"`), удобное для вывода в журнал.
:::

#### Отключение паттернов по умолчанию

Через `Config.DisableDefaultPatterns` можно отключить встроенные паттерны по умолчанию:

```go
cfg := json.DefaultConfig()
cfg.DisableDefaultPatterns = true // отключить встроенные паттерны по умолчанию
```

::: warning Примечание
При `DisableDefaultPatterns=true` все встроенные паттерны, кроме 3 ключевых (`__proto__`, `constructor[`, `prototype.` — всегда принудительно сканируются), будут отключены. Примечание: все встроенные паттерны относятся к уровню Critical.
:::

### Конфигурация для продакшена

```go
func ProductionConfig() json.Config {
	cfg := json.SecurityConfig()
	cfg.AddHook(&AuditHook{logger: prodLogger})
	return cfg
}
```

### Конфигурация для разработки

```go
func DevelopmentConfig() json.Config {
	cfg := json.DefaultConfig()
	cfg.MaxNestingDepthSecurity = 100
	cfg.AddHook(json.LoggingHook(devLogger))
	return cfg
}
```

## Валидация входных данных

### Пользовательский валидатор

Реализуйте интерфейс `Validator` (`Validate(jsonStr string) error`) для валидации входных данных:

```go
// Реализация пользовательского валидатора
type EmailValidator struct{}

func (v *EmailValidator) Validate(jsonStr string) error {
    // Проверка содержимого строки JSON
    var data map[string]any
    if err := json.Unmarshal([]byte(jsonStr), &data); err != nil {
        return err
    }
    email, ok := data["email"].(string)
    if !ok {
        return nil
    }
    if !strings.Contains(email, "@") {
        return errors.New("invalid email format")
    }
    return nil
}

// Использование пользовательского валидатора
cfg := json.DefaultConfig()
cfg.CustomValidators = []json.Validator{&EmailValidator{}}
```

### Schema-валидация

Schema — тип структуры, который можно использовать для валидации структуры JSON:

```go
schema := &json.Schema{
	Type:     "object",
	Required: []string{"id", "name", "email"},
	Properties: map[string]*json.Schema{
		"id":    {Type: "string", Pattern: `^[a-zA-Z0-9]+$`},
		"name":  {Type: "string", MinLength: 1},
		"email": {Type: "string", Format: "email"},
		"age":   {Type: "number", Minimum: 0, Maximum: 150},
	},
}
```

## Обработка ошибок

### Безопасные сообщения об ошибках

```go
val, err := json.Get(data, path)
if err != nil {
	// Не раскрывайте внутренние детали ошибки
	return errors.New("Неверный формат данных")
}
```

## Аудиторский журнал

### Запись ключевых операций

Используйте интерфейс `Hook` (`Before` возвращает `error`, `After` принимает `(HookContext, any, error)` и возвращает `(any, error)`) для записи аудиторского журнала:

```go
type AuditHook struct {
	logger *slog.Logger
}

func (h *AuditHook) Before(ctx json.HookContext) error {
	h.logger.Info("Начало JSON-операции", "op", ctx.Operation, "path", ctx.Path)
	return nil
}

func (h *AuditHook) After(ctx json.HookContext, result any, err error) (any, error) {
	h.logger.Info("Завершение JSON-операции", "op", ctx.Operation)
	return result, err
}
```

## См. также

- [Контрольный список для продакшена](./production-checklist)
- [Конфигурация Config](../api-reference/config)
- [Валидация Schema](../api-reference/schema)
