import { readdir, stat, mkdir, rename } from 'fs/promises'
import { join, dirname } from 'path'

const DIST_DIR = 'docs/.vitepress/dist'

async function processDir(dir) {
  const entries = await readdir(dir)

  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const s = await stat(fullPath)

    if (s.isDirectory()) {
      await processDir(fullPath)
      continue
    }

    if (!entry.endsWith('.html') || entry === 'index.html' || entry === '404.html') {
      continue
    }

    const dirName = entry.slice(0, -5)
    const newDir = join(dir, dirName)

    // Skip if a directory with this name already exists
    try {
      await stat(newDir)
      continue
    } catch {
      // Directory does not exist, proceed
    }

    await mkdir(newDir, { recursive: true })
    await rename(fullPath, join(newDir, 'index.html'))
    console.log(`  ${fullPath} → ${dirName}/index.html`)
  }
}

console.log('Converting flat HTML files to directory structure...')
await processDir(DIST_DIR)
console.log('Done.')
