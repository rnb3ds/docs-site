---
sidebar_label: "高度なサンプル"
title: "高度なサンプル - CyberGo JWT | 非対称署名とカスタムストア"
description: "高度なサンプル集：RSA と ECDSA 非対称署名の検証、CustomClaims でカスタムビジネス宣言を実装、Redis カスタムブラックリストバックエンドへの接続、FixedClock 時計注入テストと未検証トークンのパース。"
sidebar_position: 20
---

# 高度なサンプル

## RSA 非対称署名

RSA 秘密鍵で署名し、公開鍵で検証します。マイクロサービスアーキテクチャに適しており、検証側が秘密鍵を保持する必要がありません。

```go
package main

import (
    "crypto/rand"
    "crypto/rsa"
    "fmt"
    "log"

    "github.com/cybergodev/jwt"
)

func main() {
    // RSA 鍵ペアの生成（実際の使用ではファイルから読み込み）
    privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
    if err != nil {
        log.Fatal(err)
    }

    cfg := jwt.DefaultConfig()
    cfg.SigningMethod = jwt.SigningMethodRS256
    cfg.SigningKey = privateKey
    cfg.VerificationKey = &privateKey.PublicKey // 省略可、未設定なら SigningKey を使用

    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    claims := &jwt.Claims{UserID: "user456", Username: "bob"}
    token, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }
    fmt.Println("RSA Token:", token)

    parsed, valid, err := processor.Validate(token)
    if err != nil {
        panic(err)
    }
    fmt.Println("Valid:", valid)
    fmt.Println("UserID:", parsed.UserID)
}
```

## RSA-PSS 署名

RSA-PSS（RS256/384/512 の現代的代替）は確率的署名方式（PSS）パディングを使用し、PKCS#1 v1.5 より安全性が高いです。鍵は RSA と完全に同じで、追加の生成は不要です。

```go
package main

import (
    "crypto/rand"
    "crypto/rsa"
    "fmt"
    "log"

    "github.com/cybergodev/jwt"
)

func main() {
    // RSA 鍵ペアの生成（RSA-PSS は RSA と同一の鍵型を共有）
    privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
    if err != nil {
        log.Fatal(err)
    }

    cfg := jwt.DefaultConfig()
    cfg.SigningMethod = jwt.SigningMethodPS256
    cfg.SigningKey = privateKey
    cfg.VerificationKey = &privateKey.PublicKey

    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    claims := &jwt.Claims{UserID: "user_ps", Username: "diana"}
    token, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }
    fmt.Println("RSA-PSS Token:", token)

    parsed, valid, err := processor.Validate(token)
    if err != nil {
        panic(err)
    }
    fmt.Println("Valid:", valid) // 出力：Valid: true
    fmt.Println("UserID:", parsed.UserID)
}
```

:::tip RSA の代替として推奨
新規プロジェクトでは RSA-PSS（PS256/384/512）を優先して使用することを推奨します。PSS パディングは PKCS#1 v1.5 より強力な証明可能な安全性を持ち、鍵は RSA と完全に互換です。
:::

## ECDSA 非対称署名

ECDSA 楕円曲線署名を使用します。鍵が短く、パフォーマンスに優れています。

```go
package main

import (
    "crypto/ecdsa"
    "crypto/elliptic"
    "crypto/rand"
    "fmt"
    "log"

    "github.com/cybergodev/jwt"
)

func main() {
    // ECDSA 鍵ペアの生成
    privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
    if err != nil {
        log.Fatal(err)
    }

    cfg := jwt.DefaultConfig()
    cfg.SigningMethod = jwt.SigningMethodES256
    cfg.SigningKey = privateKey

    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    claims := &jwt.Claims{UserID: "user789", Username: "charlie"}
    token, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }
    fmt.Println("ECDSA Token:", token)
}
```

## 鍵分離モード

マイクロサービスアーキテクチャでのクロスサービストークン検証をシミュレートします：認証サービスが秘密鍵を保持してトークンを発行し、API サービスが公開鍵で検証します。

