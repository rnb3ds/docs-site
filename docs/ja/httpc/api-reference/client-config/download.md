---
sidebar_label: "ファイルダウンロード"
title: "ファイルダウンロード - CyberGo HTTPC | Download と検証"
description: "HTTPC ファイルダウンロード API リファレンス：Download 統一ダウンロードエントリ関数、DownloadConfig 設定構造体、DownloadProgressCallback 進捗コールバック、DownloadResult 結果型、SHA-256 チェックサム検証と UNC パスブロック等の 6 層セキュリティ保護。"
sidebar_position: 4
---

# ファイルダウンロード

## パッケージレベルダウンロード関数

### Download

```go
func Download(ctx context.Context, url string, cfg *DownloadConfig, options ...RequestOption) (*DownloadResult, error)
```

デフォルトクライアントを使用してファイルをダウンロードします。`Download` はパッケージレベル関数、`Client` インターフェース、`DomainClient` を貫く**唯一の正規ダウンロードエントリ**であり、これまでのバリアント群を単一のシグネチャに置き換えます。`cfg` を nil にすることはできず、`cfg.FilePath` の設定が必須です（未設定の場合は `ErrEmptyFilePath` を返します）。

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/file.zip"
cfg.Overwrite = true
cfg.ResumeDownload = true

result, err := httpc.Download(context.Background(), url, cfg)
```

`Download` メソッドは `Client` インターフェースと `DomainClient` でシグネチャが同一で、3 つのエントリの動作が統一されています。

## DownloadConfig

```go
type DownloadConfig struct {
    FilePath          string
    ProgressCallback  DownloadProgressCallback
    Overwrite         bool
    ResumeDownload    bool
    Checksum          string
    ChecksumAlgorithm ChecksumAlgorithm
}

