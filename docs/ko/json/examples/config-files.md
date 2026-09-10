---
sidebar_label: "설정 파일 처리"
title: "설정 파일 처리 - CyberGo JSON | 로드, 수정, 병합"
description: "CyberGo JSON 설정 파일 실전: LoadFromFile 로드, GetString/GetInt 중첩 값 읽기, Set/SetCreate 수정, SaveToFile 과 PrettyConfig 포맷팅 저장, MergeJSON 기본값과 사용자 설정 병합 및 재로드 검증."
sidebar_position: 3
---

# 설정 파일 처리

이 문서는 CyberGo JSON으로 전형적인 설정 파일 시나리오를 처리하는 방법을 보여줍니다: 로드, 중첩 값 읽기, 수정, 저장, 기본 설정과 사용자 설정 병합.

## 설정 파일 전체 수명 주기

설정 로드 → 중첩 값 읽기 → 수정 → 파일에 저장 → 재로드하여 검증. 예제는 단독으로 실행되도록 임시 파일을 사용합니다.

```go
package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/cybergodev/json"
)

func main() {
	// 임시 디렉터리를 사용하여 예제가 단독 실행되도록 보장
	tmpDir, err := os.MkdirTemp("", "cybergo-config-*")
	if err != nil {
		panic(err)
	}
	defer os.RemoveAll(tmpDir)

	configPath := filepath.Join(tmpDir, "config.json")

	// 초기 설정 파일 작성
	initial := `{
        "server": {"host": "0.0.0.0", "port": 8080},
        "database": {"host": "localhost", "port": 5432, "name": "appdb"},
        "logging": {"level": "info"}
    }`
	if err := os.WriteFile(configPath, []byte(initial), 0644); err != nil {
		panic(err)
	}

	// 1. 파일에서 설정 로드
	data, err := json.LoadFromFile(configPath)
	if err != nil {
		panic(err)
	}

	// 2. 중첩 값 읽기 (선택적 기본값 인수 지원)
	fmt.Printf("서버: %s:%d\n", json.GetString(data, "server.host"), json.GetInt(data, "server.port"))
	fmt.Printf("데이터베이스: %s/%s\n", json.GetString(data, "database.host"), json.GetString(data, "database.name"))
	fmt.Printf("로그 레벨: %s\n", json.GetString(data, "logging.level", "info"))

	// 3. 설정 수정 (기존 값 업데이트)
	data, err = json.Set(data, "server.port", 9090)
	if err != nil {
		panic(err)
	}
	data, err = json.Set(data, "logging.level", "debug")
	if err != nil {
		panic(err)
	}

	// 4. 파일에 다시 저장 (보기 좋게 출력)
	if err := json.SaveToFile(configPath, data, json.PrettyConfig()); err != nil {
		panic(err)
	}

	// 5. 재로드하여 변경 사항이 유지되었는지 검증
	reloaded, err := json.LoadFromFile(configPath)
	if err != nil {
		panic(err)
	}
	fmt.Printf("재시작 후 포트: %d\n", json.GetInt(reloaded, "server.port"))
	fmt.Printf("재시작 후 로그: %s\n", json.GetString(reloaded, "logging.level"))
}
```

## 기본 설정과 사용자 설정 병합

실제 애플리케이션에서는 사용자 설정을 내장 기본값 위에 덮어쓴 뒤, 누락된 중첩 경로를 채우는 경우가 많습니다. `MergeJSON`은 **깊은 병합**을 수행하고(사용자 값이 우선), `SetCreate`는 아직 존재하지 않는 중간 경로를 자동으로 생성합니다.

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	// 내장 기본 설정
	defaults := `{
        "server": {"host": "0.0.0.0", "port": 8080, "timeout": 30},
        "database": {"host": "localhost", "port": 5432, "pool": 10},
        "logging": {"level": "info", "format": "json"}
    }`

	// 사용자 설정 (일부 필드 덮어쓰기)
	userConfig := `{
        "server": {"port": 3000},
        "database": {"host": "db.prod.example.com"},
        "logging": {"level": "debug"}
    }`

	// 깊은 병합: 사용자 설정이 기본값을 덮어쓰고, 덮어쓰지 않은 기본 필드는 유지
	merged, err := json.MergeJSON(defaults, userConfig)
	if err != nil {
		panic(err)
	}
	fmt.Printf("포트: %d (사용자 덮어쓰기)\n", json.GetInt(merged, "server.port"))
	fmt.Printf("타임아웃: %d (기본값 유지)\n", json.GetInt(merged, "server.timeout"))
	fmt.Printf("데이터베이스: %s:%d\n", json.GetString(merged, "database.host"), json.GetInt(merged, "database.port"))

	// SetCreate로 아직 존재하지 않는 중첩 경로 추가 (중간 객체 자동 생성)
	merged, err = json.SetCreate(merged, "features.metrics.enabled", true)
	if err != nil {
		panic(err)
	}
	merged, err = json.SetCreate(merged, "features.metrics.endpoint", "/metrics")
	if err != nil {
		panic(err)
	}

	fmt.Printf("메트릭 활성화: %v\n", json.GetBool(merged, "features.metrics.enabled"))
	fmt.Printf("메트릭 엔드포인트: %s\n", json.GetString(merged, "features.metrics.endpoint"))
}

