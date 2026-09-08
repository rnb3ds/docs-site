---
sidebar_label: "Config"
title: "Конфигурация Config - CyberGo JSON | Справочник API"
description: "Конфигурация Config CyberGo JSON: DefaultConfig, SecurityConfig, PrettyConfig форматирование, лимиты, параметры JSONL и стратегии слияния MergeMode."
sidebar_position: 4
---

# Config

Config используется для настройки поведения Processor и всех операций с JSON.

## Структура Config

```go
type Config struct {
	// ===== Настройки кэша =====
	MaxCacheSize       int           `json:"max_cache_size"`       // Максимальное количество записей в кэше
	CacheTTL           time.Duration `json:"cache_ttl"`            // Время жизни записи кэша
	EnableCache        bool          `json:"enable_cache"`         // Включать ли кэш
	CacheResults       bool          `json:"cache_results"`        // Кэшировать ли результаты операций
	CacheSharedResults bool          `json:"cache_shared_results"` // Разделяемые результаты кэша (пропускает защитное глубокое копирование; вызывающая сторона не должна изменять возвращённые контейнеры)

	// ===== Ограничения размеров =====
	MaxJSONSize  int64 `json:"max_json_size"`  // Максимальный размер JSON (байт)
	MaxPathDepth int   `json:"max_path_depth"` // Максимальная глубина пути
	MaxBatchSize int   `json:"max_batch_size"` // Максимальное количество пакетных операций

	// ===== Ограничения безопасности =====
	MaxNestingDepthSecurity   int   `json:"max_nesting_depth"`            // Максимальная глубина вложенности
	MaxSecurityValidationSize int64 `json:"max_security_validation_size"` // Максимальный размер для проверки безопасности
	MaxObjectKeys             int   `json:"max_object_keys"`              // Максимальное количество ключей объекта
	MaxArrayElements          int   `json:"max_array_elements"`           // Максимальное количество элементов массива
	FullSecurityScan          bool  `json:"full_security_scan"`           // Включить полное сканирование безопасности

	// ===== Конкурентность =====
	MaxConcurrency    int `json:"max_concurrency"`    // Максимальный уровень конкурентности
	ParallelThreshold int `json:"parallel_threshold"` // Порог параллельной обработки

	// ===== Параметры обработки =====
	EnableValidation bool `json:"enable_validation"` // Включить валидацию
	StrictMode       bool `json:"strict_mode"`       // Строгий режим
	CreatePaths      bool `json:"create_paths"`      // Автоматическое создание путей
	CleanupNulls     bool `json:"cleanup_nulls"`     // Очистка значений null
	CompactArrays    bool `json:"compact_arrays"`    // Уплотнение массивов
	ContinueOnError  bool `json:"continue_on_error"` // Продолжать при ошибке пакетной операции

	// ===== Параметры ввода/вывода =====
	AllowComments    bool `json:"allow_comments"`     // Разрешить комментарии
	PreserveNumbers  bool `json:"preserve_numbers"`   // Сохранять точность чисел
	ValidateInput    bool `json:"validate_input"`     // Валидировать ввод
	ValidateFilePath bool `json:"validate_file_path"` // Валидировать пути файлов
	SkipValidation   bool `json:"skip_validation"`    // Пропустить валидацию (доверенный ввод)

	// ===== Параметры кодирования =====
	Pretty          bool            `json:"pretty"`                   // Форматированный вывод
	Indent          string          `json:"indent"`                   // Строка отступа
	Prefix          string          `json:"prefix"`                   // Префикс
	EscapeHTML      bool            `json:"escape_html"`              // Экранирование HTML
	SortKeys        bool            `json:"sort_keys"`                // Сортировка ключей
	ValidateUTF8    bool            `json:"validate_utf8"`            // Проверка UTF-8
	MaxDepth        int             `json:"max_depth"`                // Максимальная глубина кодирования
	DisallowUnknown bool            `json:"disallow_unknown"`         // Запретить неизвестные поля
	FloatPrecision  int             `json:"float_precision"`          // Точность чисел с плавающей точкой (-1 = автоматически)
	FloatTruncate   bool            `json:"float_truncate"`           // Усечение чисел с плавающей точкой
	DisableEscaping bool            `json:"disable_escaping"`         // Отключить экранирование
	EscapeUnicode   bool            `json:"escape_unicode"`           // Экранирование Unicode
	EscapeSlash     bool            `json:"escape_slash"`             // Экранирование слэшей
	EscapeNewlines  bool            `json:"escape_newlines"`          // Экранирование переводов строк
	EscapeTabs      bool            `json:"escape_tabs"`              // Экранирование табуляции
	IncludeNulls    bool            `json:"include_nulls"`            // Включать значения null
	CustomEscapes   map[rune]string `json:"custom_escapes,omitempty"` // Пользовательская карта экранирования

	// ===== Наблюдаемость =====
	EnableMetrics     bool `json:"enable_metrics"`      // Включить сбор метрик
	EnableHealthCheck bool `json:"enable_health_check"` // Включить проверку здоровья

	// ===== Обработка больших файлов =====
	ChunkSize       int64 `json:"chunk_size"`       // Размер блока
	MaxMemory       int64 `json:"max_memory"`       // Максимальное использование памяти
	BufferSize      int   `json:"buffer_size"`      // Размер буфера
	SamplingEnabled bool  `json:"sampling_enabled"` // Включить выборку
	SampleSize      int   `json:"sample_size"`      // Количество элементов выборки

	// ===== Конфигурация JSONL =====
	JSONLBufferSize    int   `json:"jsonl_buffer_size"`     // Размер буфера JSONL
	JSONLMaxLineSize   int   `json:"jsonl_max_line_size"`   // Максимальный размер строки JSONL
	JSONLSkipEmpty     bool  `json:"jsonl_skip_empty"`      // Пропускать пустые строки
	JSONLSkipComments  bool  `json:"jsonl_skip_comments"`   // Пропускать строки с комментариями
	JSONLContinueOnErr bool  `json:"jsonl_continue_on_err"` // Продолжать при ошибке
	JSONLWorkers       int   `json:"jsonl_workers"`         // Количество параллельных worker'ов JSONL
	JSONLChunkSize     int   `json:"jsonl_chunk_size"`      // Размер блока JSONL
	JSONLMaxMemory     int64 `json:"jsonl_max_memory"`      // Максимальная память JSONL

	// ===== Параметры слияния =====
	MergeMode MergeMode `json:"merge_mode"` // Стратегия слияния

	// ===== Точки расширения (без JSON-тегов, не участвуют в сериализации) =====
	CustomEncoder               CustomEncoder                // Пользовательский кодировщик
	CustomTypeEncoders          map[reflect.Type]TypeEncoder // Кодировщики пользовательских типов
	CustomValidators            []Validator                  // Пользовательские валидаторы
	AdditionalDangerousPatterns []DangerousPattern           // Дополнительные опасные паттерны
	DisableDefaultPatterns      bool                         // Отключить паттерны уровня предупреждения по умолчанию
	Hooks                       []Hook                       // Хуки операций
	CustomPathParser            PathParser                   // Пользовательный парсер путей
}
```

