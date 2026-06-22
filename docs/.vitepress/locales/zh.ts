import type { DefaultTheme, LocaleSpecificConfig } from 'vitepress'
import { zhSidebars } from './sidebars/zh'

// Shared top-nav used by BOTH the root `/` homepage (via the top-level
// themeConfig in config.mts) and the `/zh/` locale. The root path is not part
// of any locale (every locale carries a /{lang}/ prefix), so it falls back to
// the top-level themeConfig — keeping this in one place guarantees `/` and
// `/zh/` render identical navigation. Each other locale carries its own
// translated nav and overrides the top-level value there.
export const zhNav: DefaultTheme.NavItem[] = [
  {
    text: '项目',
    items: [
      { text: 'JSON', link: '/zh/json/' },
      { text: 'JWT', link: '/zh/jwt/' },
      { text: 'HTTPC', link: '/zh/httpc/' },
      { text: 'HTML', link: '/zh/html/' },
      { text: 'DD', link: '/zh/dd/' },
      { text: 'ENV', link: '/zh/env/' }
    ]
  },
  { text: '关于', link: '/zh/about' }
]

export const zhConfig: LocaleSpecificConfig<DefaultTheme.Config> = {
  description: '高性能 Go 开源库文档',

  themeConfig: {
    nav: zhNav,

    sidebar: zhSidebars,

    editLink: {
      pattern: 'https://github.com/cybergodev/docs-site/edit/main/docs/zh/:path',
      text: '在 GitHub 编辑此页'
    },

    footer: {
      message: '基于 MIT 许可发布 · <a href="https://github.com/cybergodev/docs-site/issues/new?template=doc-issue.md" target="_blank">报告文档问题</a>',
      copyright: 'Copyright © 2026 CyberGoDev'
    },

    docFooter: {
      prev: '上一页',
      next: '下一页'
    },

    outline: {
      label: '页面导航'
    },

    langMenuLabel: '多语言',
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式'
  }
}
