---
sidebar_label: "Web サーバー統合"
title: "Web サーバー統合 - CyberGo JWT | 認証ミドルウェアと RBAC"
description: "プロダクション級 JWT Web サーバー統合例：認証フロー、Bearer ミドルウェア、RBAC ロール制御、リフレッシュトークンローテーション、ログアウト失効、グレースフルシャットダウンで HTTP サービスライフサイクル全体をカバーします。"
sidebar_position: 15
check_code: false
---

# Web サーバー統合

このページでは、CyberGo JWT をプロダクション級 HTTP サーバーに統合する方法を示し、完全な認証ライフサイクルをカバーします：

- **認証フロー**：ログイン時にアクセストークン + リフレッシュトークンを発行
- **認証ミドルウェア**：`Authorization: Bearer` ヘッダーからトークンを抽出して検証
- **RBAC ロール制御**：`claims.Role` に基づくきめ細かいアクセス制御
- **トークンリフレッシュ**：リフレッシュトークンで新しいアクセストークンと交換
- **ログアウト失効**：トークンをブラックリストに追加してセッションを無効化
- **グレースフルシャットダウン**：割り込みシグナルを捉え、安全にリソースを解放

:::tip 完全なソース
このページはバンドル例 `examples/6_web_server.go` に基づいており、直接コンパイル・実行できます。
:::

## 1. Processor の初期化

プロダクションでは、秘密鍵は環境変数から取得する必要があり、**ハードコードを禁止**します。同時にトークン TTL、レート制限、ブラックリストを構成します：

```go
package main

import (
    "log"
    "os"
    "time"

    "github.com/cybergodev/jwt"
)

// processor はパッケージレベルの JWT processor で、main で初期化されます。
// expiresInSeconds はアクセストークン TTL から導出され、クライアントに
// "expires_in" として返され、実際の TTL とずれません。
var (
    processor        *jwt.Processor
    expiresInSeconds int
)

func main() {
    var err error
    processor, expiresInSeconds, err = newJWTProcessor()
    if err != nil {
        log.Fatalf("JWT processor の初期化に失敗: %v", err)
    }
    defer processor.Close()
    log.Println("JWT processor の初期化が完了しました")
}

// newJWTProcessor は環境変数主導の設定から processor を構築します。
func newJWTProcessor() (*jwt.Processor, int, error) {
    // 環境変数から秘密鍵を取得（プロダクション安全、ハードコード禁止）
    secretKey := os.Getenv("JWT_SECRET_KEY")
    if secretKey == "" {
        log.Println("警告: JWT_SECRET_KEY が未設定のためデモ鍵を使用")
        secretKey = "Kx9#mP2$vL8@nQ5!wR7&tY3^uI6*oE4%aS1+dF0-gH9~jK2#bN5$cM8@xZ7&vB4!"
    }

    cfg := jwt.DefaultConfig()
    cfg.SecretKey = secretKey
    cfg.AccessTokenTTL = 15 * time.Minute     // アクセストークン有効期限: 15分
    cfg.RefreshTokenTTL = 7 * 24 * time.Hour  // リフレッシュトークン有効期限: 7日
    cfg.Issuer = "web-server-example"

    // ブルートフォース発行を防ぐためレート制限を有効化
    cfg.EnableRateLimit = true
    cfg.RateLimitRate = 100 // 毎分最大100回
    cfg.RateLimitWindow = time.Minute

    // ブラックリスト構成（ログアウト失効用）
    cfg.Blacklist = jwt.BlacklistConfig{
        MaxSize:           10000,
        CleanupInterval:   5 * time.Minute,
        EnableAutoCleanup: true,
    }

    p, err := jwt.New(cfg)
    if err != nil {
        return nil, 0, err
    }
    // expires_in は実際の TTL から導出され、ドリフトを防ぎます
    return p, int(cfg.AccessTokenTTL.Seconds()), nil
}
```

