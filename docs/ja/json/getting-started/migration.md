---
title: "標準ライブラリからの移行 - CyberGo JSON | encoding/json 互換ガイド"
description: "標準ライブラリ encoding/json から CyberGo JSON への移行：3 ステップで完了、import を変えるだけでコンパイル可能。Marshal/Encoder/Decoder メソッドとエラー型の互換リスト、セキュリティ検証の動作差異表、移行 FAQ、追加機能の使い方を収録。"
sidebar_label: "標準ライブラリからの移行"
sidebar_position: 1.5
---

# 標準ライブラリからの移行

`cybergodev/json` は標準ライブラリ `encoding/json` と **100% 互換**です——import パスを置き換えるだけで、既存のコードは一切変更せずにコンパイル・実行できます（デフォルトの入力セキュリティ検証によるわずかな境界差異は下記の[動作差異](#動作差異)を参照）。本ページで移行を完了し、移行後に使える追加能力を把握できます。

## 3 ステップの移行

1. **インストール**：

   ```bash
   go get github.com/cybergodev/json
   ```

2. **import の置き換え**：`"encoding/json"` を `"github.com/cybergodev/json"` に置き換えます。

   ```go
   // 移行前
   import "encoding/json"

   // 移行後
   import "github.com/cybergodev/json"
   ```

3. **完了**：コンパイルが通り、既存コードはすべて変更不要です。

## 完全互換の API

以下の表は `encoding/json` と `cybergodev/json` の対応関係です：

| encoding/json | cybergodev/json | 説明 |
|---|---|---|
| `Marshal(v)` | `Marshal(v, cfg...)` | シグネチャ互換、追加のオプション cfg 引数 |
| `Unmarshal(data, &v)` | `Unmarshal(data, &v, cfg...)` | 同上 |
| `MarshalIndent(v, prefix, indent)` | 同名 | 完全互換 |
| `Compact(dst, src)` | 同名 | 完全互換 |
| `Indent(dst, src, prefix, indent)` | 同名 | 完全互換 |
| `HTMLEscape(dst, src)` | 同名 | 完全互換 |
| `Valid(data)` | `Valid(data, cfg...)` | シグネチャ互換 |
| `NewEncoder(w)` | `NewEncoder(w, cfg...)` | シグネチャ互換 |
| `NewDecoder(r)` | `NewDecoder(r, cfg...)` | シグネチャ互換 |
| `Number` | `Number` | 型互換（`String`/`Int64`/`Float64`/`MarshalJSON` すべて保持） |
| `Delim` | `Delim` | 型互換（`String()` 保持） |
| `Token` | `Token` | 型互換 |

`Encoder` と `Decoder` の**メソッドレベル**の互換も同様に完全です——移行後もストリーミングコードは一切変更不要です：

| メソッド | 所属 | 互換性 |
|---|---|---|
| `Encode(v)` / `SetIndent(prefix, indent)` / `SetEscapeHTML(on)` | `*Encoder` | 完全互換 |
| `Decode(v)` / `Token()` / `More()` / `Buffered()` / `InputOffset()` | `*Decoder` | 完全互換 |
| `UseNumber()` / `DisallowUnknownFields()` | `*Decoder` | 完全互換 |

エラー型も 1 対 1 で対応しており、`errors.As` / 型アサーションに依存するコードはそのまま動作します：`SyntaxError`、`UnmarshalTypeError`、`InvalidUnmarshalError`、`MarshalerError`、`UnsupportedTypeError`、`UnsupportedValueError` はいずれも存在し、動作も一致します（詳しくは[エラー型](../api-reference/constants#エラー変数)）。

エラー構造体の**位置特定フィールド**も逐一保持されており、フィールドに依存してエラー位置特定や分類統計をするコードは変更不要です：

| 型 | フィールド | 型 | 説明 |
|------|------|------|------|
| `SyntaxError` | `Offset` | `int64` | エラー発生までに読み取ったバイト数 |
| `UnmarshalTypeError` | `Offset` | `int64` | エラー発生までに読み取ったバイト数 |
| `UnmarshalTypeError` | `Struct` | `string` | エラーフィールドを含むルート型名 |
| `UnmarshalTypeError` | `Field` | `string` | ルートノードからエラー値までの完全パス |
| `UnsupportedValueError` | `Str` | `string` | サポートされない値のテキスト表現（NaN、+Inf など） |

`UnmarshalTypeError` の `Struct` / `Field` が非空のとき、`Error()` は `json: cannot unmarshal <value> into Go struct field <Struct>.<Field> of type <type>` を出力し、標準ライブラリと逐字一致します。

::: tip オプションの cfg 引数
追加の `cfg ...Config` 引数はすべて**オプション**（可変引数）です。未渡しの場合、通常データに対する動作は標準ライブラリと一致します（デフォルト入力検証の境界差異は下記の[動作差異](#動作差異)を参照）。セキュリティモードやキャッシュなどの拡張能力が必要なときにのみ渡します。

cfg に関する 3 つの**意図的な例外**（ライブラリの設計規約に由来）：

- **型付き読み取り関数**（`GetTyped`、`GetString`、`GetInt` など）の可変引数は cfg ではなく**デフォルト値**です——Go は可変引数を 1 つしか許可しません。設定化された型読み取りが必要な場合は、`SafeGet` に切り替えるか、`New(cfg)` で作成した Processor の型付き読み取りメソッド（`GetString`、`GetInt` など）を使ってください。
- **便利バリアント**（`SetCreate`、`SetMultipleCreate`、`DeleteClean`）は `CreatePaths`（または `CleanupNulls` + `CompactArrays`）フラグを強制有効にした通常版と等価です。
- `Valid` は単一の `bool` を返します（標準ライブラリシグネチャ）。失敗理由が必要な場合は `ValidWithConfig`（`bool, error` を返す）を使ってください。
:::

## コードサンプル：import だけ変更

次のサンプルは「import だけ変更」の置き換え効果を示します。エンコード、デコード、構造体タグ（struct tag）の使い方は `encoding/json` と完全に同じです：

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	type User struct {
		Name string   `json:"name"`
		Age  int      `json:"age"`
		Tags []string `json:"tags"`
	}

	// エンコード — encoding/json と完全に同じ
	user := User{Name: "Alice", Age: 30, Tags: []string{"go", "json"}}
	b, err := json.Marshal(user)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(b))
	// 出力: {"name":"Alice","age":30,"tags":["go","json"]}

	// デコード — encoding/json と完全に同じ
	var u User
	if err := json.Unmarshal(b, &u); err != nil {
		panic(err)
	}
	fmt.Printf("%+v\n", u)
	// 出力: {Name:Alice Age:30 Tags:[go json]}
}
```

## 追加能力

移行後は、標準ライブラリ互換を維持しながら、標準ライブラリではできない以下の能力を必要に応じて使えます：

| 能力 | 例 | 詳しくは |
|---|---|---|
| パスクエリ | `json.GetString(data, "user.name")` | [パス式の構文](./path-syntax) |
| デフォルト値付き取得 | `json.GetInt(data, "timeout", 30)` | [クエリと取得](../api-reference/functions/query) |
| ジェネリクス取得 | `json.GetTyped[User](data, "user")` | [ジェネリクス操作](../api-reference/generics) |
| パス変更 | `json.Set(data, "user.name", "Bob")` | [変更操作](../api-reference/functions/modify) |
| Schema 検証 | `json.ValidateSchema(data, schema)` | [Schema 検証](../api-reference/schema) |
| ストリーミング JSONL | `json.StreamLinesInto[T](r, fn)` | [JSONL 処理](../streaming/jsonl) |
| 高性能プロセッサ | `p, _ := json.New()` | [Processor ガイド](./processor-guide) |
| 事前解析/パスプリコンパイル | `p.PreParse` / `p.CompilePath` | [Processor ガイド](./processor-guide) |
| 並行イテレーション | `json.NewParallelIterator(items).ForEach(fn)` | [並行処理](../advanced/concurrency) |
| コンテキストキャンセル | `json.GetWithContext(ctx, data, path)` | [クエリと取得](../api-reference/functions/query) |
| JSON の深い比較 | `json.CompareJSON(a, b)` | [補助ツール](../api-reference/helpers) |
| フック/監査/計時 | `p.AddHook(json.LoggingHook(logger))` | [Hook フックシステム](../extensions/hooks) |
| セキュリティモード | `json.SecurityConfig()` | [セキュリティモード](../security/security-mode) |
| 実行統計/ヘルスチェック | `json.GetStats()` / `json.GetHealthStatus()` | [Processor ガイド](./processor-guide#監視と診断) |

## 動作差異

**通常データ**に対しては、デフォルト設定の動作は `encoding/json` と一致します。注意が必要な点：`cybergodev/json` はデフォルトで**入力セキュリティ検証**の層を持っています（セキュアな JSON ライブラリとしての位置づけによるもの）。制限超過や危険パターンを含む入力は拒否され、標準ライブラリは無条件に受け入れます。差異は次の表に集約されます：

| 差異点 | encoding/json | CyberGo のデフォルト動作 | 別の動作が必要な場合 |
|---|---|---|---|
| 入力サイズ | 無制限 | 100MB 超過（`MaxJSONSize`）で `ErrSizeLimit` を返す | `cfg.MaxJSONSize` を引き上げる |
| ネスト深度 | 明示的な制限なし | 200 層超過で `ErrDepthLimit` | `MaxNestingDepthSecurity` を調整 |
| 危険コンテンツパターン | 検査しない | 28 個の内蔵パターンをデフォルトでブロック（`__proto__`、`<script`、`javascript:`、`eval(`、`onload` など）、`ErrSecurityViolation` を返す | 信頼を確認した上で `cfg.DisableDefaultPatterns = true`（`__proto__` などの重要パターンは依然ブロック） |
| コンテナ幅 | 無制限 | 単一オブジェクト ≤ 10 万キー、単一配列 ≤ 10 万要素 | `MaxObjectKeys` / `MaxArrayElements` を調整 |
| 無効 UTF-8 | デコード時に U+FFFD に置換 | 直接拒否（`ErrInvalidJSON`） | 入力エンコーディングを事前に修正 |
| BOM プレフィックス | 構文エラー | 拒否（`ErrInvalidJSON`） | 前処理で BOM を除去 |

誤解しやすい 2 点：

1. **エラーメッセージがより豊か**：パス操作の失敗時に返される `JsonsError` は操作名、パス、基底原因を保持します（`errors.Is`/`errors.As` と `Unwrap` をサポート）。ただし標準ライブラリ互換関数（`Unmarshal`/`Decode` など）のエラー型は**変わりません**——引き続き `SyntaxError`、`UnmarshalTypeError` などの標準形態を返します。
2. **検証は入力にのみ作用**：上記の制限は JSON テキスト入力（`Unmarshal`、`Get`、`Parse`、`Valid` など）に対するものです。`Marshal`/`Encode` による Go 値のエンコードでは内容検証を行いません。

信頼できない入力を扱う場合は、`json.SecurityConfig()` プリセット（より厳しい制限 + 完全スキャン）の使用を推奨します。詳しくは[セキュリティモード](../security/security-mode)を参照してください。

## 移行 FAQ

**Q：`json.Number` の大きな数値の精度動作は変わりましたか？**

変わりません。`Decoder.UseNumber()` は標準ライブラリと一致し、`Number.Int64()`/`Float64()` の動作も不変です。元の数値テキストを保持したい場合は従来どおり `json.Number` を使ってください。

**Q：HTML エスケープのデフォルト動作は一致していますか？**

一致しています。`Marshal`/`Encode` はデフォルトで `<`、`>`、`&` をエスケープします（標準ライブラリと同じ）。`Encoder.SetEscapeHTML(false)` でオフにできます——動作・シグネチャともに互換です。

**Q：既存コードが `json.Marshaler`/`json.Unmarshaler` でカスタム型を定義している場合は？**

完全互換です。両インターフェースは通常どおり有効で、それらを実装したカスタム型はエンコード/デコードパスで動作が一致します。

**Q：新規コードだけ追加能力を使い、旧コードはそのままにできますか？**

できます。それが設計目標です。パッケージレベル関数は「末尾 cfg」ごとに対応する Processor をキャッシュし（前述の cfg 規約を参照）、cfg を渡さない呼び出しはデフォルト設定のグローバルプロセッサを経由します——通常データについては標準ライブラリと一致し、デフォルト入力検証の差異は前述の[動作差異](#動作差異)表を参照してください。

**Q：`Unmarshal` が `onload`、`eval(` などの文字列を含む正当なデータを拒否しました。どうすれば？**

これはデフォルトの入力検証が注入パターンをブロックしているためです。入力の信頼性を確認した上で、デフォルトパターンセットをオフにできます：

```go
cfg := json.DefaultConfig()
cfg.DisableDefaultPatterns = true
err := json.Unmarshal(data, &v, cfg)
```

`__proto__`、`constructor[`、`prototype.` の 3 つの重要パターンはこのスイッチの影響を受けず**常にブロック**されます。ルールを追加したいだけなら、`AdditionalDangerousPatterns` でカスタムパターンを追加すればよく、デフォルトセットをオフにする必要はありません。

**Q：100MB 超のドキュメントが `ErrSizeLimit` で拒否されました。どう対処すれば？**

2 つの方法があります：全体を処理する必要がある場合は `cfg.MaxJSONSize` を引き上げます。より推奨はストリーミング処理への切り替えです（`NewStreamIterator` / `NewStreamObjectIterator` で要素単位に読み取る、または JSONL 系で行単位に処理する）。メモリへの全読み込みを避けられます。詳しくは[大規模ファイル処理](../streaming/large-files)を参照してください。

## 次のステップ

- [クイックスタート](./) — 5 分で主要機能を習得
- [パス式の構文](./path-syntax) — パスクエリ構文を学ぶ
- [チートシート](./cheatsheet) — API クイックリファレンス
