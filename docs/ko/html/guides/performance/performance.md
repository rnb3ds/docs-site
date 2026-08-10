---
sidebar_label: "성능 최적화"
title: "성능 최적화 - CyberGo html | 처리량 향상 가이드"
description: "CyberGo html 성능 최적화 가이드: Processor 인스턴스 재사용, 캐시 전략과 적중률 모니터링, 배치 동시성 제어, 입력 크기·타임아웃 설정, 실전 안티패턴 회피와 벤치마크 방법으로 처리량을 향상합니다."
sidebar_position: 3
---

# 성능 최적화

이 페이지는 html 라이브러리의 성능 튜닝 총괄 가이드입니다: 먼저 라이브러리 **내부에 이미 구현된 최적화 메커니즘**(성능 특성 이해에 도움)을 설명하고, 그 다음 **설정 레벨 튜닝**, **안티패턴 회피**, **벤치마크 방법**을 제공합니다.

특정 주제의 전체 세부 정보가 필요하다면, 같은 그룹의 심층 페이지를 참조하세요:

- [Processor 재사용과 캐시](./processor-cache) — 패키지 함수 vs 인스턴스, `sync.Pool` 메커니즘, 캐시 전략과 적중률 모니터링
- [배치 처리 실전](./batch-processing) — 4개의 배치 API, `BatchResult` 구조, 동시성 제어와 부분 실패 처리

## 내부 최적화 메커니즘

html 라이브러리는 핫 경로에서 대량의 제로 할당과 재사용 최적화를 수행했습니다. 이러한 메커니즘을 이해하면 다양한 사용 방식의 성능 특성을 예측할 수 있고, 라이브러리의 최적화와 '충돌'하는 것을 피할 수 있습니다.

### sync.Pool 로 Processor 재사용

패키지 함수(예: `html.Extract`)는 `sync.Pool`을 통해 `Processor` 인스턴스를 재사용하여, 매번 인코딩 감지기, 평가기 등 무거운 객체를 재구성하는 것을 피합니다:

```text
html.Extract(data)
  → sync.Pool 에서 Processor 획득(풀 적중 시 재사용, 미스 시 새로 생성)
  → 추출 실행
  → sync.Pool 로 반환(통계 리셋 + 감사 로그 비움 + 캐시 비움)
```

풀링된 Processor 에는 두 가지 핵심 설계가 있습니다:

- **캐시 비활성화**: 풀링된 인스턴스의 `MaxCacheEntries`, `CacheTTL`, `CacheCleanup`은 모두 0으로 설정됩니다. 풀링된 인스턴스는 반환될 때마다 `ClearCache()`가 호출되므로, 캐시를 활성화하면 해시 계산과 백그라운드 정리 goroutine 의 비용만 들 뿐(`Get`은 항상 미스), 적중할 수 없습니다.
- **커스텀 Config 전달 시 풀링 안 함**: `html.Extract(data, cfg)`로 커스텀 설정을 전달하면, 라이브러리는 **임시 Processor**(사용 후 즉시 `Close()`)를 생성합니다. 풀의 인스턴스는 기본 설정으로 고정되어 있기 때문입니다.

:::tip 언제 직접 인스턴스를 생성해야 하나요
풀링된 인스턴스는 캐시가 비활성화되어 있습니다. 루프 안에서 **중복 가능성이 있는** 콘텐츠를 반복 처리한다면(크롤러 중복 제거, 캐시 계층 downstream 서비스), `html.New()`로 상주형 `Processor` 인스턴스를 생성해야 캐시 적중의 혜택을 누릴 수 있습니다. 자세한 내용은 [Processor 재사용과 캐시](./processor-cache)를 참조하세요.
:::

### 캐시 Key 생성 전략

캐시 Key 는 `[16]byte`(128 비트) 값으로, `map` 키로 직접 사용되며 **Key 생성은 힙 할당을 발생시키지 않습니다**. Key 계산 입력은 다음을 포함합니다:

