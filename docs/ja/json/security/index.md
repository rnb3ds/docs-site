---
sidebar_label: "セキュリティ概要"
title: "セキュリティ概要 - CyberGo JSON | セキュリティベストプラクティス"
description: "CyberGo JSON セキュリティベストプラクティス：入力バリデーション、MaxNestingDepthSecurity/MaxMemory リソース制限、パストラバーサルと JSON インジェクション対策、機密データフィルタリング、SecurityConfig プリセットで信頼できない入力の制限を一括強化。"
sidebar_position: 1
---

# セキュリティ概要

JSON データを処理する際のセキュリティ上の考慮事項とベストプラクティス。

## 一般的なセキュリティリスク

### 1. リソース枯渇攻撃

悪意を持って構成された JSON は、メモリ枯渇や CPU 過負荷を引き起こす可能性があります: 超深いネスト（スタックオーバーフロー）、超大きな単一値（メモリ）、フラットで超広いオブジェクト/配列（数百万キー）。

**最小再現**（ライブラリのデフォルトで深いネストと超大きな入力をブロック）：

```go
package main

import (
	"fmt"
	"strings"

	"github.com/cybergodev/json"
)

func main() {
	// 5000 層の深いネスト。デフォルト上限 200（DefaultMaxNestingDepth）を超過
	deep := strings.Repeat(`{"a":`, 5000) + `1` + strings.Repeat(`}`, 5000)

	p, err := json.New(json.SecurityConfig()) // ネスト上限が 30 に引き締められる
	if err != nil {
		panic(err)
	}
	defer p.Close()

	_, err = p.Get(deep, "a")
	fmt.Println("深いネストのブロック:", err != nil)
	// 出力: 深いネストのブロック: true
}
```

**防御策：**

```go
cfg := json.DefaultConfig()
cfg.MaxNestingDepthSecurity = 50                       // ネスト深度を制限
cfg.MaxJSONSize = 10 * 1024 * 1024             // JSON サイズを制限 (10MB)
cfg.MaxObjectKeys = 5000                        // 単一オブジェクトのキー数を制限（デフォルト 100000）
cfg.MaxArrayElements = 5000                     // 単一配列の要素数を制限（デフォルト 100000）
cfg.MaxSecurityValidationSize = 100 * 1024 * 1024 // セキュリティ検証上限を 100MB に拡大（デフォルト 10MB）
```

