---
sidebar_label: "JSONL プロセッサ"
title: "JSONL プロセッサ - CyberGo JSON | API リファレンス"
description: "CyberGo JSON JSONL プロセッサ：StreamJSONL ストリーミング処理、JSONLWriter 書き込み、StreamLinesInto[T] ジェネリクスストリーム、ParseJSONL 解析、ToJSONL 変換で JSON Lines の読み書きをサポートします。"
sidebar_position: 3
---

# JSONL プロセッサ

JSONL（JSON Lines）または NDJSON（Newline Delimited JSON）は、1 行に 1 つの JSON オブジェクトが入るフォーマットです。本ライブラリは `Processor` メソッドとパッケージレベル関数で完全な JSONL 処理能力を提供します。

## フォーマット仕様

```json
{"id":1,"name":"Alice"}
{"id":2,"name":"Bob"}
{"id":3,"name":"Charlie"}
```

- 各行は有効な JSON 値
- 行は `\n` で区切られる
- 最終行の改行はあってもなくてもよい

---

## Processor JSONL メソッド

JSONL 処理機能は `Processor` のメソッドとして提供されます。ストリーミング/関数型メソッドは全 11 個で、選定は以下のとおりです：

| メソッド | 形態 | 適したシナリオ |
|------|------|----------|
| `StreamJSONL` | 行単位コールバック | 基本的なストリーミング処理。`IterableValue` を行単位で消費 |
| `StreamJSONLParallel` | 並列コールバック | CPU 集約的な変換。マルチワーカー並列 |
| `StreamJSONLParallelWithContext` | 並列コールバック + ctx | タイムアウト/キャンセルが必要な並列処理 |
| `StreamJSONLChunked` | バッチコールバック | バッチ書き出しなどチャンク消費シナリオ |
| `StreamJSONLFile` | 行単位コールバック（ファイル） | `.jsonl` ファイルを直接読む（パスセキュリティ検証を含む） |
| `ForeachJSONL` | 行単位コールバック | `StreamJSONL` のエイリアス |
| `MapJSONL` | 変換収集 | 各行を新しい値にマッピングし、`[]any` を返す |
| `FilterJSONL` | 述語収集 | 条件を満たす行をフィルタリング |
| `ReduceJSONL` | 集約 | 合計や統計などの畳み込み計算 |
| `CollectJSONL` | 全量収集 | すべての行を一度に取り出す |
| `FirstJSONL` | 述語 + ショートサーキット | 最初のマッチを見つけたら停止（内部は `Break` と等価） |

### StreamJSONL

シグネチャ：`func (p *Processor) StreamJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) error) error`

JSONL データをストリーミング処理し、各行ごとに `IterableValue` を返します。

**パラメータ**

| 名前 | 型 | 説明 |
|------|------|------|
| `reader` | `io.Reader` | データソース |
| `fn` | `func(lineNum int, item *IterableValue) error` | 処理コールバック |

**コールバックの戻り値**

| 戻り値 | 説明 |
|--------|------|
| `nil` | 次の行の処理を続行 |
| `item.Break()` | 反復を停止。エラーは返さない |
| その他の `error` | 反復を停止し、エラーを返す |

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

file, _ := os.Open("data.jsonl")
defer file.Close()

err = p.StreamJSONL(file, func(lineNum int, item *json.IterableValue) error {
    name := item.GetString("name")
    age := item.GetInt("age")
    fmt.Printf("%d 行目: name=%s, age=%d\n", lineNum, name, age)
    return nil // 処理を続行
    // return item.Break() // 反復を停止
})
```

### StreamJSONLParallel

シグネチャ：`func (p *Processor) StreamJSONLParallel(reader io.Reader, workers int, fn func(lineNum int, item *IterableValue) error) error`

ワーカープール方式で JSONL データを並列処理します。

**パラメータ**

| 名前 | 型 | 説明 |
|------|------|------|
| `reader` | `io.Reader` | データソース |
| `workers` | `int` | ワーカー goroutine 数（<=0 の場合はデフォルト 4） |
| `fn` | `func(lineNum int, item *IterableValue) error` | 処理コールバック |

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

err = p.StreamJSONLParallel(file, 8, func(lineNum int, item *json.IterableValue) error {
    // CPU 集約的な処理
    return processItem(item)
})
```

