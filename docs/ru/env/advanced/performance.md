---
sidebar_label: "Оптимизация производительности"
title: "Оптимизация производительности - CyberGo env | настройка высококонкурентного чтения/записи"
description: "Руководство по оптимизации производительности CyberGo env: механизм конкурентной безопасности RWMutex и сегментированных блокировок, переиспользование пула объектов sync.Pool для значительного сокращения аллокаций, баланс накладных расходов блокировки памяти mlock и потокового разбора больших файлов, с сравнительными бенчмарками, анализом конкурентной пропускной способности и рекомендациями по настройке MaxFileSize/MaxVariables."
sidebar_position: 1
---

# Оптимизация производительности

Библиотека env оптимизирована для высокопроизводительных сценариев. В этом документе описываются характеристики производительности, связанные с конкурентностью, пулом объектов и управлением памятью.

## Конкурентная безопасность

### Гарантия потокобезопасности

Все методы `Loader` потокобезопасны:

```go
loader, _ := env.New(env.DefaultConfig())
defer loader.Close()

var wg sync.WaitGroup

// Конкурентное чтение
for i := 0; i < 100; i++ {
    wg.Add(1)
    go func() {
        defer wg.Done()
        loader.GetString("KEY")
    }()
}

// Конкурентная запись
for i := 0; i < 100; i++ {
    wg.Add(1)
    go func(n int) {
        defer wg.Done()
        loader.Set(fmt.Sprintf("KEY_%d", n), "value")
    }(i)
}

wg.Wait()
```

### Потокобезопасность пакетных функций

Пакетные функции используют глобальный загрузчик и также потокобезопасны:

```go
var wg sync.WaitGroup

for i := 0; i < 100; i++ {
    wg.Add(1)
    go func() {
        defer wg.Done()
        env.GetString("KEY", "default")
    }()
}

wg.Wait()
```

### Внутренняя реализация

Библиотека использует сегментированное хранилище (Sharded Storage) для уменьшения конкуренции блокировок:

```text
┌─────────────────────────────────────────┐
│          Loader (8 сегментов)            │
├─────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐    ┌────────┐ │
│  │ Shard 0 │ │ Shard 1 │... │ Shard 7│ │
│  │  Lock   │ │  Lock   │    │  Lock  │ │
│  │  Data   │ │  Data   │    │  Data  │ │
│  └─────────┘ └─────────┘    └────────┘ │
└─────────────────────────────────────────┘
```

- Ключи распределяются по разным сегментам на основе хэш-значения
- Каждый сегмент имеет независимую блокировку
- Снижается конкуренция блокировок, повышается конкурентная производительность

## Пул объектов

### Зачем нужен пул объектов

Частое создание и уничтожение объектов увеличивает давление на GC:

```text
Без пула объектов:
Создание объекта → Использование → Сбор GC → Создание объекта → Использование → Сбор GC ...

С пулом объектов:
Создание объекта → Использование → Возврат в пул → Получение → Использование → Возврат в пул ...
```

### Пул SecureValue

Объекты `SecureValue` управляются через пул:

```go
// Получение SecureValue (возможно переиспользование из пула)
secret := env.GetSecure("API_KEY")

// Использование (Reveal возвращает открытый текст, String/Masked — маскированное)
value := secret.Reveal()

// Возврат в пул
secret.Close()  // или secret.Release()
```

### Правильное использование пула объектов

**Своевременное освобождение:**

```go
func processData() {
    secret := env.GetSecure("SECRET")
    defer secret.Close()  // Гарантия освобождения

    // Использование secret...
}
```

**Не удерживайте ссылки:**

```go
// Ошибка: удержание ссылки на освобождённый объект
var globalSecret *env.SecureValue

func init() {
    globalSecret = env.GetSecure("KEY")
    globalSecret.Close()  // После освобождения объект может быть переиспользован
}

func later() {
    // Опасно: globalSecret может уже использоваться другим кодом
    globalSecret.String()
}

// Правильно: получать каждый раз при необходимости
func getSecret() string {
    secret := env.GetSecure("KEY")
    defer secret.Close()
    return secret.Reveal()
}
```

**Проверка состояния закрытия:**

```go
secret := env.GetSecure("KEY")

// Проверка перед использованием
if secret.IsClosed() {
    // Объект закрыт, использовать нельзя
}

// Закрытие после использования
secret.Close()

// Проверка после закрытия
if secret.IsClosed() {
    // Закрыт
}
```

## Безопасность памяти

### Блокировка памяти

Включение блокировки памяти предотвращает выгрузку чувствительных данных на диск:

```go
// Проверка поддержки платформы
if env.IsMemoryLockSupported() {
    env.SetMemoryLockEnabled(true)
}
```

**Поддержка платформ:**

| Платформа | Поддержка |
|-----------|-----------|
| Linux | ✅ |
| macOS | ✅ |
| Windows | ✅ |
| FreeBSD | ✅ |
| wasm | ❌ |

