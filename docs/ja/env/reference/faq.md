---
sidebar_label: "よくある質問"
title: "よくある質問 - CyberGo env | 環境変数に関する FAQ"
description: "CyberGo env のよくある質問と回答。グローバルモードとインスタンスモードの選択、Load の 1 回初期化制限、JSON/YAML ネストキーへのアクセス、GetSlice ジェネリック関数の設計、スレッドセーフな並行アクセス、SecureValue ライフサイクル管理、OverwriteExisting 上書き戦略とテスト分離などの高頻度質問をカバー。"
sidebar_position: 2
---

# よくある質問

## 基本的な使い方

### Load() と New() はどちらを選ぶべき？

**`env.Load()`**（グローバルモード）はシンプルなアプリに適しています：1 回読み込み、グローバルにパッケージレベル関数を使用します。自動的に変数を `os.Environ` に適用します。

**`env.New()`**（インスタンスモード）はテストやマルチ設定シーンに適しています：分離インスタンスを作成し、自動適用せず、明示的な `Close()` が必要です。

```go
// シンプルなアプリ → グローバルモード
env.Load(".env")
port := env.GetInt("PORT", 8080)

// テスト / マルチ設定 → インスタンスモード
loader, _ := env.New(env.TestingConfig())
defer loader.Close()
port := loader.GetInt("PORT", 8080)
```

::: tip 選択のヒント
迷ったらまず `env.Load()` を使ってください。テスト分離やマルチ設定のニーズに遭遇したら `env.New()` に切り替えてください。
:::

### なぜ Load() は 1 回しか呼び出せないのか？

`Load()` はグローバルデフォルトローダーを設定し（シングルトンパターン）、重複呼び出しは `ErrAlreadyInitialized` を返します。これは設計上の決定で、実行時に既存の読み込み済み設定が意図せず上書きされるのを防ぎます。

```go
// 1 回目の呼び出し — 成功
env.Load(".env")

// 2 回目の呼び出し — エラーを返す
err := env.Load(".env.production")
// err == env.ErrAlreadyInitialized
```

**解決策：**

```go
// 方式 1：1 回で複数ファイルを読み込み（推奨）
env.Load(".env", ".env.production")

// 方式 2：再初期化が必要な場合は先にリセット
env.ResetDefaultLoader()  // 主にテスト用
env.Load(".env.production")
```

### .env ファイルが存在しない場合はどうなる？

デフォルトの動作：**サイレントにスキップ**し、エラーを報告しません。これは「あれば読み込み、なければ無視」という柔軟なデプロイをサポートするためです。

```go
// DefaultConfig — ファイル不存在時にサイレントスキップ
env.Load(".env", ".env.local")
// 両方のファイルが存在しなくてもエラーにならない
```

ファイル不存在時にエラーにしたい場合（本番環境で推奨）：

```go
cfg := env.ProductionConfig()
// FailOnMissingFile はデフォルトで true（ProductionConfig のみ）
loader, _ := env.New(cfg)
```

### JSON/YAML のネスト値にアクセスするには？

JSON/YAML のネスト構造は自動的に**フラット化**され、アンダースコア区切りのキー名になります：

```json
{
  "database": {
    "host": "localhost",
    "port": 5432
  }
}
```

```
格納形態：DATABASE_HOST=localhost, DATABASE_PORT=5432
```

3 つのアクセス方式は等価です：

```go
host := env.GetString("DATABASE_HOST")  // フラット化キー名（推奨）
host := env.GetString("database.host")  // ドットパス
host := env.GetString("DATABASE.HOST")  // 大文字ドットパス
```

## 型とジェネリクス

### GetSlice はなぜメソッドではなくジェネリック関数なのか？

Go はメソッドの型パラメータをサポートしません。`GetSlice[T]` はメソッドではなく関数でなければなりません：

```go
// ❌ メソッド方式 — コンパイルエラー（Go はサポートしない）
// loader.GetSlice[int]("PORTS")

// ✅ 関数方式 — 可能
env.GetSliceFrom[int](loader, "PORTS")

// ✅ パッケージレベル関数
env.GetSlice[int]("PORTS")
```

### GetSlice はどのようにスライス値を解析するのか？

優先度順に検索します：

1. **インデックスキー**（推奨）：`KEY_0`, `KEY_1`, `KEY_2`...
2. **カンマ区切り**：`KEY=val1,val2,val3`

```bash
# 方式 1：インデックスキー
HOSTS_0=localhost
HOSTS_1=example.com

# 方式 2：カンマ区切り
HOSTS=localhost,example.com
```

```go
hosts := env.GetSlice[string]("HOSTS") // ["localhost", "example.com"]
```

### どのようなブール値フォーマットをサポートするのか？

`GetBool` は大文字小文字を区別せず、以下の値をサポートします：

| 真値 | 偽値 |
|------|------|
| `true`, `1`, `yes`, `on`, `enabled` | `false`, `0`, `no`, `off`, `disabled` |

## 並行性とスレッドセーフ

### 複数の goroutine から同時に Get を呼び出せるか？

**可能です。** Loader のすべてのメソッドはスレッドセーフです。ライブラリはシャードロック（sharded locks）を使用して高並行シーンでの読み書きパフォーマンスを最適化します。

```go
// 安全な並行アクセス
var wg sync.WaitGroup
for i := 0; i < 100; i++ {
    wg.Add(1)
    go func() {
        defer wg.Done()
        _ = env.GetString("KEY") // スレッドセーフ
    }()
}
wg.Wait()
```

