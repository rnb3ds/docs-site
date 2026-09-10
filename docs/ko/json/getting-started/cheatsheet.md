---
sidebar_label: "치트시트"
title: "치트시트 - CyberGo JSON | API 빠른 참조"
description: "CyberGo JSON API 치트시트: 경로 쿼리, Set/Delete 수정, 배치 작업, 직렬화·포맷팅, 파일 읽기/쓰기, 검증, 반복·스트리밍 JSONL, 캐시·보안 확장 등 47 개 패키지 함수 전체와 고빈도 조합 패턴, Processor 용법을 한 페이지로 조회합니다."
sidebar_position: 4
---

# 치트시트

자주 쓰는 API 와 코드 조각을 빠르게 찾아봅니다.

## 경로 쿼리

| 작업 | 함수 | 예시 |
|------|------|------|
| 문자열 가져오기 | `GetString` | `json.GetString(data, "user.name")` |
| 정수 가져오기 | `GetInt` | `json.GetInt(data, "count")` |
| 부동소수점 가져오기 | `GetFloat` | `json.GetFloat(data, "price")` |
| 불리언 가져오기 | `GetBool` | `json.GetBool(data, "enabled")` |
| 배열 가져오기 | `GetArray` | `json.GetArray(data, "items")` |
| 객체 가져오기 | `GetObject` | `json.GetObject(data, "user")` |
| 임의 값 가져오기 | `Get` | `json.Get(data, "items[0].id")` |
| 제네릭 가져오기 | `GetTyped[T]` | `json.GetTyped[User](data, "user")` |
| 안전하게 가져오기 (panic 없음) | `SafeGet` | `json.SafeGet(data, "user.age")` |
| 배치 가져오기 | `GetMultiple` | `json.GetMultiple(data, []string{"a", "b"})` |
| 취소 가능한 가져오기 | `GetWithContext` | `json.GetWithContext(ctx, data, "user.name")` |

### 기본값 사용

`GetString`, `GetInt`, `GetFloat`, `GetBool` 등의 함수는 선택적 기본값 매개변수를 지원합니다:

| 작업 | 함수 | 예시 |
|------|------|------|
| 문자열 | `GetString` | `json.GetString(data, "name", "unknown")` |
| 정수 | `GetInt` | `json.GetInt(data, "count", 0)` |
| 부동소수점 | `GetFloat` | `json.GetFloat(data, "rate", 0.5)` |
| 불리언 | `GetBool` | `json.GetBool(data, "debug", false)` |

## 수정 작업

| 작업 | 함수 | 예시 |
|------|------|------|
| 값 설정 | `Set` | `json.Set(data, "user.name", "Alice")` |
| 배치 설정 | `SetMultiple` | `json.SetMultiple(data, map[string]any{"a": 1, "b": 2})` |
| 경로 생성 설정 | `SetCreate` | `json.SetCreate(data, "a.b.c", 1)` |
| 배치 경로 생성 설정 | `SetMultipleCreate` | `json.SetMultipleCreate(data, updates)` |
| 값 삭제 | `Delete` | `json.Delete(data, "user.temporary")` |
| 삭제 후 정리 | `DeleteClean` | `json.DeleteClean(data, "user.temporary")` |

```go
// 값 설정
result, err := json.Set(`{"user":{}}`, "user.name", "Alice")
// {"user":{"name":"Alice"}}

// 여러 필드를 하나씩 설정
result, err = json.Set(data, "user.name", "Bob")
result, err = json.Set(result, "user.age", 25)

// 삭제
result, err = json.Delete(data, "user.temporary")
```

### 배치 작업 (한 번의 호출로 여러 작업)

```go
data := `{"user":{"name":"Alice","temp":true}}`

results, err := json.ProcessBatch([]json.BatchOperation{
	{ID: "n", Type: "get", JSONStr: data, Path: "user.name"},
	{ID: "a", Type: "set", JSONStr: data, Path: "user.age", Value: 30},
	{ID: "d", Type: "delete", JSONStr: data, Path: "user.temp"},
	{ID: "v", Type: "validate", JSONStr: data},
})
if err != nil {
	panic(err)
}
for _, r := range results {
	fmt.Println(r.ID, r.Result, r.Error)
}
```

