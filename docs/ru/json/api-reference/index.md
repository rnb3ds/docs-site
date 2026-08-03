---
sidebar_label: "Обзор"
title: "Справочник API - CyberGo JSON | Функции"
description: "Справочник API CyberGo JSON: GetString/GetInt, Set/Delete, Marshal/Unmarshal, Processor, Schema, Hook и безопасность, совместимый со stdlib."
sidebar_position: 1
---

# Справочник API

В этом разделе представлен полный справочник API библиотеки `github.com/cybergodev/json`.

::: tip Два стиля API
Библиотека предоставляет **функции пакета** (например, `json.GetString(data, "path")`, без создания экземпляра) и **методы Processor** (например, `p.GetString(data, "path")`, с повторным использованием конфигурации, кэшем предпарсинга и системой хуков). Не уверены, что выбрать? См. дерево решений в [Руководстве по Processor](../getting-started/processor-guide).
:::

## Индекс модулей

### API функций

| Модуль | Описание |
|------|------|
| [Функции пакета](./functions/) | Справочник функций уровня пакета (запросы/модификация/удаление/кодирование/парсинг/пакетная обработка/JSONL/файлы/итерация) |
| [Processor](./processor/) | Методы процессора (зеркальная классификация с функциями пакета, дополнительно жизненный цикл и предпарсинг) |

### Типы и интерфейсы

| Модуль | Описание |
|------|------|
| [Config](./config) | Подробное описание параметров конфигурации (DefaultConfig / SecurityConfig / PrettyConfig) |
| [Определения типов](./types) | Основные типы (Config / Schema / Stats / AccessResult, включая Encoder / Decoder) |
| [Определения интерфейсов](./interfaces) | Расширяемые интерфейсы (CustomEncoder / Validator / Hook / PathParser) |
| [Итераторы и IterableValue](./iterator) | Типы Iterator / BatchIterator / ParallelIterator / StreamIterator |
| [Обобщённые операции](./generics) | Обобщённый API (GetTyped[T] / StreamLinesInto[T] / Result[T]) |
| [Константы и ошибки](./constants) | Константы и типы ошибок |

### Инструменты и утилиты

| Модуль | Описание |
|------|------|
| [Сервисные функции](./helpers) | CompareJSON / MergeJSON, управление кэшем, глобальный процессор, SafeError / RedactedPath, методы AccessResult |
| [Руководство по форматированию](./print) | Руководство по миграции серии Print (альтернативы для удалённых API) |

### Межмодульные темы

| Модуль | Описание |
|------|------|
| [Потоковая обработка](../streaming/large-files) | Руководство по потоковой обработке больших файлов |
| [Обработка JSONL / NDJSON](../streaming/jsonl) | Обработчик JSONL (StreamJSONL / NDJSONProcessor / JSONLWriter) |
| [Проверка безопасности](../security/security-mode) | API безопасного режима (SecurityConfig / DangerousPattern / RegisterDangerousPattern) |
| [Schema-валидатор](../extensions/validator) | Валидация Schema (ValidateSchema / DefaultSchema / NewSchemaWithConfig) |
| [Система хуков Hook](../extensions/hooks) | Хуки перехвата операций (LoggingHook / TimingHook / ValidationHook / ErrorHook) |
| [Пользовательский кодировщик](../extensions/custom-encoder) | Пользовательские кодировщики (CustomEncoder / TypeEncoder) |

## Быстрый поиск

### Классификация по функциональности

#### Запросы по пути

| Функция | Описание |
|---------|----------|
| `Get`, `GetWithContext`, `GetString`, `GetInt`, `GetFloat`, `GetBool`, `GetArray`, `GetObject` | Типобезопасное получение |
| `GetTyped[T]` | Обобщённое получение |
| `SafeGet` | Безопасное получение AccessResult |
| `GetMultiple` | Массовое получение |

#### Операции модификации

| Функция | Описание |
|---------|----------|
| `Set`, `SetMultiple` | Установка значений |
| `SetCreate`, `SetMultipleCreate` | Установка значений с автоматическим созданием пути |
| `Delete`, `DeleteClean` | Удаление значений |
| `ProcessBatch` | Массовые операции |

#### Кодирование/декодирование

| Функция | Описание |
|---------|----------|
| `Marshal`, `Unmarshal` | Стандартное кодирование/декодирование (совместимо с `encoding/json`, можно добавить `cfg`) |
| `MarshalIndent` | Форматированное кодирование (совместимо с `encoding/json.MarshalIndent`, можно добавить `cfg`) |
| `Encode`, `EncodeWithConfig` | Кодирование в строку |
| `NewEncoder`, `NewDecoder` | Потоковое кодирование/декодирование |
| `Parse` | Парсинг JSON |

#### Форматирование

| Функция | Описание |
|---------|----------|
| `Prettify` | Форматирование JSON |
| `Compact` | Сжатие JSON (форма с буфером, совместимо с `encoding/json.Compact`) |
| `CompactString` | Сжатие JSON (строковый ввод/вывод, зеркало `Processor.Compact`) |

#### Файловые операции

| Функция | Описание |
|---------|----------|
| `LoadFromFile`, `SaveToFile` | Чтение и запись файлов |
| `LoadFromReader` | Чтение из Reader |
| `MarshalToFile`, `UnmarshalFromFile` | Файловое кодирование/декодирование |

#### Потоковая обработка

| Тип/метод | Описание |
|-----------|----------|
| `StreamLinesInto[T]` | Потоковое чтение JSONL из Reader и преобразование в `[]T` |
| `ParseJSONL` | Парсинг JSONL-байтов в `[]any` |
| `ToJSONL`, `ToJSONLString` | Преобразование `[]any` в формат JSONL |
| `JSONLWriter` | JSONL-писатель (Write/WriteAll/WriteRaw) |
| `NDJSONProcessor` | Обработчик NDJSON/JSONL |
| `ForeachFile` | Потоковая обработка файлов |

#### Валидация

| Функция | Описание |
|---------|----------|
| `Valid` | Валидация JSON (совместима с `encoding/json.Valid`) |
| `ValidWithConfig` | Валидация JSON с конфигурацией |
| `ValidateSchema` | Schema-валидация (используется с типом `Schema`) |
| `CompareJSON` | Сравнение JSON на эквивалентность |

## Соглашения об именовании

Библиотека следует следующим соглашениям об именовании:

| Шаблон | Описание | Пример |
|---------|----------|--------|
| `Get{Type}` | Получение указанного типа (поддерживает defaultValue) | `GetString`, `GetInt` |
| `GetTyped[T]` | Обобщённое получение, возвращает T | `GetTyped[User]` |
| `New{Type}` | Создание экземпляра | `New` (возвращает *Processor), `NewEncoder` |
| `Default{Type}` | Конфигурация по умолчанию | `DefaultConfig` |
| `{Type}Config` | Предустановка конфигурации | `SecurityConfig`, `PrettyConfig` |

## Связанные разделы

- [Быстрый старт](../getting-started/) -- Установка и базовое использование
- [Руководство по Processor](../getting-started/processor-guide) -- Когда использовать процессор
- [Синтаксис выражений пути](../getting-started/path-syntax) -- Синтаксис запросов по пути
- [Примеры использования](../examples/) -- Практические примеры кода
- [Обработка больших файлов](../streaming/large-files) -- Руководство по потоковой обработке
