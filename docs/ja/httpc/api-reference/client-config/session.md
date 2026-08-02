---
sidebar_label: "セッション管理"
title: "セッション管理 - CyberGo HTTPC | SessionManager"
description: "HTTPC SessionManager API リファレンス：NewSessionManager 作成、SessionConfig 設定、SetHeader ヘッダー管理、SetCookie メソッドと SetCookieSecurity 検証の完全な使い方。"
sidebar_position: 3
---

# セッション管理

SessionManager はスレッドセーフな Cookie とリクエストヘッダーのストレージを提供し、DomainClient が内部で埋め込んで使用します。`sync.RWMutex` に基づく並行セーフなストレージをカプセル化し、すべての読み取り操作は読み取りロック、書き込み操作は書き込みロックを使用し、高並列シナリオでのクロスリクエストのセッション状態共有に適しています。

:::tip いつ SessionManager を直接使用するか
通常は SessionManager を手動で作成する必要はありません——`NewDomain` が作成する DomainClient が自動的に埋め込みます。SessionManager を直接使用するシナリオには：複数の DomainClient 間でセッションを共有する必要がある、実行時に Cookie セキュリティポリシーを切り替える必要がある、レスポンスから Cookie を一括抽出する必要がある、などがあります。
:::

## SessionConfig

```go
type SessionConfig struct {
    // CookieSecurity は Cookie セキュリティ検証を設定します。
    // nil の場合は Cookie セキュリティ検証を行いません。
    CookieSecurity *CookieSecurityConfig
}
```

| フィールド | タイプ | 説明 |
|------|------|------|
| `CookieSecurity` | `*CookieSecurityConfig` | Cookie セキュリティ検証設定、nil は検証しないことを意味 |

```go
func DefaultSessionConfig() SessionConfig
```

