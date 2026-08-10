---
sidebar_label: "배치 처리"
title: "배치 처리 - CyberGo html | 동시성 배치 추출 API"
description: "CyberGo html 동시성 배치 API: ExtractBatch, ExtractBatchFiles 계열과 WithContext 컨텍스트 버전으로 동시 처리를 지원하며 배치당 최대 10000건, BatchResult 로 부분 실패를 보고합니다."
sidebar_position: 3
---

# 배치 처리

배치 추출은 여러 HTML 문서를 동시에 처리하는 것을 지원하며, 각 배치당 최대 10000 개 항목까지 가능합니다.

## 패키지 함수

```go
func ExtractBatch(htmlContents [][]byte, cfg ...Config) *BatchResult
func ExtractBatchWithContext(ctx context.Context, htmlContents [][]byte, cfg ...Config) *BatchResult
func ExtractBatchFiles(filePaths []string, cfg ...Config) *BatchResult
func ExtractBatchFilesWithContext(ctx context.Context, filePaths []string, cfg ...Config) *BatchResult
```

## Processor 메서드

```go
func (p *Processor) ExtractBatch(htmlContents [][]byte) *BatchResult
func (p *Processor) ExtractBatchWithContext(ctx context.Context, htmlContents [][]byte) *BatchResult
func (p *Processor) ExtractBatchFiles(filePaths []string) *BatchResult
func (p *Processor) ExtractBatchFilesWithContext(ctx context.Context, filePaths []string) *BatchResult
```

## BatchResult

```go
type BatchResult struct {
    Results   []*Result  // 각 입력 항목의 결과, 입력 순서대로 인덱싱됨; 실패 또는 취소 시 nil
    Errors    []error    // 각 입력 항목의 오류, 인덱스가 Results 와 일대일 대응
    Success   int        // 성공 수량
    Failed    int        // 실패 수량
    Cancelled int        // 컨텍스트 취소로 인해 처리되지 않은 항목 수
}
```

## 동시성 메커니즘

배치 추출은 **세마포어 패턴**(버퍼가 있는 채널 `chan struct{}`)으로 동시성을 제어하며, 모든 goroutine 을 한 번에 시작하지 않습니다:

- **동시성**은 `Config.WorkerPoolSize`로 제어되며, 기본값은 `4`(`DefaultWorkerPoolSize`), 범위는 `1–256`입니다
- 세마포어 용량은 `WorkerPoolSize`와 같습니다: 각 goroutine 은 시작 전 슬롯을 하나 획득해야 하고(`sem <- struct{}{}`), 종료 시 해제합니다(`<-sem`). 이로 인해 **동시에 실행 중인 goroutine 수**를 `WorkerPoolSize`로 엄격하게 제한합니다
- 입력이 수만 건이더라도 동시에 실행되는 추출 작업은 `WorkerPoolSize`개뿐이며, goroutine 폭발을 방지합니다
- **각 추출 항목은 독립적으로 실행**됩니다: 자동 인코딩 감지, 각각의 오류 격리로 단일 항목 실패가 다른 항목에 영향을 주지 않습니다
- **Processor 는 동시성 공유에 안전**합니다: 여러 goroutine 이 동시에 `Extract`를 호출하는 것은 스레드 안전하며, 배치 메서드는 동일한 Processor 인스턴스를 재사용합니다

:::tip WorkerPoolSize 튜닝
배치 처리는 입력이 파일일 때 대부분 I/O 집약적이므로, `WorkerPoolSize`를 적절히 늘리면(예: `8–16`) 처리량이 향상됩니다. 반면 순수 CPU 파싱 집약적 시나리오에서는 `runtime.NumCPU()`를 초과하지 않는 것이 좋습니다. `256`을 초과하면 설정 검증 단계에서 거부됩니다.
:::

## BatchResult 필드 설명

`Results`와 `Errors` 두 슬라이스의 **길이는 모두 입력 항목 수와 같으며**, **인덱스가 일대일로 대응**합니다:

| 필드 | 설명 |
|------|------|
| `Results[i]` | `i`번째 입력의 추출 결과; 해당 항목이 실패하거나 취소된 경우 `nil` |
| `Errors[i]` | `i`번째 입력의 오류; 성공 시 `nil`, 실패 시 추출 오류, 취소 시 `ctx.Err()` |
| `Success` | 성공 항목 수로, `Results`에서 `nil`이 아닌 요소 수와 같습니다 |
| `Failed` | 실패 항목 수(추출 과정에서 오류를 반환) |
| `Cancelled` | 컨텍스트 취소로 인해 처리되지 않은 항목 수 |