func DefaultDownloadConfig() *DownloadConfig
```

### フィールド詳細

| フィールド | タイプ | デフォルト値 | 説明 |
|------|------|--------|------|
| `FilePath` | `string` | — | ファイル保存パス（**必須**、空にできない） |
| `ProgressCallback` | `DownloadProgressCallback` | `nil` | 進捗コールバック関数、nil の場合は進捗報告を無効化 |
| `Overwrite` | `bool` | `false` | 既存ファイルを上書きするかどうか。false の時ファイルが既存なら `ErrFileExists` を返す |
| `ResumeDownload` | `bool` | `false` | レジュームを有効化するかどうか。true の時は既存の部分ファイルを再利用 |
| `Checksum` | `string` | `""` | 期待される 16 進エンコードチェックサム。設定するとダウンロード完了時に自動検証 |
| `ChecksumAlgorithm` | `ChecksumAlgorithm` | `"sha256"` | 検証アルゴリズム（現在 SHA-256 のみサポート） |

:::tip Overwrite と ResumeDownload の優先度
ファイルが既存で両方とも true の場合、`ResumeDownload` が優先されます——既存ファイルは**追記拡張**され置換されません。ファイルが存在しない場合は両者とも同じ動作（通常ダウンロード）です。
:::

### DefaultDownloadConfig

```go
func DefaultDownloadConfig() *DownloadConfig
```

デフォルトのダウンロード設定を返します：`Overwrite` と `ResumeDownload` はどちらも false、`ChecksumAlgorithm` は `ChecksumSHA256`。呼び出し側は使用前に `FilePath` を設定する必要があります。

## DownloadProgressCallback

```go
type DownloadProgressCallback func(downloaded, total int64, speed float64)
```

| パラメータ | タイプ | 説明 |
|------|------|------|
| `downloaded` | `int64` | ダウンロード済みバイト数（レジュームオフセットを含む） |
| `total` | `int64` | 総バイト数（`-1` は不明、Content-Length なし） |
| `speed` | `float64` | 現在の速度（バイト/秒） |

### 進捗コールバックメカニズム

進捗コールバックは `progressWriter` が `io.Writer` をラップすることで実現され、毎回の `Write` 時にスロットル間隔に達したかチェックします：

| 特性 | 説明 |
|------|------|
| スロットル間隔 | 200ms（`progressInterval`）——高速ネットワークでの頻繁なコールバックを回避 |
| レジュームオフセット調整 | `downloaded = offset + written`——レジューム時に今回の増分ではなく総ダウンロード量を報告 |
| 総量調整 | レジューム時 `total = contentLength + offset`——完全なファイルサイズを復元 |
| 最終コールバック | ダウンロード完了後に追加で 1 回コールバック、最終統計値を報告 |

```go
cfg.ProgressCallback = func(downloaded, total int64, speed float64) {
    if total > 0 {
        pct := float64(downloaded) / float64(total) * 100
        fmt.Printf("\r%.1f%% (%s/s)", pct, httpc.FormatSpeed(speed))
    } else {
        fmt.Printf("\r%s (%s/s)", httpc.FormatBytes(downloaded), httpc.FormatSpeed(speed))
    }
}
```

## DownloadResult

```go
type DownloadResult struct {
    FilePath        string
    BytesWritten    int64
    Duration        time.Duration
    AverageSpeed    float64
    StatusCode      int
    ContentLength   int64
    Resumed         bool
    ResponseCookies []*http.Cookie
    ActualChecksum  string
    Proto           string
    ResponseHeaders http.Header
    RequestURL      string
    RequestMethod   string
    RequestHeaders  http.Header
}
```

### フィールド詳細

| フィールド | タイプ | 説明 |
|------|------|------|
| `FilePath` | `string` | ファイルが実際に保存された**絶対パス**（`prepareFilePath` で検証後のパス） |
| `BytesWritten` | `int64` | 今回の書き込みバイト数（レジューム時は追記量で、ファイル総サイズではない） |
| `Duration` | `time.Duration` | ダウンロード所要時間（書き込み開始からファイルクローズまで） |
| `AverageSpeed` | `float64` | 平均速度（バイト/秒、= BytesWritten / Duration） |
| `StatusCode` | `int` | HTTP ステータスコード（200 または 206） |
| `ContentLength` | `int64` | サーバーが報告した Content-Length（レジューム時は残り部分の長さ） |
| `Resumed` | `bool` | レジュームで完了したか（Range を要求し 206 を受信した場合） |
| `ResponseCookies` | `[]*http.Cookie` | レスポンス Cookie |
| `ActualChecksum` | `string` | 実際に計算されたチェックサム（`Checksum` 設定時のみ埋まる） |
| `Proto` | `string` | HTTP プロトコルバージョン（例：`"HTTP/1.1"`、`"HTTP/2.0"`） |
| `ResponseHeaders` | `http.Header` | レスポンスヘッダー |
| `RequestURL` | `string` | 実際のリクエスト URL |
| `RequestMethod` | `string` | リクエスト HTTP メソッド（`"GET"` 固定） |
| `RequestHeaders` | `http.Header` | 実際に送信されたリクエストヘッダー |

```go
fmt.Printf("ダウンロード完了: %s, 所要時間 %v, 平均速度 %s\n",
    httpc.FormatBytes(result.BytesWritten),
    result.Duration,
    httpc.FormatSpeed(result.AverageSpeed),
)
```

:::tip
[FormatBytes](../core/functions#formatbytes) と [FormatSpeed](../core/functions#formatspeed) を使用すると、人間が読めるバイト数と速度の文字列が得られ、手動での `1024` 倍換算を省けます。
:::

## チェックサム検証

### ChecksumAlgorithm

```go
type ChecksumAlgorithm string
```

ダウンロードファイルの完全性検証アルゴリズム。

| 定数 | 値 | 説明 |
|------|-----|------|
| `ChecksumSHA256` | `"sha256"` | SHA-256 ハッシュアルゴリズム |

### SHA-256 ストリーミング検証フロー

`Checksum` を設定すると、ダウンロード中に**書き込みながらハッシュを計算**し、ダウンロード完了後の全ファイル再読み込みを回避します：

```text
検証フロー：

  ① hasher = sha256.New()
  ② writer = io.MultiWriter(file, hasher)
     ↓
     ネットワークデータストリーム → file（ディスクに書き込み）
                              → hasher（ハッシュ状態を更新）
     ↓
  ③ ダウンロード完了後：actualChecksum = hex(hasher.Sum(nil))
  ④ 比較：actualChecksum == strings.ToLower(cfg.Checksum)？
     ├─ マッチ → DownloadResult を返す（ActualChecksum を含む）
     └─ 不一致 → ファイルを削除 + 検証エラーを返す
