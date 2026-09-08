---
sidebar_label: "チートシート"
title: "チートシート - CyberGo JSON | API クイックリファレンス"
description: "CyberGo JSON API チートシート：47 個のパッケージレベル関数を完全網羅——パスクエリ、Set/Delete 変更、バッチ操作、シリアライズ、ファイル読み書き、検証、反復・ストリーミング JSONL、キャッシュ・セキュリティと Processor の高頻度組み合わせパターンの 1 ページ早見表。"
sidebar_position: 4
---

# チートシート

よく使う API とコードスニペットをすばやく検索できます。

## パスクエリ

| 操作 | 関数 | 例 |
|------|------|------|
| 文字列の取得 | `GetString` | `json.GetString(data, "user.name")` |
| 整数の取得 | `GetInt` | `json.GetInt(data, "count")` |
| 浮動小数点数の取得 | `GetFloat` | `json.GetFloat(data, "price")` |
| ブール値の取得 | `GetBool` | `json.GetBool(data, "enabled")` |
| 配列の取得 | `GetArray` | `json.GetArray(data, "items")` |
| オブジェクトの取得 | `GetObject` | `json.GetObject(data, "user")` |
| 任意値の取得 | `Get` | `json.Get(data, "items[0].id")` |
| ジェネリクス取得 | `GetTyped[T]` | `json.GetTyped[User](data, "user")` |
| 安全な取得（panic なし） | `SafeGet` | `json.SafeGet(data, "user.age")` |
| 一括取得 | `GetMultiple` | `json.GetMultiple(data, []string{"a", "b"})` |
| キャンセル対応の取得 | `GetWithContext` | `json.GetWithContext(ctx, data, "user.name")` |

### デフォルト値付き

`GetString`、`GetInt`、`GetFloat`、`GetBool` などの関数は、オプションのデフォルト値引数をサポートします：

| 操作 | 関数 | 例 |
|------|------|------|
| 文字列 | `GetString` | `json.GetString(data, "name", "unknown")` |
| 整数 | `GetInt` | `json.GetInt(data, "count", 0)` |
| 浮動小数点数 | `GetFloat` | `json.GetFloat(data, "rate", 0.5)` |
| ブール値 | `GetBool` | `json.GetBool(data, "debug", false)` |

## 変更操作

| 操作 | 関数 | 例 |
|------|------|------|
| 値の設定 | `Set` | `json.Set(data, "user.name", "Alice")` |
| 一括設定 | `SetMultiple` | `json.SetMultiple(data, map[string]any{"a": 1, "b": 2})` |
| パス作成付き設定 | `SetCreate` | `json.SetCreate(data, "a.b.c", 1)` |
| 一括パス作成付き設定 | `SetMultipleCreate` | `json.SetMultipleCreate(data, updates)` |
| 値の削除 | `Delete` | `json.Delete(data, "user.temporary")` |
| 削除してクリーンアップ | `DeleteClean` | `json.DeleteClean(data, "user.temporary")` |

```go
// 値の設定
result, err := json.Set(`{"user":{}}`, "user.name", "Alice")
// {"user":{"name":"Alice"}}

// 複数フィールドを 1 つずつ設定
result, err = json.Set(data, "user.name", "Bob")
result, err = json.Set(result, "user.age", 25)

// 削除
result, err = json.Delete(data, "user.temporary")
```

### バッチ操作（1 回の呼び出しで複数種類の操作）

```go
data := `{"user":{"name":"Alice","temp":true}}`

results, err := json.ProcessBatch([]json.BatchOperation{
    {ID: "n", Type: "get", JSONStr: data, Path: "user.name"},
    {ID: "a", Type: "set", JSONStr: data, Path: "user.age", Value: 30},
    {ID: "d", Type: "delete", JSONStr: data, Path: "user.temp"},
    {ID: "v", Type: "validate", JSONStr: data},
})
if err != nil {
    panic(err)
}
for _, r := range results {
    fmt.Println(r.ID, r.Result, r.Error)
}
```

