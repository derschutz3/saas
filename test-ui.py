"""Valida UI do ERP: login, categorias (botao grande, edit, cor), inventario (botoes), NFe flow."""
from playwright.sync_api import sync_playwright
import os

os.makedirs(r'C:\Users\FSOS\Documents\trae_projects\3\screenshots', exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 900})
    page = context.new_page()

    # 1) Login
    page.goto('http://localhost:3100/login', wait_until='domcontentloaded')
    page.wait_for_load_state('networkidle', timeout=15000)
    page.fill('input[type=email]', 'admin@demo.com')
    page.fill('input[type=password]', 'admin123')
    page.screenshot(path=r'C:\Users\FSOS\Documents\trae_projects\3\screenshots\01-login.png')
    page.click('button[type=submit]')
    page.wait_for_load_state('networkidle', timeout=15000)
    page.wait_for_timeout(1500)
    page.screenshot(path=r'C:\Users\FSOS\Documents\trae_projects\3\screenshots\02-dashboard.png')

    # 2) Categorias
    page.goto('http://localhost:3100/app/inventory/categories', wait_until='domcontentloaded')
    page.wait_for_load_state('networkidle', timeout=15000)
    page.wait_for_timeout(1500)
    page.screenshot(path=r'C:\Users\FSOS\Documents\trae_projects\3\screenshots\03-categories.png', full_page=True)

    # Verificar botao "Nova categoria" e suas dimensoes
    btn_nova = page.get_by_role('button', name='Nova categoria')
    if btn_nova.count() > 0:
        box = btn_nova.first.bounding_box()
        print(f'[OK] Botao "Nova categoria" encontrado: {box}')
    else:
        print('[FAIL] Botao "Nova categoria" nao encontrado')

    # 3) Inventario
    page.goto('http://localhost:3100/app/inventory', wait_until='domcontentloaded')
    page.wait_for_load_state('networkidle', timeout=15000)
    page.wait_for_timeout(1500)
    page.screenshot(path=r'C:\Users\FSOS\Documents\trae_projects\3\screenshots\04-inventory.png', full_page=True)

    # Verificar botao "Importar NFe"
    btn_nfe = page.get_by_role('button', name='Importar NFe')
    if btn_nfe.count() > 0:
        box = btn_nfe.first.bounding_box()
        print(f'[OK] Botao "Importar NFe" encontrado: {box}')
    else:
        print('[FAIL] Botao "Importar NFe" nao encontrado')

    # Verificar botao "Novo produto"
    btn_new = page.get_by_role('button', name='Novo produto')
    if btn_new.count() > 0:
        box = btn_new.first.bounding_box()
        print(f'[OK] Botao "Novo produto" encontrado: {box}')
    else:
        print('[FAIL] Botao "Novo produto" nao encontrado')

    # 4) Abrir modal "Novo produto"
    if btn_new.count() > 0:
        btn_new.first.click()
        page.wait_for_timeout(1200)
        page.screenshot(path=r'C:\Users\FSOS\Documents\trae_projects\3\screenshots\05-new-product-modal.png')
        # Fechar clicando fora ou no botão Cancelar/Fechar
        cancel = page.get_by_role('button', name='Cancelar')
        if cancel.count() == 0:
            cancel = page.get_by_role('button', name='Fechar')
        if cancel.count() == 0:
            # Tentar ESC novamente
            page.keyboard.press('Escape')
        else:
            cancel.first.click()
        page.wait_for_timeout(800)

    # 5) Abrir modal "Importar NFe"
    if btn_nfe.count() > 0:
        # Esperar o modal anterior sumir
        page.wait_for_timeout(500)
        btn_nfe.first.click(force=True)
        page.wait_for_timeout(1500)
        page.screenshot(path=r'C:\Users\FSOS\Documents\trae_projects\3\screenshots\06-nfe-modal-step1.png')
        # Tentar usar botao "Usar exemplo"
        btn_example = page.get_by_role('button', name='Usar exemplo')
        if btn_example.count() > 0:
            btn_example.first.click()
            page.wait_for_timeout(500)
            # Clicar em "Analisar"
            btn_analyze = page.get_by_role('button', name='Analisar')
            if btn_analyze.count() > 0:
                btn_analyze.first.click()
                page.wait_for_timeout(2500)
                page.screenshot(path=r'C:\Users\FSOS\Documents\trae_projects\3\screenshots\07-nfe-modal-step2.png')
        # Fechar
        cancel2 = page.get_by_role('button', name='Cancelar')
        if cancel2.count() == 0:
            cancel2 = page.get_by_role('button', name='Fechar')
        if cancel2.count() > 0:
            cancel2.first.click()
        else:
            page.keyboard.press('Escape')
        page.wait_for_timeout(500)

    browser.close()
    print('[DONE] Screenshots salvas em C:/Users/FSOS/Documents/trae_projects/3/screenshots/')
