---
sidebar_label: "テストガイド"
title: "テストガイド - CyberGo HTTPC | httptest とモック"
description: "HTTPC テストガイド：TestingConfig テスト専用設定、net/http/httptest モックサーバー統合、Doer モック注入、エラー/遅延/リダイレクトのシミュレーション、決定論的リトライとダウンロードテスト、テーブル駆動テストと Cookie セッションアサーションの実践。"
sidebar_position: 13
---

# テストガイド

## TestingConfig

`TestingConfig()` はテスト環境専用に設計されており、セキュリティチェックを無効化し、接続/ハンドシェイクタイムアウトを短縮します（Request はデフォルトの 180s のまま）：

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
`TestingConfig` は TLS 検証、SSRF 防護などのセキュリティ機能を無効化します。**テスト環境専用**としてください。テスト以外の環境で使用するとセキュリティ警告が出力されます。
:::

`TestingConfig` の主要な設定値（`DefaultConfig` をベースに上書き）：`InsecureSkipVerify=true`、`AllowPrivateIPs=true`、`ValidateURL=false`、`ValidateHeaders=false`（127.0.0.1/内部ネットワークの httptest サーバーを許可）。`EnableHTTP2=false`（プロトコルの挙動がより単純になり、アサーションしやすい）。`MaxRetries=1`、`EnableJitter=false`（リトライのリズムが確定）。接続/ハンドシェイクタイムアウトは 5s に短縮、`Request` はデフォルトの 180s のままです。

:::tip セキュリティ警告について
警告は `.test` 実行ファイルと `GO_TEST` 環境変数の検出でテスト環境を識別します——`go test` で実行されるテストでは**発火しません**。ローカル開発スクリプトなどテスト以外のプロセスで一時的に使う場合は、`httpc.SetSecurityWarnOutput(io.Discard)` で出力を抑制できます（`io` は標準ライブラリの `io` パッケージ）。
:::

## httptest.Server 統合

標準ライブラリ `net/http/httptest` でモックサーバーを作成し、実際のバックエンドなしで統合テストを実現します：

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
    // モックサーバーを作成
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

    // TestingConfig でクライアントを作成
    client, err := httpc.New(httpc.TestingConfig())
    if err != nil {
        t.Fatal(err)
    }
    defer client.Close()

    // モックサーバーへリクエストを送信
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

## モックと Transport 注入

カスタム Transport の注入（基盤の `http.RoundTripper` の差し替え）は現在 HTTPC の**内部機構**です——エンジンのトランスポート層インターフェースとモックはライブラリ自身のテスト専用であり、ルートパッケージ `httpc` は注入入口をエクスポートしていません。利用者には 2 つの推奨パスがあります：

| 方式 | 対象レイヤー | 特徴 |
|------|----------|------|
| `httptest.Server` | 統合テスト | **完全な**リクエストパイプラインを通る（セキュリティ検証、リトライ、ミドルウェア、コネクションプール）。実際の挙動に最も近い |
| `httpc.Doer` 最小インターフェースの実装 | ユニットテスト | サーバーを立てず、ネットワークリクエストも発せず、構築済みの `*Result` を直接返す。ナノ秒オーダーで完全に確定的 |

`Doer` は `Request` 1 つだけのメソッドを持つインターフェースです。`Result` の `Request`/`Response`/`Meta` の 3 フィールドは、まさに呼び出し側がテストで直接構築するためにエクスポートされています：

```go
package main

import (
    "context"
    "fmt"
    "log"

    "github.com/cybergodev/httpc"
)

// fakeDoer は httpc.Doer を実装：ネットワークに接続せず、事前に用意した結果を直接返す
type fakeDoer struct {
    result *httpc.Result
    err    error
}

func (f *fakeDoer) Request(ctx context.Context, method, url string, options ...httpc.RequestOption) (*httpc.Result, error) {
    return f.result, f.err
}

// getUser はテスト対象の業務関数の例：具象 Client ではなく httpc.Doer に依存する
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
    fmt.Println(name) // 出力：Test User
}
```

:::tip Result を構築するときは Body と RawBody を両方設定
`Body()` は保持された文字列を、`RawBody()` はバイトスライスを返し、`Unmarshal` は生バイトを扱います——モックでは両方を埋めておかないと、各アクセサーが期待どおり動作しません。
:::

## 様々なシナリオのシミュレーション

### エラーレスポンスのシミュレーション

```go
server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusNotFound)
    json.NewEncoder(w).Encode(map[string]string{
        "error": "user not found",
    })
}))
defer server.Close()
```

### 遅延のシミュレーション

```go
// TestingConfig は SSRF 防護を無効化——そうしないとデフォルトクライアントは 127.0.0.1 の
// テストサーバーをブロックし、タイムアウトエラーではなく SSRF エラーが得られる。
client, _ := httpc.New(httpc.TestingConfig())
defer client.Close()

server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    time.Sleep(5 * time.Second)
    w.WriteHeader(http.StatusOK)
}))
defer server.Close()

// タイムアウト処理のテスト：1s のコンテキストタイムアウト < 5s のサーバー側遅延
ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
defer cancel()

_, err := client.Request(ctx, "GET", server.URL)
if err == nil {
    t.Fatal("expected timeout error")
}
```

### リダイレクトのシミュレーション

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

### ファイルアップロードのシミュレーション

