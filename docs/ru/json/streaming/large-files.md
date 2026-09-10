---
sidebar_label: "Руководство по работе с большими файлами"
title: "Большие файлы - CyberGo JSON | Руководство"
description: "Большие файлы в CyberGo JSON: ForeachFile, ForeachFileChunked, ForeachFileWithPath, ForeachFileNested, NDJSONProcessor и StreamIterator для контроля памяти."
sidebar_position: 1
---

# Обработка больших файлов

Для больших JSON-файлов (например, логов, конфигураций, экспорта данных) прямая загрузка в память может привести к её переполнению. Библиотека json предоставляет несколько эффективных способов обработки.

::: tip Подсказка
Справочник API по типам потоковых и параллельных итераторов (StreamIterator, StreamObjectIterator, BatchIterator, ParallelIterator) см. в разделе [Итераторы](../api-reference/iterator); практики параллельной обработки — в разделе [Конкурентность и параллелизм](../advanced/concurrency).
:::

::: warning
`ForeachFile` и `ForeachFileChunked` загружают весь файл в память перед началом итерации. Поведение «порций» влияет только на способ итерации данных в памяти, а не на способ чтения файла. Для действительно больших файлов, где требуется контроль над памятью, используйте `NDJSONProcessor` с форматом JSONL или `StreamIterator`.
:::

## Альтернативные подходы

| Подход | Сценарий использования | Использование памяти |
|--------|------------------------|----------------------|
| **Processor.ForeachFile** | Структурированная итерационная обработка файла | Загружает весь файл, итерирует по элементам |
| **Processor.ForeachFileChunked** | Пакетная порционная обработка | Загружает весь файл, итерирует порциями |
| **NDJSONProcessor** | Построчная обработка JSONL-файлов | Контролируемое использование памяти, настоящая потоковая обработка |
| **StreamIterator** | Потоковое декодирование большого массива по элементам | Память не зависит от длины массива |

### Четыре варианта серии ForeachFile

Семейство `ForeachFile` насчитывает четыре варианта; все принимают необязательный `Config` (для разбора и настроек проверки безопасности на каждый вызов) и различаются целью обхода и способом группировки:

| Вариант | Цель обхода | Типичные сценарии |
|------|------|------|
| `ForeachFile` | элементы корневого массива / пары ключ-значение корневого объекта | журналы и файлы экспорта, где данные собраны на верхнем уровне |
| `ForeachFileWithPath` | массив/объект по указанному пути | подколлекции `users`, `orders` и т. п. внутри файла |
| `ForeachFileChunked` | элементы корневого массива, порциями по `chunkSize` | пакетная запись в БД, пакетная отправка |
| `ForeachFileNested` | рекурсивный обход всех вложенных структур | многослойные конфигурации неизвестной глубины, структурная статистика |

Все четыре поддерживают досрочную остановку возвратом `item.Break()` из callback; `ForeachFileChunked` требует, чтобы корневой узел был JSON-массивом (иначе возвращается `ErrTypeMismatch`), а `chunkSize <= 0` трактуется как 100.

## Унифицированный API: Processor

### Параметры конфигурации

Настройки обработки больших файлов интегрированы в `Config`:

```go
type Config struct {
	// ... другие настройки ...

	// Настройки обработки больших файлов
	ChunkSize       int64 // Размер порции (по умолчанию 1 МБ)
	MaxMemory       int64 // Максимальное использование памяти (по умолчанию 100 МБ)
	BufferSize      int   // Размер буфера чтения (по умолчанию 64 КБ)
	SamplingEnabled bool  // Включить выборку (по умолчанию true)
	SampleSize      int   // Количество образцов (по умолчанию 1000)
}
```

### Базовое использование

