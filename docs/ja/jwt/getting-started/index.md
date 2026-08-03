---
sidebar_label: "クイックスタート"
title: "クイックスタート - CyberGo JWT | 5 分で始める入門ガイド"
description: "CyberGo JWT クイックスタート：インストールと Processor 生成、アクセス・リフレッシュトークンの発行・検証・リフレッシュ・失効の核心用法と高度な機能へのナビゲーション。"
sidebar_position: 2
---

# クイックスタート

## インストール

```bash
go get github.com/cybergodev/jwt
```

Go 1.25+ が必要です。

## 基本的な使い方

### 1. Processor の作成

```go
package main

import (
    "fmt"
    "time"

    "github.com/cybergodev/jwt"
)

func main() {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!" // HMAC は最低 32 バイト
    cfg.AccessTokenTTL = 15 * time.Minute
    cfg.RefreshTokenTTL = 7 * 24 * time.Hour

    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close() // 秘密鍵を安全にクリア
}
```

### 2. トークンの発行

```go
claims := &jwt.Claims{
    UserID:   "user123",
    Username: "alice",
    Role:     "admin",
    Permissions: []string{"read", "write"},
}

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
```

### 3. トークンの検証

```go
parsed, valid, err := processor.Validate(accessToken)
if err != nil {
    // エラー処理：有効期限切れ、署名無効など
    panic(err)
}
if valid {
    fmt.Println("UserID:", parsed.UserID)
    fmt.Println("Role:", parsed.Role)
    fmt.Println("ExpiresAt:", parsed.ExpiresAt.Time)
}
```

### 4. トークンのリフレッシュ

```go
newAccessToken, err := processor.Refresh(refreshToken)
if err != nil {
    panic(err)
}
fmt.Println("New Access Token:", newAccessToken)
```

### 5. トークンの失効

```go
// トークンをブラックリストに追加
err := processor.Revoke(accessToken)
if err != nil {
    panic(err)
}

// 失効済みか確認
revoked, err := processor.IsRevoked(accessToken)
if err != nil {
    panic(err)
}
fmt.Println("Revoked:", revoked) // true
```

## その他の機能

上記の手順はトークンライフサイクルの核心操作をカバーしています。CyberGo JWT は以下の機能も提供しています — 各ガイドをクリックして詳細な使用方法を確認してください：

| 機能 | 説明 | ガイド |
|------|------|--------|
| 署名アルゴリズム | HMAC、RSA、RSA-PSS、ECDSA — 4種12アルゴリズム | [署名アルゴリズム](../guides/signing-algorithms) |
| カスタム Claims | `CustomClaims` インターフェースでビジネスフィールドを定義 | [カスタム Claims](../guides/custom-claims) |
| トークンリフレッシュとローテーション | 2層トークン TTL 設計、再利用 vs 一回限りローテーション戦略 | [トークンリフレッシュとローテーション](../guides/token-refresh) |
| トークンブラックリスト | 失効、内蔵メモリストア、Redis カスタムバックエンド | [トークンブラックリスト](../guides/blacklist) |
| レート制限 | トークンバケットアルゴリズムで発行エンドポイントの悪用を防止 | [レート制限](../guides/rate-limiting) |
| 設定詳細 | 発行者/オーディエンス検証、クロックスキュー、必須有効期限、入力バリデーション | [設定詳細](../guides/configuration) |
| エラー処理 | 19個のセンチネルエラー分類と `errors.Is` マッチング | [エラー処理](../guides/error-handling) |
| テストとクロック注入 | `FixedClock`で決定的かつ sleep 不要の時間制御 | [テストとクロック注入](../guides/testing) |

## 次のステップ

- [署名アルゴリズム](../guides/signing-algorithms) — アルゴリズムの選択と鍵の設定
- [トークンリフレッシュとローテーション](../guides/token-refresh) — 2層トークンとローテーション戦略
- [設定詳細](../guides/configuration) — セキュリティ設定と入力バリデーション
- [API リファレンス](../api-reference/) — 完全な API リファレンス
- [基本サンプル](../examples/basic) — 実行可能な完全なサンプル
- [Web サーバー統合](../examples/web-server) — 認証ミドルウェアと RBAC の実践
