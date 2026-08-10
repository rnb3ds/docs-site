---
sidebar_label: "파일 I/O"
title: "파일 작업 함수 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON 파일 작업 함수: LoadFromFile/SaveToFile 읽기/쓰기, LoadFromReader/SaveToWriter 스트리밍 I/O, MarshalToFile/UnmarshalFromFile 직렬화를 지원합니다."
sidebar_position: 9
---

# 파일 작업 함수

json 패키지가 제공하는 파일 작업 함수로, 파일 읽기/쓰기, 스트리밍 I/O 및 타입화 직렬화를 지원합니다. 모든 파일 경로는 읽기/쓰기 전에 보안 검증을 거칩니다 ([파일 경로 검증](#보안-파일-경로-검증) 참조).

## 파일 읽기/쓰기

### LoadFromFile

시그니처: `func LoadFromFile(filePath string, cfg ...Config) (string, error)`

파일에서 JSON 데이터를 로드하여 **원시 문자열**을 반환합니다 (재인코딩하지 않고 파일의 바이트 순서와 공백을 보존). 파일 크기는 `Config.MaxJSONSize` 의 제한을 받습니다.

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `filePath` | `string` | 예 | 파일 경로 (보안 검증을 통과해야 함) |
| `cfg` | `Config` | 아니오 | 선택적 설정 (예: `MaxJSONSize` 강화) |

```go
data, err := json.LoadFromFile("config.json")
if err != nil {
    panic(err)
}
fmt.Println(data) // 원시 JSON 문자열
```

### SaveToFile

시그니처: `func SaveToFile(filePath string, data any, cfg ...Config) error`

데이터를 JSON 파일로 저장합니다. 존재하지 않는 상위 디렉토리를 자동으로 생성합니다; **원자적 쓰기**를 채택합니다 (먼저 임시 파일에 쓴 뒤 rename, 충돌로 기존 파일이 잘리지 않음). 문자열 / `[]byte` 입력은 이중 이스케이프를 방지하기 위해 사전 파싱됩니다.

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `filePath` | `string` | 예 | 파일 경로 (보안 검증을 통과해야 함) |
| `data` | `any` | 예 | 저장할 데이터 (Go 값 또는 JSON 문자열) |
| `cfg` | `Config` | 아니오 | 선택적 설정 (예: `PrettyConfig()` 로 출력 포맷팅) |

```go
// 컴팩트 저장 (기본값)
err := json.SaveToFile("output.json", map[string]any{
    "name": "Alice",
    "age":  30,
})

// 포맷팅 저장
err = json.SaveToFile("output.json", data, json.PrettyConfig())
```

**전체 예제: SaveToFile + LoadFromFile 라운드트립**

```go
package main

import (
    "fmt"
    "os"

    "github.com/cybergodev/json"
)

func main() {
    // 임시 파일 생성, 예제가 독립적으로 실행되도록 보장
    tmp, err := os.CreateTemp("", "cybergo-*.json")
    if err != nil {
        panic(err)
    }
    path := tmp.Name()
    tmp.Close()
    defer os.Remove(path)

    // 쓰기: map 은 키명으로 정렬하여 인코딩
    err = json.SaveToFile(path, map[string]any{"name": "Alice", "age": 30})
    if err != nil {
        panic(err)
    }

    // 읽기: 파일의 원시 내용 반환
    data, err := json.LoadFromFile(path)
    if err != nil {
        panic(err)
    }
    fmt.Println(data)
    // 출력：{"age":30,"name":"Alice"}
}
```

## 스트리밍 I/O

### LoadFromReader

시그니처: `func LoadFromReader(reader io.Reader, cfg ...Config) (string, error)`

`io.Reader` 에서 JSON 데이터를 로드하여 원시 문자열을 반환합니다. 읽는 바이트 수는 `Config.MaxJSONSize` 의 제한을 받으며 (메모리 고갈 방지), 네트워크 연결, HTTP 응답 본문, 파이프 등 스트리밍 데이터 소스에 적합합니다.

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `reader` | `io.Reader` | 예 | 데이터 소스 |
| `cfg` | `Config` | 아니오 | 선택적 설정 |

```go
// HTTP 응답 본문에서 읽기
resp, _ := http.Get("https://api.example.com/data")
defer resp.Body.Close()
data, err := json.LoadFromReader(resp.Body)

// 문자열에서 읽기
data, err = json.LoadFromReader(strings.NewReader(`{"name":"test"}`))
```

**전체 예제: strings.Reader 와 os.File 에서 읽기**

```go
package main

import (
    "fmt"
    "strings"

    "github.com/cybergodev/json"
)

func main() {
    // strings.Reader 에서 읽기 (원시 내용이 그대로 반환)
    reader := strings.NewReader(`{"name":"Alice","age":30}`)
    data, err := json.LoadFromReader(reader)
    if err != nil {
        panic(err)
    }
    fmt.Println(data)
    // 출력：{"name":"Alice","age":30}
}
```

`os.File` 에서 읽을 때도 사용법이 동일합니다 — `os.File` 은 `io.Reader` 를 구현합니다:

```go
file, err := os.Open("data.json")
if err != nil {
    panic(err)
}
defer file.Close()

data, err := json.LoadFromReader(file)
```

### SaveToWriter

시그니처: `func SaveToWriter(writer io.Writer, data any, cfg ...Config) error`

데이터를 JSON 으로 인코딩하여 `io.Writer` 에 씁니다. `SaveToFile` 과 마찬가지로 문자열 / `[]byte` 입력에 사전 파싱을 하여 이중 이스케이프를 방지하지만, **파일 경로 검증은 하지 않습니다** (대상은 호출자가 제어).

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `writer` | `io.Writer` | 예 | 출력 대상 |
| `data` | `any` | 예 | 쓸 데이터 |
| `cfg` | `Config` | 아니오 | 선택적 설정 |

```go
var buf bytes.Buffer
err := json.SaveToWriter(&buf, map[string]any{"name": "test"}, json.PrettyConfig())
```

**전체 예제: bytes.Buffer 에 쓰기**

```go
package main

import (
    "bytes"
    "fmt"

    "github.com/cybergodev/json"
)

func main() {
    var buf bytes.Buffer
    err := json.SaveToWriter(&buf, map[string]any{"name": "Alice", "age": 30}, json.PrettyConfig())
    if err != nil {
        panic(err)
    }
    fmt.Print(buf.String())
    // 출력：
    // {
    //   "age": 30,
    //   "name": "Alice"
    // }
}
```

`os.File` 에 쓸 때도 마찬가지입니다 — 파일 핸들을 전달하면 됩니다.

## 직렬화 편의 메서드

### MarshalToFile

시그니처: `func MarshalToFile(filePath string, data any, cfg ...Config) error`

데이터를 JSON 으로 직렬화하여 파일에 씁니다. `SaveToFile` 과의 차이: `MarshalToFile` 은 `Marshal` / `MarshalIndent` 를 직접 호출합니다 (문자열 사전 파싱 없음), 구조체, map 등 Go 값을 쓰는 데 적합; `SaveToFile` 은 입력이 이미 JSON 문자열 / `[]byte` 일 수 있는 시나리오에 적합. 둘 다 상위 디렉토리를 자동으로 생성하고 원자적으로 씁니다.

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `filePath` | `string` | 예 | 파일 경로 |
| `data` | `any` | 예 | 직렬화할 데이터 |
| `cfg` | `Config` | 아니오 | 선택적 설정 (`PrettyConfig()` 로 들여쓰기 출력 생성) |

```go
err := json.MarshalToFile("data.json", myStruct)
err = json.MarshalToFile("data.json", myStruct, json.PrettyConfig())
```

### UnmarshalFromFile

시그니처: `func UnmarshalFromFile(filePath string, v any, cfg ...Config) error`

파일에서 JSON 을 읽어 대상 변수로 역직렬화합니다. "파일 읽기 + `Unmarshal`" 의 편리한 조합이며, 읽기 과정은 `MaxJSONSize` 의 제한을 받습니다.

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `filePath` | `string` | 예 | 파일 경로 |
| `v` | `any` | 예 | 대상 객체 포인터 |
| `cfg` | `Config` | 아니오 | 선택적 설정 |

```go
var config MyConfig
err := json.UnmarshalFromFile("config.json", &config)
```

**전체 예제: MarshalToFile + UnmarshalFromFile 구조체 라운드트립**

```go
package main

import (
    "fmt"
    "os"

    "github.com/cybergodev/json"
)

type User struct {
    Name string `json:"name"`
    Age  int    `json:"age"`
}

func main() {
    tmp, err := os.CreateTemp("", "cybergo-*.json")
    if err != nil {
        panic(err)
    }
    path := tmp.Name()
    tmp.Close()
    defer os.Remove(path)

    // 구조체를 직렬화하여 파일에 쓰기
    err = json.MarshalToFile(path, User{Name: "Alice", Age: 30})
    if err != nil {
        panic(err)
    }

    // 파일에서 읽어 역직렬화
    var user User
    err = json.UnmarshalFromFile(path, &user)
    if err != nil {
        panic(err)
    }
    fmt.Printf("%s, %d\n", user.Name, user.Age)
    // 출력：Alice, 30
}
```

## 보안: 파일 경로 검증

모든 파일 읽기/쓰기 함수 (`LoadFromFile` / `SaveToFile` / `MarshalToFile` / `UnmarshalFromFile`) 는 조작 전 경로에 대해 다층 보안 검증을 수행하며, `Config.ValidateFilePath` (기본값 `true`) 가 제어합니다. 검증은 다음 공격 벡터를 다룹니다:

| 보호 항목 | 설명 |
|--------|------|
| 경로 순회 | `..`, `..\` 및 그 URL 인코딩 변형 (`%2e%2e`, 다중 인코딩), Unicode 동형 문자 (전각 점/슬래시) 감지 |
| 널 바이트 주입 | 경로의 `\x00` 거부 |
| 심볼릭 링크 탈출 | symlink 의 실제 경로를 해석하여 제한 영역을 가리키는 것 방지 |
| 시스템 디렉토리 (Unix) | `/dev/`, `/proc/`, `/etc/passwd`, `/root/` 등 민감 경로 접근 차단 |
| Windows 예약명 | `CON`, `PRN`, `COM1-9`, `LPT1-9`, UNC 경로, 대체 데이터 스트림 (ADS) 거부 |
| 파일 크기 | 읽기 전 기존 파일이 `MaxJSONSize` 를 초과하는지 검사, 읽을 때 `io.LimitReader` 로 TOCTOU 방지 |

```go
// 경로 순회 공격은 거부되어 security error 반환
_, err := json.LoadFromFile("../../etc/passwd")
// err 이 nil 아님：path traversal pattern detected

// 정상 경로는 영향 없음
data, err := json.LoadFromFile("config/app.json")
```

::: warning 주의
파일 경로 검증은 항상 파일류 작업에 적용됩니다 (`LoadFromReader` / `SaveToWriter` 는 경로와 무관하므로 검증하지 않음). 사용자가 제공한 파일명을 처리할 때 이 검증은 심층 방어의 일환이지만, 여전히 애플리케이션 계층에서 화이트리스트 제약을 해야 합니다.
:::

## 파일 이터레이터 함수

json 패키지는 `ForeachFile` 시리즈 함수를 제공하여, 파일에서 JSON 배열 / 객체를 수동으로 읽고 파싱할 필요 없이 직접 반복합니다:

| 함수 | 용도 |
|------|------|
| `ForeachFile(path, fn, cfg...)` | 파일의 루트 레벨 배열 / 객체 반복 |
| `ForeachFileWithPath(path, pathExpr, fn, cfg...)` | 파일 내 지정된 경로 아래의 컬렉션 반복 |
| `ForeachFileChunked(path, chunkSize, fn, cfg...)` | 대규모 배열을 배치(chunk) 단위로 반복 |
| `ForeachFileNested(path, fn, cfg...)` | 모든 중첩 구조를 재귀적으로 반복 |

```go
err := json.ForeachFile("users.json", func(key any, item *json.IterableValue) error {
    fmt.Println(item.GetString("name"))
    return nil
})
```

이 함수들은 `LoadFromFile` + `Foreach` 의 편리한 조합이며, 대규모 컬렉션 처리에 적합합니다. 스트리밍 처리와 메모리 최적화 상세는 [스트리밍 처리](../../streaming/large-files)를 참조하세요.

## 메서드 선택

| 시나리오 | 추천 함수 |
|------|----------|
| 파일에서 원시 문자열 얻기 | `LoadFromFile` |
| 파일에서 읽어 구조체로 역직렬화 | `UnmarshalFromFile` |
| Reader / HTTP Body 에서 읽기 | `LoadFromReader` |
| Go 값을 파일에 저장 (컴팩트) | `SaveToFile` / `MarshalToFile` |
| 저장하며 포맷팅 | `SaveToFile(path, data, json.PrettyConfig())` |
| Writer / Buffer 에 쓰기 | `SaveToWriter` |
| 파일 내 컬렉션 반복 | `ForeachFile` 시리즈 |

## 관련 문서

- [JSONL 처리 함수](./jsonl) - ParseJSONL, StreamLinesInto 등 줄바꿈 구분 JSON 처리
- [인코딩 출력 함수](./output) - Marshal, Unmarshal 등 직렬화 작업
- [스트리밍 처리](../../streaming/large-files) - 스트리밍 프로세서와 대용량 파일 반복 상세
- [Processor 파일 I/O](../processor/file-io) - 대응하는 Processor 인스턴스 메서드
