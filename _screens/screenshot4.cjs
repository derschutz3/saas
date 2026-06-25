const { chromium } = require('playwright')
;(async () => {
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
  await ctx.addInitScript(() => { try { localStorage.setItem('erp:theme', 'dark') } catch (e) {} })
  const p = await ctx.newPage()
  await p.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
  await p.fill('input[type=email]', 'admin@demo.com')
  await p.fill('input[type=password]', 'admin123')
  await p.click('button[type=submit]')
  await p.waitForTimeout(2500)
  await p.goto('http://localhost:3000/app/inventory/exits', { waitUntil: 'networkidle' })
  await p.waitForTimeout(2000)

  // Adicionar 2 linhas extras
  await p.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const addBtn = btns.find(b => /adicionar linha/i.test(b.textContent || ''))
    if (addBtn) { addBtn.click(); addBtn.click() }
  })
  await p.waitForTimeout(800)
  await p.screenshot({ path: 'C:/Users/FSOS/Documents/trae_projects/3/_screens/exits-multi.png', fullPage: false })
  console.log('OK')
  await b.close()
})().catch((e) => { console.error(e.message); process.exit(1) })