:::warning プロダクション安全
秘密鍵は必ず `JWT_SECRET_KEY` 環境変数経由で注入してください。ソースコードに書き込んだり、バージョン管理にコミットしないでください。
:::

## 2. ログインエンドポイント（/login）

ユーザー資格情報を検証した後、短期のアクセストークンと長期のリフレッシュトークンを同時に発行し、`access_token` + `refresh_token` + `expires_in` をクライアントに返します：

```go
type User struct {
    ID          string   `json:"id"`
    Username    string   `json:"username"`
    Email       string   `json:"email"`
    Role        string   `json:"role"`
    Permissions []string `json:"permissions"`
}

type LoginRequest struct {
    Username string `json:"username"`
    Password string `json:"password"`
}

type LoginResponse struct {
    AccessToken  string `json:"access_token"`
    RefreshToken string `json:"refresh_token"`
    TokenType    string `json:"token_type"`
    ExpiresIn    int    `json:"expires_in"`
    User         User   `json:"user"`
}

type ErrorResponse struct {
    Error   string `json:"error"`
    Message string `json:"message"`
}

// sendError は JSON エラーレスポンスを送信します。
func sendError(w http.ResponseWriter, status int, errorCode, message string) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(ErrorResponse{Error: errorCode, Message: message})
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        sendError(w, http.StatusMethodNotAllowed, "method_not_allowed", "POST メソッドのみサポート")
        return
    }

    var req LoginRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        sendError(w, http.StatusBadRequest, "invalid_request", "無効な JSON 形式")
        return
    }

    // ユーザー認証（モック実装 — 実際の認証に置き換え）
    user, ok := authenticateUser(req.Username, req.Password)
    if !ok {
        sendError(w, http.StatusUnauthorized, "invalid_credentials", "ユーザー名またはパスワードが不正です")
        return
    }

    // JWT Claims を作成
    claims := jwt.Claims{
        UserID:      user.ID,
        Username:    user.Username,
        Role:        user.Role,
        Permissions: user.Permissions,
        SessionID:   fmt.Sprintf("session_%d", time.Now().Unix()),
        Extra: map[string]any{
            "email": user.Email,
        },
    }

    // アクセストークン発行（短期）
    accessToken, err := processor.Create(&claims)
    if err != nil {
        sendError(w, http.StatusInternalServerError, "token_generation_failed", "トークン生成に失敗")
        return
    }

    // リフレッシュトークン発行（長期）
    refreshToken, err := processor.CreateRefresh(&claims)
    if err != nil {
        sendError(w, http.StatusInternalServerError, "token_generation_failed", "リフレッシュトークン生成に失敗")
        return
    }

    // トークンペアをクライアントに返す
    response := LoginResponse{
        AccessToken:  accessToken,
        RefreshToken: refreshToken,
        TokenType:    "Bearer",
        ExpiresIn:    expiresInSeconds,
        User:         user,
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(response)
}

// authenticateUser は資格情報を検証します（モック実装 — 実際の認証に置き換え）
func authenticateUser(username, password string) (User, bool) {
    users := map[string]User{
        "admin": {
            ID: "1", Username: "admin", Email: "admin@example.com", Role: "admin",
            Permissions: []string{"read", "write", "delete", "admin"},
        },
        "user": {
            ID: "2", Username: "user", Email: "user@example.com", Role: "user",
            Permissions: []string{"read"},
        },
    }
    user, exists := users[username]
    if !exists || password != "password" {
        return User{}, false
    }
    return user, true
}
```

## 3. 認証ミドルウェア

`Authorization: Bearer <token>` ヘッダーからトークンを抽出し、`Validate` で検証して、Claims を `context.Context` に注入し、後続のハンドラーが読み取れるようにします：

