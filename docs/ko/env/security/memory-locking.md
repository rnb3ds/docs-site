---
sidebar_label: "메모리 잠금"
title: "메모리 잠금 - CyberGo env | mlock 메모리 보호"
description: "CyberGo env 메모리 잠금 가이드로, SetMemoryLockEnabled 활성화, IsMemoryLockSupported 감지, SetMemoryLockStrict 모드와 NewSecureValueStrict 오류 처리를 상세히 설명하며, Linux CAP_IPC_LOCK, Windows VirtualLock 권한 및 SecureValue 수명 주기 관리를 다룹니다."
sidebar_position: 3
---

# 메모리 잠금

메모리 잠금(mlock / VirtualLock)은 민감 데이터가 디스크로 스왑되는 것을 방지하며, SecureValue 보안 체계의 핵심 방어선 중 하나입니다.

## 메모리 잠금이 필요한 이유

정상적인 경우, 운영 체제는 비활성 메모리 페이지를 디스크(swap file / page file)로 스왑합니다. 이는 코드에서 `ClearBytes`로 메모리를 제로화하더라도, 디스크에 민감 데이터의 잔여 복사본이 남을 수 있음을 의미합니다.

```
메모리 (RAM)                      디스크 (Swap/Page File)
┌──────────────┐                ┌──────────────┐
│ API_KEY=xxx  │ ── 스왑 ──→    │ API_KEY=xxx  │ ← 잔류!
│              │                │ (제로화 후에도  │
│              │ ←─ 다시 읽기 ─     │  여전히 존재)  │
└──────────────┘                └──────────────┘
```

메모리 잠금을 활성화하면, 운영 체제는 이 메모리 페이지가 **스왑 아웃되지 않음**을 보장합니다:

```
메모리 (RAM)                      디스크 (Swap/Page File)
┌──────────────┐                ┌──────────────┐
│ API_KEY=xxx  │ ╳ 스왑 불가 ╳   │              │
│ 🔒 mlock     │                │ (잔류 없음)    │
└──────────────┘                └──────────────┘
```

## 플랫폼 지원

| 플랫폼 | 시스템 호출 | 지원 상태 |
|------|----------|:--------:|
| Linux | `mlock(2)` / `munlock(2)` | ✅ |
| macOS | `mlock(2)` / `munlock(2)` | ✅ |
| FreeBSD | `mlock(2)` / `munlock(2)` | ✅ |
| Windows | `VirtualLock` / `VirtualUnlock` | ✅ |
| wasm/nacl | 해당 없음 | ❌ |

런타임 감지:

```go
if env.IsMemoryLockSupported() {
    fmt.Println("현재 플랫폼은 메모리 잠금을 지원합니다")
} else {
    fmt.Println("현재 플랫폼은 메모리 잠금을 지원하지 않습니다(예: wasm)")
}
```

## 권한 요구사항

메모리 잠금은 시스템 리소스 제한과 관련이 있으며, 플랫폼마다 서로 다른 권한이 필요합니다:

### Linux

`CAP_IPC_LOCK` 능력이 필요합니다:

```bash
# 방식 1: setcap으로 바이너리 파일에 부여
sudo setcap cap_ipc_lock=ep ./myapp

# 방식 2: systemd 서비스를 통해
# /etc/systemd/system/myapp.service
[Service]
CapabilityBoundingSet=CAP_IPC_LOCK
AmbientCapabilities=CAP_IPC_LOCK

# 방식 3: ulimit 조정(RLIMIT_MEMLOCK)
# /etc/security/limits.conf
*    soft    memlock    unlimited
*    hard    memlock    unlimited
```

### macOS / FreeBSD

일반적으로 특별한 권한이 필요하지 않지만, `ulimit -l`(최대 잠금 메모리) 제한을 받습니다.

### Windows

`SeLockMemoryPrivilege` 권한이 필요합니다:

```
그룹 정책 → 컴퓨터 구성 → Windows 설정 → 보안 설정 →
로컬 정책 → 사용자 권한 할당 → "메모리에서 페이지 잠금"
```

