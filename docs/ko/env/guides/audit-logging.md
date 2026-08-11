---
sidebar_label: "감사 로깅"
title: "감사 로깅 - CyberGo env | 보안 감사 구성"
description: "CyberGo env 감사 로그 구성 가이드로, JSONAuditHandler, LogAuditHandler, ChannelAuditHandler 세 가지 핸들러와 커스텀 AuditHandler로 변수 로드, 읽기, 수정, 삭제 작업을 기록하여 보안 감사, 규정 준수 검사, 문제 해결에 활용합니다."
sidebar_position: 6
sidebar_icon: "🛡️"
---

# 감사 로깅

감사 로그 기능은 모든 환경 변수 작업을 기록하여 보안 감사, 규정 준수 검사 및 문제 해결에 사용됩니다.

## 감사 활성화

### 구성 활성화

```go
cfg := env.ProductionConfig()
cfg.AuditEnabled = true
cfg.AuditHandler = env.NewJSONAuditHandler(os.Stdout)

loader, _ := env.New(cfg)
```

### 구성 프리셋

| 프리셋 | 감사 상태 |
|------|----------|
| `DefaultConfig()` | 비활성화 |
| `DevelopmentConfig()` | 비활성화 |
| `TestingConfig()` | 비활성화 |
| `ProductionConfig()` | 활성화 |

---

## 감사 핸들러

### JSONAuditHandler

JSON 형식 로그 출력:

```go
import (
    "os"
    "github.com/cybergodev/env"
)

cfg := env.ProductionConfig()
cfg.AuditEnabled = true
cfg.AuditHandler = env.NewJSONAuditHandler(os.Stdout)
```

**출력 예시:**

```json
{"timestamp":"2024-01-15T10:30:00Z","action":"load","file":".env","success":true,"duration_ns":1234567}
{"timestamp":"2024-01-15T10:30:01Z","action":"set","key":"[MASKED:7 chars]","success":true,"masked":true}
{"timestamp":"2024-01-15T10:30:02Z","action":"set","key":"CUSTOM_VAR","success":true}
```

민감 키(예: `API_KEY`)는 감사 로그의 `key` 필드에서 자동으로 `[MASKED:N chars]`(N은 키 길이)로 마스크되며, 비민감 키(예: `CUSTOM_VAR`)는 원래대로 표시됩니다.

---

### LogAuditHandler

표준 log 패키지로 출력:

```go
import (
    "log"
    "os"
    "github.com/cybergodev/env"
)

logger := log.New(os.Stderr, "[AUDIT] ", log.LstdFlags)
cfg.AuditHandler = env.NewLogAuditHandler(logger)
```

**출력 예시:**

```text
[AUDIT] 2024/01/15 10:30:00 action=load success=true reason="" file=.env duration=1.23ms
[AUDIT] 2024/01/15 10:30:01 action=set key=[MASKED:7 chars] success=true reason=""
[AUDIT] 2024/01/15 10:30:02 action=set key=CUSTOM_VAR success=true reason=""
```

---

### ChannelAuditHandler

채널로 전송하여 비동기 처리:

```go
ch := make(chan env.AuditEvent, 100)
cfg.AuditHandler = env.NewChannelAuditHandler(ch)

// 감사 이벤트 비동기 처리
go func() {
    for event := range ch {
        processAuditEvent(event)
    }
}()
```

**사용 시나리오:**
- 원격 로그 서비스로 전송
- 데이터베이스에 기록
- 실시간 모니터링 알림

---

### NopAuditHandler

아무 작업도 수행하지 않는 핸들러, 모든 이벤트 폐기:

```go
cfg.AuditHandler = env.NewNopAuditHandler()
```

**사용 시나리오:**
- 감사 일시적 비활성화
- 테스트 환경

---

## 감사 이벤트

### AuditEvent 구조

