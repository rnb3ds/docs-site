---
sidebar_label: "파일 I/O"
title: "파일 작업 함수 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON 파일 작업 함수: LoadFromFile/SaveToFile 읽기/쓰기, LoadFromReader/SaveToWriter 스트리밍 I/O, MarshalToFile/UnmarshalFromFile 직렬화를 지원합니다."
sidebar_position: 9
---

# 파일 작업 함수

json 패키지가 제공하는 파일 작업 함수로, 파일 읽기/쓰기, 스트리밍 I/O, 타입화된 직렬화를 지원합니다. 모든 파일 경로는 읽기/쓰기 전에 보안 검증을 거칩니다 ([파일 경로 검증](#보안-파일-경로-검증) 참조).

## 파일 읽기와 쓰기

### LoadFromFile

시그니처: `func LoadFromFile(filePath string, cfg ...Config) (string, error)`

파일에서 JSON 데이터를 로드하고 **원본 문자열**을 반환합니다 (재인코딩하지 않아 파일의 바이트 순서와 공백이 유지됨). 파일 크기는 `Config.MaxJSONSize` 의 제한을 받습니다.

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `filePath` | `string` | 예 | 파일 경로 (보안 검증을 통과해야 함) |
| `cfg` | `Config` | 아니오 | 선택적 설정 (예: `MaxJSONSize` 조이기) |

```go
data, err := json.LoadFromFile("config.json")
if err != nil {
	panic(err)
}
fmt.Println(data) // 원본 JSON 문자열
```

### SaveToFile

시그니처: `func SaveToFile(filePath string, data any, cfg ...Config) error`

데이터를 JSON 파일로 저장합니다. 존재하지 않는 부모 디렉터리를 자동 생성하고; **원자적 쓰기**를 사용합니다 (임시 파일에 쓴 뒤 rename 하므로 크래시가 발생해도 기존 파일이 잘리지 않음). 문자열 / `[]byte` 입력은 사전 파싱되어 이중 이스케이프를 피합니다.

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `filePath` | `string` | 예 | 파일 경로 (보안 검증을 통과해야 함) |
| `data` | `any` | 예 | 저장할 데이터 (Go 값 또는 JSON 문자열) |
| `cfg` | `Config` | 아니오 | 선택적 설정 (예: `PrettyConfig()` 포맷팅 출력) |

```go
// 컴팩트 저장 (기본)
err := json.SaveToFile("output.json", map[string]any{
	"name": "Alice",
	"age":  30,
})

// 포맷팅 저장
err = json.SaveToFile("output.json", data, json.PrettyConfig())
```

**전체 예제: SaveToFile + LoadFromFile 왕복**

```go
package main

import (
	"fmt"
	"os"

	"github.com/cybergodev/json"
)

func main() {
	// 임시 파일을 생성해 예제가 독립 실행되도록 함
	tmp, err := os.CreateTemp("", "cybergo-*.json")
	if err != nil {
		panic(err)
	}
	path := tmp.Name()
	tmp.Close()
	defer os.Remove(path)

	// 쓰기: map 은 키 이름순으로 인코딩
	err = json.SaveToFile(path, map[string]any{"name": "Alice", "age": 30})
	if err != nil {
		panic(err)
	}

	// 다시 읽기: 파일의 원본 내용 반환
	data, err := json.LoadFromFile(path)
	if err != nil {
		panic(err)
	}
	fmt.Println(data)
	// 출력: {"age":30,"name":"Alice"}
}
```

## 스트리밍 I/O

### LoadFromReader

시그니처: `func LoadFromReader(reader io.Reader, cfg ...Config) (string, error)`

`io.Reader` 에서 JSON 데이터를 로드하고 원본 문자열을 반환합니다. 읽는 바이트 수는 `Config.MaxJSONSize` 의 제한을 받으며 (메모리 고갈 방지), 네트워크 연결, HTTP 응답 본문, 파이프 등 스트리밍 데이터 소스에 적합합니다.

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
	// strings.Reader 에서 읽기 (원본 내용 그대로 반환)
	reader := strings.NewReader(`{"name":"Alice","age":30}`)
	data, err := json.LoadFromReader(reader)
	if err != nil {
		panic(err)
	}
	fmt.Println(data)
	// 출력: {"name":"Alice","age":30}
}
```

`os.File` 에서 읽을 때도 사용법이 같습니다 — `os.File` 은 `io.Reader` 를 구현합니다:

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

데이터를 JSON 으로 인코딩하여 `io.Writer` 에 기록합니다. `SaveToFile` 처럼 문자열 / `[]byte` 입력을 사전 파싱해 이중 이스케이프를 방지하지만, **파일 경로 검증은 하지 않습니다** (대상은 호출자가 제어).

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `writer` | `io.Writer` | 예 | 출력 대상 |
| `data` | `any` | 예 | 기록할 데이터 |
| `cfg` | `Config` | 아니오 | 선택적 설정 |

```go
var buf bytes.Buffer
err := json.SaveToWriter(&buf, map[string]any{"name": "test"}, json.PrettyConfig())
```

**전체 예제: bytes.Buffer 에 기록**

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
	// 출력:
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

데이터를 JSON 으로 직렬화하여 파일에 기록합니다. **현재 버전은 `SaveToFile` 과 같은 '인코딩 + 원자적 쓰기' 파이프라인을 공유합니다**: 마찬가지로 부모 디렉터리를 자동 생성하고 원자적으로 쓰며 (임시 파일 + rename), 문자열 / `[]byte` 입력을 사전 파싱해 이중 이스케이프를 피합니다; 전달된 `cfg` 는 **전량 적용**됩니다 (들여쓰기, 이스케이프, 숫자 처리 등 — 과거 버전은 `Pretty` 플래그만 읽고 나머지 인코딩 옵션을 조용히 버렸습니다). 둘의 동작은 동등하므로 의미에 맞게 고르면 됩니다: Go 값을 쓸 때는 `MarshalToFile`, 'JSON 문서 저장'을 강조할 때는 `SaveToFile`.

**매개변수**

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `filePath` | `string` | 예 | 파일 경로 |
| `data` | `any` | 예 | 직렬화할 데이터 |
| `cfg` | `Config` | 아니오 | 선택적 설정 (`PrettyConfig()` 가 들여쓰기 출력 생성) |

```go
err := json.MarshalToFile("data.json", myStruct)
err = json.MarshalToFile("data.json", myStruct, json.PrettyConfig())
```

### UnmarshalFromFile

시그니처: `func UnmarshalFromFile(filePath string, v any, cfg ...Config) error`

파일에서 JSON 을 읽어 대상 변수로 역직렬화합니다. '파일 읽기 + `Unmarshal`' 의 편의 조합이며, 읽기 과정은 `MaxJSONSize` 제한을 받습니다.

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

**전체 예제: MarshalToFile + UnmarshalFromFile 구조체 왕복**

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

	// 구조체를 직렬화해 파일에 기록
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
	// 출력: Alice, 30
}
```

## 보안: 파일 경로 검증

모든 파일 읽기/쓰기 함수 (`LoadFromFile` / `SaveToFile` / `MarshalToFile` / `UnmarshalFromFile`) 는 작업 전에 경로에 다층 보안 검증을 실행하며, `Config.ValidateFilePath` (기본 `true`) 가 제어합니다. 검증이 다루는 공격 벡터:

| 방어 항목 | 설명 |
|--------|------|
| 경로 순회 | `..`, `..\` 와 그 URL 인코딩 변형 (`%2e%2e`, 다중 인코딩), Unicode 동형 문자 (전각 점 / 슬래시) 감지 |
| 널 바이트 주입 | 경로의 `\x00` 거부 |
| 심볼릭 링크 탈출 | symlink 의 실제 경로를 해석해 제한 구역을 가리키는 것 방지 |
| 시스템 디렉터리 (Unix) | `/dev/`, `/proc/`, `/etc/passwd`, `/root/` 등 민감 경로 접근 차단 |
| Windows 예약명 | `CON`, `PRN`, `COM1-9`, `LPT1-9`, UNC 경로, 대체 데이터 스트림 (ADS) 거부 |
| 파일 크기 | 읽기 전 기존 파일이 `MaxJSONSize` 를 초과하는지 검사하고, 읽을 때 `io.LimitReader` 로 TOCTOU 방지 |

```go
// 경로 순회 공격은 거부되며 security error 반환
_, err := json.LoadFromFile("../../etc/passwd")
// err 이 nil 이 아님: path traversal pattern detected

// 정상 경로는 영향 없음
data, err := json.LoadFromFile("config/app.json")
```

::: warning 주의
파일 경로 검증은 항상 파일류 작업에 적용됩니다 (`LoadFromReader` / `SaveToWriter` 는 경로를 다루지 않으므로 검증하지 않음). 사용자가 제공한 파일명을 다룰 때 이 검증은 심층 방어의 한 층이며, 여전히 애플리케이션 계층에서 화이트리스트 제약을 적용해야 합니다.
:::

## 파일 반복 함수

json 패키지는 `ForeachFile` 계열 함수를 제공해 파일에서 JSON 배열 / 객체를 직접 반복합니다 (수동 읽기 + 파싱 불필요):

| 함수 | 용도 |
|------|------|
| `ForeachFile(path, fn, cfg...)` | 파일 루트 수준의 배열 / 객체 반복 |
| `ForeachFileWithPath(path, pathExpr, fn, cfg...)` | 파일 내 지정 경로의 컬렉션 반복 |
| `ForeachFileChunked(path, chunkSize, fn, cfg...)` | 대형 배열을 배치 (청크) 단위로 반복 |
| `ForeachFileNested(path, fn, cfg...)` | 모든 중첩 구조를 재귀적으로 반복 |

```go
err := json.ForeachFile("users.json", func(key any, item *json.IterableValue) error {
	fmt.Println(item.GetString("name"))
	return nil
})
```

이 함수들은 `LoadFromFile` + `Foreach` 의 편의 조합으로 큰 컬렉션 처리에 적합합니다. 스트리밍 처리와 메모리 최적화 세부 사항은 [스트리밍 처리](../../streaming/large-files) 를 참조하세요.

## 메서드 선택

| 시나리오 | 추천 함수 |
|------|----------|
| 파일을 읽어 원본 문자열 얻기 | `LoadFromFile` |
| 파일을 읽어 구조체로 역직렬화 | `UnmarshalFromFile` |
| Reader / HTTP Body 에서 읽기 | `LoadFromReader` |
| Go 값을 파일로 저장 (컴팩트) | `SaveToFile` / `MarshalToFile` |
| 저장하면서 포맷팅 | `SaveToFile(path, data, json.PrettyConfig())` |
| Writer / Buffer 에 기록 | `SaveToWriter` |
| 파일 내 컬렉션 반복 | `ForeachFile` 계열 |

## 관련 문서

- [JSONL 처리 함수](./jsonl) - ParseJSONL, StreamLinesInto 등 개행 구분 JSON 처리
- [인코딩 출력 함수](./output) - Marshal, Unmarshal 등 직렬화 작업
- [스트리밍 처리](../../streaming/large-files) - 스트리밍 프로세서와 대용량 파일 반복 상세
- [Processor 파일 작업](../processor/file-io) - 대응하는 Processor 인스턴스 메서드
