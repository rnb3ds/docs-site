---
sidebar_label: "インターフェース定義"
title: "インターフェース定義 - CyberGo JSON | API リファレンス"
description: "CyberGo JSON の拡張インターフェース：CustomEncoder、TypeEncoder、Validator、Hook、PathParser、DangerousPattern、HookContext コンテキストと定義済みフックで、エンコード・検証・セキュリティ保護を柔軟に拡張します。"
sidebar_position: 6
---

# インターフェース定義

json パッケージは複数の拡張インターフェースを提供し、JSON 処理動作のカスタマイズを可能にします。

## エンコーダインターフェース

::: warning 接続されていない拡張フィールド
`CustomEncoder` と `TypeEncoder` インターフェースは、現バージョンでは**宣言済みだがエンコードパイプラインにはまだ接続されていません**。`Config.CustomEncoder` / `Config.CustomTypeEncoders` で設定しても効果はなく、将来のバージョンのために予約されています。現時点で利用できるエンコードのカスタマイズ方法は、`json.Marshaler` または `encoding.TextMarshaler` インターフェースの実装です（[カスタムエンコーダ](../extensions/custom-encoder)を参照）。
:::

### CustomEncoder

カスタム JSON エンコーダインターフェース。

```go
type CustomEncoder interface {
    // Encode は Go 値を JSON 文字列に変換する
    Encode(value any) (string, error)
}
```

**使用例**

```go
import stdjson "encoding/json"

type UpperCaseEncoder struct{}

func (e *UpperCaseEncoder) Encode(value any) (string, error) {
    // カスタムエンコードロジック
    switch v := value.(type) {
    case string:
        return fmt.Sprintf(`"%s"`, strings.ToUpper(v)), nil
    default:
        // 標準エンコードを使用（無限再帰を回避）
        data, err := stdjson.Marshal(v)
        if err != nil {
            return "", err
        }
        return string(data), nil
    }
}

// 設定して使用
cfg := json.DefaultConfig()
cfg.CustomEncoder = &UpperCaseEncoder{}
processor, err := json.New(cfg)
if err != nil {
    panic(err)
}
```

### TypeEncoder

特定型のエンコーダインターフェース。

```go
type TypeEncoder interface {
    // Encode は特定型の値を JSON 文字列にエンコードする
    Encode(v reflect.Value) (string, error)
}
```

**使用例**

```go
type TimeEncoder struct{}

func (e *TimeEncoder) Encode(v reflect.Value) (string, error) {
    if v.Type() == reflect.TypeOf(time.Time{}) {
        t := v.Interface().(time.Time)
        return fmt.Sprintf(`"%s"`, t.Format(time.RFC3339)), nil
    }
    return "", fmt.Errorf("サポートされない型: %v", v.Type())
}

// 型エンコーダを登録
cfg := json.DefaultConfig()
cfg.CustomTypeEncoders = map[reflect.Type]json.TypeEncoder{
    reflect.TypeOf(time.Time{}): &TimeEncoder{},
}
processor, err := json.New(cfg)
if err != nil {
    panic(err)
}
```

## バリデータインターフェース

::: warning 接続されていない拡張フィールド
`Validator` インターフェースは、現バージョンでは**宣言済みだが操作パイプラインにはまだ接続されていません**。`Config.CustomValidators` や `Config.AddValidator()` で設定しても効果はなく、将来のバージョンのために予約されています。現時点で利用できる検証方法は `ValidateSchema` です（[Schema 検証](./schema)を参照）。
:::

### Validator

JSON バリデータインターフェース。

```go
type Validator interface {
    // Validate は JSON 文字列に問題がないかチェックする
    // 有効なら nil を、そうでなければ問題を記述するエラーを返す
    Validate(jsonStr string) error
}
```

**使用例**

```go
type SizeValidator struct {
    MaxSize int64
}

func (v *SizeValidator) Validate(jsonStr string) error {
    // 入力データのサイズをチェック
    if int64(len(jsonStr)) > v.MaxSize {
        return fmt.Errorf("JSON が最大サイズを超過：%d", v.MaxSize)
    }
    return nil
}

// バリデータを設定
cfg := json.DefaultConfig()
cfg.CustomValidators = []json.Validator{&SizeValidator{MaxSize: 1024 * 1024}} // 1MB
processor, err := json.New(cfg)
if err != nil {
    panic(err)
}
```

## フックインターフェース

### Hook

操作インターセプトインターフェース。前置/後置処理をサポートします。

