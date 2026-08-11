---
sidebar_label: "概要"
title: "環境変数管理 - CyberGo env | セキュアな環境変数設定"
description: "CyberGo env は高セキュリティの Go 環境変数管理ライブラリで、.env、JSON、YAML のマルチフォーマット自動検出読み込みと型安全な変換をサポートし、SecureValue メモリロックと自動ゼロクリア、シャードロックによるスレッドセーフ、${VAR} 変数展開、env タグ構造体マッピングと完全な監査ログを内蔵し、マイクロサービスやクラウドネイティブの設定管理に適しています。"
---

# env

高セキュリティの Go 環境変数管理ライブラリ。`.env`、JSON、YAML のマルチフォーマットをサポートし、スレッドセーフ、監査ログ、セキュアストレージ機能を提供します。

## コア機能

- **マルチフォーマットサポート** - `.env`、JSON、YAML の自動検出
- **型安全** - 自動型変換と検証
- **スレッドセーフ** - シャードロックによるスレッドセーフな並行アクセス
- **セキュアストレージ** - 機密値のメモリロック、自動ゼロクリア
- **監査ログ** - 完全な操作トレース
- **変数展開** - `${VAR}` 構文サポート
- **構造体マッピング** - タグ駆動の設定バインディング

## シナリオ別ナビゲーション

どこから始めればよいか分からない？あなたのニーズに合わせて選んでください：

| やりたいこと | 参照先 |
|-------------|--------|
| 5 分でクイックスタート | [クイックスタート](/ja/env/getting-started/) |
| パスワードやキーをセキュアに保存 | [セキュリティ概要](/ja/env/security/) → [SecureValue](/ja/env/api-reference/secure-value) |
| 機密データのディスクスワップを防止 | [メモリロック](/ja/env/security/memory-locking) |
| ログで機密データを安全に処理 | [機密データマスキング](/ja/env/security/data-masking) |
| 環境変数を struct にマッピング | [構造体マッピング](/ja/env/guides/struct-mapping) |
| JSON/YAML 設定ファイルを読み込み | [マルチフォーマット設定](/ja/env/guides/multi-format) |
| 変数参照と再利用を設定 | [変数展開](/ja/env/guides/variable-expansion) |
| 設定のシリアライズ/エクスポート | [シリアライズ](/ja/env/guides/serialization) |
| セキュリティ監査ログを記録 | [監査ログ](/ja/env/guides/audit-logging) |
| エラーの処理とマッチング | [エラー処理](/ja/env/guides/error-handling) |
| ユニットテストを記述 | [テストシナリオ](/ja/env/guides/testing) |
| カスタムファイルフォーマットを拡張 | [カスタムパーサー](/ja/env/guides/custom-parser) |
| 本番前のセキュリティチェック | [本番チェックリスト](/ja/env/security/production-checklist) |
| よく使うコードスニペットを確認 | [チートシート](/ja/env/getting-started/cheatsheet) |
| よくある質問を見つける | [FAQ](/ja/env/reference/faq) |

## 主な機能概要

| 機能 | 説明 |
|------|------|
| [型変換](/ja/env/getting-started/) | GetString, GetInt, GetBool, GetDuration, GetSlice |
| [構造体マッピング](/ja/env/guides/struct-mapping) | タグ駆動の設定バインディング |
| [セキュアストレージ](/ja/env/api-reference/secure-value) | 機密値のメモリ保護 |
| [マルチフォーマット読み込み](/ja/env/guides/multi-format) | .env, JSON, YAML |

## クイックナビゲーション

<div class="vp-features">

### 入門
- [クイックスタート](/ja/env/getting-started/) - 5 分チュートリアル
- [チートシート](/ja/env/getting-started/cheatsheet) - よく使うコードスニペット

### API リファレンス
- [パッケージ関数](/ja/env/api-reference/functions) - 完全な API ドキュメント
- [Loader](/ja/env/api-reference/loader) - ローダーメソッド
- [SecureValue](/ja/env/api-reference/secure-value) - セキュア値の処理

### セキュリティ
- [セキュリティ概要](/ja/env/security/) - セキュリティアーキテクチャとベストプラクティス

</div>
