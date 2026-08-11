---
sidebar_label: "変数展開"
title: "変数展開 - CyberGo env | ${VAR} 参照とデフォルト値構文"
description: "CyberGo env 変数展開構文ガイド。${VAR} と ${VAR:-default} 参照、${VAR:=default} デフォルト値、${VAR:?error} 必須検証、$VAR 省略記法、循環参照検出と MaxExpansionDepth 深さ制限を詳解し、設定再利用と動的値置換を実現。"
sidebar_position: 4
sidebar_icon: "🔧"
---

# 変数展開

env ライブラリは設定ファイル内での変数参照をサポートし、設定の再利用と動的値置換を実現します。

## 変数展開の有効化

```go
cfg := env.DefaultConfig()
cfg.ExpandVariables = true  // デフォルトで有効

loader, _ := env.New(cfg)
loader.LoadFiles(".env")
```

## 基本構文

### シンプルな参照

```bash
# 他の変数を参照
BASE_URL=https://api.example.com
API_URL=${BASE_URL}/v1
# API_URL は展開後：https://api.example.com/v1

# 省略記法
HOST=localhost
URL=$HOST:8080
# URL は展開後：localhost:8080
```

### デフォルト値構文

| 構文 | 説明 |
|------|------|
| `${VAR:-default}` | VAR が存在しない場合、default を使用 |
| `${VAR:=default}` | VAR が存在しない場合、default を使用（`:-` と同じ） |
| `${VAR:?error}` | VAR が存在しないか空の場合、エラーを返す |

::: warning 自己参照の制限
`:-`、`:=`、`:?` が参照する変数は代入されるキーと**異なる**必要があります。`KEY=${KEY:-default}` のような自己参照は循環参照として認識され、読み込み時に `ErrExpansionDepth` エラーを報告します。あるキーにデフォルト値を設定する場合は直接リテラルを代入（`KEY=default`）するか、他の変数を参照してください（以下の例を参照）。
:::

---

## 構文の詳細

### `${VAR:-default}` - デフォルト値の使用

最も一般的なデフォルト値構文。変数が存在しない場合にデフォルト値を使用し、変数が存在する場合（値が空でも）は元の値を使用します：

```bash
# HOST が定義済み、その値を使用
HOST=localhost
PRIMARY_HOST=${HOST:-127.0.0.1}
# PRIMARY_HOST は展開後：localhost

# TIMEOUT が未定義の場合、デフォルト値 "30s" を使用
TIMEOUT_VALUE=${TIMEOUT:-30s}
# TIMEOUT_VALUE は展開後：30s

# ネストしたデフォルト値
DB_HOST=localhost
DB_URL=${DB_HOST}:${DB_PORT:-5432}
# DB_HOST=localhost で DB_PORT が未定義の場合
# DB_URL は展開後：localhost:5432
```

**使用シーン：**
- オプション設定項目のデフォルト値
- 開発/本番環境の統一設定

---

### `${VAR:=default}` - デフォルト値の使用

`${VAR:-default}` と同じ動作で、変数が存在しない場合にデフォルト値を使用します：

```bash
# DEBUG が未定義の場合 "false" を使用
DEBUG_VALUE=${DEBUG:=false}

# CACHE_TTL が未定義の場合デフォルト値を使用
CACHE_TTL_VALUE=${CACHE_TTL:=3600}
```

::: info `:-` との関係
`${VAR:=default}` は本ライブラリでは `${VAR:-default}` と完全に同じ動作です。変数が存在しない場合、デフォルト値を展開結果として使用します。`:=` はデフォルト値を変数ストレージに書き戻しません。
:::

---

### `${VAR:?error}` - エラーメッセージ

変数が存在しないか空の場合にエラーを返します：

```bash
# DATABASE_URL が未定義の場合、読み込み失敗しエラーを表示
DB_URL=${DATABASE_URL:?Database URL is required}

# API_TOKEN が未定義の場合、エラー
AUTH_TOKEN=${API_TOKEN:?API_TOKEN must be set}
```

