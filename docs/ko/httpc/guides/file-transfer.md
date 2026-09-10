---
sidebar_label: "파일 업로드와 다운로드"
title: "파일 업로드와 다운로드 - CyberGo HTTPC | 업로드와 다운로드"
description: "HTTPC 파일 업로드와 다운로드 가이드: WithFile과 WithFormData 다중 파일 업로드, Download 스트리밍 다운로드, 진행률 콜백, 이어받기, SHA-256 체크섬 검증, 파일 충돌과 정리 규칙, UNC 경로 등 다층 보안 방어를 다룹니다."
sidebar_position: 6
---

# 파일 업로드와 다운로드

## 파일 업로드

### 간단한 파일 업로드

```go
package main

import (
    "log"
    "os"

    "github.com/cybergodev/httpc"
)

func main() {
    fileContent, err := os.ReadFile("document.pdf")
    if err != nil {
        log.Fatal(err)
    }

    result, err := httpc.Post("https://api.example.com/upload",
        httpc.WithFile("file", "document.pdf", fileContent),
    )
    if err != nil {
        log.Fatal(err)
    }

    log.Printf("업로드 완료: %d", result.StatusCode()) // 출력 예시: 업로드 완료: 200(실제 상태 코드는 서버에 따라 다름)
}
```

### Multipart 폼

파일과 함께 폼 필드를 첨부하여 업로드합니다:

```go
form := &httpc.FormData{
    Fields: map[string]string{
        "title": "My Document",
        "type":  "pdf",
    },
    Files: map[string]*httpc.FileData{
        "file": {
            Filename: "report.pdf",
            Content:  fileContent,
        },
    },
}

result, err := httpc.Post("https://api.example.com/upload",
    httpc.WithFormData(form),
)
```

`FileData`는 `ContentType` 필드도 제공하여 각 파일의 MIME 타입을 명시적으로 선언합니다(미설정 시 해당 part 의 기본값은 `application/octet-stream`):

```go
Files: map[string]*httpc.FileData{
    "file": {
        Filename:    "document.pdf",
        Content:     fileContent,
        ContentType: "application/pdf", // MIME 타입 명시적 선언
    },
},
```

### 다중 파일 업로드

```go
form := &httpc.FormData{
    Fields: map[string]string{
        "description": "일괄 업로드",
    },
    Files: map[string]*httpc.FileData{
        "file1": {Filename: "doc1.pdf", Content: content1},
        "file2": {Filename: "doc2.pdf", Content: content2},
        "file3": {Filename: "image.png", Content: content3},
    },
}

result, err := httpc.Post(url, httpc.WithFormData(form))
```

### 바이너리 업로드

```go
data, err := os.ReadFile("data.bin")
if err != nil {
    log.Fatal(err)
}
result, err := httpc.Post(url,
    httpc.WithBinary(data, "application/octet-stream"),
)
if err != nil {
    log.Fatal(err)
}
```

### 스트리밍 업로드(대용량 파일)

`WithBody`는 `io.Reader`를 직접 받아들이므로, 전체 파일을 메모리로 읽어 들일 필요가 없습니다. Reader 요청 본문의 Content-Type은 자동 감지되지 않으므로 명시적으로 설정해야 합니다:

```go
file, err := os.Open("large-video.mp4")
if err != nil {
    log.Fatal(err)
}
defer file.Close()

result, err := httpc.Post("https://api.example.com/upload",
    httpc.WithBody(file),
    httpc.WithHeader("Content-Type", "video/mp4"),
)
```

`io.Pipe`를 결합하면 제로카피 스트리밍 업로드가 가능합니다 — 생산자 goroutine 이 생성하는 대로 보내고, HTTP 전송 계층이 동시에 소비합니다:

```go
pr, pw := io.Pipe()
go func() {
    defer pw.Close()
    // pw 에 청크 단위로 기록. 예: 데이터베이스나 제너레이터에서 청크별로 산출
    _, _ = pw.Write(chunk)
}()

result, err := httpc.Post("https://api.example.com/upload",
    httpc.WithBody(pr),
    httpc.WithHeader("Content-Type", "application/octet-stream"),
)
```

