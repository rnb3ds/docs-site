---
sidebar_label: "전역 Logger"
title: "전역 Logger - CyberGo DD | 기본 Logger 사용 가이드"
description: "CyberGo DD 전역 Logger 패턴: Default() 지연 초기화, SetDefault() 교체, InitDefault() 에러 처리, 그리고 패키지 수준 함수 dd.Info()와 인스턴스 메서드 logger.Info() 중 선택하는 방법."
sidebar_position: 3
---

# 전역 Logger

DD는 프로세스 수준의 전역 Logger를 제공합니다. 모든 **패키지 수준 편의 함수**(`dd.Info()`, `dd.Errorf()` 등)는 이 Logger에 위임합니다. 이것은 가장 단순한 사용 모드로, 설정 없이 바로 로깅을 시작할 수 있습니다.

## 두 가지 사용 모드 비교

| 모드 | 코드 예시 | 사용 사례 |
|------|-------------|----------|
| **전역 Logger** | `dd.Info("hello")` | 스크립트, 소규모 프로젝트, 빠른 프로토타이핑 |
| **인스턴스 Logger** | `logger, _ := dd.New(cfg); logger.Info("hello")` | 커스텀 Config, 다중 Logger 인스턴스, DI |

전역 Logger는 본질적으로 `sync.Once`로 보호되는 싱글톤 `*Logger`이며, 최초 접근 시 자동으로 생성됩니다.

## 패키지 수준 편의 함수

모든 표준 로깅 메서드는 전역 Logger에서 작동하는 패키지 수준 대응 함수를 가집니다:

```go
package main

import "github.com/cybergodev/dd"

func main() {
    // 기본 로깅
    dd.Debug("debug info")
    dd.Info("service started")
    dd.Warn("high memory usage")
    dd.Error("request failed")
    // dd.Fatal("fatal error")  // ⚠️ os.Exit(1)을 호출합니다

    // 포맷팅
    dd.Infof("user %s logged in", username)

    // 구조화된 로깅
    dd.InfoWith("request completed",
        dd.String("method", "GET"),
        dd.Int("status", 200),
    )

    // Field 체이닝
    dd.WithFields(dd.String("service", "api")).
        Info("service ready")

    // 레벨 제어
    dd.SetLevel(dd.LevelDebug)
    if dd.IsDebugEnabled() {
        dd.Debug("debug enabled")
    }
}
```

:::tip 팁 모든 패키지 수준 함수
기본(`Debug/Info/Warn/Error/Fatal`), 포맷팅(`Debugf/Infof/...`), 구조화(`DebugWith/InfoWith/...`), 제네릭 레벨(`Log/Logf/LogWith`), Field 체이닝(`WithFields/WithField`), 레벨 조회(`IsLevelEnabled/IsDebugEnabled/...`), 샘플링(`SetSampling/GetSampling`), Writer 관리(`AddWriter/RemoveWriter/WriterCount`), 라이프사이클(`Flush`).
:::

## 전역 Logger 초기화

### Default(): 지연 초기화

`dd.Default()`는 전역 Logger를 반환하며, 최초 호출 시 `DefaultConfig()`로 생성됩니다:

```go
// 최초 호출 → 자동 생성 (sync.Once가 스레드 안전성 보장)
logger := dd.Default()
logger.Info("hello") // dd.Info("hello")와 동일
```

### InitDefault(): 커스텀 Configuration

시작 시 커스텀 설정으로 전역 Logger를 초기화합니다:

```go
package main

import (
    "log"

    "github.com/cybergodev/dd"
)

func main() {
    cfg := dd.DefaultConfig()
    cfg.Level = dd.LevelDebug
    cfg.Format = dd.FormatJSON

    if err := dd.InitDefault(cfg); err != nil {
        log.Fatalf("failed to init logger: %v", err)
    }

    // 이제 모든 패키지 수준 함수가 이 설정을 사용합니다
    dd.Info("global Logger initialized")
}
```

:::warning 경고 InitDefault는 기존 인스턴스를 교체합니다
전역 Logger가 이미 존재하는 경우(예: `Default()`에 의해 자동 생성된 경우), `InitDefault()`는 **기존 인스턴스를 닫고** 교체합니다. 기존 인스턴스는 진행 중인 쓰기가 완료될 수 있도록 100ms 지연 후 백그라운드 goroutine에서 닫힙니다.
:::

### SetDefault(): 직접 교체

이미 생성된 Logger 인스턴스로 전역 Logger를 교체합니다:

```go
logger, _ := dd.New(dd.DevelopmentConfig())
dd.SetDefault(logger)

// 패키지 수준 함수가 이제 새 Logger를 사용합니다
dd.Info("using custom Logger")
```

## 에러 처리

전역 Logger 초기화가 실패하면 stderr 출력으로 폴백합니다(패닉이 발생하지 않음). 다음으로 초기화 상태를 확인하십시오:

```go
logger := dd.Default()

if err := dd.DefaultInitError(); err != nil {
    // Logger가 폴백 모드(stderr 출력)로 실행 중입니다
    log.Printf("warning: global Logger init failed: %v", err)
}

// 또는 Logger와 에러를 동시에 획득
logger, err := dd.DefaultWithErr()
if err != nil {
    log.Printf("fallback mode: %v", err)
}
```

## 인스턴스 Logger와 함께 사용하기

전역 Logger와 인스턴스 Logger는 공존할 수 있습니다. 일반적인 패턴은 `main`에서 전역 Logger를 초기화하면서 DI를 위해 인터페이스를 사용하는 것입니다:

```go
// main.go
func main() {
    cfg := dd.DefaultConfig()
    cfg.Format = dd.FormatJSON
    _ = dd.InitDefault(cfg)
    defer dd.Flush()
}

// service.go — 테스트 가능성을 위해 인터페이스 사용
type Service struct {
    logger dd.LogProvider // 인터페이스, 목 가능
}

func NewService(logger dd.LogProvider) *Service {
    return &Service{logger: logger}
}

// 전역 Logger로 Service 생성
svc := NewService(dd.Default())
```

:::tip 팁 DI 권장 인터페이스
`dd.LogProvider`는 의존성 주입을 위한 가장 완전한 로깅 인터페이스입니다. 더 간결한 인터페이스: `dd.CoreLogger`(로깅 메서드만), `dd.LevelLogger`(+ 레벨 관리), `dd.ConfigurableLogger`(+ Config 및 라이프사이클). [인터페이스](../api-reference/core/interfaces)를 참조하십시오.
:::

## 다음 단계

- [Configuration](../guides/basics/configuration) -- 전체 Config Field 참조
- [치트 시트](./cheatsheet) -- 일반적인 API 빠른 참조
- [인터페이스](../api-reference/core/interfaces) -- Logger 인터페이스 계층
