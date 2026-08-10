---
sidebar_label: "프로덕션 체크리스트"
title: "프로덕션 체크리스트 - CyberGo html | 런칭 보안 점검"
description: "CyberGo html 프로덕션 배포 보안 체크리스트: HighSecurityConfig 프리셋, Processor 생명주기 관리, 감사 모니터링, 컨텍스트 타임아웃, 오류 처리, 정제 활성화 등 P0·P1·P2 우선순위 안전 항목을 다룹니다."
sidebar_position: 3
---

# 프로덕션 체크리스트

html 라이브러리를 프로덕션에 올리기 전에, 이 체크리스트를 항목별로 점검하세요. 각 항목에는 우선순위가 표시되어 있어, 무엇을 반드시 해야 하고 무엇을 나중에 보완할 수 있는지 판단하기 쉽습니다:

- 🔴 **필수 (P0)**: 하지 않으면 보안 취약점이나 리소스 누출 발생
- 🟡 **권장 (P1)**: 강력 권장, 신뢰성과 관측성에 영향
- 🟢 **선택 (P2)**: 있으면 더 좋음

:::tip 프리셋 먼저 사용, 비즈니스에 따라 미세 조정
`HighSecurityConfig()`는 이미 모든 제한을 안전한 수준으로 강화하고 완전한 감사를 활성화합니다. 신뢰할 수 없는 입력을 다루는 대부분의 시나리오에서는 이를 그대로 사용하고 필요에 따라 완화하면 되며, 제로에서부터 설정을 조립할 필요가 없습니다.
:::

## 기본 설정

- [ ] 🔴 `HighSecurityConfig()` 또는 커스텀 보안 설정을 출발점으로 사용
- [ ] 🔴 합리적인 `MaxInputSize` 설정 (비즈니스 요구에 따라, 하드 상한 50MB)
- [ ] 🔴 장시간 차단을 방지하기 위해 `ProcessingTimeout` 설정 (권장 10–30s)
- [ ] 🟡 DOM 깊이를 제한하는 `MaxDepth` 설정 (기본 500, 고보안 권장 100)
- [ ] 🟡 `EnableSanitization = true` 유지 (기본값 켜짐, 끄지 마세요)
- [ ] 🟢 동시성에 따라 `WorkerPoolSize` 조정 (기본 4, 상한 256)

**이유**:

- `MaxInputSize`는 첫 번째 메모리 방어선입니다. 동시에 `maxConfigInputSize`(50MB) 하드 제약을 받습니다 — 잘못 설정해도 위험한 값까지 커지지 않습니다. 피크 메모리는 대략 `MaxInputSize × WorkerPoolSize`로 추정되며, 공용 웹 API 는 10MB 로 강화하는 것을 권장합니다.
- `WorkerPoolSize`는 배치 추출의 동시성을 결정합니다. CPU 코어 수로 설정하면 보통 충분합니다; 너무 크게 설정하면 (256 상한에 가깝게) 고동시성에서 대량의 goroutine 과 메모리 압력이 발생합니다.
- `CacheTTL`(기본 1h)과 `CacheCleanup`(기본 5min)은 결과 캐시의 수명 주기와 백그라운드 정리 주기를 제어합니다. `MaxCacheEntries`를 0으로 설정하면 캐시를 완전히 비활성화합니다; 캐시 적중은 CPU 만 절약할 뿐 메모리는 절약하지 않으며, 캐시 항목 자체도 메모리를 차지합니다 (상한 100000 건).

## Processor 라이프사이클

- [ ] 🔴 `defer p.Close()`를 사용하여 Processor 가 올바르게 해제되도록 보장
- [ ] 🔴 `Close()` 이후 어떤 추출 메서드도 계속 호출하지 않기 (`ErrProcessorClosed` 반환)
- [ ] 🟡 요청마다 새로 만드는 대신 싱글톤 Processor 로 요청 간 재사용

```go
p, err := html.New(html.HighSecurityConfig())
if err != nil {
    log.Fatal(err)
}
defer p.Close()
```

**이유**:

