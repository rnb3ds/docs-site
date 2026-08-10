---
sidebar_label: "トークンブラックリスト"
title: "トークンブラックリスト - CyberGo JWT | 失効と外部ストア"
description: "トークンブラックリストガイド：内蔵メモリストアの設定と期限切れクリーンアップ機構、Revoke と IsRevoked でトークンを失効させ、BlacklistStore インターフェースで Redis など外部ストアへ接続、複数インスタンス運用のベストプラクティス。"
sidebar_position: 30
---

# トークンブラックリスト

ブラックリストはトークンの有効期限前に能動的に無効化するために使用します。ユーザーのログアウト、パスワード変更、権限変更などのシーンに適しています。

## 動作原理

```text
Revoke(token) → jti + exp を抽出 → BlacklistStore に書き込み
Validate(token) → 署名を検証 → ブラックリストを確認 → 結果を返す
```

`Revoke` は渡された文字列を単純にブラックリストに書き込むのではなく、まず**セキュリティ検証チェーン**を実行し、実際に発行されたトークンのみが失効対象となることを保証します：

1. **署名の検証** —— プロセッサーが設定した鍵でトークン署名を再検証し、改ざんや偽造されたトークンを拒否します
2. **発行者とオーディエンスの検証** —— `iss`、`aud` がプロセッサーの設定と一致するかを確認し、クロスドメインの誤失効を防止します
3. **jti の抽出** —— トークンの一意 ID（`jti`）をブラックリストキーとして取り出します；トークンに `jti` がない場合は `ErrTokenMissingID` を返します
4. **TTL の計算とストアへの書き込み** —— トークンの `exp` からエントリの生存時間を算出し（下節参照）、jti を `BlacklistStore` に書き込みます

:::tip 署名検証は重要なセキュリティ設計
なぜ `Revoke` は先に署名検証をしてから失効するのでしょうか？もし呼び出し元が渡した `jti` を直接信頼すると、悪意のある呼び出し者が偽造した `jti` で**任意の合法ユーザーのトークン**をブラックリストに入れ、DoS 攻撃を実行できてしまいます。強制署名検証により「実際のトークンを保持している者のみがそれを失効できる」ことを保証します——これは `Revoke` の呼び出し時に裸の `jti` ではなく完全なトークン文字列を渡す必要があることも意味します。
:::

`Revoke` と `IsRevoked` は**どちらも `exp`/`nbf` をチェックしません**：トークンが期限切れであっても、失効や失効状態の照会が可能です。この設計により、監査や事後的な失効補償などのシーンで履歴トークンをカバーできます。

## ブラックリストエントリの TTL

ブラックリストエントリは永続的に存在するわけではありません。`Revoke` は書き込み時にトークンの `exp` に基づきエントリの生存時間（TTL）を計算し、トークンの期限切れ後にエントリも失効してクリーンアップされます。3 つのケースは以下の通りです：

- **トークンに `exp` クレームがある** —— TTL は `exp` に対応する残存時間と等しく、エントリはトークンと同期して失効します。これが最も一般的なケースです。
- **トークンに `exp` クレームがない** —— TTL はデフォルトで **7 日**となり、無期限トークンがエントリを恒久的に占有するのを防ぎます。
- **TTL の上限は 30 日** —— トークンの `exp` が 100 年後であっても、ブラックリストエントリは最大 30 日しか生存できません。

:::warning 30 日上限は DoS 防護
30 日の上限は重要な防御線です。上限がないと、攻撃者は超長 `exp` のトークン（または合法的な長期間トークンを悪用）をバッチ失効させ、ブラックリストストアを膨張させてメモリを枯渇させることができます。30 日上限により、単一レコードの生存時間に上限が設けられ、ストアの規模は常に制御可能です。
:::

さらに、**期限切れのトークンも失効可能です**：`Revoke` は `exp`/`nbf` をチェックしないため、トークン期限切れ後に事後失効できます（例：事後監査でリスクを発見した場合）。このようなエントリの TTL はデフォルトの 7 日となり、その後バックグラウンドのクリーンアップ機構で回収されます。

## 内蔵メモリストア

デフォルトでメモリストアを使用し、すぐに利用可能です：

```go
cfg := jwt.DefaultConfig()
cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
// ブラックリストは自動的に有効、DefaultBlacklistConfig() を使用
```

### 設定項目

```go
cfg.Blacklist.CleanupInterval = 5 * time.Minute  // クリーンアップ間隔
cfg.Blacklist.MaxSize = 100000                     // 最大エントリ数
cfg.Blacklist.EnableAutoCleanup = true             // 自動クリーンアップ
```

| フィールド | デフォルト値 | 説明 |
|-----------|-------------|------|
| `CleanupInterval` | `5m` | 期限切れエントリのクリーンアップ間隔 |
| `MaxSize` | `100000` | 最大エントリ数 |
| `EnableAutoCleanup` | `true` | 自動クリーンアップ（強制的に true） |

:::tip 自動クリーンアップ
内蔵ストアの `EnableAutoCleanup` は常に `true` に強制され、メモリの無限増加を防止します。
:::

### エビクション動作

エントリ数が `MaxSize` に達すると、新規エントリの書き込みが**エビクション**をトリガーし、以下の順序で空間を確保します：

| ステップ | 動作 | 説明 |
|---------|------|------|
| 1 | 期限切れエントリのクリーンアップ | まずすべての期限切れレコードを削除 |
| 2 | 最早期限切れエントリのエビクション | それでも満杯の場合、`exp` の昇順で約 10%（最低 1 個）の最早期限切れエントリをエビクション |
| 3 | 書き込み拒否 | それでも満杯の場合、`Add` がエラーを返し、`Revoke` はそれに従い失敗を返す |

