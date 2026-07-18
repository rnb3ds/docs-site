---
layout: home
title: "CyberGo"
titleTemplate: "Коллекция высокопроизводительных библиотек Go с открытым исходным кодом"
description: "CyberGo — Go-библиотеки: JSON, JWT, безопасный HTTP-клиент, извлечение HTML, структурированные логи, env. Минимум зависимостей, для высоконагруженных сред."

hero:
  name: CyberGo
  text: Готовность к продакшену и максимальная производительность
  tagline: Лёгкий дизайн / Готовность из коробки / Минимальные зависимости / Высокая производительность / Для высоконагруженных сценариев
---

<!-- Список проектов (данные из PROJECT_META в shared.ts — проект добавляется в одном месте) -->
<ProjectGrid lang="ru" />

<style>
/* Адаптивность слогана Hero */
@media (min-width: 640px) {
  [class*="tagline"] {
    max-width: 900px !important;
  }
}

@media (min-width: 960px) {
  [class*="container"] {
    padding: 0;
    max-width: 1280px;
  }
}
</style>
