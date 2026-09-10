---
title: "コア概念 - CyberGo HTTPC | 2 層アーキテクチャと設定体系"
description: "HTTPC コア概念の詳細解説：2 層 API アーキテクチャとコア構成要素の役割表（Client、Result、Session、ミドルウェア、Mutator）、Config と With* オプションの階層分離、ライフサイクルフロー、ドメインセッションクライアントと ClientError エラーモデルで、全体像の把握に役立ちます。"
sidebar_label: "コア概念"
sidebar_position: 2
---

# コア概念

以下の概念を理解すれば、HTTPC の全体像を素早く把握できます。

## コア構成要素の一覧

| 構成要素 | 役割 | ポイント |
|------|------|--------|
| `Client`（インターフェース） | リクエストの実行、コネクションプールとライフサイクルの管理 | `New(cfg)` / `NewDefault()` で作成。7 つの動詞メソッド + `Request` + `Download` + `Close` |
| `Doer`（インターフェース） | 最小のリクエストインターフェース | `Request(ctx, method, url, opts...)` の 1 メソッドのみ。モックとカスタム実装に使用 |
| `RequestOption`（`With*` 関数） | 単一リクエストの構築 | 関数型オプション。渡した順に適用され、1 つでも失敗するとリクエストは即座に中断 |
| `MiddlewareFunc` / `Handler` | ミドルウェアと終端処理 | オニオンモデル。`Chain(mw...)` で組み合わせ |
| `RequestMutator` / `ResponseMutator` | ミドルウェア内のリクエスト/レスポンス読み書きビュー | リクエスト段階でリクエストを、レスポンス段階でレスポンスを読み書き |
| `SessionManager` | セッション状態の保存 | スレッドセーフ。Cookie と共通リクエストヘッダーを一元管理 |
| `DomainClienter`（インターフェース） | ドメインクライアント | ベース URL にバインド + セッションを内包。相対パスを自動結合 |
| `Result` | レスポンスのラッパー | リクエスト/レスポンス/メタ情報の 3 部構造。nil 安全なアクセサ。GC が自動回収 |
| `ClientError` | ネットワーク層エラーの分類 | `errors.As` で抽出。`Code()` / `IsRetryable()` / `Attempts` |

構成要素同士の関係：

```text
パッケージ関数 ──共有──▶ デフォルト Client ◀──作成── New(cfg)
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   ミドルウェアチェーン（任意）  エンジン実行        Download
   Chain(mw...)        セキュリティ検証/リトライ  ファイルのストリーミングダウンロード
        │              │
        ▼              ▼
  RequestMutator     Result（Request / Response / Meta）

DomainClienter = Client + ベース URL + SessionManager
（リクエスト前にセッションヘッダー/Cookie を注入、レスポンス後に Set-Cookie を書き戻す）
```

## 2 層 API アーキテクチャ

HTTPC は標準ライブラリ `net/http` における `http.Get` と `http.Client` の関係に対応する、2 つの等価なリクエスト方式を提供します：

**パッケージ関数** — 設定不要。内部で遅延初期化されるデフォルトクライアントを共有します。スクリプトや一回限りのリクエストに適しています：

```go
result, err := httpc.Get("https://api.example.com/data")
```

**Client インスタンス** — 設定、コネクションプール、ライフサイクルを完全に制御します。長期稼働するサービスに適しています：

```go
client, err := httpc.NewDefault()
defer func() { _ = client.Close() }()
result, err := client.Get("https://api.example.com/data")
```

両方式とも同じリクエストオプション（`WithHeader`、`WithJSON`…）を受け取り、同じ `*Result` 型を返します。パッケージ関数は Client インスタンスの薄いラッパーです。デフォルトクライアントは置き換え可能です：`SetDefaultClient(client)` でカスタムインスタンスをデフォルトに設定し（古いインスタンスは自動的にクローズ）、`CloseDefaultClient()` でクローズしてリセットします——クローズ後の次のパッケージ関数呼び出しで自動再構築されます。

:::tip どちらを使うべきか
一回限りのリクエストや迅速なプロトタイピング → パッケージ関数。本番サービス、カスタム設定やコネクションプール管理が必要 → Client インスタンス。
:::

## 設定体系：Config と With\* オプション

HTTPC は設定を 2 つの独立した階層に分離し、混乱を回避します：

