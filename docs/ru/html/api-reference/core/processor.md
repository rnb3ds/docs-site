---
sidebar_label: "Processor"
title: "Processor - CyberGo html | API и примеры"
description: "API Processor CyberGo html: New, семейство Extract, GetStatistics, ClearCache, Close — управление жизненным циклом для высокочастотного переиспользования."
sidebar_position: 2
---

# Processor

`Processor` — это основной движок обработки библиотеки HTML. По сравнению с функциями пакета Processor повторно использует внутренние ресурсы (кэш, детекторы кодировок), что подходит для высокочастотных вызовов.

## Создание

### New

Создаёт экземпляр Processor с возможностью передачи конфигурации.

```go
func New(cfg ...Config) (*Processor, error)
```

**Параметры**: максимум один `Config`; если не предоставлен, используется `DefaultConfig()`.

```go
p, err := html.New(html.DefaultConfig())
if err != nil {
    log.Fatal(err)
}
defer p.Close()
```

**Внутренняя инициализация**:

`New` не просто присваивает значения — он выполняет следующие шаги, чтобы возвращённый Processor был сразу готов к использованию:

1. **Проверка конфигурации**: вызывается `Config.Validate()`; при недопустимой конфигурации возвращается `*ConfigError` (`errors.Is(err, ErrInvalidConfig)` истинно). Проверка охватывает числовые границы (`MaxInputSize`, `MaxCacheEntries`, `WorkerPoolSize`, `MaxDepth` не могут быть отрицательными/превышать предел) и строки форматов (`InlineImageFormat`/`InlineLinkFormat`/`TableFormat` принимают допустимые значения).
2. **Установка Scorer**: если настроен пользовательский `Scorer`, он адаптируется к внутреннему интерфейсу через `scorerAdapter`; иначе используется `SharedDefaultScorer` (только для чтения, потокобезопасный).
3. **Предварительный расчёт строк формата**: `InlineImageFormat`/`InlineLinkFormat` нормализуются (нижний регистр + удаление пробелов, пустая строка отображается в `"none"`) и кэшируются в поля `imageFormat`/`linkFormat`, чтобы избежать повторных `strings.ToLower` в горячем пути.
4. **Запуск очистки кэша**: фоновый goroutine очистки запускается только если `CacheTTL>0` **и** `CacheCleanup>0`; если хотя бы один из них равен 0, goroutine не запускается.

## Потокобезопасность

:::tip Параллельное использование
`Processor` можно безопасно разделять между несколькими goroutine без дополнительной блокировки. Гарантии параллельности обеспечиваются:

- **Неизменная конфигурация**: `config` неизменяем после `New()` (указатель `*Config` никогда не переназначается и не изменяется), поэтому форматирующие методы вроде `ExtractToMarkdown` могут безопасно делать копию по значению для создания временного Processor без какой-либо блокировки — переопределение форматов никогда не записывается обратно в общую конфигурацию.
- **Счётчики статистики**: `TotalProcessed`/`CacheHits`/`CacheMisses`/`ErrorCount`/`totalProcessTime` полностью используют операции `atomic`.
- **Кэш**: внутренний `Cache` имеет собственную блокировку, чтение и запись безопасны.
- **Scorer**: встроенный `DefaultScorer` доступен только для чтения. **Пользовательский `Scorer` должен сам обеспечивать потокобезопасность** (например, удерживать внутреннюю блокировку), так как один Processor при параллельных `Extract` вызывает его `Score`/`ShouldRemove` из нескольких goroutine.
:::

## Извлечение контента

### Ошибки возврата

Семейство методов `Extract` возвращает явные сигнатурные ошибки на различных этапах обработки, которые можно точно определить через `errors.Is`:

