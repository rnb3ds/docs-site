---
sidebar_label: "インストール"
title: "インストール - CyberGo DD | 環境要件と統合"
description: "CyberGo DD ログライブラリのインストールガイド。Go バージョン要件、go get によるインストール、Go Module 統合、CI/CD 設定の推奨事項、一般的なインストール問題のトラブルシューティングをカバーし、開発者が DD をプロジェクトに迅速に統合できるようサポートします。"
sidebar_position: 1
---

# インストール

## 環境要件

| 要件 | バージョン |
|------|------------|
| Go | ≥ 1.25 |
| OS | Linux / macOS / Windows |

:::tip Go バージョンについて
DD は Go 1.25 の一部の機能を使用しています。プロジェクトで古いバージョンの Go を使用している場合は、ツールチェーンをアップグレードしてください: `go env -w GOTOOLCHAIN=go1.25.0+auto`。
:::

## クイックインストール

```bash
go get github.com/cybergodev/dd
```

## Go Module 統合

プロジェクトルートで実行:

```bash
# モジュールを初期化（go.mod がまだない場合）
go mod init your-project

# DD の依存関係を追加
go get github.com/cybergodev/dd
```

パッケージをインポート:

```go
import "github.com/cybergodev/dd"
```

インストールの確認:

```go
package main

import "github.com/cybergodev/dd"

func main() {
    dd.Info("DD のインストールに成功しました！")
}
```

## バージョン管理

### バージョンの指定

```bash
# 特定バージョンのインストール
go get github.com/cybergodev/dd@v1.0.0

# 最新バージョンへのアップグレード
go get github.com/cybergodev/dd@latest
```

### 依存関係の管理

```bash
# 依存関係の整理（未使用の依存関係を削除、不足分を追加）
go mod tidy

# 現在の依存関係バージョンを確認
go list -m github.com/cybergodev/dd
```

## CI/CD 統合

GitHub Actions で DD を使用:

```yaml
steps:
  - uses: actions/setup-go@v5
    with:
      go-version: '1.25'
  - uses: actions/checkout@v4
  - run: go mod download
  - run: go build ./...
```

:::warning プライベートリポジトリ
DD がプライベート Git サーバーでホストされている場合は、GOPRIVATE 環境変数を設定してください:

```bash
go env -w GOPRIVATE=github.com/cybergodev/*
```
:::

## トラブルシューティング

### `go get` で `module not found` エラー

Go バージョンが ≥ 1.25 であることを確認し、ネットワークプロキシ設定を確認してください:

```bash
go env -w GOPROXY=https://proxy.golang.org,direct
```

### ビルド時に `undefined: dd.xxx` エラー

`go mod tidy` を実行して依存関係を同期してから、再ビルドしてください。

## 次のステップ

- [クイックスタート](./) -- 5 分で始めるガイド
- [グローバル Logger](./global-logger) -- パッケージレベルの便利関数の使用パターン
- [コア概念](../guides/basics/core-concepts) -- DD のアーキテクチャを理解する
