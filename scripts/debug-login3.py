"""Teste completo: login → dashboard admin carrega dados."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_context().new_page()

    page.goto("http://localhost:3100/login", wait_until="networkidle", timeout=30_000)
    page.wait_for_timeout(1000)

    api_responses = []
    page.on("response", lambda r: api_responses.append((r.status, r.url)) if "/api/" in r.url else None)

    page.get_by_text("MASTER ADMIN").first.click()
    page.wait_for_timeout(300)
    page.click("button:has-text('AUTENTICAR')")
    page.wait_for_timeout(3000)

    print(f"URL FINAL: {page.url}")
    print(f"\n--- API RESPONSES ---")
    for status, url in api_responses[:15]:
        print(f"  {status}  {url}")

    # Tira screenshot
    page.screenshot(path="screenshots/admin-loaded.png", full_page=True)
    print("\nScreenshot salvo em screenshots/admin-loaded.png")

    # Verifica se a página renderizou conteúdo (não tela de "verificando acesso")
    body = page.text_content("body")
    if "Verificando acesso" in body or len(body or "") < 200:
        print("AINDA NA TELA DE LOADING")
    else:
        print(f"Página renderizou {len(body)} chars de conteúdo")

    browser.close()