::: tip
`BatchOperation.Type` 은 `get` / `set` / `delete` / `validate` 네 가지를 지원하며, 각 작업은 `JSONStr` 로 데이터를 나릅니다; `BatchResult` 는 `ID` 에 대응해 `Result` 와 `Error` 를 반환합니다. 자세한 내용은 [배치 작업](../api-reference/functions/batch) 을 참조하세요.
:::

## 직렬화와 인코딩

| 작업 | 함수 | 예시 |
|------|------|------|
| 인코딩 (`[]byte` 출력) | `Marshal` | `json.Marshal(data)` |
| 인코딩 (`string` 출력) | `EncodeWithConfig` | `json.EncodeWithConfig(data)` |
| 포맷팅 인코딩 (`[]byte`) | `MarshalIndent` | `json.MarshalIndent(data, "", "  ")` |
| 포맷팅 인코딩 (`string`) | `EncodePretty` | `json.EncodePretty(data)` |
| 디코딩 | `Unmarshal` | `json.Unmarshal(bytes, &v)` |
| 파싱 | `Parse` | `var v T; json.Parse(jsonStr, &v)` |
| any 로 파싱 | `ParseAny` | `json.ParseAny(jsonStr)` |
| JSON 텍스트 미화 | `Prettify` | `json.Prettify(jsonStr)` |
| JSON 텍스트 압축 (buffer) | `Compact` | `json.Compact(&buf, []byte(data))` |
| JSON 텍스트 압축 (string) | `CompactString` | `json.CompactString(jsonStr)` |
| 들여쓰기 재배치 | `Indent` | `json.Indent(&buf, src, "", "  ")` |
| HTML 이스케이프 | `HTMLEscape` | `json.HTMLEscape(&buf, src)` |
| 키-값 쌍을 객체로 인코딩 | `EncodeBatch` | `json.EncodeBatch(map[string]any{"a": 1})` |
| 필드 추출 인코딩 | `EncodeFields` | `json.EncodeFields(user, []string{"name"})` |
| 값 목록을 배열로 인코딩 | `EncodeStream` | `json.EncodeStream([]any{1, 2})` |

`json.Encode` 는 폐기 예정입니다 (`EncodeWithConfig` 와 동등, 향후 메이저 버전에서 제거). 신규 코드는 `Marshal` 또는 `EncodeWithConfig` 를 사용하세요. 포맷팅 함수의 상세한 선택 기준은 [출력 포맷팅](./print) 을 참조하세요.

```go
// 인코딩
b, err := json.Marshal(map[string]any{"name": "test"})

// 포맷팅 출력
pretty, err := json.MarshalIndent(data, "", "  ")

// 구조체로 파싱
var result map[string]any
err = json.Parse(`{"name": "test"}`, &result)

// any 로 파싱
parsed, err := json.ParseAny(`{"name": "test"}`)

// JSON 문자열 포맷팅
pretty, err = json.Prettify(`{"name":"Alice","age":30}`)
```

## 파일 읽기/쓰기

| 작업 | 함수 | 예시 |
|------|------|------|
| JSON 파일을 텍스트로 읽기 | `LoadFromFile` | `json.LoadFromFile("config.json")` |
| 임의의 Reader 읽기 | `LoadFromReader` | `json.LoadFromReader(resp.Body)` |
| 값을 파일에 쓰기 | `SaveToFile` | `json.SaveToFile("out.json", data)` |
| 인코딩 후 파일 쓰기 | `MarshalToFile` | `json.MarshalToFile("out.json", v)` |
| 파일을 읽어 디코딩 | `UnmarshalFromFile` | `json.UnmarshalFromFile("in.json", &v)` |
| 값을 Writer 에 쓰기 | `SaveToWriter` | `json.SaveToWriter(w, data)` |

```go
// 읽고 쿼리
data, err := json.LoadFromFile("config.json")
if err != nil {
	panic(err)
}
env := json.GetString(data, "env", "dev")

// 구조체로 한 번에
var cfg Config
if err := json.UnmarshalFromFile("config.json", &cfg); err != nil {
	panic(err)
}
```

::: tip
파일 경로는 보안 검증을 거칩니다 (디렉터리 순회와 심볼릭 링크 공격 거부). 신뢰할 수 없는 경로도 차단됩니다. 자세한 내용은 [파일 I/O](../api-reference/functions/file-io) 를 참조하세요.
:::