```go
package main

import (
    "crypto/rand"
    "crypto/rsa"
    "fmt"
    "log"

    "github.com/cybergodev/jwt"
)

func main() {
    // RSA 鍵ペアの生成
    privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
    if err != nil {
        log.Fatal(err)
    }
    publicKey := &privateKey.PublicKey

    // --- 認証サービス：秘密鍵を保持し、トークンを発行 ---
    authCfg := jwt.DefaultConfig()
    authCfg.SigningMethod = jwt.SigningMethodRS256
    authCfg.SigningKey = privateKey
    authCfg.Issuer = "auth-service"

    authProcessor, err := jwt.New(authCfg)
    if err != nil {
        panic(err)
    }
    defer authProcessor.Close()

    claims := &jwt.Claims{UserID: "user_dist", Username: "charlie"}
    token, err := authProcessor.Create(claims)
    if err != nil {
        panic(err)
    }
    fmt.Println("認証サービスがトークンを発行（秘密鍵）")

    // --- API サービス：公開鍵でトークンを検証 ---
    apiCfg := jwt.DefaultConfig()
    apiCfg.SigningMethod = jwt.SigningMethodRS256
    apiCfg.SigningKey = privateKey     // 現在の API は SigningKey が非空であることを要求
    apiCfg.VerificationKey = publicKey // 検証時に実際にこの公開鍵を使用
    apiCfg.Issuer = "auth-service"     // 発行側と一致させる必要あり

    apiProcessor, err := jwt.New(apiCfg)
    if err != nil {
        panic(err)
    }
    defer apiProcessor.Close()

    parsed, valid, err := apiProcessor.Validate(token)
    if err != nil {
        panic(err)
    }
    fmt.Println("API サービスの検証が通過（公開鍵）：", valid) // 出力：API サービスの検証が通過（公開鍵）： true
    fmt.Println("UserID:", parsed.UserID)
}
```

:::warning SigningKey は必須
現在の API は `SigningKey` が非空であることを要求する（検証段階で強制チェック）ため、API サービスの設定にも秘密鍵を書き込む必要があります。ただし検証フローは `VerificationKey` が設定されると公開鍵のみを使用します。検証のみの Processor は `Create` / `CreateRefresh` を呼び出すべきではありません。
:::

## PEM ファイルから鍵をロード

本番環境では通常、非対称鍵を PEM ファイルで保管します。以下の例は `pem.Decode` + `x509.ParsePKCS8PrivateKey` で秘密鍵を、`x509.ParsePKIXPublicKey` で公開鍵をロードする方法を示します。

<!-- check-code: skip -->
```go
package main

import (
    "crypto/rsa"
    "crypto/x509"
    "encoding/pem"
    "fmt"
    "os"

    "github.com/cybergodev/jwt"
)

func main() {
    // --- RSA 秘密鍵のロード ---
    keyData, err := os.ReadFile("private_key.pem")
    if err != nil {
        fmt.Println("秘密鍵の読み込み失敗：", err)
        return
    }

    block, _ := pem.Decode(keyData)
    if block == nil {
        fmt.Println("秘密鍵の PEM デコード失敗")
        return
    }

    parsedKey, err := x509.ParsePKCS8PrivateKey(block.Bytes)
    if err != nil {
        fmt.Println("秘密鍵のパース失敗：", err)
        return
    }
    privateKey, ok := parsedKey.(*rsa.PrivateKey)
    if !ok {
        fmt.Println("鍵型が RSA ではありません")
        return
    }

    // --- RSA 公開鍵のロード ---
    pubData, err := os.ReadFile("public_key.pem")
    if err != nil {
        fmt.Println("公開鍵の読み込み失敗：", err)
        return
    }

    pubBlock, _ := pem.Decode(pubData)
    if pubBlock == nil {
        fmt.Println("公開鍵の PEM デコード失敗")
        return
    }

    parsedPub, err := x509.ParsePKIXPublicKey(pubBlock.Bytes)
    if err != nil {
        fmt.Println("公開鍵のパース失敗：", err)
        return
    }
    publicKey, ok := parsedPub.(*rsa.PublicKey)
    if !ok {
        fmt.Println("公開鍵型が RSA ではありません")
        return
    }

    // --- Processor の設定 ---
    cfg := jwt.DefaultConfig()
    cfg.SigningMethod = jwt.SigningMethodRS256
    cfg.SigningKey = privateKey
    cfg.VerificationKey = publicKey

    processor, err := jwt.New(cfg)
    if err != nil {
        fmt.Println("初期化失敗：", err)
        return
    }
    defer processor.Close()
    fmt.Println("鍵を PEM ファイルからロード完了") // 出力：鍵を PEM ファイルからロード完了
}
```

