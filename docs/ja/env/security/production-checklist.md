---
sidebar_label: "本番チェックリスト"
title: "本番チェックリスト - CyberGo env | セキュリティ稼働前チェック"
description: "CyberGo env 本番デプロイのセキュリティチェックリスト。.env ファイルの 600 権限と .gitignore 保護、RequiredKeys/AllowedKeys 必須キー検証、監査ログ有効化、SecureValue 処理とパフォーマンスパラメータチューニングをカバーし、本番稼働時のセキュリティを保証。"
sidebar_position: 4
---

# 本番チェックリスト

アプリケーションを本番環境にデプロイする前のチェックリストです。

::: tip セキュリティの概念
セキュリティアーキテクチャとコア機能の詳細は [セキュリティ概要](/ja/env/security/) を参照してください。
:::

## デプロイ前チェック

### ファイルセキュリティ

- [ ] `.env.production` ファイルが存在する
- [ ] ファイル権限が `600` またはそれより厳格
- [ ] 機密ファイルが `.gitignore` に追加済み
- [ ] 設定ファイルにプレースホルダー（`change-me`、`xxx` など）が含まれない

```bash
# 権限をチェック
ls -la .env.production
# 以下を表示すべき：-rw------- (600)

# 権限を修正
chmod 600 .env.production
```

### 設定の検証

- [ ] すべての必須キーが設定済み
- [ ] 機密値が空でない
- [ ] 値の形式が正しい（URL、ポートなど）
- [ ] ハードコードされたキーがない

```go
cfg := env.ProductionConfig()
cfg.RequiredKeys = []string{
    "DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD",
    "API_KEY", "API_URL",
}
cfg.FailOnMissingFile = true
```

## セキュリティ設定チェック

### 監査ログ

- [ ] 監査ログが有効化済み
- [ ] ログディレクトリが書き込み可能
- [ ] ログファイルの権限が正しい

```go
auditFile, _ := os.OpenFile("/var/log/app/audit.log",
    os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
cfg.AuditEnabled = true
cfg.AuditHandler = env.NewJSONAuditHandler(auditFile)
```

### 機密データの処理

- [ ] 機密値の取得に `GetSecure` を使用
- [ ] `Close()` をタイムリーに呼び出してリソースを解放
- [ ] ログに元の機密値を出力しない

```go
secret := loader.GetSecure("DB_PASSWORD")
defer secret.Close()
log.Printf("Password length: %d", secret.Length())
```

### アクセス制御

- [ ] `AllowedKeys` ホワイトリストを設定（推奨）
- [ ] `ValidateValues` を有効化
- [ ] サイズ制限を合理的に設定

```go
cfg.AllowedKeys = []string{"APP_NAME", "DB_HOST", "API_KEY"}
cfg.ValidateValues = true
cfg.MaxVariables = 100
```

## デプロイ時チェック

- [ ] 設定ファイルを安全な場所から読み込み
- [ ] アプリ起動時に設定を検証
- [ ] 設定エラー時にアプリが起動を拒否
- [ ] 機密情報をログに出力しない

## デプロイ後チェック

- [ ] アプリケーションが正常に動作
- [ ] 監査ログが正常に書き込まれる
- [ ] 機密情報の漏洩がない
- [ ] 設定関連のエラーを監視

## クイックチェックスクリプト

```bash
#!/bin/bash
# pre-deploy-check.sh

set -e

echo "=== Pre-deployment Config Check ==="

# ファイルの存在をチェック
[ -f ".env.production" ] || { echo "ERROR: .env.production not found"; exit 1; }

# 権限をチェック
PERMS=$(stat -c %a .env.production 2>/dev/null || stat -f %Lp .env.production)
[ "$PERMS" = "600" ] || [ "$PERMS" = "400" ] || echo "WARNING: permissions are $PERMS"

# プレースホルダーをチェック
grep -qE "(change-?me|placeholder|xxx|YOUR_)" .env.production && \
    { echo "ERROR: Found placeholder values"; exit 1; }

# 必須キーをチェック
for key in DB_HOST DB_PORT DB_USER DB_PASSWORD API_KEY; do
    grep -q "^$key=" .env.production || { echo "ERROR: Missing $key"; exit 1; }
done

echo "=== All checks passed ==="
```

## 関連ドキュメント

- [セキュリティ概要](/ja/env/security/) - セキュリティアーキテクチャとコア機能
- [SecureValue API](/ja/env/api-reference/secure-value) - セキュア値の処理
- [定数とエラー](/ja/env/api-reference/constants) - 禁止キーリスト
