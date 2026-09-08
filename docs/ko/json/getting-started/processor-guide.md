---
sidebar_label: "Processor 가이드"
title: "Processor 가이드 - CyberGo JSON | 프로세서 사용 시기"
description: "CyberGo JSON Processor 가이드: 패키지 함수와 Processor 선택 비교, PreParse 사전 파싱과 CompilePath 경로 사전 컴파일, 멀티 goroutine 공유, 수명 주기 관리, 모니터링 통계와 전역 프로세서 설정으로 고성능 JSON 처리를 익힙니다."
sidebar_position: 3
---

# Processor 가이드

이 가이드는 Processor 를 **언제**, **어떻게** 쓰는지, 패키지 레벨 함수 대비 어떤 이점이 있는지 이해하도록 돕습니다.

## 패키지 함수 vs Processor

CyberGo JSON 은 두 가지 API 스타일을 제공합니다:

| 차원 | 패키지 레벨 함수 | Processor |
|------|----------|-----------|
| **전형적 호출** | `json.GetString(data, "name")` | `p.GetString(data, "name")` |
| **생성 방식** | 생성 없이 직접 호출 | `p, err := json.New()` |
| **설정 방식** | 호출마다 `cfg ...Config` 전달 | 생성 시 통일 설정, 이후 재사용 |
| **캐시** | 전역 공유 캐시 | 독립 캐시, 제어·정리 가능 |
| **리소스 관리** | 자동 (전역 프로세서) | 수동 `Close()` |
| **훅 시스템** | 미지원 | `AddHook` 지원 |
| **사전 파싱** | 미지원 | `PreParse` + `GetFromParsed` 지원 |
| **경로 사전 컴파일** | 미지원 | `CompilePath` + `GetCompiled` 지원 |
| **적합한 시나리오** | 간단한 작업, 스크립트, 저빈도 호출 | 고빈도 작업, 커스텀 설정, 서버 측 |

::: tip 빠른 판단
- **패키지 함수 사용**: 가끔 JSON 을 다루거나, 수명 주기를 관리하고 싶지 않거나, 빠른 스크립트
- **Processor 사용**: 커스텀 설정이 필요하거나, 같은 데이터를 고빈도 쿼리하거나, 훅/감사가 필요할 때
:::

## Processor 를 언제 쓰나

### 시나리오 1: 커스텀 설정

패키지 레벨 함수는 기본 설정을 사용합니다. 보안 모드, 커스텀 인코더, 훅이 필요하면 Processor 를 사용하세요:

```go
// 패키지 함수 — 항상 기본 설정 사용
val := json.GetString(data, "name")

// Processor — 설정 커스터마이즈 가능
cfg := json.SecurityConfig() // 보안 모드
p, err := json.New(cfg)
if err != nil {
	panic(err)
}
defer p.Close()

// 이후 모든 작업이 보안 설정을 사용
val, err := p.Get(data, "name")
```

### 시나리오 2: 같은 데이터 고빈도 쿼리 (PreParse 최적화)

같은 JSON 을 여러 번 쿼리할 때 `PreParse` 는 한 번만 파싱하고 이후 쿼리는 파싱 결과를 재사용합니다:

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

// 한 번 파싱
parsed, err := p.PreParse(largeJSON)
if err != nil {
	panic(err)
}
defer parsed.Release() // 다 쓴 뒤 객체 풀로 반환

// 여러 쿼리 — 파싱 결과 재사용, 중복 파싱 회피
name, _ := p.GetFromParsed(parsed, "user.name")
email, _ := p.GetFromParsed(parsed, "user.email")
tags, _ := p.GetFromParsed(parsed, "tags")

// 기저 파싱 결과 (map[string]any / []any) 를 직접 가져올 수도 있음
data := parsed.Data()
_ = data

// 수정도 사전 파싱 결과 기반 가능: SetFromParsed 는 새 ParsedJSON 을 반환하고 원본은 불변
modified, err := p.SetFromParsed(parsed, "user.age", 31)
if err != nil {
	panic(err)
}
newAge, _ := p.GetFromParsed(modified, "user.age")
```

::: warning 성능 비교
- 패키지 함수 `GetString`: 호출마다 JSON 을 파싱합니다 (캐시는 있지만 적중률은 시나리오에 따라 다름)
- `PreParse` + `GetFromParsed`: 한 번 파싱, N 번의 쿼리는 탐색만 수행, 중복 파싱 제로
:::

### 시나리오 3: 같은 경로 고빈도 쿼리 (CompilePath 최적화)

`PreParse` 가 최적화하는 것은 '같은 JSON 을 여러 번 쿼리'입니다; 시나리오가 '**같은 경로**를 수많은 서로 다른 JSON 에 반복 실행'이라면 `CompilePath` 로 경로를 사전 컴파일하세요 — 경로 파싱과 검증을 한 번만 하고 이후 쿼리는 바로 탐색합니다:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	// 경로는 한 번만 컴파일 (파싱 + 검증)
	compiled, err := p.CompilePath("user.name")
	if err != nil {
		panic(err)
	}
	defer compiled.Release() // 객체 풀로 반환

	// 핫 경로에서 반복 쿼리: 경로 파싱을 건너뛰고 탐색만
	for _, data := range []string{
		`{"user":{"name":"Alice"}}`,
		`{"user":{"name":"Bob"}}`,
	} {
		val, err := p.GetCompiled(data, compiled)
		if err != nil {
			panic(err)
		}
		fmt.Println(val)
	}
	// 출력:
	// Alice
	// Bob
}
```