::: tip パフォーマンスのヒント
CPU 集約的な操作（データ変換、計算など）には並列処理でパフォーマンスを大幅に向上できます。I/O 集約的な操作にはシングルスレッド処理を推奨します。
:::

コールバックが `item.Break()` を返すとクリーンに停止します：スキャンと各 worker が早期に終了し、メソッドは `nil` を返します。その他のエラーを返すと、メソッドはそのエラーで終了します。コールバックの panic はエラーに回復され、プロセスを壊しません。

### StreamJSONLParallelWithContext

シグネチャ：`func (p *Processor) StreamJSONLParallelWithContext(ctx context.Context, reader io.Reader, workers int, fn func(lineNum int, item *IterableValue) error) error`

コンテキスト付きの JSONL 並列処理です。タイムアウトとキャンセル操作をサポートします。

**パラメータ**

| 名前 | 型 | 説明 |
|------|------|------|
| `ctx` | `context.Context` | コンテキスト。キャンセルとタイムアウトに使用 |
| `reader` | `io.Reader` | データソース |
| `workers` | `int` | ワーカー goroutine 数（<=0 の場合はデフォルト 4） |
| `fn` | `func(lineNum int, item *IterableValue) error` | 処理コールバック |

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()

err = p.StreamJSONLParallelWithContext(ctx, file, 8, func(lineNum int, item *json.IterableValue) error {
    // キャンセル対応の並列処理
    return processItem(item)
})
```

### StreamJSONLChunked

シグネチャ：`func (p *Processor) StreamJSONLChunked(reader io.Reader, chunkSize int, fn func(chunk []*IterableValue) error) error`

JSONL データをバッチ処理し、指定数量の要素を毎回処理します。

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

// 1 バッチ 1000 件
err = p.StreamJSONLChunked(file, 1000, func(chunk []*json.IterableValue) error {
    // データベースへバッチ書き込み
    for _, item := range chunk {
        processItem(item)
    }
    return nil
})
```

::: warning コールバック復帰後にオブジェクトプールへ返却
`StreamJSONLChunked` は**各バッチのコールバック復帰後**、そのバッチの `IterableValue` をオブジェクトプールに返却します（内部データは空になります）。コールバック内で必要なフィールドの抽出や書き込みを完了し、`chunk` 内の要素をコールバックをまたいで保持しないでください。`StreamJSONL`（およびそれを基にした `CollectJSONL`/`FilterJSONL`/`FirstJSONL` などの収集メソッド）は返却せず、返された要素は安全に保持できます。
:::

### StreamJSONLFile

シグネチャ：`func (p *Processor) StreamJSONLFile(filename string, fn func(lineNum int, item *IterableValue) error) error`

JSONL ファイルを直接処理します。

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

err = p.StreamJSONLFile("data.jsonl", func(lineNum int, item *json.IterableValue) error {
    fmt.Printf("%d 行目: %v\n", lineNum, item.GetData())
    return nil
})
```

---

## 高度な JSONL 操作

### MapJSONL

シグネチャ：`func (p *Processor) MapJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) (any, error)) ([]any, error)`

JSONL データを新しい形式にマッピングします。

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

result, err := p.MapJSONL(file, func(lineNum int, item *json.IterableValue) (any, error) {
    return map[string]any{
        "name": item.GetString("name"),
        "age":  item.GetInt("age"),
    }, nil
})
```

### ReduceJSONL

シグネチャ：`func (p *Processor) ReduceJSONL(reader io.Reader, initial any, fn func(acc any, item *IterableValue) any) (any, error)`

JSONL データを単一の結果に集約します。

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

// 年齢の合計を計算
totalAge, err := p.ReduceJSONL(file, 0, func(acc any, item *json.IterableValue) any {
    return acc.(int) + item.GetInt("age")
})
```

### FilterJSONL

シグネチャ：`func (p *Processor) FilterJSONL(reader io.Reader, predicate func(item *IterableValue) bool) ([]*IterableValue, error)`

JSONL データをフィルタリングし、条件を満たす要素を返します。

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

// 成人を抽出
adults, err := p.FilterJSONL(file, func(item *json.IterableValue) bool {
    return item.GetInt("age") >= 18
})
```

### CollectJSONL

