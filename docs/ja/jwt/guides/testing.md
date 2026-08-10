---
sidebar_label: "テストとクロック注入"
title: "テストとクロック注入 - CyberGo JWT | 固定クロックで再現可能テスト"
description: "テストとクロック注入ガイド：ClockProvider で FixedClock 固定クロックを注入し、ユニットテストで時間の経過を精密に制御、トークン有効期限・リフレッシュ・カスタム Claims 解析・失効ロジックを検証し、反復可能かつ独立に実行できる。"
sidebar_position: 60
---

# テストとクロック注入

`ClockProvider` インターフェースを通じてカスタムクロックを注入し、テストで時間を正確に制御できます。

## ClockProvider インターフェース

```go
type ClockProvider interface {
    Now() time.Time
}
```

ライブラリは 2 つの実装を提供しています：

| 型 | 説明 |
|-----|------|
| `SystemClock` | デフォルト、システム時刻を使用 |
| `FixedClock` | 固定時刻、テスト用途 |

## FixedClock

`FixedClock` は常に構築時に指定された時刻を返します：

```go
fixedTime := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

cfg := jwt.DefaultConfig()
cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
cfg.Clock = jwt.FixedClock{T: fixedTime}
```

## トークン有効期限のテスト

```go
func TestTokenExpiry(t *testing.T) {
    // 固定時刻を設定
    now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    cfg.AccessTokenTTL = 15 * time.Minute
    cfg.Clock = jwt.FixedClock{T: now}

    processor, err := jwt.New(cfg)
    require.NoError(t, err)
    defer processor.Close()

    // now の時点でトークンを発行
    claims := &jwt.Claims{UserID: "user123"}
    token, err := processor.Create(claims)
    require.NoError(t, err)

    // 現在時刻で検証 → 成功
    _, valid, err := processor.Validate(token)
    require.NoError(t, err)
    assert.True(t, valid)

    // 時間経過をシミュレートして有効期限切れに → 新しい Processor を使用
    expiredCfg := cfg
    expiredCfg.Clock = jwt.FixedClock{T: now.Add(16 * time.Minute)}
    expiredProcessor, err := jwt.New(expiredCfg)
    require.NoError(t, err)
    defer expiredProcessor.Close()

    _, _, err = expiredProcessor.Validate(token)
    assert.True(t, errors.Is(err, jwt.ErrTokenExpired))
}
```

## クロックスキューのテスト (ClockSkew)

