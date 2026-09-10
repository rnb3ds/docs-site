---
sidebar_label: "ユーティリティ関数"
title: "ユーティリティ関数 - CyberGo JSON | API リファレンス"
description: "CyberGo JSON 補助関数：CompareJSON キー順・数値精度差を無視、ClearCache/GetStats キャッシュ管理、GetHealthStatus ヘルス監視、グローバルプロセッサ管理、SafeError/RedactedPath セキュリティ補助で日常の Go JSON 操作を簡素化。"
sidebar_position: 8
---

# ユーティリティ関数

json パッケージは、JSON 比較、キャッシュ管理、ユーティリティ処理のための豊富な補助関数を提供します。

## JSON 比較関数

### CompareJSON

シグネチャ：`func CompareJSON(json1, json2 string, cfg ...Config) (bool, error)`

2 つの JSON 文字列が等しいか比較します。数値精度の違いとキー順序の違いを処理します。

cfg なしの場合の動作は従来どおりです（セキュリティ検証なし、両側を `encoding/json` でマーシャル）。cfg を渡すと、2 つの入力にセキュリティ検証（サイズ/深度/危険パターン制限）を適用し、設定のエンコードで対称比較を行います。

```go
// キー順序が異なるが内容は同じ
equal, _ := json.CompareJSON(`{"a":1,"b":2}`, `{"b":2,"a":1}`)
fmt.Println(equal) // true

// 数値精度が異なるが値は同じ
equal, _ = json.CompareJSON(`{"num":1}`, `{"num":1.0}`)
fmt.Println(equal) // true

// 内容が異なる
equal, _ = json.CompareJSON(`{"a":1}`, `{"a":2}`)
fmt.Println(equal) // false

// 設定付き（セキュリティ検証とエンコード制御を適用）
equal, err = json.CompareJSON(a, b, json.SecurityConfig())
```

