---
sidebar_label: "Формат файла"
title: "Формат файла - CyberGo env | синтаксис .env/JSON/YAML"
description: "Справочник по форматам конфигурационных файлов CyberGo env: синтаксические правила трёх форматов .env, JSON, YAML, кавычки и префикс export, подстановка переменных ${VAR}, многострочные строки, плоское преобразование вложенных объектов и массивов, UTF-8 кодировка и механизм автоопределения DetectFormat."
sidebar_position: 1
---

# Формат файла

Библиотека env поддерживает несколько форматов конфигурационных файлов: `.env`, JSON и YAML.

## Формат .env

### Базовый синтаксис

```bash
# Комментарий
KEY=value

# Знак равенства в значении
URL=https://example.com?foo=bar

# Пустые строки игнорируются

# Недопустимо: ключ не может содержать пробелы
# MY KEY=value
```

### Кавычки

```bash
# Двойные кавычки: сохраняют пробелы, поддерживают экранирование
MESSAGE="Hello World"
PATH="/usr/local/bin"

# Одинарные кавычки: не обрабатывают экранирование (сохраняют обратные слэши как есть)
# Примечание: одинарные кавычки не предотвращают подстановку переменных — подстановка выполняется после снятия кавычек
LITERAL='no escaping here: \n stays literal'

# Без кавычек
SIMPLE=value

# Пустые значения
EMPTY=
EMPTY=""
EMPTY=''
```

### Escape-символы

В двойных кавычках поддерживается экранирование:

```bash
# Перевод строки
MULTILINE="line1\nline2"

# Табуляция
TABBED="col1\tcol2"

# Кавычки
QUOTED="He said \"Hello\""

# Обратный слэш
PATH="C:\\Users\\name"

# Знак доллара
PRICE="Price: \$100"
```

### Подстановка переменных

Поддерживается при включённом `ExpandVariables`:

```bash
# Ссылка на другие переменные
BASE_URL=https://api.example.com
API_URL=${BASE_URL}/v1

# Простой синтаксис
URL=$BASE_URL/path

# Значения по умолчанию
HOST=${HOST:-localhost}
PORT=${PORT:-8080}

# Вложенная подстановка
SERVICE=${CLUSTER:-default}-${REGION:-us-east}
```

### Синтаксис export

Поддерживается при включённом `AllowExportPrefix`:

```bash
# Экспорт в стиле bash
export KEY=value
export ANOTHER="quoted value"
```

### Стиль YAML

Поддерживается при включённом `AllowYamlSyntax`:

```bash
# Пары ключ-значение в стиле YAML
KEY: value
ANOTHER: "quoted value"
```

### Многострочные значения

Парсер `.env` сканирует построчно, каждая строка разбирается независимо, **не поддерживаются строковые кавычки, охватывающие несколько строк** — значения в двойных кавычках должны закрываться в одной строке, иначе возвращается `ErrInvalidValue`. Для переноса строки используйте escape `\n` (действует только в двойных кавычках, одинарные кавычки не обрабатывают escape):

```bash
# \n внутри двойных кавычек будет разобрано как символ переноса строки
LINES="line1\nline2\nline3"
# Фактическое значение — три строки текста: line1 / line2 / line3

# Многострочные сертификаты вроде PRIVATE_KEY рекомендуется собирать через \n
PRIVATE_KEY="-----BEGIN KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END KEY-----"
```

