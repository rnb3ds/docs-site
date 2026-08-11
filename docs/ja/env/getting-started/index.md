---
sidebar_label: "クイックスタート"
title: "クイックスタート - CyberGo env | 5 分スタートガイド"
description: "5 分で CyberGo env 環境変数管理ライブラリを始めましょう。go get でのインストール、.env の読み込み、型安全な読み取り、GetSecure セキュア値、構造体マッピング、変数展開、errors.Is によるエラー処理をカバーし、4 種類の設定プリセットとマルチ環境・マルチファイル読み込みも解説。完全な実行可能コード例付きですぐに始められます。"
sidebar_position: 1
---

# クイックスタート

5 分で env ライブラリを始めましょう。インストールから実際の使用まで。

## インストール

```bash
go get github.com/cybergodev/env
```

::: tip 要件
Go 1.25+
:::

## .env ファイルの作成

プロジェクトのルートディレクトリに `.env` ファイルを作成します：

```bash
# データベース設定
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=secret

# アプリケーション設定
DEBUG=true
APP_NAME=myapp
LOG_LEVEL=info

# 複数値（カンマ区切り）
ALLOWED_HOSTS=localhost,example.com,api.example.com
```

## 最小限の使い方

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

func main() {
    // .env ファイルを読み込み、システム環境に適用
    if err := env.Load(".env"); err != nil {
        panic(err)
    }

    // 環境変数の取得
    host := env.GetString("DB_HOST", "localhost")
    port := env.GetInt("DB_PORT", 5432)

    fmt.Printf("Server: %s:%d\n", host, port)
}
```

::: tip 2 つの使用モード

env は 2 つの使用方法を提供します：

| モード | 使い方 | 適用シーン |
|------|------|----------|
| **グローバルモード** | `env.Load()` + `env.GetString()` | シンプルなアプリ、スクリプト、迅速なプロトタイピング |
| **インスタンスモード** | `env.New()` + `loader.GetString()` | 複数インスタンス、テスト分離、ライフサイクルのきめ細かい制御 |

グローバルモードはパッケージレベル関数を使用し、内部でデフォルトの Loader シングルトンを維持します。`env.Load()` を呼び出した後、すべての `env.GetXxx()` がそのインスタンスを自動的に使用します。インスタンスモードは `env.New()` で独立した Loader を作成し、分離や複数設定の同時管理が必要なシーンに適しています。

本文書の例はデフォルトでグローバルモードを使用します。インスタンスモードの完全な使い方は[マルチ環境設定](#マルチ環境設定)セクションを参照してください。
:::

## 値の読み取り - すべての型

### 基本型

```go
// === デフォルト値あり ===

// 文字列 - 見つからない場合はデフォルト値 "localhost" を返す
host := env.GetString("HOST", "localhost")

// 整数 (int64) - 見つからない場合はデフォルト値 8080 を返す
port := env.GetInt("PORT", 8080)

// ブール値 - 見つからない場合はデフォルト値 false を返す
debug := env.GetBool("DEBUG", false)

// 時間間隔 - 見つからない場合はデフォルト値 30s を返す
timeout := env.GetDuration("TIMEOUT", 30*time.Second)


// === デフォルト値なし ===

// 文字列 - 見つからない場合は空文字列 "" を返す
host := env.GetString("HOST")

// 整数 (int64) - 見つからない場合は 0 を返す
port := env.GetInt("PORT")

// ブール値 - 見つからない場合は false を返す
debug := env.GetBool("DEBUG")

// 時間間隔 - 見つからない場合は 0 を返す
timeout := env.GetDuration("TIMEOUT")
```

::: tip キー名の解決
ライブラリは複数のキー名アクセス方法をサポートしています：

```go
// JSON: {"app": {"name": "myapp"}}
// 格納形態：APP_NAME=myapp

// 以下の方法でこの値にアクセス可能
name := env.GetString("APP_NAME")      // フラット化キー名（推奨）
name := env.GetString("app.name")      // ドットパス（自動変換）
name := env.GetString("APP.NAME")      // 大文字ドットパス
```

**解決ルール：**
1. **完全一致**：完全なキー名 `KEY` を優先検索
2. **大文字変換**：小文字のキー名は大文字版を試行 `key` → `KEY`
3. **パス解決**：ドットパスをアンダースコアに変換 `app.name` → `APP_NAME`
:::

### ブール値のサポート

`GetBool` は以下の値をサポートします（大文字小文字を区別しない）：

| 真値 | 偽値 |
|------|------|
| `true`, `1`, `yes`, `on`, `enabled` | `false`, `0`, `no`, `off`, `disabled` |

### スライス型

```go
// 文字列スライス
hosts := env.GetSlice[string]("HOSTS", []string{"localhost"})

