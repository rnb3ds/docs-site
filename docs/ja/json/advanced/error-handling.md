---
sidebar_label: "エラー処理"
title: "エラー処理 - CyberGo JSON | ベストプラクティス"
description: "CyberGo JSON のエラー処理：JsonsError 型判定、errors.Is/As マッチング、SafeError の安全出力と RedactedPath のログマスキング、センチネルエラー分類、Op/Path での失敗点特定、デフォルト値へのフォールバックやリトライ縮退で堅牢な例外機構を構築します。"
sidebar_position: 2
---

# エラー処理

JSON 操作のエラーを正しく処理します。

## エラー型

### 標準エラー

```go
var (
    ErrPathNotFound       = errors.New("path not found")
    ErrInvalidPath        = errors.New("invalid path format")
    ErrTypeMismatch       = errors.New("type mismatch")
    ErrInvalidJSON        = errors.New("invalid JSON format")
    ErrDepthLimit         = errors.New("depth limit exceeded")
    ErrSizeLimit          = errors.New("size limit exceeded")
    ErrSecurityViolation  = errors.New("security violation detected")
    ErrProcessorClosed    = errors.New("processor is closed")
    ErrConcurrencyLimit   = errors.New("concurrency limit exceeded")
    ErrUnsupportedPath    = errors.New("unsupported path operation")
    ErrOperationTimeout   = errors.New("operation timeout")           // Deprecated
    ErrResourceExhausted  = errors.New("system resources exhausted")  // Deprecated
)
```

### センチネルエラー分類表

12 個のエクスポートされたセンチネルエラーを**処理方法**で 4 つに分類します：

| エラー | 意味 / 典型的なトリガー | 分類 | 対処の推奨 |
|------|-----------------|------|----------|
| `ErrInvalidJSON` | 入力が正当な JSON でない（構文エラー、不正 UTF-8） | ユーザー入力 | 丁寧なメッセージを返し、データの修正を促す |
| `ErrPathNotFound` | パスが存在しない（ネストキーの欠落、配列添字の範囲外） | ユーザー入力 | デフォルト値へフォールバックするか、ビジネスセマンティクスに従って処理 |
| `ErrTypeMismatch` | パス上の値が期待する型と一致しない | ユーザー入力 | フィールド型エラーを通知 |
| `ErrInvalidPath` | パス構文が不正（`a..b` など） | ユーザー入力 | パス形式エラーを通知 |
| `ErrUnsupportedPath` | パス操作がサポートされない | ユーザー入力 | パスと操作の組み合わせを確認 |
| `ErrSizeLimit` | 入力が `Config.MaxJSONSize` を超過 | セキュリティ制限 | 拒否し、レート制限ポリシーに従って処理 |
| `ErrDepthLimit` | ネスト深度が `MaxNestingDepthSecurity` を超過 | セキュリティ制限 | 拒否（深いネストは悪意ある入力に多い） |
| `ErrSecurityViolation` | 危険パターンを検出（プロトタイプ汚染など） | セキュリティ制限 | 記録して拒否。詳細をエコーバックしない |
| `ErrConcurrencyLimit` | 進行中の操作数が `MaxConcurrency` に到達（ソフト上限、ブロックせず即時拒否） | システム一時的 | **リトライ可能**——少し待って再試行するか上限を引き上げる |
| `ErrProcessorClosed` | プロセッサを Close した後に呼び続けた | システム状態 | `Processor` を再作成するか、ライフサイクルを確認 |
| `ErrOperationTimeout` | ——（互換性のために保留） | 非推奨 | 現在これを返す操作はない。これで分岐しないこと |
| `ErrResourceExhausted` | ——（互換性のために保留） | 非推奨 | 現在これを返す操作はない。これで分岐しないこと |

### エラーチェック

```go
val, err := json.Get(data, "user.name")
if err != nil {
    if errors.Is(err, json.ErrPathNotFound) {
        // パスが存在しない
        return defaultName
    }
    if errors.Is(err, json.ErrTypeMismatch) {
        // 型が一致しない
        return "", fmt.Errorf("フィールド型エラー：%w", err)
    }
    return "", err
}
```

