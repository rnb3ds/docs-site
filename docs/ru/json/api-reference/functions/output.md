---
sidebar_label: "Кодирование и вывод"
title: "Функции кодирования и вывода - CyberGo JSON | Справочник API"
description: "Функции кодирования CyberGo JSON: Marshal/Unmarshal, Compact/Indent/HTMLEscape, Encode/EncodePretty/Prettify, фильтр EncodeFields, 100% замена encoding/json."
sidebar_position: 5
---

# Функции кодирования и вывода

Функции кодирования и декодирования пакета json: сериализация, десериализация, форматирование и кодирование с конфигурацией.

## Функции сериализации

### Marshal

Сигнатура: `func Marshal(value any, cfg ...Config) ([]byte, error)`

Сериализует значение Go в срез JSON-байтов. 100% совместим с `encoding/json.Marshal`: вызов `json.Marshal(v)` без cfg полностью идентичен стандартной библиотеке.

Необязательный хвостовой `Config` управляет поведением кодирования (отступы, обработка чисел и др.), образуя зеркальную пару уровня пакета/уровня экземпляра с `Processor.Marshal`.

```go
// Совместимость с encoding/json (без cfg)
data, err := json.Marshal(map[string]any{"name": "test"})
if err != nil {
	panic(err)
}
fmt.Println(string(data)) // {"name":"test"}

// С конфигурацией (необязательный параметр, не нарушает совместимость)
data, err = json.Marshal(value, json.PrettyConfig())
```

