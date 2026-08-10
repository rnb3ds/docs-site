---
sidebar_label: "レート制限"
title: "レート制限 - CyberGo JWT | トークンバケット制限"
description: "レート制限ガイド：トークンバケットで発行インターフェースのウィンドウ毎最大要求数を設定、制限鍵の Subject・UserID・RateLimitKeyer 優先順位検索を解説、内蔵とカスタム分散制限の実装を支持。"
sidebar_position: 40
---

# レート制限

レート制限はトークン発行インターフェースの悪用（ブルートフォース攻撃など）を防止するために使用します。

## 動作原理

トークンバケットアルゴリズムを使用し、指定した時間ウィンドウ内で各キーあたりの最大リクエスト数を制限します。

```text
Create(claims) → レート制限キーを抽出 → RateLimitProvider を確認 → 許可/拒否
```

### トークンバケットアルゴリズムの詳細

内蔵 [`RateLimiter`](../api-reference/types#ratelimiter) はトークンバケット（token bucket）アルゴリズムを採用しており、単純な固定ウィンドウカウンターではありません。各レート制限キーは独立したバケットに対応し、バケット内には残りトークン数 `tokens` と最終補充時刻 `lastRefill` が記録されます。

**比例的補充トークン**：各リクエスト時に、最終補充からの経過時間に基づき比例計算で補充すべきトークン数を算出します：

```text
tokensToAdd = (maxRate × elapsed) / window
```

ここで `elapsed` は最終補充からのナノ秒数、`window` はレート制限ウィンドウです。補充後のトークン数は `maxRate`（上限）を超えず、設定レートを超過しないことを保証します。

**残余時間の保持**：トークン補充後、`lastRefill` は現在時刻にリセットされるのではなく、補充したトークンに対応する「消費された」時間分だけ進みます：

```text
consumedNano = (tokensToAdd × window) / maxRate
lastRefill += consumedNano
```

この仕組みにより、トークン補充の不均一を防ぎます——毎回 `lastRefill` を `now` にリセットすると、計上されなかった残余時間が破棄され、実際の補充レートが高くなってしまいます。

:::tip トークンバケット vs 固定ウィンドウ
固定ウィンドウカウンターはウィンドウ境界で突発的に `maxRate` 個のリクエストを許可してしまいます（例：59 秒目に 100 回、1 秒目にさらに 100 回許可し、瞬間的に 200 回）。トークンバケットは比例的に継続してトークンを補充するため、トラフィック曲線がより滑らかで、API レート制限のシーンに適しています。
:::

## 設定

```go
cfg := jwt.DefaultConfig()
cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
cfg.EnableRateLimit = true
cfg.RateLimitRate = 100              // ウィンドウあたりの最大リクエスト数
cfg.RateLimitWindow = time.Minute    // 時間ウィンドウ
```

| フィールド | デフォルト値 | 説明 |
|-----------|-------------|------|
| `EnableRateLimit` | `false` | レート制限を有効にするかどうか |
| `RateLimitRate` | `100` | ウィンドウあたりの最大リクエスト数 |
| `RateLimitWindow` | `1m` | 時間ウィンドウ |

:::tip 注意
レート制限はすべてのトークン発行メソッドに適用されます：`Create()`、`CreateRefresh()`、`Refresh()`、`RefreshInto()`。`Validate()` と `ValidateInto()` には影響しません。
:::

## レート制限キー

レート制限はキーごとに独立して適用されます。キーの検索優先順位は以下の通りです：

1. `RegisteredClaims.Subject` — 空でない場合
2. `*Claims.UserID` — 内蔵 Claims のみ
3. `RateLimitKey()` — `RateLimitKeyer` インターフェースを実装している場合
4. 空文字列 — レート制限チェックをスキップ

### カスタムレート制限キー

```go
type MyClaims struct {
    UserID string `json:"user_id"`
    Email  string `json:"email"`
    jwt.RegisteredClaims
}

// RateLimitKeyer インターフェースの実装
func (c *MyClaims) RateLimitKey() string {
    return c.Email
}
```

## バッチチェック AllowN

[`Allow`](../api-reference/types#ratelimiter) は単一リクエストをチェックしますが、具象型 [`*RateLimiter`](../api-reference/types#ratelimiter) の拡張メソッド `AllowN` は `n` 回のリクエストが一度に利用可能かを判定します：

```go
func (rl *RateLimiter) AllowN(key string, n int) bool
```

`AllowN` の動作は以下の通りです：

| 条件 | 戻り値 |
|------|--------|
| `n < 0` | `false` |
| `n == 0` | `true` |
| `n > maxRate` | `false`（単一バッチでウィンドウ上限を超えることは不可能） |
| `key == ""` | `false` |
| バケット内トークン ≥ `n` | `true`（`n` 個のトークンを消費） |
| バケット内トークン < `n` | `false` |

適用シーン：一度の操作で複数のクォータを消費する場合（バッチ発行、加重課金など）、複数回の `Allow` の代わりに一度の `AllowN` を使用することで、ロック競合を減らしつつ原子性を保証できます。

```go
package main

import (
    "fmt"
    "time"

    "github.com/cybergodev/jwt"
)

func main() {
    limiter := jwt.NewRateLimiter(100, time.Minute)
    defer limiter.Close()

    // 一度に 10 個のクォータを申請（例：10 個のトークンをバッチ発行）
    if limiter.AllowN("user:123", 10) {
        fmt.Println("バッチ操作を許可") // 出力: バッチ操作を許可
    }

    // 残り 90 個のトークン、95 個の申請は拒否
    fmt.Println(limiter.AllowN("user:123", 95)) // 出力: false
}
```

## 内蔵 RateLimiter

`NewRateLimiter` で独立したレートリミッターを作成できます：

```go
limiter := jwt.NewRateLimiter(100, time.Minute)

if limiter.Allow("user:123") {
    // 許可
} else {
    // 拒否
}

limiter.Reset("user:123") // カウントをリセット
defer limiter.Close()
```

### 容量とエビクション

内蔵 `RateLimiter` は最大 10000 個の異なるレート制限キー（`maxBuckets = 10000`）を追跡し、悪意のある大量キー生成によるメモリ枯渇を防ぎます。バケット数が上限に達した場合、以下の戦略でエビクションを行います：

1. **期限切れエビクション**：まず `lastRefill` が現在より 2 倍ウィンドウ時間を超えるバケット（期限切れ、非アクティブ）をクリーンアップします。
2. **一括エビクション（最古の約 10%）**：それでも満杯の場合、すべてのバケットをスキャンし、`lastRefill` が最も古い約 10%（最低 1 個）をエビクションし、新規キー用の空間を確保します。

:::tip なぜ一括エビクションなのか
毎回 1 個のバケットだけエビクションすると、毎挿入時に全量スキャン（O(n)）が必要になります。一方、一度に約 10% をエビクションすることで、その後約 1000 回の挿入はスキャン不要になります。これにより満容量時の単回エビクションの償却コストが O(n) から約 O(n/1000) に低下し、ロック保持時間が大幅に短縮されます。
:::

## カスタムレートリミッター

[`RateLimitProvider`](../api-reference/interfaces#ratelimitprovider) インターフェースを実装します：

```go
type RateLimitProvider interface {
    Allow(key string) bool
    Reset(key string)
    Close()
}
```

:::tip AllowN について
インターフェース自体は単一判定の `Allow` のみを定義します。バッチ判定メソッド `AllowN(key string, n int) bool` は具象型 [`*RateLimiter`](../api-reference/types#ratelimiter) の拡張メソッドであり、このインターフェースには属しません。
:::

例えば Redis を使用した分散レート制限の実装：

```go
cfg.RateLimiter = &RedisRateLimiter{client: rdb}
```

### Redis 分散レートリミッターの例

内蔵 `RateLimiter` はプロセス内のものであり、マルチインスタンスデプロイでは各インスタンスのカウントが独立して共有できません。以下は Redis ベースの分散レートリミッターで、固定ウィンドウ + INCR 原子カウント方式を使用し、マルチインスタンスシーンに適しています：

<!-- check-code: skip -->
```go
package main

import (
    "context"
    "fmt"
    "time"

    "github.com/cybergodev/jwt"
    "github.com/redis/go-redis/v9"
)

// RedisRateLimiter は Redis ベースの分散レートリミッター（固定ウィンドウ + INCR 原子カウント）。
type RedisRateLimiter struct {
    client *redis.Client
    rate   int
    window time.Duration
}

func NewRedisRateLimiter(client *redis.Client, rate int, window time.Duration) *RedisRateLimiter {
    return &RedisRateLimiter{client: client, rate: rate, window: window}
}

// Allow は Redis INCR 原子インクリメントカウントを使用し、初回インクリメント時にウィンドウとして有効期限を設定。
func (r *RedisRateLimiter) Allow(key string) bool {
    ctx := context.Background()
    fullKey := "ratelimit:" + key

    count, err := r.client.Incr(ctx, fullKey).Result()
    if err != nil {
        return false // Redis 障害時は拒否、バックエンドを保護
    }
    if count == 1 {
        // 初回リクエスト、ウィンドウ有効期限を設定
        r.client.Expire(ctx, fullKey, r.window)
    }
    return count <= int64(r.rate)
}

// Reset は指定キーのカウントをクリア。
func (r *RedisRateLimiter) Reset(key string) {
    r.client.Del(context.Background(), "ratelimit:"+key)
}

// Close はリソースを解放（Redis 接続は呼び出し元が管理、ここでは空実装）。
func (r *RedisRateLimiter) Close() {}

func main() {
    rdb := redis.NewClient(&redis.Options{Addr: "localhost:6379"})

    limiter := NewRedisRateLimiter(rdb, 100, time.Minute)
    if limiter.Allow("user:123") {
        fmt.Println("許可") // 出力: 許可
    }

    // JWT 設定に注入、内蔵プロセス内レートリミッターを置換
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    cfg.EnableRateLimit = true
    cfg.RateLimiter = limiter

    processor, err := jwt.New(cfg)
    if err != nil {
        panic(err)
    }
    defer processor.Close()
    fmt.Println("プロセッサーの作成に成功") // 出力: プロセッサーの作成に成功
}
```

:::warning 注意
この例は固定ウィンドウアルゴリズム（Redis INCR + EXPIRE）を使用しており、内蔵 `RateLimiter` のトークンバケットアルゴリズムとは動作がやや異なります：固定ウィンドウは境界でバーストが生じる可能性がありますが、分散シーンでは十分に実用的です。厳密なトークンバケットセマンティクスが必要な場合は、Lua スクリプトでトークンバケットの補充ロジックを実装できます。
:::

## レート制限の超過

リクエストがレート制限のしきい値を超えると、トークン発行メソッド（`Create()`、`CreateRefresh()`、`Refresh()`、`RefreshInto()`）は `ErrRateLimitExceeded` を返します：

```go
token, err := processor.Create(claims)
if errors.Is(err, jwt.ErrRateLimitExceeded) {
    // レート制限の処理：429 Too Many Requests を返す
}
```

## 次のステップ

- [API リファレンス → RateLimitProvider](../api-reference/interfaces#ratelimitprovider) — インターフェース定義
- [API リファレンス → RateLimiter](../api-reference/types#ratelimiter) — 内蔵実装
- [基本サンプル](../examples/basic) — レート制限の例