## JsonsError

### 構造

`JsonsError` はライブラリの主要なエラー型で、操作コンテキスト情報を含みます：

```go
type JsonsError struct {
    Op      string `json:"op"`      // 操作型："get", "set", "delete", "marshal" など
    Path    string `json:"path"`    // JSON パス（あれば）
    Message string `json:"message"` // 人間が読めるエラーメッセージ
    Err     error  `json:"err"`     // 基底エラー
}

func (e *JsonsError) Error() string
func (e *JsonsError) Unwrap() error
func (e *JsonsError) Is(target error) bool
```

### 使用

```go
val, err := json.Get(data, "user.name")
if err != nil {
    // errors.Is でエラー型をチェック
    if errors.Is(err, json.ErrPathNotFound) {
        // パスが存在しない
    }
    if errors.Is(err, json.ErrTypeMismatch) {
        // 型が一致しない
    }

    // errors.As で詳細コンテキストを取得
    var jsonErr *json.JsonsError
    if errors.As(err, &jsonErr) {
        fmt.Printf("操作: %s\n", jsonErr.Op)
        fmt.Printf("パス: %s\n", jsonErr.Path)
        fmt.Printf("メッセージ: %s\n", jsonErr.Message)
    }
}
```

### Op / Path で失敗点を特定

`Op`（失敗した操作）と `Path`（失敗したパス）の組み合わせで問題を正確に特定でき、エラー文字列を解析する必要はありません：