| Ошибка | Условие срабатывания | Примечание |
|------|----------|------|
| `ErrProcessorClosed` | `p` равен `nil` или уже `Close` | Общее для всех методов |
| `ErrInputTooLarge` | Размер ввода в байтах превышает `MaxInputSize` | Обёрнуто в `*InputError`, содержит фактический/лимитный размер |
| Ошибка определения кодировки | Сбой определения кодировки или конвертации в UTF-8 | Исходная ошибка обёрнута |
| `ErrInvalidHTML` | Байты не могут быть разобраны как HTML | Нижележащая ошибка парсинга также обёрнута |
| `ErrMaxDepthExceeded` | Глубина вложенности элементов превышает `MaxDepth` | Итеративная проверка, предотвращает переполнение стека |
| `ErrProcessingTimeout` | Обработка заняла больше времени, чем `ProcessingTimeout` | `ProcessingTimeout=0` означает отсутствие лимита |
| `ErrInternalPanic` | Внутренний непредвиденный panic был восстановлен | Защитный механизм, не должен встречаться при нормальном использовании |

Версии с `context` также могут возвращать `context.Canceled` (пользовательская отмена) или `context.DeadlineExceeded` (тайм-аут контекста, нормализованный до `ErrProcessingTimeout`).

### Extract

```go
func (p *Processor) Extract(htmlBytes []byte) (*Result, error)
```

Извлекает контент из HTML-байтов с автоматическим определением кодировки.

### ExtractFromFile

```go
func (p *Processor) ExtractFromFile(filePath string) (*Result, error)
```

Извлекает контент из файла.

### ExtractText

```go
func (p *Processor) ExtractText(htmlBytes []byte) (string, error)
```

Возвращает только чистый текст.

### ExtractTextFromFile

```go
func (p *Processor) ExtractTextFromFile(filePath string) (string, error)
```

Извлекает чистый текст из файла.

## Версии с контекстом

Все методы извлечения имеют версии с `ExtractWithContext`:

```go
func (p *Processor) ExtractWithContext(ctx context.Context, htmlBytes []byte) (*Result, error)
func (p *Processor) ExtractFromFileWithContext(ctx context.Context, filePath string) (*Result, error)
func (p *Processor) ExtractTextWithContext(ctx context.Context, htmlBytes []byte) (string, error)
func (p *Processor) ExtractTextFromFileWithContext(ctx context.Context, filePath string) (string, error)
```

## Форматы вывода

```go
func (p *Processor) ExtractToMarkdown(htmlBytes []byte) (string, error)
func (p *Processor) ExtractToMarkdownFromFile(filePath string) (string, error)
func (p *Processor) ExtractToJSON(htmlBytes []byte) ([]byte, error)
func (p *Processor) ExtractToJSONFromFile(filePath string) ([]byte, error)
```

Версии с контекстом:

```go
func (p *Processor) ExtractToMarkdownWithContext(ctx context.Context, htmlBytes []byte) (string, error)
func (p *Processor) ExtractToMarkdownFromFileWithContext(ctx context.Context, filePath string) (string, error)
func (p *Processor) ExtractToJSONWithContext(ctx context.Context, htmlBytes []byte) ([]byte, error)
func (p *Processor) ExtractToJSONFromFileWithContext(ctx context.Context, filePath string) ([]byte, error)
```

:::warning Особенности поведения кэша
Эти два метода принципиально различаются в обработке кэша:

- **`ExtractToMarkdown`** создаёт временный Processor (копирует неизменяемую `config`, но обнуляет `MaxCacheEntries` и отключает аудит), **не читает и не пишет основной кэш**, поэтому не загрязняет и не попадает в кэш основного Processor. Результат в формате Markdown также не кэшируется.
- **`ExtractToJSON`** напрямую вызывает `p.Extract` и **проходит через обычный кэш-путь** — попадает/записывает в основной кэш, счётчики статистики также обновляются.

Если вы хотите, чтобы Markdown-вывод также пользовался кэшем, создайте отдельный Processor с `MarkdownConfig()` и вызывайте `Extract`, либо кэшируйте вывод самостоятельно.
:::

## Извлечение ссылок