- `Processor`는 동시성 안전하며, 생성 후 여러 goroutine 이 공유할 수 있고, 내부 캐시와 통계 카운터는 모두 동기화 보호를 받습니다. 이를 애플리케이션 수준 싱글톤으로 만들면 (예: HTTP handler 가 전역 `*html.Processor`를 보유), 캐시를 재사용하면서 반복 초기화 오버헤드도 피할 수 있습니다.
- **요청마다 `html.New()`를 하지 마세요**: 각 Processor 는 백그라운드 캐시 정리 goroutine 을 시작하고, 캐시와 감사 구조를 할당하므로, 빈번한 생성은 리소스를 낭비하고 GC 압력을 높입니다.
- 패키지 수준 편의 함수(`html.Extract`, `html.ExtractWithContext` 등)는 내부적으로 `sync.Pool`로 임시 Processor 를 재사용하지만, **추출 결과를 캐시하지 않습니다** — 호출 간에 캐시 적중이 불가능합니다. 캐시 재사용이 필요한 시나리오에서는 Processor 인스턴스를 명시적으로 보유하세요.

## 감사와 모니터링

- [ ] 🔴 감사 시스템 활성화 (`Audit.Enabled = true`)
- [ ] 🟡 `WriterAuditSink`로 감사 로그를 파일에 영속화
- [ ] 🟡 `GetStatistics()`의 `ErrorCount`와 `CacheHits` 모니터링
- [ ] 🟡 critical 급 이벤트(입력 위반, 경로 순회)에 실시간 알림 설정
- [ ] 🟢 `ChannelAuditSink`로 감사 스트림을 외부 SIEM 에 연결

```go
auditFile, err := os.OpenFile("audit.jsonl", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
if err != nil {
    log.Fatal(err)
}
defer auditFile.Close()

cfg := html.HighSecurityConfig()
cfg.Audit.Sink = html.NewWriterAuditSink(auditFile)
```

**분급 감사 파이프라인** — critical 이벤트는 실시간 알림, 나머지는 파일에 보관:

```go
// critical 이벤트를 channel 에 푸시, 독립 goroutine 이 알림 발송
alertSink := html.NewChannelAuditSink(50)
go func() {
    for entry := range alertSink.Channel() {
        sendAlert(entry) // PagerDuty / Slack / SMS 연결
    }
}()

// 파일 보관 + critical 알림, 두 경로가 병렬로 서로 차단하지 않음
cfg.Audit.Sink = html.NewMultiSink(
    html.NewWriterAuditSink(auditFile),
    html.NewFilteredSink(alertSink, func(e html.AuditEntry) bool {
        return e.Level == html.AuditLevelCritical
    }),
)
```

**ChannelAuditSink 의 폐기 모니터링**: channel 버퍼가 가득 차면 이벤트가 폐기되며, `DroppedCount()`로 점검합니다:

```go
if n := alertSink.DroppedCount(); n > 0 {
    log.Printf("알림 channel 이 %d 건의 감사 이벤트를 폐기했습니다, 버퍼를 확장하거나 소비를 가속하세요", n)
}
```

더 많은 파이프라인 구성 패턴(레벨별 라우팅, 커스텀 Sink, 고보안 포렌식)은 [감사 시스템 실전](./audit-pipeline)을 참조하세요.

## 컨텍스트와 타임아웃

- [ ] 🔴 모든 추출 작업에 `ExtractWithContext` 버전을 사용, 날것의 `Extract` 대신
- [ ] 🔴 합리적인 컨텍스트 타임아웃 설정
- [ ] 🟡 배치 작업에 취소가 포함된 컨텍스트 사용, 오류 발생 시 나머지 작업을 즉시 중단 가능

```go
ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
defer cancel()
result, err := p.ExtractWithContext(ctx, data)
```

**이유**:

- 라이브러리에는 두 계층의 타임아웃이 있습니다: `Config.ProcessingTimeout`(기본 30s, 단일 문서에 적용)과 호출자가 전달한 `context.Context`. 둘은 **누적 적용**됩니다 — 먼저 만료되는 것이 우선. 타임아웃 context 를 전달하지 않아도 `ProcessingTimeout`이 안전망이 되며; 더 짧은 context 를 전달하면 context 가 우선합니다.
- 배치 추출(`ExtractBatch`)은 전체 배치에 총 타임아웃 context 를 설정하여, 한 배치의 소요가 통제 불능이 되는 것을 방지해야 합니다. 단일 항목 실패가 전체 배치를 차단해서는 안 됩니다 — 배치 메서드는 내부적으로 각 항목을 독립적으로 recover 합니다.
- 타임아웃 메커니즘은 독립 goroutine + context deadline 으로 구현되며, 전역적으로 `maxTimeoutGoroutines`(1000)의 보호를 받습니다. 극도의 동시성에서 한도를 초과하면, 새 요청은 goroutine 을 무한히 쌓는 대신 직접 `ErrProcessingTimeout`을 반환합니다.

## 오류 처리

- [ ] 🔴 `errors.Is`로 비즈니스 오류와 보안 오류를 구분
- [ ] 🔴 `*FileError`는 원시 오류 문자열 대신 `SafePath()`로 출력
- [ ] 🟡 모든 `ErrInputTooLarge`와 `ErrMaxDepthExceeded` 기록 (공격 탐지일 수 있음)
- [ ] 🟡 `ErrInternalPanic` 발생 빈도 모니터링 (나타나면 조사하고 issue 로 보고)
- [ ] 🟢 `ErrProcessorClosed`에 대해 크래시 대신 우아한 저하 수행

```go
_, err := p.Extract(data)
switch {
case errors.Is(err, html.ErrInputTooLarge):
    log.Printf("입력 한도 초과, 공격 탐지로 의심됨")
case errors.Is(err, html.ErrMaxDepthExceeded):
    log.Printf("깊이 위반, 재귀 폭탄으로 의심됨")
case errors.Is(err, html.ErrInternalPanic):
    // panic 은 이미 recover 되었지만, 이는 라이브러리 버그이므로 보고해야 함
    log.Printf("내부 panic 복구됨: %v", err)
case errors.Is(err, html.ErrFileNotFound),
    errors.Is(err, html.ErrInvalidFilePath):
    var fe *html.FileError
    if errors.As(err, &fe) {
        log.Printf("파일 오류: %s", fe.SafePath()) // 파일명만 출력, 전체 경로 노출 안 함
    }
}
```

**이유**:

- `FileError.Error()`에는 내장 탈감지가 되어 있습니다 (파일명만 표시, 전체 경로는 표시하지 않음), 하지만 `FileError.Path` 필드는 원본 경로를 보존합니다. 로그에서는 **반드시 `SafePath()`를 거치세요**, 서버 측 디렉토리 구조가 로그 집계 시스템으로 유출되는 것을 방지합니다.
- `ErrInternalPanic`은 이론적으로 나타나지 않아야 합니다 — 악의적인 입력이 라이브러리가 예상하지 못한 panic 을 유발했음을 의미합니다. 모니터링에서 감지되면, 트리거 입력을 보존하고 보고해야 합니다. 라이브러리의 panic 복구는 프로세스가 크래시되지 않도록 보장하지만, 이에 장기적으로 의존해서는 안 됩니다.

## 리소스 관리

- [ ] 🔴 배치 작업은 단일 배치당 10000 건을 초과하지 않기
- [ ] 🟡 `WorkerPoolSize`를 합리적으로 설정 (CPU 코어 수와 같게 권장)
- [ ] 🟡 메모리 사용량과 캐시 적중률 모니터링
- [ ] 🟢 장기 실행 인스턴스는 정기적으로 `ClearCache()`를 호출하여 캐시 해제

**이유**:

- **피크 메모리 추정**: `MaxInputSize × WorkerPoolSize`가 대략 배치 처리 시의 메모리 피크입니다 (각 worker 가 동시에 입력 한 건을 처리). 예: `10MB × 8 = 80MB`. 이에 따라 컨테이너 메모리를 예약하세요.
- **캐시와 메모리**: `MaxCacheEntries`(기본 2000)의 각 캐시 항목은 추출 결과 크기만큼 메모리를 차지합니다. 장기 실행 서비스에서 메모리가 부족하면 entries 를 줄이거나 `CacheTTL`을 단축할 수 있습니다; `CacheCleanup`이 짧을수록 만료 항목 회수가 더 시기적절합니다.
- **분할 전략**: 단일 배치가 너무 크면 메모리를 차지할 뿐만 아니라 실패 비용도 증폭합니다. 대규모 작업을 배치당 1000–5000 건의 소규모 배치로 나누고, 각 배치에 독립적인 타임아웃 context 를 사용하여, 한 배치의 실패가 후속 배치에 영향을 주지 않도록 권장합니다.

## 파일 처리

- [ ] 🔴 파일 경로 출처 검증 (사용자가 전체 경로를 직접 제어하지 못하도록)
- [ ] 🔴 `AllowedBaseDir` 설정으로 파일 읽기 디렉토리 제한
- [ ] 🟡 처리 전 `os.Stat`으로 파일 크기 사전 점검 (라이브러리 내부에서 이미 수행, 외부에서 한 번 더 하면 더 안정적)
- [ ] 🟢 업로드 파일에 대해 유형/확장자 화이트리스트 검증

**이유**:

- `AllowedBaseDir`은 파일 읽기의 샌드박스입니다. **OS 파일 핸들로 실제 경로를 해석**하여, `filepath.EvalSymlinks`가 처리할 수 없는 Windows junction/reparse points 와 크로스 플랫폼 symlink 탈출을 차단합니다. 비워 두면 = `..` 순회 감지만 유지하고 샌드박스는 활성화하지 않음 — 경로가 사용자 입력에서 온다면 반드시 명시적으로 설정해야 합니다.
- 라이브러리 내부는 이미 `ReadAll`로 메모리에 적재하기 전에 `Stat`으로 파일 크기를 사전 점검하고 한도 초과 파일을 거부하여, 「모두 읽은 후 한도 초과 발견」의 메모리 피크 윈도우를 닫았습니다. 외부 비즈니스에서 크기 사전 점검을 한 번 더 하는 것은 심층 방어에 해당합니다.

## 배포 전 자체 점검 스크립트

런칭 전에 이 자체 점검 프로그램을 한 번 실행하여, 설정이 합법적이고 Processor 가 정상적으로 생성 및 추출되는지 검증하세요:

```go
package main

import (
    "context"
    "fmt"
    "log"
    "time"

    "github.com/cybergodev/html"
)

func main() {
    cfg := html.HighSecurityConfig()

    // 1. 설정 합법성 검증 (New 내부에서 Validate 호출)
    p, err := html.New(cfg)
    if err != nil {
        log.Fatalf("설정이 유효하지 않음: %v", err)
    }
    defer p.Close()

    // 2. 핵심 설정 항목 확인
    fmt.Printf("MaxInputSize      = %d bytes\n", cfg.MaxInputSize)
    fmt.Printf("MaxDepth          = %d\n", cfg.MaxDepth)
    fmt.Printf("ProcessingTimeout = %v\n", cfg.ProcessingTimeout)
    fmt.Printf("WorkerPoolSize    = %d\n", cfg.WorkerPoolSize)
    fmt.Printf("Audit.Enabled     = %v\n", cfg.Audit.Enabled)

    // 3. 실제 추출 테스트
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()

    sample := []byte("<html><body><h1>자체 점검</h1><p>프로덕션 준비 완료</p></body></html>")
    result, err := p.ExtractWithContext(ctx, sample)
    if err != nil {
        log.Fatalf("추출 실패: %v", err)
    }
    fmt.Printf("추출 성공, 텍스트 길이: %d\n", len(result.Text))

    fmt.Println("✓ 설정 자체 점검 통과")
}
```

:::tip 자체 점검은 "실행 가능"만 검증
자체 점검 스크립트는 설정이 합법적이고 링크가 원활함을 확인하지만, 실제 트래픽 하의 모니터링을 **대체하지 않습니다**. 런칭 후에도 런타임 지표를 지속적으로 관찰해야 합니다.
:::

## 런타임 모니터링 요점