::: tip Подробности
[SecureValue API — конфигурация блокировки памяти](/ru/env/api-reference/secure-value#Конфигурация-блокировки-памяти) для полного описания конфигурации.
:::

### Строгий режим

В строгом режиме неудача блокировки памяти вызывает ошибку:

```go
env.SetMemoryLockStrict(true)

secret, err := env.NewSecureValueStrict("sensitive_data")
if err != nil {
    // Блокировка памяти не удалась
}
```

### Безопасное обнуление

`SecureValue` автоматически обнуляет память при закрытии:

```go
secret := env.GetSecure("PASSWORD")
// Внутреннее хранилище: ['p', 'a', 's', 's', ...]

secret.Close()
// Внутреннее хранилище: [0, 0, 0, 0, ...]
```

Ручное обнуление среза байтов:

```go
sensitiveBytes := []byte("secret")
env.ClearBytes(sensitiveBytes)
// sensitiveBytes теперь все 0
```

## Шаблоны производительности

### Только чтение после инициализации

Самый эффективный шаблон: загрузка конфигурации при запуске, только чтение во время выполнения:

```go
var config *Config

func init() {
    env.Load(".env")

    config = &Config{}
    env.ParseInto(config)
}

// Безопасное чтение из любой goroutine
func getValue() string {
    return config.Key
}
```

### Динамическое обновление конфигурации

Шаблон для динамического обновления конфигурации:

```go
type ConfigManager struct {
    loader *env.Loader
    mu     sync.RWMutex
}

func (m *ConfigManager) Refresh() error {
    m.mu.Lock()
    defer m.mu.Unlock()

    return m.loader.LoadFiles(".env")
}

func (m *ConfigManager) Get(key string) string {
    m.mu.RLock()
    defer m.mu.RUnlock()

    return m.loader.GetString(key)
}
```

### Сокращение времени удержания блокировки

```go
// Не рекомендуется: длительные операции внутри блокировки
func (l *Loader) ProcessValue(key string) {
    value := l.GetString(key)
    // Длительная операция...
    processValue(value)
}

// Рекомендуется: быстрое чтение, обработка вне блокировки
func ProcessValue(key string) {
    value := loader.GetString(key)  // Быстрое получение
    go processValue(value)          // Асинхронная обработка
}
```

### Пакетные операции

```go
// Однократное получение всех необходимых значений
func LoadAllConfig(loader *env.Loader) *Config {
    return &Config{
        Host:    loader.GetString("HOST"),
        Port:    loader.GetInt("PORT"),
        Debug:   loader.GetBool("DEBUG"),
        Timeout: loader.GetDuration("TIMEOUT"),
    }
}
```

### Избегайте частых вызовов

```go
// Не рекомендуется: чтение при каждом запросе
func Handler(w http.ResponseWriter, r *http.Request) {
    apiKey := env.GetString("API_KEY")  // Блокировка при каждом запросе
    // ...
}

// Рекомендуется: кэширование при запуске
var apiKey string

func init() {
    env.Load(".env")
    apiKey = env.GetString("API_KEY")
}

func Handler(w http.ResponseWriter, r *http.Request) {
    // Прямое использование кэшированного значения
    // ...
}
```

## Влияние на производительность

### Выгода пула объектов

| Операция | Без пула | С пулом |
|----------|----------|---------|
| Количество аллокаций | N | ~константа |
| Давление на GC | Высокое | Низкое |
| Задержка | Нестабильная | Стабильная |

### Накладные расходы блокировки памяти

Блокировка памяти (`mlock` Linux / `VirtualLock` Windows) создаёт единовременные накладные расходы syscall только при создании `SecureValue`; операции чтения (`Reveal` / `String` / `Masked`) не имеют различий. Рекомендуется держать `SecureValue` небольшим и короткоживущим — немедленно вызывайте `Close()` / `Release()` для возврата в пул объектов после использования, избегая длительного удержания больших блоков заблокированной памяти.

## Бенчмарки

### Производительность чтения

```go
func BenchmarkConcurrentRead(b *testing.B) {
    loader, _ := env.New(env.DefaultConfig())
    loader.Set("KEY", "value")

    b.RunParallel(func(pb *testing.PB) {
        for pb.Next() {
            loader.GetString("KEY")
        }
    })
}
```

### Производительность записи

```go
func BenchmarkConcurrentWrite(b *testing.B) {
    loader, _ := env.New(env.DefaultConfig())

    var i int64
    b.RunParallel(func(pb *testing.PB) {
        for pb.Next() {
            n := atomic.AddInt64(&i, 1)
            loader.Set(fmt.Sprintf("KEY_%d", n), "value")
        }
    })
}
```

### Смешанное чтение/запись

```go
func BenchmarkMixedReadWrite(b *testing.B) {
    loader, _ := env.New(env.DefaultConfig())
    loader.Set("KEY", "value")

    b.RunParallel(func(pb *testing.PB) {
        i := 0
        for pb.Next() {
            if i%10 == 0 {
                loader.Set("KEY", "new_value")
            } else {
                loader.GetString("KEY")
            }
            i++
        }
    })
}
```

## Замечания

### Избегайте блокировок внутри блокировки

```go
// Опасно: может привести к дедлоку
func (l *Loader) BadMethod() {
    // Вызов потенциально блокирующих операций внутри блокировки
    l.Set("KEY", computeValue())  // computeValue может быть медленным
}

// Безопасно: сначала вычислить, затем установить
func GoodMethod() {
    value := computeValue()  // Вычисление вне блокировки
    loader.Set("KEY", value)  // Быстрая установка
}
```

### Конкурентный доступ после Close

```go
loader, _ := env.New(cfg)

// Запуск goroutine
go func() {
    time.Sleep(1 * time.Second)
    loader.GetString("KEY")  // Возвращает пустую строку (GetString не возвращает error)
}()

loader.Close()  // Главная goroutine закрывает
```

### Сброс глобального загрузчика

```go
// Небезопасно для конкурентности: не вызывайте во время выполнения
env.ResetDefaultLoader()

// Безопасно: только в тестах или при запуске
func init() {
    env.ResetDefaultLoader()
    env.Load(".env")
}
```

## Связанная документация

- [SecureValue API](/ru/env/api-reference/secure-value) - обработка безопасных значений и блокировка памяти
- [Loader API](/ru/env/api-reference/loader) - методы загрузчика
- [Сценарии тестирования](/ru/env/guides/testing) - примеры бенчмарков
