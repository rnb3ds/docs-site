---
sidebar_label: "Обработка ошибок"
title: "Обработка ошибок - CyberGo html | надёжная логика"
description: "Обработка ошибок CyberGo html: пять категорий, errors.Is/As, отмена context и частичные неудачи пакетов для построения надёжной логики."
sidebar_position: 5
---

# Обработка ошибок

## Классификация ошибок

Ошибки библиотеки HTML делятся на следующие категории:

| Категория | Сигнатурные ошибки | Описание |
|------|----------|------|
| Ошибки ввода | `ErrInputTooLarge`, `ErrInvalidHTML` | Проблемы с содержимым ввода |
| Ошибки конфигурации | `ErrInvalidConfig`, `ErrMultipleConfigs` | Проблемы конфигурации |
| Файловые ошибки | `ErrFileNotFound`, `ErrInvalidFilePath` | Проблемы файловых операций |
| Ошибки обработки | `ErrProcessingTimeout`, `ErrMaxDepthExceeded` | Проблемы в процессе обработки |
| Системные ошибки | `ErrProcessorClosed`, `ErrInternalPanic` | Проблемы внутреннего состояния |

## Паттерн errors.Is

Использование `errors.Is` для определения типа ошибки:

```go
result, err := html.Extract(data)
if err != nil {
    switch {
    case errors.Is(err, html.ErrInputTooLarge):
        slog.Warn("Ввод слишком большой, уменьшите размер документа")
    case errors.Is(err, html.ErrInvalidHTML):
        slog.Warn("Некорректный HTML, проверьте ввод")
    case errors.Is(err, html.ErrProcessingTimeout):
        slog.Warn("Тайм-аут обработки, документ может быть слишком сложным")
    case errors.Is(err, html.ErrFileNotFound):
        slog.Warn("Файл не существует")
    case errors.Is(err, html.ErrMaxDepthExceeded):
        slog.Warn("Глубина DOM слишком велика, возможно злонамеренная конструкция")
    case errors.Is(err, html.ErrInternalPanic):
        slog.Error("Восстановление после внутренней паники, пожалуйста, сообщите об этой проблеме")
    default:
        slog.Error("Неизвестная ошибка", "err", err)
    }
}
```

## Паттерн errors.As

Извлечение структурированной информации об ошибках:

```go
var inputErr *html.InputError
var configErr *html.ConfigError
var fileErr *html.FileError

if errors.As(err, &inputErr) {
    fmt.Printf("Размер %d превышает лимит %d\n", inputErr.Size, inputErr.MaxSize)
}

if errors.As(err, &configErr) {
    fmt.Printf("Поле %s значение %v некорректно: %s\n", configErr.Field, configErr.Value, configErr.Message)
}

if errors.As(err, &fileErr) {
    fmt.Printf("Файловая операция: %s\n", fileErr.SafePath())
}
```

## Отмена через контекст

Использование версий `ExtractWithContext` для поддержки отмены:

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

result, err := html.ExtractWithContext(ctx, data)
if err != nil {
    switch {
    case errors.Is(err, html.ErrProcessingTimeout):
        // Внутренний тайм-аут ProcessingTimeout (в этот момент ctx.Err() может быть nil)
    case ctx.Err() == context.DeadlineExceeded:
        // Дедлайн пользовательского контекста истёк
    case ctx.Err() == context.Canceled:
        // Ручная отмена
    default:
        // Другие ошибки (ErrInvalidHTML, ErrInputTooLarge и т.д.)
        slog.Error("Извлечение не удалось", "err", err)
    }
}
```

## Ошибки пакетной обработки

Результаты пакетной обработки содержат как успешные, так и неудачные операции:

```go
batch := p.ExtractBatch(pages)

for i, err := range batch.Errors {
    if err != nil {
        fmt.Printf("Элемент %d не удался: %v\n", i, err)
    }
}

fmt.Printf("Успешно: %d, Неудачно: %d, Отменено: %d\n",
    batch.Success, batch.Failed, batch.Cancelled)
