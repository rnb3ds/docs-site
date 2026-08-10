---
sidebar_label: "보안 보호"
title: "보안 보호 - CyberGo html | 다층 보안 API 레퍼런스"
description: "CyberGo html 보안 API: 콘텐츠 정제, 입력 크기 제한, DOM 깊이 제한, 경로 순회 방지와 AllowedBaseDir 샌드박스, HighSecurityConfig 프리셋, 처리 타임아웃과 보안 오류 타입을 제공합니다."
sidebar_position: 5
---

# 보안 보호

HTML 라이브러리는 다층 보안 보호 메커니즘을 내장했습니다. 모든 설정은 [Config](../core/config)의 보안 필드에 집중되어 있습니다. 이 페이지는 보안 관련 API를 다룹니다; 보안 개념 소개는 [보안 개요](../../guides/security/)를 참조하세요.

## 보안 설정 필드

| 필드 | 타입 | 기본값 | 보안 역할 |
|------|------|--------|----------|
| `EnableSanitization` | `bool` | `true` | 콘텐츠 정제: 위험 태그, 이벤트 속성, 악성 프로토콜 제거 |
| `MaxInputSize` | `int` | `52428800` (50MB) | 입력 크기 제한, 메모리 고갈 방지 |
| `MaxDepth` | `int` | `500` | DOM 중첩 깊이 제한, 재귀 폭탄 방지 |
| `ProcessingTimeout` | `time.Duration` | `30s` | 문서당 처리 타임아웃, 무한 처리 방지 |
| `AllowedBaseDir` | `string` | `""` | 파일 작업 디렉토리 샌드박스, 경로 순회 방지 |
| `Audit` | `AuditConfig` | `DefaultAuditConfig()` | 보안 감사 설정 (상세는 [감사 시스템](./audit)) |

:::warning 경고
`EnableSanitization`은 기본적으로 활성화됩니다. **완전히 신뢰할 수 있는 입력에만** 비활성화하세요. 비활성화하면 HTML이 있는 그대로 파싱되어 XSS 위험이 발생할 수 있습니다.
:::

## 콘텐츠 정제

활성화 시(기본값), 다음 정제가 자동 실행됩니다:

| 방어 계층 | 동작 |
|-----------|------|
| 위험 태그 | `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>` 등 제거 |
| 이벤트 속성 | 모든 `on*` 속성 제거 (`onclick`, `onerror` 등) |
| 위험 프로토콜 | `javascript:`, `vbscript:` 차단 |
| Data URL | `data:image/*`, `data:font/*`, `data:application/pdf`만 허용 |

차단된 콘텐츠는 감사 시스템을 통해 기록됩니다 (감사 활성화 필요).

## 경로 보안

### AllowedBaseDir 샌드박스

파일 작업(`ExtractFromFile` 등)을 지정된 디렉토리와 그 하위 디렉토리로 제한합니다:

```go
cfg := html.DefaultConfig()
cfg.AllowedBaseDir = "/var/www/html"

p, err := html.New(cfg)
if err != nil {
    log.Fatal(err)
}
defer p.Close()

// ✅ 허용: 디렉토리 내 파일
result, err := p.ExtractFromFile("/var/www/html/page.html")

// ❌ 거부: 디렉토리 외 파일
_, err = p.ExtractFromFile("/etc/passwd")
```

설정 후 파일 경로는 `AllowedBaseDir` 내부에 있어야 읽을 수 있습니다. 크로스 플랫폼 지원:

- **Unix**: 심볼릭 링크(symlink) 해석, 링크를 통한 탈출 방지
- **Windows**: junction과 심볼릭 링크 해석

비워두면(기본값) 제한 없음 — 신뢰할 수 있는 입력 시나리오에 적합.

### 경로 순회 감지

경로 순회 시도(예: `../../../etc/passwd`)를 자동으로 감지하고 차단하며, `*FileError`로 래핑된 오류를 반환합니다:

```go
_, err := html.ExtractFromFile("../../../etc/passwd")
// err에 "path traversal detected" 정보 포함
```

### FileError.SafePath

파일 오류는 경로 정보를 자동으로 마스킹하여 파일 시스템 구조 노출을 방지합니다:

```go
type FileError struct {
    Op      string
    Path    string
    FileErr error
}

func (e *FileError) Error() string        // 잘린 경로 출력 (파일명만)
func (e *FileError) SafePath() string     // 파일명만 반환
func (e *FileError) MarshalJSON() ([]byte, error) // JSON 직렬화 시 자동 마스킹
```

```go
_, err := html.ExtractFromFile("/var/www/secret/config.html")
if err != nil {
    var fileErr *html.FileError
    if errors.As(err, &fileErr) {
        fmt.Println(fileErr.SafePath()) // 출력: config.html (경로 제외)
    }
}
```

:::tip
`FileError.Error()`와 `SafePath()` 모두 잘린 안전한 경로(파일명만)를 반환하여 경로 노출을 방지합니다. 내부 디버깅 시 `Path` 필드에 직접 접근하세요.
:::

## 보안 프리셋

### HighSecurityConfig

고보안 환경을 위한 프리셋 설정, 모든 제한을 강화하고 포괄적인 감사를 활성화합니다:

```go
func HighSecurityConfig() Config
```

`DefaultConfig()` 대비 보안 필드 변경:

| 필드 | 기본값 | 고보안값 |
|------|--------|----------|
| `MaxInputSize` | `52428800` (50MB) | `10485760` (10MB) |
| `MaxDepth` | `500` | `100` |
| `ProcessingTimeout` | `30s` | `10s` |
| `WorkerPoolSize` | `4` | `2` |
| `Audit` | `DefaultAuditConfig()` | `HighSecurityAuditConfig()` |

```go
cfg := html.HighSecurityConfig()
p, err := html.New(cfg)
if err != nil {
    log.Fatal(err)
}
defer p.Close()
```

## 보안 관련 오류

| 오류 | 트리거 조건 |
|------|------------|
| `ErrInputTooLarge` | 입력이 `MaxInputSize` 초과 |
| `ErrMaxDepthExceeded` | DOM 깊이가 `MaxDepth` 초과 |
| `ErrProcessingTimeout` | 처리가 `ProcessingTimeout` 초과 |
| `ErrInvalidFilePath` | 파일 경로 검증 실패 (경로 순회 포함) |
| `ErrInternalPanic` | 내부 패닉 복구됨 |

:::info
완전한 오류 타입 정의(`InputError`, `ConfigError`, `FileError`)와 `errors.Is`/`errors.As` 사용법은 [상수와 오류](../types/constants)를 참조하세요.
:::

## 패닉 복구

모든 추출 작업에는 패닉 복구 메커니즘이 내장되어 있습니다. 처리 중 예상치 못한 패닉이 발생해도 서비스를 중단시키지 않고 `ErrInternalPanic`을 반환합니다:

```go
result, err := html.Extract(maliciousData)
if err != nil {
    if errors.Is(err, html.ErrInternalPanic) {
        // 입력이 내부 버그를 트리거했을 수 있음
        log.Printf("panic recovered: %v", err)
    }
}
```

## 관련 문서

- [보안 개요](../../guides/security/) — 보안 개념 소개와 모범 사례
- [감사 시스템](./audit) — 감사 파이프라인, 이벤트 타입, Sink
- [설정](../core/config) — 전체 Config 필드 레퍼런스
- [상수와 오류](../types/constants) — 센티널 오류와 오류 타입
- [프로덕션 체크리스트](../../guides/security/production-checklist) — 릴리스 전 보안 점검
