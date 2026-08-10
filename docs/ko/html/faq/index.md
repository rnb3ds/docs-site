---
sidebar_label: "자주 묻는 질문"
title: "자주 묻는 질문 - CyberGo html | 주요 질문 답변"
description: "CyberGo html 자주 묻는 질문: 패키지 함수와 Processor 선택 기준, 자동 인코딩 감지 원리, 입력 크기 제한, 배치 상한, 빈 텍스트 진단 방법, 통계 모니터링과 감사 로그 설정 등 실전 문제 해결을 다룹니다."
sidebar_position: 1
---

# 자주 묻는 질문

## 패키지 함수와 Processor 의 차이는 무엇인가요?

**패키지 함수**(예: `html.Extract`) 는 내부적으로 `sync.Pool`을 사용하여 Processor 를 재사용하며, 저빈도, 일회성 호출에 적합합니다. 호출 완료 후 Processor 는 풀로 반환됩니다.

**Processor**(예: `p := html.New()`) 는 고빈도 호출에 적합하며, 캐시와 내부 리소스를 재사용합니다. 통계 수집과 감사 로그도 지원합니다.

```go
// 저빈도: 패키지 함수
result, _ := html.Extract(data)

// 고빈도: Processor
p, _ := html.New(html.DefaultConfig())
defer p.Close()
for _, page := range pages {
    p.Extract(page)
}
```

## 인코딩 문제를 어떻게 처리하나요?

HTML 라이브러리는 15+ 인코딩 (UTF-8, GBK, Shift_JIS, Windows-1252 등) 을 자동으로 감지하므로 일반적으로 수동 지정이 필요 없습니다.

인코딩을 강제로 지정해야 하는 경우:

```go
cfg := html.DefaultConfig()
cfg.Encoding = "gbk"
```

## 입력 크기 제한은 얼마인가요?

기본 최대 50MB(`DefaultMaxInputSize = 52428800`). 설정으로 조정 가능:

```go
cfg.MaxInputSize = 10 * 1024 * 1024 // 10MB
```

## Markdown 형식의 출력을 얻으려면 어떻게 하나요?

```go
md, err := html.ExtractToMarkdown(data)
```

또는 Processor 사용:

```go
p, _ := html.New()
md, _ := p.ExtractToMarkdown(data)
```

## 배치 처리는 최대 몇 개까지 지원하나요?

단일 배치당 최대 10000 개 항목. 더 큰 데이터셋은 나누어 처리하세요.

## 추출된 텍스트가 비어 있는 이유는 무엇인가요?

가능한 원인:

1. **HTML 구조 문제** — 콘텐츠가 `<script>` 또는 `<style>` 태그 안에 있음
2. **정제 후 콘텐츠가 비어 있음** — 본문이 정제로 제거되는 태그 (예: `<iframe>`, `<object>`) 에만 존재하면 결과가 비어 있을 수 있습니다. 신뢰할 수 있는 입력이라면 일시적으로 `EnableSanitization = false`로 설정해 조사해 보세요
3. **입력이 비어 있음** — 입력 바이트 배열이 비어 있는지 확인하세요 (빈 콘텐츠는 빈 `Result`를 반환합니다)
4. **기사 감지** — `ExtractArticle`을 꺼서 콘텐츠 추출이 가능한지 확인해 보세요

:::tip 오류와 빈 결과 구분하기
DOM 중첩이 `MaxDepth`를 초과하면 빈 텍스트가 아니라 `ErrMaxDepthExceeded` 오류를 반환합니다. 호출이 `error`를 반환하면, 텍스트가 비어 있는지 확인하기보다 `errors.Is`로 오류 타입을 먼저 판별하세요.
:::

```go
cfg := html.DefaultConfig()
cfg.ExtractArticle = false // 문서 인식 비활성화
```

## 처리 통계를 모니터링하려면 어떻게 하나요?

```go
p, _ := html.New(html.DefaultConfig())
defer p.Close()

// 일부 콘텐츠 처리 후
stats := p.GetStatistics()
fmt.Printf("처리됨: %d\n", stats.TotalProcessed)
fmt.Printf("캐시 적중: %d\n", stats.CacheHits)
fmt.Printf("평균 소요 시간: %v\n", stats.AverageProcessTime)
fmt.Printf("오류 수: %d\n", stats.ErrorCount)
```

