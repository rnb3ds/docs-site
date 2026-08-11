---
sidebar_label: "セキュリティ概要"
title: "セキュリティ概要 - CyberGo env | セキュリティアーキテクチャ"
description: "CyberGo env セキュリティアーキテクチャの概要。SecureValue メモリロックと自動ゼロクリア、キー値検証で制御文字とヌルバイトをフィルタ、DefaultForbiddenKeys で PATH と LD_PRELOAD を禁止、IsSensitiveKey で自動検出、セキュリティプリセットと監査追跡を詳解。"
sidebar_position: 1
---

# セキュリティ概要

環境変数にはよく機密情報が格納されるため、安全な取り扱いが極めて重要です。本文書は env ライブラリのセキュリティアーキテクチャとコア機能の概要を示します。

## セキュリティアーキテクチャ

```text
┌──────────────────────────────────────────────────────────────┐
│                         アプリケーション層                      │
├──────────────────────────────────────────────────────────────┤
│   SecureValue   │    マスク    │    ゼロクリア    │   メモリロック        │
├──────────────────────────────────────────────────────────────┤
│                          Loader 層                            │
├──────────────────────────────────────────────────────────────┤
│     キー検証      │   値検証   │   禁止キー   │   サイズ制限         │
├──────────────────────────────────────────────────────────────┤
│                           解析層                              │
├──────────────────────────────────────────────────────────────┤
│    フォーマット検出     │  展開チェック  │       パス検証                  │
└──────────────────────────────────────────────────────────────┘
```

## コアセキュリティ機能

| 機能 | 説明 | ドキュメント |
|------|------|------|
| **SecureValue** | 機密値のメモリ保護、自動ゼロクリア | [SecureValue API](/ja/env/api-reference/secure-value) |
| **禁止キー** | システム重要変数の変更を防止 | [定数とエラー](/ja/env/api-reference/constants#defaultforbiddenkeys) |
| **機密キー検出** | 機密設定キーの自動認識、ログマスキングツール | [データマスキング](/ja/env/security/data-masking) |
| **値の検証** | 制御文字、ヌルバイトなどの検出 | [Config API](/ja/env/api-reference/config) |
| **監査ログ** | 完全な操作追跡 | [コンポーネントファクトリー](/ja/env/api-reference/factory#監査ハンドラーファクトリー) |

## SecureValue の紹介

機密データには `GetString` ではなく `GetSecure` を使用します：

```go
// 非推奨
password := env.GetString("DB_PASSWORD")

// 推奨
secret := env.GetSecure("DB_PASSWORD")
defer secret.Close()
password := secret.Reveal()  // 平文が必要な時のみ呼び出す
```

**コア機能：**
- **メモリロック** - ディスクへのスワップを防止（Linux/macOS/Windows/FreeBSD）
- **自動ゼロクリア** - `Close()` 時にメモリを安全に消去
- **マスク表示** - `Masked()` をログ出力に使用
- **スレッドセーフ** - 並行読み取りをサポート

::: tip 完全な API
詳しくは [SecureValue API](/ja/env/api-reference/secure-value) を参照してください。
:::

## ログセーフティ

SecureValue が保護するのは**メモリ内**の機密値ですが、ログ、エラーメッセージ、デバッグ出力も同様にキーの漏洩が起こりやすい場所です。env は Loader に依存せず使用できる独立したマスキングユーティリティ関数群を提供します：

- `IsSensitiveKey` でパスワード、キー、トークンなどの機密キー名を自動検出
- `MaskValue` / `MaskKey` で値とキー名をマスクしてから出力
- `SanitizeForLog` でログ文字列内の `key=value` パターンをスキャンしてマスク

```go
// ログに安全に出力し、平文の漏洩を回避
log.Printf("設定を読み込みました: %s", env.MaskValue("DB_PASSWORD", password))
// 出力：設定を読み込みました：[MASKED:12 chars]

log.Printf("接続パラメータ: %s", env.SanitizeForLog("user=admin password=s3cret"))
// 出力：接続パラメータ：user=admin [MASKED]
```

::: tip 完全なガイド
マスキングツールの完全な使い方は [データマスキング](/ja/env/security/data-masking) を参照してください。
:::

## キー/値の検証

### キーの検証

デフォルトのキー名ルール：`^[A-Za-z][A-Za-z0-9_]*$`

- 文字で始まる
- 文字、数字、アンダースコアのみを含む
- 長さは `MaxKeyLength` を超えない

### 禁止キー

組み込みの禁止キーでシステム重要変数の変更を防止します：

| カテゴリ | 例 | リスク |
|------|------|------|
| システムパス | `PATH`, `LD_LIBRARY_PATH` | コマンド/ライブラリ乗っ取り |
| 動的リンク | `LD_PRELOAD`, `DYLD_INSERT_LIBRARIES` | 悪意のあるライブラリ注入 |
| Shell | `SHELL`, `IFS`, `BASH_ENV` | Shell 乗っ取り |
| 言語ランタイム | `PYTHONPATH`, `NODE_PATH` | モジュール乗っ取り |

::: tip 完全なリスト
[DefaultForbiddenKeys](/ja/env/api-reference/constants#defaultforbiddenkeys) で完全な禁止キーリストを参照してください。
:::

### 値の検証

値の検証を有効化して潜在的な危険を検出します：

```go
cfg := env.ProductionConfig()
cfg.ValidateValues = true  // 制御文字、ヌルバイトなどを検出
```

## ファイルセキュリティの基礎

### ファイル権限

```bash
# 所有者のみ読み書き可能
chmod 600 .env

# またはより厳格に（読み取り専用）
chmod 400 .env
```

### Git で無視

```bash
.env
.env.local
.env.*.local
*.pem
*.key
```

## 設定のセキュリティレベル

| プリセット | 用途 | 特徴 |
|------|------|------|
| `DevelopmentConfig()` | 開発環境 | 緩い制限、YAML 構文サポート |
| `TestingConfig()` | テスト環境 | 既存変数の上書き、テスト分離 |
| `ProductionConfig()` | 本番環境 | 厳格な検証 + 監査ログ、既存変数を上書きしない |

```go
// 本番環境推奨設定
cfg := env.ProductionConfig()
cfg.RequiredKeys = []string{"DB_HOST", "API_KEY"}
cfg.AllowedKeys = []string{"APP_NAME", "PORT", "DB_HOST", "API_KEY"}
```

## 関連ドキュメント

- [SecureValue API](/ja/env/api-reference/secure-value) - セキュア値処理の完全な API
- [メモリロック](/ja/env/security/memory-locking) - mlock メモリ保護の完全なガイド
- [定数とエラー](/ja/env/api-reference/constants) - 禁止キーの完全なリスト、機密キーパターン
- [本番チェックリスト](/ja/env/security/production-checklist) - 本番稼働前のセキュリティチェック