::: warning Вывод Marshal всегда экранирует HTML
Как и `encoding/json.Marshal`, вывод `Marshal` **всегда** проходит HTML-экранирование — даже при переданном `cfg.EscapeHTML = false` этот путь принудительно включает его. Когда поведением экранирования должен управлять вызывающий код, используйте [`EncodeWithConfig`](#encodewithconfig).
:::

### Unmarshal

Сигнатура: `func Unmarshal(data []byte, value any, cfg ...Config) error`

Десериализует срез JSON-байтов в значение Go. 100% совместим с `encoding/json.Unmarshal`: вызов `json.Unmarshal(data, &v)` без cfg полностью идентичен стандартной библиотеке.

Необязательный хвостовой `Config` управляет лимитами безопасности, сохранением чисел и др., образуя зеркало с `Processor.Unmarshal`.

```go
var result struct {
	Name string `json:"name"`
}
// Совместимость с encoding/json (без cfg)
err := json.Unmarshal([]byte(`{"name":"test"}`), &result)

// С конфигурацией
err = json.Unmarshal(data, &v, json.SecurityConfig())
```

::: tip Быстрый путь без cfg всё равно выполняет проверку безопасности
При вызове без cfg `Unmarshal` перед делегированием в `encoding/json` всё равно проверяет ввод по встроенным лимитам безопасности процессора (размер, глубина вложенности, опасные паттерны) — то есть даже как drop-in замена стандартной библиотеки он не обходит линию защиты.
:::

### MarshalIndent

Сигнатура: `func MarshalIndent(v any, prefix, indent string, cfg ...Config) ([]byte, error)`

Сериализация с отступами. 100% совместим с `encoding/json.MarshalIndent`: вызов `json.MarshalIndent(v, prefix, indent)` без cfg полностью идентичен стандартной библиотеке.

Необязательный хвостовой `Config` добавляет конфигурацию; параметры `prefix` и `indent` переопределяют соответствующие поля `Config`.

```go
// Совместимость с encoding/json (без cfg)
data, err := json.MarshalIndent(user, "", "  ")
if err != nil {
	panic(err)
}
fmt.Println(string(data))

// С конфигурацией
data, err = json.MarshalIndent(v, "", "  ", json.SecurityConfig())
```

## Функции форматирования

### Compact

Сигнатура: `func Compact(dst *bytes.Buffer, src []byte, cfg ...Config) error`

Сжимает JSON, удаляя ненужные пробельные символы, и записывает результат в `dst`. Совместим с `encoding/json.Compact` (вариант с buffer).

```go
var buf bytes.Buffer
err := json.Compact(&buf, []byte(`{"name": "test"}`))
if err != nil {
	panic(err)
}
fmt.Println(buf.String()) // {"name":"test"}
```

### CompactString

Сигнатура: `func CompactString(jsonStr string, cfg ...Config) (string, error)`

Сжимает JSON в форме «строка на входе/строка на выходе», удаляя ненужные пробельные символы. Зеркало `Processor.Compact` уровня пакета, симметричное `Prettify` (зеркалу `Processor.Prettify`).

::: info Асимметрия сигнатур: семейство Compact и зеркальная связь с Processor
Пакетный `Compact` сохраняет совместимую с `encoding/json.Compact` сигнатуру (вход — buffer), поэтому его имя **не совпадает** с версией-методом Processor — `Compact(jsonStr) (string, error)` на уровне пакета называется `CompactString`, а его buffer-вариант — `CompactBuffer`:

| Функция уровня пакета | Форма сигнатуры | Отражаемый метод Processor |
|----------|----------|------------------------|
| `Compact(dst *bytes.Buffer, src []byte)` | вход — buffer (совместимость с encoding/json) | `CompactBuffer(dst, src)` |
| `CompactString(jsonStr string) (string, error)` | строка на входе, строка на выходе | `Compact(jsonStr)` |
| `Prettify(jsonStr string) (string, error)` | строка на входе, строка на выходе | `Prettify(jsonStr)` |
:::

```go
compact, err := json.CompactString(`{
    "name": "Alice",
    "age": 30
}`)
// compact == `{"name":"Alice","age":30}`

// С конфигурацией (например, сохранение исходного формата чисел)
cfg := json.DefaultConfig()
cfg.PreserveNumbers = true
compact, err = json.CompactString(jsonStr, cfg)
```

### Indent

Сигнатура: `func Indent(dst *bytes.Buffer, src []byte, prefix, indent string, cfg ...Config) error`

Форматирует JSON с добавлением отступов и записывает результат в `dst`. Совместим с `encoding/json.Indent`.

```go
var buf bytes.Buffer
err := json.Indent(&buf, []byte(`{"name":"test"}`), "", "  ")
if err != nil {
	panic(err)
}
fmt.Println(buf.String())
// {
//   "name": "test"
// }
```

### HTMLEscape

Сигнатура: `func HTMLEscape(dst *bytes.Buffer, src []byte, cfg ...Config)`

Выполняет HTML-экранирование содержимого JSON: специальные символы `<`, `>`, `&` (а также U+2028, U+2029) заменяются соответствующими Unicode-последовательностями, результат записывается в `dst`. Возвращаемого значения нет.

```go
var buf bytes.Buffer
json.HTMLEscape(&buf, []byte(`{"html":"<script>alert(1)</script>"}`))
fmt.Println(buf.String())
// {"html":"\u003cscript\u003ealert(1)\u003c/script\u003e"}
```

### Prettify

Сигнатура: `func Prettify(jsonStr string, cfg ...Config) (string, error)`

Форматирует JSON-строку отступами красивой печати по умолчанию и возвращает отформатированную строку.

```go
pretty, err := json.Prettify(`{"name":"Alice","age":30}`)
if err != nil {
	panic(err)
}
fmt.Println(pretty)
// {
//   "name": "Alice",
//   "age": 30
// }
```

## Функции кодирования с конфигурацией

### Encode

<Badge type="danger" text="Устарело" />

Сигнатура: `func Encode(value any, cfg ...Config) (string, error)`

Кодирует значение Go в JSON-строку с поддержкой необязательного параметра конфигурации.

::: warning Устарело
`Encode` функционально полностью идентичен [`EncodeWithConfig`](#encodewithconfig) (оба делегируют одной реализации). Используйте `EncodeWithConfig` либо [`Marshal`](#marshal), если приемлем вывод в `[]byte`. `Encode` будет удалён в будущей мажорной версии.
:::

```go
result, err := json.Encode(user)
if err != nil {
	panic(err)
}
fmt.Println(result)
```

**С конфигурацией**

```go
result, err := json.Encode(user, json.SecurityConfig())
```

### EncodePretty

Сигнатура: `func EncodePretty(value any, cfg ...Config) (string, error)`

Кодирует значение Go в форматированную JSON-строку (с отступами) с поддержкой необязательного параметра конфигурации.

```go
result, err := json.EncodePretty(user)
if err != nil {
	panic(err)
}
fmt.Println(result)
```

**С конфигурацией**

```go
result, err := json.EncodePretty(user, json.PrettyConfig())
```

### EncodeWithConfig

Сигнатура: `func EncodeWithConfig(value any, cfg ...Config) (string, error)`

Кодирует значение Go в JSON-строку с указанной конфигурацией. Подходит для сценариев, требующих тонкого контроля над кодированием.

```go
// Использование конфигурации красивой печати
result, err := json.EncodeWithConfig(data, json.PrettyConfig())
if err != nil {
	panic(err)
}
fmt.Println(result)
```

**С конфигурацией безопасности**

```go
result, err := json.EncodeWithConfig(data, json.SecurityConfig())
```

## Функции пакетного кодирования

### EncodeBatch

Сигнатура: `func EncodeBatch(pairs map[string]any, cfg ...Config) (string, error)`

Пакетно кодирует пары ключ-значение в строку JSON-объекта. Эквивалентно `EncodeWithConfig(map[string]any(pairs), cfg)`; ключи выводятся в лексикографическом порядке (как в `encoding/json`).

```go
result, err := json.EncodeBatch(map[string]any{
	"name":  "Alice",
	"age":   30,
	"email": "alice@example.com",
})
if err != nil {
	panic(err)
}
fmt.Println(result) // {"age":30,"email":"alice@example.com","name":"Alice"}
```

### EncodeFields

Сигнатура: `func EncodeFields(value any, fields []string, cfg ...Config) (string, error)`

Кодирует только указанные поля, обеспечивая фильтрацию полей при выводе. Ключи, **фактически отсутствующие** в `fields`, молча игнорируются (выводится только пересечение); если `value` после кодирования не является JSON-объектом, возвращается `ErrTypeMismatch` (`value is not an object, cannot filter fields`).

```go
user := struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}{
	Name: "Alice", Email: "a@b.com", Password: "secret",
}

// Выводим только открытые поля
result, err := json.EncodeFields(user, []string{"name", "email"})
if err != nil {
	panic(err)
}
fmt.Println(result) // {"name":"Alice","email":"a@b.com"}
```

### EncodeStream

Сигнатура: `func EncodeStream(values any, cfg ...Config) (string, error)`

Кодирует несколько значений в поток-массив JSON (array stream). `values` обычно срез или перечислимая коллекция; на выходе JSON-массив вида `[v1,v2,...]`. Эквивалентно `EncodeWithConfig(values, cfg)`: когда `values` — срез, выводится JSON-массив; при передаче не-коллекции значение выводится само по себе по семантике `EncodeWithConfig`.

```go
values := []map[string]any{
	{"id": 1, "name": "Alice"},
	{"id": 2, "name": "Bob"},
}

result, err := json.EncodeStream(values)
if err != nil {
	panic(err)
}
fmt.Println(result)
```

## Методы форматирования Processor

Тип `Processor` предоставляет дополнительные методы форматирования. Создайте Processor через `json.New()` (возвращает `(*Processor, error)`):

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()
```

### Processor.CompactBuffer

Сигнатура: `func (p *Processor) CompactBuffer(dst *bytes.Buffer, src []byte, cfg ...Config) error`

Сжимает JSON-байты и записывает их в буфер `dst`. Пакетная функция `Compact` делегирует этому методу.

```go
var buf bytes.Buffer
err := p.CompactBuffer(&buf, []byte(`{"name": "Alice"}`))
// buf.String() => {"name":"Alice"}
```

### Processor.Indent

Сигнатура: `func (p *Processor) Indent(dst *bytes.Buffer, src []byte, prefix, indent string, cfg ...Config) error`

Записывает JSON с отступами в буфер `dst`. Совместим с `encoding/json.Indent`.

```go
var buf bytes.Buffer
err := p.Indent(&buf, []byte(`{"name":"Alice"}`), "", "  ")
```

### Processor.HTMLEscape

Сигнатура: `func (p *Processor) HTMLEscape(dst *bytes.Buffer, src []byte, cfg ...Config)`

Записывает HTML-экранированный JSON в буфер `dst`; возвращаемого значения нет. Совместим с `encoding/json.HTMLEscape`.

```go
var buf bytes.Buffer
p.HTMLEscape(&buf, []byte(`{"html":"<script>"}`))
```

:::tip
Полную документацию методов Processor см. в разделе [Processor](../processor/).
:::

## Потоковое кодирование и декодирование

`NewEncoder(w)` / `NewDecoder(r)` полностью совместимы с `encoding/json` (включая методы `SetIndent`, `SetEscapeHTML`, `UseNumber`, `Token` и др.), поддерживая потоковое кодирование/декодирование через `io.Writer`/`io.Reader`:

```go
// Потоковое кодирование в stdout
enc := json.NewEncoder(os.Stdout)
enc.SetIndent("", "  ")
_ = enc.Encode(user)

// Потоковое декодирование (последовательное чтение JSON-значений)
dec := json.NewDecoder(resp.Body)
for dec.More() {
	var msg Message
	if err := dec.Decode(&msg); err != nil {
		break
	}
}
```

:::tip
Полная таблица методов `Encoder`/`Decoder` приведена в [Определениях типов](../types#encoder-json-кодировщик).
:::

## Пресеты конфигурации

Следующие вспомогательные функции возвращают преднастроенные значения `Config`, которые можно передавать любой функции, принимающей `...Config`:

```go
// Конфигурация по умолчанию
cfg := json.DefaultConfig()

// Конфигурация красивой печати
cfg = json.PrettyConfig()

// Конфигурация безопасности
cfg = json.SecurityConfig()
```

:::tip
Полную документацию полей Config см. в разделе [Конфигурация](../config).
:::

## См. также

- [Функции запросов и получения](./query) - операции запросов Get, GetString и др.
- [Функции изменения](./modify) - операции изменения Set, Delete и др.
- [Файловые операции](./file-io) - файловые операции LoadFromFile, SaveToFile и др.
- [Конфигурация](../config) - тип Config и его параметры
- [Интерфейсы](../interfaces) - типы Processor, Encoder, Decoder
