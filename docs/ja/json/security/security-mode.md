---
sidebar_label: "セキュリティモード"
title: "セキュリティモード - CyberGo JSON | API リファレンス"
description: "CyberGo JSON セキュリティ API：セキュリティ設定、AddDangerousPattern による独自危険パターン登録、PatternLevel の 3 段階重大度と組み込み危険パターン、入力バリデーションで JSON インジェクション、プロトタイプ汚染、XSS などを防御。"
sidebar_position: 2
---

# セキュリティモード

セキュリティモードは危険パターン検出機能を提供し、JSON インジェクション攻撃、プロトタイプ汚染、その他のセキュリティ脅威を防止します。

## DangerousPattern 構造体

DangerousPattern はセキュリティリスクパターンを表す構造体型です。

```go
type DangerousPattern struct {
    Pattern string       // 入力内で検出する部分文字列
    Name    string       // パターンの説明名
    Level   PatternLevel // このパターンの処理方法を決定する重大度レベル
}
```

### フィールドの説明

| フィールド | 型 | 説明 |
|------|------|------|
| `Pattern` | `string` | 入力内で検出する部分文字列 |
| `Name` | `string` | パターンの説明名 |
| `Level` | `PatternLevel` | このパターンの処理方法を決定する重大度レベル |

---

## PatternLevel 型

PatternLevel は危険パターンの重大度レベルを表します。

```go
type PatternLevel int
```

### 定数

```go
const (
    // PatternLevelCritical 常に操作をブロック
    // 即座にセキュリティリスクを構成するパターンに使用（プロトタイプ汚染など）
    PatternLevelCritical PatternLevel = iota

    // PatternLevelWarning 厳格モードではブロック、緩やかなモードでは警告を記録
    // 悪意のある意図を示唆するが正当な用途もあるパターンに使用
    PatternLevelWarning

    // PatternLevelInfo ログ記録のみ、ブロックしない
    // 監査/追跡目的で使用、操作を中断しない
    PatternLevelInfo
)
```

### String メソッド

```go
func (pl PatternLevel) String() string
```

PatternLevel の文字列表現を返します（`"critical"`、`"warning"`、`"info"`、未知の値は `"unknown"`）。

### PatternLevel 動作マトリクス

| レベル | 意味的な意図（インターフェースドキュメント） | 現在の実装の実際の動作 |
|------|----------------------|--------------------|
| `PatternLevelCritical` | 常に操作をブロック | 命中即拒否（`ErrSecurityViolation`） |
| `PatternLevelWarning` | 厳格モードでブロック、緩やかモードでは警告を記録 | **同様に命中即拒否**——`StrictMode` フィールドは現時点でパターンブロックの判断に参加しない |
| `PatternLevelInfo` | 記録のみ、ブロックしない | **同様に命中即拒否** |

::: warning Warning/Info パターンは「ブロックされる」前提で計画してください
現在のバージョンのパターンスキャン（組み込みパターン、`Config.AdditionalDangerousPatterns`、グローバル登録パターンの 3 者は同一のスキャンパスを通る）は、単語境界コンテキストチェックを通過した命中すべてに対して操作を拒否します。`Level` はブロック結果を変えず、監査/ログで重大度を区別するための意味的注記としてのみ機能します。したがって、「記録だけしてブロックしたくない」`PatternLevelInfo` レベルのパターンを登録し、そのパターンを含む入力を通過させることは**しないでください**——現時点ではブロックされます。すべての一致は大文字小文字を区別しません。
:::

---

## 組み込み危険パターン

### デフォルトパターン

::: warning 内部 API
組み込みパターンリストは内部関数で管理されており、公開 API としてエクスポートされなくなりました。Config の `AdditionalDangerousPatterns` フィールドでカスタムパターンを管理できます。
:::

以下は組み込み危険パターンリストで、すべて Critical レベルです：

