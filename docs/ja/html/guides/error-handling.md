---
sidebar_label: "エラー処理"
title: "エラー処理 - CyberGo html | 堅牢なエラー処理ガイド"
description: "CyberGo html エラー処理ガイド：入力・設定・ファイル・処理・システムの 5 種類のエラー分類、errors.Is/As 判定パターン、context キャンセル、バッチ部分失敗処理で堅牢なエラーハンドリングロジックを構築します。"
sidebar_position: 5
---

# エラー処理

## エラーの分類

HTML ライブラリのエラーは以下のカテゴリに分類されます：

| カテゴリ | センチネルエラー | 説明 |
|------|----------|------|
| 入力エラー | `ErrInputTooLarge`, `ErrInvalidHTML` | 入力コンテンツの問題 |
| 設定エラー | `ErrInvalidConfig`, `ErrMultipleConfigs` | 設定の問題 |
| ファイルエラー | `ErrFileNotFound`, `ErrInvalidFilePath` | ファイル操作の問題 |
| 処理エラー | `ErrProcessingTimeout`, `ErrMaxDepthExceeded` | 処理中の問題 |
| システムエラー | `ErrProcessorClosed`, `ErrInternalPanic` | 内部状態の問題 |

## errors.Is パターン

`errors.Is` でエラータイプを判定します：

```go
result, err := html.Extract(data)
if err != nil {
    switch {
    case errors.Is(err, html.ErrInputTooLarge):
        slog.Warn("入力が大きすぎます。ドキュメントサイズを小さくしてください")
    case errors.Is(err, html.ErrInvalidHTML):
        slog.Warn("無効な HTML です。入力を確認してください")
    case errors.Is(err, html.ErrProcessingTimeout):
        slog.Warn("処理がタイムアウトしました。ドキュメントが複雑すぎる可能性があります")
    case errors.Is(err, html.ErrFileNotFound):
        slog.Warn("ファイルが存在しません")
    case errors.Is(err, html.ErrMaxDepthExceeded):
        slog.Warn("DOM 深度が深すぎます。悪意のある構成の可能性があります")
    case errors.Is(err, html.ErrInternalPanic):
        slog.Error("内部パニックからリカバリしました。この問題を報告してください")
    default:
        slog.Error("不明なエラー", "err", err)
    }
}
```

## errors.As パターン

構造化されたエラー情報を抽出します：

```go
var inputErr *html.InputError
var configErr *html.ConfigError
var fileErr *html.FileError

if errors.As(err, &inputErr) {
    fmt.Printf("サイズ %d が制限 %d を超過\n", inputErr.Size, inputErr.MaxSize)
}

if errors.As(err, &configErr) {
    fmt.Printf("フィールド %s の値 %v が無効: %s\n", configErr.Field, configErr.Value, configErr.Message)
}

if errors.As(err, &fileErr) {
    fmt.Printf("ファイル操作: %s\n", fileErr.SafePath())
}
```

## コンテキストのキャンセル

`ExtractWithContext` バージョンを使用してキャンセルに対応します：

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

result, err := html.ExtractWithContext(ctx, data)
if err != nil {
    switch {
    case errors.Is(err, html.ErrProcessingTimeout):
        // ライブラリ内の ProcessingTimeout タイムアウト（この時点で ctx.Err() は nil の可能性あり）
    case ctx.Err() == context.DeadlineExceeded:
        // ユーザーコンテキストの期限切れ
    case ctx.Err() == context.Canceled:
        // 手動キャンセル
    default:
        // その他のエラー（ErrInvalidHTML、ErrInputTooLarge など）
        slog.Error("抽出失敗", "err", err)
    }
}
```

## バッチエラー

バッチ処理の結果には部分的な成功と部分的な失敗が含まれます：

```go
batch := p.ExtractBatch(pages)

for i, err := range batch.Errors {
    if err != nil {
        fmt.Printf("項目 %d が失敗: %v\n", i, err)
    }
}

fmt.Printf("成功：%d, 失敗：%d, キャンセル：%d\n",
    batch.Success, batch.Failed, batch.Cancelled)
