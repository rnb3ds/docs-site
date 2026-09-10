---
title: "プロキシとプロキシプール - CyberGo HTTPC | 設定・ローテーション・サーキットブレーカー"
description: "HTTPC プロキシとプロキシプール完全ガイド：HTTP/HTTPS/SOCKS5 単一プロキシ、システムプロキシ自動検出と NO_PROXY バイパス規則、プロキシプールのラウンドロビンとランダム戦略、接続失敗サーキットブレーカー、ProxyRotateOnStatus ステータスコード IP 切り替えを解説。"
sidebar_label: "プロキシとプロキシプール"
sidebar_position: 11
---

# プロキシとプロキシプール

企業ネットワークの越境、収集タスクでの出口 IP のローテーション、ターゲットサイトの IP ブロックの回避——いずれにおいても、プロキシは HTTP クライアントの高頻度ニーズです。HTTPC は 4 つのプロキシモード——単一プロキシ、システムプロキシ検出、プロキシプールローテーション、ステータスコードトリガーのローテーション——を内蔵し、「固定出口」から「リクエストごとの IP 切り替え」までの全スペクトラムをカバーし、SSRF 防護、TLS 検証、リトライエンジンと協調動作します。プロキシ設定はすべて `ConnectionConfig` に集約されています。

## プロキシモードの概要

4 つのモードは優先度に従って自動的に適用され、複数を同時に構成した場合は最優先のもののみが有効になります：

| 優先度 | 設定 | 動作 | 典型的シナリオ |
|--------|------|------|----------|
| 1（最高） | `ProxyURL` | 常に指定されたプロキシを使用（単一プロキシモード） | 企業ネットワークの出口、ローカル VPN ポート |
| 2 | `ProxyPool` | プロキシプールでローテーション、サーキットブレーカーと回復を含む | 収集、負荷分散、IP ローテーション |
| 3 | `EnableSystemProxy` | システムのプロキシ設定を自動検出 | デスクトップアプリがユーザー設定に追従 |
| 4（最低） | なし | 直接接続 | デフォルト動作 |

:::tip
`ProxyURL` と `ProxyPool` を同時に設定した場合、`ProxyURL` が有効になります。プロキシプールを使うには、`ProxyURL` を空にしてください。
:::

## 単一プロキシ設定

`ProxyURL` は 1 つの固定プロキシを指定し、4 つのプロトコルをサポートします：

| プロトコル | 書き方 | 説明 |
|------|------|------|
| HTTP | `http://proxy:8080` | 最も一般的；HTTPS リクエストは CONNECT トンネル経由で転送 |
| HTTPS | `https://proxy:8443` | プロキシサーバー自体との通信も TLS を使用 |
| SOCKS5 | `socks5://proxy:1080` | ターゲットドメインをローカルで解決してからプロキシ経由で接続 |
| SOCKS5h | `socks5h://proxy:1080` | ドメイン解決をプロキシ側に委ね、ローカル DNS 汚染を回避 |

```go
package main

import (
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Connection.ProxyURL = "socks5://proxy.example.com:1080"

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://api.example.com/data")
    if err != nil {
        log.Fatal(err)
    }
    // 出力：ステータス: 200, プロキシ: socks5://proxy.example.com:1080
    log.Printf("ステータス: %d, プロキシ: %s", result.StatusCode(), result.Meta.ProxyURL)
}
```

### 認証とマスク

プロキシの認証情報は URL の userinfo 部分に直接書きます：

<!-- check-code: skip -->
```go
cfg := httpc.DefaultConfig()
cfg.Connection.ProxyURL = "http://user:password@proxy.example.com:8080"
```

:::tip 認証情報の自動マスク
`Config.String()` はプロキシ URL 内のユーザー名とパスワードを `***:***` に置き換えます；エラーメッセージとログ内の URL も同様に自動マスクされます（認証情報と機密クエリパラメータのマスキング）。認証情報がログに漏れることはありませんが、設定自体は引き続き適切に保管してください。
:::

## システムプロキシ検出と NO_PROXY

有効化すると OS のプロキシ設定を自動検出し、`ProxyURL` を手動指定する必要がありません：

<!-- check-code: skip -->
```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableSystemProxy = true
```

### プラットフォーム差異

