---
sidebar_label: "Итераторы и потоковые итераторы"
title: "Итераторы и IterableValue - CyberGo JSON | Справочник API"
description: "Типы итераторов CyberGo JSON: Iterator, IterableValue, потоковые StreamIterator/StreamObjectIterator, BatchIterator и ParallelIterator."
sidebar_position: 9
---

# Типы итераторов

Пакет json предоставляет различные типы итераторов, охватывающие сценарии последовательного обхода, потоковой обработки, пакетной и параллельной обработки. Итерационные **функции** (`Foreach`/`ForeachFile` и др.) см. в [Функциях итерации уровня пакета](./functions/iterate) и [Методах итерации Processor](./processor/iterate).

## Константы IteratorControl

`IteratorControl` представляет флаг управления итерацией; используется в `ForeachWithPathAndControl` и `ForeachWithPathAndIterator` для управления потоком итерации.

| Константа | Описание |
|------|------|
| `IteratorNormal` | Нормальное продолжение итерации (значение по умолчанию, им же является нулевое значение) |
| `IteratorContinue` | Продолжить итерацию. Эквивалентен `IteratorNormal` (псевдоним, сохранённый для симметрии API) — «пропуск текущего элемента» происходит неявно, итерация в любом случае продолжается |
| `IteratorBreak` | Остановить итерацию |

**Варианты использования**

| Сценарий | Рекомендуемое значение | Описание |
|------|------------|------|
| Обычная обработка элемента | `IteratorNormal` | Продолжить обработку следующего элемента |
| Фильтрация некорректных данных | `IteratorContinue` | Пропустить текущий элемент без прерывания итерации |
| Выход после нахождения цели | `IteratorBreak` | Немедленная остановка после нахождения нужных данных |
| Прерывание при ошибке | `IteratorBreak` | Остановка итерации при критической ошибке |

---

## Тип Iterator

`Iterator` — низкоуровневый итератор для обхода массивов или объектов JSON; создаётся с помощью `NewIterator`.

### NewIterator

Сигнатура: `func NewIterator(data any, cfg ...Config) *Iterator`

Создаёт экземпляр итератора. Необязательный параметр `cfg` сохранён для единообразия API и в настоящее время не влияет на поведение итератора.

```go
data := []any{"apple", "banana", "cherry"}
it := json.NewIterator(data)
for it.HasNext() {
	val, _ := it.Next()
	fmt.Println(val)
}
```

::: tip Детерминированный порядок итерации
При обходе объекта ключи выдаются по очереди в **отсортированном** порядке (встроенный обход map в Go случайсен, здесь он детерминирован); при обходе массива — в порядке индексов. `Next()` для массива возвращает сам элемент, для объекта — **значение** текущего ключа (ключ не возвращается).
:::

### Методы

| Метод | Сигнатура | Описание |
|------|------|------|
| `HasNext` | `func (it *Iterator) HasNext() bool` | Проверяет, есть ли ещё элементы |
| `Next` | `func (it *Iterator) Next() (any, bool)` | Получает следующий элемент |
| `Reset` | `func (it *Iterator) Reset()` | Очищает состояние и кэш итератора, подготавливает к повторному использованию |
| `ResetWith` | `func (it *Iterator) ResetWith(data any)` | Очищает состояние и инициализирует новыми данными |

### Reset

Очищает состояние итератора, освобождает кэшированные ключи. После вызова можно повторно инициализировать с помощью `ResetWith`.

```go
it := json.NewIterator(data1)
for it.HasNext() {
	it.Next()
}

it.Reset() // Очистить кэш
```

::: warning Не потокобезопасно
`Reset`/`ResetWith` нельзя вызывать одновременно с выполняющимися в другой goroutine `HasNext()`/`Next()`; для параллельного обхода создавайте отдельный итератор для каждой goroutine.
:::

### ResetWith

Очищает состояние итератора и инициализирует новыми данными, обеспечивая повторное использование итератора. Ограничения по конкурентности — те же, что у `Reset`.

```go
it := json.NewIterator(data1)
// ... обход data1 ...

it.ResetWith(data2) // Повторное использование итератора для новых данных
for it.HasNext() {
	val, _ := it.Next()
	fmt.Println(val)
}
```

---

## Тип IterableValue

IterableValue инкапсулирует текущий элемент в процессе итерации, предоставляя удобные методы доступа к значениям. Обратный вызов функций серии `Foreach` принимает `*IterableValue`.