シグネチャ：`func (p *Processor) CollectJSONL(reader io.Reader) ([]*IterableValue, error)`

すべての JSONL 要素をスライスに収集します。

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

items, err := p.CollectJSONL(file)
for _, item := range items {
    fmt.Println(item.GetString("name"))
}
```

### FirstJSONL

シグネチャ：`func (p *Processor) FirstJSONL(reader io.Reader, predicate func(item *IterableValue) bool) (*IterableValue, bool, error)`

最初に条件を満たす要素を返します。

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

user, found, err := p.FirstJSONL(file, func(item *json.IterableValue) bool {
    return item.GetString("name") == "Alice"
})
if found {
    fmt.Println("発見：", user.GetString("name"))
}
```

### ForeachJSONL

シグネチャ：`func (p *Processor) ForeachJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) error) error`

JSONL データを反復します（StreamJSONL のエイリアス）。

---

## JSONL 設定

JSONL 設定は `Config` 構造体に統合されています：

```go
cfg := json.DefaultConfig()
cfg.JSONLBufferSize = 128 * 1024    // バッファサイズ（デフォルト 64KB）
cfg.JSONLMaxLineSize = 2 * 1024 * 1024  // 最大行サイズ（デフォルト 1MB）
cfg.JSONLSkipEmpty = true           // 空行をスキップ（デフォルト true）
cfg.JSONLSkipComments = true        // コメント行をスキップ（デフォルト false）
cfg.JSONLContinueOnErr = true       // 解析エラー時に継続（デフォルト false）
cfg.JSONLWorkers = 8                // 並列ワーカー数（デフォルト 4）
cfg.JSONLChunkSize = 500            // チャンクサイズ（デフォルト 1000）
cfg.JSONLMaxMemory = 200 * 1024 * 1024 // 最大メモリ（デフォルト 100MB）

p, err := json.New(cfg)
if err != nil {
    panic(err)
}
```

フィールドの適用範囲と優先順位：

- **`JSONLMaxLineSize`**：1 行のバイト数上限。`StreamJSONL` 系、`NDJSONProcessor`、`StreamLinesInto` がすべて scanner の制限に使用し、超過時は `bufio.ErrTooLong` 系のエラーを返します。フォールバックチェーン：`JSONLMaxLineSize` → `MaxJSONSize` → 100MB（`NDJSONProcessor`）。
- **`JSONLMaxMemory`**：ストリーミング処理の総バイト数上限（超過でエラー終了）。フォールバックチェーン：`JSONLMaxMemory` → `MaxMemory`。
- **`MaxNestingDepthSecurity`**：すべての JSONL ストリーミング入口は、各行の解析**前**にネスト深度を行単位でチェックし、深いネストによるスタックオーバーフローを防ぎます。
- **`JSONLContinueOnErr`**：`NDJSONProcessor`（`ProcessFile`/`ProcessReader`）と `StreamLinesInto` でのみ有効——不良行をスキップして処理を続けます。`StreamJSONL` 系は解析エラーで即座に終了します。
- **`JSONLWorkers`/`JSONLChunkSize`**：設定検証に参加（クランプ範囲 1–64 / 100–10000）しますが、`StreamJSONLParallel` の `workers` 引数と `StreamJSONLChunked` の `chunkSize` 引数は明示的な渡し値が優先されます。
- `Config.Validate` は範囲外の値を有効区間にクランプします。調整の詳細は `ValidateWithWarnings` で確認できます。

---

## JSONLWriter

JSONL ライターは、データを JSON Lines 形式で書き込むために使用します。

### NewJSONLWriter

シグネチャ：`func NewJSONLWriter(writer io.Writer, cfg ...Config) *JSONLWriter`

JSONL ライターを作成します。オプションの設定引数をサポートします。

```go
file, _ := os.Create("output.jsonl")
defer file.Close()

// デフォルト設定を使用
writer := json.NewJSONLWriter(file)

// カスタム設定を使用
cfg := json.DefaultConfig()
cfg.EscapeHTML = true
writer = json.NewJSONLWriter(file, cfg)
```

### Write

シグネチャ：`func (w *JSONLWriter) Write(data any) error`

単一の JSON 値を 1 行として書き込みます（エンコード結果 + `\n`）。HTML エスケープは構築時の `Config.EscapeHTML`（デフォルト `true`）に従います。

