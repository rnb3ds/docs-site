<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vitepress'

/**
 * Language switcher for the root homepage.
 *
 * The root `/` is not part of any locale (every locale carries a `/{lang}/`
 * prefix), so VitePress does not render its native `VPNavBarTranslations`
 * there — leaving the homepage with no way to switch languages. This component
 * fills that gap. It only renders on paths without a language prefix; every
 * language-prefixed page already has the native menu, so there is no overlap.
 *
 * Two variants: `bar` (desktop nav dropdown) and `screen` (mobile nav screen,
 * expanded list). SSR-friendly via `router.route.path` (no flash on hydrate).
 */
const props = defineProps<{ variant?: 'bar' | 'screen' }>()
const variant = computed(() => props.variant || 'bar')

const router = useRouter()
const show = computed(() => !/^\/(zh|en|ko|ja|ru)(\/|$)/.test(router.route.path || '/'))

// Expanded by default inside the mobile nav screen.
const open = ref(variant.value === 'screen')

onMounted(() => {
  document.addEventListener('click', onDocClick)
})

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') document.removeEventListener('click', onDocClick)
})

function onDocClick(e: MouseEvent) {
  if (!open.value || variant.value !== 'bar') return
  const el = e.target as HTMLElement
  if (!el.closest('.root-lang-menu')) open.value = false
}

function toggle() {
  open.value = !open.value
}

const items = [
  { code: 'zh', label: '简体中文', path: '/' },
  { code: 'en', label: 'English', path: '/en/' },
  { code: 'ko', label: '한국어', path: '/ko/' },
  { code: 'ja', label: '日本語', path: '/ja/' },
  { code: 'ru', label: 'Русский', path: '/ru/' }
]

// The root homepage serves the Chinese version.
const currentCode = 'zh'
const currentLabel = computed(() => items.find((i) => i.code === currentCode)?.label || '')
</script>

<template>
  <div v-if="show" class="root-lang-menu" :class="variant">
    <template v-if="variant === 'bar'">
      <button
        type="button"
        class="trigger"
        :aria-expanded="open"
        aria-label="Switch language"
        @click="toggle"
      >
        <svg
          class="globe"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z" />
        </svg>
        <span class="label">{{ currentLabel }}</span>
      </button>
      <Transition name="rlm-fade">
        <div v-show="open" class="menu">
          <a
            v-for="item in items"
            :key="item.code"
            :href="item.path"
            class="item"
            :class="{ active: item.code === currentCode }"
          >{{ item.label }}</a>
        </div>
      </Transition>
    </template>

    <template v-else>
      <p class="screen-title">语言 / Language</p>
      <a
        v-for="item in items"
        :key="item.code"
        :href="item.path"
        class="screen-item"
        :class="{ active: item.code === currentCode }"
      >{{ item.label }}</a>
    </template>
  </div>
</template>

<style scoped>
/* Desktop nav dropdown */
.root-lang-menu.bar {
  position: relative;
  display: flex;
  align-items: center;
  margin-right: 8px;
}

.trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  height: var(--vp-nav-height);
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-text-1);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 0.25s;
}

.trigger:hover {
  color: var(--vp-c-brand-1);
}

.globe {
  width: 18px;
  height: 18px;
}

.menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 140px;
  padding: 6px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  box-shadow: var(--vp-shadow-2);
  z-index: 200;
}

.item {
  display: block;
  padding: 6px 12px;
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-text-1);
  text-decoration: none;
  border-radius: 6px;
  transition: background-color 0.25s, color 0.25s;
}

.item:hover {
  background: var(--vp-c-bg-soft);
}

.item.active {
  color: var(--vp-c-brand-1);
}

/* Mobile nav screen */
.root-lang-menu.screen {
  padding: 8px 0;
}

.screen-title {
  margin: 0 0 8px;
  padding: 0 24px;
  font-size: 12px;
  font-weight: 700;
  color: var(--vp-c-text-3);
}

.screen-item {
  display: block;
  padding: 10px 24px;
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-text-1);
  text-decoration: none;
  transition: color 0.25s;
}

.screen-item:hover,
.screen-item.active {
  color: var(--vp-c-brand-1);
}

.rlm-fade-enter-active,
.rlm-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.rlm-fade-enter-from,
.rlm-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
