---
sidebar_label: "Интеграция с веб-сервером"
title: "Интеграция с веб-сервером - CyberGo JWT | Auth Middleware & RBAC"
description: "Пример интеграции JWT в продакшен-веб-сервер: поток аутентификации, Bearer-промежуточное ПО, RBAC контроль ролей, ротация refresh-токенов, отзыв при выходе и плавное завершение работы HTTP-сервиса."
sidebar_position: 15
check_code: false
---

# Интеграция с веб-сервером

Эта страница демонстрирует, как интегрировать CyberGo JWT в продакшен-HTTP-сервер, охватывая полный жизненный цикл аутентификации:

- **Поток аутентификации**: вход выдаёт access-токен + refresh-токен
- **Промежуточное ПО аутентификации**: извлечение и проверка токенов из заголовка `Authorization: Bearer`
- **RBAC контроль ролей**: точное управление доступом на основе `claims.Role`
- **Обновление токенов**: обмен refresh-токена на новый access-токен
- **Отзыв при выходе**: добавление токена в чёрный список для аннулирования сессии
- **Плавное завершение**: перехват сигналов прерывания и безопасное освобождение ресурсов

:::tip Полный исходный код
Эта страница основана на встроенном примере `examples/6_web_server.go`, который компилируется и запускается напрямую.
:::

## 1. Инициализация Processor

В продакшене секретный ключ должен браться из переменной окружения — **никогда не хардкодьте его**. Также настраиваются TTL токенов, rate limiting и чёрный список:

```go
package main

import (
    "log"
    "os"
    "time"

    "github.com/cybergodev/jwt"
)

// processor — пакетный JWT processor, инициализируемый в main.
// expiresInSeconds выводится из TTL access-токена и возвращается
// клиентам как "expires_in", чтобы значение не отклонялось от реального TTL.
var (
    processor        *jwt.Processor
    expiresInSeconds int
)

func main() {
    var err error
    processor, expiresInSeconds, err = newJWTProcessor()
    if err != nil {
        log.Fatalf("Ошибка инициализации JWT processor: %v", err)
    }
    defer processor.Close()
    log.Println("JWT processor инициализирован")
}

// newJWTProcessor строит processor из конфигурации на основе переменных окружения.
func newJWTProcessor() (*jwt.Processor, int, error) {
    // Секретный ключ из переменной окружения (продакшен-безопасность, без хардкода)
    secretKey := os.Getenv("JWT_SECRET_KEY")
    if secretKey == "" {
        log.Println("ВНИМАНИЕ: JWT_SECRET_KEY не задан, используется демонстрационный ключ")
        secretKey = "Kx9#mP2$vL8@nQ5!wR7&tY3^uI6*oE4%aS1+dF0-gH9~jK2#bN5$cM8@xZ7&vB4!"
    }

    cfg := jwt.DefaultConfig()
    cfg.SecretKey = secretKey
    cfg.AccessTokenTTL = 15 * time.Minute     // срок действия access-токена: 15 минут
    cfg.RefreshTokenTTL = 7 * 24 * time.Hour  // срок действия refresh-токена: 7 дней
    cfg.Issuer = "web-server-example"

    // Включить rate limiting для защиты от перебора
    cfg.EnableRateLimit = true
    cfg.RateLimitRate = 100 // максимум 100 в минуту
    cfg.RateLimitWindow = time.Minute

    // Настроить чёрный список (для отзыва при выходе)
    cfg.Blacklist = jwt.BlacklistConfig{
        MaxSize:           10000,
        CleanupInterval:   5 * time.Minute,
        EnableAutoCleanup: true,
    }

    p, err := jwt.New(cfg)
    if err != nil {
        return nil, 0, err
    }
    // expires_in выводится из фактического TTL для предотвращения дрейфа
    return p, int(cfg.AccessTokenTTL.Seconds()), nil
}
```

:::warning Продакшен-безопасность
Всегда внедряйте секретный ключ через переменную окружения `JWT_SECRET_KEY`. Никогда не вписывайте его в исходный код и не коммитьте в систему контроля версий.
:::

## 2. Эндпоинт входа (/login)

После проверки учётных данных пользователя выпускаются как краткосрочный access-токен, так и долгосрочный refresh-токен. Клиенту возвращаются `access_token` + `refresh_token` + `expires_in`:

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

