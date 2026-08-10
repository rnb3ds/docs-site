---
sidebar_label: "인코딩 감지 실전"
title: "인코딩 감지 실전 - CyberGo html | 문자 인코딩 자동 인식 가이드"
description: "CyberGo html 인코딩 감지 실전 가이드: 4단계 감지 우선순위와 15+ 인코딩 지원, Config.Encoding 수동 지정, 통계 알고리즘 지능형 인식 및 GBK와 Shift_JIS 자동 감지 예제를 다룹니다."
sidebar_position: 5
---

# 인코딩 감지 실전

HTML 문서는 다양한 문자 인코딩(GBK, Shift_JIS, Windows-1252 등)을 사용할 수 있습니다. 라이브러리는 자동 인코딩 감지를 내장하여, HTML 바이트에서 인코딩을 인식하고 UTF-8 로 변환하며, 15+ 종의 인코딩을 지원하여 수동 처리가 불필요합니다.

## 감지 우선순위

라이브러리는 다음 순서로 입력 인코딩을 결정하며, 순차적으로 시도하고 첫 번째로 일치하는 것이 적용됩니다:

| 우선순위 | 소스 | 설명 |
|--------|------|------|
| ① 최고 | `Config.Encoding` 수동 지정 | 비어있지 않으면 직접 사용, 모든 자동 감지를 건너뜀 |
| ② | HTML meta 태그 선언 | `<meta charset>` 또는 `http-equiv="content-type"`, 최초 1024 바이트를 스캔 |
| ③ | 통계 알고리즘 지능형 감지 | 최대 10KB 샘플링, 신뢰도 ≥ 80 일 때만 채택 |
| ④ 폴백 | UTF-8 | 이상 모두 일치하지 않을 때 UTF-8 로 회귀 |

```text
Config.Encoding 이 비어있지 않은가? ── 예 ──→ 직접 사용
        │
        아니오
        │
meta 태그가 인코딩을 선언했는가? ── 예 ──→ 선언값 사용
        │
        아니오
        │
통계 알고리즘 신뢰도 ≥ 80? ── 예 ──→ 통계 결과 채택
        │
        아니오
        │
        └──→ UTF-8
```

:::tip BOM 감지
위 4단계 외에도 라이브러리는 BOM (Byte Order Mark)을 감지합니다: UTF-8 BOM (`EF BB BF`), UTF-16 LE BOM (`FF FE`), UTF-16 BE BOM (`FE FF`). BOM 이 존재하면 인코딩이 직접 결정됩니다.
:::

## 지원하는 인코딩

| 분류 | 인코딩 | 비고 |
|------|------|------|
| Unicode | UTF-8, UTF-16LE, UTF-16BE | 기본 폴백은 UTF-8 |
| 서유럽 | Windows-1252, ISO-8859-1, ISO-8859-15 | ISO-8859-15 는 유로 기호 포함 |
| 중앙유럽 | Windows-1250 | — |
| 키릴 | Windows-1251 | 러시아어 등 |
| 간체 중국어 | GBK | 별칭 `gb2312`는 자동으로 `gbk`로 정규화 |
| 번체 중국어 | Big5 | — |
| 일본어 | Shift_JIS, EUC-JP | — |
| 한국어 | EUC-KR | — |

### 인코딩 별칭 정규화

인코딩 이름과 별칭은 **대소문자를 구분하지 않으며**, 자동으로 표준명으로 정규화됩니다:

| 입력 별칭 | 정규화 결과 |
|----------|-----------|
| `gb2312`, `GB2312` | `gbk` |
| `sjis`, `x-sjis`, `shift-jis` | `shift_jis` |
| `latin1`, `latin-1` | `iso-8859-1` |
| `utf8`, `utf_8` | `utf-8` |
| `8859-1`, `iso88591` | `iso-8859-1` |
| `cp1252`, `windows1252` | `windows-1252` |

## 자동 감지 예제

GBK 로 인코딩된 중국어 HTML 을 meta 태그 선언으로 자동 인식:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
    "golang.org/x/text/encoding/simplifiedchinese"
)

func main() {
    // GBK 인코딩의 중국어 HTML (meta 태그가 charset=gbk 선언)
    gbkHTML := `<html><head><meta charset="gbk">` +
        `<title>中文网页</title></head>` +
        `<body><article><h1>你好世界</h1>` +
        `<p>这是一段中文内容。</p></article></body></html>`

    // UTF-8 문자열을 GBK 바이트로 인코딩 (실제 GBK 웹페이지 시뮬레이션)
    gbkBytes, err := simplifiedchinese.GBK.NewEncoder().Bytes([]byte(gbkHTML))
    if err != nil {
        log.Fatal(err)
    }

    // 인코딩 자동 감지 후 추출 (meta charset에서 GBK 인식, UTF-8 변환 후 추출)
    result, err := html.Extract(gbkBytes)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println("제목:", result.Title)
    // 제목: 中文网页

    fmt.Println("본문:", result.Text)
    // 본문: 你好世界
    //       这是一段中文内容。
}
```

## 수동 인코딩 지정

meta 태그가 누락되었거나, 선언이 잘못되었거나, 자동 감지 결과가 불확실할 때 `Config.Encoding`으로 강제 지정:

```go
cfg := html.DefaultConfig()
cfg.Encoding = "gbk"