### Loader.Close() 後に Get を呼び出すとどうなる？

ゼロ値を返し、panic しません。Loader はクローズ後に読み取り専用デグラデーションモードに入ります：

```go
loader, _ := env.New()
defer loader.Close()

val := loader.GetString("KEY") // 正常に返す

// Close() の後
val = loader.GetString("KEY")  // ""（ゼロ値）を返す
err := loader.Set("KEY", "v")  // ErrClosed を返す
```

## SecureValue

### Release と Close の違いは？

| メソッド | メモリゼロクリア | メモリアンロック | オブジェクトプール返却 |
|------|:--------:|:--------:|:----------:|
| `Release()` | ✅ | ✅ | ✅ |
| `Close()` | ✅ | ✅ | ❌ |

**`Release()` の使用を推奨**します。オブジェクトをプールに返却し GC 圧力を削減します。`Close()` はプール化が不要なシーンに適しています。

### SecureValue は GC 回収時に自動ゼロクリアされるか？

**されます。** SecureValue はファイナライザーを設定し、ガベージコレクション時に自動的にメモリをゼロクリアします。ただし、タイムリーなクリーンアップを保証するため `Release()` または `Close()` の明示的な呼び出しを推奨し、GC の不確実なタイミングに依存しないでください。

```go
// ✅ 推奨：明示的に解放
sv := env.GetSecure("API_KEY")
defer sv.Release()

// ⚠️ GC に依存 — 推奨しないが安全
sv := env.GetSecure("API_KEY")
// 最終的に GC でゼロクリアされるが、タイミングは不確定
```

### どのように安全にログを記録するか？

`Masked()` またはマスキングユーティリティ関数を使用し、`Reveal()` の値を直接出力しないでください：

```go
sv := env.GetSecure("API_KEY")
defer sv.Release()

// ✅ 安全 — マスク出力
log.Printf("API Key: %s", sv.Masked())    // [SECURE:32 bytes locked]
log.Printf("API Key: %s", sv)              // 同上（String() が Masked() を返す）

// ✅ 安全 — マスキングツール
masked := env.MaskValue("API_KEY", "sk-xxx") // sk-******************************
clean := env.SanitizeForLog(logMessage)       // 自動検出してマスク

// ❌ 危険 — 平文漏洩
plaintext := sv.Reveal()
log.Printf("API Key: %s", plaintext) // このようにしないでください
```

## 設定と検証

### 特定のプレフィックスの変数のみ読み込むには？

`Prefix` フィールドでフィルタします：

```go
cfg := env.DefaultConfig()
cfg.Prefix = "MYAPP_"  // MYAPP_ で始まる変数のみ読み込み
loader, _ := env.New(cfg)
loader.LoadFiles(".env")
```

```bash
# .env ファイルの内容
MYAPP_HOST=localhost    # ✅ 読み込む
MYAPP_PORT=8080         # ✅ 読み込む
OTHER_KEY=value         # ❌ 無視（MYAPP_ プレフィックスなし）
```

### 設定の上書きを防ぐには？

`OverwriteExisting` が既存の変数を上書きするかを制御します：

```go
// デフォルト：上書きしない（安全）
cfg := env.DefaultConfig()
cfg.OverwriteExisting = false

// 開発環境：上書きを許可
cfg := env.DevelopmentConfig()
// OverwriteExisting = true
```

### RequiredKeys の検証はいつ実行されるか？

明示的に `Validate()` を呼び出した時のみチェックされ、読み込み時には自動的にトリガーされません：

```go
cfg := env.ProductionConfig()
cfg.RequiredKeys = []string{"DB_HOST", "API_KEY"}
loader, _ := env.New(cfg)
loader.LoadFiles(".env")

// 明示的に検証
if err := loader.Validate(); err != nil {
    if errors.Is(err, env.ErrMissingRequired) {
        log.Fatal("必須の環境変数が不足しています")
    }
}
```

## テスト

### テストで環境を分離するには？

`TestingConfig()` + 独立 Loader インスタンスを使用します：

```go
func TestConfig(t *testing.T) {
    cfg := env.TestingConfig()
    cfg.OverwriteExisting = true

    loader, err := env.New(cfg)
    if err != nil {
        t.Fatal(err)
    }
    defer loader.Close()

    // 各テストは独立、互いに影響しない
    loader.Set("KEY", "test-value")
    val := loader.GetString("KEY")
    // テスト...
}
```

### グローバルモードのテストをリセットするには？

`ResetDefaultLoader()` を使用します：

```go
func TestGlobalMode(t *testing.T) {
    // 前のテストの状態をクリーンアップ
    env.ResetDefaultLoader()
    defer env.ResetDefaultLoader()

    env.Load(".env.test")
    // テスト...
}
```

::: tip 完全なテストガイド
詳しくは [テスト](/ja/env/guides/testing) ガイドを参照してください。
:::

## 関連ドキュメント

- [クイックスタート](/ja/env/getting-started/) — 5 分で始める
- [チートシート](/ja/env/getting-started/cheatsheet) — 高頻度コードスニペット
- [エラー処理](/ja/env/guides/error-handling) — センチネルエラーと復旧戦略
- [ファイル形式](/ja/env/reference/file-format) — .env/JSON/YAML 構文
