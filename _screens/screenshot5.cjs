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
  // 1) Click Lista
  await p.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === 'Lista')
    if (b) b.click()
  })
  await p.waitForTimeout(1200)
  // 2) Click Agrupado para desagrupar
  await p.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === 'Agrupado')
    if (b) b.click()
  })
  await p.waitForTimeout(1500)
  // 3) Click no botão que tem heineken
  const clicked = await p.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const btn = btns.find(b => /heineken/i.test(b.textContent || '') && b.type === 'button')
    if (btn) { btn.click(); return btn.textContent?.slice(0, 50) }
    return null
  })
  console.log('clicked:', clicked)
  await p.waitForTimeout(1800)
  await p.screenshot({ path: 'C:/Users/FSOS/Documents/trae_projects/3/_screens/edit-product-modal.png', fullPage: false })
  await b.close()
})().catch((e) => { console.error(e.message); process.exit(1) })