```go
package main

import (
	"github.com/cybergodev/json"
	"log"
)

func main() {
	// Создание Processor (с конфигурацией по умолчанию)
	processor, err := json.New()
	if err != nil {
		log.Fatal(err)
	}
	defer processor.Close()

	// Способ 1: обработка по одному элементу (рекомендуется)
	count := 0
	err = processor.ForeachFile("large-data.json", func(key any, item *json.IterableValue) error {
		count++

		// Использование удобных методов IterableValue для доступа к полям
		id := item.GetInt("id")
		name := item.GetString("name")
		email := item.GetString("email")

		// Поддержка доступа к вложенным свойствам через путь
		city := item.GetString("profile.city")
		interests := item.GetArray("profile.interests")

		if count%10000 == 0 {
			log.Printf("Обработано %d записей, пример: id=%d name=%s email=%s city=%s интересов=%d",
				count, id, name, email, city, len(interests))
		}
		return nil
	})

	if err != nil {
		log.Fatal(err)
	}
	log.Printf("Обработка завершена, всего %d записей", count)
}
```

### Пакетная обработка

```go
// Способ 2: пакетная обработка (подходит для массовой записи в базу данных)
err := processor.ForeachFileChunked("large-data.json", 1000, func(chunk []*json.IterableValue) error {
	log.Printf("Обработка пакета: %d записей", len(chunk))

	// Массовая запись в базу данных
	for _, item := range chunk {
		id := item.GetInt("id")
		name := item.GetString("name")
		// ... обработка данных
	}
	return nil
})
```

### С управлением прерыванием

```go
// Способ 3: с управлением прерыванием (остановка после нахождения определённых данных)
// Верните item.Break() для остановки итерации, верните nil для продолжения
err := processor.ForeachFile("large-data.json", func(key any, item *json.IterableValue) error {
	id := item.GetInt("id")

	if id == targetID {
		// Найдено, остановка итерации
		fmt.Printf("Найдено: ID=%d, Имя=%s\n", id, item.GetString("name"))
		return item.Break() // Остановка итерации (возвращает сигнал прерывания)
	}

	return nil // Продолжение итерации
})
```

### Обработка файлов объектов

```go
// Способ 4: обработка файла с JSON-объектами (структура ключ-значение)
// Формат файла: {"user1": {...}, "user2": {...}, ...}
err := processor.ForeachFile("config-map.json", func(key any, item *json.IterableValue) error {
	fmt.Printf("Ключ: %s, Имя: %s\n", key, item.GetString("name"))
	return nil
})
```

### Пользовательская конфигурация

```go
// Пользовательская конфигурация обработки больших файлов
cfg := json.DefaultConfig()
cfg.ChunkSize = 10 * 1024 * 1024  // Порция 10 МБ
cfg.MaxMemory = 500 * 1024 * 1024 // Лимит памяти 500 МБ
cfg.BufferSize = 128 * 1024       // Буфер 128 КБ

processor, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer processor.Close()
```

## Удобные методы IterableValue

Методы серии `ForeachFile*` предоставляют интерфейс `IterableValue` с удобным доступом к данным:

| Метод | Описание | Пример |
|-------|----------|--------|
| `Get(path)` | Получить значение | `item.Get("field")` |
| `GetString(path)` | Получить строку | `item.GetString("name")` |
| `GetInt(path)` | Получить целое число | `item.GetInt("id")` |
| `GetFloat64(path)` | Получить число с плавающей точкой | `item.GetFloat64("score")` |
| `GetBool(path)` | Получить логическое значение | `item.GetBool("active")` |
| `GetArray(path)` | Получить массив | `item.GetArray("tags")` |
| `GetObject(path)` | Получить объект | `item.GetObject("profile")` |
| `Exists(path)` | Проверить существование поля | `item.Exists("email")` |
| `IsNull(path)` | Проверить, равно ли null | `item.IsNull("deleted_at")` |
| `IsEmpty(path)` | Проверить, пусто ли | `item.IsEmpty("notes")` |
| `Break()` | Вернуть сигнал прерывания | `return item.Break()` |

**Поддержка навигации по путям**

```go
city := item.GetString("profile.address.city") // Вложенный объект
firstTag := item.GetString("tags[0]")          // Индекс массива
lastTag := item.GetString("tags[-1]")          // Отрицательный индекс (последний)
nested := item.GetString("data.items[0].name") // Сложный путь
```

