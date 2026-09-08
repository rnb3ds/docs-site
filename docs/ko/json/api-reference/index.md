---
sidebar_label: "개요"
title: "API 레퍼런스 - CyberGo JSON | 전체 함수 문서"
description: "CyberGo JSON API 레퍼런스: GetString/GetInt 경로 쿼리, Set/Delete 수정, Marshal/Unmarshal 직렬화, Processor 와 Schema 검증으로 패키지 함수와 인스턴스 메서드 두 스타일을 다루고 표준 라이브러리와 100% 호환됩니다."
sidebar_position: 1
---

# API 레퍼런스

이 섹션은 `github.com/cybergodev/json` 라이브러리의 전체 API 레퍼런스를 제공합니다.

::: tip 두 가지 API 스타일
본 라이브러리는 **패키지 레벨 함수** (예: `json.GetString(data, "path")`, 인스턴스 생성 불필요) 와 **Processor 메서드** (예: `p.GetString(data, "path")`, 설정 재사용, 사전 파싱 캐시, 훅 시스템 지원) 두 세트의 API 를 제공합니다. 어느 쪽을 써야 할지 모르겠다면 [Processor 가이드](../getting-started/processor-guide) 의 선택 결정 트리를 참고하세요.
:::

## 모듈 인덱스

### 함수 API

| 모듈 | 설명 |
|------|------|
| [패키지 함수](./functions/) | 패키지 레벨 함수 레퍼런스 (쿼리/수정/삭제/인코딩/파싱/배치/JSONL/파일/반복) |
| [Processor](./processor/) | 프로세서 메서드 (패키지 함수와 미러링 분류, 추가로 수명 주기와 사전 파싱 포함) |

### 타입과 인터페이스

| 모듈 | 설명 |
|------|------|
| [Config](./config) | 설정 옵션 상세 (DefaultConfig / SecurityConfig / PrettyConfig) |
| [타입 정의](./types) | 핵심 타입 (Config / Schema / Stats / AccessResult, Encoder / Decoder, CompiledPath / PathSegment 포함) |
| [인터페이스 정의](./interfaces) | 확장 인터페이스 (CustomEncoder / Validator / Hook / PathParser) |
| [이터레이터와 IterableValue](./iterator) | Iterator / BatchIterator / ParallelIterator / StreamIterator 타입 |
| [제네릭 조작](./generics) | 제네릭 API (GetTyped[T] / StreamLinesInto[T] / Result[T]) |
| [상수 및 오류](./constants) | 상수와 오류 타입 (`Default*` 상수와 Config 필드 대조표 포함) |

### 도구와 보조

| 모듈 | 설명 |
|------|------|
| [유틸리티 함수](./helpers) | CompareJSON / MergeJSON, 캐시 관리, 전역 프로세서, SafeError / RedactedPath, AccessResult 메서드 |
| [출력 포맷팅](../getting-started/print) | Print 계열 마이그레이션 가이드 (제거된 API 의 대체 방안) |

### 모듈 간 주제

| 모듈 | 설명 |
|------|------|
| [스트리밍 처리](../streaming/large-files) | 대용량 파일 스트리밍 처리 가이드 |
| [JSONL / NDJSON 처리](../streaming/jsonl) | JSONL 프로세서 (StreamJSONL / NDJSONProcessor / JSONLWriter) |
| [보안 검증](../security/security-mode) | 보안 모드 API (SecurityConfig / DangerousPattern / RegisterDangerousPattern) |
| [Schema 검증](./schema) | Schema 검증 (ValidateSchema / DefaultSchema / NewSchemaWithConfig) |
| [Hook 시스템](../extensions/hooks) | 작업 가로채기 훅 (LoggingHook / TimingHook / ValidationHook / ErrorHook) |
| [커스텀 인코더](../extensions/custom-encoder) | 커스텀 인코더 (CustomEncoder / TypeEncoder) |

## 빠른 찾기

### 기능별 분류

#### 경로 쿼리

| 함수 | 설명 |
|------|------|
| `Get`, `GetWithContext`, `GetString`, `GetInt`, `GetFloat`, `GetBool`, `GetArray`, `GetObject` | 타입 안전 조회 |
| `GetTyped[T]` | 제네릭 조회 |
| `SafeGet` | 안전하게 AccessResult 조회 |
| `GetMultiple` | 배치 조회 |

#### 수정 작업

| 함수 | 설명 |
|------|------|
| `Set`, `SetMultiple` | 값 설정 |
| `SetCreate`, `SetMultipleCreate` | 값 설정 및 경로 자동 생성 |
| `Delete`, `DeleteClean` | 값 삭제 |
| `ProcessBatch` | 배치 작업 |

#### 인코딩/디코딩

| 함수 | 설명 |
|------|------|
| `Marshal`, `Unmarshal` | 표준 인코딩/디코딩 (`encoding/json` 호환, `cfg` 추가 가능) |
| `MarshalIndent` | 포맷팅 인코딩 (`encoding/json.MarshalIndent` 호환, `cfg` 추가 가능) |
| `EncodeWithConfig`, `EncodePretty` | 문자열로 인코딩 (설정 포함 / 포맷팅 출력) |
| `Encode` (폐기 예정) | `EncodeWithConfig` 와 기능이 동등하며 향후 메이저 버전에서 제거 예정 — 신규 코드는 `Marshal` 또는 `EncodeWithConfig` 를 사용하세요 |
| `NewEncoder`, `NewDecoder` | 스트리밍 인코딩/디코딩 |
| `Parse`, `ParseAny` | 대상 변수로 파싱 / `any` 로 파싱 |
| `EncodeBatch`, `EncodeFields`, `EncodeStream` | 키-값 쌍을 객체로 인코딩 / 필드를 골라 인코딩 / 여러 값을 배열로 인코딩 |

