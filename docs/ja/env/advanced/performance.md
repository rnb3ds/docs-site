---
sidebar_label: "パフォーマンス"
title: "パフォーマンス最適化 - CyberGo env | 高並行読み書きチューニング"
description: "CyberGo env パフォーマンス最適化ガイド。RWMutex 読み書きロックとシャードロックの並行セーフ機構、sync.Pool オブジェクトプール再利用によるアロケーション削減、mlock メモリロックのオーバーヘッド考察と大ファイルストリーミング解析を詳解。ベンチマーク比較、並行スループット分析、MaxFileSize/MaxVariables パラメータチューニングの提案を含む。"
sidebar_position: 1
---

# パフォーマンス最適化

env ライブラリは高性能シーン向けに最適化されています。本文書は並行セーフ、オブジェクトプール、メモリ管理などのパフォーマンス関連機能を紹介します。

## 並行セーフ

### スレッドセーフの保証

`Loader` のすべてのメソッドはスレッドセーフです：

```go
loader, _ := env.New(env.DefaultConfig())
defer loader.Close()

var wg sync.WaitGroup

// 並行読み取り
for i := 0; i < 100; i++ {
    wg.Add(1)
    go func() {
        defer wg.Done()
        loader.GetString("KEY")
    }()
}

// 並行書き込み
for i := 0; i < 100; i++ {
    wg.Add(1)
    go func(n int) {
        defer wg.Done()
        loader.Set(fmt.Sprintf("KEY_%d", n), "value")
    }(i)
}

wg.Wait()
```

### パッケージレベル関数のスレッドセーフ

パッケージレベル関数はグローバルローダーを使用し、同様にスレッドセーフです：

```go
var wg sync.WaitGroup

for i := 0; i < 100; i++ {
    wg.Add(1)
    go func() {
        defer wg.Done()
        env.GetString("KEY", "default")
    }()
}

wg.Wait()
```

### 内部実装

ライブラリはシャードストレージ（Sharded Storage）を使用してロック競合を削減します：

```text
┌─────────────────────────────────────────┐
│          Loader（8 シャード）             │
├─────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐    ┌────────┐ │
│  │ Shard 0 │ │ Shard 1 │... │ Shard 7│ │
│  │  Lock   │ │  Lock   │    │  Lock  │ │
│  │  Data   │ │  Data   │    │  Data  │ │
│  └─────────┘ └─────────┘    └────────┘ │
└─────────────────────────────────────────┘
```

- キーはハッシュ値に基づき異なるシャードに割り当て
- 各シャードは独立したロックを持つ
- ロック競合を削減し、並行パフォーマンスを向上

## オブジェクトプール

### なぜオブジェクトプールを使うのか

頻繁なオブジェクトの作成と破棄は GC 圧力を高めます：

```text
オブジェクトプールなし：
オブジェクト作成 → 使用 → GC 回収 → オブジェクト作成 → 使用 → GC 回収 ...

オブジェクトプールあり：
オブジェクト作成 → 使用 → プールに返却 → 取得 → 使用 → プールに返却 ...
```

### SecureValue プール

`SecureValue` オブジェクトはプール管理を使用します：

```go
// SecureValue を取得（プールから再利用される可能性）
secret := env.GetSecure("API_KEY")

// 使用（Reveal は平文を返す、String/Masked はマスクを返す）
value := secret.Reveal()

// プールに返却
secret.Close()  // または secret.Release()
```

### オブジェクトプールの正しい使用

**タイムリーな解放：**

```go
func processData() {
    secret := env.GetSecure("SECRET")
    defer secret.Close()  // 解放を保証

    // secret を使用...
}
```

**参照を保持しない：**

```go
// 誤り：解放済みオブジェクトの参照を保持
var globalSecret *env.SecureValue

func init() {
    globalSecret = env.GetSecure("KEY")
    globalSecret.Close()  // 解放後オブジェクトが再利用される
}

func later() {
    // 危険：globalSecret は既に他のコードで使用されている可能性
    globalSecret.String()
}

// 正しい：必要な時に毎回取得
func getSecret() string {
    secret := env.GetSecure("KEY")
    defer secret.Close()
    return secret.Reveal()
}
```

**クローズ状態のチェック：**

```go
secret := env.GetSecure("KEY")

// 使用前にチェック
if secret.IsClosed() {
    // オブジェクトはクローズ済み、使用不可
}

// 使用後にクローズ
secret.Close()

// クローズ後にチェック
if secret.IsClosed() {
    // クローズ済み
}
```

## メモリセーフ

### メモリロック

メモリロックを有効化して機密データのディスクスワップを防止します：

```go
// プラットフォームサポートをチェック
if env.IsMemoryLockSupported() {
    env.SetMemoryLockEnabled(true)
}
```

**プラットフォームサポート：**

| プラットフォーム | サポート |
|------|------|
| Linux | ✅ |
| macOS | ✅ |
| Windows | ✅ |
| FreeBSD | ✅ |
| wasm | ❌ |

