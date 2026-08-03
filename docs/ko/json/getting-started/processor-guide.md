---
sidebar_label: "Processor 가이드"
title: "Processor 가이드 - CyberGo JSON | 언제 사용해야 할까"
description: "CyberGo JSON Processor 가이드: 패키지 함수와 Processor 선택 기준, PreParse 사전 파싱 최적화, 수명 주기 관리와 전역 프로세서로 고성능 JSON 처리를 마스터하세요."
sidebar_position: 3
---

# Processor 가이드

이 가이드는 Processor 를 **언제** **어떻게** 사용해야 하는지, 패키지 레벨 함수에 비해 어떤 장점이 있는지 이해하도록 돕습니다.

## 패키지 함수 vs Processor

CyberGo JSON 은 두 가지 API 스타일을 제공합니다:

| 차원 | 패키지 레벨 함수 | Processor |
|------|----------|-----------|
| **일반적인 호출** | `json.GetString(data, "name")` | `p.GetString(data, "name")` |
| **생성 방법** | 생성 불필요, 직접 호출 | `p, err := json.New()` |
| **설정 방법** | 호출마다 `cfg ...Config` 전달 | 생성 시 통합 설정, 이후 재사용 |
| **캐시** | 전역 공유 캐시 | 독립 캐시, 제어 및 정리 가능 |
| **리소스 관리** | 자동 (전역 프로세서) | 수동 `Close()` |
| **훅 시스템** | 미지원 | `AddHook` 지원 |
| **사전 파싱** | 미지원 | `PreParse` + `GetFromParsed` 지원 |
| **적용 시나리오** | 간단한 작업, 스크립트, 저빈도 호출 | 고빈도 작업, 커스텀 설정, 서버 사이드 |

::: tip 빠른 판단
- **패키지 함수 사용**: 가끔 JSON 작업, 수명 주기 관리 불필요, 빠른 스크립트
- **Processor 사용**: 커스텀 설정 필요, 동일 데이터 고빈도 쿼리, 훅/감사 필요
:::

## 언제 Processor 를 사용해야 할까

### 시나리오 1: 커스텀 설정

패키지 레벨 함수는 기본 설정을 사용합니다. 보안 모드, 커스텀 인코더 또는 훅이 필요하다면 Processor 를 사용하세요:

```go
// 패키지 함수 — 항상 기본 설정 사용
val := json.GetString(data, "name")

// Processor — 커스텀 설정 가능
cfg := json.SecurityConfig() // 보안 모드
p, err := json.New(cfg)
if err != nil {
    panic(err)
}
defer p.Close()

// 이후 모든 작업이 보안 설정을 사용
val, err := p.Get(data, "name")
```

### 시나리오 2: 동일 데이터 고빈도 쿼리 (PreParse 최적화)

동일한 JSON 을 여러 번 쿼리할 때, `PreParse` 는 한 번만 파싱하고 이후 쿼리는 파싱 결과를 재사용합니다:

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

// 여러 번 쿼리 — 파싱 결과 재사용, 중복 파싱 회피
name, _ := p.GetFromParsed(parsed, "user.name")
email, _ := p.GetFromParsed(parsed, "user.email")
tags, _ := p.GetFromParsed(parsed, "tags")
```

::: warning 성능 비교
- 패키지 함수 `GetString`: 호출마다 JSON 파싱 (캐시는 있지만 적중률은 시나리오에 따라 다름)
- `PreParse` + `GetFromParsed`: 한 번 파싱, N 번의 쿼리는 탐색만 수행, 중복 파싱 제로
:::

### 시나리오 3: 훅과 감사

로그 기록, 성능 모니터링 또는 입력 검증이 필요할 때, Processor 는 훅 시스템을 지원합니다:

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

// 모든 작업이 자동으로 훅 트리거
result, err := p.Set(data, "user.name", "Alice")
```

자세한 내용은 [Hook 훅 시스템](../extensions/hooks)을 참조하세요.

## 수명 주기 관리

Processor 는 리소스 (캐시, 고루틴) 를 보유하므로 사용 후 **반드시 종료**해야 합니다:

```go
p, err := json.New()
if err != nil {
    panic(err)
}
defer p.Close() // 리소스 해제 보장

// Processor 사용...
result, err := p.GetString(data, "name")
```

::: warning Close 를 잊었을 때의 결과
- 캐시 메모리가 해제되지 않음
- 백그라운드 고루틴 누수
- 고동시성 시나리오에서 리소스 고갈 유발 가능
:::

### 상태 확인

```go
if p.IsClosed() {
    // Processor 가 종료됨, 더 이상 사용 불가
}
```

## 전역 프로세서

패키지 레벨 함수 (`Get`, `Set`, `Marshal` 등) 는 내부적으로 **전역 프로세서**를 사용합니다. 직접 교체할 수도 있습니다:

```go
// 커스텀 설정의 프로세서 생성
cfg := json.SecurityConfig()
p, err := json.New(cfg)
if err != nil {
    panic(err)
}

// 전역 프로세서로 설정
json.SetGlobalProcessor(p)

// 이제 모든 패키지 레벨 함수가 보안 설정을 사용
val := json.GetString(data, "name")

// 애플리케이션 종료 시 정리
defer json.ShutdownGlobalProcessor()
```

::: tip 적용 시나리오
- 전역 통일 보안 정책
- 커스텀 인코더 전역 적용
- 곳곳에 Config 를 전달하지 않고 기본 설정 교체 필요
:::

## 선택 의사결정 트리

```
JSON 작업이 필요한가?
├── 가끔 사용, 스크립트 도구
│   └── → 패키지 함수 json.GetString / json.Set / json.Marshal
├── 커스텀 설정 필요 (보안/인코딩/훅)
│   └── → Processor json.New(cfg)
├── 동일 JSON 을 여러 번 쿼리
│   └── → Processor + PreParse
├── 감사/모니터링/로그 필요
│   └── → Processor + AddHook
└── 전역 통일 설정
    └── → SetGlobalProcessor
```

## 다음 단계

- [경로 표현식 문법](./path-syntax) — 경로 쿼리 전체 문법
- [Processor API](../api-reference/processor/) — 전체 메서드 참조
- [성능 최적화](../advanced/performance) — 심층 성능 튜닝
- [치트시트](./cheatsheet) — API 빠른 참조