- 인코딩 변환 후의 **UTF-8 콘텐츠**(원시 바이트가 아님) — 동일한 콘텐츠를 다른 인코딩 선언으로 입력해도 동일한 캐시 항목에 적중;
- 콘텐츠 추출 스위치(`ExtractArticle`, `PreserveImages` 등 5개의 boolean 비트)가 하나의 `uint8`로 패킹됨;
- 포맷 옵션(`InlineImageFormat`, `InlineLinkFormat`, `TableFormat`).

다양한 크기의 콘텐츠에 대해, Key 생성은 두 가지 전략을 사용합니다:

| 콘텐츠 크기 | 전략 | 설명 |
|----------|------|------|
| ≤ 64 KB | 전체 콘텐츠 해시 | 모든 바이트에 대해 xxHash 스타일 계산, 충돌 위험 없음 |
| > 64 KB | 5점 샘플링 | 헤드 + 테일 + 3개 균등 분포 샘플링 지점, 각 세그먼트 4096 바이트 |

대용량 문서 샘플링은 해시 비용을 제한하기 위함입니다 — 10 MB 문서에 대해 전체 해시를 수행하면 캐시가 가져오는 이점이 상쇄됩니다. 5점 샘플링은 **해시 플러딩 방지**(문서 임의 위치의 수정이 높은 확률로 Key 를 변경)와 **처리량**을 균형 있게 고려합니다.

### 사전 할당과 객체 풀링

추출 과정에서 가장 빈번하게 할당되는 객체는 이미 풀링되거나 사전 할당되어 있습니다:

| 객체 | 메커니즘 | 역할 |
|------|------|------|
| 텍스트 빌더(`TrackedBuilder`) | `sync.Pool` | 호출 간 underlying `[]byte` 용량 재사용, 매 추출마다 0에서 문서 길이까지 성장하는 것 방지 |
| 링크 결과 슬라이스 | 사전 할당 용량 128 | 일반적인 페이지의 링크 수를 커버, `append` 시 underlying 배열 복사 방지 |
| 깊이 검증 스택(`depthStackEntry`) | `sync.Pool` | 반복식 깊이 검증의 스택 재사용, 매 추출마다 스택 할당 방지 |
| `[]byte` 임시 버퍼 | `sync.Pool` | 인코딩 변환, 텍스트 조합 등 고빈도 소 버퍼 재사용 |

:::warning 초대형 버퍼는 풀에서 폐기됨
'한 번의 초대형 문서 추출 → 풀이 영구적으로 초대형 버퍼 보유 → 후속 소규모 요청이 모두 대형 버퍼를 수령'하는 전형적인 `sync.Pool` 함정을 방지하기 위해, 용량이 64 KiB를 초과하는 버퍼는 반환 시 풀에 **돌려보내지 않고 폐기**됩니다. 이는 초대형 문서 처리 시 풀링 이점을 얻지 못함을 의미하며, 정상적인 현상입니다.
:::

### 사전 계산된 포맷 문자열

`New()` 시점에 `InlineImageFormat`/`InlineLinkFormat`이 `normalizeInlineFormat`(소문자화 + trim + 빈 값을 `"none"`으로 정규화)을 통해 사전 계산되어 `Processor` 필드에 저장됩니다. 추출 핫 경로에서는 사전 계산된 값을 직접 비교하여 **매 추출마다 `strings.ToLower`를 수행하는 것을 방지**합니다.

이 최적화는 단일 추출에는 미미한 영향이 있지만, 수만 건의 문서를 배치 처리할 때 누적 효과가 상당합니다.

### 미디어 추출의 지연 할당

비디오/오디오 추출은 2단계 게이팅을 사용하여 '미디어 콘텐츠 없음'이라는 일반적인 시나리오에서 거의 제로 오버헤드를 달성합니다:

1. **사전 정규식 게이팅**: 먼저 `HasMediaReference`로 빠르게 스캔하여, 콘텐츠가 미디어 참조를 **포함하지 않음**을 확인하면, 모든 정규식 스캔과 iframe/embed/object 속성 추출을 건너뜁니다.
2. **크기 게이팅**: 콘텐츠가 1 MB(`maxHTMLForRegex`)를 초과하면 정규식 스캔을 건너뜁니다 — 초대형 문서에서 정규식 실행은 느리고 ReDoS 위험이 있습니다.
3. **지연 초기화**: `ensureDedup`는 첫 번째 미디어 매치가 나타날 때만 결과 슬라이스와 중복 제거 map 을 할당합니다. 미디어가 없는 문서는 전체 과정에서 제로 할당입니다.

:::tip 순수 텍스트 시나리오의 최적 설정
본문 텍스트에만 관심이 있고 이미지/비디오/오디오 정보가 필요 없다면, [`TextOnlyConfig()`](../../api-reference/core/config#프리셋-설정)로 모든 미디어 보존을 한 번에 끄세요. 여기에 설명된 지연 메커니즘과 결합하면 미디어 관련 오버헤드가 0에 가까워집니다.
:::

## 캐시 심층 튜닝

[Processor 재사용과 캐시](./processor-cache)에서 캐시 기본 사용법과 적중률 모니터링을 소개합니다. 여기서는 캐시 동작에 영향을 미치는 몇 가지 핵심 세부 사항을 보충합니다.

### 적중 조건

두 입력이 **동일한 캐시 Key**를 생성해야 적중합니다. 이는 다음을 의미합니다:

- 동일한 콘텐츠 + 동일한 설정 → 적중;
- 동일한 콘텐츠의 바이트 시퀀스이지만 다른 인코딩을 선언한 경우(예: 하나는 `charset=gbk`, 하나는 `charset=utf-8`인 동일한 본문) → **적중**(Key 는 인코딩 변환 후의 UTF-8 텍스트로 계산);
- 동일한 콘텐츠이지만 `PreserveImages` 등 스위치가 다름 → **미적중**(스위치 비트가 Key 계산에 참여).

### 적중 후의 클론 비용

매 캐시 적중은 `cloneResult`(Images/Links/Videos/Audios 슬라이스를 포함한 전체 `Result`의 깊은 복사)를 반환합니다. 이는 **필수적**입니다 — 캐시의 항목은 동시에 읽히므로, 포인터를 직접 반환하면 호출자가 결과를 수정할 때 aliasing 을 통해 캐시가 오염됩니다.

대가는: `Result`에 다량의 링크/이미지가 포함될 때, 클론 자체에도 일정한 비용이 든다는 것입니다. '캐시 적중률이 매우 높음 + 단일 결과가 매우 큼'인 시나리오(예: 동일한 링크 집약적 대형 문서를 반복 추출)에서는 이 비용이 드러날 수 있습니다.

### 캐시 비활성화 시기

`MaxCacheEntries = 0`일 때, `Extract`는 **Key 생성을 완전히 건너뜁니다**(해시 계산 안 함, 조회 안 함, 쓰기 안 함). 이는 '캐시를 켰지만 항상 미스'가 아니라 진정한 제로 오버헤드입니다.

캐시 비활성화는 **대량의 서로 다른 콘텐츠를 일회성으로 처리**하는 시나리오에 적합합니다:

```go
package main

import (
    "fmt"

    "github.com/cybergodev/html"
)

func main() {
    // 크롤러가 수많은 서로 다른 페이지 처리: 캐시 비활성화로 해시 계산과 메모리 점유 절약
    cfg := html.DefaultConfig()
    cfg.MaxCacheEntries = 0 // 제로 오버헤드로 전체 캐시 계층 스킵
    cfg.CacheTTL = 0         // 백그라운드 정리 goroutine 도 동시 비활성화
    cfg.CacheCleanup = 0

    p, err := html.New(cfg)
    if err != nil {
        panic(err)
    }
    defer p.Close()

    // eachPage 는 실제 크롤링 스트림에서 가져오며, 거의 중복되지 않음
    result, err := p.Extract([]byte("<html><body>모든 페이지가 서로 다름</body></html>"))
    if err != nil {
        panic(err)
    }
    fmt.Println("텍스트 길이:", len(result.Text))
    // 출력: 텍스트 길이: ...
}
```

### 포맷 변환은 주 캐시를 사용하지 않음

`ExtractToMarkdown` / `ExtractToMarkdownFromFile`은 내부적으로 `buildFormatProcessor`를 통해 **캐시가 비활성화된 임시 Processor**를 생성하여 포맷 변환을 수행합니다. 이는 다음을 의미합니다:

- Markdown 변환은 주 Processor 의 캐시를 **읽지도, 쓰지도** 않습니다 — 이전에 `Extract`로 동일한 콘텐츠를 추출했어도, `ExtractToMarkdown`은 적중하지 않습니다;
- 동일한 콘텐츠에 대해 `ExtractToMarkdown`을 여러 번 호출해도 서로 적중하지 않습니다.

:::warning 포맷 변환의 캐시 적중을 기대하지 마세요
동일한 콘텐츠에 대해 반복적으로 Markdown 이 필요하다면, `ExtractToMarkdown`을 여러 번 호출하는 것보다 `Extract`를 한 번 호출(`InlineImageFormat`/`InlineLinkFormat`을 `"markdown"`으로 설정)하는 것이 낫습니다 — 결과가 주 캐시에 들어가, 중복 입력 시 적중할 수 있습니다.
:::

## 타임아웃과 goroutine 관리

`ProcessingTimeout`은 강제 kill 이 아닌 협력적 타임아웃입니다. 그 협력 지점과 오류 의미를 이해하면 타임아웃과 사용자 취소를 올바르게 처리할 수 있습니다.

### 협력적 취소 메커니즘

`ProcessingTimeout > 0`일 때, 라이브러리는 전달된 context 에서 deadline 이 있는 child context 를 파생하며, 처리 함수는 **핵심 체크포인트**에서 `ctx.Done()`을 폴링합니다:

- 인코딩 감지 전
- DOM 파싱 전
- 깊이 검증 전
- 콘텐츠 추출 전

deadline 이 도래하면, 처리는 **다음 체크포인트**에서 중단되고 오류를 반환합니다. 이는 타임아웃이 즉시 효과가 나지 않음을 의미합니다 — 두 체크포인트 사이의 작업(예: 초대형 문서 파싱)은 완료됩니다.

### 타임아웃 goroutine 의 전역 상한

타임아웃이 있는 각 추출은 완료 또는 타임아웃까지 하나의 goroutine 을 점유합니다. goroutine 누수로 인한 자원 고갈을 방지하기 위해, 라이브러리는 전역 상한 `maxTimeoutGoroutines = 1000`을 설정합니다. 동시 타임아웃 작업 수가 상한에 도달하면, 새 추출은 **즉시** `ErrProcessingTimeout`을 반환합니다(대기하지 않음).

:::warning 배치 시나리오의 동시성 상한
배치 추출(`ExtractBatch`)의 동시성은 `WorkerPoolSize`(기본 4, 상한 256)로 제한되며, 일반적으로 1000 의 goroutine 상한보다 훨씬 낮습니다. 하지만 애플리케이션 계층에서 자체적으로 타임아웃이 있는 `ExtractWithContext`를 대량으로 동시 호출한다면, 이 전역 상한에 주의해야 합니다 — 프로세스 수준이며 모든 Processor 간에 공유됩니다.
:::

### 세 가지 취소 소스 구분

애플리케이션 계층에서 타임아웃/취소를 처리할 때, 오류 타입에 따라 소스를 구분해야 합니다:

| trigger 조건 | 반환 오류 | 의미 |
|----------|----------|------|
| 라이브러리 내 `ProcessingTimeout` 만료 | `ErrProcessingTimeout` | 단일 문서 처리가 설정된 타임아웃을 초과 |
| 사용자 context 의 deadline 만료 | `context.DeadlineExceeded` | 외부 context 타임아웃(라이브러리가 원형 그대로 전달) |
| 사용자의 수동 context 취소 | `context.Canceled` | 외부 수동 취소(라이브러리가 원형 그대로 전달) |

```go
package main

import (
    "context"
    "errors"
    "fmt"
    "time"

    "github.com/cybergodev/html"
)

func main() {
    cfg := html.DefaultConfig()
    cfg.ProcessingTimeout = 5 * time.Second // 라이브러리 내 타임아웃
    p, err := html.New(cfg)
    if err != nil {
        panic(err)
    }
    defer p.Close()

    // 외부 context 로 한 겹 더 보험(라이브러리 내 타임아웃보다 짧게 가능)
    ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
    defer cancel()

    result, err := p.ExtractWithContext(ctx, []byte("<html></html>"))
    switch {
    case errors.Is(err, html.ErrProcessingTimeout):
        fmt.Println("라이브러리 내 처리 타임아웃: ProcessingTimeout 을 늘리거나 입력을 줄이는 것을 고려하세요")
    case errors.Is(err, context.DeadlineExceeded):
        fmt.Println("외부 context 타임아웃")
    case errors.Is(err, context.Canceled):
        fmt.Println("호출자 수동 취소")
    case err != nil:
        fmt.Println("기타 오류:", err)
    default:
        fmt.Println("성공, 텍스트 길이:", len(result.Text))
    }
    // 출력: 성공, 텍스트 길이: ...
}
```

## 배치 처리 성능 튜닝

[배치 처리 실전](./batch-processing)에서 배치 API 사용법을 상세히 소개합니다. 여기서는 처리량에 영향을 미치는 몇 가지 튜닝 포인트에 집중합니다.

### WorkerPoolSize 의 역할

`WorkerPoolSize`는 **semaphore**(버퍼 채널)로 동시 goroutine 수를 제한하며, 무제한 spawn 이 아닙니다:

```text
ExtractBatch(items)
  → 각 항목에 대해 extractor 생성
  → 루프: 먼저 semaphore 슬롯 획득(가득 차면 블록) → 그 다음 goroutine spawn
  → goroutine 완료 후 슬롯 해제
```

따라서 배치 크기에 관계없이 **동시에 실행 중인 추출 수**는 항상 `WorkerPoolSize`를 초과하지 않습니다. 기본값 4는 I/O 혼합 시나리오에 적합하며, 순수 CPU 집약적 추출은 `runtime.NumCPU()`에 가깝게 설정할 수 있습니다(상한 256).

```go
package main

import (
    "fmt"
    "runtime"

    "github.com/cybergodev/html"
)

func main() {
    cfg := html.DefaultConfig()
    // WorkerPoolSize 상한은 256, 고코어 머신에서는 상한 적용 필요
    if n := runtime.NumCPU(); n > 256 {
        n = 256
    }
    cfg.WorkerPoolSize = n
    p, err := html.New(cfg)
    if err != nil {
        panic(err)
    }
    defer p.Close()

    pages := [][]byte{
        []byte("<html><body>페이지 A</body></html>"),
        []byte("<html><body>페이지 B</body></html>"),
    }
    br := p.ExtractBatch(pages)
    fmt.Printf("성공 %d, 실패 %d\n", br.Success, br.Failed)
    // 출력: 성공 2, 실패 0
}
```

### 배치 상한과 내결함성

| 제약 | 값 | 동작 |
|------|----|------|
| 단일 배치 최대 항목 수 | 10000 | 초과 시 **전체 배치 실패**(각 항목이 오류 반환), 부분 처리 안 함 |
| 단일 항목 panic 격리 | — | 어떤 항목의 추출 panic 은 `recover`되어 해당 항목만 실패로 표시, 다른 항목에 영향 없음 |

:::tip 인스턴스 배치 메서드는 캐시 재사용
`Processor` 인스턴스의 배치 메서드(`p.ExtractBatch`)는 내부적으로 `p.Extract`를 호출하므로, 주 캐시를 **공유하고 기록**합니다 — 배치 처리 중 중복 콘텐츠가 나타나면 후속 적중이 발생합니다. 패키지 레벨 `html.ExtractBatch`는 캐시가 비활성화된 풀링 인스턴스를 사용하므로 이 효과가 없습니다. 배치 중복 제거 가속이 필요할 때는 인스턴스 메서드를 우선 사용하세요.
:::

## 입력 제어

추출의 작업량을 줄이는 것이 가장 직접적인 최적화 수단입니다:

- **`MaxInputSize` 제한**: 과도하게 큰 문서를 거부하여 불필요한 파싱 오버헤드 방지. 기본 50 MB, 대부분의 시나리오에서 5–10 MB로 줄일 수 있음.
- **불필요한 추출 스위치 끄기**: `PreserveImages`/`PreserveVideos`/`PreserveAudios` 등을 끄면, 미디어 지연 메커니즘과 결합하여 해당 오버헤드를 건너뜀.
- **순수 텍스트는 `TextOnlyConfig()` 사용**: 모든 미디어 보존이 비활성화되어 있으며, `ExtractArticle`까지 끄면 순수 텍스트 추출 속도를 추가로 향상시킬 수 있음.

```go
package main

import (
    "fmt"

    "github.com/cybergodev/html"
)

func main() {
    // TextOnlyConfig 는 모든 미디어 보존을 비활성화하므로 추가 설정 불필요
    cfg := html.TextOnlyConfig()
    cfg.MaxInputSize = 10 * 1024 * 1024 // 10MB, 초대형 입력 거부
    cfg.ExtractArticle = false           // 문서 인식 끄기, 순수 텍스트 추출 더 빠르게

    p, err := html.New(cfg)
    if err != nil {
        panic(err)
    }
    defer p.Close()

    result, err := p.Extract([]byte("<html><body><p>순수 텍스트만 필요</p></body></html>"))
    if err != nil {
        panic(err)
    }
    fmt.Println(result.Text)
    // 출력: 순수 텍스트만 필요
}
```

## 성능 안티패턴

다음은 흔하지만 성능을 저하시키는 사용 방법입니다. 비교 표로 빠르게 피할 수 있습니다:

| 안티패턴 | 문제 | 올바른 방법 |
|--------|------|----------|
| 루프 안에서 매번 `html.New()` | 매번 Processor 생성+파괴, 인코딩 감지기, 평가기 등 재구성 | 루프 밖에서 인스턴스 하나 생성, 루프 안에서 재사용 |
| 패키지 함수로 캐시 적중 기대 | 풀링된 Processor 는 캐시 비활성화, 항상 미스 | `Processor` 인스턴스 사용 |
| 대량의 서로 다른 콘텐츠인데 대형 캐시 사용 | 캐시 팽창, 적중률 극히 낮음, 메모리와 해시 오버헤드만 증가 | `MaxCacheEntries = 0`으로 캐시 비활성화 |
| `ExtractToMarkdown`으로 주 캐시 적중 기대 | 포맷 변환은 캐시 비활성화된 임시 Processor 사용 | `InlineImageFormat="markdown"` 설정 후 `Extract` 사용 |
| 초대형 HTML 에 타임아웃 미설정 | 악의적/비정상 입력이 장시간 자원 점유 가능 | `ProcessingTimeout` 설정 또는 `ExtractWithContext` 사용 |
| 배치 항목 수가 `WorkerPoolSize`를 크게 초과하는데 선형 가속 기대 | semaphore 가 실제 동시성을 제한, 항목이 더 많아도 가속 안 됨 | CPU 코어 수에 맞춰 `WorkerPoolSize` 조정, 배치 분할 제출 |

## 벤치마크 권장 사항

Go benchmark 로 설정 변경과 캐시 적중의 효과를 정량화하는 것이 성능 튜닝의 가장 신뢰할 수 있는 근거입니다.

### 기본 추출 벤치마크

<!-- check-code: skip -->
```go
package html_test

import (
    "os"
    "testing"

    "github.com/cybergodev/html"
)

// 대표성 있는 실제 HTML 준비(극도로 작은 합성 프래그먼트 사용 금지)
var benchDoc, _ = os.ReadFile("testdata/sample.html")

// BenchmarkExtract 는 단일 추출의 기준 성능 측정(인코딩 감지, 파싱, 평가, 추출 포함)
func BenchmarkExtract(b *testing.B) {
    p, _ := html.New(html.DefaultConfig())
    defer p.Close()

    b.ReportAllocs() // 핵심: 매 추출의 힙 할당 수 관찰
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        _, err := p.Extract(benchDoc)
        if err != nil {
            b.Fatal(err)
        }
    }
}
```

### 캐시 적인 이점 측정

'동일한 콘텐츠 반복 추출'과 '매번 다른 콘텐츠'를 비교하면, 캐시가 실제로 도움이 되는지 알 수 있습니다:

<!-- check-code: skip -->
```go
// BenchmarkExtractCacheHit 는 동일한 콘텐츠를 반복 추출, 두 번째부터 캐시 적중해야 함
func BenchmarkExtractCacheHit(b *testing.B) {
    p, _ := html.New(html.DefaultConfig())
    defer p.Close()
    p.Extract(benchDoc) // 캐시 워밍업

    b.ReportAllocs()
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        _, _ = p.Extract(benchDoc)
    }
}

// BenchmarkExtractNoCache 는 캐시 비활성화 대조군
func BenchmarkExtractNoCache(b *testing.B) {
    cfg := html.DefaultConfig()
    cfg.MaxCacheEntries = 0
    p, _ := html.New(cfg)
    defer p.Close()

    b.ReportAllocs()
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        _, _ = p.Extract(benchDoc)
    }
}
```

### 다양한 설정 비교

`b.Run` 서브테스트로 하나의 벤치마크에서 여러 설정을 비교하여, 횡적 비교를 용이하게 합니다:

<!-- check-code: skip -->
```go
func BenchmarkConfigs(b *testing.B) {
    cases := []struct {
        name string
        cfg  func() html.Config
    }{
        {"Default", html.DefaultConfig},
        {"TextOnly", html.TextOnlyConfig},
        {"NoCache", func() html.Config {
            c := html.DefaultConfig()
            c.MaxCacheEntries = 0
            return c
        }},
    }
    for _, tc := range cases {
        b.Run(tc.name, func(b *testing.B) {
            p, _ := html.New(tc.cfg())
            defer p.Close()
            b.ReportAllocs()
            b.ResetTimer()
            for i := 0; i < b.N; i++ {
                _, _ = p.Extract(benchDoc)
            }
        })
    }
}
```

:::tip 벤치마크 결과 해석
- `ns/op`: 단일 추출 소요 시간, 작을수록 빠름;
- `B/op`와 `allocs/op`: 매 추출의 힙 할당 바이트와 횟수, '풀링이 작동하는지' '캐시가 적중하는지'를 판단하는 핵심 지표 — 캐시 적중 시 `allocs/op`가 유의미하게 감소;
- `CacheHit`와 `NoCache` 비교: 두 값이 가까우면, 콘텐츠에 **중복이 없음**을 의미하며, 캐시는 순수한 부담이므로 비활성화해야 함.
:::

벤치마크 실행:

```bash
go test -bench=. -benchmem ./...          # 모든 벤치마크 실행, 메모리 할당 보고
go test -bench=BenchmarkExtract -count=5  # 변동 관찰을 위해 여러 번 실행
```

## 다음 단계

- [Processor 재사용과 캐시](./processor-cache) — `sync.Pool` 메커니즘과 캐시 적중률 모니터링 심층
- [배치 처리 실전](./batch-processing) — 배치 API 의 전체 사용법과 동시성 제어
- [설정 참조](../../api-reference/core/config) — 모든 `Config` 필드와 값 제약
- [보안 프로덕션 체크리스트](../security/production-checklist) — 성능 외의 프로덕션 준비 사항