デフォルト設定（Cookie セキュリティ検証なし）を返します。使用方法は下記 [NewSessionManager](#newsessionmanager) を参照してください。

## NewSessionManager

```go
func NewSessionManager(cfg SessionConfig) (*SessionManager, error)
```

セッションマネージャーを作成します。`SessionConfig` 値を渡すか、`NewSessionManagerDefault()` をゼロ引数のショートカットとして使用してください。現在の実装は常に nil error を返しますが、error 戻り値は将来の拡張のための設定検証のために予約されています。

```go
// デフォルト設定を使用
sm, err := httpc.NewSessionManagerDefault()

// 設定付き（厳格な Cookie セキュリティ検証を有効化）
cfg := httpc.DefaultSessionConfig()
cfg.CookieSecurity = httpc.StrictCookieSecurityConfig()
sm, err := httpc.NewSessionManager(cfg)
```

### NewSessionManager vs NewSessionManagerDefault

| コンストラクタ | パラメータ | 適用シナリオ |
|----------|------|----------|
| `NewSessionManager(cfg)` | 明示的な SessionConfig | カスタム CookieSecurity ポリシーが必要 |
| `NewSessionManagerDefault()` | なし | デフォルト設定（Cookie セキュリティ検証なし） |

`NewSessionManagerDefault()` は `NewSessionManager(DefaultSessionConfig())` と同等で、メインクライアントの `NewDefault()` と対称な設計です。

## NewSessionManagerDefault

```go
func NewSessionManagerDefault() (*SessionManager, error)
```

便利なコンストラクタで、`NewSessionManager(DefaultSessionConfig())` と同等です。

```go
sm, err := httpc.NewSessionManagerDefault()
```

## ヘッダー管理

SessionManager は以下のメソッドでクロスリクエストのリクエストヘッダーを維持します。すべてのメソッドはスレッドセーフで、書き込み操作（SetHeader/SetHeaders/DeleteHeader/ClearHeaders）は書き込みロックを取得し、読み取り操作（GetHeaders）は読み取りロックを取得します。

### SetHeader

```go
func (s *SessionManager) SetHeader(key, value string) error
```

単一のセッションヘッダーを追加または更新します。以降のすべてのリクエストに自動的に付与されます。呼び出し前に `validation.ValidateHeaderKeyValue` でキーと値の有効性を検証し（制御文字、CRLF インジェクションなどをインターセプト）、無効な場合はラップされたエラーを返します。nil レシーバは `"session manager is nil"` を返します。

```go
err := sm.SetHeader("Authorization", "Bearer "+token)
if err != nil {
    log.Fatalf("リクエストヘッダーの設定に失敗: %v", err)
}
```

### SetHeaders

```go
func (s *SessionManager) SetHeaders(headers map[string]string) error
```

セッションヘッダーを一括で追加または更新します。まずロック外で各項目を検証し（いずれかが無効なら全体を拒否）、その後ロック内で `maps.Copy` でマージします。アトミックなセマンティクス：すべて成功するか、すべて変更なしのいずれかです。

```go
err := sm.SetHeaders(map[string]string{
    "Authorization": "Bearer " + token,
    "Accept":        "application/json",
    "X-Custom":      "value",
})
```

### DeleteHeader

```go
func (s *SessionManager) DeleteHeader(key string)
```

key で指定したセッションヘッダーを削除します。key が存在しない場合は暗黙的に何もしません。nil レシーバはセーフ（直接リターン）。

### ClearHeaders

```go
func (s *SessionManager) ClearHeaders()
```

すべてのセッションヘッダーをクリアし、空の map に再初期化します。

### GetHeaders

```go
func (s *SessionManager) GetHeaders() map[string]string
```

すべてのセッションヘッダーの**ディープコピー**を返します（新規 map 割り当て + 値コピー）。呼び出し側がコピーを変更しても内部状態に影響しません。空のセッションは空の map（nil ではない）を返します。

### ヘッダー管理メソッド一覧

| メソッド | シグネチャ | ロック | 説明 |
|------|------|----|------|
| SetHeader | `(key, value string) error` | 書き込みロック | 単一設定、検証含む |
| SetHeaders | `(headers map[string]string) error` | 書き込みロック | 一括設定、アトミック検証 |
| DeleteHeader | `(key string)` | 書き込みロック | key で削除 |
| ClearHeaders | `()` | 書き込みロック | 全クリア |
| GetHeaders | `() map[string]string` | 読み取りロック | ディープコピーを返す |

## Cookie 管理

SessionManager は以下のメソッドでクロスリクエストの Cookie を維持します。すべての書き込み操作は `validation.ValidateCookie` で有効性を検証します；`CookieSecurity` が設定されている場合は、セキュリティ属性（Secure/HttpOnly/SameSite）も追加で検証します。

### SetCookie

```go
func (s *SessionManager) SetCookie(cookie *http.Cookie) error
```

単一のセッション Cookie を追加または更新します。検証フロー：① nil cookie チェック；② `ValidateCookie` の基本検証；③ CookieSecurity が設定されている場合、`validateCookieSecurity` を実行（スレッドセーフを保証するため書き込みロック内で実行）。いずれかの検証が失敗した場合はラップされたエラーを返し、ストレージは変更しません。

```go
err := sm.SetCookie(&http.Cookie{
    Name:     "session",
    Value:    "abc123",
    Secure:   true,
    HttpOnly: true,
    SameSite: http.SameSiteStrictMode,
})
if err != nil {
    log.Fatalf("Cookie の設定に失敗: %v", err)
}
```

### SetCookies

```go
func (s *SessionManager) SetCookies(cookies []*http.Cookie) error
```

Cookie を一括設定します。**2 フェーズのアトミック書き込み**を採用：① ロック外ですべての cookie の基本有効性を事前検証（nil チェック + ValidateCookie）；② ロック内で各項目のセキュリティ検証を順次実行し、いずれかが失敗したら即座にエラーを返す（検証済みのものも書き込まれない）；③ すべて通過後に一括格納。これにより一括操作のアトミック性が保証されます——「一部書き込み」の中間状態は発生しません。

### DeleteCookie

```go
func (s *SessionManager) DeleteCookie(name string)
```

名前で Cookie を削除します。name が存在しない場合は暗黙的に何もしません。

### ClearCookies

```go
func (s *SessionManager) ClearCookies()
```

すべての Cookie をクリアし、空の map に再初期化します。

### GetCookies

```go
func (s *SessionManager) GetCookies() []*http.Cookie
```

すべての Cookie の**ディープコピー**を返します。連続したバッキング配列の最適化を採用：長さ N の `[]http.Cookie` 連続配列を事前に割り当て、すべての Cookie 構造体がその中に連続して並び、返される `[]*http.Cookie` がその配列を指します。これにより N 回の独立したヒープ割り当てが 2 回（バッキング配列 + ポインタスライス）に削減され、GC 負荷が大幅に軽減されます。空のセッションは nil を返します。

### GetCookie

```go
func (s *SessionManager) GetCookie(name string) *http.Cookie
```

名前で Cookie の**ディープコピー**を取得します。存在しない場合は nil を返します。

### Cookie 管理メソッド一覧

| メソッド | シグネチャ | ロック | 検証 |
|------|------|----|------|
| SetCookie | `(cookie *http.Cookie) error` | 書き込みロック | ValidateCookie + オプション CookieSecurity |
| SetCookies | `(cookies []*http.Cookie) error` | 書き込みロック | 2 フェーズアトミック検証 |
| DeleteCookie | `(name string)` | 書き込みロック | なし |
| ClearCookies | `()` | 書き込みロック | なし |
| GetCookies | `() []*http.Cookie` | 読み取りロック | なし（ディープコピーを返す） |
| GetCookie | `(name string) *http.Cookie` | 読み取りロック | なし（ディープコピーを返す） |

## Cookie セキュリティ

### SetCookieSecurity

```go
func (s *SessionManager) SetCookieSecurity(config *CookieSecurityConfig)
```

実行時に Cookie セキュリティ検証設定を更新し、**以降のすべて**の SetCookie/SetCookies/UpdateFromResult/UpdateFromCookies 呼び出しに影響します。nil を渡すとセキュリティ検証を無効化します。nil レシーバはセーフです。これはセキュリティポリシーを切り替える唯一のエントリです——SessionManager を再構築せずに実行時に緩やかなポリシーから厳格なポリシーへ、またはその逆に切り替えられます。

```go
// 実行時に緩やかから厳格に切り替え
sm.SetCookieSecurity(httpc.StrictCookieSecurityConfig())

// セキュリティ検証を無効化
sm.SetCookieSecurity(nil)
```

### CookieSecurityConfig フィールド

```go
type CookieSecurityConfig struct {
    RequireSecure                bool    // Secure 属性を要求（HTTPS 送信のみ）
    RequireHttpOnly              bool    // HttpOnly 属性を要求（XSS 防止）
    RequireSameSite              string  // SameSite 値を要求："Strict"/"Lax"/"None"/""
    AllowSameSiteNone            bool    // SameSite=None を許可するか
    RequireSecureForSameSiteNone bool    // SameSite=None 時に Secure を強制
}
```

利用可能なファクトリ関数：

| ファクトリ関数 | 説明 |
|----------|------|
| `DefaultCookieSecurityConfig()` | 緩やかなデフォルト（非 HTTPS 許可、JS アクセス許可、SameSite=None 許可） |
| `StrictCookieSecurityConfig()` | 厳格ポリシー（Secure + HttpOnly + SameSite=Strict を要求） |

### UpdateFromResult

```go
func (s *SessionManager) UpdateFromResult(result *Result)
```

リクエスト結果（`*Result`）の `Response.Cookies` から Cookie を抽出してセッションに格納します。CookieSecurity が設定されている場合、安全でない Cookie は**暗黙的にスキップ**されます（エラーを返さず直接無視）。result が nil、Response が nil、または Cookies が空の場合は直接リターンします。DomainClient の `Request` メソッドが毎リクエスト後にこのメソッドを自動的に呼び出します。

### UpdateFromCookies

```go
func (s *SessionManager) UpdateFromCookies(cookies []*http.Cookie)
```

Cookie スライスからセッション Cookie を更新します。セマンティクスは UpdateFromResult と同じ——安全でない Cookie は暗黙的にスキップされます。DomainClient の Download メソッドがこのメソッド経由でダウンロードレスポンスの Cookie をキャプチャします。

## 内部メカニズム

### captureFromOptions

```go
func (s *SessionManager) captureFromOptions(options []RequestOption)
```

DomainClient の `prepareSessionOptions` が内部でこのメソッドを呼び出し、ユーザーが提供した RequestOptions から Cookie と Header を抽出してセッションに格納します。実装の詳細：

1. オブジェクトプールの一時 `engine.Request`（`acquireMiddlewareRequest`/`releaseMiddlewareRequest`）を使用し、ホットパスの割り当てを削減
2. 一時リクエストに option を順次適用——**セキュリティ対策**：各 option 適用の前後に `OnRequest`/`OnResponse` コールバックをクリアし、`WithOnRequest`/`WithOnResponse` のクロージャがキャプチャ過程で累積して副作用をトリガーするのを防止
3. 一時リクエスト上の Cookie と Header を抽出、検証後にセッションに格納
4. Cookie と Header のみを抽出し、その他のデータ（query params、body、コールバック）は破棄

:::warning RequestOptions は 2 回実行される
DomainClient の Request/Download は RequestOptions を**2 回実行**します——1 回はセッションキャプチャ（captureFromOptions）用、1 回は実際のリクエスト用。そのため**副作用のある option は回避**してください（カウンター、nonce 生成、乱数など）。副作用が必要な場合は基盤の Client を直接使用してください。
:::

### prepareOptions

```go
func (s *SessionManager) prepareOptions() []RequestOption
```

DomainClient が毎リクエスト前にこのメソッドを呼び出し、現在のセッション状態を RequestOptions として注入します：

- **Cookie の一括注入**：すべてのセッション Cookie を 1 つのクロージャ option にパッケージ化（`r.SetCookies(append(existing, cookies...))`）、N 回のクロージャ割り当てを回避
- **Header map の注入**：`WithHeaderMap` でディープコピーした header map を一度に注入

セッションが空（Cookie も Header もない）の場合は nil を返し、オーバーヘッドゼロです。

### スレッドセーフモデル

SessionManager は単一の `sync.RWMutex` ですべての状態を保護します：

| 操作タイプ | ロックレベル | メソッド |
|----------|--------|------|
| 読み取り（GetHeaders/GetCookies/GetCookie/prepareOptions） | RLock | 並行可能 |
| 書き込み（Set*/Delete*/Clear*/UpdateFrom*/captureFromOptions/SetCookieSecurity） | Lock | 排他 |

DomainClient の `prepareSessionOptions` は「先に読み取り後に書き込み」の非アトミックなシーケンスを採用：先にスナップショットを読み取り（prepareOptions）、その後キャプチャを書き込み（captureFromOptions）、2 ステップの間に並行リクエストがインターリーブする可能性があります。これは**最終的整合性**の設計です——各リクエストは `prepareOptions()` 時点で一貫したスナップショットをキャプチャし、クロスリクエストの瞬間的な競合は単一リクエストの正確性に影響しません。

## 完全例：ログインセッションの維持

以下の例は DomainClient がログインセッションを自動管理する方法を示します：ログイン後の Cookie が自動的に維持され、ログアウトまで保持されます。

```go
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/cybergodev/httpc"
)

func main() {
	ctx := context.Background()

	// DomainClient を作成、Cookie を自動的に有効化し SessionManager を埋め込み
	dc, err := httpc.NewDomain("https://httpbin.org", httpc.DefaultConfig())
	if err != nil {
		log.Fatalf("クライアントの作成に失敗: %v", err)
	}
	defer func() { _ = dc.Close() }()

	// セッションヘッダーを手動設定（以降のすべてのリクエストに自動付与）
	sm := dc.Session()
	if err := sm.SetHeader("Accept", "application/json"); err != nil {
		log.Fatalf("リクエストヘッダーの設定に失敗: %v", err)
	}
	if err := sm.SetCookie(&http.Cookie{
		Name:  "session",
		Value: "initial",
	}); err != nil {
		log.Fatalf("Cookie の設定に失敗: %v", err)
	}

	// ログイン：レスポンスの Set-Cookie は UpdateFromResult によって自動的にセッションにキャプチャ
	loginCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	_, err = dc.Request(loginCtx, "POST", "/cookies/set?token=abc123")
	cancel()
	if err != nil {
		log.Fatalf("ログインに失敗: %v", err)
	}

	// 以降のリクエストは自動的にセッション内の Cookie を付与
	verifyCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	result, err := dc.Request(verifyCtx, "GET", "/cookies")
	cancel()
	if err != nil {
		log.Fatalf("検証に失敗: %v", err)
	}

	fmt.Println("セッション Cookie の維持に成功、レスポンス：")
	fmt.Println(result.String())

	// ログアウト：セッションをクリア
	sm.ClearCookies()
	sm.ClearHeaders()

	fmt.Println("ログアウトしました、セッションをクリア済み")
}
```

:::tip SessionManager の手動管理
SessionManager を独立して作成し、複数の DomainClient 間で共有することも可能です。ただし通常は DomainClient の自動管理で要件を満たせます——毎リクエスト後に自動的にレスポンス Cookie をキャプチャし、リクエスト前に自動的にセッション状態を注入します。
:::

## 関連項目

- [ドメインクライアント](./domain-client) - DomainClient リファレンス
- [ドメインクライアントとセッション](../../guides/domain-session) - 使用ガイド
- [インターフェース定義](../types/interfaces) - DomainClienter インターフェースのリファレンス
- [定数とタイプ](../types/constants) - CookieSecurityConfig フィールドのリファレンス