### Методы

| Категория | Методы |
|------|------|
| Базовое получение | `GetData` / `Get` / `GetString` / `GetInt` / `GetFloat64` / `GetBool` / `GetArray` / `GetObject` |
| Получение со значением по умолчанию | `GetWithDefault` / `GetStringWithDefault` / `GetIntWithDefault` / `GetFloat64WithDefault` / `GetBoolWithDefault` |
| Проверка состояния | `Exists` / `IsNull` / `IsNullData` / `IsEmpty` / `IsEmptyData` |
| Управление потоком | `Break` / `ForeachNested` / `Release` |

#### GetData

Сигнатура: `func (iv *IterableValue) GetData() any`

Возвращает базовые данные.

#### Get

Сигнатура: `func (iv *IterableValue) Get(path string) any`

Получает значение по пути (поддерживает точечную нотацию и индексы массивов).

```go
val := iv.Get("user.address.city")
val = iv.Get("users[0].name")
```

#### GetString

Сигнатура: `func (iv *IterableValue) GetString(key string) string`

Получает строковое значение.

```go
name := item.GetString("name")
```

#### GetInt

Сигнатура: `func (iv *IterableValue) GetInt(key string) int`

Получает целочисленное значение.

```go
age := item.GetInt("age")
```

#### GetFloat64

Сигнатура: `func (iv *IterableValue) GetFloat64(key string) float64`

Получает значение с плавающей точкой.

```go
price := item.GetFloat64("price")
```

#### GetBool

Сигнатура: `func (iv *IterableValue) GetBool(key string) bool`

Получает логическое значение.

```go
enabled := item.GetBool("enabled")
```

#### GetArray

Сигнатура: `func (iv *IterableValue) GetArray(key string) []any`

Получает значение массива.

```go
items := item.GetArray("items")
```

#### GetObject

Сигнатура: `func (iv *IterableValue) GetObject(key string) map[string]any`

Получает значение объекта.

```go
profile := item.GetObject("profile")
```

#### GetWithDefault

Сигнатура: `func (iv *IterableValue) GetWithDefault(key string, defaultValue any) any`

Получает значение, если ключ не существует — возвращает значение по умолчанию.

```go
// Получить необязательное поле с использованием значения по умолчанию при отсутствии
timeout := item.GetWithDefault("timeout", 30)
mode := item.GetWithDefault("mode", "default")
```

#### GetStringWithDefault

Сигнатура: `func (iv *IterableValue) GetStringWithDefault(key string, defaultValue string) string`

Получает строковое значение, если ключ не существует — возвращает значение по умолчанию.

```go
name := item.GetStringWithDefault("name", "Неизвестно")
```

#### GetIntWithDefault

Сигнатура: `func (iv *IterableValue) GetIntWithDefault(key string, defaultValue int) int`

Получает целочисленное значение, если ключ не существует — возвращает значение по умолчанию.

```go
age := item.GetIntWithDefault("age", 0)
port := item.GetIntWithDefault("port", 8080)
```

#### GetFloat64WithDefault

Сигнатура: `func (iv *IterableValue) GetFloat64WithDefault(key string, defaultValue float64) float64`

Получает значение с плавающей точкой, если ключ не существует — возвращает значение по умолчанию.

```go
price := item.GetFloat64WithDefault("price", 0.0)
rate := item.GetFloat64WithDefault("rate", 1.0)
```

#### GetBoolWithDefault

Сигнатура: `func (iv *IterableValue) GetBoolWithDefault(key string, defaultValue bool) bool`

Получает логическое значение, если ключ не существует — возвращает значение по умолчанию.

```go
enabled := item.GetBoolWithDefault("enabled", false)
debug := item.GetBoolWithDefault("debug", true)
```

#### Exists

Сигнатура: `func (iv *IterableValue) Exists(key string) bool`

Проверяет, существует ли указанный ключ.

```go
if item.Exists("email") {
	email := item.GetString("email")
	fmt.Printf("Email: %s\n", email)
}
```

#### ForeachNested

Сигнатура: `func (iv *IterableValue) ForeachNested(path string, fn func(key any, item *IterableValue))`

Рекурсивно обходит вложенные структуры по указанному пути.

#### IsNullData

Сигнатура: `func (iv *IterableValue) IsNullData() bool`

