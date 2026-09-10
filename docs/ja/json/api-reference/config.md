---
sidebar_label: "Config"
title: "Config 設定 - CyberGo JSON | API リファレンス"
description: "CyberGo JSON Config 設定：DefaultConfig 既定値、SecurityConfig セキュリティ、PrettyConfig 整形とキャッシュ、サイズ上限、エンコード、JSONL パラメータ、Validate 自動修正、MergeMode マージ戦略で Go の JSON 動作を調整します。"
sidebar_position: 4
---

# Config

Config は Processor とすべての JSON 操作の動作をカスタマイズするために使用します。

## Config 構造体

```go
type Config struct {
    // ===== キャッシュ設定 =====
    MaxCacheSize int           `json:"max_cache_size"` // 最大キャッシュエントリ数
    CacheTTL     time.Duration `json:"cache_ttl"`      // キャッシュ有効期限
    EnableCache  bool          `json:"enable_cache"`   // キャッシュを有効にするか
    CacheResults bool          `json:"cache_results"`  // 操作結果をキャッシュするか
    CacheSharedResults bool `json:"cache_shared_results"` // キャッシュ結果の共有（防御的ディープコピーをスキップ、呼び出し側は返されたコンテナを変更してはならない）

    // ===== サイズ制限 =====
    MaxJSONSize  int64 `json:"max_json_size"`  // 最大 JSON サイズ（バイト）
    MaxPathDepth int   `json:"max_path_depth"` // 最大パス深度
    MaxBatchSize int   `json:"max_batch_size"` // 最大バッチ操作数

    // ===== セキュリティ制限 =====
    MaxNestingDepthSecurity   int   `json:"max_nesting_depth"`           // 最大ネスト深度
    MaxSecurityValidationSize int64 `json:"max_security_validation_size"` // セキュリティ検証の最大サイズ
    MaxObjectKeys             int   `json:"max_object_keys"`             // オブジェクトの最大キー数
    MaxArrayElements          int   `json:"max_array_elements"`          // 配列の最大要素数
    FullSecurityScan          bool  `json:"full_security_scan"`          // 完全セキュリティスキャンを有効化

    // ===== 並行 =====
    MaxConcurrency    int `json:"max_concurrency"`    // 最大並行数
    ParallelThreshold int `json:"parallel_threshold"` // 並列処理しきい値

    // ===== 処理オプション =====
    EnableValidation bool `json:"enable_validation"` // 検証を有効化
    StrictMode       bool `json:"strict_mode"`       // 厳格モード
    CreatePaths      bool `json:"create_paths"`      // パスの自動作成
    CleanupNulls     bool `json:"cleanup_nulls"`     // null 値のクリーンアップ
    CompactArrays    bool `json:"compact_arrays"`    // 配列の圧縮
    ContinueOnError  bool `json:"continue_on_error"` // バッチ操作でエラー時も継続

    // ===== 入力/出力オプション =====
    AllowComments    bool `json:"allow_comments"`     // コメントを許可
    PreserveNumbers  bool `json:"preserve_numbers"`   // 数値精度を保持
    ValidateInput    bool `json:"validate_input"`     // 入力を検証
    ValidateFilePath bool `json:"validate_file_path"` // ファイルパスを検証
    SkipValidation   bool `json:"skip_validation"`    // 検証をスキップ（信頼された入力）

    // ===== エンコードオプション =====
    Pretty          bool            `json:"pretty"`           // 整形出力
    Indent          string          `json:"indent"`           // インデント文字列
    Prefix          string          `json:"prefix"`           // プレフィックス
    EscapeHTML      bool            `json:"escape_html"`      // HTML エスケープ
    SortKeys        bool            `json:"sort_keys"`        // キーのソート
    ValidateUTF8    bool            `json:"validate_utf8"`    // UTF-8 検証
    MaxDepth        int             `json:"max_depth"`        // 最大エンコード深度
    DisallowUnknown bool            `json:"disallow_unknown"` // 未知フィールドを禁止
    FloatPrecision  int             `json:"float_precision"`  // 浮動小数点精度（-1 は自動）
    FloatTruncate   bool            `json:"float_truncate"`   // 浮動小数点数の切り捨て
    DisableEscaping bool            `json:"disable_escaping"` // エスケープを無効化
    EscapeUnicode   bool            `json:"escape_unicode"`   // Unicode エスケープ
    EscapeSlash     bool            `json:"escape_slash"`     // スラッシュのエスケープ
    EscapeNewlines  bool            `json:"escape_newlines"`  // 改行文字のエスケープ
    EscapeTabs      bool            `json:"escape_tabs"`      // タブ文字のエスケープ
    IncludeNulls    bool            `json:"include_nulls"`    // null 値を含める
    CustomEscapes   map[rune]string `json:"custom_escapes,omitempty"` // カスタムエスケープマップ

    // ===== オブザーバビリティ =====
    EnableMetrics     bool `json:"enable_metrics"`      // メトリクス収集を有効化
    EnableHealthCheck bool `json:"enable_health_check"` // ヘルスチェックを有効化

    // ===== 大規模ファイル処理 =====
    ChunkSize       int64 `json:"chunk_size"`       // チャンクサイズ
    MaxMemory       int64 `json:"max_memory"`       // 最大メモリ使用量
    BufferSize      int   `json:"buffer_size"`      // バッファサイズ
    SamplingEnabled bool  `json:"sampling_enabled"` // サンプリングを有効化
    SampleSize      int   `json:"sample_size"`      // サンプリング数

    // ===== JSONL 設定 =====
    JSONLBufferSize    int   `json:"jsonl_buffer_size"`     // JSONL バッファサイズ
    JSONLMaxLineSize   int   `json:"jsonl_max_line_size"`   // JSONL 最大行サイズ
    JSONLSkipEmpty     bool  `json:"jsonl_skip_empty"`      // 空行をスキップ
    JSONLSkipComments  bool  `json:"jsonl_skip_comments"`   // コメント行をスキップ
    JSONLContinueOnErr bool  `json:"jsonl_continue_on_err"` // エラー時に継続
    JSONLWorkers       int   `json:"jsonl_workers"`         // JSONL 並列ワーカー数
    JSONLChunkSize     int   `json:"jsonl_chunk_size"`      // JSONL チャンクサイズ
    JSONLMaxMemory     int64 `json:"jsonl_max_memory"`      // JSONL 最大メモリ

    // ===== マージオプション =====
    MergeMode MergeMode `json:"merge_mode"` // マージ戦略

    // ===== 拡張ポイント（JSON tag なし、シリアライズに参加しない） =====
    CustomEncoder               CustomEncoder                // カスタムエンコーダ
    CustomTypeEncoders          map[reflect.Type]TypeEncoder // カスタム型エンコーダ
    CustomValidators            []Validator                  // カスタムバリデータ
    AdditionalDangerousPatterns []DangerousPattern           // 追加の危険パターン
    DisableDefaultPatterns      bool                         // デフォルト警告レベルパターンを無効化
    Hooks                       []Hook                       // 操作フック
    CustomPathParser            PathParser                   // カスタムパスパーサー
}
```