// sendError отправляет JSON-ответ с ошибкой.
func sendError(w http.ResponseWriter, status int, errorCode, message string) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(ErrorResponse{Error: errorCode, Message: message})
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        sendError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Поддерживается только метод POST")
        return
    }

    var req LoginRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        sendError(w, http.StatusBadRequest, "invalid_request", "Неверный формат JSON")
        return
    }

    // Аутентификация пользователя (мок — замените на реальную)
    user, ok := authenticateUser(req.Username, req.Password)
    if !ok {
        sendError(w, http.StatusUnauthorized, "invalid_credentials", "Неверное имя пользователя или пароль")
        return
    }

    // Создание JWT Claims
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

    // Выпуск access-токена (краткосрочный)
    accessToken, err := processor.Create(&claims)
    if err != nil {
        sendError(w, http.StatusInternalServerError, "token_generation_failed", "Не удалось сгенерировать токен")
        return
    }

    // Выпуск refresh-токена (долгосрочный)
    refreshToken, err := processor.CreateRefresh(&claims)
    if err != nil {
        sendError(w, http.StatusInternalServerError, "token_generation_failed", "Не удалось сгенерировать refresh-токен")
        return
    }

    // Возврат пары токенов клиенту
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

// authenticateUser проверяет учётные данные (мок — замените на реальную аутентификацию)
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

## 3. Промежуточное ПО Аутентификации

Извлечение токена из заголовка `Authorization: Bearer <token>`, проверка через `Validate` и внедрение Claims в `context.Context` для использования последующими обработчиками:

```go
// contextKey — пользовательский тип для значений context во избежание коллизий.
type contextKey string

const claimsKey contextKey = "claims"

// extractToken извлекает JWT из заголовка Authorization.
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

// authMiddleware проверяет JWT-токены и внедряет Claims в context.
func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        token := extractToken(r)
        if token == "" {
            sendError(w, http.StatusUnauthorized, "missing_token", "Требуется токен аутентификации")
            return
        }

        claims, valid, err := processor.Validate(token)
        if err != nil || !valid {
            sendError(w, http.StatusUnauthorized, "invalid_token", "Недействительный или истёкший токен")
            return
        }

        // Внедрение Claims в context для последующих обработчиков
        ctx := context.WithValue(r.Context(), claimsKey, &claims)
        next(w, r.WithContext(ctx))
    }
}

// profileHandler возвращает профиль аутентифицированного пользователя.
func profileHandler(w http.ResponseWriter, r *http.Request) {
    // Чтение Claims из context
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

:::tip Пользовательский contextKey
Использование пользовательского типа `type contextKey string` в качестве ключа context предотвращает коллизии с другими пакетами — это идиома, рекомендуемая командой Go.
:::

## 4. RBAC Контроль Ролей

Управление доступом на основе ролей поверх `claims.Role`, накладываемое поверх промежуточного ПО аутентификации:

```go
// requireRole проверяет, имеет ли пользователь требуемую роль.
func requireRole(role string, next http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        claims := r.Context().Value(claimsKey).(*jwt.Claims)

        if claims.Role != role {
            sendError(w, http.StatusForbidden, "insufficient_permissions",
                fmt.Sprintf("Требуется роль %s", role))
            return
        }

        next(w, r)
    }
}

