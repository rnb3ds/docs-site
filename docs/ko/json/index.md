---
sidebar_label: "개요"
title: "JSON 처리 라이브러리 - CyberGo JSON | 고성능 Go 라이브러리"
description: "CyberGo JSON 은 고성능 스레드 안전 Go JSON 처리 라이브러리로 JSONPath 쿼리, 스트리밍, 제네릭 API, Schema 검증, Hook 확장을 지원하고 입력 검증, 위험 패턴 감지, 캐시를 내장해 encoding/json 과 100% 호환됩니다."
sidebar_icon: "📘"
---

# JSON 처리 라이브러리

`github.com/cybergodev/json` 은 고성능, 스레드 안전한 Go JSON 처리 라이브러리입니다. 파싱, 쿼리, 수정, 검증, 포맷팅을 포함한 풍부한 JSON 조작 기능을 제공하면서도 표준 라이브러리 `encoding/json` 과의 100% 호환성을 유지합니다.

## 핵심 기능

- **100% encoding/json 호환** — 표준 라이브러리를 매끄럽게 대체하며 기존 코드를 수정할 필요가 없습니다
- **스레드 안전** — 모든 작업이 동시성 안전하며 높은 동시성 시나리오를 지원합니다
- **경로 쿼리** — 와일드카드, 슬라이스를 포함한 JSONPath 스타일 경로 표현식 지원
- **타입 안전 조회** — 제네릭 API (`GetTyped[T]`) 와 타입 단언 메서드 (`SafeGet`)
- **스트리밍 처리** — 대용량 파일과 JSONL/NDJSON 형식의 스트리밍 처리 지원
- **보안 방어** — 입력 검증, 깊이 제한, 위험 패턴 감지 내장
- **고성능 캐시** — 지능형 캐시, 사전 파싱 최적화, 객체 풀 재사용
- **확장 가능** — 훅 시스템, 커스텀 인코더, 검증기

## 설치

```bash
go get github.com/cybergodev/json
```

## 30 초 빠른 체험

```go
package main

import (
	"fmt"
	"github.com/cybergodev/json"
)

func main() {
	data := `{"name": "CyberGo", "version": 1, "tags": ["json", "go"]}`

	// 1. 경로 조회
	name := json.GetString(data, "name")
	fmt.Println("Name:", name)

	// 2. 값 수정
	updated, _ := json.Set(data, "version", 2)
	fmt.Println("Updated:", updated)

	// 3. 검증
	if json.Valid([]byte(data)) {
		fmt.Println("Valid JSON")
	}

	// 4. 기본값으로 조회
	desc := json.GetString(data, "description", "기본 설명")
	fmt.Println("Description:", desc)

	// 5. 구조체로 디코딩
	type Config struct {
		Name    string   `json:"name"`
		Version int      `json:"version"`
		Tags    []string `json:"tags"`
	}
	var config Config
	json.Unmarshal([]byte(data), &config)
	fmt.Printf("Config: %+v\n", config)
}
```

## 기능 개요

### 경로 조작

| 기능 | 함수 | 설명 |
|------|------|------|
| 값 조회 | `Get`, `GetString`, `GetInt`... | 중첩 경로, 배열 인덱스 지원 |
| 배치 조회 | `GetMultiple` | 한 번의 파싱으로 여러 경로의 값 조회 |
| 기본값 조회 | `GetString`, `GetInt` 등 | defaultValue 매개변수 전달 |
| 값 설정 | `Set` | 기본적으로 존재하지 않는 경로 자동 생성 (Config.CreatePaths) |
| 값 삭제 | `Delete` | 지정된 경로 삭제 |

### 인코딩/디코딩

| 기능 | 함수 | 설명 |
|------|------|------|
| 인코딩 | `Marshal`, `MarshalIndent` | encoding/json 과 100% 호환 |
| 디코딩 | `Unmarshal`, `Parse`, `ParseAny` | 제네릭과 타입 안전 지원 |
| 포맷팅 | `Prettify`, `Compact` | JSON 미화/압축 |

### 고급 기능

