---
sidebar_label: "反復メソッド"
title: "パッケージレベル反復関数 - CyberGo JSON | API リファレンス"
description: "CyberGo JSON パッケージレベル反復関数：Foreach、ForeachWithPath、ForeachNested 再帰、ForeachWithError エラー処理、IterableValue データアクセス、ForeachFile ファイル反復を含みます。"
sidebar_position: 10
---

# パッケージレベル反復関数

Processor インスタンスを作成せずに直接呼び出せる反復関数。[Processor 反復メソッド](../processor/iterate)と 1 対 1 で対応します（二層設計）。

::: tip 反復順序は確定的
オブジェクトの反復はキー名の**辞書順**で行われ、配列は自然順です——Go map のネイティブ反復順序はランダムですが、ライブラリ内部でソートしているため、同じ入力に対するコールバック順序は再現可能で、出力もテストできます。
:::

## Foreach

シグネチャ：`func Foreach(jsonStr string, fn func(key any, item *IterableValue), cfg ...Config)`

JSON 配列またはオブジェクトを反復します。

```go
json.Foreach(data, func(key any, item *json.IterableValue) {
    fmt.Printf("Key: %v, Value: %v\n", key, item.GetData())
})
```

**配列の反復時**：key はインデックス（int）
**オブジェクトの反復時**：key はキー名（string）

## ForeachWithPath

シグネチャ：`func ForeachWithPath(jsonStr, path string, fn func(key any, item *IterableValue), cfg ...Config) error`

パスを指定して反復し、エラーを返します。

```go
err := json.ForeachWithPath(data, "items", func(key any, item *json.IterableValue) {
    fmt.Printf("[%v] %v\n", key, item.GetData())
})
```

用途：
- ネストされた配列の反復
- 指定パスのオブジェクトの反復

## ForeachNested

シグネチャ：`func ForeachNested(jsonStr string, fn func(key any, item *IterableValue), cfg ...Config)`

すべてのネスト階層を再帰的に反復します。再帰深度の上限は 200 です（深いネスト構造によるスタックオーバーフローを防止。超過したサブツリーにはこれ以上深入りしません）。

