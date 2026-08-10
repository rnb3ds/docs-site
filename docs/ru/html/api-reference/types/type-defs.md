---
sidebar_label: "Типы данных"
title: "Типы данных - CyberGo html | структуры и поля"
description: "Типы данных CyberGo html: поля Result, ImageInfo, LinkInfo, LinkResource, Statistics, BatchResult и других ключевых структур."
sidebar_position: 2
---

# Определения типов

## Result

Результат извлечения, содержащий текст, метаданные и медиа-информацию.

```go
type Result struct {
    Text           string        `json:"text"`
    Title          string        `json:"title"`
    Images         []ImageInfo   `json:"images,omitempty"`
    Links          []LinkInfo    `json:"links,omitempty"`
    Videos         []VideoInfo   `json:"videos,omitempty"`
    Audios         []AudioInfo   `json:"audios,omitempty"`
    ProcessingTime time.Duration `json:"-"`       // Время обработки (не участвует в стандартной сериализации)
    WordCount      int           `json:"word_count"`
    ReadingTime    time.Duration `json:"-"`       // Расчётное время чтения (не участвует в стандартной сериализации)
}
```

### MarshalJSON

Пользовательская JSON-сериализация. Поля `ProcessingTime` и `ReadingTime` имеют тег `json:"-"` (стандартная сериализация их пропускает), но через пользовательский метод `MarshalJSON()` они выводятся в виде миллисекунд.

```go
func (r *Result) MarshalJSON() ([]byte, error)
```

:::warning Предупреждение
`Result` **не реализует `UnmarshalJSON`**. Если десериализовать вывод `MarshalJSON()` обратно в `Result`, поля типа duration — `ProcessingTime`, `ReadingTime` — **будут потеряны**: имена ключей в JSON-выводе (`processing_time_ms`, `reading_time_ms`) не совпадают с именами полей struct, поэтому восстановить их не получится.

Это **сделано намеренно**: данный JSON-формат предназначен для внешнего потребления (например, ответы API, логи, отображение во фронтенде), а не для двусторонней сериализации.
:::

## ImageInfo

Информация об изображении.

```go
type ImageInfo struct {
    URL          string `json:"url"`           // Адрес изображения
    Alt          string `json:"alt"`           // Альтернативный текст
    Title        string `json:"title"`         // Заголовок
    Width        string `json:"width"`         // Ширина
    Height       string `json:"height"`        // Высота
    IsDecorative bool   `json:"is_decorative"` // Является ли декоративным изображением
    Position     int    `json:"position"`      // Позиция в документе
}
```

### Семантика полей

| Поле | Описание |
|------|------|
| `URL` | Значение атрибута `src` изображения; включает только корректные URL (проверка через `IsValidURL`), `<img>` с некорректным URL не появится в результате |
| `Alt` | Исходный текст атрибута `alt`; если пуст, то `IsDecorative` равно `true` |
| `Title` | Исходный текст атрибута `title` (не заголовок страницы) |
| `Width`/`Height` | **Исходные строки** из HTML-атрибутов (например `"640"`, `"50%"`), не преобразованные в числа — написание на разных страницах может отличаться |
| `IsDecorative` | `true`, когда `Alt` пуст; можно использовать для выявления декоративных изображений и их пропуска |
| `Position` | Порядковый номер в документе (с 1); при `PreserveImages = false` весь срез `Images` пуст |

:::warning Width/Height — строковый тип
`Width` и `Height` имеют тип `string`, а не `int`, и сохраняют исходное представление из HTML-исходника (может содержать единицы измерения, проценты и т. д.). Преобразование в число выполняется вызывающей стороной.
:::

## LinkInfo

Информация о ссылке.

```go
type LinkInfo struct {
    URL        string `json:"url"`         // Адрес ссылки
    Text       string `json:"text"`        // Текст ссылки
    Title      string `json:"title"`       // Заголовок ссылки
    IsExternal bool   `json:"is_external"` // Является ли внешней ссылкой (определяется по тому, является ли URL сам по себе абсолютным внешним URL, а не сравнением с BaseURL)
    IsNoFollow bool   `json:"is_nofollow"` // Имеет ли nofollow
    Position   int    `json:"position"`    // Позиция в документе
}
```