```

## Стратегии восстановления после ошибок

На практике одного определения типа ошибки недостаточно — нужно применять различные стратегии восстановления в зависимости от категории ошибки.

### Сбой определения кодировки

Когда HTML-ввод не содержит объявления `<meta charset>` и автоматическое определение не может распознать кодировку, библиотека возвращает ошибку с префиксом `"encoding detection failed"`. Это обычная упакованная ошибка `fmt.Errorf` (не сигнальная ошибка и не типизированная ошибка), которую можно обнаружить только сопоставлением строки сообщения об ошибке.

Стратегия восстановления: сначала используйте автоматическое определение (оставьте `Config.Encoding` пустым), при неудаче повторите попытку с известной кодировкой вручную.

```go
package main

import (
	"fmt"
	"log"
	"strings"

	"github.com/cybergodev/html"
	"golang.org/x/text/encoding/simplifiedchinese"
)

// extractWithEncodingFallback сначала пытается извлечь с автоматическим определением кодировки,
// при неудаче повторяет попытку с указанной кодировкой вручную.
func extractWithEncodingFallback(data []byte, fallbackEncoding string) (*html.Result, error) {
	// Первая попытка: автоматическое определение (Config.Encoding пуст)
	result, err := html.Extract(data)
	if err == nil {
		return result, nil
	}

	// При сбое определения кодировки — повтор с указанной кодировкой
	if strings.Contains(err.Error(), "encoding detection failed") {
		fmt.Printf("Автоопределение не удалось (%v), повтор с кодировкой %q...\n", err, fallbackEncoding)
		cfg := html.DefaultConfig()
		cfg.Encoding = fallbackEncoding
		return html.Extract(data, cfg)
	}

	// Другие ошибки (ввод слишком большой, некорректный HTML и т.д.) не повторяем
	return nil, err
}

func main() {
	// Конструируем HTML в кодировке GBK (без объявления charset, может вызвать сбой автоопределения)
	utf8HTML := `<html><head><title>Тест</title></head>` +
		`<body><article><h1>Заголовок</h1><p>Привет мир</p></article></body></html>`
	gbkBytes, err := simplifiedchinese.GBK.NewEncoder().Bytes([]byte(utf8HTML))
	if err != nil {
		log.Fatal(err)
	}

	result, err := extractWithEncodingFallback(gbkBytes, "gbk")
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("Заголовок: %s\n", result.Title)
	fmt.Printf("Текст: %s\n", result.Text)
	// Вывод:
	// Автоопределение не удалось (encoding detection failed: ...), повтор с кодировкой "gbk"...
	// Заголовок: Тест
	// Текст: Заголовок Привет мир
}
```

:::tip Подсказка
Повтор определения кодировки полезен при обработке HTML-документов неизвестного происхождения (например, старые китайские страницы из краулера). Если источник ввода фиксирован, просто укажите кодировку в `Config.Encoding` — логика повтора не нужна.
:::

### Восстановление после тайм-аута

`ErrProcessingTimeout` означает, что время обработки превысило `Config.ProcessingTimeout`. Стратегия восстановления зависит от характеристик документа:

| Стратегия | Подходящий сценарий | Действие |
|-----------|---------------------|---------|
| Снижение сложности | Структура документа сложная, но содержимое простое | Установить `ExtractArticle = false` для пропуска распознавания статьи |
| Увеличение тайм-аута | Документ действительно большой и корректный | Увеличить `ProcessingTimeout` |
| Упрощение вывода | Нужен только чистый текст | Использовать `TextOnlyConfig()` для отключения извлечения всех медиа |

```go
package main

import (
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/cybergodev/html"
)