:::warning Reader 요청 본문은 크기 검증을 우회
`io.Reader`는 데이터 길이를 미리 알 수 없어서, HTTPC 는 이에 대해 **크기 검증을 하지 않습니다**. 신뢰할 수 없는 데이터를 업로드할 때는 `io.LimitReader`로 감싸거나, `Security.MaxRequestBodySize`로 전역 상한을 설정하세요:

```go
result, err := httpc.Post(url,
    httpc.WithBody(io.LimitReader(reader, 10<<20)), // 상한 10MB
    httpc.WithHeader("Content-Type", "application/octet-stream"),
)
```
:::

## 파일 다운로드

`Download(ctx, url, cfg, options...)`는 패키지 수준 함수, `Client`, `DomainClient`에 걸친 유일한 정규 다운로드 진입점입니다.

다운로드는 **항상 스트리밍으로 진행**됩니다: 내부에서 `WithStreamBody(true)`가 자동으로 붙고, 응답 본문은 네트워크에서 디스크로 직접 흐릅니다(`io.Copy`). 전 과정에서 파일 전체가 메모리에 버퍼링되지 않으며, 체크섬을 활성화했을 때 해시 계산도 기록 과정에 동기적으로 완료되어 두 번째 디스크 읽기가 발생하지 않습니다.

### 기본 다운로드

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/file.zip"

result, err := httpc.Download(context.Background(), "https://example.com/file.zip", cfg)
if err != nil {
    log.Fatal(err)
}

fmt.Printf("다운로드 완료: %s\n", httpc.FormatBytes(result.BytesWritten))
fmt.Printf("소요 시간: %v\n", result.Duration)
```

### 진행률 콜백 포함

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/file.zip"
cfg.Overwrite = true
cfg.ProgressCallback = func(downloaded, total int64, speed float64) {
    pct := float64(downloaded) / float64(total) * 100
    fmt.Printf("\r다운로드 중: %.1f%% (%s)", pct, httpc.FormatSpeed(speed))
}

result, err := httpc.Download(context.Background(), "https://example.com/file.zip", cfg)
if err != nil {
    log.Fatal(err)
}

fmt.Printf("\n다운로드 완료: %s, 평균 속도 %s\n",
    httpc.FormatBytes(result.BytesWritten),
    httpc.FormatSpeed(result.AverageSpeed),
)
```

:::tip 진행률 콜백의 트리거 규칙
콜백의 매개변수는 `(다운로드된 바이트, 총 바이트, 현재 속도)`이며, 트리거 시점은 구현으로 보장됩니다:

- **최소 간격 200ms**: 고속 네트워크에서 고빈도 콜백이 디스크 기록을 늦추지 않고, 저속 네트워크에서도 안정적으로 갱신됩니다;
- **종료 시 최종 콜백을 한 번 더**: 이때 `downloaded`는 총 바이트 수, `speed`는 평균 속도이며, CLI 마무리 줄바꿈에 편리합니다;
- **`total`의 출처**: 서버가 반환한 `Content-Length`; 이어받기 시나리오에서는 서버가 Range 요청에 대해 남은 바이트 수만 알려주는데, HTTPC 가 기존 파일 오프셋을 자동으로 더해 전체 크기를 구합니다;
- **`total`은 0 또는 음수일 수 있음**: 서버가 Content-Length 를 반환하지 않으면(chunked 전송) 총량을 미리 알 수 없으므로, 콜백에서 `total > 0`을 먼저 확인한 뒤 백분율을 계산해야 합니다.
:::

### 인증과 커스텀 요청 헤더 포함

`Download`의 가변 인수는 일반 `RequestOption` 그대로이므로, 인증 헤더·쿼리 매개변수·단발 타임아웃을 직접 붙일 수 있습니다:

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/report.pdf"
cfg.Overwrite = true

