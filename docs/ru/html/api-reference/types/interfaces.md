---
sidebar_label: "Интерфейсы"
title: "Интерфейсы - CyberGo html | ключевые интерфейсы"
description: "Ключевые интерфейсы CyberGo html: Extractor, StatsProvider, ContentNode, Scorer, AuditSink — для расширения возможностей и интеграционного тестирования."
sidebar_position: 1
---

# Определение интерфейсов

Библиотека HTML определяет следующие ключевые интерфейсы:

## Extractor

Основной интерфейс извлечения HTML-контента, `Processor` реализует этот интерфейс.

```go
type Extractor interface {
    // Основное извлечение
    Extract(htmlBytes []byte) (*Result, error)
    ExtractWithContext(ctx context.Context, htmlBytes []byte) (*Result, error)
    ExtractFromFile(filePath string) (*Result, error)
    ExtractFromFileWithContext(ctx context.Context, filePath string) (*Result, error)

    // Извлечение текста
    ExtractText(htmlBytes []byte) (string, error)
    ExtractTextFromFile(filePath string) (string, error)
    ExtractTextWithContext(ctx context.Context, htmlBytes []byte) (string, error)
    ExtractTextFromFileWithContext(ctx context.Context, filePath string) (string, error)

    // Форматированный вывод
    ExtractToMarkdown(htmlBytes []byte) (string, error)
    ExtractToMarkdownFromFile(filePath string) (string, error)
    ExtractToJSON(htmlBytes []byte) ([]byte, error)
    ExtractToJSONFromFile(filePath string) ([]byte, error)
    ExtractToMarkdownWithContext(ctx context.Context, htmlBytes []byte) (string, error)
    ExtractToMarkdownFromFileWithContext(ctx context.Context, filePath string) (string, error)
    ExtractToJSONWithContext(ctx context.Context, htmlBytes []byte) ([]byte, error)
    ExtractToJSONFromFileWithContext(ctx context.Context, filePath string) ([]byte, error)

    // Пакетная обработка
    ExtractBatch(htmlContents [][]byte) *BatchResult
    ExtractBatchWithContext(ctx context.Context, htmlContents [][]byte) *BatchResult
    ExtractBatchFiles(filePaths []string) *BatchResult
    ExtractBatchFilesWithContext(ctx context.Context, filePaths []string) *BatchResult

    // Извлечение ссылок
    ExtractAllLinks(htmlBytes []byte) ([]LinkResource, error)
    ExtractAllLinksFromFile(filePath string) ([]LinkResource, error)
    ExtractAllLinksWithContext(ctx context.Context, htmlBytes []byte) ([]LinkResource, error)
    ExtractAllLinksFromFileWithContext(ctx context.Context, filePath string) ([]LinkResource, error)

    // Жизненный цикл
    Close() error
}
```

## StatsProvider

Интерфейс статистики и управления кэшем.

```go
type StatsProvider interface {
    GetStatistics() Statistics
    ClearCache()
    ResetStatistics()
}
```

`Processor` одновременно реализует `Extractor` и `StatsProvider`. Ссылаясь на `Processor` через тип интерфейса, можно внедрить «способность извлечения» и «способность мониторинга» разным потребителям по отдельности:

```go
type ExtractionService struct {
    extractor     html.Extractor     // нужна только способность извлечения
    statsProvider html.StatsProvider // нужна только способность мониторинга
}

func NewService(p *html.Processor) *ExtractionService {
    return &ExtractionService{
        extractor:     p, // *Processor удовлетворяет Extractor
        statsProvider: p, // *Processor удовлетворяет StatsProvider
    }
}
```

## Внедрение зависимостей и Mock-тестирование

Интерфейс `Extractor` позволяет развязать логику извлечения и упростить внедрение mock-реализаций в модульных тестах:

```go
// mockExtractor реализует интерфейс html.Extractor для тестирования
type mockExtractor struct {
    result *html.Result
    err    error
}

func (m *mockExtractor) Extract([]byte) (*html.Result, error) { return m.result, m.err }
func (m *mockExtractor) ExtractWithContext(ctx context.Context, b []byte) (*html.Result, error) {
    return m.result, m.err
}
func (m *mockExtractor) ExtractFromFile(string) (*html.Result, error)         { return m.result, m.err }
func (m *mockExtractor) ExtractFromFileWithContext(context.Context, string) (*html.Result, error) {
    return m.result, m.err
}
func (m *mockExtractor) ExtractText([]byte) (string, error)                   { return m.result.Text, m.err }
func (m *mockExtractor) ExtractTextFromFile(string) (string, error)           { return m.result.Text, m.err }
func (m *mockExtractor) ExtractTextWithContext(context.Context, []byte) (string, error) {
    return m.result.Text, m.err
}
func (m *mockExtractor) ExtractTextFromFileWithContext(context.Context, string) (string, error) {
    return m.result.Text, m.err
}
// ... остальные методы возвращают нулевые значения

// Бизнес-код зависит от интерфейса, а не от конкретного типа
type ArticleService struct {
    extractor html.Extractor
}

func (s *ArticleService) GetTitle(htmlBytes []byte) (string, error) {
    result, err := s.extractor.Extract(htmlBytes)
    if err != nil {
        return "", err
    }
    return result.Title, nil
}

// Внедрение mock в тестах
func TestGetTitle(t *testing.T) {
    svc := &ArticleService{
        extractor: &mockExtractor{
            result: &html.Result{Title: "Тестовый заголовок"},
        },
    }
    title, err := svc.GetTitle([]byte("<html></html>"))
    assert.NoError(t, err)
    assert.Equal(t, "Тестовый заголовок", title)
}
```

## ContentNode

Интерфейс абстракции HTML-узла для алгоритмов скоринга контента.

```go
type ContentNode interface {
    Type() string                    // Тип узла ("element", "text", "comment" и др.)
    Data() string                    // Имя тега или текстовое содержимое
    AttrValue(key string) string     // Значение атрибута
    Attrs() []NodeAttr               // Все атрибуты
    FirstChild() ContentNode         // Первый дочерний узел
    NextSibling() ContentNode        // Следующий родственный узел
    Parent() ContentNode             // Родительский узел
}
```

## Scorer

Интерфейс алгоритма скоринга контента для пользовательской стратегии распознавания статей.

```go
type Scorer interface {
    Score(node ContentNode) int          // Вычисление оценки релевантности узла
    ShouldRemove(node ContentNode) bool  // Определение, следует ли удалить узел
}
```

:::warning Предупреждение
Когда один `Processor` разделяется между параллельными вызовами `Extract`, `Score`/`ShouldRemove` могут вызываться **из нескольких горутин одновременно**. Поэтому любая реализация `Scorer` должна **самостоятельно обеспечивать потокобезопасность**.

Встроенный скорер библиотеки по умолчанию доступен только для чтения и изначально потокобезопасен; **пользовательский `Scorer`, хранящий изменяемое состояние (например, кэш или счётчик), должен самостоятельно выполнять блокировку и синхронизацию**.
:::

Внедрение пользовательского скорера через поле `Config.Scorer`:

```go
type MyScorer struct{}

func (s *MyScorer) Score(node html.ContentNode) int {
    // Пользовательская логика скоринга
    return 0
}

func (s *MyScorer) ShouldRemove(node html.ContentNode) bool {
    // Пользовательская логика удаления
    return false
}

cfg := html.DefaultConfig()
cfg.Scorer = &MyScorer{}
```

### Связь ContentNode с внутренними типами

`ContentNode` — это **абстрактный интерфейс**, скрывающий нижележащий тип `golang.org/x/net/html.Node`. Внутри библиотеки `contentNodeAdapter` оборачивает `*html.Node` в `ContentNode`:

```text
Вызывающая сторона Scorer.Score(ContentNode)
                          │
                    contentNodeAdapter (адаптер)
                          │
                  внутренний *html.Node (golang.org/x/net/html)
```

Такой двухуровневый дизайн интерфейса обеспечивает:
- **Чистый публичный API** — пользователю не нужно импортировать `golang.org/x/net/html` для реализации собственного Scorer
- **Высокую производительность внутри** — внутренний `DefaultScorer` работает напрямую с `*html.Node` (через внутренний интерфейс `Scorer`), избегая накладных расходов адаптера
- **Адаптация выполняется библиотекой автоматически** — `scorerAdapter` двусторонне преобразует между публичным `Scorer` и внутренним `Scorer`, прозрачно для пользователя

:::tip Соглашение о возврате nil для ContentNode
`FirstChild()`/`NextSibling()`/`Parent()` возвращают `nil`, если соответствующего узла нет. Пользовательский Scorer при обходе поддерева обязан выполнять nil-проверку, иначе возникнет panic.
:::

## AuditSink

Интерфейс вывода журнала аудита.

```go
type AuditSink interface {
    Write(entry AuditEntry)
    Close() error
}
```

Встроенные реализации Sink описаны в [Система аудита](../modules/audit).