func main() {
	// Первая попытка: стандартная конфигурация (тайм-аут 30 секунд)
	cfg := html.DefaultConfig()
	p, err := html.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer p.Close()

	largeHTML := []byte(`<html><body><article><h1>Большой документ</h1><p>` +
		strings.Repeat("содержимое ", 100000) + `</p></article></body></html>`)

	_, err = p.Extract(largeHTML)
	if err != nil {
		if errors.Is(err, html.ErrProcessingTimeout) {
			fmt.Println("Стандартная конфигурация превысила тайм-аут, переключение на упрощённый режим...")

			// Повтор: отключение распознавания статьи + режим чистого текста + больший тайм-аут
			retryCfg := html.TextOnlyConfig()
			retryCfg.ExtractArticle = false
			retryCfg.ProcessingTimeout = 60 * time.Second
			p2, err := html.New(retryCfg)
			if err != nil {
				log.Fatal(err)
			}
			defer p2.Close()

			result, err := p2.Extract(largeHTML)
			if err != nil {
				log.Fatal(err)
			}
			fmt.Printf("Повтор успешен, извлечено %d символов\n", len(result.Text))
		} else {
			log.Fatal(err)
		}
	}
}
```

### Ввод слишком большой

`ErrInputTooLarge` означает, что ввод превысил `Config.MaxInputSize` (по умолчанию 50 МБ, верхний предел также 50 МБ). Два способа обработки:

- **Уменьшить ввод**: если это веб-сервис, попросить пользователя загрузить файл меньшего размера
- **Увеличить лимит**: если бизнесу действительно нужно обрабатывать большие файлы, увеличить `MaxInputSize` (верхний предел 50 МБ)

```go
package main

import (
	"errors"
	"fmt"
	"log"
	"strings"

	"github.com/cybergodev/html"
)

func main() {
	cfg := html.DefaultConfig()
	cfg.MaxInputSize = 1024 // Лимит 1 КБ (для демонстрации)
	p, err := html.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer p.Close()

	// Конструируем ввод, превышающий лимит
	largeInput := []byte(strings.Repeat("<div>", 500))
	_, err = p.Extract(largeInput)
	if err != nil {
		var inputErr *html.InputError
		if errors.As(err, &inputErr) {
			fmt.Printf("Ввод %d байт превышает лимит %d байт\n", inputErr.Size, inputErr.MaxSize)
			// Вывод: Ввод 2500 байт превышает лимит 1024 байт
		}
	}
}
```

## Цепочка упаковки ошибок

Три типа структурированных ошибок (`InputError`, `ConfigError`, `FileError`) реализуют метод `Unwrap()`, поддерживающий стандартные паттерны `errors.Is()` и `errors.As()`. Понимание поведения `Unwrap()` критически важно для корректного определения типа ошибки.

### Сравнение поведения Unwrap

| Тип | Возвращаемое значение `Unwrap()` | Описание |
|------|----------------------------------|----------|
| `*InputError` | `InputErr` (если не nil) → иначе `ErrInputTooLarge` | При наличии обёрнутой ошибки раскрывает её; иначе возвращается к сигнальной |
| `*ConfigError` | Всегда `ErrInvalidConfig` | Фиксированное сопоставление с сигнальной ошибкой конфигурации |
| `*FileError` | ① если `FileErr` оборачивает `ErrFileNotFound` → `ErrFileNotFound`; ② иначе если `FileErr != nil` → `FileErr` (исходная ошибка); ③ иначе → `ErrInvalidFilePath` | Трёхуровневый откат: файл не найден → исходная ошибка → неверный путь |

:::warning Предупреждение
Трёхуровневая логика `FileError.Unwrap()` означает, что ошибки от атаки обхода пути (`FileErr` = `"path traversal detected: ..."`) не совпадут ни с одной сигнальной ошибкой — потому что `Unwrap()` возвращает исходную ошибку обхода пути, а не `ErrFileNotFound` или `ErrInvalidFilePath`. Для обнаружения обхода пути нужно извлечь `FileError` через `errors.As` и проверить сообщение.
:::

### Пример комплексной диагностики

```go
package main

import (
	"errors"
	"fmt"
	"log"
	"strings"

	"github.com/cybergodev/html"
)