::: warning Контракт CacheSharedResults
Когда `CacheSharedResults` равен `true`, попадания кэша в `Get`/`GetFromParsed` **возвращают значение из кэша напрямую**, пропуская защитное глубокое копирование (быстрее, меньше аллокаций). При этом **вызывающая сторона не должна изменять** возвращённые `map[string]any`/`[]any`, иначе это разрушит разделяемый кэш и повлияет на последующие чтения; примитивные значения (`bool`, `float64`, `string`, `json.Number`, `nil`) неизменяемы и всегда безопасны. По умолчанию `false` сохраняет безопасное поведение «копирование при чтении»; включайте только если вызывающая сторона рассматривает результат как read-only (например, рабочие нагрузки с многократным чтением одного большого поддерева).
:::

::: warning Статус подключения расширений
Четыре интерфейсных поля `CustomEncoder`, `CustomTypeEncoders`, `CustomValidators`, `CustomPathParser` в текущей версии объявлены, но **ещё не подключены** к конвейеру кодирования/операций — их установка не даёт эффекта; это интерфейсы, зарезервированные для будущих версий (`CustomPathParser` уже участвует в определении «установлен ли» для ключа кэша процессора, но сам разбор путей по-прежнему идёт через встроенный парсер). Доступные сейчас альтернативы:

- Тонкая настройка кодирования → `CustomEscapes` (**работает**, см. параметры кодирования ниже) или реализация `json.Marshaler`/`encoding.TextMarshaler` (см. [Пользовательский кодировщик](../extensions/custom-encoder))
- Перехват операций → `Hooks` + `AddHook` (**работает**, см. [Система хуков Hook](../extensions/hooks))
- Валидация ввода → `ValidateSchema` (см. [Валидация Schema](./schema))
:::

## Сводная таблица полей Config