```

| ステップ | 説明 |
|------|------|
| MultiWriter | `io.MultiWriter(file, hasher)` でデータをファイルとハッシャーに同時書き込み、追加メモリゼロ |
| アルゴリズム事前チェック | ターゲットファイルに触れる**前**にアルゴリズム名を検証——設定エラーで既存ファイルが切り詰められない |
| 失敗時のクリーンアップ | 検証失敗時にダウンロード済みファイルを**自動削除**（非レジュームモード）、破損ファイルの残留を回避 |
| 大文字小文字無関係 | 期待値は自動的に `ToLower`、実際値は小文字 hex、大文字小文字は比較に影響しない |

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/package.tar.gz"
cfg.Checksum = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
cfg.ChecksumAlgorithm = httpc.ChecksumSHA256

result, err := httpc.Download(context.Background(), url, cfg)
if err != nil {
    // チェックサム不一致時は自動的にエラーを返し、ダウンロード済みファイルを削除
    log.Fatal(err)
}
fmt.Println("チェックサム：", result.ActualChecksum)
```

## レジュームメカニズム

### ResumeDownload の動作フロー

```text
prepareResumeState(filePath, opts, options):

  ① prepareFilePath(filePath) → パスの安全性を検証 → validatedPath
  ② os.Stat(validatedPath)
     ├─ ファイルが存在しない → resumeOffset = 0、通常ダウンロード
     ├─ ディレクトリ → エラーを返す
     ├─ ファイル既存 + Overwrite=false + Resume=false → ErrFileExists
     ├─ ファイル既存 + Resume=true → resumeOffset = fileInfo.Size()
     │     → WithHeader("Range", "bytes={offset}-") を options に追加
     └─ ファイル既存 + Overwrite=true（非 Resume）→ resumeOffset = 0、上書きダウンロード
```

### サーバーレスポンスの処理

| サーバーの返信 | 処理 |
|-----------|------|
| `206 Partial Content` | レジューム成功：`O_APPEND` 追記モードで書き込み、`Resumed = true` |
| `200 OK`（Range 非対応） | **エラーを返す**：サーバーが Range リクエストを無視、レジュームは既存データを切り詰める。レスポンスボディを排空後にエラー報告 |
| `416 Range Not Satisfiable` | **エラーを返す**：要求したオフセットがファイルサイズを超過。レスポンスボディを排空後にエラー報告 |
| その他のステータスコード（4xx/5xx） | エラーを返す、レスポンスボディ先頭 200 文字のプレビューを付加 |

:::warning なぜ 200 でエラーになるのか
`ResumeDownload=true` だがサーバーが 206（ではなく 200）を返した場合、サーバーが Range リクエストをサポートしていないことを示します。このままダウンロードを続けると、既存の部分ファイルを先頭から上書きしてしまいます——**ユーザーのレジューム意図を暗黙的に失う**ことになります。HTTPC は切り詰めではなくエラーを返すことを選択し、ローカルの部分ファイルの破壊を保護します。強制上書きが必要な場合は `Overwrite=true` + `ResumeDownload=false` を設定してください。
:::

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/large-file.zip"
cfg.ResumeDownload = true

result, err := httpc.Download(context.Background(), url, cfg)
if err != nil {
    log.Fatal(err)
}
if result.Resumed {
    fmt.Printf("レジューム完了、今回の追記量 %s\n", httpc.FormatBytes(result.BytesWritten))
}
```

## ストリーミングダウンロードの仕組み

ファイルダウンロードはストリーミングモード（`WithStreamBody(true)`）を使用し、レスポンスボディ全体がメモリにバッファリングされるのを回避します：

```text
ストリーミングダウンロードのデータパス：

  サーバーレスポンス
    ↓
  engine.Response.RawBodyReader()  ← ネットワークリーダー（io.ReadCloser）
    ↓
  io.Copy(writer, bodyReader)      ← 直接ストリーミング書き込み、全量バッファリングゼロ
    ↓
  writer = progressWriter(MultiWriter(file, hasher))
    ↓
  ディスクファイル
