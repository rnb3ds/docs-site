---
sidebar_label: "파일 다운로드"
title: "파일 다운로드 - CyberGo HTTPC | Download와 검증"
description: "HTTPC 파일 다운로드 API 레퍼런스: Download 통합 다운로드 진입점 함수, DownloadConfig 구성 구조체, DownloadProgressCallback 진행률 콜백, DownloadResult 결과 타입, SHA-256 체크섬 검증과 UNC 경로 방어 등 6계층 보안 보호."
sidebar_position: 4
---

# 파일 다운로드

## 패키지 수준 다운로드 함수

### Download

```go
func Download(ctx context.Context, url string, cfg *DownloadConfig, options ...RequestOption) (*DownloadResult, error)
```

기본 클라이언트를 사용하여 파일을 다운로드합니다. `Download`는 패키지 수준 함수, `Client` 인터페이스, `DomainClient`에 걸친 **유일한 정규 다운로드 진입점**으로, 이전의 변형 매트릭스를 단일 시그니처로 대체합니다. `cfg`는 nil일 수 없으며, `cfg.FilePath`를 반드시 설정해야 합니다(그렇지 않으면 `ErrEmptyFilePath` 반환).

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/file.zip"
cfg.Overwrite = true
cfg.ResumeDownload = true

result, err := httpc.Download(context.Background(), url, cfg)
```

`Download` 메서드는 `Client` 인터페이스와 `DomainClient`에서 시그니처가 동일하며, 세 곳의 진입점 동작이 통일되어 있습니다.

## DownloadConfig

```go
type DownloadConfig struct {
    FilePath          string
    ProgressCallback  DownloadProgressCallback
    Overwrite         bool
    ResumeDownload    bool
    Checksum          string
    ChecksumAlgorithm ChecksumAlgorithm
}

