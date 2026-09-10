---
sidebar_label: "Операции изменения"
title: "Изменение данных Processor - CyberGo JSON | Справочник API"
description: "Методы изменения CyberGo JSON Processor: Set, пакетный SetMultiple, SetCreate с автосозданием путей, SetMultipleCreate, SetFromParsed и цепочки вызовов."
sidebar_position: 3
---

# Методы изменения данных

Processor предоставляет методы изменения данных; все они **возвращают новую JSON-строку с изменениями** (семантика неизменяемости, исходная строка не меняется) и поддерживают цепочечные вызовы. Методы удаления описаны в [Операциях удаления](./delete). Поведение методов совпадает с [пакетными функциями изменения](../functions/modify); здесь фокус на конфигурационной семантике со стороны Processor (приоритет `CreatePaths`, `ContinueOnError`) и цепочечных паттернах.

## Семантика неизменяемости

Все методы изменения возвращают **новую JSON-строку**; исходная входная строка никогда не изменяется (строки в Go и так неизменяемы). При сбое операции возвращаются исходная строка и ошибка — удобно для безопасной деградации:

```go
original := `{"user":{"name":"Alice"}}`

// Set возвращает новую строку, original не меняется
modified, err := p.Set(original, "user.name", "Bob")
// original по-прежнему {"user":{"name":"Alice"}}
// modified — {"user":{"name":"Bob"}}

// При сбое возвращаются исходная строка + ошибка
result, err := p.Set(original, "nonexistent.deep.path", "x")
// result == original (когда CreatePaths=false и путь не существует)
```

**Полный пример**

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	original := `{"user":{"name":"Alice"}}`
	modified, err := p.Set(original, "user.name", "Bob")
	if err != nil {
		panic(err)
	}
	fmt.Println(original) // Вывод: {"user":{"name":"Alice"}}
	fmt.Println(modified) // Вывод: {"user":{"name":"Bob"}}
}
```

## Set

Сигнатура: `func (p *Processor) Set(jsonStr, path string, value any, cfg ...Config) (result string, err error)`

Устанавливает значение по указанному пути и возвращает изменённую JSON-строку. Автоматическое создание несуществующих промежуточных путей зависит от `Config.CreatePaths` (см. [CreatePaths и SetCreate](#createpaths-и-setcreate)).

```go
result, err := p.Set(data, "user.name", "NewName")
```

Поддерживается установка значений разных типов:

```go
// Строка
result, _ := p.Set(data, "user.name", "CyberGo")

// Число
result, _ = p.Set(data, "user.age", 25)

// Логическое значение
result, _ = p.Set(data, "user.active", true)

// Объект
result, _ = p.Set(data, "user.profile", map[string]any{
	"bio":      "Developer",
	"location": "China",
})

// Массив
result, _ = p.Set(data, "items", []any{"a", "b", "c"})
```

**Полный пример: изменение вложенного пути**

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data := `{"user":{"name":"Alice","address":{"city":"Beijing"}}}`
	result, err := p.Set(data, "user.address.city", "Shanghai")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// Вывод: {"user":{"address":{"city":"Shanghai"},"name":"Alice"}}
}
```

## SetMultiple

Сигнатура: `func (p *Processor) SetMultiple(jsonStr string, updates map[string]any, cfg ...Config) (string, error)`

Пакетная установка значений нескольких путей с возвратом изменённой JSON-строки. По сравнению с многократными вызовами `Set`, `SetMultiple` парсит JSON один раз и применяет все обновления за один обход — эффективнее. Создание путей зависит от `Config.CreatePaths`.

```go
result, err := p.SetMultiple(data, map[string]any{
	"user.name":   "CyberGo",
	"user.age":    25,
	"user.active": true,
})
```