```go
err := writer.Write(map[string]any{
    "id":   1,
    "name": "Alice",
})
// 書き込み内容: {"id":1,"name":"Alice"}\n
```

::: tip エラーはキャッシュされる
`Write`/`WriteRaw` が一度エラーになると、そのエラーは writer にキャッシュされ、**以降のすべての書き込み呼び出しは同じエラーを直接返します**。バッチ書き込み終了後に [`Err`](#err) で一括チェックすればよく、毎回判定する必要はありません。
:::

### WriteAll

シグネチャ：`func (w *JSONLWriter) WriteAll(data []any) error`

複数の JSON 値を書き込み、それぞれを 1 行にします。

```go
items := []any{
    map[string]any{"id": 1, "name": "Alice"},
    map[string]any{"id": 2, "name": "Bob"},
    map[string]any{"id": 3, "name": "Charlie"},
}

err := writer.WriteAll(items)
```

### WriteRaw

シグネチャ：`func (w *JSONLWriter) WriteRaw(line []byte) error`

エンコード済みの生 JSON 行を書き込み、再エンコードをスキップします。行末に改行が**ない**場合は 1 つ自動補完し、あればそのまま書き込みます。

```go
err := writer.WriteRaw([]byte(`{"id":1,"name":"raw"}`))
// 書き込み内容: {"id":1,"name":"raw"}\n
```

### Err

シグネチャ：`func (w *JSONLWriter) Err() error`

書き込み過程で発生したエラーを返します。

```go
if err := writer.Err(); err != nil {
    fmt.Printf("書き込みエラー: %v\n", err)
}
```

### Stats

シグネチャ：`func (w *JSONLWriter) Stats() JSONLStats`

書き込み統計情報を取得します。

```go
stats := writer.Stats()
fmt.Printf("%d 行、%d バイトを書き込み\n", stats.LinesProcessed, stats.BytesWritten)
```

**JSONLStats 構造**：

```go
type JSONLStats struct {
    LinesProcessed int64 // 処理済み行数
    BytesWritten   int64 // 書き込み済みバイト数
}
```

| フィールド | 意味 |
|------|------|
| `LinesProcessed` | `Write`/`WriteAll`/`WriteRaw` で正常に書き出された行数 |
| `BytesWritten` | 累積書き出し総バイト数。**各行末尾の改行を含む** |

例えば `{"id":1}`（9 バイト）を 1 行 `Write` した後、`Stats()` は `LinesProcessed=1`、`BytesWritten=10` です。

---

## NDJSONProcessor

`map[string]any` 型専用の NDJSON ファイルプロセッサです。`StreamJSONL` との違い：コールバックが直接 `map[string]any` を受け取る（`IterableValue` 経由のアクセスが不要）、空行を**常に**スキップする、`Processor` から独立しておりインスタンス作成が不要です。オブジェクト行をシンプルに行単位で消費するシナリオに適します。型付きアクセス、並列、関数型組み合わせが必要な場合は `StreamJSONL` 系を使ってください。

両入口とも防御を内蔵します：

- **各行のネスト深度チェック**：解析前に `MaxNestingDepthSecurity`（デフォルト 200）でチェックし、深いネストによるスタックオーバーフローを防止；
- **1 行サイズ上限**：`JSONLMaxLineSize`（フォールバック `MaxJSONSize` → 100MB）；
- **総量上限**：`JSONLMaxMemory`（フォールバック `MaxMemory`）超過で終了；
- **フォールトトレランス**：`JSONLContinueOnErr=true` の場合、解析失敗行をスキップして継続；
- **パス検証**：`ProcessFile` はファイルパスにパストラバーサルなどのセキュリティ検証を実施；
- **コールバック panic の回復**：コールバックの panic はエラーに変換されて返り、プロセスを壊しません。

### NewNDJSONProcessor

シグネチャ：`func NewNDJSONProcessor(cfg ...Config) *NDJSONProcessor`

NDJSON プロセッサを作成します。オプションの設定引数をサポートします。

```go
// デフォルト設定を使用
np := json.NewNDJSONProcessor()

// カスタム設定を使用
cfg := json.DefaultConfig()
cfg.JSONLBufferSize = 128 * 1024
np = json.NewNDJSONProcessor(cfg)
```

### ProcessFile

シグネチャ：`func (np *NDJSONProcessor) ProcessFile(filename string, fn func(lineNum int, obj map[string]any) error) error`

NDJSON ファイルを処理します。

```go
err := np.ProcessFile("data.ndjson", func(lineNum int, obj map[string]any) error {
    fmt.Printf("[%d] ID: %v\n", lineNum, obj["id"])
    return nil
})
```

### ProcessReader

シグネチャ：`func (np *NDJSONProcessor) ProcessReader(reader io.Reader, fn func(lineNum int, obj map[string]any) error) error`

Reader から NDJSON を処理します。

```go
err := np.ProcessReader(file, func(lineNum int, obj map[string]any) error {
    return nil
})
```

---

## パッケージレベル関数

すべての JSONL 処理関数にパッケージレベルの便利版があり、シグネチャは対応する [Processor メソッド](../api-reference/processor/jsonl)と一致します。内部でデフォルトのグローバル Processor を使用するため、手動でのインスタンス作成は不要です。

::: tip ヒント
パッケージレベル関数は単発処理に適します。ループ内で複数回呼び出す場合や設定を共有する場合は、キャッシュを再利用するために専用 `Processor`（[`json.New()`](../api-reference/processor/)）を作成することを推奨します。
:::

### StreamJSONL

シグネチャ：`func StreamJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) error, cfg ...Config) error`

JSONL を行単位でストリーミング処理し、各行を `IterableValue` に解析してからコールバックを呼び出します。

### StreamJSONLParallel

シグネチャ：`func StreamJSONLParallel(reader io.Reader, workers int, fn func(lineNum int, item *IterableValue) error, cfg ...Config) error`

`workers` 個の並列 goroutine で JSONL を処理します。

### StreamJSONLParallelWithContext

シグネチャ：`func StreamJSONLParallelWithContext(ctx context.Context, reader io.Reader, workers int, fn func(lineNum int, item *IterableValue) error, cfg ...Config) error`

コンテキストキャンセル対応の並列 JSONL 処理です。

### StreamJSONLChunked

シグネチャ：`func StreamJSONLChunked(reader io.Reader, chunkSize int, fn func(chunk []*IterableValue) error, cfg ...Config) error`

`chunkSize` ごとに JSONL をバッチ処理し、各バッチは `[]*IterableValue` としてコールバックに渡されます。

### ForeachJSONL

シグネチャ：`func ForeachJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) error, cfg ...Config) error`

JSONL を走査処理し、各行でコールバックを呼び出します。

### MapJSONL

シグネチャ：`func MapJSONL(reader io.Reader, fn func(lineNum int, item *IterableValue) (any, error), cfg ...Config) ([]any, error)`

各行を新しい値にマッピングし、結果スライスを返します。

### ReduceJSONL

シグネチャ：`func ReduceJSONL(reader io.Reader, initial any, fn func(acc any, item *IterableValue) any, cfg ...Config) (any, error)`

JSONL をリデュースします。`initial` はアキュムレータの初期値です。

### FilterJSONL

シグネチャ：`func FilterJSONL(reader io.Reader, predicate func(item *IterableValue) bool, cfg ...Config) ([]*IterableValue, error)`

述語で JSONL をフィルタリングし、マッチした項目を返します。

### StreamJSONLFile

シグネチャ：`func StreamJSONLFile(filename string, fn func(lineNum int, item *IterableValue) error, cfg ...Config) error`

JSONL ファイル全体をストリーミング処理します。

```go
err := json.StreamJSONLFile("data.jsonl", func(lineNum int, item *json.IterableValue) error {
    fmt.Printf("%d 行目: %v\n", lineNum, item.GetData())
    return nil
})
```

### CollectJSONL

シグネチャ：`func CollectJSONL(reader io.Reader, cfg ...Config) ([]*IterableValue, error)`

すべての JSONL 行を読み取ってスライスに収集します。

### FirstJSONL

シグネチャ：`func FirstJSONL(reader io.Reader, predicate func(item *IterableValue) bool, cfg ...Config) (*IterableValue, bool, error)`

最初に述語を満たす要素を返します。2 番目の戻り値は見つかったかどうかです。

### StreamLinesInto[T]

シグネチャ：`func StreamLinesInto[T any](reader io.Reader, fn func(lineNum int, data T) error, cfg ...Config) ([]T, error)`

JSONL をストリーミング読み込みして行単位で処理します。

```go
type User struct {
    ID   int    `json:"id"`
    Name string `json:"name"`
}

// デフォルト設定を使用
entries, err := json.StreamLinesInto[User](file, func(lineNum int, user User) error {
    fmt.Printf("処理: %s\n", user.Name)
    return nil
})

// カスタム設定を使用
cfg := json.DefaultConfig()
cfg.JSONLSkipComments = true
entries, err = json.StreamLinesInto[User](file, func(lineNum int, user User) error {
    return nil
}, cfg)
```

戻り値のセマンティクス：

- 返される `[]T` には**正常に解析された行のみ**が蓄積されます——`fn` が処理した行は結果スライスに追加されます；
- 行の解析が失敗し `JSONLContinueOnErr` が無効の場合は即座に終了し、`nil` 結果と行番号付きエラー（`line N: ...`）を返します；
- `JSONLContinueOnErr=true` の場合、不良行はスキップされ（結果に入らず `fn` も呼ばれず）、以降の行の処理を続けます；
- `fn` がエラーを返すと即座に終了し、そのエラーをそのまま返します；
- 1 行が `JSONLMaxLineSize` を超えると `bufio.ErrTooLong` で終了します。

### ParseJSONL

シグネチャ：`func ParseJSONL(data []byte, cfg ...Config) ([]any, error)`

JSONL バイトスライスを解析します。

```go
jsonl := `{"name":"Alice"}
{"name":"Bob"}`
results, err := json.ParseJSONL([]byte(jsonl))
```

### ToJSONL

シグネチャ：`func ToJSONL(data []any, cfg ...Config) ([]byte, error)`

JSONL バイトスライスに変換します。

```go
items := []any{
    map[string]any{"id": 1},
    map[string]any{"id": 2},
}
jsonl, err := json.ToJSONL(items)
```

### ToJSONLString

シグネチャ：`func ToJSONLString(data []any, cfg ...Config) (string, error)`

JSONL 文字列に変換します。

```go
jsonlStr, err := json.ToJSONLString(items)
```

---

## 完全なサンプル

### 大型 JSONL ファイルの読み取り

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"os"
)