::: tip
`BatchOperation.Type` は `get` / `set` / `delete` / `validate` の 4 種類をサポートし、各操作は `JSONStr` でデータを運びます。`BatchResult` は `ID` に対応して `Result` と `Error` を返します。詳しくは[バッチ操作](../api-reference/functions/batch)を参照してください。
:::

## シリアライズとエンコード

| 操作 | 関数 | 例 |
|------|------|------|
| エンコード（`[]byte` 出力） | `Marshal` | `json.Marshal(data)` |
| エンコード（`string` 出力） | `EncodeWithConfig` | `json.EncodeWithConfig(data)` |
| 整形エンコード（`[]byte`） | `MarshalIndent` | `json.MarshalIndent(data, "", "  ")` |
| 整形エンコード（`string`） | `EncodePretty` | `json.EncodePretty(data)` |
| デコード | `Unmarshal` | `json.Unmarshal(bytes, &v)` |
| 解析 | `Parse` | `var v T; json.Parse(jsonStr, &v)` |
| any への解析 | `ParseAny` | `json.ParseAny(jsonStr)` |
| JSON テキストの整形 | `Prettify` | `json.Prettify(jsonStr)` |
| JSON テキストの圧縮（buffer） | `Compact` | `json.Compact(&buf, []byte(data))` |
| JSON テキストの圧縮（string） | `CompactString` | `json.CompactString(jsonStr)` |
| インデント再構成 | `Indent` | `json.Indent(&buf, src, "", "  ")` |
| HTML エスケープ | `HTMLEscape` | `json.HTMLEscape(&buf, src)` |
| キー・バリューのオブジェクト化 | `EncodeBatch` | `json.EncodeBatch(map[string]any{"a": 1})` |
| フィールド抽出エンコード | `EncodeFields` | `json.EncodeFields(user, []string{"name"})` |
| 値リストの配列化 | `EncodeStream` | `json.EncodeStream([]any{1, 2})` |

`json.Encode` は非推奨です（`EncodeWithConfig` と等価で、将来のメジャーバージョンで削除予定）。新規コードでは `Marshal` または `EncodeWithConfig` を使用してください。フォーマット関数の詳細な選定は[フォーマット出力](./print)を参照してください。

```go
// エンコード
b, err := json.Marshal(map[string]any{"name": "test"})

// 整形出力
pretty, err := json.MarshalIndent(data, "", "  ")

// 構造体に解析
var result map[string]any
err = json.Parse(`{"name": "test"}`, &result)

// any に解析
parsed, err := json.ParseAny(`{"name": "test"}`)

// JSON 文字列の整形
pretty, err = json.Prettify(`{"name":"Alice","age":30}`)
```

## ファイル読み書き

| 操作 | 関数 | 例 |
|------|------|------|
| JSON ファイルをテキストとして読む | `LoadFromFile` | `json.LoadFromFile("config.json")` |
| 任意の Reader から読む | `LoadFromReader` | `json.LoadFromReader(resp.Body)` |
| 値をファイルに書く | `SaveToFile` | `json.SaveToFile("out.json", data)` |
| エンコードしてファイルに書く | `MarshalToFile` | `json.MarshalToFile("out.json", v)` |
| ファイルを読んでデコード | `UnmarshalFromFile` | `json.UnmarshalFromFile("in.json", &v)` |
| 値を Writer に書く | `SaveToWriter` | `json.SaveToWriter(w, data)` |

```go
// 読み込んでクエリ
data, err := json.LoadFromFile("config.json")
if err != nil {
    panic(err)
}
env := json.GetString(data, "env", "dev")

// 構造体へ一発で
var cfg Config
if err := json.UnmarshalFromFile("config.json", &cfg); err != nil {
    panic(err)
}
```

::: tip
ファイルパスはセキュリティ検証を経ます（ディレクトリトラバーサルやシンボリックリンク攻撃を拒否）。信頼できないパスもブロックされます。詳しくは[ファイル操作](../api-reference/functions/file-io)を参照してください。
:::

## 検証

