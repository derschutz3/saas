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

  // 1) Página de estoque + abrir modal "Novo produto" com novos campos
  await p.goto('http://localhost:3000/app/inventory', { waitUntil: 'networkidle' })
  await p.waitForTimeout(1200)
  // clica no botão + NOVO PRODUTO (ou + NOVO)
  await p.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const btn = btns.find(b => /novo produto/i.test(b.textContent || ''))
    if (btn) btn.click()
  })
  await p.waitForTimeout(700)
  await p.screenshot({ path: 'C:/Users/FSOS/Documents/trae_projects/3/_screens/new-product-modal.png', fullPage: false })

  // 2) Página exits — sempre mostrar preco venda + custo
  await p.goto('http://localhost:3000/app/inventory/exits', { waitUntil: 'networkidle' })
  await p.waitForTimeout(1500)
  await p.screenshot({ path: 'C:/Users/FSOS/Documents/trae_projects/3/_screens/exits-with-prices.png', fullPage: false })

  console.log('OK')
  await b.close()
})().catch((e) => { console.error(e.message); process.exit(1) })