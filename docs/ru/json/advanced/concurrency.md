---
sidebar_label: "Конкурентность и параллелизм"
title: "Конкурентность - CyberGo JSON | Практическое руководство"
description: "Конкурентность CyberGo JSON: потокобезопасность Processor, ParallelIterator, StreamJSONLParallel параллельный JSONL, SetGlobalProcessor и MaxConcurrency лимиты."
sidebar_position: 4
---

# Конкурентность и параллельная обработка

Все операции CyberGo JSON **потокобезопасны** и предоставляют готовые параллельные API (`ParallelIterator`, параллельная потоковая обработка JSONL). На этой странице — семантика потокобезопасности, встроенные параллельные API и паттерны конкурентного использования.

:::tip Подсказка Разделение с страницей производительности
Раздел «Конкурентная обработка» в [Производительности](./performance) показывает **универсальные паттерны Go** (`sync.WaitGroup` + семафор + Worker Pool) для ручного распараллеливания массивов; эта страница документирует **встроенные в библиотеку** параллельные API. Они дополняют друг друга.
:::

## Гарантии потокобезопасности

`Processor` — потокобезопасный движок обработки (комментарий в исходниках: `Processor is the main JSON processing engine with thread safety`):

- **Один экземпляр Processor можно разделять между горутинами** — все публичные методы (`Get`/`Set`/`Delete`/`Marshal` и т.д.) внутренне защищены атомарными операциями и управлением конкурентностью (`beginGovernedOp`/`endGovernedOp`).
- **Пакетные функции** (`json.Get`, `json.GetString` и т.д.) разделяют один глобальный Processor и потокобезопасны по умолчанию.
- **`*ParsedJSON` из `PreParse` можно читать конкурентно** — несколько горутин могут одновременно вызывать `GetFromParsed` для одного `ParsedJSON`.

:::warning Предупреждение Когда не разделять
`Processor` можно разделять, но **не разделяйте изменяемые Go-контейнеры между горутинами** (например, передавать `map[string]any` из `Get` в несколько горутин для изменения). Возвращённые контейнеры по умолчанию — копии (если не включён `CacheSharedResults`), поэтому изменение возвращаемого значения не влияет на кэш. Но конкурентное изменение одного контейнера всё равно требует блокировки на стороне вызывающего.
:::

## ParallelIterator — параллельный итератор

`ParallelIterator` распараллеливает обработку массива по ядрам CPU со встроенным пулом воркеров, агрегацией ошибок и восстановлением после panic — безопаснее самописного пула горутин.

### Базовый параллельный обход