result, err := client.Download(context.Background(),
    "https://api.example.com/files/report.pdf",
    cfg,
    httpc.WithBearerToken("my-token"),                  // 인증
    httpc.WithHeader("Accept", "application/pdf"),      // 커스텀 헤더
    httpc.WithTimeout(5*time.Minute),                   // 단일 다운로드 타임아웃 예산
)
```

### 이어받기

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/large-file.zip"
cfg.ResumeDownload = true

result, err := httpc.Download(context.Background(), url, cfg)
if err != nil {
    log.Fatal(err)
}

if result.Resumed {
    fmt.Printf("이어받기 완료: 중단 지점에서 복구\n")
}
```

:::tip
이어받기는 서버가 Range 요청 헤더를 지원해야 합니다. 서버가 지원하지 않으면(206 대신 200 반환) 이미 다운로드된 부분 파일을 보호하기 위해 오류를 반환합니다.
:::

이어받기 판정 논리 전체:

| 서버 응답 | 동작 |
|------------|------|
| `206 Partial Content` | 기존 파일에 `O_APPEND`로 이어서 기록, `result.Resumed`가 `true` |
| `200 OK`(Range 미지원) | 오류 `server does not support range requests` 반환, 기존 부분 파일을 **자르지 않음** |
| `416 Range Not Satisfiable` | 오류 반환(주로 로컬 파일이 이미 완전하거나, 서버 측 리소스가 변경되어 작아진 경우) |
| 그 외 2xx 이외의 상태 코드 | `unexpected status code` 오류 반환, 오류 메시지에 응답 본문 앞 200 바이트 미리보기 포함 |

:::warning Overwrite 와 ResumeDownload 가 모두 true일 때
`ResumeDownload`가 우선합니다 — 기존 파일은 교체 재기록이 아니라 **이어서 확장**됩니다. 또한 이어받기 모드에서 중간에 디스크 기록이 실패하면 기존 바이트가 보존됩니다(다음 이어받기용); 이어받기가 아닌 모드에서 실패하면 반쯤 기록된 파일을 삭제해 손상된 산출물을 남기지 않습니다.
:::

### 체크섬 검증(SHA-256)

`Checksum`을 설정하면 HTTPC 는 디스크에 기록하면서 흐르는 데이터의 SHA-256 을 계산하고, 다운로드 완료 시 기대값과 비교합니다:

- 비교는 **대소문자를 구분하지 않습니다**(기대값은 내부적으로 소문자로 통일);
- **불일치 → 이미 다운로드된 파일을 삭제하고 오류 반환**, 오염된 산출물을 남기지 않습니다;
- 성공 시 `result.ActualChecksum`에 실제 계산된 해시가 담겨 기록에 활용할 수 있습니다;
- 알고리즘 적법성은 **대상 파일을 열기 전에** 검증됩니다 — 구성 오류(알 수 없는 `ChecksumAlgorithm` 등)가 디스크의 기존 파일을 자르는 일은 없습니다.

```go
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"net/http/httptest"

	"github.com/cybergodev/httpc"
)

func main() {
	payload := []byte("hello httpc checksum")

	// 로컬 모의 서버가 고정 내용을 반환; 프로덕션에서 기대값은 릴리스 매니페스트 등 신뢰할 수 있는 경로에서 가져와야 함
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(payload)
	}))
	defer server.Close()

	sum := sha256.Sum256(payload)
	expected := hex.EncodeToString(sum[:])

	cfg := httpc.DefaultConfig()
	cfg.Security.AllowPrivateIPs = true // 127.0.0.1 로컬 서버 연결 허용
	client, err := httpc.New(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer client.Close()

	dlCfg := httpc.DefaultDownloadConfig()
	dlCfg.FilePath = "checksum-demo.txt"
	dlCfg.Overwrite = true
	dlCfg.Checksum = expected // 기대 SHA-256(hex 인코딩)
	dlCfg.ChecksumAlgorithm = httpc.ChecksumSHA256

	result, err := client.Download(context.Background(), server.URL, dlCfg)
	if err != nil {
		log.Fatal(err) // 검증 실패: 파일은 이미 삭제됨, 오류 메시지에 기대값과 실제값 포함
	}
	fmt.Printf("검증 통과: %s\n", result.ActualChecksum) // 출력: 검증 통과: 2f2b7c...(payload 의 SHA-256)
}
```