| パターン | 名前 | カテゴリ |
|------|------|------|
| `__proto__` | prototype pollution | プロトタイプ汚染 |
| `constructor[` | constructor access | コンストラクタアクセス |
| `prototype.` | prototype manipulation | プロトタイプ操作 |
| `<script` | script tag injection | HTML インジェクション |
| `<iframe` | iframe injection | HTML インジェクション |
| `<object` | object injection | HTML インジェクション |
| `<embed` | embed injection | HTML インジェクション |
| `<svg` | svg injection | HTML インジェクション |
| `javascript:` | javascript protocol | プロトコルインジェクション |
| `vbscript:` | vbscript protocol | プロトコルインジェクション |
| `eval(` | dynamic code execution | コード実行 |
| `setTimeout(` | timer manipulation | コード実行 |
| `setInterval(` | interval manipulation | コード実行 |
| `require(` | code injection | コード実行 |
| `new function(` | dynamic function creation | コード実行 |
| `document.cookie` | cookie access | DOM アクセス |
| `window.location` | redirect manipulation | DOM アクセス |
| `innerhtml` | DOM manipulation | DOM アクセス |
| `onerror`, `onload`, `onclick`, `onmouseover`, `onfocus` | event handler injection | イベントハンドラ |
| `fromcharcode(` | character encoding bypass | エンコーディングバイパス |
| `atob(` | base64 decoding | エンコーディングバイパス |
| `expression(` | CSS expression injection | CSS インジェクション |
| `__defineGetter__` | getter definition | プロトタイプ汚染 |
| `__defineSetter__` | setter definition | プロトタイプ汚染 |

### 重要パターン

::: warning 内部 API
GetCriticalPatterns は内部関数に移行し、公開 API としてエクスポートされなくなりました。重要パターン（`__proto__`、`constructor[`、`prototype.`）は常に強制的にチェックされ、無効化できません。
:::

以下の重要パターンは JSON サイズに関わらず常にフルスキャンされます：

| パターン | 説明 |
|------|------|
| `__proto__` | prototype pollution |
| `constructor[` | constructor access |
| `prototype.` | prototype manipulation |

---

## パターン登録メソッド

危険パターンはグローバル登録関数ではなく、`Config` 構造体を通じて設定します。

### Config.AddDangerousPattern

シグネチャ：`func (c *Config) AddDangerousPattern(pattern DangerousPattern)`

設定にカスタム危険パターンを追加します。

```go
cfg := json.DefaultConfig()
cfg.AddDangerousPattern(json.DangerousPattern{
    Pattern: "malicious_keyword",
    Name:    "カスタム危険パターン",
    Level:   json.PatternLevelCritical,
})

processor, err := json.New(cfg)
if err != nil {
    panic(err)
}
defer processor.Close()
```

### Config.AdditionalDangerousPatterns

`Config.AdditionalDangerousPatterns` フィールドを直接設定することも可能です：

```go
cfg := json.DefaultConfig()
cfg.AdditionalDangerousPatterns = []json.DangerousPattern{
    {Pattern: "eval(", Name: "eval-call", Level: json.PatternLevelCritical},
    {Pattern: "exec(", Name: "exec-call", Level: json.PatternLevelWarning},
}
```

---

## Config 設定メソッド

### AddDangerousPattern

設定にセキュリティパターンを追加します。

```go
func (c *Config) AddDangerousPattern(pattern DangerousPattern)
```

```go
cfg := json.DefaultConfig()
cfg.AddDangerousPattern(json.DangerousPattern{
    Pattern: "custom_dangerous_string",
    Name:    "カスタム危険文字列",
    Level:   json.PatternLevelWarning,
})
```

### 設定フィールド

```go
type Config struct {
    // ... その他のフィールド ...

    // AdditionalDangerousPatterns デフォルトパターンに追加するセキュリティパターン
    AdditionalDangerousPatterns []DangerousPattern

    // DisableDefaultPatterns 組み込みデフォルトセキュリティパターンを無効化（重要パターン以外）
    // true に設定すると AdditionalDangerousPatterns のみ使用
    // 注意：重要パターン（__proto__、constructor[、prototype.）は常に強制実行され、無効化不可
    DisableDefaultPatterns bool
}
```

---

## グローバルパターン登録

`Config` でインスタンスレベルのパターンを設定するほかに、パッケージレベル関数でグローバルパターンレジストリを管理できます。グローバルレジストリのパターンはすべての Processor インスタンスで有効になります。

### RegisterDangerousPattern

シグネチャ：`func RegisterDangerousPattern(pattern DangerousPattern)`

グローバルレジストリにカスタム危険パターンを追加します。登録されたパターンはすべての Processor インスタンスで有効になります。

```go
json.RegisterDangerousPattern(json.DangerousPattern{
    Pattern: "malicious_keyword",
    Name:    "カスタム危険パターン",
    Level:   json.PatternLevelCritical,
})
```

### UnregisterDangerousPattern

シグネチャ：`func UnregisterDangerousPattern(pattern string)`

