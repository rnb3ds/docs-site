---
sidebar_label: "Обработка ошибок"
title: "Обработка ошибок - CyberGo JSON | Лучшие практики"
description: "Обработка ошибок CyberGo JSON: тип JsonsError, errors.Is/As, SafeError для вывода, RedactedPath для логов, поля Op/Path и повторные попытки."
sidebar_position: 2
---

# Обработка ошибок

Правильная обработка ошибок при операциях с JSON.

## Типы ошибок

### Стандартные ошибки

```go
var (
	ErrPathNotFound      = errors.New("path not found")
	ErrInvalidPath       = errors.New("invalid path format")
	ErrTypeMismatch      = errors.New("type mismatch")
	ErrInvalidJSON       = errors.New("invalid JSON format")
	ErrDepthLimit        = errors.New("depth limit exceeded")
	ErrSizeLimit         = errors.New("size limit exceeded")
	ErrSecurityViolation = errors.New("security violation detected")
	ErrProcessorClosed   = errors.New("processor is closed")
	ErrConcurrencyLimit  = errors.New("concurrency limit exceeded")
	ErrUnsupportedPath   = errors.New("unsupported path operation")
	ErrOperationTimeout  = errors.New("operation timeout")          // Deprecated
	ErrResourceExhausted = errors.New("system resources exhausted") // Deprecated
)
```

### Таблица классификации сентинельных ошибок

12 экспортируемых сентинельных ошибок по **способу обработки** делятся на четыре категории:

| Ошибка | Значение / типичный триггер | Категория | Рекомендация |
|------|-----------------|------|----------|
| `ErrInvalidJSON` | Ввод не является корректным JSON (синтаксическая ошибка, некорректный UTF-8) | Пользовательский ввод | Вернуть дружественное сообщение, попросить исправить данные |
| `ErrPathNotFound` | Путь не существует (отсутствует вложенный ключ, индекс массива вне диапазона) | Пользовательский ввод | Откатиться к значению по умолчанию или обработать по бизнес-семантике |
| `ErrTypeMismatch` | Значение по пути не соответствует ожидаемому типу | Пользовательский ввод | Сообщить об ошибке типа поля |
| `ErrInvalidPath` | Некорректный синтаксис пути (например, `a..b`) | Пользовательский ввод | Сообщить об ошибке формата пути |
| `ErrUnsupportedPath` | Операция пути не поддерживается | Пользовательский ввод | Проверить комбинацию пути и операции |
| `ErrSizeLimit` | Ввод превышает `Config.MaxJSONSize` | Ограничение безопасности | Отклонить и обработать по стратегии лимитирования |
| `ErrDepthLimit` | Глубина вложенности превышает `MaxNestingDepthSecurity` | Ограничение безопасности | Отклонить (глубокая вложенность часто встречается в злоумышленном вводе) |
| `ErrSecurityViolation` | Обнаружен опасный шаблон (прототипное загрязнение и т.п.) | Ограничение безопасности | Записать в журнал и отклонить, не раскрывая детали |
| `ErrConcurrencyLimit` | Число операций в полёте достигло `MaxConcurrency` (мягкий предел, немедленный отказ без блокировки) | Системная временная | **Можно повторить** — повторить позже или поднять предел |
| `ErrProcessorClosed` | Вызов после Close процессора | Состояние системы | Пересоздать `Processor` или проверить жизненный цикл |
| `ErrOperationTimeout` | — (сохранён для совместимости) | Устарело | Сейчас не возвращается ни одной операцией, не ветвитесь по нему |
| `ErrResourceExhausted` | — (сохранён для совместимости) | Устарело | Сейчас не возвращается ни одной операцией, не ветвитесь по нему |

### Проверка ошибок

```go
val, err := json.Get(data, "user.name")
if err != nil {
	if errors.Is(err, json.ErrPathNotFound) {
		// Путь не существует
		return defaultName
	}
	if errors.Is(err, json.ErrTypeMismatch) {
		// Несовпадение типа
		return "", fmt.Errorf("ошибка типа поля: %w", err)
	}
	return "", err
}
```

## JsonsError

### Структура

`JsonsError` — основной тип ошибок библиотеки, содержащий контекстную информацию об операции:

```go
type JsonsError struct {
	Op      string `json:"op"`      // Тип операции: "get", "set", "delete", "marshal" и др.
	Path    string `json:"path"`    // Путь JSON (если есть)
	Message string `json:"message"` // Понятное сообщение об ошибке
	Err     error  `json:"err"`     // Базовая ошибка
}

func (e *JsonsError) Error() string
func (e *JsonsError) Unwrap() error
func (e *JsonsError) Is(target error) bool
```

### Использование

```go
val, err := json.Get(data, "user.name")
if err != nil {
	// Использование errors.Is для проверки типа ошибки
	if errors.Is(err, json.ErrPathNotFound) {
		// Путь не существует
	}
	if errors.Is(err, json.ErrTypeMismatch) {
		// Несовпадение типа
	}

	// Использование errors.As для получения подробного контекста
	var jsonErr *json.JsonsError
	if errors.As(err, &jsonErr) {
		fmt.Printf("Операция: %s\n", jsonErr.Op)
		fmt.Printf("Путь: %s\n", jsonErr.Path)
		fmt.Printf("Сообщение: %s\n", jsonErr.Message)
	}
}
```

### Локализация точки сбоя через Op / Path

Комбинация `Op` (сбойная операция) и `Path` (сбойный путь) точно локализует проблему без разбора строки ошибки:

```go
package main

import (
	"errors"
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"user":{"name":"Alice"},"perms":["read"]}`

	// Два типичных сбоя: путь не существует / некорректный JSON
	for _, tc := range []struct {
		jsonStr, path string
	}{
		{data, "user.email"},  // путь не существует
		{`{"broken"`, "user"}, // некорректный JSON
	} {
		_, err := json.Get(tc.jsonStr, tc.path)
		var jsonErr *json.JsonsError
		if errors.As(err, &jsonErr) {
			fmt.Printf("op=%s path=%q причина=%v\n", jsonErr.Op, jsonErr.Path, json.SafeError(err))
		}
	}
}

// Вывод:
// op=get path="user.email" причина=path not found
// op=parse path="" причина=invalid JSON format
```

:::tip Подсказка Метод локализации
`Op` отвечает на вопрос «какая операция не удалась» (`get`/`set`/`delete`/`get_multiple`/`warmup_cache`; сбой парсинга единообразно записывается как `parse`), `Path` — «на каком пути». Вывод этих двух полей в журнал (вместо всей строки `Error()`) и локализует проблему, и не записывает чувствительные ключи из пути в журнал — при необходимости вывести путь применяйте маскирование [`RedactedPath`](#redactedpath-маскирование-путей-в-журнале).
:::

## Шаблоны обработки ошибок

### Предоставление значений по умолчанию

```go
// Типобезопасные функции получения имеют встроенную поддержку значений по умолчанию
name := json.GetString(data, "user.name", "Аноним")
age := json.GetInt(data, "user.age", 0)
active := json.GetBool(data, "user.active", false)
```

### Сбор нескольких ошибок

```go
type MultiError struct {
    Errors []error
}

func (e *MultiError) Add(err error) {
    e.Errors = append(e.Errors, err)
}

func (e *MultiError) HasError() bool {
    return len(e.Errors) > 0
}

func (e *MultiError) Error() string {
    msgs := make([]string, len(e.Errors))
    for i, err := range e.Errors {
        msgs[i] = err.Error()
    }
    return strings.Join(msgs, "; ")
}

// Использование
var multiErr MultiError
for _, path := range requiredPaths {
    if _, err := json.Get(data, path); err != nil {
        multiErr.Add(fmt.Errorf("%s: %w", path, err))
    }
}
if multiErr.HasError() {
    return multiErr.Error()
}
```

### Обёртывание ошибок

```go
val, err := json.Get(data, "config.api_key")
if err != nil {
	return fmt.Errorf("ошибка чтения API-ключа: %w", err)
}
```

## Пользовательские ошибки

### Бизнес-ошибки

```go
type ValidationError struct {
	Field   string
	Message string
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("ошибка валидации %s: %s", e.Field, e.Message)
}

