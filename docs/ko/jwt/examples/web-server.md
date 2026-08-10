---
sidebar_label: "웹 서버 통합"
title: "웹 서버 통합 - CyberGo JWT | 인증 미들웨어와 RBAC"
description: "프로덕션급 JWT 웹 서버 통합 예제: 인증 흐름, Bearer 미들웨어, RBAC 역할 제어, 리프레시 토큰 로테이션, 로그아웃 폐기, 우아한 종료로 전체 HTTP 서비스 수명 주기를 다룹니다."
sidebar_position: 15
check_code: false
---

# 웹 서버 통합

이 페이지는 CyberGo JWT를 프로덕션급 HTTP 서버에 통합하는 방법을 보여주며, 완전한 인증 수명 주기를 다룹니다:

- **인증 흐름**: 로그인 시 액세스 토큰 + 리프레시 토큰 발급
- **인증 미들웨어**: `Authorization: Bearer` 헤더에서 토큰 추출 및 검증
- **RBAC 역할 제어**: `claims.Role` 기반 세분화된 접근 제어
- **토큰 리프레시**: 리프레시 토큰으로 새 액세스 토큰 교환
- **로그아웃 폐기**: 토큰을 블랙리스트에 추가하여 세션 무효화
- **우아한 종료**: 인터럽트 신호를 감지하고 안전하게 리소스 해제

:::tip 전체 소스
이 페이지는 번들 예제 `examples/6_web_server.go`를 기반으로 하며, 직접 컴파일 및 실행할 수 있습니다.
:::

## 1. Processor 초기화

프로덕션에서는 비밀 키를 환경 변수에서 가져와야 하며, **하드코딩을 금지**합니다. 동시에 토큰 TTL, 속도 제한, 블랙리스트를 구성합니다:

```go
package main

import (
    "log"
    "os"
    "time"

    "github.com/cybergodev/jwt"
)

// processor는 패키지 수준 JWT processor로 main에서 초기화됩니다.
// expiresInSeconds는 액세스 토큰 TTL에서 파생되어 클라이언트에
// "expires_in"으로 반환되어 실제 TTL과 어긋나지 않습니다.
var (
    processor        *jwt.Processor
    expiresInSeconds int
)

func main() {
    var err error
    processor, expiresInSeconds, err = newJWTProcessor()
    if err != nil {
        log.Fatalf("JWT processor 초기화 실패: %v", err)
    }
    defer processor.Close()
    log.Println("JWT processor 초기화 완료")
}

// newJWTProcessor는 환경 변수 기반 설정으로 processor를 구성합니다.
func newJWTProcessor() (*jwt.Processor, int, error) {
    // 환경 변수에서 비밀 키 가져오기 (프로덕션 안전, 하드코딩 금지)
    secretKey := os.Getenv("JWT_SECRET_KEY")
    if secretKey == "" {
        log.Println("경고: JWT_SECRET_KEY가 설정되지 않아 데모 키 사용")
        secretKey = "Kx9#mP2$vL8@nQ5!wR7&tY3^uI6*oE4%aS1+dF0-gH9~jK2#bN5$cM8@xZ7&vB4!"
    }

    cfg := jwt.DefaultConfig()
    cfg.SecretKey = secretKey
    cfg.AccessTokenTTL = 15 * time.Minute     // 액세스 토큰 수명: 15분
    cfg.RefreshTokenTTL = 7 * 24 * time.Hour  // 리프레시 토큰 수명: 7일
    cfg.Issuer = "web-server-example"

    // 무차별 발급 방지를 위해 속도 제한 활성화
    cfg.EnableRateLimit = true
    cfg.RateLimitRate = 100 // 분당 최대 100회
    cfg.RateLimitWindow = time.Minute

    // 블랙리스트 구성 (로그아웃 폐기용)
    cfg.Blacklist = jwt.BlacklistConfig{
        MaxSize:           10000,
        CleanupInterval:   5 * time.Minute,
        EnableAutoCleanup: true,
    }

    p, err := jwt.New(cfg)
    if err != nil {
        return nil, 0, err
    }
    // expires_in은 실제 TTL에서 파생되어 드리프트 방지
    return p, int(cfg.AccessTokenTTL.Seconds()), nil
}
```

:::warning 프로덕션 안전
비밀 키는 항상 `JWT_SECRET_KEY` 환경 변수를 통해 주입하세요. 소스 코드에 작성하거나 버전 관리에 커밋하지 마세요.
:::

## 2. 로그인 엔드포인트 (/login)

사용자 자격 증명을 검증한 후, 단기 액세스 토큰과 장기 리프레시 토큰을 동시에 발급하여 `access_token` + `refresh_token` + `expires_in`을 클라이언트에 반환합니다:

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

