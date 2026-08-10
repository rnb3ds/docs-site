---
sidebar_label: "Константы и ошибки"
title: "Константы и ошибки - CyberGo html | значения и типы"
description: "Константы и ошибки CyberGo html: значения по умолчанию, сторожевые ошибки и структурированные InputError, ConfigError, FileError с errors.Is/As."
sidebar_position: 3
---

# Константы и ошибки

## Константы конфигурации по умолчанию

| Константа | Тип | Значение | Описание |
|------|------|----|------|
| `DefaultMaxInputSize` | `int` | `52428800` | Максимальный размер ввода (50 МБ) |
| `DefaultMaxCacheEntries` | `int` | `2000` | Максимальное количество записей в кэше |
| `DefaultWorkerPoolSize` | `int` | `4` | Размер пула воркеров |
| `DefaultCacheTTL` | `time.Duration` | `1ч` | Время жизни записей в кэше |
| `DefaultCacheCleanup` | `time.Duration` | `5м` | Интервал очистки кэша |
| `DefaultMaxDepth` | `int` | `500` | Максимальная глубина DOM |
| `DefaultProcessingTimeout` | `time.Duration` | `30с` | Тайм-аут обработки |

## Константы аудита

### Типы событий аудита

| Константа | Значение | Описание |
|------|------|------|
| `AuditEventBlockedTag` | `"blocked_tag"` | Заблокированный тег |
| `AuditEventBlockedAttr` | `"blocked_attr"` | Заблокированный атрибут |
| `AuditEventBlockedURL` | `"blocked_url"` | Заблокированный URL |
| `AuditEventInputViolation` | `"input_violation"` | Нарушение ввода |
| `AuditEventDepthViolation` | `"depth_violation"` | Нарушение глубины |
| `AuditEventTimeout` | `"timeout"` | Тайм-аут обработки |
| `AuditEventEncodingIssue` | `"encoding_issue"` | Проблема кодировки |
| `AuditEventPathTraversal` | `"path_traversal"` | Попытка обхода пути |

### Уровни аудита

| Константа | Тип | Значение | Описание |
|------|------|------|------|
| `AuditLevelInfo` | `AuditLevel` | `"info"` | Информационный уровень |
| `AuditLevelWarning` | `AuditLevel` | `"warning"` | Уровень предупреждения |
| `AuditLevelCritical` | `AuditLevel` | `"critical"` | Критический уровень |

:::info
Подробное использование системы аудита и типы Sink описаны в [Система аудита](../modules/audit).
:::

## Сигнатурные ошибки

| Ошибка | Сообщение | Описание |
|------|------|------|
| `ErrInputTooLarge` | `html: input size exceeds maximum` | Ввод превышает лимит размера |
| `ErrInvalidHTML` | `html: invalid HTML` | Некорректное содержимое HTML |
| `ErrProcessorClosed` | `html: processor closed` | Процессор закрыт |
| `ErrMaxDepthExceeded` | `html: max depth exceeded` | Превышена максимальная глубина |
| `ErrInvalidConfig` | `html: invalid config` | Некорректная конфигурация |
| `ErrProcessingTimeout` | `html: processing timeout exceeded` | Тайм-аут обработки |
| `ErrFileNotFound` | `html: file not found` | Файл не найден |
| `ErrInvalidFilePath` | `html: invalid file path` | Некорректный путь к файлу |
| `ErrInternalPanic` | `html: internal panic recovered` | Внутренняя паника восстановлена |
| `ErrMultipleConfigs` | `html: at most one Config may be provided` | Максимум один Config |

## Типы ошибок

### InputError

Ошибка, связанная с вводом, содержащая информацию о размере.

```go
type InputError struct {
    Op       string // Имя операции
    Size     int    // Фактический размер
    MaxSize  int    // Максимальный лимит
    InputErr error  // Исходная ошибка
}

func (e *InputError) Error() string
func (e *InputError) Unwrap() error // → InputErr (если не nil) или ErrInputTooLarge
```

### ConfigError

Ошибка валидации конфигурации, содержащая информацию о поле.

```go
type ConfigError struct {
    Field   string // Имя поля
    Value   any    // Некорректное значение
    Message string // Описание ошибки
}

func (e *ConfigError) Error() string
func (e *ConfigError) Unwrap() error // → ErrInvalidConfig
```

