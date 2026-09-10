---
sidebar_label: "パス式の構文"
title: "パス式の構文 - CyberGo JSON | JSONPath クエリガイド"
description: "CyberGo JSON パス式構文の完全ガイド：プロパティアクセス、配列インデックスと負インデックス、スライス、ワイルドカード、複数フィールドとフラット化抽出、JSON Pointer（RFC 6901）。各構文に入出力対照を伴い、範囲外やサイレントな未検出などの落とし穴もまとめます。"
sidebar_position: 2
---

# パス式の構文

json ライブラリは豊富なパス式構文をサポートし、JSON データ内の任意のノードを特定して操作できます。

## 基本構文

### プロパティアクセス

ドット `.` でオブジェクトのプロパティにアクセスします：

```go
data := `{"user": {"name": "Alice", "age": 30}}`

name := json.GetString(data, "user.name")    // "Alice"
age := json.GetInt(data, "user.age")         // 30
```

### ネストパス

ドットを連続して使って深いネストのプロパティにアクセスします：

```go
data := `{
    "company": {
        "department": {
            "team": {
                "lead": "Bob"
            }
        }
    }
}`

lead := json.GetString(data, "company.department.team.lead")  // "Bob"
```

### 配列インデックス

2 つの構文で配列要素にアクセスできます：

```go
data := `{"items": ["a", "b", "c", "d", "e"]}`

// 構文 1：ドット + インデックス
first := json.GetString(data, "items.0")   // "a"

// 構文 2：ブラケット + インデックス
first2 := json.GetString(data, "items[0]")   // "a"
```

#### 負インデックス

負インデックスは配列末尾から数え、`-1` が最後の要素を表します：

```go
data := `{"items": ["a", "b", "c", "d", "e"]}`

val := json.GetString(data, "items[-1]")  // "e"（最後）
val = json.GetString(data, "items[-2]")   // "d"（後ろから 2 番目）
val = json.GetString(data, "items[-5]")   // "a"（[0] と同じ）
```

| インデックス | 意味 | 等価な正インデックス |
|------|------|-----------|
| `[0]` | 最初の要素 | — |
| `[1]` | 2 番目の要素 | — |
| `[-1]` | 最後の要素 | `[len-1]` |
| `[-2]` | 後ろから 2 番目 | `[len-2]` |
| `[-N]` | 後ろから N 番目 | `[len-N]` |

#### 多次元配列

インデックスを連続して使ってネスト配列にアクセスします：

```go
data := `{"matrix": [[1, 2, 3], [4, 5, 6], [7, 8, 9]]}`

val := json.GetInt(data, "matrix[0][0]")   // 1
val = json.GetInt(data, "matrix[1][2]")    // 6
val = json.GetInt(data, "matrix[-1][-1]")  // 9
```

#### 境界動作

範囲外インデックスでも panic せず、エラーにもなりません——型安全な取得関数はゼロ値を返し、`Get` は nil を返します：

```go
data := `{"items": ["a", "b", "c"]}`

// 正インデックスの範囲外 → ゼロ値 / nil、いずれもエラーにならない
json.GetString(data, "items[10]")   // ""   （空文字列）
json.GetInt(data, "items[10]")      // 0
json.Get(data, "items[10]")         // nil, nil（注意：err も nil）

// 負インデックスの範囲外 → 同様にゼロ値
json.GetString(data, "items[-10]")  // ""   （空文字列）
json.GetInt(data, "items[-10]")     // 0
```

| 関数 | 範囲外の戻り値 |
|------|-----------|
| `Get` | `(nil, nil)` — エラーにならない |
| `GetString` | `""` |
| `GetInt` | `0` |
| `GetFloat` | `0.0` |
| `GetBool` | `false` |
| `GetArray` | `nil` |

