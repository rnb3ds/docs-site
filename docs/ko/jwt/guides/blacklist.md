---
sidebar_label: "토큰 블랙리스트"
title: "토큰 블랙리스트 - CyberGo JWT | 폐기와 외부 저장소"
description: "토큰 블랙리스트 가이드: 내장 메모리 저장소 설정과 만료 정리, Revoke 와 IsRevoked 로 토큰 폐기, BlacklistStore 인터페이스로 Redis 등 외부 저장소 연동, 다중 인스턴스 배포 모범 사례를 안내합니다."
sidebar_position: 30
---

# 토큰 블랙리스트

블랙리스트는 토큰이 만료되기 전에 능동적으로 무효화하는 데 사용됩니다. 사용자 로그아웃, 비밀번호 변경, 권한 변경 등의 시나리오에 적합합니다.

## 작동 방식

```text
Revoke(token) → jti + exp 추출 → BlacklistStore 에 기록
Validate(token) → 서명 검증 → 블랙리스트 확인 → 결과 반환
```

`Revoke`는 전달된 문자열을 단순히 블랙리스트에 기록하는 것이 아니라, 먼저 **보안 검증 체인**을 실행하여 실제로 발급된 토큰만 폐기되도록 합니다:

1. **서명 검증** — 프로세서에 설정된 키로 토큰 서명을 재검증하여, 변조되거나 위조된 토큰을 거부
2. **발급자 및 수신자 확인** — `iss`, `aud`가 프로세서 설정과 일치하는지 검사하여 교차 도메인 오폐기 방지
3. **jti 추출** — 토큰 고유 ID(`jti`)를 블랙리스트 키로 사용; 토큰에 `jti`가 없으면 `ErrTokenMissingID` 반환
4. **TTL 계산 및 저장소 기록** — 토큰 `exp`에서 항목存活 시간을 산출(아래 섹션 참조), jti를 `BlacklistStore`에 기록

:::tip 서명 검증은 핵심 보안 설계
왜 `Revoke`가 먼저 서명을 검증한 후 폐기할까요? 만약 호출자가 전달한 `jti`를 직접 신뢰한다면, 악의적인 호출자가 위조된 `jti`로 **임의의 합법적인 사용자의 토큰**을 블랙리스트에 올려 서비스 거부 공격을 할 수 있습니다. 강제 서명 검증은 "실제 토큰을 보유한 사람만 폐기할 수 있음"을 보장합니다 — 이는 `Revoke` 호출 시 반드시 전체 토큰 문자열을 전달해야 하며, bare `jti`가 아니어야 함을 의미합니다.
:::

`Revoke`와 `IsRevoked`는 **모두 `exp`/`nbf`를 확인하지 않습니다**: 토큰이 만료되었더라도 여전히 폐기하거나 폐기 상태를 조회할 수 있습니다. 이는 감사, 사후 보상 폐기 등의 시나리오가 과거 토큰을 다룰 수 있도록 설계된 것입니다.

## 블랙리스트 항목 TTL

블랙리스트 항목은 영구적으로 존재하지 않습니다. `Revoke`는 기록 시 토큰의 `exp`를 기준으로 항목의存活 시간(TTL)을 계산하며, 토큰이 만료되면 항목도 함께 무효화되어 정리됩니다. 세 가지 경우는 다음과 같습니다:

- **토큰에 `exp` 클레임이 있음** — TTL은 `exp`에 해당하는 남은 시간이며, 항목은 토큰과 동기적으로 무효화됩니다. 이는 가장 일반적인 상황입니다.
- **토큰에 `exp` 클레임이 없음** — TTL은 기본 **7일**이며, 만료 없는 토큰이 항목을 영구적으로 점유하는 것을 방지합니다.
- **TTL 상한은 30일** — 토큰의 `exp`가 100년 후라도, 블랙리스트 항목은 최대 30일만存活할 수 있습니다.

:::warning 30일 상한은 DoS 방호
30일 상한은 중요한 방어선입니다. 상한이 없다면, 공격자가 초장기 `exp`의 토큰(또는 합법적인 장수 토큰을 악용)을 대량으로 폐기하여 블랙리스트 저장소를 가득 채우고 메모리를 고갈시킬 수 있습니다. 30일 상한이 있으면 모든 단일 레코드의存活 시간에 상한이 있어 저장소 규모가 항상 제어 가능합니다.
:::

