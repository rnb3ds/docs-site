---
sidebar_label: "성능 최적화"
title: "성능 최적화 - CyberGo JSON | 고성능 가이드"
description: "CyberGo JSON 성능 최적화: EnableCache/CacheTTL 캐시, ParallelThreshold 병렬화, PreParse 사전 파싱, WarmupCache 워밍업과 CompilePath 컴파일, 객체 풀 재사용, 벤치마크로 고빈도 JSON 성능을 높입니다."
sidebar_position: 1
---

# 성능 최적화

JSON 처리 성능을 최적화하는 전략과 기법입니다.

## 프로세서 재사용

### Processor 인스턴스 재사용

```go
// ✅ 패키지 레벨 함수는 전역 Processor 를 자동 재사용
for _, item := range dataList {
	val := json.GetString(item, "name")
}

// ✅ 또는 인스턴스를 명시적으로 재사용 (커스텀 설정에 적합)
processor, err := json.New()
if err != nil {
	panic(err)
}
defer processor.Close()
for _, item := range dataList {
	val := processor.GetString(item, "name")
}
```

## 라이브러리 내장 성능 메커니즘

라이브러리가 스스로 어떤 최적화를 하는지 알아 두면 바퀴를 다시 발명하지 않아도 됩니다:

| 메커니즘 | 역할 | 해야 할 일 |
|------|------|------------|
| 빠른 경로 감지 | 단일 키 속성 접근 (예: `name`, 경로가 문자/숫자/밑줄만 포함) 을 조회 테이블로 식별해, 캐시가 꺼져 있을 때는 재귀 프로세서를 우회해 루트 객체에서 바로 값을 가져옴 | 없음 — 자동 적용; 캐시가 켜져 있으면 (기본값) 같은 유형의 접근은 파싱/결과 캐시로 가속 |
| FastEncoder | 단순 타입 (map/slice/기본 값) 인코딩 시 리플렉션 없음 | 없음 — 자동 적용 |
| 결과 캐시 | 같은 (JSON, 경로) 의 반복 쿼리가 캐시에 적중 | 기본 활성화; `CacheTTL`/`MaxCacheSize` 로 규모 제어 |
| 객체 풀 | `IterableValue`, 인코딩 버퍼, Config 등을 재사용해 GC 부담 감소 | `parsed.Release()` / `cp.Release()` 로 반납 |
| 컴파일 경로 캐시 | 자주 쓰는 경로의 파싱 결과를 전역 캐시 | 고빈도 경로는 [`CompilePath`](../api-reference/processor/query#compilepath) 사용 |

::: tip CacheSharedResults: 읽기 많고 쓰기 적은 시나리오의 제로카피 스위치
`Config.CacheSharedResults = true`이면 캐시 적중 시 `Get`이 공유 값을 직접 반환하고 **방어적 깊은 복사를 건너뜁니다** — 큰 하위 트리를 반복 읽을 때의 할당과 CPU 오버헤드가 눈에 띄게 줄어듭니다. 계약은 호출자가 반환된 `map[string]any`/`[]any`를 **수정하지 않는 것**입니다 (원시 값은 항상 안전). 기본은 꺼짐 (읽을 때 복사) 이며, 워크로드 특성에 따라 명시적으로 켜세요.
:::

## 최적화 의사결정 경로

성능 문제가 있을 때는 정해진 순서대로 진행하며, 각 단계마다 **측정 결과를 근거로** 다음 단계로 넘어갈지 결정합니다:

| 단계 | 수단 | 적용 신호 |
|------|------|----------|
| ① 먼저 측정 | 벤치마크 + 메모리 분석 (아래 참조), `GetStats()` 로 캐시 적중률 확인 | 모든 최적화 이전 — 데이터 없이는 최적화 방향도 없음 |
| ② 재사용 | 패키지 레벨 함수 또는 공유 `Processor` 인스턴스 (캐시와 객체 풀 재사용) | 요청마다 `json.New()`, 프로세서를 잦게 재생성 |
| ③ 경로 사전 컴파일 | [`CompilePath`](../api-reference/processor/query#compilepath) + `GetCompiled` | **같은 경로**로 수많은 서로 다른 JSON 쿼리 (경로 파싱이 반복 오버헤드가 됨) |
| ④ 사전 파싱 | [`PreParse`](../api-reference/processor/query#preparse) + `GetFromParsed` | **같은 JSON** 을 여러 경로로 연속 쿼리 (반복 파싱이 핫스팟이 됨) |
| ⑤ 병렬 | `NewParallelIterator` / `StreamJSONLParallel` ([동시 처리](./concurrency) 참조) | CPU 집약적 배치 처리; 행 수가 많고 개별 행 처리가 무거움 |

::: tip 먼저 측정하고 최적화하기
기본 설정 (캐시 활성화 + 객체 풀 + 빠른 경로) 은 대부분의 시나리오를 커버합니다. 먼저 벤치마크로 핫스팟을 찾아 병목이 어디에 있는지 확인한 뒤, ③④⑤ 의 명시적 최적화를 사용하세요 — 이들은 모두 어느 정도의 유연성을 희생해 속도를 얻습니다. 작은 배열 (`ParallelThreshold` 기본값 10 미만) 은 병렬 처리가 오히려 더 느립니다.
:::

## 메모리 최적화

### 할당 줄이기

```go
// ✅ Marshal 은 바이트 슬라이스 반환
bytes, _ := json.Marshal(data)

// ✅ EncodeWithConfig 는 문자열 반환 (Encode 는 폐기됨)
s, _ := json.EncodeWithConfig(data)
```

### 버퍼 사전 할당

```go
// 대량 데이터 처리 시 사전 할당
buf := make([]byte, 0, 1024*1024)
```

## 파일 처리

### 대용량 파일에는 구조화된 반복 사용

```go
// ❌ 한 번에 로드
data, _ := os.ReadFile("large.json")
parsed, _ := json.ParseAny(string(data))

// ✅ 구조화된 반복 (주의: 여전히 전체 파일을 메모리에 로드함)
processor, err := json.New()
if err != nil {
	panic(err)
}
defer processor.Close()
processor.ForeachFile("large.json", func(key any, item *json.IterableValue) error {
	processItem(item)
	return nil
})
```

### NDJSON 처리

```go
// StreamLinesInto 로 스트리밍 처리
file, _ := os.Open("data.jsonl")
defer file.Close()
entries, err := json.StreamLinesInto[LogEntry](file, func(lineNum int, entry LogEntry) error {
	// 각 JSON 행 처리
	return nil
})
```

## 동시 처리

### 내장 ParallelIterator 우선 사용

라이브러리에 병렬 이터레이터가 내장되어 있어 세마포어와 goroutine 풀을 직접 작성할 필요가 없으며, 자동 배치와 취소를 지원합니다:

```go
items, _ := json.GetArray(data, "items")
it := json.NewParallelIterator(items)
defer it.Close()

// 병렬 매핑
doubled, err := it.Map(func(i int, v any) (any, error) {
	return processItem(v), nil
})

// 또는 병렬 순회 / 필터 (WithContext 버전은 취소에 응답)
_ = it.ForEach(func(i int, v any) error { return nil })
_ = it.ForEachWithContext(ctx, func(i int, v any) error { return nil })
filtered := it.Filter(func(i int, v any) bool { return v != nil })
```

### 완전한 제어가 필요할 때: 직접 작성한 Worker Pool

```go
items := json.GetArray(data, "items")
jobs := make(chan any, len(items))

// 고정 수량의 worker 를 시작해 goroutine 을 재사용, 잦은 생성/소멸 회피
var wg sync.WaitGroup
workers := runtime.NumCPU()
for w := 0; w < workers; w++ {
	wg.Add(1)
	go func() {
		defer wg.Done()
		for item := range jobs {
			processItem(item)
		}
	}()
}

// 작업 분배 후 채널을 닫아 worker 에게 종료 알림
for _, item := range items {
	jobs <- item
}
close(jobs)
wg.Wait()
```

::: tip 병렬 임계값
`Config.ParallelThreshold` (기본 10) 는 라이브러리 내부 병렬 경로의 트리거 하한을 제어합니다; JSONL 병렬 처리의 worker 수는 `Config.JSONLWorkers` (기본 4) 또는 `StreamJSONLParallel(reader, workers, ...)` 매개변수로 제어합니다. 자세한 내용은 [동시 처리](./concurrency)를 참조하세요.
:::

## 설정 최적화

### 시나리오에 맞게 설정 조정

```go
// 소량 데이터: 느슨한 설정
smallCfg := json.DefaultConfig()
smallCfg.MaxNestingDepthSecurity = 200 // 최대 허용값 (검증 범위 10-200)

// 신뢰할 수 없는 입력: 보안 설정
safeCfg := json.SecurityConfig()
safeCfg.MaxJSONSize = 1024 * 1024
```

### 불필요한 기능 비활성화

```go
// Hook 이 필요 없다면 구성하지 않기
cfg := json.DefaultConfig() // 최소 설정
```

## 캐시 전략

### 파싱 결과 캐싱

```go
var cache sync.Map

func getOrParse(key string, data []byte) (any, error) {
	if val, ok := cache.Load(key); ok {
		return val, nil
	}

	result, err := json.ParseAny(string(data))
	if err != nil {
		return nil, err
	}

	cache.Store(key, result)
	return result, nil
}
```

### 경로 쿼리 캐싱

```go
// 자주 쓰는 경로 사전 컴파일 (Processor 사용)
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()
path1, _ := p.CompilePath("user.name")
path2, _ := p.CompilePath("user.email")
path3, _ := p.CompilePath("items[*].id")
```

## 벤치마크

### 성능 테스트 예제

```go
func BenchmarkParse(b *testing.B) {
	data := []byte(`{"name": "test", "items": [1, 2, 3]}`)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = json.ParseAny(string(data))
	}
}

func BenchmarkGetString(b *testing.B) {
	data := `{"user": {"name": "CyberGo", "email": "test@example.com"}}`

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		json.GetString(data, "user.name")
	}
}
```

### 최적화 수단 A/B 비교

최적화가 실제로 효과가 있는지 검증하는 가장 확실한 방법은 '최적화 전 / 후'를 한 쌍의 벤치마크로 작성해 비교 실행하는 것입니다. `b.ReportAllocs()` 를 사용하면 `B/op` 과 `allocs/op` 이 함께 출력되며, `go test -bench=. -benchmem` 으로 실행합니다:

```go
// 베이스라인: 반복 Get (매번 독립적으로 캐시 키 조회 + 탐색)
func BenchmarkRepeatGet(b *testing.B) {
	data := `{"user": {"name": "CyberGo"}, "items": [1, 2, 3]}`
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = json.Get(data, "user.name")
		_, _ = json.Get(data, "items")
	}
}

// 후보 최적화: PreParse 로 한 번 파싱, GetFromParsed 로 여러 번 쿼리
func BenchmarkPreParse(b *testing.B) {
	data := `{"user": {"name": "CyberGo"}, "items": [1, 2, 3]}`
	p, err := json.New()
	if err != nil {
		b.Fatal(err)
	}
	defer p.Close()

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		parsed, err := p.PreParse(data)
		if err != nil {
			b.Fatal(err)
		}
		_, _ = p.GetFromParsed(parsed, "user.name")
		_, _ = p.GetFromParsed(parsed, "items")
		parsed.Release()
	}
}
```

::: tip 결과 해석
두 벤치마크의 `ns/op` 과 `allocs/op` 을 비교하세요: 사전 파싱 벤치마크가 눈에 띄게 낮다면 해당 핫스팟의 오버헤드가 주로 반복 파싱/캐시 키 조회에 있다는 뜻이므로 사전 파싱을 도입할 가치가 있습니다; 차이가 무시할 만하면 [최적화 의사결정 경로](#최적화-의사결정-경로)에 따라 다음 계층 (인코딩, 락 경합 등) 을 계속 조사합니다.
:::

### 메모리 분석

```go
func TestMemoryUsage(t *testing.T) {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	before := m.Alloc

	// 작업 수행
	data := generateLargeJSON()
	_, _ = json.ParseAny(data)

	runtime.ReadMemStats(&m)
	after := m.Alloc

	fmt.Printf("메모리 사용: %d bytes\n", after-before)
}
```

## 성능 비교

| 작업 | 소량 데이터 (<1KB) | 중간 데이터 (1MB) | 대량 데이터 (>10MB) |
|------|---------------|----------------|----------------|
| `Parse` | 권장 | 권장 | 비권장 |
| `ForeachFile` | 불필요 | 선택 | 권장 |

## 관련 문서

- [대용량 파일 처리](../streaming/large-files)
- [오류 처리](./error-handling)