| 操作 | 関数 | 例 |
|------|------|------|
| 高速検証 | `Valid` | `json.Valid([]byte(data))` |
| 検証して理由を取得 | `ValidWithConfig` | `json.ValidWithConfig(data)` |
| Schema 検証 | `ValidateSchema` | `json.ValidateSchema(data, schema)` |

```go
// 高速検証
if json.Valid([]byte(data)) {
    // 有効な JSON
}

// 失敗理由が必要な場合
ok, err := json.ValidWithConfig(data)
if !ok {
    fmt.Println("無効な JSON:", err)
}

// Schema 検証
schema := &json.Schema{
    Type:     "object",
    Required: []string{"name"},
    Properties: map[string]*json.Schema{
        "name": {Type: "string"},
        "age":  {Type: "number"},
    },
}
p, err := json.New()
if err != nil {
    panic(err)
}
errors, _ := p.ValidateSchema(data, schema)
```

## ユーティリティ関数

| 操作 | 関数 | 例 |
|------|------|------|
| 比較 | `CompareJSON` | `json.CompareJSON(a, b)` |
| マージ | `MergeJSON` | `json.MergeJSON(a, b)` |
| 複数のマージ | `MergeMany` | `json.MergeMany([]string{s1, s2, s3})` |

```go
// 比較（キー順序と数値精度を無視）
equal, _ := json.CompareJSON(`{"a":1.0,"b":2}`, `{"b":2,"a":1}`)
fmt.Println("Equal:", equal) // true（順序と精度を無視）

// JSON のマージ
base := `{"database":{"host":"localhost","port":5432},"debug":false}`
override := `{"database":{"host":"prod-server","ssl":true},"monitoring":true}`

// マージ
merged, _ := json.MergeJSON(base, override)
// 結果: {"database":{"host":"prod-server","port":5432,"ssl":true},"debug":false,"monitoring":true}

// 複数のマージ
result, _ := json.MergeMany([]string{
    `{"a":1}`,
    `{"b":2}`,
    `{"c":3}`,
})
```

## Processor メソッド

```go
// プロセッサを作成
processor, err := json.New()
if err != nil {
    panic(err)
}
defer processor.Close()

// 値の取得
result := processor.GetString(data, "user.profile.name")

// 安全な取得（AccessResult を返す）
accessResult := processor.SafeGet(data, "user.age")
age, err := accessResult.AsInt()
```

### 設定付きで作成

```go
// デフォルト設定
processor, err := json.New(json.DefaultConfig())

// セキュリティ設定（信頼できない入力を扱う）
processor, err = json.New(json.SecurityConfig())

// カスタム設定
cfg := json.DefaultConfig()
cfg.CreatePaths = true
processor, err = json.New(cfg)
```

## ストリーミング処理

### イテレーション関数ファミリー

| 操作 | 関数 | 特徴 |
|------|------|------|
| 配列/オブジェクトの走査 | `Foreach` | 最もシンプル。エラーを返さない |
| 走査して中断可能 | `ForeachWithError` | コールバックが `error` / `item.Break()` を返す |
| 指定パスの走査 | `ForeachWithPath` | `Foreach(data, path, ...)` の明示パス版と等価 |
| ネストの深さ優先走査 | `ForeachNested` | すべての階層を再帰 |
| 走査して書き換え | `ForeachReturn` | 変更後の新しい JSON を返す |
| 現在パスの保持 | `ForeachWithPathAndIterator` | コールバックに `currentPath` があり、中断制御可能 |
| 大規模ファイルの走査 | `ForeachFile` | ストリーミング読み取り、メモリに全読みしない |
| ファイルのチャンク走査 | `ForeachFileChunked` | `chunkSize` ごとにバッチコールバック |

```go
data := `{"users":[{"name":"Alice"},{"name":"Bob"}]}`

// シンプルな走査
err := json.ForeachWithPath(data, "users", func(key any, item *json.IterableValue) {
    fmt.Println(key, item.GetString("name"))
})

// 早期終了が必要な場合は WithError バリアント（item.Break() を返すと中断）
err = json.ForeachWithError(data, "users", func(key any, item *json.IterableValue) error {
    if item.GetString("name") == "Bob" {
        return item.Break() // 反復を停止
    }
    return nil
})
```

