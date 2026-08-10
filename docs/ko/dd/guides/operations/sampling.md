---
sidebar_label: "로그 샘플링"
title: "로그 샘플링 - CyberGo DD | 고처리량 로그 볼륨 감소"
description: "CyberGo DD 로그 샘플링 configuration 가이드: SamplingConfig Initial, Thereafter, Tick 매개변수를 사용하여 고처리량 시나리오에서 로그 볼륨을 줄이면서 핵심 정보를 보존하며, 런타임 토글을 지원합니다."
sidebar_position: 1
---

# 로그 샘플링

고처리량 시나리오(HTTP 요청 로깅, 이벤트 스트림 처리)에서는 모든 항목을 로깅하면 방대한 데이터가 생성됩니다. DD의 샘플링 기능은 로그를 비례적으로 유지하여, 전체 추세를 반영하면서 로그 볼륨을 제어합니다.

## 샘플링 원리

DD는 **카운터 기반 샘플링** 전략을 사용합니다:

```
┌──────────────────────────────────────────────────────────┐
│  요청 1-100     →  모두 로깅 (Initial 단계)               │
│  요청 101      →  건너뜀                                  │
│  요청 102      →  건너뜀                                  │
│  ...                                                      │
│  요청 110      →  로깅 (Thereafter=10마다 1개)             │
│  요청 111      →  건너뜀                                  │
│  ...                                                      │
│  (Tick 만료 → 카운터 리셋, Initial 단계 재진입)            │
└──────────────────────────────────────────────────────────┘
```

| 매개변수 | 설명 | 일반적 값 |
|-----------|-------------|---------------|
| `Enabled` | 샘플링 활성화 | `true` |
| `Initial` | 처음 N개 항목은 항상 로깅 | 100 |
| `Thereafter` | Initial 이후 N개마다 1개 로깅 | 10 |
| `Tick` | 카운터 리셋 간격 (0 = 리셋 안 함) | `1s` / `1m` |

## 빠른 시작

### Configuration에서 활성화

```go
package main

import (
    "log"
    "time"

    "github.com/cybergodev/dd"
)

func main() {
    cfg := dd.DefaultConfig()
    cfg.Sampling = &dd.SamplingConfig{
        Enabled:    true,
        Initial:    100,             // 처음 100개는 항상 로깅
        Thereafter: 10,              // 이후 10개마다 1개 로깅
        Tick:       time.Second,     // 매초 카운터 리셋
    }

    logger, err := dd.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer logger.Close()

    // 고처리량 로깅 시뮬레이션
    for i := 0; i < 1000; i++ {
        logger.InfoWith("request processed",
            dd.Int("seq", i),
        )
    }
    // 실제 출력: 처음 100개 + 나머지 900개 중 90개 = 190개 항목
}
```

### 런타임 토글

```go
// 샘플링 활성화
logger.SetSampling(&dd.SamplingConfig{
    Enabled:    true,
    Initial:    50,
    Thereafter: 20,
    Tick:       0, // 자동 리셋 없음
})

// 샘플링 비활성화 (전체 로깅 재개)
logger.SetSampling(nil)

// 현재 샘플링 config 조회
sc := logger.GetSampling()
if sc != nil {
    fmt.Printf("Sampling: Initial=%d, Thereafter=%d\n", sc.Initial, sc.Thereafter)
}
```

:::tip 팁 전역 Logger 샘플링
패키지 수준 함수 `dd.SetSampling()`과 `dd.GetSampling()`은 전역 Logger에서 직접 작동합니다.
:::

## 매개변수 세부 정보

### Initial: 초기 전체 볼륨 윈도우

`Initial`은 시작 후 또는 Tick 리셋 후 처음 N개 항목이 **모두 로깅**되도록 보장하여, 다음을 보장합니다:

- 시작 단계 초기화 로그가 손실되지 않음
- 짧은 버스트 트래픽에 대한 완전한 기록
- Tick 리셋 후 기간 시작 상태가 보임

### Thereafter: 샘플링 비율

| Thereafter | 효과 | 유지율 (Initial 이후) |
|:----------:|--------|:------------------------------:|
| 1 | 모든 항목 로깅 (= 비활성화) | 100% |
| 10 | 10개마다 1개 로깅 | 10% |
| 100 | 100개마다 1개 로깅 | 1% |
| 0 | Initial 이후 로깅 중지 | 0% |

:::warning 경고 Thereafter=0
`Thereafter=0`은 Initial 단계 이후 **완전히 로깅을 중지**함을 의미합니다. 일부 시나리오(예: 시작 로그만 필요)에서는 유용하지만, 중요한 정보가 누락되지 않도록 주의하십시오.
:::

### Tick: 주기적 리셋

```go
// 옵션 A: 매초 리셋 (버스트 감지)
Sampling: &dd.SamplingConfig{
    Enabled: true, Initial: 100, Thereafter: 10,
    Tick: time.Second,
}

// 옵션 B: 리셋 없음 (전역 카운트, 장기 감소)
Sampling: &dd.SamplingConfig{
    Enabled: true, Initial: 1000, Thereafter: 100,
    Tick: 0,
}
```

Tick 리셋 후 카운터는 0으로 리셋되고 Initial 전체 볼륨 단계에 재진입합니다. **기간별 트래픽 패턴 관찰**에 유용합니다.

## 일반적인 시나리오

### 시나리오 1: HTTP 요청 로깅

```go
// 고트래픽 API: 처음 100개 전체, 이후 10% 샘플링, 매초 리셋
cfg.Sampling = &dd.SamplingConfig{
    Enabled:    true,
    Initial:    100,
    Thereafter: 10,
    Tick:       time.Second,
}
```

### 시나리오 2: 백그라운드 작업 로깅

```go
// 배치 처리: 처음 50개 전체, 이후 100개마다 1개, 리셋 없음
cfg.Sampling = &dd.SamplingConfig{
    Enabled:    true,
    Initial:    50,
    Thereafter: 100,
    Tick:       0,
}
```

### 시나리오 3: Debug 모드 토글

```go
// 정상: 샘플링됨
logger.SetSampling(&dd.SamplingConfig{
    Enabled: true, Initial: 10, Thereafter: 50,
})

// 문제 해결: 샘플링 비활성화, 전체 로깅
logger.SetSampling(nil)

// 수정 완료: 샘플링 복원
logger.SetSampling(&dd.SamplingConfig{
    Enabled: true, Initial: 10, Thereafter: 50,
})
```

## 스레드 안전성

샘플링은 카운터에 원자적 연산(`atomic.Int64`)을 사용하고 Tick 리셋에 뮤텍스를 사용합니다. 여러 goroutine에서의 동시 로깅에 추가 동기화가 필요 없습니다.

:::tip 팁 Fatal 로그는 샘플링을 우회합니다
샘플링이 활성화되어 있어도 `Fatal` 레벨 로그는 **항상 기록**됩니다 — Fatal은 프로그램 종료 전에 기록되어야 하며 샘플링으로 건너뛰어서는 안 됩니다.
:::

## 다음 단계

- [성능](../../advanced/performance) -- 제로 할당 및 버버 풀 메커니즘
- [Configuration](../basics/configuration) -- 전체 configuration Field
- [Hook 시스템](./hooks) -- BeforeLog Hook으로 샘플링 보완 가능