## 감사를 활성화하려면 어떻게 하나요?

```go
cfg := html.DefaultConfig()
cfg.Audit = html.DefaultAuditConfig()
cfg.Audit.Enabled = true
cfg.Audit.Sink = html.NewLoggerAuditSink()
```

자세한 내용은 [감사 시스템](../api-reference/modules/audit)을 참조하세요.

## 파일 경로가 안전한가요?

`FileError`는 전체 경로를 자동으로 잘라서 오류 메시지에서 서버 경로가 노출되지 않도록 합니다:

```go
var fileErr *html.FileError
if errors.As(err, &fileErr) {
    fmt.Println(fileErr.SafePath()) // 파일명만, 전체 경로가 아님
}
```

## 커스텀 콘텐츠 스코어링을 구현하려면 어떻게 하나요?

`Scorer` 인터페이스를 구현:

```go
type MyScorer struct{}

func (s *MyScorer) Score(node html.ContentNode) int {
    // 커스텀 스코어링 로직
    return 0
}

func (s *MyScorer) ShouldRemove(node html.ContentNode) bool {
    // 커스텀 제거 로직
    return false
}

cfg := html.DefaultConfig()
cfg.Scorer = &MyScorer{}
```

자세한 내용은 [인터페이스 정의](../api-reference/types/interfaces)를 참조하세요.

## 커스텀 Scorer 는 동시성 안전해야 하나요?

필요합니다. 단일 Processor 가 여러 동시 `Extract` 호출에서 공유될 때, `Score`/`ShouldRemove` 가 여러 goroutine 에서 동시에 트리거됩니다. 커스텀 Scorer 가 가변 상태(캐시, 카운터)를 가지고 있다면 자체적으로 잠금 동기화해야 합니다. 라이브러리 내장 `DefaultScorer` 는 읽기 전용이며 자연스럽게 동시성 안전합니다.

:::warning 무상태 우선
커스텀 Scorer 를 무상태(전달된 `ContentNode`만으로 계산)로 설계하는 것을 권장합니다. 잠금 오버헤드를 피할 뿐만 아니라 근본적으로 동시성 문제를 제거합니다. 집계 통계가 필요할 때는 결과를 Scorer 자신이 아닌 `Processor`의 통계 채널에 기록하세요.
:::

## 캐시 Key 는 어떻게 생성되나요?

캐시 Key 는 인코딩 변환 후의 UTF-8 콘텐츠를 기반으로, xxHash 스타일 알고리즘으로 128 비트(16 바이트) 해시를 생성합니다:

- 64KB 이하(`maxCacheKeySize`): 전체 콘텐츠에 대해 계산
- 64KB 초과: 5점 샘플링 사용(헤드, 테일, 3개 균등 분포 지점), 총 샘플링 예산 4096 바이트(`cacheKeySample`, 각 지점 약 818 바이트), 추가로 콘텐츠 총 길이를 혼합하여 유일성 강화
- 동일한 UTF-8 콘텐츠(원래 인코딩이 GBK, Shift_JIS, Windows-1252 중 무엇이든)는 동일한 Key 생성

:::tip 인코딩 정규화의 이점
Key 가 인코딩 감지와 UTF-8 변환**후**에 계산되므로, 같은 문서가 다른 바이트 인코딩으로 저장되어도 동일한 캐시 항목에 적중합니다. 캐시 적중률은 입력 인코딩의 영향을 받지 않습니다.
:::

## ExtractAllLinks 와 Extract 의 결과가 다른 이유는?

두 함수는 용도가 다르며, 처리 경로와 반환 타입도 다릅니다:

- `Extract` 는 먼저 HTML 정제(`<script>`, `<iframe>` 등 태그 제거)를 적용한 뒤, 정제된 DOM 에서 링크를 추출합니다. 결과는 `Result.Links`에 들어가며, 타입은 `LinkInfo`(`Position`, `IsExternal` 등 필드 포함)입니다
- `ExtractAllLinks`는 **정제를 적용하지 않고**, 모든 리소스 링크(`<script src>`, `<iframe>`, `<link>`, `<embed>` 포함)를 열거합니다. `[]LinkResource`를 반환합니다(`Type` 분류 포함, 예: 스크립트, 스타일, 미디어)