```

| 特性 | 説明 |
|------|------|
| ゼロメモリバッファリング | データはネットワークから直接ディスクへ流れ、完全なメモリバッファを経過しない |
| ストリーミングハッシュ | チェックサム計算と書き込みが同期進行し、二次読み込み不要 |
| 自動解放 | レスポンスボディリーダーは `defer` でクローズ、エンジンレスポンスは `defer` でオブジェクトプールに返却 |

:::warning ミドルウェアの互換性
ダウンロードは `*engine.Response` の `RawBodyReader()` に直接アクセスする必要があります。ミドルウェアが `ResponseMutator` をカスタム型で**ラップ**している場合（エンジンレスポンスをその場で変更するのではなく）、ダウンロードはエラーを返します：`download is not compatible with middleware that wraps ResponseMutator`。すべての内蔵ミドルウェアはその場で変更するため、このエラーは発生しません。
:::

## ファイルパスのセキュリティ保護

`prepareFilePath` は多層のセキュリティ保護を実装し、悪意のあるパスがシステムの機密位置に書き込まれるのを防止します。各層はパスがファイルシステムに到達する前にインターセプトします：

### 保護階層の概要

| 階層 | 保護 | インターセプト内容 |
|------|------|----------|
| 1 | 長さチェック | 空パス / 4096 文字を超過 |
| 2 | UNC パスブロック | `\\server\share` または `//server/share` のネットワークパス |
| 3 | 制御文字フィルタ | ASCII < 0x20、0x7F（DEL）、0x00（NUL） |
| 4 | システムパス保護 | OS 保護ディレクトリへの書き込み（下表参照） |
| 5 | パストラバーサル検出 | `../` で作業ディレクトリを脱出 |
| 6 | symlink 防護 | ファイル自体 + 親ディレクトリのシンボリックリンクを再帰的にチェック |

### 第 2 層：UNC パスブロック

```text
ブロック形式：
  \\server\share\file     ← Windows UNC パス
  //server/share/file     ← POSIX ダブルスラッシュネットワークパス

理由：UNC パスはネットワークリソースにアクセス可能で、SSRF や SMB リレー攻撃に悪用される可能性
```

### 第 3 層：制御文字フィルタ

パス内の各バイトがチェックされます——ASCII 制御文字（0x00-0x1F）、DEL（0x7F）、NUL バイトが拒否されます。これによりターミナルエスケープシーケンスのインジェクションと CRLF パス混同攻撃を防止します。

### 第 4 層：システムパス保護

OS に応じて保護されたシステムディレクトリへの書き込みをブロックします：

| OS | 保護パス |
|----|-----------|
| **Windows** | `C:\Windows\`、`C:\System32\`、`C:\Program Files\`、`C:\ProgramData\`、`C:\Program Files (x86)\` + 環境変数展開：`${SystemRoot}`、`${windir}`、`${ProgramFiles}` など |
| **macOS** | `/system/`、`/library/`、`/applications/`、`/usr/`、`/bin/`、`/sbin/`、`/etc/`、`/var/` |
| **Linux** | `/etc/`、`/sys/`、`/proc/`、`/dev/`、`/boot/`、`/root/`、`/usr/bin/`、`/usr/sbin/`、`/bin/`、`/sbin/`、`/lib/`、`/run/` など |

パスマッチングはプレフィックスチェック（末尾セパレータ付き）を使用し、プレフィックス衝突を防止します（例：`C:\Windows` が `C:\WindowsEvil` を誤ってマッチしない）。Windows の環境変数パターンはチェック時に動的に展開され、非 C ドライブにインストールされたシステムディレクトリを捕捉します。

### 第 5 層：パストラバーサル検出

```text
作業ディレクトリ境界チェック：

  filePath = "../../etc/passwd"
  cleanPath = filepath.Clean → "../../etc/passwd"
  absPath = filepath.Abs → "/home/user/../../etc/passwd" → "/etc/passwd"

  チェック：absPath は作業ディレクトリ内か？
  結果：いいえ → "path traversal detected: path outside working directory"
