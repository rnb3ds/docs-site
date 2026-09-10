---
sidebar_label: "Система хуков"
title: "Hook перехватчики - CyberGo JSON | Справочник API"
description: "Система хуков CyberGo JSON: интерфейс Hook, LoggingHook, TimingHook, ValidationHook, ErrorHook и пользовательские хуки с HookContext до и после JSON-операций."
sidebar_position: 1
---

# Система перехватчиков Hook

Hook позволяет вставлять пользовательскую логику до и после JSON-операций, реализуя логирование, мониторинг производительности, валидацию и другие функции.

::: tip Справка по сигнатурам интерфейсов
Полные сигнатуры типов интерфейса Hook (`Hook`, `HookContext`, `HookFunc`) см. в [Определениях интерфейсов](../api-reference/interfaces#интерфейс-перехватчика). Эта страница посвящена руководству по использованию и лучшим практикам.
:::

## Интерфейс Hook

```go
type Hook interface {
	Before(ctx HookContext) error
	After(ctx HookContext, result any, err error) (any, error)
}
```

### Описание методов

| Метод | Описание |
|------|------|
| `Before(ctx HookContext) error` | Вызывается перед операцией, возврат ошибки прерывает операцию |
| `After(ctx HookContext, result any, err error) (any, error)` | Вызывается после операции, может модифицировать результат или вернуть ошибку |

---

## Структура HookContext

HookContext предоставляет контекстную информацию об операции.

```go
type HookContext struct {
	Operation string    // Тип операции: "get", "set", "delete", "marshal", "unmarshal"
	JSONStr   string    // Входная JSON-строка (при marshal может быть пустой). Предупреждение безопасности: может содержать конфиденциальные данные
	Path      string    // Целевой путь (при marshal/unmarshal может быть пустым)
	Value     any       // Значение операции set
	Config    *Config   // Активная конфигурация
	StartTime time.Time // Время начала операции
}
```

### Описание полей

| Поле | Тип | Описание |
|------|------|------|
| `Operation` | `string` | Тип операции, допустимые значения описаны ниже |
| `JSONStr` | `string` | Входная JSON-строка (**предупреждение безопасности: может содержать конфиденциальные данные**) |
| `Path` | `string` | Целевое выражение пути |
| `Value` | `any` | Значение операции set |
| `Config` | `*Config` | Текущая конфигурация |
| `StartTime` | `time.Time` | Время начала операции (устанавливается до срабатывания `After`, можно использовать для расчёта длительности) |

::: warning Текущие точки срабатывания
Хуки в настоящее время срабатывают на операциях **`Get` / `Set` / `Delete`** (включая пакетные обёртки `json.Get`/`json.Set`/`json.Delete` — внутри они идут тем же путём Processor). Пути **`Encode`/`Marshal`/`Unmarshal` хуков пока не активируют** — значения `marshal`/`unmarshal` для `Operation` зарезервированы, не полагайтесь на них.
:::

::: tip Не логируйте JSONStr
`JSONStr` может содержать пароли, токены, PII. В журналах используйте только `Operation` и `Path`; если содержимое действительно нужно проверить, сначала извлеките его по конкретному пути и проверяйте уже результат.
:::

---

## Адаптер HookFunc

HookFunc — это структурный адаптер, позволяющий использовать функции в качестве Hook. Подходит для сценариев, когда нужен только Before или After.

```go
type HookFunc struct {
	BeforeFn func(ctx HookContext) error
	AfterFn  func(ctx HookContext, result any, err error) (any, error)
}
```

### Пример

```go
// Требуется только After
p.AddHook(&json.HookFunc{
	AfterFn: func(ctx json.HookContext, result any, err error) (any, error) {
		log.Printf("%s completed in %v", ctx.Operation, time.Since(ctx.StartTime))
		return result, err
	},
})

// Требуется только Before
p.AddHook(&json.HookFunc{
	BeforeFn: func(ctx json.HookContext) error {
		log.Printf("starting %s on path %s", ctx.Operation, ctx.Path)
		return nil
	},
})
```

### Как выбрать между Hook и HookFunc

| Аспект | Пользовательский тип, реализующий `Hook` | Адаптер `HookFunc` |
|------|------|------|
| Хранение состояния | Поля структуры (logger, счётчики, буферы) | Захват через замыкание |
| Перехват только одной стороны | Всё равно нужно реализовать оба метода (вторая сторона возвращает исходные значения) | Заполняется только `BeforeFn` или `AfterFn` |
| Повторное использование и тестирование | Отдельный тип — удобен для юнит-тестов и нескольких экземпляров | Определяется на месте, подходит для одноразовой логики |
| Применимость | Сложные/состоятельные хуки (аудит, агрегация метрик) | Лёгкие хуки (метрики, простая проверка) |

Незаданные функции `HookFunc` — операции без действия: без `BeforeFn` фаза Before сразу пропускается, без `AfterFn` результат и ошибка возвращаются как есть.

---

## Фабричные функции Hook

### LoggingHook

Создаёт перехватчик логирования. Параметру достаточно реализовать `Info(msg string, args ...any)` — `*slog.Logger` удовлетворяет этому естественно, можно передать и любой собственный логирующий фасад.

```go
func LoggingHook(logger interface{ Info(msg string, args ...any) }) Hook
```

```go
p.AddHook(json.LoggingHook(slog.Default()))
```

Полный пример (пользовательский logger с минимальным интерфейсом; проверяется, что одна операция даёт две записи журнала — Before + After):

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

// CountingLogger достаточно реализовать метод Info, чтобы служить logger для LoggingHook
type CountingLogger struct{ calls int }

func (l *CountingLogger) Info(msg string, args ...any) {
	l.calls++
}

func main() {
	logger := &CountingLogger{}

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()
	p.AddHook(json.LoggingHook(logger))

	_, err = p.Get(`{"name": "Alice"}`, "name")
	if err != nil {
		panic(err)
	}

	fmt.Println("Вызовов журнала:", logger.calls)
	// Вывод: Вызовов журнала: 2  (по одному на Before и After)
}
```

### TimingHook

Создаёт перехватчик замеров времени, фиксирующий длительность операций. Параметру достаточно реализовать `Record(op string, duration time.Duration)` — удобно подключать собственную систему метрик.

```go
func TimingHook(recorder interface {
	Record(op string, duration time.Duration)
}) Hook
```

```go
p.AddHook(json.TimingHook(myMetricsRecorder))
```

Полный пример (агрегация числа вызовов по типу операции):

```go
package main

import (
	"fmt"
	"sync"
	"time"

	"github.com/cybergodev/json"
)

// MetricsRecorder реализует интерфейс Record и считает вызовы по типу операции
type MetricsRecorder struct {
	mu    sync.Mutex
	count map[string]int
}

func (m *MetricsRecorder) Record(op string, duration time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.count[op]++
}

func main() {
	recorder := &MetricsRecorder{count: make(map[string]int)}

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()
	p.AddHook(json.TimingHook(recorder))

	if _, err := p.Get(`{"a": 1}`, "a"); err != nil {
		panic(err)
	}
	if _, err := p.Set(`{"a": 1}`, "b", 2); err != nil {
		panic(err)
	}

	fmt.Println("Записей замера get:", recorder.count["get"])
	fmt.Println("Записей замера set:", recorder.count["set"])
	// Вывод:
	// Записей замера get: 1
	// Записей замера set: 1
}
```

### ValidationHook

Создаёт перехватчик валидации, проверяющий входные данные до операции. Функция валидации получает `(jsonStr, path)`; возвращённая ошибка **прерывает операцию** (само действие не выполняется).

```go
func ValidationHook(validator func(jsonStr, path string) error) Hook
```

```go
p.AddHook(json.ValidationHook(func(jsonStr, path string) error {
	if len(jsonStr) > 1_000_000 {
		return errors.New("JSON too large")
	}
	return nil
}))
```

Полный пример (блокировка доступа к конфиденциальным путям):

```go
package main

import (
	"errors"
	"fmt"
	"strings"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	p.AddHook(json.ValidationHook(func(jsonStr, path string) error {
		if strings.HasPrefix(path, "secret.") {
			return errors.New("доступ к конфиденциальному пути запрещён: " + path)
		}
		return nil
	}))

	_, err = p.Get(`{"name": "Alice", "secret": {"token": "t"}}`, "name")
	fmt.Println("Обычный путь отклонён:", err != nil)

	_, err = p.Get(`{"name": "Alice", "secret": {"token": "t"}}`, "secret.token")
	fmt.Println("Конфиденциальный путь отклонён:", err != nil)
	// Вывод:
	// Обычный путь отклонён: false
	// Конфиденциальный путь отклонён: true
}
```

### ErrorHook

`ErrorHook` реализован на основе фазы After адаптера `HookFunc` и перехватывает ошибки для обработки: handler вызывается, только когда операция **действительно завершилась ошибкой** (`err != nil`); при успехе вызов проходит насквозь. Ошибка, возвращённая handler'ом, **заменяет** исходную и передаётся наверх (можно после отправки отчёта вернуть ошибку как есть или преобразовать её в безопасную для внешнего мира); возврат `nil` поглощает ошибку данного вызова (вызывающий считает операцию успешной) — используйте только осознанно.

```go
func ErrorHook(handler func(ctx HookContext, err error) error) Hook
```

```go
p.AddHook(json.ErrorHook(func(ctx json.HookContext, err error) error {
	sentry.CaptureException(err)
	return err // Возвращается исходная или преобразованная ошибка
}))
```

Полный пример (добавление контекста операции к ошибке):

```go
package main

import (
	"fmt"
	"strings"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	p.AddHook(json.ErrorHook(func(ctx json.HookContext, err error) error {
		return fmt.Errorf("[audit] op=%s path=%s: %w", ctx.Operation, ctx.Path, err)
	}))

	_, err = p.Get(`{"name": "Alice"}`, "missing")
	fmt.Println("Произошла ошибка:", err != nil)
	fmt.Println("Контекст добавлен:", strings.HasPrefix(err.Error(), "[audit] op=get path=missing"))
	// Вывод:
	// Произошла ошибка: true
	// Контекст добавлен: true
}
```

---

## Реализация пользовательского Hook

### Полный пример

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"log/slog"
	"time"
)

// Перехватчик логирования
type LoggingHook struct {
	logger *slog.Logger
}

func (h *LoggingHook) Before(ctx json.HookContext) error {
	h.logger.Info("operation starting", "op", ctx.Operation, "path", ctx.Path)
	return nil
}

func (h *LoggingHook) After(ctx json.HookContext, result any, err error) (any, error) {
	h.logger.Info("operation completed",
		"op", ctx.Operation,
		"path", ctx.Path,
		"duration", time.Since(ctx.StartTime),
		"error", err)
	return result, err
}

func main() {
	cfg := json.DefaultConfig()
	p, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// Добавление пользовательского Hook
	p.AddHook(&LoggingHook{logger: slog.Default()})

	// Использование processor...
	val, err := p.Get(`{"name": "test"}`, "name")
	if err != nil {
		panic(err)
	}
	fmt.Println(val)
}
```

### Упрощение с помощью HookFunc

```go
// Нужно только записать время завершения
p.AddHook(&json.HookFunc{
	AfterFn: func(ctx json.HookContext, result any, err error) (any, error) {
		fmt.Printf("%s took %v\n", ctx.Operation, time.Since(ctx.StartTime))
		return result, err
	},
})
```

---

## Настройка Hook

### Через Config

```go
cfg := json.DefaultConfig()
cfg.Hooks = []json.Hook{
	json.LoggingHook(slog.Default()),
	json.TimingHook(myRecorder),
}
p, err := json.New(cfg)
if err != nil {
	panic(err)
}
```

### Через Processor

```go
p, err := json.New()
if err != nil {
	panic(err)
}
p.AddHook(json.LoggingHook(slog.Default()))
p.AddHook(json.TimingHook(myRecorder))
```

### Различия между двумя способами

| Аспект | `Config.Hooks` / `cfg.AddHook` | `Processor.AddHook` |
|------|------|------|
| Момент действия | Загружаются **один раз при конструировании** `json.New(cfg)` (с защитной копией) | Добавляются в любой момент работы |
| Изменение `Config` после создания | Не влияет на уже созданный Processor | —— |
| Потокобезопасность | Достаточно однопоточной настройки до конструирования | Параллельные вызовы защищены мьютексом |
| Жизненный цикл | Вместе с Processor | При `Close()` ссылки на хуки очищаются и освобождаются |

Для статической сборки (все хуки известны на старте) используйте `Config`; для включения/отключения на этапе выполнения (например, gradual rollout) — `Processor.AddHook`.

---

## Порядок выполнения

### Перехватчики Before

- Выполняются в **порядке добавления**
- Любой Hook, возвращающий ошибку, прерывает операцию

### Перехватчики After

- Выполняются в **обратном порядке добавления**
- Каждый Hook выполняется (даже если предыдущий вернул ошибку)

```go
// Порядок добавления: A, B, C
p.AddHook(hookA)
p.AddHook(hookB)
p.AddHook(hookC)

// Порядок выполнения:
// Before: A.Before → B.Before → C.Before
// After:  C.After → B.After → A.After
```

### Перезапись результата и устойчивость к панике

- `After` для `Get` может вернуть новый результат любого типа; результат `Set`/`Delete` — JSON-**строка**, и если `After` вернёт нестроковое значение, оно считается неизменённым (исходная строка сохраняется), ошибка при этом распространяется как обычно.
- **Паника хука не роняет операцию**: panic на фазе `Before` превращается в ошибку `hook panicked: ...` и прерывает текущую операцию; panic на фазе `After` записывается в структурированный журнал (slog) и пропускается, не влияя на результат операции.
- Processor без зарегистрированных хуков идёт по быстрому пути без блокировок — механизм хуков не добавляет накладных расходов.

---

## Лучшие практики

### 1. Логирование

```go
p.AddHook(json.LoggingHook(slog.Default()))
```

### 2. Мониторинг производительности

```go
type MetricsRecorder struct{}

func (m *MetricsRecorder) Record(op string, duration time.Duration) {
    metrics.Histogram("json_operation_duration", duration, "op", op)
}

p.AddHook(json.TimingHook(&MetricsRecorder{}))
```

### 3. Валидация входных данных

```go
p.AddHook(json.ValidationHook(func(jsonStr, path string) error {
	if len(jsonStr) > 10*1024*1024 { // 10MB
		return errors.New("JSON payload too large")
	}
	return nil
}))
```

### 4. Отслеживание ошибок

```go
p.AddHook(json.ErrorHook(func(ctx json.HookContext, err error) error {
	if err != nil {
		sentry.WithTags(map[string]string{
			"operation": ctx.Operation,
			"path":      ctx.Path,
		}).CaptureException(err)
	}
	return err
}))
```

### 5. Журнал аудита (полный практический пример)

Записывайте только тип операции, путь и результат операций записи (`set`/`delete`), не записывая само содержимое `JSONStr`:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

// AuditHook записывает записи аудита операций записи
// (для демонстрации — срез в памяти; в продакшене замените на slog/базу данных)
type AuditHook struct {
	entries []string
}

func (h *AuditHook) Before(ctx json.HookContext) error {
	return nil // аудит только наблюдает, не перехватывает
}

func (h *AuditHook) After(ctx json.HookContext, result any, err error) (any, error) {
	switch ctx.Operation {
	case "set", "delete":
		h.entries = append(h.entries,
			fmt.Sprintf("op=%s path=%s ok=%v", ctx.Operation, ctx.Path, err == nil))
	}
	return result, err
}

func main() {
	audit := &AuditHook{}

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()
	p.AddHook(audit)

	data := `{"env": "prod", "password": "hunter2", "token": "t-1"}`

	data, err = p.Set(data, "password", nil)
	if err != nil {
		panic(err)
	}
	data, err = p.Delete(data, "token")
	if err != nil {
		panic(err)
	}

	for _, e := range audit.entries {
		fmt.Println(e)
	}
	// Вывод:
	// op=set path=password ok=true
	// op=delete path=token ok=true
}
```

Советы для продакшена: замените `entries` на `*slog.Logger` (`slog.Info("data modification", "op", ..., "path", ..., "success", ...)`) или асинхронную запись в хранилище аудита; если нужна длительность, добавьте [`TimingHook`](#timinghook).

---

## См. также

- [Определения интерфейсов](../api-reference/interfaces) — расширяемые интерфейсы
- [Валидация Schema](../api-reference/schema) — проверка через ValidateSchema
- [Config](../api-reference/config) — параметры конфигурации