::: warning CacheSharedResults の契約
`CacheSharedResults` が `true` の場合、キャッシュヒットした `Get`/`GetFromParsed` は**キャッシュ値を直接返し**、防御的ディープコピーをスキップします（より高速、より少ない割り当て）。このとき**呼び出し側は**返された `map[string]any`/`[]any` を**変更してはならず**、そうしないと共有キャッシュが破壊され、後続の読み取りに影響します。プリミティブ値（`bool`、`float64`、`string`、`json.Number`、`nil`）はイミュータブルなので常に安全です。デフォルトの `false` は安全な「読み取り時コピー」動作を維持します。呼び出し側が結果を読み取り専用とみなせる場合にのみ有効にしてください（例：同じ大型サブツリーを繰り返し読み取る読み取り専用ワークロード）。
:::

::: warning 拡張フィールドの接続状況
`CustomEncoder`、`CustomTypeEncoders`、`CustomValidators`、`CustomPathParser` の 4 つのインターフェースフィールドは現バージョンでは宣言済みですが、エンコード/操作パイプラインには**まだ接続されていません**。設定しても効果はなく、将来のバージョン用に予約されたインターフェースです（`CustomPathParser` はプロセッサのキャッシュキーの「設定されているか」判定には参加していますが、パス解析自体は引き続き組み込みパーサーを使用します）。現時点で利用できる代替手段：

- エンコード動作の微調整 → `CustomEscapes`（**有効**、下記のエンコードオプションを参照）または `json.Marshaler`/`encoding.TextMarshaler` の実装（[カスタムエンコーダ](../extensions/custom-encoder)を参照）
- 操作のインターセプト → `Hooks` + `AddHook`（**有効**、[Hook フックシステム](../extensions/hooks)を参照）
- 入力検証 → `ValidateSchema`（[Schema 検証](./schema)を参照）
:::

## Config フィールド一覧

