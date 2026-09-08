---
sidebar_label: "反復メソッド"
title: "Processor 反復メソッド - CyberGo JSON | API リファレンス"
description: "CyberGo JSON の Processor 反復メソッド：Foreach、ForeachWithPath、ForeachNested の反復、IterableValue データアクセスと IteratorControl 制御フロー、ForeachReturn による変更を伴う反復とバッチ反復の実践に対応します。"
sidebar_position: 10
---

# 反復メソッド

Processor は JSON 配列とオブジェクトを反復する多様なメソッドを提供します。

::: tip パッケージレベル反復関数とのミラー関係
本ページの 8 つの `Foreach*` メソッドは[パッケージレベル反復関数](../functions/iterate)と 1 対 1 で同源です。コールバックシグネチャと反復セマンティクスは完全に一致し、完全なサンプルはパッケージレベルページを参照してください。Processor 側の違い：

- **cfg セマンティクス**：オプションの末尾 `cfg` でこの呼び出しのセキュリティ検証（サイズ、深度、危険パターン）などを制御します。省略時はプロセッサ自身の設定に従います。
- **キャッシュ保護**：反復ルートをまず `Get` し、それから**ディープコピー**で作業コピーを作ります——コールバックが `item.GetData()` の返すコンテナを変更しても、プロセッサの解析キャッシュと元の入力は汚染されません。
- **ライフサイクル**：プロセッサをクローズした後、すべての反復メソッドは `ErrProcessorClosed` を返します。
:::

## Foreach

シグネチャ：`func (p *Processor) Foreach(jsonStr string, fn func(key any, item *IterableValue), cfg ...Config)`

JSON 配列またはオブジェクトを反復します。

```go
p.Foreach(data, func(key any, item *json.IterableValue) {
    fmt.Printf("Key: %v, Value: %v\n", key, item.GetData())
})
```

**配列の反復時**：key はインデックス（int）
**オブジェクトの反復時**：key はキー名（string）

## ForeachWithPath

シグネチャ：`func (p *Processor) ForeachWithPath(jsonStr, path string, fn func(key any, item *IterableValue), cfg ...Config) error`

パスを指定して反復し、エラーを返します。

```go
err := p.ForeachWithPath(data, "items", func(key any, item *json.IterableValue) {
    fmt.Printf("[%v] %v\n", key, item.GetData())
})
```

用途：
- ネストされた配列の反復
- 指定パスのオブジェクトの反復

## ForeachNested

シグネチャ：`func (p *Processor) ForeachNested(jsonStr string, fn func(key any, item *IterableValue), cfg ...Config)`

すべてのネスト階層を再帰的に反復します。

```go
p.ForeachNested(data, func(key any, item *json.IterableValue) {
    fmt.Printf("キー: %v, 値: %v\n", key, item.GetData())
})
```

サンプルデータ：

```json
{
  "user": {
    "name": "test",
    "profile": {
      "age": 25,
      "tags": ["a", "b"]
    }
  }
}
```

出力：

```text
キー: user, 値: map[string]any{...}
キー: name, 値: test
キー: profile, 値: map[string]any{...}
キー: age, 値: 25
キー: tags, 値: []any{...}
...
```

## ForeachReturn

シグネチャ：`func (p *Processor) ForeachReturn(jsonStr string, fn func(key any, item *IterableValue), cfg ...Config) (string, error)`