result, err := html.Extract(gbkBytes, cfg)
```

| 적용 시나리오 | 설명 |
|----------|------|
| 출처 인코딩을 알고 있음 | HTTP `Content-Type` 헤더에서 인코딩을 획득하여 직접 지정, 오감지 방지 |
| meta 태그 누락 | `<meta charset>` 선언이 없는 구형 웹페이지 |
| 자동 감지 오류 | 통계 알고리즘의 신뢰도 부족으로 결과가 올바르지 않음 |

:::tip Config.Encoding 이 최우선
`Config.Encoding`을 설정하면 라이브러리는 자동 감지를 완전히 건너뛰고, 지정된 인코딩으로 직접 디코딩합니다. 확정적인 시나리오에 적합하며, 통계 감지의 불확실성을 회피할 수 있습니다.
:::

### Shift_JIS 자동 감지 실전

일본어 웹페이지는 Shift_JIS 인코딩을 자주 사용합니다. meta 선언이 없어도 통계 알고리즘이 인식할 수 있습니다:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
    "golang.org/x/text/encoding/japanese"
)

func main() {
    // Shift_JIS 인코딩의 일본어 HTML (meta charset 선언 없음)
    sjisHTML := `<html><head><title>日本語ページ</title></head>` +
        `<body><article><h1>こんにちは</h1>` +
        `<p>東京の天気は晴れです。</p></article></body></html>`

    // Shift_JIS 바이트로 인코딩
    sjisBytes, err := japanese.ShiftJIS.NewEncoder().Bytes([]byte(sjisHTML))
    if err != nil {
        log.Fatal(err)
    }

    // 통계 알고리즘이 Shift_JIS 자동 인식 (샘플링 바이트로 일본어 문자 분포 분석)
    result, err := html.Extract(sjisBytes)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println("제목:", result.Title)
    // 제목: 日本語ページ

    fmt.Println("본문:", result.Text)
    // 본문: こんにちは
    //       東京の天気は晴れです。
}
```

### Windows-1252 수동 지정

서유럽 인코딩 (`é`, `€` 등의 문자 포함) 은 수동으로 지정할 수 있습니다:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
    "golang.org/x/text/encoding/charmap"
)

func main() {
    // Windows-1252 인코딩의 서유럽 텍스트
    winHTML := `<html><head><title>Café Menu</title></head>` +
        `<body><article><h1>Café</h1>` +
        `<p>Price: 100 €. Résumé available.</p></article></body></html>`

    winBytes, err := charmap.Windows1252.NewEncoder().Bytes([]byte(winHTML))
    if err != nil {
        log.Fatal(err)
    }

    // Windows-1252 인코딩 수동 지정
    cfg := html.DefaultConfig()
    cfg.Encoding = "windows-1252"

    result, err := html.Extract(winBytes, cfg)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println("제목:", result.Title)
    // 제목: Café Menu

    fmt.Println("본문:", result.Text)
    // 본문: Café
    //       Price: 100 €. Résumé available.
}
```

## 인코딩 감지 실패

인코딩 감지 또는 변환이 실패할 때 (예: 데이터 손상, 지원하지 않는 인코딩 사용), wrapping error 를 반환합니다:

```go
result, err := html.Extract(data)
if err != nil {
    if strings.Contains(err.Error(), "encoding detection failed") {
        // 인코딩 감지 실패, 수동 지정으로 폴백
        cfg := html.DefaultConfig()
        cfg.Encoding = "windows-1252"
        result, err = html.Extract(data, cfg)
        if err != nil {
            log.Fatal(err)
        }
    } else {
        log.Fatal(err)
    }
}
```

:::warning 오류 메시지 형식
인코딩 감지 실패의 오류 메시지는 `"encoding detection failed"` 접두사를 고정적으로 포함하며, `strings.Contains`로 매칭할 수 있습니다. 감지 실패 시 수동 인코딩 지정으로 폴백하는 것을 권장합니다.
:::

## 감사 로그

감사를 활성화하면, 인코딩 감지 문제는 `AuditEventEncodingIssue` (info 레벨) 로 기록됩니다:

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    cfg := html.DefaultConfig()
    cfg.Audit = html.DefaultAuditConfig()
    cfg.Audit.Enabled = true
    // LogEncodingIssues 는 기본적으로 true (DefaultAuditConfig 에서 이미 활성화)

    p, err := html.New(cfg)
    if err != nil {
        log.Fatal(err)
    }
    defer p.Close()

    // HTML 처리 (인코딩 문제 발생 시 자동으로 감사 로그에 기록)
    p.Extract([]byte(`<html><body><p>content</p></body></html>`))

    // 감사 로그에서 인코딩 이벤트 조회
    for _, entry := range p.GetAuditLog() {
        if entry.EventType == html.AuditEventEncodingIssue {
            fmt.Printf("[인코딩 문제] %s\n", entry.Message)
        }
    }

    fmt.Println("인코딩 이벤트 확인 완료")
    // 인코딩 이벤트 확인 완료
}
```

:::tip 트리거 조건
`AuditEventEncodingIssue`는 인코딩 감지 또는 변환이 실패할 때만 기록됩니다 (예: 지원하지 않는 인코딩 사용 및 데이터가 유효한 UTF-8 이 아닌 경우). 정상적인 문서는 이 이벤트를 발생시키지 않습니다. 인코딩 문제는 `info` 레벨 (최하위) 이며, 데이터가 완벽하게 디코딩되지 않았을 수 있지만 보안에는 영향을 주지 않음을 나타냅니다. 필터링이 필요하면 `LevelFilteredSink`를 사용하여 최저 레벨을 `warning`으로 설정하면 제외할 수 있습니다.
:::

## 다음 단계

- [콘텐츠 추출 실전](./content-extraction) - 추출 흐름과 문서 인식
- [오류 처리](../error-handling) - 센티널 오류와 구조화된 오류 처리
- [API 레퍼런스: 설정](../../api-reference/core/config) - Encoding 필드와 모든 설정 옵션
