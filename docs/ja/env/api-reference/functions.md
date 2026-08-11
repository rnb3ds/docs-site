---
sidebar_label: "パッケージ関数"
title: "パッケージ関数 - CyberGo env | グローバル便利関数"
description: "CyberGo env パッケージレベル便利関数の API リファレンス。Load、GetString、GetInt、GetBool、GetDuration、GetSlice、GetSecure、Lookup、Keys、ParseInto などグローバルデフォルト Loader に基づくスレッドセーフなインターフェースを提供。"
sidebar_position: 2
---

# パッケージ関数

パッケージレベルの便利関数はシンプルな API を提供し、ほとんどのユースケースに適しています。これらの関数はグローバルデフォルトローダーを使用し、すべてスレッドセーフです。

::: info 初期化要件
グローバルデフォルトローダーは `Load()` または `LoadWithConfig()` で明示的に初期化する必要があり、初回呼び出しで自動作成**されません**。未初期化の場合、関数の動作は以下の通りです：

- `Get*` 関数（`GetString`、`GetInt`、`GetBool` など）：渡されたデフォルト値（またはゼロ値）を返す
- `Lookup`：`("", false)` を返す
- `Keys`/`All`/`Len`/`GetSecure`：`nil`/`0` を返す
- `Set`/`Delete`/`Validate`/`ParseInto`：`ErrNotInitialized` を返す
:::

## 読み込み関数

### Load

```go
func Load(filenames ...string) error
```

環境変数ファイルを読み込み、システム環境に適用します。

**パラメータ：**
- `filenames` - ファイルパスのリスト。未指定時はデフォルトで `.env` ファイルを読み込み（`DefaultConfig()` の `Filenames` 設定を使用）。

**戻り値：**
- `error` - 読み込みエラー

**動作：**
- 新しい Loader インスタンスを作成しデフォルトローダーとして設定
- システム環境（`os.Environ`）に自動適用
- 後に読み込んだファイルが前に読み込んだものを上書き可能（`OverwriteExisting` 設定で制御、`Load()` のデフォルトは `false`、つまり上書きしない）
- デフォルトローダーが初期化済みの場合 `ErrAlreadyInitialized` を返す
- マルチフォーマットサポート（.env、JSON、YAML）

```go
// .env ファイルを読み込み
if err := env.Load(".env"); err != nil {
    log.Fatal(err)
}

// 指定ファイルを読み込み（順番に、上書きが必要な場合は OverwriteExisting を設定）
if err := env.Load(".env", ".env.local", "config.json"); err != nil {
    log.Fatal(err)
}

// JSON/YAML ネスト構造はドットアクセスをサポート
// config.json: {"database": {"host": "localhost", "port": 5432}}
env.Load("config.json")
host := env.GetString("database.host") // "localhost"
port := env.GetInt("database.port")    // 5432
```

---

## キー名の解決

すべての取得関数はインテリジェントなキー名解決をサポートし、柔軟なアクセス方法を提供します。

### 解決ルール

**1. 完全一致（優先）**
```go
// .env: APP_NAME=myapp
name := env.GetString("APP_NAME")  // "myapp"
```

**2. 大文字変換（シンプルキー）**
```go
// ドットを含まないキーは自動的に大文字版を試行
name := env.GetString("app_name")  // app_name -> APP_NAME を検索
```

**3. ドットパス解決（ネストキー）**
```go
// JSON: {"app": {"name": "myapp"}}
// 格納形態：APP_NAME=myapp

// 以下の方法でこの値にアクセス可能
name := env.GetString("APP_NAME")   // フラット化キー名（推奨）
name := env.GetString("app.name")   // ドットパス（自動変換）
name := env.GetString("APP.NAME")   // 大文字ドットパス
```

### パス変換テーブル