```go
// contextKey は context キーの衝突を避けるためのカスタム型です。
type contextKey string

const claimsKey contextKey = "claims"

// extractToken は Authorization ヘッダーから JWT を抽出します。
func extractToken(r *http.Request) string {
    authHeader := r.Header.Get("Authorization")
    if authHeader == "" {
        return ""
    }
    parts := strings.SplitN(authHeader, " ", 2)
    if len(parts) == 2 && parts[0] == "Bearer" {
        return parts[1]
    }
    return ""
}

// authMiddleware は JWT トークンを検証し、Claims を context に注入します。
func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        token := extractToken(r)
        if token == "" {
            sendError(w, http.StatusUnauthorized, "missing_token", "認証トークンが必要です")
            return
        }

        claims, valid, err := processor.Validate(token)
        if err != nil || !valid {
            sendError(w, http.StatusUnauthorized, "invalid_token", "トークンが無効または期限切れです")
            return
        }

        // Claims を context に注入し、後続ハンドラーで使用
        ctx := context.WithValue(r.Context(), claimsKey, &claims)
        next(w, r.WithContext(ctx))
    }
}

// profileHandler は認証済みユーザーのプロフィールを返します。
func profileHandler(w http.ResponseWriter, r *http.Request) {
    // context から Claims を読み取り
    claims := r.Context().Value(claimsKey).(*jwt.Claims)

    user := User{
        ID:          claims.UserID,
        Username:    claims.Username,
        Role:        claims.Role,
        Permissions: claims.Permissions,
    }
    if email, ok := claims.Extra["email"].(string); ok {
        user.Email = email
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(user)
}
```

:::tip カスタム contextKey
`type contextKey string` カスタム型を context キーとして使用すると、他のパッケージとの衝突を防げます — これは Go チームが推奨するイディオムです。
:::

## 4. RBAC ロール制御

`claims.Role` に基づいてロールベースアクセス制御を実装し、認証ミドルウェアの上に重ねて使用できます：

```go
// requireRole はユーザーが必要なロールを持っているか確認します。
func requireRole(role string, next http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        claims := r.Context().Value(claimsKey).(*jwt.Claims)

        if claims.Role != role {
            sendError(w, http.StatusForbidden, "insufficient_permissions",
                fmt.Sprintf("%s ロールが必要です", role))
            return
        }

        next(w, r)
    }
}

// adminHandler は管理者専用リクエストを処理します。
func adminHandler(w http.ResponseWriter, r *http.Request) {
    claims := r.Context().Value(claimsKey).(*jwt.Claims)

    response := map[string]any{
        "message":     "管理ダッシュボードへようこそ",
        "admin":       claims.Username,
        "permissions": claims.Permissions,
        "timestamp":   time.Now().Format(time.RFC3339),
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(response)
}
```

## 5. リフレッシュエンドポイント（/refresh）

アクセストークンの有効期限が切れた後、クライアントはリフレッシュトークンで新しいアクセストークンと交換します。このエンドポイントは認証手段がアクセストークンではなくリフレッシュトークンであるため、`authMiddleware` を経由しません：

```go
func refreshHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        sendError(w, http.StatusMethodNotAllowed, "method_not_allowed", "POST メソッドのみサポート")
        return
    }

    // リクエストボディからリフレッシュトークンを取得
    var req struct {
        RefreshToken string `json:"refresh_token"`
    }
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        sendError(w, http.StatusBadRequest, "invalid_request", "無効な JSON 形式")
        return
    }

    if req.RefreshToken == "" {
        sendError(w, http.StatusBadRequest, "missing_token", "リフレッシュトークンが必要です")
        return
    }

    // リフレッシュトークンで新しいアクセストークンと交換
    newAccessToken, err := processor.Refresh(req.RefreshToken)
    if err != nil {
        sendError(w, http.StatusUnauthorized, "invalid_token", "リフレッシュトークンが無効または期限切れです")
        return
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]any{
        "access_token": newAccessToken,
        "token_type":   "Bearer",
        "expires_in":   expiresInSeconds,
    })
}
```

## 6. ログアウトエンドポイント（/logout）

現在のアクセストークンをブラックリストに追加して直ちに無効化します。失効されたトークンに対する後続の `Validate` 呼び出しはエラーを返します：