func DefaultDownloadConfig() *DownloadConfig
```

### 필드 상세

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `FilePath` | `string` | — | 파일 저장 경로(**필수**, 비어 있을 수 없음) |
| `ProgressCallback` | `DownloadProgressCallback` | `nil` | 진행률 콜백 함수, nil일 때 진행률 보고 비활성화 |
| `Overwrite` | `bool` | `false` | 기존 파일 덮어쓸지 여부. false일 때 파일이 이미 존재하면 `ErrFileExists` 반환 |
| `ResumeDownload` | `bool` | `false` | 이어받기 활성화 여부. true일 때 기존 부분 파일 재사용 |
| `Checksum` | `string` | `""` | 예상되는 16진수 인코딩 체크섬. 설정 시 다운로드 완료 시 자동 검증 |
| `ChecksumAlgorithm` | `ChecksumAlgorithm` | `"sha256"` | 검증 알고리즘(현재 SHA-256만 지원) |

:::tip Overwrite와 ResumeDownload의 우선순위
파일이 이미 존재하고 둘 다 true일 때, `ResumeDownload`가 우선합니다 — 기존 파일이 교체되지 않고 **추가 확장**됩니다. 파일이 존재하지 않을 때는 둘의 동작이 동일합니다(정상 다운로드).
:::

### DefaultDownloadConfig

```go
func DefaultDownloadConfig() *DownloadConfig
```

기본 다운로드 구성 반환: `Overwrite`와 `ResumeDownload` 모두 false, `ChecksumAlgorithm`은 `ChecksumSHA256`. 호출자가 반드시 `FilePath`를 설정해야 사용할 수 있습니다.

## DownloadProgressCallback

```go
type DownloadProgressCallback func(downloaded, total int64, speed float64)
```

| 매개변수 | 타입 | 설명 |
|-----------|------|------|
| `downloaded` | `int64` | 다운로드된 바이트 수(이어받기 오프셋 포함) |
| `total` | `int64` | 전체 바이트 수(`-1`은 알 수 없음, Content-Length 없음) |
| `speed` | `float64` | 현재 속도(바이트/초) |

### 진행률 콜백 메커니즘

진행률 콜백은 `progressWriter`로 `io.Writer`를 래핑하여 구현되며, 매 `Write` 시 스로틀 간격 도달 여부를 검사합니다:

| 특징 | 설명 |
|------|------|
| 스로틀 간격 | 200ms(`progressInterval`) — 고속 네트워크에서 빈번한 콜백 방지 |
| 이어받기 오프셋 조정 | `downloaded = offset + written` — 이어받기 시 이번 증분이 아닌 총 다운로드량 보고 |
| 총량 조정 | 이어받기 시 `total = contentLength + offset` — 완전한 파일 크기로 복원 |
| 최종 콜백 | 다운로드 완료 후 최종 통계값 보고를 위해 추가로 한 번 콜백 트리거 |

```go
cfg.ProgressCallback = func(downloaded, total int64, speed float64) {
    if total > 0 {
        pct := float64(downloaded) / float64(total) * 100
        fmt.Printf("\r%.1f%% (%s/s)", pct, httpc.FormatSpeed(speed))
    } else {
        fmt.Printf("\r%s (%s/s)", httpc.FormatBytes(downloaded), httpc.FormatSpeed(speed))
    }
}
```

## DownloadResult

```go
type DownloadResult struct {
    FilePath        string
    BytesWritten    int64
    Duration        time.Duration
    AverageSpeed    float64
    StatusCode      int
    ContentLength   int64
    Resumed         bool
    ResponseCookies []*http.Cookie
    ActualChecksum  string
    Proto           string
    ResponseHeaders http.Header
    RequestURL      string
    RequestMethod   string
    RequestHeaders  http.Header
}
```

### 필드 상세

| 필드 | 타입 | 설명 |
|------|------|------|
| `FilePath` | `string` | 파일이 실제로 저장된 **절대 경로**(`prepareFilePath`로 검증된 경로) |
| `BytesWritten` | `int64` | 이번에 기록한 바이트 수(이어받기 시 추가량, 파일 총 크기가 아님) |
| `Duration` | `time.Duration` | 다운로드 소요 시간(기록 시작부터 파일 닫기까지) |
| `AverageSpeed` | `float64` | 평균 속도(바이트/초, = BytesWritten / Duration) |
| `StatusCode` | `int` | HTTP 상태 코드(200 또는 206) |
| `ContentLength` | `int64` | 서버가 보고한 Content-Length(이어받기 시 남은 부분 길이) |
| `Resumed` | `bool` | 이어받기 완료 여부(Range를 요청하고 206을 받음) |
| `ResponseCookies` | `[]*http.Cookie` | 응답 Cookie |
| `ActualChecksum` | `string` | 실제 계산된 체크섬(`Checksum` 설정 시에만 채워짐) |
| `Proto` | `string` | HTTP 프로토콜 버전(예: `"HTTP/1.1"`, `"HTTP/2.0"`) |
| `ResponseHeaders` | `http.Header` | 응답 헤더 |
| `RequestURL` | `string` | 실제 요청 URL |
| `RequestMethod` | `string` | 요청 HTTP 메서드(`"GET"` 고정) |
| `RequestHeaders` | `http.Header` | 실제 전송된 요청 헤더 |

```go
fmt.Printf("다운로드 완료: %s, 소요 시간 %v, 평균 속도 %s\n",
    httpc.FormatBytes(result.BytesWritten),
    result.Duration,
    httpc.FormatSpeed(result.AverageSpeed),
)
```

:::tip
[FormatBytes](../core/functions#formatbytes)와 [FormatSpeed](../core/functions#formatspeed)를 사용하면 사람이 읽을 수 있는 바이트와 속도 문자열을 얻어 `1024` 단위 환산을 수동으로 할 필요가 없습니다.
:::

## 체크섬 검증

### ChecksumAlgorithm

```go
type ChecksumAlgorithm string
```

다운로드 파일 무결성 검증 알고리즘.

| 상수 | 값 | 설명 |
|------|-----|------|
| `ChecksumSHA256` | `"sha256"` | SHA-256 해시 알고리즘 |

### SHA-256 스트리밍 검증 흐름

`Checksum` 설정 후, 다운로드 과정에서 **쓰면서 계산**하는 방식으로 해시를 계산하여, 다운로드 완료 후 전체 파일을 다시 읽지 않아도 됩니다:

```text
검증 흐름:

  ① hasher = sha256.New()
  ② writer = io.MultiWriter(file, hasher)
     ↓
     네트워크 데이터 스트림 → file(디스크에 기록)
                           → hasher(해시 상태 업데이트)
     ↓
  ③ 다운로드 완료 후: actualChecksum = hex(hasher.Sum(nil))
  ④ 비교: actualChecksum == strings.ToLower(cfg.Checksum)?
     ├─ 일치 → DownloadResult 반환(ActualChecksum 포함)
     └─ 불일치 → 파일 삭제 + 검증 오류 반환
