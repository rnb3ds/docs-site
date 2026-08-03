---
title: "コア概念 - CyberGo JWT | アーキテクチャとトークンモデル"
description: "CyberGo JWT コア概念：Processor 中央型とトークンライフサイクル、二層トークンモデル、Claims および RegisteredClaims 構造、CustomClaims インターフェース、Config 概要と拡張インターフェース。"
sidebar_label: "コア概念"
sidebar_position: 1
---

# コア概念

このページは CyberGo JWT のコア抽象概念と設計モデルを説明し、全体像を理解するのに役立ちます。すぐにコードを書き始めるには [クイックスタート](./index)へ移動してください。

## Processor — 中央型

[Processor](../api-reference/processor) はライブラリの中央型で、[`jwt.New(cfg)`](../api-reference/functions#new) で生成されます。トークンの発行、検証、更新、取り消しの全ロジックをカプセル化し、すべてのメソッドは **ゴルーチンセーフ** で、複数のゴルーチン間で同じインスタンスを共有できます。

使い終わったら [`Close()`](../api-reference/processor#close) を呼び出して秘密鍵を安全に消去し、リソースを解放します:

```go
<!-- check-code: skip -->
cfg := jwt.DefaultConfig()
cfg.SecretKey = "your-32-byte-secret-key-here-minimum"

processor, err := jwt.New(cfg)
if err != nil {
    log.Fatal(err)
}
defer processor.Close()
```

Processor は [`TokenManager`](../api-reference/interfaces#tokenmanager) インターフェースを実装しており、依存性の注入とテスト置換が可能です。

## トークンライフサイクル

トークンは発行から無効化まで以下の段階を経ます:

```text
発行    Create(claims)           → アクセストークン（短期）
        CreateRefresh(claims)     → リフレッシュトークン（長期）

検証    Validate(token)          → Claims（署名、有効期限、発行者、ブラックリストを確認）

更新    Refresh(refreshToken)    → 新しいアクセストークン

取り消し Revoke(token)            → ブラックリストに追加
照会    IsRevoked(token)         → bool
```

各段階は `ErrTokenExpired`、`ErrTokenRevoked` などの **センチネルエラー** を返し、`errors.Is()` で正確にマッチングできます。詳しくは [エラー処理](../guides/error-handling)を参照してください。

## 二層トークンモデル

CyberGo JWT はアクセストークン + リフレッシュトークンの二層設計を採用しています:

| | アクセストークン | リフレッシュトークン |
|---|---------|---------|
| **用途** | API 認証 | 新しいアクセストークンの取得 |
| **デフォルト TTL** | 15 分 | 7 日 |
| **発行メソッド** | `Create` | `CreateRefresh` |
| **更新メソッド** | — | `Refresh` |

**なぜ二層なのか？** アクセストークンは有効期間が短く、漏洩時のリスク窗口も小さくなります。リフレッシュトークンは有効期間が長いですが、新しいアクセストークンを取得するためだけに使用され、API 認証には直接使用されません。この設計はセキュリティとユーザー体験のバランスを取ります — ユーザーは頻繁にログインする必要がなく、アクセストークンの有効期限切れ後にサイレントに更新できます。

::: tip ローテーションセマンティクス
`Refresh` はリフレッシュトークンを **自動的に取り消しません**。元のリフレッシュトークンは有効期限切れまたは明示的な `Revoke` まで有効です。一回限りの使用セマンティクス（リフレッシュトークンローテーション）が必要な場合は、`Refresh` 成功後に古いリフレッシュトークンを手動で `Revoke` してください。詳しくは [トークン更新とローテーション](../guides/token-refresh)を参照してください。
:::

## Claims 構造

Claims はトークン内のユーザー身元データを運びます。CyberGo JWT は二層構造を提供します:

**RegisteredClaims**（RFC 7519 標準クレーム、自動入力と検証）:

| フィールド | claim | 説明 |
|-----------|-------|------|
| Issuer | `iss` | 発行者識別子 |
| Subject | `sub` | 主体識別子（レート制限キーとしても使用） |
| Audience | `aud` | 対象受信者 |
| ExpiresAt | `exp` | 有効期限 |
| NotBefore | `nbf` | 開始時刻 |
| IssuedAt | `iat` | 発行時刻 |
| ID | `jti` | 一意識別子（ブラックリストキー） |
| TokenType | `token_type` | `access` または `refresh` |

**Claims**（組み込みビジネスクレーム、RegisteredClaims を埋め込み）:

```go
<!-- check-code: skip -->
type Claims struct {
    UserID      string         // ユーザー ID
    Username    string         // ユーザー名
    Role        string         // ロール
    Permissions []string       // 権限リスト
    Scopes      []string       // OAuth スコープ
    SessionID   string         // セッション ID
    ClientID    string         // クライアント ID
    Extra       map[string]any // 追加フィールド
    RegisteredClaims           // 標準クレーム（埋め込み）
}
```

すべてのフィールドは入力検証を経ます: 文字列長の上限 256、配列の上限 100、インジェクションパターン検出（XSS/SQLi シグネチャ）。

## CustomClaims インターフェース

組み込みの Claims でビジネス要件を満たせない場合、[`CustomClaims`](../api-reference/interfaces#customclaims) インターフェースを実装して独自のクレーム構造を定義します:

```go
<!-- check-code: skip -->
type AppClaims struct {
    UserID string   `json:"user_id"`
    TeamID string   `json:"team_id"`
    Roles  []string `json:"roles,omitempty"`
    jwt.RegisteredClaims
}

func (c *AppClaims) GetRegisteredClaims() *jwt.RegisteredClaims {
    return &c.RegisteredClaims
}

func (c *AppClaims) Validate() error {
    if c.UserID == "" {
        return errors.New("user_id is required")
    }
    return nil
}
```

カスタム型は `ValidateInto` で検証、`RefreshInto` で更新します — Processor がトークンをパースして構造体にデータを入力します。詳しくは [カスタム Claims](../guides/custom-claims)を参照してください。

## Config 概要

[`Config`](../api-reference/config) は Processor の統合設定エントリポイントです。`DefaultConfig()` で適切なデフォルト値を取得後、署名キーを設定するだけです:

| グループ | フィールド | 説明 |
|---------|-----------|------|
| **署名** | `SecretKey` / `SigningKey` / `VerificationKey` / `SigningMethod` | HMAC は SecretKey、RSA/ECDSA は SigningKey |
| **トークン** | `AccessTokenTTL` / `RefreshTokenTTL` | アクセスおよびリフレッシュトークンの有効期間 |
| **検証** | `Issuer` / `ExpectedAudience` / `RequireExpiration` / `ClockSkew` | 発行者、対象、必須有効期限、クロック許容誤差 |
| **セキュリティ** | `Blacklist` / `EnableRateLimit` | 取り消しストレージとレート制限 |
| **拡張** | `Clock` | クロック注入（テスト用） |

アルゴリズムの選択は [署名アルゴリズム](../guides/signing-algorithms)を、完全なフィールドドキュメントは [設定](../guides/configuration)を参照してください。

## 拡張インターフェース

CyberGo JWT はインターフェースによる拡張性を提供します:

| インターフェース | 用途 |
|----------------|------|
| [`TokenManager`](../api-reference/interfaces#tokenmanager) | Processor が実装するコアインターフェース。依存性の注入と疎結合のためにより小さなサブセットインターフェースを定義できます |
| [`BlacklistStore`](../api-reference/interfaces#blackliststore) | カスタムブラックリストバックエンド（例: Redis）。`Add` / `Contains` / `Close` を実装して外部ストレージに接続 |
| [`RateLimitProvider`](../api-reference/interfaces#ratelimitprovider) | カスタムレートリミッター。`Allow` / `Reset` / `Close` を実装して組み込みトークンバケットを置き換え |
| [`ClockProvider`](../api-reference/interfaces#clockprovider) | クロック注入。`FixedClock` は固定時刻を返し、テストで有効期限と更新ロジックを決定論的に制御 |

## 次のステップ

- [クイックスタート](./index) — 最初のトークンを発行する
- [署名アルゴリズム](../guides/signing-algorithms) — HMAC、RSA、ECDSA 選択ガイド
- [設定](../guides/configuration) — 完全なフィールドリファレンスとセキュリティ強化
- [Web サーバー統合](../examples/web-server) — 認証ミドルウェアと RBAC の実践
