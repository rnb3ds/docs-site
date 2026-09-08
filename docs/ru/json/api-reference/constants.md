---
sidebar_label: "Константы и ошибки"
title: "Константы и ошибки - CyberGo JSON | Справочник API"
description: "Константы и ошибки CyberGo JSON: лимиты DefaultMaxJSONSize и DefaultMaxNestingDepth, ошибка ErrPathNotFound, режимы MergeMode и структура JsonsError."
sidebar_position: 7
---

# Константы и ошибки

## Переменные ошибок

### Основные ошибки

```go
var (
	// Базовые ошибки
	ErrInvalidJSON     = errors.New("invalid JSON format")
	ErrPathNotFound    = errors.New("path not found")
	ErrTypeMismatch    = errors.New("type mismatch")
	ErrInvalidPath     = errors.New("invalid path format")
	ErrProcessorClosed = errors.New("processor is closed")

	// Ошибки лимитов
	ErrSizeLimit        = errors.New("size limit exceeded")
	ErrDepthLimit       = errors.New("depth limit exceeded")
	ErrConcurrencyLimit = errors.New("concurrency limit exceeded") // Возвращается, когда контролируемые операции (Get/Set/Delete и др.) достигают MaxConcurrency

	// Ошибки безопасности и валидации
	ErrSecurityViolation = errors.New("security violation detected")
	ErrUnsupportedPath   = errors.New("unsupported path operation")

	// Ошибки ресурсов и производительности (обе Deprecated: в настоящее время не возвращаются ни одной операцией, сохранены для будущего использования)
	ErrOperationTimeout  = errors.New("operation timeout")
	ErrResourceExhausted = errors.New("system resources exhausted")
)
```

### Краткая справка по сценариям срабатывания

Типичные сценарии срабатывания каждой сигнатурной ошибки — для написания логики восстановления по веткам ошибок:

| Ошибка | Типичный сценарий срабатывания | Рекомендуемая обработка |
|------|--------------|----------|
| `ErrInvalidJSON` | Ввод не является корректным JSON (лишние символы, незакрытые скобки и т.п.) | Отклонить ввод, проверить источник |
| `ErrPathNotFound` | Путь `Get` не существует в данных | Частая бизнес-ситуация, подстраховать значением по умолчанию |
| `ErrTypeMismatch` | Путь существует, но тип не соответствует (например, `[0]` для пути-строки) | Проверить предположения о структуре данных |
| `ErrInvalidPath` | Синтаксическая ошибка пути (`CompilePath` / сбой разбора пути) | Исправить path-выражение |
| `ErrProcessorClosed` | Вызов методов после `Close()` (или во время закрытия) | Проверить жизненный цикл, предпроверка через `IsClosed` |
| `ErrSizeLimit` | Ввод превышает `MaxJSONSize` / `MaxSecurityValidationSize` | Увеличить лимит или отклонить слишком большой ввод |
| `ErrDepthLimit` | Вложенность превышает `MaxNestingDepthSecurity` | Отклонить глубоко вложенный ввод (возможна атака) |
| `ErrConcurrencyLimit` | Конкурентность контролируемых операций превышает `MaxConcurrency` | Снизить конкурентность или увеличить лимит |
| `ErrSecurityViolation` | Срабатывание опасного паттерна, превышение `MaxObjectKeys`/`MaxArrayElements` | Записать аудитный лог и отклонить |
| `ErrUnsupportedPath` | Сегмент пути не поддерживается для текущей формы данных (например, срез для не-массива) | Проверить предположения о структуре данных |
| `ErrOperationTimeout` | Зарезервировано, в настоящее время не возвращается ни одной операцией (deprecated) | Обработка в ветках ошибок не требуется |
| `ErrResourceExhausted` | Зарезервировано, в настоящее время не возвращается ни одной операцией (deprecated) | Обработка в ветках ошибок не требуется |

::: tip Два Deprecated-сигнала
`ErrOperationTimeout` и `ErrResourceExhausted` в настоящее время **не возвращаются ни одной операцией** и сохранены только для будущих версий — обрабатывать их в ветках ошибок не нужно.
:::

### Проверка ошибок

Используйте `errors.Is` для проверки типа ошибки:

```go
val, err := json.Get(data, "user.name")
if err != nil {
	if errors.Is(err, json.ErrPathNotFound) {
		// Путь не существует
		fmt.Println("Путь не найден")
	} else if errors.Is(err, json.ErrTypeMismatch) {
		// Несоответствие типов
		fmt.Println("Несоответствие типов")
	} else if errors.Is(err, json.ErrInvalidJSON) {
		// Неверный формат JSON
		fmt.Println("Недействительный JSON")
	}
}
```

## Тип JsonsError

### Определение структуры