// 整数スライス（int, int64, uint, uint64 をサポート）
ports := env.GetSlice[int64]("PORTS", []int64{80, 443})
portsInt := env.GetSlice[int]("PORTS")  // int 型もサポート

// 浮動小数点スライス
rates := env.GetSlice[float64]("RATES", []float64{0.1, 0.2})

// ブール値スライス
flags := env.GetSlice[bool]("FLAGS", []bool{true, false})

// Duration スライス
timeouts := env.GetSlice[time.Duration]("TIMEOUTS")
```

**解析順序：**
1. インデックスキー `KEY_0`, `KEY_1`, `KEY_2`... を優先検索
2. インデックスキーがない場合、`KEY` の値をカンマ区切りで解析

```go
// 方式 1：インデックスキー（推奨）
// HOSTS_0=localhost
// HOSTS_1=example.com
hosts := env.GetSlice[string]("HOSTS")  // ["localhost", "example.com"]

// 方式 2：カンマ区切り
// PORTS=80,443,8080
ports := env.GetSlice[int64]("PORTS")  // [80, 443, 8080]
```

### チェックと検索

```go
// キーが存在するかチェック
value, exists := env.Lookup("API_KEY")
if !exists {
    // キーが存在しない
}

// すべてのキーを取得
keys := env.Keys()

// すべてのキーと値のペアを取得
all := env.All()

// 変数の数を取得
count := env.Len()
```

### セキュア値

```go
secret := env.GetSecure("API_KEY")
if secret != nil {
    defer secret.Release()

    // 生の値を取得（平文が必要な場合のみ呼び出す。暗号化・復号、API 呼び出しなど）
    value := secret.Reveal()

    // ログにはマスクを使用（漏洩を防止）
    log.Printf("API Key: %s", secret.Masked())  // 出力：[SECURE:32 bytes]
}
```

## 構造体マッピング

タグを使用して環境変数を構造体にマッピングします：

```go
package main

import (
    "fmt"
    "time"

    "github.com/cybergodev/env"
)

type Config struct {
    Host     string        `env:"DB_HOST" envDefault:"localhost"`
    Port     int64         `env:"DB_PORT" envDefault:"5432"`
    Password string        `env:"DB_PASSWORD"`
    Debug    bool          `env:"DEBUG" envDefault:"false"`
    Timeout  time.Duration `env:"TIMEOUT" envDefault:"30s"`
    Hosts    []string      `env:"ALLOWED_HOSTS"`
}

func main() {
    env.Load(".env")

    var cfg Config
    if err := env.ParseInto(&cfg); err != nil {
        panic(err)
    }

    fmt.Printf("%+v\n", cfg)
}
```

::: details 詳細
[構造体マッピング](/ja/env/guides/struct-mapping)ガイドを参照してください。
:::

## 設定プリセット

ライブラリは 4 種類のプリセット設定を提供し、異なるシーンに適しています：

| プリセット | 用途 | 特徴 |
|------|------|------|
| `DefaultConfig()` | 汎用シーン | 安全なデフォルト値、ほとんどのケースに適合 |
| `DevelopmentConfig()` | 開発環境 | 緩い制限、上書きを許可 |
| `TestingConfig()` | テスト環境 | 厳しい制限、上書きを許可、ユニットテストに適合 |
| `ProductionConfig()` | 本番環境 | 厳格な検証 + 監査ログ |

```go
// 開発環境 - 緩い制限
cfg := env.DevelopmentConfig()

// テスト環境 - 厳しい制限
cfg := env.TestingConfig()

// 本番環境 - 厳格な検証 + 監査ログ
cfg := env.ProductionConfig()
```

### プリセットの詳細比較

| 機能 | Default | Development | Testing | Production |
|------|---------|-------------|---------|------------|
| 既存変数の上書き | ✗ | ✓ | ✓ | ✗ |
| ファイル不存在時のエラー | ✗ | ✗ | ✗ | ✓ |
| 監査ログ | ✗ | ✗ | ✗ | ✓ |
| YAML 構文 | ✗ | ✓ | ✗ | ✗ |
| ファイルサイズ制限 | 2MB | 10MB | 64KB | 64KB |
| 最大変数数 | 500 | 500 | 50 | 50 |
| 禁止キーのチェック | ✓ | ✓ | ✓ | ✓ |
| 値の検証 | ✓ | ✓ | ✓ | ✓ |

::: tip 選択のヒント
- **開発環境**：`DevelopmentConfig()` を使用。緩い制限で迅速な反復開発が可能
- **テスト環境**：`TestingConfig()` を使用。上書きを許可しテスト分離に適している
- **本番環境**：`ProductionConfig()` を使用。監査と厳格な検証を有効化
:::

## マルチ環境設定

### 環境別の読み込み

```go
// 環境に応じて設定ファイルを決定
goEnv := os.Getenv("GO_ENV")
if goEnv == "" {
    goEnv = "development"
}

