"""
Validação visual da página /app/inventory/movements via Playwright.
"""
import sys
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:3100'
EMAIL = 'admin@demo.com'
PASSWORD = 'admin123'


def main():
    errors = []
    console_errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1600, 'height': 900})
        page = context.new_page()

        def on_console(msg):
            if msg.type == 'error':
                console_errors.append(msg.text)
        page.on('console', on_console)

        def on_pageerror(err):
            errors.append(f"PAGE ERROR: {err}")
        page.on('pageerror', on_pageerror)

        # 1) Login
        print("[1] Login...")
        page.goto(f'{BASE}/login', wait_until='networkidle')
        page.fill('input[type=email], input[name=email]', EMAIL)
        page.fill('input[type=password], input[name=password]', PASSWORD)
        page.click('button[type=submit]')
        page.wait_for_url(lambda u: '/app' in u or '/admin' in u, timeout=15000)
        print(f"    Logado: {page.url}")

        # 2) Navega para /app/inventory/movements
        print("[2] Navegando para /app/inventory/movements...")
        page.goto(f'{BASE}/app/inventory/movements', wait_until='networkidle', timeout=30000)
        page.wait_for_selector('h1', timeout=15000)
        h1 = page.locator('h1').first.text_content()
        print(f"    H1: {h1!r}")
        assert h1 == 'Movimentações de Estoque'
        page.wait_for_timeout(2500)

        all_ok = True

        # 3) Verifica elementos
        print("[3] Verificando elementos...")
        checks = [
            ('text=Total de movimentações', 'KPI Total'),
            ('text=Vendas (saídas)', 'KPI Vendas'),
            ('text=Ajustes', 'KPI Ajustes'),
            ('text=Transferências', 'KPI Transferencias'),
            ('input[placeholder*="Buscar"]', 'Input de busca'),
            ('button:has-text("Atualizar")', 'Botao Atualizar'),
            ('button:has-text("Ajustar estoque")', 'Botao Ajustar estoque'),
            ('button:has-text("Todos")', 'Filtro Todos'),
            ('button:has-text("Vendas")', 'Filtro Vendas'),
            ('button:has-text("Ajustes")', 'Filtro Ajustes'),
        ]
        for selector, label in checks:
            try:
                count = page.locator(selector).count()
                visible = page.locator(selector).first.is_visible() if count > 0 else False
                mark = 'OK' if visible else 'FAIL'
                if not visible:
                    all_ok = False
                print(f"    [{mark}] {label}")
            except Exception as e:
                all_ok = False
                print(f"    [FAIL] {label}: {e}")

        # 4) Verifica linhas
        print("[4] Verificando linhas...")
        rows = page.locator('tbody tr').count()
        print(f"    Linhas: {rows}")

        # 5) Screenshot
        page.screenshot(path=r'c:\Users\FSOS\Documents\trae_projects\3\inventory-movements.png', full_page=True)

        # 6) Testa filtro Vendas
        print("[5] Testando filtro 'Vendas'...")
        page.click('button:has-text("Vendas")')
        page.wait_for_timeout(1000)
        rows_sales = page.locator('tbody tr').count()
        print(f"    Linhas Vendas: {rows_sales}")
        page.screenshot(path=r'c:\Users\FSOS\Documents\trae_projects\3\inventory-movements-sales.png', full_page=True)

        # 7) Testa busca
        print("[6] Testando busca...")
        page.fill('input[placeholder*="Buscar"]', 'a')
        page.wait_for_timeout(800)
        rows_search = page.locator('tbody tr').count()
        print(f"    Linhas busca: {rows_search}")
        page.fill('input[placeholder*="Buscar"]', '')
        page.wait_for_timeout(500)

        # Volta para todos
        page.click('button:has-text("Todos")')
        page.wait_for_timeout(1000)

        # 8) Testa modal de ajuste
        print("[7] Abrindo modal de ajuste...")
        page.click('button:has-text("Ajustar estoque")')
        page.wait_for_timeout(800)
        modal_visible = page.locator('h2:has-text("Ajustar Estoque")').is_visible()
        print(f"    Modal visivel: {modal_visible}")
        if not modal_visible:
            all_ok = False
        page.screenshot(path=r'c:\Users\FSOS\Documents\trae_projects\3\inventory-adjust-modal.png', full_page=True)

        # Selecionar produto (pega o primeiro)
        print("[8] Selecionando produto...")
        try:
            page.click('li.cursor-pointer', timeout=5000)
            page.wait_for_timeout(500)
            # Escolhe saída (botão dentro do modal — escopo pelo container flex)
            page.locator('div.fixed.inset-0 button:has-text("Saída")').first.click()
            page.wait_for_timeout(300)
            # Quantidade
            page.fill('input[placeholder="Ex: 10"]', '5')
            # Motivo
            page.fill('input[placeholder*="Inventário"]', 'Ajuste de teste')
            page.wait_for_timeout(500)
            page.screenshot(path=r'c:\Users\FSOS\Documents\trae_projects\3\inventory-adjust-filled.png', full_page=True)
            # Submete
            page.click('button:has-text("Confirmar ajuste")')
            page.wait_for_timeout(2500)
            # Verifica toast
            toast = page.locator('text=Estoque ajustado:').first
            toast_visible = toast.is_visible() if toast.count() > 0 else False
            print(f"    Toast visivel: {toast_visible}")
            page.screenshot(path=r'c:\Users\FSOS\Documents\trae_projects\3\inventory-after-adjust.png', full_page=True)
        except Exception as e:
            print(f"    [WARN] {e}")

        # 9) Filtra Ajustes (deve ter 1 agora)
        print("[9] Verificando filtro 'Ajustes'...")
        page.wait_for_timeout(1000)
        # escopo: filtra por botão no header de filtros (não o do modal)
        # O filtro fica em uma div com o título "Tipo"
        # Vamos usar um seletor mais específico: botão dentro do container de filtros
        page.locator('span:has-text("Tipo") ~ button:has-text("Ajustes")').first.click()
        page.wait_for_timeout(1000)
        rows_adj = page.locator('tbody tr').count()
        print(f"    Linhas Ajustes: {rows_adj}")
        page.screenshot(path=r'c:\Users\FSOS\Documents\trae_projects\3\inventory-adjustments.png', full_page=True)

        # 10) Verifica link no /app/inventory
        print("[10] Verificando link no /app/inventory...")
        page.goto(f'{BASE}/app/inventory', wait_until='networkidle', timeout=30000)
        page.wait_for_timeout(2000)
        link = page.locator('a[href="/app/inventory/movements"]').first
        link_visible = link.is_visible() if link.count() > 0 else False
        print(f"    Link Movimentacoes: {link_visible}")
        if not link_visible:
            all_ok = False

        browser.close()

    print()
    print("=" * 60)
    print(f"Erros de pagina: {len(errors)}")
    for e in errors[:5]:
        print(f"  - {e}")
    print(f"Console errors: {len(console_errors)}")
    for e in console_errors[:5]:
        print(f"  - {e[:120]}")
    print("=" * 60)

    if errors or not all_ok:
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