### FileError

Ошибка файловой операции с автоматическим усечением пути для предотвращения утечки.

```go
type FileError struct {
    Op      string // Имя операции
    Path    string // Путь к файлу
    FileErr error  // Исходная ошибка
}

func (e *FileError) Error() string        // Безопасный вывод (усечённый путь)
func (e *FileError) SafePath() string     // Возвращает только имя файла
func (e *FileError) Unwrap() error        // → ErrFileNotFound | исходная ошибка | ErrInvalidFilePath
func (e *FileError) MarshalJSON() ([]byte, error) // также усекает путь при JSON-сериализации (предотвращает утечку в ответах API)
```

:::tip Безопасный путь
`FileError.Error()` и `SafePath()` возвращают усечённый безопасный путь (только имя файла), предотвращая утечку пути. Для получения полного пути при внутренней отладке можно напрямую обратиться к полю `Path`.
:::

## Внутренние ограничивающие константы

Следующие константы определяют жёсткие верхние пределы времени выполнения библиотеки. Они **не экспортируются** (начинаются со строчной буквы), их нельзя напрямую использовать, но они влияют на поведение во время выполнения — знание этих значений помогает понять граничные условия и сценарии ошибок библиотеки.

### Верхние пределы конфигурации

| Константа | Значение | Описание |
|------|----|------|
| `maxConfigInputSize` | `52428800` (50 МБ) | Верхний предел `MaxInputSize`; даже при установке большего значения `Validate()` его отклонит |
| `maxConfigWorkerSize` | `256` | Верхний предел `WorkerPoolSize` |
| `maxConfigDepth` | `500` | Верхний предел `MaxDepth` |
| `maxConfigCacheEntries` | `100000` | Верхний предел `MaxCacheEntries` (≈100 МБ, при оценке ~1 КБ на запись) |

### Ограничения обработки

| Константа | Значение | Описание |
|------|----|------|
| `maxBatchSize` | `10000` | Максимальное количество элементов в одном пакете; при превышении весь пакет возвращает ошибку (без panic) |
| `maxTimeoutGoroutines` | `1000` | Глобальный предел параллельных goroutine тайм-аута; при превышении новые запросы сразу возвращают `ErrProcessingTimeout` |
| `maxHTMLForRegex` | `1000000` (1 МБ) | Верхний предел размера HTML для регулярного сканирования медиа-URL; при превышении регулярное резервное сканирование пропускается (защита от ReDoS) |
| `maxRegexMatches` | `1000` | Максимальное количество совпадений за одно регулярное сканирование; предотвращает избыточные аллокации на страницах, насыщенных медиа |

### Генерация ключа кэша

| Константа | Значение | Описание |
|------|----|------|
| `maxCacheKeySize` | `65536` (64 КБ) | Пороговый размер контента для полного хеширования; при превышении переключается на 5-точечную выборку |
| `cacheKeySample` | `4096` | Общий байтовый бюджет для выборки больших документов (5 точек × ~820 байт/точка) |

:::tip Зачем это знать
Эти константы объясняют некоторые «почему»: почему HTML размером более 1 МБ больше не извлекает «голые» ссылки на видео (защита от ReDoS), почему пакет более 10 000 элементов полностью завершается неудачей (защита от OOM) и почему 64 КБ — это граница стратегии ключа кэша (стоимость хеширования против риска коллизий).
:::

## Шаблон обработки ошибок

```go
result, err := html.Extract(data)
if err != nil {
    var inputErr *html.InputError
    var configErr *html.ConfigError
    var fileErr *html.FileError

    switch {
    case errors.Is(err, html.ErrInputTooLarge):
        // Ввод слишком большой
    case errors.Is(err, html.ErrInvalidHTML):
        // Некорректный HTML
    case errors.Is(err, html.ErrFileNotFound):
        // Файл не существует
    case errors.As(err, &inputErr):
        fmt.Printf("Размер %d превышает лимит %d\n", inputErr.Size, inputErr.MaxSize)
    case errors.As(err, &configErr):
        fmt.Printf("Поле конфигурации %s некорректно: %s\n", configErr.Field, configErr.Message)
    case errors.As(err, &fileErr):
        fmt.Printf("Файл: %s\n", fileErr.SafePath())
    }
}
```
