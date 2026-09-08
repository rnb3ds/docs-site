---
sidebar_label: "직렬화"
title: "직렬화 - CyberGo env | 다중 형식 변환"
description: "CyberGo env 직렬화 가이드로, .env, JSON, YAML 간의 Map과 구조체 변환을 설명합니다. Marshal/Unmarshal 함수군, 커스텀 인터페이스, DetectFormat 자동 감지와 구성 내보내기, 형식 마이그레이션 시나리오를 다룹니다."
sidebar_position: 4
sidebar_icon: "🔧"
---

# 직렬화

Marshal 및 Unmarshal 기능을 사용하여 환경 변수를 직렬화/역직렬화하며, `.env`, JSON, YAML 형식 변환을 지원합니다.

## 기본 직렬화

### Map 직렬화

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

    // .env 형식으로 직렬화
    result, err := env.Marshal(data, env.FormatEnv)
    if err != nil {
        panic(err)
    }

    fmt.Println(result)
    // 출력:
    // APP_NAME=my-app
    // APP_VERSION=1.0.0
    // DEBUG=true
}
```

### JSON 형식

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

    // JSON으로 직렬화
    result, err := env.Marshal(data, env.FormatJSON)
    if err != nil {
        panic(err)
    }

    fmt.Println(result)
    // 출력:
    // {
    //   "HOST": "localhost",
    //   "PORT": 8080
    // }
}
```

### YAML 형식

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

    // YAML로 직렬화
    result, err := env.Marshal(data, env.FormatYAML)
    if err != nil {
        panic(err)
    }

    fmt.Println(result)
    // 출력:
    // DATABASE_HOST: localhost
    // DATABASE_NAME: myapp
    // DATABASE_PORT: 5432
}
```

## 구조체 직렬화

### 기본 직렬화

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

    // 구조체를 .env 형식으로 직렬화
    result, err := env.Marshal(cfg, env.FormatEnv)
    if err != nil {
        panic(err)
    }

    fmt.Println(result)
    // 출력:
    // DEBUG=true
    // HOST=localhost
    // PORT=8080
}
```

### 중첩 구조체

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

### MarshalStruct 함수

구조체를 `map[string]string`으로 변환합니다:

```go
func MarshalStruct(v any) (map[string]string, error)
```

**매개변수:**
- `v` - 구조체 포인터 또는 값

**반환값:**
- `map[string]string` - 환경 변수 매핑
- `error` - 직렬화 오류

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

    // map으로 변환
    data, err := env.MarshalStruct(cfg)
    if err != nil {
        panic(err)
    }

    fmt.Printf("%+v\n", data)
    // 출력: map[DEBUG:true HOST:localhost PORT:8080]

    // 파일로 내보내기에 사용 가능
    content, _ := env.Marshal(data, env.FormatEnv)
    fmt.Println(content)
}
```

## 역직렬화

### Map 역직렬화

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

func main() {
    // .env 형식 문자열
    data := `
HOST=localhost
PORT=8080
DEBUG=true
`

    // map으로 역직렬화
    result, err := env.UnmarshalMap(data, env.FormatEnv)
    if err != nil {
        panic(err)
    }

    fmt.Printf("%+v\n", result)
    // 출력: map[DEBUG:true HOST:localhost PORT:8080]
}
```

### JSON 역직렬화

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

### YAML 역직렬화

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

## 구조체 역직렬화

### Map에서 역직렬화

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
    // 출력: {Host:example.com Port:443}
}
```

### 문자열에서 역직렬화

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

## 커스텀 직렬화

:::tip 두 가지 커스텀 인터페이스의 적용 범위
- **필드 수준**: 구조체 필드의 커스텀 인코딩/디코딩, 표준 라이브러리 `encoding.TextMarshaler` / `encoding.TextUnmarshaler`(`MarshalText()` / `UnmarshalText([]byte)`) 구현. 구조체가 `env.Marshal`/`env.UnmarshalInto`로 처리될 때 필드별 로직이 이 두 인터페이스를 인식합니다.
- **최상위**: `env.Marshaler`(`MarshalEnv()`)와 `env.Unmarshaler`(`UnmarshalEnv(map[string]string)`) 인터페이스는 `env.Marshal`/`env.MarshalStruct`/`env.UnmarshalInto`에 **직접** 전달된 최상위 값에서만 작동합니다. 해당 타입을 필드로 포함하는 외부 구조체를 전달하면 호출되지 않습니다.
:::

### 필드 수준: encoding.TextMarshaler 구현

```go
package main

import (
    "fmt"
    "strings"

    "github.com/cybergodev/env"
)

type LogLevel string

// encoding.TextMarshaler 구현 — 구조체 필드로 직렬화될 때 호출됨
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
    // 출력: LOG_LEVEL=DEBUG
}
```

### 필드 수준: encoding.TextUnmarshaler 구현

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

type LogLevel string

// encoding.TextUnmarshaler 구현 — 구조체 필드로 역직렬화될 때 호출됨
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
    // 출력: Level: info
}
```

### 최상위: env.Marshaler / env.Unmarshaler 구현

타입의 값을 `env.Marshal` / `env.UnmarshalInto`에 **직접** 전달할 때(외부 구조체의 필드가 아닌), `env.Marshaler` / `env.Unmarshaler` 인터페이스가 해당 최상위 값에서 작동합니다:

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

// 최상위 타입이 env.Marshaler를 직접 구현
type EnvBlob string

func (e EnvBlob) MarshalEnv() ([]byte, error) {
    // 커스텀 전체 직렬화 출력
    return []byte("APP_NAME=custom\nAPP_VERSION=2.0.0"), nil
}

