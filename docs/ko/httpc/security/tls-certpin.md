---
sidebar_label: "TLS와 인증서 고정"
title: "TLS와 인증서 고정 - CyberGo HTTPC | 암호화와 인증서 고정"
description: "HTTPC TLS와 인증서 고정 가이드: TLS 1.2-1.3 버전 제어, SPKI 해시 생성 단계와 키 순환, 세 가지 Pinner 생성자 비교, 커스텀 CertificatePinner, mTLS 상호 인증, 커스텀 CA 인증서와 Let's Encrypt 단기 인증서 고정 전략."
sidebar_position: 3
---

# TLS와 인증서 고정

## TLS 버전 제어

HTTPC는 기본적으로 TLS 1.2+를 요구하며, 안전하지 않음이 입증된 TLS 1.0/1.1을 거부합니다. 더 강력한 전방 비밀성과 더 간단한 핸드셰이크를 위해 TLS 1.3을 권장합니다:

```go
cfg := httpc.DefaultConfig()
cfg.Security.MinTLSVersion = tls.VersionTLS12  // 기본값
cfg.Security.MaxTLSVersion = tls.VersionTLS13  // 기본값
```

### 버전 설명

| 버전 | 상태 | HTTPC 기본값 |
|------|------|-------------|
| TLS 1.0 | 안전하지 않음, 폐기됨(POODLE/BEAST) | 거부 |
| TLS 1.1 | 안전하지 않음, 폐기됨 | 거부 |
| TLS 1.2 | 안전함 | 최소 요구사항 |
| TLS 1.3 | 가장 안전함, 권장(전방 비밀성 강제) | 지원 |

:::tip
TLS 1.3만 강제하려면(더 높은 보안, 더 간단한 핸드셰이크) `MinTLSVersion = tls.VersionTLS13`을 설정하면 됩니다. 단, 일부 구형 클라이언트/프록시는 TLS 1.3을 지원하지 않을 수 있으므로 활성화 전에 대상 서비스 호환성을 확인하세요.
:::

:::warning
`Security.TLSConfig`를 설정하면 `MinTLSVersion`과 `MaxTLSVersion`은 **무시되며**, `TLSConfig`의 설정이 우선합니다. 커스텀 `TLSConfig`에서 버전을 제어하려면 `TLSConfig.MinVersion` / `MaxVersion`을 설정하세요.
:::

## 암호 제품군

기본 구성은 안전한 암호 제품군만 허용합니다(전방 비밀성을 강제하는 ECDHE 계열, AEAD 암호화):

| 암호 제품군 | 설명 |
|------------|------|
| `TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256` | 권장 |
| `TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384` | 권장 |
| `TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305` | 권장 |
| `TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256` | 권장 |
| `TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384` | 권장 |
| `TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305` | 권장 |

TLS 1.3의 암호 제품군은 프로토콜에 의해 자동 협상되며, `CipherSuites` 필드로 제어되지 않습니다.

## 커스텀 TLS 구성

세밀한 제어(커스텀 CA, mTLS, 고정 암호 제품군)가 필요할 때 `Security.TLSConfig`를 설정합니다:

```go
cfg := httpc.DefaultConfig()
cfg.Security.TLSConfig = &tls.Config{
    MinVersion: tls.VersionTLS13,  // TLS 1.3 강제
    // 기타 커스텀 구성
}
```

### 커스텀 CA 인증서

내부 CA가 서명한 서비스(기업 내부 PKI, 자체 서명 인증서)에 연결할 때, 커스텀 루트 인증서를 로드합니다:

```go
package main

import (
    "crypto/tls"
    "crypto/x509"
    "log"
    "os"

    "github.com/cybergodev/httpc"
)

func main() {
    caCert, err := os.ReadFile("custom-ca.pem")
    if err != nil {
        log.Fatal(err)
    }
    caCertPool := x509.NewCertPool()
    if !caCertPool.AppendCertsFromPEM(caCert) {
        log.Fatal("CA 인증서를 파싱할 수 없음")
    }

    cfg := httpc.DefaultConfig()
    cfg.Security.TLSConfig = &tls.Config{
        RootCAs:    caCertPool,
        MinVersion: tls.VersionTLS12,
    }

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer func() { _ = client.Close() }()
    log.Println("커스텀 CA 클라이언트 준비 완료")
}
```

### 상호 TLS(mTLS)

서버가 클라이언트 인증서를 요구하는 경우(mTLS), `Certificates` 필드를 구성합니다:

```go
package main

import (
    "crypto/tls"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    cert, err := tls.LoadX509KeyPair("client-cert.pem", "client-key.pem")
    if err != nil {
        log.Fatal(err)
    }

    cfg := httpc.DefaultConfig()
    cfg.Security.TLSConfig = &tls.Config{
        Certificates: []tls.Certificate{cert},
        MinVersion:   tls.VersionTLS12,
    }

    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer func() { _ = client.Close() }()
    log.Println("mTLS 클라이언트 준비 완료")
}
```

:::tip
mTLS는 제로 트러스트 네트워크, 서비스 메시 내부 인증, 금융 API에 자주 사용됩니다. 서버는 클라이언트 인증서로 호출자 신원을 식별하며, 추가 token이 불필요합니다. 인증서 순환 시 `client-cert.pem` / `client-key.pem`을 동기화하여 업데이트해야 합니다.
:::

## 인증서 고정

인증서 고정(Certificate Pinning)은 표준 인증서 체인 검증 **위에** 검증 계층을 추가합니다: 서버 인증서 체인에 알려진 고정 공개키/인증서가 존재해야 합니다. 신뢰할 수 있는 CA가 침해되거나 위조 인증서 발급을 강요받더라도, 공격자는 여전히 중간자 공격을 할 수 없습니다 — 그 인증서의 공개키가 고정값과 일치하지 않기 때문입니다.

### 작동 원리

표준 TLS 검증: 클라이언트는 신뢰할 수 있는 CA가 서명한 모든 인증서를 신뢰합니다. 인증서 고정: 클라이언트는 추가로 인증서의 공개키 해시가 사전 저장된 값과 일치해야 합니다.

```
표준 검증:  CA 신뢰 → CA가 서명한 모든 인증서 신뢰
인증서 고정: CA 신뢰 + 인증서 공개키가 사전 저장된 해시와 일치해야 함
```

고정은 표준 검증 위에 추가되며, `InsecureSkipVerify`를 설정할 필요가 없습니다. HTTPC는 인증서 체인의 **임의의 계층** 인증서를 검증하므로, 중간 인증서를 고정하면 리프 인증서 갱신 후에도 계속 유효합니다.

### SPKI 해시 생성 단계

SPKI(SubjectPublicKeyInfo) 해시는 가장 일반적으로 사용되는 고정 형식(HPKP 표준)입니다. 생성 단계:

**단계 1**: 서버 인증서 획득(브라우저에서 내보내기, 또는 openssl로 획득)

```bash
# 서버에서 인증서 체인 획득
openssl s_client -connect example.com:443 -showcerts < /dev/null 2>/dev/null \
  | openssl x509 -outform pem > cert.pem
```

**단계 2**: 인증서에서 공개키 추출 → DER 인코딩 → SHA-256 → base64

```bash
openssl x509 -in cert.pem -pubkey -noout | \
  openssl pkey -pubin -outform der | \
  openssl dgst -sha256 -binary | \
  openssl enc -base64
# 출력: YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2fuihg=
```

3단계 분해:

| 단계 | 명령 조각 | 역할 |
|------|-----------|------|
| 공개키 추출 | `openssl x509 -pubkey -noout` | X.509 인증서에서 PEM 형식 공개키 추출 |
| DER 인코딩 | `openssl pkey -pubin -outform der` | PEM 공개키를 DER(PKIX) 형식으로 변환 |
| 해시 인코딩 | `openssl dgst -sha256 -binary \| openssl enc -base64` | SHA-256 후 base64 인코딩 |

