---
sidebar_label: "カスタム Claims"
title: "カスタム Claims - CyberGo JWT | ビジネス宣言インターフェース"
description: "カスタム Claims ガイド：CustomClaims インターフェースを実装してビジネス専用宣言項目を定義し、内蔵 Claims とカスタム型の検証差を比較、ValidateInto と RefreshInto の解析・更新用法を示す。"
sidebar_position: 20
---

# カスタム Claims

内蔵の [`Claims`](../api-reference/claims#claims) 構造体は一般的なシーンをカバーしていますが、ビジネスシステムには通常追加フィールドが必要です。`CustomClaims` インターフェースを実装することで独自の Claims 構造体を定義できます。

## CustomClaims インターフェース

```go
type CustomClaims interface {
    GetRegisteredClaims() *RegisteredClaims
    Validate() error
}
```

2 つのメソッドを実装するだけです：

| メソッド | 説明 |
|---------|------|
| `GetRegisteredClaims()` | 標準 JWT フィールド（iss、sub、aud など）を返す |
| `Validate()` | カスタム検証ロジック |

## Extra フィールド vs カスタム型

ビジネスフィールドの保存には 2 つの方法があります：内蔵 [`Claims.Extra`](../api-reference/claims#claims) フィールドを使用するか、カスタム Claims 型を定義するかです。それぞれ一長一短があります。

### 比較

| 次元 | `Claims.Extra` | カスタム Claims 型 |
|------|----------------|-------------------|
| 型安全性 | なし、値は `any`、型アサーションが必要 | あり、コンパイル時の型チェック |
| IDE 補完 | なし、map キーに補完なし | あり、フィールド自動補完 |
| カスタム検証 | なし、ライブラリ内蔵の深層検証のみ | あり、`Validate()` で自由に実装 |
| 深層検証 | あり、長さ/インジェクション/制御文字 | なし、登録クレームのサニタイズのみ |
| ネスト構造 | なし、ネスト map 非対応 | あり、任意の構造体 |
| 適用シーン | 少数のオプション追加フィールド | コアビジネスフィールド、カスタム検証が必要 |

### Extra フィールドの制限

内蔵 `Claims.Extra` は `map[string]any` で、Processor はトークン作成時に深層検証を実行します：

| 制限項目 | 制約 |
|---------|------|
| 最大キー数 | 50 個 |
| 許可される値の型 | `string` と `[]string` のみ |
| ネスト map | 拒否（`ValidationError` を返す） |
| 文字列値の長さ | ≤ 256 文字 |
| インジェクションパターン検出 | 他の文字列フィールドと同様 |

```go
// ✅ 合法 — string と []string の値のみ
claims := &jwt.Claims{
    UserID: "user1",
    Extra: map[string]any{
        "team_id": "team-abc",            // string
        "tags":    []string{"vip", "qa"}, // []string
    },
}

// ❌ 不正 — ネスト map は深層検証で拒否される
claims = &jwt.Claims{
    Extra: map[string]any{
        "profile": map[string]any{"age": 30}, // ValidationError: nested maps not allowed
    },
}
```

::: tip 選び方
- **少数、オプション、フラット**な追加情報（例：`team_id`、`tags`）→ `Extra` を使用し、ライブラリ内蔵の深層検証を享受、自前の検証は不要。
- **コアビジネスフィールド**や**列挙/クロスフィールド制約/型安全性**が必要 → カスタム Claims 型を定義し、`Validate()` でビジネスルールを実装。注意：カスタム構造体フィールドは深層検証されないため、長さとインジェクションチェックを自前で補う必要があります（下記[セキュリティ影響と検証テンプレート](#セキュリティ影響と検証テンプレート)を参照）。
:::

## カスタム Claims の定義

```go
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
```

:::tip ポイント
- `jwt.RegisteredClaims` の埋め込みは必須
- `GetRegisteredClaims()` は埋め込まれたフィールドのポインタを返す
- `Validate()` はトークンの作成時と検証時の両方で呼び出される
:::

## カスタム Claims の使用

### トークンの作成

```go
claims := &MyClaims{
    UserID: "user123",
    Email:  "alice@example.com",
    Role:   "admin",
}
token, err := processor.Create(claims)
```

### カスタム構造体に検証

`ValidateInto` を使用してトークンをカスタム構造体にパースします：

```go
myClaims := &MyClaims{}
result, valid, err := processor.ValidateInto(token, myClaims)
if err != nil {
    panic(err)
}
if valid {
    parsed := result.(*MyClaims)
    fmt.Println("UserID:", parsed.UserID)
    fmt.Println("Email:", parsed.Email)
}
```

### カスタム構造体にリフレッシュ

`RefreshInto` を使用してトークンをリフレッシュし、カスタムフィールドを維持します：

```go
newToken, err := processor.RefreshInto(refreshToken, &MyClaims{})
if err != nil {
    panic(err)
}
```

:::warning 時系列フィールドの保護
`RefreshInto` は Claims の時系列フィールド（`IssuedAt`、`ExpiresAt`、`ID`）を自動的に復元します。操作が失敗しても復元が保証されます。
:::

## 複雑な検証例

カスタム Claims の真の価値は `Validate()` でビジネスルールを実装できる点にあります。以下の例は必須チェック、列挙値制約、クロスフィールド制約を示します：

```go
package main

import (
    "errors"
    "fmt"

    "github.com/cybergodev/jwt"
)

// AccountClaims はアカウント階層とデバイスクォータのビジネスクレームを保持
type AccountClaims struct {
    UserID    string   `json:"user_id"`
    Tier      string   `json:"tier"`       // free | pro | enterprise
    Region    string   `json:"region"`     // cn | us | eu
    DeviceIDs []string `json:"device_ids"`
    jwt.RegisteredClaims
}

// 各階層の最大デバイス数
var tierMaxDevices = map[string]int{
    "free":       2,
    "pro":        10,
    "enterprise": 100,
}

var allowedRegions = map[string]bool{"cn": true, "us": true, "eu": true}

func (c *AccountClaims) GetRegisteredClaims() *jwt.RegisteredClaims {
    return &c.RegisteredClaims
}

func (c *AccountClaims) Validate() error {
    // 1. 必須フィールドのチェック
    if c.UserID == "" {
        return errors.New("user_id is required")
    }

    // 2. 列挙値のチェック
    if _, ok := tierMaxDevices[c.Tier]; !ok {
        return fmt.Errorf("invalid tier %q: must be free, pro or enterprise", c.Tier)
    }
    if !allowedRegions[c.Region] {
        return fmt.Errorf("invalid region %q: must be cn, us or eu", c.Region)
    }

    // 3. クロスフィールド制約：デバイス数が階層クォータを超えないこと
    if max := tierMaxDevices[c.Tier]; len(c.DeviceIDs) > max {
        return fmt.Errorf("tier %q allows at most %d devices, got %d",
            c.Tier, max, len(c.DeviceIDs))
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

    // 合法トークン：pro 階層、3 デバイス（≤ 10）
    valid := &AccountClaims{
        UserID:    "user123",
        Tier:      "pro",
        Region:    "cn",
        DeviceIDs: []string{"dev-1", "dev-2", "dev-3"},
    }
    _, err = processor.Create(valid)
    if err != nil {
        panic(err)
    }
    fmt.Println("Token created successfully")

    // 違反トークン：free 階層に 5 デバイス（> 2）→ Validate() が拒否
    _, err = processor.Create(&AccountClaims{
        UserID:    "user456",
        Tier:      "free",
        Region:    "us",
        DeviceIDs: []string{"d1", "d2", "d3", "d4", "d5"},
    })
    fmt.Println("Over-quota error:", err)
    // 出力: Over-quota error: invalid claims: tier "free" allows at most 2 devices, got 5
}
```

::: tip エラーラッピング
`Validate()` が返す記述的エラーは `ErrInvalidClaims` でラップされます。呼び出し側は `errors.Is(err, jwt.ErrInvalidClaims)` でカテゴリを判定することも、エラー文字列を直接読んでビジネス詳細を取得することもできます。詳しくは[エラー処理](./error-handling#エラーラッピングチェーン)を参照してください。
:::

## 検証の違い

内蔵 `*Claims` とカスタム型では異なる検証パスを通ります：

| 検証項目 | `*Claims` | カスタム型 |
|---------|-----------|-----------|
| `Validate()` メソッド | ✅ | ✅ |
| 文字列長制限（256 文字） | ✅ | ❌ |
| 配列サイズ制限（100 項目） | ✅ | ❌ |
| 注入パターン検出 | ✅ | ❌ |
| 制御文字フィルタリング | ✅ | ❌ |
| `Extra` フィールド制限 | ✅ | 該当なし |
| 登録クレームの文字列サニタイズ | ✅ | ✅ |

:::warning セキュリティ影響
カスタム Claims のビジネスフィールドは深層検証の対象**になりません**。これは、悪意のある入力が署名チェックを通過してカスタム構造体にパースされた場合、`<script>` タグ、SQL フラグメント、超長文字列などの危険なコンテンツがそのままトークンに格納されることを意味します——内蔵 `*Claims` の 46 種のインジェクションパターン検出、256 文字長制限、制御文字フィルタリングはすべて適用されません。

`Validate()` メソッドですべての必要な検証を自身で実装してください。そうでないとトークンが XSS/SQL インジェクションの媒体になる可能性があります。
:::

### セキュリティ影響と検証テンプレート

以下のヘルパー関数は内蔵深層検証のコアルジック（長さ上限、制御文字、インジェクション部分文字列）を再現したもので、カスタム Claims の `Validate()` でそのまま呼び出せます：

```go
package main

import (
    "errors"
    "fmt"
    "strings"
)

const maxClaimLength = 256

// dangerousSubstrings はライブラリ内蔵検出と重複する高危険部分文字列を列挙、ビジネスに応じて追加・削除可。
var dangerousSubstrings = []string{
    "<script", "javascript:", "onerror=", "onload=",
    "drop table", "union select", "../", "/etc/passwd",
}

// validateField はカスタムフィールドの長さ、制御文字、一般的なインジェクションパターンを検証。
func validateField(name, value string) error {
    if len(value) > maxClaimLength {
        return fmt.Errorf("%s exceeds maximum length of %d", name, maxClaimLength)
    }
    for i := 0; i < len(value); i++ {
        c := value[i]
        if c < 32 && c != '\t' && c != '\n' && c != '\r' {
            return fmt.Errorf("%s contains invalid control character", name)
        }
    }
    lower := strings.ToLower(value)
    for _, pattern := range dangerousSubstrings {
        if strings.Contains(lower, pattern) {
            return fmt.Errorf("%s contains suspicious pattern", name)
        }
    }
    return nil
}

type MyClaims struct {
    UserID     string `json:"user_id"`
    Department string `json:"department"`
}

func (c *MyClaims) Validate() error {
    if c.UserID == "" {
        return errors.New("user_id is required")
    }
    // カスタムフィールドは内蔵深層検証の対象外、長さとインジェクションチェックを手動で補う
    if err := validateField("user_id", c.UserID); err != nil {
        return err
    }
    if err := validateField("department", c.Department); err != nil {
        return err
    }
    return nil
}

func main() {}
```

## オプションインターフェース：RateLimitKeyer

カスタム Claims は `RateLimitKeyer` インターフェースを実装してレート制限キーを提供できます：

```go
func (c *MyClaims) RateLimitKey() string {
    return c.Email // Email をレート制限キーとして使用
}
```

レート制限キーの検索優先順位：`Subject` → `*Claims.UserID` → `RateLimitKey()`。

## 次のステップ

- [API リファレンス → インターフェース定義](../api-reference/interfaces#customclaims) — CustomClaims の完全な定義
- [API リファレンス → Processor](../api-reference/processor#validateinto) — ValidateInto / RefreshInto メソッド
- [高度なサンプル](../examples/advanced) — カスタム Claims の完全な例
