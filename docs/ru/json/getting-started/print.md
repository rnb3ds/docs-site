---
sidebar_label: "Форматированный вывод"
title: "Форматированный вывод - CyberGo JSON | печать JSON"
description: "Форматированный вывод CyberGo JSON: Prettify, EncodePretty, MarshalIndent, Compact и HTMLEscape — сравнение, примеры и миграция с Print."
sidebar_position: 2.5
---

# Функции печати

::: info Справка по миграции
Эта страница — руководство по миграции для семейства функций Print (удалённого в ранних версиях). Чтобы форматировать JSON, используйте [`Prettify`](../api-reference/index#форматирование) или совместимый со стандартной библиотекой `MarshalIndent`.
:::

::: warning Описание изменения API
Print, PrintPretty, PrintE, PrintPrettyE удалены из библиотеки и больше не предоставляются. Используйте перечисленные ниже замены.
:::

## Замены

### Печать компактного JSON

Используйте `fmt.Println` + `EncodeWithConfig` (рекомендуется) или `Marshal`:

```go
data := map[string]any{"name": "Alice", "age": 30}

s, err := json.EncodeWithConfig(data)
if err != nil {
	log.Fatal(err)
}
fmt.Println(s)
// Вывод: {"age":30,"name":"Alice"}

// Либо Marshal (вывод []byte)
b, err := json.Marshal(data)
if err != nil {
	log.Fatal(err)
}
fmt.Println(string(b))
```

::: warning Encode устарел
`json.Encode` помечен как устаревший (функционально эквивалентен `EncodeWithConfig`) и будет удалён в будущей мажорной версии. В новом коде используйте `EncodeWithConfig` или `Marshal`.
:::

### Печать форматированного JSON

Используйте `fmt.Println` + `EncodePretty`:

```go
s, err := json.EncodePretty(data)
if err != nil {
	log.Fatal(err)
}
fmt.Println(s)
// Вывод:
// {
//   "age": 30,
//   "name": "Alice"
// }
```

### Печать JSON-строки (форматирование готового JSON)

Используйте `Prettify`:

```go
pretty, err := json.Prettify(`{"name":"Alice","age":30}`)
if err != nil {
	log.Fatal(err)
}
fmt.Println(pretty)
// Вывод:
// {
//   "name": "Alice",
//   "age": 30
// }
```

### Печать через Processor

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

// Кодирование и печать (рекомендуется EncodeWithConfig; Encode устарел)
s, err := p.EncodeWithConfig(data)
if err != nil {
	log.Fatal(err)
}
fmt.Println(s)

// Форматированная печать
pretty, err := p.EncodePretty(data)
if err != nil {
	log.Fatal(err)
}
fmt.Println(pretty)
```

## Сравнение инструментов форматирования

Выбирайте инструмент по признаку «на входе Go-значение или JSON-текст»:

| Функция | Вход | Выход | Типичное применение |
|---------|------|-------|---------------------|
| `Marshal(v, cfg...)` | Go-значение | `[]byte` компактный | Сигнатура стандартной библиотеки, самый универсальный |
| `EncodeWithConfig(v, cfg...)` | Go-значение | `string` компактный | Рекомендуемая точка входа (с конфигурацией) |
| `EncodePretty(v, cfg...)` | Go-значение | `string` с отступами | Кодирование и форматирование за один шаг |
| `MarshalIndent(v, prefix, indent)` | Go-значение | `[]byte` с отступами | Сигнатура стандартной библиотеки, совместимость со старым кодом |
| `Prettify(jsonStr, cfg...)` | JSON-текст | `string` с отступами | Форматирование готового JSON-текста |
| `Compact(dst, src)` | JSON-текст | Запись в `*bytes.Buffer` | Сжатие готового текста |
| `CompactString(jsonStr)` | JSON-текст | `string` компактный | Сжатие готового текста (без buffer) |
| `Indent(dst, src, prefix, indent)` | JSON-текст | Запись в `*bytes.Buffer` | Переформатирование отступов |
| `HTMLEscape(dst, src)` | JSON-текст | Запись в `*bytes.Buffer` | Экранирование `<` `>` `&` |
| `NewEncoder(w)` + `SetIndent` | Go-значение | Запись в `io.Writer` | Потоковый вывод (файл/сеть) |

::: tip Выбор в три шага
1. На входе **Go-значение**: нужен `[]byte` — `Marshal`, нужна `string` — `EncodeWithConfig`; при необходимости отступов замените их на `MarshalIndent` и `EncodePretty` соответственно
2. На входе уже **JSON-текст**: форматирование — `Prettify`, сжатие — `CompactString`; когда нужна полная совместимость с сигнатурами стандартной библиотеки — варианты с buffer `Compact`/`Indent`
3. Вывод в **поток** (файл/сеть): `NewEncoder` + `SetIndent`, запись по одной записи, без сборки большой строки целиком
:::

## Пользовательские отступы

`EncodePretty` по умолчанию использует отступ в два пробела. Для других отступов задайте `Config.Pretty` + `Config.Indent` либо используйте `MarshalIndent` с сигнатурой стандартной библиотеки:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := map[string]any{"name": "Alice", "age": 30}

	// Способ 1: MarshalIndent с сигнатурой стандартной библиотеки (prefix обычно пустой)
	b, err := json.MarshalIndent(data, "", "    ")
	if err != nil {
		panic(err)
	}
	fmt.Println(string(b))
	// Вывод:
	// {
	//     "age": 30,
	//     "name": "Alice"
	// }

	// Способ 2: EncodePretty + конфигурация (отступ табуляцией)
	cfg := json.DefaultConfig()
	cfg.Pretty = true
	cfg.Indent = "\t"
	s, err := json.EncodePretty(data, cfg)
	if err != nil {
		panic(err)
	}
	fmt.Println(s)
}
```

::: tip
`json.PrettyConfig()` — готовая предустановка: конфигурация по умолчанию + `Pretty: true` + отступ в два пробела, эквивалентна поведению `EncodePretty` по умолчанию.
:::

## Работа с готовым JSON-текстом

Если на входе уже JSON-текст (например, журналы или ответы API), используйте функции форматирования для прямого преобразования — без промежуточных структур:

```go
package main

import (
	"bytes"
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	pretty := "{\n  \"name\": \"Alice\",\n  \"age\": 30\n}"

	// Сжатие: удаление всех необязательных пробелов
	var compact bytes.Buffer
	if err := json.Compact(&compact, []byte(pretty)); err != nil {
		panic(err)
	}
	fmt.Println(compact.String())
	// Вывод: {"name":"Alice","age":30}

	// Вариант без buffer: CompactString возвращает строку напрямую
	s, err := json.CompactString(pretty)
	if err != nil {
		panic(err)
	}
	fmt.Println(s)

	// Переформатирование: другой стиль отступов
	var reindented bytes.Buffer
	if err := json.Indent(&reindented, []byte(pretty), "", "\t"); err != nil {
		panic(err)
	}
	fmt.Println(reindented.String())
	// Вывод:
	// {
	// 	"name": "Alice",
	// 	"age": 30
	// }
}
```

## HTML-экранирование

`HTMLEscape` совместим со стандартной библиотекой по сигнатуре: экранирует `<`, `>`, `&`, U+2028, U+2029 в JSON-тексте в форму `\u00XX`, чтобы браузер не интерпретировал HTML, встроенный в JSON. Это **посимвольное экранирование** — без перекодирования и изменения пробелов:

```go
package main

import (
	"bytes"
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	src := []byte(`{"html":"<b>bold</b>","url":"a&b"}`)

	var buf bytes.Buffer
	json.HTMLEscape(&buf, src)
	out := buf.String()
	fmt.Println(out)
	// В кавычках вывода больше нет «голых» <, >, & —
	// каждый заменён escape-последовательностью вида \u00XX, остальное содержимое сохранено как есть
}
```

::: tip Когда нужно экранировать вручную?
`Marshal`/`EncodeWithConfig` по умолчанию уже включают HTML-экранирование (`Config.EscapeHTML: true`) — результат кодирования сам по себе безопасен. `HTMLEscape` нужен в основном для **внешнего JSON-текста** — например, когда JSON, полученный от третьей стороны, нужно целиком встроить в HTML-страницу: сначала пропустите его через `HTMLEscape`, затем выводите.
:::

## Потоковый вывод в Writer

При записи в файл или сетевой поток используйте `NewEncoder` (сигнатура стандартной библиотеки), чтобы не собирать всю строку в память:

```go
package main

import (
	"os"

	"github.com/cybergodev/json"
)

func main() {
	type Item struct {
		ID   int    `json:"id"`
		Name string `json:"name"`
	}

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")

	for _, item := range []Item{{1, "Alice"}, {2, "Bob"}} {
		if err := enc.Encode(item); err != nil {
			panic(err)
		}
	}
	// Вывод:
	// {
	//   "id": 1,
	//   "name": "Alice"
	// }
	// {
	//   "id": 2,
	//   "name": "Bob"
	// }
}
```

`Encoder.Encode` соответствует стандартной библиотеке и автоматически добавляет перевод строки после каждой записи — это естественно для построчного вывода журналов и записи JSONL-файлов.

## Полный пример

```go
package main

import (
	"fmt"
	"log"

	"github.com/cybergodev/json"
)

func main() {
	data := map[string]any{
		"users": []any{
			map[string]any{"id": 1, "name": "Alice"},
			map[string]any{"id": 2, "name": "Bob"},
		},
		"total": 2,
	}

	// Компактный вывод (Encode устарел, рекомендуется EncodeWithConfig)
	compact, err := json.EncodeWithConfig(data)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(compact)

	// Форматированный вывод
	pretty, err := json.EncodePretty(data)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(pretty)
}
```

## См. также

- [Функции кодирования и вывода](../api-reference/functions/output) - Encode, EncodePretty, Prettify
- [Функции пакета](../api-reference/functions/) - обзор функций уровня пакета
