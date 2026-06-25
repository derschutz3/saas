#!/usr/bin/env node
/**
 * Script que valida que TODAS as rotas em lib/nav.ts
 * têm uma página correspondente em app/app/<rota>/page.tsx
 *
 * Uso: node scripts/check-routes.mjs
 */

import { readFileSync, existsSync, readdirSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..', 'apps', 'erp-web')

const navPath = resolve(projectRoot, 'lib', 'nav.ts')
const appRoot = resolve(projectRoot, 'app', 'app')

// Lê o nav.ts e extrai todos os hrefs
const navContent = readFileSync(navPath, 'utf-8')
const hrefRegex = /href:\s*['"]([^'"]+)['"]/g
const hrefs = []
let match
while ((match = hrefRegex.exec(navContent)) !== null) {
  hrefs.push(match[1])
}

console.log('\n🔍 Validando rotas da sidebar...\n')

let errors = 0
let warnings = 0

for (const href of hrefs) {
  // /app/queue → app/app/queue/page.tsx
  const cleanPath = href.replace(/^\/app/, '')
  const pagePath = join(appRoot, cleanPath, 'page.tsx')
  const exists = existsSync(pagePath)

  if (exists) {
    console.log(`  ✅ ${href}`)
  } else {
    console.log(`  ❌ ${href}  →  ${pagePath.replace(projectRoot, '.')}`)
    errors++
  }
}

// Verifica páginas órfãs (existem mas não estão na nav)
function scanDir(dir, baseRel = '') {
  const items = readdirSync(dir, { withFileTypes: true })
  for (const item of items) {
    const full = join(dir, item.name)
    if (item.name === 'page.tsx') {
      const rel = baseRel.replace(/\\/g, '/')
      const href = '/app' + rel
      if (!hrefs.includes(href)) {
        console.log(`  ⚠️  Página órfã: ${href}`)
        warnings++
      }
    } else if (item.isDirectory()) {
      scanDir(full, join(baseRel, item.name))
    }
  }
}

console.log('\n📁 Páginas órfãs (existem mas não estão na sidebar):\n')
scanDir(appRoot)
if (warnings === 0) console.log('  (nenhuma)')

console.log('\n' + '═'.repeat(50))
if (errors === 0) {
  console.log(`✅ Todas as ${hrefs.length} rotas da sidebar estão OK!`)
  if (warnings > 0) console.log(`⚠️  ${warnings} páginas órfãs (não linkadas)`)
  process.exit(0)
} else {
  console.log(`❌ ${errors} rota(s) quebrada(s) — vão dar 404!`)
  process.exit(1)
}
