---
sidebar_label: "Защита безопасности"
title: "Безопасность - CyberGo html | многоуровневый API"
description: "API безопасности CyberGo html: санитизация контента, лимиты ввода, глубина DOM, защита от обхода пути, песочница AllowedBaseDir и пресет HighSecurityConfig."
sidebar_position: 5
---

# Защита безопасности

HTML-библиотека имеет встроенную многоуровневую защиту. Все настройки централизованы в полях безопасности [Config](../core/config). Эта страница описывает API, связанный с безопасностью; концептуальный обзор см. в [Обзор безопасности](../../guides/security/).

## Поля конфигурации безопасности

| Поле | Тип | По умолчанию | Назначение безопасности |
|------|-----|-------------|------------------------|
| `EnableSanitization` | `bool` | `true` | Санитизация контента: удаление опасных тегов, атрибутов событий и вредоносных протоколов |
| `MaxInputSize` | `int` | `52428800` (50МБ) | Лимит размера ввода, предотвращает исчерпание памяти |
| `MaxDepth` | `int` | `500` | Лимит глубины вложенности DOM, предотвращает рекурсивные бомбы |
| `ProcessingTimeout` | `time.Duration` | `30s` | Тайм-аут обработки документа, предотвращает бесконечную обработку |
| `AllowedBaseDir` | `string` | `""` | Песочница файловых операций, предотвращает обход пути |
| `Audit` | `AuditConfig` | `DefaultAuditConfig()` | Настройка аудита безопасности (см. [Система аудита](./audit)) |

:::warning Риск отключения санитизации
`EnableSanitization` включён по умолчанию. **Отключайте только для полностью доверенного ввода.** Отключение приводит к парсингу HTML как есть, что может привести к XSS-рискам.
:::

## Санитизация контента

При включении (по умолчанию) автоматически применяется следующая очистка:

| Уровень защиты | Поведение |
|----------------|-----------|
| Опасные теги | Удаляет `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>` и т.д. |
| Атрибуты событий | Удаляет все атрибуты `on*` (`onclick`, `onerror` и т.д.) |
| Опасные протоколы | Блокирует `javascript:`, `vbscript:` |
| Data URL | Разрешает только `data:image/*`, `data:font/*`, `data:application/pdf` |

Заблокированный контент записывается через систему аудита (требуется включение аудита).

## Безопасность путей

### Песочница AllowedBaseDir

Ограничивает файловые операции (`ExtractFromFile` и т.д.) указанной директорией и её подкаталогами:

```go
cfg := html.DefaultConfig()
cfg.AllowedBaseDir = "/var/www/html"

p, err := html.New(cfg)
if err != nil {
    log.Fatal(err)
}
defer p.Close()

// ✅ Разрешено: файл внутри директории
result, err := p.ExtractFromFile("/var/www/html/page.html")

// ❌ Отклонено: файл вне директории
_, err = p.ExtractFromFile("/etc/passwd")
```

После настройки пути файлов должны находиться внутри `AllowedBaseDir` для чтения. Кроссплатформенная поддержка:

- **Unix**: Разрешает символические ссылки, предотвращает побег через ссылки
- **Windows**: Разрешает junction и символические ссылки

Пустое значение (по умолчанию) означает отсутствие ограничений — подходит для доверенных сценариев ввода.

### Обнаружение обхода пути

Автоматически обнаруживает и блокирует попытки обхода пути (например, `../../../etc/passwd`), возвращая ошибку `*FileError`:

```go
_, err := html.ExtractFromFile("../../../etc/passwd")
// err содержит информацию "path traversal detected"
```

### FileError.SafePath

Ошибки файлов автоматически маскируют информацию о пути, предотвращая утечку структуры файловой системы:

```go
type FileError struct {
    Op      string
    Path    string
    FileErr error
}

func (e *FileError) Error() string        // Вывод усечённого пути (только имя файла)
func (e *FileError) SafePath() string     // Возвращает только имя файла
func (e *FileError) MarshalJSON() ([]byte, error) // Автоматическое маскирование при JSON-сериализации
```

```go
_, err := html.ExtractFromFile("/var/www/secret/config.html")
if err != nil {
    var fileErr *html.FileError
    if errors.As(err, &fileErr) {
        fmt.Println(fileErr.SafePath()) // Вывод: config.html (без пути)
    }
}
```

:::tip
`FileError.Error()` и `SafePath()` возвращают усечённый безопасный путь (только имя файла), предотвращая утечку пути. Для внутренней отладки обратитесь к полю `Path` напрямую.
:::

## Пресет безопасности

### HighSecurityConfig

Пресет для сред с высокой безопасностью, ужесточающий все ограничения и включающий комплексный аудит:

```go
func HighSecurityConfig() Config
```

Переопределение полей безопасности по сравнению с `DefaultConfig()`:

| Поле | По умолчанию | Высокая безопасность |
|------|-------------|---------------------|
| `MaxInputSize` | `52428800` (50МБ) | `10485760` (10МБ) |
| `MaxDepth` | `500` | `100` |
| `ProcessingTimeout` | `30s` | `10s` |
| `WorkerPoolSize` | `4` | `2` |
| `Audit` | `DefaultAuditConfig()` | `HighSecurityAuditConfig()` |

```go
cfg := html.HighSecurityConfig()
p, err := html.New(cfg)
if err != nil {
    log.Fatal(err)
}
defer p.Close()
```

## Ошибки, связанные с безопасностью

| Ошибка | Условие срабатывания |
|--------|---------------------|
| `ErrInputTooLarge` | Ввод превышает `MaxInputSize` |
| `ErrMaxDepthExceeded` | Глубина DOM превышает `MaxDepth` |
| `ErrProcessingTimeout` | Обработка превышает `ProcessingTimeout` |
| `ErrInvalidFilePath` | Проверка пути файла не пройдена (включая обход пути) |
| `ErrInternalPanic` | Внутренняя паника восстановлена |

:::info
Полные определения типов ошибок (`InputError`, `ConfigError`, `FileError`) и использование `errors.Is`/`errors.As` см. в [Константы и ошибки](../types/constants).
:::

## Восстановление после паники

Все операции извлечения имеют встроенный механизм восстановления после паники. Даже при возникновении неожиданной паники во время обработки возвращается `ErrInternalPanic` вместо аварийного завершения сервиса:

```go
result, err := html.Extract(maliciousData)
if err != nil {
    if errors.Is(err, html.ErrInternalPanic) {
        // Ввод мог вызвать внутренний баг
        log.Printf("panic recovered: %v", err)
    }
}
```

## Связанная документация

- [Обзор безопасности](../../guides/security/) — Концептуальное введение и лучшие практики
- [Система аудита](./audit) — Конвейер аудита, типы событий и Sink
- [Конфигурация](../core/config) — Полный справочник полей Config
- [Константы и ошибки](../types/constants) — Сигнальные ошибки и типы ошибок
- [Контрольный список для производства](../../guides/security/production-checklist) — Проверка безопасности перед запуском
