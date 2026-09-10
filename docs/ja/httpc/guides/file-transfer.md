---
sidebar_label: "ファイルアップロードとダウンロード"
title: "ファイルアップロードとダウンロード - CyberGo HTTPC | アップロードとダウンロード"
description: "HTTPC ファイル転送ガイド：WithFile/WithFormData による複数ファイルアップロード、Download ストリーミングダウンロード、進捗コールバック、レジューム、SHA-256 チェックサム検証、ファイル衝突とクリーンアップのセマンティクス、UNC パスなど多層セキュリティ防護を解説。"
sidebar_position: 6
---

# ファイルアップロードとダウンロード

## ファイルアップロード

### シンプルなファイルアップロード

```go
package main

import (
    "log"
    "os"

    "github.com/cybergodev/httpc"
)

func main() {
    fileContent, err := os.ReadFile("document.pdf")
    if err != nil {
        log.Fatal(err)
    }

    result, err := httpc.Post("https://api.example.com/upload",
        httpc.WithFile("file", "document.pdf", fileContent),
    )
    if err != nil {
        log.Fatal(err)
    }

    log.Printf("アップロード完了：%d", result.StatusCode()) // 出力例：アップロード完了：200（実際のステータスコードはサーバーに依存）
}
```

### Multipart フォーム

ファイルと一緒にフォームフィールドを送信：

```go
form := &httpc.FormData{
    Fields: map[string]string{
        "title": "My Document",
        "type":  "pdf",
    },
    Files: map[string]*httpc.FileData{
        "file": {
            Filename: "report.pdf",
            Content:  fileContent,
        },
    },
}

result, err := httpc.Post("https://api.example.com/upload",
    httpc.WithFormData(form),
)
```

`FileData` には `ContentType` フィールドもあり、ファイルごとに MIME タイプを明示できます（未設定の場合、その part はデフォルトで `application/octet-stream` になります）：

```go
Files: map[string]*httpc.FileData{
    "file": {
        Filename:    "document.pdf",
        Content:     fileContent,
        ContentType: "application/pdf", // MIME タイプを明示
    },
},
```

### マルチファイルアップロード

```go
form := &httpc.FormData{
    Fields: map[string]string{
        "description": "一括アップロード",
    },
    Files: map[string]*httpc.FileData{
        "file1": {Filename: "doc1.pdf", Content: content1},
        "file2": {Filename: "doc2.pdf", Content: content2},
        "file3": {Filename: "image.png", Content: content3},
    },
}

result, err := httpc.Post(url, httpc.WithFormData(form))
```

### バイナリアップロード

```go
data, err := os.ReadFile("data.bin")
if err != nil {
    log.Fatal(err)
}
result, err := httpc.Post(url,
    httpc.WithBinary(data, "application/octet-stream"),
)
if err != nil {
    log.Fatal(err)
}
```

### ストリーミングアップロード（大容量ファイル）

`WithBody` は `io.Reader` を直接受け取るため、ファイル全体をメモリに読み込む必要はありません。Reader ボディの Content-Type は自動検出されないため、明示的に設定します：

```go
file, err := os.Open("large-video.mp4")
if err != nil {
    log.Fatal(err)
}
defer file.Close()

result, err := httpc.Post("https://api.example.com/upload",
    httpc.WithBody(file),
    httpc.WithHeader("Content-Type", "video/mp4"),
)
```

`io.Pipe` と組み合わせるとゼロコピーのストリーミングアップロードが実現できます——プロデューサー goroutine が生成しながら送信し、HTTP トランスポート層が並行して消費します：

```go
pr, pw := io.Pipe()
go func() {
    defer pw.Close()
    // pw にチャンクを書き込む。例：データベースやジェネレーターから逐次生成
    _, _ = pw.Write(chunk)
}()

result, err := httpc.Post("https://api.example.com/upload",
    httpc.WithBody(pr),
    httpc.WithHeader("Content-Type", "application/octet-stream"),
)
```

:::warning Reader ボディはサイズ検証を回避
`io.Reader` はデータ長を事前に知ることができないため、HTTPC はサイズ検証を**行いません**。信頼できないデータをアップロードする場合は `io.LimitReader` でラップするか、`Security.MaxRequestBodySize` でグローバル上限を設定してください：

```go
result, err := httpc.Post(url,
    httpc.WithBody(io.LimitReader(reader, 10<<20)), // 上限 10MB
    httpc.WithHeader("Content-Type", "application/octet-stream"),
)
```
:::

## ファイルダウンロード

`Download(ctx, url, cfg, options...)` は、パッケージレベル関数、`Client`、`DomainClient` を貫く唯一の正規ダウンロードエントリです。

