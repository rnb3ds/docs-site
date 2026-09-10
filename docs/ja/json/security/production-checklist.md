---
sidebar_label: "本番チェックリスト"
title: "本番チェックリスト - CyberGo JSON | 安全なデプロイ"
description: "CyberGo JSON 本番デプロイのセキュリティチェックリスト：SecurityConfig 設定、MaxNestingDepthSecurity/MaxJSONSize リソース制限、入力バリデーション、エラー処理、監視アラートと性能・セキュリティのバランス、デフォルト値と推奨値の対照表で信頼性を確保。"
sidebar_position: 3
---

# プロダクションチェックリスト

プロダクション環境にデプロイする前に、以下のセキュリティ項目を確認してください。

## 設定の確認

### リソース制限

- [ ] 深いネスト攻撃を防ぐために `MaxNestingDepthSecurity` を設定
- [ ] 単一値のサイズを制限するために `MaxJSONSize` を設定
- [ ] 総メモリ使用量を制限するために `MaxMemory` を設定

```go
cfg := json.DefaultConfig()
cfg.MaxNestingDepthSecurity = 50
cfg.MaxJSONSize = 10 * 1024 * 1024
cfg.MaxMemory = 100 * 1024 * 1024
```

デフォルト値と推奨本番値の対照（デフォルト値はライブラリ内定数なので、直接参照してマジックナンバーを避けられます）:

| 制限項目 | Config フィールド | ライブラリ内定数 | デフォルト値 | 推奨本番値（`SecurityConfig()` プリセット） |
|--------|-------------|----------|--------|----------------------------------------|
| JSON サイズ上限 | `MaxJSONSize` | `DefaultMaxJSONSize` | 100MB | 10MB |
| ネスト深度上限 | `MaxNestingDepthSecurity` | `DefaultMaxNestingDepth` | 200 | 30 |
| パス深度上限 | `MaxPathDepth` | `DefaultMaxPathDepth` | 50 | 30 |
| オブジェクトキー数上限 | `MaxObjectKeys` | `DefaultMaxObjectKeys` | 100000 | 5000 |
| 配列要素数上限 | `MaxArrayElements` | `DefaultMaxArrayElements` | 100000 | 5000 |
| セキュリティ検証閾値 | `MaxSecurityValidationSize` | `DefaultMaxSecuritySize` | 10MB | 10MB |
| 同時実行上限 | `MaxConcurrency` | `DefaultMaxConcurrency` | 50 | 50 |

```go
// ハードコードではなく定数を参照
cfg := json.DefaultConfig()
cfg.MaxJSONSize = int64(json.DefaultMaxJSONSize) / 10 // デフォルト 100MB を基準に引き締め
```

`json.SecurityConfig()` は上表の「推奨本番値」ですべてのフィールドをプリセットし、さらに `FullSecurityScan` と `StrictMode` を有効化します——信頼できない入力に面する場合は、これを起点に微調整するのがおすすめです。

## 入力バリデーション

### 必須フィールド

- [ ] すべての必須フィールドが存在することを確認
- [ ] フィールドの型が正しいことを確認

```go
// カスタムバリデーターの例
type RequiredFieldValidator struct{}

func (v *RequiredFieldValidator) Validate(jsonStr string) error {
    // 必須フィールドの存在確認
    return nil
}

cfg := json.DefaultConfig()
cfg.CustomValidators = []json.Validator{&RequiredFieldValidator{}}
```

### フォーマットバリデーション

- [ ] メールアドレスの形式を確認
- [ ] URL の形式を確認
- [ ] カスタム形式を確認

```go
// カスタム形式バリデーター
type EmailValidator struct{}

func (v *EmailValidator) Validate(jsonStr string) error {
    var data map[string]any
    if err := json.Unmarshal([]byte(jsonStr), &data); err != nil {
        return nil
    }
    email, _ := data["email"].(string)
    matched, _ := regexp.MatchString(`^\w+@\w+\.\w+$`, email)
    if !matched {
        return errors.New("invalid email format")
    }
    return nil
}

cfg := json.DefaultConfig()
cfg.CustomValidators = append(cfg.CustomValidators, &EmailValidator{})
```

### 範囲バリデーション

- [ ] 数値の範囲を確認
- [ ] 文字列の長さを確認
- [ ] 配列の長さを確認

```go
// スキーマを使用した範囲バリデーション
schema := &json.Schema{
    Type: "object",
    Properties: map[string]*json.Schema{
        "age":  {Type: "number", Minimum: 0, Maximum: 100},
        "name": {Type: "string", MinLength: 1, MaxLength: 255},
    },
}
```

## 機密データの処理

### 機密フィールドのフィルタリング

- [ ] パスワードフィールドをフィルタリング
- [ ] トークンフィールドをフィルタリング
- [ ] その他の機密データをフィルタリング

```go
// フックを使用して機密フィールドをフィルタリング
type SensitiveFilterHook struct {
    fields map[string]bool
}

func (h *SensitiveFilterHook) Before(ctx json.HookContext) error {
    return nil
}

func (h *SensitiveFilterHook) After(ctx json.HookContext, result any, err error) (any, error) {
    if m, ok := result.(map[string]any); ok {
        for field := range h.fields {
            delete(m, field)
        }
    }
    return result, err
}

cfg := json.DefaultConfig()
cfg.AddHook(&SensitiveFilterHook{fields: map[string]bool{
    "password": true,
    "token":    true,
    "api_key":  true,
    "secret":   true,
}})
```

完全な実装コード（`Get` が呼び出し元に返す前に機密フィールドを自動削除）:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

// SensitiveFilterHook は get の結果が呼び出し元に返る前に機密フィールドを削除します。
type SensitiveFilterHook struct {
	fields map[string]bool
}

