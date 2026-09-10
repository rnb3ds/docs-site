---
sidebar_label: "Обзор"
title: "Функции пакета - CyberGo JSON | Справочник API"
description: "Функции пакета CyberGo JSON: запросы по путям Get/GetString/GetInt, изменения Set/Delete/MergeJSON, Marshal/Unmarshal и пакетные ParseJSONL/ProcessBatch."
sidebar_position: 1
---

# Функции пакета

Функции верхнего уровня пакета json — вызываются напрямую, без создания экземпляра Processor. Классификация по назначению:

## [Запросы и получение](./query)

Функции запросов по путям, типобезопасного получения, безопасного получения и пакетного получения.

**Основные функции**: [`Get`](./query#get) · [`GetWithContext`](./query#getwithcontext) · [`GetString`](./query#getstring) · [`GetInt`](./query#getint) · [`GetFloat`](./query#getfloat) · [`GetBool`](./query#getbool) · [`GetArray`](./query#getarray) · [`GetObject`](./query#getobject) · [`GetTyped[T]`](./query#gettyped-t) · [`SafeGet`](./query#safeget-функция-уровня-пакета) · [`GetMultiple`](./query#getmultiple-функция-уровня-пакета)

## [Операции изменения](./modify)

Функции установки значений и слияния JSON-данных.

**Основные функции**: [`Set`](./modify#set) · [`SetMultiple`](./modify#setmultiple) · [`SetCreate`](./modify#setcreate) · [`SetMultipleCreate`](./modify#setmultiplecreate) · [`MergeJSON`](./modify#mergejson) · [`MergeMany`](./modify#mergemany)

## [Операции удаления](./delete)

Функции удаления узлов JSON-данных.

**Основные функции**: [`Delete`](./delete#delete) · [`DeleteClean`](./delete#deleteclean)

## [Кодирование и вывод](./output)

Функции сериализации, десериализации и потокового кодирования/декодирования.

**Основные функции**: [`Marshal`](./output#marshal) · [`Unmarshal`](./output#unmarshal) · [`MarshalIndent`](./output#marshalindent) · [`Encode`](./output#encode) · [`EncodePretty`](./output#encodepretty) · [`EncodeWithConfig`](./output#encodewithconfig) · [`Prettify`](./output#prettify) · [`Compact`](./output#compact) · [`CompactString`](./output#compactstring) · [`Indent`](./output#indent) · [`HTMLEscape`](./output#htmlescape) · [`NewEncoder`](../types#encoder-json-кодировщик) · [`NewDecoder`](../types#decoder-json-декодер) · [`EncodeBatch`](../processor/output#encodebatch) · [`EncodeFields`](../processor/output#encodefields) · [`EncodeStream`](../processor/output#encodestream) · [`SaveToWriter`](./file-io#savetowriter)

## [Парсинг и валидация](./parse)

Функции парсинга JSON в целевые объекты, парсинга через экземпляр Processor, проверки корректности JSON и валидации Schema.

**Основные функции**: [`Parse`](./parse#parse) · [`ParseAny`](./parse#parseany) · [`Processor.Parse`](./parse#processor-parse) · [`Processor.ParseAny`](./parse#processor-parseany) · [`Valid`](./parse#valid) · [`ValidWithConfig`](./parse#validwithconfig) · [`ValidateSchema`](./parse#validateschema)

## [Пакетные операции](./batch)

Функции пакетной обработки нескольких JSON-операций (get/set/delete/validate).

**Основные функции**: [`ProcessBatch`](./batch#processbatch) · [`BatchOperation`](./batch#batchoperation) · [`BatchResult`](./batch#batchresult)

## [JSONL](./jsonl)

Функции парсинга JSONL (JSON Lines), потокового чтения, преобразования и записи.

**Основные функции**: [`ParseJSONL`](./jsonl#parsejsonl) · [`ToJSONL`](./jsonl#tojsonl) · [`ToJSONLString`](./jsonl#tojsonlstring) · [`StreamLinesInto[T]`](./jsonl#streamlinesinto) · [`NewJSONLWriter`](./jsonl#newjsonlwriter)

## [Файловые операции](./file-io)

Функции чтения/записи файлов и потокового ввода-вывода.

**Основные функции**: [`LoadFromFile`](./file-io#loadfromfile) · [`LoadFromReader`](./file-io#loadfromreader) · [`SaveToFile`](./file-io#savetofile) · [`MarshalToFile`](./file-io#marshaltofile) · [`UnmarshalFromFile`](./file-io#unmarshalfromfile) · [`SaveToWriter`](./file-io#savetowriter)

## [Методы итерации](./iterate)

Функции итерации JSON-массивов, объектов, вложенных структур и файлов.

**Основные функции**: [`Foreach`](./iterate#foreach) · [`ForeachWithPath`](./iterate#foreachwithpath) · [`ForeachNested`](./iterate#foreachnested) · [`ForeachReturn`](./iterate#foreachreturn) · [`ForeachWithError`](./iterate#foreachwitherror) · [`ForeachNestedWithError`](./iterate#foreachnestedwitherror) · [`ForeachWithPathAndIterator`](./iterate#foreachwithpathanditerator) · [`ForeachWithPathAndControl`](./iterate#foreachwithpathandcontrol) · [`ForeachFile`](./iterate#foreachfile) · [`ForeachFileWithPath`](./iterate#foreachfilewithpath) · [`ForeachFileChunked`](./iterate#foreachfilechunked) · [`ForeachFileNested`](./iterate#foreachfilenested)

## [Итерация файлов](../../streaming/large-files)

Руководство и практика по сценариям потоковой итерации файлов (справочник API пакетных функций `ForeachFile*` см. в [Методах итерации](./iterate#функции-итерации-файлов)).

**Основные функции**: [`ForeachFile`](./iterate#foreachfile) · [`ForeachFileWithPath`](./iterate#foreachfilewithpath) · [`ForeachFileChunked`](./iterate#foreachfilechunked) · [`ForeachFileNested`](./iterate#foreachfilenested)

## [Вспомогательные инструменты](../helpers)

Утилиты преобразования типов, сравнения, управления кэшем, обработки ошибок и др.

**Основные функции**: [`CompareJSON`](../helpers#comparejson) · [`MergeJSON`](../helpers#mergejson) · [`MergeMany`](../helpers#mergemany) · [`ClearCache`](../helpers#clearcache-функция-уровня-пакета) · [`GetStats`](../helpers#getstats-функция-уровня-пакета) · [`GetHealthStatus`](../helpers#gethealthstatus-функция-уровня-пакета) · [`SetGlobalProcessor`](../helpers#setglobalprocessor) · [`ShutdownGlobalProcessor`](../helpers#shutdownglobalprocessor) · [`SafeError`](../helpers#safeerror) · [`RedactedPath`](../helpers#redactedpath) · [`WarmupCache`](../helpers#warmupcache)

---

## Быстрая навигация

| Назначение | Рекомендуемые функции | Документация |
|------|----------|------|
| Получить одно значение | `GetString`, `GetInt`, `GetFloat`, `GetBool` | [Запросы и получение](./query#функции-запросов-по-путям) |
| Получить значение любого типа | `Get`, `GetTyped[T]` | [Запросы и получение](./query#обобщённые-функции-получения) |
| Получение со значением по умолчанию | `GetString(data, path, "default")` | [Запросы и получение](./query#функции-типобезопасного-получения) |
| Обобщённое получение | `GetTyped[T](data, path, defaultValue...)` | [Запросы и получение](./query#обобщённые-функции-получения) |
| Пакетное получение | `GetMultiple` | [Запросы и получение](./query#расширенные-методы-processor) |
| Изменить JSON | `Set`, `SetCreate` | [Операции изменения](./modify) |
| Удалить из JSON | `Delete`, `DeleteClean` | [Операции удаления](./delete) |
| Сериализация | `Marshal`, `Encode` | [Кодирование и вывод](./output#функции-сериализации) |
| Десериализация | `Unmarshal`, `Parse` | [Кодирование и вывод](./output#функции-сериализации) · [Парсинг и валидация](./parse#функции-парсинга) |
| Форматирование | `Prettify`, `CompactString`, `Processor.Compact` | [Кодирование и вывод](./output#функции-сериализации) |
| Печать вывода | `Encode` + `fmt.Println`, `EncodePretty` | [Форматированный вывод](../../getting-started/print) |
| Пакетное кодирование | `EncodeBatch`, `EncodeFields`, `EncodeStream` | [Пакетное кодирование](./output#функции-пакетного-кодирования) · [Вывод Processor](../processor/output) |
| Пакетные операции | `ProcessBatch` | [Пакетные операции](./batch) |
| Прогрев кэша | `WarmupCache` | [Пакетные операции](./batch#прогрев-кэша-warmupcache) |
| Валидация | `Valid` | [Парсинг и валидация](./parse#функции-валидации) |
| Валидация JSON Schema | `ValidateSchema` | [Парсинг и валидация](./parse#validateschema) |
| Пресет Schema по умолчанию | `DefaultSchema`, `DefaultSchemaConfig` | [Валидация Schema](../schema#defaultschema) |
| Чтение/запись файлов | `LoadFromFile`, `SaveToFile` | [Файловые операции](./file-io#чтение-и-запись-файлов) |
| Чтение/запись файлов (структуры) | `MarshalToFile`, `UnmarshalFromFile` | [Файловые операции](./file-io#удобные-методы-сериализации) |
| Потоковый ввод-вывод | `LoadFromReader`, `SaveToWriter` | [Файловые операции](./file-io#потоковый-ввод-вывод) |
| Итерация и обход | `Foreach`, `ForeachWithPath`, `ForeachNested` | [Методы итерации](./iterate#сравнение-методов) |
| Итерация файлов | `ForeachFile`, `ForeachFileChunked` | [Методы итерации](./iterate#сравнение-методов-итерации-файлов) |
| Обработка JSONL | `ParseJSONL`, `ToJSONL` | [JSONL](./jsonl#функции-обработки-jsonl) |
| Потоковая обработка JSONL | `StreamJSONL`, `StreamLinesInto[T]`, `FirstJSONL` | [JSONL](./jsonl#функции-потоковой-обработки-jsonl-уровня-пакета) |
| Сравнение | `CompareJSON` | [Вспомогательные инструменты](../helpers#функции-сравнения-json) |
| Слияние | `MergeJSON`, `MergeMany` | [Операции изменения](./modify#функции-слияния) |
| Преобразование типов | методы преобразования типа AccessResult | [Вспомогательные инструменты](../helpers#методы-преобразования-типов-accessresult) |
| Обработка ошибок | `JsonsError`, `errors.Is` | [Константы и ошибки](../constants#переменные-ошибок) |

## См. также

- [Processor](../processor/) - методы процессора
- [Config](../config) - параметры конфигурации
- [Константы и ошибки](../constants) - типы ошибок
- [Определения интерфейсов](../interfaces) - интерфейсы расширения
- [Синтаксис path-выражений](../../getting-started/path-syntax) - подробный разбор синтаксиса путей
