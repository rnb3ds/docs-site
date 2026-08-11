---
sidebar_label: "개요"
title: "환경 변수 관리 - CyberGo env | 보안 환경 변수 구성"
description: "CyberGo env는 고보안 Go 환경 변수 관리 라이브러리로, .env, JSON, YAML 다중 형식 자동 감지 로드와 타입 안전 변환을 지원합니다. SecureValue 메모리 잠금 및 자동 제거, 분할 잠금 스레드 안전, ${VAR} 변수 확장, env 태그 구조체 매핑, 완전한 감사 로그를 내장하여 마이크로서비스 및 클라우드 네이티브 구성 관리에 적합합니다."
---

# env

고보안 Go 환경 변수 관리 라이브러리로, `.env`, JSON, YAML 다중 형식을 지원하고 스레드 안전, 감사 로그 및 보안 저장 기능을 제공합니다.

## 핵심 기능

- **다중 형식 지원** - `.env`, JSON, YAML 자동 감지
- **타입 안전** - 자동 타입 변환 및 검증
- **스레드 안전** - 분할 잠금으로 구현된 스레드 안전 동시 접근
- **보안 저장** - 민감 값 메모리 잠금, 자동 제거
- **감사 로그** - 완전한 작업 추적
- **변수 확장** - `${VAR}` 구문 지원
- **구조체 매핑** - 태그 기반 구성 바인딩

## 시나리오별 탐색

어디서 시작해야 할지 모르겠다면, 필요에 따라 선택하세요:

| 원하는 작업 | 참고 문서 |
|-----------|---------|
| 5분 만에 빠르게 시작하기 | [빠른 시작](/ko/env/getting-started/) |
| 비밀번호, 키를 안전하게 저장 | [보안 개요](/ko/env/security/) → [SecureValue](/ko/env/api-reference/secure-value) |
| 민감 데이터가 디스크로 스왑되지 않게 방지 | [메모리 잠금](/ko/env/security/memory-locking) |
| 로그에서 민감 데이터를 안전하게 처리 | [데이터 마스킹](/ko/env/security/data-masking) |
| 환경 변수를 struct에 매핑 | [구조체 매핑](/ko/env/guides/struct-mapping) |
| JSON/YAML 구성 파일 로드 | [다중 포맷 설정](/ko/env/guides/multi-format) |
| 변수 참조 및 재사용 구성 | [변수 확장](/ko/env/guides/variable-expansion) |
| 구성 직렬화/내보내기 | [직렬화](/ko/env/guides/serialization) |
| 보안 감사 로그 기록 | [감사 로깅](/ko/env/guides/audit-logging) |
| 오류 처리 및 매칭 | [오류 처리](/ko/env/guides/error-handling) |
| 단위 테스트 작성 | [테스트](/ko/env/guides/testing) |
| 커스텀 파일 형식 확장 | [커스텀 파서](/ko/env/guides/custom-parser) |
| 프로덕션 적용 전 보안 점검 | [프로덕션 체크리스트](/ko/env/security/production-checklist) |
| 자주 쓰는 코드 조각 보기 | [치트시트](/ko/env/getting-started/cheatsheet) |
| 자주 묻는 질문 찾기 | [FAQ](/ko/env/reference/faq) |

## 주요 기능 개요

| 기능 | 설명 |
|------|------|
| [타입 변환](/ko/env/getting-started/) | GetString, GetInt, GetBool, GetDuration, GetSlice |
| [구조체 매핑](/ko/env/guides/struct-mapping) | 태그 기반 구성 바인딩 |
| [보안 저장](/ko/env/api-reference/secure-value) | 민감 값 메모리 보호 |
| [다중 형식 로드](/ko/env/guides/multi-format) | .env, JSON, YAML |

## 빠른 탐색

<div class="vp-features">

### 시작하기
- [빠른 시작](/ko/env/getting-started/) - 5분 튜토리얼
- [치트시트](/ko/env/getting-started/cheatsheet) - 자주 쓰는 코드 조각

### API 레퍼런스
- [패키지 함수](/ko/env/api-reference/functions) - 완전한 API 문서
- [Loader](/ko/env/api-reference/loader) - 로더 메서드
- [SecureValue](/ko/env/api-reference/secure-value) - 보안 값 처리

### 보안
- [보안 개요](/ko/env/security/) - 보안 아키텍처와 모범 사례

</div>