**Полный пример: пакетное обновление существующих полей**

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data := `{"user":{"name":"Alice","age":25,"email":"a@x.com"}}`
	result, err := p.SetMultiple(data, map[string]any{
		"user.name":  "Bob",
		"user.age":   26,
		"user.email": "b@x.com",
	})
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// Вывод: {"user":{"age":26,"email":"b@x.com","name":"Bob"}}
}
```

::: tip ContinueOnError и детерминированный порядок
- По умолчанию (`ContinueOnError=false`) при первом же сбойном пути возвращаются исходная строка и ошибка; при включении сбойные пути пропускаются с записью остальных, и только когда не удалось ничего, возвращается ошибка. Поле действует исключительно на `SetMultiple` и не связано со встроенной изоляцией операций [`ProcessBatch`](./batch).
- Обновления применяются последовательно в **лексикографическом порядке путей**; результат для пересекающихся путей (например, `a` и `a.b`) детерминирован: `a` записывается первым, `a.b` всегда попадает во вновь созданный контейнер — случайный порядок итерации map не влияет.
:::

## SetCreate

Сигнатура: `func (p *Processor) SetCreate(jsonStr, path string, value any, cfg ...Config) (string, error)`

Устанавливает значение и **автоматически создаёт несуществующие промежуточные пути**. Удобная обёртка над `Set` + `CreatePaths=true`: пути создаются независимо от собственной конфигурации процессора. Подробнее см. [CreatePaths и SetCreate](#createpaths-и-setcreate).

**Создание промежуточного объекта**

```go
// Если user.profile не существует, он автоматически создаётся как объект
result, err := p.SetCreate(data, "user.profile.bio", "Developer")
// {"user":{"profile":{"bio":"Developer"}}}
```

**Полный пример: автоматическое создание промежуточных объектов и массивов**

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data := `{"user":{"name":"Alice"}}`

	// Создание вложенного объекта: user.profile.bio
	result, err := p.SetCreate(data, "user.profile.bio", "Developer")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// Вывод: {"user":{"name":"Alice","profile":{"bio":"Developer"}}}

	// Создание массива: если user.tags[0] не существует, создаётся массив с записью в индекс 0
	result, err = p.SetCreate(data, "user.tags[0]", "admin")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// Вывод: {"user":{"name":"Alice","tags":["admin"]}}
}
```

## SetMultipleCreate

Сигнатура: `func (p *Processor) SetMultipleCreate(jsonStr string, updates map[string]any, cfg ...Config) (string, error)`

Пакетная установка нескольких значений с автоматическим созданием промежуточных путей. Удобная обёртка над `SetMultiple` + `CreatePaths=true`.

```go
result, err := p.SetMultipleCreate(data, map[string]any{
	"user.profile.bio":      "Developer",
	"user.profile.location": "China",
})
```

**Полный пример: пакетное создание вложенной структуры из пустого объекта**

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data := `{}`
	result, err := p.SetMultipleCreate(data, map[string]any{
		"user.name":        "Alice",
		"user.profile.bio": "Developer",
	})
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// Вывод: {"user":{"name":"Alice","profile":{"bio":"Developer"}}}
}
```

## Добавление элементов массива

Синтаксис `[+]` в пути добавляет элемент в конец массива — длину массива знать заранее не нужно. `[+]` должен идти после пути существующего массива (например, `items[+]`).

```go
data := `{"items":["a","b"]}`

// Добавление одного элемента
result, err := p.Set(data, "items[+]", "c")
// {"items":["a","b","c"]}

// Добавление нескольких элементов (переданный срез разворачивается)
result, err = p.Set(data, "items[+]", []any{"c", "d"})
// {"items":["a","b","c","d"]}
```

**Полный пример**

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data := `{"items":["a","b"]}`
	result, err := p.Set(data, "items[+]", "c")
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// Вывод: {"items":["a","b","c"]}
}
```

## CreatePaths и SetCreate

У автоматического создания путей два входа управления; понимание различий помогает выбирать между «по конфигурации процессора» и «принудительно в конкретном вызове»:

| Способ | Поведение | Сценарий применения |
|------|------|----------|
| `Config.CreatePaths` (по умолчанию `true`) | Переключатель уровня процессора; влияет на `Set` / `SetMultiple` | Построение **выделенного** процессора с единым включением/отключением создания путей |
| `SetCreate` / `SetMultipleCreate` | Принудительный `CreatePaths=true`, **переопределяет** конфигурацию процессора | Создание путей нужно изредка, менять конфигурацию процессора не хочется |

**Приоритет конфигурации** (от высшего к низшему):