### 컨텍스트 제어 포함

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
defer cancel()

cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/file.zip"

result, err := httpc.Download(ctx, url, cfg)
if err != nil {
    if errors.Is(err, context.DeadlineExceeded) {
        log.Println("다운로드 타임아웃")
    }
    log.Fatal(err)
}
```

### 파일 충돌과 정리 규칙

다운로드가 대상 파일을 다루는 규칙 한눈에 보기(`ErrFileExists`, `ErrEmptyFilePath` 두 센티널 오류를 `errors.Is`로 판별):

| 시나리오 | 동작 |
|------|------|
| 대상 파일이 이미 존재하고 `Overwrite`/`ResumeDownload` 모두 false | `ErrFileExists` 반환, 파일 건드리지 않음 |
| 대상 경로가 디렉터리 | 오류 반환 |
| `Overwrite = true`(이어받기 아님) | `O_TRUNC` 덮어쓰기 |
| `ResumeDownload = true`이고 서버가 Range 지원 | `O_APPEND` 이어쓰기 |
| 기록/플러시(sync/close) 실패 | 이어받기 아님: 반쯤 된 파일 삭제; 이어받기: 기존 바이트 보존 |
| 체크섬 불일치 | 다운로드된 파일 삭제 |
| 기대한 알고리즘 미지원(SHA-256 만 지원) | 파일을 열기 **전에** 오류 반환, 기존 파일 자르지 않음 |
| 대상 디렉터리 없음 | 자동 재귀 생성(권한 0755), 파일 권한 0644 |
| 경로가 비어 있음 | `ErrEmptyFilePath` 반환 |

오류 상태 코드(200/206 제외)일 때는 오류 메시지에 응답 본문 앞 200 바이트의 미리보기가 붙어 문제 추적이 쉽습니다; 동시에 응답 본문을 최대 1MiB 까지 읽어 비워, 연결이 되도록 연결 풀로 돌아가 재사용되도록 합니다.

### Download 과 SaveToFile 중 선택 방법

`Result.SaveToFile(path)`는 **이미 메모리에 있는** 응답 본문을 디스크에 기록합니다; `Download`는 처음부터 끝까지 스트리밍으로 디스크에 기록합니다:

| 방식 | 적합한 시나리오 | 설명 |
|------|----------|------|
| `result.SaveToFile(path)` | 작은~중간 크기 응답 본문(이미 메모리에 있음) | 경로는 Download 와 동일한 보안 검증을 통과; 빈 응답 본문이면 `ErrResponseBodyEmpty` 반환 |
| `client.Download(ctx, url, cfg)` | 대용량 파일 | 스트리밍 디스크 기록, 진행률·이어받기·체크섬 지원, 메모리 사용량은 파일 크기와 무관 |

```go
// 응답 본문이 이미 메모리에 있음: 바로 디스크로
result, err := client.Get("https://example.com/small.json")
if err != nil {
    log.Fatal(err)
}
if err := result.SaveToFile("/tmp/small.json"); err != nil {
    log.Fatal(err)
}
```

### DownloadResult 필드 한눈에 보기

`Download`가 반환하는 `DownloadResult`는 흔한 바이트 수와 소요 시간 외에도 완전한 요청/응답 메타데이터를 담습니다:

| 필드 | 타입 | 설명 |
|------|------|------|
| `FilePath` | `string` | 검증된 절대 저장 경로 |
| `BytesWritten` | `int64` | 이번에 디스크에 기록한 바이트 수(이어받기 시 기존 오프셋 **미포함**) |
| `Duration` | `time.Duration` | 다운로드 총 소요 시간 |
| `AverageSpeed` | `float64` | 평균 속도(바이트/초) |
| `StatusCode` | `int` | 응답 상태 코드(200 또는 206) |
| `ContentLength` | `int64` | 서버가 보고한 Content-Length(이어받기 시 남은 바이트 수) |
| `Resumed` | `bool` | 이번 요청이 이어받기인지 여부 |
| `ResponseCookies` | `[]*http.Cookie` | 응답이 반환한 Cookie(`DomainClient`는 세션에 자동 캡처) |
| `ActualChecksum` | `string` | 실제 계산된 체크섬(`Checksum` 설정 시에만 값이 채워짐) |
| `Proto` | `string` | 프로토콜 버전(예: `HTTP/2.0`) |
| `ResponseHeaders` | `http.Header` | 응답 헤더 |
| `RequestURL` / `RequestMethod` | `string` | 실제 요청한 URL 과 메서드 |
| `RequestHeaders` | `http.Header` | 실제 전송한 요청 헤더 |

## 보안 방어

파일 다운로드에는 다층 보안 보호가 내장되어 있으며, 전부 **대상 파일을 열기 전에** 완료됩니다:

| 보호 계층 | 설명 |
|--------|------|
| 경로 검증 | UNC 경로(`\\server\share`, `//server`), 제어 문자, 경로 순회 차단(`Clean` 후 `..`로 시작해 작업 디렉터리를 벗어나면 거부) |
| 길이 제한 | 경로는 최대 4096자, 초과 시 즉시 거부 |
| 시스템 경로 보호 | 시스템 디렉터리 기록 금지: Windows 는 `C:\Windows\`·`C:\Program Files\` 및 `%SystemRoot%` 등 환경변수 전개 위치를, Linux/macOS 는 `/etc/`·`/usr/`·`/bin/`·`/System/`·`/Library/` 등을 포함 |
| 심볼릭 링크 감지 | 대상 자체가 심볼릭 링크이거나 임의의 상위 디렉터리가 시스템 디렉터리로 해석되면 모두 거부(TOCTOU 방어, 최대 32계층 재귀 검사) |
| 파일 크기 제한 | `MaxResponseBodySize` 제한 적용 |

:::tip 디렉터리도 검증됩니다
상위 디렉터리 자동 생성(`MkdirAll`)은 경로 검증 **이후에** 일어나므로, `FilePath`의 모든 계층 디렉터리는 시스템 경로나 심볼릭 링크를 빌려 방어를 우회할 수 없습니다. `Result.SaveToFile`도 동일한 검증 체계를 재사용합니다.
:::

## 도메인 클라이언트 다운로드

도메인 클라이언트의 다운로드는 응답 Cookie 를 세션에 자동 캡처합니다:

```go
dc, err := httpc.NewDomainDefault("https://api.example.com")
if err != nil {
    log.Fatal(err)
}
defer dc.Close()

