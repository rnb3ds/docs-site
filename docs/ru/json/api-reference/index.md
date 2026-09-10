---
sidebar_label: "Обзор"
title: "Справочник API - CyberGo JSON | Полная документация функций"
description: "Справочник API CyberGo JSON: запросы GetString/GetInt, изменения Set/Delete, Marshal/Unmarshal, Processor и валидация Schema, функции пакета и методы."
sidebar_position: 1
---

# Справочник API

Этот раздел содержит полный справочник API библиотеки `github.com/cybergodev/json`.

::: tip Два стиля API
Библиотека предоставляет два набора API: **функции уровня пакета** (например, `json.GetString(data, "path")`, без создания экземпляра) и **методы Processor** (например, `p.GetString(data, "path")`, с переиспользованием конфигурации, кэшем предразбора и системой хуков). Не уверены, что выбрать? Обратитесь к дереву решений в [Введении в Processor](../getting-started/processor-guide).
:::

## Индекс модулей

### API функций

| Модуль | Описание |
|------|------|
| [Функции пакета](./functions/) | Справочник по функциям уровня пакета (запросы/модификация/удаление/кодирование/парсинг/пакетные операции/JSONL/файлы/итерация) |
| [Processor](./processor/) | Методы процессора (зеркальная классификация с функциями пакета, дополнительно жизненный цикл и предразбор) |

### Типы и интерфейсы

| Модуль | Описание |
|------|------|
| [Config](./config) | Подробный разбор параметров конфигурации (DefaultConfig / SecurityConfig / PrettyConfig) |
| [Определения типов](./types) | Основные типы (Config / Schema / Stats / AccessResult, включая Encoder / Decoder, CompiledPath / PathSegment) |
| [Определения интерфейсов](./interfaces) | Интерфейсы расширения (CustomEncoder / Validator / Hook / PathParser) |
| [Итераторы и IterableValue](./iterator) | Типы Iterator / BatchIterator / ParallelIterator / StreamIterator |
| [Обобщённые операции](./generics) | Обобщённый API (GetTyped[T] / StreamLinesInto[T] / Result[T]) |
| [Константы и ошибки](./constants) | Константы и типы ошибок (включая константы `Default*` и таблицу соответствия полям Config) |

### Инструменты и вспомогательные средства

| Модуль | Описание |
|------|------|
| [Вспомогательные функции](./helpers) | CompareJSON / MergeJSON, управление кэшем, глобальный процессор, SafeError / RedactedPath, методы AccessResult |
| [Форматированный вывод](../getting-started/print) | Руководство по миграции для серии Print (замены удалённого API) |

### Межмодульные темы

| Модуль | Описание |
|------|------|
| [Потоковая обработка](../streaming/large-files) | Руководство по потоковой обработке больших файлов |
| [Обработка JSONL / NDJSON](../streaming/jsonl) | Обработчики JSONL (StreamJSONL / NDJSONProcessor / JSONLWriter) |
| [Валидация безопасности](../security/security-mode) | API режима безопасности (SecurityConfig / DangerousPattern / RegisterDangerousPattern) |
| [Валидация Schema](./schema) | Валидация Schema (ValidateSchema / DefaultSchema / NewSchemaWithConfig) |
| [Система хуков Hook](../extensions/hooks) | Хуки перехвата операций (LoggingHook / TimingHook / ValidationHook / ErrorHook) |
| [Пользовательский кодировщик](../extensions/custom-encoder) | Пользовательские кодировщики (CustomEncoder / TypeEncoder) |

## Быстрый поиск

### Классификация по функциям

#### Запросы по путям

| Функция | Описание |
|------|------|
| `Get`, `GetWithContext`, `GetString`, `GetInt`, `GetFloat`, `GetBool`, `GetArray`, `GetObject` | Типобезопасное получение |
| `GetTyped[T]` | Обобщённое получение |
| `SafeGet` | Безопасное получение AccessResult |
| `GetMultiple` | Пакетное получение |

#### Операции изменения

| Функция | Описание |
|------|------|
| `Set`, `SetMultiple` | Установка значений |
| `SetCreate`, `SetMultipleCreate` | Установка значений с автоматическим созданием путей |
| `Delete`, `DeleteClean` | Удаление значений |
| `ProcessBatch` | Пакетные операции |

#### Кодирование и декодирование

| Функция | Описание |
|------|------|
| `Marshal`, `Unmarshal` | Стандартное кодирование/декодирование (совместимо с `encoding/json`, можно передать `cfg`) |
| `MarshalIndent` | Кодирование с форматированием (совместимо с `encoding/json.MarshalIndent`, можно передать `cfg`) |
| `EncodeWithConfig`, `EncodePretty` | Кодирование в строку (с конфигурацией / форматированный вывод) |
| `Encode` (устарело) | Функционально эквивалентно `EncodeWithConfig`, будет удалено в следующей мажорной версии — в новом коде используйте `Marshal` или `EncodeWithConfig` |
| `NewEncoder`, `NewDecoder` | Потоковое кодирование/декодирование |
| `Parse`, `ParseAny` | Парсинг в целевую переменную / парсинг в `any` |
| `EncodeBatch`, `EncodeFields`, `EncodeStream` | Кодирование пар ключ-значение в объект / выборочное кодирование по полям / кодирование нескольких значений в массив |