またはプリセット [`json.SecurityConfig()`](./production-checklist#チェックリストテンプレート) を直接使用してください——信頼できない入力向けにすべての制限が引き締め済みです。

### 2. パストラバーサル攻撃

悪意のあるパスが意図しないデータにアクセスする可能性があります。両クラスのパスに組み込み防御があります: **ファイルパス**（`LoadFromFile`/`SaveToFile` など）は読み取り/書き込み時に**無条件で**パストラバーサル、シンボリックリンク、プラットフォーム制限、システムディレクトリのチェックを行います。**JSON パス**（`Get`/`Set` など）は `..`、URL エンコードによるバイパス、ゼロ幅文字などのインジェクションパターンを拒否します。

**最小再現**（両クラスのパスともデフォルトでブロック）：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// ファイルパス: まず NFC 正規化 + 再帰的 URL デコードを行い、その後トラバーサルパターンを検出
	_, err = p.LoadFromFile("../../../etc/passwd")
	fmt.Println("ファイルパストラバーサルのブロック:", err != nil)

	// JSON パス: ".."、URL エンコード、ゼロ幅文字インジェクションを拒否
	_, err = p.Get(`{"data": 1}`, "../../etc/passwd")
	fmt.Println("JSON パストラバーサルのブロック:", err != nil)
	// 出力:
	// ファイルパストラバーサルのブロック: true
	// JSON パストラバーサルのブロック: true
}
```

**防御策：**

```go
// ユーザー入力のパスをバリデーション
func safePath(path string) bool {
    // 特殊文字を禁止
    if strings.ContainsAny(path, `<>:"|\`) {
        return false
    }
    return true
}
```

アプリケーション層でもパスのホワイトリストを維持することを推奨します。ライブラリの組み込み検証は、エンコード難読化などのバイパス手法のブロックを担います。

### 3. JSON インジェクション

悪意のあるデータが JSON 構造を破壊したり、`<script>`、`__proto__` などのペイロードを下流システムに持ち込む可能性があります。ライブラリはデフォルトですべての入力に危険パターンスキャン（大文字小文字を区別しない一致 + 単語境界コンテキストチェック）を行い、命中すると拒否します。

**最小再現**（設定なしのデフォルトでブロック）：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	payloads := []string{
		`{"name": "Alice", "bio": "<script>alert(1)</script>"}`, // XSS
		`{"__proto__": {"isAdmin": true}}`,                      // プロトタイプ汚染
	}
	for i, in := range payloads {
		_, err := p.Get(in, ".")
		fmt.Printf("ペイロード %d のブロック: %v\n", i+1, err != nil)
	}
	// 出力:
	// ペイロード 1 のブロック: true
	// ペイロード 2 のブロック: true
}
```

完全な組み込みパターンリストは[セキュリティモード](./security-mode#組み込み危険パターン)を参照してください。

**防御策：**

```go
// 常にライブラリ関数でシリアライズし、文字列連結は使わない
data := map[string]any{
    "user": userInput, // ライブラリが自動的にエスケープ
}
bytes, _ := json.Marshal(data)
```

### 4. 機密データの漏洩

ログやエラーメッセージが機密データを露出する可能性があります。ライブラリには 2 層の防御線があります: **結果に機密パターン（`password`、`token`、`api_key`、`ssn`、`aws_secret` など）が含まれる場合、操作キャッシュに書き込まない**ため、機密データがキャッシュに長く留まることを防ぎます。`HookContext.JSONStr` のドキュメントコメントも、生の入力を記録しないよう明示的に警告しています。

**防御策**（Hook で返却前に機密フィールドを削除）：

```go
// カスタムフックで機密フィールドをフィルタリング
type FilterFieldsHook struct {
    fields map[string]bool
}

func (h *FilterFieldsHook) Before(ctx json.HookContext) error {
    return nil
}

func (h *FilterFieldsHook) After(ctx json.HookContext, result any, err error) (any, error) {
    if m, ok := result.(map[string]any); ok {
        for field := range h.fields {
            delete(m, field)
        }
    }
    return result, err
}

cfg := json.DefaultConfig()
cfg.AddHook(&FilterFieldsHook{fields: map[string]bool{
    "password": true,
    "token":    true,
    "secret":   true,
}})
```

実行可能な完全な実装コードは[本番チェックリスト・機密データの処理](./production-checklist#機密データの処理)を参照してください。

## セキュリティ設定の推奨事項

### セキュリティ関連 Config フィールドの総覧

これらの制限はライブラリ内部でエクスポート型 `SecurityLimits` に集約されます（公開アクセサなし、フィールド構造の説明のみ）:

```go
type SecurityLimits struct {
    MaxNestingDepth           int   `json:"max_nesting_depth"`
    MaxSecurityValidationSize int64 `json:"max_security_validation_size"`
    MaxObjectKeys             int   `json:"max_object_keys"`
    MaxArrayElements          int   `json:"max_array_elements"`
    MaxJSONSize               int64 `json:"max_json_size"`
    MaxPathDepth              int   `json:"max_path_depth"`
}
```

各フィールドの 2 つの主要設定での値:

| Config フィールド | `DefaultConfig()` デフォルト | `SecurityConfig()` プリセット | 発生するエラー |
|------------|------------------------|--------------------------|------------|
| `MaxJSONSize` | 100MB（`DefaultMaxJSONSize`） | 10MB | `ErrSizeLimit` |
| `MaxNestingDepthSecurity` | 200（`DefaultMaxNestingDepth`） | 30 | `ErrDepthLimit` |
| `MaxPathDepth` | 50（`DefaultMaxPathDepth`） | 30 | `ErrInvalidPath` |
| `MaxObjectKeys` | 100000（`DefaultMaxObjectKeys`） | 5000 | `ErrSizeLimit` |
| `MaxArrayElements` | 100000（`DefaultMaxArrayElements`） | 5000 | `ErrSizeLimit` |
| `MaxSecurityValidationSize` | 10MB（`DefaultMaxSecuritySize`） | 10MB | ——（閾値型） |
| `FullSecurityScan` | `false`（階層的最適化スキャン） | `true`（全量スキャン） | —— |

`Config.Validate` は範囲外の値を正規の区間にクランプします（例: `MaxNestingDepthSecurity` は 10–200、`MaxObjectKeys` は 100–100000 へ）。調整の詳細は `ValidateWithWarnings` で確認できます。

### 危険パターン管理

ライブラリにはデフォルトの危険パターン検出が組み込まれており、カスタムパターンの登録、解除、照会もサポートしています。

カスタムパターンはすべて `DangerousPattern` 構造体で表現されます:

```go
type DangerousPattern struct {
    Pattern string       // 入力内で検出する部分文字列
    Name    string       // パターンの説明名
    Level   PatternLevel // 重大度レベル
}
```

| フィールド | 型 | 説明 |
|------|------|------|
| `Pattern` | `string` | 入力内で検出する部分文字列（大文字小文字を区別しない一致） |
| `Name` | `string` | 人間が読めるリスクの説明（ログと監査に使用） |
| `Level` | `PatternLevel` | 重大度レベル。値は下のレベル表を参照（現時点では意味的注記のみ） |

#### RegisterDangerousPattern

シグネチャ：`func RegisterDangerousPattern(pattern DangerousPattern)`

グローバル危険パターンを登録します。グローバルレジストリのパターンは**すべての Processor インスタンス**で有効です（作成済みのインスタンスを含む——スキャン時にリアルタイムでレジストリを読み取る）。デフォルトパターンに加えてチェックが積み重ねられます。

```go
json.RegisterDangerousPattern(json.DangerousPattern{
    Pattern: "eval(",
    Name:    "eval-call",
    Level:   json.PatternLevelCritical,
})
```

#### UnregisterDangerousPattern

シグネチャ：`func UnregisterDangerousPattern(pattern string)`

パターン文字列でグローバル危険パターンを解除します。パラメータ `pattern` は解除する危険パターンの部分文字列です（`DangerousPattern.Pattern` フィールドに対応）。

```go
json.UnregisterDangerousPattern("eval(")
```

#### ListDangerousPatterns

シグネチャ：`func ListDangerousPatterns() []DangerousPattern`

**グローバル登録されたカスタムパターン**を一覧表示します（組み込みデフォルトパターンは含みません——組み込みパターンは常に有効で、登録は不要です）。

```go
patterns := json.ListDangerousPatterns()
for _, p := range patterns {
    fmt.Printf("パターン: %s, 名前: %s, レベル: %s\n", p.Pattern, p.Name, p.Level)
}
```

#### 危険パターンレベル

| 定数 | 型 | 値 | 説明 |
|------|------|-----|------|
| `PatternLevelCritical` | `PatternLevel` | `0` | 重大レベル。意味上は常にブロック |
| `PatternLevelWarning` | `PatternLevel` | `1` | 警告レベル。意味上は厳格モードでブロック |
| `PatternLevelInfo` | `PatternLevel` | `2` | 情報レベル。意味上は記録のみ |

::: warning レベルの実際のブロック動作
現在の実装のパターンスキャンは（単語境界コンテキストチェックを通過した）**いかなる命中**でも操作を拒否します。`Level` フィールドは現時点ではブロック動作を変えず、意味的注記としてのみ機能します（監査やログで重大度を区別するため）。詳細は[セキュリティモード・PatternLevel 動作マトリクス](./security-mode#patternlevel-動作マトリクス)を参照してください。
:::

::: tip
`PatternLevel` の `String()` メソッドは対応する文字列表現（`"critical"`、`"warning"`、`"info"`）を返し、ログ出力に便利です。
:::

#### デフォルトパターンの無効化

`Config.DisableDefaultPatterns` で組み込みのデフォルトパターンを無効化できます:

```go
cfg := json.DefaultConfig()
cfg.DisableDefaultPatterns = true // 組み込みデフォルトパターンを無効化
```

::: warning 注意
`DisableDefaultPatterns=true` の場合、3 つの重要パターン（`__proto__`、`constructor[`、`prototype.`、常に強制スキャン）を除く残りの組み込みパターンが無効化されます。注意: 組み込みパターンはすべて Critical レベルです。
:::

### プロダクション環境の設定

```go
func ProductionConfig() json.Config {
    cfg := json.SecurityConfig()
    cfg.AddHook(&AuditHook{logger: prodLogger})
    return cfg
}
```

### 開発環境の設定

```go
func DevelopmentConfig() json.Config {
    cfg := json.DefaultConfig()
    cfg.MaxNestingDepthSecurity = 100
    cfg.AddHook(json.LoggingHook(devLogger))
    return cfg
}
```

## 入力バリデーション

### カスタムバリデーター

`Validator` インターフェース（`Validate(jsonStr string) error`）を実装して入力バリデーションを行います:

```go
// カスタムバリデーターの実装
type EmailValidator struct{}

func (v *EmailValidator) Validate(jsonStr string) error {
    // JSON 文字列の内容をバリデーション
    var data map[string]any
    if err := json.Unmarshal([]byte(jsonStr), &data); err != nil {
        return err
    }
    email, ok := data["email"].(string)
    if !ok {
        return nil
    }
    if !strings.Contains(email, "@") {
        return errors.New("invalid email format")
    }
    return nil
}

// カスタムバリデーターの使用
cfg := json.DefaultConfig()
cfg.CustomValidators = []json.Validator{&EmailValidator{}}
```

### スキーマバリデーション

Schema は構造体型で、JSON 構造の検証に使用できます:

```go
schema := &json.Schema{
    Type:     "object",
    Required: []string{"id", "name", "email"},
    Properties: map[string]*json.Schema{
        "id":    {Type: "string", Pattern: `^[a-zA-Z0-9]+$`},
        "name":  {Type: "string", MinLength: 1},
        "email": {Type: "string", Format: "email"},
        "age":   {Type: "number", Minimum: 0, Maximum: 150},
    },
}
```

## エラー処理

### セキュアなエラーメッセージ

```go
val, err := json.Get(data, path)
if err != nil {
    // 内部エラーの詳細を露出しない
    return errors.New("データ形式が無効です")
}
```

## 監査ログ

### 重要な操作の記録

`Hook` インターフェース（`Before` は `error` を返し、`After` は `(HookContext, any, error)` を受け取って `(any, error)` を返す）を使用して監査ログを記録します:

```go
type AuditHook struct {
    logger *slog.Logger
}

func (h *AuditHook) Before(ctx json.HookContext) error {
    h.logger.Info("JSON 操作開始", "op", ctx.Operation, "path", ctx.Path)
    return nil
}

func (h *AuditHook) After(ctx json.HookContext, result any, err error) (any, error) {
    h.logger.Info("JSON 操作完了", "op", ctx.Operation)
    return result, err
}
```

## 関連

- [プロダクションチェックリスト](./production-checklist)
- [Config 設定](../api-reference/config)
- [スキーマ検証](../api-reference/schema)