// sendError는 JSON 오류 응답을 전송합니다.
func sendError(w http.ResponseWriter, status int, errorCode, message string) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(ErrorResponse{Error: errorCode, Message: message})
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        sendError(w, http.StatusMethodNotAllowed, "method_not_allowed", "POST 메서드만 지원됩니다")
        return
    }

    var req LoginRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        sendError(w, http.StatusBadRequest, "invalid_request", "잘못된 JSON 형식")
        return
    }

    // 사용자 인증 (mock 구현 — 실제 인증으로 교체)
    user, ok := authenticateUser(req.Username, req.Password)
    if !ok {
        sendError(w, http.StatusUnauthorized, "invalid_credentials", "사용자 이름 또는 비밀번호가 잘못되었습니다")
        return
    }

    // JWT Claims 생성
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

    // 액세스 토큰 발급 (단기)
    accessToken, err := processor.Create(&claims)
    if err != nil {
        sendError(w, http.StatusInternalServerError, "token_generation_failed", "토큰 생성 실패")
        return
    }

    // 리프레시 토큰 발급 (장기)
    refreshToken, err := processor.CreateRefresh(&claims)
    if err != nil {
        sendError(w, http.StatusInternalServerError, "token_generation_failed", "리프레시 토큰 생성 실패")
        return
    }

    // 토큰 쌍을 클라이언트에 반환
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

// authenticateUser는 자격 증명을 검증합니다 (mock 구현 — 실제 인증으로 교체)
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

## 3. 인증 미들웨어

`Authorization: Bearer <token>` 헤더에서 토큰을 추출하고, `Validate`로 검증한 후, Claims를 `context.Context`에 주입하여 다음 핸들러가 읽을 수 있게 합니다:

```go
// contextKey는 context 키 충돌을 피하기 위한 커스텀 타입입니다.
type contextKey string

const claimsKey contextKey = "claims"

// extractToken은 Authorization 헤더에서 JWT를 추출합니다.
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

// authMiddleware는 JWT 토큰을 검증하고 Claims를 context에 주입합니다.
func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        token := extractToken(r)
        if token == "" {
            sendError(w, http.StatusUnauthorized, "missing_token", "인증 토큰이 필요합니다")
            return
        }

        claims, valid, err := processor.Validate(token)
        if err != nil || !valid {
            sendError(w, http.StatusUnauthorized, "invalid_token", "토큰이 유효하지 않거나 만료되었습니다")
            return
        }

        // Claims를 context에 주입하여 다음 핸들러에서 사용
        ctx := context.WithValue(r.Context(), claimsKey, &claims)
        next(w, r.WithContext(ctx))
    }
}

// profileHandler는 인증된 사용자의 프로필을 반환합니다.
func profileHandler(w http.ResponseWriter, r *http.Request) {
    // context에서 Claims 읽기
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

:::tip 커스텀 contextKey
`type contextKey string` 커스텀 타입을 context 키로 사용하면 다른 패키지와의 충돌을 방지할 수 있습니다 — 이것은 Go 팀이 권장하는 관용구입니다.
:::

## 4. RBAC 역할 제어

`claims.Role`을 기반으로 역할 기반 접근 제어를 구현하며, 인증 미들웨어 위에 겹쳐 사용할 수 있습니다:

```go
// requireRole은 사용자가 필요한 역할을 가지고 있는지 확인합니다.
func requireRole(role string, next http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        claims := r.Context().Value(claimsKey).(*jwt.Claims)

        if claims.Role != role {
            sendError(w, http.StatusForbidden, "insufficient_permissions",
                fmt.Sprintf("%s 역할이 필요합니다", role))
            return
        }

        next(w, r)
    }
}