항등식: `Success + Failed + Cancelled == 입력 항목 수`.

## 컨텍스트 취소 동작

`ExtractBatchWithContext` / `ExtractBatchFilesWithContext`는 세 개의 체크포인트에서 협력적으로 컨텍스트 취소에 응답합니다:

| 체크포인트 | 동작 |
|-----------|------|
| 작업 디스패치 전 | `ctx`가 이미 취소된 경우 해당 항목을 즉시 `Cancelled`로 표시하고, `Errors[i] = ctx.Err()`, goroutine 을 시작하지 않습니다 |
| 세마포어 획득 후 (goroutine 시작 전) | 세마포어 대기 중 취소된 경우에도 마찬가지로 `Cancelled`로 표시합니다 |
| goroutine 내 처리 전 | 추출을 실행하기 직전에 다시 확인하며, 취소된 경우 `Cancelled`로 표시하고 즉시 반환합니다 |

취소 후의 의미:

- **이미 완료된 결과는 변경되지 않고 유지**됩니다 — 취소는 아직 시작되지 않은 작업에만 영향을 줍니다
- **시작되지 않은 작업**은 `Cancelled`로 계산되며, 해당 `Errors[i]`는 `ctx.Err()`로 채워집니다 (보통 `context.Canceled` 또는 `context.DeadlineExceeded`)
- `WithContext` 접미사가 없는 버전은 내부적으로 `context.Background()`를 사용하므로 절대 취소되지 않습니다

## 입력 검증

배치 메서드는 작업을 디스패치하기 전에 사전 검증을 수행하며, 실패 시 채워진 `BatchResult`를 반환합니다 (`error`가 아님):

| 상황 | 반환 |
|------|------|
| 배치가 `10000`건 초과 | 각 항목의 `Errors[i]`에 동일한 오류를 채우고, `Failed = N`, panic 은 발생하지 않습니다 |
| Processor 가 `nil`이거나 이미 `Close`됨 | 각 항목의 `Errors[i]`에 `ErrProcessorClosed`를 채우고, `Failed = N` |
| 입력 슬라이스가 비어 있음 (0 건) | 빈 `BatchResult`(`Results`/`Errors`가 빈 슬라이스) |
| 패키지 함수에 유효하지 않은 `Config` 전달 | 각 항목에 설정 오류를 채움 |

## 예시

### 기본 배치 추출

```go
package main

import (
	"fmt"

	"github.com/cybergodev/html"
)

func main() {
	pages := [][]byte{
		[]byte("<html><head><title>홈</title></head><body><p>홈페이지에 오신 것을 환영합니다.</p></body></html>"),
		[]byte("<html><head><title>소개</title></head><body><p>팀 소개.</p></body></html>"),
		[]byte("<html><head><title>제품 목록</title></head><body><p>총 세 가지 제품.</p></body></html>"),
	}

	batch := html.ExtractBatch(pages)
	fmt.Printf("성공: %d, 실패: %d, 취소: %d\n", batch.Success, batch.Failed, batch.Cancelled)
	// 출력: 성공: 3, 실패: 0, 취소: 0

	// Results 인덱스는 입력 슬라이스와 일대일로 대응
	for i, result := range batch.Results {
		if result != nil {
			fmt.Printf("  [%d] 제목: %s, 단어 수: %d\n", i, result.Title, result.WordCount)
		}
	}
}
```

### 컨텍스트 취소가 포함된 배치 추출

```go
package main

import (
	"context"
	"fmt"

	"github.com/cybergodev/html"
)

func main() {
	pages := make([][]byte, 20)
	for i := range pages {
		pages[i] = []byte("<html><head><title>페이지</title></head><body><p>본문 내용.</p></body></html>")
	}

	// 컨텍스트를 즉시 취소하여 조기 종료 시뮬레이션
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	batch := html.ExtractBatchWithContext(ctx, pages)
	fmt.Printf("성공: %d, 실패: %d, 취소: %d\n", batch.Success, batch.Failed, batch.Cancelled)
	// 출력: 성공: 0, 실패: 0, 취소: 20

	// 취소된 항목: Results[i]는 nil, Errors[i]는 ctx.Err()로 채워짐
	fmt.Printf("첫 항목 오류: %v\n", batch.Errors[0])
	// 출력: 첫 항목 오류: context canceled
}
```

:::warning 배치 제한
단일 배치당 최대 10000 개 항목이며, 초과 시 모든 항목이 실패한 `*BatchResult`를 반환합니다 (각 항목의 `Errors`는 `html: batch size N exceeds maximum 10000`으로 채워집니다). panic 은 발생하지 않습니다.
:::
