---
sidebar_label: "캐시와 사전 파싱"
title: "캐시와 사전 파싱 - CyberGo JSON | 캐시 전략"
description: "CyberGo JSON 내장 캐시와 사전 파싱 전략: EnableCache 자동 캐싱, GetStats 적중률 모니터링, WarmupCache 워밍, PreParse 한 번 파싱 여러 번 조회, ClearCache로 고빈도 쿼리 최적화."
sidebar_position: 3
---

# 캐시와 사전 파싱 전략

CyberGo JSON은 **자동 캐싱 서브시스템**을 내장하고 있습니다. 파싱 결과와 경로 조회 결과가 자동으로 캐시되므로 직접 `sync.Map`을 만들 필요가 없습니다. 이 페이지에서는 내장 캐시의 설정·모니터링·워밍, `PreParse` 사전 파싱 패턴, 선택 가이드를 다룹니다.

:::tip 팁 성능 페이지와의 역할 분담
[성능 최적화](./performance)의 '캐시 전략' 절은 **사용자가 직접 만든** `sync.Map` 캐시를 보여줍니다. 이 페이지는 **라이브러리 내장** 캐시(`EnableCache`/`WarmupCache`/`PreParse`)를 문서화하며, 두 페이지는 상호 보완적입니다.
:::

## 내장 캐시 작동 방식

`Config.EnableCache`가 `true`(기본값)이고 `CacheResults`가 `true`(기본값)이면, `Get` 같은 조회 작업이 자동으로 캐시됩니다:

1. **파싱 캐시**: JSON 문자열 -> 파싱된 `any` 트리(FNV-1a 해시를 키로 사용)
2. **결과 캐시**: `(JSON, path)` -> 조회 결과

같은 JSON에 대한 두 번째 조회는 파싱을 건너뛰고 곧바로 경로 탐색으로 이동하며, 동일한 `(JSON, path)` 조합은 캐시된 결과를 직접 반환합니다.

:::warning 경고 쓰기 시 자동 무효화
`Set`/`Delete` 같은 변경 작업은 관련 캐시 항목을 **자동으로 무효화**합니다(JSON 해시 접두사로 일괄 삭제). 수동 조치가 필요 없습니다. 외부 데이터 소스가 변경되거나 메모리 압력이 클 때만 `ClearCache`를 호출하세요.
:::

## 캐시 적중률 모니터링