Проверяет, равно ли всё значение null.

```go
if item.IsNullData() {
	fmt.Println("Значение равно null")
}
```

#### IsNull

Сигнатура: `func (iv *IterableValue) IsNull(key string) bool`

Проверяет, равно ли значение указанного ключа null.

```go
if item.IsNull("optional_field") {
	fmt.Println("Необязательное поле равно null")
}
```

#### IsEmptyData

Сигнатура: `func (iv *IterableValue) IsEmptyData() bool`

Проверяет, пусто ли всё значение (nil, пустая строка, пустой массив или пустой объект).

```go
if item.IsEmptyData() {
	fmt.Println("Значение пусто")
}
```

#### IsEmpty

Сигнатура: `func (iv *IterableValue) IsEmpty(key string) bool`

Проверяет, пусто ли значение указанного ключа.

```go
if item.IsEmpty("tags") {
	fmt.Println("Список тегов пуст")
}
```

#### Break

Сигнатура: `func (iv *IterableValue) Break() error`

Возвращает сигнал остановки итерации. Вызов в обратном вызове итерации позволяет досрочно прекратить обход.

```go
// Примечание: Break() действует только в функциях итерации, обратный вызов которых
// возвращает error (например, ForeachWithError, ForeachNestedWithError и т. д.). Обычные
// обратные вызовы Foreach не возвращают error, поэтому item.Break() не останавливает их.
err := json.ForeachNestedWithError(data, func(key any, item *json.IterableValue) error {
	if item.GetString("status") == "stop" {
		// Остановить итерацию после нахождения цели
		return item.Break()
	}
	// Продолжить обработку
	return nil
})
```

#### Release

Сигнатура: `func (iv *IterableValue) Release()`

Возвращает IterableValue в пул объектов, освобождая внутренние ссылки на данные.

```go
json.Foreach(data, func(key any, item *json.IterableValue) {
	// Обработка данных...
	fmt.Println(item.GetData())
	// Освобождение после обработки для снижения нагрузки на GC
	item.Release()
})
```

::: tip Release можно опустить
Функции итерации **автоматически** возвращают каждый `IterableValue` в пул объектов после выхода из обратного вызова; явный вызов `Release()` внутри обратного вызова избыточен, но безвреден (внутри есть защита от повторного возврата). Обратите внимание: после выхода из обратного вызова внутренние данные очищаются, поэтому **не** сохраняйте `*IterableValue` для использования вне обратного вызова — если данные нужно оставить, скопируйте то, что вернул `GetData()`.
:::

### Полный пример IterableValue

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"users": [
        {"name": "Alice", "age": 30, "email": null},
        {"name": "Bob", "tags": []}
    ]}`

	err := json.ForeachWithError(data, "users", func(key any, item *json.IterableValue) error {
		idx, _ := key.(int)

		// Получение со значениями по умолчанию
		name := item.GetStringWithDefault("name", "Неизвестно")
		age := item.GetIntWithDefault("age", 0)

		// Проверки существования / null / пустоты
		hasEmail := item.Exists("email")
		emailNull := item.IsNull("email")
		tagsEmpty := item.IsEmpty("tags")

		fmt.Printf("[%d] name=%s age=%d email_существует=%v email_null=%v tags_пусто=%v\n",
			idx, name, age, hasEmail, emailNull, tagsEmpty)

		// Досрочное завершение после нахождения Alice
		if name == "Alice" {
			return item.Break()
		}
		return nil
	})
	if err != nil {
		panic(err)
	}
	// Вывод:
	// [0] name=Alice age=30 email_существует=true email_null=true tags_пусто=true
}
```

---

## Тип StreamIterator

StreamIterator обеспечивает эффективную по памяти потоковую итерацию, подходящую для больших массивов JSON. Поэлементная обработка без загрузки всего массива в память.

### NewStreamIterator

Сигнатура: `func NewStreamIterator(reader io.Reader, cfg ...Config) *StreamIterator`

Создаёт потоковый итератор. Размер буфера настраивается через `Config.BufferSize` (по умолчанию 32KB; при `BufferSize <= 0` откатывается к 32KB); при передаче cfg `MaxJSONSize` действует на **общее число байтов всего потока** — при превышении возвращается ошибка.

