---
sidebar_label: "Контрольный список для продакшена"
title: "Чек-лист продакшена - CyberGo JSON | безопасность"
description: "Чек-лист продакшена CyberGo JSON: SecurityConfig, лимиты MaxNestingDepthSecurity и MaxJSONSize, валидация ввода, мониторинг и баланс производительности."
sidebar_position: 3
---

# Контрольный список для продакшена

Перед развёртыванием в продакшен убедитесь, что выполнены следующие пункты безопасности.

## Проверка конфигурации

### Ограничения ресурсов

- [ ] Установить `MaxNestingDepthSecurity` для предотвращения атак глубокой вложенности
- [ ] Установить `MaxJSONSize` для ограничения размера одного значения
- [ ] Установить `MaxMemory` для ограничения общего использования памяти

```go
cfg := json.DefaultConfig()
cfg.MaxNestingDepthSecurity = 50
cfg.MaxJSONSize = 10 * 1024 * 1024
cfg.MaxMemory = 100 * 1024 * 1024
```

Сопоставление значений по умолчанию и рекомендуемых продакшен-значений (значения по умолчанию — константы библиотеки, на них можно ссылаться напрямую, чтобы избежать магических чисел):

| Лимит | Поле Config | Константа в библиотеке | По умолчанию | Рекомендуемое продакшен-значение (пресет `SecurityConfig()`) |
|--------|-------------|----------|--------|----------------------------------------|
| Лимит размера JSON | `MaxJSONSize` | `DefaultMaxJSONSize` | 100MB | 10MB |
| Лимит глубины вложенности | `MaxNestingDepthSecurity` | `DefaultMaxNestingDepth` | 200 | 30 |
| Лимит глубины пути | `MaxPathDepth` | `DefaultMaxPathDepth` | 50 | 30 |
| Лимит числа ключей объекта | `MaxObjectKeys` | `DefaultMaxObjectKeys` | 100000 | 5000 |
| Лимит числа элементов массива | `MaxArrayElements` | `DefaultMaxArrayElements` | 100000 | 5000 |
| Порог безопасности | `MaxSecurityValidationSize` | `DefaultMaxSecuritySize` | 10MB | 10MB |
| Лимит конкурентности | `MaxConcurrency` | `DefaultMaxConcurrency` | 50 | 50 |

```go
// Ссылка на константу вместо хардкода
cfg := json.DefaultConfig()
cfg.MaxJSONSize = int64(json.DefaultMaxJSONSize) / 10 // ужесточение от базовых 100MB
```

`json.SecurityConfig()` уже преднастроил все поля таблицы под «рекомендуемые продакшен-значения» и дополнительно включает `FullSecurityScan` и `StrictMode` — для недоверенного ввода отталкивайтесь от него и донастраивайте.

## Валидация входных данных

### Обязательные поля

- [ ] Проверить наличие всех обязательных полей
- [ ] Проверить правильность типов полей

```go
// Пример пользовательского валидатора
type RequiredFieldValidator struct{}

func (v *RequiredFieldValidator) Validate(jsonStr string) error {
    // Проверка наличия обязательных полей
    return nil
}

cfg := json.DefaultConfig()
cfg.CustomValidators = []json.Validator{&RequiredFieldValidator{}}
```

### Валидация формата

- [ ] Проверить формат email
- [ ] Проверить формат URL
- [ ] Проверить пользовательские форматы

```go
// Пользовательский валидатор формата
type EmailValidator struct{}

func (v *EmailValidator) Validate(jsonStr string) error {
    var data map[string]any
    if err := json.Unmarshal([]byte(jsonStr), &data); err != nil {
        return nil
    }
    email, _ := data["email"].(string)
    matched, _ := regexp.MatchString(`^\w+@\w+\.\w+$`, email)
    if !matched {
        return errors.New("invalid email format")
    }
    return nil
}

cfg := json.DefaultConfig()
cfg.CustomValidators = append(cfg.CustomValidators, &EmailValidator{})
```

### Валидация диапазона

- [ ] Проверить диапазон числовых значений
- [ ] Проверить длину строк
- [ ] Проверить длину массивов

```go
// Использование Schema для валидации диапазона
schema := &json.Schema{
	Type: "object",
	Properties: map[string]*json.Schema{
		"age":  {Type: "number", Minimum: 0, Maximum: 100},
		"name": {Type: "string", MinLength: 1, MaxLength: 255},
	},
}
```

## Обработка конфиденциальных данных

### Фильтрация конфиденциальных полей

- [ ] Фильтровать поля паролей
- [ ] Фильтровать поля токенов
- [ ] Фильтровать другие конфиденциальные данные

```go
// Использование Hook для фильтрации конфиденциальных полей
type SensitiveFilterHook struct {
    fields map[string]bool
}

func (h *SensitiveFilterHook) Before(ctx json.HookContext) error {
    return nil
}

func (h *SensitiveFilterHook) After(ctx json.HookContext, result any, err error) (any, error) {
    if m, ok := result.(map[string]any); ok {
        for field := range h.fields {
            delete(m, field)
        }
    }
    return result, err
}

cfg := json.DefaultConfig()
cfg.AddHook(&SensitiveFilterHook{fields: map[string]bool{
    "password": true,
    "token":    true,
    "api_key":  true,
    "secret":   true,
}})
```

Полный работоспособный код (автоматическое срезание конфиденциальных полей до возврата `Get`):

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

// SensitiveFilterHook удаляет конфиденциальные поля из результата get до возврата вызывающему.
type SensitiveFilterHook struct {
	fields map[string]bool
}

func (h *SensitiveFilterHook) Before(ctx json.HookContext) error {
	return nil
}