// 1 回の呼び出しですべての設定ファイルを読み込み（順番に、後のものが前のものを上書き）
env.Load(".env", ".env."+goEnv, ".env.local")
```

### Loader インスタンスの使用

より細かい制御が必要な場合は、Loader インスタンスを使用します：

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

func main() {
    // 設定を作成
    cfg := env.ProductionConfig()
    cfg.RequiredKeys = []string{"DB_HOST", "API_KEY"}

    // ローダーを作成
    loader, err := env.New(cfg)
    if err != nil {
        panic(err)
    }
    defer loader.Close()

    // ファイルを読み込み（順番に、後のものが前のものを上書き）
    if err := loader.LoadFiles(".env", ".env.production"); err != nil {
        panic(err)
    }

    // 必須キーを検証
    if err := loader.Validate(); err != nil {
        panic(err)
    }

    // 使用
    host := loader.GetString("DB_HOST")
    fmt.Println("Host:", host)
}
```

## マルチファイルとマルチフォーマット

### マルチファイル読み込み

順番に読み込み、後のものが前のものを上書きします：

::: code-group

```go [パッケージレベル関数]
env.Load(".env", "config.json", "config.yaml")
```

```go [Loader インスタンス]
loader.LoadFiles(".env", ".env.local")
```

:::

### マルチフォーマットサポート

ファイルフォーマットを自動検出します：

```go
loader.LoadFiles("config.env", "settings.json", "secrets.yaml")
```

::: details サポートされるフォーマット
| フォーマット | 拡張子 | 検出方法 |
|------|--------|----------|
| .env | `.env` | ファイル拡張子 |
| JSON | `.json` | ファイル拡張子 |
| YAML | `.yaml`, `.yml` | ファイル拡張子 |
:::

## エラー処理

```go
import "errors"

err := loader.LoadFiles(".env")
if err != nil {
    switch {
    case errors.Is(err, env.ErrFileNotFound):
        // ファイルが存在しない
    case errors.Is(err, env.ErrFileTooLarge):
        // ファイルが大きすぎる
    case errors.Is(err, env.ErrSecurityViolation):
        // 禁止キー（実際は *SecurityError を返す）
    default:
        // その他のエラー
    }

    // キー形式不正：実際は *ValidationError を返す、Field=="key"
    var valErr *env.ValidationError
    if errors.As(err, &valErr) && valErr.Field == "key" {
        // 無効なキー形式
    }
}
```

::: details 詳細なエラー情報の取得
```go
// 解析エラーの詳細
var parseErr *env.ParseError
if errors.As(err, &parseErr) {
    fmt.Printf("ファイル %s の %d 行目: %v\n", parseErr.File, parseErr.Line, parseErr.Err)
}

// ファイルエラーの詳細
var fileErr *env.FileError
if errors.As(err, &fileErr) {
    fmt.Printf("ファイル %s の操作 %s が失敗: %v\n", fileErr.Path, fileErr.Op, fileErr.Err)
}

// セキュリティエラーの詳細
var secErr *env.SecurityError
if errors.As(err, &secErr) {
    fmt.Printf("セキュリティエラー: %s - %s\n", secErr.Action, secErr.Reason)
}
```
:::

## 次のステップ

<div class="vp-features">

### さらに学ぶ
- [構造体マッピング](/ja/env/guides/struct-mapping) - 詳細な設定バインディング
- [シリアライズ](/ja/env/guides/serialization) - 設定のシリアライズとデシリアライズ
- [マルチフォーマット設定](/ja/env/guides/multi-format) - JSON/YAML の詳細
- [テスト](/ja/env/guides/testing) - テストでの使用方法

### API リファレンス
- [パッケージ関数](/ja/env/api-reference/functions) - パッケージレベル関数の完全なリスト
- [Loader API](/ja/env/api-reference/loader) - ローダーのメソッド
- [Config API](/ja/env/api-reference/config) - 設定オプション

### セキュリティ
- [セキュリティ概要](/ja/env/security/) - セキュリティアーキテクチャとベストプラクティス
- [SecureValue API](/ja/env/api-reference/secure-value) - セキュア値の処理

</div>
