---
sidebar_label: "Processor"
title: "Processor - CyberGo html | 용법·매개변수·예제"
description: "CyberGo html Processor API: New 생성, Extract·ExtractText·ExtractToMarkdown 메서드 계열과 GetStatistics, ClearCache, Close 등 수명 주기 관리로 캐시·통계 재사용과 고빈도 처리에 적합합니다."
sidebar_position: 2
---

# Processor

`Processor`는 HTML 라이브러리의 핵심 처리 엔진입니다. 패키지 함수에 비해 Processor 는 내부 리소스(캐시, 인코딩 감지기)를 재사용하여 고빈도 호출 시나리오에 적합합니다.

## 생성

### New

Processor 인스턴스를 생성하며, 선택적으로 설정을 전달할 수 있습니다.

```go
func New(cfg ...Config) (*Processor, error)
```

**매개변수**: 최대 1 개의 `Config`, 미제공 시 `DefaultConfig()`를 사용합니다.

```go
p, err := html.New(html.DefaultConfig())
if err != nil {
    log.Fatal(err)
}
defer p.Close()
```

**내부 초기화**:

`New`는 단순한 대입이 아니라, 다음 단계를 수행하여 반환된 Processor 가 즉시 사용 가능하도록 보장합니다:

1. **설정 검증**: `Config.Validate()`를 호출하며, 유효하지 않은 설정은 `*ConfigError`를 반환합니다 (`errors.Is(err, ErrInvalidConfig)`가 참). 검증 범위에는 수치 경계(`MaxInputSize`, `MaxCacheEntries`, `WorkerPoolSize`, `MaxDepth`가 음수이거나 한도 초과일 수 없음)와 포맷 문자열(`InlineImageFormat`/`InlineLinkFormat`/`TableFormat` 값이 합법적)이 포함됩니다.
2. **Scorer 설정**: 커스텀 `Scorer`가 설정된 경우 `scorerAdapter`로 내부 인터페이스에 적용하고; 그렇지 않으면 `SharedDefaultScorer`(읽기 전용, 동시성 안전)를 사용합니다.
3. **포맷 문자열 사전 계산**: `InlineImageFormat`/`InlineLinkFormat`을 정규화하여(소문자+공백 제거, 빈 문자열은 `"none"`으로 매핑) `imageFormat`/`linkFormat` 필드에 캐시하여, 핫 경로에서 반복적인 `strings.ToLower`를 피합니다.
4. **캐시 정리 시작**: `CacheTTL>0` **이고** `CacheCleanup>0`일 때만 백그라운드 정리 goroutine 을 시작합니다; 둘 중 하나라도 0이면 시작하지 않습니다.

## 동시성 안전성

:::tip 동시성 사용
`Processor`는 여러 goroutine 간에 안전하게 공유할 수 있으며, 추가 락이 필요 없습니다. 동시성 보장은 다음에서 비롯됩니다:

- **불변 설정**: `config`는 `New()` 이후 불변입니다(`*Config` 포인터는 재할당되거나 수정되지 않음). 따라서 `ExtractToMarkdown` 등의 포맷 메서드는 락 없이도 안전하게 값 복사를 수행하여 임시 Processor 를 생성할 수 있습니다 — 포맷 덮어쓰기가 공유 설정에 다시 기록되지 않습니다.
- **통계 카운터**: `TotalProcessed`/`CacheHits`/`CacheMisses`/`ErrorCount`/`totalProcessTime`은 모두 `atomic` 연산을 사용합니다.
- **캐시**: 내부 `Cache`는 자체 락을 가지며 읽기/쓰기가 안전합니다.
- **Scorer**: 내장 `DefaultScorer`는 읽기 전용입니다. **커스텀 `Scorer`는 스스로 동시성 안전을 보장해야 합니다** (예: 내부적으로 락 유지), 단일 Processor 가 동시성 `Extract` 시 여러 goroutine 에서 해당 `Score`/`ShouldRemove`를 호출하기 때문입니다.
:::

## 콘텐츠 추출

### 오류 반환

`Extract` 메서드 계열은 처리의 각 단계에서 명확한 센티넬 오류를 반환하며, `errors.Is`로 정확하게 판별할 수 있습니다:

