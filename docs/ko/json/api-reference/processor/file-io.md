---
sidebar_label: "파일 I/O"
title: "Processor 파일 작업 메서드 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON Processor 파일 메서드: LoadFromFile/LoadFromReader 로드, SaveToFile/MarshalToFile 저장, UnmarshalFromFile 읽기, SaveToWriter 스트림 쓰기를 지원합니다."
sidebar_position: 9
---

# 파일 작업 메서드

Processor 는 파일, `io.Reader`, `io.Writer` 세 종류의 데이터 소스를 아우르는 JSON 파일 읽기/쓰기와 스트리밍 로드 메서드를 제공합니다. 파일류 메서드는 작업 전에 항상 경로 보안 검증을 수행합니다 ([함수 레퍼런스](../functions/file-io#보안-파일-경로-검증) 참조).

## 파일 로드

### LoadFromFile

시그니처: `func (p *Processor) LoadFromFile(filePath string, cfg ...Config) (string, error)`

파일에서 JSON 데이터를 로드하고 **원본 문자열**을 반환합니다 (파일의 바이트 순서와 공백을 유지하며 재인코딩하지 않음). 읽는 바이트 수는 `MaxJSONSize` 의 제한을 받습니다.

```go
data, err := p.LoadFromFile("config.json")
if err != nil {
	panic(err)
}
fmt.Println(data) // 원본 JSON 문자열
```

### LoadFromFileAsData (비공개화됨)

::: warning API 변경 안내
LoadFromFileAsData 는 내부 메서드 (`loadFromFileAsData`) 로 전환되어 더 이상 공개 API 로 익스포트되지 않습니다. `LoadFromFile` + `Parse` 조합을 사용하세요:

```go
jsonStr, err := p.LoadFromFile("data.json")
if err != nil {
	panic(err)
}
var data any
err = p.Parse(jsonStr, &data)
// data 타입은 map[string]any 또는 []any
if obj, ok := data.(map[string]any); ok {
	fmt.Println(obj["name"])
}
```

:::

## Reader 로드

### LoadFromReader

시그니처: `func (p *Processor) LoadFromReader(reader io.Reader, cfg ...Config) (string, error)`

`io.Reader` 에서 JSON 데이터를 로드하고 원본 문자열을 반환합니다. 읽기는 `MaxJSONSize` 의 제한을 받으며 `os.File`, HTTP Body, 파이프 등 스트리밍 소스에 적합합니다.

```go
file, _ := os.Open("data.json")
defer file.Close()

data, err := p.LoadFromReader(file)
if err != nil {
	panic(err)
}
```

### LoadFromReaderAsData (비공개화됨)

::: warning API 변경 안내
LoadFromReaderAsData 는 내부 메서드 (`loadFromReaderAsData`) 로 전환되어 더 이상 공개 API 로 익스포트되지 않습니다. `LoadFromReader` + `Parse` 조합을 사용하세요:

```go
file, _ := os.Open("data.json")
defer file.Close()

jsonStr, err := p.LoadFromReader(file)
if err != nil {
	panic(err)
}
var data any
err = p.Parse(jsonStr, &data)
```

:::

## 파일 쓰기

### SaveToFile

시그니처: `func (p *Processor) SaveToFile(filePath string, data any, cfg ...Config) error`

데이터를 JSON 파일로 저장합니다. 부모 디렉터리를 자동 생성하고 **원자적 쓰기** (임시 파일 + rename) 를 사용합니다. 문자열 / `[]byte` 입력은 사전 파싱되어 이중 이스케이프를 피합니다.

```go
err := p.SaveToFile("data.json", map[string]any{"name": "CyberGo"})

// PrettyConfig 로 포맷팅 출력 저장
err = p.SaveToFile("data.json", data, json.PrettyConfig())
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
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	tmp, err := os.CreateTemp("", "cybergo-*.json")
	if err != nil {
		panic(err)
	}
	path := tmp.Name()
	tmp.Close()
	defer os.Remove(path)

	err = p.SaveToFile(path, map[string]any{"name": "Alice", "age": 30})
	if err != nil {
		panic(err)
	}

	data, err := p.LoadFromFile(path)
	if err != nil {
		panic(err)
	}
	fmt.Println(data)
	// 출력: {"age":30,"name":"Alice"}
}
```

### MarshalToFile

시그니처: `func (p *Processor) MarshalToFile(path string, data any, cfg ...Config) error`

데이터를 JSON 으로 인코딩해 파일에 기록합니다. 부모 디렉터리를 자동 생성하고 원자적으로 씁니다. `SaveToFile` 과 **같은 '인코딩 + 원자적 쓰기' 파이프라인을 공유**합니다: 마찬가지로 문자열 / `[]byte` 입력을 사전 파싱해 이중 이스케이프를 피하고, 전달된 `cfg` 를 완전히 존중합니다 (`Pretty` / `Indent` / `EscapeHTML` 등 전부 적용) — 두 메서드는 현재 오류 메시지의 작업 이름에서만 차이가 나며, 과거의 동작 차이는 해소되었습니다.

```go
err := p.MarshalToFile("output.json", data)

// 포맷팅 저장
err = p.MarshalToFile("output.json", data, json.PrettyConfig())
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
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	tmp, err := os.CreateTemp("", "cybergo-*.json")
	if err != nil {
		panic(err)
	}
	path := tmp.Name()
	tmp.Close()
	defer os.Remove(path)

	err = p.MarshalToFile(path, User{Name: "Alice", Age: 30})
	if err != nil {
		panic(err)
	}

	var user User
	err = p.UnmarshalFromFile(path, &user)
	if err != nil {
		panic(err)
	}
	fmt.Printf("%s, %d\n", user.Name, user.Age)
	// 출력: Alice, 30
}
```

### UnmarshalFromFile

시그니처: `func (p *Processor) UnmarshalFromFile(path string, v any, cfg ...Config) error`

파일에서 JSON 을 읽어 대상 변수로 디코딩합니다. 읽기는 `MaxJSONSize` 의 제한을 받습니다.

```go
type AppConfig struct {
	Host string `json:"host"`
	Port int    `json:"port"`
}

var config AppConfig
err := p.UnmarshalFromFile("config.json", &config)
if err != nil {
	panic(err)
}
```

### SaveToWriter

시그니처: `func (p *Processor) SaveToWriter(writer io.Writer, data any, cfg ...Config) error`

데이터를 JSON 으로 인코딩하여 `io.Writer` 에 기록합니다. 문자열 / `[]byte` 입력은 마찬가지로 사전 파싱되어 이중 이스케이프를 피합니다; 파일 경로를 다루지 않으므로 경로 검증은 하지 않습니다.

```go
var buf bytes.Buffer
err := p.SaveToWriter(&buf, data, json.PrettyConfig())
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
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	var buf bytes.Buffer
	err = p.SaveToWriter(&buf, map[string]any{"name": "Alice", "age": 30}, json.PrettyConfig())
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

## 파일 반복

Processor 는 `ForeachFile` 계열 메서드를 제공해 파일에서 JSON 컬렉션을 직접 반복하며, `LoadFromFile` + `Foreach` 의 편의 조합입니다:

| 메서드 | 용도 |
|------|------|
| `ForeachFile(path, fn, cfg...)` | 파일 루트 수준의 배열 / 객체 반복 |
| `ForeachFileWithPath(path, pathExpr, fn, cfg...)` | 파일 내 지정 경로의 컬렉션 반복 |
| `ForeachFileChunked(path, chunkSize, fn, cfg...)` | 대형 배열을 배치 단위로 반복 |
| `ForeachFileNested(path, fn, cfg...)` | 모든 중첩 구조를 재귀적으로 반복 |

```go
err := p.ForeachFile("users.json", func(key any, item *json.IterableValue) error {
	fmt.Println(item.GetString("name"))
	return nil
})
```

콜백은 `item.Break()` 로 반복을 조기 종료할 수 있습니다. 스트리밍 처리와 대용량 파일 최적화 세부 사항은 [스트리밍 처리](../../streaming/large-files) 를 참조하세요.

## 메서드 선택

| 시나리오 | 추천 메서드 |
|------|----------|
| 원본 문자열이 필요할 때 | `LoadFromFile` / `LoadFromReader` |
| 파싱된 데이터가 필요할 때 | `LoadFromFile` + `Parse` / `LoadFromReader` + `Parse` |
| Go 값을 파일로 저장 | `SaveToFile` / `MarshalToFile` |
| 파일을 읽어 구조체로 디코딩 | `UnmarshalFromFile` |
| Writer 에 기록 | `SaveToWriter` |
| 파일 내 컬렉션 반복 | `ForeachFile` 계열 |

## 관련 문서

- [파싱 및 검증](./parse) - Parse/Valid 파싱 메서드
- [파일 함수](../functions/file-io) - 패키지 레벨 파일 읽기/쓰기 함수 (경로 보안 검증 상세 포함)
- [스트리밍 처리](../../streaming/large-files) - 스트리밍 프로세서와 대용량 파일 반복 상세
