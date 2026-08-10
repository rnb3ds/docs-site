---
sidebar_label: "미디어 추출 실전"
title: "미디어 추출 실전 - CyberGo html | 비디오와 오디오 추출 가이드"
description: "CyberGo html 미디어 추출 실전: 비디오 3소스 스캔(원본 HTML, DOM 순회, 정규식 폴백), 오디오 2소스 추출, VideoInfo와 AudioInfo 필드, Type으로 파일과 embed 임베드 구분을 다룹니다."
sidebar_position: 2
---

# 미디어 추출 실전

텍스트, 이미지, 링크 외에도 라이브러리는 HTML 에서 비디오와 오디오 리소스를 추출할 수 있습니다. 이 가이드는 추출 메커니즘과 필드 의미를 상세히 설명합니다.

## 추출 개요

`Extract`를 호출하면, 비디오와 오디오 추출은 DOM 파싱 이후, 콘텐츠 포맷팅 이전에 실행됩니다. 결과는 각각 `Result.Videos`와 `Result.Audios`에 저장됩니다.

```text
DOM 파싱 → 비디오 추출 (3소스) → 오디오 추출 (2소스) → 포맷팅 → Result
```

## 비디오 추출 (세 개 소스)

비디오 추출은 다음 순서로 실행되며, 각 URL 은 중복 제거되어 반복 수집되지 않습니다:

| 순서 | 소스 | 스캔 대상 | 설명 |
|------|------|----------|------|
| ① | 원본 HTML 스캔 | `iframe`/`embed`/`object`의 `src`/`data` 속성 | 안전한 정제 **이전에** 실행되어, 정제로 제거되는 임베드 태그가 유실되지 않도록 보장 |
| ② | DOM 순회 | `video`/`iframe`/`embed`/`object` 요소 | 파싱된 DOM 트리를 순회하며 요소 속성과 `<source>` 자식 요소를 읽음 |
| ③ | 정규식 폴백 | 비디오 파일 URL | HTML 텍스트 내의 노출된 비디오 링크를 스캔 |

:::tip 원본 HTML 을 스캔하는 이유
`iframe`, `embed`, `object` 등의 임베드 태그는 안전한 정제 단계에서 제거될 수 있습니다. 라이브러리는 정제 이전에 원본 HTML 문자열에서 이러한 태그의 미디어 URL 을 먼저 추출하여, 임베드된 비디오가 정제로 인해 유실되지 않도록 보장합니다.
:::

### 정규식 폴백이 지원하는 비디오 확장자

```
.mp4  .webm  .ogg  .mov  .avi  .wmv  .flv  .mkv  .m4v  .3gp
```

정규식은 `http://` 또는 `https://`로 시작하는 완전한 URL 만 매칭하여, 파일명 조각의 오매칭을 방지합니다.

## 오디오 추출 (두 개 소스)

| 순서 | 소스 | 스캔 대상 | 설명 |
|------|------|----------|------|
| ① | DOM 순회 | `audio` 요소 및 `<source>` 자식 요소 | `src` 속성 또는 자식 `<source>`의 `src`/`type`을 읽음 |
| ② | 정규식 폴백 | 오디오 파일 URL | HTML 텍스트 내의 노출된 오디오 링크를 스캔 |

### 정규식 폴백이 지원하는 오디오 확장자

```
.mp3  .wav  .ogg  .m4a  .aac  .flac  .wma  .opus  .oga
```

:::warning .ogg 확장자가 비디오와 오디오 목록에 모두 나타남
OGG 는 컨테이너 포맷으로, 비디오(Theora) 또는 오디오(Vorbis/Opus)를 담을 수 있습니다. `.ogg` 확장자의 URL 은 **비디오이자 오디오**로 감지되어, `Result.Videos`와 `Result.Audios`에 모두 나타날 수 있습니다. 오디오 전용 변형인 `.oga`는 오디오 목록에만 나타납니다.
:::

## 필드 상세

### VideoInfo

| 필드 | 타입 | 설명 |
|------|------|------|
| `URL` | `string` | 비디오 소스 주소 |
| `Type` | `string` | 감지된 타입: MIME 타입 (예: `video/mp4`) 또는 `embed` (iframe 이 페이지를 임베드) |
| `Poster` | `string` | `<video>`의 `poster` 속성 (포스터 이미지 URL) |
| `Width` | `string` | 너비 속성 (원본 문자열, 숫자로 파싱되지 않음) |
| `Height` | `string` | 높이 속성 (원본 문자열, 숫자로 파싱되지 않음) |
| `Duration` | `string` | 재생 시간 속성 (원본 문자열, 숫자로 파싱되지 않음) |

### AudioInfo

| 필드 | 타입 | 설명 |
|------|------|------|
| `URL` | `string` | 오디오 소스 주소 |
| `Type` | `string` | 감지된 타입: MIME 타입 (예: `audio/mpeg`) |
| `Duration` | `string` | 재생 시간 속성 (원본 문자열, 숫자로 파싱되지 않음) |

### Type 필드의 값 규칙

`Type`은 두 가지 비디오 소스를 구분합니다:

| Type 값 | 의미 | 발생 시나리오 |
|---------|------|----------|
| `embed` | iframe 이 참조하는 비디오 페이지 | YouTube, Vimeo, Youku, Bilibili 등 임베드형 플레이어 |
| MIME 타입 (예: `video/mp4`) | 비디오 파일 컨테이너 | 정규식 폴백으로 매칭된 노출 URL, 또는 `<source type="...">` 속성값 |
| 빈 문자열 | 타입을 감지하지 못함 | `<video src="...">`로 직접 소스를 지정 (`<source>` 자식 요소가 없을 때) |

`embed` 감지를 지원하는 임베드 플랫폼:

| 플랫폼 | URL 패턴 |
|------|----------|
| YouTube | `youtube.com/embed/`, `youtube-nocookie.com/embed/` |
| Vimeo | `player.vimeo.com/video/` |
| Dailymotion | `dailymotion.com/embed/` |
| Youku | `player.youku.com/` |
| Tencent Video | `v.qq.com/` |
| Bilibili | `bilibili.com/` |

## 완전한 예제

```go
package main

import (
    "fmt"
    "log"

    "github.com/cybergodev/html"
)

func main() {
    // 3가지 미디어 시나리오를 포함한 HTML:
    // 1. iframe YouTube 임베드 (Type = "embed")
    // 2. <source> 자식 요소가 있는 네이티브 비디오 (Type은 type 속성에서)
    // 3. <source> 자식 요소가 있는 오디오 (Type은 type 속성에서)
    data := []byte(`<html><body><article>
        <h1>멀티미디어 페이지</h1>
        <p>이 문서는 비디오와 오디오 기술을 소개합니다.</p>
        <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" width="560" height="315"></iframe>
        <video poster="poster.jpg" width="640" height="360">
            <source src="https://example.com/trailer.mp4" type="video/mp4">
        </video>
        <audio>
            <source src="https://example.com/episode.mp3" type="audio/mpeg">
        </audio>
    </article></body></html>`)

    result, err := html.Extract(data)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Printf("비디오 수: %d\n", len(result.Videos))
    // 비디오 수: 2

    for i, v := range result.Videos {
        fmt.Printf("  비디오 %d: %s\n", i+1, v.URL)
        fmt.Printf("    Type: %s", v.Type)
        if v.Poster != "" {
            fmt.Printf(", 포스터: %s", v.Poster)
        }
        if v.Width != "" || v.Height != "" {
            fmt.Printf(", 크기: %sx%s", v.Width, v.Height)
        }
        fmt.Println()
    }
    // 비디오 1: https://www.youtube.com/embed/dQw4w9WgXcQ
    //   Type: embed, 크기: 560x315
    // 비디오 2: https://example.com/trailer.mp4
    //   Type: video/mp4, 포스터: poster.jpg, 크기: 640x360

    fmt.Printf("\n오디오 수: %d\n", len(result.Audios))
    // 오디오 수: 1

    for i, a := range result.Audios {
        fmt.Printf("  오디오 %d: %s (Type: %s)\n", i+1, a.URL, a.Type)
    }
    // 오디오 1: https://example.com/episode.mp3 (Type: audio/mpeg)
}
```

## 설정 제어

### Preserve* 옵션

`PreserveVideos`와 `PreserveAudios`는 `Extract` 결과에 미디어를 포함할지 제어합니다:

| 설정 필드 | 기본값 | 동작 |
|----------|--------|------|
| `PreserveVideos` | `true` | `false`일 때 `Result.Videos`가 빈 슬라이스가 됨 |
| `PreserveAudios` | `true` | `false`일 때 `Result.Audios`가 빈 슬라이스가 됨 |

```go
cfg := html.DefaultConfig()

// 비디오와 오디오 추출 비활성화 (텍스트, 이미지, 링크만 유지)
cfg.PreserveVideos = false
cfg.PreserveAudios = false

result, err := html.Extract(data, cfg)
// result.Videos → []
// result.Audios → []
```

### Preserve* 와 Include* 의 차이

두 설정 그룹은 독립적으로 동작하며, 서로 다른 API 를 제어합니다:

| 설정 그룹 | 제어하는 API | 설명 |
|--------|-----------|------|
| `PreserveVideos`/`PreserveAudios` | `Extract` | `Result.Videos`/`Result.Audios`의 채움 여부 제어 |
| `IncludeVideos`/`IncludeAudios` | `ExtractAllLinks` | 링크 열거에 비디오/오디오 URL 포함 여부 제어 |

:::warning 두 설정은 독립적
`PreserveVideos`를 꺼도 `ExtractAllLinks`의 `IncludeVideos`에 영향을 주지 않으며, 그 반대도 마찬가지입니다. 사용하는 API 에 맞는 옵션을 설정하세요.
:::

### TextOnlyConfig 성능 프리셋

텍스트만 필요할 때, `TextOnlyConfig()`는 모든 `Preserve*` 옵션을 이미 비활성화하므로 수동 설정이 불필요합니다:

```go
cfg := html.TextOnlyConfig()
// PreserveImages = false
// PreserveLinks = false
// PreserveVideos = false
// PreserveAudios = false

result, err := html.Extract(data, cfg)
// 모든 미디어 추출을 건너뛰고 최적의 성능
```

## 다음 단계

- [콘텐츠 추출 실전](./content-extraction) - 추출 흐름과 문서 인식
- [출력 형식 실전](./output-formats) - 순수 텍스트, Markdown, JSON 비교
- [API 레퍼런스: 데이터 타입](../../api-reference/types/type-defs) - VideoInfo/AudioInfo 전체 정의