// Использование
func validateUser(data string) error {
	name := json.GetString(data, "name")
	if name == "" {
		return &ValidationError{Field: "name", Message: "обязательное поле"}
	}
	if len(name) < 2 {
		return &ValidationError{Field: "name", Message: "минимум 2 символа"}
	}
	return nil
}
```

## Ведение журнала

### Структурированный журнал

```go
val, err := json.Get(data, path)
if err != nil {
	log.Error("Ошибка JSON-операции",
		"path", path,
		"error", err,
		"error_type", fmt.Sprintf("%T", err),
	)
	return err
}
```

### Аудиторский журнал

```go
func auditLog(op string, path string, err error) {
	if err != nil {
		log.Warn("Операция не удалась",
			"operation", op,
			"path", path,
			"error", err,
		)
	} else {
		log.Info("Операция успешна",
			"operation", op,
			"path", path,
		)
	}
}
```

## Стратегии восстановления

### SafeError — безопасный вывод

`SafeError` возвращает безопасное для клиента сообщение об ошибке, удаляя внутренний контекст (операцию, путь, структурные детали), — подходит для HTTP/API-ответов (CWE-209):

```go
// Сигнатура: func SafeError(err error) string

val, err := json.Get(untrustedInput, "data")
if err != nil {
	// Полный Error() содержит "JSON get failed at path '...': ..." — не отправляйте его наружу напрямую
	// SafeError возвращает только сообщение базовой сентинельной ошибки, например "path not found"
	safeMsg := json.SafeError(err)
	_ = safeMsg // http.Error(w, safeMsg, http.StatusBadRequest)
	_ = val
	return
}
```

### RedactedPath — маскирование путей в журнале

Сам путь может содержать чувствительные ключи (`user.password`, `token` и т.п.). Перед записью в журнал маскируйте его через `RedactedPath` — непустой путь целиком заменяется на `***`, не раскрывая ни одного фрагмента:

```go
// Сигнатура: func RedactedPath(path string) string

var jsonErr *json.JsonsError
if errors.As(err, &jsonErr) {
	// В журнал пишется только замаскированный путь — чувствительные ключи не попадают в систему журналирования
	log.Warn("Ошибка JSON-операции",
		"op", jsonErr.Op,
		"path", json.RedactedPath(jsonErr.Path), // ***
	)
}
```

### Повторные попытки

```go
func withRetry(fn func() error, maxRetries int) error {
    var err error
    for i := 0; i < maxRetries; i++ {
        if err = fn(); err == nil {
            return nil
        }
        time.Sleep(time.Second * time.Duration(i+1))
    }
    return err
}

