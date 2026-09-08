---
sidebar_label: "Методы итерации"
title: "Методы итерации Processor - CyberGo JSON | Справочник API"
description: "Методы итерации CyberGo JSON Processor: Foreach, ForeachWithPath, ForeachNested, IterableValue, IteratorControl и модифицирующий ForeachReturn."
sidebar_position: 10
---

# Методы итерации

Processor предоставляет множество методов итерации JSON-массивов и объектов.

::: tip Зеркальная связь с функциями итерации уровня пакета
Восемь методов `Foreach*` на этой странице и [пакетные функции итерации](../functions/iterate) имеют общее происхождение: сигнатуры колбэков и семантика итерации полностью совпадают; полные примеры см. на пакетной странице. Отличия со стороны Processor:

- **Семантика cfg**: необязательный хвостовой `cfg` управляет проверками безопасности данного вызова (размер, глубина, опасные паттерны) и др.; при отсутствии используется собственная конфигурация процессора.
- **Защита кэша**: перед итерацией корень сначала получается через `Get`, затем из него **глубоко копируется** рабочая копия — даже если колбэк изменит контейнер, возвращённый `item.GetData()`, кэш разбора процессора и исходный ввод не пострадают.
- **Жизненный цикл**: после закрытия процессора все методы итерации возвращают `ErrProcessorClosed`.
:::

## Foreach

Сигнатура: `func (p *Processor) Foreach(jsonStr string, fn func(key any, item *IterableValue), cfg ...Config)`

Итерирует JSON-массив или объект.

```go
p.Foreach(data, func(key any, item *json.IterableValue) {
	fmt.Printf("Key: %v, Value: %v\n", key, item.GetData())
})
```

**При итерации массива**: key — индекс (int)
**При итерации объекта**: key — имя ключа (string)

## ForeachWithPath

Сигнатура: `func (p *Processor) ForeachWithPath(jsonStr, path string, fn func(key any, item *IterableValue), cfg ...Config) error`

Итерирует по пути, возвращает ошибку.

```go
err := p.ForeachWithPath(data, "items", func(key any, item *json.IterableValue) {
	fmt.Printf("[%v] %v\n", key, item.GetData())
})
```

Применимо для:
- итерации вложенных массивов
- итерации объекта по указанному пути

## ForeachNested

Сигнатура: `func (p *Processor) ForeachNested(jsonStr string, fn func(key any, item *IterableValue), cfg ...Config)`

Рекурсивно итерирует все уровни вложенности.

```go
p.ForeachNested(data, func(key any, item *json.IterableValue) {
	fmt.Printf("Ключ: %v, Значение: %v\n", key, item.GetData())
})
```

Пример данных:

```json
{
  "user": {
    "name": "test",
    "profile": {
      "age": 25,
      "tags": ["a", "b"]
    }
  }
}
```

Вывод:

```text
Ключ: user, Значение: map[string]any{...}
Ключ: name, Значение: test
Ключ: profile, Значение: map[string]any{...}
Ключ: age, Значение: 25
Ключ: tags, Значение: []any{...}
...
```

## ForeachReturn

Сигнатура: `func (p *Processor) ForeachReturn(jsonStr string, fn func(key any, item *IterableValue), cfg ...Config) (string, error)`