또한 **이미 만료된 토큰도 폐기할 수 있습니다**: `Revoke`가 `exp`/`nbf`를 확인하지 않으므로, 토큰 만료 후에도 보충 폐기할 수 있습니다 (예: 사후 감사에서 위험 발견). 이러한 항목의 TTL은 기본 7일이며, 이후 백그라운드 정리 메커니즘이 회수합니다.

## 내장 메모리 저장소

기본적으로 메모리 저장소를 사용하며, 설정 없이 바로 사용할 수 있습니다:

```go
cfg := jwt.DefaultConfig()
cfg.SecretKey = "hmac-key-that-has-at-least-32-bytes!"
// 블랙리스트가 자동으로 활성화되며, DefaultBlacklistConfig() 사용
```

### 설정 항목

```go
cfg.Blacklist.CleanupInterval = 5 * time.Minute  // 정리 간격
cfg.Blacklist.MaxSize = 100000                     // 최대 항목 수
cfg.Blacklist.EnableAutoCleanup = true             // 자동 정리
```

| 필드 | 기본값 | 설명 |
|------|--------|------|
| `CleanupInterval` | `5m` | 만료 항목 정리 간격 |
| `MaxSize` | `100000` | 최대 항목 수 |
| `EnableAutoCleanup` | `true` | 자동 정리 (항상 true 로 강제) |

:::tip 자동 정리
내장 저장소의 `EnableAutoCleanup`은 항상 `true`로 강제되어 메모리 무한 증가를 방지합니다.
:::

### 축출 동작

항목 수가 `MaxSize`에 도달하면, 새 항목 기록 시 **축출**이 트리거되어 다음 순서로 공간을 확보합니다:

| 단계 | 동작 | 설명 |
|------|------|------|
| 1 | 만료 항목 정리 | 먼저 모든 만료된 레코드 삭제 |
| 2 | 가장 빨리 만료되는 항목 축출 | 여전히 가득 찬 경우, `exp` 오름차순으로 약 10% (최소 1개)의 가장 빨리 만료되는 항목 축출 |
| 3 | 기록 거부 | 여전히 가득 찬 경우, `Add`가 오류 반환, `Revoke`는 이에 따라 실패 반환 |

`MaxSize`는 "가득 차면 정지"가 아니라, 압력 하에서 가장 먼저 사라져야 할 항목(만료된 것, 가장 빨리 만료되는 것)을 우선淘汰합니다. 하지만 극단적 상황에서는 여전히 폐기가 실패할 수 있습니다 — 따라서 프로덕션 환경에서는 피크 폐기량에 따라 `MaxSize`를 늘리거나 외부 저장소를 사용하는 것을 권장합니다.

## 토큰 폐기

```go
// 폐기
err := processor.Revoke(accessToken)
if err != nil {
    panic(err)
}

// 확인
revoked, err := processor.IsRevoked(accessToken)
fmt.Println("Revoked:", revoked) // true

// 폐기된 토큰은 검증에 실패함
_, _, err = processor.Validate(accessToken)
// err → jwt.ErrTokenRevoked
```

## 커스텀 저장소 백엔드