| 오류 | 트리거 조건 | 비고 |
|------|----------|------|
| `ErrProcessorClosed` | `p`가 `nil`이거나 이미 `Close`됨 | 모든 메서드 공용 |
| `ErrInputTooLarge` | 입력 바이트 수가 `MaxInputSize` 초과 | `*InputError`로 래핑, 실제/제한 크기 포함 |
| 인코딩 감지 오류 | 인코딩 감지 또는 UTF-8 변환 실패 | 원본 오류가 래핑됨 |
| `ErrInvalidHTML` | 바이트를 HTML 로 파싱할 수 없음 | 하위 파싱 오류도 함께 래핑 |
| `ErrMaxDepthExceeded` | 요소 중첩 깊이가 `MaxDepth` 초과 | 반복식 검증, 스택 오버플로 방지 |
| `ErrProcessingTimeout` | 처리 소요가 `ProcessingTimeout` 초과 | `ProcessingTimeout=0`은 무제한 의미 |
| `ErrInternalPanic` | 내부 예기치 않은 panic 이 복구됨 | 안전망 보호, 정상 사용에서는 나타나지 않아야 함 |

`context`가 포함된 버전은 추가로 `context.Canceled`(사용자 취소) 또는 `context.DeadlineExceeded`(컨텍스트 타임아웃, `ErrProcessingTimeout`으로 정규화됨)를 반환합니다.

### Extract

```go
func (p *Processor) Extract(htmlBytes []byte) (*Result, error)
```

HTML 바이트에서 콘텐츠를 추출하고 인코딩을 자동으로 감지합니다.

### ExtractFromFile

```go
func (p *Processor) ExtractFromFile(filePath string) (*Result, error)
```

파일에서 콘텐츠를 추출합니다.

### ExtractText

```go
func (p *Processor) ExtractText(htmlBytes []byte) (string, error)
```

순수 텍스트만 반환합니다.

### ExtractTextFromFile

```go
func (p *Processor) ExtractTextFromFile(filePath string) (string, error)
```

파일에서 순수 텍스트를 추출합니다.

## 컨텍스트 버전

모든 추출 메서드에는 `ExtractWithContext`가 포함된 버전이 있습니다:

```go
func (p *Processor) ExtractWithContext(ctx context.Context, htmlBytes []byte) (*Result, error)
func (p *Processor) ExtractFromFileWithContext(ctx context.Context, filePath string) (*Result, error)
func (p *Processor) ExtractTextWithContext(ctx context.Context, htmlBytes []byte) (string, error)
func (p *Processor) ExtractTextFromFileWithContext(ctx context.Context, filePath string) (string, error)
```

## 출력 형식

```go
func (p *Processor) ExtractToMarkdown(htmlBytes []byte) (string, error)
func (p *Processor) ExtractToMarkdownFromFile(filePath string) (string, error)
func (p *Processor) ExtractToJSON(htmlBytes []byte) ([]byte, error)
func (p *Processor) ExtractToJSONFromFile(filePath string) ([]byte, error)
```

컨텍스트 버전:

```go
func (p *Processor) ExtractToMarkdownWithContext(ctx context.Context, htmlBytes []byte) (string, error)
func (p *Processor) ExtractToMarkdownFromFileWithContext(ctx context.Context, filePath string) (string, error)
func (p *Processor) ExtractToJSONWithContext(ctx context.Context, htmlBytes []byte) ([]byte, error)
func (p *Processor) ExtractToJSONFromFileWithContext(ctx context.Context, filePath string) ([]byte, error)
```

:::warning 캐시 동작 차이
두 메서드는 캐시 처리에서 완전히 다릅니다:

- **`ExtractToMarkdown`** 은 임시 Processor 를 구성합니다 (불변의 `config`를 복사하지만, `MaxCacheEntries`는 0, 감사 비활성화), **주 캐시를 읽거나 쓰지 않으므로** 주 Processor 의 캐시를 오염시키거나 적중하지 않습니다. Markdown 포맷 결과도 캐시되지 않습니다.
- **`ExtractToJSON`** 은 `p.Extract`를 직접 호출하며, **정상 캐시 경로를 거칩니다** — 주 캐시에 적중/기록하며, 통계 카운터도 그에 따라 갱신됩니다.

Markdown 출력도 캐시의 혜택을 받으려면, `MarkdownConfig()`로 전용 Processor 를 생성하고 `Extract`를 호출하거나, 출력을 직접 캐시하세요.
:::

## 링크 추출