```go
server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    if r.Method != "POST" {
        t.Errorf("expected POST, got %s", r.Method)
    }

    // multipart フォームをパース
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

### TLS サーバーのシミュレーション

`httptest.NewTLSServer` は自己署名証明書を使用します。`TestingConfig` は `InsecureSkipVerify=true` を設定済みのため、追加の TLS 設定なしでそのままリクエストできます：

```go
server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusOK)
    w.Write([]byte("secure"))
}))
defer server.Close()

client, _ := httpc.New(httpc.TestingConfig())
defer client.Close()

result, err := client.Get(server.URL) // 自己署名 TLS サーバーに直接リクエスト
```

### 決定論的なリトライテスト

サーバーに**最初の N 回はリトライ可能なステータスコード（408/429/500/502/503/504）を返し、その後成功**させることで、タイマーや実際のネットワークジッターに依存せずにリトライ挙動を検証でき、`result.Meta.Attempts` で実際の試行回数をアサーションできます：

```go
func TestRetry(t *testing.T) {
    var calls int32

    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if atomic.AddInt32(&calls, 1) <= 2 {
            w.WriteHeader(http.StatusServiceUnavailable) // 最初の 2 回は 503（リトライ可能）
            return
        }
        w.WriteHeader(http.StatusOK) // 3 回目で成功
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

    if result.Meta.Attempts != 3 { // オリジナル 1 回 + リトライ 2 回
        t.Errorf("expected 3 attempts, got %d", result.Meta.Attempts)
    }
}
```

:::tip テストではリトライパラメータを明示的に固定する
`TestingConfig` はデフォルトで `MaxRetries=1` かつジッターなしです。テストでは `WithMaxRetries(N)` で期待値を明示的に与えると、アサーションが安定します。
:::

## ファイルダウンロードのテスト

`Download` も同様に httptest でカバーできます：サーバー側が既知の内容を書き込み、`DownloadConfig.FilePath` を `t.TempDir()` に向け（テスト終了時に自動クリーンアップ）、バイト数とチェックサムをアサーションします：

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
    cfg.Checksum = hex.EncodeToString(sum[:]) // ついでにチェックサムのパスも検証

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

## Cookie とセッションのアサーション

Cookie の挙動は両端からアサーションできます：**サーバー側**でリクエストに実際に含まれた Cookie を読む（クライアントが確かに送信したことを検証）、**クライアント側**で `result.GetCookie`/`HasCookie` でレスポンス Cookie を検証、または `DomainClient` でセッションの自動キャプチャを検証します：

```go
func TestCookieSession(t *testing.T) {
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        switch r.URL.Path {
        case "/login":
            http.SetCookie(w, &http.Cookie{Name: "session", Value: "abc123", Path: "/"})
            w.WriteHeader(http.StatusOK)
        case "/me":
            // サーバー側アサーション：2 回目のリクエストにはセッション Cookie が自動的に付与されているはず
            if c, err := r.Cookie("session"); err != nil || c.Value != "abc123" {
                t.Errorf("expected session cookie abc123, got %v (err=%v)", c, err)
            }
            w.WriteHeader(http.StatusOK)
        }
    }))
    defer server.Close()

    dc, err := httpc.NewDomain(server.URL, httpc.TestingConfig()) // SSRF のプライベート IP ブロックをバイパス
    if err != nil {
        t.Fatal(err)
    }
    defer dc.Close()

    if _, err := dc.Get("/login"); err != nil { // レスポンス Cookie が自動的にセッションへ
        t.Fatal(err)
    }
    if c := dc.GetCookie("session"); c == nil || c.Value != "abc123" {
        t.Errorf("session cookie not captured: %+v", c)
    }
    if _, err := dc.Get("/me"); err != nil { // セッション Cookie がリクエストとともに送信される
        t.Fatal(err)
    }
}
```

## テーブル駆動テスト

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

## ベストプラクティス

| 実践 | 説明 |
|------|------|
| `httptest.Server` を使う | 実際の HTTP 挙動をシミュレート。ネットワーク依存なしで完全なリクエストパイプラインをカバー |
| `TestingConfig()` を使う | セキュリティチェックを無効化し、ローカル接続が SSRF 防護でブロックされるのを回避 |
| 業務レイヤーは `Doer` インターフェースに依存 | 最小インターフェース依存により、ユニットテストでは fake 代替でサーバー不要 |
| 決定論的なリトライ | サーバーは最初の N 回 503 を返してから成功。`Meta.Attempts` でアサーション |
| ダウンロードテストには `t.TempDir()` | テスト終了時にファイルを自動クリーンアップ。かつパスは自然にセキュリティ検証を通過 |
| `defer` を使う | テスト失敗時でもリソース解放を保証 |
| テーブル駆動 | 複数入力をカバーし、コードを簡潔に |
| リトライ/タイムアウトパラメータを明示的に固定 | `WithMaxRetries(N)` などで明示宣言するとアサーションが安定 |

## 次のステップ

- [設定 API](../api-reference/client-config/config) - TestingConfig の詳細パラメータ
- [エラータイプ](../api-reference/types/errors) - エラーアサーションのリファレンス
- [ミドルウェアチェーン](./middleware-chain) - ミドルウェアのテストパターン
- [ファイルアップロードとダウンロード](./file-transfer) - ダウンロードセマンティクスの詳細（このページの「ファイルダウンロードのテスト」の展開）
- [高度な使用例](../examples/advanced-usage) - 本番レベルのコードパターン
