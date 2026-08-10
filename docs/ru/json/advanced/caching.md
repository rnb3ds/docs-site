---
sidebar_label: "Кэш и пред.парсинг"
title: "Кэш и пред.парсинг - CyberGo JSON | Стратегии кэша"
description: "Кэш и предпарсинг CyberGo JSON: EnableCache, GetStats мониторинг, WarmupCache прогрев, PreParse и CacheSharedResults zero-copy, ClearCache — стратегии."
sidebar_position: 3
---

# Стратегии кэширования и предпарсинга

CyberGo JSON поставляется со **встроенной подсистемой автоматического кэширования**: результаты парсинга и path-запросы кэшируются автоматически, без ручного `sync.Map`. На этой странице — настройка, мониторинг и прогрев встроенного кэша, паттерн `PreParse`, и руководство по выбору.

:::tip Подсказка Разделение с страницей производительности
Раздел «Стратегия кэширования» в [Производительности](./performance) показывает **пользовательский** кэш на `sync.Map`; эта страница документирует **встроенный в библиотеку** кэш (`EnableCache`/`WarmupCache`/`PreParse`). Они дополняют друг друга.
:::

## Как работает встроенный кэш

Когда `Config.EnableCache` равен `true` (по умолчанию) и `CacheResults` равен `true` (по умолчанию), операции запроса вроде `Get` кэшируются автоматически:

1. **Кэш парсинга**: JSON-строка -> разобранное дерево `any` (ключ — FNV-1a хэш)
2. **Кэш результатов**: `(JSON, path)` -> результат запроса

Второй запрос к тому же JSON пропускает парсинг и сразу переходит к навигации по пути; идентичная пара `(JSON, path)` напрямую возвращает кэшированный результат.

:::warning Предупреждение Автоматическая инвалидация при записи
Операции изменения (`Set`/`Delete`) **автоматически инвалидируют** связанные записи кэша (очистка по префиксу хэша JSON) — ручное вмешательство не требуется. `ClearCache` нужен только при изменении внешнего источника данных или при высоком давлении на память.
:::

## Мониторинг hit ratio

`GetStats()` возвращает `Stats` со счётчиками попаданий/промахов, коэффициентом попаданий и текущим числом записей.

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	data := `{"user":{"name":"Alice","email":"alice@example.com"},"version":1}`

	// Прогрев часто используемых путей: внутренне выполняет Get для каждого пути и сохраняет в кэш
	paths := []string{"user.name", "user.email", "version"}
	result, err := processor.WarmupCache(data, paths)
	if err != nil {
		panic(err)
	}
	fmt.Printf("Прогрето: %d/%d (успех %.0f%%)\n", result.Successful, result.TotalPaths, result.SuccessRate)
	// Вывод: Прогрето: 3/3 (успех 100%)

	// Тот же запрос (JSON, path) попадает в кэш
	name, err := processor.Get(data, "user.name")
	if err != nil {
		panic(err)
	}
	fmt.Printf("user.name = %v\n", name)
	// Вывод: user.name = Alice

	// Проверка конфигурации и состояния кэша
	stats := processor.GetStats()
	fmt.Printf("Кэш включён: %v, TTL: %v\n", stats.CacheEnabled, stats.CacheTTL)
	// Вывод: Кэш включён: true, TTL: 5m0s
}
```

Ключевые поля `Stats` (полная структура — в [Жизненный цикл и статистика](../api-reference/processor/lifecycle#статистика)):

| Поле | Описание |
|------|------|
| `HitRatio` | Коэффициент попаданий (0–1); ниже 0.5 — повод пересмотреть нагрузку или настройки |
| `HitCount` / `MissCount` | Накопленные попадания / промахи |
| `CacheSize` | Текущее число записей кэша |
| `CacheTTL` | Срок жизни записи кэша |

## Прогрев кэша WarmupCache

`WarmupCache(jsonStr, paths, cfg...)` массово заполняет кэш до реальных запросов, устраняя cold-start задержку первого запроса. Подходит для сервисов, принимающих трафик сразу после запуска.

```go
// Сигнатура: func (p *Processor) WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)
```

`WarmupResult` содержит `TotalPaths`/`Successful`/`Failed`/`SuccessRate`/`FailedPaths` — полезен для проверки полноты прогрева (опечатка в пути конфига проявится как запись в `FailedPaths`).

:::warning Предупреждение Предусловие
Вызов `WarmupCache` при `EnableCache = false` возвращает ошибку (нельзя греть отключённый кэш). Прогрев должен выполняться на **том же экземпляре Processor**, что и запросы. Пакетные функции (например, `json.GetString`) используют глобальный Processor, кэш которого изолирован от пользовательского экземпляра.
:::

## Паттерн PreParse

Когда **один и тот же JSON запрашивается по множеству путей**, `PreParse` + `GetFromParsed` — наиболее прямой паттерн: разобрать один раз, затем многократно запрашивать разобранный результат, полностью обходя поиск ключа кэша.

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	data := `{"users":[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}],"total":2}`

	// Один парс, много запросов (пропуск повторного разбора)
	parsed, err := processor.PreParse(data)
	if err != nil {
		panic(err)
	}
	defer parsed.Release()

	// Несколько путей разделяют один разобранный результат
	for _, path := range []string{"users[0].name", "users[1].name", "total"} {
		val, err := processor.GetFromParsed(parsed, path)
		if err != nil {
			panic(err)
		}
		fmt.Printf("%s = %v\n", path, val)
	}
	// Вывод:
	// users[0].name = Alice
	// users[1].name = Bob
	// total = 2
}
```

