/**
 * Generate language-neutral "bridge" pages for bare paths.
 *
 * Problem: every real page lives under a language prefix
 * (e.g. /zh/json/getting-started/). A bare path like /json/getting-started/
 * does not exist as a static file, so on the FTP-hosted static site it falls
 * through to 404.html and only recovers via a client-side JS redirect — a poor
 * SEO signal (404 status + JS).
 *
 * Fix: for each page that exists under /zh/ (the default language), emit a
 * minimal static page at the bare path that:
 *   - canonicalizes to the /zh/ version (so the bare URL is not seen as
 *     duplicate content),
 *   - declares hreflang alternates for every language that has the page,
 *   - redirects via <meta http-equiv="refresh"> (followed by all major
 *     crawlers, no JS required), and
 *   - carries robots "noindex, follow" so the thin bridge is not indexed but
 *     still passes link equity to the canonical target.
 *
 * Runs after `fix-clean-urls.js` so the /zh/ tree is already in
 * directory-per-page form.
 */
import { readdir, access, mkdir, writeFile } from 'fs/promises'
import { join, relative } from 'path'

const DIST_DIR = 'docs/.vitepress/dist'
const ZH_DIR = join(DIST_DIR, 'zh')
const HOST = 'https://www.cybergo.dev'
const LANGS = ['zh', 'en', 'ko', 'ja', 'ru']

const fileExists = (p) => access(p).then(() => true).catch(() => false)

// Recursively collect every subdirectory under `root` that contains an
// index.html (i.e. a rendered page), returned as forward-slashed paths
// relative to `root`.
async function collectPages(root) {
  const pages = []
  async function walk(dir) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const full = join(dir, entry.name)
      if (await fileExists(join(full, 'index.html'))) {
        pages.push(relative(root, full).replace(/\\/g, '/'))
      }
      await walk(full)
    }
  }
  await walk(root)
  return pages
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  )
}

function buildBridgeHtml(rel, availableLangs) {
  const canonical = `${HOST}/zh/${rel}/`
  const refreshUrl = `/zh/${rel}/`
  const hreflangLinks = availableLangs
    .map((l) => `  <link rel="alternate" hreflang="${l}" href="${HOST}/${l}/${rel}/">`)
    .join('\n')
  const langLinks = availableLangs
    .map((l) => `<a href="/${l}/${rel}/">${l}</a>`)
    .join(' ')

  return `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CyberGo - ${escapeHtml(rel)}</title>
<link rel="canonical" href="${canonical}">
${hreflangLinks}
  <link rel="alternate" hreflang="x-default" href="${canonical}">
<meta http-equiv="refresh" content="0; url=${refreshUrl}">
<meta name="robots" content="noindex, follow">
</head>
<body>
<noscript>
  <p>Redirecting to <a href="${refreshUrl}">${escapeHtml(rel)}</a>.</p>
  <p>Also available in: ${langLinks}</p>
</noscript>
</body>
</html>
`
}

async function main() {
  const zhPages = await collectPages(ZH_DIR)
  let created = 0
  for (const rel of zhPages) {
    const bridgeDir = join(DIST_DIR, rel)
    const bridgeFile = join(bridgeDir, 'index.html')

    // Never overwrite a file the build already produced at the root.
    if (await fileExists(bridgeFile)) continue

    // Only declare hreflang for languages that actually have this page.
    const availableLangs = []
    for (const l of LANGS) {
      if (l === 'zh' || (await fileExists(join(DIST_DIR, l, rel, 'index.html')))) {
        availableLangs.push(l)
      }
    }

    await mkdir(bridgeDir, { recursive: true })
    await writeFile(bridgeFile, buildBridgeHtml(rel, availableLangs), 'utf8')
    console.log(`  bridge: /${rel}/ -> /zh/${rel}/`)
    created++
  }
  console.log(`Generated ${created} language-neutral redirect page(s).`)
}

await main()