:::warning 권한 없을 때의 동작
기본 모드에서 메모리 잠금 실패는 **조용히 무시됩니다** - SecureValue는 여전히 사용할 수 있지만 데이터가 잠기지 않습니다. 잠금 성공을 보장하려면 엄격 모드를 사용하세요.
:::

## 기본 사용법

### 메모리 잠금 활성화

애플리케이션 시작 시, 어떤 SecureValue를 생성하기 전에 호출합니다:

```go
package main

import (
    "fmt"
    "github.com/cybergodev/env"
)

func main() {
    // 플랫폼 지원 확인
    if !env.IsMemoryLockSupported() {
        fmt.Println("경고: 현재 플랫폼은 메모리 잠금을 지원하지 않습니다")
    }

    // 전역 메모리 잠금 활성화
    env.SetMemoryLockEnabled(true)

    // 구성 로드
    if err := env.Load(".env"); err != nil {
        panic(err)
    }

    // 이후 모든 SecureValue가 메모리 잠금 시도
    secret := env.GetSecure("API_KEY")
    if secret != nil {
        defer secret.Release()
        fmt.Println(secret.Masked()) // [SECURE:32 bytes locked]
    }
}
```

### 잠금 상태 확인

```go
sv := env.GetSecure("DB_PASSWORD")
defer sv.Release()

// 잠금 여부 확인
if sv.IsMemoryLocked() {
    fmt.Println("메모리가 잠겨 디스크로 스왑되지 않습니다")
} else {
    fmt.Println("메모리가 잠기지 않음")
}

// 잠금 오류 보기(있는 경우)
if err := sv.MemoryLockError(); err != nil {
    fmt.Printf("잠금 실패: %v\n", err)
}
```

## 엄격 모드

기본 모드에서 잠금 실패는 조용히 무시됩니다. 엄격 모드는 실패를 관측 가능하게 만듭니다:

### 엄격 모드 활성화

```go
env.SetMemoryLockEnabled(true)
env.SetMemoryLockStrict(true)

// 이후 잠금이 실패하면 표준 로그로 출력:
// env: memory lock failed in strict mode: operation not permitted
```

### 명시적 오류 처리

`NewSecureValueStrict`를 사용하여 생성 시 잠금 오류를 가져옵니다:

```go
env.SetMemoryLockEnabled(true)
env.SetMemoryLockStrict(true)

sv, err := env.NewSecureValueStrict("my-api-key")
if err != nil {
    // 메모리 잠금 실패
    // SecureValue는 여전히 유효하지만 데이터가 잠금 보호를 받지 못함
    log.Printf("보안 경고: 메모리 잠금 실패: %v", err)
}
defer sv.Release()

// 정상 사용
fmt.Println(sv.Masked())
```

:::tip 엄격 모드 동작
엄격 모드에서 잠금 실패는 `onStrictLockFailure` 콜백을 트리거합니다(기본적으로 stderr로 출력). SecureValue 자체는 항상 유효하고 사용 가능합니다 - 엄격 모드는 단지 잠금 실패를 **관측 가능**하게 만들 뿐, 사용을 막지 않습니다.
:::

## Masked 출력과 잠금 상태

`Masked()` 메서드는 출력에 잠금 상태 정보를 포함합니다:

```go
env.SetMemoryLockEnabled(true)

sv := env.GetSecure("API_KEY")
defer sv.Release()

fmt.Println(sv.Masked())
// 잠금 성공:   [SECURE:32 bytes locked]
// 잠금 실패:   [SECURE:32 bytes lock-failed]
// 잠금 미활성화: [SECURE:32 bytes]
// 닫힘:        [CLOSED]
```

## 완전한 프로덕션 예제