```go
type Hook interface {
    // Before は操作の前に呼び出される
    // エラーを返すと操作を中止する
    Before(ctx HookContext) error

    // After は操作の完了後に呼び出される
    // 結果の変更やエラーのチェックが可能
    After(ctx HookContext, result any, err error) (any, error)
}
```

**実行順序**：複数のフックは登録順に `Before` が実行されます（いずれかがエラーを返すと即座に中止し、以降のフックと操作自体は実行されません）。`After` は**登録の逆順**に実行されます（ミドルウェアのオニオンモデルに類似）。フック内の panic は捕捉されます：`Before` の panic はエラーに変換されて操作を中止し、`After` の panic はログに記録された後そのフックをスキップします。いずれもプロセッサを落とすことはありません。

### HookContext

フックコンテキスト。操作情報を提供します。

```go
type HookContext struct {
    Operation string        // 操作型："get", "set", "delete", "marshal", "unmarshal"
    JSONStr   string        // 入力 JSON 文字列（marshal 時は空の場合がある）。セキュリティ警告：機密データを含む可能性あり
    Path      string        // ターゲットパス（marshal/unmarshal 時は空の場合がある）
    Value     any           // set 操作の値
    Config    *Config       // 有効な設定
    StartTime time.Time     // 操作開始時刻
}
```

**フィールドの説明**

| フィールド | 型 | 説明 |
|------|------|------|
| `Operation` | `string` | 操作型：`"get"`、`"set"`、`"delete"`、`"marshal"`、`"unmarshal"` |
| `JSONStr` | `string` | 入力 JSON 文字列（marshal 時は空の場合がある）。**機密データを含む可能性あり** |
| `Path` | `string` | ターゲットパス（marshal/unmarshal 時は空の場合がある） |
| `Value` | `any` | set 操作で書き込む値 |
| `Config` | `*Config` | 現在の操作で使用される有効な設定 |
| `StartTime` | `time.Time` | 操作開始時刻（`After` の呼び出し前に設定される） |

::: warning JSONStr は機密データを含む
`JSONStr` にはパスワード、トークン、API キー、PII（個人識別情報）などの機密データが含まれる可能性があります——このフィールドをログに書き込ま**ない**でください。ログ記録には `Operation` と `Path` のみを使用し、内容の確認が必要な場合は特定のパスに対してのみ読み取ってください。
:::

**使用例**

```go
type LoggingHook struct {
    logger *slog.Logger
}

func (h *LoggingHook) Before(ctx json.HookContext) error {
    h.logger.Info("操作開始",
        "operation", ctx.Operation,
        "path", ctx.Path,
    )
    return nil
}

func (h *LoggingHook) After(ctx json.HookContext, result any, err error) (any, error) {
    h.logger.Info("操作完了",
        "operation", ctx.Operation,
        "path", ctx.Path,
        "duration", time.Since(ctx.StartTime),
        "error", err,
    )
    return result, err
}

// フックを追加
cfg := json.DefaultConfig()
cfg.Hooks = []json.Hook{&LoggingHook{logger: slog.Default()}}
```

### HookFunc

構造体アダプター。関数をフックとして使えるようにします。2 つの関数フィールドはどちらもオプションです：未設定の方は「パススルー」扱いになります（`Before` は nil を返し、`After` は結果とエラーをそのまま返す）。

```go
type HookFunc struct {
    BeforeFn func(ctx HookContext) error
    AfterFn  func(ctx HookContext, result any, err error) (any, error)
}
```

**フィールドの説明**

| フィールド | 型 | 説明 |
|------|------|------|
| `BeforeFn` | `func(ctx HookContext) error` | 操作前のコールバック。エラーを返すと操作を中止。未設定の場合 `Before` はパススルーで `nil` を返す |
| `AfterFn` | `func(ctx HookContext, result any, err error) (any, error)` | 操作後のコールバック。結果やエラーを変換可能。未設定の場合 `After` は結果とエラーをそのまま返す |

**使用例**

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

### 定義済みフック

#### LoggingHook

シグネチャ：`func LoggingHook(logger interface{ Info(msg string, args ...any) }) Hook`

ログ記録フックを作成します。

```go
p.AddHook(json.LoggingHook(slog.Default()))
```

#### TimingHook

シグネチャ：`func TimingHook(recorder interface{ Record(op string, duration time.Duration) }) Hook`

計時記録フックを作成します。

```go
type MetricsRecorder struct{}

func (r *MetricsRecorder) Record(op string, duration time.Duration) {
    metrics.RecordDuration(op, duration)
}

p.AddHook(json.TimingHook(&MetricsRecorder{}))
```