```go
type JsonsError struct {
	Op      string `json:"op"`      // Название операции
	Path    string `json:"path"`    // Путь, где произошла ошибка
	Message string `json:"message"` // Человекочитаемое сообщение об ошибке
	Err     error  `json:"err"`     // Базовая ошибка
}
```

**Описание полей**

| Поле | Тип | Описание |
|------|------|------|
| `Op` | `string` | Название операции, завершившейся ошибкой |
| `Path` | `string` | JSON-путь, где произошла ошибка |
| `Message` | `string` | Человекочитаемое сообщение об ошибке |
| `Err` | `error` | Базовая ошибка (может быть `nil`); через `Unwrap` поддерживает обход цепочки `errors.Is` / `errors.As` |

### Методы

```go
func (e *JsonsError) Error() string // "JSON <op> failed at path '<path>': <msg> (caused by: ...)"
func (e *JsonsError) Unwrap() error // Возвращает базовую ошибку (поддержка цепочек errors.As/Is)
func (e *JsonsError) Is(target error) bool
```

Правила сопоставления `Is`:

- Если цель — `*JsonsError`, выполняется сравнение полей `Op`, `Path`, `Err` (`Message` — производная информация, **намеренно исключена** из сравнения)
- Если цель — другая ошибка (например, сигнатурная), выполняется `errors.Is` для базового `Err` — поэтому `errors.Is(err, json.ErrPathNotFound)` остаётся верным и для обёрнутого `JsonsError`

### Пример использования

```go
val, err := json.Get(data, "complex.path[0]")
if err != nil {
	var jsonErr *json.JsonsError
	if errors.As(err, &jsonErr) {
		fmt.Printf("Операция: %s\n", jsonErr.Op)
		fmt.Printf("Путь: %s\n", jsonErr.Path)
		fmt.Printf("Сообщение: %s\n", jsonErr.Message)
		if jsonErr.Err != nil {
			fmt.Printf("Причина: %v\n", jsonErr.Err)
		}
	}
}
```

## Вспомогательные функции для ошибок