```go
func (p *Processor) ExtractAllLinks(htmlBytes []byte) ([]LinkResource, error)
func (p *Processor) ExtractAllLinksFromFile(filePath string) ([]LinkResource, error)
func (p *Processor) ExtractAllLinksWithContext(ctx context.Context, htmlBytes []byte) ([]LinkResource, error)
func (p *Processor) ExtractAllLinksFromFileWithContext(ctx context.Context, filePath string) ([]LinkResource, error)
```

## 배치 처리

```go
func (p *Processor) ExtractBatch(htmlContents [][]byte) *BatchResult
func (p *Processor) ExtractBatchWithContext(ctx context.Context, htmlContents [][]byte) *BatchResult
func (p *Processor) ExtractBatchFiles(filePaths []string) *BatchResult
func (p *Processor) ExtractBatchFilesWithContext(ctx context.Context, filePaths []string) *BatchResult
```

## 통계와 캐시

### 캐시 동작 상세

`MaxCacheEntries > 0`일 때, `Extract`는 캐시를 활성화합니다:

- **적중 경로**: 캐시 항목 감지 후, `CacheHits`와 `TotalProcessed`를 각각 1 씩 증가시키며, 반환되는 것은 `cloneResult`입니다 — `Images`/`Links`/`Videos`/`Audios` 등 슬라이스에 대해 `copy`를 수행한 딥카피입니다. 호출자가 반환값을 수정해도 **캐시의 항목에 영향을 주지 않으며**, 동시성 적중 읽기 시의 데이터 경쟁도 방지합니다.
- **미적중 경로**: 처리 완료 후 결과를 캐시에 기록하고, `cloneResult`를 반환합니다 (마찬가지로 딥카피). 따라서 캐시 항목과 반환값은 서로 별칭하지 않습니다.
- **캐시 비활성화**: `MaxCacheEntries = 0`일 때, `Extract`는 캐시 키 생성과 `Get/Set`을 건너뛰며 (단락), 캐시 오버헤드가 전혀 없습니다.

### GetStatistics

현재 처리 통계 정보를 반환합니다.

```go
func (p *Processor) GetStatistics() Statistics
```

`Statistics` 각 필드의 의미:

| 필드 | 설명 |
|------|------|
| `TotalProcessed` | 오류 없이 완료된 추출 횟수, **캐시 적중 포함** |
| `CacheHits` | 캐시에서 직접 적중한 횟수 |
| `CacheMisses` | 미적중하여 전체 처리가 필요했던 횟수 |
| `ErrorCount` | 오류를 반환한 추출 횟수 |
| `AverageProcessTime` | 추출당 평균 경과 시간(`TotalProcessed`가 0 이면 0) |

```go
stats := p.GetStatistics()
fmt.Printf("처리됨: %d, 캐시 적중: %d\n",
    stats.TotalProcessed, stats.CacheHits)
```

### ClearCache

캐시를 비우고 누적 통계는 유지합니다.

```go
func (p *Processor) ClearCache()
```

### ResetStatistics

모든 통계 카운터를 재설정합니다.

```go
func (p *Processor) ResetStatistics()
```

## 감사

### GetAuditLog

감사 로그 항목을 가져옵니다.

```go
func (p *Processor) GetAuditLog() []AuditEntry
```

### ClearAuditLog

감사 로그를 비웁니다.

```go
func (p *Processor) ClearAuditLog()
```

## 라이프사이클

### Close

Processor 가 보유한 리소스를 해제합니다. 사용 완료 후 반드시 호출해야 합니다.

```go
func (p *Processor) Close() error
```

```go
p, _ := html.New(cfg)
defer p.Close()
// ... p 를 사용하여 추출
```

:::tip 라이프사이클 모범 사례
- **싱글톤 재사용**: 장기 실행 서비스(HTTP handler, worker)에서 Processor 를 하나 생성하고 동시성 요청 간에 공유하며, 캐시와 함께 수익을 극대화합니다. Processor 자체는 동시성 안전하므로 요청마다 새로 만들 필요가 없습니다.
- **`defer Close()`**: 생성 직후 `defer p.Close()`를 호출하여, 예외 경로에서도 백그라운드 정리 goroutine 과 감사 리소스가 해제되도록 합니다. `Close`는 캐시 정리 goroutine 을 중지하고, 캐시를 비우며, 감사 sink 를 닫습니다.
- **Close 후 사용 금지**: `Close` 이후 어떤 메서드를 호출해도 `ErrProcessorClosed`를 반환합니다. `Close`는 `CompareAndSwap`으로 멱등성을 보장하며, 중복 호출은 안전하지만 의미는 없습니다.
:::
