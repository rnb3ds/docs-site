---
sidebar_label: "メモリロック"
title: "メモリロック - CyberGo env | mlock メモリ保護"
description: "CyberGo env メモリロックガイド。SetMemoryLockEnabled の有効化、IsMemoryLockSupported の検出、SetMemoryLockStrict モードと NewSecureValueStrict のエラー処理を詳解。Linux CAP_IPC_LOCK、Windows VirtualLock の権限と SecureValue ライフサイクル管理をカバー。"
sidebar_position: 3
---

# メモリロック

メモリロック（mlock / VirtualLock）は機密データのディスクへのスワップを防止し、SecureValue セキュリティ体系の中核的な防御線の一つです。

## なぜメモリロックが必要か

通常、OS は非アクティブなメモリページをディスク（swap file / page file）にスワップします。これはコード内で `ClearBytes` を呼び出してメモリをゼロクリアしても、ディスクに機密データの残留コピーが残る可能性があることを意味します。

```
メモリ (RAM)                      ディスク (Swap/Page File)
┌──────────────┐                ┌──────────────┐
│ API_KEY=xxx  │ ── スワップ ──→    │ API_KEY=xxx  │ ← 残留！
│              │                │ （ゼロクリア後でも    │
│              │ ←─ 読み戻し ──     │  ここに存在）  │
└──────────────┘                └──────────────┘
```

メモリロックを有効化すると、OS はこれらのメモリページが**スワップアウトされない**ことを保証します：

```
メモリ (RAM)                      ディスク (Swap/Page File)
┌──────────────┐                ┌──────────────┐
│ API_KEY=xxx  │ ╳ スワップ不可 ╳   │              │
│ 🔒 mlock     │                │ （残留なし）    │
└──────────────┘                └──────────────┘
```

## プラットフォームサポート

| プラットフォーム | システムコール | サポート状態 |
|------|----------|:--------:|
| Linux | `mlock(2)` / `munlock(2)` | ✅ |
| macOS | `mlock(2)` / `munlock(2)` | ✅ |
| FreeBSD | `mlock(2)` / `munlock(2)` | ✅ |
| Windows | `VirtualLock` / `VirtualUnlock` | ✅ |
| wasm/nacl | 該当なし | ❌ |

実行時検出：

```go
if env.IsMemoryLockSupported() {
    fmt.Println("現在のプラットフォームはメモリロックをサポートしています")
} else {
    fmt.Println("現在のプラットフォームはメモリロックをサポートしません（wasm など）")
}
```

## 権限要件

メモリロックはシステムのリソース制限に関わり、プラットフォームごとに異なる権限が必要です：

### Linux

`CAP_IPC_LOCK` ケイパビリティが必要です：

```bash
# 方式 1：setcap でバイナリファイルに付与
sudo setcap cap_ipc_lock=ep ./myapp

# 方式 2：systemd サービス経由
# /etc/systemd/system/myapp.service
[Service]
CapabilityBoundingSet=CAP_IPC_LOCK
AmbientCapabilities=CAP_IPC_LOCK

# 方式 3：ulimit で調整（RLIMIT_MEMLOCK）
# /etc/security/limits.conf
*    soft    memlock    unlimited
*    hard    memlock    unlimited
```

### macOS / FreeBSD

通常特別な権限は不要ですが、`ulimit -l`（最大ロックメモリ）の制限を受けます。

### Windows

`SeLockMemoryPrivilege` 権限が必要です：

```
グループポリシー → コンピューターの構成 → Windows の設定 → セキュリティの設定 →
ローカル ポリシー → ユーザー権利の割り当て → "メモリ内のページをロックする"
```

::: warning 権限がない場合の動作
デフォルトモードでは、メモリロック失敗は**サイレントに無視**されます——SecureValue は引き続き使用可能ですが、データはロックされていません。ロックの成功を保証する必要がある場合は厳格モードを使用してください。
:::

## 基本的な使い方

### メモリロックの有効化

アプリ起動時、いかなる SecureValue を作成する前に呼び出します：

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

func main() {
    // プラットフォームサポートをチェック
    if !env.IsMemoryLockSupported() {
        fmt.Println("警告：現在のプラットフォームはメモリロックをサポートしません")
    }

    // メモリロックをグローバルに有効化
    env.SetMemoryLockEnabled(true)

    // 設定を読み込み
    if err := env.Load(".env"); err != nil {
        panic(err)
    }

    // 以降のすべての SecureValue がメモリのロックを試行
    secret := env.GetSecure("API_KEY")
    if secret != nil {
        defer secret.Release()
        fmt.Println(secret.Masked()) // [SECURE:32 bytes locked]
    }
}
```

### ロック状態のチェック

```go
sv := env.GetSecure("DB_PASSWORD")
defer sv.Release()

// ロック済みかチェック
if sv.IsMemoryLocked() {
    fmt.Println("メモリはロック済み、ディスクにスワップされません")
} else {
    fmt.Println("メモリはロックされていません")
}

// ロックエラーを確認（ある場合）
if err := sv.MemoryLockError(); err != nil {
    fmt.Printf("ロック失敗: %v\n", err)
}
```

## 厳格モード

デフォルトモードでは、ロック失敗はサイレントに無視されます。厳格モードは失敗を観測可能にします：

### 厳格モードの有効化

```go
env.SetMemoryLockEnabled(true)
env.SetMemoryLockStrict(true)

