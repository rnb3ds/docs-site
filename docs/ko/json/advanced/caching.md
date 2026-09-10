---
sidebar_label: "캐시와 사전 파싱"
title: "캐시와 사전 파싱 - CyberGo JSON | 캐시 전략"
description: "CyberGo JSON 내장 캐시와 사전 파싱: EnableCache 자동 캐싱, GetStats 적중률 모니터링, WarmupCache 예열, PreParse 한 번 파싱·반복 쿼리, CacheSharedResults 제로 카피와 ClearCache 정리, 고빈도 쿼리 레시피 제공."
sidebar_position: 3
---

# 캐시와 사전 파싱 전략

CyberGo JSON 은 **자동 캐시 하위 시스템**을 내장합니다: 파싱 결과와 경로 쿼리 결과가 자동 캐시되어 `sync.Map` 을 직접 쓸 필요가 없습니다. 이 페이지는 내장 캐시의 설정, 모니터링, 예열과 PreParse 사전 파싱 패턴을 다루고 선택 기준을 제시합니다.

:::tip 성능 최적화 페이지와의 역할 분담
[성능 최적화](./performance) 의 '캐시 전략' 절은 **사용자가 직접 만든** `sync.Map` 캐시를 보여줍니다; 이 페이지는 **라이브러리 내장** 캐시 (`EnableCache`/`WarmupCache`/`PreParse`) 를 문서화하며, 둘은 상호 보완적입니다.
:::

## 내장 캐시의 동작 방식

`Config.EnableCache` 가 `true` (기본) 이고 `CacheResults` 가 `true` (기본) 이면 `Get` 등의 쿼리 작업이 자동 캐시됩니다:

1. **파싱 캐시**: JSON 문자열 → 파싱된 `any` 트리 (FNV-1a 해시를 키로 사용)
2. **결과 캐시**: `(JSON, path)` → 쿼리 결과

같은 JSON 의 두 번째 쿼리는 파싱을 건너뛰고 바로 경로 탐색으로 갑니다; 같은 `(JSON, path)` 조합은 캐시 결과를 바로 반환합니다.

:::warning 쓰기 작업은 자동 무효화
`Set`/`Delete` 등 변경 작업은 연관 캐시 항목을 **자동으로 무효화**합니다 (JSON 해시 접두사 기준 일괄 삭제). 수동 개입이 필요 없습니다. 외부 데이터 소스가 바뀌거나 메모리 압박이 클 때만 수동 `ClearCache` 가 필요합니다.
:::

## 캐시 적중률 모니터링

