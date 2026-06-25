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
  await p.goto('http://localhost:3000/app/inventory', { waitUntil: 'networkidle' })
  await p.waitForTimeout(2500)
  // Click Lista
  await p.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === 'Lista')
    if (b) b.click()
  })
  await p.waitForTimeout(1500)
  // Agora lista botões em modo Lista
  const buttons = await p.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim().slice(0, 30) || '?')
  })
  console.log(JSON.stringify(buttons, null, 0))
  await b.close()
})().catch((e) => { console.error(e.message); process.exit(1) })