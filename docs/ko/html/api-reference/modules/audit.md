---
sidebar_label: "감사 시스템"
title: "감사 시스템 - CyberGo html | 플러그형 감사 API"
description: "CyberGo html 플러그형 감사 API: AuditConfig 설정, 8가지 감사 이벤트, Info·Warn·Error 3개 수준, AuditEntry 구조와 Console·JSON·Channel 등 6종 내장 Sink 를 제공합니다."
sidebar_position: 4
---

# 감사 시스템

HTML 라이브러리는 플러그형 감사 파이프라인을 내장하여 보안 이벤트와 처리 예외를 기록합니다.

## AuditConfig

```go
type AuditConfig struct {
    Enabled            bool       `json:"enabled"`             // 감사 활성화
    LogBlockedTags     bool       `json:"log_blocked_tags"`    // 차단된 태그 기록
    LogBlockedAttrs    bool       `json:"log_blocked_attrs"`   // 차단된 속성 기록
    LogBlockedURLs     bool       `json:"log_blocked_urls"`    // 차단된 URL 기록
    LogInputViolations bool       `json:"log_input_violations"` // 입력 위반 기록
    LogDepthViolations bool       `json:"log_depth_violations"` // 깊이 위반 기록
    LogTimeouts        bool       `json:"log_timeouts"`        // 타임아웃 기록
    LogEncodingIssues  bool       `json:"log_encoding_issues"` // 인코딩 문제 기록
    LogPathTraversal   bool       `json:"log_path_traversal"`  // 경로 순회 시도 기록
    Sink               AuditSink  `json:"-"`                   // 감사 출력 대상 (JSON 직렬화에서 제외)
    IncludeRawValues   bool       `json:"include_raw_values"`  // 원시 값 포함
    MaxRawValueLength  int        `json:"max_raw_value_length"` // 원시 값 최대 길이
}
```

## 프리셋 감사 설정

### DefaultAuditConfig

기본 감사 설정 (기본적으로 비활성화, 모든 로그 플래그는 true).

```go
func DefaultAuditConfig() AuditConfig
```

| 필드 | 기본값 |
|------|--------|
| `Enabled` | `false` |
| `LogBlockedTags` | `true` |
| `LogBlockedAttrs` | `true` |
| `LogBlockedURLs` | `true` |
| `LogInputViolations` | `true` |
| `LogDepthViolations` | `true` |
| `LogTimeouts` | `true` |
| `LogEncodingIssues` | `true` |
| `LogPathTraversal` | `true` |
| `IncludeRawValues` | `false` |
| `MaxRawValueLength` | `200` |

### HighSecurityAuditConfig

고보안 감사 설정, 모든 로그와 원시 값 기록 활성화.

```go
func HighSecurityAuditConfig() AuditConfig
```

| 필드 | 기본값 |
|------|--------|
| `Enabled` | `true` |
| `LogBlockedTags` | `true` |
| `LogBlockedAttrs` | `true` |
| `LogBlockedURLs` | `true` |
| `LogInputViolations` | `true` |
| `LogDepthViolations` | `true` |
| `LogTimeouts` | `true` |
| `LogEncodingIssues` | `true` |
| `LogPathTraversal` | `true` |
| `IncludeRawValues` | `true` |
| `MaxRawValueLength` | `500` |

## 타입 정의

```go
type AuditEventType string  // 감사 이벤트 유형
type AuditLevel string      // 감사 심각도 레벨
```

## 감사 이벤트 유형

| 상수 | 값 | 설명 |
|------|------|------|
| `AuditEventBlockedTag` | `"blocked_tag"` | 차단된 태그 |
| `AuditEventBlockedAttr` | `"blocked_attr"` | 차단된 속성 |
| `AuditEventBlockedURL` | `"blocked_url"` | 차단된 URL |
| `AuditEventInputViolation` | `"input_violation"` | 입력 위반 |
| `AuditEventDepthViolation` | `"depth_violation"` | 깊이 위반 |
| `AuditEventTimeout` | `"timeout"` | 처리 타임아웃 |
| `AuditEventEncodingIssue` | `"encoding_issue"` | 인코딩 문제 |
| `AuditEventPathTraversal` | `"path_traversal"` | 경로 순회 시도 |

## 감사 레벨

| 상수 | 값 | 설명 |
|------|------|------|
| `AuditLevelInfo` | `"info"` | 정보 레벨 |
| `AuditLevelWarning` | `"warning"` | 경고 레벨 |
| `AuditLevelCritical` | `"critical"` | 심각 레벨 |

## AuditEntry

감사 로그 항목입니다.

