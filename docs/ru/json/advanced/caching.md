---
sidebar_label: "Кэш и пред.парсинг"
title: "Кэш и пред.парсинг - CyberGo JSON | Стратегии кэша"
description: "Встроенный кэш CyberGo JSON: EnableCache, GetStats мониторинг, WarmupCache прогрев, PreParse, CacheSharedResults zero-copy, ClearCache — стратегии и выбор."
sidebar_position: 3
---

# Стратегии кэширования и предпарсинга

CyberGo JSON поставляется со **встроенной подсистемой автоматического кэширования**: результаты парсинга и path-запросы кэшируются автоматически, без ручного `sync.Map`. На этой странице — настройка, мониторинг и прогрев встроенного кэша, паттерн `PreParse` и руководство по выбору.

:::tip Подсказка Разделение со страницей производительности
Раздел «Стратегия кэширования» на странице [Производительность](./performance) показывает **пользовательский** кэш на `sync.Map`; эта страница документирует **встроенный в библиотеку** кэш (`EnableCache`/`WarmupCache`/`PreParse`). Они дополняют друг друга.
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

`GetStats()` возвращает `Stats` со счётчиками попаданий/промахов, коэффициентом попаданий и текущим числом записей. Первый запрос — промах (по одному miss в кэше парсинга и кэше результатов), повторный запрос той же пары `(JSON, path)` — попадание:

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

	// Первый запрос: промах и результата, и парсинга
	_, err = processor.Get(data, "user.name")
	if err != nil {
		panic(err)
	}

	// Повторный запрос той же пары (JSON, path): прямое попадание в кэш результатов
	_, err = processor.Get(data, "user.name")
	if err != nil {
		panic(err)
	}

	stats := processor.GetStats()
	fmt.Printf("Попаданий %d, промахов %d (hit ratio %.1f%%)\n",
		stats.HitCount, stats.MissCount, stats.HitRatio*100)
	// Вывод: Попаданий 1, промахов 2 (hit ratio 33.3%)

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

`WarmupCache(jsonStr, paths, cfg...)` массово заполняет кэш до реальных запросов, устраняя cold-start задержку первой пачки запросов. Подходит для сервисов, принимающих трафик сразу после запуска.

```go
// Сигнатура: func (p *Processor) WarmupCache(jsonStr string, paths []string, cfg ...Config) (*WarmupResult, error)
```

`WarmupResult` содержит `TotalPaths`/`Successful`/`Failed`/`SuccessRate`/`FailedPaths` — полезен для проверки полноты прогрева (опечатка в пути конфигурации проявится как запись в `FailedPaths`).

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

	data := `{"db":{"host":"db.local","port":5432},"cache":{"ttl":300}}`

	// Прогрев горячих путей при запуске сервиса (внутренне выполняет Get для каждого пути и пишет в кэш)
	hotPaths := []string{"db.host", "db.port", "cache.ttl"}
	result, err := processor.WarmupCache(data, hotPaths)
	if err != nil {
		panic(err)
	}
	fmt.Printf("Прогрето: %d/%d успешно (успешность %.0f%%)\n",
		result.Successful, result.TotalPaths, result.SuccessRate)
	// Вывод: Прогрето: 3/3 успешно (успешность 100%)

	// После прогрева первая партия бизнес-запросов сразу попадает в кэш (парсинг первого пути — промах, остальные пути разделяют кэш парсинга)
	_, err = processor.Get(data, "db.host")
	if err != nil {
		panic(err)
	}
	stats := processor.GetStats()
	fmt.Printf("Попаданий %d / промахов %d\n", stats.HitCount, stats.MissCount)
	// Вывод: Попаданий 3 / промахов 4
}
```

:::warning Предупреждение Предусловия
При `EnableCache = false` вызов `WarmupCache` возвращает ошибку (нельзя прогреть отключённый кэш). Прогрев должен выполняться на **том же экземпляре Processor** — пакетные функции (например, `json.GetString`) используют глобальный Processor, кэш которого изолирован от пользовательского экземпляра.
:::

## Режим предпарсинга PreParse

Когда **один и тот же JSON запрашивается по множеству путей**, `PreParse` + `GetFromParsed` — самый прямой паттерн: один парс, многократные запросы разделяют результат парсинга, полностью минуя поиск ключа кэша.

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

:::tip Подсказка PreParse против автоматического кэша
`PreParse` явно удерживает дескриптор результата парсинга и подходит для локальных потоков «разобрал в одном месте — потребил во многих»; автоматический кэш **глобально дедуплицирует по содержимому JSON** и подходит, когда один и тот же JSON запрашивается из разных точек вызова. Они сосуществуют: `PreParse` внутренне также пишет в кэш парсинга.
:::

## Тонкая настройка кэша

Поведение кэша управляется несколькими полями `Config` (полный список — в [Config](../api-reference/config#структура-config)):

| Поле | По умолчанию | Описание |
|------|--------|------|
| `EnableCache` | `true` | Главный переключатель; при выключении всё кэширование пропускается (`Get` использует быстрый путь) |
| `CacheResults` | `true` | Кэшировать ли результаты запросов; `false` оставляет только кэш парсинга |
| `CacheTTL` | `5 минут` | Срок жизни записи |
| `MaxCacheSize` | `128` | Максимум записей (вытеснение LRU) |
| `CacheSharedResults` | `false` | Разделение результатов кэша, пропуск защитного deep copy (высокопроизводительные сценарии только для чтения) |

```go
package main

