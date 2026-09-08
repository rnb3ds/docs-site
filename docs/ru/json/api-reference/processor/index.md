---
sidebar_label: "Обзор"
title: "Процессор Processor - CyberGo JSON | Справочник API"
description: "Processor CyberGo JSON: New, операции GetString/Set/Delete, итерация Foreach, кодирование Encode, закрытие Close, встроенный кэш и цепочки вызовов."
sidebar_position: 1
---

# Processor

Processor обеспечивает высокую производительность, настраиваемость и более гибкое переиспользование — подходит для многократных операций над одним источником данных.

## Особенности

- **Высокая производительность**: внутренний механизм кэширования, повторные операции эффективнее
- **Настраиваемость**: поддержка множества параметров конфигурации
- **Цепочечные вызовы**: методы возвращают изменённый JSON, допуская последовательные операции
- **Управление ресурсами**: явный контроль жизненного цикла

## Создание Processor

### New

Сигнатура: `func New(cfg ...Config) (*Processor, error)`

Создаёт экземпляр Processor. Необязательный параметр Config настраивает процессор.

```go
// С конфигурацией по умолчанию
processor, err := json.New()
if err != nil {
	panic(err)
}
defer processor.Close()

// С пользовательской конфигурацией
cfg := json.DefaultConfig()
cfg.StrictMode = true
processor, err = json.New(cfg)

// С конфигурацией безопасности
processor, err = json.New(json.SecurityConfig())
```

## Цепочечные вызовы

Методы Processor возвращают изменённую JSON-строку, что позволяет выполнять операции последовательно:

```go
processor, _ := json.New()

// Установка нескольких значений
result1, _ := processor.Set(data, "user.name", "CyberGo")
result2, _ := processor.Set(result1, "user.version", "1.0.0")
finalResult, _ := processor.Delete(result2, "user.temporary")
```

## Каталог API

| Категория | Описание |
|------|------|
| [Запросы и получение](./query) | GetString/Int/Float/Bool/Get/GetWithContext/SafeGet/GetArray/GetObject/GetMultiple/CompilePath/GetCompiled/PreParse/GetFromParsed |
| [Операции изменения](./modify) | Set/SetMultiple/SetCreate/SetMultipleCreate/MergeJSON/MergeMany/CompareJSON |
| [Операции удаления](./delete) | Delete/DeleteClean |
| [Кодирование и вывод](./output) | Encode/EncodePretty/EncodeWithConfig/MarshalIndent/Prettify/Compact/CompactBuffer/Indent/HTMLEscape/EncodeBatch/EncodeFields/EncodeStream/ValidateSchema |
| [Парсинг и валидация](./parse) | Parse/ParseAny/Valid/ValidBytes/Marshal/Unmarshal |
| [Пакетные операции](./batch) | ProcessBatch/WarmupCache |
| [JSONL](./jsonl) | StreamJSONL/StreamJSONLParallel/StreamJSONLParallelWithContext/StreamJSONLChunked/StreamJSONLFile/ForeachJSONL/MapJSONL/ReduceJSONL/FilterJSONL/CollectJSONL/FirstJSONL |
| [Файловые операции](./file-io) | LoadFromFile/LoadFromReader/SaveToFile/MarshalToFile/SaveToWriter/UnmarshalFromFile/серия ForeachFile |
| [Методы итерации](./iterate) | Foreach/ForeachWithPath/ForeachNested/ForeachReturn/ForeachWithError/ForeachNestedWithError/ForeachWithPathAndIterator/ForeachWithPathAndControl/ForeachFile/ForeachFileWithPath/ForeachFileChunked/ForeachFileNested |
| [Жизненный цикл](./lifecycle) | Close/IsClosed/GetConfig/AddHook/SetLogger/ClearCache/WarmupCache/GetStats/GetHealthStatus/SetGlobalProcessor/ShutdownGlobalProcessor |

---

## Управление глобальным процессором

Функции уровня пакета используют внутренний глобальный процессор. Управлять им можно следующими функциями:

### SetGlobalProcessor

Сигнатура: `func SetGlobalProcessor(processor *Processor)`

Устанавливает пользовательский глобальный процессор. Все функции уровня пакета (Get, Set, Marshal и др.) будут использовать его.

**Параметры**

| Имя | Тип | Описание |
|------|------|------|
| `processor` | `*Processor` | Пользовательский экземпляр процессора |

```go
package main

import (
	"github.com/cybergodev/json"
)

func main() {
	// Создание процессора с пользовательской конфигурацией
	cfg := json.SecurityConfig()
	processor, err := json.New(cfg)
	if err != nil {
		panic(err)
	}

	// Установка в качестве глобального процессора
	json.SetGlobalProcessor(processor)

	// Теперь все функции уровня пакета используют конфигурацию безопасности
	data, err := json.Get(`{"name":"Alice"}`, "name")
	// Применены лимиты SecurityConfig
	_ = data
}
```

::: warning Примечание
- Передача `nil` не выполняет никаких действий
- Предыдущий глобальный процессор закрывается автоматически
- Функция потокобезопасна
:::

### ShutdownGlobalProcessor

Сигнатура: `func ShutdownGlobalProcessor()`

Закрывает и удаляет глобальный процессор. Последующие операции уровня пакета создадут новый процессор по умолчанию.

```go
package main

import (
	"github.com/cybergodev/json"
)

func main() {
	// Использование глобального процессора
	data, _ := json.Get(`{"key":"value"}`, "key")
	_ = data

	// Очистка при завершении приложения
	json.ShutdownGlobalProcessor()

	// Последующие операции создадут новый процессор по умолчанию
	data2, _ := json.Get(`{"key":"value2"}`, "key")
	_ = data2
}
```

::: tip Сценарии использования
- Очистка ресурсов при завершении долго работающих сервисов
- Сброс конфигурации процессора
- Изоляция тестовых случаев в тестовом окружении
:::

---

## См. также

- [Функции пакета](../functions/) - справочник по функциям верхнего уровня
- [Config](../config) - параметры конфигурации
- [Определения интерфейсов](../interfaces) - интерфейс Hook
- [Система хуков Hook](../../extensions/hooks) - подробное руководство по хукам
