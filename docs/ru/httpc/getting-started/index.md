---
sidebar_label: "Быстрый старт"
title: "Быстрый старт - CyberGo HTTPC | Начало за 5 минут"
description: "Руководство по быстрому старту HTTPC: установка go get и инициализация проекта, отправка GET/POST-запросов и обработка ответов, выбор из пяти пресетов конфигурации, парсинг JSON и привязка типов, аутентификация Bearer Token и обработка ошибок ClientError — освойте безопасную библиотеку HTTP-клиента за пять минут."
sidebar_position: 1
---

# Быстрый старт

## Установка

```bash
go get github.com/cybergodev/httpc
```

## Базовый запрос

Используйте функции пакета напрямую без создания клиента:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    result, err := httpc.Get("https://httpbin.org/get")
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println(result.StatusCode()) // 200
    fmt.Println(result.Body())       // содержимое ответа
}
```

Поддерживаемые HTTP-методы: `Get`, `Post`, `Put`, `Patch`, `Delete`, `Head`, `Options`.

## Создание клиента

При необходимости пользовательской конфигурации создайте экземпляр клиента:

```go
client, err := httpc.NewDefault()
if err != nil {
    log.Fatal(err)
}
defer client.Close()

result, err := client.Get("https://httpbin.org/get")
```

### Предустановки конфигурации

| Конфигурация | Назначение | Особенности |
|--------------|------------|-------------|
| `DefaultConfig()` | Универсальные сценарии | Безопасные значения по умолчанию, защита от SSRF включена |
| `SecureConfig()` | Сценарии с повышенными требованиями к безопасности | Отключение автоматических редиректов, строгие тайм-ауты |
| `PerformanceConfig()` | Сценарии с высокой пропускной способностью | Большой пул соединений, длинные тайм-ауты, включены Cookie |
| `TestingConfig()` | Тестовая среда | Отключение проверок безопасности и HTTP/2, включены Cookie |
| `MinimalConfig()` | Лёгкие запросы | Без повторных попыток, без редиректов |

```go
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 60 * time.Second

client, err := httpc.New(cfg)
```

## Обработка ответа

```go
result, err := client.Get("https://httpbin.org/json")
if err != nil {
    log.Fatal(err)
}

// Проверка статуса
result.StatusCode()     // 200
result.IsSuccess()      // true (2xx)
result.IsClientError()  // false (4xx)
result.IsServerError()  // false (5xx)

// Парсинг JSON
var data map[string]any
if err := result.Unmarshal(&data); err != nil {
    log.Fatal(err)
}
```

## Отправка данных

```go
// JSON
result, err := client.Post("https://httpbin.org/post",
    httpc.WithJSON(map[string]any{"name": "test"}),
)
```

```go
// Форма
result, err := client.Post("https://httpbin.org/post",
    httpc.WithForm(map[string]string{"username": "admin"}),
)
```

```go
// С аутентификацией
result, err := client.Get("https://api.example.com/data",
    httpc.WithBearerToken("my-token"),
)
```

## Обработка ошибок

HTTPC разделяет **ошибки сетевого уровня** и **HTTP-коды состояния**:

```go
result, err := client.Get("https://api.example.com/data")
if err != nil {
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        log.Printf("Код ошибки: %s", clientErr.Code())
    }
    log.Fatal(err)
}

// HTTP-коды состояния необходимо проверять вручную
switch {
case result.IsSuccess():
    // 2xx успех
case result.IsClientError():
    log.Printf("Ошибка клиента: %d", result.StatusCode())
case result.IsServerError():
    log.Printf("Ошибка сервера: %d", result.StatusCode())
}
```

:::tip Подсказка
Коды 4xx/5xx не возвращаются как `error`, их необходимо проверять через методы `result.IsSuccess()` и подобные. Подробнее см. [Обработка ошибок](../guides/error-handling).
:::

## Дальнейшие шаги

- **[Практическое руководство](../guides/tutorial)** — создание клиента GitHub API за 30 минут
- **[Основные концепции](./concepts)** — двухуровневая архитектура, система конфигурации и проектные решения
- **[Запрос и ответ](../guides/request-response)** — полные опции запроса и обработка ответа
- **[Базовые примеры](../examples/basic-usage)** — практические варианты использования GET/POST/middleware
- **[Шпаргалка](./cheatsheet)** — быстрая справка по распространённым операциям
- **[Безопасность](../security/)** — лучшие практики безопасности
