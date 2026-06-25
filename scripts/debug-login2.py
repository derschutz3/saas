"""Reproduz exatamente o que o usuário faz."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_context().new_page()
    
    page.on("pageerror", lambda e: print(f"PAGE ERROR: {e}"))
    page.on("console", lambda m: print(f"{m.type}: {m.text}") if m.type in ('error', 'warning') else None)
    
    page.goto("http://localhost:3100/login", wait_until="networkidle", timeout=30_000)
    page.wait_for_timeout(500)
    
    # Tentar via QuickLogin (como usuário)
    print("Clicando no botão MASTER ADMIN")
    page.get_by_text("MASTER ADMIN").first.click()
    page.wait_for_timeout(500)
    # Vê o que aparece
    email = page.input_value("input[type='email']")
    print(f"Email preenchido: {email!r}")
    
    print("Clicando AUTENTICAR")
    page.click("button:has-text('AUTENTICAR')")
    page.wait_for_timeout(4000)
    print(f"URL final: {page.url}")
    page.screenshot(path="screenshots/login-actual.png", full_page=True)
    browser.close()