### 並行処理（ParallelIterator）

```go
items, _ := json.GetArray(`[1,2,3,4,5,6]`, ".")
it := json.NewParallelIterator(items)

// 並列マップ
doubled, err := it.Map(func(i int, v any) (any, error) {
    return v.(float64) * 2, nil
})

// 並列フィルタ / 走査（自動バッチ分割）
_ = it.Filter(func(i int, v any) bool { return v.(float64) > 2 })
_ = it.ForEach(func(i int, v any) error { return nil })
```

### ストリーミングイテレータ（StreamIterator / StreamObjectIterator）

```go
f, _ := os.Open("huge.json")
defer f.Close()

// 大型配列のストリーミング要素単位処理
it, err := json.NewStreamIterator(f)
if err != nil {
    panic(err)
}
for it.Next() {
    val := it.Value() // 要素単位処理、メモリ使用量は一定
    _ = val
    _ = it.Index()
}
if err := it.Err(); err != nil {
    panic(err) // ストリーム内で発生した解析エラー
}

// 大型オブジェクトのストリーミングキー単位処理
oit, err := json.NewStreamObjectIterator(f)
for oit.Next() {
    fmt.Println(oit.Key(), oit.Value())
}
```

### Processor.ForeachFile（大規模ファイル）

```go
// 大規模ファイルの処理
processor, err := json.New()
if err != nil {
    panic(err)
}
defer processor.Close()

err = processor.ForeachFile("large-data.json", func(key any, item *json.IterableValue) error {
    // データ項目を処理
    id := item.GetInt("id")
    name := item.GetString("name")
    return nil // item.Break() を返すと中断可能
})
```

### NDJSON/JSONL

```go
// JSONL の解析
results, err := json.ParseJSONL(jsonlBytes)

// ジェネリクス解析（StreamLinesInto を使用）
file, _ := os.Open("data.jsonl")
defer file.Close()
users, err := json.StreamLinesInto[User](file, func(lineNum int, user User) error {
    return nil
})

// ストリーミング書き込み
outputFile, _ := os.Create("output.jsonl")
defer outputFile.Close()
writer := json.NewJSONLWriter(outputFile)
_ = writer.Write(map[string]any{"name": "Alice"})
_ = writer.Write(map[string]any{"name": "Bob"})

// マルチワーカー並列の行単位処理
err = json.StreamJSONLParallel(file, 4, func(lineNum int, item *json.IterableValue) error {
    return nil
})

// NDJSONProcessor：行番号付き、オブジェクト単位のコールバック
np := json.NewNDJSONProcessor()
err = np.ProcessFile("events.ndjson", func(lineNum int, obj map[string]any) error {
    fmt.Println(lineNum, obj)
    return nil
})
```

## 設定オプション

```go
// 推奨方法：デフォルト設定をベースに変更
cfg := json.DefaultConfig()
cfg.MaxJSONSize = 200 * 1024 * 1024 // カスタムサイズ制限
cfg.FullSecurityScan = true          // 完全セキュリティスキャンを有効化
```

### 設定プリセット

```go
// デフォルト設定
cfg := json.DefaultConfig()

// セキュリティ設定（信頼できない入力を扱う）
// cfg = json.SecurityConfig()

// 整形設定
// cfg = json.PrettyConfig()
```

## パス構文

| 構文 | 説明 | 例 |
|------|------|------|
| `.property` | プロパティアクセス | `user.name` |
| `[n]` | 配列インデックス | `items[0]` |
| `[*]` | ワイルドカード | `items[*].id` |
| `[start:end]` | スライス | `items[0:5]` |
| `[start:end:step]` | ステップ付きスライス | `items[0:10:2]` |
| `{field1,field2}` | フィールド抽出 | `user{name,email}` |
| `{flat:field}` | フラット化抽出 | `groups{flat:tags}` |
| `[+]` | 追加 | `items[+]` |
| `[-1]` | 負インデックス（末尾） | `items[-1]` |
| `/key/key` | JSON Pointer（RFC 6901） | `/user/name` |