| 階層 | 手段 | スコープ | 代表フィールド |
|------|------|----------|----------------|
| **インスタンス設定** | `Config` 構造体 | クライアントの全ライフサイクル | タイムアウト、リトライポリシー、コネクションプール、TLS |
| **リクエストオプション** | `WithXxx()` 関数 | 単一リクエスト | `WithHeader`、`WithJSON`、`WithTimeout` |

インスタンス設定は `Config` 構造体で `New()` に渡されます。`DefaultConfig()` から始めて必要に応じて変更します：

```go
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 60 * time.Second
cfg.Retry.MaxRetries = 5
client, err := httpc.New(cfg)
```

リクエストオプションは呼び出しごとに渡され、インスタンスレベルのデフォルト値を補完または上書きします：

```go
result, err := client.Get(url,
    httpc.WithHeader("Authorization", "Bearer "+token),
    httpc.WithTimeout(30*time.Second),
)
```

プリセット設定（`SecureConfig()`、`PerformanceConfig()` など）を出発点として使うこともできます。詳しくは [設定 API](../api-reference/client-config/config) をご覧ください。

ライブラリ全体の設定は統一慣例に従います：メインの `Config` と `SessionConfig` は**値渡し**（必須）。ミドルウェア設定は**ポインタ渡し**で、`nil` を渡すとデフォルト値を採用。`DownloadConfig` はポインタ渡しで、`FilePath` の設定が必須です。各 `XxxConfig` には対応する `DefaultXxxConfig()` コンストラクタがあります——デフォルト値から始めて必要なフィールドだけを変更するのが、HTTPC の一貫した設定スタイルです。

## リクエストライフサイクル

各リクエストは以下のフローを経由します：

```text
オプション適用 → ミドルウェアチェーン（存在する場合）→ エンジン実行 → リトライ（必要時）→ Result 返却
    ↑                                    ↑
  With* 関数                コネクションプール / TLS / プロキシ / SSRF チェック
```

各段階の詳細：

- **オプション適用** — `With*` 関数がリクエストヘッダー、ボディ、タイムアウトなどを設定します。渡した順に実行され、いずれかのオプションがエラーを返すと（リクエストヘッダーが CRLF 検証を通らないなど）リクエストは即座に失敗します。
- **ミドルウェアチェーン** — `Config.Middleware.Middlewares` を設定した場合に有効化。リクエストは登録順にミドルウェアを通り、終端 Handler が（変更され得る）リクエストをエンジンに渡します。ミドルウェア未設定ならエンジンに直結し、余計なオーバーヘッドはゼロです。
- **エンジン実行** — URL/リクエストヘッダー検証（デフォルト有効）→ SSRF ダイヤル検証（デフォルトでプライベート IP をブロック）→ DNS 解決（任意の DoH）→ コネクションプールから接続を取得（不足時は新規作成、`MaxConnsPerHost` が上限）→ TLS ハンドシェイク（バージョンポリシー、任意の証明書ピンニング）→ リクエスト送信 → レスポンス読み取り（レスポンスボディサイズと解凍上限のチェック）。
- **リトライ** — リトライ可能条件：タイムアウト、トランスポートエラー、大半の一時的なネットワークエラー、およびステータスコード 408/429/500/502/503/504。バックオフは `Delay × BackoffFactor^n` で計算しジッターを加算、単回の待機は `MaxRetryDelay` を超えません。レスポンスに `Retry-After` ヘッダーがある場合はそれを優先します（上限 60s）。全体の所要時間は `Timeouts.Request` または `WithTimeout` に制約されます——**タイムアウト予算はリトライ間で共有**され、毎ラウンドでリセットされません。
- **Result** — レスポンスデータ、リクエストメタ情報、リトライ統計を含みます。エンジン内部のオブジェクトはプール化されていますが呼び出し側には透過で、`Result` は GC が自動回収するため手動解放は不要です。

リトライを使い果たした場合の結末は 2 つあります：

- **ネットワークエラーで使い切った場合** → `error` を返します（`ClientError.Attempts` に試行回数を記録）；
- **リトライ可能なステータスコード（503 など）で使い切った場合** → **最後のレスポンス**を返します（`result.StatusCode() == 503`、`Meta.Attempts` に合計回数を記録）。呼び出し側はステータスコードに応じて自分で処理します。

## ミドルウェアモデル

ミドルウェアは `func(Handler) Handler` 形式の関数（`MiddlewareFunc`）で、`Handler` は実際にリクエストを処理する関数シグネチャです：

