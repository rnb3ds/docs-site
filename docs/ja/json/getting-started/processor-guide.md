---
sidebar_label: "Processor ガイド"
title: "Processor ガイド - CyberGo JSON | いつ Processor を使うか"
description: "CyberGo JSON Processor ガイド：パッケージ関数と Processor の選択基準、PreParse 事前解析最適化、ライフサイクル管理とグローバルプロセッサで高性能 JSON 処理を習得。"
sidebar_position: 3
---

# Processor ガイド

本ガイドでは、Processor を**いつ**・**どのように**使うべきか、パッケージレベル関数と比べてどのような利点があるかを理解します。

## パッケージ関数 vs Processor

CyberGo JSON は 2 つの API スタイルを提供します：

| 項目 | パッケージレベル関数 | Processor |
|------|----------|-----------|
| **典型的な呼び出し** | `json.GetString(data, "name")` | `p.GetString(data, "name")` |
| **作成方法** | 作成不要、直接呼び出し | `p, err := json.New()` |
| **設定方法** | 呼び出しごとに `cfg ...Config` を渡す | 作成時に一括設定、以降再利用 |
| **キャッシュ** | グローバル共有キャッシュ | 独立キャッシュ、制御・クリア可能 |
| **リソース管理** | 自動（グローバルプロセッサ） | 手動 `Close()` |
| **フックシステム** | 非対応 | `AddHook` に対応 |
| **事前解析** | 非対応 | `PreParse` + `GetFromParsed` に対応 |
| **適用シナリオ** | 単純な操作、スクリプト、低頻度呼び出し | 高頻度操作、カスタム設定、サーバーサイド |

::: tip クイック判断
- **パッケージ関数を使う**：たまに JSON を操作する、ライフサイクルを管理したくない、クイックスクリプト
- **Processor を使う**：カスタム設定が必要、同じデータに高頻度でクエリ、フック・監査が必要
:::

## いつ Processor を使うか

### シナリオ 1：カスタム設定

パッケージレベル関数はデフォルト設定を使用します。セキュリティモード、カスタムエンコーダ、フックが必要な場合は Processor を使用します：

```go
// パッケージ関数 — 常にデフォルト設定を使用
val := json.GetString(data, "name")

// Processor — カスタム設定が可能
cfg := json.SecurityConfig() // セキュリティモード
p, err := json.New(cfg)
if err != nil {
    panic(err)
}
defer p.Close()

// 以降のすべての操作がセキュリティ設定を使用
val, err := p.Get(data, "name")
```

### シナリオ 2：同じデータへの高頻度クエリ（PreParse 最適化）

同じ JSON に対して複数回クエリを行う場合、`PreParse` は一度だけ解析し、以降のクエリは解析結果を再利用します：

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

// 一度だけ解析
parsed, err := p.PreParse(largeJSON)
if err != nil {
    panic(err)
}

// 複数回クエリ — 解析結果を再利用、重複解析を回避
name, _ := p.GetFromParsed(parsed, "user.name")
email, _ := p.GetFromParsed(parsed, "user.email")
tags, _ := p.GetFromParsed(parsed, "tags")
```

::: warning パフォーマンス比較
- パッケージ関数 `GetString`：呼び出しごとに JSON を解析（キャッシュはあるがヒット率はシナリオ次第）
- `PreParse` + `GetFromParsed`：一度解析、N 回のクエリはナビゲーションのみ、重複解析ゼロ
:::

### シナリオ 3：フックと監査

ログ記録、パフォーマンス監視、入力バリデーションが必要な場合、Processor はフックシステムに対応しています：

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close()

// ログフックを追加
p.AddHook(json.LoggingHook(slog.Default()))
// タイミングフックを追加
p.AddHook(json.TimingHook(&metricsRecorder))

// すべての操作が自動的にフックをトリガー
result, err := p.Set(data, "user.name", "Alice")
```

詳細は [Hook フックシステム](../extensions/hooks) を参照。

## ライフサイクル管理

Processor はリソース（キャッシュ、goroutine）を保持するため、使用後は**必ず閉じる**必要があります：

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close() // リソース解放を保証

// Processor を使用...
result, err := p.GetString(data, "name")
```

::: warning Close 忘れの影響
- キャッシュメモリが解放されない
- バックグラウンド goroutine のリーク
- 高並行シナリオでリソース枯渇の可能性
:::

### 状態の確認

```go
if p.IsClosed() {
    // Processor はクローズ済み、以降使用不可
}
```

## グローバルプロセッサ

パッケージレベル関数（`Get`、`Set`、`Marshal` など）は内部で**グローバルプロセッサ**を使用します。これを置き換えることもできます：

```go
// カスタム設定のプロセッサを作成
cfg := json.SecurityConfig()
p, err := json.New(cfg)
if err != nil {
    panic(err)
}

// グローバルプロセッサとして設定
json.SetGlobalProcessor(p)

// 以降、すべてのパッケージレベル関数がセキュリティ設定を使用
val := json.GetString(data, "name")

// アプリケーション終了時にクリーンアップ
defer json.ShutdownGlobalProcessor()
```

::: tip 適用シナリオ
- グローバルに統一されたセキュリティポリシー
- カスタムエンコーダのグローバル適用
- あちこちで Config を渡さずにデフォルト設定を置き換えたい場合
:::

## 選択デシジョンツリー

```
JSON を操作する必要がある？
├── たまに使用、スクリプトツール
│   └── → パッケージ関数 json.GetString / json.Set / json.Marshal
├── カスタム設定が必要（セキュリティ/エンコード/フック）
│   └── → Processor json.New(cfg)
├── 同じ JSON に複数回クエリ
│   └── → Processor + PreParse
├── 監査/監視/ログが必要
│   └── → Processor + AddHook
└── グローバルに統一設定
    └── → SetGlobalProcessor
```

## 次のステップ

- [パス式の構文](./path-syntax) — パスクエリの完全な構文
- [Processor API](../api-reference/processor/) — 完全なメソッドリファレンス
- [パフォーマンス最適化](../advanced/performance) — パフォーマンスチューニングの詳細
- [チートシート](./cheatsheet) — API クイックリファレンス
