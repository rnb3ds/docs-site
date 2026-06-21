import { defineConfig } from 'vitepress'
import { zhConfig, zhNav } from './locales/zh'
import { enConfig } from './locales/en'
import { koConfig } from './locales/ko'
import { jaConfig } from './locales/ja'
import { ruConfig } from './locales/ru'
import { PROJECTS } from './shared'

const HOST = 'https://www.cybergo.dev'

// All supported language codes; the root path `/` serves Chinese (the primary
// language), the others live under their `/{lang}/` prefix.
const ALL_LANGS = ['zh', 'en', 'ko', 'ja', 'ru'] as const

// VitePress emits locale hreflang as full locale codes (e.g. en-US); shorten to
// the two-letter code we use in URLs.
const LOCALE_TO_SHORT: Record<string, string> = {
  'zh-CN': 'zh', 'en-US': 'en', 'ko-KR': 'ko', 'ja-JP': 'ja', 'ru-RU': 'ru'
}

// og:locale values per language.
const OGC_LOCALE: Record<string, string> = {
  zh: 'zh_CN', en: 'en_US', ko: 'ko_KR', ja: 'ja_JP', ru: 'ru_RU'
}

// Heading-anchor slugify.
//
// VitePress's default slugify normalizes with NFKD, which *decomposes*
// composed scripts — Hangul syllables into conjoining jamo (확장 → 확장),
// voiced kana into base+kana-combining-mark (ジェ → シ+゙), and accented letters
// into base+combining-mark (ё → е+◌̈, й → и+◌̆) — then strips the combining
// marks. The resulting decomposed heading IDs never match internal
// `[text](#anchor)` links, which carry the source's composed (NFC) form
// verbatim, so every Korean / voiced-Japanese / ё / й in-page anchor is dead.
//
// Normalizing to NFC instead keeps those scripts composed (so IDs match the
// links). We treat any run of non-letter/non-number code points as a
// separator — that composes the above scripts while producing identical slugs
// to the default for ASCII, CJK, and fullwidth punctuation (so existing zh/en
// anchors are unaffected; fullwidth （） → - just like the NFKD default would).
//
// Applied to `markdown.slugify` (TOC), `markdown.anchor.slugify` (the actual
// heading id="..." via markdown-it-anchor) and `markdown.headers.slugify`
// (the right-side outline) so all three stay consistent.
const slugifyHeading = (s: string): string =>
  s.normalize('NFC')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(\d)/, '_$1')
    .toLowerCase()

// Chinese homepage is served at two URLs: the root `/` (the canonical one) and
// `/zh/` (kept for VitePress locale structure / nav). Both must collapse onto
// `/` so search engines do not see duplicate content.
function isZhHomePath(path: string): boolean {
  return path === '/' || path === '/zh/'
}

// Dev-only redirect for bare project paths (e.g. /json → /{lang}/json).
//
// The build emits static "bridge" pages for these paths in production, but the
// dev server (vitepress dev) serves straight from source — there is no /json
// route, so it 404s. This middleware intercepts bare project paths during dev
// and 302-redirects to the visitor's preferred language, mirroring the bridge
// pages. Resolution: request cookie (explicit choice) → Accept-Language
// (browser) → /zh/ (site default). localStorage is not readable server-side, so
// it is intentionally not consulted here; the production bridge pages cover it.
const SUPPORTED_LANGS = ['zh', 'en', 'ko', 'ja', 'ru']
function codeToLang(code: string | undefined): string | null {
  if (!code) return null
  const base = code.toLowerCase().split('-')[0]
  return SUPPORTED_LANGS.includes(base) ? base : null
}
function pickRequestLang(req: any): string {
  const cookie = (req.headers?.cookie as string) || ''
  const m = cookie.match(/(?:^|;)\s*vitepress-lang-preference=([^;]+)/)
  if (m) {
    const l = codeToLang(decodeURIComponent(m[1]))
    if (l) return l
  }
  const al = (req.headers?.['accept-language'] as string) || ''
  for (const part of al.split(',')) {
    const l = codeToLang(part.split(';')[0].trim())
    if (l) return l
  }
  return 'zh'
}
const bareProjectDevRedirect = {
  name: 'cybergo:bare-project-redirect',
  enforce: 'pre',
  apply: 'serve' as const,
  configureServer(server: any) {
    server.middlewares.use((req: any, res: any, next: any) => {
      const raw: string = req.url || '/'
      const pathname = raw.split('?')[0].split('#')[0]
      // Only intercept HTML navigations; skip any file/asset request.
      if (pathname.includes('.')) return next()
      const segs = pathname.replace(/^\/+/, '').split('/').filter(Boolean)
      if (segs.length === 0) return next() // homepage — leave to VitePress
      // Bare project path = first segment is a project, no language prefix.
      if (!(PROJECTS as readonly string[]).includes(segs[0])) return next()
      const lang = pickRequestLang(req)
      const target = '/' + lang + '/' + segs.join('/') + '/'
      const query = raw.indexOf('?') !== -1 ? raw.slice(raw.indexOf('?')) : ''
      res.statusCode = 302
      res.setHeader('Location', target + query)
      res.setHeader('Cache-Control', 'no-store')
      res.end()
    })
  }
}

