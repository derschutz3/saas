"""
Testa o endpoint de ajuste de estoque diretamente.
"""
import urllib.request
import http.cookiejar
import json

BASE = 'http://localhost:3100'

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))


def call(method, path, body=None):
    url = f'{BASE}{path}'
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                  headers={'Content-Type': 'application/json'})
    try:
        resp = opener.open(req, timeout=15)
        return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


# Login
status, _ = call('POST', '/api/v1/auth/login',
                 {'email': 'admin@demo.com', 'password': 'admin123'})
print(f"Login: {status}")

# Pega um produto
status, body = call('GET', '/api/v1/products')
products = json.loads(body).get('items', [])
print(f"Produtos: {len(products)}")
if not products:
    raise SystemExit(1)
p = products[0]
print(f"Usando: {p['name']} ({p['id'][:8]})")

# Tenta ajustar
body = {
    'productId': p['id'],
    'quantity': 5,
    'type': 'out',
    'reason': 'Teste de ajuste via script',
}
print(f"\nPayload: {body}")
status, resp = call('POST', '/api/v1/inventory/adjustments', body)
print(f"\nResultado: {status}")
print(f"Body: {resp[:500]}")