| プラットフォーム | 検出ソース |
|------|----------|
| Windows | レジストリ Internet Settings（`ProxyEnable` / `ProxyServer`） |
| macOS | `networksetup` コマンドで優先ネットワークサービスの Web/Secure Web Proxy を読み取り |
| Linux | 環境変数 `HTTP_PROXY` / `HTTPS_PROXY` |

:::tip Meta.ProxyURL にシステムプロキシは含まれない
システムプロキシの選択は `Result.Meta.ProxyURL` に記録されません（このフィールドは明示的な `Connection.ProxyURL` または `ProxyPool` を設定した場合にのみ値を持ち、直接接続でもシステムプロキシでも空のままです）。リクエストごとに出口プロキシを確認する必要がある場合は、明示的な設定を使用してください。
:::

### 検出順序と詳細

1. **環境変数が優先**（全プラットフォーム）：先に `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`（大文字小文字ともに認識）を読み、値があればそのまま使用し、システム設定は参照しません。
2. **プラットフォーム検出でフォールバック**：環境変数がない場合はプラットフォーム設定を読み取ります。Linux デスクトップ（GNOME/KDE）のプロキシは通常、セッションが環境変数としてエクスポート済みのため、エンジンは gsettings/dconf を直接読み取りません。
3. **リクエストの分流**：HTTPS リクエストは `HTTPS_PROXY` を優先し、未設定の場合は `HTTP_PROXY` にフォールバック；HTTP リクエストは `HTTP_PROXY` のみを使用し、未設定の場合も `HTTPS_PROXY` にフォールバック——net/http の解析順序と一致します。
4. **CGI 環境では直接接続**：環境変数由来のプロキシは CGI 環境（`REQUEST_METHOD` が設定済み）では適用されず、net/http の動作と一致します。
5. **裸アドレスの自動補完**：`HTTP_PROXY=proxy:8080` のようなプロトコル接頭辞のない値は自動的に `http://` として扱われます。
6. **キャッシュ**：検出結果はクライアントのライフサイクル中キャッシュされ、環境変数の変化に追随してホット更新しません；変化を感知したい場合はクライアントを新規作成してください。

### NO_PROXY バイパス規則

`NO_PROXY` はプロキシを経由しないホストを指定し、セマンティクスは net/http の httpproxy パッケージと一致します：

| 規則 | 例 | マッチ範囲 |
|------|------|----------|
| すべてバイパス | `*` | すべてのホストが直接接続 |
| ドメインサフィックス | `example.com` または `.example.com` | そのドメインとそのすべてのサブドメイン |
| ワイルドカードサブドメイン | `*.example.com` | `.example.com` と等価 |
| IP リテラル | `10.0.0.5` | その IP に正確一致 |
| CIDR 範囲 | `10.0.0.0/8` | 範囲内のすべての IP |
| ホスト + ポート | `example.com:443` | ホストが一致しポートも正確に一致 |

複数の規則はカンマで区切ります；`localhost` は常に直接接続のため、`NO_PROXY` に書く必要はありません。

```bash
# Linux/macOS 設定例
export HTTPS_PROXY=http://proxy.corp.example.com:8080
export NO_PROXY=localhost,127.0.0.1,.internal.corp.com,10.0.0.0/8
```

```powershell
# Windows (PowerShell) 設定例
$env:HTTPS_PROXY = "http://proxy.corp.example.com:8080"
$env:NO_PROXY = "localhost,127.0.0.1,.internal.corp.com"
```

:::warning 動的 localhost プロキシの制限
システムプロキシモードでは、SSRF 免除リストはクライアント構築時に一度だけ検出されます。実行中にシステムプロキシが新しい内部/ループバックアドレス（`127.0.0.1` など）へ切り替わると、そのアドレスが SSRF 防護にブロックされる可能性があります。動的なシナリオでは `Connection.ProxyURL` を明示的に設定する（プロキシアドレスは常に SSRF 検証を免除）か、`SSRFExemptCIDRs` を構成してください。
:::

## プロキシプール

複数のプロキシ IP にリクエストを分散する必要がある場合（収集、負荷分散、IP ローテーション）、プロキシプールは自動ローテーション、パッシブサーキットブレーカー、ステータスコードによるプロキシ切り替えを提供します——外部コンポーネントは一切不要です。

### 基本的な使い方