요약하면: `Extract` 는 「본문 속의 링크」, `ExtractAllLinks` 는 「페이지가 참조하는 모든 리소스」를 제공합니다.

## 패키지 함수에 Config 를 전달해도 풀링되나요?

아닙니다. `resolveConfig` 의 동작은 다음과 같습니다:

- Config 없음 → `DefaultConfig()` 사용, **`sync.Pool` 풀링 사용**
- Config 1개 → 해당 Config 사용, **임시 Processor 생성(풀 재사용 안 함)**

따라서 `html.Extract(data, cfg)` 는 매번 새 Processor 를 생성하고 파괴합니다. 커스텀 설정으로 고빈도 호출 시에는 직접 `html.New(cfg)`로 Processor 를 생성하고 재사용하여 캐시와 통계의 이점을 얻어야 합니다.

## 내부 panic 은 어떤 영향을 미치나요?

모든 추출 작업은 `recoverPanic`으로 래핑되어, panic 이 호출자에게 전파되지 않고 `ErrInternalPanic` 오류로 복구됩니다. 격리 범위는 다음과 같습니다:

- 단일 추출: panic → `ErrInternalPanic`
- 배치 처리: 개별 항목의 panic 이 독립적으로 recover 되어 해당 항목에만 영향(`Failed`에 기록), 다른 항목에는 영향 없음
- 감사 하위 시스템: `AuditSink`의 `Write`/`Close` panic 이 격리됨(감사는 best-effort, SEC-003 참조), 주 추출 흐름을 중단하지 않음
- 타임아웃 goroutine: 내부 panic 도 독립적으로 recover 됨

:::warning ErrInternalPanic 가 보이면 어떻게 하나요
`ErrInternalPanic` 은 입력이 라이브러리 내부 버그를 유발했을 수 있음을 나타냅니다. 단순히 재시도하지 말고, 원본 입력(또는 최소 재현 샘플)을 기록하고 보고하세요. 동일한 입력이 다시 trigger 할 가능성이 높습니다.
:::

## 메모리를 절약하기 위해 캐시를 비활성화하려면?

<!-- check-code: skip -->
```go
cfg := html.DefaultConfig()
cfg.MaxCacheEntries = 0 // 캐시 비활성화, Key 생성 스킵(제로 오버헤드)
```

비활성화하면 매 추출마다 전체 처리를 수행하지만, 캐시 항목으로 인한 메모리 오버헤드를 피합니다. 서로 다른 대량의 콘텐츠를 처리하는 시나리오(예: 수많은 다른 페이지를 일회성으로 크롤링)에 적합합니다.

:::tip 풀링된 Processor 는 기본적으로 캐시가 비활성화됨
패키지 함수(예: `html.Extract`)가 사용하는 풀링된 Processor 는 `MaxCacheEntries = 0`, `CacheTTL = 0`으로 설정되어 있습니다. 풀에 반환될 때마다 캐시가 비워지므로, 캐시를 켜면 해시와 map 작업 오버헤드만 늘어날 뿐입니다. 캐시가 필요하면 명시적으로 `html.New(cfg)`를 사용하세요.
:::

## ProcessingTimeout 과 사용자 context 타임아웃의 차이는?

라이브러리 내 타임아웃은 호출자의 context 와 협력하며, 오류 타입은 trigger 소스와 설정에 따라 결정됩니다:

| 시나리오 | 오류 타입 | trigger 주체 |
|----------|----------|----------|
| `ProcessingTimeout`을 설정했고 먼저 만료됨 | `ErrProcessingTimeout` | 라이브러리 내 타임아웃 |
| 사용자 context 가 `ProcessingTimeout`보다 먼저 만료됨 | `ErrProcessingTimeout`(정규화됨) | 호출자 타임아웃 |
| `ProcessingTimeout` 미설정, 사용자 context 만료됨 | `context.DeadlineExceeded` | 호출자 타임아웃 |
| 사용자 `cancel()` | `context.Canceled` | 수동 취소 |