```go
json.ForeachNested(data, func(key any, item *json.IterableValue) {
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

シグネチャ：`func ForeachReturn(jsonStr string, fn func(key any, item *IterableValue), cfg ...Config) (string, error)`

JSON データを反復して各要素にコールバックでアクセスし、再シリアライズされた JSON 文字列を返します。コールバックは `GetData()` 経由で map/slice を変更でき、変更は戻り値に反映されます。2 点注意してください：変更できるのは**コンテナ内部**のみ（map のキー追加・削除、slice の要素変更）——`IterableValue` 経由でスカラー要素をインプレース置換することはできません。また反復は解析結果の**ディープコピー**上で実行されるため、プロセッサのキャッシュは汚染されません。

```go
result, err := json.ForeachReturn(data, func(key any, item *json.IterableValue) {
    // item.GetData() で要素にアクセス・変更可能
})
```

反復後にチェーン操作を続ける必要があるシナリオに適しています。

## ForeachWithError

シグネチャ：`func ForeachWithError(jsonStr, path string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

パスを指定して反復し、コールバックがエラーを返せます。

```go
err := json.ForeachWithError(data, "items", func(key any, item *json.IterableValue) error {
    if item.GetInt("id") == 0 {
        return fmt.Errorf("invalid item at index %v", key)
    }
    return nil // 反復を続行
})
```

## ForeachNestedWithError

シグネチャ：`func ForeachNestedWithError(jsonStr string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

すべてのネスト階層を再帰的に反復し、コールバックがエラーを返せます。

```go
err := json.ForeachNestedWithError(data, func(key any, item *json.IterableValue) error {
    fmt.Printf("キー: %v, 値: %v\n", key, item.GetData())
    return nil
})
```

## ForeachWithPathAndIterator

シグネチャ：`func ForeachWithPathAndIterator(jsonStr, path string, fn func(key any, item *IterableValue, currentPath string) IteratorControl, cfg ...Config) error`

パスを指定して反復し、現在のパス情報を提供します。`IteratorControl` で反復フローを制御します。

```go
err := json.ForeachWithPathAndIterator(data, "items", func(key any, item *json.IterableValue, currentPath string) json.IteratorControl {
    fmt.Printf("パス: %s, キー: %v\n", currentPath, key)
    if item.GetInt("id") == targetID {
        return json.IteratorBreak // 反復を停止
    }
    return json.IteratorNormal // 反復を続行
})
```

## ForeachWithPathAndControl

シグネチャ：`func ForeachWithPathAndControl(jsonStr, path string, fn func(key any, value any) IteratorControl, cfg ...Config) error`

パスを指定して生の値を反復し、`IteratorControl` でフローを制御します。

```go
err := json.ForeachWithPathAndControl(data, "items", func(key any, value any) json.IteratorControl {
    fmt.Printf("キー: %v, 値: %v\n", key, value)
    return json.IteratorNormal
})
```

## IterableValue

反復コールバック内の `IterableValue` は便利な値アクセス機能を提供します。完全なメソッド定義は[イテレータ型](../iterator#iterablevalue-型)を参照してください。

| メソッド | 説明 |
|------|------|
| `GetData() any` | 現在の値を取得 |
| `Get(path string) any` | パスで値を取得 |
| `GetString(key string) string` | 文字列値を取得 |
| `GetInt(key string) int` | 整数値を取得 |
| `GetFloat64(key string) float64` | 浮動小数点数値を取得 |
| `GetBool(key string) bool` | ブール値を取得 |
| `GetArray(key string) []any` | 配列値を取得 |
| `GetObject(key string) map[string]any` | オブジェクト値を取得 |
| `Exists(key string) bool` | フィールドが存在するか判定 |
| `IsNull(key string) bool` / `IsNullData() bool` | null かどうかを判定 |
| `IsEmpty(key string) bool` / `IsEmptyData() bool` | 空かどうかを判定 |
| `Break() error` | 反復を中断するエラーシグナルを返す |
| `Release()` | リソースをオブジェクトプールに返却 |

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

::: warning void 系変種はエラーを報告しない
`Foreach` / `ForeachNested` は戻り値がありません：プロセッサ利用不可などの設定エラーは黙って無視され、コールバックの panic は捕捉されてログに記録された後、反復が停止します（プロセスは落ちません）。error 系変種（`*WithError` 系列）はコールバックの panic をエラーに変換して返します。エラー情報が必要な場合は、常に `error` 戻り値付きの変種を使ってください。
:::

---

## ファイル反復関数

パッケージレベルにはファイルから直接反復する関数が用意されており、大型 JSON ファイルの処理に適しています。[Processor ファイル反復メソッド](../processor/iterate#ファイル反復メソッド)と対応します。

### ForeachFile

シグネチャ：`func ForeachFile(filePath string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

ファイルから JSON をロードして反復します。

**パラメータ**

| 名前 | 型 | 説明 |
|------|------|------|
| `filePath` | `string` | JSON ファイルパス |
| `fn` | `func(key any, item *IterableValue) error` | 反復コールバック |

```go
err := json.ForeachFile("data.json", func(key any, item *json.IterableValue) error {
    fmt.Printf("[%v] %v\n", key, item.GetData())
    return nil // 反復を続行
})
```

---

### ForeachFileWithPath

シグネチャ：`func ForeachFileWithPath(filePath, path string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

ファイルから JSON をロードしてパスを指定して反復します。

```go
// users 配列だけを反復
err := json.ForeachFileWithPath("data.json", ".users", func(key any, item *json.IterableValue) error {
    name := item.GetString("name")
    fmt.Printf("ユーザー: %s\n", name)
    return nil
})
```

---

### ForeachFileChunked

シグネチャ：`func ForeachFileChunked(filePath string, chunkSize int, fn func(chunk []*IterableValue) error, cfg ...Config) error`

ファイル内の JSON 配列をチャンク単位で反復します。大規模データセットのバッチ処理に適しています。

**パラメータ**

| 名前 | 型 | 説明 |
|------|------|------|
| `filePath` | `string` | JSON ファイルパス |
| `chunkSize` | `int` | 1 バッチの処理数（≤0 の場合はデフォルト 100） |
| `fn` | `func(chunk []*IterableValue) error` | バッチ処理コールバック |

```go
// 100 レコードずつ処理
err := json.ForeachFileChunked("large_data.json", 100, func(chunk []*json.IterableValue) error {
    // データベースへバッチ挿入
    records := make([]Record, len(chunk))
    for i, item := range chunk {
        records[i] = Record{
            ID:   item.GetInt("id"),
            Name: item.GetString("name"),
        }
    }
    return db.BatchInsert(records)
})
```

::: tip 使用シーン
- データベースへのバッチ挿入
- 分割された API 呼び出し
- メモリ制約下の大規模ファイル処理
:::

---

### ForeachFileNested

シグネチャ：`func ForeachFileNested(filePath string, fn func(key any, item *IterableValue) error, cfg ...Config) error`

ファイルから JSON をロードし、すべてのネスト構造を再帰的に反復します。

```go
err := json.ForeachFileNested("config.json", func(key any, item *json.IterableValue) error {
    // すべての階層のすべてのキー・バリューを走査
    fmt.Printf("パス: %v, 型: %T\n", key, item.GetData())
    return nil
})
```

**サンプルデータ**：

```json
{
  "database": {
    "host": "localhost",
    "port": 5432,
    "pool": {
      "min": 5,
      "max": 20
    }
  }
}
```

**出力**：

```text
パス: database, 型: map[string]any
パス: host, 型: string
パス: port, 型: float64
パス: pool, 型: map[string]any
パス: min, 型: float64
パス: max, 型: float64
```

---

## ファイル反復メソッド比較

| メソッド | パス引数 | 再帰 | チャンク | 適したシナリオ |
|------|:--------:|:----:|:----:|----------|
| `ForeachFile` | なし | いいえ | いいえ | シンプルなファイル走査 |
| `ForeachFileWithPath` | あり | いいえ | いいえ | 特定箇所の走査 |
| `ForeachFileChunked` | なし | いいえ | **はい** | バッチ処理、メモリ制約 |
| `ForeachFileNested` | なし | **はい** | いいえ | すべてのノードの深さ優先走査 |

---

## 反復制御

### IteratorControl 定数

`ForeachWithPathAndControl` と `ForeachWithPathAndIterator` は `IteratorControl` を返すことで反復フローを制御します（定数定義は[イテレータ型](../iterator#iteratorcontrol-定数)を参照）：

| 定数 | 説明 |
|------|------|
| `IteratorNormal` | 反復を正常に続行 |
| `IteratorContinue` | `IteratorNormal` の no-op エイリアス（API 対称性のために保留）——「現在の項目をスキップ」は暗黙的です：副作用は一切なく、反復は通常どおり続行されます |
| `IteratorBreak` | 反復を停止 |

### 反復の中断

エラーコールバックで `item.Break()` を返すと反復を中断できます：

```go
err := json.ForeachFile("data.json", func(key any, item *json.IterableValue) error {
    if item.GetInt("id") == targetID {
        // ターゲットを発見、反復を停止
        return item.Break()
    }
    return nil // 反復を続行
})
```

### エラー処理

その他のエラーを返すと反復が中断され、そのエラーが返ります：

```go
err := json.ForeachFile("data.json", func(key any, item *json.IterableValue) error {
    if item.GetString("status") == "error" {
        return fmt.Errorf("エラーレコードを発見: %v", key)
    }
    return nil
})
if err != nil {
    log.Printf("反復が中断: %v", err)
}
```

---

## 関連

- [Processor 反復メソッド](../processor/iterate) - 対応するプロセッサメソッド
- [イテレータ型](../iterator) - Iterator/IterableValue/Stream/Batch/Parallel の型定義
- [パスクエリ](./query) - Get 系メソッド
- [バッチ操作](./batch) - ProcessBatch バッチ処理
- [ファイル操作](./file-io) - LoadFromFile/SaveToFile
- [大規模ファイル処理ガイド](../../streaming/large-files) - ストリーミング処理シナリオの実践