::: warning Не удерживайте ссылку на IterableValue после возврата callback
Серия `ForeachFile*` (а также работающие в памяти `Foreach*`) использует пул объектов для снижения накладных расходов на выделение памяти: **после возврата callback** `IterableValue` возвращается в пул, а его внутренние данные обнуляются. Извлекайте нужные значения внутри callback (например, результат `GetString`) и не сохраняйте сам `item` или ссылку на `item.GetData()` за пределами callback.
:::

## Настройка потоковой обработки

Параметры потоковой обработки настраиваются через `Config`. Поля, напрямую связанные с потоковым чтением, и их фактическое поведение:

| Поле | Значение по умолчанию (`DefaultConfig`) | Поведение |
|------|------|------|
| `MaxJSONSize` | 100 МБ (`DefaultMaxJSONSize`) | Верхний предел общего числа байтов при чтении файла/Reader. `LoadFromFile`/`UnmarshalFromFile`/`LoadFromReader` принудительно применяют его **во время чтения** через `io.LimitReader` (лимит +1 байт для обнаружения усечения — защита от гонки TOCTOU); серия `ForeachFile*` наследует его автоматически через `LoadFromFile`; `cfg.MaxJSONSize > 0`, переданный в конструктор потокового итератора, ограничивает весь поток сверху |
| `BufferSize` | 64 КБ | Буфер чтения `StreamIterator`/`StreamObjectIterator`; если передан `cfg` с `BufferSize <= 0`, откат к 32 КБ |
| `ChunkSize` | 1 МБ | Размер порции для больших файлов (диапазон валидации 64 КБ–100 МБ) |
| `MaxMemory` | 100 МБ | Общий предел памяти (диапазон валидации 10 МБ–1 ГБ); цепочка запасных значений лимита памяти для JSONL-потоков: `JSONLMaxMemory` → `MaxMemory` |
| `MaxNestingDepthSecurity` | 200 (`DefaultMaxNestingDepth`) | Предел глубины вложенности для каждой строки JSONL; строки проверяются по одной до разбора |
| `ValidateFilePath` | `true` | Поле объявлено, но сейчас **не является переключателем**: проверка безопасности пути файла (path traversal, символические ссылки, платформенные ограничения) выполняется безусловно при чтении/записи |

`Config.Validate`/`ValidateWithWarnings` молча зажимают выходящие за границы значения обратно в допустимый диапазон (например, `BufferSize` зажимается в 4 КБ–1 МБ); конкретные корректировки можно посмотреть через `ValidateWithWarnings`.

```go
cfg := json.DefaultConfig()

// Настройки обработки больших файлов
cfg.ChunkSize = 10 * 1024 * 1024  // Порция 10 МБ
cfg.MaxMemory = 500 * 1024 * 1024 // Лимит памяти 500 МБ
cfg.BufferSize = 128 * 1024       // Буфер 128 КБ

processor, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer processor.Close()
```

### Использование обобщённой функции StreamLinesInto

```go
type User struct {
	Name string `json:"name"`
}

file, _ := os.Open("users.jsonl")
defer file.Close()

_, err := json.StreamLinesInto[User](file, func(lineNum int, user User) error {
	fmt.Printf("Обработка: %s\n", user.Name)
	return nil
})
```

### Параллельная обработка

Для задач, допускающих параллельную обработку, можно использовать несколько goroutine:

```go
package main

import (
	"github.com/cybergodev/json"
	"sync"
)

func main() {
	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	// Использование пула воркеров
	workers := 4
	items := make(chan any, 100)
	var wg sync.WaitGroup

	// Запуск воркеров
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for item := range items {
				// Обработка элемента (замените на свою бизнес-логику)
				_ = item
			}
		}(i)
	}

	// Потоковое чтение и распределение
	processor.ForeachFile("large-data.json", func(key any, item *json.IterableValue) error {
		items <- item.GetData()
		return nil
	})

	close(items)
	wg.Wait()
}
```