// diagnoseError выполняет комплексную диагностику ошибки с помощью errors.Is + errors.As.
func diagnoseError(err error) {
	if err == nil {
		fmt.Println("Нет ошибки")
		return
	}

	// 1. errors.Is: проверка сигнальных ошибок (поиск по цепочке Unwrap)
	fmt.Printf("Проверка errors.Is:\n")
	fmt.Printf("  ErrInputTooLarge:    %v\n", errors.Is(err, html.ErrInputTooLarge))
	fmt.Printf("  ErrInvalidConfig:    %v\n", errors.Is(err, html.ErrInvalidConfig))
	fmt.Printf("  ErrFileNotFound:     %v\n", errors.Is(err, html.ErrFileNotFound))
	fmt.Printf("  ErrInvalidFilePath:  %v\n", errors.Is(err, html.ErrInvalidFilePath))

	// 2. errors.As: извлечение структурированных типов ошибок
	var inputErr *html.InputError
	if errors.As(err, &inputErr) {
		fmt.Printf("Детали InputError: op=%s size=%d max=%d\n",
			inputErr.Op, inputErr.Size, inputErr.MaxSize)
	}

	var configErr *html.ConfigError
	if errors.As(err, &configErr) {
		fmt.Printf("Детали ConfigError: field=%s value=%v message=%s\n",
			configErr.Field, configErr.Value, configErr.Message)
	}

	var fileErr *html.FileError
	if errors.As(err, &fileErr) {
		fmt.Printf("Детали FileError: op=%s safePath=%s\n",
			fileErr.Op, fileErr.SafePath())
		// Обнаружение обхода пути (не совпадает с сигнальной, нужно проверить сообщение)
		if fileErr.FileErr != nil &&
			strings.Contains(fileErr.FileErr.Error(), "path traversal") {
			fmt.Println("  [Предупреждение безопасности] Обнаружена атака обхода пути")
		}
	}
}

func main() {
	cfg := html.DefaultConfig()
	cfg.MaxInputSize = 100
	p, err := html.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer p.Close()

	// Сценарий 1: ввод слишком большой → InputError → ErrInputTooLarge
	fmt.Println("=== Сценарий 1: ввод слишком большой ===")
	_, err = p.Extract([]byte(strings.Repeat("x", 200)))
	diagnoseError(err)

	// Сценарий 2: файл не существует → FileError → ErrFileNotFound
	fmt.Println("\n=== Сценарий 2: файл не существует ===")
	_, err = p.ExtractFromFile("nonexistent.html")
	diagnoseError(err)

	// Сценарий 3: обход пути → FileError → не совпадает с сигнальной
	fmt.Println("\n=== Сценарий 3: обход пути ===")
	_, err = p.ExtractFromFile("../../etc/passwd")
	diagnoseError(err)
}
```

## Механизм маскирования путей в FileError

`FileError` разработан со встроенным механизмом **маскирования информации о пути**, предотвращающим утечку структуры файловой системы сервера через сообщения об ошибках. Это особенно важно при обработке файловых путей от ненадёжных пользователей.

### Уровни маскирования

| Уровень | Метод | Поведение |
|---------|-------|-----------|
| Сообщение об ошибке | `Error()` | Вызывает `SafePath()` для отображения только имени файла, вызывает `sanitizeErrorMessage()` для удаления деталей пути |
| Усечение пути | `SafePath()` | Возвращает basename пути (например `/var/data/secret/page.html` → `page.html`) |
| Очистка ошибки | `sanitizeErrorMessage()` | Сохраняет тип ошибки (path traversal / not found / permission denied / access denied), удаляет строку пути |
| JSON-сериализация | `MarshalJSON()` | Автоматически маскирует через `SafePath()`, подходит для ответов HTTP API |
| Внутренняя отладка | Поле `Path` | Сохраняет полный путь для логов и аудита (не раскрывается вовне) |

### Пример маскирования в веб-сервисе

```go
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"

	"github.com/cybergodev/html"
)

// apiResponse — JSON-структура, возвращаемая клиенту.
type apiResponse struct {
	Error   string `json:"error,omitempty"`
	Message string `json:"message,omitempty"`
}

func extractHandler(w http.ResponseWriter, r *http.Request) {
	filePath := r.URL.Query().Get("file")
	if filePath == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(apiResponse{Error: "missing file parameter"})
		return
	}

	cfg := html.DefaultConfig()
	result, err := html.ExtractFromFile(filePath, cfg)
	if err != nil {
		// Сообщение об ошибке уже маскировано — клиент не увидит путь на сервере
		w.WriteHeader(http.StatusUnprocessableEntity)

		var fileErr *html.FileError
		if errors.As(err, &fileErr) {
			// MarshalJSON автоматически использует SafePath(), безопасно возвращать клиенту
			fileErrJSON, _ := json.Marshal(fileErr)
			fmt.Fprintf(w, `{"error":"file_error","detail":%s}`, fileErrJSON)
			// Клиент видит: {"error":"file_error","detail":{"op":"ReadFile","path":"secret.html","message":"file not found"}}
			// А не полный путь /var/www/uploads/secret.html
		} else {
			json.NewEncoder(w).Encode(apiResponse{Error: "extraction_failed"})
		}
		return
	}

	json.NewEncoder(w).Encode(result)
}