### Семантика полей

| Поле | Описание |
|------|------|
| `URL` | Значение атрибута `href`; включает только корректные URL (проверка через `IsValidURL`), `<a>` с некорректным URL расходует Position, но не добавляется в срез |
| `Text` | Конкатенация всех текстовых узлов внутри тега `<a>` (рекурсивный `GetTextContent`) |
| `Title` | Исходный текст атрибута `title` (не текст ссылки) |
| `IsExternal` | Определяется по тому, является ли URL сам по себе абсолютным внешним адресом, **без сравнения доменов с `BaseURL`** — это отличается от определения внутренних/внешних ссылок в `ExtractAllLinks` |
| `IsNoFollow` | `true`, если атрибут `rel` содержит `nofollow` (без учёта регистра, ASCII-свёртка при сопоставлении) |
| `Position` | Порядковый номер в документе (с 1); некорректные `<a>` (недействительный или отсутствующий href) по-прежнему расходуют номер, но не добавляются в срез, поэтому Position может быть непоследовательным |

## VideoInfo

Информация о видео.

```go
type VideoInfo struct {
    URL      string `json:"url"`      // Адрес видео
    Type     string `json:"type"`     // Тип видео
    Poster   string `json:"poster"`   // Адрес обложки
    Width    string `json:"width"`    // Ширина
    Height   string `json:"height"`   // Высота
    Duration string `json:"duration"` // Длительность
}
```

### Правила значений поля Type

| Значение Type | Значение | Сценарий возникновения |
|---------|------|----------|
| `"embed"` | Видео-страница, на которую ссылается iframe | Встраиваемые плееры YouTube, Vimeo, Youku, Bilibili и др. |
| MIME-тип (например `"video/mp4"`) | Контейнер видеофайла | Значение атрибута `<source type="video/mp4">` |
| Пустая строка | Тип не обнаружен | `<video src="...">` напрямую указывает источник без дочерних элементов `<source>` |

:::tip Три источника извлечения видео
Извлечение видео выполняется в три шага: сканирование исходного HTML → обход DOM → резервное регулярное сканирование, с дедупликацией на каждом шаге. Подробнее см. [Руководство по извлечению медиа](../../guides/core-features/media-extraction).
:::

## AudioInfo

Информация об аудио.

```go
type AudioInfo struct {
    URL      string `json:"url"`      // Адрес аудио
    Type     string `json:"type"`     // Тип аудио
    Duration string `json:"duration"` // Длительность
}
```

### Правила значений поля Type

| Значение Type | Сценарий возникновения |
|---------|----------|
| MIME-тип (например `"audio/mpeg"`) | Значение атрибута `<source type="audio/mpeg">` |
| Пустая строка | `<audio src="...">` напрямую указывает источник без дочерних элементов `<source>` |

:::warning Двойственность расширения .ogg
Контейнер OGG может содержать видео или аудио, поэтому URL с `.ogg` появится одновременно в `Videos` и `Audios`. Только аудио-вариант `.oga` появится только в `Audios`.
:::

## LinkResource

Ссылочный ресурс (для API извлечения ссылок).

```go
type LinkResource struct {
    URL   string // Адрес ссылки
    Title string // Заголовок ссылки
    Type  string // Тип ссылки
}
```

## Statistics

Статистика обработки.

```go
type Statistics struct {
    TotalProcessed    int64         // Общее количество обработанных
    CacheHits         int64         // Попаданий в кэш
    CacheMisses       int64         // Промахов кэша
    ErrorCount        int64         // Количество ошибок
    AverageProcessTime time.Duration // Среднее время обработки
}
```

## BatchResult

Результат пакетной обработки.

```go
type BatchResult struct {
    Results   []*Result // Результаты извлечения, nil при неудаче или отмене
    Errors    []error   // Ошибки неудачных операций
    Success   int       // Количество успешных
    Failed    int       // Количество неудачных
    Cancelled int       // Количество отменённых
}
```

## NodeAttr

Атрибут HTML-узла.

```go
type NodeAttr struct {
    Key   string // Имя атрибута
    Value string // Значение атрибута
}
```
