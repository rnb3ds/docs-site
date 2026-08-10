---
sidebar_label: "JSONL 데이터 파이프라인"
title: "JSONL 데이터 파이프라인 - CyberGo JSON | 스트리밍과 일괄 변환"
description: "CyberGo JSON으로 JSONL 데이터 파이프라인 구축: StreamLinesInto 스트리밍 읽기와 변환, ToJSONL/ToJSONLString 일괄 변환, NDJSONProcessor와 ForeachFile 대용량 파일 처리."
sidebar_position: 5
---

# JSONL 데이터 파이프라인

이 문서는 CyberGo JSON으로 JSONL(줄바꿈 구분 JSON) 데이터 파이프라인을 구축하는 방법을 보여줍니다: 스트리밍 읽기, 필드 변환, 일괄 형식 변환, 대용량 파일 처리.

## JSONL 스트리밍 읽기 및 변환

제네릭 `StreamLinesInto[T]`로 JSONL 스트림을 한 줄씩 읽어 구조체로 역직렬화하고, 콜백에서 필드를 변환한 뒤 `ToJSONLString`으로 JSONL 형식에 다시 씁니다.

```go
package main

import (
    "fmt"
    "strings"

    "github.com/cybergodev/json"
)

// LogEntry는 단일 JSON 로그 줄을 나타냅니다
type LogEntry struct {
    Timestamp string `json:"timestamp"`
    Level     string `json:"level"`
    Message   string `json:"message"`
}

// EnrichedLog는 변환된 로그입니다 (필드 이름 변경 및 새 카테고리 추가)
type EnrichedLog struct {
    Timestamp string `json:"ts"`
    Level     string `json:"level"`
    Message   string `json:"msg"`
    Category  string `json:"category"`
}

func main() {
    // JSONL 로그 스트림 시뮬레이션 (실제로는 파일이나 네트워크에서 올 수 있음)
    jsonlStream := `{"timestamp":"2024-01-01T10:00:00Z","level":"INFO","message":"서비스 시작"}
{"timestamp":"2024-01-01T10:00:05Z","level":"ERROR","message":"데이터베이스 연결 실패"}
{"timestamp":"2024-01-01T10:00:10Z","level":"WARN","message":"응답 시간 임계값 초과"}
{"timestamp":"2024-01-01T10:00:15Z","level":"INFO","message":"재연결 성공"}`

    reader := strings.NewReader(jsonlStream)

    // 1. 각 로그 줄을 스트리밍 읽기 및 변환
    var enriched []any
    entries, err := json.StreamLinesInto[LogEntry](reader, func(lineNum int, entry LogEntry) error {
        // 레벨별 분류
        category := "normal"
        if entry.Level == "ERROR" {
            category = "critical"
        } else if entry.Level == "WARN" {
            category = "warning"
        }

        enriched = append(enriched, EnrichedLog{
            Timestamp: entry.Timestamp,
            Level:     entry.Level,
            Message:   entry.Message,
            Category:  category,
        })
        return nil
    })
    if err != nil {
        panic(err)
    }

    // 2. JSONL 형식으로 일괄 변환
    output, err := json.ToJSONLString(enriched)
    if err != nil {
        panic(err)
    }
    fmt.Printf("%d줄의 로그를 처리했습니다\n", len(entries))
    fmt.Print(output)
}
// 출력:
// 4줄의 로그를 처리했습니다
// {"ts":"2024-01-01T10:00:00Z","level":"INFO","msg":"서비스 시작","category":"normal"}
// {"ts":"2024-01-01T10:00:05Z","level":"ERROR","msg":"데이터베이스 연결 실패","category":"critical"}
// {"ts":"2024-01-01T10:00:10Z","level":"WARN","msg":"응답 시간 임계값 초과","category":"warning"}
// {"ts":"2024-01-01T10:00:15Z","level":"INFO","msg":"재연결 성공","category":"normal"}
```

## JSONL 파일 처리

`NDJSONProcessor`는 JSONL 파일을 한 줄씩 처리하며, 콜백은 `map[string]any`를 받습니다 (필드가 고정되지 않은 경우에 유용). 집계 결과는 `ToJSONL`로 일괄 변환하여 JSONL 바이트로 만듭니다.