Для настоящих кросс-строковых значений используйте [формат JSON или YAML](#Определение-формата) или расширьте поддержку многострочности через пользовательский парсер.

## Формат JSON

### Базовая структура

```json
{
    "APP_NAME": "my-app",
    "APP_VERSION": "1.0.0",
    "DEBUG": true,
    "PORT": 8080
}
```

### Вложенные объекты

Вложенные объекты плоско преобразуются:

```json
{
    "database": {
        "host": "localhost",
        "port": 5432
    }
}
```

Результат:

```text
DATABASE_HOST=localhost
DATABASE_PORT=5432
```

### Массивы

Массивы плоско преобразуются в индексные ключи:

```json
{
    "ALLOWED_HOSTS": ["localhost", "example.com"],
    "PORTS": [80, 443, 8080]
}
```

Результат:

```text
ALLOWED_HOSTS_0=localhost
ALLOWED_HOSTS_1=example.com
PORTS_0=80
PORTS_1=443
PORTS_2=8080
```

::: tip Доступ к элементам массива
Используйте функцию `GetSlice[T]` или доступ по пути через точку к индексным ключам:
```go
hosts := env.GetSlice[string]("ALLOWED_HOSTS")
port0 := env.GetInt("PORTS_0")  // 80
```
Подробнее см. [документацию GetSlice](/ru/env/api-reference/functions#getslice-t).
:::

### Параметры преобразования типов

```go
cfg := env.DefaultConfig()

// null преобразуется в пустую строку
cfg.JSONNullAsEmpty = true

// Числа преобразуются в строки
cfg.JSONNumberAsString = true

// Логические значения преобразуются в строки
cfg.JSONBoolAsString = true
```

### Ограничение глубины

```go
cfg.JSONMaxDepth = 10  // Максимальная глубина вложенности
```

## Формат YAML

### Базовая структура

```yaml
APP_NAME: my-app
APP_VERSION: "1.0.0"
DEBUG: true
PORT: 8080
```

### Вложенные структуры

```yaml
database:
  host: localhost
  port: 5432
  credentials:
    user: admin
    password: secret
```

Результат плоского преобразования:

```text
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_CREDENTIALS_USER=admin
DATABASE_CREDENTIALS_PASSWORD=secret
```

### Списки

Списки плоско преобразуются в индексные ключи:

```yaml
allowed_hosts:
  - localhost
  - example.com
  - api.example.com
```

Результат:

```text
ALLOWED_HOSTS_0=localhost
ALLOWED_HOSTS_1=example.com
ALLOWED_HOSTS_2=api.example.com
```

### Многострочные строки

::: warning Внимание
Блочные скаляры YAML (литеральный блок `|` и свёрнутый блок `>`) **в настоящее время не поддерживаются**. Парсер рассматривает `|`/`>` как обычные скалярные символы, а последующие строки с отступами нарушат разбор пар ключ-значение.
:::

Для значений, требующих сохранения переносов, используйте двойные кавычки с escape `\n`:

```yaml
description: "Line1\nLine2\nLine3"
```

Или расширьте поддержку блочных скаляров через пользовательский парсер.

### Параметры преобразования типов

```go
cfg := env.DefaultConfig()

cfg.YAMLNullAsEmpty = true
cfg.YAMLNumberAsString = true
cfg.YAMLBoolAsString = true
cfg.YAMLMaxDepth = 10
```

## Определение формата

### Автоопределение

```go
// Определение по расширению
format := env.DetectFormat("config.json")   // FormatJSON
format = env.DetectFormat("settings.yaml")  // FormatYAML
format = env.DetectFormat(".env")           // FormatEnv

// При отсутствии совпадающего расширения возвращается FormatAuto (по умолчанию используется парсер .env)
format = env.DetectFormat("config")  // FormatAuto
```

### Константы форматов

```go
const (
    FormatAuto  FileFormat = iota  // Автоопределение
    FormatEnv                      // Формат .env
    FormatJSON                     // Формат JSON
    FormatYAML                     // Формат YAML
)
```

### Строковое представление формата

```go
format := env.FormatJSON
fmt.Println(format.String())  // Вывод: json
```

## Лучшие практики

### Выбор формата

| Сценарий | Рекомендуемый формат |
|----------|----------------------|
| Простая конфигурация | `.env` |
| Сложная вложенная конфигурация | JSON или YAML |
| Совместное использование с другими инструментами | JSON |
| Приоритет читаемости для человека | YAML |
| Окружение Docker/K8s | `.env` |

### Именование файлов

```bash
.env              # Конфигурация по умолчанию
.env.local        # Локальное переопределение (не коммитится)
.env.development  # Среда разработки
.env.staging      # Staging-среда
.env.production   # Продакшн-среда
.env.test         # Тестовая среда
```

### Смешанное использование

```go
// Можно смешивать разные форматы
loader.LoadFiles(
    "base.env",           // Базовая конфигурация
    "database.json",      // Конфигурация базы данных
    "secrets.yaml",       // Чувствительная конфигурация
    ".env.local",         // Локальное переопределение
)
```

### Git ignore

```bash
# Игнорировать чувствительную конфигурацию
.env.local
.env.*.local
.env.production
secrets.yaml

# Сохранить шаблоны
!.env.example
```

## Связанная документация

- [Многоформатная конфигурация](/ru/env/guides/multi-format) - руководство по загрузке нескольких форматов
- [ComponentFactory API](/ru/env/api-reference/factory) - справочник функции DetectFormat
- [Config API](/ru/env/api-reference/config) - параметры разбора JSON/YAML