메커니즘: `ProcessingTimeout > 0`일 때, 라이브러리는 `context.WithTimeout(parentCtx, ProcessingTimeout)`으로 새 deadline 을 파생하며, **둘 중 빠른 쪽**을 채택합니다. 어느 쪽이 만료되든 통일하여 `ErrProcessingTimeout`을 보고합니다. 수동 `cancel()`으로 인한 `context.Canceled`만 원형 그대로 반환됩니다. `ProcessingTimeout`을 설정하지 않으면 사용자 context 의 오류가 직접 전달됩니다.

## ExtractToMarkdown 은 캐시를 사용하나요?

사용하지 않습니다. `ExtractToMarkdown`은 내부적으로 `buildFormatProcessor`로 임시 Processor 를 생성하며, 이 Processor 는 명시적으로 캐시를 비활성화합니다(`MaxCacheEntries = 0` + `NewCache(0, 0)`). 주 Processor 의 캐시를 읽지도 쓰지도 않습니다.

:::tip 왜 이렇게 설계되었나요
Markdown 형식 변환은 출력 형태가 다를 뿐, 추출 자체의 결과가 주 캐시를 오염시켜서는 안 됩니다(그렇지 않으면 같은 콘텐츠가 형식에 따라 여러 번 캐시됨). 임시 Processor 는 주 Processor 의 `Scorer`를 재사용하며, `InlineImageFormat`/`InlineLinkFormat`만 덮어씁니다. 설정은 값 복사로 격리되어 공유 상태의 동시 수정을 방지합니다.
:::

## `<form>` 태그가 정제에서 제거되지 않는 이유는?

ASP.NET WebForms, JSF, JSP 등 많은 서버사이드 프레임워크가 전체 페이지 `<body>`를 단일 `<form>`으로 감쌉니다. `<form>`을 제거하면 가시적인 콘텐츠가 거의 모두 손실됩니다. 텍스트 추출은 폼을 렌더링하거나 제출하지 않으므로, `<form>` 제거의 CSRF/UI-redress 근거는 **컨테이너 자체에 적용되지 않습니다**. 단, `<input>`과 `<button>` 등 폼 컨트롤은 여전히 제거됩니다.

## data URL 에 어떤 제한이 있나요?

정제기는 `data:` URL 에 대해 다중 검증을 수행합니다:

- 화이트리스트 MIME 타입만 허용: 이미지(gif/jpeg/png/webp/bmp/avif 등), 폰트(woff/woff2/ttf/otf), PDF
- **`image/svg+xml` 차단**(SVG 는 JavaScript 를 내장할 수 있음)
- 빈 미디어 타입 차단(예: `data:;base64,...`)
- 크기 상한 `MaxDataURILength`(100KB)
- base64 인코딩 부분의 문자 유효성 검증

차단된 URL 은 `AuditRecorder`를 통해 사유(예: `malformed data URL`, `unsafe media type`)가 기록됩니다.

## 배치 처리가 10000 건을 초과하면 어떻게 되나요?

전체 배치가 실패합니다(부분 처리 없음). `maxBatchSize` 상한은 10000 이며, 초과 시 각 항목의 `Errors`에 `html: batch size N exceeds maximum 10000`이 채워지고, `Failed` 카운트는 입력 수량과 같아지며, `Results`는 모두 `nil`입니다.

<!-- check-code: skip -->
```go
// 초과 반환된 BatchResult: Failed == len(inputs), 부분 성공 없음
br := html.ExtractBatch(hugeSlice) // len(hugeSlice) > 10000
fmt.Println(br.Failed)             // == len(hugeSlice)
```

호출자가 직접 나누어 처리(예: 배치당 5000건)해야 합니다.

## Processor 를 닫은 후 계속 호출하면 어떻게 되나요?

`ErrProcessorClosed`를 반환합니다. Processor 는 내부적으로 `atomic.Bool`로 닫힘 상태를 표시하며, 모든 추출/포맷 메서드 진입점에서 이를 검사합니다. 주요 동작:

- `Close()`는 멱등이며, 여러 번 호출해도 안전합니다
- 풀링된 Processor 는 닫힌 후 **풀에 반환되지 않습니다**(다음 `Get`에서 닫혔고 캐시 정리 코루틴이 정지한 인스턴스를 가져오는 것을 방지). 직접 폐기되며, 다음 `Get`에서 `sync.Pool`이 재구성합니다
- 닫힌 Processor 에서 배치 메서드를 호출하면, 반환된 `BatchResult`의 각 항목 오류는 모두 `ErrProcessorClosed`입니다

## 문서 스마트 인식(ExtractArticle)의 평가 알고리즘은 어떻게 되나요?

기본 스코어러(`DefaultScorer`)는 다차원 신호를 기반으로 각 요소 노드의 콘텐츠 관련성 점수를 계산하며, 가장 높은 점수의 노드를 문서 컨테이너로 선택합니다. 평가 차원은 다음과 같습니다:

| 차원 | 긍정 신호 | 부정 신호 |
|------|----------|----------|
| 태그 의미 | `<article>`(+1000), `<main>`(+900), `<section>`(+300) | `nav`/`aside`/`footer`/`header`는 즉시 0 반환 |
| class/id 패턴 | `content`/`article`/`post`/`main`/`entry`(강한 긍정); `blog`/`news`/`detail`(중간 긍정) | `comment`/`sidebar`/`nav`/`ad`/`menu`(강한 부정); `widget`/`share`/`social`(중간 부정) |
| 단락 밀도 | 하위 트리의 `<p>` 수 × 배율 가점 | — |
| 텍스트 길이 | 임계값 초과의 긴 텍스트 가점; 미만의 짧은 텍스트 감점 | — |
| 링크 밀도 | — | 텍스트가 짧고 링크가 조밀할 때 페널티 부과 (내비게이션 바일 수 있음) |
| 구두점 특징 | 쉼표 조밀 (`,` 또는 `，`) 은 산문체를 암시, 가점 | — |
| 콘텐츠 밀도 | 텍스트/태그 비율이 높을 때 증폭 계수 적용 | 비율이 낮을 때 감쇠 계수 적용 |
| ARIA role | `role="main"`/`role="article"`(+500) | `role="navigation"`/`role="complementary"`(-400) |

:::tip 레이아웃 래퍼의 특수 처리
class/id 에 콘텐츠 신호(`content`/`article`)와 제거 신호(예: `sidebar`)가 동시에 포함된 경우 — 전형적으로 CSS 레이아웃 클래스 `content-sidebar` — 스코어러는 해당 노드를 **제거하지 않습니다**. 주 콘텐츠를 감싸고 있기 때문입니다. 의미 태그 `<article>`/`<main>`은 class/id 제거 휴리스틱에서 일률적으로 면제됩니다.
:::

기본 스코어러가 대상 웹사이트에 적합하지 않다면, 커스텀 `Scorer` 인터페이스를 구현하여 교체할 수 있습니다. 자세한 내용은 [테스트와 사용자 정의 확장](../guides/integration/testing-custom)을 참조하세요.

## TableFormat 은 테이블 출력에 어떤 영향을 주나요?

`TableFormat`은 추출된 순수 텍스트/Markdown 에서 HTML `<table>`의 렌더링 방식을 제어합니다:

| 형식값 | 효과 | 적용 시나리오 |
|--------|------|----------|
| `"markdown"`(기본값) | Markdown 테이블로 렌더링 (헤더 구분행 포함), `colspan`은 반복 셀로 전개, 너비 정의만 있는 구조행은 건너뜀 | 사람이 읽기, Markdown 소비 |
| `"html"` | 원본 HTML `<table>` 태그 유지 (`colspan`/`rowspan` 그대로 보존), 구조행 건너뛰지 않음 | 정확한 테이블 구조가 필요한 다운스트림 처리 |

```go
cfg := html.DefaultConfig()
cfg.TableFormat = "html" // HTML 테이블 유지
```

형식 문자열은 대소문자를 구분하지 않으며 (`"Markdown"`과 `"markdown"`이 동일), 빈 값은 `"markdown"`으로 폴백됩니다.

## AllowedBaseDir 는 플랫폼 간에 동일하게 동작하나요?