## よくあるパターン

### ネストされた値の安全な取得

```go
// デフォルト値付き取得関数を使用
name := json.GetString(data, "user.profile.name", "unknown")

// エラー型を区別する必要がある場合は Get を使用
val, err := json.Get(data, "user.profile.name")
if err != nil {
    if errors.Is(err, json.ErrPathNotFound) {
        // キーが存在しない
    } else if errors.Is(err, json.ErrInvalidJSON) {
        // JSON フォーマットエラー
    }
    // その他のエラー（型競合、制限超過）はコンテキスト付き JsonsError。そのまま記録すればよい
}
```

### デフォルト値付き取得

```go
// GetString/GetInt などの関数はオプションのデフォルト値引数をサポート
timeout := json.GetInt(data, "timeout", 30)
debug := json.GetBool(data, "debug", false)
name := json.GetString(data, "user.nickname", "unknown")
```

### 型アサーション

```go
val, _ := json.Get(data, "value")
switch v := val.(type) {
case string:
    fmt.Println("文字列：", v)
case float64:
    fmt.Println("数値：", v)
case bool:
    fmt.Println("ブール：", v)
case []any:
    fmt.Println("配列：", len(v), "個の要素")
case map[string]any:
    fmt.Println("オブジェクト：", len(v), "個のキー")
}
```

### ファイル読み込み → フィールド変更 → 書き戻し

`Set` は新しい文字列を返し、`SaveToFile` は JSON 文字列を受け取ると先に解析してからエンコードします（二重に引用符で囲まれない）。`PrettyConfig` と組み合わせればファイルの可読性を保てます：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data, err := json.LoadFromFile("config.json")
	if err != nil {
		panic(err)
	}

	updated, err := json.Set(data, "server.port", 8080)
	if err != nil {
		panic(err)
	}

	if err := json.SaveToFile("config.json", updated, json.PrettyConfig()); err != nil {
		panic(err)
	}
	fmt.Println("更新しました")
}
```

### API レスポンスからフィールドを一括取得

1 つのフィールドだけならワイルドカード収集、複数の異なるパスなら `GetMultiple`（解析は 1 回だけ）：

```go
resp := `{"code":0,"data":{"users":[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}]}}`

// 1 つのフィールドだけ：ワイルドカード収集
names, _ := json.GetArray(resp, "data.users[*].name") // ["Alice", "Bob"]

// 複数の異なるパス：1 回の解析で一括取得
vals, err := json.GetMultiple(resp, []string{"code", "data.users[0].id"})
if err != nil {
    panic(err)
}
fmt.Println(names, vals["data.users[0].id"]) // [Alice Bob] 1
```

### 要素単位の書き換え（ForeachReturn）

コールバック内で `item.GetData()` により作業コピーの参照を取得でき、map/slice の内容変更は返される新しい JSON に反映されます（`ForeachReturn` が反復するのはルートコンテナです）：

```go
data := `[{"name":"Alice","active":false},{"name":"Bob","active":false}]`

updated, err := json.ForeachReturn(data, func(key any, item *json.IterableValue) {
	m, ok := item.GetData().(map[string]any)
	if !ok {
		return
	}
	m["active"] = true
})
if err != nil {
	panic(err)
}
// 両要素の active が true になる（出力フィールド順序は元のテキストと異なる場合あり）
```

::: tip スカラーはインプレース置換できない
`GetData()` の参照を使った置換は map フィールドや配列要素の変更に適します。要素全体がスカラーの場合、IterableValue 経由でインプレース置換はできません。`Set(data, "items[*]", v)` か個別の `Set` を使ってください。
:::

### 設定のマージ

```go
// デフォルト設定 + ユーザー設定
defaults := `{"timeout": 30, "retries": 3}`
userConfig := `{"timeout": 60, "debug": true}`

