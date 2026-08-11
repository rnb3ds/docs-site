---
sidebar_label: "シリアライズ"
title: "シリアライズ - CyberGo env | マルチフォーマット変換"
description: "CyberGo env シリアライズガイド。.env、JSON、YAML 間の Map と構造体変換を詳解。Marshal/Unmarshal 関数ファミリー、Marshaler/Unmarshaler カスタムインターフェース、DetectFormat 自動検出を含み、設定エクスポートやフォーマット移行などの実用シーンをカバー。"
sidebar_position: 2
sidebar_icon: "🔧"
---

# シリアライズ

Marshal と Unmarshal 機能で環境変数をシリアライズ/デシリアライズし、`.env`、JSON、YAML フォーマット変換をサポートします。

## 基本的なシリアライズ

### Map のシリアライズ

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

func main() {
    data := map[string]string{
        "APP_NAME":    "my-app",
        "APP_VERSION": "1.0.0",
        "DEBUG":       "true",
    }

    // .env フォーマットにシリアライズ
    result, err := env.Marshal(data, env.FormatEnv)
    if err != nil {
        panic(err)
    }

    fmt.Println(result)
    // 出力：
    // APP_NAME=my-app
    // APP_VERSION=1.0.0
    // DEBUG=true
}
```

### JSON フォーマット

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

func main() {
    data := map[string]string{
        "HOST": "localhost",
        "PORT": "8080",
    }

    // JSON にシリアライズ
    result, err := env.Marshal(data, env.FormatJSON)
    if err != nil {
        panic(err)
    }

    fmt.Println(result)
    // 出力：
    // {
    //   "HOST": "localhost",
    //   "PORT": 8080
    // }
}
```

### YAML フォーマット

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

func main() {
    data := map[string]string{
        "DATABASE_HOST": "localhost",
        "DATABASE_PORT": "5432",
        "DATABASE_NAME": "myapp",
    }

    // YAML にシリアライズ
    result, err := env.Marshal(data, env.FormatYAML)
    if err != nil {
        panic(err)
    }

    fmt.Println(result)
    // 出力：
    // DATABASE_HOST: localhost
    // DATABASE_NAME: myapp
    // DATABASE_PORT: 5432
}
```

## 構造体のシリアライズ

### 基本的なシリアライズ

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

type Config struct {
    Host string `env:"HOST"`
    Port int64  `env:"PORT"`
    Debug bool  `env:"DEBUG"`
}

func main() {
    cfg := Config{
        Host:  "localhost",
        Port:  8080,
        Debug: true,
    }

    // 構造体を .env フォーマットにシリアライズ
    result, err := env.Marshal(cfg, env.FormatEnv)
    if err != nil {
        panic(err)
    }

    fmt.Println(result)
    // 出力：
    // DEBUG=true
    // HOST=localhost
    // PORT=8080
}
```

### ネストした構造体

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

type DatabaseConfig struct {
    Host string `env:"DB_HOST"`
    Port int64  `env:"DB_PORT"`
}

type AppConfig struct {
    Name     string         `env:"APP_NAME"`
    Database DatabaseConfig
}

func main() {
    cfg := AppConfig{
        Name: "my-app",
        Database: DatabaseConfig{
            Host: "localhost",
            Port: 5432,
        },
    }

    result, err := env.Marshal(cfg, env.FormatEnv)
    if err != nil {
        panic(err)
    }

    fmt.Println(result)
}
```

### MarshalStruct 関数

構造体を `map[string]string` に変換します：

```go
func MarshalStruct(v any) (map[string]string, error)
```

**パラメータ：**
- `v` - 構造体ポインタまたは値

**戻り値：**
- `map[string]string` - 環境変数マッピング
- `error` - シリアライズエラー

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

type Config struct {
    Host string `env:"HOST"`
    Port int64  `env:"PORT"`
    Debug bool  `env:"DEBUG"`
}

func main() {
    cfg := Config{
        Host:  "localhost",
        Port:  8080,
        Debug: true,
    }

    // map に変換
    data, err := env.MarshalStruct(cfg)
    if err != nil {
        panic(err)
    }

    fmt.Printf("%+v\n", data)
    // 出力：map[DEBUG:true HOST:localhost PORT:8080]

    // ファイルへエクスポートに使用可能
    content, _ := env.Marshal(data, env.FormatEnv)
    fmt.Println(content)
}
```

