---
sidebar_label: "Жизненный цикл"
title: "Жизненный цикл Processor - CyberGo JSON | Справочник API"
description: "Жизненный цикл CyberGo JSON Processor: New создание, Close идемпотентное освобождение, IsClosed, GetStats, GetHealthStatus и кэш ClearCache/WarmupCache."
sidebar_position: 11
---

# Жизненный цикл и статистика

Processor обеспечивает полное управление жизненным циклом, контроль кэша и мониторинг работоспособности.

## Жизненный цикл

### Close

Сигнатура: `func (p *Processor) Close() error`

Закрывает процессор и освобождает ресурсы (кэш, валидаторы безопасности, ссылки на хуки). После завершения работы с Processor следует вызвать этот метод.

```go
processor, _ := json.New(json.DefaultConfig())
defer processor.Close()
```

::: tip Семантика закрытия
- **Идемпотентно и потокобезопасно**: повторные вызовы `Close` срабатывают только один раз.
- **Сначала дренирование выполняемых операций**: `Close` дожидается завершения идущих операций (с верхним пределом ожидания); после тайм-аута процессор отклоняет новые операции (`IsClosed()` возвращает `true`), но ресурсы сохраняются в целости, чтобы идущие операции завершились без помех.
- После закрытия все операции возвращают `ErrProcessorClosed`.
- `Close` **не очищает** глобальные кэши, разделяемые между экземплярами (кэш типов путей, кэш кодировщиков структур); для полной очистки перед завершением процесса используйте [`ShutdownGlobalProcessor`](#управление-глобальным-процессором).
:::

### IsClosed

Сигнатура: `func (p *Processor) IsClosed() bool`

Проверяет, закрыт ли процессор. В состоянии «закрытие (дренирование)» также возвращает `true` — в этом окне новые операции уже отклоняются.

```go
if processor.IsClosed() {
	// Процессор закрыт, использовать больше нельзя
}
```

## Управление кэшем

### ClearCache

Сигнатура: `func (p *Processor) ClearCache()`

Очищает внутренний кэш процессора.

```go
processor.ClearCache()
```

Применимо для:
- Изменения источника данных
- Слишком высокого потребления памяти
- Необходимости принудительного обновления

### WarmupCache

Сигнатура: `func (p *Processor) WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)`

Прогревает кэш для повышения производительности последующих операций. Требует включённого кэша у процессора (по умолчанию включён), иначе возвращается ошибка. Полные примеры и описание полей `WarmupResult` см. в [Пакетных операциях](./batch#прогрев-кэша-warmupcache).

```go
paths := []string{"user.name", "user.email", "items[*].id"}
result, err := processor.WarmupCache(data, paths)
if err != nil {
	panic(err)
}
fmt.Printf("Успешно прогрето путей: %d\n", result.Successful)
```

## Статистика

### GetStats

Сигнатура: `func (p *Processor) GetStats() Stats`

Возвращает статистику процессора.

```go
stats := processor.GetStats()
fmt.Printf("Доля попаданий в кэш: %.2f%%\n", stats.HitRatio*100)
fmt.Printf("Размер кэша: %d\n", stats.CacheSize)
```

**Структура Stats**:

```go
type Stats struct {
	CacheSize        int64         `json:"cache_size"`        // Количество записей в кэше
	CacheMemory      int64         `json:"cache_memory"`      // Память кэша (байт)
	MaxCacheSize     int           `json:"max_cache_size"`    // Максимальный размер кэша
	HitCount         int64         `json:"hit_count"`         // Количество попаданий в кэш
	MissCount        int64         `json:"miss_count"`        // Количество промахов кэша
	HitRatio         float64       `json:"hit_ratio"`         // Доля попаданий в кэш
	CacheTTL         time.Duration `json:"cache_ttl"`         // TTL кэша
	CacheEnabled     bool          `json:"cache_enabled"`     // Включён ли кэш
	IsClosed         bool          `json:"is_closed"`         // Закрыт ли процессор
	MemoryEfficiency float64       `json:"memory_efficiency"` // Эффективность памяти
	OperationCount   int64         `json:"operation_count"`   // Общее количество операций
	ErrorCount       int64         `json:"error_count"`       // Общее количество ошибок
}
```

| Поле | Тип | Описание |
|------|------|------|
| `CacheSize` | `int64` | Текущее количество записей в кэше |
| `CacheMemory` | `int64` | Память кэша (байт) |
| `MaxCacheSize` | `int` | Предел размера кэша |
| `HitCount` | `int64` | Количество попаданий в кэш |
| `MissCount` | `int64` | Количество промахов кэша |
| `HitRatio` | `float64` | Доля попаданий в кэш (0-1) |
| `CacheTTL` | `time.Duration` | Время жизни кэша |
| `CacheEnabled` | `bool` | Включён ли кэш |
| `IsClosed` | `bool` | Закрыт ли процессор |
| `MemoryEfficiency` | `float64` | Эффективность памяти |
| `OperationCount` | `int64` | Общее количество операций |
| `ErrorCount` | `int64` | Общее количество ошибок |

**Интерпретация полей**:

- `OperationCount` / `ErrorCount`: накапливаются операциями чтения/записи (`Get` / `GetMultiple` / `Set` / `SetMultiple` / `Delete` и др.); отказы уровня жизненного цикла (процессор закрыт, превышен предел конкурентности) в число ошибок не входят.
- `HitRatio`: диапазон 0–1 (0.85 — это 85%); при `CacheEnabled=false` данных о попаданиях нет.
- `CacheSize` / `CacheMemory` — текущее состояние кэша, `MaxCacheSize` / `CacheTTL` — настраиваемые пределы (см. [Config](../config)).
- `IsClosed`: совпадает с [`IsClosed()`](#isclosed); в мониторинге позволяет обнаружить непреднамеренное закрытие процессора.

## Проверка здоровья

### GetHealthStatus

Сигнатура: `func (p *Processor) GetHealthStatus() HealthStatus`

Возвращает состояние здоровья процессора.

```go
status := processor.GetHealthStatus()
if status.Healthy {
	fmt.Println("Процессор здоров")
} else {
	for name, check := range status.Checks {
		if !check.Healthy {
			fmt.Printf("Проверка %s провалена: %s\n", name, check.Message)
		}
	}
}
```

**Структура HealthStatus** (общее состояние — в `HealthStatus`, результаты отдельных проверок — `CheckResult`):

```go
type HealthStatus struct {
	Timestamp time.Time              `json:"timestamp"` // Время проверки
	Healthy   bool                   `json:"healthy"`   // Общее состояние здоровья
	Checks    map[string]CheckResult `json:"checks"`    // Результаты отдельных проверок
}

type CheckResult struct {
	Healthy bool   `json:"healthy"` // Здоров ли элемент
	Message string `json:"message"` // Сообщение о состоянии
}
```

Поля `HealthStatus`:

| Поле | Тип | Описание |
|------|------|------|
| `Timestamp` | `time.Time` | Время проверки |
| `Healthy` | `bool` | Общее состояние здоровья |
| `Checks` | `map[string]CheckResult` | Детали отдельных проверок |

Поля `CheckResult`:

| Поле | Тип | Описание |
|------|------|------|
| `Healthy` | `bool` | Здоров ли этот пункт |
| `Message` | `string` | Сообщение о состоянии (причина сбоя и др.) |

::: tip Интерпретация
`Checks` — карта результатов отдельных проверок (сбор метрик и др.); если хотя бы один пункт нездоров, `Healthy=false`. Для nil-процессора или неинициализированного сборщика метрик сразу возвращается `Healthy=false` с причиной в `Checks` (например, `processor is nil`). Сборщик метрик создаётся только при `EnableMetrics=true` — без него `GetHealthStatus` возвращает `Healthy=false` с пометкой в `Checks` `Metrics collector not initialized`; поле `Config.EnableHealthCheck` зарезервировано и на это поведение не влияет (см. [Config](../config#переключатели-ввода-и-наблюдаемости)).
:::

## Хуки расширения

### AddHook

Сигнатура: `func (p *Processor) AddHook(hook Hook)`

Добавляет хук операций в процессор.

```go
processor.AddHook(&LoggingHook{})
processor.AddHook(json.TimingHook(&MetricsRecorder{}))
```

Хуки вызываются до и после каждой операции; применимы для:
- Ведения логов
- Мониторинга производительности
- Сбора метрик
- Аудиторского следа

### SetLogger

Сигнатура: `func (p *Processor) SetLogger(logger *slog.Logger)`

`SetLogger` атомарно заменяет структурный логгер процессора (автоматически добавляется поле `component=json-processor`); при передаче `nil` откат к `slog.Default()`. Используется для отладки и диагностики в рантайме.

```go
processor, _ := json.New()
defer processor.Close()

processor.SetLogger(slog.Default().With("component", "json-processor"))
```

### GetConfig

Сигнатура: `func (p *Processor) GetConfig() Config`

`GetConfig` возвращает глубокую копию текущей конфигурации процессора (внутри через `Config.Clone`); изменение возвращаемого значения на процессор не влияет; вызов на nil-процессоре возвращает нулевую Config.

```go
processor, _ := json.New()
defer processor.Close()

cfg := processor.GetConfig()
fmt.Printf("Кэш включён: %v\n", cfg.EnableCache)
fmt.Printf("Максимальный размер JSON: %d\n", cfg.MaxJSONSize)
```

## Управление глобальным процессором

Функции уровня пакета опираются на внутренний глобальный процессор; две управляющие функции уровня пакета также относятся к жизненному циклу (сигнатуры и полные примеры см. в [Обзоре Processor](./index#управление-глобальным-процессором)):

- `json.SetGlobalProcessor(p)` — делает пользовательский процессор глобальным: передача `nil` — no-op, старый глобальный процессор сначала закрывается, функция потокобезопасна.
- `json.ShutdownGlobalProcessor()` — закрывает и удаляет глобальный процессор, одновременно очищая разделяемые между экземплярами глобальные кэши и кэши сконфигурированных процессоров; подходит для вызова перед выходом долгоживущего сервиса.

## Рекомендации по использованию

### Управление ресурсами

```go
processor, _ := json.New()
defer processor.Close() // Гарантия освобождения ресурсов

// Использование processor...
```

### Оптимизация производительности

```go
// Прогрев часто используемых путей
processor.WarmupCache(data, []string{
	"user.name",
	"user.email",
	"items[*].id",
})

// Периодическая проверка статистики
stats := processor.GetStats()
if stats.HitRatio < 0.5 {
	// Доля попаданий низкая — подумайте о настройке кэша
}
```

### Интеграция мониторинга

```go
// Периодическая проверка здоровья
go func() {
	ticker := time.NewTicker(30 * time.Second)
	for range ticker.C {
		status := processor.GetHealthStatus()
		if !status.Healthy {
			log.Printf("Processor unhealthy: %+v", status.Checks)
		}
	}
}()
```

## См. также

- [Config](../config) - параметры конфигурации (размер кэша, TTL и др.)
- [Система хуков Hook](../../extensions/hooks) - подробное руководство по хукам
- [Определения интерфейсов](../interfaces) - интерфейс Hook
