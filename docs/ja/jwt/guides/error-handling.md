---
sidebar_label: "エラー処理"
title: "エラー処理 - CyberGo JWT | センチネルエラー照合"
description: "エラー処理ガイド：CyberGo JWT 全 19 個のセンチネルエラーが設定・トークン検証・レート制限・ライフサイクル各段階で発動する条件を分類、errors.Is 照合・ValidationError 項目エラー・標準化応答の実務を示す。"
sidebar_position: 50
---

# エラー処理

CyberGo JWT はセンチネルエラー（sentinel errors）パターンを使用しており、すべてのエラーは `errors.Is()` で判定します。

## 基本パターン

```go
claims, valid, err := processor.Validate(tokenString)
if err != nil {
    switch {
    case errors.Is(err, jwt.ErrTokenExpired):
        // トークン有効期限切れ
    case errors.Is(err, jwt.ErrTokenRevoked):
        // トークンが失効済み
    case errors.Is(err, jwt.ErrTokenInvalidIssuer):
        // 発行者が一致しない
    case errors.Is(err, jwt.ErrTokenInvalidAudience):
        // オーディエンスが一致しない
    case errors.Is(err, jwt.ErrInvalidToken):
        // 署名が無効またはフォーマットエラー
    case errors.Is(err, jwt.ErrProcessorClosed):
        // Processor がクローズ済み
    default:
        // その他のエラー
    }
}
```

:::tip errors.Is() の使用
`err == jwt.ErrTokenExpired` や文字列マッチングは使用しないでください。`errors.Is()` はラップされたエラーも正しく処理します。
:::

## エラーの分類

### 設定段階

`jwt.New()` は以下のエラーを返す可能性があります：

| エラー | 原因 | 解決方法 |
|--------|------|----------|
| `ErrInvalidConfig` | 複数の設定項目が不正 | Config の各フィールドを確認 |
| `ErrInvalidSecretKey` | HMAC 秘密鍵が 32 バイト未満または弱鍵 | より強力な鍵を使用 |
| `ErrInvalidSigningMethod` | サポートされていない署名アルゴリズム | 内蔵の 12 種のアルゴリズムを使用 |

### トークン操作

| エラー | メソッド | 処理の推奨 |
|--------|---------|-----------|
| `ErrEmptyToken` | すべてのトークン操作メソッド | リクエストヘッダーを確認 |
| `ErrInvalidToken` | Validate, Refresh, ValidateInto, RefreshInto, Revoke, IsRevoked | 署名の不一致、アクセスを拒否 |
| `ErrAlgorithmMismatch` | Validate, Refresh, ValidateInto, RefreshInto | トークンのアルゴリズムが設定と不一致、アクセスを拒否 |
| `ErrExpirationRequired` | Validate, Refresh, ValidateInto, RefreshInto | `RequireExpiration` 有効だがトークンに `exp` クレームなし |
| `ErrTokenTypeMismatch` | Refresh, RefreshInto | アクセストークン（`token_type=access`）でリフレッシュ試行、アクセスを拒否 |
| `ErrTokenExpired` | Validate, Refresh, ValidateInto, RefreshInto | ユーザーにトークンのリフレッシュを案内 |
| `ErrTokenNotValidYet` | Validate, Refresh, ValidateInto, RefreshInto | クロックの同期を確認 |
| `ErrTokenInvalidIssuer` | Validate, Refresh, ValidateInto, RefreshInto, Revoke, IsRevoked | 発行者が一致しない |
| `ErrTokenInvalidAudience` | Validate, Refresh, ValidateInto, RefreshInto, Revoke, IsRevoked | オーディエンスが一致しない |
| `ErrTokenRevoked` | Validate, Refresh, ValidateInto, RefreshInto | トークンが失効済み、アクセスを拒否 |
| `ErrInvalidClaims` | Create, CreateRefresh, Validate, Refresh, ValidateInto, RefreshInto | ビジネス検証の失敗 |
| `ErrTokenMissingID` | Revoke, IsRevoked | トークンに jti がない |

### レート制限とブラックリスト

| エラー | メソッド | 処理の推奨 |
|--------|---------|-----------|
| `ErrRateLimitExceeded` | Create, CreateRefresh, Refresh, RefreshInto | 429 を返す |
| `ErrBlacklistNotConfigured` | Revoke | ブラックリストを設定 |

### ライフサイクル

| エラー | メソッド | 処理の推奨 |
|--------|---------|-----------|
| `ErrProcessorClosed` | すべてのメソッド | Processor を再作成 |
| `ErrStoreClosed` | Revoke など | ストアがクローズ済み |

## エラー型

### ValidationError

フィールドレベルの検証失敗時に返され、具体的なフィールドとエラー情報を含みます：

```go
type ValidationError struct {
    Field   string  // エラーが発生したフィールド名
    Message string  // エラーの説明
    Err     error   // 内部エラー
}
```