func main() {
	// Демонстрация эффекта маскирования: имитация обработки несуществующего пути файла
	cfg := html.DefaultConfig()
	_, err := html.ExtractFromFile("/var/www/private/secret.html", cfg)
	if err != nil {
		var fileErr *html.FileError
		if errors.As(err, &fileErr) {
			fmt.Printf("Вывод Error() (маскированный): %v\n", fileErr)
			// Вывод: Вывод Error() (маскированный): html: ReadFile "secret.html": file not found

			fmt.Printf("SafePath(): %s\n", fileErr.SafePath())
			// Вывод: SafePath(): secret.html

			jsonBytes, _ := json.Marshal(fileErr)
			fmt.Printf("MarshalJSON(): %s\n", jsonBytes)
			// Вывод: MarshalJSON(): {"op":"ReadFile","path":"secret.html","message":"file not found"}

			fmt.Printf("Поле Path (для внутренней отладки): %s\n", fileErr.Path)
			// Вывод: Поле Path (для внутренней отладки): /var/www/private/secret.html
		}
	}

	// Регистрация HTTP-обработчика (только регистрация, без запуска сервера)
	http.HandleFunc("/extract", extractHandler)
	fmt.Println("\nОбработчик зарегистрирован, сообщения об ошибках маскируются автоматически")
}
```

:::tip Подсказка
`MarshalJSON()` позволяет `FileError` напрямую возвращаться HTTP-клиенту через `json.Marshal()` без дополнительной обработки — информация о пути автоматически маскируется при сериализации. Однако поле `Path` сохраняет полный путь и предназначено только для внутренних логов и отладки; ни в коем случае не возвращайте его клиенту напрямую.
:::

## Маппинг ошибок веб-сервиса

В веб-сервисе необходимо сопоставлять ошибки библиотеки с подходящими HTTP-кодами состояния, чтобы клиент мог корректно их обработать.

### Таблица маппинга HTTP-кодов

| Сигнальная ошибка | Рекомендуемый HTTP-код | Описание |
|-------------------|------------------------|----------|
| `ErrInputTooLarge` | 413 Payload Too Large | Ввод превышает лимит, клиент должен уменьшить ввод |
| `ErrInvalidHTML` | 422 Unprocessable Entity | Непригодный для разбора формат HTML |
| `ErrFileNotFound` | 404 Not Found | Файл не существует |
| `ErrInvalidFilePath` | 400 Bad Request | Неверный формат пути |
| `ErrMaxDepthExceeded` | 400 Bad Request | Возможно злонамеренная глубокая вложенность |
| `ErrProcessingTimeout` | 504 Gateway Timeout | Тайм-аут обработки, клиент может повторить позже |
| `ErrProcessorClosed` | 500 Internal Server Error | Программная ошибка (неправильное управление жизненным циклом) |
| `ErrInvalidConfig` | 500 Internal Server Error | Программная ошибка (валидация конфигурации должна выполняться при запуске) |
| `ErrInternalPanic` | 500 Internal Server Error | Внутренняя ошибка, о ней следует сообщить |
| `ErrMultipleConfigs` | 500 Internal Server Error | Программная ошибка (передано несколько Config) |

### Реализация маппинга кодов состояния

```go
package main

import (
	"errors"
	"fmt"
	"log"
	"net/http"

	"github.com/cybergodev/html"
)