func main() {
    // 최상위 값 직접 직렬화(외부 구조체의 필드가 아님)
    result, err := env.Marshal(EnvBlob(""), env.FormatEnv)
    if err != nil {
        panic(err)
    }

    fmt.Println(result)
    // 출력:
    // APP_NAME=custom
    // APP_VERSION=2.0.0
}
```

## 형식 감지

### 자동 형식 감지

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

func main() {
    // 자동 형식 감지
    format := env.DetectFormat("config.json")
    fmt.Println(format.String()) // json

    format = env.DetectFormat("settings.yaml")
    fmt.Println(format.String()) // yaml

    format = env.DetectFormat(".env")
    fmt.Println(format.String()) // dotenv

    // FormatAuto로 자동 감지 사용
    data := `{"KEY": "value"}`
    result, _ := env.UnmarshalMap(data, env.FormatAuto)
    fmt.Println(result)
}
```

## 실용 시나리오

### 구성을 파일로 저장

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

    // 직렬화
    content, err := env.Marshal(cfg, env.FormatEnv)
    if err != nil {
        panic(err)
    }

    // 파일에 쓰기
    err = os.WriteFile(".env", []byte(content), 0644)
    if err != nil {
        panic(err)
    }
}
```

### 현재 환경 내보내기

```go
package main

import (
    "fmt"
    "os"
    "github.com/cybergodev/env"
)

func main() {
    env.Load(".env")

    // 모든 환경 변수 가져오기
    all := env.All()

    // JSON으로 내보내기
    content, err := env.Marshal(all, env.FormatJSON)
    if err != nil {
        panic(err)
    }

    fmt.Println(content)

    // 또는 파일에 쓰기
    os.WriteFile("env-export.json", []byte(content), 0644)
}
```

### 구성 마이그레이션

```go
package main

import (
    "fmt"
    "os"
    "github.com/cybergodev/env"
)

func main() {
    // JSON 구성 읽기
    jsonContent, _ := os.ReadFile("config.json")

    // JSON 파싱
    data, err := env.UnmarshalMap(string(jsonContent), env.FormatJSON)
    if err != nil {
        panic(err)
    }

    // .env 형식으로 변환
    envContent, err := env.Marshal(data, env.FormatEnv)
    if err != nil {
        panic(err)
    }

    // .env 파일로 저장
    os.WriteFile(".env", []byte(envContent), 0644)

    fmt.Println("Config migrated from JSON to .env")
}
```

## 라운드트립 함정과 형식 자동 감지

### `$`는 이스케이프되지 않음: Marshal 출력을 다시 읽으면 변형될 수 있음

`Marshal`은 값의 `$`를 이스케이프하지 **않습니다**. 값에 `$VAR` 또는 `${VAR}` 리터럴이 포함된 경우, 기본값으로 활성화된 `ExpandVariables` 상태에서 Marshal 출력을 다시 파싱하면 해당 시퀀스가 변수 참조로 전개됩니다:

```go
package main

import (
    "fmt"

    "github.com/cybergodev/env"
)

func main() {
    data := map[string]string{"PRICE": "100$USD"}

    out, err := env.Marshal(data, env.FormatEnv)
    if err != nil {
        panic(err)
    }
    fmt.Println(out)
    // 출력: PRICE=100$USD
    // 참고: `out`을 .env에 다시 쓰고 기본 설정으로 로드하면 $USD 전개 시도
}
```

완화 방법: 읽는 쪽에서 `cfg.ExpandVariables = false` 설정, 또는 `$`를 포함한 값의 `Marshal` 라운드트립 자체를 피하기.

### MarshalStruct 필드 처리

구조체를 마샬링할 때 빈 문자열로 마샬링되는 필드는 **생략**됩니다(빈 문자열, nil 포인터, 빈 슬라이스); 스칼라 영값(`0`, `false`)은 **유지**됩니다 — 빈 문자열로 마샬링되지 않기 때문입니다. 읽는 쪽에서 `envDefault` 태그로 기본값을 보정하세요.

### 정렬된 키 보장

`Marshal`의 출력 키는 입력 map/구조체 필드 순서와 무관하게 **항상 사전순으로 정렬**됩니다 — 동일한 구성의 출력이 안정적이어서 diff와 캐싱에 적합합니다.

### FormatAuto 콘텐츠 감지 규칙

`UnmarshalMap`/`UnmarshalStruct`에 `FormatAuto`를 전달하면 확장자가 아닌 **콘텐츠**로 형식을 감지합니다:

| 신호 | 판정 |
|------|------|
| 공백만 있는 입력 | `.env` |
| 첫 글자가 `{` 또는 `[` | JSON |
| 첫 유효 행이 `- `로 시작하거나 `: `(콜론+공백) 포함 | YAML |
| `=` 포함 | `.env` |

`: `가 `=`보다 우선한다는 점에 유의: `connection: host=db port=5432` 형태의 행은 `.env`가 아닌 YAML로 판정됩니다.

### IsMarshalError 보조 판별

<!-- check-code: skip -->
```go
if _, err := env.Marshal(data); err != nil {
    if env.IsMarshalError(err) {
        // 마샬링 오류: 지원하지 않는 입력 타입 또는 필드 변환 실패
    }
}
```

## 관련 문서

- [패키지 함수](/ko/env/api-reference/functions) - Marshal, UnmarshalMap 등 함수 레퍼런스
- [다중 포맷 설정](/ko/env/guides/multi-format) - 다중 형식 로드 가이드
- [구조체 매핑](/ko/env/guides/struct-mapping) - 구조체 매핑 가이드
