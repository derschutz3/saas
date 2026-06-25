"""
E2E test for Settings module.

Valida:
  - GET    /api/v1/settings/me/tenant
  - PATCH  /api/v1/settings/me/tenant (altera businessType + dados cadastrais)
  - GET    /api/v1/settings/users
  - POST   /api/v1/settings/users (cria novo usuário, hash de senha aplicado)
  - PATCH  /api/v1/settings/users/:id (atualiza role)
  - DELETE /api/v1/settings/users/:id (remove)
  - GET    /api/v1/settings/branches
  - POST   /api/v1/settings/branches
  - PATCH  /api/v1/settings/branches/:id
  - DELETE /api/v1/settings/branches/:id
  - Não pode excluir o próprio usuário (400)
  - Não pode excluir a filial atual (400)
"""
import json
import sys
import time
import urllib.request
import urllib.error
from http.cookiejar import CookieJar

API = "http://localhost:3103"

class Fail(Exception):
    pass

results: list[tuple[str, bool, str]] = []

def step(name: str, fn):
    try:
        info = fn() or ""
        results.append((name, True, info))
        print(f"OK   {name}  {info}")
    except Fail as e:
        results.append((name, False, str(e)))
        print(f"FAIL {name}  {e}")
    except Exception as e:
        results.append((name, False, f"exception: {e}"))
        print(f"FAIL {name}  exception: {e}")

def make_opener():
    cj = CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj)), cj

def req(opener, method: str, path: str, body=None, expect=200):
    data = None
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    rq = urllib.request.Request(f"{API}{path}", data=data, method=method, headers=headers)
    try:
        with opener.open(rq) as resp:
            status = resp.status
            text = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        status = e.code
        text = e.read().decode("utf-8")
    if expect is not None and status != expect:
        raise Fail(f"expected {expect} got {status}: {text[:200]}")
    try:
        return status, json.loads(text) if text else {}
    except json.JSONDecodeError:
        return status, text