```

| 단계 | 설명 |
|------|------|
| MultiWriter | `io.MultiWriter(file, hasher)`로 데이터가 파일과 해셔에 동시에 기록, 추가 메모리 제로 |
| 알고리즘 사전 검사 | 대상 파일에 접근하기 **전에** 알고리즘 이름 검증 — 구성 오류가 기존 파일을 잘라내지 않음 |
| 실패 정리 | 검증 실패 시 다운로드된 파일 **자동 삭제**(비이어받기 모드), 손상된 파일 잔존 방지 |
| 대소문자 무관 | 예상값 자동 `ToLower`, 실제값은 소문자 hex, 대소문자가 비교에 영향 없음 |

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/package.tar.gz"
cfg.Checksum = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
cfg.ChecksumAlgorithm = httpc.ChecksumSHA256

result, err := httpc.Download(context.Background(), url, cfg)
if err != nil {
    // 체크섬 불일치 시 자동으로 오류 반환 및 다운로드된 파일 삭제
    log.Fatal(err)
}
fmt.Println("체크섬:", result.ActualChecksum)
```

## 이어받기 메커니즘

### ResumeDownload 작업 흐름

```text
prepareResumeState(filePath, opts, options):

  ① prepareFilePath(filePath) → 경로 안전성 검증 → validatedPath
  ② os.Stat(validatedPath)
     ├─ 파일 없음 → resumeOffset = 0, 정상 다운로드
     ├─ 디렉토리 → 오류 반환
     ├─ 파일 존재 + Overwrite=false + Resume=false → ErrFileExists
     ├─ 파일 존재 + Resume=true → resumeOffset = fileInfo.Size()
     │     → options에 WithHeader("Range", "bytes={offset}-") 추가
     └─ 파일 존재 + Overwrite=true(Resume 아님) → resumeOffset = 0, 덮어쓰기 다운로드
```

### 서버 응답 처리

| 서버 반환 | 처리 |
|-----------|------|
| `206 Partial Content` | 이어받기 성공: `O_APPEND` 추가 모드로 기록, `Resumed = true` |
| `200 OK`(Range 미지원) | **오류 반환**: 서버가 Range 요청을 무시, 이어받기가 기존 데이터를 잘라냄. 응답 본문을 비운 후 오류 보고 |
| `416 Range Not Satisfiable` | **오류 반환**: 요청한 오프셋이 파일 크기를 초과. 응답 본문을 비운 후 오류 보고 |
| 기타 상태 코드(4xx/5xx) | 오류 반환, 응답 본문 앞 200자 미리보기 첨부 |

:::warning 200일 때 오류 반환하는 이유
`ResumeDownload=true`이지만 서버가 206이 아닌 200을 반환하면, 서버가 Range 요청을 지원하지 않음을 의미합니다. 이때 계속 다운로드하면 기존 부분 파일을 처음부터 덮어쓰게 됩니다 — **사용자의 이어받기 의도 데이터를 조용히 잃게 됩니다**. HTTPC는 잘라내기 대신 오류 반환을 선택하여 로컬 부분 파일이 파괴되지 않도록 보호합니다. 강제 덮어쓰기가 필요하면 `Overwrite=true` + `ResumeDownload=false`를 설정하세요.
:::

```go
cfg := httpc.DefaultDownloadConfig()
cfg.FilePath = "/tmp/large-file.zip"
cfg.ResumeDownload = true

result, err := httpc.Download(context.Background(), url, cfg)
if err != nil {
    log.Fatal(err)
}
if result.Resumed {
    fmt.Printf("이어받기 완료, 이번 추가분 %s\n", httpc.FormatBytes(result.BytesWritten))
}
```

## 스트리밍 다운로드 원리

파일 다운로드는 스트리밍 모드(`WithStreamBody(true)`)를 사용하여 전체 응답 본문이 메모리에 버퍼링되는 것을 방지합니다:

```text
스트리밍 다운로드 데이터 경로:

  서버 응답
    ↓
  engine.Response.RawBodyReader()  ← 네트워크 리더(io.ReadCloser)
    ↓
  io.Copy(writer, bodyReader)      ← 직접 스트리밍 기록, 전량 버퍼링 제로
    ↓
  writer = progressWriter(MultiWriter(file, hasher))
    ↓
  디스크 파일
```

