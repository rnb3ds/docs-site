---
sidebar_label: "개요"
title: "API 레퍼런스 - CyberGo html | 전체 함수·타입 목록"
description: "CyberGo html 전체 API 인덱스: 패키지 함수와 Processor 두 호출 방식으로 콘텐츠 추출, 출력 형식, 링크 추출, 배치 처리, 설정, 감사 시스템, 타입 정의 모듈을 함수 시그니처와 예제와 함께 안내합니다."
sidebar_position: 1
---

# API 레퍼런스

HTML 라이브러리는 다음 핵심 컴포넌트를 제공합니다:

| 컴포넌트 | 설명 | 문서 |
|------|------|------|
| 패키지 함수 | 편의 함수, 일회성 호출에 적합 | [패키지 함수](./core/functions) |
| Processor | 프로세서 인스턴스, 리소스 및 캐시 재사용 | [Processor](./core/processor) |
| Config | 설정 구조체와 프리셋 | [설정](./core/config) |
| 출력 형식 | Markdown, JSON 출력 | [출력 형식](./modules/output) |
| 링크 추출 | 독립적인 링크 추출 API | [링크 추출](./modules/links) |
| 배치 처리 | 동시성 배치 추출 | [배치 처리](./modules/batch) |
| 인터페이스 | Extractor, StatsProvider 등 | [인터페이스 정의](./types/interfaces) |
| 타입 | Result, ImageInfo 등 | [타입 정의](./types/type-defs) |
| 상수와 오류 | 기본값, 센티넬 오류 | [상수와 오류](./types/constants) |
| 보안 보호 | 정제, 입력 제한, 경로 보안 | [보안 보호](./modules/security) |
| 감사 시스템 | 감사 파이프라인과 Sink | [감사 시스템](./modules/audit) |

## API 개요

### 두 가지 호출 모드

```text
┌─────────────────────────────────────────┐
│         패키지 함수 (편의 모드)              │
│  html.Extract(data) → *Result, error    │
│  내부적으로 sync.Pool 로 Processor 재사용   │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│        Processor(인스턴스 모드)            │
│  p, _ := html.New(cfg)                  │
│  defer p.Close()                        │
│  result, err := p.Extract(data)         │
│  ✓ 캐시 재사용  ✓ 통계 수집  ✓ 감사 로그    │
└─────────────────────────────────────────┘
```

### 함수 명명 규칙

| 모드 | 명명 | 예시 |
|------|------|------|
| 기본 | `Extract*` | `Extract`, `ExtractText` |
| 파일에서 | `Extract*FromFile` | `ExtractFromFile` |
| 컨텍스트 포함 | `Extract*WithContext` | `ExtractWithContext` |
| 파일 + 컨텍스트 | `Extract*FromFileWithContext` | `ExtractFromFileWithContext` |

### 모듈 정보

- **모듈 경로**: `github.com/cybergodev/html`
- **Go 버전**: 1.25+
- **의존성**: `golang.org/x/net`, `golang.org/x/text`

## 핵심 타입 빠른 참조

| 타입 | 설명 | 문서 |
|------|------|------|
| `Result` | 추출 결과(텍스트, 제목, 이미지, 링크, 통계) | [타입 정의](./types/type-defs) |
| `Config` | 통합 설정 구조체와 프리셋 | [설정](./core/config) |
| `Processor` | 핵심 처리 엔진, 캐시와 통계 지원 | [Processor](./core/processor) |
| `Statistics` | 처리 통계(적중, 오류, 평균 소요) | [타입 정의](./types/type-defs) |
| `BatchResult` | 배치 추출 결과 | [배치 처리](./modules/batch) |
| `LinkResource` | 링크 리소스(유형 분류 포함) | [링크 추출](./modules/links) |
| `AuditEntry` | 감사 로그 항목 | [감사 시스템](./modules/audit) |

## 인터페이스 빠른 참조

| 인터페이스 | 설명 | 문서 |
|------|------|------|
| `Extractor` | 추출 메인 인터페이스, 디커플링과 mock 에 편리 | [인터페이스 정의](./types/interfaces) |
| `StatsProvider` | 통계 조회 인터페이스 | [인터페이스 정의](./types/interfaces) |
| `Scorer` | 커스텀 콘텐츠 평가 알고리즘 | [인터페이스 정의](./types/interfaces) |
| `ContentNode` | 노드 추상화, 내부 파서 타입 숨김 | [인터페이스 정의](./types/interfaces) |
| `AuditSink` | 감사 로그 출력 대상(커스텀 백엔드) | [인터페이스 정의](./types/interfaces) |

## 프리셋 설정

프리셋에서 출발하여 필요에 따라 미세 조정하고, 제로값 설정을 직접 작성하는 것을 피하세요 (`Config` 제로값은 직접 사용할 수 없음):

| 프리셋 | 용도 |
|------|------|
| `DefaultConfig()` | 범용 시나리오, 기능과 성능의 균형 |
| `TextOnlyConfig()` | 순수 텍스트만 추출, 모든 미디어 비활성화, 최고 성능 |
| `MarkdownConfig()` | 인라인 Markdown 포맷의 이미지와 링크 출력 |
| `HighSecurityConfig()` | 고보안 환경: 한도 강화, 타임아웃 단축, 감사 활성화 |

자세한 내용은 [설정](./core/config)을 참조하세요.

## 시나리오별 API 찾기

일반적인 요구와 해당 진입점:

| 요구 | 추천 API | 문서 |
|------|----------|------|
| 순수 텍스트만 추출 | `ExtractText` / `Processor.ExtractText` | [패키지 함수](./core/functions) |
| Markdown 출력 | `ExtractToMarkdown` 또는 `MarkdownConfig()` | [출력 형식](./modules/output) |
| 모든 링크 리소스 추출 | `ExtractAllLinks` | [링크 추출](./modules/links) |
| 배치 동시성 처리 | `ExtractBatch` / `ExtractBatchFiles` | [배치 처리](./modules/batch) |
| 커스텀 콘텐츠 인식 | `Scorer` 인터페이스 + `Config.Scorer` | [인터페이스 정의](./types/interfaces) |
| 감사 보안 이벤트 | `AuditConfig` + `AuditSink` | [감사 시스템](./modules/audit) |
| 고빈도 재사용 + 캐시 | `html.New()` 장기 실행 `Processor` | [Processor](./core/processor) |
