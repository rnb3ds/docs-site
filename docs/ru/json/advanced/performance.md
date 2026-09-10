---
sidebar_label: "Оптимизация производительности"
title: "Оптимизация производительности - CyberGo JSON | Руководство"
description: "Оптимизация CyberGo JSON: кэш EnableCache/CacheTTL, ParallelThreshold для параллелизма, предразбор PreParse, прогрев WarmupCache и пути CompilePath."
sidebar_position: 1
---

# Оптимизация производительности

Стратегии и приёмы повышения производительности обработки JSON.

## Переиспользование процессора

### Переиспользование экземпляра Processor

```go
// ✅ Функции уровня пакета автоматически переиспользуют глобальный Processor
for _, item := range dataList {
	val := json.GetString(item, "name")
}

// ✅ Или явное переиспользование экземпляра (удобно для пользовательской конфигурации)
processor, err := json.New()
if err != nil {
	panic(err)
}
defer processor.Close()
for _, item := range dataList {
	val := processor.GetString(item, "name")
}
```

## Встроенные механизмы производительности

Знайте, какие оптимизации уже сделаны в библиотеке, чтобы не изобретать велосипед:

| Механизм | Эффект | Что требуется от вас |
|----------|--------|----------------------|
| Детектор быстрого пути | Доступ к одиночному ключу (например, `name`, путь только из букв/цифр/подчёркиваний) распознаётся по таблице поиска; при выключенном кэше значение берётся напрямую из корневого объекта, минуя рекурсивный обработчик | Ничего — действует автоматически; при включённом кэше (по умолчанию) такие обращения ускоряются кэшем парсинга/результатов |
| FastEncoder | Кодирование простых типов (map/slice/базовые значения) без рефлексии | Ничего — действует автоматически |
| Кэш результатов | Повторные запросы с тем же (JSON, путь) попадают в кэш | Включён по умолчанию; настраивайте `CacheTTL`/`MaxCacheSize` для контроля масштаба |
| Пул объектов | Переиспользование `IterableValue`, буферов кодирования, Config и др. — меньше нагрузки на GC | Возвращайте через `parsed.Release()` / `cp.Release()` |
| Кэш скомпилированных путей | Результаты разбора частых путей кэшируются глобально | Для горячих путей используйте [`CompilePath`](../api-reference/processor/query#compilepath) |

::: tip CacheSharedResults: переключатель нулевого копирования для сценариев «много чтения, мало записи»
При `Config.CacheSharedResults = true` попадания кэша в `Get` возвращают разделяемое значение напрямую, **минуя защитную глубокую копию** — распределение и CPU-накладные расходы при повторном чтении больших поддеревьев заметно падают. Контракт: **вызывающая сторона не должна изменять** возвращаемые `map[string]any`/`[]any` (примитивные значения безопасны всегда). По умолчанию выключено (копия при чтении); включайте явно под характер нагрузки.
:::

## Путь принятия решений по оптимизации

При проблемах с производительностью двигайтесь в фиксированном порядке; на каждом шаге **по результатам измерений** решается, переходить ли к следующему:

| Шаг | Средство | Сигнал применимости |
|------|------|----------|
| ① Сначала измерьте | Бенчмарки + анализ памяти (см. ниже), `GetStats()` для hit ratio кэша | Перед любой оптимизацией — нет данных, нет направления оптимизации |
| ② Переиспользование | Пакетные функции или разделяемый экземпляр `Processor` (переиспользуются кэш и пул объектов) | `json.New()` на каждый запрос, частое пересоздание процессора |
| ③ Предкомпиляция путей | [`CompilePath`](../api-reference/processor/query#compilepath) + `GetCompiled` | Запросы по **одному и тому же пути** к множеству разных JSON (разбор пути становится повторяющейся затратой) |
| ④ Предпарсинг | [`PreParse`](../api-reference/processor/query#preparse) + `GetFromParsed` | Последовательные запросы по нескольким путям к **одному и тому же JSON** (повторный парсинг становится горячей точкой) |
| ⑤ Параллелизм | `NewParallelIterator` / `StreamJSONLParallel` (см. [Параллельная обработка](./concurrency)) | CPU-интенсивная пакетная обработка; много строк с тяжёлой обработкой каждой |

::: tip Сначала измерьте, потом оптимизируйте
Конфигурация по умолчанию (кэш включён + пул объектов + быстрый путь) покрывает большинство сценариев. Сначала локализуйте горячие точки бенчмарками и подтвердите принадлежность узкого места, и только затем применяйте явные оптимизации ③④⑤ — каждая из них обменивает часть гибкости на скорость. Малые массивы (ниже `ParallelThreshold`, по умолчанию 10) при распараллеливании работают медленнее.
:::

## Оптимизация памяти

### Сокращение аллокаций

```go
// ✅ Используйте Marshal, возвращающий срез байтов
bytes, _ := json.Marshal(data)

// ✅ Используйте EncodeWithConfig, возвращающий строку (Encode устарел)
s, _ := json.EncodeWithConfig(data)
```

### Предварительное выделение буфера

```go
// Предвыделяйте при обработке больших объёмов данных
buf := make([]byte, 0, 1024*1024)
```

## Обработка файлов

### Структурная итерация для больших файлов

```go
// ❌ Загрузка целиком
data, _ := os.ReadFile("large.json")
parsed, _ := json.ParseAny(string(data))

// ✅ Структурная итерация (внимание: файл всё равно полностью загружается в память)
processor, err := json.New()
if err != nil {
	panic(err)
}
defer processor.Close()
processor.ForeachFile("large.json", func(key any, item *json.IterableValue) error {
	processItem(item)
	return nil
})
```

### Обработка NDJSON

```go
// Потоковая обработка через StreamLinesInto
file, _ := os.Open("data.jsonl")
defer file.Close()
entries, err := json.StreamLinesInto[LogEntry](file, func(lineNum int, entry LogEntry) error {
	// обработка каждой строки JSON
	return nil
})
```

## Параллельная обработка

### Предпочитайте встроенный ParallelIterator

Библиотека поставляется с параллельным итератором — не нужно вручную писать семафоры и пул горутин; разбивка на пакеты и поддержка отмены автоматические:

```go
items, _ := json.GetArray(data, "items")
it := json.NewParallelIterator(items)
defer it.Close()

// Параллельное отображение
doubled, err := it.Map(func(i int, v any) (any, error) {
	return processItem(v), nil
})

// Или параллельный обход / фильтрация (вариант WithContext реагирует на отмену)
_ = it.ForEach(func(i int, v any) error { return nil })
_ = it.ForEachWithContext(ctx, func(i int, v any) error { return nil })
filtered := it.Filter(func(i int, v any) bool { return v != nil })
```

### Когда нужен полный контроль: рукописный Worker Pool

```go
items := json.GetArray(data, "items")
jobs := make(chan any, len(items))

// Запуск фиксированного числа worker: горутины переиспользуются, без частого создания/уничтожения
var wg sync.WaitGroup
workers := runtime.NumCPU()
for w := 0; w < workers; w++ {
	wg.Add(1)
	go func() {
		defer wg.Done()
		for item := range jobs {
			processItem(item)
		}
	}()
}

// После раздачи задач закрываем канал, сообщая worker о завершении
for _, item := range items {
	jobs <- item
}
close(jobs)
wg.Wait()
```

::: tip Порог параллелизма
`Config.ParallelThreshold` (по умолчанию 10) задаёт нижний порог срабатывания внутренних параллельных путей библиотеки; число воркеров параллельной обработки JSONL управляется `Config.JSONLWorkers` (по умолчанию 4) или параметром `StreamJSONLParallel(reader, workers, ...)`. Подробнее см. [Параллельная обработка](./concurrency).
:::

## Оптимизация конфигурации

### Настройка конфигурации под сценарий

```go
// Малые объёмы данных: мягкая конфигурация
smallCfg := json.DefaultConfig()
smallCfg.MaxNestingDepthSecurity = 200 // максимально допустимое значение (диапазон проверки 10-200)

// Недоверенные данные: конфигурация безопасности
safeCfg := json.SecurityConfig()
safeCfg.MaxJSONSize = 1024 * 1024
```

### Отключение ненужных функций

```go
// Если Hook не нужен, не настраивайте его
cfg := json.DefaultConfig() // минимальная конфигурация
```

## Стратегии кэширования

### Кэширование результатов разбора

```go
var cache sync.Map

func getOrParse(key string, data []byte) (any, error) {
	if val, ok := cache.Load(key); ok {
		return val, nil
	}

	result, err := json.ParseAny(string(data))
	if err != nil {
		return nil, err
	}

	cache.Store(key, result)
	return result, nil
}
```

### Кэширование запросов по путям

```go
// Предкомпиляция частых путей (через Processor)
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()
path1, _ := p.CompilePath("user.name")
path2, _ := p.CompilePath("user.email")
path3, _ := p.CompilePath("items[*].id")
```

## Бенчмаркинг

### Примеры тестов производительности

```go
func BenchmarkParse(b *testing.B) {
	data := []byte(`{"name": "test", "items": [1, 2, 3]}`)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = json.ParseAny(string(data))
	}
}

func BenchmarkGetString(b *testing.B) {
	data := `{"user": {"name": "CyberGo", "email": "test@example.com"}}`

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		json.GetString(data, "user.name")
	}
}
```

### Сравнение A/B средств оптимизации

Самый надёжный способ проверить эффективность оптимизации — написать пару бенчмарков «до / после» и прогнать их вместе. `b.ReportAllocs()` добавляет к выводу `B/op` и `allocs/op`; запускайте командой `go test -bench=. -benchmem`:

```go
// Базовый вариант: повторяющийся Get (каждый раз — поиск ключа кэша + навигация)
func BenchmarkRepeatGet(b *testing.B) {
	data := `{"user": {"name": "CyberGo"}, "items": [1, 2, 3]}`
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = json.Get(data, "user.name")
		_, _ = json.Get(data, "items")
	}
}

// Кандидат-оптимизация: PreParse один раз, GetFromParsed многократно
func BenchmarkPreParse(b *testing.B) {
	data := `{"user": {"name": "CyberGo"}, "items": [1, 2, 3]}`
	p, err := json.New()
	if err != nil {
		b.Fatal(err)
	}
	defer p.Close()

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		parsed, err := p.PreParse(data)
		if err != nil {
			b.Fatal(err)
		}
		_, _ = p.GetFromParsed(parsed, "user.name")
		_, _ = p.GetFromParsed(parsed, "items")
		parsed.Release()
	}
}
```

::: tip Интерпретация результатов
Сравните `ns/op` и `allocs/op` двух бенчмарков: если вариант с предпарсингом заметно быстрее, затраты горячей точки приходятся в основном на повторный парсинг/поиск ключа кэша — предпарсинг стоит внедрять; если разница пренебрежима, продолжайте по [пути принятия решений](#путь-принятия-решений-по-оптимизации) исследовать следующий уровень (например, кодирование, конкуренцию за блокировки).
:::

### Анализ памяти

```go
func TestMemoryUsage(t *testing.T) {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	before := m.Alloc

	// Выполнение операции
	data := generateLargeJSON()
	_, _ = json.ParseAny(data)

	runtime.ReadMemStats(&m)
	after := m.Alloc

	fmt.Printf("Использование памяти: %d bytes\n", after-before)
}
```

## Сравнение производительности

| Операция | Малые данные (<1KB) | Средние данные (1MB) | Большие данные (>10MB) |
|----------|---------------------|----------------------|------------------------|
| `Parse` | Рекомендуется | Рекомендуется | Не рекомендуется |
| `ForeachFile` | Не обязательно | Опционально | Рекомендуется |

## См. также

- [Обработка больших файлов](../streaming/large-files)
- [Обработка ошибок](./error-handling)
