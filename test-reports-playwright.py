"""
Validação visual da página de Relatórios via Playwright.

Servidor (port 3100) já está rodando.
Este script:
1. Faz login
2. Navega para /app/reports
3. Espera os elementos aparecerem
4. Tira screenshots
5. Verifica erros no console
"""
import sys
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:3100'
EMAIL = 'admin@demo.com'
PASSWORD = 'admin123'


def main():
    errors = []
    console_messages = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1440, 'height': 900})
        page = context.new_page()

        # Captura erros do console
        def on_console(msg):
            if msg.type in ('error', 'warning'):
                console_messages.append(f"[{msg.type}] {msg.text}")
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
        page.wait_for_url(lambda u: '/app' in u or '/dashboard' in u or '/admin' in u, timeout=15000)
        print(f"    Logado, URL atual: {page.url}")

        # 2) Vai para /app/reports
        print("[2] Navegando para /app/reports...")
        page.goto(f'{BASE}/app/reports', wait_until='networkidle', timeout=30000)
        print(f"    URL: {page.url}")

        # 3) Espera header aparecer
        print("[3] Aguardando header...")
        page.wait_for_selector('h1', timeout=15000)
        h1_text = page.locator('h1').first.text_content()
        print(f"    H1: {h1_text!r}")

        # 4) Espera dados carregarem (KPIs com valores)
        print("[4] Aguardando dados...")
        page.wait_for_timeout(2000)  # tempo para fetches

        # 5) Verifica elementos esperados
        checks = [
            ('h1:has-text("Relatórios")', 'Header H1'),
            ('text=Receita Total', 'KPI Receita'),
            ('text=Ticket Médio', 'KPI Ticket'),
            ('text=Clientes Únicos', 'KPI Clientes'),
            ('text=Evolução de Receita', 'Timeseries'),
            ('text=Vendas por Canal', 'Channels'),
            ('text=Produtos Mais Vendidos', 'Top Produtos'),
            ('text=Top Clientes', 'Top Clientes'),
            ('text=Exportar CSV', 'Botao Exportar'),
            ('button:has-text("7 dias")', 'Preset 7d'),
            ('button:has-text("30 dias")', 'Preset 30d'),
            ('button:has-text("Este mês")', 'Preset thisMonth'),
        ]
        print("[5] Verificando elementos...")
        all_ok = True
        for selector, label in checks:
            try:
                loc = page.locator(selector).first
                count = page.locator(selector).count()
                visible = loc.is_visible() if count > 0 else False
                mark = 'OK' if visible else 'FAIL'
                if not visible:
                    all_ok = False
                print(f"    [{mark}] {label}: count={count} visible={visible}")
            except Exception as e:
                all_ok = False
                print(f"    [FAIL] {label}: {e}")

        # 6) Verifica Recharts renderizou
        print("[6] Verificando graficos Recharts...")
        recharts_svg = page.locator('.recharts-wrapper svg').count()
        print(f"    Recharts SVG count: {recharts_svg}")

        # 7) Screenshot full page
        page.screenshot(path=r'c:\Users\FSOS\Documents\trae_projects\3\reports-screenshot.png', full_page=True)
        print(f"    Screenshot salvo: reports-screenshot.png")

        # 8) Testa mudança de período
        print("[7] Testando troca de periodo (7d)...")
        page.click('button:has-text("7 dias")')
        page.wait_for_timeout(1500)
        page.screenshot(path=r'c:\Users\FSOS\Documents\trae_projects\3\reports-7d.png', full_page=True)
        print(f"    Screenshot 7d salvo")

        # 9) Testa sort produtos por quantidade
        print("[8] Testando sort por Quantidade...")
        page.click('button:has-text("Quantidade")')
        page.wait_for_timeout(1000)
        page.screenshot(path=r'c:\Users\FSOS\Documents\trae_projects\3\reports-quantity.png', full_page=True)
        print(f"    Screenshot sort=Qtd salvo")

        # 10) Volta para 30d
        print("[9] Voltando para 30d...")
        page.click('button:has-text("30 dias")')
        page.wait_for_timeout(1500)

        # 11) Click no header da tabela
        print("[10] Testando ordenacao da tabela de clientes...")
        try:
            page.locator('th button:has-text("Pedidos")').first.click()
            page.wait_for_timeout(500)
            page.screenshot(path=r'c:\Users\FSOS\Documents\trae_projects\3\reports-sorted-orders.png', full_page=True)
            print(f"    OK sort por Pedidos")
        except Exception as e:
            print(f"    Falha: {e}")

        # 12) Testa export
        print("[11] Testando export CSV...")
        with page.expect_download(timeout=10000) as download_info:
            page.click('button:has-text("Exportar CSV")')
        download = download_info.value
        save_path = r'c:\Users\FSOS\Documents\trae_projects\3\reports-export.csv'
        download.save_as(save_path)
        print(f"    Download salvo em {save_path}")

        browser.close()

    # Relatório
    print()
    print("=" * 60)
    print(f"Erros de pagina: {len(errors)}")
    for e in errors:
        print(f"  - {e}")
    print(f"Console messages (errors/warnings): {len(console_messages)}")
    for m in console_messages[:20]:
        print(f"  - {m}")
    print("=" * 60)

    if errors or not all_ok:
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