type LogEntry struct {
	Time    string `json:"time"`
	Level   string `json:"level"`
	Message string `json:"message"`
}

func main() {
	file, err := os.Open("logs.jsonl")
	if err != nil {
		panic(err)
	}
	defer file.Close()

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	count := 0
	err = p.StreamJSONL(file, func(lineNum int, item *json.IterableValue) error {
		count++
		if item.GetString("level") == "error" {
			fmt.Printf("エラー: %s\n", item.GetString("message"))
		}
		return nil
	})

	if err != nil {
		fmt.Printf("エラー: %v\n", err)
	}

	fmt.Printf("合計 %d 行を処理\n", count)
}
```

### JSONL ファイルへの書き込み

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"os"
)

func main() {
	file, err := os.Create("output.jsonl")
	if err != nil {
		panic(err)
	}
	defer file.Close()

	writer := json.NewJSONLWriter(file)

	for i := 0; i < 10; i++ {
		if err := writer.Write(map[string]any{
			"id":    i,
			"value": fmt.Sprintf("item-%d", i),
		}); err != nil {
			panic(err)
		}
	}

	stats := writer.Stats()
	fmt.Printf("%d バイトを書き込み\n", stats.BytesWritten)
}
```

### 大型ファイルの並列処理

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"os"
	"sync/atomic"
)

func main() {
	file, err := os.Open("large.jsonl")
	if err != nil {
		panic(err)
	}
	defer file.Close()

	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	var count int64
	err = p.StreamJSONLParallel(file, 8, func(lineNum int, item *json.IterableValue) error {
		atomic.AddInt64(&count, 1)
		return nil
	})

	if err != nil {
		panic(err)
	}

	fmt.Printf("%d 行を並列処理\n", count)
}
```

---

## 関連

- [大規模ファイル処理](./large-files) - 大規模ファイル処理ガイドと API リファレンス
- [イテレータ](../api-reference/iterator) - 反復走査 API