#### ValidationHook

シグネチャ：`func ValidationHook(validator func(jsonStr, path string) error) Hook`

入力検証フックを作成します。

```go
p.AddHook(json.ValidationHook(func(jsonStr, path string) error {
    if len(jsonStr) > 1_000_000 {
        return errors.New("JSON が大きすぎます")
    }
    return nil
}))
```

#### ErrorHook

シグネチャ：`func ErrorHook(handler func(ctx HookContext, err error) error) Hook`

エラーインターセプトフックを作成します。

```go
p.AddHook(json.ErrorHook(func(ctx json.HookContext, err error) error {
    sentry.CaptureException(err)
    return err // 元のエラーまたは変換後のエラーを返す
}))
```

## セキュリティモードインターフェース

### PatternLevel

危険パターンの重大度レベル。

```go
type PatternLevel int

const (
    // PatternLevelCritical - 常に操作を阻止
    PatternLevelCritical PatternLevel = iota

    // PatternLevelWarning - 厳格モードでは阻止、緩いモードでは警告を記録
    PatternLevelWarning

    // PatternLevelInfo - 記録のみ、決して阻止しない
    PatternLevelInfo
)
```

**String メソッド**：`func (pl PatternLevel) String() string` は `"critical"` / `"warning"` / `"info"` を返します（未知の値は `"unknown"`）。ログ出力に便利です。

### DangerousPattern

危険パターン構造体。カスタムセキュリティルールの定義に使用します。

```go
type DangerousPattern struct {
    // Pattern は入力内で検出する部分文字列
    Pattern string

    // Name はパターンの説明的な名前
    Name string

    // Level はこのパターンをどう扱うかを決める重大度レベル
    Level PatternLevel
}
```

**フィールドの説明**

| フィールド | 型 | 説明 |
|------|------|------|
| `Pattern` | `string` | 入力内で検出する部分文字列 |
| `Name` | `string` | このセキュリティリスクの説明的な名前 |
| `Level` | `PatternLevel` | 重大度レベル。ヒット時の処理方法（阻止/警告/記録のみ）を決定 |

**使用例**

```go
// 構造体リテラルでカスタム危険パターンを作成
customPattern := json.DangerousPattern{
    Pattern: "eval(",
    Name:    "JavaScript eval 呼び出し",
    Level:   json.PatternLevelCritical,
}

// 設定経由で追加
cfg := json.DefaultConfig()
cfg.AddDangerousPattern(customPattern)
cfg.AddDangerousPattern(json.DangerousPattern{
    Pattern: "internal_api",
    Name:    "内部 API 参照",
    Level:   json.PatternLevelWarning,
})
```

## パス解析インターフェース

### PathParser

パスパーサーインターフェース。

```go
type PathParser interface {
    // ParsePath はパス文字列をパスセグメントに解析する
    ParsePath(path string) ([]PathSegment, error)
}
```

**使用例**

```go
type CustomPathParser struct{}

func (p *CustomPathParser) ParsePath(path string) ([]json.PathSegment, error) {
    // カスタムパス解析ロジック
    return nil, nil // カスタム解析を実装
}
```

::: warning 予約状態
`CustomPathParser` は現バージョンでは**パス解析パイプラインにまだ接続されていません**：`Config.CustomPathParser` で設定しても、パス解析は引き続き組み込みパーサーを使用します（このフィールドは現在、プロセッサキャッシュキーの「設定されているか」判定にのみ参加し、設定するとその構成はプロセッサキャッシュを使わなくなります）。`CustomEncoder`、`CustomValidators` と同様に将来のバージョン用の予約インターフェースです。
:::

## 基本型

### Number

JSON 数値型。数値精度の保持に使用します。大きな数値を扱う場合や正確な小数が必要な場合に使用します。

```go
type Number string
```

::: tip 互換性について
ライブラリの `Number` 型は `encoding/json.Number` と 100% 互換で、直接置き換えて使用できます。
:::

**メソッド**：

```go
func (n Number) String() string              // 数値のリテラルテキストを返す
func (n Number) Float64() (float64, error)   // float64 に変換
func (n Number) Int64() (int64, error)       // int64 に変換
```

**使用例**：