dc.SetHeader("Authorization", "Bearer "+token)

cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/report.pdf"

// 다운로드하며 세션 자동 관리(path 는 baseURL 기준 상대 경로)
result, err := dc.Download(context.Background(), "/files/report.pdf", cfg)
if err != nil {
    log.Fatal(err)
}
```

:::warning 도메인 클라이언트의 두 가지 주의사항
- **요청 옵션이 두 번 실행됩니다**(한 번은 세션 상태 캡처용, 한 번은 실제 요청용). 부수 효과가 있는 옵션(카운터, 무작위 nonce 생성기 등)은 전달하지 마세요; 꼭 필요하면 하위 `Client`로 직접 다운로드하세요.
- **Download 은 「응답 객체를 감싸는 커스텀 미들웨어」와 호환되지 않습니다**: 다운로드 경로는 원시 응답 스트림에 직접 접근해야 하므로, 커스텀 미들웨어가 `ResponseMutator`를 래퍼 타입으로 교체하면 `Download`는 명확한 오류를 반환합니다. 내장 미들웨어(Recovery/Logging/Metrics 등)는 모두 투과 방식이라 영향을 받지 않습니다.
:::

## 다음 단계

- [파일 다운로드 API](../api-reference/client-config/download) - 완전한 다운로드 API 레퍼런스
- [도메인 클라이언트와 세션](./domain-session) - 세션 관리
- [요청과 응답](./request-response) - 기본 요청 가이드
- [성능 최적화](./performance) - 대용량 파일 다운로드의 성능 프리셋과 튜닝
- [테스트 가이드](./testing) - httptest 로 다운로드 로직 테스트