JSON データを反復し、再シリアライズされた JSON 文字列を返します。コールバックは反復コンテナを**変更できます**：`item.GetData()` は作業コピー（ディープコピー）の参照を返し、map / slice への追加・削除・変更は最終的なシリアライズ結果に反映されます。スカラーのインプレース置換はできません。変更は元の入力とプロセッサのキャッシュに影響しません。

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	data := `[{"id":1,"internal":"x"},{"id":2,"internal":"y"}]`
	result, err := p.ForeachReturn(data, func(key any, item *json.IterableValue) {
		if obj, ok := item.GetData().(map[string]any); ok {
			delete(obj, "internal") // 作業コピーを変更し、戻り値に反映
		}
	})
	if err != nil {
		panic(err)
	}
	fmt.Println(result)
	// 出力: [{"id":1},{"id":2}]
}
```

反復後にチェーン操作を続ける必要があるシナリオに適しています。

## ForeachWithError

シグネチャ：`func (p *Processor) ForeachWithError(jsonStr, path string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

パスを指定して反復し、コールバックがエラーを返せます。

```go
err := p.ForeachWithError(data, "items", func(key any, item *json.IterableValue) error {
    if item.GetInt("id") == 0 {
        return fmt.Errorf("invalid item at index %v", key)
    }
    return nil // 反復を続行
})
```

## ForeachNestedWithError

シグネチャ：`func (p *Processor) ForeachNestedWithError(jsonStr string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

すべてのネスト階層を再帰的に反復し、コールバックがエラーを返せます。

```go
err := p.ForeachNestedWithError(data, func(key any, item *json.IterableValue) error {
    fmt.Printf("キー: %v, 値: %v\n", key, item.GetData())
    return nil
})
```

## ForeachWithPathAndIterator

シグネチャ：`func (p *Processor) ForeachWithPathAndIterator(jsonStr, path string, fn func(key any, item *IterableValue, currentPath string) IteratorControl, cfg ...Config) error`

パスを指定して反復し、現在のパス情報を提供します。`IteratorControl` で反復フローを制御します。

```go
err := p.ForeachWithPathAndIterator(data, "items", func(key any, item *json.IterableValue, currentPath string) json.IteratorControl {
    fmt.Printf("パス: %s, キー: %v\n", currentPath, key)
    if item.GetInt("id") == targetID {
        return json.IteratorBreak // 反復を停止
    }
    return json.IteratorNormal // 反復を続行
})
```

## ForeachWithPathAndControl

シグネチャ：`func (p *Processor) ForeachWithPathAndControl(jsonStr, path string, fn func(key any, value any) IteratorControl, cfg ...Config) error`

パスを指定して生の値を反復し、`IteratorControl` でフローを制御します。

```go
err := p.ForeachWithPathAndControl(data, "items", func(key any, value any) json.IteratorControl {
    fmt.Printf("キー: %v, 値: %v\n", key, value)
    return json.IteratorNormal
})
```

## IterableValue

反復コールバック内の `IterableValue` は型安全な値取得能力を提供します：`Get` / `GetString` / `GetInt` / `GetFloat64` / `GetBool` / `GetArray` / `GetObject`、およびデフォルト値付きバリアント（`GetWithDefault`、`GetStringWithDefault`、`GetIntWithDefault` など）、状態判定（`Exists` / `IsNull` / `IsNullData` / `IsEmpty` / `IsEmptyData`）、ネスト反復 `ForeachNested`、`Break()` 中断シグナル。完全なメソッド一覧と個別の説明は [IterableValue 型詳解](../iterator)を参照してください。本ページのコールバック用法と完全に一致します。

## メソッド比較

| メソッド | パス引数 | 再帰 | 戻り値 | エラーコールバック |
|------|:--------:|:----:|--------|:--------:|
| `Foreach` | なし | いいえ | なし | いいえ |
| `ForeachWithPath` | あり | いいえ | error | いいえ |
| `ForeachNested` | なし | はい | なし | いいえ |
| `ForeachReturn` | なし | いいえ | (string, error) | いいえ |
| `ForeachWithError` | あり | いいえ | error | はい |
| `ForeachNestedWithError` | なし | はい | error | はい |
| `ForeachWithPathAndIterator` | あり | いいえ | error | IteratorControl |
| `ForeachWithPathAndControl` | あり | いいえ | error | IteratorControl |

---

## ファイル反復メソッド

Processor はファイルから直接反復するメソッドを提供します。`LoadFromFile` + `Foreach` 系の便利な組み合わせです：パスセキュリティ検証、`MaxJSONSize` の読み取り制限、per-call `cfg` の透過は、いずれもファイルロードの動作と一致します。

| メソッド | シグネチャの要点 | セマンティクス |
|------|----------|------|
| `ForeachFile` | `(filePath, fn, cfg...)` | ファイルのルートレベル配列 / オブジェクトを反復 |
| `ForeachFileWithPath` | `(filePath, path, fn, cfg...)` | ファイル内の指定パス配下のコレクションを反復 |
| `ForeachFileChunked` | `(filePath, chunkSize, fn, cfg...)` | ルートレベルの**配列**をバッチ反復（`chunkSize` ≤0 の場合はデフォルト 100）。ルートが配列でない場合は `ErrTypeMismatch` を報告 |
| `ForeachFileNested` | `(filePath, fn, cfg...)` | すべてのネスト構造を再帰的に反復 |

コールバックはいずれも `func(key any, item *json.IterableValue) error` です：`nil` で続行、`item.Break()` でクリーンに停止、その他のエラーで中断して返します。メソッドごとの完全なサンプルは[パッケージレベル反復ページ](../functions/iterate#ファイル反復関数)を参照してください（末尾の `cfg` が 1 つ増えるだけで、動作は同じです）。メソッド選択表は[ファイル操作](./file-io#メソッド選択)を参照してください。

```go
err := p.ForeachFile("data.json", func(key any, item *json.IterableValue) error {
    fmt.Printf("[%v] %v\n", key, item.GetData())
    return nil // 反復を続行
})
```

## ファイル反復メソッド比較

| メソッド | パス引数 | 再帰 | チャンク | 適したシナリオ |
|------|:--------:|:----:|:----:|----------|
| `ForeachFile` | なし | いいえ | いいえ | シンプルなファイル走査 |
| `ForeachFileWithPath` | あり | いいえ | いいえ | 特定箇所の走査 |
| `ForeachFileChunked` | なし | いいえ | **はい** | バッチ処理、メモリ制約 |
| `ForeachFileNested` | なし | **はい** | いいえ | すべてのノードの深さ優先走査 |

---

## 反復制御

コールバックが `item.Break()` を返すと反復をクリーンに中断できます（全体は `nil` を返します）。その他のエラーを返すと即座に中断し、そのエラーがそのまま返ります。パス情報付きの 2 つのバリアント（`ForeachWithPathAndIterator` / `ForeachWithPathAndControl`）は `IteratorControl` 定数（`json.IteratorNormal` / `json.IteratorBreak`）でフローを制御します——日常のシナリオでは `item.Break()` を優先してください。サンプルと定数の説明は[パッケージレベル反復ページ](../functions/iterate#反復制御)を参照してください。

```go
err := p.ForeachFile("data.json", func(key any, item *json.IterableValue) error {
    if item.GetInt("id") == targetID {
        return item.Break() // ターゲットを発見、クリーンに停止
    }
    return nil // 反復を続行
})
```

---

## 関連

- [パスクエリ](./query) - Get 系メソッド
- [バッチ操作](./batch) - ProcessBatch バッチ処理
- [ファイル操作](../functions/file-io) - LoadFromFile/SaveToFile
