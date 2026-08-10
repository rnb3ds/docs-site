---
sidebar_label: "설치"
title: "설치 - CyberGo DD | 환경 요구사항 및 통합"
description: "CyberGo DD 로그 라이브러리 설치 가이드. Go 버전 요구사항, go get 설치, Go Module 통합, CI/CD 구성 권장 사항 및 일반적인 설치 문제 해결 방법을 다루어 개발자가 DD 를 프로젝트에 빠르게 통합할 수 있도록 돕습니다."
sidebar_position: 1
---

# 설치

## 환경 요구사항

| 요구사항 | 버전 |
|----------|------|
| Go | ≥ 1.25 |
| 운영체제 | Linux / macOS / Windows |

:::tip 팁 Go 버전 안내
DD 는 Go 1.25 의 일부 기능을 사용합니다. 프로젝트에서 이전 버전의 Go 를 사용 중이라면 도구체인을 업그레이드하세요: `go env -w GOTOOLCHAIN=go1.25.0+auto`.
:::

## 빠른 설치

```bash
go get github.com/cybergodev/dd
```

## Go Module 통합

프로젝트 루트 디렉터리에서 실행:

```bash
# 모듈 초기화 (아직 go.mod 가 없는 경우)
go mod init your-project

# DD 의존성 추가
go get github.com/cybergodev/dd
```

패키지 임포트:

```go
import "github.com/cybergodev/dd"
```

설치 확인:

```go
package main

import "github.com/cybergodev/dd"

func main() {
    dd.Info("DD 설치 성공!")
}
```

## 버전 관리

### 버전 지정

```bash
# 특정 버전 설치
go get github.com/cybergodev/dd@v1.0.0

# 최신 버전으로 업그레이드
go get github.com/cybergodev/dd@latest
```

### 의존성 관리

```bash
# 의존성 정리 (사용하지 않는 의존성 제거, 누락된 의존성 추가)
go mod tidy

# 현재 의존성 버전 확인
go list -m github.com/cybergodev/dd
```

## CI/CD 통합

GitHub Actions 에서 DD 사용:

```yaml
steps:
  - uses: actions/setup-go@v5
    with:
      go-version: '1.25'
  - uses: actions/checkout@v4
  - run: go mod download
  - run: go build ./...
```

:::warning 경고 프라이빗 저장소
DD 가 프라이빗 Git 서버에 호스팅된 경우 GOPRIVATE 환경 변수를 설정하세요:

```bash
go env -w GOPRIVATE=github.com/cybergodev/*
```
:::

## 자주 묻는 질문

### `go get` 실행 시 `module not found` 오류

Go 버전이 ≥ 1.25 인지 확인하고 네트워크 프록시 설정을 점검하세요:

```bash
go env -w GOPROXY=https://proxy.golang.org,direct
```

### 컴파일 시 `undefined: dd.xxx` 오류

`go mod tidy` 를 실행하여 의존성을 동기화한 후 다시 빌드하세요.

## 다음 단계

- [빠른 시작](./) -- 5 분 입문 가이드
- [글로벌 Logger](./global-logger) -- 패키지 수준 편의 함수 사용 패턴
- [핵심 개념](../guides/basics/core-concepts) -- DD 아키텍처 이해