// 以降ロックが失敗した場合、標準ログに出力されます：
// env: memory lock failed in strict mode: operation not permitted
```

### 明示的なエラー処理

`NewSecureValueStrict` を使用して作成時にロックエラーを取得します：

```go
env.SetMemoryLockEnabled(true)
env.SetMemoryLockStrict(true)

sv, err := env.NewSecureValueStrict("my-api-key")
if err != nil {
    // メモリロック失敗
    // SecureValue は引き続き有効だが、データはロック保護されていない
    log.Printf("セキュリティ警告：メモリロック失敗: %v", err)
}
defer sv.Release()

// 通常通り使用
fmt.Println(sv.Masked())
```

::: tip 厳格モードの動作
厳格モードでは、ロック失敗が `onStrictLockFailure` コールバックをトリガーします（デフォルトは stderr に出力）。SecureValue 自体は常に有効で使用可能です——厳格モードはロック失敗を**観測可能**にするだけで、使用を阻止するものではありません。
:::

## Masked 出力とロック状態

`Masked()` メソッドは出力にロック状態情報を含みます：

```go
env.SetMemoryLockEnabled(true)

sv := env.GetSecure("API_KEY")
defer sv.Release()

fmt.Println(sv.Masked())
// ロック成功：  [SECURE:32 bytes locked]
// ロック失敗：  [SECURE:32 bytes lock-failed]
// ロック無効：  [SECURE:32 bytes]
// クローズ済み： [CLOSED]
```

## 完全な本番例

```go
package main

import (
    "log"
    "os"

    "github.com/cybergodev/env"
)

func main() {
    // ── セキュリティ設定を初期化 ──

    if env.IsMemoryLockSupported() {
        env.SetMemoryLockEnabled(true)
        env.SetMemoryLockStrict(true) // 本番環境で厳格モードを有効化
        log.Println("メモリロックが有効化されました（厳格モード）")
    } else {
        log.Println("警告：プラットフォームはメモリロックをサポートしません")
    }

    // ── 設定を読み込み ──

    cfg := env.ProductionConfig()
    cfg.RequiredKeys = []string{"DB_PASSWORD", "API_KEY"}
    cfg.AutoApply = true

    loader, err := env.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer loader.Close()

    if err := loader.LoadFiles(".env"); err != nil {
        log.Fatal(err)
    }

    // ── 機密値に安全にアクセス ──

    dbPassword := loader.GetSecure("DB_PASSWORD")
    if dbPassword == nil {
        log.Fatal("DB_PASSWORD not found")
    }
    defer dbPassword.Release()

    // ロック状態をチェック
    if !dbPassword.IsMemoryLocked() {
        log.Printf("セキュリティ警告：DB_PASSWORD がロックされていません")
        if err := dbPassword.MemoryLockError(); err != nil {
            log.Printf("原因：%v", err)
        }
    }

    // 必要な時のみ平文を取得
    password := dbPassword.Reveal()
    _ = password // データベース接続などに使用

    // セーフログ（平文を漏洩しない）
    log.Printf("データベースパスワード：%s", dbPassword.Masked())
    // 出力：データベースパスワード：[SECURE:12 bytes locked]

    _ = os.Stdout
}
```

## ベストプラクティス

### タイムリーな解放

ロックされたメモリはメモリプレッシャーを高めます（スワップアウトできないため）、使用後にただちに解放すべきです：

```go
// ✅ 推奨：使い終わったら即座に解放
sv := env.GetSecure("API_KEY")
defer sv.Release()
value := sv.Reveal()
// value を使用...
// defer トリガー時に自動ゼロクリア + アンロック + オブジェクトプール返却

// ❌ 回避：長時間保持
var globalSecret *env.SecureValue // 非推奨
```

### 小さく短命に保つ

大きなメモリブロックをロックするとシステムパフォーマンスに影響します。各 SecureValue は設定ブロック全体ではなく、必要な機密値（パスワード、キー、トークン）のみを格納すべきです。

### Close より Release を優先

```go
sv := env.GetSecure("TOKEN")

// ✅ Release：ゼロクリア + アンロック + オブジェクトプール返却（推奨）
defer sv.Release()

// Close も可能だが、オブジェクトプールに返却しない
// defer sv.Close()
```

## トラブルシューティング

| 問題 | 考えられる原因 | 解決策 |
|------|----------|----------|
| Masked 出力に `lock-failed` が表示 | 権限不足 | `CAP_IPC_LOCK`（Linux）または `SeLockMemoryPrivilege`（Windows）を設定 |
| 厳格モードログが大量に出力 | 大量の SecureValue 作成時にロック失敗 | システムの `RLIMIT_MEMLOCK` 制限をチェック、または非厳格モードを使用 |
| `IsMemoryLockSupported()` が false を返す | wasm/nacl プラットフォーム | これらのプラットフォームはメモリロックをサポートしません、他のセキュリティ対策（暗号化ストレージなど）を使用 |
| メモリ使用量が増加 | ロックされたページがスワップアウト不可 | SecureValue の保持時間を削減、タイムリーに Release |

## 関連ドキュメント

- [セキュリティ概要](/ja/env/security/) - セキュリティアーキテクチャの総覧
- [SecureValue API](/ja/env/api-reference/secure-value) - セキュア値の完全な API（メモリロック関数を含む）
- [パフォーマンス最適化](/ja/env/advanced/performance) - メモリロックのパフォーマンスオーバーヘッド分析
- [本番チェックリスト](/ja/env/security/production-checklist) - 本番稼働前のセキュリティチェック