## エラーラッピングチェーン

CyberGo JWT のエラーはセンチネルエラー（`errors.Is` でマッチング可能）とラップエラー（`errors.As` で構造化情報を抽出）に分かれます。ラッピングチェーンを理解することで、失敗原因を正確に特定できます。

### ValidationError と errors.As

フィールドレベルの検証失敗（長さ超過、インジェクション検出など）は `*ValidationError` を返し、具体的なフィールド名とエラー情報を含みます。何層にラップされていても `errors.As` で貫通できます：

```go
token, err := processor.Create(claims)
if err != nil {
    var ve *jwt.ValidationError
    if errors.As(err, &ve) {
        fmt.Printf("フィールド: %s, 理由: %s\n", ve.Field, ve.Message)
        // フィールド: user_id, 理由: suspicious pattern detected
        return
    }
    // フィールドレベルのエラーでない場合、errors.Is 分岐へ
}
```

### ErrInvalidClaims が Claims.Validate() をラップ

`Claims.Validate()`（またはカスタム Claims の `Validate()`）が返すのは**記述的エラー**（例：`errors.New("user_id is required")`）であり、センチネルエラーではありません。Processor はこれを `ErrInvalidClaims` でラップします：

```
invalid claims: user_id is required
└── ErrInvalidClaims（センチネル、外層）
    └── user_id is required（記述的、内層）
```

そのためマッチング方法は 2 層になります：

```go
if errors.Is(err, jwt.ErrInvalidClaims) {
    // Claims 検証失敗のカテゴリである
    fmt.Println("詳細:", err) // invalid claims: user_id is required
}
```

### ParseUnverified のパースエラー

