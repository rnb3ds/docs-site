---
sidebar_label: "概要"
title: "API リファレンス - CyberGo JSON | 完全な関数ドキュメント"
description: "CyberGo JSON API リファレンス：GetString/GetInt パスクエリ、Set/Delete 変更、Marshal/Unmarshal シリアライズ、Processor と Schema 検証、パッケージ関数とインスタンスメソッドの両スタイルに対応し、標準ライブラリと 100% 互換です。"
sidebar_position: 1
---

# API リファレンス

本セクションでは `github.com/cybergodev/json` ライブラリの完全な API リファレンスを提供します。

::: tip 2 つの API スタイル
本ライブラリは **パッケージレベル関数**（`json.GetString(data, "path")` など、インスタンス作成不要）と **Processor メソッド**（`p.GetString(data, "path")` など、設定の再利用・事前解析キャッシュ・フックシステムに対応）の 2 セットの API を提供しています。どちらを使うべきか迷ったら、[Processor ガイド](../getting-started/processor-guide)の選択ディシジョンツリーを参照してください。
:::

## モジュール索引

### 関数 API

| モジュール | 説明 |
|------|------|
| [パッケージ関数](./functions/) | パッケージレベル関数リファレンス（クエリ/変更/削除/エンコード/解析/バッチ/JSONL/ファイル/イテレーション） |
| [Processor](./processor/) | プロセッサメソッド（パッケージ関数とミラー分類、加えてライフサイクルと事前解析を含む） |

### 型とインターフェース

| モジュール | 説明 |
|------|------|
| [Config](./config) | 設定オプション詳解（DefaultConfig / SecurityConfig / PrettyConfig） |
| [型定義](./types) | コア型（Config / Schema / Stats / AccessResult、Encoder / Decoder、CompiledPath / PathSegment を含む） |
| [インターフェース定義](./interfaces) | 拡張インターフェース（CustomEncoder / Validator / Hook / PathParser） |
| [イテレータと IterableValue](./iterator) | Iterator / BatchIterator / ParallelIterator / StreamIterator 型 |
| [ジェネリクス操作](./generics) | ジェネリクス API（GetTyped[T] / StreamLinesInto[T] / Result[T]） |
| [定数とエラー](./constants) | 定数とエラー型（`Default*` 定数と Config フィールド対照表を含む） |

### ツールと補助

| モジュール | 説明 |
|------|------|
| [ユーティリティ関数](./helpers) | CompareJSON / MergeJSON、キャッシュ管理、グローバルプロセッサ、SafeError / RedactedPath、AccessResult メソッド |
| [フォーマット出力](../getting-started/print) | Print 系移行ガイド（削除された API の代替案） |

### クロスモジュール特集

| モジュール | 説明 |
|------|------|
| [ストリーミング処理](../streaming/large-files) | 大規模ファイルのストリーミング処理ガイド |
| [JSONL / NDJSON 処理](../streaming/jsonl) | JSONL プロセッサ（StreamJSONL / NDJSONProcessor / JSONLWriter） |
| [セキュリティ検証](../security/security-mode) | セキュリティモード API（SecurityConfig / DangerousPattern / RegisterDangerousPattern） |
| [Schema 検証](./schema) | Schema 検証（ValidateSchema / DefaultSchema / NewSchemaWithConfig） |
| [Hook フックシステム](../extensions/hooks) | 操作インターセプトフック（LoggingHook / TimingHook / ValidationHook / ErrorHook） |
| [カスタムエンコーダ](../extensions/custom-encoder) | カスタムエンコーダ（CustomEncoder / TypeEncoder） |

## クイック検索

### 機能別分類

#### パスクエリ

| 関数 | 説明 |
|------|------|
| `Get`, `GetWithContext`, `GetString`, `GetInt`, `GetFloat`, `GetBool`, `GetArray`, `GetObject` | 型安全な取得 |
| `GetTyped[T]` | ジェネリクス取得 |
| `SafeGet` | 安全な AccessResult 取得 |
| `GetMultiple` | 一括取得 |

#### 変更操作

| 関数 | 説明 |
|------|------|
| `Set`, `SetMultiple` | 値の設定 |
| `SetCreate`, `SetMultipleCreate` | 値の設定とパス自動作成 |
| `Delete`, `DeleteClean` | 値の削除 |
| `ProcessBatch` | バッチ操作 |

#### エンコード・デコード

| 関数 | 説明 |
|------|------|
| `Marshal`, `Unmarshal` | 標準エンコード・デコード（`encoding/json` 互換、`cfg` を追加可能） |
| `MarshalIndent` | 整形エンコード（`encoding/json.MarshalIndent` 互換、`cfg` を追加可能） |
| `EncodeWithConfig`, `EncodePretty` | 文字列へのエンコード（設定付き / 整形出力） |
| `Encode`（非推奨） | `EncodeWithConfig` と機能等価。将来のメジャーバージョンで削除予定——新規コードでは `Marshal` または `EncodeWithConfig` を使用してください |
| `NewEncoder`, `NewDecoder` | ストリーミングエンコード・デコード |
| `Parse`, `ParseAny` | ターゲット変数への解析 / `any` としての解析 |
| `EncodeBatch`, `EncodeFields`, `EncodeStream` | キー・バリューのオブジェクト化 / フィールド選択エンコード / 複数値の配列化 |