Если данные уже находятся в памяти (`[]any`), можно напрямую использовать встроенный в библиотеку параллельный итератор [ParallelIterator](../api-reference/iterator#тип-paralleliterator) и не писать пул воркеров вручную.

## Потоковые и параллельные итераторы

`ForeachFile*` требует предварительной загрузки всего файла; когда файл слишком велик для полной загрузки в память, используйте итераторы из этого раздела: `StreamIterator`/`StreamObjectIterator` читают и декодируют прямо на `io.Reader`, и потребление памяти не зависит от объёма данных. Полный API на уровне типов см. в разделе [Итераторы](../api-reference/iterator).

### StreamIterator: потоковое декодирование большого массива по элементам

```go
package main

import (
	"fmt"
	"io"
	"strings"

	"github.com/cybergodev/json"
)

func main() {
	// Данные для демонстрации; в реальном сценарии замените на os.Open("large-array.json")
	var src io.Reader = strings.NewReader(`[
        {"id": 1, "name": "Alice"},
        {"id": 2, "name": "Bob"},
        {"id": 3, "name": "Carol"}
    ]`)

	iter := json.NewStreamIterator(src)
	count := 0
	for iter.Next() {
		if obj, ok := iter.Value().(map[string]any); ok {
			fmt.Printf("index=%d id=%.0f name=%s\n", iter.Index(), obj["id"], obj["name"])
		}
		count++
	}
	if err := iter.Err(); err != nil {
		fmt.Println("Ошибка итерации:", err)
		return
	}
	fmt.Println("Всего элементов:", count)
	// Вывод:
	// index=0 id=1 name=Alice
	// index=1 id=2 name=Bob
	// index=2 id=3 name=Carol
	// Всего элементов: 3
}
```

Ключевые моменты:

- Верхний уровень обязан быть JSON-массивом; скаляр верхнего уровня выдаётся как единственный элемент один раз, объект верхнего уровня отклоняется (`iter.Err()` возвращает ошибку).
- Если переданный `cfg.MaxJSONSize > 0`, ограничивается **весь поток** по общему числу байт (по умолчанию откат к 100 МБ); при превышении итерация завершается ошибкой.
- Декодирование по одному элементу; в любой момент в памяти только текущий элемент.

### StreamObjectIterator: потоковое декодирование большого объекта по парам ключ-значение

```go
package main

import (
	"fmt"
	"strings"

	"github.com/cybergodev/json"
)

func main() {
	src := strings.NewReader(`{
        "users":  {"count": 3},
        "orders": {"count": 128},
        "events": {"count": 9001}
    }`)

	iter := json.NewStreamObjectIterator(src)
	for iter.Next() {
		if obj, ok := iter.Value().(map[string]any); ok {
			fmt.Printf("%s: count=%.0f\n", iter.Key(), obj["count"])
		}
	}
	if err := iter.Err(); err != nil {
		fmt.Println("Ошибка итерации:", err)
		return
	}
	// Вывод (в порядке документа, а не в случайном порядке map):
	// users: count=3
	// orders: count=128
	// events: count=9001
}
```

Подходит для случаев, когда верхний уровень — очень большой объект (например, таблица конфигурации, индекс разделов), обрабатываемый по парам ключ-значение.

### BatchIterator: порционное потребление массива в памяти

`BatchIterator` работает с уже загруженным `[]any` и возвращает порции-срезы — удобно передавать массив среднего размера дальше фиксированными партиями (пакетная загрузка в БД, постраничные вычисления):

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := []any{
		map[string]any{"id": 1},
		map[string]any{"id": 2},
		map[string]any{"id": 3},
		map[string]any{"id": 4},
		map[string]any{"id": 5},
	}

	// Размер партии берётся из Config.MaxBatchSize; в конфигурации по умолчанию — 2000
	cfg := json.DefaultConfig()
	cfg.MaxBatchSize = 2

	iter := json.NewBatchIterator(data, cfg)
	fmt.Println("Всего партий:", iter.TotalBatches())
	for iter.HasNext() {
		batch := iter.NextBatch()
		fmt.Printf("Партия [%d:%d), элементов=%d\n", iter.CurrentIndex()-len(batch), iter.CurrentIndex(), len(batch))
	}
	// Вывод:
	// Всего партий: 3
	// Партия [0:2), элементов=2
	// Партия [2:4), элементов=2
	// Партия [4:5), элементов=1
}
```

Для очень больших пакетных загрузок используйте [`ForeachFileChunked`](#пакетная-обработка) (источник — файл) или [`StreamJSONLChunked`](./jsonl#streamjsonlchunked) (источник — JSONL); оба возвращают `IterableValue` в пул после возврата callback порции, поэтому запись в БД нужно завершать внутри callback.

### ParallelIterator: CPU-интенсивная параллельная обработка

`ParallelIterator` параллельно обрабатывает массив в памяти через пул воркеров; их число берётся из `Config.MaxConcurrency` (50 в конфигурации по умолчанию) и автоматически сужается по длине данных. Результаты `Map` записываются по индексам, сохраняя порядок ввода:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	nums := []any{1, 2, 3, 4}

	iter := json.NewParallelIterator(nums)
	defer iter.Close()

	squares, err := iter.Map(func(idx int, val any) (any, error) {
		n, ok := val.(int)
		if !ok {
			return nil, fmt.Errorf("элемент %d не целое число", idx)
		}
		return n * n, nil
	})
	if err != nil {
		fmt.Println("Ошибка обработки:", err)
		return
	}
	fmt.Println("Результаты возведения в квадрат:", squares)
	// Вывод: Результаты возведения в квадрат: [1 4 9 16]
}
```