| 入力キー名 | 格納キー名 |
|----------|----------|
| `"database.host"` | `"DATABASE_HOST"` |
| `"db.port"` | `"DB_PORT"` |
| `"servers.0.host"` | `"SERVERS_0_HOST"` |
| `"app.config.name"` | `"APP_CONFIG_NAME"` |

### インデックスアクセス

配列要素はインデックスでアクセスするか、カンマ区切り値にフォールバックできます：

```go
// JSON: {"servers": [{"host": "a.com"}, {"host": "b.com"}]}
// 格納形態：SERVERS_0_HOST=a.com, SERVERS_1_HOST=b.com

host0 := env.GetString("servers.0.host")  // "a.com"
host1 := env.GetString("servers.1.host")  // "b.com"

// キーが存在しないがカンマ区切りのベース値が存在する場合
// HOSTS=localhost,example.com
host0 := env.GetString("hosts.0")  // "localhost"（カンマ区切り値から解析）
```

---

## 値の取得関数

### GetString

```go
func GetString(key string, defaultValue ...string) string
```

文字列値を取得します。ドットパス解決をサポートします。

**パラメータ：**
- `key` - キー名（完全一致、大文字変換、ドットパスをサポート）
- `defaultValue` - オプションのデフォルト値

**戻り値：**
- `string` - 値またはデフォルト値（見つからずデフォルト値なしの場合は空文字列）

```go
// 基本的な使い方
host := env.GetString("HOST", "localhost")

// ドットパスアクセス（JSON/YAML ネスト構造）
dbHost := env.GetString("database.host", "localhost")
appName := env.GetString("app.name")

// デフォルト値なしの場合は空文字列を返す
value := env.GetString("NON_EXISTENT")  // ""
```

---

### GetInt

```go
func GetInt(key string, defaultValue ...int64) int64
```

整数値を取得します。文字列を整数に自動変換します。ドットパス解決をサポートします。

**パラメータ：**
- `key` - キー名（ドットパスをサポート）
- `defaultValue` - オプションのデフォルト値、型は `int64`

**戻り値：**
- `int64` - 値またはデフォルト値（見つからずデフォルト値なしの場合は 0）

```go
port := env.GetInt("PORT", 8080)
maxConn := env.GetInt("database.max_connections", 10)

// デフォルト値なしの場合は 0 を返す
value := env.GetInt("NON_EXISTENT")  // 0
```

---

### GetBool

```go
func GetBool(key string, defaultValue ...bool) bool
```

ブール値を取得します。ドットパス解決をサポートします。

- **真値（大文字小文字を区別しない）：** `true`, `1`, `yes`, `on`, `enabled`
- **偽値（大文字小文字を区別しない）：** `false`, `0`, `no`, `off`, `disabled`

**パラメータ：**
- `key` - キー名（ドットパスをサポート）
- `defaultValue` - オプションのデフォルト値

**戻り値：**
- `bool` - 値またはデフォルト値（見つからずデフォルト値なしの場合は false）

```go
debug := env.GetBool("DEBUG", false)
cacheEnabled := env.GetBool("cache.enabled", true)

// デフォルト値なしの場合は false を返す
value := env.GetBool("NON_EXISTENT")  // false
```

---

### GetUint64

```go
func GetUint64(key string, defaultValue ...uint64) uint64
```

符号なし整数値を取得します。ドットパス解決をサポートします。

**パラメータ：**
- `key` - キー名（ドットパスをサポート）
- `defaultValue` - オプションのデフォルト値、型は `uint64`

**戻り値：**
- `uint64` - 値またはデフォルト値（見つからずデフォルト値なしの場合は 0）

```go
port := env.GetUint64("PORT", 8080)
maxSize := env.GetUint64("MAX_SIZE", 1024)

// デフォルト値なしの場合は 0 を返す
value := env.GetUint64("NON_EXISTENT")  // 0
```

---

### GetFloat64

```go
func GetFloat64(key string, defaultValue ...float64) float64
```

浮動小数点数値を取得します。ドットパス解決をサポートします。

