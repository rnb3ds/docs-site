---
sidebar_label: "Пакетная обработка"
title: "Пакетная обработка - CyberGo html | параллельные пакеты"
description: "Параллельный пакетный API CyberGo html: ExtractBatch и ExtractBatchFiles с версиями контекста, поддержка параллелизма, до 10000 элементов в пакете."
sidebar_position: 3
---

# Пакетная обработка

Пакетное извлечение поддерживает параллельную обработку нескольких HTML-документов, максимум 10 000 элементов на пакет.

## Функции пакета

```go
func ExtractBatch(htmlContents [][]byte, cfg ...Config) *BatchResult
func ExtractBatchWithContext(ctx context.Context, htmlContents [][]byte, cfg ...Config) *BatchResult
func ExtractBatchFiles(filePaths []string, cfg ...Config) *BatchResult
func ExtractBatchFilesWithContext(ctx context.Context, filePaths []string, cfg ...Config) *BatchResult
```

## Методы Processor

```go
func (p *Processor) ExtractBatch(htmlContents [][]byte) *BatchResult
func (p *Processor) ExtractBatchWithContext(ctx context.Context, htmlContents [][]byte) *BatchResult
func (p *Processor) ExtractBatchFiles(filePaths []string) *BatchResult
func (p *Processor) ExtractBatchFilesWithContext(ctx context.Context, filePaths []string) *BatchResult
```

## BatchResult

```go
type BatchResult struct {
    Results   []*Result  // результат для каждого элемента ввода, индексируется по порядку ввода; nil при ошибке или отмене
    Errors    []error    // ошибка для каждого элемента ввода; индекс соответствует Results один к одному
    Success   int        // количество успешных
    Failed    int        // количество неудачных
    Cancelled int        // количество элементов, оставшихся необработанными из-за отмены контекста
}
```

## Механизм параллелизма

Пакетное извлечение управляет параллелизмом через **паттерн семафора** (буферизованный канал `chan struct{}`), а не запускает все goroutine разом:

- **Уровень параллелизма** задаётся `Config.WorkerPoolSize`, по умолчанию `4` (`DefaultWorkerPoolSize`), диапазон `1–256`
- Ёмкость семафора равна `WorkerPoolSize`: каждый goroutine перед запуском должен получить слот (`sem <- struct{}{}`), а по завершении освободить его (`<-sem`), тем самым строго ограничивая **число одновременно работающих goroutine** величиной `WorkerPoolSize`
- Даже при десятках тысяч элементов ввода одновременно выполняются только `WorkerPoolSize` задач извлечения, что предотвращает взрыв goroutine
- **Каждый элемент извлечения работает независимо**: автоматическое определение кодировки, независимая изоляция ошибок, сбой одного элемента не влияет на остальные
- **Processor можно безопасно разделять между goroutine**: одновременный вызов `Extract` из нескольких goroutine потокобезопасен; пакетные методы повторно используют один и тот же экземпляр Processor

:::tip Настройка WorkerPoolSize
Пакетная обработка при вводе из файлов чаще всего I/O-интенсивная — умеренное увеличение `WorkerPoolSize` (например, `8–16`) повышает пропускную способность. В чисто CPU-интенсивных сценариях парсинга не стоит превышать `runtime.NumCPU()`. Значения выше `256` отклоняются на этапе проверки конфигурации.
:::

## Описание полей BatchResult

Оба среза `Results` и `Errors` имеют **длину, равную количеству элементов ввода**, и **индексы соответствуют друг другу один к одному**:

| Поле | Описание |
|------|------|
| `Results[i]` | результат извлечения `i`-го элемента ввода; `nil`, если элемент завершился ошибкой или был отменён |
| `Errors[i]` | ошибка `i`-го элемента ввода; `nil` при успехе, ошибка извлечения при сбое, `ctx.Err()` при отмене |
| `Success` | количество успешных элементов, равно числу не-`nil` элементов в `Results` |
| `Failed` | количество неудачных элементов (извлечение вернуло ошибку) |
| `Cancelled` | количество элементов, оставшихся необработанными из-за отмены контекста |

Тождество: `Success + Failed + Cancelled == количеству элементов ввода`.