```

## エラーリカバリ戦略

実際のアプリケーションでは、エラー型を判定するだけでは不十分です。エラーカテゴリに応じて異なるリカバリ戦略を取る必要があります。

### エンコーディング検出の失敗

HTML 入力に `<meta charset>` 宣言がなく、自動検出でもエンコーディングを特定できない場合、ライブラリが返すエラーメッセージは `"encoding detection failed"` で始まります。これは通常の `fmt.Errorf` ラップエラー（センチネルエラーでも型付きエラーでもない）であり、エラーメッセージの文字列マッチングでのみ検出できます。

リカバリ戦略：まず自動検出（`Config.Encoding` を空欄）を試し、失敗したら既知のエンコーディングを手動指定して再試行します。

```go
package main

import (
	"fmt"
	"log"
	"strings"

	"github.com/cybergodev/html"
	"golang.org/x/text/encoding/simplifiedchinese"
)

// extractWithEncodingFallback はまず自動検出で抽出を試み、エンコーディング検出失敗時に手動エンコーディングで再試行します。
func extractWithEncodingFallback(data []byte, fallbackEncoding string) (*html.Result, error) {
	// 1 回目：自動検出エンコーディング（Config.Encoding を空欄）
	result, err := html.Extract(data)
	if err == nil {
		return result, nil
	}

	// エンコーディング検出失敗時、手動指定エンコーディングで再試行
	if strings.Contains(err.Error(), "encoding detection failed") {
		fmt.Printf("自動検出失敗（%v）、エンコーディング %q で再試行...\n", err, fallbackEncoding)
		cfg := html.DefaultConfig()
		cfg.Encoding = fallbackEncoding
		return html.Extract(data, cfg)
	}

	// その他のエラー（入力過大、無効 HTML など）は再試行せず、そのまま返す
	return nil, err
}

func main() {
	// GBK エンコーディングの HTML を構築（charset meta 宣言なし、自動検出失敗の可能性）
	utf8HTML := `<html><head><title>テスト</title></head>` +
		`<body><article><h1>タイトル</h1><p>こんにちは世界</p></article></body></html>`
	gbkBytes, err := simplifiedchinese.GBK.NewEncoder().Bytes([]byte(utf8HTML))
	if err != nil {
		log.Fatal(err)
	}

	result, err := extractWithEncodingFallback(gbkBytes, "gbk")
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("タイトル: %s\n", result.Title)
	fmt.Printf("テキスト: %s\n", result.Text)
	// 出力：
	// 自動検出失敗（encoding detection failed: ...）、エンコーディング "gbk" で再試行...
	// タイトル: テスト
	// テキスト: タイトル こんにちは世界
}
```

:::tip ヒント
エンコーディング検出のリトライは、出所不明の HTML ドキュメント（クローラーで取得した旧版中国語ウェブページなど）の処理に適しています。入力ソースが固定されている場合は、`Config.Encoding` で直接エンコーディングを指定すればよく、リトライロジックは不要です。
:::

### タイムアウトリカバリ

`ErrProcessingTimeout` は処理時間が `Config.ProcessingTimeout` を超過したことを示します。リカバリ戦略はドキュメントの特性に依存します：

| 戦略 | 適用シナリオ | やり方 |
|------|----------|------|
| 複雑度を下げる | ドキュメント構造は複雑だがコンテンツは単純 | `ExtractArticle = false` を設定して本文認識をスキップ |
| タイムアウトを延長 | ドキュメントが実際に大きく正当 | `ProcessingTimeout` を大きくする |
| 出力を簡略化 | プレーンテキストのみ必要 | `TextOnlyConfig()` で全メディア抽出を無効化 |

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
	// 1 回目：標準設定（30 秒タイムアウト）
	cfg := html.DefaultConfig()
	p, err := html.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer p.Close()

	largeHTML := []byte(`<html><body><article><h1>大ドキュメント</h1><p>` +
		strings.Repeat("コンテンツ ", 100000) + `</p></article></body></html>`)

	_, err = p.Extract(largeHTML)
	if err != nil {
		if errors.Is(err, html.ErrProcessingTimeout) {
			fmt.Println("標準設定でタイムアウト、簡略モードに切り替えて再試行...")

			// 再試行：本文抽出を無効化 + プレーンテキストモード + より長いタイムアウト
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
			fmt.Printf("再試行成功、%d 文字を抽出\n", len(result.Text))
		} else {
			log.Fatal(err)
		}
	}
}
```

### 入力過大

`ErrInputTooLarge` は入力が `Config.MaxInputSize` を超過したことを示します（デフォルト 50MB、上限も 50MB）。2 つの処理方法があります：