```go
type Handler func(ctx context.Context, req RequestMutator) (ResponseMutator, error)
type MiddlewareFunc func(Handler) Handler
```

ミドルウェアは `Config.Middleware.Middlewares` に登録し、`Chain(middlewares...)` でオニオンモデルに組み合わせます：**登録順にラップ**——最初のミドルウェアが最外層にあり、リクエスト段階は順方向、レスポンス段階は逆順に実行されます。

カスタムミドルウェアのスケルトン：

```go
func TimingMiddleware(report func(d time.Duration)) httpc.MiddlewareFunc {
    return func(next httpc.Handler) httpc.Handler {
        return func(ctx context.Context, req httpc.RequestMutator) (httpc.ResponseMutator, error) {
            start := time.Now()
            resp, err := next(ctx, req)        // 内層を呼び出し（次のミドルウェアまたはエンジン）
            report(time.Since(start))          // レスポンス段階のロジック（逆順に実行）
            return resp, err
        }
    }
}
```

内蔵ミドルウェアの一覧：

| ミドルウェア | 役割 | nil 設定時の動作 |
|--------|------|------------------|
| `LoggingMiddleware` | リクエスト/レスポンスの概要を出力（URL は自動マスク） | ログ無効（no-op） |
| `RecoveryMiddleware` | チェーン内の panic を捕捉して error に変換 | — |
| `RequestIDMiddleware` | `X-Request-ID` を注入（crypto/rand で生成） | デフォルトのヘッダー名と安全なジェネレーター |
| `TimeoutMiddleware` | ミドルウェア層のタイムアウト（クライアント内蔵のタイムアウトより先に効く） | タイムアウト無効（パススルー） |
| `MetricsMiddleware` | リクエストごとのコールバック（メソッド/URL/ステータス/所要時間/エラー） | メトリクス無効（no-op） |
| `AuditMiddleware` | コンプライアンス監査イベント（text/json 形式、機密ヘッダーはマスク） | デフォルトの text 設定 |
| `HeaderMiddleware` | 各リクエストに静的ヘッダーを付与（作成時に CRLF 検証） | ヘッダーなし（パススルー） |

:::warning 注意
`TimeoutMiddleware` は `Download` と `WithStreamBody(true)` のリクエストには適用できません——handler が返った時点（レスポンスヘッダー受信後）で即座にコンテキストをキャンセルするため、レスポンスボディ読み取り段階で "context canceled" が発生します。このようなシナリオでは代わりに `WithTimeout` を使用してください。
:::

## セッションとドメインクライアント

同一ドメインへの連続リクエスト（ログイン状態、共通ヘッダー、Cookie の引き回し）には、URL の手動結合と都度の Cookie 送信の代わりに `DomainClient` を使います：

```go
dc, err := httpc.NewDomainDefault("https://api.example.com")
if err != nil {
    log.Fatal(err)
}
defer dc.Close()

dc.SetHeader("Authorization", "Bearer "+token) // セッションヘッダー：以降のリクエストに自動付与

_, _ = dc.Post("/login", httpc.WithJSON(creds)) // レスポンスの Set-Cookie は自動的にセッションへ
_, _ = dc.Get("/me")                            // セッション Cookie を自動的に付与
```

2 つの構成要素の分担：

- **`DomainClient`** — ベース URL にバインドします。相対パスを自動結合し（`/users` → `https://api.example.com/users`）、完全な `http(s)://` URL が渡された場合はそれをそのまま使用。パストラバーサル防止を内蔵しています（結合結果がベースパスの範囲を逸脱するとエラーを返します）。作成時に Cookie jar を自動有効化します。
- **`SessionManager`** — スレッドセーフなセッション状態ストア（Cookie + リクエストヘッダー）。`DomainClient` がこれを内包し、毎リクエスト前にセッション状態をリクエストオプションへ注入、レスポンス後に `Set-Cookie` を書き戻します。`DomainClient` から切り離して単独でも使用できます（`NewSessionManagerDefault()`）。

:::warning オプションは 2 回実行される
`DomainClient` のリクエストオプションは内部で**2 回**適用されます——セッション状態のキャプチャ（Cookie/リクエストヘッダー）1 回と、実際のリクエスト実行 1 回です。副作用のあるロジック（カウンター、一回限りの nonce など）をオプションに入れないでください。
:::

詳しくは [ドメインクライアントとセッション](../guides/domain-session) をご覧ください。

## セキュアなデフォルト

HTTPC はデフォルトでセキュア（secure by default）であり、追加設定なしで以下を備えます：