```go
func (p *Processor) ExtractAllLinks(htmlBytes []byte) ([]LinkResource, error)
func (p *Processor) ExtractAllLinksFromFile(filePath string) ([]LinkResource, error)
func (p *Processor) ExtractAllLinksWithContext(ctx context.Context, htmlBytes []byte) ([]LinkResource, error)
func (p *Processor) ExtractAllLinksFromFileWithContext(ctx context.Context, filePath string) ([]LinkResource, error)
```

## Пакетная обработка

```go
func (p *Processor) ExtractBatch(htmlContents [][]byte) *BatchResult
func (p *Processor) ExtractBatchWithContext(ctx context.Context, htmlContents [][]byte) *BatchResult
func (p *Processor) ExtractBatchFiles(filePaths []string) *BatchResult
func (p *Processor) ExtractBatchFilesWithContext(ctx context.Context, filePaths []string) *BatchResult
```

## Статистика и кэш

### Подробное описание поведения кэша

Когда `MaxCacheEntries > 0`, `Extract` включает кэширование:

- **Путь попадания**: обнаружив запись в кэше, увеличивает `CacheHits` и `TotalProcessed` на 1 и возвращает `cloneResult` — глубокую копию срезов `Images`/`Links`/`Videos`/`Audios` через `copy`. Изменения возвращаемого значения вызывающей стороной **не влияют** на записи в кэше, а также предотвращается гонка данных при одновременных попаданиях.
- **Путь промаха**: после завершения обработки результат записывается в кэш, после чего возвращается копия `cloneResult` (также глубокая копия). Таким образом, кэш-запись и возвращаемое значение не являются псевдонимами.
- **Отключение кэша**: при `MaxCacheEntries = 0` `Extract` пропускает генерацию ключа кэша и `Get/Set` (короткое замыкание), не неся никаких накладных расходов на кэш.

### GetStatistics

Возвращает текущую статистику обработки.

```go
func (p *Processor) GetStatistics() Statistics
```

Назначение полей `Statistics`:

| Поле | Описание |
|------|------|
| `TotalProcessed` | Количество завершённых без ошибок извлечений, **включая попадания в кэш** |
| `CacheHits` | Количество прямых попаданий в кэш |
| `CacheMisses` | Количество промахов, потребовавших полной обработки |
| `ErrorCount` | Количество извлечений, вернувших ошибку |
| `AverageProcessTime` | Среднее wall-clock время одного извлечения (0, если `TotalProcessed` равен 0) |

```go
stats := p.GetStatistics()
fmt.Printf("Обработано: %d, попаданий в кэш: %d\n",
    stats.TotalProcessed, stats.CacheHits)
```

### ClearCache

Очищает кэш, сохраняя накопленную статистику.

```go
func (p *Processor) ClearCache()
```

### ResetStatistics

Сбрасывает все счётчики статистики.

```go
func (p *Processor) ResetStatistics()
```

## Аудит

### GetAuditLog

Получает записи журнала аудита.

```go
func (p *Processor) GetAuditLog() []AuditEntry
```

### ClearAuditLog

Очищает журнал аудита.

```go
func (p *Processor) ClearAuditLog()
```

## Жизненный цикл

### Close

Освобождает ресурсы, удерживаемые Processor. Должен вызываться после завершения использования.

```go
func (p *Processor) Close() error
```

```go
p, _ := html.New(cfg)
defer p.Close()
// ... использование p для извлечения
```

:::tip Рекомендации по жизненному циклу
- **Повторное использование синглтона**: в долго живущем сервисе (HTTP handler, worker) создайте один Processor и разделяйте его между параллельными запросами, чтобы максимизировать выгоду от кэша. Сам Processor потокобезопасен, создавать новый на каждый запрос не нужно.
- **`defer Close()`**: сразу после создания выполняйте `defer p.Close()`, чтобы даже в исключительных путях освободить фоновый goroutine очистки и ресурсы аудита. `Close` останавливает goroutine очистки кэша, очищает кэш и закрывает audit sink.
- **Не используйте после Close**: вызов любого метода после `Close` вернёт `ErrProcessorClosed`. `Close` использует `CompareAndSwap` для идемпотентности — повторный вызов безопасен, но бессмысленен.
:::