ダウンロードは**常にストリーミングで行われます**：内部で自動的に `WithStreamBody(true)` が付加され、レスポンスボディはネットワークからディスクへ直送されます（`io.Copy`）。処理全体を通じてファイル全体がメモリにバッファリングされることはなく、チェックサムを有効にした場合もハッシュ計算は書き込み過程と同期して完了し、2 回目のディスク読み取りは発生しません。

### 基本ダウンロード

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/file.zip"

result, err := httpc.Download(context.Background(), "https://example.com/file.zip", cfg)
if err != nil {
    log.Fatal(err)
}

fmt.Printf("ダウンロード完了: %s\n", httpc.FormatBytes(result.BytesWritten))
fmt.Printf("所要時間: %v\n", result.Duration)
```

### 進捗コールバック付き

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/file.zip"
cfg.Overwrite = true
cfg.ProgressCallback = func(downloaded, total int64, speed float64) {
    pct := float64(downloaded) / float64(total) * 100
    fmt.Printf("\rダウンロード中: %.1f%% (%s)", pct, httpc.FormatSpeed(speed))
}

result, err := httpc.Download(context.Background(), "https://example.com/file.zip", cfg)
if err != nil {
    log.Fatal(err)
}

fmt.Printf("\nダウンロード完了: %s, 平均速度 %s\n",
    httpc.FormatBytes(result.BytesWritten),
    httpc.FormatSpeed(result.AverageSpeed),
)
```

:::tip 進捗コールバックの発火ルール
コールバックの引数は `(ダウンロード済みバイト数, 総バイト数, 現在の速度)` で、発火のタイミングは実装により保証されます：

- **最短間隔 200ms**：高速ネットワークで高頻度コールバックによるディスク書き込みの低下が起きず、低速ネットワークでも安定して更新されます。
- **終了時に最終コールバックを 1 回補完**：このとき `downloaded` は総バイト数、`speed` は平均速度であり、CLI の終了処理（改行など）に便利です。
- **`total` の出所**：サーバーが返す `Content-Length`。レジューム時、サーバーは Range リクエストに対して残りバイト数のみを報告するため、HTTPC が既存ファイルのオフセットを自動的に加算して完全なサイズを得ます。
- **`total` が 0 や負になる可能性**：サーバーが Content-Length を返さない（chunked 転送）場合、総量は事前に分かりません。コールバック内では先に `total > 0` を判定してからパーセントを計算してください。
:::

### 認証とカスタムヘッダー付き

`Download` の可変引数は通常の `RequestOption` なので、認証ヘッダー、クエリパラメータ、単発タイムアウトをそのまま追加できます：

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/report.pdf"
cfg.Overwrite = true

result, err := client.Download(context.Background(),
    "https://api.example.com/files/report.pdf",
    cfg,
    httpc.WithBearerToken("my-token"),                  // 認証
    httpc.WithHeader("Accept", "application/pdf"),      // カスタムヘッダー
    httpc.WithTimeout(5*time.Minute),                   // このダウンロードのタイムアウトバジェット
)
```

### レジューム

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/large-file.zip"
cfg.ResumeDownload = true

result, err := httpc.Download(context.Background(), url, cfg)
if err != nil {
    log.Fatal(err)
}

if result.Resumed {
    fmt.Printf("レジューム完了：ブレークポイントから再開\n")
}
```

:::tip
レジュームはサーバーが Range リクエストヘッダーをサポートしていることに依存します。サーバーがサポートしていない場合（206 ではなく 200 を返す）、ダウンロード済みの部分ファイルを保護するためにエラーが返されます。
:::

レジューム判定の完全なロジック：

| サーバーレスポンス | 挙動 |
|------------|------|
| `206 Partial Content` | `O_APPEND` で既存ファイルに追記書き込み、`result.Resumed` は `true` |
| `200 OK`（Range 非対応） | エラー `server does not support range requests` を返し、既存の部分ファイルは**切り詰めない** |
| `416 Range Not Satisfiable` | エラーを返す（ローカルファイルがすでに完全、またはサーバー側リソースが縮小された場合に多い） |
| その他の非 2xx ステータスコード | `unexpected status code` エラーを返し、エラーメッセージにレスポンスボディ先頭 200 バイトのプレビューを付加 |

:::warning Overwrite と ResumeDownload が同時に true の場合
`ResumeDownload` が優先されます——既存ファイルは置き換え再書き込みではなく**追記で拡張**されます。また、レジュームモードで書き込みの途中に失敗した場合、既存のバイトは保持されます（次回のレジューム用）。非レジュームモードで失敗した場合は、書きかけのファイルが削除され、破損した成果物が残るのを防ぎます。
:::

### チェックサム検証（SHA-256）

`Checksum` を設定すると、HTTPC はディスク書き込みと同時にストリームされるデータの SHA-256 を計算し、ダウンロード完了時に期待値と照合します：