```go
func logoutHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        sendError(w, http.StatusMethodNotAllowed, "method_not_allowed", "POST メソッドのみサポート")
        return
    }

    token := extractToken(r)
    if token == "" {
        sendError(w, http.StatusBadRequest, "missing_token", "トークンが見つかりません")
        return
    }

    // トークン失効（ブラックリストに追加）
    if err := processor.Revoke(token); err != nil {
        sendError(w, http.StatusInternalServerError, "logout_failed", "ログアウトに失敗")
        return
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]string{
        "message": "正常にログアウトしました",
    })
}
```

:::tip ブラックリストメカニズム
`processor.Revoke` はトークンの `jti` を組み込みブラックリストに追加します。後続の `Validate` 呼び出しが自動的にチェックします。ブラックリスト構成（容量、自動クリーンアップ間隔）はセクション1の初期化時に設定されます。[トークンブラックリスト](../guides/blacklist)を参照してください。
:::

## 7. ルート登録とグレースフルシャットダウン

すべてのルートを登録し、`signal.Notify` で `SIGINT`/`SIGTERM` を捉え、`server.Shutdown` で進行中のリクエストの完了を待ってから `processor` を閉じてブラックリスト等のリソースを解放します：

```go
func main() {
    // processor 初期化（セクション1参照）
    var err error
    processor, expiresInSeconds, err = newJWTProcessor()
    if err != nil {
        log.Fatalf("JWT processor の初期化に失敗: %v", err)
    }

    // JWT_PORT でリッスンアドレスを構成可能、デフォルト :8080
    addr := ":8080"

    // ルート登録
    mux := http.NewServeMux()
    mux.HandleFunc("/login", loginHandler)
    mux.HandleFunc("/profile", authMiddleware(profileHandler))
    mux.HandleFunc("/admin", authMiddleware(requireRole("admin", adminHandler)))
    mux.HandleFunc("/logout", authMiddleware(logoutHandler))
    // /refresh はリフレッシュトークンで認証し、アクセストークンミドルウェアを経由しない
    mux.HandleFunc("/refresh", refreshHandler)

    server := &http.Server{
        Addr:         addr,
        Handler:      mux,
        ReadTimeout:  15 * time.Second,
        WriteTimeout: 15 * time.Second,
        IdleTimeout:  60 * time.Second,
    }

    // goroutine でサーバーを開始
    go func() {
        log.Printf("サーバーがリッスン中 http://localhost%s", addr)
        if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatalf("サーバー起動に失敗: %v", err)
        }
    }()

    // グレースフルシャットダウンのため割り込みシグナルを待機
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit

    log.Println("サーバーをシャットダウンしています...")

    // タイムアウト付きグレースフルシャットダウン
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    if err := server.Shutdown(ctx); err != nil {
        log.Printf("サーバーシャットダウンエラー: %v", err)
    }

    // JWT processor を閉じる（ブラックリスト等のリソースを解放）
    if err := processor.Close(); err != nil {
        log.Printf("Processor クローズエラー: %v", err)
    }

    log.Println("サーバーはグレースフルに停止しました")
}
```

## ルート概要

| メソッド | パス | ミドルウェア | 説明 |
|----------|------|--------------|------|
| POST | /login | なし | トークンペア発行 |
| GET | /profile | authMiddleware | ユーザー情報返却 |
| GET | /admin | authMiddleware + requireRole("admin") | 管理者ページ |
| POST | /logout | authMiddleware | トークン失効 |
| POST | /refresh | なし（リフレッシュトークン使用） | 新しいアクセストークンと交換 |

## 関連サンプル

- [基本サンプル](./basic) — HMAC、トークンペア、失効、レート制限
- [高度なサンプル](./advanced) — RSA/ECDSA、カスタム Claims、カスタムストレージ
- [トークンブラックリスト](../guides/blacklist) — ブラックリストメカニズムの詳細