- **入力の縮小**：Web サービスの場合、ユーザーにより小さなファイルのアップロードを促す
- **制限の引き上げ**：ビジネスで本当に大きなファイルの処理が必要な場合、`MaxInputSize` を引き上げ（上限 50MB）

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
	cfg.MaxInputSize = 1024 // 1KB 制限（デモ用）
	p, err := html.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer p.Close()

	// 制限を超える入力を構築
	largeInput := []byte(strings.Repeat("<div>", 500))
	_, err = p.Extract(largeInput)
	if err != nil {
		var inputErr *html.InputError
		if errors.As(err, &inputErr) {
			fmt.Printf("入力 %d バイトが制限 %d バイトを超過\n", inputErr.Size, inputErr.MaxSize)
			// 出力：入力 2500 バイトが制限 1024 バイトを超過
		}
	}
}
```

## エラーラップチェーン

3 つの構造化エラー型（`InputError`、`ConfigError`、`FileError`）はいずれも `Unwrap()` メソッドを実装しており、`errors.Is()` と `errors.As()` の標準パターンをサポートしています。`Unwrap()` の動作を理解することは、エラーの正しい判断に極めて重要です。

### Unwrap 動作の比較

| 型 | `Unwrap()` の戻り値 | 説明 |
|------|-------------------|------|
| `*InputError` | `InputErr`（非 nil 時）→ さもなくば `ErrInputTooLarge` | 基底エラーがある場合はそれを優先的に公開、なければセンチネルにフォールバック |
| `*ConfigError` | 常に `ErrInvalidConfig` | 設定センチネルへの固定マッピング |
| `*FileError` | ① `FileErr` が `ErrFileNotFound` をラップしている場合 → `ErrFileNotFound`；② さもなくば `FileErr != nil` の場合 → `FileErr`（原始エラー）；③ さもなくば → `ErrInvalidFilePath` | 3 段階フォールバック：ファイル不存在 → 原始エラー → パス無効 |

:::warning 注意
`FileError.Unwrap()` の 3 段階ロジックは、パストラバーサル攻撃で発生したエラー（`FileErr` = `"path traversal detected: ..."`）がいずれのセンチネルエラーにもマッチしないことを意味します。`Unwrap()` は `ErrFileNotFound` や `ErrInvalidFilePath` ではなく、原始的なパストラバーサルエラーを返すためです。パストラバーサルの検出には `errors.As` で `FileError` を抽出してからメッセージをチェックする必要があります。
:::

### 総合判定例

```go
package main

import (
	"errors"
	"fmt"
	"log"
	"strings"

	"github.com/cybergodev/html"
)