[`BlacklistStore`](../api-reference/interfaces#blackliststore) 인터페이스를 구현하여 외부 저장소 (Redis, 데이터베이스 등) 에 연결:

```go
type BlacklistStore interface {
    Add(tokenID string, expiresAt time.Time) error
    Contains(tokenID string) (bool, error)
    Close() error
}
```

### Redis 예제

```go
type RedisStore struct {
    client *redis.Client
}

func (s *RedisStore) Add(tokenID string, expiresAt time.Time) error {
    ttl := time.Until(expiresAt)
    if ttl <= 0 {
        return nil // 이미 만료된 토큰은 저장할 필요 없음
    }
    return s.client.Set(ctx, "blacklist:"+tokenID, "1", ttl).Err()
}

func (s *RedisStore) Contains(tokenID string) (bool, error) {
    n, err := s.client.Exists(ctx, "blacklist:"+tokenID).Result()
    return n > 0, err
}

func (s *RedisStore) Close() error {
    return s.client.Close()
}
```

커스텀 저장소 사용:

```go
cfg.Blacklist.Store = &RedisStore{client: rdb}
```

:::tip TTL 최적화
`time.Until(expiresAt)`를 Redis TTL 로 사용하면 토큰이 만료된 후 블랙리스트에서 자동으로 제거되어 추가 정리가 필요 없습니다.
:::

### Close()의 책임

`Processor.Close()`는 종료 시 `BlacklistStore.Close()`를 **연쇄 호출**합니다 — 블랙리스트 저장소를 수동으로 닫을 필요 없이 프로세서를 닫기만 하면 됩니다. 커스텀 저장소의 `Close()` 구현은 모든 기저 리소스를 해제해야 합니다:

- Redis / 데이터베이스 연결 닫기
- 백그라운드 goroutine과 ticker 중지
- 파일 핸들 등 해제

위 Redis 예제의 `s.client.Close()`는 연결 풀 정리를 수행합니다. `Close()`는 **멱등**이어야 합니다 — 반복 호출 시 오류를 반환하지 않아야 합니다 (내장 저장소 구현은 이미 이 약속을 따르며, 두 번째 호출은 `nil`을 직접 반환).

:::tip 커스텀 저장소는 CleanupInterval / MaxSize 제약을 받지 않음
`BlacklistConfig`의 `CleanupInterval`, `MaxSize`, `EnableAutoCleanup`은 **내장 메모리 저장소에만 유효**합니다. `Store` 필드를 설정하여 커스텀 백엔드를 사용하면 이 세 필드는 완전히 무시됩니다 — 만료 정리, 용량 상한 등은 저장소 백엔드가 자체적으로 담당해야 합니다 (예: Redis의 TTL, 데이터베이스의 정기 작업).
:::

## 프로덕션 환경 권장 사항

:::warning 다중 인스턴스는 블랙리스트 공유 필수
내장 메모리 저장소는 **프로세스 간에 공유되지 않습니다**. 서비스를 여러 인스턴스(Pod / 컨테이너 / 서버)로 배포하면, 한 인스턴스에서 폐기한 토큰이 다른 인스턴스에서는 여전히 통과합니다 — 사용자가 로그아웃해도 다른 인스턴스에서는 여전히 로그인된 것으로 처리됩니다. 다중 인스턴스 시나리오에서는 반드시 Redis, 데이터베이스 등 **공유 저장소**를 `BlacklistStore`로 사용하여, 모든 인스턴스가 동일한 블랙리스트를 읽고 쓰도록 보장해야 합니다.
:::

:::tip 블랙리스트 규모 모니터링
블랙리스트는 항목이 TTL로 만료될 때까지 폐기 레코드를 지속적으로 축적합니다. 저장소 크기(메모리 저장소의 항목 수, Redis의 키 수)를 모니터링하고 비정상 증가에 대해 알림을 설정하는 것을 권장합니다 — 급증은 종종 대량 폐기(예: 보안 사건) 또는 TTL이 너무 김을 의미합니다. `MaxSize`를 피크 폐기량보다 약간 높게 설정하면 축출로 인한 폐기 실패를 방지할 수 있습니다.
:::

:::tip 짧은 TTL 토큰은 블랙리스트가 불필요할 수 있음
액세스 토큰 자체의 유효기간이 매우 짧은 경우(예: 15분), 사용자가 "로그아웃"할 때 토큰이 몇 분 후 자연 만료되므로, 보통 블랙리스트를 유지할 **가치가 없습니다** — 블랙리스트 비용(저장 + 매 검증마다 추가 쿼리)이 이익을 초과할 수 있습니다. 블랙리스트는 **장수 토큰**(장수 access token, refresh token)을 폐기하는 데 더 적합합니다. 짧은 TTL 시나리오에서는 refresh token에만 블랙리스트를 활성화하는 것을 고려할 수 있습니다.
:::

:::warning 기타 주의사항
- 커스텀 저장소 구현은 네트워크 타임아웃과 재시도를 처리하여, 외부 저장소 지터가 검증 체인을 차단하지 않도록 해야 합니다
- `MaxSize` 상한 도달 후, 새로 폐기된 토큰은 가장 오래된 항목을 축출합니다 (위 "내장 메모리 저장소" 참조)
:::

## 다음 단계

- [API 레퍼런스 → BlacklistStore](../api-reference/interfaces#blackliststore) — 인터페이스 정의
- [API 레퍼런스 → BlacklistConfig](../api-reference/config#blacklistconfig) — 설정 필드
- [API 레퍼런스 → Revoke](../api-reference/processor#revoke) — 폐기 메서드
- [고급 예제](../examples/advanced) — Redis 블랙리스트 예제
