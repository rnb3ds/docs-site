---
sidebar_label: "トークンリフレッシュとローテーション"
title: "トークンリフレッシュとローテーション - CyberGo JWT | アクセス・リフレッシュトークン戦略"
description: "トークンリフレッシュとローテーションガイド：アクセス/リフレッシュトークンの2層 TTL 設計、CreateRefresh と Refresh フロー、カスタム Claims の RefreshInto 使用法、再利用 vs 一回限りローテーション戦略の比較、Refresh の自動失効なしのセキュリティ意味。"
sidebar_position: 25
check_code: false
---

# トークンリフレッシュとローテーション

CyberGo JWT は2層トークン設計を採用しています：短期の**アクセストークン**は API 認証に使用し、長期の**リフレッシュトークン**はアクセストークン失効後に新しいトークンを取得するために使用します。この設計はセキュリティとユーザー体験のバランスを取ります。

## 2層トークンモデル

| トークン種別 | 発行メソッド | デフォルト TTL | 用途 |
|-------------|-------------|----------------|------|
| アクセストークン | [`Create`](../api-reference/processor#create) | 15 分 | API 認証、頻繁な検証 |
| リフレッシュトークン | [`CreateRefresh`](../api-reference/processor#createrefresh) | 7 日 | 新しいアクセストークンとの交換、使用頻度が低い |

トークン種別は `token_type` クレーム（`access` / `refresh`）でマークされます。[`Refresh`](../api-reference/processor#refresh) メソッドは access 種別のトークンを拒否し、アクセストークンがリフレッシュに使用されるのを防ぎます。

### TTL 設定

```go
cfg := jwt.DefaultConfig()
cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
cfg.AccessTokenTTL = 15 * time.Minute    // アクセストークン有効期間
cfg.RefreshTokenTTL = 7 * 24 * time.Hour // リフレッシュトークン有効期間 (AccessTokenTTL より長い必要あり)
```

:::tip 制約
`Config.Validate()` は `RefreshTokenTTL > AccessTokenTTL` を要求し、違反時は `ErrInvalidConfig` を返します。
:::

## 基本的なリフレッシュフロー

### 1. トークンペアの発行

```go
package main

import (
    "fmt"
    "time"

    "github.com/cybergodev/jwt"
)

func main() {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    cfg.AccessTokenTTL = 15 * time.Minute
    cfg.RefreshTokenTTL = 7 * 24 * time.Hour

    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    claims := &jwt.Claims{UserID: "user123", Username: "alice"}

    // アクセストークン（短期）
    accessToken, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }

    // リフレッシュトークン（長期）
    refreshToken, err := processor.CreateRefresh(claims)
    if err != nil {
        panic(err)
    }

    fmt.Println("Access Token:", accessToken)
    fmt.Println("Refresh Token:", refreshToken)
}
```

### 2. 新しいアクセストークンのリフレッシュ

アクセストークン失効後、リフレッシュトークンを使って新しいトークンを取得します:

```go
// refreshToken は以前に CreateRefresh で発行されたトークン
newAccessToken, err := processor.Refresh(refreshToken)
if err != nil {
    switch {
    case errors.Is(err, jwt.ErrTokenExpired):
        // リフレッシュトークン失効、ユーザーの再認証が必要
    case errors.Is(err, jwt.ErrTokenRevoked):
        // リフレッシュトークンが失効済み
    case errors.Is(err, jwt.ErrTokenTypeMismatch):
        // リフレッシュトークンではなくアクセストークンが渡された
    default:
        // その他のエラー
    }
    return
}
fmt.Println("New Access Token:", newAccessToken)
```

`Refresh` はリフレッシュトークンを完全に検証します: 署名、有効期限、発行者、オーディエンス、ブラックリスト状態。

## カスタム Claims のリフレッシュ

カスタム Claims タイプを使用する場合、[`RefreshInto`](../api-reference/processor#refreshinto) を使ってパース結果をカスタム構造体に格納します:

```go
type MyClaims struct {
    UserID string `json:"user_id"`
    Role   string `json:"role"`
    jwt.RegisteredClaims
}

func (c *MyClaims) GetRegisteredClaims() *jwt.RegisteredClaims {
    return &c.RegisteredClaims
}

func (c *MyClaims) Validate() error {
    if c.UserID == "" {
        return errors.New("user_id is required")
    }
    return nil
}
```

```go
// カスタム Claims でリフレッシュトークンを発行
refreshToken, err := processor.CreateRefresh(&MyClaims{UserID: "123", Role: "admin"})

// カスタム構造体にリフレッシュ
result := &MyClaims{}
newToken, err := processor.RefreshInto(refreshToken, result)
```

## ローテーション戦略

### 再利用モード（デフォルト）

デフォルトでは、`Refresh` は元のリフレッシュトークンを失効**しません**。元のトークンは失効または明示的な失効まで有効で、複数回使用できます:

```go
// 最初のリフレッシュ
token1, err := processor.Refresh(refreshToken)
if err != nil {
    panic(err)
}

// 同じ refreshToken がまだ有効で、再度リフレッシュ可能
token2, err := processor.Refresh(refreshToken)
if err != nil {
    panic(err)
}
```

**適用シナリオ**: モバイルアプリ、単一デバイスログイン。ユーザーは頻繁に再認証する必要がなく、リフレッシュトークンは TTL 内で繰り返し使用できます。

### 一回限りローテーション

セキュリティ要件が高いシナリオでは、各リフレッシュ後に古いリフレッシュトークンを即座に失効させ、一回限り使用を実現します:

```go
// リフレッシュ後、即座に古いトークンを失効
newAccessToken, err := processor.Refresh(refreshToken)
if err != nil {
    panic(err)
}

// 古いリフレッシュトークンを失効させ、再使用不可にする
if err := processor.Revoke(refreshToken); err != nil {
    panic(err)
}
```

**適用シナリオ**: Web アプリケーション、高セキュリティシステム。各リフレッシュ後に古いトークンが即座に無効化され、トークン漏洩リスクを軽減します。

### 戦略比較

| 次元 | 再利用モード | 一回限りローテーション |
|------|-------------|----------------------|
| セキュリティ | 低い（漏洩トークンが再利用可能） | 高い（漏洩トークンは一回限り） |
| ユーザー体験 | 良い（頻繁な再認証不要） | 普通（リフレッシュ失敗時に再ログイン必要） |
| 実装複雑さ | 追加コード不要 | `Revoke` 呼び出し必要 |
| ブラックリスト負荷 | 低い | 高い（各リフレッシュでエントリ追加） |

:::warning リフレッシュトークン漏洩検出
一回限りローテーションモードでは、攻撃者が失効済みリフレッシュトークンを使用すると `Refresh` は `ErrTokenRevoked` を返します。アプリケーション層でこれを用いてトークン漏洩を検出し、強制再認証を行えます。
:::

## タイプ安全性

CyberGo JWT は `token_type` クレームでトークン種別を区別します。`Refresh` と `RefreshInto` はアクセストークンを拒否します:

```go
// アクセストークンでリフレッシュを試みると拒否される
_, err := processor.Refresh(accessToken)
// err は ErrTokenTypeMismatch をラップ: expected refresh token, got access token
```

これによりアクセストークンが新しいトークンの取得に使用されるのを防ぎ、2層モデルのタイプ分離を保証します。

`token_type` クレームのないトークン（旧バージョンで発行されたトークン）は後方互換性のため受け入れられます。

## セキュリティ上の注意

- **Refresh は自動失効しない**: 元のリフレッシュトークンは `Refresh` 後も有効です。一回限りローテーションには手動で `Revoke` を呼び出す必要があります。
- **Claims の深層検証なし**: `Refresh` は標準 JWT フィールド（署名、有効期限、発行者、オーディエンス、ブラックリスト）と基本構造（UserID または Username が空でない）を検証しますが、フィールド長制限やインジェクションパターンは再検証せず、作成時に検証されたことを信頼します。
- **署名の一貫性**: 新しいアクセストークンはリフレッシュトークンと同じ署名アルゴリズムとキーを使用します。アルゴリズム間のクロスリフレッシュはサポートされません。

## 次のステップ

- [トークンブラックリスト](./blacklist) — 失効メカニズムとカスタムストアバックエンド
- [エラー処理](./error-handling) — 全センチネルエラーの分類と処理
- [設定詳細](./configuration) — TTL、発行者、オーディエンス、クロックスキュー設定
- [Processor API](../api-reference/processor) — `Refresh`、`RefreshInto`、`CreateRefresh` の完全なシグネチャ
