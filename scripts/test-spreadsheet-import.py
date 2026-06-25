"""
E2E test para importação de planilha no Estoque.

Valida:
  - Botão "Importar planilha" presente
  - Modal abre
  - Usar planilha de exemplo
  - Analisar → vai para passo 2
  - Tabela mostra produtos parseados
  - Criar nova categoria "Bebidas" inline
  - Mover produtos → produtos criados e atribuídos à categoria
"""
import re
import sys
import time
from playwright.sync_api import sync_playwright, expect

FRONT = "http://localhost:3100"
API = "http://localhost:3103"
TS = int(time.time())
CAT_NAME = f"Bebidas E2E {TS}"

results: list[tuple[str, bool, str]] = []

def step(name: str, fn):
    try:
        info = fn() or ""
        results.append((name, True, info))
        print(f"OK   {name}  {info}")
    except Exception as e:
        results.append((name, False, str(e)[:300]))
        print(f"FAIL {name}  {e}")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        page.set_default_timeout(15_000)

        # Login via API
        def login():
            r = context.request.post(f"{API}/api/v1/auth/login", data={
                "email": "admin@demo.com",
                "password": "admin123",
            })
            if r.status != 200:
                raise Exception(f"login {r.status}")
            return "ok"
        step("login via API", login)

        # 1) Abrir /app/inventory
        def open_inventory():
            page.goto(f"{FRONT}/app/inventory", wait_until="networkidle")
            page.wait_for_selector("text=Estoque", timeout=10_000)
            return "ok"
        step("abrir /app/inventory", open_inventory)

        # 2) Botão "Importar planilha" presente
        def import_btn():
            btn = page.get_by_test_id("open-spreadsheet-import")
            expect(btn).to_be_visible()
            return "botão visível"
        step("botão 'Importar planilha' presente", import_btn)

        # 3) Clicar para abrir modal
        def open_modal():
            page.get_by_test_id("open-spreadsheet-import").click()
            page.wait_for_selector("text=Importar planilha", timeout=5_000)
            page.wait_for_timeout(500)
            return "modal aberto"
        step("abrir modal", open_modal)

        # 4) Clicar "Usar planilha de exemplo"
        def use_sample():
            page.get_by_text("Usar planilha de exemplo").click()
            page.wait_for_timeout(500)
            # Textarea deve estar preenchida
            val = page.get_by_test_id("csv-textarea").input_value()
            if "Heineken" not in val:
                raise Exception("exemplo não foi carregado")
            return f"{val.count(chr(10))} linhas"
        step("carregar exemplo", use_sample)

        # 5) Clicar "Analisar"
        def analyze():
            page.get_by_test_id("csv-analyze-btn").click()
            page.wait_for_selector("text=Revisar e mover", timeout=10_000)
            page.wait_for_timeout(500)
            # Tabela deve ter produtos
            rows = page.locator("tbody tr")
            count = rows.count()
            if count < 5:
                raise Exception(f"esperado >=5 linhas, vi {count}")
            return f"{count} produtos"
        step("analisar planilha", analyze)

        # 6) Criar nova categoria inline
        def create_category():
            page.get_by_test_id("new-category-name").fill(CAT_NAME)
            page.get_by_test_id("create-category-btn").click()
            # Espera o select atualizar
            page.wait_for_timeout(800)
            # Verifica que a categoria aparece no select
            opts = page.get_by_test_id("target-category-select").locator("option").all_text_contents()
            if not any(CAT_NAME in o for o in opts):
                raise Exception(f"categoria não apareceu no select: {opts}")
            return f"categoria '{CAT_NAME}' criada"
        step("criar categoria inline", create_category)

        # 7) Selecionar só as 3 primeiras linhas (ex: 2 Heineken + 1 Brahma)
        def select_first_3():
            # desmarca todos
            page.get_by_text("Desmarcar todos").click()
            page.wait_for_timeout(200)
            # marca 3 primeiros
            for i in range(3):
                page.get_by_test_id(f"csv-row-{i}").check()
            page.wait_for_timeout(200)
            # confirma contagem
            text = page.locator("text=selecionado(s)").first.text_content() or ""
            if "3 selecionado" not in text:
                raise Exception(f"contador errado: {text}")
            return "3 selecionados"
        step("selecionar 3 produtos", select_first_3)

        # 8) Confirmar movimentação
        def commit():
            page.get_by_test_id("csv-commit-btn").click()
            page.wait_for_selector("text=Importado", timeout=15_000)
            page.wait_for_timeout(800)
            # Modal deve ter fechado
            if page.get_by_test_id("csv-analyze-btn").is_visible():
                raise Exception("modal não fechou")
            return "modal fechou"
        step("confirmar e mover", commit)

        # 9) Verificar via API que a categoria "Bebidas" foi criada com 3 produtos
        def verify_category():
            r = context.request.get(f"{API}/api/v1/categories")
            if r.status != 200:
                raise Exception(f"GET /categories {r.status}")
            cats = r.json()["items"]
            target = next((c for c in cats if c["name"] == CAT_NAME), None)
            if not target:
                raise Exception(f"categoria '{CAT_NAME}' não foi criada")
            if target.get("productCount", 0) < 3:
                raise Exception(f"categoria tem {target.get('productCount')} produtos, esperado >=3")
            return f"id={target['id'][:8]} productCount={target['productCount']}"
        step("categoria criada com produtos via API", verify_category)

        # 10) Verificar via API que os 3 produtos (2 Heineken + 1 Brahma) foram criados
        def verify_products():
            r = context.request.get(f"{API}/api/v1/categories")
            cats = r.json()["items"]
            target = next((c for c in cats if c["name"] == CAT_NAME), None)
            cat_id = target["id"]
            r2 = context.request.get(f"{API}/api/v1/products?categoryId={cat_id}")
            items = r2.json()["items"]
            names = [i["name"] for i in items]
            if not any("Heineken" in n for n in names):
                raise Exception(f"produtos sem Heineken: {names}")
            return f"{len(items)} produtos: {names[:3]}"
        step("produtos importados com nomes corretos", verify_products)

        # 11) Verificar que aparece no sidebar visualmente após reload
        def verify_sidebar():
            page.reload(wait_until="networkidle")
            page.wait_for_timeout(1000)
            # Pega o aside da página de inventário (não o layout sidebar)
            inventory_aside = page.locator("aside.w-64").first
            text = inventory_aside.text_content() or ""
            if CAT_NAME not in text:
                raise Exception(f"categoria não no sidebar de inventário: {text[:200]}")
            return "ok"
        step("categoria no sidebar de inventário", verify_sidebar)

        # Screenshot final
        page.screenshot(path="screenshots/inventory-after-spreadsheet.png", full_page=True)

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
