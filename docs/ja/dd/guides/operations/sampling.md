---
sidebar_label: "ログサンプリング"
title: "ログサンプリング - CyberGo DD | 高スループット時のログボリューム削減"
description: "CyberGo DD ログサンプリング設定ガイド：SamplingConfig の Initial、Thereafter、Tick パラメータを使用して、高スループット環境でログボリュームを制御しながら主要な情報を保持する方法。ランタイム切り替え機能付き。"
sidebar_position: 1
---

# ログサンプリング

高スループットのシナリオ（HTTP リクエストログ、イベントストリーム処理）では、すべてのエントリをログに記録すると膨大なデータが生成されます。DD のサンプリング機能は、ログを比例的に保持し、全体の傾向を反映しつつログボリュームを制御します。

## サンプリングの原理

DD は**カウンターベースのサンプリング**戦略を使用します：

```
┌──────────────────────────────────────────────────────────┐
│  Requests 1-100  →  all logged (Initial phase)           │
│  Request 101     →  skipped                               │
│  Request 102     →  skipped                               │
│  ...                                                      │
│  Request 110     →  logged (1 of every Thereafter=10)     │
│  Request 111     →  skipped                               │
│  ...                                                      │
│  (Tick expires → counter resets, re-enters Initial phase) │
└──────────────────────────────────────────────────────────┘
```

| パラメータ | 説明 | 典型的な値 |
|-----------|-------------|---------------|
| `Enabled` | サンプリングを有効化 | `true` |
| `Initial` | 最初の N エントリは常にログ出力 | 100 |
| `Thereafter` | Initial 以降、N 回に1回ログ出力 | 10 |
| `Tick` | カウンターのリセット間隔（0 = リセットなし） | `1s` / `1m` |

## クイックスタート

### 設定での有効化

```go
package main

import (
    "log"
    "time"

    "github.com/cybergodev/dd"
)

func main() {
    cfg := dd.DefaultConfig()
    cfg.Sampling = &dd.SamplingConfig{
        Enabled:    true,
        Initial:    100,             // 最初の100エントリは常にログ出力
        Thereafter: 10,              // その後、10回に1回ログ出力
        Tick:       time.Second,     // 毎秒カウンターをリセット
    }

    logger, err := dd.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer logger.Close()

    // 高スループットのログ出力をシミュレート
    for i := 0; i < 1000; i++ {
        logger.InfoWith("request processed",
            dd.Int("seq", i),
        )
    }
    // 実際の出力：最初の100 + 残り900のうち90 = 190エントリ
}
```

### ランタイム切り替え

```go
// サンプリングを有効化
logger.SetSampling(&dd.SamplingConfig{
    Enabled:    true,
    Initial:    50,
    Thereafter: 20,
    Tick:       0, // 自動リセットなし
})

// サンプリングを無効化（全件ログ出力を再開）
logger.SetSampling(nil)

// 現在のサンプリング設定を照会
sc := logger.GetSampling()
if sc != nil {
    fmt.Printf("Sampling: Initial=%d, Thereafter=%d\n", sc.Initial, sc.Thereafter)
}
```

:::tip ヒント グローバル Logger のサンプリング
パッケージレベル関数 `dd.SetSampling()` と `dd.GetSampling()` は、グローバル Logger に対して直接動作します。
:::

## パラメータの詳細

### Initial: 初期フルボリュームウィンドウ

`Initial` は、起動後または Tick リセット後の最初の N エントリが**すべてログ出力される**ことを保証し、以下を確保します：

- 起動フェーズの初期化ログが失われない
- 短いバーストトラフィックの完全な記録
- Tick リセット後の期間開始時の状態が可視化される

### Thereafter: サンプリングレート

| Thereafter | 効果 | 保持率（Initial 以降） |
|:----------:|--------|:------------------------------:|
| 1 | 全エントリをログ出力（= 無効と同じ） | 100% |
| 10 | 10回に1回ログ出力 | 10% |
| 100 | 100回に1回ログ出力 | 1% |
| 0 | Initial 以降はログ出力を停止 | 0% |

:::warning 警告 Thereafter=0
`Thereafter=0` は、Initial フェーズ以降の**ログ出力の完全停止**を意味します。一部のシナリオ（例：起動時ログのみが必要）では有用ですが、重要な情報を見逃さないように注意してください。
:::

### Tick: 定期リセット

```go
// オプション A：毎秒リセット（バースト検出）
Sampling: &dd.SamplingConfig{
    Enabled: true, Initial: 100, Thereafter: 10,
    Tick: time.Second,
}

// オプション B：リセットなし（グローバルカウント、長期的な削減）
Sampling: &dd.SamplingConfig{
    Enabled: true, Initial: 1000, Thereafter: 100,
    Tick: 0,
}
```

Tick リセット後、カウンターはゼロにリセットされ、Initial フルボリュームフェーズに再び入ります。**期間ごとのトラフィックパターンの観察**に有用です。

## 典型的なシナリオ

### シナリオ 1：HTTP リクエストログ

```go
// 高トラフィック API：最初の100件は全件、その後10%サンプリング、毎秒リセット
cfg.Sampling = &dd.SamplingConfig{
    Enabled:    true,
    Initial:    100,
    Thereafter: 10,
    Tick:       time.Second,
}
```

### シナリオ 2：バックグラウンドタスクログ

```go
// バッチ処理：最初の50件は全件、その後100回に1回、リセットなし
cfg.Sampling = &dd.SamplingConfig{
    Enabled:    true,
    Initial:    50,
    Thereafter: 100,
    Tick:       0,
}
```

### シナリオ 3：デバッグモードの切り替え

```go
// 通常時：サンプリングあり
logger.SetSampling(&dd.SamplingConfig{
    Enabled: true, Initial: 10, Thereafter: 50,
})

// トラブルシューティング：サンプリングを無効化、全件ログ出力
logger.SetSampling(nil)

// 復旧後：サンプリングを復元
logger.SetSampling(&dd.SamplingConfig{
    Enabled: true, Initial: 10, Thereafter: 50,
})
```

## スレッドセーフティ

サンプリングは、カウンターにアトミック操作（`atomic.Int64`）を、Tick リセットにミューテックスを使用します。複数の goroutine からの並行ログ出力に対して、追加の同期は不要です。

:::tip ヒント Fatal ログはサンプリングをバイパスします
サンプリングが有効であっても、`Fatal` レベルのログは**常に書き込まれます**。Fatal はプログラム終了前に記録される必要があり、サンプリングによってスキップされるべきではありません。
:::

## 次のステップ

- [パフォーマンス](../../advanced/performance) -- ゼロアロケーションとバッファプールの仕組み
- [設定](../basics/configuration) -- 完全な設定フィールド
- [Hook システム](./hooks) -- BeforeLog Hook はサンプリングを補完できます