`GetStats()`는 적중/미적중 횟수, 적중률, 현재 항목 수를 담은 `Stats`를 반환합니다.

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

	// 자주 쓰는 경로 워밍: 내부적으로 각 경로마다 Get을 한 번 실행해 캐시에 저장
	paths := []string{"user.name", "user.email", "version"}
	result, err := processor.WarmupCache(data, paths)
	if err != nil {
		panic(err)
	}
	fmt.Printf("워밍 성공: %d/%d (성공률 %.0f%%)\n", result.Successful, result.TotalPaths, result.SuccessRate)
	// 출력: 워밍 성공: 3/3 (성공률 100%)

	// 동일한 (JSON, path) 조회가 캐시에 적중
	name, err := processor.Get(data, "user.name")
	if err != nil {
		panic(err)
	}
	fmt.Printf("user.name = %v\n", name)
	// 출력: user.name = Alice

	// 캐시 설정과 상태 확인
	stats := processor.GetStats()
	fmt.Printf("캐시 활성화: %v, TTL: %v\n", stats.CacheEnabled, stats.CacheTTL)
	// 출력: 캐시 활성화: true, TTL: 5m0s
}
```

주요 `Stats` 필드(전체 구조는 [수명 주기와 통계](../api-reference/processor/lifecycle#통계-정보) 참고):

| 필드 | 설명 |
|------|------|
| `HitRatio` | 적중률(0–1). 0.5 미만이면 워크로드나 설정 조정 권장 |
| `HitCount` / `MissCount` | 누적 적중 / 미적중 횟수 |
| `CacheSize` | 현재 캐시 항목 수 |
| `CacheTTL` | 캐시 항목 만료 시간 |

## WarmupCache로 캐시 워밍

`WarmupCache(jsonStr, paths, cfg...)`는 실제 조회 전에 캐시를 일괄 채워 첫 요청의 콜드스타트 지연을 제거합니다. 시작 직후 트래픽을 받는 서비스에 적합합니다.

```go
// 시그니처: func (p *Processor) WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)
```

`WarmupResult`는 `TotalPaths`/`Successful`/`Failed`/`SuccessRate`/`FailedPaths`를 포함하며, 워밍 완전성 검증에 유용합니다(설정 파일의 경로 오타는 `FailedPaths`로 나타남).

:::warning 경고 전제 조건
`EnableCache`가 `false`면 `WarmupCache`는 에러를 반환합니다(비활성화된 캐시는 워밍 불가). 워밍은 **동일한 Processor 인스턴스**에서 수행해야 합니다. 패키지 수준 함수(예: `json.GetString`)는 글로벌 Processor를 사용하며, 커스텀 인스턴스의 캐시와 격리되어 있습니다.
:::

## PreParse 사전 파싱 패턴

**동일한 JSON을 여러 경로로 조회**할 때 `PreParse` + `GetFromParsed`가 가장 직접적인 패턴입니다. 한 번 파싱하고 파싱 결과를 여러 번 조회하여 캐시 키 조회를 완전히 우회합니다.

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

	// 한 번 파싱, 여러 번 조회(반복 파싱 생략)
	parsed, err := processor.PreParse(data)
	if err != nil {
		panic(err)
	}
	defer parsed.Release()

	// 여러 경로가 동일한 파싱 결과를 공유
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

주요 API:

| API | 시그니처 | 설명 |
|-----|------|------|
| `PreParse` | `func (p *Processor) PreParse(jsonStr string, cfg ...Config) (*ParsedJSON, error)` | 파싱하여 재사용 가능한 `*ParsedJSON` 반환 |
| `GetFromParsed` | `func (p *Processor) GetFromParsed(parsed *ParsedJSON, path string, cfg ...Config) (any, error)` | 사전 파싱 결과에서 조회, 파싱 단계 건너뜀 |
| `(*ParsedJSON).Release` | `func (p *ParsedJSON) Release()` | 참조 해제, 사용 후 호출(보통 `defer`) |

:::tip 팁 PreParse vs 자동 캐시
`PreParse`는 파싱 결과 핸들을 명시적으로 들고 있어 '한 곳에서 파싱, 여러 곳에서 소비'하는 로컬 흐름에 적합합니다. 자동 캐시는 **JSON 콘텐츠 기준으로 전역 중복 제거**하여 같은 JSON이 여러 호출 지점에서 반복 조회될 때 적합합니다. 둘은 공존합니다. `PreParse` 내부적으로도 파싱 캐시에 기록합니다.
:::

## 캐시 설정 튜닝

캐시 동작은 여러 `Config` 필드로 제어됩니다(전체 목록은 [Config](../api-reference/config#config-구조체) 참고):

| 필드 | 기본값 | 설명 |
|------|--------|------|
| `EnableCache` | `true` | 마스터 스위치. 끄면 모든 캐싱이 생략됨(`Get`는 빠른 경로 사용) |
| `CacheResults` | `true` | 조회 결과 캐시 여부. `false`면 파싱 캐시만 유지 |
| `CacheTTL` | `5분` | 항목 만료 시간 |
| `MaxCacheSize` | `128` | 최대 항목 수(LRU 제거) |
| `CacheSharedResults` | `false` | 캐시 결과 공유, 방어적 딥카피 생략(고성능 읽기 전용) |

```go
package main

import (
	"fmt"
	"time"

	"github.com/cybergodev/json"
)