export default defineConfig({
  title: 'CyberGo',
  description: 'CyberGo - Go Open Source Libraries',

  // Default <html lang> for the root page (the static Chinese homepage) and
  // any other non-locale page. Each locale's own `lang` overrides this under
  // its /{lang}/ prefix, so only the root `/` is affected.
  lang: 'zh-CN',

  lastUpdated: false,
  cleanUrls: true,

  // Dev-only Vite plugin: redirect bare project paths (/json) to the visitor's
  // language. See `bareProjectDevRedirect` above. No effect on production.
  vite: {
    plugins: [bareProjectDevRedirect]
  },

  // Heading-anchor slugify — see `slugifyHeading` above for the full rationale.
  markdown: {
    slugify: slugifyHeading,
    anchor: { slugify: slugifyHeading },
    headers: { slugify: slugifyHeading }
  },

  // Sitemap configuration for SEO
  sitemap: {
    hostname: HOST,
    transformItems(items) {
      return items
        .filter(item => !item.url.startsWith('404'))
        .map(item => {
          // Any homepage (root `/` or `/{lang}/`): point hreflang `zh` and
          // `x-default` at the canonical root `/`.
          const trimmed = item.url.replace(/^\/+|\/+$/g, '')
          const isHome = trimmed === '' || /^(zh|en|ko|ja|ru)$/.test(trimmed)
          if (isHome) {
            item.links = [
              { lang: 'zh', url: `${HOST}/` },
              { lang: 'en', url: `${HOST}/en/` },
              { lang: 'ko', url: `${HOST}/ko/` },
              { lang: 'ja', url: `${HOST}/ja/` },
              { lang: 'ru', url: `${HOST}/ru/` },
              { lang: 'x-default', url: `${HOST}/` }
            ]
          } else if (item.links) {
            // VitePress auto-generates locale hreflang (e.g. en-US); shorten to en
            item.links = item.links.map((link: any) => ({
              ...link,
              url: link.url?.replace(HOST, '').startsWith('/')
                ? `${HOST}${link.url}`
                : link.url,
              lang: LOCALE_TO_SHORT[link.lang] || link.lang
            }))
            // x-default points to the Chinese version (site default is Chinese)
            const urlMatch = item.url.match(/^(zh|en|ko|ja|ru)(\/.*)?$/)
            if (urlMatch) {
              const subPath = urlMatch[2] || ''
              if (!item.links.some((l: any) => l.lang === 'x-default')) {
                item.links.push({ lang: 'x-default', url: `${HOST}/zh${subPath}` })
              }
            }
          }
          return item
        })
    }
  },

  // Per-page SEO: canonical, hreflang, dynamic OG/Twitter
  transformHead({ pageData }) {
    const relativePath = pageData.relativePath
    const path = '/' + relativePath.replace(/(?:index)?\.md$/, '')

    const head: any[] = []

    // 404 page: noindex, skip all other SEO tags
    if (relativePath === '404.md') {
      head.push(['meta', { name: 'robots', content: 'noindex' }])
      return head
    }

    // The root `/` is the static Chinese homepage (primary language). There is
    // no client-side language redirect anymore — users switch languages via the
    // nav language menu. hreflang tells search engines about every language
    // version, and the `/zh/` mirror canonicalizes back to `/`.
    const zhHome = isZhHomePath(path)

    // Canonical — the Chinese homepage (both `/` and `/zh/`) canonicalizes to
    // the root `/` so the two identical pages do not compete.
    const canonical = zhHome ? `${HOST}/` : `${HOST}${path}`
    head.push(['link', { rel: 'canonical', href: canonical }])

    // Any homepage (root `/` or a `/{lang}/` landing page): the Chinese
    // counterpart is the canonical root `/`, and x-default → `/`. Inner pages
    // map each language at the same sub-path instead.
    const isHome = path === '/' || /^\/(zh|en|ko|ja|ru)\/?$/.test(path)
    if (isHome) {
      head.push(['link', { rel: 'alternate', hreflang: 'zh', href: `${HOST}/` }])
      for (const altLang of ['en', 'ko', 'ja', 'ru']) {
        head.push(['link', { rel: 'alternate', hreflang: altLang, href: `${HOST}/${altLang}/` }])
      }
      head.push(['link', { rel: 'alternate', hreflang: 'x-default', href: `${HOST}/` }])
    } else {
      // Language sub-pages (incl. inner pages): generate alternates for every
      // language; x-default points to the Chinese version (site default).
      const langMatch = path.match(/^\/(zh|en|ko|ja|ru)(\/.*)?$/)
      if (langMatch) {
        const subPath = langMatch[2] || ''
        for (const altLang of ALL_LANGS) {
          head.push(['link', { rel: 'alternate', hreflang: altLang, href: `${HOST}/${altLang}${subPath}` }])
        }
        head.push(['link', { rel: 'alternate', hreflang: 'x-default', href: `${HOST}/zh${subPath}` }])
      }
    }

    // Dynamic og:locale based on page language (root defaults to Chinese)
    const langFromPath = path.match(/^\/(zh|en|ko|ja|ru)/)
    const currentLang = langFromPath ? langFromPath[1] : 'zh'
    const locale = OGC_LOCALE[currentLang] || 'zh_CN'
    const altLocales = Object.entries(OGC_LOCALE)
      .filter(([lang]) => lang !== currentLang)
      .map(([, loc]) => loc)
    head.push(['meta', { property: 'og:locale', content: locale }])
    for (const altLocale of altLocales) {
      head.push(['meta', { property: 'og:locale:alternate', content: altLocale }])
    }

    // Dynamic OG and Twitter tags from frontmatter
    const fmTitle = pageData.frontmatter?.title
    const fmDesc = pageData.frontmatter?.description

    const ogTitle = fmTitle || 'CyberGo - 高性能 Go 开源库'
    const ogDesc = fmDesc || 'CyberGo 是专为 Go 语言打造的高性能开源库集合，为高并发生产环境提供可靠的基础组件。'

    head.push(['meta', { property: 'og:title', content: ogTitle }])
    head.push(['meta', { property: 'og:description', content: ogDesc }])
    head.push(['meta', { property: 'og:url', content: canonical }])
    head.push(['meta', { name: 'twitter:title', content: ogTitle }])
    head.push(['meta', { name: 'twitter:description', content: ogDesc }])

    return head
  },

  head: [
    // Favicons
    ['link', { rel: 'icon', href: '/favicon.ico', sizes: 'any' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }],
    ['link', { rel: 'mask-icon', href: '/logo.svg', color: '#76B900' }],
    ['meta', { name: 'theme-color', content: '#76B900' }],

    // Open Graph (static - per-page og:title/description/url/locale generated in transformHead)
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'CyberGo' }],
    ['meta', { property: 'og:image', content: 'https://www.cybergo.dev/og-image.png' }],
    ['meta', { property: 'og:image:type', content: 'image/png' }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],

    // Twitter Card (static - per-page title/description generated in transformHead)
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:site', content: '@CyberGoDev' }],
    ['meta', { name: 'twitter:image', content: 'https://www.cybergo.dev/og-image.png' }]
  ],

  locales: {
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      link: '/zh/',
      ...zhConfig
    },
    en: {
      label: 'English',
      lang: 'en-US',
      link: '/en/',
      ...enConfig
    },
    ko: {
      label: '한국어',
      lang: 'ko-KR',
      link: '/ko/',
      ...koConfig
    },
    ja: {
      label: '日本語',
      lang: 'ja-JP',
      link: '/ja/',
      ...jaConfig
    },
    ru: {
      label: 'Русский',
      lang: 'ru-RU',
      link: '/ru/',
      ...ruConfig
    }
  },

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'CyberGo',

    // aria-label for the unified LanguageMenu switcher on the root `/` page
    // (non-locale pages fall back to this top-level value; each /{lang}/ locale
    // overrides it with its own translated label). See LanguageMenu.vue.
    langMenuLabel: '多语言',

    // Root-path nav: the `/` homepage isn't part of any locale (every locale
    // carries a /{lang}/ prefix), so without this the 项目 / 关于 top nav is
    // missing on `/` while every /{lang}/ page shows it. Reuses zhNav so the
    // root page renders navigation identical to /zh/. Each /{lang}/ locale
    // overrides this with its own translated nav.
    nav: zhNav,

    search: {
      provider: 'algolia',
      options: {
        appId: 'PUYX7GZEVJ',
        apiKey: '656dcbb6d9a79cca32ee743ed2523ada',
        indexName: 'cybergo.dev',
        locales: {
          zh: { placeholder: '搜索文档...' },
          en: { placeholder: 'Search docs...' },
          ko: { placeholder: '문서 검색...' },
          ja: { placeholder: 'ドキュメントを検索...' },
          ru: { placeholder: 'Поиск в документации...' }
        }
      }
    },

    // Social links
    socialLinks: [{ icon: 'github', link: 'https://github.com/cybergodev' }],

    // Default footer (overridden by locale configs)
    footer: {
      message: 'Released under the MIT License',
      copyright: 'Copyright © 2026 CyberGoDev'
    }
  }
})