#### Форматирование

| Функция | Описание |
|------|------|
| `Prettify` | Форматирование JSON |
| `Compact` | Сжатие JSON (вариант с buffer, совместимо с `encoding/json.Compact`) |
| `CompactString` | Сжатие JSON (вход/выход — строки, зеркало `Processor.Compact`) |
| `Indent` | Форматирование с отступами и записью в buffer (совместимо с `encoding/json.Indent`) |
| `HTMLEscape` | Экранирование HTML-символов с записью в buffer (совместимо с `encoding/json.HTMLEscape`) |

#### Файловые операции

| Функция | Описание |
|------|------|
| `LoadFromFile`, `SaveToFile` | Чтение/запись файлов |
| `LoadFromReader` | Чтение из Reader |
| `MarshalToFile`, `UnmarshalFromFile` | Кодирование/декодирование файлов |
| `SaveToWriter` | Запись в произвольный Writer |

#### Итерация и обход

| Функция | Описание |
|------|------|
| `Foreach`, `ForeachWithError`, `ForeachNested`, `ForeachNestedWithError` | Обход массивов/объектов (включая обход глубокой вложенности) |
| `ForeachWithPath`, `ForeachWithPathAndIterator`, `ForeachWithPathAndControl` | Обход по указанному пути (с передачей текущего пути / с управлением прерыванием) |
| `ForeachReturn` | Обход с возвратом изменённого JSON |
| `ForeachFile`, `ForeachFileWithPath`, `ForeachFileChunked`, `ForeachFileNested` | Поточная итерация больших файлов |
| `NewIterator`, `NewBatchIterator`, `NewParallelIterator`, `NewStreamIterator` | Конструкторы автономных итераторов (подробнее в [Итераторах](./iterator)) |

#### Кэш и глобальное состояние

| Функция | Описание |
|------|------|
| `WarmupCache`, `ClearCache` | Прогрев / очистка кэша |
| `GetStats`, `GetHealthStatus` | Статистика работы / проверка здоровья |
| `GetConfig`, `SetLogger` | Чтение конфигурации процессора / внедрение логгера (включая глобальные функции и методы Processor) |
| `SetGlobalProcessor`, `ShutdownGlobalProcessor` | Замена и закрытие глобального процессора |
| `RegisterDangerousPattern`, `UnregisterDangerousPattern`, `ListDangerousPatterns` | Регистрация / удаление / перечисление глобального реестра опасных шаблонов (подробнее во [Вспомогательных функциях](./helpers#registerdangerouspattern)) |
| `CompilePath` (Processor), `PreParse` (Processor) | Предкомпиляция путей / предразбор JSON |

#### Потоковая обработка

| Тип/метод | Описание |
|------|------|
| `StreamLinesInto[T]` | Поточное чтение JSONL из Reader и преобразование в `[]T` |
| `ParseJSONL` | Парсинг байтов JSONL в `[]any` |
| `ToJSONL`, `ToJSONLString` | Преобразование `[]any` в формат JSONL |
| `JSONLWriter` | Writer для JSONL (Write/WriteAll/WriteRaw) |
| `NDJSONProcessor` | Обработчик NDJSON/JSONL (создаётся через `NewNDJSONProcessor`) |
| `ForeachFile` | Поточная обработка файлов |

#### Валидация

| Функция | Описание |
|------|------|
| `Valid` | Валидация JSON (совместимо с `encoding/json.Valid`) |
| `ValidWithConfig` | Валидация JSON с конфигурацией |
| `ValidateSchema` | Валидация Schema (используется вместе с типом `Schema`) |
| `CompareJSON` | Сравнение JSON на эквивалентность |
| `MergeJSON`, `MergeMany` | Слияние JSON (режимы объединение/пересечение/разность, подробнее во [Вспомогательных функциях](./helpers)) |

## Соглашения об именовании

Библиотека следует следующим соглашениям об именовании:

| Паттерн | Описание | Пример |
|------|------|------|
| `Get{Type}` | Получение указанного типа (поддерживается defaultValue) | `GetString`, `GetInt` |
| `GetTyped[T]` | Обобщённое получение, возвращает T | `GetTyped[User]` |
| `New{Type}` | Создание экземпляра | `New` (возвращает *Processor), `NewEncoder` |
| `Default{Type}` | Конфигурация по умолчанию | `DefaultConfig` |
| `{Type}Config` | Пресет конфигурации | `SecurityConfig`, `PrettyConfig` |
| `Foreach*` | Варианты итерации (WithError / WithPath / Nested / File) | `ForeachNestedWithError` |
| `Stream*` | Варианты потоковой обработки (Into / Parallel / File / Chunked) | `StreamJSONLParallel` |
| `{Verb}Hook` | Фабрики хуков | `LoggingHook`, `ValidationHook` |

## См. также

- [Быстрый старт](../getting-started/) — установка и базовое использование
- [Введение в Processor](../getting-started/processor-guide) — когда использовать процессор
- [Синтаксис path-выражений](../getting-started/path-syntax) — синтаксис запросов по путям
- [Примеры использования](../examples/) — практические примеры кода
- [Обработка больших файлов](../streaming/large-files) — руководство по потоковой обработке