Ключевые API:

| API | Сигнатура | Описание |
|-----|------|------|
| `PreParse` | `func (p *Processor) PreParse(jsonStr string, cfg ...Config) (*ParsedJSON, error)` | Разбирает и возвращает переиспользуемый `*ParsedJSON` |
| `GetFromParsed` | `func (p *Processor) GetFromParsed(parsed *ParsedJSON, path string, cfg ...Config) (any, error)` | Запрос из предразобранного результата, без шага парсинга |
| `(*ParsedJSON).Release` | `func (p *ParsedJSON) Release()` | Освобождает ссылку; вызывать по завершении (обычно через `defer`) |

:::tip Подсказка PreParse vs автоматический кэш
`PreParse` явно удерживает дескриптор разобранного результата и подходит для локальных потоков «разобрал в одном месте — потребил во многих». Автоматический кэш **глобально дедуплицирует по содержимому JSON**, подходя для повторных запросов одного JSON из разных точек вызова. Они сосуществуют: `PreParse` внутренне также пишет в кэш парсинга.
:::

## Тонкая настройка кэша

Поведение кэша управляется несколькими полями `Config` (полный список — в [Config](../api-reference/config#структура-config)):

| Поле | По умолчанию | Описание |
|------|--------|------|
| `EnableCache` | `true` | Главный переключатель; при выключении всё кэширование пропускается (`Get` использует быстрый путь) |
| `CacheResults` | `true` | Кэшировать ли результаты запросов; `false` оставляет только кэш парсинга |
| `CacheTTL` | `5 минут` | Срок жизни записи |
| `MaxCacheSize` | `128` | Максимум записей (вытеснение LRU) |
| `CacheSharedResults` | `false` | Разделение результатов кэша, пропуск защитного deep copy (высокопроизводительный только для чтения) |

```go
package main

import (
	"fmt"
	"time"

	"github.com/cybergodev/json"
)

func main() {
	cfg := json.DefaultConfig()
	cfg.MaxCacheSize = 256            // больше горячих данных
	cfg.CacheTTL = 10 * time.Minute   // продлить срок действия

	processor, err := json.New(cfg)
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	data := `{"key":"value"}`
	_, err = processor.Get(data, "key")
	if err != nil {
		panic(err)
	}
	fmt.Println("Запрос выполнен")
	// Вывод: Запрос выполнен
}
```

### Контракт CacheSharedResults (zero-copy)

При `CacheSharedResults = true` попадание кэша в `Get`/`GetFromParsed` возвращает значение **напрямую**, пропуская защитный deep copy и резко снижая накладные расходы повторного чтения больших объектов.

:::danger Опасность Контракт «только чтение»
При включении **вызывающий не должен изменять** возвращённые `map[string]any` / `[]any`, иначе общий кэш повреждается и последующие чтения загрязняются. Примитивы (`bool`/`float64`/`string`/`json.Number`/`nil`) неизменяемы и всегда безопасны. Включайте только когда вызывающий рассматривает результат как только для чтения (например, аналитическая нагрузка, многократно читающая одно большое поддерево).
:::

## Очистка и инвалидация

| Операция | API | Когда |
|------|-----|----------|
| Ручная очистка | `processor.ClearCache()` | Изменился источник данных, давление на память, принудительное обновление |
| Автоинвалидация после записи | внутренний вызов в `Set`/`Delete` | Ручная очистка после изменений не нужна; записи удаляются по префиксу хэша JSON |

`ClearCache` подходит для сценария «один Processor работает долго с ротацией источников данных». Одноразовым скриптам ручная очистка не нужна — `Close()` освобождает все ресурсы.

## Рецепт: кэширование высокочастотных запросов

Этот рецепт объединяет прогрев, PreParse и мониторинг — подходит для API-шлюзов / конфиг-центров с высоким объёмом чтения.

```go
package main

import (
	"fmt"

	"github.com/cybergodev/json"
)

func main() {
	processor, err := json.New()
	if err != nil {
		panic(err)
	}
	defer processor.Close()

	configJSON := `{"db":{"host":"db.local","port":5432},"cache":{"ttl":300},"features":["audit","metrics"]}`

	// 1. Прогрев горячих путей при запуске
	hotPaths := []string{"db.host", "db.port", "cache.ttl"}
	if _, err := processor.WarmupCache(configJSON, hotPaths); err != nil {
		panic(err)
	}

	// 2. Извлечение нескольких полей из одной конфигурации (паттерн PreParse)
	parsed, err := processor.PreParse(configJSON)
	if err != nil {
		panic(err)
	}
	defer parsed.Release()

	host, err := processor.GetFromParsed(parsed, "db.host")
	if err != nil {
		panic(err)
	}
	fmt.Printf("Хост БД: %v\n", host)
	// Вывод: Хост БД: db.local

	// 3. Мониторинг hit ratio во время выполнения, тревога ниже порога
	stats := processor.GetStats()
	fmt.Printf("Текущий hit ratio: %.2f%%\n", stats.HitRatio*100)
}
```

## Руководство по выбору

| Сценарий | Рекомендация | Почему |
|------|----------|------|
| Одноразовый запрос / скрипт | Конфигурация по умолчанию | Встроенный кэш не обременяет одиночный вызов; у `Get` есть быстрый путь |
| Один JSON запрашивается повторно (разные точки вызова) | Держать `EnableCache=true` | Автодедупликация по содержимому JSON, без изменения кода |
| Один JSON, один парс, пакетный запрос по многим путям | `PreParse` + `GetFromParsed` | Явно переиспользует результат парсинга, обходит стоимость ключа кэша |
| Сервис с трафиком сразу после запуска | Прогрев `WarmupCache` | Устраняет cold-start задержку первой пачки |
| Многократное чтение одного большого поддерева только для чтения | `CacheSharedResults=true` | Пропуск deep copy ради zero-copy производительности |
| Недоверенный ввод / чувствительность к безопасности | `SecurityConfig()` (короче TTL) | Безопасный пресет использует консервативные параметры кэша |

## См. также

- [Производительность](./performance) — переиспользование Processor, оптимизация памяти, бенчмарки
- [Жизненный цикл и статистика](../api-reference/processor/lifecycle#статистика) — детали API `GetStats`/`WarmupCache`/`ClearCache`
- [Config](../api-reference/config) — полный справочник полей кэша
- [Параллельность и конкурентность](./concurrency) — потокобезопасность Processor и параллельные итераторы