func (h *SensitiveFilterHook) After(ctx json.HookContext, result any, err error) (any, error) {
	if err != nil {
		return result, err
	}
	if obj, ok := result.(map[string]any); ok {
		for field := range h.fields {
			delete(obj, field)
		}
	}
	return result, err
}

func main() {
	cfg := json.DefaultConfig()
	cfg.AddHook(&SensitiveFilterHook{fields: map[string]bool{
		"password": true,
		"token":    true,
		"api_key":  true,
		"secret":   true,
	}})

	p, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer p.Close()

	user, err := p.Get(`{"name": "Alice", "role": "admin", "password": "hunter2", "token": "t-123"}`, ".")
	if err != nil {
		panic(err)
	}

	out, err := p.Marshal(user)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(out))
	// Вывод: {"name":"Alice","role":"admin"}
}
```

### Обезличивание журналов

- [ ] Не записывать конфиденциальные данные в журналы
- [ ] Сообщения об ошибках не должны содержать конфиденциальную информацию

## Обработка ошибок

### Безопасные ответы об ошибках

- [ ] Не раскрывать внутренние детали ошибок
- [ ] Использовать общие сообщения об ошибках
- [ ] Записывать подробности ошибок в журнал

```go
if err != nil {
	slog.Error("Подробная ошибка", "error", err)               // подробная причина — только в журнал
	return errors.New("Операция не удалась, попробуйте позже") // наружу — только общее сообщение
}
```

## Мониторинг и аудит

### Мониторинг производительности

- [ ] Отслеживать время парсинга
- [ ] Отслеживать использование памяти
- [ ] Установить пороги оповещений

```go
// Использование Hook для мониторинга производительности
type MetricsHook struct{}

func (h *MetricsHook) Before(ctx json.HookContext) error {
    return nil
}

func (h *MetricsHook) After(ctx json.HookContext, result any, err error) (any, error) {
    slog.Info("operation", "op", ctx.Operation, "duration", time.Since(ctx.StartTime))
    return result, err
}

cfg := json.DefaultConfig()
cfg.AddHook(&MetricsHook{})
```

Для сценариев замеров удобнее фабричный хук: `cfg.AddHook(json.TimingHook(myRecorder))` (`myRecorder` реализует `Record(op string, duration time.Duration)`).

### Аудиторский журнал

- [ ] Записывать ключевые операции
- [ ] Записывать аномальный ввод
- [ ] Регулярно проверять журналы

Полный работоспособный код (аудит операций записи + замеры операций, всё через фабричные хуки и `HookFunc`, без записи какого-либо исходного `JSONStr`):

```go
package main

import (
	"fmt"
	"sync"
	"time"

	"github.com/cybergodev/json"
)

// opMetrics реализует интерфейс Record, требуемый TimingHook
type opMetrics struct {
	mu    sync.Mutex
	count map[string]int
}

func (m *opMetrics) Record(op string, duration time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.count[op]++
}

func main() {
	metrics := &opMetrics{count: make(map[string]int)}
	var auditLog []string

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// Аудит: записываем только тип операции/путь/результат операций записи, без содержимого JSONStr
	p.AddHook(&json.HookFunc{
		AfterFn: func(ctx json.HookContext, result any, err error) (any, error) {
			if ctx.Operation == "set" || ctx.Operation == "delete" {
				auditLog = append(auditLog,
					fmt.Sprintf("op=%s path=%s ok=%v", ctx.Operation, ctx.Path, err == nil))
			}
			return result, err
		},
	})
	// Производительность: подсчёт по типам операций (в продакшене замените на гистограммы/TSDB)
	p.AddHook(json.TimingHook(metrics))

	data := `{"env": "prod", "password": "hunter2"}`

	if data, err = p.Set(data, "password", nil); err != nil {
		panic(err)
	}
	if data, err = p.Delete(data, "password"); err != nil {
		panic(err)
	}
	if _, err = p.Get(data, "env"); err != nil {
		panic(err)
	}

	for _, e := range auditLog {
		fmt.Println(e)
	}
	fmt.Println("Записей замеров get:", metrics.count["get"])
	// Вывод:
	// op=set path=password ok=true
	// op=delete path=password ok=true
	// Записей замеров get: 1
}
```

## Покрытие тестами

### Тесты безопасности

- [ ] Тесты глубокой вложенности
- [ ] Тесты обработки больших файлов
- [ ] Тесты некорректного ввода
- [ ] Тесты граничных условий

### Тесты производительности

- [ ] Тесты параллельной обработки
- [ ] Тесты больших объёмов данных
- [ ] Тесты на утечки памяти

## Команды быстрой проверки

```bash
# Проверка конфиденциальных полей
grep -r "password\|token\|secret" --include="*.go"

# Проверка захардкоженной конфигурации
grep -r "MaxNestingDepthSecurity\|MaxMemory" --include="*.go"

# Запуск тестов безопасности
go test -run Security ./...
```

## Шаблон контрольного списка

```go
// Шаблон конфигурации для продакшена
func ProductionConfig() json.Config {
	cfg := json.SecurityConfig()

	// Ограничения ресурсов (SecurityConfig уже задаёт безопасные значения по умолчанию)
	cfg.MaxMemory = 100 * 1024 * 1024

	// Пользовательские валидаторы
	cfg.CustomValidators = []json.Validator{&RequiredFieldValidator{}}

	// Аудиторский Hook
	cfg.Hooks = []json.Hook{&AuditHook{logger: prodLogger}}

	return cfg
}
```

## См. также

- [Обзор безопасности](./)
- [Конфигурация Config](../api-reference/config)