```go
package main

import (
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Connection.ProxyPool = []string{
        "http://proxy1:8080",
        "http://proxy2:8080",
        "http://proxy3:8080",
    }
    cfg.Connection.ProxyPoolStrategy = httpc.ProxyStrategyRoundRobin // デフォルト値、省略可

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://api.example.com/data")
    if err != nil {
        log.Fatal(err)
    }
    // 出力：ステータス: 200, プロキシ: http://proxy1:8080（次のリクエストは自動的に proxy2 に）
    log.Printf("ステータス: %d, プロキシ: %s", result.StatusCode(), result.Meta.ProxyURL)
}
```

プール内のエントリは `http`、`https`、`socks5`、`socks5h` プロトコルをサポートし、混在できます。

### 設定フィールド

| フィールド | 型 | デフォルト | 説明 |
|------|------|------|------|
| `ProxyPool` | `[]string` | `nil` | プロキシ URL のリスト |
| `ProxyPoolStrategy` | `ProxyStrategy` | `ProxyStrategyRoundRobin` | 選択戦略 |
| `ProxyFailureThreshold` | `int` | `3`（0 でフォールバック） | 連続接続失敗のサーキットブレーク閾値 |
| `ProxyCooldown` | `time.Duration` | `30s`（0 でフォールバック） | サーキットブレークしたプロキシのクールダウン |
| `ProxyRotatePerRequest` | `bool` | `false` | 毎回の独立リクエストでプロキシを強制切り替え（アイドル接続の再利用を無効化） |
| `ProxyRotateOnStatus` | `[]int` | `nil` | プロキシ切り替えリトライをトリガーするステータスコード（各項目は 100–599 の範囲必須） |

### 選択戦略

| 戦略 | 定数 | 説明 |
|------|------|------|
| ラウンドロビン（デフォルト） | `ProxyStrategyRoundRobin` | 順番に循環選択し、選択のたびにカーソルを進める |
| ランダム | `ProxyStrategyRandom` | 正常なプロキシから均一にランダム選択 |

:::tip ラウンドロビン + リトライ = 自動 IP 切り替え
ラウンドロビン戦略は選択のたびにカーソルを進めるため、リトライで再度選択がトリガーされると自然に次のプロキシに落ち、追加設定は一切不要です。
:::

### パッシブサーキットブレーカー

プロキシプールはパッシブヘルスチェックを内蔵しています。**接続層の失敗**（dial/TLS）のみがサーキットブレークをトリガーし、HTTP ステータスコードはトリガーしません：

```text
プロキシ接続失敗
    ↓
失敗カウント +1
    ↓
連続失敗 ≥ ProxyFailureThreshold → サーキットブレーク（ローテーションから除外）
    ↓
ProxyCooldown 待機 → ハーフオープンプローブ（ローテーションに復帰）
    ↓
成功 → カウントリセット、サーキットクローズ
初回失敗 → 再度サーキットブレーク
```

<!-- check-code: skip -->
```go
cfg.Connection.ProxyFailureThreshold = 5        // より寛容に、一時的なジッターを許容
cfg.Connection.ProxyCooldown = 60 * time.Second // より長いクールダウン
```

すべてのプロキシがサーキットブレークされた場合、クールダウンが最も短い（回復に最も近い）プロキシがフォールバックとして返され、即座に失敗することはありません。

### ステータスコードローテーション

Cloudflare/WAF などの IP ブロックシナリオ向け——特定のステータスコードを返した際に自動的にプロキシを切り替えてリトライします：

```go
package main

import (
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Connection.ProxyPool = []string{
        "http://proxy1:8080",
        "http://proxy2:8080",
        "http://proxy3:8080",
    }
    cfg.Connection.ProxyRotateOnStatus = []int{403} // 403 受信時にプロキシを切り替えてリトライ
    cfg.Retry.MaxRetries = 3                        // リトライの有効化が必須

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://protected-site.example.com/data")
    if err != nil {
        log.Fatal(err)
    }
    // 出力：ステータス: 200, プロキシ: http://proxy2:8080, 試行: 2
    log.Printf("ステータス: %d, プロキシ: %s, 試行: %d",
        result.StatusCode(), result.Meta.ProxyURL, result.Meta.Attempts)
}
```