## 검증

| 작업 | 함수 | 예시 |
|------|------|------|
| 빠른 검증 | `Valid` | `json.Valid([]byte(data))` |
| 검증하고 원인 가져오기 | `ValidWithConfig` | `json.ValidWithConfig(data)` |
| Schema 검증 | `ValidateSchema` | `json.ValidateSchema(data, schema)` |

```go
// 빠른 검증
if json.Valid([]byte(data)) {
	// 유효한 JSON
}

// 실패 원인이 필요할 때
ok, err := json.ValidWithConfig(data)
if !ok {
	fmt.Println("유효하지 않은 JSON:", err)
}

// Schema 검증
schema := &json.Schema{
	Type:     "object",
	Required: []string{"name"},
	Properties: map[string]*json.Schema{
		"name": {Type: "string"},
		"age":  {Type: "number"},
	},
}
p, err := json.New()
if err != nil {
	panic(err)
}
errors, _ := p.ValidateSchema(data, schema)
```

## 유틸리티 함수

| 작업 | 함수 | 예시 |
|------|------|------|
| 비교 | `CompareJSON` | `json.CompareJSON(a, b)` |
| 병합 | `MergeJSON` | `json.MergeJSON(a, b)` |
| 여러 개 병합 | `MergeMany` | `json.MergeMany([]string{s1, s2, s3})` |

```go
// 비교 (키 순서와 숫자 정밀도 무시)
equal, _ := json.CompareJSON(`{"a":1.0,"b":2}`, `{"b":2,"a":1}`)
fmt.Println("Equal:", equal) // true (순서와 정밀도 무시)

// JSON 병합
base := `{"database":{"host":"localhost","port":5432},"debug":false}`
override := `{"database":{"host":"prod-server","ssl":true},"monitoring":true}`

// 병합
merged, _ := json.MergeJSON(base, override)
// 결과: {"database":{"host":"prod-server","port":5432,"ssl":true},"debug":false,"monitoring":true}

// 여러 개 병합
result, _ := json.MergeMany([]string{
	`{"a":1}`,
	`{"b":2}`,
	`{"c":3}`,
})
```

## Processor 메서드

```go
// 프로세서 생성
processor, err := json.New()
if err != nil {
	panic(err)
}
defer processor.Close()

// 값 가져오기
result := processor.GetString(data, "user.profile.name")

// 안전하게 가져오기 (AccessResult 반환)
accessResult := processor.SafeGet(data, "user.age")
age, err := accessResult.AsInt()
```

### 설정과 함께 생성

```go
// 기본 설정
processor, err := json.New(json.DefaultConfig())

// 보안 설정 (신뢰할 수 없는 입력 처리)
processor, err = json.New(json.SecurityConfig())

// 커스텀 설정
cfg := json.DefaultConfig()
cfg.CreatePaths = true
processor, err = json.New(cfg)
```

## 스트리밍 처리

### 반복 함수군

| 작업 | 함수 | 특징 |
|------|------|------|
| 배열/객체 순회 | `Foreach` | 가장 단순, 오류 반환 없음 |
| 순회하며 중단 가능 | `ForeachWithError` | 콜백이 `error` / `item.Break()` 반환 |
| 지정 경로 순회 | `ForeachWithPath` | `Foreach(data, path, ...)` 의 명시적 경로판 |
| 중첩 깊이 순회 | `ForeachNested` | 모든 수준을 재귀 |
| 순회하며 다시 쓰기 | `ForeachReturn` | 수정된 새 JSON 반환 |
| 현재 경로 함께 전달 | `ForeachWithPathAndIterator` | 콜백에 `currentPath` 포함, 중단 제어 가능 |
| 대용량 파일 순회 | `ForeachFile` | 스트리밍 읽기, 통째로 메모리에 올리지 않음 |
| 파일 청크 순회 | `ForeachFileChunked` | `chunkSize` 단위 배치 콜백 |