```go
file, _ := os.Open("large-array.json")
defer file.Close()

// Без конфигурации
it := json.NewStreamIterator(file)
for it.Next() {
	val := it.Value()
	fmt.Printf("Индекс %d: %v\n", it.Index(), val)
}
if err := it.Err(); err != nil {
	panic(err)
}

// С конфигурацией
cfg := json.DefaultConfig()
cfg.BufferSize = 64 * 1024 // Буфер 64KB
it2 := json.NewStreamIterator(file, cfg)
```

::: tip Форма входных данных верхнего уровня
`StreamIterator` рассчитан на JSON-**массив**. Если верхний уровень — одиночный скаляр (например, `"hello"`, `42`), он выдаётся один раз как единственный элемент; если верхний уровень — объект или начинается с другого разделителя, `Next()` возвращает false, а `Err()` сообщает ошибку «expects a JSON array».
:::

### Методы

| Метод | Сигнатура | Описание |
|------|------|------|
| `Next` | `func (si *StreamIterator) Next() bool` | Переходит к следующему элементу |
| `Value` | `func (si *StreamIterator) Value() any` | Возвращает текущий элемент |
| `Index` | `func (si *StreamIterator) Index() int` | Возвращает текущий индекс (с 0) |
| `Err` | `func (si *StreamIterator) Err() error` | Возвращает ошибку итерации |

---

## Тип StreamObjectIterator

StreamObjectIterator обеспечивает эффективную по памяти потоковую итерацию, подходящую для больших объектов JSON.

### NewStreamObjectIterator

Сигнатура: `func NewStreamObjectIterator(reader io.Reader, cfg ...Config) *StreamObjectIterator`

Создаёт потоковый итератор объектов. Семантика `Config.BufferSize` (по умолчанию 32KB) и `MaxJSONSize` (лимит общего числа байтов потока) — та же, что у `NewStreamIterator`.

```go
file, _ := os.Open("large-object.json")
defer file.Close()

it := json.NewStreamObjectIterator(file)
for it.Next() {
	fmt.Printf("Ключ: %s, Значение: %v\n", it.Key(), it.Value())
}
if err := it.Err(); err != nil {
	panic(err)
}
```

::: tip Принимается только объект верхнего уровня
Если первый token — не `{`, `Next()` сразу возвращает false и итерация заканчивается (без ошибки); нестроковый ключ так же молча завершает итерацию. Пары ключ-значение выдаются в **порядке появления** в потоке (без сортировки).
:::

### Методы

| Метод | Сигнатура | Описание |
|------|------|------|
| `Next` | `func (soi *StreamObjectIterator) Next() bool` | Переходит к следующей паре ключ-значение |
| `Key` | `func (soi *StreamObjectIterator) Key() string` | Возвращает текущий ключ |
| `Value` | `func (soi *StreamObjectIterator) Value() any` | Возвращает текущее значение |
| `Err` | `func (soi *StreamObjectIterator) Err() error` | Возвращает ошибку итерации |

---

## Тип BatchIterator

BatchIterator используется для эффективной пакетной обработки больших массивов, снижая накладные расходы на обработку отдельных элементов; создаётся с помощью `NewBatchIterator`.

### NewBatchIterator

Сигнатура: `func NewBatchIterator(data []any, cfg ...Config) *BatchIterator`

Создаёт пакетный итератор. Размер пакета настраивается через `Config.MaxBatchSize` (если cfg не передан или `MaxBatchSize <= 0`, по умолчанию 100 элементов в пакете).

::: tip Способ разбиения на пакеты
`NextBatch` возвращает **представление** (view) среза базового массива (`data[current:end]`) без копирования данных; последний пакет может быть меньше batchSize, а изменение элементов представления затрагивает исходный массив.
:::

```go
data := make([]any, 10000)
// Заполнение данных...

cfg := json.DefaultConfig()
cfg.MaxBatchSize = 100 // По 100 элементов в пакете
it := json.NewBatchIterator(data, cfg)
for it.HasNext() {
	batch := it.NextBatch()
	// Пакетная обработка
	processBatch(batch)
	fmt.Printf("Обработано %d элементов, осталось %d\n", len(batch), it.Remaining())
}
```

### Методы