- **TLS 1.2+** 強制暗号化
- **SSRF 防護** — プライベート/予約 IP アドレス（`127.0.0.1`、`10.x`、`192.168.x` など）への接続をブロック
- **CRLF インジェクション防止** — リクエストヘッダーと URL を自動検証
- **レスポンスボディサイズ制限** — デフォルト 10MB、メモリ枯渇を防止
- **解凍爆弾への防御線** — 解凍後のレスポンスボディはデフォルトで 100MB 上限
- **厳格な Content-Length 検証** — デフォルトで有効。レスポンスボディの長さが宣言と不一致ならエラー

内部サービス（VPN、イントラネット）への接続が必要な場合は、`Security.AllowPrivateIPs = true` を設定するか、`SSRFExemptCIDRs` で精密に免除してください。詳しくは [セキュリティ概要](../security/) をご覧ください。

## エラーモデル

HTTPC は**ネットワーク層エラー**と **HTTP ステータスコード**を区別します：

- **ネットワーク層エラー**（接続失敗、タイムアウト、TLS エラーなど）→ `error` として返却。`errors.As` で `ClientError` を抽出し、分類とリトライ可否を取得できます
- **HTTP ステータスコード**（4xx、5xx）→ `error` としては返却**されません**。`result.IsSuccess()` などのメソッドで確認が必要です

```go
result, err := client.Get(url)
if err != nil {
    // ネットワーク層エラー — リクエストは正常に完了しなかった
    var clientErr *httpc.ClientError
    if errors.As(err, &clientErr) {
        log.Printf("エラータイプ: %s, リトライ可能: %v", clientErr.Code(), clientErr.IsRetryable())
    }
    return err
}
// リクエスト完了 — HTTP ステータスコードを確認
if !result.IsSuccess() {
    log.Printf("HTTP エラー: %d", result.StatusCode())
}
```

`ClientError` が保持するコンテキスト：

| メンバー | 説明 |
|------|------|
| `Type` | エラー分類（`ErrorTypeTimeout`、`ErrorTypeNetwork` など 12 種の列挙） |
| `Code()` | ショートコード文字列：`TIMEOUT`、`NETWORK_ERROR`、`TLS_ERROR`、`DNS_ERROR`、`CONTEXT_CANCELED`、`VALIDATION_ERROR`、`HTTP_ERROR` など |
| `IsRetryable()` | リトライする価値があるか（コンテキストキャンセル/検証/TLS/証明書系は常に false。タイムアウト/トランスポートは常に true。ネットワーク/DNS/5xx は個別の原因次第） |
| `Attempts` | 試行済み回数（初回を含む） |
| `StatusCode` | 関連する HTTP ステータスコード（該当する場合） |
| `Cause` | 低層のエラー。`errors.Is` / `errors.As` が透過できます |
| `URL` / `Method` | マスク済みのリクエスト URL とリクエストメソッド |

よく使うセンチネルエラーは `errors.Is` で判定できます：`ErrClientClosed`（クローズ済みクライアントの使用）、`ErrResponseBodyEmpty`（`Unmarshal` の空レスポンスボディ）、`ErrResponseBodyTooLarge`（解析ボディが 50MB 超過）など。完全なリストは [エラータイプ](../api-reference/types/errors) をご覧ください。

詳しくは [エラー処理](../guides/error-handling) をご覧ください。

## 並行処理とリソース管理

- **Client の並行安全** — 1 つのクライアントを任意の数の goroutine で共有できます。コネクションプールは内部でホスト単位に管理されるため、並行処理のためにクライアントを別途作る必要はありません。
- **Result は独立し解放不要** — 毎回のリクエストは新しい `*Result` を返します（3 つのメタ情報構造体も一括割り当て）。保持してもライフサイクルの負担はなく、GC に任せれば十分です。
- **明示的な Close** — `client.Close()` はコネクションプールとトランスポート層のリソースを解放します。クローズ後にリクエストを送ると `ErrClientClosed` を返します。
- **デフォルトクライアントの自己修復** — パッケージ関数が使うデフォルトクライアントは `SetDefaultClient()` で置き換え、`CloseDefaultClient()` でクローズできます。クローズ後の次のパッケージ関数呼び出しで自動再構築されます。
- **panic の安全網** — `Request` 内部にはフォールバックの recover があります。実行経路上の予期しない panic はスタック付きの `error` に変換されて返り、呼び出し側を突き抜けません。