```go
package main

import (
	"errors"
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := `{"user":{"name":"Alice"},"perms":["read"]}`

	// 2 つの典型的な失敗：パス不在 / JSON 不正
	for _, tc := range []struct {
		jsonStr, path string
	}{
		{data, "user.email"},  // パスが存在しない
		{`{"broken"`, "user"}, // JSON が不正
	} {
		_, err := json.Get(tc.jsonStr, tc.path)
		var jsonErr *json.JsonsError
		if errors.As(err, &jsonErr) {
			fmt.Printf("op=%s path=%q 原因=%v\n", jsonErr.Op, jsonErr.Path, json.SafeError(err))
		}
	}
}

// 出力:
// op=get path="user.email" 原因=path not found
// op=parse path="" 原因=invalid JSON format
```

:::tip 特定方法
`Op` は「どの操作が失敗したか」（`get`/`set`/`delete`/`get_multiple`/`warmup_cache`。解析失敗は一律 `parse` と記録）を、`Path` は「どのパスで失敗したか」を答えます。ログにこの 2 フィールドを出力すれば（`Error()` 文字列全体ではなく）、問題を特定できるうえ、パス中の機密キー名をログに書き込むことも避けられます——パスを出力する必要がある場合は [`RedactedPath`](#redactedpath-ログマスキング) でマスクしてください。
:::

## エラー処理パターン

### デフォルト値の提供

```go
// 型安全な取得関数はデフォルト値を内蔵サポート
name := json.GetString(data, "user.name", "匿名")
age := json.GetInt(data, "user.age", 0)
active := json.GetBool(data, "user.active", false)
```

### 複数エラーの収集

```go
type MultiError struct {
    Errors []error
}

func (e *MultiError) Add(err error) {
    e.Errors = append(e.Errors, err)
}

func (e *MultiError) HasError() bool {
    return len(e.Errors) > 0
}

func (e *MultiError) Error() string {
    msgs := make([]string, len(e.Errors))
    for i, err := range e.Errors {
        msgs[i] = err.Error()
    }
    return strings.Join(msgs, "; ")
}

// 使用
var multiErr MultiError
for _, path := range requiredPaths {
    if _, err := json.Get(data, path); err != nil {
        multiErr.Add(fmt.Errorf("%s: %w", path, err))
    }
}
if multiErr.HasError() {
    return multiErr.Error()
}
```

### エラーラップ

```go
val, err := json.Get(data, "config.api_key")
if err != nil {
    return fmt.Errorf("API キーの読み取りに失敗：%w", err)
}
```

## カスタムエラー

### ビジネスエラー

```go
type ValidationError struct {
    Field   string
    Message string
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("検証失敗 %s: %s", e.Field, e.Message)
}

// 使用
func validateUser(data string) error {
    name := json.GetString(data, "name")
    if name == "" {
        return &ValidationError{Field: "name", Message: "必須"}
    }
    if len(name) < 2 {
        return &ValidationError{Field: "name", Message: "最低 2 文字必要"}
    }
    return nil
}
```

## ログ記録

### 構造化ログ

```go
val, err := json.Get(data, path)
if err != nil {
    log.Error("JSON 操作失敗",
        "path", path,
        "error", err,
        "error_type", fmt.Sprintf("%T", err),
    )
    return err
}
```

### 監査ログ

```go
func auditLog(op string, path string, err error) {
    if err != nil {
        log.Warn("操作失敗",
            "operation", op,
            "path", path,
            "error", err,
        )
    } else {
        log.Info("操作成功",
            "operation", op,
            "path", path,
        )
    }
}
```

## リカバリー戦略

### SafeError 安全出力

`SafeError` はクライアントに対して安全なエラーメッセージを返します。内部コンテキスト（操作、パス、構造の詳細）を除去し、HTTP/API レスポンスに適します（CWE-209）：

```go
// シグネチャ: func SafeError(err error) string

val, err := json.Get(untrustedInput, "data")
if err != nil {
    // 完全な Error() には "JSON get failed at path '...': ..." が含まれるため、直接送出しない
    // SafeError は基底のセンチネルエラーメッセージ（"path not found" など）のみを返す
    safeMsg := json.SafeError(err)
    _ = safeMsg // http.Error(w, safeMsg, http.StatusBadRequest)
    _ = val
    return
}
```

### RedactedPath ログマスキング

パス自体に機密キー名（`user.password`、`token` など）が含まれることがあります。ログに書く前に `RedactedPath` でマスクします——空でないパスは一律 `***` に置き換えられ、断片も漏洩しません：

```go
// シグネチャ: func RedactedPath(path string) string

var jsonErr *json.JsonsError
if errors.As(err, &jsonErr) {
    // ログにはマスク済みパスのみ記録し、機密キー名がログシステムに入るのを防ぐ
    log.Warn("JSON 操作失敗",
        "op", jsonErr.Op,
        "path", json.RedactedPath(jsonErr.Path), // ***
    )
}
```

### リトライ

```go
func withRetry(fn func() error, maxRetries int) error {
    var err error
    for i := 0; i < maxRetries; i++ {
        if err = fn(); err == nil {
            return nil
        }
        time.Sleep(time.Second * time.Duration(i+1))
    }
    return err
}

// 使用
err := withRetry(func() error {
    return processData(data)
}, 3)
```

### デグレード

```go
func getConfig(data string) Config {
    cfg := json.DefaultConfig()

    // 型安全な取得関数を使用。デフォルト値内蔵
    cfg.StrictMode = json.GetBool(data, "config.strict", true)

    return cfg
}
```

## エラー分類

### ユーザー入力エラー

ユーザーが提供した JSON データやパスに起因します：

```go
val, err := json.Get(data, "user.name")
if err != nil {
    switch {
    case errors.Is(err, json.ErrInvalidJSON):
        // JSON フォーマットエラー
        return fmt.Errorf("データ形式エラー：%w", err)
    case errors.Is(err, json.ErrPathNotFound):
        // パスが存在しない
        return fmt.Errorf("フィールドが存在しません：%w", err)
    case errors.Is(err, json.ErrTypeMismatch):
        // 型が一致しない
        return fmt.Errorf("型エラー：%w", err)
    case errors.Is(err, json.ErrInvalidPath):
        // パス構文エラー
        return fmt.Errorf("パス構文エラー：%w", err)
    case errors.Is(err, json.ErrUnsupportedPath):
        // サポートされないパス操作
        return fmt.Errorf("サポートされない操作：%w", err)
    }
}
```

### セキュリティ関連エラー

潜在的なセキュリティ脅威を検出した場合：

```go
val, err := json.Get(untrustedInput, "data")
if err != nil {
    if errors.Is(err, json.ErrSecurityViolation) {
        // セキュリティ違反。記録して拒否
        log.Warn("セキュリティ違反", "error", err)
        return errors.New("入力が不正です")
    }
    if errors.Is(err, json.ErrSizeLimit) {
        return fmt.Errorf("データがサイズ制限を超過：%w", err)
    }
    if errors.Is(err, json.ErrDepthLimit) {
        return fmt.Errorf("ネスト深度超過：%w", err)
    }
    return err
}
```

### システムエラー

システムレベルの一時的エラー：

```go
val, err := json.Get(data, "user.name")
if err != nil {
    if errors.Is(err, json.ErrOperationTimeout) {
        // 操作タイムアウト、リトライ可能 <Badge type="danger" text="非推奨" />
        return fmt.Errorf("一時的エラーです。再試行してください：%w", err)
    }
    if errors.Is(err, json.ErrConcurrencyLimit) {
        // 並行制限（MaxConcurrency 到達時に返る、リトライ可能）
        return fmt.Errorf("システムが繁忙です。しばらくお待ちください：%w", err)
    }
    if errors.Is(err, json.ErrResourceExhausted) {
        // リソース枯渇 <Badge type="danger" text="非推奨" />
        return fmt.Errorf("システムリソース不足：%w", err)
    }
    if errors.Is(err, json.ErrProcessorClosed) {
        // プロセッサはクローズ済み
        return fmt.Errorf("プロセッサ利用不可：%w", err)
    }
    return err
}
```

## エラー処理ベストプラクティス

### 1. エラー型を区別する

```go
func processJSON(data string) error {
    val, err := json.Get(data, "user.name")
    if err != nil {
        // errors.Is でエラー型を区別
        switch {
        case errors.Is(err, json.ErrInvalidJSON),
            errors.Is(err, json.ErrPathNotFound),
            errors.Is(err, json.ErrTypeMismatch),
            errors.Is(err, json.ErrInvalidPath):
            // ユーザー入力エラー。丁寧なメッセージを返す
            return fmt.Errorf("データ形式エラー：%w", err)
        case errors.Is(err, json.ErrSecurityViolation):
            // セキュリティエラー。記録して拒否
            log.Warn("セキュリティ違反", "error", err)
            return errors.New("入力が不正です")
        case errors.Is(err, json.ErrConcurrencyLimit):
            // 並行上限。後でリトライ可能
            return fmt.Errorf("システムが繁忙です。後で再試行してください：%w", err)
        case errors.Is(err, json.ErrOperationTimeout): // Deprecated（現在返されない。互換性のために保留）
            return fmt.Errorf("一時的エラーです。再試行してください：%w", err)
        default:
            // システムエラー
            log.Error("システムエラー", "error", err)
            return errors.New("内部エラー")
        }
    }
    return nil
}
```

### 2. errors.As でコンテキストを取得

```go
func handleWithDetail(data string, path string) error {
    val, err := json.Get(data, path)
    if err != nil {
        var jsonErr *json.JsonsError
        if errors.As(err, &jsonErr) {
            return fmt.Errorf("操作 %s が失敗 (パス: %s): %w",
                jsonErr.Op, jsonErr.Path, jsonErr.Err)
        }
        return fmt.Errorf("操作が失敗：%w", err)
    }
    return nil
}
```

### 3. エラーチェーンの追跡

```go
func deepProcess(data string) error {
    if err := processLevel1(data); err != nil {
        return fmt.Errorf("深層処理が失敗：%w", err)
    }
    return nil
}

func processLevel1(data string) error {
    if err := processLevel2(data); err != nil {
        return fmt.Errorf("レベル 1 処理が失敗 (パス data.field): %w", err)
    }
    return nil
}

func processLevel2(data string) error {
    _, err := json.Get(data, "data.field")
    return err
}

// エラーチェーンの例（JsonsError は Op/Path を保持し、fmt.Errorf の %w が底層の原因を層々と保持する）:
// 深層処理が失敗：レベル 1 処理が失敗 (パス data.field): JSON get failed at path 'data.field': ... (caused by: path not found)
```

## 関連

- [定数とエラー](../api-reference/constants)
- [セキュリティ概要](../security/)
- [パフォーマンス最適化](./performance)