| 기능 | 함수/타입 | 설명 |
|------|-----------|------|
| 제네릭 API | `GetTyped[T]` | 타입 안전한 제네릭 조회 |
| 사전 파싱 | `Processor.PreParse`, `Processor.GetFromParsed` | 한 번 파싱으로 여러 번 쿼리 |
| 경로 사전 컴파일 | `Processor.CompilePath`, `Processor.GetCompiled` | 같은 경로의 고빈도 쿼리에서 중복 파싱 제로 |
| 병렬 반복 | `NewParallelIterator` | 워커 풀 내장 병렬 Map/Filter/ForEach |
| 안전한 조회 | `SafeGet` → `AccessResult` | 체이닝 타입 변환 |
| 스트리밍 처리 | `NDJSONProcessor` | 줄 단위 스트리밍, 메모리 제어 가능 |
| JSONL 처리 | `StreamLinesInto[T]` | 로그/데이터 파이프라인 |
| Schema 검증 | `ValidateSchema` | JSON Schema 검증 |

## 모듈 탐색

| 모듈 | 설명 |
|------|------|
| [빠른 시작](./getting-started/) | 설치, 기본 사용법, 핵심 개념 |
| [경로 표현식 문법](./getting-started/path-syntax) | 경로 쿼리, 슬라이스, 와일드카드, 필드 추출 |
| [Processor 가이드](./getting-started/processor-guide) | Processor 사용 시기, 사전 파싱 최적화, 수명 주기 |
| [API 문서](./api-reference/) | 전체 API 레퍼런스 |
| [대용량 파일 처리](./streaming/large-files) | 스트리밍 처리, 청크 읽기/쓰기, 메모리 최적화 |
| [사용 예제](./examples/) | 실전 코드 예제 |
| [고급 기능 예제](./examples/examples-advanced) | 배치 인코딩, 사전 파싱, 훅 시스템 |

## 성능 특성

- **제로 할당 빠른 경로** — 단일 키 접근과 캐시 키 생성은 스택 버퍼를 사용해 힙 할당 감소
- **지능형 캐시** — 핫 경로 자동 캐시, 캐시 예열 지원
- **객체 풀** — 중간 객체 재사용으로 GC 부담 감소
- **병렬 스트림 처리** — JSONL 스트리밍 처리의 멀티 워커 병렬 지원 (`StreamJSONLParallel`)
- **사전 파싱 최적화** — 대형 JSON 한 번 파싱으로 여러 번 쿼리

## 표준 라이브러리와 비교

| 특성 | encoding/json | cybergodev/json |
|------|---------------|-----------------|
| 기본 인코딩/디코딩 | ✅ | ✅ 100% 호환 |
| 경로 쿼리 | ❌ | ✅ 점/대괄호 문법 |
| 타입 안전 조회 | ❌ | ✅ 제네릭 API |
| 스트리밍 처리 | 기본 | ✅ 강화 |
| JSONL 지원 | ❌ | ✅ 네이티브 지원 |
| 보안 검증 | ❌ | ✅ 내장 방어 |
| 훅 시스템 | ❌ | ✅ 확장 가능 |
| 캐시 최적화 | ❌ | ✅ 지능형 캐시 |

## 빠른 결정 가이드

| 시나리오 | 추천 방안 |
|------|----------|
| 간단한 쿼리 | `GetString(data, "path")` |
| 기본값 포함 | `GetString(data, "path", "default")` |
| 타입 안전 | `GetTyped[User](data, "user")` |
| 같은 JSON 에서 여러 경로 쿼리 | `Processor` + `PreParse` |
| 같은 경로로 여러 JSON 쿼리 | `Processor` + `CompilePath` |
| 대용량 파일 | `Processor.ForeachFile` |
| 대형 배열 병렬 처리 | `NewParallelIterator` |
| JSONL 파이프라인 | `StreamLinesInto[T]` |
| 신뢰할 수 없는 입력 | `SecurityConfig()` |

## 다음 단계

- [빠른 시작](./getting-started/) — 5 분 안에 시작
- [Processor 가이드](./getting-started/processor-guide) — 프로세서 사용 시기
- [경로 표현식 문법](./getting-started/path-syntax) — 전체 경로 문법
- [사용 예제](./examples/) — 더 많은 실전 예제