`ForEach`/`ForEachWithContext` останавливают диспетчеризацию новых задач и возвращают ошибку, как только любой callback вернул ошибку; паника в callback восстанавливается и превращается в ошибку, не роняя процесс; `Close` сообщает всем воркерам завершиться и может безопасно вызываться конкурентно. Для сценариев с отменой/таймаутом используйте варианты `ForEachWithContext`/`ForEachBatchWithContext`.

## Рекомендации по оптимизации производительности

### Управление памятью

```go
// Настройка в зависимости от доступной памяти
cfg := json.DefaultConfig()
cfg.MaxMemory = 500 * 1024 * 1024 // 500 МБ
cfg.ChunkSize = 10 * 1024 * 1024  // 10 МБ

processor, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer processor.Close()
```

### Лучшие практики

1. **Оценка размера файла**: проверяйте размер файла перед обработкой и выбирайте подходящую стратегию
2. **Установка лимитов памяти**: используйте `MaxMemory` для предотвращения OOM
3. **Пакетная запись**: накапливайте определённое количество записей перед массовой записью в базу данных
4. **Обработка ошибок**: реализуйте `JSONLContinueOnErr` или записывайте неудачные записи
5. **Мониторинг прогресса**: регулярно выводите ход обработки

## Руководство по выбору

| Размер файла | Рекомендуемый подход | Пример |
|--------------|----------------------|--------|
| < 10 МБ | Прямая загрузка | `json.ParseAny` + `Get` |
| 10-100 МБ | Processor.ForeachFile | Обработка по одному элементу |
| 100 МБ - 1 ГБ | Processor.ForeachFileChunked | Порционная итерационная обработка |
| > 1 ГБ | NDJSONProcessor / формат JSONL | Настоящая потоковая обработка, контролируемое использование памяти |

## Справочник API

В этом разделе собраны сигнатуры функций и таблицы параметров API обработки больших файлов для быстрого поиска.

### Методы Processor

**ForeachFile**