Помимо описанных типов ошибок, библиотека предоставляет две вспомогательные функции обработки ошибок (полное описание см. в [Вспомогательных функциях](./helpers#safeerror)):

| Функция | Сигнатура | Описание |
|------|------|------|
| `SafeError` | `func SafeError(err error) string` | Возвращает безопасное для клиента сообщение об ошибке, опуская внутренние детали вроде имён путей (CWE-209) |
| `RedactedPath` | `func RedactedPath(path string) string` | Возвращает обезличенный путь (непустой путь маскируется в `"***"`), используется для логов и ответов об ошибках |

## Пресеты конфигурации

### Константы значений по умолчанию

```go
const (
	// Ограничения размеров
	DefaultMaxJSONSize     = 100 * 1024 * 1024 // 100MB
	DefaultMaxNestingDepth = 200
	DefaultMaxPathDepth    = 50
	DefaultMaxDepth        = 100 // Глубина вложенности кодирования/декодирования по умолчанию (Config.MaxDepth)
	DefaultMaxConcurrency  = 50

	// Ограничения безопасности
	DefaultMaxSecuritySize   = 10 * 1024 * 1024 // 10MB
	DefaultMaxObjectKeys     = 100000
	DefaultMaxArrayElements  = 100000
	DefaultMaxBatchSize      = 2000
	DefaultParallelThreshold = 10

	// Кэш
	DefaultCacheTTL = 5 * time.Minute
)
```

### Соответствие констант полям Config

| Константа | Значение по умолчанию | Поле Config | Описание |
|------|--------|------------------|------|
| `DefaultMaxJSONSize` | 100MB | `MaxJSONSize` | Верхний предел размера одного входного JSON |
| `DefaultMaxNestingDepth` | 200 | `MaxNestingDepthSecurity` | Верхний предел глубины вложенности JSON |
| `DefaultMaxPathDepth` | 50 | `MaxPathDepth` | Верхний предел количества сегментов пути (уровней в `a.b.c.d...`) |
| `DefaultMaxDepth` | 100 | `MaxDepth` | Глубина вложенности кодирования/декодирования (Marshal/Unmarshal) по умолчанию |
| `DefaultMaxConcurrency` | 50 | `MaxConcurrency` | Верхний предел конкурентных операций |
| `DefaultMaxSecuritySize` | 10MB | `MaxSecurityValidationSize` | Документы больше этого размера проверяются выборочной проверкой безопасности |
| `DefaultMaxObjectKeys` | 100000 | `MaxObjectKeys` | Верхний предел количества ключей объекта |
| `DefaultMaxArrayElements` | 100000 | `MaxArrayElements` | Верхний предел количества элементов массива |
| `DefaultMaxBatchSize` | 2000 | `MaxBatchSize` | Верхний предел операций в одном `ProcessBatch`; при превышении возвращается `ErrSizeLimit` |
| `DefaultParallelThreshold` | 10 | `ParallelThreshold` | Порог параллельной обработки: при меньшем количестве операций используется последовательная обработка |
| `DefaultCacheTTL` | 5 минут | `CacheTTL` | Время жизни записи кэша |

## Функции пресетов конфигурации

### DefaultConfig

Сигнатура: `func DefaultConfig() Config`

Возвращает конфигурацию по умолчанию.

```go
cfg := json.DefaultConfig()
processor, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer processor.Close()
```

### SecurityConfig

Сигнатура: `func SecurityConfig() Config`

Возвращает конфигурацию безопасности, подходящую для обработки недоверенного ввода.

```go
// Рекомендуется для:
// - публичных API и веб-сервисов
// - данных, отправляемых пользователями
// - внешних Webhook
// - эндпоинтов аутентификации
// - обработки финансовых данных
cfg := json.SecurityConfig()
processor, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer processor.Close()
```

**Особенности конфигурации безопасности**:

- Полное сканирование безопасности
- Строгий режим
- Консервативные значения лимитов
- Включённый кэш

### PrettyConfig

Сигнатура: `func PrettyConfig() Config`

Возвращает конфигурацию форматированного вывода.

```go
result, err := json.EncodeWithConfig(data, json.PrettyConfig())
```

## Константы режимов слияния

```go
// MergeMode — тип режима слияния (экспортирован из пакета internal)
type MergeMode = internal.MergeMode

const (
	// MergeUnion — слияние-объединение (по умолчанию)
	// Объекты: объединяются все ключи, при конфликте берётся перекрывающее значение
	// Массивы: объединяются все элементы с удалением дубликатов
	MergeUnion = internal.MergeUnion

	// MergeIntersection — слияние-пересечение
	// Объекты: сохраняются только общие ключи
	// Массивы: сохраняются только общие элементы
	MergeIntersection = internal.MergeIntersection

	// MergeDifference — слияние-разность
	// Объекты: сохраняются только ключи, которые есть в базовом, но нет в перекрывающем
	// Массивы: сохраняются только элементы, которые есть в базовом, но нет в перекрывающем
	MergeDifference = internal.MergeDifference
)
```

## Тип сегмента пути

`PathSegment` — тип сегмента пути, экспортированный из пакета `internal`; представляет компоненты разобранного пути.

```go
type PathSegment = internal.PathSegment
```

::: warning Псевдоним внутренней реализации
`PathSegment` — псевдоним типа `internal.PathSegment`. Его конкретные поля, типы полей (PathSegmentType, PathSegmentFlags) и методы принадлежат пакету `internal` и **не экспортируются как публичный API**; они могут меняться между версиями — не полагайтесь на внутреннюю структуру в бизнес-коде напрямую.

- При реализации пользовательского синтаксиса путей возвращайте `[]PathSegment` из метода `ParsePath` интерфейса [`PathParser`](./interfaces#pathparser).
- Для предкомпиляции путей используйте [`Processor.CompilePath`](./processor/query#compilepath), возвращающий `*CompiledPath`.
:::

## Уровни режима безопасности

```go
type PatternLevel int

const (
	// PatternLevelCritical — критический риск, всегда блокирует операцию
	PatternLevelCritical PatternLevel = iota

	// PatternLevelWarning — уровень предупреждения, блокируется в строгом режиме
	PatternLevelWarning

	// PatternLevelInfo — информационный уровень, только запись в лог
	PatternLevelInfo
)
```

### Структура DangerousPattern

```go
type DangerousPattern struct {
	Pattern string       // Искомая подстрока
	Name    string       // Человекочитаемое описание риска безопасности
	Level   PatternLevel // Уровень обработки
}
```

## Лучшие практики обработки ошибок

### Проверка типа через errors.Is

```go
result, err := json.Get(data, path)
if errors.Is(err, json.ErrPathNotFound) {
	return defaultValue
}
if errors.Is(err, json.ErrTypeMismatch) {
	return defaultValue
}
```

### Получение деталей через errors.As

```go
var jsonErr *json.JsonsError
if errors.As(err, &jsonErr) {
	log.Printf("Операция %s завершилась ошибкой на пути %s: %s",
		jsonErr.Op, jsonErr.Path, jsonErr.Message)
}
```

### Обёртывание ошибок

```go
val := json.GetString(data, path)
if val == "" {
	return fmt.Errorf("получение конфигурации %s вернуло пустое значение", path)
}
```

## См. также

- [Обработка ошибок](../advanced/error-handling) - расширенное руководство по обработке ошибок
- [Config](./config) - параметры конфигурации
- [Обзор безопасности](../security/) - лучшие практики безопасности