Итерирует JSON-данные и возвращает повторно сериализованную JSON-строку. Колбэк **может изменять** итерируемый контейнер: `item.GetData()` возвращает ссылку на рабочую копию (глубокую копию); добавления/удаления/изменения map / slice отразятся в итоговом сериализованном результате; скаляры на месте заменить нельзя. Изменения не затрагивают исходный ввод и кэш процессора.

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

	data := `[{"id":1,"internal":"x"},{"id":2,"internal":"y"}]`
	result, err := p.ForeachReturn(data, func(key any, item *json.IterableValue) {
		if obj, ok := item.GetData().(map[string]any); ok {
			delete(obj, "internal") // Изменение рабочей копии, попадёт в возвращаемый результат
		}
	})
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// Вывод: [{"id":1},{"id":2}]
}
```

Подходит для сценариев, где после итерации нужно продолжить цепочку операций.

## ForeachWithError

Сигнатура: `func (p *Processor) ForeachWithError(jsonStr, path string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

Итерирует по пути; колбэк может возвращать ошибку.

```go
err := p.ForeachWithError(data, "items", func(key any, item *json.IterableValue) error {
	if item.GetInt("id") == 0 {
		return fmt.Errorf("invalid item at index %v", key)
	}
	return nil // Продолжаем итерацию
})
```

## ForeachNestedWithError

Сигнатура: `func (p *Processor) ForeachNestedWithError(jsonStr string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

Рекурсивно итерирует все уровни вложенности; колбэк может возвращать ошибку.

```go
err := p.ForeachNestedWithError(data, func(key any, item *json.IterableValue) error {
	fmt.Printf("Ключ: %v, Значение: %v\n", key, item.GetData())
	return nil
})
```

## ForeachWithPathAndIterator

Сигнатура: `func (p *Processor) ForeachWithPathAndIterator(jsonStr, path string, fn func(key any, item *IterableValue, currentPath string) IteratorControl, cfg ...Config) error`

Итерирует по пути и предоставляет информацию о текущем пути. Управление процессом — через `IteratorControl`.

```go
err := p.ForeachWithPathAndIterator(data, "items", func(key any, item *json.IterableValue, currentPath string) json.IteratorControl {
	fmt.Printf("Путь: %s, Ключ: %v\n", currentPath, key)
	if item.GetInt("id") == targetID {
		return json.IteratorBreak // Остановить итерацию
	}
	return json.IteratorNormal // Продолжить итерацию
})
```

## ForeachWithPathAndControl

Сигнатура: `func (p *Processor) ForeachWithPathAndControl(jsonStr, path string, fn func(key any, value any) IteratorControl, cfg ...Config) error`

Итерирует по пути исходные значения; управление процессом — через `IteratorControl`.

```go
err := p.ForeachWithPathAndControl(data, "items", func(key any, value any) json.IteratorControl {
	fmt.Printf("Ключ: %v, Значение: %v\n", key, value)
	return json.IteratorNormal
})
```

## IterableValue

`IterableValue` в колбэке итерации предоставляет типобезопасное получение значений: `Get` / `GetString` / `GetInt` / `GetFloat64` / `GetBool` / `GetArray` / `GetObject` и варианты со значением по умолчанию (`GetWithDefault`, `GetStringWithDefault`, `GetIntWithDefault` и др.), проверку состояния (`Exists` / `IsNull` / `IsNullData` / `IsEmpty` / `IsEmptyData`), вложенную итерацию `ForeachNested` и сигнал прерывания `Break()`. Полный перечень методов с описанием каждого см. в [Подробном разборе типа IterableValue](../iterator) — он полностью совпадает с использованием в колбэках этой страницы.

## Сравнение методов

| Метод | Параметр пути | Рекурсия | Возвращаемое значение | Колбэк с ошибкой |
|------|:--------:|:----:|--------|:--------:|
| `Foreach` | нет | нет | нет | нет |
| `ForeachWithPath` | да | нет | error | нет |
| `ForeachNested` | нет | да | нет | нет |
| `ForeachReturn` | нет | нет | (string, error) | нет |
| `ForeachWithError` | да | нет | error | да |
| `ForeachNestedWithError` | нет | да | error | да |
| `ForeachWithPathAndIterator` | да | нет | error | IteratorControl |
| `ForeachWithPathAndControl` | да | нет | error | IteratorControl |

---

## Методы итерации файлов

Processor предоставляет методы итерации прямо из файла — удобное сочетание `LoadFromFile` + серия `Foreach`: проверка безопасности пути, лимит чтения `MaxJSONSize` и прозрачная передача per-call `cfg` полностью соответствуют поведению загрузки файлов.

| Метод | Ключевые моменты сигнатуры | Семантика |
|------|----------|------|
| `ForeachFile` | `(filePath, fn, cfg...)` | Итерация корневого массива/объекта файла |
| `ForeachFileWithPath` | `(filePath, path, fn, cfg...)` | Итерация коллекции по указанному пути внутри файла |
| `ForeachFileChunked` | `(filePath, chunkSize, fn, cfg...)` | Порционная итерация корневого **массива** (при `chunkSize` ≤0 по умолчанию 100); если корень не массив — `ErrTypeMismatch` |
| `ForeachFileNested` | `(filePath, fn, cfg...)` | Рекурсивная итерация всех вложенных структур |

Колбэки везде имеют вид `func(key any, item *json.IterableValue) error`: возврат `nil` — продолжить, `item.Break()` — чистая остановка, другая ошибка — прервать и вернуть. Полные примеры по каждому методу см. на [странице пакетной итерации](../functions/iterate#функции-итерации-файлов) (отличается лишь хвостовой `cfg`, поведение то же); таблица выбора методов — в [Файловых операциях](./file-io#выбор-метода).

```go
err := p.ForeachFile("data.json", func(key any, item *json.IterableValue) error {
	fmt.Printf("[%v] %v\n", key, item.GetData())
	return nil // Продолжаем итерацию
})
```

## Сравнение методов итерации файлов

| Метод | Параметр пути | Рекурсия | Порции | Подходящий сценарий |
|------|:--------:|:----:|:----:|----------|
| `ForeachFile` | нет | нет | нет | Простой обход файла |
| `ForeachFileWithPath` | да | нет | нет | Точечный обход |
| `ForeachFileChunked` | нет | нет | **да** | Пакетная обработка, ограниченная память |
| `ForeachFileNested` | нет | **да** | нет | Глубокий обход всех узлов |

---

## Управление итерацией

Возврат `item.Break()` из колбэка чисто прерывает итерацию (в целом возвращается `nil`); возврат другой ошибки немедленно прерывает обработку и возвращается как есть. Два варианта с информацией о пути (`ForeachWithPathAndIterator` / `ForeachWithPathAndControl`) управляют процессом через константы `IteratorControl` (`json.IteratorNormal` / `json.IteratorBreak`) — в повседневных сценариях предпочтительнее `item.Break()`. Примеры и описание констант см. на [странице пакетной итерации](../functions/iterate#управление-итерацией).

```go
err := p.ForeachFile("data.json", func(key any, item *json.IterableValue) error {
	if item.GetInt("id") == targetID {
		return item.Break() // Цель найдена, чистая остановка
	}
	return nil // Продолжаем итерацию
})
```

---

## См. также

- [Запросы по путям](./query) - серия методов Get
- [Пакетные операции](./batch) - пакетная обработка ProcessBatch
- [Файловые операции](../functions/file-io) - LoadFromFile/SaveToFile