::: tip インデックスの境界
- 正インデックスは `[0, len)` の範囲内である必要があり、負インデックスも変換後（`len + index`）同様です
- 範囲外アクセスはゼロ値 / nil を返し、panic もエラーも起こりません
- `ErrPathNotFound` が返るのは「オブジェクトキーが存在しない」場合のみ（`json.Get(data, "nosuchkey")` など）。配列要素の存在判定は戻り値も併せて見る必要があり、err だけでは判断できません
:::

---

## 高度な構文

### 配列スライス `[start:end:step]`

配列からサブ配列を抽出します。Python 風のスライス構文 `[start:end:step]` を採用し、3 つのパラメータはすべて省略可能です：

| パラメータ | 説明 | 省略時のデフォルト |
|------|------|-------------|
| `start` | 開始インデックス（含む） | `0`（正ステップ）または `len-1`（負ステップ） |
| `end` | 終了インデックス（含まない） | `len`（正ステップ）または `-1`（負ステップ） |
| `step` | ステップ | `1` |

#### スライス構文早見表

| 構文 | 意味 | 例（`[0,1,2,3,4]`） | 結果 |
|------|------|----------------------|------|
| `[:]` | 完全コピー | `[0,1,2,3,4][:]` | `[0,1,2,3,4]` |
| `[N:]` | N から末尾まで | `[0,1,2,3,4][2:]` | `[2,3,4]` |
| `[:N]` | 先頭から N まで | `[0,1,2,3,4][:3]` | `[0,1,2]` |
| `[N:M]` | N から M-1 まで | `[0,1,2,3,4][1:4]` | `[1,2,3]` |
| `[::S]` | S 個おきに取得 | `[0,1,2,3,4][::2]` | `[0,2,4]` |
| `[N::S]` | N から、ステップ S | `[0,1,2,3,4][1::2]` | `[1,3]` |
| `[:M:S]` | 先頭から M まで、ステップ S | `[0,1,2,3,4][:4:2]` | `[0,2]` |
| `[N:M:S]` | 完全な 3 パラメータ | `[0,1,2,3,4][0:5:2]` | `[0,2,4]` |
| `[::-1]` | 配列の反転 | `[0,1,2,3,4][::-1]` | `[4,3,2,1,0]` |
| `[::-S]` | 逆方向ステップ | `[0,1,2,3,4][::-2]` | `[4,2,0]` |

#### 正方向スライス

```go
data := `{"numbers": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]}`

// 基本スライス
slice := json.GetArray(data, "numbers[2:5]")    // [2, 3, 4]

// start 省略（先頭から）
slice2 := json.GetArray(data, "numbers[:3]")      // [0, 1, 2]

// end 省略（末尾まで）
slice3 := json.GetArray(data, "numbers[7:]")      // [7, 8, 9]

// ステップ 2（偶数番目の要素）
slice4 := json.GetArray(data, "numbers[::2]")     // [0, 2, 4, 6, 8]

// 完全パラメータ
slice5 := json.GetArray(data, "numbers[1:8:3]")   // [1, 4, 7]

// 完全コピー
slice6 := json.GetArray(data, "numbers[:]")       // [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
```

#### 負インデックススライス

スライスの `start` と `end` はどちらも負インデックスに対応しています：

```go
data := `{"numbers": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]}`

// 最後の 3 要素を取得
json.GetArray(data, "numbers[-3:]")    // [7, 8, 9]

// 最後の 2 要素を除去
json.GetArray(data, "numbers[:-2]")    // [0, 1, 2, 3, 4, 5, 6, 7]

// 後ろから 5 番目から後ろから 2 番目まで
json.GetArray(data, "numbers[-5:-2]")  // [5, 6, 7]

// インデックス 2 から後ろから 1 番目まで（最後は含まない）
json.GetArray(data, "numbers[2:-1]")   // [2, 3, 4, 5, 6, 7, 8]
```

#### 逆方向スライス

負ステップで逆方向走査を実現します：