Всего `Config` содержит 66 экспортируемых полей, сгруппированных ниже по назначению. Значения по умолчанию взяты из [`DefaultConfig()`](#defaultconfig); допустимые диапазоны полей и правила автоисправления см. в [Краткой справке по диапазонам ограничения](#validatewithwarnings).

### Кэш

| Поле                  | Тип             | По умолчанию | Описание                                                                       |
| --------------------- | --------------- | ------------ | ------------------------------------------------------------------------------ |
| `MaxCacheSize`        | `int`           | 128          | Максимальное количество записей в кэше (0 — отключить кэш)                     |
| `CacheTTL`            | `time.Duration` | 5 минут      | Время жизни записи кэша                                                        |
| `EnableCache`         | `bool`          | true         | Включать ли кэш                                                                |
| `CacheResults`        | `bool`          | true         | Кэшировать ли результаты операций (кэш по операциям)                           |
| `CacheSharedResults`  | `bool`          | false        | При попадании в кэш возвращается разделяемое значение напрямую, без защитного глубокого копирования; вызывающая сторона не должна изменять возвращённые контейнеры (контракт — в предупреждении выше) |

### Ограничения размеров

| Поле           | Тип    | По умолчанию | Описание                                                                  |
| -------------- | ------ | ------------ | ------------------------------------------------------------------------- |
| `MaxJSONSize`  | `int64` | 100MB        | Максимальный размер входного JSON (в байтах)                              |
| `MaxPathDepth` | `int`  | 50           | Максимальная глубина пути                                                 |
| `MaxBatchSize` | `int`  | 2000         | Верхний предел операций в одном пакете (при превышении ввод отклоняется — защита от исчерпания памяти) |

### Ограничения безопасности

| Поле                        | Тип    | По умолчанию | Описание                                                                                                                              |
| --------------------------- | ------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `MaxNestingDepthSecurity`   | `int`   | 200          | Максимальная глубина вложенности                                                                                                      |
| `MaxSecurityValidationSize` | `int64` | 10MB         | Максимальный размер для проверки безопасности (при превышении сканирование по стратегии выборки, если только `FullSecurityScan` не равен true) |
| `MaxObjectKeys`             | `int`   | 100000       | Максимальное количество ключей одного объекта                                                                                         |
| `MaxArrayElements`          | `int`   | 100000       | Максимальное количество элементов одного массива                                                                                      |
| `FullSecurityScan`          | `bool`  | false        | при `true` полное (без выборки) сканирование безопасности всех входов; при `false` большие входы (>4KB) сканируются скользящим окном с выборкой, при этом ключевые шаблоны (вроде `__proto__`) по-прежнему сканируются полностью |

### Конкурентность

| Поле                | Тип  | По умолчанию | Описание                                                                |
| ------------------- | ---- | ------------ | ----------------------------------------------------------------------- |
| `MaxConcurrency`    | `int` | 50           | Максимальный уровень конкурентности                                     |
| `ParallelThreshold` | `int` | 10           | Порог параллельной обработки (при меньшем количестве элементов — последовательная обработка) |

### Параметры обработки

| Поле               | Тип   | По умолчанию | Описание                                                    |
| ------------------ | ----- | ------------ | ------------------------------------------------------------ |
| `EnableValidation` | `bool` | true         | Включить валидацию ввода                                     |
| `StrictMode`       | `bool` | false        | Строгий режим (более консервативный разбор и перехват)       |
| `CreatePaths`      | `bool` | true         | Автоматическое создание недостающих промежуточных путей при Set |
| `CleanupNulls`     | `bool` | false        | Очистка значений null                                        |
| `CompactArrays`    | `bool` | false        | Уплотнение массивов                                          |
| `ContinueOnError`  | `bool` | false        | Продолжать выполнение при ошибке отдельной операции в пакете |

### Параметры ввода/вывода

| Поле               | Тип   | По умолчанию | Описание                                                                  |
| ------------------ | ----- | ------------ | -------------------------------------------------------------------------- |
| `AllowComments`    | `bool` | false        | Разрешить комментарии (зарезервированное поле, сейчас не меняет поведение) |
| `PreserveNumbers`  | `bool` | false        | Сохранять литералы чисел при декодировании (`1.10` не превращается в `1.1`), при кодировании записываются как есть |
| `ValidateInput`    | `bool` | true         | Валидировать входной JSON                                                  |
| `ValidateFilePath` | `bool` | true         | Валидировать пути файлов                                                   |
| `SkipValidation`   | `bool` | false        | Пропускать необязательные проверки (только для доверенного ввода)          |

### Параметры кодирования

| Поле              | Тип              | По умолчанию     | Описание                                                                  |
| ----------------- | ----------------- | ---------------- | -------------------------------------------------------------------------- |
| `Pretty`          | `bool`            | false            | Форматированный вывод                                                      |
| `Indent`          | `string`          | `"  "` (два пробела) | Строка отступа                                                         |
| `Prefix`          | `string`          | `""` (пусто)     | Префикс каждой строки                                                      |
| `EscapeHTML`      | `bool`            | true             | Экранирование HTML-символов (`<` `>` `&`)                                  |
| `SortKeys`        | `bool`            | false            | Сортировка ключей объекта при выводе                                       |
| `ValidateUTF8`    | `bool`            | true             | Проверка UTF-8 (зарезервированное поле, сейчас не меняет поведение)        |
| `MaxDepth`        | `int`             | 100              | Максимальная глубина кодирования (0 — без ограничений)                     |
| `DisallowUnknown` | `bool`            | false            | Запрет неизвестных полей при декодировании (эквивалент `Decoder.DisallowUnknownFields()`) |
| `FloatPrecision`  | `int`             | -1               | Точность чисел с плавающей точкой (-1 — автоматически; 0–15 — явная точность) |
| `FloatTruncate`   | `bool`            | false            | При действующей точности прямое усечение вместо округления                 |
| `DisableEscaping` | `bool`            | false            | Отключить логику экранирования (использовать только при полностью контролируемом выводе) |
| `EscapeUnicode`   | `bool`            | false            | Преобразование не-ASCII символов в `\uXXXX`                                 |
| `EscapeSlash`     | `bool`            | false            | Экранирование `/` в `\/`                                                   |
| `EscapeNewlines`  | `bool`            | true             | Экранирование переводов строк                                              |
| `EscapeTabs`      | `bool`            | true             | Экранирование табуляции                                                    |
| `IncludeNulls`    | `bool`            | true             | Включать при кодировании поля со значением null                            |
| `CustomEscapes`   | `map[rune]string` | nil              | Пользовательская карта экранирования символов                              |

### Наблюдаемость

| Поле                | Тип   | По умолчанию | Описание                                                                          |
| ------------------- | ----- | ------------ | ---------------------------------------------------------------------------------- |
| `EnableMetrics`     | `bool` | false        | Включить сбор метрик (только тогда `GetStats` / `GetHealthStatus` содержат данные) |
| `EnableHealthCheck` | `bool` | false        | Включить проверку здоровья (зарезервированное поле, сейчас не меняет поведение)    |

### Обработка больших файлов (выборка и потоковая обработка)

| Поле              | Тип    | По умолчанию | Описание                                                       |
| ----------------- | ------- | ------------ | --------------------------------------------------------------- |
| `ChunkSize`       | `int64` | 1MB          | Размер блока больших файлов                                     |
| `MaxMemory`       | `int64` | 100MB        | Максимальная память при обработке больших файлов                |
| `BufferSize`      | `int`   | 64KB         | Размер буфера чтения больших файлов                             |
| `SamplingEnabled` | `bool`  | true         | Включить выборку (зарезервированное поле, сейчас не меняет поведение) |
| `SampleSize`      | `int`   | 1000         | Количество элементов выборки                                    |

### Конфигурация JSONL

| Поле                 | Тип    | По умолчанию | Описание                                        |
| --------------------- | ------- | ------------ | ------------------------------------------------ |
| `JSONLBufferSize`     | `int`   | 64KB         | Размер буфера чтения JSONL                       |
| `JSONLMaxLineSize`    | `int`   | 1MB          | Максимальный размер одной строки JSONL           |
| `JSONLSkipEmpty`      | `bool`  | true         | Пропускать пустые строки                         |
| `JSONLSkipComments`   | `bool`  | false        | Пропускать строки с комментариями `#` / `//`     |
| `JSONLContinueOnErr`  | `bool`  | false        | Продолжать обработку следующих строк при ошибке разбора |
| `JSONLWorkers`        | `int`   | 4            | Количество параллельных worker'ов JSONL          |
| `JSONLChunkSize`      | `int`   | 1000         | Размер блока пакетной обработки (в строках)      |
| `JSONLMaxMemory`      | `int64` | 100MB        | Максимальная память обработки JSONL              |

### Параметры слияния

| Поле        | Тип         | По умолчанию | Описание                                                                          |
| ----------- | ----------- | ------------ | ---------------------------------------------------------------------------------- |
| `MergeMode` | `MergeMode` | MergeUnion   | Стратегия слияния для `MergeJSON` / `MergeMany` (см. [Режимы слияния](#режимы-слияния)) |

### Точки расширения

Следующие поля не имеют JSON-тегов и не участвуют в сериализации; статус подключения — в предупреждении выше.

| Поле                          | Тип                               | По умолчанию | Описание                                                                  |
| ----------------------------- | ---------------------------------- | ------------ | -------------------------------------------------------------------------- |
| `CustomEncoder`               | `CustomEncoder`                    | nil          | Пользовательский кодировщик, заменяет кодировщик по умолчанию (зарезервировано) |
| `CustomTypeEncoders`          | `map[reflect.Type]TypeEncoder`     | nil          | Кодировщики, регистрируемые по Go-типам (зарезервировано)                  |
| `CustomValidators`            | `[]Validator`                      | nil          | Пользовательские валидаторы, выполняемые перед операциями (зарезервировано) |
| `AdditionalDangerousPatterns` | `[]DangerousPattern`               | nil          | Опасные шаблоны, добавляемые поверх встроенных                             |
| `DisableDefaultPatterns`      | `bool`                             | false        | Отключает встроенные шаблоны уровня предупреждения (ключевые шаблоны применяются всегда и не отключаются) |
| `Hooks`                       | `[]Hook`                           | nil          | Хуки до и после операций (работает)                                        |
| `CustomPathParser`            | `PathParser`                       | nil          | Пользовательский парсер путей (зарезервировано)                            |

## Подробный разбор параметров кодирования

Параметры кодирования (`Pretty`/`Indent`/`EscapeHTML`/`SortKeys`/`FloatPrecision` и др.) управляют формой вывода серий `Marshal`/`Encode`. Значения по умолчанию выровнены со стандартной библиотекой (например, `EscapeHTML: true`, `IncludeNulls: true`); при установке любого «нестандартного» параметра кодирования библиотека автоматически переключается на внутренний путь пользовательского кодировщика — ручное вмешательство не требуется.

### Сортировка ключей (SortKeys)

```go
cfg := json.DefaultConfig()
cfg.SortKeys = true
s, _ := json.EncodeWithConfig(map[string]any{"b": 2, "a": 1}, cfg)
// Вывод: {"a":1,"b":2} — стабильный порядок ключей, удобно для сравнения и тестирования
```

### Точность чисел с плавающей точкой (FloatPrecision / FloatTruncate)

```go
cfg := json.DefaultConfig()
cfg.FloatPrecision = 2 // -1 (по умолчанию) = автоматическая точность
s, _ := json.EncodeWithConfig(3.14159265, cfg)
// Вывод: 3.14
```

`FloatTruncate` управляет способом округления при действующем `FloatPrecision`: по умолчанию (`false`) — стандартное округление; при `true` — **прямое усечение**: `3.999` при точности 2 выводится как `3.99` (при округлении получилось бы `4.00`). Участвует в кодировании только при `FloatPrecision >= 0`.

### Пользовательское экранирование символов (CustomEscapes)

```go
cfg := json.DefaultConfig()
cfg.CustomEscapes = map[rune]string{
	'<': "&lt;",
}
s, _ := json.EncodeWithConfig("<a>", cfg)
// Вывод: "&lt;a>"
```

### Краткая справка по частым переключателям

| Параметр | По умолчанию | Эффект при переключении |
|------|------|-------------------|
| `EscapeHTML` | `true` | при `false` `<` `>` `&` не экранируются |
| `EscapeUnicode` | `false` | при `true` не-ASCII символы преобразуются в `\uXXXX` |
| `EscapeSlash` | `false` | при `true` `/` экранируется в `\/` |
| `EscapeNewlines` / `EscapeTabs` | `true` | при `false` управляющие символы выводятся напрямую (осторожно при генерации JSONL-совместимого текста) |
| `DisableEscaping` | `false` | при `true` логика экранирования пропускается (использовать только при полностью контролируемом выводе) |
| `IncludeNulls` | `true` | при `false` при кодировании опускаются поля со значением `null` |
| `PreserveNumbers` | `false` | при `true` при декодировании сохраняются литералы чисел (`1.10` не превращается в `1.1`), при кодировании записываются как есть |

## Переключатели ввода и наблюдаемости

Следующие поля управляют строгостью декодирования и наблюдаемостью в рантайме (значения по умолчанию см. в [`DefaultConfig`](#defaultconfig)):

| Поле | По умолчанию | Область действия | Описание |
|------|------|----------|------|
| `DisallowUnknown` | `false` | `NewDecoder(r, cfg)` | при `true` эквивалентно вызову `DisallowUnknownFields()` для возвращённого Decoder; декодирование ошибочно при неизвестных полях |
| `ValidateUTF8` | `true` | зарезервировано | в текущей версии не меняет поведение (см. примечание ниже) |
| `AllowComments` | `false` | зарезервировано | в текущей версии не меняет поведение (см. примечание ниже) |
| `EnableMetrics` | `false` | при конструировании `New(cfg)` | при `true` создаётся сборщик метрик; только тогда счётчики операций/ошибок `GetStats` и поэлементные проверки `GetHealthStatus` содержат данные |
| `EnableHealthCheck` | `false` | зарезервировано | в текущей версии не меняет поведение (см. примечание ниже) |
| `SamplingEnabled` | `true` | зарезервировано | в текущей версии не меняет поведение (см. примечание ниже) |

::: warning Примечание о зарезервированных полях
Четыре поля `AllowComments`, `ValidateUTF8`, `EnableHealthCheck`, `SamplingEnabled` объявлены и участвуют в сравнении конфигураций и хэшировании (поэтому кэши процессоров для разных cfg различаются), но в текущей версии **не читаются** соответствующими конвейерами, и их установка не меняет поведение:

- `AllowComments`: не заставит парсер принимать комментарии `//` или `#`; строки с комментариями в файлах JSONL управляются отдельно через `JSONLSkipComments`.
- `ValidateUTF8`: отклонение недействительного UTF-8 на стороне ввода — безусловное поведение проверки безопасности; на стороне вывода обработка следует семантике стандартной библиотеки — этот переключатель ни на что не влияет.
- `EnableHealthCheck`: проверка здоровья выполняется по запросу через `GetHealthStatus`; наличие данных зависит от `EnableMetrics` (см. [Жизненный цикл и статистика](./processor/lifecycle#проверка-здоровья)).
- `SamplingEnabled`: выборка при сканировании безопасности больших входных данных определяется `FullSecurityScan` и `MaxSecurityValidationSize`.
:::

## Пресеты конфигурации

### DefaultConfig

Сигнатура: `func DefaultConfig() Config`

Возвращает конфигурацию по умолчанию, подходящую для большинства сценариев.

```go
cfg := json.DefaultConfig()
processor, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer processor.Close()
```

**Значения по умолчанию**

| Поле | Значение | Описание |
|------|-----|------|
| MaxJSONSize | 100MB | Лимит размера JSON |
| MaxNestingDepthSecurity | 200 | Глубина вложенности |
| MaxPathDepth | 50 | Глубина пути |
| MaxSecurityValidationSize | 10MB | Верхний предел размера проверки безопасности |
| MaxObjectKeys | 100000 | Максимальное количество ключей объекта |
| MaxArrayElements | 100000 | Максимальное количество элементов массива |
| MaxConcurrency | 50 | Уровень конкурентности |
| ParallelThreshold | 10 | Ниже этого количества элементов — переход на последовательную обработку |
| MaxBatchSize | 2000 | Количество пакетных операций |
| CacheTTL | 5 минут | Истечение срока кэша |
| MaxCacheSize | 128 | Максимальное количество записей в кэше |
| EnableCache | true | Включить кэш |
| CacheResults | true | Кэшировать результаты операций |
| CacheSharedResults | false | Разделяемые результаты кэша (высокопроизводительные сценарии read-only) |
| EnableValidation | true | Включить валидацию |
| StrictMode | false | Нестрогий режим |
| FullSecurityScan | false | Выборочное сканирование безопасности (не полное) |
| ValidateInput | true | Валидировать ввод |
| ValidateFilePath | true | Валидировать пути файлов |
| CreatePaths | true | Автоматическое создание путей |
| Pretty | false | Без форматированного вывода |
| EscapeHTML | true | Экранирование HTML |
| ValidateUTF8 | true | Проверка UTF-8 |
| IncludeNulls | true | Включать null |
| EscapeNewlines | true | Экранирование переводов строк |
| EscapeTabs | true | Экранирование табуляции |
| FloatPrecision | -1 | Автоматическая точность |
| MaxDepth | 100 | Глубина кодирования |
| Indent | "  " | Отступ по умолчанию |
| ChunkSize | 1MB | Размер блока |
| MaxMemory | 100MB | Максимальная память |
| BufferSize | 64KB | Размер буфера |
| SamplingEnabled | true | Включить выборку |
| SampleSize | 1000 | Количество элементов выборки |
| JSONLBufferSize | 64KB | Размер буфера JSONL |
| JSONLMaxLineSize | 1MB | Максимальный размер строки JSONL |
| JSONLSkipEmpty | true | Пропускать пустые строки |
| JSONLSkipComments | false | Не пропускать комментарии |
| JSONLContinueOnErr | false | Остановка при ошибке |
| JSONLWorkers | 4 | Количество параллельных worker'ов |
| JSONLChunkSize | 1000 | Размер блока JSONL |
| JSONLMaxMemory | 100MB | Максимальная память JSONL |
| MergeMode | MergeUnion | Слияние-объединение |

### SecurityConfig

Сигнатура: `func SecurityConfig() Config`

Возвращает конфигурацию безопасности, подходящую для обработки недоверенного ввода.

```go
// Рекомендуется для:
// - публичных API и веб-сервисов
// - данных, отправляемых пользователями
// - внешних Webhook
// - эндпоинтов аутентификации
// - обработки финансовых данных
cfg := json.SecurityConfig()
processor, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer processor.Close()
```

**Особенности конфигурации безопасности**

| Поле | Значение | Описание |
|------|-----|------|
| MaxNestingDepthSecurity | 30 | Консервативная глубина вложенности |
| MaxSecurityValidationSize | 10MB | Размер проверки безопасности |
| MaxObjectKeys | 5000 | Консервативный лимит ключей |
| MaxArrayElements | 5000 | Консервативный лимит элементов |
| MaxJSONSize | 10MB | Консервативный лимит размера |
| MaxPathDepth | 30 | Консервативная глубина пути |
| FullSecurityScan | true | Полное сканирование безопасности |
| StrictMode | true | Строгий режим |
| EnableValidation | true | Включить валидацию |
| EnableCache | true | Включить кэш |
| MaxCacheSize | 256 | Размер кэша |
| CacheTTL | 3 минуты | Более короткий TTL |

### PrettyConfig

Сигнатура: `func PrettyConfig() Config`

Возвращает конфигурацию форматированного вывода.

```go
result, err := json.EncodeWithConfig(data, json.PrettyConfig())
```

## Методы конфигурации

### Clone

Сигнатура: `func (c *Config) Clone() *Config`

Глубокое копирование конфигурации (`Config.Clone` возвращает новый `*Config`; изменение копии не влияет на исходную конфигурацию). Поля-значения копируются поэлементно; из ссылочных полей два map — `CustomEscapes`, `CustomTypeEncoders` — и три среза — `CustomValidators`, `AdditionalDangerousPatterns`, `Hooks` — копируются глубоко и могут изменяться независимо; интерфейсные поля (`CustomEncoder`, `CustomPathParser`) копируются поверхностно (обычно это реализации без состояния или синглтоны). Вызов на nil Config возвращает nil.

```go
cfg := json.DefaultConfig()
cfgCopy := cfg.Clone()
cfgCopy.EnableValidation = true // Не влияет на исходную конфигурацию
```

### Validate

Сигнатура: `func (c *Config) Validate() error`

Валидирует конфигурацию и автоматически исправляет недействительные значения. Метод **изменяет Config на месте**, приводя недопустимые поля в допустимый диапазон: слишком малые (≤0) заменяются минимумом, слишком большие (выше верхнего предела) — максимумом. Вызов на nil Config возвращает ошибку. После исправления всегда возвращает nil — чтобы увидеть, что было исправлено, используйте `ValidateWithWarnings`.

```go
cfg := json.DefaultConfig()
cfg.MaxJSONSize = -1 // Недействительное значение
if err := cfg.Validate(); err != nil {
	panic(err)
}
// MaxJSONSize будет исправлено на месте на минимальное значение
```

### ValidateWithWarnings

Сигнатура: `func (c *Config) ValidateWithWarnings() []ConfigWarning`

Валидирует конфигурацию и возвращает список предупреждений об исправлениях.

```go
cfg := json.DefaultConfig()
cfg.MaxJSONSize = -1
warnings := cfg.ValidateWithWarnings()
for _, w := range warnings {
	fmt.Printf("%s: %s\n", w.Field, w.Reason)
}
```

**Краткая справка по диапазонам ограничения** (правила автоисправления `Validate`/`ValidateWithWarnings`: ≤0 считается недействительным и заменяется нижним пределом, выше верхнего предела — верхним):

| Поле | Допустимый диапазон (нижний–верхний предел) | Примечание |
|------|----------------------|------|
| `MaxJSONSize` | 1MB – 100MB | int64 |
| `MaxPathDepth` | 10 – 200 | |
| `MaxNestingDepthSecurity` | 10 – 200 | |
| `MaxConcurrency` | 1 – 200 | |
| `ParallelThreshold` | 1 – 50 | |
| `MaxObjectKeys` | 100 – 100000 | |
| `MaxArrayElements` | 100 – 100000 | |
| `MaxSecurityValidationSize` | 1MB – 100MB | int64 |
| `MaxBatchSize` | 10 – 10000 | |
| `MaxCacheSize` | 0 – 2000 (недействительны только отрицательные) | при отрицательном значении устанавливается 0 и **одновременно выключается EnableCache** (0 означает отключение кэша, это допустимо) |
| `CacheTTL` | ≤0 недействительно, сбрасывается в `DefaultCacheTTL` (5 минут) | |
| `MaxDepth` | [0, 1000], вне диапазона сбрасывается в 100 | 0 означает неограниченную глубину, отрицательные значения недействительны |
| `FloatPrecision` | [-1, 15], вне диапазона сбрасывается в -1 | -1 — сигнатурное значение автоматической точности |
| `ChunkSize` | 64KB – 100MB | |
| `MaxMemory` | 10MB – 1GB | |
| `BufferSize` | 4KB – 1MB | |
| `SampleSize` | 100 – 10000 | |
| `JSONLBufferSize` | 4KB – 1MB | |
| `JSONLMaxLineSize` | 1KB – 100MB | |
| `JSONLWorkers` | 1 – 64 | |
| `JSONLChunkSize` | 100 – 10000 | |
| `JSONLMaxMemory` | 10MB – 1GB | int64 |

### Тип ConfigWarning

`ConfigWarning` содержит сведения об автоисправлениях, выполненных во время валидации конфигурации.

```go
type ConfigWarning struct {
	Field    string // Имя исправленного поля
	OldValue any    // Исходное значение (для недействительного может быть nil)
	NewValue any    // Значение после исправления
	Reason   string // Причина исправления
}
```

| Поле | Тип | Описание |
|------|------|------|
| `Field` | `string` | Имя исправленного поля (например, `MaxJSONSize`) |
| `OldValue` | `any` | Значение до исправления (для недействительного может быть nil) |
| `NewValue` | `any` | Значение после исправления |
| `Reason` | `string` | Причина исправления (например, ниже нижнего предела, выше верхнего) |

### Тип SecurityLimits

`SecurityLimits` объединяет связанные с безопасностью поля ограничений из Config.

```go
type SecurityLimits struct {
	MaxNestingDepth           int   `json:"max_nesting_depth"`
	MaxSecurityValidationSize int64 `json:"max_security_validation_size"`
	MaxObjectKeys             int   `json:"max_object_keys"`
	MaxArrayElements          int   `json:"max_array_elements"`
	MaxJSONSize               int64 `json:"max_json_size"`
	MaxPathDepth              int   `json:"max_path_depth"`
}
```

| Поле                      | Тип    | Описание                                                                   |
| ------------------------- | ------- | --------------------------------------------------------------------------- |
| `MaxNestingDepth`         | `int`   | Максимальная глубина вложенности (соответствует `Config.MaxNestingDepthSecurity`) |
| `MaxSecurityValidationSize` | `int64` | Максимальный размер для проверки безопасности (соответствует `Config.MaxSecurityValidationSize`) |
| `MaxObjectKeys`           | `int`   | Максимальное количество ключей объекта (соответствует `Config.MaxObjectKeys`) |
| `MaxArrayElements`        | `int`   | Максимальное количество элементов массива (соответствует `Config.MaxArrayElements`) |
| `MaxJSONSize`             | `int64` | Максимальный размер JSON (соответствует `Config.MaxJSONSize`)               |
| `MaxPathDepth`            | `int`   | Максимальная глубина пути (соответствует `Config.MaxPathDepth`)             |

### AddHook

Сигнатура: `func (c *Config) AddHook(hook Hook)`

Добавляет хук операций.

```go
cfg := json.DefaultConfig()
cfg.AddHook(json.LoggingHook(slog.Default()))
```

### AddValidator

Сигнатура: `func (c *Config) AddValidator(validator Validator)`

Добавляет пользовательский валидатор.

```go
cfg := json.DefaultConfig()
cfg.AddValidator(&MyValidator{})
```

### AddDangerousPattern

Сигнатура: `func (c *Config) AddDangerousPattern(pattern DangerousPattern)`

Добавляет дополнительный паттерн безопасности.

```go
cfg := json.DefaultConfig()
cfg.AddDangerousPattern(json.DangerousPattern{
	Pattern: "eval(",
	Name:    "eval-call",
	Level:   json.PatternLevelCritical,
})
```

## Примеры использования

### Базовое использование

```go
cfg := json.DefaultConfig()
processor, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer processor.Close()
```

### Конфигурация безопасности

```go
// Обработка недоверенного ввода
cfg := json.SecurityConfig()
processor, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer processor.Close()
```

### Форматированный вывод

```go
// Форматирование JSON
result, err := json.EncodeWithConfig(data, json.PrettyConfig())
```

### Пользовательская конфигурация

```go
cfg := json.DefaultConfig()

// Настройки безопасности
cfg.MaxJSONSize = 10 * 1024 * 1024 // 10MB
cfg.MaxNestingDepthSecurity = 50
cfg.EnableValidation = true

// Хуки
cfg.Hooks = []json.Hook{json.LoggingHook(slog.Default())}

// Валидаторы
cfg.CustomValidators = []json.Validator{&MyValidator{}}

processor, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer processor.Close()
```

### Клонирование и изменение

```go
// Создание вариантов на основе конфигурации по умолчанию
base := json.DefaultConfig()

// Вариант 1: конфигурация для разработки
devCfg := base.Clone()
devCfg.EnableMetrics = true

// Вариант 2: продукционная конфигурация
prodCfg := base.Clone()
prodCfg.EnableValidation = true
```

## Константы конфигурации

```go
const (
	// Ограничения размеров
	DefaultMaxJSONSize       = 100 * 1024 * 1024 // 100MB
	DefaultMaxNestingDepth   = 200
	DefaultMaxPathDepth      = 50
	DefaultMaxDepth          = 100 // Глубина вложенности кодирования/декодирования по умолчанию (Config.MaxDepth)
	DefaultMaxConcurrency    = 50
	DefaultMaxBatchSize      = 2000
	DefaultMaxSecuritySize   = 10 * 1024 * 1024 // 10MB
	DefaultMaxObjectKeys     = 100000
	DefaultMaxArrayElements  = 100000
	DefaultParallelThreshold = 10

	// Кэш
	DefaultCacheTTL = 5 * time.Minute
)
```

::: info Внутренние константы
Константы вроде лимита длины проверки пути (`maxPathLength`) переведены во внутреннюю реализацию и больше не экспортируются как публичный API. Соответствующие значения по умолчанию отражены в полях структуры `Config`.
:::

---

## Режимы слияния

`MergeMode` управляет стратегией слияния для функций `MergeJSON` и `MergeMany`.

`MergeMode` реализует `fmt.Stringer`: `func (m MergeMode) String() string` возвращает `"union"` / `"intersection"` / `"difference"` (для неизвестного значения — `"unknown(N)"`), что удобно для логов и отладочного вывода.

| Константа           | Значение | Возврат `String()`  |
| ------------------- | -------- | ------------------- |
| `MergeUnion`        | 0        | `"union"`           |
| `MergeIntersection` | 1        | `"intersection"`    |
| `MergeDifference`   | 2        | `"difference"`      |

### MergeUnion (по умолчанию)

Объединяет все ключи/элементы; при конфликте используется перекрывающее значение.

```go
cfg := json.DefaultConfig()
cfg.MergeMode = json.MergeUnion
result, err := json.MergeJSON(
	`{"a": 1, "b": 2}`,
	`{"b": 3, "c": 4}`,
	cfg,
)
// Результат: {"a": 1, "b": 3, "c": 4}
```

### MergeIntersection

Сохраняются только ключи, присутствующие в обоих объектах.

```go
cfg := json.DefaultConfig()
cfg.MergeMode = json.MergeIntersection
result, err := json.MergeJSON(
	`{"a": 1, "b": 2}`,
	`{"b": 3, "c": 4}`,
	cfg,
)
// Результат: {"b": 3}
```

### MergeDifference

Сохраняются только ключи, которые есть в базовом объекте, но отсутствуют в перекрывающем.

```go
cfg := json.DefaultConfig()
cfg.MergeMode = json.MergeDifference
result, err := json.MergeJSON(
	`{"a": 1, "b": 2}`,
	`{"b": 3, "c": 4}`,
	cfg,
)
// Результат: {"a": 1}
```

---

## Рекомендации по безопасности

| Параметр | Рекомендуемое значение | Описание |
|--------|--------|------|
| MaxJSONSize | 10-100MB | Корректируйте под память сервера |
| MaxNestingDepthSecurity | 30-50 | Защита от атак глубокой вложенности |
| MaxPathDepth | 30-50 | Ограничение сложности путей |
| EnableValidation | true | Всегда включать |
| FullSecurityScan | true (для недоверенного ввода) | Полное сканирование безопасности |

## См. также

- [Processor](./processor/) - методы процессора
- [Константы и ошибки](./constants) - константы конфигурации
- [Обзор безопасности](../security/) - лучшие практики безопасности
- [Определения интерфейсов](./interfaces) - интерфейсы расширения