#### 포맷팅

| 함수 | 설명 |
|------|------|
| `Prettify` | JSON 포맷팅 |
| `Compact` | JSON 압축 (buffer 형식, `encoding/json.Compact` 호환) |
| `CompactString` | JSON 압축 (문자열 입력/출력 형식, `Processor.Compact` 미러링) |
| `Indent` | 들여쓰기 포맷팅 후 buffer 에 기록 (`encoding/json.Indent` 호환) |
| `HTMLEscape` | HTML 문자 이스케이프 후 buffer 에 기록 (`encoding/json.HTMLEscape` 호환) |

#### 파일 작업

| 함수 | 설명 |
|------|------|
| `LoadFromFile`, `SaveToFile` | 파일 읽기/쓰기 |
| `LoadFromReader` | Reader 에서 읽기 |
| `MarshalToFile`, `UnmarshalFromFile` | 파일 인코딩/디코딩 |
| `SaveToWriter` | 임의의 Writer 에 기록 |

#### 반복 순회

| 함수 | 설명 |
|------|------|
| `Foreach`, `ForeachWithError`, `ForeachNested`, `ForeachNestedWithError` | 배열/객체 순회 (깊이 우선 순회 포함) |
| `ForeachWithPath`, `ForeachWithPathAndIterator`, `ForeachWithPathAndControl` | 지정 경로 순회 (현재 경로 함께 전달 / 중단 제어 가능) |
| `ForeachReturn` | 순회 후 수정된 JSON 반환 |
| `ForeachFile`, `ForeachFileWithPath`, `ForeachFileChunked`, `ForeachFileNested` | 대용량 파일 스트리밍 반복 |
| `NewIterator`, `NewBatchIterator`, `NewParallelIterator`, `NewStreamIterator` | 독립 이터레이터 생성 (자세한 내용은 [이터레이터](./iterator)) |

#### 캐시와 전역

| 함수 | 설명 |
|------|------|
| `WarmupCache`, `ClearCache` | 캐시 예열 / 정리 |
| `GetStats`, `GetHealthStatus` | 실행 통계 / 헬스 체크 |
| `GetConfig`, `SetLogger` | 프로세서 설정 읽기 / 로그 주입 (전역 함수와 Processor 메서드 모두 포함) |
| `SetGlobalProcessor`, `ShutdownGlobalProcessor` | 전역 프로세서 교체와 종료 |
| `RegisterDangerousPattern`, `UnregisterDangerousPattern`, `ListDangerousPatterns` | 전역 위험 패턴 레지스트리의 등록 / 제거 / 나열 (자세한 내용은 [유틸리티 함수](./helpers#registerdangerouspattern)) |
| `CompilePath` (Processor), `PreParse` (Processor) | 경로 사전 컴파일 / JSON 사전 파싱 |

#### 스트리밍 처리

| 타입/메서드 | 설명 |
|------|------|
| `StreamLinesInto[T]` | Reader 에서 JSONL 을 스트리밍으로 읽어 `[]T` 로 변환 |
| `ParseJSONL` | JSONL 바이트를 `[]any` 로 파싱 |
| `ToJSONL`, `ToJSONLString` | `[]any` 를 JSONL 형식으로 변환 |
| `JSONLWriter` | JSONL 작성기 (Write/WriteAll/WriteRaw) |
| `NDJSONProcessor` | NDJSON/JSONL 프로세서 (`NewNDJSONProcessor` 로 생성) |
| `ForeachFile` | 파일 스트리밍 처리 |

#### 검증

| 함수 | 설명 |
|------|------|
| `Valid` | JSON 검증 (`encoding/json.Valid` 호환) |
| `ValidWithConfig` | 설정을 포함한 JSON 검증 |
| `ValidateSchema` | Schema 검증 (`Schema` 타입과 함께 사용) |
| `CompareJSON` | JSON 동등성 비교 |
| `MergeJSON`, `MergeMany` | JSON 병합 (합집합/교집합/차집합 모드, 자세한 내용은 [유틸리티 함수](./helpers)) |

## 네이밍 규칙

라이브러리는 다음 네이밍 규칙을 따릅니다:

| 패턴 | 설명 | 예시 |
|------|------|------|
| `Get{Type}` | 지정 타입 조회 (defaultValue 지원) | `GetString`, `GetInt` |
| `GetTyped[T]` | 제네릭 조회, T 반환 | `GetTyped[User]` |
| `New{Type}` | 인스턴스 생성 | `New` (*Processor 반환), `NewEncoder` |
| `Default{Type}` | 기본 설정 | `DefaultConfig` |
| `{Type}Config` | 설정 프리셋 | `SecurityConfig`, `PrettyConfig` |
| `Foreach*` | 반복 변형 (WithError / WithPath / Nested / File) | `ForeachNestedWithError` |
| `Stream*` | 스트리밍 처리 변형 (Into / Parallel / File / Chunked) | `StreamJSONLParallel` |
| `{Verb}Hook` | 훅 팩토리 | `LoggingHook`, `ValidationHook` |

## 관련 문서

- [빠른 시작](../getting-started/) - 설치와 기본 사용법
- [Processor 가이드](../getting-started/processor-guide) - 프로세서 사용 시기
- [경로 표현식 문법](../getting-started/path-syntax) - 경로 쿼리 문법
- [사용 예제](../examples/) - 실전 코드 예제
- [대용량 파일 처리](../streaming/large-files) - 스트리밍 처리 가이드