グローバルレジストリから指定パターンを削除します。

```go
json.UnregisterDangerousPattern("malicious_keyword")
```

### ListDangerousPatterns

シグネチャ：`func ListDangerousPatterns() []DangerousPattern`

グローバルレジストリのすべてのカスタムパターンを返します。

```go
patterns := json.ListDangerousPatterns()
for _, p := range patterns {
    fmt.Printf("パターン: %s, 名前: %s, レベル: %s\n", p.Pattern, p.Name, p.Level)
}
```

### グローバル登録 vs Config 追加

| 観点 | グローバル登録（`RegisterDangerousPattern`） | Config 追加（`AddDangerousPattern` / `AdditionalDangerousPatterns`） |
|------|----------------------------------------|---------------------------------------------------------------------|
| スコープ | プロセス内の**すべて**の Processor。作成済みインスタンスを含む（スキャン時にリアルタイムでレジストリを読み取り） | その Config で作成された Processor のみ（構築時にセキュリティ検証へ固定） |
| 削除方法 | `UnregisterDangerousPattern(pattern)` が即時有効 | 実行時の削除なし。新しい Config で Processor を再構築する必要あり |
| 照会方法 | `ListDangerousPatterns()` | `cfg.AdditionalDangerousPatterns` フィールドを読み取り |
| `DisableDefaultPatterns` との関係 | 影響を受けない（明示的に追加されたパターンは常にスキャン） | 影響を受けない（同上） |
| 典型的な用途 | アプリケーションレベルのセキュリティポリシー、コンプライアンスのブラックリスト。`main` 起動時に登録 | 単一インスタンスのビジネスカスタマイズ（例: 特定テナントの Processor だけが特定キーワードをブロック） |

完全な比較サンプル：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	// グローバル登録: すべての Processor で有効（作成済みインスタンスを含む）
	json.RegisterDangerousPattern(json.DangerousPattern{
		Pattern: "internal_only",
		Name:    "内部識別子",
		Level:   json.PatternLevelCritical,
	})
	defer json.UnregisterDangerousPattern("internal_only")

	// Config 追加: その Config を使用する Processor のみに影響
	cfg := json.DefaultConfig()
	cfg.AddDangerousPattern(json.DangerousPattern{
		Pattern: "project_secret",
		Name:    "プロジェクト機密",
		Level:   json.PatternLevelCritical,
	})

	withCfg, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer withCfg.Close()

	withoutCfg, err := json.New(json.DefaultConfig())
	if err != nil {
		panic(err)
	}
	defer withoutCfg.Close()

	_, err1 := withCfg.Get(`{"v": "project_secret"}`, "v")
	_, err2 := withoutCfg.Get(`{"v": "project_secret"}`, "v")
	_, err3 := withoutCfg.Get(`{"v": "internal_only"}`, "v")

	fmt.Println("ローカルパターンが設定付きプロセッサをブロック:", err1 != nil)
	fmt.Println("ローカルパターンが通常プロセッサをブロック:", err2 != nil)
	fmt.Println("グローバルパターンが通常プロセッサをブロック:", err3 != nil)
	// 出力:
	// ローカルパターンが設定付きプロセッサをブロック: true
	// ローカルパターンが通常プロセッサをブロック: false
	// グローバルパターンが通常プロセッサをブロック: true
}
```

---

## 完全な例

### カスタムセキュリティポリシー

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// 方法 1: 設定フィールドで
	cfg := json.DefaultConfig()
	cfg.AdditionalDangerousPatterns = []json.DangerousPattern{
		{Pattern: "company_secret", Name: "会社の機密情報", Level: json.PatternLevelCritical},
	}

	// 方法 2: 設定メソッドで
	cfg.AddDangerousPattern(json.DangerousPattern{
		Pattern: "internal_api",
		Name:    "内部 API 参照",
		Level:   json.PatternLevelWarning,
	})

	p, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// 危険パターン検出のテスト（パターンは単語全体として一致: 両側に英字/数字/アンダースコアが隣接しない）
	_, err = p.Get(`{"data": "company_secret"}`, "data")
	fmt.Println("危険パターンを検出:", err != nil)
	// 出力: 危険パターンを検出: true

	// 登録済みパターンの確認
	fmt.Printf("カスタムパターン数: %d\n", len(cfg.AdditionalDangerousPatterns))
}
```