`GetStats()` 는 적중 횟수, 미적중 횟수, 적중률, 현재 항목 수를 담은 `Stats` 를 반환합니다. 첫 쿼리는 미적중이고 (파싱 캐시와 결과 캐시에 각각 한 번 miss 기록), 같은 `(JSON, path)` 를 반복 쿼리하면 적중합니다:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	data := `{"user":{"name":"Alice","email":"alice@example.com"},"version":1}`

	// 첫 쿼리: 결과와 파싱 모두 미적중
	_, err = processor.Get(data, "user.name")
	if err != nil {
		panic(err)
	}

	// 같은 (JSON, path) 를 다시 쿼리: 결과 캐시 바로 적중
	_, err = processor.Get(data, "user.name")
	if err != nil {
		panic(err)
	}

	stats := processor.GetStats()
	fmt.Printf("적중 %d 회, 미적중 %d 회 (적중률 %.1f%%)\n",
		stats.HitCount, stats.MissCount, stats.HitRatio*100)
	// 출력: 적중 1 회, 미적중 2 회 (적중률 33.3%)

	fmt.Printf("캐시 활성화: %v, TTL: %v\n", stats.CacheEnabled, stats.CacheTTL)
	// 출력: 캐시 활성화: true, TTL: 5m0s
}
```

`Stats` 의 핵심 필드 (전체 구조는 [수명 주기와 통계](../api-reference/processor/lifecycle#통계-정보) 참조):

| 필드 | 설명 |
|------|------|
| `HitRatio` | 적중률 (0–1), 0.5 미만이면 워크로드 점검 또는 파라미터 조정 권장 |
| `HitCount` / `MissCount` | 누적 적중 / 미적중 횟수 |
| `CacheSize` | 현재 캐시 항목 수 |
| `CacheTTL` | 캐시 만료 시간 |

## 캐시 예열 WarmupCache

`WarmupCache(jsonStr, paths, cfg...)` 는 실제 쿼리 전에 캐시를 미리 채워 첫 요청의 '콜드 스타트' 지연을 없앱니다. 서비스 시작 직후 트래픽을 받아야 하는 시나리오에 적합합니다.

```go
// 시그니처: func (p *Processor) WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)
```

`WarmupResult` 는 `TotalPaths`/`Successful`/`Failed`/`SuccessRate`/`FailedPaths` 를 담아 예열이 완전했는지 검증할 수 있습니다 (예: 설정 파일의 경로 오타는 `FailedPaths` 로 나타남).

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	data := `{"db":{"host":"db.local","port":5432},"cache":{"ttl":300}}`

	// 서비스 시작 시 고빈도 경로 예열 (내부적으로 경로마다 Get 을 실행해 캐시에 기록)
	hotPaths := []string{"db.host", "db.port", "cache.ttl"}
	result, err := processor.WarmupCache(data, hotPaths)
	if err != nil {
		panic(err)
	}
	fmt.Printf("예열: %d/%d 성공 (성공률 %.0f%%)\n",
		result.Successful, result.TotalPaths, result.SuccessRate)
	// 출력: 예열: 3/3 성공 (성공률 100%)

	// 예열이 끝나면 첫 비즈니스 쿼리가 곧바로 적중 (첫 경로 파싱은 미적중, 이후 경로는 파싱 캐시 공유)
	_, err = processor.Get(data, "db.host")
	if err != nil {
		panic(err)
	}
	stats := processor.GetStats()
	fmt.Printf("적중 %d 회 / 미적중 %d 회\n", stats.HitCount, stats.MissCount)
	// 출력: 적중 3 회 / 미적중 4 회
}
```

:::warning 전제 조건
`EnableCache` 가 `false` 면 `WarmupCache` 호출 시 오류를 반환합니다 (캐시가 꺼져 있으면 예열 불가). 예열은 **같은 Processor 인스턴스**에서 해야 합니다 — 패키지 레벨 함수 (예: `json.GetString`) 는 전역 Processor 를 사용하므로 커스텀 인스턴스의 캐시와 서로 격리됩니다.
:::

## PreParse 사전 파싱 패턴