このように `MaxSize` は「満杯で停止」ではなく、圧力下で最も消すべきエントリ（期限切れ、最早期限切れ）を優先的に淘汰します。ただし極端なケースでは失効が失敗する可能性があります——本番環境ではピーク失効量に応じて `MaxSize` を大きくするか、外部ストアの使用を推奨します。

## トークンの失効

```go
// 失効
err := processor.Revoke(accessToken)
if err != nil {
    panic(err)
}

// 確認
revoked, err := processor.IsRevoked(accessToken)
fmt.Println("Revoked:", revoked) // true

// 失効したトークンの検証は失敗する
_, _, err = processor.Validate(accessToken)
// err → jwt.ErrTokenRevoked
```

## カスタムストアバックエンド

[`BlacklistStore`](../api-reference/interfaces#blackliststore) インターフェースを実装して外部ストア（Redis、データベースなど）に接続します：

```go
type BlacklistStore interface {
    Add(tokenID string, expiresAt time.Time) error
    Contains(tokenID string) (bool, error)
    Close() error
}
```

### Redis の例

```go
type RedisStore struct {
    client *redis.Client
}

func (s *RedisStore) Add(tokenID string, expiresAt time.Time) error {
    ttl := time.Until(expiresAt)
    if ttl <= 0 {
        return nil // 期限切れのトークンは保存不要
    }
    return s.client.Set(ctx, "blacklist:"+tokenID, "1", ttl).Err()
}

func (s *RedisStore) Contains(tokenID string) (bool, error) {
    n, err := s.client.Exists(ctx, "blacklist:"+tokenID).Result()
    return n > 0, err
}

func (s *RedisStore) Close() error {
    return s.client.Close()
}
```

カスタムストアの使用：

```go
cfg.Blacklist.Store = &RedisStore{client: rdb}
```

:::tip TTL 最適化
`time.Until(expiresAt)` を Redis TTL として使用すると、トークンの有効期限後にブラックリストから自動的に削除され、追加のクリーンアップが不要になります。
:::

### Close() の責務

`Processor.Close()` はクローズ時に**カスケード呼び出し**で `BlacklistStore.Close()` を呼び出します——ブラックリストストアを手動でクローズする必要はなく、プロセッサーをクローズするだけで済みます。カスタムストアの `Close()` 実装ではすべての基盤リソースを解放する必要があります：

- Redis / データベース接続のクローズ
- バックグラウンド goroutine と ticker の停止
- ファイルハンドルなどの解放

上記の Redis 例の `s.client.Close()` は接続プールのクリーンアップを完了させます。`Close()` は**冪等**であるべきです——重複呼び出しでエラーを返さないようにします（内蔵ストアの実装はこの規約に従っており、2 回目の呼び出しは直接 `nil` を返します）。

:::tip カスタムストアは CleanupInterval / MaxSize の制約を受けない
`BlacklistConfig` の `CleanupInterval`、`MaxSize`、`EnableAutoCleanup` は**内蔵メモリストアにのみ有効**です。`Store` フィールドを設定してカスタムバックエンドに切り替えると、これら 3 つのフィールドは完全に無視されます——期限切れクリーンアップや容量上限などはストアバックエンドが自行で責任を負う必要があります（Redis の TTL、データベースの定期タスクなど）。
:::

## 本番環境での推奨事項

:::warning マルチインスタンスはブラックリスト共有が必須
内蔵メモリストアは**プロセス間で共有されません**。サービスを複数インスタンス（Pod / コンテナ / サーバー）でデプロイする場合、あるインスタンスで失効させたトークンが他のインスタンスでは依然として許可されてしまいます——ユーザーがログアウト後に別インスタンスではログイン中とみなされます。マルチインスタンスシーンでは Redis、データベースなどの**共有ストア**を `BlacklistStore` として使用し、すべてのインスタンスが同一のブラックリストを読み書きすることを保証する必要があります。
:::

:::tip ブラックリスト規模の監視
ブラックリストはエントリが TTL で期限切れになるまで失効レコードを継続的に蓄積します。ストアサイズ（メモリストアのエントリ数、Redis のキー数）を監視し、異常な増加にアラートを出すことを推奨します——急増はバッチ失効（セキュリティインシデントなど）や TTL の長期化を意味することが多いです。`MaxSize` をピーク失効量よりやや高く設定することで、エビクションによる失効失敗を回避できます。
:::

:::tip 短 TTL トークンにはブラックリストが不要な場合も
アクセストークン自体の有効期限が短い場合（例：15 分）、ユーザーが「ログアウト」するとトークンは数分後に自然に期限切れするため、通常はブラックリストを維持する**価値がありません**——ブラックリストのコスト（ストレージ + 毎回の検証で 1 回多くクエリ）が利益を上回る可能性があります。ブラックリストは**長期間トークン**（長期間 access token、refresh token）の失効により適しています。短 TTL のシーンでは refresh token のみにブラックリストを有効にすることを検討してください。
:::

:::warning その他の注意事項
- カスタムストアの実装ではネットワークタイムアウトとリトライを処理し、外部ストアの変動による検証チェーンのブロックを避けること
- `MaxSize` の上限に達すると、新しく失効させたトークンが最も古いエントリを押し出す（上文「内蔵メモリストア」を参照）
:::

## 次のステップ

- [API リファレンス → BlacklistStore](../api-reference/interfaces#blackliststore) — インターフェース定義
- [API リファレンス → BlacklistConfig](../api-reference/config#blacklistconfig) — 設定フィールド
- [API リファレンス → Revoke](../api-reference/processor#revoke) — 失効メソッド
- [高度なサンプル](../examples/advanced) — Redis ブラックリストの例
