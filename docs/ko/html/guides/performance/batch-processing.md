---
sidebar_label: "배치 처리 실전"
title: "배치 처리 실전 - CyberGo html | 동시성 추출 가이드"
description: "CyberGo html 배치 처리 실전 가이드: 네 가지 배치 API와 BatchResult 구조, WorkerPoolSize 동시성 제어, 컨텍스트 취소, 부분 실패 처리, 그리고 단계별 성능 권장 사항을 다룹니다."
sidebar_position: 2
---

# 배치 처리 실전

대량의 HTML 문서를 처리할 때, 배치 API 는 자동으로 동시 실행되어 루프로 개별 호출하는 것보다 수 배 빠릅니다. 이 가이드는 네 가지 배치 API, 결과 구조, 동시성 튜닝을 다룹니다.

## 배치 API 개요

라이브러리는 바이트 입력/파일 입력 × 컨텍스트 없음/컨텍스트 있음에 각각 대응하는 네 가지 배치 함수를 제공합니다:

| API | 입력 | 컨텍스트 | 설명 |
|-----|------|--------|------|
| `ExtractBatch` | `[][]byte` | 없음 | 바이트 슬라이스 일괄 추출 |
| `ExtractBatchFiles` | `[]string` | 없음 | 파일 경로 일괄 추출 |
| `ExtractBatchWithContext` | `[][]byte` | 있음 | 타임아웃/취소 지원 |
| `ExtractBatchFilesWithContext` | `[]string` | 있음 | 타임아웃/취소 지원 |

모든 함수는 `Processor` 인스턴스 또는 패키지 수준에서 호출할 수 있습니다:

```go
// 패키지 수준 (내부 풀링된 Processor 사용)
br := html.ExtractBatch(pages)

// Processor 인스턴스 (캐시 재사용)
p, _ := html.New()
defer p.Close()
br := p.ExtractBatch(pages)
```

## BatchResult 구조

배치 조작은 `*BatchResult`를 반환하며, 항목별 결과와 집계 카운트를 포함합니다:

| 필드 | 타입 | 설명 |
|------|------|------|
| `Results` | `[]*Result` | 각 항목의 추출 결과; 실패 또는 취소된 항목은 `nil` |
| `Errors` | `[]error` | 각 항목의 오류; 성공 항목은 `nil`; 인덱스는 입력과 일대일 대응 |
| `Success` | `int` | 성공적으로 추출된 수 |
| `Failed` | `int` | 추출에 실패한 수 |
| `Cancelled` | `int` | 컨텍스트 취소로 건너뛴 수 |

:::tip 인덱스 대응 관계
`Results[i]`, `Errors[i]`는 i 번째 입력 항목과 일대일로 대응합니다. 성공 시 `Results[i]`는 nil 이 아니고 `Errors[i]`는 nil 입니다; 실패 시 그 반대입니다.
:::

## 기본 예제

3 개의 HTML 바이트 슬라이스를 배치 추출:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    pages := [][]byte{
        []byte(`<html><body><article><h1>첫 번째 페이지</h1><p>Go 언어 튜토리얼.</p></article></body></html>`),
        []byte(`<html><body><article><h1>두 번째 페이지</h1><p>동시성 프로그래밍 가이드.</p></article></body></html>`),
        []byte(`<html><body><article><h1>세 번째 페이지</h1><p>성능 최적화 팁.</p></article></body></html>`),
    }

    // 배치 동시 추출 (패키지 함수 사용)
    br := html.ExtractBatch(pages)

    fmt.Printf("성공: %d, 실패: %d, 취소: %d\n", br.Success, br.Failed, br.Cancelled)
    // 성공: 3, 실패: 0, 취소: 0

    // 결과 순회 (인덱스는 입력과 대응)
    for i, result := range br.Results {
        if result != nil {
            fmt.Printf("  [%d] 제목: %s\n", i+1, result.Title)
        } else if br.Errors[i] != nil {
            fmt.Printf("  [%d] 오류: %v\n", i+1, br.Errors[i])
        }
    }
    // [1] 제목: 첫 번째 페이지
    // [2] 제목: 두 번째 페이지
    // [3] 제목: 세 번째 페이지
}
```

## 파일에서 배치 추출

```go
files := []string{"page1.html", "page2.html", "page3.html"}

br := html.ExtractBatchFiles(files)

fmt.Printf("성공: %d, 실패: %d\n", br.Success, br.Failed)

for i, err := range br.Errors {
    if err != nil {
        fmt.Printf("파일 %s 실패: %v\n", files[i], err)
    }
}
```

## 패키지 함수 vs Processor 인스턴스

두 호출 방식의 캐시 동작이 다릅니다:

| 호출 방식 | 캐시 | 적용 시나리오 |
|----------|------|----------|
| `html.ExtractBatch(pages)` | 비활성 (풀링된 Processor 가 매번 캐시를 비움) | 일회성 배치 작업 |
| `p.ExtractBatch(pages)` | 활성 (Processor 캐시 재사용) | 고빈도 배치, 반복 콘텐츠 |

:::warning 패키지 함수는 캐시하지 않음
패키지 함수는 내부 `sync.Pool`로 관리되는 Processor 를 사용하며, 그 설정은 캐시를 비활성화 (`MaxCacheEntries = 0`) 하고 반환 시마다 캐시를 비웁니다. 배치에 반복 콘텐츠가 있다면 Processor 인스턴스를 사용하여 캐시 가속을 활용해야 합니다. 자세한 내용은 [Processor 재사용과 캐시](./processor-cache)를 참조하세요.
:::

```go
// 권장: 고빈도 배치 시나리오에서 Processor 재사용
p, _ := html.New()
defer p.Close()