## デシリアライズ

### Map のデシリアライズ

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

func main() {
    // .env フォーマット文字列
    data := `
HOST=localhost
PORT=8080
DEBUG=true
`

    // map にデシリアライズ
    result, err := env.UnmarshalMap(data, env.FormatEnv)
    if err != nil {
        panic(err)
    }

    fmt.Printf("%+v\n", result)
    // 出力：map[DEBUG:true HOST:localhost PORT:8080]
}
```

### JSON のデシリアライズ

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

func main() {
    jsonData := `{
        "API_KEY": "secret123",
        "API_URL": "https://api.example.com",
        "TIMEOUT": "30"
    }`

    result, err := env.UnmarshalMap(jsonData, env.FormatJSON)
    if err != nil {
        panic(err)
    }

    fmt.Printf("%+v\n", result)
}
```

### YAML のデシリアライズ

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

func main() {
    yamlData := `
DATABASE_HOST: localhost
DATABASE_PORT: "5432"
DATABASE_USER: postgres
`

    result, err := env.UnmarshalMap(yamlData, env.FormatYAML)
    if err != nil {
        panic(err)
    }

    fmt.Printf("%+v\n", result)
}
```

## 構造体のデシリアライズ

### Map からのデシリアライズ

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

type Config struct {
    Host string `env:"HOST"`
    Port int64  `env:"PORT"`
}

func main() {
    data := map[string]string{
        "HOST": "example.com",
        "PORT": "443",
    }

    var cfg Config
    err := env.UnmarshalInto(data, &cfg)
    if err != nil {
        panic(err)
    }

    fmt.Printf("%+v\n", cfg)
    // 出力：{Host:example.com Port:443}
}
```

### 文字列からのデシリアライズ

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

type ServerConfig struct {
    Host    string `env:"SERVER_HOST"`
    Port    int64  `env:"SERVER_PORT"`
    Enabled bool   `env:"ENABLED"`
}

func main() {
    envData := `
SERVER_HOST=0.0.0.0
SERVER_PORT=8080
ENABLED=true
`

    var cfg ServerConfig
    err := env.UnmarshalStruct(envData, &cfg, env.FormatEnv)
    if err != nil {
        panic(err)
    }

    fmt.Printf("%+v\n", cfg)
}
```

## カスタムシリアライズ

::: tip 2 つのカスタムインターフェースの有効範囲
- **フィールドレベル**：構造体フィールドのカスタムエンコード/デコード、標準ライブラリ `encoding.TextMarshaler` / `encoding.TextUnmarshaler`（`MarshalText()` / `UnmarshalText([]byte)`）を実装。構造体が `env.Marshal`/`env.UnmarshalInto` で処理される際、フィールドごとのロジックがこの 2 つのインターフェースを認識します。
- **最上位**：`env.Marshaler`（`MarshalEnv()`）と `env.Unmarshaler`（`UnmarshalEnv(map[string]string)`）インターフェースは**`env.Marshal`/`env.MarshalStruct`/`env.UnmarshalInto` に直接渡された最上位の値でのみ有効**；その型のフィールドを含む外側の構造体を渡した場合は呼び出されません。
:::

### フィールドレベル：encoding.TextMarshaler の実装

```go
package main

import (
    "fmt"
    "strings"

    "github.com/cybergodev/env"
)

type LogLevel string

// encoding.TextMarshaler を実装 —— 構造体フィールドとしてシリアライズ時に呼び出される
func (l LogLevel) MarshalText() ([]byte, error) {
    return []byte(strings.ToUpper(string(l))), nil
}

type LogConfig struct {
    Level LogLevel `env:"LOG_LEVEL"`
}