## Поведение при отмене контекста

`ExtractBatchWithContext` / `ExtractBatchFilesWithContext` кооперативно реагируют на отмену контекста в трёх контрольных точках:

| Контрольная точка | Поведение |
|--------|------|
| Перед диспетчеризацией задачи | Если `ctx` уже отменён, элемент сразу помечается `Cancelled`, `Errors[i] = ctx.Err()`, goroutine не запускается |
| После получения семафора (перед запуском goroutine) | Если отмена произошла во время ожидания семафора, элемент также помечается `Cancelled` |
| Перед обработкой внутри goroutine | Непосредственно перед выполнением извлечения производится повторная проверка; при отмене элемент помечается `Cancelled` и происходит немедленный возврат |

Семантика после отмены:

- **Завершённые результаты сохраняются неизменными** — отмена влияет только на ещё не начатые задачи
- **Не начатые задачи** учитываются в `Cancelled`, их `Errors[i]` заполняется `ctx.Err()` (обычно `context.Canceled` или `context.DeadlineExceeded`)
- Версии без суффикса `WithContext` внутренне используют `context.Background()` и никогда не отменяются

## Валидация ввода

Пакетные методы выполняют предварительную проверку перед диспетчеризацией задач; при неудаче возвращается заполненный `BatchResult` (а не `error`):

| Ситуация | Возвращаемое значение |
|------|------|
| Превышение `10000` элементов в пакете | Каждый `Errors[i]` заполняется одной и той же ошибкой, `Failed = N`, без panic |
| Processor равен `nil` или уже `Close` | Каждый `Errors[i]` заполняется `ErrProcessorClosed`, `Failed = N` |
| Пустой срез ввода (0 элементов) | Пустой `BatchResult` (`Results`/`Errors` — пустые срезы) |
| Недопустимый `Config` в функциях пакета | Каждый элемент заполняется ошибкой конфигурации |

## Примеры

### Базовое пакетное извлечение

```go
package main

import (
	"fmt"

	"github.com/cybergodev/html"
)

func main() {
	pages := [][]byte{
		[]byte("<html><head><title>Главная</title></head><body><p>Добро пожаловать на главную страницу.</p></body></html>"),
		[]byte("<html><head><title>О нас</title></head><body><p>О команде.</p></body></html>"),
		[]byte("<html><head><title>Список продуктов</title></head><body><p>Всего три продукта.</p></body></html>"),
	}

	batch := html.ExtractBatch(pages)
	fmt.Printf("Успешно: %d, Неудачно: %d, Отменено: %d\n", batch.Success, batch.Failed, batch.Cancelled)
	// Вывод: Успешно: 3, Неудачно: 0, Отменено: 0

	// Индексы Results соответствуют срезу ввода один к одному
	for i, result := range batch.Results {
		if result != nil {
			fmt.Printf("  [%d] Заголовок: %s, слов: %d\n", i, result.Title, result.WordCount)
		}
	}
}
```

### Пакетное извлечение с отменой контекста

```go
package main

import (
	"context"
	"fmt"

	"github.com/cybergodev/html"
)

func main() {
	pages := make([][]byte, 20)
	for i := range pages {
		pages[i] = []byte("<html><head><title>Страница</title></head><body><p>Основной текст.</p></body></html>")
	}

	// Немедленная отмена контекста — имитация раннего завершения
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	batch := html.ExtractBatchWithContext(ctx, pages)
	fmt.Printf("Успешно: %d, Неудачно: %d, Отменено: %d\n", batch.Success, batch.Failed, batch.Cancelled)
	// Вывод: Успешно: 0, Неудачно: 0, Отменено: 20

	// Отменённые элементы: Results[i] равен nil, Errors[i] заполняется ctx.Err()
	fmt.Printf("Ошибка первого элемента: %v\n", batch.Errors[0])
	// Вывод: Ошибка первого элемента: context canceled
}
```

:::warning Ограничение пакетной обработки
Максимум 10 000 элементов за один вызов; при превышении возвращается `*BatchResult`, в котором все элементы помечены как неудачные (каждая запись `Errors` равна `html: batch size N exceeds maximum 10000`); panic не возникает.
:::