**パラメータ：**
- `key` - キー名（ドットパスをサポート）
- `defaultValue` - オプションのデフォルト値、型は `float64`

**戻り値：**
- `float64` - 値またはデフォルト値（見つからずデフォルト値なしの場合は 0）

```go
rate := env.GetFloat64("RATE", 0.5)
threshold := env.GetFloat64("THRESHOLD")

// デフォルト値なしの場合は 0 を返す
value := env.GetFloat64("NON_EXISTENT")  // 0
```

---

### GetDuration

```go
func GetDuration(key string, defaultValue ...time.Duration) time.Duration
```

時間間隔値を取得します。ドットパス解決をサポートします。

**サポートするフォーマット：**
- `300ms` - ミリ秒
- `1.5s` - 秒
- `2m30s` - 分 + 秒
- `1h30m` - 時間 + 分

**パラメータ：**
- `key` - キー名（ドットパスをサポート）
- `defaultValue` - オプションのデフォルト値

**戻り値：**
- `time.Duration` - 値またはデフォルト値（見つからずデフォルト値なしの場合は 0）

```go
timeout := env.GetDuration("TIMEOUT", 30*time.Second)
interval := env.GetDuration("INTERVAL", 5*time.Minute)

// デフォルト値なしの場合は 0 を返す
value := env.GetDuration("NON_EXISTENT")  // 0
```

---

### GetSecure

```go
func GetSecure(key string) *SecureValue
```

セキュア値を取得します（機密データ用）。

**パラメータ：**
- `key` - キー名

**戻り値：**
- `*SecureValue` - セキュア値ラッパー、キーが存在しないまたはローダーが利用不可の場合は nil

```go
secret := env.GetSecure("API_KEY")
if secret != nil {
    defer secret.Release()

    value := secret.Reveal()   // 平文値（必要な時のみ呼び出す）
    masked := secret.Masked()  // ログ用：[SECURE:32 bytes]
}
```

::: warning 重要
使用後に `Release()` または `Close()` を呼び出してリソースを解放する必要があります。`defer` で解放を保証することを推奨します。
:::

::: tip 詳細
[SecureValue API](/ja/env/api-reference/secure-value) で完全な API ドキュメントを参照してください。
:::

---

### GetSlice[T]

```go
func GetSlice[T sliceElement](key string, defaultValue ...[]T) []T
```

ジェネリック関数。スライス値を取得します。

**サポートする型：** `string`, `int`, `int64`, `uint`, `uint64`, `bool`, `float64`, `time.Duration`

**注意：** これはジェネリック関数で、Loader のメソッドではありません。指定 Loader インスタンスからスライスを取得するには `GetSliceFrom[T]` を使用します。

**解析順序：**
1. インデックスキー `KEY_0`, `KEY_1`, `KEY_2`... を優先検索
2. インデックスキーがない場合、`KEY` の値をカンマ区切りで解析
3. ドットパス解決をサポート

**パラメータ：**
- `key` - キー名
- `defaultValue` - オプションのデフォルト値

**戻り値：**
- `[]T` - スライス値

```go
// インデックスキーフォーマット（推奨）
// HOSTS_0=localhost
// HOSTS_1=example.com
hosts := env.GetSlice[string]("HOSTS")  // ["localhost", "example.com"]

// カンマ区切りフォーマット
// PORTS=80,443,8080
ports := env.GetSlice[int64]("PORTS", []int64{80})  // [80, 443, 8080]

// 浮動小数点スライス
rates := env.GetSlice[float64]("RATES", []float64{0.1, 0.2})

// ブール値スライス
flags := env.GetSlice[bool]("FLAGS")

// Duration スライス
timeouts := env.GetSlice[time.Duration]("TIMEOUTS")

// 符号なし整数スライス
ports := env.GetSlice[uint]("PORTS")
port64s := env.GetSlice[uint64]("PORTS")

// int 型
portInts := env.GetSlice[int]("PORTS")

// デフォルト値なしの場合は nil を返す
value := env.GetSlice[string]("NON_EXISTENT")  // nil
```

