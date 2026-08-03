---
sidebar_label: "基本サンプル"
title: "基本サンプル - CyberGo JWT | HMAC 署名と失効"
description: "基本サンプル集：HMAC 対称鍵でアクセストークンを発行・検証し、リフレッシュトークンで新トークンを取得、内蔵ブラックリストでログアウト済みセッションを遮断、トークンバケットレート制限で乱用を防止、全例は独立コンパイル可能。"
sidebar_position: 10
---

# 基本サンプル

## HMAC 署名

最も一般的な方式で、対称鍵で署名と検証を行います。

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

    // 発行
    claims := &jwt.Claims{
        UserID:      "user123",
        Username:    "alice",
        Role:        "admin",
        Permissions: []string{"read", "write", "delete"},
    }
    token, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }
    fmt.Println("Access Token:", token)

    // 検証
    parsed, valid, err := processor.Validate(token)
    if err != nil {
        panic(err)
    }
    fmt.Println("Valid:", valid)          // 出力：true
    fmt.Println("UserID:", parsed.UserID) // 出力：user123
}
```

## アクセストークンとリフレッシュトークン

```go
package main

import (
    "fmt"

    "github.com/cybergodev/jwt"
)

func main() {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    claims := &jwt.Claims{
        UserID:   "user123",
        Username: "alice",
    }

    // アクセストークンの作成（短期）
    accessToken, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }

    // リフレッシュトークンの作成（長期）
    refreshToken, err := processor.CreateRefresh(claims)
    if err != nil {
        panic(err)
    }

    fmt.Println("Access Token:", accessToken)
    fmt.Println("Refresh Token:", refreshToken)

    // リフレッシュトークンを使用して新しいアクセストークンを取得
    newAccessToken, err := processor.Refresh(refreshToken)
    if err != nil {
        panic(err)
    }
    fmt.Println("New Access Token:", newAccessToken)
}
```

## トークンの失効（ブラックリスト）

```go
package main

import (
    "fmt"

    "github.com/cybergodev/jwt"
)

func main() {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    claims := &jwt.Claims{UserID: "user123", Username: "alice"}
    token, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }

    // トークンを失効
    err = processor.Revoke(token)
    if err != nil {
        panic(err)
    }
    fmt.Println("Token revoked")

    // 再度検証すると失敗する
    _, _, err = processor.Validate(token)
    fmt.Println("Validate error:", err) // token revoked

    // 失効済みか確認
    revoked, err := processor.IsRevoked(token)
    if err != nil {
        panic(err)
    }
    fmt.Println("Is revoked:", revoked) // 出力：true
}
```

## レート制限

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
    cfg.EnableRateLimit = true
    cfg.RateLimitRate = 5              // 1 分あたり最大 5 回
    cfg.RateLimitWindow = time.Minute

    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    claims := &jwt.Claims{UserID: "user123", Username: "alice"}

    // 通常のリクエスト
    for i := 0; i < 5; i++ {
        _, err := processor.Create(claims)
        if err != nil {
            fmt.Printf("Request %d: %v\n", i+1, err)
        } else {
            fmt.Printf("Request %d: success\n", i+1)
        }
    }

    // 6 回目のリクエストはレート制限に引っかかる
    _, err = processor.Create(claims)
    fmt.Println("Request 6:", err) // rate limit exceeded
}
```

## オーディエンスの分離

`ExpectedAudience` を設定すると、`aud` クレームにこの値が含まれるトークンのみが検証を通過します。マイクロサービスアーキテクチャでサービス間のトークン分離を実現し——あるサービスで発行されたトークンが別のサービスで受け入れられないようにします。

```go
package main

import (
    "errors"
    "fmt"

    "github.com/cybergodev/jwt"
)

func main() {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    cfg.ExpectedAudience = "billing-api" // billing-api 宛のトークンのみ受け入れ

    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    // オーディエンスが一致するトークン
    validClaims := &jwt.Claims{
        UserID: "user1",
        RegisteredClaims: jwt.RegisteredClaims{
            Audience: jwt.StringOrSlice{"billing-api"},
        },
    }
    validToken, err := processor.Create(validClaims)
    if err != nil {
        panic(err)
    }

    _, valid, err := processor.Validate(validToken)
    if err != nil {
        panic(err)
    }
    fmt.Println("Matching audience valid:", valid) // 出力：true

    // オーディエンスが不一致のトークンは拒否される
    wrongClaims := &jwt.Claims{
        UserID: "user2",
        RegisteredClaims: jwt.RegisteredClaims{
            Audience: jwt.StringOrSlice{"admin-api"},
        },
    }
    wrongToken, err := processor.Create(wrongClaims)
    if err != nil {
        panic(err)
    }

    _, valid, err = processor.Validate(wrongToken)
    fmt.Println("Wrong audience valid:", valid) // 出力：false
    fmt.Println("Wrong audience error:", err)   // 出力：token invalid audience
    fmt.Println("Is audience error:",
        errors.Is(err, jwt.ErrTokenInvalidAudience)) // 出力：true
}
```

::: tip マイクロサービスシーン
マイクロサービスアーキテクチャでは、各サービスに異なる `ExpectedAudience`（例：`billing-api`、`user-api`）を設定し、各サービスが自身宛のトークンのみを受け入れるようにすることで、トークンのクロスサービス乱用を防止します。
:::

## Extra 拡張フィールド

内蔵 `Claims.Extra` は `map[string]any` で、少数のオプション追加情報を保存するために使用します。Processor はトークン作成時に Extra に深層検証（長さ、インジェクション検出）を実行するため、カスタム Claims フィールドより手軽です。

```go
package main

import (
    "fmt"

    "github.com/cybergodev/jwt"
)

func main() {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    // Extra で追加ビジネスフィールドを保存（string と []string 値のみサポート）
    claims := &jwt.Claims{
        UserID:   "user123",
        Username: "alice",
        Role:     "engineer",
        Extra: map[string]any{
            "team_id": "team-backend",
            "level":   "senior",
            "tags":    []string{"onboarding", "mentor"},
        },
    }
    token, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }

    // 検証後に Extra フィールドを読み取り
    parsed, valid, err := processor.Validate(token)
    if err != nil {
        panic(err)
    }
    fmt.Println("Valid:", valid)            // 出力：true
    fmt.Println("UserID:", parsed.UserID)   // 出力：user123

    // 型アサーションで Extra 値を読み取り
    if teamID, ok := parsed.Extra["team_id"].(string); ok {
        fmt.Println("TeamID:", teamID) // 出力：team-backend
    }
    if level, ok := parsed.Extra["level"].(string); ok {
        fmt.Println("Level:", level) // 出力：senior
    }
    if tags, ok := parsed.Extra["tags"].([]string); ok {
        fmt.Println("Tags:", tags) // 出力：[onboarding mentor]
    }
}
```

::: warning Extra の制限
`Extra` は最大 50 キーで、値は `string` と `[]string` 型のみ許可され、ネスト map はサポートされません。より複雑な構造やカスタム検証が必要な場合は、[カスタム Claims 型](../guides/custom-claims#extra-フィールド-vs-カスタム型)を使用してください。
:::

## その他のサンプル

- [Web サーバー統合](./web-server) — 認証ミドルウェア、RBAC、リフレッシュ、ログアウト、グレースフルシャットダウン
- [高度なサンプル](./advanced) — RSA、ECDSA、カスタム Claims、Redis ブラックリスト、クロック注入
