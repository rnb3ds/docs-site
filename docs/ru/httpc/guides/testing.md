---
sidebar_label: "Руководство по тестированию"
title: "Руководство по тестированию - CyberGo HTTPC | httptest"
description: "Тестирование HTTPC: TestingConfig, мок-серверы httptest, подмена через Doer, ошибки и задержки, детерминированные повторы, табличные тесты и сессии Cookie."
sidebar_position: 13
---

# Руководство по тестированию

## TestingConfig

`TestingConfig()` создан для тестовых окружений: отключает проверки безопасности, сокращает таймауты установки соединения и рукопожатия (Request остаётся стандартным 180s):

```go
func TestAPI(t *testing.T) {
    client, err := httpc.New(httpc.TestingConfig())
    if err != nil {
        t.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("http://localhost:8080/test")
    // ...
}
```

:::danger
`TestingConfig` отключает верификацию TLS, защиту от SSRF и другие механизмы безопасности — **только для тестовых окружений**. При использовании вне тестов выводится предупреждение безопасности.
:::

Ключевые значения `TestingConfig` (поверх `DefaultConfig`): `InsecureSkipVerify=true`, `AllowPrivateIPs=true`, `ValidateURL=false`, `ValidateHeaders=false` (допускают httptest-серверы на 127.0.0.1/внутренних адресах); `EnableHTTP2=false` (поведение протокола проще и легче утверждать); `MaxRetries=1`, `EnableJitter=false` (детерминированный ритм повторов); таймауты соединения/рукопожатия сокращены до 5s, `Request` остаётся стандартным 180s.

:::tip О предупреждении безопасности
Предупреждение отличает тестовое окружение по исполняемому файлу `.test` и переменной окружения `GO_TEST` — тесты под `go test` его **не** вызывают. Если конфигурация временно нужна в нетестовом процессе (например, локальном dev-скрипте), отключите вывод через `httpc.SetSecurityWarnOutput(io.Discard)` (`io` — стандартный пакет `io`).
:::

## Интеграция с httptest.Server

Имитационный сервер из стандартной библиотеки `net/http/httptest` даёт интеграционные тесты без реального бэкенда:

<!-- check-code: skip -->
```go
package main

import (
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "testing"

    "github.com/cybergodev/httpc"
)

func TestGetUser(t *testing.T) {
    // Создаём имитационный сервер
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if r.URL.Path != "/users/1" {
            t.Errorf("unexpected path: %s", r.URL.Path)
        }
        if r.Header.Get("Authorization") != "Bearer test-token" {
            t.Errorf("missing auth header")
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
            "id":   1,
            "name": "Test User",
        })
    }))
    defer server.Close()

    // Клиент с TestingConfig
    client, err := httpc.New(httpc.TestingConfig())
    if err != nil {
        t.Fatal(err)
    }
    defer client.Close()

    // Отправляем запрос на имитационный сервер
    result, err := client.Get(server.URL+"/users/1",
        httpc.WithBearerToken("test-token"),
    )
    if err != nil {
        t.Fatal(err)
    }

    if !result.IsSuccess() {
        t.Fatalf("expected success, got %d", result.StatusCode())
    }

    var user struct {
        ID   int    `json:"id"`
        Name string `json:"name"`
    }
    if err := result.Unmarshal(&user); err != nil {
        t.Fatal(err)
    }

    if user.Name != "Test User" {
        t.Errorf("expected Test User, got %s", user.Name)
    }
}
```

## Mock и внедрение Transport

Внедрение кастомного Transport (замена нижележащего `http.RoundTripper`) на сегодня — **внутренний механизм** HTTPC: интерфейс транспортного слоя движка и моки предназначены для собственных тестов библиотеки, корневой пакет `httpc` не экспортирует точек внедрения. Пользователям доступны два рекомендованных пути:

| Способ | Уровень | Особенности |
|--------|---------|-------------|
| `httptest.Server` | Интеграционные тесты | Проходит **полный** конвейер запроса (проверки безопасности, повторы, middleware, пул соединений), максимально близко к реальному поведению |
| Реализация минимального интерфейса `httpc.Doer` | Юнит-тесты | Без запуска сервера и сетевых запросов; напрямую возвращает сконструированный `*Result`, наносекунды, полная детерминированность |

`Doer` — интерфейс с единственным методом `Request`; а поля `Request`/`Response`/`Meta` структуры `Result` экспортированы ровно для того, чтобы вызывающий конструировал их напрямую в тестах:

```go
package main

import (
    "context"
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

// fakeDoer реализует httpc.Doer: без сети, сразу возвращает предзаданный результат
type fakeDoer struct {
    result *httpc.Result
    err    error
}

func (f *fakeDoer) Request(ctx context.Context, method, url string, options ...httpc.RequestOption) (*httpc.Result, error) {
    return f.result, f.err
}

// getUser — пример тестируемой бизнес-функции: зависит от httpc.Doer, а не от конкретного Client
func getUser(d httpc.Doer, id int) (string, error) {
    result, err := d.Request(context.Background(), "GET", fmt.Sprintf("https://api.example.com/users/%d", id))
    if err != nil {
        return "", err
    }
    if !result.IsSuccess() {
        return "", fmt.Errorf("API error: %d", result.StatusCode())
    }
    var name struct {
        Name string `json:"name"`
    }
    if err := result.Unmarshal(&name); err != nil {
        return "", err
    }
    return name.Name, nil
}

func main() {
    fake := &fakeDoer{
        result: &httpc.Result{
            Response: &httpc.ResponseInfo{
                StatusCode: 200,
                Status:     "200 OK",
                Body:       `{"name":"Test User"}`,
                RawBody:    []byte(`{"name":"Test User"}`),
                Headers:    map[string][]string{"Content-Type": {"application/json"}},
            },
            Meta: &httpc.RequestMeta{Attempts: 1},
        },
    }

    name, err := getUser(fake, 1)
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(name) // Вывод: Test User
}
```

:::tip При конструировании Result заполняйте и Body, и RawBody
`Body()` возвращает заранее сохранённую строку, `RawBody()` — срез байт, а `Unmarshal` работает по исходным байтам — заполните в моке оба поля, тогда все аксессоры будут работать как ожидается.
:::

## Имитация разных сценариев

### Имитация ошибочного ответа

```go
server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusNotFound)
    json.NewEncoder(w).Encode(map[string]string{
        "error": "user not found",
    })
}))
defer server.Close()
```

### Имитация задержки

```go
// TestingConfig отключает защиту от SSRF — иначе клиент по умолчанию заблокирует
// тестовый сервер на 127.0.0.1, и вы получите SSRF-ошибку вместо ошибки таймаута.
client, _ := httpc.New(httpc.TestingConfig())
defer client.Close()

server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    time.Sleep(5 * time.Second)
    w.WriteHeader(http.StatusOK)
}))
defer server.Close()

// Тестируем обработку таймаута: контекст 1s < серверная задержка 5s
ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
defer cancel()

_, err := client.Request(ctx, "GET", server.URL)
if err == nil {
    t.Fatal("expected timeout error")
}
```

### Имитация перенаправления

```go
server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    switch r.URL.Path {
    case "/old":
        http.Redirect(w, r, "/new", http.StatusMovedPermanently)
    case "/new":
        w.WriteHeader(http.StatusOK)
        w.Write([]byte("redirected"))
    }
}))
defer server.Close()
```

### Имитация выгрузки файла

```go
server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    if r.Method != "POST" {
        t.Errorf("expected POST, got %s", r.Method)
    }

    // Разбор multipart-формы
    r.ParseMultipartForm(10 << 20)
    file, header, err := r.FormFile("upload")
    if err != nil {
        t.Fatal(err)
    }
    defer file.Close()

    if header.Filename != "test.txt" {
        t.Errorf("expected test.txt, got %s", header.Filename)
    }

    w.WriteHeader(http.StatusOK)
}))
defer server.Close()
```

### Имитация TLS-сервера

`httptest.NewTLSServer` использует самоподписанный сертификат. `TestingConfig` уже ставит `InsecureSkipVerify=true`, поэтому запросы идут напрямую, без дополнительной TLS-конфигурации:

```go
server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusOK)
    w.Write([]byte("secure"))
}))
defer server.Close()

client, _ := httpc.New(httpc.TestingConfig())
defer client.Close()

result, err := client.Get(server.URL) // Прямой запрос к TLS-серверу с самоподписанным сертификатом
```

### Детерминированное тестирование повторов

Пусть сервер **первые N раз возвращает повторяемый код (408/429/500/502/503/504), затем успех** — так поведение повторов проверяется без таймеров и реального сетевого джиттера, а фактическое число попыток утверждается через `result.Meta.Attempts`:

```go
func TestRetry(t *testing.T) {
    var calls int32

    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if atomic.AddInt32(&calls, 1) <= 2 {
            w.WriteHeader(http.StatusServiceUnavailable) // Первые два раза 503 (повторяемый)
            return
        }
        w.WriteHeader(http.StatusOK) // Третий раз — успех
    }))
    defer server.Close()

    client, err := httpc.New(httpc.TestingConfig())
    if err != nil {
        t.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get(server.URL, httpc.WithMaxRetries(2))
    if err != nil {
        t.Fatal(err)
    }

    if result.Meta.Attempts != 3 { // 1 исходный + 2 повтора
        t.Errorf("expected 3 attempts, got %d", result.Meta.Attempts)
    }
}
```

:::tip Явно фиксируйте параметры повторов в тестах
В `TestingConfig` по умолчанию `MaxRetries=1` без джиттера; в тестах явно задавайте ожидание через `WithMaxRetries(N)` — только тогда утверждения стабильны.
:::

## Тестирование скачивания файлов

`Download` тоже покрывается через httptest: сервер отдаёт известное содержимое, `DownloadConfig.FilePath` указывает в `t.TempDir()` (автоочистка по завершении теста), дальше утверждаются число байт и контрольная сумма:

```go
func TestDownload(t *testing.T) {
    payload := []byte("file content for download test")

    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Length", strconv.Itoa(len(payload)))
        _, _ = w.Write(payload)
    }))
    defer server.Close()

    client, err := httpc.New(httpc.TestingConfig())
    if err != nil {
        t.Fatal(err)
    }
    defer client.Close()

    sum := sha256.Sum256(payload)

    cfg := httpc.DefaultDownloadConfig()
    cfg.FilePath = filepath.Join(t.TempDir(), "out.bin")
    cfg.Checksum = hex.EncodeToString(sum[:]) // Заодно проверяем путь с контрольной суммой

    result, err := client.Download(context.Background(), server.URL, cfg)
    if err != nil {
        t.Fatal(err)
    }

    if result.BytesWritten != int64(len(payload)) {
        t.Errorf("expected %d bytes, got %d", len(payload), result.BytesWritten)
    }
    if result.ActualChecksum != cfg.Checksum {
        t.Errorf("checksum mismatch: %s != %s", result.ActualChecksum, cfg.Checksum)
    }
}
```

## Утверждения для Cookie и сессии

Поведение Cookie можно утверждать с двух концов: **сервер** читает фактически полученные в запросе Cookie (проверяем, что клиент их действительно отправил); **клиент** проверяет Cookie ответа через `result.GetCookie`/`HasCookie` либо автоматический захват сессии в `DomainClient`:

```go
func TestCookieSession(t *testing.T) {
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        switch r.URL.Path {
        case "/login":
            http.SetCookie(w, &http.Cookie{Name: "session", Value: "abc123", Path: "/"})
            w.WriteHeader(http.StatusOK)
        case "/me":
            // Утверждение на сервере: второй запрос должен автоматически нести Cookie сессии
            if c, err := r.Cookie("session"); err != nil || c.Value != "abc123" {
                t.Errorf("expected session cookie abc123, got %v (err=%v)", c, err)
            }
            w.WriteHeader(http.StatusOK)
        }
    }))
    defer server.Close()

    dc, err := httpc.NewDomain(server.URL, httpc.TestingConfig()) // Обходим SSRF-блокировку приватных сетей
    if err != nil {
        t.Fatal(err)
    }
    defer dc.Close()

    if _, err := dc.Get("/login"); err != nil { // Cookie ответа автоматически попадают в сессию
        t.Fatal(err)
    }
    if c := dc.GetCookie("session"); c == nil || c.Value != "abc123" {
        t.Errorf("session cookie not captured: %+v", c)
    }
    if _, err := dc.Get("/me"); err != nil { // Cookie сессии отправляются с запросом
        t.Fatal(err)
    }
}
```

## Табличные тесты

```go
func TestHTTPMethods(t *testing.T) {
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        w.Write([]byte(r.Method))
    }))
    defer server.Close()

    client, err := httpc.New(httpc.TestingConfig())
    if err != nil {
        t.Fatal(err)
    }
    defer client.Close()

    tests := []struct {
        name   string
        method func(url string, opts ...httpc.RequestOption) (*httpc.Result, error)
    }{
        {"GET", client.Get},
        {"POST", client.Post},
        {"PUT", client.Put},
        {"PATCH", client.Patch},
        {"DELETE", client.Delete},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result, err := tt.method(server.URL + "/test")
            if err != nil {
                t.Fatal(err)
            }

            if result.Body() != tt.name {
                t.Errorf("expected %s, got %s", tt.name, result.Body())
            }
        })
    }
}
```

## Лучшие практики

| Практика | Пояснение |
|----------|-----------|
| Используйте `httptest.Server` | Имитация реального HTTP-поведения без сети, покрытие полного конвейера запроса |
| Используйте `TestingConfig()` | Отключение проверок безопасности — локальные подключения не блокируются защитой от SSRF |
| Бизнес-слой зависит от интерфейса `Doer` | Минимальная зависимость от интерфейса позволяет юнит-тестам работать с fake-двойником, без сервера |
| Детерминированные повторы | Сервер возвращает N раз 503, затем успех; утверждение через `Meta.Attempts` |
| В тестах скачивания — `t.TempDir()` | Автоочистка файлов по завершении теста, путь естественно проходит проверки безопасности |
| Используйте `defer` | Гарантия освобождения ресурсов даже при падении теста |
| Табличные тесты | Покрытие множества входов лаконичным кодом |
| Явно фиксируйте параметры повторов/таймаутов | Явные `WithMaxRetries(N)` и т. п. — только тогда утверждения стабильны |

## Что дальше

- [Справочник конфигурации](../api-reference/client-config/config) - подробные параметры TestingConfig
- [Типы ошибок](../api-reference/types/errors) - справочник для утверждений об ошибках
- [Цепочки промежуточного ПО](./middleware-chain) - паттерны тестирования middleware
- [Загрузка и выгрузка файлов](./file-transfer) - подробная семантика скачивания (развитие раздела «Тестирование скачивания файлов» этой страницы)
- [Продвинутые примеры](../examples/advanced-usage) - продакшен-паттерны кода