```go
package main

import (
    "log"
    "os"

    "github.com/cybergodev/env"
)

func main() {
    // ── 보안 구성 초기화 ──

    if env.IsMemoryLockSupported() {
        env.SetMemoryLockEnabled(true)
        env.SetMemoryLockStrict(true) // 프로덕션 환경에서 엄격 모드 활성화
        log.Println("메모리 잠금 활성화됨(엄격 모드)")
    } else {
        log.Println("경고: 플랫폼이 메모리 잠금을 지원하지 않음")
    }

    // ── 구성 로드 ──

    cfg := env.ProductionConfig()
    cfg.RequiredKeys = []string{"DB_PASSWORD", "API_KEY"}
    cfg.AutoApply = true

    loader, err := env.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer loader.Close()

    if err := loader.LoadFiles(".env"); err != nil {
        log.Fatal(err)
    }

    // ── 민감 값에 안전하게 접근 ──

    dbPassword := loader.GetSecure("DB_PASSWORD")
    if dbPassword == nil {
        log.Fatal("DB_PASSWORD not found")
    }
    defer dbPassword.Release()

    // 잠금 상태 확인
    if !dbPassword.IsMemoryLocked() {
        log.Printf("보안 경고: DB_PASSWORD가 잠기지 않음")
        if err := dbPassword.MemoryLockError(); err != nil {
            log.Printf("원인: %v", err)
        }
    }

    // 필요한 경우에만 평문 가져오기
    password := dbPassword.Reveal()
    _ = password // 데이터베이스 연결 등에 사용

    // 안전한 로그(평문 유출 없음)
    log.Printf("데이터베이스 비밀번호: %s", dbPassword.Masked())
    // 출력: 데이터베이스 비밀번호: [SECURE:12 bytes locked]

    _ = os.Stdout
}
```

## 모범 사례

### 적시 해제

잠긴 메모리는 메모리 압력을 증가시키며(스왑 아웃 불가), 사용 완료 후 즉시 해제해야 합니다:

```go
// ✅ 권장: 사용 후 즉시 해제
sv := env.GetSecure("API_KEY")
defer sv.Release()
value := sv.Reveal()
// value 사용...
// defer 트리거 시 자동 제로화 + 잠금 해제 + 객체 풀 반환

// ❌ 회피: 장시간 보유
var globalSecret *env.SecureValue // 비권장
```

### 작고 일시적으로 유지

대규모 메모리 잠금은 시스템 성능에 영향을 줍니다. 각 SecureValue는 전체 구성 블록이 아닌 필요한 민감 값(비밀번호, 키, 토큰)만 저장해야 합니다.

### Close보다 Release 우선 사용

```go
sv := env.GetSecure("TOKEN")

// ✅ Release: 제로화 + 잠금 해제 + 객체 풀 반환(권장)
defer sv.Release()

// Close도 가능하지만 객체 풀에 반환하지 않음
// defer sv.Close()
```

## 문제 해결

| 문제 | 가능한 원인 | 해결 방안 |
|------|----------|----------|
| Masked 출력에 `lock-failed` | 권한 부족 | `CAP_IPC_LOCK`(Linux) 또는 `SeLockMemoryPrivilege`(Windows) 구성 |
| 엄격 모드 로그 폭주 | 대량의 SecureValue 생성 시 잠금 실패 | 시스템 `RLIMIT_MEMLOCK` 제한 확인 또는 비엄격 모드 사용 |
| `IsMemoryLockSupported()`가 false 반환 | wasm/nacl 플랫폼 | 이 플랫폼들은 메모리 잠금을 지원하지 않으며, 다른 보안 조치 사용(예: 암호화 저장) |
| 메모리 사용량 증가 | 잠긴 페이지는 스왑 아웃 불가 | SecureValue 보유 시간 단축, 적시에 Release |

## 관련 문서

- [보안 개요](/ko/env/security/) - 보안 아키텍처 총관
- [SecureValue API](/ko/env/api-reference/secure-value) - 보안 값 완전한 API(메모리 잠금 함수 포함)
- [성능](/ko/env/advanced/performance) - 메모리 잠금 성능 오버헤드 분석
- [프로덕션 체크리스트](/ko/env/security/production-checklist) - 프로덕션 적용 전 보안 점검