:::tip
리프 인증서가 아닌 **중간 인증서**의 SPKI 고정을 권장합니다. 중간 인증서는 유효 기간이 길고(보통 5-10년), 리프 인증서 갱신(Let's Encrypt 90일 등) 시에도 중간 인증서는 변경되지 않아 고정값을 자주 업데이트할 필요가 없습니다.
:::

### SPKI 해시 고정(권장)

`NewSPKIHashPinner`는 하나 이상의 base64 인코딩 SHA-256 SPKI 해시를 받습니다. 여러 해시를 제공하면 키 순환을 지원합니다 — 어느 하나라도 일치하면 통과:

```go
package main

import (
    "crypto/tls"
    "log"

    "github.com/cybergodev/httpc"
)

func main() {
    pinner, err := httpc.NewSPKIHashPinner(
        "YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2fuihg=", // 현재 중간 인증서
        "C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=", // 백업(키 순환)
    )
    if err != nil {
        log.Fatal(err)
    }

    cfg := httpc.DefaultConfig()
    cfg.Security.MinTLSVersion = tls.VersionTLS12
    cfg.Security.CertificatePinner = pinner
    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer func() { _ = client.Close() }()
    log.Println("인증서 고정 클라이언트 준비 완료")
}
```

`NewSPKIHashPinner`는 해시가 비어있거나 합법적인 base64가 아닐 때 오류를 반환하여, 시작 시점에 구성 문제를 노출합니다. 검증 로직: 서버 인증서 체인의 각 계층 인증서를 순회하며 SPKI의 SHA-256을 계산하고, 어느 하나의 고정 해시와 일치하면 통과입니다.

:::tip
`CertificatePinner`는 표준 TLS 체인 검증 **위에** 고정 검증을 추가하며, `InsecureSkipVerify`를 설정할 필요가 없습니다. 검증은 인증서 체인의 임의 계층 인증서에 적용되므로, 중간 인증서를 고정하면 리프 인증서 갱신 후에도 계속 유효합니다.
:::

### 세 가지 Pinner 생성자 비교

HTTPC는 세 가지 Pinner 생성자를 제공하며, 적용 시나리오가 다릅니다:

| 생성자 | 입력 | 적용 시나리오 | 권장도 |
|--------|------|---------------|--------|
| `NewSPKIHashPinner` | base64 SHA-256 SPKI 해시 | 가장 일반적(HPKP 형식) | 권장 |
| `NewPublicKeyPinner` | DER 인코딩 PKIX 공개키 | 원시 공개키 바이트를 이미 보유 | 편의 |
| `NewCertificatePinnerChain` | 여러 Pinner | 다중 전략 조합/혼합 순환 키 | 고급 |

```go
// 1. SPKI 해시(권장, 가장 일반적)
spkiPinner, err := httpc.NewSPKIHashPinner(
    "YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2fuihg=",
)

// 2. DER 공개키(이미 원시 공개키 바이트 보유, 내부에서 SHA-256 계산)
pubPinner, err := httpc.NewPublicKeyPinner(pubKeyDER1, pubKeyDER2)

// 3. 여러 pinner 조합, 어느 하나라도 통과하면 수락(혼합 전략 또는 다른 생성자의 순환 키)
chainPinner := httpc.NewCertificatePinnerChain(spkiPinner, pubPinner)
cfg.Security.CertificatePinner = chainPinner
```

`NewCertificatePinnerChain`은 인수가 없을 때 "모두 거부" Pinner를 반환하여(안전한 기본값), 구성 누락이 "모두 허용"으로 조용히 통과되지 않도록 합니다.

### 커스텀 CertificatePinner

고급 시나리오에서 커스텀 고정 전략이 필요한 경우(예: 공개키가 아닌 전체 인증서 고정, 구성 센터에서 동적으로 고정값 가져오기), `CertificatePinner` 인터페이스를 직접 구현할 수 있습니다:

```go
package main

import (
    "crypto/sha256"
    "crypto/tls"
    "crypto/x509"
    "encoding/base64"
    "errors"
    "log"

    "github.com/cybergodev/httpc"
)

// fullCertPinner은 공개키 SPKI가 아닌 전체 인증서의 SHA-256을 고정합니다.
type fullCertPinner struct {
    pinnedHashes map[string]bool
}

func newFullCertPinner(hashes ...string) *fullCertPinner {
    m := make(map[string]bool, len(hashes))
    for _, h := range hashes {
        m[h] = true
    }
    return &fullCertPinner{pinnedHashes: m}
}

// Pin은 CertificatePinner 인터페이스를 구현하며, 고정값의 설명을 반환(로그/디버그용).
func (p *fullCertPinner) Pin() string {
    return "full-cert-pinner"
}

// VerifyPeerCertificate은 CertificatePinner 인터페이스를 구현합니다.
// nil 반환은 수락, nil이 아닌 반환은 핸드셰이크 거부를 의미합니다.
func (p *fullCertPinner) VerifyPeerCertificate(rawCerts [][]byte, verifiedChains [][]*x509.Certificate) error {
    if len(verifiedChains) == 0 || len(verifiedChains[0]) == 0 {
        return errors.New("certificate pinning failed: empty chain")
    }
    for _, cert := range verifiedChains[0] {
        sum := sha256.Sum256(cert.Raw)
        hash := base64.StdEncoding.EncodeToString(sum[:])
        if p.pinnedHashes[hash] {
            return nil // 일치, 수락
        }
    }
    return errors.New("certificate pinning failed: no matching certificate")
}

func main() {
    // 전체 리프 인증서의 SHA-256 고정(인증서 갱신 후 이 값을 업데이트해야 함)
    pinner := newFullCertPinner(
        "wert6uY/PCq3yAAbZA/wtqfzfQsTwmxnfv6I3vRz1XQ=", // 인증서 Raw의 SHA-256
    )

    cfg := httpc.DefaultConfig()
    cfg.Security.TLSConfig = &tls.Config{MinVersion: tls.VersionTLS12}
    cfg.Security.CertificatePinner = pinner
    client, err := httpc.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer func() { _ = client.Close() }()
    log.Println("커스텀 인증서 고정 클라이언트 준비 완료")
}
```

:::warning
커스텀 `CertificatePinner`를 구현할 때, 표준 인증서 체인 검증(`verifiedChains`)이 통과한 기반 위에 고정 검증을 추가해야 합니다. 절대 표준 검증을 대체하는 데 사용하지 마세요 — 항상 `InsecureSkipVerify = false`를 유지하세요.
:::

## 다중 해시와 키 순환

`NewSPKIHashPinner`와 `NewPublicKeyPinner`는 모두 여러 값을 받으며, 어느 하나라도 일치하면 통과입니다. 이것이 키 순환의 핵심입니다: 신구 공개키를 동시에 고정하여 순환 기간 동안 신구 인증서 모두 통과할 수 있으며, 중단 없는 전환이 가능합니다.

순환 흐름:

1. 서버가 새 키 쌍을 생성하고 새 인증서를 서명
2. 클라이언트가 고정값을 업데이트, **신구 해시를 모두 유지**:
   ```go
   pinner, _ := httpc.NewSPKIHashPinner(
       "OLD_HASH...", // 이전 키(순환 기간 동안 유지)
       "NEW_HASH...", // 새 키(곧 활성화)
   )
   ```
3. 클라이언트 배포, 신구 인증서 모두 통과 확인
4. 서버가 새 인증서로 전환
5. 일정 기간 문제 없음을 관찰한 후, 고정값에서 이전 해시 제거

:::danger
인증서 고정 실패(고정값 불일치)는 연결을 완전히 실패하게 하며, 자동 복복할 수 없습니다. 반드시:
- **항상 최소 하나의 백업 고정값 유지**, 주 키의 예기치 않은 손상 방지
- 순환은 "먼저 새로 추가, 나중에 이전 삭제"의 이중 윈도우 전략 사용
- 모니터링 구축, 고정 실패 시 클라이언트 구성을 빠르게 롤백
:::

## 인증서 고정과 Let's Encrypt

Let's Encrypt 인증서는 유효 기간이 90일로 잦은 갱신이 필요합니다. 리프 인증서를 직접 고정하면 90일마다 고정값을 업데이트해야 하어 유지보수 비용이 높습니다. 권장 전략:

| 고정 대상 | 유효 기간 | 갱신 영향 | 권장도 |
|-----------|-----------|-----------|--------|
| 리프 인증서 | 90일 | 매 갱신마다 고정값 업데이트 필요 | 낮음 |
| Let's Encrypt 중간 인증서 | 약 5년 | 중간 인증서 순환(수년에 한 번) 시에만 업데이트 필요 | 권장 |
| 귀하의 도메인 공개키(자체 호스팅 시) | 직접 제어 | 직접 키 순환 시에만 업데이트 | 상황에 따라 |

Let's Encrypt의 중간 인증서(예: R3, R10, R11)는 유효 기간이 수년이며, 중간 인증서 SPKI를 고정하면 보안과 낮은 유지보수 비용을 겸할 수 있습니다. Let's Encrypt는 중간 인증서를 순환할 때 미리 공지하므로 여유 있게 고정값을 업데이트할 수 있습니다.

```go
// Let's Encrypt 중간 인증서 고정(권장)
pinner, err := httpc.NewSPKIHashPinner(
    "YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2fuihg=", // 현재 중간 인증서
    "C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=", // 백업/다음 순환 중간 인증서
)
```

:::tip
Let's Encrypt의 중간 인증서 공개키는 순환 시 보통 변경되지 않습니다(새 인증서만 서명, 공개키 재사용). 공개키 SPKI를 고정하는 것이 전체 중간 인증서를 고정하는 것보다 더 안정적입니다 — 공개키가 변경되지 않으면 SPKI 해시도 변경되지 않습니다.
:::

## 인증서 고정의 보안 고려사항

| 위험 | 결과 | 완화 조치 |
|------|------|-----------|
| 고정값 만료/불일치 | 연결 완전 실패 | 다중 해시 + 백업 키 + 모니터링 |
| 백업 키 분실 | 순환 불가, 잠금 | 오프라인 백업 여러 키 쌍 |
| 고정값 하드코딩 | 업데이트 시 출시 필요 | 구성 센터 동적 로드(커스텀 Pinner) |
| 단일 계층만 고정 | 단일 장애점 | 다층 고정(리프 + 중간) |

:::warning
인증서 고정은 "양날의 검"입니다: MITM/CA 침해에 대한 방어를 크게 향상시키지만, 고정 실패 시 하드 장애를 유발합니다. 도입 전 다음을 확인하세요:
1. 신뢰할 수 있는 고정값 업데이트 및 배포 메커니즘
2. 고정 실패율 모니터링, 알림 설정
3. 비상용 "고정 비활성화" 스위치 유지(보안성은 낮아짐)
:::

### 고정 전략 비교

| 전략 | 보안성 | 유지보수 비용 | 권장 시나리오 |
|------|--------|-------------|---------------|
| 루트 인증서 고정 | 낮음 | 낮음 | 변조 방지만, CA 범위가 너무 넓음 |
| 중간 인증서 고정 | 중간 | 중간 | **권장**, 보안과 유지보수 균형 |
| 리프 인증서 고정 | 높음 | 높음 | 고보안, 인증서 제어 가능 시나리오 |
| 다중 계층 고정 | 높음 | 중간 | 최적, 다층 중복 |

## InsecureSkipVerify

`InsecureSkipVerify`는 전체 TLS 인증서 체인 검증을 건너뛰며, 테스트 전용입니다:

```go
// 테스트 전용!
cfg := httpc.TestingConfig()
// InsecureSkipVerify = true → TLS 인증서 검증 건너뛰기
```

HTTPC는 `httpc.New()`에서 `InsecureSkipVerify = true`를 감지하고 비테스트 환경일 때 `stderr`에 경고를 출력합니다(프로세스당 한 번). 테스트 환경 판정: 실행 파일이 `.test`로 끝나거나, `GO_TEST` / `GOTEST=1` 환경변수가 설정됨.

:::danger
`InsecureSkipVerify = true`는 모든 TLS 보안 조치를 무력화합니다(인증서 고정도 무효), 테스트 환경에서만 사용하세요. 프로덕션 환경에서는 절대 `true`로 설정하지 마세요. 커스텀 검증 로직이 필요한 경우(예: 전체 인증서 고정), 검증을 건너뛰지 말고 `CertificatePinner` 인터페이스를 구현해야 합니다.
:::

## HTTP/2

HTTP/2는 기본적으로 활성화되며, TLS 사용 시(h2 via ALPN)에만 사용 가능합니다:

```go
cfg := httpc.DefaultConfig()
cfg.Connection.EnableHTTP2 = false // HTTP/2 비활성화(HTTP/1.1만)
```

:::tip
인증서 고정 또는 커스텀 `TLSConfig` 활성화 시, HTTP/2의 ALPN 협상은 정상적으로 작동합니다. HTTP/2를 비활성화해야 하는 경우(예: 디버깅 또는 구형 프록시 호환성) `EnableHTTP2 = false`를 설정하세요.
:::

## 모범 사례

1. 기본 TLS 구성 사용(TLS 1.2+), 수동 설정 불필요
2. 인증서 고정 시 **중간 인증서** SPKI를 고정하고 백업 고정값 준비
3. 다중 해시로 키 순환 지원, "먼저 새로 추가, 나중에 이전 삭제" 전략 사용
4. 정기적으로 고정값을 업데이트하고 서버 인증서 갱신과 동기화
5. `SecureConfig()`를 보안 기준선으로 사용
6. 프로덕션 환경에서 절대 `InsecureSkipVerify` 설정하지 않기
7. 고보안 시나리오에서는 다층 인증서 고정(리프 + 중간), 중복 증가

## 다음 단계

- [SSRF 방어](./ssrf) - SSRF 보안 구성
- [보안 개요](./) - 보안 기능 총람
- [구성 API](../api-reference/client-config/config) - SecurityConfig 참조