// 출력:
// 포트: 3000 (사용자 덮어쓰기)
// 타임아웃: 30 (기본값 유지)
// 데이터베이스: db.prod.example.com:5432
// 메트릭 활성화: true
// 메트릭 엔드포인트: /metrics
```

:::tip 팁
`MergeJSON`은 깊은 재귀 병합을 수행합니다: 객체 키는 계층별로 병합되고, 배열과 스칼라 값은 직접 교체됩니다. 여러 설정 소스를 한 번에 병합하려면 `MergeMany([]string{...})`을 사용하세요.
:::

## 병합 모드 선택: MergeUnion / MergeIntersection / MergeDifference

`Config.MergeMode` 가 병합 전략을 제어하며 기본값은 `MergeUnion` (합집합, 사용자 값이 기본값을 덮어씀) 입니다. 나머지 두 모드는 서로 다른 설정 관리 문제에 사용됩니다:

| 모드 | 의미 | 전형적인 설정 시나리오 |
|------|------|--------------|
| `MergeUnion` (기본값) | 두 객체의 전체 집합을 취하고, 충돌 시 사용자 값 우선 | 일반적인 설정 덧붙이기: 기본값 바탕 + 사용자 덮어쓰기 |
| `MergeIntersection` | 양쪽에 공통으로 있는 키만 유지 (값은 사용자 쪽) | '사용자가 실제로 어떤 공유 설정을 고쳤는지' 추출; 다중 환경 설정의 공통분모 도출 |
| `MergeDifference` | 기준 쪽 (첫 번째 인수) 에만 있는 키만 유지 | '여전히 기본값을 사용하는 설정 항목' 찾기, 감사나 설정 문서 생성에 활용 |

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	// 이전 섹션과 동일한 기본/사용자 설정
	defaults := `{
        "server": {"host": "0.0.0.0", "port": 8080, "timeout": 30},
        "database": {"host": "localhost", "port": 5432, "pool": 10},
        "logging": {"level": "info", "format": "json"}
    }`
	user := `{
        "server": {"port": 3000},
        "database": {"host": "db.prod.example.com"},
        "logging": {"level": "debug"}
    }`

	// 교집합: 양쪽에 모두 있는 키만 유지 (중첩 객체는 재귀적으로 교집합, 스칼라는 사용자 값)
	interCfg := json.DefaultConfig()
	interCfg.MergeMode = json.MergeIntersection
	overridden, err := json.MergeJSON(defaults, user, interCfg)
	if err != nil {
		panic(err)
	}
	fmt.Println("[교집합] 사용자가 덮어쓴 포트:", json.GetInt(overridden, "server.port"))
	fmt.Println("[교집합] 사용자가 덮어쓴 DB 호스트:", json.GetString(overridden, "database.host"))
	// 출력:
	// [교집합] 사용자가 덮어쓴 포트: 3000
	// [교집합] 사용자가 덮어쓴 DB 호스트: db.prod.example.com

	// 차집합: 기본 설정 중 사용자가 덮어쓰지 않은 키만 유지
	diffCfg := json.DefaultConfig()
	diffCfg.MergeMode = json.MergeDifference
	untouched, err := json.MergeJSON(defaults, user, diffCfg)
	if err != nil {
		panic(err)
	}
	fmt.Println("[차집합] 여전히 기본값인 호스트:", json.GetString(untouched, "server.host"))
	fmt.Println("[차집합] 여전히 기본값인 타임아웃:", json.GetInt(untouched, "server.timeout"))
	fmt.Println("[차집합] 여전히 기본값인 커넥션 풀:", json.GetInt(untouched, "database.pool"))
	// 출력:
	// [차집합] 여전히 기본값인 호스트: 0.0.0.0
	// [차집합] 여전히 기본값인 타임아웃: 30
	// [차집합] 여전히 기본값인 커넥션 풀: 10
}
```

:::tip 팁
`MergeMany` 도 동일하게 `cfg.MergeMode` 를 읽습니다 (왼쪽에서 오른쪽으로 하나씩 병합). 합집합 모드의 전체 효과는 이전 섹션을 참조하세요; 기본이 아닌 두 모드는 모두 '첫 번째 인수를 기준'으로 하는 관점입니다: 교집합은 '무엇이 바뀌었는가', 차집합은 '무엇이 아직 안 바뀌었는가'에 답합니다.
:::

## 다음 단계

- [기본 예제](./index) — 경로 쿼리, 수정, 구조체 인코딩 기본
- [치트시트](../getting-started/cheatsheet) — 빠른 API 참조
- [경로 문법](../getting-started/path-syntax) — 전체 경로 문법 (슬라이스, 와일드카드)
- [보조 함수](../api-reference/helpers) — `MergeJSON`, `CompareJSON` 등 유틸리티