`Config` には合計 66 のエクスポート済みフィールドがあり、用途別に以下のようにグループ化されています。デフォルト値は [`DefaultConfig()`](#defaultconfig) から、フィールドの有効範囲と自動修正ルールは[クランプ範囲早見表](#validatewithwarnings)を参照してください。

### キャッシュ

| フィールド | 型 | デフォルト値 | 説明 |
|------|------|------|------|
| `MaxCacheSize` | `int` | 128 | 最大キャッシュエントリ数（0 はキャッシュ無効を表す） |
| `CacheTTL` | `time.Duration` | 5 分 | キャッシュエントリの生存時間 |
| `EnableCache` | `bool` | true | キャッシュを有効にするか |
| `CacheResults` | `bool` | true | 操作結果をキャッシュするか（操作単位でキャッシュ） |
| `CacheSharedResults` | `bool` | false | キャッシュヒット時に共有値を直接返し、防御的ディープコピーをスキップ。呼び出し側は返されたコンテナを変更してはならない（契約は上記の警告を参照） |

### サイズ制限

| フィールド | 型 | デフォルト値 | 説明 |
|------|------|------|------|
| `MaxJSONSize` | `int64` | 100MB | 最大 JSON 入力サイズ（バイト） |
| `MaxPathDepth` | `int` | 50 | 最大パス深度 |
| `MaxBatchSize` | `int` | 2000 | 単一バッチの操作数上限（超過すると拒否され、メモリ枯渇を防止） |

### セキュリティ制限

| フィールド | 型 | デフォルト値 | 説明 |
|------|------|------|------|
| `MaxNestingDepthSecurity` | `int` | 200 | 最大ネスト深度 |
| `MaxSecurityValidationSize` | `int64` | 10MB | セキュリティ検証の最大サイズ（超過後はサンプリング方式でスキャン。ただし `FullSecurityScan` が true の場合を除く） |
| `MaxObjectKeys` | `int` | 100000 | 単一オブジェクトの最大キー数 |
| `MaxArrayElements` | `int` | 100000 | 単一配列の最大要素数 |
| `FullSecurityScan` | `bool` | false | true の場合はすべての入力に全量（非サンプリング）セキュリティスキャンを実施。false の場合は大入力（>4KB）にローリングウィンドウ + サンプリングスキャンを使用し、重要パターン（`__proto__` など）は引き続き全量スキャン |

### 並行

| フィールド | 型 | デフォルト値 | 説明 |
|------|------|------|------|
| `MaxConcurrency` | `int` | 50 | 最大並行数 |
| `ParallelThreshold` | `int` | 10 | 並列処理しきい値（この要素数未満では逐次処理にフォールバック） |

### 処理オプション

| フィールド | 型 | デフォルト値 | 説明 |
|------|------|------|------|
| `EnableValidation` | `bool` | true | 入力検証を有効化 |
| `StrictMode` | `bool` | false | 厳格モード（より保守的な解析とインターセプト） |
| `CreatePaths` | `bool` | true | Set 時に欠けた中間パスを自動作成 |
| `CleanupNulls` | `bool` | false | null 値をクリーンアップ |
| `CompactArrays` | `bool` | false | 配列を圧縮 |
| `ContinueOnError` | `bool` | false | バッチ操作で項目単位のエラーが発生しても継続 |

### 入力/出力オプション

| フィールド | 型 | デフォルト値 | 説明 |
|------|------|------|------|
| `AllowComments` | `bool` | false | コメントを許可（予約フィールド、現在は動作を変更しない） |
| `PreserveNumbers` | `bool` | false | デコード時に数値リテラルを保持（`1.10` は `1.1` にならない）、エンコード時にそのまま書き戻し |
| `ValidateInput` | `bool` | true | 入力 JSON を検証 |
| `ValidateFilePath` | `bool` | true | ファイルパスを検証 |
| `SkipValidation` | `bool` | false | 必須でない検証をスキップ（信頼された入力専用） |

### エンコードオプション

| フィールド | 型 | デフォルト値 | 説明 |
|------|------|------|------|
| `Pretty` | `bool` | false | 整形出力 |
| `Indent` | `string` | "  "（2 つのスペース） | インデント文字列 |
| `Prefix` | `string` | ""（空） | 各行のプレフィックス |
| `EscapeHTML` | `bool` | true | HTML 文字エスケープ（`<` `>` `&`） |
| `SortKeys` | `bool` | false | オブジェクトキーをソートして出力 |
| `ValidateUTF8` | `bool` | true | UTF-8 検証（予約フィールド、現在は動作を変更しない） |
| `MaxDepth` | `int` | 100 | エンコード最大深度（0 は無制限） |
| `DisallowUnknown` | `bool` | false | デコード時に未知フィールドを禁止（`Decoder.DisallowUnknownFields()` と等価） |
| `FloatPrecision` | `int` | -1 | 浮動小数点精度（-1 は自動、0–15 は明示的な精度） |
| `FloatTruncate` | `bool` | false | 精度が有効なとき四捨五入ではなく直接切り捨て |
| `DisableEscaping` | `bool` | false | エスケープロジックを無効化（完全に管理された出力でのみ使用） |
| `EscapeUnicode` | `bool` | false | 非 ASCII 文字を `\uXXXX` に変換 |
| `EscapeSlash` | `bool` | false | `/` を `\/` にエスケープ |
| `EscapeNewlines` | `bool` | true | 改行文字をエスケープ |
| `EscapeTabs` | `bool` | true | タブ文字をエスケープ |
| `IncludeNulls` | `bool` | true | エンコード時に値が null のフィールドを含める |
| `CustomEscapes` | `map[rune]string` | nil | カスタム文字エスケープマップ |

### オブザーバビリティ

| フィールド | 型 | デフォルト値 | 説明 |
|------|------|------|------|
| `EnableMetrics` | `bool` | false | メトリクス収集を有効化（`GetStats` / `GetHealthStatus` にデータが入る） |
| `EnableHealthCheck` | `bool` | false | ヘルスチェックを有効化（予約フィールド、現在は動作を変更しない） |

### 大規模ファイル処理（サンプリングとストリーミング）

| フィールド | 型 | デフォルト値 | 説明 |
|------|------|------|------|
| `ChunkSize` | `int64` | 1MB | 大規模ファイルのチャンクサイズ |
| `MaxMemory` | `int64` | 100MB | 大規模ファイル処理の最大メモリ |
| `BufferSize` | `int` | 64KB | 大規模ファイル読み取りバッファサイズ |
| `SamplingEnabled` | `bool` | true | サンプリングを有効化（予約フィールド、現在は動作を変更しない） |
| `SampleSize` | `int` | 1000 | サンプリング数 |

### JSONL 設定

| フィールド | 型 | デフォルト値 | 説明 |
|------|------|------|------|
| `JSONLBufferSize` | `int` | 64KB | JSONL 読み取りバッファサイズ |
| `JSONLMaxLineSize` | `int` | 1MB | JSONL 単行の最大サイズ |
| `JSONLSkipEmpty` | `bool` | true | 空行をスキップ |
| `JSONLSkipComments` | `bool` | false | `#` / `//` コメント行をスキップ |
| `JSONLContinueOnErr` | `bool` | false | 解析エラー時に後続行の処理を継続 |
| `JSONLWorkers` | `int` | 4 | JSONL 並列ワーカー数 |
| `JSONLChunkSize` | `int` | 1000 | バッチ処理のチャンクサイズ（行数） |
| `JSONLMaxMemory` | `int64` | 100MB | JSONL 処理の最大メモリ |

### マージオプション

| フィールド | 型 | デフォルト値 | 説明 |
|------|------|------|------|
| `MergeMode` | `MergeMode` | MergeUnion | `MergeJSON` / `MergeMany` のマージ戦略（[マージモード](#マージモード)を参照） |

### 拡張ポイント

以下のフィールドには JSON tag がなく、シリアライズに参加しません。接続状況は上記の警告を参照してください。

| フィールド | 型 | デフォルト値 | 説明 |
|------|------|------|------|
| `CustomEncoder` | `CustomEncoder` | nil | カスタムエンコーダ。デフォルトエンコーダを置き換える（予約） |
| `CustomTypeEncoders` | `map[reflect.Type]TypeEncoder` | nil | Go 型ごとに登録するエンコーダ（予約） |
| `CustomValidators` | `[]Validator` | nil | 操作前に実行するカスタムバリデータ（予約） |
| `AdditionalDangerousPatterns` | `[]DangerousPattern` | nil | 内蔵パターンに追加する危険パターン |
| `DisableDefaultPatterns` | `bool` | false | 内蔵警告レベルパターンを無効化（重要パターンは常に強制で、無効化不可） |
| `Hooks` | `[]Hook` | nil | 操作前後のフック（有効） |
| `CustomPathParser` | `PathParser` | nil | カスタムパスパーサー（予約） |

## エンコードオプション詳解

エンコードオプション（`Pretty`/`Indent`/`EscapeHTML`/`SortKeys`/`FloatPrecision` など）は `Marshal`/`Encode` 系の出力形態を制御します。デフォルト値は標準ライブラリに揃えています（例：`EscapeHTML: true`、`IncludeNulls: true`）。いずれかの「非デフォルト」エンコードオプションが設定されると、ライブラリ内部は自動的にカスタムエンコーダパスに切り替わり、要件を満たします。手動での介入は不要です。

### キーのソート（SortKeys）

```go
cfg := json.DefaultConfig()
cfg.SortKeys = true
s, _ := json.EncodeWithConfig(map[string]any{"b": 2, "a": 1}, cfg)
// 出力: {"a":1,"b":2} — 出力キー順が安定し、比較とテストが容易
```

### 浮動小数点精度（FloatPrecision / FloatTruncate）

```go
cfg := json.DefaultConfig()
cfg.FloatPrecision = 2 // -1（デフォルト）= 自動精度
s, _ := json.EncodeWithConfig(3.14159265, cfg)
// 出力: 3.14
```

`FloatTruncate` は `FloatPrecision` が有効なときの丸め方式を制御します：デフォルト（`false`）は標準の四捨五入。`true` にすると**直接切り捨て**に変わります——`3.999` は精度 2 で `3.99` と出力されます（四捨五入なら `4.00`）。`FloatPrecision >= 0` のときのみエンコードに参加します。

### カスタム文字エスケープ（CustomEscapes）

```go
cfg := json.DefaultConfig()
cfg.CustomEscapes = map[rune]string{
    '<': "&lt;",
}
s, _ := json.EncodeWithConfig("<a>", cfg)
// 出力: "&lt;a>"
```

### 主要スイッチ早見表

| オプション | デフォルト | 反転/true 後の効果 |
|------|------|-------------------|
| `EscapeHTML` | `true` | `false` で `<` `>` `&` をエスケープしない |
| `EscapeUnicode` | `false` | `true` で非 ASCII 文字を `\uXXXX` に変換 |
| `EscapeSlash` | `false` | `true` で `/` を `\/` にエスケープ |
| `EscapeNewlines` / `EscapeTabs` | `true` | `false` で制御文字をそのまま出力（JSONL 向けテキスト生成時は注意） |
| `DisableEscaping` | `false` | `true` でエスケープ処理をスキップ（完全に管理された出力でのみ使用） |
| `IncludeNulls` | `true` | `false` で値が `null` のフィールドをエンコード時に省略 |
| `PreserveNumbers` | `false` | `true` でデコード時に数値リテラルを保持（`1.10` は `1.1` にならない）、エンコード時にそのまま書き戻し |

## 入力とオブザーバビリティのスイッチ

以下のフィールドはデコードの厳格さと実行時観測を制御します（デフォルト値は [`DefaultConfig`](#defaultconfig) を参照）：

| フィールド | デフォルト | 適用範囲 | 説明 |
|------|------|----------|------|
| `DisallowUnknown` | `false` | `NewDecoder(r, cfg)` | `true` の場合、返された Decoder に対して `DisallowUnknownFields()` を呼び出すのと等価。デコード時に未知フィールドがあるとエラー |
| `ValidateUTF8` | `true` | 予約 | 現在は動作を変更しない（下記の説明を参照） |
| `AllowComments` | `false` | 予約 | 現在は動作を変更しない（下記の説明を参照） |
| `EnableMetrics` | `false` | `New(cfg)` 構築時 | `true` の場合、メトリクスコレクターを作成。`GetStats` の操作/エラーカウントと `GetHealthStatus` の各チェックにデータが入る |
| `EnableHealthCheck` | `false` | 予約 | 現在は動作を変更しない（下記の説明を参照） |
| `SamplingEnabled` | `true` | 予約 | 現在は動作を変更しない（下記の説明を参照） |

::: warning 予約フィールドの説明
`AllowComments`、`ValidateUTF8`、`EnableHealthCheck`、`SamplingEnabled` の 4 フィールドは宣言済みで、設定比較とハッシュに参加します（そのため異なる cfg に対応するプロセッサキャッシュは区別されます）が、現バージョンでは**対応するパイプラインで読み取られておらず**、設定しても動作は変わりません：

- `AllowComments`：解析が `//` や `#` コメントを受け入れるようにはなりません。JSONL ファイルのコメント行は `JSONLSkipComments` で個別に制御されます。
- `ValidateUTF8`：入力側での無効 UTF-8 の拒否はセキュリティ検証の無条件動作で、出力側は標準ライブラリのセマンティクスに従い、いずれもこのスイッチの影響を受けません。
- `EnableHealthCheck`：ヘルスチェックは `GetHealthStatus` でオンデマンドに取得でき、データの有無は `EnableMetrics` に依存します（[ライフサイクルと統計](./processor/lifecycle#ヘルスチェック)を参照）。
- `SamplingEnabled`：大入力のセキュリティスキャンをサンプリングするかは `FullSecurityScan` と `MaxSecurityValidationSize` で決まります。
:::

## 設定プリセット

### DefaultConfig

シグネチャ：`func DefaultConfig() Config`

デフォルト設定を返します。ほとんどのシナリオに適しています。

```go
cfg := json.DefaultConfig()
processor, err := json.New(cfg)
if err != nil {
    panic(err)
}
defer processor.Close()
```

**デフォルト値**

| フィールド | 値 | 説明 |
|------|-----|------|
| MaxJSONSize | 100MB | JSON サイズ制限 |
| MaxNestingDepthSecurity | 200 | ネスト深度 |
| MaxPathDepth | 50 | パス深度 |
| MaxSecurityValidationSize | 10MB | セキュリティ検証サイズ上限 |
| MaxObjectKeys | 100000 | オブジェクト最大キー数 |
| MaxArrayElements | 100000 | 配列最大要素数 |
| MaxConcurrency | 50 | 並行数 |
| ParallelThreshold | 10 | この要素数未満では逐次処理にフォールバック |
| MaxBatchSize | 2000 | バッチ操作数 |
| CacheTTL | 5 分 | キャッシュ有効期限 |
| MaxCacheSize | 128 | 最大キャッシュエントリ数 |
| EnableCache | true | キャッシュを有効化 |
| CacheResults | true | 操作結果をキャッシュ |
| CacheSharedResults | false | キャッシュ結果の共有（高性能読み取り専用シナリオ） |
| EnableValidation | true | 検証を有効化 |
| StrictMode | false | 非厳格モード |
| FullSecurityScan | false | サンプリングセキュリティスキャン（全量ではない） |
| ValidateInput | true | 入力を検証 |
| ValidateFilePath | true | ファイルパスを検証 |
| CreatePaths | true | パスを自動作成 |
| Pretty | false | 整形出力しない |
| EscapeHTML | true | HTML エスケープ |
| ValidateUTF8 | true | UTF-8 検証 |
| IncludeNulls | true | null を含める |
| EscapeNewlines | true | 改行文字のエスケープ |
| EscapeTabs | true | タブ文字のエスケープ |
| FloatPrecision | -1 | 自動精度 |
| MaxDepth | 100 | エンコード深度 |
| Indent | "  " | デフォルトインデント |
| ChunkSize | 1MB | チャンクサイズ |
| MaxMemory | 100MB | 最大メモリ |
| BufferSize | 64KB | バッファサイズ |
| SamplingEnabled | true | サンプリングを有効化 |
| SampleSize | 1000 | サンプリング数 |
| JSONLBufferSize | 64KB | JSONL バッファサイズ |
| JSONLMaxLineSize | 1MB | JSONL 最大行サイズ |
| JSONLSkipEmpty | true | 空行をスキップ |
| JSONLSkipComments | false | コメントをスキップしない |
| JSONLContinueOnErr | false | エラー時に停止 |
| JSONLWorkers | 4 | 並列ワーカー数 |
| JSONLChunkSize | 1000 | JSONL チャンクサイズ |
| JSONLMaxMemory | 100MB | JSONL 最大メモリ |
| MergeMode | MergeUnion | ユニオンマージ |

### SecurityConfig

シグネチャ：`func SecurityConfig() Config`

セキュリティ設定を返します。信頼できない入力の処理に適しています。

```go
// 以下に推奨：
// - パブリック API と Web サービス
// - ユーザーが送信したデータ
// - 外部 Webhook
// - 認証エンドポイント
// - 金融データ処理
cfg := json.SecurityConfig()
processor, err := json.New(cfg)
if err != nil {
    panic(err)
}
defer processor.Close()
```

**セキュリティ設定の特徴**

| フィールド | 値 | 説明 |
|------|-----|------|
| MaxNestingDepthSecurity | 30 | 控えめなネスト深度 |
| MaxSecurityValidationSize | 10MB | セキュリティ検証サイズ |
| MaxObjectKeys | 5000 | 控えめなキー数制限 |
| MaxArrayElements | 5000 | 控えめな要素数制限 |
| MaxJSONSize | 10MB | 控えめなサイズ制限 |
| MaxPathDepth | 30 | 控えめなパス深度 |
| FullSecurityScan | true | 完全セキュリティスキャン |
| StrictMode | true | 厳格モード |
| EnableValidation | true | 検証を有効化 |
| EnableCache | true | キャッシュを有効化 |
| MaxCacheSize | 256 | キャッシュサイズ |
| CacheTTL | 3 分 | 短めの TTL |

### PrettyConfig

シグネチャ：`func PrettyConfig() Config`

整形出力設定を返します。

```go
result, err := json.EncodeWithConfig(data, json.PrettyConfig())
```

## 設定メソッド

### Clone

シグネチャ：`func (c *Config) Clone() *Config`

設定をディープコピーします（`Config.Clone` は新しい `*Config` を返し、コピーを変更しても元の設定に影響しません）。値フィールドは逐一コピーされます。参照フィールドのうち `CustomEscapes`、`CustomTypeEncoders` の 2 つの map と `CustomValidators`、`AdditionalDangerousPatterns`、`Hooks` の 3 つのスライスはディープコピーされ、独立して変更できます。インターフェースフィールド（`CustomEncoder`、`CustomPathParser`）はシャローコピーです（通常はステートレスかシングルトン実装）。nil Config での呼び出しは nil を返します。

```go
cfg := json.DefaultConfig()
cfgCopy := cfg.Clone()
cfgCopy.EnableValidation = true // 元の設定に影響しない
```

### Validate

シグネチャ：`func (c *Config) Validate() error`

設定を検証し、無効な値を自動修正します。このメソッドは Config を**インプレースで変更**し、不正なフィールドを有効範囲内に修正します：小さすぎる（≤0）場合は最小値、大きすぎる（上限超過）場合は最大値を採用します。nil Config での呼び出しはエラーを返します。修正後は常に nil を返します——何が修正されたかを確認するには `ValidateWithWarnings` を使ってください。

```go
cfg := json.DefaultConfig()
cfg.MaxJSONSize = -1 // 無効な値
if err := cfg.Validate(); err != nil {
    panic(err)
}
// MaxJSONSize はインプレースで最小値に修正される
```

### ValidateWithWarnings

シグネチャ：`func (c *Config) ValidateWithWarnings() []ConfigWarning`

設定を検証し、修正警告のリストを返します。

```go
cfg := json.DefaultConfig()
cfg.MaxJSONSize = -1
warnings := cfg.ValidateWithWarnings()
for _, w := range warnings {
    fmt.Printf("%s: %s\n", w.Field, w.Reason)
}
```

**クランプ範囲早見表**（`Validate`/`ValidateWithWarnings` の自動修正ルール。≤0 は無効とみなし下限を採用、上限超過は上限を採用）：

| フィールド | 有効範囲（下限 – 上限） | 備考 |
|------|----------------------|------|
| `MaxJSONSize` | 1MB – 100MB | int64 |
| `MaxPathDepth` | 10 – 200 | |
| `MaxNestingDepthSecurity` | 10 – 200 | |
| `MaxConcurrency` | 1 – 200 | |
| `ParallelThreshold` | 1 – 50 | |
| `MaxObjectKeys` | 100 – 100000 | |
| `MaxArrayElements` | 100 – 100000 | |
| `MaxSecurityValidationSize` | 1MB – 100MB | int64 |
| `MaxBatchSize` | 10 – 10000 | |
| `MaxCacheSize` | 0 – 2000（負数のみ無効とみなす） | 負数の場合は 0 に設定し、**同時に EnableCache をオフ**（0 はキャッシュ無効を表し、有効） |
| `CacheTTL` | ≤0 は無効、`DefaultCacheTTL`（5 分）にリセット | |
| `MaxDepth` | [0, 1000]、範囲外は 100 にリセット | 0 は深度無制限、負数は無効 |
| `FloatPrecision` | [-1, 15]、範囲外は -1 にリセット | -1 は自動精度のセンチネル値 |
| `ChunkSize` | 64KB – 100MB | |
| `MaxMemory` | 10MB – 1GB | |
| `BufferSize` | 4KB – 1MB | |
| `SampleSize` | 100 – 10000 | |
| `JSONLBufferSize` | 4KB – 1MB | |
| `JSONLMaxLineSize` | 1KB – 100MB | |
| `JSONLWorkers` | 1 – 64 | |
| `JSONLChunkSize` | 100 – 10000 | |
| `JSONLMaxMemory` | 10MB – 1GB | int64 |

### ConfigWarning 型

`ConfigWarning` は設定検証中に自動修正された情報を表します。

```go
type ConfigWarning struct {
    Field    string // 修正されたフィールド名
    OldValue any    // 元の値（無効値は nil の場合がある）
    NewValue any    // 修正後の値
    Reason   string // 修正理由
}
```

| フィールド | 型 | 説明 |
|------|------|------|
| `Field` | `string` | 修正されたフィールド名（例：`MaxJSONSize`） |
| `OldValue` | `any` | 修正前の値（無効値は nil の場合がある） |
| `NewValue` | `any` | 修正後の値 |
| `Reason` | `string` | 修正理由（下限未満、上限超過など） |

### SecurityLimits 型

`SecurityLimits` は Config のセキュリティ関連制限フィールドをまとめたものです。

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

**フィールドの説明**

| フィールド | 型 | 説明 |
|------|------|------|
| `MaxNestingDepth` | `int` | 最大ネスト深度（`Config.MaxNestingDepthSecurity` に対応） |
| `MaxSecurityValidationSize` | `int64` | セキュリティ検証の最大サイズ（`Config.MaxSecurityValidationSize` に対応） |
| `MaxObjectKeys` | `int` | オブジェクトの最大キー数（`Config.MaxObjectKeys` に対応） |
| `MaxArrayElements` | `int` | 配列の最大要素数（`Config.MaxArrayElements` に対応） |
| `MaxJSONSize` | `int64` | 最大 JSON サイズ（`Config.MaxJSONSize` に対応） |
| `MaxPathDepth` | `int` | 最大パス深度（`Config.MaxPathDepth` に対応） |

### AddHook

シグネチャ：`func (c *Config) AddHook(hook Hook)`

操作フックを追加します。

```go
cfg := json.DefaultConfig()
cfg.AddHook(json.LoggingHook(slog.Default()))
```

### AddValidator

シグネチャ：`func (c *Config) AddValidator(validator Validator)`

カスタムバリデータを追加します。

```go
cfg := json.DefaultConfig()
cfg.AddValidator(&MyValidator{})
```

### AddDangerousPattern

シグネチャ：`func (c *Config) AddDangerousPattern(pattern DangerousPattern)`

追加のセキュリティパターンを追加します。

```go
cfg := json.DefaultConfig()
cfg.AddDangerousPattern(json.DangerousPattern{
    Pattern: "eval(",
    Name:    "eval-call",
    Level:   json.PatternLevelCritical,
})
```

## 使用例

### 基本的な使用

```go
cfg := json.DefaultConfig()
processor, err := json.New(cfg)
if err != nil {
    panic(err)
}
defer processor.Close()
```

### セキュリティ設定

```go
// 信頼できない入力を処理する
cfg := json.SecurityConfig()
processor, err := json.New(cfg)
if err != nil {
    panic(err)
}
defer processor.Close()
```

### 整形出力

```go
// JSON を整形
result, err := json.EncodeWithConfig(data, json.PrettyConfig())
```

### カスタム設定

```go
cfg := json.DefaultConfig()

// セキュリティ設定
cfg.MaxJSONSize = 10 * 1024 * 1024 // 10MB
cfg.MaxNestingDepthSecurity = 50
cfg.EnableValidation = true

// フック
cfg.Hooks = []json.Hook{json.LoggingHook(slog.Default())}

// バリデータ
cfg.CustomValidators = []json.Validator{&MyValidator{}}

processor, err := json.New(cfg)
if err != nil {
    panic(err)
}
defer processor.Close()
```

### クローンと変更

```go
// デフォルト設定をベースにバリアントを作成
base := json.DefaultConfig()

// バリアント 1：開発設定
devCfg := base.Clone()
devCfg.EnableMetrics = true

// バリアント 2：本番設定
prodCfg := base.Clone()
prodCfg.EnableValidation = true
```

## 設定定数

```go
const (
    // サイズ制限
    DefaultMaxJSONSize       = 100 * 1024 * 1024  // 100MB
    DefaultMaxNestingDepth   = 200
    DefaultMaxPathDepth      = 50
    DefaultMaxDepth          = 100                 // エンコード・デコードのデフォルトネスト深度（Config.MaxDepth）
    DefaultMaxConcurrency    = 50
    DefaultMaxBatchSize      = 2000
    DefaultMaxSecuritySize   = 10 * 1024 * 1024   // 10MB
    DefaultMaxObjectKeys     = 100000
    DefaultMaxArrayElements  = 100000
    DefaultParallelThreshold = 10

    // キャッシュ
    DefaultCacheTTL = 5 * time.Minute
)
```

::: info 内部定数
パス検証の長さ制限（`maxPathLength`）などの定数は内部実装に移行し、公開 API としてはエクスポートされなくなりました。関連するデフォルト値は `Config` 構造体のフィールドデフォルト値として表されます。
:::

---

## マージモード

`MergeMode` は `MergeJSON` と `MergeMany` 関数のマージ戦略を制御します。

`MergeMode` は `fmt.Stringer` を実装しています：`func (m MergeMode) String() string` は `"union"` / `"intersection"` / `"difference"` を返します（未知の値は `"unknown(N)"`）。ログやデバッグ出力に便利です。

| 定数 | 値 | `String()` の戻り値 |
|------|------|------|
| `MergeUnion` | 0 | `"union"` |
| `MergeIntersection` | 1 | `"intersection"` |
| `MergeDifference` | 2 | `"difference"` |

### MergeUnion（デフォルト）

すべてのキー/要素をマージし、競合時は上書き値を使用します。

```go
cfg := json.DefaultConfig()
cfg.MergeMode = json.MergeUnion
result, err := json.MergeJSON(
    `{"a": 1, "b": 2}`,
    `{"b": 3, "c": 4}`,
    cfg,
)
// 結果: {"a": 1, "b": 3, "c": 4}
```

### MergeIntersection

両方のオブジェクトに存在するキーのみを保持します。

```go
cfg := json.DefaultConfig()
cfg.MergeMode = json.MergeIntersection
result, err := json.MergeJSON(
    `{"a": 1, "b": 2}`,
    `{"b": 3, "c": 4}`,
    cfg,
)
// 結果: {"b": 3}
```

### MergeDifference

ベースオブジェクトに存在し、上書きオブジェクトに存在しないキーのみを保持します。

```go
cfg := json.DefaultConfig()
cfg.MergeMode = json.MergeDifference
result, err := json.MergeJSON(
    `{"a": 1, "b": 2}`,
    `{"b": 3, "c": 4}`,
    cfg,
)
// 結果: {"a": 1}
```

---

## セキュリティ推奨事項

| 設定項目 | 推奨値 | 説明 |
|--------|--------|------|
| MaxJSONSize | 10-100MB | サーバーメモリに応じて調整 |
| MaxNestingDepthSecurity | 30-50 | 深くネストされた攻撃を防止 |
| MaxPathDepth | 30-50 | パスの複雑さを制限 |
| EnableValidation | true | 常に有効化 |
| FullSecurityScan | true（信頼できない入力） | 完全セキュリティスキャン |

## 関連

- [Processor](./processor/) - プロセッサメソッド
- [定数とエラー](./constants) - 設定定数
- [セキュリティ概要](../security/) - セキュリティベストプラクティス
- [インターフェース定義](./interfaces) - 拡張インターフェース
