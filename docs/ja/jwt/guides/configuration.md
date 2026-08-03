---
sidebar_label: "設定詳細"
title: "設定詳細 - CyberGo JWT | 設定フィールドとセキュリティ強化"
description: "設定詳細ガイド：発行者/オーディエンス検証、クロックスキュー許容、必須有効期限、TTL 設計を含む Config 全フィールドと、内蔵入力バリデーションの長さ制限、インジェクションパターン検出、ValidationError エラー処理。"
sidebar_position: 15
check_code: false
---

# 設定詳細

[`Config`](../api-reference/config) は CyberGo JWT の統合設定エントリポイントです。このページは署名アルゴリズム以外のセキュリティ・動作設定フィールドに焦点を当てます; 署名キーとアルゴリズム選択は [署名アルゴリズム](./signing-algorithms) を参照してください。

## 設定概要

[`DefaultConfig()`](../api-reference/functions#defaultconfig) は合理的なデフォルト値を提供します — シークレットキーを設定するだけで使用開始できます:

| フィールド | デフォルト | 説明 |
|-----------|-----------|------|
| `AccessTokenTTL` | 15 分 | アクセストークン有効期間 |
| `RefreshTokenTTL` | 7 日 | リフレッシュトークン有効期間 |
| `Issuer` | `"jwt-service"` | `iss` クレームに書き込み、検証 |
| `SigningMethod` | `HS256` | 署名アルゴリズム |
| `ClockSkew` | 0 | クロックスキュー許容 |
| `RequireExpiration` | `false` | `exp` クレームが必須か |
| `ExpectedAudience` | `""`（検証しない） | 期待オーディエンス |

### normalizeConfig 自動補充ルール

[`New()`](../api-reference/functions#new) は検証前に `normalizeConfig` を呼び出し、ゼロ値フィールドにデフォルト値を補充します。以下の表に各ルールを示します：

| ゼロ値条件 | 補充されるデフォルト値 | トリガー条件 |
|-----------|----------------------|-------------|
| `AccessTokenTTL == 0` | 15 分 | 常に |
| `RefreshTokenTTL == 0` | 7 日 | 常に |
| `Issuer == ""` | `"jwt-service"` | 常に |
| `SigningMethod == ""` | `HS256` | 常に |
| `RateLimitRate == 0` | 100 | `EnableRateLimit == true` のみ |
| `RateLimitWindow == 0` | 1 分 | `EnableRateLimit == true` のみ |
| `Blacklist.MaxSize == 0` | 100000 | 内蔵ストアのみ（`Store == nil`） |
| `Blacklist.CleanupInterval == 0` | 5 分 | 内蔵ストアのみ |
| `Blacklist.EnableAutoCleanup` | 強制 `true` | 内蔵ストアのみ |

::: tip レート制限デフォルト値がいつトリガーされるか
`RateLimitRate` と `RateLimitWindow` のデフォルト値は**`EnableRateLimit` が `true` の場合のみ**補充されます。`EnableRateLimit` が `false`（デフォルト）の場合、レート制限は有効化されず、この 2 つのフィールドは無視されます。詳しくは [レート制限](./rate-limiting) を参照してください。
:::

::: warning カスタム BlacklistStore は補充をスキップ
`Blacklist.Store` が `nil` でない（カスタムストアバックエンドを使用）場合、`MaxSize`、`CleanupInterval`、`EnableAutoCleanup` の 3 つのフィールドは全て無視されます——ストア管理はバックエンドが自行で責任を負います。内蔵ストアの `EnableAutoCleanup` は無限メモリ増加を防ぐため `true` に強制されます。
:::

## 発行者とオーディエンスの検証

### Issuer（発行者）

`Issuer` を設定すると、トークン作成時に `iss` クレームに書き込み、検証時に一貫性を確認します:

```go
cfg := jwt.DefaultConfig()
cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
cfg.Issuer = "my-app-v1" // トークンに iss: "my-app-v1" を付与
```

検証時、トークンの `iss` が設定値と一致しない場合、`ErrTokenInvalidIssuer` を返します。

### ExpectedAudience（期待オーディエンス）

`ExpectedAudience` を設定すると、検証時にトークンの `aud` クレームにこの値が含まれるかを確認します:

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
    cfg.ExpectedAudience = "billing-api"

    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()

    // オーディエンスが一致するトークン
    claims := &jwt.Claims{
        UserID: "user1",
        RegisteredClaims: jwt.RegisteredClaims{
            Audience: jwt.StringOrSlice{"billing-api"},
        },
    }
    token, err := processor.Create(claims)
    if err != nil {
        panic(err)
    }

    _, valid, _ := processor.Validate(token)
    fmt.Println("Valid:", valid)
    // 出力: Valid: true

    // オーディエンスが不一致のトークンは拒否される
    wrongClaims := &jwt.Claims{
        UserID: "user2",
        RegisteredClaims: jwt.RegisteredClaims{
            Audience: jwt.StringOrSlice{"admin-api"},
        },
    }
    wrongToken, _ := processor.Create(wrongClaims)
    _, valid, _ = processor.Validate(wrongToken)
    fmt.Println("Wrong audience valid:", valid)
    // 出力: Wrong audience valid: false
}
```

::: tip マイクロサービスシナリオ
マイクロサービスアーキテクチャでは、各サービスに異なる `ExpectedAudience` を設定し、あるサービスで発行されたトークンが別のサービスで受け入れられないようにすることで、サービス間トークン分離を実現します。
:::

## クロックスキュー (ClockSkew)

`ClockSkew` は `exp`（有効期限）と `nbf`（開始前）の検証に許容窓を提供し、発行者と検証者間のクロックドリフトを吸収します。偏移は両方の時間宣言に対して対称に作用します：

- **`exp` 方向**：トークンは `exp + ClockSkew` を過ぎてから失効とみなされる——期限切れ検証を緩和
- **`nbf` 方向**：トークンは `nbf - ClockSkew` の前から有効とみなされる——開始前検証を緩和

```go
cfg := jwt.DefaultConfig()
cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
cfg.ClockSkew = 30 * time.Second // 30秒のクロック誤差を許容
```

::: warning 推奨事項
分散システムでは、サーバー間のクロック誤差が数秒生じる可能性があります。`ClockSkew = 30s ~ 60s` の設定を推奨します。ゼロ値（デフォルト）は許容なしの厳格な検証を意味します。
:::

### ClockSkew がトークン有効性に与える影響

以下の表は `ClockSkew = 30s` の場合、`exp = 12:00:00`、`nbf = 12:00:00` のトークンが各検証時刻で有効かどうかを示します：

| 検証時刻 | exp との関係 | nbf との関係 | 結果 |
|---------|-------------|-------------|------|
| `11:59:20` | 期限前 | `nbf - 40s`（偏移超過） | 無効：`ErrTokenNotValidYet` |
| `11:59:40` | 期限前 | `nbf - 20s`（偏移ウィンドウ内） | 有効 |
| `12:00:00` | 期限前 | `nbf` 時刻 | 有効 |
| `12:00:10` | `exp + 10s`（偏移ウィンドウ内） | 既に有効 | 有効 |
| `12:00:40` | `exp + 40s`（偏移超過） | 既に有効 | 無効：`ErrTokenExpired` |

::: tip 偏移は緩和のみ、厳格化なし
`ClockSkew` はトークンの受け入れウィンドウを拡大するだけで、厳格な検査のウィンドウを縮小することはありません。ゼロ値は RFC 7519 の厳格なセマンティクスと同等です：トークンはちょうど `nbf` から有効、ちょうど `exp` で期限切れ。
:::

`ClockSkew` は負の値にできず、`Config.Validate()` は `ErrInvalidConfig` を返します。

## 必須有効期限 (RequireExpiration)

デフォルト（`RequireExpiration = false`）では、`exp` クレームのないトークンは失効しません。これは RFC 7519 では合法ですが、セキュリティに敏感なシーンではリスクになり得ます。

`RequireExpiration = true` を設定すると、検証時に `exp` クレームのないトークンを拒否します:

```go
cfg := jwt.DefaultConfig()
cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
cfg.RequireExpiration = true // exp のないトークンを拒否
```

::: tip セキュリティ強化
このライブラリが発行するトークンは常に `exp` を含む（TTL から派生）ため、`RequireExpiration` は主に他の発行者からのトークンや `exp` のない旧トークンに影響します。本番環境での有効化を推奨します。
:::

## トークン TTL 設計

アクセストークンとリフレッシュトークンの TTL は、ユースケースに応じてセキュリティと体験のバランスを取る必要があります:

| シナリオ | AccessTokenTTL | RefreshTokenTTL | 説明 |
|----------|----------------|-----------------|------|
| 高セキュリティ（金融、医療） | 5 分 | 1 時間 | 短い TTL で露出窓を制限 |
| Web アプリケーション | 15 分 | 7 日 | デフォルト、セキュリティと体験のバランス |
| モバイルアプリ | 30 分 | 30 日 | 長い TTL で再ログインを削減 |
| 内部サービス | 1 時間 | 24 時間 | 内部ネットワークの信頼度が高い |

::: warning 制約
`Config.Validate()` は `AccessTokenTTL < RefreshTokenTTL` を要求し、両方が正の数である必要があります。
:::

## 設定検証マトリックス

`Config.Validate()` は `New()` 内で `normalizeConfig` の後に実行され、3 種類のエラーを返します：`ErrInvalidConfig`、`ErrInvalidSecretKey`、`ErrInvalidSigningMethod`。

### 署名鍵の検証（アルゴリズム別）

| アルゴリズムファミリ | `SigningKey` の要件 | `VerificationKey`（省略可） |
|-------------------|-------------------|--------------------------|
| HMAC（HS256/384/512） | `SecretKey` 文字列 ≥ 32 バイト + 弱鍵でない | 該当なし（HMAC 対称） |
| RSA（RS/PS 256/384/512） | `*rsa.PrivateKey` ≥ 2048 ビット | `*rsa.PublicKey` ≥ 2048 ビット |
| ECDSA（ES256/384/512） | `*ecdsa.PrivateKey`、曲線がアルゴリズムにマッチ | `*ecdsa.PublicKey` |

::: tip VerificationKey の役割
`VerificationKey` を設定すると、トークン検証時に秘密鍵ではなく公開鍵を使用します——検証のみで署名しないサービス（リソースサーバーなど）に適しています。省略時は検証に `SigningKey` の秘密鍵を使用します。詳しくは [署名アルゴリズム](./signing-algorithms) を参照。
:::

### Config.Validate() の完全なチェック項目

| チェック項目 | 条件 | 返すエラー |
|------------|------|----------|
| 設定ポインタ | `nil` | `ErrInvalidConfig` |
| HMAC 鍵長 | `SecretKey < 32` バイト | `ErrInvalidSecretKey` |
| HMAC 鍵強度 | 弱鍵（低エントロピー/低複雑度） | `ErrInvalidSecretKey` |
| RSA 署名鍵型 | `*rsa.PrivateKey` でない | `ErrInvalidSecretKey` |
| RSA 署名鍵強度 | `< 2048` ビット | `ErrInvalidSecretKey` |
| RSA 検証鍵型 | `*rsa.PublicKey` でない（設定時） | `ErrInvalidSecretKey` |
| RSA 検証鍵強度 | `< 2048` ビット（設定時） | `ErrInvalidSecretKey` |
| ECDSA 署名鍵型 | `*ecdsa.PrivateKey` でない | `ErrInvalidSecretKey` |
| ECDSA 曲線マッチ | 曲線がアルゴリズムに不整合（例：ES256 は P-256 必要） | `ErrInvalidSecretKey` |
| ECDSA 検証鍵型 | `*ecdsa.PublicKey` でない（設定時） | `ErrInvalidSecretKey` |
| 署名アルゴリズム | 12 種の内蔵アルゴリズムにない | `ErrInvalidSigningMethod` |
| AccessTokenTTL | `<= 0` | `ErrInvalidConfig` |
| RefreshTokenTTL | `<= 0` | `ErrInvalidConfig` |
| TTL 関係 | `AccessTokenTTL >= RefreshTokenTTL` | `ErrInvalidConfig` |
| ClockSkew | `< 0` | `ErrInvalidConfig` |
| Blacklist MaxSize | `<= 0`（内蔵ストアのみ） | `ErrInvalidConfig` |
| Blacklist CleanupInterval | `<= 0`（内蔵ストアのみ） | `ErrInvalidConfig` |

::: tip 検証順序
`Validate()` はまず署名鍵を検証し（`ErrInvalidSecretKey` または `ErrInvalidSigningMethod` を返す）、次に TTL、ClockSkew、Blacklist 設定を検証します（`ErrInvalidConfig` を返す）。鍵が不正な場合、後続のチェックは実行されません——最初のエラーを修正してから再テストしてください。
:::

## 入力バリデーションとセキュリティ強化

CyberGo JWT は [`Claims`](../api-reference/claims) フィールドに多層入力バリデーションを適用し、インジェクション攻撃と異常データを防ぎます。

### フィールド制約

| 検証項目 | 制限 | トリガーされるエラー |
|----------|------|----------------------|
| 文字列フィールド長 | ≤ 256 文字 | `ValidationError` |
| 配列サイズ (permissions, scopes, audience) | ≤ 100 項目 | `ValidationError` |
| Extra フィールド数 | ≤ 50 個 | `ValidationError` |
| Extra 値の型 | `string`, `[]string` | `ValidationError`（ネストされた map は拒否） |

検証される文字列フィールドには `UserID`, `Username`, `Role`, `SessionID`, `ClientID` および `RegisteredClaims` の `Issuer`, `Subject`, `ID`, `TokenType` が含まれます。

### インジェクションパターン検出

ライブラリは46種類の危険パターン検出を内蔵し、XSS、SQL インジェクション、パストラバーサルなどの攻撃ベクトルをカバーします:

- **XSS**: `<script>`, `javascript:`, `onerror=`, `<iframe>` などの HTML/JS インジェクションタグ
- **SQL インジェクション**: `drop table`, `union select` など
- **パストラバーサル**: `../`, `/etc/passwd`, `file://`
- **制御文字**: Tab(9), 改行(10), キャリッジリターン(13) を除く ASCII < 32 文字

危険パターンが検出されると `ValidationError` を返し、`Field` はフィールド名、`Message` は `"suspicious pattern detected"` です。

### バリデーションエラーの処理

```go
token, err := processor.Create(claims)
if err != nil {
    var ve *jwt.ValidationError
    if errors.As(err, &ve) {
        fmt.Printf("フィールド: %s, 理由: %s\n", ve.Field, ve.Message)
        // フィールド: user_id, 理由: suspicious pattern detected
    }
}
```

`ValidationError` は `Unwrap()` を実装しており、`errors.Is` と `errors.As` で基底エラーを追跡できます。`Create` と `Validate` パスでは、バリデーションエラーは `ErrInvalidClaims` でラップされます。

::: tip カスタム Claims のバリデーション
`CustomClaims` インターフェースを実装する型のカスタムフィールドは深層検証されません — 実装者は `Validate()` メソッドで独自に処理する必要があります。標準 JWT フィールド（`iss`, `sub`, `jti` など）の長さ・インジェクション検証は常に実行されます。[カスタム Claims](./custom-claims) を参照してください。
:::

## 次のステップ

- [署名アルゴリズム](./signing-algorithms) — アルゴリズムの選択と鍵の設定
- [カスタム Claims](./custom-claims) — CustomClaims インターフェースの実装
- [トークンリフレッシュとローテーション](./token-refresh) — 2層トークン TTL とローテーション戦略
- [Config API](../api-reference/config) — Config 全フィールドリファレンス