Сигнатура: `func (p *Processor) ForeachFile(filePath string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

Обработка по одному элементу JSON-массива из большого файла. Полное использование см. в разделах [Базовое использование](#базовое-использование) и [Управление прерыванием](#с-управлением-прерыванием).

**Параметры**

| Название | Тип | Описание |
|------|------|------|
| `filePath` | `string` | Путь к файлу JSON |
| `fn` | `func(key any, item *IterableValue) error` | Обратный вызов обработки |

**Возвращаемые значения обратного вызова**

| Возвращаемое значение | Описание |
|--------|------|
| `nil` | Продолжить обработку следующего элемента |
| `item.Break()` | Остановить итерацию без ошибки |
| другое `error` | Остановить итерацию и вернуть ошибку |

**ForeachFileChunked**

Сигнатура: `func (p *Processor) ForeachFileChunked(filePath string, chunkSize int, fn func(chunk []*IterableValue) error, cfg ...Config) (err error)`

Пакетная обработка большого файла, за раз обрабатывается указанное количество элементов. Использование см. в разделе [Пакетная обработка](#пакетная-обработка).

**Параметры**

| Название | Тип | Описание |
|------|------|------|
| `filePath` | `string` | Путь к файлу JSON |
| `chunkSize` | `int` | Количество элементов в пакете |
| `fn` | `func(chunk []*IterableValue) error` | Обратный вызов пакетной обработки |

**ForeachFileWithPath**

Сигнатура: `func (p *Processor) ForeachFileWithPath(filePath, path string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

Обработка массива или объекта JSON по указанному пути в файле.

**Параметры**

| Название | Тип | Описание |
|------|------|------|
| `filePath` | `string` | Путь к файлу JSON |
| `path` | `string` | Выражение пути JSON |
| `fn` | `func(key any, item *IterableValue) error` | Обратный вызов обработки |

```go
// Обработка каждого элемента массива users в файле
err := p.ForeachFileWithPath("data.json", "users", func(key any, item *json.IterableValue) error {
	fmt.Printf("Name: %s\n", item.GetString("name"))
	return nil
})
```

**ForeachFileNested**

Сигнатура: `func (p *Processor) ForeachFileNested(filePath string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

Рекурсивный обход всех вложенных JSON-структур в файле.

```go
// Рекурсивный обход всех вложенных элементов
err := p.ForeachFileNested("data.json", func(key any, item *json.IterableValue) error {
	fmt.Printf("Key: %v, Type: %T\n", key, item.GetData())
	return nil
})
```

## Функции уровня пакета

Помимо методов Processor, следующие функции можно вызывать напрямую без создания экземпляра Processor. Они используют глобальный процессор внутри.

### ForeachFile (функция уровня пакета)

Сигнатура: `func ForeachFile(filePath string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

Загружает JSON из файла и итерирует.

```go
err := json.ForeachFile("data.json", func(key any, item *json.IterableValue) error {
	fmt.Printf("[%v] %v\n", key, item.GetData())
	return nil
})
```

### ForeachFileWithPath (функция уровня пакета)

Сигнатура: `func ForeachFileWithPath(filePath, path string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

Загружает JSON из файла и итерирует по указанному пути.

```go
err := json.ForeachFileWithPath("data.json", "users", func(key any, item *json.IterableValue) error {
	name := item.GetString("name")
	fmt.Printf("Пользователь: %s\n", name)
	return nil
})
```

### ForeachFileChunked (функция уровня пакета)

Сигнатура: `func ForeachFileChunked(filePath string, chunkSize int, fn func(chunk []*IterableValue) error, cfg ...Config) error`

Порционная итерация JSON-массива в файле.

```go
err := json.ForeachFileChunked("large_data.json", 100, func(chunk []*json.IterableValue) error {
	for _, item := range chunk {
		processItem(item)
	}
	return nil
})
```

### ForeachFileNested (функция уровня пакета)

Сигнатура: `func ForeachFileNested(filePath string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

Загружает JSON из файла и рекурсивно итерирует все вложенные структуры.

```go
err := json.ForeachFileNested("config.json", func(key any, item *json.IterableValue) error {
	fmt.Printf("Путь: %v, Тип: %T\n", key, item.GetData())
	return nil
})
```

## См. также

- [Обработчик NDJSON](./jsonl) — потоковая обработка JSONL/NDJSON
- [JSONLWriter](./jsonl#jsonlwriter) — модуль записи JSONL

## Что дальше

- [Документация API](../api-reference/) — полный справочник API