// errorToHTTPStatus сопоставляет ошибки библиотеки html с подходящими HTTP-кодами состояния.
func errorToHTTPStatus(err error) int {
	switch {
	case errors.Is(err, html.ErrInputTooLarge):
		return http.StatusRequestEntityTooLarge // 413
	case errors.Is(err, html.ErrInvalidHTML):
		return http.StatusUnprocessableEntity // 422
	case errors.Is(err, html.ErrFileNotFound):
		return http.StatusNotFound // 404
	case errors.Is(err, html.ErrInvalidFilePath):
		return http.StatusBadRequest // 400
	case errors.Is(err, html.ErrMaxDepthExceeded):
		return http.StatusBadRequest // 400
	case errors.Is(err, html.ErrProcessingTimeout):
		return http.StatusGatewayTimeout // 504
	case errors.Is(err, html.ErrProcessorClosed):
		return http.StatusInternalServerError // 500
	case errors.Is(err, html.ErrInvalidConfig):
		return http.StatusInternalServerError // 500
	case errors.Is(err, html.ErrInternalPanic):
		return http.StatusInternalServerError // 500
	case errors.Is(err, html.ErrMultipleConfigs):
		return http.StatusInternalServerError // 500
	default:
		return http.StatusInternalServerError // 500
	}
}

func main() {
	// Демонстрация маппинга HTTP-кодов для различных ошибок

	// ErrInputTooLarge → 413
	cfg := html.DefaultConfig()
	cfg.MaxInputSize = 10
	p, err := html.New(cfg)
	if err != nil {
		log.Fatal(err)
	}

	testCases := []struct {
		name string
		err  error
	}{
		{"Ввод слишком большой", func() error {
			_, e := p.Extract(make([]byte, 100))
			return e
		}()},
		{"Файл не существует", func() error {
			_, e := p.ExtractFromFile("missing.html")
			return e
		}()},
		{"Processor закрыт", html.ErrProcessorClosed},
		{"Внутренняя паника", html.ErrInternalPanic},
	}

	for _, tc := range testCases {
		if tc.err != nil {
			fmt.Printf("%-20s → HTTP %d\n", tc.name, errorToHTTPStatus(tc.err))
		}
	}
	// Вывод:
	// Ввод слишком большой → HTTP 413
	// Файл не существует    → HTTP 404
	// Processor закрыт      → HTTP 500
	// Внутренняя паника     → HTTP 500

	p.Close()
}
```

## Блок-схема принятия решений об ошибках

При возникновении ошибки определяйте её тип в следующем порядке приоритета (от наиболее серьёзной к наименее серьёзной):

```
error != nil ?
│
├── errors.Is(err, ErrProcessorClosed)
│   → Программная ошибка: проверьте момент вызова Close(), убедитесь, что Processor не закрыт во время использования
│
├── errors.Is(err, ErrInternalPanic)
│   → Внутренняя ошибка: запишите полный стек и сообщите, ввод мог вызвать непокрытый граничный случай
│
├── errors.As(err, &fileErr)
│   → Файловая ошибка: запишите маскированный путь через SafePath(), проверьте FileErr для определения причины
│   ├── errors.Is(err, ErrFileNotFound)    → Файл не существует
│   ├── Сообщение содержит "path traversal" → Инцидент безопасности, журнал аудита + отказ
│   └── errors.Is(err, ErrInvalidFilePath) → Проблема формата пути
│
├── errors.As(err, &inputErr)
│   → Ошибка ввода: проверьте Size/MaxSize, предложите пользователю уменьшить ввод или скорректируйте лимит
│
├── errors.Is(err, ErrProcessingTimeout)
│   → Тайм-аут: рассмотрите упрощение обработки (ExtractArticle=false) или повтор с увеличенным тайм-аутом
│
├── errors.Is(err, ErrMaxDepthExceeded)
│   → Возможно злонамеренная конструкция: отказать и записать в журнал аудита
│
├── errors.Is(err, ErrInvalidHTML)
│   → Проблема формата ввода: предложите пользователю проверить HTML-источник
│
├── errors.Is(err, ErrInvalidConfig)
│   → Ошибка конфигурации: должна перехватываться Validate() при запуске сервиса, появление во время выполнения означает логическую ошибку
│
└── Другое
    → Неизвестная ошибка: запишите полную цепочку ошибок, пробросьте наверх или верните 500