:::warning ステータスコードローテーション ≠ サーキットブレーキング
`ProxyRotateOnStatus` によってトリガーされたローテーションはプロキシをサーキットブレーク**しません**——IP ブロックはターゲット固有であることが多いです（サイト A でブロックされたプロキシがサイト B では正常に動作する場合があります）。サーキットブレーキングは接続層の失敗のみでトリガーされます。発動には `Retry.MaxRetries > 0` が必要です。

`ProxyRotateOnStatus` が設定され、プロキシプールに複数のプロキシがある場合、リトライ予算は自動的に `len(ProxyPool) - 1` まで引き上げられ（`MaxRetries` の上限 10 で制限）、すべてのプロキシが試行される機会を保証します。
:::

### リクエストごとのローテーション

`ProxyRotatePerRequest` が解決するのは、**接続再利用**によってプロキシトンネルが固定化される問題です：HTTP コネクションプールは確立済みの TCP 接続を再利用し、そのプロキシトンネルも含まれます。つまり同一ホストへの連続リクエストは、`ProxyPoolStrategy` がセレクタのカーソルをローテーションしていても、前回のリクエストのプロキシを再利用してしまいます。

有効化すると、毎回のリクエスト開始時にすべてのアイドル接続をクローズし、Transport にプロキシプールを再評価させます——代償は接続再利用なし（毎回のリクエストで新規接続 + プロキシトンネル）ですが、リクエストごとのローテーションを保証します：

```go
package main

import (
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Connection.ProxyPool = []string{
        "http://proxy1:8080",
        "http://proxy2:8080",
        "http://proxy3:8080",
    }
    cfg.Connection.ProxyRotatePerRequest = true // 毎回のリクエストでプロキシを切り替え

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    for i := 0; i < 3; i++ {
        result, err := client.Get("https://api.example.com/data")
        if err != nil {
            log.Fatal(err)
        }
        // 出力（順に）：http://proxy1:8080 / http://proxy2:8080 / http://proxy3:8080
        log.Printf("%d 回目のリクエスト経由: %s", i+1, result.Meta.ProxyURL)
    }
}
```

:::tip 適用シナリオ
同一ホストへの収集に適しています——毎回のリクエストの送信元 IP が異なり、ターゲットサイトの IP ブロックのリスクを低減します。異なるホストへのリクエストの場合、接続再利用は同一プロキシに束縛されないため、通常は有効化の必要はありません。
:::

`ProxyRotateOnStatus` と同様に、`ProxyRotatePerRequest` もプロキシプールに複数のプロキシがある場合、リトライ予算を自動的に `len(ProxyPool) - 1` まで引き上げ（上限 10）、各プロキシが少なくとも 1 回は試行されることを保証します。

### 決定論的ローテーション

ステータスコードローテーションのリトライは通常のリトライと異なります：エンジンは各リクエストに**基準プロキシインデックス**を予約し、N 回目のリトライは固定で「基準 + N」に対応するプロキシを使用するため、3 つの保証が得られます：

- **リトライでは必ずプロキシが切り替わる**：同一リクエスト内で、N 回目のリトライと N-1 回目は必ず異なるプロキシに配置されます；
- **リダイレクトチェーンが脱線しない**：同一試行内の複数回のジャンプは同じインデックスを共有し、リダイレクト追従でプロキシ選択を余分に消費してもずれが生じません；
- **リクエストをまたいだ継続的ローテーション**：異なるリクエストの基準インデックスは増加し、全体としてラウンドロビン/ランダム分布を維持します。

さらに、プロキシ自体の接続失敗（dial/TLS 失敗）はローテーション活性化時に**常にリトライ可能**です——通常の分類でリトライ不可と判定されていても（恒久的なアドレスエラーなど）、次回は別のプロキシで再試行され、パッシブサーキットブレーカーと合わせて不良プロキシを自然に淘汰します。リトライ側の詳細は[リトライとフォールトトレランス](./retry-fault-tolerance)を参照してください。

## このリクエストで使用されたプロキシの照会

プロキシプールのシナリオでは「このリクエストがどの出口を使ったか」を監査したいことがよくあります。2 つのツールを組み合わせます：

