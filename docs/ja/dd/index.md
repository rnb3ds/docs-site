---
sidebar_label: "概要"
title: "構造化ログ - CyberGo DD | 高性能 Go ロガー"
description: "CyberGo DD は CyberGo 組織が提供する高性能 Go 構造化ログライブラリで、スレッドセーフなログ記録、柔軟な出力先設定、ファイル自動ローテーション、機密データ自動フィルタリング、非同期監査ログ、HMAC 整合性署名、低アロケーション最適化を提供し、安全で信頼性の高いログシステムを迅速に構築できます。"
---

# DD

DD（ソースコメントでは "data-driven" または "distributed debugger" と読みます）は CyberGo 組織が提供する高性能構造化ログライブラリで、スレッドセーフなログ記録、柔軟な出力先設定、包括的なセキュリティ保護を提供します。

## 特徴

- **構造化ログ** -- 型安全なフィールド記録、オプションで JSON フォーマット出力
- **マルチ出力先** -- コンソール、ファイル、カスタム `io.Writer` への同時出力
- **ファイルローテーション** -- サイズによる自動ローテーション、バックアップ数制限と時間保持ポリシーをサポート
- **機密データフィルタリング** -- 組み込みの正規表現パターンにより、パスワード、キー、Token などの機密情報を自動マスキング
- **フィールド検証** -- フィールドキーの命名規則検証（snake_case/camelCase 等）と Log4Shell インジェクション防護
- **監査ログ** -- 非同期監査イベント記録、HMAC 整合性署名とシーケンス番号をサポート
- **フックシステム** -- BeforeLog、AfterLog、OnRotate などのライフサイクルフック
- **コンテキスト統合** -- TraceID/SpanID/RequestID の context ツールと ContextExtractor 拡張ポイントを提供（ログメソッドは ctx を受け取らず、WithFields でフィールド渡しが必要）
- **ログサンプリング** -- 高スループットシナリオで選択可能なログサンプリング戦略
- **低アロケーション最適化** -- ホットパスのメモリアロケーションを最小化、卓越したパフォーマンス

## インストール

```bash
go get github.com/cybergodev/dd
```

## クイックスタート

```go
package main

import (
    "time"

    "github.com/cybergodev/dd"
)

func main() {
    // デフォルトロガーを使用
    dd.Info("サービス起動")

    // 構造化ログ
    dd.InfoWith("リクエスト処理完了",
        dd.String("method", "GET"),
        dd.Int("status", 200),
        dd.Duration("elapsed", 150*time.Millisecond),
    )

    // カスタムロガーを作成
    logger, _ := dd.New(dd.DefaultConfig())
    defer logger.Close()

    logger.Info("カスタムロガーが作成されました")
}
```

## モジュールナビゲーション

| モジュール | 説明 |
|------|------|
| [コア概念](./guides/basics/core-concepts) | Logger 体系、処理パイプライン、インターフェース階層 |
| [設定](./guides/basics/configuration) | Config 構造体、プリセット、出力ターゲット |
| [構造化ログ](./guides/basics/structured-logging) | フィールドコンストラクタ、チェーン呼び出し |
| [ファイル出力とローテーション](./guides/basics/file-output) | FileWriter、BufferedWriter |
| [機密データフィルタリング](./guides/security/sensitive-filtering) | 自動マスキング、セキュリティレベル |
| [フィールド検証](./guides/security/field-validation) | 命名規則チェック、Log4Shell 防護 |
| [ログサンプリング](./guides/operations/sampling) | 高スループットログ削減戦略 |
| [監査ログ](./guides/security/audit-logging) | 非同期監査イベント、整合性署名 |
| [フックシステム](./guides/operations/hooks) | ライフサイクルフック拡張 |
| [エラー処理](./guides/operations/error-handling) | 構造化エラー、センチネルエラー、errors.Is |
| [分散トレーシング統合](./guides/integration/context-tracing) | TraceID/SpanID/RequestID のコンテキスト統合 |
| [マイグレーションガイド](./guides/integration/migration) | log/slog/zap/logrus からの移行 |

## 次のステップ

- [インストール](./getting-started/installation) -- 環境要件と依存関係の統合
- [クイックスタート](./getting-started/) -- 5 分入門ガイド
- [コア概念](./guides/basics/core-concepts) -- DD アーキテクチャを理解する
- [設定](./guides/basics/configuration) -- Config 全フィールドとプリセット
- [チートシート](./getting-started/cheatsheet) -- よく使う API クイックリファレンス
- [API リファレンス](./api-reference/) -- 完全 API ドキュメント
- [基本サンプル](./examples/basic-usage) -- 実用的なコード例
- [マイグレーションガイド](./guides/integration/migration) -- log/slog/zap/logrus からの移行