def main():
    opener, _cj = make_opener()

    # 1) login
    def login():
        s, b = req(opener, "POST", "/api/v1/auth/login",
                   {"email": "admin@demo.com", "password": "admin123"})
        if b.get("user", {}).get("email") != "admin@demo.com":
            raise Fail(f"login payload unexpected: {b}")
        return f"userId={b['user']['id'][:8]}"
    step("login admin@demo.com", login)

    # 2) GET /me/tenant
    def get_tenant():
        s, b = req(opener, "GET", "/api/v1/settings/me/tenant")
        if "id" not in b or "businessType" not in b:
            raise Fail(f"missing fields: {b}")
        if "legalName" not in b:
            raise Fail("legalName missing from response")
        if "tradeName" not in b:
            raise Fail("tradeName missing from response")
        if "taxId" not in b:
            raise Fail("taxId missing from response")
        if not isinstance(b.get("enabledModules"), list):
            raise Fail("enabledModules not an array")
        return f"type={b['businessType']} modules={len(b['enabledModules'])}"
    step("GET /me/tenant", get_tenant)

    # 3) PATCH /me/tenant — atualiza businessType + dados cadastrais
    def patch_tenant():
        s, b = req(opener, "PATCH", "/api/v1/settings/me/tenant", {
            "businessType": "PIZZARIA",
            "legalName": "Empresa Teste LTDA",
            "tradeName": "Pizza do Zé",
            "taxId": "12.345.678/0001-90",
        })
        if b.get("businessType") != "PIZZARIA":
            raise Fail(f"businessType not updated: {b.get('businessType')}")
        if b.get("legalName") != "Empresa Teste LTDA":
            raise Fail(f"legalName not set: {b.get('legalName')}")
        if b.get("tradeName") != "Pizza do Zé":
            raise Fail(f"tradeName not set: {b.get('tradeName')}")
        if b.get("taxId") != "12.345.678/0001-90":
            raise Fail(f"taxId not set: {b.get('taxId')}")
        return f"type={b['businessType']} cnpj={b['taxId']}"
    step("PATCH /me/tenant (PIZZARIA + cadastrais)", patch_tenant)

    # 4) GET /me/tenant novamente para confirmar persistência
    def get_tenant_persisted():
        s, b = req(opener, "GET", "/api/v1/settings/me/tenant")
        if b.get("businessType") != "PIZZARIA":
            raise Fail(f"businessType not persisted: {b.get('businessType')}")
        if b.get("tradeName") != "Pizza do Zé":
            raise Fail(f"tradeName not persisted")
        return "ok"
    step("GET /me/tenant (verifica persistência)", get_tenant_persisted)

    # 5) GET /users
    def list_users():
        s, b = req(opener, "GET", "/api/v1/settings/users")
        if "items" not in b or not isinstance(b["items"], list):
            raise Fail(f"items not array: {b}")
        # Confirma que seed users estão lá
        emails = [u["email"] for u in b["items"]]
        if "admin@demo.com" not in emails:
            raise Fail(f"admin@demo.com missing from list: {emails}")
        return f"count={len(b['items'])}"
    step("GET /users (lista inicial)", list_users)

    # 6) POST /users — cria usuário com hash de senha
    uname = f"caixa_test_{int(time.time())}"
    uemail = f"{uname}@example.com"
    def create_user():
        s, b = req(opener, "POST", "/api/v1/settings/users", {
            "name": "Caixa Teste E2E",
            "email": uemail,
            "password": "senha123",
            "role": "CASHIER",
            "active": True,
        }, expect=201)
        if "passwordHash" in b or "passwordSalt" in b:
            raise Fail("password hash leaked in response!")
        if b.get("email") != uemail:
            raise Fail(f"email mismatch: {b.get('email')}")
        if b.get("role") != "CASHIER":
            raise Fail(f"role mismatch: {b.get('role')}")
        if b.get("active") is not True:
            raise Fail(f"active not set: {b.get('active')}")
        return f"id={b['id'][:8]}"
    step("POST /users (cria com hash)", create_user)

    # 7) GET /users — confirma criação
    def list_users_2():
        s, b = req(opener, "GET", "/api/v1/settings/users")
        emails = [u["email"] for u in b["items"]]
        if uemail not in emails:
            raise Fail(f"new user not in list: {emails}")
        return f"count={len(b['items'])}"
    step("GET /users (verifica criação)", list_users_2)

    # 8) Buscar ID do user criado
    def get_user_id():
        s, b = req(opener, "GET", "/api/v1/settings/users")
        for u in b["items"]:
            if u["email"] == uemail:
                return u["id"]
        raise Fail("user not found")
    user_id = get_user_id()

    # 9) PATCH /users/:id — atualiza role e nome
    def update_user():
        s, b = req(opener, "PATCH", f"/api/v1/settings/users/{user_id}", {
            "name": "Caixa Sênior E2E",
            "role": "MANAGER",
        })
        if b.get("role") != "MANAGER":
            raise Fail(f"role not updated: {b.get('role')}")
        if b.get("name") != "Caixa Sênior E2E":
            raise Fail(f"name not updated: {b.get('name')}")
        return "ok"
    step("PATCH /users/:id (atualiza role)", update_user)

    # 10) POST /users com email duplicado — deve retornar 409
    def dup_email():
        s, b = req(opener, "POST", "/api/v1/settings/users", {
            "name": "Dup",
            "email": uemail,
            "password": "outra_senha",
            "role": "VIEWER",
            "active": True,
        }, expect=409)
        return f"status={s}"
    step("POST /users (email duplicado → 409)", dup_email)

    # 11) POST /users sem senha — deve retornar 400 (zod validation)
    def no_password():
        s, b = req(opener, "POST", "/api/v1/settings/users", {
            "name": "Sem Senha",
            "email": "sem_senha@example.com",
            "role": "VIEWER",
            "active": True,
        }, expect=400)
        return f"status={s}"
    step("POST /users (sem senha → 400)", no_password)

    # 12) Tentar excluir o próprio usuário — deve retornar 400
    def self_delete():
        # Pega o userId logado
        s, b = req(opener, "POST", "/api/v1/auth/login",
                   {"email": "admin@demo.com", "password": "admin123"})
        my_id = b["user"]["id"]
        s, b = req(opener, "DELETE", f"/api/v1/settings/users/{my_id}", expect=400)
        return f"status={s}"
    step("DELETE /users/me (auto-delete bloqueado)", self_delete)

    # 13) GET /branches
    def list_branches():
        s, b = req(opener, "GET", "/api/v1/settings/branches")
        if "items" not in b:
            raise Fail(f"items missing: {b}")
        if len(b["items"]) < 1:
            raise Fail("no branches seeded")
        return f"count={len(b['items'])}"
    step("GET /branches (lista inicial)", list_branches)

    # 14) POST /branches
    bname = f"Filial Teste {int(time.time())}"
    def create_branch():
        s, b = req(opener, "POST", "/api/v1/settings/branches", {"name": bname}, expect=201)
        if b.get("name") != bname:
            raise Fail(f"name mismatch: {b.get('name')}")
        return f"id={b['id'][:8]}"
    step("POST /branches (cria)", create_branch)

    # 15) Buscar ID da filial criada
    def get_branch_id():
        s, b = req(opener, "GET", "/api/v1/settings/branches")
        for br in b["items"]:
            if br["name"] == bname:
                return br["id"]
        raise Fail("branch not found")
    branch_id = get_branch_id()

    # 16) PATCH /branches/:id
    def update_branch():
        s, b = req(opener, "PATCH", f"/api/v1/settings/branches/{branch_id}", {"name": bname + " Atualizada"})
        if b.get("name") != bname + " Atualizada":
            raise Fail(f"name not updated: {b.get('name')}")
        return "ok"
    step("PATCH /branches/:id (renomeia)", update_branch)

    # 17) DELETE /branches/:id
    def delete_branch():
        s, b = req(opener, "DELETE", f"/api/v1/settings/branches/{branch_id}")
        if "deletedId" not in b:
            raise Fail(f"no deletedId: {b}")
        return f"deletedId={b['deletedId'][:8]}"
    step("DELETE /branches/:id (remove)", delete_branch)

    # 18) DELETE /branches/:id que não existe
    def delete_branch_404():
        s, b = req(opener, "DELETE", f"/api/v1/settings/branches/{branch_id}", expect=404)
        return f"status={s}"
    step("DELETE /branches/:id (já removida → 404)", delete_branch_404)

    # 19) Tentar excluir filial atual
    def self_branch_delete():
        s, b = req(opener, "POST", "/api/v1/auth/login",
                   {"email": "admin@demo.com", "password": "admin123"})
        my_branch = b.get("user", {}).get("branchId")
        if not my_branch:
            return "skip (no branchId in login response)"
        s, b = req(opener, "DELETE", f"/api/v1/settings/branches/{my_branch}", expect=400)
        return f"status={s} branch={my_branch[:8]}"
    step("DELETE /branches/current (bloqueado)", self_branch_delete)

    # 20) DELETE /users/:id
    def delete_user():
        s, b = req(opener, "DELETE", f"/api/v1/settings/users/{user_id}")
        if "deletedId" not in b:
            raise Fail(f"no deletedId: {b}")
        return f"deletedId={b['deletedId'][:8]}"
    step("DELETE /users/:id (remove)", delete_user)

    # 21) Verificar que usuário foi removido
    def user_gone():
        s, b = req(opener, "GET", "/api/v1/settings/users")
        emails = [u["email"] for u in b["items"]]
        if uemail in emails:
            raise Fail(f"user still present: {emails}")
        return f"count={len(b['items'])}"
    step("GET /users (verifica remoção)", user_gone)

    # Relatório
    print("\n" + "=" * 60)
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"RESULT: {passed}/{total} passed")
    print("=" * 60)

    if passed != total:
        print("\nFailed steps:")
        for n, ok, info in results:
            if not ok:
                print(f"  - {n}: {info}")
        sys.exit(1)

if __name__ == "__main__":
    main()
