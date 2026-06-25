"""
E2E Playwright test for /app/settings page.

Valida:
  - Página carrega em /app/settings
  - Abas Empresa, Usuários, Filiais visíveis
  - Aba Empresa: businessType alterado persiste
  - Aba Usuários: cria novo usuário via modal
  - Aba Filiais: cria nova filial via modal
"""
import sys
import time
from playwright.sync_api import sync_playwright, expect

FRONT = "http://localhost:3100"
API = "http://localhost:3103"

results: list[tuple[str, bool, str]] = []

def step(name: str, fn):
    try:
        info = fn() or ""
        results.append((name, True, info))
        print(f"OK   {name}  {info}")
    except Exception as e:
        results.append((name, False, str(e)[:200]))
        print(f"FAIL {name}  {e}")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        page.set_default_timeout(15_000)

        # 1) Login via API (cookies no context)
        def login():
            r = context.request.post(f"{API}/api/v1/auth/login", data={
                "email": "admin@demo.com",
                "password": "admin123",
            })
            if r.status != 200:
                raise Exception(f"login status {r}")
            return "ok"
        step("login via API", login)

        # 2) Abrir /app/settings
        def open_settings():
            page.goto(f"{FRONT}/app/settings", wait_until="networkidle")
            # Espera header
            page.wait_for_selector("text=Configurações", timeout=10_000)
            return "page loaded"
        step("abrir /app/settings", open_settings)

        # 3) Verificar que as 3 abas estão lá
        def tabs_present():
            for tab_name in ["Empresa", "Usuários", "Filiais"]:
                expect(page.get_by_role("button", name=tab_name)).to_be_visible()
            return "3 abas visíveis"
        step("abas presentes", tabs_present)

        # 4) Aba Empresa: alterar businessType para BAKERY
        def change_business_type():
            # Garantir que estamos na aba Empresa
            page.get_by_role("button", name="Empresa").click()
            page.wait_for_timeout(500)
            select = page.get_by_test_id("settings-businessType")
            select.select_option("BAKERY")
            page.get_by_test_id("settings-save").click()
            # Espera toast
            page.wait_for_selector("text=Configurações salvas", timeout=5_000)
            return "businessType=BAKERY"
        step("aba Empresa: salvar businessType=BAKERY", change_business_type)

        # 5) Recarregar e verificar que persistiu
        def persist_check():
            page.reload(wait_until="networkidle")
            page.get_by_role("button", name="Empresa").click()
            page.wait_for_timeout(500)
            select = page.get_by_test_id("settings-businessType")
            val = select.input_value()
            if val != "BAKERY":
                raise Exception(f"expected BAKERY, got {val}")
            return f"persistido: {val}"
        step("persistência após reload", persist_check)

        # Restaurar PIZZARIA para deixar limpo
        page.get_by_test_id("settings-businessType").select_option("PIZZARIA")
        page.get_by_test_id("settings-save").click()
        page.wait_for_selector("text=Configurações salvas", timeout=5_000)

        # 6) Aba Usuários: clicar em "Novo usuário"
        def open_users_tab():
            page.get_by_role("button", name="Usuários").click()
            page.wait_for_timeout(500)
            expect(page.get_by_test_id("settings-users-new")).to_be_visible()
            return "aba Usuários ativa"
        step("aba Usuários", open_users_tab)

        # 7) Criar novo usuário
        ts = int(time.time())
        uemail = f"e2e_user_{ts}@example.com"
        def create_user():
            page.get_by_test_id("settings-users-new").click()
            page.wait_for_selector('[data-testid="settings-user-form-modal"]', timeout=5_000)
            page.get_by_test_id("settings-user-name").fill("E2E User")
            page.get_by_test_id("settings-user-email").fill(uemail)
            page.get_by_test_id("settings-user-password").fill("senha123")
            page.get_by_test_id("settings-user-role").select_option("VIEWER")
            page.get_by_test_id("settings-user-submit").click()
            page.wait_for_selector("text=Usuário criado", timeout=5_000)
            # Verificar que aparece na tabela
            page.wait_for_timeout(500)
            expect(page.get_by_text(uemail)).to_be_visible()
            return f"criado: {uemail}"
        step("criar usuário via UI", create_user)

        # 8) Excluir usuário criado
        def delete_user():
            # Buscar linha pelo email
            row = page.locator(f'tr:has-text("{uemail}")')
            row.locator('button[title="Excluir"]').click()
            # Confirmar
            page.get_by_test_id("settings-users-delete-confirm").click()
            page.wait_for_selector("text=Usuário excluído", timeout=5_000)
            return f"removido: {uemail}"
        step("excluir usuário via UI", delete_user)

        # 9) Aba Filiais
        def open_branches_tab():
            page.get_by_role("button", name="Filiais").click()
            page.wait_for_timeout(500)
            expect(page.get_by_test_id("settings-branches-new")).to_be_visible()
            return "aba Filiais ativa"
        step("aba Filiais", open_branches_tab)

        # 10) Criar filial
        bname = f"E2E Filial {ts}"
        def create_branch():
            page.get_by_test_id("settings-branches-new").click()
            page.wait_for_timeout(500)
            page.get_by_test_id("settings-branch-name").fill(bname)
            page.get_by_test_id("settings-branch-submit").click()
            page.wait_for_selector("text=Filial criada", timeout=5_000)
            expect(page.get_by_text(bname)).to_be_visible()
            return f"criada: {bname}"
        step("criar filial via UI", create_branch)

        # 11) Excluir filial
        def delete_branch():
            row = page.locator(f'tr:has-text("{bname}")')
            row.locator('button[title="Excluir"]').click()
            page.wait_for_timeout(500)
            page.locator('button:has-text("Excluir filial")').last.click()
            page.wait_for_selector("text=Filial excluída", timeout=5_000)
            return f"removida: {bname}"
        step("excluir filial via UI", delete_branch)

        # Screenshot final
        page.screenshot(path="screenshots/settings-final.png", full_page=True)

        browser.close()

    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print("\n" + "=" * 60)
    print(f"RESULT: {passed}/{total} passed")
    print("=" * 60)
    if passed != total:
        for n, ok, info in results:
            if not ok:
                print(f"  - {n}: {info}")
        sys.exit(1)


if __name__ == "__main__":
    main()
