const { chromium } = require('playwright')
;(async () => {
  const b = await chromium.launch()
  const ctx = await b.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
  })
  await ctx.addInitScript(() => { try { localStorage.setItem('erp:theme', 'dark') } catch (e) {} })
  const p = await ctx.newPage()
  await p.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
  await p.fill('input[type=email]', 'admin@demo.com')
  await p.fill('input[type=password]', 'admin123')
  await p.click('button[type=submit]')
  await p.waitForTimeout(2500)
  await p.goto('http://localhost:3000/app/inventory/sales-import', { waitUntil: 'networkidle' })
  await p.waitForTimeout(900)
  await p.evaluate(() => window.scrollTo(0, 0))
  await p.waitForTimeout(200)
  await p.screenshot({ path: 'C:/Users/FSOS/Documents/trae_projects/3/_screens/sales-import.png' })
  await p.goto('http://localhost:3000/app/inventory/exits', { waitUntil: 'networkidle' })
  await p.waitForTimeout(1500)
  const debug = await p.evaluate(() => {
    const h1 = document.querySelector('h1')
    const form = document.querySelector('form')
    const sections = document.querySelectorAll('form > section')
    const divs = document.querySelectorAll('form > div')
    const formChildren = Array.from(form?.children ?? []).map(el => ({ tag: el.tagName, class: el.className?.toString().slice(0,80), rect: el.getBoundingClientRect().toJSON(), children: el.children.length }))
    return {
      h1Text: h1?.textContent,
      h1Rect: h1?.getBoundingClientRect().toJSON(),
      formChildren,
      formInnerHTML: form?.innerHTML?.slice(0, 500),
      sectionsCount: sections.length,
      divsCount: divs.length,
      mainRect: document.querySelector('main')?.getBoundingClientRect().toJSON(),
      bodyHeight: document.body.scrollHeight,
    }
  })
  console.log(JSON.stringify(debug, null, 2))
  await p.screenshot({ path: 'C:/Users/FSOS/Documents/trae_projects/3/_screens/exits.png', fullPage: true })
  await p.goto('http://localhost:3000/app/inventory', { waitUntil: 'networkidle' })
  await p.waitForTimeout(900)
  await p.evaluate(() => window.scrollTo(0, 0))
  await p.waitForTimeout(200)
  await p.screenshot({ path: 'C:/Users/FSOS/Documents/trae_projects/3/_screens/inventory-with-buttons.png' })
  console.log('OK')
  await b.close()
})().catch((e) => { console.error(e.message); process.exit(1) })