| Метод | Сигнатура | Описание |
|------|------|------|
| `NextBatch` | `func (it *BatchIterator) NextBatch() []any` | Возвращает следующий пакет элементов; nil, если пакетов не осталось |
| `HasNext` | `func (it *BatchIterator) HasNext() bool` | Проверяет, есть ли ещё пакеты |
| `Reset` | `func (it *BatchIterator) Reset()` | Сбрасывает итератор в начальную позицию |
| `TotalBatches` | `func (it *BatchIterator) TotalBatches() int` | Возвращает общее количество пакетов (`ceil(len/batchSize)` с округлением вверх; при неположительном batchSize возвращает 0) |
| `CurrentIndex` | `func (it *BatchIterator) CurrentIndex() int` | Возвращает текущую позицию потребления в массиве |
| `Remaining` | `func (it *BatchIterator) Remaining() int` | Возвращает количество оставшихся элементов (0 после полного потребления) |

---

## Тип ParallelIterator

ParallelIterator используется для параллельной обработки массивов, используя многоядерные процессоры для ускорения обработки.

### NewParallelIterator

Сигнатура: `func NewParallelIterator(data []any, cfg ...Config) *ParallelIterator`

Создаёт параллельный итератор. Число рабочих горутин настраивается через `Config.MaxConcurrency` (если cfg не передан или `MaxConcurrency <= 0`, по умолчанию 4; фактическое число горутин не превышает `len(data)`, для пустых данных — 1).

```go
data := make([]any, 10000)
// Заполнение данных...

cfg := json.DefaultConfig()
cfg.MaxConcurrency = 8 // 8 рабочих горутин
it := json.NewParallelIterator(data, cfg)
err := it.ForEach(func(idx int, val any) error {
	// Параллельная обработка каждого элемента
	return processItem(idx, val)
})
if err != nil {
	panic(err)
}
```

### ForEach

Сигнатура: `func (it *ParallelIterator) ForEach(fn func(int, any) error) error`

Параллельно обрабатывает каждый элемент, возвращает первую обнаруженную ошибку.

```go
err := it.ForEach(func(idx int, val any) error {
	// Эта функция выполняется параллельно в нескольких горутинах
	return nil
})
```

::: tip Семантика ошибок и завершения
После того как любой обратный вызов вернёт ошибку, остальные рабочие горутины как можно быстрее прекращают получать задачи и возвращается **первая** ошибка; вызов после `Close` сразу возвращает nil (обратный вызов не выполняется); паника в обратном вызове перехватывается и преобразуется в ошибку — процесс не падает.
:::

### ForEachWithContext

Сигнатура: `func (it *ParallelIterator) ForEachWithContext(ctx context.Context, fn func(int, any) error) error`

Параллельная обработка с контекстом, поддерживает отмену операции. При отмене контекста возвращается `ctx.Err()`.

```go
ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()

err := it.ForEachWithContext(ctx, func(idx int, val any) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
		return processItem(idx, val)
	}
})
```

### ForEachBatch

Сигнатура: `func (it *ParallelIterator) ForEachBatch(batchSize int, fn func(int, []any) error) error`

Параллельная пакетная обработка. Каждый пакет обрабатывается одной горутиной; при `batchSize <= 0` используется 100; обратный вызов получает **номер пакета** (какой по счёту) и его элементы.

```go
err := it.ForEachBatch(100, func(batchIdx int, batch []any) error {
	// Каждый пакет обрабатывается в одной горутине
	return processBatch(batchIdx, batch)
})
```

### ForEachBatchWithContext

Сигнатура: `func (it *ParallelIterator) ForEachBatchWithContext(ctx context.Context, batchSize int, fn func(int, []any) error) error`

Параллельная пакетная обработка с контекстом. При отмене возвращает `ctx.Err()`, после Close возвращает nil.

### Map

Сигнатура: `func (it *ParallelIterator) Map(transform func(int, any) (any, error)) ([]any, error)`

Параллельно преобразует каждый элемент, возвращает новый срез. Каждая рабочая горутина пишет в позицию, соответствующую индексу элемента, поэтому **порядок результата совпадает с порядком входных данных**; при ошибке любого преобразования возвращается `(nil, err)`.

```go
results, err := it.Map(func(idx int, val any) (any, error) {
	if num, ok := val.(float64); ok {
		return num * 2, nil
	}
	return nil, fmt.Errorf("unexpected type at index %d", idx)
})
```

### Filter

Сигнатура: `func (it *ParallelIterator) Filter(predicate func(int, any) bool) []any`

Параллельная фильтрация элементов, возвращает срез элементов, удовлетворяющих условию. **Входной порядок сохраняется** (не порядок завершения); предикат не возвращает ошибку, паника в обратном вызове записывается в журнал, а не прерывает работу.

