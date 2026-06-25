"""
Validação Playwright do módulo de Fornecedores.
"""
from playwright.sync_api import sync_playwright, expect
import sys

URL = "http://localhost:3100"

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()

        console_errors = []
        page.on("console", lambda msg: console_errors.append((msg.type, msg.text)) if msg.type in ("error",) else None)
        page.on("pageerror", lambda err: console_errors.append(("pageerror", str(err))))

        def row(name):
            """Retorna o locator da row do fornecedor (div com class px-5 py-3 que contém o nome)."""
            return page.locator('div.px-5.py-3', has=page.locator(f'text="{name}"'))

        # 1. LOGIN
        print("\n[1] LOGIN")
        page.goto(f"{URL}/login", wait_until="networkidle")
        page.fill('input[type="email"]', "admin@demo.com")
        page.fill('input[type="password"]', "admin123")
        page.click('button[type="submit"]')
        page.wait_for_url("**/admin", timeout=10000)
        page.wait_for_load_state("networkidle")
        print(f"  ✓ Logado em: {page.url}")

        # 2. NAVEGAR PARA FORNECEDORES
        print("\n[2] NAVEGAR PARA /app/suppliers")
        page.goto(f"{URL}/app/suppliers", wait_until="networkidle")
        page.wait_for_timeout(1500)

        # 3. VERIFICAR ELEMENTOS
        print("\n[3] VERIFICAR ELEMENTOS DA PÁGINA")
        checks = {
            "h1 Fornecedores": page.locator('h1:has-text("Fornecedores")').count() > 0,
            "Header contador": page.locator('text=/fornecedor.*ativo/i').count() > 0,
            "Botão Novo fornecedor": page.locator('button:has-text("Novo fornecedor")').count() > 0,
            "Campo busca": page.locator('input[placeholder*="Buscar por nome"]').count() > 0,
            "Chip Mostrar arquivados": page.locator('button:has-text("Mostrar arquivados")').count() > 0,
            "Distribuidora Atlas (seed)": page.locator('text="Distribuidora Atlas"').count() > 0,
            "Polos Norte (seed)": page.locator('text="Indústria Polos Norte"').count() > 0,
            "Botão Editar (Atlas)": row("Distribuidora Atlas").locator('button:has-text("Editar")').count() > 0,
            "Botão Arquivar (Atlas)": row("Distribuidora Atlas").locator('button:has-text("Arquivar")').count() > 0,
            "Botão Excluir (Atlas)": row("Distribuidora Atlas").locator('button:has-text("Excluir")').count() > 0,
        }
        for label, ok in checks.items():
            print(f"  {'✓' if ok else '✗'} {label}")

        # 4. SIDEBAR COM LINK FORNECEDORES
        print("\n[4] SIDEBAR: link 'Fornecedores'")
        sidebar_link = page.locator('nav, aside').locator('a:has-text("Fornecedores"), button:has-text("Fornecedores")').first
        if sidebar_link.count() > 0:
            print("  ✓ Link Fornecedores presente na sidebar")
        else:
            print("  ✗ Link Fornecedores NÃO encontrado na sidebar")

        # 5. BUSCA
        print("\n[5] TESTAR BUSCA")
        page.fill('input[placeholder*="Buscar por nome"]', "Polos")
        page.wait_for_timeout(500)
        atlas_visible = page.locator('text="Distribuidora Atlas"').count() > 0
        polos_visible = page.locator('text="Indústria Polos Norte"').count() > 0
        print(f"  Atlas: {'visível (✗)' if atlas_visible else 'filtrado (✓)'}")
        print(f"  Polos: {'visível (✓)' if polos_visible else 'filtrado (✗)'}")
        page.fill('input[placeholder*="Buscar por nome"]', "")
        page.wait_for_timeout(300)

        # 6. CRIAR FORNECEDOR
        print("\n[6] CRIAR FORNECEDOR")
        page.click('button:has-text("Novo fornecedor")')
        page.wait_for_timeout(500)
        page.fill('#sup-name', "Fornecedor Playwright E2E")
        page.fill('#sup-document', "33.444.555/0001-66")
        page.fill('#sup-email', "playwright@teste.com.br")
        page.fill('#sup-phone', "11988887777")
        page.fill('#sup-contact', "Maria Playwright")
        # Expandir endereço
        page.locator('button:has-text("Endereço")').first.click()
        page.wait_for_timeout(200)
        page.fill('#sup-address', "Av. Playwright, 1234")
        page.fill('#sup-city', "São Paulo")
        page.select_option('#sup-state', "SP")
        page.fill('#sup-zip', "01000-000")
        # Preencher lead time
        page.fill('#sup-lead', "10")
        page.fill('#sup-notes', "Fornecedor criado via teste Playwright")
        page.click('button:has-text("Criar fornecedor")')
        # Aguardar modal fechar
        try:
            page.wait_for_selector('#sup-name', state='detached', timeout=8000)
            print("  Modal fechou após criar")
        except Exception:
            print("  ✗ Modal não fechou após criar")
        page.wait_for_timeout(500)
        toast = page.locator('text=/criado/i').count() > 0
        print(f"  Toast de sucesso: {'✓' if toast else '✗'}")
        novo_visivel = page.locator('text="Fornecedor Playwright E2E"').count() > 0
        print(f"  Aparece na lista: {'✓' if novo_visivel else '✗'}")

        # 7. EDITAR
        print("\n[7] EDITAR FORNECEDOR")
        # Garantir que nenhum modal está aberto
        page.wait_for_timeout(800)
        modal_open = page.locator('#sup-name').count() > 0
        print(f"  Modal ainda aberto? {'sim (✗)' if modal_open else 'não (✓)'}")
        if modal_open:
            page.keyboard.press('Escape')
            page.wait_for_timeout(800)
        row("Fornecedor Playwright E2E").locator('button:has-text("Editar")').first.click()
        page.wait_for_selector('#sup-name', state='visible', timeout=5000)
        page.fill('#sup-lead', "21")
        page.click('button:has-text("Salvar alterações")')
        # Aguardar modal fechar (até 10s)
        try:
            page.wait_for_selector('#sup-name', state='detached', timeout=10000)
        except Exception:
            print("  ✗ Modal não fechou após salvar")
        # Aguardar toast aparecer
        page.wait_for_timeout(800)
        toast_edit = page.locator('text=/atualizado/i').count() > 0
        print(f"  Toast atualização: {'✓' if toast_edit else '✗'}")

        # 8. ARQUIVAR
        print("\n[8] ARQUIVAR")
        page.wait_for_timeout(500)
        modal_open = page.locator('#sup-name').count() > 0
        print(f"  Modal aberto antes de arquivar? {'sim (✗)' if modal_open else 'não (✓)'}")
        # Arquivar: fornecedor some da lista ativa, então só clicamos
        row("Fornecedor Playwright E2E").locator('button:has-text("Arquivar")').click()
        page.wait_for_timeout(2000)
        # Verificar toast de arquivado
        toast_arch = page.locator('text=/arquivado/i').count() > 0
        print(f"  Toast arquivado: {'✓' if toast_arch else '✗'}")
        # Verificar que sumiu da lista ativa
        sumiu = page.locator('text="Fornecedor Playwright E2E"').count() == 0
        print(f"  Sumiu da lista ativa: {'✓' if sumiu else '✗'}")

        # 9. MOSTRAR ARQUIVADOS
        print("\n[9] MOSTRAR ARQUIVADOS")
        page.click('button:has-text("arquivados")')
        page.wait_for_timeout(1200)
        # Agora deve aparecer com badge "arquivado" e botão "Restaurar"
        badge = row("Fornecedor Playwright E2E").locator('text=arquivado').count() > 0
        print(f"  Badge 'arquivado' visível: {'✓' if badge else '✗'}")
        rest_visivel = row("Fornecedor Playwright E2E").locator('button:has-text("Restaurar")').count() > 0
        print(f"  Botão Restaurar visível: {'✓' if rest_visivel else '✗'}")
        if not (badge and rest_visivel):
            page.screenshot(path="c:/Users/FSOS/Documents/trae_projects/3/debug-archive.png", full_page=True)

        # 10. RESTAURAR
        print("\n[10] RESTAURAR")
        row("Fornecedor Playwright E2E").locator('button:has-text("Restaurar")').first.click()
        page.wait_for_timeout(1500)
        # Toast pode ter sumido (3.5s timeout) — checar via console errors e row
        toast_rest = page.locator('.fixed.bottom-6.right-6').count() > 0
        print(f"  Toast presente: {'✓' if toast_rest else '✗ (pode ter expirado)'}")
        # Esconder arquivados de novo para o teste final
        page.click('button:has-text("arquivados")')
        page.wait_for_timeout(1200)
        arq = row("Fornecedor Playwright E2E").locator('button:has-text("Arquivar")').count() > 0
        print(f"  Voltou botão Arquivar: {'✓' if arq else '✗'}")

        # 11. EXCLUIR
        print("\n[11] EXCLUIR")
        row("Fornecedor Playwright E2E").locator('button:has-text("Excluir")').first.click()
        page.wait_for_timeout(800)
        page.click('button:has-text("Excluir permanentemente")')
        page.wait_for_timeout(2500)
        excluido = page.locator('text="Fornecedor Playwright E2E"').count() == 0
        print(f"  Removido da lista: {'✓' if excluido else '✗'}")

        # 12. CONSOLE ERRORS
        print("\n[12] CONSOLE")
        unexpected = [c for c in console_errors if "401" not in c[1] and "404" not in c[1] and "Failed to load" not in c[1] and "favicon" not in c[1].lower()]
        if unexpected:
            print(f"  ⚠ {len(unexpected)} erros inesperados:")
            for t, msg in unexpected[:5]:
                print(f"    [{t}] {msg[:200]}")
        else:
            print(f"  ✓ 0 erros inesperados ({len(console_errors)} total, todos 401/404/load esperados)")

        # Screenshot final
        page.screenshot(path="c:/Users/FSOS/Documents/trae_projects/3/suppliers-final.png", full_page=True)
        print("\n  📸 Screenshot: suppliers-final.png")

        browser.close()
        print("\n=== VALIDAÇÃO COMPLETA ===")

run()