**같은 JSON 을 여러 다른 경로로 쿼리**해야 할 때 `PreParse` + `GetFromParsed` 가 가장 직접적인 패턴입니다: 한 번 파싱하고 여러 쿼리가 파싱 결과를 공유하며, 캐시 키 조회를 완전히 우회합니다.

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	data := `{"users":[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}],"total":2}`

	// 한 번 파싱, 여러 번 쿼리 (중복 파싱 오버헤드 회피)
	parsed, err := processor.PreParse(data)
	if err != nil {
		panic(err)
	}
	defer parsed.Release()

	// 여러 경로가 같은 파싱 결과 공유
	for _, path := range []string{"users[0].name", "users[1].name", "total"} {
		val, err := processor.GetFromParsed(parsed, path)
		if err != nil {
			panic(err)
		}
		fmt.Printf("%s = %v\n", path, val)
	}
	// 출력:
	// users[0].name = Alice
	// users[1].name = Bob
	// total = 2
}
```

핵심 API:

| API | 시그니처 | 설명 |
|-----|------|------|
| `PreParse` | `func (p *Processor) PreParse(jsonStr string, cfg ...Config) (*ParsedJSON, error)` | 파싱하여 재사용 가능한 `*ParsedJSON` 반환 |
| `GetFromParsed` | `func (p *Processor) GetFromParsed(parsed *ParsedJSON, path string, cfg ...Config) (any, error)` | 사전 파싱 결과에서 쿼리, 파싱 단계 건너뜀 |
| `(*ParsedJSON).Release` | `func (p *ParsedJSON) Release()` | 참조 해제, 다 쓰면 바로 호출 (보통 `defer`) |

:::tip PreParse vs 자동 캐시
`PreParse` 는 파싱 결과 핸들을 명시적으로 쥐므로 '한 곳에서 파싱, 여러 곳에서 소비'하는 지역 흐름에 적합합니다; 자동 캐시는 **JSON 내용 기준 전역 중복 제거**라 같은 JSON 이 서로 다른 호출 지점에서 반복 쿼리되는 경우에 맞습니다. 둘은 공존할 수 있습니다: `PreParse` 도 내부적으로 파싱 캐시에 기록합니다.
:::

## 캐시 설정 튜닝

캐시 동작은 `Config` 의 몇 가지 필드로 제어합니다 (전체 필드는 [Config](../api-reference/config#config-구조체) 참조):

| 필드 | 기본값 | 설명 |
|------|--------|------|
| `EnableCache` | `true` | 마스터 스위치; 끄면 모든 캐시 로직을 건너뜁니다 (`Get` 이 빠른 경로 사용) |
| `CacheResults` | `true` | 쿼리 결과 캐시 여부; `false` 면 파싱 캐시만 유지 |
| `CacheTTL` | `5 분` | 항목 만료 시간 |
| `MaxCacheSize` | `128` | 최대 항목 수 (LRU 방식 축출) |
| `CacheSharedResults` | `false` | 캐시 결과 공유, 방어적 깊은 복사 건너뜀 (고성능 읽기 전용 시나리오) |

```go
package main

import (
	"fmt"
	"time"

	"github.com/cybergodev/json"
)