[`ClockSkew`](./configuration#クロックスキュー-clockskew) は有効期限（`exp`）と開始前（`nbf`）の検証に許容ウィンドウを提供します。偏移量を設定することで、トークンが厳格な有効期限を過ぎた後の短時間内にまだ受け入れられるかを検証できます：

```go
func TestClockSkew(t *testing.T) {
    now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

    // トークン発行：exp = now + 1h
    issueCfg := jwt.DefaultConfig()
    issueCfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    issueCfg.AccessTokenTTL = time.Hour
    issueCfg.Clock = jwt.FixedClock{T: now}

    issueProc, err := jwt.New(issueCfg)
    require.NoError(t, err)
    defer issueProc.Close()

    token, err := issueProc.Create(&jwt.Claims{UserID: "user123"})
    require.NoError(t, err)

    const skew = 30 * time.Second

    // exp + 10s は 30s 偏移ウィンドウ内 → 有効
    withinCfg := jwt.DefaultConfig()
    withinCfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    withinCfg.ClockSkew = skew
    withinCfg.Clock = jwt.FixedClock{T: now.Add(time.Hour + 10*time.Second)}
    withinProc, err := jwt.New(withinCfg)
    require.NoError(t, err)
    defer withinProc.Close()

    _, valid, err := withinProc.Validate(token)
    require.NoError(t, err)
    assert.True(t, valid)

    // exp + 40s は 30s 偏移ウィンドウを超過 → 期限切れ
    beyondCfg := jwt.DefaultConfig()
    beyondCfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    beyondCfg.ClockSkew = skew
    beyondCfg.Clock = jwt.FixedClock{T: now.Add(time.Hour + 40*time.Second)}
    beyondProc, err := jwt.New(beyondCfg)
    require.NoError(t, err)
    defer beyondProc.Close()

    _, _, err = beyondProc.Validate(token)
    assert.True(t, errors.Is(err, jwt.ErrTokenExpired))
}
```

::: tip FixedClock とレート制限
レート制限を有効にすると、内蔵 [`RateLimiter`](../api-reference/types#ratelimiter) のクロックは `Config.Clock` から伝播します——`FixedClock` を使用するとレートリミッターも同じ固定時刻を使用し、実時間の経過でトークンが補充されることはありません。これによりレート制限のテストが完全に予測可能になります。詳しくは [レート制限のテスト](#レート制限のテスト) を参照。
:::

## リフレッシュフローのテスト

```go
func TestRefreshFlow(t *testing.T) {
    now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    cfg.Clock = jwt.FixedClock{T: now}

    processor, err := jwt.New(cfg)
    require.NoError(t, err)
    defer processor.Close()

    claims := &jwt.Claims{UserID: "user123"}
    refreshToken, err := processor.CreateRefresh(claims)
    require.NoError(t, err)

    // リフレッシュトークンから新しいアクセストークンを取得
    newToken, err := processor.Refresh(refreshToken)
    require.NoError(t, err)
    assert.NotEmpty(t, newToken)
}
```

## カスタム Claims のテスト

```go
func TestCustomClaims(t *testing.T) {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"

    processor, err := jwt.New(cfg)
    require.NoError(t, err)
    defer processor.Close()

    claims := &MyClaims{
        UserID: "user123",
        Email:  "test@example.com",
    }

    token, err := processor.Create(claims)
    require.NoError(t, err)

    result := &MyClaims{}
    parsed, valid, err := processor.ValidateInto(token, result)
    require.NoError(t, err)
    assert.True(t, valid)

    myResult := parsed.(*MyClaims)
    assert.Equal(t, "user123", myResult.UserID)
    assert.Equal(t, "test@example.com", myResult.Email)
}
```

## 入力検証のテスト

[`Claims`](../api-reference/claims) フィールドは `Create` 時に多層検証を受けます。テストでは超長文字列、インジェクションパターン、制御文字が [`ValidationError`](../api-reference/types#validationerror) をトリガーするかを検証し、`errors.As` でフィールドレベルの情報を抽出できます：

```go
func TestInputValidation(t *testing.T) {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"

    processor, err := jwt.New(cfg)
    require.NoError(t, err)
    defer processor.Close()

    var ve *jwt.ValidationError

    // 超長文字列が長さ制限をトリガー（上限 256 文字）
    _, err = processor.Create(&jwt.Claims{
        UserID: strings.Repeat("a", 300),
    })
    require.ErrorAs(t, err, &ve)
    assert.Equal(t, "UserID", ve.Field)
    assert.Contains(t, ve.Message, "maximum length")

    // XSS インジェクションパターン検出
    _, err = processor.Create(&jwt.Claims{
        UserID: "<script>alert(1)</script>",
    })
    require.ErrorAs(t, err, &ve)
    assert.Equal(t, "UserID", ve.Field)
    assert.Equal(t, "suspicious pattern detected", ve.Message)

    // 制御文字フィルタリング（null バイトが拒否される）
    _, err = processor.Create(&jwt.Claims{
        UserID: "user\x00inject",
    })
    require.ErrorAs(t, err, &ve)
    assert.Equal(t, "UserID", ve.Field)
    assert.Equal(t, "invalid control character", ve.Message)
}
```

::: warning ValidationError のラッピング階層
`Create` パスでは `ValidationError` が `ErrInvalidClaims` でラップされます。`errors.As(err, &ve)` を使用するとラッピングを貫通して `ValidationError` を抽出し、`Field` と `Message` を読み取ってアサーションできます。検証ルールの完全な説明は [設定詳細 → 入力検証とセキュリティ強化](./configuration#入力バリデーションとセキュリティ強化) を参照。
:::

## エラー処理のテスト

```go
func TestRevokeToken(t *testing.T) {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"

    processor, err := jwt.New(cfg)
    require.NoError(t, err)
    defer processor.Close()

    claims := &jwt.Claims{UserID: "user123"}
    token, err := processor.Create(claims)
    require.NoError(t, err)

    // トークンを失効
    err = processor.Revoke(token)
    require.NoError(t, err)

    // 検証は失敗するはず
    _, _, err = processor.Validate(token)
    assert.True(t, errors.Is(err, jwt.ErrTokenRevoked))
}
```

## レート制限のテスト

レート制限を有効にすると、クォータを超過した `Create` は [`ErrRateLimitExceeded`](../api-reference/errors#センチネルエラー) を返します。`FixedClock` と組み合わせることでトークンバケットが補充されないよう正確に制御し、テストを完全に予測可能にできます：

```go
func TestRateLimit(t *testing.T) {
    now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
    cfg.EnableRateLimit = true
    cfg.RateLimitRate = 3               // ウィンドウあたり 3 回
    cfg.RateLimitWindow = time.Minute
    cfg.Clock = jwt.FixedClock{T: now}  // 固定時刻 → トークンバケットは補充されない

    processor, err := jwt.New(cfg)
    require.NoError(t, err)
    defer processor.Close()

    // 同一 UserID はレートクォータを共有（Subject が空の場合 UserID にフォールバック）
    claims := &jwt.Claims{UserID: "user123"}

    // 最初の 3 回は作成成功
    for i := 0; i < 3; i++ {
        _, err := processor.Create(claims)
        require.NoError(t, err, "%d 回目の作成は成功するはず", i+1)
    }

    // 4 回目はクォータ超過
    _, err = processor.Create(claims)
    assert.True(t, errors.Is(err, jwt.ErrRateLimitExceeded))
}
```

::: tip レート制限キー
レート制限は `Subject` クレームに基づきキーを計算します；`Subject` が空の場合は `UserID` にフォールバックします。テストで同一 `UserID` を使用することで全リクエストがクォータを共有します。詳しくは [レート制限](./rate-limiting) を参照。
:::

## 並行安全性のテスト

`Processor` のすべてのメソッドは goroutine セーフです。`sync.WaitGroup` を使用して `Create`/`Validate` を並行実行し、panic なし、data race なしを検証します：

```go
func TestConcurrentSafety(t *testing.T) {
    cfg := jwt.DefaultConfig()
    cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"

    processor, err := jwt.New(cfg)
    require.NoError(t, err)
    defer processor.Close()

    const goroutines = 50
    const opsPerGoroutine = 20

    var wg sync.WaitGroup
    var success atomic.Int64
    wg.Add(goroutines)

    for i := 0; i < goroutines; i++ {
        go func(id int) {
            defer wg.Done()
            for j := 0; j < opsPerGoroutine; j++ {
                claims := &jwt.Claims{
                    UserID: fmt.Sprintf("user-%d-%d", id, j),
                }
                token, err := processor.Create(claims)
                if err != nil {
                    continue
                }
                if _, valid, err := processor.Validate(token); err == nil && valid {
                    success.Add(1)
                }
            }
        }(i)
    }
    wg.Wait()

    assert.Equal(t, int64(goroutines*opsPerGoroutine), success.Load(),
        "並行作成と検証はすべて成功するはず")
}
```

::: warning 競合検出
`go test -race ./...` を実行して Go の競合検出器を有効にすると、並行テストで隠れた data race をキャッチできます。これは `Processor` の並行安全性を検証する標準的な方法であり、本番コードのテストスイートは常に `-race` でパスすべきです。
:::

## ベストプラクティス

### テーブル駆動テストの推奨事項

| テストシーン | 推奨される方法 | 主要なアサーション |
|------------|-------------|-------------------|
| トークン期限切れ | `FixedClock` で発行時刻を固定、新規 Processor で期限切れをシミュレート | `errors.Is(err, ErrTokenExpired)` |
| クロックスキュー | `ClockSkew` を設定、ウィンドウ境界を検証 | exp + skew 内は有効 / 外は期限切れ |
| リフレッシュフロー | リフレッシュトークン作成後ただちに `Refresh` | 返されるトークンが空でない |
| カスタム Claims | `ValidateInto` で対象型にデシリアライズ | フィールド値が一致 |
| 入力検証 | 超長文字列 / インジェクションパターン / 制御文字 | `errors.As` で `ValidationError` を抽出 |
| レート制限 | 小ウィンドウ + 低レート + 固定クロック | 超過時に `ErrRateLimitExceeded` を返す |
| 並行安全性 | `goroutine` + `WaitGroup` で並行操作 | panic なし、data race なし |
| トークン失効 | `Revoke` 後に `Validate` | `errors.Is(err, ErrTokenRevoked)` |

:::tip 中核原則
- `FixedClock` を使用してテストの**再現性**を確保——システム時刻に依存しない
- 各テストケースで**独立した Processor** を作成し、状態漏洩を回避
- `t.Cleanup()` または `defer` で `Close()` が確実に呼ばれるようにする
- エラーの検証には `errors.Is()` / `errors.As()` を使用し、文字列マッチングは避ける
- 並行テストは常に `go test -race` と組み合わせて実行
:::

## 次のステップ

- [API リファレンス → ClockProvider](../api-reference/interfaces#clockprovider) — クロックインターフェース
- [API リファレンス → FixedClock](../api-reference/types#fixedclock) — 固定クロック
- [高度なサンプル](../examples/advanced) — クロック注入の例
