---
sidebar_label: "Контрольный список для продакшена"
title: "Контрольный список для продакшена - CyberGo env | проверка безопасности перед запуском"
description: "Контрольный список безопасности для развёртывания CyberGo env в продакшене: права .env 600 и защита .gitignore, валидация обязательных ключей RequiredKeys/AllowedKeys, включение журнала аудита, обработка SecureValue и настройка параметров производительности для обеспечения безопасности с момента запуска."
sidebar_position: 4
---

# Контрольный список для продакшена

Контрольный список для проверки перед развёртыванием приложения в продакшн.

::: tip Концепция безопасности
Архитектура безопасности и ключевые особенности подробно описаны в [Обзоре безопасности](/ru/env/security/).
:::

## Проверки перед развёртыванием

### Безопасность файлов

- [ ] Файл `.env.production` существует
- [ ] Права файла `600` или строже
- [ ] Чувствительные файлы добавлены в `.gitignore`
- [ ] Конфигурационный файл не содержит плейсхолдеров (например `change-me`, `xxx`)

```bash
# Проверка прав
ls -la .env.production
# Должно показать: -rw------- (600)

# Исправление прав
chmod 600 .env.production
```

### Валидация конфигурации

- [ ] Все обязательные ключи установлены
- [ ] Чувствительные значения не пусты
- [ ] Форматы значений корректны (URL, порты и т. д.)
- [ ] Нет хардкоженных ключей

```go
cfg := env.ProductionConfig()
cfg.RequiredKeys = []string{
    "DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD",
    "API_KEY", "API_URL",
}
cfg.FailOnMissingFile = true
```

## Проверка конфигурации безопасности

### Журнал аудита

- [ ] Журнал аудита включён
- [ ] Каталог логов доступен для записи
- [ ] Права файла логов корректны

```go
auditFile, _ := os.OpenFile("/var/log/app/audit.log",
    os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
cfg.AuditEnabled = true
cfg.AuditHandler = env.NewJSONAuditHandler(auditFile)
```

### Обработка чувствительных данных

- [ ] Чувствительные значения получаются через `GetSecure`
- [ ] Своевременно вызывается `Close()` для освобождения ресурсов
- [ ] Логи не выводят исходные чувствительные значения

```go
secret := loader.GetSecure("DB_PASSWORD")
defer secret.Close()
log.Printf("Password length: %d", secret.Length())
```

### Контроль доступа

- [ ] Установлен белый список `AllowedKeys` (рекомендуется)
- [ ] Включён `ValidateValues`
- [ ] Разумно установлены ограничения размера

```go
cfg.AllowedKeys = []string{"APP_NAME", "DB_HOST", "API_KEY"}
cfg.ValidateValues = true
cfg.MaxVariables = 100
```

## Проверки во время развёртывания

- [ ] Файл конфигурации загружается из безопасного места
- [ ] При запуске приложения конфигурация валидируется
- [ ] При ошибке конфигурации приложение отказывается запускаться
- [ ] Чувствительная информация не выводится в логи

## Проверки после развёртывания

- [ ] Приложение работает нормально
- [ ] Журнал аудита корректно записывается
- [ ] Нет утечки чувствительной информации
- [ ] Отслеживаются ошибки, связанные с конфигурацией

## Скрипт быстрой проверки

```bash
#!/bin/bash
# pre-deploy-check.sh

set -e

echo "=== Pre-deployment Config Check ==="

# Проверка существования файла
[ -f ".env.production" ] || { echo "ERROR: .env.production not found"; exit 1; }

# Проверка прав
PERMS=$(stat -c %a .env.production 2>/dev/null || stat -f %Lp .env.production)
[ "$PERMS" = "600" ] || [ "$PERMS" = "400" ] || echo "WARNING: permissions are $PERMS"

# Проверка плейсхолдеров
grep -qE "(change-?me|placeholder|xxx|YOUR_)" .env.production && \
    { echo "ERROR: Found placeholder values"; exit 1; }

# Проверка обязательных ключей
for key in DB_HOST DB_PORT DB_USER DB_PASSWORD API_KEY; do
    grep -q "^$key=" .env.production || { echo "ERROR: Missing $key"; exit 1; }
done

echo "=== All checks passed ==="
```

## Связанная документация

- [Обзор безопасности](/ru/env/security/) - архитектура безопасности и ключевые особенности
- [SecureValue API](/ru/env/api-reference/secure-value) - обработка безопасных значений
- [Константы и ошибки](/ru/env/api-reference/constants) - список запрещённых ключей
