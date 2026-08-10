---
sidebar_label: "인터페이스 정의"
title: "인터페이스 정의 - CyberGo html | 핵심 인터페이스 참조"
description: "CyberGo html 핵심 인터페이스: Extractor 추출, StatsProvider 통계, ContentNode 노드, Scorer 평가, AuditSink 감사 출력으로 기능 확장과 통합 테스트 mock 작성을 지원합니다."
sidebar_position: 1
---

# 인터페이스 정의

HTML 라이브러리는 다음 핵심 인터페이스를 정의합니다:

## Extractor

HTML 콘텐츠 추출의 주요 인터페이스로, `Processor`가 이 인터페이스를 구현합니다.

```go
type Extractor interface {
    // 핵심 추출
    Extract(htmlBytes []byte) (*Result, error)
    ExtractWithContext(ctx context.Context, htmlBytes []byte) (*Result, error)
    ExtractFromFile(filePath string) (*Result, error)
    ExtractFromFileWithContext(ctx context.Context, filePath string) (*Result, error)

    // 텍스트 추출
    ExtractText(htmlBytes []byte) (string, error)
    ExtractTextFromFile(filePath string) (string, error)
    ExtractTextWithContext(ctx context.Context, htmlBytes []byte) (string, error)
    ExtractTextFromFileWithContext(ctx context.Context, filePath string) (string, error)

    // 형식화 출력
    ExtractToMarkdown(htmlBytes []byte) (string, error)
    ExtractToMarkdownFromFile(filePath string) (string, error)
    ExtractToJSON(htmlBytes []byte) ([]byte, error)
    ExtractToJSONFromFile(filePath string) ([]byte, error)
    ExtractToMarkdownWithContext(ctx context.Context, htmlBytes []byte) (string, error)
    ExtractToMarkdownFromFileWithContext(ctx context.Context, filePath string) (string, error)
    ExtractToJSONWithContext(ctx context.Context, htmlBytes []byte) ([]byte, error)
    ExtractToJSONFromFileWithContext(ctx context.Context, filePath string) ([]byte, error)

    // 배치 처리
    ExtractBatch(htmlContents [][]byte) *BatchResult
    ExtractBatchWithContext(ctx context.Context, htmlContents [][]byte) *BatchResult
    ExtractBatchFiles(filePaths []string) *BatchResult
    ExtractBatchFilesWithContext(ctx context.Context, filePaths []string) *BatchResult

    // 링크 추출
    ExtractAllLinks(htmlBytes []byte) ([]LinkResource, error)
    ExtractAllLinksFromFile(filePath string) ([]LinkResource, error)
    ExtractAllLinksWithContext(ctx context.Context, htmlBytes []byte) ([]LinkResource, error)
    ExtractAllLinksFromFileWithContext(ctx context.Context, filePath string) ([]LinkResource, error)

    // 라이프사이클
    Close() error
}
```

## StatsProvider

통계 정보와 캐시 관리 인터페이스입니다.

```go
type StatsProvider interface {
    GetStatistics() Statistics
    ClearCache()
    ResetStatistics()
}
```

`Processor`는 `Extractor`와 `StatsProvider`를 모두 구현합니다. 인터페이스 타입으로 `Processor`를 참조하면 「추출 능력」과 「모니터링 능력」을 각각 다른 소비자에게 주입할 수 있습니다:

```go
type ExtractionService struct {
    extractor     html.Extractor     // 추출 능력만 필요
    statsProvider html.StatsProvider // 모니터링 능력만 필요
}

func NewService(p *html.Processor) *ExtractionService {
    return &ExtractionService{
        extractor:     p, // *Processor 는 Extractor 를 만족
        statsProvider: p, // *Processor 는 StatsProvider 를 만족
    }
}
```

## 의존성 주입과 Mock 테스트

`Extractor` 인터페이스는 추출 로직을 디커플링하여, 단위 테스트에서 mock 구현을 주입하기 용이하게 합니다:

```go
// mockExtractor 는 html.Extractor 인터페이스를 구현하여 테스트에 사용
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
// ... 나머지 메서드는 제로값 반환

// 비즈니스 코드는 구체 타입이 아닌 인터페이스에 의존
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

// 테스트에서 mock 주입
func TestGetTitle(t *testing.T) {
    svc := &ArticleService{
        extractor: &mockExtractor{
            result: &html.Result{Title: "테스트 제목"},
        },
    }
    title, err := svc.GetTitle([]byte("<html></html>"))
    assert.NoError(t, err)
    assert.Equal(t, "테스트 제목", title)
}
```

## ContentNode

HTML 노드의 추상 인터페이스로, 콘텐츠 평가 알고리즘에 사용됩니다.

```go
type ContentNode interface {
    Type() string                    // 노드 유형 ("element", "text", "comment" 등)
    Data() string                    // 태그명 또는 텍스트 콘텐츠
    AttrValue(key string) string     // 속성 값
    Attrs() []NodeAttr               // 모든 속성
    FirstChild() ContentNode         // 첫 번째 자식 노드
    NextSibling() ContentNode        // 다음 형제 노드
    Parent() ContentNode             // 부모 노드
}
```

## Scorer

콘텐츠 평가 알고리즘 인터페이스로, 커스텀 문서 인식 전략에 사용됩니다.

```go
type Scorer interface {
    Score(node ContentNode) int          // 노드 관련성 점수 계산
    ShouldRemove(node ContentNode) bool  // 노드 제거 여부 판단
}
```

:::warning 경고
단일 `Processor`가 여러 동시 `Extract` 호출에서 공유될 때, `Score`/`ShouldRemove`가 **여러 goroutine 에서 동시에** 호출될 수 있습니다. 따라서 모든 `Scorer` 구현은 **스스로 동시성 안전을 보장**해야 합니다.

라이브러리 내장 기본 스코어러는 읽기 전용이며 본질적으로 동시성 안전합니다. **가변 상태 (예: 캐시, 카운터) 를 가진 커스텀 `Scorer`는 자체적으로 잠금과 동기화를 수행**해야 합니다.
:::

`Config.Scorer` 필드를 통해 커스텀 스코어러를 주입합니다:

```go
type MyScorer struct{}

func (s *MyScorer) Score(node html.ContentNode) int {
    // 커스텀 평가 로직
    return 0
}

func (s *MyScorer) ShouldRemove(node html.ContentNode) bool {
    // 커스텀 제거 로직
    return false
}

cfg := html.DefaultConfig()
cfg.Scorer = &MyScorer{}
```

### ContentNode 와 내부 타입의 관계

`ContentNode`는 **추상 인터페이스**로, 하위 `golang.org/x/net/html.Node` 타입을 감춥니다. 라이브러리 내부적으로 `contentNodeAdapter`가 `*html.Node`를 `ContentNode`로 래핑합니다:

```text
호출자 Scorer.Score(ContentNode)
                          │
                    contentNodeAdapter(어댑터)
                          │
                  내부 *html.Node(golang.org/x/net/html)
```

이러한 이중 계층 인터페이스 설계는 다음을 실현합니다:
- **공개 API 의 깔끔함** — 사용자가 커스텀 Scorer 를 구현할 때 `golang.org/x/net/html`을 임포트할 필요 없음
- **내부 고성능** — 라이브러리 내부의 `DefaultScorer`는 (내부 `Scorer` 인터페이스를 통해) `*html.Node`를 직접 조작하여 어댑터 계층의 오버헤드 회피
- **어댑팅은 라이브러리가 자동 수행** — `scorerAdapter`가 공개 `Scorer`와 내부 `Scorer` 사이에서 양방향 변환, 사용자 인지 불필요

:::tip ContentNode 의 nil 반환 규약
`FirstChild()`/`NextSibling()`/`Parent()`는 해당 노드가 없을 때 `nil`을 반환합니다. 커스텀 Scorer 가 하위 트리를 순회할 때 반드시 nil 검사를 수행해야 하며, 그렇지 않으면 panic 이 발생합니다.
:::

## AuditSink

감사 로그 출력 인터페이스입니다.

```go
type AuditSink interface {
    Write(entry AuditEntry)
    Close() error
}
```

내장 Sink 구현은 [감사 시스템](../modules/audit)을 참조하세요.