---

### GetSliceFrom[T]

```go
func GetSliceFrom[T sliceElement](loader *Loader, key string, defaultValue ...[]T) []T
```

指定 Loader インスタンスからスライス値を取得します。これは独立したジェネリック関数です（Loader メソッドではありません）。

**パラメータ：**
- `loader` - Loader インスタンスポインタ（nil の場合、デフォルト値を返す）
- `key` - キー名
- `defaultValue` - オプションのデフォルト値

**戻り値：**
- `[]T` - スライス値

**サポートする型：** `string`, `int`, `int64`, `uint`, `uint64`, `bool`, `float64`, `time.Duration`

```go
loader, _ := env.New(cfg)
defer loader.Close()

// loader インスタンスからスライスを取得
hosts := env.GetSliceFrom[string](loader, "HOSTS")
ports := env.GetSliceFrom[int64](loader, "PORTS", []int64{80})

// int、uint、uint64 型もサポート
portsInt := env.GetSliceFrom[int](loader, "PORTS")
portsUint := env.GetSliceFrom[uint](loader, "PORTS")
portsUint64 := env.GetSliceFrom[uint64](loader, "PORTS")
```

::: tip 違い
- `GetSlice[T]` - デフォルトローダーを使用するパッケージレベル関数
- `GetSliceFrom[T]` - 指定 Loader インスタンスのジェネリック関数（Go はジェネリックメソッドをサポートしない）
:::

---

## クエリ関数

### Lookup

```go
func Lookup(key string) (string, bool)
```

キーが存在するかチェックし値を取得します。ドットパス解決をサポートします。

**パラメータ：**
- `key` - キー名（ドットパスをサポート）

**戻り値：**
- `string` - 値（前後の空白は削除済み）
- `bool` - 存在するか

```go
value, exists := env.Lookup("API_KEY")
if !exists {
    // キーが存在しない
}

// ドットパス
if value, exists := env.Lookup("database.host"); exists {
    fmt.Println(value)
}
```

---

### Keys

```go
func Keys() []string
```

すべてのキー名を取得します。

**戻り値：**
- `[]string` - キー名リスト、ローダーが利用不可の場合は nil

```go
keys := env.Keys()
for _, key := range keys {
    fmt.Println(key)
}
```

---

### All

```go
func All() map[string]string
```

すべてのキーと値のペアを取得します。

**戻り値：**
- `map[string]string` - キーと値のマッピング、ローダーが利用不可の場合は nil

```go
all := env.All()
for key, value := range all {
    fmt.Printf("%s=%s\n", key, value)
}
```

---

### Len

```go
func Len() int
```

変数の数を取得します。

**戻り値：**
- `int` - 変数の数、ローダーが利用不可の場合は 0

```go
count := env.Len()
fmt.Printf("%d 個の環境変数を読み込みました\n", count)
```

---

## 設定と削除

### Set

```go
func Set(key, value string) error
```

環境変数を設定します。

**パラメータ：**
- `key` - キー名
- `value` - 値

**戻り値：**
- `error` - 設定エラー

**エラー型：**
- `*ValidationError` - キー名形式が無効（Field="key"）
- `*SecurityError` - キーが禁止されている（`errors.Is(err, env.ErrSecurityViolation)` でマッチ可能）
- `ErrInvalidValue` - 値が無効（`ValidateValues` が true の場合、値にヌルバイト、制御文字などの安全でない内容が含まれる）
- `ErrClosed` - ローダーがクローズ済み

```go
if err := env.Set("CUSTOM_KEY", "value"); err != nil {
    // *SecurityError（禁止キー）または *ValidationError（キー形式）の可能性
}
```

---

### Delete

```go
func Delete(key string) error
```

環境変数を削除します。