| 특징 | 설명 |
|------|------|
| 제로 메모리 버퍼링 | 데이터가 네트워크에서 디스크로 직접 흐르며, 전체 메모리 버퍼를 거치지 않음 |
| 스트리밍 해시 | 체크섬 계산이 기록과 동기화되어, 두 번 읽을 필요 없음 |
| 자동 해제 | 응답 본문 리더는 `defer`로 닫히며, 엔진 응답은 `defer`로 객체 풀에 반환 |

:::warning 미들웨어 호환성
다운로드는 `*engine.Response`의 `RawBodyReader()`에 직접 접근해야 합니다. 미들웨어가 `ResponseMutator`를(엔진 응답을 제자리에서 수정하는 대신) 커스텀 타입으로 **래핑**하면, 다운로드는 오류를 반환합니다: `download is not compatible with middleware that wraps ResponseMutator`. 모든 내장 미들웨어는 제자리에서 수정하므로 이 오류가 발생하지 않습니다.
:::

## 파일 경로 보안 방어

`prepareFilePath`는 다층 보안 방어를 구현하여, 악의적 경로가 시스템 민감 위치에 기록되는 것을 방지합니다. 각 계층은 경로가 파일 시스템에 도달하기 전에 차단합니다.

### 방어 계층 총람

| 계층 | 방어 | 차단 내용 |
|------|------|-----------|
| 1 | 길이 검사 | 빈 경로 / 4096자 초과 |
| 2 | UNC 경로 차단 | `\\server\share` 또는 `//server/share` 네트워크 경로 |
| 3 | 제어 문자 필터링 | ASCII < 0x20, 0x7F(DEL), 0x00(NUL) |
| 4 | 시스템 경로 보호 | OS 보호 디렉토리 기록(아래 표 참조) |
| 5 | 경로 트래버설 검출 | `../`로 작업 디렉토리 이탈 |
| 6 | symlink 방어 | 파일 자체 + 부모 디렉토리 재귀 심볼릭 링크 검사 |

### 제2계층: UNC 경로 차단

```text
차단 형식:
  \\server\share\file     ← Windows UNC 경로
  //server/share/file     ← POSIX 이중 슬래시 네트워크 경로

이유: UNC 경로는 네트워크 자원에 접근할 수 있어 SSRF 또는 SMB 릴레이 공격에 악용될 수 있음
```

### 제3계층: 제어 문자 필터링

경로의 모든 바이트를 검사합니다 — ASCII 제어 문자(0x00-0x1F), DEL(0x7F), NUL 바이트를 거부합니다. 이는 터미널 이스케이프 시퀀스 주입과 CRLF 경로 혼동 공격을 방지합니다.

### 제4계층: 시스템 경로 보호

운영체제에 따라 보호되는 시스템 디렉토리에 기록을 차단합니다:

| OS | 보호 경로 |
|----|-----------|
| **Windows** | `C:\Windows\`, `C:\System32\`, `C:\Program Files\`, `C:\ProgramData\`, `C:\Program Files (x86)\` + 환경 변수 전개: `${SystemRoot}`, `${windir}`, `${ProgramFiles}` 등 |
| **macOS** | `/system/`, `/library/`, `/applications/`, `/usr/`, `/bin/`, `/sbin/`, `/etc/`, `/var/` |
| **Linux** | `/etc/`, `/sys/`, `/proc/`, `/dev/`, `/boot/`, `/root/`, `/usr/bin/`, `/usr/sbin/`, `/bin/`, `/sbin/`, `/lib/`, `/run/` 등 |

경로 매칭은 접두사 검사(후행 구분자 포함)를 사용하여 접두사 충돌을 방지합니다(예: `C:\Windows`가 `C:\WindowsEvil`을 잘못 매칭하지 않음). Windows 환경 변수 모드는 검사 시 동적으로 전개하여 비 C 드라이브에 설치된 시스템 디렉토리를 캡처합니다.

### 제5계층: 경로 트래버설 검출

```text
작업 디렉토리 경계 검사:

  filePath = "../../etc/passwd"
  cleanPath = filepath.Clean → "../../etc/passwd"
  absPath = filepath.Abs → "/home/user/../../etc/passwd" → "/etc/passwd"

  검사: absPath가 작업 디렉토리 내에 있는가?
  결과: 아니오 → "path traversal detected: path outside working directory"