```go
data := `{"letters": ["a", "b", "c", "d", "e"]}`

// 配列の反転
json.GetArray(data, "letters[::-1]")    // ["e", "d", "c", "b", "a"]

// 逆方向ステップ 2
json.GetArray(data, "letters[::-2]")    // ["e", "c", "a"]

// インデックス 3 から 1 まで（逆方向）
json.GetArray(data, "letters[3:1:-1]")  // ["d", "c"]

// 末尾から逆方向に先頭 3 つを取得
json.GetArray(data, "letters[2::-1]")   // ["c", "b", "a"]
```

#### 境界動作

スライスは範囲外インデックスを自動的にクリップ（clamp）し、エラーを返しません：

```go
data := `{"items": [0, 1, 2]}`

// 範囲外の start/end は有効範囲に自動クリップされる
json.GetArray(data, "items[0:100]")   // [0, 1, 2]（end は len=3 にクリップ）
json.GetArray(data, "items[10:20]")   // []（start >= end、空の結果）

// start >= end の場合は空配列
json.GetArray(data, "items[2:2]")     // []
json.GetArray(data, "items[3:1]")     // []
```

::: warning スライスとインデックスの境界処理の違い
- **インデックス範囲外**（`items[10]` など）は対応する型のゼロ値を返し、エラーにならない
- **スライス範囲外**（`items[10:20]` など）は自動クリップされ、空配列を返し、エラーにならない
:::

### フィールド抽出 `{field1,field2}`

オブジェクトから特定のフィールドだけを抽出します：

```go
data := `{
    "user": {
        "id": 1001,
        "name": "Alice",
        "email": "alice@example.com",
        "password": "secret",
        "age": 25
    }
}`

// id と name だけを抽出
extracted, err := json.Get(data, "user{id,name}")
if err != nil {
    panic(err)
}
// 結果: {"id": 1001, "name": "Alice"}
```

### フラット化抽出 `{flat:field}`

配列オブジェクトのフィールドから値を抽出するとき、フィールド自体も配列だと通常の抽出ではネスト配列になります。`{flat:}` プレフィックスを使うと、すべてのネスト配列を再帰的に展開し、フラットな結果配列が得られます。

#### 通常抽出 vs フラット化抽出

```go
data := `{
    "groups": [
        {"tags": ["go", "json"]},
        {"tags": ["python", "yaml"]}
    ]
}`

// 通常抽出 → ネスト配列
json.GetArray(data, "groups{tags}")
// [["go", "json"], ["python", "yaml"]]

// フラット化抽出 → 1 次元配列に展開
json.GetArray(data, "groups{flat:tags}")
// ["go", "json", "python", "yaml"]
```

#### チェーンフラット化抽出

多層のネスト配列には `{flat:}` を連続して使って階層ごとに展開できます：

```go
data := `{
    "departments": [
        {
            "teams": [
                {"members": [{"name": "Alice"}, {"name": "Bob"}]}
            ]
        },
        {
            "teams": [
                {"members": [{"name": "Carol"}]}
            ]
        }
    ]
}`

// 3 層フラット化：departments → teams → members → name
json.GetArray(data, "departments{flat:teams}{flat:members}{name}")
// ["Alice", "Bob", "Carol"]
```

#### フラット化抽出に続く他の操作

フラット化抽出の結果には、スライスやインデックスなどの操作を続けられます：

```go
data := `{
    "orders": [
        {"items": ["book", "pen"]},
        {"items": ["laptop", "mouse", "keyboard"]},
        {"items": ["cup"]}
    ]
}`

// フラット化後にスライス
json.GetArray(data, "orders{flat:items}[0:3]")
// ["book", "pen", "laptop"]
```

::: info 制限
- `{flat:field1,field2}` の複数フィールド抽出では `flat` フラグは有効になりません。複数フィールド抽出が生成するのは配列ではなくオブジェクトだからです
- フラット化は第 1 層だけでなく、すべての階層のネスト配列を再帰的に展開します
:::

### 追加操作 `[+]`

配列の末尾に要素を追加します：