```go
package main

import (
	"fmt"
	"sync"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"items":[1,2,3,4,5,6,7,8]}`
	items := json.GetArray(data, "items")

	// Число воркеров по умолчанию = Config.MaxConcurrency (ограничено длиной массива)
	iter := json.NewParallelIterator(items)
	defer iter.Close()

	var mu sync.Mutex
	var sum int64
	err := iter.ForEach(func(_ int, val any) error {
		mu.Lock()
		sum += int64(val.(float64))
		mu.Unlock()
		return nil
	})
	if err != nil {
		panic(err)
	}
	fmt.Printf("Сумма = %d\n", sum)
	// Вывод: Сумма = 36
}
```

### Параллельный Map

`Map` параллельно преобразует каждый элемент; результаты **сохраняют порядок ввода** (каждый воркер пишет в свой индекс, блокировка не нужна).

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"items":[1,2,3,4]}`
	items := json.GetArray(data, "items")

	iter := json.NewParallelIterator(items)
	defer iter.Close()

	// Параллельный map: каждый элемент * 10, порядок результата совпадает с вводом
	doubled, err := iter.Map(func(_ int, val any) (any, error) {
		return int(val.(float64)) * 10, nil
	})
	if err != nil {
		panic(err)
	}
	fmt.Println(doubled)
	// Вывод: [10 20 30 40]
}
```

### Обзор API ParallelIterator

| API | Сигнатура | Описание |
|-----|------|------|
| `NewParallelIterator` | `func NewParallelIterator(data []any, cfg ...Config) *ParallelIterator` | Создаёт итератор; число воркеров из `cfg.MaxConcurrency` |
| `ForEach` | `func (it *ParallelIterator) ForEach(fn func(int, any) error) error` | Параллельный обход; возвращает первую ошибку |
| `ForEachWithContext` | `func (it *ParallelIterator) ForEachWithContext(ctx context.Context, fn func(int, any) error) error` | Поддержка отмены через context |
| `ForEachBatch` | `func (it *ParallelIterator) ForEachBatch(batchSize int, fn func(int, []any) error) error` | Параллельная обработка пакетами |
| `Map` | `func (it *ParallelIterator) Map(transform func(int, any) (any, error)) ([]any, error)` | Параллельное преобразование, с сохранением порядка |
| `Filter` | `func (it *ParallelIterator) Filter(predicate func(int, any) bool) []any` | Параллельный фильтр |
| `Close` | `func (it *ParallelIterator) Close()` | Освобождает ресурсы (вызывать по завершении) |

Полные сигнатуры и использование — в [Типы итераторов](../api-reference/iterator#тип-paralleliterator).

:::tip Подсказка Обработка ошибок и panic
`ForEach` прекращает диспетчеризацию новых задач и возвращает **первую** ошибку; panic внутри воркера перехватывается (`recover`) и преобразуется в ошибку, поэтому panic в колбэке не роняет процесс. Для отмены используйте `ForEachWithContext` — корректно завершается при `ctx.Done()`.
:::

## Параллельная потоковая обработка JSONL

Для больших JSONL (NDJSON) файлов `StreamJSONLParallel` обрабатывает каждую строку несколькими воркерами.

```go
package main

import (
	"fmt"
	"strings"
	"sync"

	"github.com/cybergodev/json"
)

func main() {
	// Имитация JSONL-данных (по одному JSON-объекту на строку)
	jsonlData := `{"id":1,"score":95}
{"id":2,"score":82}
{"id":3,"score":78}
{"id":4,"score":90}`

	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	var mu sync.Mutex
	var total int64
	var count int64

	// 4 воркера обрабатывают строки параллельно
	err = processor.StreamJSONLParallel(strings.NewReader(jsonlData), 4, func(lineNum int, item *json.IterableValue) error {
		score := int64(item.GetInt("score"))
		mu.Lock()
		total += score
		count++
		mu.Unlock()
		return nil
	})
	if err != nil {
		panic(err)
	}
	fmt.Printf("Обработано %d записей, сумма %d\n", count, total)
	// Вывод: Обработано 4 записей, сумма 345
}
```

| API | Описание |
|-----|------|
| `StreamJSONLParallel(reader, workers, fn)` | Многоворкерная параллельная обработка JSONL |
| `StreamJSONLParallelWithContext(ctx, reader, workers, fn)` | То же с отменой/таймаутом через context |
| `StreamJSONLChunked(reader, chunkSize, fn)` | Обработка чанками, экономия памяти |

Полные сигнатуры и настройки (`JSONLWorkers`/`JSONLChunkSize` и т.д.) — в [Обработка JSONL](../api-reference/processor/jsonl) и [Потоковая обработка JSONL](../streaming/jsonl).

:::tip Подсказка Порядок строк
В параллельном режиме `lineNum` в колбэке всё ещё отражает исходный номер строки, но **порядок выполнения не гарантируется**. Для упорядоченного вывода пишите в предвыделённый слайс по позиции `lineNum`.
:::

## Глобальный процессор для конкурентного использования

`SetGlobalProcessor` позволяет всем пакетным функциям разделять один пользовательский Processor — подходит для многогорутинных сервисов, требующих единой конфигурации (параметры кэша, хуки, ограничения безопасности).

```go
package main

import (
	"fmt"
	"sync"

	"github.com/cybergodev/json"
)

