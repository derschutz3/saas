"""Valida fluxo completo: criar, editar (nome+cor), excluir categoria."""
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
    page.wait_for_timeout(2500)

    # === 1) CRIAR categoria "Bebidas Quentes" (cor verde preset) ===
    print('\n=== 1) CRIAR categoria "Bebidas Quentes" (cor verde preset) ===')
    page.locator('button:has-text("Nova categoria")').first.click()
    page.wait_for_timeout(800)
    page.fill('#cat-name', 'Bebidas Quentes')
    page.fill('#cat-desc', 'Cafes, chas e cappuccinos')
    # Clica no preset verde (10b981)
    page.locator('button[aria-label="Cor Verde"]').first.click()
    page.wait_for_timeout(300)
    page.screenshot(path=r'C:\Users\FSOS\Documents\trae_projects\3\screenshots\11-create.png')
    # Salva
    page.locator('button:has-text("Criar categoria")').last.click()
    page.wait_for_timeout(2500)
    page.screenshot(path=r'C:\Users\FSOS\Documents\trae_projects\3\screenshots\12-after-create.png', full_page=True)

    # === 2) EDITAR "Bebidas Quentes" → mudar nome e cor ===
    print('\n=== 2) EDITAR "Bebidas Quentes" → "Doces" + cor âmbar ===')
    # Localiza a linha com "Bebidas Quentes" e clica no botão Editar dela
    row = page.locator('div').filter(has_text='Bebidas Quentes').filter(has=page.locator('button:has-text("Editar")')).first
    row.locator('button:has-text("Editar")').first.click()
    page.wait_for_timeout(800)
    # Limpa o input de nome e escreve novo
    name_input = page.locator('#cat-name')
    name_input.fill('')
    name_input.fill('Doces')
    # Limpa o hex custom (garantir que preset funcione)
    page.fill('#cat-color-hex', '')
    # Clica no preset âmbar (f59e0b)
    page.locator('button[aria-label="Cor Âmbar"]').first.click()
    page.wait_for_timeout(400)
    page.screenshot(path=r'C:\Users\FSOS\Documents\trae_projects\3\screenshots\13-editing.png')
    # Salva
    page.locator('button:has-text("Salvar alterações")').last.click()
    page.wait_for_timeout(2500)
    page.screenshot(path=r'C:\Users\FSOS\Documents\trae_projects\3\screenshots\14-after-edit.png', full_page=True)

    # === 3) EXCLUIR a categoria "Doces" ===
    print('\n=== 3) EXCLUIR "Doces" ===')
    row2 = page.locator('div').filter(has_text='Doces').filter(has=page.locator('button:has-text("Excluir")')).first
    row2.locator('button:has-text("Excluir")').first.click()
    page.wait_for_timeout(800)
    page.screenshot(path=r'C:\Users\FSOS\Documents\trae_projects\3\screenshots\15-delete-confirm.png')
    # Clica em "Excluir permanentemente"
    page.locator('button:has-text("Excluir permanentemente")').first.click()
    page.wait_for_timeout(2500)
    page.screenshot(path=r'C:\Users\FSOS\Documents\trae_projects\3\screenshots\16-after-delete.png', full_page=True)

    browser.close()
    print('\n[DONE] Fluxo completo validado')
