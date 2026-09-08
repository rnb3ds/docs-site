---
title: "표준 라이브러리에서 마이그레이션 - CyberGo JSON | encoding/json 호환 가이드"
description: "표준 라이브러리 encoding/json 에서 CyberGo JSON 으로 마이그레이션: 3 단계로 완료하고 import 만 바꿔도 컴파일됩니다. Marshal/Encoder/Decoder 메서드와 오류 타입 호환 목록 점검, 기본 보안 검증 차이표, FAQ 와 추가 능력 가이드 제공."
sidebar_label: "표준 라이브러리에서 마이그레이션"
sidebar_position: 1.5
---

# 표준 라이브러리에서 마이그레이션

`cybergodev/json` 은 표준 라이브러리 `encoding/json` 과 **100% 호환**됩니다 — import 경로만 교체하면 기존 코드를 전혀 고치지 않고 컴파일·실행할 수 있습니다 (기본 입력 보안 검증이 가져오는 사소한 경계 차이는 아래 [동작 차이](#동작-차이) 참조). 이 페이지는 마이그레이션을 돕고, 마이그레이션 후 사용할 수 있는 추가 능력을 안내합니다.

## 3 단계 마이그레이션

1. **설치**:

   ```bash
   go get github.com/cybergodev/json
   ```

2. **import 교체**: `"encoding/json"` 을 `"github.com/cybergodev/json"` 으로 바꿉니다.

   ```go
   // 마이그레이션 전
   import "encoding/json"

   // 마이그레이션 후
   import "github.com/cybergodev/json"
   ```

3. **완료**: 컴파일이 통과되고 모든 기존 코드를 수정할 필요가 없습니다.

## 완전히 호환되는 API

다음 표는 `encoding/json` 과 `cybergodev/json` 의 대응 관계입니다:

| encoding/json | cybergodev/json | 설명 |
|---|---|---|
| `Marshal(v)` | `Marshal(v, cfg...)` | 시그니처 호환, 추가 선택적 cfg 매개변수 |
| `Unmarshal(data, &v)` | `Unmarshal(data, &v, cfg...)` | 위와 동일 |
| `MarshalIndent(v, prefix, indent)` | 동일 이름 | 완전 호환 |
| `Compact(dst, src)` | 동일 이름 | 완전 호환 |
| `Indent(dst, src, prefix, indent)` | 동일 이름 | 완전 호환 |
| `HTMLEscape(dst, src)` | 동일 이름 | 완전 호환 |
| `Valid(data)` | `Valid(data, cfg...)` | 시그니처 호환 |
| `NewEncoder(w)` | `NewEncoder(w, cfg...)` | 시그니처 호환 |
| `NewDecoder(r)` | `NewDecoder(r, cfg...)` | 시그니처 호환 |
| `Number` | `Number` | 타입 호환 (`String`/`Int64`/`Float64`/`MarshalJSON` 모두 유지) |
| `Delim` | `Delim` | 타입 호환 (`String()` 유지) |
| `Token` | `Token` | 타입 호환 |

`Encoder` 와 `Decoder` 의 **메서드 수준** 호환도 완전합니다 — 마이그레이션 후 스트리밍 코드는 수정이 필요 없습니다:

| 메서드 | 소속 | 호환성 |
|---|---|---|
| `Encode(v)` / `SetIndent(prefix, indent)` / `SetEscapeHTML(on)` | `*Encoder` | 완전 호환 |
| `Decode(v)` / `Token()` / `More()` / `Buffered()` / `InputOffset()` | `*Decoder` | 완전 호환 |
| `UseNumber()` / `DisallowUnknownFields()` | `*Decoder` | 완전 호환 |

오류 타입도 하나하나 대응되어 `errors.As` / 타입 단언에 의존하는 코드가 그대로 동작합니다: `SyntaxError`, `UnmarshalTypeError`, `InvalidUnmarshalError`, `MarshalerError`, `UnsupportedTypeError`, `UnsupportedValueError` 모두 존재하고 동작이 같습니다 ([오류 타입](../api-reference/constants#오류-변수) 참조).

오류 구조체의 **위치 필드**도 하나씩 유지되어, 필드 기반 오류 위치 파악이나 분류 통계 코드는 수정할 필요가 없습니다:

| 타입 | 필드 | 타입 | 설명 |
|------|------|------|------|
| `SyntaxError` | `Offset` | `int64` | 오류 발생 전까지 읽은 바이트 수 |
| `UnmarshalTypeError` | `Offset` | `int64` | 오류 발생 전까지 읽은 바이트 수 |
| `UnmarshalTypeError` | `Struct` | `string` | 오류 필드를 포함한 루트 타입 이름 |
| `UnmarshalTypeError` | `Field` | `string` | 루트 노드부터 오류 값까지의 전체 경로 |
| `UnsupportedValueError` | `Str` | `string` | 지원하지 않는 값의 텍스트 표현 (예: NaN, +Inf) |

`UnmarshalTypeError` 의 `Struct` / `Field` 가 비어 있지 않으면 `Error()` 는 `json: cannot unmarshal <value> into Go struct field <Struct>.<Field> of type <type>` 를 출력하며, 표준 라이브러리와 한 글자까지 같습니다.

::: tip 선택적 cfg 매개변수
추가된 `cfg ...Config` 매개변수는 모두 **선택적** (가변 인자) 입니다. 전달하지 않으면 일반 데이터에 대한 동작은 표준 라이브러리와 같습니다 (기본 입력 검증의 경계 차이는 아래 [동작 차이](#동작-차이) 참조); 보안 모드, 캐시 등 향상된 기능을 켤 때만 전달하세요.

cfg 에 관한 세 가지 **의도적 예외** (라이브러리 설계 규약에서 비롯):

- **타입화된 읽기 함수** (`GetTyped`, `GetString`, `GetInt` 등) 의 가변 인자는 cfg 가 아니라 **기본값**입니다 — Go 는 가변 인자를 하나만 허용합니다. 설정 기반의 타입화 읽기가 필요하면 `SafeGet` 이나 `New(cfg)` 로 만든 Processor 의 타입화 읽기 메서드 (`GetString`, `GetInt` 등) 를 사용하세요.
- **편의 변형** (`SetCreate`, `SetMultipleCreate`, `DeleteClean`) 은 `CreatePaths` (또는 `CleanupNulls` + `CompactArrays`) 플래그를 강제로 켠 일반 버전과 동등합니다.
- `Valid` 는 단일 `bool` 을 반환합니다 (표준 라이브러리 시그니처); 실패 원인이 필요하면 `ValidWithConfig` (`bool, error` 반환) 를 사용하세요.
:::

## 코드 예제: import 만 교체

아래 예제는 'import 만 교체'한 효과를 보여줍니다. 인코딩, 디코딩, 구조체 태그 (struct tag) 사용법이 `encoding/json` 과 완전히 같습니다:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	type User struct {
		Name string   `json:"name"`
		Age  int      `json:"age"`
		Tags []string `json:"tags"`
	}

	// 인코딩 — encoding/json 과 완전히 동일
	user := User{Name: "Alice", Age: 30, Tags: []string{"go", "json"}}
	b, err := json.Marshal(user)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(b))
	// 출력: {"name":"Alice","age":30,"tags":["go","json"]}

	// 디코딩 — encoding/json 과 완전히 동일
	var u User
	if err := json.Unmarshal(b, &u); err != nil {
		panic(err)
	}
	fmt.Printf("%+v\n", u)
	// 출력: {Name:Alice Age:30 Tags:[go json]}
}
```

## 추가 능력

마이그레이션 후 표준 라이브러리 호환을 유지하면서, 표준 라이브러리로는 할 수 없는 다음 능력을 필요에 따라 사용할 수 있습니다:

| 능력 | 예시 | 자세히 |
|---|---|---|
| 경로 쿼리 | `json.GetString(data, "user.name")` | [경로 표현식 문법](./path-syntax) |
| 기본값으로 가져오기 | `json.GetInt(data, "timeout", 30)` | [조회 및 가져오기](../api-reference/functions/query) |
| 제네릭 가져오기 | `json.GetTyped[User](data, "user")` | [제네릭 작업](../api-reference/generics) |
| 경로 수정 | `json.Set(data, "user.name", "Bob")` | [수정 작업](../api-reference/functions/modify) |
| Schema 검증 | `json.ValidateSchema(data, schema)` | [Schema 검증](../api-reference/schema) |
| 스트리밍 JSONL | `json.StreamLinesInto[T](r, fn)` | [JSONL 처리](../streaming/jsonl) |
| 고성능 프로세서 | `p, _ := json.New()` | [Processor 가이드](./processor-guide) |
| 사전 파싱/경로 사전 컴파일 | `p.PreParse` / `p.CompilePath` | [Processor 가이드](./processor-guide) |
| 동시성 반복 | `json.NewParallelIterator(items).ForEach(fn)` | [동시성과 병렬 처리](../advanced/concurrency) |
| 컨텍스트 취소 | `json.GetWithContext(ctx, data, path)` | [조회 및 가져오기](../api-reference/functions/query) |
| JSON 깊은 비교 | `json.CompareJSON(a, b)` | [유틸리티 함수](../api-reference/helpers) |
| 훅/감사/타이밍 | `p.AddHook(json.LoggingHook(logger))` | [Hook 시스템](../extensions/hooks) |
| 보안 모드 | `json.SecurityConfig()` | [보안 모드](../security/security-mode) |
| 런타임 통계/상태 검사 | `json.GetStats()` / `json.GetHealthStatus()` | [Processor 가이드](./processor-guide#모니터링과-진단) |

## 동작 차이

**일반 데이터**에 대해서는 기본 설정의 동작이 `encoding/json` 과 같습니다. 주의할 점은: `cybergodev/json` 은 기본적으로 한 겹의 **입력 보안 검증**을 갖고 있다는 것입니다 (보안 JSON 라이브러리로서의 포지션 때문입니다). 한도를 초과하거나 위험 패턴을 포함한 입력은 거부하며, 표준 라이브러리는 모두 받아들입니다. 차이는 아래 표에 집중되어 있습니다:

| 차이점 | encoding/json | CyberGo 기본 동작 | 다른 동작이 필요할 때 |
|---|---|---|---|
| 입력 크기 | 무제한 | 100MB 초과 시 (`MaxJSONSize`) `ErrSizeLimit` 반환 | `cfg.MaxJSONSize` 키우기 |
| 중첩 깊이 | 명시적 제한 없음 | 200 층 초과 시 `ErrDepthLimit` 반환 | `MaxNestingDepthSecurity` 조정 |
| 위험 콘텐츠 패턴 | 검사하지 않음 | 28 개 내장 패턴이 기본 차단 (`__proto__`, `<script`, `javascript:`, `eval(`, `onload` 등), `ErrSecurityViolation` 반환 | 신뢰 확인 후 `cfg.DisableDefaultPatterns = true` 설정 (`__proto__` 등 핵심 패턴은 여전히 차단) |
| 컨테이너 폭 | 무제한 | 객체당 ≤ 10 만 키, 배열당 ≤ 10 만 요소 | `MaxObjectKeys` / `MaxArrayElements` 조정 |
| 무효 UTF-8 | 디코딩 시 U+FFFD 로 치환 | 바로 거부 (`ErrInvalidJSON`) | 입력 인코딩을 미리 수리 |
| BOM 접두사 | 문법 오류 | 거부 (`ErrInvalidJSON`) | 전처리로 BOM 제거 |

오해하기 쉬운 두 가지:

1. **오류 메시지가 더 풍부함**: 경로 작업 실패 시 반환되는 `JsonsError` 는 작업 이름, 경로, 내부 원인을 담습니다 (`errors.Is`/`errors.As` 와 `Unwrap` 지원). 하지만 표준 라이브러리 호환 함수 (`Unmarshal`/`Decode` 등) 의 오류 타입은 **바꾸지 않습니다** — 여전히 `SyntaxError`, `UnmarshalTypeError` 등 표준 형태를 반환합니다.
2. **검증은 입력에만 작용**: 위 제한은 JSON 텍스트 입력 (`Unmarshal`, `Get`, `Parse`, `Valid` 등) 대상입니다; `Marshal`/`Encode` 로 Go 값을 인코딩할 때는 콘텐츠 검증을 하지 않습니다.

신뢰할 수 없는 입력을 다룰 때는 그냥 `json.SecurityConfig()` 프리셋 (더 엄격한 제한 + 전체 스캔) 사용을 권장합니다. 자세한 내용은 [보안 모드](../security/security-mode) 를 참조하세요.

## 마이그레이션 FAQ

**Q: `json.Number` 의 큰 숫자 정밀도 동작이 바뀌나요?**

아니요. `Decoder.UseNumber()` 는 표준 라이브러리와 같고 `Number.Int64()`/`Float64()` 동작도 변하지 않습니다. 원본 숫자 텍스트를 유지해야 할 때는 평소처럼 `json.Number` 를 쓰세요.

**Q: HTML 이스케이프 기본 동작이 같나요?**

같습니다. `Marshal`/`Encode` 는 기본적으로 `<`, `>`, `&` 를 이스케이프합니다 (표준 라이브러리와 동일), `Encoder.SetEscapeHTML(false)` 로 끌 수 있습니다 — 동작과 시그니처 모두 호환됩니다.

**Q: 기존 코드가 `json.Marshaler`/`json.Unmarshaler` 커스텀 타입을 쓰는데요?**

완전 호환됩니다. 두 인터페이스는 평소처럼 작동하며, 이를 구현한 커스텀 타입의 인코딩/디코딩 경로 동작이 동일합니다.

**Q: 새 코드에서만 추가 능력을 쓰고 기존 코드는 그대로 둘 수 있나요?**

가능합니다. 이것이 설계 목표입니다. 패키지 레벨 함수는 '마지막 인자 cfg'별로 대응하는 Processor 를 캐시합니다 (위 cfg 규약 참조), cfg 를 전달하지 않는 호출은 기본 설정의 전역 프로세서를 사용합니다 — 일반 데이터에 대해서는 표준 라이브러리와 같고, 기본 입력 검증의 차이는 위 [동작 차이](#동작-차이) 표를 참조하세요.

**Q: `Unmarshal` 이 `onload`, `eval(` 등의 문자열을 포함한 유효한 데이터를 거부합니다. 어떻게 하나요?**

기본 입력 검증이 인젝션 패턴을 차단하는 것입니다. 입력이 신뢰된다고 확인되면 기본 패턴 집합을 끌 수 있습니다:

```go
cfg := json.DefaultConfig()
cfg.DisableDefaultPatterns = true
err := json.Unmarshal(data, &v, cfg)
```

`__proto__`, `constructor[`, `prototype.` 세 핵심 패턴은 이 스위치와 무관하게 **항상 차단**됩니다. 규칙만 추가하고 싶다면 기본 집합을 끄지 말고 `AdditionalDangerousPatterns` 로 커스텀 패턴을 추가하세요.

**Q: 100MB 보다 큰 문서가 `ErrSizeLimit` 으로 거부됩니다. 어떻게 처리하나요?**

두 가지 길이 있습니다: 정말 전체를 처리해야 한다면 `cfg.MaxJSONSize` 를 키우세요; 더 권장하는 방식은 스트리밍 처리로 전환하는 것입니다 (`NewStreamIterator` / `NewStreamObjectIterator` 로 요소별 읽기, 또는 JSONL 계열로 줄별 처리) — 통째로 메모리에 올리지 않습니다. 자세한 내용은 [대용량 파일 처리](../streaming/large-files) 를 참조하세요.

## 다음 단계

- [빠른 시작](./) — 5 분 안에 핵심 기능 시작
- [경로 표현식 문법](./path-syntax) — 경로 쿼리 문법 배우기
- [치트시트](./cheatsheet) — API 빠른 참조