```go
data := `{"users":[{"name":"Alice"},{"name":"Bob"}]}`

// 간단한 순회
err := json.ForeachWithPath(data, "users", func(key any, item *json.IterableValue) {
	fmt.Println(key, item.GetString("name"))
})

// 조기 종료가 필요하면 WithError 변형 사용 (item.Break() 반환 시 중단)
err = json.ForeachWithError(data, "users", func(key any, item *json.IterableValue) error {
	if item.GetString("name") == "Bob" {
		return item.Break() // 반복 중지
	}
	return nil
})
```

### 동시성 처리 (ParallelIterator)

```go
items, _ := json.GetArray(`[1,2,3,4,5,6]`, ".")
it := json.NewParallelIterator(items)

// 병렬 매핑
doubled, err := it.Map(func(i int, v any) (any, error) {
	return v.(float64) * 2, nil
})

// 병렬 필터 / 순회 (자동 분할)
_ = it.Filter(func(i int, v any) bool { return v.(float64) > 2 })
_ = it.ForEach(func(i int, v any) error { return nil })
```

### 스트리밍 이터레이터 (StreamIterator / StreamObjectIterator)

```go
f, _ := os.Open("huge.json")
defer f.Close()

// 대형 배열을 요소별로 스트리밍 처리
it, err := json.NewStreamIterator(f)
if err != nil {
	panic(err)
}
for it.Next() {
	val := it.Value() // 요소별 처리, 메모리 사용량 일정
	_ = val
	_ = it.Index()
}
if err := it.Err(); err != nil {
	panic(err) // 스트림에서 발생한 파싱 오류
}

// 대형 객체를 키별로 스트리밍 처리
oit, err := json.NewStreamObjectIterator(f)
for oit.Next() {
	fmt.Println(oit.Key(), oit.Value())
}
```

### Processor.ForeachFile (대용량 파일)

```go
// 대용량 파일 처리
processor, err := json.New()
if err != nil {
	panic(err)
}
defer processor.Close()

err = processor.ForeachFile("large-data.json", func(key any, item *json.IterableValue) error {
	// 데이터 항목 처리
	id := item.GetInt("id")
	name := item.GetString("name")
	return nil // item.Break() 반환으로 중단 가능
})
```

### NDJSON/JSONL

```go
// JSONL 파싱
results, err := json.ParseJSONL(jsonlBytes)

// 제네릭 파싱 (StreamLinesInto 사용)
file, _ := os.Open("data.jsonl")
defer file.Close()
users, err := json.StreamLinesInto[User](file, func(lineNum int, user User) error {
	return nil
})

// 스트리밍 쓰기
outputFile, _ := os.Create("output.jsonl")
defer outputFile.Close()
writer := json.NewJSONLWriter(outputFile)
_ = writer.Write(map[string]any{"name": "Alice"})
_ = writer.Write(map[string]any{"name": "Bob"})

// 멀티 워커 병렬 줄별 처리
err = json.StreamJSONLParallel(file, 4, func(lineNum int, item *json.IterableValue) error {
	return nil
})

// NDJSONProcessor: 줄 번호 포함, 객체 단위 콜백
np := json.NewNDJSONProcessor()
err = np.ProcessFile("events.ndjson", func(lineNum int, obj map[string]any) error {
	fmt.Println(lineNum, obj)
	return nil
})
```

## 설정 옵션

```go
// 권장 방식: 기본 설정 기반으로 수정
cfg := json.DefaultConfig()
cfg.MaxJSONSize = 200 * 1024 * 1024 // 커스텀 크기 제한
cfg.FullSecurityScan = true         // 전체 보안 스캔 활성화
```

### 설정 프리셋

```go
// 기본 설정
cfg := json.DefaultConfig()

// 보안 설정 (신뢰할 수 없는 입력 처리)
// cfg = json.SecurityConfig()

// 포맷팅 설정
// cfg = json.PrettyConfig()
```

## 경로 문법

| 문법 | 설명 | 예시 |
|------|------|------|
| `.property` | 속성 접근 | `user.name` |
| `[n]` | 배열 인덱스 | `items[0]` |
| `[*]` | 와일드카드 | `items[*].id` |
| `[start:end]` | 슬라이스 | `items[0:5]` |
| `[start:end:step]` | 보폭을 가진 슬라이스 | `items[0:10:2]` |
| `{field1,field2}` | 필드 추출 | `user{name,email}` |
| `{flat:field}` | 평면화 추출 | `groups{flat:tags}` |
| `[+]` | 추가 | `items[+]` |
| `[-1]` | 음수 인덱스 (끝) | `items[-1]` |
| `/key/key` | JSON Pointer (RFC 6901) | `/user/name` |

