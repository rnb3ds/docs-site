---
sidebar_label: "Hook フックシステム"
title: "Hook フックシステム - CyberGo JSON | API リファレンス"
description: "CyberGo JSON Hook フックシステム：Hook インターフェース、LoggingHook、TimingHook、ValidationHook、ErrorHook とカスタムフックが、Before/After と HookContext により JSON 操作の前後に独自ロジックを挿入します。"
sidebar_position: 1
---

# Hook フックシステム

Hook を使うと JSON 操作の前後に独自ロジックを挿入し、ログ記録、パフォーマンス監視、検証などの機能を実現できます。

::: tip インターフェースシグネチャの参照
Hook インターフェースの完全な型シグネチャ（`Hook`、`HookContext`、`HookFunc`）は[インターフェース定義](../api-reference/interfaces#フックインターフェース)を参照してください。本ページは使用ガイドとベストプラクティスに重点を置きます。
:::

## Hook インターフェース

```go
type Hook interface {
    Before(ctx HookContext) error
    After(ctx HookContext, result any, err error) (any, error)
}
```

### メソッドの説明

| メソッド | 説明 |
|------|------|
| `Before(ctx HookContext) error` | 操作前に呼ばれる。エラーを返すと操作を中止できる |
| `After(ctx HookContext, result any, err error) (any, error)` | 操作後に呼ばれる。結果の変更やエラーの返却が可能 |

---

## HookContext 構造

HookContext は操作のコンテキスト情報を提供します。

```go
type HookContext struct {
    Operation string      // 操作型："get", "set", "delete", "marshal", "unmarshal"
    JSONStr   string      // 入力 JSON 文字列（marshal 時は空の場合がある）。セキュリティ警告：機密データを含む可能性あり
    Path      string      // ターゲットパス（marshal/unmarshal 時は空の場合がある）
    Value     any         // set 操作の値
    Config    *Config     // 有効な設定
    StartTime time.Time   // 操作開始時刻
}
```

### フィールド説明

| フィールド | 型 | 説明 |
|------|------|------|
| `Operation` | `string` | 操作型。取り得る値は下記の説明を参照 |
| `JSONStr` | `string` | 入力 JSON 文字列（**セキュリティ警告：機密データを含む可能性あり**） |
| `Path` | `string` | ターゲットパス式 |
| `Value` | `any` | set 操作の値 |
| `Config` | `*Config` | 現在使用中の設定 |
| `StartTime` | `time.Time` | 操作開始時刻（`After` 発火前に設定され、所要時間の計算に利用可） |

::: warning 現在の発火ポイント
フックは現在 **`Get` / `Set` / `Delete`**（パッケージレベルラッパーの `json.Get`/`json.Set`/`json.Delete` を含む。内部は同じ Processor パスを通る）で発火します。`Encode`/`Marshal`/`Unmarshal` パスでは**現時点で発火しません**——`Operation` の `marshal`/`unmarshal` 値は予約であり、依存しないでください。
:::

::: tip JSONStr を記録しない
`JSONStr` にはパスワード、トークン、PII が含まれる可能性があります。ログには `Operation` と `Path` だけを使い、内容の確認が必要な場合は特定パスで解析してから判断してください。
:::

---

## HookFunc アダプター

HookFunc は構造体アダプターで、関数を Hook として使えるようにします。Before か After のどちらか片方だけでよいシナリオに適します。

```go
type HookFunc struct {
    BeforeFn func(ctx HookContext) error
    AfterFn  func(ctx HookContext, result any, err error) (any, error)
}
```

### サンプル

```go
// After だけが必要
p.AddHook(&json.HookFunc{
    AfterFn: func(ctx json.HookContext, result any, err error) (any, error) {
        log.Printf("%s completed in %v", ctx.Operation, time.Since(ctx.StartTime))
        return result, err
    },
})

// Before だけが必要
p.AddHook(&json.HookFunc{
    BeforeFn: func(ctx json.HookContext) error {
        log.Printf("starting %s on path %s", ctx.Operation, ctx.Path)
        return nil
    },
})
```

### Hook と HookFunc の使い分け

| 観点 | カスタム型で `Hook` を実装 | `HookFunc` アダプター |
|------|----------------------|-------------------|
| 状態の保持 | 構造体フィールド（logger、カウンター、バッファ） | クロージャでキャプチャ |
| 片側だけのインターセプト | 2 つのメソッドを実装する必要がある（不要な側は元の値を返す） | `BeforeFn` か `AfterFn` のどちらかだけを設定 |
| 再利用とテスト | 独立した型で、単体テストと複数箇所でのインスタンス化に便利 | その場で定義し、単発ロジックに適する |
| 適するケース | 複雑/ステートフルなフック（監査、メトリクス集約） | 軽量なフック（計測、単純な検証） |

`HookFunc` の未設定の関数は何もしません：`BeforeFn` がなければ Before 段階はそのまま通過し、`AfterFn` がなければ結果とエラーをそのまま返します。

---

## 便利な Hook ファクトリー関数

### LoggingHook

ログ記録 Hook を作成します。引数は `Info(msg string, args ...any)` を実装するだけでよく、`*slog.Logger` が自然に満たします。独自のログファサードを渡すこともできます。

```go
func LoggingHook(logger interface{ Info(msg string, args ...any) }) Hook
```

```go
p.AddHook(json.LoggingHook(slog.Default()))
```

完全なサンプル（最小インターフェースでカスタム logger を作り、1 回の操作で Before + After の 2 回ログが発火することを検証）：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

// CountingLogger は Info メソッドを実装するだけで LoggingHook の logger になれる
type CountingLogger struct{ calls int }

func (l *CountingLogger) Info(msg string, args ...any) {
	l.calls++
}

func main() {
	logger := &CountingLogger{}

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()
	p.AddHook(json.LoggingHook(logger))

	_, err = p.Get(`{"name": "Alice"}`, "name")
	if err != nil {
		panic(err)
	}

	fmt.Println("ログ呼び出し回数:", logger.calls)
	// 出力: ログ呼び出し回数: 2（Before と After で各 1 回）
}
```

### TimingHook

計時 Hook を作成し、操作の所要時間を記録します。引数は `Record(op string, duration time.Duration)` を実装するだけでよく、独自のメトリクスシステムへの接続が容易です。

```go
func TimingHook(recorder interface{ Record(op string, duration time.Duration) }) Hook
```

```go
p.AddHook(json.TimingHook(myMetricsRecorder))
```

完全なサンプル（操作型ごとに呼び出し回数を集約）：

```go
package main

import (
	"fmt"
	"sync"
	"time"

	"github.com/cybergodev/json"
)

// MetricsRecorder は Record インターフェースを実装し、操作型ごとにカウント
type MetricsRecorder struct {
	mu    sync.Mutex
	count map[string]int
}

func (m *MetricsRecorder) Record(op string, duration time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.count[op]++
}

func main() {
	recorder := &MetricsRecorder{count: make(map[string]int)}

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()
	p.AddHook(json.TimingHook(recorder))

	if _, err := p.Get(`{"a": 1}`, "a"); err != nil {
		panic(err)
	}
	if _, err := p.Set(`{"a": 1}`, "b", 2); err != nil {
		panic(err)
	}

	fmt.Println("get 計時記録:", recorder.count["get"])
	fmt.Println("set 計時記録:", recorder.count["set"])
	// 出力:
	// get 計時記録: 1
	// set 計時記録: 1
}
```

### ValidationHook

検証 Hook を作成し、操作前に入力を検証します。検証関数は `(jsonStr, path)` を受け取り、エラーを返すと操作を**中止**します（操作本体は実行されません）。

```go
func ValidationHook(validator func(jsonStr, path string) error) Hook
```

```go
p.AddHook(json.ValidationHook(func(jsonStr, path string) error {
    if len(jsonStr) > 1_000_000 {
        return errors.New("JSON too large")
    }
    return nil
}))
```

完全なサンプル（機密パスへのアクセスをブロック）：

```go
package main

import (
	"errors"
	"fmt"
	"strings"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	p.AddHook(json.ValidationHook(func(jsonStr, path string) error {
		if strings.HasPrefix(path, "secret.") {
			return errors.New("機密パスへのアクセスは禁止: " + path)
		}
		return nil
	}))

	_, err = p.Get(`{"name": "Alice", "secret": {"token": "t"}}`, "name")
	fmt.Println("通常パスは拒否:", err != nil)

	_, err = p.Get(`{"name": "Alice", "secret": {"token": "t"}}`, "secret.token")
	fmt.Println("機密パスは拒否:", err != nil)
	// 出力:
	// 通常パスは拒否: false
	// 機密パスは拒否: true
}
```

### ErrorHook

`ErrorHook` は `HookFunc` の After 段階に基づく実装で、エラーをインターセプトして処理します：操作が**実際に失敗した**（`err != nil`）ときのみ handler を呼び、成功時は素通しです。handler が返すエラーは元のエラーを**置き換えて**上位に伝播します（報告後にそのまま返す、または外部向けに安全なエラーへ変換するなどに使えます）。`nil` を返すとこのエラーを飲み込みます（呼び出し側は成功とみなす）ので、明確に必要な場合のみ使用してください。

```go
func ErrorHook(handler func(ctx HookContext, err error) error) Hook
```

```go
p.AddHook(json.ErrorHook(func(ctx json.HookContext, err error) error {
    sentry.CaptureException(err)
    return err // 元のエラーまたは変換後のエラーを返す
}))
```

完全なサンプル（エラーに操作コンテキストを付加）：

```go
package main

import (
	"fmt"
	"strings"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	p.AddHook(json.ErrorHook(func(ctx json.HookContext, err error) error {
		return fmt.Errorf("[audit] op=%s path=%s: %w", ctx.Operation, ctx.Path, err)
	}))

	_, err = p.Get(`{"name": "Alice"}`, "missing")
	fmt.Println("エラー:", err != nil)
	fmt.Println("コンテキスト付与済み:", strings.HasPrefix(err.Error(), "[audit] op=get path=missing"))
	// 出力:
	// エラー: true
	// コンテキスト付与済み: true
}
```

---

## カスタム Hook 実装

### 完全なサンプル

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"log/slog"
	"time"
)

// ログ Hook
type LoggingHook struct {
	logger *slog.Logger
}

func (h *LoggingHook) Before(ctx json.HookContext) error {
	h.logger.Info("operation starting", "op", ctx.Operation, "path", ctx.Path)
	return nil
}

func (h *LoggingHook) After(ctx json.HookContext, result any, err error) (any, error) {
	h.logger.Info("operation completed",
		"op", ctx.Operation,
		"path", ctx.Path,
		"duration", time.Since(ctx.StartTime),
		"error", err)
	return result, err
}

func main() {
	cfg := json.DefaultConfig()
	p, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// カスタム Hook を追加
	p.AddHook(&LoggingHook{logger: slog.Default()})

	// processor を使用...
	val, err := p.Get(`{"name": "test"}`, "name")
	if err != nil {
		panic(err)
	}
	fmt.Println(val)
}
```

### HookFunc で簡略化

```go
// 完了時刻の記録だけが必要
p.AddHook(&json.HookFunc{
    AfterFn: func(ctx json.HookContext, result any, err error) (any, error) {
        fmt.Printf("%s took %v\n", ctx.Operation, time.Since(ctx.StartTime))
        return result, err
    },
})
```

---

## Hook の設定

### Config 経由で追加

```go
cfg := json.DefaultConfig()
cfg.Hooks = []json.Hook{
    json.LoggingHook(slog.Default()),
    json.TimingHook(myRecorder),
}
p, err := json.New(cfg)
if err != nil {
    panic(err)
}
```

### Processor 経由で追加

```go
p, err := json.New()
if err != nil {
    panic(err)
}
p.AddHook(json.LoggingHook(slog.Default()))
p.AddHook(json.TimingHook(myRecorder))
```

### 2 つの経路の違い

| 観点 | `Config.Hooks` / `cfg.AddHook` | `Processor.AddHook` |
|------|--------------------------------|---------------------|
| 有効になるタイミング | `json.New(cfg)` **構築時**に一括ロード（防御的コピーを行う） | 実行時にいつでも追加可能 |
| 構築後に `Config` を変更 | 作成済みの Processor には影響しない | —— |
| 並行安全性 | 構築前のシングルスレッド設定で十分 | 並行呼び出しはミューテックスで保護 |
| ライフサイクル | Processor に追随 | `Close()` 時にフック参照がクリアされ解放 |

静的アセンブリ（起動時に全フックが判明している場合）は `Config` を、実行時のオンデマンドな有効化/無効化（カナリアリリースのスイッチなど）は `Processor.AddHook` を使ってください。

---

## 実行順序

### Before フック

- **追加順**に実行
- いずれかの Hook がエラーを返すと操作を中止

### After フック

- **追加の逆順**に実行
- 各 Hook が必ず実行される（前にあるものがエラーを返しても）

```go
// 追加順: A, B, C
p.AddHook(hookA)
p.AddHook(hookB)
p.AddHook(hookC)

// 実行順:
// Before: A.Before → B.Before → C.Before
// After:  C.After → B.After → A.After
```

### 結果の書き換えと例外安全性

- `Get` の `After` は任意の型の新しい結果を返せます。`Set`/`Delete` の結果は JSON **文字列**で、`After` が非文字列値を返した場合は未変更とみなされ（元の文字列が保持）、エラーは通常どおり伝播します。
- フックの **panic は操作を壊しません**：`Before` 段階の panic は `hook panicked: ...` エラーに変換されてこの操作を中止し、`After` 段階の panic は構造化ログ（slog）に記録された後スキップされ、操作結果には影響しません。
- フック未登録の Processor はロック不要のファストパスを通り、フック機構は余分なオーバーヘッドを導入しません。

---

## ベストプラクティス

### 1. ログ記録

```go
p.AddHook(json.LoggingHook(slog.Default()))
```

### 2. パフォーマンス監視

```go
type MetricsRecorder struct{}

func (m *MetricsRecorder) Record(op string, duration time.Duration) {
    metrics.Histogram("json_operation_duration", duration, "op", op)
}

p.AddHook(json.TimingHook(&MetricsRecorder{}))
```

### 3. 入力検証

```go
p.AddHook(json.ValidationHook(func(jsonStr, path string) error {
    if len(jsonStr) > 10*1024*1024 { // 10MB
        return errors.New("JSON payload too large")
    }
    return nil
}))
```

### 4. エラートラッキング

```go
p.AddHook(json.ErrorHook(func(ctx json.HookContext, err error) error {
    if err != nil {
        sentry.WithTags(map[string]string{
            "operation": ctx.Operation,
            "path":      ctx.Path,
        }).CaptureException(err)
    }
    return err
}))
```

### 5. 監査ログ（完全な実践）

書き込み操作（`set`/`delete`）の操作型、パス、結果だけを記録し、`JSONStr` の内容自体は記録しません：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

// AuditHook は書き込み操作の監査エントリを記録（デモ用のメモリスライス。本番では slog/データベースに置き換え）
type AuditHook struct {
	entries []string
}

func (h *AuditHook) Before(ctx json.HookContext) error {
	return nil // 監査は観察のみで、インターセプトしない
}

func (h *AuditHook) After(ctx json.HookContext, result any, err error) (any, error) {
	switch ctx.Operation {
	case "set", "delete":
		h.entries = append(h.entries,
			fmt.Sprintf("op=%s path=%s ok=%v", ctx.Operation, ctx.Path, err == nil))
	}
	return result, err
}

func main() {
	audit := &AuditHook{}

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()
	p.AddHook(audit)

	data := `{"env": "prod", "password": "hunter2", "token": "t-1"}`

	data, err = p.Set(data, "password", nil)
	if err != nil {
		panic(err)
	}
	data, err = p.Delete(data, "token")
	if err != nil {
		panic(err)
	}

	for _, e := range audit.entries {
		fmt.Println(e)
	}
	// 出力:
	// op=set path=password ok=true
	// op=delete path=token ok=true
}
```

本番適用の推奨：`entries` を `*slog.Logger`（`slog.Info("data modification", "op", ..., "path", ..., "success", ...)`）または監査ストアへの非同期書き込みに置き換えてください。所要時間情報が必要な場合は [`TimingHook`](#timinghook) を重ねます。

---

## 関連

- [インターフェース定義](../api-reference/interfaces) - 拡張インターフェース
- [Schema 検証](../api-reference/schema) - Schema 検証
- [Config](../api-reference/config) - 設定オプション