```

クリーンアップ後のパス（`filepath.Clean`）が `..` で始まる場合にチェックがトリガーされます。**相対パス**のみが検出対象——絶対パスは作業ディレクトリ内に制限されません（ただしシステムパス保護の制約は受けます）。

### 第 6 層：symlink 防護

| チェック | 説明 |
|------|------|
| ファイル自体 | `os.Lstat` でターゲットファイルが symlink かチェック——攻撃者が機密ファイルを指す symlink を作成する可能性 |
| 親ディレクトリの再帰 | `checkParentDirSymlinks` がすべての親ディレクトリ（最大 32 階層）を再帰的にチェックし、TOCTOU 攻撃（ディレクトリがチェック後に symlink に置換）を防止 |
| 解析後のシステムパス | 親ディレクトリの symlink 解析後にシステムディレクトリを指す場合も拒否 |

```go
// 各階層の保護が以下の攻撃シナリオをブロック：
cfg.FilePath = "\\malicious-server\share\payload"  // UNC ブロック
cfg.FilePath = "/etc/passwd"                        // システムパス保護
cfg.FilePath = "../../../etc/shadow"                // パストラバーサル検出
cfg.FilePath = "/tmp/safe/../../../etc/passwd"      // Clean + トラバーサル + システムパス
```

## 完全例：本番レベルのダウンロード

以下の例は進捗コールバック、SHA-256 チェックサム、レジュームを備えた完全なダウンロードフローを示します。

```go
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/cybergodev/httpc"
)

func main() {
	cfg := httpc.DefaultDownloadConfig()
	cfg.FilePath = "/tmp/large-archive.zip"
	cfg.Overwrite = true
	cfg.ResumeDownload = true
	cfg.Checksum = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"

	lastUpdate := time.Now()
	cfg.ProgressCallback = func(downloaded, total int64, speed float64) {
		// スロットル制御：進捗コールバックは 200ms ごとにトリガー、ここでさらにフィルタ
		if time.Since(lastUpdate) < time.Second {
			return
		}
		lastUpdate = time.Now()

		if total > 0 {
			pct := float64(downloaded) / float64(total) * 100
			fmt.Printf("進捗: %s / %s (%.1f%%) 速度: %s/s\n",
				httpc.FormatBytes(downloaded),
				httpc.FormatBytes(total),
				pct,
				httpc.FormatSpeed(speed))
		} else {
			fmt.Printf("ダウンロード済み: %s  速度: %s/s\n",
				httpc.FormatBytes(downloaded),
				httpc.FormatSpeed(speed))
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	result, err := httpc.Download(ctx,
		"https://example.com/files/large-archive.zip", cfg)
	if err != nil {
		log.Fatalf("ダウンロード失敗: %v", err)
	}

	fmt.Println("ダウンロード完了")
	fmt.Printf("  ファイルパス: %s\n", result.FilePath)
	fmt.Printf("  書き込み量:   %s\n", httpc.FormatBytes(result.BytesWritten))
	fmt.Printf("  所要時間:     %v\n", result.Duration)
	fmt.Printf("  平均速度:     %s/s\n", httpc.FormatSpeed(result.AverageSpeed))
	fmt.Printf("  ステータスコード:   %d\n", result.StatusCode)
	fmt.Printf("  レジューム:   %v\n", result.Resumed)
	fmt.Printf("  チェックサム: %s\n", result.ActualChecksum)
	// 出力例：
	// 進捗: 5.2 MB / 52.4 MB (9.9%) 速度: 12.3 MB/s
	// 進捗: 26.1 MB / 52.4 MB (49.8%) 速度: 11.8 MB/s
	// 進捗: 52.4 MB / 52.4 MB (100.0%) 速度: 12.1 MB/s
	// ダウンロード完了
	//   ファイルパス: /tmp/large-archive.zip
	//   書き込み量:   52.4 MB
	//   所要時間:     4.331s
	//   平均速度:     12.1 MB/s
	//   ステータスコード:   200
	//   レジューム:   false
	//   チェックサム: abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
}
```

## 関連項目

- [ファイルアップロードとダウンロード](../../guides/file-transfer) — 使用ガイド
- [パッケージ関数](../core/functions) — `FormatBytes`/`FormatSpeed` ヘルパー関数のリファレンス
- [ドメインクライアント](./domain-client) — ドメインクライアントのダウンロードメソッド