**パラメータ：**
- `key` - キー名

**戻り値：**
- `error` - 削除エラー

```go
if err := env.Delete("TEMP_KEY"); err != nil {
    panic(err)
}
```

---

## 検証とマッピング

### Validate

```go
func Validate() error
```

必須キーが存在するか検証します。Config で RequiredKeys を設定する必要があります。

**戻り値：**
- `error` - 検証エラー

```go
// RequiredKeys を設定する必要がある（カスタムローダー経由）
cfg := env.ProductionConfig()
cfg.RequiredKeys = []string{"DB_HOST", "API_KEY"}

loader, _ := env.New(cfg)
loader.LoadFiles(".env")

if err := loader.Validate(); err != nil {
    // 必須キーが不足
}
```

---

### ParseInto

```go
func ParseInto(v any) error
```

環境変数を構造体にマッピングします。

**パラメータ：**
- `v` - 構造体ポインタ

**戻り値：**
- `error` - マッピングエラー

```go
type Config struct {
    Host string `env:"HOST" envDefault:"localhost"`
    Port int64  `env:"PORT" envDefault:"8080"`
}

var cfg Config
if err := env.ParseInto(&cfg); err != nil {
    panic(err)
}
```

**構造体タグ：**
| タグ | 説明 |
|------|------|
| `env:"KEY"` | 指定キーにマッピング |
| `env:"-"` | このフィールドを無視 |
| `envDefault:"value"` | デフォルト値 |

スライスフィールドはデフォルトでカンマ `,` で区切られ（セパレータ前後の空白は自動削除）、カスタムセパレータタグはありません。

::: tip 詳細
[構造体マッピング](/ja/env/guides/struct-mapping) で完全なガイドを参照してください。
:::

---

## ユーティリティ関数

### ResetDefaultLoader

```go
func ResetDefaultLoader() error
```

グローバルデフォルトローダーをリセットします。主にテストシーンで使用されます。

**戻り値：**
- `error` - 旧ローダーをクローズするエラー（存在する場合）；以前ローダーがないかクローズ成功の場合は nil

**動作：**
- `defaultMu.Lock()` でロック後、`defaultLoader.Swap(nil)` でデフォルトローダーを原子的に nil と交換し、即座にロックを解放
- ロック**外**で旧ローダーをクローズ（ロック保持状態で時間のかかるクリーンアップを実行し、`Close()` がデフォルトローダーを必要とするコードをトリガーした際のデッドロックを防止）
- リセット後 `Load()` または `LoadWithConfig()` で新しいデフォルトローダーを作成可能

```go
func TestMain(m *testing.M) {
    if err := env.ResetDefaultLoader(); err != nil {
        log.Printf("warning: failed to reset loader: %v", err)
    }
    os.Exit(m.Run())
}

func TestSomething(t *testing.T) {
    if err := env.ResetDefaultLoader(); err != nil {
        t.Logf("warning: %v", err)
    }
    defer env.ResetDefaultLoader()
    // ... テストコード
}
```

::: warning 注意
この関数は並行セーフですが、予期しない動作を避けるためテストまたは起動時にのみ呼び出してください。
:::

---

### LoadWithConfig

```go
func LoadWithConfig(cfg Config) error
```

カスタム設定でデフォルトローダーを初期化します。

**パラメータ：**
- `cfg` - カスタム設定

**戻り値：**
- `error` - 初期化エラー

**動作：**
- パッケージレベルデフォルトローダーを設定（`GetString`、`GetInt` などの関数が使用）
- `AutoApply = true` を**強制**（cfg の設定に関わらず）
- デフォルトローダーが初期化済みの場合 `ErrAlreadyInitialized` を返す

**Load との違い：**
- `Load()` - ファイル名リストのみ受け取り、デフォルト設定を使用
- `LoadWithConfig()` - 完全な Config を受け取り、すべての設定オプションをサポート