func main() {
	// Пользовательский глобальный процессор (разделяется всеми пакетными функциями, потокобезопасен)
	cfg := json.DefaultConfig()
	processor, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	json.SetGlobalProcessor(processor) // предыдущий глобальный Processor закрывается автоматически
	defer json.ShutdownGlobalProcessor() // корректное завершение при выходе

	data := `{"user":{"name":"Alice","age":30}}`

	// Несколько горутин конкурентно используют пакетные функции (один глобальный Processor)
	var wg sync.WaitGroup
	results := make([]string, 3)
	for i := 0; i < 3; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			switch idx {
			case 0:
				results[idx] = json.GetString(data, "user.name")
			case 1:
				results[idx] = fmt.Sprintf("%d", json.GetInt(data, "user.age"))
			case 2:
				results[idx] = json.GetString(data, "user.name")
			}
		}(i)
	}
	wg.Wait()
	fmt.Println(results)
	// Вывод: [Alice 30 Alice]
}
```

:::warning Предупреждение Передача владения
После `SetGlobalProcessor` жизненным циклом этого Processor управляет глобаль — **не вызывайте** на нём `Close()` вручную, иначе возникнет конфликт с логикой глобального завершения. Для корректного закрытия и освобождения ресурсов вызывайте `ShutdownGlobalProcessor()` при выходе.
:::

## Ограничение MaxConcurrency

`Config.MaxConcurrency` (по умолчанию 50) — **мягкий предел конкурентности** на Processor: атомарный счётный семафор ограничивает число операций в полёте. При достижении предела новые операции возвращают `ErrConcurrencyLimit` (можно повторить).

```go
cfg := json.DefaultConfig()
cfg.MaxConcurrency = 100 // повысить предел конкурентности на Processor
```

- `ErrConcurrencyLimit` — **повторяемая** временная ошибка (см. [Обработка ошибок](./error-handling#системные-ошибки)).
- Число воркеров параллельного стриминга (`StreamJSONLParallel`) берётся из явного аргумента и не привязано напрямую к `MaxConcurrency`, но разделяет тот же слот управления.
- Число воркеров `ParallelIterator` берётся из `cfg.MaxConcurrency` (по умолчанию 50) и ограничивается длиной массива.

## Лучшие практики и подводные камни

### 1. Переиспользуйте Processor; не создавайте по одному на запрос

`Processor` хранит кэш, рекурсивный процессор и другое состояние — **переиспользование одного экземпляра** обеспечивает попадания кэша. Вызов `json.New()` на каждый запрос лишает преимуществ кэша и увеличивает аллокации.

### 2. Разделять экземпляр безопасно; разделять контейнеры результатов — осторожно

`Processor` безопасно разделять между горутинами; но `map`/`slice`, возвращённые `Get`, при совместном изменении между горутинами требуют блокировки на стороне вызывающего (или рассматривайте как только для чтения при `CacheSharedResults`).

### 3. Освобождайте ресурсы через Close

В долгоживущих сервисах явно вызывайте `defer processor.Close()` и `defer iter.Close()`, чтобы избежать утечек горутин кэша и памяти. Экземпляр, установленный через `SetGlobalProcessor`, использует вместо этого `ShutdownGlobalProcessor`.

### 4. Параллелить стоит только CPU-интенсивную работу

У параллелизма есть накладные расходы на планирование и синхронизацию. Малые массивы (< `ParallelThreshold`, по умолчанию 10) быстрее последовательно; JSONL с большим числом строк и тяжёлой обработкой строки явно выигрывает.

### 5. Следите за порядком в параллельном режиме

`StreamJSONLParallel` не гарантирует порядок обработки. Для упорядоченного результата пишите по `lineNum` в позицию, затем потребляйте по порядку.

## См. также

- [Производительность](./performance) — переиспользование Processor, универсальные паттерны конкурентности Go, бенчмарки
- [Типы итераторов](../api-reference/iterator) — полный API `ParallelIterator`
- [Обработка JSONL](../api-reference/processor/jsonl) — детали параллельного JSONL API
- [Кэш и предпарсинг](./caching) — механизм кэша и PreParse
- [Обработка ошибок](./error-handling) — `ErrConcurrencyLimit` и классификация ошибок