::: tip 두 최적화의 역할 분담
| 최적화 | 절약되는 오버헤드 | 적합한 시나리오 |
|------|-----------|----------|
| `PreParse` + `GetFromParsed` | JSON 문서의 중복 파싱 | 같은 JSON 에서 여러 다른 경로 쿼리 |
| `CompilePath` + `GetCompiled` | 경로 표현식의 중복 파싱 | 같은 경로를 여러 JSON 에 적용 (핫 경로) |

둘은 독립된 최적화 축이며 병목에 따라 고릅니다. 참고로 `GetCompiled` 는 현재 쿼리 변형만 있고 `Set`/`Delete` 는 사전 컴파일 경로를 아직 지원하지 않습니다; 사전 파싱 쪽의 수정은 `SetFromParsed` 로 가능합니다.
:::

### 시나리오 4: 훅과 감사

로그 기록, 성능 모니터링, 입력 검증이 필요하면 Processor 의 훅 시스템을 사용할 수 있습니다:

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close()

// 로그 훅 추가
p.AddHook(json.LoggingHook(slog.Default()))
// 타이밍 훅 추가
p.AddHook(json.TimingHook(&metricsRecorder))

// 모든 작업이 자동으로 훅을 촉발
result, err := p.Set(data, "user.name", "Alice")
```

자세한 내용은 [Hook 훅 시스템](../extensions/hooks) 을 참조하세요.

### 시나리오 5: 여러 goroutine 이 Processor 공유

`Processor` 는 동시성 안전합니다 — 올바른 자세는 **한 번 생성해 그룹 전체가 공유하고 마지막에 한 번 Close** 하는 것이지, 요청마다 하나씩 만드는 것이 아닙니다 (후자는 생성 오버헤드만 늘리고 리소스 관리 비용도 키웁니다):

```go
package main

import (
	"fmt"
	"sync"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close() // 모든 goroutine 이 끝난 뒤에야 실행

	data := `{"user":{"name":"Alice","age":30}}`

	var wg sync.WaitGroup
	for i := 1; i <= 8; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			name := p.GetString(data, "user.name")
			age := p.GetInt(data, "user.age")
			fmt.Printf("goroutine %d: %s (%d)\n", i, name, age)
		}(i)
	}
	wg.Wait()

	stats := p.GetStats()
	fmt.Println("누적 작업 수:", stats.OperationCount)
}

// 출력 (goroutine 순서는 불확정):
// goroutine 5: Alice (30)
// goroutine 2: Alice (30)
// ...
// 누적 작업 수: 16
```

::: tip MaxConcurrency 는 소프트 제한
기본 `MaxConcurrency = 50`: 진행 중인 작업이 이 값을 넘으면 새 작업은 대기하지 않고 **즉시 실패**해 `ErrConcurrencyLimit` 을 반환합니다. 고동시성 서비스에서는 필요에 맞게 값을 키우거나 호출 측에서 속도 제한과 재시도를 하세요.
:::

### 시나리오 6: 전역 통일 설정

패키지 레벨 함수 뒤에는 **전역 프로세서**가 있습니다. 인수 전달을 고칠 수 없는 옛 코드를 포함해 애플리케이션 전체가 같은 설정을 쓰게 하려면 `SetGlobalProcessor` 로 한 번에 교체하세요. 모든 `json.Get`/`json.Marshal` 등 패키지 레벨 호출이 즉시 적용됩니다. 전체 예제와 주의 사항은 아래 [전역 프로세서](#전역-프로세서) 절을 참조하세요.

## 수명 주기 관리

Processor 는 리소스 (캐시, goroutine) 를 보유하므로 사용 후 **반드시 닫아야** 합니다:

```go
p, err := json.New()
if err != nil {
	panic(err)
}
defer p.Close() // 리소스 해제 보장

