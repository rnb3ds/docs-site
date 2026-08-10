---
sidebar_label: "グローバル Logger"
title: "グローバル Logger - CyberGo DD | デフォルト Logger 使用ガイド"
description: "CyberGo DD グローバル Logger パターン：Default() の遅延初期化、SetDefault() による置き換え、InitDefault() のエラーハンドリング、およびパッケージレベル関数 dd.Info() とインスタンスメソッド logger.Info() の使い分け。"
sidebar_position: 3
---

# グローバル Logger

DD はプロセスレベルのグローバル Logger を提供します。すべての**パッケージレベルの便利関数**（`dd.Info()`、`dd.Errorf()` など）はこの Logger に処理を委譲します。これは最もシンプルな使用モードであり、設定なしでログ出力を開始できます。

## 2つの使用モードの比較

| モード | コード例 | ユースケース |
|------|-------------|----------|
| **グローバル Logger** | `dd.Info("hello")` | スクリプト、小規模プロジェクト、迅速なプロトタイピング |
| **インスタンス Logger** | `logger, _ := dd.New(cfg); logger.Info("hello")` | カスタム設定、複数の Logger インスタンス、DI |

グローバル Logger は本質的に `sync.Once` で保護されたシングルトンの `*Logger` であり、初回アクセス時に自動的に作成されます。

## パッケージレベルの便利関数

すべての標準的なログメソッドには、グローバル Logger に対して動作するパッケージレベルの対応物が存在します：

```go
package main

import "github.com/cybergodev/dd"

func main() {
    // 基本的なログ出力
    dd.Debug("debug info")
    dd.Info("service started")
    dd.Warn("high memory usage")
    dd.Error("request failed")
    // dd.Fatal("fatal error")  // ⚠️ os.Exit(1) を呼び出します

    // フォーマット指定
    dd.Infof("user %s logged in", username)

    // 構造化ログ
    dd.InfoWith("request completed",
        dd.String("method", "GET"),
        dd.Int("status", 200),
    )

    // Field チェーン
    dd.WithFields(dd.String("service", "api")).
        Info("service ready")

    // レベル制御
    dd.SetLevel(dd.LevelDebug)
    if dd.IsDebugEnabled() {
        dd.Debug("debug enabled")
    }
}
```

:::tip ヒント すべてのパッケージレベル関数
基本（`Debug/Info/Warn/Error/Fatal`）、フォーマット指定（`Debugf/Infof/...`）、構造化（`DebugWith/InfoWith/...`）、汎用レベル（`Log/Logf/LogWith`）、Field チェーン（`WithFields/WithField`）、レベル照会（`IsLevelEnabled/IsDebugEnabled/...`）、サンプリング（`SetSampling/GetSampling`）、Writer 管理（`AddWriter/RemoveWriter/WriterCount`）、ライフサイクル（`Flush`）。
:::

## グローバル Logger の初期化

### Default(): 遅延初期化

`dd.Default()` はグローバル Logger を返します。初回呼び出し時に `DefaultConfig()` で作成されます：

```go
// 初回呼び出し → 自動作成（sync.Once がスレッドセーフを保証）
logger := dd.Default()
logger.Info("hello") // dd.Info("hello") と同等
```

### InitDefault(): カスタム設定

起動時にカスタム設定でグローバル Logger を初期化します：

```go
package main

import (
    "log"

    "github.com/cybergodev/dd"
)

func main() {
    cfg := dd.DefaultConfig()
    cfg.Level = dd.LevelDebug
    cfg.Format = dd.FormatJSON

    if err := dd.InitDefault(cfg); err != nil {
        log.Fatalf("failed to init logger: %v", err)
    }

    // 以降、すべてのパッケージレベル関数はこの設定を使用します
    dd.Info("global Logger initialized")
}
```

:::warning 警告 InitDefault は古いインスタンスを置き換えます
グローバル Logger が既に存在する場合（例：`Default()` により自動作成済み）、`InitDefault()` は**古いインスタンスをクローズ**して置き換えます。古いインスタンスは、進行中の書き込みの完了を待つため、バックグラウンドの goroutine で 100ms の遅延後にクローズされます。
:::

### SetDefault(): 直接置き換え

作成済みの Logger インスタンスでグローバル Logger を置き換えます：

```go
logger, _ := dd.New(dd.DevelopmentConfig())
dd.SetDefault(logger)

// パッケージレベル関数は新しい Logger を使用します
dd.Info("using custom Logger")
```

## エラーハンドリング

グローバル Logger の初期化に失敗した場合、stderr 出力にフォールバックします（パニックは発生しません）。以下の方法で初期化ステータスを確認できます：

```go
logger := dd.Default()

if err := dd.DefaultInitError(); err != nil {
    // Logger はフォールバックモード（stderr 出力）で動作しています
    log.Printf("warning: global Logger init failed: %v", err)
}

// または、Logger とエラーを同時に取得
logger, err := dd.DefaultWithErr()
if err != nil {
    log.Printf("fallback mode: %v", err)
}
```

## インスタンス Logger との併用

グローバル Logger とインスタンス Logger は共存できます。一般的なパターンは、`main` でグローバル Logger を初期化しつつ、DI 用のインターフェースを使用することです：

```go
// main.go
func main() {
    cfg := dd.DefaultConfig()
    cfg.Format = dd.FormatJSON
    _ = dd.InitDefault(cfg)
    defer dd.Flush()
}

// service.go — テスト容易性のためにインターフェースを使用
type Service struct {
    logger dd.LogProvider // インターフェース、モック可能
}

func NewService(logger dd.LogProvider) *Service {
    return &Service{logger: logger}
}

// グローバル Logger で Service を作成
svc := NewService(dd.Default())
```

:::tip ヒント DI に推奨されるインターフェース
`dd.LogProvider` は、依存性注入に最も完全なログインターフェースです。より簡潔なインターフェース：`dd.CoreLogger`（ログメソッドのみ）、`dd.LevelLogger`（+ レベル管理）、`dd.ConfigurableLogger`（+ 設定 & ライフサイクル）。詳細は [インターフェース](../api-reference/core/interfaces) を参照してください。
:::

## 次のステップ

- [設定](../guides/basics/configuration) -- 完全な Config Field リファレンス
- [チートシート](./cheatsheet) -- 一般的な API クイックリファレンス
- [インターフェース](../api-reference/core/interfaces) -- Logger インターフェース階層