## 자주 쓰는 패턴

### 중첩 값을 안전하게 가져오기

```go
// 기본값을 갖는 조회 함수 사용
name := json.GetString(data, "user.profile.name", "unknown")

// 오류 타입을 구분해야 할 때는 Get 사용
val, err := json.Get(data, "user.profile.name")
if err != nil {
	if errors.Is(err, json.ErrPathNotFound) {
		// 키가 존재하지 않음
	} else if errors.Is(err, json.ErrInvalidJSON) {
		// JSON 형식 오류
	}
	// 나머지 오류 (타입 충돌, 한도 초과) 는 컨텍스트를 담은 JsonsError 이므로 그냥 기록하면 됨
}
```

### 기본값으로 가져오기

```go
// GetString/GetInt 등의 함수는 선택적 기본값 매개변수 지원
timeout := json.GetInt(data, "timeout", 30)
debug := json.GetBool(data, "debug", false)
name := json.GetString(data, "user.nickname", "unknown")
```

### 타입 스위치

```go
val, _ := json.Get(data, "value")
switch v := val.(type) {
case string:
	fmt.Println("문자열:", v)
case float64:
	fmt.Println("숫자:", v)
case bool:
	fmt.Println("불리언:", v)
case []any:
	fmt.Println("배열:", len(v), "개 요소")
case map[string]any:
	fmt.Println("객체:", len(v), "개 키")
}
```

### 파일 읽기 → 필드 수정 → 쓰기

`Set` 은 새 문자열을 반환하고, `SaveToFile` 은 JSON 문자열을 받으면 파싱 후 다시 인코딩합니다 (이중 인용부호가 붙지 않음). `PrettyConfig` 와 함께 쓰면 파일 가독성을 유지할 수 있습니다:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	data, err := json.LoadFromFile("config.json")
	if err != nil {
		panic(err)
	}

	updated, err := json.Set(data, "server.port", 8080)
	if err != nil {
		panic(err)
	}

	if err := json.SaveToFile("config.json", updated, json.PrettyConfig()); err != nil {
		panic(err)
	}
	fmt.Println("업데이트 완료")
}
```

### API 응답에서 필드 배치로 가져오기

필드 하나만 필요하면 와일드카드로 수집하고, 서로 다른 여러 경로가 필요하면 `GetMultiple` (한 번만 파싱) 을 사용하세요:

```go
resp := `{"code":0,"data":{"users":[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}]}}`

// 필드 하나만: 와일드카드 수집
names, _ := json.GetArray(resp, "data.users[*].name") // ["Alice", "Bob"]

// 서로 다른 여러 경로: 한 번 파싱, 배치 조회
vals, err := json.GetMultiple(resp, []string{"code", "data.users[0].id"})
if err != nil {
	panic(err)
}
fmt.Println(names, vals["data.users[0].id"]) // [Alice Bob] 1
```

### 요소별 다시 쓰기 (ForeachReturn)

콜백에서 `item.GetData()` 로 작업 사본의 참조를 얻어 map/slice 의 내용을 수정하면 반환되는 새 JSON 에 반영됩니다 (`ForeachReturn` 이 순회하는 것은 루트 컨테이너):

```go
data := `[{"name":"Alice","active":false},{"name":"Bob","active":false}]`

updated, err := json.ForeachReturn(data, func(key any, item *json.IterableValue) {
	m, ok := item.GetData().(map[string]any)
	if !ok {
		return
	}
	m["active"] = true
})
if err != nil {
	panic(err)
}
// 두 요소의 active 모두 true 로 변경 (출력 필드 순서는 원문과 다를 수 있음)
```

::: tip 스칼라는 제자리 교체 불가
`GetData()` 참조 교체는 map 필드, 배열 요소를 수정할 때 적합합니다; 요소 전체가 스칼라일 때는 IterableValue 로 제자리 교체할 수 없으므로 `Set(data, "items[*]", v)` 또는 건별 `Set` 을 사용하세요.
:::

### 설정 병합

```go
// 기본 설정 + 사용자 설정
defaults := `{"timeout": 30, "retries": 3}`
userConfig := `{"timeout": 60, "debug": true}`