func main() {
	cfg := json.DefaultConfig()
	cfg.MaxCacheSize = 256          // 핫 데이터 더 수용
	cfg.CacheTTL = 10 * time.Minute // 유효 기간 연장

	processor, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	data := `{"key":"value"}`
	_, err = processor.Get(data, "key")
	if err != nil {
		panic(err)
	}
	fmt.Println("쿼리 완료")
	// 출력: 쿼리 완료
}
```

읽기가 많고 쓰기가 적으며 결과가 읽기 전용인 시나리오에서는 제로 카피 스위치를 더 얹을 수 있습니다:

```go
// 계약: 활성화 후 호출자는 Get 이 반환한 map/slice 를 수정하면 안 됨 (원시 값은 항상 안전)
cfg := json.DefaultConfig()
cfg.CacheSharedResults = true
```

### CacheSharedResults 제로 카피 계약

`CacheSharedResults = true` 이면 캐시 적중된 `Get`/`GetFromParsed` 가 **캐시 값을 직접 반환**하고 방어적 깊은 복사를 건너뛰어, 대형 객체의 반복 읽기 오버헤드를 크게 줄입니다.

:::danger 읽기 전용 계약
활성화하면 호출자는 반환된 `map[string]any` / `[]any` 를 **수정하면 안 됩니다**. 어기면 공유 캐시가 훼손되어 이후 읽기를 오염시킵니다. 원시 값 (`bool`/`float64`/`string`/`json.Number`/`nil`) 은 불변이므로 항상 안전합니다. 호출자가 결과를 읽기 전용으로 취급할 때만 활성화하세요 (예: 같은 대형 하위 트리를 반복 읽는 분석형 부하).
:::

## 정리와 무효화

| 작업 | API | 트리거 시점 |
|------|-----|----------|
| 수동 비우기 | `processor.ClearCache()` | 데이터 소스 변화, 메모리 압박, 강제 새로고침 필요 시 |
| 쓰기 후 자동 무효화 | `Set`/`Delete` 내부 호출 | 변경 후 수동 정리 불필요, 캐시가 JSON 해시 접두사 기준으로 자동 삭제 |

`ClearCache` 는 '같은 Processor 가 장기 실행되고 데이터 소스가 교체되는' 시나리오에 적합합니다. 일회성 스크립트는 수동 정리가 필요 없습니다 — `Close()` 가 모든 리소스를 회수합니다.

## 실전 레시피: 고빈도 쿼리 캐시 최적화

아래 패턴은 예열, PreParse, 모니터링을 종합한 것으로 API 게이트웨이 / 설정 센터 등 고빈도 읽기 시나리오에 적합합니다.

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	configJSON := `{"db":{"host":"db.local","port":5432},"cache":{"ttl":300},"features":["audit","metrics"]}`

	// 1. 시작 시 고빈도 경로 예열
	hotPaths := []string{"db.host", "db.port", "cache.ttl"}
	if _, err := processor.WarmupCache(configJSON, hotPaths); err != nil {
		panic(err)
	}

	// 2. 같은 설정에 배치 필드 추출 (PreParse 패턴)
	parsed, err := processor.PreParse(configJSON)
	if err != nil {
		panic(err)
	}
	defer parsed.Release()

	host, err := processor.GetFromParsed(parsed, "db.host")
	if err != nil {
		panic(err)
	}
	fmt.Printf("데이터베이스 호스트: %v\n", host)
	// 출력: 데이터베이스 호스트: db.local

	// 3. 비즈니스 쿼리가 계속 적중 (예열과 사전 파싱이 캐시를 채움)
	for _, path := range []string{"db.host", "db.port", "cache.ttl"} {
		_, err = processor.Get(configJSON, path)
		if err != nil {
			panic(err)
		}
	}

	// 4. 런타임에 적중률 모니터링, 임계값 미만이면 경고
	stats := processor.GetStats()
	fmt.Printf("적중 %d / 미적중 %d (적중률 %.1f%%)\n",
		stats.HitCount, stats.MissCount, stats.HitRatio*100)
	// 출력: 적중 6 / 미적중 4 (적중률 60.0%)
	if stats.HitRatio < 0.5 {
		fmt.Println("경고: 적중률이 50% 미만, 워크로드 점검 또는 CacheTTL/MaxCacheSize 조정")
	}

	// 5. 설정 교체 (데이터 소스 변화) 시 수동으로 비워 오래된 값을 읽지 않게 함
	processor.ClearCache()
	stats = processor.GetStats()
	fmt.Printf("비운 뒤 캐시 항목: %d\n", stats.CacheSize)
	// 출력: 비운 뒤 캐시 항목: 0
}
```

## 선택 기준

| 시나리오 | 추천 방안 | 이유 |
|------|----------|------|
| 일회성 쿼리 / 스크립트 | 기본 설정 그대로 | 내장 캐시는 단일 호출에 부담이 없고 `Get` 에 빠른 경로가 있음 |
| 같은 JSON 반복 쿼리 (서로 다른 호출 지점) | `EnableCache=true` 유지 | JSON 내용 기준 자동 중복 제거, 코드 수정 제로 |
| 같은 JSON 한 번 파싱, 이번 배치에서 여러 경로 쿼리 | `PreParse` + `GetFromParsed` | 파싱 결과 명시적 재사용, 캐시 키 오버헤드 우회 |
| 서비스 시작 직후 트래픽 흡수 | `WarmupCache` 예열 | 첫 요청의 콜드 스타트 지연 제거 |
| 같은 대형 읽기 전용 하위 트리 반복 읽기 | `CacheSharedResults=true` | 깊은 복사를 건너뛰고 제로 카피 성능 획득 |
| 신뢰할 수 없는 입력 / 보안 민감 | `SecurityConfig()` (짧은 TTL) | 보안 설정은 기본적으로 보수적인 캐시 파라미터 사용 |

## 관련 문서

- [성능 최적화](./performance) — 프로세서 재사용, 메모리 최적화, 벤치마크
- [수명 주기와 통계](../api-reference/processor/lifecycle#통계-정보) — `GetStats`/`WarmupCache`/`ClearCache` API 상세
- [Config 설정](../api-reference/config) — 캐시 관련 필드 전체 설명
- [동시성과 병렬 처리](./concurrency) — Processor 스레드 안전성과 병렬 이터레이터