```go
even := it.Filter(func(idx int, val any) bool {
	if num, ok := val.(float64); ok {
		return int(num)%2 == 0
	}
	return false
})
```

### Close

Сигнатура: `func (it *ParallelIterator) Close()`

Освобождает ресурсы ParallelIterator: сообщает запущенным горутинам о необходимости остановиться и ждёт их завершения. Реализовано на CAS — **допускает безопасный повторный вызов и одновременный вызов из нескольких горутин**.

```go
it := json.NewParallelIterator(data, cfg)
defer it.Close()
```

---

## Полные примеры

### Потоковая обработка больших файлов

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"os"
)

func main() {
	file, err := os.Open("large-array.json")
	if err != nil {
		panic(err)
	}
	defer file.Close()

	it := json.NewStreamIterator(file)
	count := 0

	for it.Next() {
		val := it.Value()
		// Поэлементная обработка, эффективно по памяти
		count++
		if count%1000 == 0 {
			fmt.Printf("Обработано %d элементов, текущее значение: %v\n", count, val)
		}
	}

	if err := it.Err(); err != nil {
		panic(err)
	}

	fmt.Printf("Всего обработано %d элементов\n", count)
}
```

### Параллельная обработка

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"sync/atomic"
)

func main() {
	// Разобрать массив JSON
	data := `[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]`
	var arr []any
	json.Unmarshal([]byte(data), &arr)

	// Создать параллельный итератор (4 рабочие горутины)
	cfg := json.DefaultConfig()
	cfg.MaxConcurrency = 4
	it := json.NewParallelIterator(arr, cfg)

	var sum int64

	err := it.ForEach(func(idx int, val any) error {
		if num, ok := val.(float64); ok {
			atomic.AddInt64(&sum, int64(num))
		}
		return nil
	})

	if err != nil {
		panic(err)
	}

	fmt.Printf("Сумма: %d\n", sum) // Вывод: Сумма: 55
}
```

### Пакетная обработка

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// Создать большой набор данных
	data := make([]any, 1000)
	for i := range data {
		data[i] = map[string]any{"id": i, "value": i * 10}
	}

	// По 100 элементов в пакете
	cfg := json.DefaultConfig()
	cfg.MaxBatchSize = 100
	it := json.NewBatchIterator(data, cfg)
	batchNum := 0

	for it.HasNext() {
		batch := it.NextBatch()
		batchNum++

		// Пакетная обработка (например, массовая запись в базу данных)
		fmt.Printf("Пакет %d: обработано %d элементов\n", batchNum, len(batch))
	}

	fmt.Printf("Всего пакетов: %d\n", it.TotalBatches())
}
```

### Повторное использование Iterator

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// Первый обход
	it := json.NewIterator([]any{"a", "b", "c"})
	for it.HasNext() {
		val, _ := it.Next()
		fmt.Println(val)
	}

	// Повторное использование того же итератора для новых данных, чтобы избежать повторного выделения
	it.ResetWith([]any{1, 2, 3, 4})
	for it.HasNext() {
		val, _ := it.Next()
		fmt.Println(val)
	}
}
```

---

## Рекомендации по производительности

1. **Повторное использование Iterator** — используйте `Reset`/`ResetWith`, чтобы избежать повторного выделения; подходит для сценариев многократного обхода
2. **Потоковые итераторы для больших наборов данных** — `StreamIterator`/`StreamObjectIterator` выполняют поэлементную обработку, эффективно по памяти
3. **Снижение накладных расходов через пакетную обработку** — `BatchIterator` обрабатывает по пакетам, снижая накладные расходы на отдельный элемент
4. **Параллельная обработка для CPU-интенсивных задач** — `ParallelIterator` использует многоядерность для ускорения
5. **Освобождение IterableValue** — вызывайте `Release()` в обратном вызове `Foreach` после завершения обработки, чтобы снизить нагрузку на GC

---

## См. также

- [Функции итерации уровня пакета](./functions/iterate) — итерационные функции Foreach/ForeachFile и др.
- [Методы итерации Processor](./processor/iterate) — соответствующие методы итерации процессора
- [Обработка больших файлов](../streaming/large-files) — руководство и справочник API по большим файлам
- [Процессор NDJSON](../streaming/jsonl) — обработка JSONL