```go
data := `{"items": [1, 2, 3]}`

updated, err := json.Set(data, "items[+]", 4)
if err != nil {
    panic(err)
}
// 結果: {"items": [1, 2, 3, 4]}

updated, err = json.Set(updated, "items[+]", 5)
if err != nil {
    panic(err)
}
// 結果: {"items": [1, 2, 3, 4, 5]}

// スライス値を追加すると複数要素に展開される（ネスト配列にはならない）
updated, err = json.Set(updated, "items[+]", []any{6, 7})
if err != nil {
    panic(err)
}
// 結果: {"items": [1, 2, 3, 4, 5, 6, 7]}
```

::: warning [+] の前置パスは既存の配列である必要あり
`items[+]` は追加のみを行い、配列は作成しません。ターゲットパスが存在しない、または配列でない場合はエラーになります（"cannot append to non-array type"）。先に `SetCreate(data, "items", []any{})` で配列を作ってから追加してください。
:::

### ワイルドカード `[*]`

ワイルドカードは配列（またはオブジェクト）の**すべての要素**にマッチし、クエリと変更の両方のシーンで役立ちます：

```go
data := `{"items": [1, 2, 3]}`

updated, err := json.Set(data, "items[*]", 0)
if err != nil {
    panic(err)
}
// 結果: {"items": [0, 0, 0]}
```

#### クエリシーン：フィールドの収集

ワイルドカードの後にプロパティパスを続けると、各要素のそのフィールドの値を**配列として収集**します：

```go
users := `{"users": [{"name": "John"}, {"name": "Jane"}]}`

// [*].field → すべての要素のフィールド値を収集
names, err := json.Get(users, "users[*].name")
if err != nil {
    panic(err)
}
fmt.Println(names) // [John Jane]

// 単独で最後のセグメントとして使うと、[*] は配列自体と等価
arr, _ := json.GetArray(data, "items[*]") // [1, 2, 3]
```

#### ドット略記 `*`

`*` は `[*]` の代わりに使え、2 つの書き方は等価です：

```go
symbols := `[
    {"symbol": "AAPL", "price": 180},
    {"symbol": "GOOG", "price": 140}
]`

// 先頭のワイルドカード：ルート配列に作用
a, _ := json.GetArray(symbols, "[*].symbol") // [AAPL GOOG]
b, _ := json.GetArray(symbols, "*.symbol")   // [AAPL GOOG]、上と等価
```

::: tip Foreach との分担
`[*].field` は「1 つのフィールドだけ」を収集するのに適します。要素ごとに複数フィールドへアクセスする必要がある場合は、[`ForeachWithPath`](./processor-guide) の方が直接的です。
:::

---

## パス検証

### Processor によるパス検証

`Processor.CompilePath` でパス形式が正しいか検証できます：

```go
p, err := json.New()
if err != nil {
    panic(err)
}

// パスをコンパイル（形式を自動検証）
cp, err := p.CompilePath("user.profile.name")
if err != nil {
    fmt.Println("Invalid path:", err)
}

cp, err = p.CompilePath("items[0:10:2]")
if err != nil {
    fmt.Println("Invalid path:", err)
}
```

---

## 特殊パス

### ルートパス

空文字列 `""` または `"."` はルートを表します：

```go
data := `{"name": "test"}`

// オブジェクト全体を取得
root, err := json.Get(data, "") // {"name": "test"}
if err != nil {
    panic(err)
}
root, err = json.Get(data, ".") // 同上
```

### JSON Pointer（RFC 6901）

`/` で始まるパスは JSON Pointer 構文（スラッシュ区切り）で解析されます。ドット構文とは独立した 2 つの表記であり、混在はできません：

```go
data := `{"user": {"name": "Alice"}, "items": ["a", "b"]}`

name := json.GetString(data, "/user/name") // "Alice"
item := json.GetString(data, "/items/0")   // "a"
```