- **`Result.Meta.ProxyURL`**：最終レスポンスを生成した試行が使用したプロキシを報告します；直接接続時は空文字列で、システムプロキシ（`EnableSystemProxy`）も同様に記録されません（空のままです）。ローテーションのシナリオではリトライごとに異なるプロキシが使われる可能性があり、このフィールドは**最後の**試行に対応します。
- **`WithOnResponse` コールバック**：毎回の試行（プロキシを切り替えたリトライを含む）でトリガーされ、試行ごとのステータスコードと試行回数を観察できます。

```go
package main

import (
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    cfg := httpc.DefaultConfig()
    cfg.Connection.ProxyPool = []string{
        "http://proxy1:8080",
        "http://proxy2:8080",
        "http://proxy3:8080",
    }
    cfg.Connection.ProxyRotateOnStatus = []int{403}

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()

    result, err := client.Get("https://protected-site.example.com/data",
        httpc.WithOnResponse(func(resp httpc.ResponseMutator) error {
            log.Printf("第 %d 回目の試行で %d を受信", resp.Attempts(), resp.StatusCode())
            return nil
        }),
    )
    if err != nil {
        log.Fatal(err)
    }

    // 出力：最終プロキシ: http://proxy2:8080, 総試行: 2
    log.Printf("最終プロキシ: %s, 総試行: %d", result.Meta.ProxyURL, result.Meta.Attempts)
}
```

:::tip コールバックは試行ごと、ミドルウェアはリクエストごとに実行
`WithOnResponse` はエンジン内部でトリガーされ、毎回の試行（リトライを含む）で実行されます；ミドルウェアチェーンはリトライ周期全体をラップするため、1 つの論理リクエストにつき 1 回しか実行されません。試行ごとの観測にはコールバックを、リクエスト単位の監査には[ミドルウェア](./middleware-chain)を使います。
:::

## プロキシとリトライの相互作用

プロキシローテーションはリトライエンジンと深く連動しており、2 つのルールを覚えておく価値があります。

**1. リトライ予算の自動引き上げ。** `ProxyRotateOnStatus` または `ProxyRotatePerRequest` を設定し、プロキシプールが 1 より多い場合：

```text
実効 MaxRetries = max(構成した MaxRetries, len(ProxyPool) - 1)（上限 10）
```

例えば 5 つのプロキシで `MaxRetries = 3` を構成した場合：予算は 4（= 5 - 1）に引き上げられ、最初のリクエストは proxy1 を使い、403 受信後に proxy2…proxy5 と順に切り替わり、各プロキシが 1 回ずつ試行されます。

**2. プロキシ接続失敗の強制リトライ。** ローテーション活性化時、プロキシ自体の接続失敗（dial 失敗、TLS 失敗）は通常のリトライ可能分類をバイパスし、次のリトライに直接入り次のプロキシへ切り替わります——恒久的に失効したプロキシ（ポート間違い、ホスト到達不可）を事前に人手で除外する必要はなく、強制リトライ + 連続失敗サーキットブレークが自然に淘汰します。

リトライ条件、バックオフの数式、リトライ間で共有される総タイムアウト予算の詳細は[リトライとフォールトトレランス](./retry-fault-tolerance)を参照してください。

## プロキシシナリオのセキュリティ上の注意

プロキシ関連機能は以下のセキュリティ詳細を自動的に処理するため、手動構成は不要です：

- **SSRF 免除**：プロキシホストアドレス（`ProxyURL` と `ProxyPool` の全エントリ）は自動的に SSRF 免除リストに追加され、プライベート IP チェックでブロックされません——ローカルプロキシ（`127.0.0.1:7890` など）も正常に動作します。
- **重複排除**：プロキシプール内の同一 `host:port` のエントリは自動的にマージされ、ローテーションの偏りと重複カウントを防ぎます。
- **URL 検証**：すべてのプロキシ URL はセキュリティ検証を通ります（プロトコルホワイトリスト http/https/socks5/socks5h、host の非空、インジェクション防護）。不正な値は `New()` の時点でエラーを返し、黙って無視されることはありません。

TLS との関係：HTTPS リクエストが HTTP プロキシの CONNECT トンネルを経由しても**エンドツーエンドの TLS** です——証明書検証、最低 TLS バージョン、証明書ピンニングはターゲットサイトに対して通常どおり有効で、プロキシは暗号文を転送できるだけです。ローカル DNS 汚染が心配な場合は `socks5h` を優先してください（ドメイン解決をプロキシ側に委譲）；DoH 有効時、ビジネスドメインは暗号化解決を経ますが、プロキシアドレス自体は DoH の対象外です（プロキシは開発者が明示的に構成するため、プロキシホストへ直接ダイヤルします）。SSRF 防護の全体像は [SSRF 防護](../security/ssrf)を参照してください。

