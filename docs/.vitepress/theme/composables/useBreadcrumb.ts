import { computed } from 'vue'
import { useData, useRouter } from 'vitepress'
import type { DefaultTheme } from 'vitepress'
import { useCurrentLang, useUiLabels } from './useUiLabels'
import { getProjectFromPath } from './useProjectContext'

/**
 * Breadcrumb trail for the current doc page, derived by walking the current
 * sidebar (the file-system-driven sidebar built by
 * `locales/sidebars/builder.ts`) to find the leaf whose link matches the route,
 * then returning the ancestor chain.
 *
 * Result shape: `[Home, Project, ...ancestorGroups, currentPage]`.
 *   - Home        → `/{lang}/`, label from `UI_LABELS.breadcrumbHome`.
 *   - Project     → `/{lang}/{project}/`, label `project.toUpperCase()`
 *                   (matches the top-nav rendering).
 *   - Groups      → the sidebar group labels along the path; clickable, linking
 *                   to the group's first descendant leaf (its index page).
 *   - Current page→ the matched leaf label, plain text (no link), marked
 *                   `aria-current="page"` by the component.
 *
 * Hidden (returns `[]`) when there is nothing useful to show:
 *   - language home / about / root (no project segment in the path),
 *   - a project's root index page (`/{lang}/{project}/`),
 *   - frontmatter `breadcrumb: false`.
 *
 * SSR-safe: `useRouter().route.path` and `useData().theme` resolve during SSR,
 * so the first paint already shows the right trail (same pattern as
 * `useProjectContext`). The sidebar item `text` may carry a leading emoji icon
 * (Task A); breadcrumbs render it verbatim for consistency with the sidebar.
 */
export interface BreadcrumbItem {
  /** Display text (may include a leading emoji icon, matching the sidebar). */
  text: string
  /** Link for clickable ancestors; `undefined` for the current (last) page. */
  link?: string
}

/** Normalize a route/link for comparison: drop `.html`, drop trailing slash. */
function normalize(p: string): string {
  let s = p.replace(/\.html$/, '')
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1)
  return s
}

/**
 * First leaf link reachable from a sidebar item. Groups have no `link` of their
 * own, so their index page is taken to be the first descendant leaf (the
 * `_category_` directory's `index.md`), which is what the group segment links to.
 */
function firstLink(item: DefaultTheme.SidebarItem): string | undefined {
  if ('link' in item && item.link) return item.link
  if ('items' in item && item.items) {
    for (const child of item.items) {
      const l = firstLink(child)
      if (l) return l
    }
  }
  return undefined
}

/**
 * Depth-first search for the sidebar item whose `link` matches `target`,
 * returning the full ancestor chain (groups + matched leaf), or `null`.
 */
function findTrail(
  items: DefaultTheme.SidebarItem[],
  target: string,
  acc: DefaultTheme.SidebarItem[] = []
): DefaultTheme.SidebarItem[] | null {
  for (const item of items) {
    if ('link' in item && item.link && normalize(item.link) === target) {
      return [...acc, item]
    }
    if ('items' in item && item.items) {
      const found = findTrail(item.items, target, [...acc, item])
      if (found) return found
    }
  }
  return null
}

export function useBreadcrumb() {
  const router = useRouter()
  const { theme, page } = useData()
  const lang = useCurrentLang()
  const t = useUiLabels()

  return computed<BreadcrumbItem[]>(() => {
    const path = router.route.path
    const project = getProjectFromPath(path)

    // No project segment → language home / about / root: nothing to show.
    if (!project) return []
    // Project root index (概述) → hide; the project nav entry is enough.
    if (normalize(path) === `/${lang.value}/${project}`) return []

    // frontmatter opt-out: `breadcrumb: false`.
    if (page.value.frontmatter.breadcrumb === false) return []

    // `theme` is loosely typed (`Record<string, any>`), so cast the sidebar to
    // VitePress's union. CyberGo uses the multi-sidebar object keyed by
    // `/{lang}/{project}/`; a plain array (single-sidebar fallback) is also
    // accepted. Longest-prefix match wins.
    const sidebar = theme.value.sidebar as DefaultTheme.Sidebar | undefined
    if (!sidebar) return []

    let bestItems: DefaultTheme.SidebarItem[] | undefined
    if (Array.isArray(sidebar)) {
      bestItems = sidebar
    } else {
      let bestKey = ''
      for (const [key, value] of Object.entries(sidebar)) {
        if (path.startsWith(key) && key.length > bestKey.length) {
          bestKey = key
          // SidebarMulti value is `SidebarItem[] | { items, base }`.
          bestItems = Array.isArray(value) ? value : value.items
        }
      }
    }
    if (!bestItems) return []

    const trail = findTrail(bestItems, normalize(path))
    if (!trail || trail.length === 0) return []

    const result: BreadcrumbItem[] = []
    result.push({ text: t.value.breadcrumbHome, link: `/${lang.value}/` })
    result.push({ text: project.toUpperCase(), link: `/${lang.value}/${project}/` })
    // Ancestor groups (all but the leaf) → clickable. `SidebarItem.text` is
    // optional in the VP type, so coerce (real entries always have a label).
    for (const g of trail.slice(0, -1)) {
      result.push({ text: g.text ?? '', link: firstLink(g) })
    }
    // Current page (leaf) → plain text.
    result.push({ text: trail[trail.length - 1].text ?? '' })

    return result
  })
}