// diagnoseError は errors.Is + errors.As でエラーを総合診断します。
func diagnoseError(err error) {
	if err == nil {
		fmt.Println("エラーなし")
		return
	}

	// 1. errors.Is：センチネルエラーをチェック（Unwrap チェーンをたどる）
	fmt.Printf("errors.Is チェック:\n")
	fmt.Printf("  ErrInputTooLarge:    %v\n", errors.Is(err, html.ErrInputTooLarge))
	fmt.Printf("  ErrInvalidConfig:    %v\n", errors.Is(err, html.ErrInvalidConfig))
	fmt.Printf("  ErrFileNotFound:     %v\n", errors.Is(err, html.ErrFileNotFound))
	fmt.Printf("  ErrInvalidFilePath:  %v\n", errors.Is(err, html.ErrInvalidFilePath))

	// 2. errors.As：構造化エラー型を抽出
	var inputErr *html.InputError
	if errors.As(err, &inputErr) {
		fmt.Printf("InputError 詳細: op=%s size=%d max=%d\n",
			inputErr.Op, inputErr.Size, inputErr.MaxSize)
	}

	var configErr *html.ConfigError
	if errors.As(err, &configErr) {
		fmt.Printf("ConfigError 詳細: field=%s value=%v message=%s\n",
			configErr.Field, configErr.Value, configErr.Message)
	}

	var fileErr *html.FileError
	if errors.As(err, &fileErr) {
		fmt.Printf("FileError 詳細: op=%s safePath=%s\n",
			fileErr.Op, fileErr.SafePath())
		// パストラバーサルの検出（センチネルにマッチしないため、メッセージをチェック）
		if fileErr.FileErr != nil &&
			strings.Contains(fileErr.FileErr.Error(), "path traversal") {
			fmt.Println("  [セキュリティ警告] パストラバーサル攻撃を検出")
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

	// シナリオ 1：入力過大 → InputError → ErrInputTooLarge
	fmt.Println("=== シナリオ 1：入力過大 ===")
	_, err = p.Extract([]byte(strings.Repeat("x", 200)))
	diagnoseError(err)

	// シナリオ 2：ファイル不存在 → FileError → ErrFileNotFound
	fmt.Println("\n=== シナリオ 2：ファイル不存在 ===")
	_, err = p.ExtractFromFile("nonexistent.html")
	diagnoseError(err)

	// シナリオ 3：パストラバーサル → FileError → センチネルにマッチしない
	fmt.Println("\n=== シナリオ 3：パストラバーサル ===")
	_, err = p.ExtractFromFile("../../etc/passwd")
	diagnoseError(err)
}
```

## FileError のパス匿名化メカニズム

`FileError` は設計上**パス情報の匿名化**メカニズムを内蔵しており、エラーメッセージを通じたサーバーファイルシステム構造の漏洩を防止します。これは信頼できないユーザーからのファイルパスを処理する際に特に重要です。

### 匿名化レイヤー

| レイヤー | メソッド | 動作 |
|------|------|------|
| エラーメッセージ | `Error()` | `SafePath()` を呼び出してファイル名のみ表示、`sanitizeErrorMessage()` を呼び出してパス詳細を削除 |
| パス切り詰め | `SafePath()` | パスの basename を返す（例：`/var/data/secret/page.html` → `page.html`） |
| エラークリーニング | `sanitizeErrorMessage()` | エラー型（path traversal / not found / permission denied / access denied）を保持、パス文字列を削除 |
| JSON シリアライズ | `MarshalJSON()` | 自動的に `SafePath()` で匿名化、HTTP API レスポンスに適用 |
| 内部デバッグ | `Path` フィールド | 完全パスを保持、ログと監査に使用（外部には非公開） |

### Web サービス匿名化例

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

// apiResponse はクライアントに返す JSON 構造です。
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
		// エラーメッセージは自動的に匿名化済み——クライアントにはサーバーパスが見えない
		w.WriteHeader(http.StatusUnprocessableEntity)

		var fileErr *html.FileError
		if errors.As(err, &fileErr) {
			// MarshalJSON が自動的に SafePath() で匿名化するため、安全にクライアントに返せる
			fileErrJSON, _ := json.Marshal(fileErr)
			fmt.Fprintf(w, `{"error":"file_error","detail":%s}`, fileErrJSON)
			// クライアントが見るもの: {"error":"file_error","detail":{"op":"ReadFile","path":"secret.html","message":"file not found"}}
			// 完全なサーバーパス /var/www/uploads/secret.html は見えない
		} else {
			json.NewEncoder(w).Encode(apiResponse{Error: "extraction_failed"})
		}
		return
	}

	json.NewEncoder(w).Encode(result)
}

func main() {
	// 匿名化効果のデモ：存在しないファイルパスの処理をシミュレート
	cfg := html.DefaultConfig()
	_, err := html.ExtractFromFile("/var/www/private/secret.html", cfg)
	if err != nil {
		var fileErr *html.FileError
		if errors.As(err, &fileErr) {
			fmt.Printf("Error() 出力（匿名化）: %v\n", fileErr)
			// 出力：Error() 出力（匿名化）: html: ReadFile "secret.html": file not found

			fmt.Printf("SafePath(): %s\n", fileErr.SafePath())
			// 出力：SafePath(): secret.html

			jsonBytes, _ := json.Marshal(fileErr)
			fmt.Printf("MarshalJSON(): %s\n", jsonBytes)
			// 出力：MarshalJSON(): {"op":"ReadFile","path":"secret.html","message":"file not found"}

			fmt.Printf("Path フィールド（内部デバッグ用）: %s\n", fileErr.Path)
			// 出力：Path フィールド（内部デバッグ用）: /var/www/private/secret.html
		}
	}

	// HTTP ハンドラを登録（登録のみ、サーバーは起動しない）
	http.HandleFunc("/extract", extractHandler)
	fmt.Println("\nハンドラが登録されました、エラーメッセージは自動的に匿名化されます")
}
```

:::tip ヒント
`MarshalJSON()` により、`FileError` は `json.Marshal()` 後にそのまま HTTP クライアントに返せます。追加処理は不要で、シリアライズ時にパス情報が自動的に匿名化されます。ただし `Path` フィールドは完全パスを保持しており、内部ログとデバッグ専用です。クライアントに直接返さないでください。
:::

## Web サービスエラーマッピング

Web サービスでは、ライブラリのエラーを適切な HTTP ステータスコードにマッピングし、クライアントが正しく処理できるようにする必要があります。

### HTTP ステータスコードマッピング表

| センチネルエラー | 推奨 HTTP ステータスコード | 説明 |
|----------|------------------|------|
| `ErrInputTooLarge` | 413 Payload Too Large | 入力が制限を超過、クライアントは入力を縮小すべき |
| `ErrInvalidHTML` | 422 Unprocessable Entity | 解析不能な HTML フォーマット |
| `ErrFileNotFound` | 404 Not Found | ファイルが存在しない |
| `ErrInvalidFilePath` | 400 Bad Request | パス形式が無効 |
| `ErrMaxDepthExceeded` | 400 Bad Request | 悪意のある構成の可能性がある深いネスト |
| `ErrProcessingTimeout` | 504 Gateway Timeout | 処理タイムアウト、クライアントは後で再試行可能 |
| `ErrProcessorClosed` | 500 Internal Server Error | プログラミングエラー（ライフサイクル管理が不正） |
| `ErrInvalidConfig` | 500 Internal Server Error | プログラミングエラー（設定検証は起動時に完了すべき） |
| `ErrInternalPanic` | 500 Internal Server Error | 内部バグ、報告すべき |
| `ErrMultipleConfigs` | 500 Internal Server Error | プログラミングエラー（複数の Config が渡された） |

### ステータスコードマッピングの実装

```go
package main

import (
	"errors"
	"fmt"
	"log"
	"net/http"

	"github.com/cybergodev/html"
)

// errorToHTTPStatus は html ライブラリのエラーを適切な HTTP ステータスコードにマッピングします。
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
	// 各種エラーの HTTP ステータスコードマッピングのデモ

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
		{"入力過大", func() error {
			_, e := p.Extract(make([]byte, 100))
			return e
		}()},
		{"ファイル不存在", func() error {
			_, e := p.ExtractFromFile("missing.html")
			return e
		}()},
		{"プロセッサクローズ済み", html.ErrProcessorClosed},
		{"内部パニック", html.ErrInternalPanic},
	}

	for _, tc := range testCases {
		if tc.err != nil {
			fmt.Printf("%-12s → HTTP %d\n", tc.name, errorToHTTPStatus(tc.err))
		}
	}
	// 出力：
	// 入力過大      → HTTP 413
	// ファイル不存在 → HTTP 404
	// プロセッサクローズ済み → HTTP 500
	// 内部パニック    → HTTP 500

	p.Close()
}
```

## エラー判定フローチャート

エラーに遭遇した際、以下の優先度順位で判定します（最も重大なものから最も軽微なものへ）：

```
error != nil ?
│
├── errors.Is(err, ErrProcessorClosed)
│   → プログラミングエラー：Close() の呼び出しタイミングを確認、プロセッサが使用後にクローズされていないか確認
│
├── errors.Is(err, ErrInternalPanic)
│   → 内部バグ：完全なスタックを記録して報告、入力が未カバーの境界ケースをトリガーした可能性
│
├── errors.As(err, &fileErr)
│   → ファイルエラー：SafePath() で匿名化パスを記録、FileErr で具体的原因を判定
│   ├── errors.Is(err, ErrFileNotFound)    → ファイル不存在
│   ├── メッセージに "path traversal" を含む  → セキュリティイベント、監査ログ + 拒否
│   └── errors.Is(err, ErrInvalidFilePath) → パス形式の問題
│
├── errors.As(err, &inputErr)
│   → 入力エラー：Size/MaxSize を確認、ユーザーに入力の縮小または制限の調整を促す
│
├── errors.Is(err, ErrProcessingTimeout)
│   → タイムアウト：処理の簡略化（ExtractArticle=false）またはタイムアウト延長後の再試行を検討
│
├── errors.Is(err, ErrMaxDepthExceeded)
│   → 悪意のある構成の可能性：拒否して監査ログに記録
│
├── errors.Is(err, ErrInvalidHTML)
│   → 入力形式の問題：ユーザーに HTML ソースの確認を促す
│
├── errors.Is(err, ErrInvalidConfig)
│   → 設定エラー：サービス起動時の Validate() で捕捉すべき、実行時の発生はロジックの誤りを示す
│
└── その他
    → 不明なエラー：完全なエラーチェーンを記録、上位に伝播または 500 を返す
```

:::tip ヒント
判定順序は重要です：`ErrProcessorClosed` と `ErrInternalPanic` はプログラミングエラーや内部障害を表すため、入力エラーとは区別して処理すべきであり、優先的にチェックする必要があります。`FileError` の `errors.As` チェックは `errors.Is` センチネルチェックの後または併用すべきです。パストラバーサルエラーがいずれのセンチネルにもマッチしないためです。
:::

## 構造化ログのプラクティス

`slog` でエラーを記録する際、`err.Error()` 文字列だけでなく、構造化エラー型からフィールドを抽出すべきです。これにより、以降のログクエリとアラートが容易になります。

```go
package main

import (
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"github.com/cybergodev/html"
)

// logExtractionError はエラー型に応じて構造化フィールドを抽出し、slog に記録します。
func logExtractionError(err error) {
	var inputErr *html.InputError
	var configErr *html.ConfigError
	var fileErr *html.FileError

	switch {
	case errors.As(err, &inputErr):
		// 入力エラー：Op/Size/MaxSize を記録し、容量問題の切り分けを容易にする
		slog.Warn("抽出失敗：入力エラー",
			"op", inputErr.Op,
			"size", inputErr.Size,
			"max_size", inputErr.MaxSize,
			"sentinel", "ErrInputTooLarge",
		)

	case errors.As(err, &configErr):
		// 設定エラー：Field/Value/Message を記録し、設定問題の特定を容易にする
		slog.Error("抽出失敗：設定エラー",
			"field", configErr.Field,
			"value", configErr.Value,
			"message", configErr.Message,
			"sentinel", "ErrInvalidConfig",
		)

	case errors.As(err, &fileErr):
		// ファイルエラー：SafePath() で匿名化パスを記録、パストラバーサルをチェック
		attrs := []any{
			"op", fileErr.Op,
			"path", fileErr.SafePath(), // 匿名化パス、ログからの完全パス漏洩を防止
		}
		if fileErr.FileErr != nil {
			attrs = append(attrs, "cause", fileErr.FileErr.Error())
			if strings.Contains(fileErr.FileErr.Error(), "path traversal") {
				attrs = append(attrs, "security_event", "path_traversal")
			}
		}
		slog.Warn("抽出失敗：ファイルエラー", attrs...)

	case errors.Is(err, html.ErrProcessingTimeout):
		slog.Warn("抽出失敗：処理タイムアウト", "err", err)

	case errors.Is(err, html.ErrMaxDepthExceeded):
		slog.Warn("抽出失敗：深度超過、悪意のある構成の可能性", "err", err)

	case errors.Is(err, html.ErrProcessorClosed):
		slog.Error("抽出失敗：プロセッサがクローズ済み（プログラミングエラー）", "err", err)

	case errors.Is(err, html.ErrInternalPanic):
		slog.Error("抽出失敗：内部パニック、報告してください",
			"err", err,
			"issue", "https://github.com/cybergodev/html/issues",
		)

	default:
		slog.Error("抽出失敗：不明なエラー", "err", err, "err_type", fmt.Sprintf("%T", err))
	}
}

func main() {
	cfg := html.DefaultConfig()
	cfg.MaxInputSize = 100
	p, err := html.New(cfg)
	if err != nil {
		slog.Error("プロセッサ作成失敗", "err", err)
		return
	}
	defer p.Close()

	// シナリオ 1：入力過大 → 構造化記録 Size/MaxSize
	_, err = p.Extract([]byte(strings.Repeat("x", 200)))
	if err != nil {
		logExtractionError(err)
	}

	// シナリオ 2：ファイル不存在 → 構造化記録 SafePath
	_, err = p.ExtractFromFile("/data/secret/missing.html")
	if err != nil {
		logExtractionError(err)
	}

	// シナリオ 3：パストラバーサル → セキュリティイベントとしてマーク
	_, err = p.ExtractFromFile("../../../etc/passwd")
	if err != nil {
		logExtractionError(err)
	}
}
```

:::tip ヒント
構造化ログの鍵は、文字列を結合するのではなく**フィールド**を抽出することです。例えば `inputErr.Size` と `inputErr.MaxSize` を記録しておけば、ログシステムで `size > max_size * 0.9` のクエリで制限に接近したリクエストを見つけ、早期に容量問題を発見できます。`FileError` では、ログファイル自体が情報漏洩源になるのを防ぐため、`Path` フィールドではなく常に `SafePath()` を使用してください。
:::