```go
cfg := env.DefaultConfig()
cfg.Filenames = []string{".env.production"}
cfg.OverwriteExisting = true
if err := env.LoadWithConfig(cfg); err != nil {
    log.Fatal(err)
}
// パッケージレベル関数が使用可能に
port := env.GetInt("PORT", 8080)
```

::: warning 注意
この関数は `cfg.AutoApply` を強制的に `true` にし、変数がシステム環境に適用されることを保証します。適用タイミングを制御する必要がある場合は `New()` で独立インスタンスを作成してください。
:::

---

## シリアライズ関数

### Marshal

```go
func Marshal(data any, format ...FileFormat) (string, error)
```

データを指定フォーマットの文字列にシリアライズします。`map[string]string` または構造体を入力としてサポートします。

**インターフェース統合：** 入力型が `Marshaler` インターフェースを実装している場合、`MarshalEnv()` メソッドを優先的に呼び出してシリアライズします。

**パラメータ：**
- `data` - シリアライズするデータ（map または構造体）
- `format` - オプションのフォーマット、デフォルト `FormatEnv`

**戻り値：**
- `string` - シリアライズ後の文字列（キーはソート済み）
- `error` - シリアライズエラー

**サポートフォーマット：**
- `FormatEnv` (デフォルト) - .env フォーマット
- `FormatJSON` - JSON フォーマット
- `FormatYAML` - YAML フォーマット

```go
// map を .env フォーマットに変換
mapData := map[string]string{"HOST": "localhost", "PORT": "8080"}
envStr, _ := env.Marshal(mapData)
// HOST=localhost
// PORT=8080

// map を JSON フォーマットに変換（数値文字列は数値として出力、キーはアルファベット順）
jsonStr, _ := env.Marshal(mapData, env.FormatJSON)
// {
//   "HOST": "localhost",
//   "PORT": 8080
// }

// 構造体を .env フォーマットに変換
type Config struct {
    Host string `env:"HOST"`
    Port string `env:"PORT"`
}
envStr, _ := env.Marshal(Config{Host: "localhost", Port: "8080"})
```

---

### UnmarshalMap

```go
func UnmarshalMap(data string, format ...FileFormat) (map[string]string, error)
```

フォーマット文字列を map に解析します。自動フォーマット検出をサポートします。

**パラメータ：**
- `data` - フォーマット文字列
- `format` - オプションのフォーマット、デフォルト `FormatEnv`；`FormatAuto` で自動検出

**戻り値：**
- `map[string]string` - 解析後のキーと値のペア
- `error` - 解析エラー

```go
// .env フォーマット
m, _ := env.UnmarshalMap("HOST=localhost\nPORT=8080")

// JSON フォーマット（ネスト構造はフラット化される）
m, _ := env.UnmarshalMap(`{"database": {"host": "localhost"}}`, env.FormatJSON)
// m["DATABASE_HOST"] = "localhost"

// フォーマット自動検出
m, _ := env.UnmarshalMap(jsonString, env.FormatAuto)
```

---

### UnmarshalStruct

```go
func UnmarshalStruct(data string, v any, format ...FileFormat) error
```

フォーマット文字列を解析して構造体に格納します。

**パラメータ：**
- `data` - フォーマット文字列
- `v` - 構造体ポインタ
- `format` - オプションのフォーマット、デフォルト `FormatEnv`

**戻り値：**
- `error` - 解析エラー

```go
type Config struct {
    Host string `env:"SERVER_HOST"`
    Port int    `env:"SERVER_PORT"`
}

var cfg Config
err := env.UnmarshalStruct("SERVER_HOST=localhost\nSERVER_PORT=8080", &cfg)
// cfg.Host = "localhost", cfg.Port = 8080

// JSON から解析
err = env.UnmarshalStruct(`{"server": {"host": "localhost"}}`, &cfg, env.FormatJSON)
```

---

### UnmarshalInto

