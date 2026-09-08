---
sidebar_label: "概要"
title: "JSON 処理ライブラリ - CyberGo JSON | 高性能 Go ライブラリ"
description: "CyberGo JSON は高性能・スレッドセーフな Go JSON ライブラリ。JSONPath クエリ・ストリーミング処理・ジェネリクス API・Schema 検証・フック拡張に対応し、入力検証・危険パターン検出・スマートキャッシュを内蔵、encoding/json と 100% 互換で置き換え可能。"
sidebar_icon: "📘"
---

# JSON 処理ライブラリ

`github.com/cybergodev/json` は、高性能でスレッドセーフな Go JSON 処理ライブラリです。解析、クエリ、変更、検証、フォーマットなど豊富な JSON 操作機能を提供しながら、標準ライブラリ `encoding/json` との 100% 互換性を維持しています。

## 主な特徴

- **100% encoding/json 互換** — 標準ライブラリのシームレスな置き換え、既存コードの変更不要
- **スレッドセーフ** — すべての操作が並行安全、高並行シナリオに対応
- **パスクエリ** — JSONPath スタイルのパス式をサポート、ワイルドカード・スライス含む
- **型安全な取得** — ジェネリクス API (`GetTyped[T]`) と型アサーションメソッド (`SafeGet`)
- **ストリーミング処理** — 大規模ファイルや JSONL/NDJSON 形式のストリーミング処理をサポート
- **セキュリティ保護** — 入力検証、深さ制限、危険パターン検出を内蔵
- **高性能キャッシュ** — スマートキャッシュ、事前解析最適化、オブジェクトプール再利用
- **拡張可能** — フックシステム、カスタムエンコーダ、バリデータ

## インストール

```bash
go get github.com/cybergodev/json
```

## 30 秒クイック体験

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"name": "CyberGo", "version": 1, "tags": ["json", "go"]}`

	// 1. パス取得
	name := json.GetString(data, "name")
	fmt.Println("Name:", name)

	// 2. 値の変更
	updated, _ := json.Set(data, "version", 2)
	fmt.Println("Updated:", updated)

	// 3. 検証
	if json.Valid([]byte(data)) {
		fmt.Println("Valid JSON")
	}

	// 4. デフォルト値付き取得
	desc := json.GetString(data, "description", "デフォルト説明")
	fmt.Println("Description:", desc)

	// 5. 構造体にデコード
	type Config struct {
		Name    string   `json:"name"`
		Version int      `json:"version"`
		Tags    []string `json:"tags"`
	}
	var config Config
	json.Unmarshal([]byte(data), &config)
	fmt.Printf("Config: %+v\n", config)
}
```

## 機能概要

### パス操作

| 機能 | 関数 | 説明 |
|------|------|------|
| 値の取得 | `Get`, `GetString`, `GetInt`... | ネストされたパス、配列インデックスをサポート |
| 一括取得 | `GetMultiple` | 一度の解析で複数パスの値を取得 |
| デフォルト値付き取得 | `GetString`, `GetInt` など | defaultValue パラメータを渡す |
| 値の設定 | `Set` | 存在しないパスをデフォルトで自動作成（Config.CreatePaths） |
| 値の削除 | `Delete` | 指定パスを削除 |

### エンコード・デコード

| 機能 | 関数 | 説明 |
|------|------|------|
| エンコード | `Marshal`, `MarshalIndent` | encoding/json と 100% 互換 |
| デコード | `Unmarshal`, `Parse`, `ParseAny` | ジェネリクスと型安全をサポート |
| フォーマット | `Prettify`, `Compact` | JSON 整形・圧縮 |

### 高度な機能

| 機能 | 関数/型 | 説明 |
|------|---------|------|
| ジェネリクス API | `GetTyped[T]` | 型安全なジェネリクス取得 |
| 事前解析 | `Processor.PreParse`, `Processor.GetFromParsed` | 一度解析して複数回クエリ |
| パスプリコンパイル | `Processor.CompilePath`, `Processor.GetCompiled` | 同一パスの高頻度クエリで重複パースゼロ |
| 並列イテレーション | `NewParallelIterator` | worker プール内蔵の並列 Map/Filter/ForEach |
| 安全な取得 | `SafeGet` → `AccessResult` | チェーン式の型変換 |
| ストリーミング処理 | `NDJSONProcessor` | 行単位のストリーミング、メモリ制御可能 |
| JSONL 処理 | `StreamLinesInto[T]` | ログ/データパイプライン |
| Schema 検証 | `ValidateSchema` | JSON Schema 検証 |

## モジュールナビゲーション

| モジュール | 説明 |
|------|------|
| [クイックスタート](./getting-started/) | インストール、基本操作、コア概念 |
| [パス式の構文](./getting-started/path-syntax) | パスクエリ、スライス、ワイルドカード、フィールド抽出 |
| [Processor ガイド](./getting-started/processor-guide) | いつ Processor を使うか、事前解析最適化、ライフサイクル |
| [API ドキュメント](./api-reference/) | 完全な API リファレンス |
| [大規模ファイル処理](./streaming/large-files) | ストリーミング処理、チャンク読み書き、メモリ最適化 |
| [使用例](./examples/) | 実践的なコードサンプル |
| [高度な機能の例](./examples/examples-advanced) | バッチエンコード、事前解析、フックシステム |

## パフォーマンス特性

- **ゼロアロケーションのファストパス** — 単一キーアクセスとキャッシュキー構築はスタックバッファを使用し、ヒープ割り当てを削減
- **スマートキャッシュ** — ホットパスを自動キャッシュ、キャッシュウォームアップをサポート
- **オブジェクトプール** — 中間オブジェクトの再利用、GC 負荷を低減
- **並列ストリーム処理** — JSONL ストリーミング処理はマルチワーカー並列に対応（`StreamJSONLParallel`）
- **事前解析最適化** — 大型 JSON を一度解析して複数回クエリ

## 標準ライブラリとの比較

| 機能 | encoding/json | cybergodev/json |
|------|---------------|-----------------|
| 基本エンコード・デコード | ✅ | ✅ 100% 互換 |
| パスクエリ | ❌ | ✅ ドット/ブラケット構文 |
| 型安全な取得 | ❌ | ✅ ジェネリクス API |
| ストリーミング処理 | 基本的 | ✅ 強化版 |
| JSONL サポート | ❌ | ✅ ネイティブサポート |
| セキュリティ検証 | ❌ | ✅ 内蔵保護 |
| フックシステム | ❌ | ✅ 拡張可能 |
| キャッシュ最適化 | ❌ | ✅ スマートキャッシュ |

## クイック意思決定ガイド

| シナリオ | 推奨アプローチ |
|----------|----------------|
| シンプルなクエリ | `GetString(data, "path")` |
| デフォルト値付き | `GetString(data, "path", "default")` |
| 型安全 | `GetTyped[User](data, "user")` |
| 同一 JSON に複数パスをクエリ | `Processor` + `PreParse` |
| 同一パスを複数 JSON にクエリ | `Processor` + `CompilePath` |
| 大規模ファイル | `Processor.ForeachFile` |
| 大規模配列の並列処理 | `NewParallelIterator` |
| JSONL パイプライン | `StreamLinesInto[T]` |
| 信頼できない入力 | `SecurityConfig()` |

## 次のステップ

- [クイックスタート](./getting-started/) — 5 分で始める
- [Processor ガイド](./getting-started/processor-guide) — いつ Processor を使うか
- [パス式の構文](./getting-started/path-syntax) — 完全なパス構文
- [使用例](./examples/) — より多くの実践的なサンプル
