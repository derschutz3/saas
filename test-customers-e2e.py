"""Validação rápida do módulo de Clientes."""
from playwright.sync_api import sync_playwright

URL = "http://localhost:3100"

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(f"{URL}/login", wait_until="networkidle")
        page.fill('input[type="email"]', "admin@demo.com")
        page.fill('input[type="password"]', "admin123")
        page.click('button[type="submit"]')
        page.wait_for_url("**/admin", timeout=10000)
        page.goto(f"{URL}/app/customers", wait_until="networkidle")
        page.wait_for_timeout(2000)

        checks = {
            "h1 Clientes": page.locator('h1:has-text("Clientes")').count() > 0,
            "Bar do Zé": page.locator('text="Bar do Zé"').count() > 0,
            "KPI VIP": page.locator('text=/VIP/').count() > 0,
            "Botão Novo cliente": page.locator('button:has-text("Novo cliente")').count() > 0,
            "Botão Mostrar arquivados": page.locator('button:has-text("arquivados")').count() > 0,
            "Select lifecycle": page.locator('select').filter(has_text="Todos os ciclos").count() > 0,
            "Sidebar Clientes": page.locator('nav, aside').locator('text="Clientes"').count() > 0,
        }
        for label, ok in checks.items():
            print(f"  {'✓' if ok else '✗'} {label}")
        page.screenshot(path="c:/Users/FSOS/Documents/trae_projects/3/customers-final.png", full_page=True)
        print("\n  📸 customers-final.png")
        browser.close()

run()
