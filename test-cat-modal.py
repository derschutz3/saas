"""Valida o modal de Nova/Editar Categoria."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 900})
    page = context.new_page()

    page.goto('http://localhost:3100/login', wait_until='domcontentloaded')
    page.wait_for_load_state('networkidle', timeout=15000)
    page.fill('input[type=email]', 'admin@demo.com')
    page.fill('input[type=password]', 'admin123')
    page.click('button[type=submit]')
    page.wait_for_load_state('networkidle', timeout=15000)
    page.wait_for_timeout(2000)

    page.goto('http://localhost:3100/app/inventory/categories', wait_until='domcontentloaded')
    page.wait_for_load_state('networkidle', timeout=20000)
    page.wait_for_timeout(4000)
    page.screenshot(path=r'C:\Users\FSOS\Documents\trae_projects\3\screenshots\debug-cat-page.png', full_page=True)
    print(f'[DEBUG] URL: {page.url}')
    print(f'[DEBUG] Titulo: {page.title()}')
    body = page.locator('body').inner_text(timeout=3000)
    print(f'[DEBUG] Body (300 chars): {body[:300]}')

    # Localizar botao "Nova categoria" via XPath para garantir
    btn = page.locator('button:has-text("Nova categoria")').first
    print(f'[INFO] Botao "Nova categoria" visivel: {btn.is_visible()}')
    btn.scroll_into_view_if_needed()
    btn.click()
    page.wait_for_timeout(1200)

    # Verificar se modal abriu (procura por input)
    nome_input = page.locator('input[type="text"]').first
    print(f'[INFO] Input visivel apos click: {nome_input.is_visible()}')

    page.screenshot(path=r'C:\Users\FSOS\Documents\trae_projects\3\screenshots\08-cat-modal.png', full_page=False)

    if nome_input.is_visible():
        nome_input.fill('Carnes Premium')
        page.wait_for_timeout(300)

        # Tentar achar um swatch de cor pela classe (todos tem rounded)
        cor_swatches = page.locator('button[style*="background"]')
        n = cor_swatches.count()
        print(f'[INFO] Swatches encontrados: {n}')
        if n > 0:
            # Pega o 4o (pink)
            cor_swatches.nth(3).click()
            page.wait_for_timeout(300)

        # Pega a grid de icones - sao buttons com emoji
        # Procura por botoes com texto de emoji
        all_btns = page.locator('button')
        for i in range(all_btns.count()):
            try:
                t = all_btns.nth(i).inner_text(timeout=200)
                if '🥩' in t:
                    all_btns.nth(i).click()
                    print(f'[INFO] Icone carne clicado (idx={i})')
                    break
            except Exception:
                pass
        page.wait_for_timeout(500)

        page.screenshot(path=r'C:\Users\FSOS\Documents\trae_projects\3\screenshots\09-cat-filled.png', full_page=False)

        # Tenta salvar
        save_btn = page.locator('button:has-text("Criar"), button:has-text("Salvar")').last
        if save_btn.is_visible():
            save_btn.click()
            page.wait_for_timeout(1500)
            page.screenshot(path=r'C:\Users\FSOS\Documents\trae_projects\3\screenshots\10-cat-after-save.png', full_page=True)
            print('[OK] Salvou')

    browser.close()
    print('[DONE]')