- 照合は**大文字小文字を区別しません**（期待値は内部で一律小文字に変換）。
- **不一致 → ダウンロード済みファイルを削除してエラーを返す**ため、汚染された成果物は残りません。
- 成功時は `result.ActualChecksum` に実際に計算されたハッシュが入り、記録に利用できます。
- アルゴリズムの妥当性は**ターゲットファイルを開く前に**検証されます——設定ミス（未知の `ChecksumAlgorithm` など）がディスク上の既存ファイルを切り詰めることはありません。

```go
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"net/http/httptest"

	"github.com/cybergodev/httpc"
)

func main() {
	payload := []byte("hello httpc checksum")

	// ローカルのモックサーバーが固定内容を返す。本番では期待値をリリースマニフェストなどの信頼できる経路から取得すること
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(payload)
	}))
	defer server.Close()

	sum := sha256.Sum256(payload)
	expected := hex.EncodeToString(sum[:])

	cfg := httpc.DefaultConfig()
	cfg.Security.AllowPrivateIPs = true // 127.0.0.1 のローカルサーバーへの接続を許可
	client, err := httpc.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer client.Close()

	dlCfg := httpc.DefaultDownloadConfig()
	dlCfg.FilePath = "checksum-demo.txt"
	dlCfg.Overwrite = true
	dlCfg.Checksum = expected // 期待する SHA-256（hex エンコード）
	dlCfg.ChecksumAlgorithm = httpc.ChecksumSHA256

	result, err := client.Download(context.Background(), server.URL, dlCfg)
	if err != nil {
		log.Fatal(err) // 検証失敗：ファイルは削除済み、エラーメッセージに期待値と実際値を含む
	}
	fmt.Printf("検証通過：%s\n", result.ActualChecksum) // 出力：検証通過：2f2b7c...（payload の SHA-256）
}
```

### コンテキスト制御付き

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
defer cancel()

cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/file.zip"