```go
func UnmarshalInto(data map[string]string, v any) error
```

map を構造体に格納します。`env` と `envDefault` タグをサポートします。

**インターフェース統合：** 対象の型が `Unmarshaler` インターフェースを実装している場合、`UnmarshalEnv(data)` メソッドを優先的に呼び出します。

**パラメータ：**
- `data` - キーと値のペアのマッピング
- `v` - 構造体ポインタ

**戻り値：**
- `error` - 格納エラー

```go
type Config struct {
    Host string `env:"HOST" envDefault:"localhost"`
    Port int    `env:"PORT" envDefault:"8080"`
}

data := map[string]string{"HOST": "example.com"}
var cfg Config
err := env.UnmarshalInto(data, &cfg)
// cfg.Host = "example.com", cfg.Port = 8080 (デフォルト値を使用)
```

---

### MarshalStruct

```go
func MarshalStruct(v any) (map[string]string, error)
```

構造体を map に変換します。`env` タグでキー名を指定します。

**インターフェース統合：** 入力型が `Marshaler` インターフェースを実装している場合、`MarshalEnv()` メソッドを優先的に呼び出します。

**パラメータ：**
- `v` - 構造体または構造体ポインタ

**戻り値：**
- `map[string]string` - キーと値のペアのマッピング
- `error` - 変換エラー

```go
type Config struct {
    Host string `env:"SERVER_HOST"`
    Port int    `env:"SERVER_PORT"`
}

cfg := Config{Host: "localhost", Port: 8080}
m, _ := env.MarshalStruct(cfg)
// m["SERVER_HOST"] = "localhost"
// m["SERVER_PORT"] = "8080"
```

---

### IsMarshalError

```go
func IsMarshalError(err error) bool
```

エラーがシリアライズ/デシリアライズエラーかチェックします。

**パラメータ：**
- `err` - チェックするエラー

**戻り値：**
- `bool` - MarshalError 型か

```go
_, err := env.MarshalStruct(invalidData)
if env.IsMarshalError(err) {
    // シリアライズエラーを処理
}
```

---

## 完全な例

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/env"
)

type AppConfig struct {
    Host     string        `env:"APP_HOST" envDefault:"0.0.0.0"`
    Port     int64         `env:"APP_PORT" envDefault:"8080"`
    Debug    bool          `env:"DEBUG" envDefault:"false"`
    Timeout  time.Duration `env:"TIMEOUT" envDefault:"30s"`
    Hosts    []string      `env:"HOSTS"`
}

func main() {
    // 設定ファイルを読み込み
    if err := env.Load(".env"); err != nil {
        log.Printf("Warning: %v", err)
    }

    // 個別の値を読み取り
    host := env.GetString("APP_HOST", "localhost")
    port := env.GetInt("APP_PORT", 8080)
    debug := env.GetBool("DEBUG", false)
    timeout := env.GetDuration("TIMEOUT", 30*time.Second)

    fmt.Printf("Server: %s:%d\n", host, port)
    fmt.Printf("Debug: %v, Timeout: %v\n", debug, timeout)

    // 機密データ
    secret := env.GetSecure("API_KEY")
    if secret != nil {
        defer secret.Release()
        fmt.Printf("API Key length: %d\n", secret.Length())
    }

    // 構造体マッピング
    var cfg AppConfig
    if err := env.ParseInto(&cfg); err != nil {
        log.Fatal(err)
    }
    fmt.Printf("Config: %+v\n", cfg)

    // すべての変数
    fmt.Printf("Loaded %d variables\n", env.Len())
}
```

## 関連ドキュメント

- [Loader API](/ja/env/api-reference/loader) - Loader インスタンスメソッド
- [Config API](/ja/env/api-reference/config) - 設定オプション
- [SecureValue API](/ja/env/api-reference/secure-value) - セキュア値の処理
- [構造体マッピング](/ja/env/guides/struct-mapping) - 構造体マッピングガイド