```go
type AuditEvent struct {
    Timestamp time.Time   // 타임스탬프
    Action    AuditAction // 작업 타입
    Key       string      // 키 이름
    File      string      // 파일 이름
    Reason    string      // 원인
    Success   bool        // 성공 여부
    Masked    bool        // 마스크 여부
    Details   string      // 상세 정보
    Duration  int64       // 소요 시간(나노초)
}
```

### AuditAction 작업 타입

| 상수 | 값 | 설명 |
|------|---|------|
| `ActionLoad` | `load` | 파일 로드 |
| `ActionParse` | `parse` | 파싱 작업 |
| `ActionGet` | `get` | 변수 읽기 |
| `ActionSet` | `set` | 변수 설정 |
| `ActionDelete` | `delete` | 변수 삭제 |
| `ActionValidate` | `validate` | 검증 작업 |
| `ActionExpand` | `expand` | 변수 확장 |
| `ActionSecurity` | `security` | 보안 이벤트 |
| `ActionError` | `error` | 오류 이벤트 |
| `ActionFileAccess` | `file_access` | 파일 접근 |

---

## 커스텀 핸들러

### FullAuditLogger 인터페이스 구현

`FullAuditLogger`는 완전한 감사 로그 인터페이스로, 최소 인터페이스 `AuditLogger`(LogError 메서드만 포함)를 확장합니다:

```go
type FullAuditLogger interface {
    AuditLogger  // 최소 인터페이스 임베드(LogError)
    Log(action AuditAction, key, reason string, success bool) error
    LogWithFile(action AuditAction, key, file, reason string, success bool) error
    LogWithDuration(action AuditAction, key, reason string, success bool, duration time.Duration) error
    Close() error
}
```

### 예제: 데이터베이스 감사 핸들러

```go
package myhandler

import (
    "database/sql"
    "time"
    "github.com/cybergodev/env"
)

type DatabaseAuditHandler struct {
    db *sql.DB
}

func NewDatabaseAuditHandler(db *sql.DB) *DatabaseAuditHandler {
    return &DatabaseAuditHandler{db: db}
}

func (h *DatabaseAuditHandler) Log(action env.AuditAction, key, reason string, success bool) error {
    _, err := h.db.Exec(`
        INSERT INTO audit_log (timestamp, action, key, reason, success)
        VALUES (?, ?, ?, ?, ?)
    `, time.Now(), string(action), key, reason, success)
    return err
}

func (h *DatabaseAuditHandler) LogError(action env.AuditAction, key, errMsg string) error {
    return h.Log(action, key, errMsg, false)
}

func (h *DatabaseAuditHandler) LogWithFile(action env.AuditAction, key, file, reason string, success bool) error {
    _, err := h.db.Exec(`
        INSERT INTO audit_log (timestamp, action, key, file, reason, success)
        VALUES (?, ?, ?, ?, ?, ?)
    `, time.Now(), string(action), key, file, reason, success)
    return err
}

func (h *DatabaseAuditHandler) LogWithDuration(action env.AuditAction, key, reason string, success bool, duration time.Duration) error {
    _, err := h.db.Exec(`
        INSERT INTO audit_log (timestamp, action, key, reason, success, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?)
    `, time.Now(), string(action), key, reason, success, duration.Milliseconds())
    return err
}

func (h *DatabaseAuditHandler) Close() error {
    return nil
}
```

---

## 완전한 예제

### 프로덕션 환경 구성

```go
package main

import (
    "log"
    "os"
    "github.com/cybergodev/env"
)

func main() {
    // 감사 로그 파일 생성
    auditFile, err := os.OpenFile("/var/log/app/env-audit.log",
        os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
    if err != nil {
        log.Fatal(err)
    }
    defer auditFile.Close()

    // 구성
    cfg := env.ProductionConfig()
    cfg.AuditEnabled = true
    cfg.AuditHandler = env.NewJSONAuditHandler(auditFile)
    cfg.RequiredKeys = []string{"DB_HOST", "API_KEY"}

    // 로더 생성
    loader, err := env.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer loader.Close()

    // 구성 로드
    err = loader.LoadFiles(".env")
    if err != nil {
        log.Fatal(err)
    }

    // 검증
    err = loader.Validate()
    if err != nil {
        log.Fatal(err)
    }

    // 구성 사용
    log.Println("Configuration loaded successfully")
}
```

