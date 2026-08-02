---
title: "コア概念 - CyberGo HTTPC | 2 層アーキテクチャと設定体系"
description: "HTTPC コア概念の詳細解説：2 層 API アーキテクチャ（パッケージレベル関数と Client インスタンス）、Config 構造体による設定と With* リクエストオプションの違い、リクエストライフサイクルと Result 自動管理。開発者がライブラリ全体を素早く把握できるよう支援します。"
sidebar_label: "コア概念"
sidebar_position: 2
---

# コア概念

以下の概念を理解すれば、HTTPC の全体像を素早く把握できます。

## 2 層 API アーキテクチャ

HTTPC は標準ライブラリ `net/http` における `http.Get` と `http.Client` の関係に対応する、2 つの等価なリクエスト方式を提供します：

**パッケージレベル関数** — 設定不要、内部で遅延初期化されるデフォルトクライアントを共有します。スクリプトや一回限りのリクエストに適しています：

```go
result, err := httpc.Get("https://api.example.com/data")
```

**Client インスタンス** — 設定、コネクションプール、ライフサイクルを完全に制御します。長期間実行するサービスに適しています：

```go
client, err := httpc.NewDefault()
defer func() { _ = client.Close() }()
result, err := client.Get("https://api.example.com/data")
```

両方式とも同じリクエストオプション（`WithHeader`、`WithJSON`…）を受け取り、同じ `*Result` 型を返します。パッケージレベル関数は Client インスタンスの薄いラッパーです。

:::tip ヒント
どちらを使うべきか？一回限りのリクエストや迅速なプロトタイピング → パッケージレベル関数。本番サービス、カスタム設定やコネクションプール管理が必要 → Client インスタンス。
:::

## 設定体系：Config と With\* オプション

HTTPC は設定を 2 つの独立した階層に分離し、混乱を回避します：

| 階層 | 手段 | スコープ | 代表フィールド |
|------|------|----------|----------------|
| **インスタンス設定** | `Config` 構造体 | クライアントの全ライフサイクル | タイムアウト、リトライポリシー、コネクションプール、TLS |
| **リクエストオプション** | `WithXxx()` 関数 | 単一リクエスト | `WithHeader`、`WithJSON`、`WithTimeout` |

インスタンス設定は `Config` 構造体で `New()` に渡されます。`DefaultConfig()` から始めて、必要に応じてフィールドを修正します：

```go
cfg := httpc.DefaultConfig()
cfg.Timeouts.Request = 60 * time.Second
cfg.Retry.MaxRetries = 5
client, err := httpc.New(cfg)
```

リクエストオプションは呼び出しごとに渡され、インスタンスレベルのデフォルトを補完または上書きします：

```go
result, err := client.Get(url,
    httpc.WithHeader("Authorization", "Bearer "+token),
    httpc.WithTimeout(30*time.Second),
)
```

プリセット設定（`SecureConfig()`、`PerformanceConfig()` など）を出発点としても利用できます。[設定 API](../api-reference/client-config/config) を参照してください。

## リクエストライフサイクル

各リクエストは以下のフローを経由します：

```text
オプション適用 → ミドルウェアチェーン（存在する場合）→ エンジン実行 → リトライ（必要時）→ Result 返却
      ↑                                         ↑
   With* 関数                    コネクションプール / TLS / プロキシ / SSRF チェック
```

- **オプション適用** — `With*` 関数がヘッダー、ボディ、タイムアウトなどを設定
- **ミドルウェアチェーン** — カスタムロギング、メトリクス、監査ロジック（`Config.Middleware` で設定）
- **エンジン実行** — コネクションプール再利用、TLS ハンドシェイク、HTTP/2 ネゴシエーション、SSRF 検証
- **リトライ** — リトライ可能なエラー（タイムアウト、5xx、429 など）発生時に自動的に指数バックオフでリトライ
- **Result** — レスポンスデータ、リクエストメタ情報、リトライ統計を含む。GC が自動回収、手動解放不要

## セキュアなデフォルト

HTTPC はデフォルトでセキュア（secure by default）であり、追加設定なしで以下を提供します：

- **TLS 1.2+** 強制暗号化
- **SSRF 防護** — プライベート/予約 IP アドレス（`127.0.0.1`、`10.x`、`192.168.x` など）への接続をブロック
- **CRLF インジェクション防止** — リクエストヘッダーと URL を自動検証
- **レスポンスボディサイズ制限** — デフォルト 10MB、メモリ枯渇を防止

内部サービス（VPN、イントラネット）に接続するには、`Security.AllowPrivateIPs = true` を設定するか、`SSRFExemptCIDRs` で選択的許可リストを使用してください。[セキュリティ概要](../security/) を参照してください。

## エラーモデル

HTTPC は**ネットワーク層エラー**と **HTTP ステータスコード**を区別します：

- **ネットワーク層エラー**（接続失敗、タイムアウト、TLS エラーなど）→ `error` として返却。`errors.As` で `ClientError` を抽出し、分類とリトライ可否を確認可能
- **HTTP ステータスコード**（4xx、5xx）→ `error` としては返却**されない**。`result.IsSuccess()` などのメソッドで確認が必要

```go
result, err := client.Get(url)
if err != nil {
    // ネットワーク層エラー — リクエストが正常に完了しなかった
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

[エラー処理](../guides/error-handling) を参照してください。