```go
// Number 型を取得（Decoder.UseNumber で完全な精度を保持）
decoder := json.NewDecoder(strings.NewReader(data))
decoder.UseNumber()

var obj map[string]any
if err := decoder.Decode(&obj); err != nil {
    panic(err)
}

// 型アサーションで Number を取得
if num, ok := obj["large_number"].(json.Number); ok {
    // Number は元の精度を保持
    fmt.Println(num.String()) // "9007199254740993"（完全な精度）

    // 他の型に変換
    f, _ := num.Float64()
    i, _ := num.Int64()
}
```

## 標準ライブラリ互換インターフェース

`json` パッケージは、`encoding/json` と互換の以下の標準インターフェースをエクスポートします。カスタム型のエンコード・デコード動作に使用します：エンコード側は `Marshaler` と `TextMarshaler`（実践は[カスタムエンコーダ](../extensions/custom-encoder)を参照）、デコード側は `Unmarshaler` と `TextUnmarshaler` です。

### Marshaler

```go
type Marshaler interface {
    MarshalJSON() ([]byte, error)
}
```

`MarshalJSON` を実装した型は、エンコード時に自身の JSON 表現を完全に引き受けます。戻り値は正当な JSON である必要があります。

### Unmarshaler

```go
type Unmarshaler interface {
    UnmarshalJSON(data []byte) error
}
```

`UnmarshalJSON` を実装した型は、デコード時に自身の解析を引き受けます：デコーダは対応する JSON 値をそのまま渡し、型自身がターゲットを埋めます。メソッドが返すエラーはそのまま上位に伝播します。通常は**ポインタレシーバ**で実装します（デコードはレシーバ自身の変更を伴うため）。

### TextMarshaler

```go
type TextMarshaler interface {
    MarshalText() ([]byte, error)
}
```

`MarshalText` を実装した型は、テキスト内容を値とする JSON 文字列としてエンコードされます（引用符とエスケープは自動で付加）。

### TextUnmarshaler

```go
type TextUnmarshaler interface {
    UnmarshalText(text []byte) error
}
```

`UnmarshalText` を実装した型は、JSON 文字列の**内容**（引用符とエスケープを除去したテキスト）から自ら解析します。テキストだけで完全に表現できる型（カスタム時刻、ID など）に適します。同じ型が `Unmarshaler` も実装している場合、`UnmarshalJSON` が優先されます。

**使用例**

```go
type Person struct {
    Name string
}

// Marshaler インターフェースを実装
func (p Person) MarshalJSON() ([]byte, error) {
    return []byte(`{"name":"` + p.Name + `"}`), nil
}

// Unmarshaler インターフェースを実装
func (p *Person) UnmarshalJSON(data []byte) error {
    var v struct{ Name string `json:"name"` }
    if err := json.Unmarshal(data, &v); err != nil {
        return err
    }
    p.Name = v.Name
    return nil
}
```