[`ParseUnverified`](../api-reference/processor#parseunverified) はトークンのフォーマットエラー（base64 デコード失敗、JSON パース失敗など）時に返すパースエラーは**ラップエラー**であり、センチネルエラーではありません：

```go
err := processor.ParseUnverified(malformedToken, &claims)
if err != nil {
    // ❌ errors.Is で具体的原因をマッチングできない
    // ✅ 「パース失敗」という事実のみ判定可能
    fmt.Println("パース失敗:", err) // failed to parse token: ...
}
```

`ParseUnverified` のセンチネルエラーは `ErrProcessorClosed`（Processor がクローズ済み）と `ErrEmptyToken`（空文字列の渡入）の 2 つのみで、その他のフォーマットエラーは `errors.Is` で正確にマッチングできません。

::: tip errors.Is vs errors.As の使い分け
- **`errors.Is`**：センチネルエラー（`ErrTokenExpired`、`ErrInvalidClaims` など）をマッチングし、「どのカテゴリの失敗か」を判定。
- **`errors.As`**：構造化エラー（`*ValidationError`）を抽出し、「具体的にどのフィールドで何が問題か」を取得。
- 両者は組み合わせ可能：まず `errors.Is` でカテゴリを特定し、次に `errors.As` で詳細を抽出。
:::

## HTTP ステータスコードマッピング

RESTful API では、JWT エラーを適切な HTTP ステータスコードにマッピングすることがベストプラクティスです——クライアントはこれに基づき「資格情報の問題」（401）、「リクエストフォーマットの問題」（400）、「サーバー側の問題」（500）を区別できます。

### マッピング表

| JWT エラー | HTTP ステータスコード | クライアントのアクション |
|----------|---------------------|----------------------|
| `ErrEmptyToken` | 401 Unauthorized | 認証トークンを提供 |
| `ErrInvalidToken` | 401 Unauthorized | 再ログイン |
| `ErrAlgorithmMismatch` | 401 Unauthorized | トークン送信元が非信頼、再ログイン |
| `ErrTokenExpired` | 401 Unauthorized | リフレッシュトークンで新トークンを取得 |
| `ErrTokenRevoked` | 401 Unauthorized | トークンが失効済み、再ログイン |
| `ErrTokenInvalidIssuer` | 401 Unauthorized | トークン発行者が不一致 |
| `ErrTokenInvalidAudience` | 401 Unauthorized | トークンオーディエンスが不一致 |
| `ErrTokenNotValidYet` | 401 Unauthorized | クライアントのクロック同期を確認 |
| `ErrTokenTypeMismatch` | 401 Unauthorized | 正しいリフレッシュトークンを使用 |
| `ErrExpirationRequired` | 401 Unauthorized | トークンに有効期限クレームがない |
| `ErrInvalidClaims` | 400 Bad Request | Claims の内容を修正（作成シーン） |
| `ErrRateLimitExceeded` | 429 Too Many Requests | リクエスト頻度を下げ、後で再試行 |
| `ErrProcessorClosed` | 500 Internal Server Error | サーバー側で Processor の再起動が必要 |

::: tip RESTful ベストプラクティス
- **401 Unauthorized**：すべてのトークン有効性の問題（期限切れ、失効、署名エラー、発行者/オーディエンス不一致）。クライアントは再認証やトークンのリフレッシュを案内すべきです。
- **400 Bad Request**：トークン作成時の Claims 検証失敗——これは認証失敗ではなく呼び出し側のプログラミングエラーです。
- **429 Too Many Requests**：レート制限のトリガ時にこのコードを返し、`Retry-After` ヘッダーで待機時間をクライアントに通知します。
- **500 Internal Server Error**：`ErrProcessorClosed` はサーバー側の状態異常であり、クライアントに露出させるべきではありません。
:::

## Web サービスでのエラー処理

以下のハンドラは `Validate` が返す可能性のある一般的なエラーをすべてカバーし、[HTTP ステータスコードマッピング](#http-ステータスコードマッピング)に従い適切なレスポンスを返します：

<!-- check-code: skip -->
```go
package main

import (
    "encoding/json"
    "errors"
    "net/http"

    "github.com/cybergodev/jwt"
)

// authError は JWT エラーを HTTP ステータスコードとメッセージにマッピング
func authError(w http.ResponseWriter, err error) {
    w.Header().Set("Content-Type", "application/json")

    switch {
    // トークン期限切れ — クライアントにリフレッシュを案内
    case errors.Is(err, jwt.ErrTokenExpired):
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "token_expired",
            "message": "トークンの有効期限が切れました、リフレッシュしてください",
        })

    // トークンが失効済み
    case errors.Is(err, jwt.ErrTokenRevoked):
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "token_revoked",
            "message": "トークンは失効されました",
        })

    // 発行者が不一致
    case errors.Is(err, jwt.ErrTokenInvalidIssuer):
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "invalid_issuer",
            "message": "発行者が一致しません",
        })

    // オーディエンスが不一致
    case errors.Is(err, jwt.ErrTokenInvalidAudience):
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "invalid_audience",
            "message": "オーディエンスが一致しません",
        })

    // まだ有効でない — クロック不同期
    case errors.Is(err, jwt.ErrTokenNotValidYet):
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "token_not_valid_yet",
            "message": "トークンはまだ有効ではありません",
        })

    // アルゴリズム不一致
    case errors.Is(err, jwt.ErrAlgorithmMismatch):
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "algorithm_mismatch",
            "message": "署名アルゴリズムが一致しません",
        })

    // トークン無効（署名エラー、フォーマットエラー、空トークン）
    case errors.Is(err, jwt.ErrInvalidToken),
        errors.Is(err, jwt.ErrEmptyToken),
        errors.Is(err, jwt.ErrExpirationRequired):
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "invalid_token",
            "message": "トークンが無効です",
        })

    // Claims 検証失敗 — フィールドレベルの詳細を抽出試行
    case errors.Is(err, jwt.ErrInvalidClaims):
        var ve *jwt.ValidationError
        if errors.As(err, &ve) {
            w.WriteHeader(http.StatusBadRequest)
            json.NewEncoder(w).Encode(map[string]string{
                "error":   "validation_failed",
                "field":   ve.Field,
                "message": ve.Message,
            })
        } else {
            w.WriteHeader(http.StatusBadRequest)
            json.NewEncoder(w).Encode(map[string]string{
                "error":   "validation_failed",
                "message": "クレーム検証に失敗しました",
            })
        }

    // レート制限
    case errors.Is(err, jwt.ErrRateLimitExceeded):
        w.Header().Set("Retry-After", "60")
        w.WriteHeader(http.StatusTooManyRequests)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "rate_limited",
            "message": "リクエストが多すぎます、後で再試行してください",
        })

    // システムエラー — Processor がクローズ済み
    case errors.Is(err, jwt.ErrProcessorClosed):
        w.WriteHeader(http.StatusInternalServerError)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "internal_error",
            "message": "一時的にサービスが利用できません",
        })

    // フォールバック
    default:
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]string{
            "error":   "auth_failed",
            "message": "認証に失敗しました",
        })
    }
}

func handleProtected(w http.ResponseWriter, r *http.Request) {
    tokenString := extractToken(r)
    claims, valid, err := processor.Validate(tokenString)
    if err != nil {
        authError(w, err)
        return
    }
    if !valid {
        authError(w, jwt.ErrInvalidToken)
        return
    }
    // 認証成功、リクエストを処理
    _ = claims
}
```

::: tip authError の再利用
`authError` は具体的なルートに依存しないエラーマッピング関数であり、認証が必要なすべてのハンドラで再利用できます。[リフレッシュエンドポイント](../examples/web-server#_5-リフレッシュエンドポイント-refresh)で `ErrTokenTypeMismatch` を処理する際にも呼び出せます。
:::

## 次のステップ

- [API リファレンス → エラー](../api-reference/errors) — 完全なエラーリスト
- [API リファレンス → 型](../api-reference/types#validationerror) — エラー型の定義