// adminHandler는 관리자 전용 요청을 처리합니다.
func adminHandler(w http.ResponseWriter, r *http.Request) {
    claims := r.Context().Value(claimsKey).(*jwt.Claims)

    response := map[string]any{
        "message":     "관리자 대시보드에 오신 것을 환영합니다",
        "admin":       claims.Username,
        "permissions": claims.Permissions,
        "timestamp":   time.Now().Format(time.RFC3339),
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(response)
}
```

## 5. 리프레시 엔드포인트 (/refresh)

액세스 토큰이 만료되면 클라이언트는 리프레시 토큰으로 새 액세스 토큰을 교환합니다. 이 엔드포인트는 인증 수단이 액세스 토큰이 아닌 리프레시 토큰이므로 `authMiddleware`를 거치지 않습니다:

```go
func refreshHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        sendError(w, http.StatusMethodNotAllowed, "method_not_allowed", "POST 메서드만 지원됩니다")
        return
    }

    // 요청 본문에서 리프레시 토큰 가져오기
    var req struct {
        RefreshToken string `json:"refresh_token"`
    }
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        sendError(w, http.StatusBadRequest, "invalid_request", "잘못된 JSON 형식")
        return
    }

    if req.RefreshToken == "" {
        sendError(w, http.StatusBadRequest, "missing_token", "리프레시 토큰이 필요합니다")
        return
    }

    // 리프레시 토큰으로 새 액세스 토큰 교환
    newAccessToken, err := processor.Refresh(req.RefreshToken)
    if err != nil {
        sendError(w, http.StatusUnauthorized, "invalid_token", "리프레시 토큰이 유효하지 않거나 만료되었습니다")
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

## 6. 로그아웃 엔드포인트 (/logout)

현재 액세스 토큰을 블랙리스트에 추가하여 즉시 무효화합니다. 폐기된 토큰에 대한 후속 `Validate` 호출은 오류를 반환합니다:

```go
func logoutHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        sendError(w, http.StatusMethodNotAllowed, "method_not_allowed", "POST 메서드만 지원됩니다")
        return
    }

    token := extractToken(r)
    if token == "" {
        sendError(w, http.StatusBadRequest, "missing_token", "토큰을 찾을 수 없습니다")
        return
    }

    // 토큰 폐기 (블랙리스트에 추가)
    if err := processor.Revoke(token); err != nil {
        sendError(w, http.StatusInternalServerError, "logout_failed", "로그아웃 실패")
        return
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]string{
        "message": "성공적으로 로그아웃되었습니다",
    })
}
```

:::tip 블랙리스트 메커니즘
`processor.Revoke`는 토큰의 `jti`를 내장 블랙리스트에 추가합니다. 후속 `Validate` 호출이 자동으로 확인합니다. 블랙리스트 구성(용량, 자동 정리 간격)은 섹션 1의 초기화 시 설정됩니다. [토큰 블랙리스트](../guides/blacklist)를 참조하세요.
:::

## 7. 라우트 등록 및 우아한 종료

모든 라우트를 등록하고, `signal.Notify`로 `SIGINT`/`SIGTERM`을 감지한 후, `server.Shutdown`으로 진행 중인 요청이 완료되기를 기다린 다음 `processor`를 닫아 블랙리스트 등의 리소스를 해제합니다:

```go
func main() {
    // processor 초기화 (섹션 1 참조)
    var err error
    processor, expiresInSeconds, err = newJWTProcessor()
    if err != nil {
        log.Fatalf("JWT processor 초기화 실패: %v", err)
    }

    // JWT_PORT로 수신 주소 구성 가능, 기본값 :8080
    addr := ":8080"

    // 라우트 등록
    mux := http.NewServeMux()
    mux.HandleFunc("/login", loginHandler)
    mux.HandleFunc("/profile", authMiddleware(profileHandler))
    mux.HandleFunc("/admin", authMiddleware(requireRole("admin", adminHandler)))
    mux.HandleFunc("/logout", authMiddleware(logoutHandler))
    // /refresh는 리프레시 토큰으로 인증하며, 액세스 토큰 미들웨어를 거치지 않음
    mux.HandleFunc("/refresh", refreshHandler)

    server := &http.Server{
        Addr:         addr,
        Handler:      mux,
        ReadTimeout:  15 * time.Second,
        WriteTimeout: 15 * time.Second,
        IdleTimeout:  60 * time.Second,
    }

    // goroutine에서 서버 시작
    go func() {
        log.Printf("서버 수신 중 http://localhost%s", addr)
        if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatalf("서버 시작 실패: %v", err)
        }
    }()

    // 우아한 종료를 위해 인터럽트 신호 대기
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit

    log.Println("서버를 종료하는 중...")

    // 타임아웃이 있는 우아한 종료
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    if err := server.Shutdown(ctx); err != nil {
        log.Printf("서버 종료 오류: %v", err)
    }

    // JWT processor 닫기 (블랙리스트 등 리소스 해제)
    if err := processor.Close(); err != nil {
        log.Printf("Processor 종료 오류: %v", err)
    }

    log.Println("서버가 우아하게 중지되었습니다")
}
```

## 라우트 개요

| 메서드 | 경로 | 미들웨어 | 설명 |
|--------|------|----------|------|
| POST | /login | 없음 | 토큰 쌍 발급 |
| GET | /profile | authMiddleware | 사용자 정보 반환 |
| GET | /admin | authMiddleware + requireRole("admin") | 관리자 페이지 |
| POST | /logout | authMiddleware | 토큰 폐기 |
| POST | /refresh | 없음 (리프레시 토큰 사용) | 새 액세스 토큰 교환 |

## 관련 예제

- [기본 예제](./basic) — HMAC, 토큰 쌍, 폐기, 속도 제한
- [고급 예제](./advanced) — RSA/ECDSA, 커스텀 Claims, 커스텀 저장소
- [토큰 블랙리스트](../guides/blacklist) — 블랙리스트 메커니즘 상세