merged, _ := json.MergeJSON(defaults, userConfig)
// {"timeout": 60, "retries": 3, "debug": true}
```

### 오류 처리

```go
val, err := json.Get(data, path)
if err != nil {
	// 흔한 센티넬: 키 없음 / JSON 형식 오류 / 크기 제한 초과 / 중첩 깊이 초과
	// (타입 충돌은 설명적 JsonsError 반환, ErrTypeMismatch 센티넬과 불일치)
	switch {
	case errors.Is(err, json.ErrPathNotFound):
	case errors.Is(err, json.ErrInvalidJSON):
	case errors.Is(err, json.ErrSizeLimit):
	case errors.Is(err, json.ErrDepthLimit):
	default:
		// 전체 오류 기록 (작업 이름과 경로 포함)
		fmt.Println(err)
	}

	// 클라이언트에 반환할 때는 SafeError 로 마스킹해 경로와 내부 세부가 새어 나가지 않게 함
	_ = json.SafeError(err)
}
```

## 캐시 관리

```go
// 캐시 예열
paths := []string{"user.name", "user.email", "items[*].id"}
result, _ := json.WarmupCache(data, paths)
fmt.Printf("예열 성공: %d/%d\n", result.Successful, result.TotalPaths)

// 캐시 지우기
json.ClearCache()

// 통계 가져오기
stats := json.GetStats()
fmt.Printf("캐시 적중률: %.2f%%\n", stats.HitRatio*100)

// 상태 검사 (캐시, 메모리 등 항목별)
health := json.GetHealthStatus()
fmt.Println("정상:", health.Healthy)
```

## 전역 프로세서

```go
// 커스텀 전역 프로세서 설정
cfg := json.SecurityConfig()
p, err := json.New(cfg)
if err != nil {
	panic(err)
}
json.SetGlobalProcessor(p)

// 이후 모든 패키지 레벨 함수가 이 프로세서 사용
name := json.GetString(data, "user.name")

// 애플리케이션 종료 시 정리
defer json.ShutdownGlobalProcessor()
```

## 보안과 확장

```go
// 위험 패턴 관리 (기본적으로 <script>, javascript: 등을 차단)
for _, p := range json.ListDangerousPatterns() {
	fmt.Println(p.Pattern, p.Level) // Pattern 은 부분 문자열 매칭, Level 은 수준
}

// 커스텀 패턴 등록 (부분 문자열 매칭, 3 단계 처리 전략):
//
//	PatternLevelCritical 항상 차단 / Warning 엄격 모드에서 차단 / Info 기록만
json.RegisterDangerousPattern(json.DangerousPattern{
	Pattern: "eval(",
	Name:    "eval 호출 비활성화",
	Level:   json.PatternLevelCritical,
})

// Pattern 문자열로 해지
json.UnregisterDangerousPattern("eval(")

// 훅 팩토리: 로그 / 타이밍 / 오류 변환 / 입력 검증
p, _ := json.New()
p.AddHook(json.LoggingHook(slog.Default()))
p.AddHook(json.ErrorHook(func(ctx json.HookContext, err error) error {
	return fmt.Errorf("op %s: %w", ctx.Operation, err)
}))
p.AddHook(json.ValidationHook(func(jsonStr, path string) error {
	return nil // nil 이 아닌 값을 반환하면 이번 입력 거부
}))

// Config 체인 메서드
cfg := json.SecurityConfig()
cfg.AddHook(json.LoggingHook(slog.Default()))
cfg.AddDangerousPattern(json.DangerousPattern{Pattern: "exec("})
if err := cfg.Validate(); err != nil {
	panic(err) // 설정 자체 검사, 범위 벗어난 값을 미리 노출
}
clone := cfg.Clone() // 깊은 복사, 안전한 공유
```

## 관련 문서

- [패키지 함수](../api-reference/functions/) - 전체 API 레퍼런스
- [유틸리티 함수](../api-reference/helpers) - 타입 변환 도구
- [Processor](../api-reference/processor/) - 프로세서 메서드
- [설정](../api-reference/config) - 설정 옵션
- [타입 정의](../api-reference/types) - AccessResult, Schema 등
