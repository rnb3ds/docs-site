---
sidebar_label: "보안 개요"
title: "보안 개요 - CyberGo html | 보안 보호 총람"
description: "CyberGo html 보안 개요: 심층 방어 아키텍처로 입력 크기 제한, DOM 깊이 제한, 경로 순회 방지, 패닉 복구, 처리 타임아웃, 콘텐츠 정제, 플러그형 감사 파이프라인과 HighSecurityConfig 보안 프리셋을 다룹니다."
sidebar_position: 1
---

# 보안 개요

HTML 라이브러리는 인터넷의 신뢰할 수 없는 입력을 처리하므로, 설계 단계에서 보안을 최우선으로 고려했습니다. 라이브러리는 다층 독립 방어 메커니즘을 내장하여, **심층 방어** 철학을 따릅니다: 각 층은 다른 층이 실패할 수 있다고 가정하며, 단일 층이 우회되어도 전체가 붕괴하지 않습니다.

이 페이지는 보안 기능의 총괄입니다. 감사 파이프라인을 직접 구성하거나 런칭 체크리스트를 확인하고 싶다면, 끝의 [다음 단계](#다음-단계)로 건너뛰세요.

## 심층 방어 아키텍처

라이브러리의 보안 방어는 세 개의 독립적인 계층에 분산되어 있으며, 각 계층은 자체적인 실패 모드와 복구 전략을 가집니다:

```text
입력 계층 방어(필터링 전 거부)
├── MaxInputSize        바이트 수준 크기 상한(기본 50MB)
├── MaxDepth            DOM 중첩 깊이 상한(기본 500, 스택 오버플로 방지)
├── ProcessingTimeout   단일 문서 처리 타임아웃(기본 30s)
├── 경로 순회 감지       파일 경로의 .. 컴포넌트
└── AllowedBaseDir      파일 읽기 샌드박스(OS 핸들 해석, symlink/junction 방지)

처리 계층 방어(정제와 취소)
├── HTML 정제           태그 / 속성 / URL / CSS 다차원 필터링
├── 협력적 context 취소  ExtractWithContext 가 ctx.Done()에 응답
├── Panic 복구          recoverPanic 제네릭 래퍼, ErrInternalPanic 반환
└── Goroutine 누수 방지   maxTimeoutGoroutines(상한 1000)

감사 계층 방어(관측 + 격리)
├── AuditSink panic 격리 SEC-003(감사 하위 시스템은 best-effort)
├── 8종 감사 이벤트      blocked_tag/blocked_attr/blocked_url/...
└── 원본 값 HTML 이스케이프  감사 로그가 SIEM 대시보드에서 XSS 를 trigger 하는 것 방지
```

:::tip 왜 '독립'을 강조하는가
심층 방어의 가치는 계층 간 결합 가정이 없다는 데 있습니다. 예를 들어 정제 계층이 악의적인 URL 을 놓치더라도(처리 계층 실패), 입력 계층의 `MaxInputSize`가 여전히 초장 payload 를 차단합니다; AuditSink 자체가 panic 하더라도(감사 계층 실패), `recoverPanic`이 주 흐름의 붕괴를 보장하지 않습니다.
:::

## 입력 경계 방어

### 입력 크기 제한

기본 최대 입력 50MB(`DefaultMaxInputSize`), 메모리 고갈 공격을 방지합니다. 설정 상한은 동시에 `maxConfigInputSize`(마찬가지로 50MB)의 제약을 받으며, 설정으로 안전하지 않은 값으로 증폭할 수 없습니다:

```go
cfg := html.DefaultConfig()
cfg.MaxInputSize = 10 * 1024 * 1024 // 10MB 로 강화
```

파일 경로에는 **사전 검사**가 있습니다: `Stat`으로 크기를 가져온 후, `ReadAll`이 콘텐츠를 메모리에 로드하기 전에 초과 파일을 거부하여, '다 읽은 후 초과 발견'의 메모리 피크 윈도우를 차단합니다.

### DOM 깊이 제한

기본 최대 깊이 500(`DefaultMaxDepth`), 재귀 중첩으로 구성된 스택 오버플로 폭탄을 방지합니다:

```go
cfg.MaxDepth = 200 // 더 엄격하게
```

깊이 검증은 재귀가 아닌 **반복식** 순회를 사용하므로, 입력 중첩이 너무 깊어져 자체적으로 스택 오버플로가 발생하지 않습니다.

### 처리 타임아웃

구성 가능한 처리 타임아웃으로, 악의적인 HTML 이 지수적 처리 시간을 유발하는 것을 방지합니다:

```go
cfg.ProcessingTimeout = 10 * time.Second
```

타임아웃 메커니즘은 독립 goroutine + context deadline 로 구현되며, `maxTimeoutGoroutines`(1000) 상한의 보호를 받아 고동시성에서 goroutine 이 통제 불능 상태가 되는 것을 방지합니다. `ExtractWithContext`와 결합하여 호출자의 취소 신호를 추가할 수 있습니다.

## 콘텐츠 정제 메커니즘 상세

정제 기능은 `EnableSanitization`(기본 `true`)으로 제어되며, 파싱된 DOM 트리를 in-place 로 수정하여 잠재적으로 악의적인 콘텐츠를 제거합니다. 전체 흐름은 `internal/sanitize.go`로 구현되며, 각 단계의 차단은 감사 로그에 기록됩니다.

:::warning 정제를 언제 끄는가
입력이 **완전히 신뢰할 수 있는** 내부 데이터일 때만 `EnableSanitization = false`를 고려하세요. 사용자 업로드, 웹 페이지 크롤링, 서드파티 API 에서 온 HTML 을 처리할 때는 항상 켜두어야 합니다.
:::

### 제거되는 태그

다음 태그는 하위 트리와 함께 전체 제거됩니다:

| 태그 | 제거 사유 |
|------|----------|
| `<script>`, `<style>`, `<noscript>` | 스크립트와 스타일 컨테이너, 실행 가능한 코드나 숨겨진 payload |
| `<iframe>`, `<embed>`, `<object>` | 외부 콘텐츠 삽입, 전형적인 XSS 와 피싱 벡터 |
| `<input>`, `<button>` | 폼 컨트롤, CSRF 나 UI 위장에 사용 가능 |
| `<svg>` | JavaScript 와 이벤트 핸들러 내장 가능 |
| `<math>` | MathML, 일부 브라우저에서 스크립트 실행에 악용 가능 |

:::tip 왜 `<form>`은 제거되지 않나요
`<form>` 태그는 **의도적으로 보존**됩니다. ASP.NET WebForms, JSF, JSP 등 서버사이드 프레임워크는 전체 `<body>`를 단일 `<form>`으로 감쌉니다. `<form>`을 제거하면 페이지의 모든 가시적 콘텐츠가 함께 손실됩니다. 텍스트 추출 시나리오는 폼을 렌더링하거나 제출하지 않으므로, `<input>`/`<button>`에 해당하는 CSRF/UI 위장 사유는 `<form>` 컨테이너 자체에는 적용되지 않습니다.
:::

### 제거되는 속성

| 속성 분류 | 감지 방식 | 예시 |
|----------|----------|------|
| 이벤트 핸들러 | 접두사 매칭 `on*` | `onclick`, `onerror`, `onmouseover` |
| 폼 action 오버라이드 | 정확한 매칭 | `formaction`(폼 제출 대상 탈취 가능) |
| 자동 포커스 | 정확한 매칭 | `autofocus`(피싱 클릭 유도에 사용 가능) |

이벤트 핸들러 감지는 접두사 매칭(속성명이 `on`으로 시작)을 사용하므로, 고정 블랙리스트에 의존하지 않고 모든 현행 및 미래의 `on*` 변형을 커버합니다.

### CSS 위험 패턴

`style` 속성의 값은 다음 위험한 부분 문자열을 감지하며, 적중 시 **전체 style 이 제거**됩니다(안전한 CSS 속성을 메타데이터 추출용으로 보존하는 것은 별도 평가가 필요하며, 현재 전략은 위험 감지 시 전체 폐기입니다):

- `expression(` — 구버전 IE 동적 표현식
- `behavior:` — IE 동작 바인딩
- `-moz-binding:` — 구버전 Firefox XBL 바인딩
- `javascript:` — 프로토콜 인젝션
- `vbscript:` — 프로토콜 인젝션

### 검사 대상 URI 속성

다음 속성의 값은 [URL 보안 방어 심층](#url-보안-방어-심층) 파이프라인에 들어가 프로토콜과 data URL 검증을 수행합니다:

```text
href  src  cite  action  data  poster  background
longdesc  usemap  profile  xlink:href
```

:::tip 이미 완전히 차단된 속성은 중복 검사하지 않음
`formaction`은 '제거되는 속성'에서 이미 전체 차단되었으므로, URI 검증 파이프라인에 들어가지 않습니다 — 동일한 속성에 대한 중복 검사를 방지합니다.
:::

## URL 보안 방어 심층

URI 속성의 값은 `isSafeURIWithAudit`의 다층 파이프라인을 통해 검증됩니다. 각 층은 알려진 브라우저 파싱 동작이나 공격 우회 기법에 대응하며, 어느 하나도 빠뜨릴 수 없습니다.

### 다층 검증 파이프라인

```text
원본 URI
  │
  ├─ 1. NFC 정규화           전각/조합 문자 정규화
  ├─ 2. TrimSpace            선행/후행 공백 제거
  ├─ 3. C0 제어 문자+공백 제거   선행/후행 U+0000–U+001F 및 공백 제거
  ├─ 4. tab/LF/CR 제거       URL 내부의 \t \n \r 제거
  ├─ 5. ToLower              대소문자 정규화
  ├─ 6. 길이 상한             non-data URL 은 MaxURLLength(2000) 제약
  ├─ 7. 위험 프로토콜 감지      javascript: / vbscript: / file: + 전각 변형
  ├─ 8. 프로토콜 상대 URL 감지  //javascript: 등
  └─ 9. data URL 화이트리스트   이미지/폰트/PDF 만 허용, svg 및 빈 MIME 차단
```

### Unicode 정규화(NFC)

첫 단계에서 URI 에 NFC 정규화(`normalizeURIForSecurity`)를 수행하여, Unicode 변형으로 위험 프로토콜을 위장하는 것을 방지합니다:

- 전각 문자 `ｊａｖａｓｃｒｉｐｔ：`를 ASCII 로 매핑
- 조합 문자, cross-script 유사 문자를 단일 표현으로 정규화

이 위에 `isDangerousScheme`는 전각 라틴 문자(U+FF01–U+FF5E)에 대해 별도의 ASCII 폴딩(`normalizeFullwidthToASCII`)을 수행하여, 이중 보험을 제공합니다 — 일부 브라우저/파서가 전각 형식을 ASCII 로 처리하더라도 라이브러리가 인식할 수 있습니다.

### 공백과 제어 문자 제거

브라우저는 URL 을 파싱할 때 특정 제어 문자를 제거하며(WHATWG URL 표준 준수), 라이브러리는 프로토콜 감지 **이전**에 동일한 제거를 시뮬레이션해야 합니다. 그렇지 않으면 공격자가 이 문자들로 위험 프로토콜명을 분해하여 감지를 우회할 수 있습니다:

- **tab / LF / CR**: `java\tscript:`는 브라우저에 의해 `javascript:`로 재조립되어 실행됩니다. 라이브러리는 `stripURLWhitespace`로 프로토콜 감지 전에 이 세 바이트를 제거합니다.
- **C0 제어 문자(U+0000–U+001F) + ASCII 공백**: 브라우저는 scheme 파싱 전에 선행/후행의 이 바이트들을 제거합니다. `strings.TrimSpace`는 Unicode 공백만 커버하며 대부분의 C0 제어 문자는 커버하지 않으므로, 라이브러리는 전용 `c0ControlOrSpace` 집합으로 명시적으로 제거합니다. 그렇지 않으면 `\x01javascript:…`가 모든 `HasPrefix` 검사를 속일 수 있습니다.

### 위험 프로토콜 감지

| 프로토콜 | 차단 방식 |
|------|----------|
| `javascript:` | 직접 매칭 + 전각 문자 정규화 |
| `vbscript:` | 동일 |
| `file:` | 동일(로컬 파일 시스템 접근) |
| `//javascript:`, `//vbscript:`, `//data:`, `//file:` | 프로토콜 상대 형식 개별 감지 |

프로토콜 상대 형식(`//`로 시작)의 감지는 먼저 `//` 이후의 선행 공백을 제거한 후, 동일한 위험 프로토콜 판정을 적용하여 `// javascript:` 같은 변형이 우회되지 않도록 합니다.

### data URL 화이트리스트

data URL 은 다음 명시적으로 선언된 MIME 타입만 통과를 허용합니다:

| 분류 | 허용된 MIME 타입 |
|------|------------------|
| 이미지 | `image/gif`, `image/jpeg`, `image/jpg`, `image/png`, `image/webp`, `image/bmp`, `image/x-icon`, `image/vnd.microsoft.icon`, `image/avif`, `image/apng` |
| 폰트 | `font/woff`, `font/woff2`, `font/ttf`, `font/otf`, `application/font-woff`, `application/font-woff2` |
| 문서 | `application/pdf` |

명시적 차단:

- **`image/svg+xml`**: SVG 는 JavaScript 를 내장할 수 있으며, 태그 제거 후의 심층 방어 패치입니다.
- **빈 미디어 타입**: 예: `data:;base64,<payload>` 또는 `data:;,...`. 이 형식은 과거에 화이트리스트를 우회할 수 있었으나, 이제 직접 거부됩니다.
- **초장 data URL**: `MaxDataURILength`(100KB) 제약을 받으며, base64 대용량 콘텐츠로 인한 메모리 고갈을 방지합니다.
- **잘못된 base64 문자**: base64 부분은 바이트 단위로 문자셋 유효성을 검증합니다.

:::tip 감사 로그는 data URL 을 잘라냄
data URL 은 대량의 base64 를 포함할 수 있으며, 감사 로그에 전체를 기록하면 공간 낭비이자 내장된 민감 정보 유출 가능성이 있습니다. 감사 기록은 `truncateAuditURL`을 통해 256 문자로 잘라냅니다.
:::

### 정제기를 우회하는 경로

소수의 코드 경로(예: `ExtractAllLinks`, 원본 HTML 의 video/audio 스캔)는 **정제되지 않은** HTML 을 읽습니다. 이 경로들은 `containsDangerousScheme` 가드로 보호됩니다 — 이 가드는 정제기와 완전히 동일한 정규화 파이프라인(NFC, trim, C0 제거, tab/LF/CR 제거, 전각 폴딩)을 재사용하여, 두 경로가 **동일한 프로토콜 전략**을 실행함을 보장합니다. 정제기가 차단하는데 여기서는 허용하는 불일치가 발생하지 않습니다.

예를 들어 `javascript:alert(1).mp4` 같이 미디어 URL 로 위장한 payload 는 첫 문자 `j`가 알파벳이라 과거에는 간단한 검사를 통과할 수 있었으나, 이제 `containsDangerousScheme`에 의해 차단됩니다.

## AllowedBaseDir 샌드박스 메커니즘

`ExtractFromFile`로 신뢰할 수 없는 출처의 파일 경로를 처리할 때, `AllowedBaseDir`는 읽기 범위를 지정된 디렉토리 내로 제한합니다. 이 메커니즘은 `processor.go`의 `readContained` / `realPath` / `pathWithin`로 구현됩니다.

### OS 파일 핸들 해석이 필요한 이유

일반적인 `filepath.EvalSymlinks`는 Windows 디렉토리 junction 과 reparse points 를 해석할 수 **없습니다** — 이 둘은 아무 권한 없이 생성할 수 있으며, Windows 에서 경로 제한을 우회하는 주요 수단입니다. 라이브러리의 접근 방식은 다음과 같습니다:

1. `os.Open()`으로 대상 파일을 열어 OS 파일 핸들을 획득
2. `realPath(f)`로 **이미 열린 핸들**에서 실제 디스크 경로를 해석
3. `pathWithin(realBase, realTarget)`로 실제 경로가 허용된 디렉토리 내에 있는지 판정
4. **동일한 검증된 핸들**에서 `io.ReadAll`로 콘텐츠 읽기

동일한 핸들로 검증과 읽기를 수행하여, TOCTOU(check-time-to-use-time) 경쟁 윈도우를 차단합니다 — 검증 후, 읽기 전에 경로가 심볼릭 링크로 교체되어도 결과에 영향을 줄 수 없습니다. 읽는 것은 당초 검증한 inode 이기 때문입니다.

### 크로스 플랫폼 실제 경로 해석

| 플랫폼 | 해석 방식 | 커버하는 리다이렉트 유형 |
|------|----------|------------------|
| Linux | `/proc/self/fd/<fd>`의 link 읽기 | 심볼릭 링크(race-free) |
| macOS / BSD | `/dev/fd/<fd>`의 link 읽기 | 심볼릭 링크(race-free) |
| 기타 Unix | `filepath.EvalSymlinks` 폴백 | 심볼릭 링크(경미한 TOCTOU 잔존) |
| Windows | `GetFinalPathNameByHandleW` | 심볼릭 링크 + junction + 모든 reparse points |

Windows 경로는 반환 후 `\\?\` 확장 길이 접두사를 제거하고 `Clean`을 수행하여, `filepath.Abs`의 출력 형식과 일치시키고 후속 포함 비교의 정확성을 보장합니다.

### 방어 계층

`AllowedBaseDir` 모드의 파일 읽기는 네 가지 독립적인 검사가 중첩됩니다:

1. **경로 순회 감지**: `filepath.Clean` 후 `..` 컴포넌트 포함 여부 검사
2. **OS 핸들 샌드박스**: `realPath`로 실제 경로 해석, `pathWithin`으로 포함 관계 판정
3. **크기 사전 검사**: 검증된 핸들에서 `Stat`으로 크기 검사, `MaxInputSize` 초과 시 `ReadAll` 전에 거부
4. **바이트 수준 상한**: 읽기 후에도 `validateInput`이 바이트 수를 재검사

파일이 허용된 디렉토리 내에 있더라도, `AllowedBaseDir`가 제약하는 것은 '어떤 파일을 읽을 수 있는가'이며, `MaxInputSize`가 제약하는 것은 '파일이 얼마나 클 수 있는가'입니다. 두 개는 직교하며 상호 대체 불가능합니다.

:::warning AllowedBaseDir 를 비워두면 = 샌드박스 미활성화
`AllowedBaseDir`는 기본값이 빈 문자열이며, **디렉토리 제한 없음**을 의미합니다(`..` 순회 감지만 유지). 파일 경로가 사용자 입력에서 온다면 반드시 명시적으로 설정해야 합니다.
:::

### 설정 예시

```go
cfg := html.DefaultConfig()
// /var/app/uploads 및 그 하위 디렉토리의 파일만 읽기 허용
cfg.AllowedBaseDir = "/var/app/uploads"

p, err := html.New(cfg)
if err != nil {
    log.Fatal(err)
}
defer p.Close()

// 정상: 파일이 허용된 디렉토리 내에 있음
result, err := p.ExtractFromFile("/var/app/uploads/page.html")

// 거부됨: symlink/junction 을 통해 외부를 가리킴
_, err = p.ExtractFromFile("/var/app/uploads/escape.txt") // 이것이 junction → /etc 인 경우
```

차단된 경계 위반 접근은 `AuditEventPathTraversal` 감사 이벤트를 기록하고, 「path outside allowed directory」로 래핑된 `*FileError`를 반환합니다. 오류에는 해석된 실제 경로가 **포함되지 않습니다**(파일 시스템 레이아웃 유출 방지).

## 패닉 복구와 격리

모든 공개 추출 메서드는 `recoverPanic[T]` 제네릭 함수로 래핑되며, panic 은 감지되어 `ErrInternalPanic` 오류로 변환되어 반환됩니다. 악의적인 입력이 호출자 프로세스를 붕괴시키지 않도록 보장합니다.

```go
func recoverPanic[T any](fn func() (T, error)) (result T, err error) {
    defer func() {
        if r := recover(); r != nil {
            err = fmt.Errorf("%w: %v", ErrInternalPanic, r)
        }
    }()
    return fn()
}
```

### 다층 격리 경계

| 격리 경계 | 동작 | 위치 |
|----------|------|------|
| 단일 추출 | panic → `ErrInternalPanic` | `extract.go` `recoverPanic` |
| 배치 추출 단일 항목 | 각 항목 독립 recover, 한 항목의 panic 이 다른 항목에 영향 없음 | `batch.go` |
| 타임아웃 goroutine | `withTimeout`의 worker goroutine 이 독립 recover | `extract.go` |
| AuditSink 쓰기 | sink 자체의 panic 은 무시됨(SEC-003) | `audit.go` `Record` |
| AuditSink 닫기 | sink.Close panic 은 `ErrInternalPanic`으로 변환되어 error 로 반환 | `audit.go` `Close` |
| 풀링된 Processor 생성 | `sync.Pool.New` panic → `ErrInternalPanic` | `processor_pool.go` |

### SEC-003: 감사 하위 시스템은 best-effort

감사 하위 시스템은 panic 을 공개 API 호출자에게 전파해서는 **안 됩니다**. 사용자가 전달한 `AuditSink`(수제일 수 있고, 필터/멀티 팬아웃을 감쌀 수 있음)의 `Write()`는 임의의 경로에서 panic 을 일으킬 수 있습니다. `Record`는 `defer recover()`로 이러한 panic 을 삼킵니다(복구값은 폐기됨 — 감사 경로 자체에 안전한 보고 채널이 없음); `Close`는 error 반환값이 있으므로, 복구값을 `ErrInternalPanic`으로 래핑하여 반환합니다.

이는 커스텀 Sink 에 버그가 있어도 `defer processor.Close()` 관용구가 프로세스를 폭발시키지 않음을 의미합니다.

### Goroutine 누수 방지

`withTimeout`은 매 호출마다 deadline 을 기다리는 worker goroutine 을 시작합니다. 고동시성에서 goroutine 이 통제 불능이 되는 것을 방지하기 위해, 전역 카운터 `activeTimeoutGoroutines`가 동시 상한을 `maxTimeoutGoroutines`(1000)로 제한합니다. 초과 시 새 요청은 goroutine 을 무한히 쌓는 대신 직접 `ErrProcessingTimeout`을 반환합니다(goroutine 당 약 ~1MB 스택 추정, 1000 ≈ 1GB 상한).

### 감사 원본 값의 로그 인젝션 방지

`AuditConfig.IncludeRawValues = true`일 때, 감사 항목에는 차단된 속성/URL 의 원본 값이 포함됩니다. 이 값들은 `sanitizeRawValue`에 의해 HTML 이스케이프(`&` `<` `>` `"` `'`) 처리되어, 감사 로그가 브라우저나 SIEM 대시보드에 렌더링될 때 저장형 XSS 가 trigger 되는 것을 방지합니다.

## 감사 시스템

보안 이벤트는 감사 시스템을 통해 기록되며, 8종 이벤트 타입, 여러 내장 Sink 와 레벨 필터링을 지원합니다. 전체 설정은 [감사 시스템 실전](./audit-pipeline)을 참조하세요.

| 이벤트 | 설명 |
|------|------|
| `AuditEventBlockedTag` | 차단된 HTML 태그 |
| `AuditEventBlockedAttr` | 차단된 속성 |
| `AuditEventBlockedURL` | 차단된 URL |
| `AuditEventInputViolation` | 입력 크기 위반 |
| `AuditEventDepthViolation` | DOM 깊이 위반 |
| `AuditEventPathTraversal` | 경로 순회 시도(AllowedBaseDir 경계 위반 포함) |
| `AuditEventTimeout` | 처리 타임아웃 |
| `AuditEventEncodingIssue` | 인코딩 이상 |

## 보안 설정 결정표

| 시나리오 | 권장 설정 | 설명 |
|------|----------|------|
| 완전히 신뢰할 수 있는 내부 데이터 | `DefaultConfig()` + 선택적 `EnableSanitization = false` | 성능 우선; 외부 입력이 확실히 없을 때만 정제 끄기 |
| 사용자 업로드 HTML | `HighSecurityConfig()` | 전면 방어: 제한 강화 + 전체 감사 |
| 외부 웹 페이지 처리 | `DefaultConfig()` | 기본 정제가 일반적 위협을 이미 커버 |
| 사용자 제공 파일 경로 처리 | `AllowedBaseDir` 설정 | OS 핸들 샌드박스 활성화, symlink/junction 탈출 방지 |
| 고처리량 크롤러 | `MaxInputSize` 축소 + `ProcessingTimeout` 강화 | 악의적 페이지가 Worker 를 끌어내리는 것 방지 |

## 고보안 설정

`HighSecurityConfig()`는 모든 제한을 한 번에 강화하고 전체 감사를 활성화하는 프리셋입니다:

```go
cfg := html.HighSecurityConfig()
// 자동 설정:
//   MaxInputSize      = 10MB(기본 50MB)
//   MaxDepth          = 100(기본 500)
//   ProcessingTimeout = 10s(기본 30s)
//   WorkerPoolSize    = 2(기본 4)
//   Audit             = HighSecurityAuditConfig()(활성화 + 원본 값 포함)
```

## 오류 처리

모든 보안 위반은 명확한 센티넬 오류를 반환하며, `errors.Is`로 분류 판별을 지원합니다:

```go
package main

import (
	"errors"
	"fmt"

	"github.com/cybergodev/html"
)

func main() {
	data := []byte(`<html><body>악의적으로 구성된 초심층 중첩</body></html>`)
	_, err := html.Extract(data)
	if err != nil {
		switch {
		case errors.Is(err, html.ErrInputTooLarge):
			// 입력 초과, 기록 후 거부
			fmt.Println("입력이 너무 큽니다")
		case errors.Is(err, html.ErrMaxDepthExceeded):
			// 재귀 폭탄일 수 있음
			fmt.Println("깊이 위반")
		case errors.Is(err, html.ErrInternalPanic):
			// panic 이 복구됨, 입력 점검 및 보고 필요
			fmt.Println("내부 panic 복구됨")
		}
	}
	// 출력: 깊이 위반(예시, 실제는 입력에 따라 다름)
}
```

:::tip 파일 오류는 SafePath 사용
`*FileError`에 대해서는 원본 error 를 직접 출력하지 말고 `SafePath()`로 마스킹된 경로 문자열을 사용하세요 — 해석된 실제 경로가 로그에 유출되는 것을 방지합니다.
:::

## 다음 단계

- [감사 시스템 실전](./audit-pipeline) — 8종 이벤트 타입, 내장 Sink 비교, 등급 라우팅 파이프라인
- [프로덕션 체크리스트](./production-checklist) — 배포 전 보안 점검 목록
- [API 레퍼런스: 감사 시스템](../../api-reference/modules/audit) — 전체 API 서명