result, err := httpc.Download(ctx, url, cfg)
if err != nil {
    if errors.Is(err, context.DeadlineExceeded) {
        log.Println("ダウンロードタイムアウト")
    }
    log.Fatal(err)
}
```

### ファイル衝突とクリーンアップのセマンティクス

ダウンロードのターゲットファイル扱いのルール一覧（`ErrFileExists`、`ErrEmptyFilePath` の 2 つのセンチネルエラーは `errors.Is` で判定）：

| シナリオ | 挙動 |
|------|------|
| ターゲットファイルが既存で、`Overwrite`/`ResumeDownload` がいずれも false | `ErrFileExists` を返し、ファイルは変更しない |
| ターゲットパスがディレクトリ | エラーを返す |
| `Overwrite = true`（非レジューム） | `O_TRUNC` で上書き |
| `ResumeDownload = true` かつサーバーが Range をサポート | `O_APPEND` で追記 |
| 書き込み/フラッシュ（sync/close）に失敗 | 非レジューム：書きかけファイルを削除。レジューム：既存バイトを保持 |
| チェックサム不一致 | ダウンロード済みファイルを削除 |
| 期待したアルゴリズムが未サポート（SHA-256 のみ） | ファイルを開く**前に**エラーを返し、既存ファイルは切り詰めない |
| ターゲットディレクトリが存在しない | 自動的に再帰作成（ディレクトリ権限 0755）、ファイル権限 0644 |
| パスが空 | `ErrEmptyFilePath` を返す |

エラーステータスコード（200/206 以外）の場合、エラーメッセージにレスポンスボディ先頭 200 バイトのプレビューが付加され、調査に役立ちます。また、接続をできるだけコネクションプールへ戻して再利用できるよう、最大 1MiB までレスポンスボディをドレインします。

### Download と SaveToFile の使い分け

`Result.SaveToFile(path)` は**すでにメモリにある**レスポンスボディをディスクに書き込みます。`Download` は最初から最後までストリーミングでディスクに書き込みます：

| 方式 | 適用シナリオ | 説明 |
|------|----------|------|
| `result.SaveToFile(path)` | 小〜中規模のレスポンスボディ（既にメモリにある） | パスは Download と同じセキュリティ検証を通過。空のレスポンスボディは `ErrResponseBodyEmpty` を返す |
| `client.Download(ctx, url, cfg)` | 大容量ファイル | ストリーミング書き込み、進捗/レジューム/チェックサム対応、メモリ使用量はファイルサイズに依存しない |

```go
// レスポンスボディが既にメモリにある：そのままディスクへ
result, err := client.Get("https://example.com/small.json")
if err != nil {
    log.Fatal(err)
}
if err := result.SaveToFile("/tmp/small.json"); err != nil {
    log.Fatal(err)
}
```

### DownloadResult フィールド一覧

`Download` が返す `DownloadResult` には、一般的なバイト数や所要時間のほか、完全なリクエスト/レスポンスメタデータが含まれます：

| フィールド | 型 | 説明 |
|------|------|------|
| `FilePath` | `string` | 検証済みの絶対保存パス |
| `BytesWritten` | `int64` | 今回ディスクに書き込んだバイト数（レジューム時はレジューム前の既存オフセットを**含まない**） |
| `Duration` | `time.Duration` | ダウンロードの総所要時間 |
| `AverageSpeed` | `float64` | 平均速度（バイト/秒） |
| `StatusCode` | `int` | レスポンスのステータスコード（200 または 206） |
| `ContentLength` | `int64` | サーバーが報告した Content-Length（レジューム時は残りバイト数） |
| `Resumed` | `bool` | 今回がレジュームかどうか |
| `ResponseCookies` | `[]*http.Cookie` | レスポンスが返した Cookie（`DomainClient` はセッションに自動キャプチャ） |
| `ActualChecksum` | `string` | 実際に計算されたチェックサム（`Checksum` 設定時のみ非空） |
| `Proto` | `string` | プロトコルバージョン（例：`HTTP/2.0`） |
| `ResponseHeaders` | `http.Header` | レスポンスヘッダー |
| `RequestURL` / `RequestMethod` | `string` | 実際にリクエストした URL とメソッド |
| `RequestHeaders` | `http.Header` | 実際に送信したリクエストヘッダー |

## セキュリティ防護

ファイルダウンロードには多層のセキュリティ保護が内蔵されており、すべて**ターゲットファイルを開く前に**完了します：

| 保護層 | 説明 |
|--------|------|
| パス検証 | UNC パス（`\\server\share`、`//server`）、制御文字、パストラバーサルを阻止（`Clean` 後に `..` で始まり作業ディレクトリ外へ出る場合は拒否） |
| 長さ制限 | パスは最大 4096 文字。超過は即拒否 |
| システムパス保護 | システムディレクトリへの書き込みを禁止：Windows では `C:\Windows\`、`C:\Program Files\` および `%SystemRoot%` などの環境変数展開位置、Linux/macOS では `/etc/`、`/usr/`、`/bin/`、`/System/`、`/Library/` などをカバー |
| シンボリックリンク検出 | ターゲット自体がシンボリックリンク、または親ディレクトリのいずれかがシステムディレクトリへ解決される場合（TOCTOU 防護、最大 32 階層まで再帰チェック）は拒否 |
| ファイルサイズ制限 | `MaxResponseBodySize` の制約を受ける |

:::tip ディレクトリも検証される
親ディレクトリの自動作成（`MkdirAll`）はパス検証の**後**に行われるため、`FilePath` のどの階層のディレクトリもシステムパスやシンボリックリンクを経由して防護をバイパスすることはできません。`Result.SaveToFile` も同じ検証を再利用します。
:::

## ドメインクライアントでのダウンロード

ドメインクライアントのダウンロードでは、レスポンス Cookie が自動的にセッションへキャプチャされます：

```go
dc, err := httpc.NewDomainDefault("https://api.example.com")
if err != nil {
    log.Fatal(err)
}
defer dc.Close()

dc.SetHeader("Authorization", "Bearer "+token)

cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/report.pdf"

// ダウンロードしながらセッションを自動管理（path は baseURL に対して相対）
result, err := dc.Download(context.Background(), "/files/report.pdf", cfg)
if err != nil {
    log.Fatal(err)
}
```

:::warning ドメインクライアントの 2 つの注意点
- **リクエストオプションは 2 回実行されます**（セッション状態のキャプチャ用と実際のリクエスト用）。副作用のあるオプション（カウンター、ランダム nonce ジェネレーターなど）は渡さないでください。どうしても必要な場合は、下層の `Client` で直接ダウンロードしてください。
- **Download は「レスポンスオブジェクトをラップするカスタムミドルウェア」と互換性がありません**：ダウンロードパスは生のレスポンスストリームに直接アクセスする必要があり、カスタムミドルウェアが `ResponseMutator` をラップ型に置き換えている場合、`Download` は明確なエラーを返します。内蔵ミドルウェア（Recovery/Logging/Metrics など）はいずれもパススルーのため影響ありません。
:::

## 次のステップ

- [ファイルダウンロード API](../api-reference/client-config/download) - 完全なダウンロード API リファレンス
- [ドメインクライアントとセッション](./domain-session) - セッション管理
- [リクエストとレスポンス](./request-response) - 基本リクエストガイド
- [パフォーマンス最適化](./performance) - 大容量ファイルダウンロードのパフォーマンスプリセットとチューニング
- [テストガイド](./testing) - httptest でダウンロードロジックをテスト
