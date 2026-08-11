---
sidebar_label: "보안 개요"
title: "보안 개요 - CyberGo env | 보안 아키텍처"
description: "CyberGo env 보안 아키텍처 개요로, SecureValue 메모리 잠금과 자동 제로화, 키-값 검증으로 제어 문자와 널 바이트 필터링, DefaultForbiddenKeys로 PATH와 LD_PRELOAD 금지, IsSensitiveKey 자동 감지, 보안 프리셋과 감사 추적을 상세히 설명합니다."
sidebar_position: 1
---

# 보안 개요

환경 변수는 종종 민감 정보를 저장하므로 안전한 처리가 매우 중요합니다. 이 문서는 env 라이브러리의 보안 아키텍처와 핵심 기능을 개관합니다.

## 보안 아키텍처

```text
┌──────────────────────────────────────────────────────────────┐
│                           애플리케이션 계층                    │
├──────────────────────────────────────────────────────────────┤
│   SecureValue   │    마스크    │    제로화    │   메모리 잠금   │
├──────────────────────────────────────────────────────────────┤
│                          Loader 계층                          │
├──────────────────────────────────────────────────────────────┤
│     키 검증      │   값 검증   │   금지 키   │   크기 제한      │
├──────────────────────────────────────────────────────────────┤
│                           파싱 계층                            │
├──────────────────────────────────────────────────────────────┤
│    형식 감지     │  확장 검사  │       경로 검증                │
└──────────────────────────────────────────────────────────────┘
```

## 핵심 보안 기능

| 기능 | 설명 | 문서 |
|------|------|------|
| **SecureValue** | 민감 값 메모리 보호, 자동 제로화 | [SecureValue API](/ko/env/api-reference/secure-value) |
| **금지 키** | 시스템 핵심 변수 수정 방지 | [상수와 오류](/ko/env/api-reference/constants#defaultforbiddenkeys) |
| **민감 키 감지** | 민감 구성 키 자동 인식, 로그 마스킹 도구 | [데이터 마스킹](/ko/env/security/data-masking) |
| **값 검증** | 제어 문자, 널 바이트 등 감지 | [Config API](/ko/env/api-reference/config) |
| **감사 로그** | 완전한 작업 추적 | [컴포넌트 팩토리](/ko/env/api-reference/factory#감사-핸들러-팩토리) |

## SecureValue 소개

민감 데이터의 경우 `GetString` 대신 `GetSecure`를 사용하세요:

```go
// 비권장
password := env.GetString("DB_PASSWORD")

// 권장
secret := env.GetSecure("DB_PASSWORD")
defer secret.Close()
password := secret.Reveal()  // 평문이 필요한 경우에만 호출
```

**핵심 기능:**
- **메모리 잠금** - 디스크로 스왑 방지(Linux/macOS/Windows/FreeBSD)
- **자동 제로화** - `Close()` 시 메모리 안전 삭제
- **마스크 표시** - `Masked()`는 로그 출력에 사용
- **스레드 안전** - 동시 읽기 지원

:::tip 완전한 API
자세한 내용은 [SecureValue API](/ko/env/api-reference/secure-value)를 참조하세요.
:::

## 로그 보안

SecureValue는 **메모리 내**의 민감 값을 보호하지만, 로그, 오류 정보, 디버그 출력도 마찬가지로 키 유출이 쉽습니다. env는 Loader에 의존하지 않고 사용할 수 있는 독립적인 마스킹 도구 함수 세트를 제공합니다:

- `IsSensitiveKey`로 비밀번호, 키, 토큰 등 민감 키 이름 자동 감지
- `MaskValue` / `MaskKey`로 값과 키 이름을 마스킹 후 출력
- `SanitizeForLog`로 로그 문자열의 `key=value` 패턴을 스캔하고 마스킹

```go
// 로그에서 안전하게 구성 출력, 평문 유출 방지
log.Printf("구성 로드: %s", env.MaskValue("DB_PASSWORD", password))
// 출력: 구성 로드: [MASKED:12 chars]

log.Printf("연결 매개변수: %s", env.SanitizeForLog("user=admin password=s3cret"))
// 출력: 연결 매개변수: user=admin [MASKED]
```

:::tip 완전한 가이드
마스킹 도구의 완전한 사용법은 [데이터 마스킹](/ko/env/security/data-masking)을 참조하세요.
:::

## 키/값 검증

### 키 검증

기본 키 이름 규칙: `^[A-Za-z][A-Za-z0-9_]*$`

- 문자로 시작
- 문자, 숫자, 밑줄만 포함
- 길이가 `MaxKeyLength`를 초과하지 않음

### 금지 키

내장 금지 키로 시스템 핵심 변수 수정을 방지합니다:

| 카테고리 | 예시 | 위험 |
|------|------|------|
| 시스템 경로 | `PATH`, `LD_LIBRARY_PATH` | 명령/라이브러리 하이재킹 |
| 동적 링크 | `LD_PRELOAD`, `DYLD_INSERT_LIBRARIES` | 악성 라이브러리 주입 |
| Shell | `SHELL`, `IFS`, `BASH_ENV` | Shell 하이재킹 |
| 언어 런타임 | `PYTHONPATH`, `NODE_PATH` | 모듈 하이재킹 |

:::tip 완전한 목록
[DefaultForbiddenKeys](/ko/env/api-reference/constants#defaultforbiddenkeys)에서 완전한 금지 키 목록을 확인하세요.
:::

### 값 검증

값 검증을 활성화하여 잠재적 위험을 감지합니다:

```go
cfg := env.ProductionConfig()
cfg.ValidateValues = true  // 제어 문자, 널 바이트 등 감지
```

## 파일 보안 기초

### 파일 권한

```bash
# 소유자만 읽기/쓰기 가능
chmod 600 .env

# 또는 더 엄격하게(읽기 전용)
chmod 400 .env
```

### Git 무시

```bash
.env
.env.local
.env.*.local
*.pem
*.key
```

## 구성 보안 수준

| 프리셋 | 용도 | 특징 |
|------|------|------|
| `DevelopmentConfig()` | 개발 환경 | 느슨한 제한, YAML 구문 지원 |
| `TestingConfig()` | 테스트 환경 | 이미 존재하는 변수 덮어쓰기, 테스트 격리 |
| `ProductionConfig()` | 프로덕션 환경 | 엄격한 검증 + 감사 로그, 이미 존재하는 변수 덮어쓰지 않음 |

```go
// 프로덕션 환경 권장 구성
cfg := env.ProductionConfig()
cfg.RequiredKeys = []string{"DB_HOST", "API_KEY"}
cfg.AllowedKeys = []string{"APP_NAME", "PORT", "DB_HOST", "API_KEY"}
```

## 관련 문서

- [SecureValue API](/ko/env/api-reference/secure-value) - 보안 값 처리 완전한 API
- [메모리 잠금](/ko/env/security/memory-locking) - mlock 메모리 보호 완전한 가이드
- [상수와 오류](/ko/env/api-reference/constants) - 금지 키 완전한 목록, 민감 키 패턴
- [프로덕션 체크리스트](/ko/env/security/production-checklist) - 프로덕션 적용 전 보안 점검