func (h *SensitiveFilterHook) Before(ctx json.HookContext) error {
	return nil
}

func (h *SensitiveFilterHook) After(ctx json.HookContext, result any, err error) (any, error) {
	if err != nil {
		return result, err
	}
	if obj, ok := result.(map[string]any); ok {
		for field := range h.fields {
			delete(obj, field)
		}
	}
	return result, err
}

func main() {
	cfg := json.DefaultConfig()
	cfg.AddHook(&SensitiveFilterHook{fields: map[string]bool{
		"password": true,
		"token":    true,
		"api_key":  true,
		"secret":   true,
	}})

	p, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer p.Close()

	user, err := p.Get(`{"name": "Alice", "role": "admin", "password": "hunter2", "token": "t-123"}`, ".")
	if err != nil {
		panic(err)
	}

	out, err := p.Marshal(user)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(out))
	// 出力: {"name":"Alice","role":"admin"}
}
```

### ログのマスキング

- [ ] ログに機密データを記録しない
- [ ] エラーメッセージに機密情報を含めない

## エラー処理

### セキュアなエラーレスポンス

- [ ] 内部エラーの詳細を露出しない
- [ ] 汎用的なエラーメッセージを使用
- [ ] 詳細なエラーはログに記録

```go
if err != nil {
    slog.Error("詳細エラー", "error", err) // 詳細な原因はログのみに記録
    return errors.New("操作に失敗しました。後でもう一度お試しください") // 外部には汎用メッセージのみ返す
}
```

## 監視と監査

### パフォーマンス監視

- [ ] パース時間の監視
- [ ] メモリ使用量の監視
- [ ] アラート閾値の設定

```go
// フックを使用してパフォーマンスを監視
type MetricsHook struct{}

func (h *MetricsHook) Before(ctx json.HookContext) error {
    return nil
}

func (h *MetricsHook) After(ctx json.HookContext, result any, err error) (any, error) {
    slog.Info("operation", "op", ctx.Operation, "duration", time.Since(ctx.StartTime))
    return result, err
}

cfg := json.DefaultConfig()
cfg.AddHook(&MetricsHook{})
```

計測シナリオではファクトリフックの方が簡単です: `cfg.AddHook(json.TimingHook(myRecorder))`（`myRecorder` は `Record(op string, duration time.Duration)` を実装）。

### 監査ログ

- [ ] 重要な操作の記録
- [ ] 異常な入力の記録
- [ ] 定期的なログレビュー

完全な実装コード（書き込み操作の監査 + 操作計測、すべてファクトリフックと `HookFunc` を使用し、生の `JSONStr` は一切記録しない）:

```go
package main

import (
	"fmt"
	"sync"
	"time"

	"github.com/cybergodev/json"
)

// opMetrics は TimingHook が要求する Record インターフェースを実装
type opMetrics struct {
	mu    sync.Mutex
	count map[string]int
}

func (m *opMetrics) Record(op string, duration time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.count[op]++
}

func main() {
	metrics := &opMetrics{count: make(map[string]int)}
	var auditLog []string

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// 監査: 書き込み操作の操作種別/パス/結果のみ記録し、JSONStr の内容は記録しない
	p.AddHook(&json.HookFunc{
		AfterFn: func(ctx json.HookContext, result any, err error) (any, error) {
			if ctx.Operation == "set" || ctx.Operation == "delete" {
				auditLog = append(auditLog,
					fmt.Sprintf("op=%s path=%s ok=%v", ctx.Operation, ctx.Path, err == nil))
			}
			return result, err
		},
	})
	// パフォーマンス: 操作種別ごとにカウント（本番ではヒストグラム/時系列ライブラリに置き換え）
	p.AddHook(json.TimingHook(metrics))

	data := `{"env": "prod", "password": "hunter2"}`

	if data, err = p.Set(data, "password", nil); err != nil {
		panic(err)
	}
	if data, err = p.Delete(data, "password"); err != nil {
		panic(err)
	}
	if _, err = p.Get(data, "env"); err != nil {
		panic(err)
	}

	for _, e := range auditLog {
		fmt.Println(e)
	}
	fmt.Println("get の計測記録:", metrics.count["get"])
	// 出力:
	// op=set path=password ok=true
	// op=delete path=password ok=true
	// get の計測記録: 1
}
```

## テストカバレッジ

### セキュリティテスト

- [ ] 深いネストのテスト
- [ ] 大容量ファイル処理のテスト
- [ ] 無効な入力のテスト
- [ ] 境界条件のテスト

### パフォーマンステスト

- [ ] 並行処理のテスト
- [ ] 大量データのテスト
- [ ] メモリリークのテスト

## クイックチェックコマンド

```bash
# 機密フィールドの確認
grep -r "password\|token\|secret" --include="*.go"

# ハードコードされた設定の確認
grep -r "MaxNestingDepthSecurity\|MaxMemory" --include="*.go"

# セキュリティテストの実行
go test -run Security ./...
```

## チェックリストテンプレート

```go
// プロダクション設定テンプレート
func ProductionConfig() json.Config {
    cfg := json.SecurityConfig()

    // リソース制限（SecurityConfig は安全なデフォルト値をプリセット済み）
    cfg.MaxMemory = 100 * 1024 * 1024

    // カスタムバリデーター
    cfg.CustomValidators = []json.Validator{&RequiredFieldValidator{}}

    // 監査フック
    cfg.Hooks = []json.Hook{&AuditHook{logger: prodLogger}}

    return cfg
}
```

## 関連

- [セキュリティ概要](./)
- [Config 設定](../api-reference/config)