배포 후 다음 지표를 지속적으로 관찰하고, 이상 시 즉시 알림:

| 지표 | 획득 방법 | 알림 임계값 | 가능한 원인 |
|------|----------|----------|----------|
| 오류율 | `Statistics.ErrorCount / TotalProcessed` | > 5% | 입력 품질 저하, 설정 과도하게 엄격, 업스트림 이상 |
| 캐시 적중률 | `Statistics.CacheHits / TotalProcessed` | < 30% | 입력 중복 제거 부족, 캐시 TTL 너무 짧음 |
| 평균 처리 시간 | `Statistics.AverageProcessTime` | 비즈니스 기준선 초과 | 악의적 입력, 타임아웃 설정 부적절 |
| critical 감사 이벤트 | `GetAuditLog()`에서 `AuditLevelCritical` 필터 | 임의 한 건 | 입력 위반, 경로 순회 공격 |
| ChannelAuditSink 폐기 수 | `sink.DroppedCount()` | > 0 | 버퍼 부족, 소비자 과도하게 느림 |

```go
// 정기적 지표 수집 (예: 매분 Prometheus 가 pulling)
stats := p.GetStatistics()
var errorRate float64
if stats.TotalProcessed > 0 {
    errorRate = float64(stats.ErrorCount) / float64(stats.TotalProcessed)
}

hitRate := 0.0
if stats.TotalProcessed > 0 {
    hitRate = float64(stats.CacheHits) / float64(stats.TotalProcessed)
}

log.Printf("처리됨=%d 오류율=%.2f%% 캐시적중=%.1f%% 평균소요=%v",
    stats.TotalProcessed, errorRate*100, hitRate*100, stats.AverageProcessTime)

// critical 이벤트 점검
for _, e := range p.GetAuditLog() {
    if e.Level == html.AuditLevelCritical {
        log.Printf("[알림] critical 감사 이벤트: %s - %s", e.EventType, e.Message)
    }
}
```

:::warning Statistics 는 누적값
`GetStatistics()`가 반환하는 카운터는 Processor 생성 시점부터 누적되며, `ClearCache()`로 재설정되지 않습니다. 윈도우별 통계가 필요할 때는 정기적으로 `ResetStatistics()`로 0 으로 만들거나, 직접 차분을 계산하세요.
:::

## 설정 빠른 참조 매트릭스

배포 환경에 따라 빠르게 설정값을 선택:

| 환경 | MaxInputSize | ProcessingTimeout | MaxDepth | WorkerPoolSize | 감사 | 추천 프리셋 |
|------|-------------|-------------------|----------|----------------|------|----------|
| 내부 도구 | 50MB(기본값) | 30s(기본값) | 500(기본값) | 4(기본값) | 선택 | `DefaultConfig()` |
| Web API | 10MB | 10s | 200 | CPU 코어 수 | 권장 | `DefaultConfig()` 미세 조정 |
| 고보안 | 10MB | 10s | 100 | 2 | 필수 | `HighSecurityConfig()` |
| 배치 크롤러 | 50MB | 30s | 500 | 8–16 | 권장 | `DefaultConfig()` 미세 조정 |

:::tip 크롤러 시나리오의 특수 고려사항
배치 크롤러는 신뢰할 수 없는 웹페이지를 다루지만 처리량을 우선시합니다. `EnableSanitization = true`를 유지하고, `WorkerPoolSize`를 8–16으로 올려 처리량을 높이며, 동시에 각 배치 작업에 독립적인 총 타임아웃 context 를 설정하여, 악의적 페이지가 전체 배치를 마비시키는 것을 방지하는 것을 권장합니다.
:::

## 관련 문서

- [보안 개요](./) — 심층 방어 아키텍처와 각 방어 계층 상세
- [감사 시스템 실전](./audit-pipeline) — 8 가지 이벤트 유형, 내장 Sink 비교, 분급 라우팅 파이프라인
- [API 레퍼런스: 보안 방어](../../api-reference/modules/security) — 보안 관련 API 시그니처
- [API 레퍼런스: 상수와 오류](../../api-reference/types/constants) — 기본값 상수와 센티넬 오류
