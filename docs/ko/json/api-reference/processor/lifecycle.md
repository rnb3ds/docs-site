---
sidebar_label: "라이프사이클"
title: "Processor 수명 주기 - CyberGo JSON | API 레퍼런스"
description: "CyberGo JSON Processor 수명 주기: New 생성, Close 멱등 해제와 진행 중 작업 배출, IsClosed 상태 확인, GetStats 통계와 GetHealthStatus 모니터링, ClearCache 와 WarmupCache 캐시 관리로 동시성 안전 종료 보장."
sidebar_position: 11
---

# 수명 주기와 통계

Processor 는 완전한 수명 주기 관리, 캐시 제어 및 상태 모니터링 기능을 제공합니다.

## 수명 주기

### Close

시그니처: `func (p *Processor) Close() error`

프로세서를 닫고 리소스 (캐시, 보안 검증기, 훅 참조) 를 해제합니다. Processor 사용을 마친 후 이 메서드를 호출해야 합니다.

```go
processor, _ := json.New(json.DefaultConfig())
defer processor.Close()
```

::: tip 종료 의미
- **멱등이며 스레드 안전**: `Close` 를 반복 호출해도 한 번만 적용됩니다.
- **진행 중인 작업을 먼저 배수**: `Close` 는 진행 중인 작업이 끝나기를 기다립니다 (타임아웃 상한 있음); 타임아웃 후 프로세서는 새 작업을 거부하지만 (`IsClosed()` 가 `true`) 리소스는 온전히 유지되어 진행 중인 작업이 방해받지 않고 마무리됩니다.
- 닫힌 뒤 모든 작업은 `ErrProcessorClosed` 를 반환합니다.
- `Close` 는 인스턴스 간 공유되는 전역 캐시 (경로 타입 캐시, 구조체 인코더 캐시) 를 **정리하지 않습니다**; 프로세스 종료 전 완전한 정리는 [`ShutdownGlobalProcessor`](#전역-프로세서-관리) 를 사용하세요.
:::

### IsClosed

시그니처: `func (p *Processor) IsClosed() bool`

프로세서가 닫혔는지 확인합니다. '닫히는 중 (배수)' 상태에서도 마찬가지로 `true` 를 반환합니다 — 이 구간에는 새 작업이 이미 거부됩니다.

```go
if processor.IsClosed() {
	// 프로세서가 닫혀 있어 더 이상 사용할 수 없음
}
```

## 캐시 관리

### ClearCache

시그니처: `func (p *Processor) ClearCache()`

프로세서의 내부 캐시를 지웁니다.

```go
processor.ClearCache()
```

적합한 시나리오:
- 데이터 소스가 변경된 경우
- 메모리 사용량이 너무 높은 경우
- 강제 새로고침이 필요한 경우

### WarmupCache

시그니처: `func (p *Processor) WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)`

캐시를 예열하여 이후 작업 성능을 높입니다. 프로세서에 캐시가 켜져 있어야 합니다 (기본 켜짐), 아니면 오류를 반환합니다. 전체 예제와 `WarmupResult` 필드 설명은 [배치 작업](./batch#캐시-예열-warmupcache) 을 참조하세요.

```go
paths := []string{"user.name", "user.email", "items[*].id"}
result, err := processor.WarmupCache(data, paths)
if err != nil {
	panic(err)
}
fmt.Printf("%d 개 경로 예열 성공\n", result.Successful)
```

## 통계 정보

### GetStats

시그니처: `func (p *Processor) GetStats() Stats`

프로세서의 통계 정보를 가져옵니다.

```go
stats := processor.GetStats()
fmt.Printf("캐시 적중률: %.2f%%\n", stats.HitRatio*100)
fmt.Printf("캐시 크기: %d\n", stats.CacheSize)
```

**Stats 구조**:

```go
type Stats struct {
	CacheSize        int64         `json:"cache_size"`        // 캐시 항목 수
	CacheMemory      int64         `json:"cache_memory"`      // 캐시 메모리 사용량 (바이트)
	MaxCacheSize     int           `json:"max_cache_size"`    // 최대 캐시 크기
	HitCount         int64         `json:"hit_count"`         // 캐시 적중 횟수
	MissCount        int64         `json:"miss_count"`        // 캐시 미적중 횟수
	HitRatio         float64       `json:"hit_ratio"`         // 캐시 적중률
	CacheTTL         time.Duration `json:"cache_ttl"`         // 캐시 TTL
	CacheEnabled     bool          `json:"cache_enabled"`     // 캐시 활성화 여부
	IsClosed         bool          `json:"is_closed"`         // 프로세서 닫힘 여부
	MemoryEfficiency float64       `json:"memory_efficiency"` // 메모리 효율성
	OperationCount   int64         `json:"operation_count"`   // 총 작업 수
	ErrorCount       int64         `json:"error_count"`       // 총 오류 수
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `CacheSize` | `int64` | 현재 캐시 항목 수 |
| `CacheMemory` | `int64` | 캐시 메모리 사용량 (바이트) |
| `MaxCacheSize` | `int` | 최대 캐시 크기 제한 |
| `HitCount` | `int64` | 캐시 적중 횟수 |
| `MissCount` | `int64` | 캐시 미적중 횟수 |
| `HitRatio` | `float64` | 캐시 적중률 (0-1) |
| `CacheTTL` | `time.Duration` | 캐시 만료 시간 |
| `CacheEnabled` | `bool` | 캐시 활성화 여부 |
| `IsClosed` | `bool` | 프로세서 닫힘 여부 |
| `MemoryEfficiency` | `float64` | 메모리 효율성 |
| `OperationCount` | `int64` | 총 작업 횟수 |
| `ErrorCount` | `int64` | 총 오류 횟수 |

**필드 해석**:

- `OperationCount` / `ErrorCount`: 읽기/쓰기 작업 (`Get` / `GetMultiple` / `Set` / `SetMultiple` / `Delete` 등) 이 모두 누적됩니다; 수명 주기류 거부 (프로세서가 이미 닫힘, 동시성 초과) 는 오류 수에 포함되지 않습니다.
- `HitRatio`: 0–1 구간 (0.85 면 85%); `CacheEnabled=false` 면 적중 데이터가 없습니다.
- `CacheSize` / `CacheMemory` 는 캐시 실황이고 `MaxCacheSize` / `CacheTTL` 은 설정 상한입니다 ([Config](../config) 참조).
- `IsClosed`: [`IsClosed()`](#isclosed) 와 일치하며, 모니터링에서 프로세서가 예기치 않게 닫혔는지 탐지할 수 있습니다.

## 상태 확인

### GetHealthStatus

시그니처: `func (p *Processor) GetHealthStatus() HealthStatus`

프로세서의 상태를 가져옵니다.

```go
status := processor.GetHealthStatus()
if status.Healthy {
	fmt.Println("프로세서 정상")
} else {
	for name, check := range status.Checks {
		if !check.Healthy {
			fmt.Printf("확인 %s 실패: %s\n", name, check.Message)
		}
	}
}
```

**HealthStatus 구조** (전체 상태는 `HealthStatus` 에, 각 항목 결과는 `CheckResult`):

```go
type HealthStatus struct {
	Timestamp time.Time              `json:"timestamp"` // 확인 시간
	Healthy   bool                   `json:"healthy"`   // 전체 상태
	Checks    map[string]CheckResult `json:"checks"`    // 각 항목 확인 결과
}

type CheckResult struct {
	Healthy bool   `json:"healthy"` // 정상 여부
	Message string `json:"message"` // 상태 메시지
}
```

`HealthStatus` 필드:

| 필드 | 타입 | 설명 |
|------|------|------|
| `Timestamp` | `time.Time` | 확인 시간 |
| `Healthy` | `bool` | 전체 정상 여부 |
| `Checks` | `map[string]CheckResult` | 각 항목 확인 상세 |

`CheckResult` 필드:

| 필드 | 타입 | 설명 |
|------|------|------|
| `Healthy` | `bool` | 해당 항목이 정상인지 |
| `Message` | `string` | 상태 메시지 (실패 원인 등) |

::: tip 해석
`Checks` 는 각 항목 확인 (메트릭 수집 등) 의 결과 매핑이며, 어떤 항목이라도 비정상이면 `Healthy=false` 입니다. nil 프로세서이거나 메트릭 수집기가 초기화되지 않았으면 바로 `Healthy=false` 를 반환하고 `Checks` 에 원인 (예: `processor is nil`) 을 남깁니다. 메트릭 수집기는 `EnableMetrics=true` 일 때만 생성됩니다 — 꺼져 있으면 `GetHealthStatus` 가 `Healthy=false` 를 반환하고 `Checks` 에 `Metrics collector not initialized` 를 남깁니다; `Config.EnableHealthCheck` 필드는 예약으로 이 동작에 영향을 주지 않습니다 ([Config](../config#입력과-관측-가능성-스위치) 참조).
:::

## 확장 훅

### AddHook

시그니처: `func (p *Processor) AddHook(hook Hook)`

프로세서에 작업 훅을 추가합니다.

```go
processor.AddHook(&LoggingHook{})
processor.AddHook(json.TimingHook(&MetricsRecorder{}))
```

훅은 매 작업 전후에 호출되며, 다음에 사용할 수 있습니다:
- 로그 기록
- 성능 모니터링
- 메트릭 수집
- 감사 추적

### SetLogger

시그니처: `func (p *Processor) SetLogger(logger *slog.Logger)`

`SetLogger` 는 프로세서의 구조화된 로그 기록기를 원자적으로 교체합니다 (`component=json-processor` 필드 자동 추가), `nil` 을 전달하면 `slog.Default()` 로 폴백합니다. 디버깅과 런타임 진단에 사용됩니다.

```go
processor, _ := json.New()
defer processor.Close()

processor.SetLogger(slog.Default().With("component", "json-processor"))
```

### GetConfig

시그니처: `func (p *Processor) GetConfig() Config`

`GetConfig` 는 프로세서의 현재 설정 깊은 복사본을 반환합니다 (내부적으로 `Config.Clone` 사용). 반환값을 수정해도 프로세서에 영향을 주지 않습니다; nil 프로세서에 호출하면 제로값 Config 를 반환합니다.

```go
processor, _ := json.New()
defer processor.Close()

cfg := processor.GetConfig()
fmt.Printf("캐시 활성화: %v\n", cfg.EnableCache)
fmt.Printf("최대 JSON 크기: %d\n", cfg.MaxJSONSize)
```

## 전역 프로세서 관리

패키지 레벨 함수는 내부 전역 프로세서에 의존하며, 두 개의 패키지 레벨 관리 함수도 수명 주기 영역에 속합니다 (시그니처와 전체 예제는 [Processor 개요](./index#전역-프로세서-관리) 참조):

- `json.SetGlobalProcessor(p)` — 커스텀 프로세서를 전역으로 설정: `nil` 전달은 no-op, 이전 전역 프로세서가 먼저 닫히며, 함수는 스레드 안전합니다.
- `json.ShutdownGlobalProcessor()` — 전역 프로세서를 닫고 제거하는 동시에 인스턴스 간 공유 전역 캐시와 설정별 프로세서 캐시를 정리합니다. 장수명 서비스 종료 전 호출에 적합합니다.

## 사용 권장 사항

### 리소스 관리

```go
processor, _ := json.New()
defer processor.Close() // 리소스 해제 보장

// processor 사용...
```

### 성능 최적화

```go
// 자주 사용하는 경로 예열
processor.WarmupCache(data, []string{
	"user.name",
	"user.email",
	"items[*].id",
})

// 정기적으로 통계 확인
stats := processor.GetStats()
if stats.HitRatio < 0.5 {
	// 적중률이 낮음, 캐시 설정 조정 고려
}
```

### 모니터링 통합

```go
// 정기 상태 확인
go func() {
	ticker := time.NewTicker(30 * time.Second)
	for range ticker.C {
		status := processor.GetHealthStatus()
		if !status.Healthy {
			log.Printf("Processor unhealthy: %+v", status.Checks)
		}
	}
}()
```

## 관련 문서

- [Config](../config) - 설정 옵션 (캐시 크기, TTL 등)
- [Hook 훅 시스템](../../extensions/hooks) - 훅 자세한 사용 가이드
- [인터페이스 정의](../interfaces) - Hook 인터페이스