::: tip Processor 等価メソッド
`Processor.CompareJSON` は常にセキュリティ検証を実行します（cfg またはプロセッサ自身の設定に従う）。パッケージレベル関数の cfg なしパスとは動作が異なります。詳しくは [Processor データ変更](./processor/modify#processor-comparejson) を参照してください。
:::

---

## JSON マージ関数

### MergeJSON

シグネチャ：`func MergeJSON(json1, json2 string, cfg ...Config) (string, error)`

2 つの JSON オブジェクトをマージします。Config でマージモードを設定できます。詳しくは[変更関数](./functions/modify#mergejson)を参照してください。

**セマンティクスの詳細**：

- **2 つの入力はどちらも JSON オブジェクトである必要があります**（トップレベルがオブジェクトでない場合は `first/second JSON is not an object` エラー）
- ネストされたオブジェクトは `Config.MergeMode` で再帰的にディープマージ。プリミティブ値と配列は `json2` の値をそのまま採用
- 数値は精度保持方式でデコードされた後、`float64` に正規化してからエンコードされます（`1` と `1.0` は等価）
- **セキュリティ検証は行いません**——純粋な構造ツールであり、デコード、マージ、再エンコードのみを行います（cfg を渡した場合の `CompareJSON` とは異なります）

---

### MergeMany

シグネチャ：`func MergeMany(jsons []string, cfg ...Config) (string, error)`

複数の JSON オブジェクトをマージします。詳しくは[変更関数](./functions/modify#mergemany)を参照してください。

**セマンティクスの詳細**：**少なくとも 2 つの** JSON 文字列が必要です（そうでなければエラー）。左から右へ畳み込み（`MergeJSON` を順に呼ぶのと等価）、いずれかのステップが失敗すると `merge failed at index N: <原因>` エラーを返します。

---

## キャッシュと統計

### ClearCache（パッケージレベル関数）

シグネチャ：`func ClearCache()`

グローバルプロセッサの内部キャッシュをクリアします。

```go
json.ClearCache()
```

---

### GetStats（パッケージレベル関数）

シグネチャ：`func GetStats() Stats`

グローバルプロセッサの統計情報を取得します。

```go
stats := json.GetStats()
fmt.Printf("キャッシュヒット率：%.2f%%\n", stats.HitRatio * 100)
fmt.Printf("キャッシュサイズ：%d\n", stats.CacheSize)
```

---

### GetHealthStatus（パッケージレベル関数）

シグネチャ：`func GetHealthStatus() HealthStatus`

グローバルプロセッサのヘルス状態を取得します。

```go
status := json.GetHealthStatus()
if status.Healthy {
    fmt.Println("プロセッサは正常")
}
```

---

### Processor.ClearCache

シグネチャ：`func (p *Processor) ClearCache()`

プロセッサの内部キャッシュをクリアします。

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

p.ClearCache()
```

### Processor.GetStats

シグネチャ：`func (p *Processor) GetStats() Stats`

プロセッサの統計情報を取得します。

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

stats := p.GetStats()
fmt.Printf("キャッシュヒット率：%.2f%%\n", stats.HitRatio * 100)
fmt.Printf("キャッシュサイズ：%d\n", stats.CacheSize)
```

### Processor.GetHealthStatus

シグネチャ：`func (p *Processor) GetHealthStatus() HealthStatus`

プロセッサのヘルス状態を取得します。

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

status := p.GetHealthStatus()
if status.Healthy {
    fmt.Println("プロセッサは正常")
}
```

### WarmupCache

シグネチャ：`func WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)`

キャッシュをウォームアップし、以降の操作のパフォーマンスを向上させます。

```go
data := `{"user": {"name": "Alice", "email": "alice@example.com"}, "items": [{"id": 1}]}`
paths := []string{"user.name", "user.email", "items[*].id"}
result, err := json.WarmupCache(data, paths)
if err != nil {
    panic(err)
}
fmt.Printf("%d 個のパスのウォームアップに成功\n", result.Successful)
```

**WarmupResult 構造**

| フィールド | 型 | 説明 |
|------|------|------|
| `TotalPaths` | `int` | ウォームアップ対象のパス総数 |
| `Successful` | `int` | キャッシュに成功したパス数 |
| `Failed` | `int` | 失敗したパス数 |
| `SuccessRate` | `float64` | 成功率。**パーセント 0–100**（0–1 ではない。空パスリストは 100） |
| `FailedPaths` | `[]string` | 失敗パスのリスト（すべて成功した場合は nil） |

::: warning ウォームアップのエラー境界
`WarmupCache` は**すべてのパスが失敗した**場合に `(result, error)` を返します（error は最後の失敗理由を保持）。キャッシュが無効（`EnableCache: false`）の場合は直接エラーを返します。部分失敗は `WarmupResult` フィールドにのみ現れ、error は nil です。
:::

---

## グローバルプロセッサ管理

パッケージレベル関数は内部でグローバルプロセッサを使用します。以下の関数でカスタマイズまたはシャットダウンできます：

| 関数 | シグネチャ | 説明 |
|------|------|------|
| `SetGlobalProcessor` | `func SetGlobalProcessor(processor *Processor)` | カスタムグローバルプロセッサを設定 |
| `ShutdownGlobalProcessor` | `func ShutdownGlobalProcessor()` | グローバルプロセッサをクローズしてリソース解放 |

**動作の詳細**：

- `SetGlobalProcessor(nil)` は何もしません。置き換えに成功すると**古いプロセッサは同期的に Close されます**（Close 内部で最大約 5 秒待機）。その間、進行中の操作は影響を受けません
- `ShutdownGlobalProcessor` はスレッドセーフです：デフォルトプロセッサ、バックアッププロセッサ、**設定キャッシュ内のすべてのプロセッサ**をクローズし、パス型キャッシュなどのグローバルキャッシュもクリーンアップします。以降、パッケージレベル関数の最初の呼び出しで**新しいデフォルトプロセッサが自動作成**されます。長寿命サービスの終了処理に適します

::: tip 詳しい使い方
グローバルプロセッサの完全な使用例とライフサイクル管理は、[Processor 概要](./processor/#グローバルプロセッサ管理)と [Processor 入門ガイド](../getting-started/processor-guide#グローバルプロセッサ)を参照してください。
:::

---

## 出力関数

::: warning API 変更の説明
Print、PrintPretty、PrintE、PrintPrettyE はライブラリから削除され、提供されなくなりました。[EncodeWithConfig](./functions/output#encodewithconfig)、[EncodePretty](./functions/output#encodepretty) または [Prettify](./functions/output#prettify) を `fmt.Println` と組み合わせて代わりに使用してください（`Encode` は非推奨）。詳しくは[フォーマット出力](../getting-started/print)を参照してください。
:::

---

## Buffer 互換関数

`Compact`、`Indent`、`HTMLEscape` は `encoding/json` 標準ライブラリと完全互換で、同時に `cfg` パラメータで追加設定をサポートします。完全なサンプルと Processor の等価メソッドは[エンコード出力関数](./functions/output#compact)を参照してください。

| 関数 | シグネチャ | 説明 |
|------|------|------|
| `Compact` | `func Compact(dst *bytes.Buffer, src []byte, cfg ...Config) error` | 意味のない空白を除去し、**dst に書き込む**（`encoding/json.Compact` 互換、`Processor.CompactBuffer` のミラー） |
| `CompactString` | `func CompactString(jsonStr string, cfg ...Config) (string, error)` | 文字列イン、文字列アウト（`Processor.Compact` のミラー）。`Compact` とは**異なる関数** |
| `Indent` | `func Indent(dst *bytes.Buffer, src []byte, prefix, indent string, cfg ...Config) error` | インデント整形して dst に書き込み（`encoding/json.Indent` 互換） |
| `HTMLEscape` | `func HTMLEscape(dst *bytes.Buffer, src []byte, cfg ...Config)` | `<` `>` `&` と U+2028/U+2029 をエスケープして dst に書き込み。戻り値なし |

---

## セキュリティモード関数

### Config.AddDangerousPattern

Config の `AddDangerousPattern` メソッドまたは `AdditionalDangerousPatterns` フィールドでカスタム危険パターンを登録します。

```go
cfg := json.DefaultConfig()
cfg.AddDangerousPattern(json.DangerousPattern{
    Pattern: "malicious_keyword",
    Name:    "カスタム悪意キーワード",
    Level:   json.PatternLevelCritical,
})
p, err := json.New(cfg)
if err != nil {
    panic(err)
}
defer p.Close()
```

Config 作成後に `AdditionalDangerousPatterns` フィールドを設定することもできます：

```go
cfg := json.DefaultConfig()
cfg.AdditionalDangerousPatterns = []json.DangerousPattern{
    {Pattern: "malicious_keyword", Name: "カスタム悪意キーワード", Level: json.PatternLevelCritical},
}
p, err := json.New(cfg)
if err != nil {
    panic(err)
}
defer p.Close()
```

**DangerousPattern 構造体**

| フィールド | 型 | 説明 |
|------|------|------|
| `Pattern` | `string` | 検出する部分文字列 |
| `Name` | `string` | 人間が読めるリスクの説明 |
| `Level` | `PatternLevel` | 重大度レベル |

**PatternLevel レベル**

| レベル | 説明 |
|------|------|
| `PatternLevelCritical` | 常に操作を阻止 |
| `PatternLevelWarning` | 厳格モードでは阻止、緩いモードでは警告を記録 |
| `PatternLevelInfo` | 記録のみ、決して阻止しない |

---

## セキュリティモード登録（グローバル関数）

Config レベルの `AdditionalDangerousPatterns` に加え、ライブラリは**グローバルレジストリ**も維持しています。プロセスレベルの統一セキュリティポリシーに適します：プロセス起動時に 1 回登録すれば、プロセス内の**すべての Processor** に有効です——検証時にはグローバルレジストリがリアルタイムに読み込まれるため、作成済みの Processor を再構築する必要はありません。各 Processor の設定とは無関係に動作し（`DisableDefaultPatterns` を設定していても有効）、登録と削除はいずれもスレッドセーフな操作です。

`DangerousPattern` 構造体と `PatternLevel` レベルの定義は、上の[セキュリティモード関数](#セキュリティモード関数)セクションを参照してください。

### RegisterDangerousPattern

```go
func RegisterDangerousPattern(pattern DangerousPattern)
```

プロセスレベルの**グローバルレジストリ**に危険パターンを登録します。登録後は内蔵パターンとともにセキュリティ検証へ参加します（部分文字列として検出、大文字小文字は区別しない）。同一のパターン文字列を重複登録すると、古いエントリを上書きします。

**パラメータ**

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `pattern` | `DangerousPattern` | はい | 登録するパターン（`Pattern` は検出する部分文字列、`Name` は人間が読める説明、`Level` は重大度レベル） |

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	// プロセス起動時に 1 回登録すれば、プロセス内のすべての Processor に有効
	json.RegisterDangerousPattern(json.DangerousPattern{
		Pattern: "internal_admin_token",
		Name:    "内部管理トークン",
		Level:   json.PatternLevelCritical,
	})

	// グローバル登録したパターンは、以降に作成する Processor にも有効
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// ListDangerousPatterns はカスタム登録したパターンのみ返す（内蔵パターンは含まない）
	for _, dp := range json.ListDangerousPatterns() {
		fmt.Printf("%s（level=%d）\n", dp.Pattern, dp.Level)
	}
	// 出力：internal_admin_token（level=0）
}
```

### UnregisterDangerousPattern

```go
func UnregisterDangerousPattern(pattern string)
```

パターン文字列でグローバルレジストリからカスタムパターンを削除します。未登録のパターンを削除しても無害で、何も起こりません。内蔵パターンには効きません（このセクション末尾の警告を参照）。

**パラメータ**

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `pattern` | `string` | はい | 削除するパターン文字列（`DangerousPattern.Pattern` フィールドの値） |

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	json.RegisterDangerousPattern(json.DangerousPattern{
		Pattern: "internal_admin_token",
		Name:    "内部管理トークン",
		Level:   json.PatternLevelCritical,
	})

	// パターン文字列で削除。未登録のパターンを削除しても無害で、何も起こらない
	json.UnregisterDangerousPattern("internal_admin_token")

	// グローバルレジストリにはカスタムパターンのみ保持されるため、削除後は再び空になる
	fmt.Println(len(json.ListDangerousPatterns())) // 出力：0
}
```

### ListDangerousPatterns

```go
func ListDangerousPatterns() []DangerousPattern
```

グローバルレジストリ内のすべてのパターン、すなわち `RegisterDangerousPattern` で登録した**カスタムパターン**を返します——内蔵パターンはライブラリ自身が管理しており、この一覧には含まれず、削除もできません。レジストリが空の場合は空の（nil ではない）スライスを返します。

**戻り値**

| 型 | 説明 |
|------|------|
| `[]DangerousPattern` | 登録済みのすべてのカスタムパターン（レジストリが空の場合は空スライス） |

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	json.RegisterDangerousPattern(json.DangerousPattern{
		Pattern: "internal_admin_token",
		Name:    "内部管理トークン",
		Level:   json.PatternLevelCritical,
	})

	patterns := json.ListDangerousPatterns()
	fmt.Println(len(patterns))     // 出力：1
	fmt.Println(patterns[0].Name)  // 出力：内部管理トークン
	fmt.Println(patterns[0].Level) // 出力：0（すなわち PatternLevelCritical）
}
```

::: warning 内蔵の重要パターンは無効化できない
`__proto__`、`constructor[`、`prototype.` などの重要パターンは**常に強制実行**され、`UnregisterDangerousPattern` と `DisableDefaultPatterns` のいずれも効きません。
:::

セキュリティモードの完全な設計（内蔵危険パターンリスト、`SecurityConfig` プリセットと `PatternLevel` のブロック戦略）は[セキュリティモード](../security/security-mode)を参照してください。

---

## エラー処理関数

### SafeError

シグネチャ：`func SafeError(err error) string`

クライアントに対して安全なエラーメッセージを返します。内部の詳細情報を含みません。API レスポンスでの使用に適します。

```go
val, err := json.Get(data, "user.name")
if err != nil {
    // 安全なエラーメッセージを返す（パス、内部状態などの機密情報を含まない）
    fmt.Println(json.SafeError(err))
}
```

---

### RedactedPath

シグネチャ：`func RedactedPath(path string) string`

マスク済みのパスを返します。安全なログ記録に使用します。パスの機密部分を隠します。

```go
path := "users[0].ssn"
fmt.Println(json.RedactedPath(path)) // 出力: ***（空でないパスは一律 *** を返し、空パスは空文字列を返す）
```

---

## AccessResult 型変換メソッド

`AccessResult` は `Processor.SafeGet()` とパッケージレベル `SafeGet()` の戻り型で、型安全な変換メソッドを提供します。

### AccessResult.AsString

シグネチャ：`func (r AccessResult) AsString() (string, error)`

安全に文字列型へ変換します。値自体が文字列のときのみ成功します。

```go
result := json.SafeGet(data, "user.name")
name, err := result.AsString()
if err != nil {
    return
}
fmt.Println(name)
```

---

### AccessResult.AsStringConverted

シグネチャ：`func (r AccessResult) AsStringConverted() (string, error)`

任意の値を文字列に変換します（fmt.Sprintf でフォーマット）。

```go
result := json.SafeGet(data, "user.age")
ageStr, err := result.AsStringConverted()
// "30"（文字列形式）
```

---

### AccessResult.AsInt

シグネチャ：`func (r AccessResult) AsInt() (int, error)`

安全に整数へ変換します。bool から int への変換はサポートされません。

```go
result := json.SafeGet(data, "user.age")
age, err := result.AsInt()
```

---

### AccessResult.AsFloat64

シグネチャ：`func (r AccessResult) AsFloat64() (float64, error)`

安全に float64 へ変換します。bool から float64 への変換はサポートされません。

```go
result := json.SafeGet(data, "item.price")
price, err := result.AsFloat64()
```

---

### AccessResult.AsBool

シグネチャ：`func (r AccessResult) AsBool() (bool, error)`

安全にブール値へ変換します。bool と string 型のみサポートします。

```go
result := json.SafeGet(data, "feature.enabled")
enabled, err := result.AsBool()
```

---

## 関連

- [クエリと取得関数](./functions/query) - Get, GetString などのクエリ操作
- [変更関数](./functions/modify) - Set, Delete などの変更操作
- [型定義](./types) - AccessResult などの型
- [設定オプション](./config) - Config 設定詳解