merged, _ := json.MergeJSON(defaults, userConfig)
// {"timeout": 60, "retries": 3, "debug": true}
```

### エラー処理

```go
val, err := json.Get(data, path)
if err != nil {
    // よくあるセンチネル：キー不在 / JSON フォーマットエラー / サイズ制限超過 / ネスト深度超過
    //（型競合は説明的な JsonsError を返し、ErrTypeMismatch センチネルには一致しない）
    switch {
    case errors.Is(err, json.ErrPathNotFound):
    case errors.Is(err, json.ErrInvalidJSON):
    case errors.Is(err, json.ErrSizeLimit):
    case errors.Is(err, json.ErrDepthLimit):
    default:
        // 完全なエラーを記録（操作名とパスを含む）
        fmt.Println(err)
    }

    // クライアント向けには SafeError でマスクし、パスと内部詳細の漏洩を避ける
    _ = json.SafeError(err)
}
```

## キャッシュ管理

```go
// キャッシュのウォームアップ
paths := []string{"user.name", "user.email", "items[*].id"}
result, _ := json.WarmupCache(data, paths)
fmt.Printf("ウォームアップ成功：%d/%d\n", result.Successful, result.TotalPaths)

// キャッシュのクリア
json.ClearCache()

// 統計の取得
stats := json.GetStats()
fmt.Printf("キャッシュヒット率：%.2f%%\n", stats.HitRatio * 100)

// ヘルスチェック（キャッシュ、メモリなどを項目別にチェック）
health := json.GetHealthStatus()
fmt.Println("ヘルス:", health.Healthy)
```

## グローバルプロセッサ

```go
// カスタムグローバルプロセッサを設定
cfg := json.SecurityConfig()
p, err := json.New(cfg)
if err != nil {
    panic(err)
}
json.SetGlobalProcessor(p)

// 以降、すべてのパッケージレベル関数がこのプロセッサを使用
name := json.GetString(data, "user.name")

// アプリケーション終了時にクリーンアップ
defer json.ShutdownGlobalProcessor()
```

## セキュリティと拡張

```go
// 危険パターン管理（デフォルトで <script>、javascript: などをブロック）
for _, p := range json.ListDangerousPatterns() {
    fmt.Println(p.Pattern, p.Level) // Pattern は部分文字列マッチ、Level はレベル
}

// カスタムパターンの登録（部分文字列マッチ、3 段階の処理戦略）：
//   PatternLevelCritical は常にブロック / Warning は厳格モードでブロック / Info は記録のみ
json.RegisterDangerousPattern(json.DangerousPattern{
    Pattern: "eval(",
    Name:    "eval 呼び出しを無効化",
    Level:   json.PatternLevelCritical,
})

// Pattern 文字列で登録解除
json.UnregisterDangerousPattern("eval(")

// フックファクトリー：ログ / 計時 / エラー変換 / 入力検証
p, _ := json.New()
p.AddHook(json.LoggingHook(slog.Default()))
p.AddHook(json.ErrorHook(func(ctx json.HookContext, err error) error {
    return fmt.Errorf("op %s: %w", ctx.Operation, err)
}))
p.AddHook(json.ValidationHook(func(jsonStr, path string) error {
    return nil // 非 nil を返すとこの入力を拒否
}))

// Config のチェーンメソッド
cfg := json.SecurityConfig()
cfg.AddHook(json.LoggingHook(slog.Default()))
cfg.AddDangerousPattern(json.DangerousPattern{Pattern: "exec("})
if err := cfg.Validate(); err != nil {
    panic(err) // 設定自己検査。範囲外の値を早期に発見
}
clone := cfg.Clone() // ディープコピー、安全に共有
```

## 関連

- [パッケージ関数](../api-reference/functions/) - 完全な API リファレンス
- [補助関数](../api-reference/helpers) - 型変換ユーティリティ
- [Processor](../api-reference/processor/) - プロセッサメソッド
- [設定](../api-reference/config) - 設定オプション
- [型定義](../api-reference/types) - AccessResult、Schema など