#### フォーマット

| 関数 | 説明 |
|------|------|
| `Prettify` | JSON の整形 |
| `Compact` | JSON の圧縮（buffer 形式、`encoding/json.Compact` 互換） |
| `CompactString` | JSON の圧縮（文字列入出力形式、`Processor.Compact` のミラー） |
| `Indent` | インデント整形して buffer に書き込み（`encoding/json.Indent` 互換） |
| `HTMLEscape` | HTML 文字エスケープして buffer に書き込み（`encoding/json.HTMLEscape` 互換） |

#### ファイル操作

| 関数 | 説明 |
|------|------|
| `LoadFromFile`, `SaveToFile` | ファイル読み書き |
| `LoadFromReader` | Reader からの読み込み |
| `MarshalToFile`, `UnmarshalFromFile` | ファイルエンコード・デコード |
| `SaveToWriter` | 任意の Writer への書き込み |

#### イテレーション

| 関数 | 説明 |
|------|------|
| `Foreach`, `ForeachWithError`, `ForeachNested`, `ForeachNestedWithError` | 配列/オブジェクトの走査（深さ優先走査を含む） |
| `ForeachWithPath`, `ForeachWithPathAndIterator`, `ForeachWithPathAndControl` | 指定パスの走査（現在パスの保持 / 中断制御付き） |
| `ForeachReturn` | 走査して変更後の JSON を返す |
| `ForeachFile`, `ForeachFileWithPath`, `ForeachFileChunked`, `ForeachFileNested` | 大規模ファイルのストリーミングイテレーション |
| `NewIterator`, `NewBatchIterator`, `NewParallelIterator`, `NewStreamIterator` | スタンドアロンイテレータ構築（詳しくは[イテレータ](./iterator)） |

#### キャッシュとグローバル

| 関数 | 説明 |
|------|------|
| `WarmupCache`, `ClearCache` | キャッシュウォームアップ / クリア |
| `GetStats`, `GetHealthStatus` | 実行統計 / ヘルスチェック |
| `GetConfig`, `SetLogger` | プロセッサ設定の読み取り / ロガー注入（グローバルと Processor メソッドを含む） |
| `SetGlobalProcessor`, `ShutdownGlobalProcessor` | グローバルプロセッサの置き換えとシャットダウン |
| `RegisterDangerousPattern`, `UnregisterDangerousPattern`, `ListDangerousPatterns` | グローバル危険パターンレジストリへの登録 / 削除 / 一覧（詳しくは[ユーティリティ関数](./helpers#registerdangerouspattern)） |
| `CompilePath`（Processor）, `PreParse`（Processor） | パスプリコンパイル / JSON 事前解析 |

#### ストリーミング処理

| 型/メソッド | 説明 |
|------|------|
| `StreamLinesInto[T]` | Reader から JSONL をストリーミング読み込みして `[]T` に変換 |
| `ParseJSONL` | JSONL バイト列を `[]any` に解析 |
| `ToJSONL`, `ToJSONLString` | `[]any` を JSONL 形式に変換 |
| `JSONLWriter` | JSONL ライター（Write/WriteAll/WriteRaw） |
| `NDJSONProcessor` | NDJSON/JSONL プロセッサ（`NewNDJSONProcessor` で作成） |
| `ForeachFile` | ファイルストリーミング処理 |

#### 検証

| 関数 | 説明 |
|------|------|
| `Valid` | JSON 検証（`encoding/json.Valid` 互換） |
| `ValidWithConfig` | 設定付き JSON 検証 |
| `ValidateSchema` | Schema 検証（`Schema` 型と併用） |
| `CompareJSON` | JSON の等価性比較 |
| `MergeJSON`, `MergeMany` | JSON マージ（ユニオン/積集合/差集合モード、詳しくは[ユーティリティ関数](./helpers)） |

## 命名規約

ライブラリは以下の命名規約に従います：

| パターン | 説明 | 例 |
|------|------|------|
| `Get{Type}` | 指定型の取得（defaultValue をサポート） | `GetString`, `GetInt` |
| `GetTyped[T]` | ジェネリクス取得、T を返す | `GetTyped[User]` |
| `New{Type}` | インスタンス作成 | `New`（*Processor を返す）, `NewEncoder` |
| `Default{Type}` | デフォルト設定 | `DefaultConfig` |
| `{Type}Config` | 設定プリセット | `SecurityConfig`, `PrettyConfig` |
| `Foreach*` | イテレーションバリエーション（WithError / WithPath / Nested / File） | `ForeachNestedWithError` |
| `Stream*` | ストリーミング処理バリエーション（Into / Parallel / File / Chunked） | `StreamJSONLParallel` |
| `{Verb}Hook` | フックファクトリー | `LoggingHook`, `ValidationHook` |

## 関連

- [クイックスタート](../getting-started/) -- インストールと基本的な使い方
- [Processor ガイド](../getting-started/processor-guide) -- いつプロセッサを使うか
- [パス式の構文](../getting-started/path-syntax) -- パスクエリ構文
- [使用例](../examples/) -- 実践的なコードサンプル
- [大規模ファイル処理](../streaming/large-files) -- ストリーミング処理ガイド