// adminHandler обрабатывает запросы только для администраторов.
func adminHandler(w http.ResponseWriter, r *http.Request) {
    claims := r.Context().Value(claimsKey).(*jwt.Claims)

    response := map[string]any{
        "message":     "Добро пожаловать в панель администратора",
        "admin":       claims.Username,
        "permissions": claims.Permissions,
        "timestamp":   time.Now().Format(time.RFC3339),
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(response)
}
```

## 5. Эндпоинт Обновления (/refresh)

Когда срок действия access-токена истекает, клиент обменивает refresh-токен на новый access-токен. Этот эндпоинт не проходит через `authMiddleware`, поскольку учётные данные — это refresh-токен, а не access-токен:

```go
func refreshHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        sendError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Поддерживается только метод POST")
        return
    }

    // Получение refresh-токена из тела запроса
    var req struct {
        RefreshToken string `json:"refresh_token"`
    }
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        sendError(w, http.StatusBadRequest, "invalid_request", "Неверный формат JSON")
        return
    }

    if req.RefreshToken == "" {
        sendError(w, http.StatusBadRequest, "missing_token", "Требуется refresh-токен")
        return
    }

    // Обмен refresh-токена на новый access-токен
    newAccessToken, err := processor.Refresh(req.RefreshToken)
    if err != nil {
        sendError(w, http.StatusUnauthorized, "invalid_token", "Недействительный или истёкший refresh-токен")
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

## 6. Эндпоинт Выхода (/logout)

Добавление текущего access-токена в чёрный список для немедленного аннулирования. Последующие вызовы `Validate` для отозванного токена вернут ошибку:

```go
func logoutHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        sendError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Поддерживается только метод POST")
        return
    }

    token := extractToken(r)
    if token == "" {
        sendError(w, http.StatusBadRequest, "missing_token", "Токен не найден")
        return
    }

    // Отзыв токена (добавление в чёрный список)
    if err := processor.Revoke(token); err != nil {
        sendError(w, http.StatusInternalServerError, "logout_failed", "Не удалось выйти")
        return
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]string{
        "message": "Успешный выход",
    })
}
```

:::tip Механизм чёрного списка
`processor.Revoke` добавляет `jti` токена во встроенный чёрный список. Последующие вызовы `Validate` проверяют его автоматически. Конфигурация чёрного списка (ёмкость, интервал автоочистки) задаётся при инициализации в Разделе 1. См. [Чёрный список токенов](../guides/blacklist).
:::

## 7. Регистрация Маршрутов и Плавное Завершение

Регистрируются все маршруты, `signal.Notify` перехватывает `SIGINT`/`SIGTERM`, затем `server.Shutdown` ожидает завершения активных запросов перед закрытием `processor` для освобождения чёрного списка и других ресурсов:

```go
func main() {
    // Инициализация processor (см. Раздел 1)
    var err error
    processor, expiresInSeconds, err = newJWTProcessor()
    if err != nil {
        log.Fatalf("Ошибка инициализации JWT processor: %v", err)
    }

    // Адрес настраивается через JWT_PORT, по умолчанию :8080
    addr := ":8080"

    // Регистрация маршрутов
    mux := http.NewServeMux()
    mux.HandleFunc("/login", loginHandler)
    mux.HandleFunc("/profile", authMiddleware(profileHandler))
    mux.HandleFunc("/admin", authMiddleware(requireRole("admin", adminHandler)))
    mux.HandleFunc("/logout", authMiddleware(logoutHandler))
    // /refresh аутентифицируется refresh-токеном, а не через middleware access-токена
    mux.HandleFunc("/refresh", refreshHandler)

    server := &http.Server{
        Addr:         addr,
        Handler:      mux,
        ReadTimeout:  15 * time.Second,
        WriteTimeout: 15 * time.Second,
        IdleTimeout:  60 * time.Second,
    }

    // Запуск сервера в goroutine
    go func() {
        log.Printf("Сервер слушает http://localhost%s", addr)
        if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatalf("Сбой сервера: %v", err)
        }
    }()

    // Ожидание сигнала прерывания для плавного завершения
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit

    log.Println("Завершение работы сервера...")

    // Плавное завершение с тайм-аутом
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    if err := server.Shutdown(ctx); err != nil {
        log.Printf("Ошибка завершения сервера: %v", err)
    }

    // Закрытие JWT processor (освобождение чёрного списка и других ресурсов)
    if err := processor.Close(); err != nil {
        log.Printf("Ошибка закрытия processor: %v", err)
    }

    log.Println("Сервер плавно остановлен")
}
```

## Обзор Маршрутов

| Метод | Путь | Промежуточное ПО | Описание |
|-------|------|------------------|----------|
| POST | /login | нет | Выпуск пары токенов |
| GET | /profile | authMiddleware | Возврат информации о пользователе |
| GET | /admin | authMiddleware + requireRole("admin") | Страница администратора |
| POST | /logout | authMiddleware | Отзыв токена |
| POST | /refresh | нет (использует refresh-токен) | Обмен на новый access-токен |

## Связанные Примеры

- [Базовые примеры](./basic) — HMAC, пары токенов, отзыв, rate limiting
- [Продвинутые примеры](./advanced) — RSA/ECDSA, пользовательские Claims, кастомное хранилище
- [Чёрный список токенов](../guides/blacklist) — Подробно о механизме чёрного списка