for batch := range batchQueue {
    br := p.ExtractBatch(batch) // 캐시가 적용되어 반복 콘텐츠가 직접 적중
    processResult(br)
}
```

## 동시성 제어

`WorkerPoolSize`는 배치 처리의 동시 작업 수를 제어합니다 (기본 4, 최대 256):

```go
cfg := html.DefaultConfig()

// CPU 코어 수에 따라 동시성 설정 (상한 256)
if n := runtime.NumCPU(); n > 256 {
    n = 256
}
cfg.WorkerPoolSize = n

p, _ := html.New(cfg)
defer p.Close()

br := p.ExtractBatch(pages)
```

| 설정 | 기본값 | 상한 | 설명 |
|------|--------|------|------|
| `WorkerPoolSize` | 4 | 256 | 동시 worker 수, 양의 정수여야 함 |

:::tip WorkerPoolSize 튜닝
CPU 집약적 작업은 CPU 코어 수로 설정; I/O 집약적 작업 (예: 파일 읽기) 은 적절히 늘릴 수 있습니다. 256 을 초과하면 설정 검증에서 거부됩니다.
:::

## 배치 상한

단일 배치는 최대 10000 항목을 지원합니다. 초과 시 **모든 항목**이 오류를 반환합니다 (일부 처리가 아님):

```go
huge := make([][]byte, 10001) // 상한 초과

br := html.ExtractBatch(huge)

fmt.Printf("실패: %d\n", br.Failed)
// 실패: 10001

fmt.Printf("첫 번째 항목 오류: %v\n", br.Errors[0])
// 첫 번째 항목 오류: html: batch size 10001 exceeds maximum 10000
```

:::warning 초과 동작
`maxBatchSize = 10000`은 하드 상한입니다. 초과 시 어떤 항목도 처리하지 않고, 전체 입력에 대해 통일된 오류를 반환합니다. 더 많이 처리하려면 분할하여 호출하세요.
:::

## 컨텍스트 취소

`ExtractBatchWithContext`는 컨텍스트 취소 시 우아하게 종료됩니다:

```go
ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
defer cancel()

br := p.ExtractBatchWithContext(ctx, pages)

fmt.Printf("성공: %d, 실패: %d, 취소: %d\n",
    br.Success, br.Failed, br.Cancelled)
```

| 항목 상태 | 처리 방식 |
|----------|----------|
| 완료됨 | 결과가 `Results`에 보존됨 |
| 진행 중 | 완료 후 정상적으로 기록됨 |
| 시작 전 | 건너뛰고, `Cancelled`에 포함, `Errors[i]`는 `ctx.Err()`로 설정 |

:::tip 부분 결과 사용 가능
컨텍스트 취소 후에도 완료된 항목의 결과는 `br.Results`에 보존됩니다 (nil 이 아님). 취소로 인해 전체 출력을 폐기할 필요 없이 완료된 결과를 안전하게 사용할 수 있습니다.
:::

## 부분 실패 처리

배치는 **부분 성공**합니다 — 한 항목의 실패가 다른 항목에 영향을 주지 않습니다:

```go
pages := [][]byte{
    validHTML,   // 정상
    []byte(""),  // 빈 입력, 오류 트리거
    validHTML2,  // 정상
}

br := p.ExtractBatch(pages)

// 2 번째 항목 실패, 1, 3 번째 항목은 여전히 성공
fmt.Printf("성공: %d, 실패: %d\n", br.Success, br.Failed)
// 성공: 2, 실패: 1

// 항목별 처리, 실패 항목 건너뛰기
for i, result := range br.Results {
    if result == nil {
        fmt.Printf("[%d] 실패: %v\n", i, br.Errors[i])
        continue
    }
    fmt.Printf("[%d] 제목: %s\n", i, result.Title)
}
```

## 성능 권장 사항

| 문서 수 | 추천 전략 | 설명 |
|----------|----------|------|
| 1–10 | 개별 `Extract` | 배치 스케줄링 오버헤드가 동시성 이득을 초과할 수 있음 |
| 10–1000 | `ExtractBatch` + 패키지 함수 | 자동 동시성, Processor 관리 불필요 |
| 1000+ | `p.ExtractBatch` + Processor 인스턴스 | 캐시 재사용, 분할 처리로 메모리 피크 방지 |
| 10000+ | 분할 (매 배치 ≤10000) + Processor 인스턴스 | 단일 배치 상한 초과, 분할 처리 |

```go
// 대규모 분할 처리 예제
p, _ := html.New()
defer p.Close()

const batchSize = 5000
for i := 0; i < len(allPages); i += batchSize {
    end := i + batchSize
    if end > len(allPages) {
        end = len(allPages)
    }

    br := p.ExtractBatch(allPages[i:end])
    // 이번 배치 결과 처리...
}
```

## 다음 단계

- [Processor 재사용과 캐시](./processor-cache) - 패키지 함수와 인스턴스의 캐시 차이
- [성능 최적화](./performance) - 처리량 향상과 타임아웃 설정
- [오류 처리](../error-handling) - 센티널 오류와 배치 오류 처리
- [API 레퍼런스: 배치 처리](../../api-reference/modules/batch) - 전체 API 시그니처