```go
package main

import (
    "fmt"
    "os"
    "path/filepath"

    "github.com/cybergodev/json"
)

func main() {
    // 예제가 단독 실행되도록 임시 JSONL 파일 생성
    tmpDir, err := os.MkdirTemp("", "cybergo-pipeline-*")
    if err != nil {
        panic(err)
    }
    defer os.RemoveAll(tmpDir)

    jsonlPath := filepath.Join(tmpDir, "events.jsonl")
    jsonData := `{"event":"login","user":"alice","ts":"2024-01-01T10:00:00Z"}
{"event":"logout","user":"alice","ts":"2024-01-01T11:00:00Z"}
{"event":"login","user":"bob","ts":"2024-01-01T12:00:00Z"}
{"event":"purchase","user":"bob","ts":"2024-01-01T12:30:00Z"}`
    if err := os.WriteFile(jsonlPath, []byte(jsonData), 0644); err != nil {
        panic(err)
    }

    // 1. NDJSONProcessor로 줄별 처리 (각 줄은 map[string]any로 파싱)
    processor := json.NewNDJSONProcessor()
    loginCount := 0
    err = processor.ProcessFile(jsonlPath, func(lineNum int, obj map[string]any) error {
        event, _ := obj["event"].(string)
        user, _ := obj["user"].(string)
        fmt.Printf("%d번 줄: %s by %s\n", lineNum, event, user)
        if event == "login" {
            loginCount++
        }
        return nil
    })
    if err != nil {
        panic(err)
    }

    // 2. 집계 결과를 JSONL로 변환 (일괄 형식 변환)
    summary := []any{
        map[string]any{"metric": "logins", "count": loginCount},
        map[string]any{"metric": "total_events", "count": 4},
    }
    jsonlBytes, err := json.ToJSONL(summary)
    if err != nil {
        panic(err)
    }
    fmt.Printf("로그인 이벤트 수: %d\n", loginCount)
    fmt.Printf("집계 결과:\n%s", string(jsonlBytes))
}
// 출력:
// 1번 줄: login by alice
// 2번 줄: logout by alice
// 3번 줄: login by bob
// 4번 줄: purchase by bob
// 로그인 이벤트 수: 2
// 집계 결과:
// {"metric":"logins","count":2}
// {"metric":"total_events","count":4}
```

## 대용량 JSON 배열 파일 스트리밍

**단일 대형 JSON 배열 파일**(JSONL이 아님)의 경우, `ForeachFile`로 전체 파일을 메모리에 한 번에 로드하지 않고 요소별로 순회합니다.

```go
package main

import (
    "fmt"
    "os"
    "path/filepath"

    "github.com/cybergodev/json"
)

func main() {
    tmpDir, err := os.MkdirTemp("", "cybergo-big-*")
    if err != nil {
        panic(err)
    }
    defer os.RemoveAll(tmpDir)

    // 대형 JSON 배열 파일 생성 (대규모 데이터셋 시뮬레이션)
    arrayPath := filepath.Join(tmpDir, "records.json")
    records := []any{
        map[string]any{"id": 1, "amount": 100, "currency": "USD"},
        map[string]any{"id": 2, "amount": 250, "currency": "EUR"},
        map[string]any{"id": 3, "amount": 80, "currency": "USD"},
        map[string]any{"id": 4, "amount": 500, "currency": "GBP"},
        map[string]any{"id": 5, "amount": 120, "currency": "USD"},
    }
    if err := json.SaveToFile(arrayPath, records); err != nil {
        panic(err)
    }

    // ForeachFile로 배열의 각 요소를 스트리밍 순회
    p, err := json.New()
    if err != nil {
        panic(err)
    }
    defer p.Close()

    totalUSD := 0
    err = p.ForeachFile(arrayPath, func(key any, item *json.IterableValue) error {
        currency := item.GetString("currency")
        amount := item.GetInt("amount")
        if currency == "USD" {
            totalUSD += amount
        }
        return nil // item.Break()를 반환하면 조기 중단
    })
    if err != nil {
        panic(err)
    }
    fmt.Printf("USD 총액: %d\n", totalUSD)
}
// 출력: USD 총액: 320
```

:::tip 팁
- **JSONL 파일**(줄마다 독립적인 JSON 객체 하나): `StreamLinesInto[T]`, `NDJSONProcessor`, `StreamJSONLFile`을 사용하세요.
- **대형 JSON 배열 파일**(단일 JSON 배열에 많은 요소): `ForeachFile`로 메모리에 모두 로드하지 않고 스트리밍하세요.
:::

## 다음 단계

- [JSONL 스트리밍](../streaming/jsonl) — 전체 JSONL 처리 가이드
- [대용량 파일 처리](../streaming/large-files) — 대용량 파일 스트리밍 상세
- [기본 예제](./index) — 기본 JSONL 읽기/쓰기
- [치트시트](../getting-started/cheatsheet) — 빠른 API 참조