// Processor 사용...
result, err := p.GetString(data, "name")
```

::: warning Close 를 잊으면 생기는 일
- 캐시 메모리가 해제되지 않음
- 백그라운드 goroutine 누수
- 고동시성 시나리오에서 리소스 고갈 가능
:::

### 상태 확인

```go
if p.IsClosed() {
	// Processor 가 닫혀 더는 사용할 수 없음
}
```

`IsClosed` 는 두 상태에서 모두 `true` 를 반환합니다: 완전히 닫혔거나, 닫히는 중 (배수 대기) / 닫기 타임아웃 상태이거나. 두 상태 모두 새 작업이 거부되어 오류를 반환하므로, '아직 쓸 수 있는지'의 유일한 판단으로 삼으면 됩니다.

## 모니터링과 진단

Processor 는 런타임 통계와 상태 검사를 내장해 서비스 모니터링 연동에 적합합니다:

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	p, err := json.New()
	if err != nil {
		panic(err)
	}
	defer p.Close()

	_, _ = p.Get(`{"user":{"name":"Alice"}}`, "user.name")

	// 런타임 통계: 작업 수, 오류 수, 캐시 적중률과 메모리 사용량
	stats := p.GetStats()
	fmt.Printf("작업 수=%d 오류 수=%d 적중률=%.2f 캐시 항목=%d\n",
		stats.OperationCount, stats.ErrorCount, stats.HitRatio, stats.CacheSize)

	// 상태 검사: 캐시, 메모리 등 항목별 결과
	health := p.GetHealthStatus()
	fmt.Println("정상:", health.Healthy)
	for name, check := range health.Checks {
		fmt.Printf("  %s: %s\n", name, check.Message)
	}

	// 현재 설정 읽기 (사본 반환, 수정해도 Processor 에 영향 없음)
	cfg := p.GetConfig()
	fmt.Println("캐시 활성화:", cfg.EnableCache)
}
```

::: tip 패키지 레벨 버전
전역 프로세서에도 패키지 레벨 모니터링 입구가 있습니다: `json.GetStats()` 와 `json.GetHealthStatus()` 로, Processor 참조를 갖고 있지 않은 코드에서 전역 진단을 하기에 적합합니다. 캐시 통계와 `ClearCache`/`WarmupCache` 의 전체 용법은 [고급 캐시 전략](../advanced/caching) 을 참조하세요.
:::

## 전역 프로세서

패키지 레벨 함수 (`Get`, `Set`, `Marshal` 등) 는 내부적으로 **전역 프로세서**를 사용합니다. 이를 교체할 수도 있습니다:

```go
// 커스텀 설정의 프로세서 생성
cfg := json.SecurityConfig()
p, err := json.New(cfg)
if err != nil {
	panic(err)
}

// 전역 프로세서로 설정
json.SetGlobalProcessor(p)

// 이제 모든 패키지 레벨 함수가 보안 설정 사용
val := json.GetString(data, "name")

// 애플리케이션 종료 시 정리
defer json.ShutdownGlobalProcessor()
```

동작 세부:

- `SetGlobalProcessor` 는 스레드 안전하며 `nil` 전달은 no-op; 교체 시 **이전 프로세서를 자동으로 닫습니다**
- `ShutdownGlobalProcessor` 는 완전한 종료 정리입니다: 전역 프로세서를 닫는 것 외에 '설정별 캐시'된 프로세서도 닫고 전역 경로/인코더 캐시를 비웁니다; 이후 패키지 레벨 함수를 호출하면 새 기본 프로세서가 자동 생성됩니다
- `cfg` 를 받는 패키지 레벨 함수 (예: `json.Get(data, path, json.SecurityConfig())`) 는 **설정별 캐시** 프로세서를 사용하며 전역 프로세서를 거치지 않습니다 — 두 메커니즘이 병행하며 서로 영향을 주지 않습니다

::: tip 적합한 시나리오
- 전역 통일 보안 정책
- 커스텀 인코더의 전역 적용
- Config 를 곳곳에 전달하지 않고 기본 설정 교체
:::

## 선택 결정 트리

```
JSON 을 다뤄야 하나?
├── 가끔 사용, 스크립트 도구
│   └── → 패키지 함수 json.GetString / json.Set / json.Marshal
├── 가끔 사용하지만 보안/인코딩 설정이 필요
│   └── → 패키지 함수 + 마지막 인자 cfg: json.Get(data, path, json.SecurityConfig())
├── 고빈도 사용, 또는 훅 등 프로세서 능력이 필요
│   └── → Processor json.New(cfg)
├── 같은 JSON 을 여러 번 쿼리
│   └── → Processor + PreParse
├── 같은 경로를 대량의 JSON 에 적용 (핫 경로)
│   └── → Processor + CompilePath
├── 여러 goroutine 이 동시 처리
│   └── → Processor 하나를 공유 (동시성 안전), 요청마다 새로 만들지 않기
├── 감사/모니터링/로그 필요
│   └── → Processor + AddHook
├── 런타임 메트릭/상태 검사 필요
│   └── → GetStats / GetHealthStatus (Processor 메서드와 패키지 함수 모두 가능)
└── 전역 통일 설정
    └── → SetGlobalProcessor 사용
```

## 다음 단계

- [경로 표현식 문법](./path-syntax) — 경로 쿼리 전체 문법
- [Processor API](../api-reference/processor/) — 전체 메서드 레퍼런스
- [성능 최적화](../advanced/performance) — 성능 튜닝 심화
- [치트시트](./cheatsheet) — API 빠른 참조