// Использование
err := withRetry(func() error {
    return processData(data)
}, 3)
```

### Деградация

```go
func getConfig(data string) Config {
	cfg := json.DefaultConfig()

	// Использование типобезопасной функции получения со встроенным значением по умолчанию
	cfg.StrictMode = json.GetBool(data, "config.strict", true)

	return cfg
}
```

## Классификация ошибок

### Ошибки пользовательского ввода

Вызваны JSON-данными или путём, предоставленными пользователем:

```go
val, err := json.Get(data, "user.name")
if err != nil {
	switch {
	case errors.Is(err, json.ErrInvalidJSON):
		// Ошибка формата JSON
		return fmt.Errorf("ошибка формата данных: %w", err)
	case errors.Is(err, json.ErrPathNotFound):
		// Путь не существует
		return fmt.Errorf("поле не существует: %w", err)
	case errors.Is(err, json.ErrTypeMismatch):
		// Несовпадение типа
		return fmt.Errorf("ошибка типа: %w", err)
	case errors.Is(err, json.ErrInvalidPath):
		// Ошибка синтаксиса пути
		return fmt.Errorf("ошибка синтаксиса пути: %w", err)
	case errors.Is(err, json.ErrUnsupportedPath):
		// Неподдерживаемая операция пути
		return fmt.Errorf("неподдерживаемая операция: %w", err)
	}
}
```

### Ошибки безопасности

Обнаружена потенциальная угроза безопасности:

```go
val, err := json.Get(untrustedInput, "data")
if err != nil {
	if errors.Is(err, json.ErrSecurityViolation) {
		// Нарушение безопасности, записать и отклонить
		log.Warn("Нарушение безопасности", "error", err)
		return errors.New("недопустимый ввод")
	}
	if errors.Is(err, json.ErrSizeLimit) {
		return fmt.Errorf("данные превышают ограничение размера: %w", err)
	}
	if errors.Is(err, json.ErrDepthLimit) {
		return fmt.Errorf("превышен предел вложенности: %w", err)
	}
	return err
}
```

### Системные ошибки

Системные временные ошибки:

```go
val, err := json.Get(data, "user.name")
if err != nil {
	if errors.Is(err, json.ErrOperationTimeout) {
		// Тайм-аут операции, можно повторить <Badge type="danger" text="Устарело" />
		return fmt.Errorf("временная ошибка, повторите попытку: %w", err)
	}
	if errors.Is(err, json.ErrConcurrencyLimit) {
		// Ограничение конкурентности (возвращается при достижении MaxConcurrency, можно повторить)
		return fmt.Errorf("система занята, попробуйте позже: %w", err)
	}
	if errors.Is(err, json.ErrResourceExhausted) {
		// Исчерпание ресурсов <Badge type="danger" text="Устарело" />
		return fmt.Errorf("недостаточно системных ресурсов: %w", err)
	}
	if errors.Is(err, json.ErrProcessorClosed) {
		// Процессор закрыт
		return fmt.Errorf("процессор недоступен: %w", err)
	}
	return err
}
```

## Лучшие практики обработки ошибок

### 1. Различение типов ошибок

```go
func processJSON(data string) error {
	val, err := json.Get(data, "user.name")
	if err != nil {
		// Использование errors.Is для различения типов ошибок
		switch {
		case errors.Is(err, json.ErrInvalidJSON),
			errors.Is(err, json.ErrPathNotFound),
			errors.Is(err, json.ErrTypeMismatch),
			errors.Is(err, json.ErrInvalidPath):
			// Ошибка пользовательского ввода, вернуть дружественное сообщение
			return fmt.Errorf("ошибка формата данных: %w", err)
		case errors.Is(err, json.ErrSecurityViolation):
			// Ошибка безопасности, записать и отклонить
			log.Warn("Нарушение безопасности", "error", err)
			return errors.New("недопустимый ввод")
		case errors.Is(err, json.ErrConcurrencyLimit):
			// Превышен предел конкурентности, можно повторить позже
			return fmt.Errorf("система занята, повторите попытку позже: %w", err)
		case errors.Is(err, json.ErrOperationTimeout): // Deprecated (в настоящее время не возвращается, сохранён для совместимости)
			return fmt.Errorf("временная ошибка, повторите попытку: %w", err)
		default:
			// Системная ошибка
			log.Error("Системная ошибка", "error", err)
			return errors.New("внутренняя ошибка")
		}
	}
	return nil
}
```

### 2. Использование errors.As для получения контекста

```go
func handleWithDetail(data string, path string) error {
	val, err := json.Get(data, path)
	if err != nil {
		var jsonErr *json.JsonsError
		if errors.As(err, &jsonErr) {
			return fmt.Errorf("операция %s не удалась (путь: %s): %w",
				jsonErr.Op, jsonErr.Path, jsonErr.Err)
		}
		return fmt.Errorf("операция не удалась: %w", err)
	}
	return nil
}
```

### 3. Отслеживание цепочки ошибок

```go
func deepProcess(data string) error {
	if err := processLevel1(data); err != nil {
		return fmt.Errorf("ошибка глубокой обработки: %w", err)
	}
	return nil
}

func processLevel1(data string) error {
	if err := processLevel2(data); err != nil {
		return fmt.Errorf("ошибка обработки уровня 1 (путь data.field): %w", err)
	}
	return nil
}

func processLevel2(data string) error {
	_, err := json.Get(data, "data.field")
	return err
}

// Пример цепочки ошибок (JsonsError несёт Op/Path, %w в fmt.Errorf послойно сохраняет базовую причину):
// ошибка глубокой обработки: ошибка обработки уровня 1 (путь data.field): JSON get failed at path 'data.field': ... (caused by: path not found)
```

## См. также

- [Константы и ошибки](../api-reference/constants)
- [Обзор безопасности](../security/)
- [Оптимизация производительности](./performance)
