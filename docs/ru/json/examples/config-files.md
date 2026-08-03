---
sidebar_label: "Файлы конфигурации"
title: "Файлы конфигурации - CyberGo JSON | Загрузка и слияние"
description: "Работа с конфигурацией в CyberGo JSON: LoadFromFile загрузка, GetString/GetInt чтение, Set/SetCreate изменение, SaveToFile сохранение и MergeJSON слияние."
sidebar_position: 3
---

# Файлы конфигурации

В этом руководстве показано, как обрабатывать типичные сценарии работы с файлами конфигурации в CyberGo JSON: загрузка, чтение вложенных значений, изменение, сохранение и слияние конфигурации по умолчанию с пользовательской.

## Полный жизненный цикл конфигурации

Загрузка конфигурации → чтение вложенных значений → изменение → сохранение обратно в файл → перезагрузка для проверки. В примере используется временный файл, чтобы он работал автономно.

```go
package main

import (
    "fmt"
    "os"
    "path/filepath"

    "github.com/cybergodev/json"
)

func main() {
    // Используем временный каталог, чтобы пример работал автономно
    tmpDir, err := os.MkdirTemp("", "cybergo-config-*")
    if err != nil {
        panic(err)
    }
    defer os.RemoveAll(tmpDir)

    configPath := filepath.Join(tmpDir, "config.json")

    // Записываем исходный файл конфигурации
    initial := `{
        "server": {"host": "0.0.0.0", "port": 8080},
        "database": {"host": "localhost", "port": 5432, "name": "appdb"},
        "logging": {"level": "info"}
    }`
    if err := os.WriteFile(configPath, []byte(initial), 0644); err != nil {
        panic(err)
    }

    // 1. Загружаем конфигурацию из файла
    data, err := json.LoadFromFile(configPath)
    if err != nil {
        panic(err)
    }

    // 2. Читаем вложенные значения (поддерживается необязательный аргумент по умолчанию)
    fmt.Printf("Сервер: %s:%d\n", json.GetString(data, "server.host"), json.GetInt(data, "server.port"))
    fmt.Printf("База данных: %s/%s\n", json.GetString(data, "database.host"), json.GetString(data, "database.name"))
    fmt.Printf("Уровень логирования: %s\n", json.GetString(data, "logging.level", "info"))

    // 3. Изменяем конфигурацию (обновляем существующие значения)
    data, err = json.Set(data, "server.port", 9090)
    if err != nil {
        panic(err)
    }
    data, err = json.Set(data, "logging.level", "debug")
    if err != nil {
        panic(err)
    }

    // 4. Сохраняем обратно в файл (с форматированием)
    if err := json.SaveToFile(configPath, data, json.PrettyConfig()); err != nil {
        panic(err)
    }

    // 5. Перезагружаем, чтобы проверить сохранение изменений
    reloaded, err := json.LoadFromFile(configPath)
    if err != nil {
        panic(err)
    }
    fmt.Printf("Порт после перезапуска: %d\n", json.GetInt(reloaded, "server.port"))
    fmt.Printf("Лог после перезапуска: %s\n", json.GetString(reloaded, "logging.level"))
}
```

## Слияние конфигурации по умолчанию и пользовательской

В реальных приложениях часто нужно наложить пользовательскую конфигурацию поверх встроенных значений по умолчанию, а затем дополнить недостающие вложенные пути. `MergeJSON` выполняет **глубокое слияние** (пользовательские значения имеют приоритет), а `SetCreate` автоматически создаёт промежуточные пути, которых ещё нет.

```go
package main

import (
    "fmt"

    "github.com/cybergodev/json"
)

func main() {
    // Встроенная конфигурация по умолчанию
    defaults := `{
        "server": {"host": "0.0.0.0", "port": 8080, "timeout": 30},
        "database": {"host": "localhost", "port": 5432, "pool": 10},
        "logging": {"level": "info", "format": "json"}
    }`

    // Пользовательская конфигурация (переопределяет часть полей)
    userConfig := `{
        "server": {"port": 3000},
        "database": {"host": "db.prod.example.com"},
        "logging": {"level": "debug"}
    }`

    // Глубокое слияние: пользовательская конфигурация переопределяет умолчания, непереопределённые поля сохраняются
    merged, err := json.MergeJSON(defaults, userConfig)
    if err != nil {
        panic(err)
    }
    fmt.Printf("Порт: %d (переопределён пользователем)\n", json.GetInt(merged, "server.port"))
    fmt.Printf("Таймаут: %d (значение по умолчанию)\n", json.GetInt(merged, "server.timeout"))
    fmt.Printf("База данных: %s:%d\n", json.GetString(merged, "database.host"), json.GetInt(merged, "database.port"))

    // SetCreate добавляет вложенные пути, которых ещё нет (создаёт промежуточные объекты)
    merged, err = json.SetCreate(merged, "features.metrics.enabled", true)
    if err != nil {
        panic(err)
    }
    merged, err = json.SetCreate(merged, "features.metrics.endpoint", "/metrics")
    if err != nil {
        panic(err)
    }

    fmt.Printf("Метрики включены: %v\n", json.GetBool(merged, "features.metrics.enabled"))
    fmt.Printf("Адрес метрик: %s\n", json.GetString(merged, "features.metrics.endpoint"))
}
// Вывод:
// Порт: 3000 (переопределён пользователем)
// Таймаут: 30 (значение по умолчанию)
// База данных: db.prod.example.com:5432
// Метрики включены: true
// Адрес метрик: /metrics
```

:::tip Подсказка
`MergeJSON` выполняет глубокое рекурсивное слияние: ключи объектов объединяются слой за слоем, а массивы и скалярные значения заменяются напрямую. Чтобы объединить несколько источников конфигурации за раз, используйте `MergeMany([]string{...})`.
:::

## Следующие шаги

- [Базовые примеры](./index) — запросы по пути, изменение, основы кодирования структур
- [Шпаргалка](../getting-started/cheatsheet) — быстрый справочник по API
- [Синтаксис пути](../getting-started/path-syntax) — полный синтаксис путей (срезы, подстановки)
- [Вспомогательные функции](../api-reference/helpers) — `MergeJSON`, `CompareJSON` и другие утилиты