### 비동기 감사 처리

```go
package main

import (
    "encoding/json"
    "log"
    "os"
    "github.com/cybergodev/env"
)

func main() {
    // 감사 이벤트 채널 생성
    auditChan := make(chan env.AuditEvent, 1000)

    // 비동기 프로세서 시작
    go processAuditEvents(auditChan)

    // 구성
    cfg := env.ProductionConfig()
    cfg.AuditEnabled = true
    cfg.AuditHandler = env.NewChannelAuditHandler(auditChan)

    loader, _ := env.New(cfg)
    defer loader.Close()

    // 정상 사용...
}

func processAuditEvents(ch chan env.AuditEvent) {
    file, _ := os.OpenFile("/var/log/app/audit.log",
        os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
    defer file.Close()

    encoder := json.NewEncoder(file)

    for event := range ch {
        // 필터링, 집계 등 로직 추가 가능
        if event.Action == env.ActionError {
            log.Printf("Audit error: %+v", event)
        }

        encoder.Encode(event)
    }
}
```

---

## 보안 주의사항

### 감사 기록과 마스크

감사 로그는 민감 키의 `key` 필드를 자동으로 마스크합니다(기본적으로 `[MASKED:N chars]`로 표시, N은 키 이름 문자 수; 비민감 키는 원래대로 표시). **쓰기 작업만 감사 이벤트를 기록합니다**: `Set` / `Delete` / `LoadFiles` 등이 `ActionSet` / `ActionDelete` / `ActionLoad` 등의 이벤트를 트리거하며, 이벤트에 마스크된 키 이름을 기록합니다.

읽기 작업은 감사를 생성하지 않습니다: `Get` / `GetString` / `GetInt` / `GetSecure` 등은 **정상적으로 읽을 때 감사 로그를 기록하지 않습니다**. `ActionGet` 이벤트는 `GetInt` / `GetBool` / `GetFloat64` 등의 타입 변환 **파싱 실패** 오류 경로에서만 트리거됩니다(`success=false`). 예를 들어:

```go
// 쓰기 작업: 감사 이벤트 기록(민감 키는 마스크 후 기록)
_ = loader.Set("API_KEY", "sk-1234567890")
// 감사 기록: {"action":"set","key":"[MASKED:7 chars]","success":true,"masked":true}

// 읽기 작업: 정상 읽기는 감사를 생성하지 않음
secret := loader.GetSecure("API_KEY") // 감사 로그 생성 안 함
_ = loader.GetInt("PORT")             // 파싱 성공, 감사 로그 생성 안 함
_ = loader.GetInt("API_KEY")          // 파싱 실패 시 ActionGet 이벤트 생성(success=false)
```

### 감사 로그 권한

```bash
# 감사 로그 파일 권한 설정
chmod 600 /var/log/app/env-audit.log

# 애플리케이션 사용자만 읽기/쓰기 가능하도록 보장
chown app:app /var/log/app/env-audit.log
```

### 로그 로테이션

logrotate로 감사 로그 관리를 권장합니다:

```bash
# /etc/logrotate.d/app-env-audit
/var/log/app/env-audit.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0600 app app
}
```

---

## 관련 문서

- [보안 개요](/ko/env/security/) - 보안 아키텍처와 핵심 기능
- [프로덕션 체크리스트](/ko/env/security/production-checklist) - 감사 구성 점검
- [인터페이스](/ko/env/api-reference/interfaces) - AuditLogger 인터페이스
- [컴포넌트 팩토리](/ko/env/api-reference/factory) - 감사 핸들러 팩토리