func main() {
	cfg := json.DefaultConfig()
	cfg.MaxCacheSize = 256            // 더 많은 핫데이터 수용
	cfg.CacheTTL = 10 * time.Minute   // 유효 기간 연장

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
	fmt.Println("조회 완료")
	// 출력: 조회 완료
}
```

### CacheSharedResults 제로카피 계약

`CacheSharedResults = true`면 캐시 적중 시 `Get`/`GetFromParsed`가 캐시 값을 **직접 반환**하여 방어적 딥카피를 생략하고 대형 객체 반복 읽기 오버헤드를 크게 줄입니다.

:::danger 위험 읽기 전용 계약
활성화 시 호출자는 반환된 `map[string]any` / `[]any`를 **수정하면 안 됩니다**. 그렇지 않으면 공유 캐시가 손상되고 후속 읽기가 오염됩니다. 원시값(`bool`/`float64`/`string`/`json.Number`/`nil`)은 불변이므로 항상 안전합니다. 호출자가 결과를 읽기 전용으로 취급할 때만 활성화하세요(예: 동일한 대형 서브트리를 반복 읽는 분석 워크로드).
:::

## 정리와 무효화

| 작업 | API | 시점 |
|------|-----|----------|
| 수동 비우기 | `processor.ClearCache()` | 데이터 소스 변경, 메모리 압력, 강제 새로고침 |
| 쓰기 후 자동 무효화 | `Set`/`Delete` 내부 호출 | 변경 후 수동 정리 불필요. JSON 해시 접두사로 자동 삭제 |

`ClearCache`는 '하나의 Processor가 장기 실행되며 데이터 소스가 순환하는' 시나리오에 적합합니다. 일회성 스크립트는 수동 정리가 필요 없습니다. `Close()`가 모든 리소스를 회수합니다.

## 레시피: 고빈도 조회 캐싱

이 레시피는 워밍, PreParse, 모니터링을 결합합니다. 고 읽기 볼륨의 API 게이트웨이 / 설정 센터에 적합합니다.

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

	// 1. 시작 시 핫 경로 워밍
	hotPaths := []string{"db.host", "db.port", "cache.ttl"}
	if _, err := processor.WarmupCache(configJSON, hotPaths); err != nil {
		panic(err)
	}

	// 2. 동일한 설정에서 여러 필드 추출(PreParse 패턴)
	parsed, err := processor.PreParse(configJSON)
	if err != nil {
		panic(err)
	}
	defer parsed.Release()

	host, err := processor.GetFromParsed(parsed, "db.host")
	if err != nil {
		panic(err)
	}
	fmt.Printf("DB 호스트: %v\n", host)
	// 출력: DB 호스트: db.local

	// 3. 런타임에 적중률 모니터링, 임계값 미만 시 경고
	stats := processor.GetStats()
	fmt.Printf("현재 적중률: %.2f%%\n", stats.HitRatio*100)
}
```

## 선택 가이드

| 시나리오 | 권장 | 이유 |
|------|----------|------|
| 일회성 조회 / 스크립트 | 기본 설정 | 내장 캐시가 단일 호출에 부담을 주지 않음. `Get`는 빠른 경유 |
| 동일 JSON 반복 조회(서로 다른 호출 지점) | `EnableCache=true` 유지 | JSON 콘텐츠로 자동 중복 제거, 코드 변경 없음 |
| 하나의 JSON을 한 번 파싱, 배치로 여러 경로 조회 | `PreParse` + `GetFromParsed` | 파싱 결과를 명시적으로 재사용, 캐시 키 비용 우회 |
| 시작 직후 트래픽을 받는 서비스 | `WarmupCache` 워밍 | 첫 배치 콜드스타트 지연 제거 |
| 동일한 대형 읽기 전용 서브트리 반복 읽기 | `CacheSharedResults=true` | 딥카피 생략, 제로카피 성능 |
| 신뢰할 수 없는 입력 / 보안 민감 | `SecurityConfig()`(짧은 TTL) | 보안 프리셋은 보수적인 캐시 매개변수 사용 |

## 참조

- [성능 최적화](./performance) — Processor 재사용, 메모리 최적화, 벤치마크
- [수명 주기와 통계](../api-reference/processor/lifecycle#통계-정보) — `GetStats`/`WarmupCache`/`ClearCache` API 상세
- [Config 설정](../api-reference/config) — 캐시 관련 필드 전체 참조
- [동시성과 병렬 처리](./concurrency) — Processor 스레드 안전성과 병렬 반복기