**使用シーン：**
- 必須設定項目の検証
- 早期失敗、実行時エラーの回避

---

## エスケープ

### ドル記号のエスケープ

`$$` でリテラル `$` を表します：

```bash
# 価格設定
PRICE=$$99.99
# 展開後：$99.99

# $ を含む文字列
MESSAGE=Price is $$100
# 展開後：Price is $100
```

### 引用符と展開

変数展開は引用符の剥离後の統一後処理段階で発生し、**単一引用符も二重引用符も変数展開に影響しません**。例えば `SINGLE='${BASE}'`（`BASE=hello`）の展開後の値は `hello` で、二重引用符と同じ動作です；参照された変数が未定義の場合（`LITERAL='${NO_EXPANSION}'` など）、結果は空文字列で、`${NO_EXPANSION}` リテラルは保持されません。

単一引用符と二重引用符の違いは**リテラル解析**のみ：二重引用符は `\n`、`\t` などのエスケープシーケンスを処理し、単一引用符はそのまま保持します（エスケープなし）。

::: warning 注意
引用符で「展開を禁止」しないでください。`${VAR}` リテラルを保持する必要がある場合は、以下の方法を使用してください：
:::

```bash
# 方式 1：ドル記号をエスケープ（$$ はリテラル $ に展開）
LITERAL='$${NO_EXPANSION}'
# 値：${NO_EXPANSION}
```

```go
// 方式 2：グローバル変数展開を無効化
cfg := env.DefaultConfig()
cfg.ExpandVariables = false
```

---

## ネスト展開

変数はネストして参照できます：

```bash
# 基本設定（組み込み禁止キー ENV の使用を避け、DEPLOY_ENV を使用）
APP_NAME=myapp
DEPLOY_ENV=production

# ネスト参照
DB_HOST=db.${DEPLOY_ENV}.example.com
# 展開後：db.production.example.com

API_URL=https://${APP_NAME}.${DEPLOY_ENV}.api.example.com
# 展開後：https://myapp.production.api.example.com
```

---

## 循環検出

ライブラリは循環参照を自動検出しエラーを返します：

```bash
# 循環参照（エラー）
A=${B}
B=${A}

# 読み込み時に ErrExpansionDepth エラーを返す
```

---

## 展開深さの制限

デフォルトの最大展開深さは 5、ハード上限は 20 です：

```go
cfg := env.DefaultConfig()
cfg.MaxExpansionDepth = 10  // カスタム深さ
```

| 定数 | 値 | 説明 |
|------|---|------|
| `DefaultMaxExpansionDepth` | 5 | デフォルト値（公開 API） |

::: info ヒント
ハード上限は 20（内部制限）です。設定の `MaxExpansionDepth` はこの制限を超えることはできません。
:::

---

## 完全な例

```bash
# .env ファイル

# 基本設定（組み込み禁止キー ENV の使用を避ける）
APP_NAME=myapp
DEPLOY_ENV=development
DEBUG=true

# データベース設定
DB_HOST=localhost
DB_PORT=5432
DB_NAME=${APP_NAME}
DB_URL=postgres://${DB_HOST}:${DB_PORT}/${DB_NAME}

# API 設定
API_BASE=https://api.${DEPLOY_ENV}.example.com
API_URL=${API_BASE}/v1

# ログ設定
LOG_LEVEL=info

# 価格（エスケープ）
PRICE=$$99.99
```

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/env"
)

func main() {
    cfg := env.DefaultConfig()
    cfg.ExpandVariables = true

    loader, err := env.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer loader.Close()

    err = loader.LoadFiles(".env")
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println("DB_URL:", loader.GetString("DB_URL"))
    fmt.Println("API_URL:", loader.GetString("API_URL"))
    fmt.Println("PRICE:", loader.GetString("PRICE"))
}
```

---

## 関連ドキュメント

- [クイックスタート](/ja/env/getting-started/) - 基本的な使い方
- [Config API](/ja/env/api-reference/config) - ExpandVariables 設定
- [定数とエラー](/ja/env/api-reference/constants) - 展開深さ制限