```

:::tip Подсказка
Порядок проверки важен: `ErrProcessorClosed` и `ErrInternalPanic` следует проверять в первую очередь, так как они представляют программные ошибки или внутренние сбои, требующие иной обработки, чем ошибки ввода. Проверку `FileError` через `errors.As` следует выполнять после или параллельно с проверкой сигнальных ошибок `errors.Is` — потому что ошибки обхода пути не совпадают ни с одной сигнальной ошибкой.
:::

## Практика структурированного логирования

При использовании `slog` для записи ошибок следует извлекать поля из структурированных типов ошибок (а не просто записывать строку `err.Error()`), чтобы обеспечить возможность последующего поиска по логам и настройки оповещений.

```go
package main

import (
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"github.com/cybergodev/html"
)

// logExtractionError извлекает структурированные поля в зависимости от типа ошибки и записывает в slog.
func logExtractionError(err error) {
	var inputErr *html.InputError
	var configErr *html.ConfigError
	var fileErr *html.FileError

	switch {
	case errors.As(err, &inputErr):
		// Ошибка ввода: записываем Op/Size/MaxSize для диагностики проблем с объёмом
		slog.Warn("Сбой извлечения: ошибка ввода",
			"op", inputErr.Op,
			"size", inputErr.Size,
			"max_size", inputErr.MaxSize,
			"sentinel", "ErrInputTooLarge",
		)

	case errors.As(err, &configErr):
		// Ошибка конфигурации: записываем Field/Value/Message для локализации проблемы конфигурации
		slog.Error("Сбой извлечения: ошибка конфигурации",
			"field", configErr.Field,
			"value", configErr.Value,
			"message", configErr.Message,
			"sentinel", "ErrInvalidConfig",
		)

	case errors.As(err, &fileErr):
		// Файловая ошибка: записываем маскированный путь через SafePath(), проверяем обход пути
		attrs := []any{
			"op", fileErr.Op,
			"path", fileErr.SafePath(), // Маскированный путь, чтобы логи не утекал полный путь
		}
		if fileErr.FileErr != nil {
			attrs = append(attrs, "cause", fileErr.FileErr.Error())
			if strings.Contains(fileErr.FileErr.Error(), "path traversal") {
				attrs = append(attrs, "security_event", "path_traversal")
			}
		}
		slog.Warn("Сбой извлечения: файловая ошибка", attrs...)

	case errors.Is(err, html.ErrProcessingTimeout):
		slog.Warn("Сбой извлечения: тайм-аут обработки", "err", err)

	case errors.Is(err, html.ErrMaxDepthExceeded):
		slog.Warn("Сбой извлечения: превышение глубины, возможно злонамеренная конструкция", "err", err)

	case errors.Is(err, html.ErrProcessorClosed):
		slog.Error("Сбой извлечения: Processor закрыт (программная ошибка)", "err", err)

	case errors.Is(err, html.ErrInternalPanic):
		slog.Error("Сбой извлечения: внутренняя паника, сообщите разработчикам",
			"err", err,
			"issue", "https://github.com/cybergodev/html/issues",
		)

	default:
		slog.Error("Сбой извлечения: неизвестная ошибка", "err", err, "err_type", fmt.Sprintf("%T", err))
	}
}

func main() {
	cfg := html.DefaultConfig()
	cfg.MaxInputSize = 100
	p, err := html.New(cfg)
	if err != nil {
		slog.Error("Не удалось создать Processor", "err", err)
		return
	}
	defer p.Close()

	// Сценарий 1: ввод слишком большой → структурированная запись Size/MaxSize
	_, err = p.Extract([]byte(strings.Repeat("x", 200)))
	if err != nil {
		logExtractionError(err)
	}

	// Сценарий 2: файл не существует → структурированная запись SafePath
	_, err = p.ExtractFromFile("/data/secret/missing.html")
	if err != nil {
		logExtractionError(err)
	}

	// Сценарий 3: обход пути → отметка инцидента безопасности
	_, err = p.ExtractFromFile("../../../etc/passwd")
	if err != nil {
		logExtractionError(err)
	}
}
```

:::tip Подсказка
Ключ к структурированному логированию — извлечение **полей**, а не конкатенация строк. Например, записав `inputErr.Size` и `inputErr.MaxSize`, можно искать в системе логов запросы, близкие к лимиту, по условию `size > max_size * 0.9`, заранее выявляя проблемы с объёмом. Для `FileError` всегда используйте `SafePath()` вместо поля `Path` при записи логов, чтобы сами файлы логов не стали источником утечки информации.
:::
