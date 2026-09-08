---
sidebar_label: "Кодирование и вывод"
title: "Кодирование и вывод Processor - CyberGo JSON | API"
description: "Методы вывода CyberGo JSON Processor: Encode, EncodePretty, EncodeWithConfig, пакетные EncodeBatch/EncodeFields и форматирование Compact/Indent/HTMLEscape."
sidebar_position: 5
---

# Методы вывода

Processor предоставляет множество методов кодирования JSON для вывода.

## Базовый вывод

### Encode

<Badge type="danger" text="Устарело" />

Сигнатура: `func (p *Processor) Encode(value any, config ...Config) (string, error)`

Кодирует произвольное значение в JSON-строку.

::: warning Устарело
`Processor.Encode` напрямую делегирует [`EncodeWithConfig`](#encodewithconfig). Используйте `EncodeWithConfig`. `Encode` будет удалён в будущей мажорной версии.
:::

```go
result, err := p.Encode(map[string]any{"name": "CyberGo"})
if err != nil {
	panic(err)
}
fmt.Println(result)
```

### EncodePretty

Сигнатура: `func (p *Processor) EncodePretty(value any, config ...Config) (string, error)`

Кодирует произвольное значение в форматированную JSON-строку.

```go
result, err := p.EncodePretty(user)
if err != nil {
	panic(err)
}
```

## Расширенное кодирование

### EncodeWithConfig

Сигнатура: `func (p *Processor) EncodeWithConfig(value any, cfg ...Config) (string, error)`

Кодирует значение в JSON-строку с указанной конфигурацией.

**Параметры**

| Имя | Тип | Обязателен | Описание |
|------|------|------|------|
| `value` | `any` | да | Кодируемое значение |
| `cfg` | `Config` | нет | Конфигурация кодирования (необязательно) |

```go
// С PrettyConfig
result, err := p.EncodeWithConfig(data, json.PrettyConfig())

// С SecurityConfig
result, err = p.EncodeWithConfig(data, json.SecurityConfig())

// С пользовательской конфигурацией
cfg := json.DefaultConfig()
cfg.Pretty = true
cfg.SortKeys = true
cfg.EscapeHTML = true
result, err = p.EncodeWithConfig(data, cfg)
```

### EncodeBatch

Сигнатура: `func (p *Processor) EncodeBatch(pairs map[string]any, cfg ...Config) (string, error)`

Пакетно кодирует пары ключ-значение в JSON-объект.

```go
result, err := p.EncodeBatch(map[string]any{
	"name":    "CyberGo",
	"version": "1.0.0",
})
```

### EncodeFields

Сигнатура: `func (p *Processor) EncodeFields(value any, fields []string, cfg ...Config) (string, error)`

Кодирует только указанные поля; часто используется для частичной сериализации.

```go
type User struct {
	Name    string `json:"name"`
	Email   string `json:"email"`
	Private string `json:"private"`
}

user := User{Name: "CyberGo", Email: "test@example.com", Private: "secret"}
// Кодируем только поля name и email
result, err := p.EncodeFields(user, []string{"name", "email"})
```

### EncodeStream

Сигнатура: `func (p *Processor) EncodeStream(values any, cfg ...Config) (string, error)`

Кодирует несколько значений в поток-массив JSON (array stream). `values` обычно срез или перечислимая коллекция; на выходе JSON-массив вида `[v1,v2,...]`.

```go
values := []any{"item1", "item2", "item3"}
result, err := p.EncodeStream(values)
```

## Кодирование/декодирование

### Marshal

Сигнатура: `func (p *Processor) Marshal(value any, cfg ...Config) ([]byte, error)`

Кодирует значение Go в срез JSON-байтов. 100% совместим с `encoding/json.Marshal`.

::: tip Вывод всегда экранирует HTML
Как и `encoding/json.Marshal`, вывод этого метода **всегда** проходит HTML-экранирование — даже если переданный `cfg` задал `EscapeHTML=false`, на этом пути он будет переопределён. Когда экранированием должен управлять вызывающий код, используйте [`EncodeWithConfig`](#encodewithconfig).
:::

```go
data, err := p.Marshal(map[string]any{"name": "CyberGo"})
if err != nil {
	panic(err)
}
fmt.Println(string(data)) // {"name":"CyberGo"}
```

### MarshalIndent

Сигнатура: `func (p *Processor) MarshalIndent(value any, prefix, indent string, cfg ...Config) ([]byte, error)`

Кодирует значение Go в форматированный срез JSON-байтов. 100% совместим с `encoding/json.MarshalIndent`.

```go
data, err := p.MarshalIndent(user, "", "  ")
if err != nil {
	panic(err)
}
fmt.Println(string(data))
```

### Unmarshal

Сигнатура: `func (p *Processor) Unmarshal(data []byte, value any, cfg ...Config) error`

Парсит срез JSON-байтов в целевую переменную. 100% совместим с `encoding/json.Unmarshal`.

```go
var user User
err := p.Unmarshal([]byte(`{"name":"Alice","age":30}`), &user)
if err != nil {
	panic(err)
}
```

## Форматирование

### Prettify

Сигнатура: `func (p *Processor) Prettify(jsonStr string, cfg ...Config) (string, error)`

Форматирует JSON-строку с отступами. По умолчанию отступ 2 пробела; настраивается через поля `Indent` / `Prefix` в `cfg`.

```go
pretty, err := p.Prettify(`{"name":"Alice","age":30}`)
// Вывод:
// {
//   "name": "Alice",
//   "age": 30
// }

// Отступ в 4 пробела
cfg := json.DefaultConfig()
cfg.Indent = "    "
pretty, err = p.Prettify(`{"name":"Alice","age":30}`, cfg)
```

### Print (удалён)

::: warning Примечание к изменению API
Print, PrintE, PrintPretty, PrintPrettyE удалены из библиотеки и больше не предоставляются. Используйте следующие замены:

```go
// Компактный вывод
s, err := p.EncodeWithConfig(data)
if err != nil {
	log.Fatal(err)
}
fmt.Println(s)

// Форматированный вывод
pretty, err := p.EncodePretty(data)
if err != nil {
	log.Fatal(err)
}
fmt.Println(pretty)
```
:::

### ValidateSchema

Сигнатура: `func (p *Processor) ValidateSchema(jsonStr string, schema *Schema, cfg ...Config) ([]ValidationError, error)`

Проверяет, соответствуют ли JSON-данные указанной Schema. **Детали нарушений Schema сообщаются через возвращаемый `[]ValidationError`**; `error` не пуст только при сбое разбора или предварительной проверки (некорректный JSON, `schema` равен `nil`) — при пройденной валидации возвращается `(nil, nil)`, при проваленной, но штатной — `(непустой срез, nil)`.

```go
schema := &json.Schema{
	Type:     "object",
	Required: []string{"name", "email"},
	Properties: map[string]*json.Schema{
		"name":  {Type: "string", MinLength: 1},
		"email": {Type: "string", Format: "email"},
	},
}

errors, err := p.ValidateSchema(jsonStr, schema)
if err != nil {
	panic(err)
}
for _, ve := range errors {
	fmt.Printf("Путь %s: %s\n", ve.Path, ve.Message)
}
```

## Операции форматирования

### Compact

Сигнатура: `func (p *Processor) Compact(jsonStr string, cfg ...Config) (string, error)`

Сжимает JSON-строку, удаляя все пробельные символы.

::: warning Различие имён метода и функции уровня пакета
Сжатие «строка на входе, строка на выходе» на двух входах называется **по-разному**: на уровне пакета — `json.CompactString(s)`, в версии-методе — `p.Compact(s)`. Пакетный `json.Compact(dst, src)` — совместимая с `encoding/json.Compact` **форма с Buffer**; соответствующий метод — [`CompactBuffer`](#compactbuffer), а не этот.
:::

```go
compact, err := p.Compact(`{"name": "CyberGo"}`)
// Вывод: {"name":"CyberGo"}
```

### CompactBuffer

Сигнатура: `func (p *Processor) CompactBuffer(dst *bytes.Buffer, src []byte, cfg ...Config) error`

Сжимает JSON и записывает в Buffer. Сигнатура совместима с `encoding/json.Compact`; это Buffer-форма [`Compact`](#compact) (на уровне пакета соответствует `json.Compact`).

```go
var buf bytes.Buffer
err := p.CompactBuffer(&buf, []byte(`{"name": "test"}`))
```

### Indent

Сигнатура: `func (p *Processor) Indent(dst *bytes.Buffer, src []byte, prefix, indent string, cfg ...Config) error`

Форматирует JSON и записывает в Buffer.

```go
var buf bytes.Buffer
err := p.Indent(&buf, []byte(`{"name":"test"}`), "", "  ")
```

### HTMLEscape

Сигнатура: `func (p *Processor) HTMLEscape(dst *bytes.Buffer, src []byte, cfg ...Config)`

Выполняет HTML-экранирование JSON и записывает в Buffer.

```go
var buf bytes.Buffer
p.HTMLEscape(&buf, []byte(`{"html":"<script>alert(1)</script>"}`))
```

## См. также

- [Config](../config) - параметры конфигурации
- [Парсинг и загрузка](./parse) - методы Parse/Load