1. **`SetCreate` / `SetMultipleCreate`** — всегда принудительно `CreatePaths=true`.
2. **per-call `cfg`** — явно переданный `cfg` полностью переопределяет настройки процессора (включая отключение).
3. **`Config.CreatePaths` процессора** — действует, когда `cfg` опущен.

```go
// Построение процессора с отключённым созданием путей
cfg := json.DefaultConfig()
cfg.CreatePaths = false
p, _ := json.New(cfg)

// Set следует конфигурации процессора: при несуществующем пути — ошибка
_, err := p.Set(`{"user":{}}`, "user.profile.bio", "x") // err не nil

// SetCreate создаёт принудительно, независимо от конфигурации процессора
result, _ := p.SetCreate(`{"user":{}}`, "user.profile.bio", "x")
// {"user":{"profile":{"bio":"x"}}}

// per-call cfg переопределяет настройки процессора (здесь снова включает)
result, _ = p.Set(`{"user":{}}`, "user.profile.bio", "x", json.DefaultConfig())
// {"user":{"profile":{"bio":"x"}}}
```

## Цепочечные изменения

Методы изменения возвращают новую строку; результат предыдущего шага можно передать в следующий, выстраивая цепочку:

```go
processor, _ := json.New()

result1, _ := processor.Set(data, "user.name", "CyberGo")
result2, _ := processor.Set(result1, "user.version", "1.0.0")
finalResult, _ := processor.Delete(result2, "user.temporary")
```

## Методы слияния Processor

Processor предоставляет методы экземпляра, соответствующие пакетным [MergeJSON](../functions/modify#mergejson), [MergeMany](../functions/modify#mergemany), [CompareJSON](../helpers#comparejson).

### Processor.MergeJSON

Сигнатура: `func (p *Processor) MergeJSON(json1, json2 string, cfg ...Config) (string, error)`

Разбирает параметры из cfg (**при опущенном cfg используется DefaultConfig, а не собственная конфигурация процессора** — если процессор создан с пользовательским MergeMode, для его применения нужно явно передать cfg), глубоко сливает два объекта по `Config.MergeMode`, затем перекодирует результат этим процессором.

Как и пакетная функция, `Processor.MergeJSON` не выполняет проверку безопасности — это структурный инструмент «декодировать, глубоко слить, снова закодировать». Если нужна проверка безопасности, используйте `CompareJSON` (всегда выполняет проверку; при переданном cfg — по cfg, иначе по собственной конфигурации процессора).

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

// Слияние-объединение (по умолчанию)
result, err := p.MergeJSON(base, override)

// Слияние-пересечение
cfg := json.DefaultConfig()
cfg.MergeMode = json.MergeIntersection
result, err = p.MergeJSON(base, override, cfg)
```

### Processor.MergeMany

Сигнатура: `func (p *Processor) MergeMany(jsons []string, cfg ...Config) (string, error)`

Свёртывает срез слева направо через `MergeJSON`; стратегия слияния определяется `Config.MergeMode` (по умолчанию `MergeUnion`). При менее чем 2 JSON-строках возвращается ошибка; при сбое любого шага возвращается ошибка с индексом сбойного элемента.

```go
result, err := p.MergeMany([]string{config1, config2, config3})
```

### Processor.CompareJSON

Сигнатура: `func (p *Processor) CompareJSON(json1, json2 string, cfg ...Config) (bool, error)`

Сравнивает две JSON-строки на равенство (нормализация чисел, порядок ключей не важен).

::: warning Отличие от пакетного CompareJSON
Пакетный `CompareJSON` без cfg не выполняет проверку безопасности и кодирует обе стороны через `encoding/json`; метод Processor **всегда** выполняет проверку безопасности (при переданном cfg — по cfg, иначе по собственной конфигурации процессора) и кодирует обе стороны симметрично кодировщиком библиотеки, чтобы настроенное кодирование (например, `EscapeHTML`) применялось симметрично.
:::

```go
equal, err := p.CompareJSON(a, b)
equal, err = p.CompareJSON(a, b, json.SecurityConfig())
```

## См. также

- [Запросы по путям](./query) - серия методов Get
- [Операции удаления](./delete) - методы Delete/DeleteClean
- [Пакетные операции](./batch) - пакетная обработка ProcessBatch
- [Функции изменения](../functions/modify) - пакетные функции Set/SetMultiple/MergeJSON