```

정리된 경로(`filepath.Clean`)가 `..`로 시작할 때 검사가 트리거됩니다. **상대 경로**만 검사합니다 — 절대 경로는 작업 디렉토리 내로 제한하지 않지만(여전히 시스템 경로 보호 제약을 받음).

### 제6계층: symlink 방어

| 검사 | 설명 |
|------|------|
| 파일 자체 | `os.Lstat`으로 대상 파일이 symlink인지 검사 — 공격자가 민감 파일을 가리키는 symlink를 생성할 수 있음 |
| 부모 디렉토리 재귀 | `checkParentDirSymlinks`가 모든 부모 디렉토리를 재귀 검사(최대 32계층), TOCTOU 공격(검사 후 디렉토리가 symlink로 교체됨) 방지 |
| 해석 후 시스템 경로 | 부모 디렉토리 symlink 해석 후 시스템 디렉토리를 가리키면 역시 거부 |

```go
// 각 계층의 방어가 다음 공격 시나리오를 차단합니다:
cfg.FilePath = "\\malicious-server\share\payload"  // UNC 차단
cfg.FilePath = "/etc/passwd"                        // 시스템 경로 보호
cfg.FilePath = "../../../etc/shadow"                // 경로 트래버설 검출
cfg.FilePath = "/tmp/safe/../../../etc/passwd"      // Clean + 트래버설 + 시스템 경로
```

## 완전한 예제: 프로덕션급 다운로드

다음 예제는 진행률 콜백, SHA-256 검증, 이어받기를 포함한 완전한 다운로드 흐름을 보여줍니다.

```go
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/cybergodev/httpc"
)

func main() {
	cfg := httpc.DefaultDownloadConfig()
	cfg.FilePath = "/tmp/large-archive.zip"
	cfg.Overwrite = true
	cfg.ResumeDownload = true
	cfg.Checksum = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"

	lastUpdate := time.Now()
	cfg.ProgressCallback = func(downloaded, total int64, speed float64) {
		// 스로틀 제어: 진행률 콜백이 200ms마다 트리거되며, 여기서 한 번 더 필터링
		if time.Since(lastUpdate) < time.Second {
			return
		}
		lastUpdate = time.Now()

		if total > 0 {
			pct := float64(downloaded) / float64(total) * 100
			fmt.Printf("진행률: %s / %s (%.1f%%) 속도: %s/s\n",
				httpc.FormatBytes(downloaded),
				httpc.FormatBytes(total),
				pct,
				httpc.FormatSpeed(speed))
		} else {
			fmt.Printf("다운로드됨: %s  속도: %s/s\n",
				httpc.FormatBytes(downloaded),
				httpc.FormatSpeed(speed))
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	result, err := httpc.Download(ctx,
		"https://example.com/files/large-archive.zip", cfg)
	if err != nil {
		log.Fatalf("다운로드 실패: %v", err)
	}

	fmt.Println("다운로드 완료")
	fmt.Printf("  파일 경로: %s\n", result.FilePath)
	fmt.Printf("  기록량:    %s\n", httpc.FormatBytes(result.BytesWritten))
	fmt.Printf("  소요 시간: %v\n", result.Duration)
	fmt.Printf("  평균 속도: %s/s\n", httpc.FormatSpeed(result.AverageSpeed))
	fmt.Printf("  상태 코드: %d\n", result.StatusCode)
	fmt.Printf("  이어받기:  %v\n", result.Resumed)
	fmt.Printf("  체크섬:    %s\n", result.ActualChecksum)
	// 출력 예시:
	// 진행률: 5.2 MB / 52.4 MB (9.9%) 속도: 12.3 MB/s
	// 진행률: 26.1 MB / 52.4 MB (49.8%) 속도: 11.8 MB/s
	// 진행률: 52.4 MB / 52.4 MB (100.0%) 속도: 12.1 MB/s
	// 다운로드 완료
	//   파일 경로: /tmp/large-archive.zip
	//   기록량:    52.4 MB
	//   소요 시간: 4.331s
	//   평균 속도: 12.1 MB/s
	//   상태 코드: 200
	//   이어받기:  false
	//   체크섬:    abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
}
```

## 참고

- [파일 업로드와 다운로드](../../guides/file-transfer) — 사용 가이드
- [패키지 함수](../core/functions) — `FormatBytes`/`FormatSpeed` 보조 함수 참조
- [도메인 클라이언트](./domain-client) — 도메인 클라이언트 다운로드 메서드