::: tip 詳細
[SecureValue API - メモリロック設定](/ja/env/api-reference/secure-value#メモリロック設定) で完全な設定説明を参照してください。
:::

### 厳格モード

厳格モードでは、メモリロック失敗がエラーになります：

```go
env.SetMemoryLockStrict(true)

secret, err := env.NewSecureValueStrict("sensitive_data")
if err != nil {
    // メモリロック失敗
}
```

### 安全なゼロクリア

`SecureValue` はクローズ時に自動的にメモリをゼロクリアします：

```go
secret := env.GetSecure("PASSWORD")
// 内部ストレージ：['p', 'a', 's', 's', ...]

secret.Close()
// 内部ストレージ：[0, 0, 0, 0, ...]
```

バイトスライスの手動ゼロクリア：

```go
sensitiveBytes := []byte("secret")
env.ClearBytes(sensitiveBytes)
// sensitiveBytes はすべて 0 になる
```

## パフォーマンスパターン

### 初期化後の読み取り専用

最も効率的なパターン：起動時に設定を読み込み、実行時は読み取り専用：

```go
var config *Config

func init() {
    env.Load(".env")

    config = &Config{}
    env.ParseInto(config)
}

// 任意の goroutine から安全に読み取り
func getValue() string {
    return config.Key
}
```

### 動的設定リフレッシュ

設定を動的に更新する必要がある場合のパターン：

```go
type ConfigManager struct {
    loader *env.Loader
    mu     sync.RWMutex
}

func (m *ConfigManager) Refresh() error {
    m.mu.Lock()
    defer m.mu.Unlock()

    return m.loader.LoadFiles(".env")
}

func (m *ConfigManager) Get(key string) string {
    m.mu.RLock()
    defer m.mu.RUnlock()

    return m.loader.GetString(key)
}
```

### ロック保持時間の削減

```go
// 非推奨：ロック内で時間のかかる操作を実行
func (l *Loader) ProcessValue(key string) {
    value := l.GetString(key)
    // 時間のかかる操作...
    processValue(value)
}

// 推奨：高速に読み取り、ロック外で処理
func ProcessValue(key string) {
    value := loader.GetString(key)  // 高速に取得
    go processValue(value)          // 非同期処理
}
```

### バッチ操作

```go
// 必要な値を一度に取得
func LoadAllConfig(loader *env.Loader) *Config {
    return &Config{
        Host:    loader.GetString("HOST"),
        Port:    loader.GetInt("PORT"),
        Debug:   loader.GetBool("DEBUG"),
        Timeout: loader.GetDuration("TIMEOUT"),
    }
}
```

### 頻繁な呼び出しの回避

```go
// 非推奨：リクエストごとに読み取り
func Handler(w http.ResponseWriter, r *http.Request) {
    apiKey := env.GetString("API_KEY")  // リクエストごとにロック
    // ...
}

// 推奨：起動時にキャッシュ
var apiKey string

func init() {
    env.Load(".env")
    apiKey = env.GetString("API_KEY")
}

func Handler(w http.ResponseWriter, r *http.Request) {
    // キャッシュ値を直接使用
    // ...
}
```

## パフォーマンスへの影響

### オブジェクトプールのメリット

| 操作 | プールなし | プールあり |
|------|------|------|
| アロケーション回数 | N | ~一定 |
| GC 圧力 | 高 | 低 |
| レイテンシ | 不安定 | 安定 |

### メモリロックのオーバーヘッド

メモリロック（Linux の `mlock` / Windows の `VirtualLock`）は `SecureValue` 作成時に 1 回だけ追加の syscall オーバーヘッドを発生させ、読み取り操作（`Reveal` / `String` / `Masked`）に差はありません。`SecureValue` は小さく短命に保つことを推奨します——使い終わったら即座に `Close()` / `Release()` してオブジェクトプールに返却し、大块のロックされたメモリを長期保持しないでください。

## ベンチマーク

### 読み取りパフォーマンス

```go
func BenchmarkConcurrentRead(b *testing.B) {
    loader, _ := env.New(env.DefaultConfig())
    loader.Set("KEY", "value")

    b.RunParallel(func(pb *testing.PB) {
        for pb.Next() {
            loader.GetString("KEY")
        }
    })
}
```

### 書き込みパフォーマンス

```go
func BenchmarkConcurrentWrite(b *testing.B) {
    loader, _ := env.New(env.DefaultConfig())

    var i int64
    b.RunParallel(func(pb *testing.PB) {
        for pb.Next() {
            n := atomic.AddInt64(&i, 1)
            loader.Set(fmt.Sprintf("KEY_%d", n), "value")
        }
    })
}
```

### 混合読み書き

```go
func BenchmarkMixedReadWrite(b *testing.B) {
    loader, _ := env.New(env.DefaultConfig())
    loader.Set("KEY", "value")

    b.RunParallel(func(pb *testing.PB) {
        i := 0
        for pb.Next() {
            if i%10 == 0 {
                loader.Set("KEY", "new_value")
            } else {
                loader.GetString("KEY")
            }
            i++
        }
    })
}
```

## 注意事項

### ロック内でのブロック回避

```go
// 危険：デッドロックの可能性
func (l *Loader) BadMethod() {
    // ロック内でブロックする可能性のある操作を呼び出し
    l.Set("KEY", computeValue())  // computeValue が遅い可能性
}

// 安全：先に計算、後に設定
func GoodMethod() {
    value := computeValue()  // ロック外で計算
    loader.Set("KEY", value)  // 高速に設定
}
```

### Close 後の並行アクセス

```go
loader, _ := env.New(cfg)

// goroutine を起動
go func() {
    time.Sleep(1 * time.Second)
    loader.GetString("KEY")  // 空文字列を返す（GetString は error を返さない）
}()

loader.Close()  // メイン goroutine がクローズ
```

### グローバルローダーのリセット

```go
// 並行セーフでない：実行時に呼び出さないでください
env.ResetDefaultLoader()

// 安全：テストまたは起動時にのみ呼び出し
func init() {
    env.ResetDefaultLoader()
    env.Load(".env")
}
```

## 関連ドキュメント

- [SecureValue API](/ja/env/api-reference/secure-value) - セキュア値の処理とメモリロック
- [Loader API](/ja/env/api-reference/loader) - ローダーメソッド
- [テスト](/ja/env/guides/testing) - ベンチマーク例