func main() {
    cfg := LogConfig{
        Level: LogLevel("debug"),
    }

    result, err := env.Marshal(cfg, env.FormatEnv)
    if err != nil {
        panic(err)
    }

    fmt.Println(result)
    // 出力：LOG_LEVEL=DEBUG
}
```

### フィールドレベル：encoding.TextUnmarshaler の実装

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

type LogLevel string

// encoding.TextUnmarshaler を実装 —— 構造体フィールドとしてデシリアライズ時に呼び出される
func (l *LogLevel) UnmarshalText(text []byte) error {
    switch string(text) {
    case "debug", "info", "warn", "error":
        *l = LogLevel(text)
        return nil
    default:
        return fmt.Errorf("invalid log level: %s", string(text))
    }
}

type LogConfig struct {
    Level LogLevel `env:"LOG_LEVEL"`
}

func main() {
    data := map[string]string{
        "LOG_LEVEL": "info",
    }

    var cfg LogConfig
    err := env.UnmarshalInto(data, &cfg)
    if err != nil {
        panic(err)
    }

    fmt.Printf("Level: %s\n", cfg.Level)
    // 出力：Level: info
}
```

### 最上位：env.Marshaler / env.Unmarshaler の実装

ある型の値を**直接** `env.Marshal` / `env.UnmarshalInto` に渡す場合（外側の構造体のフィールドとしてではなく）、`env.Marshaler` / `env.Unmarshaler` インターフェースがその最上位の値で有効になります：

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

// 最上位の型が直接 env.Marshaler を実装
type EnvBlob string

func (e EnvBlob) MarshalEnv() ([]byte, error) {
    // カスタム全体シリアライズ出力
    return []byte("APP_NAME=custom\nAPP_VERSION=2.0.0"), nil
}

func main() {
    // 最上位の値を直接シリアライズ（外側構造体のフィールドではない）
    result, err := env.Marshal(EnvBlob(""), env.FormatEnv)
    if err != nil {
        panic(err)
    }

    fmt.Println(result)
    // 出力：
    // APP_NAME=custom
    // APP_VERSION=2.0.0
}
```

## フォーマット検出

### フォーマットの自動検出

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

func main() {
    // フォーマットを自動検出
    format := env.DetectFormat("config.json")
    fmt.Println(format.String()) // json

    format = env.DetectFormat("settings.yaml")
    fmt.Println(format.String()) // yaml

    format = env.DetectFormat(".env")
    fmt.Println(format.String()) // dotenv

    // FormatAuto で自動検出を使用
    data := `{"KEY": "value"}`
    result, _ := env.UnmarshalMap(data, env.FormatAuto)
    fmt.Println(result)
}
```

## 実用シーン

### 設定をファイルに保存

```go
package main

import (
    "os"
    "github.com/cybergodev/env"
)

func main() {
    cfg := map[string]string{
        "HOST": "localhost",
        "PORT": "8080",
    }

    // シリアライズ
    content, err := env.Marshal(cfg, env.FormatEnv)
    if err != nil {
        panic(err)
    }

    // ファイルに書き込み
    err = os.WriteFile(".env", []byte(content), 0644)
    if err != nil {
        panic(err)
    }
}
```

### 現在の環境をエクスポート

```go
package main

import (
    "fmt"
    "os"
    "github.com/cybergodev/env"
)

func main() {
    env.Load(".env")

    // すべての環境変数を取得
    all := env.All()

    // JSON でエクスポート
    content, err := env.Marshal(all, env.FormatJSON)
    if err != nil {
        panic(err)
    }

    fmt.Println(content)

    // またはファイルに書き込み
    os.WriteFile("env-export.json", []byte(content), 0644)
}
```

### 設定の移行

```go
package main

import (
    "fmt"
    "os"
    "github.com/cybergodev/env"
)

func main() {
    // JSON 設定を読み込み
    jsonContent, _ := os.ReadFile("config.json")

    // JSON を解析
    data, err := env.UnmarshalMap(string(jsonContent), env.FormatJSON)
    if err != nil {
        panic(err)
    }

    // .env フォーマットに変換
    envContent, err := env.Marshal(data, env.FormatEnv)
    if err != nil {
        panic(err)
    }

    // .env ファイルとして保存
    os.WriteFile(".env", []byte(envContent), 0644)

    fmt.Println("Config migrated from JSON to .env")
}
```

## 関連ドキュメント

- [パッケージ関数](/ja/env/api-reference/functions) - Marshal、UnmarshalMap などの関数リファレンス
- [マルチフォーマット設定](/ja/env/guides/multi-format) - マルチフォーマット読み込みガイド
- [構造体マッピング](/ja/env/guides/struct-mapping) - 構造体マッピングガイド