import (
	"fmt"
	"time"

	"github.com/cybergodev/json"
)

func main() {
	cfg := json.DefaultConfig()
	cfg.MaxCacheSize = 256          // больше горячих данных
	cfg.CacheTTL = 10 * time.Minute // продлить срок действия

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

Для сценариев «много чтения, мало записи» с результатами только для чтения можно дополнительно включить zero-copy переключатель:

```go
// Контракт: после включения вызывающий не должен изменять map/slice, возвращаемые Get (примитивы всегда безопасны)
cfg := json.DefaultConfig()
cfg.CacheSharedResults = true
```

### Контракт zero-copy CacheSharedResults

При `CacheSharedResults = true` попадание кэша в `Get`/`GetFromParsed` **возвращает кэшированное значение напрямую**, пропуская защитный deep copy и заметно снижая накладные расходы повторного чтения больших объектов.

:::danger Опасность Контракт «только чтение»
После включения **вызывающий не должен изменять** возвращаемые `map[string]any` / `[]any`, иначе общий кэш будет повреждён и последующие чтения загрязнены. Примитивы (`bool`/`float64`/`string`/`json.Number`/`nil`) неизменяемы и всегда безопасны. Включайте только если вызывающий считает результат только для чтения (например, аналитическая нагрузка, многократно читающая одно большое поддерево).
:::

## Очистка и инвалидация

| Операция | API | Когда |
|------|-----|----------|
| Ручная очистка | `processor.ClearCache()` | Изменился источник данных, давление на память, нужно принудительное обновление |
| Автоинвалидация после записи | внутренний вызов в `Set`/`Delete` | Ручная очистка после изменений не нужна; записи удаляются по префиксу хэша JSON |

`ClearCache` подходит для сценария «один Processor работает долго, источники данных ротируются». Одноразовым скриптам ручная очистка не нужна — `Close()` освобождает все ресурсы.

## Рецепт: кэширование высокочастотных запросов

Этот рецепт объединяет прогрев, PreParse и мониторинг — подходит для API-шлюзов / конфиг-центров и других сценариев интенсивного чтения.

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

	// 2. Пакетное извлечение полей из одной конфигурации (паттерн PreParse)
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

	// 3. Бизнес-запросы стабильно попадают в кэш (прогрев и предпарсинг уже его заполнили)
	for _, path := range []string{"db.host", "db.port", "cache.ttl"} {
		_, err = processor.Get(configJSON, path)
		if err != nil {
			panic(err)
		}
	}

	// 4. Мониторинг hit ratio во время работы; тревога при падении ниже порога
	stats := processor.GetStats()
	fmt.Printf("Попаданий %d / промахов %d (hit ratio %.1f%%)\n",
		stats.HitCount, stats.MissCount, stats.HitRatio*100)
	// Вывод: Попаданий 6 / промахов 4 (hit ratio 60.0%)
	if stats.HitRatio < 0.5 {
		fmt.Println("Тревога: hit ratio ниже 50%, проверьте нагрузку или настройте CacheTTL/MaxCacheSize")
	}

	// 5. При ротации конфигурации (изменении источника) — ручная очистка, чтобы не читать устаревшие значения
	processor.ClearCache()
	stats = processor.GetStats()
	fmt.Printf("Записей в кэше после очистки: %d\n", stats.CacheSize)
	// Вывод: Записей в кэше после очистки: 0
}
```

## Руководство по выбору

| Сценарий | Рекомендация | Почему |
|------|----------|------|
| Одноразовый запрос / скрипт | Конфигурация по умолчанию | Встроенный кэш не обременяет одиночный вызов; у `Get` есть быстрый путь |
| Один и тот же JSON запрашивается повторно (разные точки вызова) | Держать `EnableCache=true` | Автодедупликация по содержимому JSON, ноль изменений кода |
| Один JSON: один парс, пакетный запрос по многим путям | `PreParse` + `GetFromParsed` | Явное переиспользование результата парсинга, обход стоимости ключа кэша |
| Сервис принимает трафик сразу после запуска | Прогрев `WarmupCache` | Устраняет cold-start задержку первой пачки запросов |
| Повторное чтение одного большого поддерева только для чтения | `CacheSharedResults=true` | Пропуск deep copy ради zero-copy производительности |
| Недоверенный ввод / критичность безопасности | `SecurityConfig()` (короче TTL) | Безопасная конфигурация использует консервативные параметры кэша |

## См. также

- [Производительность](./performance) — переиспользование Processor, оптимизация памяти, бенчмарки
- [Жизненный цикл и статистика](../api-reference/processor/lifecycle#статистика) — детали API `GetStats`/`WarmupCache`/`ClearCache`
- [Конфигурация Config](../api-reference/config) — полное описание полей, связанных с кэшем
- [Конкурентность и параллелизм](./concurrency) — потокобезопасность Processor и параллельные итераторы
