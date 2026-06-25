"""Smoke test do Marketplace Hub - verifica providers e conexão."""
import asyncio
import os
import sys
from playwright.async_api import async_playwright

BASE = os.environ.get('BASE_URL', 'http://localhost:3100')
EMAIL = 'admin@demo.com'
PASSWORD = 'admin123'


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        print(f"→ {BASE}/login")
        await page.goto(f'{BASE}/login', wait_until='domcontentloaded')
        await page.wait_for_load_state('networkidle', timeout=15000)

        await page.fill('input[type="email"]', EMAIL)
        await page.fill('input[type="password"]', PASSWORD)
        await page.click('button[type="submit"]')
        # Pode ir para /app/** ou /admin (depende do role)
        await page.wait_for_load_state('networkidle', timeout=15000)
        await asyncio.sleep(1)
        print(f"✓ Login OK ({page.url})")

        # Vai para /app/marketplace (Next.js cliente-side redirect se /admin)
        await page.goto(f'{BASE}/app/marketplace', wait_until='domcontentloaded')
        await page.wait_for_load_state('networkidle', timeout=15000)
        print("✓ /app/marketplace carregada")

        # Verifica que existem cards de providers
        cards = await page.query_selector_all('[data-testid^="marketplace-card-"]')
        print(f"✓ {len(cards)} providers exibidos")
        assert len(cards) > 0, "Nenhum provider encontrado"

        # Verifica que existem botões de conectar
        connect_btns = await page.query_selector_all('[data-testid^="marketplace-connect-"]')
        print(f"✓ {len(connect_btns)} botões de conectar")
        assert len(connect_btns) > 0, "Nenhum botão de conectar"

        # Verifica que o painel de eventos está presente
        events_panel = await page.query_selector('text=Eventos recentes')
        assert events_panel is not None, "Painel de eventos não encontrado"
        print("✓ Painel de eventos presente")

        # Tira screenshot
        await page.screenshot(path='marketplace.png', full_page=True)
        print("✓ Screenshot salvo: marketplace.png")

        await browser.close()
        print("\n✅ Todos os checks passaram!")


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except Exception as e:
        print(f"\n❌ {e}")
        sys.exit(1)
