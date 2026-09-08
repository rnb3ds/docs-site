---
sidebar_label: "출력 포맷팅"
title: "출력 포맷팅 - CyberGo JSON | JSON 출력과 미화 가이드"
description: "CyberGo JSON 출력 포맷팅: Prettify, EncodePretty, MarshalIndent, Compact/CompactString, Indent, HTMLEscape 비교와 예제로 커스텀 들여쓰기·기존 텍스트 압축·스트리밍 출력, Print 계열 마이그레이션 안내."
sidebar_position: 2.5
---

# 출력 함수

::: info 마이그레이션 참고
이 페이지는 Print 계열 함수 (이른 버전에서 제거됨) 의 마이그레이션 가이드입니다. JSON 을 포맷팅하려면 [`Prettify`](../api-reference/index#포맷팅) 또는 표준 라이브러리 호환 `MarshalIndent` 를 사용하세요.
:::

::: warning API 변경 안내
Print, PrintPretty, PrintE, PrintPrettyE 는 라이브러리에서 제거되어 더 이상 제공되지 않습니다. 아래 대안을 사용하세요.
:::

## 대안

### 컴팩트 JSON 출력

`fmt.Println` + `EncodeWithConfig` (권장) 또는 `Marshal` 을 사용합니다:

```go
data := map[string]any{"name": "Alice", "age": 30}

s, err := json.EncodeWithConfig(data)
if err != nil {
	log.Fatal(err)
}
fmt.Println(s)
// 출력: {"age":30,"name":"Alice"}

// 또는 Marshal 사용 ([]byte 출력)
b, err := json.Marshal(data)
if err != nil {
	log.Fatal(err)
}
fmt.Println(string(b))
```

::: warning Encode 는 폐기 예정
`json.Encode` 는 폐기 예정으로 표시되었습니다 (`EncodeWithConfig` 와 기능 동등). 향후 메이저 버전에서 제거됩니다. 신규 코드는 `EncodeWithConfig` 또는 `Marshal` 을 사용하세요.
:::

### 포맷팅된 JSON 출력

`fmt.Println` + `EncodePretty` 를 사용합니다:

```go
s, err := json.EncodePretty(data)
if err != nil {
	log.Fatal(err)
}
fmt.Println(s)
// 출력:
// {
//   "age": 30,
//   "name": "Alice"
// }
```

### JSON 문자열 출력 (이미 있는 JSON 미화)

`Prettify` 를 사용합니다:

```go
pretty, err := json.Prettify(`{"name":"Alice","age":30}`)
if err != nil {
	log.Fatal(err)
}
fmt.Println(pretty)
// 출력:
// {
//   "name": "Alice",
//   "age": 30
// }
```

### Processor 로 출력

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

// 인코딩 후 출력 (EncodeWithConfig 권장; Encode 는 폐기 예정)
s, err := p.EncodeWithConfig(data)
if err != nil {
	log.Fatal(err)
}
fmt.Println(s)

// 포맷팅 출력
pretty, err := p.EncodePretty(data)
if err != nil {
	log.Fatal(err)
}
fmt.Println(pretty)
```

## 포맷팅 도구 대조

'입력이 Go 값인지 JSON 텍스트인지'에 따라 도구를 고릅니다:

| 함수 | 입력 | 출력 | 전형적 용도 |
|------|------|------|----------|
| `Marshal(v, cfg...)` | Go 값 | `[]byte` 컴팩트 | 표준 라이브러리 시그니처, 가장 범용 |
| `EncodeWithConfig(v, cfg...)` | Go 값 | `string` 컴팩트 | 권장 진입점 (설정 가능) |
| `EncodePretty(v, cfg...)` | Go 값 | `string` 들여쓰기 | 인코딩과 미화를 한 번에 |
| `MarshalIndent(v, prefix, indent)` | Go 값 | `[]byte` 들여쓰기 | 표준 라이브러리 시그니처, 기존 코드 호환 |
| `Prettify(jsonStr, cfg...)` | JSON 텍스트 | `string` 들여쓰기 | 이미 있는 JSON 텍스트 미화 |
| `Compact(dst, src)` | JSON 텍스트 | `*bytes.Buffer` 에 기록 | 이미 있는 텍스트 압축 |
| `CompactString(jsonStr)` | JSON 텍스트 | `string` 컴팩트 | 이미 있는 텍스트 압축 (buffer 불필요) |
| `Indent(dst, src, prefix, indent)` | JSON 텍스트 | `*bytes.Buffer` 에 기록 | 들여쓰기 재배치 |
| `HTMLEscape(dst, src)` | JSON 텍스트 | `*bytes.Buffer` 에 기록 | `<` `>` `&` 이스케이프 |
| `NewEncoder(w)` + `SetIndent` | Go 값 | `io.Writer` 에 기록 | 스트리밍 출력 (파일/네트워크) |

::: tip 3 단계 선택
1. 입력이 **Go 값**: `[]byte` 가 필요하면 `Marshal`, `string` 이면 `EncodeWithConfig`; 들여쓰기가 필요하면 각각 `MarshalIndent`, `EncodePretty` 로 교체
2. 입력이 이미 **JSON 텍스트**: 미화는 `Prettify`, 압축은 `CompactString`; 표준 라이브러리 시그니처와 완전 일치가 필요하면 buffer 버전 `Compact`/`Indent`
3. **스트림** (파일/네트워크) 으로 출력: `NewEncoder` + `SetIndent` 로 한 건씩 기록, 큰 문자열을 통째로 조립하지 않기
:::

## 커스텀 들여쓰기

`EncodePretty` 는 기본적으로 공백 2 칸 들여쓰기를 사용합니다. 다른 들여쓰기가 필요하면 `Config.Pretty` + `Config.Indent` 를 쓰거나, 표준 라이브러리 시그니처인 `MarshalIndent` 를 직접 사용하세요:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data := map[string]any{"name": "Alice", "age": 30}

	// 방법 1: 표준 라이브러리 시그니처 MarshalIndent (prefix 는 보통 비워 둠)
	b, err := json.MarshalIndent(data, "", "    ")
	if err != nil {
		panic(err)
	}
	fmt.Println(string(b))
	// 출력:
	// {
	//     "age": 30,
	//     "name": "Alice"
	// }

	// 방법 2: EncodePretty + 설정 (탭 들여쓰기)
	cfg := json.DefaultConfig()
	cfg.Pretty = true
	cfg.Indent = "\t"
	s, err := json.EncodePretty(data, cfg)
	if err != nil {
		panic(err)
	}
	fmt.Println(s)
}
```

::: tip
`json.PrettyConfig()` 는 바로 쓸 수 있는 프리셋입니다: 기본 설정 + `Pretty: true` + 공백 2 칸 들여쓰기로, `EncodePretty` 의 기본 동작과 동등합니다.
:::

## 이미 있는 JSON 텍스트 다루기

손에 이미 JSON 텍스트가 있을 때 (로그, 인터페이스 반환 등) 포맷팅 함수로 그 자리에서 변환하며, 구조체를 거칠 필요가 없습니다:

```go
package main

import (
	"bytes"
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	pretty := "{\n  \"name\": \"Alice\",\n  \"age\": 30\n}"

	// 압축: 불필요한 모든 공백 제거
	var compact bytes.Buffer
	if err := json.Compact(&compact, []byte(pretty)); err != nil {
		panic(err)
	}
	fmt.Println(compact.String())
	// 출력: {"name":"Alice","age":30}

	// buffer 없는 버전: CompactString 이 문자열로 바로 반환
	s, err := json.CompactString(pretty)
	if err != nil {
		panic(err)
	}
	fmt.Println(s)

	// 재배치: 다른 들여쓰기 스타일로
	var reindented bytes.Buffer
	if err := json.Indent(&reindented, []byte(pretty), "", "\t"); err != nil {
		panic(err)
	}
	fmt.Println(reindented.String())
	// 출력:
	// {
	// 	"name": "Alice",
	// 	"age": 30
	// }
}
```

## HTML 안전 이스케이프

`HTMLEscape` 는 표준 라이브러리 시그니처와 같습니다: JSON 텍스트의 `<`, `>`, `&`, U+2028, U+2029 를 `\u00XX` 형식으로 이스케이프해, JSON 을 HTML 에 끼워 넣을 때 브라우저가 잘못 파싱하는 것을 막습니다. 이것은 **문자 수준 이스케이프**이며 재인코딩하지 않고 공백도 바꾸지 않습니다:

```go
package main

import (
	"bytes"
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	src := []byte(`{"html":"<b>bold</b>","url":"a&b"}`)

	var buf bytes.Buffer
	json.HTMLEscape(&buf, src)
	out := buf.String()
	fmt.Println(out)
	// 출력의 따옴표 안에는 더 이상 bare <, >, & 가 없으며,
	// 각각 \u00XX 형식의 이스케이프 시퀀스로 바뀌고 나머지 내용은 그대로 유지됩니다
}
```

::: tip 언제 수동 이스케이프가 필요한가?
`Marshal`/`EncodeWithConfig` 는 기본적으로 HTML 이스케이프가 켜져 있어 (`Config.EscapeHTML: true`) 인코딩 결과 자체가 안전합니다. `HTMLEscape` 는 주로 **외부에서 받은 JSON 텍스트**를 다룰 때 씁니다 — 예를 들어 제3자가 반환한 JSON 을 HTML 페이지에 그대로 끼워 넣을 때 한 번 거친 뒤 출력하세요.
:::

## Writer 로 스트리밍 출력

파일이나 네트워크 스트림에 쓸 때는 `NewEncoder` (표준 라이브러리 시그니처) 로 문자열을 통째로 조립하지 마세요:

```go
package main

import (
	"os"

	"github.com/cybergodev/json"
)

func main() {
	type Item struct {
		ID   int    `json:"id"`
		Name string `json:"name"`
	}

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")

	for _, item := range []Item{{1, "Alice"}, {2, "Bob"}} {
		if err := enc.Encode(item); err != nil {
			panic(err)
		}
	}
	// 출력:
	// {
	//   "id": 1,
	//   "name": "Alice"
	// }
	// {
	//   "id": 2,
	//   "name": "Bob"
	// }
}
```

`Encoder.Encode` 는 표준 라이브러리와 같이 건마다 자동으로 줄바꿈합니다 — 로그를 한 줄씩 출력하거나 JSONL 파일을 쓰기에 자연스럽습니다.

## 전체 예제

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
	"log"
)

func main() {
	data := map[string]any{
		"users": []any{
			map[string]any{"id": 1, "name": "Alice"},
			map[string]any{"id": 2, "name": "Bob"},
		},
		"total": 2,
	}

	// 컴팩트 출력 (Encode 는 폐기 예정, EncodeWithConfig 권장)
	compact, err := json.EncodeWithConfig(data)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(compact)

	// 포맷팅 출력
	pretty, err := json.EncodePretty(data)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(pretty)
}
```

## 관련 문서

- [인코딩 출력 함수](../api-reference/functions/output) - Encode, EncodePretty, Prettify
- [패키지 함수](../api-reference/functions/) - 패키지 레벨 함수 총람