그렇습니다. 핵심 보안 의미는 크로스 플랫폼으로 일관되지만, 하위 경로 해석 메커니즘은 다릅니다:

| 플랫폼 | 해석 방식 | 커버하는 리다이렉트 |
|------|----------|-------------|
| Linux | `/proc/self/fd/<fd>`의 link 읽기 | 심볼릭 링크(race-free) |
| macOS / BSD | `/dev/fd/<fd>`의 link 읽기 | 심볼릭 링크(race-free) |
| 기타 Unix | `filepath.EvalSymlinks`로 폴백 | 심볼릭 링크(약간의 TOCTOU 잔존) |
| Windows | `GetFinalPathNameByHandleW` | 심볼릭 링크 + junction + 모든 reparse points |

핵심 설계: 라이브러리는 **이미 열린 OS 파일 핸들**에서 실제 경로를 해석하며 (경로 문자열이 아닌), TOCTOU 경쟁 창을 닫습니다 — 검증과 읽기가 동일한 파일 핸들을 사용하므로, 그 사이에 경로가 교체되어도 결과에 영향을 주지 않습니다. Windows 의 junction/reparse points 는 특권 없이 생성할 수 있으며, `filepath.EvalSymlinks`는 이를 해석할 수 없으므로 라이브러리는 전용 `GetFinalPathNameByHandleW`를 사용합니다.

## 캐시 적중 시 원본 객체가 반환되나요?

아닙니다. 캐시 적중 시 `cloneResult`가 생성한 **딥카피**를 반환합니다 — `Images`/`Links`/`Videos`/`Audios` 슬라이스 모두 `copy`를 수행합니다. 이는 필수적입니다: 캐시의 항목은 여러 goroutine 에서 동시에 읽히므로, 포인터를 직접 반환하면 호출자가 결과를 수정할 때 aliasing 을 통해 캐시가 오염됩니다.

미적중 경로도 마찬가지로 먼저 캐시에 기록한 후 클론을 반환하므로, 캐시 항목과 반환값은 서로 aliasing 하지 않습니다.

## 같은 비디오 URL 이 Videos 와 Audios 에 동시에 나타나는 이유는?

`.ogg`는 컨테이너 형식으로, 비디오(Theora 인코딩) 또는 오디오(Vorbis/Opus 인코딩)를 담을 수 있습니다. 정규식 폴백 스캔 시, `.ogg` URL 이 비디오와 오디오 확장자 목록에 동시에 매치되어 `Result.Videos`와 `Result.Audios`에 각각 나타납니다. 오디오 전용 변형인 `.oga`는 오디오 목록에만 나타납니다.

## ProcessingTimeout 을 0 으로 설정하는 것과 설정하지 않는 것의 차이는?

차이가 없습니다. `Config` 제로값은 직접 사용할 수 없으며(`DefaultConfig()`에서 시작해야 함), `DefaultConfig()`는 `ProcessingTimeout`을 30 초로 설정합니다. 수동으로 `0`으로 설정하는 것은 「무제한」과 동일합니다 — `Extract`는 타임아웃 goroutine 을 시작하지 않으며, `maxTimeoutGoroutines`의 할당량도 점유하지 않습니다. 이는 이미 합법적인 것으로 알려진 초대형 문서를 처리할 때 불필요한 goroutine 오버헤드를 피할 수 있습니다.

## `Extract` 와 `ExtractAllLinks` 를 혼용할 수 있나요?

가능합니다. 독립적으로 동작합니다:

- `Extract`는 `*Result`를 반환하며, 여기서 `Result.Links`는 **정제 후** DOM 의 `<a>` 링크입니다 (`LinkInfo` 타입, `Position`/`IsExternal` 등 필드 포함)
- `ExtractAllLinks`는 `[]LinkResource`를 반환하며, **정제되지 않은** HTML 의 모든 리소스 링크를 열거합니다 (`<script src>`, `<iframe>`, `<link>` 등 포함), `Type` 분류 포함

두 함수를 순차적으로 호출해도 서로 영향을 주지 않습니다. 전형적인 시나리오: 먼저 `Extract`로 본문 콘텐츠를 추출한 뒤, `ExtractAllLinks`로 페이지가 참조하는 모든 리소스를 수집합니다.