:::tip 鍵フォーマット
- 秘密鍵の PEM ヘッダーは `-----BEGIN PRIVATE KEY-----`（PKCS#8）または `-----BEGIN RSA PRIVATE KEY-----`（PKCS#1）。PKCS#8 は `x509.ParsePKCS8PrivateKey`、PKCS#1 は `x509.ParsePKCS1PrivateKey` を使用。
- 公開鍵の PEM ヘッダーは `-----BEGIN PUBLIC KEY-----` で、`x509.ParsePKIXPublicKey` でパース。
- `ParsePKCS8PrivateKey` / `ParsePKIXPublicKey` は `any` を返すため、`*rsa.PrivateKey` / `*rsa.PublicKey` に型アサーションが必要（ECDSA も同様に `*ecdsa.PrivateKey` / `*ecdsa.PublicKey` にアサーション）。
:::

## カスタム Claims

独自の Claims 構造体を定義して、ビジネスフィールドを追加します。

```go
package main

import (
    "errors"
    "fmt"

    "github.com/cybergodev/jwt"
)

// カスタム Claims 構造体
type MyClaims struct {
    UserID string `json:"user_id"`
    Email  string `json:"email"`
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
    if c.Email == "" {
        return errors.New("email is required")
    }
    return nil
}

func main() {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    claims := &MyClaims{
        UserID: "user123",
        Email:  "alice@example.com",
        Role:   "admin",
    }

    // トークンの作成
    token, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }
    fmt.Println("Token:", token)

    // カスタム Claims に検証
    myClaims := &MyClaims{}
    result, valid, err := processor.ValidateInto(token, myClaims)
    if err != nil {
        panic(err)
    }
    if valid {
        parsed := result.(*MyClaims)
        fmt.Println("UserID:", parsed.UserID) // 出力：user123
        fmt.Println("Email:", parsed.Email)   // 出力：alice@example.com
    }

    // カスタム Claims にリフレッシュ
    refreshToken, err := processor.CreateRefresh(claims)
    if err != nil {
        panic(err)
    }
    newToken, err := processor.RefreshInto(refreshToken, &MyClaims{})
    if err != nil {
        panic(err)
    }
    fmt.Println("New Token:", newToken)
}
```

## カスタムブラックリストバックエンド（Redis）

```go
package main

import (
    "context"
    "fmt"
    "time"

    "github.com/cybergodev/jwt"
)

// RedisBlacklistStore は BlacklistStore インターフェースを実装
// 注：実際の使用時には Redis クライアント（例：github.com/redis/go-redis）のインポートが必要
type RedisBlacklistStore struct {
    // client *redis.Client
}

func (s *RedisBlacklistStore) Add(tokenID string, expiresAt time.Time) error {
    ttl := time.Until(expiresAt)
    if ttl <= 0 {
        return nil
    }
    // return s.client.Set(context.Background(), "blacklist:"+tokenID, "1", ttl).Err()
    fmt.Printf("Redis ADD: %s, TTL: %v\n", tokenID, ttl)
    return nil
}

func (s *RedisBlacklistStore) Contains(tokenID string) (bool, error) {
    // return s.client.Exists(context.Background(), "blacklist:"+tokenID).Result()
    return false, nil
}

func (s *RedisBlacklistStore) Close() error {
    // return s.client.Close()
    return nil
}

func main() {
    _ = context.Background() // context インポートを有効に保つ（実際の使用時に Redis 呼び出しのコメントを解除）

    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    cfg.Blacklist.Store = &RedisBlacklistStore{}

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

    err = processor.Revoke(token)
    if err != nil {
        panic(err)
    }
    fmt.Println("Token revoked via Redis backend")
}
```

## クロック注入（テストシナリオ）

`FixedClock` を使用してテストで時間を制御します。

```go
package main

import (
    "fmt"
    "time"

    "github.com/cybergodev/jwt"
)

func main() {
    fixedTime := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    cfg.Clock = jwt.FixedClock{T: fixedTime}

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

    parsed, _, err := processor.Validate(token)
    if err != nil {
        panic(err)
    }
    fmt.Println("IssuedAt:", parsed.IssuedAt.Time)   // 出力：2026-01-01 00:00:00 +0000 UTC
    fmt.Println("ExpiresAt:", parsed.ExpiresAt.Time) // 出力：2026-01-01 00:15:00 +0000 UTC
}
```

## 未検証トークンのパース

署名を検証せずに Claims 情報を抽出します。デバッグやログ用途です。

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

    // 署名を検証せずにパース
    parsed := &jwt.Claims{}
    err = processor.ParseUnverified(token, parsed)
    if err != nil {
        panic(err)
    }
    fmt.Println("UserID (unverified):", parsed.UserID)
}
```

## その他のサンプル

- [Web サーバー統合](./web-server) — 認証ミドルウェア、RBAC、リフレッシュ、ログアウト、グレースフルシャットダウン
- [基本サンプル](./basic) — HMAC、トークンペア、失効、レート制限
