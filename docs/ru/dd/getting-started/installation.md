---
sidebar_label: "Установка"
title: "Установка - CyberGo DD | Требования и интеграция"
description: "Руководство по установке библиотеки логирования CyberGo DD. Охватывает требования к версии Go, установку через go get, интеграцию с Go Module, рекомендации по настройке CI/CD и устранение распространённых проблем установки, помогая разработчикам быстро интегрировать DD в проекты."
sidebar_position: 1
---

# Установка

## Требования к среде

| Требование | Версия |
|------------|--------|
| Go | ≥ 1.25 |
| ОС | Linux / macOS / Windows |

:::tip Версия Go
DD использует некоторые возможности Go 1.25. Если в вашем проекте используется более старая версия Go, обновите инструментальную цепочку: `go env -w GOTOOLCHAIN=go1.25.0+auto`.
:::

## Быстрая установка

```bash
go get github.com/cybergodev/dd
```

## Интеграция с Go Module

Выполните в корневой директории проекта:

```bash
# Инициализация модуля (если ещё нет go.mod)
go mod init your-project

# Добавление зависимости DD
go get github.com/cybergodev/dd
```

Импорт пакета:

```go
import "github.com/cybergodev/dd"
```

Проверка установки:

```go
package main

import "github.com/cybergodev/dd"

func main() {
    dd.Info("DD успешно установлен!")
}
```

## Управление версиями

### Фиксация версии

```bash
# Установка конкретной версии
go get github.com/cybergodev/dd@v1.0.0

# Обновление до последней версии
go get github.com/cybergodev/dd@latest
```

### Управление зависимостями

```bash
# Очистка зависимостей (удаление неиспользуемых, добавление недостающих)
go mod tidy

# Проверка текущей версии зависимости
go list -m github.com/cybergodev/dd
```

## Интеграция с CI/CD

Использование DD в GitHub Actions:

```yaml
steps:
  - uses: actions/setup-go@v5
    with:
      go-version: '1.25'
  - uses: actions/checkout@v4
  - run: go mod download
  - run: go build ./...
```

:::warning Приватные репозитории
Если DD размещён на приватном Git-сервере, настройте переменную окружения GOPRIVATE:

```bash
go env -w GOPRIVATE=github.com/cybergodev/*
```
:::

## Устранение неисправностей

### Ошибка `go get`: `module not found`

Убедитесь, что Go ≥ 1.25, и проверьте настройки прокси:

```bash
go env -w GOPROXY=https://proxy.golang.org,direct
```

### Ошибка сборки `undefined: dd.xxx`

Выполните `go mod tidy` для синхронизации зависимостей, затем пересоберите проект.

## Следующие шаги

- [Быстрый старт](./) -- руководство для начала работы за 5 минут
- [Глобальный Logger](./global-logger) -- паттерн использования пакетных функций
- [Основные понятия](../guides/basics/core-concepts) -- понимание архитектуры DD
