---
sidebar_label: "インターフェース定義"
title: "インターフェース定義 - CyberGo html | コアインターフェース参照"
description: "CyberGo html コアインターフェース定義：Extractor、StatsProvider、ContentNode、Scorer、AuditSink の 5 つのインターフェースで、カスタムスコアリング、監査 Sink 実装、機能拡張や統合テストに活用します。"
sidebar_position: 1
---

# インターフェース定義

HTML ライブラリは以下のコアインターフェースを定義しています：

## Extractor

HTML コンテンツ抽出のメインインターフェース。`Processor` はこのインターフェースを実装しています。

```go
type Extractor interface {
    // コア抽出
    Extract(htmlBytes []byte) (*Result, error)
    ExtractWithContext(ctx context.Context, htmlBytes []byte) (*Result, error)
    ExtractFromFile(filePath string) (*Result, error)
    ExtractFromFileWithContext(ctx context.Context, filePath string) (*Result, error)

    // テキスト抽出
    ExtractText(htmlBytes []byte) (string, error)
    ExtractTextFromFile(filePath string) (string, error)
    ExtractTextWithContext(ctx context.Context, htmlBytes []byte) (string, error)
    ExtractTextFromFileWithContext(ctx context.Context, filePath string) (string, error)

    // フォーマット出力
    ExtractToMarkdown(htmlBytes []byte) (string, error)
    ExtractToMarkdownFromFile(filePath string) (string, error)
    ExtractToJSON(htmlBytes []byte) ([]byte, error)
    ExtractToJSONFromFile(filePath string) ([]byte, error)
    ExtractToMarkdownWithContext(ctx context.Context, htmlBytes []byte) (string, error)
    ExtractToMarkdownFromFileWithContext(ctx context.Context, filePath string) (string, error)
    ExtractToJSONWithContext(ctx context.Context, htmlBytes []byte) ([]byte, error)
    ExtractToJSONFromFileWithContext(ctx context.Context, filePath string) ([]byte, error)

    // バッチ処理
    ExtractBatch(htmlContents [][]byte) *BatchResult
    ExtractBatchWithContext(ctx context.Context, htmlContents [][]byte) *BatchResult
    ExtractBatchFiles(filePaths []string) *BatchResult
    ExtractBatchFilesWithContext(ctx context.Context, filePaths []string) *BatchResult

    // リンク抽出
    ExtractAllLinks(htmlBytes []byte) ([]LinkResource, error)
    ExtractAllLinksFromFile(filePath string) ([]LinkResource, error)
    ExtractAllLinksWithContext(ctx context.Context, htmlBytes []byte) ([]LinkResource, error)
    ExtractAllLinksFromFileWithContext(ctx context.Context, filePath string) ([]LinkResource, error)

    // ライフサイクル
    Close() error
}
```

## StatsProvider

統計情報とキャッシュ管理のインターフェース。

```go
type StatsProvider interface {
    GetStatistics() Statistics
    ClearCache()
    ResetStatistics()
}
```

`Processor` は `Extractor` と `StatsProvider` の両方を実装しています。インターフェース型で `Processor` を参照することで、「抽出能力」と「監視能力」を別々のコンシューマーに注入できます：

```go
type ExtractionService struct {
    extractor     html.Extractor     // 抽出能力のみ必要
    statsProvider html.StatsProvider // 監視能力のみ必要
}

func NewService(p *html.Processor) *ExtractionService {
    return &ExtractionService{
        extractor:     p, // *Processor は Extractor を満たす
        statsProvider: p, // *Processor は StatsProvider を満たす
    }
}
```

## 依存性注入と Mock テスト

`Extractor` インターフェースにより抽出ロジックを疎結合にでき、単体テストで mock 実装を注入しやすくなります：

```go
// mockExtractor は html.Extractor インターフェースを実装し、テストに使用
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
// ... 残りのメソッドはゼロ値を返す

// ビジネスコードは具象型ではなくインターフェースに依存
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

// テストで mock を注入
func TestGetTitle(t *testing.T) {
    svc := &ArticleService{
        extractor: &mockExtractor{
            result: &html.Result{Title: "テストタイトル"},
        },
    }
    title, err := svc.GetTitle([]byte("<html></html>"))
    assert.NoError(t, err)
    assert.Equal(t, "テストタイトル", title)
}
```

## ContentNode

HTML ノードの抽象インターフェース、コンテンツスコアリングアルゴリズムで使用されます。

```go
type ContentNode interface {
    Type() string                    // ノードタイプ ("element", "text", "comment" など)
    Data() string                    // タグ名またはテキストコンテンツ
    AttrValue(key string) string     // 属性値
    Attrs() []NodeAttr               // すべての属性
    FirstChild() ContentNode         // 最初の子ノード
    NextSibling() ContentNode        // 次の兄弟ノード
    Parent() ContentNode             // 親ノード
}
```

## Scorer

コンテンツスコアリングアルゴリズムのインターフェース。カスタム記事認識戦略に使用します。

```go
type Scorer interface {
    Score(node ContentNode) int          // ノードの関連性スコアを計算
    ShouldRemove(node ContentNode) bool  // ノードを削除すべきか判断
}
```

:::warning 警告
単一の `Processor` が複数の並行 `Extract` 呼び出しで共有されると、`Score`/`ShouldRemove` が**複数の goroutine から同時に**呼び出される可能性があります。したがって、すべての `Scorer` 実装は**自身で並列安全性を保証**する必要があります。

ライブラリの組み込みデフォルトスコアラーは読み取り専用で本質的に並列安全ですが、**可変状態（キャッシュやカウンターなど）を保持するカスタム `Scorer` は自身でロックと同期を行う**必要があります。
:::

`Config.Scorer` フィールドからカスタムスコアラーを注入します：

```go
type MyScorer struct{}

func (s *MyScorer) Score(node html.ContentNode) int {
    // カスタムスコアリングロジック
    return 0
}

func (s *MyScorer) ShouldRemove(node html.ContentNode) bool {
    // カスタム削除ロジック
    return false
}

cfg := html.DefaultConfig()
cfg.Scorer = &MyScorer{}
```

### ContentNode と内部型の関係

`ContentNode` は**抽象インターフェース**で、底層の `golang.org/x/net/html.Node` 型を隠蔽します。ライブラリ内部では `contentNodeAdapter` が `*html.Node` を `ContentNode` にラップします：

```text
呼び出し側 Scorer.Score(ContentNode)
                          │
                    contentNodeAdapter（アダプタ）
                          │
                  内部 *html.Node（golang.org/x/net/html）
```

この二層インターフェース設計により以下を実現します：
- **クリーンな公開 API**——ユーザーがカスタム Scorer を実装する際に `golang.org/x/net/html` をインポートする必要がありません
- **内部の高性能**——ライブラリ内部の `DefaultScorer` は `*html.Node` を直接操作し（内部 `Scorer` インターフェース経由）、アダプタ層のオーバーヘッドを回避します
- **アダプションはライブラリが自動完結**——`scorerAdapter` が公開 `Scorer` と内部 `Scorer` の間で双方向変換を行い、ユーザーは意識しません

:::tip ContentNode が nil を返す規約
`FirstChild()`/`NextSibling()`/`Parent()` は対応するノードが存在しない場合に `nil` を返します。カスタム Scorer でサブツリーを走査する際は必ず nil チェックを行ってください。そうしないと panic が発生します。
:::

## AuditSink

監査ログ出力のインターフェース。

```go
type AuditSink interface {
    Write(entry AuditEntry)
    Close() error
}
```

組み込み Sink 実装の詳細は [監査システム](../modules/audit) を参照してください。