- キー名に `/` や `~` が含まれる場合は `~1`、`~0` でエスケープ（`a~1b` はキー `a/b` を表す）
- 配列添字は**非負**の整数である必要があります：Pointer モードは負インデックスをサポートせず、`/items/-1` はターゲットを見つけられません。`/items/-` は末尾のまだ存在しない位置を指し、これも見つかりません
- `Set` は JSON Pointer 経由で配列を拡張できません（範囲外は直接エラー）。範囲外への書き込みが必要な場合はドットパスを使ってください
- 単独の `/` はルートを表し、`""`、`.` と等価です

### パスエスケープ

キー名に特殊文字が含まれる場合はバックスラッシュでエスケープします。エスケープ可能な文字は 6 種類です：

| エスケープ表記 | マッチするキー名の文字 |
|----------|----------------|
| `\\.` | リテラルのドット `.` |
| `\\\\` | リテラルのバックスラッシュ `\` |
| `\\[` / `\\]` | リテラルのブラケット `[` `]` |
| `\\{` / `\\}` | リテラルの波括弧 `{` `}` |

```go
data := `{
    "user.name": "Alice",
    "a[b]": "bracket",
    "config\\local": "backslash"
}`

// ドットを含むキー名
name := json.GetString(data, "user\\.name")    // "Alice"

// ブラケットを含むキー名
bracket := json.GetString(data, "a\\[b\\]")    // "bracket"

// バックスラッシュを含むキー名
bs := json.GetString(data, "config\\\\local")  // "backslash"
```

::: warning Go 文字列とパスエスケープは 2 層
上の例を Go ソースコードに書くと**二重バックスラッシュ**（`"user\\.name"`）になります——Go 文字列リテラルがまず 1 層消費し、パスパーサーが受け取る `user\.name` でもう 1 層消費します。パスが実行時変数（非リテラル）から来る場合は単層エスケープで十分です：リテラルの `"user\\.name"` == 実行時の `user\.name`。
:::

---

## パスセグメント型

ライブラリ内部はパスを異なる型のセグメントに解析します（以下は内部実装の詳細で、公開 API としてはエクスポートされません）：

| 型 | 構文例 | 説明 |
|------|----------|------|
| プロパティアクセス | `user.name` | オブジェクトプロパティにアクセス |
| 配列インデックス | `items[0]` | 配列要素にアクセス |
| 配列スライス | `items[1:5]` | スライス範囲アクセス |
| ワイルドカード | `items[*]` | すべての要素にマッチ |
| フィールド抽出 | `{name,email}` | 複数フィールドを抽出 |
| フラット化抽出 | `{flat:tags}` | 抽出してネスト配列を再帰的に展開 |
| 追加操作 | `items[+]` | 配列に要素を追加 |
| JSON Pointer | `/user/name` | `/` で始まる RFC 6901 構文 |

---

## 構文の落とし穴

以下の動作はいずれもライブラリの実際の実装に基づくものです。事前に知っておけばデバッグ時間を大幅に節約できます。

### 抽出が見つからなくてもエラーにならない

フィールド抽出の「見つからない」はサイレントです——`Get` は `(nil, nil)` を返し、値もエラーもありません：

```go
data := `{"user": {"id": 1}}`

json.Get(data, "user{nonexistent}") // (nil, nil) — エラーにならない
json.Get(data, "user{a,b}")         // (nil, nil) — すべてのフィールドが存在しない場合
```

そのため、抽出がヒットしたかの判定に `err != nil` は使えず、戻り値そのものを確認する必要があります。複数フィールド抽出は、1 つでもフィールドが存在すれば、ヒットしたフィールドのみを含むオブジェクトを返します。

### 単一フィールドと複数フィールド抽出で戻り形状が異なる

| パス | 対象 | 戻り値 |
|------|----------|------|
| `user{name}` | オブジェクト | フィールド値そのもの（裸値、オブジェクトではない） |
| `user{id,name}` | オブジェクト | ヒットしたフィールドのみの新しいオブジェクト |
| `users{name}` | 配列 | 各要素のフィールド値からなる配列 |
| `users{id,name}` | 配列 | 各要素の抽出結果オブジェクトからなる配列 |

```go
data := `{"user": {"id": 1, "name": "Alice", "email": "a@ex.com"}}`