```go
type AuditEntry struct {
    Timestamp time.Time      `json:"timestamp"`          // 이벤트 시간
    EventType AuditEventType `json:"event_type"`         // 이벤트 유형
    Level     AuditLevel     `json:"level"`              // 감사 레벨
    Message   string         `json:"message"`            // 이벤트 설명
    Tag       string         `json:"tag,omitempty"`      // 관련 태그
    Attribute string         `json:"attribute,omitempty"` // 관련 속성
    URL       string         `json:"url,omitempty"`      // 관련 URL
    InputSize int            `json:"input_size,omitempty"` // 입력 크기
    MaxSize   int            `json:"max_size,omitempty"` // 크기 제한
    Depth     int            `json:"depth,omitempty"`    // DOM 깊이
    MaxDepth  int            `json:"max_depth,omitempty"` // 깊이 제한
    Path      string         `json:"path,omitempty"`     // 파일 경로
    RawValue  string         `json:"raw_value,omitempty"` // 원시 값
    Metadata  map[string]any `json:"metadata,omitempty"` // 추가 메타데이터
}
```

## AuditSink 인터페이스

모든 Sink 타입은 이 인터페이스를 구현합니다.

```go
type AuditSink interface {
    Write(entry AuditEntry)
    Close() error
}
```

## Sink 타입

### LoggerAuditSink

표준 라이브러리 `log.Logger`로 출력하며, `[AUDIT]` 접두사가 붙습니다. `NewLoggerAuditSink()`는 **기본적으로 표준 오류**(`os.Stderr`)로 출력합니다; 파일이나 네트워크 연결 등으로 리다이렉트하려면 `NewLoggerAuditSinkWithWriter(w)`로 임의의 `io.Writer`를 지정하세요.

```go
func NewLoggerAuditSink() *LoggerAuditSink
func NewLoggerAuditSinkWithWriter(w io.Writer) *LoggerAuditSink
```

### ChannelAuditSink

버퍼링된 channel 로 전송하며, 비동기 처리나 외부 로깅 시스템과의 통합에 적합합니다. `Write`는 **비차단**입니다: 버퍼가 가득 찼을 때 해당 항목을 **버리고** 버려진 카운트를 증가시킵니다 (차단하지 않음, 오류 보고하지 않음). 호출자는 `DroppedCount()`로 버려진 수를 조회할 수 있으며, 모니터링에서 이를 기반으로 알림이나 스케일아웃을 트리거할 수 있습니다.

```go
func NewChannelAuditSink(bufferSize int) *ChannelAuditSink

func (s *ChannelAuditSink) Channel() <-chan AuditEntry
func (s *ChannelAuditSink) DroppedCount() int64
func (s *ChannelAuditSink) Close() error // 멱등: 여러 번 안전하게 호출 가능, 최초 1회만 실제로 channel 을 닫음
```

```go
sink := html.NewChannelAuditSink(100)
go func() {
    for entry := range sink.Channel() {
        log.Println(entry.Message)
    }
}()
```

### WriterAuditSink

JSON Lines 형식으로 `io.Writer`에 씁니다.

```go
func NewWriterAuditSink(w io.Writer) *WriterAuditSink
```

### MultiSink

여러 Sink 로 팬아웃합니다. `Close`는 Go 1.20+의 `errors.Join`으로 **모든 하위 Sink 가 반환한 닫기 오류를 집계**합니다(마지막 것만 유지하지 않음) — 감사 하위 시스템에서 초기 Sink 의 전달 실패를 버리면 실제 문제가 가려질 수 있기 때문입니다.

```go
func NewMultiSink(sinks ...AuditSink) *MultiSink
```

### FilteredSink

조건자 함수로 항목을 필터링합니다.

```go
func NewFilteredSink(sink AuditSink, filter func(AuditEntry) bool) *FilteredSink
```

### LevelFilteredSink

최소 레벨로 필터링합니다.

```go
func NewLevelFilteredSink(sink AuditSink, minLevel AuditLevel) *LevelFilteredSink
```

## 예시

```go
// 다층 감사 파이프라인 생성
writerSink := html.NewWriterAuditSink(auditFile)
levelSink := html.NewLevelFilteredSink(writerSink, html.AuditLevelWarning)
multiSink := html.NewMultiSink(levelSink, html.NewLoggerAuditSink())

cfg := html.DefaultConfig()
cfg.Audit = html.DefaultAuditConfig()
cfg.Audit.Enabled = true
cfg.Audit.Sink = multiSink

p, _ := html.New(cfg)
defer p.Close()

// 처리 후 감사 로그 가져오기
entries := p.GetAuditLog()
for _, e := range entries {
    fmt.Printf("[%s] %s: %s\n", e.Level, e.EventType, e.Message)
}
```
