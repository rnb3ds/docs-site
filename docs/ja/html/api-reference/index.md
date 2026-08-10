---
sidebar_label: "概要"
title: "API リファレンス - CyberGo html | 全関数・型インデックス"
description: "CyberGo html 完全 API 索引：パッケージ関数と Processor の 2 つの呼び出し方式で、コンテンツ抽出、出力フォーマット、リンク抽出、バッチ処理、設定、監査システム、型定義モジュールを網羅して解説する完全リファレンスです。"
sidebar_position: 1
---

# API リファレンス

HTML ライブラリは以下のコアコンポーネントを提供します：

| コンポーネント | 説明 | ドキュメント |
|------|------|------|
| パッケージ関数 | 一回限りの呼び出しに適した便利関数 | [パッケージ関数](./core/functions) |
| Processor | リソースとキャッシュを再利用するプロセッサインスタンス | [Processor](./core/processor) |
| Config | 設定構造体とプリセット | [設定](./core/config) |
| 出力フォーマット | Markdown、JSON 出力 | [出力フォーマット](./modules/output) |
| リンク抽出 | 独立したリンク抽出 API | [リンク抽出](./modules/links) |
| バッチ処理 | 並列バッチ抽出 | [バッチ処理](./modules/batch) |
| インターフェース | Extractor、StatsProvider など | [インターフェース定義](./types/interfaces) |
| 型 | Result、ImageInfo など | [型定義](./types/type-defs) |
| 定数とエラー | デフォルト値、センチネルエラー | [定数とエラー](./types/constants) |
| セキュリティ保護 | サニタイズ、入力制限、パスセキュリティ | [セキュリティ保護](./modules/security) |
| 監査システム | 監査パイプラインと Sink | [監査システム](./modules/audit) |

## API 概要

### 2 つの呼び出しモード

```text
┌─────────────────────────────────────────┐
│           パッケージ関数（便利モード）               │
│  html.Extract(data) → *Result, error    │
│  内部で sync.Pool を使って Processor を再利用       │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│         Processor（インスタンスモード）             │
│  p, _ := html.New(cfg)                  │
│  defer p.Close()                        │
│  result, err := p.Extract(data)         │
│  ✓ キャッシュ再利用  ✓ 統計収集  ✓ 監査ログ      │
└─────────────────────────────────────────┘
```

### 関数の命名規則

| パターン | 命名 | 例 |
|------|------|------|
| 基本 | `Extract*` | `Extract`, `ExtractText` |
| ファイルから | `Extract*FromFile` | `ExtractFromFile` |
| コンテキスト付き | `Extract*WithContext` | `ExtractWithContext` |
| ファイル + コンテキスト | `Extract*FromFileWithContext` | `ExtractFromFileWithContext` |

### モジュール情報

- **モジュールパス**: `github.com/cybergodev/html`
- **Go バージョン**: 1.25+
- **依存関係**: `golang.org/x/net`, `golang.org/x/text`

## コア型クイックリファレンス

| 型 | 説明 | ドキュメント |
|------|------|------|
| `Result` | 抽出結果（テキスト、タイトル、画像、リンク、統計） | [型定義](./types/type-defs) |
| `Config` | 統一設定構造体とプリセット | [設定](./core/config) |
| `Processor` | コア処理エンジン、キャッシュと統計をサポート | [Processor](./core/processor) |
| `Statistics` | 処理統計（ヒット、エラー、平均処理時間） | [型定義](./types/type-defs) |
| `BatchResult` | バッチ抽出結果 | [バッチ処理](./modules/batch) |
| `LinkResource` | リンクリソース（タイプ分類を含む） | [リンク抽出](./modules/links) |
| `AuditEntry` | 監査ログエントリ | [監査システム](./modules/audit) |

## インターフェースクイックリファレンス

| インターフェース | 説明 | ドキュメント |
|------|------|------|
| `Extractor` | 抽出のメインインターフェース、疎結合と mock に便利 | [インターフェース定義](./types/interfaces) |
| `StatsProvider` | 統計照会インターフェース | [インターフェース定義](./types/interfaces) |
| `Scorer` | カスタムコンテンツスコアリングアルゴリズム | [インターフェース定義](./types/interfaces) |
| `ContentNode` | ノード抽象、内部パーサー型を隠す | [インターフェース定義](./types/interfaces) |
| `AuditSink` | 監査ログの出力先（カスタムバックエンド） | [インターフェース定義](./types/interfaces) |

## プリセット設定

プリセットを出発点にして必要に応じて微調整し、ゼロ値設定を手書きしないようにしてください（`Config` のゼロ値はそのままでは使えません）：

| プリセット | 用途 |
|------|------|
| `DefaultConfig()` | 汎用シナリオ、機能と性能のバランス |
| `TextOnlyConfig()` | プレーンテキストのみを抽出、すべてのメディアを無効化、最高性能 |
| `MarkdownConfig()` | インライン Markdown フォーマットの画像とリンクを出力 |
| `HighSecurityConfig()` | 高セキュリティ環境：制限を厳格化、タイムアウトを短縮、監査を有効化 |

詳細は [設定](./core/config) を参照してください。

## シナリオで API を探す

よくある要件と対応するエントリ：

| 要件 | 推奨 API | ドキュメント |
|------|----------|------|
| プレーンテキストだけ抽出 | `ExtractText` / `Processor.ExtractText` | [パッケージ関数](./core/functions) |
| Markdown 出力 | `ExtractToMarkdown` または `MarkdownConfig()` | [出力フォーマット](./modules/output) |
| すべてのリンクリソースを抽出 | `ExtractAllLinks` | [リンク抽出](./modules/links) |
| バッチ並列処理 | `ExtractBatch` / `ExtractBatchFiles` | [バッチ処理](./modules/batch) |
| カスタムコンテンツ認識 | `Scorer` インターフェース + `Config.Scorer` | [インターフェース定義](./types/interfaces) |
| セキュリティイベントの監査 | `AuditConfig` + `AuditSink` | [監査システム](./modules/audit) |
| 高頻度再利用 + キャッシュ | `html.New()` の長稼働 `Processor` | [Processor](./core/processor) |