json.Get(data, "user{name}")    // "Alice"（裸値）
json.Get(data, "user{id,name}") // {"id":1,"name":"Alice"}
```

### プロパティチェーンがスカラーを「貫通」すると nil を返し、エラーにならない

パスの途中で文字列や数値などのスカラーに遭遇した場合、さらにプロパティを取ると `(nil, nil)` になります。一方、**キーが存在しない**場合は `ErrPathNotFound` を返します——2 種類の「見つからない」はエラー形態が異なります：

```go
data := `{"name": "Alice"}`

json.Get(data, "name.foo")   // (nil, nil) — name は文字列で、これ以上プロパティを取れない
json.Get(data, "nosuch.foo") // (nil, ErrPathNotFound) — キー nosuch が存在しない
```

ただし、スカラーへの**配列インデックス**使用（文字列への `name[0]` など）はハードエラーで、"cannot access array index..." の説明的エラーを返します。

### 抽出は「フィールド全体が欠落」の要素をスキップするが、null 値は保持する

配列への単一フィールド抽出では、そのフィールドを持たない要素は結果項目を生成しません。フィールドが存在して値が null の要素は null 項目を 1 つ生成します：

```go
data := `{"users": [{"name": "A"}, {"age": 20}, {"name": null}]}`

json.GetArray(data, "users{name}")
// ["A", null] — name フィールドのない要素はスキップされ、値が null のものは保持される
```

### インデックス、スライス、変更の範囲外セマンティクスはそれぞれ異なる

| 操作 | 範囲外の動作 |
|------|----------|
| インデックスクエリ `items[10]` | ゼロ値 / `(nil, nil)` を返し、エラーにならない |
| スライスクエリ `items[10:20]` | 有効範囲に自動クリップされ、空配列 `[]` を返す |
| 変更 `Set(data, "items[5]", v)`（len=3） | デフォルト設定では配列が `null` でパディングされ添字 5 まで拡張 |

### JSON Pointer とドット構文は混在できない

パスが `/` で始まると全体が Pointer モードに入ります——`"/user.name"` は `user.name` を**1 つのキー名**として検索します。逆に言えば、これがドットやブラケットを含むキー名にアクセスする最も手軽な方法です（バックスラッシュエスケープが不要）：

```go
data := `{"a.b": 1, "c[0]": 2}`

json.GetInt(data, "/a.b")  // 1 — Pointer モードではドットはキー名の一部
json.GetInt(data, "/c[0]") // 2
```

---

## 完全なサンプル

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{
        "store": {
            "books": [
                {"title": "Go 101", "price": 25, "category": "programming"},
                {"title": "JSON Guide", "price": 35, "category": "programming"},
                {"title": "Clean Code", "price": 45, "category": "programming"}
            ],
            "prices": [10, 20, 30, 40, 50]
        }
    }`

	// 1. 基本アクセス
	title := json.GetString(data, "store.books.0.title")
	fmt.Println("First book:", title)

	// 2. 配列スライス
	books := json.GetArray(data, "store.books[0:2]")
	fmt.Printf("First 2 books: %d items\n", len(books))

	// 3. ステップ付きスライス
	prices := json.GetArray(data, "store.prices[::2]")
	fmt.Println("\nEvery other price:", prices)

	// 4. フィールド抽出
	extracted, err := json.Get(data, "store.books[0]{title,price}")
	if err != nil {
		panic(err)
	}
	fmt.Println("\nExtracted fields:", extracted)

	// 5. 要素の追加
	updated, err := json.Set(data, "store.books[+]", map[string]any{
		"title":    "New Book",
		"price":    55,
		"category": "programming",
	})
	if err != nil {
		panic(err)
	}
	fmt.Println("\nAfter append:", json.Valid([]byte(updated)))
}
```

## 次のステップ

- [API ドキュメント](../api-reference/) — 完全な API リファレンスを見る
- [使用例](../examples/) — より多くの実践的なサンプル