::: tip マッチングは「単語全体」で行われる
パターンが命中すると、単語境界コンテキストチェックが行われます: パターンの両側に英字、数字、アンダースコアが隣接している場合は通常の識別子の一部とみなされ、ブロックされません。例えばパターン `company_secret` は `"company_secret"` ではトリガーされますが、`"company_secret_info"` ではトリガーされません（後続の `_` は単語内文字のため）。`(`、`[`、`:`、`.` などの区切り文字で終わるパターン（`eval(` など）は後続文字の影響を受けません。これがライブラリ組み込みパターン（`eval(`、`__proto__` など）のマッチ方式です。
:::

### デフォルトパターンの無効化

```go
cfg := json.DefaultConfig()

// 組み込みデフォルトパターンを無効化し（重要パターン以外）、カスタムパターンのみ使用
// 注意: 重要パターン（__proto__、constructor[、prototype.）は常に強制実行
cfg.DisableDefaultPatterns = true

// カスタムパターンの追加
cfg.AddDangerousPattern(json.DangerousPattern{
    Pattern: "xss_payload",
    Name:    "XSS 攻撃ペイロード",
    Level:   json.PatternLevelCritical,
})

p, err := json.New(cfg)
if err != nil {
    panic(err)
}
defer p.Close()
```

### レベル別のパターン処理

```go
// 異なるレベルのパターンを登録
cfg := json.DefaultConfig()
cfg.AddDangerousPattern(json.DangerousPattern{
    Pattern: "suspicious_but_allowed",
    Name:    "疑わしいが許可",
    Level:   json.PatternLevelInfo, // 意味的注記。現在の実装では命中すると同様にブロックされる（PatternLevel 動作マトリクスを参照）
})

// 登録済みカスタムパターンの確認
for _, p := range cfg.AdditionalDangerousPatterns {
    fmt.Printf("パターン: %s, 名前: %s, レベル: %s\n", p.Pattern, p.Name, p.Level)
}
```

---

## スキャンスイッチ

3 つの Config フィールドが「どうスキャンするか」を制御します:

| フィールド | デフォルト | 作用 |
|------|------|------|
| `FullSecurityScan` | `false` | `true` ではすべての入力をサイズにかかわらず全量スキャン。`false` では小さい入力（< 4KB）を全量、大きい入力は階層的最適化スキャン（次節を参照、同じく 100% カバレッジを保証）。全量モードは >100KB の入力に約 10–30% の追加オーバーヘッド |
| `DisableDefaultPatterns` | `false` | `true` では組み込みの非重要パターン（HTML タグ、イベントハンドラなど）をスキップし、3 つの重要パターン + カスタムパターンのみ残す |
| `AdditionalDangerousPatterns` | `nil` | 組み込みパターンに加えてカスタムパターンを追加（前述を参照） |

```go
cfg := json.SecurityConfig() // FullSecurityScan 有効 + 各制限を引き締め済み
// 手動設定と等価:
// cfg := json.DefaultConfig()
// cfg.FullSecurityScan = true
```

有効化の推奨: **信頼できない入力**（パブリック API、ユーザー投稿、外部 webhook）を扱う場合、機密データ（認証、金融、個人情報）に関わる場合、またはコンプライアンスによる全量監査の要件がある場合は `FullSecurityScan` を有効にしてください。信頼できる内部サービスの大きなペイロードは、デフォルトの階層スキャンのままにしてスループットを両立できます。

---

## セキュリティスキャン戦略

### 小規模 JSON（< 4KB）

常に完全なセキュリティスキャンを実行し、すべての危険パターンを一つずつチェックします。

### より大きな JSON（≥ 4KB）

多層最適化スキャンを採用し、**100% カバレッジを保証**します（サンプリングの盲域なし）:

- 重要パターン（`__proto__`、`constructor[`、`prototype.`）は常に完全スキャン
- まず指示文字のチェック: 危険文字が 1 つもない場合は高速にスキップ
- 疑わしい文字密度を検出: 密度が高すぎる場合は全量スキャンにフォールバックし、攻撃者が密集領域に悪意ある内容を隠すのを防止
- その他のパターンは 32KB **スライディングウィンドウ**でスキャン（ウィンドウはオーバーラップ付き）、境界をまたぐパターンの見落としを防止

---

## 関連

- [Config](../api-reference/config) - 設定オプション
- [スキーマ検証](../api-reference/schema) - Schema 検証
- [Hook フックシステム](../extensions/hooks) - 操作のインターセプト
