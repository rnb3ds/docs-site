---
sidebar_label: "Пользовательский кодировщик"
title: "CustomEncoder - CyberGo JSON | Пользовательский кодировщик"
description: "Пользовательский кодировщик CyberGo JSON: интерфейс CustomEncoder и TypeEncoder, определение, реализация и регистрация логики JSON-сериализации для Go-типов."
sidebar_position: 3
---

# Пользовательское кодирование

Библиотека json поддерживает совместимость кодирования со стандартной библиотекой `encoding/json`, поэтому JSON-форма пользовательских типов определяется в основном через реализацию интерфейсов стандартной библиотеки. Эта страница описывает точки расширения кодирования, **фактически действующие в текущей версии**:

- [`json.Marshaler`](#интерфейс-json-marshaler) — тип сам определяет своё JSON-кодирование
- [`encoding.TextMarshaler`](#интерфейс-encoding-textmarshaler) — тип сам определяет своё текстовое кодирование (вывод как JSON-строка)
- [`time.Time`](#встроенная-обработка-time-time) — встроенный в библиотеку формат времени RFC3339Nano
- [`Config.CustomEscapes`](#пользовательское-экранирование-символов-customescapes) — пользовательское сопоставление экранирования символов

::: tip Приоритет интерфейсов
Для задачи «как кодировать некий тип» предпочтительно реализовать `MarshalJSON` или `MarshalText`; такие реализации совместимы с данной библиотекой, стандартной библиотекой `encoding/json` и любыми совместимыми библиотеками — максимальная переносимость.
:::

## Интерфейс json.Marshaler

Типы, реализующие `MarshalJSON() ([]byte, error)`, могут полностью определить своё JSON-представление. При кодировании библиотека приоритетно вызывает этот метод (поддерживаются как приёмник-значение, так и приёмник-указатель), в соответствии с поведением стандартной библиотеки `encoding/json`.

Сигнатура интерфейса (совместима с `encoding/json.Marshaler`):

```go
type Marshaler interface {
    MarshalJSON() ([]byte, error)
}
```

Ниже определяется тип `Hex`, кодирующий `uint64` как шестнадцатеричную строку с префиксом `0x`:

```go
package main

import (
	"fmt"
	"strconv"

	"github.com/cybergodev/json"
)

// Hex оборачивает uint64 как шестнадцатеричное представление.
type Hex uint64

// MarshalJSON реализует json.Marshaler, кодируя число как строку "0x..".
func (h Hex) MarshalJSON() ([]byte, error) {
	return []byte(`"0x` + strconv.FormatUint(uint64(h), 16) + `"`), nil
}

func main() {
	type Device struct {
		ID    Hex    `json:"id"`
		Label string `json:"label"`
	}
	d := Device{ID: Hex(255), Label: "sensor-1"}

	out, err := json.Marshal(d)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(out))
	// Вывод: {"id":"0xff","label":"sensor-1"}
}
```

::: warning Избегайте бесконечной рекурсии
Если внутри `MarshalJSON` нужен «обычный кодировщик» в качестве помощника, используйте стандартную библиотеку `stdjson.Marshal` или вызывайте библиотечный `Marshal` для **другого конкретного типа». Прямой повторный вызов `Marshal` для этого же типа снова войдёт в `MarshalJSON`, образуя бесконечную рекурсию.
:::

## Интерфейс encoding.TextMarshaler

Типы, не реализующие `MarshalJSON`, но реализующие `MarshalText() ([]byte, error)`, кодируются как JSON-строка, значением которой является текстовое содержимое (кавычки и экранирование добавляются автоматически). Подходит для типов, форма которых полностью выражается текстом.

Сигнатура интерфейса (совместима с `encoding.TextMarshaler`):

```go
type TextMarshaler interface {
    MarshalText() ([]byte, error)
}
```

Ниже определяется тип `Slug`, автоматически нормализуемый при кодировании к нижнему регистру с дефисами:

```go
package main

import (
	"fmt"
	"strings"

	"github.com/cybergodev/json"
)

// Slug представляет URL-дружелюбный короткий текст.
type Slug string

// MarshalText реализует encoding.TextMarshaler, выводит нормализованный текст.
func (s Slug) MarshalText() ([]byte, error) {
	return []byte(strings.ToLower(strings.ReplaceAll(string(s), " ", "-"))), nil
}

func main() {
	type Article struct {
		Title string `json:"title"`
		Slug  Slug   `json:"slug"`
	}
	a := Article{Title: "Hello World", Slug: Slug("Hello World")}

	out, err := json.Marshal(a)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(out))
	// Вывод: {"title":"Hello World","slug":"hello-world"}
}
```

::: tip Приоритет двух интерфейсов
Если тип реализует оба интерфейса одновременно, `MarshalJSON` имеет приоритет над `MarshalText`. Если нужно закодировать тип как JSON-строку, реализация `MarshalText` обычно лаконичнее (не нужно самостоятельно обрабатывать кавычки и экранирование).
:::

## Встроенная обработка time.Time

Библиотека имеет встроенную обработку `time.Time` с единым выводом в формате RFC3339Nano (с сохранением субсекундной точности, как в стандартной библиотеке `encoding/json`). Не требует никаких настроек:

```go
package main

import (
	"fmt"
	"time"

	"github.com/cybergodev/json"
)

func main() {
	type Event struct {
		Name string    `json:"name"`
		At   time.Time `json:"at"`
	}
	t := time.Date(2026, 1, 15, 10, 30, 0, 0, time.UTC)
	e := Event{Name: "deploy", At: t}

	out, err := json.Marshal(e)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(out))
	// Вывод: {"name":"deploy","at":"2026-01-15T10:30:00Z"}
}
```

Если нужен другой формат времени, реализуйте `MarshalJSON` для этого типа (см. [выше](#интерфейс-json-marshaler)), чтобы переопределить встроенное поведение — `MarshalJSON` пользовательского типа всегда имеет приоритет над обработкой `time.Time` по умолчанию.

## Пользовательское экранирование символов CustomEscapes

`Config.CustomEscapes` — это `map[rune]string` для **глобального переопределения** экранирования некоторых символов. При кодировании строк библиотека сначала ищет rune в этом сопоставлении: при совпадении соответствующая строка записывается в вывод как есть (вы сами несёте ответственность за её JSON-корректность), при несовпадении применяется экранирование по умолчанию.

Ниже знак авторского права `©` заменяется ASCII-текстом (при совпадении записывается как есть, остальные символы идут через обработку по умолчанию):

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	cfg := json.DefaultConfig()
	// © по умолчанию выводится как есть; здесь заменяется ASCII-текстом
	cfg.CustomEscapes = map[rune]string{
		'©': "(c)",
	}

	out, err := json.EncodeWithConfig(map[string]string{"note": "Copyright © 2026"}, cfg)
	if err != nil {
		panic(err)
	}
	fmt.Println(out)
	// Вывод: {"note":"Copyright (c) 2026"}
}
```

::: warning Пользовательская escape-строка должна быть JSON-корректной
Значения `CustomEscapes` **записываются в вывод как есть**, без повторной обработки, поэтому будьте внимательны к экранированию строк в самом исходном коде Go: если в выводе нужна буквальная последовательность экранирования с обратной косой чертой, в исходном коде Go следует писать двойную косую черту `\\` (одинарная косая черта будет интерпретирована Go как escape-последовательность, и в результате получится сам этот символ, а не escape-последовательность).
:::

::: tip Когда активируется путь пользовательского экранирования
Установка `CustomEscapes` (не nil) активирует путь пользовательского кодирования. Этот путь также считывает поля `EscapeHTML`, `EscapeUnicode`, `EscapeSlash`, `EscapeNewlines`, `EscapeTabs`, `SortKeys`, `FloatPrecision`, `IncludeNulls` (подробнее см. [Параметры конфигурации](../api-reference/config)).
:::

## Как выбрать точку расширения

| Потребность | Способ |
|------|----------|
| Пользовательская JSON-форма типа | Реализовать `MarshalJSON()` |
| Кодирование типа как JSON-строка (текстовое представление) | Реализовать `MarshalText()` |
| Глобальное изменение правил экранирования некоторых символов | `Config.CustomEscapes` |
| Управление отступами, HTML-экранированием, Unicode-экранированием, сортировкой ключей, точностью чисел и т. д. | Поля `Config`: `Pretty`/`EscapeHTML`/`EscapeUnicode`/`SortKeys`/`FloatPrecision` и др. (см. [Параметры конфигурации](../api-reference/config)) |
| Переопределение формата времени по умолчанию для `time.Time` | Реализовать `MarshalJSON()` для пользовательского типа времени |

## Поля Config, связанные с кодированием

| Поле | Тип | Описание |
|------|------|------|
| `CustomEscapes` | `map[rune]string` | Пользовательское сопоставление экранирования символов (при совпадении выводится как есть) |
| `EscapeHTML` | `bool` | Экранировать ли `<` `>` `&` (по умолчанию `true`) |
| `EscapeUnicode` | `bool` | Экранировать ли символы `>0x7F` как `\uXXXX` |
| `EscapeSlash` | `bool` | Экранировать ли `/` |
| `EscapeNewlines` / `EscapeTabs` | `bool` | Экранировать ли переводы строк / табуляции |
| `SortKeys` | `bool` | Сортировать ли ключи объектов (ключи объектов сортируются по умолчанию) |
| `FloatPrecision` | `int` | Точность чисел с плавающей точкой (`-1` по умолчанию) |
| `IncludeNulls` | `bool` | Включать ли поля со значениями null |

## Не подключённые поля расширения (зарезервировано)

::: warning Не подключённые поля расширения
`Config.CustomEncoder` (интерфейс `CustomEncoder`) и `Config.CustomTypeEncoders` (интерфейс `TypeEncoder`) в текущей версии **объявлены и участвуют в клонировании конфигурации и вычислении ключа кэша, но ещё не подключены к конвейеру кодирования**. Установка этих двух полей **не изменяет вывод кодирования**. Они являются зарезервированными точками расширения для будущих версий; до этого используйте описанные выше действующие механизмы `MarshalJSON`/`MarshalText`/`CustomEscapes`.

```go
// Текущая версия: следующие два поля объявлены, но не подключены — установка не даёт эффекта (зарезервированные интерфейсы)
type CustomEncoder interface {
    Encode(value any) (string, error)
}

type TypeEncoder interface {
    Encode(v reflect.Value) (string, error)
}
```
:::

## См. также

- [Определения интерфейсов](../api-reference/interfaces) - интерфейсы `Marshaler` / `TextMarshaler` / `CustomEncoder` / `TypeEncoder`
- [Параметры конфигурации](../api-reference/config) - поля конфигурации, связанные с кодированием
- [Перехватчики Hooks](./hooks) - перехват до и после операций (включая доступные хуки проверки)