## よくある問題

| 問題 | 原因 | 解決策 |
|------|------|----------|
| プロキシが効かない | `ProxyURL` と `ProxyPool` を同時設定、`ProxyURL` が優先 | `ProxyURL` を空にし、`ProxyPool` のみ使用 |
| 同一ホストへの連続リクエストで出口 IP が変わらない | 接続再利用が前回のプロキシトンネルに束縛 | `ProxyRotatePerRequest` を有効化 |
| プロキシが頻繁にサーキットブレーク | `ProxyFailureThreshold` が低すぎる | 閾値または `ProxyCooldown` を増加 |
| ステータスコードローテーションが効かない | `Retry.MaxRetries = 0`、またはプールにプロキシが 1 つしかない | `MaxRetries > 0` を設定；プールに最低 2 つのプロキシ |
| 全プロキシがサーキットブレークするとどうなる | プール全体が連続失敗 | エンジンは回復に最も近いプロキシをフォールバックとして返し、即座に失敗しません；プロキシの可用性と閾値を確認 |
| システムプロキシが検出されない | 環境変数がなく、プラットフォーム設定も有効化されていない | `HTTP_PROXY`/`HTTPS_PROXY` またはシステムプロキシのスイッチを確認 |
| localhost プロキシが SSRF にブロック | システムプロキシの免除リストは構築時に一度だけ検出 | `Connection.ProxyURL` を明示的に設定（常に免除）または `SSRFExemptCIDRs` を構成 |
| 403 受信でプロキシを切り替えた後、そのプロキシはサーキットブレークされたのか | ステータスコードがサーキットブレークをトリガーすると誤解している | されません——ステータスコードローテーションはプロキシをサーキットブレークせず、接続層の失敗のみがトリガー |
| `Meta.ProxyURL` が常に空 | システムプロキシのみが有効——`EnableSystemProxy` はこのフィールドに記録されない | 出口を確認したい場合は明示的な `ProxyURL` または `ProxyPool` を使用 |

完全なフィールド説明は [設定 API — プロキシプール](../api-reference/client-config/config#プロキシプール)を参照してください。

## ベストプラクティス

| シナリオ | 推奨構成 |
|------|----------|
| 企業の固定出口 | `ProxyURL`（http/https/socks5 を必要に応じて） |
| ユーザーのシステム設定に追従 | `EnableSystemProxy` + `NO_PROXY` で内部セグメントを許可 |
| 複数プロキシの負荷分散 | `ProxyPool` + デフォルトのラウンドロビン戦略 |
| 同一ホストへの収集 | `ProxyPool` + `ProxyRotatePerRequest` |
| CF/WAF の IP ブロック | `ProxyPool` + `ProxyRotateOnStatus: []int{403}` |
| プロキシの品質にばらつき | `ProxyFailureThreshold`（ジッター許容）と `ProxyCooldown` を増加 |
| 出口 IP の監査が必要 | `Result.Meta.ProxyURL` を読み取り、`WithOnResponse` で試行ごとに観察 |
| プロキシ認証情報の管理 | URL の userinfo に書く、ログは自動マスク；設定ファイルは別途保管 |

:::warning ローテーションのパフォーマンスコスト
`ProxyRotatePerRequest` とステータスコードローテーションのリトライパスはいずれもアイドル接続をクローズし、接続再利用を犠牲にして出口のローテーションを実現します。性能敏感でローテーション不要のシナリオではデフォルト（接続再利用）のままでよく、アイドル接続管理の詳細は[コネクションプールと DNS](./connection-pool)を参照してください。
:::

## 次のステップ

- [コネクションプールと DNS](./connection-pool) - 接続再利用とプロキシローテーションの相互作用、DoH 解決
- [リトライとフォールトトレランス](./retry-fault-tolerance) - リトライ条件、バックオフアルゴリズムとプロキシプールの連動
- [パフォーマンス最適化](./performance) - プロキシローテーションのパフォーマンスコストと全体チューニング
- [設定 API](../api-reference/client-config/config) - ConnectionConfig プロキシフィールドリファレンス