`Encoder`、`Decoder`、`Token`、`Delim`、`Number` などのエンコード・デコード型の詳細は[型定義](./types#encoder-json-エンコーダ)を参照してください。

## 型定義

### Result[T]

型安全な操作結果。ジェネリクス対応の結果処理を提供します。

```go
type Result[T any] struct {
    Value  T     // 結果値
    Exists bool  // パスが存在するか
    Error  error // エラー情報（あれば）
}
```

**メソッド**：

| メソッド | シグネチャ | 説明 |
|------|------|------|
| `Ok` | `func (r Result[T]) Ok() bool` | 結果が有効か（エラーなし且つ存在する） |
| `Unwrap` | `func (r Result[T]) Unwrap() T` | 値を取得。無効時はゼロ値 |
| `UnwrapOr` | `func (r Result[T]) UnwrapOr(defaultValue T) T` | 値またはデフォルト値を取得 |

**使用例**：

```go
// ジェネリクスで値を取得
name := json.GetTyped[string](data, "user.name")
fmt.Println(name)

// デフォルト値付きで取得
name = json.GetTyped[string](data, "user.name", "unknown")
```

---

### AccessResult

動的型アクセスの結果。Processor.SafeGet が返します。

```go
type AccessResult struct {
    Value  any    // 結果値
    Exists bool   // パスが存在するか
    Type   string // 実行時型情報
}

// メソッド
func (r AccessResult) Ok() bool                           // 存在するか
func (r AccessResult) Unwrap() any                        // 値を取得
func (r AccessResult) UnwrapOr(defaultValue any) any      // 値またはデフォルト値を取得
func (r AccessResult) AsString() (string, error)          // 厳格変換
func (r AccessResult) AsStringConverted() (string, error) // フォーマット変換
func (r AccessResult) AsInt() (int, error)                // 厳格変換
func (r AccessResult) AsFloat64() (float64, error)        // 厳格変換
func (r AccessResult) AsBool() (bool, error)              // 厳格変換
```

**型変換メソッドの説明**：

| メソッド | 変換動作 | 説明 |
|------|----------|------|
| `AsString()` | 厳格 | string 型のみ受け付ける。非文字列はエラー |
| `AsStringConverted()` | フォーマット | fmt.Sprintf で任意の値を文字列表現に変換 |
| `AsInt()` | 厳格 | bool から int への変換はしない。整数と解析可能な数値のみ受け付ける |
| `AsFloat64()` | 厳格 | bool から float への変換はしない。浮動小数点数と解析可能な数値のみ受け付ける |
| `AsBool()` | 厳格 | bool と解析可能な文字列のみ受け付ける（`strconv.ParseBool` ルール：`1/t/true/True/TRUE`、`0/f/false/False/FALSE`） |

```go
result := p.SafeGet(data, "user.age")

// 厳格変換 - 値が整数でなければエラー
age, err := result.AsInt()

// フォーマット変換 - 任意の値を文字列に変換
str, err := result.AsStringConverted() // 例: 30 -> "30"
```

## Schema 型

### Schema

JSON Schema は構造体として定義され、型安全な Schema 定義をサポートします。

```go
type Schema struct {
    Type                 string            `json:"type,omitempty"`
    Properties           map[string]*Schema `json:"properties,omitempty"`
    Items                *Schema           `json:"items,omitempty"`
    Required             []string          `json:"required,omitempty"`
    MinLength            int               `json:"minLength,omitempty"`
    MaxLength            int               `json:"maxLength,omitempty"`
    Minimum              float64           `json:"minimum,omitempty"`
    Maximum              float64           `json:"maximum,omitempty"`
    Pattern              string            `json:"pattern,omitempty"`
    Format               string            `json:"format,omitempty"`
    AdditionalProperties bool              `json:"additionalProperties,omitempty"`
    MinItems             int               `json:"minItems,omitempty"`
    MaxItems             int               `json:"maxItems,omitempty"`
    UniqueItems          bool              `json:"uniqueItems,omitempty"`
    Enum                 []any             `json:"enum,omitempty"`
    Const                any               `json:"const,omitempty"`
    MultipleOf           float64           `json:"multipleOf,omitempty"`
    ExclusiveMinimum     bool              `json:"exclusiveMinimum,omitempty"`
    ExclusiveMaximum     bool              `json:"exclusiveMaximum,omitempty"`
    Title                string            `json:"title,omitempty"`
    Description          string            `json:"description,omitempty"`
    Default              any               `json:"default,omitempty"`
    Examples             []any             `json:"examples,omitempty"`
}
```

**使用例**：

```go
schema := &json.Schema{
    Type:     "object",
    Required: []string{"name"},
    Properties: map[string]*json.Schema{
        "name": {Type: "string"},
        "age":  {Type: "number"},
    },
}
```

### SchemaConfig

Schema 検証設定。`NewSchemaWithConfig` による Schema インスタンス作成に使用します。

```go
type SchemaConfig struct {
    Type                 string
    Properties           map[string]*Schema
    Items                *Schema
    Required             []string
    MinLength            *int
    MaxLength            *int
    Minimum              *float64
    Maximum              *float64
    Pattern              string
    Format               string
    AdditionalProperties *bool
    MinItems             *int
    MaxItems             *int
    UniqueItems          bool
    Enum                 []any
    Const                any
    MultipleOf           *float64
    ExclusiveMinimum     *bool
    ExclusiveMaximum     *bool
    Title                string
    Description          string
    Default              any
    Examples             []any
}
```

**使用例**：

```go
cfg := json.DefaultSchemaConfig()
cfg.Type = "object"
cfg.Required = []string{"name", "email"}
additionalProperties := false
cfg.AdditionalProperties = &additionalProperties
schema := json.NewSchemaWithConfig(cfg)
```

### ValidationError

Schema 検証エラー。

```go
type ValidationError struct {
    Path    string `json:"path"`    // エラーパス
    Message string `json:"message"` // エラーメッセージ
}

func (ve *ValidationError) Error() string
```

## 関連

- [Hook フックシステム](../extensions/hooks) - フックの詳細な使い方ガイド
- [Schema 検証](./schema) - Schema 検証の詳細ガイド
- [CustomEncoder](../extensions/custom-encoder) - カスタムエンコーダガイド
