---
sidebar_label: "概要"
title: "Processor プロセッサ - CyberGo JSON | API リファレンス"
description: "CyberGo JSON の Processor プロセッサ：New 生成、GetString/Set/Delete 操作、Foreach 反復、Encode エンコード、Close ライフサイクル。内蔵キャッシュで繰り返し操作を高速化し、チェーン呼び出しとグローバル管理に対応、高頻度再利用に適しています。"
sidebar_position: 1
---

# Processor

Processor は高性能、カスタマイズ性、より柔軟な再利用能力を提供し、同じデータソースへの複数回操作に適しています。

## 特徴

- **高性能**：内部キャッシュ機構により、繰り返し操作がより効率的
- **設定可能**：多様な設定オプションをサポート
- **メソッドチェーン**：メソッドは変更後の JSON を返し、連続操作に対応
- **リソース管理**：明示的なライフサイクル制御

## Processor の作成

### New

シグネチャ：`func New(cfg ...Config) (*Processor, error)`

Processor インスタンスを作成します。オプションの Config 引数でプロセッサを設定します。

```go
// デフォルト設定を使用
processor, err := json.New()
if err != nil {
    panic(err)
}
defer processor.Close()

// カスタム設定を使用
cfg := json.DefaultConfig()
cfg.StrictMode = true
processor, err = json.New(cfg)

// セキュリティ設定を使用
processor, err = json.New(json.SecurityConfig())
```

## メソッドチェーン

Processor のメソッドは変更後の JSON 文字列を返すため、連続操作が可能です：

```go
processor, _ := json.New()

// 複数の値を設定
result1, _ := processor.Set(data, "user.name", "CyberGo")
result2, _ := processor.Set(result1, "user.version", "1.0.0")
finalResult, _ := processor.Delete(result2, "user.temporary")
```

## API カタログ

| カテゴリー | 説明 |
|------|------|
| [クエリと取得](./query) | GetString/Int/Float/Bool/Get/GetWithContext/SafeGet/GetArray/GetObject/GetMultiple/CompilePath/GetCompiled/PreParse/GetFromParsed |
| [変更操作](./modify) | Set/SetMultiple/SetCreate/SetMultipleCreate/MergeJSON/MergeMany/CompareJSON |
| [削除操作](./delete) | Delete/DeleteClean |
| [エンコード出力](./output) | Encode/EncodePretty/EncodeWithConfig/MarshalIndent/Prettify/Compact/CompactBuffer/Indent/HTMLEscape/EncodeBatch/EncodeFields/EncodeStream/ValidateSchema |
| [解析と検証](./parse) | Parse/ParseAny/Valid/ValidBytes/Marshal/Unmarshal |
| [バッチ操作](./batch) | ProcessBatch/WarmupCache |
| [JSONL](./jsonl) | StreamJSONL/StreamJSONLParallel/StreamJSONLParallelWithContext/StreamJSONLChunked/StreamJSONLFile/ForeachJSONL/MapJSONL/ReduceJSONL/FilterJSONL/CollectJSONL/FirstJSONL |
| [ファイル操作](./file-io) | LoadFromFile/LoadFromReader/SaveToFile/MarshalToFile/SaveToWriter/UnmarshalFromFile/ForeachFile 系 |
| [反復メソッド](./iterate) | Foreach/ForeachWithPath/ForeachNested/ForeachReturn/ForeachWithError/ForeachNestedWithError/ForeachWithPathAndIterator/ForeachWithPathAndControl/ForeachFile/ForeachFileWithPath/ForeachFileChunked/ForeachFileNested |
| [ライフサイクル](./lifecycle) | Close/IsClosed/GetConfig/AddHook/SetLogger/ClearCache/WarmupCache/GetStats/GetHealthStatus/SetGlobalProcessor/ShutdownGlobalProcessor |

---

## グローバルプロセッサ管理

パッケージレベル関数は内部グローバルプロセッサを使用します。以下の関数で管理できます：

### SetGlobalProcessor

シグネチャ：`func SetGlobalProcessor(processor *Processor)`

カスタムグローバルプロセッサを設定します。すべてのパッケージレベル関数（Get、Set、Marshal など）がこのプロセッサを使用します。

**パラメータ**

| 名前 | 型 | 説明 |
|------|------|------|
| `processor` | `*Processor` | カスタムプロセッサインスタンス |

```go
package main

import (
	"github.com/cybergodev/json"
)

func main() {
	// カスタム設定のプロセッサを作成
	cfg := json.SecurityConfig()
	processor, err := json.New(cfg)
	if err != nil {
		panic(err)
	}

	// グローバルプロセッサとして設定
	json.SetGlobalProcessor(processor)

	// 以降、すべてのパッケージレベル関数がセキュリティ設定を使用
	data, err := json.Get(`{"name":"Alice"}`, "name")
	// SecurityConfig の制限が適用される
	_ = data
}
```

::: warning 注意
- `nil` を渡すと何も実行されません
- 前のグローバルプロセッサは自動的にクローズされます
- この関数はスレッドセーフです
:::

### ShutdownGlobalProcessor

シグネチャ：`func ShutdownGlobalProcessor()`

グローバルプロセッサをクローズして削除します。以降のパッケージレベル操作は新しいデフォルトプロセッサを作成します。

```go
package main

import (
	"github.com/cybergodev/json"
)

func main() {
	// グローバルプロセッサを使用
	data, _ := json.Get(`{"key":"value"}`, "key")
	_ = data

	// アプリケーション終了時にクリーンアップ
	json.ShutdownGlobalProcessor()

	// 以降の操作は新しいデフォルトプロセッサを作成する
	data2, _ := json.Get(`{"key":"value2"}`, "key")
	_ = data2
}
```

::: tip 使用シーン
- 長時間実行されるサービスの終了時のリソースクリーンアップ
- プロセッサ設定のリセットが必要なとき
- テスト環境で異なるテストケースを隔離するとき
:::

---

## 関連

- [パッケージ関数](../functions/) - トップレベル関数リファレンス
- [Config](../config) - 設定オプション
- [インターフェース定義](../interfaces) - Hook インターフェース
- [Hook フックシステム](../../extensions/hooks) - フックの詳細な使い方ガイド
